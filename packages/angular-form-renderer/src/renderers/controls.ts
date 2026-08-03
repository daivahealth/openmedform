/**
 * Standard control renderers — text, number, boolean, enum, date.
 *
 * Each extends @jsonforms/angular's JsonFormsControl (which supplies `data`,
 * `label`, `error`, `scopedSchema`, `enabled`, `id`) and pushes edits back with
 * `onChange({ value })`. Markup is token-styled so it matches the React vanilla
 * controls' geometry. omf/clinical controls register at a higher rank and win
 * for elements that opt in via `options.omf.control`.
 */

import { Component } from '@angular/core';
import { JsonFormsControl } from '@jsonforms/angular';
import {
  isBooleanControl,
  isDateControl,
  isEnumControl,
  isIntegerControl,
  isNumberControl,
  isOneOfEnumControl,
  isStringControl,
  or,
  rankWith,
} from '@jsonforms/core';
import { resolveEnumOptions, type EnumOption } from '@openmedform/form-core';
import { FIELD_STYLES } from '../styles';
import { ENUM_DATE_RANK, STANDARD_RANK, enumControlTester, textControlTester } from '../testers';
import { pointColor, readOmf } from '../point-value';

@Component({
  selector: 'omf-text-control',
  standalone: true,
  template: `
    @if (!hidden) {
      <div class="omf-field">
        <label class="omf-label" [attr.for]="id">{{ label }}</label>
        <input
          class="omf-input"
          type="text"
          [id]="id"
          [value]="data ?? ''"
          [disabled]="!enabled"
          (input)="onChange({ value: $any($event.target).value || undefined })"
        />
        @if (error) { <span class="omf-error">{{ error }}</span> }
      </div>
    }
  `,
  styles: [FIELD_STYLES],
})
export class TextControlComponent extends JsonFormsControl {}
export { textControlTester };

@Component({
  selector: 'omf-number-control',
  standalone: true,
  template: `
    @if (!hidden) {
      <div class="omf-field">
        <label class="omf-label" [attr.for]="id">{{ label }}</label>
        <input
          class="omf-input"
          type="number"
          [id]="id"
          [value]="data ?? ''"
          [disabled]="!enabled"
          (input)="onNumber($event)"
        />
        @if (error) { <span class="omf-error">{{ error }}</span> }
      </div>
    }
  `,
  styles: [FIELD_STYLES],
})
export class NumberControlComponent extends JsonFormsControl {
  onNumber(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.onChange({ value: raw === '' ? undefined : Number(raw) });
  }
}
export const numberControlTester = rankWith(STANDARD_RANK, isNumberControl);
export const integerControlTester = rankWith(STANDARD_RANK, isIntegerControl);

@Component({
  selector: 'omf-boolean-control',
  standalone: true,
  template: `
    @if (!hidden) {
      <div class="omf-field">
        <div class="omf-check-row">
          <label class="omf-radio-option">
            <input
              type="checkbox"
              [id]="id"
              [checked]="!!data"
              [disabled]="!enabled"
              (change)="onChange({ value: $any($event.target).checked })"
            />
            {{ label }}
          </label>
          @if (points !== null) {
            <span class="omf-point-badge" [style.color]="badgeFg" [style.background]="badgeBg">{{ points }}</span>
          }
        </div>
        @if (error) { <span class="omf-error">{{ error }}</span> }
      </div>
    }
  `,
  styles: [FIELD_STYLES],
})
export class BooleanControlComponent extends JsonFormsControl {
  get points(): number | null {
    const p = readOmf(this.uischema)?.['points'];
    return typeof p === 'number' ? p : null;
  }
  get badgeFg(): string {
    return pointColor(this.points ?? 1).fg;
  }
  get badgeBg(): string {
    return pointColor(this.points ?? 1).bg;
  }
}
export const booleanControlTester = rankWith(STANDARD_RANK, isBooleanControl);

@Component({
  selector: 'omf-enum-control',
  standalone: true,
  template: `
    @if (!hidden) {
      <div class="omf-field">
        <label class="omf-label" [attr.for]="id">{{ label }}</label>
        <select
          class="omf-select"
          [id]="id"
          [value]="data ?? ''"
          [disabled]="!enabled"
          (change)="onChange({ value: $any($event.target).value || undefined })"
        >
          <option value="">—</option>
          @for (option of enumOptions; track option.code) {
            <option [value]="option.code" [selected]="data === option.code">{{ option.label }}</option>
          }
        </select>
        @if (error) { <span class="omf-error">{{ error }}</span> }
      </div>
    }
  `,
  styles: [FIELD_STYLES],
})
export class EnumControlComponent extends JsonFormsControl {
  /** Resolved in form-core, so React shows the same words for the same schema. */
  get enumOptions(): EnumOption[] {
    return resolveEnumOptions(this.scopedSchema, this.uischema);
  }
}
export { enumControlTester };

@Component({
  selector: 'omf-date-control',
  standalone: true,
  template: `
    @if (!hidden) {
      <div class="omf-field">
        <label class="omf-label" [attr.for]="id">{{ label }}</label>
        <input
          class="omf-input"
          type="date"
          [id]="id"
          [value]="data ?? ''"
          [disabled]="!enabled"
          (input)="onChange({ value: $any($event.target).value || undefined })"
        />
        @if (error) { <span class="omf-error">{{ error }}</span> }
      </div>
    }
  `,
  styles: [FIELD_STYLES],
})
export class DateControlComponent extends JsonFormsControl {}
export const dateControlTester = rankWith(ENUM_DATE_RANK, isDateControl);
