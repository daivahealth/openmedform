/**
 * Layout renderers — VerticalLayout, HorizontalLayout, Group, Label.
 *
 * Each iterates its child UI elements and dispatches them through
 * `<jsonforms-outlet>`, which resolves the right renderer via the registered
 * testers (same dispatch model as the React tree). Spacing/typography come from
 * the shared design tokens, so a two-column HorizontalLayout matches React.
 *
 * CHANGE DETECTION: these containers use OnPush. On a large clinical form this
 * is the difference between re-checking the WHOLE tree on every keystroke and
 * re-checking only the path from root to the edited control. It is safe because:
 * - the edited control's own DOM event marks its path to root dirty, so the
 *   active field always re-renders;
 * - the only containers with live, data-driven state (scored Group subtotals and
 *   the score summary) subscribe to the store and call markForCheck themselves;
 * - `childProps` returns a memoized reference so re-checks don't churn outlets.
 * - OmfTableLayout subscribes to the store when any of its ROWS carries a rule,
 *   because a row is the layout itself and never reaches an outlet that could
 *   resolve the rule for it.
 * Known limitation: JSON Forms `rule`-driven visibility/enablement or cross-field
 * validation on a NON-edited leaf CONTROL in a sibling branch may not refresh
 * until that control is next interacted with (the @jsonforms/angular base
 * control does not markForCheck). Containers — layouts, groups and table rows —
 * are covered by the subscriptions above.
 */

import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Directive,
  inject,
  type OnDestroy,
  type OnInit,
} from '@angular/core';
import { JsonFormsAngularService, JsonFormsOutlet } from '@jsonforms/angular';
import {
  and,
  type Layout,
  type LabelElement,
  type OwnPropsOfRenderer,
  rankWith,
  uiTypeIs,
  type UISchemaElement,
} from '@jsonforms/core';
import {
  collectScoreItems,
  showsSectionSubtotal,
  elementBands,
  computeScore,
  filterVisibleElements,
  hasElementRules,
  type VisibleElement,
} from '@openmedform/form-core';
import type { UiRule } from '@openmedform/form-schema-types';
import { distinctUntilChanged, map, type Subscription } from 'rxjs';
import { FIELD_STYLES } from '../styles';
import { RuleAwareRenderer } from '../rule-visibility';
import { STANDARD_RANK } from '../testers';
import { pointColor, readOmf } from '../point-value';

/**
 * Shared base: exposes the child elements, builds outlet render props, and
 * honours a SHOW/HIDE rule on the layout itself (see RuleAwareRenderer).
 */
@Directive()
export abstract class OmfLayoutBase extends RuleAwareRenderer<Layout> {
  // Cache the render-props object per child element so the same reference is
  // returned across change-detection passes. The <jsonforms-outlet> [renderProps]
  // @Input setter only fires when the bound value's reference changes, so a
  // stable reference stops container re-checks (esp. under OnPush, when a scored
  // group re-checks on a subtotal update) from re-running the outlet's dispatch.
  private readonly propsCache = new Map<UISchemaElement, OwnPropsOfRenderer>();
  private cacheKey?: string;

  get elements(): UISchemaElement[] {
    return this.uischema?.elements ?? [];
  }

  childProps(element: UISchemaElement): OwnPropsOfRenderer {
    // Invalidate if this layout instance is reused for a different scope/schema.
    const key = `${this.path ?? ''}`;
    if (key !== this.cacheKey) {
      this.propsCache.clear();
      this.cacheKey = key;
    }
    let cached = this.propsCache.get(element);
    if (!cached) {
      cached = { uischema: element, schema: this.schema, path: this.path };
      this.propsCache.set(element, cached);
    }
    return cached;
  }
}

@Component({
  selector: 'omf-vertical-layout',
  standalone: true,
  imports: [JsonFormsOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible) {
      <div class="omf-vertical">
        @for (element of elements; track $index) {
          <jsonforms-outlet [renderProps]="childProps(element)"></jsonforms-outlet>
        }
      </div>
    }
  `,
  styles: [FIELD_STYLES],
})
export class VerticalLayoutComponent extends OmfLayoutBase {}
export const verticalLayoutTester = rankWith(STANDARD_RANK, uiTypeIs('VerticalLayout'));

@Component({
  selector: 'omf-horizontal-layout',
  standalone: true,
  imports: [JsonFormsOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible) {
      <div class="omf-row">
        @for (element of elements; track $index) {
          <div class="omf-col">
            <jsonforms-outlet [renderProps]="childProps(element)"></jsonforms-outlet>
          </div>
        }
      </div>
    }
  `,
  styles: [FIELD_STYLES],
})
export class HorizontalLayoutComponent extends OmfLayoutBase {}
export const horizontalLayoutTester = rankWith(STANDARD_RANK, uiTypeIs('HorizontalLayout'));

