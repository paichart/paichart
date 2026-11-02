/**
 * PLATFORM-HELD-BYTES — the SHARED held-files protocol text (Phase 10, PHASE10-PLAN.md W4; owner decision PH-10).
 *
 * HISTORY: Stage B built a separate VARIANT protocol over the rendered observability base with anchor deltas
 * (`buildHeldVariant`, `replaceExactlyOnce`, `heldVariantVersion`). G3 measured it and the owner chose to FOLD it (PH-1). Since
 * Phase 10 the held text lives IN each held-capable domain protocol's SOURCE. The obs protocol (≥ 1.10.0) carries the obs-specific
 * deltas inline and interpolates `HELD_FILES_SECTION`. The anchor builder is gone: a second protocol coupled by anchors meant every
 * obs edit needed a re-base, and a held/not-held choice per run. The retired variant row is a DEPRECATED tombstone (seed).
 *
 * `HELD_FILES_SECTION` is DOMAIN-NEUTRAL on purpose: a domain joins held (PH-11) by interpolating it beside its own taxonomy
 * wording once its rig has a file source — the shared-clause pattern of VALIDATION_SHAPE_CLAUSE / MARKER_PLACEMENT_CLAUSE.
 *
 * Every string here is AGENT-FACING text. The G1/G2/G3 labs measured the Stage B form; the Phase 10 rewording (the Reviewer's
 * no-diff line scoped to packages that edit a held file, the out-of-scope sentence, the whole-file refusal) is under the owner's
 * Protocol 16 exemption + pre-registered live controls (PH-5; PHASE10-PLAN.md §4 C-1/C-2). Any later edit is a lab event.
 */
import { heldEditClause, OBS_HELD_EDIT_EXAMPLE, type HeldEditExample } from './clause';
import { RESTORE_DIRECTIVE, HELD_EDITS_HEADING, HELD_ROLLBACK_HEADING } from './edits';

/** Retired variant template names (base → variant). The four rows are seeded DEPRECATED since Phase 10; kept for that seed and the
 *  lab's variant binding (historic G1–G3 reproducibility). */
export const HELD_VARIANT_TEMPLATE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  'Observability State Harvester': 'Observability Held State Harvester',
  'Observability Change Architect': 'Observability Held Change Architect',
  'Observability Config Rollback Author': 'Observability Held Config Rollback Author',
  'Observability Change Reviewer': 'Observability Held Change Reviewer',
});

const t = '`';
const c = (s: string) => `${t}${s}${t}`;

/** The section heading — also the PROPERTY the public-export hold keys on (scripts/export/held-export-guard.ts). */
export const HELD_FILES_HEADING = '## Held files — edits by reference';

/** The held-files section a held-capable domain protocol interpolates (obs: before `## Validation`), with that domain's own
 *  worked example (held-k8s 1j). The observability default is byte-identical to the pre-parametrised constant (pinned). */
/** The section's opening sentence for observability (as-deployed files). A domain whose held files are something else names them
 *  in its own `intro` (held-k8s L-K2 F-6: k8s held files are declared repo state, not as-deployed files). */
export const OBS_HELD_FILES_INTRO = 'Held files are the as-deployed config files the platform holds from the Phase 0 harvest, each shown by handle (H1, H2, …). A change that touches no held file is unaffected by this section: its files are written in full, as the package rules say.';
/** network-provisioning's opening sentence (held-network step 3 push 3, J2-TEXT-DRAFT §2; the Q1 answer: with both declared, the Git
 *  file is the held file and the device read is evidence). */
export const NET_HELD_FILES_INTRO = 'Held files are each device\'s configuration file the platform holds from the Phase 0 reads — the declared Git file, or, for a device with no Git file, the running configuration its declared `device-read` returned — each shown by handle (H1, H2, …). Where a device has both, the Git file is the held file and the device read is evidence. A device whose configuration is not held is unaffected by this section: its change is written as the package rules say.';
export function heldFilesSection(ex: HeldEditExample = OBS_HELD_EDIT_EXAMPLE, intro: string = OBS_HELD_FILES_INTRO): string {
  return [
  HELD_FILES_HEADING,
  '',
  intro,
  '',
  `- **Architect:** name a held file you change as ${c('H<n> (<path>)')} + section + intent; never quote it.`,
  `- **Author:** never write a held file whole — the platform refuses a package that does; never write a credential value in an edit — reference it (${c('${env:NAME}')}) or state an operator step.`,
  '',
  heldEditClause(ex),
  '',
  `- **Reviewer:** you see the platform's diff of the edits. Its ${c('-')} and context lines ARE the held bytes; judge copy fidelity only on lines it shows. Cite a refused edit, never re-judge the grammar. Judge missing edits against the package's change list. ${c(`${RESTORE_DIRECTIVE} H<n>`)} is an adequate rollback. Consumed values are on ${c('+')} lines and in ${c('create')} bodies. If the package edits a held file and §6 shows no rendered diff: block. For a file the platform names as held in §6 (its held-files line or a diff header, never the package's own label), a package whose change list changes it without an edit by reference, or that writes it out whole with a change, is a blocking finding; an unchanged quote of it is evidence, not a write. A package that changes no held file is reviewed as a full-file package.`,
  ].join('\n');
}

