/**
 * Form correction — the ONE tool-less correction pass a package form-check hit earns (mechanical-reflection-
 * trigger, plan §6/§10). Built at Step A.5 for the offline replay; WIRED at Step B (2026-10-07).
 *
 * LIVE CALLER: `execution-core.ts` only, right after the form-check fact and before `onStoringResults`/#90, and only
 * when the fact's decision says `attempted` — i.e. the flag is on (`FORM_CORRECTION_ENABLED=true`, default OFF), no
 * prior pass ran (#89), no budget flag, and EVERY hit is an UNDERCOUNT (Step B scope, Steve 2026-10-07, narrowed to
 * every HIT — fact-only kinds included — by review B-M1:
 * A.5 adopted 9 of 9 pure undercounts with 0 collateral; elisions, short hunks and mixed packages were rejected or
 * risky, so they stay fact-only). The core passes `undercountOnly: true` so the turn re-asserts that scope itself.
 * An attempt SPENDS the run's one reflection pass: #90 is disqualified (`formCorrectionAttempted`, its 5th rule).
 * `force: true` is for `scripts/replay-form-correction.ts` only (it replays elision specimens too).
 *
 * Three parts, each exported so the replay and the tests exercise the SHIPPING code:
 *   - `buildFormCorrectionPrompt` — names each defect by block, line and count, points at where the content
 *     already sits, forbids new content and any change to an R10 placeholder, and requires the COMPLETE package
 *     re-emitted (an LLM asked to "fix the rollback" tends to answer with only the fixed section).
 *   - `checkFormCorrectionAdoption` — the deterministic adoption guard. It checks PROVENANCE, not shape
 *     (architectural review H1/H2, 2026-10-07): a correction is adopted only when every changed line is accounted
 *     for by a named item. See the function for the conditions; the first failing one is named.
 *   - `runFormCorrection` — the turn, in the (input, deps, observers) shape of diagnostic-retry.ts, in
 *     'reflection' mode (`functionCall: 'none'`; no tools on legacy models, the SAME tool set on preserved-thinking
 *     models — AUDIT C1) with its own bounded 600 s abort controller.
 *
 * Protocol 10: `adopted` transcribes a platform action; it never grades the package.
 */

import { addUsage, buildLlmCallOptions, reflectionErrorFact, warnReflectionError } from './agentic-tool-loop';
import type { AccumulatedUsage, NormalizedModelConfig, ReflectionErrorFact } from './agentic-tool-loop';
import type { LLMRequestOptions } from '@/lib/services/llm/types';
import {
  analyzePackageForm, triggerHits, allHitsAreUndercounts, R10_PLACEHOLDER_RE,
  type AnalysisHit, type FencedBlock, type FormCheckHit, type FormCorrectionFact, type FormCorrectionNotAdoptedReason,
  type PackageFormAnalysis,
} from './package-form-check';
import { redactArtifactSecrets } from './redact-artifact-secrets';

export const FORM_CORRECTION_FLAG = 'FORM_CORRECTION_ENABLED';

/** Default OFF. Only the literal string 'true' turns it on. */
export function isFormCorrectionEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[FORM_CORRECTION_FLAG] === 'true';
}

const where = (block: number, heading: string, lead = 'Block') => (heading ? `${lead} ${block} (under "${heading}")` : `${lead} ${block}`);

function plural(n: number, w: string): string {
  return `${n} ${w}${n === 1 ? '' : 's'}`;
}

function isShortHunk(h: FormCheckHit): boolean {
  return !!h.declared && !!h.observed && (h.observed.old < h.declared.old || h.observed.new < h.declared.new);
}

/** Marker hits that sit INSIDE a short hunk's body are folded into that hunk's item (plan §6 item 1). */
function markersInsideHunk(a: PackageFormAnalysis, hunk: AnalysisHit): AnalysisHit[] {
  if (!hunk.hunkRange) return [];
  const [from, to] = hunk.hunkRange;
  return a.hits.filter((h) => h.kind !== 'hunk-count-mismatch' && h.block === hunk.block &&
    h.markerIndex !== undefined && h.markerIndex > from && h.markerIndex < to);
}

