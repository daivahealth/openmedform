import { parse, HTMLElement, NodeType } from 'node-html-parser';

/**
 * Turn an uploaded HTML mock-up into inert, semantic source text for the AI
 * conversion pipeline.
 *
 * SECURITY MODEL — the uploaded file is untrusted and is treated as *inert
 * text only*:
 * - This module never renders or executes it. A mock-up that builds its form at
 *   runtime is rendered separately, in Chromium's sandbox, by html-render.ts —
 *   and the DOM that produces is fed back through THIS function, so every rule
 *   below still applies to it.
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
  /**
   * `<script>` elements present BEFORE stripping. Zero fields plus scripts means
   * "this form is built at runtime", which is a completely different problem for
   * the author than "this file is not a form" — see assertHtmlWithinBudget.
   */
  scripts: number;
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
  /**
   * Repeating record tables found in the markup — a populated `<thead>` with an
   * empty `<tbody>` next to an "Add …" control. Recoverable, unlike
   * `scriptFilledPlaceholders`: the converter turns each into a `recordTable`.
   */
  repeatingTables: RepeatingTableHint[];
  /**
   * Matrix tables whose ROWS are fields and whose COLUMNS are record instances
   * — the transpose of `repeatingTables`. Also converts to a `recordTable`.
   */
  transposedMatrices: TransposedMatrixHint[];
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
  // Counted before the stripping pass below removes them.
  const scriptCount = root.querySelectorAll('script').length;

  // Must run BEFORE scripts are stripped: an empty container only implies
  // "filled at runtime" if the document actually shipped scripts.
  const scriptFilledPlaceholders = findScriptFilledPlaceholders(root);
  const repeatingTables = findRepeatingTables(root);
  const transposedMatrices = findTransposedMatrices(root);

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
  stats.scripts = scriptCount;

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

  return {
    cleanedHtml,
    stats,
    warnings,
    looksMultiDocument,
    scriptFilledPlaceholders,
    repeatingTables,
    transposedMatrices,
  };
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
    scripts: 0,
    textLength: 0,
  };
}

/** Strip a nested-add control's text off an instance heading: "Cannula 1 + Day" -> "Cannula 1". */
function instanceHeaderText(th: HTMLElement): { header: string; nestedAdd?: string } {
  const buttonTexts = th
    .querySelectorAll('button, a')
    .map((b) => b.text.replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 0);
  let header = th.text.replace(/\s+/g, ' ').trim();
  let nestedAdd: string | undefined;
  for (const t of buttonTexts) {
    // Inside an instance heading a "+ …" control adds a sub-record. It rarely
    // says "add" — the VIP chart labels it just "+ Day" — so a leading plus is
    // the reliable signal here, alongside the usual add/new wording.
    if (ADD_BUTTON.test(t) || NESTED_ADD_BUTTON.test(t)) nestedAdd = t;
    header = header.replace(t, '').replace(/\s+/g, ' ').trim();
  }
  return { header, nestedAdd };
}

/**
 * Find matrix tables: field labels down the first column, record instances
 * across the top.
 *
 * Recognised by shape rather than by any particular wording, so it is not tied
 * to the VIP form: a header row of 2+ cells, and body rows whose FIRST cell is
 * a plain text label while the remaining cells hold the inputs. A table whose
 * first column also contains inputs is an ordinary data grid, not a matrix, and
 * is left alone.
 */
