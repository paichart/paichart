#!/usr/bin/env ts-node
/**
 * pov-program derivationContainment TAXONOMY guard (2026-07-29).
 *
 * The taxonomy that decides whether a leg's `derivationContainment: { checked: false }` BLOCKS the
 * program gate is PROSE inside the seeded pov-program protocol (scripts/seed-protocol-prompts.ts) —
 * there is no code path to unit-test. These are therefore string-pinned source assertions, the same
 * idiom as the seed-coupling test in test-parse-verdict.ts:76.
 *
 * WHY IT EXISTS — Run 14 (program cms4eqtz20007yxvmdu4ppqu5, 2026-07-28) parked at
 * `programReleasable: false` with Node C APPROVED / 0 blocking, solely because the downstream
 * terraform-iac leg's stamp read `checked: false`. That stamp is CORRECT and the leg is correct.
 *
 * ⚠️ THE REASON STRING IS THE WHOLE FIX — AND IT WAS GOT WRONG ONCE. The first implementation keyed
 * the benign exception on `no-derived-values-block` and was INERT: the terraform leg never stamps
 * that. It stamps `harvest-block-missing-or-unparseable`. A consuming IaC leg DOES emit a parseable
 * `## Derived Values` block (it re-states the chained aggregate, exactly as its contract requires);
 * what it lacks is a `## Harvested Allocations` CIDR set, because it harvests bucket/state, not an
 * address pool. execution-core's existence-first ordering tests `!derived` BEFORE `!harvested`, so
 * a present-derived + unparseable-harvest leg can only land on `harvest-block-missing-or-unparseable`.
 * The wrong string was carried through several design documents and survived four review passes; it
 * was falsified only by reading the live artifact. Hence test 2 below.
 *
 * THE INVARIANTS (each is easy to break by "simplifying"; each assertion below is mutation-failable):
 *
 *  1. The exception keys on `harvest-block-missing-or-unparseable` — NOT `no-derived-values-block`.
 *     Getting this backwards makes the whole change inert on the case it exists to fix.
 *  2. `no-derived-values-block` keeps its ORIGINAL clause, untouched. It is a DIFFERENT state (no
 *     derived block at all) and is the refusal/silent-drop fail-safe: VT-11's collision escalation
 *     lands here, as does the run-2/3 Author-dropped-its-block failure. Both must keep blocking.
 *  3. The exception requires the DAG-position guard (`upstreamContainment.green`). Without it, a
 *     DERIVING leg whose CIDR harvest is genuinely BROKEN — same reason string — would false-release.
 *  4. It must fail CLOSED when the upstream fact is absent, and must not send the gate off to parse
 *     the Architect plan (unreachable/truncating) or infer the edge from counts-only chainedContext.
 *
 * Spec half: paichart program-artifacts/meridian-t6-sequenced/requirements.md T6.1
 * (Acceptance → Consuming-leg containment attribution).
 *
 * Created: 2026-07-29
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('🧪 pov-program derivationContainment Taxonomy\n');

let passed = 0;
let failed = 0;

function test(description: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${description}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${description}`);
    if (error instanceof Error) console.error(`   Error: ${error.message}`);
    failed++;
  }
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const seedPath = path.join(__dirname, 'seed-protocol-prompts.ts');
const seedSource = fs.readFileSync(seedPath, 'utf-8');
const corePath = path.join(__dirname, '..', 'lib', 'services', 'execution-core.ts');
const coreSource = fs.readFileSync(corePath, 'utf-8');
// Extracted 2026-07-30 so it can be replayed without a program run. This test caught the move.
const enrichPath = path.join(__dirname, '..', 'lib', 'agents', 'harness', 'derivation-containment-enrichment.ts');
const enrichSource = fs.readFileSync(enrichPath, 'utf-8');
const chainerPath = path.join(__dirname, '..', 'lib', 'agents', 'harness', 'context-chainer.ts');
const chainerSource = fs.readFileSync(chainerPath, 'utf-8');
const cardPath = path.join(__dirname, '..', 'lib', 'mcp', 'server', 'tools', 'advanced', 'lean-card-facts.js');
const cardSource = fs.readFileSync(cardPath, 'utf-8');

// The seed with every `version:` changelog line STRIPPED. Negative assertions ('X must no longer
// appear') must run against this, not the raw source: a changelog entry legitimately QUOTES the thing
// it retired, so a whole-file grep reports the retired phrase as still present. Caught 2026-07-30 when
// the v1.0.19 entry — which says the "plainly derives" example is RETIRED — failed the assertion
// checking that it was retired. Same class as the clause-window overrun in INVARIANT 2: a negative
// check is only as good as its scope.
const seedBody = seedSource.split('\n').filter(l => !/^\s*version: '/.test(l)).join('\n');

// The taxonomy paragraph, isolated so an assertion cannot accidentally satisfy itself from the
// `version:` changelog prose, which legitimately describes the same change in similar words.
const TAXONOMY_ANCHOR = 'derivationContainment taxonomy for the conjunct above';
const taxonomyStart = seedSource.indexOf(TAXONOMY_ANCHOR);
// Bounded by the END OF THE PARAGRAPH (the taxonomy is one line in the template literal), not a
// magic char count. A fixed +4000 window silently TRUNCATED the paragraph the moment a clause grew,
// and the assertions past the cut failed as though their text had been deleted — a false negative
// indistinguishable from a real regression. Fourth scope-of-check bug in this work; self-sizing
// bounds cannot have it.
// 2026-08-03 DECOMPOSITION: the taxonomy is no longer ONE line — it is a structured block of
// branches. Bounding on the first newline now truncates it at the title and makes every assertion
// below vacuous rather than failing, which is this file's own documented failure mode (see the
// +4000-char window incident above). Bound on the START OF THE NEXT PROTOCOL STEP instead — a
// stable structural marker that does not move when clauses are added inside the block.
const TAXONOMY_END_MARKER = '6. **Stamp the facts on yourself**';
const taxonomyEnd = taxonomyStart === -1 ? -1 : seedSource.indexOf(TAXONOMY_END_MARKER, taxonomyStart);
const taxonomy = taxonomyStart === -1 ? '' : seedSource.slice(taxonomyStart, taxonomyEnd === -1 ? undefined : taxonomyEnd);

test('the taxonomy block is delimited at BOTH ends (a lost bound makes every assertion vacuous)', () => {
  assert(taxonomyEnd !== -1,
    `end marker "${TAXONOMY_END_MARKER}" not found — the slice would run to EOF and assertions could satisfy themselves from unrelated protocol text`);
  assert(taxonomyEnd > taxonomyStart, 'end marker precedes the taxonomy — bounds inverted');
  assert(taxonomy.length > 3000, `taxonomy slice implausibly short (${taxonomy.length} chars) — the block was truncated, not read`);
});

test('the taxonomy paragraph is still present and locatable', () => {
  assert(taxonomyStart !== -1,
    `anchor "${TAXONOMY_ANCHOR}" not found — taxonomy renamed or removed; EVERY assertion below is vacuous until fixed`);
});

test('INVARIANT 1: the exception is keyed on harvest-block-missing-or-unparseable', () => {
  assert(/\\`harvest-block-missing-or-unparseable\\` = BLOCKING gap \*\*EXCEPT for a CONSUMING LEG\*\*/.test(taxonomy),
    'the CONSUMING LEG exception is not attached to harvest-block-missing-or-unparseable — this is the exact error that made the first implementation INERT (the terraform leg never stamps no-derived-values-block)');
  assert(/the reason is exactly \\`harvest-block-missing-or-unparseable\\`/.test(taxonomy),
    'the exception does not pin the reason string as a REQUIRED fact — without it the branch could drift onto another reason code');
});

