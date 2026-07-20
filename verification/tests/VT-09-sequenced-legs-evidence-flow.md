# VT-09 — A value that did not exist at plan time flows, verbatim and evidence-checked, across sequenced pipelines

**Status**: VERIFIED 2026-07-18 (live lab validation, the arc's clean pass after five adversarial
rounds) | Re-verify trigger: network-provisioning or pov-program major bump; any change to the
derivation-containment validator or its parser
**Layer**: program (sequenced composition) + evidence-flow verification stack
**Round type**: functional (green path), earned through failure rounds — see "The road here"

## Objective

Two claims under test, together:

1. **Sequenced runtime chaining**: a program leg can depend on a *value that did not exist when the
   plan was approved*. The network leg harvests a live switch fabric, selects free exporter
   addresses, and derives a minimal covering aggregate; the terraform leg — held by a sibling-DAG
   edge until the network deliverable is fully persisted — must authorize **exactly** that aggregate,
   read from chained context, never guessed or recomputed.
2. **Evidence-flow verification**: every derived value is checked against the harvested ground truth
   at multiple independent tiers — a structured harvest block, a declared derivation with its
   intended members, per-entry containment by the leg reviewer, a **mechanical platform check
   anchored to the harvest artifact itself**, and an integration reviewer that retrieves structured
   facts by tool and grades its findings as verified-against-evidence vs accepted-from-claims.

"Completed" is not the bar; **releasable, with every derived value machine-checked**, is.

## Method

1. Run the two-pipeline sequenced program (network provisioning → Terraform IaC) against the live
   cEOS fabric and the LocalStack telemetry archive, both healthy, no injected faults. The fabric
   carries six pre-existing scattered `/32` allocations the derivation must not swallow.
2. Release the plan gate and both domain gates (human).
3. Verify the full fact-set: the harvest's structured allocations block, the design's declared
   derivation (value + members), the package's verbatim provenance-quoted evidence, the platform's
   `derivationContainment` fact, both leg verdicts, the integration reviewer's verdict, and the
   program release stamp.

## Config

- Sequenced two-pipeline program; design artifacts `meridian-t6-sequenced` (topology-as-code +
  requirements, fetched by the Program Architect).
- Protocols: `network-provisioning` v1.2.0 (the evidence-flow contract) + `pov-program` v1.0.9
  (evidence grounding + structured-facts retrieval) + `pipeline-orchestrator` v3.9.0.

## Expected observables

- The network leg's derived aggregate covers exactly its selected members and **no pre-existing
  allocation** (the fabric seeds six).
- The terraform leg's `aws:SourceIp` condition equals the derived aggregate **verbatim** (chained,
  not recomputed — the value post-dates plan approval).
- `derivationContainment` in the network leg's run record: `checked: true, violations: []`, with the
  harvest and package artifacts named as sources.
- Both leg quality gates `approved`; integration reviewer `APPROVED, blocking issues: none`;
  program `programReleasable: true`. (Reviewer scores are recorded facts beside the outcomes — 92/94
  on this run; since 2026-07-18 the score is not a gate input at any tier.)

## Observed (2026-07-18 clean pass)

- Selected `10.99.0.4/32` + `10.99.0.5/32`; derived **`10.99.0.4/30`** with binary-prefix arithmetic
  shown; all six pre-existing allocations enumerated and individually cleared in the package.
- Terraform leg authorized `10.99.0.4/30` exactly, from chained context.
- `derivationContainment: { checked: true, violations: [], harvestedCount: 6, derivedCount: 1 }`,
  harvest and package sources named.
- Network leg approved/92 · Terraform leg approved/94 · integration reviewer APPROVED/94, blocking
  issues none · program **approved/92, `programReleasable: true`**.

## The road here — why this round is the strongest in the pack

This green pass was **earned through five adversarial rounds** in which the verification stack was
attacked by real failures and hardened after each:

| Round | What failed | What it taught / changed |
|---|---|---|
| 2–3 | A derived aggregate **swallowed a pre-existing allocation** — and three successive review tiers approved it at *rising* confidence (88/92/94), because the harvest enumeration had been dropped upstream and every tier reviewed claims, not evidence | The evidence-flow contract: structured harvest blocks, verbatim provenance-quoted evidence, per-entry containment, graded findings |
| 4 | The widening never recurred — but an agent **fabricated evidence entries** (with hallucinated "verified" provenance), and its reviewer faithfully escalated against the invention | Evidence sections forbidden without derivations; the harvest is the authority; the **mechanical validator anchors to the harvest artifact, never the package's copy** |
| 5 | A derivation **arithmetic error** (an aggregate that didn't cover its own members) — caught by the leg reviewer | The mechanical containment check, which catches **both** directions: `member-not-covered` (a chosen address *outside* its range — too narrow, this round) and `covered-not-member` (a pre-existing allocation swept *inside* — too wide, the round 2–3 swallow) |
| 6 | The *same* arithmetic error recurred; the leg reviewer **missed it at high confidence** — and the integration reviewer **caught it by recomputation** and blocked release | Integration-tier evidence grounding proven; a parser hardening (agents render mandated headings with cosmetic variance) so the mechanical check can never be blinded by formatting |
| 7 | Nothing. Every tier green, every fact machine-verified | This document |

The failure rounds are the point: each detector in the stack exists because a real defect got past
the tier below it, and each is pinned by a regression test carrying the incident's exact shape
(pinned: `test-derivation-containment`, incident fixtures included).

## See it live

The curated machine record for this round lives in the live-exhibit POV as **Exhibit 5**: the
*Program Runs* phase → the root task *"Exhibit 5 — sequenced legs: network → terraform runtime
chaining"* with its program stage and two pipeline stages (the run's record, untouched), alongside
its brief in the Guided Tour phase and the sequenced-legs commentary. The environment was re-curated
and published the same day; this walkthrough is current.
