# Form Builder

## Overview
The form builder is a drag-and-drop visual editor built on forked formio.js. It allows non-developers to create complex clinical assessment forms.

## Standard Components (from formio.js)
- Text Field, Text Area, Number, Select, Checkbox, Radio
- Date/Time, File Upload, Signature
- Columns, Panel, Tabs, Table, Data Grid, Field Set

## Custom Clinical Components
| Component | Purpose |
|-----------|---------|
| ScoringMatrix | Grid with domain-grouped rows, checkboxes, point values, auto-sum |
| ColorCodedGrid | Table with colored rows, highlights active row based on score |
| ClinicalReferenceTable | Read-only reference table (dosing guides, contraindications) |
| RiskStratification | Computed display badge showing risk level, updates reactively |
| SignatureDate | Signature pad + printed name + auto-date |

## Builder Features
- Drag-and-drop from component palette
- Custom "Clinical Assessment" component group in sidebar
- Real-time JSON schema generation
- Auto-save (debounced 2s)
- Form preview
- Version history
