#!/usr/bin/env ts-node
/**
 * Stage Resolver Tests (task #92)
 *
 * Regression coverage for the silent phaseId override bug observed during
 * the 2026-04-16 smoke test. Validates that resolveStageForTask honors a
 * caller-supplied phaseId rather than crossing phase boundaries via the
 * PLANNING fallback.
 *
 * Created: 2026-04-16 (task #92 — silent phaseId override fix)
 *
 * Test strategy: real DB integration (test POV is built up + torn down per
 * test). The bug is in cross-phase fallback logic that's hard to mock
 * meaningfully — better to test against actual Prisma behavior.
 *
 * CI behavior (added 2026-04-16 after CI validation crash):
 *   lib/prisma.ts throws at module-load time when DATABASE_URL is absent
 *   (fail-loud guard for production misconfiguration). CI validation
 *   workflows run without a DB, so this test must skip gracefully rather
 *   than crash the entire test:all-validation chain. The early-exit below
 *   prints a visible skip message (loud, not silent) and the require()
 *   calls below are deferred so TypeScript can't hoist them above the
 *   guard.
 */

// Fail-loud skip: run locally with .env loaded, skip in CI without DB.
if (!process.env.DATABASE_URL) {
  console.log('⏭️  Stage Resolver Tests: SKIPPED — DATABASE_URL not set');
  console.log('   (Real-DB integration test; run locally with .env loaded to execute.)');
  process.exit(0);
}

// Deferred require() — TypeScript hoists static `import` statements above
// any sibling code, which would defeat the DATABASE_URL guard above.
// CommonJS require() is a regular function call and preserves source order.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('../lib/prisma') as typeof import('../lib/prisma');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolveStageForTask } =
  require('../lib/mcp/tasks/action/utilities/stage-resolver') as typeof import('../lib/mcp/tasks/action/utilities/stage-resolver');

console.log('🧪 Stage Resolver Tests (task #92)\n');

let passed = 0;
let failed = 0;

