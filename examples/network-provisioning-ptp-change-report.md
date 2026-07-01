# Network Provisioning — Change Report
## PTP Boundary-Clock Time Sync · Meridian Capital HFT Fabric

> **Source:** pAIchart network-provisioning pipeline, 2026-07-01.
> **POV:** Meridian Capital — Ultra-Low-Latency Arista 7130 Trading Fabric Implementation
> **Pipeline task:** `cmque7cws002myxg4raocb6kd` · pipeline 90/100 · Reviewer **APPROVED 92/100**
> **Device:** harvested **live, read-only** from a 2-node Arista cEOS lab (ceos1/ceos2, EOS 4.32.2.1F).
> **Companion to** [`network-provisioning-change-report.md`](./network-provisioning-change-report.md) — a **second** network example, this one a **PTP boundary-clock timing** change (not addressing/routing). It was designed against the switches' **already-modified** running state (the Loopback0+BGP change from the companion example, applied on the devices), so the Appendix shows the real evolved config the pipeline harvested and designed against.
> **Status:** APPROVED CHANGE PACKAGE — **not applied**. Apply is out-of-band and human-gated.

---

Now I'll author the complete change package. Based on the Phase 1 design provided in the Pipeline Context (§6), I have all the required information: the target PTP design (ceos1 as GM, ceos2 as slave), the per-device configuration, the ordering map, and the harvested current state. I'll now produce the deliverable.

---

## PTP Boundary-Clock Time Sync — Change Package

### Executive Summary

This change package establishes synchronized, traceable timing across the 2-node Arista cEOS trading-fabric via PTP boundary-clock mode. **ceos1** becomes the Grandmaster (GM) with priority1=128; **ceos2** becomes a Slave Boundary-Clock with priority1=129, synchronizing via Ethernet1 (the fabric link). The design uses IEEE 802.1AS-2020 profile, domain 0, sync interval -4 (16 ms), and one-step clock enabled for sub-microsecond jitter. **This is a change package to be applied out-of-band; no device mutation occurs in this pipeline.**

---

## (a) PER-DEVICE CANDIDATE CONFIGURATION BLOCKS

### Device 1: ceos1 (Grandmaster Boundary-Clock)

**Current State (from Phase 0 harvest):**
- EOS 4.32.2.1F
- Ethernet1: UP, 10.0.12.1/30 (to ceos2)
- Loopback0: UP, 1.1.1.1/32
- Management0: UP, 172.30.30.11/24
- **PTP: Greenfield (no existing config)**

**Target Configuration Block:**

```
! ============================================================================
! ceos1 — PTP Grandmaster Boundary-Clock Configuration
! ============================================================================

ptp clock-identity 00:11:22:33:44:55:66:77
ptp priority1 128
ptp priority2 128
ptp clock-class 6
ptp clock-accuracy 0x20
ptp domain 0
ptp announce-interval -3
ptp sync-interval -4
ptp delay-req-interval -4
ptp one-step true
ptp profile ieee802.1as

interface Ethernet1
   ptp port 1 role master

! ============================================================================
! Rationale:
! - Clock-identity: Unique 8-octet identifier for ceos1 in the PTP domain
! - Priority1=128, Priority2=128: Ensures ceos1 wins GM election (best priority)
! - Clock-class 6: Locked to a primary reference clock (suitable for GNSS/PRTC)
! - Clock-accuracy 0x20: Microsecond-range accuracy (appropriate for HFT)
! - Domain 0: Standard domain for trading applications
! - Announce-interval -3: 8-second announcement period (stable, low overhead)
! - Sync-interval -4: 16 ms sync period (tight sync for low-latency trading)
! - Delay-req-interval -4: 16 ms delay-request period (matches sync for symmetry)
! - One-step true: Eliminates follow-up messages, reducing latency
! - Profile ieee802.1as: Layer 2 Ethernet, deterministic, sub-microsecond jitter
! - Ethernet1 as master port: Transmits sync to ceos2 via the fabric link
! ============================================================================
```

