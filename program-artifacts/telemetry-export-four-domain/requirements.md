# Program Requirements

- POV: Multi-Domain Autonomous Delivery — Showcase
- Phase: 5 — One Objective, Four Domains
- Iteration: telemetry-export-four-domain · 2026-09-17

One range, derived once from live devices, consumed by three independently-authored change packages
in three configuration languages. Read this before questioning the shape: everything here is
deliberate.

## What must happen

The fabric exports telemetry from a pool of loopback addresses, advertised today as individual host
routes. Four changes follow from one fact about them:

1. **Fabric** — advertise the smallest single range covering the whole pool, in place of the
   individual host routes.
2. **Cluster** — permit telemetry into the trading namespace's workload from that range, nothing wider.
3. **Cloud** — permit writes to the archive bucket from that range, nothing wider.
4. **Observability** — alert when telemetry from that range stops arriving or is being refused.

The range is not written in this document and must not be. It is derived from what the harvest finds.

## Program scope

- 4 delivery domains. The fabric runs FIRST; the other three run **IN PARALLEL WITH EACH OTHER**:
  1. **Network provisioning** (UPSTREAM) on the two switches, described in `topology.json`.
  2. **Kubernetes GitOps** (DOWNSTREAM) on the `trading` namespace.
  3. **Terraform IaC** (DOWNSTREAM) on the `prod` workspace archive bucket.
  4. **Observability config** (DOWNSTREAM) on the metrics stack.
- Applying any change is explicitly **out of scope**. Every deliverable is an approved-but-unapplied
  change package.

## Why this is SEQUENCED — the design rationale, read before questioning the DAG

**The test that decides sequenced vs parallel, applied explicitly:**

> Is every value the downstream domains need knowable before the upstream domain runs?
> **No.** The covering range is a function of addresses that exist only in the two devices' running
> configurations. They are asymmetric between the devices and not contiguous. The Program Architect
> reads only `topology.json` and this file and has **no live state access**, so it structurally
> cannot know them, and no contract agreed up front could pin them.

⇒ **Sequenced.** The range must ride a **DAG edge** from the fabric leg into each consumer.

⚠️ **The three consumers are parallel WITH EACH OTHER, and that is a separate question from the one
above.** They share one input and depend on nothing else of each other's. Ordering them would assert
a dependency the change does not have, and a fabricated dependency is a defect in its own right — it
would let a failure in the cloud leg block two unrelated changes.

What would go wrong if someone guessed the range up front: a guess wide enough to be safe authorises
addresses nobody observed, in three systems at once, and every tier would check it as correct.

## Approvals — one gate per domain, plus the program plan gate

| gate | approves | approver |
|---|---|---|
| program plan | the plan and the interface contract, before any leg runs | Steve Terry |
| fabric change | the METHOD: which addresses count as the pool, and how the covering range is derived | Josh Allen |
| cluster change | the PRODUCED range as an ingress source — the concrete value, not intent-to-proceed | Chris Terry |
| cloud change | the PRODUCED range as an IAM condition — the concrete value, not intent-to-proceed | Jacob Wilcox |
| observability change | the alert's scope and every number it carries | Rika Smith |

**Team provisioned for this POV** — every approver named above must be a member of the POV team, or
the platform cannot route the gate to them and every gate falls to the POV owner instead:
- Steve Terry `steve.terry@paichart.com` · Josh Allen `josh.allen@paichart.com`
- Chris Terry `chris.terry@paichart.com` · Jacob Wilcox `jacob.wilcox@paichart.com`
- Rika Smith `rika@example.com`

Each downstream pipeline waits on **BOTH** its own gate **AND** the fabric pipeline (the DAG edge).
The three downstream gates approve a **value**, not a direction: an approver who has not seen the
concrete range has not approved this change.

## Pipeline 1 objective — network provisioning (UPSTREAM)

