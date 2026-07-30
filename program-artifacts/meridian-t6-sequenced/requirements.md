# Program Requirements
- POV: pAIchart Verified Delivery — Live Exhibits
- Phase: Network + Cloud sequenced change
- Iteration: T6.1 (multi-domain, multi-team, **SEQUENCED** — runtime interdependency) · 2026-07-23

> **Revision T6.1 (2026-07-28)**: adds the **consuming-leg containment-attribution** property
> (Pipeline 2 objective + Acceptance) so a downstream IaC leg's
> `derivationContainment: { checked: false }` is recognized as a *satisfied* state, not a blocking
> miss. Spec change only — see the **Enforcement note** in Acceptance for the paired protocol change
> required to make the program gate self-certify.

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

The team for this project (or pov) have been provisioned and are the following;
- Project Manager is Steve Terry steve.terry@paichart.com
- Network Engineer is Josh Allen josh.allen@paichart.com
- Cloud Engineer is Jacob Wilcox jacob.wilcox@paichart.com

- The **network change** requires its own approval before the network pipeline may run.
  Approver: **Josh Allen** (network engineering).
- The **cloud IaC change** requires its own approval before the terraform pipeline may run.
  Approver: **Jacob Wilcox** (cloud platform).
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
  - **Re-selection FIRST, escalation LAST.** If a candidate pair's minimal aggregate covers an existing
    allocation, that rules out *that pair* — not the pool. **Select a different pair and recompute.**
    Escalate ONLY after establishing that no clean pair exists **anywhere** in `10.99.0.0/24`, and name
    in the escalation which candidates you tested. "Impossible" concluded from a handful of candidates
    is a **defect, not an escalation** — it blocks the downstream cloud leg on a false premise.
  - **Where to look first**: an *aligned adjacent* free pair (`.4/.5`, `.6/.7`, `.8/.9`, `.16/.17`, …)
    summarizes to a `/31` spanning exactly those two addresses, so it can collide only if one of the two
    is itself allocated. In a sparsely-allocated pool such a pair almost always exists — test these
    before concluding anything.
  - ⚠️ **Known failure mode — boundary-straddling pairs.** `.1/.2` do NOT summarize to a `/31`: they
    straddle a `/31` boundary, so their minimal cover is `10.99.0.0/30` (`.0–.3`), which swallows a
    neighbouring allocation at `.3`. A `/31` covers an **aligned** pair only (`.0/.1`, `.2/.3`, `.4/.5`,
    …) — verify alignment by binary arithmetic, never by eyeballing adjacency. Runs 5 and 6 lost on this
    directly; run 12 compounded it by testing only pairs anchored at `.1` and declaring the pool too
    fragmented while `.4/.5` was free the whole time.
  - **Verify member-by-member** before publishing: every selected `/32` is inside your aggregate, and no
    harvested allocation is.
  - if no clean pair exists in the pool, **escalate** via `task.comment` rather than widening.
- Configure the new exporter loopbacks and advertise the **aggregate** into BGP (`network` statement
  for the aggregate; no redistribution).
- **The deliverable MUST publish, explicitly and prominently**: the **derived aggregate** (the value the
  cloud tier consumes) and the **selected per-switch `/32`s** (for audit), plus the reasoning for the
  choice. These are the chained inputs the downstream leg depends on.
- **This is the derivation of record.** Because this leg *emits* the derivation, it is the leg whose
  `derivationContainment` is machine-checked. The downstream leg does **not** re-derive; containment
  for the consumed value is discharged **here** and re-verified at the program tier by Node C (see
  Acceptance).
  ⚠️ **The machine check is a floor, not the bar.** It verifies membership and non-overlap; it does
  **not** relieve you of the minimality requirement above, and a clean mechanical result is not
  evidence your aggregate is correct. Run 15 (2026-07-29) shipped `10.99.0.8/30` for members `.8`/`.9`
  — mechanically clean, and a REJECT: the minimal cover is `/31`, so the policy authorized two
  addresses no exporter uses. Satisfy the requirements; do not target the checker.

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
- **Containment is NOT machine-verified in this leg — and that is correct.** This leg **re-emits the
  chained aggregate verbatim in a `## Derived Values` block** (as required above), so a derived block
  **is** present. What it lacks is a parseable `## Harvested Allocations` (CIDR) block, because it
  harvests Terraform state, not an address pool — there is no foreign-allocation set to test the
  derived value's containment against. Its leg-level `derivationContainment` therefore legitimately
  reads `{ checked: false, reason: "harvest-block-missing-or-unparseable" }`. This is an **expected,
  satisfied state** — not a defect and not a release blocker (see Acceptance → *Consuming-leg
  containment attribution*).
