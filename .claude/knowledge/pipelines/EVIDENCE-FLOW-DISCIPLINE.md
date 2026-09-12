# Evidence-Flow Discipline — epistemic hardening for multi-tier LLM judgment

> **Created**: 2026-07-18, distilled from the evidence-flow arc (runs 2-6, POV program verification).
> **Arc record**: `cline_docs/reviews/evidence-flow-arc-2026-07/ARC-RECORD.md` (the incidents + fixes).
> **Owner**: pipeline-harness-specialist (this domain is inside its remit until the named trigger below).
> **Co-owner since 2026-09-11**: `execution-facts-specialist` for the MECHANICAL-NET half — how a
> containment/lint fact is produced, stamped and rendered. Harness keeps the tier semantics and gates.
> **Register**: INTERNAL. The customer-facing statement of the same invariants is
> `paichart/verification/ARCHITECTURE.md` safety-stack **items 7 AND 8** — item 7 carries the
> evidence-flow chain, item 8 the confidence demotion and facts-gated release. Keep them consistent
> (Protocol 11). *(Corrected 2026-08-04: this said "item 7" alone, so half the discipline's public
> counterpart was outside the stated pairing and would not have been checked.)*

## What "epistemic" means here

**Epistemic** (Greek *epistēmē*, knowledge) — concerning knowledge and its **justification**. The epistemic
question is never *is this true?* but *what entitles you to say you know it?*

That distinction is the whole of this document. A network change is either correct or it is not, and no
amount of process changes which. What process **can** change is the standard of evidence a claim must meet
before the system acts on it. So every rule below is about justification rather than truth: what a tier may
CLAIM, what it must demonstrably have CONSUMED in order to claim it, and which artifact WINS when two
accounts disagree.

**"Epistemic hardening" therefore means making it harder for an unjustified claim to travel — not making
the judgments smarter.** The judgments are LLM judgments. They cannot be unit-tested into correctness,
because judgment is not a function you can pin. The available lever is the evidence standard, and this
document is that standard.

The practical test of whether you are thinking epistemically: when a tier reports a clean result, can you
say *why* it was entitled to? If the only answer is "it said so", you have a verdict, not knowledge.

## The problem class this discipline exists for

A system whose components are LLM judgments cannot be unit-tested into correctness — judgment isn't a
function you pin. Runs 2/3 proved the failure shape: **three independent reviewer tiers, each
explicitly instructed to catch a defect class, approved it at RISING confidence (88 → 92 → 94)** —
because each tier was reasoning over narratives whose evidence had died upstream. The defect wasn't in
any one judge; it was in the *evidence flow between them*. Run 6 proved the inverse: with the flow
governed, the SAME defect the leg tier passed (at 92!) was caught by the integration tier by
recomputation against carried evidence.

## The three governing questions (ask them of ANY multi-tier judgment chain)

