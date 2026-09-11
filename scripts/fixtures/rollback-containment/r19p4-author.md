Output format is unaligned.
## P4 (Final Leg) — OSPF Removal Change Package: IGP-T1 R19 Triangle

### Phase & Program Status

| Item | Value |
|---|---|
| Phase | **P4 — final leg** of the IGP-T1 R19 OSPF→IS-IS migration (3-node triangle: ceos1, ceos2, ceos3) |
| What P3 was expected to apply | `distance 90` under `router isis CORE` / `address-family ipv4 unicast` on all three devices, making IS-IS (AD 90) preferred over OSPF (AD 110) |
| What the Phase 0 (this-run) harvest actually showed | Confirmed live on all 3 devices, rendered by EOS as two expanded lines (`distance 90 level-1` + `distance 90 level-2` — a benign rendering expansion, not a value discrepancy). `show ip route isis` shows all 9 expected prefixes installed at distance 90 on all three devices; both load-bearing next-hops (ceos1→ceos3 and ceos3→ceos1 via ceos2) match the contract exactly. All 6 OSPF adjacencies FULL and all 6 IS-IS adjacencies UP — full coexistence, IS-IS fully preferred, no discrepancy found. |
| This package's action | Remove `router ospf 1` and its interface bindings from ceos1, ceos2, ceos3 now that IS-IS is confirmed carrying 100% of traffic. **This is the design/author step only — apply is a separate, human-gated step; nothing here is executed against a device.** |

No values in this package are derived from harvested allocations (no addressing/ASN math applies to a pure removal) — per protocol, no `## Derived Values` / `## Pre-existing Allocations` section is authored.

---

## 1. Per-Device Candidate Configuration (Removal)

Syntax is standard `arista_eos` negation (`no router ospf <process>` removes the entire process and its network/passive-interface/max-lsa sub-config in one command; `no ip ospf cost` / `no ip ospf network point-to-point` strip the interface-level overrides). No IS-IS line is touched. No contract-forbidden token (`metric-style`, `passive-interface`, `level-2-only`) appears anywhere below — none is relevant to a removal package since no new IS-IS stanza is being written.

**Order: ceos1 → ceos3 → ceos2** (corner nodes first, transit node last — per Phase 1 design §3 risk-management rationale; no functional dependency exists since IS-IS already carries 100% of traffic on every device).

### ceos1
```
no router ospf 1
!
interface Ethernet1
   no ip ospf cost
   no ip ospf network point-to-point
!
interface Ethernet2
   no ip ospf cost
   no ip ospf network point-to-point
!
```

### ceos3
```
no router ospf 1
!
interface Ethernet1
   no ip ospf cost
   no ip ospf network point-to-point
!
interface Ethernet2
   no ip ospf cost
   no ip ospf network point-to-point
!
```

### ceos2
```
no router ospf 1
!
interface Ethernet1
   no ip ospf cost
   no ip ospf network point-to-point
!
interface Ethernet2
   no ip ospf cost
   no ip ospf network point-to-point
!
```

**Untouched by this package (confirmed against harvest):** all `ip address` lines, `Loopback0` addressing, the entire `router isis CORE` block, `isis enable`/`isis metric`/`isis network point-to-point` lines on every interface, management plane (`Management0`, credentials, SNMP community).

---

## 2. Deterministic Validation

### 2a. OSPF process removed (all 3 devices) — literal baseline, witnessed

```
show run | section router ospf
```
**Expected output (ceos1, post-change):**
```
```
*(empty — the pre-change baseline below must no longer be returned)*

Pre-change baseline (Phase 0 harvest, verbatim, quoted for the diff — NOT the post-change expectation):
```
router ospf 1
   router-id 1.1.1.1
   passive-interface Loopback0
   network 1.1.1.1/32 area 0.0.0.0
   network 10.0.12.0/30 area 0.0.0.0
   network 10.0.13.0/30 area 0.0.0.0
   max-lsa 12000
```

```
show run | section router ospf
```
**Expected output (ceos2, post-change):**
```
```
*(empty)* — pre-change baseline (verbatim):
```
router ospf 1
   router-id 2.2.2.2
   passive-interface Loopback0
   network 2.2.2.2/32 area 0.0.0.0
   network 10.0.12.0/30 area 0.0.0.0
   network 10.0.23.0/30 area 0.0.0.0
   max-lsa 12000
```

```
show run | section router ospf
```
**Expected output (ceos3, post-change):**
```
```
*(empty)* — pre-change baseline (verbatim):
```
router ospf 1
   router-id 3.3.3.3
   passive-interface Loopback0
   network 3.3.3.3/32 area 0.0.0.0
   network 10.0.13.0/30 area 0.0.0.0
   network 10.0.23.0/30 area 0.0.0.0
   max-lsa 12000
```

