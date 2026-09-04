/**
 * Execution Terminal Persist — the ONE implementation of the terminal transactions
 * (convergence Phase 4b, 2026-07-05)
 *
 * Both agent execution paths end a run by persisting a terminal state:
 *   - Engine path:  lib/services/agentExecutionEngine.ts (MCP/API/polling triggers)
 *   - Stream path:  app/api/pov/agent/execute/stream/route.ts (GUI/SSE triggers)
 *
 * Pre-Phase-4b each path carried its own ~250-line terminal transaction (SUCCESS
 * and FAILURE), inline-mirrored — the last large duplicate of the dual-execution-path
 * drift class (see divergence-manifest.md Part C rows I-3/I-6/I-7/I-9/M11/M13/M14).
 * This module is the single source of truth; the paths are callers.
 *
 * Design (Phase-4 panel, ~90% → ~94% post-edit; phase-4-confidence-assessment.md):
 *
 *  - In-tx statements run on a `Prisma.TransactionClient` passed IN (`runTerminal*Tx`);
 *    the `persistTerminal*` wrappers own the `$transaction` + the post-commit tail
 *    (reactors, auto-comment). Never reference the global prisma inside tx bodies —
 *    the known "prisma-inside-tx" bug class (db-manager).
 *  - Canonical statement order (I-7): status-first exec-update (stream's order), then
 *    report-md decision/extraction + artifact writes, pointer substitution,
 *    `createdArtifacts` findMany AFTER substitution, PRUNE after the exec-update
 *    (current row must be in the keep-set), fresh in-tx task-type read (engine's),
 *    tasks row LAST (deadlock-safe).
 *  - CAS failure persist (Phase 4a, MUST survive): FAILED is flipped via
 *    `updateMany where status IN (PENDING, RUNNING)` gated on `flipped.count`; a
 *    count of 0 means the row is already terminal — no task flip, no error.json,
 *    no clobber. `persisted: false` tells the adapter its failure tail is moot.
 *  - Reactors + PRUNE are TRANSITIONAL PARAMETERS preserving today's behavior
 *    byte-identically (engine: fireReactors+prune ON; stream: both OFF). The flips
 *    are separate Steve-gated phases (implementation-plan.md §Flip 1/Flip 2) —
 *    do NOT turn them on here. Reactor policy when enabled: success fires BOTH
 *    (retrigger + ready-dependents), failure fires retrigger ONLY, both post-commit
 *    fire-and-forget via fire-time dynamic import.
 *  - Timing facts (I-6, Protocol-10): ONE derivation from row timestamps —
 *    `queuedMs = startTime − createdAt`, `executionMs = endTime − (startTime ?? createdAt)`.
 *    Used for the auto-comment duration and error.json executionTimeMs; returned to
 *    adapters as facts.
 *  - error.json (I-3): ONE `buildErrorJson()` shape union
 *    `{error, errorCategory?, source, taskId, taskTitle?, executionTimeMs?, timestamp}`;
 *    `source` is an adapter-supplied fact
 *    ('executeAgent' | 'stream' | 'safety-net' | 'mcp-dispatch').
 *    Verified 2026-07-05: zero in-tree readers of error.json fields by name.
 *  - agentRole (I-9): ONE `resolveAgentRole` — the engine's `determineAgentRole`
 *    chain lifted verbatim (config > template.defaultRole > task.agentRole >
 *    'AI Assistant'). The stream adopted this engine-canonical chain at Phase 4b
 *    (its old inline chain was a mis-mirror: body > task > template > 'custom').
 *  - G8 preserved: this module contains ZERO `agentExecution.create` and zero
 *    status-claim writes. Creation stays at the agent-execution-create.ts chokepoint;
 *    claiming stays in the adapters.
 *
 * Gate: scripts/test-terminal-persist-shape.ts (statement-set fixtures against a
 * tx-recording mock, captured from the inline code BEFORE the swap).
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import type { AccumulatedUsage } from '@/lib/agents/harness/agentic-tool-loop';
import { redactArtifactsForPersist } from '@/lib/agents/harness/redact-artifact-secrets';
import { getReportMdDecision } from './agentArtifactPolicy';
import { selectAuthoritativeExecution } from './execution-selection';
import { buildTokenUsageColumns, rollUpAndDeleteExecutions, sanitizeLLMForMarkdown } from './execution-artifacts';
import { selectExecutionsToDelete, PRUNE_ON_COMPLETE_RETENTION } from './execution-retention';
import { markForwardConeBlocked } from './mark-forward-cone';

// BC38: truncate artifact content to prevent database bloat (5MB per artifact).
// Formerly duplicated as an inline const in BOTH paths.
export const MAX_ARTIFACT_SIZE = 5 * 1024 * 1024; // exported for the tier-invariant test (Finding D)
const truncate = (s: string) =>
  s.length > MAX_ARTIFACT_SIZE ? s.substring(0, MAX_ARTIFACT_SIZE) + '\n\n[TRUNCATED: exceeded 5MB limit]' : s;

export interface TerminalPersistLogger {
  info(data: Record<string, unknown>, msg: string): void;
  warn(data: Record<string, unknown>, msg: string): void;
  error(data: Record<string, unknown>, msg: string): void;
}

/**
 * I-9: the ONE agent-role resolution chain (engine-canonical — the engine's
 * `determineAgentRole` lifted verbatim). Both paths resolve the role they stamp
 * into result.json and the completion comment through this function.
 */
export function resolveAgentRole(
  configRole: string | null | undefined,
  templateDefaultRole: string | null | undefined,
  taskRole: string | null | undefined,
): string {
  // Priority: config.agentRole > agentTemplate.defaultRole > task.agentRole > default
  return configRole || templateDefaultRole || taskRole || 'AI Assistant';
}

/**
 * I-3: the ONE error.json content builder. Union shape
 * `{error, errorCategory?, source, taskId, taskTitle?, executionTimeMs?, timestamp}` —
 * optional fields drop out of the JSON when undefined. `source` is an
 * adapter-supplied FACT naming the persist site, never a verdict.
 */
export function buildErrorJson(input: {
  errorMessage: string;
  errorCode?: string;
  source: string;
  taskId: string;
  taskTitle?: string;
  executionTimeMs?: number;
  timestamp: Date;
}): string {
  return JSON.stringify({
    error: input.errorMessage,
    errorCategory: input.errorCode || undefined,
    source: input.source,
    taskId: input.taskId,
    taskTitle: input.taskTitle,
    executionTimeMs: input.executionTimeMs,
    timestamp: input.timestamp.toISOString(),
  }, null, 2);
}

/** I-6 fact pair — ONE derivation from row timestamps (Protocol-10 facts). */
function deriveTimingFacts(
  endTime: Date,
  startTime: Date | null | undefined,
  createdAt: Date | null | undefined,
): { queuedMs: number | null; executionMs: number | null } {
  const queuedMs = startTime && createdAt ? startTime.getTime() - createdAt.getTime() : null;
  const anchor = startTime ?? createdAt ?? null;
  const executionMs = anchor ? endTime.getTime() - anchor.getTime() : null;
  return { queuedMs, executionMs };
}

