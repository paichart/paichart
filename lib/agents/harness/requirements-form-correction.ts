/**
 * Requirements FORM CORRECTION — "2b" of the requirements-author retrospective (2026-10-09, Steve: "2b first").
 *
 * The `requirements_author` mirror of the terraform `config_change_author` form check + correction
 * (package-form-check.ts / form-correction.ts). The CHECKS are the execution-facts port
 * (requirements-form-check.ts — pure, parity-held to the Python operator tools); THIS module owns:
 *   - the run-time INPUTS the checks need: the objective (the owning PIPELINE harness task's description, resolved
 *     through the existing `resolveOwningLeg`) and the owner's ROW-ITEM map (`metadata.requirementsRowItemMap` on that
 *     harness task — Steve 2026-10-09: carried at launch in METADATA, never in the objective text);
 *   - the STAMPED fact (`toolLoop.requirementsFormCheck` = the port's fact + `textSource` + `inputs` + `correction`);
 *   - the decision, the time budget, the ONE correction turn, the adoption rule.
 *
 * LIVE CALLER: `execution-core.ts` only (one insertion serves engine + stream), right after the package form check and
 * before `onStoringResults`/#90. The fact is stamped on EVERY eligible execution (shadow mode — the precedent's Step A
 * shape: with the flag OFF there is no behaviour change, only the fact). The turn runs only when the decision says
 * `attempted`: a checked draft with a failing TRIGGER check, no #89 pass, no budget flag,
 * `REQUIREMENTS_FORM_CORRECTION_ENABLED=true` (env, default OFF — only the literal 'true'), a resolved objective, and
 * a time budget that fits (the R4 INSUFFICIENT_TIME pattern). An ATTEMPT spends the run's one reflection pass, so #90
 * is disqualified exactly as the terraform correction does it (#89 > form > #90).
 *
 * Protocol 10: the correction message carries FACTS only — each failing check's own findings (sizes, the coverage /
 * citation / clause findings, lint hits named as candidates to read, residue counts marked not blocking). No design
 * answer, no instruction to change a decision, no "cut X". `adopted` transcribes a platform action; nothing here
 * grades the document, and there is deliberately no `publishable` field (PORT-NOTE §5 — the gate computes that).
 *
 * Record: cline_docs/reviews/requirements-author-retrospective-2026-10-09/WIRING-NOTE-2B.md.
 */

import type { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { REQUIREMENTS_PRE_CORRECTION_ARTIFACT, REQUIREMENTS_CORRECTION_NOT_ADOPTED_ARTIFACT } from './requirements-artifact-names';
import { redactExtraArtifactForPersist } from './redact-artifact-secrets';
import { addUsage, buildLlmCallOptions, reflectionErrorFact, warnReflectionError } from './agentic-tool-loop';
import type { AccumulatedUsage, NormalizedModelConfig, ReflectionErrorFact } from './agentic-tool-loop';
import type { LLMRequestOptions } from '@/lib/services/llm/types';
import { RUNTIME_LIMITS } from '@/lib/validation/runtime-limits';
import { resolveOwningLeg } from './program-protocol';
import { R10_PLACEHOLDER_RE } from './package-form-check';
import {
  analyzeRequirementsForm, computeRequirementsFormCheckFact, sectionSizes, isRegistryCausedCoverageFinding, type SectionSize,
  type RequirementsFormAnalysis, type RequirementsFormCheckFact, type RowItemMapSource,
} from './requirements-form-check';
import type { DroppedClause, RowItemMap } from './requirements-clauses';
import type { CitedUnit } from './requirements-citations';
import type { CoverageFinding } from './requirements-coverage';
import { h2Spans } from './requirements-coverage';

// ── Flag ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export const REQUIREMENTS_FORM_CORRECTION_FLAG = 'REQUIREMENTS_FORM_CORRECTION_ENABLED';

/** Default OFF. Only the literal string 'true' turns it on (same handling as FORM_CORRECTION_ENABLED). */
export function isRequirementsFormCorrectionEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[REQUIREMENTS_FORM_CORRECTION_FLAG] === 'true';
}

// ── Owner ROW-ITEM map (metadata.requirementsRowItemMap) ─────────────────────────────────────────────────────────
/**
 * The launch-time shape (fixed with the coordinator, 2026-10-09; the skill writes it):
 *   { "version": 1, "source": "answers.md", "items": { "21": ["terraform-iac.collateral"], "1": [...], ... } }
 * keys = item numbers as strings, values = arrays of row ids exactly as in the ROW-ITEM-MAP table.
 * Missing / malformed / version ≠ 1 ⇒ treated as ABSENT (the derive-from-draft fallback runs) and the state is stamped.
 */
export const OWNER_ROW_ITEM_MAP_KEY = 'requirementsRowItemMap';
export type OwnerRowItemMapState = 'present' | 'absent' | 'malformed' | 'version-unsupported';

export function parseOwnerRowItemMap(value: unknown): { map: RowItemMap | null; state: OwnerRowItemMapState; detail?: string } {
  if (value === undefined || value === null) return { map: null, state: 'absent' };
  if (typeof value !== 'object' || Array.isArray(value)) return { map: null, state: 'malformed', detail: 'not an object' };
  const v = value as Record<string, unknown>;
  if (v.version !== 1) return { map: null, state: 'version-unsupported', detail: `version ${JSON.stringify(v.version ?? null)}` };
  const items = v.items;
  if (!items || typeof items !== 'object' || Array.isArray(items)) return { map: null, state: 'malformed', detail: 'items is not an object' };
  const map: RowItemMap = new Map();
  for (const [k, rows] of Object.entries(items as Record<string, unknown>)) {
    if (!/^\d{1,3}$/.test(k)) return { map: null, state: 'malformed', detail: `item key ${JSON.stringify(k.slice(0, 20))}` };
    if (!Array.isArray(rows)) return { map: null, state: 'malformed', detail: `item ${k}: rows is not an array` };
    const set = new Set<string>();
    for (const r of rows) {
      if (typeof r !== 'string' || !r.trim()) return { map: null, state: 'malformed', detail: `item ${k}: a row id is not a non-empty string` };
      set.add(r.trim());
    }
    map.set(parseInt(k, 10), set);
  }
  return { map, state: 'present' };
}

// ── Run-time inputs ──────────────────────────────────────────────────────────────────────────────────────────────
export type ObjectiveUnresolvedReason =
  | 'no-stage' | 'no-owning-harness' | 'ambiguous-owning-harness' | 'empty-description' | 'read-error';

export interface RequirementsFormInputs {
  /** The owning harness task's description ('' when unresolved). */
  objective: string;
  objectiveResolved: boolean;
  objectiveUnresolvedReason?: ObjectiveUnresolvedReason;
  harnessTaskId: string | null;
  ownerMap: RowItemMap | null;
  ownerMapState: OwnerRowItemMapState;
  ownerMapDetail?: string;
}

export interface RequirementsInputsDb {
  task: { findUnique: (args: any) => Promise<any> };
  $queryRaw: <T = unknown>(query: Prisma.Sql) => Promise<T>;
}

/**
 * Resolve the objective + owner map for the Author's task. Uses the existing owning-leg resolver (the PIPELINE row whose
 * `metadata.pipelineStageId` is this task's stage and which carries a protocol stamp — the requirements harness is
 * stamped `requirements-authoring-protocol`). NEVER throws: every failure is a named unresolved reason.
 */