### 2b. Interface-level OSPF lines removed (all 3 devices) — field-scoped diff (avoids touching the co-resident IS-IS lines on the same interface)

```
show run interface Ethernet1 | include ip ospf
```
**Expected output (ceos1, post-change):**
```
```
*(empty)* — pre-change baseline lines that must disappear: `ip ospf cost 10`, `ip ospf network point-to-point`

```
show run interface Ethernet2 | include ip ospf
```
**Expected output (ceos1, post-change):**
```
```
*(empty)* — pre-change baseline lines: `ip ospf cost 40`, `ip ospf network point-to-point`

(Identical shape for ceos2: Ethernet1 baseline `ip ospf cost 10`/`ip ospf network point-to-point`, Ethernet2 baseline `ip ospf cost 20`/`ip ospf network point-to-point`; and ceos3: Ethernet1 baseline `ip ospf cost 20`/`ip ospf network point-to-point`, Ethernet2 baseline `ip ospf cost 40`/`ip ospf network point-to-point` — each expected post-change output is empty.)

### 2c. OSPF adjacencies gone (all 3 devices)

```
show ip ospf neighbor
```
**Expected output (ceos2, post-change):**
```
```
*(empty)* — witnessed pre-change baseline (Phase 0 harvest, literal raw capture, successfully retrieved this execution):
```
Neighbor ID     Instance VRF      Pri State                  Dead Time   Address         Interface
3.3.3.3         1        default  0   FULL                   00:00:34    10.0.23.2       Ethernet2
1.1.1.1         1        default  0   FULL                   00:00:33    10.0.12.1       Ethernet1
```

**For ceos1 and ceos3: this literal was NOT obtained.** I made a targeted `read_more` call this execution attempting to locate ceos1's raw `show_commands` output inside the Phase 0 harvest artifact; that call failed outright (`read_more: already paged ref 1 6 times`) because I had already exhausted the 6-page paging allowance on that artifact reading other sections (the OSPF config blocks, the IS-IS distance confirmation, and ceos2's raw show-command output). The call did not return partial or degraded data — it returned nothing, and I did not retry it per instructions. Only the tabulated equivalent (Harvest §4) was available: ceos1 has 2 OSPF neighbors FULL — 3.3.3.3/Ethernet2, 2.2.2.2/Ethernet1; ceos3 has 2 OSPF neighbors FULL — 1.1.1.1/Ethernet2, 2.2.2.2/Ethernet1. **This is a named gap, not a fabricated literal.** The operator must run `show ip ospf neighbor` on ceos1 and ceos3 immediately before applying this package to obtain the literal pre-change baseline this package could not retrieve, then confirm the identical command returns empty output post-change.

### 2d. IS-IS route set + adjacencies UNCHANGED (all 3 devices)

```
show ip route isis
```
**Expected output (ceos2, post-change — byte-identical to pre-change, witnessed Phase 0 harvest capture):**
```

VRF: default
Source Codes:
       C - connected, S - static, K - kernel,
       O - OSPF, IA - OSPF inter area, E1 - OSPF external type 1,
       E2 - OSPF external type 2, N1 - OSPF NSSA external type 1,
       N2 - OSPF NSSA external type2, B - Other BGP Routes,
       B I - iBGP, B E - eBGP, R - RIP, I L1 - IS-IS level 1,
       I L2 - IS-IS level 2, O3 - OSPFv3, A B - BGP Aggregate,
       A O - OSPF Summary, NG - Nexthop Group Static Route,
       V - VXLAN Control Service, M - Martian,
       DH - DHCP client installed default route,
       DP - Dynamic Policy Route, L - VRF Leaked,
       G  - gRIBI, RC - Route Cache Route,
       CL - CBF Leaked Route

I L2     1.1.1.1/32 [90/20]
           via 10.0.12.1, Ethernet1
I L2     3.3.3.3/32 [90/30]
           via 10.0.23.2, Ethernet2
I L2     10.0.13.0/30 [90/50]
           via 10.0.12.1, Ethernet1
```

```
show isis neighbor
```
**Expected output (ceos2, post-change — byte-identical to pre-change, witnessed):**
```
 
Instance  VRF      System Id        Type Interface          SNPA              State Hold time   Circuit Id          
CORE      default  ceos1            L2   Ethernet1          P2P               UP    30          0F                  
CORE      default  ceos3            L2   Ethernet2          P2P               UP    23          11                  
```
*(Hold-time value is a volatile counter — compare only System Id / Type / Interface / State / Circuit Id fields; hold-time will differ run-to-run even with zero config change.)*