export interface TerminalTaskSnapshot {
  id: string;
  type: string | null | undefined;
  metadata: Prisma.JsonValue | null;
  povId: string | null;
  title: string;
}

export interface TerminalSuccessInput {
  executionId: string;
  task: TerminalTaskSnapshot;
  /** The loop deliverable (loopResult.assembledText) — report.md 'self' body + extraction fallback. */
  finalText: string;
  /** Caller-built via buildExecutionResultJson (supersession audit already mirrored in). */
  resultJson: Record<string, unknown>;
  /** Adapter-shaped execution.logs to persist (engine: canned 5-line; stream: rich narrative). */
  logs: string[];
  /** The single terminal timestamp (M11) — endTime, exec updatedAt, task updatedAt. */
  endTime: Date;
  executionCreatedAt: Date | null;
  executionStartTime: Date | null;
  /** Caller-owned accumulated usage; ONE buildTokenUsageColumns spread happens here. */
  usage: AccumulatedUsage | undefined;
  /** ONE serving-model evaluation at the persist call site from the final currentResponse. */
  servingModel: string | null;
  /** Keep-best self-supersession target (computeSelfSupersession pre-tx, caller-owned). */
  supersededById: string | null;
  /**
   * R4 Layer 2 (truncation-stall): TRUE iff this execution is a SYNTHESIZE that produced no
   * deliverable at max_tokens (R2 `TRUNCATED_NO_OUTPUT`) — i.e. `errorCategory ===
   * 'TRUNCATED_NO_OUTPUT' && resolvedMode === 'SYNTHESIZE'`, derived caller-side where both facts
   * are in hand (execution-core), so the tx makes no shape-assumptions on resultJson. Gates the
   * in-tx terminalization that marks a stalled PIPELINE leg FAILED (never COMPLETED) so the owning
   * program escalates instead of hanging IN_PROGRESS. Default false everywhere it isn't a stall.
   */
  truncationStalled: boolean;
  /** HARNESS_NO_OUTPUT Layer 2 (2026-07-17 panel + harness-specialist GO-WITH-CHANGES):
   *  quality-layer fact (PIPELINE empty pre-note deliverable OR dead-end CREATE shape).
   *  The tx conjoins it with fresh in-tx facts before terminalizing — see the branch. */
  harnessNoOutput: boolean;
  /** resolveAgentRole output — the completion-comment Role line. */
  agentRole: string;
  confidenceScore: number | null;
  toolCallsTotal: number;
  toolCallsSucceeded: number;
  toolCallsFailed: number;
  commentUserId: string;
  /** TRANSITIONAL (Flip 2): PRUNE-ON-COMPLETE. Engine true / stream false — preserves today. */
  prune: boolean;
  /** TRANSITIONAL (Flip 1): post-commit reactors. Engine true / stream false — preserves today. */
  fireReactors: boolean;
  logger: TerminalPersistLogger;
}

export interface TerminalSuccessTxResult {
  createdArtifacts: Array<{ id: string; name: string; type: string; createdAt: Date }>;
}

export interface TerminalSuccessResult extends TerminalSuccessTxResult {
  queuedMs: number | null;
  executionMs: number | null;
}

/**
 * The SUCCESS terminal transaction body. Runs on the caller's TransactionClient —
 * atomicity boundary unchanged (pattern #37: artifacts + execution status + task
 * status commit together; getReportMdDecision's SUCCESS-filter read depends on it).
 */
