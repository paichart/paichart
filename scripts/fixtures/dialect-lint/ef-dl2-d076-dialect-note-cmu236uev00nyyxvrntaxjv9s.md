# Change Package: Two Independent Exporter Classes (telemetry, metrics) — ceos1/ceos2

## Pre-existing Allocations

*Quoted verbatim, unaugmented, from the Phase 0 harvest task (`<id-redacted------------>`, "Harvest current network state for two independent exporter classes on ceos1/ceos2"), `## Harvested Allocations` section of its `finalResponse`.*

```json
[
  {"kind": "cidr", "cidr": "10.99.0.1/32", "device": "ceos1", "interface": "Loopback11", "source": "show running-config"},
  {"kind": "cidr", "cidr": "10.99.0.26/32", "device": "ceos1", "interface": "Loopback12", "source": "show running-config"},
  {"kind": "cidr", "cidr": "10.99.0.29/32", "device": "ceos1", "interface": "Loopback13", "source": "show running-config"},
  {"kind": "cidr", "cidr": "10.99.0.2/32", "device": "ceos2", "interface": "Loopback11", "source": "show running-config"},
  {"kind": "cidr", "cidr": "10.99.0.4/32", "device": "ceos2", "interface": "Loopback12", "source": "show running-config"},
  {"kind": "cidr", "cidr": "10.99.0.24/32", "device": "ceos2", "interface": "Loopback13", "source": "show running-config"},
  {"kind": "cidr", "cidr": "10.0.12.1/30", "device": "ceos1", "interface": "Ethernet1", "source": "show running-config"},
  {"kind": "cidr", "cidr": "10.0.12.2/30", "device": "ceos2", "interface": "Ethernet1", "source": "show running-config"},
  {"kind": "cidr", "cidr": "172.30.30.11/24", "device": "ceos1", "interface": "Management0", "source": "show running-config"},
  {"kind": "cidr", "cidr": "172.30.30.12/24", "device": "ceos2", "interface": "Management0", "source": "show running-config"},
  {"kind": "asn", "asn": "65001", "device": "ceos1", "source": "show running-config (router bgp 65001)"},
  {"kind": "asn", "asn": "65002", "device": "ceos1", "source": "show running-config (neighbor 10.0.12.2 remote-as 65002)"},
  {"kind": "asn", "asn": "65002", "device": "ceos2", "source": "show running-config (router bgp 65002)"},
  {"kind": "asn", "asn": "65001", "device": "ceos2", "source": "show running-config (neighbor 10.0.12.1 remote-as 65001)"}
]
```

## Derived Values

*Quoted verbatim, unaugmented, from the Phase 1 Architect's design (`<id-redacted------------>`), `## Derived Values` section.*

```json
[
  {"kind": "cidr", "value": "10.99.0.30/31", "members": ["10.99.0.30/32", "10.99.0.31/32"]},
  {"kind": "cidr", "value": "10.99.0.40/31", "members": ["10.99.0.40/32", "10.99.0.41/32"]},
  {"kind": "asn", "value": "65001", "device": "ceos1"},
  {"kind": "asn", "value": "65002", "device": "ceos2"}
]
```

---

## Candidate Configuration — ceos1 (ASN 65001)

Dialect note: transcribed directly from the observed convention on ceos1's own harvested `show running-config` (Loopback11–13 use `description <class>-exporter` + `ip address <addr>/32`; `router bgp 65001` carries flat `network <prefix>/<len>` lines with no route-map/mask keyword) — no contract stanza template was supplied for this protocol, so the harvested device's own live pattern is the transcription source.

```
interface Loopback14
   description telemetry-exporter
   ip address 10.99.0.30/32
!
interface Loopback15
   description metrics-exporter
   ip address 10.99.0.40/32
!
router bgp 65001
   network 10.99.0.30/32
   network 10.99.0.40/32
```

## Candidate Configuration — ceos2 (ASN 65002)

