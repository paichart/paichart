# VT-26 — an independent program reproduces the cross-domain crossing; the assessor's first reading of it was wrong

**Status**: VERIFIED 2026-09-17 (live, single unrehearsed run) | Re-verify trigger: any change to
`context-chainer.ts` injection, `render-pipeline-context.ts`, or the containment enrichment.
**Layer**: program (two pipeline-tier legs, three human gates)
**Round type**: independent replication of VT-25's fix, plus first live data for the §6 containment render
**Date:** 2026-09-17. **POV:** Multi-Domain Autonomous Delivery — Showcase, phase *1 — Prove the
Number Crossed*. **Program task** `cmu4ue35a000wyx8yz5v23qdm`.

## Objective

VT-25 found that a derived value reached a *leg* and never reached the leg's *children*, fixed it, and
verified the fix on the fourth round of the same investigation. A fix verified on the run that
produced it is weak evidence. This round asks whether the same machinery works **on a different POV,
a different program instance, and a workload nobody tuned for it** — and whether the value that
crosses is *correct*, not merely *delivered*.

## Setup

One program, two domains, one runtime-derived value:

1. **Cluster leg** (`kubernetes-gitops`) — harvest the live pod addresses in a namespace and derive
   the smallest single range covering them.
2. **Cloud leg** (`terraform-iac`) — author a bucket policy restricting object writes to exactly that
   range and nothing wider.

The pod addresses are assigned by the CNI at schedule time. No manifest contains them, they differ
between clusters, and they change on reschedule — so nothing but a live harvest can know them. The
Program Architect, which reads only the two design artifacts and has no live state access, recorded
this in its own interface contract before any leg ran:

> `"podAddresses": "UNKNOWN until harvest — runtime-assigned by the CNI at schedule time; must never
> be assumed, guessed, or carried in from any other document"`

## The arithmetic was the hard case, by accident

The live pods were at **10.244.0.5** and **10.244.0.6**.

These are adjacent, and the intuitive minimal cover is a `/31`. That is **wrong**: a `/31` covers an
*aligned* pair, and `.5`/`.6` straddle a boundary. The true minimal cover is `10.244.0.4/30`.

This is the exact arithmetic recorded in the program-artifact template as having lost two earlier
rounds directly. Nobody arranged for it — it is where the scheduler happened to place the pods.

**The run produced `10.244.0.4/30`.**

## Result

**Producer side** — cluster leg's own stamp:

```json
{ "checked": true, "harvestedCount": 2, "violations": [],
  "derivedValues": [{ "kind": "cidr", "value": "10.244.0.4/30" }],
  "containmentDisposition": { "disposition": "benign", "reason": "checked-clean" } }
```

**Consumer side** — cloud leg's own stamp, naming the producer:

```json
{ "upstreamContainment": {
    "legs": [{ "taskId": "<cluster leg>", "checked": true, "violations": 0,
               "derivedValues": [{ "kind": "cidr", "value": "10.244.0.4/30" }],
               "disposition": "benign", "dispositionReason": "checked-clean" }],
    "green": true },
  "containmentDisposition": { "disposition": "benign",
    "reason": "consuming-leg-consumed-discharged",
    "inputs": { "consumedCount": 1, "upstreamContainmentGreen": true, "violationCount": 0 } } }
```

The consumer does not merely *contain* the right number. Its own stamp carries the **producer's task
id and the producer's value**, so the claim *"the consumer used the producer's number"* is answerable
from the record rather than from reading prose.

**Delivery, measured on the consuming children's own rows:**

| child role | chained entries | stamped `inheritedFromLeg` | carries containment |
|---|---|---|---|
| `infra_state_harvester` | 0 | 0 | 0 |
| `infra_change_architect` | 2 | **1** | 2 |
| `config_change_author` | 2 | **1** | 2 |
| `change_reviewer` | 1 | 0 | 1 |

Both consuming children hold the upstream deliverable. **Both excluded roles hold none of it**, and
the two exclusions have different reasons: a harvester's output is a point-in-time snapshot and an
upstream report carries allocations in the shape of a harvest table, so one folded into a harvest
block would produce machine-parsed ground truth containing a value nobody observed; a reviewer must
not receive a second reviewable document. Both behaved as the reasoning predicted, unprompted.

The injected entries each carry `disposition: benign`, `reason: checked-clean` — the first live data
for the §6 containment render, which shipped the same morning on corpus evidence alone.

**Outcome:** cluster gate `approved`/90 · cloud gate `approved`/82 · program integration reviewer
`## VERDICT: APPROVED`, blocking none, confidence 93 · **`programReleasable: true`**.
18 executions, **18 SUCCESS, 0 failures**. Launched 01:27:54, releasable 02:05:37 — 38 minutes
wall-clock including three human approval pauses; the cluster leg ran 7m39s and the cloud leg 9m22s.

Protocol composition: `pipeline-orchestrator-protocol` 3.14.0 + `pov-program-protocol` 1.5.1.

## The assessor got it wrong first, and that is part of the record

The first written assessment of this run reported a **gap**: that the cloud leg carried no containment
fact, and that the cross-leg consumption was therefore "attested by prose, not by the mechanical net."

That was false. The attestation above is what actually existed.

Two mechanisms produced the error, and both are ordinary:

- **A harness leg has at least two executions** — the pass that decomposes it, and the terminal pass
  that stamps the leg-level facts. The cloud leg's were at `01:51:53` (no fact) and `02:00:43` (the
  fact). The read was taken at ~01:52.
- **`jsonb_pretty(NULL)` prints blank**, which is indistinguishable from a key that is present and
  empty.

Underneath both: **`task.status = COMPLETED` does not mean a leg is settled.** The assessor's own poll
printed `task=COMPLETED exec=RUNNING` in the same row the read came from.

This matters beyond one mistake, because **absence is specified to fail closed** — an absent
containment fact is to be treated as blocking. So a premature read does not yield "no data"; it
manufactures a **false blocking finding about a healthy run**. The correction is now a standing rule in
both forensics guides: *absent, benign and not-yet-stamped are three different states, and only one of
them is a finding.*

## What this round does NOT establish

- **It does not close VT-25's open caveats.** The dep-free delivery path is still fixture-proven only
  (the one dep-free child here is the harvester, which is *excluded*, so it tests exclusion rather
  than delivery); the harvester exclusion's positive case is still untested; and the *included* set
  remains by default rather than by argument.
- **Only the `benign` arm of the containment disposition fired.** The `blocking` and `needs-node-c`
  arms did not occur on this run.
- **The §6 render's OUTPUT was not observed, only its INPUT.** Agent prompts are not persisted. That
  both injected entries carry a non-empty disposition is measured; that the child saw the rendered
  line is inferred from that plus the fixtures pinning the render in both directions.
- **One value shape, one consumer.** A two-address CIDR crossing to a single consumer. No ASN, no
  fragmented pool, and no fan-out of one derived value to multiple consumers in different languages.
- **This is one run.** It replicates VT-25's fix on independent ground; it does not establish a rate.

## Method note

Every figure here was read after the program reached terminal, with key presence tested via
`(content::jsonb) ? 'derivationContainment'` and `jsonb_typeof`, and with every execution of a leg
listed before choosing which one to read — not `ORDER BY "startTime" DESC LIMIT 1`. The first pass did
neither, which is why the first pass was wrong.
