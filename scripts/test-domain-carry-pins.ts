#!/usr/bin/env ts-node
/**
 * test-domain-carry-pins — pins for the post-promotion text batch (2026-10-06).
 * Record: cline_docs/reviews/post-promotion-text-batch-2026-10-06/BUILD-REPORT.md
 *
 * Asserts on the RENDERED protocol text (what agents receive), each sentence scoped to the bullet that must carry it:
 *
 *  K8S-DRIFT-CARRY (kubernetes-gitops): the Phase 2 Author carries the Architect's drift decision, including the
 *    no-baseline "not-performed" form. Without it the Phase 3 Reviewer, which reads only the package, blocks on a
 *    disposition the Author was never told to carry (control 2, 2026-10-05).
 *
 *  NET-REACHABILITY (network-provisioning): the Phase 2 Author is told to prove reachability after route suppression
 *    for each destination its own change could make unreachable (as far as the harvest shows). The Phase 3 Reviewer
 *    records a MISSING step as a line labelled `NON-BLOCKING WARNING (reachability-after-suppression):` ABOVE the
 *    terminal VERDICT block (parse-verdict.ts reads every bullet under `Blocking issues:` as blocking); a PRESENT step's
 *    form defects get the same warning and block only for a stated harm (satisfiability, or the package's own evidence
 *    of lost reachability). SYNTHESIZE carries every warning line verbatim into the header without changing status.
 *    Exclusivity is pinned: every "reachab" or "route suppression" mention in the Reviewer bullet lies inside the warning
 *    sentences, so a second (blocking) rule elsewhere in the bullet goes red. Owner rule (Steve, 2026-10-05): new
 *    checks warn by default; partial exemption decided 2026-10-06. Making it blocking is an owner decision and must
 *    change this pin deliberately. Fold record: REVIEW-pipeline-harness.md + REVIEW-architectural-review.md.
 *
 *  LAYERING: the value leg (network-derivation) changes no device, so it carries neither network sentence.
 *
 *  TEXT BATCH gap2-clause-f (2026-10-07; record cline_docs/reviews/text-batch-gap2-clause-f-2026-10-07/BUILD-REPORT.md,
 *  evidence cline_docs/reviews/refusal-root-cause-2026-10-07/READ.md). Steve, option (b): GAP 2 ships; clause (f) STAYS BLOCKING.
 *   GAP2 — the shared config_change_author guidance keeps its rendering prohibition and gains ONE exception, gated on the
 *     active protocol explicitly SANCTIONING a read-back of an authored file (a protocol merely calling a read verbatim does
 *     not count). observability-config sanctions it for an as-deployed config file (collector, or a proxy/listener in front
 *     of it — the ingress population), as a command over the deployed file at the package's own apply path, never the
 *     descriptor read's envelope; its Reviewer accepts only that read-back; a read-back never replaces a behavioural check.
 *     network / terraform / kubernetes sanction none — their verbatim/rendering passages must not become a sanction.
 *   CLAUSE-F STILL BLOCKS — superseded 2026-10-08 by CLAUSE-F DEMOTED (below).
 *
 *  CLAUSE-F DEMOTED (WARNINGS-INVISIBLE batch 2, 2026-10-08; text cline_docs/reviews/warnings-invisible-2026-10-08/
 *  BATCH2-DRAFT-v4.md v4.1 FINAL, pins BATCH2-DRAFT.md v3 §7.1 as amended by v4 §3.1; owner G1 = A, G2 = Node C
 *  leg-only; lab run 2 met every pre-registered gate). A conclusion a package restates in a SENTENCE is a labelled
 *  `NON-BLOCKING WARNING (restated-conclusion):` line defined ONCE in the shared change_reviewer role; a GRADE still
 *  blocks; three substance rules still block ((1) own-check defect, (2) conclusion as expected output, (3) a sentence
 *  saying a requirement/check/property holds that no step proves — except a derived value's containment, which the
 *  reviewer's own check proves). Node C neither labels nor blocks a restatement. Each pin names the mutation [mN]
 *  that turns it red (mutation table in the build report).
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub';

const { PROTOCOLS } = require('./seed-protocol-prompts') as { PROTOCOLS: Array<{ name: string; promptText: string }> };
const { ROLE_GUIDANCE_LIBRARY } = require('../lib/services/agentTemplateBuilder/pAIchartUniversalTemplate') as { ROLE_GUIDANCE_LIBRARY: Record<string, string> };

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`✅ ${name}`); passed++; }
  catch (e) { console.error(`❌ ${name}\n   ${e instanceof Error ? e.message : e}`); failed++; }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

const text = (n: string): string => {
  const t = PROTOCOLS.find((p) => p.name === n)?.promptText;
  if (!t) throw new Error(`${n} is not seeded`);
  return t;
};
/** The text of the bullet that starts at `start` and ends before the next `- **Phase` bullet. */
function bullet(body: string, start: string): string {
  const i = body.indexOf(start);
  if (i < 0) throw new Error(`bullet "${start}" not found`);
  const j = body.indexOf('\n- **Phase', i + start.length);
  const k = body.indexOf('\n\n', i + start.length);
  const ends = [j, k].filter((x) => x > 0);
  return body.slice(i, ends.length ? Math.min(...ends) : undefined);
}
/** The sentence-run starting at `head`, up to the next bold item or bullet end. */
function clause(b: string, head: string, len = 900): string {
  const i = b.indexOf(head);
  if (i < 0) throw new Error(`"${head}" not found in its bullet`);
  return b.slice(i, i + len);
}