export async function runTerminalSuccessTx(
  tx: Prisma.TransactionClient,
  input: TerminalSuccessInput,
): Promise<TerminalSuccessTxResult> {
  const { executionId, task, finalText, logs, endTime, usage, servingModel, supersededById, logger } = input;

  await tx.agentExecution.update({
    where: { id: executionId },
    data: {
      status: 'SUCCESS',
      endTime,
      logs,
      updatedAt: endTime,
      // token-usage-persistence: structured token facts + serving model, via the shared
      // dual-path builder. Zero new statements — same tx update.
      ...buildTokenUsageColumns(usage, servingModel),
      // keep-best: self-mark (Adj #1) — the row is never observable as SUCCESS-and-unjudged.
      ...(supersededById ? { supersededById } : {}),
    },
  });

  // Artifact policy (lib/services/agentArtifactPolicy.ts, 2026-04-28):
  //  - JSON artifact: always produced. Name differs by task type:
  //      * PIPELINE (harness) → `pipeline-index.json`
  //      * non-PIPELINE        → `result.json`
  //  - report.md: per `getReportMdDecision()`:
  //      * leaf (no dependents, no suppress) → from own finalText
  //      * leaf with `metadata.suppressDefaultReportMd` → none
  //      * PIPELINE harness with `metadata.deliverableSourceTaskId` set
  //        AND source task has SUCCESS execution → extract source's
  //        finalResponse (Option A defense — gates on source SUCCESS so
  //        harness CREATE doesn't write a misleading report.md before
  //        the upstream Editor task has completed).
  const decision = await getReportMdDecision(tx, {
    id: task.id,
    type: task.type,
    metadata: task.metadata,
  });
  const jsonArtifactName = task.type === 'PIPELINE' ? 'pipeline-index.json' : 'result.json';

  let reportMdContent: string | null = null;
  let reportMdSource: { mode: 'self' | 'upstream'; sourceTaskId?: string; extractFailureReason?: string } | null = null;
  if (decision.produce) {
    if (decision.source === 'self') {
      // BC46/0.5d: sanitize freshly generated text — report.md renders in the same
      // GUI viewer regardless of creating path (stored-XSS surface).
      reportMdContent = finalText ? sanitizeLLMForMarkdown(finalText) : '*No response generated.*';
      reportMdSource = { mode: 'self' };
    } else {
      // source === 'upstream' — fetch source task's finalResponse.
      //
      // Pattern #37 dependency: artifact-creation + execution.status update
      // are committed in a single transaction. The status='SUCCESS' filter
      // therefore cannot return a mid-write execution. Future readers: do
      // NOT unwire that atomicity without breaking this read.
      //
      // Transaction isolation: PostgreSQL READ COMMITTED is sufficient. The
      // source task's tx already committed before our SYNTHESIZE execution
      // fires (reactor fires fire-and-forget AFTER the last child commits).
      // Our findFirst reads already-committed data outside our own write set.
      //
      // POV-scoping (boundary-contract Q6): cross-tenant safety guard. If a
      // misbehaved harness in CREATE sets deliverableSourceTaskId to a task
      // in another POV, the povId guard prevents cross-tenant content leak.
      const thisPovId = task.povId;
      // keep-best C4/C5 adoption (2026-07-04): select the AUTHORITATIVE execution
      // first via the shared selector (supersession filter + R8 empty floor +
      // createdAt ordering), THEN read its artifact. povId guard preserved.
      let sourceArtifact: { content: string; executionId: string } | null = null;
      const sourceTaskInPov = await tx.task.findFirst({
        where: { id: decision.sourceTaskId, povId: thisPovId },
        select: { id: true },
      });
      if (sourceTaskInPov) {
        const { execution: authoritativeSource } = await selectAuthoritativeExecution(
          tx, decision.sourceTaskId, { requireNonEmptyArtifact: true });
        if (authoritativeSource) {
          sourceArtifact = await tx.agentArtifact.findFirst({
            where: { executionId: authoritativeSource.id, name: 'result.json' },
            orderBy: { createdAt: 'desc' },
            select: { content: true, executionId: true },
          });
        }
      }

      let extracted: string | null = null;
      let extractFailureReason: string | null = null;

      if (sourceArtifact) {
        if (sourceArtifact.content.endsWith('[TRUNCATED: exceeded 5MB limit]')) {
          logger.warn({
            executionId,
            sourceTaskId: decision.sourceTaskId,
            sourceExecutionId: sourceArtifact.executionId,
            sourceContentLength: sourceArtifact.content.length,
          }, 'Upstream source result.json was truncated at write time; report.md extraction unreliable');
          extractFailureReason = 'upstream_truncated';
        } else {
          try {
            const sourceJson = JSON.parse(sourceArtifact.content);
            const candidate = sourceJson.finalResponse;
            if (typeof candidate === 'string' && candidate.length > 0) {
              // No double-sanitise: upstream content was already sanitized when its
              // own execution wrote it; re-running would double-process.
              extracted = candidate;
              if (candidate.length < 100) {
                logger.warn({
                  executionId,
                  sourceTaskId: decision.sourceTaskId,
                  sourceExecutionId: sourceArtifact.executionId,
                  sourceContentLength: candidate.length,
                }, 'Upstream finalResponse is suspiciously short (<100 chars) — possible empty/error response slipped through SUCCESS');
              } else {
                logger.info({
                  executionId,
                  sourceTaskId: decision.sourceTaskId,
                  sourceExecutionId: sourceArtifact.executionId,
                  sourceContentLength: candidate.length,
                }, 'Extracted upstream finalResponse for harness report.md');
              }
            } else {
              logger.warn({
                executionId,
                sourceTaskId: decision.sourceTaskId,
                sourceExecutionId: sourceArtifact.executionId,
                candidateType: typeof candidate,
                isNull: candidate === null,
              }, 'Upstream source result.json finalResponse is not a non-empty string; falling back to error-header report.md');
              extractFailureReason = 'finalresponse_not_string';
            }
          } catch (err) {
            logger.warn({
              executionId,
              sourceTaskId: decision.sourceTaskId,
              sourceExecutionId: sourceArtifact.executionId,
              err,
            }, 'Failed to parse upstream source result.json for report.md extraction; falling back to error-header report.md');
            extractFailureReason = 'parse_error';
          }
        }
      } else {
        logger.warn({
          executionId,
          sourceTaskId: decision.sourceTaskId,
          thisPovId,
        }, 'No upstream source artifact found for report.md extraction (source not SUCCESS, or cross-POV mismatch); falling back to error-header report.md');
        extractFailureReason = 'no_source_artifact';
      }

      // Hoisted single-write semantics: every non-success path funnels here.
      // On extraction failure, prepend an error header so the customer
      // immediately sees the failure indicator instead of reading
      // misleading content.
      if (extracted) {
        // ── VERDICT BANNER (2026-08-18) — FACT TRANSCRIPTION, NOT A DECISION ─────────────────
        // A needs-revision/escalated pipeline still produces its composed draft as report.md,
        // and before this banner NOTHING in that document said the run was refused — the verdict
        // lived on every surface EXCEPT the one a human forwards (metadata.qualityGate,
        // pipeline-index.json, the final comment). A recipient of the bare file had no way to
        // know it was an unreleased draft (found live 2026-08-17: a blocked program's report.md
        // read as an approved-looking plan built around a rejected /29). The banner TRANSCRIBES
        // the already-stamped facts onto the artifact — it commands nothing, adds no decision
        // point, and never uses imperative language (Steve's ruling, 2026-08-18: decisions few,
        // explicit and audited; facts on every surface the artifact travels). A future audited
        // release-waiver feature would be transcribed here the same way.
        //
        // FRESH READ, deliberately: the `task` object in scope was fetched pre-claim, BEFORE the
        // harness stamped qualityGate during its run — reading it would miss this run's verdict.
        const freshTask = await tx.task.findUnique({
          where: { id: task.id },
          select: { metadata: true },
        });
        const freshMeta = (freshTask?.metadata ?? null) as Record<string, unknown> | null;
        const gate = (freshMeta?.qualityGate ?? null) as { outcome?: string } | null;
        const releasable = freshMeta?.programReleasable;
        if (gate?.outcome && gate.outcome !== 'approved') {
          const releasableClause = releasable !== undefined ? ` · \`programReleasable: ${String(releasable)}\`` : '';
          extracted =
            `> ⚠ **NOT RELEASED — quality gate: ${gate.outcome}**${releasableClause}\n` +
            `> This document is the composed draft deliverable exactly as produced; the run's release ` +
            `gate did not clear it. The verdict and its blocking reasons are stamped on the pipeline ` +
            `task (quality-gate metadata and final comment).\n\n` +
            extracted;
          logger.info({ executionId, outcome: gate.outcome, releasable: releasable ?? null },
            'report.md verdict banner prepended (non-approved quality gate)');
        }
        reportMdContent = extracted;
        reportMdSource = { mode: 'upstream', sourceTaskId: decision.sourceTaskId };
      } else {
        const errorHeader = `# ⚠️ Report Extraction Failed\n\nThe pipeline harness was configured to extract its customer deliverable from task \`${decision.sourceTaskId}\`, but extraction failed: \`${extractFailureReason}\`.\n\n**Recovery**: Fetch the source task's result.json directly via \`fetch(id: "artifact-<source result.json id>")\`.\n\n---\n\n`;
        // 0.5d: fallback body is freshly generated text — sanitize.
        const fallbackBody = finalText ? sanitizeLLMForMarkdown(finalText) : '*No response generated.*';
        reportMdContent = errorHeader + fallbackBody;
        reportMdSource = {
          mode: 'upstream',
          sourceTaskId: decision.sourceTaskId,
          extractFailureReason: extractFailureReason || 'unknown',
        };
        logger.error({
          executionId,
          sourceTaskId: decision.sourceTaskId,
          extractFailureReason,
        }, 'Customer-facing report.md extraction failed; produced error-header report.md instead. Customer pointer will land but content is degraded.');
      }
    }
  }

  const enrichedResultJson = reportMdSource
    ? { ...input.resultJson, reportMdSource }
    : input.resultJson;

  // WS2 (R10): coarse secret redaction of the persisted artifacts before write. This is THE
  // pAIchart-side control, DEFAULT-ON (Steve, 2026-08-28) — the helper disables only on an
  // explicit ARTIFACT_SECRET_REDACT_ENABLED='false'. It was "opt-in, default OFF" until that
  // flip and this comment said so for a day too long. Scope is PERSISTED artifacts only: the
  // live SSE stream and the in-flight finalResponse are narrower-audience and deliberately out
  // of scope, so this is not "no secret anywhere". The original enrichedResultJson is not
  // mutated. See redact-artifact-secrets.ts.
  const persistRedaction = redactArtifactsForPersist(enrichedResultJson, reportMdContent);

  const artifactData: Array<{ executionId: string; name: string; type: string; content: string }> = [
    {
      executionId,
      name: jsonArtifactName,
      type: 'application/json',
      content: truncate(JSON.stringify(persistRedaction.resultJson, null, 2)),
    },
  ];
  if (reportMdContent !== null) {
    artifactData.push({
      executionId,
      name: 'report.md',
      type: 'text/markdown',
      content: truncate(persistRedaction.reportMd ?? reportMdContent),
    });
  }
  if (persistRedaction.redactedCount > 0) {
    // Protocol-10 FACT (not a verdict): N matched token(s) redacted before persist.
    logger.warn(
      { executionId, taskId: task.id, redactedCount: persistRedaction.redactedCount, securityEvent: true },
      'R10 backstop: redacted matched token(s) from persisted artifact(s) before write'
    );
  }
  await tx.agentArtifact.createMany({ data: artifactData });

  // Pointer substitution (2026-04-29): the harness can't know its own
  // report.md ID at SYNTHESIZE compose time (the artifact only exists
  // after this transaction commits). Phase C.3 protocol prose tells the
  // harness to write the placeholder token {{HARNESS_REPORT_MD_ID}} —
  // substitute the real ID here. Restricted to harness PIPELINE +
  // upstream-extraction case so the placeholder can't accidentally fire
  // for other tasks.
  if (
    task.type === 'PIPELINE' &&
    reportMdContent !== null &&
    decision.produce &&
    decision.source === 'upstream'
  ) {
    const PLACEHOLDER = '{{HARNESS_REPORT_MD_ID}}';
    const reportMdArtifact = await tx.agentArtifact.findFirst({
      where: { executionId, name: 'report.md' },
      select: { id: true },
    });
    const pipelineIndexArtifact = await tx.agentArtifact.findFirst({
      where: { executionId, name: 'pipeline-index.json' },
      select: { id: true, content: true },
    });

    if (
      reportMdArtifact &&
      pipelineIndexArtifact &&
      pipelineIndexArtifact.content.includes(PLACEHOLDER)
    ) {
      const replacements = pipelineIndexArtifact.content.split(PLACEHOLDER).length - 1;
      const substituted = pipelineIndexArtifact.content.split(PLACEHOLDER).join(reportMdArtifact.id);
      await tx.agentArtifact.update({
        where: { id: pipelineIndexArtifact.id },
        data: { content: substituted },
      });
      logger.info({
        executionId,
        pipelineIndexArtifactId: pipelineIndexArtifact.id,
        reportMdArtifactId: reportMdArtifact.id,
        replacements,
      }, 'Substituted harness report.md ID in pipeline-index.json deliverable pointer');
    }

    // 2026-07-15 (T2/T3 program runs, finding 5): the harness's SYNTHESIZE final COMMENT
    // carries the same placeholder ("📄 Final deliverable: fetch(id: \"artifact-{{…}}\")")
    // and was never substituted anywhere — the artifact branch above only rewrites
    // pipeline-index.json, so every pipeline's final comment shipped the literal token
    // (masked by the engine auto-completion comment carrying real ids). Substitute in the
    // task's comments too, same guard branch, same tx.
    if (reportMdArtifact) {
      const tokenComments = await tx.comment.findMany({
        where: { taskId: task.id, text: { contains: PLACEHOLDER } },
        select: { id: true, text: true },
      });
      for (const c of tokenComments) {
        await tx.comment.update({
          where: { id: c.id },
          data: { text: c.text.split(PLACEHOLDER).join(reportMdArtifact.id) },
        });
      }
      if (tokenComments.length > 0) {
        logger.info({
          executionId,
          reportMdArtifactId: reportMdArtifact.id,
          comments: tokenComments.length,
        }, 'Substituted harness report.md ID in final-comment deliverable pointer(s)');
      }

      // 2026-08-23 (FW-A3 campaign, 4 live sightings): task.comment DUAL-WRITES — the Comment row
      // (substituted above) AND a rich task_activities record (details.comment), which every
      // activities-fed surface renders (MCP task.context COMMENTS, the activity feed, forensics).
      // The 2026-07-15 fix covered only the Comment store, so those surfaces kept shipping the
      // literal token while the Comment table showed the real id. Substitute the activities copy
      // too — read-modify-write of `details` (jsonb whole-replace on a single key is Bug Class 2;
      // spread the object, replace only `comment`).
      const tokenActivities = await tx.taskActivity.findMany({
        where: { taskId: task.id, details: { path: ['comment'], string_contains: PLACEHOLDER } },
        select: { id: true, details: true },
      });
      for (const a of tokenActivities) {
        const details = (a.details ?? {}) as Record<string, unknown>;
        const commentText = details.comment;
        if (typeof commentText !== 'string') continue;
        await tx.taskActivity.update({
          where: { id: a.id },
          data: { details: { ...details, comment: commentText.split(PLACEHOLDER).join(reportMdArtifact.id) } },
        });
      }
      if (tokenActivities.length > 0) {
        logger.info({
          executionId,
          reportMdArtifactId: reportMdArtifact.id,
          activities: tokenActivities.length,
        }, 'Substituted harness report.md ID in task_activities comment copy(ies)');
      }
    } else if (pipelineIndexArtifact && !pipelineIndexArtifact.content.includes(PLACEHOLDER)) {
      logger.warn({
        executionId,
        pipelineIndexArtifactId: pipelineIndexArtifact.id,
      }, 'Harness pipeline-index.json missing {{HARNESS_REPORT_MD_ID}} placeholder — deliverable pointer not substituted (harness LLM may have forgotten the placeholder, falling back to whatever literal ID the harness wrote)');
    }
  }

  const createdArtifacts = await tx.agentArtifact.findMany({
    where: { executionId },
    select: { id: true, name: true, type: true, createdAt: true },
  });

  if (input.prune) {
    // PRUNE-ON-COMPLETE: cap SUCCESS/FAILED executions per task to prevent DB bloat, via the SHARED
    // status-aware selector (Flip 2 Increment 2 — same algorithm the RM daily sweep uses, different budget).
    // PRUNE_ON_COMPLETE_RETENTION = 10/10 (the in-tx cap; ~10 × ≤200 KB ≈ 2 MB per task worst case).
    // selectExecutionsToDelete partitions SUCCESS/FAILED, applies the keep-best inversion (I-PRUNE-1), and
    // excludes non-terminal rows. I-PRUNE-3: never move this block out of the terminal transaction.
    const terminalExecs = await tx.agentExecution.findMany({
      where: { taskId: task.id, status: { in: ['SUCCESS', 'FAILED'] } },
      select: { id: true, status: true, supersededById: true, createdAt: true },
    });
    const allToDelete = selectExecutionsToDelete(terminalExecs, PRUNE_ON_COMPLETE_RETENTION);

    if (allToDelete.length > 0) {
      // BC-#2: roll token facts into token_usage_daily AND delete the executions in ONE atomic RETURNING step
      // (I-PRUNE-2: same tx, rollup-from-the-deleted-rows — exactly-once by construction). Artifacts cascade.
      await rollUpAndDeleteExecutions(tx, allToDelete);
      logger.info(
        { taskId: task.id, deleted: allToDelete.length },
        'Pruned old agent executions to cap per-task storage'
      );
    }
  }

  const taskUpdateLog = `Execution started with ID: ${executionId}\nAgent execution completed successfully\nArtifacts generated: ${createdArtifacts.length} files`;

  // Fresh in-tx type read (engine-canonical, I-7) — PIPELINE harness tasks must NOT
  // be auto-completed on successful agent execution. The harness exits after
  // CREATE/ORCHESTRATE modes before children have run; auto-completing would make
  // the task status=COMPLETED prematurely AND defeat the auto-retrigger (which
  // requires the harness to be IN_PROGRESS to fire).
  //
  // PIPELINE tasks only transition to COMPLETED through the guarded MCP
  // task.complete path when SYNTHESIZE mode explicitly finishes.
  // @see lib/mcp/tasks/action/handlers/task/task-complete-handler.ts
  // @see .claude/knowledge/domain/harness/automation-loop-closure-architecture.md
  const currentTaskType = await tx.task.findUnique({
    where: { id: task.id },
    // status/stageId/title added for R4 Layer 2: status distinguishes a truncation-stalled
    // SYNTHESIZE (still IN_PROGRESS) from one that called task.complete then truncated a trailing
    // turn (COMPLETED — untouched); stageId/title feed the shared forward-cone walk.
    select: { type: true, metadata: true, status: true, stageId: true, title: true, stage: { select: { name: true } } },
  });
  const isPipelineTask = currentTaskType?.type === 'PIPELINE';

  // F17/F20 program-leg terminalization (2026-07-16, non-terminal-family panel — see
  // cline_docs/reviews/nonterminal-family-2026-07-16/synthesis.md). The "never auto-complete
  // PIPELINE" rule below exists because a harness exits after CREATE before children run —
  // but a PROGRAM LEG (PIPELINE task living in a `Program: `-prefixed stage) whose run ends
  // in a settled-non-terminal outcome would hang its parent program forever (T4e live):
  //  - F20 escalation-as-outcome: qualityGate.outcome='escalated' stamped + ALL children
  //    terminal ⇒ the leg's work is DONE with a terminal verdict → status=COMPLETED (the
  //    4-point invariant holds by construction here). The program gate consumes the outcome.
  //  - F17 duplicate-halt: metadata.duplicateHalt stamped (produced nothing, no children)
  //    ⇒ executionStatus='FAILED' (the F16 can-never-run taxonomy; program step-1 aborts
  //    naming it). Status stays untouched.
  // Scoped to program legs ONLY: standalone pipelines keep IN_PROGRESS (Guard-3b in-place
  // re-synthesis is load-bearing there) and programs keep their deliberate release park.
  // Platform-anchored (not protocol prose) per the harnessModeResolver lesson — prose
  // self-completion fails under budget exhaustion. Post-commit reactors (engine path)
  // retrigger the parent program off this transition — no new event machinery.
  let programLegCompletion: { status?: 'COMPLETED'; executionStatus?: 'FAILED' } = {};
  // R4 Layer 2 + F17 cone-gap: when a PIPELINE leg is terminalized FAILED here, its same-stage
  // forward cone must also be marked (a two-hop dependent like Node C otherwise re-hangs the
  // program one node downstream — the F16 lesson). Set the stageId to walk; null = leg mark only.
  let coneStageIdToMark: string | null = null;
  let legFailureMetaMerge: Record<string, unknown> | null = null;
  let legFailureComment: string | null = null;
  // E6 (2026-07-18): the pre-flight-bail branch sets neither input fact, so the cone-reason
  // derivation below needs the branch's own flag — falling through to the duplicate-halt
  // label mislabeled the attribution the program SYNTHESIZE reads.
  let isPreFlightBail = false;
  const isProgramLeg = isPipelineTask && !!currentTaskType?.stage?.name?.startsWith('Program: ');
  const legMeta = (currentTaskType?.metadata as Record<string, unknown> | null) ?? {};

  // F17/F20 program-leg outcomes are computed FIRST so an escalated leg with a stamped terminal
  // verdict WINS (F20 → COMPLETED) over the truncation branch below. The overlap is real: the
  // 'escalated' gate is metadata written by a mid-run tool call, so a leg can stamp escalated and
  // THEN truncate its final narrative turn — its decision exists, so it must complete-with-verdict,
  // not be marked FAILED (es-r4v/db-r4v F1). duplicate-halt is CREATE-mode so it never co-occurs
  // with a SYNTHESIZE truncation, but the ordering + the `!programLegCompletion` gate below make it
  // safe regardless.
  if (isProgramLeg) {
    const legGate = legMeta.qualityGate as Record<string, unknown> | undefined;
    if (legMeta.duplicateHalt) {
      programLegCompletion = { executionStatus: 'FAILED' };
      // F17 cone-gap fold (2026-07-16): the shipped F17 branch marked the leg FAILED with NO cone
      // walk — a duplicate-halted leg with same-stage dependents had the identical one-node-downstream
      // re-hang R4 fixes for truncation. Mark the cone here too (shared helper).
      coneStageIdToMark = currentTaskType?.stageId ?? null;
      logger.warn(
        { executionId, taskId: task.id, errorCode: 'PROGRAM_LEG_DUPLICATE_HALT' },
        'Program leg duplicate-halted — marked executionStatus=FAILED + forward cone so the program can escalate (F17 + cone-gap fold)'
      );
    } else if (legGate?.outcome === 'escalated') {
      const legStageId = typeof legMeta.pipelineStageId === 'string' ? legMeta.pipelineStageId : null;
      const nonTerminalChildren = legStageId
        ? await tx.task.count({
            where: {
              stageId: legStageId,
              AND: [
                { status: { not: 'COMPLETED' } },
                { OR: [{ executionStatus: null }, { executionStatus: { notIn: ['FAILED'] } }] },
              ],
            },
          })
        : 1; // no child stage → cannot assert the invariant → do not complete
      if (nonTerminalChildren === 0) {
        programLegCompletion = { status: 'COMPLETED' };
        logger.warn(
          { executionId, taskId: task.id, errorCode: 'PROGRAM_LEG_ESCALATED_COMPLETED' },
          'Program leg escalated with all children terminal — platform-completed so the program can escalate (F20)'
        );
      }
    }
  }

  // R4 Layer 2 — truncation stall. A SYNTHESIZE that produced no deliverable at max_tokens (R2
  // fact) and never reached task.complete leaves the leg IN_PROGRESS/execStatus=SUCCESS — invisible
  // to every predicate (the "settled-children, harness-mute" hang). Applies to ANY pipeline
  // SYNTHESIZE (program leg OR standalone). Gated so it fires only when F17/F20 did NOT already
  // terminalize the leg (an escalated-COMPLETED verdict wins), and the fresh in-tx status guard
  // excludes a leg that DID reach task.complete then truncated a trailing turn.
  if (
    isPipelineTask &&
    input.truncationStalled &&
    currentTaskType?.status !== 'COMPLETED' &&
    !programLegCompletion.status &&
    !programLegCompletion.executionStatus
  ) {
    programLegCompletion = { executionStatus: 'FAILED' };
    legFailureMetaMerge = {
      ...legMeta,
      truncationStall: { executionId, errorCategory: 'TRUNCATED_NO_OUTPUT', at: endTime.toISOString() },
    };
    legFailureComment =
      `⛔ **Truncation stall — synthesis produced no deliverable** (\`TRUNCATED_NO_OUTPUT\`).\n\n` +
      `The final turn stopped at the output-token ceiling (likely mid-thinking) after an in-execution ` +
      `retry-with-headroom, so this pipeline never reached \`task.complete\`. Marked \`executionStatus: ` +
      `FAILED\` so the owning program can escalate (or, for a standalone pipeline, so you can re-execute) ` +
      `instead of hanging. Re-executing the task retries the synthesis.`;
    // Cone only for program legs — a standalone pipeline's SYNTHESIZE has no program Guard 4 to
    // unblock and truncation is recoverable (human re-execute), so leg-mark-only keeps recovery clean.
    coneStageIdToMark = isProgramLeg ? (currentTaskType?.stageId ?? null) : null;
    logger.warn(
      { executionId, taskId: task.id, isProgramLeg, errorCode: 'TRUNCATION_STALL_TERMINALIZED' },
      'Pipeline SYNTHESIZE truncated with no deliverable after retry — marked executionStatus=FAILED so the pipeline/program can escalate (R4 Layer 2)'
    );
  }

  // HARNESS_NO_OUTPUT Layer 2 (2026-07-17, 3-lens panel + pipeline-harness-specialist,
  // GO-WITH-CHANGES@88) — the silent-green PIPELINE stall (5th non-terminal-family member).
  // Live specimen: a CREATE ran a successful stage.create then stopped — no
  // metadata.pipelineStageId, no children, empty finalResponse, normal stop → SUCCESS +
  // leg IN_PROGRESS forever + ORPHAN stage. Evades truncationStalled (normal stop),
  // EMPTY_DELIVERABLE (NON-PIPELINE scope), and pre-fix P8 (mode UNKNOWN).
  //
  // THE DEAD-END CONJUNCTION (deliberately NOT emptiness alone — a hypothetical
  // legitimate empty-but-LINKED run must never be killed): quality-layer fact
  // (input.harnessNoOutput) AND fresh in-tx status !== COMPLETED AND fresh in-tx
  // metadata.pipelineStageId ABSENT. No text + no handoff link + not complete =
  // provably nothing in flight. The link is written by the agent's own task.update
  // (CREATE Step 3) committed mid-loop, so any healthy CREATE that linked is visible
  // here (single-writer: BC67 one active exec per harness task).
  // Ordering: AFTER truncationStalled (more specific cause wins) and gated on BOTH
  // F17/F20 outcomes exactly like it (the es/db F1 ruling) — an escalated-COMPLETED
  // verdict always wins.
  //
  // Terminalizing does NOT "stop a retrigger storm" — no automatic multiplication path
  // exists (the retrigger fires only on child-terminal cascades; this leg has none).
  // Its value: the program escalates NAMING the leg instead of waiting forever, and the
  // false SUCCESS basis is removed. Execution row stays SUCCESS (K4/§L: no
  // classification moves — identical to truncationStalled).
  if (
    isPipelineTask &&
    input.harnessNoOutput &&
    currentTaskType?.status !== 'COMPLETED' &&
    !(legMeta as Record<string, unknown> | null | undefined)?.pipelineStageId &&
    !programLegCompletion.status &&
    !programLegCompletion.executionStatus
  ) {
    programLegCompletion = { executionStatus: 'FAILED' };
    legFailureMetaMerge = {
      ...legMeta,
      harnessNoOutput: { executionId, errorCategory: 'HARNESS_NO_OUTPUT', at: endTime.toISOString() },
    };
    legFailureComment =
      `⛔ **Harness stall — no output and no handoff** (\`HARNESS_NO_OUTPUT\`).

` +
      `This pipeline run produced no deliverable text and never linked a child stage ` +
      `(\`metadata.pipelineStageId\` absent) — nothing is in flight. Marked \`executionStatus: FAILED\` ` +
      `so the owning program can escalate (or, for a standalone pipeline, so you can recover) instead ` +
      `of hanging.

` +
      `⚠️ **Before re-executing**: if this run created a stage (look for an unlinked ` +
      `\`Pipeline: …\` stage with zero child tasks), DELETE that orphan stage first — a re-run ` +
      `resolves CREATE again and would mint another orphan alongside it.`;
    coneStageIdToMark = isProgramLeg ? (currentTaskType?.stageId ?? null) : null;
    logger.warn(
      { executionId, taskId: task.id, isProgramLeg, errorCode: 'HARNESS_NO_OUTPUT_TERMINALIZED' },
      'Pipeline harness produced no output and no stage link — marked executionStatus=FAILED so the pipeline/program can escalate (HARNESS_NO_OUTPUT Layer 2)'
    );
  }

  // PRE_FLIGHT_BAIL terminalization (2026-07-18, reactor-cascade audit PH1 — 6th non-terminal-
  // family member; run-9 specimen, follow-up (d)). A leg that bails in its own pre-flight
  // (e.g. upstream escalation detected before any child stage existed) stamps
  // metadata.cannotRun (contract: MANDATED on bail, orchestrator 3.9.1) and/or
  // qualityGate.outcome='escalated' with NO child stage, then ends its execution normally —
  // the unconditional SUCCESS write below would leave it non-terminal forever (Guard 4 and
  // harnessModeResolver both exclude SUCCESS), and would CLOBBER any FAILED flip raced in by
  // the task.update belt hook (harness-review PH1: separate-tx placement loses the race).
  // Terminalize in THIS tx so the FAILED write is authoritative. Gated on BOTH F17/F20
  // outcomes like its siblings (an escalated-COMPLETED verdict wins — es/db F1; note F20
  // deliberately falls through on escalated-with-no-child-stage, which is exactly this hole)
  // and on the fresh in-tx status.
  if (
    isPipelineTask &&
    currentTaskType?.status !== 'COMPLETED' &&
    !(legMeta as Record<string, unknown> | null | undefined)?.pipelineStageId &&
    (legMeta.cannotRun ||
      (legMeta.qualityGate as Record<string, unknown> | undefined)?.outcome === 'escalated') &&
    !programLegCompletion.status &&
    !programLegCompletion.executionStatus
  ) {
    programLegCompletion = { executionStatus: 'FAILED' };
    isPreFlightBail = true;
    legFailureMetaMerge = {
      ...legMeta,
      ...(legFailureMetaMerge ?? {}),
      cannotRunPersistedAt: endTime.toISOString(),
    };
    legFailureComment =
      `⛔ **Pre-flight bail — this leg can never run** (\`AGENT_STAMPED_CANNOT_RUN\`).\n\n` +
      `This pipeline stamped \`cannotRun\`/\`escalated\` in its own pre-flight and never created a ` +
      `child stage — nothing is or will be in flight. Marked \`executionStatus: FAILED\` in the ` +
      `terminal transaction so the owning program can escalate with attribution instead of hanging.`;
    coneStageIdToMark = isProgramLeg ? (currentTaskType?.stageId ?? null) : null;
    logger.warn(
      { executionId, taskId: task.id, isProgramLeg, errorCode: 'PRE_FLIGHT_BAIL_TERMINALIZED' },
      'Pipeline bailed in pre-flight (cannotRun/escalated stamped, no child stage) — marked executionStatus=FAILED so the pipeline/program can escalate'
    );
  }

  await tx.task.update({
    where: { id: task.id },
    data: {
      executionStatus: 'SUCCESS',
      // Skip status transition for PIPELINE tasks — the harness decides
      // when the pipeline is actually done via explicit task.complete
      // (guarded). For all other task types, successful execution means
      // the task is done. F17/F20 exception: a program leg with a settled
      // terminal outcome is transitioned here (programLegCompletion, above)
      // — its overrides win the spread.
      ...(isPipelineTask ? {} : { status: 'COMPLETED' }),
      ...programLegCompletion,
      // R4 Layer 2: the truncation-stall honesty record (merged over the fresh metadata). Only set
      // on the truncation branch; normal completions leave metadata untouched.
      ...(legFailureMetaMerge ? { metadata: legFailureMetaMerge as any } : {}),
      agentLog: taskUpdateLog,
      outputArtifacts: createdArtifacts.map(artifact => ({
        id: artifact.id,
        name: artifact.name,
        type: artifact.type,
        createdAt: artifact.createdAt.toISOString(),
      })),
      updatedAt: endTime,
    },
  });

  // R4 Layer 2 + F17 cone-gap: post the leg's honesty comment (truncation only) and mark the
  // forward cone (program legs only), in the SAME transaction, via the shared walk.
  if (legFailureComment) {
    await tx.comment.create({
      data: { taskId: task.id, userId: input.commentUserId, text: legFailureComment, createdAt: endTime },
    });
  }
  if (coneStageIdToMark) {
    // Four-way reason (2026-07-18, was three-way): truncation > harness-no-output >
    // pre-flight-bail > duplicate-halt. Branch order above guarantees truncation set the
    // completion first when both facts are true, so deriving from the inputs here stays
    // faithful to which branch fired. isPreFlightBail is the branch's own flag (E6:
    // deriving it from inputs is impossible — the bail sets neither input fact, and
    // falling through to the duplicate-halt label mislabeled the cone attribution).
    const isTruncation = input.truncationStalled;
    const isHarnessNoOutput = !isTruncation && input.harnessNoOutput;
    await markForwardConeBlocked(tx, task.id, coneStageIdToMark, {
      reasonCode: isTruncation ? 'UPSTREAM_TRUNCATION_STALL'
        : isHarnessNoOutput ? 'UPSTREAM_HARNESS_NO_OUTPUT'
        : isPreFlightBail ? 'UPSTREAM_PRE_FLIGHT_BAIL'
        : 'UPSTREAM_DUPLICATE_HALT',
      reasonPhrase: isTruncation
        ? 'produced no deliverable (truncated at the output-token ceiling)'
        : isHarnessNoOutput
        ? 'produced no output and never linked a child stage (nothing in flight)'
        : isPreFlightBail
        ? 'bailed in its own pre-flight (stamped cannotRun/escalated with no child stage — it can never run)'
        : 'was halted as a duplicate and produced no deliverable',
      failedTitle: currentTaskType?.title ?? '',
      commentUserId: input.commentUserId,
      now: endTime,
    });
  }

  return { createdArtifacts };
}

