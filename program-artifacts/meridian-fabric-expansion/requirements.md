# Meridian Capital — Trading Fabric Expansion: Program Requirements

Iteration: T2 (single-domain validation scope) · 2026-07-15

## Program scope

- This program iteration covers **one delivery domain only: network provisioning** on the existing
  2-switch Arista cEOS trading-fabric lab described in `topology.json` (same directory).
- Kubernetes/GitOps and cloud-IaC work are explicitly **out of scope** for this iteration.

## Pipeline objective (one pipeline)

- Provision a `Loopback0` interface on **both** fabric switches and advertise each loopback into BGP,
  so each switch's loopback is reachable from its peer via the existing eBGP session.
- Loopback0 addresses MUST equal each device's BGP router ID, as /32s
  (ceos1 → 1.1.1.1/32, ceos2 → 2.2.2.2/32).

## Device access for state harvest

- Current device state must be harvested **read-only** via the lab's read-only network service.
- Service descriptor:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`

## Design constraints (interface-contract inputs)

- **ASNs**: exactly as in `topology.json` (ceos1 = 65001, ceos2 = 65002). Do not renumber.
- **Point-to-point link**: `10.0.12.0/30` stays as-is (ceos1 = 10.0.12.1/30, ceos2 = 10.0.12.2/30).
- **Loopbacks**: interface name exactly `Loopback0`; address = router ID /32 per device.
- **BGP advertisement**: `network` statements for the /32s (no redistribution).
- **Naming/tags**: change entries tagged `meridian-fabric-expansion`; change window "lab — any time".

## Acceptance

- The change package must include deterministic validation commands with expected outputs, and a
  rollback plan per device.
- **Apply is out-of-band and human-gated.** This program produces an approved change package only —
  never an applied change.
