# Change Package: Fabric Telemetry Exporter Aggregate Advertisement

**Devices:** `ceos1` (AS 65001), `ceos2` (AS 65002) — cEOS (Arista EOS), single-link fabric
**Change type:** BGP host-route → aggregate summary migration (additive-then-withdraw)
**Applies to:** telemetry-exporter loopbacks only
**Apply status:** NOT APPLIED — this is an approved-but-unapplied change package. No mutating command has been run against any device by this pipeline.

---

## 🔑 Crossing Value — `telemetryExporterCoveringRange` (for exact downstream consumption)

> **`10.99.0.0/27`**

This is the smallest single CIDR covering every harvested telemetry-exporter loopback address across both fabric switches. Per the Program Interface Contract's `crossingValue.telemetryExporterCoveringRange`, pipelines 2 (kubernetes-gitops), 3 (terraform-iac), and 4 (observability-config) **must consume this value exactly as published above** — never recomputed, never widened, never guessed.

**Harvested addresses covered** (6 loopbacks, both devices):

| Device | Interface | Address |
|---|---|---|
| ceos1 | Loopback11 | 10.99.0.1/32 |
| ceos1 | Loopback12 | 10.99.0.26/32 |
| ceos1 | Loopback13 | 10.99.0.29/32 |
| ceos2 | Loopback11 | 10.99.0.2/32 |
| ceos2 | Loopback12 | 10.99.0.4/32 |
| ceos2 | Loopback13 | 10.99.0.24/32 |

**Derivation reasoning (from Phase 1 design, arithmetic not eye-inspection):** last-octet pool {1, 2, 4, 24, 26, 29}. XOR of min/max (1, 29) → highest differing bit at position 4 → 5 host bits → `/27`. Tighter `/28` was tested and rejected (16-address blocks `[0–15]`/`[16–31]` split the pool {1,2,4} vs {24,26,29} — no single `/28` covers all six). `/27` = `10.99.0.0/27` (`.0`–`.31`) contains all six addresses and only those six as declared `members`. Full containment table and derivation are reproduced verbatim below.

---

## Pre-existing Allocations
*(quoted verbatim from the Phase 0 harvest, as carried by the Phase 1 design — not retyped, not augmented)*

### Harvested Allocations
```json
[
  {"kind": "cidr", "cidr": "10.99.0.1/32", "device": "ceos1", "interface": "Loopback11", "source": "fetch_data(getters=[interfaces_ip], filter_name=ceos1)"},
  {"kind": "cidr", "cidr": "10.99.0.26/32", "device": "ceos1", "interface": "Loopback12", "source": "fetch_data(getters=[interfaces_ip], filter_name=ceos1)"},
  {"kind": "cidr", "cidr": "10.99.0.29/32", "device": "ceos1", "interface": "Loopback13", "source": "fetch_data(getters=[interfaces_ip], filter_name=ceos1)"},
  {"kind": "cidr", "cidr": "10.99.0.2/32", "device": "ceos2", "interface": "Loopback11", "source": "fetch_data(getters=[interfaces_ip], filter_name=ceos2)"},
  {"kind": "cidr", "cidr": "10.99.0.4/32", "device": "ceos2", "interface": "Loopback12", "source": "fetch_data(getters=[interfaces_ip], filter_name=ceos2)"},
  {"kind": "cidr", "cidr": "10.99.0.24/32", "device": "ceos2", "interface": "Loopback13", "source": "fetch_data(getters=[interfaces_ip], filter_name=ceos2)"},
  {"kind": "asn", "asn": "65001", "device": "ceos1", "source": "fetch_data(getters=[bgp_config], filter_name=ceos1)"},
  {"kind": "asn", "asn": "65002", "device": "ceos1", "source": "fetch_data(getters=[bgp_config], filter_name=ceos1) — neighbor 10.0.12.2 remote_as"},
  {"kind": "asn", "asn": "65002", "device": "ceos2", "source": "fetch_data(getters=[bgp_config], filter_name=ceos2)"},
  {"kind": "asn", "asn": "65001", "device": "ceos2", "source": "fetch_data(getters=[bgp_config], filter_name=ceos2) — neighbor 10.0.12.1 remote_as"}
]
```
Source: Phase 0 harvest task (Network State Harvester), quoted verbatim via the Phase 1 design's "Pre-existing Allocations" section.

## Derived Values
```json
[
  {"kind": "cidr", "value": "10.99.0.0/27", "members": ["10.99.0.1/32", "10.99.0.2/32", "10.99.0.4/32", "10.99.0.24/32", "10.99.0.26/32", "10.99.0.29/32"]},
  {"kind": "asn", "value": "65001", "device": "ceos1"},
  {"kind": "asn", "value": "65002", "device": "ceos2"}
]
```