/**
 * SUCCESS terminal persist: the transaction + the core-owned post-commit tail
 * (reactors when enabled, auto-comment). Adapter-side presentation (SSE events,
 * engine progress events, activity log) stays with the callers.
 */
export async function persistTerminalSuccess(
  db: PrismaClient,
  input: TerminalSuccessInput,
): Promise<TerminalSuccessResult> {
  let txResult!: TerminalSuccessTxResult;
  await db.$transaction(async (tx) => {
    txResult = await runTerminalSuccessTx(tx, input);
  });

  const { queuedMs, executionMs } = deriveTimingFacts(input.endTime, input.executionStartTime, input.executionCreatedAt);

  if (input.fireReactors) {
    // Fire-and-forget reactors after the completion tx commits.
    //
    // 1. PipelineRetrigger: if this task was the last non-terminal child of
    //    a PIPELINE harness, queue the harness for SYNTHESIZE.
    //    @see lib/services/pipelineRetriggerReactorService.ts
    // 2. TaskReady: if any dependent task in the same stage now has all
    //    its dependencies COMPLETED, queue executions for those dependents.
    //    @see lib/services/taskReadyReactorService.ts
    //
    // Both never throw (internal try/catch); safe to fire concurrently.
    // Fire-time dynamic import kept deliberately: the reactor services pull in
    // engine process-lifecycle dependencies that must not load on module import.
    const { maybeRetriggerPipelineHarness } = await import('./pipelineRetriggerReactorService');
    const { maybeQueueReadyDependents } = await import('./taskReadyReactorService');
    maybeRetriggerPipelineHarness(input.task.id).catch(() => {});
    maybeQueueReadyDependents(input.task.id).catch(() => {});
  }

  // Auto-post completion comment with artifact fetch commands (visible in GUI +
  // MCP task.context). Core-owned (M13); reuses the in-tx artifact list (N-2);
  // failure is logged, never thrown (N-1 — engine-canonical, the stream used to swallow).
  try {
    const artifactLines = txResult.createdArtifacts.map(a =>
      `  - ${a.name} → \`fetch(id: "artifact-${a.id}")\``
    ).join('\n');
    const confidenceLine = input.confidenceScore != null ? `\n- **Confidence**: ${input.confidenceScore}/100` : '';
    const durationSec = Math.round((executionMs ?? 0) / 1000);

    const completionComment = `## Agent Execution Complete` +
      `\n- **Role**: ${input.agentRole}` +
      `\n- **Duration**: ${durationSec}s` +
      `\n- **Tool Calls**: ${input.toolCallsTotal} (${input.toolCallsSucceeded} succeeded, ${input.toolCallsFailed} failed)` +
      confidenceLine +
      `\n- **Artifacts**:\n${artifactLines}`;

    await db.comment.create({
      data: {
        taskId: input.task.id,
        userId: input.commentUserId,
        text: completionComment.substring(0, 2000),
        createdAt: new Date(),
      }
    });
  } catch (commentErr) {
    input.logger.warn({ err: commentErr, executionId: input.executionId }, 'Failed to create completion comment — non-blocking');
  }

  return { ...txResult, queuedMs, executionMs };
}

