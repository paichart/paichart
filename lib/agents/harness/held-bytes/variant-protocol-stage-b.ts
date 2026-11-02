/**
 * HISTORIC — FROZEN Stage B code, LAB REPLAY ONLY (PLATFORM-HELD-BYTES Phase 10, 2026-10-17; PHASE10-PLAN.md §9 note 2).
 *
 * The anchor builder that built the held VARIANT over the rendered obs base (G1–G3 measured its output). Production no longer
 * uses it: the variant is FOLDED into observability-config ≥ 1.10.0 and the seed never imports this file (pinned in
 * test-held-variant-protocol). It is kept byte-for-byte (template-name map aside, which lives in variant-protocol.ts) so the
 * leg replay lab can re-render a PAST commit's seed over today's lib/ — that seed imports `buildHeldVariant` /
 * `heldVariantVersion` from variant-protocol.ts, which re-exports them from here. Never edit: an edit falsifies the G1–G3 arms.
 * The original header follows.
 *
 * PLATFORM-HELD-BYTES Stage B V-8 — the held-file VARIANT of the observability-config protocol (plan STAGE-B-PLAN.md v4.1 §3 V-8).
 *
 * BUILT OVER THE RENDERED BASE (Protocol 15 Phase 4.4 deviation from 4.2 — reason PC S-10, source pins stay untouched;
 * consequence arch S-F, the variant is coupled to the base text): `buildHeldVariant(base)` applies `replaceExactlyOnce` per
 * delta site, so a base edit that moves an anchor FAILS LOUD instead of silently dropping a delta. The base is frozen from G1 to
 * the end of G3 (D-L); its sha is recorded in scripts/fixtures/held-variant-golden.json and the seed refuses to write the variant
 * when the rendered base differs (`assertHeldVariantBase`).
 *
 * Every string here is AGENT-FACING text measured by the G1/G2 labs (§5): an edit is a lab event, never a drive-by.
 *
 * Sites (rendered obs 1.9.0 line → source line): intro :5 (:3191) · "Declarative only" :14 (:3200) · decomposition table :26–29
 * (:3212–3215) · self-provision :47 (:3233) · taxonomy file rows :64–65 (:3247–3252) · role bullet TITLES :90/:91/:93
 * (:3276/:3277/:3279) · Author bullet :92 (:3278) · deliverable wiring :117–118 (:3289/:3290) · a new `## Held files` section
 * before `## Validation` (Architect / Author clause / Reviewer / non-held files) · SYNTHESIZE status + apply line.
 */
import { AppError } from '../../../errors';
import { HELD_EDIT_CLAUSE } from './clause';
import { HELD_EDITS_HEADING, HELD_ROLLBACK_HEADING, RESTORE_DIRECTIVE } from './edits';
/** Frozen copy of the Stage B name map (kept local so this module imports nothing from variant-protocol.ts — no cycle). */
const HELD_VARIANT_TEMPLATE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  'Observability State Harvester': 'Observability Held State Harvester',
  'Observability Change Architect': 'Observability Held Change Architect',
  'Observability Config Rollback Author': 'Observability Held Config Rollback Author',
  'Observability Change Reviewer': 'Observability Held Change Reviewer',
});

/** The variant's own semver; the row version is `${HELD_VARIANT_SEMVER}+obs.<base version>.<base sha8>` (arch v4 N-8). */
export const HELD_VARIANT_SEMVER = '0.1.0';

const t = '`';
const c = (s: string) => `${t}${s}${t}`;
const H = HELD_VARIANT_TEMPLATE_NAMES;

export interface HeldVariantDelta { site: string; old: string; new: string }

/** A delta anchor that moved (a base edit): the build refuses, naming the site. Relative import — the protocol seed runs
 *  without the `@/` alias. */
export class HeldVariantAnchorError extends AppError {
  constructor(message: string, site: string) { super(message, 'HELD_VARIANT_ANCHOR_MOVED', { site }); }
}

