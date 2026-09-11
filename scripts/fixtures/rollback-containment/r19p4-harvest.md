Output format is unaligned.
## State Summary

**Scope:** Phase 0 harvest for P4 (final leg, IGP-T1 R19 triangle). Self-provisioned `ceos-lab-readonly` (registry ID `cmtfgao3p00ktyx7u9q82m8c4`, status ACTIVE) from the descriptor at the contract's `serviceDescriptorUrl`, then harvested **live, current** state on ceos1/ceos2/ceos3 via read-only NAPALM `config` getter (per-device, never group-filtered) + allowlisted `show_commands`. **3/3 devices responded successfully on every read — no partial failures, no gaps.** All reads were single-target and none truncated. Teardown of the self-provisioned service is deferred to harness SYNTHESIZE per protocol — not performed here.

**Secret hygiene note:** the `config` getter returned full running-config, which incidentally carries `username admin ... secret sha512 $6$...` and `snmp-server community ... ro` lines outside the OSPF/IS-IS sections needed. These are out of this harvest's objective scope and are **not restated below** (values, not just redacted placeholders, arrived unredacted — per protocol they are referenced by directive only, never repeated). Management-plane addressing (`Management0`, `172.30.31.0/24`) is likewise excluded per the contract's `scopeExclusions`.

---

## 1. Full OSPF configuration per device (verbatim — this is the P4 rollback source, per `rollbackPolicy.P4`)

**ceos1** (router-id 1.1.1.1):
```
interface Ethernet1
   description to-ceos2 (ospf cost 10)
   no switchport
   ip address 10.0.12.1/30
   ip ospf cost 10
   ip ospf network point-to-point
!
interface Ethernet2
   description to-ceos3 (ospf cost 40 — transit path via ceos2 preferred: 10+20=30)
   no switchport
   ip address 10.0.13.1/30
   ip ospf cost 40
   ip ospf network point-to-point
!
router ospf 1
   router-id 1.1.1.1
   passive-interface Loopback0
   network 1.1.1.1/32 area 0.0.0.0
   network 10.0.12.0/30 area 0.0.0.0
   network 10.0.13.0/30 area 0.0.0.0
   max-lsa 12000
```

**ceos2** (router-id 2.2.2.2):
```
interface Ethernet1
   description to-ceos1 (ospf cost 10)
   no switchport
   ip address 10.0.12.2/30
   ip ospf cost 10
   ip ospf network point-to-point
!
interface Ethernet2
   description to-ceos3 (ospf cost 20)
   no switchport
   ip address 10.0.23.1/30
   ip ospf cost 20
   ip ospf network point-to-point
!
router ospf 1
   router-id 2.2.2.2
   passive-interface Loopback0
   network 2.2.2.2/32 area 0.0.0.0
   network 10.0.12.0/30 area 0.0.0.0
   network 10.0.23.0/30 area 0.0.0.0
   max-lsa 12000
```

**ceos3** (router-id 3.3.3.3):
```
interface Ethernet1
   description to-ceos2 (ospf cost 20)
   no switchport
   ip address 10.0.23.2/30
   ip ospf cost 20
   ip ospf network point-to-point
!
interface Ethernet2
   description to-ceos1 (ospf cost 40 — transit path via ceos2 preferred: 20+10=30)
   no switchport
   ip address 10.0.13.2/30
   ip ospf cost 40
   ip ospf network point-to-point
!
router ospf 1
   router-id 3.3.3.3
   passive-interface Loopback0
   network 3.3.3.3/32 area 0.0.0.0
   network 10.0.13.0/30 area 0.0.0.0
   network 10.0.23.0/30 area 0.0.0.0
   max-lsa 12000
```

`show ip ospf interface brief` (all 3 devices) confirms OSPF process 1, area 0.0.0.0, is still live and operational on every interface (Lo0 DR/cost 10, and both Ethernet links matching the costs above) — **OSPF has NOT yet been removed**; this is the ships-in-the-night coexistence state P4 is about to retire.

---

## 2. IS-IS distance-90 confirmation (P3 verification) — `router isis CORE` section per device

