/**
 * <omf-form> — the Angular engine entry point.
 *
 * Wraps @jsonforms/angular's <jsonforms> with the platform renderer set,
 * form-core's Ajv 2020-12 instance (so the dialect matches the backend and the
 * React renderer), and the shared design tokens applied to the host so every
 * descendant renderer inherits the `--omf-*` custom properties.
 *
 * There is no Form.io branch here by design: Form.io has no healthy Angular v5
 * renderer, so Angular is jsonforms-only (see ADR-003).
 */

import { Component, EventEmitter, Input, Output } from '@angular/core';
import { JsonFormsModule } from '@jsonforms/angular';
import type { JsonFormsRendererRegistryEntry } from '@jsonforms/core';
import { createAjv } from '@openmedform/form-core';
import type { JsonFormsFormDefinition } from '@openmedform/form-schema-types';
import { angularRenderers } from './renderer-set';
import { tokenStyleObject } from './styles';

@Component({
  selector: 'omf-form',
  standalone: true,
  imports: [JsonFormsModule],
  template: `
    <div class="omf-form-scope" [style]="tokenStyle">
      <jsonforms
        [schema]="schema"
        [uischema]="uischema"
        [data]="data"
        [renderers]="renderers"
        [ajv]="ajv"
        [readonly]="readOnly"
        (dataChange)="dataChange.emit($event)"
      ></jsonforms>
    </div>
  `,
})
export class OmfFormComponent {
  @Input({ required: true }) definition!: JsonFormsFormDefinition;
  @Input() data: Record<string, unknown> = {};
  @Input() readOnly = false;
  @Output() dataChange = new EventEmitter<Record<string, unknown>>();

  readonly renderers: JsonFormsRendererRegistryEntry[] = angularRenderers;
  // form-core's Ajv 2020-12 instance; `any` avoids a cross-package Ajv type clash.
  readonly ajv: any = createAjv();
  readonly tokenStyle: Record<string, string> = tokenStyleObject;

  /** JSON Forms' schema/uischema types differ nominally from ours; pass through. */
  get schema(): any {
    return this.definition.dataSchema;
  }
  get uischema(): any {
    return this.definition.uiSchema.layout;
  }
}