---

### Device 2: ceos2 (Slave Boundary-Clock)

**Current State (from Phase 0 harvest):**
- EOS 4.32.2.1F
- Ethernet1: UP, 10.0.12.2/30 (to ceos1)
- Loopback0: UP, 2.2.2.2/32
- Management0: UP, 172.30.30.12/24
- **PTP: Greenfield (no existing config)**

**Target Configuration Block:**

```
! ============================================================================
! ceos2 — PTP Slave Boundary-Clock Configuration
! ============================================================================

ptp clock-identity 00:11:22:33:44:55:66:88
ptp priority1 129
ptp priority2 129
ptp clock-class 7
ptp clock-accuracy 0x21
ptp domain 0
ptp announce-interval -3
ptp sync-interval -4
ptp delay-req-interval -4
ptp one-step true
ptp profile ieee802.1as

interface Ethernet1
   ptp port 1 role slave

! ============================================================================
! Rationale:
! - Clock-identity: Unique 8-octet identifier for ceos2 in the PTP domain
! - Priority1=129, Priority2=129: Ensures ceos2 does NOT become GM (worse priority)
! - Clock-class 7: Locked to a boundary-clock (appropriate for a slave BC)
! - Clock-accuracy 0x21: Slightly degraded from ceos1 (slave inherits GM's accuracy)
! - Domain 0: Matches ceos1 domain (required for synchronization)
! - Announce-interval -3: 8-second announcement period (matches ceos1)
! - Sync-interval -4: 16 ms sync period (matches ceos1)
! - Delay-req-interval -4: 16 ms delay-request period (matches ceos1)
! - One-step true: Matches ceos1 (consistent messaging behavior)
! - Profile ieee802.1as: Matches ceos1 (required for interoperability)
! - Ethernet1 as slave port: Receives sync from ceos1 via the fabric link
! ============================================================================
```

---

## (b) DETERMINISTIC VALIDATION STEPS

Each validation step is a **runnable command** with **expected output** that proves the change succeeded. These are FACTS the out-of-band apply step will execute, not prose verdicts.

### Validation Step 1: Verify ceos1 is Grandmaster

**Command (on ceos1):**
```
show ptp clock
```

**Expected Output:**
```
PTP Clock Information:
  Clock ID: 00:11:22:33:44:55:66:77
  Clock Class: 6
  Clock Accuracy: 0x20
  Domain: 0
  Priority1: 128
  Priority2: 128
  Grandmaster ID: 00:11:22:33:44:55:66:77
  Grandmaster Class: 6
  Grandmaster Accuracy: 0x20
  Grandmaster Priority1: 128
  Grandmaster Priority2: 128
  Time Source: ATOMIC_CLOCK (or GNSS if external source is configured)
  Steps Removed: 0
  Offset from Master: 0 ns (or < 100 ns)
```

**Interpretation:** ceos1 is the GM (Grandmaster ID matches its own Clock ID), clock class 6 is locked, steps removed = 0 confirms it is the root of the timing hierarchy.

---

### Validation Step 2: Verify ceos2 is Slave and Locked to ceos1

**Command (on ceos2):**
```
show ptp clock
```

**Expected Output:**
```
PTP Clock Information:
  Clock ID: 00:11:22:33:44:55:66:88
  Clock Class: 7
  Clock Accuracy: 0x21
  Domain: 0
  Priority1: 129
  Priority2: 129
  Grandmaster ID: 00:11:22:33:44:55:66:77
  Grandmaster Class: 6
  Grandmaster Accuracy: 0x20
  Grandmaster Priority1: 128
  Grandmaster Priority2: 128
  Time Source: PTP
  Steps Removed: 1
  Offset from Master: < 1000 ns (target: < 500 ns for HFT)
```

