Output format is unaligned.
# Change Package: Edge ACL+SNAT — ceos1 (FW-A3.3 R3, Run 20260821-0953)

## 1. Scope

This package covers **ceos1 only**: the ingress ACL on Ethernet3 (PARTNER-UPLINK, untrust), the SNAT pool object, the ceos1-side egress binding on Ethernet2 (DMZ-SEGMENT, dmz) toward `dmz-sg`, and the supporting BGP/static-route reachability addition for the SNAT pool. The `dmz-sg` policy itself and the ceos2 core ACL are **out of scope** — sibling rounds per the Phase 1 design's dependency note. No device contact is made by this task; all blocks below are candidate configuration for human-gated apply.

## 2. Candidate Configuration

### 2.1 Ingress ACL — Ethernet3 (PARTNER-UPLINK, untrust) — tag `PARTNER-HTTPS-2026`

```
ip access-list PARTNER-HTTPS-2026
   10 permit tcp 203.0.113.0/24 host 10.20.0.10 eq 443
   1000 deny ip any any log
!
interface Ethernet3
   ip access-group PARTNER-HTTPS-2026 in
```

### 2.2 SNAT Pool — tag `PARTNER-SNAT-2026`

```
ip nat pool PARTNER-SNAT-2026 prefix-length 31 10.99.0.0 10.99.0.1
```

### 2.3 Egress Binding — Ethernet2 (DMZ-SEGMENT, dmz) toward `dmz-sg`

```
interface Ethernet2
   ip nat source dynamic access-list PARTNER-HTTPS-2026 pool PARTNER-SNAT-2026 overload
```

### 2.4 Pool Reachability — static route + BGP advertisement (new resource, per Phase 1 design §1/§2 change #4)

```
ip route 10.99.0.0/31 Null0
!
router bgp 65001
   network 10.99.0.0/31
```

---

## 3. Validation Steps (deterministic — command + literal expected output)

### 3.1 ACL object exists with correct rules

```
show ip access-lists PARTNER-HTTPS-2026
```
**Expected output (ceos1):**
```
IP Access List PARTNER-HTTPS-2026
   10 permit tcp 203.0.113.0/24 host 10.20.0.10 eq 443
   1000 deny ip any any log
```
*(Match-count columns omitted — volatile/traffic-dependent; only rule text is checked.)*

### 3.2 ACL bound to Ethernet3 ingress

```
show running-config interfaces Ethernet3 | include ip access-group
```
**Expected output (ceos1):**
```
   ip access-group PARTNER-HTTPS-2026 in
```

### 3.3 NAT pool object exists

```
show running-config | include ip nat pool PARTNER-SNAT-2026
```
**Expected output (ceos1):**
```
ip nat pool PARTNER-SNAT-2026 prefix-length 31 10.99.0.0 10.99.0.1
```

### 3.4 Egress NAT binding present on Ethernet2

```
show running-config interfaces Ethernet2 | include ip nat source
```
**Expected output (ceos1):**
```
   ip nat source dynamic access-list PARTNER-HTTPS-2026 pool PARTNER-SNAT-2026 overload
```

### 3.5 Static null-route for pool present

```
show running-config | include ip route 10.99.0.0/31
```
**Expected output (ceos1):**
```
ip route 10.99.0.0/31 Null0
```

### 3.6 BGP network statement advertising the pool present

```
show running-config | include network 10.99.0.0/31
```
**Expected output (ceos1):**
```
   network 10.99.0.0/31
```

### 3.7 No active translations at cutover (pre-traffic sanity check)

```
show ip nat translations
```
**Expected output (ceos1, immediately post-apply, before partner traffic starts):**
```
Pro Source global      Source local       Destination local  Destination global
```
*(Header only, zero rows — confirms the binding is inert until real partner traffic arrives; no counters asserted.)*

---

## 4. Rollback Plan (ceos1 — exact config to restore prior state)

Prior state on ceos1 had **zero ACLs, zero NAT config, and no 10.99.0.0/31 route/advertisement** (confirmed greenfield by the Phase 0 harvest — see §6). Rollback removes bindings before deleting the referenced objects, and removes the BGP/route addition last-in-first-out relative to apply order 2.1→2.4:

```
interface Ethernet3
   no ip access-group PARTNER-HTTPS-2026 in
!
interface Ethernet2
   no ip nat source dynamic access-list PARTNER-HTTPS-2026 pool PARTNER-SNAT-2026 overload
!
no ip nat pool PARTNER-SNAT-2026
!
no ip access-list PARTNER-HTTPS-2026
!
router bgp 65001
   no network 10.99.0.0/31
!
no ip route 10.99.0.0/31 Null0
```

Post-rollback validation: re-run 3.1–3.6; each command should return **no matching output** (empty) since every object/line has been removed.

---

## 5. Change Ordering + Maintenance Window

Two **distinct** sequences apply — design order is not apply order:

