/**
 * UI Schema — SOURCE OF TRUTH for screen presentation and layout.
 *
 * Vocabulary follows JSON Forms (Control/scope/elements/rule) because JSON Forms
 * is the chosen jsonforms-engine renderer for both React and Angular.
 *
 * Platform extensions ride under a dedicated vendor namespace `options.omf` so
 * they never collide with JSON Forms' own `options.*` keys (detail, format,
 * multi, …). Stock JSON Forms renderers ignore/pass through `options.omf`; our
 * registered custom renderers interpret it.
 *
 * Layout only — never data validation (that is the Data Schema's job).
 */

import type { JsonSchema } from './data-schema';

export type UiRuleEffect = 'SHOW' | 'HIDE' | 'ENABLE' | 'DISABLE';

/** JSON Forms leaf-condition style: a scope into the data plus a matching schema. */
export interface UiCondition {
  scope: string;
  schema?: JsonSchema;
}

export interface UiRule {
  effect: UiRuleEffect;
  condition: UiCondition;
}

export type LabelPosition = 'top' | 'left' | 'hidden';

/** Screen-only overrides (omf namespace). */
export interface OmfScreenOptions {
  /** Grid span out of 12. */
  colSpan?: number;
  /** Textarea rows. */
  rows?: number;
  labelPosition?: LabelPosition;
  inline?: boolean;
}

/** Print-only overrides (omf namespace), in print-safe units. */
export interface OmfPrintOptions {
  widthMm?: number;
  heightMm?: number;
  minHeightMm?: number;
  fontSizePt?: number;
  fontWeight?: 'normal' | 'bold';
  labelPosition?: LabelPosition;
  border?: boolean;
  borderMm?: number;
  align?: 'left' | 'center' | 'right';
}

/** Vendor-namespaced extension bag carried on any element under `options.omf`. */
export interface OmfOptions {
  /** Custom control/layout type resolved via the renderer's registry (e.g. 'scoringMatrix'). */
  control?: string;
  readOnly?: boolean;
  screen?: OmfScreenOptions;
  print?: OmfPrintOptions;
  [key: string]: unknown;
}

export interface UiOptions {
  /** Platform extensions — see OmfOptions. */
  omf?: OmfOptions;
  /** JSON Forms native options (detail, format, multi, …) pass through untyped. */
  [key: string]: unknown;
}

/** Standard JSON Forms element types. */
export type StandardUiElementType =
  | 'VerticalLayout'
  | 'HorizontalLayout'
  | 'Group'
  | 'Categorization'
  | 'Category'
  | 'Control'
  | 'Label';

/**
 * Custom layout element type identifiers (prefix `Omf`). These are dispatched to
 * registered custom renderers/testers; the AI generator and both framework
 * renderers share this vocabulary.
 */
export type OmfLayoutType =
  | 'OmfPageLayout'
  | 'OmfClinicalSection'
  | 'OmfGridLayout'
  | 'OmfTableLayout'
  | 'OmfTableRow'
  | 'OmfPatientHeader'
  | 'OmfCheckboxGroup'
  | 'OmfSignatureBlock'
  | 'OmfCommentsBlock'
  | 'OmfPrintHeader'
  | 'OmfPrintFooter'
  | 'OmfStaticText';

export interface UiSchemaElementBase {
  type: string;
  label?: string | boolean;
  rule?: UiRule;
  options?: UiOptions;
}

export interface UiControl extends UiSchemaElementBase {
  type: 'Control';
  /** JSON pointer into the Data Schema, e.g. '#/properties/patient/properties/patientId'. */
  scope: string;
}

export interface UiLayout extends UiSchemaElementBase {
  type: 'VerticalLayout' | 'HorizontalLayout' | 'Group';
  elements: UiSchemaElement[];
}

export interface UiCategory extends UiSchemaElementBase {
  type: 'Category';
  elements: UiSchemaElement[];
}

export interface UiCategorization extends UiSchemaElementBase {
  type: 'Categorization';
  elements: UiCategory[];
}

export interface UiLabelElement extends UiSchemaElementBase {
  type: 'Label';
  text: string;
}

/**
 * Custom layout element (e.g. OmfTableLayout, OmfSignatureBlock).
 * `elements`/`scope` are optional because different custom types use different
 * shapes; the registered renderer defines the contract per type.
 */
export interface UiCustomElement extends UiSchemaElementBase {
  type: OmfLayoutType;
  scope?: string;
  elements?: UiSchemaElement[];
}

export type UiSchemaElement =
  | UiControl
  | UiLayout
  | UiCategory
  | UiCategorization
  | UiLabelElement
  | UiCustomElement;

export interface UiSchema {
  schemaVersion: string;
  /** Root element — typically a VerticalLayout representing the page. */
  layout: UiSchemaElement;
}
