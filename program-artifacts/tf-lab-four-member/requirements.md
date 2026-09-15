# Program Requirements

**Use case**: four-member exporter aggregate — telemetry archive authorization.
**Fabric**: 2-node Arista cEOS (`ceos1`, `ceos2`), eBGP 65001 ⇆ 65002 over `10.0.12.0/30`.
**Cloud tier**: `aws_s3_bucket.app_logs` (workspace `prod`), LocalStack rig.
**Sibling**: the two-member variant (`tf-lab-two-member`). This one differs in ONE dimension —
four exporters instead of two — and that dimension is the whole point (see *Why four*).

## Program scope

Stand up dedicated telemetry-exporter loopbacks on the fabric — **two per switch**, a primary and a
secondary export path — advertise the range they occupy, then authorize the cloud telemetry archive
for **exactly** that range and nothing wider.

The program produces **approved change packages only**. Nothing is applied. Apply is out-of-band and
human-gated in both domains.

## Why four (the design rationale — read before questioning the difficulty)

With two exporters, almost any free aligned pair summarizes tightly, and a design that simply looks
for two unused addresses will usually succeed by luck.

With four, two requirements interact: the aggregate must cover **all four** selected addresses, and it
must still cover **no existing allocation**. A selection assembled by taking free addresses one at a
time — the obvious greedy approach — will generally summarize into a prefix that swallows allocations
the design was explicitly told not to touch. The design must therefore reason about **how its
selection summarizes**, not merely about which addresses are unused.

This document deliberately does **not** state what prefix length results, how the four should be
grouped, or which addresses to prefer. That is the design's problem to solve and the reviewer's to
check. Naming it here would convert a property to satisfy into a target to aim at — the failure mode
recorded on Run 15.

## Why this is sequenced (not parallel)

The exporter addresses and the aggregate covering them are **runtime values**. They are selected from
what is actually free on the live devices at harvest time, and the pool's existing allocations are
re-randomized whenever the rig is rebuilt. A value that changes per build cannot be agreed up front in
an interface contract, and no Program Architect can know it — the Architect reads only `topology.json`
and this file, and has no device-state access.

So the cloud leg cannot be designed until the network design exists. The DAG is
`network-provisioning → terraform-iac`, and the dependency is genuine rather than stylistic.

## Approvals (multi-team — one gate per domain, plus the program plan gate)

| gate | approves | approver |
|---|---|---|
| program plan | the plan and interface contract, before any leg runs | Steve Terry |
| network change | the METHOD: harvest, select four free fabric-wide-unique `/32`s (two per switch), derive the covering aggregate, advertise it | Josh Allen (network engineering) |
| cloud IaC change | the PRODUCED aggregate — the concrete value, not intent-to-proceed | Jacob Wilcox (cloud platform) |

The cloud gate is downstream of the network leg by design: it reviews a real derived value.

## Pipeline 1 objective — network provisioning (UPSTREAM)

Harvest both switches read-only (interface state **and** BGP network statements — existing exporter
allocations appear in both). Select **four** free `/32`s from the exporter pool, **two per switch**,
fabric-wide unique. Derive the smallest single prefix covering all four. Configure the new loopbacks
and advertise the aggregate into BGP. Publish the four selected `/32`s, the derived aggregate, and the
computation that produced it.

ASNs are fixed (`ceos1` 65001, `ceos2` 65002). No renumbering. The existing `10.0.12.0/30` transit
link is out of scope.

## Pipeline 2 objective — cloud IaC (DOWNSTREAM)

Consume the network leg's derived aggregate **verbatim** from chained §6 Pipeline Context — never
recompute it, never guess it, and escalate rather than proceed if it is absent. Read-only Terraform
state harvest of `aws_s3_bucket.app_logs` in workspace `prod`. Author an `aws_s3_bucket_policy`
restricting `s3:PutObject` via an `aws:SourceIp` condition to exactly that aggregate, as a PR diff.
Never applied.

## Design constraints

- The exporter pool is `10.99.0.0/24`. Existing allocations are **not listed here** — they are
  discoverable only by harvesting the devices.
- Exporter addresses are advertised `/32`s, so an address duplicated across switches is a real BGP
  conflict, not a cosmetic clash.
- No widening: the authorized range must not cover an address the fabric did not select.
- Validation shape is governed by **your active protocol**, not by this file. Follow the protocol's
  rule for what a validation step must carry, including its provisions for output that has not been
  witnessed. This file does not restate that rule — an artifact restating a protocol clause in weaker
  or absolute terms creates a contradiction the reading agent must silently resolve, which is how a
  correct package came to be blocked on 2026-09-14.

## Acceptance

- Each change package must carry deterministic validation and a rollback plan, in the shape its
  protocol mandates.
- **Ship every artefact your validation cites.** If a step invokes a policy/rule file (OPA, Conftest,
  a tflint config, a test fixture), the package must include that file's complete, runnable contents.
  Citing a check you did not ship is unrunnable, so it is not validation.
- **Apply is out-of-band and human-gated in both domains.**
- The **program integration reviewer (Node C)** verifies, from structured facts:
  1. the terraform policy's `aws:SourceIp` value **exactly equals** the aggregate the network leg
     derived (the chained value — not a guess, not a recomputation);
  2. that aggregate **covers all four** selected exporter `/32`s;
  2b. that aggregate is **MINIMAL** — its prefix length EQUALS the smallest prefix covering the four
     selected `/32`s. Recompute it from the four addresses themselves; do not take the stated prefix
     length on trust, and do not infer it from how many members there are. A looser prefix is a
     **REJECT** even when it covers no existing allocation — it authorizes unused addresses;
  3. that aggregate **covers no existing allocation** on either switch (no authorization widening) and
     is not `0.0.0.0/0`;
  4. **chaining coverage**: `predecessors === chainCapablePredecessors`, `degradedPredecessors === 0`,
     `notChained []` — i.e. the terraform leg received the network leg's **real** deliverable
     (`source: 'report.md'`), not a fallback and not nothing;
  5. **membership shape**: exactly four exporter `/32`s were selected, **two on each switch**, all four
     distinct fabric-wide, and all four inside the exporter pool.
- These checks are **properties, not hardcoded values** — they stay valid when the rig's scatter is
  re-randomized. That is deliberate: the round must not depend on a magic expected string.
- ⚠️ **The check numbers are FIXED. A new clause may not take one.** Checks 1, 2, 2b, 3, 4 and 5 are
  referenced by number from elsewhere. Renumbering, merging or substituting one silently deletes it.
  **Run 15 (2026-07-29) is the incident**: a new clause was added to the sibling file and Node C
  renumbered it into slot **2b** — the minimality check — which it then never performed, and a
  non-minimal prefix shipped. If a new requirement needs a number, it APPENDS (6, 7, …). Check 2b is
  minimality, permanently; check 5 is membership shape, permanently.
- ⚠️ **Expected values stated in this document are reference data, NOT evidence.** Where this file
  names a reason code, a stamp shape or an expected state, it describes the round's INTENT so a human
  can read the run. It is never an observation, and restating it is never a check. A tier must
  retrieve the real fact from the artifact that carries it.
