/**
 * test-apply-block-placeholder.ts — pins lib/agents/harness/apply-block-placeholder.ts (the PLACEHOLDER-APPLIES-AS-LITERAL
 * interim warning fact) and its one render (appendApplyBlockPlaceholderSection, lib/services/report-warnings-section.ts).
 *
 * BOTH DIRECTIONS, on REAL stored packages (scripts/fixtures/apply-block-placeholder/, pulled read-only from prod
 * 2026-10-13 — `{finalResponse, toolCalls}` of the persisted result.json, already R10-redacted):
 *   positives  pos-tf-desired-cmrmjpdt1   (07-15, terraform: placeholder as desired-state context + an emergency CLI)
 *              pos-tf-rollback-cmrmnhxhm  (07-15, terraform: the Rollback HCL restores the placeholder)
 *   negatives  neg-tf-prose-cmuuygth6     (10-05, released: the spelling in PROSE only)
 *              neg-net-toolcalls-*        (08-27/28/30, network: the placeholder only in the Author's own toolCalls)
 * plus synthetic EOS / nginx / otelcol lines (P4 §3) and every exclusion. Each rule's code branch is proven
 * load-bearing by a code mutation (withApplyPlaceholderMutation) that flips a named case.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@127.0.0.1:5432/stub';
process.env.PAICHART_SKIP_DB_CONNECT = 'true';
import * as fs from 'fs';
import * as path from 'path';
import {
  computeApplyBlockPlaceholderFact, scanApplyBlockPlaceholders, withApplyPlaceholderMutation, placeholderFormOf,
  SINGLE_ANGLE_PLACEHOLDER, APPLY_PLACEHOLDER_MAX_HITS, APPLY_PLACEHOLDER_WARNING_ID, PLATFORM_WARNINGS_HEADING,
  type ApplyPlaceholderMutation,
} from '../lib/agents/harness/apply-block-placeholder';
import { PLACEHOLDER } from '../lib/agents/harness/redact-artifact-secrets';
import { R10_PLACEHOLDER_RE } from '../lib/agents/harness/package-form-check';
import { appendApplyBlockPlaceholderSection } from '../lib/services/report-warnings-section';
import { pickResultJsonSummary, orderResultJsonForPersist } from '../lib/services/execution-artifacts';
import { MECHANICAL_NETS } from '../lib/agents/harness/mechanical-nets';

let pass = 0;
let failed = 0;
const check = (n: string, ok: boolean, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${n}${ok ? '' : '  ' + extra}`);
  if (ok) pass++; else failed++;
};
const FX = path.resolve(__dirname, 'fixtures/apply-block-placeholder');
const load = (n: string) => JSON.parse(fs.readFileSync(path.join(FX, `${n}.json`), 'utf8')) as { finalResponse: string; toolCalls: unknown };
const fact = (t: string) => computeApplyBlockPlaceholderFact(t) as {
  checked: boolean; count: number; hits?: Array<{ line: number; role: string; form: string }>; reason?: string;
};
const sig = (f: ReturnType<typeof fact>) => (f.hits ?? []).map((h) => `${h.line}:${h.role}:${h.form}`).join(',');
const D = '```';

// ── 0. The forms are DERIVED from R10's constant, and the sibling regex is pinned to it ────────────────────────────
check('F1 single-angle spelling is R10\'s constant minus one angle pair', SINGLE_ANGLE_PLACEHOLDER === '<REDACTED-SECRET>'
  && `<${SINGLE_ANGLE_PLACEHOLDER}>` === PLACEHOLDER, SINGLE_ANGLE_PLACEHOLDER);
check('F2 R10_PLACEHOLDER_RE matches R10\'s constant WHOLE (the two definitions cannot drift apart)',
  (PLACEHOLDER.match(new RegExp(R10_PLACEHOLDER_RE.source)) ?? [''])[0] === PLACEHOLDER);
check('F3 forms: double → r10, single → single-angle, a <<REDACTED…>> sibling → r10, plain text → none',
  placeholderFormOf(`x ${PLACEHOLDER}`) === 'r10' && placeholderFormOf(`x ${SINGLE_ANGLE_PLACEHOLDER}`) === 'single-angle'
  && placeholderFormOf('x <<REDACTED-API-KEY>>') === 'r10' && placeholderFormOf('x REDACTED-SECRET y') === null);
// Author-invented single-angle variants, measured in 3 stored packages (cmt2m5jpw…, cmtbc6fj8…, cmuuygth6…; all prose).
check('F4 the single-angle FAMILY: Author-invented variants are the single-angle form',
  placeholderFormOf('snmp-server community <REDACTED-SNMP-RO-COMMUNITY> ro') === 'single-angle'
  && placeholderFormOf('secret sha512 <REDACTED-BY-HARVESTER: user-secret-hash>') === 'single-angle'
  && placeholderFormOf('<html><body>') === null);

// ── 1. POSITIVES (stored packages) ──────────────────────────────────────────────────────────────────────────────────
{
  const f = fact(load('pos-tf-desired-cmrmjpdt1').finalResponse);
  check('P1 cmrmjpdt1: 3 hits — desired-state context ×2 + the emergency CLI (under a rollback ancestry); the plan output is excluded',
    f.checked && f.count === 3 && sig(f) === '22:desired:r10,42:desired:r10,225:rollback:r10', JSON.stringify(f));
}
{
  const f = fact(load('pos-tf-rollback-cmrmnhxhm').finalResponse);
  check('P2 cmrmnhxhm: 1 hit — the Rollback HCL block; the harvested "Current HCL" and both expected outputs are excluded',
    f.checked && f.count === 1 && sig(f) === '141:rollback:r10', JSON.stringify(f));
}

// ── 2. NEGATIVES (stored packages) ──────────────────────────────────────────────────────────────────────────────────
{
  const fx = load('neg-tf-prose-cmuuygth6');
  const f = fact(fx.finalResponse);
  check('N1 cmuuygth6 (released): the spelling in PROSE only → checked, count 0, no hits key',
    fx.finalResponse.includes(SINGLE_ANGLE_PLACEHOLDER) && f.checked && f.count === 0 && !('hits' in f), JSON.stringify(f));
}
for (const n of ['neg-net-toolcalls-cmtbc6fj8', 'neg-net-toolcalls-cmtcbn0m0', 'neg-net-toolcalls-cmtfgancv']) {
  const fx = load(n);
  const precondition = JSON.stringify(fx.toolCalls).includes(PLACEHOLDER) && !fx.finalResponse.includes('REDACTED-SECRET>');
  const f = fact(fx.finalResponse);
  // (cmtbc6fj8 ALSO carries an Author-invented single-angle variant in PROSE — finalResponse L185 — so for it this is
  // "toolCalls + prose", not toolCalls only; the precondition keys on the R10 spelling.)
  check(`N2 ${n}: the R10 placeholder only in toolCalls (any finalResponse variant is prose) → count 0`, precondition && f.checked && f.count === 0, JSON.stringify(f));
}

// ── 3. SYNTHETIC — the device shapes of P4 §3 and every exclusion ───────────────────────────────────────────────────
const pkg = (...parts: string[]) => parts.join('\n');
const EOS = pkg('# Change package', '', '## Candidate configuration', '', `${D}eos`, 'snmp-server community <<REDACTED-SECRET>> ro',
  'enable password 0 <REDACTED-SECRET>', D, '', '## Rollback', '', `${D}eos`, 'username admin privilege 15 role network-admin secret sha512 <<REDACTED-SECRET>>', D);
// Line 7 is written with the SINGLE-angle spelling and persists as the r10 form: R10 itself rewrites the token on an
// `enable password 0 …` line. The fact reads the persisted bytes, so it reports r10 — the form the operator sees.
check('S1 EOS: community + enable password in the candidate (desired) and the admin hash in the rollback',
  sig(fact(EOS)) === '6:desired:r10,7:desired:r10,13:rollback:r10', sig(fact(EOS)));
const NGINX = pkg('## Desired-State Config File', '', `${D}nginx`, 'location / {', '  proxy_set_header Authorization "Bearer <<REDACTED-SECRET>>";', '}', D);
check('S2 nginx: proxy_set_header value in the desired file', sig(fact(NGINX)) === '5:desired:r10', sig(fact(NGINX)));
const OTEL = pkg('## Proposed collector config', '', `${D}yaml`, 'exporters:', '  otlphttp:', '    headers:', '      x-api-key: "<REDACTED-SECRET>"', D);
check('S3 otelcol: header value (single-angle) in a proposed config', sig(fact(OTEL)) === '7:desired:single-angle', sig(fact(OTEL)));
const EVIDENCE = pkg('## Plan', '', '**Current running-config (harvested):**', `${D}eos`, 'snmp-server community <<REDACTED-SECRET>> ro', D);
check('S4 evidence: a harvested-state quote is NOT an apply block', fact(EVIDENCE).count === 0, JSON.stringify(fact(EVIDENCE)));
const EXPECTED = pkg('## Validation', '', '**Expected output:**', D, 'snmp-server community <<REDACTED-SECRET>> ro', D);
check('S5 expected output is NOT an apply block', fact(EXPECTED).count === 0, JSON.stringify(fact(EXPECTED)));
const PROSE = pkg('## Notes', '', 'The community stays <<REDACTED-SECRET>> in the harvest; never apply it.', '', `${D}eos`, 'snmp-server location rack-4', D);
check('S6 prose outside any fence is NOT counted', fact(PROSE).count === 0, JSON.stringify(fact(PROSE)));
const TILDE = pkg('## Candidate configuration', '', '~~~eos', 'snmp-server community <<REDACTED-SECRET>> ro', '~~~');
check('S7 a ~~~ fence the classifier\'s walk does not see is COUNTED as unclassified (an unreadable role is not safety)',
  sig(fact(TILDE)) === '4:unclassified:r10', sig(fact(TILDE)));
const DESIRED_LABELLED_BASELINE = pkg('## Desired-State Config File', '', '**Replaces the baseline above in full:**', `${D}yaml`, 'auth: "<<REDACTED-SECRET>>"', D);
check('S8 a desired file labelled "replaces the baseline" (kind harvested-state) is desired by its heading ancestry',
  sig(fact(DESIRED_LABELLED_BASELINE)) === '5:desired:r10', sig(fact(DESIRED_LABELLED_BASELINE)));
const R10_AT_PERSIST = pkg('## Candidate configuration', '', `${D}eos`, 'username ops privilege 15 secret sha512 $6$abcdefgh$ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP', D);
check('S9 a REAL secret the Author wrote becomes a placeholder at persist — the fact describes the persisted bytes',
  sig(fact(R10_AT_PERSIST)) === '4:desired:r10', JSON.stringify(fact(R10_AT_PERSIST)));
// (A community line would come back r10: R10 rewrites the community token at persist, as S1 shows.)
const INVENTED = pkg('## Candidate configuration', '', `${D}yaml`, 'x-api-key: "<REDACTED-BY-HARVESTER: api key>"', D,
  '', 'Restated as placeholders only, never as values: `<REDACTED-USER-SECRET>`.');
check('S14 an invented variant in a candidate block is a hit; the same family in prose is not',
  sig(fact(INVENTED)) === '4:desired:single-angle', sig(fact(INVENTED)));
const MANY = pkg('## Candidate configuration', '', `${D}eos`, ...Array.from({ length: 7 }, (_, i) => `snmp-server community <<REDACTED-SECRET>> ro view v${i}`), D);
{
  const f = fact(MANY);
  // Sizes AS PERSISTED (the terminal persist pretty-prints with indent 2; nested 2 levels under the root object).
  const persistedBytes = (x: unknown) => JSON.stringify({ applyBlockPlaceholder: x }, null, 2).length - 4;
  const worst = { version: 1, checked: true, classifier: 3, count: 9999,
    hits: Array.from({ length: APPLY_PLACEHOLDER_MAX_HITS }, (_, i) => ({ line: 9990 + i, role: 'unclassified', form: 'single-angle' })) };
  const wb = persistedBytes(worst);
  check(`S10 cap: 7 hits → count 7, ${APPLY_PLACEHOLDER_MAX_HITS} persisted; worst case persisted ${wb} B ≤ 700 B`,
    f.count === 7 && f.hits?.length === APPLY_PLACEHOLDER_MAX_HITS && wb <= 700, `${wb} ${JSON.stringify(f)}`);
  const clean = persistedBytes(fact(PROSE));
  check(`S11 a clean package's fact is ${clean} B as persisted (≤ 120 B; in the tail, so 0 B of the head)`, clean <= 120, String(clean));
}
check('S12 empty deliverable → checked:false with a NAMED reason (absence is never a silent pass)',
  fact('').checked === false && fact('').reason === 'empty-deliverable' && fact('   ').reason === 'empty-deliverable');
check('S13 no line TEXT is persisted (a spelling on the fact would self-match every text trigger)',
  !JSON.stringify(fact(EOS)).includes('REDACTED'));

// ── 4. CODE MUTATIONS — each rule is load-bearing ───────────────────────────────────────────────────────────────────
const flips: Array<[ApplyPlaceholderMutation, string, () => boolean]> = [
  ['no-expected-exclusion', 'S5 expected output becomes a hit', () => fact(EXPECTED).count === 1],
  ['no-evidence-exclusion', 'S4 harvested evidence becomes a hit', () => fact(EVIDENCE).count === 1],
  ['no-fence-authority', 'S6 / N1 prose becomes a hit', () => fact(PROSE).count === 1 && fact(load('neg-tf-prose-cmuuygth6').finalResponse).count === 1],
  ['no-persist-redaction', 'S9 the real secret is no longer seen', () => fact(R10_AT_PERSIST).count === 0],
  ['no-single-angle', 'S3 the single-angle spelling is missed', () => fact(OTEL).count === 0],
  ['no-unclassified', 'S7 the ~~~ fence is silently dropped', () => fact(TILDE).count === 0],
];
for (const [m, what, flipped] of flips) {
  check(`M ${m}: ${what}`, withApplyPlaceholderMutation(m, flipped));
}
check('M controls: every mutated case reads as pinned again once the mutation is restored',
  fact(EXPECTED).count === 0 && fact(EVIDENCE).count === 0 && fact(PROSE).count === 0 && fact(R10_AT_PERSIST).count === 1
  && fact(OTEL).count === 1 && fact(TILDE).count === 1);

// ── 5. THE REGISTRY ENTRY + the whitelist decision ──────────────────────────────────────────────────────────────────
{
  const net = MECHANICAL_NETS.find((n) => n.name === 'applyBlockPlaceholder')!;
  const applies = (role: string, type = 'ACTION') => net.appliesTo({ task: { type }, agentRole: role } as never);
  check('G1 registered once, at leaf-persist', MECHANICAL_NETS.filter((n) => n.name === 'applyBlockPlaceholder').length === 1 && net.point === 'leaf-persist');
  check('G2 applies to config_change_author by EXACT role, never requirements_author / harvester / reviewer / a PIPELINE task',
    applies('config_change_author') && !applies('requirements_author') && !applies('infra_state_harvester')
    && !applies('change_reviewer') && !applies('config_change_author', 'PIPELINE'));
  check('G3 is the LAST entry (appended: no existing entry\'s stamp or key order moves)', MECHANICAL_NETS[MECHANICAL_NETS.length - 1] === net);
  const picked = pickResultJsonSummary({ applyBlockPlaceholder: fact(EOS), toolLoop: { a: 1 } });
  check('G4 NOT whitelisted: off the lean card and the agent.results summary (it stays in the raw result.json a verbose read returns)',
    !('applyBlockPlaceholder' in picked) && 'toolLoop' in picked && !!net.summaryExcludedReason);
  // B1 mitigation: persisted AFTER toolCalls, so it costs the 8 KB tool-result head nothing and does not move finalResponse.
  const built = { toolLoop: { a: 1 }, applyBlockPlaceholder: fact(EOS), markerPresence: { x: 1 }, finalResponse: 'f', toolCalls: [] };
  const order = Object.keys(orderResultJsonForPersist(built));
  check('G5 persisted LAST, after finalResponse and toolCalls; every other key keeps its order',
    JSON.stringify(order) === JSON.stringify(['toolLoop', 'markerPresence', 'finalResponse', 'toolCalls', 'applyBlockPlaceholder']), JSON.stringify(order));
  const persisted = JSON.stringify(orderResultJsonForPersist({ ...built, applyBlockPlaceholder: fact(PROSE) }), null, 2);
  check('G6 a clean package moves finalResponse by 0 bytes (same offset as without the fact)',
    persisted.indexOf('"finalResponse"') === JSON.stringify(orderResultJsonForPersist({ toolLoop: { a: 1 }, markerPresence: { x: 1 }, finalResponse: 'f', toolCalls: [] }), null, 2).indexOf('"finalResponse"'));
}

// ── 6. THE REPORT.MD RENDER ─────────────────────────────────────────────────────────────────────────────────────────
{
  const report = '# Change package\n\nbody\n';
  const hit = appendApplyBlockPlaceholderSection(report, fact(EOS), 'cmtask0000000000000000001');
  check('R1 a hit appends ONE platform-warnings line naming the id, the source task and each line + role',
    hit.appended === 1 && hit.content.startsWith(report.trimEnd()) && hit.content.includes(PLATFORM_WARNINGS_HEADING)
    && hit.content.includes(`- ${APPLY_PLACEHOLDER_WARNING_ID} — 3 lines`) && hit.content.includes('cmtask0000000000000000001')
    && hit.content.includes('line 13 (rollback)') && hit.content.includes("Author's result.json finalResponse"), hit.content);
  check('R2 the section never carries a placeholder spelling or the reviewer label literal',
    !hit.content.includes('REDACTED') && !hit.content.includes('NON-BLOCKING WARNING ('));
  const unchanged = [undefined, null, fact(PROSE), fact(''), { checked: true, count: '2' }, 'x']
    .every((x) => { const r = appendApplyBlockPlaceholderSection(report, x, 'cm1'); return r.appended === 0 && r.content === report; });
  check('R3 no stamp / count 0 / checked:false / malformed → the report is BYTE-IDENTICAL', unchanged);
  const open = appendApplyBlockPlaceholderSection('# P\n\n```hcl\nx = 1\n', fact(EOS), 'cm1');
  check('R4 an unclosed fence is closed first, so the heading never renders inside a code block',
    /```hcl\nx = 1\n```\n\n---\n\n## Platform warnings/.test(open.content), open.content);
  const capped = appendApplyBlockPlaceholderSection(report, fact(MANY), 'cm1');
  check('R5 a capped fact says how many more lines it did not list', capped.content.includes('and 2 more'), capped.content);
  const persistSrc = fs.readFileSync(path.resolve(__dirname, '../lib/services/execution-terminal-persist.ts'), 'utf8');
  check('R6 the terminal persist reads the stamp off the SAME parsed source artifact and appends it (no new query)',
    persistSrc.includes('sourceApplyBlockPlaceholder = sourceJson.applyBlockPlaceholder;')
    && persistSrc.includes('appendApplyBlockPlaceholderSection(') && persistSrc.includes('applyBlockPlaceholderAppended: appended'));
}

console.log(`\n${failed ? '❌' : '✅'} apply-block-placeholder: ${pass} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
