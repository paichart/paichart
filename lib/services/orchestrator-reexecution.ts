/**
 * Orchestrator re-execution: classification, the per-child cap, and the Reviewer rule (RWF Stage 1 C.1,
 * 2026-09-26; plan cline_docs/reviews/rwf-stage1-2026-09-26/PLAN.md §4 C.1 + §11 N3/N8).
 *
 * Called from createAgentExecution BEFORE prepareTaskForExecution, so a refusal writes nothing: no
 * chaining, no protocol stamp, no status flip.
 *
 * WHAT COUNTS. An orchestrator re-execution is a create where ALL hold:
 *   - triggeredBy.source === 'mcp-direct' and parentExecutionId is set. The agent tool loop threads it;
 *     humans (Desktop) share the source but never carry it;
 *   - the caller's task is a PIPELINE whose metadata.pipelineStageId === the child's stageId, i.e. the
 *     OWNING harness. Any other caller is neither stamped nor capped;
 *   - the child already has at least one execution row. A first run (a CREATE kickstart) is never a
 *     re-execution.
 *
 * THE CAP. Refused if an execution of this child already carries orchestratorReExecution.harnessTaskId =
 * owner AND was created after the owner's run epoch. The epoch is the owner's newest execution whose
 * triggeredBy.source is NOT 'reactor-pipeline-retrigger' (Guard 8's test). SYNTHESIZE re-entries are all
 * retrigger-sourced, so within a run each child is re-executed at most once. A human re-execute of the
 * harness starts a new epoch and a new allowance.
 *   Named residuals (database-manager): read-then-insert is not atomic across two DIFFERENT harness
 *   executions (only an instant-FAIL dispatch could breach it); retention prunes superseded rows first, so on
 *   a pathological day the cap can forget and allow one extra retry. Both fail open, both bounded.
 *
 * THE REVIEWER RULE. For a reviewer child (template type REVIEWER, or agentRole in REVIEWER_ROLES: one set for
 * mechanism and prose, since publication_reviewer is a REVIEWER outside REVIEWER_ROLES), a re-execution is
 * refused ONLY when it has an authoritative SUCCESS whose chained predecessors are PROVABLY still the
 * authoritative ones (compareChainedInputs → 'same'). A FAILED reviewer's recovery is allowed; a stale
 * verdict is allowed; unknown is allowed.
 */

import type { PrismaClient } from '@prisma/client';
import { OrchestratorReExecutionRefusedError } from '@/lib/errors';
import { isReviewerSet } from '@/lib/agents/harness/parse-verdict';
import { compareChainedInputs } from '@/lib/agents/harness/chained-predecessors';
import { selectAuthoritativeExecution, CHAIN_SELECTION_OPTIONS } from './execution-selection';
import type { TriggeredBy } from './types/triggered-by';

export interface OrchestratorReExecution {
  harnessTaskId: string;
  harnessExecutionId: string;
}

export async function classifyOrchestratorReExecution(
  client: PrismaClient,
  taskId: string,
  triggeredBy: TriggeredBy,
): Promise<OrchestratorReExecution | null> {
  if (triggeredBy.source !== 'mcp-direct' || !triggeredBy.parentExecutionId) return null;
  const parent = await client.agentExecution.findUnique({
    where: { id: triggeredBy.parentExecutionId }, select: { taskId: true },
  });
  if (!parent) return null;
  const [owner, child] = await Promise.all([
    client.task.findUnique({ where: { id: parent.taskId }, select: { id: true, type: true, metadata: true } }),
    client.task.findUnique({ where: { id: taskId }, select: { stageId: true } }),
  ]);
  const ownerStage = (owner?.metadata as Record<string, unknown> | null)?.pipelineStageId;
  if (!owner || owner.type !== 'PIPELINE' || !child?.stageId || ownerStage !== child.stageId) return null;
  const prior = await client.agentExecution.count({ where: { taskId } });
  if (prior === 0) return null;
  return { harnessTaskId: owner.id, harnessExecutionId: triggeredBy.parentExecutionId };
}

/** Throws OrchestratorReExecutionRefusedError when the cap or the Reviewer rule refuses. */
export async function enforceOrchestratorReExecutionRules(
  client: PrismaClient,
  taskId: string,
  reexec: OrchestratorReExecution,
  agentTemplateId?: string | null,
): Promise<void> {
  // ── cap: one index-led statement anchored on the child's taskId ──
  const capped = await client.$queryRaw<Array<{ id: string }>>`
    SELECT e.id FROM agent_executions e
     WHERE e."taskId" = ${taskId}
       AND e.context->'orchestratorReExecution'->>'harnessTaskId' = ${reexec.harnessTaskId}
       AND e."createdAt" > COALESCE(
             (SELECT max(h."createdAt") FROM agent_executions h
               WHERE h."taskId" = ${reexec.harnessTaskId}
                 AND COALESCE(h.context->'triggeredBy'->>'source', '') <> 'reactor-pipeline-retrigger'),
             'epoch'::timestamp)
     LIMIT 1`;
  if (capped.length > 0) {
    throw new OrchestratorReExecutionRefusedError('ORCHESTRATOR_REEXECUTION_CAP',
      `ORCHESTRATOR_REEXECUTION_CAP: task ${taskId} was already re-executed once by this pipeline in its current run ` +
      `(execution ${capped[0].id}). A child is re-executed at most once per pipeline run. This refusal is the answer, ` +
      `not an error to retry: proceed with the result you have, and escalate if it is not good enough.`,
      { taskId, harnessTaskId: reexec.harnessTaskId, priorReExecutionId: capped[0].id });
  }

  // ── Reviewer rule ──
  const task = await client.task.findUnique({
    where: { id: taskId },
    select: { agentRole: true, agentTemplate: { select: { templateType: true } } },
  });
  let templateType = task?.agentTemplate?.templateType ?? null;
  if (agentTemplateId) {
    const t = await client.agentTemplate.findUnique({ where: { id: agentTemplateId }, select: { templateType: true } });
    templateType = t?.templateType ?? templateType;
  }
  const isReviewer = isReviewerSet(task?.agentRole, templateType);
  if (!isReviewer) return;

  const { execution } = await selectAuthoritativeExecution(client, taskId, CHAIN_SELECTION_OPTIONS);
  if (!execution) return; // no verdict to protect (e.g. a FAILED reviewer's recovery)
  const row = await client.agentExecution.findUnique({
    where: { id: execution.id }, select: { taskId: true, createdAt: true, context: true, config: true },
  });
  if (!row) return;
  const cmp = await compareChainedInputs(client, row);
  if (cmp.match !== 'same') return; // different or unknown ⇒ allowed

  throw new OrchestratorReExecutionRefusedError('REVIEWER_SAME_INPUT_REEXECUTION',
    `REVIEWER_SAME_INPUT_REEXECUTION: reviewer task ${taskId} already gave its verdict (execution ${execution.id}) over ` +
    `exactly the inputs it would be given again: every predecessor it reviewed is still the current one. Re-running it ` +
    `would re-roll the same judgement. This refusal is the answer, not an error to retry: accept the verdict; the ` +
    `verdict decides.`,
    { taskId, reviewerExecutionId: execution.id, predecessors: cmp.predecessors });
}
