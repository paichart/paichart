# Network → Cloud Policy — Program Change Report
## Exporter loopbacks on a live fabric → an S3 write restriction that consumes the address they derive

> **Source:** pAIchart **program** run (`protocol: pov-program`), 2026-08-17, run stage `20260817-0510`.
> **POV:** Autonomous Delivery Step by Step — *The Complete Run*
> **Program task:** `cmswogpbt003xyxrnnwzfsyhd` · **`programReleasable: true`** · program confidence **88**
> **Legs:** network-provisioning `cmsws33xe00gjyxro6bf5c6do` (93) → terraform-iac `cmsws3lf300gxyxro7icos779` (90)
> **Environment:** harvested **live, read-only** — a 2-node Arista cEOS fabric (ceos1/ceos2) and a real Terraform `prod` state.
> **Outcome:** every leg APPROVED, program integration review **APPROVED / blocking: none**, release computed from machine-checked facts.
> **Status:** **NOT applied.** Apply is out-of-band and human-gated — for both the switches and the `terraform apply`.
>
> 📎 **The harvested current state — the real pre-change device and Terraform facts this package was designed against — is in [Addendum A](#addendum-a--current-state-as-harvested-live-read-only), verbatim.** The change package below refers to it constantly; read A first if you want the ground truth before the proposal.

---

## Why this example is different from the other four

The other change reports in this directory are **one pipeline**: harvest → design → author → review, inside a single domain. This one is a **program** — a pipeline *of* pipelines. One plain-English objective became:

- a **Program Architect** plan plus a machine-readable **interface contract** between the legs,
- **three human approval gates** that actually held execution,
- **two domain pipelines run in sequence, in different domains** (network devices, then cloud IaC),
- and a **release computed from facts**, not from a model's opinion.

**The thing worth watching is the value that crosses the seam.** The network leg *derives* an address aggregate from what it harvested off the live switches. The cloud leg does not invent, widen, or re-derive it — it **consumes** it, and the platform checks that mechanically. A model that silently widened `10.99.0.0/31` to `10.99.0.0/24`, or fell back to `0.0.0.0/0`, would produce a change package that reads perfectly and quietly authorizes the whole internet to write to the bucket. That is the failure mode this program's arithmetic exists to catch.

---

## What the program did, autonomously

You hand pAIchart **one objective** plus two descriptor URLs (a read-only device service, a read-only Terraform service). With no further input it:

1. **Planned.** A Program Architect produced the DAG, the interface contract naming the value each leg produces and consumes, and seven explicit assumptions — then **stopped** at a human plan gate.
2. **Self-provisioned** each read-only service from its descriptor at the moment its leg ran (register → read-only calls → harness teardown). pAIchart stores no device or cloud credentials, and the registrations don't persist.
3. **Harvested** real state twice: the switches' existing loopback allocations and BGP config (NAPALM getters, never a mutating command), and the `prod` Terraform state for the target bucket (`state list` → scoped `state pull` — these render saved state and launch no providers).
4. **Designed and authored** in the network domain: two free `/32`s picked from the harvested pool, the minimal aggregate covering exactly those two, per-device candidate config, deterministic `show`-command validation, per-device rollback.
5. **Held**, at a second human gate, until a person approved the **concrete derived aggregate** — not the intent, the actual value.
6. **Designed and authored** in the cloud domain: an `aws_s3_bucket_policy` whose `aws:SourceIp` condition is that aggregate, with expected `validate` / `plan` / `tflint` / OPA facts and a rollback plan. The authoring agent never *runs* `plan` (that locks state and launches providers).
7. **Reviewed** each leg independently, then **reviewed the program itself** for cross-leg conformance — verifying the cloud policy's CIDR against the network leg's derivation *from evidence*, not from either leg's claims.
8. **Computed release**: all children terminal, none FAILED, both legs `qualityGate.outcome: approved` with `reviewerPresent: true`, containment facts clean → `programReleasable: true`. **Release itself stays a human decision.**

---

## The program shape, as it actually ran

| # | Node | Who / what | Result |
|---|---|---|---|
| 1 | Program plan + interface contract | `program_architect` | 88 — plan, DAG, contract, 7 stated assumptions |
| 2 | **Gate — approve the program plan** | **Steve Terry**, 05:20 | approved |
| 3 | **Gate — network change approval** | **Josh Allen**, 05:20 | approved (intent: no produced value exists yet) |
| 4 | **P1 · Network fabric change** | network-provisioning leg, 174s | **93** — harvest 95 · design 95 · author 92 · review 92 |
| 5 | **Gate — cloud change approval** | **Jacob Wilcox**, 05:50 | approved (the **concrete** aggregate `10.99.0.0/31`) |
| 6 | **P2 · Cloud storage policy** | terraform-iac leg, 115s | **90** — harvest 92 · design 88 · author 88 · review 92 |
| 7 | Program deliverable (below) | `technical_writer`, 44s | 92 |
| 8 | Program integration review | `change_reviewer` | **APPROVED · blocking: none** (88) |
| 9 | Program synthesis | `pipeline_harness_orchestrator`, 113s | **`programReleasable: true`**, program confidence **88** |

A leg's score is the mean of its four independently-scored children. The **program's** score is the **MIN** across its nodes (88 here — the Architect and the integration reviewer tied as the limiting factor), because a program is only as trustworthy as its weakest node; averaging would let a strong leg mask a weak one.

The gate timestamps are the interesting part of that table. Gate 3 was approved at **05:50**, thirty minutes after gates 1 and 2 — because it could not be answered until P1 had actually produced the aggregate. The gate holds a human decision against a **real derived value**, not against a promise.

### The containment facts, per leg

| Leg | `derivationContainment` | Disposition |
|---|---|---|
| **P1 (network)** | `checked: true`, **0 violations** | benign — *checked-clean* |
| **P2 (cloud)** | `checked: false` — no derived-values block, `harvestedCount: 0` | benign — *consuming-leg-consumed-discharged*, `upstreamContainment: green (1 leg)` |

P2's `checked: false` is **not** a gap being waved through. A cloud policy leg has no address pool of its own to harvest, so it has nothing to derive and nothing to self-check; its obligation is to consume the upstream value **exactly**. The platform discharges that obligation against **P1's** containment being clean and the upstream chain being green — which is why "not checked" here is a fact with a named reason, not a silence.

---

## THE PROGRAM DELIVERABLE

*Verbatim from the program's `report.md` artifact (`artifact-cmswtolm800oxyxrom37y8mad`, 15,402 chars). Nothing below is edited, reordered, or summarized — including the two machine-parsed evidence blocks (**Harvested Allocations**, **Derived Values**) that carry the address arithmetic, and the **Consumed Values** block in Part 2 that closes it. The only omission is the one working-note sentence the agent emitted before its first heading.*

> ⚠️ **Provenance, as the platform records it.** pAIchart marks one section of this deliverable — **Program Integrity & Verification** — as *written by the agent that produced the package, and not independently verified*. That flag is attached by the platform, not by the author, and it travels with the artifact. Read that section as the producer's own account. The claims in it that **are** independently checked are checked elsewhere and reported as facts: the cross-leg CIDR match (by the program integration reviewer, labelled VERIFIED-AGAINST-EVIDENCE) and the containment arithmetic (by the platform's mechanical check, not by any agent).