**For ceos1 and ceos3: literal raw `show ip route isis` / `show isis neighbor` captures were likewise not obtained**, for the same reason given in §2c — the `read_more` attempt that would have surfaced them failed on the paging cap before reaching that part of the artifact. The known field-level facts from Phase 0 harvest §3/§4 (baseline-diff target — not a predicted literal):

| Device | Prefix/Neighbor | Metric or State | Next-hop / Interface |
|---|---|---|---|
| ceos1 | route 2.2.2.2/32 | [90/20] | via 10.0.12.2, Ethernet1 |
| ceos1 | route 3.3.3.3/32 | [90/40] | via 10.0.12.2, Ethernet1 |
| ceos1 | route 10.0.23.0/30 | [90/30] | via 10.0.12.2, Ethernet1 |
| ceos1 | IS-IS neighbor ceos2 (L2) | UP | Ethernet1 |
| ceos1 | IS-IS neighbor ceos3 (L2) | UP | Ethernet2 |
| ceos3 | route 1.1.1.1/32 | [90/40] | via 10.0.23.1, Ethernet1 |
| ceos3 | route 2.2.2.2/32 | [90/30] | via 10.0.23.1, Ethernet1 |
| ceos3 | route 10.0.12.0/30 | [90/30] | via 10.0.23.1, Ethernet1 |
| ceos3 | IS-IS neighbor ceos1 (L2) | UP | Ethernet2 |
| ceos3 | IS-IS neighbor ceos2 (L2) | UP | Ethernet1 |

**Required check:** run `show ip route isis` and `show isis neighbor` on ceos1/ceos3 pre-change (to obtain the literal baseline this package could not retrieve) and post-change; every prefix/next-hop/interface and every neighbor/state/interface row above must be present, unchanged, in both captures — zero additions, zero removals.

---

## 3. Rollback Plan — re-add OSPF, embedded VERBATIM per contract `rollbackPolicy.P4`

Per contract: rollback re-adds OSPF using the configuration **harvested LIVE by this P4 leg** — reproduced exactly as captured (Phase 0 harvest §1, successfully retrieved this execution and cross-checked against a direct raw `fetch_data` config-getter capture for ceos3), never reconstructed from the summary table above.

### ceos1 rollback
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

### ceos2 rollback
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

### ceos3 rollback
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

No secret material (`username ... secret sha512 ...`, `snmp-server community ... ro`) is part of the removal or rollback — those lines were outside this leg's OSPF/IS-IS scope in the Phase 0 harvest and are not restated here.

---

## 4. Change Ordering & Maintenance Window

1. **ceos1** (corner) — apply removal, confirm §2a–§2c pass, confirm §2d shows zero IS-IS disruption, then proceed.
2. **ceos3** (corner) — same procedure; confirms consistency across both corners.
3. **ceos2** (transit, carries the ceos1↔ceos3 preferred path) — applied **last**, once both corners are confirmed clean, since it is the highest-consequence node if the removal procedure had a defect.

Per-device internal order: remove `router ospf 1` (process) **before** the interface `ip ospf` lines — this drops the OSPF adjacency and LSA sourcing cleanly first, leaving the interface lines as inert config with no transient adjacency flapping from ordering. Allow OSPF-adjacency-teardown confirmation on each device's two peers (§2c) before moving to the next device.

**Maintenance window:** low-impact — IS-IS is already the sole carrier of all traffic (harvest-confirmed), so this removal has no expected forwarding impact on any device at any point in the sequence. A standard low-traffic maintenance window is still recommended as a lab-safety practice, not because forwarding risk is expected.

---

## 5. Persistence Statement

This change is **not** intended as running-config only. After all three devices pass validation (§2a–§2d), persist on each device:

```
copy running-config startup-config
```
*(alias: `write memory` — either is valid EOS syntax; use one consistently across all three devices.)*

Persist **only after** validation passes on that specific device — do not persist a device whose §2 checks have not yet been confirmed clean.

Confidence: 74 — Solid on ceos1/ceos2/ceos3 OSPF-removal config and on ceos2's full validation set (literal, witnessed both directly and via a successful raw retrieval this execution). Materially degraded from my prior draft: a `read_more` call attempting to reach ceos1's raw show-command output failed outright on the artifact's 6-page pagination cap, and as a direct consequence neither ceos1 nor ceos3 have a literal pre-change baseline for OSPF-neighbor / IS-IS-route / IS-IS-neighbor validation in this package — those two devices' checks rely on tabulated (not literal) harvest facts and require an operator-captured baseline before use, which is named explicitly rather than papered over.
