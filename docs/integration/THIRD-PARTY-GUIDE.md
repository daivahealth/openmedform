# Third-Party Integration Guide

How an external team designs a clinical form in OpenMedForm, downloads it, and renders it inside
their **own** application — collecting responses straight into their **own** database, with no
runtime dependency on the OpenMedForm backend.

```
Design in OpenMedForm  ──►  Download definition (JSON)  ──►  Install renderer packages
        │                                                            │
        └──────────────────────────────────────────────────────────┘
                                     │
                    Render in your app (React)  ──►  onChange → save JSON to your DB
```

The **JSON Forms engine** is the portable path (data / layout / print separated). This guide covers
it end to end. (Form.io was removed in [ADR-004](../ADR/004-remove-formio-engine.md); JSON Forms is the
portable target — see [Limitations](#limitations).)

---

## 1. Design & download the form

In the OpenMedForm app:

1. **Forms → From File → JSON Forms**, upload the source PDF/image, and let the AI conversion run
   (or start from an existing JSON Forms form).
2. Open the form's **Preview**, use **Refine with AI** to adjust layout/labels (auto-saved), then
   **Publish**.
3. On the Forms list, click the **Download** (⬇) button. You get one self-contained JSON file — the
   **form definition bundle**.

You can also fetch it programmatically instead of downloading by hand:

```bash
curl -H "Authorization: Bearer <token>" \
  https://<your-openmedform-host>/api/forms/<formId>/export > form-definition.json
```

### Bundle shape (JSON Forms engine)

```jsonc
{
  "openmedform": "1.0",
  "exportedAt": "2026-07-25T...",
  "engine": "jsonforms",
  "formCode": "f145-03-...",
  "name": "ΝΟΣΗΛΕΥΤΙΚΗ ΕΚΤΙΜΗΣΗ ...",
  "version": "1",
  "language": "el",
  "dataSchema":   { /* JSON Schema 2020-12 — structure + validation (source of truth for data) */ },
  "uiSchema":     { /* layout: sections, columns, tables, control types */ },
  "printSchema":  { /* A4 print layout: margins, page breaks (mm) */ },
  "translations": { /* label / enum display strings per language */ },
  "conversionMetadata": { /* per-field confidence + warnings */ },
  "assets": [ /* logos/images inlined as base64 data URIs, when present */ ]
}
```

- **`dataSchema`** is the contract for the response you store — field keys, types, enums, required,
  conditional validation.
- Response values use **stable language-independent codes** (e.g. `avpu: "ALERT"`), never translated
  labels. Display text lives in `translations`.
- Pin the response you save to **`formCode` + `version`** so it always maps back to the exact schema.

---

## 2. Install the renderer packages

The portable JSON Forms renderer and its dependencies:

| Package | Purpose |
|---|---|
| `@openmedform/react-form-renderer` | React renderer (use the `/jsonforms` entry) |
| `@openmedform/form-core` | Ajv 2020-12 validation, binding, rules, i18n |
| `@openmedform/form-schema-types` | TypeScript contract types |
| `@openmedform/form-design-tokens` | Shared CSS variables (theming) |

Peer dependencies you already have in a React app: `react`, `react-dom`.

### Once published to your registry

```bash
npm install @openmedform/react-form-renderer @openmedform/form-core \
  @openmedform/form-schema-types @openmedform/form-design-tokens
```

### Before publishing (install from local tarballs)

From the OpenMedForm monorepo, pack the four packages and install the `.tgz` files in your app:

```bash
# in the OpenMedForm repo — pack the four packages into /tmp/omf-pkgs
mkdir -p /tmp/omf-pkgs
for p in form-schema-types form-core form-design-tokens react-form-renderer; do
  ( cd packages/$p && pnpm pack --pack-destination /tmp/omf-pkgs )
done

# in your app
npm install /tmp/omf-pkgs/openmedform-form-schema-types-0.1.0.tgz \
            /tmp/omf-pkgs/openmedform-form-core-0.1.0.tgz \
            /tmp/omf-pkgs/openmedform-form-design-tokens-0.1.0.tgz \
            /tmp/omf-pkgs/openmedform-react-form-renderer-0.1.0.tgz
```

> `@openmedform/react-form-renderer/jsonforms` and the package root are now equivalent — the root
> is Form.io-free by construction since [ADR-004](../ADR/004-remove-formio-engine.md). The
> `/jsonforms` subpath is kept as a stable alias so existing imports keep working.

---

## 3. Render in your React app

```tsx
import { useState } from 'react';
import { JsonFormsRenderer } from '@openmedform/react-form-renderer/jsonforms';
import type { JsonFormsFormDefinition } from '@openmedform/form-schema-types';
import '@openmedform/form-design-tokens/tokens.css'; // shared theming (optional but recommended)

import bundle from './form-definition.json'; // the downloaded bundle

// The bundle carries everything the renderer reads (dataSchema/uiSchema/printSchema/translations).
const definition = bundle as unknown as JsonFormsFormDefinition;

export function PatientForm({ initialData }: { initialData?: Record<string, unknown> }) {
  const [data, setData] = useState<Record<string, unknown>>(initialData ?? {});

  return (
    <JsonFormsRenderer
      definition={definition}
      data={data}
      onChange={(next) => setData(next)} // clean, language-independent JSON
      // readOnly            // for review screens
    />
  );
}
```

- The renderer draws sections, columns, left-label tables, inline checkboxes, textareas, radios and
  the clinical controls from the `uiSchema` — no form-specific code on your side.
- `onChange` hands you the response object keyed by the `dataSchema` paths. That object is what you
  persist.

---

## 4. Validate before you save

Validation comes from the **same Ajv 2020-12 instance** OpenMedForm uses, so client and your server
agree. Validate on the client for UX and **again on your server** before persisting.

```ts
import { validateData } from '@openmedform/form-core';

const { valid, errors } = validateData(definition.dataSchema, data);
if (!valid) {
  // errors: [{ instancePath, keyword, message, params }]
  return;
}
await saveToDatabase(data);
```

---

## 5. Save the response to your database

Store the response as JSON alongside the identifiers that pin it to the exact schema:

```jsonc
{
  "formCode": "f145-03-...",
  "formVersion": "1",
  "engine": "jsonforms",
  "response": { /* the onChange data — language-independent codes */ },
  "submittedAt": "2026-07-25T..."
}
```

Keeping `formCode` + `formVersion` means a stored response always maps back to the definition it was
captured against, even after the form is revised (new versions are immutable in OpenMedForm).

To render translated labels for a given language, resolve display strings from `definition.translations`
at view time — never store translated text as the value.

---

## 6. Print / PDF (optional)

`printSchema` describes the A4 print layout (mm margins, page breaks). Exact print reproduction is
produced by the OpenMedForm print engine (`@openmedform/form-print-engine`), **not** the screen
renderer. The engine is a **framework-agnostic, pure-TypeScript** function — it runs in the browser,
in Node, React or Angular — and depends only on `form-core` + `form-schema-types` (no React, no
headless browser bundled).

### Install

```bash
npm install @openmedform/form-print-engine
# (peers form-core + form-schema-types you already have from §2)
```

### The one function you need

`renderPrintHtml(definition, options?)` returns a **self-contained A4 HTML string** (inline CSS,
`@page` in mm). Pass the same downloaded bundle you render on screen; pass `data` to pre-fill the
sheet with a response, or omit it for a blank printable form.

```ts
import { renderPrintHtml } from '@openmedform/form-print-engine';

const html = renderPrintHtml(definition, { data }); // data optional
```

### A. Print preview in a browser app (what OpenMedForm itself does)

Open the A4 document in a new tab and invoke the print dialog (its live preview shows the paginated
A4). On a strict pop-up blocker, fall back to a hidden iframe so the dialog still opens:

```ts
function printForm(definition, data) {
  const html = renderPrintHtml(definition, data ? { data } : undefined);

  const w = window.open('', '_blank', 'width=900,height=1000');
  if (w) {
    w.document.write(html);
    w.document.close();
    w.setTimeout(() => w.print(), 400);
    return;
  }
  // fallback: print through an off-screen iframe (no pop-up)
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow!.document;
  doc.write(html);
  doc.close();
  iframe.contentWindow!.addEventListener('afterprint', () => iframe.remove());
  setTimeout(() => iframe.contentWindow!.print(), 400);
}
```

The same call works from an Angular component — it is plain DOM, not React-specific.

### B. Server-side PDF (headless browser)

The engine intentionally does **not** bundle a rasterizer, so you choose your own. Render the HTML,
then rasterize with Playwright/Chromium (or WeasyPrint). The `@page` size/margins from `printSchema`
drive the PDF page geometry — use `printBackground: true` and no extra margin:

```ts
import { renderPrintHtml } from '@openmedform/form-print-engine';
import { chromium } from 'playwright';

export async function toPdf(definition, data): Promise<Buffer> {
  const html = renderPrintHtml(definition, { data });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
  await browser.close();
  return pdf;
}
```

Because the print HTML is built from the **UI + Print schemas** (never a scanned image of the source),
the output is data-fillable and re-flowable — the `data` you pass fills the boxes, and multi-line /
bulleted instruction blocks keep their line breaks.

---

## Angular

The same FormDefinition renders in Angular via `@openmedform/angular-form-renderer` — built on the same
`form-core` + `form-design-tokens`, so the output matches the React renderer. It ships as a standard
Angular library (ng-packagr / Angular Package Format: partial-Ivy FESM2022 + typings), for **standalone
Angular 20** apps.

### Install

```bash
npm install @openmedform/angular-form-renderer \
  @openmedform/form-core @openmedform/form-design-tokens @openmedform/form-schema-types
# peers (you almost certainly already have these):
npm install @angular/core @angular/common @angular/forms rxjs
```

`@jsonforms/angular` + `@jsonforms/core` come in as dependencies — no need to install them yourself.

### Use

`OmfFormComponent` is standalone; import it directly and drop `<omf-form>` into a template:

```ts
import { Component } from '@angular/core';
import { OmfFormComponent } from '@openmedform/angular-form-renderer';
import type { JsonFormsFormDefinition } from '@openmedform/form-schema-types';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [OmfFormComponent],
  template: `
    <omf-form
      [definition]="definition"
      [data]="data"
      (dataChange)="data = $event"
    ></omf-form>
  `,
})
export class AppComponent {
  definition!: JsonFormsFormDefinition; // the exported jsonforms FormDefinition
  data: Record<string, unknown> = {};
}
```

Load the design tokens once (e.g. in `styles.css`) so the `--omf-*` custom properties are available —
or rely on the built-in fallbacks the renderer ships with:

```css
@import '@openmedform/form-design-tokens/tokens.css';
```

`(dataChange)` emits the response object as the clinician edits (language-independent codes, same shape
as the React renderer). Recompute the authoritative score server-side on submit — the on-screen total is
a display aid.

---

## Publishing the packages (for OpenMedForm maintainers)

The published packages are configured for dist-based `main`/`types`/`exports` via `publishConfig`, with
`workspace:*` rewritten to versions at pack time. The React/shared packages build with `tsc`; the Angular
library builds with `ng-packagr` (Angular Package Format). Normally releases go through Changesets (`pnpm
release`), but to publish manually:

```bash
# bump versions together first (they depend on each other by version), then:
for p in form-schema-types form-core form-design-tokens react-form-renderer angular-form-renderer; do
  ( cd packages/$p && pnpm publish --access public --no-git-checks )
done
```

Publish `form-schema-types` and `form-core` before the packages that depend on them. `prepack` runs the
build (`tsc`, or `ng-packagr` for the Angular library), so `dist/` is always fresh in the artifact.

---

## Limitations

- **Assets**: upload logos/images via the **Assets** dialog on a form's Preview screen; they are
  stored with the form and bundled (as base64 `dataUri`) into the export's `assets[]`. AI-converted
  forms start with none — add them in the Assets dialog. (Assets attach to the form's latest version.)
- **Exact print fidelity**: screen rendering is a faithful *structural* reproduction, not pixel-exact;
  pixel fidelity is the print engine's job.
