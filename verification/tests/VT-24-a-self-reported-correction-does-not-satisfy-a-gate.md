# VT-24 — a self-reported correction does not satisfy a gate; the mechanical record governs, and the gate fails CLOSED

**Status**: VERIFIED 2026-09-16 (live, one round) | Re-verify trigger: any change to how the program
integration reviewer (Node C) retrieves a sibling leg's facts; a `pov-program` protocol bump touching
the Node C evidence-retrieval clause; or a change to `derivationContainment`'s disposition arms such
that `blocking` can be reached without a parse failure.
**Layer**: program (with two pipeline-tier legs as the specimen)
**Round type**: functional acceptance + unplanned failure-injection (the correction cycle was not planned)

**Date:** 2026-09-16. **POV:** Cheap-Rig Program Runs, phase *Cross-domain program: cluster pod range
to cloud archive*. Related: VT-15 (the cross-domain evidence contract this round exercises from the
other side), VT-13 (containment as a blocking conjunct), VT-21 (the sibling lesson — a fact delivered
where the judgement happens).

## Objective

Three claims, tested together because the third is only interesting if the first two hold.

1. **A runtime value can cross a DOMAIN boundary verbatim** — not merely a leg boundary. The producer
   speaks Kubernetes, the consumer speaks Terraform, and they share no vocabulary except the value.
2. **The revision path closes**: a leg whose evidence fails a mechanical check is refused by its own
   reviewer, and a corrected package earns approval on re-review.
3. **When a self-reported correction contradicts a mechanical fact, the gate follows the FACT and
   BLOCKS.** The direction of that failure is the claim: fail-closed, not fail-open.

Explicitly ruled out as wrong behaviours: a gate accepting "we fixed it" prose as evidence; a gate
passing because a leg's *metadata* said `approved`; and a reviewer waving through evidence it could
not actually parse.

## Setup

Both legs ran against **low-cost read-only rigs** — a `kind` Kubernetes cluster and a LocalStack AWS
— deliberately avoiding the device lab. Cost was a fraction of a device-reaching round.

The crossing value is genuinely irreducible: **pod addresses are assigned by the CNI at schedule
time**, appear in no manifest, differ between clusters, and change on reschedule. Nothing outside a
live harvest can know them. The design artifacts state the namespace and the selection rule and
**deliberately withhold any address or prefix length**, so minimality remains a real check rather
than a restatement.

## What happened

| stage | result |
|---|---|
| Architect plan | 0 leaked values; 7 assumptions, 2 confirmed at the gate, 1 corrected |
| cluster leg (Kubernetes) | harvested 2 live pod addresses → derived one range |
| leg reviewer, round 1 | **NEEDS-REVISION** — the mandatory evidence block failed machine-parse |
| corrected package | re-authored, **re-reviewed: APPROVED, 0 blocking** |
| cloud leg (Terraform) | **approved** — consumed the range verbatim |
| **Node C (program integration)** | **NEEDS-REVISION → `programReleasable: false`** |

**Claim 1 — VERIFIED.** The derived range was consumed character-for-character by the cloud leg and
written into an S3 bucket policy. Independently re-computed: both harvested addresses fall inside it;
it is genuinely minimal (neither half-prefix covers both); and the two addresses the minimal prefix
unavoidably includes are **named in the package**, as the acceptance checks require.

**Claim 2 — VERIFIED.** The first package expressed its evidence block in a shape the platform parser
rejects. The leg's own reviewer caught it and named the cause precisely — not "looks wrong", but *the
block fails the platform's machine-parse check*. After correction, the same reviewer returned APPROVED
with zero blocking issues. This path had never been exercised end-to-end before.

**Claim 3 — VERIFIED, and this is the round's substance.** Node C retrieved the cluster leg's stamped
facts and found the containment check reading NOT-checked / blocking — while that same execution's
metadata read `approved`, and a harness comment declared *"outcome corrected: NEEDS-REVISION →
APPROVED"*. Node C's own words:

> *"A self-reported comment/metadata update declaring success is not itself proof the underlying
> mechanical check passed."*

It refused the prose, followed the fact, and blocked the program.

## ⚠️ Honest disclosure — the fact Node C read was itself stale

This round is published *with* an open defect, because the defect is what makes the claim meaningful.

The corrected package existed before the leg re-synthesised, yet the containment fact on the leg's
final execution still reflected the pre-correction state. So Node C blocked on a fact that was
arguably out of date.

**That does not weaken claim 3 — it is the sharpest possible form of it.** When prose and mechanical
record disagreed, the system did not split the difference, and did not prefer the cheerful reading. It
**failed closed**: a correct-looking program was withheld rather than released on an unverified claim.
A system that fails open under the same conditions would have shipped.

The staleness is a real defect, filed with the fact-production owner with the full timeline, and its
repair is tracked separately. What it does not do is put a wrong value into an approved artifact.

## Why this round is not a green-pass demonstration

`programReleasable` is **false**. Nothing here shows a program completing. What it shows is a gate
declining to be talked into passing — including by the platform's own prose, and including when the
human operator (who wrote the correcting instruction and released the preceding gates) believed the
issue resolved.

The operator was wrong about the shape of the evidence block in the first place. The mechanical check
caught the operator, the reviewer caught the package, and the program gate caught the claim that both
had been fixed.