export async function resolveRequirementsFormInputs(db: RequirementsInputsDb, taskId: string): Promise<RequirementsFormInputs> {
  const unresolved = (reason: ObjectiveUnresolvedReason, harnessTaskId: string | null = null): RequirementsFormInputs =>
    ({ objective: '', objectiveResolved: false, objectiveUnresolvedReason: reason, harnessTaskId, ownerMap: null, ownerMapState: 'absent' });
  try {
    const self = await db.task.findUnique({ where: { id: taskId }, select: { stageId: true } });
    const stageId: string | null = self?.stageId ?? null;
    if (!stageId) return unresolved('no-stage');
    const leg = await resolveOwningLeg(db, stageId);
    if (leg.kind === 'none') return unresolved('no-owning-harness');
    if (leg.kind === 'ambiguous') return unresolved('ambiguous-owning-harness');
    const harness = await db.task.findUnique({ where: { id: leg.legTaskId }, select: { id: true, description: true, metadata: true } });
    return requirementsInputsFromHarnessRow(harness ?? { id: leg.legTaskId });
  } catch {
    return unresolved('read-error');
  }
}

// ── The stamped fact ─────────────────────────────────────────────────────────────────────────────────────────────
export type RequirementsTextSource = 'loop' | 'diagnostic-retry' | 'requirements-form-correction';

/** The checks whose failure EARNS a correction turn. Template residue: a live `{{` placeholder or a 🗑 mark is a defect
 *  and triggers (Steve 2026-10-09, decision 1 after 2b — Z33 was a live placeholder); author-addressed skeleton
 *  sentences are counted but never trigger, because protocol 1.8.0 tells the Author to copy them (until the template
 *  change lands). */
export const REQUIREMENTS_TRIGGER_CHECKS = ['size', 'strayRuleCitations', 'coverage', 'citations', 'clauses', 'lint',
  'residuePlaceholders', 'residueDeleteMarks'] as const;
export type RequirementsTriggerCheck = typeof REQUIREMENTS_TRIGGER_CHECKS[number];
/** Measures that must not WORSEN (rise) on adoption but never trigger. `coverageErrorsTotal` (G1 A, 2026-10-10): the
 *  TRIGGER keeps `authorActionableTotal` (the Author cannot fix registry gaps), but the GUARD counts every coverage
 *  finding — an invented row that ASKS a new decision is registry-caused (the owner's) and must not be addable unseen
 *  (execution-facts review F1, probe P6; until B-2, 2026-10-12, every invented row read "unknown key for a known
 *  token"; a restatement of item N is now Author-actionable and triggers). */
export const REQUIREMENTS_GUARD_ONLY_MEASURES = ['measuredRawDraft', 'coverageErrorsTotal'] as const;
/** DENOMINATORS that must not FALL on adoption (G1 A): deleting the measured thing must never read as a repair. A
 *  citation or a checked owner clause that disappears takes its own finding with it (probe P5).
 *  ⚠️ Rule 4 (Z66, 2026-10-12): when the caller passes the cited units (the in-run turn always does), the two CITATION
 *  counts are no longer guarded by count — see CITATION_IDENTITY_REGRESSIONS; `clausesChecked` stays a count. */
export const REQUIREMENTS_NO_FALL_MEASURES = ['citationsTotal', 'citationsVerbatim', 'clausesChecked'] as const;
/** Rule 4 (Z66): the citation counts, guarded by IDENTITY instead when the cited units are supplied. */
export const REQUIREMENTS_CITATION_COUNT_MEASURES = ['citationsTotal', 'citationsVerbatim'] as const;
export type RequirementsMeasure = RequirementsTriggerCheck | typeof REQUIREMENTS_GUARD_ONLY_MEASURES[number]
  | typeof REQUIREMENTS_NO_FALL_MEASURES[number];
/** Regression marker for a dropped clause NOT dropped before (compared by identity, not count — a swap is a regression). */
export const CLAUSE_IDENTITY_REGRESSION = 'clausesNewlyDropped' as const;
/** Rule 4 (Z66, 2026-10-12) regression markers, by identity on (scope, item) — see CitedUnit in requirements-citations.ts:
 *  `citationsNewlyUncited` = an item a scope cited before is cited nowhere in that scope after (a deleted citation);
 *  `citationsNewlyNotVerbatim` = an item a scope cited verbatim before is still cited there but by no verbatim quote.
 *  `citationsNarrowed` (Z66 review F1) = a scope still cites the item verbatim, but its verbatim quotes together cover
 *  fewer of the item's words than before — half of a multi-sentence item dropped, which the clause check cannot see
 *  when that half is not a state/list/report obligation ("nothing maintains…", "never…").
 *  Two rows of one leg citing the same item merged into one row whose quote spans both is none of these (the attempt-2
 *  correction, refused under rule 3 because citationsTotal fell 27 → 26). */
export const CITATION_IDENTITY_REGRESSIONS = ['citationsNewlyUncited', 'citationsNewlyNotVerbatim', 'citationsNarrowed'] as const;
export type CitationIdentityRegression = typeof CITATION_IDENTITY_REGRESSIONS[number];
export type RequirementsRegression = RequirementsMeasure | typeof CLAUSE_IDENTITY_REGRESSION | CitationIdentityRegression;

export type RequirementsCorrectionNotAttemptedReason =
  | 'not-checked' | 'no-failing-check' | 'prior-pass-used:anti-fabrication' | 'budget-flagged' | 'flag-off'
  | 'objective-unresolved' | 'insufficient-time';
export type RequirementsCorrectionNotAdoptedReason =
  | 'empty' | 'llm-error' | 'not-end-turn' | 'recheck-unchecked' | 'sections-changed' | 'placeholder-changed'
  | 'confidence-missing' | 'confidence-changed' | 'regressed' | 'no-improvement';

export interface RequirementsTimeBudget {
  /** Watchdog time left at the decision point (ms; may be negative). */
  remainingMs: number;
  /** SAFETY + estimated generation time of a full re-emission at the observed (discounted) throughput. */
  estimatedMs: number;
  estimatedOutputTokens: number;
  /** Output tok/s over the loop's wall clock (floor constant when unmeasurable), before the discount. */
  observedTps: number;
  /** The bound the estimate was compared against: min(remainingMs, the turn's own 600 s cap) (G5, 2026-10-10). */
  boundMs?: number;
}

