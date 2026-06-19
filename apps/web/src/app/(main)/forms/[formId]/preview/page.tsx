'use client';

import { useParams, useRouter } from 'next/navigation';
import { useForm } from '@/hooks/use-forms';
import dynamic from 'next/dynamic';

const FormRendererWrapper = dynamic(
  () => import('@/components/forms/form-renderer-wrapper').then(m => ({ default: m.FormRendererWrapper })),
  { ssr: false, loading: () => <div className="flex h-[200px] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div> },
);
import { FormStatusBadge } from '@/components/forms/form-status-badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Pencil } from 'lucide-react';

export default function FormPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const formId = params.formId as string;

  const { data: form, isLoading } = useForm(formId);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">Form not found</p>
      </div>
    );
  }

  const currentSchema =
    form.currentVersion?.schema ??
    form.versions?.[0]?.schema ??
    { display: 'form', components: [] };

  const components = (currentSchema as { components?: unknown[] }).components;
  const hasComponents = !!components && components.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/forms')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                Preview: {form.name}
              </h1>
              <FormStatusBadge status={form.status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'} />
            </div>
            <p className="text-sm text-muted-foreground">
              {form.description || 'Preview how the form will appear to users'}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/forms/${formId}/builder`)}
        >
          <Pencil className="mr-2 h-4 w-4" />
          Edit in Builder
        </Button>
      </div>

      <div className="rounded-lg border bg-white p-6">
        {hasComponents ? (
          <FormRendererWrapper schema={currentSchema} readOnly />
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <p>This form has no components yet</p>
            <p className="text-sm">
              Open the builder to add fields and layouts
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => router.push(`/forms/${formId}/builder`)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Open Builder
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
