/**
 * rollback-containment.ts — mechanical net #3. Is the content a change package promises to RESTORE
 * actually present in the harvest this leg itself witnessed?
 *
 * WHY CODE, AND WHY THE EARNING IS INVERTED (Path 3 — Adjudication, ruled 2026-09-11).
 * The other nets in this domain were earned by defects that ESCAPED. This one is earned by three
 * live occurrences of the opposite — a CORRECT package wrongly refused, because the judging party
 * structurally could not see the evidence that decides the question:
 *
 *   R19 P4  (2026-08-31) a reviewer called six interface `description` lines "anachronistic for a
 *           genuine OSPF-era device", said IN ITS OWN VERDICT that it could not re-verify the
 *           comparison against the raw harvest, and asserted the anachronism as PROVEN anyway. All
 *           51 restore lines are in the leg's own harvest, verbatim. Node C agreed — from the same
 *           package text, via the same inference, which is correlation, not corroboration.
 *   R3a-3   (2026-09-10) a content-correct rollback blocked because a `rule_files` value was "a
 *           restated fact, not a verbatim quote". It is BYTE-EQUAL to the harvest.
 *   R3b-2   (2026-09-10, same day) the whole-file lane, blocked demanding per-section provenance.
 *           The rollback is line-identical to the as-deployed file.
 *
 * The reviewer reads the PACKAGE, never the raw harvest — that is protocol design, not an oversight
 * — so a verbatim-quotation claim is STRUCTURALLY uncheckable from where the judgement is made.
 * Prose cannot fix that: the 1.0.2 carry-forward patch closed the excerpt lane and the class
 * surfaced in the whole-file lane the same day.
 *
 * WHAT IT IS NOT — the boundary that keeps this fact honest (the (a)/(b) split):
 *   (b) evidence PRESENT but not independently verifiable  → this net's job.
 *   (a) evidence GENUINELY MISSING from the package        → NOT this net's job, and it must never
 *       suppress such a catch. The June 2026 k8s run was refused for missing LimitRange /
 *       ResourceQuota / PDB evidence and the reviewer was RIGHT; the prose baseline-evidence
 *       obligations are what fixed that class (the terraform example ran clean one day later).
 *
 * This fact answers exactly one question — "is this content contained in the witnessed harvest?" —
 * and says NOTHING about whether required evidence sections are present or restated. Package
 * completeness stays the reviewer's judgement. That is also why a green fact cannot rubber-stamp a
 * rollback: a package that quotes nothing produces zero scoped restore lines and a named
 * `no-restore-blocks` reason, which approves nothing. Only content that IS quoted gets adjudicated.
 *
 * PROTOCOL 10 — a FACT, never a verdict. Unmatched lines escalate (`needs-node-c`) and never block:
 * the corpus base rate of true fabrication is 0 in 56 packages, so a mechanical block would be a
 * verdict this leaf has not earned, and it is the very mistake the incidents are about. Only the
 * COULD-NOT-CHECK arm fails closed.
 */

import { fencedBlockLines, isSeparatorLine, type BlockLabel, type BlockKind } from './dialect-lint';
import { canonicalProtocolName } from './program-protocol';

/**
 * Protocols whose rollbacks quote DESIRED STATE rather than witnessed state — this net has no
 * opinion on them and says so (ruled 2026-09-11, after the corpus re-measure).
 *
 * A terraform-iac or kubernetes-gitops rollback quotes HCL / manifests: `resource "aws_s3_bucket"
 * "app_logs" {`, `tags = {`, `bucket = "acme-app-logs"`, often in diff form (`- block_public_acls
 * = true`). None of that is a line a HARVEST contains verbatim, because the harvest for those
 * domains is provider STATE, not a rendered config file. Adjudicating them measured 125 unmatched
 * lines across the archive — every one a lane mismatch, not a provenance problem.
 *
 * This is a DENYLIST, not an allowlist, and that is the deliberate direction: an unrecognised new
 * protocol gets ADJUDICATED, so a coverage gap shows up as visible escalation rather than as
 * silence. The failure mode of the other direction — a new domain quietly never checked — is the
 * one this whole domain keeps relearning.
 *
 * `lane-not-supported` is a DELIBERATE no-check and is therefore BENIGN, which is not the same
 * thing as `no-harvest-text` (could-not-check ⇒ blocking). Keeping those two apart is the point.
 *
 * ⚠️ COMPARE CANONICALLY, NEVER BY STRING EQUALITY. A stamp always carries the LONG form
 * (`terraform-iac-protocol`); titles carry the SHORT one (`(protocol: terraform-iac)`). The first
 * cut of this list held short names and a bare `includes()` — so it matched NOTHING in production
 * and the whole lane ruling was silently inert, with a corpus re-measure that came back
 * byte-identical to the pre-ruling run. That is the `extractBannedTokens` /banned/i shape again:
 * a named reason that gates nothing while appearing fully wired. Caught only because the
 * re-measure was run and its numbers did not move.
 */
