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
 *
 * ECHO-LOOP GUARD (important): a host that binds `[data]` back to the SAME
 * object it just received from `(dataChange)` — e.g.
 * `onChange(data) { this.formData = data; }` with `[data]="formData"` — would
 * otherwise force @jsonforms/angular's `<jsonforms>` to run its `ngOnChanges`
 * → `updateCoreState()` path on every keystroke. That path is a full-store
 * reducer pass (re-validate against the WHOLE schema, re-notify every mounted
 * control), which is far heavier than the targeted, scoped update a single
 * control's own `onChange` already performed a moment earlier for that same
 * edit — i.e. every keystroke would double-process the entire form. `data`
 * is a setter that recognizes an incoming value that is reference-identical
 * to what we ourselves just emitted and skips re-forwarding it, so the
 * `<jsonforms [data]>` binding never sees a "changed" reference for its own
 * echo and never re-triggers that expensive path. See THIRD-PARTY-GUIDE.md.
 */

import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="omf-form-scope" [style]="tokenStyle">
      <jsonforms
        [schema]="schema"
        [uischema]="uischema"
        [data]="internalData"
        [renderers]="renderers"
        [ajv]="ajv"
        [readonly]="readOnly"
        (dataChange)="onInternalDataChange($event)"
      ></jsonforms>
    </div>
  `,
})
export class OmfFormComponent {
  @Input({ required: true }) definition!: JsonFormsFormDefinition;
  @Input() readOnly = false;
  @Output() dataChange = new EventEmitter<Record<string, unknown>>();

  readonly renderers: JsonFormsRendererRegistryEntry[] = angularRenderers;
  // form-core's Ajv 2020-12 instance; `any` avoids a cross-package Ajv type clash.
  readonly ajv: any = createAjv();
  readonly tokenStyle: Record<string, string> = tokenStyleObject;

  /** The reference we last emitted via (dataChange) — used by the echo guard. */
  private lastEmitted: Record<string, unknown> | undefined;
  /** The reference actually bound into <jsonforms [data]>. */
  internalData: Record<string, unknown> = {};

  @Input()
  set data(value: Record<string, unknown>) {
    if (value === this.lastEmitted) return; // our own edit, echoed back unmodified — ignore.
    this.internalData = value ?? {};
  }
  get data(): Record<string, unknown> {
    return this.internalData;
  }

  onInternalDataChange(next: Record<string, unknown>): void {
    this.lastEmitted = next;
    this.internalData = next;
    this.dataChange.emit(next);
  }

  /** JSON Forms' schema/uischema types differ nominally from ours; pass through. */
  get schema(): any {
    return this.definition.dataSchema;
  }
  get uischema(): any {
    return this.definition.uiSchema.layout;
  }
}
