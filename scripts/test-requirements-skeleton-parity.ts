/**
 * Parity pin for the vendored requirements skeleton (2026-09-21).
 *
 * `scripts/seed-data/requirements-skeleton.tmpl` is GENERATED from a template that lives in
 * ANOTHER REPO (`paichart/paichart`, `program-artifacts/_TEMPLATE/requirements.template.md`) and is
 * baked verbatim into `requirements-authoring-protocol`. That makes it a cross-repo pair — the D7
 * drift class the protocol obligation audit already tracks — with the extra property that the copy
 * is what an agent actually reads.
 *
 * TWO CHECKS, and the split is deliberate:
 *   1. INVARIANTS — always run, no other repo needed. Catches corruption, truncation and a
 *      half-written regeneration.
 *   2. UPSTREAM PARITY — regenerates from the source template and diffs. Needs ~/paichart (or
 *      PAICHART_PUBLIC_REPO). When absent it SKIPS BY NAME and says so.
 *
 * ⚠️ A skip is REPORTED, never silent. The 2026-08-08 grep audit dropped 27 greps (~30% of the
 * corpus) while still printing that every documented expectation held; silence was the root cause,
 * the regex was only its instance. If you extend this file, keep the skip nameable.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
import * as os from 'os';

const VENDORED = join(__dirname, 'seed-data', 'requirements-skeleton.tmpl');
const REPO = process.env.PAICHART_PUBLIC_REPO || join(os.homedir(), 'paichart');
const TOOL = join(REPO, 'scripts', 'requirements-rules.py');

let failed = 0, skipped: string[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const text = readFileSync(VENDORED, 'utf8');

// 1. INVARIANTS — the properties the protocol body depends on
check('skeleton is non-empty and substantial', text.length > 15000, `${text.length} chars`);
// 18 since 2026-09-28 (decision surfacing Phase 1: + ### Every leg, + ### A leg that grants or removes access,
// + ## Decisions needed from the owner). Was 15 since 2026-09-26 (GS-R5: + Design decisions, + Open questions).
// A deliberate SHAPE pin — it guards against a truncated skeleton; CI has no ~/paichart to derive it from, so a
// template heading change updates it here.
check('carries all 18 template headings',
  (text.match(/^#{1,4} /gm) || []).length === 18, `${(text.match(/^#{1,4} /gm) || []).length}`);
// A FLOOR, not a count (115 on 2026-09-28; was 78 under a floor of 70) — the same ~90% slack, so healthy edits
// that add slots never rot it, and a truncation that loses the decision inventory's rows (37 of them) still fails.
check('carries the placeholder set', (text.match(/\{\{/g) || []).length >= 105,
  `${(text.match(/\{\{/g) || []).length}`);
// The decision inventory's QUESTION KEYS are literals other surfaces key on: the requirements_reviewer guidance names
// the closed forced-eligible list (target-absent, inputs-empty) literally, and counts every key per leg. A key renamed
// or dropped here makes that count look for a row the Author was never offered — silently. Pin the Author-visible side.
const DECISION_KEYS = ['target', 'population', 'representation', 'inputs-empty', 'receiver', 'admitted-principal', 'principal-unseen', 'granted-action',
  'existing-grant', 'target-empty', 'enforcer-absent', 'target-absent', 'collateral'];
const missingKeys = DECISION_KEYS.filter(k => !new RegExp('^\\| \\{\\{(?:LEG|PRODUCER)_TOKEN\\}\\}\\.' + k + ' \\|', 'm').test(text));
check('carries every decision-inventory question key as a table row', missingKeys.length === 0,
  `missing: ${missingKeys.join(', ')}`);
check('carries the approver and gate-position rows',
  /^\| approver\.\{\{GATE\}\} \|/m.test(text) && /^\| gate\.\{\{GATE\}\}\.position \|/m.test(text));
// Section ORDER the protocol depends on: the owner block sits IMMEDIATELY after Design decisions (2026-09-29, T1-zero: a draft
// that hit its output ceiling lost its last sections, and the owner block used to be one of them), and the
// writing rules stay LAST (1.1.0, R3: a truncated Architect read must lose the rules, never the requirements).
const tops = (text.match(/^## .*$/gm) || []).map(h => h.replace(/^## /, ''));
const at = (p: string) => tops.findIndex(h => h.startsWith(p));
check('section order: Design decisions, then IMMEDIATELY Decisions needed from the owner, … < Open questions < Writing rules (LAST)',
  at('Design decisions') >= 0 && at('Decisions needed from the owner') === at('Design decisions') + 1
    && at('Decisions needed from the owner') < at('Open questions')
    && at('Open questions') < at('Writing rules') && at('Writing rules') === tops.length - 1,
  tops.join(' | '));
check('carries the WRITING-RULES marker the Author must leave in place',
  text.includes('<!-- WRITING-RULES -->'));
// The template's OWN acceptance check, applied to what we ship:
check("NO author-addressed blocks survive (template's own rule: grep -c '^> \\*\\*🗑' === 0)",
  (text.match(/^> \*\*🗑/gm) || []).length === 0);
// GENERIC placeholders are instructions ABOUT placeholders, never content. The template's own
// standard is that "the authoritative list is the placeholders" — and an unnamed token cannot be on
// an authoritative list. Both live defects this pin has caught were exactly this shape:
//   {{…}}          2026-09-21 — three unnamed cells in a gate row, also NFKC-unstable
//   {{PLACEHOLDER}} 2026-09-21 (F-V3-2) — in the template's author-addressed front matter, which was
//                   not in the strip register, so it reached a customer-facing generated document
//                   whose opening line told its reader to "replace every {{PLACEHOLDER}}".
check('no GENERIC placeholder tokens (every placeholder is named)',
  !/\{\{\s*(PLACEHOLDER|\.\.\.|…)\s*\}\}/.test(text),
  'a generic token is an instruction about placeholders, not a fillable slot');
// The strip register catches author-addressed BLOCKS; this catches the file's own FRONT MATTER,
// which is author-addressed but sits outside any block and so was invisible to that rule.
check('no front matter — nothing between the H1 and the first ## heading but document content',
  !/^#\s[^\n]*\n+>/m.test(text),
  'a blockquote immediately after the H1 is template front matter, addressed to the filler');
// R9 would rewrite these silently while stamping sanitized:false — the protocol path avoids R9,
// but a skeleton that is NFKC-stable cannot be corrupted by ANY future channel either.
check('is NFKC-stable (no codepoint a sanitizer would silently rewrite)',
  text.normalize('NFKC') === text,
  'NFKC changes this text — a sanitized channel would alter it and report sanitized:false');

// 2b. THE MARKER PAIR — a three-way pin across surfaces that are deliberately WORDED differently.
//
// The writing-rules marker is stated on THREE surfaces by design (the duplication ruling, 2026-09-22
// Pair C: "the one legitimate x2 — each copy sits where its reader meets the temptation"). Because
// they are meant to differ in wording, no text comparison can guard them. What MUST NOT drift is the
// LITERAL: the Author emits it, the skeleton reserves the slot for it, and `requirements-rules.py
// --insert` searches for it. If any one is renamed the others fail SILENTLY — the Author emits a
// marker the splice tool cannot find, and the document ships structurally incomplete looking fine.
const MARKER = '<!-- WRITING-RULES -->';
const readIf = (p: string) => existsSync(p) ? readFileSync(p, 'utf8') : null;
const protoSrc = readIf(join(__dirname, 'seed-protocol-prompts.ts'));
const roleSrc  = readIf(join(__dirname, '..', 'lib', 'services', 'agentTemplateBuilder',
                             'pAIchartUniversalTemplate.ts'));
const toolSrc  = readIf(TOOL);

check('marker pair: the PROTOCOL states the exact marker literal',
  !!protoSrc && protoSrc.includes(MARKER));
check('marker pair: ROLE GUIDANCE states the exact marker literal',
  !!roleSrc && roleSrc.includes(MARKER));
if (toolSrc === null) {
  skipped.push(`marker pair: splice-tool literal — ${TOOL} not present (set PAICHART_PUBLIC_REPO)`);
} else {
  check('marker pair: the SPLICE TOOL searches for the same literal', toolSrc.includes(MARKER),
    'the Author would emit a marker --insert cannot find, and the document ships incomplete');
}
// No AGENT-FACING surface may claim an AGENT runs the splice. The Reviewer holds no tool grant by
// design and the Author is mid-run; the splice is a human step at publish time.
//
// SCOPED TO THE AUDIENCE, NOT THE FILE (2026-09-23). seed-protocol-prompts.ts holds TWO audiences:
// protocol bodies injected into agent prompts, and `tags: ['mcp']` rows, which are /prompt registry
// entries read by OPERATORS. Telling an operator to run the splice is the CORRECT instruction and
// the only place it is documented — a whole-file scan forbade it, standing between a human and the
// procedure they need.
//
// A prompt's BODY is a separate `const X = ` template literal; the seed ENTRY carries only metadata
// plus `promptText: X`. So the exclusion must find which CONSTS the mcp-tagged entries reference and
// blank THOSE, not filter entries. An earlier attempt filtered entries, silently scanned metadata
// only, and could no longer fail — caught by mutation-testing BOTH directions instead of assuming.
function operatorFacingConsts(seed: string): string[] {
  const out: string[] = [];
  for (const entry of seed.match(/\n  \{\n(?:.|\n)*?\n  \},/g) || []) {
    if (!/tags:\s*\[[^\]]*'mcp'/.test(entry)) continue;
    const m = entry.match(/promptText:\s*([A-Z_][A-Z0-9_]*)/);
    if (m) out.push(m[1]);
  }
  return out;
}
function blankOperatorBodies(seed: string, names: string[]): string {
  let s2 = seed;
  for (const n of names) {
    s2 = s2.replace(new RegExp('const ' + n + '[\\s\\S]*?`;'), 'const ' + n + ' = OPERATOR_EXCLUDED;');
  }
  return s2;
}
const OPERATOR_CONSTS = protoSrc ? operatorFacingConsts(protoSrc) : [];
const AGENT_SURFACES: ReadonlyArray<readonly [string, string | null]> = [
  ['protocol bodies (operator /prompt bodies excluded)',
   protoSrc ? blankOperatorBodies(protoSrc, OPERATOR_CONSTS) : null],
  ['role guidance', roleSrc],
];
for (const [name, src] of AGENT_SURFACES) {
  if (!src) continue;
  check('marker pair: ' + name + ' does not tell an agent to run the splice itself',
    // [^\n], NOT [^.] — the tool is named `requirements-rules.py`, and the dot ended the original
    // class before it reached `--insert`. A check that cannot fail reads as a guard in review.
    !/you\s+(?:must\s+|should\s+|will\s+)?run\s+[^\n]{0,60}--insert/i.test(src),
    'the splice is a human publish-time step; the Reviewer has no tool grant and the Author is mid-run');
}
// The exclusion must remove real TEXT, or the scoping is a no-op dressed as a fix.
if (protoSrc) {
  const removed = protoSrc.length - blankOperatorBodies(protoSrc, OPERATOR_CONSTS).length;
  check('marker pair: the operator-body exclusion is live (removes real text)',
    OPERATOR_CONSTS.length > 0 && removed > 5000,
    OPERATOR_CONSTS.length + ' operator consts, ' + removed + ' chars removed');
}

// 2c. THE CANONICAL WRITING RULES — the OTHER half of every produced document, and it was
// unchecked until 2026-09-22. The skeleton carries the `<!-- WRITING-RULES -->` MARKER, not the
// rules; `requirements-rules.py --insert` splices the rules in from a SEPARATE file at publish
// time. So every invariant asserted above about the skeleton said nothing about ~226 lines — the
// bulk of the finished document.
//
// The 2026-09-21 NFKC sweep cleaned `requirements.template.md` and missed its sibling: 4 × U+2026
// survived in `writing-rules.md` and reached the first published document through the splice.
// Found by NFKC-checking a produced file, which nothing did either. Same shape as the defects this
// file already records — the sweep was scoped to the surface in hand, not to what the property is.
const RULES = join(REPO, 'program-artifacts', '_TEMPLATE', 'writing-rules.md');
const rulesSrc = readIf(RULES);
if (rulesSrc === null) {
  skipped.push(`canonical writing rules — ${RULES} not present (set PAICHART_PUBLIC_REPO)`);
} else {
  check('canonical writing rules are NFKC-stable (they are spliced into every produced document)',
    rulesSrc.normalize('NFKC') === rulesSrc,
    'a sanitized channel would rewrite the rules and report sanitized:false');
  check('canonical writing rules still carry the marker heading the splice tool bounds on',
    rulesSrc.includes('#'), 'the canonical file is empty or truncated');
}

// 2. UPSTREAM PARITY
if (!existsSync(TOOL)) {
  skipped.push(`upstream parity — ${TOOL} not present (set PAICHART_PUBLIC_REPO)`);
} else {
  const fresh = execFileSync('python3', [TOOL, '--skeleton'], { encoding: 'utf8' }).trimEnd();
  const ok = fresh === text.trimEnd();
  check('vendored skeleton is byte-identical to a fresh --skeleton emit', ok,
    ok ? '' : `regenerate: python3 ${TOOL} --skeleton > ${VENDORED}`);
}

if (skipped.length) {
  console.log(`\nℹ️  ${skipped.length} check(s) SKIPPED, named:`);
  skipped.forEach(s => console.log(`   • ${s}`));
}
console.log(failed ? `\n❌ ${failed} failure(s)` : '\n✅ requirements skeleton parity OK');
process.exit(failed ? 1 : 0);
