'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

interface FormVersion {
  id: string;
  version: number;
  schema: Record<string, unknown>;
  scoringRules?: Record<string, unknown>;
  publishedAt?: string;
  createdAt: string;
}

interface Form {
  id: string;
  name: string;
  slug: string;
  description?: string;
  category?: string;
  tags?: string[];
  formType: 'PATIENT' | 'NON_PATIENT';
  status: string;
  currentVersion?: FormVersion;
  versions?: FormVersion[];
  createdAt: string;
  updatedAt: string;
}

interface CreateFormInput {
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  formType?: 'PATIENT' | 'NON_PATIENT';
}

interface CreateFormFromFileInput extends CreateFormInput {
  file: File;
  provider?: string;
  instructions?: string;
}

interface UpdateFormInput {
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
}

interface SaveSchemaInput {
  schema: Record<string, unknown>;
}

export function useForms() {
  return useQuery<Form[]>({
    queryKey: ['forms'],
    queryFn: async () => {
      const { data } = await api.get('/api/forms');
      return data;
    },
  });
}

export function useForm(formId: string) {
  return useQuery<Form>({
    queryKey: ['form', formId],
    queryFn: async () => {
      const { data } = await api.get(`/api/forms/${formId}`);
      return data;
    },
    enabled: !!formId,
  });
}

export function useFormBySlug(slug: string) {
  return useQuery<Form>({
    queryKey: ['form', 'slug', slug],
    queryFn: async () => {
      const { data } = await api.get(`/api/forms/slug/${slug}`);
      return data;
    },
    enabled: !!slug,
  });
}

export function useCreateForm() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateFormInput) => {
      const { data } = await api.post('/api/forms', input);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms'] });
    },
  });
}

export function useCreateFormFromFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateFormFromFileInput) => {
      const formData = new FormData();
      formData.append('file', input.file);
      formData.append('name', input.name);
      if (input.description) formData.append('description', input.description);
      if (input.category) formData.append('category', input.category);
      if (input.formType) formData.append('formType', input.formType);
      if (input.provider) formData.append('provider', input.provider);
      if (input.instructions) formData.append('instructions', input.instructions);

      const { data } = await api.post('/api/forms/from-file', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      return data as {
        form: Form;
        schema: Record<string, unknown>;
        provider: string;
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms'] });
    },
  });
}

export function useUpdateForm(formId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateFormInput) => {
      const { data } = await api.put(`/api/forms/${formId}`, input);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms'] });
      queryClient.invalidateQueries({ queryKey: ['form', formId] });
    },
  });
}

export function useSaveSchema(formId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SaveSchemaInput) => {
      const { data } = await api.put(`/api/forms/${formId}/schema`, input);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form', formId] });
    },
  });
}

export function usePublishForm(formId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/api/forms/${formId}/publish`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms'] });
      queryClient.invalidateQueries({ queryKey: ['form', formId] });
    },
  });
}

export function useCloneForm() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formId: string) => {
      const { data } = await api.post(`/api/forms/${formId}/clone`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms'] });
    },
  });
}

export function useExportForm() {
  return useMutation({
    mutationFn: async (formId: string) => {
      const { data } = await api.get(`/api/forms/${formId}/export`);
      return data;
    },
  });
}

export function useImportForm() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (template: Record<string, unknown>) => {
      const { data } = await api.post('/api/forms/import', template);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms'] });
    },
  });
}

export function useArchiveForm() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formId: string) => {
      const { data } = await api.delete(`/api/forms/${formId}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms'] });
    },
  });
}
