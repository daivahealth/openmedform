'use client';

import { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useFormAssets, useUploadAsset, useDeleteAsset } from '@/hooks/use-assets';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';

interface AssetsDialogProps {
  formId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Manage the logos/images attached to a form. Uploaded assets are stored with
 * the form and bundled (as base64) into its downloadable export, so a
 * third-party app has everything it needs to render offline.
 */
export function AssetsDialog({ formId, open, onOpenChange }: AssetsDialogProps) {
  const { data: assets, isLoading } = useFormAssets(formId);
  const upload = useUploadAsset(formId);
  const remove = useDeleteAsset(formId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError('');
    try {
      await upload.mutateAsync(file);
    } catch {
      setError('Upload failed. Assets must be PNG, JPEG, WebP, GIF, SVG, or PDF (max 10 MB).');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Form assets</DialogTitle>
          <DialogDescription>
            Logos and images attached to this form. They are bundled into the downloaded
            definition so external apps can render it without extra files.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf"
          className="hidden"
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.currentTarget.value = '';
          }}
        />

        <Button
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          className="w-full"
        >
          {upload.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ImagePlus className="mr-2 h-4 w-4" />
          )}
          Upload asset
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="max-h-[320px] space-y-2 overflow-y-auto">
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : !assets?.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No assets yet. Upload a logo or image to bundle it with this form.
            </p>
          ) : (
            assets.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.mimeType} · {formatBytes(a.sizeBytes)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => remove.mutate(a.id)}
                  disabled={remove.isPending}
                  aria-label={`Delete ${a.filename}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