console.log('🧾 Domain carry pins (post-promotion text batch 2026-10-06)\n');

const K8S = text('kubernetes-gitops-protocol');
const K8S_AUTHOR = bullet(K8S, '- **Phase 2 — Manifest Rollback Author**');
const K8S_REVIEWER = bullet(K8S, '- **Phase 3 — GitOps Change Reviewer**');

test('K8S-DRIFT-CARRY: the Author bullet restates the Architect\'s drift decision', () => {
  const c = clause(K8S_AUTHOR, '**The drift decision, restated**', 600);
  assert(c.includes("restate the Architect's drift decision"), 'restatement obligation missing');
  for (const d of ['reconciled', 'halted', 'no drift found']) assert(c.includes(d), `disposition "${d}" missing`);
  assert(c.includes('what was compared'), 'must name what was compared');
  assert(c.includes('"not-performed: no config-repo baseline supplied"'), 'the no-baseline not-performed form is missing');
  assert(c.includes('reads only your package'), 'must say why: the Reviewer reads only the package');
});

test('K8S-DRIFT-CARRY: the Reviewer still verifies drift handling (the duty the Author now carries)', () => {
  assert(K8S_REVIEWER.includes('**Drift**: verify the package handled drift'), 'Reviewer drift check moved — re-read the carry');
  assert(!K8S_REVIEWER.includes('**The drift decision, restated**'), 'the Author sentence leaked into the Reviewer bullet');
});

const NET = text('network-provisioning-protocol');
const NET_AUTHOR = bullet(NET, '- **Phase 2 — Config Change-Package Author**');
const NET_REVIEWER = bullet(NET, '- **Phase 3 — Change Reviewer**');

test('NET-REACHABILITY: the Author bullet asks for a post-change reachability step after route suppression', () => {
  const c = clause(NET_AUTHOR, '(b2) **reachability after route suppression**', 900);
  assert(c.includes('suppresses, filters, withdraws or replaces routes'), 'trigger property missing');
  assert(c.includes('(e.g. a summary-only aggregate'), 'vendor keywords must read as examples ("e.g.")');
  assert(c.includes("each destination this change itself could make unreachable, as far as this leg's harvest shows it"), 'narrowed coverage missing');
  assert(c.includes('listed as not checked — never guessed or invented'), 'unnameable-destination rule missing');
  assert(c.includes('exact command and its exact expected output'), 'exact command + expectation missing');
  assert(c.includes('presence assertion of (h)'), 'the sanctioned unwitnessed shape pointer missing');
  assert(!c.includes('every device that reached it before'), 'the old over-broad coverage wording is back');
});

// The Reviewer's reachability text, sliced by its own sentence boundaries — never a fixed window.
const W_HEAD = '**Reachability after route suppression is a WARNING, never blocking on its own**';
const W_END = 'still apply.';
function warnSpan(): [number, number] {
  const i = NET_REVIEWER.indexOf(W_HEAD);
  const j = i < 0 ? -1 : NET_REVIEWER.indexOf(W_END, i);
  if (i < 0 || j < 0) throw new Error('reviewer warning/exemption sentences not found');
  return [i, j + W_END.length];
}

test('NET-REACHABILITY: a missing step is a LABELLED warning placed ABOVE the VERDICT block', () => {
  const [i, j] = warnSpan();
  const w = NET_REVIEWER.slice(i, j);
  assert(w.includes('as a line beginning exactly `NON-BLOCKING WARNING (reachability-after-suppression):`'), 'fixed label missing');
  assert(w.includes('in the body of your review, above the terminal `## VERDICT:` block'), 'placement phrase missing');
  assert(w.includes('never inside that block and never under `Blocking issues:`'), 'never-inside-the-block phrase missing');
  assert(w.includes('the verdict parser reads every bullet under `Blocking issues:` as a blocking item'), 'the reason (parser) missing');
  assert(w.includes('It does not by itself make the verdict NEEDS-REVISION'), 'verdict-neutral wording missing');
});

