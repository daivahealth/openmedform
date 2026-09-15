import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

/**
 * Discovery and routing for the published documentation set.
 *
 * The markdown under docs/ is the canonical source: this module is a read-only
 * projection of it. Everything here runs at build time only — pages are fully
 * prerendered, so the running container never touches the filesystem.
 */

/** docs/ lives at the workspace root, two levels above apps/web. */
export const docsRoot = path.join(process.cwd(), '..', '..', 'docs');

export interface DocMeta {
  /** Path relative to docs/, e.g. "features/PDF-TO-FORM.md". */
  sourcePath: string;
  /** Route segments below /docs, e.g. ["features", "pdf-to-form"]. */
  slug: string[];
  /** Route path, e.g. "/docs/features/pdf-to-form". */
  route: string;
  /** Family the doc belongs to, e.g. "features". */
  section: string;
  /** The document's H1. */
  title: string;
  /** Frontmatter description, used for meta description and index cards. */
  description: string;
  publish: boolean;
}

function toSlug(segment: string): string {
  return segment
    .replace(/\.md$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Route path for any docs-relative source path, published or not.
 *
 * A README is the index of its directory, so docs/api/README.md becomes
 * /docs/api rather than the meaningless /docs/api/readme.
 */
export function routeForSource(sourcePath: string): string {
  const segments = sourcePath.split('/').map(toSlug);
  if (segments.length > 1 && segments[segments.length - 1] === 'readme') {
    segments.pop();
  }
  return `/docs/${segments.join('/')}`;
}

function firstHeading(body: string, sourcePath: string): string {
  const match = body.match(/^#\s+(.+)$/m);
  if (!match) {
    throw new Error(
      `docs/${sourcePath} has no H1. Every published doc needs one — it becomes the page title.`,
    );
  }
  return match[1].trim();
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.md') ? [full] : [];
  });
}

let cached: DocMeta[] | null = null;

/**
 * Every markdown file under docs/, published or not.
 *
 * The withheld ones are kept in the list rather than filtered out here so the
 * link checker can tell "links to a private doc" (an error worth failing the
 * build over) apart from "links to a file that does not exist".
 */
export function allDocs(): DocMeta[] {
  if (cached) return cached;

  cached = walk(docsRoot)
    .map((absolute) => {
      const sourcePath = path
        .relative(docsRoot, absolute)
        .split(path.sep)
        .join('/');
      const raw = fs.readFileSync(absolute, 'utf8');
      const { data, content } = matter(raw);
      const publish = data.publish === true;

      return {
        sourcePath,
        slug: routeForSource(sourcePath).replace('/docs/', '').split('/'),
        route: routeForSource(sourcePath),
        section: sourcePath.includes('/') ? sourcePath.split('/')[0] : 'root',
        title: publish ? firstHeading(content, sourcePath) : '',
        description: typeof data.description === 'string' ? data.description : '',
        publish,
      } satisfies DocMeta;
    })
    .sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));

  return cached;
}

export function publishedDocs(): DocMeta[] {
  return allDocs().filter((doc) => doc.publish);
}

export function findBySlug(slug: string[]): DocMeta | undefined {
  const route = `/docs/${slug.join('/')}`;
  return publishedDocs().find((doc) => doc.route === route);
}

/** Read a doc's markdown body with its frontmatter stripped. */
export function readBody(doc: DocMeta): string {
  const raw = fs.readFileSync(path.join(docsRoot, doc.sourcePath), 'utf8');
  return matter(raw).content;
}

/**
 * Display order for the families in the sidebar and on the index. Anything not
 * listed sorts to the end alphabetically.
 */
const sectionOrder = [
  'features',
  'architecture',
  'api',
  'integration',
  'security',
  'ADR',
];

export const sectionTitles: Record<string, string> = {
  features: 'Features',
  architecture: 'Architecture',
  api: 'API',
  integration: 'Integration',
  security: 'Security',
  ADR: 'Decisions',
};

export interface DocSection {
  key: string;
  title: string;
  docs: DocMeta[];
}

export function publishedSections(): DocSection[] {
  const grouped = new Map<string, DocMeta[]>();
  for (const doc of publishedDocs()) {
    const list = grouped.get(doc.section) ?? [];
    list.push(doc);
    grouped.set(doc.section, list);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => {
      const ia = sectionOrder.indexOf(a);
      const ib = sectionOrder.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    })
    .map(([key, docs]) => ({
      key,
      title: sectionTitles[key] ?? key,
      docs: docs.sort((a, b) => a.title.localeCompare(b.title)),
    }));
}
