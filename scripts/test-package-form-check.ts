#!/usr/bin/env ts-node
/**
 * Package form check — detector + fact suite (mechanical-reflection-trigger Step A, 2026-10-07; review fold same day).
 *
 * Pins lib/agents/harness/package-form-check.ts against REAL Author packages (scripts/fixtures/form-check/, pulled
 * read-only from prod, R10-checked: 0 redactions needed, 0 placeholders) and the negative controls below.
 *
 *   F1 #21 cmuw9a9u5 (2026-10-06 regression run, refused): elided rollback hunk + located marker → fires.
 *   F2 cmusyaobr (10-03, approved): header undercounts body by 3 → fires; COMPANION runs real `git apply`.
 *   F3 #22 cmuwby460 (obs prose, refused): 0 trigger hits — the documented v1 limitation (a v2 flips it DELIBERATELY).
 *   F4 cmu23zy5d (approved, `-  ...`): fires; copy source is the package's own add hunk.
 *   N1–N16: controls that MUST NOT trigger (several assert no hit of any kind). P1: a POSITIVE fact-only control.
 *
 * MUTATION PROOFS are CODE mutations (review L9): each flips one rule inside the shipping module through the scoped
 * `withFormCheckMutation` switch and requires its control to turn RED. PERF PINS hold the linear-regex fix (review F1).
 *
 * Plan: cline_docs/reviews/mechanical-reflection-trigger-2026-10-07/PLAN.md §8.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  analyzePackageForm, computeFormCheckFact, isFormCheckEligible, decideFormCorrection, withFormCheckMutation,
  allTriggerHitsAreUndercounts, allHitsAreUndercounts, isUndercountHit,
  ELISION_MARKER_RES, FORM_CHECK_MAX_HITS, FORM_CHECK_MAX_LOCATIONS, FORM_CHECK_ELIGIBLE_ROLE,
  type FormCheckMutation,
} from '../lib/agents/harness/package-form-check';
import * as pfc from '../lib/agents/harness/package-form-check';

console.log('🧾 Package form check (detector + fact)\n');

let passed = 0;
let failed = 0;
function test(d: string, fn: () => void) {
  try { fn(); console.log(`✅ ${d}`); passed++; } catch (e) { console.error(`❌ ${d}`); console.error(`   ${(e as Error).message}`); failed++; }
}
function ok(c: unknown, m: string) { if (!c) throw new Error(m); }

const FX = path.join(__dirname, 'fixtures', 'form-check');
const fx = (f: string) => fs.readFileSync(path.join(FX, f), 'utf8');
const F1 = fx('f1-tf-rollback-elided-cmuw9a9u5.md');
const F2 = fx('f2-tf-undercount-cmusyaobr.md');
const F3 = fx('f3-obs-prose-cmuwby460.md');
const F4 = fx('f4-tf-rollback-elided-approved-cmu23zy5d.md');
const N4 = fx('n4-tf-unnumbered-nosource-cmul0cewg.md');
// N10: the prototype's 16th specimen. Two expected-output blocks eliding the SAME span (`...`) — the content exists
// nowhere in the package. The prototype "located" them through the marker line; the plan's gap rule does not.
const N10 = fx('n10-net-same-span-elided-cmsb7rrm4005.md');
const fence = (lang: string, body: string, f = '```') => f + lang + '\n' + body + '\n' + f;

const kinds = (t: string) => analyzePackageForm(t).hits.map((h) => h.kind);
const triggers = (t: string) => kinds(t).filter((k) => k === 'hunk-count-mismatch' || k === 'marker-line-located').length;

// ── Negative controls ──────────────────────────────────────────────────────────────────────────────────
const N1 = '## Device config\n' + fence('', [
  'snmp-server community <<REDACTED-SECRET>> RO',
  'username admin secret 0 ...<<REDACTED-SECRET>>',
  '(see above <<REDACTED-SECRET>>)', // a whole-line phrase marker EXCEPT for the placeholder — only R10 keeps it silent
].join('\n'));
const N2 = '## Validation\nMust contain: `network 10.99.0.0 mask 255.255.255.255`\n' + fence('', [
  'Command: show run | section router bgp',
  'Presence assertion: must contain the line `network 10.99.0.0 mask 255.255.255.255`',
].join('\n'));
const N3 = '## Plan output\n' + fence('', [
  '  # aws_s3_bucket_policy.writer will be updated in-place',
  '  ~ resource "aws_s3_bucket_policy" "writer" {',
  '        # (3 unchanged elements hidden)',
  '    }',
].join('\n'));
const N5 = '## Misc\n' + fence('hcl', ['policy = jsonencode({...})', 'aws_s3_bucket.logs: Destroying...', '-A INPUT -j ...RETURN', 'func f(x...) {}'].join('\n'));
const N6 = '## Manifests\n' + fence('yaml', 'apiVersion: v1\nkind: ConfigMap\n...') + '\n\n' +
  fence('yaml', 'apiVersion: v1\nkind: Namespace\n...\n---\napiVersion: v1\nkind: Secret');
const N7 = '## Diff\n' + fence('diff', [
  '--- a/main.tf', '+++ b/main.tf', '@@ -1,4 +1,4 @@', ' resource "aws_s3_bucket" "logs" {', '',
  '-  force_destroy = false', '+  force_destroy = true', ' }', '\\ No newline at end of file',
].join('\n'));
const N8 = '## Diff\n' + fence('diff', [
  '--- a/one.tf', '+++ b/one.tf', '@@ -1,2 +1,3 @@', ' a = 1', '+b = 2', ' c = 3',
  '--- a/two.tf', '+++ b/two.tf', '@@ -0,0 +1,2 @@', '+d = 4', '+e = 5',
].join('\n'));
const N9 = '## Step 2\n' + fence('', [
  'BGP router identifier 10.99.0.0, local AS number 65001', '...',
  'Neighbor        V    AS MsgRcvd MsgSent   TblVer', '...', '(Verify BGP is active and peering is established)',
].join('\n')) + '\n\n## Step 2 (peer)\n' + fence('', [
  'BGP router identifier 10.99.0.1, local AS number 65002', '...',
  'Neighbor        V    AS MsgRcvd MsgSent   TblVer', '...', '(Verify BGP is active and peering is established)',
].join('\n'));
// N11 (review M1 / probe P3): an ANNOTATION on a line that is PRESENT, beside a full-file block that holds the
// neighbours with the real line between them. Triggered a located marker (then `elision-located`) before the anchoring fix.
const FULL = ['resource "aws_s3_bucket" "logs" {', '  bucket        = "acme-logs-prod"', '  acl           = "private"', '  force_destroy = false', '}'];
const N11 = '## Full file\n' + fence('hcl', FULL.join('\n')) + '\n\n## Diff\n' + fence('diff', [
  '--- a/s3.tf', '+++ b/s3.tf', '@@ -1,5 +1,5 @@', ' resource "aws_s3_bucket" "logs" {', '   bucket        = "acme-logs-prod"',
  '   acl           = "private"   # unchanged (see above)', '-  force_destroy = false', '+  force_destroy = true', ' }',
].join('\n'));
// N12 (review P2/L2): CRLF line endings with an EMPTY context line — was a false hunk-count-mismatch ('\r' foreign).
const N12 = N7.split('\n').join('\r\n');
// N13 (review §2 item 4): a literal device `...` (Cisco ping failure) beside a sibling block with DIFFERENT neighbours.
const N13 = '## Before\n' + fence('', ['Sending 5, 100-byte ICMP Echos to 10.0.0.1, timeout is 2 seconds:', '...',
  'Success rate is 0 percent (0/3)'].join('\n')) + '\n\n## After\n' + fence('', [
  'Sending 5, 100-byte ICMP Echos to 10.0.0.1, timeout is 2 seconds:', '!!!!!', 'Success rate is 100 percent (5/5), round-trip min/avg/max = 1/1/2 ms'].join('\n'));
// N14 (review P5/L6): a 4-backtick outer fence carrying a ``` inner fence — ONE block, no phantom.
const N14 = '## Example\n' + fence('markdown', 'Run this:\n```bash\nterraform plan\n```\nthen apply.', '````');
// N15 (review P6/L6): a ~~~ fence is counted; its hunk is exact.
const N15 = '## Diff\n' + fence('diff', ['@@ -1,1 +1,1 @@', '-a = 1', '+a = 2'].join('\n'), '~~~');
// N16 (review G2 shape): a sanctioned no-source omission in an unnumbered hunk — fact only.
const N16 = '## Diff\n' + fence('diff', ['@@ resource "aws_s3_bucket" "logs" @@', '   bucket = "acme-logs-prod"', '...', '+  versioning { enabled = true }'].join('\n'));
const CONTROLS: Record<string, { text: string; anyHit: boolean }> = {
  N1: { text: N1, anyHit: false }, N2: { text: N2, anyHit: false }, N3: { text: N3, anyHit: false },
  N4: { text: N4, anyHit: true }, N5: { text: N5, anyHit: false }, N6: { text: N6, anyHit: false },
  N7: { text: N7, anyHit: false }, N8: { text: N8, anyHit: false }, N9: { text: N9, anyHit: true },
  N10: { text: N10, anyHit: true }, N11: { text: N11, anyHit: false }, N12: { text: N12, anyHit: false },
  N13: { text: N13, anyHit: true }, N14: { text: N14, anyHit: false }, N15: { text: N15, anyHit: false },
  N16: { text: N16, anyHit: true },
};
// P1 (review L1): one-sided overflow — header -1,3 +1,3 over four `-` and three `+`. A FACT, never a trigger.
const P1 = '## Diff\n' + fence('diff', ['@@ -1,3 +1,3 @@', '-a', '-b', '-c', '-d', '+a', '+b', '+c'].join('\n'));

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────────
test('F1 #21: elided rollback hunk (declared 26/0, observed 3/0) + located marker; copy source = the add hunk body', () => {
  const a = analyzePackageForm(F1);
  const h = a.hits.find((x) => x.kind === 'hunk-count-mismatch')!;
  ok(h && h.header === '@@ -1,26 +0,0 @@', `hunk hit: ${JSON.stringify(h)}`);
  ok(h.declared!.old === 26 && h.declared!.new === 0 && h.observed!.old === 3 && h.observed!.new === 0, 'counts');
  ok(h.heading.includes('Rollback'), `heading ${h.heading}`);
  const src = a.blocks.find((b) => b.index === h.locatedIn![0].block)!;
  ok(src.body.some((l) => l.startsWith('@@ -0,0 +1,26 @@')), 'locatedIn names the @@ -0,0 +1,26 @@ block');
  ok(h.fills![0].length === 26 && h.fills![0].every((l) => l.startsWith('+')), 'fill = the 26 added body lines');
  const e = a.hits.find((x) => x.kind === 'marker-line-located')!;
  ok(e && e.marker === '- ... (full block as added above)', `marker ${e?.marker}`);
  const fact = computeFormCheckFact({ text: F1, stopReason: 'end_turn' });
  ok(fact.triggerHitsTotal === 2 && fact.correction.notAttemptedReason === 'flag-off', JSON.stringify(fact.correction));
});
test('F2 undercount: @@ -0,0 +1,33 @@ over a 36-line body → extraBodyLines 3, no locatedIn, fires', () => {
  const fact = computeFormCheckFact({ text: F2, stopReason: 'end_turn' });
  const h = fact.hits[0];
  ok(fact.triggerHitsTotal === 1 && h.kind === 'hunk-count-mismatch' && h.extraBodyLines === 3 && !h.locatedIn, JSON.stringify(h));
});
test('F2 companion: real `git apply` exits 0 and writes 33 of 36 lines; the recounted header writes 36', () => {
  const block = analyzePackageForm(F2).blocks.find((b) => b.body.some((l) => l.startsWith('@@ -0,0 +1,33 @@')))!;
  const patch = block.body.join('\n') + '\n';
  const target = 'terraform/prod/s3_bucket_policy_app_logs.tf';
  const apply = (p: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'formcheck-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir });
      fs.writeFileSync(path.join(dir, 'p.patch'), p);
      execFileSync('git', ['apply', 'p.patch'], { cwd: dir, stdio: 'pipe' }); // throws on non-zero exit
      return fs.readFileSync(path.join(dir, target), 'utf8').replace(/\n$/, '').split('\n').length;
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };
  ok(apply(patch) === 33, 'original patch must write the silent 33');
  ok(apply(patch.replace('@@ -0,0 +1,33 @@', '@@ -0,0 +1,36 @@')) === 36, 'recounted patch writes 36');
  ok(computeFormCheckFact({ text: F2.replace('@@ -0,0 +1,33 @@', '@@ -0,0 +1,36 @@'), stopReason: 'end_turn' }).triggerHitsTotal === 0,
    'the recounted package carries no trigger hit');
});
test('F3 #22 (observability prose-instead-of-literal): 0 trigger hits — v1 limitation, pinned', () => {
  ok(triggers(F3) === 0, `trigger hits ${triggers(F3)}`);
});
test('F4 cmu23zy5d (approved, `-  ...`): fires; copy source is the package\'s own add hunk', () => {
  const a = analyzePackageForm(F4);
  const h = a.hits.find((x) => x.kind === 'hunk-count-mismatch')!;
  ok(h.declared!.old === 24 && h.observed!.old === 3, JSON.stringify(h));
  const src = a.blocks.find((b) => b.index === h.locatedIn![0].block)!;
  ok(src.body.some((l) => /^@@ -0,0 \+\d+,24 @@/.test(l)), 'source is a 24-line add hunk');
  ok(a.hits.some((x) => x.kind === 'marker-line-located' && x.marker === '-  ...'), 'marker located');
});

// ── Controls ─────────────────────────────────────────────────────────────────────────────────────────
for (const [name, { text, anyHit }] of Object.entries(CONTROLS)) {
  test(`${name}: ${anyHit ? 'no TRIGGER hit (its markers/headers are facts only)' : 'silent — no hit of any kind'}`, () => {
    const k = kinds(text);
    ok(anyHit ? triggers(text) === 0 : k.length === 0, `hits: ${k.join(', ')}`);
  });
}
test('N12: CRLF parses exactly like LF (1 block, 1 exact hunk)', () => {
  const a = analyzePackageForm(N12);
  ok(a.blocks.length === 1 && a.numberedHunks === 1 && a.hits.length === 0, JSON.stringify({ b: a.blocks.length, h: a.numberedHunks }));
});
test('N4: the unnumbered @@ headers are COUNTED (fact only)', () => {
  ok(analyzePackageForm(N4).unnumberedHunkHeaders >= 1, 'unnumberedHunkHeaders ≥ 1');
});
test('N8: a two-file diff splits at the ---/+++ pair (2 numbered hunks, both exact)', () => {
  const a = analyzePackageForm(N8);
  ok(a.numberedHunks === 2 && a.hits.length === 0, `hunks ${a.numberedHunks}, hits ${a.hits.length}`);
});
test('N9/N10: the same span elided in two blocks is NOT located (gap rule), each marker still a fact', () => {
  ok(kinds(N9).length === 4 && kinds(N9).every((x) => x === 'marker-line-unlocated'), kinds(N9).join(','));
  ok(kinds(N10).length > 0 && kinds(N10).every((x) => x === 'marker-line-unlocated'), kinds(N10).join(','));
});
test('N13: a device `...` with different neighbours elsewhere stays unlocated (fact only)', () => {
  ok(kinds(N13).join() === 'marker-line-unlocated', kinds(N13).join());
});
test('N14/N15: fence grammar — 4-backtick outer fence is ONE block; ~~~ fences are counted', () => {
  ok(analyzePackageForm(N14).blocks.length === 1, `blocks ${analyzePackageForm(N14).blocks.length}`);
  const a = analyzePackageForm(N15);
  ok(a.blocks.length === 1 && a.numberedHunks === 1, `blocks ${a.blocks.length}, hunks ${a.numberedHunks}`);
});
test('P1 (positive, fact only): one-sided overflow is recorded as hunk-side-overflow and never triggers', () => {
  const f = computeFormCheckFact({ text: P1, stopReason: 'end_turn' });
  ok(f.hits.length === 1 && f.hits[0].kind === 'hunk-side-overflow' && f.triggerHitsTotal === 0, JSON.stringify(f.hits));
  ok(f.hits[0].observed!.old === 4 && f.hits[0].declared!.old === 3, 'observed/declared transcribed');
});

// ── Fact shape, eligibility, decision ────────────────────────────────────────────────────────────────
test('eligibility is an EXACT role match, non-PIPELINE', () => {
  ok(isFormCheckEligible(FORM_CHECK_ELIGIBLE_ROLE, 'ACTION'), 'author eligible');
  for (const r of ['requirements_author', 'change_reviewer', 'infra_change_architect', 'Config_Change_Author', 'config_change_author_x'])
    ok(!isFormCheckEligible(r, 'ACTION'), `${r} must not be eligible`);
  ok(!isFormCheckEligible(FORM_CHECK_ELIGIBLE_ROLE, 'PIPELINE'), 'PIPELINE task excluded');
});
test('unchecked arms are named and carry NULL counts — no zero is asserted (review L3)', () => {
  const a = computeFormCheckFact({ text: F1, stopReason: 'max_tokens' });
  ok(!a.checked && a.reason === 'not-end-turn' && a.correction.notAttemptedReason === 'not-checked', JSON.stringify(a));
  ok(a.fencedBlocks === null && a.numberedHunks === null && a.hitsTotal === null && a.triggerHitsTotal === null, 'counts must be null');
  const b = computeFormCheckFact({ text: '   ', stopReason: 'end_turn' });
  ok(!b.checked && b.reason === 'empty-deliverable' && b.fencedBlocks === null, JSON.stringify(b));
});
test('checker-error: fail-OPEN with the named arm, and the message reaches onCheckerError (review F4/L7)', () => {
  // A throw inside the analysis must reach the callback (the core always passes a string, so the guards cannot throw).
  let msg2 = '';
  const evil = { trim: () => 'x', split: () => { throw new Error('split failed'); } } as unknown as string;
  const g = computeFormCheckFact({ text: evil, stopReason: 'end_turn', onCheckerError: (m) => { msg2 = m; } });
  ok(g.reason === 'checker-error' && !g.checked && g.fencedBlocks === null && msg2 === 'split failed', `reason ${g.reason}, message ${msg2}`);
  // A throwing logger cannot fail the run either.
  const h = computeFormCheckFact({ text: evil, stopReason: 'end_turn', onCheckerError: () => { throw new Error('logger down'); } });
  ok(h.reason === 'checker-error', 'a throwing logger must not escape');
});
test('a clean package carries hits: [] WITH non-zero denominators', () => {
  const f = computeFormCheckFact({ text: N7, stopReason: 'end_turn' });
  ok(f.checked && f.hits.length === 0 && f.fencedBlocks === 1 && f.numberedHunks === 1, JSON.stringify(f));
  ok(f.correction.notAttemptedReason === 'no-trigger-hit', 'no-trigger-hit');
});
test('facts, never verdicts: no ok/valid/pass/quality key, and no internal (fills/hunkRange/markerIndex) on the fact', () => {
  const s = JSON.stringify(computeFormCheckFact({ text: F1, stopReason: 'end_turn' }));
  for (const k of ['"ok"', '"valid"', '"pass"', '"passed"', '"quality"', '"verdict"', '"fills"', '"hunkRange"', '"markerIndex"']) ok(!s.includes(k), `found ${k}`);
});
test('hits are capped at 8 with an exact hitsTotal; trigger hits sort first', () => {
  const many = '## X\n' + Array.from({ length: 12 }, () => fence('', 'alpha beta gamma\n...\ndelta epsilon zeta')).join('\n\n');
  const f = computeFormCheckFact({ text: F2 + '\n\n' + many, stopReason: 'end_turn' });
  ok(f.hits.length === FORM_CHECK_MAX_HITS && (f.hitsTotal ?? 0) > FORM_CHECK_MAX_HITS, `${f.hits.length}/${f.hitsTotal}`);
  ok(f.hits[0].kind === 'hunk-count-mismatch', 'trigger first');
});
test('locatedIn is capped at 3 with locatedInTotal, and a worst-case 8-hit fact serializes under 4 KB (review F2)', () => {
  const adds = Array.from({ length: 40 }, (_, k) => fence('diff', `@@ -0,0 +1,3 @@\n+a${k} = 1\n+b${k} = 2\n+c${k} = 3`)).join('\n\n');
  const dels = Array.from({ length: 40 }, () => fence('diff', '@@ -1,3 +0,0 @@\n-a = 1')).join('\n\n');
  const f = computeFormCheckFact({ text: '## ' + 'H'.repeat(200) + '\n' + adds + '\n\n' + dels, stopReason: 'end_turn' });
  const h = f.hits.find((x) => x.locatedIn)!;
  ok(h.locatedIn!.length === FORM_CHECK_MAX_LOCATIONS && h.locatedInTotal === 40, `${h.locatedIn!.length} / ${h.locatedInTotal}`);
  const size = Buffer.byteLength(JSON.stringify(f));
  ok(f.hits.length === FORM_CHECK_MAX_HITS && size < 4096, `fact is ${size} bytes`);
});
test('a marker that neighbours a secret is R10-redacted BEFORE it enters the fact', () => {
  const t = '## Cfg\n' + fence('', 'interface Ethernet1 description uplink\n... password Sup3r$ecret9\nrouter bgp 65001 neighbor x');
  ok(!JSON.stringify(analyzePackageForm(t).hits).includes('Sup3r$ecret9'), 'secret leaked');
});
test('decision precedence #89 > budget > flag > Step B scope (plan §4)', () => {
  const base = { checked: true, triggerHitsTotal: 1, correctionTurnUsed: false, budgetFlagged: false, enabled: true, allUndercount: true };
  ok(decideFormCorrection(base).attempted === true, 'attempt when all clear');
  ok(decideFormCorrection({ ...base, allUndercount: false }).notAttemptedReason === 'hits-include-non-undercount', 'scope');
  ok(decideFormCorrection({ ...base, allUndercount: undefined }).notAttemptedReason === 'hits-include-non-undercount', 'scope absent ⇒ never attempt');
  // Flag BEFORE scope: with the flag off every reason is byte-identical to Step A, whatever the package holds.
  ok(decideFormCorrection({ ...base, enabled: false, allUndercount: false }).notAttemptedReason === 'flag-off', 'flag before scope');
  ok(decideFormCorrection({ ...base, correctionTurnUsed: true, budgetFlagged: true }).notAttemptedReason === 'prior-pass-used:anti-fabrication', '#89 first');
  ok(decideFormCorrection({ ...base, budgetFlagged: true, enabled: false }).notAttemptedReason === 'budget-flagged', 'budget before flag');
  ok(decideFormCorrection({ ...base, enabled: false }).notAttemptedReason === 'flag-off', 'flag-off');
  ok(decideFormCorrection({ ...base, triggerHitsTotal: 0, correctionTurnUsed: true }).notAttemptedReason === 'no-trigger-hit', 'no hit wins');
});
test('Step B scope: allTriggerHitsAreUndercounts — F2 (pure undercount) true; F1/F4 (short + marker) false; foreign-line and short-only false', () => {
  ok(allTriggerHitsAreUndercounts(analyzePackageForm(F2)) === true, 'F2 must be in scope');
  ok(allTriggerHitsAreUndercounts(analyzePackageForm(F1)) === false, 'F1 (#21) must be out of scope');
  ok(allTriggerHitsAreUndercounts(analyzePackageForm(F4)) === false, 'F4 must be out of scope');
  // An "extra" line that is FOREIGN (no diff prefix) inside an unsatisfied hunk: a header recount cannot fix it.
  const foreign = '## D\n' + fence('diff', '@@ -0,0 +1,2 @@\n+a = 1\nresource_without_prefix\n+b = 2\n+c = 3');
  const fh = analyzePackageForm(foreign).hits.filter((h) => h.kind === 'hunk-count-mismatch');
  ok(fh.length === 1 && !isUndercountHit(fh[0], analyzePackageForm(foreign)), 'foreign-line mismatch counted as an undercount');
  // Short only (body fewer than declared, no marker): never an undercount.
  const short = '## D\n' + fence('diff', '@@ -0,0 +1,4 @@\n+a = 1\n+b = 2');
  ok(!allTriggerHitsAreUndercounts(analyzePackageForm(short)), 'a short hunk counted as an undercount');
  // No trigger at all ⇒ false (never "vacuously all").
  ok(!allTriggerHitsAreUndercounts(analyzePackageForm('## x\n' + fence('diff', '@@ -0,0 +1,1 @@\n+a = 1'))), 'vacuous truth');
});
test('B-M1 control: an undercount whose EXTRA lines include `+    # ...` is OUT of scope (every HIT must be an undercount), and NOT attempted', () => {
  const probe = '## Policy\n' + fence('diff', [
    '--- /dev/null', '+++ b/policy.tf', '@@ -0,0 +1,3 @@',
    '+resource "aws_s3_bucket_policy" "p" {', '+  bucket = "acme-logs-prod"', '+  policy = jsonencode({',
    '+    # ...', '+  })', '+}',
  ].join('\n'));
  const a = analyzePackageForm(probe);
  const kinds = a.hits.map((h) => h.kind).sort().join(',');
  ok(kinds === 'hunk-count-mismatch,marker-line-unlocated', `probe hits: ${kinds}`);
  ok(allTriggerHitsAreUndercounts(a) === true, 'the probe must be the B-M1 hole: every TRIGGER hit IS an undercount');
  ok(allHitsAreUndercounts(a) === false, 'B-M1: a marker in the undercount body must put the package out of scope');
  const c = computeFormCheckFact({ text: probe, stopReason: 'end_turn', correctionEnabled: true }).correction;
  ok(c.attempted === false && c.notAttemptedReason === 'hits-include-non-undercount', JSON.stringify(c));
});
test('B-M1: an undercount plus a fact-only marker in ANOTHER block is also out of scope (decided: every hit)', () => {
  const t = F2 + '\n\n## Note\n' + fence('', 'ping 10.0.0.1 repeat 3\n...\nSuccess rate is 0 percent');
  ok(!allHitsAreUndercounts(analyzePackageForm(t)), 'mixed with a fact-only hit must not be attempted');
  ok(allHitsAreUndercounts(analyzePackageForm(F2)), 'F2 alone stays in scope');
});
test('Step B scope reaches the fact: correctionEnabled + F2 → attempted; + F1 → hits-include-non-undercount; flag off → flag-off for both', () => {
  const on = (t: string) => computeFormCheckFact({ text: t, stopReason: 'end_turn', correctionEnabled: true }).correction;
  const off = (t: string) => computeFormCheckFact({ text: t, stopReason: 'end_turn', correctionEnabled: false }).correction;
  ok(on(F2).attempted === true, JSON.stringify(on(F2)));
  ok(on(F1).notAttemptedReason === 'hits-include-non-undercount', JSON.stringify(on(F1)));
  ok(off(F2).notAttemptedReason === 'flag-off' && off(F1).notAttemptedReason === 'flag-off', 'flag-off');
});
test('the marker set is the plan\'s v1 set (3 anchored rules, frozen), and the mutation switch is not importer state', () => {
  ok(ELISION_MARKER_RES.length === 3 && Object.isFrozen(ELISION_MARKER_RES), 'frozen 3-rule set');
  ok(!ELISION_MARKER_RES.some((r) => r.test('# ... existing unchanged arguments ...')), 'labelled omission is not a marker');
  ok(ELISION_MARKER_RES.some((r) => r.test('- ... (full block as added above)')), 'the #21 marker still matches');
  ok(!('FORM_CHECK_MUTATION_HOOKS' in pfc), 'no mutable hook object is exported');
});

// ── Perf pins (review F1/F3): linear regexes; pathological marker counts stay bounded ──────────────────────
function timeIt(fn: () => void): number { const t = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - t) / 1e6; }
test('PERF: a fenced 200K-char whitespace line, and a `#` + 200K-space heading line, each check in < 50 ms', () => {
  const ws = '## A\n' + fence('', ' '.repeat(200_000) + 'x');
  const hd = '#' + ' '.repeat(200_000) + 'b\n' + fence('', 'a');
  const t1 = timeIt(() => computeFormCheckFact({ text: ws, stopReason: 'end_turn' }));
  const t2 = timeIt(() => computeFormCheckFact({ text: hd, stopReason: 'end_turn' }));
  ok(t1 < 50 && t2 < 50, `whitespace line ${t1.toFixed(1)} ms, heading line ${t2.toFixed(1)} ms`);
});
test('PERF: 1,000 markers against a large source block check in < 1,000 ms (pathological marker count)', () => {
  const src = fence('hcl', Array.from({ length: 2000 }, (_, k) => `line_${k} = "value ${k}"`).join('\n'));
  const el = fence('hcl', Array.from({ length: 1000 }, (_, k) => `line_${k * 2} = "value ${k * 2}"\n...`).join('\n'));
  const t = timeIt(() => computeFormCheckFact({ text: '## S\n' + src + '\n\n## E\n' + el, stopReason: 'end_turn' }));
  ok(t < 1000, `${t.toFixed(0)} ms`);
});

// ── CODE-mutation proofs: each mutation flips one rule inside the shipping module; its control must turn RED ──
const RED: Array<[FormCheckMutation, string, () => boolean]> = [
  ['gap-any-line', 'N9', () => triggers(N9) > 0],
  ['gap-any-line', 'N10', () => triggers(N10) > 0],
  ['phrase-unanchored', 'N11', () => triggers(N11) > 0],
  ['label-lexicon', 'N3', () => kinds(N3).length > 0],
  ['label-lexicon', 'N4', () => triggers(N4) > 0],
  ['substring-ellipsis', 'N5', () => kinds(N5).length > 0],
  ['empty-line-foreign', 'N7', () => kinds(N7).length > 0],
  ['backslash-counted', 'N7', () => kinds(N7).length > 0],
  ['no-file-boundary', 'N8', () => kinds(N8).length > 0],
  ['no-r10-exclusion', 'N1', () => kinds(N1).length > 0],
  ['no-yaml-doc-end', 'N6', () => kinds(N6).length > 0],
  // Without the strip a `\r` fence line no longer parses as a fence at all — the analysis diverges from N7's.
  ['no-crlf-strip', 'N12', () => kinds(N12).length > 0 || analyzePackageForm(N12).numberedHunks !== 1],
  ['no-fence-length-match', 'N14', () => analyzePackageForm(N14).blocks.length !== 1],
];
for (const [m, control, isRed] of RED) {
  test(`MUTATION ${m} → ${control} turns RED`, () => {
    ok(!isRed(), `${control} is not green BEFORE the mutation`);
    ok(withFormCheckMutation(m, isRed), `${control} stayed green under ${m} — the rule is not load-bearing for it`);
    ok(!isRed(), `${control} did not return to green after the scoped mutation`);
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
