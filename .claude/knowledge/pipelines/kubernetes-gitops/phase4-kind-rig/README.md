# Phase-4 kind k8s Validation Rig — Runbook

> Build/verify/teardown for the **kubernetes-gitops** pipeline validation rig. For how to *run* the
> pipeline against it, see `DEMO-RUN-GUIDE.md`. Mirrors `../../network-provisioning/phase4-ceos-rig/`.

## What this rig is (and is NOT)

A disposable **kind** (Kubernetes-in-Docker) cluster on prod + a **read-only k8s MCP service** (the
E1 reference service) the pipeline harvests through. It validates the **cognition pipeline** (harvest →
design → manifest authoring → review against real cluster state) **and the R1/R2 read-only floor**
(verb-enum allowlist + a read-only RBAC ServiceAccount).

**Honest non-conformance** (same caveat the cEOS rig carried): the MCP service authenticates to the
cluster with a **static SA token**, not the **JWKS-forwarded per-user identity** the spec (R2a) mandates.
This validates cognition + R1/R2 enforcement + R9-at-the-wire — **not** the identity contract.

## Files

| File | Purpose |
|---|---|
| `kind-config.yaml` | 1-node kind cluster |
| `readonly-rbac.yaml` | read-only SA + ClusterRole + binding + token Secret (R2) |
| `sample-workloads.yaml` | `trading/orders-api` Deployment+Service+ConfigMap+Secret (the harvest target; HPA/limits deliberately absent) |
| `k8s-mcp-readonly/` | the read-only MCP service (`server.py` + `Dockerfile` + `requirements.txt`) — verb-enum, `list_secret_names`, `isError` channel |
| `k8s-readonly-descriptor.json` | the read-only descriptor (publish to the `paichart` repo) |

## PREREQ — prod has docker (29.5.2), 6.4 GB RAM, 15 G disk, cloudflared binary. kind + kubectl are NOT installed (Step 1).

## Step 1 — Install kind + kubectl on prod
```bash
ssh <PROD_USER>@<PROD_HOST>
# kind (static binary)
curl -Lo /usr/local/bin/kind https://kind.sigs.k8s.io/dl/v0.30.0/kind-linux-amd64 && chmod +x /usr/local/bin/kind
# kubectl
curl -Lo /usr/local/bin/kubectl "https://dl.k8s.io/release/$(curl -sL https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && chmod +x /usr/local/bin/kubectl
kind version && kubectl version --client
```

## Step 2 — Create the cluster + apply RBAC + workloads
```bash
# copy this dir to prod, e.g. /root/kind-k8s-rig/, then:
cd /root/kind-k8s-rig
kind create cluster --name k8s-rig --config kind-config.yaml     # ~1-1.5 GB
kubectl apply -f readonly-rbac.yaml
kubectl apply -f sample-workloads.yaml
kubectl -n trading get deploy,svc,cm,secret                      # sanity: orders-api present, no HPA/limits
```

## Step 3 — Build the read-only ServiceAccount kubeconfig (never the kind admin one)
```bash
cd /root/kind-k8s-rig
SERVER=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')
CA=$(kubectl -n kube-system get secret readonly-harvester-token -o jsonpath='{.data.ca\.crt}')
TOKEN=$(kubectl -n kube-system get secret readonly-harvester-token -o jsonpath='{.data.token}' | base64 -d)
cat > readonly.kubeconfig <<EOF
apiVersion: v1
kind: Config
clusters: [{ name: k8s-rig, cluster: { server: ${SERVER}, certificate-authority-data: ${CA} } }]
users: [{ name: readonly, user: { token: ${TOKEN} } }]
contexts: [{ name: ro, context: { cluster: k8s-rig, user: readonly } }]
current-context: ro
EOF
# verify it's read-only: list works, write is FORBIDDEN
KUBECONFIG=readonly.kubeconfig kubectl -n trading get deploy orders-api          # OK
KUBECONFIG=readonly.kubeconfig kubectl -n trading delete deploy orders-api --dry-run=server  # expect Forbidden
KUBECONFIG=readonly.kubeconfig kubectl -n trading get secret orders-api-creds    # expect Forbidden (get) — list-only
```

## Step 4 — Build + run the MCP service (read-only, :3112 — the rig's DEDICATED port since 2026-07-15)
```bash
cd /root/kind-k8s-rig/k8s-mcp-readonly
docker build -t k8s-mcp-readonly:phase4 .
docker run -d --name k8s-mcp --network host -e PORT=3112 \
  -v /root/kind-k8s-rig/readonly.kubeconfig:/app/kubeconfig:ro \
  --memory 512m --cpus 0.5 k8s-mcp-readonly:phase4
# sanity (406 = MCP up): curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3112/mcp
```
> ⚠️ Confirm on first boot (cf. cEOS Step 3): (a) FastMCP's `ToolError` produces an `isError` tool
> RESULT (not a JSON-RPC throw) — test a bad `resourceType`; (b) `--network host` lets the container
> reach the kind API at 127.0.0.1. Both are quick to shake out at run time.

## Step 5 — Tunnel (DEDICATED route since 2026-07-15: k8s-lab.paichart.app → :3112)
The SYD-Arista1 tunnel carries THREE public-hostname routes (ceos-lab→:3107, k8s-lab→:3112,
tf-lab→:3113 — added in the CF Zero Trust dashboard, "Published application routes"). The connector
is a permanent systemd service on the droplet — **nothing to install**; once the k8s service binds
:3112 the endpoint is live:
```bash
systemctl is-active cloudflared                     # active (permanent — shared by all three rigs)
curl -s -o /dev/null -w "%{http_code}\n" https://k8s-lab.paichart.app/mcp   # expect 406 (502 = service not bound yet)
```
> All three rigs can now run CONCURRENTLY — the shared-:3107 constraint is retired.

## Step 6 — Publish the descriptor + seed k8s to UAT
- Publish `k8s-readonly-descriptor.json` to the **paichart** repo `descriptors/` (raw URL goes in the task).
- Seed the k8s templates + protocol to UAT (on prod, from the deployed release):
```bash
cd /var/www/paichart-app/current && source .env.production
NODE_ENV=production npx ts-node --project prisma/tsconfig.seed.json scripts/seed-kubernetes-gitops-templates.ts
# the kubernetes-gitops-protocol is already in seed-protocol-prompts.ts (WP-B); re-seed protocols if needed:
NODE_ENV=production npx ts-node --project prisma/tsconfig.seed.json scripts/seed-protocol-prompts.ts   # + pm2 restart paichart-mcp + /mcp re-auth
```

## Step 7 — Run + verify → see `DEMO-RUN-GUIDE.md`.

## Step 8 — Teardown
```bash
docker rm -f k8s-mcp
kind delete cluster --name k8s-rig
systemctl stop cloudflared && cloudflared service uninstall
# keep images: k8s-mcp-readonly:phase4 (and the kind node image) for re-runs
```

## Resource guardrails
kind ~1-1.5 GB + k8s-mcp 512 MB cap → ~2 GB; prod has ~6.4 GB avail. Watch RAM (OOM would hit paichart-mcp/web).
