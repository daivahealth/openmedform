'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

interface FormAiRefineInput {
  formId: string;
  currentSchema?: Record<string, unknown>;
  instruction: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  provider?: string;
  image?: File;
  onProgress?: (message: string) => void;
}

interface AiResult {
  schema: Record<string, unknown>;
  provider: string;
  changeSummary?: string;
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

export function useFormAiRefine() {
  return useMutation<AiResult, Error, FormAiRefineInput>({
    mutationFn: async ({ formId, image, onProgress, ...input }) => {
      let body: FormData | string;
      const headers: Record<string, string> = {};

      if (image) {
        const formData = new FormData();
        formData.append('image', image);
        formData.append('instruction', input.instruction);
        if (input.currentSchema) {
          formData.append('currentSchema', JSON.stringify(input.currentSchema));
        }
        if (input.conversationHistory) {
          formData.append(
            'conversationHistory',
            JSON.stringify(input.conversationHistory),
          );
        }
        if (input.provider) formData.append('provider', input.provider);
        body = formData;
      } else {
        body = JSON.stringify(input);
        headers['Content-Type'] = 'application/json';
      }

      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('auth_token')
          : null;
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100';
      const response = await fetch(`${baseUrl}/api/forms/${formId}/ai/refine`, {
        method: 'POST',
        headers,
        body,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        let message = 'Failed to refine form';
        try {
          const parsed = JSON.parse(errorBody);
          message = parsed.message ?? message;
        } catch {}
        throw new Error(message);
      }

      return parseSSEStream(response, onProgress);
    },
  });
}

async function parseSSEStream(
  response: Response,
  onProgress?: (message: string) => void,
): Promise<AiResult> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: AiResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6);
      if (!jsonStr.trim()) continue;

      try {
        const event = JSON.parse(jsonStr);
        if (event.type === 'progress' && onProgress) {
          onProgress(event.message);
        } else if (event.type === 'result') {
          result = { schema: event.schema, provider: event.provider, changeSummary: event.changeSummary };
        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      } catch (e) {
        if (e instanceof Error && e.message !== jsonStr) throw e;
      }
    }
  }

  if (!result) {
    throw new Error('No result received from AI provider');
  }
  return result;
}

export interface AiChatMessage {
  id: string;
  role: string;
  content: string;
  provider?: string | null;
  createdAt: string;
}

export function useAiMessages(formId: string) {
  return useQuery<AiChatMessage[]>({
    queryKey: ['ai-messages', formId],
    queryFn: async () => {
      const { data } = await api.get(`/api/forms/${formId}/ai/messages`);
      return data;
    },
  });
}

export function useAddAiMessage(formId: string) {
  const queryClient = useQueryClient();
  return useMutation<AiChatMessage, Error, { role: string; content: string; provider?: string }>({
    mutationFn: async (input) => {
      const { data } = await api.post(`/api/forms/${formId}/ai/messages`, input);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-messages', formId] });
    },
  });
}

export function useClearAiMessages(formId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.delete(`/api/forms/${formId}/ai/messages`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-messages', formId] });
    },
  });
}

interface PdfToFormInput {
  file: File;
  provider?: string;
  instructions?: string;
}

export function useAiGenerateFromPdf() {
  return useMutation<AiResult, Error, PdfToFormInput>({
    mutationFn: async (input) => {
      const formData = new FormData();
      formData.append('file', input.file);
      if (input.provider) formData.append('provider', input.provider);
      if (input.instructions) formData.append('instructions', input.instructions);
      const { data } = await api.post('/api/ai/generate-from-pdf', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      return data;
    },
  });
}
