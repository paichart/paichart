# Meridian Capital — Trading Fabric: T4a Fault-Injection Round

Iteration: T4a (single network pipeline; used for the contract-strip + gate-hold failure tests) · 2026-07-15

## Program scope

- One delivery domain: **network provisioning** on the 2-switch Arista cEOS lab (`topology.json`).
- Kubernetes/GitOps and cloud-IaC are out of scope for this iteration.

## Pipeline objective (one pipeline)

- Provision a **Loopback1** interface on both fabric switches (ceos1 → 11.11.11.11/32,
  ceos2 → 22.22.22.22/32) as a distinct diagnostic loopback, and advertise each /32 into the existing
  eBGP session via a `network` statement (no redistribution).

## Device access for state harvest

- Read-only via the lab's read-only network service:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`

## Design constraints (interface-contract inputs)

- ASNs exactly as in `topology.json` (ceos1 = 65001, ceos2 = 65002). Do not renumber.
- Point-to-point link `10.0.12.0/30` stays as-is.
- Loopback1 addresses: ceos1 = 11.11.11.11/32, ceos2 = 22.22.22.22/32.
- Change entries tagged `meridian-t4a-diagnostic`; change window "lab — any time".

## Acceptance

- Deterministic validation commands with expected outputs + a per-device rollback plan.
- Apply is out-of-band and human-gated — approved change package only, never an applied change.
