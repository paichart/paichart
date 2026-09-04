# Phase-4 cEOS Validation Rig — Runbook

> **Status**: DRAFT, 2026-06-25 · **Purpose**: validate the network-provisioning pipeline's **cognition**
> (harvest → design → change-package) against a **real (simulated) Arista EOS device**, plus the **R9
> sanitizer** firing on real device output — the things the context7 stand-in (spike Run 1) could not exercise.
> **Roadmap**: this is ROADMAP.md **Phase 4**. **Spec**: `../DEVICE-SERVICE-INTEGRATION-SPEC.md` (WS4).

## What this rig is (and what it deliberately is NOT)

A 2-node Arista cEOS lab + the `sydasif/nornir-mcp-server` (NAPALM read-only getters) running **on prod**,
exposed to pAIchart through an **ephemeral cloudflared HTTPS tunnel**, registered as a transient external
service, and driven by a `(protocol: network-provisioning)` pipeline task.

> **Third-party attribution.** The harvest gateway is [`nornir-mcp-server`](https://github.com/sydasif/nornir-mcp-server)
> by **Syed Asif** ([@sydasif](https://github.com/sydasif)), **MIT-licensed**. We run it **unmodified** — the
> Dockerfile fetches the upstream `main` tarball at build time; our only additions are the `run_http.py` transport
> shim and the four `nornir/` inventory files. Credit it as such anywhere the harvest gateway is described publicly.
> *(Note, 2026-07-22: upstream declares MIT in its README but ships no `LICENSE` file and carries no copyright line —
> the grant is the author's stated intent; there is no canonical notice text to copy. Attribution here is by good
> practice; we do not vendor its source, so no MIT copy-notice obligation is triggered.)*

## Rig variants in this directory

| directory | nodes | protocol baseline | status |
|---|---|---|---|
| `.` (this runbook) | 2 | BGP + T6 seed | the original phase-4 rig |
| `igp-2node/` | 2 | OSPF area 0 only | **built + run 2026-08-24/25** — the IGP-migration arc's rig |
| `igp-triangle/` | 3 | OSPF area 0 only | **SHELVED** — measured not to fit this host at any cap, and cEOS does not boot on the off-host VM |

Each variant carries its own README and its own lab name, bridge and mgmt subnet, so two can coexist —
but **memory is the binding constraint on this host**: check the sums in the variant's
`topology.clab.yml` header before running more than one.

**Topology** (everything on prod `<PROD_HOST>`, all disposable):

```
network-provisioning pipeline (paichart-mcp, prod)
   │  services(action:'call') fetch_data / list_devices   [registered: ceos-lab-readonly]
   ▼
cloudflared tunnel  ──►  nornir-mcp (prod host :3107, streamable-http)
                              │  NAPALM-eos eAPI (http/80), STATIC creds
                              ▼
                         clab-np bridge 172.30.30.0/24
                          ├─ ceos1 (172.30.30.11)  ──Ethernet1── ceos2 (172.30.30.12)
                          └─ eBGP 65001 ⇆ 65002
```

**Honest caveats** (this is NOT full WS4 conformance — it validates cognition, not identity):
- nornir-mcp authenticates to the device with **static creds**, not the **JWKS-forwarded per-user identity**
  WS4 R2a mandates. Full identity conformance (JWKS) is a later layer.
- The descriptor declares **only the read-only subset** (`list_devices`, `fetch_data`). The service still
  physically exposes Netmiko `show_commands` (free-text) + `apply_config` (mutating); we never declare them,
  so the pipeline never calls them — but that's a *descriptor-level* restriction, not service-level R1 enforcement.
- The cloudflared quick-tunnel URL is unguessable + **ephemeral** — stand it up for the run, tear it down after.
  Don't leave a device-sim MCP endpoint exposed.

## Files in this directory

| File | What it is | Deliverable |
|---|---|---|
| `topology.clab.yml` | containerlab 2-node `arista_ceos` topology (deterministic mgmt IPs, mem/cpu caps) | #1 |
| `ceos1-startup.cfg`, `ceos2-startup.cfg` | cEOS startup configs — enable eAPI + realistic L3/BGP/SNMP state | #2 |
| `nornir/{config,hosts,groups,defaults}.yaml` | Nornir SimpleInventory for the two nodes (eAPI/http, static cred) | #3 |
| _(descriptor lives in the **paichart** repo, not here)_ | pAIchart registration payload — read-only EOS getters, grade-A schemas. Canonical: `~/paichart/descriptors/ceos-lab-readonly-descriptor.json` → raw `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`. The Harvester **fetches** this raw URL (put it in the task description). | #4 |
| `nornir-mcp-docker/{Dockerfile,run_http.py}` | Dockerized nornir-mcp (non-root, capped) serving streamable-http on `:3107` | — |
| `DEMO-RUN-GUIDE.md` | **Step-by-step pipeline run** — Claude Desktop (recorded demo) + API paths, objectives, deliverable, caveats | — |

---

## PREREQ (Steve, one-time): get the cEOS image onto prod

> **DONE 2026-06-26**: `ceos:4.32.2.1F` imported on prod from `cEOS64-lab-4.32.2.1F.tar.xz` (md5-verified
> 6c427f3cec967a0a0eb7472181bcae2b). containerlab install is Step 1 below.

For reference, the import flow that was used (cEOS-lab is a filesystem tarball → `docker import`, NOT `docker load`):
```bash
scp cEOS64-lab-4.32.2.1F.tar.xz <PROD_USER>@<PROD_HOST>:/root/
ssh <PROD_USER>@<PROD_HOST>
xz -d cEOS64-lab-4.32.2.1F.tar.xz
docker import cEOS64-lab-4.32.2.1F.tar ceos:4.32.2.1F   # tag matches topology.clab.yml `image:`
docker images | grep ceos                                # confirm
```

## Step 1 — Install containerlab on prod

```bash
ssh <PROD_USER>@<PROD_HOST>
bash -c "$(curl -sL https://get.containerlab.dev)"   # single static binary
containerlab version
```

## Step 2 — Deploy the lab

```bash
# copy this directory to prod (e.g. /root/np-ceos-rig/), then:
cd /root/np-ceos-rig
containerlab deploy -t topology.clab.yml
containerlab inspect -t topology.clab.yml            # both nodes 'running', note mgmt IPs

# Verify eAPI is up + creds work (expect JSON with the hostname):
curl -s -u admin:paichartlab http://172.30.30.11/command-api \
  -d '{"jsonrpc":"2.0","method":"runCmds","params":{"version":1,"cmds":["show hostname"],"format":"json"},"id":1}' | head
```
> If a node has no mgmt reachability: cEOS+containerlab assigns Management0 from `mgmt-ipv4`. The startup
> configs intentionally omit `interface Management0` so they don't fight that injection — keep it that way.

## Step 3 — Run nornir-mcp as a CONTAINER on the clab-np network (streamable-http :3107)

> **Use the container — NOT a host `uvx` process.** The third-party `sydasif/nornir-mcp-server` dep tree runs
> in a capped, non-root container (isolation from live paichart — see `nornir-mcp-docker/Dockerfile`). The
> container attaches to the `clab-np` network (reaches the switches directly) and publishes `:3107` to host
> localhost for the tunnel. This is the **third container** the DEMO-RUN-GUIDE pre-flight expects.
>
> ⛔ **Do NOT `uvx --from . fastmcp run src/nornir_mcp/server.py:mcp` on the host** (the old Step 3 — dead end,
> confirmed 2026-07-01): the file-path launch breaks on the repo's relative imports (`attempted relative import
> with no known parent package`), AND running unaudited third-party code as root next to paichart is exactly
> what the container avoids.

```bash
# 1. Build context on prod. The Dockerfile + run_http.py are in this repo's nornir-mcp-docker/ — copy them to
#    /root/np-ceos-rig/nornir-mcp-docker/ (create the dir if the rig was torn down), then add the inventory:
cd /root/np-ceos-rig/nornir-mcp-docker
cp /root/np-ceos-rig/nornir/*.yaml .          # config.yaml hosts.yaml groups.yaml defaults.yaml (into build ctx)

# 2. Build (pip installs the third-party tree pinned to main; ~1-3 min; needs no host uv/git)
docker build -t nornir-mcp-rig:latest .

# 3. Run — clab-np network (so it reaches 172.30.30.0/24) + publish :3107 to host localhost; non-root; auto-restart
docker rm -f nornir-mcp 2>/dev/null
docker run -d --name nornir-mcp --restart unless-stopped --network clab-np -p 127.0.0.1:3107:3107 nornir-mcp-rig:latest

# 4. Verify the full chain — the serverInfo.name check is the one that matters (see shared-endpoint note below)
docker ps --format '{{.Names}}\t{{.Status}}' | grep nornir-mcp          # Up, 127.0.0.1:3107->3107
curl -s -m 12 https://ceos-lab.paichart.app/mcp -X POST -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"p","version":"0"}}}' \
  | grep -o '"name":"Nornir Network Automation"'                        # ← must match (proves cEOS/nornir is bound)
```
> ✅ **`ceos-lab.paichart.app` (:3107) is this rig's DEDICATED endpoint since 2026-07-15** — the ONE
> SYD-Arista1 tunnel carries three routes (ceos-lab→:3107, k8s-lab→:3112, tf-lab→:3113), so all three
> rigs can run concurrently. **Still confirm `serverInfo.name == "Nornir Network Automation"`** before a
> network run as belt-and-braces — a stray service bound to :3107 would still be caught by it. The container/inventory handle what the old
> host caveats worried about (entrypoint import, `config.yaml` in CWD) — no live shake-out needed.

## Step 4 — cloudflared named tunnel (DONE 2026-06-25 — stable hostname)

Already set up: a **named, dashboard-managed** cloudflared tunnel `ceos-lab`, running as a **systemd service
on prod** (`cloudflared service install <token>`), routing **`https://ceos-lab.paichart.app`** → `http://localhost:3107`.
Verified: connector registered (quic), DNS live, path returns 502 until nornir-mcp is up on `:3107` (expected).

Because the hostname is stable, the descriptor `endpoint` is locked to `https://ceos-lab.paichart.app/mcp`
**once** (no per-run re-commit). Nothing is exposed until both the tunnel service is running AND nornir-mcp
is live on `:3107`.

```bash
# Service is already installed + active. Useful ops:
ssh <PROD_USER>@<PROD_HOST> 'systemctl status cloudflared --no-pager'      # health
ssh <PROD_USER>@<PROD_HOST> 'journalctl -u cloudflared -n 20 --no-pager'   # connector logs
# The tunnel is KEPT across rig rebuilds (shared, stable hostname). Uninstall ONLY when retiring the rig:
# cloudflared service uninstall  +  delete the tunnel in the CF dashboard
```

## Step 5 — Register the descriptor with pAIchart

The Harvester **fetches the descriptor from its raw GitHub URL** (in the task description) and registers it.
Public HTTPS endpoint → the SSRF registration gate passes → **normal** registration path (NO seed-script, NO
policy edits). Equivalent manual call (ADMIN identity):

```
registry(action: 'register', <fields from the fetched descriptor: name, endpoint, category, capabilities>)
```
Raw URL for the task description:
`https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`
> `category: automation` → confirm whether it auto-approves or needs admin approval at register time; if it
> lands PENDING, approve it (you're admin). (Open WS4 item: a dedicated device/network category.)

Confirm it's ACTIVE and the two tools are visible:
```
services(action: 'discover', status: 'ACTIVE')      # expect ceos-lab-readonly
registry(action: 'tools')                            # expect list_devices + fetch_data only
```

## Step 6 — Run the validation pipeline

> **Full run walkthrough (Claude Desktop demo path + API path): [`DEMO-RUN-GUIDE.md`](./DEMO-RUN-GUIDE.md).** The summary below is the exit-criteria checklist.

Launch a `(protocol: network-provisioning)` pipeline task pointed at the lab. The Harvester stage should
call `list_devices` then `fetch_data(getters:["config","interfaces","facts","bgp_neighbors"])` and harvest
**real EOS output**. Validate the Phase-4 exit criteria:

- [ ] **Harvest**: real `show running-config` / interfaces / BGP from ceos1+ceos2 reaches the Harvester.
- [ ] **R9 at the wire**: device output passes through the sanitizer before the reasoner (check
      `neutralizedCount` / securityEvent if `CONNECTED_OUTPUT_SANITIZE_ENABLED=true` for the run).
- [ ] **Cognition**: design + change-package are sound against the REAL config (not the context7 stand-in).
- [ ] **R10 backstop** (optional, if `ARTIFACT_SECRET_REDACT_ENABLED=true`): the fake `snmp-server community`
      bait is redacted token-in-place in the persisted `report.md` / `result.json`.
- [ ] **QA verdict**: the Change Reviewer produces an approved-but-unapplied package. Apply stays out-of-band.

## Step 7 — Teardown (do this after the run)

```bash
# 1. delete the pAIchart registration — USUALLY ALREADY GONE (the pipeline self-provisions register→read→delete);
#    only needed if a run was interrupted:
#    registry(action: 'delete', service_name: 'ceos-lab-readonly', confirm: true)
# 2. stop + remove the nornir-mcp CONTAINER (not a host process):
docker rm -f nornir-mcp
# 3. destroy the lab + bridge:
containerlab destroy -t /root/np-ceos-rig/topology.clab.yml --cleanup
# 4. KEEP cloudflared (systemd service) + the cEOS image — the tunnel is the shared, stable hostname (reused on
#    rebuild; also shared with the terraform-iac rig) and the image is reused. Only uninstall when RETIRING the rig:
#      ssh <PROD_USER>@<PROD_HOST> 'cloudflared service uninstall'   # + delete the tunnel in the CF dashboard
# 5. (optional) reclaim disk: docker rmi ceos:4.32.2.1F           # only if not rebuilding soon
free -h && df -h /     # confirm prod headroom restored
```

## Resource guardrails (measured 2026-06-25)

Prod: 6.1 GB RAM avail + 2 GB swap, 14 GB disk free (72% used), 4 vCPU, Docker 29.5.2, cgroups v2.
Lab adds ~3.2 GB RAM (2× cEOS capped at 2g each + nornir ~0.2 GB) and ~2–2.5 GB disk (cEOS image shared by
both nodes). Projected after deploy: ~4.9 GB RAM used / ~2.9 GB avail + 2 GB swap → safe; paichart won't OOM.
**Watch disk** (already 72%). The per-node `memory: 2g` caps in `topology.clab.yml` are the OOM backstop.
