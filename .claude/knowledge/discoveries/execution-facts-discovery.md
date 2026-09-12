# Execution Facts Discovery

> **Last Updated**: 2026-09-11 · **Status**: ACTIVE · **Last Validated**: 2026-09-11 (creation —
> every grep below was RUN and its count written from the measured result, per Protocol 11 Part C)
>
> **Paired specialist**: `.claude/agents/execution-facts-specialist.md`
> **Split from**: `pipeline-harness-discovery.md` (SPECIALIST-LIFECYCLE-GUIDE §3b, 2026-09-11). The
> 2026-08-16 cross-port, 2026-08-23 dialect-lint and 2026-07-17 derivation-containment blocks MOVED
> here — they are not duplicated in the parent discovery.

## Overview

This discovery covers how **facts on an execution are PRODUCED** — the mechanical nets, their
enrichment modules, the whitelist that decides what survives to a consumer, and the replay tooling
that makes all of it observable without a 30-50 minute program run.

A "fact" here is a Protocol-10 fact: a stamped, verifiable statement about what the platform
measured (`derivationContainment`, `dialectLint`, `markerPresence`, `contractPropagation`), never a
judgement about the leg's outcome. The **consumption** side — gates, `programReleasable`, verdict
wiring, protocol semantics — belongs to `pipeline-harness-specialist`. The **fact schema is the
contract** between the two domains: this discovery owns everything up to and including the stamp;
the harness owns everything that reads it.

Four facts are wired today; the shared **net registry** does not exist yet (rule of three fired —
see the tripwire greps). The stamping order and the whitelist are the two places where a correct
producer silently becomes an invisible one.

## When to Run This Discovery

- Adding or changing a mechanical net (a new `kind`, a new violation class, a new net entirely)
- Touching `RESULT_JSON_SUMMARY_KEYS`, `pickResultJsonSummary`, or any field nested under a
  whitelisted fact (the E3b nesting law)
- Changing a disposition taxonomy (`computeContainmentDisposition` and its benign allowlist)
- Changing what the lean card's `**Facts:**` line renders
- Building the shared net registry, or generalising the containment-kind toolkit to adding-a-net
- Investigating "the gate ignored the fact" — it is almost always the stamp→render→gate seam
- Before ANY corpus-measurement of a proposed violation class (the practice this domain stewards)

---

## Run These Greps FIRST

All counts below were measured on 2026-09-11. A mismatch IS a finding (Protocol 11 Part C) —
investigate before assuming backlog.

### A. Fact inventory — what exists, and where it is stamped

```bash
ls lib/agents/harness/derivation-containment.ts lib/agents/harness/derivation-containment-enrichment.ts lib/agents/harness/dialect-lint.ts lib/agents/harness/dialect-lint-enrichment.ts lib/agents/harness/marker-presence.ts lib/agents/harness/contract-propagation-enrichment.ts lib/agents/harness/rollback-containment.ts lib/agents/harness/rollback-containment-enrichment.ts | wc -l   # expect 8 — re-measured 2026-09-11 (was 6; +2 for net #3 rollback-containment, pure + enrichment). The producer modules. Pure checker + impure enrichment for the three big nets; marker-presence is pure-only (synchronous, no DB read); contract-propagation is enrichment-only
grep -c "computeDerivationContainmentFact\|computeDialectLintFact\|computeContractPropagationFact\|computeMarkerPresence" lib/services/execution-core.ts   # expect 0 — ⚠️ READ THE ZERO CAREFULLY, it INVERTED on 2026-09-12 (stage 2b) and a zero here used to mean the opposite of what it means now. It was 9 (the ONE hand-wiring file) and the REGISTRY replaced every hand-wired call: execution-core no longer names a single enrichment. Zero is now the HEALTHY state and non-zero means a net has been re-inlined beside the loop, i.e. a migration half-landed. The property is asserted, not just counted, by test-marker-presence.ts ("execution-core stamps THROUGH the registry and re-inlines no net of its own")
grep -c "^export function" lib/agents/harness/derivation-containment.ts   # expect 12 — the pure surface (parsers, per-kind checks, disposition, usage check). It is a pure module by contract: no prisma, no logger, text in / fact out
grep -c "^export function" lib/agents/harness/dialect-lint.ts   # expect 7 — re-measured 2026-09-11 (was 5): +fencedBlockLines and +isSeparatorLine, both exported for net #3 so it consumes THE classifier instead of forking a second rollback extractor. runDialectLint plus the extractors shared with contract-propagation-enrichment (a change to what counts as a required line reaches BOTH consumers)
grep -c "^export function" lib/agents/harness/marker-presence.ts   # expect 2 — H-4 (2026-09-10), the newest fact: which machine-parsed blocks the platform found
grep -c "blockKinds" lib/agents/harness/dialect-lint.ts   # expect 7 — the block classifier ({candidate-config, rollback, expected-output, command, harvested-state}).
grep -c "restoreIntent" lib/agents/harness/dialect-lint.ts   # expect 6 — added 2026-09-11 with net #3. ⚠️ READ WHY IT IS A SEPARATE AXIS AND NOT A `kind`: for dialect-lint, `rollback` and `harvested-state` are both simply exempt from the scan, so the precedence between them is arbitrary and the file says so. For rollback-containment that precedence DECIDES the answer, and measured on the live R19-P4 package it goes the wrong way — the rollback preamble says "harvested", so one of three device blocks lands `harvested-state` and a `kind === 'rollback'` filter sees 34 restore lines instead of 51, position-dependently. restoreIntent reads the heading ANCESTRY, which does not split
grep -c "^export function" lib/agents/harness/rollback-containment.ts   # expect 5 — net #3's pure surface: scopeRestoreLines (the classification), checkRollbackContainment (trimmed-exact-line membership), computeRollbackDisposition, isCommentLine, isDesiredStateLane (the lane predicate, 2026-09-11). AUTHOR_LEAF_ROLE_RE, DESIRED_STATE_LANES and ROLLBACK_SCOPE_NOTE are consts and do not count here. The §6 RENDER is deliberately NOT here — it lives in render-rollback-containment.ts (H3, 2026-09-11), split along the ownership seam (prompt prose vs predicate) rather than co-located like renderMarkerPresence; the module header states why
grep -c "computeRollbackContainmentFact\|hoistRollbackContainment" lib/agents/harness/mechanical-nets.ts   # expect 4 — re-homed and re-measured 2026-09-12 (the import pair plus one call each). Net #3 is wired at TWO POINTS, and the registry expresses that as two entries keyed (name, point) under ONE name with different enrich halves — compute at the Author leaf persist, hoist at the leg SYNTHESIZE. That shape is what appliesTo had to support and is pinned by R8 in test-net-registry.ts
```

