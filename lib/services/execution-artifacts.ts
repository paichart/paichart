/**
 * Execution Artifacts — Shared builder for the result.json artifact
 *
 * Both agent execution paths produce a result.json artifact:
 *   - Engine path:  lib/services/agentExecutionEngine.ts (MCP/API/polling triggers)
 *   - Stream path:  app/api/pov/agent/execute/stream/route.ts (GUI/SSE triggers)
 *
 * Pre-2026-05-14, both paths constructed the resultJson object inline,
 * resulting in silent drift across 5 documented sites (see Bug Class 75
 * in .claude/knowledge/domain/mcp/bug-class-registry.md):
 *
 *   - hitMaxTurns: stream hardcoded `30`, engine used MAX_TOOL_TURNS variable.
 *     Harness templates set maxToolTurns=100; stream artifacts wrongly reported
 *     hitMaxTurns=true at turnCount=35.
 *   - tokensUsed: stream hardcoded `0`, engine had real value. Stream's
 *     real tokens were calculated 341 lines AFTER resultJson was built;
 *     billing/analytics reading the artifact saw 0.
 *   - agentRole: stream used raw body.agentConfig.role, engine used the
 *     template-resolved resolvedRole. Mismatched audit trail for
 *     PIPELINE-template-resolved tasks.
 *   - executionTime: engine pre-calculated, stream inlined Date.now()
 *     subtraction. Equivalent today but drift-vulnerable.
 *   - diagnosticRetryUsed: engine emitted, stream missing.
 *
 * Documented in .claude/knowledge/patterns/dual-execution-path-parity-pattern.md
 * (98% confidence, last validated 2026-04-04) which explicitly cites the
 * "Future Fix: extract shared logic into a common module" — this file is
 * that future fix.
 *
 * Both callers MUST use this function. Tested in
 * scripts/test-execution-artifacts-parity.ts.
 *
 * @created 2026-05-14
 */

// Import canonical types from their owning modules so callers can pass them
// directly without casting. This is intentional coupling: the helper exists
// specifically to produce the result.json artifact, which IS the consumer of
// these domain types.
import type { ResolvedHarnessContext } from './harnessModeResolver';
import type { AccumulatedUsage } from '@/lib/agents/harness/agentic-tool-loop';
import { assessScoreIntegrity } from '@/lib/agents/harness/parse-confidence';
import { parseReviewerVerdict, REVIEWER_ROLES } from '@/lib/agents/harness/parse-verdict';
import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * BC46 / convergence 0.5d: strip HTML script/event-handler/iframe vectors from
 * LLM prose before it lands in report.md (rendered by the GUI artifact viewer
 * regardless of which path created it — stored-XSS surface).
 *
 * Apply ONLY to freshly generated text (report.md `source === 'self'` body and
 * the extraction-failure fallback body). Upstream-extracted content was already
 * sanitized when its own execution wrote it — re-running would double-process.
 * (Formerly inline in stream/route.ts only; the engine wrote raw finalResponse —
 * the parity hole found by the convergence review, agent-execution I-1.)
 */
export function sanitizeLLMForMarkdown(text: string): string {
  return text.replace(/<script[\s>][\s\S]*?<\/script>/gi, '[script removed]')
             .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '[event handler removed]')
             .replace(/<iframe[\s>][\s\S]*?(<\/iframe>|>)/gi, '[iframe removed]');
}

/**
 * (token-usage-persistence Phase 1) Shared builder for the structured token-usage COLUMNS written to
 * `agent_executions` at the terminal update. Both terminal paths (engine SUCCESS/FAILED + stream) MUST
 * spread this so the split can't drift between them — the same dual-path-parity guarantee the
 * result.json builder enforces (this file's raison d'être). `usage` undefined (failure before any LLM
 * call) → all-null columns; `modelUsed` null when the serving model is genuinely unknown (never a
 * fabricated 'default' — analytics needs to see the anomaly, not mask it). Cost is NOT written here —
 * it is derived on read from the time-versioned pricing table (Protocol 10 fact-vs-verdict).
 */
