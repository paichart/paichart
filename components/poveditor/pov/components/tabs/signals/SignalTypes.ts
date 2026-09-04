/**
 * TypeScript shapes for agent-output-trustworthiness defense stack signals
 * that live inside `agent_artifacts.result.json`.
 *
 * Pattern ref: .claude/knowledge/patterns/agent-output-trustworthiness-defense-stack-pattern.md
 * Source-of-truth files:
 *   - lib/services/agentExecutionEngine.ts (~line 1380: result.json assembly)
 *   - lib/services/pipelineProtocolValidator.ts (protocolValidation shape)
 *   - templateScopeMismatch: emitter RETIRED 2026-07-17 (P9 FPR ~100%); shape kept so HISTORICAL artifacts render
 *
 * IMPORTANT — design invariant:
 *   These fields are INDEPENDENT objects, NOT a discriminated union. Multiple
 *   can coexist on the same execution (cascade winner gets `errorCategory`; all
 *   detector-specific evidence fields populate independently). The happy-path
 *   invariant is: clean execution produces ONLY `toolLoop.correctionTurnUsed:
 *   false` — every other field is `undefined`. Absence = "detector ran, found
 *   nothing", NOT "detector errored out."
 */

/**
 * Cascade winner — the single most-specific category that matched.
 *
 * Effective winning order (per `agentExecutionEngine.ts:1215-1410`):
 *   P10 (unconditional override) > {P5 | P4 | P3 — mutually exclusive} > P7 > P9 > P8
 *
 * All detectors except P10 only set `errorCategory` when it is still unset;
 * P10 (self-reported marker) overwrites any prior category. The evidence
 * fields (`executionDegradation`, `protocolValidation`, `templateScopeMismatch`)
 * are added to result.json whenever their detector matched, regardless of who
 * won the cascade — a BUDGET_EXHAUSTED run can still emit `protocolValidation`.
 */
export type ErrorCategory =
  | 'TEMPLATE_MISMATCH_SELF_REPORTED' // P10 — agent self-reported via [TEMPLATE_MISMATCH] marker
  | 'BUDGET_EXHAUSTED'                // P5  — token budget hit
  | 'TOOL_LOOP_DEGRADED'              // P4  — last 2+ tool calls all failed
  | 'TOOL_FAILURES'                   // P3  — >50% tool failure rate
  | 'SILENT_REFUSAL'                  // P7  — "I cannot/unable to..."
  | 'PROTOCOL_STEP_SKIPPED'           // P8  — pipeline harness missed required steps
  | 'TEMPLATE_SCOPE_MISMATCH';        // P9  — RETIRED 2026-07-17; appears only in historical artifacts

/** P3/P4/P5/P7 — tool-execution degradation stats */
export interface ExecutionDegradation {
  errorCategory: ErrorCategory;
  degradationReason?: string;
  consecutiveTailFailures?: number;
  toolFailureRate?: number;       // percentage, e.g. 33 means 33%
  budgetError?: string;           // present when BUDGET_EXHAUSTED
}

/** P8 — pipeline harness protocol validator */
export interface ProtocolValidation {
  mode: 'CREATE' | 'ORCHESTRATE' | 'SYNTHESIZE';
  missingSteps: string[];         // human-phrased at source
  toolCallSummary?: Record<string, number>;
  expectedChildCount?: number;
  actualAssignedCount?: number;
}

/** P9 — template scope mismatch (templateType verbs vs task keywords) */
export interface TemplateScopeMismatch {
  match: false;                   // always false when populated
  templateType: string;
  templateName: string;
  reason: string;                 // human-phrased
  expectedVerbs: string[];        // pre-capped at 8 by the matcher
  taskKeywords: string[];         // pre-capped at 12 by the matcher
}

/** Metadata chrome — not faults, just diagnostic flags */
export interface ToolLoopMeta {
  correctionTurnUsed: boolean;    // #89 — anti-fabrication turn fired; always present
  totalToolCalls?: number;
  failedToolCalls?: number;
}

/** Full shape of result.json (only the fields the Pipeline tab reads) */
export interface ResultJsonSignals {
  errorCategory?: ErrorCategory | null;
  executionDegradation?: ExecutionDegradation;
  protocolValidation?: ProtocolValidation;
  templateScopeMismatch?: TemplateScopeMismatch;
  toolLoop?: ToolLoopMeta;
  confidenceCapped?: boolean;
  originalConfidence?: number;
  finalResponse?: string;
}