export const DESIRED_STATE_LANES: readonly string[] = ['terraform-iac', 'kubernetes-gitops'];

/** Is this leg's protocol one whose rollback quotes desired state rather than witnessed state? */
export function isDesiredStateLane(protocol: string | null | undefined): boolean {
  if (typeof protocol !== 'string' || !protocol) return false;
  const canonical = canonicalProtocolName(protocol);
  return DESIRED_STATE_LANES.some((n) => canonicalProtocolName(n) === canonical);
}

/**
 * The leaf role that authors the change package. Narrower than `HARNESS_LEAF_ROLE_RE` on purpose:
 * this net needs the package AND the harvest sibling, and only the Author has both in scope. A
 * Harvester or Architect running it would scope zero restore blocks and stamp a misleading reason.
 */
export const AUTHOR_LEAF_ROLE_RE = /author/i;

/** Why a line inside a restore block was not adjudicated. Every exclusion is NAMED and counted. */
export type ExclusionClass =
  /** `!` / `---` — punctuation, not a directive. */
  | 'separator'
  /** An AUTHOR ANNOTATION inside a restore block (`! Step 1: Remove …`, `# DELETE these blocks:`).
   *  Found by the 2026-09-11 corpus re-measure and it is the single biggest false-positive source:
   *  a device NEVER renders the author's commentary into its running config, so any package that
   *  annotates its rollback — most of them do — would report every annotation as unfound. */
  | 'comment-line'
  /** A `no `-form line inside an otherwise-restorative block: the negation of config, not config. */
  | 'inverse-line'
  /** The whole block is majority `no `-form — an INVERSE rollback (it removes rather than restores),
   *  so it quotes nothing and there is nothing to contain. This is the class that made the naive
   *  rule flag 100% of the corpus. */
  | 'inverse-rollback-block'
  /** Device output the operator COMPARES against, quoted inside a rollback section. */
  | 'expected-output-in-restore-section'
  /** A command the operator RUNS to verify the rollback, not content the rollback restores. */
  | 'validation-command-in-restore-section'
  /** Every line is an operator command or a comment: the rollback is a PROCEDURE (git revert,
   *  kubectl rollout undo), not restored content. Live: the June 2026 k8s package. */
  | 'procedural-rollback-block';

/** One line the package promises to restore, with where it was found. */
export interface RestoreLine {
  text: string;
  /** 1-indexed line within the scanned document. */
  line: number;
}

export interface RestoreScope {
  lines: RestoreLine[];
  excluded: Partial<Record<ExclusionClass, number>>;
  blocksScanned: { restore: number; total: number };
}

/**
 * Operator verbs for `procedural-rollback-block`, LOCAL TO THIS NET BY DESIGN.
 *
 * ⚠️ Do NOT implement this by widening `dialect-lint.ts`'s `OPERATOR_VERB`. That regex decides what
 * the ABSENCE half SCANS, so widening it would silently shrink dialect-lint's banned-token coverage
 * — a behavioural change smuggled in under a "reuse" heading. Share the CLASSIFIER, not every
 * constant inside it.
 */
const PROCEDURAL_VERB =
  /^(git|kubectl|helm|kustomize|argocd|flux|terraform|ansible|systemctl|docker|aws|gcloud|az|show|grep|egrep|diff|awk|sed|cat|head|tail|less|more)\b/i;

/**
 * An author's COMMENT in any config dialect we see. `!` followed by text is an IOS/EOS comment;
 * bare `!` is a separator (isSeparatorLine). Both are non-directives, and neither is ever rendered
 * back by a device — so both leave the majority-`no ` denominator as well as the adjudicated set.
 */
