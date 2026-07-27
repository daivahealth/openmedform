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
`;