test('INVARIANT 2: no-derived-values-block keeps its ORIGINAL blocking clause (VT-11 fail-safe)', () => {
  // The clause's BENIGN CONDITION deliberately changed on 2026-07-31 (A7): it was "that leg's objective
  // derives nothing from harvested state" — a judgement — and is now the harvestedCount FACT. What must
  // never change is the GUARANTEE: a leg that harvested a pool and emitted no derivation blocks. Pin the
  // guarantee, not the sentence, or this test forbids the fix it was written to protect.
  // 2026-08-03 (arch F1): this used to pin the SET MEMBERSHIP literally —
  // `{no-derived-values-block, no-harvest-child, no-author-child} = benign or blocking by a FACT` —
  // and so it asserted the DEFECT: no-harvest-child/no-author-child are built with {checked, reason}
  // only (enrichment:96), can never carry harvestedCount, and were therefore classified
  // unconditionally benign. Correcting that grouping FAILED this test, which is precisely what the
  // comment above warns against. Now pins the GUARANTEE: whichever set it sits in,
  // no-derived-values-block must key on the harvestedCount FACT and not on a judgement.
  assert(/\\`no-derived-values-block\\`\}? = benign or blocking by a FACT/.test(taxonomy),
    'the no-derived-values-block clause no longer keys on a FACT — if it reverted to judging the leg\'s objective, A7 is reopened');
  assert(/\\`no-harvest-child\\`[\s\S]{0,120}BLOCKING gap, always/.test(taxonomy),
    'no-harvest-child/no-author-child left the always-BLOCKING set — they mean the check never ran and cannot carry harvestedCount, so an ABSENT=>benign reading clears a coverage gap (arch F1, 2026-08-03)');
  // H-3 (2026-09-09): the program's OWN containment fact must be named benign and non-conjunct, and
  // the LEG reason must stay blocking in the same text — both halves, or the C3 branch drifts back.
  assert(/BRANCH C3[\s\S]{0,400}program-tier-inapplicable/.test(taxonomy),
    'BRANCH C3 (program-tier → benign program-tier-inapplicable) is gone — the parent would again read its own no-harvest-child as a gap');
  assert(/REFUSED or DROPPED[\s\S]{0,80}BLOCKING/.test(taxonomy),
    'the refusal/drop guarantee is gone: a leg that harvested a pool and emitted no derivation must never read benign — since 2026-08-16 it is needs-node-c (harvested-pool-no-derivation-cannot-decide), BLOCKING until Node C discharges it (VT-11 collision refusal, run-2/3 dropped block)');
  assert(/regardless of anything upstream/.test(taxonomy),
    'the upstream-irrelevance marker is gone — a downstream deriving leg that refuses HAS a clean in-edge, so an edge-aware rule would clear it wrongly. Its ONE exception (2026-08-16) is the consumed discharge, which needs a parsed consumed block AND green === true (pinned separately below)');
  assert(/REFUSAL\/DROP fail-safe and is NEVER relaxed/.test(taxonomy),
    'the never-relax marker is gone — without it a later editor may extend the consuming exception onto this clause, releasing VT-11 collision refusals and run-2/3 silent drops');
  // Guard against the specific regression: the exception phrase must NOT appear inside the
  // no-derived-values-block clause.
  // Bound the clause by the START OF THE NEXT ONE, not a fixed character window — a fixed window
  // overruns into the harvest-block clause (which legitimately says CONSUMING LEG) and fires a
  // false positive. Caught by this test on its first run.
  // Anchor re-pointed 2026-08-03: the clause no longer starts a three-reason set.
  const ndvbIdx = taxonomy.indexOf('{\\`no-derived-values-block\\`} = benign or blocking');
  const nextClauseIdx = taxonomy.indexOf('\\`harvest-block-missing-or-unparseable\\` = BLOCKING', ndvbIdx);
  assert(ndvbIdx !== -1 && nextClauseIdx > ndvbIdx,
    'cannot delimit the no-derived-values-block clause (its start or the following harvest-block clause moved) — the leak check below would be vacuous');
  const ndvbClause = taxonomy.slice(ndvbIdx, nextClauseIdx);
  assert(!/CONSUMING LEG/.test(ndvbClause),
    'the D2 CONSUMING LEG exception (keyed on harvest-block-missing-or-unparseable) leaked into the no-derived-values-block clause. This reason has its OWN consumed discharge since 2026-08-16, but only on two facts — a parsed consumed block AND green === true (pinned below); the D2 exception must not widen it, or a refused collision reads benign');
});