- Harvest both switches **read-only**. Service descriptor: the `fabricDescriptorUrl` in `topology.json`.
- Enumerate every address in the telemetry exporter pool as actually configured and actually
  advertised, on both devices.
- Derive the smallest single range covering every one of them, and author the change that advertises
  that range in place of the individual host routes.
- **The deliverable MUST publish, explicitly and prominently**: every harvested exporter address, the
  derived covering range, and the reasoning for the choice. These are the inputs all three downstream
  legs depend on.
- ⚠️ **Existence assumption**: the addresses already exist and are already advertised individually.
  This change replaces how they are advertised; it does not create them.
- ⚠️ **Convention that is not observable**: the covering range must not extend beyond the pool's own
  parent range, even where a larger range would still be minimal by arithmetic alone. Nothing in the
  harvest expresses this, so it is stated here or it does not exist for you.

### ⚠️ This leg DERIVES a value three downstream legs consume

Every line below is an incident.

- **Show the computation** in the deliverable: the inputs, the arithmetic, and the result's coverage.
- **Minimality.** The covering range must be the smallest that contains every harvested address. A
  result looser than the minimum is a **REJECTABLE defect even when it violates nothing else**,
  because it authorises more than the requirement needs — here, in three systems at once.
- **Re-selection FIRST, escalation LAST.** If a candidate fails, that rules out *that candidate*, not
  the whole pool. Select another and recompute. Escalate only after establishing that no valid option
  exists anywhere, and name which candidates you tested. *"Impossible" concluded from a handful of
  candidates is a defect, not an escalation* — it blocks three downstream legs on a false premise.
- ⚠️ **Verify by arithmetic, never by eyeballing.** Adjacent addresses do not necessarily summarise:
  a pair that straddles a boundary is not covered by the prefix length their adjacency suggests, and
  its true minimal cover is a wider prefix that swallows neighbours. A shorter prefix covers an
  **aligned** block only. Check alignment explicitly; do not infer it from how the addresses look.
- **Verify member-by-member** before publishing: every harvested address is inside the derived range,
  and nothing foreign is.
- 🔴 **The machine check is a FLOOR, not the bar.** A clean mechanical result is **not** evidence your
  derivation is correct — the checker verifies containment, not that you met the requirement.
  **Satisfy the requirements; do not target the checker.**

## Pipelines 2, 3 and 4 — the three consumers

Each consumes the published range **as chained**. None re-derives it, and each is **forbidden from
recomputing it** — containment for that value is discharged **upstream** and re-verified at the
program tier. No consumer widens it, rounds it to a friendlier boundary, or substitutes its own view
of which addresses matter. A leg that cannot find the range in its chained context escalates and
stops: authoring against a guessed range is the failure this program exists to make impossible.

### Pipeline 2 objective — Kubernetes GitOps

- Harvest the namespace **read-only**. Service descriptor: the `clusterDescriptorUrl` in `topology.json`.
- Author a NetworkPolicy permitting ingress to the running workload from the chained range, denying
  everything else not otherwise required for the namespace to function.
- ⚠️ **Existence assumption**: the namespace has NO NetworkPolicy today. CREATE is expected.
- State what the policy must still PERMIT for the workload to keep working, not only what it denies.
  A policy correct about the telemetry source that breaks name resolution is not correct.

### Pipeline 3 objective — Terraform IaC

- Harvest the workspace **read-only**. Service descriptor: the `cloudDescriptorUrl` in `topology.json`.
- Author the bucket policy permitting object writes only from the chained range.
- ⚠️ **Existence assumption**: the bucket exists; a bucket POLICY may not. CREATE of the policy is
  expected.
- The neighbouring resource's captured secret is never required here. It must not be read and must
  not appear anywhere in the package.

### Pipeline 4 objective — observability config

- Harvest the stack **read-only**. Service descriptor: the `observabilityDescriptorUrl` in `topology.json`.
- Author the rule alerting when telemetry from the chained range stops arriving or is being refused,
  scoped to that range rather than to all sources.