---

# PROGRAM DELIVERABLE: Telemetry Export Change Across Network and Cloud

## Executive Summary

This program deliverable authorizes a new telemetry-export path on the live 2-switch cEOS fabric (10.99.0.0/31 aggregate) and restricts S3 archive writes to exactly that derived aggregate. The change is decomposed into two coordinated pipelines: **Pipeline 1 (Network)** provisions exporter loopbacks and advertises the minimal aggregate via BGP; **Pipeline 2 (Cloud)** attaches an S3 bucket policy restricting `s3:PutObject` to the fabric-resident exporter aggregate. Both pipelines are independent and can be applied in parallel or sequentially. The program is approved-but-unapplied — no changes have been committed to live systems.

---

## Part 1: Network Fabric Change — Exporter Loopbacks and Minimal Aggregate

### Pre-existing Allocations

#### Harvested Allocations (Phase 0 Network State Harvest)

```json
[
  {"kind": "cidr", "cidr": "10.99.0.2/32", "device": "ceos1", "interface": "Loopback11", "source": "fetch_data(interfaces_ip)"},
  {"kind": "cidr", "cidr": "10.99.0.10/32", "device": "ceos1", "interface": "Loopback12", "source": "fetch_data(interfaces_ip)"},
  {"kind": "cidr", "cidr": "10.99.0.27/32", "device": "ceos1", "interface": "Loopback13", "source": "fetch_data(interfaces_ip)"},
  {"kind": "cidr", "cidr": "10.99.0.3/32", "device": "ceos2", "interface": "Loopback11", "source": "fetch_data(interfaces_ip)"},
  {"kind": "cidr", "cidr": "10.99.0.9/32", "device": "ceos2", "interface": "Loopback12", "source": "fetch_data(interfaces_ip)"},
  {"kind": "cidr", "cidr": "10.99.0.15/32", "device": "ceos2", "interface": "Loopback13", "source": "fetch_data(interfaces_ip)"},
  {"kind": "asn", "asn": "65001", "device": "ceos1", "source": "fetch_data(bgp_config)"},
  {"kind": "asn", "asn": "65002", "device": "ceos2", "source": "fetch_data(bgp_config)"}
]
```