export function buildTokenUsageColumns(
  usage: AccumulatedUsage | undefined,
  modelUsed: string | null | undefined,
): {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheCreationTokens: number | null;
  modelUsed: string | null;
} {
  return {
    inputTokens: usage ? usage.inputTokens : null,
    outputTokens: usage ? usage.outputTokens : null,
    cacheReadTokens: usage ? usage.cacheReadTokens : null,
    cacheCreationTokens: usage ? usage.cacheCreationTokens : null,
    modelUsed: modelUsed ?? null,
  };
}

// ── Durable token-cost history: roll up before PRUNE (token-usage-persistence Phase 2 #1) ────────────
// Sentinels — Postgres treats NULL as distinct in a key, which would silently break the ON CONFLICT
// upsert-increment (a null povId/model row never conflicts with itself). NOT-NULL sentinels fix that;
// a `__none__` povId bucket is admin-only-visible (POV-scoped reads use an id-list that never contains it).
export const ROLLUP_NO_POV = '__none__';
export const ROLLUP_UNKNOWN_MODEL = '__unknown__';

export interface UsageRow {
  startTime: Date | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheCreationTokens: number | null;
  modelUsed: string | null;
  povId: string | null;
}

export interface RollupBucket {
  povId: string;
  bucketDate: string;   // 'YYYY-MM-DD' — UTC day of startTime
  modelUsed: string;
  executions: bigint;
  inputTokens: bigint;
  outputTokens: bigint;
  cacheReadTokens: bigint;
  cacheCreationTokens: bigint;
}

/**
 * PURE (unit-testable): bucket to-be-deleted executions by (povId, UTC-day-of-startTime, modelUsed).
 * Skips all-null-token rows (pre-Phase-1 / never-ran executions) and rows with no startTime (no bucket
 * date derivable). Nulls → sentinels. bucketDate is the day the execution RAN (startTime), never the
 * prune date, so the time series and as-of pricing stay correct.
 */
export function aggregateUsageRows(rows: UsageRow[]): RollupBucket[] {
  const buckets = new Map<string, RollupBucket>();
  for (const r of rows) {
    const hasTokens = r.inputTokens != null || r.outputTokens != null
      || r.cacheReadTokens != null || r.cacheCreationTokens != null;
    if (!hasTokens || !r.startTime) continue;
    const povId = r.povId ?? ROLLUP_NO_POV;
    const modelUsed = r.modelUsed ?? ROLLUP_UNKNOWN_MODEL;
    const bucketDate = r.startTime.toISOString().slice(0, 10);
    const key = `${povId}\u0000${bucketDate}\u0000${modelUsed}`;
    const b = buckets.get(key) ?? {
      povId, bucketDate, modelUsed,
      executions: 0n, inputTokens: 0n, outputTokens: 0n, cacheReadTokens: 0n, cacheCreationTokens: 0n,
    };
    b.executions += 1n;
    b.inputTokens += BigInt(r.inputTokens ?? 0);
    b.outputTokens += BigInt(r.outputTokens ?? 0);
    b.cacheReadTokens += BigInt(r.cacheReadTokens ?? 0);
    b.cacheCreationTokens += BigInt(r.cacheCreationTokens ?? 0);
    buckets.set(key, b);
  }
  return [...buckets.values()];
}

type RollupClient = PrismaClient | Prisma.TransactionClient;

/**
 * Delete the given executions AND roll their token facts into `token_usage_daily` in ONE atomic step,
 * so durable cost history survives PRUNE-ON-COMPLETE + the resourceManager cleanups.
 *
 * BC-#2 exactly-once-by-construction (2026-07-06): the rollup reads its token facts from the DELETE's
 * `RETURNING` set — the rows THIS transaction actually removed — NOT a prior `findMany`. Two pruners can
 * overlap (prune-on-complete deletes 11+, the RM sweep deletes 5+); with a pre-read both would read the
 * same cap-boundary row live and BOTH increment token_usage_daily → silent double-count. Rolling up from
 * RETURNING makes that impossible: a concurrent tx that already deleted a row gets it in no one else's
 * RETURNING, so each execution's tokens are counted by exactly one tx. Artifacts cascade
 * (`AgentArtifact.execution onDelete: Cascade`) so no explicit artifact delete is needed here.
 *
 * 5 execution-delete sites exist; only these 3 carry tokens and MUST route their execution delete through
 * this fn (parity — miss one and that history is lost forever, or a bare deleteMany reopens the race):
 *   1. execution-terminal-persist.ts PRUNE-ON-COMPLETE (per-task cap, in the SUCCESS $transaction)
 *   2. resourceManager.ts cleanupArtifactsByTask   (daily keep-N, the periodic pruner)
 *   3. resourceManager.ts cleanupArtifactsByAge     (>Nd orphan executions)
 * The other 2 (agentTaskService race-loss, execute/route race-loss) delete PENDING rows with zero tokens
 * — intentionally NOT routed here.
 *
 * MUST run inside the caller's transaction. Increment via raw ON CONFLICT (atomic; Prisma `upsert` races
 * to P2002). Returns the number of executions actually deleted (for caller logs).
 */
