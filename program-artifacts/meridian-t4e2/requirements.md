# Meridian Capital — Trading Fabric: T4e2 Coverage-Block Round (deterministic hold)

Iteration: T4e2 (two parallel pipelines, both with VALID descriptors; both legs expected to COMPLETE — one leg's deliverable artifact is removed post-completion by the operator to probe the program's chained-coverage gate) · 2026-07-16

## Program scope

- Two delivery domains in PARALLEL (no cross-domain ordering):
  1. **Network provisioning** on the cEOS lab (`topology.json`).
  2. **Cloud IaC (Terraform)** on the telemetry-archive tier.
- Kubernetes/GitOps out of scope.

## Pipeline 1 objective — network provisioning

- Provision a **Loopback5** interface on both fabric switches (ceos1 → 77.7.7.7/32, ceos2 → 88.8.8.8/32)
  and advertise each /32 into the existing eBGP session via a `network` statement (no redistribution).
- Read-only harvest via:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`

## Pipeline 2 objective — cloud IaC (Terraform)

- On `aws_s3_bucket.app_logs` (bucket `acme-app-logs`, workspace prod): add archive-tier governance tags
  (`meridian-t4e2`, `archive-tier: fabric-telemetry-cold`). Emit a declarative HCL diff as a PR.
- Read-only state harvest via this descriptor:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json`

## Design constraints (interface-contract inputs)

- ASNs exactly as in `topology.json` (ceos1 = 65001, ceos2 = 65002). Do not renumber.
- Point-to-point link `10.0.12.0/30` stays as-is.
- Loopback5 addresses: ceos1 = 77.7.7.7/32, ceos2 = 88.8.8.8/32.
- Terraform target: `aws_s3_bucket.app_logs` only.
- Shared tag `meridian-t4e2`; change window "lab — any time".

## Acceptance

- Each change package: deterministic validation + rollback. Apply out-of-band, human-gated.
- Approved change packages only — never applied changes.
