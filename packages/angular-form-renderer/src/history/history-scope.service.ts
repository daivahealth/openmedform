/**
 * History scope — how prior readings reach the Angular controls (ADR-005 §2).
 *
 * Provided by `<omf-form>` (component-level provider), so every renderer the
 * `<jsonforms-outlet>`s create beneath it can inject it, while two forms on
 * one page keep separate histories. Batch entries are projected and aligned
 * to the current definition once here — not once per field — and the lazy
 * provider is handed through for `<omf-field-history>` to call.
 *
 * Mirrors the React `HistoryScope` context one-for-one: same form-core calls,
 * same "nothing supplied → nothing shown" behaviour.
 */

import { Injectable } from '@angular/core';
import type {
  FormDefinitionSchemas,
  HistoryEntry,
  HistoryProvider,
  Observation,
  OmfHistoryOptions,
} from '@openmedform/form-schema-types';
import { alignHistoryEntries, resolveHistoryConfig } from '@openmedform/form-core';
import { BehaviorSubject } from 'rxjs';

export interface HistoryScopeState {
  aligned: Map<string, Observation[]>;
  provider?: HistoryProvider;
  /**
   * Each field's EFFECTIVE `omf.history` after section inheritance, keyed by
   * index-free data path (ADR-006) — resolved once so a Group-level setting
   * reaches every control.
   */
  config: Map<string, OmfHistoryOptions>;
}

@Injectable()
export class HistoryScopeService {
  private readonly state$ = new BehaviorSubject<HistoryScopeState | null>(null);

  /** Emits whenever the host changes what it supplied; `null` when it supplied nothing. */
  readonly changes = this.state$.asObservable();

  get state(): HistoryScopeState | null {
    return this.state$.value;
  }

  configure(
    definition: FormDefinitionSchemas | undefined,
    history: HistoryEntry[] | undefined,
    provider: HistoryProvider | undefined,
  ): void {
    if (!definition || ((!history || history.length === 0) && !provider)) {
      this.state$.next(null);
      return;
    }
    this.state$.next({
      aligned: alignHistoryEntries(definition, history ?? []),
      config: resolveHistoryConfig(definition),
      ...(provider ? { provider } : {}),
    });
  }
}
