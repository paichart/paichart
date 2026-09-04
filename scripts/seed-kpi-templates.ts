/**
 * Seed KPI Templates + Create default KPIs for active POVs
 *
 * Creates 3 KPITemplate records (one per calculator) and optionally
 * creates POVKPI records for active POVs that don't have them yet.
 *
 * Run: npx ts-node scripts/seed-kpi-templates.ts
 *
 * Safe to run multiple times (upsert pattern).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const KPI_TEMPLATES = [
  {
    id: 'kpi-template-task-completion-rate',
    name: 'Task Completion Rate',
    description: 'Percentage of tasks completed in this POV',
    type: 'PERCENTAGE' as const,
    calculation: 'task-completion-rate',
    defaultTarget: { value: 90, threshold: { warning: 70, critical: 50 } },
    defaultWeight: 40,
  },
  {
    id: 'kpi-template-on-time-rate',
    name: 'On-Time Delivery',
    description: 'Percentage of completed tasks delivered before due date',
    type: 'PERCENTAGE' as const,
    calculation: 'on-time-rate',
    defaultTarget: { value: 85, threshold: { warning: 70, critical: 50 } },
    defaultWeight: 35,
  },
  {
    id: 'kpi-template-stale-task-ratio',
    name: 'Stale Task Ratio',
    description: 'Percentage of active tasks not updated in 7+ days (lower is better)',
    type: 'PERCENTAGE' as const,
    calculation: 'stale-task-ratio',
    defaultTarget: { value: 10, threshold: { warning: 20, critical: 35 } },
    defaultWeight: 25,
  },
];

async function seedKPITemplates() {
  console.log('📊 Seeding KPI Templates...\n');

  // Step 1: Upsert templates
  for (const tmpl of KPI_TEMPLATES) {
    await prisma.kPITemplate.upsert({
      where: { id: tmpl.id },
      update: {
        name: tmpl.name,
        description: tmpl.description,
        calculation: tmpl.calculation,
        defaultTarget: tmpl.defaultTarget,
      },
      create: {
        id: tmpl.id,
        name: tmpl.name,
        description: tmpl.description,
        type: tmpl.type,
        isCustom: false,
        defaultTarget: tmpl.defaultTarget,
        calculation: tmpl.calculation,
      },
    });
    console.log(`  ✅ ${tmpl.id} — ${tmpl.name}`);
  }

  // Step 2: Create default KPIs for active POVs that don't have them
  const activePOVs = await prisma.pOV.findMany({
    where: { status: { in: ['IN_PROGRESS', 'STALLED', 'VALIDATION'] } },
    select: { id: true, title: true },
  });

  console.log(`\n📋 Found ${activePOVs.length} active POVs\n`);

  let created = 0;
  let skipped = 0;

  for (const pov of activePOVs) {
    // Check if POV already has formula-backed KPIs
    const existingKPIs = await prisma.pOVKPI.findMany({
      where: { povId: pov.id, templateId: { not: null } },
      select: { templateId: true },
    });
    const existingTemplateIds = new Set(existingKPIs.map(k => k.templateId));

    for (const tmpl of KPI_TEMPLATES) {
      if (existingTemplateIds.has(tmpl.id)) {
        skipped++;
        continue;
      }

      await prisma.pOVKPI.create({
        data: {
          povId: pov.id,
          templateId: tmpl.id,
          name: tmpl.name,
          target: tmpl.defaultTarget,
          current: { value: 0 },
          history: [],
          weight: tmpl.defaultWeight,
        },
      });
      created++;
    }
    console.log(`  ✅ ${pov.title} — ${KPI_TEMPLATES.length - [...existingTemplateIds].filter(id => KPI_TEMPLATES.some(t => t.id === id)).length} KPIs created`);
  }

  console.log(`\n✅ KPI seeding complete!`);
  console.log(`   Templates: ${KPI_TEMPLATES.length}`);
  console.log(`   KPIs created: ${created}`);
  console.log(`   KPIs skipped (already exist): ${skipped}`);
  console.log(`   Total POVs: ${activePOVs.length}`);
}

seedKPITemplates()
  .catch(console.error);
