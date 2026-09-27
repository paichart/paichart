```
## Change Package: P4 OSPF Process Removal — IGP-T1 R18 (2-node: ceos1, ceos2)
```

**Provenance:** Rollback and baseline-diff content below is quoted **verbatim** from the Phase 0 harvest (task `<id-redacted------------>`, "Harvest current network state for P4 OSPF removal (IGP-T1 R18, 2-node)", `finalResponse` §1 Full Running Config, §2 IS-IS Operational State, §3 RIB). No reconstruction or paraphrase of harvested config text was performed. Design basis: Phase 1 "Design P4 OSPF removal" (confidence 92/100).

**⚠️ THIS IS A CHANGE TO BE APPLIED — NOT AN APPLIED CHANGE.** Apply is a separate, human-gated step performed by an operator (CLI/Ansible/NAPALM) outside this pipeline. No command in this package has been executed against any device.

---

## 1. Candidate Configuration — Removal Commands

### 1.1 ceos1

```
no router ospf 1
!
interface Ethernet1
   no ip ospf cost 10
   no ip ospf network point-to-point
```

### 1.2 ceos2

```
no router ospf 1
!
interface Ethernet1
   no ip ospf cost 10
   no ip ospf network point-to-point
```

**Scope confirmation:** these are the only lines touched. No `isis`, `ip address`, `description`, AAA/SNMP, or management-plane lines are modified on either device (per Phase 1 design §4 cross-check).

---

## 2. Validation Steps

Run **Step 1 (ceos1)** to completion, validate, then **Step 2 (ceos2)**, validate. Both devices carry zero installed OSPF routes throughout (Phase 0 finding), so the sequence has no traffic-impact ordering dependency — sequencing below is retained for audit attribution only.

### 2.1 Step 1 — after removal on ceos1

**2.1.a — OSPF process absent from running-config (ceos1)**

*Shape: presence/absence assertion — no post-removal rendering of this command on this device has ever been captured (OSPF removal has not occurred before this run), and the harvest's only literal capture was the full `show running-config` with OSPF present. `show running-config section <regex>` is a text-filter whose defined behavior on zero matching blocks is zero output — this is a structural property of the filter, not a predicted device-specific value.*

```
show running-config section ospf
```
**Expected output (ceos1):**
```
(no output — zero lines returned)
```

**2.1.b — OSPF interface sub-commands absent from Ethernet1 (ceos1)**

*Shape: operator-captured baseline diff — the Phase 0 harvest captured this exact interface stanza verbatim (quoted in §4.1 below). The two `ip ospf` lines are the ONLY lines this removal targets; EOS interface config is a verbatim echo of stored line-based sub-commands (no expansion/transformation), so removing exactly those two lines from the witnessed baseline, with nothing else touched, is a derived — not predicted — literal.*

```
show running-config interfaces Ethernet1
```
**Expected output (ceos1):**
```
interface Ethernet1
   description to-ceos2 (ospf cost 10)
   no switchport
   ip address 10.0.12.1/30
   isis enable 1
   isis metric 10
   isis network point-to-point
```

**2.1.c — No OSPF-sourced routes in RIB (ceos1)**

*Shape: witnessed continuity claim — harvest §3 captured this command returning empty pre-removal already (OSPF was contributing zero installed routes even while the process existed). Post-removal expectation is unchanged from that witnessed baseline — no regression, not a novel prediction.*

```
show ip route ospf
```
**Expected output (ceos1):**
```
(no output — zero routes, unchanged from Phase 0 pre-removal baseline)
```

**2.1.d — IS-IS route set unchanged (ceos1, installed routes)**

*Shape: witnessed baseline, harvest vs. harvest — quoted literally from Phase 0 harvest §3, which captured this exact command's raw output pre-removal.*

```
show ip route isis
```
**Expected output (ceos1):**
```
I L2  2.2.2.2/32 [90/20] via 10.0.12.2, Ethernet1
```

**2.1.e — IS-IS adjacency unaffected (ceos1)**

*Shape: presence assertion. The Phase 0 harvest captured only a paraphrased summary of this command's output (device, interface, state, hold timer, circuit id as prose/table), never the literal raw CLI rendering — so no literal column-formatted output can be quoted without fabricating format. Holdtime and Circuit Id are additionally volatile (they change on every timer tick / adjacency event) and are excluded by name.*

```
show isis neighbor
```
**Fields whose PRESENCE proves the property (ceos1):** a row naming System Id/hostname `ceos2`, Interface `Ethernet1`, Type `L2`, State `Up`.
**Volatile fields excluded by name (not part of this check):** Holdtime, Circuit Id, SNPA.
**Why no literal:** no raw literal rendering of this command was ever captured (harvest paraphrased it); a fabricated column layout would be a prediction, not a fact.

---

### 2.2 Step 2 — after removal on ceos2

**2.2.a — OSPF process absent from running-config (ceos2)**
```
show running-config section ospf
```
**Expected output (ceos2):**
```
(no output — zero lines returned)
```

**2.2.b — OSPF interface sub-commands absent from Ethernet1 (ceos2)**

*Same baseline-diff basis as 2.1.b, against ceos2's harvested stanza (§4.2 below).*
```
show running-config interfaces Ethernet1
```
**Expected output (ceos2):**
```
interface Ethernet1
   description to-ceos1 (ospf cost 10)
   no switchport
   ip address 10.0.12.2/30
   isis enable 1
   isis metric 10
   isis network point-to-point
```

**2.2.c — No OSPF-sourced routes in RIB (ceos2)**
```
show ip route ospf
```
**Expected output (ceos2):**
```
(no output — zero routes, unchanged from Phase 0 pre-removal baseline)
```

