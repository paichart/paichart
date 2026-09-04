# Approach 2 — parallel program + shared interface contract (worked example)

Companion to `.claude/knowledge/pipelines/firewall-policy-use-case.md` §3 Approach 2. An end-to-end
partner-HTTPS policy across a **three-vendor** firewall path, modeled as a **program of parallel
pipelines** coordinated by a shared **interface contract**. Files here: `topology.json`,
`requirements.md`, `interface-contract.json` (the contract the Architect would compute).

> **ILLUSTRATIVE, not runnable as-is.** There is no live PAN-OS / Cisco-ASA / AWS read-only harvest
> service wired, and the pan-os / cisco-asa domain protocols are notional. This is a design
> worked-example. To make it runnable, see "Making it runnable" below.

## Why this is Approach 2 (not 1, not 3)

- **Not Approach 1** (single pipeline): the path spans **three vendors** and **three teams** with
  **three separate approvals**. One specialist chain can't harvest+design PAN-OS, an AWS SG, and ASA;
  and three teams each need their own gate. That forces a program.
- **Not Approach 3** (sequenced): there is **no NAT** on this path, so every hop matches the partner
  CIDR verbatim. Every interdependency is a **declarative constant** the Architect resolves up front
  into the contract — no downstream leg needs an upstream leg's *designed output*. So the legs run in
  **parallel**; the contract (not a DAG edge) is the coordination. (Add source NAT at the edge and it
  becomes Approach 3 — the `interface-contract.json` `addressing` note calls out exactly this pivot.)

## The DAG the Program Architect produces

```
Program Architect (reads topology.json + requirements.md)
        │  emits: plan + interface contract + the DAG below
        ▼
[ plan-approval gate ]  (mandatory, template-less APPROVAL, born IN_PROGRESS)
        │  human releases once
        ├───────────────┬───────────────┬───────────────┐
        ▼               ▼               ▼
[ edge gate ]     [ dmz gate ]     [ core gate ]        (per-team APPROVAL gates, v1.0.2)
  network-sec       cloud-plat        core-net
        ▼               ▼               ▼
[ edge-fw       [ dmz-sg          [ core-fw
  pipeline ]      pipeline ]        pipeline ]           (PARALLEL — no edges between them)
  network-prov    terraform-iac     network-prov
        └───────────────┴───────────────┘
                        │  all three carry the SAME interface contract in §6
                        ▼
         [ producer ] + [ Node C — program integration reviewer ]
                        │  each depends on all three pipelines
                        ▼
         PROGRAM SYNTHESIZE → programReleasable (deterministic AND) → human release
```

Key structural facts (all from the existing engine — see firewall-policy-use-case.md §6):
- The three pipeline legs are **siblings in one program stage**, each with `dependencyIds = [its team
  gate]` — **no edges between the legs** (that's what makes them parallel).
- The **interface contract** is passed as a sibling of `title` in each leg's `task.create`; it renders
  first as the BINDING §6 block; a leg missing it FAILS LOUD.
- Each leg internally is a normal domain pipeline: Harvest (read-only) → Design → Author → Review.

## What each pipeline does

| Leg | Domain protocol | Harvest (read-only) | Design (its slice of the contract) | Deliverable |
|---|---|---|---|---|
| **edge-fw** | network-provisioning (PAN-OS) | zones, security rules, log profiles | untrust→dmz permit for the flow + explicit deny + central-SIEM log | PAN-OS config diff |
| **dmz-sg** | terraform-iac | current `aws_security_group.dmz_app` rules | ingress 203.0.113.0/24 tcp/443, egress to 10.20.0.10/32, no 0.0.0.0/0 | HCL diff (PR) |
| **core-fw** | network-provisioning (ASA) | access-lists, zones, logging | dmz→inside permit for the flow + explicit deny + log | ASA config diff |

## What Node C (program integration reviewer) checks

Cross-pipeline conformance from **structured facts** (never re-parsing chained prose):
- Every leg implemented **exactly** its `interface-contract.consistency.perDeviceSlice` — the same
  5-tuple, no widening.
- **No asymmetric hole**: no leg added a broad return-path inbound rule; return is stateful.
- **Consistent logging + naming**: every hop uses `central-siem` and the `PARTNER-HTTPS-2026` tag.
- Coverage facts: `predecessors === chainCapablePredecessors`, `degradedPredecessors === 0`,
  `notChained` names no leg (every leg's real deliverable reached the reviewer).

Only if all hold does `programReleasable` compute true. A human converts that into the release decision;
the composed deliverable names the **apply order** (core-fw → dmz-sg → edge-fw).

## Making it runnable (the follow-up path)

1. Publish read-only harvest **descriptors** + stand up read-only MCP services for the two firewall
   vendors (PAN-OS, ASA), mirroring the ceos-lab / tf-readonly rigs. The AWS SG leg can reuse the
   existing terraform-readonly descriptor against a LocalStack SG fixture.
2. Add the **pan-os** and **cisco-asa** domain protocols + specialist role guidance — a use-case
   **config** exercise per `ADD-A-PIPELINE-HARNESS-AGENT.md`, coordinated by pipeline-harness-specialist,
   NOT an engine change.
3. Move the (now-runnable) artifacts to the public `program-artifacts/firewall-approach-2/` and run the
   program on the rigs → a VT doc + demo exhibit. (Approach 2's *coordination* is already proven by the
   meridian parallel-program demos; this adds the firewall-domain surface.)
