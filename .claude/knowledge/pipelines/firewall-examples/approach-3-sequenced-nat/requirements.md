# Acme — Partner HTTPS Access Path with edge NAT (Approach 3: DAG-sequenced program, inter-pipeline chaining)

ILLUSTRATIVE worked example for `firewall-policy-use-case.md` §3 Approach 3. The **same** three-vendor
partner-HTTPS path as Approach 2, with **one** change: the edge firewall source-NATs the partner traffic
to a pool it chooses at design time. That single change makes a downstream match value **runtime**, which
forces DAG-sequencing + inter-pipeline chaining instead of parallel legs against a static contract.

## Program scope

Configure a consistent partner-HTTPS access policy across
`partner-internet → edge-fw (SNAT) → dmz-sg → core-fw → internal-app`:

- **Permit** TCP/443 from `203.0.113.0/24` (partner CIDR) to `10.20.0.10/32` (internal app), end to end.
- **Edge SNAT**: edge-fw translates the partner CIDR to a NAT pool it selects from free addresses on its
  dmz-facing interface (harvested live). Downstream hops match the **post-NAT** source, not the partner CIDR.
- **Deny** everything else (default-deny at every hop).
- **Consistent logging** to the central SIEM at every hop, including deny logging.
- **No asymmetric holes**, and **no wrong-stage match** (a downstream hop matching the pre-NAT partner CIDR
  would be a silent hole — its rule would never match real post-NAT traffic).

Three delivery domains, **SEQUENCED** (`edge → dmz → core`) because the interdependency is runtime:

1. **edge-fw** (Palo Alto, network-security) — perimeter rule + the SNAT; **its deliverable publishes the
   chosen pool**, which the downstream legs need.
2. **dmz-sg** (AWS SG, cloud-platform, Terraform) — ingress from the **post-NAT pool** (chained from edge-fw).
3. **core-fw** (Cisco ASA, core-network) — core rule matching the **post-NAT pool** (chained transitively).

## Why this is runtime, not declarative (the whole reason it's Approach 3)

The obvious question: *why not just put the NAT pool in the interface contract and run Approach 2 (parallel,
proven)?* Because the pool is **not agreeable up front** — it is chosen from whatever addresses are free on
the edge's dmz-facing interface **at design time**, discovered by the edge leg's harvest. It is an **output**
of the edge design, so no Architect can pin it as a constant. That is the litmus test for Approach 3: if the
interdependency can be a pre-agreed constant, fold it into the contract; only when it is a genuine design
**output** does it earn the DAG edge + chaining. (`firewall-policy-use-case.md` §4 "Kind of interdependency".)

## Design constraints — split across contract and DAG

**Knowable up front → interface contract** (every leg honors, loud-fail if absent):
- End-to-end **intent**: src `203.0.113.0/24` at ingress, dst `10.20.0.10/32`, tcp/443, permit.
- Default action: deny (+ deny logging) at every hop.
- Logging: central-SIEM, log at each hop. Naming: rule tag `PARTNER-HTTPS-2026`, NAT-pool tag `PARTNER-SNAT-2026`.

**Runtime → the DAG edge (inter-pipeline chaining), NOT the contract**:
- The **post-NAT source** each downstream hop matches — delivered by chaining the edge leg's `report.md`
  into the dmz leg's §6, then the dmz leg's into the core leg's §6. The settledness predicate (F18) holds
  each downstream leg until its upstream deliverable is fully persisted.

## Per-team approvals (drives the gate DAG)

Each domain has its own approver → a per-domain gate in addition to the mandatory plan-approval gate:
- edge-fw change → `network-security-lead`
- dmz-sg change → `cloud-platform-lead`
- core-fw change → `core-network-lead`

Because the legs are sequenced, a downstream leg waits on BOTH its gate AND its upstream sibling pipeline.

## Acceptance

- Each change package: deterministic validation + rollback. Apply out-of-band, human-gated. **Approved
  change packages only** — never applied changes.
- **Design order ≠ apply order.** The legs are DESIGNED edge-first (the pool must be chosen before downstream
  can match it), but the deliverable recommends applying **core-first** (`core-fw → dmz-sg → edge-fw` — the
  innermost hop provisioned first so the outer hop never opens before the inner hop is ready). Both are
  correct; conflating them is a classic Approach-3 error. Apply itself stays human.
- **Node C** verifies end-to-end conformance including the NAT seam: edge matches the pre-NAT source and
  publishes the pool; dmz and core match the **post-NAT** pool (not the partner CIDR); zone names and logging
  line up; no asymmetric hole and no wrong-stage match.

## Maturity note (read before running this for real)

This is the **less-exercised** path. The mechanism is fully built (DAG sibling-pipeline edges, the
context-chainer PIPELINE-predecessor branch, the settledness/coverage facts exist for exactly this), but the
demo wave exercised the **parallel** topology (Approach 2), not an end-to-end sequenced inter-pipeline chain.
Treat the first sequenced-dependency program as a **validation round** (`firewall-policy-use-case.md` §7.3):
confirm the chain fires (`source: 'report.md'` at each hop, `notChained []`), the settledness gate holds, and
Node C sees the real post-NAT pool — then write its VT doc + demo exhibit.
