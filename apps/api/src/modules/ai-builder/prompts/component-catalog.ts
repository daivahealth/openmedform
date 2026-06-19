export function getComponentCatalog(): string {
  return `COMPONENT CATALOG WITH EXAMPLES

=== STANDARD COMPONENTS ===

textfield — Single-line text input.
Key properties: key, label, placeholder, validate.required, validate.maxLength, validate.pattern
Example:
{ "type": "textfield", "key": "patientName", "label": "Patient Name", "validate": { "required": true } }

textarea — Multi-line text input.
Key properties: key, label, rows, validate
Example:
{ "type": "textarea", "key": "clinicalNotes", "label": "Clinical Notes", "rows": 4 }

number — Numeric input with optional range validation.
Key properties: key, label, validate.required, validate.min, validate.max
Example:
{ "type": "number", "key": "patientAge", "label": "Age (years)", "validate": { "required": true, "min": 0, "max": 150 } }

checkbox — Boolean toggle, typically defaultValue: false.
Key properties: key, label, defaultValue
Example:
{ "type": "checkbox", "key": "activeCancer", "label": "Active cancer or cancer treatment", "defaultValue": false }

select — Dropdown with predefined options.
Key properties: key, label, data.values, validate
Example:
{ "type": "select", "key": "severity", "label": "Severity", "data": { "values": [{ "label": "Mild", "value": "mild" }, { "label": "Moderate", "value": "moderate" }, { "label": "Severe", "value": "severe" }] } }

radio — Radio button group.
Key properties: key, label, values, validate
Example:
{ "type": "radio", "key": "gender", "label": "Gender", "values": [{ "label": "Male", "value": "male" }, { "label": "Female", "value": "female" }] }

datetime — Date and/or time picker.
Key properties: key, label, format, enableDate, enableTime, validate
Example:
{ "type": "datetime", "key": "admissionDate", "label": "Admission Date", "enableDate": true, "enableTime": false }

panel — Groups components under a titled section.
Key properties: key, title, components
Example:
{ "type": "panel", "key": "patientInfoPanel", "title": "Patient Information", "components": [...] }

columns — Side-by-side layout within a panel.
Key properties: key, columns (array of { components, width, offset, push, pull, size })
Example:
{ "type": "columns", "key": "nameCols", "columns": [{ "components": [...], "width": 6, "offset": 0, "push": 0, "pull": 0, "size": "md" }, { "components": [...], "width": 6, "offset": 0, "push": 0, "pull": 0, "size": "md" }] }

table — Grid layout with explicit rows and columns.
Key properties: key, numRows, numCols, rows
Example:
{ "type": "table", "key": "labResults", "numRows": 2, "numCols": 3, "rows": [[{ "components": [...] }, { "components": [...] }, { "components": [...] }], [{ "components": [...] }, { "components": [...] }, { "components": [...] }]] }

tabs — Tabbed sections.
Key properties: key, components (each tab is { label, key, components })
Example:
{ "type": "tabs", "key": "assessmentTabs", "components": [{ "label": "History", "key": "historyTab", "components": [...] }, { "label": "Examination", "key": "examTab", "components": [...] }] }

htmlelement — Static HTML content.
Key properties: key, tag, content, className
Example:
{ "type": "htmlelement", "key": "instructions", "tag": "p", "content": "Complete all required fields before submission.", "className": "text-muted" }

button — Action button (submit, reset, etc.).
Key properties: key, label, action, theme
Example:
{ "type": "button", "key": "submit", "label": "Submit", "action": "submit", "theme": "primary" }

signature — Drawn signature pad.
Key properties: key, label, width, height
Example:
{ "type": "signature", "key": "physicianSignature", "label": "Physician Signature", "width": "100%", "height": "150px" }

=== CUSTOM CLINICAL COMPONENTS ===

scoringMatrix — Aggregates checkbox/radio values into domain-grouped scores.
The field references in items must point to checkbox or radio keys defined earlier in the form.
Key properties: key, label, domains (array of { name, items: [{ field, label, points }] })
Example:
{ "type": "scoringMatrix", "key": "fallRiskScore", "label": "Fall Risk Score", "domains": [{ "name": "History", "items": [{ "field": "previousFall", "label": "Previous fall", "points": 2 }, { "field": "vertigo", "label": "Vertigo / dizziness", "points": 1 }] }] }

colorCodedGrid — Displays action guidance rows color-coded by score range.
scoreField must reference a scoringMatrix key.
Key properties: key, label, scoreField, rows (array of { label, range, max, color, textColor, action })
Example:
{ "type": "colorCodedGrid", "key": "actionGrid", "label": "Recommended Actions", "scoreField": "fallRiskScore", "rows": [{ "label": "Low", "range": "0-1", "max": 1, "color": "#d4edda", "textColor": "#155724", "action": "Standard precautions." }, { "label": "High", "range": "2+", "max": 999, "color": "#f8d7da", "textColor": "#721c24", "action": "Implement fall prevention protocol." }] }

riskStratification — Maps a numeric score field to a labeled risk level with color.
scoreField must reference a scoringMatrix key. Thresholds must be ascending by max.
Key properties: key, label, scoreField, thresholds (array of { max, label, color })
Example:
{ "type": "riskStratification", "key": "fallRiskLevel", "label": "Fall Risk Level", "scoreField": "fallRiskScore", "thresholds": [{ "max": 1, "label": "Low Risk", "color": "#28a745" }, { "max": 3, "label": "Medium Risk", "color": "#ffc107" }, { "max": 999, "label": "High Risk", "color": "#dc3545" }] }

signatureDate — Combined signature block with name field, role/designation field, date, and signature pad.
Key properties: key, label, nameLabel, roleLabel
Example:
{ "type": "signatureDate", "key": "assessorSignature", "label": "Assessor Signature", "nameLabel": "Assessor Name", "roleLabel": "Designation" }

clinicalReferenceTable — Read-only reference table for clinical guidance (e.g., dosing guides, criteria).
Key properties: key, title, headers (string array), rows (array of string arrays), footnote
Example:
{ "type": "clinicalReferenceTable", "key": "dosingGuide", "title": "Dosing Reference", "headers": ["Drug", "Dose", "Notes"], "rows": [["Aspirin", "81 mg daily", "Low-dose prophylaxis"], ["Warfarin", "Per INR", "Target INR 2.0-3.0"]], "footnote": "Consult pharmacy for renal dose adjustments." }`;
}
