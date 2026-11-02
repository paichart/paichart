/**
 * PLATFORM-HELD-BYTES Stage B V-5c — the held-edit CORRECTION TURN (plan STAGE-B-PLAN.md v4.1 §3 V-5c; PC N-13, N-14, S-17;
 * AE S1, S2; §0.1 A8, A18). One tool-less reflection-mode turn, behind `HELD_EDIT_CORRECTION_ENABLED` (default OFF, read on
 * BOTH processes), that may fix AUTHOR_CORRECTABLE refusals. The corrected text replaces the deliverable ONLY when adoption
 * rule v1 passes; otherwise the original stands and the two messages the turn appended are removed (C2, the #89 precedent).
 *
 * The call is the SHARED reflection primitive (`buildLlmCallOptions(cfg, 'reflection', { mcpFunctions })`): on a model that
 * binds thinking to the prefix (Opus 5.5) it re-sends the tool set with `functionCall: 'none'` — omitting it 400s on orgs
 * created on/after 2026-08-31 (customer BYOK orgs). Errors are stamped as `reflectionErrors` with site `held_edit_correction`.
 *
 * The prompt names the edit block, the refusal and — where it helps — VIEW LINE NUMBERS, a rule id or an R9 rewrite class.
 * It NEVER carries line text (pinned): the Author has the held block; repeating a line would hand R10-redacted or R9-rewritten
 * text back into the prompt.
 */
import {
  computeEditApplication, EDIT_REFUSAL_CLASS, type EditApplication, type EditRefusal, type EditRefusalName, type HeldFileInput,
} from './held-bytes/apply';
import { parseHeldEdits, grammarLineNumbers, textLines, machineHeadingTitle, HELD_EDITS_HEADING, HELD_ROLLBACK_HEADING } from './held-bytes/edits';
import { addUsage, buildLlmCallOptions, reflectionErrorFact, warnReflectionError, type ReflectionErrorFact } from './agentic-tool-loop';
import { estimateRequirementsCorrectionTime, REQUIREMENTS_TURN_MAX_MS, type RequirementsTimeBudget } from './requirements-form-correction';

export const HELD_EDIT_CORRECTION_FLAG = 'HELD_EDIT_CORRECTION_ENABLED';
export function isHeldEditCorrectionEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[HELD_EDIT_CORRECTION_FLAG] === 'true';
}
export const HELD_EDIT_ADOPTION_RULE_VERSION = 1;

export type EditCorrectionNotAttemptedReason =
  | 'no-correctable-refusal' | 'platform-state' | 'prior-pass-used:anti-fabrication' | 'prior-pass-used:form-correction'
  | 'budget-flagged' | 'flag-off' | 'insufficient-time'
  /** Phase 10 D3(b): a NOT_CORRECTABLE refusal (held-file-written-whole) is present — the leg is forced, no turn is spent. */
  | 'not-correctable';
export type EditCorrectionNotAdoptedReason = 'llm-error' | 'empty-response' | 'refusals-did-not-fall' | 'applied-edit-changed' | 'changed-outside-sections';

export interface EditCorrectionFact {
  attempted: boolean;
  notAttemptedReason?: EditCorrectionNotAttemptedReason;
  timeBudget?: RequirementsTimeBudget;
  adoptionRuleVersion?: number;
  adopted?: boolean;
  notAdoptedReason?: EditCorrectionNotAdoptedReason;
  refusedBefore?: number;
  refusedAfter?: number;
  inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheCreationTokens?: number; durationMs?: number;
}

const PACKAGE_PLATFORM_STATES = new Set(['binding-mismatch', 'variant-protocol-not-injected', 'demo-pov', 'r10-disabled', 'could-not-check', 'no-base']);
const correctable = (a: EditApplication) => a.refusals.filter((r) => EDIT_REFUSAL_CLASS[r.name] === 'AUTHOR_CORRECTABLE');

/** The attempt decision, in the plan's order: correctable refusal → no platform state → no prior pass → no budget flag →
 *  the flag → time (a thunk, computed only when every earlier gate passed). */