/** Replace `old` with `new` exactly once; zero or several occurrences is a moved anchor — throw, naming the site. */
export function replaceExactlyOnce(text: string, d: HeldVariantDelta): string {
  const first = text.indexOf(d.old);
  if (first < 0) throw new HeldVariantAnchorError(`held variant: anchor for site ${d.site} not found in the base`, d.site);
  if (text.indexOf(d.old, first + 1) >= 0) throw new HeldVariantAnchorError(`held variant: anchor for site ${d.site} occurs more than once in the base`, d.site);
  return text.slice(0, first) + d.new + text.slice(first + d.old.length);
}

const HELD_SECTION = [
  '## Held files — edits by reference',
  '',
  `- **Architect:** name a held file you change as ${c('H<n> (<path>)')} + section + intent; never quote it.`,
  `- **Author:** never write a held file whole; never write a credential value in an edit — reference it (${c('${env:NAME}')}) or state an operator step.`,
  '',
  HELD_EDIT_CLAUSE,
  '',
  `- **Reviewer:** you see the platform's diff of the edits. Its ${c('-')} and context lines ARE the held bytes; judge copy fidelity only on lines it shows. Cite a refused edit, never re-judge the grammar. Judge missing edits against the package's change list. ${c(`${RESTORE_DIRECTIVE} H<n>`)} is an adequate rollback. Consumed values are on ${c('+')} lines and in ${c('create')} bodies. No rendered diff in §6: block.`,
].join('\n');

