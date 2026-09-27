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
import { extractReExecutedChildIds, type ToolCallLike } from '../agents/harness/re-execution-exit';

export interface ToolCallEntry {
  tool: string; // e.g., 'perform' or 'project'
  success: boolean;
  arguments?: {
    action?: string; // e.g., 'task.create' / 'agent.assign' / 'stage.create'
    [key: string]: any;
  };
  error?: string;
  /** The tool result as persisted — read ONLY to exclude `isError` refusals (RWF A4). */
  result?: unknown;
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
  /**
   * The run was a SANCTIONED HALT and step validation DOES NOT APPLY (2026-09-15).
   * Emitted as a positive fact rather than returning null, because the artifact
   * omits `protocolValidation` entirely when it is null and every consumer is
   * instructed to read that absence as "no issues detected" — which would make a
   * harness that correctly refused to act indistinguishable from a flawless run.
   * Present ⇒ `missingSteps` is empty and NO degradation is raised. (Protocol 10:
   * ship the fact; silence is a verdict nobody can audit.)
   */
  haltExempt?: true;
  /** Which stamp earned the exemption, for forensics. */
  haltReason?: string;
  /**
   * SYNTHESIZE ended in a SANCTIONED ESCALATED EXIT (2026-09-16): this run stamped
   * `qualityGate.outcome: 'escalated'` and did not close its own task, which is what the
   * protocol INSTRUCTS at both tiers. Emitted as a positive fact so "exited correctly on
   * escalation" is distinguishable from "forgot to close" — silence would make the two
   * identical, which is the haltExempt lesson one phase later.
   */
  escalatedExit?: true;
  /**
   * SYNTHESIZE ended in a SANCTIONED RE-EXECUTE EXIT (RWF A4, 2026-09-26): this run dispatched a child
   * re-execution (the 50–69 band) and exited without closing its task — which is what the protocol
   * instructs ("a run that re-executes a child ENDS here"). Before RWF this was graded
   * PROTOCOL_STEP_SKIPPED ("Step 5: task.complete not called"), a sanctioned exit read as a skipped step:
   * 6 of the 7 prod SYNTHESIZE runs that ever re-executed a child. `childTaskIds` = the children
   * dispatched; `kind` is 'blind' (the only kind until RWF Stage 3). Emitted even with zero misses.
   * ⚠️ m3: ANY future "SYNTHESIZE did not close itself" check must exempt this exactly as it exempts
   * `escalatedExit` (pinned by test-pipeline-protocol-validator).
   */
  reExecutionExit?: { kind: 'blind'; childTaskIds: string[] };
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
const BREADCRUMB_RE = /^\s*(?:\*\*)?Child stage:(?:\*\*)?\s+`?[a-z0-9]+`?/m;
// Accepts `**Child stage:** \`<id>\`` AND the plain `Child stage: <id>` — the
// breadcrumb is the FACT that the harness named its child stage, not the
// markdown around it. Relaxed 2026-09-15: a run whose comment literally began
// "Child stage: cmty0x9jo..." scored hasBreadcrumb:false and was degraded for it.
// Nothing parses this string — the GUI Pipeline Children panel is metadata-only
// (PipelineTab.tsx localFallbackContext reads metadata.pipelineStageId), so the
// "panel will not render" rationale in the step messages below was already stale.
const DELIVERABLE_POINTER_RE = /\*\*📄?\s*Final deliverable:?\*\*/i;
// MI-1 (2026-09-27, mechanism inventory): the protocol asks for the note "verbatim (or near-verbatim)", and its purpose
// is to stop a reader flipping the task back to OPEN. The two exact phrasings alone rejected 28 of 46 flagged runs that
// DID carry it in paraphrase ("**Complete, cannot re-run in place.**", "cannot be re run in place"). The third arm is
// the property those share — an explicit "cannot be re-run" — replayed over 437 prod SYNTHESIZE comments with 0
// regressions. Deliberately NOT a bare "fresh PIPELINE task" arm: that also matches ADVICE ("spin a fresh PIPELINE task
// for a clean report.md"), which is not the note.
const RERUN_NOTE_RE = /pipeline is COMPLETE[^\n]*re-run|create a fresh PIPELINE task|\b(?:cannot|can['’]t|can not)\s+(?:be\s+)?re[- ]?run\b/i;

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
    // THREE live shapes, and the third was silently skipped until 2026-09-16:
    //   1. flat      `arguments.comment`                       (1272 calls)
    //   2. object    `arguments.parameters.comment`            (  59 calls)
    //   3. JSON STR  `arguments.parameters` is a STRING        ( 813 calls, 319 executions)
    // Shape 3 is 38% of all task.comment calls. `("…").comment` is `undefined`, so the caller's
    // "skip gracefully if comment text isn't extractable" branch ran — meaning the breadcrumb,
    // deliverable-pointer and re-run-note content checks NEVER RAN on more than a third of runs.
    // Found by replaying a LIVE-SHAPED transcript rather than a hand-built fixture; the hand-built
    // ones all used shape 1 or 2. (This also means the oft-cited "~30% breadcrumb compliance"
    // baseline was measured on a biased sample — re-measure before citing it again.)
    const params = tc.arguments?.parameters;
    let fromParams: unknown = (params && typeof params === 'object') ? (params as { comment?: unknown }).comment : undefined;
    if (fromParams === undefined && typeof params === 'string') {
      try {
        const parsed = JSON.parse(params) as { comment?: unknown };
        fromParams = parsed?.comment;
      } catch {
        fromParams = undefined;   // genuinely unparseable — the graceful skip still applies
      }
    }
    const comment = (typeof fromParams === 'string' ? fromParams : undefined) ?? tc.arguments?.comment;
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
  if ((summary['agent.assign'] || 0) > 0 || (summary['task.create'] || 0) > 0) {
    // Real orchestration activity: handed work to children (`agent.assign`) or
    // created them (`task.create` without a stage — the PLAN-SPAWN shape, which
    // the 2026-07-17 ruling requires stay ORCHESTRATE by inference).
    //
    // `task.update` used to qualify here on its own and DOES NOT any more
    // (2026-09-15). It means only "wrote a field on a task", which every mode
    // does — CREATE stamps pipelineStageId, SYNTHESIZE stamps results, and a
    // HALT stamps the reason it stopped. Measured: 11 of 12 corpus executions
    // whose graded mode disagreed with resolvedMode reached ORCHESTRATE on
    // task.update alone, and the protocol MANDATES that stamp on every bail —
    // so obeying the halt mandate was what misclassified the halt. A genuine
    // ORCHESTRATE run that only calls task.update now falls to UNKNOWN, where
    // the rescue below reads resolvedMode: ORCHESTRATE and lands on the same
    // answer honestly.
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
  /**
   * RWF A4: child task ids THIS run dispatched, from the server-written execution rows
   * (harness-dispatch-fact.ts), supplied by the core for SYNTHESIZE runs. Authoritative when present —
   * it is stage-filtered and refusal-proof. Absent (unit tests, archived replays) ⇒ the validator falls
   * back to the isError-filtered tool-call helper.
   */
  dispatchedChildIds?: string[];
}

/**
 * A halt the protocol asked for: the agent stamped WHY it stopped
 * (`metadata.cannotRun` / `metadata.duplicateHalt` — mandated on every bail),
 * opened no child stage, and did not complete itself. Such a run made no
 * structural calls BY DESIGN and cannot satisfy any mode's step profile.
 */
/**
 * Did THIS run stamp `qualityGate.outcome: 'escalated'`?
 *
 * WHY THIS IS A SANCTIONED EXIT AT BOTH TIERS — the validator does not need to know which:
 *  - STANDALONE: the base protocol says verbatim *"Leave your status IN_PROGRESS. Exit."*
 *    The escalation is RESUMABLE — fix the blocker, re-execute the child, and the harness
 *    re-enters SYNTHESIZE. A live specimen says so in its own deliverable.
 *  - PROGRAM LEG: the base protocol's "program legs only" note says the PLATFORM completes
 *    the task at persist (F20) "so the program can escalate instead of hanging on your open
 *    leg". The agent correctly does not call `task.complete` itself.
 * Either way the agent is obeying an instruction, so flagging it accuses a compliant run —
 * measured at 10 of 70 flagged executions (architectural review, 2026-09-16).
 *
 * FAIL-CLOSED: stamping `escalated` is a SELF-DECLARED FAILURE that blocks release, so this
 * exemption cannot launder an approval. It suppresses ONLY the completion miss; every other
 * Step 5 content check still applies, because an escalating harness DID do the work.
 *
 * Read from TOOL CALLS, never `taskContext.metadata` — that is the PRE-EXECUTION snapshot and
 * cannot hold a stamp this run writes (the 2026-09-15 inert-fix lesson). Scoped to
 * `task.update` so narration in a comment cannot exempt a run, and backslash-normalized
 * because `parameters` arrives as a JSON string on the live path.
 */
function stampedEscalatedThisRun(toolCallResults: ToolCallEntry[]): boolean {
  return toolCallResults.some(tc => {
    if (tc.success !== true) return false;
    const a = tc.arguments as { action?: unknown } | null | undefined;
    if (!a || typeof a !== 'object' || a.action !== 'task.update') return false;
    try {
      const blob = JSON.stringify(a).replace(/\\/g, '');
      // Both halves required: the key AND the value, so a task.update merely MENTIONING
      // qualityGate (e.g. stamping an approved outcome) cannot exempt itself.
      return blob.includes('"qualityGate"') && /"outcome"\s*:\s*"escalated"/.test(blob);
    } catch {
      return false;
    }
  });
}

function sanctionedHaltReason(
  taskContext: ValidatorTaskContext | undefined,
  summary: ToolCallSummary,
  toolCallResults: ToolCallEntry[]
): string | null {
  const md = (taskContext?.metadata && typeof taskContext.metadata === 'object')
    ? (taskContext.metadata as Record<string, unknown>)
    : {};

  // TOOL CALLS ARE AUTHORITATIVE. `taskContext.metadata` is the PRE-EXECUTION snapshot —
  // it is captured before the agent loop runs, so a halt stamped by the agent DURING the
  // run (its own `task.update`, which the protocol mandates on every bail) is NEVER in it.
  // Found live 2026-09-15 on cmu2f6w6c0001yxt5s6l6ftrw: a correct duplicate halt still
  // emitted PROTOCOL_STEP_SKIPPED because the exemption was keyed on the stale snapshot.
  // This module's own header says it — "tool calls are the authoritative record of what
  // the agent actually did" — and the first implementation read past it. Unit tests passed
  // metadata directly and so simulated a state that does not exist at the call site.
  //
  // SCOPED TO task.update DELIBERATELY: the halt's own task.comment quotes the stamp name
  // in prose ("Also stamping `metadata.duplicateHalt` now"), so an unscoped scan would
  // match narration instead of the act. `arguments` is honestly unknown here (parsed
  // object on success, raw JSON string in the parameters field on some paths), so the
  // whole entry is serialized and matched on the quoted key — which covers both shapes.
  const stampedByThisRun = (key: string): boolean =>
    toolCallResults.some(tc => {
      if (tc.success !== true) return false;
      const a = tc.arguments as { action?: unknown } | null | undefined;
      if (!a || typeof a !== 'object' || a.action !== 'task.update') return false;
      try {
        // Backslashes stripped before matching: when `parameters` arrives as a JSON STRING
        // (the live shape), serializing the wrapper escapes the inner quotes, so the blob
        // holds \"duplicateHalt\" and a naive `"duplicateHalt"` match misses it. Normalizing
        // makes the object form and the string form match identically. The quotes are KEPT
        // in the needle so this matches the KEY, never a longer name containing it.
        return JSON.stringify(a).replace(/\\/g, '').includes(`"${key}"`);
      } catch {
        return false;
      }
    });

  const stamp =
    (md.cannotRun != null || stampedByThisRun('cannotRun')) ? 'cannotRun'
    : (md.duplicateHalt != null || stampedByThisRun('duplicateHalt')) ? 'duplicateHalt'
    : null;
  if (!stamp) return null;

  // A harness that went on to open a stage or close itself is not a halt,
  // whatever it stamped along the way.
  if (md.pipelineStageId != null) return null;
  if ((summary['stage.create'] || 0) > 0) return null;
  if ((summary['task.complete'] || 0) > 0) return null;
  return stamp;
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

  // A SANCTIONED HALT is unjudgeable by step profile, in ANY mode: its correct
  // behaviour is to do nothing — no child stage, no children, no completion.
  // Re-pointing it at the right profile does not help (judged as CREATE it
  // fails on "stage.create not called", which is true and still wrong, because
  // not creating the stage was the entire point). Decline to judge instead, so
  // a correct refusal stops emitting a degradation fact that gates consume.
  const haltReason = sanctionedHaltReason(taskContext, summary, toolCallResults);
  if (haltReason) {
    return { mode, missingSteps: [], toolCallSummary: summary, haltExempt: true, haltReason };
  }

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
            'Step 6 (content): final task.comment does not name the child stage on its first line (`Child stage: <id>`, bold/backticks optional) — the human audit trail loses the link from harness to children. Per Phase 0 baseline (~30% compliance), this is the most common protocol miss; consumers should treat its absence as routine, not as fabrication evidence.'
          );
        }
      }
    }

    result.expectedChildCount = taskCreates;
    result.actualAssignedCount = agentAssigns;
  } else if (mode === 'SYNTHESIZE') {
    const taskComplete = summary['task.complete'] || 0;
    const taskComments = summary['task.comment'] || 0;
    // RWF A4: the sanctioned re-execute exit. Server-written dispatch list when the core supplied one;
    // else the isError-filtered tool-call helper. Only an UNCLOSED run is an exit.
    const reExecutedChildIds = taskContext?.dispatchedChildIds ??
      extractReExecutedChildIds(toolCallResults as unknown as ToolCallLike[]);
    const isReExecutionExit = taskComplete < 1 && reExecutedChildIds.length > 0;
    if (isReExecutionExit) result.reExecutionExit = { kind: 'blind', childTaskIds: reExecutedChildIds };
    // A re-execute pass writes NO final comment — that belongs to the later pass that finds every child
    // settled — so its comments are interim notes and their content is not graded against the final-comment
    // rules. Decided on the replay of the 6 prod runs (2026-09-26): 5 of 6 posted their Step-3 status note
    // ("Child stage: … Quality gate results (pass 1): …") on the HARNESS, not the child. Narrowing the
    // exemption to "last comment on a re-executed child" (a review suggestion) left all 6 still graded
    // PROTOCOL_STEP_SKIPPED, i.e. the live defect half-fixed.

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
      if (stampedEscalatedThisRun(toolCallResults)) {
        // Sanctioned escalated exit — the protocol instructs this at both tiers. Recorded as a
        // FACT rather than passed over in silence, so a reader can tell it from a forgotten close.
        result.escalatedExit = true;
      } else if (!isReExecutionExit) {
        // RWF A4 / m3: the re-execute exit is exempt exactly as the escalated exit is — both are
        // sanctioned ways for a SYNTHESIZE to end without closing its own task.
        missingSteps.push('Step 5: task.complete not called — harness did not close itself; will retrigger again or stay IN_PROGRESS');
      }
    }
    if (isReExecutionExit) {
      // RWF A4: a re-execute exit writes no final comment yet (the later pass does) — nothing to grade.
    } else if (taskComments < 1) {
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
            'Step 5 (content): SYNTHESIZE final task.comment does not name the child stage on its first line (`Child stage: <id>`, bold/backticks optional) — same audit-trail impact as CREATE.'
          );
        }
        // MI-1: an ESCALATED exit is told "Escalate. Do NOT synthesize. Post a comment explaining which child failed
        // quality and what the human should decide" (base protocol Step 3; pov-program likewise). It has no deliverable,
        // and "COMPLETE, cannot be re-run in place" would be FALSE on a task that stays IN_PROGRESS. So neither is
        // demanded of it; the breadcrumb still is. (Reverses the 2026-09-16 "escalated exit is NARROW" assumption that
        // both "remain meaningful" — 9 escalated exits since were flagged for exactly this.) The FACTS are still recorded.
        const escalated = result.escalatedExit === true;
        if (!cv.hasDeliverablePointer && !escalated) {
          missingSteps.push(
            'Step 5 (content): SYNTHESIZE final task.comment is missing the `**📄 Final deliverable:**` pointer — users have no unambiguous way to find THE customer-facing deliverable artifact.'
          );
        }
        if (!cv.hasRerunNote && !escalated) {
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
            'Step 4 (content): ORCHESTRATE final task.comment does not name the child stage on its first line (`Child stage: <id>`, bold/backticks optional).'
          );
        }
      }
    }
  }

  // A clean run returns null (absence = "no issues detected", the consumer contract). But an
  // ESCALATED EXIT must still surface its fact even with zero misses — otherwise "exited
  // correctly on escalation" is indistinguishable from "ran clean", which is the haltExempt
  // lesson repeating one phase later. Caught here by its own test, not in production.
  if (missingSteps.length === 0 && !result.escalatedExit && !result.reExecutionExit) return null;
  return result;
}
