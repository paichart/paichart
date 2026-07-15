# Meridian Capital — Trading Fabric: T4b' Frozen-Cone Round

Iteration: T4b' (two parallel pipelines, both with VALID descriptors; one leg's contract is stripped post-gate to force a non-completing leg) · 2026-07-15

## Program scope

- Two delivery domains in PARALLEL (no cross-domain ordering):
  1. **Network provisioning** on the cEOS lab (`topology.json`).
  2. **Cloud IaC (Terraform)** on the telemetry-archive tier.
- Kubernetes/GitOps out of scope.

## Pipeline 1 objective — network provisioning

- Provision a **Loopback3** interface on both fabric switches (ceos1 → 33.3.3.3/32, ceos2 → 44.4.4.4/32)
  and advertise each /32 into the existing eBGP session via a `network` statement (no redistribution).
- Read-only harvest via:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`

## Pipeline 2 objective — cloud IaC (Terraform)

- On `aws_s3_bucket.app_logs` (bucket `acme-app-logs`, workspace prod): add cost-allocation tags
  (`meridian-t4bprime`, `cost-center: trading-fabric`). Emit a declarative HCL diff as a PR.
- Read-only state harvest via this descriptor:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json`

## Design constraints (interface-contract inputs)

- ASNs exactly as in `topology.json` (ceos1 = 65001, ceos2 = 65002). Do not renumber.
- Point-to-point link `10.0.12.0/30` stays as-is.
- Loopback3 addresses: ceos1 = 33.3.3.3/32, ceos2 = 44.4.4.4/32.
- Terraform target: `aws_s3_bucket.app_logs` only.
- Shared tag `meridian-t4bprime`; change window "lab — any time".

## Acceptance

- Each change package: deterministic validation + rollback. Apply out-of-band, human-gated.
- Approved change packages only — never applied changes.