```
interface Loopback14
   description telemetry-exporter
   ip address 10.99.0.31/32
!
interface Loopback15
   description metrics-exporter
   ip address 10.99.0.41/32
!
router bgp 65002
   network 10.99.0.31/32
   network 10.99.0.41/32
```

No changes to Ethernet1 (transit `/30`, out of scope), Ethernet2/3, Management0, existing Loopback11–13, or the `router bgp` ASNs themselves.

---

## Validation Steps

### ceos1 — config-committed checks (derived-literal: modeled on the harvest's own confirmed rendering convention for sibling loopbacks/BGP stanza on this device; substituting only the new interface number, description, address, and network lines)

```
show running-config section interfaces Loopback14
```
**Expected output (ceos1):**
```
interface Loopback14
   description telemetry-exporter
   ip address 10.99.0.30/32
```

```
show running-config section interfaces Loopback15
```
**Expected output (ceos1):**
```
interface Loopback15
   description metrics-exporter
   ip address 10.99.0.40/32
```

```
show running-config section bgp
```
**Expected output (ceos1) — assumes EOS preserves config-entry order in the stanza (as observed for the existing three lines, which appear in the same order they were configured per the harvest):**
```
router bgp 65001
   network 10.99.0.1/32
   network 10.99.0.26/32
   network 10.99.0.29/32
   network 10.99.0.30/32
   network 10.99.0.40/32
```
*Assumption flagged: strict line ORDER is inferred from EOS's typical entry-order display, not independently confirmed from a raw harvested stanza dump; if order differs, treat this as a set-membership check (all five lines present) rather than a literal-order failure.*

### ceos1 — operational checks (PRESENCE ASSERTION — no witnessed rendering available; Loopback14/15 and their advertisements have never existed on this device, so no prior rendering exists to quote, and post-change BGP attribute values are session-state-dependent, not derivable from declared config)

```
show ip interface brief
```
**Presence Assertion (ceos1):**
- Fields whose PRESENCE proves the change: a row for `Loopback14` with `Status = up`, `Protocol = up`; a row for `Loopback15` with `Status = up`, `Protocol = up`.
- Volatile fields excluded by name: none — `show ip interface brief` carries no counters/timers on this platform, but any `MTU`/`Owner` column value is excluded from the check (formatting-only).
- Reason no literal possible: these interfaces do not exist on the device yet; loopback up/up is expected EOS default behavior but has not been observed for these specific interfaces.

```
show ip bgp neighbors 10.0.12.2 advertised-routes
```
**Presence Assertion (ceos1):**
- Fields whose PRESENCE proves the change: the `Network` column contains an entry `10.99.0.30/32` and an entry `10.99.0.40/32`.
- Volatile fields excluded by name: `Path`, `Metric`, `LocPrf`, `Weight`, any `Up/Down`/uptime/timestamp column.
- Reason no literal possible: these prefixes have never been advertised by this device; next-hop/path attribute values depend on live eBGP session state, not on declared config.

### ceos2 — config-committed checks (derived-literal, same basis as ceos1)

```
show running-config section interfaces Loopback14
```
**Expected output (ceos2):**
```
interface Loopback14
   description telemetry-exporter
   ip address 10.99.0.31/32
```

```
show running-config section interfaces Loopback15
```
**Expected output (ceos2):**
```
interface Loopback15
   description metrics-exporter
   ip address 10.99.0.41/32
```

```
show running-config section bgp
```
**Expected output (ceos2) — same ordering assumption as ceos1:**
```
router bgp 65002
   network 10.99.0.2/32
   network 10.99.0.4/32
   network 10.99.0.24/32
   network 10.99.0.31/32
   network 10.99.0.41/32
```

### ceos2 — operational checks (PRESENCE ASSERTION, same basis as ceos1)