export async function rollUpAndDeleteExecutions(client: RollupClient, executionIds: string[]): Promise<number> {
  if (executionIds.length === 0) return 0;
  // DELETE … RETURNING: roll up ONLY the rows this tx removed (see BC-#2 above). `= ANY(${array})` is the
  // repo's Prisma array-bind idiom (stageValidationService.ts:290). Column names are agent_executions'
  // unmapped camelCase; pov_id is Task's @map("pov_id").
  const rows = await client.$queryRaw<Array<{
    startTime: Date | null;
    inputTokens: number | null;
    outputTokens: number | null;
    cacheReadTokens: number | null;
    cacheCreationTokens: number | null;
    modelUsed: string | null;
    povId: string | null;
  }>>`
    DELETE FROM agent_executions ae
    USING tasks t
    WHERE ae."taskId" = t.id AND ae.id = ANY(${executionIds})
    RETURNING ae."startTime", ae."inputTokens", ae."outputTokens",
              ae."cacheReadTokens", ae."cacheCreationTokens", ae."modelUsed", t.pov_id AS "povId"
  `;
  const buckets = aggregateUsageRows(rows.map((r) => ({
    startTime: r.startTime,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    cacheReadTokens: r.cacheReadTokens,
    cacheCreationTokens: r.cacheCreationTokens,
    modelUsed: r.modelUsed,
    povId: r.povId ?? null,
  })));
  for (const b of buckets) {
    await client.$executeRaw`
      INSERT INTO token_usage_daily
        ("povId", "bucketDate", "modelUsed", executions, "inputTokens", "outputTokens", "cacheReadTokens", "cacheCreationTokens", "createdAt", "updatedAt")
      VALUES
        (${b.povId}, ${b.bucketDate}::date, ${b.modelUsed}, ${b.executions}, ${b.inputTokens}, ${b.outputTokens}, ${b.cacheReadTokens}, ${b.cacheCreationTokens}, now(), now())
      ON CONFLICT ("povId", "bucketDate", "modelUsed") DO UPDATE SET
        executions            = token_usage_daily.executions            + EXCLUDED.executions,
        "inputTokens"         = token_usage_daily."inputTokens"         + EXCLUDED."inputTokens",
        "outputTokens"        = token_usage_daily."outputTokens"        + EXCLUDED."outputTokens",
        "cacheReadTokens"     = token_usage_daily."cacheReadTokens"     + EXCLUDED."cacheReadTokens",
        "cacheCreationTokens" = token_usage_daily."cacheCreationTokens" + EXCLUDED."cacheCreationTokens",
        "updatedAt"           = now()`;
  }
  return rows.length;
}

export interface ToolCallEntry {
  success: boolean;
  result?: unknown;
  tool?: string;
  server?: string;
  [key: string]: unknown;
}

