/**
 * @openmedform/form-core
 *
 * Framework-independent form engine core. It interprets the Data / UI / Print
 * contracts from @openmedform/form-schema-types; it never renders. Both the
 * React and Angular renderers (and the print engine) build on these primitives
 * so the same FormDefinition behaves identically across frameworks.
 *
 * Exposed capabilities:
 * - validation  — Ajv 2020-12 data validation
 * - schema      — scope/pointer + $ref resolution against the Data Schema
 * - binding     — read/write response values by data path or UI scope
 * - rules       — conditional SHOW/HIDE/ENABLE/DISABLE evaluation
 * - i18n        — translation-bundle resolution
 * - registry    — control-registry contract shared by both renderers
 * - serialization — empty-draft / prune / submit-payload helpers
 * - record-table  — summary-cell derivation shared by both renderers
 */

export * from './validation/validate-data';
export * from './schema/pointer';
export * from './schema/enum-options';
export * from './terminology/coded-items';
export * from './binding/data-path';
export * from './rules/evaluate-rule';
export * from './i18n/translate';
export * from './registry/control-registry';
export * from './serialization/response';
export * from './scoring/score';
export * from './record-table/summary';

export { rrtSbarReference } from './fixtures/rrt-sbar.reference';
export {
  rrtSbarSampleEmpty,
  rrtSbarSampleCompleted,
} from './fixtures/rrt-sbar.samples';
