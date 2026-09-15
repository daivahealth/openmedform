/**
 * <omf-flowsheet> — parameters down the left, one column per occurrence
 * across the top, newest first (ADR-005 §4). The Angular twin of the React
 * `Flowsheet`: both draw form-core's `buildFlowsheet` model, so twelve separate
 * responses and one recordTable-column response produce the same table in
 * either framework.
 */

import { ChangeDetectionStrategy, Component, Input, type OnChanges } from '@angular/core';
import type { FormDefinitionSchemas, HistoryEntry, Observation } from '@openmedform/form-schema-types';
import {
  buildFlowsheet,
  formatClock,
  formatDay,
  formatObservationValue,
  projectObservations,
  sameDay,
  type Flowsheet,
} from '@openmedform/form-core';
import { FLOWSHEET_STYLES, tokenStyleObject } from './styles';

@Component({
  selector: 'omf-flowsheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="omf-flowsheet" [style]="tokenStyle">
      @if (title) { <h3 class="omf-flowsheet-title">{{ title }}</h3> }
      @if (sheet.columns.length === 0) {
        <p class="omf-flowsheet-empty">{{ emptyLabel }}</p>
      } @else {
        <div class="omf-scroll-x">
          <table class="omf-flowsheet-grid">
            <thead>
              <tr>
                <th scope="col" class="omf-flowsheet-param">Parameter</th>
                @for (col of sheet.columns; track col.effectiveAt) {
                  <th scope="col" class="omf-flowsheet-col" [title]="col.effectiveAt">
                    <div>{{ clock(col.effectiveAt) }}</div>
                    @if (multiDay) { <div class="omf-flowsheet-sub">{{ day(col.effectiveAt) }}</div> }
                    @if (col.authors.length) { <div class="omf-flowsheet-sub omf-flowsheet-author">{{ col.authors.join(', ') }}</div> }
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (section of sheet.sections; track $index) {
                @if (section.label) {
                  <tr class="omf-flowsheet-section">
                    <th scope="rowgroup" [attr.colspan]="sheet.columns.length + 1">{{ section.label }}</th>
                  </tr>
                }
                @for (row of section.rows; track row.key) {
                  <tr class="omf-flowsheet-row">
                    <th scope="row" class="omf-flowsheet-param">
                      {{ row.label }}
                      @if (row.unit && !row.mixedUnits) { <span class="omf-flowsheet-unit">{{ row.unit }}</span> }
                    </th>
                    @for (cell of row.cells; track $index) {
                      <td>
                        @for (o of cell.superseded; track $index) {
                          <s class="omf-flowsheet-superseded" title="Superseded">{{ text(o, row.mixedUnits) }}</s>
                        }
                        {{ cell.text }}
                      </td>
                    }
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [FLOWSHEET_STYLES],
})
export class FlowsheetComponent implements OnChanges {
  @Input({ required: true }) definition!: FormDefinitionSchemas;
  /** Prior fills as the host stored them; projected against their own definition. */
  @Input() entries: HistoryEntry[] | undefined;
  /** Already-projected readings (e.g. from the host's FHIR store). May be combined with `entries`. */
  @Input() observations: Observation[] | undefined;
  /** Newest N columns only. Default: all. */
  @Input() maxColumns: number | undefined;
  /** Keep rows for fields with no readings (a blank chart). Default false. */
  @Input() includeEmptyRows = false;
  @Input() title: string | undefined;
  /** Shown when there is nothing to chart. */
  @Input() emptyLabel = 'No previous readings';
  /** IANA time zone for the column clocks. Default: the viewer's. */
  @Input() timeZone: string | undefined;

  readonly tokenStyle: Record<string, string> = tokenStyleObject;
  sheet: Flowsheet = { columns: [], sections: [] };
  multiDay = false;

  ngOnChanges(): void {
    const all: Observation[] = [...(this.observations ?? [])];
    for (const e of this.entries ?? []) {
      const source = { ...(e.author ? { author: e.author } : {}), ...(e.source ?? {}) };
      all.push(
        ...projectObservations(e.definition ?? this.definition, e.data, {
          effectiveAt: e.effectiveAt,
          ...(Object.keys(source).length > 0 ? { source } : {}),
        }),
      );
    }
    this.sheet = buildFlowsheet(this.definition, all, {
      maxColumns: this.maxColumns,
      includeEmptyRows: this.includeEmptyRows,
    });
    const cols = this.sheet.columns;
    this.multiDay =
      cols.length > 1 && !cols.every((c) => sameDay(c.effectiveAt, cols[0].effectiveAt, this.clockOpts));
  }

  private get clockOpts(): { timeZone?: string } {
    return this.timeZone ? { timeZone: this.timeZone } : {};
  }
  clock(iso: string): string {
    return formatClock(iso, this.clockOpts);
  }
  day(iso: string): string {
    return formatDay(iso, this.clockOpts);
  }
  text(o: Observation, withUnit: boolean): string {
    return formatObservationValue(o, { unit: withUnit });
  }
}
