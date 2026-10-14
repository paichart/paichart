/**
 * apply-block-placeholder.ts — does a change package carry an R10 secret placeholder inside a block an operator
 * APPLIES? Pure, zero-DB. PLACEHOLDER-APPLIES-AS-LITERAL interim guard, built 2026-10-13 (owner decision (a):
 * warning-only fact, no gate, no agent-facing text; cline_docs/reviews/platform-held-bytes-2026-10-13/P4-DEVICE-CHECK.md
 * §5–§6, PLACEHOLDER-GUARD-BUILD.md).
 *
 * WHY CODE. Device-verified on the lab rigs (P4 §3): EOS accepts both placeholder spellings as literal values on
 * community / `secret 0` / `enable password 0` / TACACS key lines, and a whole-file `configure replace` with a redacted
 * hash line DELETED the only admin user while printing "Copy completed successfully". nginx `proxy_set_header` and
 * otelcol header/auth values pass `nginx -t` / `otelcol validate` with the placeholder as the literal. So a green
 * validator proves nothing, and nothing in the package text tells the operator which lines are unsafe to apply.
 * Stored corpus (P4 §6, 316 Author packages): 2 hazardous packages (terraform, 2026-07-15, both refused), 0 released.
 *
 * ONE QUESTION (the 2026-09-20 ruling). For each line of the package as it will be PERSISTED (R10 applied — the text an
 * operator reads in result.json / report.md): is it inside a fenced block, does the classifier read that block as
 * content the operator applies (desired state or rollback), and does it carry a placeholder form? It says nothing about
 * whether the slot is a secret, whether the device would accept it, or whether the package is otherwise safe.
 *
 * WHO DECIDES THE ROLE — no second classifier:
 *   • Fence boundaries: `parseFencedBlocks` (package-form-check.ts — CommonMark ``` / ~~~ with length-matched closers).
 *   • Block role: `fencedBlockLines` (dialect-lint.ts, `DIALECT_LINT_CLASSIFIER` — recorded on the fact as `classifier`),
 *     read per line at the same 1-based document line. `restoreIntent` (heading ancestry) or `kind: 'rollback'` ⇒
 *     `rollback`; `kind: 'candidate-config'`, or a block under a desired-state heading (quote-fidelity's
 *     `DESIRED_STATE_HEADING_RE`, the ancestry rule for a desired file labelled "replaces the baseline") ⇒ `desired`.
 *     Expected output (kind or label), harvested state (evidence) and read-only `command` blocks are NOT apply blocks.
 *   • A placeholder line inside a fence the classifier's own walk did not emit (a ~~~ fence, a longer-fence nesting it
 *     mis-pairs) is `unclassified` and COUNTED: an unreadable role is not evidence of safety.
 *   Known residuals of that classifier, inherited on purpose (each errs toward a WARNING, never toward silence, except
 *   the last): (1) a harvested-evidence block quoted under a Rollback heading reads `rollback`; (2) a read-only command
 *   in a dialect whose verbs the classifier does not enumerate (`aws s3api get-…`) reads `desired`; (3) a command block
 *   under a Rollback heading reads `rollback`. Two FALSE-NEGATIVE shapes (not counted): (4) a desired-state block whose
 *   label OR heading ancestry carries a harvest word (`HARVESTED_STATE_PROSE`: "existing config", "pre-change",
 *   "baseline", "current config"…) reads `harvested-state` unless an ancestor heading also matches
 *   `DESIRED_STATE_HEADING_RE` — e.g. a block under "## Changes to the existing config" is missed; (5) a one-line
 *   `sed -i …` block reads `command` (`OPERATOR_VERB` lists `sed`) although it writes. The MI-13 "placeholder anywhere"
 *   control is the watch on both.
 *
 * PLACEHOLDER FORMS — derived, never re-typed. `<<REDACTED-SECRET>>` is R10's own constant (`PLACEHOLDER`), and its
 * `<<REDACTED…>>` siblings are `R10_PLACEHOLDER_RE` (package-form-check.ts; pinned to match the constant). The
 * single-angle `<REDACTED-SECRET>` (the terraform Harvester's protocol spelling) is that constant with one angle pair
 * removed, and its family (`<REDACTED…>`, Author-invented variants included) is the sibling regex with one pair
 * removed. Substring match, no position or quoting rule (P4 §5.2: accepted quoted, bare, as a YAML scalar, inside a
 * header value). A later slot token (P3's `⟦S…⟧`) is one more entry on `APPLY_BLOCK_PLACEHOLDER_FORMS`. Not covered
 * (none in the corpus): lowercase, HTML-escaped (`&lt;REDACTED…`), an inner part over 40 chars, `[REDACTED]` / `***`.
 *
 * PROTOCOL 10 — an agent-VISIBLE FACT, with NO agent-facing instruction text (owner (a); Protocol 16 does not apply, the
 * quoteFidelity precedent). No disposition, no gate, no consumer. It is NOT on `RESULT_JSON_SUMMARY_KEYS`, so it is not
 * on the lean card or in the summary — but it IS in the raw result.json, which a verbose `agent.results` returns (the
 * orchestrator protocol's only route to a child's result.json): every leg SYNTHESIZE that reads its Author verbosely
 * can see it. It is persisted AFTER `toolCalls` (`RESULT_JSON_OPERATOR_TAIL_KEYS`), past the 8 KB tool-result head in
 * practice, so it costs that head nothing and does not move `finalResponse`; a reader that pages still reaches it.
 * Its one render is the platform-written "Platform warnings (non-blocking)" section of the LEG report.md, on hit legs
 * only (`appendApplyBlockPlaceholderSection`, lib/services/report-warnings-section.ts). A leg report.md is chained to
 * consuming legs, Node C and the program producer, so on a hit leg those agents read the section too.
 *
 * SIZE (as persisted, pretty-printed by the terminal persist): clean ~107 B; worst case (5 hits, 4-digit lines, longest
 * role/form) ≈ 640 B. No line TEXT is persisted (it would carry the token and self-match every SQL trigger).
 */