export function decideEditCorrection(input: {
  application: EditApplication;
  correctionTurnUsed: boolean;
  formCorrectionAttempted: boolean;
  budgetFlagged: boolean;
  enabled: boolean;
  time: () => RequirementsTimeBudget;
}): EditCorrectionFact {
  const a = input.application;
  const platform = PACKAGE_PLATFORM_STATES.has(a.state) || (EDIT_REFUSAL_CLASS[a.state as EditRefusalName] === 'PLATFORM_STATE');
  if (platform) return { attempted: false, notAttemptedReason: 'platform-state' };
  // Phase 10 D3(b) (owner, 2026-10-17): adoption rule v1 cannot adopt a whole-file → edits conversion, so a turn would be spent for
  // nothing; with ANY not-correctable refusal present the leg is forced anyway, so no turn at all. Rule v2 is filed (SYNTHESIS D3).
  if (a.refusals.some((r) => EDIT_REFUSAL_CLASS[r.name] === 'NOT_CORRECTABLE')) return { attempted: false, notAttemptedReason: 'not-correctable' };
  if (correctable(a).length === 0) return { attempted: false, notAttemptedReason: 'no-correctable-refusal' };
  if (input.correctionTurnUsed) return { attempted: false, notAttemptedReason: 'prior-pass-used:anti-fabrication' };
  if (input.formCorrectionAttempted) return { attempted: false, notAttemptedReason: 'prior-pass-used:form-correction' };
  if (input.budgetFlagged) return { attempted: false, notAttemptedReason: 'budget-flagged' };
  if (!input.enabled) return { attempted: false, notAttemptedReason: 'flag-off' };
  const timeBudget = input.time();
  const boundMs = Math.min(timeBudget.remainingMs, REQUIREMENTS_TURN_MAX_MS);
  timeBudget.boundMs = boundMs;
  if (timeBudget.estimatedMs > boundMs) return { attempted: false, notAttemptedReason: 'insufficient-time', timeBudget };
  return { attempted: true, timeBudget };
}

/** Per-name INTENT (PC N-13). Every AUTHOR_CORRECTABLE name is in exactly one group (pinned). */
export const EDIT_CORRECTION_INTENT: Readonly<Record<string, 'RE-COPY' | 'NARROW' | 'OPERATOR-STEP' | 'STRUCTURE'>> = Object.freeze({
  'search-not-found': 'RE-COPY', 'search-not-unique': 'RE-COPY', 'count-mismatch': 'RE-COPY', 'search-empty': 'RE-COPY',
  'ambiguous-markers': 'RE-COPY', 'unknown-handle': 'RE-COPY', 'overlapping-edits': 'RE-COPY',
  'touches-redacted-line': 'NARROW', 'touches-rewritten-line': 'NARROW', 'edit-carries-placeholder': 'NARROW',
  'edit-introduces-secret-literal': 'OPERATOR-STEP', 'edit-redacted-at-persist': 'OPERATOR-STEP', 'candidate-secret-residual': 'OPERATOR-STEP',
  'replace-not-reviewable': 'OPERATOR-STEP', 'replace-unbindable': 'OPERATOR-STEP',
  'edit-in-rollback-section': 'STRUCTURE', 'edits-outside-section': 'STRUCTURE', 'edit-set-too-large': 'STRUCTURE', 'create-path-invalid': 'STRUCTURE',
});

const INTENT_TEXT: Record<string, string> = {
  'RE-COPY': 'Copy the lines to replace again, EXACTLY as the held block shows them (every space; enough lines to be unique, no more), and use only handles the held blocks name.',
  NARROW: 'Narrow the edit so the lines it replaces avoid the lines named below — those lines cannot be edited by reference; if the change needs one, state it as a gap.',
  'OPERATOR-STEP': 'Do not write that text into an edit. Reference a credential instead — write it as ${env:NAME} (a bare $NAME is treated as a literal and refused) — or state the change as an operator step outside the edit; keep edit text to plain printable characters.',
  STRUCTURE: `Restructure: every edit under the \`${HELD_EDITS_HEADING}\` heading (per-file sub-headings one level deeper), the rollback under \`${HELD_ROLLBACK_HEADING}\` AFTER it, new files beside their held file, and fewer, smaller edits when the set is too large.`,
};

