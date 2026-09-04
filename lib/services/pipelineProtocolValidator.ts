/**
 * Pipeline Harness Protocol Step Validator (task #91)
 *
 * Engine-side post-execution validator that detects when a Pipeline Harness
 * execution skipped or partially completed required protocol steps. Adds a
 * machine-readable `protocolValidation` signal to `result.json` when
 * mismatches are detected.
 *
 * **Why:** The 2026-04-16 artifact-synthesis incident: harness made 3
 * `task.create` calls but only 2 `agent.assign` calls (third was rejected by
 * token budget limiter), then exited with `end_turn`. The pipeline stalled —
 * the third child sat with `agentTemplateId=NULL` forever. The execution
 * itself stored as SUCCESS (the harness "completed" CREATE mode) but the
 * structural outcome was broken. P3-P7 detection signals catch the *symptom*
 * (BUDGET_EXHAUSTED, TOOL_LOOP_DEGRADED) but not the *structural defect*
 * (children created without templates).
 *
 * This validator inspects the actual tool-call transcript against the
 * required signature for each harness mode (CREATE / ORCHESTRATE / SYNTHESIZE
 * — see `scripts/seed-protocol-prompts.ts`) and flags missing steps. It is
 * additive — does NOT change SUCCESS/FAILED control flow, just adds a
 * structured signal the GUI and downstream agents can read.
 *
 * **Design philosophy** — same as P3-P7: machine-readable signals, no control
 * flow changes, cheap (pure function over already-collected data, ~1ms).
 *
 * **Specialist:** pipeline-harness-specialist domain knowledge captured at
 * `.claude/agents/pipeline-harness-specialist.md` §3 (Three-Mode Execution
 * Model). Step signatures derived from `scripts/seed-protocol-prompts.ts`
 * lines 100-316.
 */

/**
 * Tool-call entry shape (subset of agent_executions.context.toolCalls used by
 * the validator). The full shape includes `result`, `durationMs`, `timestamp`,
 * `server` etc — none of which the validator needs.
 */
export interface ToolCallEntry {
  tool: string; // e.g., 'perform' or 'project'
  success: boolean;
  arguments?: {
    action?: string; // e.g., 'task.create' / 'agent.assign' / 'stage.create'
    [key: string]: any;
  };
  error?: string;
}

/**
 * Per-action successful-call counts. Only successful calls count toward step
 * completion — a failed `agent.assign` does NOT mark Step 5 as done.
 */
type ToolCallSummary = Record<string, number>;

export type HarnessMode = 'CREATE' | 'ORCHESTRATE' | 'SYNTHESIZE' | 'UNKNOWN';

/**
 * Comment-content validation (added 2026-04-25).
 *
 * The tool-call counter knows that a task.comment was made; it doesn't know
 * what was IN it. The protocol mandates specific content for the closing
 * comment of CREATE / ORCHESTRATE / SYNTHESIZE modes — the breadcrumb on
 * line 1 (parsed by the GUI's Pipeline Children panel), the deliverable
 * pointer (SYNTHESIZE only), and the re-run note (SYNTHESIZE only). Phase 0
 * production data showed ~30% breadcrumb compliance (16/54 PIPELINE comments).
 * This struct surfaces per-pattern presence so forensic queries can
 * distinguish "agent forgot the breadcrumb" from "agent fabricated completion."
 * Currently consumed by the daily-email's clobber-detection metrics +
 * pipeline-harness-discovery.md Phase 10 (forensic surface). Complements the
 * pre-execution `harnessModeResolver` (`lib/services/harnessModeResolver.ts`,
 * 2026-04-26) which provides the AUTHORITATIVE pre-execution mode; this
 * post-execution validator is the secondary signal that confirms agent
 * compliance with the protocol's procedural steps.
 *
 * (Note: the original "PD.5 sentinel evaluation" reference here pointed at
 * the legacy-stage soft-warn 30-day sunset, which closed early on 2026-04-25
 * via UAT backfill. The struct's value persists — it's now part of the
 * forensic stack.)
 *
 * See: cline_docs/reviews/harness-clobber-detection-2026-04-25/ Item 14
 * (post-deploy validator extension); cline_docs/reviews/mode-detection-out-of-llm-turn-2026-04-26/
 * (resolver complement).
 */