### B. The whitelist and the E3b nesting law

```bash
grep -c "RESULT_JSON_SUMMARY_KEYS" lib/services/execution-artifacts.ts   # expect 3 — the definition plus its uses. This is a STRICT whitelist: an unlisted key is dropped with no error, so a new top-level sibling of a fact is silently stripped and reads ABSENT at the gate
grep -c "test('E3b" scripts/test-execution-artifacts-parity.ts   # expect 3 — re-measured 2026-09-11 (+E3b-2 rollbackDisposition inside rollbackContainment, +E3b-3 contractApplicability inside BOTH dialectLint and contractPropagation). The nesting pins: a disposition survives the pick because it rides NESTED inside its fact; a top-level SIBLING is stripped. Each is mutation-verified in BOTH directions (nested survives / promoted is dropped), and each new fact carrying a sub-object needs its own — the trap does not generalise for free
grep -rln "pickResultJsonSummary" lib/ scripts/ | wc -l   # expect 9 — re-measured 2026-09-12 (was 7): +net-registry.ts and +net-context.ts, both E3b notes rather than new consumers. Any new consumer must be added deliberately; the hoist is where a nesting mistake becomes invisible
```

**Reviewer checklist — adding a field to any fact**

1. Is the new field **nested inside** an already-whitelisted fact, or is it a new top-level key
   deliberately added to `RESULT_JSON_SUMMARY_KEYS`? Those are the only two legal shapes. A sibling
   of a whitelisted key is the recurring trap (`markerPresence` is a legitimate top-level addition;
   `containmentDisposition` is a legitimate nesting).
2. Does a pin exist for the direction you chose? E3b pins nesting; the whitelist entry pins
   top-level. An unpinned choice regresses silently.
3. Does the field **render** anywhere a consumer reads (see section C)? A field that is stamped and
   whitelisted but unrendered is present in the artifact and absent at the gate.

### C. The stamp → render → gate seam (where the defects actually live)

```bash
grep -c "derivationContainment\|markerPresence" lib/mcp/server/tools/advanced/lean-card-facts.js   # expect 8 — the two facts the lean card's **Facts:** line renders today
grep -c "rollbackContainment" lib/mcp/server/tools/advanced/lean-card-facts.js   # expect 4 — net #3 renders from the FIRST commit that stamps it (§5.1 convention, ruled 2026-09-11: a net ships with its render or with a recorded reason for having none, never through a stamped-and-invisible interval). ⚠️ NO `ABSENT` token for this fact, deliberately — while it gates nothing, ABSENT means "not yet produced" (an Author predating the net, or a leg mid-flight across the deploy) and a blocking-flavoured token would be FALSE. If it ever becomes a gate conjunct, ABSENT must flip to fail-closed in the SAME commit
grep -c "dialectLint\|contractPropagation" lib/mcp/server/tools/advanced/lean-card-facts.js   # expect 11 — ✅ THE GAP IS CLOSED (stage 2b, 2026-09-12) and this expectation FLIPPED IN THE SAME COMMIT that closed it, which is the point of recording the flip in advance: a stale expect-zero here would have made audit-discovery-greps.sh report a REGRESSION on a gap we deliberately closed — a checking tool made to lie about a success. Both facts were stamped and whitelisted from 2026-08-25/26 and rendered on NO card line for two and a half weeks, green at every layer in isolation because a fact written correctly and read by nobody is the A1/F7 class. The symbol-free-prose rule that the old zero-expectation depended on is now RETIRED for these two identifiers — they are rendered, so naming them is honest. Pinned by DL1-DL3/CP1-CP2 in test-lean-card-facts.ts (the READ half) and by R5b in test-net-registry.ts (the WRITE half: a net may not CLAIM a card render it does not have)
grep -c "contractApplicability" lib/mcp/server/tools/advanced/lean-card-facts.js   # expect 3 — measured 2026-09-12. It rides NESTED inside both facts above (E3b) and renders as their QUALIFIER, never as a fact of its own: a standalone pipeline has no Program Interface Contract BY DESIGN, and a reader told only "no-contract" grades it as a gap (9 of 37 archived legs did exactly that). Pinned by CA1
npm run test:lean-card-facts   # the coupling suite: it asserts the enrichment's WRITE site and the card's READ site stay paired. Neither file was wrong in isolation for the 2026-08-03 A1 defect; the PAIRING was, and nothing tested it
```

**Reviewer checklist — the seam**

- For every field the change touches, ask: *on which branches is it STAMPED, and on which branches
  is it RENDERED?* If those sets differ, the field is invisible exactly where it is stamped (A1,
  2026-08-03: `violations` rendered only on `checked:true` while `consumed-value-mismatch` stamps
  only on `checked:false` — structurally unrenderable, inert from the day it shipped).
- Render **WHAT, not just HOW MANY**. A bare count tells a reasoner something is wrong and denies it
  the subject (F7: Node C, told to verify an uncovered derivation, verified the nearest thing and
  reported "nothing anomalous").
- **Absence needs a positive token.** Every segment of the Facts line is conditional, so a missing
  field prints nothing and reads as clean (`… ABSENT ⇒ treat as blocking`).
- Answer these by **running something**, not by reading the file that writes it.

### D. Replay — observability without a run

```bash
ls scripts/replay-*.ts | wc -l   # expect 5 — re-measured 2026-09-12 (+replay-nets, the SHARED runner: it iterates the REGISTRY against one task and prints what every applicable net would stamp, plus the rendered card line, plus — deliberately — the nets that do NOT apply, because a silently skipped net is the state this domain exists to make impossible and a runner that prints only the hits reproduces it at the tool layer. The three per-net runners REMAIN and are not redundant: replay-containment --chain re-runs the real CHAINER, which is not a net concern. Each runs the SHIPPING code against a completed leg, read-only, in seconds
```

The replay runners exist because three defects shipped while the containment logic was reachable
only by a full program run (rig rebuild, 30-50 min, human gates) and was therefore "verified" by
reading source. **Replaying a copy would reproduce the original mistake** — a runner must import
the shipping function, never reimplement it. Specimens named in each runner's header are the
regression corpus: always use MORE THAN ONE, because the reason string varies per run for the same
leg type.

### E-pre2. Contract applicability — computed ONCE, nested on TWO facts (2026-09-11)

