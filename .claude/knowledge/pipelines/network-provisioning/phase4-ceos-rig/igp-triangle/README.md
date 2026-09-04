# IGP-Migration Rig — 3-node cEOS triangle, OSPF area-0 brownfield baseline

> **Status: UP on the dedicated lab laptop (`devext`, 192.168.86.111, kernel 6.8.0-138 NATIVE) as of 2026-08-30** — triangle deployed, OSPF FULL, transit fact live, public route green via the `igp-tunnel.service` reverse tunnel (see CONTINUATION-2026-08-24 §RESOLVED). The kernel-6.8 requirement is now bare-metal-confirmed. Historical banner follows.
> **(Historical) Status: DOWN. Home is OFF-HOST, and it needs kernel 6.8.** The rig ran the whole IGP-T1
> campaign on prod (R1-R6, incl. the first verified mid-program apply at G1) and ended in a kernel
> GLOBAL OOM that took the host down. Evidence archived at prod `/root/igp-t1-g1-evidence.tgz`.
>
> 🔴 **Two verdicts, both MEASURED — read before deploying anywhere:**
> 1. **Prod, 3 nodes: NO, at any cap value.** ~1.7-2.0 GB/node dual-IGP x3 + ~2.0 GB non-rig
>    exceeds the 7.9 GB host. Caps high enough to run ⇒ kernel GLOBAL OOM (host unreachable,
>    power-cycle, 2026-08-23). Caps low enough to be sum-binding (1.2g) ⇒ memcg OOM STARVED EOS
>    (ProcMgr's agents killed; CLI dead while the container still reads "Up"). **2 nodes DO fit**
>    (2 x ~1.9g + ~2.0 GB ≈ 5.8 of 7.9) — that is the prod-side fallback.
> 2. **Off-host (16 GB VM): YES — but ONLY on kernel 6.8.x.** cEOS 4.32.2.1F boots on 6.8.0-138
>    (~2 min) and hangs forever in `AaaWarmup.service` (`wfw -v -t 3600 Aaa Ssh ConfigAgent`) on
>    7.0.0-29. Same image/topology/configs; memory, CPU (1.2→4 cores), inotify limits, cgroups v2
>    (both hosts v2 — the documented cgroup-v1 requirement is pre-4.32.0F) and
>    containerlab-vs-manual launch are all ruled out. Not publicly documented: our own empirical
>    finding. **`uname -r` BEFORE you deploy.** A newer cEOS image is the clean fix for kernel 7.
>
> ▶️ **Standing rules**: run `./memory-watchdog.sh` for any window on a SHARED host (warns <1.5 GB,
> auto-sheds cEOS <700 MB, never touches cloudflared/nornir — it converts a host outage into a lost
> round); one lab at a time; `write memory` after a verified apply so applied phases survive a
> shed/restart; on prod only, no push to main while up.

## What it is

| Thing | Value |
|---|---|
| Lab / bridge / subnet | `igp-ceos` / `clab-igp` / `172.30.31.0/24` (distinct from the 2-node lab's `clab-np` 172.30.30.0/24) |
| Nodes | `ceos1` (.11), `ceos2` (.12), `ceos3` (.13) — cEOS 4.32.2.1F. Caps: **off-host 2.5g/4cpu** (working copy `~/igp-ceos-rig/`); the repo topology retains the prod-profile 1.2g/1.2cpu for the record only — see the two verdicts above |
| Links | full triangle: c1:eth1–c2:eth1 (10.0.12.0/30, cost 10) · c2:eth2–c3:eth1 (10.0.23.0/30, cost 20) · c1:eth2–c3:eth2 (10.0.13.0/30, cost 40) |
| Baseline IGP | OSPF proc 1, area 0.0.0.0 everywhere, Loopback0 /32s advertised + passive, p2p network type on all /30s |
| Transit story | ceos1→ceos3 prefers the 2-hop path via ceos2 (10+20=30 < 40 direct) — parity/preference gates have a real path-selection fact to verify |
| Brownfield intent for the IS-IS design | per-link costs (metricMap corpus), p2p type, router-ids 1.1.1.1/2.2.2.2/3.3.3.3 (NET-derivation corpus — §7 `net`-leaf, corpus-first) |
| Device service | same `nornir-mcp` server, **variant image `nornir-mcp-rig:igp`** (3-host inventory in `./nornir/`), bound to `127.0.0.1:3107` → same `ceos-lab.paichart.app/mcp` tunnel route + same public descriptor. No public-repo change needed. |
| Secret bait | `snmp-server community s3cr3tLabComm{1,2,3}` — lab-only FAKE, R9/R10 exercise |

⚠️ **Memory**: on a 16 GB off-host box the ceiling is 3 x 2.5g + nornir ≈ 7.65 GB of ~13 GB —
ample, and the SUM is binding so a runaway node is container-OOM-killed before the host is. On the
7.9 GB prod host no 3-node cap value works (see verdicts above). The boot transient was never the
danger; apply-window + program-concurrency was, and only a continuous watch catches it.

## Build (OFF-HOST — the supported home)

```bash
# 0. 🔴 KERNEL CHECK FIRST — anything other than 6.8.x and cEOS will hang in AaaWarmup forever.
uname -r          # expect 6.8.x  (7.0.x = STOP, see verdict 2 above)
free -m           # expect ≥8 GB available for a 3-node lab at 2.5g/node

# 1. Images (one-time). cEOS can be streamed from prod without a temp file:
ssh root@PROD 'docker save ceos:4.32.2.1F | gzip -1' | gunzip | docker load
mkdir -p /tmp/igp-nornir-build && cd /tmp/igp-nornir-build
cp <repo>/phase4-ceos-rig/nornir-mcp-docker/{Dockerfile,run_http.py} .
cp <repo>/phase4-ceos-rig/igp-triangle/nornir/*.yaml .
docker build -t nornir-mcp-rig:igp .        # bakes the 3-host inventory + the streamable-http wrapper

# 2. Deploy (containerlab needs root; a scoped NOPASSWD sudoers rule on /usr/bin/containerlab works)
cd ~/igp-ceos-rig && sudo containerlab deploy -t topology.clab.yml

# 3. Device service on the lab bridge
docker rm -f nornir-mcp 2>/dev/null
docker run -d --name nornir-mcp --restart unless-stopped --network clab-igp \
  -p 127.0.0.1:3107:3107 nornir-mcp-rig:igp

# 4. Reach it from the pipeline WITHOUT touching Cloudflare: reverse-tunnel local :3107 to prod's
#    loopback, so prod's EXISTING cloudflared route (ceos-lab.paichart.app) resolves to this rig.
#    Precondition: prod has no rig-local service on :3107.
./tunnel.sh
```

## Verify (the OSPF analogue of the 2-node lab's BGP data-plane check)

EOS boot timing trap applies (parent guide): 1–3 min of `% Authorization denied` before the
startup-config applies — poll, and read RAW output, never a bare grep count.

```bash
until docker exec clab-igp-ceos-ceos1 Cli -p 15 -c 'show ip interface brief' 2>&1 | grep -qi Loopback; do sleep 15; done

# 🔴 DATA PLANE — containers Up ≠ rig works (the 2026-07-26 lesson). Adjacency is the truth:
docker exec clab-igp-ceos-ceos1 Cli -p 15 -c 'show ip ospf neighbor'   # MUST show 2 neighbors, FULL
docker exec clab-igp-ceos-ceos2 Cli -p 15 -c 'show ip ospf neighbor'   # 2 × FULL
docker exec clab-igp-ceos-ceos3 Cli -p 15 -c 'show ip ospf neighbor'   # 2 × FULL
# Route-set + transit story: ceos1's route to 3.3.3.3 must be via 10.0.12.2 (through ceos2).
# Displayed cost is [110/40], NOT 30: the /32 is a stub route, so Loopback0's own default OSPF
# cost (10) rides on top of the link path (10+20+10). Direct would be 40+10=50 — still dispreferred.
# (Measured at first build 2026-08-23; the next-hop is the invariant, the 40 is the expected value.)
docker exec clab-igp-ceos-ceos1 Cli -p 15 -c 'show ip route 3.3.3.3'
# All three loopbacks in every RIB as OSPF routes:
docker exec clab-igp-ceos-ceos1 Cli -p 15 -c 'show ip route ospf'

# Tunnel + service binding (same probe as the parent guide pre-flight — serverInfo.name must be
# "Nornir Network Automation"), then list_devices must return ceos1+ceos2+ceos3.
```

Registry + descriptor pre-flight steps are unchanged from the parent `DEMO-RUN-GUIDE.md`
(registry clean of `ceos-lab-readonly`; descriptor URL returns 200).

## Between-gate applies (the S2 loop)

Each migration phase's change package is applied **by the human operator at the rig**
(`docker exec clab-igp-ceos-ceosN Cli -p 15 …` or config session), then the gate is completed and
the next leg **re-harvests live state**. Do NOT edit the startup-configs to simulate an apply —
the applied state must be live-only, so the re-harvest is honest. (Startup-configs = the P0
brownfield baseline; a `--reconfigure` would ROLL BACK all applied phases to baseline.)

## Teardown

```bash
cd ~/igp-ceos-rig                                      # (off-host home; on prod it was /root/igp-ceos-rig)
sudo containerlab destroy -t topology.clab.yml --cleanup   # --cleanup mandatory (stale-flash trap, parent guide)
docker rm -f nornir-mcp
# Stop tunnel.sh (Ctrl-C) if it is running.
# cloudflared on PROD: NEVER stopped. cEOS + nornir-mcp-rig images: kept.
```

## See also

- `../README.md` + `../DEMO-RUN-GUIDE.md` — parent rig runbook (traps: docker-start/veth, stale
  flash, `-p 15`, boot timing — all apply here with lab name `clab-igp-ceos-*`)
- `cline_docs/igp-migration-design-2026-08-21/` — PLAN-OF-RECORD + DESIGN-SKELETON (the program this rig serves)
