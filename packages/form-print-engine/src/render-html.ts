/**
 * Reconstruct a print-accurate A4 HTML/CSS document from a jsonforms
 * FormDefinition. This is the custom print engine's core: it never uses the
 * source PDF as a background (forbidden by the spec) — it rebuilds the layout
 * from the UI + Print schemas so the output is data-fillable and re-flowable,
 * targeting "as accurate as possible", proven later by the visual-diff loop.
 *
 * Output is a self-contained HTML string (inline CSS, @page in mm). A headless
 * browser (Playwright/Chromium) or WeasyPrint rasterizes it to PDF in
 * deployment — see compare-images.ts for the fidelity loop primitive.
 */

import type {
  JsonFormsFormDefinition,
  PrintSchema,
  UiSchema,
  UiSchemaElement,
} from '@openmedform/form-schema-types';
import {
  accentTintOpaque,
  collectScoreItems,
  computeScore,
  elementBands,
  evaluateElementState,
  showsSectionSubtotal,
  resolveSchemaAtScope,
  resolveEnumOptions,
  resolveMultiEnumOptions,
  scopeToDataPathSegments,
  getValueAtScope,
} from '@openmedform/form-core';

export interface PrintRenderOptions {
  /** Response data to pre-fill (omitted → a blank printable form). */
  data?: Record<string, unknown>;
  /**
   * What to do with an element that carries a conditional `rule`.
   *
   * The right answer depends on what the sheet is FOR, so it follows `data` by
   * default rather than being one fixed policy:
   * - `'apply'` (the default once `data` is given) — a completed submission is
   *   a clinical record. A section the response never triggered was never asked,
   *   so printing it would put unanswered questions in the record.
   * - `'ignore'` (the default for a blank form) — a blank sheet is printed to be
   *   filled in by hand. Evaluating rules against no data would hide every
   *   conditional section, so a blank CAM-ICU would print Feature 1 alone and
   *   the paper form would be unusable.
   *
   * Only VISIBILITY is honoured. `ENABLE`/`DISABLE` describe an input's
   * interactivity and have no meaning on paper — a disabled field still prints.
   */
  rules?: 'apply' | 'ignore';
}

const DEFAULT_PRINT: PrintSchema = {
  schemaVersion: '1.0',
  pageSize: 'A4',
  orientation: 'portrait',
  marginsMm: { top: 12, right: 10, bottom: 12, left: 10 },
  printSafeControls: true,
};

export function renderPrintHtml(
  def: JsonFormsFormDefinition,
  options: PrintRenderOptions = {},
): string {
  const print = { ...DEFAULT_PRINT, ...(def.printSchema ?? {}) } as PrintSchema;
  const ctx: RenderCtx = {
    dataSchema: def.dataSchema,
    data: options.data ?? {},
    applyRules: (options.rules ?? (options.data ? 'apply' : 'ignore')) === 'apply',
    hasData: options.data !== undefined,
  };
  const body = renderElement((def.uiSchema as UiSchema).layout, ctx);
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><style>${pageCss(print)}</style></head>
<body>
<h1 class="omf-print-title">${esc(def.name)}</h1>
${body}
</body>
</html>`;
}

interface RenderCtx {
  dataSchema: JsonFormsFormDefinition['dataSchema'];
  data: Record<string, unknown>;
  /** Whether a conditional `rule` may remove an element from the sheet. */
  applyRules: boolean;
  /**
   * Whether a response was supplied. A section subtotal is printed only then:
   * on a BLANK sheet every score is 0, and "Σ 0 — Negative" beside an unfilled
   * qSOFA box is not a neutral placeholder, it is a wrong clinical reading.
   */
  hasData: boolean;
}

function pageCss(print: PrintSchema): string {
  const m = print.marginsMm;
  return [
    `@page { size: ${print.pageSize} ${print.orientation}; margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; }`,
    `* { box-sizing: border-box; }`,
    `body { font-family: Arial, "Helvetica Neue", sans-serif; font-size: 10pt; color: #000; margin: 0; }`,
    `.omf-print-title { font-size: 13pt; margin: 0 0 4mm; }`,
    `.omf-h { display: flex; gap: 4mm; }`,
    `.omf-h > * { flex: 1 1 0; }`,
    `.omf-v { display: block; }`,
    `.omf-group { border: 0.3mm solid #000; padding: 3mm; margin-bottom: 4mm; }`,
    `.omf-group > legend { font-weight: bold; font-size: 11pt; padding: 0 2mm; }`,
    `.omf-section-score { font-weight: normal; font-size: 9.5pt; }`,
    `.omf-callout { border: 0.5mm solid; border-radius: 1mm; padding: 2mm 3mm; margin: 2mm 0; font-weight: bold; white-space: pre-line; print-color-adjust: exact; -webkit-print-color-adjust: exact; }`,
    // pre-line preserves source line breaks so a multi-line / dash-bulleted
    // instruction Label prints one item per line instead of running together.
    `.omf-section-label { font-weight: bold; margin: 2mm 0; white-space: pre-line; }`,
    `.omf-field { margin-bottom: 2mm; }`,
    `.omf-label { font-weight: bold; margin-right: 2mm; }`,
    `.omf-box { border: 0.3mm solid #000; min-height: 6mm; padding: 1mm; }`,
    `.omf-check { font-family: "DejaVu Sans", "Segoe UI Symbol", sans-serif; margin-right: 1.5mm; }`,
    `.omf-inline { display: inline-flex; gap: 4mm; flex-wrap: wrap; }`,
  ].join('\n');
}

