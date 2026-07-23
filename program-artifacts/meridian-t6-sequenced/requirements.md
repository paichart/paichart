# Program Requirements
- POV: pAIchart Verified Delivery — Live Exhibits
- Phase: Network + Cloud sequenced change
- Iteration: T6 (multi-domain, multi-team, **SEQUENCED** — runtime interdependency) · 2026-07-23

## Program scope

- Two delivery domains, executed **IN SEQUENCE** (a real cross-domain ordering dependency — contrast
  T3, which ran the same two domains in parallel because every constant was knowable up front):
  1. **Network provisioning** (UPSTREAM) on the 2-switch Arista cEOS trading fabric in `topology.json`.
  2. **Cloud IaC (Terraform)** (DOWNSTREAM) on the telemetry-archive tier (`telemetry-archive` node).
- The terraform pipeline **cannot be designed until the network pipeline's design exists** — see
  "Why this is sequenced" below.
- Kubernetes/GitOps is explicitly **out of scope**.

## Why this is sequenced (the design rationale — read before questioning the DAG)

The trading fabric will export telemetry from **new, dedicated per-switch exporter loopbacks**. The
archive bucket must authorize writes from **exactly** the fabric's exporter address range and nothing
wider.

That range is **not knowable up front**:

- The exporter pool (`10.99.0.0/24`) already carries **scattered, asymmetric allocations** on both
  switches. They are discoverable **only by harvesting the live devices**.
- The network design must therefore **select** a free `/32` per switch (unique fabric-wide — these are
  advertised `/32`s) and **derive** the smallest aggregate covering both.
- That derivation is a genuine design decision, not a lookup: a naive "lowest free on each switch"
  selection summarizes into an aggregate that **covers existing allocations**, which would authorize
  foreign sources — a widening the design must reject. The design must find a pair that summarizes
  cleanly.
- **The objective test**: the scatter is re-randomized on every rig rebuild, so the free set changes,
  so the clean pair changes, so **the derived aggregate changes per build**. A value that changes per
  build cannot be pinned in a static design artifact or agreed in an interface contract. The Program
  Architect reads only `topology.json` + this file and has **no device-state access** — it structurally
  cannot know the answer.

Hence: the aggregate rides a **DAG edge** (inter-pipeline chaining) from the network leg to the
terraform leg, **not** the interface contract.

## Approvals (multi-team — one gate per domain, plus the program plan gate)

- The **network change** requires its own approval before the network pipeline may run.
  Approver: **Steve Terry** (network engineering).
- The **cloud IaC change** requires its own approval before the terraform pipeline may run.
  Approver: **Steve Terry** (cloud platform).
- The terraform pipeline waits on **BOTH** its own gate **AND** the network pipeline (the DAG edge).

## Pipeline 1 objective — network provisioning (UPSTREAM)

- Harvest both switches **read-only** and determine the pool's existing allocations (visible in both
  interface state and BGP `network` statements). Service descriptor:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`
- **Select** one free `/32` per switch from `10.99.0.0/24` for a new telemetry-exporter loopback:
  - the address must be free **fabric-wide** (not allocated on either switch);
  - use a free `Loopback` interface on each switch.
- **Derive** the **smallest aggregate prefix covering both selected addresses** — the prefix length MUST
  equal the minimal covering prefix (two adjacent addresses summarize to a `/31`, NOT a `/30`; four to a
  `/30`, and so on). **Show the computation** in the deliverable: the two selected `/32`s, the common
  binary prefix, the resulting prefix length, and the address range the aggregate covers. A prefix
  looser than the minimum is a REJECTABLE defect even when it covers no existing allocation, because it
  authorizes addresses no exporter uses. Subject also to:
  - **the aggregate MUST NOT cover any address already allocated** to an existing loopback on either
    switch (it becomes the archive's write allowlist — covering a foreign address is an authorization
    widening);
  - if no clean pair exists in the pool, **escalate** via `task.comment` rather than widening.
- Configure the new exporter loopbacks and advertise the **aggregate** into BGP (`network` statement
  for the aggregate; no redistribution).
- **The deliverable MUST publish, explicitly and prominently**: the **derived aggregate** (the value the
  cloud tier consumes) and the **selected per-switch `/32`s** (for audit), plus the reasoning for the
  choice. These are the chained inputs the downstream leg depends on.

## Pipeline 2 objective — cloud IaC (Terraform, DOWNSTREAM)

- **Read the network leg's design from §6 Pipeline Context** — the upstream deliverable is auto-chained
  into your prompt. Do **not** attempt to guess or recompute the aggregate, and do not proceed if §6
  does not carry it: **escalate** via `task.comment` instead.
- State harvest is **read-only** via the workspace's read-only Terraform service (`state_list` +
  redacted `state_pull` only). Service descriptor:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json`
