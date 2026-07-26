/**
 * Clinical custom controls for the Angular JSON Forms engine — the counterparts
 * of the React clinical controls, reading config from `options.omf` and (for
 * interactive ones) writing back via `onChange`. Server-side scoring stays
 * authoritative; scoringMatrix shows a live subtotal only as an aid.
 */

import { Component } from '@angular/core';
import { JsonFormsControl } from '@jsonforms/angular';
import { rankWith } from '@jsonforms/core';
import { FIELD_STYLES } from '../styles';
import { OMF_CONTROL_RANK, omfControlIs, readOmf } from '../testers';

interface ScoringItem { field: string; label?: string; points?: number; }
interface ScoringDomain { name?: string; items?: ScoringItem[]; }

@Component({
  selector: 'omf-scoring-matrix',
  standalone: true,
  template: `
    @if (!hidden) {
      <div class="omf-field">
        <label class="omf-label">{{ label }}</label>
        <table class="omf-table">
          <thead>
            <tr><th>Risk Factor</th><th>Points</th><th>Present</th></tr>
          </thead>
          <tbody>
            @for (domain of domains; track $index) {
              @if (domain.name) {
                <tr><td class="omf-domain" colspan="3"><strong>{{ domain.name }}</strong></td></tr>
              }
              @for (item of domain.items ?? []; track item.field) {
                <tr>
                  <td>{{ item.label ?? item.field }}</td>
                  <td>{{ item.points ?? 0 }}</td>
                  <td>
                    <input
                      type="checkbox"
                      [checked]="isChecked(item.field)"
                      [disabled]="!enabled"
                      (change)="toggle(item.field, $any($event.target).checked)"
                    />
                  </td>
                </tr>
              }
            }
          </tbody>
          <tfoot>
            <tr><td colspan="2"><strong>Subtotal (server recalculates)</strong></td><td><strong>{{ total }}</strong></td></tr>
          </tfoot>
        </table>
      </div>
    }
  `,
  styles: [FIELD_STYLES],
})
export class ScoringMatrixComponent extends JsonFormsControl {
  get domains(): ScoringDomain[] {
    return (readOmf(this.uischema)?.['domains'] as ScoringDomain[] | undefined) ?? [];
  }
  get value(): Record<string, boolean> {
    return (this.data as Record<string, boolean>) ?? {};
  }
  get total(): number {
    let sum = 0;
    for (const d of this.domains) for (const it of d.items ?? []) if (this.value[it.field]) sum += it.points ?? 0;
    return sum;
  }
  isChecked(field: string): boolean {
    return !!this.value[field];
  }
  toggle(field: string, checked: boolean): void {
    this.onChange({ value: { ...this.value, [field]: checked } });
  }
}
export const scoringMatrixTester = rankWith(OMF_CONTROL_RANK, omfControlIs('scoringMatrix'));

@Component({
  selector: 'omf-signature-date',
  standalone: true,
  template: `
    @if (!hidden) {
      <div class="omf-field">
        <label class="omf-label">{{ label }}</label>
        <div class="omf-row">
          <input class="omf-input" type="text" placeholder="Printed name"
            [value]="value.printedName ?? ''" [disabled]="!enabled"
            (input)="update('printedName', $any($event.target).value)" />
          <input class="omf-input" type="date"
            [value]="value.date ?? ''" [disabled]="!enabled"
            (input)="update('date', $any($event.target).value)" />
        </div>
      </div>
    }
  `,
  styles: [FIELD_STYLES],
})
export class SignatureDateComponent extends JsonFormsControl {
  get value(): { printedName?: string; date?: string } {
    return (this.data as { printedName?: string; date?: string }) ?? {};
  }
  update(key: 'printedName' | 'date', val: string): void {
    this.onChange({ value: { ...this.value, [key]: val } });
  }
}
export const signatureDateTester = rankWith(OMF_CONTROL_RANK, omfControlIs('signatureDate'));

interface VitalColumn { key: string; label?: string; }

@Component({
  selector: 'omf-vital-signs-chart',
  standalone: true,
  template: `
    @if (!hidden) {
      <div class="omf-field">
        <label class="omf-label">{{ label }}</label>
        <div style="overflow-x:auto">
          <table class="omf-table">
            <thead>
              <tr>@for (c of columns; track c.key) { <th>{{ c.label ?? c.key }}</th> }</tr>
            </thead>
            <tbody>
              @for (row of rows; track $index) {
                <tr>@for (c of columns; track c.key) { <td>{{ cell(row, c.key) }}</td> }</tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `,
  styles: [FIELD_STYLES],
})
export class VitalSignsChartComponent extends JsonFormsControl {
  get columns(): VitalColumn[] {
    return (readOmf(this.uischema)?.['columns'] as VitalColumn[] | undefined) ?? [];
  }
  get rows(): Record<string, unknown>[] {
    return Array.isArray(this.data) ? (this.data as Record<string, unknown>[]) : [];
  }
  cell(row: Record<string, unknown>, key: string): string {
    return String(row?.[key] ?? '');
  }
}
export const vitalSignsChartTester = rankWith(OMF_CONTROL_RANK, omfControlIs('vitalSignsChart'));

