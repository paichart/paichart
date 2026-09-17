# Authorise the telemetry export path across the fabric, the cluster, the cloud and the monitoring

One range, derived once from live devices, consumed by three independently-authored change packages
in three configuration languages. Read this before questioning the shape: everything here is
deliberate.

## What must happen

The fabric exports telemetry from a pool of loopback addresses. Today those addresses are advertised
individually. Four changes follow from one fact about them:

1. **Fabric** — advertise the smallest single range that covers the whole pool, in place of the
   individual host routes.
2. **Cluster** — permit telemetry into the trading namespace's workload from that range and nothing
   wider.
3. **Cloud** — permit writes to the archive bucket from that range and nothing wider.
4. **Observability** — alert when telemetry from that range stops arriving or is refused.

The range is not written in this document and must not be. It is derived from what the harvest finds.

## Why this is a program and not one pipeline

Four domains, four different configuration languages, four different approvers. No single reviewer is
competent to gate all four: the engineer who can judge a routing policy is not the person who should
sign off an IAM condition. The program exists so each change is reviewed by the right person while
the value that ties them together is checked mechanically rather than by trust.

## Why this is PARALLEL and not sequenced — the design rationale

The three downstream legs do not depend on one another. Sequencing them would assert an ordering the
change does not have, and a fabricated dependency is a defect in its own right — it would let a
failure in the cloud leg block two unrelated changes. They share exactly one input, and it comes
from upstream. The fabric leg runs first because it produces that input; the other three run
together because nothing separates them.

## Approvals — one gate per domain, plus the program plan gate

| gate | approves | approver |
|---|---|---|
| program plan | the plan and the interface contract, before any leg runs | Steve Terry |
| fabric change | the METHOD: which addresses count as the pool, and how the covering range is derived | Josh Allen |
| cluster change | the PRODUCED range as an ingress source — the concrete value, not intent-to-proceed | Sarah Chen |
| cloud change | the PRODUCED range as an IAM condition — the concrete value, not intent-to-proceed | Jacob Wilcox |
| observability change | the alert's scope and every number it carries | Priya Nair |

The three downstream gates approve a **value**, not a direction. An approver who has not seen the
concrete range has not approved this change.

## Pipeline 1 objective — fabric (UPSTREAM)

Harvest both devices. Enumerate every address in the telemetry exporter pool as actually configured
and actually advertised, on both devices. Derive the smallest single range that covers every one of
them. Author the change that advertises that range in place of the individual host routes.

- **The deliverable MUST publish, explicitly and prominently**: every harvested exporter address,
  the derived covering range, and the arithmetic connecting them — enough that a reader can redo the
  derivation without the device.
- **Minimality is the requirement.** The covering range must be the smallest that contains every
  harvested address. A larger range that happens to contain them is a defect, because it authorises
  addresses nobody observed.
- **The derivation is only valid for the harvest that produced it.** Say so in the package: if the
  pool changes, the range and all three downstream changes are stale together.
- ⚠️ **Existence assumption**: the addresses already exist and are already advertised individually.
  This change replaces how they are advertised. It does not create them.
- ⚠️ **Convention that is not observable**: the covering range must not extend beyond the pool's own
  parent range even if a larger one would still be minimal by arithmetic alone. Nothing in the
  harvest expresses this, so it is stated here or it does not exist.

## Pipelines 2, 3 and 4 — the three consumers

Each consumes the published range verbatim. None recomputes it, widens it, rounds it to a friendlier
boundary, or substitutes its own view of which addresses matter. A leg that cannot find the range in
its chained context escalates and stops — authoring against a guessed range is the failure this
program exists to make impossible.

### Pipeline 2 objective — cluster

Author a NetworkPolicy for the trading namespace that permits ingress to the running workload from
the derived range, and denies everything else not otherwise required for the namespace to function.

- ⚠️ **Existence assumption**: the namespace has NO NetworkPolicy today. CREATE is expected.
- State what the policy must still PERMIT for the workload to keep working, not only what it denies.
  A policy that is correct about the telemetry source and breaks name resolution is not correct.

### Pipeline 3 objective — cloud

Author the bucket policy for the archive that permits object writes only from the derived range.

- ⚠️ **Existence assumption**: the bucket exists; a bucket policy may not. CREATE of the policy is
  expected.
- The neighbouring resource's captured secret is never required for this change. It must not be read
  and must not appear anywhere in the package.

### Pipeline 4 objective — observability

Author the rule that alerts when telemetry from the derived range stops arriving or is being
refused, scoped to that range rather than to all sources.

- ⚠️ **Existence assumption**: no rule scoped to these sources exists today. CREATE is expected.
- **Every number the rule carries — the threshold, the evaluation window, the wait before firing —
  must be chosen against a harvested quantity and must carry the comparison that produced it**,
  including the alternatives considered and why they were rejected. A plausible number with no
  working is a defect here, not a style preference: the whole point of this leg is that somebody is
  woken up by it.
- The stack's own pipeline metrics are the observable quantities available to size against. Quote
  what you measured and where it came from.

## Design constraints

- The range crosses the program through the interface contract. It is not restated by hand in any
  leg's objective and must not be.
- Each leg names its own connection surface. No leg reaches another leg's rig.
- No leg applies anything. Every deliverable is an approved-but-unapplied change package.

## Acceptance

The program is complete when all four packages exist, each gate has been approved by its named
approver, and the same range appears — unmodified — in all four.

### Program integration reviewer (Node C) verifies, from structured facts

- The range the three consumers used is the range the producer published, in all three, with no
  transformation between them.
- Each consumer's authorisation is bounded by that range and extends no wider.
- Each package's validation steps are runnable as written, and every file they invoke is shipped.
- Where a leg could not verify something from its own position, it said so rather than asserting it.

⚠️ Values named anywhere in this document are reference data describing the round's intent so a human
can read the run. They are not observations. Restating one is not a check — retrieve the actual value
and construct your own finding.

## Validation shape

Every validation step is an exact command plus the exact output expected back. Prose like "confirm
the range is advertised" or "verify the policy is correct" is a rejectable defect, not a validation
step: two reviewers could disagree about whether it passed. Where a step invokes a policy file, a
rule file or a test fixture, the package ships that file's complete runnable contents — citing a
check you did not ship is unrunnable, so it is not validation.

Where a change's post-apply rendering genuinely cannot be witnessed before apply, state the
comparison to perform and what would constitute a pass, rather than inventing the literal text a
device or a tool would print.

## Connection surfaces

Each leg's task description must name its own descriptor URL; they are listed in `topology.json`
under `readOnlyServices`. A leg whose descriptor is missing is correct to refuse to invent one, and
will block before harvesting.
