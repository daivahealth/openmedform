'use client';

import { useQuery } from '@tanstack/react-query';
import type { HistoryProvider, Observation } from '@openmedform/form-schema-types';
import api from '@/lib/api';

/**
 * Observation history for a patient (ADR-005). The web app is just another
 * host of the renderer: the fill screen hands it a `historyProvider` backed by
 * the API's observation read model, exactly as an EMR would back one with its
 * own store.
 */

/** A renderer `historyProvider` for one patient, or undefined when there is no MRN. */
export function makeHistoryProvider(patientMrn: string | undefined): HistoryProvider | undefined {
  const mrn = patientMrn?.trim();
  if (!mrn) return undefined;
  return async (q) => {
    const params = new URLSearchParams({ limit: String(q.limit) });
    const primary = q.coding?.[0];
    if (primary) {
      params.set('code', primary.code);
      params.set('system', primary.system);
    } else {
      params.set('path', q.path);
    }
    const { data } = await api.get<Observation[]>(
      `/api/patients/${encodeURIComponent(mrn)}/observations?${params.toString()}`,
    );
    return data;
  };
}

export interface FlowsheetResponse {
  definition: { dataSchema: unknown; uiSchema: unknown } | null;
  observations: Observation[];
}

/** Everything charted on one form for a patient, for the flowsheet view. */
export function usePatientFlowsheet(patientMrn: string | undefined, formId: string | undefined) {
  const mrn = patientMrn?.trim();
  return useQuery<FlowsheetResponse>({
    queryKey: ['flowsheet', mrn, formId],
    queryFn: async () => {
      const { data } = await api.get(
        `/api/patients/${encodeURIComponent(mrn as string)}/flowsheet?formId=${encodeURIComponent(formId as string)}`,
      );
      return data;
    },
    enabled: !!mrn && !!formId,
  });
}