export interface RequirementsCorrectionFact {
  attempted: boolean;
  notAttemptedReason?: RequirementsCorrectionNotAttemptedReason;
  /** Failing TRIGGER checks at the decision point (present whenever the draft was checked). */
  failingChecks?: RequirementsTriggerCheck[];
  /** Present when the flag was on and the time rule was evaluated (attempted or 'insufficient-time'). */
  timeBudget?: RequirementsTimeBudget;
  adopted?: boolean;
  notAdoptedReason?: RequirementsCorrectionNotAdoptedReason;
  /** The adoption rule that decided (absent on attempts decided before G1 A ⇒ rule 1). 2 = frozen row↔item map +
   *  no-fall denominators + all coverage findings guarded + clause findings by identity (2026-10-10). */
  adoptionRuleVersion?: number;
  /** Measures named by the adoption guard as WORSENED. `clausesNewlyDropped` = a dropped owner clause the original did
   *  not drop (identity, not count). ⚠️ Since rule 3 this is present on an ADOPTED correction too (the
   *  `unwaivable-cleared` arm): it records what worsened, adopted or not — never read it as "not adopted". */
  regressedMeasures?: RequirementsRegression[];
  /** Rule 3: which clause of the rule adopted (a transcription of the branch). Absent when not adopted. */
  adoptionArm?: RequirementsAdoptionArm;
  /** Rule 3: trigger checks that failed before and read 0 after (`before > 0 && after === 0`). */
  clearedChecks?: RequirementsTriggerCheck[];
  /** Rule 3: the owner clauses flagged after the correction and not before, by identity (capped at 12), on EVERY checked
   *  attempt, adopted or not — the publish read's list. Total beside it. */
  clausesNewlyDropped?: DroppedClause[];
  clausesNewlyDroppedTotal?: number;
  /** Rule 3: on a NOT-adopted, checked attempt, the re-check's finding LISTS (mirror of `before`; capped). */
  after?: {
    coverageErrors: CoverageFinding[]; citationFindings: string[]; droppedClauses: DroppedClause[]; lintHits: unknown[];
  };
  /** Rule 3 (1b): a not-adopted correction's text, persisted as its own operator artifact when it came back non-empty. */
  notAdoptedText?: { artifact: typeof REQUIREMENTS_CORRECTION_NOT_ADOPTED_ARTIFACT; sha256: string; chars: number; redactedCount: number };
  improvedChecks?: RequirementsTriggerCheck[];
  /** Before/after measures (attempts only). `after` is null when the corrected text could not be checked. */
  measuresBefore?: Record<RequirementsMeasure, number>;
  measuresAfter?: Record<RequirementsMeasure, number> | null;
  /** The decision-point fact's counts kept when the corrected text was ADOPTED (the top-level fact then describes the
   *  corrected, persisted text). */
  decision?: {
    sizeDelivered: number | null; coverageErrors: number | null; citationFindings: number | null;
    clausesDropped: number | null; lintHits: number | null;
  };
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  durationMs?: number;
  /** G1 B (2026-10-10): the ORIGINAL draft is persisted on every attempt as its own artifact (never inside
   *  result.json — its 40–60K would break the head-slice budget for finalResponse). Pointer = name + sha256 + length. */
  preCorrection?: { artifact: typeof REQUIREMENTS_PRE_CORRECTION_ARTIFACT; sha256: string; chars: number; redactedCount?: number };
  /** G1 B: the decision-point finding LISTS (capped as on the fact), kept because an adopted correction replaces the
   *  top-level fact with the re-check of the corrected text. */
  before?: {
    coverageErrors: CoverageFinding[]; citationFindings: string[]; droppedClauses: DroppedClause[]; lintHits: unknown[];
  };
  /** G1 (AR H1.1 / EF F2c): each `## ` section's delivered size in the program view, before and after — a
   *  transcription, so the shrink a correction made is measurable per section. `after` null when nothing was re-checked. */
  sectionSizes?: { before: SectionSize[]; after: SectionSize[] | null };
}

export { REQUIREMENTS_PRE_CORRECTION_ARTIFACT };

export interface RequirementsFormCheckStamp extends RequirementsFormCheckFact {
  textSource: RequirementsTextSource;
  inputs: {
    objective: 'owning-harness' | 'unresolved';
    objectiveUnresolvedReason?: ObjectiveUnresolvedReason;
    objectiveChars: number;
    harnessTaskId: string | null;
    ownerRowItemMap: OwnerRowItemMapState;
    ownerRowItemMapDetail?: string;
  };
  correction: RequirementsCorrectionFact;
}

function inputsOf(inp: RequirementsFormInputs): RequirementsFormCheckStamp['inputs'] {
  return {
    objective: inp.objectiveResolved ? 'owning-harness' : 'unresolved',
    ...(inp.objectiveUnresolvedReason ? { objectiveUnresolvedReason: inp.objectiveUnresolvedReason } : {}),
    objectiveChars: inp.objective.length,
    harnessTaskId: inp.harnessTaskId,
    ownerRowItemMap: inp.ownerMapState,
    ...(inp.ownerMapDetail ? { ownerRowItemMapDetail: inp.ownerMapDetail } : {}),
  };
}

/** Per-check failure measures (0 = passing). null on an unchecked fact. */
export function requirementsMeasures(f: RequirementsFormCheckFact): Record<RequirementsMeasure, number> | null {
  if (!f.checked || !f.size || !f.coverage || !f.citations || !f.clauses || !f.lint || !f.residue) return null;
  return {
    size: Math.max(0, -f.size.headroom),
    strayRuleCitations: f.size.strayRuleCitations.length,
    coverage: f.coverage.authorActionableTotal,   // stage A (b): registry-caused findings never trigger (errorsTotal keeps them)
    citations: f.citations.findingsTotal,
    clauses: f.clauses.droppedTotal,
    lint: f.lint.hitsTotal,
    residuePlaceholders: f.residue.placeholders,
    residueDeleteMarks: f.residue.deleteMarks,
    measuredRawDraft: f.size.measured === 'raw-draft' ? 1 : 0,
    coverageErrorsTotal: f.coverage.errorsTotal,
    citationsTotal: f.citations.total,
    citationsVerbatim: f.citations.verbatim,
    clausesChecked: f.clauses.checked,
  };
}

export function failingTriggerChecks(f: RequirementsFormCheckFact): RequirementsTriggerCheck[] {
  const m = requirementsMeasures(f);
  return m ? REQUIREMENTS_TRIGGER_CHECKS.filter((c) => m[c] > 0) : [];
}

/**
 * The R4 INSUFFICIENT_TIME pattern applied to a full-document re-emission. The re-emission must generate about as many
 * tokens as the deliverable turn did: `estimatedOutputTokens = max(that turn's output tokens, ceil(chars / 3))` (the
 * turn's own count includes adaptive thinking — conservative; chars/3 floors a turn with no usage). Throughput is the
 * loop's output tokens over its WALL CLOCK (tool time included ⇒ ≤ the generation rate — conservative), floor constant
 * when unmeasurable (no usage, or a loop under 10 s), discounted by TRUNCATION_RETRY_TPS_DISCOUNT; TRUNCATION_RETRY_SAFETY_MS covers TTFT + transmission.
 */
const MIN_MEASURE_MS = 10_000;
/** The correction turn's own abort cap (the same 600 s the terraform turn and #90 use). */
export const REQUIREMENTS_TURN_MAX_MS = 600_000;

export function estimateRequirementsCorrectionTime(input: {
  deadlineAt: number; now: number; loopStartedAt: number; draftChars: number;
  lastTurnOutputTokens?: number | null; totalOutputTokens?: number | null;
}): RequirementsTimeBudget {
  const elapsedMs = input.now - input.loopStartedAt;
  // A loop shorter than MIN_MEASURE_MS is not a throughput sample (a near-zero window yields an absurd rate that would
  // wave any re-emission through): the floor constant is used instead.
  const observedTps = elapsedMs >= MIN_MEASURE_MS && typeof input.totalOutputTokens === 'number' && input.totalOutputTokens > 0
    ? input.totalOutputTokens / (elapsedMs / 1000)
    : RUNTIME_LIMITS.OUTPUT_TOKENS_PER_SEC_FLOOR;
  const estimatedOutputTokens = Math.max(
    typeof input.lastTurnOutputTokens === 'number' && input.lastTurnOutputTokens > 0 ? input.lastTurnOutputTokens : 0,
    Math.ceil(input.draftChars / 3),
  );
  const genMs = (estimatedOutputTokens / (observedTps * RUNTIME_LIMITS.TRUNCATION_RETRY_TPS_DISCOUNT)) * 1000;
  return {
    remainingMs: Math.round(input.deadlineAt - input.now),
    estimatedMs: Math.round(RUNTIME_LIMITS.TRUNCATION_RETRY_SAFETY_MS + genMs),
    estimatedOutputTokens,
    observedTps: Math.round(observedTps * 10) / 10,
  };
}

