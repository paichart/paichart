# kind k8s Rig — Prod Build Execution Plan

> The **sequenced execution checklist** for standing the rig up on prod (<PROD_HOST>), with exact
> commands, the file each step uses, the **verification gate** (don't proceed until it's green), owner
> (🤖 me via ssh/MCP · 🧑 Steve), and the two shake-out points. The README is the *reusable* runbook;
> this is the *this-build* plan. Source artifacts: `phase4-kind-rig/` (committed `1cca3050`).
>
> **Prereqs (scanned 2026-06-28):** docker 29.5.2 ✓, ~6.4 GB RAM / 15 G disk ✓, cloudflared binary ✓,
> SYD-Arista1 tunnel token in hand ✓. kind ✗ / kubectl ✗ (Step P0). Rig dir not yet on prod (Step P0).

## Phase A — Cluster (🤖)

| # | Command (on prod) | File | Gate (verify) |
|---|---|---|---|
| A0 | `curl -Lo /usr/local/bin/kind https://kind.sigs.k8s.io/dl/v0.30.0/kind-linux-amd64 && chmod +x /usr/local/bin/kind`<br>`curl -Lo /usr/local/bin/kubectl "https://dl.k8s.io/release/$(curl -sL https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && chmod +x /usr/local/bin/kubectl` | — | `kind version` + `kubectl version --client` print versions |
| A0b | `scp -r` the rig dir to prod `/root/kind-k8s-rig/` (from copov15 `phase4-kind-rig/`) | all | `ls /root/kind-k8s-rig/kind-config.yaml` exists |
| A1 | `cd /root/kind-k8s-rig && kind create cluster --name k8s-rig --config kind-config.yaml` | `kind-config.yaml` | `kubectl get nodes` → 1 node `Ready` (~1-1.5 GB used) |
| A2 | `kubectl apply -f readonly-rbac.yaml` | `readonly-rbac.yaml` | `kubectl -n kube-system get sa readonly-harvester` + the ClusterRole exist |
| A3 | `kubectl apply -f sample-workloads.yaml` | `sample-workloads.yaml` | `kubectl -n trading get deploy,svc,cm,secret` → `orders-api` Up, **no HPA, no limits** |
| A4 | build `readonly.kubeconfig` (README Step 3 heredoc: SERVER + CA + token from `readonly-harvester-token`) | — | **read-only proof:** `KUBECONFIG=readonly.kubeconfig kubectl -n trading get deploy orders-api` OK; `… delete deploy orders-api --dry-run=server` → **Forbidden**; `… get secret orders-api-creds` → **Forbidden** |

> **A4 gate is load-bearing** — it proves R2 (RBAC) before the service trusts it. If `delete --dry-run` is
> NOT Forbidden, the ClusterRole is too broad — fix before continuing.

## Phase B — MCP service (🤖, **shake-out #1**)

| # | Command (on prod) | File | Gate |
|---|---|---|---|
| B1 | `cd /root/kind-k8s-rig/k8s-mcp-readonly && docker build -t k8s-mcp-readonly:phase4 .` | `Dockerfile`,`server.py`,`requirements.txt` | image built (no pip/build error) |
| B2 | `docker run -d --name k8s-mcp --network host -e PORT=3112 -v /root/kind-k8s-rig/readonly.kubeconfig:/app/kubeconfig:ro --memory 512m --cpus 0.5 k8s-mcp-readonly:phase4` | — | `docker ps \| grep k8s-mcp` Up; `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3112/mcp` → **406** |
| B3 | **Shake-out #1 — verify two runtime assumptions** (`docker logs k8s-mcp`): (a) the service reached the kind API (no `load_kube_config`/connection error — i.e. `--network host` + the kubeconfig server addr work); (b) a bad `resourceType` returns an **`isError` result, not a transport throw** (test once the service is registered, Phase D — or with an MCP client). | `server.py` | logs clean; if (a) fails → kubeconfig `server:` must be reachable from the container (host-net); if (b) FastMCP maps ToolError differently → wrap the return as an explicit `isError` tool-result |

