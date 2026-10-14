/**
 * test-reviewer-warnings — WG series for `computeReviewerWarnings` (grammar G1) and its nesting in
 * `buildExecutionResultJson` (WARNINGS-INVISIBLE, 2026-10-08; design cline_docs/reviews/warnings-invisible-2026-10-08/).
 *
 * Pure: no DB. Mutation-proven position rule: see WG-POS (delete the `body = src.slice(0, terminal.index)`
 * slice and WG-POS + WG-DISJOINT go red).
 */
import { computeReviewerWarnings, MAX_WARNINGS, MAX_WARNING_TEXT_CHARS } from '@/lib/agents/harness/reviewer-warnings';
import { parseReviewerVerdict, locateTerminalVerdict } from '@/lib/agents/harness/parse-verdict';

let passed = 0;
let failed = 0;
function t(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed++; console.log(`  ❌ ${name}\n     ${(e as Error).message}`); }
}
function eq(a: unknown, b: unknown, msg = '') {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${msg} expected ${B} got ${A}`);
}

const V_OK = '\n\n## VERDICT: APPROVED\nConfidence: 90\nBlocking issues: none\n';
const V_NR = (items: string[]) => `\n\n## VERDICT: NEEDS-REVISION\nConfidence: 60\nBlocking issues:\n${items.map(i => `- ${i}`).join('\n')}\n`;

// The 2026-10-06 network reviewer (cmuw8yrjn002hyx9d9gx6xryd) that correctly DECLINED to raise one — verbatim.
const QUOTE_CASE = 'Package suppresses 6 host routes. V7/V8 (RIB next-hop check) + V9 (ping) jointly prove every destination the harvest shows as exporter-marked remains reachable post-change, across both directions. Coverage is complete relative to the harvest\'s scope. **Result: no warning triggered** — the package\'s own treatment is adequate, no `NON-BLOCKING WARNING (reachability-after-suppression):` line is warranted.';

console.log('\n🧪 reviewer-warnings (G1)\n');

t('WG-PLAIN: plain label above the marker is transcribed', () => {
  const r = computeReviewerWarnings('Review body.\nNON-BLOCKING WARNING (reachability-after-suppression): no step proves 10.0.0.1 stays reachable.' + V_OK);
  eq(r.warnings, [{ id: 'reachability-after-suppression', text: 'no step proves 10.0.0.1 stays reachable.' }]);
  eq(r.untranscribedLabelLines, 0);
});

t('WG-SHAPES: list markers, numbered, heading and emphasis forms are transcribed', () => {
  const lines = [
    '- NON-BLOCKING WARNING (a): one',
    '* NON-BLOCKING WARNING (b): two',
    '+ NON-BLOCKING WARNING (c): three',
    '1. NON-BLOCKING WARNING (d): four',
    '2) NON-BLOCKING WARNING (e): five',
    '**NON-BLOCKING WARNING (f):** six',
    '**NON-BLOCKING WARNING (g)**: seven',
    '### NON-BLOCKING WARNING (h): eight',
    '- **NON-BLOCKING WARNING (i): nine**',
  ];
  const r = computeReviewerWarnings(lines.join('\n') + V_OK);
  eq(r.warnings.map(w => `${w.id}=${w.text}`), ['a=one', 'b=two', 'c=three', 'd=four', 'e=five', 'f=six', 'g=seven', 'h=eight', 'i=nine']);
});

t('WG-BACKTICK: a backtick-wrapped label is transcribed, and inline code in its text survives (batch-2 lab D4)', () => {
  const lines = [
    '`NON-BLOCKING WARNING (a):` one',
    '`NON-BLOCKING WARNING (b)`: two',
    '- `NON-BLOCKING WARNING (c): three`',
    '`NON-BLOCKING WARNING (d):` the package repeats `x` in prose',
    '**NON-BLOCKING WARNING (e):** keeps **bold**',
    '`NON-BLOCKING WARNING (f):` ends with `x`',
  ];
  const r = computeReviewerWarnings(lines.join('\n') + V_OK);
  eq(r.warnings.map(w => `${w.id}=${w.text}`),
    ['a=one', 'b=two', 'c=three', 'd=the package repeats `x` in prose', 'e=keeps **bold**', 'f=ends with `x`']);
  eq(r.untranscribedLabelLines, 0);
});

t('WG-HEADING-ONLY: a heading label with its text on the next line is NOT transcribed and is counted', () => {
  const r = computeReviewerWarnings('### NON-BLOCKING WARNING (restated-conclusion):\nThe package repeats a conclusion.' + V_OK);
  eq(r.warnings, []);
  eq(r.untranscribedLabelLines, 1);
});

t('WG-QUOTE: the verbatim 2026-10-06 quote case transcribes NOTHING and counts 1 untranscribed', () => {
  const r = computeReviewerWarnings(QUOTE_CASE + V_OK);
  eq(r.warnings, []);
  eq(r.untranscribedLabelLines, 1);
});

t('WG-NEG: table cell, blockquote, fenced, lower case and empty text are rejected', () => {
  const body = [
    '| check | NON-BLOCKING (unavailable) |',
    '> NON-BLOCKING WARNING (q): quoted',
    '```',
    'NON-BLOCKING WARNING (f): in a fence',
    '```',
    'non-blocking warning (lc): lower case',
    'NON-BLOCKING WARNING (e):   ',
  ].join('\n');
  const r = computeReviewerWarnings(body + V_OK);
  eq(r.warnings, []);
});

t('WG-POS: a label AFTER the terminal marker is never a warning', () => {
  const r = computeReviewerWarnings('body' + V_OK + 'NON-BLOCKING WARNING (late): after the block\n');
  eq(r.warnings, []);
  eq(r.untranscribedLabelLines, 1);
});

t('WG-DISJOINT: a label under the terminal Blocking issues stays blocking and is not a warning', () => {
  const text = 'body' + V_NR(['NON-BLOCKING WARNING (x): mis-placed']);
  const v = parseReviewerVerdict(text)!;
  const r = computeReviewerWarnings(text);
  eq(v.blocking, ['NON-BLOCKING WARNING (x): mis-placed']);
  eq(r.warnings, []);
  const inter = r.warnings.filter(w => v.blocking.some(b => b.includes(w.text)));
  eq(inter, []);
});

t('WG-BODYBLOCK: a label under a BODY "Blocking issues I still hold" heading IS a warning', () => {
  const r = computeReviewerWarnings('### Blocking issues I still hold\n- NON-BLOCKING WARNING (k): noted\n' + V_OK);
  eq(r.warnings, [{ id: 'k', text: 'noted' }]);
});

t('WG-ONELINE: a multi-line warning keeps only its first line', () => {
  const r = computeReviewerWarnings('NON-BLOCKING WARNING (m): first line\ncontinued here\n' + V_OK);
  eq(r.warnings, [{ id: 'm', text: 'first line' }]);
});

t('WG-DUP: duplicates are kept', () => {
  const r = computeReviewerWarnings('NON-BLOCKING WARNING (d): x\nNON-BLOCKING WARNING (d): x\n' + V_OK);
  eq(r.warnings.length, 2);
});

t('WG-ID: an id is transcribed verbatim (case, spaces), never rewritten', () => {
  const r = computeReviewerWarnings('NON-BLOCKING WARNING (Some Odd_ID 7): x\n' + V_OK);
  eq(r.warnings[0].id, 'Some Odd_ID 7');
});

t('WG-BOUND-TEXT: text over the cap is truncated and flagged', () => {
  const long = 'y'.repeat(MAX_WARNING_TEXT_CHARS + 50);
  const r = computeReviewerWarnings(`NON-BLOCKING WARNING (b): ${long}\n` + V_OK);
  eq(r.warnings[0].text.length, MAX_WARNING_TEXT_CHARS);
  eq(r.warnings[0].truncated, true);
});

t('WG-BOUND-COUNT: past MAX_WARNINGS the rest are counted in overflowCount, not untranscribed', () => {
  const lines = Array.from({ length: MAX_WARNINGS + 3 }, (_, i) => `NON-BLOCKING WARNING (n${i}): w${i}`);
  const r = computeReviewerWarnings(lines.join('\n') + V_OK);
  eq(r.warnings.length, MAX_WARNINGS);
  eq(r.overflowCount, 3);
  eq(r.untranscribedLabelLines, 0);
});

t('WG-NOMARKER: no terminal block ⇒ nothing transcribed', () => {
  const r = computeReviewerWarnings('NON-BLOCKING WARNING (a): x\nno verdict here');
  eq(r.warnings, []);
});

t('WG-LOCATE: locateTerminalVerdict agrees with parseReviewerVerdict on raw', () => {
  for (const text of ['a' + V_OK, 'b' + V_NR(['x']), '## VERDICT: APPROVED\n## ## VERDICT: NEEDS-REVISION\nBlocking issues: none']) {
    const loc = locateTerminalVerdict(text)!;
    const v = parseReviewerVerdict(text)!;
    eq(text.slice(loc.index).trim(), v.raw);
  }
});

t('WG-NEVERGATE: a warning line never changes approved or blocking[]', () => {
  const base = 'body' + V_OK;
  const withW = 'body\nNON-BLOCKING WARNING (r): z' + V_OK;
  eq(parseReviewerVerdict(withW)!.approved, parseReviewerVerdict(base)!.approved);
  eq(parseReviewerVerdict(withW)!.blocking, parseReviewerVerdict(base)!.blocking);
  const nrBase = 'body' + V_NR(['real defect']);
  const nrW = 'body\nNON-BLOCKING WARNING (r): z' + V_NR(['real defect']);
  eq(parseReviewerVerdict(nrW)!.approved, parseReviewerVerdict(nrBase)!.approved);
  eq(parseReviewerVerdict(nrW)!.blocking, parseReviewerVerdict(nrBase)!.blocking);
});

console.log('\n' + '─'.repeat(50));
console.log(`✅ Passed: ${passed}`);
if (failed) { console.log(`❌ Failed: ${failed}`); process.exit(1); }
console.log('✅ All reviewer-warnings tests passed!');
