# Meridian Capital — Trading Fabric: T4b Failed-Leg Round

Iteration: T4b (two parallel pipelines; the terraform leg's harvest service is deliberately unreachable) · 2026-07-15

## Program scope

- Two delivery domains in PARALLEL (no cross-domain ordering):
  1. **Network provisioning** on the cEOS lab (`topology.json`).
  2. **Cloud IaC (Terraform)** on the telemetry-archive tier.
- Kubernetes/GitOps out of scope.

## Pipeline 1 objective — network provisioning

- Provision a **Loopback2** interface on both fabric switches (ceos1 → 111.1.1.1/32,
  ceos2 → 222.2.2.2/32) and advertise each /32 into the existing eBGP session via a `network`
  statement (no redistribution).
- Read-only harvest via:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`

## Pipeline 2 objective — cloud IaC (Terraform)

- On `aws_s3_bucket.app_logs` (bucket `acme-app-logs`, workspace prod): add object-lock / retention
  hardening. Emit a declarative HCL diff as a PR — never an applied change.
- Read-only state harvest via this descriptor:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/DELIBERATELY-MISSING-t4b-descriptor.json`
  (NOTE: this URL is intentionally non-existent for the T4b failed-leg test — the harvest cannot
  self-provision and this leg is expected to FAIL.)

## Design constraints (interface-contract inputs)

- ASNs exactly as in `topology.json` (ceos1 = 65001, ceos2 = 65002). Do not renumber.
- Point-to-point link `10.0.12.0/30` stays as-is.
- Loopback2 addresses: ceos1 = 111.1.1.1/32, ceos2 = 222.2.2.2/32.
- Terraform target: `aws_s3_bucket.app_logs` only.
- Shared tag `meridian-t4b`; change window "lab — any time".

## Acceptance

- Each change package: deterministic validation + rollback. Apply out-of-band, human-gated.
- Approved change packages only — never applied changes.
