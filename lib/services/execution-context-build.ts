/**
 * buildExecutionContext — the stored `agent_executions.context` (RWF C1, 2026-09-26). Split out of
 * agent-execution-create.ts because that module reaches lib/prisma, which throws at import when DATABASE_URL is unset
 * (CI) — so a pure test of this function could not import it. TYPE-ONLY imports here, by design.
 */
import type { TriggeredBy } from './types/triggered-by';
import type { ChainedRecord } from '../agents/harness/chained-record';
import type { OrchestratorReExecution } from './orchestrator-reexecution';

/**
 * The execution's stored context. The three server stamps are written EXPLICITLY AFTER the extras spread,
 * value or delete (RWF C.1; boundary-contract row 52). A reactor source may forward a prior execution's
 * context in `contextExtras` (reactor sources are allowed reserved keys), and a write-if-present stamp would
 * let that stale copy survive, e.g. an inert cap because the stamp came from somewhere else. Exported for
 * the test that pins this.
 */
export function buildExecutionContext(
  contextExtras: Record<string, any> | undefined,
  triggeredBy: TriggeredBy,
  stamps: {
    reExecutionOfExecutionId?: string;
    orchestratorReExecution: OrchestratorReExecution | null;
    chainedPredecessors: ChainedRecord;
  },
): Record<string, any> {
  const ctx: Record<string, any> = { ...(contextExtras || {}), triggeredBy };
  if (stamps.reExecutionOfExecutionId) ctx.reExecutionOfExecutionId = stamps.reExecutionOfExecutionId;
  else delete ctx.reExecutionOfExecutionId;
  if (stamps.orchestratorReExecution) ctx.orchestratorReExecution = stamps.orchestratorReExecution;
  else delete ctx.orchestratorReExecution;
  ctx.chainedPredecessors = stamps.chainedPredecessors;
  return ctx;
}

