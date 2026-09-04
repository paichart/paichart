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
  assert(/REFUSED or DROPPED[\s\S]{0,80}BLOCKING/.test(taxonomy),
    'the refusal/drop guarantee is gone: a leg that harvested a pool and emitted no derivation must block (VT-11 collision refusal, run-2/3 dropped block)');
  assert(/regardless of anything upstream/.test(taxonomy),
    'the upstream-irrelevance marker is gone — a downstream deriving leg that refuses HAS a clean in-edge, so an edge-aware rule would clear it wrongly');
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
    'the CONSUMING LEG exception leaked into the no-derived-values-block clause — a refused collision would then read benign');
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
  assert(/no predecessor carries any violation/.test(taxonomy),
    'the ALL-predecessors rule is gone — with "at least one" semantics a clean sibling could mask a predecessor carrying a violation');
});

test('INVARIANT 4: fails CLOSED, and does not send the gate to parse the plan or infer from counts', () => {
  assert(/ABSENT or \\`green\\` is false, the reason stays BLOCKING \(fail closed\)/.test(taxonomy),
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
    'PRESENT-means-blocking is gone: a leg that harvested a pool and emitted no derivation REFUSED or DROPPED (VT-11 / run-2/3) and must block');
  assert(/\*\*ABSENT\*\*[\s\S]{0,200}benign/.test(taxonomy),
    'ABSENT-means-benign is gone: a leg that harvested no pool had nothing to derive');
  assert(/absent ≠ 0/.test(taxonomy),
    'the absent-vs-zero distinction is gone — harvestedCount:0 means the block PARSED and the pool was empty, so the leg still harvested and is still deriving');
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

// ── Summary ─────────────────────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`✅ Passed: ${passed}`);
if (failed > 0) {
  console.error(`❌ Failed: ${failed}`);
  process.exit(1);
}
console.log('✅ All pov-program containment-taxonomy tests passed!');