export interface TerminalFailureInput {
  executionId: string;
  taskId: string;
  taskTitle?: string;
  /** Adapter-derived message (the non-Error fallback strings differ per adapter — preserved). */
  errorMessage: string;
  /** Typed-error `.code` when present (NoTemplateAssignedError, USER_CONFIG_REQUIRED, …). */
  errorCode?: string;
  /**
   * Adapter-supplied persist-site FACT:
   * 'executeAgent' | 'stream' | 'safety-net' | 'mcp-dispatch'.
   * ('mcp-dispatch' added 2026-07-25 — the MCP background-dispatch catch, formerly an inline
   * re-implementation that wrote no error.json at all.)
   */
  source: string;
  /** Adapter-shaped logs to persist (engine appends to prior logs; stream cans — M14 narrative unification is NOT this phase). */
  logs: string[];
  endTime: Date;
  executionCreatedAt: Date | null;
  executionStartTime: Date | null;
  /** capturedUsage — undefined when failure preceded any LLM call (→ all-null columns). */
  usage: AccumulatedUsage | undefined;
  servingModel: string | null;
  /** TRANSITIONAL (Flip 1): failure fires the pipeline retrigger ONLY (never ready-dependents). */
  fireReactors: boolean;
  logger: TerminalPersistLogger;
}