/**
 * countToolErrorResults — how many tool calls RETURNED an MCP error envelope (`isError: true`)
 * while still recording `success: true`.
 *
 * WHY THIS EXISTS (T6 finding F-NEW-3 / AE-12, 2026-07-17; two review lenses converged on it):
 * the tool loop sets `success: false` ONLY on a genuine JS throw. An MCP tool that RETURNS an error
 * — the §L/K4 expected-denial contract — keeps `success: true` by construction, so
 * `qualityMetrics.toolCallSuccess` reads `{total: 7, succeeded: 7, failed: 0}` even when every call
 * came back `❌ … Error 502: Bad gateway`. Live proof: the T6 terraform leg's Harvester harvested
 * NOTHING (its rig was down) and the engine emitted no countable fact saying so — the leg's correct
 * refusal to synthesize rested ENTIRELY on the child's honest self-scored confidence (25). An
 * optimistic self-score would have carried an ungrounded change package to a Reviewer that approved
 * it at 88.
 *
 * That contract is RIGHT for policy denials (a read-only service refusing a mutating verb is a
 * normal, non-degrading answer). But a transport-level 5xx is a genuine failure wearing the denial
 * channel's clothes. So: ship the FACT (Protocol 10), do NOT re-classify `success`.
 *
 * DELIBERATELY NOT: a verdict. This does not touch `success` semantics (the §L-pinned invariant),
 * does not feed `executionDegradation`, and has NO consumer wired — per Protocol 10 the fact earns
 * the verdict only once outcome data exists. A consumer is a separate, triggered decision.
 */
export function countToolErrorResults(toolCallResults: ToolCallEntry[]): number {
  return toolCallResults.filter(entry => {
    if (!entry.success) return false; // a genuine throw is already counted by toolCallSuccess.failed
    const result = entry.result;
    return typeof result === 'object' && result !== null && (result as { isError?: unknown }).isError === true;
  }).length;
}

export interface McpFunction {
  name: string;
}

export interface ExecutionDegradation {
  errorCategory?: string;
  [key: string]: unknown;
}

/**
 * Chained-context coverage signal (D1, 2026-06-08) — the 8th additive agent-output
 * trust signal. Surfaces, in result.json, how much upstream pipeline context this
 * execution actually received, so a downstream consumer (the SYNTHESIZE gate, forensic
 * queries) can distinguish full-input from clipped-input runs. Facts come from
 * `task.inputContext.pipelineMetadata` (written by the context-chainer / A1). Emit-only —
 * no consumer wired yet (the trust-stack pattern: detectors emit, consumers decide).
 */
export interface ChainedContextSignal {
  predecessors: number;          // dependency outputs ACTUALLY chained (had result.json, parsed)
  expectedPredecessors: number;  // dependency edges that existed (the RAW forensic edge count —
                                 // includes never-executing gates/holds; kept verbatim, string-pinned).
  chainCapablePredecessors: number; // F19 (2026-07-16): deps that CAN chain (PIPELINE or templated).
                                 // THE gate denominator: predecessors < chainCapablePredecessors ⇒
                                 // a real upstream was dropped. Never compare against
                                 // expectedPredecessors (false-blocks on parked gates — T4e run #2).
  degradedPredecessors: number;  // F19: chained PIPELINE predecessors that PROMISED a deliverable
                                 // (deliverableSourceTaskId set) but chained the pipeline-index
                                 // fallback — deliverable missing despite a passing count. Blocking.
  totalChars: number;            // total chained chars across predecessors (post-A1 cap)
  anyTruncated: boolean;         // did the A1 §6 cap clip any predecessor?
}

export interface ExecutionResultJsonInput {
  // Identity
  taskId: string;
  taskTitle: string;
  agentRole: string;
  modelUsed: string;

  // LLM output
  finalResponse: string;
  confidenceScore: number | null;

  // Trust signals (all optional, conditionally emitted)
  confidenceCapped?: boolean;
  originalConfidence?: number | null;
  executionDegradation?: ExecutionDegradation | null;
  protocolValidation?: unknown;
  harnessContext?: ResolvedHarnessContext | null;
  chainedContext?: ChainedContextSignal | null;  // 8th trust signal — pipeline input coverage (D1)
  /** 10th trust signal (WS1 Phase C, 2026-08-17): what protocol content this execution's system
   *  prompt actually carried — mode, base/delta rows+versions, stampSource, preambleChars. A FACT
   *  (Protocol 10): transcribed from the injection, never judged here. */
  protocolInjection?: object | null;

  // Metrics
  turnCount: number;
  maxToolTurns: number;
  toolCallResults: ToolCallEntry[];
  successfulToolCalls: number;
  failedToolCalls: number;
  executionTime: number | undefined;  // engine may have undefined under some early-exit paths
  tokensUsed: number | undefined;     // engine accumulates incrementally; may be undefined on early exit
  mcpFunctions?: McpFunction[] | null;

