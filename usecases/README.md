# Use cases — and labs you can stand up yourself

Two kinds of thing live here:

- **`*-lab/`** — a reproducible environment plus the read-only MCP service a pipeline harvests
  through. Clone, bring up, point a pipeline at it. These are the same rigs the published
  [examples](../examples/) and [verification pack](../verification/) were produced against.
- **Everything else** — worked program inputs (`requirements.md` + `topology.json`) for a
  multi-pipeline program.

## The labs

| Lab | Stands up | Free to run? |
|---|---|---|
| [`kubernetes-lab/`](./kubernetes-lab/) | a `kind` cluster with a workload that has real gaps — no HPA, no limits, no PDB, no NetworkPolicy | Yes |
| [`terraform-lab/`](./terraform-lab/) | LocalStack + a Terraform workspace with real state | Yes |
| [`observability-lab/`](./observability-lab/) | Prometheus + Grafana + an OpenTelemetry collector | Yes |

Each lab's README covers bring-up, **how to prove the service is read-only rather than trust that it
is**, how to point a pipeline at it, teardown, and an honest scope note.

## What is NOT here, and why

**The network-provisioning rig is not published.** It runs on Arista cEOS, whose container image
requires an Arista account — so we could publish a recipe but not something you could actually run,
and a lab you cannot run is worse than an honest absence. The
[protocol](../protocols/network-provisioning-protocol.md), the
[descriptor](../descriptors/ceos-lab-readonly-descriptor.json) and two worked
[examples](../examples/network-provisioning-change-report.md) are all published; if you have a cEOS
image or real devices, the descriptor tells you the tool surface a device service must expose.

## The read-only floor is the part worth copying

Each lab's service exposes a **verb allowlist** — there is no write, exec, or secret-value verb to
call — and where the platform underneath supports it (Kubernetes RBAC, a `:ro` mount), a second,
independent limit backs it. Each README shows you how to **prove** both rather than trust them.

That is the contract a device or cloud service must meet to be safe to point a pipeline at, and
[`descriptors/SPEC.md`](../descriptors/SPEC.md) is its written form. **A descriptor never carries
credentials** — your service holds its own — which is why these files are safe to publish at all.
