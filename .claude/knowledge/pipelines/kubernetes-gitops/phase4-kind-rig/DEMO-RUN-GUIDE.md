# Kubernetes/GitOps Pipeline — Demo Run Guide

> **What this is**: the end-to-end walkthrough for **running the kubernetes-gitops pipeline against the
> live kind rig** — the **Claude Desktop** path (recorded demo) and the **API-tool** path (off-camera
> dry run). Rig build is in `README.md`; teardown is §"Rig shutdown" below.
>
> **✅ Validated 2026-06-28** — a full run executed against a live kind cluster (Harvest→Design→Author→Review
> all SUCCESS): Author 92, Reviewer **NEEDS-REVISION 72** on one real traceability gap (a *good* outcome — the
> review gated honestly). The actual output is in **`example-change-report.md`**. Models: specialists
> `claude-haiku-4-5`, orchestrator `claude-sonnet-5` (corrected 2026-08-05 from `claude-opus-4-8` — verified live). The descriptor is **published + live** (URL below, 200).
>
> **State**: rig is hot when `README.md` Steps 1–6 are done (kind `k8s-rig` + `k8s-mcp` on **:3112**, its
> dedicated port since 2026-07-15 + cloudflared), descriptor published, registry clean (the pipeline
> self-provisions `k8s-rig-readonly`).
> 
> 🔴 **DO NOT PUSH TO `main` WHILE THIS RIG IS UP.** `next build` runs on the production box and so does this rig — the same finite RAM. On 2026-08-02 one deploy with the cEOS + tf rigs up saturated a 7.9 GB host and two deploys failed; teardown freed 2.9 GB and the same deploy succeeded first try. It LOOKS like an outage from outside (curl 000, ICMP loss, SSH banner timeouts) while production keeps serving — check `uptime` and `pm2 list` before concluding otherwise. Recurrence of the 2026-07-24 incident; the `concurrency:` group fixed stacking, not the collision. `cline_docs/follow-ups/deploy-builds-on-the-rig-host-2026-08-02.md`.

---

## The story this demo tells

You hand pAIchart **one plain-English Kubernetes objective** plus a **descriptor URL** for a read-only
cluster service. With no further input it:

1. **Self-provisions** the read-only k8s service from the descriptor (register → read-only call → teardown) — pAIchart stores no cluster credentials.
2. **Harvests** real cluster state via many narrow scoped reads (Deployment, Service, ConfigMap, HPA-absence, Secret *names* — never values), sanitized at the wire (R9) before any reasoner reads it.
3. **Designs** the target desired state, **authors** a declarative GitOps change package (manifests / kustomize / Helm-values diff + offline validation facts `kubeconform`/`kustomize`/OPA + rollback), and a **reviewer** gates it.
4. Produces an **approved-but-unapplied, GitOps-ready change package**. **pAIchart never actuates** — apply is **Argo/Flux reconcile or `kubectl apply`, out-of-band and human-gated**.

The money shot: *a URL in, an approved GitOps change package out, against a real cluster, fully autonomous — and the read-only service refuses (returns `isError`) anything outside its allowlist without degrading the run.*

---

## Live rig facts

| Thing | Value |
|---|---|
| Service endpoint | `https://k8s-lab.paichart.app/mcp` (cloudflared → prod `localhost:3112`) — DEDICATED route since 2026-07-15 (shared-:3107 era over; all rigs can run concurrently) |
| **Descriptor raw URL** (goes in the task) | `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json` |
| Protocol tag (goes in the task title) | `(protocol: kubernetes-gitops)` |
| Cluster | kind `k8s-rig` (1 node); namespace `trading` with `orders-api` Deployment (2 replicas, **no HPA, no resource limits** — the target gap), Service, ConfigMap, a Secret |
| Declared read-only tools | `list_resources`, `get_resource`, `list_secret_names` (verb-enum; no write/exec/log/secret-values) |

---

