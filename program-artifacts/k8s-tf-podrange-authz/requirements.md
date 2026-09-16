# Authorise the log archive for exactly the namespace's current pod range

Two domains, two cheap read-only rigs, one runtime-derived value crossing between them.
Read this before questioning the shape: everything here is deliberate.

## What must happen

A Kubernetes namespace runs a workload whose pods write application logs to a cloud archive
bucket. Today the bucket is not restricted to them. Restrict it — to exactly the range the
pods currently occupy, and to nothing wider.

## Why this is a program and not one pipeline

The two halves are owned by different teams, speak different vocabularies, and are approved by
different people. The cluster half is a Kubernetes concern; the cloud half is a Terraform
concern. They share exactly one thing: a range that does not exist until the cluster is
harvested.

## Approval gates

| gate | approves | approver |
|---|---|---|
| program plan | the plan and the interface contract, before any leg runs | Steve Terry |
| cluster change | the METHOD: which namespace, which addresses count, how the range is derived | Josh Allen |
| cloud IaC change | the PRODUCED range — the concrete value, not intent-to-proceed | Jacob Wilcox |

Three gates, three different approvers, crossed at three different MOMENTS — the plan before
anything runs, the method before the cluster is touched, and the produced value only once it
exists. The distinct owners are the point: a program exists precisely because the halves are
approved by different people, and a gate that the producing team can release itself is not a
gate.

## Pipeline 1 objective — cluster (UPSTREAM)

Harvest the namespace read-only. Establish which pods are running and what addresses they
currently hold. Derive **the smallest single range that covers every one of them**. Publish the
derived range, the harvested addresses it was derived from, and the computation that produced
it.

Do not widen the range for future pods, for convenience, or for a rounder number. Minimal means
minimal. If the smallest covering range necessarily includes addresses that are not pods, that
is a property of the addresses, not a licence to round.

⚠️ **The range is only valid for the harvest that produced it.** Pod addresses change on
reschedule. The change package must say so — an operator applying it later needs to know the
value has a shelf life. Do not present it as durable.

## Pipeline 2 objective — cloud (DOWNSTREAM)

Consume the derived range **verbatim** from chained §6 Pipeline Context. Never recompute it,
never guess it, never widen it; escalate rather than proceed if it is absent. Read-only
Terraform state harvest of the bucket named in `topology.json`, workspace `prod`. Author an
`aws_s3_bucket_policy` restricting `s3:PutObject` to that range, as a PR diff. Never applied.

The policy authorises ONE range. A wider prefix that happens to contain it is a REJECT even if
it swallows nothing else — the point is that the cloud side states what the cluster side
derived, not something compatible with it.

## Node C — integration review (facts only)

Check numbering is FIXED and referenced by number elsewhere. A new requirement APPENDS (7, 8,
…). It never renumbers, merges, or substitutes into 1–6.

1. The range in the Terraform policy is **identical** to the range the cluster leg published —
   character for character, not merely equivalent.
2. The range is **minimal** for the harvested addresses: recompute it and show the arithmetic.
3. Every harvested pod address falls **inside** the range.
4. The range covers **no address the harvest did not report as a pod**, beyond those the
   minimal prefix unavoidably includes — and if any are unavoidably included, they are named.
5. The cluster leg's published addresses are the ones it actually harvested, not restated from
   any other document.
6. The change package states that the range is **harvest-bound** and will drift when pods are
   rescheduled.

## Validation shape

Governed by each leg's own active protocol, not by this file. Where a leg's protocol sanctions
a shape for output that has not been witnessed, that shape is available to it here. This
document does not restate, weaken or override a protocol clause — an artifact that restates a
protocol rule in absolute terms creates a contradiction the reading agent must silently
resolve, and silent resolution is the failure this sentence exists to prevent.

## Connection surfaces

Each leg reaches its rig only through a self-provisioned read-only MCP service, and
`topology.json` declares no `endpoint`/`category`/`tools` of its own. The two descriptor URLs
are in `readOnlyServices`, and **each leg's task description must name its own**. A harvest role
handed only topology data is correct to refuse to invent the missing connection fields, and the
leg blocks at Phase 0 with nothing harvested.