/** Execution row as returned by /api/agent-executions */
export interface ExecutionRow {
  id: string;
  taskId: string;
  agentRole: string;
  agentTemplateId: string | null;
  model: string | null;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMEOUT';
  startTime: string | null;
  endTime: string | null;
  duration: number | null;
  result: any;                    // partial result.json — may be null
  error: string | null;
  createdAt: string;
  updatedAt: string;
  task?: { id: string; title: string; status: string; type: string };
}

/** Artifact row as returned by /api/pov/agent/artifacts/[executionId] */
export interface ArtifactRow {
  id: string;
  name: string;                   // filter for 'result.json' to get signals
  type: string;
  content: string;                // stringified JSON for result.json
  createdAt: string;
}

/** Pipeline role classification */
export type PipelineRole = 'HARNESS' | 'CHILD' | 'NONE';

/** Task status values — matches Prisma TaskStatus enum (prisma/schema.prisma:793) */
export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';

/** Execution status values — matches Prisma ExecutionStatus enum (prisma/schema.prisma:932) */
export type ExecutionStatus =
  | 'PENDING'
  | 'READY'
  | 'RUNNING'
  | 'PENDING_REVIEW'
  | 'REVIEW_APPROVED'
  | 'REVIEW_REJECTED'
  | 'SUCCESS'
  | 'FAILED';

/**
 * One row in the `siblings` (HARNESS variant) or `peers` (CHILD variant) list.
 * Both lists share this shape; `isSelf` is set client-side for the CHILD self-row
 * that renders the `← you` marker.
 */
export interface SiblingRow {
  taskId: string;
  title: string;
  stageId: string;
  stageName: string;
  status: TaskStatus;
  executionStatus?: ExecutionStatus;
  errorCategory?: ErrorCategory | null;
}

/** Summary counts — server-computed to avoid client-side aggregation at scale */
export interface PipelineCounts {
  total: number;
  done: number;
  running: number;
  pending: number;
  failed: number;
}

/** Summary of a parent harness (CHILD variant, or nested HARNESS case) */
export interface ParentHarnessSummary {
  taskId: string;
  title: string;
  stageId: string;
}

/**
 * Pipeline context — authoritative discriminated union.
 *
 * Returned by `/api/pov/[povId]/phase/[phaseId]/pipeline-context?taskId=X` and
 * consumed by `PipelineTab.tsx` + `PipelineSiblingsBlock`. Discriminant is
 * `role`. TypeScript enforces role↔field coherence (loose optionals would not).
 *
 * Nested-pipeline case (boundary-contract review §B5): a `type='PIPELINE'`
 * task living in another harness's child stage is classified as HARNESS —
 * the `parentHarness` field on the HARNESS variant is optional for exactly
 * that case.
 *
 * NOTE — supersedes the earlier speculative shape that had `children` /
 * `childrenCount`. Server now returns the richer structured shape; this
 * type is the single source of truth.
 *
 * Design: cline_docs/reviews/pipeline-context-a6-2026-04-18/implementation-plan.md §Scope
 */
export type PipelineContext =
  | {
      role: 'HARNESS';
      childStageId: string | null;          // null when metadata malformed
      childStageName: string | null;        // null when malformed OR stage row missing
      siblings: SiblingRow[];               // always an array (empty, never omitted)
      siblingsTruncated: boolean;           // true if cap at 50 was hit
      counts: PipelineCounts;
      parentHarness?: ParentHarnessSummary; // only set for nested-pipeline case
      // 2026-04-20: harness synthesis completion signal. See the zod schema
      // in lib/validation/pipeline-context-schemas.ts for semantics.
      synthesisStatus?: 'SYNTHESIZE' | 'CREATE' | 'ORCHESTRATE' | null;
    }
  | {
      role: 'CHILD';
      parentHarness: ParentHarnessSummary;
      peers: SiblingRow[];                  // same shape as siblings; UI renders as PEERS
      peersTruncated: boolean;
      counts: PipelineCounts;
    }
  | {
      role: 'NONE';
    };

/** Helper — does this result.json have any detection signal populated? */
export function hasAnySignal(r: ResultJsonSignals | null | undefined): boolean {
  if (!r) return false;
  return !!(
    r.errorCategory ||
    r.executionDegradation ||
    r.protocolValidation ||
    r.templateScopeMismatch ||
    r.confidenceCapped
  );
}