function renderElement(el: UiSchemaElement, ctx: RenderCtx): string {
  // Rules are evaluated with the SAME form-core code the renderers and the
  // server use, so a condition cannot mean one thing on screen and another on
  // paper. The gate sits here rather than in each branch so it covers every
  // element kind — Controls, Groups, layouts, and the Omf* custom layouts and
  // their `OmfTableRow` children, which fall through to `children()`.
  if (ctx.applyRules && !evaluateElementState(el, ctx.data).visible) return '';

  switch (el.type) {
    case 'VerticalLayout':
      return `<div class="omf-v">${children(el, ctx)}</div>`;
    case 'HorizontalLayout':
      return `<div class="omf-h">${children(el, ctx)}</div>`;
    case 'Group':
      return `<fieldset class="omf-group">${
        el.label ? `<legend>${esc(String(el.label))}${sectionScore(el, ctx)}</legend>` : ''
      }${children(el, ctx)}</fieldset>`;
    case 'Label':
      return renderLabel(el);
    case 'Control':
      return renderControl(el as UiControlLike, ctx);
    default:
      // Custom Omf* layout elements: render their children if any.
      return children(el, ctx);
  }
}

/**
 * Static text, or — with an accent colour — the bordered, tinted CALLOUT a
 * paper form uses for a result or a warning.
 *
 * The tint is mixed against white rather than laid on with alpha: print
 * pipelines routinely drop alpha compositing, and a callout whose background
 * silently disappears takes its meaning with it. `print-color-adjust` asks the
 * browser to keep it when the user prints backgrounds off; a printer that
 * still drops it leaves the border and bold text, which read as a callout on
 * their own.
 */
function renderLabel(el: UiSchemaElement): string {
  const text = esc((el as { text?: string }).text ?? '');
  const omf = (el as { options?: { omf?: { accentColor?: unknown } } }).options?.omf;
  const accent = typeof omf?.accentColor === 'string' ? omf.accentColor : undefined;
  if (!accent) return `<div class="omf-section-label">${text}</div>`;

  const tint = accentTintOpaque(accent);
  const style = [
    `color:${accent}`,
    `border-color:${accent}`,
    ...(tint ? [`background:${tint}`] : []),
  ].join('; ');
  return `<div class="omf-callout" style="${esc(style)}">${text}</div>`;
}

/**
 * A scored section's own subtotal and verdict, for the legend.
 *
 * Same decision as the renderers — form-core's `showsSectionSubtotal` picks the
 * innermost scoring box — and the same `omf.bands` stratify it, so a printed
 * qSOFA reads "Σ 2 — Positive" exactly as the screen does. Blank sheets print
 * neither: see `RenderCtx.hasData`.
 */