export interface TerminalFailureResult {
  /** false → the CAS found a terminal row: nothing was written, the failure tail is moot. */
  persisted: boolean;
  errorArtifactId: string | null;
  executionMs: number | null;
}

/**
 * The FAILURE terminal transaction body — Phase 4a CAS preserved (crash-only
 * invariant): flip to FAILED ONLY if the row is still non-terminal. A throw AFTER
 * the SUCCESS tx commits lands in the adapter's catch; without the guard this
 * would overwrite the committed SUCCESS row with FAILED + a spurious error.json.
 * The same guard makes every other FAILED-persist site a no-op once one has
 * flipped, so a real failure persists exactly ONCE.
 */
export async function runTerminalFailureTx(
  tx: Prisma.TransactionClient,
  input: TerminalFailureInput,
): Promise<TerminalFailureResult> {
  const { executionMs } = deriveTimingFacts(input.endTime, input.executionStartTime, input.executionCreatedAt);

  const flipped = await tx.agentExecution.updateMany({
    where: { id: input.executionId, status: { in: ['PENDING', 'RUNNING'] } },
    data: {
      status: 'FAILED',
      endTime: input.endTime,
      updatedAt: input.endTime,
      // token-usage-persistence: a FAILED run that spent tokens is real cost — persist the
      // partial (usage is undefined only if failure preceded any LLM call → all-null).
      ...buildTokenUsageColumns(input.usage, input.servingModel),
      // Branchable failure code — SAME `input.errorCode` that feeds buildErrorJson's
      // `errorCategory` below, written in the SAME statement as the terminal status flip and
      // the SAME transaction as the artifact. One value, one tx: column and error.json cannot
      // drift. `?? null` is literal ("no code recorded"), never a synthesized placeholder.
      errorCode: input.errorCode ?? null,
      logs: input.logs,
    },
  });

  if (flipped.count === 0) {
    // Row already terminal — committed SUCCESS (post-commit throw) or FAILED by
    // another site. Do NOT clobber the status and do NOT write a duplicate error.json.
    return { persisted: false, errorArtifactId: null, executionMs };
  }

  await tx.task.update({
    where: { id: input.taskId },
    data: {
      executionStatus: 'FAILED',
      updatedAt: input.endTime,
    },
  });

  // B4: errorCategory feeds GUI targeted remediation banners.
  const errorArtifact = await tx.agentArtifact.create({
    data: {
      executionId: input.executionId,
      name: 'error.json',
      type: 'application/json',
      content: buildErrorJson({
        errorMessage: input.errorMessage,
        errorCode: input.errorCode,
        source: input.source,
        taskId: input.taskId,
        taskTitle: input.taskTitle,
        executionTimeMs: executionMs ?? undefined,
        timestamp: input.endTime,
      }),
    },
  });

  return { persisted: true, errorArtifactId: errorArtifact.id, executionMs };
}

