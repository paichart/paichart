# Approach 3 — DAG-sequenced program + inter-pipeline chaining (worked example)

Companion to `.claude/knowledge/pipelines/firewall-policy-use-case.md` §3 Approach 3. The **same**
three-vendor partner-HTTPS path as Approach 2, with **one** change — the edge firewall source-NATs the
partner traffic to a pool it chooses at design time — which turns a declarative constant into a **runtime**
dependency and forces the legs to run **sequenced** (`edge → dmz → core`) with inter-pipeline chaining
instead of parallel against a static contract. Files here: `topology.json`, `requirements.md`,
`interface-contract.json`.

> **ILLUSTRATIVE, not runnable as-is.** No live PAN-OS / Cisco-ASA / AWS read-only harvest service is wired,
> and the pan-os / cisco-asa domain protocols are notional. This is a design worked-example. It is also the
> **less-exercised** path (see "Maturity" below).

## Why this is Approach 3 (not 2, not 1)

- **Not Approach 1** (single pipeline): three vendors, three teams, three approvals — one specialist chain
  can't harvest+design PAN-OS, an AWS SG, and ASA, and each team needs its own gate. Forces a program.
- **Not Approach 2** (parallel + contract): the edge SNAT means dmz-sg and core-fw must match the **post-NAT
  source** — a value that does not exist until the edge design picks a pool from **live edge state**. It is an
  **output** of the edge design, so it cannot be a contract constant. That genuine runtime dependency is what
  earns the DAG edge + chaining. (Litmus test: if the interdependency can be pre-agreed → Approach 2; only a
  design *output* → Approach 3.)

The delta from Approach 2 is exactly one node property (`edge-fw.sourceNat`) — a deliberate teaching point:
**the shape is a property of the interdependency, not the domain.** Same path, one NAT, parallel → sequenced.

## The DAG the Program Architect produces

```
Program Architect (reads topology.json + requirements.md)
        │  emits: plan + interface contract (intent only) + the SEQUENCED DAG below
        ▼
[ plan-approval gate ]  (mandatory, template-less APPROVAL, born IN_PROGRESS)
        │  human releases once
        ▼
[ edge gate ] ─▶ [ edge-fw pipeline ]        network-provisioning (PAN-OS) — designs SNAT, PUBLISHES the pool
                        │  report.md (chosen pool) chained ▼   (settledness F18 holds until persisted)
[ dmz gate ] ──▶ [ dmz-sg pipeline ]          terraform-iac — ingress from the POST-NAT pool
                        │  report.md chained ▼
[ core gate ] ─▶ [ core-fw pipeline ]         network-provisioning (ASA) — matches the POST-NAT pool
                        └───────────────┐
                                        ▼
                         [ producer ] + [ Node C — program integration reviewer ]
                                        │  each depends on all three pipelines
                                        ▼
                         PROGRAM SYNTHESIZE → programReleasable (deterministic AND) → human release
```

Key structural facts (all from the existing engine — see firewall-policy-use-case.md §6):
- Each downstream leg's `dependencyIds = [its team gate, the immediate upstream sibling pipeline]` — the
  sibling-pipeline edge is what makes it **sequenced** (contrast Approach 2, where legs have no edges between
  them). All edges are between **siblings in the one program stage** (D3 — cross-stage edges silently don't fire).
- The **interface contract** carries only what's knowable up front (the end-to-end intent, logging, naming);
  the **post-NAT source** rides the DAG edge via chaining, not the contract. A leg missing its contract still
  FAILS LOUD.
- **Inter-pipeline chaining**: the context-chainer PIPELINE-predecessor branch chains the upstream leg's real
  `report.md` (the chosen pool) into the downstream leg's §6; the settledness predicate (F18) holds the
  downstream leg until the upstream deliverable is fully persisted, so a half-built NAT design is never chained.

## What each pipeline does

| Leg | Domain protocol | Harvest (read-only) | Design (its slice) | Chained input | Deliverable |
|---|---|---|---|---|---|
| **edge-fw** | network-provisioning (PAN-OS) | zones, rules, log profiles, **free addresses on dmz-facing iface** | untrust→dmz permit (pre-NAT match) + SNAT partner→pool + deny/log | — (head of chain) | PAN-OS diff **+ the chosen pool** |
| **dmz-sg** | terraform-iac | current `aws_security_group.dmz_app` | ingress from the **post-NAT pool** tcp/443, egress to app | edge-fw `report.md` (the pool) | HCL diff (PR) |
| **core-fw** | network-provisioning (ASA) | access-lists, zones, logging | dmz→inside permit matching the **post-NAT pool** + deny/log | dmz-fw `report.md` (transitively the pool) | ASA config diff |

## What Node C (program integration reviewer) checks

Cross-pipeline conformance from **structured facts** (never re-parsing chained prose):
- **NAT-seam correctness**: edge matches the **pre-NAT** partner CIDR and publishes the pool; dmz and core
  match the **post-NAT** pool — **not** the partner CIDR (a pre-NAT match downstream is a silent hole: its
  rule never matches real traffic).
- **No asymmetric hole**: no leg adds a broad return-path inbound rule; return is stateful.
- **Consistent logging + naming**: every hop uses `central-siem`, the `PARTNER-HTTPS-2026` tag, and the NAT
  uses `PARTNER-SNAT-2026`.
- **Chaining coverage facts**: `predecessors === chainCapablePredecessors`, `degradedPredecessors === 0`,
  `notChained []` at every hop — i.e. each downstream leg actually received its upstream's real deliverable
  (`source: 'report.md'`), not a fallback or nothing.

Only if all hold does `programReleasable` compute true. A human converts that into the release decision.

## Design order ≠ apply order (the classic Approach-3 gotcha)

The legs are **DESIGNED** edge-first (the pool must be chosen before downstream can match it). The deliverable
recommends **APPLYING** core-first (`core-fw → dmz-sg → edge-fw` — provision the innermost hop first so the
outer hop never opens before the inner hop is ready). These are **different orders and both correct**;
conflating "we designed edge-first, so apply edge-first" would briefly open the perimeter before the core is
ready to accept the flow.

## Maturity — treat the first run as a validation round

This path is **fully built** (the sibling-pipeline dependency edges, the PIPELINE-predecessor chainer, and the
settledness/coverage facts exist for exactly it) and unit/mechanism-tested, **but the demo wave exercised the
parallel topology (Approach 2), not an end-to-end sequenced inter-pipeline chain.** So the first sequenced
program is a **validation round** (`firewall-policy-use-case.md` §7.3): prove the chain fires
(`source: 'report.md'` + `notChained []` at each hop), the settledness gate holds the downstream leg until the
upstream deliverable persists, and Node C sees the real post-NAT pool — then write its VT doc + a demo exhibit.

## Making it runnable (the follow-up path)

1. Publish read-only harvest **descriptors** + stand up read-only MCP services for PAN-OS and ASA (mirror the
   ceos-lab / tf-readonly rigs); the AWS SG leg reuses the terraform-readonly descriptor against a LocalStack SG.
2. Add the **pan-os** and **cisco-asa** domain protocols + specialist role guidance — a use-case **config**
   exercise per `ADD-A-PIPELINE-HARNESS-AGENT.md`, NOT an engine change.
3. Run it as the **validation round** above (this adds the sequenced-chaining proof the parallel demos didn't),
   then move the artifacts to public `program-artifacts/firewall-approach-3/`.