A standalone pipeline has NO Program Interface Contract by design, so `dialectLint.reason:
'no-contract'` and `contractPropagation.reason: 'no-contract-on-leg'` cannot be told apart from
"expected and missing" without re-deriving the tier. Reviewers graded that by-design absence as a
gap on **9 of 37** archived standalone legs — and **4 of 4** on 2026-09-11, i.e. it is becoming
universal. A false gap teaches a reader to skim the real ones.

```bash
grep -c "contractApplicability" lib/agents/harness/net-context.ts   # expect 2 — RE-HOMED 2026-09-12 (it was 4 mentions in execution-core; here it is the memo field plus its method, i.e. the MECHANISM rather than a mention count — the drift class this file has replaced elsewhere). It is a memoized ctx DERIVATION, not a net: it owns no resultJson key, so modelling it as a net would force inventing a top-level SIBLING of the two facts it belongs inside, which pickResultJsonSummary silently strips (E3b — the trap reached by way of an abstraction). THE GENERAL RULE, stated so it is not re-argued: a derived value consumed by 2+ nets goes on ctx; a derived value with its own whitelisted key is a NET; a value nested on exactly one fact stays private to that net
grep -c "export async function findProgramParentForStage" lib/agents/harness/program-protocol.ts   # expect 1 — THE F12 lookup, extracted 2026-09-11 from prepare-task-for-execution when a second consumer appeared. Its AND-lift is load-bearing and travels with it: the stage filter and the protocol filter are BOTH `metadata` filters, and two `metadata` keys in one object literal is last-writer-wins, matching every program harness in the POV
```

