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
  isStringControl,
  rankWith,
} from '@jsonforms/core';
import { FIELD_STYLES } from '../styles';
import { STANDARD_RANK } from '../testers';

const ENUM_DATE_RANK = STANDARD_RANK + 1;

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
export const textControlTester = rankWith(STANDARD_RANK, isStringControl);

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
        @if (error) { <span class="omf-error">{{ error }}</span> }
      </div>
    }
  `,
  styles: [FIELD_STYLES],
})
export class BooleanControlComponent extends JsonFormsControl {}
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
          @for (option of enumOptions; track option) {
            <option [value]="option" [selected]="data === option">{{ option }}</option>
          }
        </select>
        @if (error) { <span class="omf-error">{{ error }}</span> }
      </div>
    }
  `,
  styles: [FIELD_STYLES],
})
export class EnumControlComponent extends JsonFormsControl {
  get enumOptions(): string[] {
    return (this.scopedSchema?.enum as string[] | undefined) ?? [];
  }
}
export const enumControlTester = rankWith(ENUM_DATE_RANK, isEnumControl);

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