  // Tool loop signals
  correctionTurnUsed: boolean;
  /** Budget fail-fast fired (all-budget-rejected turn → final no-tools blocked-report turn). */
  budgetFailFastUsed?: boolean;
  diagnosticRetryUsed?: boolean;
  /** R4 Layer 1: a 'full' turn truncated at max_tokens with empty text and was re-issued once with
   *  raised maxTokens; `Recovered` = the retry produced text/tool_use. Trust-signal family. */
  truncationRetryUsed?: boolean;
  truncationRetryRecovered?: boolean;

  // Path-specific extensions (Vercel-AI-SDK fields emitted by stream path only —
  // engine uses Anthropic SDK directly and doesn't surface these as artifact fields)
  extensions?: {
    functionCall?: unknown;
    webSearchResults?: unknown;
    citations?: unknown;
    searchQueries?: unknown;
  };

  // Logger for tool-call truncation log lines (different across paths)
  logger: {
    info: (data: Record<string, unknown>, msg: string) => void;
  };

  executionId: string;
}

// Storage-truncation point for a persisted tool result (NOT an input ceiling). The 50000
// here and FIELD_LIMITS.CONTENT (50000) are INTENTIONALLY distinct concepts — a
// validated-input cap vs a persistence-truncation threshold — and must NOT be coupled to
// a shared constant (runtime-limits-sweep §5 "document-as-distinct, do NOT unify", 2026-06-17).
// Exported for the tier-nesting invariant test (Finding D) — export-only, still not coupled.
export const MAX_STORED_TOOL_RESULT_BYTES = 50000;
// Deliberately matches Tier-1 MAX_TOOL_RESULT_LENGTH (agentic-tool-loop.ts) so the
// preserved preview always covers at least what the LLM saw in-loop. At 2000
// (pre 2026-07-04), a >50KB result persisted LESS than the LLM acted on — chars
// 2000-8000 of the LLM's view were unrecoverable for external service responses.
// Kept as an independent named constant with this cross-ref (not imported from the
// loop module), per the runtime-limits sweep §5 convention.
// Exported for the tier-nesting invariant test (Finding D), which enforces the ">= what the
// LLM saw" guarantee this comment describes (it inverted once — 2000 pre-2026-07-04).
export const TOOL_RESULT_PREVIEW_BYTES = 8000;

/**
 * Truncate large tool-call results before persistence.
 *
 * Without this, agent.results / fetch / task.context calls that return upstream
 * artifacts cascade exponentially down the synthesis chain — Trial A 2026-04-27
 * observed Acquirer 300KB → Harvester 1.7MB (94% from a single agent.results
 * call) → Editor 5.2MB (Postgres JSONB parser broke on the deep escape nesting).
 *
 * The forensic value of keeping every byte of every tool call's result is low;
 * preview + size + reference is sufficient for diagnosing what data the agent saw.
 *
 * Threshold chosen to let normal MCP service responses (5-30KB typical) pass
 * through untouched while bounding the pathological upstream-artifact-fetch case
 * at the depth-cascade source.
 */
function truncateToolCallResults(
  toolCallResults: ToolCallEntry[],
  executionId: string,
  logger: ExecutionResultJsonInput['logger']
): ToolCallEntry[] {
  return toolCallResults.map(entry => {
    if (!entry.success || !entry.result) return entry;
    const resultJson = JSON.stringify(entry.result);
    if (resultJson.length <= MAX_STORED_TOOL_RESULT_BYTES) return entry;
    logger.info({
      executionId,
      tool: entry.tool,
      server: entry.server,
      originalSize: resultJson.length,
      truncatedTo: TOOL_RESULT_PREVIEW_BYTES,
    }, 'tool-call result truncated for persistence (exceeded 50KB threshold)');
    return {
      ...entry,
      result: {
        truncated: true,
        originalSize: resultJson.length,
        preview: resultJson.slice(0, TOOL_RESULT_PREVIEW_BYTES) + '...',
        note: `Full result was ${resultJson.length} bytes (exceeded 50KB persistence threshold). Truncated to prevent chained-context cascade bloat. The preview covers what the LLM saw in-loop (8KB Tier-1 cap). If this result was a fetch of another task's artifact, the full content lives on that originating task (agent.results); an external service response beyond the preview was not persisted anywhere.`,
      },
    };
  });
}

