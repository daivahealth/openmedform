/**
 * Print Schema — SOURCE OF TRUTH for the exact A4 print layout.
 *
 * The print engine reconstructs the form from this + the UI Schema; it never
 * uses the source PDF as a background image. Units are print-safe (mm / pt).
 */

export type PageSize = 'A4';
export type PageOrientation = 'portrait' | 'landscape';

export interface PageMarginsMm {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PrintPageBreakRule {
  /** Force a page break before the element at this data scope. */
  beforeScope?: string;
  /** Force a page break after the element at this data scope. */
  afterScope?: string;
}

export interface PrintSchema {
  schemaVersion: string;
  pageSize: PageSize;
  orientation: PageOrientation;
  marginsMm: PageMarginsMm;
  /** Repeat the form header on every printed page. */
  repeatHeader?: boolean;
  /** Repeat the patient-identity block on every printed page. */
  repeatPatientBlock?: boolean;
  /** Render checkboxes/radios as print-safe glyphs rather than form controls. */
  printSafeControls?: boolean;
  /** Optimise for black-and-white printing. */
  blackAndWhite?: boolean;
  pageBreaks?: PrintPageBreakRule[];
}
