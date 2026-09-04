# Acme — Partner HTTPS Access Path, single-vendor (Approach 1: one pipeline, multi-device)

ILLUSTRATIVE worked example for `firewall-policy-use-case.md` §3 Approach 1. The **same** partner-HTTPS path
as Approaches 2/3, but all three firewalls are **one vendor (PAN-OS)** owned by **one team**. Modeled as a
**single `network-provisioning` pipeline** — no program, no interface contract, no DAG. This is the shape the
demos already proved (two cEOS switches configured in one pipeline).

## Objective (this is a single PIPELINE task, launched per PIPELINE-HARNESS-USER-GUIDE)

Produce an **approved-but-unapplied** end-to-end partner-HTTPS policy across
`partner-internet → edge-fw → dmz-fw → core-fw → internal-app` (all PAN-OS):

- **Permit** TCP/443 from `203.0.113.0/24` (partner CIDR) to `10.20.0.10/32` (internal app) at every hop.
- **Deny** everything else (default-deny at every hop).
- **Consistent logging** to the central SIEM at every hop, including deny logging.
- **No asymmetric holes**: every hop permits EXACTLY this 5-tuple; return traffic is the established/related
  session, never a separate broad inbound rule.

## The 4-stage decomposition (all inside ONE pipeline)

Unlike Approaches 2/3, there are no sibling pipelines and no cross-pipeline coordination — the harness
decomposes this ONE objective into typed specialist tasks whose deliverables chain via **§6 (intra-pipeline)**:

1. **Harvest** (read-only) — one State Harvester reads all three devices' zones, security rules, and log
   profiles in a single pass.
2. **Design** — one Architect holds all three devices in §6 **at once** and produces the coherent end-to-end
   rule set. The interdependency (what edge permits constrains what dmz must match, etc.) is resolved **inside
   this one designer's context** — it sees the whole path, so there is nothing to coordinate across pipelines.
3. **Author** — the per-device PAN-OS config diff (one change package per firewall).
4. **Review** — end-to-end consistency + blast-radius + rollback adequacy (a single reviewer over the whole
   path — this is per-pipeline review, NOT a program Node C, because there are no sibling pipelines to reconcile).

## Approvals

**One** approval — `network-security-lead` — because it is one team's change. No per-team gate DAG (that is a
program construct); the single PIPELINE task's own confidence gate + human review are the control.

## Acceptance

- Each per-device change package: deterministic validation + rollback. Apply out-of-band, human-gated.
  **Approved change packages only** — never applied changes.
- The deliverable names the path-safe **apply order** (core-fw → dmz-fw → edge-fw — innermost first). Note
  this is an apply-time property of the deliverable, exactly as in Approaches 2/3; it is independent of how
  the pipeline internally ordered its work.

## When to STOP using Approach 1 (escalate to a program)

Re-run the seam test if any of these appears — each is a boundary that a single pipeline can't hold:
- a **second vendor** enters the path (one specialist chain can't harvest+design two vendors) → Approach 2/3;
- a **second approval team** owns part of the path (needs its own gate) → Approach 2/3;
- a **genuine runtime dependency across a boundary** the single designer can't hold in one context → Approach 3.

Until then, a program is pure overhead. Start here (`firewall-policy-use-case.md` §4, "Start at Approach 1").