export function isCommentLine(text: string): boolean {
  return /^\s*(#|\/\/|;)/.test(text) || /^\s*!\s*\S/.test(text);
}

/** Neither a directive nor content: punctuation or commentary. */
function isNonDirective(text: string): boolean {
  return isSeparatorLine(text) || isCommentLine(text);
}

interface Block {
  lines: RestoreLine[];
  kind: BlockKind;
  restoreIntent: boolean;
  label: BlockLabel;
}

/**
 * Regroup `fencedBlockLines`' per-line output back into blocks. Lines of one block carry
 * consecutive document line numbers by construction, so a break in the run is a block boundary.
 */
function groupBlocks(doc: string): Block[] {
  const flat = fencedBlockLines(doc);
  const blocks: Block[] = [];
  let cur: Block | null = null;
  let prevLine = -99;
  for (const b of flat) {
    const contiguous = cur !== null && b.line === prevLine + 1 &&
      cur.kind === b.kind && cur.restoreIntent === b.restoreIntent && cur.label === b.label;
    if (!contiguous) {
      cur = { lines: [], kind: b.kind, restoreIntent: b.restoreIntent, label: b.label };
      blocks.push(cur);
    }
    cur!.lines.push({ text: b.text, line: b.line });
    prevLine = b.line;
  }
  return blocks;
}

/**
 * Which lines of a package does it promise to RESTORE?
 *
 * Scoping is on `restoreIntent` (the heading-ancestry axis), NOT on `kind`. Measured 2026-09-11:
 * R19-P4's rollback preamble says "harvested", so `kind` splits one rollback section across
 * `rollback` and `harvested-state` and a kind filter drops a third of the restore config,
 * position-dependently. The ancestry does not split.
 *
 * PRECEDENCE IS LOAD-BEARING and was measured, not guessed: `inverse-rollback-block` must come
 * FIRST. On the live FW-A3.3 R3 package the rollback's introductory sentence is ordinary prose, and
 * with the label tests first its plainly-inverse block bucketed as a validation command — a
 * true answer reached by a false route, which is the kind of thing that stops being true later.
 */
export function scopeRestoreLines(deliverable: string | null | undefined): RestoreScope {
  const doc = deliverable ?? '';
  const blocks = groupBlocks(doc);
  const excluded: Partial<Record<ExclusionClass, number>> = {};
  const bump = (c: ExclusionClass, n: number) => {
    if (n > 0) excluded[c] = (excluded[c] ?? 0) + n;
  };
  const lines: RestoreLine[] = [];
  let restoreBlocks = 0;

  for (const block of blocks) {
    if (!block.restoreIntent) continue;
    restoreBlocks++;
    const meaningful = block.lines.filter((l) => l.text.trim());
    // NON-DIRECTIVES LEAVE THE DENOMINATOR, and this is measured, not stylistic. The 2026-09-11
    // corpus re-measure over 100+ archived packages found author annotations to be the single
    // largest source of unfound lines — `! Step 1: Remove storm-control`, `# DELETE these blocks:`
    // — none of which a device ever renders back. Removing them also lets a genuinely inverse
    // rollback register as one: several packages interleave enough commentary and context lines to
    // dilute their `no `-forms below the majority, so the block escaped `inverse-rollback-block`
    // and its context lines were adjudicated as if they were restored content.
    bump('separator', meaningful.filter((l) => isSeparatorLine(l.text)).length);
    bump('comment-line', meaningful.filter((l) => isCommentLine(l.text)).length);
    const substantive = meaningful.filter((l) => !isNonDirective(l.text));
    if (substantive.length === 0) continue;

    // 1. INVERSE rollback — removes rather than restores. Nothing quoted, nothing to contain.
    const inverse = substantive.filter((l) => /^\s*no\s/i.test(l.text));
    if (inverse.length * 2 > substantive.length) {
      bump('inverse-rollback-block', substantive.length);
      continue;
    }
    // 2. Expected device output quoted inside the rollback section. An EXPLICIT label wins over the
    //    content test below — "Expected output" states the block's role unambiguously.
    if (block.label === 'expected-output') {
      bump('expected-output-in-restore-section', substantive.length);
      continue;
    }
    // 3. A rollback expressed as a PROCEDURE rather than as content — every line an operator command
    //    or a comment. Ordered BEFORE the verification label on purpose: the June 2026 k8s package
    //    labels its `git revert` / `kubectl rollout undo` blocks "**Command:**", which the
    //    verification label also matches, and bucketing the rollback procedure itself as a
    //    "validation command" reaches the right answer (nothing to adjudicate) by the wrong route.
    //    Content is the stronger signal than a label this vague; an explicit label still wins above.
    if (substantive.every((l) => PROCEDURAL_VERB.test(l.text.trim()) || isCommentLine(l.text))) {
      bump('procedural-rollback-block', substantive.length);
      continue;
    }
    // 4. A command the operator RUNS to verify the rollback, in a dialect whose verbs we do not
    //    enumerate (live: R3a-3's `get_rules (filter: …)` — an MCP tool call, not a shell verb).
    if (block.label === 'verification') {
      bump('validation-command-in-restore-section', substantive.length);
      continue;
    }
    // 5. Per-line: a `no `-form inside an otherwise-restorative block is still a negation.
    for (const l of substantive) {
      if (/^\s*no\s/i.test(l.text)) { bump('inverse-line', 1); continue; }
      lines.push({ text: l.text.trim(), line: l.line });
    }
  }

  return { lines, excluded, blocksScanned: { restore: restoreBlocks, total: blocks.length } };
}

/** Honest scope statement, carried IN the fact so a consumer cannot over-claim it. */
export const ROLLBACK_SCOPE_NOTE =
  'Answers ONE question: is each scoped restore line present in the harvest THIS leg witnessed? ' +
  'Matching is TRIMMED EXACT LINE — deliberately lossy, because a YAML rollback legitimately ' +
  're-indents a quoted line (live: R3a-3). It therefore proves PROVENANCE OF THE LINE, not ' +
  'structural equivalence, and it compares against this leg\'s OWN harvest only, never a ' +
  'predecessor\'s. It says NOTHING about whether the package is COMPLETE — whether required ' +
  'evidence sections are present or restated remains the reviewer\'s judgement (the (a) lane). ' +
  'A package that quotes nothing scores zero restore lines, which is not an approval of anything. ' +
  'Unmatched lines are NAMED and escalate; they are never a mechanical block, because the measured ' +
  'base rate of true fabrication across the archived corpus is zero.';

export interface RollbackContainmentCheck {
  restoreLinesFound: number;
  restoreLinesTotal: number;
  missing: Array<{ line: string; blockLine: number }>;
}

/**
 * TRIMMED EXACT LINE membership against the harvest.
 *
 * Trimming is load-bearing and deliberately lossy: R3a-3's author writes
 * `  - /etc/prometheus/rules/*.yml` where the harvest writes `- /etc/prometheus/rules/*.yml`. For
 * YAML, indentation is semantic — so this proves the LINE came from the witnessed harvest, not that
 * the surrounding structure is equivalent. That limit is stated in ROLLBACK_SCOPE_NOTE and carried
 * in the fact; do not let a consumer read more into it.
 */
export function checkRollbackContainment(
  restoreLines: RestoreLine[],
  harvestText: string
): RollbackContainmentCheck {
  const harvestSet = new Set<string>();
  for (const raw of harvestText.split('\n')) {
    const t = raw.trim();
    if (t) harvestSet.add(t);
  }
  const missing: Array<{ line: string; blockLine: number }> = [];
  for (const l of restoreLines) {
    if (!harvestSet.has(l.text)) missing.push({ line: l.text, blockLine: l.line });
  }
  return {
    restoreLinesFound: restoreLines.length - missing.length,
    restoreLinesTotal: restoreLines.length,
    missing,
  };
}

export type RollbackDispositionState = 'benign' | 'blocking' | 'needs-node-c';

export interface RollbackDisposition {
  disposition: RollbackDispositionState;
  reason: string;
  inputs: Record<string, unknown>;
}

/**
 * COMPUTED, never judged — the `containmentDisposition` precedent. Benign is an ALLOWLIST, so an
 * unrecognised state falls through to blocking VISIBLY rather than passing quietly.
 *
 * ASYMMETRIC with derivation-containment ON PURPOSE. There, violations block. Here, unmatched lines
 * ESCALATE: across 56 archived packages the measured count of true fabrications is ZERO, so a
 * mechanical block would be an unearned verdict — and false-blocking a correct rollback is the
 * exact incident this net exists to end. Path 3 forbids a Path-3 leaf blocking on its own finding.
 * Only the arm meaning "the check could not run where it structurally should have" fails closed.
 */
export function computeRollbackDisposition(fact: Record<string, unknown>): RollbackDisposition {
  const reason = typeof fact.reason === 'string' ? fact.reason : undefined;
  const missing = Array.isArray(fact.missing) ? fact.missing.length : 0;
  const total = typeof fact.restoreLinesTotal === 'number' ? fact.restoreLinesTotal : 0;
  const inputs = { reason: reason ?? null, missingCount: missing, restoreLinesTotal: total };

  if (fact.checked !== true) {
    switch (reason) {
      // Structurally inapplicable, or nothing was quoted to adjudicate. NOT an approval — see
      // ROLLBACK_SCOPE_NOTE. This is where an (a)-lane package lands, and the reviewer's
      // completeness judgement is untouched by it.
      case 'program-tier':
      case 'no-restore-blocks':
      case 'no-restore-form-lines':
      // DELIBERATE no-check. Distinct from `no-harvest-text` below, which is could-NOT-check and
      // fails closed. Conflating the two would either block every terraform leg or silently excuse
      // an unreadable harvest, and both are worse than saying which one happened.
      case 'lane-not-supported':
        return { disposition: 'benign', reason: reason!, inputs };
      // The check SHOULD have run and could not. Fail closed — the one arm that does.
      default:
        return { disposition: 'blocking', reason: 'hard-gap', inputs };
    }
  }
  if (missing > 0) {
    return { disposition: 'needs-node-c', reason: 'unmatched-restore-lines', inputs };
  }
  return { disposition: 'benign', reason: 'all-restore-lines-found', inputs };
}
