/**
 * Angular counterparts of the React `recordTable` control and `OmfTabsLayout`.
 *
 * Same contract, same markup shape and same design tokens as
 * packages/react-form-renderer/src/engine/jsonforms/renderers/record-table.tsx,
 * so one FormDefinition renders equivalently in both frameworks. See that file
 * for why the pattern exists (a repeating clinical encounter log whose table is
 * only a summary, with the real form behind each row).
 *
 * CHANGE DETECTION: both components are OnPush, consistent with the other
 * layouts. Their own state (which row is expanded, which tab is active) is
 * mutated by template event handlers, which mark the component dirty; the record
 * data itself arrives through the JSON Forms props pipeline.
 */

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { JsonFormsArrayControl, JsonFormsOutlet } from '@jsonforms/angular';
import {
  Generate,
  type JsonSchema,
  type OwnPropsOfRenderer,
  type UISchemaElement,
} from '@jsonforms/core';
import {
  createRecordDefault,
  deriveRecordColumns,
  fieldsOutsideColumns,
  isColumnEditable,
  recordCellText,
  recordCountText,
  type RecordTableColumn,
  type RecordTableConfig,
} from '@openmedform/form-core';
import { FIELD_STYLES } from '../styles';
export { recordTableTester, omfTabsTester } from '../testers';
import { readOmf } from '../point-value';
import { OmfLayoutBase } from './layouts';

// Summary-cell derivation, record seeding and the count line all come from
// form-core, shared verbatim with the React control, so one FormDefinition
// cannot read differently in an EMR than in the web preview.

