# VT-27 — a gate standing between a producer and its consumer is opaque to the chain; one leg in three said so

**Status**: ✅ VERIFIED 2026-09-19 — fix shipped and confirmed on two independent rounds.
Drafted contemporaneously 2026-09-18 while the defect was open and held back from this pack until a
fix existed and an independent round confirmed it; the after-state below was added when R4 and R6 did. Re-verify trigger: any change to `context-chainer.ts` dependency walking, the
pov-program PLAN-SPAWN gate grammar, or the `program_architect` DAG clause.
**Layer**: program (four pipeline-tier legs, five human gates)
**Round type**: third round of a remediation campaign; first round with correctly-placed gates
**Date:** 2026-09-18. **POV:** Multi-Domain Autonomous Delivery — Showcase, phase *5 — One Objective,
Four Domains*. **Program task** `cmu6ldv0000g6yxqfr1f6cy7r`, child stage `cmu6lgabz00gmyxqf3cv3ybiq`.

## Objective

One value, derived once from live device state, consumed by three independently-authored changes in
three configuration languages that share no vocabulary (Kubernetes YAML, Terraform HCL, an
observability rule). Rounds 1 and 2 had each been refused for unrelated reasons. Round 3 was the
first with the governance defect fixed: each value gate placed BETWEEN the producing leg and its
consumer, rather than hanging off its own leg as a dead end.

It was also the first round whose inputs carried no trace of the previous rounds — see *The
contamination control* below, which is the reason this round can say anything at all about whether a
requirements fix carries on its own.

## What was found

**Fixing the gate's position severed the data path.** Placing a gate between producer and consumer
makes the consumer's only direct dependency an APPROVAL task. `context-chainer.ts` walks DIRECT
dependency edges, and a gate is template-less: no execution, no deliverable, nothing to carry.

```
FABRIC leg ─┬─► CLUSTER gate ─► K8S leg          chainedFrom = 0
            ├─► CLOUD gate   ─► CLOUD leg        chainedFrom = 0
            └─► OBS gate     ─► OBS leg          chainedFrom = 0
```

Round 1 "worked" only because its gates were MISPLACED — each consumer took a direct edge from the
fabric leg, and the four domain gates hung off their legs as leaf dead-ends, blocking nothing.
Verified at the dependency edges in both rounds (R1 stage `cmu4wqe70005syx8yhlo3t82b`).

Two mechanisms, each correct alone, that consume the same resource: a dependency edge is how
governance orders work AND how data travels. Interposing one silently spent the other.

## The finding that matters more: one broken input, three behaviours

| leg | outcome | what actually happened |
|---|---|---|
| K8s | **approved 92** | the leg harness made **three `agent.results` calls** during CREATE — its gate (nothing there), then the sibling fabric leg, then that leg's own architect child — and wrote `10.99.0.0/27` into its child briefs itself |
| Cloud | **escalated 20** | its architect found no value in §6 and stopped, exactly as its brief instructed |
| Observability | **approved 84** | took the sanctioned (b) aggregate branch, which needs no range at all |

**Only the refusal made the defect visible.** Had the cloud harness compensated the way the k8s
harness did, the program would have gone green with a value-delivery path that does not work.

Three consequences worth separating:

1. **The K8s leg succeeded by violating the chained-context discipline.** Reading a predecessor's
   output directly instead of through §6 is the documented anti-pattern; the third call reached
   inside *another leg's private child stage*. It produced the correct value and a provenance
   sentence that reads as impeccable — *"consumed verbatim from the fabric leg (task
   `cmu6lmwao00idyxqft4hx66qj`) — not recomputed, not widened"* — while describing an unsanctioned
   retrieval. A downstream reviewer cannot tell the difference from the package.
2. **The observability pass is CONFOUNDED, not clean.** Branch (a) required a labelling mechanism
   *keyed to* `derivedRange`; with no range, (a) was unreachable, so the break forced (b) regardless
   of merit. Its reviewer's own work was sound — it independently re-derived `for:45s ÷
   scrape_interval 15s = 3 consecutive misses` and graded VERIFIED-AGAINST-EVIDENCE — but this run
   cannot distinguish *chose (b)* from *was left with (b)*.
3. **The cloud architect declined both available shortcuts and said why.** It would not treat the
   harvester's empty `## Harvested Allocations` as a substitute, and it would not reach around the
   chain: *"bypassing that chain to 'go find' the value would itself be a form of guessing."*

## What the gate did — the part that worked

- `programReleasable: false`; `qualityGate.outcome: needs-revision`, `reviewerScore: 20`.
- The MIN-across-legs rule pulled 88 / 92 / 84 / 20 to **20**. No amount of success elsewhere
  papered over one refusal.