test('NET-REACHABILITY: a PRESENT step is partially exempt — warns on form, blocks only for a stated harm', () => {
  const [i, j] = warnSpan();
  const w = NET_REVIEWER.slice(i, j);
  assert(w.includes('its coverage or its target choice is recorded with the same labelled line, never a block on its own'), 'form defects must warn');
  assert(w.includes('(a) running it as written would make a correct change look failed'), 'harm (a) satisfiability missing');
  assert(w.includes("(b) the package's own evidence shows an affected destination losing reachability"), 'harm (b) substance missing');
  assert(w.includes('Rules that block any step whatever it checks'), 'universal any-step rules clause missing');
});

test('NET-REACHABILITY: EVERY reachab* mention in the Reviewer bullet lies inside the warning/exemption sentences', () => {
  const [i, j] = warnSpan();
  const re = /reachab|route suppression/gi;
  let m: RegExpExecArray | null;
  const outside: string[] = [];
  while ((m = re.exec(NET_REVIEWER))) if (m.index < i || m.index >= j) outside.push(NET_REVIEWER.slice(Math.max(0, m.index - 60), m.index + 40));
  assert(outside.length === 0, `reachability text outside the warning sentences (a second, possibly blocking, rule?): ${outside.join(' | ')}`);
});

test('NET-REACHABILITY: the warning sentences carry no blocking duty for the MISSING step', () => {
  const [i, j] = warnSpan();
  const missing = NET_REVIEWER.slice(i, NET_REVIEWER.indexOf('A reachability step the package does carry', i));
  assert(missing.length > 0 && missing.length < j - i, 'missing-step sentence not isolated');
  for (const bad of ['is a blocking finding', 'is a BLOCKING finding', 'is itself a blocking', '(blocking)', 'needs-revision)', 'must block', 'block on it', 'return NEEDS-REVISION']) {
    assert(!missing.includes(bad), `missing-step sentence carries blocking language: "${bad}"`);
  }
});

const NET_SYNTH = (() => { const i = NET.indexOf('## SYNTHESIZE'); if (i < 0) throw new Error('network SYNTHESIZE not found'); return NET.slice(i); })();
// WARNINGS-INVISIBLE batch 1 (2026-10-08, owner decision O3): the SYNTHESIZE LLM carry is RETIRED — the platform
// transcribes the label (reviewerVerdict.warnings) and renders it into the leg report.md. Inverted to an ABSENCE pin:
// a second, paraphrasable copy in pipeline-index.json could disagree with the platform's.
test('WARNINGS-INVISIBLE: network SYNTHESIZE no longer carries reviewer warnings (platform renders them)', () => {
  assert(!NET_SYNTH.includes('Reviewer warnings (either status)'), 'the retired SYNTHESIZE carry is back');
  assert(!/carry every line[^\n]*NON-BLOCKING WARNING/.test(NET_SYNTH), 'a SYNTHESIZE carry of the label is back');
  assert(NET_REVIEWER.includes('never to say that a warning does not apply'), 'reviewer negation sentence missing (EF F6)');
});

test('LAYERING: network-derivation (value leg) carries none of the network reachability sentences', () => {
  const nd = text('network-derivation-protocol');
  assert(!/reachab|route suppression/i.test(nd), 'reachability / route-suppression text leaked into network-derivation');
  assert(!nd.includes('NON-BLOCKING WARNING ('), 'warning label leaked into network-derivation');
  assert(!nd.includes('Reviewer warnings (either status)'), 'SYNTHESIZE carry leaked into network-derivation');
});

// ── TEXT BATCH gap2-clause-f (2026-10-07, option (b)) ─────────────────────────────────────────────────
const CCA = ROLE_GUIDANCE_LIBRARY['config_change_author'];
const CR = ROLE_GUIDANCE_LIBRARY['change_reviewer'];
const TF = text('terraform-iac-protocol');
const OBS = text('observability-config-protocol');
const OBS_AUTHOR = bullet(OBS, '- **Phase 2 — Observability Config Rollback Author**');
const OBS_REVIEWER = bullet(OBS, '- **Phase 3 — Observability Change Reviewer**');
const TF_AUTHOR = bullet(TF, '- **Phase 2 — HCL Rollback Author**');
const ALL: Array<[string, string]> = [
  ...PROTOCOLS.map((p) => [`protocols/${p.name}`, p.promptText] as [string, string]),
  ...Object.entries(ROLE_GUIDANCE_LIBRARY).map(([k, v]) => [`roles/${k}`, v] as [string, string]),
];
const carriers = (needle: RegExp): string[] => ALL.filter(([, t]) => needle.test(t)).map(([k]) => k).sort();