/**
 * The precedence rule (mirrors decideFormCorrection): unchecked; nothing failing; #89 used; budget flag; THEN the flag
 * (so a flag-off fact never carries the later reasons); then the objective; then time. `time` is a thunk so the
 * estimate is computed (and stamped) only when the flag is on and every earlier gate passed.
 */
export function decideRequirementsFormCorrection(input: {
  fact: RequirementsFormCheckFact;
  correctionTurnUsed: boolean;
  budgetFlagged: boolean;
  enabled: boolean;
  objectiveResolved: boolean;
  time: () => RequirementsTimeBudget;
}): RequirementsCorrectionFact {
  if (!input.fact.checked) return { attempted: false, notAttemptedReason: 'not-checked' };
  const failingChecks = failingTriggerChecks(input.fact);
  if (!failingChecks.length) return { attempted: false, notAttemptedReason: 'no-failing-check', failingChecks };
  if (input.correctionTurnUsed) return { attempted: false, notAttemptedReason: 'prior-pass-used:anti-fabrication', failingChecks };
  if (input.budgetFlagged) return { attempted: false, notAttemptedReason: 'budget-flagged', failingChecks };
  if (!input.enabled) return { attempted: false, notAttemptedReason: 'flag-off', failingChecks };
  if (!input.objectiveResolved) return { attempted: false, notAttemptedReason: 'objective-unresolved', failingChecks };
  const timeBudget = input.time();
  // G5 (2026-10-10, agent-execution review F3): the turn aborts at min(TURN_MAX_MS, time left), so an estimate between
  // 600 s and the time left would be admitted into a turn certain to abort — compare against the EFFECTIVE bound.
  const boundMs = Math.min(timeBudget.remainingMs, REQUIREMENTS_TURN_MAX_MS);
  timeBudget.boundMs = boundMs;
  if (timeBudget.estimatedMs > boundMs) {
    return { attempted: false, notAttemptedReason: 'insufficient-time', failingChecks, timeBudget };
  }
  return { attempted: true, failingChecks, timeBudget };
}

/** Compute the stamp on a text (the core's single entry for the fact; never throws — the port's checker-error arm). */
export function computeRequirementsFormCheckStamp(input: {
  text: string;
  stopReason: string | null | undefined;
  textSource: RequirementsTextSource;
  inputs: RequirementsFormInputs;
  onCheckerError?: (message: string) => void;
  /** G1 A: the correction re-check freezes the ORIGINAL's row↔item map (see the adoption rule). */
  frozenRowItemMap?: { map: RowItemMap; source: RowItemMapSource } | null;
}): Omit<RequirementsFormCheckStamp, 'correction'> {
  const fact = computeRequirementsFormCheckFact({
    draft: input.text, objective: input.inputs.objective, ownerRowItemMapParsed: input.inputs.ownerMap,
    frozenRowItemMap: input.frozenRowItemMap ?? null,
    stopReason: input.stopReason, onCheckerError: input.onCheckerError,
  });
  return { ...fact, textSource: input.textSource, inputs: inputsOf(input.inputs) };
}

// ── The correction prompt (facts only) ───────────────────────────────────────────────────────────────────────────
const PROMPT_MAX_PER_CHECK = 30;
const fmtN = (n: number) => n.toLocaleString('en-US');

function renderCoverageFinding(f: CoverageFinding): string {
  return Object.entries(f).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`).join('; ');
}

function capList(lines: string[]): string[] {
  return lines.length > PROMPT_MAX_PER_CHECK
    ? [...lines.slice(0, PROMPT_MAX_PER_CHECK), `(${lines.length - PROMPT_MAX_PER_CHECK} more not listed)`]
    : lines;
}

/**
 * The message (Protocol 10): counts, sizes and each check's own finding text. It never proposes a cut, a value, a
 * row, a design or a change to any decision. Built from the UNCAPPED analysis (the fact's lists are capped at 12).
 */
export function buildRequirementsCorrectionPrompt(fact: RequirementsFormCheckFact, a: RequirementsFormAnalysis): string {
  const failing = new Set(failingTriggerChecks(fact));
  const items: string[] = [];
  if (fact.size && (failing.has('size') || failing.has('strayRuleCitations'))) {
    const s = fact.size;
    const lines: string[] = [];
    if (failing.has('size')) {
      lines.push(`Size: the ${s.measured === 'program-view' ? 'program view (the document as the Program Architect reads it)' : 'draft'} measures ${fmtN(s.programViewDelivered)} delivered characters against a read limit of ${fmtN(s.limit)} — ${fmtN(-s.headroom)} over.`);
      lines.push('   Delivered characters per section, in document order:');
      for (const sec of sectionSizes(a.view)) lines.push(`   - ${sec.section}: ${fmtN(sec.delivered)}`);
    }
    if (failing.has('strayRuleCitations')) {
      lines.push(`${failing.has('size') ? '   ' : ''}Writing-rule numbers cited in the body that the program view's reading notes do not gloss: ${s.strayRuleCitations.join(', ')}.`);
    }
    items.push(lines.join('\n'));
  }
  if (failing.has('coverage')) {
    const actionable = a.coverage.errors.filter((e) => !isRegistryCausedCoverageFinding(e));   // stage A (b)
    if (actionable.length) items.push([`Coverage: ${actionable.length} finding${actionable.length === 1 ? '' : 's'} against the decision registry:`,
      ...capList(actionable.map((e) => `   - ${renderCoverageFinding(e)}`))].join('\n'));
  }
  if (failing.has('citations')) {
    items.push([`Citations: ${a.citations.findings.length} finding${a.citations.findings.length === 1 ? '' : 's'} on the item citations (${a.citations.total} citations read, ${a.citations.verbatim} verbatim):`,
      ...capList(a.citations.findings.map((f) => `   - ${f}`))].join('\n'));
  }
  if (failing.has('clauses')) {
    items.push([`Objective clauses: ${a.clauses.dropped.length} obligation clause${a.clauses.dropped.length === 1 ? '' : 's'} of the objective not found in the leg that carries the item (${a.clauses.checked} checked):`,
      ...capList(a.clauses.dropped.map((d) => `   - item ${d.item}, ${d.leg}: the clause "${d.clause}" — words not found: ${d.missing.join(', ')}`))].join('\n'));
  }
  if (failing.has('lint')) {
    items.push([`Harvested-state lint: ${a.lint.length} candidate${a.lint.length === 1 ? '' : 's'} — a value of a kind that is read from infrastructure, not declared by the objective. Each is a candidate to read, not a finding; a value the objective declares does not appear here:`,
      ...capList(a.lint.map((h) => `   - line ${h.line} (${h.kind}): \`${h.token}\``))].join('\n'));
  }
  const r = fact.residue;
  const residueLine = r
    ? `Template residue: ${r.placeholders} live \`{{\` placeholder${r.placeholders === 1 ? '' : 's'} and ${r.deleteMarks} 🗑 mark${r.deleteMarks === 1 ? '' : 's'} (each is a defect); ${r.authorAddressed} author-addressed skeleton sentence${r.authorAddressed === 1 ? '' : 's'} (counted, not blocking).`
    : null;
  return [
    '**Publish checks on your draft (platform, mechanical).**',
    '',
    'The platform ran the publish checks on your requirements.md. Each item below is a size, a count, or a check\'s own finding — not a judgement of your design, and not a change to any decision in the objective.',
    '',
    ...items.map((t, i) => `${i + 1}. ${t}`),
    ...(residueLine ? ['', residueLine] : []),
    '',
    'Re-emit your COMPLETE requirements.md — every section, with the same `## ` headings in the same order:',
    '- Every decision stays as the objective states it.',
    '- Do not mention this check in the document.',
    '- Do not call any tools — none are available on this turn.',
    '- End with your original confidence line exactly as written in your draft.',
  ].join('\n');
}