export interface CommentValidation {
  /** Whether the LAST successful task.comment was checked. False if no
   *  comments were posted (the tool-count check above will already flag that). */
  inspected: boolean;
  /** First 200 chars of the LAST task.comment text, for forensic logging. */
  lastCommentPreview?: string;
  /** Breadcrumb on first line. Required in CREATE / ORCHESTRATE / SYNTHESIZE. */
  hasBreadcrumb?: boolean;
  /** 📄 Final deliverable pointer present anywhere. Required in SYNTHESIZE only. */
  hasDeliverablePointer?: boolean;
  /** Re-run note present (near-verbatim). Required in SYNTHESIZE only. */
  hasRerunNote?: boolean;
}

export interface ProtocolValidationResult {
  mode: HarnessMode;
  missingSteps: string[];
  toolCallSummary: ToolCallSummary;
  /** Convenience numbers for the most common mismatch (CREATE step 4 vs 5). */
  expectedChildCount?: number;
  actualAssignedCount?: number;
  /** Comment-content validation (added 2026-04-25). */
  commentValidation?: CommentValidation;
}

/**
 * Comment-content regex patterns (2026-04-25).
 *
 * BREADCRUMB_RE: matches `**Child stage:** \`<id>\` — <name>` on the first
 *   non-blank line. The `<id>` portion is a CUID (lowercase alphanumeric).
 *   Required by CREATE / ORCHESTRATE / SYNTHESIZE final comments.
 *
 * DELIVERABLE_POINTER_RE: matches the strict bold form
 *   `**📄 Final deliverable:**`. Required by SYNTHESIZE final comment.
 *
 * RERUN_NOTE_RE: matches the protocol's near-verbatim re-run guidance,
 *   tolerating formatting variations. Required by SYNTHESIZE final comment.
 */
const BREADCRUMB_RE = /^\s*\*\*Child stage:\*\*\s+`[a-z0-9]+`/m;
const DELIVERABLE_POINTER_RE = /\*\*📄?\s*Final deliverable:?\*\*/i;
const RERUN_NOTE_RE = /pipeline is COMPLETE[^\n]*re-run|create a fresh PIPELINE task/i;

/**
 * Extract the LAST successful task.comment's text. The final/closing comment
 * is the one whose content the protocol mandates (breadcrumb on line 1,
 * deliverable pointer, re-run note). Earlier comments (mode-detection,
 * intermediate progress) have looser content rules.
 */
function extractLastTaskCommentText(toolCallResults: ToolCallEntry[]): string | null {
  for (let i = toolCallResults.length - 1; i >= 0; i--) {
    const tc = toolCallResults[i];
    if (!tc.success) continue;
    if (tc.arguments?.action !== 'task.comment') continue;
    const comment = tc.arguments?.parameters?.comment ?? tc.arguments?.comment;
    if (typeof comment === 'string') return comment;
  }
  return null;
}

/**
 * Tally successful tool calls by their `arguments.action` discriminator.
 * Failed calls (success=false) are EXCLUDED — they don't count as step
 * completion. The artifact-synthesis case: 2 successful `agent.assign` + 1
 * failed `agent.assign` should yield `agent.assign: 2`, not 3.
 */
function summarizeToolCalls(toolCallResults: ToolCallEntry[]): ToolCallSummary {
  const summary: ToolCallSummary = {};
  for (const tc of toolCallResults) {
    if (!tc.success) continue;
    const action = tc.arguments?.action;
    if (typeof action === 'string') {
      summary[action] = (summary[action] || 0) + 1;
    }
  }
  return summary;
}

/**
 * Detect harness mode from the tool-call signature. Cannot use task metadata
 * because validator runs against an immutable snapshot post-execution; tool
 * calls are the authoritative record of what the agent actually did.
 *
 * - CREATE: hallmark is `stage.create` (opened a child stage). HARNESS_NO_OUTPUT
 *   panel fix (2026-07-17): previously required BOTH stage.create AND task.create,
 *   which made the detector INVERTED for the failure it was built to catch — a
 *   harness that died between stage.create and task.create (the live specimen)
 *   classified UNKNOWN and the validator declined to judge. The worse the CREATE
 *   failure, the more invisible. stage.create alone now classifies CREATE (after
 *   the SYNTHESIZE check, so a completed harness stays SYNTHESIZE); the missing
 *   task.create then surfaces as Step 4 instead of silencing the whole validator.
 * - SYNTHESIZE: hallmark is `task.complete` (closed the harness itself)
 * - ORCHESTRATE: only `agent.assign` and/or `task.update` calls (finished
 *   half-set-up children without creating new ones or completing the harness)
 * - UNKNOWN: no recognizable harness pattern — likely a non-PIPELINE task or
 *   a degenerate harness run that didn't make any structural calls
 */