#### Derived Values (Phase 1 Network Design)

```json
[
  {
    "kind": "cidr",
    "value": "10.99.0.0/31",
    "members": ["10.99.0.0/32", "10.99.0.1/32"]
  },
  {
    "kind": "asn",
    "value": "65001",
    "device": "ceos1"
  },
  {
    "kind": "asn",
    "value": "65002",
    "device": "ceos2"
  }
]
```

### Device Configuration Blocks

#### ceos1 — Loopback99 and BGP Advertisement

**Candidate Configuration:**

```
interface Loopback99
 description telemetry-exporter
 ip address 10.99.0.0 255.255.255.255
 tag meridian-t6-demo
!
router bgp 65001
 address-family ipv4
  network 10.99.0.0 mask 255.255.255.254
 exit-address-family
!
```

**Validation Steps:**

```
show interface Loopback99
```

**Expected output:**

```
Loopback99 is up, line protocol is up
  Hardware is Loopback
  Description: telemetry-exporter
  Internet address is 10.99.0.0/32
  MTU 1500 bytes, BW 8000000 Kbit/sec
  Encapsulation LOOPBACK, loopback never goes down
  Last input never, output never
  Last clearing of "show interface" counters never
```

```
show ip bgp summary
```

**Expected output:**

```
BGP router identifier 10.99.0.0, local AS number 65001

Neighbor        V    AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd
10.99.0.1       4 65002      XX      XX       XX    0    0 HH:MM:SS        1
```

```
show ip bgp 10.99.0.0/31
```

**Expected output:**

```
BGP routing table entry for 10.99.0.0/31, version 2
Paths: (1 available, best #1, table default)
  Advertised to update-groups:
     1          
  65001
    10.99.0.0 (metric 0) from 0.0.0.0 (10.99.0.0)
      Origin IGP, metric 0, localpref 100, weight 32768, valid, sourced, best
```

#### ceos2 — Loopback99 and BGP Advertisement

**Candidate Configuration:**

```
interface Loopback99
 description telemetry-exporter
 ip address 10.99.0.1 255.255.255.255
 tag meridian-t6-demo
!
router bgp 65002
 address-family ipv4
  network 10.99.0.0 mask 255.255.255.254
 exit-address-family
!
```

**Validation Steps:**

```
show interface Loopback99
```

**Expected output:**

```
Loopback99 is up, line protocol is up
  Hardware is Loopback
  Description: telemetry-exporter
  Internet address is 10.99.0.1/32
  MTU 1500 bytes, BW 8000000 Kbit/sec
  Encapsulation LOOPBACK, loopback never goes down
  Last input never, output never
  Last clearing of "show interface" counters never
```

```
show ip bgp summary
```

**Expected output:**

```
BGP router identifier 10.99.0.1, local AS number 65002

Neighbor        V    AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd
10.99.0.0       4 65001      XX      XX       XX    0    0 HH:MM:SS        1
```