/**
 * FAILURE terminal persist. F-1 CONTRACT (caller-side, non-negotiable): if this
 * function THROWS, the adapter must log the persist failure and rethrow the
 * ORIGINAL execution error — never the persist error — so the crash-only safety
 * nets (poller catch, MCP .catch) still see an un-persisted failure and fire.
 * A swallow here is the one mis-implementation that LOSES a failure (row stuck
 * RUNNING, no error.json).
 */
export async function persistTerminalFailure(
  db: PrismaClient,
  input: TerminalFailureInput,
): Promise<TerminalFailureResult> {
  let result!: TerminalFailureResult;
  await db.$transaction(async (tx) => {
    result = await runTerminalFailureTx(tx, input);
  });

  if (input.fireReactors) {
    // Fire-and-forget: a FAILED sibling is terminal for retrigger purposes —
    // queue the harness for SYNTHESIZE so it can escalate rather than leaving
    // the pipeline stuck. Failure fires the retrigger ONLY (asymmetry is core
    // policy: ready-dependents must not queue off a failure). Fires even on a
    // CAS-miss (preserves the pre-4b engine behavior: the retrigger sat outside
    // the tx, unconditional). Runs after the transaction commits.
    // @see lib/services/pipelineRetriggerReactorService.ts
    try {
      const { maybeRetriggerPipelineHarness } = await import('./pipelineRetriggerReactorService');
      maybeRetriggerPipelineHarness(input.taskId).catch(() => {});
    } catch {
      // Ignore import/retrigger errors on the failure path.
    }
    // Finding 9 amendment (2026-07-15): TaskReady on the failure path too — as a SAFETY NET
    // for the deferral in task-complete-handler. A PIPELINE SYNTHESIZE that calls
    // task.complete (task now COMPLETED, TaskReady deferred to "my terminal persist") and
    // THEN fails before/at persist would otherwise strand its dependents forever. The
    // asymmetry policy is preserved by the reactor itself: maybeQueueReadyDependents
    // no-ops unless the task's STATUS is COMPLETED — a normally-failed task (status not
    // COMPLETED) still never queues dependents off a failure.
    try {
      const { maybeQueueReadyDependents } = await import('./taskReadyReactorService');
      maybeQueueReadyDependents(input.taskId).catch(() => {});
    } catch {
      // Ignore import/reactor errors on the failure path.
    }
  }

  return result;
}
