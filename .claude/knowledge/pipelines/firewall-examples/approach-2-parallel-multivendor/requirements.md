# Acme — Partner HTTPS Access Path (Approach 2: parallel program, shared contract)

ILLUSTRATIVE worked example for `firewall-policy-use-case.md`. A program that produces an
**approved-but-unapplied** end-to-end security-policy change across a three-vendor firewall path,
coordinated by a shared interface contract, with per-team approval gates.

## Program scope

Configure a consistent partner-HTTPS access policy across the path
`partner-internet → edge-fw → dmz-sg → core-fw → internal-app`:

- **Permit** TCP/443 from `203.0.113.0/24` (partner CIDR) to `10.20.0.10/32` (internal app).
- **Deny** everything else (default-deny at every hop).
- **Consistent logging** to the central SIEM profile at every hop, including deny logging.
- **No asymmetric holes**: every hop permits EXACTLY this 5-tuple and no broader; return traffic is
  the established/related session, never a separate broad inbound rule.

Three delivery domains in **PARALLEL** (no cross-domain ordering — the interdependencies are all
declarative constants, resolved into the interface contract up front):

1. **edge-fw** (Palo Alto, network-security team) — perimeter rule untrust→dmz for the partner flow.
2. **dmz-sg** (AWS security group, cloud-platform team, Terraform) — ingress/egress for the flow.
3. **core-fw** (Cisco ASA, core-network team) — core rule dmz→inside for the partner flow.

Kubernetes/GitOps out of scope.

## Design constraints (interface-contract inputs)

The Program Architect resolves these into the binding contract every leg honors:

- **End-to-end flow (verbatim at every hop)**: src `203.0.113.0/24`, dst `10.20.0.10/32`, tcp/443, permit.
- **Default action**: deny (explicit deny rule + deny logging at every hop).
- **No source NAT** on this path — addressing is pre-NAT and identical at every hop (this is what keeps
  the interdependency declarative; contrast Approach 3).
- **Logging**: central-SIEM profile, log at each hop, deny logging on.
- **Naming**: rule tag `PARTNER-HTTPS-2026`; zone map `untrust→internet`, `dmz→dmz`, `inside→internal`.
- **Change window**: "coordinated — see apply-order note in the deliverable" (apply is out-of-band).

## Per-team approvals (drives the gate DAG)

Each domain has its own named approver → the Architect emits a per-domain approval gate (v1.0.2
multi-team gates), in addition to the mandatory program plan-approval gate:

- edge-fw change → `network-security-lead`
- dmz-sg change → `cloud-platform-lead`
- core-fw change → `core-network-lead`

## Acceptance

- Each change package: deterministic validation + rollback. Apply out-of-band, human-gated.
- **Approved change packages only** — never applied changes.
- The composed program deliverable names the **path-safe apply order** (core-fw first, then dmz-sg,
  then edge-fw — provision the innermost hop first so the outer hop is never opened before the inner
  hop is ready; the reverse would briefly permit traffic the core would drop). Apply itself stays human.
- The program integration reviewer (Node C) verifies end-to-end conformance: each device implements
  exactly its slice of the shared flow, zone names line up, logging is consistent, and there is no
  asymmetric hole.