**Interpretation:** ceos2's Grandmaster ID matches ceos1's Clock ID (locked to correct master), clock class 7 is locked to BC, steps removed = 1 confirms it is one hop from the GM, offset < 1 μs confirms synchronization is achieved.

---

### Validation Step 3: Verify ceos1 Ethernet1 is Master Port

**Command (on ceos1):**
```
show ptp port
```

**Expected Output:**
```
PTP Port Information:
  Port: Ethernet1
  Port State: MASTER
  Port Role: Master
  Port Number: 1
  Sync Interval: -4 (16 ms)
  Announce Interval: -3 (8 seconds)
  Delay Request Interval: -4 (16 ms)
  One Step: true
  Peer Delay: 0 ns (or < 100 ns)
  Mean Path Delay: 0 ns (or < 100 ns)
```

**Interpretation:** Ethernet1 is in MASTER state, transmitting sync messages at 16 ms intervals, one-step enabled, path delay is minimal (expected for a direct link).

---

### Validation Step 4: Verify ceos2 Ethernet1 is Slave Port

**Command (on ceos2):**
```
show ptp port
```

**Expected Output:**
```
PTP Port Information:
  Port: Ethernet1
  Port State: SLAVE
  Port Role: Slave
  Port Number: 1
  Sync Interval: -4 (16 ms)
  Announce Interval: -3 (8 seconds)
  Delay Request Interval: -4 (16 ms)
  One Step: true
  Peer Delay: < 100 ns
  Mean Path Delay: < 100 ns
```

**Interpretation:** Ethernet1 is in SLAVE state, receiving sync messages at 16 ms intervals, path delay is minimal (expected for a direct link).

---

### Validation Step 5: Verify PTP Parent (Master) on ceos2

**Command (on ceos2):**
```
show ptp parent
```

**Expected Output:**
```
PTP Parent Information:
  Grandmaster ID: 00:11:22:33:44:55:66:77
  Grandmaster Class: 6
  Grandmaster Accuracy: 0x20
  Grandmaster Priority1: 128
  Grandmaster Priority2: 128
  Parent Port: Ethernet1
  Parent Port State: SLAVE
  Offset from Master: < 1000 ns
  Mean Path Delay: < 100 ns
  Steps Removed: 1
```

**Interpretation:** ceos2's parent (master) is ceos1 (Grandmaster ID matches), reachable via Ethernet1, offset < 1 μs confirms tight synchronization.

---

### Validation Step 6: Verify No Timing Hierarchy Flap (Monitor for 60 seconds)

**Command (on both ceos1 and ceos2, run for 60 seconds post-change):**
```
show ptp clock | grep "Grandmaster ID"
show ptp clock | grep "Steps Removed"
show ptp clock | grep "Offset from Master"
```

**Expected Output (repeated every 5 seconds for 60 seconds):**
```
ceos1:
  Grandmaster ID: 00:11:22:33:44:55:66:77 (consistent, no change)
  Steps Removed: 0 (consistent, no change)
  Offset from Master: 0 ns (consistent, no flap)

ceos2:
  Grandmaster ID: 00:11:22:33:44:55:66:77 (consistent, no change)
  Steps Removed: 1 (consistent, no change)
  Offset from Master: < 1000 ns (stable, no oscillation)
```

**Interpretation:** No GM election flap, no transient loss of sync, timing hierarchy is stable. If any value changes during the 60-second window, the change has introduced instability and rollback is required.

---

## (c) ROLLBACK PLAN

If validation fails or timing instability is detected, restore both devices to their pre-change greenfield state (no PTP configuration).

### Rollback for ceos1

**Commands (in order):**

```
! Remove PTP configuration from ceos1
configure
no ptp clock-identity
no ptp priority1
no ptp priority2
no ptp clock-class
no ptp clock-accuracy
no ptp domain
no ptp announce-interval
no ptp sync-interval
no ptp delay-req-interval
no ptp one-step
no ptp profile

interface Ethernet1
   no ptp port 1 role master

end
write memory
```

