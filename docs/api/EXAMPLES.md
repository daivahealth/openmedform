---
publish: true
description: "Worked API examples covering a full form lifecycle from creation through submission and scoring."
---

# API Examples — Full Form Flow

End-to-end example requests (spec §27), from source-document conversion through
render, submit, sign, and print. See
[ADR-004](../ADR/004-remove-formio-engine.md) for the current architecture
(JSON Forms only) and [README.md](README.md) for the full endpoint list.

All requests need a bearer token: `-H "Authorization: Bearer $TOKEN"` (obtain via
`POST /api/auth/login`). Base URL below is `$API` (e.g. `http://localhost:3100`).

## 1. Convert a PDF → jsonforms draft (async job)

```bash
curl -X POST "$API/api/conversions" -H "Authorization: Bearer $TOKEN" \
  -F "file=@rrt-sbar.pdf" -F "provider=claude" \
  -F "category=Handover (SBAR)" -F "formType=PATIENT"
# → { "id": "<jobId>", "status": "PENDING", ... }
```

`category` and `formType` are optional and land on the created form row, so a
converted form is as complete in the forms list as a described one. The body is
validated with `forbidNonWhitelisted` — an undeclared field is a 400. (`engine`
is still accepted and ignored, for clients written before ADR-004.)

Poll until `REVIEW` (or `FAILED`):

```bash
curl "$API/api/conversions/<jobId>" -H "Authorization: Bearer $TOKEN"
# → { "status": "REVIEW", "formId": "<formId>", "warnings": [ { "type": "UNCERTAIN_TRANSLATION", ... } ] }
```

## 2. Review, refine, accept

Refine the generated Data/UI/Print schemas with natural language (SSE stream):

```bash
curl -N -X POST "$API/api/forms/<formId>/jsonforms/refine" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "instruction": "Make the AVPU field required and add a Greek label for Recommendation" }'
# → data: {"type":"progress","message":"..."}   data: {"type":"result","dataSchema":{...},...}
```

Accept the reviewed draft (REVIEW → DRAFT):

```bash
curl -X POST "$API/api/conversions/<jobId>/accept" -H "Authorization: Bearer $TOKEN"
# → { "accepted": true, "formId": "<formId>" }
```

## 3. Publish (immutable content hash)

```bash
curl -X POST "$API/api/forms/<formId>/publish" -H "Authorization: Bearer $TOKEN"
# → { "id": "<versionId>", "engine": "JSONFORMS", "contentHash": "<sha256>", "publishedAt": "..." }

curl "$API/api/forms/<formId>/versions/<versionId>/integrity" -H "Authorization: Bearer $TOKEN"
# → { "versionId": "...", "published": true, "intact": true }
```

## 4. Render (React or Angular)

The published `FormDefinition` (engine `jsonforms`) is rendered by
`@openmedform/react-form-renderer` (`<FormRenderer definition={def} />`) or
`@openmedform/angular-form-renderer` (`<omf-form [definition]="def">`) — the same
definition, equivalent field trees in both.

## 5. Draft → submit (server-side validated) → sign

```bash
# start an instance
curl -X POST "$API/api/forms/<formId>/submissions" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{}'
# auto-save data
curl -X PUT "$API/api/submissions/<submissionId>" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d @completed-response.json
# complete → Ajv-validated server-side (400 if invalid), scored
curl -X POST "$API/api/submissions/<submissionId>/complete" -H "Authorization: Bearer $TOKEN"
# sign → status SIGNED, locked
curl -X POST "$API/api/submissions/<submissionId>/sign" -H "Authorization: Bearer $TOKEN"
```

## 6. Print

`@openmedform/form-print-engine`'s `renderPrintHtml(definition, { data })`
reconstructs an A4 HTML/CSS document; a deployment-injected rasterizer
(Playwright/Chromium or WeasyPrint) produces the PDF.

## Sample responses (RRT/SBAR reference)

These mirror `packages/form-core` fixtures (`rrtSbarSampleEmpty`,
`rrtSbarSampleCompleted`). Values are language-independent codes, never
translated labels.

### Empty (new draft)

```json
{ "callDetails": {}, "reasonForCall": {}, "assessment": {} }
```

### Completed (schema-valid)

```json
{
  "callDetails": { "date": "2026-07-24", "floorRoom": "3ος / 312", "callTime": "14:05", "arrivalTime": "14:09", "endTime": "14:40" },
  "reasonForCall": { "pulseGreaterThan130": true, "bpLessThan90": true, "breathsGreaterThan24": true },
  "situation": "Ασθενής με ταχυκαρδία και υπόταση μετά από χειρουργείο.",
  "background": "Ιστορικό κολπικής μαρμαρυγής, υπό αντιπηκτική αγωγή.",
  "assessment": { "temperature": 37.8, "bloodPressure": "85/50", "pulse": 138, "respirations": 26, "spo2": 95, "glasgow": 15, "avpu": "ALERT" },
  "recommendation": "Χορήγηση IV υγρών, ΗΚΓ, ενημέρωση εφημερεύοντος ιατρού.",
  "anticoagulantUse": "YES"
}
```