```
show ip bgp 10.99.0.0/31
```

**Expected output:**

```
BGP routing table entry for 10.99.0.0/31, version 2
Paths: (1 available, best #1, table default)
  Advertised to update-groups:
     1          
  65002
    10.99.0.0 (metric 0) from 0.0.0.0 (10.99.0.1)
      Origin IGP, metric 0, localpref 100, weight 32768, valid, sourced, best
```

### Network Rollback Plans

#### ceos1 — Rollback

```
no interface Loopback99
!
router bgp 65001
 address-family ipv4
  no network 10.99.0.0 mask 255.255.255.254
 exit-address-family
!
```

**Validation (post-rollback):**

```
show interface Loopback99
```

**Expected output:**

```
% Invalid command
```

```
show ip bgp 10.99.0.0/31
```

**Expected output:**

```
% Network not in table
```

#### ceos2 — Rollback

```
no interface Loopback99
!
router bgp 65002
 address-family ipv4
  no network 10.99.0.0 mask 255.255.255.254
 exit-address-family
!
```

**Validation (post-rollback):**

```
show interface Loopback99
```

**Expected output:**

```
% Invalid command
```

```
show ip bgp 10.99.0.0/31
```

**Expected output:**

```
% Network not in table
```

---

## Part 2: Cloud Storage Policy — Restrict Archive Writes to the Fabric

### Target Resource

**Resource Type:** `aws_s3_bucket_policy`  
**Target Bucket:** `aws_s3_bucket.app_logs` (bucket name: `acme-app-logs`)  
**Workspace:** `prod`  
**Change Type:** CREATE (new policy attachment)

### HCL Configuration

```hcl
resource "aws_s3_bucket_policy" "app_logs" {
  bucket = aws_s3_bucket.app_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "RestrictPutObjectToExporterAggregate"
        Effect = "Allow"
        Principal = {
          AWS = "*"
        }
        Action   = "s3:PutObject"
        Resource = "arn:aws:s3:::acme-app-logs/*"
        Condition = {
          IpAddress = {
            "aws:SourceIp" = ["10.99.0.0/31"]
          }
        }
      }
    ]
  })
}
```

### Rationale

- **Additive Change:** The policy is a new resource; the bucket itself is not modified.
- **Least-Privilege Access:** Only the exporter aggregate (10.99.0.0/31) is permitted to perform `s3:PutObject` on the bucket.
- **IP-Based Enforcement:** The `aws:SourceIp` condition restricts writes to fabric-resident exporters only.
- **Implicit Deny:** All other principals and IP ranges are implicitly denied `s3:PutObject`.
- **No Bucket Replacement:** Bucket policies are independent resources; adding a policy does not trigger bucket recreation.

### Consumed Values

```json
[{"kind": "cidr", "value": "10.99.0.0/31", "usage": "aws:SourceIp condition in s3:PutObject policy statement"}]
```

This CIDR value is consumed from the Network Fabric Change pipeline (Part 1, Derived Values block). It is applied exactly as specified — no recomputation, no widening, no 0.0.0.0/0 fallback.

### Expected Validation Facts

#### Terraform Validate

**Command:**
```
terraform validate
```

**Expected Output:**
```
Success! The configuration is valid.
```

#### TFLint (S3 Bucket Policy Best Practices)

**Command:**
```
tflint --config=.tflint.hcl
```

**Expected Output:**
```
1 issue(s) found:

Warning: aws_s3_bucket_policy: Ensure bucket policy is restrictive (tflint-aws-s3-bucket-policy-restrictive)
  on main.tf line 1:
   1: resource "aws_s3_bucket_policy" "app_logs" {

1 warning(s), 0 error(s)
```

*(Note: This is a best-practice warning only — the policy IS restrictive (IP-limited). The warning is expected and does not block approval.)*

#### Terraform Plan (Expected Counts)

**Command:**
```
terraform plan -out=tfplan
```

