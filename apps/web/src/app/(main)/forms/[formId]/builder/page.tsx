'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm, useSaveSchema, usePublishForm } from '@/hooks/use-forms';
import dynamic from 'next/dynamic';

const FormBuilderWrapper = dynamic(
  () => import('@/components/forms/form-builder-wrapper').then(m => ({ default: m.FormBuilderWrapper })),
  { ssr: false, loading: () => <div className="flex h-[500px] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div> },
);
import { FormStatusBadge } from '@/components/forms/form-status-badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Save, Upload, Eye, Check, Sparkles } from 'lucide-react';

const AiChatPanel = dynamic(
  () => import('@/components/ai-builder/ai-chat-panel').then(m => ({ default: m.AiChatPanel })),
  { ssr: false },
);

export default function FormBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const formId = params.formId as string;

  const { data: form, isLoading: formLoading } = useForm(formId);
  const saveSchema = useSaveSchema(formId);
  const publishForm = usePublishForm(formId);

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [builderKey, setBuilderKey] = useState(0);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const latestSchemaRef = useRef<object | null>(null);
  const appliedSchemaRef = useRef<object | null>(null);

  const doSave = useCallback(
    async (schema: object) => {
      setSaveStatus('saving');
      try {
        await saveSchema.mutateAsync({ schema: schema as Record<string, unknown> });
        setSaveStatus('saved');
        setHasUnsavedChanges(false);
        setLastSaved(new Date());
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('idle');
      }
    },
    [saveSchema],
  );

  const handleSchemaChange = useCallback(
    (schema: object) => {
      latestSchemaRef.current = schema;
      setHasUnsavedChanges(true);
      setSaveStatus('idle');

      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      debounceTimer.current = setTimeout(() => {
        doSave(schema);
      }, 2000);
    },
    [doSave],
  );

  const handleManualSave = useCallback(() => {
    if (latestSchemaRef.current) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      doSave(latestSchemaRef.current);
    }
  }, [doSave]);

  const handlePublish = useCallback(async () => {
    if (latestSchemaRef.current && hasUnsavedChanges) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      await doSave(latestSchemaRef.current);
    }
    await publishForm.mutateAsync();
  }, [publishForm, hasUnsavedChanges, doSave]);

  const handleApplyAiSchema = useCallback(
    (schema: Record<string, unknown>) => {
      appliedSchemaRef.current = schema;
      latestSchemaRef.current = schema;
      setBuilderKey((k) => k + 1);
      setHasUnsavedChanges(true);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        doSave(schema);
      }, 1000);
    },
    [doSave],
  );

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  if (formLoading) {
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

  return (
    <div className="space-y-4">
      {/* Header */}
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
                {form.name}
              </h1>
              <FormStatusBadge status={form.status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'} />
            </div>
            <p className="text-sm text-muted-foreground">
              {saveStatus === 'saving' && 'Saving...'}
              {saveStatus === 'saved' && 'All changes saved'}
              {saveStatus === 'idle' && hasUnsavedChanges && 'Unsaved changes'}
              {saveStatus === 'idle' &&
                !hasUnsavedChanges &&
                lastSaved &&
                `Last saved ${lastSaved.toLocaleTimeString()}`}
              {saveStatus === 'idle' &&
                !hasUnsavedChanges &&
                !lastSaved &&
                (form.description || 'Drag and drop components to build your form')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={showAiPanel ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowAiPanel((v) => !v)}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            AI Builder
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/forms/${formId}/preview`)}
          >
            <Eye className="mr-2 h-4 w-4" />
            Preview
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualSave}
            disabled={!hasUnsavedChanges || saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? (
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : saveStatus === 'saved' ? (
              <Check className="mr-2 h-4 w-4" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save
          </Button>
          <Button
            size="sm"
            onClick={handlePublish}
            disabled={publishForm.isPending || form.status === 'ARCHIVED'}
          >
            {publishForm.isPending ? (
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Publish
          </Button>
        </div>
      </div>

      {/* Builder + AI Panel */}
      <div className="flex rounded-lg border bg-white" style={{ minHeight: '600px' }}>
        <div className="flex-1 overflow-auto">
          <FormBuilderWrapper
            key={builderKey}
            initialSchema={appliedSchemaRef.current ?? currentSchema}
            onSchemaChange={handleSchemaChange}
          />
        </div>
        {showAiPanel && (
          <AiChatPanel
            currentSchema={(latestSchemaRef.current ?? currentSchema) as Record<string, unknown>}
            onApplySchema={handleApplyAiSchema}
          />
        )}
      </div>
    </div>
  );
}
