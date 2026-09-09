# Use case: partner-HTTPS security policy path with edge SNAT (a 3-pipeline program)

One objective — *let a partner reach an internal app over HTTPS, source-NATed at the edge* — becomes
**three approved-but-unapplied change packages**, produced in sequence along the traffic path by
specialist agent pipelines that harvest the real current state read-only and never actuate:

```
partner-internet → ceos1 (edge: permit + SNAT pool)  → dmz-sg (cloud SG: ingress = post-NAT pool) → ceos2 (core: dmz→inside) → internal-app
                   pipeline 1 (network-provisioning)   pipeline 2 (terraform-iac)                  pipeline 3 (network-provisioning)
```

The edge leg **derives** the NAT pool from harvested state; the two downstream legs **consume** it
through the program's interface contract, so a value invented instead of harvested is caught by the
independent program reviewer (Node C). The hosted run of this program: `programReleasable: true`,
confidence 88/100 (2026-08-22).

## What is in this directory

| file | role |
|---|---|
| `requirements.md` | what to do — scope, three pipeline objectives, approvals, acceptance. Read by the Program Architect only. |
| `topology.json` | what exists — the two switches, their bindable policy interfaces, the fabric that is out of scope. |
| `descriptors/ceos-lab-readonly-descriptor.json` | the read-only network-state service the two network legs self-provision — endpoint `127.0.0.1:3107` |
| `descriptors/terraform-readonly-descriptor.json` | the read-only Terraform-state service the cloud leg self-provisions — endpoint `127.0.0.1:3113` |

These are the self-host variants of `program-artifacts/firewall-a3-partner-path-r2/` and `descriptors/`:
identical text and tool schemas, with the service endpoints pointing at rigs running **on the same host
as your hub**. The Program Architect fetches `requirements.md` + `topology.json` from their raw GitHub
URLs through your hub's browser-automation service (run sheet step 9b); each pipeline's Harvester fetches
its descriptor the same way and registers → reads → tears down the service by itself.

## Prerequisites

1. A running self-host through step 9b of `docs/SELF-HOST-RUN-SHEET.md` (production build, Claude Code
   connected, browser-automation service seeded).
2. **Both rigs on the hub's host**, and the hub allowed to reach them:
   ```bash
   # .env — then restart the MCP process (the list is read at boot)
   HUB_PRIVATE_ENDPOINT_ALLOWLIST=127.0.0.1:3107,127.0.0.1:3113
   ```
   - the **network rig**: two Arista cEOS-lab switches under containerlab + a read-only Nornir MCP wrapper on
     `127.0.0.1:3107`. cEOS-lab is a free download that needs an Arista account (it cannot be redistributed here).
   - the **cloud rig**: LocalStack (sandbox AWS) with an applied Terraform `prod` workspace + a read-only
     Terraform-state MCP wrapper on `127.0.0.1:3113`.

   Rig setup files: `rigs/` — see "The rigs" below.
3. An Anthropic API key configured for the hub (the pipelines run agents).

## Run it — five hub calls

The exact sequence, with the responses a working install returns, is `docs/SELF-HOST-RUN-SHEET.md` **step 10b**.
In short — from Claude Code inside your clone, or as direct tool calls:

1. `perform(action: 'pov.create', …)` — a POV `pAIchart Use Cases` (country of your choice) with its phases named
   up front: `Firewall Rules Change`, `Network and Terraform`, `OSPF ISIS Migration` (all `EXECUTION`).
2. `perform(action: 'stage.create', …)` — stage `FW-A3 Program Run` in `Firewall Rules Change`.
3. `perform(action: 'task.create', …)` — `type: 'PIPELINE'`, title
   `Partner-HTTPS security policy path with edge SNAT (protocol: pov-program)`, description:
   ```
   Program intent: end-to-end partner-HTTPS policy across ceos1 (edge, SNAT) -> LocalStack dmz-sg -> ceos2 (core),
   three sequenced pipelines with transitive chaining.

   Design artifacts for the Program Architect (fetch ONLY these two URLs):
   - topology-as-code: https://raw.githubusercontent.com/paichart/paichart/main/usecases/firewall-a3-partner-path/topology.json
   - requirements: https://raw.githubusercontent.com/paichart/paichart/main/usecases/firewall-a3-partner-path/requirements.md
   ```
