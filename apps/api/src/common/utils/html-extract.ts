import { parse, HTMLElement, NodeType } from 'node-html-parser';
import { extractScriptConfig, type ScriptConfigEntry } from './script-config';

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
  /**
   * Fields the mock-up hides until a nearby choice is set to "Other". Kept
   * rather than stripped, and converted with a SHOW rule — see
   * `ConditionalFieldHint`.
   */
  conditionalFields: ConditionalFieldHint[];
  /**
   * Named literal config parsed out of the mock-up's scripts — option lists,
   * threshold bands, reference tables. Always empty unless the upload opted in
   * via `extractScriptConfig`.
   */
  scriptConfig: ScriptConfigEntry[];
}

export interface HtmlExtractOptions {
  /** Cap on the cleaned HTML handed to the model (mirrors the PDF text cap). */
  maxChars?: number;
  /**
   * Opt in to reading declarative config out of the mock-up's scripts. OFF by
   * default: it narrows the strip-scripts posture and so requires the
   * uploader's explicit consent on each upload. Scripts are parsed, never run.
   */
  extractScriptConfig?: boolean;
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
    blockTextElements: {
      // Script text is normally discarded at parse time — it is never wanted,
      // and not having it in the tree is one less way for it to leak into the
      // cleaned output. It is retained ONLY when the uploader opted in to
      // config extraction, and even then the <script> element itself is still
      // removed wholesale by the tag strip below.
      script: options.extractScriptConfig === true,
      noscript: false,
      style: false,
      pre: true,
    },
  });

  const looksMultiDocument = (html.match(/<html[\s>]/gi) ?? []).length > 1;
  // Counted before the stripping pass below removes them.
  const scriptElements = root.querySelectorAll('script');
  const scriptCount = scriptElements.length;

  // Read the scripts' declarative config BEFORE they are stripped, and only
  // when the uploader asked for it. Parsing is never execution — see
  // script-config.ts for the whole security argument.
  const scriptConfig = options.extractScriptConfig
    ? extractScriptConfig(
        // Inline scripts only: a <script src> has no text here, and we never
        // fetch anything.
        scriptElements.map((el) => el.text ?? '').filter((text) => text.trim().length > 0),
      )
    : { entries: [], warnings: [] };

  // Must run BEFORE scripts are stripped: an empty container only implies
  // "filled at runtime" if the document actually shipped scripts.
  const scriptFilledPlaceholders = findScriptFilledPlaceholders(root);
  const repeatingTables = findRepeatingTables(root);
  const transposedMatrices = findTransposedMatrices(root);
  // Must also run BEFORE the hidden strip below, which is what would otherwise
  // delete these fields.
  const { hints: conditionalFields, reveal } = findConditionalFields(root);

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
    // Spared: a conditional "specify" field, kept so it can be emitted with a
    // SHOW rule instead of vanishing. Only the field itself is spared — if a
    // hidden ANCESTOR is removed this still goes with it, which is correct: a
    // whole hidden section is not a conditional field.
    if (reveal.has(el)) continue;
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
  if (scriptConfig.entries.length > 0) {
    warnings.push(
      `Read ${scriptConfig.entries.length} configuration definition(s) from this mock-up's scripts ` +
        `(${scriptConfig.entries.map((e) => e.name).join(', ')}). The scripts were parsed, never run, ` +
        'and only plain literal values were taken. Check any option list or threshold that came from them.',
    );
  }
  for (const note of scriptConfig.warnings) {
    warnings.push(`Script config: ${note}.`);
  }
  if (conditionalFields.length > 0) {
    warnings.push(
      `${conditionalFields.length} field(s) are hidden until a choice is set to "Other" (` +
        conditionalFields.map((c) => `${c.fieldLabel} <- ${c.controlledBy}`).join(', ') +
        '). They were kept and converted with a SHOW rule rather than dropped.',
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
    conditionalFields,
    scriptConfig: scriptConfig.entries,
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

/**
 * A field that the mock-up shows only when a nearby choice is set to a specific
 * option — the "Please specify…" box next to a Site/Reason select's "Other".
 *
 * Hidden markup is stripped by default because it is the natural place to
 * smuggle instructions to the model. But mock-ups also use `display:none` for
 * genuinely conditional fields, and dropping those loses real data capture: the
 * VIP chart lost 2 of its 23 fields this way. The platform already renders
 * conditional visibility — `form-core` evaluates JSON Forms SHOW/HIDE rules —
 * so the fix is to emit the rule rather than to keep or drop the field blindly.
 */
export interface ConditionalFieldHint {
  /** The conditional field's own label — placeholder, aria-label or name. */
  fieldLabel: string;
  /** Label of the choice that reveals it, e.g. 'Site'. */
  controlledBy: string;
  /** The option that reveals it, e.g. 'Other'. */
  whenValue: string;
}

/** Options that mean "none of the above, type it in". */
const OTHER_OPTION = /^\s*(other|others|other\s*\(.*\)|please\s+specify)\s*[:.…]*\s*$/i;

/** Text-entry fields; a hidden checkbox/radio is not a "specify" companion. */
const SPECIFY_INPUT_TYPES = new Set(['text', 'search', 'tel', 'url', 'email', '']);

/**
 * Cap on a revealed field's label. This is the one string a HIDDEN element can
 * now put in front of the model, so keep the space too small to hide an
 * instruction in. Real "Please specify…" placeholders are a few words.
 */
const MAX_CONDITIONAL_LABEL = 60;

/**
 * Best available name for a field that carries no visible label of its own.
 * A conditional "specify" box is labelled by its placeholder in practice.
 */
function conditionalFieldLabel(el: HTMLElement): string {
  const candidates = [
    el.getAttribute('placeholder'),
    el.getAttribute('aria-label'),
    el.getAttribute('title'),
    el.getAttribute('name'),
  ];
  for (const c of candidates) {
    const text = (c ?? '').replace(/\s+/g, ' ').trim();
    if (text) return text.length <= MAX_CONDITIONAL_LABEL ? text : '';
  }
  return '';
}

/**
 * Name of the choice this field hangs off: an associated `<label>`, the row
 * label in a matrix (`<tr>`'s first cell), or the group's preceding text.
 */
function controllingLabel(select: HTMLElement): string {
  const id = select.getAttribute('id');
  if (id) {
    const root = select.parentNode ? rootOf(select) : undefined;
    const label = root?.querySelector(`label[for="${id}"]`);
    const text = label?.text.replace(/\s+/g, ' ').trim();
    if (text) return text;
  }

  // Walk out to the nearest labelling context. In a matrix the row's first cell
  // is the field name; in a stacked layout a <label> wraps or precedes it.
  let node: HTMLElement | null = select.parentNode as HTMLElement | null;
  for (let depth = 0; node && depth < 4; depth++, node = node.parentNode as HTMLElement | null) {
    const tag = node.rawTagName?.toLowerCase();
    if (tag === 'tr') {
      const first = node.querySelectorAll('td, th')[0];
      const text = first?.text.replace(/\s+/g, ' ').trim();
      if (text) return text;
    }
    if (tag === 'label') {
      // The <label>'s own text, not the option list inside the select.
      const text = node.text
        .replace(select.text, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) return text;
    }
  }
  return '';
}

/** Climb to the document root so an id lookup can see the whole tree. */
function rootOf(el: HTMLElement): HTMLElement {
  let node = el;
  while (node.parentNode) node = node.parentNode as HTMLElement;
  return node;
}

/**
 * Find hidden "specify" fields that belong to a select's "Other" option, and
 * report both the pair and the elements to spare from the hidden-content strip.
 *
 * The pattern is deliberately narrow, because the whole point of stripping
 * hidden content is that it is a prompt-injection channel. What survives here:
 *
 * - only `<input>`/`<textarea>` — never a container, so no hidden prose can ride
 *   along inside one. An `<input>` is void; a `<textarea>` is not, so an
 *   already-populated one is rejected rather than revealed.
 * - the only string a hidden element can newly put in front of the model is its
 *   own short label, capped at MAX_CONDITIONAL_LABEL characters.
 * - only next to a `<select>` that actually offers an "Other"-style option, so a
 *   hidden field with no conditional partner stays stripped.
 * - only within the select's own parent, so this cannot reach across a document.
 */
function findConditionalFields(root: HTMLElement): {
  hints: ConditionalFieldHint[];
  reveal: Set<HTMLElement>;
} {
  const hints: ConditionalFieldHint[] = [];
  const reveal = new Set<HTMLElement>();

  for (const select of root.querySelectorAll('select')) {
    const other = select
      .querySelectorAll('option')
      .map((o) => o.text.replace(/\s+/g, ' ').trim())
      .find((t) => OTHER_OPTION.test(t));
    if (!other) continue;

    const parent = select.parentNode as HTMLElement | null;
    if (!parent) continue;

    for (const field of parent.querySelectorAll('input, textarea')) {
      if (!isHidden(field)) continue;
      const tag = field.rawTagName?.toLowerCase();
      if (tag === 'input') {
        const type = (field.getAttribute('type') ?? '').toLowerCase();
        if (!SPECIFY_INPUT_TYPES.has(type)) continue;
      } else if (tag === 'textarea') {
        // Unlike <input>, a textarea is NOT void — it can carry hidden prose.
        // A blank specify box is empty by definition, so anything with content
        // is not one and stays stripped.
        if (field.text.trim()) continue;
      }

      const fieldLabel = conditionalFieldLabel(field);
      if (!fieldLabel) continue;
      const controlledBy = controllingLabel(select);
      if (!controlledBy) continue;

      reveal.add(field);
      hints.push({ fieldLabel, controlledBy, whenValue: other });
    }
  }

  return { hints, reveal };
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
  /**
   * Which `rowLabels` belong to the NESTED group, measured by pressing
   * `addNestedLabel` in the sandbox and seeing which rows grew. Absent when the
   * page was not probed — the model then infers the split semantically, which
   * is what it did before this could be measured.
   */
  nestedRowLabels?: string[];
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