/** The correction prompt (plan §6), generated from the UNCAPPED analysis — never from the capped fact. */
export function buildFormCorrectionPrompt(a: PackageFormAnalysis): string {
  const items: string[] = [];
  const folded = new Set<AnalysisHit>();
  const srcList = (h: FormCheckHit) =>
    (h.locatedIn ?? []).map((l) => `${where(l.block, l.heading ?? '', 'block')}, lines ${l.lines[0]}–${l.lines[1]}`).join('; or ');
  for (const h of triggerHits(a)) {
    if (folded.has(h)) continue;
    if (h.kind === 'hunk-count-mismatch' && h.declared && h.observed) {
      const d = h.declared; const o = h.observed;
      if (isShortHunk(h)) {
        const inner = markersInsideHunk(a, h);
        inner.forEach((e) => folded.add(e));
        const elided = inner.length
          ? `, ${inner.length === 1 ? 'one of which is the elided line' : 'including the elided lines'} ${inner.map((e) => `\`${e.marker}\``).join(', ')}`
          : '';
        let item = `${where(h.block, h.heading)}, line ${h.line}: the hunk header \`${h.header}\` declares ` +
          `${plural(d.old, 'removed line')} and ${plural(d.new, 'added line')}; the body has ${o.old} removed and ${o.new} added${elided}.`;
        if (h.locatedIn?.length) {
          item += `\n   The ${plural(d.old, 'line')} this hunk removes are already in your package: ${srcList(h)} — the same lines with \`+\` replaced by \`-\`.`;
        }
        items.push(item);
      } else {
        items.push(`${where(h.block, h.heading)}, line ${h.line}: the hunk header \`${h.header}\` declares ` +
          `${plural(d.old, 'removed line')} and ${plural(d.new, 'added line')}; the body continues for ` +
          `${plural(h.extraBodyLines ?? 0, 'more line')} after those counts are reached.\n` +
          `   \`git apply\` writes only the declared lines and silently ignores the rest. The body you wrote is the content: change the header count, not the body.`);
      }
    } else if (h.kind === 'marker-line-located' && h.locatedIn?.length) {
      items.push(`${where(h.block, h.heading)}, line ${h.line}: the elided line \`${h.marker}\` stands for lines that are not written out.\n` +
        `   They are already in your package: ${srcList(h)}.`);
    }
  }
  return [
    '**Form check before your package is delivered (platform, mechanical).**',
    '',
    'The platform counted lines in your package\'s fenced blocks. Each item below is a count or a location, not a judgement of your design.',
    '',
    ...items.map((t, i) => `${i + 1}. ${t}`),
    '',
    'Re-emit your COMPLETE package — every section, same order, same wording — changing ONLY the lines named above:',
    '- Replace an elided line with the lines it stands for, copied character-for-character from the location named.',
    '- Where an item is a header count, change the count only.',
    '- Do not add, remove or change any other line, value, address, resource, command or expected output, and introduce nothing that is not already in your package.',
    '- Never change a `<<REDACTED-…>>` placeholder: carry it exactly as written, wherever it appears.',
    '- If an item cannot be fixed by copying from the named location, leave it unchanged.',
    '- Do not mention this check in the package.',
    '- Do not call any tools — none are available on this turn.',
    '- End with your original confidence line exactly as written in your package.',
  ].join('\n');
}