@Component({
  selector: 'omf-record-table',
  standalone: true,
  imports: [JsonFormsOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="omf-record-table">
      <div class="omf-record-toolbar">
        <span class="omf-record-count">{{ countText }}</span>
        <button type="button" class="omf-record-add" [disabled]="!isEnabled()" (click)="addRecord()">
          {{ addLabel }}
        </button>
      </div>

      <div class="omf-scroll-x">
        @if (byColumn) {
          <!-- Records as COLUMNS: field labels down the left, one column per
               record — mirrors paper charts that compare instances side by
               side. Same data as row mode; only the axes swap. -->
          @if (records.length === 0) {
            <p class="omf-record-empty">{{ emptyLabel }}</p>
          } @else {
            <table class="omf-record-grid">
              <thead>
                <tr>
                  <th class="omf-record-param-col">Parameter</th>
                  @for (record of records; track $index) {
                    <th>{{ instanceLabel }} {{ $index + 1 }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (col of columns; track col.label) {
                  <tr>
                    <td class="omf-record-param-cell">{{ col.label }}</td>
                    @for (record of records; track $index) {
                      <td
                        [style.text-align]="col.align || 'left'"
                        [class.omf-record-open]="openIndex === $index"
                      >
                        {{ cellText(record, col) }}
                      </td>
                    }
                  </tr>
                }
                <tr>
                  <td class="omf-record-param-cell"></td>
                  @for (record of records; track $index) {
                    <td class="omf-record-actions">
                      <button
                        type="button"
                        class="omf-record-toggle"
                        [attr.aria-expanded]="openIndex === $index"
                        (click)="toggle($index)"
                      >
                        {{ openIndex === $index ? 'Close' : 'Open' }}
                      </button>
                      @if (isEnabled()) {
                        <button
                          type="button"
                          class="omf-record-remove"
                          [attr.aria-label]="'Remove record ' + ($index + 1)"
                          (click)="removeRecord($index)"
                        >
                          ✕
                        </button>
                      }
                    </td>
                  }
                </tr>
                @if (openIndex !== null && openIndex < records.length) {
                  <tr>
                    <td class="omf-record-detail" [attr.colspan]="records.length + 1">
                      <jsonforms-outlet [renderProps]="detailProps(openIndex)"></jsonforms-outlet>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        } @else {
        <table class="omf-record-grid">
          <thead>
            <tr>
              @for (col of columns; track $index) {
                <th [style.width]="col.width" [style.text-align]="col.align || 'left'">
                  {{ col.label }}
                </th>
              }
              <th class="omf-record-actions-col"></th>
            </tr>
          </thead>
          <tbody>
            @if (records.length === 0) {
              <tr>
                <td class="omf-record-empty" [attr.colspan]="columns.length + 1">
                  {{ emptyLabel }}
                </td>
              </tr>
            }
            @for (record of records; track $index) {
              <tr [class.omf-record-open]="openIndex === $index">
                @for (col of columns; track col.label) {
                  <td [style.text-align]="col.align || 'left'">
                    <!-- A column naming one field is edited in place, as on the
                         source grid. Derived columns (countOf / pairWith) have
                         no single value to write back, so they stay text. -->
                    @if (editable(col)) {
                      <jsonforms-outlet
                        [renderProps]="cellProps($index, col)"
                      ></jsonforms-outlet>
                    } @else {
                      {{ cellText(record, col) }}
                    }
                  </td>
                }
                <td class="omf-record-actions omf-record-actions-sticky">
                  @if (hasDetail) {
                    <button
                      type="button"
                      class="omf-record-toggle"
                      [attr.aria-expanded]="openIndex === $index"
                      (click)="toggle($index)"
                    >
                      {{ openIndex === $index ? 'Close' : 'Open' }}
                    </button>
                  }
                  @if (isEnabled()) {
                    <button
                      type="button"
                      class="omf-record-remove"
                      [attr.aria-label]="'Remove record ' + ($index + 1)"
                      (click)="removeRecord($index)"
                    >
                      ✕
                    </button>
                  }
                </td>
              </tr>
              @if (openIndex === $index) {
                <tr>
                  <td class="omf-record-detail" [attr.colspan]="columns.length + 1">
                    <jsonforms-outlet [renderProps]="detailProps($index)"></jsonforms-outlet>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
        }
      </div>
    </div>
  `,
  styles: [FIELD_STYLES],
})
export class RecordTableComponent extends JsonFormsArrayControl {
  openIndex: number | null = null;

  // Stable render-props per row index, so the <jsonforms-outlet> @Input setter
  // does not re-dispatch the whole detail panel on every change-detection pass.
  private readonly detailCache = new Map<number, OwnPropsOfRenderer>();

  private get config(): RecordTableConfig {
    return (readOmf(this.uischema)?.['recordTable'] ?? {}) as RecordTableConfig;
  }

  /** Noun heading each record column, e.g. 'Cannula' -> "Cannula 1". */
  get instanceLabel(): string {
    return this.config.instanceLabel ?? 'Record';
  }

  /** True when records should run across as columns rather than down as rows. */
  get byColumn(): boolean {
    return this.config.orientation === 'columns';
  }

  get columns(): RecordTableColumn[] {
    const configured = this.config.columns;
    if (configured?.length) return configured;
    // Unconfigured array: derive a usable table rather than falling back to the
    // stock list widget. Cached because Angular calls getters every CD pass.
    if (!this.derivedColumns) {
      this.derivedColumns = deriveRecordColumns(this.itemSchema as never);
    }
    return this.derivedColumns;
  }
  private derivedColumns?: RecordTableColumn[];

  get records(): unknown[] {
    return Array.isArray(this.data) ? (this.data as unknown[]) : [];
  }

  get addLabel(): string {
    return this.config.addLabel ?? `+ Add ${this.label || 'record'}`;
  }

  get emptyLabel(): string {
    return this.config.emptyLabel ?? 'No records yet.';
  }

  get countText(): string {
    return recordCountText(this.config.countLabel, this.records.length);
  }

  /** Delegates to form-core so React and Angular derive cells identically. */
  cellText(record: unknown, col: RecordTableColumn): string {
    return recordCellText(record, col);
  }

  /** True when this column maps to one concrete field and can be edited inline. */
  editable(col: RecordTableColumn): boolean {
    return isColumnEditable(col);
  }

  /**
   * False when every field is already a column, so a detail panel would be
   * empty and its Open button pointless.
   */
  get hasDetail(): boolean {
    return fieldsOutsideColumns(this.itemSchema as never, this.columns).length > 0;
  }

  // Stable render-props per (row, column), so the outlet does not re-dispatch
  // the cell control on every change-detection pass.
  private readonly cellCache = new Map<string, OwnPropsOfRenderer>();

  /** Render props for one editable cell's real control. */
  cellProps(index: number, col: RecordTableColumn): OwnPropsOfRenderer {
    const key = `${index}::${col.path}`;
    let cached = this.cellCache.get(key);
    if (!cached) {
      cached = {
        uischema: {
          type: 'Control',
          scope: `#/properties/${(col.path ?? '').split('.').join('/properties/')}`,
          label: false,
        } as unknown as UISchemaElement,
        schema: this.itemSchema,
        path: `${this.propsPath}.${index}`,
      };
      this.cellCache.set(key, cached);
    }
    return cached;
  }

  toggle(index: number): void {
    this.openIndex = this.openIndex === index ? null : index;
  }

  addRecord(): void {
    const next = [...this.records, createRecordDefault(this.itemSchema)];
    this.onChange({ value: next });
    // The new record is appended, so it is the one to open.
    this.openIndex = next.length - 1;
  }

  removeRecord(index: number): void {
    const confirmText = this.config.removeConfirm;
    if (confirmText && !window.confirm(confirmText)) return;
    const next = this.records.filter((_, i) => i !== index);
    this.detailCache.clear();
    this.cellCache.clear();
    this.onChange({ value: next });
    if (this.openIndex === index) this.openIndex = null;
    else if (this.openIndex !== null && this.openIndex > index) this.openIndex -= 1;
  }

  detailProps(index: number): OwnPropsOfRenderer {
    let cached = this.detailCache.get(index);
    if (!cached) {
      cached = {
        uischema: this.detailUiSchema,
        schema: this.itemSchema,
        path: `${this.propsPath}.${index}`,
      };
      this.detailCache.set(index, cached);
    }
    return cached;
  }

  private get itemSchema(): JsonSchema | undefined {
    const items = this.scopedSchema?.items;
    return Array.isArray(items) ? (items[0] as JsonSchema) : (items as JsonSchema | undefined);
  }

  /**
   * The per-record UI schema: `options.detail` when the author supplied one,
   * otherwise a generated layout so the control degrades rather than blanks.
   */
  private get detailUiSchema(): UISchemaElement {
    const detail = (this.uischema?.options as { detail?: UISchemaElement } | undefined)?.detail;
    if (detail) return detail;
    return Generate.uiSchema(this.itemSchema ?? {}, 'VerticalLayout') as UISchemaElement;
  }
}



@Component({
  selector: 'omf-tabs-layout',
  standalone: true,
  imports: [JsonFormsOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="omf-tabs">
      <div class="omf-tablist" role="tablist">
        @for (page of elements; track $index) {
          <button
            type="button"
            role="tab"
            class="omf-tab"
            [class.omf-tab-active]="$index === activeIndex"
            [attr.aria-selected]="$index === activeIndex"
            (click)="activeIndex = $index"
          >
            {{ tabTitle(page, $index) }}
          </button>
        }
      </div>
      <div role="tabpanel">
        @if (activePage) {
          <jsonforms-outlet [renderProps]="childProps(activePage)"></jsonforms-outlet>
        }
      </div>
    </div>
  `,
  styles: [FIELD_STYLES],
})
export class OmfTabsLayoutComponent extends OmfLayoutBase {
  activeIndex = 0;

  // Pre-stripped copies keyed by the original element, so the reference handed
  // to childProps() is stable across change detection (a fresh spread on every
  // call would defeat that cache and re-dispatch the page each pass).
  private readonly stripped = new Map<UISchemaElement, UISchemaElement>();

  tabTitle(element: UISchemaElement, index: number): string {
    const label = (element as { label?: string | boolean }).label;
    return typeof label === 'string' && label.trim() ? label : `Section ${index + 1}`;
  }

  /**
   * The active page only — an inactive tab is not rendered at all, so a large
   * record does not pay the layout cost of every tab on every keystroke. The
   * page's own label is already the tab title, so suppress it to avoid a heading
   * that repeats the tab the user just clicked.
   */
  get activePage(): UISchemaElement | undefined {
    const pages = this.elements;
    if (pages.length === 0) return undefined;
    const page = pages[Math.min(this.activeIndex, pages.length - 1)];
    let copy = this.stripped.get(page);
    if (!copy) {
      copy = { ...page, label: false } as unknown as UISchemaElement;
      this.stripped.set(page, copy);
    }
    return copy;
  }
}