// ── The adoption rule ────────────────────────────────────────────────────────────────────────────────────────────
const CONFIDENCE_LINE_RE = /\bconfidence\b\**\s*:/i;

function lastConfidenceLine(text: string): string | null {
  const lines = text.split('\n');
  for (let k = lines.length - 1; k >= 0; k--) if (CONFIDENCE_LINE_RE.test(lines[k])) return lines[k];
  return null;
}

function headings(text: string): string {
  return h2Spans(text).map((s) => s.title.trim()).join('\u0000');
}

function placeholders(text: string): string {
  return ((text || '').match(R10_PLACEHOLDER_RE) ?? []).sort().join('\u0000');
}

/** 3 (2026-10-12, Phase 4 group 1; panel cline_docs/reviews/correction-adoption-severity-2026-10-11/): rule 2 plus the
 *  `unwaivable-cleared` arm (see checkRequirementsCorrectionAdoption).
 *  4 (2026-10-12, Z66; cline_docs/reviews/z66-adoption-duplicate-merge-2026-10-12/): rule 3 with the citation no-fall
 *  guard by IDENTITY on (scope, item) instead of by count — `citationsTotal` / `citationsVerbatim` may fall (a merged
 *  duplicate) and `regressedMeasures` may name `citationsNewlyUncited` / `citationsNewlyNotVerbatim`. */
export const REQUIREMENTS_ADOPTION_RULE_VERSION = 4;
/** The trigger checks no publish path can waive: `publish-generated-spec.py` STOPs on them with no recourse
 *  (`NON_WAIVABLE` there; a cross-file pin in scripts/test-requirements-form-correction.ts keeps the two equal). Closed
 *  and versioned: add a member only on a measured instance (residue is the named candidate). */
export const REQUIREMENTS_ADOPTION_UNWAIVABLE_CHECKS = ['size'] as const;
/** Owner decision P1 = C (2026-10-12): at most ONE newly flagged clause may ride an unwaivable-cleared adoption.
 *  ⚠️ TIGHTENING TRIGGER: the first publish-time owner read (`--clause-read`) that finds a newly flagged clause REAL —
 *  an obligation the correction actually deleted — obliges setting this to 0 in the next deploy (it returns this class
 *  to rule-2 behaviour until reviewed). Record the case in the Phase 4 decision record when it happens. */
export const REQUIREMENTS_ADOPTION_MAX_NEW_CLAUSE_FLAGS = 1;
/** Which clause of the rule adopted: no measure worsened, or the v3 arm. A transcription of the branch, not a verdict. */
export type RequirementsAdoptionArm = 'no-regression' | 'unwaivable-cleared';

/** Rule 4 (Z66): the citation identity regressions of a correction — a (scope, item) cited before and not after;
 *  cited verbatim before and only non-verbatim after; or still cited verbatim but covering fewer item words (the UNION
 *  over the scope's verbatim quotes, so one quote spanning two merged quotes, or an item split across two quotes, is
 *  neutral). Duplicates within a (scope, item) collapse, so a merge is neutral. */
export function citationIdentityRegressions(before: CitedUnit[], after: CitedUnit[]): CitationIdentityRegression[] {
  const key = (u: CitedUnit) => `${u.scope}\u0000${u.item}`;
  const index = (us: CitedUnit[]) => {
    const m = new Map<string, { verbatim: boolean; words: Set<number> }>();
    for (const u of us) {
      const e = m.get(key(u)) ?? { verbatim: false, words: new Set<number>() };
      e.verbatim = e.verbatim || u.verbatim;
      if (u.verbatim && u.words) for (let w = u.words[0]; w < u.words[0] + u.words[1]; w++) e.words.add(w);
      m.set(key(u), e);
    }
    return m;
  };
  const b = index(before), a = index(after);
  const out: CitationIdentityRegression[] = [];
  if ([...b.keys()].some((k) => !a.has(k))) out.push('citationsNewlyUncited');
  if ([...b.entries()].some(([k, v]) => v.verbatim && a.has(k) && !a.get(k)!.verbatim)) out.push('citationsNewlyNotVerbatim');
  if ([...b.entries()].some(([k, v]) => a.get(k)?.verbatim && [...v.words].some((w) => !a.get(k)!.words.has(w)))) out.push('citationsNarrowed');
  return out;
}

export interface RequirementsAdoptionResult {
  adopted: boolean;
  notAdoptedReason?: RequirementsCorrectionNotAdoptedReason;
  regressedMeasures?: RequirementsRegression[];
  improvedChecks?: RequirementsTriggerCheck[];
  measuresAfter?: Record<RequirementsMeasure, number> | null;
  /** v3: present whenever the corrected text was checked. */
  adoptionArm?: RequirementsAdoptionArm;
  clearedChecks?: RequirementsTriggerCheck[];
  clausesNewlyDropped?: DroppedClause[];
  detail?: string;
}

/**
 * ADOPTION RULE (the precedent's "no new failure, the named defect repaired", for a whole-document re-emission).
 * Conditions in order; the first failing one is named:
 *   1. no provider error, non-empty, `end_turn`;
 *   2. the corrected text CHECKS (an unchecked re-check is never adopted);
 *   3. the same `## ` headings in the same order (a section dropped to cut size is refused);
 *   4. the R10 placeholder multiset is unchanged;
 *   5. the last `Confidence:` line is present when the original had one, and byte-identical to it;
 *   6. NO measure worsens — every trigger check AND every guard-only measure (template placeholders, 🗑 marks, a
 *      lost Writing-rules section, ALL coverage findings incl. registry-caused) is ≤ its value before; every
 *      DENOMINATOR (citations total/verbatim, owner clauses checked) is ≥ its value before; and no owner clause is
 *      dropped that the original did not drop (compared by item+leg+clause). The caller re-checks the corrected text
 *      with the ORIGINAL's row↔item map frozen, so an obligation cannot vanish with the row that carried it (G1 A).
 *      Rule 4 (Z66): given `citedBefore` + `citedAfter`, the citation denominators are compared by IDENTITY — every
 *      (scope, item) cited before is still cited, and still verbatim where it was — not by count, so merging two rows
 *      of one leg that cite the same item is neutral. Without them (unit callers) the rule-3 count guard applies;
 *   7. at least one failing TRIGGER check strictly improves (otherwise nothing was repaired).
 * What this does NOT guarantee: content no check measures (a widened action, a swapped approver, a gutted section —
 * probes P2–P4) can still change. Only a read of the persisted original against the adopted text can see that.
 */