function describe(r: EditRefusal): string {
  const where = r.block !== null ? `edit block ${r.block}` : 'the package';
  const bits = [`${where}${r.handle ? ` (${r.handle})` : ''}: ${r.name}`];
  if (r.lines?.length) bits.push(`held-block line${r.lines.length > 1 ? 's' : ''} ${r.lines.slice(0, 20).join(', ')}`);
  if (r.rewriteClass) bits.push(`rewrite class ${r.rewriteClass}`);
  if (typeof r.found === 'number') bits.push(`found ${r.found} time${r.found === 1 ? '' : 's'}`);
  return `- ${bits.join(' · ')}`;
}

/** The correction prompt: correctable refusals only, grouped by intent; names, indices, line NUMBERS — never line text. */
export function buildEditCorrectionPrompt(a: EditApplication): string {
  const items = correctable(a);
  const groups = new Map<string, EditRefusal[]>();
  for (const r of items) { const g = EDIT_CORRECTION_INTENT[r.name]; groups.set(g, [...(groups.get(g) ?? []), r]); }
  const out = [
    'The platform could not apply some of your held-file edits. Return your COMPLETE response again with these fixed and',
    'nothing else changed: keep every other section, line and edit exactly as it is.',
    '',
  ];
  for (const g of ['RE-COPY', 'NARROW', 'OPERATOR-STEP', 'STRUCTURE']) {
    const rs = groups.get(g); if (!rs?.length) continue;
    out.push(`${INTENT_TEXT[g]}`, ...rs.map(describe), '');
  }
  return out.join('\n').trimEnd();
}

// ── adoption rule v1 (PC S-17, §0.1 A8) ─────────────────────────────────────────────────────────────────────────────

/**
 * AE-P2-2 (G3 entry, owner decision 4, 2026-10-16): the A8 extension. A heading title that FOLDS to a machine title — after the
 * section-number strip the parser itself forgives (`machineHeadingTitle`), then case, whitespace runs and ONE trailing
 * parenthetical — compares as that machine title. So a STRUCTURE correction that only retitles a misspelt or suffixed machine
 * heading (`## Held file edits`, `## Held File Edits (H1)`) nets to zero here and can be adopted. Narrow by decision: a different
 * word (`## Edits`, `## Held Edits`) does not fold and is still a changed line. PURE; exported for the fixtures.
 */