| Sequence | Order | Purpose |
|---|---|---|
| **Design order** (Phase 1 Architect's documentation order) | `edge (ceos1) → dmz (dmz-sg) → core (ceos2)` | The order the three legs were/are authored — this task's scope is the edge leg. |
| **Human apply order** (requirements check 6, human-gated, out-of-band) | `core (ceos2) → dmz (dmz-sg) → edge (ceos1)` | **Reversed** from design order so permit rules exist end-to-end *before* ceos1's edge ACL+NAT begins admitting live partner traffic — prevents a window where ceos1 forwards translated traffic that core/dmz would drop, and avoids any transient full-open exposure. |

**Maintenance window note:** Apply during a scheduled low-traffic window. Within the ceos1 leg specifically: apply blocks 2.1→2.4 in the order listed (ACL object → pool object → interface bindings → route/BGP), run validations 3.1–3.6 after each block before proceeding to the next, and do **not** enable this leg until the core (ceos2) and dmz (dmz-sg) legs from their respective sibling rounds have already been applied and validated, per the apply-order table above. Apply is a separate, human-gated step — this package does not execute it.

**Pool binding note:** `10.99.0.0/31` (members `10.99.0.0/32`, `10.99.0.1/32`) is the runtime-chained SNAT pool value for this program — downstream Pipelines 2 and 3 consume this exact value. It must not be modified by any consumer of this package.

---

## 6. Pre-existing Allocations

**Quoted verbatim from the Phase 0 harvest task** (`Harvest ceos1+ceos2 read-only state for Edge ACL+SNAT (FW-A3.3 R3)`, `## Harvested Allocations` block):

```json
[
  {"kind": "cidr", "cidr": "10.99.0.2/32", "device": "ceos1", "interface": "Loopback11", "source": "fetch_data getter=config retrieve=running (equiv: show running-config)"},
  {"kind": "cidr", "cidr": "10.99.0.13/32", "device": "ceos1", "interface": "Loopback12", "source": "fetch_data getter=config retrieve=running (equiv: show running-config)"},
  {"kind": "cidr", "cidr": "10.99.0.20/32", "device": "ceos1", "interface": "Loopback13", "source": "fetch_data getter=config retrieve=running (equiv: show running-config)"},
  {"kind": "cidr", "cidr": "10.99.0.3/32", "device": "ceos2", "interface": "Loopback11", "source": "fetch_data getter=config retrieve=running (equiv: show running-config)"},
  {"kind": "cidr", "cidr": "10.99.0.21/32", "device": "ceos2", "interface": "Loopback12", "source": "fetch_data getter=config retrieve=running (equiv: show running-config)"},
  {"kind": "cidr", "cidr": "10.99.0.30/32", "device": "ceos2", "interface": "Loopback13", "source": "fetch_data getter=config retrieve=running (equiv: show running-config)"},
  {"kind": "cidr", "cidr": "10.99.0.2/32", "device": "ceos1", "interface": "router bgp 65001 network statement", "source": "fetch_data getter=bgp_config (equiv: show run | section router bgp)"},
  {"kind": "cidr", "cidr": "10.99.0.13/32", "device": "ceos1", "interface": "router bgp 65001 network statement", "source": "fetch_data getter=bgp_config (equiv: show run | section router bgp)"},
  {"kind": "cidr", "cidr": "10.99.0.20/32", "device": "ceos1", "interface": "router bgp 65001 network statement", "source": "fetch_data getter=bgp_config (equiv: show run | section router bgp)"},
  {"kind": "cidr", "cidr": "10.99.0.3/32", "device": "ceos2", "interface": "router bgp 65002 network statement", "source": "fetch_data getter=bgp_config (equiv: show run | section router bgp)"},
  {"kind": "cidr", "cidr": "10.99.0.21/32", "device": "ceos2", "interface": "router bgp 65002 network statement", "source": "fetch_data getter=bgp_config (equiv: show run | section router bgp)"},
  {"kind": "cidr", "cidr": "10.99.0.30/32", "device": "ceos2", "interface": "router bgp 65002 network statement", "source": "fetch_data getter=bgp_config (equiv: show run | section router bgp)"},
  {"kind": "cidr", "cidr": "10.0.12.1/30", "device": "ceos1", "interface": "Ethernet1", "source": "fetch_data getter=interfaces_ip (equiv: show ip interface brief)"},
  {"kind": "cidr", "cidr": "10.0.12.2/30", "device": "ceos2", "interface": "Ethernet1", "source": "fetch_data getter=interfaces_ip (equiv: show ip interface brief)"},
  {"kind": "asn", "asn": "65001", "device": "ceos1", "source": "fetch_data getter=bgp_config (equiv: show run | section router bgp) — router bgp 65001"},
  {"kind": "asn", "asn": "65002", "device": "ceos1", "source": "fetch_data getter=bgp_config (equiv: show run | section router bgp) — neighbor 10.0.12.2 remote-as 65002"},
  {"kind": "asn", "asn": "65002", "device": "ceos2", "source": "fetch_data getter=bgp_config (equiv: show run | section router bgp) — router bgp 65002"},
  {"kind": "asn", "asn": "65001", "device": "ceos2", "source": "fetch_data getter=bgp_config (equiv: show run | section router bgp) — neighbor 10.0.12.1 remote-as 65001"}
]
```

**Quoted verbatim from the Phase 1 design task** (`Design Edge ACL+SNAT for FW-A3.3 R3 (ceos1)`, `## Derived Values` block):

```json
[
  {"kind": "cidr", "value": "10.99.0.0/31", "members": ["10.99.0.0/32", "10.99.0.1/32"]},
  {"kind": "asn", "value": "65001", "device": "ceos1"}
]
```

Confidence: 88 — Solid: every config block traces directly to the Phase 1 design's per-device change list, both required evidence blocks are quoted verbatim from their source tasks (harvest fetched and paged in full via read_more, not truncated), and all validation steps are scoped, literal, and counter-free. One flagged assumption: the exact literal output shape of `show ip access-lists`, `show ip nat translations`, and running-config `include`-filtered lines is based on standard Arista EOS CLI conventions, not device-verified against this specific cEOS build/version at check time.
