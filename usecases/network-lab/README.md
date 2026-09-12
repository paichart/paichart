# Network lab — a recipe, not a one-command lab

A two-node Arista fabric with [containerlab](https://containerlab.dev), the Nornir inventory that
drives it, and the **read-only MCP service** the pipeline harvests through.

> ⚠️ **You must supply the cEOS image yourself.** `ceos:4.32.2.1F` is Arista's container image and is
> not redistributable — registration at [arista.com](https://www.arista.com/en/support/software-download)
> is free, and you import the tarball with `docker import`. **That is why this is a recipe rather than
> a lab you can `docker compose up`** — everything else here is complete and runs unmodified. If you
> have real Arista devices, skip containerlab entirely: point `nornir/hosts.yaml` at them and read on.

Pairs with: [`protocols/network-provisioning-protocol.md`](../../protocols/network-provisioning-protocol.md) ·
[`descriptors/ceos-lab-readonly-descriptor.json`](../../descriptors/ceos-lab-readonly-descriptor.json) ·
worked outputs in [`examples/network-provisioning-change-report.md`](../../examples/network-provisioning-change-report.md)
and the [PTP timing change](../../examples/network-provisioning-ptp-change-report.md).

## What is here

| File | What it is |
|---|---|
| `topology.clab.yml` | the containerlab topology — 2 nodes, one link |
| `ceos1-startup.cfg`, `ceos2-startup.cfg` | device startup-configs: management, the link, a BGP session, and some pre-existing loopbacks so a design has real state to fit around |
| `nornir/` | inventory (`hosts`, `groups`, `defaults`) and Nornir config |
| `nornir-mcp-docker/` | the read-only MCP service — a thin HTTP wrapper over NAPALM getters |

## Bring-up

```bash
# 1. Import your own cEOS image, then tag it to match topology.clab.yml
docker import cEOS64-lab-4.32.2.1F.tar ceos:4.32.2.1F

# 2. Start the fabric
sudo containerlab deploy -t topology.clab.yml

# 3. Build and run the read-only service (defaults to :3107)
docker build -t nornir-mcp ./nornir-mcp-docker
docker run -d --name nornir-mcp --network host -e PORT=3107 \
  -v "$PWD/nornir:/app/nornir:ro" nornir-mcp
```

Liveness: a bare `GET /mcp` returns 406 or 400 depending on the MCP library version — both mean
*alive, wrong headers*. The real check is an `initialize` call.

## The lab credential — change it if this lab is reachable by anything else

`nornir/groups.yaml` and the two `*-startup.cfg` files share a static credential (`paichartlab`) and
**must agree** — that is why it is a documented default here rather than a template. It is fine for a
disposable lab on a host only you can reach. It is not fine anywhere else. If in doubt, change it in
all three files.

## What makes the service read-only

It exposes **NAPALM getters only** — `get_facts`, `get_interfaces`, `get_bgp_neighbors`,
`get_config` and friends. There is no `cli`, no `load_merge_candidate`, no `commit_config`: a mutating
call is not refused at runtime, it **does not exist to be called**. That is the strongest form of the
read-only floor in this repo, because it is structural rather than enforced.

Verify it the way you should verify any of these services — by trying:

```bash
# list the tools the service actually exposes; there is nothing that writes
curl -s -X POST http://127.0.0.1:3107/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | head -c 400
```

## Point a pipeline at it

Copy `descriptors/ceos-lab-readonly-descriptor.json`, set `endpoint` to wherever **your hub** can reach
the service, and put that URL in the task description.

Objectives with real state to fit around: add a Loopback per switch and advertise it into BGP; migrate
the IGP; add a PTP boundary clock. The published examples are exactly those.

## Teardown

```bash
docker rm -f nornir-mcp
sudo containerlab destroy -t topology.clab.yml
```

## Honest scope

Containerized cEOS is not your production fabric — no real optics, no real convergence behaviour under
load — and the service authenticates with a static lab credential rather than a per-user identity. It
exercises the full cognition pipeline and the read-only floor against **real device output**: the
change packages in `examples/` were generated from live `show` output and applied by hand afterwards.