function sectionScore(el: UiSchemaElement, ctx: RenderCtx): string {
  if (!ctx.hasData) return '';
  if (!showsSectionSubtotal(el as never)) return '';
  const items = collectScoreItems(el as never);
  if (items.length === 0) return '';
  const score = computeScore(items, ctx.data, elementBands(el as never));
  const verdict = score.riskLabel ? ` — ${esc(score.riskLabel)}` : '';
  return `<span class="omf-section-score"> · Σ ${score.total}${verdict}</span>`;
}

function children(el: UiSchemaElement, ctx: RenderCtx): string {
  const kids = (el as { elements?: UiSchemaElement[] }).elements ?? [];
  return kids.map((k) => renderElement(k, ctx)).join('');
}

interface UiControlLike {
  type: 'Control';
  scope: string;
  label?: string | boolean;
  options?: { omf?: { control?: string; print?: PrintOpts } };
}
interface PrintOpts {
  minHeightMm?: number;
  heightMm?: number;
  border?: boolean;
  fontSizePt?: number;
}

function renderControl(el: UiControlLike, ctx: RenderCtx): string {
  const fieldSchema = resolveSchemaAtScope(ctx.dataSchema, el.scope);
  const label = controlLabel(el, fieldSchema);
  const value = getValueAtScope(ctx.data, el.scope);
  const omf = el.options?.omf;
  const control = omf?.control;
  const print = omf?.print ?? {};
  const type = Array.isArray(fieldSchema?.type) ? fieldSchema?.type[0] : fieldSchema?.type;
  // Same resolver the screen renderers use, so the printed sheet reads exactly
  // like the form the clinician filled in — not the codes underneath it.
  const enumOptions = resolveEnumOptions(fieldSchema, el);

  if (type === 'boolean') {
    return `<div class="omf-field"><span class="omf-check">${value ? '☑' : '☐'}</span>${esc(label)}</div>`;
  }

  // Multi-select checkbox group: an enum-array prints one tick box per option,
  // exactly as the screen renderers draw it — never the raw codes array.
  if (type === 'array') {
    const multiOptions = resolveMultiEnumOptions(fieldSchema, el);
    if (multiOptions.length > 0) {
      const selected = Array.isArray(value) ? (value as unknown[]).map(String) : [];
      const opts = multiOptions
        .map(
          (o) =>
            `<span><span class="omf-check">${selected.includes(o.code) ? '☑' : '☐'}</span>${esc(o.label)}</span>`,
        )
        .join('');
      return `<div class="omf-field"><span class="omf-label">${esc(label)}</span><span class="omf-inline">${opts}</span></div>`;
    }
  }

  if (control === 'radio' && enumOptions.length > 0) {
    const opts = enumOptions
      .map(
        (o) =>
          `<span><span class="omf-check">${value === o.code ? '☑' : '☐'}</span>${esc(o.label)}</span>`,
      )
      .join('');
    return `<div class="omf-field"><span class="omf-label">${esc(label)}</span><span class="omf-inline">${opts}</span></div>`;
  }

  if (control === 'textarea' || control === 'signatureDate') {
    const minH = print.minHeightMm ?? print.heightMm ?? 18;
    return `<div class="omf-field"><div class="omf-label">${esc(label)}</div><div class="omf-box" style="min-height:${minH}mm">${esc(stringifyValue(value))}</div></div>`;
  }

  // Default single-line field: label + bordered value box.
  const minH = print.minHeightMm ?? 6;
  return `<div class="omf-field"><span class="omf-label">${esc(label)}</span><span class="omf-box" style="display:inline-block;min-width:40mm;min-height:${minH}mm">${esc(stringifyValue(value))}</span></div>`;
}

function controlLabel(el: UiControlLike, fieldSchema: { title?: string } | undefined): string {
  if (typeof el.label === 'string') return el.label;
  if (fieldSchema?.title) return fieldSchema.title;
  const segs = scopeToDataPathSegments(el.scope);
  const last = segs[segs.length - 1] ?? '';
  return last.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
