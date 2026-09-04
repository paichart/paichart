#!/usr/bin/env ts-node
/**
 * Boundary Contract Test — getReportMdDecision four-axis matrix
 *
 * Per Phase F.5 of cline_docs/reviews/report-md-policy-rework-2026-04-28/implementation-plan.md.
 * Catches future regressions on the discriminated-union policy gate.
 *
 * Created: 2026-04-28 (boundary-contract-specialist N5)
 *
 * Mocks the Prisma transaction client to test the policy gate's decision matrix
 * without touching the database. The function only calls two Prisma methods:
 * `tx.agentExecution.findFirst` (for Option A source-SUCCESS check) and
 * `tx.taskDependency.count` (for leaf detection). Both are mocked.
 */

import { getReportMdDecision, type ReportMdDecision } from '../lib/services/agentArtifactPolicy';

console.log('🧪 getReportMdDecision Four-Axis Matrix Tests\n');

let passed = 0;
let failed = 0;

function test(description: string, fn: () => Promise<void>) {
  return fn()
    .then(() => {
      console.log(`✅ ${description}`);
      passed++;
    })
    .catch((error) => {
      console.error(`❌ ${description}`);
      if (error instanceof Error) console.error(`   ${error.message}`);
      failed++;
    });
}

function assertEquals(actual: ReportMdDecision, expected: ReportMdDecision, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

interface MockTx {
  agentExecution: {
    findFirst: (args: any) => Promise<{ id: string } | null>;
    // keep-best (2026-07-04): agentArtifactPolicy now gates via selectAuthoritativeExecution,
    // which uses findMany (+ agentArtifact for the R8 non-empty floor).
    findMany: (args: any) => Promise<Array<{ id: string; status: string; createdAt: Date; supersededById: string | null }>>;
  };
  agentArtifact: {
    findFirst: (args: any) => Promise<{ content: string } | null>;
  };
  taskDependency: {
    count: (args: any) => Promise<number>;
  };
}

const mockTx = (overrides: {
  sourceHasSuccess?: boolean;
  dependentCount?: number;
}): MockTx => ({
  agentExecution: {
    findFirst: async () => (overrides.sourceHasSuccess ? { id: 'mockexec' } : null),
    // selectAuthoritativeExecution: a non-superseded SUCCESS exists iff sourceHasSuccess.
    findMany: async () => (overrides.sourceHasSuccess
      ? [{ id: 'mockexec', status: 'SUCCESS', createdAt: new Date('2026-07-01'), supersededById: null }]
      : []),
  },
  agentArtifact: {
    // the R8 non-empty floor reads the candidate's result.json — give it real content.
    findFirst: async () => (overrides.sourceHasSuccess ? { content: JSON.stringify({ finalResponse: 'mock deliverable' }) } : null),
  },
  taskDependency: {
    count: async () => overrides.dependentCount ?? 0,
  },
});

async function main() {
  // Axis 1: PIPELINE + meta + source SUCCESS → upstream
  await test('PIPELINE + deliverableSourceTaskId + source SUCCESS → upstream', async () => {
    const tx = mockTx({ sourceHasSuccess: true });
    const decision = await getReportMdDecision(tx as any, {
      id: 'cmharness',
      type: 'PIPELINE',
      metadata: { deliverableSourceTaskId: 'cmeditor' },
    });
    assertEquals(
      decision,
      { produce: true, source: 'upstream', sourceTaskId: 'cmeditor' },
      'Axis 1'
    );
  });

  // Axis 2: PIPELINE + meta + source NOT SUCCESS → produce:false (Option A)
  await test('PIPELINE + meta + source NOT SUCCESS → produce:false (Option A defense)', async () => {
    const tx = mockTx({ sourceHasSuccess: false });
    const decision = await getReportMdDecision(tx as any, {
      id: 'cmharness',
      type: 'PIPELINE',
      metadata: { deliverableSourceTaskId: 'cmeditor' },
    });
    assertEquals(decision, { produce: false }, 'Axis 2');
  });

  // Axis 3: PIPELINE + no meta → produce:false
  await test('PIPELINE + no metadata → produce:false', async () => {
    const tx = mockTx({});
    const decision = await getReportMdDecision(tx as any, {
      id: 'cmharness',
      type: 'PIPELINE',
      metadata: null,
    });
    assertEquals(decision, { produce: false }, 'Axis 3a');

    const decisionEmpty = await getReportMdDecision(tx as any, {
      id: 'cmharness',
      type: 'PIPELINE',
      metadata: {},
    });
    assertEquals(decisionEmpty, { produce: false }, 'Axis 3b (empty object)');
  });

  // Axis 4: Leaf + suppressDefaultReportMd → produce:false
  await test('Non-PIPELINE leaf + suppressDefaultReportMd:true → produce:false', async () => {
    const tx = mockTx({ dependentCount: 0 });
    const decision = await getReportMdDecision(tx as any, {
      id: 'cmreviewer',
      type: 'ACTION',
      metadata: { suppressDefaultReportMd: true },
    });
    assertEquals(decision, { produce: false }, 'Axis 4');
  });

  // Axis 5: Leaf + no suppress → produce:true source:'self'
  await test('Non-PIPELINE leaf + no metadata → produce:true source:self', async () => {
    const tx = mockTx({ dependentCount: 0 });
    const decision = await getReportMdDecision(tx as any, {
      id: 'cmleaf',
      type: 'ACTION',
      metadata: null,
    });
    assertEquals(decision, { produce: true, source: 'self' }, 'Axis 5');
  });

  // Axis 6: Intermediate (1+ dependents) → produce:false
  await test('Non-PIPELINE intermediate (1+ dependents) → produce:false', async () => {
    const tx = mockTx({ dependentCount: 2 });
    const decision = await getReportMdDecision(tx as any, {
      id: 'cmeditor',
      type: 'ACTION',
      metadata: null,
    });
    assertEquals(decision, { produce: false }, 'Axis 6');
  });

  // Edge case: non-string deliverableSourceTaskId metadata key
  await test('PIPELINE + non-string deliverableSourceTaskId → produce:false', async () => {
    const tx = mockTx({ sourceHasSuccess: true });
    const decision = await getReportMdDecision(tx as any, {
      id: 'cmharness',
      type: 'PIPELINE',
      metadata: { deliverableSourceTaskId: 12345 }, // wrong type
    });
    assertEquals(decision, { produce: false }, 'non-string sourceTaskId');
  });

  // Edge case: array metadata (defensive narrowing)
  await test('PIPELINE + array metadata → produce:false (narrowed safely)', async () => {
    const tx = mockTx({});
    const decision = await getReportMdDecision(tx as any, {
      id: 'cmharness',
      type: 'PIPELINE',
      metadata: ['unexpected'] as any,
    });
    assertEquals(decision, { produce: false }, 'array metadata');
  });

  // Edge case: suppressDefaultReportMd value other than true
  await test('Leaf + suppressDefaultReportMd:false → falls back to default leaf', async () => {
    const tx = mockTx({ dependentCount: 0 });
    const decision = await getReportMdDecision(tx as any, {
      id: 'cmleaf',
      type: 'ACTION',
      metadata: { suppressDefaultReportMd: false },
    });
    assertEquals(decision, { produce: true, source: 'self' }, 'suppress=false');
  });

  console.log('\n=====================================');
  console.log('Test Summary');
  console.log('=====================================');
  console.log(`Total: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();