1. **What is a tier allowed to CLAIM?** A claim is either VERIFIED-AGAINST-EVIDENCE (the tier
   recomputed/checked it itself) or ACCEPTED-FROM-CLAIMS (it is trusting an upstream account) — and
   the tier must say which, per finding. A PASS badge on an unverifiable claim is how a defect clears
   review (run 3's Node C: "does not collide with any" in "independently verified" framing — hearsay).
2. **What did a tier demonstrably CONSUME?** Structured facts (chainedContext, derivationContainment,
   qualityGate, reviewerVerdict) are retrieved by TOOL from their canonical artifacts — never expected
   in chained prose, never re-derived from it. Absence AFTER retrieval is a blocking finding; absence
   in prose alone is not (run 4's Node C blocked on a reachable-but-unfetched gap).
3. **Which artifact is the ANCHOR OF TRUTH when accounts disagree?** The artifact closest to the
   world. For derivations from harvested state: the HARVEST child's own structured block — never the
   package's copy, which run 4 proved can be FABRICATED (invented entries wearing the discipline's own
   provenance vocabulary). Mechanical checks read the anchor; prose copies exist for human reading and
   must be verbatim-quoted with named sources.

## The invariant set (each earned by a specific failure)

| Invariant | Earned by | Enforced at |
|---|---|---|
| Harvest emits structured `## Harvested Allocations` (kind-tagged JSON; only what the device returned) | runs 2/3: enumeration died at the leg-report boundary | network-provisioning 1.2.0 harvester contract |
| Design declares derivations as `## Derived Values` {kind, value, MANDATORY members} + per-entry containment at design time; widen ⇒ re-select or escalate | runs 2/3 widening; members field: every valid aggregate covers its own members (specialist 2b) | protocol contract + the mechanical check |
| Evidence sections MANDATORY when derivations exist, FORBIDDEN otherwise; verbatim-quoted, source-named | run 4: an over-applied evidence block invited invention | Author contract |
| Reviewers recompute vs the evidence; harvest wins on disagreement; unsourced/absent evidence = blocking; findings graded | runs 3/4 | leg Reviewer + Node C contracts (1.2.0/1.0.9) |
| Mechanical `derivationContainment` fact — anchored to the harvest artifact, pre-tx, non-throw, checked:false-never-block | run 4 fabrication; wiring per harness-specialist ruling (pre-tx beside computeSelfSupersession — NOT the terminal tx) | `lib/agents/harness/derivation-containment.ts` + the shared net registry (`net-registry.ts`, since 2026-09-12 — execution-core no longer names any fact function directly; grepping it for `computeDerivationContainmentFact` now returns ZERO and that is correct, not missing) |
| `member-not-covered` violation class (arithmetic errors) | run 5: /31 claimed for a straddling pair; leg reviewer caught at 45, run 6's MISSED at 92 | same validator (49b04676) |
| Heading-tolerant structured-block parsing (furniture-only prefixes; prose mentions excluded) | run 6: `**Derived Values**` (bold) blinded the token-locked parser while the error sat inside the block | parseFencedJsonBlock |
| Node C retrieves structured facts by tool (perform agent.results per leg) | run 4 access gap | pov-program 1.0.9 |
| Confidence numbers are recorded facts, never gate inputs — at every tier (program formula, pipeline Step 5, all three domain approval rules, GUI shield); leg-reviewer approval ADVISORY for derivation-class claims (load-bearing = mechanical fact + Node C; leg outcome REMAINS a hard AND-conjunct — advisory = insufficient to PROVE containment, not removed from the gate); derivationContainment violation blocks programReleasable | calibration study: 45-vs-92 on byte-identical prompts/params — approved/NN carries verdict direction, not correctness; a leg gate left at ≥85 would transitively re-impose the threshold (arch-review A1) | pov-program 1.0.10 + domain protocols 2026-07-18 sweep |
| Packages carry claims + verbatim evidence ONLY — no self-assessed confidence, no author-side verification tables; reviewers CONSTRUCT their checks, never copy them | run 6 miss: reviewer echoed the package's wrong containment table + self-stamp 92 (verification theater) | network-provisioning 1.2.1 Author (f) + Reviewer contracts |

## A self-reported verification grade is a claim

The calibration study (`cline_docs/reviews/evidence-flow-arc-2026-07/CALIBRATION-STUDY.md`) closed the
loop the arc opened: run 6's reviewer performed the full verification RITUAL — wrote the correct
binary expansions, concluded "/31 ✓", stamped VERIFIED-AGAINST-EVIDENCE — on inputs byte-identical in
prompt/model/params to run 5's catch. The discipline's own vocabulary does not make the verification
real. Rules earned:
1. **A VERIFIED-AGAINST-EVIDENCE grade is itself a claim**, valid only when backed by the grader's own
   written recomputation — and a check that is mechanically reproducible should be run by the machine.
2. **Confidence numbers carry verdict direction, not correctness** (approvals on defective and clean
   work share one 88–94 band; five of seven corpus approvals are exactly 92). Never consume `NN` as a
   gate input at any tier; keep stamping it as an uninterpreted recorded fact.
3. **Don't hand a reviewer a copyable answer**: upstream artifacts state claims + quoted evidence;
   they never include their own verification narrative (the run-6 package's wrong-but-plausible table
   is what the reviewer echoed; run 5's table-free package forced construction — and the catch).

## Design rules for new domains (k8s, terraform, future)

- The containment engine is **generic-by-construction** (`kind` dispatch; `cidr` implemented). A new
  derivation relation (namespace/label subsets, resource-address containment) adds a checker to the
  dispatch — never bakes domain logic into the enrichment/persist path.
- A domain protocol that lets an agent DERIVE anything from harvested state must specify: the harvest
  block, the derived block with members, the evidence-quoting rule, and the reviewer grading — copy
  the network-provisioning 1.2.0 sections, swap the domain nouns.
- Protocol content changes BUMP THE VERSION with a dated changelog (the pack's drift discipline —
  violated once this arc, caught in the verification-doc currency review).

## Known-open (do not treat as covered)

See `cline_docs/follow-ups/leg-reviewer-efficacy-2026-07-17.md`: the design-tier under-covering flaw
(characterized, twice-repeated, prompt warnings insufficient; run 7 re-selected correctly — fix
shelved pending recurrence) and the three run-7 platform follow-ups. The calibration study is DONE
(2026-07-18, section above); its "construct-vs-copy" mechanism rests on a single pair — treat as
hypothesis until another head-to-head exists.

## Specialist trigger (Protocol 12 boundary)

This domain stays inside **pipeline-harness-specialist**'s remit (it made both wiring rulings this
arc). Named trigger for standing up a dedicated evidence-flow/epistemic-hardening specialist: the
discipline is applied to a **third surface beyond the harness** (it already governs the trust-stack
and the hub's recovery signals conceptually), OR the calibration study begins as its own workstream.
Until then, a new specialist would duplicate an active one — the pov-program precedent (2026-07-15
ruling: no new specialist till trigger) applies.

---

## 🆕 Currency pass — what changed since 2026-07-18

**Appended, not rewritten.** Everything above is the record of what was learned from runs 2–6 and it
stands. This section carries only what moved after it, so the original stays citable.

**The spine held.** The design rule *"a new derivation relation adds a checker to the dispatch — never
bakes domain logic into the enrichment/persist path"* was written here on 2026-07-18 and used on
2026-08-02, when `asn` became the second `kind`. It followed the rule exactly, including the persist-path
half. The procedural descendant is `.claude/knowledge/pipelines/adding-a-net-toolkit.md`.

**New since:**

| What | Note |
|---|---|
| `asn` kind | 2026-08-02. The table's *"`cidr` implemented"* is now `cidr` + `asn`. |
| **Unsupported-kind escalation** | A value of an unimplemented kind is recorded *not mechanically covered* and escalated — never counted as passed. Verified end-to-end in VT-14. |
| `containmentDisposition` | A structured `blocking` / `benign` / `needs-node-c` stamp carried **nested inside** the fact, with its inputs. `benign` is an allowlist; absence fails closed. |
| New violation classes | `prefix-not-minimal`, `consumed-value-mismatch`, `derived-value-orphaned`, `asn-not-member`, `asn-reserved-range`. |
| Protocol versions | The table cites 1.2.0 / 1.0.9 / 1.0.10; live is network 1.2.4, pov-program 1.0.29, orchestrator 1.4.0, k8s + terraform 1.0.5. Treat the cited versions as *when the invariant landed*, not as current. |

**VT-12 is a new instance of this document's own thesis, and a worse one.** A program self-certified
`programReleasable: true` while shipping an authorization widening, and **five** tiers passed it — against
the three of runs 2/3. The cause was not a hollow judgment this time but a **coverage** gap: minimality was
asserted in exactly one place, a requirements clause, and a prose edit removed it. The gate then followed
a complete-*looking* fact set to a wrong verdict. Minimality is now computed in code. The lesson to carry
forward is narrower than "reviewers can be hollow": **a green gate bounds what was checked, never what is
correct**, and the fact set's *coverage* is as load-bearing as any single fact in it.

**Still open, and NOT discharged.** The "Known-open" note above says the construct-vs-copy mechanism rests
on a single pair and should be treated as a hypothesis until another head-to-head exists. **It still does.**
VT-14's Run 23 vs Run 24 is a genuine single-variable head-to-head, but of a *different* property — whether
a rendered subject lets a tier act on an obligation — so it does not test construct-vs-copy and must not be
counted toward it.

### 🆕 2026-09-11 — the INVERSE failure: a tier judging evidence it structurally cannot see

Everything above is about a tier that **could** have checked and did not (hollow verification). The
rollbackContainment arc (`cline_docs/reviews/rollback-containment-2026-09-11/IMPLEMENTATION-PLAN.md`)
is the inverse, and governing question **2** ("what did a tier demonstrably CONSUME?") names it exactly:
**three content-correct rollbacks were refused on provenance grounds by reviewers who read the PACKAGE
and never the harvest** — R19 P4 (network, 51/51 lines verbatim ⊆ harvest), R3a-3 (observability,
byte-equal to the witnessed rendering), R3b-2 (observability, line-identical to the as-deployed file).
Each reviewer said in its own verdict it could not re-verify the comparison, then asserted the
conclusion anyway; Node C echoed it (correlation, not corroboration). Base rate of TRUE rollback
fabrication across the archived corpus: **0 of 56**. The mechanical layer's earned value here is
**exoneration**, not catching — the check's value inverted.

**What shipped (2026-09-11, `ac33cf5c`..`c867ea70`):**

| Invariant | Earned by | Enforced at |
|---|---|---|
| Mechanical `rollbackContainment` fact — restore-form lines of the package's rollback ⊆ the leg's OWN harvest (trimmed-exact-line), five named exclusion classes with load-bearing precedence, `rollbackDisposition` NESTED (E3b) | R19 P4 / R3a-3 / R3b-2 — three refusals of correct packages | `lib/agents/harness/rollback-containment.ts` + `-enrichment.ts` |
| Stamped at the **AUTHOR leaf's terminal persist**, hoisted (never recomputed) at SYNTHESIZE — because a SYNTHESIZE-only stamp lands AFTER the leg's reviewer runs, the exact blindness the net exists to end (F4) | design finding, not a run | `execution-core.ts` Author-leaf site |
| **Asymmetric with derivationContainment**: unmatched lines ⇒ `needs-node-c` (escalate, NEVER block); blocking only on could-not-check; not a `programReleasable` conjunct in v1 — soaks, tallied at the 2026-11-29 health-run | corpus base rate 0/56; the 2026-08-29 verdict-consumption reversal (don't add conjuncts without outcome data) | consumer ruling H1 |
| Delivered to the Reviewer's §6 via `chainedFrom[].rollbackContainment`, **lane-scoped to observability-config** (network/HCL withheld until the context-entry residue is ruled — a fact that escalates on 66% of inputs would be ignored precisely when right) | corpus re-measure P9: 24 of 42 checked packages carry unmatched context-entry lines; HCL lane is desired-state, not harvest → `lane-not-supported` (benign, "no opinion") | `context-chainer.ts` (data), `render-rollback-containment.ts` (words) |
| Reviewer rule (`change_reviewer`, FOUR-domain shared key): a provenance claim you cannot check against the source is an **UNVERIFIABLE SUSPICION** — escalation-shaped, never a proven fabrication; where §6 carries the fact, READ it instead of inferring from prose | corpus check: 81 of 119 approvals use provenance vocabulary and would have had to rewrite under a symmetric rule — so the rule is scoped to ADVERSE claims (target population: the 3 refusals that blocked while admitting they could not check) | `ROLE_GUIDANCE_LIBRARY`, reseeded prod 2026-09-11 |

**Two distinctions this arc added to the discipline's vocabulary:**

- **(a)/(b) sub-classes of a provenance-shaped refusal.** (a) required evidence genuinely absent from
  the package — a LEGITIMATE catch; prose fixes it (the June 2026 k8s refusal: harvester HAD the
  ❌-None captures, the package omitted them). (b) content correct but reviewer-unverifiable from its
  seat — only a mechanical fact ends it. The fact must end (b) **without suppressing (a)**: it answers
  only "is this content contained in the witnessed harvest?" and says nothing about completeness — a
  package that omits its evidence sections yields `no-restore-blocks`, which approves nothing. Pinned by
  the June k8s fixture as a REQUIRED non-suppression test (greedy predicate ⇒ that assertion fails).
- **Path 3 (Adjudication) earn-it rule** for a mechanical net: ≥2 occurrences of a judgement repeatedly
  made by a party **structurally blind to the deciding evidence**, plus corpus FP-bounding; a Path-3
  leaf may escalate but never block. Condition 1 is FALSE in the (a) lane by construction (the reviewer
  saw everything and was right) — citing an (a)-lane refusal as Path-3 evidence is how the path gets
  abused. Toolkit amendment owned by execution-facts-specialist.

**Live acceptance: R3b-3 (root `cmtwcpnwo0003yx2dvd6wxsbd`, 2026-09-11 02:43–02:51Z) — PASSED, APPROVED
90.** Author `result.json`: `checked:true`, 26/26 restore lines found, `rollbackDisposition: benign`;
the Reviewer's `chainedFrom[].rollbackContainment` byte-identical; verdict `blocking: []`. The Reviewer
wrote *"Platform fact cited directly (not inferred from prose) … this proves line-level provenance only,
not completeness; I independently checked completeness"* — the (a)/(b) boundary holding live. Passing
direction only; the escalation direction rests on the mutation fixtures by design. Record:
`cline_docs/reviews/rollback-containment-2026-09-11/R3B-3-LIVE-ACCEPTANCE.md`.

**Open, earned live, not designed:** the **context-entry residue** (`router bgp 65001`, `interface
LoopbackN` — navigation in a removal rollback, restored CONTENT in R19 where all 9 openers are in the
harvest; no text-level rule separates them; two candidate rules tested and rejected on the corpus) —
`cline_docs/follow-ups/rollback-containment-context-entry-2026-09-11.md`. And the **successor
problem** from R12 (an author can predict what it CONFIGURES, not what the device DISPLAYS) remains
untouched by this arc.

**Specialist boundary moved (supersedes "Specialist trigger" above):** on 2026-09-11 the fact
PRODUCTION side — nets, enrichments, stamping/whitelist, dispositions, replay, fixtures, the
corpus-measure practice — split to **`execution-facts-specialist`** (SPECIALIST-LIFECYCLE-GUIDE §3b);
this document's epistemic lens and every gate/verdict/consumption ruling stay with
pipeline-harness-specialist. The fact schema is the contract between them.

**Map 10** (`cline_docs/learning/10-the-signal-chain.md`) is the complementary axis: this document governs
whether a judgment may be believed; Map 10 governs whether a computed fact survives delivery to the reader
who needs it. Neither substitutes for the other.