All three devices, verbatim:
```
router isis CORE
   net <device NET>
   is-type level-2
   !
   address-family ipv4 unicast
      distance 90 level-1
      distance 90 level-2
```
| Device | NET | Distance rendered |
|---|---|---|
| ceos1 | 49.0001.0010.0100.1001.00 | 90 (level-1 **and** level-2) |
| ceos2 | 49.0001.0020.0200.2002.00 | 90 (level-1 **and** level-2) |
| ceos3 | 49.0001.0030.0300.3003.00 | 90 (level-1 **and** level-2) |

**Finding (rendering, not a discrepancy):** the contract describes the P3 directive as a single `distance 90` command under the address-family. The device renders it as **two explicit lines** (`distance 90 level-1` / `distance 90 level-2`) — EOS's normal expansion of a level-agnostic distance directive into per-level config. The **value** (90) matches the contract on both levels; this is reported as an observed rendering fact, not silently reconciled to "one line."

---

## 3. Current IS-IS route set (`show ip route isis`) — routes + next-hops

| Device | Prefix | Metric (admin/metric) | Next-hop | Egress if |
|---|---|---|---|---|
| ceos1 | 2.2.2.2/32 | [90/20] | 10.0.12.2 | Ethernet1 |
| ceos1 | 3.3.3.3/32 | [90/40] | 10.0.12.2 | Ethernet1 |
| ceos1 | 10.0.23.0/30 | [90/30] | 10.0.12.2 | Ethernet1 |
| ceos2 | 1.1.1.1/32 | [90/20] | 10.0.12.1 | Ethernet1 |
| ceos2 | 3.3.3.3/32 | [90/30] | 10.0.23.2 | Ethernet2 |
| ceos2 | 10.0.13.0/30 | [90/50] | 10.0.12.1 | Ethernet1 |
| ceos3 | 1.1.1.1/32 | [90/40] | 10.0.23.1 | Ethernet1 |
| ceos3 | 2.2.2.2/32 | [90/30] | 10.0.23.1 | Ethernet1 |
| ceos3 | 10.0.12.0/30 | [90/30] | 10.0.23.1 | Ethernet1 |

**Load-bearing-pair verification against contract `pathPreferencePreservation`:**
- ceos1 → ceos3.loopback0: harvest shows next-hop **10.0.12.2 via Ethernet1 (ceos2)** — matches contract's expected next-hop exactly. ✅ No discrepancy.
- ceos3 → ceos1.loopback0: harvest shows next-hop **10.0.23.1 via Ethernet1 (ceos2)** — matches contract's expected next-hop exactly. ✅ No discrepancy.

Metric arithmetic checks out against the configured interface metrics (ceos1↔ceos2=10, ceos2↔ceos3=20, ceos1↔ceos3=40) plus an observed +10 for prefixes anchored on a remote `Loopback0` (no explicit `isis metric` was ever configured on any Loopback0, so EOS applies its default IS-IS metric of 10 there) — e.g. ceos1→3.3.3.3/32 = 10(ceos1-ceos2)+20(ceos2-ceos3)+10(default loopback)=40, observed 40. Link-only prefixes (e.g. `10.0.23.0/30` seen from ceos1) show the raw summed link metric (30) with no loopback add-on, consistent throughout all three devices.

Since these routes appear under `show ip route isis` (the installed/selected RIB view filtered by source protocol) at distance 90, **IS-IS is confirmed as the currently preferred/installed protocol** — matching the contract's expected P3 outcome.

---

## 4. IS-IS and OSPF adjacency state

| Device | Protocol | Neighbor | Interface | State |
|---|---|---|---|---|
| ceos1 | OSPF | 3.3.3.3 (ceos3) | Ethernet2 | FULL |
| ceos1 | OSPF | 2.2.2.2 (ceos2) | Ethernet1 | FULL |
| ceos1 | IS-IS | ceos2 (L2) | Ethernet1 | UP |
| ceos1 | IS-IS | ceos3 (L2) | Ethernet2 | UP |
| ceos2 | OSPF | 3.3.3.3 (ceos3) | Ethernet2 | FULL |
| ceos2 | OSPF | 1.1.1.1 (ceos1) | Ethernet1 | FULL |
| ceos2 | IS-IS | ceos1 (L2) | Ethernet1 | UP |
| ceos2 | IS-IS | ceos3 (L2) | Ethernet2 | UP |
| ceos3 | OSPF | 1.1.1.1 (ceos1) | Ethernet2 | FULL |
| ceos3 | OSPF | 2.2.2.2 (ceos2) | Ethernet1 | FULL |
| ceos3 | IS-IS | ceos1 (L2) | Ethernet2 | UP |
| ceos3 | IS-IS | ceos2 (L2) | Ethernet1 | UP |