/** The observability section — what the obs protocol interpolates today. */
export const HELD_FILES_SECTION = heldFilesSection();

// ── PHASE 10 panel F21 (2026-10-17): the held FRAGMENTS a domain protocol interpolates beside its own wording (the shared-clause
// pattern; one consumer today — observability-config). A second domain (PH-11) interpolates the same strings, so the carrier-mirroring
// lines cannot drift per domain. All are agent-facing; F10 and F12 are new text under the owner's Protocol 16 exemption (panel D7).
/** Author (a): the held half of the package rule. */
export const HELD_AUTHOR_PACKAGE_FRAGMENT = `**held files: EDITS by reference** under ${c(`## ${HELD_EDITS_HEADING}`)}, never whole;`;
/** Author (c): the held half of the rollback rule. */
export const HELD_AUTHOR_ROLLBACK_FRAGMENT = `a held file, ${c(`${RESTORE_DIRECTIVE} H<n>`)} under ${c(`## ${HELD_ROLLBACK_HEADING}`)};`;
/** Taxonomy cell for a file-is-the-artifact row (panel F12 / P7-7: a capped or refused file falls back to a full-file quote). */
export const HELD_TAXONOMY_CELL = 'held when the platform shows it as a held block (H<n>) — edit it by reference; otherwise yes — the file IS the artifact, quoted byte for byte';
/** SYNTHESIZE: the line that mirrors the carrier (THE predicate, held-bytes/scope.ts). */
export const HELD_SYNTHESIZE_NEEDS_REVISION = `Also ${c('needs-revision')} if the package edits a held file and an edit was not applied, or writes a held file whole (Author ${c('editApplication')}); the platform enforces it.`;
/** SYNTHESIZE: the operator-held-bytes line, CONDITIONAL (panel F10 / PC-S2 — a Prometheus-only deliverable must not claim it). */
export const HELD_SYNTHESIZE_OPERATOR_BYTES = 'If the package edits a held file, say the platform holds each edited file\'s applied bytes for an operator (operator-only).';

// ── the held TEMPLATE constraints — moved here from seed-observability-held-templates.ts in Phase 10 (W6): since the fold they are
// seeded on the BASE observability Author and Reviewer (seed-observability-templates.ts). Text unchanged (G3-measured).
/** The Author's one added constraint (plan V-8; on the base obs Author since Phase 10). */
export const HELD_AUTHOR_CONSTRAINT: Readonly<Record<string, string>> = Object.freeze({
  'Held Files: Edits Only': 'A held file is changed only by edits under the Held File Edits heading and restored only by restore H<n> — never written as a whole-file block',
});

/**
 * The Reviewer's one added constraint — G3-entry owner decision 1 (2026-10-16), text VERBATIM from
 * `cline_docs/reviews/platform-held-bytes-2026-10-13/G3-ENTRY-DECISIONS.md`. A TEMPLATE constraint, never a protocol edit: the
 * variant protocol reaches every role's system prompt, so a protocol edit would move the measured G1 Author bytes too; this moves
 * the Reviewer's only. It deliberately departs from the shared `change_reviewer` guidance's 2026-09-27 rule (fidelity is not in
 * a leg reviewer's remit WHERE THE SOURCE IS NOT IN CONTEXT): on this pipeline the diff is rendered from the held source, so the
 * source IS in context. Lab-gated before ACTIVE (G3, Protocol 16).
 */
export const HELD_REVIEWER_CONSTRAINT: Readonly<Record<string, string>> = Object.freeze({
  'Held Diff: Unaccounted Lines Block': "Any `-` or `+` line in the platform's diff that the package's own change list does not account for is a blocking finding. On this pipeline the diff's lines are rendered from the held source, so their fidelity IS in your remit.",
});

// ── HISTORIC re-exports for the leg replay lab ONLY (a past commit's seed imports these names from this module). Frozen Stage B
// code in variant-protocol-stage-b.ts; no production caller (pinned). Do not use in new code.
export { buildHeldVariant, heldVariantVersion, replaceExactlyOnce, HeldVariantAnchorError, HELD_VARIANT_DELTAS, HELD_VARIANT_SEMVER } from './variant-protocol-stage-b';
export type { HeldVariantDelta } from './variant-protocol-stage-b';
