'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ClipboardList,
  Sparkles,
  Boxes,
  Database,
  Globe2,
  ShieldCheck,
  Workflow,
  Calculator,
  ArrowRight,
  Github,
  Plug,
  Printer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { ArchitectureDiagram } from '@/components/marketing/architecture-diagram';
import { IntegrationSteps, RendererInstall } from '@/components/marketing/emr-integration';

export default function LandingPage() {
  const { token, isLoading } = useAuth();
  const router = useRouter();

  // Logged-in users skip the marketing page and go straight to the app.
  useEffect(() => {
    if (!isLoading && token) {
      router.replace('/dashboard');
    }
  }, [token, isLoading, router]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">OpenMedForm</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <a href="#integrate">
                <Plug className="mr-2 h-4 w-4" />
                Integrate
              </a>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-20 text-center">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-1.5 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          AI-powered clinical form platform
        </div>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Dynamic clinical forms for every EMR, every geography.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          EMRs and EHRs need endless forms — for compliance, assessments, and daily care.
          Building them by hand is slow, and every region needs different ones, so the static
          forms baked into an EHR never keep up. OpenMedForm lets you generate dynamic forms
          with AI, drop them into your product with React or Angular renderers, and store every
          response as JSON in your own database.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/signup">
              Start free <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="#integrate">
              <Plug className="mr-2 h-4 w-4" />
              Integrate in 3 steps
            </a>
          </Button>
        </div>
      </section>

      {/* Problem */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-16 md:grid-cols-3">
          {[
            {
              icon: Workflow,
              title: 'Too many forms',
              body: 'Every EMR/EHR needs dozens of forms for compliance, risk assessments, consent and daily workflows. Authoring each one by hand does not scale.',
            },
            {
              icon: Globe2,
              title: 'Every geography differs',
              body: 'Regulations, languages and clinical practice vary by region — the same form needs many variants. One static set can never fit them all.',
            },
            {
              icon: Boxes,
              title: 'Static EHR forms break',
              body: 'Forms hard-coded into an EHR are rigid and slow to change. Clinical teams end up waiting on engineering for every small update.',
            },
          ].map((c) => (
            <div key={c.title} className="rounded-lg border bg-card p-6">
              <c.icon className="mb-3 h-6 w-6 text-primary" />
              <h3 className="mb-1 font-semibold">{c.title}</h3>
              <p className="text-sm text-muted-foreground">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Solution + diagram */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            Build once. Render anywhere. Own your data.
          </h2>
          <p className="mt-4 text-muted-foreground">
            OpenMedForm sits alongside your EMR. Describe a form or upload a PDF, and AI generates
            a versioned JSON schema. Embed it with our React or Angular renderer, and every
            submission is scored server-side and stored as JSON — in your database, not ours.
          </p>
        </div>

        <div className="mt-12 overflow-x-auto rounded-xl border bg-card p-6 shadow-sm">
          <ArchitectureDiagram />
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-16 md:grid-cols-2 lg:grid-cols-5">
          {[
            {
              icon: Sparkles,
              title: 'AI form builder',
              body: 'Generate complex clinical forms from a prompt, PDF, or image — with multiple LLM providers.',
            },
            {
              icon: Boxes,
              title: 'React & Angular renderers',
              body: 'Drop-in renderers for both frameworks share one schema, so your EMR integration is trivial.',
            },
            {
              icon: Database,
              title: 'JSON in your database',
              body: 'Schemas and submissions are plain JSON. Keep them in your own store — full data ownership.',
            },
            {
              icon: Calculator,
              title: 'Server-side scoring',
              body: 'Clinical risk scores are recalculated on the server at submission — never trusting the client.',
            },
            {
              icon: Printer,
              title: 'Print-ready A4 & PDF',
              body: 'Every form renders to a print-accurate A4 document — preview, print, or generate a PDF from the same JSON.',
            },
          ].map((c) => (
            <div key={c.title} className="rounded-lg border bg-card p-6">
              <c.icon className="mb-3 h-6 w-6 text-primary" />
              <h3 className="mb-1 font-semibold">{c.title}</h3>
              <p className="text-sm text-muted-foreground">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* EMR integration guide — the key developer story, given its own band */}
      <section id="integrate" className="scroll-mt-20 border-y bg-primary/5">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-sm font-medium text-primary">
              <Plug className="h-4 w-4" />
              For developers
            </div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Integrate with your EMR in 3 steps
            </h2>
            <p className="mt-4 text-muted-foreground">
              From paper form to a native screen inside your EMR — no form
              engineering required.
            </p>
          </div>
          <div className="mt-12">
            <IntegrationSteps />
          </div>
          <div className="mt-12">
            <h3 className="mb-4 text-center text-lg font-semibold">
              Install the renderer, load the JSON
            </h3>
            <RendererInstall />
            <p className="mx-auto mt-6 flex max-w-2xl items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <Printer className="h-4 w-4 shrink-0 text-primary" />
              Need a paper copy? The same JSON renders to a print-accurate A4 document
              (and PDF) via <code className="rounded bg-muted px-1 py-0.5 text-xs">@openmedform/form-print-engine</code>.
            </p>
          </div>
          <div className="mt-10 text-center">
            <Button size="lg" asChild>
              <Link href="/signup">
                Start integrating <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <div className="mx-auto flex max-w-2xl flex-col items-center rounded-2xl border bg-card p-10">
          <ShieldCheck className="mb-4 h-8 w-8 text-primary" />
          <h2 className="text-2xl font-bold">Ready to modernise your clinical forms?</h2>
          <p className="mt-2 text-muted-foreground">
            Create your organization in seconds. No credit card required.
          </p>
          <Button size="lg" className="mt-6" asChild>
            <Link href="/signup">
              Create your account <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground sm:flex-row sm:justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              <span>OpenMedForm</span>
            </div>
            <div className="flex items-center gap-4">
              <span>AI-powered clinical form builder platform</span>
              <a
                href="https://github.com/daivahealth/openmedform"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="GitHub repository"
              >
                <Github className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Sponsor credit. The logo is athma's own brand asset, so it is shown
              as-is (never recoloured) and links back to athma.health. */}
          <div className="mt-8 flex flex-col items-center gap-3 border-t pt-8">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Primary sponsor
            </span>
            <a
              href="https://athma.health/"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-opacity hover:opacity-80"
              aria-label="athma — primary sponsor of OpenMedForm"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a static
                  SVG mark needs no next/image optimisation pipeline. */}
              <img
                src="/athma-logo.svg"
                alt="athma"
                width={132}
                height={38}
                className="h-9 w-auto"
              />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
