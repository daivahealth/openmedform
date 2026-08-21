/**
 * The Angular JSON Forms renderer set: standard layout/control renderers plus
 * the higher-ranked omf/clinical custom controls. Mirrors the React registry
 * (packages/react-form-renderer) so both frameworks resolve each element the
 * same way.
 */

import type { JsonFormsRendererRegistryEntry } from '@jsonforms/core';
import {
  VerticalLayoutComponent,
  verticalLayoutTester,
  HorizontalLayoutComponent,
  horizontalLayoutTester,
  GroupLayoutComponent,
  groupTester,
  LabelComponent,
  labelTester,
  OmfTableLayoutComponent,
  omfTableTester,
} from './renderers/layouts';
import {
  TextControlComponent,
  textControlTester,
  NumberControlComponent,
  numberControlTester,
  integerControlTester,
  BooleanControlComponent,
  booleanControlTester,
  EnumControlComponent,
  enumControlTester,
  DateControlComponent,
  dateControlTester,
} from './renderers/controls';
import {
  OmfTextareaControlComponent,
  OmfRadioControlComponent,
  OmfCheckboxGroupComponent,
} from './renderers/omf-controls';
import { omfControlTesters, type OmfControlName } from './testers';
import {
  ScoringMatrixComponent,
  SignatureDateComponent,
  VitalSignsChartComponent,
  ChecklistMatrixComponent,
  ColorCodedGridComponent,
  ClinicalReferenceTableComponent,
  RiskStratificationComponent,
} from './renderers/clinical-controls';
import { ScoreSummaryComponent } from './renderers/score-controls';
import {
  RecordTableComponent,
  OmfTabsLayoutComponent,
  omfTabsTester,
} from './renderers/record-table';

/**
 * The component for every canonical omf control, registered with the tester of
 * the SAME name from `omfControlTesters`. `Record<OmfControlName, …>` makes
 * registration completeness a COMPILE-TIME guarantee: a control added to
 * form-core's OMF_CONTROL_NAMES without an Angular component fails the build
 * here (its tester is likewise forced by the map in testers.ts, and
 * renderer-set.test.ts proves each tester claims its own name).
 */
const omfControlComponents: Record<OmfControlName, unknown> = {
  textarea: OmfTextareaControlComponent,
  radio: OmfRadioControlComponent,
  checkboxGroup: OmfCheckboxGroupComponent,
  recordTable: RecordTableComponent,
  scoringMatrix: ScoringMatrixComponent,
  signatureDate: SignatureDateComponent,
  vitalSignsChart: VitalSignsChartComponent,
  checklistMatrix: ChecklistMatrixComponent,
  colorCodedGrid: ColorCodedGridComponent,
  clinicalReferenceTable: ClinicalReferenceTableComponent,
  riskStratification: RiskStratificationComponent,
  scoreSummary: ScoreSummaryComponent,
};

const entry = (name: OmfControlName): JsonFormsRendererRegistryEntry => ({
  tester: omfControlTesters[name],
  renderer: omfControlComponents[name],
});

/** Standard layout + input renderers. */
export const standardRenderers: JsonFormsRendererRegistryEntry[] = [
  { tester: verticalLayoutTester, renderer: VerticalLayoutComponent },
  { tester: horizontalLayoutTester, renderer: HorizontalLayoutComponent },
  { tester: groupTester, renderer: GroupLayoutComponent },
  { tester: labelTester, renderer: LabelComponent },
  { tester: omfTableTester, renderer: OmfTableLayoutComponent },
  { tester: textControlTester, renderer: TextControlComponent },
  { tester: numberControlTester, renderer: NumberControlComponent },
  { tester: integerControlTester, renderer: NumberControlComponent },
  { tester: booleanControlTester, renderer: BooleanControlComponent },
  { tester: enumControlTester, renderer: EnumControlComponent },
  { tester: dateControlTester, renderer: DateControlComponent },
];

/** omf-aware standard controls. */
export const omfRenderers: JsonFormsRendererRegistryEntry[] = [
  entry('textarea'),
  entry('radio'),
  entry('checkboxGroup'),
  { tester: omfTabsTester, renderer: OmfTabsLayoutComponent },
  // Repeating encounter log (add/remove records with an expandable detail
  // panel). Outranks the standard array handling so a source "+ Add <thing>"
  // table renders as that table rather than a generic list widget.
  entry('recordTable'),
];

/** The clinical custom controls. */
export const clinicalRenderers: JsonFormsRendererRegistryEntry[] = [
  entry('scoringMatrix'),
  entry('signatureDate'),
  entry('vitalSignsChart'),
  entry('checklistMatrix'),
  entry('colorCodedGrid'),
  entry('clinicalReferenceTable'),
  entry('riskStratification'),
  entry('scoreSummary'),
];

/** Complete registry consumed by <omf-form> / <jsonforms>. */
export const angularRenderers: JsonFormsRendererRegistryEntry[] = [
  ...standardRenderers,
  ...omfRenderers,
  ...clinicalRenderers,
];
