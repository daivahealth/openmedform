'use client';

import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AiProviderManager } from '@/components/settings/ai-provider-manager';

/**
 * Tenant-scoped AI provider console. This screen is now ALWAYS the caller's own
 * organization — including for a SUPER_ADMIN, who previously could only ever
 * reach the global fallback set from here and so had no way to configure their
 * own tenant. The platform-wide set moved to its own labelled screen at
 * /admin/ai-providers.
 */
export default function SettingsPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure AI providers for your organization
        </p>
      </div>

      {isSuperAdmin && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-900">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-medium">This page configures your own organization</p>
            <p className="opacity-90">
              To manage the platform-wide fallback used by organizations without their
              own providers, go to{' '}
              <Link href="/admin/ai-providers" className="font-medium underline">
                Admin → Global AI Providers
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <AiProviderManager
            scope="tenant"
            title="AI Providers"
            description="LLM providers for AI-powered form generation in your organization. Adding one also lifts the free-tier form limit."
          />
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Platform Info</CardTitle>
            <CardDescription>OpenMedForm system information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Version</span>
                <span className="font-mono">0.1.0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Backend</span>
                <span className="font-mono">NestJS 10</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Frontend</span>
                <span className="font-mono">Next.js 14</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Form Engine</span>
                <span className="font-mono">JSON Forms 3.8</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Database</span>
                <span className="font-mono">PostgreSQL 16</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