/**
 * Build the result.json artifact for a completed agent execution.
 *
 * Output shape (25 fields, some conditional). ORDER IS A CONTRACT: every compact field
 * (identity, confidence, reviewerVerdict, the full trust-signal stack, metrics) is emitted
 * BEFORE the bulky payloads (finalResponse, toolCalls, stream extensions) — consumers read
 * this artifact through head-slice caps, so position decides visibility (2026-07-14).
 *   Identity: taskId, taskTitle, agentRole, generatedAt, modelUsed
 *   LLM:      confidenceScore, (conditional, reviewer roles) reviewerVerdict
 *   Trust:    (conditional) confidenceCapped + originalConfidence,
 *             executionDegradation, errorCategory, protocolValidation,
 *             resolvedMode + resolvedReasonCode (templateScopeMismatch RETIRED 2026-07-17; historical artifacts still carry it)
 *   Metrics:  qualityMetrics{toolCallSuccess, totalTurns, hitMaxTurns,
 *             responseLength}, keepBestFacts{deliverableChars, fencedBlockCount,
 *             scoreIntegrity}, executionTime, tokensUsed, mcpToolsProvided
 *   Tools:    toolCalls (truncated), toolLoop{totalTurns, hitMaxTurns,
 *             totalToolExecutions, correctionTurnUsed, diagnosticRetryUsed, budgetFailFastUsed,
 *             truncationRetryUsed, truncationRetryRecovered, toolErrorResultCount}
 *   Stream extensions (Vercel-AI-SDK only): functionCall, webSearchResults,
 *             citations, searchQueries
 */
/**
 * Derive the chained-context coverage signal (D1) from a task's inputContext.
 * Returns null when no pipeline predecessors were chained (standalone task / no deps)
 * so the signal is emitted happy-path-clean — present ONLY when there is coverage to
 * report. Reads the facts the context-chainer (A1) wrote into `pipelineMetadata`.
 * Both result.json callers (engine + stream) MUST pass this — two-execution-path parity.
 */
export function deriveChainedContextSignal(inputContext: unknown): ChainedContextSignal | null {
  const meta = (inputContext as { pipelineMetadata?: Record<string, unknown> } | null | undefined)?.pipelineMetadata;
  if (!meta || typeof meta !== 'object') return null;
  const predecessors = typeof meta.completedDependencies === 'number' ? meta.completedDependencies : 0;
  if (predecessors <= 0) return null;  // nothing chained → no signal (clean happy path)
  return {
    predecessors,
    expectedPredecessors: typeof meta.totalDependencies === 'number' ? meta.totalDependencies : predecessors,
    chainCapablePredecessors:
      typeof meta.chainCapablePredecessors === 'number' ? meta.chainCapablePredecessors : predecessors,
    degradedPredecessors:
      typeof meta.degradedPredecessors === 'number' ? meta.degradedPredecessors : 0,
    totalChars: typeof meta.totalChars === 'number' ? meta.totalChars : 0,
    anyTruncated: meta.anyTruncated === true,
  };
}

/**
 * result.json fields hoisted to the TOP LEVEL of `agent.results` responses (the MCP handler's
 * selective extraction). Colocated with the builder so the emitter and the extractor cannot drift:
 * when a new result.json signal should be visible at agent.results top level, add it HERE — the
 * handler iterates this list (2026-07-14; previously a hand-maintained inline list in
 * agent-results-handler.ts, the recurring "new field silently stripped" trap).
 */
