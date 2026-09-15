import path from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeStringify from 'rehype-stringify';
import rehypeShiki from '@shikijs/rehype';
import { visit } from 'unist-util-visit';
import type { Root, Element } from 'hast';
import { allDocs, type DocMeta } from './registry';
import { githubUrl } from '@/lib/site';

const githubBlob = `${githubUrl}/blob/main`;

/**
 * Rewrites the links inside a doc so the published page points at real URLs.
 *
 * Markdown under docs/ is written to be read on disk and on GitHub, so its
 * links are filesystem-relative. Three cases:
 *
 *   ../ADR/004-....md      another doc      -> its /docs route
 *   ../../apps/api/...     repository file  -> a GitHub blob URL
 *   https://...            external         -> untouched, but marked noopener
 *
 * A link to a doc that exists but is not published fails the build. That is
 * the whole point of the publish gate: silently emitting a dead link into
 * public documentation is worse than refusing to build.
 */
function rewriteLinks(doc: DocMeta) {
  const docDir = path.posix.dirname(doc.sourcePath);
  const known = allDocs();

  return () => (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'a') return;
      const href = node.properties?.href;
      if (typeof href !== 'string') return;

      if (/^(https?:)?\/\//.test(href) || href.startsWith('mailto:')) {
        node.properties.target = '_blank';
        node.properties.rel = ['noopener', 'noreferrer'];
        return;
      }

      // In-page anchors need no rewriting.
      if (href.startsWith('#')) return;

      const [rawTarget, hash] = href.split('#');
      if (!rawTarget) return;

      // Resolve against the doc's own directory, as a reader on disk would.
      const resolved = path.posix.normalize(path.posix.join(docDir, rawTarget));

      if (resolved.startsWith('../')) {
        // Escapes docs/ — a link into the repository itself.
        const repoPath = path.posix.normalize(
          path.posix.join('docs', docDir, rawTarget),
        );
        node.properties.href = `${githubBlob}/${repoPath}`;
        node.properties.target = '_blank';
        node.properties.rel = ['noopener', 'noreferrer'];
        return;
      }

      if (!resolved.endsWith('.md')) {
        // A non-markdown file inside docs/ (an image, say). Leave it alone
        // rather than guess; there are none today, and a wrong guess here
        // would be silent.
        return;
      }

      const target = known.find((d) => d.sourcePath === resolved);
      if (!target) {
        throw new Error(
          `docs/${doc.sourcePath}: link "${href}" points at docs/${resolved}, which does not exist.`,
        );
      }
      if (!target.publish) {
        throw new Error(
          `docs/${doc.sourcePath}: link "${href}" points at docs/${resolved}, which is not published ` +
            `(publish: false). Either publish that doc or rewrite the link — a published page must not ` +
            `link to a page that will 404.`,
        );
      }

      node.properties.href = hash ? `${target.route}#${hash}` : target.route;
    });
  };
}

/**
 * rehype-autolink-headings supplied as a zero-argument plugin.
 *
 * unified's `use(plugin, options)` overload cannot resolve this plugin's
 * options type — it matches the `[boolean]` member of the parameter union and
 * reports that instead. Calling the plugin directly to get its transformer
 * sidesteps the overload while keeping the options fully type-checked.
 */
const autolinkHeadings = () =>
  rehypeAutolinkHeadings({
    behavior: 'wrap',
    properties: { className: ['omf-doc-anchor'] },
  });

/** Markdown body -> HTML string. Build time only. */
export async function renderDoc(doc: DocMeta, body: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(autolinkHeadings)
    // The app has no dark mode, so a single light theme is correct here.
    .use(rehypeShiki, { theme: 'github-light' })
    .use(rewriteLinks(doc))
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(body);

  return String(file);
}

/** Headings for the on-page table of contents. */
export interface TocEntry {
  id: string;
  text: string;
  depth: 2 | 3;
}

export function extractToc(html: string): TocEntry[] {
  const entries: TocEntry[] = [];
  // [\s\S] rather than the `s` flag: the app targets a pre-ES2018 output.
  const pattern = /<h([23]) id="([^"]+)"[^>]*>([\s\S]*?)<\/h[23]>/g;

  for (const match of html.matchAll(pattern)) {
    const text = match[3].replace(/<[^>]+>/g, '').trim();
    if (!text) continue;
    entries.push({
      id: match[2],
      text,
      depth: Number(match[1]) as 2 | 3,
    });
  }

  return entries;
}
