# Meridian Capital — Trading Fabric Expansion: Program Requirements

Iteration: T3 (multi-domain, multi-team) · 2026-07-15

## Program scope

- This program iteration covers **two delivery domains, executed in PARALLEL** (no cross-domain
  ordering dependency between the pipelines):
  1. **Network provisioning** on the 2-switch Arista cEOS trading-fabric lab in `topology.json`.
  2. **Cloud IaC (Terraform)** on the fabric's telemetry-archive tier (the `telemetry-archive`
     node in `topology.json`).
- Kubernetes/GitOps work is explicitly **out of scope** for this iteration.

## Approvals (multi-team — one gate per domain, plus the program plan gate)

- The **network change** requires its own approval before the network pipeline may run.
  Approver: **Steve Terry** (network engineering).
- The **cloud IaC change** requires its own approval before the terraform pipeline may run.
  Approver: **Steve Terry** (cloud platform).
- Each domain gate releases ONLY its own pipeline; the two pipelines are otherwise independent
  and run in parallel once released.

## Pipeline 1 objective — network provisioning

- Provision a `Loopback0` interface on **both** fabric switches and advertise each loopback into
  BGP, so each switch's loopback is reachable from its peer via the existing eBGP session.
- Loopback0 addresses MUST equal each device's BGP router ID as /32s
  (ceos1 → 1.1.1.1/32, ceos2 → 2.2.2.2/32).
- Device state harvest is **read-only** via the lab's read-only network service. Service descriptor:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`

## Pipeline 2 objective — cloud IaC (Terraform)

- On the telemetry-archive bucket (`aws_s3_bucket.app_logs`, bucket `acme-app-logs`, workspace
  **prod**): enable **versioning** and attach a **public access block** with all four settings true
  (BlockPublicAcls, IgnorePublicAcls, BlockPublicPolicy, RestrictPublicBuckets).
- Emit a declarative HCL diff as a PR — never imperative CLI, never an applied change.
- State harvest is **read-only** via the workspace's read-only Terraform service (`state_list` +
  redacted `state_pull` only). Service descriptor:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json`

## Design constraints (interface-contract inputs)

- **ASNs**: exactly as in `topology.json` (ceos1 = 65001, ceos2 = 65002). Do not renumber.
- **Point-to-point link**: `10.0.12.0/30` stays as-is (ceos1 = 10.0.12.1/30, ceos2 = 10.0.12.2/30).
- **Loopbacks**: interface name exactly `Loopback0`; address = router ID /32 per device.
- **BGP advertisement**: `network` statements for the /32s (no redistribution).
- **Terraform target**: `aws_s3_bucket.app_logs` only — no other resources may change; any
  out-of-scope drift found in state must be flagged, never silently absorbed.
- **Shared naming/tags (BOTH domains)**: every change entry tagged `meridian-fabric-expansion`;
  change window "lab — any time".

## Acceptance

- Each change package must include deterministic validation with expected outputs (network: exact
  `show` commands; terraform: expected `terraform validate`/`plan` count facts for the team's CI)
  and a rollback plan.
- **Apply is out-of-band and human-gated in both domains.** This program produces approved change
  packages only — never applied changes.