const GAP2_HEAD = '**One exception — a read-back your protocol SANCTIONS:**';
test('GAP2: shared config_change_author keeps the rendering prohibition and adds ONE exception gated on an explicit SANCTION', () => {
  const prohibition = 'quoting your config into an expected-output block is a defect even when every character of the config is correct';
  assert(CCA.includes('**NEVER from your own input text: what you WROTE is not what the tool DISPLAYS.**'), 'the rendering prohibition head is gone');
  assert(CCA.includes(prohibition), 'the even-when-every-character-is-correct prohibition is gone');
  const i = CCA.indexOf(GAP2_HEAD);
  assert(i > CCA.indexOf(prohibition), 'the read-back exception is missing or sits before the prohibition it qualifies');
  const c = CCA.slice(i, i + 800);
  assert(c.includes('where your active protocol explicitly sanctions a read-back of a file your package itself authored'), 'the gate no longer requires an explicit SANCTION (template-system M1)');
  assert(!/bytes unchanged/i.test(c), 'the gate keys on a fidelity DESCRIPTION again — a protocol calling a read byte-preserving would trigger it');
  assert(c.includes('quote exactly what its command PRINTS, never a description of it'), 'quote-what-it-prints missing');
  assert(c.includes('Anything a device or tool RENDERS from what you wrote'), 'renderings must stay under the prohibition');
  assert(c.includes('a protocol calling a read verbatim, or a rendering yours, is not that sanction'), 'the not-a-sanction clause (terraform VERBATIM, k8s committed rendering) is gone');
  assert((CCA.match(/One exception — a read-back/g) || []).length === 1, 'the exception appears more than once');
});

test('GAP2: observability sanctions the read-back for collector AND proxy/listener (ingress) files, over the deployed file', () => {
  assert(OBS.includes('| Proxy / listener config in front of the collector (e.g. an ingress) | the as-deployed file mount'), 'taxonomy row for the proxy/listener (ingress) file missing — 21 of 21 obs read-backs re-read it (template-system H1 / architectural H2)');
  const c = clause(OBS_AUTHOR, '**The sanctioned read-back of a file YOUR package authored:**', 1800);
  assert(c.includes("an as-deployed config FILE read from its mount — the collector's, or a proxy/listener file in front of it (e.g. an ingress)"), 'the read-back no longer names both file classes');
  assert(c.includes('this protocol sanctions a post-apply step that reads back a file your package authored'), 'the explicit sanction is gone — the shared gate would never fire');
  assert(c.includes("a command over the deployed file itself, at the path your package's own apply step writes it to"), 'command-over-the-file + sourced path missing (architectural M1)');
  assert(c.includes('never the descriptor read, which returns the file inside a structured JSON envelope, takes no arguments and cannot be narrowed'), 'the verified envelope fact is missing (architectural M1 / lens 5)');
  assert(!c.includes('has not been witnessed'), 'the old "unwitnessed" wording is back — the envelope is a verified fact');
  assert(c.includes('quote exactly what it PRINTS') && c.includes('count the lines it prints'), 'quote-what-prints / count-the-lines missing');
  assert(c.includes('Never describe the file ("must contain …")') && c.includes('never use the whole file as the expected output'), 'never-describe / never-whole-file missing');
  assert(c.includes('A read-back proves the file landed, never that the running service loaded or enforces it: it does not discharge a behavioural post-apply check'), 'landed-not-enforced sentence missing (architectural M3)');
  assert(c.includes('the Prometheus running config (normalized)') && c.includes("the descriptor read's envelope — and stays under the witnessed rule: never your own text"), 'renderings list missing');
});

test('GAP2: the obs Reviewer accepts ONLY the sanctioned read-back, never a rendering, and never as enforcement', () => {
  const c = clause(OBS_REVIEWER, 'the sanctioned read-back above', 700);
  assert(c.includes("read from the file itself and never a service's rendering of it (the Grafana API model, the descriptor read's envelope)"), 'Reviewer acceptance is ungated again (architectural M2)');
  assert(c.includes('is SANCTIONED: accept it, never demand the whole file as its expected output and never call it a prediction'), 'Reviewer acceptance missing');
  assert(c.includes('so it never stands in for a behavioural post-apply check'), 'Reviewer landed-not-enforced mirror missing (architectural M3)');
});

test('GAP2 LAYERING + EXCLUSIVITY: only observability sanctions a read-back; terraform VERBATIM and k8s committed rendering do not', () => {
  // template-system M1: these passages exist and must NOT be (or become) a read-back sanction.
  assert(TF.includes('VERBATIM, never reformatted'), 'terraform VERBATIM harvest passage moved — re-check it is still not a sanction');
  assert(K8S.includes('rendering this package itself commits'), 'k8s committed-rendering passage moved — re-check it is still not a sanction');
  // Property (architectural L2): the read-back sanction vocabulary lives in exactly two texts.
  const got = carriers(/sanctioned read-back|sanctions a post-apply step that reads back|sanctions a read-back/i);
  const want = ['protocols/observability-config-protocol', 'roles/config_change_author'];
  assert(JSON.stringify(got) === JSON.stringify(want), `read-back sanction carriers changed: ${got.join(', ')} — a new domain sanction must be deliberate`);
  for (const [n, t] of [['network', NET], ['terraform', TF], ['kubernetes', K8S]] as const) {
    assert(!/bytes unchanged|read-back/i.test(t), `${n} mentions a read-back / bytes unchanged — it could be read as switching on the shared exception`);
  }
  assert(NET_AUTHOR.includes('a configured identifier quoted as the value the device renders in its place'), 'network (h) rendering prohibition is gone');
  assert(TF_AUTHOR.includes('State is not source'), 'terraform state-is-not-source rule is gone');
});

