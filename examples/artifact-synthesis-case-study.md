# Autonomous Change Delivery for an Ultra-Low-Latency Trading Fabric
### A pAIchart Delivery Case Study — Meridian Capital, Arista 7130 Program

---

## 1. Engagement Context

Meridian Capital, a high-frequency trading firm operating in Eastern Australia, is building an ultra-low-latency Arista 7130-series switching fabric to underpin its trading platform. The fabric is engineered to deliver deterministic, sub-microsecond Layer 1 / Layer 2 switching between trading engines, market-data feeds, and exchange handoffs. Before any of this touches production, the program mandate was explicit: validate the *harvest-design-deploy* automation model against a **live Arista cEOS lab** so that the delivery mechanics are proven prior to cutover.

This case study reports on four completed autonomous delivery pipelines executed through the pAIchart pipeline harness, spanning three distinct infrastructure domains — network device provisioning, Kubernetes GitOps, and cloud infrastructure-as-code. The headline result is a consistent, auditable delivery pattern that produced reviewed, approved change packages in every domain, while never once mutating live infrastructure. One pipeline was deliberately blocked at review, which we treat as a feature, not a footnote.

**A note on the delivery model, stated plainly.** pAIchart never actuates infrastructure. Every pipeline in this engagement produced an **approved-but-unapplied change package**. Apply and deploy are always a separate, out-of-band, human-gated step performed outside the platform. Throughout this document, every change is described as *designed and reviewed* — never as deployed, live, or in effect. That boundary is the foundation of the trust posture described in §5.

---

## 2. Delivery Methodology: One Repeatable Shape Across Three Domains

All four pipelines decomposed into an identical four-child linear dependency chain: a self-provisioning **read-only state Harvester** (no dependencies) → a **Design/Architect** specialist → an **Author** that produces the deliverable → an independent **Reviewer** acting as a QA gate. The same orchestration pattern generalized cleanly across EOS/BGP device configuration, Kubernetes manifests, and Terraform HCL, with no domain-specific pipeline shape required — the network runs (Loopback0+BGP stage `cmquelktk004kyxg4qvgwqr7e`, PTP stage `cmr1eqj23000dyxo5a6zuav5u`), the Kubernetes run (`cmqx7g4uk000fyxhiist48yz7`), and the Terraform run (`cmqyoxipi000hyxfcrkwgwjmp`) all followed it.

The delivery record is designed to be permanent. Each completed pipeline is immutable and cannot be re-run in place; the harness's own guidance, worded identically across runs, directs operators to "create a fresh PIPELINE task — the harness will produce a new child stage and keep this run's artifacts intact for comparison." This is a deliberate governance choice: every approved change package remains a comparable audit record rather than being overwritten.

Confidence in an outcome is not an opaque holistic judgment. Each pipeline's overall score is the arithmetic mean of its four independently-scored children — the Loopback0+BGP and PTP runs both computed as (92+88+88+92)/4 = 90, and the Terraform run as (92+88+88+90)/4 = 89.5 — which means any "approved" claim is traceable back to the specific quality gates that substantiate it.

---

## 3. Network Delivery Against the Live cEOS Lab

### 3.1 Loopback0 + BGP — Deterministic Reachability

The read-only harvest covered both cEOS switches (ceos1 in AS65001, ceos2 in AS65002), confirmed BGP peering was stable, and confirmed no Loopback0 was present before the change. The Design and Author stages produced per-device EOS configuration adding a Loopback0 /32 and its BGP advertisement, paired with deterministic show-command validation and per-device rollback. Critically, **zero mutating commands were run against the live lab at any point** — which is why the POV's "harvest-design-deploy" objective is validated here as harvest-design-*package*, with device actuation held explicitly out of scope. The package cleared all four gates (Harvest 92, Design 88, Author 88, Review 92 — average 90/100, above the 85 approval threshold), completing in 65 seconds with 11/11 tool calls succeeding.

### 3.2 PTP Boundary-Clock Time Sync — Honest About the Unknown

The timing harvest found a genuinely greenfield environment: two cEOS devices linked via Et1 (10.0.12.0/30), no PTP configured, NTP unconfigured, and BGP already UP. The Design stage proposed an explicit priority1/priority2 grandmaster/boundary-clock hierarchy with per-interface master/slave roles — and then **flagged the grandmaster / primary reference time clock (GM/PRTC) source as a GAP** because it was unevidenced in the harvested state. Rather than inventing an assumed timing source, the pipeline surfaced the missing evidence as an explicit gap, and it ordered the change package upstream-boundary-clock-first specifically to avoid a timing flap during eventual apply. This package also scored an average of 90/100 (92/88/88/92).

---

## 4. Kubernetes and Cloud IaC Delivery

### 4.1 orders-api HPA — Mechanics Clean, Review Correctly Blocked

