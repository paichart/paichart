# Program Requirements
- POV: Autonomous Delivery Step by Step
- Phase: (set per run — this variant serves all three demo phases)
- Iteration: T6.2-demo (presentation-naming variant of meridian-t6-sequenced T6.2; every property,
  objective and acceptance check is UNCHANGED — see the naming section below for the only additions)
  · 2026-08-17

> **Revision T6.2 (2026-07-30)** — corrections after auditing Run 15, which was a **FALSE PASS**
> (`programReleasable: true` while shipping a non-minimal aggregate). Four changes, three of them
> repairing damage this document caused:
> 1. Pipeline 1 no longer publishes the checker's pass condition — it was a measurable bar *weaker* than
>    the minimality requirement beside it, and the leg met it while violating the requirement.
> 2. Acceptance: check numbers are FIXED and a new clause may not take one (T6.1's clause was renumbered
>    into slot 2b, deleting the minimality check, which is how the `/30` shipped).
> 3. Acceptance: expected values in this file are reference data, never evidence — a tier restating one
>    is not a check (Node C asserted a field that was absent from the artifact).
> 4. The enforcement status was an overclaim and is corrected; the consuming-leg exception has never
>    fired.
>
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

## Presentation naming (demo variant — naming ONLY, changes no requirement)

This program is run for a guided customer demonstration. The Program Architect MUST use these
exact titles in the plan's DAG (the tokens are load-bearing — copy them exactly):

- Network pipeline child title:
  `Network Fabric Change — exporter loopbacks and minimal aggregate (protocol: network-provisioning)`
- Terraform pipeline child title:
  `Cloud Storage Policy — restrict archive writes to the fabric (protocol: terraform-iac)`
- Program plan gate title: `Approve the program plan`
- Network approval gate title: `Network change approval` (assignee: Josh Allen)
- Cloud approval gate title: `Cloud change approval` (assignee: Jacob Wilcox)

Nothing else in this document is altered by this section: the objectives, the sequencing
rationale, the design constraints and every numbered acceptance check apply verbatim. This
section adds no numbered item and takes no check number.

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
  reads `checked: false`. This is an **expected, satisfied state** — not a defect and not a release
  blocker (see Acceptance → *Consuming-leg containment attribution*).
  **Which `reason` accompanies it varies by run, and BOTH are legitimate for this leg** (observed
  directly): `harvest-block-missing-or-unparseable` when the Author emitted the `## Derived Values`
  block restating the chained aggregate (Run 14), and `no-derived-values-block` when it did not
  (Run 15). Same protocol, same objective, different run. Do not treat either string as the expected
  one, and do not adjust your output to produce a particular reason code — the reason is a
  consequence of what you legitimately emit, never a target.
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
- **Shared naming/tags (BOTH domains)**: every change entry tagged `meridian-t6-demo`; change
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
- ⚠️ **The check numbers above are FIXED. A new clause may not take one.** Checks 1, 2, 2b, 3 and 4 are
  referenced by number from elsewhere in this document and from the protocol; renumbering, merging, or
  substituting one silently deletes it. **Run 15 (2026-07-29) is the incident**: the T6.1 consuming-leg
  clause was added to this file, and Node C renumbered it into slot **2b** — the minimality check — which
  it then never performed. A non-minimal `/30` shipped as a result. If a new requirement needs a number,
  it APPENDS (5, 6, …). Check 2b is minimality, permanently.
- ⚠️ **Expected values stated in this document are reference data, NOT evidence.** Where this file names
  a reason code, a stamp shape, or an expected state, it is describing the round's INTENT so a human can
  read the run — it is never an observation, and restating it is never a check. A tier must retrieve the
  actual value and construct its own finding. **Run 15 is the incident here too**: Node C asserted
  `upstreamContainment.green:true` — quoting this file's expected state — for a field that was **absent
  from the artifact entirely**. "The requirements say this is expected" is not a passing check at any
  tier.
