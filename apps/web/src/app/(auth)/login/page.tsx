'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function LoginPage() {
  const apiBase =
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100';

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <ClipboardList className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">OpenMedForm</CardTitle>
        <CardDescription>
          Sign in to the clinical form management platform
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* SSO errors arrive as ?error=...&message=... after the API redirect */}
        <Suspense>
          <SsoErrorNotice />
        </Suspense>
        <div className="space-y-2">
          <Button variant="outline" className="w-full" asChild>
            <a href={`${apiBase}/api/auth/google`}>
              <GoogleIcon className="mr-2 h-4 w-4" />
              Sign in with Google
            </a>
          </Button>
          <Button variant="outline" className="w-full" asChild>
            <a href={`${apiBase}/api/auth/microsoft`}>
              <MicrosoftIcon className="mr-2 h-4 w-4" />
              Sign in with Microsoft
            </a>
          </Button>
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          New to OpenMedForm?{' '}
          <a href="/signup" className="font-medium text-primary hover:underline">
            Create an organization
          </a>
        </p>
      </CardContent>
    </Card>
  );
}

function SsoErrorNotice() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  // 'google_sso' is what the API emitted before the filter became
  // provider-neutral; still accepted so an in-flight redirect from an older
  // revision does not land on a silently empty page.
  if (error !== 'sso' && error !== 'google_sso') {
    return null;
  }
  const message =
    searchParams.get('message') || 'Sign-in failed. Please try again.';
  return (
    <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </div>
  );
}

/** Microsoft's four-square logo (lucide has no brand icons). */
function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 23 23" aria-hidden="true">
      <path fill="#f35325" d="M1 1h10v10H1z" />
      <path fill="#81bc06" d="M12 1h10v10H12z" />
      <path fill="#05a6f0" d="M1 12h10v10H1z" />
      <path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  );
}

/** Official Google "G" mark (lucide has no brand icons). */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}