function findTransposedMatrices(root: HTMLElement): TransposedMatrixHint[] {
  const hints: TransposedMatrixHint[] = [];

  for (const table of root.querySelectorAll('table')) {
    const headerCells = table.querySelectorAll('thead th');
    if (headerCells.length < 2) continue;

    const bodyRows = table.querySelectorAll('tbody tr');
    if (bodyRows.length < 3) continue; // too small to be a parameter matrix

    // Every row must read "label | value…", and the labels must be real text.
    const rowLabels: string[] = [];
    let wellFormed = true;
    for (const tr of bodyRows) {
      const cells = tr.querySelectorAll('td');
      if (cells.length < 2) { wellFormed = false; break; }
      const first = cells[0];
      // A label cell holds text and no input of its own.
      if (first.querySelectorAll('input, select, textarea').length > 0) { wellFormed = false; break; }
      const label = first.text.replace(/\s+/g, ' ').trim();
      if (!label) { wellFormed = false; break; }
      rowLabels.push(label);
    }
    if (!wellFormed || rowLabels.length < 3) continue;

    // At least one instance column must actually carry fields, or this is a
    // static reference table (dosing guide, score legend) rather than a matrix.
    const fieldCount = table.querySelectorAll('tbody td input, tbody td select, tbody td textarea').length;
    if (fieldCount === 0) continue;

    const [labelTh, ...instanceThs] = headerCells;
    const instanceHeaders: string[] = [];
    let addNestedLabel: string | undefined;
    for (const th of instanceThs) {
      const { header, nestedAdd } = instanceHeaderText(th);
      if (header) instanceHeaders.push(header);
      if (nestedAdd && !addNestedLabel) addNestedLabel = nestedAdd;
    }
    if (instanceHeaders.length === 0) continue;

    // The control that adds another instance sits outside the table.
    const scopes = [table.parentNode, table.parentNode?.parentNode].filter(Boolean) as HTMLElement[];
    let addInstanceLabel: string | undefined;
    for (const scope of scopes) {
      const found = scope
        .querySelectorAll('button, a, input[type="button"], input[type="submit"]')
        .map((b) => (b.text || b.getAttribute('value') || '').replace(/\s+/g, ' ').trim())
        .find((t) => ADD_BUTTON.test(t) && t !== addNestedLabel);
      if (found) { addInstanceLabel = found; break; }
    }

    hints.push({
      labelHeader: labelTh.text.replace(/\s+/g, ' ').trim(),
      rowLabels,
      instanceHeaders,
      addInstanceLabel,
      addNestedLabel,
    });
  }

  return hints;
}

/** Containers a browser would populate at runtime; we never execute the page. */
const PLACEHOLDER_TAGS = new Set(['div', 'section', 'ul', 'ol', 'tbody', 'fieldset', 'table']);

/**
 * Find named-but-empty containers in a document that also ships scripts.
 *
 * A mock-up generated by an LLM often renders its option lists from a JS data
 * structure, leaving `<div id="ms-comfort-categories"></div>` in the markup.
 * Because scripts are stripped and this function never executes the page, that
 * content is
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
    // An empty <tbody> under a populated <thead> is NOT an unrecoverable gap —
    // the header names every column, so it converts to a record table instead.
    if (isRepeatingTableBody(el)) continue;

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

/** True for an empty `<tbody>` whose table has a header row naming the columns. */
function isRepeatingTableBody(el: HTMLElement): boolean {
  if ((el.rawTagName?.toLowerCase() ?? '') !== 'tbody') return false;
  const table = el.closest?.('table');
  return !!table && table.querySelectorAll('thead th').length > 0;
}

/**
 * Detect repeating record tables: a `<table>` whose `<thead>` names the columns
 * but whose `<tbody>` is empty, alongside an "Add …" control.
 *
 * This is the recoverable twin of `findScriptFilledPlaceholders`. Both look like
 * "empty container in a scripted page", but here the markup DOES carry the
 * structure — the header row names every column and the button names the thing
 * being added — so the converter can emit a real `recordTable` rather than
 * warning about a gap. Getting this distinction wrong in either direction is
 * costly: warn on this and the user loses a whole treatment-day log; guess at a
 * genuinely empty container and the form grows a control that was never on it.
 */
export interface RepeatingTableHint {
  /** Column headings in source order, from the `<thead>`. */
  columns: string[];
  /** Text of the add control, e.g. '+ Add treatment day'. */
  addLabel?: string;
  /** Nearby count line, e.g. '0 treatment days logged this month'. */
  countLabel?: string;
}