- ⚠️ **Better still: do not name the measure at all where the requirement can be stated as a property.**
  Declaring a stamp shape "reference data" limits the damage; omitting it removes the temptation. Every
  agent reads this file, so a machine pass condition written here — `violations: []`, a `checked: true`,
  a named violation class — is a **target an agent can aim at instead of the requirement**, and hitting
  the target while missing the requirement is the whole failure mode (Run 15). State what must be TRUE;
  let the platform own the string that reports it. *(Applied 2026-08-02: the consuming-leg clause below
  previously named the producer's pass shape and a violation class; both removed.)*
  **One naming is retained deliberately** — the consuming leg's own
  `{ checked: false, reason: "harvest-block-missing-or-unparseable" }` — because that state is the
  *subject* of the clause and cannot be identified without it. It is a state a leg legitimately lands
  in, never a bar to clear: manufacturing it by fabricating a harvest block is explicitly a hollow
  check (see the `checked: true` warning above and the paired protocol clause).
- **Consuming-leg containment attribution (release property).** For a downstream *consuming* leg
  (`terraform-iac`), a `derivationContainment` of
  `{ checked: false, reason: "harvest-block-missing-or-unparseable" }` — i.e. a derived block **is**
  present but the leg's own harvest yields no parseable CIDR allocation set — is a **SATISFIED
  acceptance state, NOT a blocking miss** — provided **all** of the following hold:
  1. the upstream *deriving* leg (network provisioning) had the derivation it emitted **checked
     mechanically against the real allocation pool, with no defect recorded**. Since 2026-07-30 that
     same check also covers MINIMALITY, so a loose aggregate upstream denies the consumer's benign
     state automatically: the consumer path is protected by the same arithmetic as the producer and no
     longer depends on Node C's check 2b surviving. ⚠️ **The checker's pass shape and its reason codes
     are deliberately NOT reproduced here** — this clause states what must be TRUE, never the string
     that reports it. A pass shape written down is a target an agent can aim at *instead of* the
     requirement;
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

  **Status (corrected 2026-07-30): SHIPPED BUT NEVER YET EXERCISED — do not read this as "working".**
  pov-program v1.0.18 reclassifies `harvest-block-missing-or-unparseable` per the above, keyed on two
  platform facts: the reason string plus a `derivationContainment.upstreamContainment.green` stamp
  (the enrichment's transcription of this leg's `report.md` predecessors' containment). An earlier
  version of this note claimed release here was "therefore a machine-gated `programReleasable: true`".
  That was an overclaim. What is actually true:

  - **The exception has never once fired.** Run 14 blocked (pre-change). Run 15 carried **no**
    `upstreamContainment` at all — the stamp's upstream lookup matched the wrong artifact name and
    silently resolved nothing (fixed 2026-07-30: the predecessor's containment is now carried on the
    chaining edge, so the lookup no longer exists to get wrong).
  - **It covers only one of the two reason strings the Author produces.** Run 14's consuming leg emitted
    a `## Derived Values` block (⇒ `harvest-block-missing-or-unparseable`); Run 15's did not
    (⇒ `no-derived-values-block`, which the exception cannot match). Same protocol, same objective,
    different run. So whether the mechanical path is even reachable on a given run currently depends on
    non-deterministic Author behaviour.
  - **Run 15's `programReleasable: true` is NOT evidence this works.** It cleared via the gate's
    judgement branch, against this protocol's own stated example, while also shipping a non-minimal
    aggregate (see Pipeline 1). It must not be cited as a green sequenced run.

  **Update (2026-08-17): the machine-gated path has now been OBSERVED, green, on a live run** —
  a consuming terraform leg carried the chained aggregate verbatim in `consumedValues`, stamped
  `upstreamContainment.green: true`, its disposition classified **benign** (`checked-clean`), and
  the program released `programReleasable: true` with no human-judgement branch. Precision about
  WHICH mechanism: the v1.0.18 exception keyed on the literal
  `harvest-block-missing-or-unparseable` reason string never itself fired — the successor
  **containment-disposition taxonomy** (mechanised 2026-08-03, kind-aware since 2026-08-02)
  classifies the consuming-leg state benign directly, which supersedes the string-keyed exception.
  The concern this status note guarded — a correct consuming-leg run parked, or released only by
  judgement — is resolved by that mechanism. The paragraph above is retained as the historical
  record of why the machinery exists.
  Full record: `copov15 cline_docs/follow-ups/derivation-applicable-structural-gate-2026-07-30.md`
  and `copov15 cline_docs/reviews/demo-pov-design-2026-08-17/PHASE1-EXPECTATIONS.md`.