export function checkRequirementsCorrectionAdoption(input: {
  original: string;
  corrected: string | null | undefined;
  stopReason: string | null | undefined;
  providerError?: boolean;
  before: RequirementsFormCheckFact;
  after: RequirementsFormCheckFact | null;
  /** UNCAPPED dropped-clause lists (the fact's lists are capped at 12). Absent ⇒ the fact's lists are used. */
  droppedBefore?: DroppedClause[];
  droppedAfter?: DroppedClause[];
  /** Rule 4 (Z66): the UNCAPPED cited units (CitationResult.cited) of the original and the corrected text. Both present
   *  ⇒ the citation guard is by identity; either absent ⇒ the rule-3 count guard. */
  citedBefore?: CitedUnit[];
  citedAfter?: CitedUnit[];
}): RequirementsAdoptionResult {
  if (input.providerError) return { adopted: false, notAdoptedReason: 'llm-error' };
  if (!input.corrected || !input.corrected.trim()) return { adopted: false, notAdoptedReason: 'empty' };
  if (input.stopReason !== 'end_turn') return { adopted: false, notAdoptedReason: 'not-end-turn' };
  const mb = requirementsMeasures(input.before);
  const ma = input.after ? requirementsMeasures(input.after) : null;
  if (!mb || !ma) return { adopted: false, notAdoptedReason: 'recheck-unchecked', measuresAfter: ma };
  const no = (r: RequirementsCorrectionNotAdoptedReason, extra: Partial<RequirementsAdoptionResult> = {}): RequirementsAdoptionResult =>
    ({ adopted: false, notAdoptedReason: r, measuresAfter: ma, ...extra });
  if (headings(input.original) !== headings(input.corrected)) return no('sections-changed');
  if (placeholders(input.original) !== placeholders(input.corrected)) return no('placeholder-changed');
  const ca = lastConfidenceLine(input.original);
  if (ca !== null) {
    const cb = lastConfidenceLine(input.corrected);
    if (cb === null) return no('confidence-missing');
    if (cb !== ca) return no('confidence-changed');
  }
  const all = [...REQUIREMENTS_TRIGGER_CHECKS, ...REQUIREMENTS_GUARD_ONLY_MEASURES] as RequirementsMeasure[];
  const byIdentity = !!(input.citedBefore && input.citedAfter);
  const noFall = (REQUIREMENTS_NO_FALL_MEASURES as readonly RequirementsMeasure[])
    .filter((m) => !(byIdentity && (REQUIREMENTS_CITATION_COUNT_MEASURES as readonly string[]).includes(m)));
  const regressed: RequirementsRegression[] = [
    ...all.filter((m) => ma[m] > mb[m]),
    ...noFall.filter((m) => ma[m] < mb[m]),
  ];
  if (byIdentity) regressed.push(...citationIdentityRegressions(input.citedBefore!, input.citedAfter!));
  const clauseKey = (d: DroppedClause) => `${d.item}\u0000${d.leg}\u0000${d.clause}`;
  const was = new Set((input.droppedBefore ?? input.before.clauses?.dropped ?? []).map(clauseKey));
  if ((input.droppedAfter ?? input.after?.clauses?.dropped ?? []).some((d) => !was.has(clauseKey(d)))) {
    regressed.push(CLAUSE_IDENTITY_REGRESSION);
  }
  const newly = (input.droppedAfter ?? input.after?.clauses?.dropped ?? []).filter((d) => !was.has(clauseKey(d)));
  const cleared = REQUIREMENTS_TRIGGER_CHECKS.filter((c) => mb[c] > 0 && ma[c] === 0);
  const facts = { clearedChecks: cleared, clausesNewlyDropped: newly };
  const improved = REQUIREMENTS_TRIGGER_CHECKS.filter((c) => mb[c] > 0 && ma[c] < mb[c]);
  if (regressed.length) {
    // v3 `unwaivable-cleared`: a certain, unrecoverable publish failure yields to a finding a person resolves by
    // READING — enforced at publish (`--clause-read`, never a waiver). Every unwaivable check that failed must read 0
    // after (cleared, never merely improved); the only regressions are clause flags; at most MAX new flags.
    const unwaivableFailed = REQUIREMENTS_ADOPTION_UNWAIVABLE_CHECKS.filter((c) => mb[c] > 0);
    const arm = unwaivableFailed.length > 0
      && unwaivableFailed.every((c) => ma[c] === 0)
      && regressed.every((m) => m === 'clauses' || m === CLAUSE_IDENTITY_REGRESSION)
      && newly.length <= REQUIREMENTS_ADOPTION_MAX_NEW_CLAUSE_FLAGS;
    if (!arm) return no('regressed', { regressedMeasures: regressed, ...facts });
    return { adopted: true, adoptionArm: 'unwaivable-cleared', regressedMeasures: regressed, improvedChecks: improved, measuresAfter: ma, ...facts };
  }
  if (!improved.length) return no('no-improvement', facts);
  return { adopted: true, adoptionArm: 'no-regression', improvedChecks: improved, measuresAfter: ma, ...facts };
}

// ── The turn ─────────────────────────────────────────────────────────────────────────────────────────────────────
interface CorrectionLogger {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
}

export interface RequirementsFormCorrectionInput {
  text: string;
  /** The decision-point stamp (checked, attempted). */
  before: Omit<RequirementsFormCheckStamp, 'correction'>;
  inputs: RequirementsFormInputs;
  currentResponse: any;
  /** Mutated in place: the assistant turn + the correction prompt are pushed. */
  messageHistory: any[];
  /** Mutated in place: the turn's usage is folded (spent whether adopted or not). */
  totalUsage: AccumulatedUsage;
  prompt: string;
  normalizedLlmConfig: NormalizedModelConfig;
  mcpFunctions: LLMRequestOptions['functions'] | undefined;
  executionId: string;
  userId: string | undefined;
  /** The turn's own abort bound: min(600 s, the watchdog time left) — the caller computes it. */
  timeoutMs: number;
}

export interface RequirementsFormCorrectionObservers {
  onRequirementsCorrectionStart?: (failingChecks: RequirementsTriggerCheck[]) => Promise<void> | void;
  onRequirementsCorrectionComplete?: (result: { adopted: boolean; notAdoptedReason?: RequirementsCorrectionNotAdoptedReason; text: string }) => Promise<void> | void;
}

export interface RequirementsFormCorrectionResult {
  text: string;
  currentResponse: any;
  /** The correction outcome fields (merged by the caller onto the decision). */
  outcome: Pick<RequirementsCorrectionFact, 'adoptionRuleVersion' | 'adopted' | 'notAdoptedReason' | 'regressedMeasures' | 'improvedChecks' |
    'measuresBefore' | 'measuresAfter' | 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheCreationTokens' | 'durationMs' |
    'adoptionArm' | 'clearedChecks' | 'clausesNewlyDropped' | 'clausesNewlyDroppedTotal'>;
  /** The re-check of the corrected text (null when nothing came back or the call errored). */
  after: Omit<RequirementsFormCheckStamp, 'correction'> | null;
  correctedText: string | null;
  correctionPrompt: string;
  reflectionError?: ReflectionErrorFact;
}