**Verification (post-rollback):**
```
show ptp clock
! Expected: "PTP is not configured" or empty output
show ptp port
! Expected: "PTP is not configured" or empty output
```

**Rationale:** Removes all PTP configuration from ceos1, returning it to greenfield state. Ethernet1 remains UP and operational for BGP/L2 forwarding.

---

### Rollback for ceos2

**Commands (in order):**

```
! Remove PTP configuration from ceos2
configure
no ptp clock-identity
no ptp priority1
no ptp priority2
no ptp clock-class
no ptp clock-accuracy
no ptp domain
no ptp announce-interval
no ptp sync-interval
no ptp delay-req-interval
no ptp one-step
no ptp profile

interface Ethernet1
   no ptp port 1 role slave

end
write memory
```

**Verification (post-rollback):**
```
show ptp clock
! Expected: "PTP is not configured" or empty output
show ptp port
! Expected: "PTP is not configured" or empty output
```

**Rationale:** Removes all PTP configuration from ceos2, returning it to greenfield state. Ethernet1 remains UP and operational for BGP/L2 forwarding.

---

## (d) RECOMMENDED CHANGE ORDERING + MAINTENANCE-WINDOW NOTE

### Change Sequence (Critical for Timing Stability)

| Order | Device | Action | Duration | Risk Mitigation |
|-------|--------|--------|----------|-----------------|
| **1** | ceos1 | Apply global PTP config (clock-identity, priority, class, domain, intervals, profile) | ~2 min | No traffic disruption; PTP is additive. Ethernet1 remains UP. |
| **2** | ceos1 | Configure Ethernet1 as PTP master port | ~1 min | Master port begins transmitting sync messages. Ethernet1 remains UP. |
| **3** | ceos2 | Apply global PTP config (clock-identity, priority, class, domain, intervals, profile) | ~2 min | No traffic disruption; PTP is additive. Ethernet1 remains UP. ceos2 begins listening for announce/sync from ceos1. |
| **4** | ceos2 | Configure Ethernet1 as PTP slave port | ~1 min | Slave port locks to master; timing sync established within 1-2 sync intervals (~32 ms). Ethernet1 remains UP. |
| **5** | Both | Validation (run all 6 validation steps; monitor for 60 seconds) | ~5 min | Confirm GM election, slave lock, offset < 1 μs, no flap. |

**Total Change Window: ~11 minutes** (including validation).

---

### Maintenance-Window Requirements

1. **Timing Impact on Trading Floor:**
   - During steps 1–2 (ceos1 config): No impact. ceos1 is not yet a timing source for ceos2.
   - During step 3 (ceos2 global config): No impact. ceos2 is not yet synchronized.
   - During step 4 (ceos2 slave port enable): **Brief transient (< 100 ms)** — ceos2 will search for a master and lock within 1-2 sync intervals (~32 ms). Trading engines must tolerate brief timing gaps during provisioning. This is expected and recovers automatically.
   - During step 5 (validation): No impact. Read-only commands only.

2. **Rollback Readiness:**
   - If validation fails at any step, execute the rollback plan (ceos1 first, then ceos2) to restore greenfield state.
   - Rollback duration: ~5 minutes per device.
   - Post-rollback, both devices return to pre-change timing state (no PTP, no synchronization).

3. **External Time Source (Production Note):**
   - This lab change establishes ceos1 as the fabric GM with clock class 6 (locked to a primary reference).
   - **In production**, ceos1 must be seeded with an external time source (GNSS/PRTC) to anchor the fabric timing to a traceable reference.
   - For lab validation, ceos1 acts as the reference; production cutover will require external clock input configuration (out of scope for this change package).

4. **No Device Reboot Required:**
   - All changes are applied via running-config; no reboot is necessary.
   - `write memory` persists the config to startup-config for post-reboot recovery.

---

### Recommended Execution Approach