test('INVARIANT 2b: clause 1 DOMINANCE is stated where the conditional clauses begin', () => {
  // 2026-08-03 (arch c-ii/c-iii/c-iv). `violations` non-empty and a benign checked:false disposition can
  // hold on the SAME stamp — `consumed` is parsed before the derived/harvest branch and the mismatch
  // appends under checked===false, so a leg can carry reason:'no-derived-values-block' + ABSENT
  // harvestedCount + violations:[consumed-value-mismatch]. Clause 5 reads ABSENT as benign; clause 1
  // says BLOCK. Runs 17, 18 and 20 all stamped that shape. The Step-5 formula arbitrates correctly; the
  // PROSE did not, and prose precedence has twice been measured as non-binding on a reasoner here.
  assert(/CLAUSE 1 DOMINATES EVERY CLAUSE BELOW IT/.test(taxonomy),
    'the clause-1 dominance statement is gone — a violation can then be read as released by a benign checked:false disposition (arch c-ii/c-iii/c-iv)');
  // It must sit BEFORE the conditional dispositions, not after them: the failure mode is branching to
  // the reason taxonomy and never returning (pc R6), so a trailing statement is never reached.
  const dominanceIdx = taxonomy.indexOf('CLAUSE 1 DOMINATES');
  const unsupportedIdx = taxonomy.indexOf('\\`unsupported\\` non-empty');
  const reasonsIdx = taxonomy.indexOf('\\`checked:false\\` reasons');
  assert(dominanceIdx !== -1 && unsupportedIdx > dominanceIdx && reasonsIdx > dominanceIdx,
    'the dominance statement moved AFTER the conditional clauses it governs — it is only load-bearing at the branch point');
});

test('INVARIANT 2c: the refusal fail-safe states its CIDR-only scope honestly (arch F3)', () => {
  // ef2bf07d made harvestedCount CIDR-only to stop an ASN-harvesting leg being read as a refusal (a
  // false PARK). In the same stroke it opened the mirror case: an ASN-only harvest that DOES refuse
  // stamps no harvestedCount, reads ABSENT, and would be released. "NEVER relaxed" became an overclaim.
  // An overclaim left standing in a guard's own text is how the arch-F1 hole survived — the prose read
  // as a fact-driven test while being, for some inputs, a constant.
  assert(/the fail-safe is mechanical for CIDR\s*ONLY/.test(taxonomy),
    'clause 15 no longer scopes its guarantee — "NEVER relaxed" is false for a non-CIDR-only harvest and must not be restored unqualified');
  // Documenting a hole is not closing one. The gate must be told what to DO on the uncovered shape.
  assert(/do NOT apply the ABSENT⇒benign test: escalate/.test(taxonomy),
    'the residual is described but not actionable — a gate reading a non-CIDR-only refusal needs an instruction, not a caveat');
});