/**
 * ⚠️ `containmentDisposition` IS DELIBERATELY NOT ON THIS LIST, and adding it would be a no-op.
 *
 * It is not a top-level key. It is assigned **nested inside the fact** — `fact.containmentDisposition`
 * (`derivation-containment-enrichment.ts:301`) — so it reaches consumers by riding on
 * `derivationContainment`, which this whitelist hoists **verbatim**.
 *
 * The consequence, which is the part worth knowing before editing anything here: **promoting
 * `containmentDisposition` to a sibling of `derivationContainment` would silently strip it.** This is a
 * strict whitelist — unlisted keys are dropped without error — and the disposition is what tells the
 * program tier that a decision was delegated to it. Losing it does not look like a failure; the card
 * simply stops saying anything about it, which is precisely the "delegated a decision without naming the
 * subject" state VT-14 item 3 is about (public repo, `verification/tests/`).
 *
 * Pinned by E3b in `scripts/test-execution-artifacts-parity.ts`.
 *
 * `contractPropagation` (added 2026-08-26) is listed for the same reason as `dialectLint`: it is a
 * gate-readable fact about whether a leg's children received the binding contract at all, and a
 * consumer must be able to read it head-slice-safe. Sub-fields nest INSIDE it.
 *
 * `dialectLint` (added 2026-08-25, Phase 2 wiring) is listed DELIBERATELY, as a first-class fact —
 * not nested. The E3b lesson is that a SUB-FIELD of a whitelisted key must live inside it rather
 * than beside it; it does not forbid new top-level facts, it forbids UNLISTED ones. A reviewer or
 * gate has to be able to read this head-slice-safe, exactly like `derivationContainment`, so it
 * earns a slot rather than riding inside an unrelated key. If a sub-field is ever added to it
 * (a disposition, a severity), nest it INSIDE `dialectLint` — the same trap, one level down.
 */
export const RESULT_JSON_SUMMARY_KEYS = ['toolLoop', 'confidenceScore', 'reviewerVerdict', 'derivationContainment', 'dialectLint', 'contractPropagation', 'protocolInjection', 'qualityMetrics'] as const;

/** Pick the RESULT_JSON_SUMMARY_KEYS fields present on a parsed result.json (null/undefined skipped). */
export function pickResultJsonSummary(parsed: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const key of RESULT_JSON_SUMMARY_KEYS) {
    if (parsed[key] != null) summary[key] = parsed[key];
  }
  return summary;
}

