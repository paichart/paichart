/**
 * Requirements FORM CHECK — the in-run publish checks for a `requirements_author` draft (2026-10-09). WIRED (2b,
 * 2026-10-09) by `execution-core.ts` through requirements-form-correction.ts: stamped as `toolLoop.requirementsFormCheck`
 * on every eligible execution; the correction turn sits behind REQUIREMENTS_FORM_CORRECTION_ENABLED (default OFF).
 *
 * Why: the requirements pipeline's release gate and the publish gates were decoupled — gen 9 was APPROVED 94 and the
 * publish pass refused it (size, coverage, lint), and every finding reached the Author only through the next run's
 * objective text. Steve's rule (2026-10-09): release-true ⇒ publishable. So the publish checks must run INSIDE the run
 * as facts. Record: cline_docs/reviews/requirements-author-retrospective-2026-10-09/SYNTHESIS.md (A–D1) + PORT-NOTE.md.
 *
 * The checks are TypeScript ports of the operator tools, held to them by a corpus parity test
 * (scripts/test-requirements-form-check-parity.ts — identical findings on the 9 trial drafts, every published spec and
 * every Python-suite fixture):
 *   coverage   ← scripts/check-requirements-coverage.py        (requirements-coverage.ts)
 *   citations  ← scripts/check-requirements-citations.py       (requirements-citations.ts)
 *   clauses    ← scripts/check-requirements-clauses.py         (requirements-clauses.ts)
 *   size, lint ← ~/paichart/scripts/requirements-rules.py      (requirements-size-lint.ts)
 *   residue    — new here (no Python counterpart): `{{`, 🗑, and the author-addressed skeleton openings
 *
 * PURE: text in, fact out. The registry and the lint's template allowlist are generated constants
 * (requirements-form-check.generated.ts, drift-pinned), so nothing reads the filesystem on the hot path.
 *
 * Protocol 10: every field is a count, a location, a transcription of a check's own finding, or a size. No field
 * asserts the document is publishable — see PORT-NOTE.md §5 for why `publishable` is NOT on the fact (the lint is a
 * pre-filter whose zero "does not replace the full human read", by its own docstring).
 */
import { checkCoverage, CoverageFinding, h2Spans } from './requirements-coverage';
import { checkCitations } from './requirements-citations';
import { checkClauses, rowItemMapFromAnswers, rowItemMapFromDraft, RowItemMap, DroppedClause } from './requirements-clauses';
import { deliveredEstimate, lintHarvestedState, LintHit, PER_FILE_MAX, programView, sizeOf, strayRuleCitations, ENVELOPE } from './requirements-size-lint';
import { cpSlice, pyJsonDumpsStr, pySplit } from './requirements-pysem';
import { REQUIREMENTS_REGISTRY, REQUIREMENTS_REGISTRY_SHA256, REQUIREMENTS_TEMPLATE_SHA256, REQUIREMENTS_TEMPLATE_TEXT } from './requirements-form-check.generated';

export const REQUIREMENTS_FORM_CHECK_VERSION = 1;
/** The ONE eligible role, by EXACT match (never a regex — `/author/i` also matches `config_change_author`). */
export const REQUIREMENTS_FORM_CHECK_ELIGIBLE_ROLE = 'requirements_author';
/** Findings persisted per check (each list's full count rides beside it). */
export const REQUIREMENTS_FORM_CHECK_MAX_FINDINGS = 12;

export function isRequirementsFormCheckEligible(agentRole: string | null | undefined, taskType: string | null | undefined): boolean {
  return taskType !== 'PIPELINE' && agentRole === REQUIREMENTS_FORM_CHECK_ELIGIBLE_ROLE;
}

// ── Template residue ─────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Skeleton sentences addressed to the AUTHOR (not to the Program Architect or a leg) that survive outside the 🗑
 * register — review-prompt-construction.md §1.4, the rows marked **Author**. Each is matched on the sentence's OPENING,
 * after removing `*` and backticks and collapsing whitespace, so bold/italic re-wrapping still matches. A FACT ONLY:
 * the current protocol (1.8.0) tells the Author these are binding content to copy, so counting them as blocking would
 * fail every draft until the template change (retrospective rank 4) lands — that is the consumer's decision.
 */
