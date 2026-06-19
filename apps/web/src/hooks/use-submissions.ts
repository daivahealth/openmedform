'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

interface SubmissionUser {
  id: string;
  fullName: string;
  email: string;
}

interface SubmissionVersion {
  id: string;
  version: number;
}

interface Submission {
  id: string;
  formId: string;
  formVersionId: string;
  data: Record<string, unknown>;
  scores?: Record<string, unknown>;
  riskLevel?: string;
  patientMrn?: string;
  encounterId?: string;
  status: string;
  submittedBy?: SubmissionUser;
  formVersion?: SubmissionVersion;
  form?: { id: string; name: string; slug: string };
  createdAt: string;
  updatedAt: string;
}

export function useSubmissions(formId: string) {
  return useQuery<Submission[]>({
    queryKey: ['submissions', formId],
    queryFn: async () => {
      const { data } = await api.get(`/api/forms/${formId}/submissions`);
      return data;
    },
    enabled: !!formId,
  });
}

export function useSubmission(id: string) {
  return useQuery<Submission>({
    queryKey: ['submission', id],
    queryFn: async () => {
      const { data } = await api.get(`/api/submissions/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateSubmission(formId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const { data } = await api.post(`/api/forms/${formId}/submissions`, input);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissions', formId] });
    },
  });
}

export function useUpdateSubmission(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const { data } = await api.put(`/api/submissions/${id}`, input);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submission', id] });
    },
  });
}

export function useCompleteSubmission(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/api/submissions/${id}/complete`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submission', id] });
    },
  });
}