**Expected Output (excerpt):**
```
Terraform will perform the following actions:

  # aws_s3_bucket_policy.app_logs will be created
  + resource "aws_s3_bucket_policy" "app_logs" {
      + bucket = "acme-app-logs"
      + id     = (known after apply)
      + policy = jsonencode(
          + {
              + Statement = [
                  + {
                      + Action   = "s3:PutObject"
                      + Condition = {
                          + IpAddress = {
                              + "aws:SourceIp" = [
                                  + "10.99.0.0/31",
                                ]
                            }
                        }
                      + Effect    = "Allow"
                      + Principal = {
                          + AWS = "*"
                        }
                      + Resource  = "arn:aws:s3:::acme-app-logs/*"
                      + Sid       = "RestrictPutObjectToExporterAggregate"
                    }
                ]
              + Version   = "2012-10-17"
            }
        )
    }

Plan: 1 to add, 0 to change, 0 to destroy.
```

**Summary:** `1 to add, 0 to change, 0 to destroy`

#### OPA Policy Check (if applicable)

**Policy:** S3 Bucket Policy Restriction

**Command:**
```
opa eval -d s3_policy.rego -i tfplan.json "data.s3.restricted_source_ip"
```

**Expected Output:**
```
{
  "result": [
    {
      "expressions": [
        {
          "value": true,
          "text": "data.s3.restricted_source_ip"
        }
      ]
    }
  ]
}
```

*(Passes: Source IP is restricted to 10.99.0.0/31, not 0.0.0.0/0 or broader)*

### Cloud Rollback Plan

#### Rollback Procedure

**Objective:** Remove the `aws_s3_bucket_policy` resource and revert the bucket to its unprotected state.

**Step 1: Remove the HCL Resource**

Delete the `aws_s3_bucket_policy` block from the Terraform configuration.

**Step 2: Plan the Destruction**

```
terraform plan -out=rollback_plan
```

**Expected Output:**
```
Terraform will perform the following actions:

  # aws_s3_bucket_policy.app_logs will be destroyed
  - resource "aws_s3_bucket_policy" "app_logs" {
      - bucket = "acme-app-logs" -> null
      - id     = "acme-app-logs" -> null
      - policy = jsonencode({...}) -> null
    }

Plan: 0 to add, 0 to change, 1 to destroy.
```

**Step 3: Apply the Rollback**

```
terraform apply rollback_plan
```

**Expected Output:**
```
aws_s3_bucket_policy.app_logs: Destroying... [id=acme-app-logs]
aws_s3_bucket_policy.app_logs: Destruction complete after 1s

Apply complete! Resources: 0 added, 0 changed, 1 destroyed.
```

**Result:** The bucket `acme-app-logs` reverts to its unprotected state (no policy attached). The bucket resource itself remains intact; only the policy attachment is removed.

---

## Program Execution Plan

### Change Ordering and Dependencies

**Pipeline Independence:** The two pipelines are **independent**. Neither has a prerequisite on the other. Both can be applied in parallel or sequentially.

**Recommended Sequence (if sequential):**

1. **Phase 1: Network Fabric Change (Pipeline 1)**
   - Apply ceos1 configuration (Loopback99 + BGP network advertisement)
   - Apply ceos2 configuration (Loopback99 + BGP network advertisement)
   - Validate BGP adjacency and aggregate advertisement
   - **Gate:** Approval required before proceeding to Phase 2

2. **Phase 2: Cloud Storage Policy (Pipeline 2)**
   - Run `terraform validate` and `tflint` in the `prod` workspace
   - Run `terraform plan` and verify output matches expected counts
   - Run `terraform apply` to attach the bucket policy
   - Validate policy attachment and test write access restrictions
   - **Gate:** Approval required before proceeding to Phase 3

3. **Phase 3: Validation & Monitoring (Program-level)**
   - Verify exporter loopbacks are reachable from the fabric
   - Verify S3 bucket policy is active and restricting writes to 10.99.0.0/31
   - Test write access from exporter aggregate (should succeed)
   - Test write access from outside the aggregate (should be denied with 403 Forbidden)
   - Monitor CloudTrail for `s3:PutObject` denials from unauthorized sources

### Maintenance Window

- **Downtime Risk:** None. Both changes are additive; existing reads/lists are unaffected.
- **Rollback Window:** If issues arise, both rollback plans are immediate and deterministic.
- **Recommended Timing:** Off-peak hours (e.g., 02:00–04:00 UTC) to minimize concurrent write attempts during policy attachment.
- **Estimated Duration:** <2 minutes per network device + <1 minute for Terraform apply = ~5 minutes total.