export function buildExecutionResultJson(input: ExecutionResultJsonInput): Record<string, unknown> {
  const {
    taskId, taskTitle, agentRole, modelUsed, finalResponse, confidenceScore,
    confidenceCapped, originalConfidence,
    executionDegradation, protocolValidation, harnessContext,
    chainedContext, protocolInjection,
    turnCount, maxToolTurns, toolCallResults, successfulToolCalls, failedToolCalls,
    executionTime, tokensUsed, mcpFunctions,
    correctionTurnUsed, diagnosticRetryUsed = false, budgetFailFastUsed = false,
    truncationRetryUsed = false, truncationRetryRecovered = false,
    extensions = {},
    logger, executionId,
  } = input;

  // 9th trust signal (2026-07-14): the reviewer's terminal-verdict FACT, transcribed by the shared
  // parser (Protocol 10 — a transcription of what the terminal `## VERDICT:` block said, never a
  // platform judgment). Role-gated; parsed INSIDE the canonical builder so dual-path parity is
  // structural (Bug Class 75 lesson — an external wiring site is how the stream path drifted before).
  const reviewerVerdict = REVIEWER_ROLES.has(agentRole) ? parseReviewerVerdict(finalResponse) : null;

  // FIELD ORDER IS A CONTRACT, not cosmetics: SYNTHESIZE reads this artifact through HEAD-SLICE caps
  // (fetch 50KB → tool-loop 8KB), so anything emitted after a long `finalResponse` (~12KB for a
  // reviewer) is invisible to the orchestrator on a single fetch (the 2026-07-14 verdict-misread
  // incident mechanism). Rule: EVERY compact field — identity, confidence, the whole trust-signal
  // stack, metrics — is emitted BEFORE finalResponse; only the bulky payloads (finalResponse,
  // toolCalls, stream extensions) go after. Order pinned by test-execution-artifacts-parity.ts.
  return {
    taskId,
    taskTitle,
    agentRole,
    generatedAt: new Date().toISOString(),
    modelUsed: modelUsed || 'default',
    confidenceScore,
    ...(reviewerVerdict ? { reviewerVerdict } : {}),
    ...(confidenceCapped ? { originalConfidence, confidenceCapped } : {}),
    ...(executionDegradation ? { executionDegradation } : {}),
    ...(executionDegradation?.errorCategory ? { errorCategory: executionDegradation.errorCategory } : {}),
    ...(protocolValidation ? { protocolValidation } : {}),
    // Phase 4 mode-resolver (2026-04-26): resolver-written mode + reasonCode.
    // Authoritative pre-execution mode signal. Survives budget exhaustion
    // (which blanks protocolValidation). 7th signal in the agent-output
    // trustworthiness defense stack.
    ...(harnessContext ? {
      resolvedMode: harnessContext.mode,
      resolvedReasonCode: harnessContext.reasonCode,
    } : {}),
    // 8th signal (D1, 2026-06-08): chained-context coverage. Present only when this
    // execution received chained pipeline input — lets the SYNTHESIZE gate / forensics
    // tell full-input from clipped-input runs. Emit-only (additive, no control-flow).
    ...(chainedContext ? { chainedContext } : {}),
    // 10th signal (WS1 Phase C, 2026-08-17): the protocol-injection fact — makes "which protocol
    // did this agent actually run under" answerable from the artifact (stampSource makes the F1
    // stream-snapshot class visible in prod). COMPACT → before finalResponse, per the contract.
    ...(protocolInjection ? { protocolInjection } : {}),
    qualityMetrics: {
      toolCallSuccess: {
        total: toolCallResults.length,
        succeeded: successfulToolCalls,
        failed: failedToolCalls,
      },
      totalTurns: turnCount,
      hitMaxTurns: turnCount >= maxToolTurns,
      responseLength: finalResponse?.length || 0,
    },
    // retry-band keep-best FACTS (2026-07-04, reviewed 92%): comparison inputs for the
    // synchronous self-supersession judgment + forensics. Facts only (Protocol 10) — the
    // conjunctive catastrophic rule lives at the terminal-persist comparison, not here.
    // Emitted by the canonical builder so BOTH paths carry them (dual-path parity).
    keepBestFacts: {
      deliverableChars: finalResponse?.length || 0,
      fencedBlockCount: Math.floor(((finalResponse || '').match(/```/g) || []).length / 2),
      scoreIntegrity: assessScoreIntegrity(finalResponse, confidenceScore ?? null),
    },
    toolLoop: {
      totalTurns: turnCount,
      hitMaxTurns: turnCount >= maxToolTurns,
      totalToolExecutions: toolCallResults.length,
      correctionTurnUsed,
      budgetFailFastUsed,
      diagnosticRetryUsed,
      truncationRetryUsed,
      truncationRetryRecovered,
      // F-NEW-3 (T6, 2026-07-17): tool calls that RETURNED an MCP error envelope while keeping
      // success=true (the §L expected-denial contract). Without this a dead connected service is
      // INVISIBLE in structured facts — see countToolErrorResults() for the full rationale.
      // Emit-only fact (Protocol 10): no consumer, no control-flow, `success` semantics untouched.
      toolErrorResultCount: countToolErrorResults(toolCallResults),
    },
    executionTime: executionTime ?? 0,
    tokensUsed: tokensUsed ?? 0,
    mcpToolsProvided: mcpFunctions
      ? mcpFunctions.map(f => f.name)
      : [...new Set(toolCallResults.filter(t => t.success).map(t => t.tool).filter((t): t is string => !!t))],
    // ── Bulky payloads ONLY below this line ─────────────────────────────────────────────
    finalResponse: finalResponse || '',
    toolCalls: truncateToolCallResults(toolCallResults, executionId, logger),
    // Path-specific extensions — emitted only when provided.
    // Stream path uses Vercel AI SDK which exposes these as response fields;
    // engine path uses Anthropic SDK directly and does not surface them.
    ...(extensions.functionCall !== undefined ? { functionCall: extensions.functionCall } : {}),
    ...(extensions.webSearchResults !== undefined ? { webSearchResults: extensions.webSearchResults } : {}),
    ...(extensions.citations !== undefined ? { citations: extensions.citations } : {}),
    ...(extensions.searchQueries !== undefined ? { searchQueries: extensions.searchQueries } : {}),
  };
}