function detectHarnessMode(summary: ToolCallSummary): HarnessMode {
  if ((summary['task.create'] || 0) > 0 && (summary['stage.create'] || 0) > 0) {
    return 'CREATE';
  }
  if ((summary['task.complete'] || 0) > 0) {
    return 'SYNTHESIZE';
  }
  if ((summary['stage.create'] || 0) > 0) {
    // Half-CREATE: stage opened, no children yet (and not completed). The
    // specimen shape — stage.create + task.comment only — lands here.
    return 'CREATE';
  }
  if ((summary['agent.assign'] || 0) > 0 || (summary['task.update'] || 0) > 0) {
    return 'ORCHESTRATE';
  }
  return 'UNKNOWN';
}

/**
 * Validate a Pipeline Harness execution's tool-call transcript against the
 * required step signature for the detected mode.
 *
 * Returns `null` when no protocol mismatch detected (the happy path) OR when
 * the execution doesn't look like a harness run at all (UNKNOWN mode — e.g.,
 * called on a non-PIPELINE execution).
 *
 * Returns `ProtocolValidationResult` when one or more required steps are
 * missing. Caller should set `errorCategory: 'PROTOCOL_STEP_SKIPPED'` only
 * when no higher-priority degradation category matched (BUDGET_EXHAUSTED etc.
 * are more specific causes); the `protocolValidation` field can co-occur with
 * any other errorCategory for additional diagnostic depth.
 *
 * **Mode-specific required signatures** (from `scripts/seed-protocol-prompts.ts`):
 *
 * CREATE (### CREATE Mode):
 * - Step 2: `stage.create` (1)
 * - Step 3: `task.update` with metadata.pipelineStageId (1) — validator can
 *   only count `task.update` calls; cannot inspect metadata payload here
 * - Step 4: `task.create` (N — N = number of planned children)
 * - Step 5: `agent.assign` (N — must equal Step 4 count)
 * - Step 5a: `task.update` with metadata.deliverableSourceTaskId (on self)
 *   AND metadata.suppressDefaultReportMd (on leaf) — surfaced via the optional
 *   forensic P-signal when `taskContext` is provided (see A.4 below).
 * - Step 6: `task.comment` (1 — the Pipeline Queued breadcrumb)
 *
 * SYNTHESIZE (### SYNTHESIZE Mode):
 * - Step 5: `task.complete` (1) + `task.comment` (1, with deliverable pointer
 *   prose). The `artifact.create` count was retired in v3.7.0 (2026-04-28) —
 *   no handler ever implemented it; harness's pipeline-index.json + extracted
 *   report.md are produced automatically by the engine's metadata-driven policy.
 *
 * ORCHESTRATE: variable shape; minimal validation — needs `task.comment`
 * for the exit breadcrumb at minimum.
 *
 * **Note on the 4-point completion invariant** (added 2026-04-25):
 *   The handler-side completion gate (`task-complete-handler.ts:148-208` and
 *   `task-update-handler.ts:380-457`) now enforces a 4-point invariant —
 *   the existing 3 points (pipelineStageId set, child stage non-empty,
 *   all children terminal) PLUS a back-pointer match check
 *   (`stages.metadata.harnessTaskId === <self.id>`). This validator
 *   architecturally cannot do the 4th check because it only receives
 *   `toolCallResults`, not DB state — the back-pointer lives in the
 *   `stages` table, not the tool-call sequence. The handler is the
 *   structural enforcement point for that gate.
 *   See: cline_docs/reviews/harness-clobber-detection-2026-04-25/
 */
/**
 * Optional task-context passed by the engine for forensic P-signals that
 * inspect task state (not just tool-call results). Pure function shape
 * preserved — when omitted, the additional checks are skipped.
 */
