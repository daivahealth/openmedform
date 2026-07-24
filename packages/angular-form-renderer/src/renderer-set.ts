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
  omfTextareaTester,
  OmfRadioControlComponent,
  omfRadioTester,
} from './renderers/omf-controls';
import {
  ScoringMatrixComponent,
  scoringMatrixTester,
  SignatureDateComponent,
  signatureDateTester,
  VitalSignsChartComponent,
  vitalSignsChartTester,
  ColorCodedGridComponent,
  colorCodedGridTester,
  ClinicalReferenceTableComponent,
  clinicalReferenceTableTester,
  RiskStratificationComponent,
  riskStratificationTester,
} from './renderers/clinical-controls';

/** Standard layout + input renderers. */
export const standardRenderers: JsonFormsRendererRegistryEntry[] = [
  { tester: verticalLayoutTester, renderer: VerticalLayoutComponent },
  { tester: horizontalLayoutTester, renderer: HorizontalLayoutComponent },
  { tester: groupTester, renderer: GroupLayoutComponent },
  { tester: labelTester, renderer: LabelComponent },
  { tester: textControlTester, renderer: TextControlComponent },
  { tester: numberControlTester, renderer: NumberControlComponent },
  { tester: integerControlTester, renderer: NumberControlComponent },
  { tester: booleanControlTester, renderer: BooleanControlComponent },
  { tester: enumControlTester, renderer: EnumControlComponent },
  { tester: dateControlTester, renderer: DateControlComponent },
];

/** omf-aware standard controls. */
export const omfRenderers: JsonFormsRendererRegistryEntry[] = [
  { tester: omfTextareaTester, renderer: OmfTextareaControlComponent },
  { tester: omfRadioTester, renderer: OmfRadioControlComponent },
];

/** The six clinical custom controls. */
export const clinicalRenderers: JsonFormsRendererRegistryEntry[] = [
  { tester: scoringMatrixTester, renderer: ScoringMatrixComponent },
  { tester: signatureDateTester, renderer: SignatureDateComponent },
  { tester: vitalSignsChartTester, renderer: VitalSignsChartComponent },
  { tester: colorCodedGridTester, renderer: ColorCodedGridComponent },
  { tester: clinicalReferenceTableTester, renderer: ClinicalReferenceTableComponent },
  { tester: riskStratificationTester, renderer: RiskStratificationComponent },
];

/** Complete registry consumed by <omf-form> / <jsonforms>. */
export const angularRenderers: JsonFormsRendererRegistryEntry[] = [
  ...standardRenderers,
  ...omfRenderers,
  ...clinicalRenderers,
];