- **Execution Mode:** Sequential, in-order (steps 1–5 as listed above).
- **Execution Tool:** Ansible playbook with Arista EOS provider, or NAPALM/Nornir with deterministic validation checks.
- **Validation Automation:** After step 4, run all 6 validation steps in a loop (60-second window) to confirm stability before declaring success.
- **Rollback Trigger:** If any validation step fails or offset > 1 μs is detected, immediately execute rollback plan.

---

## Summary

This change package delivers:

1. **Per-device candidate configurations** (ceos1 GM, ceos2 slave) grounded in the Phase 1 design and Phase 0 harvested state.
2. **Six deterministic validation steps** with exact commands and expected outputs — facts the apply step will run, not verdicts.
3. **Rollback plan** to restore greenfield state if validation fails.
4. **Recommended change ordering** (5 steps, ~11 minutes total) with risk mitigation and maintenance-window notes.

**This is a change package to be applied out-of-band by a human engineer or deterministic applier (Ansible/NAPALM/Nornir). No device mutation occurs in this pipeline.** The package is ready for the Change Reviewer (Phase 3) to assess standards compliance, blast radius, and approval.

---

Confidence: 88 — Solid. All configuration values, interface names, device facts, and design parameters are directly from the Phase 1 design and Phase 0 harvest (no fabrication). Validation steps are deterministic and runnable. One assumption: Ethernet1 is the intended PTP synchronization path (supported by the design but not independently verified with the customer). One minor gap: production external time source (GNSS/PRTC) is noted as out-of-scope for this lab change but flagged for production cutover.

---

## Appendix — Current Device Running-Config

> Live running-config of `ceos1`/`ceos2` at harvest time — the **evolved baseline** this PTP change was designed against. Note the applied `Loopback0` + BGP `network` statements (from the Loopback0+BGP change); PTP is absent — greenfield, as the design states. Captured via eAPI `show running-config`.

### ceos1 (172.30.30.11)

```
! device: ceos1 (cEOSLab, EOS-4.32.2.1F)
!
username admin privilege 15 role network-admin secret sha512 << REDACTED — lab credential hash >>
!
management api http-commands
   protocol http
   no shutdown
   !
   vrf default
      no shutdown
!
service routing protocols model multi-agent
!
hostname ceos1
!
snmp-server community << REDACTED — fake lab community >> ro
!
spanning-tree mode mstp
!
interface Ethernet1
   description to-ceos2
   no switchport
   ip address 10.0.12.1/30
!
interface Loopback0
   description Loopback0 for BGP reachability in HFT fabric
   ip address 1.1.1.1/32
!
interface Management0
   ip address 172.30.30.11/24
!
ip routing
!
router bgp 65001
   router-id 1.1.1.1
   neighbor 10.0.12.2 remote-as 65002
   neighbor 10.0.12.2 description to-ceos2
   !
   address-family ipv4
      neighbor 10.0.12.2 activate
      network 1.1.1.1/32
!
end
```

### ceos2 (172.30.30.12)

```
! device: ceos2 (cEOSLab, EOS-4.32.2.1F)
!
username admin privilege 15 role network-admin secret sha512 << REDACTED — lab credential hash >>
!
management api http-commands
   protocol http
   no shutdown
   !
   vrf default
      no shutdown
!
service routing protocols model multi-agent
!
hostname ceos2
!
snmp-server community << REDACTED — fake lab community >> ro
!
spanning-tree mode mstp
!
interface Ethernet1
   description to-ceos1
   no switchport
   ip address 10.0.12.2/30
!
interface Loopback0
   description Loopback0 for BGP reachability in HFT fabric
   ip address 2.2.2.2/32
!
interface Management0
   ip address 172.30.30.12/24
!
ip routing
!
router bgp 65002
   router-id 2.2.2.2
   neighbor 10.0.12.1 remote-as 65001
   neighbor 10.0.12.1 description to-ceos1
   !
   address-family ipv4
      neighbor 10.0.12.1 activate
      network 2.2.2.2/32
!
end
```
