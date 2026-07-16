# Meridian Capital — Trading Fabric: Demo Exhibit 2 (frozen-cone escalation)

Iteration: demo-ex2 (two parallel pipelines; after the human approves the plan, one leg's binding
interface contract is removed by the operator — the program must escalate, not hang and not
silently compose) · 2026-07-16

## Program scope

- Two delivery domains in PARALLEL (no cross-domain ordering):
  1. **Network provisioning** on the cEOS lab (`topology.json`).
  2. **Cloud IaC (Terraform)** on the telemetry-archive tier.
- Kubernetes/GitOps out of scope.

## Pipeline 1 objective — network provisioning

- Provision a **Loopback8** interface on both fabric switches (ceos1 → 8.8.8.1/32, ceos2 → 8.8.8.2/32)
  and advertise each /32 into the existing eBGP session via a `network` statement (no redistribution).
- Read-only harvest via:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`

## Pipeline 2 objective — cloud IaC (Terraform)

- On `aws_s3_bucket.app_logs` (bucket `acme-app-logs`, workspace prod): add configuration-archive tags
  (`meridian-demo-ex2`, `backup-tier: fabric-config-archive`). Emit a declarative HCL diff as a PR.
- Read-only state harvest via this descriptor:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json`

## Design constraints (interface-contract inputs)

- ASNs exactly as in `topology.json` (ceos1 = 65001, ceos2 = 65002). Do not renumber.
- Point-to-point link `10.0.12.0/30` stays as-is.
- Loopback8 addresses: ceos1 = 8.8.8.1/32, ceos2 = 8.8.8.2/32.
- Terraform target: `aws_s3_bucket.app_logs` only.
- Shared tag `meridian-demo-ex2`; change window "lab — any time".

## Acceptance

- Each change package: deterministic validation + rollback. Apply out-of-band, human-gated.
- Approved change packages only — never applied changes.