- **Node C diagnosed the structural defect itself**, unprompted: *"DAG-wiring defect between fabric
  leg and the cloud/observability gates must be fixed and those legs re-run before release."*
- Node C also refused the observability leg at face value, calling out the *"unscoped aggregate
  substitute"* that leg's own reviewer had approved at 84. The confound above was found by hand in
  four queries; the program tier found it by gating.

## The producer worked, and the requirements fix carried

The fabric leg (approved 88) derived `10.99.0.0/27` from a live read-only harvest of both switches:
six `/32` exporter loopbacks, with an unprompted minimality proof (*"no single `/28` covers both
halves"*). It established the parent-range ceiling `10.99.0.0/24` **from harvest evidence** — no
configured aggregate, summary route or prefix-list exists on either device, so the only structural
evidence is the shared top 24 bits — and cited the contract field `coveringRangeParentBoundaryRule`
by name. `derivationContainment`: `checked: true`, `violations: []`, `harvestedCount: 6`, disposition
`benign / checked-clean`.

That clause had been added to `requirements.md` ninety minutes earlier, to fix a defect the round-2
Architect had surfaced: the document classified the parent range as contract-static *"as given in
topology.json"*, and `topology.json` says the opposite. Nothing told this leg what any previous round
got wrong.

## The contamination control — why round 3 exists at all

Round 2 was **superseded, not deleted**, for input contamination. Its PRE-FLIGHT CLEARANCE blocks had
mixed the mechanical duplicate-halt clearance with narrative naming the prior round's specific defect
and score. The harness propagated that narrative into child briefs verbatim: on round 2's fabric leg
it reached the design role, and on an earlier phase-2 run it reached the **reviewer**, handing the
judge the exact failing string to look for. Round 3's clearance carries stage identifiers only — no
outcomes, no scores, no defect names, not even a round count — and its program description drops the
"what changed since round 1" summary that had enumerated all four fixes to the Architect directly.

This is why the fabric-leg result above is evidence of anything. Round 2's equivalent passed too, and
proved nothing.

## A second defect, caught at the gate rather than by running

The harness's CREATE step told the Architect to name each DAG entry's protocol token *"e.g.
`network-change-protocol` / `k8s-change-protocol` / `cloud-change-protocol` /
`observability-change-protocol` as applicable"* — four tokens that exist nowhere. The Architect used
them verbatim and all four legs were created mis-tokened. Protocol resolution is a pure suffix rule
with no library lookup, so an invented token is stamped unchallenged at create time and throws
`NAMED_PROTOCOL_NOT_FOUND` only at leg execution — after gate approval, on a program that cannot
re-run in place. Corrected by hand at the plan gate before release.

Root cause was not the harness inventing: the sanctioned list *already existed*, in the
`program_architect` role guidance, and was **already stale** — `observability-config` shipped
2026-09-10 and was never added, in the same bullet warning that a mis-tokened entry misroutes a whole
pipeline. Fixed, plus a mutation-proven CI assertion so the next domain cannot repeat it
(copov15 `b076f325`).

## The fixes

**Fix A — the DAG grammar. SHIPPED 2026-09-19, verified twice.** A consumer of a produced value depends on BOTH
its gate and the producing leg. The edges do unrelated jobs: the gate is governance (an APPROVAL
dependency is enforced, so the leg cannot start before a human approves), the producer edge is data.

⚠️ Not to be fixed by teaching the chainer to walk THROUGH gates — that makes gate placement stop
meaning what it says, and the next interposed node type re-opens the hole.

**Fix B — the open question.** Should a leg harness be able to route around a missing chain at all?
`agent.results` cannot simply be removed: SYNTHESIZE requires it on every child, and PLAN-SPAWN uses
it to read the Architect's plan. The tractable form is an authorization predicate — permit it on the
caller's own child stage and its own direct dependencies, which leaves calls 2 and 3 above denied and
turns silent compensation into the same loud escalation the cloud leg produced. If compensation is
instead allowed, it must be a FACT on the execution, because a package whose value arrived by
self-retrieval is not the same artifact as one whose value arrived by chaining, and today they are
indistinguishable downstream.

## The after-state — fix shipped, verified on two rounds

**Fix A landed at both ends in one sitting**, because a rule in the transcriber and not the author
does not bind: the `program_architect` DAG clause (the Architect writes the edges) and pov-program
**1.7.0** PLAN-SPAWN step 4 (the harness transcribes them verbatim). A third surface — the customer
`requirements.md` — had to change too, and it was the actual origin: it *forbade* the direct edge and
asserted that the value "reaches the leg through" the gate, a mechanism that does not exist. The
template offered both wirings as a design choice; `igp-migration-t1-triangle` had taken the working
branch and run correctly, so the choice had been a coin flip in production for months.

Deliberately NOT fixed by teaching the chainer to walk THROUGH gates — that makes gate placement stop
meaning what it says, and the next interposed node type re-opens the hole.

### Round 4 — delivery restored, measured

| leg | `chainedFrom` | value present |
|---|---|---|
| P2 Cluster (Kubernetes) | **1** | `10.99.0.0/27` ✓ |
| P3 Cloud (Terraform) | **1** | `10.99.0.0/27` ✓ |
| P4 Observability | **1** | `10.99.0.0/27` ✓ |

Against `chainedFrom: 0` on all three before the fix. The program's own synthesis: *"runtime-derived
value verified **byte-identical across all 4 legs** with clean mechanical containment."*

### Round 6 — independently verified at program tier

R4 proved delivery; a fix verified only on the run that produced it is weak evidence. R6 re-ran the
objective from a fresh program task with every input defect closed, and its integration reviewer
graded the crossing from structured facts — quoting each leg's `## Consumed Values` block and
**recomputing the `/28` split itself** rather than accepting the producer's claim:

> **Verbatim conformance across all 3 consumer legs — PASS. Identical literal value, zero
> recomputation / widening / rounding detected anywhere.** VERIFIED-AGAINST-EVIDENCE.

It also read P4's case correctly rather than mechanically: the range sits in `annotations.description`
rather than a query predicate **because no in-pool scrape target exists in the harvest**, which it
graded as correct consumption instead of flagging it as non-consumption.

### What the fix did NOT do, and the two rounds say so

`programReleasable` was **false** on both. R4: two legs blocked on validation shape. R6: one on a
recurring validation shape, one on an unescalated credential-pattern finding. The value claim and the
package set are separate, and R6's program summary states the separation itself — *"cross-domain
value-passing verified conformant by Node C, but 2 of 4 legs carry NEEDS-REVISION verdicts on
protocol-compliance defects unrelated to the value itself."* **Delivery was fixed. Release was not
achieved, and has not been in six rounds.**

⚠️ **R6 required two operator interventions** and is not a clean autonomous run: the fabric leg
duplicate-halted and was released in place, and recovering it orphaned the downstream cascade — three
legs plus the producer and Node C never queued despite every dependency being satisfied. The platform
detected that itself, named it `orphaned-cascade-after-root-recovery`, enumerated the five affected
tasks, and refused to synthesize over it; after they were hand-started it re-synthesized with a real
verdict **and kept the escalation record**. The delivery measurements above are unaffected — chaining
runs at a single chokepoint inside `createAgentExecution`, so a hand-started leg chains identically,
which these runs incidentally confirm.

## What this round does NOT establish

- **One run.** Three behaviours from three legs is not a rate.
- **The observability outcome is confounded** and cannot be scored either way from this round.
- ~~Fix A is unverified~~ — **closed 2026-09-19**: shipped, and verified on R4 and R6 (above).
- ~~"A requirements fix carries without a hint" is still same-domain~~ — **closed**: R6's cloud leg
  cleared its validation defect after the `Writing rules` section it had been cited but could not read
  was added, and R4/R6 ran the crossing across three domains. Still open in one place: the k8s leg has
  been blocked **three times on the same command**, inventing a different unsanctioned validation shape
  each time, because its domain protocol declares no position on whether any is licensed.
- **The K8s compensation was found by reading tool calls**, not by any signal the platform emits. How
  often it happens elsewhere is unmeasured.

## Method note

`chainedFrom = 0` on a leg whose brief says *"consume X verbatim from chained context"* is the
post-run confirmation. ⚠️ It is NOT a pre-run check: `chainedFrom` is written at execution time, so
before a leg runs it reads 0 whether the wiring is right or wrong — this doc first said otherwise and
was corrected on 2026-09-19 when the query returned 0 across a run whose edges were provably correct.
The PRE-run check is the dependency edges: every consumer must depend on its gate AND on its producer. The gate MOMENTS were verified at the dependency edges that
morning; nobody checked that consumers could still SEE their producer. Both forensics guides should
carry the query beside the tier rule.

Evidence: fabric `cmu6lmwao00idyxqft4hx66qj` · K8s `cmu6lojph00izyxqf1oc40txb` · cloud
`cmu6lojqo00j4yxqfs01hwmbi` · obs `cmu6lojrs00j9yxqffg3qc2in`. Follow-up:
`cline_docs/follow-ups/gate-interposition-severs-value-delivery-2026-09-18.md` (copov15 `e910821e`).
