/** F-D (2026-09-10): the chainer's in-flight arms on a STUBBED client — the fixture the H-5 record promised.
 *  H-5: a COMPLETED ACTION dependency with a PENDING/RUNNING execution is NOT chained (execution-in-flight).
 *  F-B: a dependency that is NOT completed is the ordinary case (dependency-not-completed), never in-flight. */
// lib/prisma throws at module load without DATABASE_URL (CI has none); a stub URL is enough — the fixture never connects.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@127.0.0.1:5432/stub';
process.env.PAICHART_SKIP_DB_CONNECT = 'true'; // lib/prisma's eager connect probe would exit(1) on the stub URL
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { chainDependencyContext } = require('../lib/agents/harness/context-chainer') as typeof import('../lib/agents/harness/context-chainer');
let failed = 0; const check = (n: string, ok: boolean, extra = '') => { console.log(`${ok ? '✅' : '❌'} ${n}${ok ? '' : '  ' + extra}`); if (!ok) failed++; };
function stub(depStatus: string, activeExec: boolean) {
  const dep = { id: 'h1', title: 'Harvest current network state', agentRole: 'infra_state_harvester', type: 'ACTION', status: depStatus, executionStatus: activeExec ? 'RUNNING' : 'SUCCESS', agentTemplateId: 'tpl', metadata: {} };
  return {
    taskDependency: { findMany: async () => [{ dependsOn: dep }] },
    agentExecution: { findFirst: async (args: { where: { status?: { in?: string[] } } }) => (args?.where?.status?.in ? (activeExec ? { id: 'exec-running' } : null) : null), findMany: async () => [] },
    agentArtifact: { findFirst: async () => null },
    task: { findUnique: async () => dep },
  } as unknown as Parameters<typeof chainDependencyContext>[1];
}
(async () => {
  const a = await chainDependencyContext('d1', stub('COMPLETED', true));
  const na = a?.pipelineMetadata.notChained ?? [];
  check('H-5: COMPLETED ACTION dep with an active execution → notChained execution-in-flight, chained 0', na.length === 1 && na[0].reason === 'execution-in-flight' && (a?.pipelineMetadata.completedDependencies ?? -1) === 0, JSON.stringify(a?.pipelineMetadata));
  const b = await chainDependencyContext('d1', stub('IN_PROGRESS', true));
  const nb = b?.pipelineMetadata.notChained ?? [];
  check('F-B: a NOT-completed dep with a running execution → dependency-not-completed (never in-flight)', nb.length === 1 && nb[0].reason === 'dependency-not-completed', JSON.stringify(b?.pipelineMetadata));
  if (failed) { console.error(`\n${failed} failed`); process.exit(1); } console.log('\n✅ chainer in-flight arms: fixture-pinned'); process.exit(0);
})();