```
show ip interface brief
```
**Presence Assertion (ceos2):**
- Fields whose PRESENCE proves the change: a row for `Loopback14` with `Status = up`, `Protocol = up`; a row for `Loopback15` with `Status = up`, `Protocol = up`.
- Volatile fields excluded by name: none (no counters on this view); `MTU`/`Owner` excluded.
- Reason: interfaces do not yet exist; no prior rendering to quote.

```
show ip bgp neighbors 10.0.12.1 advertised-routes
```
**Presence Assertion (ceos2):**
- Fields whose PRESENCE proves the change: the `Network` column contains `10.99.0.31/32` and `10.99.0.41/32`.
- Volatile fields excluded by name: `Path`, `Metric`, `LocPrf`, `Weight`, uptime/timestamp columns.
- Reason: prefixes never previously advertised; attribute values are session-state-dependent.

---

## Rollback Plan

### ceos1
```
router bgp 65001
   no network 10.99.0.30/32
   no network 10.99.0.40/32
!
no interface Loopback14
no interface Loopback15
```

### ceos2
```
router bgp 65002
   no network 10.99.0.31/32
   no network 10.99.0.41/32
!
no interface Loopback14
no interface Loopback15
```

Rollback order is the reverse of apply order: remove `network` statements first (withdraws the advertisement cleanly before the underlying route disappears), then remove the loopback interfaces. Rollback restores exactly the 6-loopback / 3-network-statement-per-device baseline confirmed in the harvest — no other interface, ASN, or transit-link state is touched.

---

## Recommended Change Ordering

Per the Phase 1 design's dependency map (interface must exist before its `network` statement takes effect; the two devices are independent of each other):

1. `{ceos1: Loopback14, Loopback15}` ∥ `{ceos2: Loopback14, Loopback15}` — create both loopbacks on both devices (parallel-safe, no cross-device dependency).
2. `{ceos1: network 10.99.0.30/32, network 10.99.0.40/32}` ∥ `{ceos2: network 10.99.0.31/32, network 10.99.0.41/32}` — add BGP network statements only after step 1 completes on the same device.

Within a device, the telemetry and metrics changes are mutually independent and may be applied together or in either order.

## Apply-Governance / Maintenance-Window Note

**No maintenance window required.** Rationale: (1) new loopback interface creation does not affect any existing interface, including the `10.0.12.0/30` transit link, which is untouched and out of scope; (2) adding a `network` statement to an already-established `router bgp` process is a non-disruptive, incremental change on EOS — it does not reset or flap the eBGP session to the peer (`10.0.12.2` from ceos1 / `10.0.12.1` from ceos2), it only adds a new locally-originated prefix to the Adj-RIB-Out and triggers an incremental UPDATE; (3) no existing exporter loopback (Loopback11–13) or its advertisement is modified. Traffic impact while the change lands: none to existing sessions or prefixes. First post-apply check to run: the `show ip bgp neighbors <peer> advertised-routes` presence-assertion step for the newly added prefixes on the device just changed, before proceeding to the paired device.

## Persistence Statement

This change is **not** persistent by default. After the validation steps above confirm the change on each device, the operator must explicitly persist it, e.g.:
```
copy running-config startup-config
```
(equivalently `write memory`) on **both** ceos1 and ceos2. Until this is run, the added loopbacks and `network` statements exist only in running-config and will be lost on a reload/power-cycle of either device.

---

*Apply is a separate, human-gated step — this package is the candidate change plus its validation and rollback; no command in this package has been executed against ceos1 or ceos2.*

Confidence: 82 — Full harvest block was read and verified in its entirety (14/14 entries, no truncation loss); config transcription is grounded in the device's own observed running-config convention (loopback description pattern, flat `network` statement style). Two named assumptions: (1) EOS displaying the `router bgp` network-statement lines in configuration-entry order (inferred from the existing three appearing in ascending-IP/entry order in the harvest, not independently confirmed via a raw stanza dump); (2) loopback up/up default behavior is standard EOS behavior but unwitnessed for these specific new interfaces, hence presence-asserted rather than claimed as literal.