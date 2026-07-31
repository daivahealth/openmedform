'use client';

import Link from 'next/link';
import { ArrowLeft, Globe } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { AiProviderManager } from '@/components/settings/ai-provider-manager';

/**
 * SUPER_ADMIN console for the platform-wide AI provider fallback.
 *
 * These keys serve every organization that has NOT configured its own
 * providers (resolution order: tenant -> global -> env). Kept separate from
 * /settings, which is always the caller's own organization, so each screen
 * states plainly which set it edits.
 */
export default function AdminAiProvidersPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  if (!isSuperAdmin) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <h1 className="text-lg font-semibold">Admin access required</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This console is only available to platform administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to analytics
        </Link>
        <h1 className="text-2xl font-bold">Global AI providers</h1>
        <p className="text-sm text-muted-foreground">
          The platform-wide fallback used by every organization that has not configured
          its own providers.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <Globe className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="flex-1 text-sm">
          <p className="font-medium">These keys are billed to the platform</p>
          <p className="opacity-90">
            Resolution order is <strong>tenant → global → environment</strong>. An
            organization that adds its own provider stops using these keys — and its
            free-tier form limit is lifted, since it then pays for its own AI usage.
            To configure your <em>own</em> organization instead, use{' '}
            <Link href="/settings" className="font-medium underline">
              AI Settings
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="max-w-4xl">
        <AiProviderManager
          scope="global"
          title="Platform fallback providers"
          description="Used when an organization has no AI provider of its own."
        />
      </div>
    </div>
  );
}
