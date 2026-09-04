import type { Prisma, PrismaClient } from '@prisma/client';
import { selectAuthoritativeExecution } from './execution-selection';

/**
 * Discriminated union describing whether an agent execution should produce a
 * `report.md` artifact alongside `result.json`, and where the content comes from.
 *
 * - `{produce: false}` — no report.md generated.
 * - `{produce: true, source: 'self'}` — report.md content = this task's own finalResponse.
 * - `{produce: true, source: 'upstream', sourceTaskId}` — report.md content = the
 *   referenced upstream task's `result.json.finalResponse` (engine extracts at write time).
 */
export type ReportMdDecision =
  | { produce: false }
  | { produce: true; source: 'self' }
  | { produce: true; source: 'upstream'; sourceTaskId: string };

/**
 * Decides report.md production policy for an executing task.
 *
 * Policy (adopted 2026-04-28, replaces 2026-04-15 leaf-only rule):
 *
 * 1. PIPELINE harness root + `metadata.deliverableSourceTaskId` set + source
 *    task has SUCCESS execution → extract source's finalResponse into harness's
 *    report.md. (Option A: gates on source SUCCESS so harness CREATE doesn't
 *    write a misleading report.md before the upstream Editor has completed.)
 * 2. PIPELINE harness root + metadata set, source NOT yet SUCCESS → no report.md
 *    (typically harness CREATE — Editor hasn't run yet; SYNTHESIZE will fire
 *    again post-children and produce the deliverable).
 * 3. PIPELINE harness root + no metadata → no report.md (default, current shape).
 * 4. Non-PIPELINE leaf + `metadata.suppressDefaultReportMd === true` → no
 *    report.md (harness will publish the customer deliverable instead).
 * 5. Non-PIPELINE leaf + no suppress → produce report.md from own finalResponse
 *    (default — leaf IS the deliverable producer in default pipelines).
 * 6. Non-PIPELINE intermediate (1+ dependents) → no report.md.
 *
 * Engine stays generic: this function takes only `task.metadata` as JSON and
 * narrows inline. Synthesis-pipeline knowledge (Editor vs Reviewer roles) lives
 * in the harness's CREATE-mode prose, not here.
 *
 * @param tx  Prisma client or transaction client
 * @param task Task with `id`, `type`, and `metadata` populated
 */
export async function getReportMdDecision(
  tx: PrismaClient | Prisma.TransactionClient,
  task: {
    id: string;
    type: string | null | undefined;
    metadata: Prisma.JsonValue | null;
  }
): Promise<ReportMdDecision> {
  const meta =
    task.metadata && typeof task.metadata === 'object' && !Array.isArray(task.metadata)
      ? (task.metadata as Record<string, unknown>)
      : {};

  if (task.type === 'PIPELINE') {
    const sourceTaskId =
      typeof meta.deliverableSourceTaskId === 'string' ? meta.deliverableSourceTaskId : null;

    if (!sourceTaskId) {
      return { produce: false };
    }

    // Option A: gate `'upstream'` decision on source task having a SUCCESS execution.
    // Without this, harness CREATE would write coordination prose
    // ("Pipeline created, deliverable pointer at ...") as a misleading report.md
    // before the upstream Editor has actually completed.
    // keep-best (2026-07-04): gate on the AUTHORITATIVE source execution (shared selector —
    // supersession filter + R8 non-empty floor). Keeps this produce:true decision consistent
    // with what the C4/C5 extraction sites will actually find; a superseded/empty-only source
    // must NOT green-light extraction the reader then can't fulfil.
    const { execution: sourceHasSuccess } = await selectAuthoritativeExecution(tx, sourceTaskId, {
      requireNonEmptyArtifact: true,
    });

    if (!sourceHasSuccess) {
      return { produce: false };
    }

    return { produce: true, source: 'upstream', sourceTaskId };
  }

  if (meta.suppressDefaultReportMd === true) {
    return { produce: false };
  }

  const dependentCount = await tx.taskDependency.count({
    where: { dependsOnId: task.id },
  });

  if (dependentCount === 0) {
    return { produce: true, source: 'self' };
  }

  return { produce: false };
}