interface MatrixRowCol { key: string; label?: string; }
type MatrixValue = Record<string, Record<string, boolean>>;

@Component({
  selector: 'omf-checklist-matrix',
  standalone: true,
  template: `
    @if (!hidden) {
      <div class="omf-field">
        <label class="omf-label">{{ label }}</label>
        <div style="overflow-x:auto">
          <table class="omf-table">
            <thead>
              <tr>
                <th></th>
                @for (c of columns; track c.key) { <th style="text-align:center">{{ c.label ?? c.key }}</th> }
              </tr>
            </thead>
            <tbody>
              @for (row of rows; track row.key) {
                <tr>
                  <td>{{ row.label ?? row.key }}</td>
                  @for (c of columns; track c.key) {
                    <td style="text-align:center">
                      <input
                        type="checkbox"
                        [checked]="isChecked(row.key, c.key)"
                        [disabled]="!enabled"
                        [attr.aria-label]="(row.label ?? row.key) + ' — ' + (c.label ?? c.key)"
                        (change)="toggle(row.key, c.key, $any($event.target).checked)"
                      />
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `,
  styles: [FIELD_STYLES],
})
export class ChecklistMatrixComponent extends JsonFormsControl {
  get rows(): MatrixRowCol[] {
    return (readOmf(this.uischema)?.['rows'] as MatrixRowCol[] | undefined) ?? [];
  }
  get columns(): MatrixRowCol[] {
    return (readOmf(this.uischema)?.['columns'] as MatrixRowCol[] | undefined) ?? [];
  }
  get value(): MatrixValue {
    return (this.data as MatrixValue) ?? {};
  }
  isChecked(rowKey: string, colKey: string): boolean {
    return !!this.value[rowKey]?.[colKey];
  }
  toggle(rowKey: string, colKey: string, checked: boolean): void {
    const nextRow = { ...(this.value[rowKey] ?? {}), [colKey]: checked };
    if (!checked) delete nextRow[colKey];
    this.onChange({ value: { ...this.value, [rowKey]: nextRow } });
  }
}
export const checklistMatrixTester = rankWith(OMF_CONTROL_RANK, omfControlIs('checklistMatrix'));

interface ColorRow { label?: string; range?: string; color?: string; }

@Component({
  selector: 'omf-color-coded-grid',
  standalone: true,
  template: `
    @if (!hidden) {
      <div class="omf-field">
        <label class="omf-label">{{ label }}</label>
        <table class="omf-table">
          <tbody>
            @for (row of rows; track $index) {
              <tr [style.background]="row.color ?? '#ffffff'">
                <td>{{ row.label ?? '' }}</td><td>{{ row.range ?? '' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [FIELD_STYLES],
})
export class ColorCodedGridComponent extends JsonFormsControl {
  get rows(): ColorRow[] {
    return (readOmf(this.uischema)?.['rows'] as ColorRow[] | undefined) ?? [];
  }
}
export const colorCodedGridTester = rankWith(OMF_CONTROL_RANK, omfControlIs('colorCodedGrid'));

@Component({
  selector: 'omf-clinical-reference-table',
  standalone: true,
  template: `
    @if (!hidden) {
      <div class="omf-field">
        <label class="omf-label">{{ label }}</label>
        <table class="omf-table">
          <thead>
            <tr>@for (h of headers; track h) { <th>{{ h }}</th> }</tr>
          </thead>
          <tbody>
            @for (row of tableRows; track $index) {
              <tr>@for (cell of row; track $index) { <td>{{ cell }}</td> }</tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [FIELD_STYLES],
})
export class ClinicalReferenceTableComponent extends JsonFormsControl {
  get headers(): string[] {
    return (readOmf(this.uischema)?.['headers'] as string[] | undefined) ?? [];
  }
  get tableRows(): string[][] {
    return (readOmf(this.uischema)?.['rows'] as string[][] | undefined) ?? [];
  }
}
export const clinicalReferenceTableTester = rankWith(OMF_CONTROL_RANK, omfControlIs('clinicalReferenceTable'));

@Component({
  selector: 'omf-risk-stratification',
  standalone: true,
  template: `
    @if (!hidden) {
      <div class="omf-field">
        <label class="omf-label">{{ label }}</label>
        <div class="omf-domain" style="padding: var(--omf-control-padding, 8px); border: var(--omf-border-width,1px) solid var(--omf-color-border,#c8cdd4); border-radius: var(--omf-border-radius,4px);">
          {{ risk }}
        </div>
      </div>
    }
  `,
  styles: [FIELD_STYLES],
})
export class RiskStratificationComponent extends JsonFormsControl {
  get risk(): string {
    return this.data == null || this.data === '' ? 'Calculated on submission' : String(this.data);
  }
}
export const riskStratificationTester = rankWith(OMF_CONTROL_RANK, omfControlIs('riskStratification'));
