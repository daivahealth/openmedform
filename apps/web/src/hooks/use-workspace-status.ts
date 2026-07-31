'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface FormQuota {
  used: number;
  /** null when unlimited. */
  limit: number | null;
  /** null when unlimited. */
  remaining: number | null;
  unlimited: boolean;
  reason: 'super-admin' | 'own-ai-provider' | 'default' | 'admin-raised';
}

export interface WorkspaceStatus {
  quota: FormQuota;
  ai: { effectiveSource: 'tenant' | 'global' | 'env' | 'none' };
  contactEmail: string;
}

/** Quota + AI provider status for the dashboard notice. Cheap, cacheable. */
export function useWorkspaceStatus() {
  return useQuery<WorkspaceStatus>({
    queryKey: ['workspace-status'],
    queryFn: async () => {
      const { data } = await api.get('/api/me/workspace-status');
      return data;
    },
    staleTime: 60_000,
  });
}