function test(description: string, fn: () => Promise<void>): Promise<void> {
  return fn().then(
    () => {
      console.log(`✅ ${description}`);
      passed++;
    },
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

// ========================================
// Test fixture — build a POV with two phases, each with stages
// ========================================

interface Fixture {
  povId: string;
  planningPhaseId: string;
  reviewPhaseId: string;
  planningStage1Id: string;
  reviewStage1Id: string;
  reviewStage2Id: string;
  emptyPhaseId: string;
  cleanup: () => Promise<void>;
}

async function buildFixture(): Promise<Fixture> {
  const owner = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
  if (!owner) throw new Error('No ADMIN user found for test fixture');

  const now = new Date();
  const future = new Date(now.getTime() + 30 * 86400000);

  const country = await prisma.country.findFirst({ select: { id: true } });
  if (!country) throw new Error('No Country found for test fixture');

  const pov = await prisma.pOV.create({
    data: {
      title: `__test_stage_resolver_${Date.now()}`,
      description: 'Throwaway test POV for stage-resolver regression tests',
      ownerId: owner.id,
      status: 'PROJECTED',
      startDate: now,
      endDate: future,
      salesTheatre: 'NORTH_AMERICA',
      countryId: country.id,
    },
  });

  const phaseDefaults = { description: 'test phase', startDate: now, endDate: future };
  const planningPhase = await prisma.phase.create({
    data: { name: 'Planning', type: 'PLANNING', povId: pov.id, order: 0, ...phaseDefaults },
  });
  const reviewPhase = await prisma.phase.create({
    data: { name: 'Review', type: 'REVIEW', povId: pov.id, order: 1, ...phaseDefaults },
  });
  const emptyPhase = await prisma.phase.create({
    data: { name: 'Empty', type: 'EXECUTION', povId: pov.id, order: 2, ...phaseDefaults },
  });

  const planningStage1 = await prisma.stage.create({
    data: { name: 'Planning Stage 1', phaseId: planningPhase.id, order: 0 },
  });
  const reviewStage1 = await prisma.stage.create({
    data: { name: 'Review Stage 1', phaseId: reviewPhase.id, order: 0 },
  });
  const reviewStage2 = await prisma.stage.create({
    data: { name: 'Review Stage 2', phaseId: reviewPhase.id, order: 1 },
  });

  const cleanup = async () => {
    await prisma.stage.deleteMany({ where: { phase: { povId: pov.id } } });
    await prisma.phase.deleteMany({ where: { povId: pov.id } });
    await prisma.pOV.delete({ where: { id: pov.id } });
  };

  return {
    povId: pov.id,
    planningPhaseId: planningPhase.id,
    reviewPhaseId: reviewPhase.id,
    planningStage1Id: planningStage1.id,
    reviewStage1Id: reviewStage1.id,
    reviewStage2Id: reviewStage2.id,
    emptyPhaseId: emptyPhase.id,
    cleanup,
  };
}

// ========================================
// Tests
// ========================================

(async () => {
  let fix: Fixture | null = null;
  try {
    fix = await buildFixture();
    const f = fix; // narrow

    // CRITICAL REGRESSION: the bug Steve hit on 2026-04-16
    await test('REGRESSION (task #92): phaseId-only call honors supplied phase, does NOT cross to PLANNING', async () => {
      const result = await resolveStageForTask({
        povId: f.povId,
        phaseId: f.reviewPhaseId, // Caller wants Review phase
        // No stageId, no stageName — the bug shape
      });
      assert(result.phaseId === f.reviewPhaseId,
        `phaseId must be the supplied Review phase. Got: ${result.phaseId} (expected: ${f.reviewPhaseId} = Review)`);
      assert(result.stageId === f.reviewStage1Id,
        `stageId should be first stage in Review phase. Got: ${result.stageId}`);
    });

    await test('phaseId-only with empty phase REFUSES (does not silently relocate)', async () => {
      let threw = false;
      try {
        await resolveStageForTask({
          povId: f.povId,
          phaseId: f.emptyPhaseId, // No stages — must refuse
        });
      } catch (err) {
        threw = true;
        const msg = err instanceof Error ? err.message : String(err);
        assert(
          msg.includes('has no stages') && msg.includes(f.emptyPhaseId),
          `Error message should mention the empty phase. Got: ${msg}`
        );
      }
      assert(threw, 'Empty-phase phaseId-only call must throw, not silently fall through');
    });

    await test('Direct stageId always wins over phaseId', async () => {
      const result = await resolveStageForTask({
        povId: f.povId,
        stageId: f.planningStage1Id, // Direct stageId
        phaseId: f.reviewPhaseId, // Different phase — should be ignored
      });
      assert(result.stageId === f.planningStage1Id,
        `Direct stageId must win. Got: ${result.stageId}`);
      assert(result.phaseId === f.planningPhaseId,
        `Returned phaseId should match the stage's phase. Got: ${result.phaseId}`);
    });

    await test('phaseId + stageName matches stage IN that phase only', async () => {
      const result = await resolveStageForTask({
        povId: f.povId,
        phaseId: f.reviewPhaseId,
        stageName: 'Review Stage 2', // Exists in Review phase
      });
      assert(result.stageId === f.reviewStage2Id,
        `Should find Review Stage 2 in Review phase. Got: ${result.stageId}`);
      assert(result.phaseId === f.reviewPhaseId,
        `phaseId should match the supplied phase. Got: ${result.phaseId}`);
    });

    await test('No phaseId + no stageName falls through to PLANNING (legitimate fallback)', async () => {
      const result = await resolveStageForTask({
        povId: f.povId,
        // Neither phaseId nor stageName — legitimate "I don't know" path
      });
      assert(result.phaseId === f.planningPhaseId,
        `Should fall through to PLANNING when neither supplied. Got: ${result.phaseId}`);
      assert(result.stageId === f.planningStage1Id,
        `Should land in first PLANNING stage. Got: ${result.stageId}`);
    });

    // ======================================================================
    // TASK-CREATE-PHASENAME-IGNORED-ON-NEW-STAGE (2026-11-27). Prod repro
    // 2026-11-26T08:55:34Z: phaseName = second phase + NEW stageName created the
    // stage in the FIRST phase. The handler passes its PLANNING/first-phase pick as
    // phaseId with phaseIsDefault: true — that is the exact repro call shape.
    // ======================================================================
    const stagePhase = async (id: string) =>
      (await prisma.stage.findUnique({ where: { id }, select: { phaseId: true, name: true } }))!;

    await test('REGRESSION (repro shape): default phaseId + phaseName=Review + NEW stageName → created IN Review', async () => {
      const r = await resolveStageForTask({
        povId: f.povId, phaseId: f.planningPhaseId, phaseIsDefault: true,
        phaseName: 'review', stageName: 'Brand New Stage', title: 't',
      });
      assert(r.phaseId === f.reviewPhaseId, `must land in Review, got ${r.phaseId}`);
      const st = await stagePhase(r.stageId);
      assert(st.phaseId === f.reviewPhaseId && st.name === 'Brand New Stage', `stage must be created in Review, got ${JSON.stringify(st)}`);
    });

    await test('phaseName + stageName that exists ONLY in another phase (exact) → new stage in the named phase, not reused', async () => {
      const r = await resolveStageForTask({ povId: f.povId, phaseName: 'Review', stageName: 'Planning Stage 1' });
      assert(r.phaseId === f.reviewPhaseId, `got phase ${r.phaseId}`);
      assert(r.stageId !== f.planningStage1Id, 'must not reuse the Planning-phase stage');
    });

    await test('phaseName + exact stageName in the named phase → reused', async () => {
      const r = await resolveStageForTask({ povId: f.povId, phaseName: 'Review', stageName: 'review stage 2' });
      assert(r.stageId === f.reviewStage2Id, `got ${r.stageId}`);
    });

    await test('phaseName + partial stageName matching stages in BOTH phases → the named phase\'s stage', async () => {
      const r = await resolveStageForTask({ povId: f.povId, phaseName: 'Review', stageName: 'Stage 1' });
      assert(r.stageId === f.reviewStage1Id, `expected Review Stage 1, got ${r.stageId}`);
    });

    await test('phaseName partial ("revie") → that phase (same lookup as stage.create)', async () => {
      const r = await resolveStageForTask({ povId: f.povId, phaseName: 'revie', stageName: 'Partial Phase Stage' });
      assert(r.phaseId === f.reviewPhaseId, `got ${r.phaseId}`);
    });

    await test('phaseName unknown → refused (no silent relocation)', async () => {
      let msg = '';
      try { await resolveStageForTask({ povId: f.povId, phaseName: 'No Such Phase', stageName: 'X' }); }
      catch (e) { msg = e instanceof Error ? e.message : String(e); }
      assert(msg.includes('No Such Phase') && msg.includes('not found'), `must throw naming the phase, got: ${msg || 'no throw'}`);
    });

    await test('phaseName only (no stageName) → first stage of the named phase', async () => {
      const r = await resolveStageForTask({ povId: f.povId, phaseId: f.planningPhaseId, phaseIsDefault: true, phaseName: 'Review' });
      assert(r.stageId === f.reviewStage1Id, `got ${r.stageId}`);
    });

    await test('phaseName of an EMPTY phase + new stageName → created in that phase', async () => {
      const r = await resolveStageForTask({ povId: f.povId, phaseName: 'Empty', stageName: 'First Of Empty' });
      assert(r.phaseId === f.emptyPhaseId, `got ${r.phaseId}`);
    });

    await test('caller phaseId + stageName existing ONLY in another phase (exact) → new stage in the supplied phase', async () => {
      const r = await resolveStageForTask({ povId: f.povId, phaseId: f.reviewPhaseId, stageName: 'Planning Stage 1' });
      assert(r.phaseId === f.reviewPhaseId && r.stageId !== f.planningStage1Id, `got ${JSON.stringify(r)}`);
    });

    await test('caller phaseId + partial stageName → match inside the supplied phase only', async () => {
      const r = await resolveStageForTask({ povId: f.povId, phaseId: f.reviewPhaseId, stageName: 'Stage 1' });
      assert(r.stageId === f.reviewStage1Id, `got ${r.stageId}`);
    });

    await test('caller phaseId + NEW stageName → created in the supplied phase', async () => {
      const r = await resolveStageForTask({ povId: f.povId, phaseId: f.reviewPhaseId, stageName: 'Another New One' });
      const st = await stagePhase(r.stageId);
      assert(st.phaseId === f.reviewPhaseId, `got ${JSON.stringify(st)}`);
    });

    await test('caller phaseId and phaseName that disagree → refused', async () => {
      let msg = '';
      try { await resolveStageForTask({ povId: f.povId, phaseId: f.reviewPhaseId, phaseName: 'Planning', stageName: 'X' }); }
      catch (e) { msg = e instanceof Error ? e.message : String(e); }
      assert(msg.includes('Refusing to guess'), `must throw, got: ${msg || 'no throw'}`);
    });

    await test('UNCHANGED: no caller phase (default phaseId) + exact stageName in another phase → POV-wide auto-detect', async () => {
      const r = await resolveStageForTask({ povId: f.povId, phaseId: f.planningPhaseId, phaseIsDefault: true, stageName: 'Review Stage 2' });
      assert(r.stageId === f.reviewStage2Id, `got ${r.stageId}`);
    });

    await test('UNCHANGED: no caller phase + partial stageName → POV-wide partial match', async () => {
      const r = await resolveStageForTask({ povId: f.povId, phaseId: f.planningPhaseId, phaseIsDefault: true, stageName: 'Stage 2' });
      assert(r.stageId === f.reviewStage2Id, `got ${r.stageId}`);
    });

    await test('UNCHANGED: no caller phase + NEW stageName → created in the default (PLANNING) phase', async () => {
      const r = await resolveStageForTask({ povId: f.povId, phaseId: f.planningPhaseId, phaseIsDefault: true, stageName: 'Zz Unique Default' });
      const st = await stagePhase(r.stageId);
      assert(st.phaseId === f.planningPhaseId, `got ${JSON.stringify(st)}`);
    });

  } finally {
    if (fix) {
      try { await fix.cleanup(); } catch (e) { console.warn('Cleanup failed:', e); }
    }
    await prisma.$disconnect();
  }

  // ========================================
  // Summary
  // ========================================

  console.log('\n=====================================');
  console.log('Test Summary');
  console.log('=====================================');
  console.log(`Total: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) process.exit(1);
  process.exit(0);
})();
