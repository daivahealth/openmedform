/**
 * Rule-aware base for renderers that extend `JsonFormsBaseRenderer`.
 *
 * WHY THIS EXISTS — a UI element may carry a JSON Forms `rule` (SHOW / HIDE /
 * ENABLE / DISABLE) so it appears only when another field holds a given value.
 * `JsonFormsControl` gets this for free: the Angular base maps state into a
 * `hidden` flag, and every control template already guards on it.
 * `JsonFormsBaseRenderer` — what the layouts, the Label and the score summary
 * extend — has no such flag, so a rule on a Group or a Label silently did
 * nothing here while the React renderer honoured it. Same definition, two
 * different forms, which is exactly what the cross-renderer contract forbids.
 *
 * The evaluation itself is form-core's, the same code the server and the React
 * renderer use, so a condition cannot mean one thing in one place and something
 * else in another.
 */

import {
  ChangeDetectorRef,
  Directive,
  inject,
  type OnDestroy,
  type OnInit,
} from '@angular/core';
import { JsonFormsAngularService, JsonFormsBaseRenderer } from '@jsonforms/angular';
import type { UISchemaElement } from '@jsonforms/core';
import type { UiRule } from '@openmedform/form-schema-types';
import { evaluateRule } from '@openmedform/form-core';
import { distinctUntilChanged, map, type Subscription } from 'rxjs';

@Directive()
export abstract class RuleAwareRenderer<T extends UISchemaElement>
  extends JsonFormsBaseRenderer<T>
  implements OnInit, OnDestroy
{
  private readonly ruleForms = inject(JsonFormsAngularService);
  private readonly ruleCdr = inject(ChangeDetectorRef);
  private ruleSub?: Subscription;

  /** False only while an element's own rule says to hide it. */
  visible = true;
  /** False only while an element's own rule says to disable it. */
  ruleEnabled = true;

  ngOnInit(): void {
    const rule = (this.uischema as UISchemaElement | undefined)?.rule as UiRule | undefined;
    // No rule, no subscription: most elements have none, and a per-element
    // state subscription across a large form is not free.
    if (!rule) return;

    this.ruleSub = this.ruleForms.$state
      .pipe(
        map((state) => state?.jsonforms?.core?.data),
        distinctUntilChanged(),
      )
      .subscribe((data) => {
        const next = evaluateRule(rule, data ?? {});
        if (next.visible === this.visible && next.enabled === this.ruleEnabled) return;
        this.visible = next.visible;
        this.ruleEnabled = next.enabled;
        // OnPush: an async visibility change must mark the view itself.
        this.ruleCdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.ruleSub?.unsubscribe();
  }
}
