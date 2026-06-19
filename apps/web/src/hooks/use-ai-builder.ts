'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import api from '@/lib/api';

interface AiGenerateInput {
  prompt: string;
  provider?: string;
  category?: string;
}

interface AiRefineInput {
  currentSchema: Record<string, unknown>;
  instruction: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  provider?: string;
}

interface AiResult {
  schema: Record<string, unknown>;
  provider: string;
}

export function useAiProviders() {
  return useQuery<{ providers: string[] }>({
    queryKey: ['ai-providers'],
    queryFn: async () => {
      const { data } = await api.get('/api/ai/providers');
      return data;
    },
  });
}

export function useAiGenerate() {
  return useMutation<AiResult, Error, AiGenerateInput>({
    mutationFn: async (input) => {
      const { data } = await api.post('/api/ai/generate', input);
      return data;
    },
  });
}

export function useAiRefine() {
  return useMutation<AiResult, Error, AiRefineInput>({
    mutationFn: async (input) => {
      const { data } = await api.post('/api/ai/refine', input);
      return data;
    },
  });
}