export async function runRequirementsFormCorrection(
  input: RequirementsFormCorrectionInput,
  deps: { generateText: (prompt: string, options: any, userId?: string) => Promise<any>; logger: CorrectionLogger },
  observers: RequirementsFormCorrectionObservers = {},
): Promise<RequirementsFormCorrectionResult> {
  const { text, before, messageHistory, totalUsage, executionId } = input;
  const { logger } = deps;
  const notify = async (fn: () => Promise<void> | void) => {
    try { await fn(); } catch (err) {
      logger.warn({ executionId, err: err instanceof Error ? err.message : String(err) }, 'Requirements form correction: observer threw — ignored');
    }
  };
  const measuresBefore = requirementsMeasures(before) ?? undefined;
  const analysis = analyzeRequirementsForm({ draft: text, objective: input.inputs.objective, ownerRowItemMapParsed: input.inputs.ownerMap });
  const correctionPrompt = buildRequirementsCorrectionPrompt(before, analysis);
  const failing = failingTriggerChecks(before);
  messageHistory.push({ role: 'assistant', content: input.currentResponse?.rawContentBlocks ?? input.currentResponse?.text ?? text });
  messageHistory.push({ role: 'user', content: [{ type: 'text', text: correctionPrompt }] });
  logger.info({ executionId, failingChecks: failing, timeoutMs: input.timeoutMs }, 'Requirements form correction: requesting one tool-less correction pass');
  await notify(() => observers.onRequirementsCorrectionStart?.(failing));

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), Math.max(1, input.timeoutMs));
  const started = Date.now();
  let response: any;
  try {
    response = await deps.generateText(input.prompt, buildLlmCallOptions(input.normalizedLlmConfig, 'reflection', {
      signal: abort.signal, mcpFunctions: input.mcpFunctions, messages: messageHistory as any,
    }), input.userId);
  } catch (err) {
    clearTimeout(timer);
    // G5 (agent-execution review F4): fold any partial usage the provider attached to the error, so an aborted
    // turn's billed tokens are not invisible. A no-op until the provider attaches it (shared follow-up).
    const partialUsage = (err as { usage?: unknown } | null)?.usage;
    if (partialUsage && typeof partialUsage === 'object') addUsage(totalUsage, partialUsage as any);
    logger.warn({ executionId, err: err instanceof Error ? err.message : String(err) }, 'Requirements form correction failed — keeping the original draft');
    const f = reflectionErrorFact('requirements_form_correction', null, err);
    if (f) warnReflectionError(logger, executionId, f, err instanceof Error ? err.message : String(err));
    return {
      text, currentResponse: input.currentResponse, after: null, correctedText: null, correctionPrompt,
      outcome: { adopted: false, notAdoptedReason: 'llm-error', ...(measuresBefore ? { measuresBefore } : {}), durationMs: Date.now() - started },
      ...(f ? { reflectionError: f } : {}),
    };
  }
  clearTimeout(timer);
  const durationMs = Date.now() - started;
  addUsage(totalUsage, response?.usage);
  const providerError = !!response?.error?.message;
  const reflectionError = reflectionErrorFact('requirements_form_correction', response);
  if (reflectionError) warnReflectionError(logger, executionId, reflectionError, response?.error?.message);
  const correctedText: string | null = typeof response?.text === 'string' ? response.text : null;
  const frozenRowItemMap = { map: analysis.rowItemMap, source: analysis.itemMapSource };
  const after = !providerError && correctedText && correctedText.trim()
    ? computeRequirementsFormCheckStamp({
      text: correctedText, stopReason: response?.stopReason, textSource: 'requirements-form-correction', inputs: input.inputs,
      frozenRowItemMap,
      onCheckerError: (message) => logger.warn({ executionId, err: message }, 'requirements form check: checker-error on the correction re-check'),
    })
    : null;
  let droppedAfter: DroppedClause[] | undefined;
  let citedAfter: CitedUnit[] | undefined;
  if (after?.checked && correctedText) {
    try {
      const aa = analyzeRequirementsForm({ draft: correctedText, objective: input.inputs.objective, frozenRowItemMap });
      droppedAfter = aa.clauses.dropped;
      citedAfter = aa.citations.cited;
    } catch { droppedAfter = undefined; citedAfter = undefined; /* the fact's capped list / count guard is used; a checker error already made `after` unchecked */ }
  }
  const adoption = checkRequirementsCorrectionAdoption({
    original: text, corrected: correctedText, stopReason: response?.stopReason, providerError, before, after,
    droppedBefore: analysis.clauses.dropped, droppedAfter, citedBefore: analysis.citations.cited, citedAfter,
  });
  const u = response?.usage;
  const outcome: RequirementsFormCorrectionResult['outcome'] = {
    adoptionRuleVersion: REQUIREMENTS_ADOPTION_RULE_VERSION,
    adopted: adoption.adopted,
    ...(adoption.notAdoptedReason ? { notAdoptedReason: adoption.notAdoptedReason } : {}),
    ...(adoption.regressedMeasures ? { regressedMeasures: adoption.regressedMeasures } : {}),
    ...(adoption.improvedChecks ? { improvedChecks: adoption.improvedChecks } : {}),
    ...(adoption.adoptionArm ? { adoptionArm: adoption.adoptionArm } : {}),
    ...(adoption.clearedChecks ? { clearedChecks: adoption.clearedChecks } : {}),
    ...(adoption.clausesNewlyDropped ? {
      clausesNewlyDropped: adoption.clausesNewlyDropped.slice(0, 12), clausesNewlyDroppedTotal: adoption.clausesNewlyDropped.length,
    } : {}),
    ...(measuresBefore ? { measuresBefore } : {}),
    ...(adoption.measuresAfter !== undefined ? { measuresAfter: adoption.measuresAfter } : {}),
    inputTokens: u?.inputTokens, outputTokens: u?.outputTokens,
    ...(typeof u?.cacheReadTokens === 'number' ? { cacheReadTokens: u.cacheReadTokens } : {}),
    ...(typeof u?.cacheCreationTokens === 'number' ? { cacheCreationTokens: u.cacheCreationTokens } : {}),
    durationMs,
  };
  logger.info({ executionId, ...outcome }, 'Requirements form correction: completed');
  await notify(() => observers.onRequirementsCorrectionComplete?.({
    adopted: adoption.adopted,
    ...(adoption.notAdoptedReason ? { notAdoptedReason: adoption.notAdoptedReason } : {}),
    text: adoption.adopted ? (correctedText as string) : '',
  }));
  const withErr = reflectionError ? { reflectionError } : {};
  if (!adoption.adopted) {
    return { text, currentResponse: input.currentResponse, outcome, after, correctedText, correctionPrompt, ...withErr };
  }
  return { text: correctedText as string, currentResponse: response, outcome, after, correctedText, correctionPrompt, ...withErr };
}

// ── The step (ONE sequencing, shared by execution-core and the leg replay lab) ─────────────────────────────────
export interface RequirementsFormStepInput {
  text: string;
  /** The LOOP-EXIT stop reason (loopResult.finalStopReason). */
  stopReason: string | null | undefined;
  inputs: RequirementsFormInputs;
  correctionTurnUsed: boolean;
  budgetFlagged: boolean;
  /** `isRequirementsFormCorrectionEnabled()` read ONCE by the caller. */
  enabled: boolean;
  /** The watchdog's own deadline (execution-core `deadlineAt`) and the loop's start (both epoch ms). */
  deadlineAt: number;
  loopStartedAt: number;
  currentResponse: any;
  messageHistory: any[];
  totalUsage: AccumulatedUsage;
  prompt: string;
  normalizedLlmConfig: NormalizedModelConfig;
  mcpFunctions: LLMRequestOptions['functions'] | undefined;
  executionId: string;
  userId: string | undefined;
}

