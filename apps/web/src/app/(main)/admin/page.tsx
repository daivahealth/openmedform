'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  Users,
  FileText,
  Inbox,
  Sparkles,
  Coins,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';

interface AdminStats {
  totals: {
    tenants: number;
    users: number;
    forms: number;
    submissions: number;
    aiGenerations: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
  };
  tenants: Array<{
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    createdAt: string;
    users: number;
    forms: number;
    submissions: number;
    totalTokens: number;
  }>;
  users: Array<{
    id: string;
    email: string;
    fullName: string;
    role: string;
    isActive: boolean;
    tenantName: string;
    lastLoginAt: string | null;
    createdAt: string;
    formsCreated: number;
    totalTokens: number;
  }>;
  usageByProvider: Array<{ provider: string; generations: number; totalTokens: number }>;
  recentLogins: Array<{
    email: string | null;
    method: string | null;
    ipAddress: string | null;
    at: string;
  }>;
}

const nf = (n: number) => n.toLocaleString();
const dt = (s: string | null) =>
  s ? new Date(s).toLocaleString() : '—';

export default function AdminPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const { data, isLoading, isError, error } = useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: async () => (await api.get('/api/admin/stats')).data,
    enabled: isSuperAdmin,
  });

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

  if (isLoading) {
    return <div className="text-muted-foreground">Loading platform stats…</div>;
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg border bg-destructive/10 p-6 text-sm text-destructive">
        Failed to load stats{error instanceof Error ? `: ${error.message}` : '.'}
      </div>
    );
  }

  const cards = [
    { icon: Building2, label: 'Organizations', value: data.totals.tenants },
    { icon: Users, label: 'Users', value: data.totals.users },
    { icon: FileText, label: 'Forms', value: data.totals.forms },
    { icon: Inbox, label: 'Submissions', value: data.totals.submissions },
    { icon: Sparkles, label: 'AI generations', value: data.totals.aiGenerations },
    { icon: Coins, label: 'Tokens used', value: data.totals.totalTokens },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Platform analytics</h1>
        <p className="text-sm text-muted-foreground">
          Cross-organization overview of usage, forms, and AI token consumption.
        </p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-4">
            <c.icon className="mb-2 h-5 w-5 text-primary" />
            <div className="text-2xl font-bold">{nf(c.value)}</div>
            <div className="text-xs text-muted-foreground">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Users */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Users</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Organization</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Last login</th>
                <th className="px-4 py-2 text-right font-medium">Forms</th>
                <th className="px-4 py-2 text-right font-medium">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-4 py-2">
                    <div className="font-medium">{u.fullName}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </td>
                  <td className="px-4 py-2">{u.tenantName}</td>
                  <td className="px-4 py-2">
                    <span className="rounded bg-muted px-2 py-0.5 text-xs">{u.role}</span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{dt(u.lastLoginAt)}</td>
                  <td className="px-4 py-2 text-right">{nf(u.formsCreated)}</td>
                  <td className="px-4 py-2 text-right">{nf(u.totalTokens)}</td>
                </tr>
              ))}
              {data.users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Organizations */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Organizations</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Organization</th>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 text-right font-medium">Users</th>
                <th className="px-4 py-2 text-right font-medium">Forms</th>
                <th className="px-4 py-2 text-right font-medium">Submissions</th>
                <th className="px-4 py-2 text-right font-medium">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {data.tenants.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="px-4 py-2">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.slug}</div>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{dt(t.createdAt)}</td>
                  <td className="px-4 py-2 text-right">{nf(t.users)}</td>
                  <td className="px-4 py-2 text-right">{nf(t.forms)}</td>
                  <td className="px-4 py-2 text-right">{nf(t.submissions)}</td>
                  <td className="px-4 py-2 text-right">{nf(t.totalTokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Usage by provider */}
        <section>
          <h2 className="mb-3 text-lg font-semibold">AI usage by provider</h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Provider</th>
                  <th className="px-4 py-2 text-right font-medium">Generations</th>
                  <th className="px-4 py-2 text-right font-medium">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {data.usageByProvider.map((p) => (
                  <tr key={p.provider} className="border-t">
                    <td className="px-4 py-2 font-medium">{p.provider}</td>
                    <td className="px-4 py-2 text-right">{nf(p.generations)}</td>
                    <td className="px-4 py-2 text-right">{nf(p.totalTokens)}</td>
                  </tr>
                ))}
                {data.usageByProvider.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                      No AI usage recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Recent logins */}
        <section>
          <h2 className="mb-3 text-lg font-semibold">Recent logins</h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">User</th>
                  <th className="px-4 py-2 font-medium">Method</th>
                  <th className="px-4 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {data.recentLogins.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-4 py-2">{r.email ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className="rounded bg-muted px-2 py-0.5 text-xs">
                        {r.method ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{dt(r.at)}</td>
                  </tr>
                ))}
                {data.recentLogins.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                      No logins recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
