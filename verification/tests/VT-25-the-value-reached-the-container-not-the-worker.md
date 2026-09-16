# VT-25 — a payload delivered to a container is not delivered to the thing inside it; the consumer refused, and was right

**Status**: VERIFIED 2026-09-16 (live, four rounds) | Re-verify trigger: any change to
`chainDependencyContext`'s injection arm or its early return; a change to the injection exclusion
list; a change to `render-pipeline-context`'s upstream-entry branch; or a change to
`deriveChainedContextSignal`'s early-out.
**Layer**: program (two pipeline-tier legs; the defect and the fix are platform-tier)
**Round type**: defect discovery across three runs, then functional acceptance on the fourth

**Date:** 2026-09-16. **POV:** Cheap-Rig Program Runs, phase *Cross-domain program: cluster pod range
to cloud archive*. Related: VT-24 (the same program, the round before — a self-reported correction
does not satisfy a gate), VT-15 (the cross-domain evidence contract), VT-21 (a fact delivered where
the judgement happens — the same lesson, a different payload).

## Objective

One claim, and it is a claim about **provenance rather than information**:

> An agent that holds the correct value, but has no way to verify where it came from, should refuse —
> and the platform should make it possible to stop refusing.

## What was found

A two-leg program: a Kubernetes leg harvests pod addresses and derives the smallest covering CIDR; a
Terraform leg must consume that CIDR **verbatim** and author an S3 bucket policy. The interface
contract's `consumptionRule` says: *consumed VERBATIM from chained §6 Pipeline Context — never
recomputed, never widened, never guessed; if absent, escalate.*

**The Terraform leg's Architect escalated.** Its own words:

> The task description **asserts** the value (`10.244.0.4/30`) … but a value stated in prose in the
> task description is not the same as a value delivered through the platform's chained-dependency
> mechanism — and I have no way to verify it is Pipeline 1's actual, current, unmodified published
> fact (not stale, not miscopied, not injected). I am halting rather than fabricate trust in an
> unverified figure.

**It was correct on every clause.** The value HAD arrived — at the **leg**. Measured:

| tier | held the upstream deliverable? |
|---|---|
| the cloud **leg** (the container) | **YES** — `chainedFrom`: 1 entry, 6,780 chars, untruncated, containing `"value": "10.244.0.4/30"` |
| the leg's **children** (the workers) | **NO** — each held only its own sibling |

The harness — itself an LLM — read the value from its own context and **paraphrased it into the child
task descriptions**. So the digits were right, and the channel was empty.

### The measurement

Across the whole production corpus:

```
PIPELINE→PIPELINE edges where the downstream executed    54 of 54 chained   (the LEG tier is healthy)
edges into a container that reached ANY child             3 of 51           (94% lossy)
```

Registered as **Bug Class 84 — Container-Tier Terminus**: *a payload delivered to a container is not
delivered to the thing inside it.* Second instance of the same boundary; the first was the interface
contract itself (7 of 7 lossy, fixed 2026-08-26). **That earlier fix is why this one was loud**: the
child now inherits a contract commanding it to read a channel that is structurally always empty at its
tier.

### Four programs had already released through this gap

`cmswogpbt…` (2026-08-17), `cmrq1nvs6…`, `cmt3tgp4d…`, `cmtc8uhor…` — all `programReleasable: true`.
In the first, the consuming children had **neither** the value **nor** the instruction to demand it
(they predate the contract-inheritance fix), so they proceeded. **The value they used was correct; the
run does not establish that it had to be.** That distinction is the whole subject of this round.

## The fix

The chainer now appends the owning leg's cross-pipeline entries to its non-PIPELINE children, stamped
`inheritedFromLeg`, rendered as `### Upstream Pipeline Deliverable` with a line stating it was
delivered to this task's pipeline and **not** produced by a predecessor of this task — and excluded
from the `N of M predecessor tasks` tally, because it is not one.

**Scoped by an EXCLUSION list, never an inclusion list.** An inclusion list fails closed: a new domain
adds a consuming role, nobody updates the list, delivery silently stops — this class recreated by its
own fix. Harvest-shaped roles are excluded on a distinct ground: a harvester's output is a
point-in-time snapshot and an upstream `report.md` carries allocations in exactly the shape of a
harvest table. One folded into `## Harvested Allocations` would produce machine-parsed ground truth
containing a value nobody observed, and every tier above would then check correctly against poisoned
data. The provenance stamp cannot defend against that — it answers *who produced this*, not *is this
still true*.

## Result — round 4, live

**Measured on the consuming child's own row, before the program finished:**

```
infra_change_architect   entries=2  inherited=1   ← cluster leg (injected) + own sibling
config_change_author     entries=2  inherited=1
infra_state_harvester    entries=0  inherited=0   ← EXCLUDED, correctly
change_reviewer          entries=1  inherited=0   ← excluded (for now, with a stated reason)
```

Four policy outcomes, all correct, on first execution.

**Outcome:**

```
program      programReleasable TRUE · approved/87 · confidence 88
cluster leg  approved/88 · derivationContainment checked-clean · 10.244.0.4/30
cloud leg    approved/87 · benign · consuming-leg-consumed-discharged
```

`consuming-leg-consumed-discharged` is the conjunct that had never fired on this program: the platform
verified the consuming leg actually consumed the upstream value and **discharged** the obligation.

| | round 1 | round 2 | round 3 | **round 4** |
|---|---|---|---|---|
| value reaches the consuming child | no | no | no | **YES** |
| cloud leg | approved (unverified) | approved (unverified) | **escalated/20** | **approved/87, discharged** |
| `programReleasable` | false | false | false | **TRUE** |

**Round 3 is the pivot, and it blocked.** The Architect refused a value it could not verify. That
refusal is what made round 4 possible, and preserving it was the unanimous recommendation of every
reviewer who examined the fix.

## What this round does NOT establish

Recorded in the run's own approval comments **before** the result was known:

- **The dep-free delivery path is not validated.** A child with no predecessor of its own — 52 of 198
  in production, every harvester — reaches the injection by a different code path. In this topology the
  two consuming children each hold a sibling edge, so *"first in line AND entitled to the value"* never
  occurs. Fixture-proven only.
- **The harvester exclusion's POSITIVE case is not validated** — only that an excluded harvester
  received nothing.
- **The included set is by default, not by argument.** The exclusion list decides who is excluded;
  roles outside it receive the injection with no case made for them individually.

## Method note

The defect was found by a run, not a review; the three drafts of its fix each contained a defect that
passed its own tests, and each was caught by someone *building* rather than reading. Three separate
counts in this investigation fell by an order of magnitude when the property was measured instead of
the word — 204→157→11→3 on one, 71→59 on another, 95→54 on a third, where a query against a
non-existent field path read as a platform-wide failure until a control showed the field was null for
**every** row including those known to have it.

**A field that is null for everything is a broken query, not a broken platform.**