export interface ValidatorTaskContext {
  type?: string | null;
  metadata?: unknown;
  createdAt?: Date;
  /**
   * Platform-resolved harness mode (harnessModeResolver, stamped pre-execution).
   * HARNESS_NO_OUTPUT panel + pipeline-harness-specialist ruling (2026-07-17):
   * used ONLY to rescue an UNKNOWN inference — NEVER to override a confident
   * one. Authoritative resolvedMode would false-flag pov-program PLAN-SPAWN on
   * EVERY run (it resolves SYNTHESIZE by all-terminal reasonCode but does
   * CREATE-shaped work BY DESIGN, deliberately never calling task.complete —
   * seed-protocol-prompts.ts ~:2468); inference correctly reads it as
   * ORCHESTRATE. The one shipped protocol where resolved-mode and step-profile
   * legitimately diverge is exactly why inference stays primary.
   */
  resolvedMode?: string | null;
}

export function validatePipelineProtocolSteps(
  toolCallResults: ToolCallEntry[],
  taskContext?: ValidatorTaskContext
): ProtocolValidationResult | null {
  if (!toolCallResults || toolCallResults.length === 0) return null;

  const summary = summarizeToolCalls(toolCallResults);
  let mode = detectHarnessMode(summary);
  const rm = taskContext?.resolvedMode;
  if (mode === 'UNKNOWN' && (rm === 'CREATE' || rm === 'SYNTHESIZE' || rm === 'ORCHESTRATE')) {
    // UNKNOWN-only rescue (see ValidatorTaskContext.resolvedMode doc): a run
    // with no structural calls at all (e.g. comments only) is judged against
    // the mode the platform resolved for it.
    mode = rm;
  }
  if (mode === 'UNKNOWN') return null;

  const missingSteps: string[] = [];
  const result: ProtocolValidationResult = {
    mode,
    missingSteps,
    toolCallSummary: summary,
  };

  if (mode === 'CREATE') {
    const stageCreates = summary['stage.create'] || 0;
    const taskUpdates = summary['task.update'] || 0;
    const taskCreates = summary['task.create'] || 0;
    const agentAssigns = summary['agent.assign'] || 0;
    const taskComments = summary['task.comment'] || 0;

    if (stageCreates < 1) {
      missingSteps.push('Step 2: stage.create not called — child stage was not created');
    }
    if (taskUpdates < 1) {
      missingSteps.push('Step 3: task.update not called — metadata.pipelineStageId may not be wired (auto-retrigger will not fire)');
    }
    if (taskCreates < 1) {
      missingSteps.push('Step 4: no task.create calls — no children created');
    }
    if (agentAssigns < taskCreates) {
      missingSteps.push(
        `Step 5: ${taskCreates} children created but only ${agentAssigns} agent.assign calls succeeded — ${taskCreates - agentAssigns} child(ren) left untemplated and cannot be queued for execution`
      );
    }
    if (taskComments < 1) {
      missingSteps.push('Step 6: no task.comment for the Pipeline Queued breadcrumb (GUI Pipeline Children panel will not render)');
    } else {
      // Content check: closing CREATE comment must lead with the breadcrumb.
      // GUI Pipeline Children panel parses the breadcrumb to render the panel.
      // If comment text isn't in the ToolCallEntry payload (test fixtures
      // sometimes strip it), skip the content check gracefully — the count
      // check above already covered "no comment at all".
      const lastComment = extractLastTaskCommentText(toolCallResults);
      if (lastComment !== null) {
        const cv: CommentValidation = {
          inspected: true,
          lastCommentPreview: lastComment.slice(0, 200),
          hasBreadcrumb: BREADCRUMB_RE.test(lastComment),
        };
        result.commentValidation = cv;
        if (!cv.hasBreadcrumb) {
          missingSteps.push(
            'Step 6 (content): final task.comment lacks the `**Child stage:** `<id>`` breadcrumb on its first line — GUI Pipeline Children panel will not render correctly. Per Phase 0 baseline (~30% compliance), this is the most common protocol miss; consumers should treat its absence as routine, not as fabrication evidence.'
          );
        }
      }
    }

    result.expectedChildCount = taskCreates;
    result.actualAssignedCount = agentAssigns;
  } else if (mode === 'SYNTHESIZE') {
    const taskComplete = summary['task.complete'] || 0;
    const taskComments = summary['task.comment'] || 0;

    // A.4 forensic P-signal (2026-04-28): when taskContext is provided AND the
    // task is a post-deploy PIPELINE harness, warn if no deliverableSourceTaskId
    // was set — Step 5a was likely skipped in CREATE. Forensic only — does NOT
    // gate status. The engine extraction (Phase B) will produce an error-header
    // report.md; the customer's deliverable pointer will land but content is
    // degraded. This signal helps spot the 30%-baseline misses early.
    if (taskContext && taskContext.type === 'PIPELINE') {
      const meta =
        taskContext.metadata &&
        typeof taskContext.metadata === 'object' &&
        !Array.isArray(taskContext.metadata)
          ? (taskContext.metadata as Record<string, unknown>)
          : {};
      const POST_DEPLOY = new Date('2026-04-28T00:00:00Z');
      const isPostDeploy = taskContext.createdAt
        ? taskContext.createdAt > POST_DEPLOY
        : false;
      const hasPipelineRole = typeof meta.pipelineStageId === 'string';
      if (
        isPostDeploy &&
        hasPipelineRole &&
        typeof meta.deliverableSourceTaskId !== 'string'
      ) {
        missingSteps.push(
          'Step 5a (CREATE): harness has no metadata.deliverableSourceTaskId — Step 5a was likely skipped, customer deliverable pointer will resolve to engine-extracted error-header report.md (degraded)'
        );
      }
    }

    if (taskComplete < 1) {
      missingSteps.push('Step 5: task.complete not called — harness did not close itself; will retrigger again or stay IN_PROGRESS');
    }
    if (taskComments < 1) {
      missingSteps.push('Step 5: no final task.comment with deliverable pointer + quality gates');
    } else {
      // Content check: SYNTHESIZE final comment must have breadcrumb on
      // line 1, the 📄 Final deliverable pointer, and the re-run note.
      // Misses are common (Phase 0 baseline ~30% on the breadcrumb alone)
      // and the sentinel evaluation uses these signals to distinguish
      // "agent forgot the format" from "agent fabricated completion".
      // Skip gracefully if comment text isn't extractable (count covers no-comment).
      const lastComment = extractLastTaskCommentText(toolCallResults);
      if (lastComment !== null) {
        const cv: CommentValidation = {
          inspected: true,
          lastCommentPreview: lastComment.slice(0, 200),
          hasBreadcrumb: BREADCRUMB_RE.test(lastComment),
          hasDeliverablePointer: DELIVERABLE_POINTER_RE.test(lastComment),
          hasRerunNote: RERUN_NOTE_RE.test(lastComment),
        };
        result.commentValidation = cv;
        if (!cv.hasBreadcrumb) {
          missingSteps.push(
            'Step 5 (content): SYNTHESIZE final task.comment lacks the `**Child stage:** `<id>`` breadcrumb on its first line — same UX impact as CREATE.'
          );
        }
        if (!cv.hasDeliverablePointer) {
          missingSteps.push(
            'Step 5 (content): SYNTHESIZE final task.comment is missing the `**📄 Final deliverable:**` pointer — users have no unambiguous way to find THE customer-facing deliverable artifact.'
          );
        }
        if (!cv.hasRerunNote) {
          missingSteps.push(
            'Step 5 (content): SYNTHESIZE final task.comment is missing the re-run note — users may try to flip the task back to OPEN instead of creating a fresh PIPELINE task.'
          );
        }
      }
    }
  } else if (mode === 'ORCHESTRATE') {
    // ORCHESTRATE shape is variable — the only thing we can reliably check is
    // the exit comment. Whether enough agent.assign / task.update calls were
    // made depends on what was missing at the start, which the validator
    // can't reconstruct from the tool log alone.
    const taskComments = summary['task.comment'] || 0;
    if (taskComments < 1) {
      missingSteps.push('Step 4: no task.comment for Setup Completed breadcrumb');
    } else {
      // ORCHESTRATE is Branch B by definition (pipelineStageId is set), so
      // its final comment must lead with the breadcrumb same as CREATE.
      // Skip gracefully if comment text isn't extractable.
      const lastComment = extractLastTaskCommentText(toolCallResults);
      if (lastComment !== null) {
        const cv: CommentValidation = {
          inspected: true,
          lastCommentPreview: lastComment.slice(0, 200),
          hasBreadcrumb: BREADCRUMB_RE.test(lastComment),
        };
        result.commentValidation = cv;
        if (!cv.hasBreadcrumb) {
          missingSteps.push(
            'Step 4 (content): ORCHESTRATE final task.comment lacks the `**Child stage:** `<id>`` breadcrumb on its first line.'
          );
        }
      }
    }
  }

  if (missingSteps.length === 0) return null;
  return result;
}
