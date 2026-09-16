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

## ⚠️ Correction, 2026-09-16 — the fact was NOT stale, and the claim is stronger for it

**This section originally asserted that the fact Node C blocked on was out of date. That was wrong,
and the error was the author's.** It is recorded rather than quietly edited, because a verification
pack that silently revises its own evidence is worth nothing.

A fact-production investigation established, from source and corpus:

- **Nothing was stale.** The enrichment reads the newest child artifact by a direct query; it read the
  corrected package. The proof is in the stamps themselves — the disposition reason *changed* between
  the two synthesises, and the second reason is only reachable once the corrected block parsed.
- **The real cause**: the derived value had no **harvest pool** to be contained against. The leg's
  *harvester* never emitted the machine-readable pool; the author did, and the check refuses a pool
  from the author **by design** — a derivation must be checked against what was actually observed,
  not against a restatement by the party doing the deriving.
- **Root cause is a protocol coverage gap.** This domain's protocol mandates the consuming block but
  never mandated the producing ones: **0 of 7** of its harvesters have ever emitted the pool marker,
  against 74/96 and 13/40 in two sibling domains. This round is the first to use the domain as an
  upstream producer, and the gap had therefore never been reachable before.

**So Node C blocked on a CORRECT fact, for a correct reason: an unverifiable derivation.** The
original claim survives intact and is strengthened — the gate refused a self-reported correction, and
the mechanical record it preferred turned out to be right.

One genuine defect remains, and it is a **label**, not a judgement: the disposition's reason string
names a leg identity the code does not actually know, and has been wrong on 100% of its live
occurrences (2 of 2, both producing legs). Blocking was correct in both. Filed; no consumer keys on
the string.

**What the leg would have to do to pass** — proven by running the shipping check against this round's
real values: the harvester emits the pool block the author already carried, and the result is a clean
pass with no violations. The entire gap was one block on the wrong child.

## Why this round is not a green-pass demonstration

`programReleasable` is **false**. Nothing here shows a program completing. What it shows is a gate
declining to be talked into passing — including by the platform's own prose, and including when the
human operator (who wrote the correcting instruction and released the preceding gates) believed the
issue resolved.

The operator was wrong about the shape of the evidence block in the first place. The mechanical check
caught the operator, the reviewer caught the package, and the program gate caught the claim that both
had been fixed.
