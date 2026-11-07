# Execution Facts Discovery

> **Last Updated**: 2026-10-13 (VERBATIM-QUOTE-OMISSION build: `quoteFidelity` + E1 — see the dated section at the end) · **Status**: ACTIVE · **Last Validated**: 2026-09-14 (health-run —
> all 20 section A–E greps RE-RUN and matching; `audit-discovery-greps.sh` clean at 163/0/0. Two
> `npm run` expectations were STALE and corrected: `test:derivation-containment` 94→103,
> `test:rollback-containment` 18→30. Original creation baseline 2026-09-11, per Protocol 11 Part C)
>
> 2026-09-20: the corpus-measure practice gained the three measurement-failure lessons from the
> eight-round arc (discriminating field / else-branch / absence-vs-rate), a CROSS-REF to measuring
> rule 6 in the two forensics guides, and the standing containment-is-not-provenance boundary ruling.
> Two new greps added and RUN before writing (Part C); `audit-discovery-greps.sh` 188 audited.
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

Every net is an entry in the shared **net registry** (`mechanical-nets.ts`, live since 2026-09-12 — count the entries with
§A's floor grep, never from prose; this line said "four facts, no registry" until 2026-10-23). The stamping order and the whitelist are the two places where a correct
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
grep -c "^export function" lib/agents/harness/derivation-containment.ts   # expect 15 — re-measured 2026-10-22 (+legVouches, Bug Class 85: the per-leg green rule, exported because the public mirror carries the pure surface). Prior 14 — re-measured 2026-10-04 (was 12; +2 C2/C3: markerHeadingRegex + markerSectionEnd EXPORTED for the program plan reader). The pure surface (parsers, per-kind checks, disposition, usage check, the shared section primitives). It is a pure module by contract: no prisma, no logger, text in / fact out
grep -c "^export const \(FENCE_LINE_RE\|FENCED_JSON_BLOCK_RE\)" lib/agents/harness/derivation-containment.ts   # expect 2 — the fence grammar, exported 2026-10-04 (stateless: no g flag). ⚠️ PUBLICLY MIRRORED — the four new exports ride @paichart/containment-checks 0.7.0
grep -c "markerSectionEnd(text, m.index)" lib/agents/harness/plan-spawn-carry.ts   # expect 1 — the 4th consumer of the section rule (after the derivation enrichment, the value-leg enrichment and markerPresence, all via parseFencedJsonBlock): the program PLAN reader. Rule (b) of markerSectionEnd is hard-wired to the three marker phrases — a new consumer inherits it
grep -c "^export function" lib/agents/harness/dialect-lint.ts   # expect 8 — re-measured 2026-10-10 (was 7): +unsupportedCanonicalStanzaShapes (G7: an array/non-string canonical stanza reads `canonical-stanza-unsupported-shape`, shared with contract-propagation). 2026-09-11 (was 5): +fencedBlockLines and +isSeparatorLine, both exported for net #3 so it consumes THE classifier instead of forking a second rollback extractor. runDialectLint plus the extractors shared with contract-propagation-enrichment (a change to what counts as a required line reaches BOTH consumers)
grep -c "^export function" lib/agents/harness/marker-presence.ts   # expect 2 — H-4 (2026-09-10), the newest fact: which machine-parsed blocks the platform found
grep -c "blockKinds" lib/agents/harness/dialect-lint.ts   # expect 10 — re-measured 2026-09-28 after EF-DL2 commit 2 (was 9; +1 the classifier-3 history line). Prior same day (was 7; +2 from the EF-DL2 F1 commit: the `classifier` field doc and DIALECT_LINT_CLASSIFIER doc name it). ⚠️ blockKinds counts LINES, not blocks, and is the CLASSIFIER'S READING, not ground truth — values are comparable only between stamps with the same `classifier`. The block classifier ({candidate-config, rollback, expected-output, command, harvested-state}).
grep -c "restoreIntent" lib/agents/harness/dialect-lint.ts   # expect 9 — 2026-10-15: +the Stage B V-8b synthetic REPLACE line (restoreIntent: false). Before that 8 — re-measured 2026-09-28 after EF-DL2 commit 2 (was 7; +1 the call-site note that the axes are unaffected by the harvest change). Prior same day (was 6; +1 the F1 walk comment citing the live `restoreIntent: false` defect). Added 2026-09-11 with net #3. ⚠️ READ WHY IT IS A SEPARATE AXIS AND NOT A `kind`: for dialect-lint, `rollback` and `harvested-state` are both simply exempt from the scan, so the precedence between them is arbitrary and the file says so. For rollback-containment that precedence DECIDES the answer, and measured on the live R19-P4 package it goes the wrong way — the rollback preamble says "harvested", so one of three device blocks lands `harvested-state` and a `kind === 'rollback'` filter sees 34 restore lines instead of 51, position-dependently. restoreIntent reads the heading ANCESTRY, which does not split
grep -c "^export function" lib/agents/harness/rollback-containment.ts   # expect 5 — net #3's pure surface: scopeRestoreLines (the classification), checkRollbackContainment (trimmed-exact-line membership), computeRollbackDisposition, isCommentLine, isDesiredStateLane (the lane predicate, 2026-09-11). AUTHOR_LEAF_ROLE_RE, DESIRED_STATE_LANES and ROLLBACK_SCOPE_NOTE are consts and do not count here. The §6 RENDER is deliberately NOT here — it lives in render-rollback-containment.ts (H3, 2026-09-11), split along the ownership seam (prompt prose vs predicate) rather than co-located like renderMarkerPresence; the module header states why
grep -c "^    name: '" lib/agents/harness/mechanical-nets.ts   # expect >=10 — a FLOOR since 2026-10-13 (+quoteFidelity@leaf-persist, VERBATIM-QUOTE-OMISSION: one entry, two roles — Harvester pure, Author one DB read; APPENDED last). Before that 9 — re-measured 2026-10-08 (+reviewerWarnings@leg-synthesize, WARNINGS-INVISIBLE batch 1). Before that 8 — re-measured 2026-10-02 (value-chain B4: +derivationContainment@leaf-persist, the value-leg Derivation Architect leaf; 7 distinct nets, 8 registrations — derivationContainment and rollbackContainment each register at two points). Measured 2026-09-27 at 7. Registry ENTRIES, not net names: 6 names, rollbackContainment registered at two points. Was 6 until RWF C3 (2026-09-26) added verdictFreshness at leg-synthesize, whose producer is verdict-freshness-enrichment.ts and is NOT in the ls-count above (that list is the containment/dialect family). Entry order is byte-contract (the equivalence gate)
grep -c "stringifyWellFormed" lib/services/execution-terminal-persist.ts   # expect 3 — X11 (2026-09-27): import + error.json + the JSON artifact (result.json and pipeline-index.json share one path). Every fact this domain stamps is serialised through it, so no stamp can persist a lone surrogate. If this hits 0 the one-bad-row-breaks-every-table-cast class is back
grep -c "computeRollbackContainmentFact\|hoistRollbackContainment" lib/agents/harness/mechanical-nets.ts   # expect 4 — re-homed and re-measured 2026-09-12 (the import pair plus one call each). Net #3 is wired at TWO POINTS, and the registry expresses that as two entries keyed (name, point) under ONE name with different enrich halves — compute at the Author leaf persist, hoist at the leg SYNTHESIZE. That shape is what appliesTo had to support and is pinned by R8 in test-net-registry.ts
```

### B. The whitelist and the E3b nesting law

```bash
grep -c "RESULT_JSON_SUMMARY_KEYS" lib/services/execution-artifacts.ts   # expect 4 — re-measured 2026-11-08: +1 is the owner-decision-6 COMMENT (`935416553`, Config-sources push 1a, :660 "NOT on RESULT_JSON_SUMMARY_KEYS"), not a new use. Before that 3 — the definition plus its uses. This is a STRICT whitelist: an unlisted key is dropped with no error, so a new top-level sibling of a fact is silently stripped and reads ABSENT at the gate
grep -c "test('E3b" scripts/test-execution-artifacts-parity.ts   # expect 3+ — re-measured 2026-09-11 (+E3b-2 rollbackDisposition inside rollbackContainment, +E3b-3 contractApplicability inside BOTH dialectLint and contractPropagation). The nesting pins: a disposition survives the pick because it rides NESTED inside its fact; a top-level SIBLING is stripped. Each is mutation-verified in BOTH directions (nested survives / promoted is dropped), and each new fact carrying a sub-object needs its own — the trap does not generalise for free
grep -rln "pickResultJsonSummary" lib/ scripts/ | wc -l   # expect >=16 — a FLOOR since 2026-10-13 (healthy work adds callers; 16th = scripts/test-requirements-form-correction.ts). Re-measured 2026-10-07 (+lib/agents/harness/package-form-check.ts, the form-check fact; +scripts/test-reflection-history-binding.ts, the OPUS55 reflectionErrors pin). Before that 13 — re-measured 2026-10-02 (was 12): +test-value-leg-containment.ts (value-chain B4/B5: E3b-5 pins legShape + orphanCheck survive NESTED and a promoted sibling is stripped). 2026-09-26 (was 11): +test-verdict-freshness.ts (RWF C3: W1 pins that supersession and verdictFreshness survive the pick). 2026-09-25 (was 10): +test-truncation-incident-replay.ts, which hoists the REAL incident artifacts through the real pick before rendering the card (register E1). Prior 2026-09-16 (was 9): +test-lean-card-facts.ts, which now BUILDS its boundary fixtures through the real pick instead of hand-rolling exec objects (CC1/CC2/EC1/EC2) — a hand-made exec is exactly what let the chainedContext render pass green for six days while the whitelist stripped it. Prior 2026-09-12 (was 7): +net-registry.ts and +net-context.ts, both E3b notes rather than new consumers. Any new consumer must be added deliberately; the hoist is where a nesting mistake becomes invisible
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
grep -c "chainedContext" lib/mcp/server/tools/advanced/lean-card-facts.js   # expect 4 — measured 2026-09-16 (A11/C8, cross-pipeline delivery). The F-A coverage clause PLUS the `inherited N of M cross-pipeline from leg <id>` clause. ⚠️ The inherited clause is SUPPRESSED when nothing was inherited and nothing was on offer — deliberately, because `inherited 0 of 0` carries no information and this line is read by the pov-program protocol's SYNTHESIZE Step 2, so every execution in the platform would grow a null clause. The case that must NOT be suppressed is entries OFFERED and none taken: it renders the denominator and the skip REASONS (F7 — render WHAT, not how many). Pinned by CC3/CC4/CC5 in test-lean-card-facts.ts, and the four inherited fields ride NESTED inside `chainedContext` (E3b) — a sibling on the result.json root would be stripped by pickResultJsonSummary. ⚠️ `inheritedSkipped` is a SEPARATE list from `notChained` on purpose: the program gate treats `notChained.length > 0` as BLOCKING and these skips are benign by construction, so merging them would turn a fail-open into a fail-closed
grep -c "contractApplicability" lib/mcp/server/tools/advanced/lean-card-facts.js   # expect 3 — measured 2026-09-12. It rides NESTED inside both facts above (E3b) and renders as their QUALIFIER, never as a fact of its own: a standalone pipeline has no Program Interface Contract BY DESIGN, and a reader told only "no-contract" grades it as a gap (9 of 37 archived legs did exactly that). Pinned by CA1
grep -c "deliverableTruncated" lib/mcp/server/tools/advanced/lean-card-facts.js   # expect 4 — measured 2026-09-25 (register E1). The `truncation:` segment, keyed on `toolLoop.deliverableTruncated === true` and NOTHING else, so every non-truncated card is byte-identical (TR1). It exists BESIDE `errorCategory: TRUNCATED_PARTIAL_OUTPUT` because errorCategory is FIRST-WINS: five categories outrank TRUNCATED_*, so a cut-off deliverable can be stamped truncated while the card names another category (TR3 — the A1 class; 3 of 7 note-bearing prod rows carried a different category). The retry state names only facts PROVABLY about the final turn: a retry whose own stop reason is not `max_tokens` ran on an EARLIER turn and is rendered as such, never as if it described this one (TR4). No ABSENT token — a pre-F2 artifact has no field and a blocking-flavoured token would be false (TR5). All nested under the whitelisted `toolLoop` (E3b; parity F2-3)
grep -c "verdictFresh" lib/mcp/server/tools/advanced/lean-card-facts.js   # expect 9 — measured 2026-09-27 (RWF C3). TWO facts from ONE function (computeVerdictFreshness): the read-time `verdictFresh` (reviewer's agent.results card, "fresh NOW", flips retroactively) and the leg-synthesize STAMP `verdictFreshness` ("fresh when stamped", immutable). The stamp renders only on `different` or an unchecked reason other than no-reviewer/program-tier, so `same` prints NOTHING — safe only while it has no consumer; a gate on it needs a positive token in the same commit
grep -c "supersession" lib/mcp/server/tools/advanced/lean-card-facts.js   # expect 5 — measured 2026-09-27: superseded-by / comparison-skipped (changed-input | input-unknown, "this run is authoritative") / NOT-compared (keep-best-error). supersession is whitelisted but NOT a net — computeSelfSupersession writes it (library, RWF Wave C)
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
ls scripts/replay-nets-byte-identity.sh | wc -l   # expect 1 — the PRODUCTION byte-identity replay harness (2026-10-02, Protocol 15 phase 6): base vs new commit over every leg in the window + children. Since 2026-10-26 (NETS-REPLAY-FAST-OFFLINE) both passes read an OFFLINE SNAPSHOT (--snapshot <scratchpad dir>, dumped read-only once, restored into a local scratch DB) — no pipeline freeze, minutes not hours, base pass cached. Wraps replay-nets.ts; a .sh, so it is not in the count below
grep -c "replay-nets-byte-identity.sh" lib/agents/harness/mechanical-nets.ts   # expect 1 — the point-of-edit trigger in the registry header (change an existing entry ⇒ run the replay before push). If 0, the trigger was lost in an edit
ls scripts/replay-*.ts | wc -l   # expect >=11 — a FLOOR since 2026-10-13 (was a stale exact 5: 11 runners exist; `ls` lines are not audited by audit-discovery-greps.sh, so it drifted silently — found by the VERBATIM-QUOTE-OMISSION measure). Re-measured 2026-09-12 (+replay-nets, the SHARED runner: it iterates the REGISTRY against one task and prints what every applicable net would stamp, plus the rendered card line, plus — deliberately — the nets that do NOT apply, because a silently skipped net is the state this domain exists to make impossible and a runner that prints only the hits reproduces it at the tool layer. The three per-net runners REMAIN and are not redundant: replay-containment --chain re-runs the real CHAINER, which is not a net concern. Each runs the SHIPPING code against a completed leg, read-only, in seconds
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
grep -rn "MECHANICAL_NETS\|netRegistry\|registerNet" lib/ scripts/ | wc -l   # expect >=43 — a FLOOR since 2026-10-13 (+5 = scripts/test-quote-fidelity.ts, the REGISTRY pins for quoteFidelity; no production site added). Before that 38 — re-measured 2026-10-08: +2 = scripts/test-reviewer-warnings-net.ts (imports MECHANICAL_NETS and pins the reviewerWarnings entry; no production site added). Before that 36 — re-measured 2026-10-07: +3 = scripts/leg-replay-lab/nets.ts (the leg replay lab runs the SHIPPING nets over replayed packages — by design; no production site added). Before that 33 — re-measured 2026-10-06 (promotion E9a): +2 = scripts/test-marker-presence.ts, the E5 property pin that reads MECHANICAL_NETS to prove markerPresence never applies to a PIPELINE task (`7e9ea9d8`); no production site added. Before that 31 — re-measured 2026-10-05 after the COMPLETE-THEN-FAIL build review (EF-F2): both registry points moved out of execution-core.ts into the ONE shared helper lib/services/execution-nets.ts (stampExecutionNets: import + leaf-persist + leg-synthesize), which the core AND the completion-anchored rescue call — so production has ONE net call site again (the build briefly had a hand-copied second one in execution-completion-anchored.ts, counted 33). Before that 31 — 2026-10-02 (+1 = scripts/replay-nets-byte-identity.sh header: it runs the shipping MECHANICAL_NETS over production). Earlier the same day 30 (was 24; +6 = test-value-leg-containment.ts, the value-chain B4/B5 dispatch, appliesTo and F12-prediction pins). Earlier (was 23; +1 = the EF-M2 applicability pin in test-net-registry.ts, 2026-09-26) ✅ THE TRIPWIRE FIRED AND THE REGISTRY LANDED (stage 2b, 2026-09-12). Its former text carried a zero-expectation and promised that a non-zero result meant the registry had shipped and this discovery, the toolkit and the specialist config all needed the same-commit update; it did, and they were. (The old expectation is DESCRIBED rather than quoted: a literal zero-expectation inside prose is read by audit-discovery-greps.sh as a live expectation, which is how three earlier lines in this file reported false REGRESSIONS on their first pass.) lib/agents/harness/{net-registry,mechanical-nets,net-context}.ts plus the pins, the equivalence gate and the shared replay runner
grep -rln "rollbackContainment" lib/agents/harness/ | wc -l   # expect >=10 — a FLOOR since 2026-10-13 (+raw-tool-witness.ts, the shared witness E1 moved the net onto; +quote-fidelity.ts, whose header names the net it shares the witness with). Before that 8 — re-measured 2026-10-02 (+value-leg-containment-enrichment.ts: its header names the rollbackContainment two-point shape it copies, and the hoist excludes value legs via value-leg-no-package); 2026-09-26 (was 6; +authoritative-result-read.ts, RWF Wave B: the closed `ResultField` union names it); 2026-09-12 (was 4): +mechanical-nets.ts (both registry entries) and +net-registry.ts (the two-invocation-points rationale in the StampPoint doc). The pure module names its types RollbackContainment* and does not carry the camelCase field name, so it still does not count
```

---

## The corpus-measure standing practice (this domain stewards it)

**Before any proposed violation class reaches a panel, MEASURE IT AGAINST THE CORPUS**: pull the
relevant artifact population and count real occurrences plus naive false positives. A
violation-class proposal without a corpus measurement is not evidence — it is a hypothesis.

### 🔴 STEP 0 — FIRST establish whether a control already exists (added 2026-09-23)

**Before counting frequency, ask: does a control for this property already ship? If it does, the
measurement you owe is its COMPLIANCE RATE, not the defect's frequency.** They are different
questions, over different populations, with different remedies — and only the second is answerable
once a control exists.

This step is new because the practice had a hole exactly where it looks complete. Both reversals
below are **frequency** failures (the class was rarer than believed), so the practice's text, its
examples and its whole vocabulary teach frequency. **Duplication is a third failure mode and it had
no entry.**

Earned 2026-09-23, on a spec that reached a four-specialist panel before anyone noticed: a proposed
`config_change_author` paragraph turned out to restate a clause that had shipped **eleven days
earlier**, in the same domain, for the same defect, in stronger wording — `kubernetes-gitops-protocol`
`:2867`, commit `3a7f0116`, 2026-09-12. The existing clause FORBIDS; the proposal MANDATED, and the
defective package would have satisfied the proposal while violating the shipped clause. **The
proposal was weaker than what it duplicated.**

The population that answers this is the same one the practice already tells you to pull — 23
Kubernetes author legs — and it contained the clause, its originating defect, eight post-clause
compliant legs and a reviewer verdict citing the clause by date. Compliance measured **7 of 8
post-clause, one failure**. The practice's own first instruction would have ended the exercise
before a word of the spec was written. As the steward put it: *the bypass did not merely skip a
check — it caused the error.*

```bash
# Step 0, mechanically. Does prose for this property already ship?
# ⚠️ ALL FOUR SURFACES — a control can live in any of them, and the 2026-09-23 answer was in two.
grep -rn "<the property, in 2-3 different phrasings>" scripts/seed-protocol-prompts.ts \
  lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts \
  scripts/seed-*-templates.ts lib/agents/universal-agent-rules.ts
# If it does: git log -S "<a distinctive phrase>" --oneline -- <that file>   → ship date
# Then measure COMPLIANCE over legs AFTER that date, not frequency over all legs.
```

⚠️ **Compliance measurement is itself proxy-fragile, and more so than frequency.** Measuring
"did the leg comply" by phrase-matching produced a false positive twice over on 2026-09-23: a leg
was scored non-compliant because its `podSelector: {}` occurrence was prose about a hypothetical,
and because it carried the required evidence under different words (*"Harvested workload census
bounding the selector's reach"*). The robust predicate keyed on **structured tool-call arguments**,
not on phrasing — see Step 0b.

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

### How the measurement itself goes wrong (2026-09-20 — three instances in one day)

The two reversals above are about measuring the WRONG THING. These three are about measuring the
right thing WRONGLY, and all three produced a confident number that supported a wrong conclusion.

### 🔴 STEP 0b — VALIDATE THE PROXY BEFORE REPORTING ANY NUMBER (added 2026-09-23)

**Read TWO artifacts your query calls positive and TWO it calls negative, by hand, before you
trust the count.** Four artifacts. It subsumes all three lessons below, which become its worked
examples rather than the guidance itself.

The three lessons below are DIAGNOSES OF SYMPTOMS — each tells you what a wrong number looked like
*after* someone found it. None of them tells you the procedure that finds it. This is that
procedure, and it is the standing *"verify the primary observable"* rule applied to a QUERY instead
of a field.

On 2026-09-23 a single review produced **eight** confident wrong numbers, from four different
people, every one of which this step would have caught for the cost of reading four artifacts:

| wrong number | cause | one artifact would have shown |
|---|---|---|
| "network has 0 set-valued changes" | `\b` is BACKSPACE in Postgres regex, not a word boundary (`\y` is) | any network leg — 76 of 107 carry a multi-host CIDR |
| "2 of 4 domains, ~9 legs" | counted WILDCARDS as a proxy for set-valued; a `/27` has none | any network leg |
| "6 of 6 harvests missed the census" | artifacts carry two JSON spacings; the regex required one | one harvester's raw `toolCalls` |
| "2 post-clause compliance failures" | phrase-matching missed a synonym for the required evidence | one leg the query called non-compliant |
| "protocol clauses never reach leaf agents" (0 of 931) | queried `agent_executions.config`; the preamble is built at runtime and never persisted there | the stamped `protocolInjection` fact |
| "48%, the harvester is unreliable" | measured what was ASKED, not what was OWED | any of the 13 legs that owed no census |
| `toolCalls` query returns 0 rows | `r->'args'->>'tool'`; the real path is `r->'arguments'->>'tool'`, with arguments nested as a JSON **string** | one row |
| "the rig is down" (obs :3114) | port-scan grep pattern did not include the port | one probe |

🔴 **A zero from a broken proxy is indistinguishable from a clean result**, and it reads as good
news, which is why it survives review. Five of the eight above were zeros.

⚠️ **Any net built on `toolCalls` must pin its JSON path with a mutation test.** The path is
`r->'arguments'->>'tool'` and the call arguments are a JSON **string nested inside** it. A wrong
path returns 0 rows and nothing distinguishes that from a clean corpus.

⚠️ **State what the query measures, not what you wanted it to measure.** "48% of harvests skipped
the census" was false; "harvest scope is discretionary, objective-dependent and undeclared" was the
same data stated honestly, and it was the more useful finding. A count of what was ASKED is not a
count of what was OWED unless something in the system records what was owed — and here nothing did.

**1. Key on the DISCRIMINATING field, not the shared one.** Measuring how often a `## Derived
Values` block reads ABSENT while the leg's own text carries it: a proxy keyed on `"kind"` gave
**~31** corpus-wide; re-keyed on `"members"` it gave **~8**. `kind` is carried by harvested,
derived AND consumed entries; `members` only by a derived one — so the loose proxy counted harvest
blocks as failed derivations, and terraform's "100% failure" was 15 of 17 flagged legs carrying a
harvest block. This is a fact-shape property of THIS domain's own schema and is mechanically
checkable:

```bash
grep -c "^  kind?: string;" lib/agents/harness/derivation-containment.ts   # expect 4 — `kind` is SHARED across HarvestedAllocation, DerivedValue and ConsumedValue, so it discriminates nothing. Any corpus proxy keyed on it silently merges the three populations
grep -c "members?: string\[\]" lib/agents/harness/derivation-containment.ts   # expect 1 — on DerivedValue ALONE. This is the discriminating field for raw-text measurement
```

⚠️ **The discriminating field differs between the TEXT and the STAMP.** `derivationContainment`'s
nested `derivedValues` is deliberately `kind+value` only — *no members* (it is head-slice-truncation
sensitive, see its field comment). So a measurement over stamped FACTS discriminates by the KEY
NAME (`derivedValues` vs the harvested list), and a measurement over raw leg TEXT discriminates by
`members`. Carrying one method's key into the other's corpus is the mistake above.

**2. An else-branch is a claim that you enumerated every other case.** Every inflated count that
day came from a classifier catch-all: registry changelog comments attributed to a protocol body; a
body-range scanner bounded by a closing backtick one const does not use, **swallowing an entire
protocol** — the one the defect occurred in — and reporting 5 bodies where there are 6, silently;
and a reach-around classifier whose program-sibling branch matched only `PIPELINE`-type tasks, so
Node C and producer reads (`ACTION`) fell into "UNRELATED" and turned **4 legs into 9**.

This is related to but DISTINCT from the silent-exclusion lesson the knowledge base already carries
(`audit-discovery-greps.sh`, 2026-08-08): that one drops rows, this one MIS-BINS them. Mis-binning
is worse — the row still appears, in the wrong column, supporting a wrong conclusion, and the total
still looks right. **Print per-bucket counts and assert they sum to the population.**

**3. Zero successes is an ABSENCE, not a rate.** terraform's `parsed_ok: 0` was over **2** attempts:
a population that rarely derives at all, not a failing one. The first output said so and it was read
past.

**Cross-domain comparisons** — before comparing domains on a metric, confirm they mandate the same
thing at the same phase, or you are comparing POPULATIONS, not behaviours. That rule lives, with its
live example and both confounds, as **measuring rule 6** in `PIPELINE-RUN-FORENSICS-GUIDE.md` and
`PROGRAM-RUN-FORENSICS-GUIDE.md`. It is CROSS-REFERENCED here, not copied — a duplicated rule with
no drift test is the D1–D5 family the protocol obligation audit tracks. Record:
`cline_docs/follow-ups/observations-from-the-eight-round-arc-2026-09-20.md`.

---

## Fact boundaries — what a net is NOT asked (ruled 2026-09-20)

**`derivationContainment` answers containment, never PROVENANCE.** On 2026-09-20 a terraform author
with nothing to derive imported a derived value from an **unrelated pipeline** (no dependency edge)
and authored a policy from it. The net returned `checked, 0 violations / benign (checked-clean)` —
**correctly**: containment asks whether a derived range swallows a harvested allocation, the harvest
was empty, and the net has no notion of which pipeline a value arrived from. The harness quality
gate caught it; the leg reviewer read the author's honest prose disclosure and downgraded it.

**RULING: do not extend containment to cover provenance.** A fact answers ONE question. Folding a
second one in would make `checked-clean` ambiguous and hand every consumer a conjunct that means two
things — the exact shape Protocol 10 exists to prevent, arrived at from the producer side instead of
the verdict side. If a provenance fact is ever earned it ships under its own name, with its own
reason strings and its own disposition. This is a standing boundary, not a deferral: re-proposing it
as a containment extension needs a panel, not a build.

Corpus: **4 legs ever** reached an unrelated pipeline; 3 predate the 2026-09-16 Bug Class 84
cross-pipeline delivery fix (`c51311d6`) and reached around because the value genuinely was not
arriving — the motive was a delivery defect and it is fixed. **Zero instances in the four weeks
since.** Not a volume problem. Record:
`cline_docs/follow-ups/cross-pipeline-reach-around-second-instance-2026-09-20.md`.

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
  && npm run test:lean-card-facts && npm run test:execution-artifacts-parity && npm run test:quote-fidelity
npm run test:authoritative-result-read && npm run test:execution-selection-coverage   # ANY net that reads an artifact (RWF Wave B, 2026-09-26): the read must go through readAuthoritativeResultField (a closed field union — a new field is a new union member + literal query), and the coverage lock fingerprints every artifact read with no file-level escape
npm run test:containment-public-parity   # ONLY when the mirrored pure module changed
npm run validate:pagination              # ⚠️ SEE BELOW — not in the pinned set, and it is a DEPLOY GATE
bash scripts/audit-discovery-greps.sh    # every GREP expectation this file states — ⚠️ NOT the `npm run` ones
```

⚠️ **`audit-discovery-greps.sh` DOES NOT AUDIT THE `npm run` LINES ABOVE, and that blind spot has now
drifted three expectations in this file** — `test:dialect-lint` (27 documented vs 64 real, found
2026-09-11, stale two and a half weeks) and both `test:derivation-containment` (94 vs 103) and
`test:rollback-containment` (18 vs 30), found 2026-09-14. All three drifted in the HEALTHY direction
— counts risen from shipped fixtures — which is exactly why nothing noticed: a suite that grows is
indistinguishable from a suite that is fine, and the stale number reads as a passing check. **Run
the suite block by hand at every health-run and compare the pass counts to the documented ones**;
until the audit script can read these lines, a person is the only thing checking them.

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
grep -c "STAGE_CHILD_SCAN_CAP\|CHILD_SCAN_CAP" lib/agents/harness/*.ts | grep -v ":0" | wc -l   # expect >=8 — a FLOOR since 2026-10-13 (+quote-fidelity-enrichment.ts: the Author point reads its OWN stage_id like the rollback leaf — a leaf owns no child stage, so ctx.children() is empty there). Before that 7 — re-measured 2026-10-02 (was 6): +value-leg-containment-enrichment.ts (value-chain B4). It does NOT use ctx.children() by necessity, not by choice: its leaf net runs on the Derivation Architect, which OWNS no child stage (ctx.stageId is null at a leaf), so it reads its own stage_id and that stage's children itself. 2026-09-12 (was 4): +net-context.ts (ctx.children()) and +net-registry.ts (the SEARCH-vs-AGGREGATE warning on it). ⚠️ THE FOUR ENRICHMENTS STILL HOLD THEIR OWN COPIES AND THEIR OWN QUERIES — ctx.children() is available to NEW nets but the existing four were deliberately NOT rewired, because each selects a different column set and a select change is provable by the equivalence gate only on the shapes present in the ARCHIVE. Converting them is its own separately gated change, not a migration side effect
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
- `scripts/test-execution-artifacts-parity.ts` — E3b, field ORDER, whitelist behaviour. **In CI (`test:all-validation`,
  the LAST step of the `&&` chain) since 2026-10-14** (PLATFORM-HELD-BYTES Stage A WI-0; it was out of CI until then —
  register E3B-PINS-NOT-IN-CI). RED direction is in CODE, not a fixture: make `pickResultJsonSummary` copy an unlisted key.
- `scripts/test-lean-card-facts.ts` — the write-site/read-site coupling assertions
- `scripts/test-truncation-incident-replay.ts` — register E1 (2026-09-25). The SHIPPING finalize →
  quality cascade → builder → pick → card over the two 2026-09-24 truncation incidents plus two
  same-stage controls, md5-verified against `cline_docs/follow-ups/partial-text-truncation-2026-09-24-fixtures/README.md`
  (the prod rows were DELETED — these files are the only specimens). R6 is the mutation: the pre-§3.3
  wiring (post-#90 stop reason) must LOSE the reviewer's truncation on its real text, or the specimen
  no longer discriminates the fix. ⚠️ **The reviewer specimen carries the note substring as a QUOTE
  of its predecessor's `<prior_output>`, not as finalize's note** — the note-substring corpus proxy
  has a false-positive channel as well as #90's false-negative one. Discriminate with the shipping
  `finalizeTextForStopReason` round-trip, never with a substring (R4, R9)
- `scripts/test-rollback-containment.ts` — net #3 (BUILT 2026-09-11, stage 2a), 30 assertions over
  FIVE live packages (⚠️ 30 CORRECTED 2026-09-14 from 18 — same unaudited-`npm run` blind spot as the
  two lines above; the +12 are ee69d27d's lane ruling, c867ea70's chainer JOIN and 8366c21e's four
  ARM- precedence pins. The package count is unchanged and still five), all pulled from prod and stored under
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
grep -c "harvest-missing-or-unparseable-no-upstream" lib/agents/harness/derivation-containment.ts   # expect 1 — R5 (2026-10-05): a harvest-missing leg with NO upstream resolved names itself; `consuming-leg-upstream-absent` survives only behind `upstreamDeliverableMissing > 0` (record cline_docs/reviews/r4-r5-2026-10-05/REPORT.md)
grep -c "upstreamDeliverableMissing = fallback" lib/agents/harness/derivation-containment-enrichment.ts   # expect 1 — the ONE stamping site of the separating count (only when no report.md predecessor and a pipeline-index.json fallback entry exists)
grep -c "out('blocking', 'refusal-or-drop')" lib/agents/harness/derivation-containment.ts   # expect 0 — the EMITTING call is gone (the string survives in the reclassification comment, so a bare-string grep hits 1); a reappearance of the call is the reclassification reverted
npm run test:derivation-containment   # expect >=103 — FLOOR per the 2026-09-14 ruling (an exact count rots every time a fixture is added; a floor still catches a suite that silently STOPS asserting). History kept because it is the evidence for that ruling: ⚠️ CORRECTED 2026-09-14, and the correction is the SECOND instance of the same blind spot the test:dialect-lint line records: the documented value sat at 94 from 2026-08-21 while four commits grew the suite to 103 (aa12198e fence-inversion fallback, 57818624 missing-author-child, 37a98e6b H-3 tier resolution, 0c85ea70 H-2 transitive containment), and NOTHING CAUGHT IT because audit-discovery-greps.sh audits GREPS, not `npm run` lines. Every delta is a count RISEN from shipped work — the healthy direction — but an expectation nothing runs degrades to decoration. Prior: 94 at 2026-08-21 (+7 misaligned-prefix fixtures F-1..F-7, d546d55d; was 87: D4 rewritten + D4b-f: discharge, fail-closed x2, clause-1 dominance, zero-pool)
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

~~PHASE 1 = pure module + fixtures only~~ — **SUPERSEDED 2026-08-25**: Phase 2 is wired (enrichment
`dialect-lint-enrichment.ts`, stamped `dialectLint` on the leg at SYNTHESIZE through the net registry,
whitelisted, rendered on the lean card). Grep C below is the proof and is non-zero. *(Corrected 2026-09-27,
EF-DL1 — this paragraph had kept telling readers the net ran nowhere for a month after it went live.)*

Design notes that matter when wiring it: it scans **fenced code blocks ONLY** — prose is exempt BY
DESIGN, because requirements/contracts legitimately NAME banned tokens when stating the rules (R6's
clean winner names all three in prose and must return zero violations; that case is fixture-pinned).
Token matching uses word-ish boundaries so a token `is` never fires inside `isis`. It returns a FACT
(checked/reason/tokensConsidered/violations), never a verdict — absence is a NAMED reason
(`no-contract` / `no-banned-token-list` / `no-fenced-blocks`), never a silent pass.

**Classifier cut 2026-09-28 — `dialectLint.classifier: 2` (EF-DL2 commit 1, F1).** The heading-ancestry walk
is fence-aware. Replayed over the archive before shipping (lane-1 corpus, prod read-only): **dialectLint —
3 of 97 contract packages move `blockKinds`, 0 violations, 0 PRESENCE**, all terraform; **net #3 — 87
`restoreIntent` blocks in 22 of 220 Author packages, 22 STAMPED `blocksScanned`/`excluded` moves (21 terraform
via `lane-not-supported`, 1 observability), 0 dispositions.** Nothing reads `blockKinds` or net #3's
`blocksScanned`/`excluded` programmatically (grep of lib/ and app/, 2026-09-28), so net #3 carries no version
field of its own. **Named residuals, pinned as fixtures and re-measured at the health-run:** the TITLE LEAK —
a terraform Author titled "… HCL Rollback Author" now reads every validation block as rollback (2 packages, 19
blocks; F028, a shipped rego policy, becomes a new false SKIP) — and F035 (a `## Consumed Values` marker JSON
becomes candidate-config, the EF-DL3 false-SCAN floor). ~~The equivalence gate cannot pin F1 yet~~ **CLOSED 2026-09-28**: the four Program Run 4 legs
(`cmukqplsa…`, `cmukqr4l1…`, `cmukqr4mb…`, `cmukqr4ng…`, all `no-banned-token-list` stamped `classifier: 3`, and
the first `contractApplicability.basis: program-parent` specimens) are in the fixture and replay byte-identical
for dialectLint and contractPropagation; the `classifier` and `program-parent` arm notes are gone and E3 still
guards the classifier note in both directions. The puller needed two fixes to pull them at all: a lone-surrogate
filter before its `::jsonb` cast, and a QUOTED heredoc (its SQL comments' backticks were being executed).

**Classifier cut 2026-09-28 — `dialectLint.classifier: 3` (EF-DL2 commit 2, option (ac)).** The 3-line prose
window stops AT the first heading (heading line INCLUDED — `label` is byte-identical, 0 line moves archive-wide;
excluding it moved `label` on 59 blocks, and net #3 scopes on `label`), and `harvested-state` is decided only from
the block's own label (`labelProse`, ≤ 120 chars) or the heading ancestry. **This changes the harvest decision's
INPUT** — approved as such (Phase D decision 1). Replayed commit 1 → commit 2 over the archive (lane-1 corpus, prod
read-only; shipped module byte-identical to the panel's `f1ac` variant on **362/362** texts): **dialectLint —
`blockKinds` moves on 88 of 97 contract packages (26 of the 30 banned-token packages), lines harvested-state −973,
candidate-config +761, rollback +141, command +63, expected-output +8; 0 violations; PRESENCE: exactly 2 count
moves, both corrections — `cmt9vs7ub000eyxmjrdx4ejjn` 0/10 → 10/10 and `cmuhmm2u5006byxcq64ndua1v` 0/2 → 2/2 —
plus 4 network packages whose per-line `occurrences` rise (a second device's copy now counted) with
`linesPresent` unchanged. net #3 — 0 scope, 0 fact, 0 disposition moves on 220 Author packages; 0 `label`, 0
`restoreIntent` moves.** Fixtures: the EF-DL2 block in `test-dialect-lint.ts` (both directions; D042 and D052
must stay exempt; D098 a NAMED pre-fix residual, not a trigger).

**Post-fix gold-census baselines (the health-run re-measure compares against these):** false SKIP **2 blocks /
21 lines** (F028 title leak, D098), false SCAN **109 / 269** (operator commands 59, marker/derivation JSON 36,
allocation JSON 14; **0 expected-output**) on the 310-block census; control 0/0 and 15/24 (the EF-DL3 floor,
unmoved). Re-run: `/tmp/ef-dl2-lane1/` holds the prod pull (NOT committed — re-pull with
`lane1-data/pull.sql`, lone-surrogate filter included); build the per-block kinds from the SHIPPED
`fencedBlockLines` keyed `leg:firstBodyLine` and score with `lane1-data/score2.py`'s definitions (false SKIP =
label C and kind ≠ candidate-config; false SCAN = label ∉ {C, AMB} and kind = candidate-config). Labels:
`lane1-data/labels.txt` + `labels_ctl.txt` (second blind labeller agreed C-vs-non-C 104/104). **A new gold-labelled
false SKIP on a package stamped `classifier ≥ 3` is the (d) re-open trigger** — the comment at
`HARVESTED_STATE_PROSE` holds it.

```bash
npm run test:dialect-lint                                                   # expect >=64 — FLOOR per the 2026-09-14 ruling. ⚠️ CORRECTED 2026-09-11, and the correction is the finding: the documented value had been 27 since 2026-08-24 while the suite had grown to 64, and NOTHING CAUGHT IT because audit-discovery-greps.sh audits GREPS, not `npm run` lines — so this expectation sat unverified for two and a half weeks across several commits that added fixtures. Verified against HEAD before AND after the net #3 build (64 both times), so the number is the suite's real size, not a side effect of that work. Same class as the silent-exclusion bug the audit script itself had: an expectation nothing runs degrades to decoration. Prior notes: 27 at 2026-08-24 (was 16; +11 PRESENCE-half fixtures on the live R7 package, mutation-verified), 2026-08-23. Fixtures are LIVE campaign text: R1/R3 defect packages + the R6 CLEAN winner (the false-positive trap: it names every banned token in prose)
grep -c "^export function" lib/agents/harness/dialect-lint.ts               # expect 8 — re-measured 2026-10-10 (was 7; +unsupportedCanonicalStanzaShapes, G7 batch 1, shared with contract-propagation-enrichment). 2026-09-11 (was 5; +fencedBlockLines +isSeparatorLine, exported so net #3 consumes THE classifier rather than forking a second rollback extractor). Prior: 2026-08-26 (was 3): runDialectLint + extractBannedTokens + extractCanonicalStanzas + canonicalStanzaNeedles (shared with contract-propagation-enrichment, so a change to what counts as a required line reaches BOTH consumers) + splitStanzaLines (separator tolerance, IGP-T1 R12). The two extractors are exported so the wiring layer and tests can reuse the contract-shape-tolerant extraction (contracts have used bannedTokens/banned_token_list and canonicalIsisStanza/canonicalStanza_P1_template/canonicalStanzaExemplar across rounds)
grep -rn "runDialectLint" lib/ --include="*.ts" | grep -v "lib/agents/harness/dialect-lint.ts"   # expect 5 — 2026-10-15: +the held-variant call (V-8b, same enrichment; all 5 hits still in dialect-lint-enrichment.ts). Before that 4 — re-measured 2026-08-25: PHASE 2 LANDED and this tripwire FIRED exactly as written. All 4 hits are dialect-lint-enrichment.ts (import + call + 2 comment refs); the engine call site is execution-core.ts, which calls computeDialectLintFact, not runDialectLint directly. Its former text was a zero-expectation tripwire promising that a non-zero result meant Phase 2 had landed and every "it gates nothing" claim in this section and the specialist config was stale — it did, they were, and both were corrected the same day. (The old expectation is described here rather than quoted: a literal expect-N string inside prose is read by audit-discovery-greps.sh as a live expectation, which is how this very line reported a false REGRESSION on its first pass.) SECOND time in two days a documented grep predicted its own obsolescence and the audit caught the drift
grep -c "fencedBlockLines" lib/agents/harness/dialect-lint.ts               # expect 7 — re-measured 2026-09-28 after EF-DL2 commit 2 (was 5; +2 doc pointers to the call site: the classifyBlock `ownProse` param doc and the HARVESTED_STATE_PROSE note). Prior same day (was 3; +2 doc references added by F1: the `classifier` field doc and the restoreIntent doc pointing at the fence-aware walk). Prior 2026-09-11 (was 2): definition + its call site + the `export` that lets net #3 consume THE classifier instead of forking a second rollback extractor. The prose-exemption mechanism (a whole-document scan would flag the clean round)
grep -c "export interface TranscriptionCheck" lib/agents/harness/dialect-lint.ts   # expect 1 — the PRESENCE half (2026-08-24, earned by IGP-T1 R7: a banned-token-CLEAN package omitted one canonical stanza line; config entered, committed and displayed cleanly while the protocol stayed DISABLED; reviewer approved 90/100 because an absence check runs the opposite direction)
grep -c "check:package" package.json                                        # expect 1 — the OPERATOR-side runner (scripts/check-package-against-contract.ts). Puts BOTH halves at the gate today without engine wiring; verified to exit 1 and name the omitted line on R7's real artifacts
grep -c "kind === 'candidate-config'" lib/agents/harness/dialect-lint.ts   # expect 2 — BOTH halves scope to candidate-config. Replaced a `rollback|expected output` word-count on 2026-08-29: that counted PROSE about the classification, not the classification, so it drifted every time the comments were edited. This asserts the exemption mechanism itself. Absence scoped 2026-08-25 (`5fd447da`); PRESENCE followed 2026-08-28 (per-stanza attribution) — the raw-count argument for scanning everything stops holding once the count drives attribution (R18-P4).
grep -c "BlockKind\|classifyBlock" lib/agents/harness/dialect-lint.ts        # expect 7 — re-measured 2026-09-28 after EF-DL2 commit 2 (was 8; −1: the stale "UNCHANGED INPUT SHAPE: classifyBlock still receives…" note was REPLACED, because commit 2 changed the harvest decision's input). Prior same day (was 5; +3 comment refs from F1: the classifier-field doc, the DIALECT_LINT_CLASSIFIER bump rule, the fence-aware walk note). The classification mechanism (type + classifier + its uses). If this hits 0 the ABSENCE half is scanning whole documents again and follow-up 2b has regressed
grep -c "insideFence" lib/agents/harness/dialect-lint.ts                   # expect 3 — EF-DL2 commit 1 / F1 (2026-09-28): declaration + toggle + skip. The heading-ancestry walk is FENCE-AWARE — a `#` line inside a fenced block is content, never a heading (CommonMark). Before it, an in-fence `# comment` read as a level-1 heading: its words reached classifyBlock ("baseline" -> harvested-state on terraform Part B blocks) AND it stopped the walk, hiding the real section heading (a rollback block read restoreIntent false). If this hits 0 the walk is fence-blind again
grep -c "classifier: DIALECT_LINT_CLASSIFIER" lib/agents/harness/dialect-lint.ts   # expect 3 — the THREE return paths that ran the classifier (no-banned-token-list, no-fenced-blocks, checked). The no-contract path deliberately carries NO `classifier` (nothing classified), which is also why its stamp stayed byte-identical across the cut. `dialectLint.classifier` is the SERIES-BREAK MARKER (Phase D decision 4): 2 = F1, 3 = option (ac) (EF-DL2 commit 2); absent = pre-2026-09-28 (implicitly 1) or no-contract. Split every blockKinds series on this field, never on a typed date
grep -c "searchPatternRanges" lib/agents/harness/dialect-lint.ts           # expect 3 — EF-DL1 (2026-09-27): definition + its one call + its doc-comment reference. The OCCURRENCE-level exemption in the ABSENCE half: a banned token inside a QUOTED grep-family pattern is a search, not a directive, and is recorded in `searchPatternExempt` (emitted only when non-empty, so every other stamp stays byte-identical). If this hits 0 the absence-verification false positive is back. ⚠️ The OPPOSITE direction is EF-DL2 — two defects, two commits, BOTH shipped 2026-09-28: F1 (fence-blind ancestry) as classifier 2, and option (ac) (the window crossing a heading, 32 real-config blocks exempt) as classifier 3, after a blind second labeller agreed 104/104: cline_docs/reviews/ef-dl2-dialect-lint-classification-2026-09-27/SYNTHESIS.md
grep -c "HARVESTED_STATE_PROSE.test(ownProse)" lib/agents/harness/dialect-lint.ts   # expect 1 — EF-DL2 commit 2 / option (ac), classifier 3 (2026-09-28): the harvest decision reads ONLY the block's own label (`labelProse`, ≤ MAX_LABEL_CHARS) + heading ancestry, never the prose window. A PROPERTY grep: if it hits 0 the harvest test is reading the window again and a long own-section sentence naming "harvested" (live D076) exempts real config from both halves. The window's heading bound is pinned by the EF-DL2 synthetic (a) fixture, not a grep (its regex does not survive the audit runner)
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
grep "## Derived Values" scripts/seed-protocol-prompts.ts | grep -vc "Prior:"   # expect 13 — re-measured 2026-10-04 (was 12): +1 READ-mention, the pattern (h) batch-2 BRANCH D rewrite in the shared program builder (it names the block in the arm list; mandates nothing — same exception as test:protocol-marker-declarations). 2026-10-02 (was 11): +1 READ-mention, the value-chain Node C paragraph (it tells Node C what a value leg's deliverable carries; it mandates no block) — so this counts contract sites PLUS program-tier read-mentions, as the pov-program lines always did. Earlier: 11 CONTRACT SITES — PROPERTY grep, replacing the mention count 2026-09-17. The old form counted 15 and drifted on every `Prior:` changelog edit; its own comment said so and scheduled this replacement. Contract sites rose 8 -> 11 on 2026-09-17 when kubernetes-gitops v1.8.0 added the producer-side mandate (Phase 0 + Phase 2), the fix for the false block in `cmu3crv0v`.
grep -c "prefix-not-minimal" lib/agents/harness/derivation-containment.ts   # expect 6 — re-measured 2026-08-21 (+1 comment from the 2026-08-19 misaligned-prefix commit d546d55d). The THIRD violation class (2026-07-30). An aggregate can cover its members, swallow nothing foreign, and still be LOOSER than minimal: Run 15 shipped 10.99.0.8/30 for members .8/.9 (minimal /31), authorizing 2 addresses no exporter used. It passed the Author, the leg reviewer, this checker (minimality was not in its rule set), Node C and the program gate
grep -c "derivedValues" lib/agents/harness/derivation-containment.ts        # expect 15 — re-measured 2026-10-22 (+1 net, Bug Class 85: the per-kind check-1 state reads each leg's derivedValues). Prior 14 — re-measured 2026-10-12 (+2: PHASE4-CONTAINMENT-PROPAGATION, the check-1 state helper reads each leg's derivedValues). Prior 12 (+3 2026-09-09 H-2: the transitive leg record carries derivedValues; was 9 (was 5 before the asn kind, 2026-08-02) — the derived VALUE crosses the DAG edge as a fact (2026-07-31), so acceptance check 1 stops depending on a reviewer reading upstream PROSE (re-measured 2026-08-29 health-run: +1, the derived-value-orphaned class 2026-08-04.)
grep -c "derived-value-orphaned" lib/agents/harness/derivation-containment.ts   # expect 4 — the FOURTH violation class (2026-08-04, b1e15654). Containment proves a derived value came from the harvested pool and says NOTHING about whether the package ACTS on it; both live injections were exactly that shape (legal values no config applied, no validation checked). The rule is usage ANYWHERE in the package, NOT "must appear in the validation section" — the intuitive rule was measured against three real packages and falsely flagged Run 20's legitimate asn 65002. Protocol 10: it is a FACT (an occurrence count outside the declaring block), not a verdict
grep -c "consumed-value-mismatch" lib/agents/harness/derivation-containment.ts  # expect 9 — re-measured 2026-10-12 (+1: PHASE4-CONTAINMENT-PROPAGATION, the consumedValueCheck doc names the check the delegated arm cannot have run). Prior 8 — re-measured 2026-10-04 (+1: the PARSE-STEAL `markerSectionEnd` comment names the check the steal skipped). Prior 7, re-measured 2026-10-03 (+1: the CONSUMER-FAIL-OPEN arm's comment names the check that never ran). Earlier corrected 2026-08-19 (the 2026-08-16 disposition-branch comment was never folded into this expectation; found by the misaligned-prefix solo review, F6) (was 4 pre-orphaned-class; 4th = the per-kind sameValue() comparator, 2026-08-02: bare string equality was wrong BOTH ways for asn — open on a missed cross-notation match, CLOSED on 65001 !== "65001", i.e. a spurious hard program block) — CHECK 1 MADE MECHANICAL: the consuming leg declares `## Consumed Values`, the platform compares each against the upstream's carried derivedValues, and a difference (recomputation / transcription slip / stale value) joins the SAME violations array the gate already blocks on. LIMIT: compares what the leg SAYS it applied, not what went into the artifact — that residue is Node C's
grep -c "misaligned-prefix" lib/agents/harness/derivation-containment.ts  # expect 6 — the 2026-08-19 class (run-1 two-narrative incident): malformed derived CIDR (non-zero host bits) stamps {reason, derived, canonical} FIRST per value; canonical-span checks still run; fixtures F-1..F-7 in test-derivation-containment.ts, the .9/.10 NEGATIVE assertion is the load-bearing pin
grep -c "asn-not-member\|asn-reserved-range" lib/agents/harness/derivation-containment.ts  # expect 12 — re-measured 2026-10-12 (+1: the PHASE4 delegation-rule doc cites C3, where Node C approved over asn-not-member — why a violation is never delegated). Prior 11 — the SECOND KIND (2026-08-02). asn-not-member is PROVENANCE (did this AS number come from the devices?) and is the anti-injection property. asn-reserved-range is RFC set membership (0/65535/4294967295 reserved, 23456 AS_TRANS, documentation). DELIBERATELY ABSENT: "public therefore not yours" — a VERDICT resting on an ownership claim we do not hold, which would false-block every customer who peers with anyone. ⚠️ READ THE ANTECEDENT: it is the "public" POLICY CLASS that is computed-but-never-blocking (asnPolicyClass returns four classes, of which ASN_BLOCKING_CLASSES holds only reserved/as-trans/documentation — public is deliberately outside it, Protocol 10: ship the fact, earn the verdict). asn-reserved-range and asn-not-member themselves ARE pushed into violations and therefore DO block — Branch A is "violations non-empty = BLOCK, always, reason-agnostically". (NO BACKTICK, SEMICOLON OR AMPERSAND IN THIS COMMENT, deliberately: audit-discovery-greps.sh applies its UNSAFE test to the WHOLE line including the comment, so any of those three characters SILENTLY drops the grep from the audit while the run still prints "all expectations hold".) An earlier wording let this be read as "the asn classes never block" and cost a health-run a wrong finding (2026-08-08)
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
grep -c "needs-node-c" lib/agents/harness/derivation-containment.ts                   # expect 25 — re-measured 2026-10-22 (+5, Bug Class 85: legVouches + the G4 shape predicate + their docs). Prior 20 — re-measured 2026-10-12 (+5: PHASE4-CONTAINMENT-PROPAGATION — the delegated arm `consuming-leg-upstream-delegated` stamps needs-node-c, plus its rule doc, its subject-field doc and the arm comment). Prior 15 — re-measured 2026-10-03 (+2: the CONSUMER-FAIL-OPEN arm, `consuming-leg-no-consumed-block` — its return and its comment; pinned CFO-1..8 in test-derivation-containment.ts). Earlier (+1 2026-09-09 H-3 program-tier comment) — re-measured 2026-08-21 (+1 comment from the 2026-08-19 misaligned-prefix commit d546d55d; was 8 at 2026-08-16, 5 before the cross-port ① fix). +3 from the cross-port ① disposition fix: the Shape-A arm (harvested-pool-no-derivation-cannot-decide) + its comment mentions. See the 2026-08-16 block below (re-measured 2026-08-29 health-run: +3.)
# Any of these at zero means the mechanisation is INERT on that surface — stamp, render and gate must
# all carry it. Two live defects on 2026-08-03 were exactly this seam (violations unrendered on the
# checked:false branch; unsupported rendered as a count with identities stripped).
# — the VT-11 refusal / run-2/3 silent-drop fail-safe. Conflating the two made a first fix INERT.
grep "## Harvested Allocations" scripts/seed-protocol-prompts.ts | grep -vc "Prior:"   # expect 21 — re-measured 2026-11-08: +1 network-provisioning 1.26.0 (`0b89ccd1f` text, the `live-read` Device sources bullet) and +1 network-provisioning 1.27.0 (`2095d3dae`, network text batch 1, the "Git file and device read." paragraph) — both PLACEMENT/READ mentions, not new contract sites. Before that 19 — re-measured 2026-10-18 (+1 from kubernetes-gitops 1.17.0, held-k8s step 2: the Repo read section places each repo-file quote "before ## Harvested Allocations" — a PLACEMENT mention, not a new contract site). Before that 18 — re-measured 2026-10-07 (+1 from terraform-iac 1.12.0 `de4f1f82`, TF-SOURCE-READ harvester, 2026-10-05). Before that 17 — re-measured 2026-10-02 (was documented 13, actually 15 before value-chain B1): +2 UNRECORDED from the 2026-10-01 Program Run 8 fix — the network-provisioning and terraform-iac dependency-wiring "Chain:" lines that route the harvest block to the Author verbatim; +2 READ-mentions from the value-chain B6 fold — the Node C paragraph (a ✗ for it on a value leg is expected) and network-derivation's "name the selecting attribute" instruction (the block does not carry it). Earlier: 13 CONTRACT SITES — PROPERTY grep, replacing the mention count 2026-09-17 (was 17 mentions, drifting on changelog edits). Rose 11 -> 13 with kubernetes-gitops v1.8.0: the domain could not be an UPSTREAM producer before it, because derivation-containment anchors on the HARVESTER and this protocol asked it for no block.
grep -c "isHeadingShapedAt(text, starts" lib/agents/harness/derivation-containment.ts   # expect 1 — X28 (2026-09-28, PROPERTY grep): parseFencedJsonBlock walks back from the last marker match to the last one whose block PARSES, but stops at a HEADING-shaped match that does not (fail-closed: a broken corrected re-statement stays null, never the stale earlier block). If this hits 0 either the walk-back is gone (Run 4 FABRIC false-ABSENT is back: `Derived Values members set = {…}` in a validation fence displaced the real block) or the stop is gone (an unbounded walk-back — rejected: it substitutes an earlier block). Corpus-measured on 826 result.json texts x 3 markers: 4 changed stamps, all null to array, 3 fixed / 1 neutral / 0 regressed; the "heading-shaped only" alternative regressed 19. Public mirror: needs @paichart/containment-checks 0.6.1
grep -c "markerSectionEnd(text, lastIdx)" lib/agents/harness/derivation-containment.ts   # expect 1 — PARSE-STEAL (2026-10-04, PROPERTY grep): a marker owns only the block in ITS OWN SECTION — up to the next ATX heading of equal-or-higher level, or the next heading-shaped line of ANY of the three markers, outside fences; an in-fence (FW-A3.4) marker stays unbounded. If this hits 0 the parser takes the first fence ANYWHERE after the marker again: an empty `## Derived Values` heading claims the Consumed block and check 1 is skipped (fails OPEN — value-chain B7 run 1). Corpus 1,056 texts × 3: 10 changed, all array→null. Report: cline_docs/reviews/value-chain-post-window-2026-10-04/B-PARSE-STEAL-REPORT.md
grep -cF '\\([a-z]\\d{0,2}\\)' lib/agents/harness/derivation-containment.ts   # expect 1 — MARKER-LETTERED-HEADING (2026-10-08, PROPERTY grep): HEADING_PREFIX_SRC accepts a PARENTHESISED lettered ordinal (`(f)`, `(e2)`, `(G)`) beside the numeric one. If this hits 0, an Opus Author's `## (e2) Derived Values` reads ABSENT again (lab L7 N-R s02 refusal). Deliberately NOT accepted: bare `P1 `/`e2 `, dotted `7.2 `, free text (live non-markers: reviewers quoting legs, technical_writer sections). Corpus 1,187 texts x 3: 3,561/3,561 parses byte-identical (2 newly-matching prod lines are wrappers above a canonical heading, same block). Coverage of a FACT widened, not a verdict (Protocol 10). Public mirror NOT synced (was already diverged)
grep -c "member-not-covered" scripts/test-derivation-containment.ts         # expect 10 — incident fixtures pin the arithmetic class + finding-f reason-ordering, PLUS the 2026-07-30 prefix-not-minimal fixtures which assert it does NOT fire alongside them (re-measured 2026-08-29 health-run: +1.)
```

## containmentDisposition delivery (added 2026-08-04; moved here 2026-09-11)

```bash
grep -c "RESULT_JSON_SUMMARY_KEYS" lib/services/execution-artifacts.ts   # expect 4 — re-measured 2026-11-08: +1 the owner-decision-6 comment (`935416553`, :660). Before that 3 — const + its use + the header comment
grep -c "fact.containmentDisposition = " lib/agents/harness/derivation-containment-enrichment.ts  # expect 1 — (property: the ASSIGNMENT count; a mention-count drifted to 4 with H-2's transcription of each hop's disposition, 2026-09-09) — the nested assign
```
`containmentDisposition` is **not** on the whitelist and must not be added: it rides NESTED on the fact,
which the whitelist hoists verbatim. Promoting it to a top-level sibling silently strips it, and the program
tier is never told a decision was delegated. Pinned by **E3b** in `scripts/test-execution-artifacts-parity.ts`.

```bash
# consumed-value-mismatch violations stamp the non-cidr kind (Tasman actionability fix, moved 2026-09-11)
grep -c "cKind !== 'cidr'" lib/agents/harness/derivation-containment.ts    # expect 1
```

### 2026-10-12 — delegation propagates to the consumer (`consuming-leg-upstream-delegated`)

A consumer whose upstream legs are all machine-checked clean OR `needs-node-c` with a named reason (0
violations, at least one delegated) stamps `needs-node-c consuming-leg-upstream-delegated` on BOTH green-false
arms, with `inputs.upstreamDelegated` + `inputs.consumedValueCheck` nested in the disposition (E3b). Every other
upstream shape still stamps `blocking consuming-leg-upstream-not-green`. `green` is UNCHANGED (it feeds the benign
arms). Build + B3 interface: `cline_docs/reviews/containment-propagation-2026-10-12/BUILD-A.md`.

```bash
grep -c "return upstreamNotGreen()" lib/agents/harness/derivation-containment.ts   # expect 2 — BOTH arms route through the one rule (A3); 1 means an arm was reverted to a bare blocking return
grep -c "cdp.reason === 'consuming-leg-upstream-delegated'" lib/mcp/server/tools/advanced/lean-card-facts.js   # expect 1 — the card render (B2), keyed on the reason ALONE so every other card is byte-identical
grep -c "^test('CP " scripts/test-derivation-containment.ts   # expect >=21 — a FLOOR (pins only grow); re-measured 2026-10-13 (+3 review fold: N-12 lookupMisses, N-13 no-subject, N-14 whitespace reason). P-1..P-7 / N-1..N-14 (C1..C7 verbatim from scripts/fixtures/containment-propagation-cases-2026-10-12.json)
grep -c "dispositionRank" lib/agents/harness/derivation-containment-enrichment.ts   # expect 2 — the diamond dedupe keeps the WORSE disposition copy (N-8); `checked` untouched so `green` cannot move
```

### 2026-10-23 — `validationToolCalls`: network validation-step tool calls vs what the tool accepts (a FACT for the leg Reviewer)

Measured first (`cline_docs/reviews/held-network-2026-10-22/VALIDATION-WITNESS-MEASURE.md` §4: 7 legs wrote calls the live tool
rejects, 4 approved). Author `leaf-persist`, network-provisioning legs only (`NOT_STAMPED` elsewhere — `conditionalStampReason:
'not-network-leg'`), operator tail (not whitelisted), §6 to the leg Reviewer via the chainer, no gate input. Three sources, each finding
naming its own: the resolved service ROW's `inputSchema` → the Harvester's `registry register` → the leg's own SUCCESSFUL harvest calls
(a weaker, labelled observation). ⚠️ **The observed arm needs POSITIVE evidence** — a key no successful call used, or positional
arguments; OMISSION alone is never a finding (3 of 6 valid control legs omit an optional argument). ⚠️ **6 of 7 measured legs registered
tool NAMES only** — without the observed arm the fact would see 1 of 7.

```bash
grep -c "name: 'validationToolCalls'" lib/agents/harness/mechanical-nets.ts   # expect 1 — one registry entry, APPENDED (key order is the equivalence gate's byte contract)
grep -c "conditionalStampReason: 'not-network-leg'" lib/agents/harness/mechanical-nets.ts   # expect 1 — NOT_STAMPED off network legs, so every other domain's result.json is byte-identical
grep -c "'validationToolCalls', 'deviceSourceReads'" lib/services/execution-artifacts.ts   # expect 1 — re-anchored 2026-10-26 (push 2): batch 2b appended two tail keys after it, so the old `'validationToolCalls'] as const` anchor read 0 (a drift, not a regression) — the OPERATOR TAIL, never the summary whitelist: the lean card feeds SYNTHESIZE + the program gate, and the head offset must not move
grep -c "renderValidationToolCallsForPrompt" lib/agents/harness/render-pipeline-context.ts   # expect 2 — import + the §6 call (the Reviewer's seat; the schema is what it cannot see)
grep -c "if (!never.length && !call.positional) return null;" lib/agents/harness/validation-tool-calls.ts   # expect 1 — observed arm: positive evidence only; reverting it flags valid calls that omit an optional argument (mutation M1)
grep -c "NETWORK_SCOPED_NETS" scripts/test-net-registry-equivalence.ts   # expect 2 — the PRECISE equivalence exemption (network specimens only). Never declare the net `legs: 'none'`: that blinds E2a to it stamping on another domain (mutation M2 reds 8 specimens)
grep -c "await test('V" scripts/test-validation-tool-calls.ts   # expect >=16 — incl. the 13-leg positive control (7 differ / 6 match), both wording arms, the optional-argument fixture, the chainer + §6 seam
```

### 2026-10-22 — Bug Class 85: the green rule reads every leg (`legVouches`), not one clean leg

Owner decision "yes as recommended on all six rows" (follow-up `containment-green-path-gaps-2026-10-12.md` §6.7, measure §6).
`green` was `some(checked clean) ∧ every(0 violations)`, so one machine-checked leg carried an unchecked, undecided, unreadable
or invisible sibling. Now EVERY leg must vouch: machine-checked (legacy no-disposition copies unchanged), a G4 leg whose
unchecked kinds were not consumed, or a passed-clean MIDDLE leg. 🔴 **Plain `every(checked)` is WRONG and was refuted on the
corpus**: a middle leg that passed cleanly is `checked:false`, so it would have refused released program `cmu6a9ojp`.
G1/G2 ⇒ blocking; G4 (consumed an unchecked kind) / G5 (undecided middle leg) ⇒ delegated, the subject naming
`uncheckedKinds` / `middleLegFor`, with check 1 per kind (`consumedValueCheckByKind`, stamped only on the new state).

```bash
grep -c "export function legVouches" lib/agents/harness/derivation-containment.ts   # expect 1 — the per-leg rule; green AND the delegation rule both call it, so they cannot disagree
grep -c "DISCHARGED_HOP_REASONS" lib/agents/harness/derivation-containment.ts   # expect 3 — the passed-clean middle leg (keep-green row): definition, its doc, its one use
grep -c "isUpstreamContainmentGreen(legs, { lookupMisses, fallbackPredecessors: fallback, consumedKinds })" lib/agents/harness/derivation-containment-enrichment.ts   # expect 1 — G1/G2/G4 inputs reach the predicate (test-program-containment-taxonomy COUPLING pins the same text)
grep -c "const recIsWorse = dispositionRank(rec) > dispositionRank(dup);" lib/agents/harness/derivation-containment-enrichment.ts   # expect 1 — ranks compared BEFORE `checked` merges (G3); merging first loses an undecided twin (mutation M6, caught by the G3 fixture during the build)
grep -c "dup.checked = dup.checked && rec.checked;" lib/agents/harness/derivation-containment-enrichment.ts   # expect 1 — G3: `checked` follows the worse copy
grep -c "upstream.length === 0" lib/agents/harness/derivation-containment-enrichment.ts   # expect 0 — G1: the fallback count no longer waits for "no report.md predecessor"; a hit is the gap back
grep -c "^test('BC85" scripts/test-derivation-containment.ts   # expect >=10 — pure pins, both directions
grep -c "await test('BC85" scripts/test-containment-enrichment-branches.ts   # expect >=10 — end to end through the enrichment, incl. the G4 passing direction (the measured 2026-08-03 shape) and keep-green (the cmu6a9ojp shape)
grep -c "^test('BC85-R" scripts/test-lean-card-facts.ts   # expect >=3 — pipeline-harness's three D4 card requirements, full lines byte for byte through the real pick
grep -c "uncheckedKinds\|middleLegFor\|consumedValueCheckByKind" lib/mcp/server/tools/advanced/lean-card-facts.js   # expect 6 — the render half; every earlier card is byte-identical because each clause renders only when stamped
```

⚠️ **The public mirror `@paichart/containment-checks` diverges further** (`test:containment-public-parity` red, out of CI) —
the bump is OWED, blocked while PH-7 holds every public export. Fold it into the C3 handover with fix (a)'s.

---

## 🆕 2026-09-20 — reviewer evidence grading (`reviewerVerdict.evidenceGrading`)

`VERIFIED-AGAINST-EVIDENCE` / `ACCEPTED-FROM-CLAIMS` is mandated by every domain protocol and, until
this fact, was read by **nothing**. `approved: true` therefore collapsed *"I recomputed this myself"*
with *"I am trusting the package's word"*. Producer: `lib/agents/harness/evidence-grading.ts` (pure),
called inside `buildExecutionResultJson`.

```bash
grep -c "^export function\|^export const" lib/agents/harness/evidence-grading.ts   # expect 3 — computeEvidenceGrading plus the two token literals. Token-locked and case-sensitive: the protocols write the tokens in caps and a case-fold would start counting prose
grep -c "computeEvidenceGrading" lib/services/execution-artifacts.ts   # expect 2 — the import and the ONE call site, inside the canonical builder, so dual-path parity is structural rather than maintained by discipline (the Bug Class 75 lesson)
grep -c "test('E3b-4" scripts/test-execution-artifacts-parity.ts   # expect 4 — nesting survives the pick + the sibling direction (4), the scan covers the WHOLE finalResponse (4b), graded:false is PRESENT not absent (4c), and evidenceGrading precedes `raw` inside the nested object (4d). 4, 4b and 4d are each mutation-proven red
grep -c "test('EG" scripts/test-parse-verdict.ts   # expect 8 — the parser pins, in the suite beside the verdict parser they mirror. That suite is out-of-CI by the same considered exclusion as its sibling: this fact has no consumer, so it does not meet the CI bar ("underwrites a decision we have already committed to"). Run it with the script named for this file
```

**NESTED on `reviewerVerdict`, ruled rather than assumed.** `reviewerVerdict` is already a
whitelisted top-level key and `pickResultJsonSummary` copies it **verbatim**, so nesting survives by
construction and a top-level `evidenceGrading` sibling would be stripped silently (E3b). The fact
qualifies a verdict; it does not stand alone. **The nesting cost was MEASURED, not waved past**: of
**270** `change_reviewer` executions, 261 carry a `reviewerVerdict`; of the 9 that do not, exactly
**1** carries grading tokens. Nesting loses 1 observation in 270. Re-measure before any promotion to
a top-level key.

⚠️ **The scan covers the WHOLE `finalResponse`, not `ReviewerVerdict.raw`.** Gradings ride on
FINDINGS, which precede the terminal `## VERDICT:` block, so scanning from the verdict line onward —
the obvious refactor — reads `graded: false` on every correctly-formed reviewer. Pinned by E3b-4b and
mutation-proven; nothing else in the tree would have noticed.

⚠️ **Inside the nested object, `evidenceGrading` precedes `raw`.** Same head-slice contract as the
outer builder: `raw` is the bulky member, and a compact fact appended after it sits behind the thing
most likely to be cut. Pinned by E3b-4d.

### THREE states, not two

`graded: false` (no token anywhere) is a different observation from `graded: true, verifiedLines: 0`
(graded, and verified nothing itself). A two-state fact bins the first into whichever the parser
defaults to — `CHECK-DESIGN-DISCIPLINE.md` §2a. **Measured baseline, 2026-09-20, 261 live verdicts
(reproduced independently of the brief and matching it exactly):**

| | count | share |
|---|---|---|
| emits `VERIFIED-AGAINST-EVIDENCE` | 170 | 65% |
| emits `ACCEPTED-FROM-CLAIMS` | 134 | 51% |
| emits **both** | 111 | 43% |
| emits **neither** | 68 | **26%** |

### The counts are LINES, and the both-token line is EXPOSED rather than filtered

`verifiedLines`/`acceptedLines` are named for what the parser can observe. A grading token is emitted
per finding, but findings are not machine-delimited — `verifiedFindings` would assert a unit the
parser cannot see, which is this discovery's own discriminating-field trap turned into a field name.

The suspected false positive was the **scheme restatement** (*"State findings as X or Y"* — mentions
both tokens, grades nothing). **CORPUS-MEASURED before building a filter**, and the suspicion did not
survive: 46 both-token lines across 42 legs, of which the alternation shape is **3**. Excluding it
moves the corpus 170/134/111 → 170/132/**109** — **2 legs in 261, 0.8pp**. The remaining both-token
lines are legitimate compound grades (`VERIFIED-AGAINST-EVIDENCE (naming) / ACCEPTED-FROM-CLAIMS
(content accuracy)`, 9 explicit) and prose gradings (~34), all of which a both-token exclusion would
have discarded. **So the filter was NOT built**: the parser counts honestly and reports
`bothTokenLines` as its own field, handing the consumer the ambiguity as a fact. It is a SUBSET of
both counts — the three fields do not sum (pinned, EG4).

### NO CONSUMER, and deliberately UNRENDERED

No gate conjunct, no `programReleasable` input, no disposition. Protocol 10: ship the fact, let it
generate the data, earn the verdict. There is a coupling reason too — the reviewer-remit changes
(removing unverifiable properties; enumerating checkable ones) will move the denominator, and a
consumer wired now would shift underneath them.

The §5.1 convention requires a render **or a recorded reason**. This is the reason: rendering the
grading into the §6 prompt tells reviewers what is being measured about them and contaminates the
baseline this fact exists to establish; rendering it on the lean card puts it in front of SYNTHESIZE,
which is a consumer. Observe it during the soak by querying the artifact. ⚠️ **RE-DECIDE when the
remit changes land** — a fact left unrendered past the expiry of its reason is the A1/F7 class, and
this domain has already had one "nothing to see here" measurement expire silently (§6
`derivationContainment`, closed 2026-09-17).

### 2026-09-27: the soak decided, the remit moved, and the series broke

**The soak answered both of its questions (CLAUDE.md "REVIEWER EVIDENCE-GRADING SOAK", DECIDED 2026-09-27; register
EG-1).** Over the 41 `change_reviewer` verdicts since this fact shipped (240 graded lines), NEITHER fell to **0%**
(it was 26-27% before 09-20; RWF Stage 2 `RESULTS.md` reads 68 of 256 = 27% on its window). Compliance is no longer
the constraint. Provenance/copy FIDELITY was never genuinely verified: 18 lines were accepted on trust, and the 6
"verified" lines under provenance vocabulary verified something else. So fidelity was **removed from the reviewer
remit WHERE THE SOURCE IS NOT IN CONTEXT** (`4d1d21d7`, network 1.15.0 / k8s 1.13.0 / terraform 1.7.0 /
observability 1.4.0; live and reseeded on prod 2026-09-27). Evidence PRESENCE stays the reviewer's, and it may block.
Dialect lint was NOT moved from the remit (EG-2, closed with no build).

⚠️ **SERIES BREAK 2026-09-27.** `acceptedLines` falls BY CONSTRUCTION after the reseed, because provenance lines
stop being graded at all. **Never compare accepted counts or rates across the cut.** The parser did not change,
the population did. That is the case the three-state shape exists for: a fall in `acceptedLines` after the cut is
not a rise in verification.

**The render/consumer re-decision this block scheduled has now come due.** The remit change landed. What the
record says: CLAUDE.md "Still no consumer", and a NEXT soak read is defined (does the verified rate on the other
properties hold; does any leg reviewer still raise fidelity, which is now a guidance violation). A continuing soak
keeps the contamination reason alive, so **the fact stays unrendered for the length of that read, and this line is
the new expiry**: re-decide at the next soak read, and record either a render or a fresh reason. This is the reading
the record supports. It was not decided in a session; confirm it with Steve if the next read is deferred again.

**The tag-grammar soak is NOT built** (RWF Stage 2, Steve 2026-09-27). It was a proposed sibling fact (reviewer
class tags, parsed and unconsumed). Strict retry reach was 5% and 0 of 16 programs were sunk by write-up alone, so
the lever it would have fed was stopped. The re-open triggers are in the library ("RWF Stage 2").

## 2026-10-08 — reviewer warnings (`reviewerVerdict.warnings` → `reviewerWarnings` net → report.md section)

WARNINGS-INVISIBLE batch 1 (`cline_docs/reviews/warnings-invisible-2026-10-08/`, SYNTHESIS v0.3, owner decisions O1–O5).
- **Transcription** (`lib/agents/harness/reviewer-warnings.ts`, grammar G1): line-start `NON-BLOCKING WARNING (<id>):` above
  the terminal `## VERDICT:` marker (one marker rule: `locateTerminalVerdict` in `parse-verdict.ts`), nested on
  `reviewerVerdict` beside `evidenceGrading`; `warnings: []` always present when the verdict parses (three states);
  `untranscribedLabelLines` is the unrendered control. Bounds 1,000 chars / 20 lines + `warningsOverflowCount`.
- **Hoist**: registry entry `reviewerWarnings` @ `leg-synthesize` (9th net) — leg arm + program arm, `renderScope`
  decided in the enrichment (leg-section = four infra protocols, `change_reviewer` lines only; program-section =
  pov-program; else fact-only). Reviewer locator shared with verdictFreshness (`leg-reviewers.ts`, selection UNCHANGED —
  wide set; the net filters to `REVIEWER_ROLES`). Registered ids: `REGISTERED_WARNING_IDS`, pinned == protocol text.
- **Render**: `lib/services/report-warnings-section.ts`, from the stamp only, in `runTerminalSuccessTx` before R10.
- Gates NOTHING. Byte-identity replay: `scripts/replay-reviewer-warnings.ts` (461/461 identical on 2026-10-08; mutation
  control flips `cmuw8e6c90010yx9erg4d21t1`; injection control 3 domains). Health queries: `…/health-queries.sql`.

```bash
grep -c "name: 'reviewerWarnings'" lib/agents/harness/mechanical-nets.ts            # expect 1
grep -c "appendReviewerWarningsSection" lib/services/execution-terminal-persist.ts  # expect 2
grep -c "'reviewerWarnings'" lib/services/execution-artifacts.ts                    # expect 1
grep -c "computeReviewerWarnings(finalResponse)" lib/services/execution-artifacts.ts # expect 1
```
⚠️ Until batch 2 (clause-f demotion) the label lives in ONE protocol (network) — a zero is an ABSENCE (MI-13 §1c control). **Batch 2 (2026-10-08) registers `restated-conclusion` for all four leg protocols** (defined in the shared `change_reviewer` role) — from its reseed, a sustained 0 while Authors still restate is the finding.

## 2026-10-09 — requirements form check (`toolLoop.requirementsFormCheck`, 2b) — verification greps (every expectation run before it was written)

The in-run publish checks for `requirements_author` (coverage, citations, dropped clauses, size + program view, lint,
template residue): TypeScript port of the operator tools, held to them by a corpus parity test; stamped on EVERY eligible
execution (shadow); ONE correction turn behind `REQUIREMENTS_FORM_CORRECTION_ENABLED` (default OFF). Record:
`cline_docs/reviews/requirements-author-retrospective-2026-10-09/` (SYNTHESIS v3, PORT-NOTE, WIRING-NOTE-2B).

```bash
grep -c "isRequirementsFormCheckEligible(agentRole, task.type)" lib/services/execution-core.ts   # expect 1
grep -c "requirementsFormCheck ? { requirementsFormCheck }" lib/services/execution-artifacts.ts   # expect 1
grep -c "'residuePlaceholders', 'residueDeleteMarks'\] as const" lib/agents/harness/requirements-form-correction.ts   # expect 1
ls lib/agents/harness/requirements-*.ts | wc -l   # expect >=9 — a FLOOR since 2026-10-23 (+requirements-artifact-names.ts, 2026-10-10; was a stale exact 8 — `ls` lines are not audited)
npm run test:requirements-form-check-parity   # Python == TS on trial drafts, published specs, fixtures, probes (needs python3 + ~/paichart; out of CI)
```
- **The parity test is the guard on the port** — any change to a `scripts/check-requirements-*.py` or `~/paichart/scripts/requirements-rules.py` check must be mirrored in the TS module in the same sitting, or the parity test goes red.
- **Residue:** `{{` and 🗑 trigger a correction (defects); author-addressed skeleton sentences are counted, never trigger (protocol 1.8.0 tells the Author to copy them — until the template change).
- **Do not "fix" `delivered_estimate`'s non-ASCII escaping** — Run 14's measured 67,093 matches it (67,009); a JS-style count reads 64,921.

## 2026-10-13 — `quoteFidelity` (new net) + E1 (`rollbackContainment` reads the RAW witness)

VERBATIM-QUOTE-OMISSION Groups A and E (owner decisions A1–A3, B3, E1 — `cline_docs/reviews/verbatim-quote-omission-2026-10-13/`
MEASURE-AND-PROPOSAL §8, BUILD-A-E.md). Every expectation below was run before it was written.
- **One witness extractor** (`raw-tool-witness.ts`, pure): every string leaf of `toolCalls[].result`, JSON-in-strings parsed,
  a persisted-truncated `{preview}` decoded literal by literal (its platform `note` is NOT a result), each `rewritten` call's
  lines also accepted in their R9-sanitised form. Both nets read it; a second extractor would be the two-extractor class.
- **`quoteFidelity`** (`quote-fidelity.ts` pure + `quote-fidelity-enrichment.ts` for the Author point): ONE registry entry
  at `leaf-persist`, two roles. Harvester = pure over its own `toolCalls` (handed to ctx by `stampExecutionNets` off the BUILT
  resultJson — the one chokepoint both execution paths share). Author = its reproduction blocks only (restore / baseline /
  expected output labelled identical), desired state EXCLUDED by the classifier AND by the heading ancestry
  (`FencedBlockLine.ancestry`, added for this: the classifier reads `harvested-state` off a "replaces the baseline" label).
  Escalate-only; benign is an allowlist; consumed by nothing (B3); rendered NOWHERE (B1/B2 wait for the Group C lab) — the
  chainer does not carry it and the card has no segment, pinned by the zero below.
- **E1**: the rollback leaf's witness moved from the Harvester's `finalResponse` (a transcription) to the raw tool results;
  `witness: {source: 'harvest-raw-tool-results', …}` on the checked/could-not-check arms is the SERIES KEY; the
  could-not-check arm is now `no-harvest-tool-results` (blocking, as `no-harvest-text` was). Question, matching rule and scope
  note unchanged. Live predictions met: `cmuoukung` 19/19 benign → 18/19 needs-node-c; run 1 29/31 → 30/31.

```bash
ls lib/agents/harness/quote-fidelity.ts lib/agents/harness/quote-fidelity-enrichment.ts lib/agents/harness/raw-tool-witness.ts | wc -l   # expect 3
grep -c "name: 'quoteFidelity'" lib/agents/harness/mechanical-nets.ts   # expect 1
grep -c "'quoteFidelity'" lib/services/execution-artifacts.ts   # expect 1 — the whitelist entry (findings + disposition ride NESTED: E3b-8)
grep -c "toolCalls: resultJson.toolCalls" lib/services/execution-nets.ts   # expect 1 — the ONE chokepoint; a second hand-off would let the two paths fork
grep -l "quoteFidelity" lib/agents/harness/context-chainer.ts lib/agents/harness/render-pipeline-context.ts lib/mcp/server/tools/advanced/lean-card-facts.js | wc -l   # expect 0 — UNRENDERED by owner decision (B1/B2). Non-zero before the Group C lab reports is a render that skipped its gate
grep -c "buildRawWitness" lib/agents/harness/rollback-containment-enrichment.ts   # expect 2 — import + the E1 read
grep -c "'finalResponse'" lib/agents/harness/rollback-containment-enrichment.ts   # expect 0 — the transcription is never the witness again (E1); a hit is the old read back
grep -c "case 'toolCalls'" lib/agents/harness/authoritative-result-read.ts   # expect 1 — both raw reads go through the authoritative selection
grep -c "extractRawToolDocuments" lib/agents/harness/quote-fidelity.ts   # expect >=2 — the shared extractor, never a fork
npm run test:quote-fidelity   # expect >=35 — live specimens both directions + every exemption mutation-held
npm run test:rollback-containment   # expect >=39 — +E1-1..6
```
- **Corpus measure + both replays**: BUILD-A-E.md §3–§4. **Series cut draft**: BUILD-A-E.md §6 (not yet in CLAUDE.md —
  it is stamped at deploy).
- ⚠️ `quoteFidelity`'s window is EMPTY in `test:net-registry-equivalence` (newer than every specimen) and so is
  `rollbackContainment@leaf-persist` since E1 (every archived stamp predates the witness move): both declared `legs:'none'`
  with a reason and printed NOT COVERED (31 → 50 gaps, every one accounted). Re-add a post-deploy leg to each.


## 2026-10-13 — chain-size + result.json head-slice re-measure (P5, PLATFORM-HELD-BYTES)

The 2026-09-12 re-trigger ("8 nets") counted registry entries. The chainer copies facts BY NAME:
`markerPresence`, `derivationContainment`, `rollbackContainment` (+ `qualityMetrics`, R9 metadata). Only the 512 KB ceiling
counts the serialized entry. The 128 KB per-predecessor cap still tests `finalResponse.length` alone, so **a chained fact is
bounded only by its own budget**. Since 09-12 the worst `chainedFrom` total is 70.8 KB (13.5%) and nothing has been
truncated. The binding constraint is the 8,000-char result.json head (`orderResultJsonForPersist` puts facts first): the
Author's `"finalResponse"` offset is 3,925 at p95 before `quoteFidelity`. Record, re-trigger set and re-run scripts:
`cline_docs/reviews/platform-held-bytes-2026-10-13/P5-CHAIN-SIZE.md`.

```bash
grep -c "finalResponse.length > PER_PREDECESSOR_SOFT_CAP" lib/agents/harness/context-chainer.ts   # expect 1 — the per-predecessor cap is finalResponse-only; if 0, re-read P5 §1
grep -c "JSON.stringify(e)?.length" lib/agents/harness/context-chainer.ts                         # expect 1 — the ceiling counts the serialized entry
```

## 2026-10-13 — `applyBlockPlaceholder` (PLACEHOLDER-APPLIES-AS-LITERAL interim guard)

Owner decision (a): a WARNING-only fact, no gate, no agent-facing text. `lib/agents/harness/apply-block-placeholder.ts`
(pure): on every `config_change_author` leaf (exact role), the package AS PERSISTED (`redactArtifactsForPersist` first)
is scanned for R10's placeholder (`<<REDACTED…>>`, from R10's own `PLACEHOLDER` + `R10_PLACEHOLDER_RE`) and the
single-angle family (`<REDACTED…>`, the same regex with one angle pair removed) inside fenced blocks
(`parseFencedBlocks`) whose role the dialect-lint classifier (`fencedBlockLines`) reads as desired or rollback; a fence
the classifier did not walk is `unclassified` and counted. **NOT whitelisted** (registry field `summaryExcludedReason`;
R4 in `test:net-registry` is now whitelisted XOR a reason) and persisted in the TAIL, after `toolCalls`
(`RESULT_JSON_OPERATOR_TAIL_KEYS`). An agent-VISIBLE fact with no agent-facing instruction text: verbose `agent.results`
returns the raw result.json, and a hit leg's report.md section is chained onward. Its one render is the leg report.md **Platform warnings
(non-blocking)** section (`appendApplyBlockPlaceholderSection`, report-warnings-section.ts), appended in
execution-terminal-persist from the SOURCE Author's stamp on the artifact the extraction already parsed. Stored corpus:
2 of 316 Authors move (cmrmjpdt1…, cmrmnhxhm…, both 2026-07-15), 2 of 319 leg reports. Record:
`cline_docs/reviews/platform-held-bytes-2026-10-13/PLACEHOLDER-GUARD-BUILD.md`.

```bash
grep -c "name: 'applyBlockPlaceholder'" lib/agents/harness/mechanical-nets.ts   # expect 1
grep -c "RESULT_JSON_SUMMARY_KEYS = \[.*'applyBlockPlaceholder'" lib/services/execution-artifacts.ts   # expect 0 — NOT on the summary whitelist (owner (a)), so not on the lean card or the summary; a hit means the summary/card now carries it. ⚠️ It is NOT invisible to agents: it is in the raw result.json a verbose agent.results returns (review B1, 2026-10-13)
grep -c "RESULT_JSON_OPERATOR_TAIL_KEYS = \['applyBlockPlaceholder'," lib/services/execution-artifacts.ts   # expect 1 — first operator tail key (Stage B P1-4 added 'toolCallGatewayMeta' after it); persisted AFTER toolCalls, past the 8 KB tool-result head (B1 mitigation); G5/G6 in the suite pin the order
grep -c "summaryExcludedReason" lib/agents/harness/mechanical-nets.ts   # expect 6 — re-measured 2026-11-08: +2 liveEvidence (`935416553`, Config-sources push 1a, owner decision 6 — leaf + leg entries, operator tail, off the summary). Before that 4 — re-measured 2026-10-26 (push 2): +deviceSourceReads +gitDeviceComparison (batch 2b, both operator tail). 2026-10-23: +validationToolCalls (operator tail, not whitelisted). Before that 1 — applyBlockPlaceholder
grep -c "sourceApplyBlockPlaceholder = sourceJson.applyBlockPlaceholder" lib/services/execution-terminal-persist.ts   # expect 1 — the render reads the stamp off the artifact the extraction parsed, no new query
grep -c "{APPLY_PLACEHOLDER_WARNING_ID} — " lib/services/report-warnings-section.ts   # expect 1 — the platform line is `- placeholder-in-apply-block — …`, never the reviewer label literal (prompt-construction F2; R2 in the suite pins the rendered text)
npm run test:apply-block-placeholder   # expect >=43
```

## PLATFORM-HELD-BYTES (2026-10-14): lane source + heldBytes builders

```bash
grep -c "FILE_ARTIFACT_TOOLS: readonly string\[\] = FILE_DESCRIPTOR_TOOLS" lib/agents/harness/quote-fidelity.ts  # expect 1
```
`FILE_ARTIFACT_TOOLS` is DERIVED from the held-bytes default descriptor table (`held-bytes/descriptors.ts`), value AND order
pinned (`score-quote.ts:89` depends on the order); `laneOf` WAS left unchanged here (the Q3 departure, OA-22) — **converged
held-k8s 1e (2026-10-18): `QUOTE_FIDELITY_VERSION` 2, lane = the resolved `<service>.<tool>` in `FILE_LANE_KEYS`; see the block at
the end of this file**. `held-bytes/held-bytes-fact.ts` builds the `heldBytes` digest (≤ 1,024 by construction:
40-char serialised caps + `truncatedFields`, sparse counts, final guard + `rowsOmitted`) and manifest — NOT wired (no
whitelist entry, no stamp) until Stage B.

## R9 / R10 versions (Stage B push 1, 2026-10-14)

```bash
grep -c "export const R9_VERSION" lib/agents/harness/sanitize-chained-output.ts      # expect 1 — paichart.r9/1, a held VIEW key
grep -c "R10_VERSION = 'paichart.r10/11'" lib/agents/harness/redact-artifact-secrets.ts   # expect 1 — re-measured 2026-11-02: r10/11 (CEOS2-ECHO-SECRET-RESIDUAL: echo matches only between placeholder spans; plain arm unchanged) superseded r10/10. re-measured 2026-10-26 (push 2): r10/10 (O-3 username) superseded r10/9; r10/9 (batch 2a, R-1/R-2) superseded r10/8; r10/8 (2026-10-24, R10-ECHO-REDACTION: ECHO redaction at persist — a value a directive-anchored rule redacted in the same persist is also redacted where it reappears BARE; plain arm output unchanged; cline_docs/reviews/held-network-2026-10-22/r10-v8/R10-V8-BUILD.md). Prior: r10/7 since 2026-10-23 02:07:00Z (R10-V7 network families: the pre-shared-key type-word leak + the self-masking class, SNMPv3/SNMP host/IS-IS/NTP/VRRP-HSRP/AAA/Junos $9$ + crypt hashes + SNMP communities, line-bound rules, linear arm 2; cline_docs/reviews/held-network-2026-10-22/r10-v7/R10-V7-BUILD.md; CLAUDE.md series cut). Prior: r10/6 since 2026-10-20 (R10-V6-TERRAFORM: prefixed password keys + `_wo`, one-line HCL object, letters-only quoted-password waiver, arm-2 escape tokens; resource refs + Terraform built-in calls exempt); was r10/5 (2026-10-19: GitHub token shapes, list marker, whole-token expression exemption); was r10/4 (R10-CODE-ASSIGN), r10/3
grep -c "export function buildEchoMatcher" lib/agents/harness/redact-artifact-secrets.ts   # expect 1 — R10 v8: the echo matcher is a PREFIX TRIE compiled to one regex (O(text x 256)); never a flat alternation
grep -c "R10 v8 echo" scripts/test-security-invariants.ts   # expect >=19 — the echo pins (lines; the guard loops expand to more checks) (positive sample-02 shape, `<value>` negative control byte-identical, word edges, variants, guards both directions, line-crossing source, R10-off, linear timing)
grep -c "redactEchoes(deepPersisted" lib/agents/harness/held-bytes/apply.ts   # expect 1 — held apply's persisted-form mirror includes own-text echo (an edit line carrying a bare echo is edit-redacted-at-persist)
grep -c "function redactJunosSnmpCommunities" lib/agents/harness/redact-artifact-secrets.ts   # expect 1 — R10 v7 (sec-ops B-3): EVERY community of a Junos `snmp {` block, a LINE SCAN — a BLOCK_CONTEXT regex stops after its first match (the RW community stayed in clear behind count 1). Never turn it back into a block regex
grep -c "scan:junos-snmp:" lib/agents/harness/redact-artifact-secrets.ts   # expect 1 — the scan's regexes ride the §J fingerprint sources (a logic change must move the fingerprint)
grep -c "R10 v7 arm 2 linear:" scripts/test-security-invariants.ts   # expect 1 — the ARM-2 1 MB timing loop (sec-ops SF-1: arm 2 had NO timing pin, and the v7 draft took 95 s on a 1 MB leaf)
grep -c "R10_SERIALIZED_RULE_SOURCES" scripts/test-security-invariants.ts               # expect >=1 — the second (arm-2) fingerprint
```
R10 v3: a token that is WHOLLY a reference (`${NAME}`, `${env:NAME}`, `{{ .x }}`) followed by its OWN family's terminator is
exempt — never `,` `;` `#`, never bare `$NAME` (only `proxy_set_header` keeps `(?!\$)`); block-context patterns lost their
bare-`$` exemption; URL userinfo, observability header keys, Datadog `api:`/`key:`; arm-2 escaped-tab indent at any level.
An arm-2-only change moves the SECOND fingerprint — bump the version. Before/after any R10 change run
`scripts/replay-r10-versions.sh <base-ref>` (prod, read-only, masked; `--self-test` first): NEW-MISS must be 0, and held blobs
that move change their base identity. `scripts/measure-r10-gaps.sh` now decodes fully and counts only ADDED placeholders (the
one-level decode re-matched R10's own placeholder). Record: `cline_docs/reviews/platform-held-bytes-2026-10-13/STAGE-B-PUSH1-BUILD.md`.

**Stage B variant nets (built 2026-10-15; DEPLOYED as push 2 2026-10-15 — DRAFT, no live variant traffic until the flip; folds: V-8a keyed on the parser's directive lines + every-directive-held, `reviewedEditDiff` `not-chained-this-run`, replay drivers fail on a short pass).** Four conditional nets stamp ONLY on held-variant tasks
(`NOT_STAMPED` / `not-variant-leg` elsewhere): `editApplication` (Author, + leg hoist), `heldBytes` (Harvester), `reviewedEditDiff`
(Reviewer). They are deliberately UNDECLARED in `NET_SPECIMENS` (a `legs: 'none'` declaration exempts them from E2a). On a
variant leg only: `rollbackContainment` excludes `restore H<n>` lines (`held-restore-directive`) and stamps `restore-is-held-base`
(benign) when every restore is of a BASE-held handle; `dialectLint` drops SEARCH/marker lines (`heldEditSearchLines`) and scans
REPLACE/`create` lines as candidate config, PRESENCE half `presence-not-checkable-held-edit`; no classifier bump. MI-13 has a
HELD VARIANT section (0 by construction; the variant-legs control reads 0 until a variant leg runs — an ABSENCE).
```bash
grep -c "presence-not-checkable-held-edit" lib/agents/harness/dialect-lint.ts   # expect >=2
grep -c "case 'restore-is-held-base':" lib/agents/harness/rollback-containment.ts   # expect 1
```
Record: `cline_docs/reviews/platform-held-bytes-2026-10-13/STAGE-B-VARIANT-BUILD.md`.
**Phase 10 (2026-10-17, DEPLOYED 2026-10-17 (release `release_20261017_043829`; reseed cut 04:46:14.769Z)):** the MI-13 section is now **HELD LEGS** (view `_heldleg`: the retired token + obs legs composed on obs ≥ 1.10.0, keyed on `pipeline-index.json` `protocolInjection.delta`); both approval 🔴 lines exempt out-of-scope Authors (`no-edits`/`no-base`). Whole-file refusal: `held-bytes/whole-file.ts`. `PHASE10-PLAN.md` W2/W3/W8.

**Replay runner: held ctx (EF-P2-8, 2026-10-16, `6b44c9cfe`).** `replay-nets.ts` hydrates `held` from a stored variant LEAF's own
stamps (`hydrateHeldCtx`: `editApplication` / `heldBytes`; BASE-held handles from `edit-application.manifest.json` rows with a
`baseRefId`, a NAMED notice when unrecoverable — a rolled-back manifest carries none), passes the authoritative execution id, and
builds the ctx task as production does (`netCtxTask`: no title). ⚠️ **Replay-tool mover:** a value leg's `derivationContainment`
now records the execution id (it recorded null) — a byte-identity replay whose BASE tree predates `6b44c9cfe` shows those lines.
Pinned: `test:replay-nets-held` (battery). New variant `heldBytes.reason` values: `capture-off`, `no-files` (PC-P2-3).
```bash
grep -c "export function hydrateHeldCtx" scripts/replay-nets.ts   # expect 1
grep -c "export function netCtxTask" scripts/replay-nets.ts   # expect 1
```

## held-k8s step 1 (2026-10-18 — DEPLOYED 04:23:03Z, release `release_20261018_041900`): quoteFidelity v2 lane, K-4 rule, persist elision

```bash
grep -c "export const QUOTE_FIDELITY_VERSION = 8" lib/agents/harness/quote-fidelity.ts   # expect 1 — re-measured 2026-11-01 (later): v8 (the pairing path bounded by PAIRING_MATCH_BUDGET, QUOTEFIDELITY-PAIRING-COST) superseded v7. Before that 2026-11-01: v7 (document ties broken by matched-then-gapCost, QUOTE-PAIRING-TIE) superseded v6. Before that 2026-10-31: v6 (excerpt-labelled file-lane blocks read strictly + best-occurrence alignment and label line ranges, QUOTE-FIDELITY-EXCERPT-BLIND / QUOTE-ALIGNMENT-AMBIGUITY) superseded v5. Before that 2026-10-26 (push 2): v5 (g) superseded v4; v4 (batch 2a, the device claim narrowed) superseded v3; re-measured 2026-10-25: v3 (device-read claims, held-network step 3 P6) superseded v2
grep -c "export const FILE_LANE_KEYS" lib/agents/harness/quote-fidelity.ts               # expect 1
grep -c "resolvedService" lib/agents/harness/raw-tool-witness.ts                         # expect >=3
grep -c "if (desiredState) {" lib/agents/harness/rollback-containment-enrichment.ts       # expect 1
grep -c "elideGitFileSourceStatus(" lib/services/execution-artifacts.ts                  # expect 1
```
- **quoteFidelity v2 (1e):** the lane is `RawToolDocument.resolvedService` (envelope `data.targetService`, else arguments) + the tool
  leaf ∈ `FILE_LANE_KEYS` (every descriptor entry with `files`, incl. `github-service.get_file_contents`). The tool-leaf arm and the
  `files.` path arm are RETIRED. `doc.tool` (stamped `source.tool`) is unchanged. Movers: `version` on every recomputed stamp; `lane`
  file-artifact → other on a rig COPY (M2) and a non-descriptor `files.` key; an id-addressed rig keeps the lane. `FILE_ARTIFACT_TOOLS`
  stays for the lab's order pin. The witness is shared with `rollbackContainment` E1 — the added field moves nothing there.
- **K-4 (1f):** a desired-state lane that is held-capable returns `restore-is-held-base` only when every rollback directive is
  BASE-held and nothing else remains, else `lane-not-supported` — never the content arms. Inert until k8s is held-capable (step 3);
  pinned via `computeRollbackContainmentFact`'s 3rd arg `deps.isHeldCapable` (a test seam).
- **G-1 (1g):** the result.json toolCalls builder replaces a Git file source's status line / directory listing at `content[0]` before
  the 50 KB size test; capture's R4 rule accepts the listing placeholder so a replay over stored records keeps parity.
- **R10 measurement (1i):** `scripts/check-held-r10-lab-repo.ts --measure` — secretGenerator literals and a Helm `token:` value would
  be held in plaintext; SOPS / Helm Secret templates are over-refused `secret-manifest` (STEP1-BUILD §2 finding 8).
Record: `cline_docs/reviews/held-k8s-2026-10-18/STEP1-BUILD.md` (plan SYNTHESIS v3 §6).

**Late addition (2026-10-18):**
```bash
grep -c "export function captureOutcome" scripts/check-held-r10-lab-repo.ts   # expect 1 — capture's own pieces in capture order (G-5 → legacy checks → canonicalBase R10 on)
```
Run `--repo <clone>` (controls: workload `redactedCount 0`, fixture refused `secret-manifest` and R10-alone ≥ 1) and `--measure`
before any R10 or G-5 change (registers HELD-K8S-R10-GITOPS-SHAPES, HELD-K8S-G5-OVERREFUSAL).

## R10 v4 — R10-CODE-ASSIGN (2026-10-19, held-k8s shadow window A-K3; every expectation run before it was written)

R10 v3 corrupted credential-named CODE assignments at persist (Rego `key := sprintf(...)` → `key <<REDACTED-SECRET>> sprintf(...)`; the chained
Reviewer then refused a policy that could not compile). v4 narrows two rules and adds one; every config form is pinned unchanged.
```bash
grep -cF '[:=](?!:?=(?:\s|' lib/agents/harness/redact-artifact-secrets.ts   # expect 1 — rule 23 refuses only a bare `=`/`:=` OPERATOR (spaced Rego/Go `:=` kept; no-space Makefile/dotenv literals still redacted — sec-ops R10v4 B-2)
grep -cF ':=[ \t]*\\?(["' lib/agents/harness/redact-artifact-secrets.ts      # expect 1 — the new rule: a quoted (" ' `) `:=` literal is redacted, incl. arm-2 `\"` (SF-1)
grep -cF '\s+)((?!:?=(?:\s|' lib/agents/harness/redact-artifact-secrets.ts      # expect 1 — rule 28: a bare `=`/`:=` operator is never the device value; `key 7 =X` redacted whole (B-1, no self-masking)
grep -c "'paichart.r10/4':" scripts/test-security-invariants.ts               # expect 2 — the plain + arm-2 fingerprint rows (never edit a row)
```
Replay (`scripts/replay-r10-versions.sh HEAD`, read-only): 0 of 220,227 stored leaves move — stored text is R10 output and holds no raw
credential-named `:=` line, so the replay proves "no config-form regression", not the gain (the fixtures prove the gain).
Review: `cline_docs/reviews/held-k8s-2026-10-18/REVIEW-sec-ops-R10v4.md` (GO-WITH-CHANGES 86; B-1/B-2/SF-1/SF-2 folded). **v3 never protected a `:=`
secret** (`token := "ghp_…"` → `token :<<R>> "ghp_…"`, count 1 — self-masking); 0 stored artifacts/held blobs carry that shape (checked 2026-10-19).
**K8S-HUNK-COUNT (filed):** the package form check is terraform-scoped; a k8s Author's hunk-header undercount reached its Reviewer
(window A-K5). Measure the k8s Author corpus before extending the check.

## held-k8s step 3 / L-K2 — edit grammar + authoritative read (2026-10-19; every expectation run before it was written)

```bash
grep -c "SUPERSEDES the variant list" lib/agents/harness/held-bytes/edits.ts      # expect 1 — the label-token PROPERTY rule (≤ 5-char label with a non-letter before the machine heading); never re-add a variant list
grep -c "'heldBytes'" lib/agents/harness/authoritative-result-read.ts            # expect >=3 — the Harvester's heldBytes field (G-4 reads the authoritative Harvester execution through it)
```

## held-network step 2 pre-push (2026-10-25; text-only commit `947e5f475`; every expectation run before it was written)

Nets byte-identity replay, base `e4b078955` vs `947e5f475`, `--since 2026-10-14`: **198 tasks, BYTE-IDENTICAL, 0 added**. Expected by
construction: no net imports `seed-protocol-prompts.ts` or `pAIchartUniversalTemplate.ts` (only the engine and the configure handler
import the template's placeholder helpers). The window held no network leg, so this proves the code path, not a network shape.
`replay-held-capture.sh --compare`: 21/21 Git-source executions identical at both trees. **It cannot reconstruct call-time eligibility**
(the fact is non-enumerable on the record and never persisted; the replay runs `live: false`) and compares no eligibility /
`grantPovId` / `declaredBy` / `declarationSha256` column — register HELD-CAPTURE-COMPARE-ELIGIBILITY (a step-3 precondition).

```bash
grep -c "canonicalProtocolName('network-provisioning')" lib/agents/harness/held-bytes/variant.ts   # expect 3 — re-measured 2026-10-26 (push 3 text commit): Git file source (WI-B10 1c) · DEVICE_SOURCE_PROTOCOLS (2b) · the HELD_JOIN_VERSIONS row (J1); the HELD_JOIN_AWAITING_TEXT entry was removed with the join text
grep -c "compareCapture(" scripts/replay-held-capture.ts   # expect 1 — FIXED 2026-10-25 (step 3 batch 1 P2): compare() runs the pure compareCapture (declaration + eligibility); was an eligibility count of 1 (only planRows copied it)
```

## held-network step 3 batch 1 (2026-10-25; P1 echo parity, P2 capture compare, P6 quoteFidelity v3; every expectation run before it was written)

Record: `cline_docs/reviews/held-network-2026-10-22/STEP3-BATCH1-BUILD.md`.
```bash
grep -c "QUOTE_FIDELITY_VERSION = 8" lib/agents/harness/quote-fidelity.ts            # expect 1 — re-measured 2026-11-01 (v8: pairing budget). Before that 2026-11-01 (v7: document ties). Before that 2026-10-31 (v6: excerpt strict + alignment). Before that 2026-10-26 (push 2): v5 (g) hierarchy forms superseded v4 (batch 2a, the device claim narrowed); v3 = device-read claims
grep -c "^function globMatch" lib/agents/harness/quote-fidelity.ts                    # expect 1 — the LINEAR placeholder matcher (sec-ops B-1: a .+? regex was polynomial on untrusted served lines). Never go back to a regex here
grep -c "'echo-secret-residual'" lib/agents/harness/held-bytes/canonical-text.ts      # expect 2 — the refusal type + the one refusal site (self-echo, persist echoTokens, matcher overflow). Refused, never echo-redacted into B
grep -c "persistEchoTokens" lib/services/held-edit-step.ts                            # expect 6 — the step input, the correction turn, the named-state and live applier calls, the #90 recount
grep -c "persistEchoTokens" lib/services/execution-core.ts                            # expect 5 — computed once for an edit-eligible Author; handed to the step, the recount and prepareHeldPackage
grep -c "test:held-capture-compare" package.json                                      # expect 2 — the script + its battery entry (planted controls C1–C10 for replay-held-capture --compare)
grep -c "OWNERLESS NOW" scripts/report-mechanism-inventory.sh                         # expect 1 — MI-13 🔴: a CAPTURE row on an ownerless row stored with eligibility ≠ platform
grep -c "R10 echo overflow" scripts/report-mechanism-inventory.sh                     # expect 2 — MI-13 journal reader: 🔴 echoOverflow > 0 + its UNMEASURED arm (sec-ops F-NB1 C-3)
```
⚠️ The echo-parity refusal cannot be recomputed from stored data (the keyed values are never persisted): `replay-held-capture.sh
--compare` names it `unverifiable (echo)`. A device claim is judged against `other`-lane documents only — a Git file presented as the
device read is the class it exists for. Only a PERSIST truncation excuses a device finding (an 8 KB in-loop cut never does).

## held-network step 3 batch 2a (2026-10-26; R10 v9 R-1/R-2, quoteFidelity v4; every expectation run before it was written)

Record: `cline_docs/reviews/held-network-2026-10-22/STEP3-BATCH2A-BUILD.md`.
```bash
grep -c "R10_VERSION = 'paichart.r10/11'" lib/agents/harness/redact-artifact-secrets.ts   # expect 1 — re-measured 2026-11-02: r10/11 (CEOS2-ECHO-SECRET-RESIDUAL: echo matches only between placeholder spans; plain arm unchanged) superseded r10/10. re-measured 2026-10-26 (push 2): v10 the login username on a credential line (PLAIN arm — held bases move); v9 structured keys/fields + the read_more lead
grep -c "R10_STRUCTURED_RULE_SOURCES" lib/agents/harness/redact-artifact-secrets.ts      # expect 4 — the def + both §J fingerprints + its own doc line; a structured-arm change moves both fingerprints
grep -c "STRUCTURED_NOT_A_CREDENTIAL_FIELD_RE" lib/agents/harness/redact-artifact-secrets.ts  # expect 3 — a bare `token` FIELD is never taken (the platform's own lint facts carry `token`); def + use + sources
grep -c "export function pagerPersistLead" lib/agents/harness/redact-artifact-secrets.ts  # expect 1 — R-1: the persisted read_more record carries the cut line back to its start (≤ 512)
grep -c "pagerPersistLead(full, offset)" lib/agents/harness/agentic-tool-loop.ts          # expect 1 — the ONE call: pagerServe's PERSISTED record only; the model's block is unchanged
grep -c "QUOTE_FIDELITY_VERSION = 8" lib/agents/harness/quote-fidelity.ts                 # expect 1 — re-measured 2026-11-01 (v8, pairing budget); before that 2026-11-01 (v7, document ties); before that 2026-10-31 (v6); before that 2026-10-26 (push 2, v5 (g)); v4: the device claim is a rebuilt TEXT configuration (deviceReads.excluded by reason)
grep -c "export const DEVICE_MATCH_BUDGET = 2_000_000;" lib/agents/harness/quote-fidelity.ts  # expect 1 — the stanza matcher's per-leaf comparison budget (sec-ops B-2); past it a finding with budgetExceeded
grep -c "'label-excerpt'" lib/agents/harness/quote-fidelity.ts                            # expect zero — owner H-1 (2026-10-26) DROPPED the excerpt waiver: an excerpt label is a verbatim claim; a non-zero count means it was re-added
grep -c "label-rendering" lib/agents/harness/quote-fidelity.ts                            # expect 3 — the remaining label exclusions (normalized + API/JSON/structured rendering), counted per word
grep -c "is retired: passes run over a local snapshot" scripts/replay-nets-byte-identity.sh  # expect 1 — --start-at / --base-start-at (the 2026-10-26 base-pass resume) RETIRED the same day by NETS-REPLAY-FAST-OFFLINE: an offline pass takes minutes, so the flags now refuse with this message
grep -c "R10_REPLAY_ONLY" scripts/replay-r10-versions.ts                                  # expect 2 — re-read named movers; JSON text leaves now compared STRUCTURALLY
```
⚠️ A line-by-line compare of two re-serialized one-line JSON texts read a pure formatting difference as 6 false NEW-MISS lines (k8s
configmap lists). The R10 replay now compares differing JSON text leaves by structure — read a NEW-MISS there by its `{json}` sub-path.
⚠️ v4's stanza matcher has NO unbounded in-order fast path on purpose: it accepted a line re-parented in document order (sec-ops SF-1).

## held-network step 3 batch 2b (2026-10-26; P3 declared device-read capture, P4 device selector, P5 Git-vs-device fact, P10; every expectation run before it was written)

Record: `cline_docs/reviews/held-network-2026-10-22/STEP3-BATCH2B-BUILD.md`.
```bash
grep -c "^export function" lib/agents/harness/device-sources.ts                         # expect 14 — re-measured 2026-11-04 (Config-sources push 1a Phase A, bf15fbaf9: +__setLiveReadKindForLab +liveReadKindEnabled +assertNeverKind +grammarVersionOfEntries — the live-read kind gate, its lab lever and the kind-exhaustiveness default). Was 10 — re-measured 2026-10-26 (push 2): +buildDeviceSourcesSnapshot +readDeviceSourcesSnapshot +sameDeclaration (O-2). Was 7 — the ONE strict Device sources grammar (line, lines, block, contract value, leg resolution, URL test, contract key); a contract value's ONE leading heading line is dropped (prod: the Architect copies it)
grep -c "export const DEVICE_READ_DESCRIPTORS" lib/agents/harness/held-bytes/descriptors.ts   # expect 1 — the DECLARATION-keyed device lane (never in PLATFORM_DEFAULT_DESCRIPTORS: none of its pins move)
grep -c "function extractDeviceRead" lib/agents/harness/held-bytes/extract.ts            # expect 1 — declared device of a declared service only; no config output ⇒ notAConfigRead (no row)
grep -c "readLegDeviceSources(" lib/services/execution-core.ts                            # expect 1 — ONE leg read per network leaf, handed to capture AND primed into the nets' ctx.deviceSources
grep -c "name: 'deviceSourceReads'\|name: 'gitDeviceComparison'" lib/agents/harness/mechanical-nets.ts   # expect 2 — APPENDED, NOT_STAMPED off a network leg (not-device-source-leg)
grep -c "deviceSourceReads', 'gitDeviceComparison', 'liveEvidence'\] as const" lib/services/execution-artifacts.ts   # expect 1 — the OPERATOR TAIL (re-measured 2026-11-04: +liveEvidence appended, Config-sources push 1a — which is ALSO on the summary whitelist, deliberately; the two device facts are not)
grep -c "GIT_DEVICE_COMPARISON_READERS" lib/agents/harness/context-chainer.ts            # expect 3 — the comparison reaches the Architect and the leg Reviewer ONLY (the Author also chains the Harvester)
grep -c "CREATE TEMP VIEW _devsrcleg" scripts/report-mechanism-inventory.sh               # expect 1 — MI-13 DEVICE-READ lane block; pinned equal to DEVICE_SOURCE_PROTOCOLS by test-device-read-capture C16
```
⚠️ The comparison reports EOS's own normalisation (`network` lines rendered under `address-family ipv4`) as `moved` — a true fact,
owner decision O-1 in the record. ⚠️ An agent can edit a STANDALONE leg's description (sec-ops SF-1) — the declaration must be snapshotted
immutably before network joins `HELD_JOIN_VERSIONS` (J1 entry gate). Corpus runners: `replay-held-capture.sh --device-sources | --device-lane`,
`HELD_REPLAY_DEVICE_LANE=off --compare-all` (the "nothing else moved" half).

## held-network step 3 push 2 (2026-10-26; O-1 + hierarchy audit, O-2 snapshot, P8, O-3 R10 v10, O-4, J1; every expectation run before it was written)

Record: `cline_docs/reviews/held-network-2026-10-22/STEP3-PUSH2-BUILD.md`.
```bash
grep -c "^export function" lib/agents/harness/config-hierarchy.ts                       # expect 6 — the ONE hierarchy-form classifier (indent · braces · set · flat parsed; braces-unindented NOT parsed), shared by gitDeviceComparison and quoteFidelity (g)
grep -c "GIT_DEVICE_COMPARISON_VERSION = 2" lib/agents/harness/git-device-comparison.ts  # expect 1 — v2: inside-sub-block (parent chains only, no vendor keyword) + forms + two not-compared states
grep -c "DEVICE_SOURCES_SNAPSHOT_KEY" lib/agents/harness/prepare-task-for-execution.ts    # expect 2 — the import + the ONE writer (first execution, same statement as the protocol stamp)
grep -c "'deviceSourcesSnapshot'" lib/tasks/services/protected-task-metadata.ts           # expect 1 — an AUDIT_STRIP_KEYS member: no client surface (MCP included) can write it
grep -c "export const GIT_LINE_DESCRIPTORS" lib/agents/harness/held-bytes/descriptors.ts  # expect 1 — P8: the declared LINE is the pin for an unpinned customer Git row (declaration-keyed; no default pin moves)
grep -c "withDeviceEvidenceOnly(extractDeclaredFiles(" lib/services/held-bytes-capture.ts  # expect 1 — one held base per device (owner Phase-0 4b): capture only; the device facts read the extractor's own result
grep -c "deviceForce = deviceReadForce(" lib/agents/harness/held-edit-carrier.ts    # expect 1 (re-pointed 2026-10-26 after the sec-ops SF-1 fold changed the call to read the snapshot) — O-4: a declared device-read device with no held base forces device-read-not-held
grep -c "export const HELD_JOIN_AWAITING_TEXT" lib/agents/harness/held-bytes/variant.ts   # expect 1 — J1: network joined at 1.25.0; push 3's text commit emptied the list, so network is held-capable (pinned both ways)
grep -c "('network-provisioning-protocol', '{1,25,0}'::int\[\])" scripts/report-mechanism-inventory.sh   # expect 1 — MI-13 _heldjoin carries the J1 pair
```
⚠️ The governing Device sources declaration is the leg's FIRST-EXECUTION snapshot: every leg first executed before push 2 reads
`snapshot-absent` (holds nothing; the replay predicts that by default — `HELD_REPLAY_ASSUME_SNAPSHOT=live` is a measurement knob only).
⚠️ Held capability still keys on the protocol NAME; `HELD_JOIN_AWAITING_TEXT` was the static switch — push 3's text commit flipped it (now empty).

## held-network step 3 push 3, code half (2026-10-26; owner D-1 — the device force generalised; every expectation run before it was written)

Record: `cline_docs/reviews/held-network-2026-10-22/STEP3-PUSH3-CODE-BUILD.md`.
```bash
grep -c "'git-file-not-held'" lib/agents/harness/held-edit-carrier.ts                    # expect 2 — the family's first reason (a declared git-file device whose Git file is not held; a held device config never stands in) + its DEVICE_NOT_HELD_REASONS entry
grep -c "export const DEVICE_NOT_HELD_REASONS" lib/agents/harness/held-edit-carrier.ts    # expect 1 — the reasons that carry device lists (gitFileDevicesNotHeld / devicesNotHeld)
grep -c "r.state === 'absent') return null" lib/agents/harness/held-edit-carrier.ts       # expect 0 — D-1 item 2: a snapshot declaring NO block forces device-sources-absent (fail closed); a return here re-opens it
grep -c "function platformPinRefusesRef" lib/agents/harness/held-edit-carrier.ts           # expect 1 — sec-ops SF-1: a platform-pin-repo line at a ref the pin never admits is never satisfied (CAPTURE refs carry no ref name)
grep -c "const gitDeclared = new Set(scope.gitLines.map((l) => l.device));" lib/agents/harness/held-bytes/extract.ts   # expect 1 — D-1 + Q1: a device DECLARING a Git file never holds its device read (evidence only, held Git file or not; per device)
grep -c "held legs forced git-file-not-held" scripts/report-mechanism-inventory.sh        # expect 1 — MI-13 HELD LEGS named control (+ device-sources-absent control, two device-force 🔴 lines)
```
⚠️ Replay `HELD_REPLAY_ASSUME_SNAPSHOT=live scripts/replay-held-capture.sh --device-lane` prints the `carrier` reason (source-not-pinned beats the
device force); the D-1 `git-file-not-held` on N-L3-shaped legs sits UNDER a stored `source-not-pinned` — it is what forces a CUSTOMER Git row's refusal.

## NETS-REPLAY-FAST-OFFLINE (2026-10-26; the byte-identity replay reads an offline snapshot; every expectation run before it was written)

```bash
grep -c "^SNAP_TABLES=" scripts/replay-nets-byte-identity.sh                               # expect 1 — the ONE list of tables the snapshot holds; a table a net newly reads joins it (then take a fresh snapshot)
grep -o "agent_templates" scripts/replay-nets-byte-identity.sh | wc -l                     # expect 3 — joined via a RELATION FILTER (leg-reviewers / plan-spawn-carry `where: { agentTemplate: … }`), invisible to a model-name derivation; found by the fail-loud check on its first pass
grep -c "xact_rollback" scripts/replay-nets-byte-identity.sh                               # expect 2 — FAIL LOUD: the scratch DB's rollback counter must not move over a pass (client-agnostic; catches an error an enrichment swallows into a could-not-check fact)
grep -c "is inside a git work tree" scripts/replay-nets-byte-identity.sh                   # expect 1 — the snapshot is production data: refused inside any repository checkout
```
- **The premise "one ts-node process per task" was wrong**: `xargs -a ids.txt` already batched all 3,087 ids into ONE process (128 KiB
  buffer). The hours were per-query latency to production over the tunnel; the local snapshot is what removed them.
- **Excluded columns** `mcp_tools.credentials`, `mcp_tools.configuration` do not exist in the scratch DB, so a future net reading them
  fails loud instead of reading `{}`. Every non-snapshot table is DROPPED there for the same reason — never left present and empty.
- **Two fail-loud layers**: a snapshot lacking a table the script now lists is refused before any pass; a read of a table the LIST
  itself misses errors in the scratch DB and the pass fails on the rollback counter.
- **Acceptance**: the push-2 run (254 tasks) and the batch-2a run (3,087) reproduced byte-identically from the snapshot (`base.out`,
  `new.out`, `replay.diff`); timings and the negative controls in `cline_docs/reviews/nets-replay-fast-offline-2026-10-26/BUILD.md`.

## F-N2-1 — an unnamed unheld entry no longer sinks a held package (DEPLOYED with push 3, 2026-10-27 00:50:42.743Z; expectation run before it was written)

```bash
grep -c "export const NAMING_EXEMPT_STATES" lib/agents/harness/held-bytes/apply.ts   # expect 1 — only unheld/base-not-held are exempt when the package does not NAME them (shared applier, every held domain)
```
Evidence-only device reads get no handle. Record: `cline_docs/reviews/held-network-2026-10-22/F-N2-1-BUILD.md`; close-out `NETWORK-CLOSEOUT.md`.

## 2026-10-31 — quoteFidelity v6 (QUOTE-FIDELITY-EXCERPT-BLIND + QUOTE-ALIGNMENT-AMBIGUITY; every expectation run before it was written)

```bash
grep -c "^export function alignmentCandidates" lib/agents/harness/quote-fidelity.ts   # expect 1 — candidate alignments (first/last occurrence + forward/backward from each anchor occurrence); scored matched-then-gapCost, a tie keeps v5's
grep -c "^export function labelLineRange" lib/agents/harness/quote-fidelity.ts        # expect 1 — a label's "lines X–Y" is the claimed span (honoured only when it holds the block)
grep -c "e.findingCount < chosen.findingCount" lib/agents/harness/quote-fidelity.ts   # expect zero — alignments are NEVER scored by findings (an exemption-aware score games the wholeDoc rule; run 2's header vanished under that mutation)
ls scripts/fixtures/quote-fidelity/align-oct17-author.json scripts/fixtures/quote-fidelity/align-oct28-harvest.json | wc -l   # expect 2 — the live specimens of the two replay movers
```
Depth: library § "quoteFidelity v6".


## 2026-11-01 — quoteFidelity v8 (QUOTEFIDELITY-PAIRING-COST: the pairing path bounded; every expectation run before it was written)

```bash
grep -c "export const PAIRING_MATCH_BUDGET = 4_000_000;" lib/agents/harness/quote-fidelity.ts   # expect 1 — per-leaf pairing budget, the DEVICE_MATCH_BUDGET style; past it a block is a `budgetExceeded` finding (NOT CHECKED, empty, escalating) and `blocks.budgetExceeded` counts them
grep -c "^function nonBlankOf\|^function gapIndexOf" lib/agents/harness/quote-fidelity.ts   # expect 2 — the per-document indexes that make every gap scan output-identical and fast (non-blank lines; inline-stripped / whitespace / head-token keys)
grep -c "const freeFrom = " lib/agents/harness/quote-fidelity.ts   # expect 1 — the per-segment cursor: a consumed window line is skipped once, not once per later quote line (mutation: without it 3,000 redacted lines bail on the budget)
```
- Hot spots (profiled, all pre-existing since v6 or earlier): the window rebuild per unaligned quote line (blank lines: 60,000 blanks ≈ 4.3–5.9 s);
  `alignmentCandidates` filtering every occurrence per quote line (60,000 identical lines ≈ 9–15 s); the window's linear checks on non-blank
  documents (≈ 31–40 s); the similarity scan over same-head lines (a `set …` config: > 120 s). After: each ≤ ~0.6 s, the last bails on the budget.
- Nets replay, fresh snapshot 20261031t230723z (0 in flight), 3,251 tasks: v8 = 781 lines, every one `quoteFidelity` `version` 7→8 (781 stamps), 0 other,
  0 `budgetExceeded`; the output-identical half alone (`2cdbf271a`) BYTE-IDENTICAL. Live fixture specimens use ≤ ~1k units of 4M.

## 2026-11-01 — quoteFidelity v7 (QUOTE-PAIRING-TIE: document ties; every expectation run before it was written)

```bash
grep -c "^function alignToDocument" lib/agents/harness/quote-fidelity.ts   # expect 1 — v6's alignment + gap analysis of one block against ONE document; analyseBlock runs it per document tied on the line-set count
grep -c "c.matched > win.matched || (c.matched === win.matched && c.gapCost < win.gapCost)" lib/agents/harness/quote-fidelity.ts   # expect 1 — the document tie-break: matched FIRST, then gapCost, strict < (a remaining tie keeps the first document). gapCost alone leaves the live instance on the Git file
ls scripts/fixtures/quote-fidelity/tie-net-harvest.json | wc -l   # expect 1 — the live specimen (cmvq3k6on, the Harvester): Git file first in call order, quote taken from the ceos1 device read
```
Depth: library § "quoteFidelity v7". Measurement: `cline_docs/reviews/quote-pairing-tie-measure-2026-11-01/RESULT.md`.

## 2026-10-31 — HS-FU5: the §6 marker line renders only where the bound protocol mandates markers (every expectation run before it was written)

```bash
grep -c "export const PROTOCOL_MARKER_MANDATES" lib/agents/harness/protocol-marker-mandates.ts   # expect 1 — the RUNTIME projection of the seed's required `emitsMarkers`; `test:protocol-marker-mandates` M1 pins the two equal both ways (the seed stays the declared source, beside the prose)
grep -c "protocolMandatesNoMarkers(opts.boundProtocol)" lib/agents/harness/render-pipeline-context.ts   # expect 1 — suppression needs a KNOWN 'none' protocol; unknown/absent renders as before (fail toward rendering)
grep -c "namedProtocolOfTemplate(context?.agentTemplate)" lib/agents/harness/build-agent-prompt-body.ts   # expect 1 — the ONE wiring site (engine and stream route both build through it), from the same template the system prompt injects from
```
- Proof (snapshot 20261031t005009z, 2,317 stored inputContexts rendered through `buildAgentPromptBody`, base vs new): 2,248
  byte-identical, incl. every infra domain (k8s 269, network 479, network-derivation 48, observability 226, the retired obs-held
  variant 15, terraform 369, pov-program 595); the ONLY movers are requirements-authoring 69 (58 Authors via the Harvester's entry +
  11 pre-EF-M2 Reviewers), each losing the marker line. DEPRECATED rows are NOT projected (unknown ⇒ render): the obs-held tombstone
  declares `'none'` while its live body mandated Consumed Values — projecting it moved 15 renders and the lab's HB3. Template binding
  = stored `protocolInjection.protocolNames[0]` on every row that has both (0 mismatches).

## 2026-10-31 — D3: a Derived Values entry equal to an upstream derived value is checked as CONSUMED (K8S-ARCHITECT-CONSUMED-AS-DERIVED; every expectation run before it was written)

```bash
grep -c "^function transcribeUpstream" lib/agents/harness/derivation-containment-enrichment.ts   # expect 1 — the upstream transcription, HOISTED (pure, computed exactly as the inline block did) so the reroute compares against the SAME union check 1 uses
grep -c "if (carried) fact.carriedInDerivedBlock = carried;" lib/agents/harness/derivation-containment-enrichment.ts   # expect 1 — the FACT, nested in derivationContainment (E3b), stamped only when an entry was rerouted
grep -c "carriedInDerivedBlock" lib/mcp/server/tools/advanced/lean-card-facts.js   # expect 2 — the card segment (kind + value verbatim), rendered only when stamped
grep -c "^    await test('D3 " scripts/test-containment-enrichment-branches.ts   # expect 7 — the three live shapes (k8s Architect, obs Author, tf Author), two negatives, mixed, check-1 equality
```
- Equality is check 1's own (`checkConsumedValues`: CIDR by range, asn canonical); the pure (publicly mirrored) module is untouched.
- Nets replay (snapshot 20261031t005009z, 3,223 tasks): movers = exactly the k8s leg `cmvr9ru4e…` and the obs leg `cmu7h6esj…`.
  The tf record (`cmuqryaks…`) does NOT move: since the parse-steal fix (`8fe8ad56`, 2026-10-04) today's parser reads its Derived
  block ✗, so its leg already stamps `consuming-leg-consumed-discharged`; its stored 10-02 `checked-clean` predates that fix.

## R10 v11 — CEOS2-ECHO-SECRET-RESIDUAL (2026-11-02; built, not pushed; every expectation run before it was written)

An echo-eligible model mask (an unclosed `<REDACTED` written after a directive; a `\S+` rule takes it as the token) matched INSIDE
`<<REDACTED-SECRET>>`: the persist stored garbled placeholders and `canonicalBase` refused a clean held file `echo-secret-residual`
(devext ceos2). Fix: `redactEchoes` runs each trie over the whole text and returns a match unchanged only when it lies ENTIRELY inside a `PLACEHOLDER_ANY` span (spans recomputed per trie). NOT a split on the spans: sec-ops finding 1 showed a split lets a span swallow a literal's own `>`/`<` edge (kept in clear); a straddling match still garbles the span (over-redaction, canonicalBase refuses). One shared function, so
the persist, the held-edit applier and `canonicalBase` stay in step. Plain arm, B and every held base unchanged; version bumped because
persisted bytes move (un-garbling only) and the echo sources ride both §J fingerprints.

```bash
grep -c "export const PLACEHOLDER_ANY" lib/agents/harness/redact-artifact-secrets.ts          # expect 1 — ONE definition (moved from canonical-text.ts, which imports it)
grep -c "function replaceOutsidePlaceholders" lib/agents/harness/redact-artifact-secrets.ts   # expect 1 — the only place redactEchoes applies a trie
grep -c "echo:not-contained-in-placeholder-span" lib/agents/harness/redact-artifact-secrets.ts  # expect 1 — rides R10_ECHO_RULE_SOURCES ⇒ both fingerprints
grep -c "R10 v11" scripts/test-security-invariants.ts                                         # expect >=11 — unit, adjacency control, two-trie, persist both directions
grep -c "ECHO v11" scripts/test-held-bytes-canonical.ts                                       # expect 2 — the devext shape (synthetic) held + its real-echo control
```

Replay v10 → v11 (read-only, prod): result.json 1,865 · report.md 708 · held_blobs 73 · persist 1,865 — 0 moved, NEW-MISS 0. Lab
echo measure (3,624 raw role outputs): byte-identical v10 vs v11. ⚠️ A stored result.json is POST-persist, so a placeholder already
stored garbled is never un-garbled by a replay: count garbled rows with the FINDINGS query, not with the replay.

## 2026-11-04 — Config-sources PUSH 0: the read record matches refs normalised (no version bump; series cut with 0 measured movers)
`deviceSourceReads` (v1) / `gitDeviceComparison` (v2) compare a Git read's ref with the line's ref after folding absent ⇒ `main` and `refs/heads/<x>` ⇒ `<x>`
(execution-facts design-review B1; sec-ops PUSH0 S-2). Pinned by `test:git-device-comparison` F-P0 (mutation-checked). Nets replay over 393 tasks:
byte-identical. Decision S-6 (series cut instead of a version bump) is this domain's to confirm.
```bash
grep -c "normalisedRef(args.ref) === normalisedRef(e.ref)" lib/agents/harness/device-source-facts.ts   # expect 1
grep -c "r.startsWith('refs/heads/') ? r.slice('refs/heads/'.length) : r" lib/agents/harness/device-source-facts.ts   # expect 1
```

## 2026-11-04 — Config-sources network push 1a, fact half: `liveEvidence` (built on `cs-net-1a-facts`, not pushed; every expectation run before it was written)
For each declared device: live configuration read whole, a live read declared but not read whole, a Git file only, or no read applies
(`command-package`). Counts first, plus capped name lists. It is computed through the ctx memo's ONE read record, shared with
`deviceSourceReads`. VERSION-KEYED: NOT_STAMPED unless the persisting execution's own `protocolInjection.delta` is network-provisioning
≥ 1.26.0, so every stored leg replays byte-identical. The Author transcribes the Harvester's stamp, the leg hoists it through
`selectLegChildStamp`, and §6 renders it to `LIVE_EVIDENCE_READERS`. There is NO card segment (owner G4-b). It is never a gate and
never a `containmentDisposition` reason. Record: `cline_docs/reviews/config-sources-design-2026-11-04/PUSH1A-FACTS-BUILD.md`.
```bash
grep -c "^    name: 'liveEvidence'" lib/agents/harness/mechanical-nets.ts   # expect 2 — leaf-persist + leg-synthesize, the LAST two entries (LE8)
grep -c "liveEvidence" lib/services/execution-artifacts.ts   # expect 7 — OPERATOR_TAIL_KEYS + the E3b note + (VALUE-LEG-GIT G2-d, 2026-11-06) the NARROW value-card hoist `RESULT_JSON_SUMMARY_NARROW_KEYS` and its guard/comments; still NOT on SUMMARY_KEYS (owner decision 6) — re-measured 2026-11-07, was 2
grep -c "LIVE_EVIDENCE_READERS" lib/agents/harness/context-chainer.ts   # expect 4 — the set, its doc, the leaf-only role-scoped carry
grep -c "liveEvidence" lib/mcp/server/tools/advanced/lean-card-facts.js   # expect 3 — the VALUE card only (VALUE-LEG-GIT G2-d, 2026-11-06: `liveEvidence: <word> (declared devices)` beside `value:`); change-leg cards still carry none (G4-b DEFER stands for them, flips with the Node C batch) — re-measured 2026-11-07, was 0
grep -c "'1.26.0'" lib/agents/harness/live-evidence.ts   # expect 1 — LIVE_EVIDENCE_MIN_VERSIONS; MI-13 carries the same pair (LE14)
grep -c "LIVE_EVIDENCE_SCOPE_CLAUSE" lib/agents/harness/live-evidence-render.ts   # expect 2 — F-fold 2026-11-05: the const + the checked line; the summary word is OF THE DECLARED DEVICES on every word (LE10b)
grep -c "CONTRACT_NOT_DECLARED_LABEL" lib/agents/harness/live-evidence-render.ts   # expect 2 — contract-devices fold 2026-11-05 (owner option 1): the const + the one §6 sub-line; data-only names, no scope word (LE16)
grep -c "no-device-list" lib/agents/harness/live-evidence.ts   # expect 3 — the four stored deviceSources shapes: no list, a prose note (nothing parses) and the doc table (LE18)
```

## 2026-11-07 — `derived-value-held`: a value leg's free address that a device already holds (VALUE-FREE-ADDRESS-BLIND platform half, owner G10-c; every expectation run before it was written)
A free address lists ITSELF as its member, so the shared checker's member exemption let a harvested `/32` equal to it through and the
leg read `benign checked-clean` (lab L-VLG F-2). Now, on a VALUE leg only, a cidr derived value in the self-member shape that equals or
contains a harvested allocation the exemption let through stamps `derived-value-held` (derived, harvested, and the harvest entry's
device / interface / source) into the SAME `violations` array ⇒ `blocking (violations)` — no taxonomy change, no card or §6 change (both
already read `blocking (violations)`). Appended after the shared checker in `value-leg-containment-enrichment.ts`; the publicly mirrored
`derivation-containment.ts` is untouched (its private `cidrRange` is copied verbatim, VFH5 pins the copy). INERT BY CONSTRUCTION: a stamp
without a collision gets no new field. Corpus 2026-11-07 (snapshot `20261106t195504z-4f52f2f609`): nets replay 3,302 tasks, 0 changed; 20
stored value-leg Architects, 5 in the free shape (10 entries), 0 hits. ⚠️ NEVER extend it to change legs as is: the same shape on 2
RELEASED kubernetes-gitops Authors is a host list of held pod addresses (10.244.0.5/32, .6/32) — the self-member shape is not "free" there.
```bash
grep -c "derivedValueHeldViolations" lib/agents/harness/value-leg-containment-enrichment.ts   # expect 2 — the definition + the one call after checkDerivationContainment
grep -c "^function cidrRange(" lib/agents/harness/value-leg-containment-enrichment.ts   # expect 1 — the verbatim copy (VFH5 compares it to derivation-containment.ts)
grep -c "derived-value-held" lib/agents/harness/derivation-containment.ts lib/agents/harness/derivation-containment-enrichment.ts   # expect 0 and 0 — value legs only; the mirrored module is untouched
```

## 2026-11-07 — the change lane's `git-only` word, released with network-provisioning 1.27.0 (network text batch 1; every expectation run before it was written)
`liveEvidenceOptionsFor` (now exported) gives the CHANGE lane `gitOnlyWord: gitOnlyWordApplies(<the Harvester's own protocolInjection>)`
— true only at network-provisioning ≥ 1.27.0 (`GIT_ONLY_WORD_MIN_VERSIONS`), whose Reviewer sentence names the card word. The value lane
stays unconditional. Only the Harvester point computes the word; the Author transcribes and the leg hoists its stamp. Inert at push:
nets replay 3,302 tasks, 0 changed (snapshot `20261106t195504z-4f52f2f609`). ⚠️ The lab's `live-evidence-patch.ts` mirrors these
options by hand — it must take the delta too (or import the exported function).
```bash
grep -c "'1.27.0'" lib/agents/harness/live-evidence.ts   # expect 1 — GIT_ONLY_WORD_MIN_VERSIONS (LE19c pins the exact map)
grep -c "gitOnlyWordApplies" lib/agents/harness/live-evidence-enrichment.ts   # expect 2 — the import + the change-lane option
```