The Kubernetes GitOps pipeline designed a HorizontalPodAutoscaler (min 2 / max 5 / 70% CPU target) plus resource requests and limits for the `orders-api` deployment in the `trading` namespace. The pipeline mechanics ran flawlessly: the CREATE-mode run queued four children in strict dependency order, the SYNTHESIZE-mode run executed 15/15 tool calls in 142 seconds to quality-gate and aggregate results, and the read-only service was torn down cleanly at the end. The harness demonstrably separates "did the automation work correctly" from "did the proposed change pass review."

Those are two different questions, and here they had two different answers — which is the point of §5.

### 4.2 acme-app-logs S3 Hardening — Additive-Only on a Prod Bucket

The Terraform harvest on the prod workspace found `aws_s3_bucket.app_logs` already existing with versioning disabled and no public-access-block, and reported no drift. The approved change package was **+2 add, 0 change, 0 destroy** — adding an `aws_s3_bucket_versioning_configuration` (Enabled) and an `aws_s3_bucket_public_access_block` (all four flags true) without touching or replacing the existing bucket. For a production logging bucket, that additive-only property is the single most important safety characteristic, and it was called out in both the harvest and the reviewer's approval reasoning. The rollback design also correctly modeled a subtle AWS constraint: S3 versioning is a one-way ratchet that can only be moved to `Suspended`, never back to disabled, and existing object versions are retained regardless — a nuance a naive "revert the diff" rollback would get wrong. The reviewer scored the rollback "sound" and the package averaged 89.5/100 (92/88/88/90).

---

## 5. Why This Delivery Model Is Trustworthy

The trust posture is not a marketing claim layered over the automation — it is built into the mechanics, and the clearest evidence is a change that **did not** get approved.

**An independent reviewer that actually blocks.** The `orders-api` HPA package was scored **NEEDS-REVISION** at 72/100, below the 85 approval threshold, because its CPU/memory request and limit values were *assumed* rather than *evidenced* from harvested resource-usage data. This is the one case across all four runs where the adversarial-review gate refused to rubber-stamp, and it drove the run's overall completion confidence to 82/100 rather than a clean passing average. It is direct proof the review step is not decorative — and it is the most credibility-building detail in this entire engagement, which is why we lead the trust section with it rather than hiding it.

**Read-only harvest, restricted by construction.** State is gathered read-only, and the restriction is enforced at the tool-schema level, not merely by policy instruction. The Kubernetes harvester (`k8s-rig-readonly`) exposed exactly three tools — `list_resources` (allowlisted kinds only), `get_resource`, and `list_secret_names` scoped explicitly to "metadata only, never values" — with out-of-policy calls returning a structured `isError` rather than leaking data. Secrets handling is a verb-enum-plus-RBAC design control, not a stated intention.

**Unconditional data erasure.** Every pipeline's self-provisioned read-only service was torn down at synthesis: `ceos-lab-readonly` (deleted with no orphaned registration on the BGP run, "4 interactions purged" on PTP), `k8s-rig-readonly`, and `terraform-rig-readonly` ("GDPR erasure exercised"). Teardown ran even on the Kubernetes pipeline that produced the non-approved outcome — confirming erasure is unconditional, not contingent on success — with zero orphaned service registrations across all four runs.

Taken together: current state is read-only and RBAC-scoped, secrets and raw state are redacted by schema, every change package is gated by an independent adversarial reviewer whose verdict is a computed, reproducible average, the completed run is immutable for audit, and nothing is ever actuated by the platform. The customer approves and applies — the automation prepares and proves.

---

## 6. Summary Scorecard

| Pipeline | Domain | Change Shape | Verdict | Score |
|---|---|---|---|---|
| Loopback0 + BGP | Network (EOS/BGP) | Add Loopback0 /32 + BGP advert, per-device rollback | APPROVED | 90/100 |
| PTP boundary-clock | Network (timing) | GM/BC hierarchy; GM source flagged as GAP | APPROVED | 90/100 |
| orders-api HPA + limits | Kubernetes GitOps | HPA min2/max5/70% + requests/limits | **NEEDS-REVISION** | 72/100 (run 82/100) |
| acme-app-logs S3 hardening | Cloud IaC (Terraform) | +2 add, 0 change, 0 destroy (versioning + PAB) | APPROVED | 89.5/100 |

*Every row above is an approved-or-flagged change **package**. None has been applied to live infrastructure — apply is a separate, human-gated step outside pAIchart.*

---

## 7. Regional / Compliance Note

Meridian Capital operates in Australia (Eastern Australia). The delivery model aligns naturally with ASD Essential Eight expectations relevant to this scope: least-privilege access (read-only, RBAC-scoped harvest tooling), restricting administrative changes (no platform actuation; human-gated apply), and auditability (immutable completed pipelines with traceable per-gate scoring). Formal Essential Eight maturity mapping is recommended as a handover follow-up but is outside the four validated pipelines covered here.
