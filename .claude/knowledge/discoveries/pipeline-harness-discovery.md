# Pipeline Harness Discovery

This discovery prompt provides comprehensive investigation of pAIchart's Pipeline Harness — the Layer 2 subsystem that decomposes PIPELINE tasks into specialist sub-tasks, orchestrates their execution via reactors, and aggregates their output. Use this before modifying the harness, its template, its protocol, either reactor, or any handler that gates PIPELINE-type completion.

## Overview

The Pipeline Harness shipped and was validated end-to-end on 2026-04-14:
- Three-mode execution (CREATE / ORCHESTRATE / SYNTHESIZE) auto-detected from `metadata.pipelineStageId` + child-stage state
- Two reactors wired at 6 call sites (task.update door added 2026-07-18, gap (e)) (`pipelineRetriggerReactorService` + `taskReadyReactorService`)
- Handler 3-point invariant gates completion in both `task-complete` and `task-update` paths (bypass-seal)
- Both execution paths (`agentExecutionEngine` + `stream/route`) skip `status: COMPLETED` for PIPELINE type
- First successful full-loop run: harness COMPLETED with confidence 84/100 after 4 specialist children executed in dependency order

## When to Run This Discovery

- Modifying the harness template (`scripts/seed-harness-template.ts`) or protocol (`scripts/seed-protocol-prompts.ts`)
- Adding PIPELINE-type behavior to any handler or engine code path
- Designing a new reactor that interacts with the harness
- Debugging a harness that won't progress past one of the three modes
- Investigating a confidence-score anomaly or a completion-invariant failure
- Auditing the two-path (engine + stream) drift risk after infrastructure changes

## 🆕 2026-08-17 — WS1 Phase C composition tripwires

```bash
grep -c "protocol-base" scripts/seed-protocol-prompts.ts                     # expect 2 — the tag + its comment
grep -c "delta:" lib/agents/harness/protocol-dependence-anchors.ts           # expect 8 — 3 mapped groups (interface field + doc uses included)
grep -c "the standard rule" scripts/seed-protocol-prompts.ts | head -1       # expect >= 4 — base label + x3 infra refs (pairs pinned by test:protocol-dependence-anchors)
grep "use the default orchestrator" scripts/seed-protocol-prompts.ts | grep -vc "version:"   # expect 0 — the fence fall-back is retired (escalate-on-mismatch); the version-changelog QUOTES of the deleted phrase are excluded by the -v
```
Run `npm run test:protocol-dependence-anchors` (DB) after ANY protocol seed edit — the
bidirectional count pin catches a new delta→base reference added without an anchor pair.

## 🆕 2026-08-17 — WS2 Phase A SHIPPED: the protocol STAMP (title demoted to create-time input)

F12/F10 now read `task.metadata.protocol` (canonical long name + `protocolResolvedAt`, stamped
write-if-absent at `prepareTaskForExecution`, Postgres-side jsonb merge) via
`program-protocol.ts`'s stamp-era exports; a TRANSITIONAL stamp-OR-title disjunct covers
pre-stamp tasks (removal test-gated on `BACKFILL-VERIFIED.md`; script:
`scripts/backfill-protocol-stamps.ts`, also the protocol-rename recovery path). Write-protection:
ONE shared guard (`protected-task-metadata.ts`) at all 4 client surfaces — echo accepts,
differing/novel 400s `PROTOCOL_STAMP_IMMUTABLE` (POV-bulk strips-with-warn, same code);
`task.metadata` now MERGES on every surface (BC2 C5 — it was the one field the sweep skipped).
Panel + consult + traceability: `cline_docs/reviews/ws2-phase-a-2026-08-17/`.
```bash
grep -c "enforceProtocolStampImmutable(" lib/tasks/services/task.ts lib/mcp/tasks/action/handlers/task/task-update-handler.ts lib/pov/handlers/put.ts lib/services/taskBulkService.ts   # expect 1+1+3+1 — the surface-enumerating guard set
npm run test:program-protocol-token     # EXPECT 40 — re-measured 2026-08-21 (was 32 at WS2-A authoring; +8 incl. B3 research-program second-protocol pins) (resolver/tier/filter/gate pins)
npm run test:protocol-stamp-guards      # EXPECT 20 (the ERASE pin is the load-bearing one)
```
Phase C (base+one injection) NOT started — the injection fork is untouched
(`test:system-prompt-injections` byte-unchanged is the leak detector).

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

## 🆕 2026-07-18 — born-ready family (gap e) + supersession contract (gap b) + A6 no-reviewer rule