const ADDRESS_TOKEN_RE = /\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b|\barn:[A-Za-z0-9-]+:[A-Za-z0-9-]*:[A-Za-z0-9-]*:[0-9]*:[^\s"'`,)\]]+/g;

export function addressTokens(text: string): Set<string> {
  return new Set((text || '').match(ADDRESS_TOKEN_RE) ?? []);
}

function hitKey(h: FormCheckHit): string {
  return `${h.kind}|${h.marker ?? h.header ?? ''}`;
}

export interface AdoptionResult {
  adopted: boolean;
  notAdoptedReason?: FormCorrectionNotAdoptedReason;
  postHitsTotal?: number;
  /** TRIGGER hits on the corrected text (0 whenever adopted — condition 2). */
  postTriggerHitsTotal?: number;
  /** Diagnostics for the replay report (not persisted on the fact). */
  detail?: string;
}

/** A corrected line equals a SOURCE line: verbatim, or with a diff prefix on the corrected side (`+`↔`-` flip allowed). */
function sourceLineEq(src: string, cor: string): boolean {
  if (cor === src) return true;
  if (cor.length === 0 || !'+- '.includes(cor[0])) return false;
  const tail = cor.slice(1);
  return tail === src || (src.length > 0 && '+- '.includes(src[0]) && tail === src.slice(1));
}

/**
 * The confidence line: the LAST prose line carrying `Confidence:` (any markdown emphasis, any trailing form —
 * `Confidence: 70/100`, `**Confidence:** 70 — rationale`). It is located separately so a MISSING line gets its own
 * named reason. Since Step B review B-M4 it must be BYTE-IDENTICAL to the original (`confidence-changed`): an earlier
 * prompt made 7 of 9 adopted corrections drop the Author's rationale (including a safety caveat a Reviewer reads),
 * while the shipping prompt keeps it verbatim 9 of 9 (a5-out-v3) — so the former "reformat allowed" slack was unearned.
 */
const CONFIDENCE_LINE_RE = /\bconfidence\b\**\s*:/i;

function proseSplit(lines: string[], blocks: FencedBlock[]): { prose: string[]; confidence: string | null } {
  const inFence = new Set<number>();
  for (const b of blocks) for (let k = b.openLine - 1; k <= b.closeLine - 1; k++) inFence.add(k);
  const prose = lines.filter((_, k) => !inFence.has(k));
  let ci = -1;
  for (let k = prose.length - 1; k >= 0; k--) if (CONFIDENCE_LINE_RE.test(prose[k])) { ci = k; break; }
  return { prose: prose.filter((_, k) => k !== ci), confidence: ci >= 0 ? prose[ci] : null };
}

function placeholders(text: string): string {
  return ((text || '').match(R10_PLACEHOLDER_RE) ?? []).sort().join('\u0000');
}

/**
 * Walk one NAMED block (a block carrying a trigger hit) original-vs-corrected and require every difference to be one
 * of the named edits:
 *   - an UNDERCOUNT hunk may change ONLY its header line, and the new header must be a numbered hunk header (that its
 *     counts now equal the body is then proved by the zero-trigger-hits condition);
 *   - a SHORT pure-deletion hunk's body may be replaced only by one of its listed source spans, line for line
 *     (`+`→`-` flip allowed) — or left unchanged;
 *   - a LOCATED marker line may be replaced only by one of its listed source spans, line for line — or left unchanged;
 *   - every other line, including the fences, must be byte-identical.
 * Returns null when accounted for, else a short reason.
 */
const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function walkNamedBlock(ob: FencedBlock, cb: FencedBlock, hits: AnalysisHit[]):
  { reason: FormCorrectionNotAdoptedReason; detail: string } | null {
  const fail = (detail: string) => ({ reason: 'content-not-from-named-source' as const, detail });
  const O = ob.raw.split('\n');
  const C = cb.raw.split('\n');
  // Actions keyed by RAW index (body index + 1: raw[0] is the opener).
  const header = new Set<number>();
  const regions = new Map<number, { end: number; fills: string[][] }>();
  const lineFills = new Map<number, string[][]>();
  for (const h of hits) {
    if (h.kind === 'hunk-count-mismatch' && h.hunkRange) {
      const [at, end] = h.hunkRange;
      if (!isShortHunk(h)) header.add(at + 1);
      else if (h.fills?.length) regions.set(at + 2, { end: end + 1, fills: h.fills });
    }
  }
  for (const h of hits) {
    if (h.kind !== 'marker-line-located' || h.markerIndex === undefined || !h.fills?.length) continue;
    const k = h.markerIndex + 1;
    const inRegion = [...regions.entries()].some(([s, r]) => k >= s && k < r.end);
    if (!inRegion) lineFills.set(k, h.fills);
  }
  let i = 0; let j = 0;
  const matchAt = (fill: string[], jj: number) => fill.every((src, n) => jj + n < C.length && sourceLineEq(src, C[jj + n]));
  while (i < O.length) {
    if (header.has(i)) {
      const oh = HUNK_HEADER_RE.exec(O[i]);
      const ch = j < C.length ? HUNK_HEADER_RE.exec(C[j]) : null;
      if (!ch) return fail(`block ${ob.index}: header line ${i} is not a numbered hunk header`);
      if (O[i].replace(/^@@[^@]*@@/, '') !== C[j].replace(/^@@[^@]*@@/, '')) return fail(`block ${ob.index}: header line ${i} changed beyond its counts`);
      // B-M3: only the two COUNTS may move. Both start numbers are pinned to the original's.
      if (!oh || oh[1] !== ch[1] || oh[3] !== ch[3]) {
        return { reason: 'header-start-changed', detail: `block ${ob.index}: ${JSON.stringify(O[i].slice(0, 60))} → ${JSON.stringify(C[j].slice(0, 60))}` };
      }
      i++; j++; continue;
    }
    const region = regions.get(i);
    if (region) {
      const unchanged = O.slice(i, region.end);
      const cands = [unchanged.map((l) => l), ...region.fills];
      const hit = cands.find((f, n) => (n === 0 ? f.every((l, m) => C[j + m] === l) : matchAt(f, j)));
      if (!hit) return fail(`block ${ob.index}: the elided hunk body (raw ${i}–${region.end - 1}) is not one of its named source spans`);
      i = region.end; j += hit.length; continue;
    }
    const fills = lineFills.get(i);
    if (fills) {
      if (C[j] === O[i]) { i++; j++; continue; }
      const hit = fills.find((f) => matchAt(f, j));
      if (!hit) return fail(`block ${ob.index}: the elided line at raw ${i} was replaced by lines that are not one of its named source spans`);
      i++; j += hit.length; continue;
    }
    if (C[j] !== O[i]) return fail(`block ${ob.index}: raw line ${i} changed and no named item covers it`);
    i++; j++;
  }
  return j === C.length ? null : fail(`block ${ob.index}: ${C.length - j} line(s) added after the last named item`);
}

/**
 * The deterministic adoption guard (plan §6, hardened by architectural review H1/H2). Conditions, in order; the first
 * failing one is named:
 *   1. non-empty, `end_turn`, no provider error;
 *   2. zero TRIGGER hits remain, and no hit appears that the original did not carry;
 *   3. the fenced-block count is unchanged, and every block that carries NO TRIGGER hit is byte-identical — a block
 *      with only a fact-only (unlocated) hit is NOT editable (H2);
 *   4. the multiset of R10 placeholders (`<<REDACTED…>>`) is unchanged (M4);
 *   5. prose outside fences is byte-identical; the LAST `Confidence:` line is checked separately — it must be present
 *      when the original had one (`confidence-missing`) and byte-identical to it (`confidence-changed`, review B-M4);
 *   6. PROVENANCE (H1): in each named block, every changed line is a named edit — an undercount changes only its header
 *      COUNTS (both start numbers pinned: `header-start-changed`, review B-M3 — a moved start makes `git apply` patch a
 *      different location when context repeats); an elision is filled only with one of its listed source spans;
 *   7. no IPv4/CIDR/ARN token appears that the original did not contain (a second layer; redundant under 6).
 */
export function checkFormCorrectionAdoption(input: {
  original: string;
  corrected: string | null | undefined;
  stopReason: string | null | undefined;
  providerError?: boolean;
}): AdoptionResult {
  const { original, corrected } = input;
  if (input.providerError) return { adopted: false, notAdoptedReason: 'llm-error' };
  if (!corrected || !corrected.trim()) return { adopted: false, notAdoptedReason: 'empty' };
  if (input.stopReason !== 'end_turn') return { adopted: false, notAdoptedReason: 'not-end-turn' };

  const before = analyzePackageForm(original);
  const after = analyzePackageForm(corrected);
  const postHitsTotal = after.hits.length;
  const remaining = triggerHits(after);
  const postTriggerHitsTotal = remaining.length;
  const no = (notAdoptedReason: FormCorrectionNotAdoptedReason, detail?: string): AdoptionResult =>
    ({ adopted: false, notAdoptedReason, postHitsTotal, postTriggerHitsTotal, ...(detail ? { detail } : {}) });

  if (remaining.length) return no('trigger-hits-remain', remaining.map((h) => `${h.kind}@${h.line}`).join(', '));
  const beforeKeys = new Set(before.hits.map(hitKey));
  const fresh = after.hits.filter((h) => !beforeKeys.has(hitKey(h)));
  if (fresh.length) return no('new-hit', fresh.map(hitKey).join(', '));

  if (after.blocks.length !== before.blocks.length) return no('block-changed', `fenced blocks ${before.blocks.length} → ${after.blocks.length}`);
  const named = triggerHits(before);
  const namedBlocks = new Set(named.map((h) => h.block));
  for (const b of before.blocks) {
    if (namedBlocks.has(b.index)) continue;
    if (after.blocks[b.index - 1].raw !== b.raw) {
      return no('block-changed', `block ${b.index} (${b.lang || 'no lang'}, under "${b.heading}") carries no trigger hit and is not byte-identical`);
    }
  }

  if (placeholders(original) !== placeholders(corrected)) return no('placeholder-changed');

  const sa = proseSplit(before.lines, before.blocks);
  const sb = proseSplit(after.lines, after.blocks);
  const pa = sa.prose; const pb = sb.prose;
  if (pa.length !== pb.length || pa.some((l, k) => l !== pb[k])) {
    const k = pa.findIndex((l, n) => l !== pb[n]);
    const at = k >= 0 ? k : pa.length;
    return no('prose-changed', `first differing prose line: ${JSON.stringify((pb[at] ?? '(missing)').slice(0, 80))} (was ${JSON.stringify((pa[at] ?? '(none)').slice(0, 80))})`);
  }
  if (sa.confidence !== null) {
    if (sb.confidence === null) return no('confidence-missing', `original: ${JSON.stringify(sa.confidence.slice(0, 80))}`);
    if (sb.confidence !== sa.confidence) {
      return no('confidence-changed', `${JSON.stringify(sa.confidence.slice(0, 80))} → ${JSON.stringify(sb.confidence.slice(0, 80))}`);
    }
  } else if (sb.confidence !== null) {
    return no('prose-changed', `a confidence line was added: ${JSON.stringify(sb.confidence.slice(0, 80))}`);
  }

  for (const b of before.blocks) {
    if (!namedBlocks.has(b.index)) continue;
    const why = walkNamedBlock(b, after.blocks[b.index - 1], named.filter((h) => h.block === b.index));
    if (why) return no(why.reason, why.detail);
  }

  const was = addressTokens(original);
  const added = [...addressTokens(corrected)].filter((t) => !was.has(t));
  if (added.length) return no('new-address-token', added.slice(0, 5).join(', '));
  return { adopted: true, postHitsTotal, postTriggerHitsTotal };
}

interface CorrectionLogger {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
}

export interface FormCorrectionInput {
  /** The deliverable text the form check ran on. */
  text: string;
  currentResponse: any;
  /** Mutated in place: the assistant turn + the correction prompt are pushed. */
  messageHistory: any[];
  /** Mutated in place: the correction's usage is folded in (it was spent, adopted or not). */
  totalUsage: AccumulatedUsage;
  prompt: string;
  normalizedLlmConfig: NormalizedModelConfig;
  /** The SAME tool definitions the loop's full calls sent (REQUIRED key — state `undefined` explicitly for a tool-less
   *  run). Preserved-thinking models (`bindsThinkingToPrefix`) re-send them with tool_choice 'none' so the replayed
   *  thinking blocks stay valid; every other model ignores them (legacy no-tools reflection, byte-identical). AUDIT C1. */
  mcpFunctions: LLMRequestOptions['functions'] | undefined;
  executionId: string;
  userId: string | undefined;
  /** Offline replay only. A live caller never sets this; the flag decides. */
  force?: boolean;
  /** Step B scope, set by the live caller: refuse (no LLM call) unless EVERY hit is an undercount (B-M1). */
  undercountOnly?: boolean;
}

export interface FormCorrectionDeps {
  generateText: (prompt: string, options: any, userId?: string) => Promise<any>;
  logger: CorrectionLogger;
  env?: Record<string, string | undefined>;
}

/** Presentation hooks (the #90 observer pattern). The stream wires two SSE emissions; the engine passes none. */
export interface FormCorrectionObservers {
  /** Entering the turn (fires BEFORE the LLM call). Stream: a "Form check: …" log_update. */
  onFormCorrectionStart?: (triggerHits: number) => Promise<void> | void;
  /** The turn returned (adopted or not; never on a throw). Stream: the corrected text as a text_chunk when adopted,
   *  otherwise a log_update naming the guard's reason. `text` is the corrected text when adopted, else ''. */
  onFormCorrectionComplete?: (result: { adopted: boolean; notAdoptedReason?: FormCorrectionNotAdoptedReason; text: string }) => Promise<void> | void;
}

export interface FormCorrectionResult {
  /** The deliverable — the correction when adopted, otherwise the ORIGINAL by reference. */
  text: string;
  currentResponse: any;
  correction: FormCorrectionFact;
  /** The raw correction output, adopted or not (replay/forensics). */
  correctedText: string | null;
  adoption: AdoptionResult | null;
  correctionPrompt: string | null;
  /** Set only when the correction CALL errored (provider error response or throw) — the core stamps it into
   *  `toolLoop.reflectionErrors` beside `formCheck.correction.notAdoptedReason: 'llm-error'` (AUDIT 2026-10-07). */
  reflectionError?: ReflectionErrorFact;
}

const MAX_EDITS = 8;
const MAX_EDIT_CHARS = 120;
const capEdit = (l: string) => {
  const r = redactArtifactSecrets(l).redacted;
  return r.length > MAX_EDIT_CHARS ? r.slice(0, MAX_EDIT_CHARS - 1) + '…' : r;
};

/**
 * Review B-M5: the lines an ADOPTED correction changed, so the original package is reconstructible from the persisted
 * text and kill criterion 1 ("a reviewer blocks on a line the correction changed") is exact. Under the Step B scope
 * the guard allows only hunk-header count changes, so the line count is equal and the diff is line-for-line. A
 * correction that changed the line count (replay-only elision fills) stamps `editsUnaligned: true` instead.
 */
export function correctionEdits(original: string, corrected: string):
  Pick<FormCorrectionFact, 'edits' | 'editsTotal' | 'editsUnaligned'> {
  const O = original.split('\n');
  const C = corrected.split('\n');
  if (O.length !== C.length) return { editsUnaligned: true };
  const all: Array<{ line: number; before: string; after: string }> = [];
  for (let k = 0; k < O.length; k++) {
    if (O[k] !== C[k]) all.push({ line: k + 1, before: capEdit(O[k]), after: capEdit(C[k]) });
  }
  return { edits: all.slice(0, MAX_EDITS), editsTotal: all.length };
}

/**
 * Review B-L2: the not-adopted reasons rendered as NEUTRAL observations about the discarded correction — never as a
 * finding about the Author's package. The stamped fact keeps the code; surfaces (the GUI log, the lean card) render
 * this phrase. Mirrored in lean-card-facts.js (plain JS); `test:lean-card-facts` pins the two maps equal.
 */
export const NOT_ADOPTED_PHRASES: Readonly<Record<FormCorrectionNotAdoptedReason, string>> = Object.freeze({
  'empty': 'empty correction',
  'llm-error': 'correction call failed',
  'not-end-turn': 'correction did not end normally',
  'trigger-hits-remain': 'trigger hits remain in the correction',
  'new-hit': 'a hit absent from the original appears',
  'block-changed': 'an unnamed block differs',
  'placeholder-changed': 'placeholder set differs',
  'prose-changed': 'prose outside fences differs',
  'confidence-missing': 'confidence line absent',
  'confidence-changed': 'confidence line differs',
  'header-start-changed': 'hunk start line differs',
  'content-not-from-named-source': 'content outside named lines',
  'new-address-token': 'address token absent from the original',
});

export function describeNotAdopted(reason: FormCorrectionNotAdoptedReason | undefined): string {
  return `guard: ${(reason && NOT_ADOPTED_PHRASES[reason]) || 'no reason given'}`;
}

export async function runFormCorrection(
  input: FormCorrectionInput,
  deps: FormCorrectionDeps,
  observers: FormCorrectionObservers = {},
): Promise<FormCorrectionResult> {
  const { text, messageHistory, totalUsage, prompt, normalizedLlmConfig, executionId, userId } = input;
  const { generateText, logger } = deps;
  // A presentation hook must never decide the deliverable: a throwing observer (a dead SSE client) is logged and
  // absorbed, the same way #90's observers sit inside its non-fatal try.
  const notify = async (fn: () => Promise<void> | void) => {
    try { await fn(); } catch (err) {
      logger.warn({ executionId, err: err instanceof Error ? err.message : String(err) }, 'Form correction: observer threw — ignored');
    }
  };
  const unchanged = (correction: FormCorrectionFact): FormCorrectionResult => ({
    text, currentResponse: input.currentResponse, correction, correctedText: null, adoption: null, correctionPrompt: null,
  });

  if (!input.force && !isFormCorrectionEnabled(deps.env ?? process.env)) {
    return unchanged({ attempted: false, notAttemptedReason: 'flag-off' });
  }
  const analysis = analyzePackageForm(text);
  const trig = triggerHits(analysis);
  if (!trig.length) return unchanged({ attempted: false, notAttemptedReason: 'no-trigger-hit' });
  if (input.undercountOnly && !allHitsAreUndercounts(analysis)) {
    return unchanged({ attempted: false, notAttemptedReason: 'hits-include-non-undercount' });
  }

  const correctionPrompt = buildFormCorrectionPrompt(analysis);
  messageHistory.push({ role: 'assistant', content: input.currentResponse?.rawContentBlocks ?? input.currentResponse?.text ?? text });
  messageHistory.push({ role: 'user', content: [{ type: 'text', text: correctionPrompt }] });
  logger.info({ executionId, triggerHits: trig.length }, 'Form correction: requesting one tool-less correction pass');
  await notify(() => observers.onFormCorrectionStart?.(trig.length));

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 600_000);
  const started = Date.now();
  let response: any;
  try {
    response = await generateText(prompt, buildLlmCallOptions(normalizedLlmConfig, 'reflection', {
      signal: abort.signal, mcpFunctions: input.mcpFunctions, messages: messageHistory as any,
    }), userId);
  } catch (err) {
    clearTimeout(timer);
    logger.warn({ executionId, err: err instanceof Error ? err.message : String(err) }, 'Form correction failed — keeping the original package');
    const f = reflectionErrorFact('form_correction', null, err);
    if (f) warnReflectionError(logger, executionId, f, err instanceof Error ? err.message : String(err));
    return { ...unchanged({ attempted: true, adopted: false, notAdoptedReason: 'llm-error', durationMs: Date.now() - started }), correctionPrompt,
      ...(f ? { reflectionError: f } : {}) };
  }
  clearTimeout(timer);
  const durationMs = Date.now() - started;
  addUsage(totalUsage, response?.usage);
  const providerError = !!response?.error?.message;
  if (providerError) {
    logger.error({ executionId, apiErrorMessage: response.error.message }, 'Form correction: provider returned an error response');
  }
  const reflectionError = reflectionErrorFact('form_correction', response);
  if (reflectionError) warnReflectionError(logger, executionId, reflectionError, response?.error?.message);
  const withErr = reflectionError ? { reflectionError } : {};
  const correctedText: string | null = typeof response?.text === 'string' ? response.text : null;
  const adoption = checkFormCorrectionAdoption({ original: text, corrected: correctedText, stopReason: response?.stopReason, providerError });
  const u = response?.usage;
  const correction: FormCorrectionFact = {
    attempted: true, adopted: adoption.adopted,
    ...(adoption.notAdoptedReason ? { notAdoptedReason: adoption.notAdoptedReason } : {}),
    ...(adoption.postHitsTotal !== undefined ? { postHitsTotal: adoption.postHitsTotal } : {}),
    ...(adoption.postTriggerHitsTotal !== undefined ? { postTriggerHitsTotal: adoption.postTriggerHitsTotal } : {}),
    ...(adoption.adopted ? correctionEdits(text, correctedText as string) : {}),
    inputTokens: u?.inputTokens, outputTokens: u?.outputTokens,
    // B-L3: the live turn carries the whole cached tool history, so most of its input may be cache tokens.
    ...(typeof u?.cacheReadTokens === 'number' ? { cacheReadTokens: u.cacheReadTokens } : {}),
    ...(typeof u?.cacheCreationTokens === 'number' ? { cacheCreationTokens: u.cacheCreationTokens } : {}),
    durationMs,
  };
  logger.info({ executionId, ...correction, detail: adoption.detail }, 'Form correction: completed');
  await notify(() => observers.onFormCorrectionComplete?.({
    adopted: adoption.adopted,
    ...(adoption.notAdoptedReason ? { notAdoptedReason: adoption.notAdoptedReason } : {}),
    text: adoption.adopted ? (correctedText as string) : '',
  }));
  if (!adoption.adopted) {
    return { text, currentResponse: input.currentResponse, correction, correctedText, adoption, correctionPrompt, ...withErr };
  }
  return { text: correctedText as string, currentResponse: response, correction, correctedText, adoption, correctionPrompt, ...withErr };
}