- On the telemetry-archive bucket (`aws_s3_bucket.app_logs`, bucket `acme-app-logs`, workspace **prod**):
  author an **`aws_s3_bucket_policy`** that restricts **`s3:PutObject`** to the fabric's exporter
  aggregate via an `aws:SourceIp` condition — the value being **exactly the aggregate the network leg
  derived**, verbatim.
  - **No `0.0.0.0/0`**, no broader prefix, no additional CIDRs.
- Emit a declarative **HCL diff as a PR** — never imperative CLI, never an applied change.
- `aws_s3_bucket.app_logs` and its policy are the **only** targets; any out-of-scope drift found in
  state must be flagged, never silently absorbed.

## Design constraints — split across the contract and the DAG

**Knowable up front → the interface contract** (every leg honors; loud-fail if absent):

- **ASNs**: exactly as in `topology.json` (ceos1 = 65001, ceos2 = 65002). Do not renumber.
- **Point-to-point link**: `10.0.12.0/30` stays as-is.
- **Exporter pool**: `10.99.0.0/24`; exporter addresses unique fabric-wide; `/32` loopbacks.
- **Terraform target**: `aws_s3_bucket.app_logs`, workspace `prod`; policy restricts `s3:PutObject`.
- **No-widening rule**: the authorized range must cover the exporters and nothing else.
- **Shared naming/tags (BOTH domains)**: every change entry tagged `meridian-t6-sequenced`; change
  window "lab — any time".

**Runtime → the DAG edge (inter-pipeline chaining), NOT the contract**:

- The **selected exporter `/32`s** and the **derived aggregate** — produced by the network design,
  chained into the terraform leg's §6, settled (F18) before that leg starts.

## Acceptance

- Each change package must include deterministic validation with expected outputs (network: exact
  `show` commands; terraform: expected `terraform validate`/`plan` count facts) and a rollback plan.
- **Apply is out-of-band and human-gated in both domains.** This program produces approved change
  packages only — never applied changes.
- The **program integration reviewer (Node C)** verifies, from structured facts:
  1. the terraform policy's `aws:SourceIp` value **exactly equals** the aggregate the network leg
     derived (the chained value — not a guess, not a recomputation);
  2. that aggregate **covers both** selected exporter `/32`s;
  2b. that aggregate is **MINIMAL** — its prefix length EQUALS the smallest prefix covering the two
     selected `/32`s (recompute it: adjacent pair ⇒ `/31`). A looser prefix (e.g. `/30` for an adjacent
     pair) is a **REJECT** even though it covers no existing allocation — it authorizes unused addresses.
     Verify against the computation the network leg was required to show; do not take the stated prefix
     length on trust;
  3. that aggregate **covers no existing allocation** on either switch (no authorization widening) and
     is not `0.0.0.0/0`;
  4. **chaining coverage**: `predecessors === chainCapablePredecessors`, `degradedPredecessors === 0`,
     `notChained []` — i.e. the terraform leg received the network leg's **real** deliverable
     (`source: 'report.md'`), not a fallback and not nothing.
- Note these checks are **properties, not hardcoded values** — they stay valid when the rig's scatter is
  re-randomized. That is deliberate: the round must not depend on a magic expected string.
