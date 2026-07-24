/**
 * CSS custom-property projection of the design tokens.
 *
 * Renderers reference these via `var(--omf-...)`. The map here is the authority;
 * `tokens.css` is the same content serialized for bundlers that import CSS
 * directly, and a test asserts the two never drift.
 */

import { tokens } from './tokens';

/** Ordered map of CSS custom-property name → value. */
export const cssVariables: Record<string, string> = {
  '--omf-grid-columns': String(tokens.grid.columns),
  '--omf-grid-gap': `${tokens.grid.gapPx}px`,

  '--omf-font-family': tokens.typography.fontFamily,
  '--omf-font-size-body': `${tokens.typography.bodySizePx}px`,
  '--omf-font-size-label': `${tokens.typography.labelSizePx}px`,
  '--omf-font-size-section-title': `${tokens.typography.sectionTitleSizePx}px`,
  '--omf-font-size-help': `${tokens.typography.helpTextSizePx}px`,
  '--omf-line-height': String(tokens.typography.lineHeight),
  '--omf-label-weight': String(tokens.typography.labelWeight),

  '--omf-field-gap': `${tokens.spacing.fieldGapPx}px`,
  '--omf-section-gap': `${tokens.spacing.sectionGapPx}px`,
  '--omf-section-padding': `${tokens.spacing.sectionPaddingPx}px`,
  '--omf-control-padding': `${tokens.spacing.controlPaddingPx}px`,

  '--omf-row-min-height': `${tokens.controls.rowMinHeightPx}px`,
  '--omf-border-width': `${tokens.controls.borderWidthPx}px`,
  '--omf-border-radius': `${tokens.controls.borderRadiusPx}px`,

  '--omf-color-border': tokens.color.border,
  '--omf-color-text': tokens.color.text,
  '--omf-color-label': tokens.color.labelText,
  '--omf-color-section-bg': tokens.color.sectionBg,
  '--omf-color-invalid': tokens.color.invalid,
};

/** Serialize the tokens as a `:root { … }` block. */
export function toCssText(selector = ':root'): string {
  const body = Object.entries(cssVariables)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
  return `${selector} {\n${body}\n}\n`;
}