**2.2.d — IS-IS route set unchanged (ceos2, installed routes)**

*Witnessed baseline, quoted verbatim from Phase 0 harvest §3.*
```
show ip route isis
```
**Expected output (ceos2):**
```
I L2  1.1.1.1/32 [90/20] via 10.0.12.1, Ethernet1
```

**2.2.e — IS-IS adjacency unaffected (ceos2)**

*Presence assertion, same basis as 2.1.e.*
```
show isis neighbor
```
**Fields whose PRESENCE proves the property (ceos2):** a row naming System Id/hostname `ceos1`, Interface `Ethernet1`, Type `L2`, State `Up`.
**Volatile fields excluded by name (not part of this check):** Holdtime, Circuit Id, SNPA.
**Why no literal:** no raw literal rendering of this command was ever captured (harvest paraphrased it); a fabricated column layout would be a prediction, not a fact.

---

## 3. Findings note carried forward

Per Phase 0 harvest §4 finding (confirmed operative pre-condition): IS-IS AD 90 is already beating OSPF AD 110 on both devices, so OSPF contributes **zero installed routes today**. Steps 2.1.c/2.2.c are therefore continuity checks (no visible delta expected), not before/after diffs — consistent with the harvest's and Phase 1 design's explicit framing of this removal as RIB-inert.

---

## 4. Rollback Plan

**Rollback trigger:** any validation step in §2 fails, or an unplanned adverse effect is observed post-removal.

**Rollback config — EMBEDDED VERBATIM from the Phase 0 harvest's live running-config capture** (quoted directly, not reconstructed):

### 4.1 ceos1 rollback (re-add)
```
router ospf 1
   router-id 1.1.1.1
   passive-interface Loopback0
   network 1.1.1.1/32 area 0.0.0.0
   network 10.0.12.0/30 area 0.0.0.0
   max-lsa 12000
!
interface Ethernet1
   ip ospf cost 10
   ip ospf network point-to-point
```

### 4.2 ceos2 rollback (re-add)
```
router ospf 1
   router-id 2.2.2.2
   passive-interface Loopback0
   network 2.2.2.2/32 area 0.0.0.0
   network 10.0.12.0/30 area 0.0.0.0
   max-lsa 12000
!
interface Ethernet1
   ip ospf cost 10
   ip ospf network point-to-point
```

**Rollback ordering:** inconsequential (mirrors §2 ordering rationale — no traffic-carrying window to protect in either direction). Re-apply on whichever device was rolled back last, or both simultaneously.

**Rollback validation:** re-run §2.1.a/2.2.a (`show running-config section ospf`) and expect the `router ospf 1` block above to reappear verbatim; re-run `show ip ospf neighbor` and expect the FULL adjacency (harvest §4: "ceos1↔ceos2 FULL both directions") to re-establish within the OSPF dead-interval (harvest flags this as "up to default 40s, no BFD observed" — not device-confirmed as a specific timer value).

---

## 5. Change Ordering & Maintenance Window

| Order | Action | Expected impact |
|---|---|---|
| 1 | Apply §1.1 to ceos1; run §2.1.a–e | No RIB impact (OSPF already contributes zero routes). ceos2's OSPF adjacency to ceos1 will decay over the OSPF dead-interval (not device-confirmed; harvest observed no BFD, so expect a hold-timer-based teardown, default up to 40s) — this is an expected, harmless side effect, not a failure signal. |
| 2 | Apply §1.2 to ceos2; run §2.2.a–e | OSPF fully absent from both devices; no OSPF adjacency exists anywhere. IS-IS adjacency and installed routes unaffected throughout (confirmed unaffected in both steps above). |

**Maintenance window:** Low-risk change (zero-RIB-impact removal per Phase 0/1 finding); a standard low-traffic change window is still recommended out of caution for the transient OSPF-adjacency teardown on ceos2's side in step 1, even though no forwarding-plane effect is expected. No alternate path exists on this 2-node topology, so this is a corroborating-evidence window, not a risk-mitigation one.

---

## 6. Persistence

**Explicit decision: persistence IS included in this package.**

After **both** devices pass all validation steps in §2:

```
copy running-config startup-config
```

Run on **ceos1** and **ceos2** individually, only after their respective §2.1/§2.2 checks pass. This is stated explicitly per protocol requirement — a change left running-config-only is one reboot away from silently reverting to the OSPF-present state, which would re-introduce a redundant routing process without any operator awareness. If the operator instead decides to hold this running-config-only pending further validation, that is a deviation from this package's default and must be logged as such at apply time.

---

## 7. Apply Statement

This package is a **change to be applied**, never an applied change. No command listed above has been executed against ceos1 or ceos2. Apply (candidate config push, validation-step execution, and persistence) is a separate, human-gated step performed by an operator or a deterministic applier (Ansible/NAPALM/Nornir) outside this pipeline, using this document as its sole input.

Confidence: 88 — Solid: rollback config is quoted verbatim from a directly-retrieved Phase 0 harvest artifact, removal commands transcribe the design's confirmed footprint exactly, and every literal validation expectation is either a witnessed harvest quote, a derived baseline-diff, or an explicit presence assertion with named volatile-field exclusions (no fabricated renderings). Two named gaps: (1) the OSPF dead-interval teardown timing on ceos2 during the transient window is stated as "up to default 40s, not device-confirmed" per the Phase 1 design — no explicit dead-timer value was harvested; (2) the persistence decision (include `copy running-config startup-config`) is this Author's explicit choice per protocol requirement, not a value carried from Phase 0/1, since neither harvest nor design resolved it.