Panel record: `cline_docs/reviews/born-ready-gap-e-2026-07-18/SYNTHESIS.md`. Mechanical pins:
`npm run test:reactor-race-guard` (45, E1.1–E2.5) + `npm run test:lean-card-facts` (41 at 2026-08-21; was 12 at authoring).
```bash
grep -c "unsatisfiedDepExistsSql" lib/services/taskReadyReactorService.ts   # EXPECT 6 — ONE shared satisfaction predicate (def + jsdoc + both consumption forms + the hasUnsatisfiedDeps wrapper, completion-path 2026-07-24); an inline EXISTS copy reappearing = drift
grep -c "'pipeline-with-deps'" lib/services/taskReadyReactorService.ts      # EXPECT 1 — CC6: PIPELINE-with-deps keeps the blanket skip (dep-completion reactor is the ONLY auto-start path for PIPELINE children; the pov-program plan-gate design derives from this)
grep -c "maybeQueueIfDepFree" lib/mcp/tasks/action/handlers/task/task-update-handler.ts   # EXPECT 2 — the 6th call site (dep rewrite / template attach fires post-commit)
grep -c "executionStatus !== 'FAILED'" lib/mcp/tasks/action/handlers/task/task-update-handler.ts   # EXPECT 1 — frozen-cone guard: a dep rewrite must never un-terminalize an OPEN+FAILED cone member (re-enable = explicit agent.execute)
grep -c "reviewerPresent" scripts/seed-protocol-prompts.ts   # EXPECT 7 — A6 provenance fact: Step 5 dual-branch approved rule (fact-derived when no reviewer) + HOWTO qualityGate branch; green shield w/ reviewerPresent:false = "ran clean, no QA gate", never QA-vetted
grep -c "superseded:" scripts/seed-protocol-prompts.ts   # EXPECT 2 — gap (b): PLAN-SPAWN supersession contract (cannotRun state channel; supersede BEFORE wiring dependents; title/comment disposal forbidden)
grep -c "silent" lib/agents/harness/verdict-mismatch-guard.ts   # EXPECT 1 — reviewer-LESS pipeline: verdict===null silence is CORRECT (never "harden" into a mismatch); Phase-2 verdict consumption must gate on reviewer-present
```
Ruling registered same day: **BLOCKED stays NON-terminal permanently** (terminal set closed:
COMPLETED | executionStatus=FAILED) — automation-loop-closure-architecture.md "Ruling" section.

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
npm run test:dialect-lint                                                   # expect 27 — re-measured 2026-08-24 (was 16; +11 PRESENCE-half fixtures pinned on the live R7 package and its one-line fix, mutation-verified). Prior note: 2026-08-23. Fixtures are LIVE campaign text: R1/R3 defect packages + the R6 CLEAN winner (the false-positive trap: it names every banned token in prose)
grep -c "^export function" lib/agents/harness/dialect-lint.ts               # expect 5 — re-measured 2026-08-26 (was 3): runDialectLint + extractBannedTokens + extractCanonicalStanzas + canonicalStanzaNeedles (shared with contract-propagation-enrichment, so a change to what counts as a required line reaches BOTH consumers) + splitStanzaLines (separator tolerance, IGP-T1 R12). The two extractors are exported so the wiring layer and tests can reuse the contract-shape-tolerant extraction (contracts have used bannedTokens/banned_token_list and canonicalIsisStanza/canonicalStanza_P1_template/canonicalStanzaExemplar across rounds)
grep -rn "runDialectLint" lib/ --include="*.ts" | grep -v "lib/agents/harness/dialect-lint.ts"   # expect 4 — re-measured 2026-08-25: PHASE 2 LANDED and this tripwire FIRED exactly as written. All 4 hits are dialect-lint-enrichment.ts (import + call + 2 comment refs); the engine call site is execution-core.ts, which calls computeDialectLintFact, not runDialectLint directly. Its former text was a zero-expectation tripwire promising that a non-zero result meant Phase 2 had landed and every "it gates nothing" claim in this section and the specialist config was stale — it did, they were, and both were corrected the same day. (The old expectation is described here rather than quoted: a literal expect-N string inside prose is read by audit-discovery-greps.sh as a live expectation, which is how this very line reported a false REGRESSION on its first pass.) SECOND time in two days a documented grep predicted its own obsolescence and the audit caught the drift
grep -c "fencedBlockLines" lib/agents/harness/dialect-lint.ts               # expect 2 — definition + its single call site; the prose-exemption mechanism (a whole-document scan would flag the clean round)
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
grep -c "derivationContainment" lib/services/execution-core.ts              # expect 3 — the CALL SITE + non-throw catch only. The enrichment LOGIC moved out 2026-07-30 (see next line)
grep -c "derivationContainment" lib/agents/harness/derivation-containment-enrichment.ts  # expect 3 — the extracted enrichment (3rd = the 2026-08-02 harvest-precondition note: the checker is unreachable without a parseable harvest block, which is correct for RELATIONAL properties and a real limit for UNARY ones like asn range policy); extracted so scripts/replay-containment.ts can run it against a real completed leg in SECONDS instead of needing a 30-50min program run + rig. Three defects shipped while it was only reachable by a full run, each "verified" by reading source
grep -c "## Derived Values" scripts/seed-protocol-prompts.ts                # expect 9 — MEASURED 2026-08-16 (was 5): network Phase-1 contract refs + pov-program taxonomy refs + the terraform-iac v1.2.0 port (Derivation-evidence section + bullets)
grep -c "prefix-not-minimal" lib/agents/harness/derivation-containment.ts   # expect 6 — re-measured 2026-08-21 (+1 comment from the 2026-08-19 misaligned-prefix commit d546d55d). The THIRD violation class (2026-07-30). An aggregate can cover its members, swallow nothing foreign, and still be LOOSER than minimal: Run 15 shipped 10.99.0.8/30 for members .8/.9 (minimal /31), authorizing 2 addresses no exporter used. It passed the Author, the leg reviewer, this checker (minimality was not in its rule set), Node C and the program gate
grep -c "derivedValues" lib/agents/harness/derivation-containment.ts        # expect 9 (was 5 before the asn kind, 2026-08-02) — the derived VALUE crosses the DAG edge as a fact (2026-07-31), so acceptance check 1 stops depending on a reviewer reading upstream PROSE (re-measured 2026-08-29 health-run: +1, the derived-value-orphaned class 2026-08-04.)
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
grep -c "containmentDisposition" lib/agents/harness/derivation-containment-enrichment.ts  # expect 1 — stamped ONCE, immediately before return
grep -c "containmentDisposition" lib/services/execution-core.ts                       # expect 4 — the enrichment-error catch stamps it too, or the failure arm has no gate token (re-measured 2026-08-29: read + log + BOTH catch arms. The PROPERTY — the failure arm carries a named gate token — is what >0 evidences; 1 was only ever true before the enrichment was extracted.)
grep -c "containmentDisposition" lib/mcp/server/tools/advanced/lean-card-facts.js     # expect 2 — the read and the ABSENT fallback
grep -c "needs-node-c" lib/agents/harness/derivation-containment.ts                   # expect 12 — re-measured 2026-08-21 (+1 comment from the 2026-08-19 misaligned-prefix commit d546d55d; was 8 at 2026-08-16, 5 before the cross-port ① fix). +3 from the cross-port ① disposition fix: the Shape-A arm (harvested-pool-no-derivation-cannot-decide) + its comment mentions. See the 2026-08-16 block below (re-measured 2026-08-29 health-run: +3.)
# Any of these at zero means the mechanisation is INERT on that surface — stamp, render and gate must
# all carry it. Two live defects on 2026-08-03 were exactly this seam (violations unrendered on the
# checked:false branch; unsupported rendered as a count with identities stripped).
# — the VT-11 refusal / run-2/3 silent-drop fail-safe. Conflating the two made a first fix INERT.
grep -c "## Harvested Allocations" scripts/seed-protocol-prompts.ts         # expect 12 — MEASURED 2026-08-16 (was 8): +4 from the terraform-iac v1.2.0 Derivation-evidence port (section + phase bullets). The marker is now a CROSS-DOMAIN contract, no longer network-only
grep -c "member-not-covered" scripts/test-derivation-containment.ts         # expect 10 — incident fixtures pin the arithmetic class + finding-f reason-ordering, PLUS the 2026-07-30 prefix-not-minimal fixtures which assert it does NOT fire alongside them (re-measured 2026-08-29 health-run: +1.)
```

## 🆕 2026-07-16 — R4 Layer-2 truncation terminalization + R5 agent fetch-prose

A program leg that ends settled-but-not-COMPLETED HANGS the program (Guard 4 never satisfied). R4
adds the truncation-stall class (a SYNTHESIZE persisting `TRUNCATED_NO_OUTPUT` + IN_PROGRESS — the
FOURTH non-terminal-family member, "settled-children, harness-mute").
```bash
grep -c "input.truncationStalled" lib/services/execution-terminal-persist.ts   # EXPECT 2 — the R4 Layer-2 in-tx FAILED branch. F17/F20 are computed FIRST so an escalated-COMPLETED verdict WINS over truncation-FAILED (impl-panel es/db F1); gated resolvedMode==='SYNTHESIZE' (ORCHESTRATE/CREATE excluded)
grep -c "markForwardConeBlocked" lib/services/execution-terminal-persist.ts   # EXPECT 2 — truncation branch + the F17 duplicate-halt cone-gap fold (both now walk the shared cone in lib/services/mark-forward-cone.ts)
grep -c "§6 Pipeline Context" lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts   # EXPECT 10 — R5: agent roles read dependency outputs from §6 (auto-chained), NOT fetch(id:...) (a client-only tool). A positive fetch(id:...) instruction in agent role-prose is a defect
grep -cE "Call .*fetch\(id|and fetch\(id" lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts   # EXPECT 0 — no positive fetch(id) agent instruction remains
```
Layer 1 (in-loop retry) is agent-execution's lane. `cline_docs/reviews/{nonterminal-family,truncation-r4}-2026-07-16/`.

## 🆕 2026-06-25 — Harness output guards (R9/R10) + their feature flags

```bash
# R9 sanitizer (both boundaries) + R10 redactor (both persist sites) + the flags
grep -rln "sanitizeChainedOutput\|redactArtifactsForPersist" lib/agents/harness/ lib/services/ app/api/pov/agent/
grep -rn "CONNECTED_OUTPUT_SANITIZE_ENABLED\|ARTIFACT_SECRET_REDACT_ENABLED" lib/ app/ .env*
```
R9 neutralizes untrusted connected-service output before the reasoner (tool-loop site A + context-chainer site B); R10 redacts secrets from persisted report.md/result.json (engine + stream persist, shared helper). Both **env-var, default-OFF in code but ON in prod since 2026-06-29** (`f7398004`; the `=false` in .env templates is the code default, NOT the prod posture — verify via the deploy workflow or `pm2 jlist`, never the template). No live toggle — `pm2 restart`. Modules, call-sites, enable-gates (R9 C1), CI pins: `.claude/knowledge/domain/harness/harness-output-guards.md`.

## Phase 1: Stack Map Orientation

### 1.1 Read the authoritative docs (in order)
```bash
# The stack map — shows Layer 2 in context of the 8 layers
cat /home/steve/copov15/.claude/knowledge/domain/harness/autonomous-delivery-stack.md

# The reactor architecture doc — Hindsight Lessons captures what the harness learned
cat /home/steve/copov15/.claude/knowledge/domain/harness/automation-loop-closure-architecture.md

# The specialist itself — coordination boundaries, division of concerns
cat /home/steve/copov15/.claude/agents/pipeline-harness-specialist.md

# The end-to-end smoke test — Failure Triage table maps "observation → likely cause"
cat /home/steve/copov15/.claude/knowledge/smoke-tests/pipeline-harness-e2e-test.md
```

### 1.2 Confirm current shipped versions
```bash
# Protocol version
grep "version:" /home/steve/copov15/scripts/seed-protocol-prompts.ts | head -5

# Template version
grep "version:" /home/steve/copov15/scripts/seed-harness-template.ts | head -3

# Expect: protocol ≥ 3.3.0, template ≥ 3.0.0
# Confirm what's actually shipped in prod (source-of-truth: the DB):
ssh <PROD_USER>@<PROD_HOST> "cd /var/www/paichart-app/current && source .env.production && psql \"\$DATABASE_URL\" -c \"SELECT name, version FROM agent_prompt_library WHERE tags @> ARRAY['protocol']\""
```

## Phase 2: Template + Protocol Split Audit

The Pattern #45 GS8 rule is "no contradictions between template and protocol." Verify:

### 2.1 Template is thin (role + context, not procedures)
```bash
# Template should NOT contain step-by-step tool-call sequences
grep -c "Step 1\|Step 2\|task\.create\|task\.update\|task\.complete\|agent\.execute" \
  /home/steve/copov15/scripts/seed-harness-template.ts
# Expect: low count (template references protocol, doesn't duplicate it)

# Protocol should contain the procedures
grep -c "Step 1\|Step 2\|task\.create\|task\.update" \
  /home/steve/copov15/scripts/seed-protocol-prompts.ts
# Expect: high count (protocol is source of truth)
```

### 2.2 Mode names match in both files
```bash
# Both should use the same three mode names
grep -E "CREATE mode|ORCHESTRATE mode|SYNTHESIZE mode" \
  /home/steve/copov15/scripts/seed-harness-template.ts \
  /home/steve/copov15/scripts/seed-protocol-prompts.ts

# If template uses different names (e.g. "ORCHESTRATE" and protocol says "SYNTHESIZE"), that's the v2-era contradiction pattern and MUST be fixed
```

### 2.3 Template explicitly defers to the protocol
```bash
# Template should have an explicit reference like "read the injected protocol"
grep -i "injected protocol\|pipeline-orchestrator-protocol\|read the protocol" \
  /home/steve/copov15/scripts/seed-harness-template.ts
# Expect: at least one match
```

### 2.4 Universal Agent Rules preamble is present
```bash
# Cross-cutting rules should live in UNIVERSAL_AGENT_RULES, prepended at seed time
grep -n "UNIVERSAL_AGENT_RULES" /home/steve/copov15/lib/agents/universal-agent-rules.ts | head -5   # MOVED 2026-08-04. The old path still returns hits (the import + assertions), so the grep silently changed meaning rather than failing — a stale grep that reads as working
# Expect: constant definition + prepend in PROTOCOLS[] array
```

### 2.5 User-facing GUI guide is seeded, not hand-pasted
```bash
# The user-facing /prompt pipeline_harness_guide should be seeded from the
# same script as the protocols — seed script is source of truth.
grep -n "pipeline_harness_guide\|PIPELINE_HARNESS_GUIDE" /home/steve/copov15/scripts/seed-protocol-prompts.ts | head -10
# Expect: PIPELINE_HARNESS_GUIDE constant + entry in PROTOCOLS[] with
# category: 'AUTOMATION', complexity: 'MEDIUM', real variables JSON.