const foldTitle = (t: string) => machineHeadingTitle(t).replace(/[ \t]*\([^()]*\)[ \t]*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
const MACHINE_TITLE_BY_FOLD = new Map([HELD_EDITS_HEADING, HELD_ROLLBACK_HEADING].map((t) => [foldTitle(t), t]));
export function foldMachineHeadingTitle(title: string): string | null { return MACHINE_TITLE_BY_FOLD.get(foldTitle(title)) ?? null; }

/** A heading line normalised to its title (A8: a heading whose text differs only in its number of `#` is the same line; AE-P2-2:
 *  one whose title folds to a machine title is that machine title). */
const normHeading = (l: string) => {
  const m = /^#{1,6}[ \t]+(.*?)[ \t]*$/.exec(l);
  return m ? `#:${foldMachineHeadingTitle(m[1]) ?? m[1]}` : l;
};

function outsideLines(text: string): string[] {
  const p = parseHeldEdits(text); const g = grammarLineNumbers(p);
  return textLines(text).filter((_, i) => !g.has(i + 1)).map(normHeading);
}

/**
 * The STRUCTURE lines inside a machine section — blank lines and sub-headings (normalised as the comparison normalises them).
 * G1 lab build (L-6 fixture, 2026-10-15): a correction that splits one ambiguous edit into two blocks adds a separating blank
 * line and a per-file sub-heading INSIDE the edits section; S-17 compares only lines "outside the two machine sections", so such a
 * line may move. Prose inside a section still counts (a rewritten validation command is refused wherever it sits, A8), and a
 * heading-level fix still nets to zero because a heading is compared wherever it sits.
 */
function sectionStructureLines(text: string): Set<string> {
  const p = parseHeldEdits(text); const out = new Set<string>();
  textLines(text).forEach((l, i) => {
    const n = i + 1;
    if (p.sections.some((sec) => n > sec.headingLine && n <= sec.endLine) && (l.trim() === '' || /^#{1,6}[ \t]/.test(l))) out.add(normHeading(l));
  });
  return out;
}

function bag(xs: string[]): Map<string, number> { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return m; }
function minus(a: Map<string, number>, b: Map<string, number>): string[] {
  const out: string[] = []; for (const [k, n] of a) for (let i = 0; i < n - (b.get(k) ?? 0); i++) out.push(k); return out;
}
const hunkKey = (handle: string, h: { start: number; searchLen: number; replace: string[] }) => JSON.stringify([handle, h.start, h.searchLen, h.replace]);

export function checkEditCorrectionAdoption(input: {
  original: string; corrected: string | null; before: EditApplication; after: EditApplication | null;
}): { adopted: boolean; notAdoptedReason?: EditCorrectionNotAdoptedReason } {
  const { original, corrected, before, after } = input;
  if (!corrected || !corrected.trim() || !after) return { adopted: false, notAdoptedReason: 'empty-response' };
  if (!(after.refusedTotal < before.refusedTotal)) return { adopted: false, notAdoptedReason: 'refusals-did-not-fall' };
  const afterHunks = new Set(after.files.flatMap((f) => (f.state === 'applied' ? (f.hunks ?? []).map((h) => hunkKey(f.handle, h)) : [])));
  for (const f of before.files) if (f.state === 'applied') for (const h of f.hunks ?? []) {
    if (!afterHunks.has(hunkKey(f.handle, h))) return { adopted: false, notAdoptedReason: 'applied-edit-changed' };
  }
  // Outside the machine sections: every added/removed line must be a body line of an edit the correction CHANGED.
  const blocksOf = (t: string) => parseHeldEdits(t).blocks.map((b) => JSON.stringify([b.op, b.handle, b.search, b.replace]));
  const beforeBlocks = new Set(blocksOf(original)); const afterBlocks = new Set(blocksOf(corrected));
  const changedBodyLines = new Set<string>();
  for (const t of [original, corrected]) for (const b of parseHeldEdits(t).blocks) {
    const k = JSON.stringify([b.op, b.handle, b.search, b.replace]);
    if (!(beforeBlocks.has(k) && afterBlocks.has(k))) for (const l of [...b.search, ...b.replace]) changedBodyLines.add(l);
  }
  const o = bag(outsideLines(original)); const c = bag(outsideLines(corrected));
  const added = minus(c, o); const removed = minus(o, c);
  const addedOk = sectionStructureLines(corrected); const removedOk = sectionStructureLines(original);
  if (added.some((l) => !changedBodyLines.has(l) && !addedOk.has(l)) || removed.some((l) => !changedBodyLines.has(l) && !removedOk.has(l))) {
    return { adopted: false, notAdoptedReason: 'changed-outside-sections' };
  }
  return { adopted: true };
}

// ── the turn ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface EditCorrectionTurnInput {
  text: string;
  before: EditApplication;
  files: HeldFileInput[];
  r9Version: string;
  /** R10-V8-RESIDUALS (b): the persist's tool-record echo sources, re-applied to the corrected text (in memory only). */
  persistEchoTokens?: Iterable<string>;
  currentResponse: any;
  messageHistory: any[];
  totalUsage: any;
  prompt: string;
  normalizedLlmConfig: any;
  mcpFunctions: any;
  executionId: string;
  userId: string | undefined;
  timeoutMs: number;
}
export interface EditCorrectionTurnResult {
  text: string;
  currentResponse: any;
  after: EditApplication | null;
  outcome: Omit<EditCorrectionFact, 'attempted' | 'notAttemptedReason' | 'timeBudget'>;
  reflectionError?: ReflectionErrorFact;
}

export async function runEditCorrectionTurn(
  input: EditCorrectionTurnInput,
  deps: { generateText: (prompt: string, options: any, userId?: string) => Promise<any>; logger: { info: (o: object, m: string) => void; warn: (o: Record<string, unknown>, m: string) => void } },
): Promise<EditCorrectionTurnResult> {
  const { text, before, messageHistory, totalUsage, executionId } = input;
  const historyLength = messageHistory.length;
  const correctionPrompt = buildEditCorrectionPrompt(before);
  messageHistory.push({ role: 'assistant', content: input.currentResponse?.rawContentBlocks ?? input.currentResponse?.text ?? text });
  messageHistory.push({ role: 'user', content: [{ type: 'text', text: correctionPrompt }] });
  const base = { adoptionRuleVersion: HELD_EDIT_ADOPTION_RULE_VERSION, refusedBefore: before.refusedTotal };
  const notAdopted = (reason: EditCorrectionNotAdoptedReason, extra: object = {}, reflectionError?: ReflectionErrorFact): EditCorrectionTurnResult => {
    messageHistory.length = historyLength; // C2: not adopted ⇒ the two appended messages are removed
    return { text, currentResponse: input.currentResponse, after: null, outcome: { ...base, adopted: false, notAdoptedReason: reason, ...extra }, ...(reflectionError ? { reflectionError } : {}) };
  };
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
    const partial = (err as { usage?: unknown } | null)?.usage;
    if (partial && typeof partial === 'object') addUsage(totalUsage, partial as any);
    const f = reflectionErrorFact('held_edit_correction', null, err);
    if (f) warnReflectionError(deps.logger, executionId, f, err instanceof Error ? err.message : String(err));
    return notAdopted('llm-error', { durationMs: Date.now() - started }, f ?? undefined);
  }
  clearTimeout(timer);
  addUsage(totalUsage, response?.usage);
  const u = response?.usage;
  const usage = {
    inputTokens: u?.inputTokens, outputTokens: u?.outputTokens, durationMs: Date.now() - started,
    ...(typeof u?.cacheReadTokens === 'number' ? { cacheReadTokens: u.cacheReadTokens } : {}),
    ...(typeof u?.cacheCreationTokens === 'number' ? { cacheCreationTokens: u.cacheCreationTokens } : {}),
  };
  const reflectionError = reflectionErrorFact('held_edit_correction', response) ?? undefined;
  if (reflectionError) { warnReflectionError(deps.logger, executionId, reflectionError, response?.error?.message); return notAdopted('llm-error', usage, reflectionError); }
  const corrected: string | null = typeof response?.text === 'string' ? response.text : null;
  const after = corrected && corrected.trim() ? computeEditApplication(corrected, { files: input.files, r9Version: input.r9Version, persistEchoTokens: input.persistEchoTokens }) : null;
  const adoption = checkEditCorrectionAdoption({ original: text, corrected, before, after });
  deps.logger.info({ executionId, adopted: adoption.adopted, notAdoptedReason: adoption.notAdoptedReason ?? null, refusedBefore: before.refusedTotal,
    refusedAfter: after?.refusedTotal ?? null, ...usage }, 'held edit correction: completed');
  if (!adoption.adopted) return notAdopted(adoption.notAdoptedReason as EditCorrectionNotAdoptedReason, { ...usage, ...(after ? { refusedAfter: after.refusedTotal } : {}) });
  return { text: corrected as string, currentResponse: response, after, outcome: { ...base, adopted: true, refusedAfter: after!.refusedTotal, ...usage } };
}

/** The turn's abort bound — the requirements budget (deadline + loop start), min(600 s, time left). */
export function editCorrectionTime(input: Parameters<typeof estimateRequirementsCorrectionTime>[0]): RequirementsTimeBudget {
  return estimateRequirementsCorrectionTime(input);
}
