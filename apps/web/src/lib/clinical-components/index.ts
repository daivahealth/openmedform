import { registerScoringMatrix } from './scoring-matrix';
import { registerColorCodedGrid } from './color-coded-grid';
import { registerRiskStratification } from './risk-stratification';
import { registerSignatureDate } from './signature-date';
import { registerClinicalReferenceTable } from './clinical-reference-table';
import { registerVitalSignsChart } from './vital-signs-chart';

let registered = false;

export function registerClinicalComponents(Formio: any) {
  if (registered) return;
  registered = true;

  registerScoringMatrix(Formio);
  registerColorCodedGrid(Formio);
  registerRiskStratification(Formio);
  registerSignatureDate(Formio);
  registerClinicalReferenceTable(Formio);
  registerVitalSignsChart(Formio);
}

export const clinicalBuilderConfig = {
  clinical: {
    title: 'Clinical Assessment',
    default: true,
    weight: 5,
    components: {
      scoringMatrix: true,
      vitalSignsChart: true,
      colorCodedGrid: true,
      riskStratification: true,
      signatureDate: true,
      clinicalReferenceTable: true,
    },
  },
};