// ── CLAUSE-F DEMOTED (WARNINGS-INVISIBLE batch 2) ───────────────────────────────────────────────────
const { WARNINGS_SECTION_HEADING } = require('../lib/services/report-warnings-section') as { WARNINGS_SECTION_HEADING: string };
/** A role bullet: from `start` to the next top-level bullet. */
function roleBullet(body: string, start: string): string {
  const i = body.indexOf(start);
  if (i < 0) throw new Error(`role bullet "${start}" not found`);
  const j = body.indexOf('\n- **', i + start.length);
  return body.slice(i, j > 0 ? j : undefined);
}
const LABEL_RC = 'NON-BLOCKING WARNING (restated-conclusion):';
const RC = roleBullet(CR, '- **A restated conclusion is a recorded warning, not a block.**');
const NODEC_W = roleBullet(CR, "- **At program integration — a leg reviewer's warnings**");
const DELIV = roleBullet(CR, '- **Deliverable**:');
const CM5 = (() => { const i = CR.indexOf('(5) adopting'); if (i < 0) throw new Error('common mistake (5) not found'); const j = CR.indexOf('\n', i); return CR.slice(i, j > 0 ? j : undefined); })();
const CONTENT = (() => { const i = CR.indexOf('Block on CONTENT rules:'); if (i < 0) throw new Error('CONTENT rules not found'); return CR.slice(i, CR.indexOf('Never state what', i)); })();
const SUB = 'The substance must still block';
const has = (b: string, needles: string[], where: string) => { for (const n of needles) assert(b.includes(n), `${where} lost: "${n}"`); };
const lacks = (b: string, needles: string[], where: string) => { for (const n of needles) assert(!b.includes(n), `${where} carries forbidden: "${n}"`); };

test('CLAUSE-F DEMOTED #1: the label is defined exactly once, inside the restated-conclusion bullet [m1]', () => {
  assert(CR.split(LABEL_RC).length - 1 === 1, `label occurs ${CR.split(LABEL_RC).length - 1} times in change_reviewer`);
  assert(RC.includes(LABEL_RC), 'the label is not in the restated-conclusion bullet');
});

test('CLAUSE-F DEMOTED #2: one line per conclusion, attributed, never blocking, never a "none" line, never another observation [m2a-e]', () => {
  has(RC, ['ONE line per distinct conclusion (naming every place it occurs)', 'attribute it to the package, never state the claim as your own',
    'Never write it under `Blocking issues:`', 'to say there is none, or for any other observation', 'Never adopt one as verification'], 'restated-conclusion bullet');
});

test('CLAUSE-F DEMOTED #3 (M4): (1)/(2)/(3) still block; (3) is any sentence saying a requirement holds; own reading is not the step [m3a-g]', () => {
  const i = RC.indexOf(SUB);
  assert(i >= 0, 'the substance sentence is gone');
  const m4 = RC.indexOf('is a missing validation step, and it is BLOCKING: name it', i);
  assert(m4 > i && m4 - i <= 600, `M4 BLOCKING clause missing or more than 600 chars after "${SUB}" (${m4 - i})`);
  const span = RC.slice(i, m4);
  has(span, ['a defect your own check finds', "a conclusion written AS a validation step's expected output",
    'a sentence that says a named requirement, acceptance check or required property holds or is satisfied'], 'M4 span');
  assert(!CR.includes('blocking under the validation rules'), 'the old pointer-to-a-non-existent-rule phrase is back');
  has(RC, ['still write the label line for the sentence', 'your own reading does not supply the step'], 'restated-conclusion bullet');
});

test('CLAUSE-F DEMOTED #4 (A1): a derived value\'s containment is the only own-check exception, close to (3) [m4]', () => {
  const i = RC.indexOf(SUB);
  const a = "except for a derived value's containment, tightness or membership, where your own check (common mistake (5)) is the proof";
  const k = RC.indexOf(a, i);
  assert(k > i && k + a.length - i <= 800, `A1 exception missing or beyond 800 chars (${k + a.length - i})`);
});

test('CLAUSE-F DEMOTED #5: anti-anchoring construction kept; (5) carries no dated story [m5a-c]', () => {
  has(CM5, ['build the containment check YOURSELF', 'set-membership in ANY domain', 'one forced to construct caught it'], 'common mistake (5)');
  lacks(CM5, ['2026-07-18', 'self-stamped 92'], 'common mistake (5)');
});

