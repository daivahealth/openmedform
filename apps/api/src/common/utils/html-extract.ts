import { parse, HTMLElement, NodeType } from 'node-html-parser';

/**
 * Turn an uploaded HTML mock-up into inert, semantic source text for the AI
 * conversion pipeline.
 *
 * SECURITY MODEL — the uploaded file is untrusted and is treated as *inert
 * text only*:
 * - It is never rendered, never executed, and no headless browser is involved.
 * - No network access of any kind: `src`/`href`/`srcset`/`@import` are dropped
 *   rather than resolved, so there is no SSRF or `file://` read surface.
 * - Parsed with a lenient HTML parser (never an XML parser), so there is no
 *   XXE surface.
 * - Executable and non-visual content (`script`, `style`, `iframe`, event
 *   handlers, …) is removed by an element/attribute ALLOW-list, so anything
 *   unanticipated is dropped by default rather than passed through.
 * - Content hidden from a human reader (`display:none`, `hidden`,
 *   `aria-hidden`, HTML comments, …) is removed, because it is the natural
 *   place to smuggle instructions past the person uploading the file and into
 *   the LLM. Removal is reported in `warnings` so it is never silent.
 *
 * Downstream, extracted strings only ever become JSON schema values; the React
 * and Angular renderers escape by default (no innerHTML anywhere) and the print
 * engine escapes explicitly, so this text never re-enters an HTML context.
 */

/** Removed outright, including their subtree. */
const STRIPPED_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'iframe',
  'object',
  'embed',
  'applet',
  'canvas',
  'template',
  'link',
  'meta',
  'base',
  'audio',
  'video',
  'source',
  'track',
  'map',
  'area',
  'svg',
  'math',
]);

/**
 * Attributes kept on surviving elements. An allow-list (not a deny-list) so
 * `on*` handlers, `src`, `href`, `formaction`, `srcset` and anything new are
 * dropped automatically. `class`/`style` are retained deliberately: Tailwind
 * utilities and inline colours are how a mock-up encodes section accent
 * colours, which the converter maps to `options.omf.accentColor`.
 */
const KEPT_ATTRIBUTES = new Set([
  'type',
  'checked',
  'selected',
  'disabled',
  'readonly',
  'multiple',
  'placeholder',
  'value',
  'name',
  'id',
  'for',
  'colspan',
  'rowspan',
  'headers',
  'scope',
  'alt',
  'label',
  'title',
  'aria-label',
  'role',
  'class',
  'style',
  'min',
  'max',
  'step',
  'maxlength',
  'rows',
  'cols',
]);

/** Inline-style patterns that mean "a human cannot see this". */
const HIDDEN_STYLE = /(^|;)\s*(display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(\.0*)?\s*(;|$)|font-size\s*:\s*0)/i;

export interface HtmlExtractStats {
  /** Interactive inputs of any kind — the main driver of conversion size. */
  fields: number;
  checkboxes: number;
  radios: number;
  tables: number;
  tableRows: number;
  /** fieldset / section / heading — roughly "boxes on the page". */
  sections: number;
  /** Length of the cleaned HTML actually handed to the model. */
  textLength: number;
}

export interface HtmlExtractResult {
  /** Cleaned, inert HTML to use as the conversion source. */
  cleanedHtml: string;
  stats: HtmlExtractStats;
  /** Human-facing notes (hidden content removed, truncation, …). */
  warnings: string[];
  /** True when the source looked like several standalone documents. */
  looksMultiDocument: boolean;
  /**
   * Named containers that were empty in the markup while the document also
   * carried scripts — i.e. sections a browser would fill in at runtime. We
   * never execute the page, so their real contents are genuinely unavailable;
   * naming them lets the reviewer add those fields by hand instead of letting
   * the model invent something plausible for an empty box.
   */
  scriptFilledPlaceholders: string[];
}

export interface HtmlExtractOptions {
  /** Cap on the cleaned HTML handed to the model (mirrors the PDF text cap). */
  maxChars?: number;
}

const DEFAULT_MAX_CHARS = 24_000;

function isHidden(el: HTMLElement): boolean {
  if (el.hasAttribute('hidden')) return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;
  const style = el.getAttribute('style');
  if (style && HIDDEN_STYLE.test(style)) return true;
  // Tailwind's `hidden` utility is display:none; `sr-only` is visually hidden
  // but IS meaningful accessible text, so it is deliberately kept.
  const cls = el.getAttribute('class');
  if (cls && /(^|\s)hidden(\s|$)/.test(cls)) return true;
  return false;
}

/** Recursively drop comments; returns how many were removed. */
function stripComments(node: HTMLElement): number {
  let removed = 0;
  for (const child of [...node.childNodes]) {
    if (child.nodeType === NodeType.COMMENT_NODE) {
      child.remove();
      removed++;
    } else if (child.nodeType === NodeType.ELEMENT_NODE) {
      removed += stripComments(child as HTMLElement);
    }
  }
  return removed;
}

/**
 * Clean an HTML mock-up down to inert, semantic markup and measure how much
 * form there is to convert. Pure and synchronous — performs no I/O.
 */