**All 6 OSPF adjacencies (3 links × 2 directions) are FULL and all 6 IS-IS adjacencies are UP** — both protocols are simultaneously healthy on every link in the triangle. This is the expected pre-P4 coexistence state: OSPF has not been touched, IS-IS is preferred (distance 90), both control planes are fully adjacent.

---

## Discrepancy call-out (required by task)

Comparing "what P3 was expected to apply" vs. "what harvest shows":

| Expected (contract) | Observed (live) | Verdict |
|---|---|---|
| `distance 90` under `router isis CORE` / `address-family ipv4 unicast` | Rendered as two lines: `distance 90 level-1` + `distance 90 level-2`, value 90 on both | **Match** (rendering expansion only, not a value discrepancy) |
| IS-IS preferred over OSPF | `show ip route isis` shows all 9 expected prefixes (3 per device) installed at distance 90 | **Match** |
| Cross-corner traffic prefers ceos2 transit (not direct 10.0.13.0/30 link) | Confirmed for both load-bearing pairs (ceos1↔ceos3 via ceos2 in both directions) | **Match** |

**No discrepancy found.** P3's applied state is fully confirmed live, with the one noted (benign) rendering detail on the distance command.

---

## Harvested Allocations

```json
[
  {"kind": "cidr", "cidr": "10.0.12.0/30", "device": "ceos1", "interface": "Ethernet1", "source": "fetch_data NAPALM config getter (running) on ceos1"},
  {"kind": "cidr", "cidr": "10.0.13.0/30", "device": "ceos1", "interface": "Ethernet2", "source": "fetch_data NAPALM config getter (running) on ceos1"},
  {"kind": "cidr", "cidr": "1.1.1.1/32", "device": "ceos1", "interface": "Loopback0", "source": "fetch_data NAPALM config getter (running) on ceos1"},
  {"kind": "cidr", "cidr": "10.0.12.0/30", "device": "ceos2", "interface": "Ethernet1", "source": "fetch_data NAPALM config getter (running) on ceos2"},
  {"kind": "cidr", "cidr": "10.0.23.0/30", "device": "ceos2", "interface": "Ethernet2", "source": "fetch_data NAPALM config getter (running) on ceos2"},
  {"kind": "cidr", "cidr": "2.2.2.2/32", "device": "ceos2", "interface": "Loopback0", "source": "fetch_data NAPALM config getter (running) on ceos2"},
  {"kind": "cidr", "cidr": "10.0.23.0/30", "device": "ceos3", "interface": "Ethernet1", "source": "fetch_data NAPALM config getter (running) on ceos3"},
  {"kind": "cidr", "cidr": "10.0.13.0/30", "device": "ceos3", "interface": "Ethernet2", "source": "fetch_data NAPALM config getter (running) on ceos3"},
  {"kind": "cidr", "cidr": "3.3.3.3/32", "device": "ceos3", "interface": "Loopback0", "source": "fetch_data NAPALM config getter (running) on ceos3"}
]
```

No ASN entries: no BGP is configured on any of the three devices (confirmed absent from all three running-configs), consistent with the contract's `scopeExclusions: ["BGP (none exists on this network)"]`.

*Synthesis for the Architect:* the pre-removal snapshot is complete and internally consistent — OSPF is fully live (needed verbatim for the P4 rollback plan), IS-IS is confirmed preferred with correct path preservation on both load-bearing pairs, and no discrepancy exists between expected and observed P3 state. The Architect can proceed to design OSPF removal against this snapshot with no open gaps.

Confidence: 96 — All four required harvest scopes returned successfully from all three devices with zero read failures or truncation; the two load-bearing next-hop checks and the distance-90 confirmation were independently verified against the contract's stated expectations with no unresolved assumptions. The 2-point deduction reflects that OSPF/IS-IS metric arithmetic (the +10 loopback default) was inferred from EOS's known default IS-IS metric behavior rather than an explicit device-returned value confirming that default.