export interface RequirementsFormStepResult {
  stamp: RequirementsFormCheckStamp;
  /** The deliverable after the step — the adopted correction, else the ORIGINAL by reference. */
  text: string;
  currentResponse: any;
  /** True when a correction turn was ATTEMPTED (spends the run's one reflection pass ⇒ #90 disqualified). */
  attempted: boolean;
  /** G1 B: the ORIGINAL draft, set on every attempt — the caller persists it as REQUIREMENTS_PRE_CORRECTION_ARTIFACT. */
  preCorrectionText?: string;
  /** Rule 3 (1b): a NOT-adopted correction's non-empty text — the caller persists it as
   *  REQUIREMENTS_CORRECTION_NOT_ADOPTED_ARTIFACT. Absent on adoption (the deliverable IS the corrected text). */
  notAdoptedText?: string;
  reflectionError?: ReflectionErrorFact;
}


export async function runRequirementsFormStep(
  input: RequirementsFormStepInput,
  deps: { generateText: (prompt: string, options: any, userId?: string) => Promise<any>; logger: CorrectionLogger; now?: () => number },
  observers: RequirementsFormCorrectionObservers = {},
): Promise<RequirementsFormStepResult> {
  const now = deps.now ?? Date.now;
  const before = computeRequirementsFormCheckStamp({
    text: input.text, stopReason: input.stopReason, textSource: 'loop', inputs: input.inputs,
    onCheckerError: (message) => deps.logger.warn({ executionId: input.executionId, err: message },
      'requirements form check: checker-error — fact stamped checked:false, execution unaffected'),
  });
  const decision = decideRequirementsFormCorrection({
    fact: before, correctionTurnUsed: input.correctionTurnUsed, budgetFlagged: input.budgetFlagged,
    enabled: input.enabled, objectiveResolved: input.inputs.objectiveResolved,
    time: () => estimateRequirementsCorrectionTime({
      deadlineAt: input.deadlineAt, now: now(), loopStartedAt: input.loopStartedAt, draftChars: input.text.length,
      lastTurnOutputTokens: input.currentResponse?.usage?.outputTokens, totalOutputTokens: input.totalUsage?.outputTokens,
    }),
  });
  if (decision.notAttemptedReason === 'insufficient-time') {
    deps.logger.warn({ executionId: input.executionId, ...decision.timeBudget, failingChecks: decision.failingChecks },
      'Requirements form correction SKIPPED — the watchdog time left cannot fit a full re-emission (stamped insufficient-time)');
  }
  if (!decision.attempted) {
    return { stamp: { ...before, correction: decision }, text: input.text, currentResponse: input.currentResponse, attempted: false };
  }
  const timeoutMs = Math.min(REQUIREMENTS_TURN_MAX_MS, Math.max(1, decision.timeBudget!.remainingMs));
  const r = await runRequirementsFormCorrection({
    text: input.text, before, inputs: input.inputs, currentResponse: input.currentResponse,
    messageHistory: input.messageHistory, totalUsage: input.totalUsage, prompt: input.prompt,
    normalizedLlmConfig: input.normalizedLlmConfig, mcpFunctions: input.mcpFunctions,
    executionId: input.executionId, userId: input.userId, timeoutMs,
  }, deps, observers);
  // A5 (audit, 2026-10-12): both pointers hash the PERSISTED bytes. The persist redacts with the same pure function
  // (execution-terminal-persist → redactExtraArtifactForPersist), so hashing its output here equals hashing the stored
  // artifact, with no write-back. `chars` is JS UTF-16 units (a Postgres code-point length reads lower on astral text).
  const persisted = (t: string) => {
    const red = redactExtraArtifactForPersist(t);
    return { sha256: createHash('sha256').update(red.text, 'utf8').digest('hex'), chars: red.text.length, redactedCount: red.redactedCount };
  };
  const notAdoptedText = !r.outcome.adopted && r.correctedText && r.correctedText.trim() ? r.correctedText : undefined;
  const correction: RequirementsCorrectionFact = {
    ...decision, ...r.outcome,
    preCorrection: { artifact: REQUIREMENTS_PRE_CORRECTION_ARTIFACT, ...persisted(input.text) },
    ...(notAdoptedText ? { notAdoptedText: { artifact: REQUIREMENTS_CORRECTION_NOT_ADOPTED_ARTIFACT, ...persisted(notAdoptedText) } } : {}),
    ...(!r.outcome.adopted && r.after?.checked ? { after: {
      coverageErrors: r.after.coverage?.errors ?? [], citationFindings: r.after.citations?.findings ?? [],
      droppedClauses: r.after.clauses?.dropped ?? [], lintHits: r.after.lint?.hits ?? [],
    } } : {}),
    before: {
      coverageErrors: before.coverage?.errors ?? [], citationFindings: before.citations?.findings ?? [],
      droppedClauses: before.clauses?.dropped ?? [], lintHits: before.lint?.hits ?? [],
    },
    sectionSizes: { before: before.size?.sections ?? [], after: r.after?.size?.sections ?? null },
  };
  const err = { preCorrectionText: input.text, ...(notAdoptedText ? { notAdoptedText } : {}), ...(r.reflectionError ? { reflectionError: r.reflectionError } : {}) };
  if (r.outcome.adopted && r.after) {
    correction.decision = {
      sizeDelivered: before.size?.programViewDelivered ?? null, coverageErrors: before.coverage?.errorsTotal ?? null,
      citationFindings: before.citations?.findingsTotal ?? null, clausesDropped: before.clauses?.droppedTotal ?? null,
      lintHits: before.lint?.hitsTotal ?? null,
    };
    return { stamp: { ...r.after, correction }, text: r.text, currentResponse: r.currentResponse, attempted: true, ...err };
  }
  return { stamp: { ...before, correction }, text: input.text, currentResponse: input.currentResponse, attempted: true, ...err };
}

/** #90 replaced the deliverable ⇒ re-count the PERSISTED text; the correction record stays the decision taken. */
export function recountRequirementsStamp(stamp: RequirementsFormCheckStamp, input: {
  text: string; stopReason: string | null | undefined; inputs: RequirementsFormInputs; onCheckerError?: (message: string) => void;
}): RequirementsFormCheckStamp {
  return { ...computeRequirementsFormCheckStamp({ ...input, textSource: 'diagnostic-retry' }), correction: stamp.correction };
}

/** The lab's input source: the harness row a snapshot already carries (`row_to_json(tasks.*)` — description + metadata). */
export function requirementsInputsFromHarnessRow(row: { id?: string; description?: unknown; metadata?: unknown } | null | undefined): RequirementsFormInputs {
  if (!row) return { objective: '', objectiveResolved: false, objectiveUnresolvedReason: 'no-owning-harness', harnessTaskId: null, ownerMap: null, ownerMapState: 'absent' };
  const meta = (row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)) ? row.metadata as Record<string, unknown> : {};
  const parsed = parseOwnerRowItemMap(meta[OWNER_ROW_ITEM_MAP_KEY]);
  const objective = typeof row.description === 'string' ? row.description : '';
  const base = { harnessTaskId: row.id ?? null, ownerMap: parsed.map, ownerMapState: parsed.state, ...(parsed.detail ? { ownerMapDetail: parsed.detail } : {}) };
  return objective.trim()
    ? { ...base, objective, objectiveResolved: true }
    : { ...base, objective: '', objectiveResolved: false, objectiveUnresolvedReason: 'empty-description' };
}