test('INVARIANT 2d: the taxonomy CONSUMES the computed disposition (mechanisation is not inert)', () => {
  // The third surface. Stamp -> render -> gate: break the middle or the END link and the change reads
  // as shipped while doing nothing. This module has four recorded instances of exactly that, the most
  // recent being cd8ad793 (A1, 2026-08-03). If the enrichment stamps a disposition the gate is never
  // told to read, mechanisation buys nothing.
  assert(/containmentDisposition\\` FIRST/.test(taxonomy),
    'the taxonomy no longer tells the gate to read containmentDisposition — the stamped field is then inert');
  assert(/needs-node-c/.test(taxonomy),
    'the third state is gone from the protocol — a two-state reading silently converts clause 3 into a hard block (G5)');
  assert(/ABSENT ⇒ treat as blocking/.test(taxonomy),
    'the fail-closed reading of an ABSENT disposition is gone — absence must never be benign (G2)');
  assert(/DEFECT to report, not a judgement call/.test(taxonomy),
    'the gate is no longer told that contradicting the stamped disposition is a defect — without this the prose clauses below become a competing authority and the mechanisation is advisory');
});

test('INVARIANT 3: the DAG-position guard (upstreamContainment.green) is REQUIRED', () => {
  assert(/upstreamContainment\.green === true/.test(taxonomy),
    'the upstream guard is missing — a DERIVING leg with a genuinely BROKEN CIDR harvest stamps the SAME reason string and would false-release');
  // H-2 (2026-09-09): green is TRANSITIVE — the prose must say a deriving leg ANYWHERE in the chain
  // qualifies, via a discharged consuming hop. Without this line a later edit could quietly restore the
  // one-hop reading that blocked every consumer-of-a-consumer.
  assert(/through a discharged consuming hop[\s\S]{0,80}\\`via\\` leg/.test(taxonomy),
    'the transitive (via) wording is gone from D2 — a consumer of a consumer would again read as upstream-not-green');
  assert(/no predecessor carries any violation/.test(taxonomy),
    'the ALL-predecessors rule is gone — with "at least one" semantics a clean sibling could mask a predecessor carrying a violation');
});

test('INVARIANT 4: fails CLOSED, and does not send the gate to parse the plan or infer from counts', () => {
  assert(/ABSENT or \\`green\\` is false, the reason stays BLOCKING \(fail closed\) unless D4 applies/.test(taxonomy),
    'no fail-closed rule — an absent upstream fact must BLOCK, never be assumed benign');
  assert(/do NOT parse the Architect plan/i.test(taxonomy),
    'the plan-parse prohibition is gone — that route truncates (~100K cap) and reintroduces intermittent false parks');
  // The gate must be pointed at a route that ACTUALLY carries the field. Step 2 reads the compact
  // card, and lean-card-facts.js only renders upstreamContainment because of the paired change in
  // this commit — naming the route here is what couples the two.
  assert(/\*\*Facts:\*\*\\` line renders \\`upstreamContainment/.test(taxonomy),
    'the taxonomy no longer names the Facts-line route — Step 2 reads the compact card, so a field the card does not render is a field the gate cannot gate on (fail-closed ⇒ permanent false park)');
  assert(/COUNTS only/.test(taxonomy),
    'the chainedContext trap is unmarked — it carries counts, never predecessor identities, so a gate that tries would invent the edge');
});

test('the fabricated-harvest remedy is explicitly forbidden', () => {
  // 2026-08-03: this used to match only the NOUNS ("FABRICATED ... block", "HOLLOW"), so mutating
  // "Never accept" to "Sometimes accept" left it green — it guarded the vocabulary, not the rule.
  // Found by mutation during the decomposition; three sibling assertions failed and this one did not.
  assert(/Never accept a FABRICATED \\`## Harvested Allocations\\` block/.test(taxonomy) && /HOLLOW/.test(taxonomy),
    'the anti-fabrication clause is gone — inventing foreign allocations to force checked:true is a hollow check on a leg with no allocation pool');
});

test('a requirements artifact may explain a role but never supplies the verdict', () => {
  assert(/may EXPLAIN a leg's role but NEVER supplies this verdict/.test(taxonomy),
    'without this, a fetched (untrusted, author-controlled) requirements doc could relax a release gate by assertion');
});

test('the exception still rides on the platform-fact conjuncts (Node C + coverage)', () => {
  assert(/Node C APPROVED plus the coverage conjuncts/.test(taxonomy),
    'the exception must not stand alone: conditions (2) and (3) of the spec clause are program-tier facts and remain hard conjuncts');
});

test('COUPLING: the enrichment emits the upstreamContainment fact the taxonomy reads', () => {
  assert(/upstreamContainment/.test(enrichSource),
    'the taxonomy gates on derivationContainment.upstreamContainment but the enrichment never stamps it — the branch would be permanently unavailable (fail-closed => permanent false park, which is exactly what Run 15 did)');
  assert(/source === 'report\.md'/.test(enrichSource),
    'the upstream filter no longer requires the report.md deliverable — a pipeline-index.json fallback means the deliverable never arrived and must not qualify');
  assert(/green: isUpstreamContainmentGreen\(legs\)/.test(enrichSource),
    'the green flag is no longer computed by the shared predicate — an inline re-implementation can drift from the unit-tested one');
  assert(/lookupMisses/.test(enrichSource),
    'lookupMisses is gone: absent-vs-empty upstreamContainment must stay distinguishable. Run 15 stamped NOTHING here and the total inertness took a day to find');
});

test('BUG-CLASS GUARD: the predecessor facts artifact is resolved ONCE, by the chainer', () => {
  // The class: "resolve a predecessor's facts artifact" reimplemented per site, each new site
  // omitting the PIPELINE branch (a PIPELINE task writes pipeline-index.json, an ACTION writes
  // result.json). Silent failure — zero rows reads identically to "nothing upstream". Three sites:
  // context-chainer (fixed as CC2), agent-results-handler (fixed as wave-2 E1), and execution-core
  // (shipped broken 2026-07-29, made the whole consuming-leg exception unavailable on Run 15).
  // The eradication is that only the chainer resolves it; everyone else reads the carried field.
  assert(/derivationContainment: parsed\.derivationContainment \?\? null/.test(chainerSource),
    'CC3 is gone from context-chainer: without the carried field, consumers must re-resolve the artifact themselves — which is the bug class');
  assert(/factsArtifactName = isPipelinePredecessor/.test(chainerSource),
    'the chainer no longer branches PIPELINE -> pipeline-index.json; that branch is the whole reason resolution lives here');
  // The anti-regression: the enrichment must NOT query artifacts for a predecessor again.
  assert(!/agent_artifacts[\s\S]{0,400}derivationContainment/.test(enrichSource),
    'the enrichment queries agent_artifacts for derivationContainment again — that re-opens site #4 of the bug class. Read chainedFrom[].derivationContainment instead');
});

