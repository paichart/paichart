## Change Package: IS-IS Coexistence Deploy R12 (ceos1/ceos2) — P1 of 4

### Scope & Safety
- Devices: **ceos1**, **ceos2** — single point-to-point link (Ethernet1↔Ethernet1, `10.0.12.0/30`)
- Change: additive `router isis CORE` instance (level-2-only, area `49.0001`) + Ethernet1 + Loopback0 enablement, ships-in-the-night alongside existing OSPF
- **OSPF: zero lines touched on either device this leg** — no OSPF stanza is read, written, or referenced in any config block below
- BGP: not present on this network — out of scope entirely, per Program Interface Contract
- No `distance` / preference-shift command configured this leg — EOS default administrative distances (OSPF 110 < IS-IS 115) already keep OSPF preferred while both protocols run (contract `preferencePolicy.coexistencePhase`)
- Platform: `arista_eos 4.32.2.1F` — every config line below is transcribed verbatim from the Program Interface Contract's `platformDialect.canonicalStanza`, substituting only its bracketed values (instance, NET, interface, metric). Forbidden tokens (`metric-style`, `passive-interface` under `router isis`, `level-2-only`) are confirmed absent from both configs.
- No design `## Derived Values` block was produced (fresh rig, direct contract lookups + 1:1 harvested-cost carry-forward only) — no `## Pre-existing Allocations` section is authored, per protocol.

---

### ceos1 — Candidate Configuration
```
router isis CORE
net 49.0001.0010.0100.1001.00
is-type level-2
!
address-family ipv4 unicast
!
interface Ethernet1
isis enable CORE
isis network point-to-point
isis metric 10
!
interface Loopback0
isis enable CORE
isis passive
```
`metric-style` is intentionally NOT configured — EOS platform default is wide and no such command exists on this platform (contract `targetProtocol.metricStyle`); stated here as fact, never as a config line.

### ceos1 — Validation

**Step 1 — IS-IS adjacency Ethernet1 up:**
```
show isis neighbors
```
Expected output (ceos1; static identity fields only — SNPA/Holdtime/Circuit Id are dynamic and excluded):
```
Instance: CORE
System Id: 0020.0200.2002
Interface: Ethernet1
State: UP
```

**Step 2 — OSPF neighbor state unchanged (GAP — see note):**
```
show ip ospf neighbor
```
Expected output (ceos1; derived from Program Interface Contract static fields — NOT a literal harvester quote):
```
Neighbor ID     Pri   State        Address        Interface
2.2.2.2         1     FULL/  -     10.0.12.2      Ethernet1
```
**GAP — mandatory operator pre-change baseline:** the Phase 0 harvester's literal `show ip ospf neighbor` output was not present in this task's chained context (chaining carries only the immediate Phase 1 Design predecessor, and the Design task's response did not restate the harvester's raw OSPF-neighbor capture verbatim). The template above is derived only from static contract fields (router-ids, link addressing, harvested point-to-point network type ⇒ OSPF state `FULL/ -`, no DR/BDR). **Before applying, the operator MUST capture the literal pre-change `show ip ospf neighbor` output on ceos1, then after applying, re-run the identical command and confirm a byte-identical match on the Neighbor ID, State, Address, and Interface columns** (Dead Time and Priority are dynamic/non-identity fields, excluded from the comparison). Any difference on the named static columns is a rollback trigger.

### ceos1 — Rollback
```
interface Ethernet1
no isis enable CORE
no isis network point-to-point
no isis metric 10
!
interface Loopback0
no isis enable CORE
no isis passive
!
no router isis CORE
```
Reverts ceos1 to its pre-change state; zero OSPF lines are touched (none were touched by the change).

---

### ceos2 — Candidate Configuration
```
router isis CORE
net 49.0001.0020.0200.2002.00
is-type level-2
!
address-family ipv4 unicast
!
interface Ethernet1
isis enable CORE
isis network point-to-point
isis metric 10
!
interface Loopback0
isis enable CORE
isis passive
```
Identical treatment to ceos1 — same instance identifier `CORE`, same area (`49.0001`, implied by NET), required for the two to form an L2 adjacency. `metric-style` not configured, same rationale as ceos1.

### ceos2 — Validation

**Step 1 — IS-IS adjacency Ethernet1 up:**
```
show isis neighbors
```
Expected output (ceos2; static identity fields only):
```
Instance: CORE
System Id: 0010.0100.1001
Interface: Ethernet1
State: UP
```

**Step 2 — OSPF neighbor state unchanged (GAP — see note):**
```
show ip ospf neighbor
```
Expected output (ceos2; derived from Program Interface Contract static fields — NOT a literal harvester quote):
```
Neighbor ID     Pri   State        Address        Interface
1.1.1.1         1     FULL/  -     10.0.12.1      Ethernet1
```
**GAP — mandatory operator pre-change baseline:** same gap as ceos1 above — the harvester's literal capture was not available in this task's chained context. The operator MUST capture the literal pre-change `show ip ospf neighbor` output on ceos2, then re-run post-change and confirm byte-identical match on Neighbor ID, State, Address, and Interface (Dead Time/Priority excluded as volatile).

### ceos2 — Rollback
```
interface Ethernet1
no isis enable CORE
no isis network point-to-point
no isis metric 10
!
interface Loopback0
no isis enable CORE
no isis passive
!
no router isis CORE
```

---

### Recommended Change Ordering & Maintenance Window
1. Apply the full stanza to **ceos1** first, then **ceos2**. No safety ordering constraint exists — OSPF is completely untouched on both devices throughout, so applying in either order carries zero OSPF risk. The ceos1→ceos2 sequence exists only so the IS-IS adjacency transition (Down → Up) happens as one clean, observable event once both ends share a compatible area/level/network-type — this is a single-link, single-peer topology, so no adjacency can form until both devices are configured.
2. Maintenance window: no OSPF-protecting window is required (OSPF is never touched). Recommend a short (~15–30 min) low-traffic observation window solely to (a) capture the mandatory pre-change OSPF baseline named in the Step 2 gap above, (b) apply both devices, and (c) confirm both validation steps on both devices before closing the window.
3. **Apply is out-of-band and human-gated.** This package is the candidate change only — no device has been mutated in the course of authoring it. A human engineer or a deterministic applier (Ansible/NAPALM/Nornir) consumes this package to perform the actual apply.

Confidence: 78 — Config blocks are fully verified transcriptions of the binding Program Interface Contract's canonical stanza (no forbidden tokens, no missing lines) and the IS-IS adjacency validation is fully deterministic from contract-derived system-IDs. One named gap: the OSPF-untouched validation's expected output could not be quoted verbatim from the Phase 0 harvest (not present in this task's chained context), so it is derived from static contract facts and paired with a mandatory operator pre-change/post-change baseline diff instead of a harvester quote.