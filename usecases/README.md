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
| [`network-lab/`](./network-lab/) | a 2-node Arista fabric via containerlab + Nornir | **Recipe** — you supply the cEOS image (free Arista account) |

Each lab's README covers bring-up, **how to prove the service is read-only rather than trust that it
is**, how to point a pipeline at it, teardown, and an honest scope note.

## The network recipe

[`network-lab/`](./network-lab/) is a **recipe rather than a one-command lab**, and the distinction is
honest rather than coy: the Arista cEOS container image is not redistributable, so you register (free)
and import it yourself. Everything else — the containerlab topology, the device startup-configs, the
Nornir inventory, and the read-only MCP service — is complete and runs unmodified. If you have real
Arista devices, point the inventory at them and skip containerlab entirely.

## The read-only floor is the part worth copying

Each lab's service exposes a **verb allowlist** — there is no write, exec, or secret-value verb to
call — and where the platform underneath supports it (Kubernetes RBAC, a `:ro` mount), a second,
independent limit backs it. Each README shows you how to **prove** both rather than trust them.

That is the contract a device or cloud service must meet to be safe to point a pipeline at, and
[`descriptors/SPEC.md`](../descriptors/SPEC.md) is its written form. **A descriptor never carries
credentials** — your service holds its own — which is why these files are safe to publish at all.