4. `perform(action: 'agent.assign', …)` with the Pipeline Harness template id, then
   `perform(action: 'agent.execute', parameters: { taskId, waitForCompletion: false })`.
5. When the harness comments `⏸ PROGRAM PLAN AWAITING APPROVAL`, read the Architect's *Assumptions & open questions*
   and release the gate: `perform(action: 'task.complete', parameters: { taskId: '<G0 gate id>' })`.

## First self-host run (2026-09-09, one laptop: hub + both rigs)

Architect confidence 88 → edge leg APPROVED 90 (derived pool `10.99.0.6/31`) → dmz leg APPROVED 84 (CREATE package,
pool consumed verbatim) → core leg APPROVED 88 (pool consumed via dmz) → Node C `VERDICT: APPROVED` 92 with minimality
recomputed against evidence. Program stamp: `programReleasable: false` — a mechanical containment conjunct on the third
leg (a consumer whose direct upstream is itself a consumer; tracked in the platform as a gate defect). Every human-readable
verdict said release; the machine fact said not yet. That contrast is the product: the release stayed a human decision
with the exact reason on the task.

## Honest scope

- Nothing is applied anywhere. The output is three reviewed change packages and a program verdict.
- The rigs are labs: the "cloud" is LocalStack and the switches are cEOS-lab. The harvest is real
  state from those labs, which is the point — the agents cannot invent it.
- Timing: the hosted run took ~25–40 min of agent time plus the human gates. On one laptop hosting
  the hub, both rigs and the browser service, expect the upper end.

## The rigs — `rigs/`

Both lab definitions ship here. Build them on the hub's host, in this order, from this directory.

**Network rig** (`rigs/network/`): containerlab + two cEOS-lab nodes + a read-only Nornir MCP wrapper.
```bash
sudo bash -c "$(curl -sL https://get.containerlab.dev)"            # containerlab (single binary)
# cEOS-lab: free for lab use, not redistributable — download cEOS64-lab-4.32.2.1F.tar.xz from arista.com
# (Support → Software Downloads → cEOS-lab; a free account is required), copy it to this host, then:
xz -d cEOS64-lab-4.32.2.1F.tar.xz && docker import cEOS64-lab-4.32.2.1F.tar ceos:4.32.2.1F   # tag must match topology.clab.yml
cd rigs/network && sudo containerlab deploy -t topology.clab.yml     # ~3 min; both nodes "running"
cd nornir-mcp && cp ../nornir/*.yaml . && docker build -t nornir-mcp-rig .
docker run -d --name nornir-mcp --restart unless-stopped --network clab-np -p 127.0.0.1:3107:3107 nornir-mcp-rig
```
Wait a few minutes after deploy — EOS boots slowly. The rig is ready when ceos1 shows its eBGP peer
`Established` with prefixes received (`show ip bgp summary` via the switch's eAPI, `admin`/`paichartlab` —
lab credentials, in the startup configs); containers "Up" alone prove nothing. After a `docker stop`,
**redeploy with `--reconfigure`** — `docker start` does not restore the inter-switch link.

**Cloud rig** (`rigs/cloud/`): LocalStack + an applied Terraform `prod` workspace + a read-only Terraform-state
MCP wrapper. The workspace deliberately carries a captured secret and a secret-shaped tag value — they are
what the pipeline's redaction guards are tested against; nothing in it is real.
```bash
cd rigs/cloud && bash setup.sh          # localstack :4566 (dummy creds), terraform apply, tf-readonly on 127.0.0.1:3113
```
Here `docker start localstack tf-readonly` is enough after a stop. `teardown.sh` removes both.

Then allowlist both ports for the hub (Prerequisites above), and check the registry holds **no**
`ceos-lab-readonly` / `terraform-readonly` rows — the pipelines self-provision those and a pre-existing
name makes the Harvester's registration fail.
