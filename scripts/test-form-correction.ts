#!/usr/bin/env ts-node
/**
 * Form correction — mock-LLM suite (mechanical-reflection-trigger Step A/A.5, 2026-10-07).
 *
 * Pins lib/agents/harness/form-correction.ts (the correction prompt, the adoption guard, the flag-gated turn)
 * and the Step B wiring contract in execution-core.ts (2026-10-07): the fact block stays pure; the ONE correction call
 * sits in a separate block that runs only on an `attempted` decision; the deliverable is reassigned only on adoption.
 * The end-to-end behaviour through the real core is proved by scripts/test-form-correction-core.ts.
 *
 * Shape follows scripts/test-diagnostic-retry.ts. Plan: cline_docs/reviews/mechanical-reflection-trigger-2026-10-07/PLAN.md §6, §8.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  buildFormCorrectionPrompt, checkFormCorrectionAdoption, runFormCorrection, isFormCorrectionEnabled, addressTokens,
  correctionEdits, describeNotAdopted,
} from '../lib/agents/harness/form-correction';
import { analyzePackageForm } from '../lib/agents/harness/package-form-check';
import { LLMProvider } from '../lib/services/llm/types';

console.log('🔧 Form correction (mock LLM) + Step A wiring pins\n');

let passed = 0;
let failed = 0;
function test(d: string, fn: () => Promise<void> | void) {
  return Promise.resolve().then(fn)
    .then(() => { console.log(`✅ ${d}`); passed++; })
    .catch((e) => { console.error(`❌ ${d}`); console.error(`   ${(e as Error).message}`); failed++; });
}
function ok(c: unknown, m: string) { if (!c) throw new Error(m); }

const FX = path.join(__dirname, 'fixtures', 'form-check');
const F1 = fs.readFileSync(path.join(FX, 'f1-tf-rollback-elided-cmuw9a9u5.md'), 'utf8');
const F2 = fs.readFileSync(path.join(FX, 'f2-tf-undercount-cmusyaobr.md'), 'utf8');

/** A correct repair of F2: the header recount, nothing else. */
const F2_FIXED = F2.replace('@@ -0,0 +1,33 @@', '@@ -0,0 +1,36 @@');
/** A correct repair of F1: the elided rollback hunk written out from the package's own add hunk. */
function repairF1(): string {
  const a = analyzePackageForm(F1);
  const add = a.blocks.find((b) => b.body.some((l) => l.startsWith('@@ -0,0 +1,26 @@')))!;
  const i = add.body.findIndex((l) => l.startsWith('@@ -0,0 +1,26 @@'));
  const removed = add.body.slice(i + 1, i + 27).map((l) => '-' + l.slice(1));
  const lines = F1.split('\n');
  const hdr = lines.findIndex((l) => l.startsWith('@@ -1,26 +0,0 @@'));
  let end = hdr + 1;
  while (end < lines.length && !lines[end].startsWith('```')) end++;
  return [...lines.slice(0, hdr + 1), ...removed, ...lines.slice(end)].join('\n');
}
const F1_FIXED = repairF1();

const cfg = {
  maxTokens: 4096, temperature: 0.3, topP: undefined, stopSequences: undefined, systemPrompt: 'sys',
  provider: LLMProvider.ANTHROPIC_SDK, model: 'test-model', apiKey: 'sk-test-FAKE-form', webSearch: undefined,
  cacheControl: undefined, thinkingBudgetTokens: undefined,
} as any;
const silent = { info: () => {}, warn: () => {}, error: () => {} };
function scripted(responses: any[]) {
  const calls: any[] = []; let i = 0;
  return { calls, generateText: async (_p: string, o: any) => { calls.push(o); const r = responses[i++]; if (r instanceof Error) throw r; return r; } };
}
const resp = (text: string, over: Record<string, unknown> = {}) => ({ text, stopReason: 'end_turn', usage: { inputTokens: 100, outputTokens: 50 }, rawContentBlocks: [{ type: 'text', text }], ...over });
function input(text: string, over: Record<string, unknown> = {}) {
  return {
    text, currentResponse: { text, rawContentBlocks: [{ type: 'text', text }], stopReason: 'end_turn' },
    messageHistory: [{ role: 'user', content: 'author the package' }] as any[],
    totalUsage: { inputTokens: 1000, outputTokens: 500 } as any,
    prompt: 'author the package', normalizedLlmConfig: cfg, mcpFunctions: undefined, executionId: 'exec-test', userId: 'u1', force: true, ...over,
  };
}

