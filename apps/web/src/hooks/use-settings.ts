'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

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

export function useAiProviderConfigs() {
  return useQuery<AiProviderConfig[]>({
    queryKey: ['ai-provider-configs'],
    queryFn: async () => {
      const { data } = await api.get('/api/settings/ai-providers');
      return data;
    },
  });
}

export function useCreateAiProvider() {
  const queryClient = useQueryClient();
  return useMutation<AiProviderConfig, Error, CreateProviderInput>({
    mutationFn: async (input) => {
      const { data } = await api.post('/api/settings/ai-providers', input);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-provider-configs'] });
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
    },
  });
}

export function useUpdateAiProvider() {
  const queryClient = useQueryClient();
  return useMutation<
    AiProviderConfig,
    Error,
    { id: string } & UpdateProviderInput
  >({
    mutationFn: async ({ id, ...input }) => {
      const { data } = await api.put(`/api/settings/ai-providers/${id}`, input);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-provider-configs'] });
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
    },
  });
}

export function useDeleteAiProvider() {
  const queryClient = useQueryClient();
  return useMutation<{ deleted: boolean }, Error, string>({
    mutationFn: async (id) => {
      const { data } = await api.delete(`/api/settings/ai-providers/${id}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-provider-configs'] });
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
    },
  });
}
