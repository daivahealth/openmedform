/**
 * omf-aware standard controls for Angular — textarea and radio — selected via
 * `options.omf.control`, mirroring the React omf controls one-for-one.
 */

import { Component } from '@angular/core';
import { JsonFormsControl } from '@jsonforms/angular';
import { rankWith } from '@jsonforms/core';
import {
  resolveEnumOptions,
  resolveMultiEnumOptions,
  type EnumOption,
} from '@openmedform/form-core';
import { FIELD_STYLES } from '../styles';
import { OMF_CONTROL_RANK, omfControlIs, readOmf } from '../testers';

@Component({
  selector: 'omf-textarea-control',
  standalone: true,
  template: `
    @if (!hidden) {
      <div class="omf-field">
        <label class="omf-label" [attr.for]="id">{{ label }}</label>
        <textarea
          class="omf-textarea"
          [id]="id"
          [rows]="rows"
          [value]="data ?? ''"
          [disabled]="!enabled"
          (input)="onChange({ value: $any($event.target).value || undefined })"
        ></textarea>
        @if (error) { <span class="omf-error">{{ error }}</span> }
      </div>
    }
  `,
  styles: [FIELD_STYLES],
})
export class OmfTextareaControlComponent extends JsonFormsControl {
  get rows(): number {
    const screen = readOmf(this.uischema)?.['screen'] as { rows?: number } | undefined;
    return screen?.rows ?? 3;
  }
}
export const omfTextareaTester = rankWith(OMF_CONTROL_RANK, omfControlIs('textarea'));

@Component({
  selector: 'omf-radio-control',
  standalone: true,
  template: `
    @if (!hidden) {
      @if (labelLeft) {
        <div class="omf-field">
          <div class="omf-check-row">
            <span class="omf-label" style="flex:1 1 auto">{{ label }}</span>
            <div class="omf-radio-group" style="flex:0 0 auto">
              @for (option of enumOptions; track option.code) {
                <label class="omf-radio-option">
                  <input type="radio" [name]="id" [value]="option.code" [checked]="data === option.code" [disabled]="!enabled" (change)="onChange({ value: option.code })" />
                  {{ option.label }}
                </label>
              }
            </div>
          </div>
          @if (error) { <span class="omf-error">{{ error }}</span> }
        </div>
      } @else {
        <div class="omf-field">
          <label class="omf-label">{{ label }}</label>
          <div class="omf-radio-group" [class.stacked]="!inline">
            @for (option of enumOptions; track option.code) {
              <label class="omf-radio-option">
                <input type="radio" [name]="id" [value]="option.code" [checked]="data === option.code" [disabled]="!enabled" (change)="onChange({ value: option.code })" />
                {{ option.label }}
              </label>
            }
          </div>
          @if (error) { <span class="omf-error">{{ error }}</span> }
        </div>
      }
    }
  `,
  styles: [FIELD_STYLES],
})
export class OmfRadioControlComponent extends JsonFormsControl {
  /** Resolved in form-core, so React shows the same words for the same schema. */
  get enumOptions(): EnumOption[] {
    return resolveEnumOptions(this.scopedSchema, this.uischema);
  }
  private get screen(): { inline?: boolean; labelPosition?: string } | undefined {
    return readOmf(this.uischema)?.['screen'] as { inline?: boolean; labelPosition?: string } | undefined;
  }
  /** Label-left / options-right: explicit, or the default for a two-option radio. */
  get labelLeft(): boolean {
    const pos = this.screen?.labelPosition;
    return pos ? pos === 'left' : this.enumOptions.length === 2;
  }
  get inline(): boolean {
    return this.screen?.inline ?? this.labelLeft;
  }
}
export const omfRadioTester = rankWith(OMF_CONTROL_RANK, omfControlIs('radio'));

@Component({
  selector: 'omf-checkbox-group',
  standalone: true,
  template: `
    @if (!hidden) {
      <div class="omf-field">
        <label class="omf-label">{{ label }}</label>
        <div class="omf-radio-group" [class.stacked]="!inline">
          @for (option of enumOptions; track option.code) {
            <label class="omf-radio-option">
              <input
                type="checkbox"
                [value]="option.code"
                [checked]="isChecked(option.code)"
                [disabled]="!enabled"
                (change)="toggle(option.code, $any($event.target).checked)"
              />
              {{ option.label }}
            </label>
          }
        </div>
        @if (error) { <span class="omf-error">{{ error }}</span> }
      </div>
    }
  `,
  styles: [FIELD_STYLES],
})
export class OmfCheckboxGroupComponent extends JsonFormsControl {
  /** Resolved in form-core, so React shows the same words for the same schema. */
  get enumOptions(): EnumOption[] {
    return resolveMultiEnumOptions(this.scopedSchema, this.uischema);
  }
  get inline(): boolean {
    const screen = readOmf(this.uischema)?.['screen'] as { inline?: boolean } | undefined;
    return screen?.inline ?? true;
  }
  private get selected(): string[] {
    return Array.isArray(this.data) ? (this.data as string[]) : [];
  }
  isChecked(code: string): boolean {
    return this.selected.includes(code);
  }
  toggle(code: string, checked: boolean): void {
    const next = new Set(this.selected);
    if (checked) next.add(code);
    else next.delete(code);
    // Stored in schema order regardless of click order, so the same answers
    // always serialize identically.
    const value = this.enumOptions.filter((o) => next.has(o.code)).map((o) => o.code);
    this.onChange({ value: value.length ? value : undefined });
  }
}