export function extractFormHtml(
  html: string,
  options: HtmlExtractOptions = {},
): HtmlExtractResult {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const warnings: string[] = [];

  // `comment: true` keeps comments in the tree so we can count what we remove.
  const root = parse(html, {
    comment: true,
    blockTextElements: { script: false, noscript: false, style: false, pre: true },
  });

  const looksMultiDocument = (html.match(/<html[\s>]/gi) ?? []).length > 1;

  // Must run BEFORE scripts are stripped: an empty container only implies
  // "filled at runtime" if the document actually shipped scripts.
  const scriptFilledPlaceholders = findScriptFilledPlaceholders(root);

  let strippedTags = 0;
  for (const el of root.querySelectorAll('*')) {
    if (STRIPPED_TAGS.has(el.rawTagName?.toLowerCase() ?? '')) {
      el.remove();
      strippedTags++;
    }
  }

  let hiddenRemoved = 0;
  // Re-query after tag stripping; removing a parent also removes descendants,
  // so guard against operating on a detached node.
  for (const el of root.querySelectorAll('*')) {
    if (!el.parentNode) continue;
    if (isHidden(el)) {
      el.remove();
      hiddenRemoved++;
    }
  }

  const commentsRemoved = stripComments(root);

  // Attribute allow-list pass.
  for (const el of root.querySelectorAll('*')) {
    for (const name of Object.keys(el.attributes)) {
      if (!KEPT_ATTRIBUTES.has(name.toLowerCase())) {
        el.removeAttribute(name);
      }
    }
  }

  const stats = collectStats(root);

  let cleanedHtml = root.toString().replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (cleanedHtml.length > maxChars) {
    cleanedHtml = cleanedHtml.slice(0, maxChars);
    warnings.push(
      `The mock-up was longer than ${maxChars.toLocaleString()} characters and was truncated; later content may be missing.`,
    );
  }
  stats.textLength = cleanedHtml.length;

  if (hiddenRemoved > 0) {
    warnings.push(
      `Removed ${hiddenRemoved} hidden element(s) (display:none / hidden / aria-hidden). Hidden content is not converted.`,
    );
  }
  if (commentsRemoved > 0) {
    warnings.push(`Removed ${commentsRemoved} HTML comment(s).`);
  }
  if (strippedTags > 0) {
    warnings.push(`Removed ${strippedTags} non-content element(s) (script/style/media/embeds).`);
  }
  if (looksMultiDocument) {
    warnings.push(
      'The file appears to contain more than one HTML document; only a single-page mock-up converts reliably.',
    );
  }

  if (scriptFilledPlaceholders.length > 0) {
    warnings.push(
      `${scriptFilledPlaceholders.length} section(s) are built by JavaScript in this mock-up and were empty in the markup, so their fields could not be read: ${scriptFilledPlaceholders.join(', ')}. Add those fields manually after conversion — nothing was invented for them.`,
    );
  }

  return { cleanedHtml, stats, warnings, looksMultiDocument, scriptFilledPlaceholders };
}

function collectStats(root: HTMLElement): HtmlExtractStats {
  const inputs = root.querySelectorAll('input');
  const checkboxes = inputs.filter((i) => i.getAttribute('type')?.toLowerCase() === 'checkbox');
  const radios = inputs.filter((i) => i.getAttribute('type')?.toLowerCase() === 'radio');
  const otherFields = root.querySelectorAll('select, textarea');

  return {
    fields: inputs.length + otherFields.length,
    checkboxes: checkboxes.length,
    radios: radios.length,
    tables: root.querySelectorAll('table').length,
    tableRows: root.querySelectorAll('tr').length,
    sections: root.querySelectorAll('fieldset, section, h1, h2, h3').length,
    textLength: 0,
  };
}

/** Containers a browser would populate at runtime; we never execute the page. */
const PLACEHOLDER_TAGS = new Set(['div', 'section', 'ul', 'ol', 'tbody', 'fieldset', 'table']);

/**
 * Find named-but-empty containers in a document that also ships scripts.
 *
 * A mock-up generated by an LLM often renders its option lists from a JS data
 * structure, leaving `<div id="ms-comfort-categories"></div>` in the markup.
 * Because scripts are stripped and the page is never executed, that content is
 * genuinely unavailable — and an empty box next to a heading like "Care
 * Categories" is exactly the situation where a model will invent a plausible
 * control. Naming them lets the reviewer fill the gap deliberately.
 *
 * Requires the document to contain a script, so ordinary empty layout/spacer
 * divs in a static mock-up are not reported.
 */
function findScriptFilledPlaceholders(root: HTMLElement): string[] {
  if (root.querySelectorAll('script').length === 0) return [];

  const names: string[] = [];
  for (const el of root.querySelectorAll('*')) {
    const tag = el.rawTagName?.toLowerCase() ?? '';
    if (!PLACEHOLDER_TAGS.has(tag)) continue;
    // Empty means: no element children and no visible text of its own.
    if (el.querySelectorAll('*').length > 0) continue;
    if (el.text.trim().length > 0) continue;

    // Only report containers something clearly targets, so anonymous spacer
    // divs stay quiet.
    const id = el.getAttribute('id');
    const cls = el.getAttribute('class');
    const name = id ? `#${id}` : cls ? `.${cls.trim().split(/\s+/)[0]}` : null;
    if (!name) continue;
    if (!names.includes(name)) names.push(name);
  }
  return names;
}
