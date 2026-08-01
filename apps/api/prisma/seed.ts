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

  // VTE Risk Assessment reference form (JSON Forms: separated Data/UI/Print).
  // Field keys and point values match vteScoringRules below, which the server
  // uses to recalculate the score on submission — never the client.
  const RISK_FACTORS: Array<{ key: string; title: string; points: number }> = [
    { key: 'activeCancer', title: 'Active cancer or cancer treatment', points: 2 },
    { key: 'ageOver60', title: 'Age over 60', points: 1 },
    { key: 'dehydration', title: 'Dehydration', points: 1 },
    { key: 'obesity', title: 'Obesity (BMI over 30)', points: 1 },
    { key: 'personalHistoryVte', title: 'Personal history of VTE', points: 2 },
    { key: 'familyHistoryVte', title: 'Family history of VTE', points: 1 },
    { key: 'thrombophilia', title: 'Known thrombophilia', points: 2 },
    { key: 'immobility', title: 'Significantly reduced mobility', points: 2 },
    { key: 'recentSurgery', title: 'Surgery within the last 90 days', points: 2 },
    { key: 'criticalCare', title: 'Admission to critical care', points: 2 },
  ];

  const vteDataSchema = {
    type: 'object',
    properties: {
      assessmentDate: { type: 'string', format: 'date', title: 'Assessment date' },
      assessedBy: { type: 'string', title: 'Assessed by' },
      ...Object.fromEntries(
        RISK_FACTORS.map((f) => [f.key, { type: 'boolean', title: f.title }]),
      ),
      clinicalNotes: { type: 'string', title: 'Clinical notes' },
    },
    required: ['assessmentDate', 'assessedBy'],
  };

  const vteUiSchema = {
    schemaVersion: '1.0',
    layout: {
      type: 'VerticalLayout',
      elements: [
        {
          type: 'Group',
          label: 'Assessment',
          elements: [
            {
              type: 'HorizontalLayout',
              elements: [
                { type: 'Control', scope: '#/properties/assessmentDate' },
                { type: 'Control', scope: '#/properties/assessedBy' },
              ],
            },
          ],
        },
        {
          type: 'Group',
          label: 'Thrombosis risk factors',
          options: { omf: { accentColor: '#c0392b', icon: '🩸', pointLegend: [1, 2] } },
          elements: RISK_FACTORS.map((f) => ({
            type: 'Control',
            scope: `#/properties/${f.key}`,
            options: { omf: { points: f.points } },
          })),
        },
        {
          type: 'OmfScoreSummary',
          label: 'Total VTE risk score',
          options: {
            omf: {
              control: 'scoreSummary',
              bands: [
                { maxScore: 2, label: 'Low Risk', color: '#1e8e5a' },
                { minScore: 3, maxScore: 4, label: 'Medium Risk', color: '#b8860b' },
                { minScore: 5, label: 'High Risk', color: '#c0392b' },
              ],
            },
          },
        },
        {
          type: 'Control',
          scope: '#/properties/clinicalNotes',
          options: { omf: { control: 'textarea' } },
        },
      ],
    },
  };

  const vtePrintSchema = {
    schemaVersion: '1.0',
    pageSize: 'A4',
    orientation: 'portrait',
    marginsMm: { top: 12, right: 10, bottom: 12, left: 10 },
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
        dataSchema: vteDataSchema as any,
        uiSchema: vteUiSchema as any,
        printSchema: vtePrintSchema as any,
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