test('CLAUSE-F DEMOTED #6 (G1 = A): a GRADE still blocks; pointer + required-section exemptions; domain needs-revision intact [m6a-g]', () => {
  has(CONTENT, ['a package that grades its own claims', 'sets a status, pass mark, score or confidence against a listed claim or check',
    'if you cannot tell, treat it as one', 'addressed in Step 4', 'a section or table your protocol REQUIRES'], 'CONTENT rules');
  assert(CM5.includes('as the CONTENT rules above define it'), '(5) no longer points at the one grade definition');
  assert(!CR.includes('(a table, a pass mark or score per claim)'), 'the v1 grade wording is back');
  assert(NET_REVIEWER.includes('If the package contains its own verification table or a confidence attached to its claims, that is an Author-contract violation (needs-revision)'), 'network reviewer grade rule demoted');
  assert(TF.includes('a package-side verification table or claim-attached confidence is an Author-contract violation (needs-revision)'), 'terraform reviewer grade rule demoted');
});

test('CLAUSE-F DEMOTED #7 (arch M2): never-adopt covers a prose restatement at every tier [m7]', () => {
  assert(CM5.includes('or a conclusion it restates in prose as your finding'), '(5) never-adopt no longer covers prose');
});

test('CLAUSE-F DEMOTED #8: network N1 — restatement is the role warning; expected-output conclusion still blocks [m8a-d]', () => {
  lacks(NET_REVIEWER, ['and so is a derivation restated anywhere else in the package', '2026-09-22: one such restatement was approved'], 'network reviewer');
  has(NET_REVIEWER, ['is the `restated-conclusion` warning the Change Reviewer role guidance defines', 'it blocks as a validation-step defect'], 'network reviewer');
});

test('CLAUSE-F DEMOTED #9 (G2): Node C neither labels nor blocks a restatement; own-evidence block kept [m9a-g]', () => {
  has(RC, ['neither write this line nor block on a restatement', "(2) and (3) are the leg reviewer's", 'still blocks, at every tier'], 'restated-conclusion bullet');
  assert(!CR.includes("the checks in a leg's report are its reviewer's work"), 'the false Node C clause (audit A2) is back');
  has(NODEC_W, ["are that reviewer's record, not your finding", 'never copy one into `Blocking issues:`', 'block on that check and cite it'], 'Node C warnings bullet');
});

test('CLAUSE-F DEMOTED #10: the Deliverable slot for labelled warnings [m10a-c]', () => {
  const a = DELIV.indexOf('apply-governance assessment → any labelled warnings, one per line');
  assert(a > 0 && a < DELIV.indexOf('the terminal verdict block'), 'warning slot missing or after the verdict block');
  has(DELIV, ['(at program integration: none today)', 'stays unlabelled', 'with its text on that same line'], 'Deliverable');
});

test('CLAUSE-F DEMOTED #11: format and marker observations stay unlabelled [m11]', () => {
  for (const head of ['record a format concern as a NON-BLOCKING observation', 'Report such a marker as a named OBSERVATION']) {
    const i = CR.indexOf(head);
    assert(i >= 0, `"${head}" moved`);
    const sentence = CR.slice(Math.max(0, CR.lastIndexOf('. ', i)), CR.indexOf('.', i + head.length) + 1);
    assert(!sentence.includes('NON-BLOCKING WARNING ('), `"${head}" sentence now carries a label`);
  }
});

test('CLAUSE-F DEMOTED #12: Author side unchanged [m12]', () => {
  assert(CCA.includes('Never assess your own package'), 'config_change_author self-assessment ban softened');
  assert(NET_AUTHOR.includes("Do NOT restate, summarize, or carry forward the design's containment CONCLUSION"), 'network Author carry ban softened');
  assert(TF_AUTHOR.includes('No self-assessment'), 'terraform Author self-assessment ban softened');
});

