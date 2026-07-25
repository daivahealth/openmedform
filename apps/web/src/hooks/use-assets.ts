'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface FormAsset {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksum?: string;
  createdAt: string;
}

/** Assets (logos/images) attached to a form; bundled into its export. */
export function useFormAssets(formId: string) {
  return useQuery<FormAsset[]>({
    queryKey: ['form-assets', formId],
    queryFn: async () => {
      const { data } = await api.get(`/api/forms/${formId}/assets`);
      return data;
    },
    enabled: !!formId,
  });
}

export function useUploadAsset(formId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post(`/api/forms/${formId}/assets`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data as FormAsset;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-assets', formId] });
    },
  });
}

export function useDeleteAsset(formId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (assetId: string) => {
      const { data } = await api.delete(`/api/forms/${formId}/assets/${assetId}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-assets', formId] });
    },
  });
}