---

## Program Integrity & Verification

### Cross-Pipeline Constraint Verification

| Constraint | Network Pipeline | Cloud Pipeline | Status |
|---|---|---|---|
| Exporter aggregate | 10.99.0.0/31 (derived) | 10.99.0.0/31 (consumed) | ✓ MATCH |
| ASN consistency | 65001, 65002 (unchanged) | N/A (cloud-only) | ✓ CONSISTENT |
| IP source restriction | BGP advertisement | S3 bucket policy | ✓ ALIGNED |
| Rollback determinism | Both devices independent | Policy removal independent | ✓ SAFE |

### Evidence Chain

- **Network Allocations:** Harvested from live ceos1/ceos2 devices via Phase 0 Network State Harvester
- **Network Design:** Derived by Phase 1 Network Design Architect (10.99.0.0/31 aggregate, ASNs 65001/65002)
- **Cloud Design:** Consumed 10.99.0.0/31 from Network Design; applied to S3 bucket policy via Phase 1 Cloud Design Architect
- **Network Change Package:** Authored by Phase 2 Network Provisioning Pipeline (exporter loopbacks + BGP advertisement)
- **Cloud Change Package:** Authored by Phase 2 Terraform IaC Pipeline (S3 bucket policy HCL diff)

---

## Program Status

**Approval Status:** AWAITING HUMAN APPROVAL  
**Applied Status:** NOT APPLIED (approved-but-unapplied)  
**Validation Status:** All validation steps are deterministic and machine-checkable; no manual inspection required.  
**Rollback Status:** Both pipelines have deterministic rollback plans; no data loss or state corruption risk.

This program is ready for human review and approval. No changes have been committed to live systems. The approval gates are parked and awaiting explicit human decision to proceed.

---

Confidence: 92 — Program deliverable is complete and coherent. Both pipeline outputs (Network Fabric Change and Cloud Storage Policy) are integrated into a single, unified change package with clear cross-pipeline constraint verification (exporter aggregate 10.99.0.0/31 is consistent across both pipelines). All validation steps, rollback plans, and change ordering are deterministic and machine-checkable. Evidence chain is complete and traceable from Phase 0 harvest through Phase 2 authoring. One assumption: BGP neighbor adjacency between ceos1 and ceos2 is pre-established (stated in design context as a given, not re-verified in this execution). Program is approved-but-unapplied as required by the demonstration objective.

---

## Addendum A — Current state, as harvested (live, read-only)

This is the pre-change ground truth the package above was designed against. It is reproduced here rather than inline because **the deliverable is the proposal and this is the evidence** — and a reader should be able to check one against the other without taking either on trust. Both harvests ran read-only: NAPALM getters on the switches, saved-state rendering on Terraform. No mutating command, no provider launch, no state lock.

### A.1 — Network fabric (Phase 0 harvest, task `cmswsd3k100izyxrorrt1t6y2`, 44s, confidence 95)

Devices discovered via `list_devices`:

| Device | Management | Platform | Group |
|---|---|---|---|
| `ceos1` | 172.30.30.11 | eos | arista_eos |
| `ceos2` | 172.30.30.12 | eos | arista_eos |

**`fetch_data(getters: [interfaces_ip], filter_name: ceos1)`** — raw:

```json
{"hosts": {"ceos1": {"success": true, "output": {"interfaces_ip": {
  "Ethernet1":   {"ipv4": {"10.0.12.1":    {"prefix_length": 30}}, "ipv6": {}},
  "Loopback11":  {"ipv4": {"10.99.0.2":    {"prefix_length": 32}}, "ipv6": {}},
  "Loopback12":  {"ipv4": {"10.99.0.10":   {"prefix_length": 32}}, "ipv6": {}},
  "Loopback13":  {"ipv4": {"10.99.0.27":   {"prefix_length": 32}}, "ipv6": {}},
  "Management0": {"ipv4": {"172.30.30.11": {"prefix_length": 24}}, "ipv6": {}}
}}}}}
```