export const AUTHOR_ADDRESSED_OPENINGS: ReadonlyArray<{ id: string; opening: string }> = Object.freeze([
  { id: 'definition-above', opening: 'see the definition above' },
  { id: 'state-why-not-knowable', opening: 'State why the value is not knowable up front' },
  { id: 'approvers-declared', opening: 'Approvers are DECLARED, never chosen' },
  { id: 'fill-the-table', opening: 'Fill the table with both columns' },
  { id: 'value-produced-by', opening: 'Write "the value produced by X", never a bare' },
  { id: 'producing-team-gate', opening: 'A gate the producing team can release for itself is not a gate' },
  { id: 'dependency-consequence', opening: 'Then state the dependency consequence explicitly' },
  { id: 'verify-the-premise', opening: 'Verify the PREMISE before you write the objective' },
  { id: 'null-case-back-reference', opening: 'STATE THE NULL CASE clause under Pipeline 1 is not derivation-specific' },
  { id: 'evidence-where-reader-looks', opening: 'Require evidence where its READER looks' },
  { id: 'status-note-honestly', opening: 'When you write a status note for a mechanism like this, write it honestly' },
]);

const normResidue = (s: string) => pySplit(s.replace(/[*`]/g, '')).join(' ');

export interface ResidueHit { what: 'placeholder' | 'delete-mark' | 'author-addressed'; id?: string; line: number; section: string }
export interface ResidueResult { placeholders: number; deleteMarks: number; authorAddressed: number; hits: ResidueHit[] }

/** Count residue in `text` (the caller passes the program view — what the Program Architect reads). Line-based; an
 *  opening that a Markdown re-wrap split across two lines is not seen (named limit). */
export function countResidue(text: string): ResidueResult {
  const hits: ResidueHit[] = [];
  let section = '(preamble)';
  let placeholders = 0, deleteMarks = 0, authorAddressed = 0;
  const openings = AUTHOR_ADDRESSED_OPENINGS.map(o => ({ id: o.id, n: normResidue(o.opening) }));
  text.split('\n').forEach((line, i) => {
    if (line.startsWith('## ')) section = line.slice(3).trim();
    const p = line.split('{{').length - 1;
    const d = line.split('🗑').length - 1;
    if (p) { placeholders += p; hits.push({ what: 'placeholder', line: i + 1, section }); }
    if (d) { deleteMarks += d; hits.push({ what: 'delete-mark', line: i + 1, section }); }
    const n = normResidue(line);
    for (const o of openings) {
      if (n.includes(o.n)) { authorAddressed++; hits.push({ what: 'author-addressed', id: o.id, line: i + 1, section }); }
    }
  });
  return { placeholders, deleteMarks, authorAddressed, hits };
}

// ── Per-section size attribution (REQ-SPEC-LEARNING-LOOP stage 1) ──────────────────────────────────────────────────
export interface SectionSize { section: string; raw: number; delivered: number }
/**
 * Each `## ` section's share of the DELIVERED size. The delivered estimate is escape-width per character, so it is
 * additive: Σ section.delivered + 4 + ENVELOPE === deliveredEstimate(text) (pinned in the unit test). `raw` is code
 * points; `delivered` is the section's doubly-JSON-escaped width (its two quote pairs excluded).
 */
export function sectionSizes(text: string): SectionSize[] {
  const spans = h2Spans(text);
  const parts: Array<{ section: string; body: string }> = [];
  const first = spans.length ? spans[0].start : text.length;
  if (first > 0) parts.push({ section: '(preamble)', body: text.slice(0, first) });
  for (const s of spans) parts.push({ section: s.title.trim(), body: text.slice(s.start, s.end) });
  return parts.map(p => ({ section: cpSlice(p.section, 80), raw: Array.from(p.body).length, delivered: pyJsonDumpsStr(pyJsonDumpsStr(p.body)).length - 6 }));
}

// ── The fact ─────────────────────────────────────────────────────────────────────────────────────────────────────
export type RowItemMapSource = 'owner-map' | 'draft-citations';
export type RequirementsFormCheckReason = 'checked' | 'not-end-turn' | 'empty-deliverable' | 'checker-error';

export interface RequirementsFormCheckFact {
  version: number;
  checked: boolean;
  reason: RequirementsFormCheckReason;
  registrySha256: string;
  templateSha256: string;
  size: null | {
    /** Whether the Writing rules section was found (the program view replaces it); without one the RAW draft is measured. */
    measured: 'program-view' | 'raw-draft';
    programViewRaw: number;
    programViewDelivered: number;
    limit: number;
    headroom: number;
    pages: number;
    /** Writing-rules numbers the body cites that the program view's reading notes do not gloss (the CLI refuses these). */
    strayRuleCitations: number[];
    sections: SectionSize[];
  };
  coverage: null | { errorsTotal: number; authorActionableTotal: number; errors: CoverageFinding[]; readTotal: number };
  citations: null | { total: number; verbatim: number; findingsTotal: number; findings: string[]; premise: Array<[string, boolean]> };
  clauses: null | { itemMapSource: RowItemMapSource; checked: number; droppedTotal: number; dropped: DroppedClause[] };
  lint: null | { declaredObjective: boolean; hitsTotal: number; hits: LintHit[] };
  residue: null | { placeholders: number; deleteMarks: number; authorAddressed: number; hits: ResidueHit[] };
}

export interface RequirementsFormAnalysisInput {
  /** The Author's deliverable (report.md / finalResponse). */
  draft: string;
  /** The objective text holding the numbered DESIGN DECISIONS (the harness task's objective). */
  objective: string;
  /** The owner's ROW-ITEM-MAP text (answers.md form) when the launch carries it; else the draft-derived map is used. */
  ownerRowItemMap?: string | null;
  /** The owner's map already PARSED (the in-run path: the harness task's `metadata.requirementsRowItemMap`, converted by
   *  `parseOwnerRowItemMap` in requirements-form-correction.ts). Takes precedence over the text form. Added at the 2b
   *  wiring (2026-10-09); the parity test feeds the text form and is unaffected. */
  ownerRowItemMapParsed?: RowItemMap | null;
  /** A row↔item map FROZEN from an earlier analysis (G1 A, 2026-10-10): the correction re-check passes the BEFORE
   *  analysis's map so the dropped-clause obligations cannot be re-derived from — and so deleted with — the corrected
   *  draft. Takes precedence over both other forms; `source` is carried so the fact still names where the map came from. */
  frozenRowItemMap?: { map: RowItemMap; source: RowItemMapSource } | null;
}

export interface RequirementsFormAnalysis {
  view: string;
  measured: 'program-view' | 'raw-draft';
  rowItemMap: RowItemMap;
  itemMapSource: RowItemMapSource;
  coverage: ReturnType<typeof checkCoverage>;
  citations: ReturnType<typeof checkCitations>;
  clauses: ReturnType<typeof checkClauses>;
  lint: LintHit[];
  residue: ResidueResult;
}

/** UNCAPPED analysis — what a correction prompt would read (never persisted whole). */
export function analyzeRequirementsForm(input: RequirementsFormAnalysisInput): RequirementsFormAnalysis {
  const pv = programView(input.draft);
  const view = pv ? pv.view : input.draft;
  const itemMapSource: RowItemMapSource = input.frozenRowItemMap
    ? input.frozenRowItemMap.source
    : (input.ownerRowItemMapParsed || input.ownerRowItemMap) ? 'owner-map' : 'draft-citations';
  const rowItemMap = input.frozenRowItemMap
    ? input.frozenRowItemMap.map
    : input.ownerRowItemMapParsed
      ? input.ownerRowItemMapParsed
      : input.ownerRowItemMap ? rowItemMapFromAnswers(input.ownerRowItemMap) : rowItemMapFromDraft(input.draft);
  return {
    view, measured: pv ? 'program-view' : 'raw-draft', rowItemMap, itemMapSource,
    coverage: checkCoverage(input.draft, REQUIREMENTS_REGISTRY),
    citations: checkCitations(input.objective, input.draft),
    clauses: checkClauses(input.objective, rowItemMap, input.draft),
    lint: lintHarvestedState(input.draft, REQUIREMENTS_TEMPLATE_TEXT + '\n' + input.objective),
    residue: countResidue(view),
  };
}

/**
 * Coverage findings the Author cannot fix (stage A, 2026-10-09 — Steve option (b); narrowed by B-2, 2026-10-12). Two
 * kinds remain: an invented row that ASKS a decision no registry key and no owner item asks (it is the owner's to
 * answer, as a new numbered item, and a registry candidate), and the checker inferring the authorisation class from a
 * producer leg's `target-absent` row (Z17). An Author "correcting" them would delete an owner question, or add
 * authorisation rows to a leg the owner ruled changes nothing. They stay on the fact (errors / errorsTotal) but never
 * TRIGGER a correction and never appear in its MESSAGE. An invented row that RESTATES item N is NOT here since B-2: it
 * is Author-actionable (re-key it `<token>.item-<N>`, which keeps every citation) and triggers the correction.
 * ⚠️ Remove the Z17 arm when `target-absent` moves to the leg class.
 */
export function isRegistryCausedCoverageFinding(f: { what?: string }): boolean {
  const w = f.what || '';
  return w.startsWith('invented key asks a decision') || w.startsWith('authorisation leg lists authorisation rows not-applicable');
}

export function computeRequirementsFormCheckFact(input: RequirementsFormAnalysisInput & {
  stopReason: string | null | undefined;
  onCheckerError?: (message: string) => void;
}): RequirementsFormCheckFact {
  const base = { version: REQUIREMENTS_FORM_CHECK_VERSION, registrySha256: REQUIREMENTS_REGISTRY_SHA256, templateSha256: REQUIREMENTS_TEMPLATE_SHA256 };
  const unchecked = (reason: RequirementsFormCheckReason): RequirementsFormCheckFact => ({
    ...base, checked: false, reason, size: null, coverage: null, citations: null, clauses: null, lint: null, residue: null,
  });
  if (input.stopReason !== 'end_turn') return unchecked('not-end-turn');
  if (!input.draft || !input.draft.trim()) return unchecked('empty-deliverable');
  try {
    const a = analyzeRequirementsForm(input);
    const M = REQUIREMENTS_FORM_CHECK_MAX_FINDINGS;
    const s = sizeOf(a.view);
    return {
      ...base, checked: true, reason: 'checked',
      size: {
        measured: a.measured, programViewRaw: s.raw, programViewDelivered: s.delivered, limit: PER_FILE_MAX,
        headroom: s.headroom, pages: s.pages, strayRuleCitations: strayRuleCitations(input.draft), sections: sectionSizes(a.view),
      },
      coverage: { errorsTotal: a.coverage.errors.length, authorActionableTotal: a.coverage.errors.filter((e) => !isRegistryCausedCoverageFinding(e)).length,
        errors: a.coverage.errors.slice(0, M), readTotal: a.coverage.read.length },
      citations: { total: a.citations.total, verbatim: a.citations.verbatim, findingsTotal: a.citations.findings.length, findings: a.citations.findings.slice(0, M), premise: a.citations.premise },
      clauses: { itemMapSource: a.itemMapSource, checked: a.clauses.checked, droppedTotal: a.clauses.dropped.length, dropped: a.clauses.dropped.slice(0, M) },
      lint: { declaredObjective: true, hitsTotal: a.lint.length, hits: a.lint.slice(0, M) },
      residue: { placeholders: a.residue.placeholders, deleteMarks: a.residue.deleteMarks, authorAddressed: a.residue.authorAddressed, hits: a.residue.hits.slice(0, M) },
    };
  } catch (err) {
    try { input.onCheckerError?.(err instanceof Error ? err.message : String(err)); } catch { /* a logger must not fail the run */ }
    return unchecked('checker-error');
  }
}

/** The delivered-size identity the per-section attribution relies on (exported for the pin). */
export function sectionSizesSumToDelivered(text: string): boolean {
  return sectionSizes(text).reduce((n, s) => n + s.delivered, 0) + 4 + ENVELOPE === deliveredEstimate(text);
}
