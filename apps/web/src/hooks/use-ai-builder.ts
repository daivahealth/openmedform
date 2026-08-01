'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface JsonFormsRefineResult {
  provider: string;
  version: number;
  dataSchema: Record<string, unknown>;
  uiSchema: Record<string, unknown>;
  printSchema: Record<string, unknown>;
  translations: Record<string, unknown>;
  conversionMetadata: Record<string, unknown>;
  warnings: Array<{ type: string; message: string }>;
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

export function useJsonFormsRefine() {
  const queryClient = useQueryClient();

  return useMutation<
    JsonFormsRefineResult,
    Error,
    {
      formId: string;
      instruction: string;
      provider?: string;
      image?: File;
      onProgress?: (message: string) => void;
    }
  >({
    mutationFn: async ({ formId, instruction, provider, image, onProgress }) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100';
      const body = image
        ? (() => {
            const formData = new FormData();
            formData.append('instruction', instruction);
            if (provider) formData.append('provider', provider);
            formData.append('image', image);
            return formData;
          })()
        : JSON.stringify({ instruction, provider });
      const response = await fetch(`${baseUrl}/api/forms/${formId}/jsonforms/refine`, {
        method: 'POST',
        headers: {
          ...(image ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body,
      });

      if (!response.ok) {
        throw new Error((await response.text()) || 'Failed to refine form');
      }

      return parseJsonFormsRefineSSE(response, onProgress);
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['form', variables.formId] });
      queryClient.invalidateQueries({ queryKey: ['forms'] });
    },
  });
}

async function parseJsonFormsRefineSSE(
  response: Response,
  onProgress?: (message: string) => void,
): Promise<JsonFormsRefineResult> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response stream received from AI provider');

  const decoder = new TextDecoder();
  let buffer = '';
  let result: JsonFormsRefineResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const event = JSON.parse(line.slice(6));
      if (event.type === 'progress') onProgress?.(event.message);
      if (event.type === 'result') result = event as JsonFormsRefineResult;
      if (event.type === 'error') throw new Error(event.message);
    }
  }

  if (!result) throw new Error('No result received from AI provider');
  return result;
}