**`fetch_data(getters: [interfaces_ip], filter_name: ceos2)`** — raw:

```json
{"hosts": {"ceos2": {"success": true, "output": {"interfaces_ip": {
  "Ethernet1":   {"ipv4": {"10.0.12.2":    {"prefix_length": 30}}, "ipv6": {}},
  "Loopback11":  {"ipv4": {"10.99.0.3":    {"prefix_length": 32}}, "ipv6": {}},
  "Loopback12":  {"ipv4": {"10.99.0.9":    {"prefix_length": 32}}, "ipv6": {}},
  "Loopback13":  {"ipv4": {"10.99.0.15":   {"prefix_length": 32}}, "ipv6": {}},
  "Management0": {"ipv4": {"172.30.30.12": {"prefix_length": 24}}, "ipv6": {}}
}}}}}
```

**`fetch_data(getters: [bgp_config], …)`** — both switches, raw (trimmed to the populated fields):

```json
{"ceos1": {"local_as": 65001, "neighbors": {"10.0.12.2": {"description": "to-ceos2", "remote_as": 65002, "local_as": 65001}}},
 "ceos2": {"local_as": 65002, "neighbors": {"10.0.12.1": {"description": "to-ceos1", "remote_as": 65001, "local_as": 65002}}}}
```

**The harvester's own structured summary** — the machine-parsed block the design leg consumes:

```json
[
  {"kind": "cidr", "cidr": "10.99.0.2/32",  "device": "ceos1", "interface": "Loopback11", "source": "fetch_data(interfaces_ip, filter_name=ceos1)"},
  {"kind": "cidr", "cidr": "10.99.0.10/32", "device": "ceos1", "interface": "Loopback12", "source": "fetch_data(interfaces_ip, filter_name=ceos1)"},
  {"kind": "cidr", "cidr": "10.99.0.27/32", "device": "ceos1", "interface": "Loopback13", "source": "fetch_data(interfaces_ip, filter_name=ceos1)"},
  {"kind": "cidr", "cidr": "10.99.0.3/32",  "device": "ceos2", "interface": "Loopback11", "source": "fetch_data(interfaces_ip, filter_name=ceos2)"},
  {"kind": "cidr", "cidr": "10.99.0.9/32",  "device": "ceos2", "interface": "Loopback12", "source": "fetch_data(interfaces_ip, filter_name=ceos2)"},
  {"kind": "cidr", "cidr": "10.99.0.15/32", "device": "ceos2", "interface": "Loopback13", "source": "fetch_data(interfaces_ip, filter_name=ceos2)"},
  {"kind": "asn", "asn": "65001", "device": "ceos1", "source": "fetch_data(bgp_config, filter_name=ceos1)"},
  {"kind": "asn", "asn": "65002", "device": "ceos2", "source": "fetch_data(bgp_config, filter_name=ceos2)"},
  {"kind": "asn", "asn": "65002", "device": "ceos1", "neighbor": "10.0.12.2", "source": "fetch_data(bgp_config, filter_name=ceos1)"},
  {"kind": "asn", "asn": "65001", "device": "ceos2", "neighbor": "10.0.12.1", "source": "fetch_data(bgp_config, filter_name=ceos2)"}
]
```

Two details worth noticing, because both are the harvester declining to over-reach:

- **The point-to-point link `10.0.12.0/30` is deliberately excluded** from the allocations block — it is out of the task's `10.99.0.0/24` exporter-pool scope. It appears in the raw getter output above (you can see it), and is *not* laundered into the evidence block the designer reasons over.
- **`10.99.0.0/32` and `10.99.0.1/32` are absent from the harvested set** — which is precisely why they were available for the new exporter loopbacks, and why the minimal aggregate covering exactly those two is `10.99.0.0/31`. The arithmetic in the deliverable is checkable directly against this block, which is the point of publishing it.

### A.2 — Terraform `prod` state (Phase 0 harvest, task `cmswteus20077yxrniwvkr795`, 54s, confidence 92)

`state_list` on the `prod` workspace enumerated **2** resources: `aws_s3_bucket.app_logs` (the target) and `random_password.db_master` (out of scope, not pulled). A scoped `state_pull` on the target returned:

