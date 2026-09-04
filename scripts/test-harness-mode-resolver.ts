#!/usr/bin/env ts-node
/**
 * Harness Mode Resolver — integration tests
 *
 * Exercises the 8 resolver branches per `lib/services/harnessModeResolver.ts`:
 *   1. NOT_PIPELINE     — non-PIPELINE task
 *   2. CREATE / no-pipelineStageId — PIPELINE with no metadata.pipelineStageId
 *   3. CREATE / empty-stage — pipelineStageId set but child stage has 0 tasks
 *   4. SYNTHESIZE / all-terminal — N children, all COMPLETED or FAILED
 *   5. ORCHESTRATE / partial-terminal — some terminal, some not
 *   6. ORCHESTRATE / in-flight — N children, all RUNNING (none terminal, none templates-missing)
 *   7. CREATE / missing-stage — pipelineStageId references non-existent stage
 *   8. CROSS_TENANT_DETECTED — pipelineStageId references stage in different POV
 *
 * Pattern model: `scripts/test-stage-metadata-merge.ts` (real-DB integration test).
 *
 * Created: 2026-04-26 (Deploy 3 — Item 6.1)
 * Source-of-truth: cline_docs/reviews/mode-detection-out-of-llm-turn-2026-04-26/execution-checklist.md
 */

if (!process.env.DATABASE_URL) {
  console.log('⏭️  Harness Mode Resolver Tests: SKIPPED — DATABASE_URL not set');
  console.log('   (Real-DB integration test; run locally with .env loaded to execute.)');
  process.exit(0);
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('../lib/prisma') as typeof import('../lib/prisma');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolveHarnessMode } =
  require('../lib/services/harnessModeResolver') as typeof import('../lib/services/harnessModeResolver');

console.log('🧪 Harness Mode Resolver Integration Tests\n');

let passed = 0;
let failed = 0;

function test(description: string, fn: () => Promise<void>): Promise<void> {
  return fn().then(
    () => { console.log(`✅ ${description}`); passed++; },
    (error) => {
      console.error(`❌ ${description}`);
      if (error instanceof Error) console.error(`   ${error.message}`);
      failed++;
    }
  );
}

function assert(condition: any, message: string) {
  if (!condition) throw new Error(message);
}

interface Fixture {
  povAId: string;
  povBId: string;
  phaseAId: string;
  phaseBId: string;
  parentStageAId: string;
  parentStageBId: string;
  cleanup: () => Promise<void>;
}

async function buildFixture(): Promise<Fixture> {
  const owner = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
  if (!owner) throw new Error('No ADMIN user found for test fixture');
  const country = await prisma.country.findFirst({ select: { id: true } });
  if (!country) throw new Error('No Country found for test fixture');

  const now = new Date();
  const future = new Date(now.getTime() + 30 * 86400000);

  const povA = await prisma.pOV.create({
    data: {
      title: `__test_resolver_A_${Date.now()}`,
      description: 'Resolver test POV A',
      ownerId: owner.id, status: 'PROJECTED',
      startDate: now, endDate: future,
      salesTheatre: 'NORTH_AMERICA', countryId: country.id,
    },
  });
  const povB = await prisma.pOV.create({
    data: {
      title: `__test_resolver_B_${Date.now()}`,
      description: 'Resolver test POV B (cross-tenant)',
      ownerId: owner.id, status: 'PROJECTED',
      startDate: now, endDate: future,
      salesTheatre: 'NORTH_AMERICA', countryId: country.id,
    },
  });
  const phaseA = await prisma.phase.create({
    data: { name: 'Phase A', type: 'EXECUTION', povId: povA.id, order: 0,
            description: '', startDate: now, endDate: future },
  });
  const phaseB = await prisma.phase.create({
    data: { name: 'Phase B', type: 'EXECUTION', povId: povB.id, order: 0,
            description: '', startDate: now, endDate: future },
  });
  const parentStageA = await prisma.stage.create({
    data: { name: 'Parent Stage A', phaseId: phaseA.id, order: 0 },
  });
  const parentStageB = await prisma.stage.create({
    data: { name: 'Parent Stage B', phaseId: phaseB.id, order: 0 },
  });

  const cleanup = async () => {
    for (const povId of [povA.id, povB.id]) {
      await prisma.task.deleteMany({ where: { povId } });
      await prisma.stage.deleteMany({ where: { phase: { povId } } });
      await prisma.phase.deleteMany({ where: { povId } });
      await prisma.pOV.delete({ where: { id: povId } });
    }
  };

  return {
    povAId: povA.id, povBId: povB.id,
    phaseAId: phaseA.id, phaseBId: phaseB.id,
    parentStageAId: parentStageA.id, parentStageBId: parentStageB.id,
    cleanup,
  };
}