test('COUPLING: the lean card renders upstreamContainment (else the gate never sees it)', () => {
  // The three-surface chain: execution-core STAMPS it → lean-card-facts RENDERS it → the taxonomy
  // GATES on it. Break any link and the fix is inert while still reading as shipped. This link was
  // missed on the first pass and would have re-parked Run 15 for a third distinct reason.
  assert(/upstreamContainment/.test(cardSource),
    'lean-card-facts.js does not render upstreamContainment — SYNTHESIZE Step 2 reads the compact card, so the gate would see an ABSENT fact and fail closed on every correct sequenced run');
  assert(/green \? 'green' : 'NOT green'/.test(cardSource),
    'the NOT-green case is no longer rendered explicitly — a silently omitted false is indistinguishable from an absent fact, and they must stay distinguishable (one is a broken deriver, the other a retrieval gap)');
});

test("NODE C CONTAMINATION RULE: distrust the requirements, and never renumber a spec check", () => {
  // Both rules were added to the Node C step on 2026-07-30 and were initially UNGUARDED — a mutation
  // pass caught that, which is why they are pinned here. Run 15's two theatre defects came from the
  // absence of exactly these: Node C asserted `upstreamContainment.green:true` for a field absent from
  // the artifact (quoting the requirements' expected state), and it renumbered a new T6.1 clause into
  // the slot held by the MINIMALITY check, never performed that check, and a non-minimal /30 shipped
  // APPROVED / 0-blocking. Node C was told to distrust the LEGS; nothing told it to distrust the SPEC.
  assert(/Distrust the REQUIREMENTS as well as the legs/.test(seedSource),
    'the requirements-distrust rule is gone — Node C will again recite a supplied expected value as an observation (run-15 D3)');
  assert(/reference data describing the round's intent[\s\S]{0,200}NOT an\s+observation/.test(seedSource)
      || /it is NOT an\s*\n?\s*observation and restating it is NOT a check/.test(seedSource),
    'the "expected values are reference data, not observations" wording is gone — that sentence IS the rule');
  assert(/never report the expected state as though you saw it/.test(seedSource),
    'the report-ABSENT-when-absent instruction is gone — silence on a missing field is how D3 passed');
  assert(/never renumber, merge or substitute a numbered check/.test(seedSource),
    'the renumbering prohibition is gone — a new clause can again displace a numbered check, which is how minimality was deleted (run-15 D2)');
});

test('A7 CLOSED: the deriving test is the harvestedCount FACT, not a judgement', () => {
  // A7 (2026-07-18) asked that the benign/blocking split on checked:false be a FACT, not a synthesizer
  // inference. Closed 2026-07-31 by stamping a value the enrichment already computed and discarded.
  assert(/harvestedCount/.test(taxonomy),
    'the taxonomy no longer reads harvestedCount — the benign/blocking call reverts to judging the leg\'s objective, which is A7 reopened');
  assert(/\*\*PRESENT\*\*[\s\S]{0,400}BLOCKING/.test(taxonomy),
    'the PRESENT arm is gone: a leg that harvested a pool and emitted no derivation may have REFUSED or DROPPED (VT-11 / run-2/3) — it is needs-node-c since 2026-08-16, never benign, and BLOCKING until Node C discharges it');
  assert(/\*\*ABSENT\*\*[\s\S]{0,200}benign/.test(taxonomy),
    'ABSENT-means-benign is gone: a leg that harvested no pool had nothing to derive');
  assert(/absent ≠ 0/.test(taxonomy),
    'the absent-vs-zero distinction is gone — harvestedCount:0 means the block PARSED and the pool was empty: benign harvested-pool-empty (2026-08-16), a different reason from ABSENT, which resolves through the remaining arms');
  assert(/harvestedCount/.test(cardSource),
    'the lean card does not render harvestedCount — SYNTHESIZE Step 2 reads the fact off that card, so the gate could not see it (the Run-15 inertness, third occurrence of this trap)');
});

test('DERIVING TEST is what the leg HARVESTED, not what it packages', () => {
  // v1.0.18 fixed the taxonomy and left the old example in place, twice: "plainly derives (e.g. it
  // packages an aggregate)". A CONSUMING leg packages the value it was handed and derives nothing, so
  // that example told the gate to block precisely the case the new exception declares benign — the
  // protocol arguing with itself in one document. It parked a correct run (14) and cleared a loose
  // aggregate (15). Unguarded when first written; a mutation pass caught that.
  assert(!/plainly derives/.test(seedBody),
    'the "plainly derives (e.g. it packages an aggregate)" example is back — it contradicts the consuming-leg exception and is how run 14 parked and run 15 cleared');
  assert(/"It packages an aggregate" is NOT the test for deriving/.test(seedSource),
    'the explicit not-the-test warning is gone — without it the packaging heuristic returns by default');
  assert(/Ask what the leg HARVESTED/.test(seedSource),
    'the harvested-based test is gone: a leg that harvested the pool the value came from is deriving; one that harvested state and received the value on a chained edge is consuming');
});

