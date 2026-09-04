# Use case: end-to-end security policy across a path of firewalls

> **Status**: design + decision framework (2026-07-16); **Approach-3 LIVE-VALIDATED 2026-08-21/22**
> (five-round remediation campaign, R5 `programReleasable: true` — public record VT-18). All three
> worked artifact sets are built (`firewall-examples/approach-{1,2,3}-*/`); remaining follow-ups:
> examples graduation + the HOWTO fold (§7.1/7.2). The §3 Approach-3 "maturity caveat" below is
> HISTORICAL — the sequenced path is now the campaign-proven one.
> **Audience**: anyone deciding how to model a multi-device network-security change on the pAIchart
> pipeline/program stack. Read this BEFORE designing the topology artifact or the interface contract.

## 1. The problem

Configure a **consistent end-to-end security policy across a path of firewalls/routers that have
interdependencies** — e.g. permit a partner's HTTPS traffic to an internal app across every hop, deny
everything else, with consistent logging and **no asymmetric holes** (a flow permitted at one hop but
silently dropped or over-permitted at the next). The devices are interdependent: what one firewall
NATs, zones, or permits constrains what the next one must match.

Everything below produces **approved-but-unapplied change packages** (candidate config + validation +
rollback, per device). Apply is always out-of-band and human-gated — the platform is a planning /
synthesis engine, never an actuator.

### The anchor scenario (used by all three approaches, so they're comparable)

```
partner-internet ──▶ edge-FW ──▶ dmz-FW ──▶ core-FW ──▶ internal-app
```
Intent: *permit HTTPS from `partner-CIDR` to `internal-app:443`, deny all else, consistent logging, no
asymmetric holes.* The three approaches below are the SAME scenario modeled differently as you vary
vendor homogeneity, team/approval boundaries, and the KIND of interdependency.

## 2. The two coordination mechanisms (the whole design rests on these)

A **pipeline** decomposes one objective into 3–7 typed specialist tasks (Harvest → Design → Author →
Review), and each child's deliverable is auto-chained into the next via **§6 Pipeline Context**. That
is *intra-pipeline* coordination.

A **program** is a PIPELINE task whose children are pipelines. It coordinates its child pipelines by
**two** distinct mechanisms — knowing which one your interdependency needs is the core decision:

- **Declarative — the shared interface contract.** The Program Architect reads the topology + intent
  and computes a binding **interface contract**: the invariants EVERY pipeline must honor (the flow
  spec, zone/label naming, addressing, the logging standard). It is passed as a sibling of `title` in
  the child's `task.create` (protocol pov-program Step PLAN-SPAWN #4), stored as
  `inputContext.interfaceContract`, and rendered **first** in each child's §6 as a BINDING block. A
  pipeline child that reaches execution without its contract FAILS LOUD (`INTERFACE_CONTRACT_MISSING`).
  Use this when the interdependency is **knowable up front** (agreed constants).
