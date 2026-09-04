# Network-Provisioning Pipeline — Demo Run Guide

> **What this is**: the end-to-end walkthrough for **running the network-provisioning pipeline against the live cEOS rig** — both the **Claude Desktop** path (for a recorded demo) and the **API-tool** path (what to run for an off-camera dry run). For how the rig itself is *built/torn down*, see `README.md` in this directory.
>
> **State as of 2026-08-30**: 🏠 **HOSTING MODEL CHANGED — cEOS rigs now run on the dedicated
> bare-metal lab laptop (`devext`, 192.168.86.111), not prod.** The **IGP triangle is UP there**
> (OSPF FULL, transit fact live, public route green); the np 2-node lab is DOWN. See "Where rigs
> run" below — several warnings in this guide are now scoped to the prod-fallback case only.
> **(Historical) State as of 2026-08-23 (post-incident)**: ALL labs **DOWN**. The IGP triangle sibling (`igp-triangle/`) ran the IGP-T1 campaign window (R1–R6, first mid-program apply verified at G1) and was torn down after a **kernel-OOM host incident** during the post-apply program window — 3-node + program concurrency is now 🔴 on this host (verdict revised in `cline_docs/igp-migration-design-2026-08-21/PLAN-OF-RECORD.md`). ⚠️ One lab at a time, and no 3-node lab during program runs. *(Prior banners: 2026-08-23 IGP triangle up; 2026-08-22 post-FW-A3 down; topology is 4-port since 2026-08-21.)*
> **Historical (2026-08-02)**: torn down after Runs 19 and 20. 5 rig containers only; cloudflared and images kept; the 11 MCP service containers untouched. Memory after teardown: **5.7 GB available** (2.9 GB reclaimed) — that number matters, see the deploy warning below. Runs 19/20 were the first rounds on `network-provisioning v1.2.3`, which added `kind:"asn"` to the harvest and derived-values contracts; Run 20 stamped `derivedValues` carrying `10.99.0.0/31` plus ASNs 65001/65002 and passed `programReleasable: true`.
>
> ---
> ## 🏠 Where rigs run (hosting model, 2026-08-30)
>
> | Host | Role | Facts |
> |---|---|---|
> | **`devext` laptop** (Lenovo S145, LAN 192.168.86.111) | **PRIMARY cEOS host** — both the np 2-node and the IGP triangle deploy here | Bare-metal Ubuntu Server 24.04, kernel **6.8.0-138 NATIVE** (the AaaWarmup-safe requirement, bare-metal-confirmed); 19 GiB usable (~7–8 node ceiling); docker-ce 29.x + containerlab 0.76.1; hardened appliance (lid/sleep/powersave/rfkill handled). Working copies: `~/igp-ceos-rig/`, `~/np-ceos-rig/`. Access: `ssh steve@192.168.86.111` (keyed) |
> | prod droplet | **Fallback for the 2-node lab only** (3-node 🔴 at any cap — measured) + still hosts the tf/LocalStack and k8s rigs, cloudflared, and `:3107`'s public route | All original warnings in this guide apply here unchanged |
>
> **Service path from the laptop**: the platform still reaches `https://ceos-lab.paichart.app/mcp`
> unchanged — prod's cloudflared route → prod loopback `:3107` → **`igp-tunnel.service`** (a
> systemd ssh reverse tunnel on the laptop) → the laptop's nornir-mcp. No Cloudflare/DNS/descriptor
> change ever needed; pre-flight the tunnel with `systemctl is-active igp-tunnel` on the laptop +
> the public initialize probe.
>
> **Rules re-grounded by the move**:
> - **One lab at a time — STILL BINDING, but for a different reason**: both labs share `:3107`, the
>   tunnel route, and the `ceos-lab-readonly` descriptor identity. That's a port/identity fact,
>   host-independent. (On prod it was *also* a RAM fact; on the laptop RAM would allow both.)
> - **The 🔴 no-push rule below is PROD-HOSTED-RIGS ONLY**: builds run on prod; a laptop-hosted rig
>   shares nothing with them, and the reverse tunnel rides sshd, which deploys never touch —
>   pushes during laptop-rig windows are safe (verified 2026-08-30).
> - The `docker start` veth trap, T6 re-randomize, and pre-flight discipline apply on EITHER host.
>
> ⚠️ **Re-randomize the T6 seed on every rebuild for a T6 round** (`python3 randomize-t6-seed.py --write`, THEN `containerlab deploy` — startup-configs apply only at deploy). T6's load-bearing claim is that the derived exporter aggregate changes on every rebuild; a carried-over scatter silently invalidates the round. Run 16's build used ceos1 `.9/.27/.30` / ceos2 `.2/.8/.18` and derived `10.99.0.64/31`. *(2026-07-15: `:3107` is this rig's DEDICATED port — k8s-lab:3112 / tf-lab:3113 have their own tunnel routes; the shared-port era is over.)*
>
> 🔴 **(PROD-HOSTED RIGS ONLY — see "Where rigs run" above; does NOT apply to laptop-hosted rigs)** **DO NOT PUSH TO `main` WHILE A RIG IS UP ON PROD.** `next build` runs **on the production box**, and the rig runs there too — they are the same finite RAM. On 2026-08-02 a single deploy with the rigs up saturated a 7.9 GB host: sshd stopped completing handshakes, `curl` returned 000, ICMP dropped 100%, and **two deploys failed**. Production never actually went down (both aborted before the blue-green flip; pm2 uptime unbroken, restarts 0) — but it looked identical to an outage from outside. Tearing the rigs down freed 2.9 GB and the same deploy then succeeded first try.
>
> This is a **recurrence**: `production-deploy.yml`'s header already records the 2026-07-24 incident (5 stacked deploys + rigs up → load avg 186). The `concurrency:` group added then works — today's deploys *were* serialized — but serialization fixed *stacking*, not the collision. **One build plus the rigs is enough.**
>
> If a run surfaces a defect, **record it and push after teardown**. Nothing needs pushing during a run. Full analysis: `cline_docs/follow-ups/deploy-builds-on-the-rig-host-2026-08-02.md`.
>
> Diagnosing a suspected outage: check `uptime` and `pm2 list` FIRST. Unbroken uptime + restart count 0 means nothing died — the box is refusing *new* connections while still serving existing ones.
>
> Run the full pre-flight after every rebuild — the rig has been found stopped by an unexplained host power-cycle more than once (four between 2026-07-21 and 2026-07-28), and a state banner is a claim about the moment it was written, never a substitute for probing.

---

## The story this demo tells

You hand pAIchart **one plain-English network objective** plus a **descriptor URL** for a read-only device service. With no further input it:

1. **Self-provisions** the device service from the descriptor (register → read-only call → teardown) — pAIchart stores no device credentials, the registration doesn't persist.
2. **Harvests** real running state from the device (running-config, interfaces, BGP) — sanitized at the wire (R9) before any reasoner reads it.
3. **Designs** the target change (addressing/routing/ordering), **authors** a per-device change package (candidate config + validation steps + rollback), and a **reviewer** gates it.
4. Produces an **approved-but-unapplied change package**. **pAIchart never actuates** — apply is out-of-band and human-gated.

The money shot: *a URL in, an approved change package out, against a real switch, fully autonomous.*

---

## Live rig facts (what the pipeline talks to)

| Thing | Value |
|---|---|
| Device-service endpoint | `https://ceos-lab.paichart.app/mcp` (cloudflared → prod `localhost:3107`) |
| **Descriptor raw URL** (goes in the task) | `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json` |
| Protocol tag (goes in the task title) | `(protocol: network-provisioning)` |
| Devices | `ceos1` (172.30.30.11), `ceos2` (172.30.30.12) — Arista cEOS 4.32.2.1F, eBGP 65001 ⇆ 65002 over 10.0.12.0/30 |
| Declared read-only tools | `list_devices`, `fetch_data` (NAPALM getters; mutating tools are NOT declared) |
| Pre-seeded loopbacks (T6) | **telemetry-exporter pool `10.99.0.0/24`** — scattered, asymmetric `/32`s on both switches (`Loopback11-17`), advertised via BGP `network` statements. Seeded in `ceos{1,2}-startup.cfg`. ⚠️ **Load-bearing test data — do NOT "tidy" them.** Also means `show running-config` / `get_bgp_config` now return MORE state than pre-2026-07-17 runs. |
| Free for demos | `Loopback0-9` are untouched by the seed — the classic Loopback0/1/2… demo objectives still work exactly as before. |

---

## Pre-flight checklist (run before any demo)

> ✅ **`ceos-lab.paichart.app` (:3107) is this rig's DEDICATED endpoint since 2026-07-15** — the ONE
> SYD-Arista1 tunnel now carries three routes (ceos-lab→:3107, k8s-lab→:3112, tf-lab→:3113), so all
> three rigs can run concurrently. The `serverInfo.name` check below stays as belt-and-braces (it must
> say `Nornir Network Automation`) — a stray service on :3107 would still be caught by it.

```bash
# 1. Rig hot AND the RIGHT service bound? (three containers Up, and nornir is what answers the tunnel)
ssh <PROD_USER>@<PROD_HOST> 'docker ps --format "{{.Names}}\t{{.Status}}" | grep -iE "ceos|nornir"'  # ceos1, ceos2, nornir-mcp all Up
curl -s -m 12 https://ceos-lab.paichart.app/mcp -X POST -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"p","version":"0"}}}' \
  | grep -o '"name":"Nornir Network Automation"'   # ← MUST match (proves cEOS/nornir bound, not terraform-readonly)
```
```
# 1b. 🔴 DATA PLANE — containers Up + a healthy tunnel do NOT mean the rig works.
#     Learned 2026-07-26: all three containers reported Up, nornir answered `initialize` with the
#     right serverInfo.name, and the loopbacks were present — while the ceos1<->ceos2 link did not
#     exist at all, so eBGP could never establish. A demo would have failed mid-harvest on a green
#     pre-flight. ALWAYS check the session, not just the processes:
ssh <PROD_USER>@<PROD_HOST> 'docker exec clab-np-ceos-ceos1 Cli -p 15 -c "show ip bgp summary"' | tail -2
#     MUST show State=Estab AND PfxRcd non-zero (the peer's /32s). `Idle(NoIf)` = the veth link is
#     missing -> see "Restarting a STOPPED lab" below. Estab with PfxRcd 0 = peering up, nothing
#     advertised -> the seed did not apply.
```
```
# 2. Registry clean? (the pipeline self-provisions; a stale registration causes a name conflict)
#    registry(action: "list")  -> ceos-lab-readonly should NOT be present
# 3. Descriptor live?
curl -s -o /dev/null -w "descriptor HTTP %{http_code}\n" \
  https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json  # expect 200
```
If the rig is down, rebuild per `README.md` (Steps 2–3 — **Step 3 is the `nornir-mcp` container**, not a host `uvx` process). If a stale `ceos-lab-readonly` exists, delete it: `registry(action: "delete", service_name: "ceos-lab-readonly", confirm: true)`.

---

## Restarting a STOPPED lab (containers exist but exited) — the `docker start` trap

> Rig-specific: the **terraform/LocalStack** sibling has no such trap — plain containers on a docker
> network, so `docker start` genuinely restores it (`../../terraform-iac/phase4-localstack-rig/DEMO-RUN-GUIDE.md`).
> The difference is containerlab: only this rig has veth pairs to lose.

Distinct from "torn down". If `docker ps -a` shows `clab-np-ceos-ceos1/2` **Exited**, the instinct is
`docker start` — and it half-works, which is what makes it dangerous (bitten 2026-07-26).

**`docker start` does NOT restore the veth links.** containerlab wires `ceos1:eth1 ▪┄┄▪ ceos2:eth1` at
**deploy** time, and veth pairs do not survive a container stop. You get: containers Up, `nornir-mcp`
answering the tunnel, all seeded loopbacks present and `up/up` — and **no `Ethernet1` at all**, so BGP
sits at `Idle(NoIf)` forever. Confirm with `docker exec clab-np-ceos-ceos1 ip -br link` (expect
`eth1@…`; only `eth0` + `lo*` means the link is gone).

**The fix — re-wire without touching the seed:**
```bash
cd /root/np-ceos-rig
# Plain `containerlab deploy` REFUSES while the containers exist ("already exist ... add --reconfigure").
# --reconfigure removes the node containers and redeploys, recreating the links.
containerlab deploy -t topology.clab.yml --reconfigure
```
⚠️ **`--reconfigure` is NOT `--cleanup`.** It redeploys from `ceos{1,2}-startup.cfg`, so it is
**lossless whenever those files match what was live** — verify first and you can re-wire without
re-seeding:
```bash
diff <(grep -oE '10\.99\.0\.[0-9]+' ceos1-startup.cfg | sort -u) \
     <(grep -oE '10\.99\.0\.[0-9]+' clab-np-ceos/ceos1/flash/startup-config | sort -u)   # empty = lossless
```
**`nornir-mcp` usually survives** `--reconfigure` (it removes the node containers, not the `clab-np`
bridge) — verified 2026-07-26: the container stayed Up and attached. Check before rebuilding it:
`docker inspect nornir-mcp --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'`
should print `clab-np`. A full `destroy` DOES remove the bridge — that is when Step 3's re-run applies.

### ⚠️ EOS boot timing — a second empty-grep trap
For 1-3 minutes after the containers report running, `Cli` returns
`% Authorization denied ... Default authorization provider rejects all commands` — EOS is up but has not
applied its startup-config, so AAA rejects everything. **`grep -ci loopback` on that returns `0`, which
is indistinguishable from "the seed is missing"** and tempts an unnecessary rebuild. Read the RAW output
before concluding anything, and poll until real interface lines appear:
```bash
until docker exec clab-np-ceos-ceos1 Cli -p 15 -c 'show ip interface brief' 2>&1 | grep -qi Loopback; do sleep 15; done
```
(Same family as the `-p 15` trap below: **a count hides the error message a raw line shows**.)

## Rebuilding the rig (REQUIRED before T6; optional otherwise)

**containerlab applies `startup-config` only at deploy.** A running lab does NOT pick up edits to
`ceos{1,2}-startup.cfg` — so if you changed them (e.g. re-randomized the T6 seed), the live devices still
carry the OLD state until you destroy + redeploy. ⚠️ **This is the T6 trap**: without a rebuild the pool is
empty/stale, any exporter pick summarizes cleanly, and T6 would "pass" while validating nothing.

```bash
ssh <PROD_USER>@<PROD_HOST>
cd /root/np-ceos-rig

# 1. Sync the configs from the repo (scp ceos{1,2}-startup.cfg + topology.clab.yml if they changed)

# 2. Destroy WITH --cleanup, then deploy.
#    ⚠️⚠️ --cleanup IS MANDATORY. Plain `containerlab destroy` removes the containers but LEAVES the
#    lab dir (./clab-np-ceos/), and cEOS boots from ./clab-np-ceos/<node>/flash/startup-config — the
#    PERSISTED copy. Without --cleanup the node silently reboots on the OLD config: containerlab says
#    "running", every original line is present, and your edits are simply absent. Bitten live
#    2026-07-17 (the loopback seed vanished; the flash copy had 0 of the new lines).
containerlab destroy -t topology.clab.yml --cleanup
[ -d clab-np-ceos ] && echo "LAB DIR STILL PRESENT — flash is stale, do NOT proceed"
containerlab deploy  -t topology.clab.yml

# 3. Re-run nornir-mcp — destroy removes the clab-np bridge, so the container loses its network
docker rm -f nornir-mcp 2>/dev/null
docker run -d --name nornir-mcp --restart unless-stopped --network clab-np \
  -p 127.0.0.1:3107:3107 nornir-mcp-rig:latest
docker ps --format '{{.Names}}\t{{.Status}}' | grep nornir-mcp

# 4. VERIFY on the LIVE devices (do NOT skip — a stale rig "passes" while validating nothing).
#    NOTE the container names are clab-np-ceos-ceos1 / -ceos2 (lab name + node), and `show
#    running-config` REQUIRES -p 15 — without it you get "% Invalid input (privileged mode
#    required)" and an empty grep that looks exactly like "the config didn't apply".
#    EOS applies config ~10s after the container reports running.
docker exec clab-np-ceos-ceos1 Cli -p 15 -c 'show ip interface brief' | grep -i loopback
docker exec clab-np-ceos-ceos2 Cli -p 15 -c 'show ip interface brief' | grep -i loopback
docker exec clab-np-ceos-ceos1 Cli -p 15 -c 'show running-config section bgp' | grep 'network 10.99'
docker exec clab-np-ceos-ceos1 Cli -p 15 -c 'show ip bgp summary'   # Estab + PfxRcd = peer's /32s
```

**Belt-and-braces check** — the flash copy is the source of truth for what the node actually booted:
```bash
grep -c '10.99.0' /root/np-ceos-rig/clab-np-ceos/ceos1/flash/startup-config   # 0 ⇒ STALE FLASH
```

### Re-randomizing the T6 seed

T6's load-bearing claim is that the derived exporter aggregate **changes on every rig rebuild** — which is
only true if we actually re-randomize. From the repo's rig dir:

```bash
python3 randomize-t6-seed.py             # dry run — shows the scatter + why the naive answer fails
python3 randomize-t6-seed.py --write     # rewrite both startup-configs
python3 randomize-t6-seed.py --seed 42   # deterministic (reproduce a specific rig build)

⚠️ **The `a clean answer (…) -> x.x.x.x/yy` line is an EXAMPLE, not a prediction.** It is the LOWEST
clean pair, printed to show the puzzle is solvable — the Architect picks from all clean pairs (usually
20-40 of them) and will often choose a different one. Do NOT re-roll because that line repeats a
previous run's aggregate: `10.99.0.4/31` recurs frequently because `.4`/`.5` are often both free, and
on 2026-08-02 eight consecutive re-rolls were discarded for exactly that mistake before the reading
was corrected. **If you want to avoid a coincidental match with a prior run** — worth doing, so a
reviewer can tell "derived fresh" from "reused" — check the aggregate the run ACTUALLY derives and
re-roll then, or accept the scatter and note the example value in the round record.
```

The script only emits a scatter that satisfies T6's two real constraints: **the naive lowest-free pick must
summarize into a widening aggregate** (otherwise the dependency degenerates into a guessable lookup), and
**at least one clean pair must exist** (otherwise the correct outcome is "escalate", which can't validate the
happy path). Then rebuild per above. See `PROGRAM-TEST-PLAN.md` (T6).

## Pick an objective

Any provisioning change the pipeline can design against the harvested state. Good fits for this 2-node eBGP lab:

- **`Add Loopback0 (1.1.1.1/32 on ceos1, 2.2.2.2/32 on ceos2) and advertise it into BGP (protocol: network-provisioning)`** ← recommended; clean harvest→design→change-package story
- `Standardize NTP and SNMP configuration across both cEOS switches (protocol: network-provisioning)`
- `Add an OSPF underlay between ceos1 and ceos2 and move BGP to loopback peering (protocol: network-provisioning)`

The Harvester reads current config + BGP; the Architect designs; the Author writes per-device candidate config + validation (exact `show` + expected output) + rollback; the Reviewer gates it.

---

## Getting help inside Claude Desktop (the HOWTO guides)

pAIchart's guides (`HOWTO-*`, `ABOUT-*`, `DEMO-*`) are MCP **prompts**, not resources. Three ways to reach them — good to show on camera so viewers know help is built in:

1. **`+` / connectors menu (most native)** — in the message composer click **`+`**, pick the **pAIchart** connector, and its prompts are listed (`HOWTO-use-pipeline-harness`, `HOWTO-register-service`, `HOWTO-get-started`, `ABOUT-trust-levels`, `DEMO-*`). Click one → its full text drops into the chat.
2. **Slash commands** — type `/` and the same prompts surface (pAIchart server instructions: *"Prompts also appear as slash commands"*). Exact prefix is client-dependent (Claude Code shows `/mcp__paichart__HOWTO-…`; Claude Desktop lists them under the server).
3. **Tool calls (any client)** — `list_prompts()` enumerates every guide; `prompt_command(command: "/prompt HOWTO-use-pipeline-harness")` runs one.

The guides are **not** MCP *resources* — resources (the `+` → "Add from pAIchart" resource browser, or the `fetch` tool) are for **deliverables/data** (`result.json`, `report.md`, POVs). Rule of thumb: **prompts = help, resources = data.**

For this demo the relevant guide is **`HOWTO-use-pipeline-harness`** (harness mechanics, deliverable contract, confidence rubric); **`HOWTO-register-service`** covers the descriptor/registration side.

---

## Path A — Claude Desktop (for the recorded demo)

**Prereq (do off-camera): the POV/phase/stage exist.** Keeps the recording focused on the pipeline, not plumbing. (See "POV setup" below — Steve picks the POV; it's pre-created.)

**On camera**, a single instruction to Claude Desktop does it:

> In pAIchart, create a PIPELINE task in the **"\<POV name\>"** POV under the **"\<phase\>"** phase.
> Title: **"Add Loopback0 (1.1.1.1/32 on ceos1, 2.2.2.2/32 on ceos2) and advertise it into BGP (protocol: network-provisioning)"**.
> In the description, include this read-only device-service descriptor for the harvester to self-provision:
> `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`
> Set type PIPELINE, priority HIGH. Then execute it, poll status, and when it completes fetch the change-package deliverable.

Claude Desktop will call `perform(task.create …, type:"PIPELINE")` → `perform(agent.execute …)` → poll `agent.status` → `agent.results` → `fetch(report.md)`. Total ~10–12 min wall-clock.

**What you'll see (narratable on camera)**:
1. Harness **CREATE** — decomposes into 4 typed children in a child stage, exits.
2. **Harvester** (ORCHESTRATOR) self-provisions `ceos-lab-readonly` from the URL, calls `fetch_data`, harvests real EOS, tears the registration down.
3. **Architect** designs the loopback + BGP advertisement (no device contact).
4. **Author** (DOCUMENTER) emits the change package — the customer deliverable.
5. **Reviewer** (REVIEWER) gates: approved / needs-revision.
6. Harness **SYNTHESIZE** (reactor-triggered) → `report.md` on the harness root = the change package.

---

## Path B — API tools (off-camera dry run / scripted)

```text
# 1. POV (one-time) — pick or create
project(action: "pov.details", pov_name: "<POV name>")            # get povId, phaseId
perform(action: "stage.create", parameters: {
  povId: "<povId>", phaseName: "<phase>", name: "Pipeline: cEOS provisioning" })   # -> stageId

# 2. PIPELINE task (descriptor URL in the description)
perform(action: "task.create", parameters: {
  povId: "<povId>", stageId: "<stageId>",
  title: "Add Loopback0 (1.1.1.1/32 on ceos1, 2.2.2.2/32 on ceos2) and advertise it into BGP (protocol: network-provisioning)",
  description: "Device-service descriptor for the harvester to self-provision (read-only): https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json",
  type: "PIPELINE", priority: "HIGH" })                            # -> PIPELINE taskId

# 3. Execute + poll + fetch
perform(action: "agent.execute", parameters: { taskId: "<PIPELINE taskId>", waitForCompletion: false })
                                                                  # prompt return (2026-07-14) — default
                                                                  # polls up to 19 min, which a short client
                                                                  # timeout mislabels as a failed call
perform(action: "agent.status",  taskId: "<PIPELINE taskId>")     # poll until COMPLETED (~10-12 min)
perform(action: "agent.results", taskId: "<PIPELINE taskId>")     # preview + fetch IDs
fetch(id: "artifact-<report.md id>")                              # the change package
```

> `type: "PIPELINE"` is mandatory — it makes the harness root carry the customer `report.md` (the change package). Omitting it puts the wrong artifact set on the root (see HOWTO-use-pipeline-harness → "The Deliverable Contract").

> ℹ️ **`task.create` success now implies row-verified — no precondition check needed** (2026-07-14 update).
> The 2026-06-19 false-success incident ([[project_mcp_task_create_false_success]]) was closed out with a
> durability assertion in every create handler (read-back after commit, throws on absence, shipped
> 2026-06-20) — a phantom create now returns an ERROR, never a fake ID. The detector has fired 0 times
> since; the daily-summary email alerts if it ever does. If `task.create` returns success, execute away.

---

## Reading the result

- **Deliverable** = harness root **`report.md`** = the Author's change package (per-device candidate config + validation + rollback + ordering). Fetch this first.
- **`pipeline-index.json`** on the harness root = forensic summary (quality gates, child roster, what the harness DID).
- **Per-child `result.json`** = each specialist's chained output (Harvester's raw harvest, Architect's design, Reviewer's verdict).
- **Confidence**: 78–82 across specialists is **normal/healthy** for this kind of work — not a problem. <50 on a child = real blocker; read that child's `result.json`.

### Verify the guards fired (optional, makes a good demo beat)
- **R9 (untrusted-output sanitizer)** — runs at the harvest boundary if `CONNECTED_OUTPUT_SANITIZE_ENABLED=true` for the run; check `neutralizedCount` / securityEvent.
- **Secret bait** — the cEOS configs carry a fake `snmp-server community s3cr3tLabComm…`. If `ARTIFACT_SECRET_REDACT_ENABLED=true`, confirm it's redacted token-in-place in the harness `report.md`/`result.json`.

---

## After the run

- **Re-run**: a COMPLETED PIPELINE task can't be re-run in place — create a **fresh** PIPELINE task (append "(re-run N)" to the title). Runs are isolated by child stage; old and new don't cross-contaminate.
- **Leave the rig hot** for more runs, or tear down per `README.md` Step 7 (`containerlab destroy --cleanup` + `docker rm -f nornir-mcp`). The **cloudflared tunnel + cEOS image are kept** for re-runs — the tunnel is the shared, stable hostname (don't uninstall it).

---

## Honest caveats (state these in the demo; they're the integrity of the story)

- **Not full WS4 conformance.** The nornir bridge authenticates to the devices with a **static service credential**, not the **JWKS-forwarded per-user identity** the device-service spec (R2a) mandates. This validates the **cognition pipeline + R9-at-the-wire** against a real device — **not** the identity contract. Full JWKS conformance is a later layer.
- **Read-only by descriptor, not by service enforcement — a STATED R1 + §6.5 NON-CONFORMANCE.** The descriptor declares only `list_devices` + `fetch_data`; the underlying nornir service *also* exposes mutating tools we don't declare, so the pipeline never sees them — but that's descriptor-level scoping, not service-level R1 enforcement. Consequence (recorded 2026-08-16, cross-port review ⑤): the rig also cannot exercise the spec's §6.5 denial channel — no out-of-policy call ever reaches the service to be refused, so **no `isError` denial ever fires on this rig**. The expected-denial protocol guidance stays deferred until a conformant reference service (active verb-enum, `isError` refusals) exists; do not cite this rig as evidence the denial path works.
- **pAIchart never actuates.** The output is an *approved change package*; applying it is out-of-band and human-gated.

---

## Sibling rig: the IGP-migration triangle (built 2026-08-23)

`igp-triangle/` is a **separate 3-node lab** for the OSPF→IS-IS migration program arc — OSPF area-0
brownfield baseline (NO BGP, NO T6 seed, NO policy ports), lab `igp-ceos` on its own bridge
`clab-igp` (172.30.31.0/24), full-triangle links with a deliberate transit-path cost design. It
reuses this rig's tunnel/descriptor/:3107 via a variant device-service image (`nornir-mcp-rig:igp`,
3-host inventory baked at build). Build/verify/teardown + the OSPF analogue of the data-plane
pre-flight live in `igp-triangle/README.md`; all of this guide's traps (docker-start/veth, stale
flash, `-p 15`, boot timing) apply with container names `clab-igp-ceos-*`. **Never run both labs
at once** — memory verdict in `cline_docs/igp-migration-design-2026-08-21/PLAN-OF-RECORD.md`.
For migration runs: between-gate applies are made LIVE by the operator, never via startup-config
edits — a `--reconfigure` rolls every applied phase back to baseline (that is its rollback use).

## See also

- `README.md` — rig infrastructure runbook (build/verify/teardown)
- `paichart` repo `descriptors/ceos-lab-readonly-descriptor.json` — the published descriptor
- `../DEVICE-SERVICE-INTEGRATION-SPEC.md` — the WS4 contract this rig deliberately under-implements (identity)
- `cline_docs/network-provisioning-promotion/ROADMAP.md` — Phase 4 (this rig) in context
- pAIchart prompt `HOWTO-use-pipeline-harness` — the harness mechanics, deliverable contract, confidence rubric