test('CHECK 1 MECHANICAL: the Consumed Values contract + the consumed-value-mismatch class', () => {
  // Acceptance check 1 ("the policy value exactly equals the aggregate the network leg derived — the
  // chained value, not a guess, not a recomputation") was the LAST correctness property in the
  // sequenced chain resting entirely on a reviewer reading upstream prose. Check 2b went unperformed
  // on two consecutive runs by two different mechanisms, so that assumption was not worth keeping.
  // Guarded here because BOTH prior Node C rules shipped unguarded and a mutation pass caught it.
  assert(/consumed-value-mismatch/.test(taxonomy),
    'the taxonomy no longer names consumed-value-mismatch — the gate would not know the class exists');
  assert(/MECHANICAL DEFECTS FOUND, not only containment ones/.test(taxonomy),
    'the violations-array semantics are gone: consumed-value-mismatch rides the SAME array the gate already blocks on, and a reader must know violations is not containment-only');
  assert(/can appear on a \\`checked:false\\` fact/.test(taxonomy),
    'the checked:false carve-out is gone — a consumer has no derivation of its own to check, so its mismatch would look impossible');
  // Both consuming protocols must carry the emitting contract, or the platform compares against nothing.
  const consumedContracts = (seedBody.match(/## Consumed Values/g) || []).length;
  assert(consumedContracts >= 2,
    `both consuming protocols (terraform-iac, kubernetes-gitops) must carry the Consumed Values contract; found ${consumedContracts}`);
  assert(/COPY IT FROM YOUR OWN ARTIFACT, not from §6/.test(seedBody),
    'the copy-from-your-artifact rule is gone — transcribing the upstream value into the block while writing something else in the package defeats the only purpose the block has');
});

test('the pov-program protocol version is >= 1.0.18 (structurally located, not date-pinned)', () => {
  // Anchored on `name: 'pov-program-protocol'` and the version field that FOLLOWS it. The previous
  // form matched a hardcoded date (`// 2026-07-29`) and therefore FAILED on the very next bump —
  // reporting "no version entry" for a file that had just been correctly bumped to 1.0.19. A guard
  // that breaks on the action it exists to encourage is worse than no guard: it trains you to edit
  // the test instead of reading it. Caught 2026-07-30 doing exactly that.
  const nameIdx = seedSource.indexOf("name: 'pov-program-protocol'");
  assert(nameIdx !== -1, "cannot locate `name: 'pov-program-protocol'` — the anchor moved; this assertion is vacuous until fixed");
  // The version field FOLLOWS `name` inside the object literal, so take the FIRST one after the
  // anchor. (Taking the nearest PRECEDING field read the terraform-iac protocol's 1.0.3 instead —
  // a wrong-object read that looked exactly like a missing bump.)
  const m = /version: '(\d+)\.(\d+)\.(\d+)'/.exec(seedSource.slice(nameIdx));
  assert(m !== null, 'no version field follows the pov-program-protocol name field');
  const [maj, min, pat] = [Number(m![1]), Number(m![2]), Number(m![3])];
  assert(maj > 1 || (maj === 1 && (min > 0 || (min === 0 && pat >= 18))),
    `expected >= 1.0.18, got ${maj}.${min}.${pat}`);
});

// ── CONSUMER-FAIL-OPEN (2026-10-03, pattern (h) batch 2) ─────────────────────────────────────────
// BRANCH D was stale against the code's arm order from 2026-08-03/16 until this batch, and the taxonomy says "stop at the
// first match" — so a D3 placed after D2 was unreachable while D said "ABSENT ⇒ benign". These pin the corrected text to the
// code, in both directions: the reason exists in the code, in both program protocols, and in the D slice that routes to it.
const containmentSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'agents', 'harness', 'derivation-containment.ts'), 'utf-8');
const branchDStart = taxonomy.indexOf('**BRANCH D — ');
const branchD2Start = taxonomy.indexOf('**BRANCH D2 — ', branchDStart);
const branchD = branchDStart === -1 || branchD2Start === -1 ? '' : taxonomy.slice(branchDStart, branchD2Start);

test('CFO: a harvested pool with no derivation is NEVER benign (stated in BRANCH D)', () => {
  assert(branchD.length > 0, 'cannot delimit BRANCH D (its heading or BRANCH D2 moved) — every CFO assertion below would be vacuous');
  assert(/\*\*PRESENT\*\*[\s\S]{0,500}never benign/.test(branchD),
    'BRANCH D no longer says a harvested pool with no derivation is never benign — that is the VT-11 refusal fail-safe');
  assert(/harvestedCount > 0|harvestedCount !== undefined/.test(containmentSource)
      && /'harvested-pool-no-derivation-cannot-decide'/.test(containmentSource),
    'the code arm the prose describes is gone — re-read computeContainmentDisposition before editing the text');
});

test('CFO: the consumed discharge requires BOTH a parsed consumed block AND green === true', () => {
  assert(/\\`## Consumed Values\\` block parsed AND \\`upstreamContainment\.green === true\\` ⇒ \*\*benign\*\*/.test(branchD),
    'BRANCH D no longer states BOTH facts for the consumed discharge — a one-fact reading releases a dirty upstream or an undeclared consumer');
  assert(/consumedPresent && upstreamContainmentGreen === true/.test(containmentSource),
    'the code no longer requires both facts for consuming-leg-consumed-discharged — the prose pin above is then describing a different rule');
});