# Confirm the human-readable mirror points at the seed script as source of truth
grep -i "source of truth\|seed-protocol-prompts" /home/steve/copov15/.claude/knowledge/domain/harness/PROMPT-PIPELINE-HARNESS-GUIDE.md | head
# Expect: explicit "SOURCE OF TRUTH has moved" callout + seed-script reference
```

## Phase 2b: Shared Role-Key Blast Radius (added 2026-08-25)

**Why**: `ROLE_GUIDANCE_LIBRARY` keys are SHARED ACROSS DOMAINS. Two keys each back three templates,
so any edit is a three-domain edit — and nothing at the call site used to say so. This phase exists
because the pipeline-harness specialist edited `config_change_author` on 2026-08-25 and introduced a
routing-only example into guidance that also ships to Terraform and Kubernetes authors, hours after
reading a config line warning about exactly that.

```bash
# Which templates share each role key? (expect config_change_author 3, change_reviewer 3)
grep -n "roleKey\|role_key\|'config_change_author'\|'change_reviewer'" \
  lib/services/agentTemplateBuilder/*.ts scripts/seed-*templates*.ts 2>/dev/null | head -20

# Authoritative answer — from the live rows, not from source:
npm run report:template-freshness | grep -E "config_change_author|change_reviewer"
# All rows sharing a key go STALE together. That co-movement IS the blast radius.
```

**Expect**: `config_change_author` → *Config Change-Package Author* (network-provisioning),
*HCL Rollback Author* (terraform-iac), *Manifest Rollback Author* (kubernetes-gitops).
`change_reviewer` → *Change Reviewer*, *Plan Policy Reviewer*, *GitOps Change Reviewer* — and it is
also the whole of `REVIEWER_ROLES` in `lib/agents/harness/parse-verdict.ts`, so editing it touches
verdict parsing too.

**Findings to raise**:
- A domain-specific example (vendor syntax, a protocol's vocabulary, a tool's resource model) inside
  a shared key — it will read as noise or as wrong instruction in the other two domains.
- A rule earned in one domain that is FALSE in another (worse than irrelevant).
- An edit to a shared key delivered with the FULL template seed rather than the targeted reseed
  (run the OWNING seed scripts — `grep -rln "defaultRole: '<role>'" scripts/seed-*.ts`) — the GENERIC seed is the clobber risk the
  manual-seed policy exists to avoid. There is ONE reseed script; the per-incident copies this line
  used to name were deleted 2026-08-26 once every one of them had become a no-op that still read as a
  live tool. Do not write another — pass `--roles`.
- A shared key edited without its paired reseed run on prod: the library says fixed, agents run the
  old text. `report:template-freshness` is the detector.

**The leverage half, stated so this does not read as pure hazard**: a property that is genuinely
universal gets three domains for one edit. The 2026-08-25 satisfiability rule was earned by an IS-IS
migration and now guards HCL and manifest authoring. Keep the property abstract and the leverage is
free; put a domain's vocabulary in it and you have shipped noise to two others.

---

## Phase 3: Three-Mode Execution Model Audit

### 3.1 Mode detection logic
```bash
# Protocol should define mode-detection via metadata.pipelineStageId + child-stage state
grep -A2 "pipelineStageId" /home/steve/copov15/scripts/seed-protocol-prompts.ts | head -20

# Key signals to find:
# - "metadata.pipelineStageId" referenced in mode-detection
# - CREATE when pipelineStageId is null OR points at empty stage
# - SYNTHESIZE when all tasks in child stage terminal
# - ORCHESTRATE (rare) when child stage has tasks but some lack template/deps
```

### 3.2 Harness never calls agent.execute (setup-and-exit)
```bash
# Protocol should forbid agent.execute in CREATE/ORCHESTRATE — children run via reactors
grep -i "agent\.execute\|do not.*execute\|never.*execute" \
  /home/steve/copov15/scripts/seed-protocol-prompts.ts | head -10
# Expect: explicit "do not call agent.execute" warnings
```

## Phase 4: Reactor Integration Audit (5 Call Sites)

Every one of these must be present and correctly wired. Missing any is a broken pipeline.

### 4.1 Engine success path
```bash
# Success path of agentExecutionEngine — fires BOTH reactors
grep -n "maybeRetriggerPipelineHarness\|maybeQueueReadyDependents" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts
# Expect: success path has both imports; failure path has maybeRetrigger only
```

### 4.2 Engine failure path
```bash
# Failure path — pipelineRetrigger only (fail → harness should SYNTHESIZE to escalate)
grep -B2 -A5 "executionStatus.*FAILED" /home/steve/copov15/lib/services/agentExecutionEngine.ts | \
  grep -A3 "maybeRetrigger" | head -10
```

### 4.3 Human completion path — ⚠️ the core, not the handler (since 2026-07-24)
```bash
# ⚠️ TOPOLOGY CHANGED 2026-07-24 (completion-path unification): all six human write-sites are
# thin adapters, and the reactors fire from the core's post-commit tail (fireCompletionReactors).
# Greping task-complete-handler.ts for the reactors returns ZERO and READS AS CLEAN.
grep -c "maybeRetriggerPipelineHarness\|maybeQueueReadyDependents" \
  /home/steve/copov15/lib/tasks/services/complete-task-terminally.ts
# Expect: 6 (2 retrigger + 4 readyDependents — import, tail call, and the F9/F10 wiring).
# The engine spine fires its own pair from lib/services/execution-terminal-persist.ts (exempt
# from the unification by design). Violation: a reactor call re-appearing in ANY adapter handler.
```

### 4.4 MCP task.create handler (rare kickstart path)
```bash
# task.create auto-queues if the task was created dep-free + with template
grep -n "maybeQueueIfDepFree" \
  /home/steve/copov15/lib/mcp/tasks/action/handlers/task/task-create-handler.ts
# Expect: import + call at end of create success flow
```

### 4.5 MCP agent.assign handler (COMMON kickstart path)
```bash
# agent.assign is the common path — harness creates task first, attaches template second
grep -n "maybeQueueIfDepFree" \
  /home/steve/copov15/lib/mcp/tasks/action/handlers/agent/agent-assign-handler.ts
# Expect: import + call after template assignment
```

### 4.6 Reactor services themselves
```bash
# Two reactor services — confirm both present with expected entry points
ls -la /home/steve/copov15/lib/services/pipelineRetriggerReactorService.ts \
       /home/steve/copov15/lib/services/taskReadyReactorService.ts

# Check entry point functions are exported
grep -n "^export async function" /home/steve/copov15/lib/services/taskReadyReactorService.ts
# Expect: maybeQueueReadyDependents + maybeQueueIfDepFree

grep -n "^export async function" /home/steve/copov15/lib/services/pipelineRetriggerReactorService.ts
# Expect: maybeRetriggerPipelineHarness
```

### 4.6a Retrigger-chain depth — the generation budget (Guard 8, D-4 SHIPPED 2026-06-14 `148e321a`)
```bash
# The per-cycle guards (Guards 1-7) each bound a SINGLE retrigger; none bounds the
# NUMBER of generations. The chain inherits the triggerer through "arbitrary
# reactor-chain depth" (pipelineRetriggerReactorService.ts:299). D-4 added Guard 8:
# a per-harness generation budget that caps the CHAIN. This was a GAP until
# 2026-06-14; it is now CLOSED. This check is now a REGRESSION guard — if the cap
# disappears, the runaway hole re-opens.
grep -rniE 'MAX_HARNESS_REACTOR_GENERATIONS|reactorGeneration|priorGeneration' \
  lib/services/pipelineRetriggerReactorService.ts | head
# Expect: the budget const (env-tunable, default 10), Guard 8 reading priorGeneration,
# and the reactorGeneration counter persisted via contextExtras. If EMPTY → Guard 8
# was removed (regression — the chain is unbounded again). NOTE the C3 client-injection
# defense: priorGeneration is read ONLY when the prior source is reactor-pipeline-retrigger
# (a non-reactor prior may carry a client-injected reactorGeneration via body.context).
grep -n "logReactorBudgetSkip\|HARNESS_GENERATION_BUDGET_EXCEEDED" \
  lib/services/pipelineRetriggerReactorService.ts lib/services/reactor-skip-counter.ts
# Expect: the budget-exceeded skip routed through reactor-skip-counter (no securityEvent).
# Pinned by test-reactor-race-guard.ts D4.1-D4.10 (in test:all-validation).
#
# Precedent it mirrors — the workflow engine's analogous budget:
grep -n 'maxTotalRetries' lib/services/workflow/core/orchestration-engine.js | head -1
# Expect: maxTotalRetries default 10 (orchestration-engine.js:313).
# Counter monotonicity DEPENDS on BC67 (one active execution per harness task) — do not
# colocate with any multi-active-execution feature. Also confirm fan-out stays bounded:
grep -n "already-has-execution\|task-already-claimed" lib/services/taskReadyReactorService.ts
# Expect: both idempotency skips present (the per-task fan-out bound).
```

### 4.7 Prisma raw SQL column naming (common failure site)
```bash
# Reactors use raw SQL — unmapped fields must be double-quoted camelCase
# Check for the regression pattern (snake_case on unmapped fields)
grep -n "agent_template_id\|task_id\|depends_on_id" \
  /home/steve/copov15/lib/services/pipelineRetriggerReactorService.ts \
  /home/steve/copov15/lib/services/taskReadyReactorService.ts
# Expect: ZERO matches (these fields have no @map — must be "agentTemplateId" etc.)
```

## Phase 5: Anti-Fabrication Three Layers + 4-Point Invariant Audit

(Three-layer defense + 4th invariant point added 2026-04-25 — clobber detection. See `cline_docs/reviews/harness-clobber-detection-2026-04-25/`.)

### 5.1 Protocol layer (LLM-facing rule)
```bash
# Protocol should explicitly forbid fabricated completion
grep -i "never fabricate\|fabricate.*completion\|4-point verification\|never.*task\.complete" \
  /home/steve/copov15/scripts/seed-protocol-prompts.ts | head -5
# Expect: explicit rule, ideally in UNIVERSAL_AGENT_RULES preamble + pipeline-specific section.
# Sub-grep: confirm no stale "3-point" prose remains except inside historical JS comments
grep -n "3-point" /home/steve/copov15/scripts/seed-protocol-prompts.ts
# Expect: 2 matches, both inside `//` comment blocks (historical refs to the old
# harness's 3-point check; the live invariant is 4-point). Line numbers drift as
# the file grows (1489/1509 at 2026-06-15; 3272/3292 at 2026-08-21) — assert the
# comment-only property, not positions. If a "3-point" appears OUTSIDE a
# `//` comment, the live prose regressed to the old check.
```

### 5.2 / 5.3 Handler invariant — ⚠️ ONE COPY since 2026-07-24 (completion-path unification)

```bash
# ⚠️ TOPOLOGY CHANGED 2026-07-24: the invariant is NO LONGER mirrored in the two handlers.
# task-update-handler's ~120-line clone was DELETED (it had already drifted from the
# complete-handler's), and both handlers are now thin adapters over the shared core.
# Greping the handlers returns ZERO and READS AS CLEAN — grep the core.
grep -n "4-point\|PipelineStageMismatchError\|stageMeta.harnessTaskId" \
  /home/steve/copov15/lib/tasks/services/complete-task-terminally.ts
# Expect (verified 2026-08-08): the E1 header comment ("the ONE copy of the PIPELINE 4-point
# completion invariant"), the 4 enumerated points, the typeof-string guard on the
# harnessTaskId read, and TWO PipelineStageMismatchError throws (no-back-pointer + mismatch).

# Both handlers must carry only a POINTER comment, never a re-inlined guard:
grep -c "4-point" \
  /home/steve/copov15/lib/mcp/tasks/action/handlers/task/task-complete-handler.ts \
  /home/steve/copov15/lib/mcp/tasks/action/handlers/task/task-update-handler.ts
# Expect: 1 and 1 — each a comment deferring to complete-task-terminally.ts.
# Violation: a `throw new PipelineStageMismatchError` reappearing in EITHER handler = the
# clone is back, and the 2026-07-24 unification's whole premise (one owner) is broken.
```

### 5.3.5 Server-side back-pointer write site (Item 3a, 2026-04-25)
```bash
# Where the platform writes stages.metadata.harnessTaskId — see harness-clobber-detection plan
grep -B2 -A8 "PIPELINE harness: wrote stages.metadata.harnessTaskId" \
  /home/steve/copov15/lib/mcp/tasks/action/handlers/task/task-update-handler.ts
# Expect: tx.stage.update inside the _pendingMetadataMerge block,
# gated on existingTask.type === 'PIPELINE' AND incomingMetadata.pipelineStageId is a string.
# This is the ONLY platform-side writer of harnessTaskId; agents do NOT write this field.

# Confirm there's no second (forgotten) writer of harnessTaskId
grep -rn "harnessTaskId" lib/ app/ --include='*.ts' --include='*.js' | grep -v node_modules | grep -v test
# Expect: writes only at task-update-handler.ts; reads at task-complete-handler.ts,
# task-update-handler.ts (4th-point check), pipelineRetriggerReactorService.ts (Guard 3.5).
```

### 5.4 Engine skip — the shared SUCCESS-persist core (post-Phase-6 convergence)
```bash
# ⚠️ TOPOLOGY CHANGED 2026-07-05 (execution-path convergence, project_execution_path_convergence.md):
# the happy-path spine (loop → post-loop → SUCCESS persist) moved OUT of the two callers into
# lib/services/execution-core.ts (runExecutionCore), and the terminal-persist tx into
# lib/services/execution-terminal-persist.ts. Both agentExecutionEngine.ts AND stream/route.ts now
# import runExecutionCore, so the PIPELINE status-omission is enforced ONCE, not mirrored. Grep the
# single core, not the two callers.
grep -n "isPipelineTask" /home/steve/copov15/lib/services/execution-terminal-persist.ts
# Expect: isPipelineTask = currentTaskType?.type === 'PIPELINE' (~:526) + the status-omission branch
#   `...(isPipelineTask ? {} : { status: 'COMPLETED' })` (~:739). ONE site = strongest parity.
# Confirm both callers delegate (so neither can drift with its own persist):
grep -n "runExecutionCore" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts
# Expect: import + call in BOTH. A caller with its own status-write branch = re-inlined persist (regression).
# Locked in by regression test: scripts/test-pipeline-engine-skip.ts (5 tests).
```

### 5.5 Reactor-side defense-in-depth (Guard 3.5, 2026-04-25)
```bash
# Reactor mirrors the back-pointer check before queuing SYNTHESIZE
grep -B2 -A8 "Guard 3.5\|recordedOwner !== harness.id\|logReactorMismatchSkip" \
  /home/steve/copov15/lib/services/pipelineRetriggerReactorService.ts
# Expect: stage.findUnique + typeof === 'string' guard + soft-warn legacy /
# logReactorMismatchSkip on mismatch.
# Placement: AFTER `if (!harness) return` (Guard 3), BEFORE harnessId extraction.
# Scales with PIPELINE completions only because Guard 3 already filtered.
```

### 5.6 Sentinel log fields (Open Q1 metric-driven sunset)
```bash
# Soft-warn structured log fields used by the May 2026 sunset evaluation
grep -rn "no-back-pointer-or-non-string\|legacy-stage-no-back-pointer\|pipeline-stage-mismatch" \
  lib/ app/ --include='*.ts' --include='*.js' | grep -v node_modules
# Expect (POST-SUNSET — the 2026-04-25 hard-fail flip closed the sentinel project;
# the legacy soft-warn strings are GONE, defenses now hard-fail/hard-skip):
#   - 'no-back-pointer-or-non-string' in task-complete-handler + task-update-handler
#     (handler hard-fail reason — present at task-complete-handler.ts:257,
#     task-update-handler.ts:507; throws PipelineStageMismatchError)
#   - Reactor Guard 3.5 no longer soft-warns 'legacy-stage-no-back-pointer'; it
#     hard-skips via logReactorMismatchSkip (reactor-skip-counter.ts:149 —
#     errorCode 'PIPELINE_STAGE_MISMATCH', securityEvent: true). Verified 2026-06-15.
#   - 'pipeline-stage-mismatch' (the reactor-source label passed to logReactorMismatchSkip)
# See: project_harness_clobber_sentinel.md memory entry (CLOSED 2026-04-25).
```

## Phase 6: Two-Execution-Path Drift Audit

This is the structural hazard that cost ~8 iteration cycles on 2026-04-14.

### 6.1 Tool loop configuration
```bash
# Both paths should read MAX_TOOL_TURNS from template metadata — not hardcode
grep -n "MAX_TOOL_TURNS" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts
# Expect: BOTH read from template.metadata.modelParameters.maxToolTurns
# REGRESSION if either hardcodes a value like 10
```

### 6.2 PIPELINE auto-complete skip
```bash
# Covered in Phase 5.4 — both files check isPipelineTask and skip status: COMPLETED
# If only one has the check, harness will silently drift to COMPLETED via the missing path
```

### 6.3 Reactor hook coverage
```bash
# Every completion path must fire the reactors — see Phase 4
# Missing any leaves part of the harness lifecycle silent
```

### 6.4 Any new parallel implementations?
```bash
# Hunt for any additional tool-loop implementations that might have been added.
# The ACTUAL loop is now identified by its call site, not this broad text grep —
# grep for the canonical entry point instead (verified 2026-07-19):
grep -rln "runAgenticToolLoop" /home/steve/copov15/lib /home/steve/copov15/app --include="*.ts" | grep -v test
# Expect: definition in lib/agents/harness/agentic-tool-loop.ts + callers
# execution-core.ts and diagnostic-retry.ts (both SHARED modules). A call
# appearing in agentExecutionEngine.ts or stream/route.ts = RE-INLINED loop
# (BC75 phantom-canonical shape) — push back hard.
#
# The old broad grep below is retained for a belt check, but note it now yields
# 3 BENIGN non-loop matches after the 2026-07-05 shared-core convergence:
#   - execution-core.ts       — a `hitMaxTurns` guard reading stopReason === 'tool_use'
#   - execution-quality.ts    — a comment
#   - stream/route.ts (x2)    — SSE `isComplete` flags reading stopReason !== 'tool_use'
# None is a `while` tool loop. A NEW file here (not those 3, not agentic-tool-loop.ts)
# is a third implementation — audit immediately.
grep -rn "while.*tool_use\|stopReason.*tool_use" \
  /home/steve/copov15/lib /home/steve/copov15/app --include="*.ts" | head -10
```

## Phase 7: Shipped State Confirmation

### 7.1 Version markers in shipped code
```bash
# Confirm shipped versions match validated baseline (2026-04-14)
grep -E "v3\.3\.0|v3\.0\.0|2026-04-14" \
  /home/steve/copov15/scripts/seed-protocol-prompts.ts \
  /home/steve/copov15/scripts/seed-harness-template.ts | head
```

### 7.2 Git log for the 2026-04-14 shipping stack
```bash
# See the work-cluster that shipped the harness
git log --oneline --since="2026-04-13" --until="2026-04-15" -- \
  lib/services/pipelineRetriggerReactorService.ts \
  lib/services/taskReadyReactorService.ts \
  scripts/seed-protocol-prompts.ts \
  scripts/seed-harness-template.ts \
  lib/mcp/tasks/action/handlers/task/task-complete-handler.ts \
  lib/mcp/tasks/action/handlers/task/task-update-handler.ts
```

### 7.3 Running system verification

```bash
# Check that harness template actually exists in DB with expected config
ssh <PROD_USER>@<PROD_HOST> "cd /var/www/paichart-app/current && source .env.production && \
  psql \"\$DATABASE_URL\" -c \"SELECT name, version, \\\"defaultRole\\\", \
    metadata->'modelParameters'->'maxToolTurns' as max_turns FROM agent_templates \
    WHERE name = 'Pipeline Harness'\""
# Expect: version ≥ 3.0.0, role pipeline_harness_orchestrator, max_turns 100
```

## Phase 8: Boundary-Contract Wrapper Enforcement (3 grep checks)

The reactor userId-propagation drift of 2026-04-15 exposed a class of bugs this discovery must detect: N-writer JSONB drift + raw-create bypass + accidental secret logging. Run these three grep checks alongside Phase 4 whenever you touch reactor or execution-write code paths.

### 8.1 `triggeredBy` shape — must be an object, never a bare string

```bash
# Every triggeredBy write in reactor services
grep -rn "triggeredBy:" \
  /home/steve/copov15/lib/services/taskReadyReactorService.ts \
  /home/steve/copov15/lib/services/pipelineRetriggerReactorService.ts \
  /home/steve/copov15/lib/services/agentTaskService.ts \
  /home/steve/copov15/lib/services/agent-execution-create.ts \
  /home/steve/copov15/app/api/tasks/*/agent/execute/route.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts
