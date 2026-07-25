/**
 * The JSON Forms renderer set for the platform: stock vanilla renderers for the
 * standard vocabulary (layouts, inputs, selects, checkboxes) plus our
 * higher-ranked omf/clinical custom controls. Order does not matter — JSON
 * Forms picks the highest-ranked tester per element.
 */

import type { JsonFormsRendererRegistryEntry } from '@jsonforms/core';
import { vanillaRenderers } from '@jsonforms/vanilla-renderers';
import {
  OmfTextareaControl,
  omfTextareaTester,
  OmfRadioControl,
  omfRadioTester,
  OmfCheckboxControl,
  omfCheckboxTester,
  OmfGroupControl,
  omfGroupTester,
  OmfHorizontalLayoutControl,
  omfHorizontalTester,
  OmfInputControl,
  omfInputTester,
  OmfSelectControl,
  omfSelectTester,
  OmfTableLayoutControl,
  omfTableTester,
} from './renderers/omf-controls';
import {
  ScoringMatrixControl,
  scoringMatrixTester,
  SignatureDateControl,
  signatureDateTester,
  VitalSignsChartControl,
  vitalSignsChartTester,
  ColorCodedGridControl,
  colorCodedGridTester,
  ClinicalReferenceTableControl,
  clinicalReferenceTableTester,
  RiskStratificationControl,
  riskStratificationTester,
} from './renderers/clinical-controls';

/** omf-aware standard controls (textarea, radio). */
export const omfRenderers: JsonFormsRendererRegistryEntry[] = [
  { tester: omfTextareaTester, renderer: OmfTextareaControl },
  { tester: omfRadioTester, renderer: OmfRadioControl },
  { tester: omfCheckboxTester, renderer: OmfCheckboxControl },
  { tester: omfInputTester, renderer: OmfInputControl },
  { tester: omfSelectTester, renderer: OmfSelectControl },
  { tester: omfGroupTester, renderer: OmfGroupControl },
  { tester: omfHorizontalTester, renderer: OmfHorizontalLayoutControl },
  { tester: omfTableTester, renderer: OmfTableLayoutControl },
];

/** The six clinical custom controls. */
export const clinicalRenderers: JsonFormsRendererRegistryEntry[] = [
  { tester: scoringMatrixTester, renderer: ScoringMatrixControl },
  { tester: signatureDateTester, renderer: SignatureDateControl },
  { tester: vitalSignsChartTester, renderer: VitalSignsChartControl },
  { tester: colorCodedGridTester, renderer: ColorCodedGridControl },
  { tester: clinicalReferenceTableTester, renderer: ClinicalReferenceTableControl },
  { tester: riskStratificationTester, renderer: RiskStratificationControl },
];

/** Complete renderer registry: vanilla defaults + platform custom controls. */
export const rendererRegistry: JsonFormsRendererRegistryEntry[] = [
  ...vanillaRenderers,
  ...omfRenderers,
  ...clinicalRenderers,
];
