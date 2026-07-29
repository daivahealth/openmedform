'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const DEFAULT_LIMIT = 5;

interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  tenantName: string;
  formLimit: number | null;
  formsCreated: number;
}

interface AdminStats {
  users: AdminUser[];
}

/**
 * SUPER_ADMIN console for per-user form creation quotas. Users start with
 * DEFAULT_LIMIT forms; raising the limit here writes user.formLimit, which
 * FormService enforces on every creation path (create/import/clone).
 */
export default function AdminLimitsPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: async () => (await api.get('/api/admin/stats')).data,
    enabled: isSuperAdmin,
  });

  const updateLimit = useMutation({
    mutationFn: async ({
      userId,
      formLimit,
    }: {
      userId: string;
      formLimit: number | null;
    }) => {
      await api.patch(`/api/admin/users/${userId}/form-limit`, { formLimit });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
  });

  const [drafts, setDrafts] = useState<Record<string, string>>({});

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
    return <div className="text-muted-foreground">Loading users…</div>;
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg border bg-destructive/10 p-6 text-sm text-destructive">
        Failed to load users{error instanceof Error ? `: ${error.message}` : '.'}
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
        <h1 className="text-2xl font-bold">User form limits</h1>
        <p className="text-sm text-muted-foreground">
          Every user can create up to {DEFAULT_LIMIT} forms by default. Raise an
          individual limit below, or reset it to the default.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">User</th>
              <th className="px-4 py-2 font-medium">Organization</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 text-right font-medium">Forms created</th>
              <th className="px-4 py-2 text-right font-medium">Limit</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => {
              const current = u.formLimit ?? DEFAULT_LIMIT;
              const draft = drafts[u.id];
              const parsed = draft !== undefined ? parseInt(draft, 10) : NaN;
              const dirty =
                draft !== undefined && !Number.isNaN(parsed) && parsed !== current;
              return (
                <tr key={u.id} className="border-t">
                  <td className="px-4 py-2">
                    <div className="font-medium">{u.fullName}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{u.tenantName}</td>
                  <td className="px-4 py-2">
                    <span className="rounded bg-muted px-2 py-0.5 text-xs">{u.role}</span>
                  </td>
                  <td className="px-4 py-2 text-right">{u.formsCreated}</td>
                  <td className="px-4 py-2 text-right">
                    <Input
                      type="number"
                      min={1}
                      max={10000}
                      className="ml-auto h-8 w-24 text-right"
                      value={draft ?? String(current)}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [u.id]: e.target.value }))
                      }
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        disabled={!dirty || updateLimit.isPending}
                        onClick={() => {
                          updateLimit.mutate(
                            { userId: u.id, formLimit: parsed },
                            {
                              onSuccess: () =>
                                setDrafts((d) => {
                                  const next = { ...d };
                                  delete next[u.id];
                                  return next;
                                }),
                            },
                          );
                        }}
                      >
                        Save
                      </Button>
                      {u.formLimit !== null && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={updateLimit.isPending}
                          onClick={() =>
                            updateLimit.mutate({ userId: u.id, formLimit: null })
                          }
                        >
                          Reset
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
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
    </div>
  );
}