---

## (a) Per-Device Candidate Configuration

### `ceos1` (AS 65001, eBGP peer `10.0.12.2` = ceos2/AS65002)

**Step 1 — Add aggregate (additive, non-disruptive, parallel-safe with ceos2):**
```
router bgp 65001
   aggregate-address 10.99.0.0/27 summary-only
```

**Step 2 — Withdraw host-route origination — ⚠️ NAMED GAP, operator-confirm-at-apply:**
The Phase 0 harvest's `bgp_config` getter returned local-AS and neighbor remote-AS only — it did **not** capture which mechanism currently originates `10.99.0.1/32`, `10.99.0.26/32`, `10.99.0.29/32` into BGP (explicit `network` statements vs. `redistribute connected` + route-map/prefix-list). This is carried forward from the Phase 1 design unchanged, not resolved here — the literal removal command cannot be stated as observed fact without fabricating device config.

**MANDATORY pre-change capture (required before Step 2, and is itself the rollback source):**
```
show running-config section router bgp
```
Run this on `ceos1` and save the verbatim output before any change. It is both (i) the authoritative source for which of the candidates below applies, and (ii) the rollback baseline.

```
! Candidate A — if origination is via explicit `network` statements:
router bgp 65001
   no network 10.99.0.1/32
   no network 10.99.0.26/32
   no network 10.99.0.29/32

! Candidate B — if origination is via `redistribute connected` + route-map/prefix-list:
! Exact route-map/prefix-list name was not observed. Operator must identify the specific
! permit entries matching these three loopbacks and remove/exclude ONLY those — do not
! remove `redistribute connected` wholesale if other prefixes depend on it.
```
Apply only the candidate confirmed by the pre-change capture. Do not guess.

### `ceos2` (AS 65002, eBGP peer `10.0.12.1` = ceos1/AS65001) — mirrored

**Step 1 — Add aggregate:**
```
router bgp 65002
   aggregate-address 10.99.0.0/27 summary-only
```

**Step 2 — Withdraw host-route origination — same named gap as ceos1:**
```
show running-config section router bgp
```
(run on `ceos2`, save verbatim, before any change)

```
! Candidate A:
router bgp 65002
   no network 10.99.0.2/32
   no network 10.99.0.4/32
   no network 10.99.0.24/32

! Candidate B — redistribute/route-map form: identify and remove/exclude only the
! matching permit entries for these three loopbacks, as above.
```

---

## (b) Deterministic Validation Steps

None of the following post-change renderings have ever been observed on these devices (today only the 6 discrete `/32`s are advertised; the aggregate does not yet exist). Per the unwitnessed-rendering rule, each step uses the **presence/absence assertion shape** — naming exactly what to check, never a predicted literal.

### V1 — Stage-1 coexistence check (after Step 1 on BOTH devices, BEFORE any withdrawal)

**ceos1:**
```
show ip bgp neighbors 10.0.12.2 advertised-routes
```
**Presence check (`ceos1`, no literal possible — first time this state has existed):**
- Fields whose PRESENCE proves the property: a route entry for network `10.99.0.0/27`, AND route entries for `10.99.0.1/32`, `10.99.0.26/32`, `10.99.0.29/32` — all four present simultaneously in the same advertised-routes table.
- Volatile fields excluded by name: `Last update`/uptime column, `Weight`, `Metric` numeric values, any timer counters.
- Why no literal possible: this device has never simultaneously advertised the aggregate alongside the three host routes — no rendering of this combined state has ever been captured.

**ceos2 (mirror):**
```
show ip bgp neighbors 10.0.12.1 advertised-routes
```
- Presence: `10.99.0.0/27`, `10.99.0.2/32`, `10.99.0.4/32`, `10.99.0.24/32` all present together.
- Volatile fields excluded: same as above.
- Why no literal possible: same as above.

**Gate:** Do not proceed to withdrawal on either device until V1 passes on **both**.

### V2 — Stage-2 post-withdrawal check (sequential: ceos1 first, then ceos2 — one device at a time)

**ceos1, after its Step 2:**
```
show ip bgp neighbors 10.0.12.2 advertised-routes
```
- PRESENCE required: `10.99.0.0/27` still present.
- ABSENCE required: `10.99.0.1/32`, `10.99.0.26/32`, `10.99.0.29/32` no longer appear in the table.
- Volatile fields excluded: same as V1.
- Why no literal possible: post-withdrawal rendering has never been observed — withdrawal has not yet occurred on this device.