test('CFO: consuming-leg-no-consumed-block is named in the code, the program protocol, and the BRANCH D slice', () => {
  assert(/'consuming-leg-no-consumed-block'/.test(containmentSource),
    'the code no longer stamps consuming-leg-no-consumed-block — the D3 text names a reason that does not exist');
  assert(/\\`consuming-leg-no-consumed-block\\`[\s\S]{0,40}BRANCH D3 below/.test(branchD),
    'BRANCH D no longer forward-references D3 — a reader stops at "ABSENT ⇒ benign" (stop at the first match) and never reaches the discharge rule');
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub';
  const protos = require('./seed-protocol-prompts').PROTOCOLS as Array<{ name: string; promptText: string }>;
  // Promotion E (E2, 2026-10-05): value-chain-program-protocol is a DEPRECATED tombstone (no taxonomy) — pov-program
  // is the one program protocol that renders BRANCH D3.
  for (const name of ['pov-program-protocol']) {
    const t = protos.find((p) => p.name === name)?.promptText ?? '';
    assert(t.includes('**BRANCH D3 — \`consuming-leg-no-consumed-block\`'), `${name} does not render BRANCH D3`);
    assert(t.indexOf('BRANCH D3 below') !== -1 && t.indexOf('BRANCH D3 below') < t.indexOf('**BRANCH D3 — '),
      `${name}: the BRANCH D forward reference does not precede D3`);
  }
});

// ── DN1 / A1 (promotion E, E4, 2026-10-05): ONE "disposed child" definition, four shapes ──────────────────────────
// SYNTHESIS §9 A1 + §3 C1 (PH-H1, PC-F2): an agent-written `superseded:` stamp waives a FAILED child only with a
// corroborating roster fact — the stamp names its replacement's task id, that id is a child of the stage, and no
// casualty chain ends at the child. The four fixtures below are the four shapes; each names the clause that decides
// it, so deleting the clause turns that fixture red. Plus the NEW PLAN-SPAWN exit (B8): a supersession that cannot
// name a replacement escalates instead of stamping. The stamp's prefix stays `superseded:` so the platform's
// exclusion (plan-spawn-carry.ts `startsWith('superseded:')`) still reads it — pinned in test-plan-spawn-carry.ts.
{
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub';
  const protos = require('./seed-protocol-prompts').PROTOCOLS as Array<{ name: string; promptText: string }>;
  const pov = protos.find((p) => p.name === 'pov-program-protocol')?.promptText ?? '';
  const slice = (from: string, to: string) => { const i = pov.indexOf(from); const j = pov.indexOf(to, i + 1); return i === -1 || j === -1 ? '' : pov.slice(i, j); };
  const step1 = slice('1. **Abort on failed legs.**', '\n2. **Fact-gate every child PIPELINE**');
  const supersede = slice('**Superseding a PIPELINE child you already persisted (rare)**', '\n5. Create the **program-synthesis producer**');
  const step2 = slice('2. **Fact-gate every child PIPELINE**', '\n3. **Read Node C');
  const step3 = slice("3. **Read Node C's verdict**", '\n4. **Check chained coverage');
  const formula = slice('programReleasable = ', '\n```');
  const DEFINITION = 'its `metadata.cannotRun` reads `superseded: <task id> — …`, that id names ANOTHER child of this stage, and no casualty chain (below) ends at it';
  const step6 = slice('6. **Stamp the facts on yourself**', '\n7. ');

  test('DN1 slices found (Step 1, the supersession bullet, Steps 2/3, the gate formula)', () => {
    for (const [k, v] of Object.entries({ step1, supersede, step2, step3, formula, step6 })) assert(v.length > 0, `${k} slice not found`);
  });
  test('DN1 fixture 1 — REPLACED (stamp names ANOTHER task in this stage, no casualties) ⇒ disposed ⇒ excluded from Steps 1, 2, 3, 5, 6', () => {
    assert(step1.includes(DEFINITION), 'the three-conjunct disposed definition is gone or reworded');
    assert(step1.includes('If ANY child that is not DISPOSED has'), 'Step 1 no longer excludes a disposed child from the abort');
    assert(step2.includes('that is not disposed (Step 1)'), 'Step 2 iterates every child PIPELINE again — a disposed child has no qualityGate');
    assert(step3.includes("(a disposed Node C's replacement's, Step 1)"), 'Step 3 no longer reads the replacement Node C');
    assert(formula.startsWith('programReleasable = every non-disposed child pipeline'), 'the Step-5 conjunct iterates disposed children again');
    assert(step6.includes('<MIN reviewerScore across non-disposed child pipelines>'), 'Step 6 MIN ranges over disposed children again (PH-F3 / EF-L3)');
    assert(step1.includes('(the one definition Steps 2, 3, 5 and 6 use)'), 'Step 1 no longer names every step that iterates the children');
    assert((pov.match(/\*\*Disposed\*\*/g) ?? []).length === 1, 'the disposed definition must be stated ONCE (Steps 2, 3, 5 and 6 reference it)');
  });
  test('DN1 fixture 2 — UNREPLACED (no replacement exists) ⇒ not stamped; PLAN-SPAWN escalates and exits IN_PROGRESS (new exit B8)', () => {
    assert(supersede.includes('cannotRun: "superseded: <replacement task id> — <reason>"'), 'the stamp format no longer names the replacement id');
    assert(supersede.includes('create its replacement first (under a new title: a same-title `task.create` returns the existing task), then dispose of it'),
      'replacement-first ordering, or the new-title reason (PH-F1: a same-title create hands back the obsolete child\'s own id), lost');
    for (const must of ['**No replacement, no supersession:**', 'if it has no replacement in this stage, do not stamp it',
      'escalate via comment naming the child', 'exit IN_PROGRESS, leaving the program parked at the gate; the human re-plans and the armed plan gate is never released']) {
      assert(supersede.includes(must), `the PLAN-SPAWN no-replacement exit lost "${must}"`);
    }
    assert(!supersede.includes('your program is never blocked by it'), 'the unconditional "never blocked" promise is back — false for an unreplaced child');
  });
  test('DN1 fixture 3 — LEGACY stamp with no id ⇒ not disposed ⇒ blocking ROOT failure', () => {
    assert(/Any other superseded child — no id,[^.]*is the ROOT failure/.test(step1), 'a legacy no-id superseded stamp no longer stays blocking');
  });
  // PH-F1 (E4 review): a same-title create returns the existing task, so a re-created DAG entry can hand back the
  // obsolete child's OWN id; a stamp naming itself must not dispose it (the row cannot corroborate itself).
  test('DN1 fixture 5 — SELF-REFERENCE (stamp names the child\'s own id) ⇒ NOT disposed ⇒ blocking ROOT failure', () => {
    assert(step1.includes('that id names ANOTHER child of this stage'), 'a stamp naming the child itself would satisfy "a child of this stage" — the self-supersession release route is open');
    assert(/Any other superseded child — no id, its own id,[^.]*is the ROOT failure/.test(step1), 'a self-referential stamp is no longer named as a ROOT failure');
  });
  test('DN1 fixture 4 — CASUALTY CHAIN ends at the superseded child ⇒ ROOT failure, named with its reason and its dependents', () => {
    assert(/or casualties chained onto it — is the ROOT failure: name it, its `cannotRun` reason and the dependents wired onto it/.test(step1),
      'a superseded child with casualties is no longer the named ROOT failure (PH-H1: cms5r… shape)');
    assert(step1.includes('following `failedDependencyTaskId` TRANSITIVELY'), 'the casualty-chain rule the definition leans on ("below") is gone');
  });
}

