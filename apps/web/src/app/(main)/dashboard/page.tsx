'use client';

import Link from 'next/link';
import { FileText, Inbox } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAuth } from '@/providers/auth-provider';
import { useFormsCount } from '@/hooks/use-forms';
import { useSubmissionsCount } from '@/hooks/use-submissions';
import { AiSetupNotice } from '@/components/dashboard/ai-setup-notice';

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: formsCount } = useFormsCount();
  const { data: submissionsCount } = useSubmissionsCount();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {user?.name || 'User'}
        </p>
      </div>

      <AiSetupNotice />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/forms">
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Forms</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formsCount?.count ?? '--'}</div>
              <CardDescription>Manage clinical forms</CardDescription>
            </CardContent>
          </Card>
        </Link>

        <Link href="/submissions">
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Records</CardTitle>
              <Inbox className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{submissionsCount?.count ?? '--'}</div>
              <CardDescription>View submitted form records</CardDescription>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