# Expect: every write is either `triggeredBy: { id: ..., source: '...' }` or the wrapper's validated pass-through
# Violation: `triggeredBy: someBareString` — this was the original 2026-04-15 bug shape
```

### 8.2 Raw `prisma.agentExecution.create` outside the canonical wrapper

```bash
# Wrapper enforcement — only one file may contain the raw create
grep -rn "prisma\.agentExecution\.create\s*(" \
  /home/steve/copov15/lib /home/steve/copov15/app --include="*.ts" \
  | grep -v "agent-execution-create.ts"
# Expect: empty (no matches)
# Violation: any raw create outside lib/services/agent-execution-create.ts bypasses the Zod schema guard
# Automated enforcement: scripts/test-agent-execution-security.ts G8 tests fail CI if this grep is non-empty

# Also check transactional variant
grep -rn "tx\.agentExecution\.create\s*(" \
  /home/steve/copov15/lib /home/steve/copov15/app --include="*.ts" \
  | grep -v "agent-execution-create.ts"
# Expect: empty
```

### 8.3 `apiKey` substring in logger / throw calls in LLM providers

```bash
# Find accidental key logging / exposure in throw messages
grep -rn "apiKey" /home/steve/copov15/lib/services/llm/ --include="*.ts" \
  | grep -E "logger\.|throw new |console\.log" \
  | grep -v "apiKeyHash\|apiKeyMetadata\|apiKey required\|apiKey\?\.?"