(async () => {
  let fix: Fixture | null = null;
  try {
    fix = await buildFixture();
    const f = fix;

    // 1. NOT_PIPELINE
    await test('1. NOT_PIPELINE: non-PIPELINE task → NOT_PIPELINE / not-pipeline', async () => {
      const t = await prisma.task.create({
        data: { title: 'not-pipeline', povId: f.povAId, stageId: f.parentStageAId, type: 'ACTION' as any },
      });
      const r = await resolveHarnessMode(t.id);
      assert(r.mode === 'NOT_PIPELINE', `mode=${r.mode}`);
      assert(r.reasonCode === 'not-pipeline', `reasonCode=${r.reasonCode}`);
    });

    // 2. CREATE / no-pipelineStageId
    await test('2. CREATE / no-pipelineStageId: PIPELINE with no metadata.pipelineStageId', async () => {
      const t = await prisma.task.create({
        data: { title: 'no-stage', povId: f.povAId, stageId: f.parentStageAId, type: 'PIPELINE' as any },
      });
      const r = await resolveHarnessMode(t.id);
      assert(r.mode === 'CREATE', `mode=${r.mode}`);
      assert(r.reasonCode === 'no-pipelineStageId', `reasonCode=${r.reasonCode}`);
      assert(r.pipelineStageId === null, `pipelineStageId=${r.pipelineStageId}`);
    });

    // 3. CREATE / empty-stage
    await test('3. CREATE / empty-stage: pipelineStageId set, child stage has 0 tasks', async () => {
      const childStage = await prisma.stage.create({
        data: { name: 'Empty Child', phaseId: f.phaseAId, order: 1 },
      });
      const t = await prisma.task.create({
        data: { title: 'empty-stage', povId: f.povAId, stageId: f.parentStageAId, type: 'PIPELINE' as any,
                metadata: { pipelineStageId: childStage.id } as any },
      });
      const r = await resolveHarnessMode(t.id);
      assert(r.mode === 'CREATE', `mode=${r.mode}`);
      assert(r.reasonCode === 'empty-stage', `reasonCode=${r.reasonCode}`);
      assert(r.childStageTaskCount === 0, `count=${r.childStageTaskCount}`);
    });

    // 4. SYNTHESIZE / all-terminal
    await test('4. SYNTHESIZE / all-terminal: 3 children all terminal', async () => {
      const childStage = await prisma.stage.create({
        data: { name: 'All Terminal', phaseId: f.phaseAId, order: 2 },
      });
      const t = await prisma.task.create({
        data: { title: 'synth', povId: f.povAId, stageId: f.parentStageAId, type: 'PIPELINE' as any,
                metadata: { pipelineStageId: childStage.id } as any },
      });
      for (let i = 0; i < 3; i++) {
        await prisma.task.create({
          data: { title: `terminal-child-${i}`, povId: f.povAId, stageId: childStage.id,
                  type: 'ACTION' as any, status: 'COMPLETED' },
        });
      }
      const r = await resolveHarnessMode(t.id);
      assert(r.mode === 'SYNTHESIZE', `mode=${r.mode}`);
      assert(r.reasonCode === 'all-terminal', `reasonCode=${r.reasonCode}`);
      assert(r.childStageTaskCount === 3, `count=${r.childStageTaskCount}`);
      assert(r.childStageTerminalCount === 3, `terminal=${r.childStageTerminalCount}`);
    });

    // 5. ORCHESTRATE / partial-terminal
    await test('5. ORCHESTRATE / partial-terminal: 2 of 3 terminal', async () => {
      const childStage = await prisma.stage.create({
        data: { name: 'Partial', phaseId: f.phaseAId, order: 3 },
      });
      const t = await prisma.task.create({
        data: { title: 'partial', povId: f.povAId, stageId: f.parentStageAId, type: 'PIPELINE' as any,
                metadata: { pipelineStageId: childStage.id } as any },
      });
      await prisma.task.create({
        data: { title: 'partial-c1', povId: f.povAId, stageId: childStage.id,
                type: 'ACTION' as any, status: 'COMPLETED' },
      });
      await prisma.task.create({
        data: { title: 'partial-c2', povId: f.povAId, stageId: childStage.id,
                type: 'ACTION' as any, status: 'COMPLETED' },
      });
      await prisma.task.create({
        data: { title: 'partial-c3', povId: f.povAId, stageId: childStage.id,
                type: 'ACTION' as any, status: 'OPEN' },
      });
      const r = await resolveHarnessMode(t.id);
      assert(r.mode === 'ORCHESTRATE', `mode=${r.mode}`);
      assert(r.reasonCode === 'partial-terminal', `reasonCode=${r.reasonCode}`);
    });

    // 6. ORCHESTRATE / in-flight (per pipeline-harness I4 — distinct from partial-terminal)
    await test('6. ORCHESTRATE / in-flight: 3 of 3 RUNNING (none terminal)', async () => {
      const childStage = await prisma.stage.create({
        data: { name: 'In Flight', phaseId: f.phaseAId, order: 4 },
      });
      const t = await prisma.task.create({
        data: { title: 'in-flight', povId: f.povAId, stageId: f.parentStageAId, type: 'PIPELINE' as any,
                metadata: { pipelineStageId: childStage.id } as any },
      });
      for (let i = 0; i < 3; i++) {
        await prisma.task.create({
          data: { title: `running-${i}`, povId: f.povAId, stageId: childStage.id,
                  type: 'ACTION' as any, status: 'IN_PROGRESS', executionStatus: 'RUNNING' },
        });
      }
      const r = await resolveHarnessMode(t.id);
      assert(r.mode === 'ORCHESTRATE', `mode=${r.mode}`);
      // The CRITICAL distinction (per pipeline-harness EH#6): reasonCode separates in-flight from partial-terminal
      assert(r.reasonCode === 'in-flight',
        `reasonCode must be 'in-flight' (NOT just 'ORCHESTRATE') — got reasonCode=${r.reasonCode}`);
    });

    // 7. CREATE / missing-stage
    await test('7. CREATE / missing-stage: pipelineStageId references non-existent stage', async () => {
      const t = await prisma.task.create({
        data: { title: 'missing-stage', povId: f.povAId, stageId: f.parentStageAId, type: 'PIPELINE' as any,
                metadata: { pipelineStageId: 'cmnonexistentstage12345xx' } as any },
      });
      const r = await resolveHarnessMode(t.id);
      assert(r.mode === 'CREATE', `mode=${r.mode}`);
      assert(r.reasonCode === 'missing-stage', `reasonCode=${r.reasonCode}`);
    });

    // 8. CROSS_TENANT_DETECTED (per boundary-contract MEDIUM-1)
    await test('8. CROSS_TENANT_DETECTED: pipelineStageId references stage in different POV', async () => {
      // Create child stage in POV B, but task lives in POV A
      const stageInB = await prisma.stage.create({
        data: { name: 'Stage in POV B', phaseId: f.phaseBId, order: 5 },
      });
      const t = await prisma.task.create({
        data: { title: 'cross-tenant', povId: f.povAId, stageId: f.parentStageAId, type: 'PIPELINE' as any,
                metadata: { pipelineStageId: stageInB.id } as any },
      });
      const r = await resolveHarnessMode(t.id);
      assert(r.mode === 'CROSS_TENANT_DETECTED', `mode=${r.mode}`);
      assert(r.reasonCode === 'cross-tenant-detected', `reasonCode=${r.reasonCode}`);
      assert(r.reason.includes('POV'), `reason should mention POV, got: ${r.reason}`);
    });

  } finally {
    if (fix) {
      try { await fix.cleanup(); } catch (e) { console.error('cleanup error:', e); }
    }
    await prisma.$disconnect();
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
