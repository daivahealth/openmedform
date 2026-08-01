/**
 * Shared style fragments for the Angular renderers, built on the same
 * `--omf-*` design tokens the React renderer uses. Because Angular component
 * styles are view-encapsulated, each component includes FIELD_STYLES; the token
 * custom properties themselves are set once on the host of the root form
 * component (see OmfFormComponent) and inherited by all descendants.
 */

import { cssVariables } from '@openmedform/form-design-tokens';

/** Token custom properties as a style object for the root host element. */
export const tokenStyleObject: Record<string, string> = cssVariables;

/** Reusable CSS for a field frame + inputs + tables, shared by every renderer. */
export const FIELD_STYLES = `
  .omf-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: var(--omf-field-gap, 12px); }
  .omf-label { font-size: var(--omf-font-size-label, 13px); font-weight: var(--omf-label-weight, 600); color: var(--omf-color-label, #3a4552); }
  .omf-required { color: var(--omf-color-invalid, #c0392b); }
  .omf-error { font-size: var(--omf-font-size-help, 12px); color: var(--omf-color-invalid, #c0392b); }
  .omf-input, .omf-textarea, .omf-select {
    font-size: var(--omf-font-size-body, 14px);
    padding: var(--omf-control-padding, 8px);
    border: var(--omf-border-width, 1px) solid var(--omf-color-border, #c8cdd4);
    border-radius: var(--omf-border-radius, 4px);
    min-height: var(--omf-row-min-height, 36px);
    width: 100%;
    box-sizing: border-box;
  }
  .omf-textarea { resize: vertical; }
  .omf-radio-group { display: flex; gap: 16px; flex-wrap: wrap; }
  .omf-radio-group.stacked { flex-direction: column; gap: 4px; }
  .omf-radio-option { display: inline-flex; align-items: center; gap: 6px; font-size: var(--omf-font-size-body, 14px); }
  .omf-table { width: 100%; border-collapse: collapse; font-size: var(--omf-font-size-body, 14px); }
  .omf-table th, .omf-table td { border: var(--omf-border-width, 1px) solid var(--omf-color-border, #c8cdd4); padding: var(--omf-control-padding, 8px); text-align: left; }
  .omf-domain { background: var(--omf-color-section-bg, #f7f8fa); }
  .omf-group { border: var(--omf-border-width, 1px) solid var(--omf-color-border, #c8cdd4); border-radius: var(--omf-border-radius, 4px); margin-bottom: var(--omf-section-gap, 20px); overflow: hidden; }
  .omf-group-body { padding: var(--omf-control-padding, 8px); }
  .omf-group-title { font-size: var(--omf-font-size-section-title, 15px); font-weight: 600; margin: 0 0 8px; }
  .omf-row { display: flex; gap: var(--omf-grid-gap, 12px); flex-wrap: wrap; }
  .omf-row > * { flex: 1 1 0; min-width: 120px; }
  .omf-check-row { display: flex; align-items: center; gap: 8px; }
  .omf-check-row .omf-radio-option { flex: 1 1 auto; }
  .omf-point-badge {
    flex: 0 0 auto; min-width: 22px; text-align: center; padding: 1px 7px;
    border-radius: var(--omf-border-radius, 4px); border: 1px solid currentColor;
    font-size: var(--omf-font-size-help, 12px); font-weight: 700; line-height: 1.6;
  }
  .omf-group-header {
    display: flex; align-items: center; gap: 8px;
    background: var(--omf-color-section-bg, #f7f8fa);
    border-bottom: var(--omf-border-width, 1px) solid var(--omf-color-border, #c8cdd4);
    padding: var(--omf-control-padding, 8px);
    font-weight: var(--omf-label-weight, 600); font-size: var(--omf-font-size-label, 13px);
    color: var(--omf-color-label, #3a4552);
  }
  .omf-group-header .omf-icon { flex: 0 0 auto; font-size: 1.1em; line-height: 1; }
  .omf-group-header .omf-group-title { flex: 1 1 auto; margin: 0; }
  .omf-legend { display: inline-flex; gap: 4px; flex: 0 0 auto; }

  /* --- record table (repeating encounter log) --- */
  /* Mirrors the inline styles of the React recordTable so the same definition
     looks identical in both frameworks. */
  .omf-record-table { margin-bottom: var(--omf-section-gap, 16px); }
  .omf-record-toolbar {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; flex-wrap: wrap; margin-bottom: 8px;
  }
  .omf-record-count {
    font-family: var(--omf-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: var(--omf-font-size-label, 13px); color: var(--omf-color-label, #3a4552);
  }
  .omf-record-add {
    padding: 8px 16px; border: var(--omf-border-width, 1px) solid var(--omf-color-border, #c8cdd4);
    border-radius: var(--omf-border-radius, 4px); background: var(--omf-color-accent, #4a2d5c);
    color: #fff; font-weight: 600; font-size: var(--omf-font-size-body, 14px); cursor: pointer;
  }
  .omf-record-add[disabled] { cursor: not-allowed; opacity: .6; }
  /* A flex/grid item defaults to min-width:auto, so a wide table would stretch
     the host page instead of scrolling inside its own container. */
  .omf-scroll-x { overflow-x: auto; min-width: 0; max-width: 100%; }
  .omf-record-grid { width: 100%; border-collapse: collapse; }
  .omf-record-grid th, .omf-record-grid td {
    border: var(--omf-border-width, 1px) solid var(--omf-color-border, #c8cdd4);
    padding: var(--omf-control-padding, 8px);
  }
  .omf-record-grid th {
    background: var(--omf-color-header-bg, #4a2d5c); color: var(--omf-color-header-fg, #fff);
    font-size: var(--omf-font-size-label, 13px); text-transform: uppercase;
    letter-spacing: .4px; white-space: nowrap; text-align: left;
  }
  .omf-record-grid .omf-record-actions-col { width: 1%; }
  /* Column-oriented mode: the left-hand parameter spine. */
  .omf-record-grid .omf-record-param-col { min-width: 170px; }
  .omf-record-grid .omf-record-param-cell {
    background: var(--omf-color-section-bg, #f7f8fa);
    font-weight: var(--omf-label-weight, 600); font-size: var(--omf-font-size-label, 13px);
    color: var(--omf-color-label, #3a4552); white-space: nowrap;
  }
  .omf-record-grid td.omf-record-open { background: var(--omf-color-section-bg, #f0eaf4); }
  .omf-record-grid tr.omf-record-open > td { background: var(--omf-color-section-bg, #f0eaf4); }
  .omf-record-empty {
    text-align: center; font-style: italic; color: var(--omf-color-muted, #6b7280);
    padding: calc(var(--omf-control-padding, 8px) * 2);
  }
  .omf-record-actions { white-space: nowrap; }
  /* Pin the actions column: a converted chart can run to ten columns and
     scroll, and if Open/remove scroll away a row cannot be deleted at all. */
  .omf-record-grid .omf-record-actions-sticky {
    position: sticky; right: 0; z-index: 1;
    background: var(--omf-color-surface, #fff);
    box-shadow: inset 1px 0 0 var(--omf-color-border, #c8cdd4);
  }
  /* An inline cell control should fill its cell and lose its outer gap. */
  .omf-record-grid td .omf-field { margin-bottom: 0; }
  .omf-record-toggle, .omf-record-remove {
    padding: 4px 12px; border: var(--omf-border-width, 1px) solid var(--omf-color-border, #c8cdd4);
    border-radius: var(--omf-border-radius, 4px); background: transparent;
    font-weight: 600; cursor: pointer;
  }
  .omf-record-toggle { color: var(--omf-color-accent, #4a2d5c); }
  .omf-record-remove { margin-left: 6px; padding: 4px 10px; color: var(--omf-color-danger, #a3312a); }
  .omf-record-detail { background: #fff; }
  /* The detail panel's own fields sit in a table cell; drop the trailing gap so
     the last field does not float above the cell border. */
  .omf-record-detail > * > .omf-field:last-child { margin-bottom: 0; }

  /* --- tabs --- */
  .omf-tablist {
    display: flex; flex-wrap: wrap; gap: 4px;
    border-bottom: var(--omf-border-width, 1px) solid var(--omf-color-border, #c8cdd4);
    margin-bottom: var(--omf-section-gap, 16px);
  }
  .omf-tab {
    appearance: none; border: none; background: transparent; padding: 8px 14px;
    cursor: pointer; font-size: var(--omf-font-size-body, 14px); font-weight: 500;
    color: var(--omf-color-label, #3a4552); border-bottom: 2px solid transparent;
    margin-bottom: -1px;
  }
  .omf-tab-active {
    font-weight: 700; color: var(--omf-color-accent, #4a2d5c);
    border-bottom-color: var(--omf-color-accent, #4a2d5c);
  }
`;