import { PLACEHOLDER, redactArtifactsForPersist } from './redact-artifact-secrets';
import { parseFencedBlocks, R10_PLACEHOLDER_RE } from './package-form-check';
import { fencedBlockLines, DIALECT_LINT_CLASSIFIER, type FencedBlockLine } from './dialect-lint';
import { DESIRED_STATE_HEADING_RE } from './quote-fidelity';

export const APPLY_PLACEHOLDER_VERSION = 1;
/** Hits persisted on the fact; the full count rides in `count`. */
export const APPLY_PLACEHOLDER_MAX_HITS = 5;

// ── Code-mutation switch (TEST ONLY) — the package-form-check shape: ONE mutation for the duration of a SYNCHRONOUS
// callback, always restored, so an importer cannot flip a rule process-wide. Used only by
// scripts/test-apply-block-placeholder.ts to prove each rule's code branch is load-bearing.
export type ApplyPlaceholderMutation =
  | 'no-expected-exclusion' | 'no-evidence-exclusion' | 'no-fence-authority' | 'no-persist-redaction'
  | 'no-single-angle' | 'no-unclassified';
const ACTIVE_MUTATIONS = new Set<ApplyPlaceholderMutation>();
export function withApplyPlaceholderMutation<T>(m: ApplyPlaceholderMutation, fn: () => T): T {
  ACTIVE_MUTATIONS.add(m);
  try { return fn(); } finally { ACTIVE_MUTATIONS.delete(m); }
}
const mut = (m: ApplyPlaceholderMutation) => ACTIVE_MUTATIONS.size > 0 && ACTIVE_MUTATIONS.has(m);

/** `<REDACTED-SECRET>` — R10's constant with ONE angle pair removed (derived, never typed). */
export const SINGLE_ANGLE_PLACEHOLDER = PLACEHOLDER.slice(1, -1);

export type PlaceholderFormId = 'r10' | 'single-angle';
/**
 * Every placeholder form this fact looks for, in match order. `r10` = R10's constant and its `<<REDACTED…>>` siblings;
 * `single-angle` = `<REDACTED…>` NOT inside a double-angle one. Extend here, never at a call site.
 */