@Component({
  selector: 'omf-group-layout',
  standalone: true,
  imports: [JsonFormsOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible) {
    @if (isSubsection) {
      <div class="omf-subsection">
        @if (groupLabel) { <div class="omf-subsection-title">{{ groupLabel }}</div> }
        <div class="omf-subsection-body" [style.border-left-color]="accentColor || '#c8cdd4'">
          @for (element of elements; track $index) {
            <jsonforms-outlet [renderProps]="childProps(element)"></jsonforms-outlet>
          }
        </div>
      </div>
    } @else {
      <div class="omf-group" [style.border-color]="accentColor">
        @if (groupLabel) {
          <div class="omf-group-header" [style.color]="accentColor" [style.border-bottom-color]="accentColor">
            @if (icon) { <span class="omf-icon">{{ icon }}</span> }
            <span class="omf-group-title">{{ groupLabel }}</span>
            @if (legend.length) {
              <span class="omf-legend">
                @for (p of legend; track p) {
                  <span class="omf-point-badge" [style.color]="badgeFg(p)" [style.background]="badgeBg(p)">{{ p }}</span>
                }
              </span>
            }
            @if (subtotal !== null) {
              <span class="omf-point-badge" [style.color]="accentColor || '#3a4552'" title="Section subtotal">Σ {{ subtotal }}</span>
            }
            @if (riskLabel) {
              <span
                class="omf-point-badge"
                [style.color]="riskColor || '#3a4552'"
                [style.border-color]="riskColor || null"
                title="Section result"
              >{{ riskLabel }}</span>
            }
          </div>
        }
        <div class="omf-group-body">
          @for (element of elements; track $index) {
            <jsonforms-outlet [renderProps]="childProps(element)"></jsonforms-outlet>
          }
        </div>
      </div>
    }
    }
  `,
  styles: [
    FIELD_STYLES,
    `
    .omf-subsection { margin-bottom: var(--omf-section-gap, 20px); }
    .omf-subsection-title { font-weight: var(--omf-label-weight, 600); font-size: var(--omf-font-size-label, 13px); color: var(--omf-color-label, #3a4552); margin-bottom: var(--omf-field-gap, 12px); }
    .omf-subsection-body { margin-left: var(--omf-subsection-indent, 20px); border-left: 2px solid #c8cdd4; padding-left: var(--omf-control-padding, 8px); }
    `,
  ],
})
export class GroupLayoutComponent extends OmfLayoutBase implements OnInit, OnDestroy {
  private readonly jsonForms = inject(JsonFormsAngularService);
  private readonly cdr = inject(ChangeDetectorRef);
  private sub?: Subscription;
  /** Live section subtotal; null when this box has no scored descendants. */
  subtotal: number | null = null;
  /**
   * Verdict for this section's own subtotal, from `omf.bands` on the Group —
   * qSOFA is positive at >= 2 of 3, SIRS at >= 2 of 4, and a form-level
   * scoreSummary would add them into a number that means nothing. Null when the
   * section declares no bands, leaving the chip as the number alone.
   */
  riskLabel: string | null = null;
  riskColor: string | null = null;

  get groupLabel(): string {
    const l = (this.uischema as { label?: unknown })?.label;
    return typeof l === 'string' ? l : '';
  }
  get isSubsection(): boolean {
    return readOmf(this.uischema)?.['variant'] === 'subsection';
  }
  get accentColor(): string | null {
    const c = readOmf(this.uischema)?.['accentColor'];
    return typeof c === 'string' ? c : null;
  }
  get icon(): string | null {
    const i = readOmf(this.uischema)?.['icon'];
    if (typeof i !== 'string') return null;
    // Avoid a double glyph when the AI also embedded the icon in the label text.
    const rawLabel = (this.uischema as { label?: unknown })?.label;
    const label = typeof rawLabel === 'string' ? rawLabel : '';
    return label.includes(i) ? null : i;
  }
  get legend(): number[] {
    const l = readOmf(this.uischema)?.['pointLegend'];
    return Array.isArray(l) ? (l as number[]) : [];
  }
  badgeFg(points: number): string {
    return pointColor(points).fg;
  }
  badgeBg(points: number): string {
    return pointColor(points).bg;
  }

  ngOnInit(): void {
    super.ngOnInit(); // rule subscription
    // Only the section a total BELONGS to computes one — the innermost scoring
    // box, unless the definition overrides it (see showsSectionSubtotal). An
    // ancestor of scoring sections used to draw a Σ of its children's points,
    // which no paper form does.
    const items =
      this.uischema && showsSectionSubtotal(this.uischema as never)
        ? collectScoreItems(this.uischema as never)
        : [];
    if (items.length === 0) return; // boxes with no total of their own never subscribe.
    const bands = elementBands(this.uischema as never);
    // Recompute the subtotal only when the response data changes — not on every
    // $state emission (validation/config/focus), which multiplied across every
    // scored group was a perf hot-spot.
    this.sub = this.jsonForms.$state
      .pipe(
        map((state) => state?.jsonforms?.core?.data),
        distinctUntilChanged(),
      )
      .subscribe((data) => {
        const score = computeScore(items, data ?? {}, bands);
        this.subtotal = score.total;
        this.riskLabel = score.riskLabel ?? null;
        this.riskColor = score.riskColor ?? null;
        this.cdr.markForCheck(); // OnPush: the async subtotal update must mark the view.
      });
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.sub?.unsubscribe();
  }
}
export const groupTester = rankWith(STANDARD_RANK, uiTypeIs('Group'));

@Component({
  selector: 'omf-label',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // white-space: pre-line preserves the source line breaks so a multi-line /
  // dash-bulleted instruction block stays one item per line (matching the paper)
  // instead of collapsing into a single run-on line. See the React OmfLabel.
  template: `@if (visible) { <p class="omf-group-title" style="white-space: pre-line">{{ text }}</p> }`,
  styles: [FIELD_STYLES],
})
export class LabelComponent extends RuleAwareRenderer<LabelElement> {
  get text(): string {
    return this.uischema?.text ?? '';
  }
}
export const labelTester = rankWith(STANDARD_RANK, and(uiTypeIs('Label')));

interface OmfTableColumn {
  label?: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

interface OmfTableRowShape {
  label?: string;
  elements?: UISchemaElement[];
  /**
   * A row may carry a JSON Forms rule of its own, so a table can reveal rows in
   * turn (CAM-ICU: assess Feature 2 only once Feature 1 is present). The row is
   * the layout here — it never reaches a <jsonforms-outlet> — so the rule is
   * evaluated by form-core below rather than by the framework.
   */
  rule?: UiRule;
}

/**
 * OmfTableLayout — the Angular counterpart of the React table renderer.
 *
 * Two modes, matching React exactly:
 * - With `options.omf.columns`, a real grid: a header row from the column
 *   labels and ONE cell per child, so an N-column sign-off/checklist table
 *   looks like its paper or HTML source. Cell controls do not repeat their own
 *   label — the column header already names them.
 * - Without columns, the original two-cell layout (shaded row label | contents)
 *   used by left-label tables.
 *
 * A wide table scrolls inside its own container rather than pushing the host
 * page sideways (see `.omf-scroll-x` / `min-width: 0`).
 */
@Component({
  selector: 'omf-table-layout',
  standalone: true,
  imports: [JsonFormsOutlet],
  template: `
    @if (visible) {
    <div class="omf-scroll-x">
      <table class="omf-grid" [class.omf-grid-auto]="hasColumns">
        @if (hasColumns) {
          <thead>
            <tr>
              @for (col of columns; track $index) {
                <th
                  scope="col"
                  [style.width]="col.width || null"
                  [style.min-width]="col.width ? null : 'var(--omf-table-col-min, 130px)'"
                  [style.text-align]="col.align || 'left'"
                >{{ col.label || '' }}</th>
              }
            </tr>
          </thead>
        }
        <tbody>
          @for (entry of visibleRows; track entry.index) {
            <tr>
              @if (hasColumns) {
                @if (entry.element.label !== undefined) {
                  <td class="omf-row-label">{{ entry.element.label }}</td>
                }
                @for (element of entry.element.elements ?? []; track $index) {
                  <td class="omf-table-cell" [style.text-align]="cellAlign(entry.element, $index)">
                    <jsonforms-outlet
                      [renderProps]="cellProps(element, true, entry.enabled)"
                    ></jsonforms-outlet>
                  </td>
                }
              } @else {
                <td class="omf-row-label omf-row-label-shaded">{{ entry.element.label }}</td>
                <td class="omf-table-stack">
                  @for (element of entry.element.elements ?? []; track $index) {
                    <jsonforms-outlet
                      [renderProps]="cellProps(element, false, entry.enabled)"
                    ></jsonforms-outlet>
                  }
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
    }
  `,
  styles: [
    FIELD_STYLES,
    `
    .omf-scroll-x { overflow-x: auto; min-width: 0; max-width: 100%; margin-bottom: var(--omf-section-gap, 20px); }
    .omf-grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .omf-grid.omf-grid-auto { table-layout: auto; }
    .omf-grid th, .omf-grid td {
      border: var(--omf-border-width, 1px) solid var(--omf-color-border, #c8cdd4);
      padding: var(--omf-control-padding, 8px);
      vertical-align: middle;
    }
    .omf-grid th {
      background: var(--omf-color-section-bg, #f7f8fa);
      font-weight: var(--omf-label-weight, 600);
      font-size: var(--omf-font-size-label, 13px);
      color: var(--omf-color-label, #3a4552);
      text-align: left;
      white-space: nowrap;
    }
    .omf-row-label {
      font-weight: var(--omf-label-weight, 600);
      font-size: var(--omf-font-size-label, 13px);
      color: var(--omf-color-label, #3a4552);
    }
    .omf-row-label-shaded {
      background: var(--omf-color-section-bg, #f7f8fa);
      width: var(--omf-table-label-width, 16%);
      vertical-align: top;
    }
    .omf-table-stack { vertical-align: top; }
    /* Keep rows as tight as the source table. */
    .omf-table-cell ::ng-deep .omf-field { margin-bottom: 0; }
    `,
  ],
})
export class OmfTableLayoutComponent extends OmfLayoutBase implements OnInit, OnDestroy {
  private readonly tableForms = inject(JsonFormsAngularService);
  private readonly tableCdr = inject(ChangeDetectorRef);
  private rowSub?: Subscription;

  /**
   * Cached per (element, stripLabel, enabled). The <jsonforms-outlet>
   * [renderProps] setter only fires on reference change, so a stable object
   * keeps a re-check from re-running the outlet's dispatch — while a row whose
   * rule just disabled it still gets a new reference and re-dispatches.
   */
  private readonly cellCache = new Map<UISchemaElement, Map<string, OwnPropsOfRenderer>>();

  /** Rows surviving their own rules, with their original index for tracking. */
  visibleRows: VisibleElement<OmfTableRowShape>[] = [];

  override ngOnInit(): void {
    // The layout's own rule (RuleAwareRenderer) is independent of its rows'.
    super.ngOnInit();
    this.visibleRows = filterVisibleElements(this.rows, {}, this.ruleEnabled);
    // No row carries a rule on most tables; skip the state subscription there.
    if (!hasElementRules(this.rows)) return;

    this.rowSub = this.tableForms.$state
      .pipe(
        map((state) => state?.jsonforms?.core?.data),
        distinctUntilChanged(),
      )
      .subscribe((data) => {
        const next = filterVisibleElements(this.rows, data ?? {}, this.ruleEnabled);
        if (rowSignature(next) === rowSignature(this.visibleRows)) return;
        this.visibleRows = next;
        this.tableCdr.markForCheck();
      });
  }

  override ngOnDestroy(): void {
    this.rowSub?.unsubscribe();
    super.ngOnDestroy();
  }

  get columns(): OmfTableColumn[] {
    const c = readOmf(this.uischema)?.['columns'];
    return Array.isArray(c) ? (c as OmfTableColumn[]) : [];
  }
  get hasColumns(): boolean {
    return this.columns.length > 0;
  }
  get rows(): OmfTableRowShape[] {
    return (this.uischema?.elements ?? []) as unknown as OmfTableRowShape[];
  }
  cellAlign(row: OmfTableRowShape, index: number): string {
    return this.columns[index + (row.label !== undefined ? 1 : 0)]?.align ?? 'left';
  }
  /** Suppress the control's own label in column mode; the header names it. */
  cellProps(
    element: UISchemaElement,
    stripLabel: boolean,
    enabled: boolean,
  ): OwnPropsOfRenderer {
    let byFlags = this.cellCache.get(element);
    if (!byFlags) {
      byFlags = new Map();
      this.cellCache.set(element, byFlags);
    }
    const key = `${this.path ?? ''}|${stripLabel ? 1 : 0}|${enabled ? 1 : 0}`;
    let cached = byFlags.get(key);
    if (!cached) {
      cached = {
        uischema: stripLabel
          ? ({ ...element, label: false } as unknown as UISchemaElement)
          : element,
        schema: this.schema,
        path: this.path,
        enabled,
      };
      byFlags.set(key, cached);
    }
    return cached;
  }
}

/** Cheap identity for a resolved row set, so an unchanged one is not re-assigned. */
function rowSignature(rows: VisibleElement<OmfTableRowShape>[]): string {
  return rows.map((r) => `${r.index}:${r.enabled ? 1 : 0}`).join(',');
}
export const omfTableTester = rankWith(STANDARD_RANK, uiTypeIs('OmfTableLayout'));
