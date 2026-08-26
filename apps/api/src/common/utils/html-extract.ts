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
   * Named containers a browser WOULD fill at runtime and that are worth a
   * render to recover — the recoverable twin of `scriptFilledPlaceholders`.
   *
   * The distinction is what the markup already carries. An empty `<tbody>`
   * under a populated `<thead>` beside an "Add …" control converts on its own
   * (see `repeatingTables`), but the same `<tbody>` with NO add control is a
   * fixed list of rows the page's script writes out — a 14-parameter screening
   * checklist, say — and the markup states nothing but the two column
   * headings. Rendering the page turns those rows back into real controls, so
   * this exists purely to tell the caller a render can change the outcome even
   * though the static parse already found plenty of fields elsewhere.
   */
  scriptPopulatedContainers: string[];
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
   * Sections the mock-up hides and its own script reveals — progressive
   * disclosure. Kept rather than stripped, and converted with a SHOW rule; see
   * `ScriptToggledSectionHint`.
   */
  scriptToggledSections: ScriptToggledSectionHint[];
  /**
   * Visible elements whose TEXT the mock-up's script computes at runtime — a
   * result banner, a live total. The markup only carries a placeholder; see
   * `ScriptComputedTextHint`.
   */
  scriptComputedText: ScriptComputedTextHint[];
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
  const scriptPopulatedContainers = findScriptPopulatedContainers(root, html);
  const repeatingTables = findRepeatingTables(root);
  const transposedMatrices = findTransposedMatrices(root);
  // Must also run BEFORE the hidden strip below, which is what would otherwise
  // delete these fields.
  const { hints: conditionalFields, reveal } = findConditionalFields(root);
  // Same reason, one level up: whole SECTIONS the page's own script reveals in
  // turn. Also before the strip, which is what would otherwise delete them.
  const { hints: scriptToggledSections, reveal: revealSections } = findScriptToggledSections(
    root,
    html,
  );
  for (const el of revealSections) reveal.add(el);
  // Elements the script does not reveal but REWRITES: their text in the markup
  // is whatever they said before the page ran, never a real label.
  const scriptComputedText = findScriptComputedText(root, html);

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
    if (reveal.has(el)) {
      // Present but still marked invisible reads as "ignore this"; the rule,
      // not the CSS, carries visibility from here on.
      unhide(el);
      continue;
    }
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
  if (scriptToggledSections.length > 0) {
    warnings.push(
      `${scriptToggledSections.length} section(s) are hidden until this mock-up's script reveals ` +
        `them (${scriptToggledSections.map((t) => `${t.label} [${t.selector}]`).join(', ')}). ` +
        'They were kept and converted with a SHOW rule rather than dropped — check that each ' +
        'one appears on the right answer, because the reveal condition was read from the form, ' +
        'not from the script.',
    );
  }
  if (scriptComputedText.length > 0) {
    warnings.push(
      `${scriptComputedText.length} element(s) have their text COMPUTED by this mock-up's script ` +
        `(${scriptComputedText.map((c) => `${c.selector}: "${c.placeholder}"`).join(', ')}). ` +
        'The text shown is only the placeholder the markup shipped with, not a real label — the ' +
        'scripts were never run. The outcomes were rebuilt from the form\'s own stated rules and ' +
        'their wording is the converter\'s, so check it reads the way your unit expects.',
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
    scriptPopulatedContainers,
    repeatingTables,
    transposedMatrices,
    conditionalFields,
    scriptToggledSections,
    scriptComputedText,
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

    // A matrix is a record repeated ACROSS columns. With one instance column
    // there is nothing repeated: "Parameter | Patient's Condition" is an
    // ordinary label-and-answer table — a 14-row screening checklist, not 14
    // fields of one record — and reading it as a matrix turns the checklist
    // into an "add another patient's condition" grid. Two or more instance
    // columns, or a control that adds one, is what makes the shape a record.
    if (instanceHeaders.length < 2 && !addInstanceLabel && !addNestedLabel) continue;

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

/**
 * A section the mock-up hides until its script reveals it — the progressive
 * disclosure pattern (CAM-ICU: `<tr id="cam-row-2" style="display:none">` for
 * Feature 2, shown once Feature 1 is answered "present").
 *
 * Reported so the converter can emit the section WITH a SHOW rule instead of
 * losing it. See `findScriptToggledSections` for what has to be true before a
 * hidden container is trusted this far.
 */
export interface ScriptToggledSectionHint {
  /** How the script addresses it, e.g. '#cam-row-2' — also the reviewer's handle. */
  selector: string;
  /** Short heading text taken from inside the section, for the prompt. */
  label: string;
  /** How many inputs/selects/textareas it contains. */
  fields: number;
}

/** Container tags a progressive-disclosure section is drawn with. */
const TOGGLEABLE_TAGS = new Set([
  'tr',
  'tbody',
  'div',
  'section',
  'fieldset',
  'article',
  'details',
  'li',
  'td',
  'p',
]);

/** At most this many hidden sections may be revealed in one document. */
const MAX_TOGGLED_SECTIONS = 12;
/** Cap on the text a single revealed section may add to the prompt. */
const MAX_TOGGLED_SECTION_CHARS = 1_500;
/** Whole-document budget for text recovered from hidden sections. */
const MAX_TOGGLED_TOTAL_CHARS = 6_000;

/** `<script>` bodies, read from the RAW upload — never added to the tree. */
const SCRIPT_BLOCK = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;

/** `const row2 = document.getElementById('cam-row-2')` / `querySelector('#x')`. */
const LOOKUP_ASSIGN =
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*document\s*\.\s*(?:getElementById\s*\(\s*['"]([^'"]+)['"]\s*\)|querySelector\s*\(\s*['"]([^'"]+)['"]\s*\))/g;

/** `row2.style.display = …` / `row2.hidden = …` on a variable bound above. */
const VAR_TOGGLE =
  /([A-Za-z_$][\w$]*)\s*\.\s*(?:style\s*\.\s*display|hidden)\s*=/g;

/** `row2.classList.toggle('hidden')` and friends. */
const VAR_CLASS_TOGGLE =
  /([A-Za-z_$][\w$]*)\s*\.\s*classList\s*\.\s*(?:toggle|add|remove)\s*\(/g;

/** The one-liner form: `document.getElementById('x').style.display = …`. */
const DIRECT_TOGGLE =
  /document\s*\.\s*(?:getElementById\s*\(\s*['"]([^'"]+)['"]\s*\)|querySelector\s*\(\s*['"]([^'"]+)['"]\s*\))\s*\.\s*(?:style\s*\.\s*display|hidden|classList)\b/g;

/**
 * Does the page react to a CHOICE at all? Progressive disclosure is driven by
 * an answer changing; a document with no change/input handler anywhere is
 * toggling for some other reason and gets no carve-out.
 */
const CHOICE_LISTENER = /addEventListener\s*\(\s*['"](?:change|input)['"]/i;

/** Text of every inline `<script>` in the raw upload, concatenated. */
function scriptText(html: string): string {
  let combined = '';
  for (const match of html.matchAll(SCRIPT_BLOCK)) combined += `\n${match[1] ?? ''}`;
  return combined;
}

/**
 * Variable name -> the selector it was bound to, so a later use far from the
 * lookup still resolves (`const row2 = getElementById('cam-row-2')` … 40 lines
 * on … `row2.style.display = ''`). Shared by both script detectors below.
 */
function boundSelectors(scripts: string): Map<string, string> {
  const bound = new Map<string, string>();
  for (const m of scripts.matchAll(LOOKUP_ASSIGN)) {
    const name = m[1];
    const selector = m[2] !== undefined ? `#${m[2]}` : m[3];
    if (name && selector) bound.set(name, selector);
  }
  return bound;
}

/** Selectors a script toggles the visibility of, in source order. */
function toggledSelectors(scripts: string): string[] {
  const bound = boundSelectors(scripts);

  const selectors: string[] = [];
  const add = (selector: string | undefined) => {
    if (selector && !selectors.includes(selector)) selectors.push(selector);
  };

  // Pass 2: every visibility toggle, through a variable or inline.
  for (const m of scripts.matchAll(VAR_TOGGLE)) add(bound.get(m[1] ?? ''));
  for (const m of scripts.matchAll(VAR_CLASS_TOGGLE)) add(bound.get(m[1] ?? ''));
  for (const m of scripts.matchAll(DIRECT_TOGGLE)) {
    add(m[1] !== undefined ? `#${m[1]}` : m[2]);
  }
  return selectors;
}

/** A short human heading for a section, for the hint text. */
function sectionLabel(el: HTMLElement): string {
  const heading = el.querySelector('strong, b, th, legend, h1, h2, h3, h4, h5, h6, summary');
  const text = (heading?.text ?? el.text).replace(/\s+/g, ' ').trim();
  return text.length <= MAX_CONDITIONAL_LABEL
    ? text
    : `${text.slice(0, MAX_CONDITIONAL_LABEL).trim()}…`;
}

/**
 * Find sections the mock-up hides and its own script reveals, and report both
 * the hint and the elements to spare from the hidden-content strip.
 *
 * WHY THIS EXISTS — hidden markup is stripped because it is the natural place
 * to smuggle instructions past the person uploading the file. But progressive
 * disclosure is drawn exactly that way: the CAM-ICU worksheet ships Features
 * 2, 3 and 4 as `display:none` rows that its script reveals in turn, and
 * stripping them turned a four-feature delirium assessment into a one-question
 * form. `findConditionalFields` above could not help — it spares a lone "Please
 * specify" input, never a container.
 *
 * SECURITY — this is a real narrowing of the strip, so it is fenced in:
 * - the script must actually toggle THIS element's visibility, addressed by id
 *   or selector, and the page must respond to a choice at all
 *   (`CHOICE_LISTENER`). Prose hidden in an untouched `<div>` stays stripped.
 * - the section must contain a form field. A hidden container of pure text —
 *   the injection shape — is never revealed, however it is toggled.
 * - what one section may add is capped (`MAX_TOGGLED_SECTION_CHARS`), as is the
 *   document total (`MAX_TOGGLED_TOTAL_CHARS`) and the count
 *   (`MAX_TOGGLED_SECTIONS`), so the hidden channel cannot be made large.
 * - every revealed section is named in `warnings`, so it is never silent, and
 *   the whole subtree still passes the tag and attribute allow-lists.
 *
 * A determined uploader can still satisfy this: it raises the bar, it is not a
 * boundary. The boundary remains that extracted strings only ever become JSON
 * schema values, and that the conversion prompt frames the markup as untrusted.
 */
function findScriptToggledSections(
  root: HTMLElement,
  html: string,
): { hints: ScriptToggledSectionHint[]; reveal: Set<HTMLElement> } {
  const hints: ScriptToggledSectionHint[] = [];
  const reveal = new Set<HTMLElement>();

  const scripts = scriptText(html);
  if (!scripts.trim()) return { hints, reveal };
  const respondsToChoice =
    CHOICE_LISTENER.test(scripts) || root.querySelectorAll('[onchange], [oninput]').length > 0;
  if (!respondsToChoice) return { hints, reveal };

  let budget = MAX_TOGGLED_TOTAL_CHARS;
  for (const selector of toggledSelectors(scripts)) {
    if (hints.length >= MAX_TOGGLED_SECTIONS) break;

    let el: HTMLElement | null = null;
    try {
      el = root.querySelector(selector);
    } catch {
      // A selector this parser cannot handle is simply not a candidate.
      continue;
    }
    if (!el || reveal.has(el)) continue;
    if (!isHidden(el)) continue;
    if (!TOGGLEABLE_TAGS.has(el.rawTagName?.toLowerCase() ?? '')) continue;

    // A hidden container with no field in it is prose, not a form section.
    const fields = el.querySelectorAll('input, select, textarea').length;
    if (fields === 0) continue;

    const size = el.text.replace(/\s+/g, ' ').trim().length;
    if (size > MAX_TOGGLED_SECTION_CHARS || size > budget) continue;
    budget -= size;

    const label = sectionLabel(el);
    if (!label) continue;

    reveal.add(el);
    hints.push({ selector, label, fields });
  }

  return { hints, reveal };
}

/**
 * Drop the declarations that were hiding a spared element, so the cleaned
 * markup does not hand the model a section that is simultaneously present and
 * marked invisible — which reads as "ignore this" and loses the field again.
 * Visibility is expressed downstream by a rule, not by CSS.
 */
function unhide(el: HTMLElement): void {
  el.removeAttribute('hidden');
  if (el.getAttribute('aria-hidden') === 'true') el.removeAttribute('aria-hidden');

  const style = el.getAttribute('style');
  if (style) {
    const kept = style
      .split(';')
      .filter((decl) => decl.trim() && !HIDDEN_STYLE.test(`;${decl}`))
      .join('; ')
      .trim();
    if (kept) el.setAttribute('style', kept);
    else el.removeAttribute('style');
  }

  const cls = el.getAttribute('class');
  if (cls && /(^|\s)hidden(\s|$)/.test(cls)) {
    const kept = cls
      .split(/\s+/)
      .filter((token) => token && token !== 'hidden')
      .join(' ');
    if (kept) el.setAttribute('class', kept);
    else el.removeAttribute('class');
  }
}

/**
 * An element whose TEXT the mock-up's script writes at runtime — a computed
 * result banner, a live total, a derived risk level.
 *
 * The markup carries only whatever the element happened to say before the
 * script first ran. On the CAM-ICU worksheet that is
 * "Overall result: select all four features to calculate", while every real
 * outcome ("CAM-ICU POSITIVE (Delirium Present) …") is assigned inside
 * `calcCam()`. Emitting the placeholder as if it were a label is worse than
 * emitting nothing: it reads as a real instruction and is wrong in every state
 * the form can reach — this one even tells the nurse to answer four features on
 * a form designed to need three.
 *
 * Reported so the converter can tell the model the text is a placeholder and to
 * rebuild the outcomes as rule-gated Labels instead.
 */
export interface ScriptComputedTextHint {
  /** How the script addresses it, e.g. '#cam-result'. */
  selector: string;
  /** The placeholder currently in the markup, for the model to recognise. */
  placeholder: string;
}

/** At most this many computed-text elements are reported per document. */
const MAX_COMPUTED_TEXT = 12;

/**
 * Cap on a reported placeholder. Unlike the hidden-section carve-out this adds
 * NO new text to the prompt — the element is visible, so its placeholder is
 * already in the cleaned HTML — but a runaway string would still be noise.
 */
const MAX_PLACEHOLDER_CHARS = 160;

/** `banner.textContent = …` / `.innerText` / `.innerHTML` on a bound variable. */
const VAR_TEXT_WRITE =
  /([A-Za-z_$][\w$]*)\s*\.\s*(?:textContent|innerText|innerHTML)\s*=/g;

/** The one-liner form: `document.getElementById('x').textContent = …`. */
const DIRECT_TEXT_WRITE =
  /document\s*\.\s*(?:getElementById\s*\(\s*['"]([^'"]+)['"]\s*\)|querySelector\s*\(\s*['"]([^'"]+)['"]\s*\))\s*\.\s*(?:textContent|innerText|innerHTML)\s*=/g;

/** Selectors whose text content a script rewrites, in source order. */
function rewrittenTextSelectors(scripts: string): string[] {
  const bound = boundSelectors(scripts);
  const selectors: string[] = [];
  const add = (selector: string | undefined) => {
    if (selector && !selectors.includes(selector)) selectors.push(selector);
  };

  for (const m of scripts.matchAll(VAR_TEXT_WRITE)) add(bound.get(m[1] ?? ''));
  for (const m of scripts.matchAll(DIRECT_TEXT_WRITE)) {
    add(m[1] !== undefined ? `#${m[1]}` : m[2]);
  }
  return selectors;
}

/**
 * Find visible elements whose text the page's own script computes.
 *
 * Same resolution as `findScriptToggledSections` and the same limit: scripts
 * are read for the WRITE TARGET only, never for the logic that produces the
 * value. What the outcomes are, and what triggers each one, has to come from
 * the form's own visible text — on CAM-ICU the rule is stated in plain sight
 * ("POSITIVE only if Feature 1 is present AND Feature 2 is present AND
 * (Feature 3 is present OR Feature 4 is present)"), which is exactly what the
 * model is pointed at.
 *
 * Unlike the hidden-section carve-out this opens no channel at all: these
 * elements are VISIBLE, so their text is already in the cleaned HTML. Nothing
 * new reaches the model; the element is simply identified as computed.
 */
function findScriptComputedText(root: HTMLElement, html: string): ScriptComputedTextHint[] {
  const scripts = scriptText(html);
  if (!scripts.trim()) return [];

  const hints: ScriptComputedTextHint[] = [];
  for (const selector of rewrittenTextSelectors(scripts)) {
    if (hints.length >= MAX_COMPUTED_TEXT) break;

    let el: HTMLElement | null = null;
    try {
      el = root.querySelector(selector);
    } catch {
      continue;
    }
    if (!el) continue;
    // A hidden one is the toggled-section case (or stripped); not this.
    if (isHidden(el)) continue;
    // A result banner is OUTPUT. An element wrapping inputs is a container the
    // script happens to write into, and replacing it would cost real fields.
    if (el.querySelectorAll('input, select, textarea').length > 0) continue;

    const placeholder = el.text.replace(/\s+/g, ' ').trim();
    if (!placeholder || placeholder.length > MAX_PLACEHOLDER_CHARS) continue;
    if (hints.some((h) => h.selector === selector)) continue;

    hints.push({ selector, placeholder });
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
 * Calls that mean a script WRITES content into the DOM, as opposed to merely
 * reading or styling it. Any one of them anywhere in the page's scripts is
 * enough — this only decides whether recovering the page by rendering it could
 * change the outcome, never what the recovered content means.
 */
const DOM_BUILD_CALL =
  /\b(?:appendChild|insertAdjacentHTML|insertBefore|insertRow|replaceChildren|createElement|innerHTML\s*=|innerHTML\s*\+=)/;

/**
 * Find empty containers the page's OWN script fills at runtime and that the
 * markup does not already describe.
 *
 * WHY THIS EXISTS — the Sepsis screening sheet ships its 14 clinical-suspicion
 * parameters as a JS array appended into `<tbody id="sepsis-signs-body">`. The
 * static markup carries only "Parameter | Patient's Condition", so the whole
 * checklist arrived at the model as two words of table header and converted to
 * a line of static text. Nothing flagged it either: `findScriptFilledPlaceholders`
 * deliberately spares an empty `<tbody>` under a populated `<thead>` (that
 * shape is usually a record table), and the render trigger only fired when the
 * static parse found NO fields at all — this page has dozens.
 *
 * Excluded, therefore, is the shape the markup already states: a table whose
 * header names every column AND which has an "Add …" control converts to a
 * `recordTable` from the static markup alone, so it needs no render and is not
 * an unread gap. What is left is a container whose real contents exist only
 * once the page has run.
 *
 * Detection is deliberately coarse — the container must be empty, named, and
 * its name must appear in a script that builds DOM somewhere. Being wrong
 * costs one render (or one warning naming a container the author can check),
 * never invented content: scripts are read for the container NAME only, and
 * anything recovered comes from re-extracting the rendered DOM through this
 * same sanitiser.
 */
function findScriptPopulatedContainers(root: HTMLElement, html: string): string[] {
  const scripts = scriptText(html);
  if (!scripts.trim() || !DOM_BUILD_CALL.test(scripts)) return [];

  const names: string[] = [];
  for (const el of root.querySelectorAll('*')) {
    const tag = el.rawTagName?.toLowerCase() ?? '';
    if (!PLACEHOLDER_TAGS.has(tag)) continue;
    if (el.querySelectorAll('*').length > 0) continue;
    if (el.text.trim().length > 0) continue;

    // A user-extendable log is already fully described by its header row and
    // its add control, so it is not a gap and gains nothing from a render.
    if (isRepeatingTableBody(el) && nearbyAddLabel(el.closest?.('table'))) continue;

    const id = el.getAttribute('id');
    const cls = el.getAttribute('class');
    const token = id ?? cls?.trim().split(/\s+/)[0];
    if (!token) continue;
    // The script must name THIS container; an anonymous spacer div stays quiet.
    if (!scripts.includes(token)) continue;

    const name = id ? `#${id}` : `.${token}`;
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * Text of an "Add …" control near a table — same parent, or the parent's
 * parent, which is where a toolbar above the table usually sits.
 *
 * Shared so the repeating-table detector and the script-populated-container
 * detector agree on what counts as an add affordance. One shape must not be a
 * record table on one path and an unread gap on the other.
 */
function nearbyAddLabel(table: HTMLElement | null | undefined): string | undefined {
  if (!table) return undefined;
  const scopes = [table.parentNode, table.parentNode?.parentNode].filter(Boolean) as HTMLElement[];
  for (const scope of scopes) {
    const button = scope
      .querySelectorAll('button, a, input[type="button"], input[type="submit"]')
      .map((b) => (b.text || b.getAttribute('value') || '').replace(/\s+/g, ' ').trim())
      .find((text) => ADD_BUTTON.test(text));
    if (button) return button;
  }
  return undefined;
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

/**
 * Count what a rendered repeating log costs the FIELD BUDGET beyond one row.
 *
 * The budget bounds what one conversion pass has to emit, and a repeating log
 * collapses into a single `recordTable` control whose item schema holds one
 * row's worth of fields however many rows are on screen. Counting a rendered
 * page's blank rows individually therefore overstates the output: the Sepsis
 * sheet's hourly chart calls `addVitalsRow()` three times at load, and those
 * 39 identical inputs are 13 column definitions in the generated schema.
 *
 * Only tables that MATCH a hint are counted, so this can never discount an
 * ordinary data table — matching is by the hint's exact column list, and the
 * first row is always kept because that is the row the item schema encodes.
 */
export function countRepeatedLogRows(
  html: string,
  hints: RepeatingTableHint[],
): { rows: number; fields: number } {
  if (hints.length === 0) return { rows: 0, fields: 0 };
  const root = parse(html);
  let rows = 0;
  let fields = 0;

  for (const table of root.querySelectorAll('table')) {
    const headers = table
      .querySelectorAll('thead th')
      .map((th) => th.text.replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 0);
    const hint = hints.find(
      (h) =>
        h.columns.length === headers.length &&
        h.columns.every((column, index) => column === headers[index]),
    );
    if (!hint) continue;

    const bodyRows = table.querySelectorAll('tbody tr');
    if (bodyRows.length < 2) continue; // one row IS the item schema

    const fieldsIn = (row: HTMLElement) =>
      row.querySelectorAll('input, select, textarea').length;
    rows += bodyRows.length - 1;
    fields += bodyRows.slice(1).reduce((sum, row) => sum + fieldsIn(row), 0);
  }

  return { rows, fields };
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

    const scopes = [table.parentNode, table.parentNode?.parentNode].filter(Boolean) as HTMLElement[];
    const addLabel = nearbyAddLabel(table);
    let countLabel: string | undefined;
    for (const scope of scopes) {
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
      if (countLabel) break;
    }

    if (!addLabel) continue; // no add affordance → not a user-extendable log
    hints.push({ columns: headers, addLabel, countLabel });
  }

  return hints;
}
