'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAuth } from '@/providers/auth-provider';

function GoogleCallbackHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { loginWithCode } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setError('Missing sign-in code. Please try again.');
      return;
    }

    // Strip the code from the address bar before anything else, so it does not
    // sit in browser history or leak through a Referer. It is single-use and
    // short-lived, but there is no reason to leave it lying around.
    window.history.replaceState(null, '', window.location.pathname);

    loginWithCode(code)
      .then(() => router.replace('/dashboard'))
      .catch(() => setError('Could not complete sign-in. Please try again.'));
    // `searchParams` is intentionally not a dependency: the effect rewrites the
    // URL, and re-running on that change would try to spend the code twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginWithCode, router]);

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <ClipboardList className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">OpenMedForm</CardTitle>
        <CardDescription>
          {error ? 'Sign-in failed' : 'Completing sign-in...'}
        </CardDescription>
      </CardHeader>
      {error && (
        <CardContent>
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <GoogleCallbackHandler />
    </Suspense>
  );
}
