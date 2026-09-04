# IGP-migration rig — 2-node OSPF area-0 brownfield

> **Status**: BUILT + RUN, 2026-08-24/25 · nine rounds (IGP-T1 R1–R9) · **the rig the arc actually uses**
> **Arc**: `cline_docs/igp-migration-design-2026-08-21/` · **Run inputs**: `~/paichart/program-artifacts/igp-migration-t1-2node/`
> **Sibling**: `../igp-triangle/` (3 nodes, **SHELVED** — does not fit this host at any cap, and cEOS
> does not boot on the off-host VirtualBox VM; both verdicts are measured, see that README)

The sizing rationale lives in `topology.clab.yml`'s header — read it before proposing a third node.
This file is the **operator runbook**: bring-up, the traps that have actually bitten, teardown.

## What it is

Two Arista cEOS 4.32.2.1F nodes, one link, running **OSPF area 0 only** — a brownfield baseline for
the OSPF→IS-IS migration program to migrate. Deliberately no BGP and no T6 seed: the BGP lab is
`../topology.clab.yml`, and mixing them makes a harvest hard to read.

| | |
|---|---|
| lab name | `igp2-ceos` |
| bridge | `clab-igp2` · `172.30.32.0/24` (distinct from the BGP lab's `.30` and the shelved triangle's `.31`) |
| nodes | `ceos1` 172.30.32.11 · `ceos2` 172.30.32.12 — 1.9g / 1.5 cpu each |
| link | `ceos1:eth1 ↔ ceos2:eth1` — 10.0.12.0/30, OSPF cost 10 both ends |
| loopbacks | 1.1.1.1/32 · 2.2.2.2/32 (also the OSPF router-ids) |
| harvest | the same nornir-mcp gateway as the BGP lab — inventory in `nornir/` (2 hosts) |

## Bring-up

```bash
# 0. STALE CONTAINERS AFTER A HOST REBOOT — do this first, always.
#    Exited(255) containers from a previous boot make a fresh deploy fail confusingly.
ssh <PROD_USER>@<PROD_HOST> 'containerlab destroy --cleanup -t <any prior topology> 2>/dev/null; docker ps -a | grep clab'

# 1. deploy (copy this directory to the prod host first)
containerlab deploy -t topology.clab.yml

# 2. arm the memory watchdog FOR THIS LAB — the LAB NAME IS NOT THE DEFAULT
LAB=igp2-ceos ./../igp-triangle/memory-watchdog.sh &

# 3. point the nornir gateway at this inventory, then re-register the service
#    (descriptor: ~/paichart/descriptors/ceos-lab-readonly-descriptor.json — v0.3.0 or later)
```

⚠️ **The watchdog's `LAB` is load-bearing and defaults to the OTHER lab.** Armed with its default
(`igp-ceos`) while this lab is `igp2-ceos`, its emergency kill targets containers that do not exist —
so it reads as running and protects nothing. Caught before launch on 2026-08-24; check the value.

⚠️ **The descriptor's `show_commands` allowlist gates what the harvest can see.** IS-IS work needs
v0.3.0+, which adds `show isis database` / `show isis database detail` alongside the OSPF and
neighbor commands. A missing command surfaces as a leg that cannot verify rather than as an error.

⚠️ **No push to `main` while this is up.** The next build deploys onto this same host and a `pm2
reload` orphans running pipeline executions. Rigs down → then push.

## Teardown

```bash
containerlab destroy --cleanup -t topology.clab.yml
```

Rig containers **only**. Never stop `cloudflared` — it is a shared systemd service with a stable
hostname reused across every rig.

## What the migration story costs at 2 nodes

Only the transit-path narrative: with one link there is no path to choose, so nothing exercises
"IS-IS picked a different next-hop". The four-phase story is otherwise intact — coexistence →
parity → preference shift → OSPF removal.

## Reading a parity check here

During coexistence the program deliberately keeps OSPF preferred, so IS-IS routes are computed but
never **installed** — a routing-table view lists installed routes only, and will show none. Parity is
therefore asserted against the **link-state database**, not the routing table. A validation step that
asks for IS-IS routes in `show ip route` during coexistence cannot pass by construction, which is a
defect in the step, not in the change. *(Earned: R9 shipped exactly that step, and its parity
criterion had the same shape.)*