test('CLAUSE-F DEMOTED #13: label carriers are exactly network + change_reviewer; no domain reviewer/other role re-blocks a restatement [m13a-b]', () => {
  const want = JSON.stringify(['protocols/network-provisioning-protocol', 'roles/change_reviewer']);
  assert(JSON.stringify(carriers(/NON-BLOCKING WARNING \(/)) === want, `label carriers: ${carriers(/NON-BLOCKING WARNING \(/).join(', ')}`);
  assert(JSON.stringify(carriers(/restated-conclusion/)) === want, `restated-conclusion carriers: ${carriers(/restated-conclusion/).join(', ')}`);
  const reblock = (t: string) => /derivation restated|restated-conclusion|verification table/i.test(t) && /needs-revision/i.test(t);
  assert(!reblock(K8S_REVIEWER), 'the k8s reviewer bullet re-blocks a restatement/verification table');
  assert(!reblock(OBS_REVIEWER), 'the obs reviewer bullet re-blocks a restatement/verification table');
  const others = Object.entries(ROLE_GUIDANCE_LIBRARY).filter(([k, v]) => k !== 'change_reviewer' && reblock(v)).map(([k]) => k);
  assert(others.length === 0, `other roles pair a restatement/verification table with needs-revision: ${others.join(', ')}`);
});

test('CLAUSE-F DEMOTED #14: Node C bullet names the platform heading and the leg-card segment [m14]', () => {
  assert(NODEC_W.includes(WARNINGS_SECTION_HEADING.replace(/^## /, '')), `Node C bullet lost the heading "${WARNINGS_SECTION_HEADING}"`);
  assert(NODEC_W.includes('reviewerWarnings'), 'Node C bullet lost the reviewerWarnings segment');
});

test('CLAUSE-F DEMOTED #15 (v4/v4.1 lab fixes): restatement defined; descriptions and required sections exempt; one-line plain form; reader text [m15-m22]', () => {
  has(RC, ['calls it verified, proved or confirmed', 'A sentence that only says what the change does, or what a step checks or prints, is not one',
    'carries its whole text on that same line — plain text, not in backticks, not a heading',
    'and what your own check of it found', 'no rule names or review vocabulary', 'unlabelled unless your protocol names an id for it',
    'A sentence that describes what the change does is not (3), even where it names the rule or contract term the change follows'], 'restated-conclusion bullet');
  has(CONTENT, ['a conclusion stated inside such a section is part of it: never label it', 'which that evidence cannot decide is (3) in the next bullet'], 'CONTENT rules');
  lacks(CR, ['a sentence saying a requirement holds', 'treat it as the warning', 'found no defect', 'but not a mere description',
    '(a sentence is not a grade; the warning bullet above'], 'change_reviewer');
});

// ── OBSERVABILITY 1.9.0 (2026-10-13; VERBATIM-QUOTE-OMISSION group C + CONTAINMENT-FIX-B consumer side) ─────────────
// Record: cline_docs/reviews/verbatim-quote-omission-2026-10-13/DRAFT-C.md (§2, §3, BUILD). Properties, not sentences.
const { computeQuoteFidelity } = require('../lib/agents/harness/quote-fidelity') as { computeQuoteFidelity: (i: Record<string, unknown>) => Record<string, any> };
const OBS_HARVESTER = bullet(OBS, '- **Phase 0 — Observability State Harvester**');
const OBS_ARCHITECT = bullet(OBS, '- **Phase 1 — Observability Change Architect**');
const OBS_PROM_ROW = OBS.split('\n').find((l) => l.startsWith('| Prometheus config (incl. rule files) |')) ?? '';

test('OBS-QUOTE #1 (C1): the Harvester quotes a file-is-the-artifact config byte for byte, or labels an excerpt with a named elision marker [q1]', () => {
  has(OBS_HARVESTER, ['Every config FILE an as-deployed file read returns', 'is quoted byte for byte**', 'each file the read returns, not only the one your change touches', "comment lines, blank lines and each line's trailing inline comment included",
    'never retyped from memory', 'Add nothing inside the fence', 'A file your change modifies, or whose prior content a rollback restores, is always quoted WHOLE', 'only another file the read returns may be quoted as an EXCERPT: label it so, never "verbatim"', '`# [elided: <what>]`'], 'obs Harvester bullet');
  assert(OBS.includes('| yes — the file IS the artifact |'), 'the taxonomy file rows C1 points at no longer say "the file IS the artifact"');
});

test('OBS-QUOTE #2 (C2): the Prometheus row is VALUES not layout, and a reflow is never called verbatim [q2]', () => {
  assert(OBS_PROM_ROW.length > 0, 'Prometheus taxonomy row not found');
  assert(!OBS_PROM_ROW.includes('quote it verbatim'), 'the Prometheus row demands a verbatim quote again (11 of 12 harvests reflow it)');
  has(OBS_PROM_ROW, ['for its VALUES, not its layout', 'none is added', 'leaving out expanded defaults are fine', 'Never call such a quote verbatim'], 'Prometheus row');
});

test('OBS-QUOTE #3 (C2b): no "verbatim from get_prometheus_config" label survives; the Architect example reads "values from" [q3]', () => {
  assert(!/verbatim from \\?`get_prometheus_config/.test(OBS), 'a "verbatim from `get_prometheus_config`" label survives — it contradicts the Prometheus row');
  assert(OBS_ARCHITECT.includes('(e.g. "values from `get_prometheus_config`")'), 'the Architect example label is not "values from"');
});

test('OBS-QUOTE #4 (measure coupling): the excerpt form C1 prescribes reads benign to quoteFidelity; an unmarked verbatim cut escalates [q4]', () => {
  const m = OBS_HARVESTER.match(/`(# \[elided: <what>\])`/);
  assert(!!m, 'elision marker form not found in the Harvester bullet');
  const marker = m![1].replace('<what>', 'the 2-line header comment');
  const raw = ['# header line one', '# header line two', 'server {', '    listen 4317;', '    client_max_body_size 16m;   # batches', '    allow all;', '}'];
  const toolCalls = [{ tool: 'svc.get_ingress_config', arguments: {}, result: { content: [{ type: 'text', data: { result: { structuredContent: { files: { 'a.conf': raw.join('\n') } } } } }] } }];
  const qf = (label: string, body: string[]) => computeQuoteFidelity({ point: 'harvester', deliverable: `${label}\n\n\`\`\`\n${body.join('\n')}\n\`\`\`\n`, toolCalls });
  const excerpt = qf('Excerpt of a.conf:', [marker, ...raw.slice(2)]);
  assert(excerpt.reason === 'all-quotes-complete', `the prescribed excerpt form escalates (${excerpt.reason}) — C1 would push compliant Harvesters into a finding`);
  // A label that still claims verbatim: only the named marker exempts the interior gap (mutation: break the marker
  // regex in quote-fidelity.ts and this goes red, which the "Excerpt" label above cannot show).
  // (Header kept: a whole-span quote that drops its header unmarked is the run-2 shape and correctly escalates.)
  const marked = qf('a.conf (verbatim, elisions marked):', [...raw.slice(0, 4), marker, ...raw.slice(5)]);
  assert(marked.reason === 'all-quotes-complete', `the prescribed marker no longer exempts a gap (${marked.reason}) — C1's marker and quoteFidelity's ELISION_MARKER_RE have diverged`);
  const cut = qf('a.conf (verbatim):', ['server {', '    listen 4317;', '    client_max_body_size 16m;', '    allow all;', '}']);
  assert(cut.reason === 'quote-omits-or-changes-lines', `an unmarked verbatim cut no longer escalates (${cut.reason})`);
});

test('CONSUMED-ADDRESS (layering + properties): the clause is in the observability consumer paragraph once and in no other text [c1]', () => {
  const HEAD = '**Addresses are `cidr` values, a single address included.**';
  const got = carriers(/\*\*Addresses are `cidr` values, a single address included\.\*\*/);
  assert(JSON.stringify(got) === JSON.stringify(['protocols/observability-config-protocol']),
    `clause carriers: ${got.join(', ') || 'none'} — k8s/network/terraform must not carry it until the deferred k8s batch (owner option 4)`);
  assert(OBS.split(HEAD).length === 2, 'the clause appears more than once in observability');
  const i = OBS.indexOf('**Consumed values (machine-checked)**');
  const para = OBS.slice(i, OBS.indexOf('\n\n', i)); // the paragraph carries the fenced JSON example's own newlines
  assert(i >= 0 && para.includes(HEAD), 'the clause is not inside the observability Consumed values paragraph');
  assert(para.indexOf('a coined kind turns a correct value into a false mismatch') < para.indexOf(HEAD), 'the clause no longer follows the coined-kind sentence');
  has(para, ['that an upstream LEG produced — derived, selected, or copied from that leg\'s published file', 'one entry per address,',
    'Never join several addresses into one entry', 'or the bare address exactly as your artifact writes it', '<the address>/32', 'even when the upstream stamped no derived value', 'never declare an aggregate you computed over them',
    'a range the upstream derived is declared as that one range, never split', 'not a covering prefix', 'Omit the block if your package applies no chained value'], 'obs Consumed values paragraph');
});

// ── OBSERVABILITY 1.9.0 review fold (REVIEW-OBS-1.9.0.md B1/S1/S2) ──────────────────────────────────────────────────
test('CONSUMED-ADDRESS B1: the clause excludes the leg\'s OWN harvest and its brief/contract — only an upstream LEG\'s values are declared [b1]', () => {
  const i = OBS.indexOf('**Addresses are `cidr` values, a single address included.**');
  const c = OBS.slice(i, i + 1400);
  has(c, ["never an address your own leg's harvest returned (an existing allow line, a proxy target)", 'never one your brief or interface contract states'], 'consumer clause (B1)');
  assert(!/reached you from §6/.test(c), 'the over-broad "reached you from §6" trigger is back — it admits the leg\'s own Phase 0 harvest');
});

test('OBS-QUOTE S1: the Author never copies an elision marker into a desired-state or rollback file, never reconstructs it [s1]', () => {
  has(OBS_AUTHOR, ['A harvested quote carrying an `# [elided: …]` line is incomplete the same way',
    'never copy the marker into a desired-state or rollback file and never reconstruct the lines it stands for'], 'obs Author bullet (S1)');
});

test('OBS-QUOTE S2: no sentence still calls a Prometheus rollback or a secret-bearing quote "verbatim" [s2]', () => {
  lacks(OBS, ['prior file content VERBATIM', 'outside those verbatim quotes'], 'observability protocol (S2)');
  has(OBS_AUTHOR, ['prior file content per its taxonomy row — byte for byte for the file rows, every value unchanged for the Prometheus rendering, never an excerpt'], 'obs Author (c) (S2)');
  assert(OBS.includes('never RESTATE outside those quotes'), 'the secret-hygiene restate rule moved');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
