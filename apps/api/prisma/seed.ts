import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'default' },
    update: {},
    create: {
      name: 'Default Organization',
      slug: 'default',
      isActive: true,
    },
  });

  console.log(`Tenant: ${tenant.name} (${tenant.id})`);

  const passwordHash = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: {
      uq_user_tenant_email: {
        tenantId: tenant.id,
        email: 'admin@openmedform.local',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@openmedform.local',
      passwordHash,
      fullName: 'System Admin',
      role: UserRole.TENANT_ADMIN,
      isActive: true,
    },
  });

  console.log(`Admin user: ${admin.email} (${admin.id})`);

  // VTE Risk Assessment reference form
  const vteSchema = {
    display: 'form',
    components: [
      {
        type: 'panel',
        title: 'Patient Information',
        key: 'patientInfoPanel',
        components: [
          {
            type: 'columns',
            key: 'patientCols',
            columns: [
              {
                components: [
                  { type: 'textfield', key: 'patientName', label: 'Patient Name', validate: { required: true } },
                  { type: 'textfield', key: 'mrn', label: 'MRN' },
                ],
                width: 6, offset: 0, push: 0, pull: 0, size: 'md',
              },
              {
                components: [
                  { type: 'number', key: 'patientAge', label: 'Age (years)', validate: { required: true, min: 0, max: 150 } },
                  { type: 'textfield', key: 'ward', label: 'Ward / Unit' },
                ],
                width: 6, offset: 0, push: 0, pull: 0, size: 'md',
              },
            ],
          },
        ],
      },
      {
        type: 'panel',
        title: 'VTE Risk Factor Assessment',
        key: 'riskFactorsPanel',
        components: [
          {
            type: 'checkbox', key: 'activeCancer', label: 'Active cancer or cancer treatment', defaultValue: false,
          },
          {
            type: 'checkbox', key: 'ageOver60', label: 'Age over 60', defaultValue: false,
          },
          {
            type: 'checkbox', key: 'dehydration', label: 'Dehydration', defaultValue: false,
          },
          {
            type: 'checkbox', key: 'obesity', label: 'Obesity (BMI > 30)', defaultValue: false,
          },
          {
            type: 'checkbox', key: 'personalHistoryVte', label: 'Personal history of VTE', defaultValue: false,
          },
          {
            type: 'checkbox', key: 'familyHistoryVte', label: 'First-degree relative with VTE', defaultValue: false,
          },
          {
            type: 'checkbox', key: 'thrombophilia', label: 'Known thrombophilia', defaultValue: false,
          },
          {
            type: 'checkbox', key: 'immobility', label: 'Significantly reduced mobility (≥3 days)', defaultValue: false,
          },
          {
            type: 'checkbox', key: 'recentSurgery', label: 'Recent surgery (within 4 weeks)', defaultValue: false,
          },
          {
            type: 'checkbox', key: 'criticalCare', label: 'Critical care admission', defaultValue: false,
          },
          {
            type: 'scoringMatrix',
            key: 'vteRiskScore',
            label: 'VTE Risk Score',
            domains: [
              {
                name: 'Patient Factors',
                items: [
                  { field: 'activeCancer', label: 'Active cancer', points: 2 },
                  { field: 'ageOver60', label: 'Age > 60', points: 1 },
                  { field: 'dehydration', label: 'Dehydration', points: 1 },
                  { field: 'obesity', label: 'Obesity (BMI > 30)', points: 1 },
                ],
              },
              {
                name: 'Thrombotic Risk',
                items: [
                  { field: 'personalHistoryVte', label: 'Personal history of VTE', points: 2 },
                  { field: 'familyHistoryVte', label: 'Family history of VTE', points: 1 },
                  { field: 'thrombophilia', label: 'Known thrombophilia', points: 2 },
                ],
              },
              {
                name: 'Mobility & Surgery',
                items: [
                  { field: 'immobility', label: 'Reduced mobility ≥3 days', points: 2 },
                  { field: 'recentSurgery', label: 'Recent surgery', points: 2 },
                  { field: 'criticalCare', label: 'Critical care admission', points: 2 },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'panel',
        title: 'Risk Stratification',
        key: 'stratPanel',
        components: [
          {
            type: 'riskStratification',
            key: 'vteRiskLevel',
            label: 'VTE Risk Level',
            scoreField: 'vteRiskScore',
            thresholds: [
              { max: 2, label: 'Low Risk', color: '#28a745' },
              { max: 4, label: 'Medium Risk', color: '#ffc107' },
              { max: 999, label: 'High Risk', color: '#dc3545' },
            ],
          },
          {
            type: 'colorCodedGrid',
            key: 'vteActionGrid',
            label: 'Recommended Actions',
            scoreField: 'vteRiskScore',
            rows: [
              { label: 'Low Risk', range: '0–2', max: 2, color: '#d4edda', textColor: '#155724', action: 'Encourage early mobilisation. No pharmacological prophylaxis required.' },
              { label: 'Medium Risk', range: '3–4', max: 4, color: '#fff3cd', textColor: '#856404', action: 'Consider mechanical prophylaxis (TED stockings / IPC). Assess for pharmacological prophylaxis.' },
              { label: 'High Risk', range: '5+', max: 999, color: '#f8d7da', textColor: '#721c24', action: 'Pharmacological prophylaxis recommended (LMWH) unless contraindicated. Add mechanical prophylaxis.' },
            ],
          },
        ],
      },
      {
        type: 'panel',
        title: 'Bleeding Risk Contraindications',
        key: 'bleedingPanel',
        components: [
          {
            type: 'checkbox', key: 'activeBeeding', label: 'Active bleeding', defaultValue: false,
          },
          {
            type: 'checkbox', key: 'thrombocytopenia', label: 'Thrombocytopenia (platelets < 75)', defaultValue: false,
          },
          {
            type: 'checkbox', key: 'acuteStroke', label: 'Acute stroke (haemorrhagic)', defaultValue: false,
          },
          {
            type: 'checkbox', key: 'uncontrolledHypertension', label: 'Uncontrolled systolic hypertension (>230/120)', defaultValue: false,
          },
          {
            type: 'checkbox', key: 'anticoagulantUse', label: 'Concurrent use of anticoagulant (therapeutic dose)', defaultValue: false,
          },
        ],
      },
      {
        type: 'panel',
        title: 'Prophylaxis Reference',
        key: 'prophylaxisRefPanel',
        components: [
          {
            type: 'clinicalReferenceTable',
            key: 'dosingReference',
            title: 'Pharmacological VTE Prophylaxis Dosing Guide',
            headers: ['Agent', 'Standard Dose', 'Renal Adjustment (CrCl < 30)', 'Notes'],
            rows: [
              ['Enoxaparin (LMWH)', '40 mg SC once daily', '20 mg SC once daily', 'First-line agent'],
              ['Dalteparin', '5000 IU SC once daily', '2500 IU SC once daily', 'Alternative LMWH'],
              ['Fondaparinux', '2.5 mg SC once daily', 'Avoid if CrCl < 20', 'For HIT history'],
              ['UFH', '5000 IU SC every 8–12h', 'No adjustment needed', 'Preferred if CrCl < 30'],
            ],
            footnote: 'Adjust based on body weight, renal function, and bleeding risk. Consult pharmacy for complex cases.',
          },
        ],
      },
      {
        type: 'panel',
        title: 'Assessment Sign-Off',
        key: 'signoffPanel',
        components: [
          {
            type: 'textarea', key: 'clinicalNotes', label: 'Clinical Notes / Plan', rows: 3,
          },
          {
            type: 'signatureDate',
            key: 'assessorSignature',
            label: 'Assessor Signature',
            nameLabel: 'Assessor Name',
            roleLabel: 'Designation',
          },
        ],
      },
      {
        type: 'button', action: 'submit', label: 'Complete Assessment', key: 'submit', theme: 'primary',
      },
    ],
  };

  const vteScoringRules = {
    vteRiskScore: {
      type: 'sum',
      items: [
        { field: 'activeCancer', points: 2 },
        { field: 'ageOver60', points: 1 },
        { field: 'dehydration', points: 1 },
        { field: 'obesity', points: 1 },
        { field: 'personalHistoryVte', points: 2 },
        { field: 'familyHistoryVte', points: 1 },
        { field: 'thrombophilia', points: 2 },
        { field: 'immobility', points: 2 },
        { field: 'recentSurgery', points: 2 },
        { field: 'criticalCare', points: 2 },
      ],
    },
    vteRiskLevel: {
      type: 'threshold',
      scoreField: 'vteRiskScore',
      thresholds: [
        { max: 2, label: 'Low Risk' },
        { max: 4, label: 'Medium Risk' },
        { max: 999, label: 'High Risk' },
      ],
    },
  };

  const existingVte = await prisma.form.findFirst({
    where: { tenantId: tenant.id, slug: 'vte-risk-assessment' },
    include: { versions: true },
  });

  if (existingVte) {
    // Delete old versions and form to re-create with updated schema
    await prisma.form.update({ where: { id: existingVte.id }, data: { currentVersionId: null } });
    await prisma.submission.deleteMany({ where: { formId: existingVte.id } });
    await prisma.formVersion.deleteMany({ where: { formId: existingVte.id } });
    await prisma.form.delete({ where: { id: existingVte.id } });
    console.log('Deleted old VTE form for re-seed.');
  }

  {
    const vteForm = await prisma.form.create({
      data: {
        tenantId: tenant.id,
        name: 'VTE Risk Assessment',
        slug: 'vte-risk-assessment',
        description: 'Venous Thromboembolism risk assessment with scoring matrix, risk stratification, and prophylaxis reference guide.',
        category: 'Assessment',
        tags: ['VTE', 'Risk Assessment', 'Thromboprophylaxis'],
        createdById: admin.id,
      },
    });

    const vteVersion = await prisma.formVersion.create({
      data: {
        formId: vteForm.id,
        version: 1,
        schema: vteSchema as any,
        scoringRules: vteScoringRules as any,
        publishedAt: new Date(),
      },
    });

    await prisma.form.update({
      where: { id: vteForm.id },
      data: { currentVersionId: vteVersion.id, status: 'PUBLISHED' },
    });

    console.log(`VTE Risk Assessment form seeded (${vteForm.id})`);
  }

  console.log('Seed complete. Login with admin@openmedform.local / admin123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
