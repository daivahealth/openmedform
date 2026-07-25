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
it end to end. (The Form.io engine is for forms authored in the drag-and-drop builder and is not the
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

> Import from `@openmedform/react-form-renderer/jsonforms` — this entry is **Form.io-free**. The
> package root (`@openmedform/react-form-renderer`) also includes the dual-engine dispatcher, which
> pulls in the Form.io stack; only use it if you also render Form.io-engine forms.

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
produced by the OpenMedForm print engine (`@openmedform/form-print-engine`), not the screen renderer.
If you need print output in your app, render via the print engine; otherwise the screen renderer is a
clean, responsive approximation of the source document.

---

## Angular

The same definition is designed to render in Angular via `@openmedform/angular-form-renderer` (built on
the same `form-core` + `form-design-tokens`). **Status:** the Angular library is present in the repo but
is not yet packaged for npm — publishing it requires an `ng-packagr` build (follow-up). Until then, the
React path above is the supported third-party integration.

---

## Publishing the packages (for OpenMedForm maintainers)

The four JSON Forms packages are configured to publish (dist-based `main`/`types`/`exports` via
`publishConfig`, `workspace:*` rewritten to versions at pack time):

```bash
# bump versions together first (they depend on each other by version), then:
for p in form-schema-types form-core form-design-tokens react-form-renderer; do
  ( cd packages/$p && pnpm publish --access public --no-git-checks )
done
```

Publish `form-schema-types` and `form-core` before the packages that depend on them. `prepack` runs
the build, so `dist/` is always fresh in the artifact.

---

## Limitations

- **Assets**: upload logos/images via the **Assets** dialog on a form's Preview screen; they are
  stored with the form and bundled (as base64 `dataUri`) into the export's `assets[]`. AI-converted
  forms start with none — add them in the Assets dialog. (Assets attach to the form's latest version.)
- **Angular packaging**: renderer exists; npm packaging via `ng-packagr` is a follow-up.
- **Form.io engine**: not the portable target. Importing the package root pulls the Form.io stack;
  use the `/jsonforms` entry for external apps.
- **Exact print fidelity**: screen rendering is a faithful *structural* reproduction, not pixel-exact;
  pixel fidelity is the print engine's job.
