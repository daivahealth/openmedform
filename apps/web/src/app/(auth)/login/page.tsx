'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ClipboardList, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type Provider = 'google' | 'microsoft';

export default function LoginPage() {
  const apiBase =
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100';

  // Sign-in is a full-page navigation to the API, not a fetch, so React never
  // re-renders after the click and the page sits there looking frozen for as
  // long as the redirect chain takes. Track the click ourselves to show that
  // something is happening.
  const [pending, setPending] = useState<Provider | null>(null);

  useEffect(() => {
    // Coming back with the browser's back button can restore this page from
    // the bfcache with its React state intact, which would leave a button
    // spinning at a user who is no longer waiting for anything.
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(null);
    };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

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
          <SsoButton
            provider="google"
            href={`${apiBase}/api/auth/google`}
            label="Sign in with Google"
            icon={<GoogleIcon className="mr-2 h-4 w-4" />}
            pending={pending}
            onStart={setPending}
          />
          <SsoButton
            provider="microsoft"
            href={`${apiBase}/api/auth/microsoft`}
            label="Sign in with Microsoft"
            icon={<MicrosoftIcon className="mr-2 h-4 w-4" />}
            pending={pending}
            onStart={setPending}
          />
        </div>
        {pending && (
          <p
            className="mt-3 text-center text-sm text-muted-foreground"
            role="status"
          >
            This can take a few seconds.
          </p>
        )}
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

/**
 * One provider button.
 *
 * Deliberately still an anchor: the href is what makes middle-click, "open in
 * new tab" and keyboard activation work, and it is what the user lands on if
 * the click handler never runs. The handler only adds the visual state — it
 * does not perform the navigation.
 */
function SsoButton({
  provider,
  href,
  label,
  icon,
  pending,
  onStart,
}: {
  provider: Provider;
  href: string;
  label: string;
  icon: React.ReactNode;
  pending: Provider | null;
  onStart: (provider: Provider) => void;
}) {
  const isPending = pending === provider;
  // Once one provider is in flight, the other would only start a second
  // redirect the user cannot see the result of.
  const isBlocked = pending !== null && !isPending;

  return (
    <Button variant="outline" className="w-full" asChild aria-busy={isPending}>
      <a
        href={href}
        aria-disabled={isBlocked}
        className={isBlocked ? 'pointer-events-none opacity-60' : undefined}
        onClick={(event) => {
          if (isBlocked) {
            event.preventDefault();
            return;
          }
          onStart(provider);
        }}
      >
        {isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          icon
        )}
        {isPending ? 'Redirecting…' : label}
      </a>
    </Button>
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