/**
 * Buttons that add a row, as opposed to print/save/submit actions.
 *
 * Exported so the geometry detector in layout-detect.ts recognises the same
 * affordances this module does. One shape must not be a repeating structure on
 * the markup path and a plain grid on the geometry path.
 */
export const ADD_BUTTON = /^\s*[+➕]?\s*(add|new)\b/i;

/** A "+ …" control inside a column heading, e.g. '+ Day'. */
export const NESTED_ADD_BUTTON = /^\s*[+➕]\s*\S/;

/**
 * Does this markup offer a control that adds a record?
 *
 * Used as a cheap pre-check before paying for a browser render: geometry
 * detection bails without an add affordance, so a document that has none can
 * never gain a hint from being rendered.
 */
export function hasAddAffordance(html: string): boolean {
  const root = parse(html);
  return root
    .querySelectorAll('button, a, input[type="button"], input[type="submit"]')
    .some((el) => {
      const text = (el.getAttribute('value') ?? el.text ?? '').replace(/\s+/g, ' ').trim();
      return ADD_BUTTON.test(text);
    });
}

/**
 * A table laid out as a MATRIX: field labels run down the first column and each
 * remaining column is one record instance.
 *
 * The VIP cannula chart is the canonical example — "Parameter | Cannula 1 [+
 * Day]" across the top, "Date of Insertion", "Site", "Side" … down the side.
 * This is the transpose of `RepeatingTableHint`, and without a hint the model
 * has to guess: it typically turns the instance header into a column, drops the
 * per-instance fields, and leaves any nested group unconfigured.
 */
export interface TransposedMatrixHint {
  /** Heading of the label column, e.g. 'Parameter'. */
  labelHeader: string;
  /** Every field label down the left, in source order. */
  rowLabels: string[];
  /** Instance column headings with the nested-group button text removed. */
  instanceHeaders: string[];
  /** Control that adds another instance, e.g. '+ Add Cannula'. */
  addInstanceLabel?: string;
  /**
   * Control inside an instance header that adds a nested sub-record, e.g.
   * '+ Day'. Its presence means the record contains its own repeating group.
   */
  addNestedLabel?: string;
}

function findRepeatingTables(root: HTMLElement): RepeatingTableHint[] {
  const hints: RepeatingTableHint[] = [];

  for (const table of root.querySelectorAll('table')) {
    const headers = table
      .querySelectorAll('thead th')
      .map((th) => th.text.replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 0);
    if (headers.length === 0) continue;

    const bodyRows = table.querySelectorAll('tbody tr').length;
    if (bodyRows > 0) continue; // a table with real rows converts normally

    // Look for the add control near the table: same parent, or the parent's
    // parent, which is where a toolbar above the table usually sits.
    const scopes = [table.parentNode, table.parentNode?.parentNode].filter(Boolean) as HTMLElement[];
    let addLabel: string | undefined;
    let countLabel: string | undefined;
    for (const scope of scopes) {
      if (!addLabel) {
        const button = scope
          .querySelectorAll('button, a, input[type="button"], input[type="submit"]')
          .map((b) => (b.text || b.getAttribute('value') || '').replace(/\s+/g, ' ').trim())
          .find((text) => ADD_BUTTON.test(text));
        if (button) addLabel = button;
      }
      if (!countLabel) {
        // Take the SHORTEST match: an ancestor div also "contains" the count
        // line, but its text drags in the toolbar buttons around it.
        const candidates = scope
          .querySelectorAll('div, span, p')
          .map((n) => n.text.replace(/\s+/g, ' ').trim())
          .filter((t) => /^\d+\s+\S.*\b(logged|record|entr|row|item)/i.test(t) && t.length < 120)
          .sort((a, b) => a.length - b.length);
        countLabel = candidates[0];
      }
      if (addLabel && countLabel) break;
    }

    if (!addLabel) continue; // no add affordance → not a user-extendable log
    hints.push({ columns: headers, addLabel, countLabel });
  }

  return hints;
}