- **Runtime — DAG edges + inter-pipeline chaining.** A child pipeline's `dependencyIds` can include
  **upstream sibling pipeline ids** (Step PLAN-SPAWN #4), and the context chainer's PIPELINE-predecessor
  branch (`lib/agents/harness/context-chainer.ts:208+`) chains an upstream pipeline's **actual
  deliverable (`report.md`)** into the downstream pipeline's §6 — the same "children populate the
  context of the one below," now BETWEEN pipelines. The settledness predicate (F18) makes the
  downstream wait until the upstream's deliverable is fully persisted, so it never chains a half-built
  design. Use this when a downstream device genuinely needs the upstream's **designed output**, not just
  an agreed constant.

A **program integration reviewer (Node C)** then checks cross-pipeline conformance from structured
coverage facts (`chainCapablePredecessors`, `degradedPredecessors`, per-predecessor `notChained`) — did
every device implement its slice, are there gaps.

## 3. The three approaches

### Approach 1 — single pipeline, multi-device (same vendor, one team)

All three firewalls are the same vendor (say PAN-OS), one network team owns the change. Model the WHOLE
path as ONE `network-provisioning`-style pipeline:

- **Harvest** — one read-only harvester reads all three devices' zones/rules/routes.
- **Design** — one designer holds all three devices in §6 at once and produces the consistent
  end-to-end rule set (the interdependency is resolved *inside the designer's context* — it sees the
  whole path).
- **Author** — the per-device config diff (a change package per firewall).
- **Review** — end-to-end consistency + blast-radius + rollback adequacy.

**Why single-pipeline:** same vendor = one specialist chain understands every device; one team = one
approval; the whole path is one coherent design a single designer can hold at once. No program-level
machinery needed. This is the shape the demos already proved (two cEOS switches configured in one
pipeline).

### Approach 2 — program, parallel pipelines + shared contract (multi-vendor / multi-team)

Now heterogeneous: edge = Palo Alto (network team), dmz = a cloud security group (cloud team,
`terraform-iac`), core = Cisco ASA (a third team). One pipeline per device/vendor/team, run in PARALLEL:

- The **Program Architect** computes the **interface contract** from the topology + intent — the
  end-to-end invariants: `{ flow: {src: partner-CIDR, dst: internal-app, dport: 443, action: permit},
  default: deny, zoneNaming: <standard>, logProfile: <standard> }`.
- Each pipeline (its own domain protocol via the title token, its own **per-team approval gate**)
  designs its device's slice against the contract.
- **Node C** verifies the slices cohere end-to-end: each device implements its half of the flow, the
  zone names line up, no asymmetric hole.

**Why a program:** different vendors need different specialist chains; different teams need separate
approval gates; the contract is the coordination. **This is the live-proven coordination path** (the
demos ran network + terraform pipelines in parallel against one contract with Node C conformance).

### Approach 3 — program, DAG-sequenced pipelines + inter-pipeline chaining (runtime interdependency)

The case where a downstream device's design **genuinely** depends on the upstream device's DESIGNED
output, not just an agreed constant. Canonical trigger: the **edge-FW designs a NAT** translating the
partner source into a pool — and the dmz-FW / core-FW must write rules matching the **post-NAT**
addresses, which do not exist until the edge design is done.

- DAG: `edge-pipeline → dmz-pipeline → core-pipeline` (each downstream pipeline's `dependencyIds`
  includes its upstream sibling pipeline + the gate).
- Each downstream pipeline **chains the upstream's `report.md`** into its §6 and designs against the
  ACTUAL upstream output (the real NAT pool / post-NAT addresses / chosen interface bindings). The
  settledness predicate holds it until the upstream deliverable is persisted.
- The interface contract still carries the invariants that ARE knowable up front (the flow intent, the
  logging standard); the DAG carries only the genuinely-runtime dependency.
- **Node C** still checks end-to-end conformance.

**Why sequenced:** the interdependency is runtime (post-NAT addresses), not resolvable into a static
contract constant. **Maturity caveat:** this path is fully built (the dependency edges, the
PIPELINE-predecessor chainer, and the settledness/coverage facts exist for exactly it) and
unit/mechanism-tested, but the demo wave exercised the *parallel* topology, not a sequenced
inter-pipeline chain end-to-end. Treat the first sequenced-dependency program as a validation round (§7).

## 4. Decision framework

Pick the approach from the axes that actually decide it:

| Axis | → Approach 1 (single pipeline) | → Approach 2 (parallel program) | → Approach 3 (sequenced program) |
|---|---|---|---|
| **Vendor homogeneity** | one vendor across the path | multiple vendors | multiple vendors |
| **Team / approval boundaries** | one team, one approval | multiple teams, per-team gates | multiple teams, per-team gates |
| **Kind of interdependency** | resolvable inside one designer's context | declarative — agreed constants (flow spec, naming) | **runtime** — downstream needs upstream's designed output (NAT pool, post-NAT addr) |
| **Device count vs the 8-pipeline cap** | any (all in one pipeline) | ≤ 8 pipelines (group devices if more — §5) | ≤ 8 pipelines |
| **Dependency shape** | n/a | any (parallel, no edges needed) | **acyclic** (a DAG — circular deps go in the contract, §5) |

Rules of thumb:
- **Start at Approach 1.** A few same-vendor devices, one team → one pipeline. Don't reach for a
  program until a real boundary (vendor, team, or a runtime dependency) forces it.
- **Approach 2 is the default program shape.** Reach for it when vendor/team boundaries split the work
  and the coordination is *declarative*.
- **Approach 3 only when the dependency is genuinely runtime.** If you can express the interdependency
  as a constant the Architect computes up front, prefer the contract (Approach 2) — it parallelizes and
  is proven. Sequencing costs wall-clock (each stage waits) and is the less-exercised path.

## 5. The caveats as worked sub-examples

- **Apply ordering ≠ design ordering.** The program *generates* change packages; it never applies them.
  Path-safe apply order (e.g. **configure the far/core firewall first to avoid locking yourself out**)
  is a property of the DELIVERABLE and the human apply step — the design can name the recommended order;
  applying stays out-of-band, human-gated.
- **The 8-pipeline cap** (pov-program Step PLAN-SPAWN #2) is a deliberate blast-radius/cost guard. A path
  of > 8 devices each as its own pipeline exceeds it → **group devices**: one pipeline per *segment* or
  per *vendor group*, each a multi-device pipeline (Approach 1's multi-device capability nested inside a
  program leg). A 12-firewall path might be 3 segment-pipelines of 4 devices each.
- **Circular interdependency → the contract, not a cycle.** A DAG is acyclic. If FW-A needs FW-B's
  output AND FW-B needs FW-A's (mutual), you cannot wire that as edges — fold the shared decision (e.g.
  a jointly-owned address block or a negotiated zone id) into the **interface contract** so the Architect
  resolves it up front, and both pipelines design against the agreed constant.
- **Granularity is a real choice, re-check it per scenario.** The same path can be one pipeline, three
  parallel pipelines, or three sequenced pipelines — the axes in §4 decide, not habit.

## 6. Where this rides on the existing engine (no new machinery needed for 1 & 2)

- Interface contract: pov-program protocol Step PLAN-SPAWN #4; `inputContext.interfaceContract`;
  `INTERFACE_CONTRACT_MISSING` structural loud-fail (VT-01).
- Inter-pipeline DAG edges + chaining: `dependencyIds` sibling-pipeline edges; chainer
  PIPELINE-predecessor branch (`context-chainer.ts:208+`); settledness predicate (F18, VT-06); coverage
  facts `chainCapablePredecessors`/`degradedPredecessors` (VT-05/VT-06).
- Node C cross-pipeline conformance; deterministic `programReleasable` gate (VT-04/VT-06); human release.
- Domain protocol per device via the title token (`network-provisioning` / `terraform-iac` /
  `kubernetes-gitops`). A new firewall-vendor domain (e.g. a PAN-OS or ASA read-only service + specialist
  roles) is a **use-case configuration exercise** (like the k8s/terraform use-cases), not an engine change.
- Public claim narrative + proofs: `github.com/paichart/paichart/tree/main/verification`.

## 7. Next steps to flesh this out

> **PLAN OF RECORD (2026-08-21)**: item 3 (Approach-3 live validation) runs FIRST in the next rig
> window, followed by the IGP-migration program run on the same warm rig — sequencing decision +
> rig-sizing memory verdict in `cline_docs/igp-migration-design-2026-08-21/PLAN-OF-RECORD.md`.

1. **Three worked artifact sets** — per approach: `topology.json` (path + zones + vendors),
   `requirements.md` (the anchor intent), and for 2 & 3 the resulting interface-contract JSON + the DAG.
   These live under `.claude/knowledge/pipelines/firewall-examples/<approach>/` as **illustrative design
   examples** (NOT `program-artifacts/`, and NOT the public repo) — because there is no live PAN-OS /
   ASA read-only service behind them, and the verification pack's honesty rule forbids publishing
   non-runnable configs as if runnable. **Graduation status (2026-08-23)**: the RUNNABLE Approach-3
   embodiment IS public — `program-artifacts/firewall-a3-partner-path{,-r2}/` (cEOS + LocalStack as
   the vendor-analogs, five live rounds, VT-18). The PAN-OS/ASA-flavored illustrative sets stay
   knowledge-base-only until a real firewall-vendor harvest service exists (§7.4 panel gate) — that
   remains the honest line, and it is a narrower residue than this item originally described. **DONE: all three** —
   `approach-1-single-pipeline-multidevice/` (one vendor/one team, single pipeline, no program machinery — the
   NAT-is-a-non-issue-in-one-context contrast), `approach-2-parallel-multivendor/` (3-vendor path, shared
   contract, parallel legs + Node C), `approach-3-sequenced-nat/` (Approach-2 path + edge SNAT → runtime
   dependency → DAG-sequenced legs + inter-pipeline chaining + the design-order≠apply-order gotcha). Each has a
   README explaining why it's THAT shape and what Node C (or the single reviewer) checks.
2. **HOWTO section** — fold into the pov-program HOWTO (already a tracked follow-up): "Use case:
   end-to-end firewall policy" with the three modelings + this decision guide.
3. **Validation round — Approach 3 — ✅ DONE 2026-08-21/22 (VT-18)**: five live rounds on the cEOS/tf rigs; R5 programReleasable:true; transitive chaining, settledness, containment taxonomy (all arms), gate composition and duplicate-halt choreography all live-proven. Remaining from this item: graduate the examples + HOWTO fold (items 1-2). Original text: run a sequenced-pipeline program on the
   cEOS/tf rigs so inter-pipeline chaining is proven end-to-end → a VT doc + a demo exhibit.
4. **Specialist design panel** at the point of designing a REAL firewall protocol/contract for a run: a
   firewall-security lens on policy semantics, boundary-contract on the interface-contract shape,
   pipeline-harness on the sequencing. (Not needed for the docs/examples; needed before a runnable
   firewall use-case ships.)