export const APPLY_BLOCK_PLACEHOLDER_FORMS: ReadonlyArray<{ id: PlaceholderFormId; re: RegExp }> = Object.freeze([
  { id: 'r10' as const, re: new RegExp(R10_PLACEHOLDER_RE.source) },
  // The single-angle FAMILY: R10's sibling regex with one angle pair removed, so `<REDACTED-SECRET>` and the variants
  // Authors invent (`<REDACTED-SNMP-RO-COMMUNITY>`, `<REDACTED-BY-HARVESTER: user-secret-hash>` — 3 stored
  // packages, all in prose on 2026-10-13) are one form. A device takes any of them as a literal.
  { id: 'single-angle' as const, re: new RegExp(`(?<!<)${R10_PLACEHOLDER_RE.source.slice(1, -1)}(?!>)`) },
]);

/** The first placeholder form a line carries, or null. */
export function placeholderFormOf(line: string): PlaceholderFormId | null {
  for (const f of APPLY_BLOCK_PLACEHOLDER_FORMS) {
    if (f.id === 'single-angle' && mut('no-single-angle')) continue;
    if (f.re.test(line)) return f.id;
  }
  return null;
}

export type ApplyRole = 'desired' | 'rollback' | 'unclassified';

/** The role of one classified line, or null when the classifier reads it as something the operator does not apply. */
export function applyRoleOf(l: FencedBlockLine): Exclude<ApplyRole, 'unclassified'> | null {
  if (l.kind === 'expected-output' || l.label === 'expected-output') return mut('no-expected-exclusion') ? 'desired' : null;
  if (l.restoreIntent || l.kind === 'rollback') return 'rollback';
  if (l.kind === 'candidate-config') return 'desired';
  if (l.kind === 'harvested-state' && DESIRED_STATE_HEADING_RE.test(l.ancestry)) return 'desired';
  return mut('no-evidence-exclusion') ? 'desired' : null;
}

export interface ApplyPlaceholderHit { line: number; role: ApplyRole; form: PlaceholderFormId }

/**
 * The pure check, over text ALREADY in its persisted form. `count` is apply-block LINES carrying a placeholder.
 */
export function scanApplyBlockPlaceholders(persistedText: string): { count: number; hits: ApplyPlaceholderHit[] } {
  const classified = new Map<number, FencedBlockLine>();
  for (const l of fencedBlockLines(persistedText)) classified.set(l.line, l);
  const hits: ApplyPlaceholderHit[] = [];
  if (mut('no-fence-authority')) {
    persistedText.split('\n').forEach((text, k) => {
      const form = placeholderFormOf(text);
      if (form) hits.push({ line: k + 1, role: classified.has(k + 1) ? applyRoleOf(classified.get(k + 1)!) ?? 'desired' : 'desired', form });
    });
    return { count: hits.length, hits };
  }
  for (const b of parseFencedBlocks(persistedText)) {
    b.body.forEach((text, k) => {
      const form = placeholderFormOf(text);
      if (!form) return;
      const line = b.openLine + 1 + k;
      const c = classified.get(line);
      const role: ApplyRole | null = c ? applyRoleOf(c) : (mut('no-unclassified') ? null : 'unclassified');
      if (role) hits.push({ line, role, form });
    });
  }
  return { count: hits.length, hits };
}

/**
 * The fact. `deliverable` is the Author's in-flight finalResponse; it is passed through the SHARED persist helper
 * (`redactArtifactsForPersist`, flag included) first, so the fact describes the bytes the operator reads — a real secret
 * the Author copied becomes a placeholder at persist, and this sees it.
 */
export function computeApplyBlockPlaceholderFact(deliverable: string | null | undefined): Record<string, unknown> {
  if (typeof deliverable !== 'string' || deliverable.trim() === '') {
    return { version: APPLY_PLACEHOLDER_VERSION, checked: false, reason: 'empty-deliverable', count: 0 };
  }
  const persisted = mut('no-persist-redaction') ? deliverable
    : (redactArtifactsForPersist({ finalResponse: deliverable }, null).resultJson as { finalResponse: string }).finalResponse;
  const { count, hits } = scanApplyBlockPlaceholders(persisted);
  return {
    version: APPLY_PLACEHOLDER_VERSION,
    checked: true,
    classifier: DIALECT_LINT_CLASSIFIER,
    count,
    ...(count > 0 ? { hits: hits.slice(0, APPLY_PLACEHOLDER_MAX_HITS) } : {}),
  };
}

export const PLATFORM_WARNINGS_HEADING = '## Platform warnings (non-blocking)';
export const APPLY_PLACEHOLDER_WARNING_ID = 'placeholder-in-apply-block';