# Expect: empty (or only well-understood exceptions around apiKeyHash/required-errors)
# Violation: any raw `apiKey` value ending up in a log line, thrown error, or partial-key substring pattern
# Automated enforcement: scripts/test-agent-execution-security.ts G1 tests cover this at CI time
```

### 8.4 Running system verification

```bash
# Verify prod-side that the wrapper is writing the schema-compliant shape
ssh <PROD_USER>@<PROD_HOST> "cd /var/www/paichart-app/current && source .env.production && \
  psql \"\$DATABASE_URL\" -c \"SELECT context->'triggeredBy' \
    FROM agent_executions WHERE \\\"createdAt\\\" > NOW() - INTERVAL '1 hour' \
    LIMIT 20\""
# Expect: every row is a JSON object with {id, source} keys; sources drawn from TriggeredBySourceEnum
# Violation: any row where context->'triggeredBy' is a string, has no source key, or uses an unknown source value
```

Output for Phase 8 in the discovery report should list:
- Number of `triggeredBy` write sites (must equal count in `lib/services/agent-execution-create.ts` JSDoc)
- Any raw-create violations (must be zero)
- Any `apiKey`-in-log violations (must be zero)
- Most recent prod `triggeredBy` shapes (spot-check from 8.4)

## Phase 9: Detection Signal Coverage (now single-core, was engine + stream-route parity)

The agent-output-trustworthiness defense stack (Apr 2026) required every detection signal to fire in
BOTH execution paths. **⚠️ TOPOLOGY CHANGED 2026-07-05 (execution-path convergence,
`project_execution_path_convergence.md`):** the loop → post-loop → SUCCESS-persist spine, the detection
signals, the validators, and the result.json builder all moved into a SHARED core reached by both
callers via `runExecutionCore` (`lib/services/execution-core.ts`). Parity is no longer maintained by
mirrored code in two files — it is **structural** (one core). So these greps now target the shared
modules and assert single-source; a signal reappearing INSIDE a caller (`agentExecutionEngine.ts` /
`stream/route.ts`) is a re-inline regression, the inverse of the old "missing in one path" drift.

Signal homes after convergence:
- errorCategory detection signals → `lib/agents/harness/execution-quality.ts` (+ `pipelineProtocolValidator.ts`)
- `deriveChainedContextSignal` / `buildExecutionResultJson` → `lib/services/execution-artifacts.ts` (called from `execution-core.ts:~313`)
- validators (`validatePipelineProtocolSteps` / `evaluateTemplateScopeMatch`) → `pipelineProtocolValidator.ts` + `execution-quality.ts`
- `isPipelineTask` status-omission → `lib/services/execution-terminal-persist.ts` (see Phase 5.4)

### 9.1 Detection signals live in the shared quality module (single source)

```bash
# Each errorCategory string should live in the shared detector, NOT in either caller.
# NOTE: TEMPLATE_SCOPE_MISMATCH retired 2026-07-17 (0 true positives ever) — hits are historical artifacts only
for category in "BUDGET_EXHAUSTED" "TOOL_LOOP_DEGRADED" "TOOL_FAILURES" "SILENT_REFUSAL" "PROTOCOL_STEP_SKIPPED" "TEMPLATE_MISMATCH_SELF_REPORTED"; do
  echo "=== $category ==="
  grep -rn "$category" \
    /home/steve/copov15/lib/agents/harness/execution-quality.ts \
    /home/steve/copov15/lib/services/pipelineProtocolValidator.ts
done
# Expect: each category present in the shared module(s).
# Violation: any category appearing in agentExecutionEngine.ts or stream/route.ts → the detector was
#            re-inlined into a caller (convergence regression) → push back hard.
grep -rn "BUDGET_EXHAUSTED\|SILENT_REFUSAL\|TOOL_LOOP_DEGRADED\|PROTOCOL_STEP_SKIPPED" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts
# Expect: EMPTY (both callers delegate to the shared core)
```

### 9.1b Coverage signal — `chainedContext` derived once in the core (D1, 2026-06-08)

```bash
# The chained-context COVERAGE signal (8th additive trust signal; emit-only, NOT a cascade detector)
# is derived ONCE inside the shared core → both result.json paths inherit it.
grep -n "deriveChainedContextSignal" \
  /home/steve/copov15/lib/services/execution-core.ts \
  /home/steve/copov15/lib/services/execution-artifacts.ts
# Expect: definition in execution-artifacts.ts (~:433); single call in execution-core.ts (~:313,
#   `chainedContext: deriveChainedContextSignal(task.inputContext)`).
# Violation: a call reappearing in either caller → derivation re-inlined (regression).
# Facts: context-chainer writes pipelineMetadata.{completedDependencies,totalDependencies,
# totalChars,anyTruncated}; deriveChainedContextSignal maps them.
```

### 9.2 Pure-function validators live in the shared modules

```bash
grep -rln "validatePipelineProtocolSteps\|evaluateTemplateScopeMatch" \
  /home/steve/copov15/lib --include="*.ts" | grep -v test
# Expect: pipelineProtocolValidator.ts + execution-quality.ts (invoked inside the shared core).
# Violation: either caller (agentExecutionEngine.ts / stream/route.ts) importing them directly →
#            validation re-inlined instead of delegated.
```

### 9.3 Anti-fabrication correction turn — both paths fire on same trigger

```bash
# SINCE 2026-06-10 (extraction, commit ebc20d27): the correction turn lives ONCE
# in the shared module — trigger divergence between paths is structurally impossible.
grep -nE "_failedToolCallsForCorrection|_budgetExhaustedAlready" \
  /home/steve/copov15/lib/agents/harness/agentic-tool-loop.ts
# Expect: trigger logic ONLY in the module (end_turn + failed tools + non-empty
# text + NOT /budget exceeded|hourly limit/i).
grep -c "correctionTurnUsed" \
  /home/steve/copov15/lib/services/execution-core.ts \
  /home/steve/copov15/lib/services/execution-artifacts.ts \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts
# Expect (post-2026-07-05 convergence): correctionTurnUsed consumed in the shared core
# (execution-core.ts + execution-artifacts.ts, non-zero) and ZERO in both callers — the core
# feeds it to #90 gating + resultJson on behalf of both paths.
# Violation: trigger variables (_failedToolCallsForCorrection/_budgetExhaustedAlready) or
# correctionTurnUsed reappearing in a CALLER file = re-inlined #89 / re-inlined persist.
```

### 9.4 Validators have unit-test files

```bash
# Each pure-function validator must have a regression test using the
# canonical incident shape (artifact-synthesis 2026-04-16).
# ⚠️ test-template-scope-matcher.ts is GONE — TEMPLATE_SCOPE_MISMATCH retired
# 2026-07-17 (0 true positives ever; see 9.1 note). Its reappearance would mean
# the retired detector came back — verify the retirement, don't expect the file.
ls /home/steve/copov15/scripts/test-pipeline-protocol-validator.ts
# Expect: present (and NO test-template-scope-matcher.ts / test:template-scope-matcher script)
# Verify the artifact-synthesis incident is a regression test
grep -n "artifact-synthesis\|2026-04-16\|3 task.create.*2 agent.assign\|Self-Critique" \
  /home/steve/copov15/scripts/test-pipeline-protocol-validator.ts
