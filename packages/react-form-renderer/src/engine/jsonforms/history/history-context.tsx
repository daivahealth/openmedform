/**
 * History scope — how prior readings reach the controls (ADR-005 §2).
 *
 * `JsonFormsRenderer` puts the host-supplied history in this context once:
 * batch entries are projected and aligned to the current definition up front
 * (one pass, not one per field), and the lazy provider is passed through for
 * fields to call on mount. Controls read it through `useFieldHistory`.
 *
 * The context is `null` when the host supplied nothing, and every control
 * renders exactly as before — history is opt-in twice: by the host (data) and
 * by the designer (`omf.history` on the field).
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { UISchemaElement } from '@jsonforms/core';
import type {
  FormDefinitionSchemas,
  HistoryEntry,
  HistoryProvider,
  Observation,
  OmfCoding,
  OmfHistoryOptions,
} from '@openmedform/form-schema-types';
import { alignHistoryEntries, historyKeyForPath, mergeHistory, resolveHistoryConfig } from '@openmedform/form-core';
import { readOmf } from '../testers';

export interface HistoryScopeValue {
  aligned: Map<string, Observation[]>;
  provider?: HistoryProvider;
  /**
   * Each field's EFFECTIVE `omf.history` after section inheritance, keyed by
   * index-free data path (ADR-006). Resolved once here so a Group-level
   * setting reaches every control without the control knowing its ancestors.
   */
  config: Map<string, OmfHistoryOptions>;
}

const HistoryContext = createContext<HistoryScopeValue | null>(null);

export interface HistoryScopeProps {
  definition: FormDefinitionSchemas;
  history?: HistoryEntry[];
  historyProvider?: HistoryProvider;
  children: ReactNode;
}

export function HistoryScope({ definition, history, historyProvider, children }: HistoryScopeProps) {
  const value = useMemo<HistoryScopeValue | null>(() => {
    if ((!history || history.length === 0) && !historyProvider) return null;
    return {
      aligned: alignHistoryEntries(definition, history ?? []),
      config: resolveHistoryConfig(definition),
      ...(historyProvider ? { provider: historyProvider } : {}),
    };
  }, [definition, history, historyProvider]);
  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export const DEFAULT_HISTORY_COUNT = 5;

export interface FieldHistoryState {
  /** The designer's configuration for this field. */
  config: OmfHistoryOptions;
  /** Prior readings, newest first, capped at `config.count`. */
  observations: Observation[];
  /** A provider call is in flight. Never blocks input. */
  loading: boolean;
  /** The provider rejected. Shown as "history unavailable", never thrown. */
  error?: unknown;
  coding?: OmfCoding[];
  unit?: string;
}

/**
 * Prior readings for the control at `path`, or `null` when there is nothing to
 * show: no host history, or the field has no `omf.history` / `show: 'none'`.
 * Always calls the same hooks so it is safe at the top of any control.
 */
export function useFieldHistory(path: string, uischema: UISchemaElement | undefined): FieldHistoryState | null {
  const scope = useContext(HistoryContext);
  const omf = readOmf(uischema);
  const key = historyKeyForPath(path);
  // The resolved map carries the field's own setting or its section's
  // (ADR-006); the raw element is the fallback for a control the walker did
  // not reach (a custom control with an unusual scope).
  const config = scope?.config.get(key) ?? (omf?.history as OmfHistoryOptions | undefined);
  const enabled = Boolean(scope && config && config.show !== 'none');
  const count = config?.count ?? DEFAULT_HISTORY_COUNT;
  const coding = Array.isArray(omf?.coding) && omf!.coding.length > 0 ? (omf!.coding as OmfCoding[]) : undefined;
  const unit = typeof omf?.unit === 'string' ? (omf.unit as string) : undefined;
  const provider = scope?.provider;
  // A stable identity for the coding list so the effect does not refire on
  // every render when the host passes a fresh uischema object.
  const codingKey = coding ? coding.map((c) => `${c.system}|${c.code}`).join(',') : '';

  const [fetched, setFetched] = useState<Observation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(undefined);

  useEffect(() => {
    if (!enabled || !provider) return;
    let alive = true;
    setLoading(true);
    setError(undefined);
    provider({ ...(coding ? { coding } : {}), path: key, limit: count })
      .then((rows) => {
        if (alive) setFetched(rows);
      })
      .catch((e: unknown) => {
        if (alive) setError(e ?? new Error('history provider failed'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- codingKey stands in for `coding`
  }, [enabled, provider, key, count, codingKey]);

  const observations = useMemo(() => {
    if (!enabled || !scope) return [];
    const batch = scope.aligned.get(key) ?? [];
    return mergeHistory(batch, fetched ?? []).slice(0, count);
  }, [enabled, scope, key, fetched, count]);

  if (!enabled || !config) return null;
  return {
    config,
    observations,
    loading,
    ...(error !== undefined ? { error } : {}),
    ...(coding ? { coding } : {}),
    ...(unit ? { unit } : {}),
  };
}