(async () => {
  // ── The prompt ────────────────────────────────────────────────────────────────────────────────────
  await test('prompt names the hunk header, counts, the folded placeholder, the copy source and the rules (F1)', () => {
    const p = buildFormCorrectionPrompt(analyzePackageForm(F1));
    for (const s of ['@@ -1,26 +0,0 @@', '26 removed lines', '- ... (full block as added above)', 'the same lines with `+` replaced by `-`',
      'COMPLETE package', 'Do not call any tools', 'Do not mention this check'])
      ok(p.includes(s), `missing: ${s}`);
    ok((p.match(/^\d+\. /gm) || []).length === 1, 'the located placeholder inside the hunk is FOLDED into one item');
  });
  await test('prompt for an undercount says change the header count, not the body, and names git apply (F2)', () => {
    const p = buildFormCorrectionPrompt(analyzePackageForm(F2));
    ok(p.includes('@@ -0,0 +1,33 @@') && p.includes('3 more lines') && p.includes('`git apply`') && p.includes('change the header count, not the body'), p);
  });

  // ── The adoption guard ───────────────────────────────────────────────────────────────────────────
  await test('adopts a correct header recount (F2) and a correct written-out rollback (F1)', () => {
    const a = checkFormCorrectionAdoption({ original: F2, corrected: F2_FIXED, stopReason: 'end_turn' });
    ok(a.adopted && a.postHitsTotal === 0, JSON.stringify(a));
    const b = checkFormCorrectionAdoption({ original: F1, corrected: F1_FIXED, stopReason: 'end_turn' });
    ok(b.adopted, JSON.stringify(b));
  });
  await test('guard: only the fixed section returned → block-changed', () => {
    const only = '```diff\n' + analyzePackageForm(F2_FIXED).blocks[1].body.join('\n') + '\n```';
    ok(checkFormCorrectionAdoption({ original: F2, corrected: only, stopReason: 'end_turn' }).notAdoptedReason === 'block-changed', 'expected block-changed');
  });
  await test('guard: a collateral edit in a hit-free block → block-changed', () => {
    const blk = analyzePackageForm(F2).blocks.find((b) => b.index !== 2 && b.body.length >= 1 && b.body[0].trim())!;
    const edited = F2_FIXED.replace(blk.raw, blk.raw.replace(blk.body[0], blk.body[0] + ' --verbose'));
    ok(edited !== F2_FIXED, 'fixture edit applied');
    ok(checkFormCorrectionAdoption({ original: F2, corrected: edited, stopReason: 'end_turn' }).notAdoptedReason === 'block-changed', 'expected block-changed');
  });
  await test('guard: a new CIDR in prose → prose-changed (H1 catches it before the address fence, now a second layer)', () => {
    const r = checkFormCorrectionAdoption({ original: F2, corrected: F2_FIXED + '\n\nAlso allow 203.0.113.0/24.', stopReason: 'end_turn' });
    ok(r.notAdoptedReason === 'prose-changed', JSON.stringify(r));
    ok(addressTokens('arn:aws:s3:::bucket/x 10.0.0.1').size === 2, 'tokens: ipv4 + arn');
  });
  await test('guard: header left wrong → trigger-hits-remain', () => {
    ok(checkFormCorrectionAdoption({ original: F2, corrected: F2, stopReason: 'end_turn' }).notAdoptedReason === 'trigger-hits-remain', 'expected trigger-hits-remain');
  });
  await test('guard: a NEW marker introduced elsewhere → new-hit', () => {
    const r = checkFormCorrectionAdoption({ original: F2, corrected: F2_FIXED + '\n\n```\nresource "x" "y" {\n<snip>\n```', stopReason: 'end_turn' });
    ok(r.notAdoptedReason === 'new-hit' || r.notAdoptedReason === 'block-changed', JSON.stringify(r));
  });
  await test('guard: max_tokens → not-end-turn; empty → empty; provider error → llm-error', () => {
    ok(checkFormCorrectionAdoption({ original: F2, corrected: F2_FIXED, stopReason: 'max_tokens' }).notAdoptedReason === 'not-end-turn', 'not-end-turn');
    ok(checkFormCorrectionAdoption({ original: F2, corrected: '  ', stopReason: 'end_turn' }).notAdoptedReason === 'empty', 'empty');
    ok(checkFormCorrectionAdoption({ original: F2, corrected: F2_FIXED, stopReason: 'end_turn', providerError: true }).notAdoptedReason === 'llm-error', 'llm-error');
  });

  // ── H1/H2/M4 fabrication probes (architectural review §5) — every one must be REJECTED ──────────────────
  const G = [
    '## Policy', 'This policy denies all non-VPC traffic.', '',
    '```diff', '--- /dev/null', '+++ b/policy.tf', '@@ -0,0 +1,4 @@',
    '+resource "aws_s3_bucket_policy" "p" {', '+  bucket    = "acme-logs-prod"', '+  principal = "arn:aws:iam::111122223333:root"',
    '+  secret    = "<<REDACTED-SECRET>>"', '+  effect    = "Deny"', '+}', '```', '',
    '## Validation', '```', 'terraform validate', '```', '',
    '## Sanctioned omission (no source read)', '```diff', '@@ resource "aws_s3_bucket" "logs" @@', '   bucket = "acme-logs-prod"', '...', '```', '',
    'Confidence: 80/100',
  ].join('\n');
  const GFIX = G.replace('@@ -0,0 +1,4 @@', '@@ -0,0 +1,6 @@');
  await test('probe baseline: the header-only recount of G is ADOPTED (R10 placeholder in the hit block carried verbatim)', () => {
    const r = checkFormCorrectionAdoption({ original: G, corrected: GFIX, stopReason: 'end_turn' });
    ok(r.adopted, JSON.stringify(r));
  });
  for (const [name, corrected, reason] of [
    ['bucket swap in the hunk body', GFIX.replace('acme-logs-prod"\n+  principal', 'acme-logs-attacker"\n+  principal'), 'content-not-from-named-source'],
    ['principal → "*"', GFIX.replace('"arn:aws:iam::111122223333:root"', '"*"'), 'content-not-from-named-source'],
    ['account id swap', GFIX.replace('111122223333', '999988887777'), 'content-not-from-named-source'],
    ['effect Deny → Allow', GFIX.replace('"Deny"', '"Allow"'), 'content-not-from-named-source'],
    ['prose: denies → allows', GFIX.replace('denies all non-VPC traffic', 'allows all traffic'), 'prose-changed'],
    ['confidence raise 80 → 97', GFIX.replace('Confidence: 80/100', 'Confidence: 97/100'), 'confidence-changed'],
    ['secret placeholder filled', GFIX.replace('<<REDACTED-SECRET>>', 'AKIAINVENTEDKEY12345'), 'placeholder-changed'],
    ['fact-only (unlocated) block filled (H2)', GFIX.replace('   bucket = "acme-logs-prod"\n...', '   bucket = "acme-logs-prod"\n+  versioning { enabled = true }'), 'block-changed'],
    ['"mentions the check" in prose', GFIX.replace('## Validation', 'Note: the platform form check fixed a header.\n\n## Validation'), 'prose-changed'],
  ] as Array<[string, string, string]>) {
    await test(`PROBE ${name} → REJECTED (${reason})`, () => {
      ok(corrected !== GFIX, 'probe edit did not apply');
      const r = checkFormCorrectionAdoption({ original: G, corrected, stopReason: 'end_turn' });
      ok(!r.adopted && r.notAdoptedReason === reason, JSON.stringify(r));
    });
  }

  // ── The confidence line (A.5 2026-10-07: 13 of 15 rejections were the prompt's own `N/100` example) ──────────
  const GR = G.replace('Confidence: 80/100', 'Confidence: 80 — Solid: plan counts and the policy follow directly from the design.');
  const GRFIX = GR.replace('@@ -0,0 +1,4 @@', '@@ -0,0 +1,6 @@');
  // B-M4 (Step B review): the last confidence line must be BYTE-IDENTICAL — reformat, lower, raise or a dropped rationale
  // are all rejected. The shipping prompt keeps the line verbatim 9 of 9 (a5-out-v3), so this costs no adoption.
  await test('B-M4: the confidence line kept VERBATIM (rationale included) → ADOPTED', () => {
    const r = checkFormCorrectionAdoption({ original: GR, corrected: GRFIX, stopReason: 'end_turn' });
    ok(r.adopted, JSON.stringify(r));
  });
  await test('B-M4: REFORMATTED with the same number (`80 — rationale` → `80/100`, or bold) → REJECTED (confidence-changed): the rationale is dropped', () => {
    for (const c of ['Confidence: 80/100', '**Confidence:** 80']) {
      const r = checkFormCorrectionAdoption({ original: GR, corrected: GRFIX.replace(/Confidence: 80 — .*$/m, c), stopReason: 'end_turn' });
      ok(!r.adopted && r.notAdoptedReason === 'confidence-changed', `${c}: ${JSON.stringify(r)}`);
    }
  });
  await test('B-M4: RAISED or LOWERED number → REJECTED (confidence-changed)', () => {
    for (const c of ['Confidence: 95/100', 'Confidence: 75']) {
      const r = checkFormCorrectionAdoption({ original: GR, corrected: GRFIX.replace(/Confidence: 80 — .*$/m, c), stopReason: 'end_turn' });
      ok(!r.adopted && r.notAdoptedReason === 'confidence-changed', `${c}: ${JSON.stringify(r)}`);
    }
  });
  await test('confidence line MISSING → REJECTED (confidence-missing)', () => {
    const r = checkFormCorrectionAdoption({ original: GR, corrected: GRFIX.replace(/\nConfidence: 80 — .*$/m, ''), stopReason: 'end_turn' });
    ok(!r.adopted && r.notAdoptedReason === 'confidence-missing', JSON.stringify(r));
  });
  await test('only the LAST `Confidence:` line is checked separately — an earlier prose line mentioning confidence stays byte-identical', () => {
    const two = GR.replace('This policy denies all non-VPC traffic.', 'This policy denies all non-VPC traffic.\nUpstream Confidence: 92 (chained).');
    const fixed = two.replace('@@ -0,0 +1,4 @@', '@@ -0,0 +1,6 @@');
    const r = checkFormCorrectionAdoption({ original: two, corrected: fixed.replace('Upstream Confidence: 92 (chained).', 'Upstream Confidence: 99 (chained).'), stopReason: 'end_turn' });
    ok(!r.adopted && r.notAdoptedReason === 'prose-changed', JSON.stringify(r));
  });
  await test('the prompt asks for the ORIGINAL confidence line and shows NO format example', () => {
    const p = buildFormCorrectionPrompt(analyzePackageForm(F1));
    ok(p.includes('End with your original confidence line exactly as written in your package.'), 'instruction missing');
    ok(!/N\/100/.test(p), 'a format example is still shown');
  });

  // ── Adoption controls: copy-source ambiguity (two same-count add hunks; one span in two versions) ────────
  const TWO = [
    '## A', '```diff', '@@ -0,0 +1,2 @@', '+alpha_one   = "first"', '+alpha_two   = "first"', '```',
    '## B', '```diff', '@@ -0,0 +1,2 @@', '+bravo_one   = "second"', '+bravo_two   = "second"', '```',
    '## Rollback', '```diff', '@@ -1,2 +0,0 @@', '- ...', '```', 'Confidence: 70/100',
  ].join('\n');
  await test('two same-count add hunks: a fill from EITHER named source is adopted; an invented fill is rejected', () => {
    const a = TWO.replace('@@ -1,2 +0,0 @@\n- ...', '@@ -1,2 +0,0 @@\n-alpha_one   = "first"\n-alpha_two   = "first"');
    const b = TWO.replace('@@ -1,2 +0,0 @@\n- ...', '@@ -1,2 +0,0 @@\n-bravo_one   = "second"\n-bravo_two   = "second"');
    const x = TWO.replace('@@ -1,2 +0,0 @@\n- ...', '@@ -1,2 +0,0 @@\n-charlie_one = "third"\n-charlie_two = "third"');
    ok(checkFormCorrectionAdoption({ original: TWO, corrected: a, stopReason: 'end_turn' }).adopted, 'source A');
    ok(checkFormCorrectionAdoption({ original: TWO, corrected: b, stopReason: 'end_turn' }).adopted, 'source B');
    const rx = checkFormCorrectionAdoption({ original: TWO, corrected: x, stopReason: 'end_turn' });
    ok(!rx.adopted && rx.notAdoptedReason === 'content-not-from-named-source', JSON.stringify(rx));
  });
  const VER = [
    '## Before', '```yaml', 'receivers:', '  otlp_receiver_main:', '    endpoint: 0.0.0.0:4317', 'processors:', '  batch_processor_main: {}', '```',
    '## After', '```yaml', 'receivers:', '  otlp_receiver_main:', '    endpoint: 0.0.0.0:4318', 'processors:', '  batch_processor_main: {}', '```',
    '## Excerpt', '```yaml', '  otlp_receiver_main:', '...', '  batch_processor_main: {}', '```', 'Confidence: 70/100',
  ].join('\n');
  await test('a located span present in TWO versions: either named version is adopted, an invented one is rejected (residual: wrong-version risk, Step B)', () => {
    const fill = (mid: string) => VER.replace('  otlp_receiver_main:\n...\n', `  otlp_receiver_main:\n${mid}\n`);
    ok(checkFormCorrectionAdoption({ original: VER, corrected: fill('    endpoint: 0.0.0.0:4317\nprocessors:'), stopReason: 'end_turn' }).adopted, 'version 1');
    ok(checkFormCorrectionAdoption({ original: VER, corrected: fill('    endpoint: 0.0.0.0:4318\nprocessors:'), stopReason: 'end_turn' }).adopted, 'version 2');
    const r = checkFormCorrectionAdoption({ original: VER, corrected: fill('    endpoint: 0.0.0.0:9999\nprocessors:'), stopReason: 'end_turn' });
    ok(!r.adopted && r.notAdoptedReason === 'content-not-from-named-source', JSON.stringify(r));
  });
  await test('M4: the prompt says "elided line", never "placeholder" for `...`, and forbids changing a <<REDACTED-…>> placeholder', () => {
    const p = buildFormCorrectionPrompt(analyzePackageForm(F1));
    ok(p.includes('the elided line') && p.includes('Never change a `<<REDACTED-…>>` placeholder'), p);
    ok(!/the placeholder `/.test(p) && !/Replace a placeholder/.test(p), 'the `...` line is still called a placeholder');
  });

  // ── M2 (prompt-construction review): FULL-TEXT pins on the shipping prompt ──────────────────────────────
  // ⚠️ ANY change to these hashes is a WORDING CHANGE to an agent-facing prompt whose evidence is the A.5 paid replay
  // (run 3, /home/steve/a5-out-v3: 9/9 pure undercounts adopted, 0 collateral; 15/15 prompts byte-equal to this builder
  // on 2026-10-07). Changing the text invalidates that evidence: re-run `npm run replay:form-correction -- --spend` on the
  // in-scope specimens, record the result in the build report, and only then update the hash. Same discipline as
  // test:protocol-golden. The builder is pure, so one hash per shape pins every byte.
  {
    const crypto = require('crypto');
    const sha = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
    await test('M2: the F2 (undercount, the live Step B shape) prompt is byte-pinned', () => {
      const p = buildFormCorrectionPrompt(analyzePackageForm(F2));
      ok(sha(p) === '290ddf913425f8c9726a50c7ff2afb6766ebd6c1409df8b50284255d0d63d10f', `F2 prompt changed (sha ${sha(p)}, ${p.length} chars) — a paid re-run is required before updating this pin`);
    });
    await test('M2: the F1 (short hunk + marker, the replay shape) prompt is byte-pinned', () => {
      const p = buildFormCorrectionPrompt(analyzePackageForm(F1));
      ok(sha(p) === '879536ba913536ca3fbdaf20ba3bcd46bf59b85dc4360b0295baa73443ef2bbd', `F1 prompt changed (sha ${sha(p)}, ${p.length} chars) — a paid re-run is required before updating this pin`);
    });
  }

  // ── B-M3: the hunk START numbers are pinned; only the counts may move ──────────────────────────────────
  // Two resources share a context run: moving the start makes `git apply` patch the OTHER resource (review probe).
  const MOD = [
    '## Diff', '```diff', '--- a/main.tf', '+++ b/main.tf', '@@ -2,3 +2,3 @@',
    '   acl           = "private"', '-  force_destroy = false', '+  force_destroy = true', '   tags          = {}', '+  versioning    = true', '```', '',
    'Confidence: 82 — the second bucket shares this context run.',
  ].join('\n');
  await test('B-M3 control: a MODIFICATION-hunk undercount is in scope (every hit an undercount)', () => {
    const { allHitsAreUndercounts } = require('../lib/agents/harness/package-form-check');
    ok(allHitsAreUndercounts(analyzePackageForm(MOD)) === true, 'the control fixture is not a pure undercount');
  });
  await test('B-M3: the counts-only recount (`-2,3 +2,4`) is ADOPTED', () => {
    const r = checkFormCorrectionAdoption({ original: MOD, corrected: MOD.replace('@@ -2,3 +2,3 @@', '@@ -2,3 +2,4 @@'), stopReason: 'end_turn' });
    ok(r.adopted, JSON.stringify(r));
  });
  await test('B-M3: a recount that also MOVES the start (to the second resource, or either side) → REJECTED (header-start-changed)', () => {
    for (const h of ['@@ -11,3 +11,4 @@', '@@ -2,3 +11,4 @@', '@@ -11,3 +2,4 @@']) {
      const r = checkFormCorrectionAdoption({ original: MOD, corrected: MOD.replace('@@ -2,3 +2,3 @@', h), stopReason: 'end_turn' });
      ok(!r.adopted && r.notAdoptedReason === 'header-start-changed', `${h}: ${JSON.stringify(r)}`);
    }
  });

  // ── B-M5: an adopted correction stamps the lines it changed ────────────────────────────────────────────
  await test('B-M5: edits = [{line, before, after}] for the header only; the original is reconstructible from the persisted text', () => {
    const e = correctionEdits(F2, F2_FIXED);
    ok(e.editsTotal === 1 && e.edits!.length === 1 && e.edits![0].before === '@@ -0,0 +1,33 @@' && e.edits![0].after === '@@ -0,0 +1,36 @@', JSON.stringify(e));
    const lines = F2_FIXED.split('\n');
    for (const x of e.edits!) lines[x.line - 1] = x.before;
    ok(lines.join('\n') === F2, 'original not reconstructible from edits');
    ok(correctionEdits(F2, F2 + '\nextra').editsUnaligned === true, 'line-count change not flagged');
  });
  await test('B-M5: the live turn stamps edits (and cache tokens, B-L3) on adoption only', async () => {
    const r = await runFormCorrection(input(F2), { generateText: scripted([resp(F2_FIXED, { usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 7000, cacheCreationTokens: 300 } })]).generateText, logger: silent });
    ok(r.correction.adopted && r.correction.editsTotal === 1 && r.correction.cacheReadTokens === 7000 && r.correction.cacheCreationTokens === 300, JSON.stringify(r.correction));
    const n = await runFormCorrection(input(F2), { generateText: scripted([resp(F2)]).generateText, logger: silent });
    ok(!n.correction.adopted && n.correction.edits === undefined, 'edits stamped on a rejection');
  });
  await test('B-L2: describeNotAdopted renders a neutral guard phrase for every reason', () => {
    ok(describeNotAdopted('content-not-from-named-source') === 'guard: content outside named lines', describeNotAdopted('content-not-from-named-source'));
    ok(describeNotAdopted(undefined) === 'guard: no reason given', 'undefined');
  });

  // ── The turn ─────────────────────────────────────────────────────────────────────────────────────
  await test('fires ONCE: one generateText in reflection mode, history +2, tokens folded, corrected text adopted', async () => {
    const llm = scripted([resp(F2_FIXED)]);
    const inp = input(F2);
    const r = await runFormCorrection(inp, { generateText: llm.generateText, logger: silent });
    ok(llm.calls.length === 1, `calls ${llm.calls.length}`);
    ok(llm.calls[0].functionCall === 'none' && Array.isArray(llm.calls[0].functions) && llm.calls[0].functions.length === 0, 'reflection mode: no tools');
    ok(inp.messageHistory.length === 3, `history ${inp.messageHistory.length}`);
    ok(inp.totalUsage.inputTokens === 1100 && inp.totalUsage.outputTokens === 550, 'tokens folded');
    ok(r.correction.attempted && r.correction.adopted && r.text === F2_FIXED, JSON.stringify(r.correction));
  });
  for (const [name, reply, reason] of [
    ['only the fixed section', resp('```diff\n@@ -0,0 +1,1 @@\n+a\n```'), 'block-changed'],
    ['a new CIDR', resp(F2_FIXED + '\n10.10.10.0/24'), 'prose-changed'],
    ['header still wrong', resp(F2), 'trigger-hits-remain'],
    ['max_tokens', resp(F2_FIXED, { stopReason: 'max_tokens' }), 'not-end-turn'],
    ['a throw', new Error('boom'), 'llm-error'],
  ] as Array<[string, any, string]>) {
    await test(`rejects ${name} → ${reason}, and keeps the original BY REFERENCE`, async () => {
      const inp = input(F2);
      const r = await runFormCorrection(inp, { generateText: scripted([reply]).generateText, logger: silent });
      ok(r.correction.attempted && r.correction.adopted === false && r.correction.notAdoptedReason === reason, JSON.stringify(r.correction));
      ok(r.text === inp.text && r.currentResponse === inp.currentResponse, 'original not kept by reference');
    });
  }
  await test('flag OFF (default): zero LLM calls, text/response/history untouched, notAttemptedReason flag-off', async () => {
    const llm = scripted([resp(F2_FIXED)]);
    const inp = input(F2, { force: false });
    const r = await runFormCorrection(inp, { generateText: llm.generateText, logger: silent, env: {} });
    ok(llm.calls.length === 0 && inp.messageHistory.length === 1, 'no call, no history growth');
    ok(r.text === inp.text && r.currentResponse === inp.currentResponse && r.correction.notAttemptedReason === 'flag-off', JSON.stringify(r.correction));
  });
  await test('no trigger hit: zero LLM calls even when forced', async () => {
    const llm = scripted([resp('x')]);
    const r = await runFormCorrection(input(F2_FIXED), { generateText: llm.generateText, logger: silent });
    ok(llm.calls.length === 0 && r.correction.notAttemptedReason === 'no-trigger-hit', JSON.stringify(r.correction));
  });
  await test('flag parsing: default OFF; only the literal "true" enables', () => {
    ok(!isFormCorrectionEnabled({}) && !isFormCorrectionEnabled({ FORM_CORRECTION_ENABLED: '1' }) && isFormCorrectionEnabled({ FORM_CORRECTION_ENABLED: 'true' }), 'flag');
  });

  // ── Step B: the turn's scope guard and observers ───────────────────────────────────────────────────
  await test('undercountOnly: a non-undercount trigger (F1, #21) → NOT attempted, zero LLM calls, history untouched', async () => {
    const llm = scripted([resp(F1_FIXED)]);
    const inp = input(F1, { force: false, undercountOnly: true });
    const r = await runFormCorrection(inp, { generateText: llm.generateText, logger: silent, env: { FORM_CORRECTION_ENABLED: 'true' } });
    ok(llm.calls.length === 0 && inp.messageHistory.length === 1, 'attempted out of scope');
    ok(r.correction.notAttemptedReason === 'hits-include-non-undercount' && r.text === inp.text, JSON.stringify(r.correction));
  });
  await test('undercountOnly: a pure undercount (F2) with the flag on → attempted and adopted; postTriggerHitsTotal 0', async () => {
    const r = await runFormCorrection(input(F2, { force: false, undercountOnly: true }),
      { generateText: scripted([resp(F2_FIXED)]).generateText, logger: silent, env: { FORM_CORRECTION_ENABLED: 'true' } });
    ok(r.correction.adopted === true && r.correction.postTriggerHitsTotal === 0 && r.text === F2_FIXED, JSON.stringify(r.correction));
  });
  await test('observers: start → complete({adopted, reason, text}); text is the correction only when adopted; a THROWING observer is absorbed', async () => {
    const ev: string[] = [];
    await runFormCorrection(input(F2), { generateText: scripted([resp(F2)]).generateText, logger: silent }, {
      onFormCorrectionStart: (n) => { ev.push(`start:${n}`); },
      onFormCorrectionComplete: (c) => { ev.push(`done:${c.adopted}:${c.notAdoptedReason}:${c.text.length}`); },
    });
    ok(ev.join('|') === 'start:1|done:false:trigger-hits-remain:0', ev.join('|'));
    const r = await runFormCorrection(input(F2), { generateText: scripted([resp(F2_FIXED)]).generateText, logger: silent }, {
      onFormCorrectionStart: () => { throw new Error('client gone'); },
      onFormCorrectionComplete: () => { throw new Error('client gone'); },
    });
    ok(r.correction.adopted === true && r.text === F2_FIXED, 'a throwing observer changed the outcome');
  });

  // ── Step B wiring contract in the core (source pins) ─────────────────────────────────────────────
  const core = fs.readFileSync(path.join(__dirname, '..', 'lib', 'services', 'execution-core.ts'), 'utf8');
  await test('Step B: exactly ONE runFormCorrection call in the core, scoped undercountOnly:true, gated on the decision; NONE in either adapter', () => {
    ok((core.match(/runFormCorrection\(/g) || []).length === 1, 'expected exactly one runFormCorrection( call in the core');
    const call = core.slice(core.indexOf('runFormCorrection({'), core.indexOf('runFormCorrection({') + 400);
    ok(/undercountOnly:\s*true/.test(call), 'the core does not pass undercountOnly: true');
    ok(/if \(formCheck && formCheck\.correction\.attempted\)/.test(core), 'the call is not gated on the fact\'s decision');
    const engine = fs.readFileSync(path.join(__dirname, '..', 'lib', 'services', 'agentExecutionEngine.ts'), 'utf8');
    const stream = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'pov', 'agent', 'execute', 'stream', 'route.ts'), 'utf8');
    ok(!/runFormCorrection\(/.test(engine) && !/runFormCorrection\(/.test(stream), 'an adapter calls the turn itself');
    ok(/runExecutionCore\(/.test(engine) && /runExecutionCore\(/.test(stream), 'an adapter no longer delegates to the core');
  });
  await test('Step B: the flag is read ONCE via isFormCorrectionEnabled and passed as correctionEnabled; eligibility stays the EXACT-role helper', () => {
    ok(/const formCorrectionEnabled = isFormCorrectionEnabled\(\);/.test(core), 'flag not read via the helper');
    ok(/correctionEnabled:\s*formCorrectionEnabled/.test(core), 'correctionEnabled not threaded from the flag');
    ok(!/correctionEnabled:\s*true/.test(core), 'a hardcoded correctionEnabled: true');
    ok(/isFormCheckEligible\(agentRole, task\.type\)/.test(core), 'eligibility helper not used');
    ok(!/\/author\/i/.test(core), 'a role regex crept into the core');
  });
  await test('Step B: the deliverable is reassigned ONLY inside the adopted branch', () => {
    // End bound = the next sibling block (2026-10-09, 2b: the requirements correction sits between this block and
    // onStoringResults; it carries its own adopted-branch pin in test-requirements-form-correction.ts).
    const endB = core.indexOf('// REQUIREMENTS FORM CHECK + CORRECTION');
    const blockB = core.slice(core.indexOf('// FORM CORRECTION (Step B'), endB > 0 ? endB : core.indexOf('await observers.onStoringResults'));
    const adopted = blockB.slice(blockB.indexOf('if (_fc.correction.adopted) {'), blockB.indexOf('} else {', blockB.indexOf('if (_fc.correction.adopted) {')));
    ok(blockB.length > 500 && adopted.length > 50, `slices: ${blockB.length} / ${adopted.length}`);
    const outside = blockB.replace(adopted, '');
    for (const v of ['finalResponse', 'currentResponse'])
      ok(!new RegExp(`\\b${v}\\s*=(?!=)`).test(outside.replace(/\/\/.*$/gm, '')), `${v} assigned outside the adopted branch`);
    ok(/finalResponse = _fc\.text;/.test(adopted) && /currentResponse = _fc\.currentResponse;/.test(adopted), 'adopted branch does not take the correction');
  });
  await test('Step B: order — content guard → fact → correction → onStoringResults → #90 (with formCorrectionAttempted)', () => {
    const g = core.indexOf('Agent execution produced no content');
    const f = core.indexOf('computeFormCheckFact({\n        text: finalResponse');
    const c = core.indexOf('runFormCorrection({');
    const st = core.indexOf('await observers.onStoringResults');
    const d = core.indexOf('runDiagnosticRetry({');
    ok(g > 0 && g < f && f < c && c < st && st < d, `order ${[g, f, c, st, d].join(' < ')}`);
    ok(/correctionTurnUsed, formCorrectionAttempted,/.test(core.slice(d, d + 200)), '#90 not given formCorrectionAttempted');
    // INFO-3 (Step B review): the pass is spent by the turn's OWN outcome, never set before the call.
    ok(/formCorrectionAttempted = _fc\.correction\.attempted === true;/.test(core) && !/formCorrectionAttempted = true;/.test(core), 'formCorrectionAttempted not taken from the turn outcome');
  });
  await test('F6: the form-check FACT block and the #90 recount are side-effect-free — no await, no assignment to the deliverable state', () => {
    const blockA = core.slice(core.indexOf('// PACKAGE FORM CHECK'), core.indexOf('// FORM CORRECTION (Step B'));
    const blockB = core.slice(core.indexOf('if (formCheck && diagnosticRetryUsed)'), core.indexOf('// Token usage'));
    ok(blockA.length > 200 && blockB.length > 50, `slices found: ${blockA.length} / ${blockB.length}`);
    for (const [name, src] of [['form-check block', blockA], ['#90 recount', blockB]] as Array<[string, string]>) {
      ok(!/\bawait\b/.test(src.replace(/\/\/.*$/gm, '')), `${name} contains an await`);
      for (const v of ['finalResponse', 'currentResponse', 'messageHistory', 'totalUsage', 'confidenceScore'])
        ok(!new RegExp(`\\b${v}\\s*(?:=(?!=)|\\+=|\\.push\\(|\\.splice\\()`).test(src), `${name} assigns or mutates ${v}`);
    }
  });
  await test('the form fact is computed BEFORE onStoringResults and BEFORE #90 (plan §3)', () => {
    const f = core.indexOf('computeFormCheckFact({\n        text: finalResponse');
    ok(f > 0 && f < core.indexOf('observers.onStoringResults') && f < core.indexOf('runDiagnosticRetry({'), 'order');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
