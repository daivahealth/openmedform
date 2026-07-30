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
  resolveSchemaAtScope,
  scopeToDataPathSegments,
  getValueAtScope,
} from '@openmedform/form-core';

export interface PrintRenderOptions {
  /** Response data to pre-fill (omitted → a blank printable form). */
  data?: Record<string, unknown>;
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
  switch (el.type) {
    case 'VerticalLayout':
      return `<div class="omf-v">${children(el, ctx)}</div>`;
    case 'HorizontalLayout':
      return `<div class="omf-h">${children(el, ctx)}</div>`;
    case 'Group':
      return `<fieldset class="omf-group">${
        el.label ? `<legend>${esc(String(el.label))}</legend>` : ''
      }${children(el, ctx)}</fieldset>`;
    case 'Label':
      return `<div class="omf-section-label">${esc((el as { text?: string }).text ?? '')}</div>`;
    case 'Control':
      return renderControl(el as UiControlLike, ctx);
    default:
      // Custom Omf* layout elements: render their children if any.
      return children(el, ctx);
  }
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
  const enumVals = (fieldSchema?.enum as string[] | undefined) ?? undefined;

  if (type === 'boolean') {
    return `<div class="omf-field"><span class="omf-check">${value ? '☑' : '☐'}</span>${esc(label)}</div>`;
  }

  if (control === 'radio' && enumVals) {
    const opts = enumVals
      .map((o) => `<span><span class="omf-check">${value === o ? '☑' : '☐'}</span>${esc(o)}</span>`)
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
