/**
 * omf-aware standard controls for Angular — textarea and radio — selected via
 * `options.omf.control`, mirroring the React omf controls one-for-one.
 */

import { Component } from '@angular/core';
import { JsonFormsControl } from '@jsonforms/angular';
import { rankWith } from '@jsonforms/core';
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
      <div class="omf-field">
        <label class="omf-label">{{ label }}</label>
        <div class="omf-radio-group" [class.stacked]="!inline">
          @for (option of enumOptions; track option) {
            <label class="omf-radio-option">
              <input
                type="radio"
                [name]="id"
                [value]="option"
                [checked]="data === option"
                [disabled]="!enabled"
                (change)="onChange({ value: option })"
              />
              {{ option }}
            </label>
          }
        </div>
        @if (error) { <span class="omf-error">{{ error }}</span> }
      </div>
    }
  `,
  styles: [FIELD_STYLES],
})
export class OmfRadioControlComponent extends JsonFormsControl {
  get enumOptions(): string[] {
    return (this.scopedSchema?.enum as string[] | undefined) ?? [];
  }
  get inline(): boolean {
    const screen = readOmf(this.uischema)?.['screen'] as { inline?: boolean } | undefined;
    return screen?.inline ?? false;
  }
}
export const omfRadioTester = rankWith(OMF_CONTROL_RANK, omfControlIs('radio'));
