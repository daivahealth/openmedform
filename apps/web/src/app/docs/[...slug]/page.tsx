import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { findBySlug, publishedDocs, readBody } from '@/lib/docs/registry';
import { extractToc, renderDoc } from '@/lib/docs/render';
import { githubUrl, siteName, siteUrl } from '@/lib/site';

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

/**
 * Enumerating every published doc here makes each page fully static: the
 * markdown is read and rendered at build time and baked into the HTML, so the
 * running container never touches the filesystem.
 */
export function generateStaticParams() {
  return publishedDocs().map((doc) => ({ slug: doc.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = findBySlug(slug);
  if (!doc) return {};

  return {
    title: doc.title,
    description: doc.description,
    alternates: { canonical: doc.route },
    openGraph: {
      type: 'article',
      url: doc.route,
      title: `${doc.title} | ${siteName}`,
      description: doc.description,
    },
  };
}

export default async function DocPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = findBySlug(slug);
  if (!doc) notFound();

  const html = await renderDoc(doc, readBody(doc));
  const toc = extractToc(html);

  // TechArticle rather than Article: this is reference documentation, and the
  // distinction is what lets an assistant treat it as a citable source.
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: doc.title,
    description: doc.description,
    url: `${siteUrl}${doc.route}`,
    isPartOf: { '@type': 'WebSite', '@id': `${siteUrl}/#website` },
    publisher: { '@id': `${siteUrl}/#organization` },
  };

  return (
    <div className="flex gap-10">
      <article className="min-w-0 max-w-3xl flex-1">
        <script
          type="application/ld+json"
          // Serialized from build-time constants; no user input reaches this.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
        {doc.description ? (
          <p className="mb-8 border-l-2 border-primary/40 pl-4 text-lg text-muted-foreground">
            {doc.description}
          </p>
        ) : null}
        <div
          className="omf-doc"
          // Rendered from repository markdown at build time by the pipeline in
          // lib/docs/render.ts. The input is version-controlled source, not
          // user content.
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <footer className="mt-16 border-t pt-6 text-sm text-muted-foreground">
          <a
            href={`${githubUrl}/blob/main/docs/${doc.sourcePath}`}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            Edit this page on GitHub
          </a>
        </footer>
      </article>

      {toc.length > 2 ? (
        <aside className="hidden w-56 shrink-0 xl:block">
          <div className="sticky top-24">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              On this page
            </div>
            <ul className="space-y-1 text-sm">
              {toc.map((entry) => (
                <li
                  key={entry.id}
                  className={entry.depth === 3 ? 'pl-3' : undefined}
                >
                  <a
                    href={`#${entry.id}`}
                    className="block text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {entry.text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
