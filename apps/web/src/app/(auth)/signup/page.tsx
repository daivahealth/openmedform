'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { COUNTRIES } from '@/lib/countries';

export default function SignupPage() {
  const [organizationName, setOrganizationName] = useState('');
  const [country, setCountry] = useState('');
  const [error, setError] = useState('');
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100';

  // Signup is Google-only. Organization and country are mandatory and travel
  // through the OAuth handshake (state param) so the API can provision the
  // new tenant with them — they cannot be derived from a Google profile.
  function handleGoogleSignup() {
    const org = organizationName.trim();
    if (!org || !country) {
      setError('Organization and country are required.');
      return;
    }
    setError('');
    const params = new URLSearchParams({ mode: 'signup', org, country });
    window.location.href = `${apiBase}/api/auth/google?${params.toString()}`;
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <ClipboardList className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">Create your organization</CardTitle>
        <CardDescription>
          Sign up with Google to start building dynamic clinical forms
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <label htmlFor="organizationName" className="text-sm font-medium">
              Organization name
            </label>
            <Input
              id="organizationName"
              type="text"
              placeholder="General Hospital"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              required
              maxLength={255}
              autoComplete="organization"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="country" className="text-sm font-medium">
              Country
            </label>
            <select
              id="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="" disabled>
                Select your country
              </option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            className="w-full"
            onClick={handleGoogleSignup}
            disabled={!organizationName.trim() || !country}
          >
            Sign up with Google
          </Button>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <strong>Privacy notice:</strong> OpenMedForm is open-source software
            provided as-is. We do not review, secure, or take any
            responsibility for PII, PHI, or any other personal data you
            upload. Do not upload personal or patient data unless you have
            independently validated this software for your own compliance
            needs. By signing up, you acknowledge that all data you store here
            is entirely your own responsibility.
          </div>
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