⚠️ **EXTRACTING A QUERY MOVES WHAT ITS PINS POINT AT.** This extraction broke TWO independent drift
guards (`test:cc7-contract-guard` B1.2 and `test:program-protocol-token`'s F12 DRIFT GUARD), both of
which asserted the AND-lift lived in `prepare-task-for-execution.ts`. That is the pins WORKING —
they guard a property, and the property moved house. Both were retargeted to the new home and given
a second assertion that every call site CONSUMES the lookup rather than re-inlining it. Expect this
whenever a shared helper is extracted; budget for it rather than being surprised.

⚠️ **A PROGRAM ROOT NEVER REACHES THIS CODE** — `programTier` short-circuits it to
`reason: 'program-tier'` first, so `expected:false` can only mean STANDALONE. Measured: program
roots say the reviewer sentence 0 times in 39. **Source-true but UNOBSERVED in prod** (every
archived program root predates H-3), so it is pinned by test, not asserted.

### E-pre. Arm precedence in an enrichment (ruled 2026-09-11)

A net's arms are checked in an ORDER, and the order decides which true statement a reader gets.

```bash
grep -n "LANE CHECK, AND IT RUNS BEFORE THE CONTENT ARMS" lib/agents/harness/rollback-containment-enrichment.ts   # expect 1 — lane-first. A claim about the PLATFORM's scope (`lane-not-supported`) outranks a claim about the PACKAGE (`no-restore-blocks`), because the first holds regardless of content and the second misleads when it does not: it implies that adding a restore block would get an HCL leg adjudicated, and nothing in that lane ever is. Found by the first live kubernetes-gitops leg, whose procedural rollback stamped the content reason
grep -c "^test('ARM-" scripts/test-rollback-containment.ts   # expect 4 — the precedence pins. ⚠️ THEY EXIST BECAUSE NOTHING ELSE COVERS THE ENRICHMENT: every other assertion in that suite exercises the PURE module, so when the precedence was wrong the whole suite stayed green and the defect was only visible in a live stamp. The enrichment imports Prisma as a TYPE only, so a stub client pins arm ordering with no DATABASE_URL
```

⚠️ **When reordering arms, check which ones are in the benign ALLOWLIST.** Hoisting the lane test
was safe; hoisting `no-child-stage` with it would have flipped a stage-less package from benign to
BLOCKING, because that reason is not on the allowlist and falls through to `hard-gap`. Reordering is
never purely cosmetic in a fail-closed taxonomy.

### E. Build tripwires — these flip when scheduled work lands

```bash
grep -rn "MECHANICAL_NETS\|netRegistry\|registerNet" lib/ scripts/ | wc -l   # expect 23 — ✅ THE TRIPWIRE FIRED AND THE REGISTRY LANDED (stage 2b, 2026-09-12). Its former text carried a zero-expectation and promised that a non-zero result meant the registry had shipped and this discovery, the toolkit and the specialist config all needed the same-commit update; it did, and they were. (The old expectation is DESCRIBED rather than quoted: a literal zero-expectation inside prose is read by audit-discovery-greps.sh as a live expectation, which is how three earlier lines in this file reported false REGRESSIONS on their first pass.) lib/agents/harness/{net-registry,mechanical-nets,net-context}.ts plus the pins, the equivalence gate and the shared replay runner
grep -rln "rollbackContainment" lib/agents/harness/ | wc -l   # expect 6 — re-measured 2026-09-12 (was 4): +mechanical-nets.ts (both registry entries) and +net-registry.ts (the two-invocation-points rationale in the StampPoint doc). The pure module names its types RollbackContainment* and does not carry the camelCase field name, so it still does not count
```

---

## The corpus-measure standing practice (this domain stewards it)

**Before any proposed violation class reaches a panel, MEASURE IT AGAINST THE CORPUS**: pull the
relevant artifact population and count real occurrences plus naive false positives. A
violation-class proposal without a corpus measurement is not evidence — it is a hypothesis.

Two reversals, both of which would have shipped a false-positive machine:

- **2026-08-19 (crosscheck panel, arch R7)** — a 34-package pull-and-compare took an hour and
  REVERSED the brief's implied frequency: the motivating class had **zero** instances, and a naive
  comparator flagged **62%**.
- **2026-08-31 (R19 P4 rollback-verbatim)** — 56 packages, **zero** true fabrications, and the
  motivating incident itself exonerated 51/51. The proposed blocking leaf was closed, not built;
  what survived was the FACT-shaped residual whose value is **exoneration**, not detection.

That inversion is itself an open design question: `adding-a-net-toolkit.md` Step 0 is
written for defect-catchers, and a leaf whose proven value is refuting a false suspicion does not
fit Path 1 as worded. The panel must rule whether exoneration-value counts as Path 1 or the rule
needs a named third path. Do not resolve it silently in a build.

---

## Adding a net / adding a kind

The execution toolkit is `.claude/knowledge/pipelines/adding-a-net-toolkit.md` — Step 0
(earn it), Step 0b (sweep the standing rules), Step 1 (design decisions before code, incl. relation
DIRECTION, which inverted between `cidr` and `asn`), Step 2 by layer, **Step 3 (prove every "no
change required" prediction** — v2 went 0-for-3 and each miss was a real defect), Step 4 (live
validation in two separable halves: passing direction and blocking direction are NOT the same
result), Step 5 (done).

✅ **RENAMED AND GENERALISED 2026-09-12** with the registry (stage 2b) — the deferral it carried was
honoured exactly as recorded, one 13-file sweep instead of two. **Adding a net now means adding a
REGISTRY ENTRY**, not wiring a call site: pick the `point`, write `appliesTo` as an INVOCATION
predicate only, decide BOTH render slots or record why one is null, and add the name to
`RESULT_JSON_SUMMARY_KEYS` — registering and whitelisting are two different acts.

⚠️ Its own Step 0 warning applies to the registry too: **"it proves the framework is generic" is
not an earning justification.**

### Suites a new net or enrichment must run (NOT all of them are in the harness pinned set)

```bash
npm run test:derivation-containment && npm run test:dialect-lint && npm run test:dialect-lint-enrichment \
  && npm run test:rollback-containment && npm run test:marker-presence \
  && npm run test:lean-card-facts && npm run test:execution-artifacts-parity
npm run test:containment-public-parity   # ONLY when the mirrored pure module changed
npm run validate:pagination              # ⚠️ SEE BELOW — not in the pinned set, and it is a DEPLOY GATE
bash scripts/audit-discovery-greps.sh    # every documented expectation this file states
```

⚠️ **`validate:pagination` is a 90% CI DEPLOY GATE running at the margin, and it is NOT in the
harness pinned suites** — so a new enrichment can be fully green locally and still block an
unrelated deploy. That is not hypothetical: on 2026-09-11 two new stage-children reads in
`rollback-containment-enrichment.ts` took coverage to **89.6%** and blocked deploy `34550802714`,
and the margin had already been eaten by PRE-EXISTING bare reads in
`derivation-containment-enrichment.ts` and `dialect-lint-enrichment.ts`. Because it is a
percentage-of-corpus gate, the cost of an unbounded query lands on whoever deploys next, not on
whoever wrote it.

**Every `prisma.task.findMany({ where: { stageId } })` in this domain carries
`take: STAGE_CHILD_SCAN_CAP = 50`** (`CHILD_SCAN_CAP` in contract-propagation — same value, older
name). Safe by ORDERING, not by luck: harvest/author children are earliest-created in protocol
phase order, so `orderBy createdAt asc` + the cap cannot drop the children these functions resolve.
Pattern: `.claude/knowledge/patterns/pagination-safety-cap-pattern.md` (registry #40).

⚠️ **CORRECTION to the above, 2026-09-11 (same day it was written — it was too absolute).** "Cap
every stage-children read" is the right default and the WRONG universal rule. **A read whose ANSWER
depends on completeness must be ALLOWLISTED, not capped**, because a cap there does not truncate the
result — it silently produces a DIFFERENT ANSWER. Worked example, allowlisted in
`scripts/validate-pagination.ts` (`a7e4a81f`): `lib/services/harnessModeResolver.ts` counts ALL
stage children to decide terminal-ness (total vs terminal), so a cap would resolve SYNTHESIZE off a
partially-counted stage. Same class as `lib/utils/graph.ts`'s topological sort, which the allowlist
already carried.

**The test before you add a `take`**: does the caller SEARCH the rows (find one child by role — cap
it, ordering makes the cap safe) or does it AGGREGATE over them (count, compare, sort — allowlist it
with a reason)? Every read in this domain is a search, which is why the cap is right *here*; the
next one might not be. An unbounded read is a coverage number, but a wrongly-capped aggregate is a
wrong answer, and only one of those is loud.

```bash
grep -c "STAGE_CHILD_SCAN_CAP\|CHILD_SCAN_CAP" lib/agents/harness/*.ts | grep -v ":0" | wc -l   # expect 6 — re-measured 2026-09-12 (was 4): +net-context.ts (ctx.children()) and +net-registry.ts (the SEARCH-vs-AGGREGATE warning on it). ⚠️ THE FOUR ENRICHMENTS STILL HOLD THEIR OWN COPIES AND THEIR OWN QUERIES — ctx.children() is available to NEW nets but the existing four were deliberately NOT rewired, because each selects a different column set and a select change is provable by the equivalence gate only on the shapes present in the ARCHIVE. Converting them is its own separately gated change, not a migration side effect
```

✅ **RESOLVED `a7e4a81f`** (2026-09-11) — the two bare stage-children reads outside this domain that
this file previously listed as open handovers, and they got OPPOSITE treatments for the reason
above: `verdict-mismatch-guard.ts` is a SEARCH (finds the reviewer by role among siblings) and was
bounded `take: 50`; `harnessModeResolver.ts` is an AGGREGATE and was ALLOWLISTED with its reason.
Gate now **91.1%**, and `validate:pagination` flags NO read under `lib/agents/harness/`.

---

## Incident fixtures — the regression corpus

Fixtures are LIVE campaign text, not synthetic. That is the point: a net's key predicate must be
pinned against a **live artifact shape**, not only hand-authored fixtures (the wiring of dialect-lint
found `extractBannedTokens` matching `/banned/i` only, while the live Program Architect emits
`platformDialect.forbiddenTokens` — zero tokens on every real contract, a named reason gating
nothing while appearing wired).

- `scripts/test-derivation-containment.ts` — incident fixtures for every violation class, incl. the
  misaligned-prefix F-1..F-7 set whose `.9/.10` NEGATIVE assertion is the load-bearing pin
- `scripts/test-dialect-lint.ts` — R1/R3 defect packages plus the R6 CLEAN winner (the
  false-positive trap: it names every banned token in prose and must return zero)
- `scripts/test-execution-artifacts-parity.ts` — E3b, field ORDER, whitelist behaviour
- `scripts/test-lean-card-facts.ts` — the write-site/read-site coupling assertions
- `scripts/test-rollback-containment.ts` — net #3 (BUILT 2026-09-11, stage 2a), 18 assertions over
  FIVE live packages, all pulled from prod and stored under
  `scripts/fixtures/rollback-containment/` with a PROVENANCE.md naming every source task:
  R19 P4 (51/51, 0 missing — the refused package, exonerated) · R3a-3 (2/2, the excerpt lane) ·
  R3b-2 (26/26, the whole-file lane; also the BLOCKING-direction mutation source) · FW-A3.3 R3
  (0 restore lines, all `inverse-rollback-block`) · **June k8s (the (a)-lane NON-SUPPRESSION
  fixture — 0 restore lines; its reviewer was RIGHT and this fact must contribute nothing).**
  ⚠️ The non-suppression test is MUTATION-PROVEN, not asserted: it constructs a greedy variant of
  the predicate and fails if that variant would NOT have scoped anything. A non-suppression guard
  that cannot fail is not a guard

**Mutation-verify every assertion.** Break the invariant and confirm *that* test fails. If a
mutation produces no output it did not compile, which proves nothing — use a mutation that compiles.

---

## Domain history — the blocks that moved here from pipeline-harness-discovery

These three blocks carry proven greps and are audited by `scripts/audit-discovery-greps.sh`. They
moved wholesale on 2026-09-11 (§3b split) and are NOT duplicated in the parent discovery.

## 🆕 2026-08-16 — cross-port ①: disposition reclassified + cross-domain evidence contract + PUBLIC MIRROR

The `no-derived-values-block` arm of `computeContainmentDisposition` was restructured for harvest
blocks becoming a CROSS-DOMAIN contract (terraform-iac v1.2.0 ports the full producing-side
Derivation-evidence set; the marker is no longer network-only). Panel + live validation:
`cline_docs/reviews/protocol-cross-port-2026-08-16/{SYNTHESIS.md, STEP3-VALIDATION-RUN.md}`.
```bash
grep -n "consuming-leg-consumed-discharged\|harvested-pool-no-derivation-cannot-decide\|harvested-pool-empty" lib/agents/harness/derivation-containment.ts | head -4
# EXPECT all three NEW reasons. Arm order inside no-derived-values-block (fail-closed at each step):
#   consumed+green:true ⇒ benign consuming-leg-consumed-discharged (Shape B — Tasman false-park closed)
#   consumed+green:false ⇒ blocking consuming-leg-upstream-not-green
#   harvestedCount > 0 ⇒ needs-node-c harvested-pool-no-derivation-cannot-decide (WAS blocking 'refusal-or-drop' — ambiguity audit-vs-refusal; escalate, don't decide)
#   harvestedCount == 0 ⇒ benign harvested-pool-empty (parsed-empty pool has NO refusal ambiguity — live-proven Run 20260816-0734: tf bucket objective, byte-exact)
#   absent ⇒ benign nothing-to-derive (unchanged)
grep -c "out('blocking', 'refusal-or-drop')" lib/agents/harness/derivation-containment.ts   # expect 0 — the EMITTING call is gone (the string survives in the reclassification comment, so a bare-string grep hits 1); a reappearance of the call is the reclassification reverted
npm run test:derivation-containment   # EXPECT 94 — re-measured 2026-08-21 (+7 misaligned-prefix fixtures F-1..F-7, d546d55d; was 87: D4 rewritten + D4b-f: discharge, fail-closed x2, clause-1 dominance, zero-pool)
```
⚠️ **TWO-REPO OBLIGATION**: `derivation-containment.ts` is mirrored byte-identically as the public
`@paichart/containment-checks` package (`~/paichart/packages/containment-checks/`, v0.2.1). EVERY edit:
canonical → re-copy → package suite → version bump → push both. `npm run test:containment-public-parity`
enforces (fails naming the first divergent line; skip-loudly when ~/paichart absent).
Protocol versions after 2026-08-16: network-provisioning **1.3.1** (secret-hygiene clause),
kubernetes-gitops **1.2.0** (baseline-scoped drift, seeded-UNVALIDATED), terraform-iac **1.2.0**
(Derivation-evidence port — benign path live-validated; deriving path + consuming discharge + Shape-A
still unexercised live). Device spec gained §6.5 denial-channel MUST (protocol port stays deferred).

## 🆕 2026-08-23 — dialect-lint mechanical net (✅ PHASE 2 WIRED + LIVE-PROVEN 2026-08-25, first run/first catch)

**LIVE PROOF (IGP-T1 R11 P1, 2026-08-25)** — it caught a package its own reviewer approved at 86/100,
zero blocking issues. PRESENCE half: `address-family ipv4 unicast` and `isis network point-to-point`
absent (zero occurrences in the document). Impact verified ON-DEVICE, not asserted — the stanza as
authored yields `% IS-IS (ISIS-1) is disabled because: IS-IS address family configuration is not
present`, i.e. config that enters, commits and displays while the protocol stays OFF (R7's defect).
ABSENCE half returned 0, correctly. `blockKinds {candidate-config:20, rollback:14,
expected-output:13, command:8}` — classification working on real data.

⚠️ **The finding that should change how you AUDIT this area — as CORRECTED 2026-08-26.** The first
reading was: the exemplar was present, complete and BINDING in the contract with an explicit
transcribe instruction, the author dropped two lines anyway, so FOUR prose guards (protocol rule,
role guidance, exemplar, reviewer) were all bypassed by one omission. **That was wrong about the
exemplar.** The contract was binding on the LEG and never delivered to its CHILDREN: the author's
brief carried a paraphrase missing 7 of the exemplar's 10 lines (the reviewer's, 9 of 10), and the
hole was universal — 7 of 7 archived legs lossy, 0 of N children ever holding the contract. Fixed by
contract inheritance (806501a2) + the orchestrator base no-restate rule (v3.13.0).

✅ **RESOLVED 2026-08-26 (IGP-T1 R12).** The delivery hole is fixed — `inheritInterfaceContractIfAbsent`
at `prepare-task-for-execution.ts` backfills a non-PIPELINE child from its qualified owning leg.
Live result: **4 of 4 children on every leg held the contract, 0 canonical lines missing, 0 device
rejections across four legs applied verbatim** (R11: 0 of 4, 2 lines missing). Verify any leg with
`npm run replay:contract-propagation -- <legTaskId>` (default gate is now the POST-fix expectation;
`--pre-fix` reproduces the original).

⚠️ **Two axes still apply, and axis 1 now has a THIRD tier to check** — inheritance stops at the LEG.
**Node C (program tier) still holds no contract**, because its parent is the program root, which never
carries one (the Architect *creates* it). A program-tier reviewer asked to verify contract conformance
will correctly grade ACCEPTED-FROM-CLAIMS. Do not read that as a reviewer failing to check.

**So audit on TWO axes, in this order:**
1. **Is the guard PRESENT in the prompt?** "Binding" is a property of a document; "present" is a
   property of a prompt, and they drift apart silently. An ABSENT guard and a DISOBEYED guard produce
   identical evidence, and mistaking the first for the second argues for the wrong fix — write the
   prose harder — while the real defect is delivery. Verify presence before theorising about the model.
   Instrument: `npm run replay:contract-propagation -- <legTaskId>` reports, per child, whether it
   holds the contract and which canonical lines its brief lost.
2. **Does the guard READ?** Only once presence is established does the prose-vs-mechanical lesson
   apply — and it still holds: every prose guard in this domain has failed at least once; every
   mechanical one has held. The reviewer here DID carry the complete rule and still approved at 86/100.

The SECOND mechanical net, sibling to derivation-containment, earned the same way: a prose contract
failing on a second axis. IGP-T1 R1 shipped `is-type level-2-only` + `metric-style wide` (IOS-isms on
an Arista EOS target) past an APPROVING reviewer and was refused at the operator's config-session
apply; R3 then RE-EMITTED `metric-style wide` past an interface contract that explicitly banned it.
Prose guards lost twice; the check moved to code (`lib/agents/harness/dialect-lint.ts`).

🔴 **STATUS — read before citing it as a guard: PHASE 1 = pure module + fixtures ONLY. It is NOT
called from the engine, emits no fact, appears on no card, and has NEVER run against a live
execution.** Phase 2 (wiring beside derivation-containment enrichment in execution-core, a nested
fact, artifact-parity pins) is open: `cline_docs/follow-ups/igp-t1-campaign-followups-2026-08-23.md`
item 2. Do not describe it as protecting a run until grep C below returns non-zero.

Design notes that matter when wiring it: it scans **fenced code blocks ONLY** — prose is exempt BY
DESIGN, because requirements/contracts legitimately NAME banned tokens when stating the rules (R6's
clean winner names all three in prose and must return zero violations; that case is fixture-pinned).
Token matching uses word-ish boundaries so a token `is` never fires inside `isis`. It returns a FACT
(checked/reason/tokensConsidered/violations), never a verdict — absence is a NAMED reason
(`no-contract` / `no-banned-token-list` / `no-fenced-blocks`), never a silent pass.

```bash
npm run test:dialect-lint                                                   # expect 64 — ⚠️ CORRECTED 2026-09-11, and the correction is the finding: the documented value had been 27 since 2026-08-24 while the suite had grown to 64, and NOTHING CAUGHT IT because audit-discovery-greps.sh audits GREPS, not `npm run` lines — so this expectation sat unverified for two and a half weeks across several commits that added fixtures. Verified against HEAD before AND after the net #3 build (64 both times), so the number is the suite's real size, not a side effect of that work. Same class as the silent-exclusion bug the audit script itself had: an expectation nothing runs degrades to decoration. Prior notes: 27 at 2026-08-24 (was 16; +11 PRESENCE-half fixtures on the live R7 package, mutation-verified), 2026-08-23. Fixtures are LIVE campaign text: R1/R3 defect packages + the R6 CLEAN winner (the false-positive trap: it names every banned token in prose)
grep -c "^export function" lib/agents/harness/dialect-lint.ts               # expect 7 — re-measured 2026-09-11 (was 5; +fencedBlockLines +isSeparatorLine, exported so net #3 consumes THE classifier rather than forking a second rollback extractor). Prior: 2026-08-26 (was 3): runDialectLint + extractBannedTokens + extractCanonicalStanzas + canonicalStanzaNeedles (shared with contract-propagation-enrichment, so a change to what counts as a required line reaches BOTH consumers) + splitStanzaLines (separator tolerance, IGP-T1 R12). The two extractors are exported so the wiring layer and tests can reuse the contract-shape-tolerant extraction (contracts have used bannedTokens/banned_token_list and canonicalIsisStanza/canonicalStanza_P1_template/canonicalStanzaExemplar across rounds)
grep -rn "runDialectLint" lib/ --include="*.ts" | grep -v "lib/agents/harness/dialect-lint.ts"   # expect 4 — re-measured 2026-08-25: PHASE 2 LANDED and this tripwire FIRED exactly as written. All 4 hits are dialect-lint-enrichment.ts (import + call + 2 comment refs); the engine call site is execution-core.ts, which calls computeDialectLintFact, not runDialectLint directly. Its former text was a zero-expectation tripwire promising that a non-zero result meant Phase 2 had landed and every "it gates nothing" claim in this section and the specialist config was stale — it did, they were, and both were corrected the same day. (The old expectation is described here rather than quoted: a literal expect-N string inside prose is read by audit-discovery-greps.sh as a live expectation, which is how this very line reported a false REGRESSION on its first pass.) SECOND time in two days a documented grep predicted its own obsolescence and the audit caught the drift
grep -c "fencedBlockLines" lib/agents/harness/dialect-lint.ts               # expect 3 — re-measured 2026-09-11 (was 2): definition + its call site + the `export` that lets net #3 consume THE classifier instead of forking a second rollback extractor. The prose-exemption mechanism (a whole-document scan would flag the clean round)
grep -c "export interface TranscriptionCheck" lib/agents/harness/dialect-lint.ts   # expect 1 — the PRESENCE half (2026-08-24, earned by IGP-T1 R7: a banned-token-CLEAN package omitted one canonical stanza line; config entered, committed and displayed cleanly while the protocol stayed DISABLED; reviewer approved 90/100 because an absence check runs the opposite direction)
grep -c "check:package" package.json                                        # expect 1 — the OPERATOR-side runner (scripts/check-package-against-contract.ts). Puts BOTH halves at the gate today without engine wiring; verified to exit 1 and name the omitted line on R7's real artifacts
grep -c "kind === 'candidate-config'" lib/agents/harness/dialect-lint.ts   # expect 2 — BOTH halves scope to candidate-config. Replaced a `rollback|expected output` word-count on 2026-08-29: that counted PROSE about the classification, not the classification, so it drifted every time the comments were edited. This asserts the exemption mechanism itself. Absence scoped 2026-08-25 (`5fd447da`); PRESENCE followed 2026-08-28 (per-stanza attribution) — the raw-count argument for scanning everything stops holding once the count drives attribution (R18-P4).
grep -c "BlockKind\|classifyBlock" lib/agents/harness/dialect-lint.ts        # expect 5 — the classification mechanism (type + classifier + its uses). If this hits 0 the ABSENCE half is scanning whole documents again and follow-up 2b has regressed
grep -c "dialectLint" lib/services/execution-artifacts.ts                   # expect 4 — re-measured 2026-08-26 (was 3; the fourth is the `contractPropagation` header comment citing dialectLint as the precedent for whitelisting it): `dialectLint` is now on RESULT_JSON_SUMMARY_KEYS as a FIRST-CLASS whitelisted fact plus its two header-comment refs. The E3b lesson forbids an unlisted SIBLING of a whitelisted key, not a new whitelisted key — a gate must read this head-slice-safe exactly as it reads derivationContainment. If a SUB-field is ever added (a disposition, a severity) it nests INSIDE dialectLint — same trap, one level down
```

## 🆕 2026-07-17 — derivation-containment mechanical net (CIDR subnetting / member-not-covered)

The subnetting arithmetic an LLM can't be trusted with: a `/31` covers `.0`/`.1`, so a design claiming
`10.99.0.0/31` covers members `.1`/`.2` under-covers (`.2` is outside) — runs 5/6 shipped it, an LLM
reviewer approved it at confidence 92. The check is **CODE, not prompt**: a `kind`-dispatched
pure-function leaf in `lib/agents/harness/derivation-containment.ts`, emitted only by
network-provisioning's `## Derived Values` block, wired PRE-TX in execution-core, feeding the
pov-program gate conjunct. Design rationale: `PIPELINE-DOMAIN-FIT-CATALOG.md` item 6 (mechanical net =
code deliverable, earned by a live failure). Arc: EVIDENCE-FLOW-DISCIPLINE.md.

```bash
grep -c "member-not-covered" lib/agents/harness/derivation-containment.ts   # expect 10 — re-measured 2026-08-21 (was 9; +1 from the 2026-08-19 misaligned-prefix commit d546d55d's suppression comment; was 6 before the 2026-08-04 derived-value-orphaned class, whose doc comments contrast against it) — the under-covering arithmetic class (a declared member OUTSIDE its own aggregate); the run-5/6 subnetting error
grep -c "kind !== 'cidr'" lib/agents/harness/derivation-containment.ts      # EXPECT 1 — generic-by-construction: kind dispatch, cidr the ONLY leaf today; a new domain's derivation adds a branch, an unsupported kind -> Node C (degradation, NOT equivalent safety)
grep -c "derivationContainment" lib/services/execution-core.ts              # expect 2 — re-measured 2026-09-12 (was 3): the registry migration removed the call site and its catch, and what remains is the per-net TELEMETRY block, which reads the STAMP rather than the enrichment so it cannot drift from it. Operator telemetry stayed OUT of the registry deliberately: these lines are specific claims about specific facts, and a uniform "log the fact" would either say nothing useful or say it about nets it does not understand
grep -c "derivationContainment" lib/agents/harness/derivation-containment-enrichment.ts  # expect 3 — the extracted enrichment (3rd = the 2026-08-02 harvest-precondition note: the checker is unreachable without a parseable harvest block, which is correct for RELATIONAL properties and a real limit for UNARY ones like asn range policy); extracted so scripts/replay-containment.ts can run it against a real completed leg in SECONDS instead of needing a 30-50min program run + rig. Three defects shipped while it was only reachable by a full run, each "verified" by reading source
grep -c "## Derived Values" scripts/seed-protocol-prompts.ts                # expect 11 — re-measured 2026-09-11 at the §3b split (+1 from a pov-program changelog-comment edit, cd66cb91/1c6ffbd4 era, NOT a new contract site). ⚠️ This is a MENTION count and it drifts whenever a `Prior:` changelog comment is edited — the same class the 2026-08-29 health-run replaced elsewhere with a property grep. Contract sites only = pipe through `grep -vc "Prior:"` (8 today). Scheduled for replacement at the next health-run. Prior: 10 (+1 2026-09-09: the marker clause now names the heading form the parser accepts) — MEASURED 2026-08-16 (was 5): network Phase-1 contract refs + pov-program taxonomy refs + the terraform-iac v1.2.0 port (Derivation-evidence section + bullets)
grep -c "prefix-not-minimal" lib/agents/harness/derivation-containment.ts   # expect 6 — re-measured 2026-08-21 (+1 comment from the 2026-08-19 misaligned-prefix commit d546d55d). The THIRD violation class (2026-07-30). An aggregate can cover its members, swallow nothing foreign, and still be LOOSER than minimal: Run 15 shipped 10.99.0.8/30 for members .8/.9 (minimal /31), authorizing 2 addresses no exporter used. It passed the Author, the leg reviewer, this checker (minimality was not in its rule set), Node C and the program gate
grep -c "derivedValues" lib/agents/harness/derivation-containment.ts        # expect 12 (+3 2026-09-09 H-2: the transitive leg record carries derivedValues; was 9 (was 5 before the asn kind, 2026-08-02) — the derived VALUE crosses the DAG edge as a fact (2026-07-31), so acceptance check 1 stops depending on a reviewer reading upstream PROSE (re-measured 2026-08-29 health-run: +1, the derived-value-orphaned class 2026-08-04.)
grep -c "derived-value-orphaned" lib/agents/harness/derivation-containment.ts   # expect 4 — the FOURTH violation class (2026-08-04, b1e15654). Containment proves a derived value came from the harvested pool and says NOTHING about whether the package ACTS on it; both live injections were exactly that shape (legal values no config applied, no validation checked). The rule is usage ANYWHERE in the package, NOT "must appear in the validation section" — the intuitive rule was measured against three real packages and falsely flagged Run 20's legitimate asn 65002. Protocol 10: it is a FACT (an occurrence count outside the declaring block), not a verdict
grep -c "consumed-value-mismatch" lib/agents/harness/derivation-containment.ts  # expect 6 — corrected 2026-08-19 (the 2026-08-16 disposition-branch comment was never folded into this expectation; found by the misaligned-prefix solo review, F6) (was 4 pre-orphaned-class; 4th = the per-kind sameValue() comparator, 2026-08-02: bare string equality was wrong BOTH ways for asn — open on a missed cross-notation match, CLOSED on 65001 !== "65001", i.e. a spurious hard program block) — CHECK 1 MADE MECHANICAL: the consuming leg declares `## Consumed Values`, the platform compares each against the upstream's carried derivedValues, and a difference (recomputation / transcription slip / stale value) joins the SAME violations array the gate already blocks on. LIMIT: compares what the leg SAYS it applied, not what went into the artifact — that residue is Node C's
grep -c "misaligned-prefix" lib/agents/harness/derivation-containment.ts  # expect 6 — the 2026-08-19 class (run-1 two-narrative incident): malformed derived CIDR (non-zero host bits) stamps {reason, derived, canonical} FIRST per value; canonical-span checks still run; fixtures F-1..F-7 in test-derivation-containment.ts, the .9/.10 NEGATIVE assertion is the load-bearing pin
grep -c "asn-not-member\|asn-reserved-range" lib/agents/harness/derivation-containment.ts  # expect 11 — the SECOND KIND (2026-08-02). asn-not-member is PROVENANCE (did this AS number come from the devices?) and is the anti-injection property. asn-reserved-range is RFC set membership (0/65535/4294967295 reserved, 23456 AS_TRANS, documentation). DELIBERATELY ABSENT: "public therefore not yours" — a VERDICT resting on an ownership claim we do not hold, which would false-block every customer who peers with anyone. ⚠️ READ THE ANTECEDENT: it is the "public" POLICY CLASS that is computed-but-never-blocking (asnPolicyClass returns four classes, of which ASN_BLOCKING_CLASSES holds only reserved/as-trans/documentation — public is deliberately outside it, Protocol 10: ship the fact, earn the verdict). asn-reserved-range and asn-not-member themselves ARE pushed into violations and therefore DO block — Branch A is "violations non-empty = BLOCK, always, reason-agnostically". (NO BACKTICK, SEMICOLON OR AMPERSAND IN THIS COMMENT, deliberately: audit-discovery-greps.sh applies its UNSAFE test to the WHOLE line including the comment, so any of those three characters SILENTLY drops the grep from the audit while the run still prints "all expectations hold".) An earlier wording let this be read as "the asn classes never block" and cost a health-run a wrong finding (2026-08-08)
grep -c "harvestCounts" lib/agents/harness/derivation-containment.ts                      # expect 2 — harvestedCount is CIDR-ONLY because the A7 taxonomy keys BLOCKING on its presence, and a kind-blind total would classify an ASN-harvesting leg that derives nothing as a REFUSAL, i.e. a false programReleasable-false on a clean run (the run-14 false-park shape via a data-shape change). harvestedByKind carries the census, stamped only when a non-cidr kind appears
ls scripts/replay-containment.ts                                            # THE tool for this domain: replays the SHIPPING enrichment against any completed leg, read-only, seconds. --chain re-runs the real chainer. Specimens in its header are the regression corpus — always use MORE THAN ONE, the reason string varies per run for the same leg type
# ⚠️ A CONSUMING leg does NOT read `no-derived-values-block` (corrected 2026-07-29, Run-14): a
# terraform-iac leg RE-EMITS the chained aggregate in its own `## Derived Values` block, so the
# derived block IS present — what it lacks is a parseable `## Harvested Allocations` CIDR set
# (it harvests bucket/state, not an address pool). Existence-first ordering therefore stamps it
# `harvest-block-missing-or-unparseable`. `no-derived-values-block` means NO derived block at all
# ── 2026-08-03: that reason taxonomy is now COMPUTED, not judged. Verify the three surfaces agree ──
grep -c "computeContainmentDisposition" lib/agents/harness/derivation-containment.ts   # expect 1 — MEASURED. The definition only. It is exported and called from the enrichment, not used inside this file
grep -c "fact.containmentDisposition = " lib/agents/harness/derivation-containment-enrichment.ts  # expect 1 — (property: the ASSIGNMENT count; a mention-count drifted to 4 with H-2's transcription of each hop's disposition, 2026-09-09) — stamped ONCE, immediately before return
grep -c "containmentDisposition" lib/services/execution-core.ts                       # expect 3 — re-measured 2026-09-12 (was 4): both catch arms moved into the registry entries errorFact(), which is where the failure arm now carries its named blocking gate token. THE PROPERTY IS UNCHANGED AND IS NOW ENFORCED RATHER THAN COUNTED — R1/R2 in test-net-registry.ts assert it for EVERY registered net instead of this file re-remembering it per net (the G3 lesson, mechanised). What remains here is the discharge telemetry
grep -c "containmentDisposition" lib/mcp/server/tools/advanced/lean-card-facts.js     # expect 2 — the read and the ABSENT fallback. ⚠️ This is a MENTION count over a file that also carries prose, so a comment naming the symbol drifts it (it happened on 2026-09-11: net #3's ABSENT-semantics note cited this fact as the fail-closed precedent and pushed it to 3; the note was reworded to describe the precedent without naming it). Keep new prose in that file symbol-free, the same rule the expect-0 tripwire in section C relies on
grep -c "needs-node-c" lib/agents/harness/derivation-containment.ts                   # expect 13 — (+1 2026-09-09 H-3 program-tier comment) — re-measured 2026-08-21 (+1 comment from the 2026-08-19 misaligned-prefix commit d546d55d; was 8 at 2026-08-16, 5 before the cross-port ① fix). +3 from the cross-port ① disposition fix: the Shape-A arm (harvested-pool-no-derivation-cannot-decide) + its comment mentions. See the 2026-08-16 block below (re-measured 2026-08-29 health-run: +3.)
# Any of these at zero means the mechanisation is INERT on that surface — stamp, render and gate must
# all carry it. Two live defects on 2026-08-03 were exactly this seam (violations unrendered on the
# checked:false branch; unsupported rendered as a count with identities stripped).
# — the VT-11 refusal / run-2/3 silent-drop fail-safe. Conflating the two made a first fix INERT.
grep -c "## Harvested Allocations" scripts/seed-protocol-prompts.ts         # expect 14 — re-measured 2026-09-11 at the §3b split (+1 changelog-comment edit, not a new contract site). ⚠️ MENTION count, same drift class as the Derived Values line above; contract sites only = 11 (`grep -vc "Prior:"`). Prior: 13 (+1 2026-09-09: marker clause) — MEASURED 2026-08-16 (was 8): +4 from the terraform-iac v1.2.0 Derivation-evidence port (section + phase bullets). The marker is now a CROSS-DOMAIN contract, no longer network-only
grep -c "member-not-covered" scripts/test-derivation-containment.ts         # expect 10 — incident fixtures pin the arithmetic class + finding-f reason-ordering, PLUS the 2026-07-30 prefix-not-minimal fixtures which assert it does NOT fire alongside them (re-measured 2026-08-29 health-run: +1.)
```

## containmentDisposition delivery (added 2026-08-04; moved here 2026-09-11)

```bash
grep -c "RESULT_JSON_SUMMARY_KEYS" lib/services/execution-artifacts.ts   # expect 3 — const + its use + the header comment
grep -c "fact.containmentDisposition = " lib/agents/harness/derivation-containment-enrichment.ts  # expect 1 — (property: the ASSIGNMENT count; a mention-count drifted to 4 with H-2's transcription of each hop's disposition, 2026-09-09) — the nested assign
```
`containmentDisposition` is **not** on the whitelist and must not be added: it rides NESTED on the fact,
which the whitelist hoists verbatim. Promoting it to a top-level sibling silently strips it, and the program
tier is never told a decision was delegated. Pinned by **E3b** in `scripts/test-execution-artifacts-parity.ts`.

```bash
# consumed-value-mismatch violations stamp the non-cidr kind (Tasman actionability fix, moved 2026-09-11)
grep -c "cKind !== 'cidr'" lib/agents/harness/derivation-containment.ts    # expect 1
```
