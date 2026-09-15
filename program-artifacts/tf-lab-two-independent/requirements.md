# Program Requirements

**Use case**: two independent exporter aggregates — telemetry archive authorization.
**Fabric**: 2-node Arista cEOS (`ceos1`, `ceos2`), eBGP 65001 ⇆ 65002 over `10.0.12.0/30`.
**Cloud tier**: `aws_s3_bucket.app_logs` (workspace `prod`), LocalStack rig.
**Siblings**: `tf-lab-two-member` (one aggregate, two members) and `tf-lab-four-member` (one
aggregate, four members). This variant keeps four exporters but splits them into **two classes with
two aggregates**, and that split is the whole point.

## Program scope

Stand up two classes of telemetry exporter on the fabric — a **telemetry** class and a **metrics**
class, one exporter per class per switch — advertise the range each class occupies, then authorize the
cloud archive for **both** ranges.

The program produces **approved change packages only**. Nothing is applied. Apply is out-of-band and
human-gated in both domains.

## Why two aggregates (the design rationale — read before questioning the shape)

The sibling variants derive ONE aggregate, and the risk there is a prefix that is too wide. Two
aggregates add a failure the single-aggregate cases cannot express: **merging them**.

A single prefix covering both classes is shorter, tidier, and easier to write into a policy. It is
also wrong. Any prefix containing both classes necessarily contains every address between them —
addresses the fabric did not select and the archive must not authorize. That remains true even when
the merged prefix happens to swallow no existing allocation: unselected is unselected.

The two classes are **operationally independent**. They are separate export paths carrying different
data to the same archive. No requirement exists that one class's range contain or adjoin the other's,
and none should be invented to make the policy tidier.

## Why this is sequenced (not parallel)

Both aggregates are **runtime values**, selected from what is actually free on the live devices at
harvest time; the pool's existing allocations are re-randomized whenever the rig is rebuilt. A value
that changes per build cannot be agreed up front in an interface contract, and the Program Architect
has no device-state access. So the cloud leg cannot be designed until the network design exists. The
DAG is `network-provisioning → terraform-iac`.

Both classes are selected by the **same** network leg. They are independent of each other but they
draw from one pool on one pair of devices, so selecting them in one place is what makes fabric-wide
uniqueness checkable. Splitting them across concurrent legs would race on the same pool.

## Approvals (multi-team — one gate per domain, plus the program plan gate)

| gate | approves | approver |
|---|---|---|
| program plan | the plan and interface contract, before any leg runs | Steve Terry |
| network change | the METHOD: harvest, select two classes of two, derive an aggregate per class, advertise | Josh Allen (network engineering) |
| cloud IaC change | the PRODUCED aggregates — both concrete values, not intent-to-proceed | Jacob Wilcox (cloud platform) |

## Pipeline 1 objective — network provisioning (UPSTREAM)

Harvest both switches read-only (interface state **and** BGP network statements — existing exporter
allocations appear in both). Select **four** free `/32`s from the exporter pool, fabric-wide unique,
arranged as **two classes of two**: telemetry (one per switch) and metrics (one per switch). Derive
**one aggregate per class** — each the smallest prefix covering that class's own two members.
Configure the loopbacks and advertise. Publish both aggregates, the four selected `/32`s, each
address's class membership, and the computation that produced each aggregate.

ASNs are fixed (`ceos1` 65001, `ceos2` 65002). No renumbering. The `10.0.12.0/30` transit link is out
of scope.

## Pipeline 2 objective — cloud IaC (DOWNSTREAM)

Consume **both** derived aggregates verbatim from chained §6 Pipeline Context — never recompute,
never guess, never merge, and escalate rather than proceed if either is absent. Read-only Terraform
state harvest of `aws_s3_bucket.app_logs` in workspace `prod`. Author an `aws_s3_bucket_policy`
restricting `s3:PutObject` to those ranges, as a PR diff. Never applied.

The policy must authorize the two ranges **as two values**. Replacing them with one covering prefix is
a rejectable defect even if every selected address still falls inside it.

## Design constraints

- The exporter pool is `10.99.0.0/24`. Existing allocations are **not listed here** — they are
  discoverable only by harvesting the devices.
- Exporter addresses are advertised `/32`s; an address duplicated anywhere across either class is a
  real BGP conflict.
- No widening: the authorized ranges must not cover an address the fabric did not select.
- Validation shape is governed by **your active protocol**, not by this file. Follow the protocol's
  rule for what a validation step must carry, including its provisions for output that has not been
  witnessed. This file does not restate that rule — an artifact restating a protocol clause in weaker
  or absolute terms creates a contradiction the reading agent must silently resolve.

## Acceptance

- Each change package must carry deterministic validation and a rollback plan, in the shape its
  protocol mandates.
- **Ship every artefact your validation cites.** A step invoking a policy/rule file must include that
  file's complete, runnable contents; citing a check you did not ship is not validation.
- **Apply is out-of-band and human-gated in both domains.**
- The **program integration reviewer (Node C)** verifies, from structured facts:
  1. the terraform policy's authorized values **exactly equal** the aggregates the network leg
     derived — **both of them**, each matching verbatim (not a guess, not a recomputation);
  2. each aggregate **covers both** of its own class's `/32`s;
  2b. each aggregate is **MINIMAL** — its prefix length EQUALS the smallest prefix covering that
     class's two members. Recompute each from its own members; do not take a stated prefix length on
     trust. A looser prefix is a **REJECT** even when it covers no existing allocation;
  3. neither aggregate **covers any existing allocation** on either switch, and neither is `0.0.0.0/0`;
  4. **chaining coverage**: `predecessors === chainCapablePredecessors`, `degradedPredecessors === 0`,
     `notChained []` — the terraform leg received the network leg's **real** deliverable
     (`source: 'report.md'`), not a fallback and not nothing;
  5. **membership shape**: exactly four exporter `/32`s, two per class, one of each class per switch,
     all four distinct fabric-wide and inside the pool;
  6. **NOT MERGED**: the policy authorizes the two aggregates as **two distinct values**. A single
     prefix covering both classes is a REJECT — it authorizes every address between them, which the
     fabric did not select. This holds even if the merged prefix covers no existing allocation.
- These checks are **properties, not hardcoded values** — they stay valid when the rig's scatter is
  re-randomized. The round must not depend on a magic expected string.
- ⚠️ **The check numbers are FIXED. A new clause may not take one.** Checks 1, 2, 2b, 3, 4, 5 and 6
  are referenced by number from elsewhere. Renumbering, merging or substituting one silently deletes
  it. **Run 15 (2026-07-29) is the incident**: a new clause was added to a sibling file and Node C
  renumbered it into slot **2b** — minimality — which it then never performed, and a non-minimal
  prefix shipped. If a new requirement needs a number, it APPENDS (7, 8, …). Check 2b is minimality,
  permanently; 5 is membership shape; 6 is non-merger.
- ⚠️ **Expected values stated in this document are reference data, NOT evidence.** Where this file
  names a reason code, a stamp shape or an expected state, it describes the round's INTENT so a human
  can read the run. It is never an observation, and restating it is never a check.