- ⚠️ **Existence assumption**: no rule scoped to these sources exists today. CREATE is expected.
- **Every number the rule carries — threshold, evaluation window, wait-before-firing — must be chosen
  against a harvested quantity and must carry the comparison that produced it**, including the
  alternatives considered and why they were rejected. A plausible number with no working is a defect
  here, not a style preference: the point of this leg is that somebody is woken up by it.

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (knowable up front, agreed before any leg runs):
- The namespace, the bucket's Terraform address and workspace, and the exporter pool's parent range,
  as given in `topology.json`.

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- The covering range — produced by the fabric leg, chained into each consumer's §6, settled before
  that consumer starts.

## Acceptance

- Each change package must include deterministic validation with expected outputs (per *Writing
  rules* #1 and #2) and a rollback plan.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.
- The program is complete when all four packages exist, each gate has been approved by its named
  approver, and the same range appears unmodified in all three consumers.

### Program integration reviewer (Node C) verifies, from structured facts:

1. the range each consumer used exactly equals what the fabric leg produced — the chained value, not
   a guess, not a recomputation, in all three consumers;
2. every harvested exporter address is covered by that range, and nothing foreign is;
2b. the range is the tightest correct cover — **recompute it; do not take the stated value on trust**;
3. no consumer's authorisation extends wider than that range, in any of the three languages;
4. **chaining coverage**: the downstream legs received the fabric leg's **real** deliverable, not a
   fallback and not nothing.

- 🔴 ⚠️ **THE CHECK NUMBERS ABOVE ARE FIXED. A NEW CLAUSE MAY NOT TAKE ONE.** They are referenced by
  number from elsewhere in this document and from the protocol; renumbering, merging or substituting
  one **silently deletes it**. If a new requirement needs a number, it **APPENDS** (5, 6, …).
- These checks are **properties, not hardcoded values** — they stay valid when the rig is rebuilt.
- ⚠️ **Require evidence where its READER looks.** The integration reviewer's chained context is the
  LEG deliverables; a statement made only at program level is invisible to a check that reads legs.
  Each leg's own report must carry what the checks above need from it.

⚠️ Values named anywhere in this document are reference data describing the round's intent so a human
can read the run. They are not observations. Restating one is not a check — retrieve the actual value
and construct your own finding.

### Consuming-leg attribution — when a downstream leg legitimately cannot self-check

All three consumers are in this position: none can verify the range against its own state, because
none of them can see the fabric. A consumer's use of the range is therefore satisfied when the fabric
leg's derivation was machine-checked with no defect, the program-tier checks above pass on the chained
value, and chaining coverage confirms the real deliverable was received.

⚠️ **SHIPPED BUT NEVER YET EXERCISED AT THIS FAN-OUT — do not read this as working.** One derived
value has crossed to one consumer before. Three consumers of one value, in three domains, has not
run. Evidence that it works would be: all three consumers carrying the identical range, each
leg-scoped check passing on its own leg, and the program tier recomputing the cover independently and
agreeing.

## Validation shape

Every validation step is an exact command plus the exact output expected back. Prose like "confirm
the range is advertised" or "verify the policy is correct" is a rejectable defect, not a validation
step: two reviewers could disagree about whether it passed. Where a step invokes a policy file, a
rule file or a test fixture, the package ships that file's complete runnable contents — citing a
check you did not ship is unrunnable, so it is not validation.

Where a change's post-apply rendering genuinely cannot be witnessed before apply, state the
comparison to perform and what would constitute a pass, rather than inventing the literal text a
device or tool would print.

## Connection surfaces

Each leg's task description must name its own descriptor URL; they are listed in `topology.json`
under `readOnlyServices`. A leg whose descriptor is missing is correct to refuse to invent one, and
will block before harvesting.
