# Meridian Capital — Trading Fabric: Demo Exhibit 4 (the human gate, parked forever)

Iteration: demo-ex4 (two parallel pipelines; the plan-approval gate is deliberately NEVER released —
this program is a living exhibit of the human-gate mechanism: nothing downstream may ever run) · 2026-07-16

## Program scope

- Two delivery domains in PARALLEL (no cross-domain ordering):
  1. **Network provisioning** on the cEOS lab (`topology.json`).
  2. **Cloud IaC (Terraform)** on the telemetry-archive tier.
- Kubernetes/GitOps out of scope.

## Pipeline 1 objective — network provisioning

- Provision a **Loopback9** interface on both fabric switches (ceos1 → 9.9.9.1/32, ceos2 → 9.9.9.2/32)
  and advertise each /32 into the existing eBGP session via a `network` statement (no redistribution).
- Read-only harvest via:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`

## Pipeline 2 objective — cloud IaC (Terraform)

- On `aws_s3_bucket.app_logs` (bucket `acme-app-logs`, workspace prod): add capacity-planning tags
  (`meridian-demo-ex4`, `capacity-tier: fabric-growth-model`). Emit a declarative HCL diff as a PR.
- Read-only state harvest via this descriptor:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json`

## Design constraints (interface-contract inputs)

- ASNs exactly as in `topology.json` (ceos1 = 65001, ceos2 = 65002). Do not renumber.
- Point-to-point link `10.0.12.0/30` stays as-is.
- Loopback9 addresses: ceos1 = 9.9.9.1/32, ceos2 = 9.9.9.2/32.
- Terraform target: `aws_s3_bucket.app_logs` only.
- Shared tag `meridian-demo-ex4`; change window "lab — any time".

## Acceptance

- Each change package: deterministic validation + rollback. Apply out-of-band, human-gated.
- Approved change packages only — never applied changes.