- **Do NOT fabricate a `## Harvested Allocations` block** (invent foreign allocations) to make the
  per-leg checker return `checked: true`: it would be a hollow check — this leg has no allocation pool
  of its own, and it is forbidden from recomputing the aggregate (Node C check 1). Containment for the
  value you consume is discharged upstream (Pipeline 1, machine-checked against the real pool) and
  re-verified at the program tier by Node C (checks 1, 2, 2b, 3).

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
  - **"Deterministic" means a reviewer can run it and compare, without judgement.** Every validation
    step is an **exact command** plus its **exact expected output** — the literal text or count you
    expect back. Prose such as "verify the loopback is up", "confirm BGP advertises the aggregate", or
    "check the policy is correct" is a **REJECTABLE defect**, not a validation step: two reviewers
    could disagree on whether it passed. Write `show ip interface brief | include Loopback14` and the
    exact line it must return, not "check the interface".
  - **Ship every artefact your validation cites.** If a step invokes a policy/rule file (OPA, Conftest,
    tflint config, a test fixture), the change package must **include that file's complete, runnable
    contents**. Citing a check you did not ship is unrunnable, so it is not validation. Run 10 was
    blocked for exactly this — naming OPA/Conftest checks without shipping the rule files. Run 13's
    network leg was blocked for the prose variant of the same defect.
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
- **Consuming-leg containment attribution (release property).** For a downstream *consuming* leg
  (`terraform-iac`), a `derivationContainment` of
  `{ checked: false, reason: "harvest-block-missing-or-unparseable" }` — i.e. a derived block **is**
  present but the leg's own harvest yields no parseable CIDR allocation set — is a **SATISFIED
  acceptance state, NOT a blocking miss** — provided **all** of the following hold:
  1. the upstream *deriving* leg (network provisioning) stamped
     `derivationContainment: { checked: true, violations: [] }` on the derivation it emitted;
  2. Node C checks 1, 2, 2b and 3 (above) pass on the chained aggregate — i.e. the consumed value's
     containment properties are re-verified at the program tier; and
  3. chaining coverage (Node C check 4) confirms the consuming leg received the **real** upstream
     deliverable (`source: 'report.md'`), not a fallback.

  **Rationale.** An IaC leg re-emits the chained aggregate but has **no allocation pool of its own to
  check it against**: it harvests state, not addresses, and it is *forbidden* from recomputing the
  aggregate. Its containment obligation is discharged upstream (P1, machine-checked against the real
  pool) and at the program tier (Node C). Treating its `harvest-block-missing-or-unparseable` as a
  defect **double-counts an obligation already met** and blocks a run that is, in fact, correct. A
  program run in this configuration is **RELEASABLE**.

  **Enforcement note (paired protocol change — this clause is spec-only).** `requirements.md` is read
  by the *agents*, not by the derivation-containment enrichment or the program-gate taxonomy, which are
  platform/protocol code. For the program gate to **self-certify** (`programReleasable: true`) rather
  than park, the protocol's containment taxonomy must be updated so that
  `reason: "harvest-block-missing-or-unparseable"` is **non-blocking for a consuming leg** when
  conditions (1)–(3) above hold **AND** the leg is downstream of a `checked: true` deriving sibling —
  the DAG-position guard that separates a legitimate consumer from a deriving leg whose CIDR harvest
  is genuinely broken (both stamp the same reason string). Note this must NOT be applied to
  `no-derived-values-block`, which is a *different* state (no derived block at all) and is the
  refusal/silent-drop fail-safe.
  The observed program-tier verdict this applies to: Node C APPROVED (0 blocking), program
  `qualityGate.outcome: needs-revision` / `programReleasable: false` driven **solely** by the
  terraform leg's `checked: false`.

  **Status: ENFORCEMENT SHIPPED (2026-07-29).** pov-program protocol v1.0.18 reclassifies
  `harvest-block-missing-or-unparseable` per the above, keyed on two platform facts — the reason
  string plus a new `derivationContainment.upstreamContainment.green` stamp (the enrichment's
  transcription of this leg's `report.md` predecessors' containment). Release in this configuration
  is therefore a machine-gated `programReleasable: true`, no longer a documented human decision.
