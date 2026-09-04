import type { Metadata } from 'next';
import Link from 'next/link';
import { publishedSections } from '@/lib/docs/registry';
import { siteName } from '@/lib/site';

const title = 'Documentation';
const description =
  'Documentation for OpenMedForm: AI form generation, clinical terminology binding, the JSON Forms schema model, the REST API, and embedding the renderers in an EMR.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/docs' },
  openGraph: {
    type: 'article',
    url: '/docs',
    title: `${title} | ${siteName}`,
    description,
  },
};

/**
 * The docs landing page. Hand-written rather than a bare link list — this is
 * the page most likely to rank for "openmedform documentation", so it should
 * explain what the platform is before it starts linking.
 */
export default function DocsIndexPage() {
  const sections = publishedSections();

  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="text-4xl font-bold tracking-tight">Documentation</h1>
      <p className="mt-5 text-lg text-muted-foreground">
        OpenMedForm is an open-source, AI-powered clinical form builder. It
        generates versioned JSON form schemas from a prompt or an uploaded
        document, binds fields to SNOMED CT, LOINC and ICD-10, renders the
        result natively inside an EMR through the React, Angular and Flutter
        renderers, and recalculates clinical risk scores server-side on every
        submission.
      </p>
      <p className="mt-4 text-muted-foreground">
        These pages are generated from the{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-sm">docs/</code>{' '}
        directory of the repository, so they track the implementation rather
        than being maintained separately.
      </p>

      <div className="mt-12 space-y-10">
        {sections.map((section) => (
          <section key={section.key}>
            <h2 className="text-xl font-semibold tracking-tight">
              {section.title}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {section.docs.map((doc) => (
                <Link
                  key={doc.route}
                  href={doc.route}
                  className="rounded-lg border bg-card p-4 transition-colors hover:border-primary/50"
                >
                  <div className="font-medium">{doc.title}</div>
                  {doc.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {doc.description}
                    </p>
                  ) : null}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