## Pre-flight checklist
```bash
# 1. Rig hot? (406 = MCP up through the tunnel; both containers Up)
curl -s -o /dev/null -w "endpoint HTTP %{http_code}\n" https://k8s-lab.paichart.app/mcp      # expect 406 (502 = k8s-mcp not bound on :3112)
ssh <PROD_USER>@<PROD_HOST> 'docker ps --format "{{.Names}}" | grep -E "k8s-mcp"; kind get clusters'
# 2. Registry clean? registry(action: "list") -> k8s-rig-readonly should NOT be present (pipeline self-provisions)
# 3. Descriptor live?
curl -s -o /dev/null -w "descriptor HTTP %{http_code}\n" \
  https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json  # expect 200
```
If down, rebuild per `README.md` (Steps 2–5). If a stale `k8s-rig-readonly` exists: `registry(action: "delete", service_name: "k8s-rig-readonly", confirm: true)`.

---

## Pick an objective

Good fits against this cluster (clean harvest→design→manifest story):

- **`Add a HorizontalPodAutoscaler (min 2, max 5, target 70% CPU) and CPU/memory requests+limits to the orders-api Deployment in the trading namespace (protocol: kubernetes-gitops)`** ← recommended; the HPA + limits are genuinely absent.
- `Add a default-deny NetworkPolicy for the trading namespace and allow only orders-api ingress on 80 (protocol: kubernetes-gitops)`
- `Add a PodDisruptionBudget (minAvailable 1) for orders-api (protocol: kubernetes-gitops)`

The Harvester reads current state (Deployment spec, no HPA, no limits, Secret names only); the Architect designs; the Author writes the declarative manifest/kustomize change + offline validation facts (`kubeconform`/`kustomize build`/OPA) + rollback (git revert); the Reviewer gates it.

---

## Path A — Claude Desktop (recorded demo)