/** The variant's deltas, in base order. Each OLD occurs exactly once in rendered obs 1.9.0 (pinned). */
export const HELD_VARIANT_DELTAS: readonly HeldVariantDelta[] = Object.freeze([
  { site: 'intro :5 (:3191)',
    old: '(full desired-state config files + deterministic validator citations + rollback)',
    new: '(held files edited by reference, other files in full + deterministic validator citations + rollback)' },
  { site: 'declarative :14 (:3200)',
    old: '- **Declarative only.** Emit full desired-state config FILES (Prometheus config, rule files, collector config, provisioned dashboard JSON)',
    new: '- **Declarative only.** Emit desired-state config: EDITS to held files (see Held files), other files in FULL (Prometheus config, rule files, provisioned dashboard JSON)' },
  ...(['Observability State Harvester', 'Observability Change Architect', 'Observability Config Rollback Author', 'Observability Change Reviewer'] as const)
    .map((n) => ({ site: `table ${n} (:3212–3215)`, old: `| ${c(n)} |`, new: `| ${c(H[n])} |` })),
  { site: 'self-provision :47 (:3233)', old: 'the Phase 0 **Observability State Harvester** self-provisions', new: `the Phase 0 **${H['Observability State Harvester']}** self-provisions` },
  { site: 'taxonomy collector :64 (:3247–3252)',
    old: '| Collector (OTel) config | the as-deployed file mount (whichever descriptor tool returns the collector\'s as-deployed config FILE — the collector has no config API; the FILE is the witnessed artifact) | yes — the file IS the artifact |',
    new: `| Collector (OTel) config | the as-deployed file mount (whichever descriptor tool returns the collector's as-deployed config FILE — the collector has no config API; the FILE is the witnessed artifact) | held — the file IS the artifact |` },
  { site: 'taxonomy proxy :65 (:3247–3252)',
    old: '| Proxy / listener config in front of the collector (e.g. an ingress) | the as-deployed file mount (whichever descriptor tool returns those as-deployed config FILES — the FILE is the witnessed artifact) | yes — the file IS the artifact |',
    new: `| Proxy / listener config in front of the collector (e.g. an ingress) | the as-deployed file mount (whichever descriptor tool returns those as-deployed config FILES — the FILE is the witnessed artifact) | held — the file IS the artifact |` },
  { site: 'Harvester title :90 (:3276)', old: '- **Phase 0 — Observability State Harvester** *(read-only)*:', new: `- **Phase 0 — ${H['Observability State Harvester']}** *(read-only)*:` },
  { site: 'Architect title :91 (:3277)', old: '- **Phase 1 — Observability Change Architect**:', new: `- **Phase 1 — ${H['Observability Change Architect']}**:` },
  { site: 'Author title + (a) :92 (:3278)',
    old: '- **Phase 2 — Observability Config Rollback Author**: the **change package** — (a) **FULL desired-state config file(s), new AND modified** — the package is a runbook and the operator applies whole files; a diff is not appliable.',
    new: `- **Phase 2 — ${H['Observability Config Rollback Author']}**: the **change package** — (a) **held files: EDITS by reference** under ${c(`## ${HELD_EDITS_HEADING}`)}, never whole; **other files: FULL desired-state files, new AND modified** — the operator applies whole files.` },
  { site: 'Author (b) read-back :92 (:3278)',
    old: '— and take them from the file as your package authored it.',
    new: '— take lines your edits wrote from your REPLACE text, others from the held block; print no line the held block marks.' },
  { site: 'Author (c) rollback :92 (:3278)',
    old: '(c) a **rollback plan per artifact class, per the taxonomy**: prior file content per its taxonomy row — byte for byte for the file rows, every value unchanged for the Prometheus rendering, never an excerpt — quoted from the witnessed rendering (Prometheus running config, collector file mount) or the prior provisioned file;',
    new: `(c) a **rollback plan per artifact class, per the taxonomy**: a held file, ${c(`${RESTORE_DIRECTIVE} H<n>`)} under ${c(`## ${HELD_ROLLBACK_HEADING}`)}; other files, prior content per its taxonomy row — byte for byte for an unheld file row, every value unchanged for the Prometheus rendering, never an excerpt — quoted from the witnessed rendering or the prior provisioned file;` },
  { site: 'Author quote source :92 (:3278)',
    old: '**Source of every harvested quote:** the Phase 0 harvest entry in your §6 Pipeline Context',
    new: '**Source of every harvested quote:** a held file\'s held block; otherwise the Phase 0 harvest entry in your §6 Pipeline Context' },
  { site: 'Reviewer title :93 (:3279)', old: '- **Phase 3 — Observability Change Reviewer**:', new: `- **Phase 3 — ${H['Observability Change Reviewer']}**:` },
  { site: 'held section (new, before Validation)', old: '\n## Validation = facts, not verdicts\n', new: `\n${HELD_SECTION}\n\n## Validation = facts, not verdicts\n` },
  { site: 'deliverable :117 (:3289)', old: 'The Phase 2 Observability Config Rollback Author is the **deliverable producer**', new: `The Phase 2 ${H['Observability Config Rollback Author']} is the **deliverable producer**` },
  { site: 'deliverable :118 (:3290)', old: 'on the Phase 3 (Observability Change Reviewer) task', new: `on the Phase 3 (${H['Observability Change Reviewer']}) task` },
  { site: 'SYNTHESIZE needs-revision :127',
    old: '- **`needs-revision`** — otherwise; name the blocking issues from the Reviewer\'s terminal block, citing the package\'s OWN validation-set steps.',
    new: '- **`needs-revision`** — otherwise; name the blocking issues from the Reviewer\'s terminal block, citing the package\'s OWN validation-set steps. Also `needs-revision` if any held-file edit was not applied (Author `editApplication`); the platform enforces it.' },
  { site: 'SYNTHESIZE apply line :129',
    old: 'Restate, in one line, that **apply is a separate operator-gated reload / provisioning re-scan**',
    new: 'Say the platform holds each edited file\'s applied bytes for an operator (operator-only). Restate, in one line, that **apply is a separate operator-gated reload / provisioning re-scan**' },
]);

/** The variant protocol text, built over the RENDERED obs base. Throws `HeldVariantAnchorError` on a moved anchor. */
export function buildHeldVariant(base: string): string {
  return HELD_VARIANT_DELTAS.reduce((text, d) => replaceExactlyOnce(text, d), base);
}

/** `<variant semver>+obs.<base version>.<base sha8>` — a base edit without a version bump still changes the version. */
export function heldVariantVersion(baseVersion: string, baseSha256: string): string {
  return `${HELD_VARIANT_SEMVER}+obs.${baseVersion}.${baseSha256.slice(0, 8)}`;
}