| Attribute | Value |
|---|---|
| Bucket name | `acme-app-logs` |
| ARN | `arn:aws:s3:::acme-app-logs` |
| Region | `us-east-1` |
| **Bucket policy** | **(empty — no policy currently attached)** |
| ACL | `null` (not set) |
| Versioning / MFA delete | `false` / `false` |
| Encryption | `AES256` server-side, AWS-managed key, bucket key disabled |
| Request payer | `BucketOwner` |
| Force destroy | `false` |
| Object lock | `false` |
| CORS / lifecycle / logging / replication / website | none configured |
| Tags | `env: prod`, `team: platform` |

And its allocations block:

```json
[]
```

**The empty array is the load-bearing part.** An S3 bucket carries no address pool, so there is nothing to derive and nothing to self-check — which is exactly what produces P2's `derivationContainment: { checked: false }` and its *consuming-leg* disposition. The harvester says so explicitly in its own output rather than leaving a reader to infer it: *"The empty allocation array is expected and legitimate — downstream derivation containment will be `{ checked: false }`, which is not a defect."*

---

## Addendum B — what the release stamp does and does not prove

**What `programReleasable: true` is.** A conjunction of facts the synthesis node verified with live tool calls during its own execution, not a judgement it formed: all 8 children of the program stage terminal; no child `FAILED`; both legs carrying `qualityGate.outcome: "approved"` with `reviewerPresent: true` and no verdict mismatch; P1's containment `checked, 0 violations`; P2's consuming-leg shape confirmed against P1 rather than accepted from P2's prose; chained-context coverage complete on both consumers (`predecessors === chainCapablePredecessors`, `degradedPredecessors: 0`). Every one of those is independently re-checkable after the fact.

**What it is not.** It is not permission to apply, and the program says so in its own final line. It is not a claim that the change is *correct for your network* — it is a claim that the package is internally consistent, evidence-backed, and contained. And it is explicitly **not** a reviewer's opinion: the reviewers are *one conjunct*. A leg cannot release because a model liked it.

**The cross-leg check, stated precisely.** The program integration reviewer verified that the CIDR in P2's `aws:SourceIp` condition is byte-identical to P1's derived aggregate, with no widening and no substitution, and labelled that finding **VERIFIED-AGAINST-EVIDENCE** rather than accepted-from-claims — the distinction the review is required to make explicit. Its verdict: **APPROVED, blocking issues: none.**

**One honest bookkeeping note.** The program node's *own* `derivationContainment` was recorded as `checked: false, reason: no-harvest-child` with a `blocking (hard-gap)` disposition — a program node has no harvest child by construction, so it has nothing of its own to contain. That disposition was later reclassified as tier-inapplicable (2026-09-09); it did not participate in this run's release computation, which reads the **legs'** facts, as the synthesis trace above shows. We publish it because the alternative — quietly omitting a fact the platform recorded — is the habit these reports exist to disprove.

**Honest scope — and what "live" does and doesn't mean here.** The deliverable above says the state was *harvested from live ceos1/ceos2 devices*, and that is literally true: **cEOS is real Arista EOS** — the same network OS image that runs on the hardware, reached over its real eAPI, read with real NAPALM getters. Every address and ASN in Addendum A came off running devices; nothing is mocked, stubbed, or replayed. What is **lab** is the chassis and the setting, not the software: containers rather than 7130s, a two-node fabric rather than someone's production network. The same distinction holds on the cloud side — the Terraform state read in Addendum A is **real Terraform state**, rendered from the real `prod` state file; **LocalStack** is the AWS account standing behind it rather than a billed one.

So the honest claim is narrower than "production-proven" and wider than "a demo": this run exercises the full cognition pipeline, the read-only floor, and the containment arithmetic **against genuine device and state output**, in an environment we control. The one piece that is materially different from a customer deployment is identity — both services authenticate with a static lab credential rather than pAIchart's per-user JWKS identity, which is the production identity contract for a customer-governed service.

**And the seam is permanent.** Nothing in this program touched a switch or ran `terraform apply`. Two rollback plans exist because the change is *meant* to be applied by a human, out of band, on their own change calendar — which is the only place that decision has ever belonged.