> **Fallbacks for B3:** (a) if 127.0.0.1 isn't reachable, point the kubeconfig `server` at the kind
> control-plane container IP (`docker inspect k8s-rig-control-plane`) and put k8s-mcp on the `kind` network
> instead of host. (b) if `ToolError` becomes a JSON-RPC error (not isError), return a structured result
> object the harness reads as content + set the result's `isError` flag per the FastMCP API.

## Phase C — Tunnel (🤖)

| # | Command (on prod) | Gate |
|---|---|---|
| C1 | `cloudflared service install <SYD-Arista1 token>` (the 2026-06-28 token) | `systemctl is-active cloudflared` → active |
| C2 | (from anywhere) `curl -s -o /dev/null -w "%{http_code}" https://k8s-lab.paichart.app/mcp` | **406** (tunnel → :3112 → the k8s service; dedicated route since 2026-07-15) |

## Phase D — Seed UAT (🤖 seeds, 🧑 re-auth)

| # | Command | File | Gate |
|---|---|---|---|
| D1 | on prod: `cd /var/www/paichart-app/current && source .env.production && NODE_ENV=production npx ts-node --project prisma/tsconfig.seed.json scripts/seed-kubernetes-gitops-templates.ts` | `seed-kubernetes-gitops-templates.ts` | 4 k8s templates **Created/Updated** (Cluster State Harvester / Workload Architect / Manifest Rollback Author / GitOps Change Reviewer); `template(action:list)` shows them, Haiku |
| D2 | re-seed protocols: `… npx ts-node … scripts/seed-protocol-prompts.ts` | `seed-protocol-prompts.ts` | `kubernetes-gitops-protocol` upserted in agent_prompt_library (tag `protocol`) |
| D3 | **🧑 + 🤖**: `pm2 restart paichart-mcp` (prompt cache) → **Steve `/mcp` re-auth** | — | after re-auth, `prompt_command(/prompt list)` or `list_prompts()` shows the kubernetes-gitops content live |

> D3 is the one human touchpoint — the prompt cache only refreshes on restart + re-auth (the
> reference_mcp_prompt_cache rule). Templates (D1) need no restart; the protocol (D2) does.

## Phase E — Run + validate (🤖)

| # | Action (MCP tools) | Gate |
|---|---|---|
| E1 | `project(pov.details, pov_name:"Meridian Capital Arista 7130")` (reuse) or a fresh POV → povId + a stage | povId/stageId |
| E2 | `perform(task.create, …, type:PIPELINE, priority:HIGH)` — title = the HPA+limits objective `(protocol: kubernetes-gitops)`; **description carries the descriptor JSON INLINE** (from `k8s-readonly-descriptor.json`) — avoids needing a paichart-repo publish for the run | PIPELINE taskId |
| E3 | `perform(agent.execute, taskId)` (may time out on CREATE — keeps running) → poll `agent.status` until **2 SUCCESS** (CREATE + SYNTHESIZE) | both SUCCESS |
| E4 | `agent.results` → fetch `report.md`; full body via prisma `agentArtifact` on prod (connector condenses) | report.md retrieved |
| E5 | **Validate the change package**: declarative manifests (HPA + requests/limits), NOT `kubectl patch`; validation = `kubeconform`/`kustomize`/OPA (offline), NOT `kubectl diff`; rollback present; Reviewer gated ≥85; **`list_secret_names` surfaced names not values**; an out-of-allowlist read (if any) returned `isError` and did NOT degrade the harvest (K4) | a sound, approved, declarative GitOps change package |

## Teardown (after the run)
`docker rm -f k8s-mcp` · `kind delete cluster --name k8s-rig` · `systemctl stop cloudflared && cloudflared service uninstall`. Keep images (`k8s-mcp-readonly:phase4`, kind node) for re-runs.

## Risk register
- **kind on the prod host** burns ~2 GB — watch RAM (`free -m`); an OOM hits paichart-mcp/web. Tear down promptly after the run.
- **Shake-out #1 (Phase B)** is the most likely hiccup (third-party FastMCP/k8s-client integration) — budget for one iteration.
- **The `pm2 restart` (D3)** briefly drops the harness's prompt cache + Steve's auth — coordinate it.
- **Dedicated `k8s-lab` hostname since 2026-07-15** — the descriptor's `endpoint` is k8s-lab.paichart.app → :3112 (the reused-ceos-lab era is over).
