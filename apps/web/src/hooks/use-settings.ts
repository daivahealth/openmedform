'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

/**
 * Which AI provider set a screen operates on. `tenant` is the caller's own
 * organization (/settings); `global` is the platform-wide fallback used by
 * organizations without their own config (/admin/ai-providers, SUPER_ADMIN
 * only). Always sent explicitly so the two consoles never depend on the API's
 * legacy role-based default.
 */
export type AiProviderScope = 'tenant' | 'global';

export interface AiProviderConfig {
  id: string;
  provider: string;
  displayName: string;
  apiKeyMasked: string;
  model: string | null;
  baseUrl: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CreateProviderInput {
  provider: string;
  displayName: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  isDefault?: boolean;
}

interface UpdateProviderInput {
  displayName?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

/** Scoped cache key so the tenant and global lists never overwrite each other. */
const configsKey = (scope: AiProviderScope) => ['ai-provider-configs', scope];

export function useAiProviderConfigs(scope: AiProviderScope = 'tenant') {
  return useQuery<AiProviderConfig[]>({
    queryKey: configsKey(scope),
    queryFn: async () => {
      const { data } = await api.get('/api/settings/ai-providers', {
        params: { scope },
      });
      return data;
    },
  });
}

export function useCreateAiProvider(scope: AiProviderScope = 'tenant') {
  const queryClient = useQueryClient();
  return useMutation<AiProviderConfig, Error, CreateProviderInput>({
    mutationFn: async (input) => {
      const { data } = await api.post('/api/settings/ai-providers', input, {
        params: { scope },
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: configsKey(scope) });
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
      // Adding a tenant provider lifts the free-tier form quota.
      queryClient.invalidateQueries({ queryKey: ['workspace-status'] });
    },
  });
}

export function useUpdateAiProvider(scope: AiProviderScope = 'tenant') {
  const queryClient = useQueryClient();
  return useMutation<
    AiProviderConfig,
    Error,
    { id: string } & UpdateProviderInput
  >({
    mutationFn: async ({ id, ...input }) => {
      const { data } = await api.put(`/api/settings/ai-providers/${id}`, input, {
        params: { scope },
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: configsKey(scope) });
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-status'] });
    },
  });
}

export function useDeleteAiProvider(scope: AiProviderScope = 'tenant') {
  const queryClient = useQueryClient();
  return useMutation<{ deleted: boolean }, Error, string>({
    mutationFn: async (id) => {
      const { data } = await api.delete(`/api/settings/ai-providers/${id}`, {
        params: { scope },
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: configsKey(scope) });
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-status'] });
    },
  });
}