# Expect: at least 1 reference to the canonical incident
```

### 9.5 Cascade priority lives once in the shared quality module

```bash
# The errorCategory cascade priority:
# P10 OVERRIDES → P5 BUDGET → P4 TAIL → P3 RATE → P7 SILENT → P8 PROTOCOL → P9 SCOPE
# Post-2026-07-05 convergence it is defined ONCE in lib/agents/harness/execution-quality.ts (both
# callers reach it via runExecutionCore), so cross-path priority DRIFT is structurally impossible —
# this check is now a single-source assertion, not a two-file diff.
# The FIRST guard that matches wins; P10 (TEMPLATE_MISMATCH_SELF_REPORTED) sets it unconditionally.
grep -nE "executionDegradation = \{|!executionDegradation" \
  /home/steve/copov15/lib/agents/harness/execution-quality.ts | head -40
# Manual check: assignment order should be P5 → P4 → P3 → P7 → P9 (promotion) → P8 → P10 (override).
# Confirm NEITHER caller re-inlines the cascade:
grep -c "executionDegradation = {" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts
# Expect: 0 and 0. A non-zero = the cascade was copied back into a caller (convergence regression).
```

### 9.6 Unit-test wiring in package.json

```bash
grep -n "test:pipeline-protocol-validator\|test:template-scope-matcher" /home/steve/copov15/package.json
# Expect: both scripts present AND both included in test:all-validation chain
# Violation: validator pure functions exist but aren't run by CI → silent regression risk
```

Output for Phase 9 in the discovery report should list (post-convergence framing — single-source, not two-file parity):
- Per-category single-source status (each signal present in the shared quality module; ZERO in both callers)
- Validator home confirmed in the shared modules (not re-imported by a caller)
- Correction-turn consumed in the core (correctionTurnUsed non-zero in core, zero in callers)
- Test file presence + canonical-incident regression test status
- Cascade priority defined once in execution-quality.ts; zero re-inline in either caller
- CI-wiring status

## Phase 10: Clobber-Detection Alert State (Apr 2026)

This phase establishes "is the clobber-detection defense armed AND has it fired recently?" Each invocation of this discovery will surface live alerts even if the user didn't explicitly mention an incident — proactive detection beats reactive triage.

Forensic playbook (what to do when an alert IS firing) lives in `.claude/agents/pipeline-harness-specialist.md` § "Clobber-Detection Forensic Playbook". This phase only finds the alerts; the playbook tells you how to investigate.

### 10.1 Verify alert emission paths exist in code

```bash
# Invariant must throw PipelineStageMismatchError on 4th-point miss.
# ⚠️ SINCE 2026-07-24 the throw lives in the shared completion core, NOT the two handlers —
# the old handler-targeted grep now returns ZERO and reads as clean (see Phase 5.2/5.3).
grep -c "PipelineStageMismatchError\|PIPELINE_STAGE_MISMATCH" \
  /home/steve/copov15/lib/tasks/services/complete-task-terminally.ts \
  /home/steve/copov15/lib/errors.ts
# Expect (verified 2026-08-08): 4 in the core (import + 2 throws + securityEvent log), 5 in errors.ts
# (AppError-shaped class definition + the 409 status mapping).

# Reactor mirror must emit logReactorMismatchSkip
grep -n "logReactorMismatchSkip\|pipeline-stage-mismatch" \
  /home/steve/copov15/lib/services/pipelineRetriggerReactorService.ts \
  /home/steve/copov15/lib/services/reactor-skip-counter.ts
# Expect: skip path emits log with errorCode: 'PIPELINE_STAGE_MISMATCH' + securityEvent: true

# MCP boundary must preserve the error code through HTTP 409 (not flatten to 500)
grep -n "PipelineStageMismatchError\|getStatusCodeForError\|409" \
  /home/steve/copov15/app/api/mcp/tasks/action/route.ts \
  /home/steve/copov15/lib/errors.ts
# Expect: instanceof AppError check before generic catch; 409 mapped from PIPELINE_STAGE_MISMATCH
# Violation: any of these emission paths missing means the alert mechanism is silently broken
```

### 10.2 Production log query for recent alerts

```bash
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 5000 --raw 2>&1 | \
  grep 'PIPELINE_STAGE_MISMATCH' | tail -20"
# Expect: empty (post-sunset 2026-04-25 — no legacy stages should produce false positives)
# Each hit: capture taskId, pipelineStageId, recordedHarnessId from the JSON payload, then
# follow the playbook in pipeline-harness-specialist.md § Clobber-Detection Forensic Playbook
```

### 10.3 stage_activities forensic table state check

```bash
# Confirms the table exists in production (post-2026-04-26 deploy) and is being written to.
# An empty table after the deploy date means writes aren't landing — investigate
# task-update-handler.ts:629 stageBackPointerLog post-tx call.
ssh <PROD_USER>@<PROD_HOST> "cd /var/www/paichart-app/current && source .env.production && \
  psql \"\$DATABASE_URL\" -c \"SELECT COUNT(*) AS total, \
    COUNT(*) FILTER (WHERE timestamp > NOW() - INTERVAL '24 hours') AS last_24h, \
    MAX(timestamp) AS most_recent FROM stage_activities\""
# Expect: total > 0 after first PIPELINE harness run post-deploy; recent rows for active POVs
# Violation: zero rows + recent PIPELINE harness activity = back-pointer logging is dropping
```

### 10.4 Cross-tenant clobber sentinel

```bash
# Looks for the smoking-gun pattern from the playbook: stage_activities entries where
# the harnessTaskId back-pointer write changed owner across distinct users.
ssh <PROD_USER>@<PROD_HOST> "cd /var/www/paichart-app/current && source .env.production && \
  psql \"\$DATABASE_URL\" -c \"SELECT stage_id, COUNT(DISTINCT user_id) AS distinct_writers \
    FROM stage_activities \
    WHERE details->>'fieldName' = 'metadata.harnessTaskId' \
      AND timestamp > NOW() - INTERVAL '7 days' \
    GROUP BY stage_id HAVING COUNT(DISTINCT user_id) > 1\""
# Expect: empty result — same stage's back-pointer rewritten by multiple users is the
# cross-tenant clobber pattern. If non-empty, escalate per playbook resolution path.
# Note: stage_activities columns use snake_case (Prisma @map). Stage table itself
# uses camelCase ("phaseId" etc). See bug-class-registry.md naming convention reminder.
```

Output for Phase 10 in the discovery report should list:
- Code emission paths present (Y/N for each of 10.1's three checks)
- Recent alert hit count (from 10.2) — zero is the healthy state
- stage_activities total / 24h / most-recent (from 10.3) — confirms the write side is alive
- Cross-tenant sentinel result (from 10.4) — must be empty
- For any non-zero alerts: capture payload triplets (taskId, pipelineStageId, recordedHarnessId) and hand to pipeline-harness-specialist with explicit pointer to the playbook section

## Phase 11: Artifact / Deliverable Contract Audit (added 2026-04-26)

The Deliverable Contract (commits `d0c0f2d8` + `04fb7630` + `ff5a6bf0` + `d652a630`, 2026-04-26) makes `finalResponse` the canonical deliverable channel and removes engine-side tool dumps from `finalResponse`/`report.md`. Verify the contract holds in code AND in fresh production artifacts.

### 11.1 No tool-dump leak in execution paths

```bash
# These should ALL return zero matches. If they reappear, the leak from before
# commit d652a630 is back — `finalResponse` and `report.md` will once again
# carry "## Tool Execution (Turn N)" / "**Tool Result**" markdown dumps.
grep -nE "## Tool Execution \(Turn|finalResponse = \(finalResponse \|\| ''\) \+ toolMarkdown|generatedText \+= toolResultText" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts || echo "✓ no leak"

# Confirm structured tool forensics still emitted (these MUST exist in result.json/pipeline-index.json)
grep -nE "toolCalls:|qualityMetrics:|toolCallSuccess:|mcpToolsProvided:|toolLoop:" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts
```

### 11.2 Artifact policy gate

```bash
# Policy: PIPELINE → no report.md (pipeline-index.json only); leaf non-PIPELINE
# → report.md + result.json; intermediate non-PIPELINE → result.json only.
cat /home/steve/copov15/lib/services/agentArtifactPolicy.ts
# NOTE: the policy fn is getReportMdDecision (returns ReportMdDecision) — the old
# name shouldProduceMarkdownReport was renamed (verified 2026-07-19). The 6-case
# policy table lives in the file's header comment.
grep -n "getReportMdDecision\|jsonArtifactName.*pipeline-index\|jsonArtifactName.*result" \
  /home/steve/copov15/lib/services/agentArtifactPolicy.ts \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts
