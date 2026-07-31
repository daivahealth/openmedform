'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { cn } from '@/lib/utils';

type GroupBy = 'user' | 'form' | 'tenant' | 'provider';

const TABS: { value: GroupBy; label: string }[] = [
  { value: 'user', label: 'By user' },
  { value: 'form', label: 'By form' },
  { value: 'tenant', label: 'By organization' },
  { value: 'provider', label: 'By provider' },
];

interface UsageRow {
  key: string | null;
  label: string;
  calls: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  lastUsedAt: string | null;
}

interface UsageResponse {
  groupBy: GroupBy;
  totals: {
    calls: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
  };
  rows: UsageRow[];
}

const nf = (n: number) => n.toLocaleString();

/**
 * SUPER_ADMIN token-spend console. The "By form" view is what ai_usage.form_id
 * enables; rows the platform could not attribute to a form (a create run that
 * failed before producing one, or usage predating attribution) appear as
 * "Unattributed" so the grouped rows always reconcile with the total.
 */
export default function AdminUsagePage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [groupBy, setGroupBy] = useState<GroupBy>('user');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data, isLoading, isError, error } = useQuery<UsageResponse>({
    queryKey: ['admin-usage', groupBy, from, to],
    queryFn: async () =>
      (
        await api.get('/api/admin/usage', {
          params: { groupBy, ...(from ? { from } : {}), ...(to ? { to } : {}) },
        })
      ).data,
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

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to analytics
        </Link>
        <h1 className="text-2xl font-bold">Token usage</h1>
        <p className="text-sm text-muted-foreground">
          LLM token spend across the platform, grouped along one dimension.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-1 rounded-lg border p-1">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setGroupBy(tab.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                groupBy === tab.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <label className="text-xs text-muted-foreground">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded-md border px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded-md border px-2 py-1 text-sm"
            />
          </label>
          {(from || to) && (
            <button
              onClick={() => {
                setFrom('');
                setTo('');
              }}
              className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading usage…</div>
      ) : isError || !data ? (
        <div className="rounded-lg border bg-destructive/10 p-6 text-sm text-destructive">
          Failed to load usage{error instanceof Error ? `: ${error.message}` : '.'}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'AI calls', value: data.totals.calls },
              { label: 'Total tokens', value: data.totals.totalTokens },
              { label: 'Input tokens', value: data.totals.inputTokens },
              { label: 'Output tokens', value: data.totals.outputTokens },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </p>
                <p className="mt-1 text-2xl font-bold">{nf(stat.value)}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">
                    {TABS.find((t) => t.value === groupBy)?.label.replace('By ', '')}
                  </th>
                  <th className="px-4 py-2 text-right font-medium">Calls</th>
                  <th className="px-4 py-2 text-right font-medium">Input</th>
                  <th className="px-4 py-2 text-right font-medium">Output</th>
                  <th className="px-4 py-2 text-right font-medium">Total tokens</th>
                  <th className="px-4 py-2 text-right font-medium">Last used</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No AI usage recorded{from || to ? ' in this period' : ''}.
                    </td>
                  </tr>
                ) : (
                  data.rows.map((row) => (
                    <tr key={row.key ?? '__unattributed'} className="border-t">
                      <td className="px-4 py-2">
                        {groupBy === 'form' && row.key ? (
                          <Link
                            href={`/forms/${row.key}/preview`}
                            className="text-primary hover:underline"
                          >
                            {row.label}
                          </Link>
                        ) : (
                          <span className={cn(row.key === null && 'text-muted-foreground italic')}>
                            {row.label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">{nf(row.calls)}</td>
                      <td className="px-4 py-2 text-right">{nf(row.inputTokens)}</td>
                      <td className="px-4 py-2 text-right">{nf(row.outputTokens)}</td>
                      <td className="px-4 py-2 text-right font-medium">
                        {nf(row.totalTokens)}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {row.lastUsedAt
                          ? new Date(row.lastUsedAt).toLocaleDateString()
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
