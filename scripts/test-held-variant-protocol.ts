#!/usr/bin/env ts-node
/**
 * PLATFORM-HELD-BYTES — the held text in the observability protocol (Phase 10 fold, PHASE10-PLAN.md W4/W6/W7), the retired
 * variant tombstone, and the two nets that change on held packages (Stage B V-8a / V-8b). Pins read RENDERED text (PROTOCOLS),
 * never source slices. CI-safe (stub clients; the seeds are imported, never run).
 *
 * Stage B pinned a separate VARIANT row built over the obs base by anchors (`buildHeldVariant`, the D-L freeze, the seed guard).
 * Phase 10 folded it: those pins are replaced by the fold pins below; the obs text's full byte ledger is test-held-variant-golden.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub';
import * as fs from 'fs';
import * as path from 'path';
import { HELD_VARIANT_TEMPLATE_NAMES, HELD_FILES_SECTION, HELD_FILES_HEADING, OBS_HELD_FILES_INTRO, NET_HELD_FILES_INTRO, heldFilesSection, HELD_AUTHOR_CONSTRAINT, HELD_REVIEWER_CONSTRAINT, HELD_TAXONOMY_CELL, HELD_AUTHOR_PACKAGE_FRAGMENT, HELD_AUTHOR_ROLLBACK_FRAGMENT, HELD_SYNTHESIZE_NEEDS_REVISION, HELD_SYNTHESIZE_OPERATOR_BYTES } from '../lib/agents/harness/held-bytes/variant-protocol';
import { heldExportRefusal } from './export/held-export-guard';
import { HELD_VARIANT_PROTOCOL, HELD_CAPABLE_PROTOCOLS } from '../lib/agents/harness/held-bytes/variant';
import { HELD_EDIT_CLAUSE, K8S_HELD_EDIT_EXAMPLE, TF_HELD_EDIT_EXAMPLE, NET_HELD_EDIT_EXAMPLE, heldEditClause } from '../lib/agents/harness/held-bytes/clause';
import { PROGRAM_PROTOCOL_NAMES } from '../lib/agents/harness/program-protocol';
import { BASE_REFERENCE_MARKERS, EXPECTED_MARKER_COUNTS } from '../lib/agents/harness/protocol-dependence-anchors';
import { computeRollbackContainmentFact } from '../lib/agents/harness/rollback-containment-enrichment';
import { computeRollbackDisposition } from '../lib/agents/harness/rollback-containment';
import { renderRollbackContainmentForPrompt } from '../lib/agents/harness/render-rollback-containment';
import { runDialectLint } from '../lib/agents/harness/dialect-lint';
import { computeDialectLintFact } from '../lib/agents/harness/dialect-lint-enrichment';
import { parseHeldEdits } from '../lib/agents/harness/held-bytes/edits';

let passed = 0; let failed = 0;
const pending: Array<{ d: string; fn: () => Promise<void> | void }> = [];
const test = (d: string, fn: () => Promise<void> | void) => { pending.push({ d, fn }); };
function eq(a: unknown, b: unknown, what = '') { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c: unknown, what: string) { if (!c) throw new Error(what); }
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

const seed = require('./seed-protocol-prompts') as { PROTOCOLS: Array<Record<string, any>> };
const tpl = require('./seed-observability-held-templates') as { HELD_TEMPLATES: Array<Record<string, any>>; buildHeldTemplateRow: (t: any) => any };
const baseTpl = require('./seed-observability-templates') as { TEMPLATES: Array<Record<string, any>>; buildTemplateRow: (t: any) => any };
const OBS = seed.PROTOCOLS.find((p) => p.name === 'observability-config-protocol')!;
const VAR = seed.PROTOCOLS.find((p) => p.name === HELD_VARIANT_PROTOCOL)!;
const BASE_NAMES = Object.keys(HELD_VARIANT_TEMPLATE_NAMES);
const VARIANT_NAMES = Object.values(HELD_VARIANT_TEMPLATE_NAMES);

// ─── Phase 10: the fold ───────────────────────────────────────────────────────────────────────────────────────────
test('fold: obs ≥ 1.10.0 carries the shared held section and the clause exactly once; names only its BASE templates', () => {
  ok(/^1\.(1[0-9]|[2-9][0-9])\./.test(OBS.version), `obs version ${OBS.version}`);
  eq([count(OBS.promptText, HELD_FILES_SECTION), count(OBS.promptText, HELD_EDIT_CLAUSE)], [1, 1]);
  for (const v of VARIANT_NAMES) eq(count(OBS.promptText, v), 0, `${v} occurrences: `);
  const rows = OBS.promptText.split('\n').filter((l: string) => /^\| [0-3] \|/.test(l));
  eq(rows.map((l: string) => /`([^`]+)`/.exec(l)?.[1]), BASE_NAMES);
});

test('fold: the held content — credential rule, held taxonomy rows, descriptor key on the base token, headings, no agent held.get', () => {
  ok(OBS.promptText.includes('never write a credential value in an edit') && OBS.promptText.includes('`${env:NAME}`'), 'A18 credential sentence');
  eq(count(OBS.promptText, `| ${HELD_TAXONOMY_CELL} |`), 2, 'collector + proxy rows carry the P7-7 held cell (panel F12): ');
  ok(OBS.promptText.includes('serviceDescriptors["observability-config"]'), 'descriptor key = the obs token');
  ok(!OBS.promptText.includes('held.get'), 'never names held.get');
  ok(OBS.promptText.includes('## Held File Edits') && OBS.promptText.includes('restore H<n>'), 'the Author/rollback headings');
});

test('fold (Phase 10 rewording, plan C2/C4): the no-diff block is SCOPED to held edits; an out-of-scope package is reviewed as full-file; the whole-file refusal is named', () => {
  ok(!OBS.promptText.includes('No rendered diff in §6: block.'), 'the unscoped Stage B sentence is gone');
  ok(OBS.promptText.includes('If the package edits a held file and §6 shows no rendered diff: block.'), 'scoped no-diff block');
  ok(OBS.promptText.includes('A package that changes no held file is reviewed as a full-file package.'), 'out-of-scope review rule');
  ok(OBS.promptText.includes('A change that touches no held file is unaffected by this section'), 'out-of-scope Author rule');
  ok(OBS.promptText.includes('never write a held file whole — the platform refuses a package that does'), 'whole-file refusal named to the Author');
  ok(OBS.promptText.includes('if the package edits a held file and an edit was not applied, or writes a held file whole'), 'SYNTHESIZE line aligned with the carrier scope rule');
  ok(OBS.promptText.includes('byte for byte for a file the platform did not hold') && !OBS.promptText.includes('unheld file row'), 'P7-7');
});

test('HELD_FILES_SECTION is DOMAIN-NEUTRAL around the clause (PH-10: another domain interpolates it unchanged)', () => {
  // HELD_EDIT_CLAUSE's worked example says "the collector config" — G1-measured text, unchanged here (an edit is a lab event).
  // Recorded for PH-11: when a second domain joins, decide whether that example reads acceptably there.
  const own = HELD_FILES_SECTION.replace(HELD_EDIT_CLAUSE, '');
  for (const w of ['collector', 'Prometheus', 'ingress', 'observability', 'Observability', 'nginx', 'otel']) ok(!own.includes(w), `domain word "${w}"`);
});

test('tombstone: the retired variant row is DEPRECATED, one entry, engine-only, names its successor; NEVER a program-tier name (leg tier, PH-4)', () => {
  eq([VAR.status, VAR.isPublic, seed.PROTOCOLS.filter((p) => p.name === HELD_VARIANT_PROTOCOL).length], ['DEPRECATED', false, 1]);
  ok(VAR.promptText.length < 600 && VAR.promptText.includes('observability-config-protocol') && VAR.promptText.includes('(protocol: observability-config)'), 'tombstone body');
  ok(!PROGRAM_PROTOCOL_NAMES.includes('observability-config-held') && !PROGRAM_PROTOCOL_NAMES.includes(HELD_VARIANT_PROTOCOL), 'not program tier');
  const src = fs.readFileSync(path.join(__dirname, 'seed-protocol-prompts.ts'), 'utf8');
  ok(!/assertHeldVariantBase|buildHeldVariant/.test(src), 'no base-freeze guard and no anchor builder (the fold removed the coupling)');
  // The frozen Stage B builder exists ONLY for the lab's historic re-render: no production file imports it.
  for (const f of ['lib/services/execution-core.ts', 'lib/agents/harness/held-chain.ts', 'lib/services/held-edit-step.ts', 'scripts/seed-protocol-prompts.ts', 'scripts/seed-observability-templates.ts']) {
    ok(!/variant-protocol-stage-b|buildHeldVariant|HELD_VARIANT_DELTAS/.test(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')), `${f} does not use the historic builder`);
  }
});

test('templates (W6): the BASE obs Author carries the held Author constraint, the Reviewer the held Reviewer constraint, nobody else; text unchanged from G3', () => {
  eq(HELD_REVIEWER_CONSTRAINT, { 'Held Diff: Unaccounted Lines Block': "Any `-` or `+` line in the platform's diff that the package's own change list does not account for is a blocking finding. On this pipeline the diff's lines are rendered from the held source, so their fidelity IS in your remit." });
  eq(HELD_AUTHOR_CONSTRAINT, { 'Held Files: Edits Only': 'A held file is changed only by edits under the Held File Edits heading and restored only by restore H<n> — never written as a whole-file block' });
  for (const t of baseTpl.TEMPLATES) {
    const row = baseTpl.buildTemplateRow(t);
    eq([Object.keys(row.constraints).includes('Held Files: Edits Only'), Object.keys(row.constraints).includes('Held Diff: Unaccounted Lines Block')],
      [t.defaultRole === 'config_change_author', t.defaultRole === 'change_reviewer'], `${t.name}: `);
    eq(row.metadata?.protocol, 'observability-config-protocol', `${t.name} binds obs: `);
  }
});

test('templates (W6 + panel F9): the four RETIRED variant templates seed DEPRECATED on both writes; the collision refusal precedes every write', () => {
  eq(tpl.HELD_TEMPLATES.map((t) => t.name), VARIANT_NAMES);
  const src = fs.readFileSync(path.join(__dirname, 'seed-observability-held-templates.ts'), 'utf8');
  eq([(src.match(/status: 'DEPRECATED'/g) ?? []).length, (src.match(/status: 'INACTIVE'/g) ?? []).length, (src.match(/status: 'ACTIVE'/g) ?? []).length], [2, 0, 0]);
  ok(/refusing to overwrite/.test(src) && src.indexOf('refusing to overwrite') < src.indexOf('agentTemplate.update'), 'collision refusal precedes every write');
});

// ─── held-k8s step 3: the join ─────────────────────────────────────────────────────────────────────────────────────
const K8S = seed.PROTOCOLS.find((p) => p.name === 'kubernetes-gitops-protocol')!;
test('held-k8s step 3: k8s ≥ 1.18.0 carries the held-files section with the K8S example once, the obs example never, and every shared fragment', () => {
  ok(/^1\.(1[8-9]|[2-9][0-9])\./.test(K8S.version), `k8s version ${K8S.version}`);
  eq([count(K8S.promptText, HELD_FILES_HEADING), count(K8S.promptText, HELD_FILES_SECTION), count(K8S.promptText, OBS_HELD_FILES_INTRO)], [1, 0, 0], 'k8s heading / obs section / obs intro: ');
  ok(K8S.promptText.includes(heldEditClause(K8S_HELD_EDIT_EXAMPLE)) && K8S.promptText.includes('the declared desired state, not the live objects'), 'k8s clause + k8s intro (F-6)');
  ok(K8S.promptText.includes('quote only its drifted or changed fields — never the whole object in its repo layout'), 'F-1 live-quote sentence');
  ok(K8S.promptText.includes('A unified diff of a held file is not an edit') && !K8S.promptText.includes('Helm-values diff'), 'L-K2 crib (F-4/SG-DIFF): a diff is not an edit; no "Helm-values diff" wording');
  eq(heldFilesSection(), HELD_FILES_SECTION, 'the obs default is unchanged: ');
  ok(heldEditClause(K8S_HELD_EDIT_EXAMPLE) !== HELD_EDIT_CLAUSE, 'the k8s clause differs from the obs one (its own example)');
  for (const f of [HELD_AUTHOR_PACKAGE_FRAGMENT, HELD_AUTHOR_ROLLBACK_FRAGMENT, HELD_SYNTHESIZE_NEEDS_REVISION, HELD_SYNTHESIZE_OPERATOR_BYTES]) eq(count(K8S.promptText, f), 1, `${f.slice(0, 40)}: `);
  for (const sx of ['a held file is a **config-repo file** the Harvester read', '<kind>/<namespace>/<name> in H<n> (<path>)',
    'An \`unheld\` handle with no path is not a file: write no edit or restore against it.'.replace(/\\/g, '')]) ok(K8S.promptText.includes(sx), `missing: ${sx}`);
});
test('held-k8s step 3 (PC B2 / S8): no sentence offers a git revert or a prior revision for a HELD file — those are named only for files the platform does not hold', () => {
  const sentences = K8S.promptText.split(/(?<=[.;])\s+/).filter((x: string) => /git revert|prior revision/.test(x));
  ok(sentences.length > 0, 'the non-held rollback is still described');
  for (const x of sentences) ok(/any other file|never by a git revert|files the platform does not hold/.test(x), `a rollback sentence offers git revert without the non-held scope: ${x.slice(0, 160)}`);
});
// ─── held-terraform step 3: the join (terraform-iac 1.15.0) ──────────────────────────────────────────────────────────
const TF = seed.PROTOCOLS.find((p) => p.name === 'terraform-iac-protocol')!;
test('held-terraform step 3: terraform ≥ 1.15.0 carries the held-files section with the TF example once, no other domain example, and every shared fragment once', () => {
  ok(/^1\.(1[5-9]|[2-9][0-9])\./.test(TF.version), `terraform version ${TF.version}`);
  eq([count(TF.promptText, HELD_FILES_HEADING), count(TF.promptText, HELD_FILES_SECTION), count(TF.promptText, OBS_HELD_FILES_INTRO)], [1, 0, 0], 'terraform heading / obs section / obs intro: ');
  ok(TF.promptText.includes(heldEditClause(TF_HELD_EDIT_EXAMPLE)) && !TF.promptText.includes(heldEditClause(K8S_HELD_EDIT_EXAMPLE)), 'the TF clause, never the k8s one');
  ok(TF.promptText.includes('the declared desired state, not the Terraform state'), 'terraform intro');
  ok(TF.promptText.indexOf(HELD_FILES_HEADING) < TF.promptText.indexOf('## Validation = facts, not verdicts'), 'the section sits before ## Validation');
  for (const f of [HELD_AUTHOR_PACKAGE_FRAGMENT, HELD_AUTHOR_ROLLBACK_FRAGMENT, HELD_SYNTHESIZE_NEEDS_REVISION, HELD_SYNTHESIZE_OPERATOR_BYTES]) eq(count(TF.promptText, f), 1, `${f.slice(0, 40)}: `);
  for (const sx of ['a held file is a **`.tf` file of the configuration repository** the Harvester read', '<resource address> in H<n> (<path>)',
    'A unified diff of a held file is not an edit', 'quote only its drifted or changed attributes — never the whole resource in its file layout',
    'never copy a placeholder into an edit', 'An `unheld` handle with no path is not a file: write no edit or restore against it.',
    'are for files the platform does not hold']) ok(TF.promptText.includes(sx), `missing: ${sx}`);
});
test('held-terraform step 3 (the PC B2 rule, k8s precedent): no sentence offers a revert or a prior revision for a HELD file — only for files the platform does not hold', () => {
  const sentences = TF.promptText.split(/(?<=[.;])\s+/).filter((x: string) => /revert|prior revision/.test(x));
  ok(sentences.length > 0, 'the non-held rollback is still described');
  for (const x of sentences) ok(/any other file|never by reverting/.test(x), `a rollback sentence offers a revert without the non-held scope: ${x.slice(0, 200)}`);
});
// ─── held-network step 3 push 3: the join (network-provisioning 1.25.0) ─────────────────────────────────────────────
const NET = seed.PROTOCOLS.find((p) => p.name === 'network-provisioning-protocol')!;
const DER = seed.PROTOCOLS.find((p) => p.name === 'network-derivation-protocol')!;
test('held-network push 3: network ≥ 1.25.0 carries the held-files section with the NET example + intro once, no other domain example, and every shared fragment once', () => {
  ok(/^1\.(2[5-9]|[3-9][0-9])\./.test(NET.version), `network version ${NET.version}`);
  eq([count(NET.promptText, HELD_FILES_HEADING), count(NET.promptText, HELD_FILES_SECTION), count(NET.promptText, OBS_HELD_FILES_INTRO), count(NET.promptText, NET_HELD_FILES_INTRO)], [1, 0, 0, 1], 'network heading / obs section / obs intro / net intro: ');
  ok(NET.promptText.includes(heldEditClause(NET_HELD_EDIT_EXAMPLE)) && !NET.promptText.includes(heldEditClause(K8S_HELD_EDIT_EXAMPLE)) && !NET.promptText.includes(heldEditClause(TF_HELD_EDIT_EXAMPLE)), 'the NET clause, never another domain\'s');
  ok(NET.promptText.indexOf(HELD_FILES_HEADING) < NET.promptText.indexOf('## Validation = facts, not verdicts'), 'the section sits before ## Validation');
  for (const f of [HELD_AUTHOR_PACKAGE_FRAGMENT, HELD_AUTHOR_ROLLBACK_FRAGMENT, HELD_SYNTHESIZE_NEEDS_REVISION, HELD_SYNTHESIZE_OPERATOR_BYTES]) eq(count(NET.promptText, f), 1, `${f.slice(0, 40)}: `);
  for (const sx of [
    'the platform holds what that read returns as the device\'s held file', // N1
    'Edit a held device configuration only by reference — never as configuration-mode commands and never as the whole file.', // N2
    'uses a commit that reverts unless confirmed where the device offers one', // N2
    'A device declared `git-file` or `device-read` whose configuration the platform did not hold (no held Git file and no held device read) is HELD: list it first, package nothing for it, and the leg\'s outcome is needs-revision — the platform enforces it.', // N4 (widened: D-1 + Q2)
    'a tool your harvest never called successfully is named as not checked, never guessed', // N5
    'The Git-file-vs-device platform fact, where shown, is evidence; cite a difference it reports, never re-derive one.', // N6
  ]) eq(count(NET.promptText, sx), 1, `once: ${sx.slice(0, 60)}: `);
});
test('held-network push 3: N3 (declared out-of-band sections) is DEFERRED — no declared apply model in the text', () => {
  ok(!/out-of-band section|apply-model|apply model/i.test(NET.promptText), 'no declared apply-model text');
});
test('held-network push 3 (the PC B2 rule): the rollback names restore H<n> for a held file and the prior config only for any other device', () => {
  ok(NET.promptText.includes('`restore H<n>` under `## Held File Rollback`; any other device, the config to restore its prior state;'), '(c) scoped');
  const sentences = NET.promptText.split(/(?<=[.;])\s+/).filter((x: string) => /\brevert\b|prior revision/.test(x) && !/reverts unless confirmed/.test(x));
  for (const x of sentences) ok(/any other|not hold/.test(x), `a rollback sentence offers a revert without the non-held scope: ${x.slice(0, 200)}`);
});
test('held-network push 3 (Q3 / LL-N-07): network-derivation carries NO held text (the value leg is not held-capable)', () => {
  eq([count(DER.promptText, HELD_FILES_HEADING), count(DER.promptText, NET_HELD_FILES_INTRO), count(DER.promptText, 'Edit a held device configuration')], [0, 0, 0], 'derivation heading / net intro / N2: ');
  ok(!HELD_CAPABLE_PROTOCOLS.includes('network-derivation-protocol'), 'derivation not held-capable');
});
test('held-k8s step 3 (TS S1/S2): the held template constraints are seeded IFF the owning seed binds a held-capable protocol — both directions', () => {
  const owning: Array<[string, string]> = [['seed-observability-templates', 'observability-config-protocol'], ['seed-kubernetes-gitops-templates', 'kubernetes-gitops-protocol'],
    ['seed-terraform-iac-templates', 'terraform-iac-protocol'], ['seed-network-provisioning-templates', 'network-provisioning-protocol']];
  for (const [file, proto] of owning) {
    const held = HELD_CAPABLE_PROTOCOLS.includes(proto);
    const src = fs.readFileSync(path.join(__dirname, `${file}.ts`), 'utf8');
    if (!held) { ok(!/HELD_AUTHOR_CONSTRAINT|HELD_REVIEWER_CONSTRAINT|Held Files: Edits Only|Held Diff: Unaccounted/.test(src), `${file} (not held-capable) carries a held constraint`); continue; }
    const m = require(`./${file}`) as { TEMPLATES: Array<Record<string, any>>; buildTemplateRow: (t: any) => any };
    for (const t of m.TEMPLATES) {
      const keys = Object.keys(m.buildTemplateRow(t).constraints);
      eq([keys.includes('Held Files: Edits Only'), keys.includes('Held Diff: Unaccounted Lines Block')],
        [t.defaultRole === 'config_change_author', t.defaultRole === 'change_reviewer'], `${file} ${t.name}: `);
      eq(m.buildTemplateRow(t).metadata?.protocol, proto, `${t.name} binds ${proto}: `);
    }
  }
  eq(owning.filter(([, p]) => HELD_CAPABLE_PROTOCOLS.includes(p)).length, HELD_CAPABLE_PROTOCOLS.length, 'every held-capable protocol has an owning seed listed: ');
});

test('held-network J1 (push 2): a join row AWAITING its text is listed IFF the seed is below the join version and carries no held section — the text commit must remove it, and nothing else may', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { HELD_JOIN_VERSIONS, HELD_JOIN_AWAITING_TEXT, isHeldCapableProtocol } = require('../lib/agents/harness/held-bytes/variant') as
    { HELD_JOIN_VERSIONS: Record<string, string>; HELD_JOIN_AWAITING_TEXT: string[]; isHeldCapableProtocol: (n: string) => boolean };
  const lt = (a: string, b: string) => { const x = a.split('.').map(Number); const y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false; };
  for (const [proto, joinVer] of Object.entries(HELD_JOIN_VERSIONS)) {
    const row = seed.PROTOCOLS.find((p) => p.name === proto);
    ok(row, `${proto}: no seeded row`);
    const awaiting = HELD_JOIN_AWAITING_TEXT.includes(proto);
    const below = lt(String(row!.version), joinVer);
    const hasText = count(row!.promptText, HELD_FILES_HEADING) > 0;
    eq([awaiting, hasText], [below, !below], `${proto} (seed ${row!.version}, join ${joinVer}) [awaiting, carries the held section]: `);
    eq(isHeldCapableProtocol(proto), !awaiting, `${proto} held-capable: `);
    eq(HELD_CAPABLE_PROTOCOLS.includes(proto), !awaiting, `${proto} in HELD_CAPABLE_PROTOCOLS: `);
  }
  for (const p of HELD_JOIN_AWAITING_TEXT) ok(p in HELD_JOIN_VERSIONS, `${p} awaits text but has no join row`);
  // held-network step 3 push 3: the text commit removed network's entry (network-provisioning 1.25.0 carries the held section).
  ok(!HELD_JOIN_AWAITING_TEXT.includes('network-provisioning-protocol') && isHeldCapableProtocol('network-provisioning'), 'push 3: network joined with its text');
});

test('Node C (W7): both Program Integration Reviewer seeds carry the held-edits constraint, same text', () => {
  const k = "'Held Edits Are The Package': ";
  const texts = ['seed-program-templates.ts', 'seed-value-chain-templates.ts'].map((f) => {
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8'); const i = src.indexOf(k); ok(i > 0, f); return src.slice(i, src.indexOf('\n', i));
  });
  eq(texts[0], texts[1]);
});

test('panel D6 (F14): the mechanical export hold refuses obs ≥ 1.10.0 until the self-host text exists; nothing else', () => {
  ok(typeof heldExportRefusal('observability-config-protocol', '1.10.0', undefined, false) === 'string', 'obs 1.10.0 refused (name backstop, no text)');
  ok(typeof heldExportRefusal('observability-config-protocol', '2.0.0', '', false) === 'string', 'a later obs refused');
  eq([heldExportRefusal('observability-config-protocol', '1.9.0', 'no held text', false), heldExportRefusal('terraform-iac-protocol', '1.13.0', 'no held text', false),
    heldExportRefusal('observability-config-protocol', '1.10.0', HELD_FILES_SECTION, true)], [null, null, null]);
  // held-k8s 1j (PC S10): the PROPERTY arm — ANY protocol whose text carries the held-files section is held back, by construction
  ok(typeof heldExportRefusal('kubernetes-gitops-protocol', '1.18.0', `# k8s\n\n${HELD_FILES_SECTION}\n`, false) === 'string', 'a second held domain refused by the property');
  const r = fs.readFileSync(path.join(__dirname, 'render-public-protocols.ts'), 'utf8');
  ok(r.includes('heldExportRefusal(name.name, name.version ?? \'0.0.0\', name.promptText)'), 'the renderer passes the row text');
  ok(r.indexOf('heldExportRefusal(name.name') > 0 && r.indexOf('heldExportRefusal(name.name') < r.indexOf('fs.writeFileSync(target, rendered)'), 'the renderer refuses BEFORE writing');
  // re-review AR R-S1: publish.sh is the only public push and runs export-public.py, not the renderer — it refuses too (dry run allowed)
  const pub = fs.readFileSync(path.join(__dirname, 'export', 'publish.sh'), 'utf8');
  const g = pub.indexOf('! grep -q "^export const SELF_HOST_HELD_TEXT_EXISTS = true;"'); const x = pub.indexOf('export-public.py --out');
  ok(g > 0 && g < x && pub.includes('"$MSG" != "--dry-run"'), 'publish.sh refuses a real push before the export runs unless the guard says true (fail-closed, audit N-4)');
  const guard = fs.readFileSync(path.join(__dirname, 'export', 'held-export-guard.ts'), 'utf8');
  // PH-7 DONE 2026-11-01: the guard is flipped AND the self-host text exists beside it (the two travel together, one commit)
  ok(guard.includes('\nexport const SELF_HOST_HELD_TEXT_EXISTS = true;\n'), 'the guard is true since PH-7 (the exact line `= true;` that publish.sh greps)');
  const selfHost = path.join(__dirname, '..', 'docs', 'SELF-HOST-KEPT-FILES.md');
  ok(fs.existsSync(selfHost), 'the self-host kept-files text exists (docs/SELF-HOST-KEPT-FILES.md) — never true without it');
  const sh = fs.existsSync(selfHost) ? fs.readFileSync(selfHost, 'utf8') : '';
  for (const k of ['R10 off', 'held.get', 'refId', 'stdio', 'redactorVersion', 'HELD_BYTES_CAPTURE_ENABLED', 'backups', 'model provider', 'Installed before 2026-11-01', 'without verifying its signature']) ok(sh.includes(k), `the self-host text states: ${k}`);
  ok(heldExportRefusal('observability-config-protocol', '1.10.0', HELD_FILES_SECTION) === null, 'with the text in place, a held protocol renders publicly');
  // architectural review B1 + pins (2026-11-01): the text must EXPORT (above `- docs/**`), the template ships both guards ON, and held.get
  // still emits the fields the text tells operators to read.
  const rules = fs.readFileSync(path.join(__dirname, 'export', 'public-allowlist.rules'), 'utf8');
  const inc = rules.indexOf('\n+ docs/SELF-HOST-KEPT-FILES.md\n'), exc = rules.indexOf('\n- docs/**');
  ok(inc > 0 && exc > inc, 'public-allowlist.rules exports docs/SELF-HOST-KEPT-FILES.md (its + line sits above `- docs/**`)');
  const envEx = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
  ok(/^CONNECTED_OUTPUT_SANITIZE_ENABLED=true\b/m.test(envEx) && /^ARTIFACT_SECRET_REDACT_ENABLED=true\b/m.test(envEx), '.env.example ships R9 and R10 ON');
  ok(/^HELD_BYTES_CAPTURE_ENABLED=true\b/m.test(envEx), '.env.example ships kept files ON (matching production; owner 2026-11-01)');
  ok(/^GIT_FILE_SOURCE_PIN=paichart\/paichart-configs$/m.test(envEx) && !/paichart-lab-configs/.test(envEx), '.env.example pins the public paichart/paichart-configs and never names the retired repo (owner 2026-11-12)');
  const hg = fs.readFileSync(path.join(__dirname, '..', 'lib', 'mcp', 'server', 'tools', 'held-get-handler.ts'), 'utf8');
  ok(hg.includes('redactorVersion: ref.redactorVersion') && hg.includes('applicable: placeholders === 0'), 'held.get still emits redactorVersion and applicable (the self-host text tells operators to read them)');
  const xp = fs.readFileSync(path.join(__dirname, 'export-public.py'), 'utf8');
  ok(xp.includes("'## Held files — edits by reference'") && xp.includes('docs/SELF-HOST-KEPT-FILES.md') && xp.includes('REFUSING (R6 / PH-7)'), 'export-public.py refuses an export tree with held protocols but no self-host text');
  ok(r.includes('SELF-HOST-KEPT-FILES.md') && r.includes('rendered.includes(HELD_FILES_HEADING)') && r.indexOf("SELF-HOST-KEPT-FILES.md") < r.indexOf('fs.writeFileSync(target, rendered)'), 'render-public-protocols.ts refuses a held protocol before writing unless the public repo carries the self-host text');
  // audit N-5 (second half): the Node C text quotes the card segment — the two strings must stay one string
  const card = fs.readFileSync(path.join(__dirname, '..', 'lib', 'mcp', 'server', 'tools', 'advanced', 'lean-card-facts.js'), 'utf8');
  const prog = fs.readFileSync(path.join(__dirname, 'seed-program-templates.ts'), 'utf8');
  ok(card.includes("'; out of scope'") && prog.includes('editApplication reads `out of scope`'), 'Node C quotes the card segment `out of scope` the card renders');
});

test('panel F10 / F12: the SYNTHESIZE held-bytes line is conditional; the file rows carry the unheld fallback', () => {
  ok(OBS.promptText.includes('If the package edits a held file, say the platform holds each edited file\'s applied bytes for an operator (operator-only).'), 'F10');
  ok(!/\. Say the platform holds each edited file/.test(OBS.promptText), 'F10: no unconditional form left');
  ok(HELD_TAXONOMY_CELL.includes('otherwise yes — the file IS the artifact, quoted byte for byte'), 'F12 fallback');
});

test('composition: the obs base-dependence markers and the teardown override survive the fold', () => {
  const marks = (t: string) => BASE_REFERENCE_MARKERS.reduce((n, m) => n + count(t, m), 0);
  eq(marks(OBS.promptText), EXPECTED_MARKER_COUNTS['observability-config-protocol']);
  eq(count(OBS.promptText, '**Order at SYNTHESIZE'), 1, 'teardown override once: ');
});

// ─── V-8a rollbackContainment ────────────────────────────────────────────────────────────────────────────────────────────
function rbDb(protocol: string) {
  return {
    task: {
      findUnique: async (a: any) => a.where.id === 'author' ? { stageId: 'st' } : { title: `leg (protocol: ${protocol.replace(/-protocol$/, '')})`, metadata: { protocol } },
      findMany: async () => [],
    },
    stage: { findUnique: async () => ({ metadata: { harnessTaskId: 'leg' } }) },
    agentExecution: { findMany: async () => [], findFirst: async () => null },
    agentArtifact: { findFirst: async () => null, findMany: async () => [] },
    $queryRaw: async () => [],
  } as any;
}
const FENCED = '## Held File Edits\n\n<<<<<<< SEARCH H1\na: 1\n=======\na: 2\n>>>>>>> REPLACE\n\n## Held File Rollback\n\n```\nrestore H1\n```\n';
const UNFENCED = '## Held File Edits\n\n<<<<<<< SEARCH H1\na: 1\n=======\na: 2\n>>>>>>> REPLACE\n\n## Held File Rollback\n\nrestore H1\n';
const MIXED = `${FENCED}\n## Rollback — Prometheus rules\n\n\`\`\`yaml\ngroups:\n  - name: old-rules\n\`\`\`\n`;
// Phase 10 panel D4: the retired token is no longer held-capable — the held leg in these fixtures is the folded obs leg.
const VARIANT = 'observability-config-protocol';
const OBS_P = 'observability-config-protocol';

test('V-8a: fenced and unfenced `restore H1` of a BASE-held file ⇒ restore-is-held-base, benign (retired token AND folded obs leg)', async () => {
  for (const [name, doc, excludedN, proto] of [['fenced', FENCED, 1, VARIANT], ['unfenced', UNFENCED, 0, VARIANT], ['fenced obs', FENCED, 1, OBS_P]] as const) {
    const f = await computeRollbackContainmentFact(rbDb(proto), { taskId: 'author', deliverable: doc, heldRollbackHandles: ['H1'] });
    eq([f.reason, f.heldRestores, (f.excluded as any)?.['held-restore-directive'] ?? 0, (f.rollbackDisposition as any).disposition],
      ['restore-is-held-base', 1, excludedN, 'benign'], `${name}: `);
    ok((renderRollbackContainmentForPrompt(f) ?? []).some((l) => l.includes('platform restores those bytes')), `${name}: rendered`);
  }
});

test('V-8a: mixed ⇒ the directive is excluded and the rest adjudicated, heldRestores nested', async () => {
  const f = await computeRollbackContainmentFact(rbDb(VARIANT), { taskId: 'author', deliverable: MIXED, heldRollbackHandles: ['H1'] });
  ok(f.reason !== 'restore-is-held-base', `reason ${f.reason}`);
  eq([f.heldRestores, (f.excluded as any)['held-restore-directive']], [1, 1]);
});

test('V-8a: a restore of a handle the platform does not hold is NOT held-base', async () => {
  const f = await computeRollbackContainmentFact(rbDb(VARIANT), { taskId: 'author', deliverable: FENCED, heldRollbackHandles: [] });
  ok(f.reason !== 'restore-is-held-base', String(f.reason)); eq(f.heldRestores, 0);
});

test('EF-P2-3: restore H1 beside an UNHELD restore H9 is NOT restore-is-held-base (every directive must be held)', async () => {
  const doc = FENCED.replace('restore H1\n```', 'restore H1\nrestore H9\n```');
  const f = await computeRollbackContainmentFact(rbDb(VARIANT), { taskId: 'author', deliverable: doc, heldRollbackHandles: ['H1'] });
  ok(f.reason !== 'restore-is-held-base', String(f.reason));
  eq([f.heldRestores, (f.excluded as any)['held-restore-directive']], [1, 2]);
});

test('EF-P2-3: an INDENTED restore the parser never records is adjudicated as content, never silently excluded', async () => {
  const doc = FENCED.replace('restore H1\n```', '  restore H1\n```');
  const f = await computeRollbackContainmentFact(rbDb(VARIANT), { taskId: 'author', deliverable: doc, heldRollbackHandles: ['H1'] });
  ok(f.reason !== 'restore-is-held-base', String(f.reason));
  eq([f.heldRestores, ((f.excluded as any) ?? {})['held-restore-directive'] ?? 0], [0, 0]);
});

test('EF-P2-3: the net reads the BASE-held handles from ctx.held.baseHeldHandles (built from prepareHeldPackage), never the digest\'s rollback', () => {
  const nets = fs.readFileSync(path.join(__dirname, '..', 'lib', 'agents', 'harness', 'mechanical-nets.ts'), 'utf8');
  ok(/heldRollbackHandles: Array\.isArray\(ctx\.held\?\.baseHeldHandles\) \? ctx\.held!\.baseHeldHandles : null/.test(nets), 'net reads ctx.held.baseHeldHandles');
  const core = fs.readFileSync(path.join(__dirname, '..', 'lib', 'services', 'execution-core.ts'), 'utf8');
  ok(/baseHeldHandles: Object\.keys\(pkg\.baseRefIdByHandle\)/.test(core), 'core hands the package\'s BASE handles');
});

test('V-8a: a NON-held-capable leg (another domain) is untouched (no class, no heldRestores key) even with the same text and handles', async () => {
  // held-network push 3: every change domain is held-capable now — the value leg (network-derivation) is the non-held-capable leg.
  const f = await computeRollbackContainmentFact(rbDb('network-derivation-protocol'), { taskId: 'author', deliverable: FENCED, heldRollbackHandles: ['H1'] });
  ok(!('heldRestores' in f) && !((f.excluded as any) ?? {})['held-restore-directive'] && f.reason !== 'restore-is-held-base', JSON.stringify(f).slice(0, 200));
});

test('Phase 10: a folded obs leg with NO held context (no BASE-held handle, no restore directive) keeps the pre-fold rollback stamp — no heldRestores key', async () => {
  const doc = '## Rollback\n\n```yaml\ngroups:\n  - name: old\n```\n';
  const obs = await computeRollbackContainmentFact(rbDb('observability-config-protocol'), { taskId: 'author', deliverable: doc, heldRollbackHandles: null });
  const tf = await computeRollbackContainmentFact(rbDb('network-provisioning-protocol'), { taskId: 'author', deliverable: doc, heldRollbackHandles: null });
  ok(!('heldRestores' in obs), JSON.stringify(obs).slice(0, 200));
  eq(JSON.stringify({ ...obs, lane: undefined }), JSON.stringify({ ...tf, lane: undefined }), 'same adjudication as a non-held leg: ');
});

test('Phase 10: dialect-lint takes the held path only for a package that CONTAINS held grammar', async () => {
  const plainDoc = '```yaml\ninsecure_skip_verify: true\n```';
  const db: any = {
    task: { findMany: async () => [{ id: 'a', title: 'Author x', agentRole: 'config_change_author' }] },
    agentExecution: { findFirst: async () => ({ id: 'e' }), findMany: async () => [{ id: 'e', status: 'SUCCESS', startTime: new Date(0) }] },
    agentArtifact: { findFirst: async () => ({ content: JSON.stringify({ finalResponse: plainDoc }) }), findMany: async () => [{ executionId: 'e', content: JSON.stringify({ finalResponse: plainDoc }) }] },
    $queryRaw: async () => [{ v: plainDoc, value: plainDoc, finalResponse: plainDoc }],
  };
  const held = await computeDialectLintFact(db, { stageId: 's', interfaceContract: { platformDialect: { bannedTokens: ['insecure_skip_verify'] } }, heldVariant: true });
  const base = await computeDialectLintFact(db, { stageId: 's', interfaceContract: { platformDialect: { bannedTokens: ['insecure_skip_verify'] } } });
  eq(JSON.stringify(held), JSON.stringify(base), 'no held grammar ⇒ byte-identical to the non-held stamp: ');
});

test('V-8a: restore-is-held-base is in the benign switch (an unlisted reason would be hard-gap BLOCKING)', () => {
  eq(computeRollbackDisposition({ checked: false, reason: 'restore-is-held-base' }).disposition, 'benign');
  eq(computeRollbackDisposition({ checked: false, reason: 'restore-is-held-bas' }).disposition, 'blocking');
});

// ─── V-8b dialectLint ────────────────────────────────────────────────────────────────────────────────────────────────────
const C = { platformDialect: { bannedTokens: ['insecure_skip_verify'] } };
const edit = (s: string, r: string) => `## Held File Edits\n\n<<<<<<< SEARCH H1\n${s}\n=======\n${r}\n>>>>>>> REPLACE\n`;
const lint = (doc: string) => runDialectLint(doc, C, { heldEdits: parseHeldEdits(doc) });

test('V-8b: a REMOVAL edit (banned token in SEARCH only) is not flagged; an INTRODUCING edit is', () => {
  const removal = lint(edit('    insecure_skip_verify: true', '    ca_file: /etc/ca.pem'));
  eq([removal.violations.length, removal.heldEditSearchLines], [0, 1]);
  const intro = lint(edit('    ca_file: /etc/ca.pem', '    insecure_skip_verify: true'));
  eq(intro.violations.map((v) => v.token), ['insecure_skip_verify']);
  const fenced = lint('## Held File Edits\n\n```\n<<<<<<< SEARCH H1\n    ca_file: x\n=======\n    insecure_skip_verify: true\n>>>>>>> REPLACE\n```\n');
  eq(fenced.violations.length, 1, 'fenced edits scanned the same: ');
  // FENCED removal: the shared classifier reads the SEARCH line as candidate config; the filter must drop it (EF S-V3-1).
  const fencedRemoval = lint('## Held File Edits\n\n```yaml\n<<<<<<< SEARCH H1\n    insecure_skip_verify: true\n=======\n    ca_file: x\n>>>>>>> REPLACE\n```\n');
  eq([fencedRemoval.violations.length, fencedRemoval.heldEditSearchLines], [0, 1], 'fenced removal: ');
  const unfiltered = runDialectLint('## Held File Edits\n\n```yaml\n<<<<<<< SEARCH H1\n    insecure_skip_verify: true\n=======\n    ca_file: x\n>>>>>>> REPLACE\n```\n', C);
  eq(unfiltered.violations.length, 1, 'control — without the filter the fenced SEARCH line IS flagged: ');
});

test('V-8b: create bodies are scanned; no-opts output carries no heldEditSearchLines (non-variant bytes unchanged)', () => {
  const doc = '## Held File Edits\n\n<<<<<<< create H2 on H1 /etc/otel/extra.yaml\ninsecure_skip_verify: true\n>>>>>>> create\n';
  eq(lint(doc).violations.length, 1);
  const plain = runDialectLint('```yaml\ninsecure_skip_verify: true\n```', C);
  ok(!('heldEditSearchLines' in plain), 'absent on a non-variant stamp');
  eq(JSON.stringify(plain), JSON.stringify(runDialectLint('```yaml\ninsecure_skip_verify: true\n```', C, undefined)));
});

test('V-8b: the PRESENCE half names presence-not-checkable-held-edit on a variant package with a canonical stanza', () => {
  const CS = { platformDialect: { canonicalStanza_X: 'receivers:\n  otlp:', bannedTokens: ['x'] } };
  const doc = edit('a: 1', 'a: 2');
  eq((runDialectLint(doc, CS, { heldEdits: parseHeldEdits(doc) }).transcription as any).reason, 'presence-not-checkable-held-edit');
  ok((runDialectLint(doc, CS).transcription as any).reason !== 'presence-not-checkable-held-edit', 'not on a non-variant run');
});

test('V-8b: the enrichment passes heldEdits only when heldVariant', async () => {
  const doc = edit('    insecure_skip_verify: true', '    ca_file: x');
  const db: any = {
    task: { findMany: async () => [{ id: 'a', title: 'Author x', agentRole: 'config_change_author' }] },
    agentExecution: { findFirst: async () => ({ id: 'e' }), findMany: async () => [{ id: 'e', status: 'SUCCESS', startTime: new Date(0) }] },
    agentArtifact: { findFirst: async () => ({ content: JSON.stringify({ finalResponse: doc }) }), findMany: async () => [{ executionId: 'e', content: JSON.stringify({ finalResponse: doc }) }] },
    $queryRaw: async () => [{ v: doc, value: doc, finalResponse: doc }],
  };
  const v = await computeDialectLintFact(db, { stageId: 's', interfaceContract: C, heldVariant: true });
  const n = await computeDialectLintFact(db, { stageId: 's', interfaceContract: C });
  if (v.reason === 'no-author-text' || n.reason === 'no-author-text') throw new Error('stub did not reach the author text');
  eq(['heldEditSearchLines' in v, 'heldEditSearchLines' in n], [true, false]);
});

test('V-8b: contractPropagation is untouched by the variant (it scans child briefs, never packages)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'agents', 'harness', 'contract-propagation-enrichment.ts'), 'utf8');
  ok(!/held|variant/i.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')), 'no variant branch in contract-propagation');
});

(async () => {
  for (const { d, fn } of pending) {
    try { await fn(); passed++; console.log(`  ✅ ${d}`); }
    catch (e) { failed++; console.log(`  ❌ ${d}\n     ${(e as Error).message}`); }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
