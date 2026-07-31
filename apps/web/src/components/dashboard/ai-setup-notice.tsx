'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspaceStatus } from '@/hooks/use-workspace-status';
import { cn } from '@/lib/utils';

/**
 * Nudges a tenant toward configuring its own AI provider — never blocks form
 * building. Hidden entirely for SUPER_ADMIN (exempt from the quota) and once
 * the tenant has its own provider (the goal is already met).
 *
 * Dismissal is session-only (component state, not persisted): a stale
 * persisted "dismissed forever" flag could hide a real "no AI configured at
 * all" or "at your limit" state indefinitely. Reload to see it again.
 */
export function AiSetupNotice() {
  const { data, isLoading } = useWorkspaceStatus();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || !data || dismissed) return null;

  const { quota, ai, contactEmail } = data;
  if (quota.reason === 'super-admin' || quota.reason === 'own-ai-provider') {
    return null;
  }

  const noAiAtAll = ai.effectiveSource === 'none';
  const atLimit = !quota.unlimited && (quota.remaining ?? 0) <= 0;
  const tone: 'warning' | 'info' = noAiAtAll || atLimit ? 'warning' : 'info';

  const toneClasses = {
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    info: 'border-blue-200 bg-blue-50 text-blue-900',
  }[tone];

  const title = noAiAtAll
    ? 'No AI provider configured yet'
    : atLimit
      ? `You've reached your free-form limit`
      : `You've used ${quota.used} of ${quota.limit} free forms`;

  const description = noAiAtAll
    ? `AI-assisted form building needs an AI provider. Configure one in AI Settings to start generating forms — or ask your admin at ${contactEmail} to raise your limit.`
    : atLimit
      ? `Configure your own AI provider for unlimited forms, or contact your admin at ${contactEmail} to raise your limit.`
      : `Configure your own AI provider for unlimited forms — this won't stop you from building forms in the meantime.`;

  return (
    <div className={cn('flex items-start gap-3 rounded-lg border p-4', toneClasses)}>
      {tone === 'info' ? (
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0" />
      ) : (
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
      )}
      <div className="flex-1 space-y-2">
        <p className="font-medium">{title}</p>
        <p className="text-sm opacity-90">{description}</p>
        <Link href="/settings">
          <Button size="sm" variant="outline" className="bg-white">
            Configure AI Provider
          </Button>
        </Link>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 opacity-60 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