**Prereq (off-camera): the POV/phase/stage exist** (reuse the Meridian POV's Implementation phase, or a fresh "Kubernetes" POV).

**On camera**, a single instruction:

> In pAIchart, create a PIPELINE task in the **"\<POV name\>"** POV under the **"\<phase\>"** phase.
> Title: **"Add a HorizontalPodAutoscaler (min 2, max 5, 70% CPU) and CPU/memory requests+limits to the orders-api Deployment in the trading namespace (protocol: kubernetes-gitops)"**.
> In the description, include this read-only cluster-service descriptor for the harvester to self-provision:
> `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json`
> Set type PIPELINE, priority HIGH. Then execute it, poll status, and when it completes fetch the change-package deliverable.

**What you'll see**:
1. Harness **CREATE** — 4 typed children in a child stage (Cluster State Harvester → Workload Architect → Manifest Rollback Author → GitOps Change Reviewer), exits.
2. **Harvester** (ORCHESTRATOR) self-provisions `k8s-rig-readonly`, issues narrow reads (Deployment, Service, ConfigMap, HPA list = empty, `list_secret_names` = names only), tears the registration down.
3. **Architect** designs the HPA + requests/limits (no cluster contact).
4. **Author** (DOCUMENTER) emits the declarative change package — the deliverable.
5. **Reviewer** (REVIEWER) gates: approved / needs-revision.
6. Harness **SYNTHESIZE** → `report.md` on the harness root = the GitOps change package.

---

## Path B — API tools (off-camera dry run)

```text
# 1. POV/stage (pick or create)
project(action: "pov.details", pov_name: "<POV name>")             # -> povId, phaseId
perform(action: "stage.create", parameters: { povId: "<povId>", phaseName: "<phase>", name: "Pipeline: k8s provisioning" })  # -> stageId

# 2. PIPELINE task (descriptor URL in the description)
perform(action: "task.create", parameters: {
  povId: "<povId>", stageId: "<stageId>",
  title: "Add a HorizontalPodAutoscaler (min 2, max 5, 70% CPU) and CPU/memory requests+limits to the orders-api Deployment in the trading namespace (protocol: kubernetes-gitops)",
  description: "Read-only cluster-service descriptor for the harvester to self-provision: https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json",
  type: "PIPELINE", priority: "HIGH" })                            # -> PIPELINE taskId

# 3. Execute + poll + fetch
perform(action: "agent.execute", taskId: "<PIPELINE taskId>")     # may time out on CREATE — it keeps running server-side
perform(action: "agent.status",  taskId: "<PIPELINE taskId>")     # poll until 2 SUCCESS execs (CREATE + SYNTHESIZE)
perform(action: "agent.results", taskId: "<PIPELINE taskId>")     # preview + fetch ids
# report.md is condensed via the connector; for the full body read agent_artifacts on prod via prisma (see the A1/A2 dry-run).
```

> `type: "PIPELINE"` is mandatory — it makes the harness root carry the customer `report.md` (the change package).

---

## Reading the result

- **Deliverable** = harness root **`report.md`** = the Author's GitOps change package (declarative manifests / kustomize overlay / Helm-values diff + offline validation facts + rollback). Fetch first.
- **`pipeline-index.json`** = forensic summary (quality gates, child roster).
- **Per-child `result.json`** = each specialist's chained output.
- **Confidence** ~78–90 across specialists is healthy. <50 on a child = real blocker.

### Verify the design beats (good demo)
- **Declarative, not imperative**: the change package emits manifests/kustomize/Helm-values, **never** `kubectl patch`/`scale`.
- **Facts not verdicts**: validation = `kubeconform`/`kustomize build`/`conftest`-OPA (offline), **not** `kubectl diff`.
- **Denial-is-success**: if a child attempts an out-of-allowlist read (e.g. a secret *value*), the service returns `isError` and the harvest **continues without degrading** (K4) — confirm the Harvester didn't tank its confidence on it.
- **Secret hygiene**: `list_secret_names` surfaced `orders-api-creds` **names/keys** (`api-token`, `db-password`) but **no values**.

---

## Honest caveats (state them in the demo)

- **Not full WS4 conformance.** The MCP service uses a **static read-only SA token**, not the **JWKS-forwarded per-user identity** (R2a). Validates cognition + R1/R2 read-only floor + R9-at-the-wire — **not** the identity contract.
- **Read-only by verb-enum AND RBAC** (stronger than the cEOS rig's descriptor-only scoping): the allowlist refuses non-read kinds, and the SA can't write/exec/`get` secrets even if the service had a bug.
- **pAIchart never actuates.** Output is an *approved GitOps change package*; apply (Argo/Flux reconcile / `kubectl apply`) is out-of-band and human-gated.
- **Expect a NEEDS-REVISION unless you forward constraint evidence.** In the 2026-06-28 run the Reviewer gated on
  "missing LimitRange/ResourceQuota/PDB harvest evidence" even though the Harvester *did* capture it (none exist) —
  because the Reviewer reviews the **Author's package**, and the Author didn't restate the constraint findings. For a
  clean APPROVED demo, either add "include the harvested namespace constraints in your change package" to the objective,
  or accept the NEEDS-REVISION and narrate it as the review gating honestly (see `example-change-report.md` §6).

---

## Rig shutdown (teardown)

After the run, tear the rig down promptly (kind ~2 GB on the prod host — an OOM would hit paichart-mcp/web):

```bash
ssh <PROD_USER>@<PROD_HOST>
docker rm -f k8s-mcp                                   # the read-only MCP service
kind delete cluster --name k8s-rig                     # the throwaway cluster
# ⚠️ Do NOT stop/uninstall cloudflared — since 2026-07-15 the ONE tunnel serves all three rigs
#    (ceos-lab:3107 / k8s-lab:3112 / tf-lab:3113); killing it takes down the other rigs' endpoints.
# keep the images for re-runs: k8s-mcp-readonly:phase4 + the kind node image
```

Verify it's down: `docker ps | grep -E "k8s-mcp"` (empty), `kind get clusters` (no `k8s-rig`),
`curl -s -o /dev/null -w "%{http_code}\n" https://k8s-lab.paichart.app/mcp` (502 — route stays, no origin bound; the tunnel itself STAYS UP for the other rigs). The DB
artifacts (each child's `result.json`) **survive teardown** — the change package is fetchable from
`agent_artifacts` long after the cluster is gone (that's how `example-change-report.md` was produced).
Full runbook: `README.md` Step 8.

---

## See also
- `example-change-report.md` — the actual 2026-06-28 run output (change package + the NEEDS-REVISION review)
- `README.md` — rig build/verify/teardown runbook
- `../K8S-SERVICE-INTEGRATION-SPEC.md` — the contract this service implements (under-implements only identity)
- `../kubernetes-gitops-pipeline.md` — the use-case design; `../IMPLEMENTATION-PLAN.md` — the build
- pAIchart prompt `HOWTO-use-pipeline-harness` — harness mechanics, deliverable contract, confidence rubric