**ceos2, after its Step 2 (only run once ceos1's V2 has passed):**
```
show ip bgp neighbors 10.0.12.1 advertised-routes
```
- PRESENCE required: `10.99.0.0/27` still present.
- ABSENCE required: `10.99.0.2/32`, `10.99.0.4/32`, `10.99.0.24/32` no longer appear.
- Volatile fields excluded: same as V1.
- Why no literal possible: same as V1's rationale, applied to ceos2.

---

## (c) Rollback Plan (per device)

Rollback source is the **mandatory pre-change capture** (`show running-config section router bgp`, saved verbatim before Step 2) — this is the only way to restore the *exact* prior origination form without fabricating it.

**ceos1:**
```
router bgp 65001
   no aggregate-address 10.99.0.0/27 summary-only
```
followed by re-applying, verbatim, whichever origination lines the pre-change capture showed (Candidate A `network` statements, or the original `redistribute connected`/route-map entries for Candidate B) — copy-paste from the saved capture, do not retype from memory.

**ceos2:** mirror — `no aggregate-address 10.99.0.0/27 summary-only` under `router bgp 65002`, then restore the captured original origination lines for its three loopbacks.

**Rollback trigger:** any failure of V1 (aggregate not advertised) blocks progression, no rollback needed (nothing withdrawn yet — just re-check Step 1 config). Any failure of V2 (host routes did not withdraw cleanly, or peer stops receiving reachability) triggers immediate rollback on the affected device only.

---

## (d) Change Ordering, Apply-Governance Note, and Persistence

**Ordering (from Phase 1 design, unchanged):**
1. Add aggregate on `ceos1` AND `ceos2` — parallel-safe, no cross-device dependency (each is a local additive change).
2. Run **V1** on both devices — confirm coexistence (aggregate + all 6 host routes present).
3. Withdraw host-route origination **sequentially, one device at a time**: `ceos1` first, run **V2** on `ceos1`, confirm pass, **then** `ceos2`, run **V2** on `ceos2`.
4. Do not combine add+withdraw in a single step per device — add → verify → remove, strictly in that order.

**Apply-governance note (maintenance-window form, per active protocol):**
- **Operationally requires:** a config-session change on each device (`aggregate-address` addition is a soft, additive BGP config change — EOS does not require a session reset or process restart for it). Step 2 origination removal is also a soft config change under the same session, provided the correct candidate is used.
- **Traffic impact while running:** NONE during Step 1 (aggregate coexists with host routes — dual advertisement, no loss). Step 2 carries transient risk **only if executed out of order or simultaneously on both devices** — the staged, single-link topology means each device's 3 exporters lose no reachability as long as V1 has confirmed the aggregate is live and received by the peer before that device's host routes are withdrawn.
- **Reconvergence:** none expected at the IGP/session level — this is a single eBGP session per device pair, aggregate-address triggers a normal incremental BGP UPDATE, not a session reset. No neighbor flap anticipated.
- **First post-apply check:** V1 (Stage-1 coexistence) on both devices, before any withdrawal is attempted.
- **Window classification:** LOW-RISK, no-outage-expected change — recommend a standard (not emergency/extended-outage) change window, with the operator present to run V1/V2 between steps and execute rollback immediately if either check fails to pass as specified.

**Persistence statement (explicit, required):**
```
write memory
```
Run `write memory` on each device **only after** that device's V2 has passed — i.e., persist ceos1 only after ceos1's V2 passes, persist ceos2 only after ceos2's V2 passes. Do not persist before validation; if rollback is triggered pre-persistence, the running-config reverts on session/device restart with no startup-config cleanup needed.

---

## Named Gaps Carried Forward (not fabricated)

1. **Host-route origination mechanism** (both devices) — not captured by the Phase 0 harvest scope (`bgp_config` getter returned ASN/neighbor data only). Authored as an operator-confirm-at-apply step via mandatory pre-change `show running-config section router bgp` capture, with two candidate removal forms provided. Do not apply either candidate without first confirming which is live.
2. **Platform dialect confirmation** — the Program Interface Contract's `platformDialect` block is marked `NOT APPLICABLE` (no canonical stanza/forbidden-token list supplied for any of the four program legs). The `aggregate-address ... summary-only` and `router bgp` syntax above is standard Arista EOS CLI, consistent with the `ceos1`/`ceos2` device family confirmed by the harvest's `fetch_data` calls, but was not verified token-by-token against a contract-supplied canonical stanza because none exists. Reviewer should note this as ACCEPTED-FROM-PLATFORM-CONVENTION, not contract-verified.

Confidence: 82 — Solid: the derived range, harvested allocations, and per-device change list are carried forward verbatim from a design that passed two independent arithmetic checks and full containment verification. Held back from higher because (1) the host-route origination mechanism remains an explicit, unresolved gap requiring operator confirmation at apply time, and (2) no canonical platform-dialect stanza was available in the contract to mechanically verify the EOS syntax against, so dialect correctness rests on device-family convention rather than contract transcription.