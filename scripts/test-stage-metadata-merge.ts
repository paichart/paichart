#!/usr/bin/env ts-node
/**
 * Stage Metadata Shallow-Merge Tests (BC2 P0 site fix verification)
 *
 * Regression coverage for `lib/pov/services/phase.ts:updateStage`. Pre-fix
 * implementation used whole-replace via `data.metadata || currentStage.metadata`,
 * silently dropping any keys the caller didn't include. Post-fix shallow-merges
 * incoming keys with existing stage metadata — preserving non-passed keys.
 *
 * This is the same bug class that `task.metadata` had pre-BC19. Phase 3's BC2
 * audit only swept unsafe-read-cast variants and missed this whole-replace
 * write site. See `bug-class-registry.md` BC2 + `cline_docs/reviews/harness-clobber-detection-2026-04-25/`.
 *
 * Created: 2026-04-25
 * Plan: cline_docs/reviews/harness-clobber-detection-2026-04-25/implementation-plan.md §Item 2
 * Reviews: arch-review (96%), database-manager (96%), boundary-contract (96%)
 *
 * CI behavior: real-DB integration test. Skips if DATABASE_URL absent — same
 * pattern as test-stage-resolver.ts. Run locally with .env loaded.
 */

// Fail-loud skip: run locally with .env loaded, skip in CI without DB.
if (!process.env.DATABASE_URL) {
  console.log('⏭️  Stage Metadata Merge Tests: SKIPPED — DATABASE_URL not set');
  console.log('   (Real-DB integration test; run locally with .env loaded to execute.)');
  process.exit(0);
}

// Deferred require() — TypeScript hoists static `import` statements above
// any sibling code, which would defeat the DATABASE_URL guard above.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('../lib/prisma') as typeof import('../lib/prisma');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { phaseService } =
  require('../lib/pov/services/phase') as typeof import('../lib/pov/services/phase');

console.log('🧪 Stage Metadata Shallow-Merge Tests (BC2 P0 site fix)\n');

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

interface Fixture {
  povId: string;
  phaseId: string;
  stageId: string;
  cleanup: () => Promise<void>;
}

async function buildFixture(): Promise<Fixture> {
  const owner = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
  if (!owner) throw new Error('No ADMIN user found for test fixture');

  const country = await prisma.country.findFirst({ select: { id: true } });
  if (!country) throw new Error('No Country found for test fixture');

  const now = new Date();
  const future = new Date(now.getTime() + 30 * 86400000);

  const pov = await prisma.pOV.create({
    data: {
      title: `__test_stage_metadata_merge_${Date.now()}`,
      description: 'Throwaway test POV for stage metadata shallow-merge regression tests',
      ownerId: owner.id,
      status: 'PROJECTED',
      startDate: now,
      endDate: future,
      salesTheatre: 'NORTH_AMERICA',
      countryId: country.id,
    },
  });

  const phase = await prisma.phase.create({
    data: {
      name: 'Test Phase',
      type: 'EXECUTION',
      povId: pov.id,
      order: 0,
      description: 'test phase',
      startDate: now,
      endDate: future,
    },
  });

  const stage = await prisma.stage.create({
    data: { name: 'Test Stage', phaseId: phase.id, order: 0 },
  });

  const cleanup = async () => {
    await prisma.stage.deleteMany({ where: { phase: { povId: pov.id } } });
    await prisma.phase.deleteMany({ where: { povId: pov.id } });
    await prisma.pOV.delete({ where: { id: pov.id } });
  };

  return { povId: pov.id, phaseId: phase.id, stageId: stage.id, cleanup };
}

(async () => {
  let fix: Fixture | null = null;
  try {
    fix = await buildFixture();
    const f = fix;

    await test('REGRESSION (BC2 P0): updateStage shallow-merges metadata across two calls', async () => {
      await phaseService.updateStage(f.stageId, { metadata: { a: 1 } });
      await phaseService.updateStage(f.stageId, { metadata: { b: 2 } });

      const stage = await prisma.stage.findUnique({ where: { id: f.stageId } });
      const meta = stage?.metadata as Record<string, unknown>;
      assert(meta?.a === 1, `Expected meta.a === 1 (preserved across second call), got ${JSON.stringify(meta)}`);
      assert(meta?.b === 2, `Expected meta.b === 2, got ${JSON.stringify(meta)}`);
    });

    await test('updateStage preserves existing metadata when no metadata in update', async () => {
      // Reset and seed
      await prisma.stage.update({
        where: { id: f.stageId },
        data: { metadata: { harnessTaskId: 'task_abc' } as any },
      });
      // Update without passing metadata — must preserve harnessTaskId
      await phaseService.updateStage(f.stageId, { name: 'Renamed Stage' });

      const stage = await prisma.stage.findUnique({ where: { id: f.stageId } });
      const meta = stage?.metadata as Record<string, unknown>;
      assert(meta?.harnessTaskId === 'task_abc',
        `Expected meta.harnessTaskId preserved, got ${JSON.stringify(meta)}`);
      assert(stage?.name === 'Renamed Stage',
        `Expected name updated, got ${stage?.name}`);
    });

    await test('updateStage incoming key overrides existing key on conflict (shallow-merge semantics)', async () => {
      await prisma.stage.update({
        where: { id: f.stageId },
        data: { metadata: { harnessTaskId: 'task_old', otherKey: 'preserve' } as any },
      });
      await phaseService.updateStage(f.stageId, {
        metadata: { harnessTaskId: 'task_new' } as any,
      });

      const stage = await prisma.stage.findUnique({ where: { id: f.stageId } });
      const meta = stage?.metadata as Record<string, unknown>;
      assert(meta?.harnessTaskId === 'task_new',
        `Incoming key should override existing. Got ${JSON.stringify(meta)}`);
      assert(meta?.otherKey === 'preserve',
        `Non-conflicting existing key should be preserved. Got ${JSON.stringify(meta)}`);
    });

  } finally {
    if (fix) {
      try {
        await fix.cleanup();
      } catch (err) {
        console.error('⚠️  Fixture cleanup failed:', err);
      }
    }
    await prisma.$disconnect();
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