```

### 11.3 Production artifact spot-check (run on a fresh PIPELINE)

```bash
# Pick a recent successful leaf execution (non-PIPELINE, zero dependents)
ssh <PROD_USER>@<PROD_HOST> "cd /var/www/paichart-app/current && source .env.production && psql \"\$DATABASE_URL\" -c \"
SELECT ae.id, t.title, t.type
FROM agent_executions ae
JOIN tasks t ON t.id = ae.\\\"taskId\\\"
WHERE t.type != 'PIPELINE'
  AND ae.status = 'SUCCESS'
  AND ae.\\\"createdAt\\\" > NOW() - INTERVAL '1 hour'
  AND NOT EXISTS (SELECT 1 FROM task_dependencies td WHERE td.\\\"dependsOnId\\\" = t.id)
ORDER BY ae.\\\"createdAt\\\" DESC LIMIT 3;
\""

# For a chosen execution ID — verify report.md is clean and finalResponse mirrors it
EXEC_ID=<paste from above>
ssh <PROD_USER>@<PROD_HOST> "cd /var/www/paichart-app/current && source .env.production && psql \"\$DATABASE_URL\" -c \"
SELECT name, length(content),
       position('## Tool Execution' in content) as tool_marker_pos,
       position('**Tool Result**'   in content) as stream_marker_pos
FROM agent_artifacts
WHERE \\\"executionId\\\" = '$EXEC_ID' ORDER BY name;
\""
# PASS criteria: report.md tool_marker_pos = 0 AND stream_marker_pos = 0;
# report.md length should match jq '.finalResponse | length' on result.json.
```

### 11.4 PIPELINE harness artifact

```bash
# PIPELINE harness produces pipeline-index.json (NOT report.md).
# Verify the key set, especially resolvedMode/resolvedReasonCode (mode resolver).
ssh <PROD_USER>@<PROD_HOST> "cd /var/www/paichart-app/current && source .env.production && psql \"\$DATABASE_URL\" -t -A -c \"
SELECT content FROM agent_artifacts
WHERE name = 'pipeline-index.json'
  AND \\\"createdAt\\\" > NOW() - INTERVAL '1 hour'
ORDER BY \\\"createdAt\\\" DESC LIMIT 1;
\"" | jq 'keys'
# Expected keys include: resolvedMode, resolvedReasonCode (added 2026-04-26),
# protocolValidation (when LLM ran the validator), finalResponse, toolCalls,
# qualityMetrics, mcpToolsProvided, toolLoop.
```

### 11.5 Deliverable Contract in §8 prose + universal template

```bash
# Engine §8 should say "finalResponse is the deliverable channel" (commit d0c0f2d8).
grep -n "deliverable channel\|finalResponse.*deliverable\|comments are coordination\|task.comment.*coordination" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts | head -5

# Universal template + role-specific guidance (commit 04fb7630).
grep -n "Deliverable Contract\|deliverable channel\|comments are coordination" \
  /home/steve/copov15/lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts | head -10
```

Output for Phase 11 in the discovery report should list:
- ✓/✗ no tool-dump leak markers in either execution path
- ✓/✗ structured tool forensics still emitted (toolCalls, qualityMetrics, mcpToolsProvided, toolLoop)
- ✓/✗ artifact policy gate present (`getReportMdDecision` + `pipeline-index.json` switch)
- For latest leaf execution: report.md byte length, tool_marker_pos (must be 0), stream_marker_pos (must be 0)
- For latest PIPELINE execution: presence of `resolvedMode`/`resolvedReasonCode` keys in `pipeline-index.json`
- Deliverable Contract prose present in engine §8 + universal template

## Phase 12: Prompt Assembly & Sibling Chained-Context Audit (added 2026-07-06)

Audits how prompts are ASSEMBLED at runtime + how the sibling deliverable flows child→child — the harness's
communication mechanism (Phase 11 covers the artifact/deliverable CONTRACT; this covers the PROMPT surface).

```bash
# 1. §6 chained context — ONE shared renderer, both paths; per predecessor renders ONLY
#    taskTitle/agentRole/confidenceScore/finalResponse, wrapped <prior_output role="context_only">.
grep -n "renderPipelineContextSection" lib/agents/harness/build-agent-prompt-body.ts
grep -n "prior_output\|context_only\|REFERENCE DATA" lib/agents/harness/render-pipeline-context.ts | head

# 2. Sibling-chaining SINGLE chokepoint (all six entry paths chain identically) — NOT the two-caller prompt-build shape.
grep -rn "prepareTaskForExecution" lib/services/agent-execution-create.ts | head
grep -n "selectAuthoritativeExecution\|CONTEXT_CHAINING_FAILED\|mergeTaskInputContext" lib/agents/harness/context-chainer.ts | head
grep -nE "128|512" lib/agents/harness/context-chainer.ts | head   # 128 KB/predecessor + 512 KB total, trimmed TAIL-FIRST

# 3. deliverableSourceTaskId — harness sets on self (CREATE) → engine extracts the source child's finalResponse
#    into the harness report.md at SYNTHESIZE-commit.
grep -rn "deliverableSourceTaskId" lib/ scripts/seed-harness-template.ts | head

# 4. Runtime injection TAIL (execution-system-prompt.ts) — loadProtocols cap-10 / named-single / Axis-5
#    constraints (the harness template's OWN constraints inject here too) / harness-context mode block / P10.
grep -n "loadProtocols\|renderConstraintsBlock\|harnessContext\|SCOPE_SELF_CHECK" lib/services/execution-system-prompt.ts | head
```

**What to look for**: §6 renders ONLY the 4 fields (never comments/qualityMetrics); chaining is single-site
(`prepareTaskForExecution`); keep-best selects the authoritative predecessor (a regressed retry never chains);
the mode is INJECTED, not a separate template. Cross-lens: HEAD/TAIL construction = prompt-construction; loop
re-pinning = agent-execution; field→section = template-system.

## Phase 13: Reviewer Terminal Verdict & SYNTHESIZE Read Path (added 2026-07-14)

Audits the verdict-fact chain shipped after the verdict-misread incident (SYNTHESIZE stamped NEEDS-REVISION
on an APPROVED run because the reviewer's terminal verdict sat past the 8KB tool-result head-slice):

```bash
# 1. Three-surface coupling: grammar (ROLE guidance, canonical) → protocol (references only) → parser.
git grep -n "## VERDICT:" lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts scripts/seed-protocol-prompts.ts lib/agents/harness/parse-verdict.ts | head
# EXPECT: definition (with the APPROVED | NEEDS-REVISION alternation) ONLY in pAIchartUniversalTemplate.ts;
# seed-protocol-prompts references the marker but never redefines the grammar (pinned by test-parse-verdict.ts).

# 2. Emission: parsed INSIDE buildExecutionResultJson (structural dual-path parity), role-gated,
#    reviewerVerdict + confidenceScore emitted BEFORE finalResponse (head-slice caps → order is a contract).
grep -n "reviewerVerdict\|REVIEWER_ROLES" lib/services/execution-artifacts.ts | head

# 3. Reconciliation guard: flag-only annotation at the task.update metadata-merge chokepoint.
grep -n "annotateQualityGateVerdictMismatch\|verdictMismatch" lib/agents/harness/verdict-mismatch-guard.ts lib/mcp/tasks/action/handlers/task/task-update-handler.ts | head

# 4. Anti-silent-strip: the lean card must RENDER reviewerVerdict.
#    ⚠️ MOVED — the hoist/render now lives in the lean-card fact formatter, not
#    agent-results-handler.ts (the old path returns ZERO and reads as clean).
grep -c "reviewerVerdict" lib/mcp/server/tools/advanced/lean-card-facts.js   # expect 4 (verified 2026-08-08)
grep -c "reviewerVerdict" lib/mcp/tasks/action/handlers/agent/agent-results-handler.ts  # expect 0 — moved, not lost

# 5. Tests green (15 parser + 37 parity incl. the field-order assertion).
npm run test:parse-verdict && npm run test:execution-artifacts-parity
```

**What to look for**: exactly ONE grammar definition site; `reviewerVerdict` before `finalResponse` in the
builder's return literal; the guard never throws and never overrides (`verdictMismatch` is a flag, Phase-2
consumption is earned from its logs); parser returns null-on-miss (never a fabricated `{approved:false}`).
Record: `cline_docs/reviews/harness-synthesize-verdict-misread-2026-07-14/finding.md`.

## Phase 14: Program-Harness Recursion Enablers (added 2026-07-15, Session A)

Audits the pipelines-of-pipelines machinery (design-proposal v1.2 CC1/CC2/CC4/CC7):

```bash
# 1. CC1 — parent retrigger: blanket PIPELINE type-skip GONE; self-ID guard present, post-Guard-3, loud
grep -n "harness.id === completedTaskId" lib/services/pipelineRetriggerReactorService.ts
grep -c "completed.type === 'PIPELINE'" lib/services/pipelineRetriggerReactorService.ts   # comments only — code form pinned gone by test CC1.1
npm run test:reactor-race-guard   # expect 45 pass (verified 2026-08-08; was 26 at CC1 authoring — CC1.1-1.4 are the nesting pins, E1.1-E2.5 the born-ready ones)

# 2. CC2 — chainer PIPELINE branch + per-predecessor facts + deterministic order
grep -n "isPipelinePredecessor\|notChained\|source,\|orderBy: { dependsOn: { createdAt" lib/agents/harness/context-chainer.ts | head

# 3. CC7 — contract channel end-to-end: create param → validation → renderer-first → loud-fail
grep -n "interfaceContract" lib/mcp/tasks/action/handlers/task/task-create-handler.ts lib/validation/mcp-action-validation.ts lib/agents/harness/render-pipeline-context.ts lib/agents/harness/prepare-task-for-execution.ts | head
grep -n "INTERFACE_CONTRACT_MISSING" lib/agents/harness/prepare-task-for-execution.ts   # the loud-fail, OUTSIDE the chain catch
npm run test:pipeline-context-render   # EXPECT 13 pass (CC7.1-7.3)

# 4. CC4 — depth single source (no hardcoded 10 anywhere)
grep -rn "depth >= 10" lib/ app/ | grep -v node_modules   # EXPECT 0
grep -n "MAX_DEPTH" lib/utils/graph.ts   # MAX_DEPTH VALUE should be 20 (not a hit count); GraphLimits imported by both handlers + REST route
```

**What to look for**: stage law (D3 — cascade is stage-scoped; program children are SIBLINGS in one
stage); gates are template-less ACTION tasks. Design record + test plan:
`cline_docs/reviews/program-architect-design-2026-07-15/`.

```bash
# 5. Session B (2026-07-15) — protocol/role/template authoring layer
grep -c "name: 'pov-program-protocol'" scripts/seed-protocol-prompts.ts # expect 1 — re-measured 2026-08-23. Now anchored to the ENTRY-NAME PROPERTY: the bare-string form drifted to 4 as the protocol prose gained routing-table rows + narrative references (the code was never wrong — the grep was measuring the wrong thing)
grep -n "PIPELINE_POV_PROGRAM_PROTOCOL" scripts/seed-protocol-prompts.ts | head -2
grep -n "'program_architect'" lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts   # EXPECT 1 (role entry; NOT in REVIEWER_ROLES)
ls scripts/seed-program-templates.ts                                   # the MANUAL prod seed (deploy auto-seeds protocols only)
npm run test:parse-verdict   # EXPECT 15 pass (grammar-redefinition pin — the program protocol REFERENCES, never redefines)

# 6. T4-hardening (2026-07-15) — the CC7 double-nest hoist + structural loud-fail + child-read path
grep -n "hoisted double-nested interfaceContract" lib/mcp/tasks/action/tasks-action-router.ts   # A3: router hoist before safeParse (F11)
grep -n "structurallyRequiresContract\|(protocol: pov-program" lib/agents/harness/prepare-task-for-execution.ts   # B1: structural loud-fail keyed on parent TITLE token (F12)
npm run test:cc7-contract-guard   # expect 12 pass (verified 2026-08-08; was 6 at authoring) (A3 hoist-before-safeParse + B1 title-token discriminator, NOT template metadata)
grep -n "verbose: true, limit: 1" scripts/seed-protocol-prompts.ts   # EXPECT >=2 — F14/v1.0.14: PLAN-SPAWN Step 1 + SYNTHESIZE Step 4 read artifact bodies via agent.results verbose:true (fetch is CLIENT-only, never on the engine surface)
grep -c 'BODY comes ONLY from the \\`fetch' scripts/seed-protocol-prompts.ts   # EXPECT 0 — the false v1.0.5 instruction is removed (panel 2026-07-23; the 1.0.14 changelog QUOTES it unbackticked — that one mention is historical, not an instruction)
```

**F14 child-artifact-read rule (T4b live 2026-07-15; retrieval verb corrected 2026-07-23, pov-program
v1.0.14)**: a parent harness reading a child's deliverable body (PLAN-SPAWN → Architect's plan) must
actively retrieve the artifact body — the child is not a §6 dependency, so its output is NOT auto-chained.
Route: `perform(action:"agent.results", taskId, verbose:true, limit:1)` — `verbose:true` is load-bearing
(the 3KB dispatch cap otherwise returns a lean card whose only body pointers are CLIENT-only `fetch(id:)`
hints — a dead end for the engine; live failure cmrvlnn2…, panel
`cline_docs/reviews/plan-spawn-fetch-and-start-semantics-2026-07-23/`). `task.context` gives only the
POINTER (the completion comment's `fetch(id:)` line is for HUMANS in Desktop). Stopping at task.context =
contract-absent stall. Same rule for ANY parent-reads-child-artifact.
⚠ The Architect HAS a `report.md` ONLY because it runs during PLAN with zero dependents (report.md is
leaf-gated; the plan-gate depending on it is created later in PLAN-SPAWN). The agent.results envelope
carries ALL artifacts (result.json first, report.md second), so a collapsed-CREATE choreography (no
report.md) degrades gracefully — the same call serves the plan via `result.json.finalResponse`.

**Session-B facts to verify hold**: program SYNTHESIZE stamps `metadata.programReleasable` (distinct
fact; completion % untouched) + `qualityGate.reviewerScore = MIN` across child pipelines; the gate's
BLOCKING inputs include producer/Node C `chainedContext.predecessors === expectedPredecessors` (the
CC2b notChained consumer). Program CREATE spans TWO harness executions — PLAN (Architect only) →
PLAN-SPAWN on the Architect-completion retrigger (CC7 is create-time-only; PIPELINE children start
only via dep-completion) — rationale in the protocol const's header comment.

## Output Format

When completing this discovery, report back:

```markdown
## Pipeline Harness Discovery — <date>

### Versions
- Protocol: vX.Y.Z (expected ≥ 3.3.0)
- Template: vX.Y.Z (expected ≥ 3.0.0)

### Template + Protocol Split (Pattern #45 GS8)
- [ ] Template is thin (no tool-call step-by-step)
- [ ] Mode names match between template and protocol
- [ ] Template explicitly defers to protocol
- [ ] UNIVERSAL_AGENT_RULES preamble present
- [ ] User-facing `pipeline_harness_guide` seeded from `scripts/seed-protocol-prompts.ts` (not hand-pasted into the GUI)
- [ ] Human-readable mirror (`PROMPT-PIPELINE-HARNESS-GUIDE.md`) points at seed script as source of truth

### Reactor Integration (6 call sites)
- [ ] Engine success path — both reactors
- [ ] Engine failure path — pipelineRetrigger only
- [ ] MCP task.complete — both reactors
- [ ] MCP task.create — maybeQueueIfDepFree
- [ ] MCP agent.assign — maybeQueueIfDepFree
- [ ] MCP task.update — maybeQueueIfDepFree (gap (e) door 2026-07-18: dep rewrite / template attach; PIPELINE + executionStatus=FAILED call-site guards)

### Anti-Fabrication Defense (3 layers)
- [ ] Protocol rule present
- [ ] task-complete-handler invariant present
- [ ] task-update-handler invariant mirror present
- [ ] PIPELINE status: COMPLETED omission enforced once in the shared core (`execution-terminal-persist.ts`); both callers delegate via `runExecutionCore`

### Two-Path Drift (post-2026-07-05 convergence — assert single-source, not mirrored)
- [ ] MAX_TOOL_TURNS reads from template in BOTH callers (still per-caller — pre-core adapter)
- [ ] isPipelineTask status-omission lives in `execution-terminal-persist.ts`; zero re-inline in either caller
- [ ] Detection signals / cascade / correctionTurnUsed single-sourced in the shared modules; zero in callers
- [ ] Reactor hooks present in all completion paths
- [ ] No unexpected third tool-loop implementation

### Raw SQL Column Naming
- [ ] Zero snake_case refs for unmapped fields (`agent_template_id`, `task_id`, etc.)

### Clobber-Detection Alert State (Phase 10)
- [ ] PipelineStageMismatchError throw + securityEvent log present in both handlers
- [ ] Reactor mirror emits logReactorMismatchSkip with errorCode + securityEvent
- [ ] MCP boundary preserves errorCode through HTTP 409 (not flattened to 500)
- [ ] **Recent alert hits (last 24h)**: <count from 10.2 — zero is healthy>
- [ ] stage_activities total / 24h / most-recent: <values from 10.3>
- [ ] Cross-tenant sentinel result: <empty expected; if non-empty, escalate>

### Deliverable Contract / Artifact Hygiene (Phase 11)
- [ ] No `## Tool Execution (Turn N)` builder in either execution path
- [ ] No `generatedText += toolResultText` accumulator in stream path
- [ ] Structured tool forensics still emitted (`toolCalls`, `qualityMetrics`, `mcpToolsProvided`, `toolLoop`)
- [ ] `agentArtifactPolicy.ts` policy table active: PIPELINE → no report.md; leaf → report.md; intermediate → JSON only
- [ ] Latest leaf `report.md`: tool_marker_pos = 0, stream_marker_pos = 0, length matches `result.json.finalResponse`
- [ ] Latest PIPELINE `pipeline-index.json` includes `resolvedMode`/`resolvedReasonCode`
- [ ] Engine §8 prose + universal template carry "finalResponse is the deliverable channel" / "comments are coordination only"

### Issues Found
- <list any regressions or gaps detected>

### Next Steps
- <hand to pipeline-harness-specialist for coordinating fix>
- <hand to specific specialist for narrow concern (agent-execution, event-system, etc.)>
```

## Related

- `/.claude/agents/pipeline-harness-specialist.md` — coordinating specialist
- `/.claude/knowledge/domain/harness/autonomous-delivery-stack.md` — Layer map
- `/.claude/knowledge/domain/harness/automation-loop-closure-architecture.md` — reactor architecture + Hindsight Lessons
- `/.claude/knowledge/smoke-tests/pipeline-harness-e2e-test.md` — runnable validation
- `/.claude/knowledge/patterns/prompt-library-gold-standard-pattern.md` — Pattern #45 GS7/GS8 rules
- `/.claude/knowledge/patterns/orchestration-reactor-pattern.md` — Pattern #46 reactor shape
- `/.claude/knowledge/patterns/two-execution-path-drift-pattern.md` — structural hazard pattern (draft)

## containmentDisposition delivery (added 2026-08-04)

```bash
grep -c "RESULT_JSON_SUMMARY_KEYS" lib/services/execution-artifacts.ts   # expect 3 — const + its use + the header comment
grep -c "containmentDisposition" lib/agents/harness/derivation-containment-enrichment.ts  # expect 1 — the nested assign
```
`containmentDisposition` is **not** on the whitelist and must not be added: it rides NESTED on the fact,
which the whitelist hoists verbatim. Promoting it to a top-level sibling silently strips it, and the program
tier is never told a decision was delegated. Pinned by **E3b** in `scripts/test-execution-artifacts-parity.ts`.

## Duplicate-halt cone + consumed-kind facts (added 2026-08-12)

```bash
# The cone freeze is ONE-WAY by design — expect zero unfreeze/clear paths
grep -c "clear\|unfreeze\|remove" lib/services/mark-forward-cone.ts        # expect 0
# consumed-value-mismatch violations stamp the non-cidr kind (Tasman actionability fix)
grep -c "cKind !== 'cidr'" lib/agents/harness/derivation-containment.ts    # expect 1
```

A program leg's duplicate-halt terminalizes + freezes its forward cone with no release (Tasman
Run 2); re-runs pre-arm via `metadata.duplicateAcknowledged` on each pipeline child in the
gate-hold window (validated Run 3, `programReleasable: true`). pov-program 1.0.30 Step 8 warns
at gate time. Trail: `cline_docs/reviews/protocol-obligation-audit-2026-08-11/AUDIT.md` (S5, O5).