// ── Summary ─────────────────────────────────────────────────────────────────────────────────────

test('D-7: SYNTHESIZE final comment carries an ADVISORY "Decisions named by legs" section that never feeds the gate', () => {
  const i = seedSource.indexOf('**Decisions named by legs (D-7, 2026-09-28):**');
  if (i === -1) throw new Error('Decisions named by legs section missing from the pov-program protocol');
  const para = seedSource.slice(i, i + 1400);
  for (const must of ['headed exactly **Decisions named by legs**', 'the choice the owner must make', 'write the heading and the word none',
                      'never feeds programReleasable or any gate conjunct', 'never re-opens a child']) {
    if (!para.includes(must)) throw new Error(`D-7 section lost: "${must}"`);
  }
  if (!/version: '1\.8\.(7|[89])|version: '1\.(9|1\d)\./.test(seedSource)) throw new Error('pov-program version not bumped past 1.8.6');
});

// L6 (containment review 2026-10-12): two-way pin between the code that STAMPS and RENDERS the delegated reason and the
// BRANCH D4 text that READS it. A renamed reason or card segment on either side would leave D4 reading a string the card
// never prints — fail-closed, but a permanent false park. Same shape as the D3/CFO pins above.
test('D4 ⇄ code: the delegated reason and its card segments are the SAME strings on both sides', () => {
  const dcSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'agents', 'harness', 'derivation-containment.ts'), 'utf-8');
  const reason = (dcSource.match(/export const UPSTREAM_DELEGATED_REASON = '([^']+)'/) || [])[1];
  assert(reason === 'consuming-leg-upstream-delegated', `UPSTREAM_DELEGATED_REASON not found or renamed in derivation-containment.ts (${reason})`);
  const d4 = seedSource.indexOf('**BRANCH D4 — \\`' + reason + '\\`');
  assert(d4 > 0, 'BRANCH D4 is missing from pov-program, or no longer names the reason the code stamps');
  const d4Text = seedSource.slice(d4, d4 + 1600);
  for (const seg of ['upstreamDelegated:', 'consumedValueCheck: check 1 NOT run', 'NONE STAMPED']) {
    assert(d4Text.includes(seg), `D4 no longer reads the card segment "${seg}"`);
    assert(cardSource.includes(seg.split(':')[0] + ':') || cardSource.includes(seg), `the card no longer renders "${seg}"`);
  }
  assert(cardSource.includes('check 1 NOT run ('), 'the card no longer renders "check 1 NOT run (<state>)"');
  assert(/NONE STAMPED ⇒ treat as blocking/.test(cardSource), 'the card no longer renders the fail-closed NONE STAMPED token');
  assert(/never\s+discharge from a leg reviewer's approval/.test(d4Text), 'D4 lost the leg-reviewer prohibition');
  assert(/both QUOTED/.test(d4Text), 'D4 lost the both-values-quoted requirement');
});

console.log(`\n${'─'.repeat(50)}`);
console.log(`✅ Passed: ${passed}`);
if (failed > 0) {
  console.error(`❌ Failed: ${failed}`);
  process.exit(1);
}
console.log('✅ All pov-program containment-taxonomy tests passed!');
