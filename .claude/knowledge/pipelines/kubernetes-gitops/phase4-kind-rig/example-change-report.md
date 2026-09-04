# Kubernetes / GitOps — Change Report
## orders-api HPA + Resource Requests/Limits · trading namespace

> **Source:** pAIchart kubernetes-gitops pipeline, 2026-06-28 (the Phase-4 kind-rig validation run).
> **POV:** Meridian Capital — Implementation & Provisioning phase, stage "Pipeline: k8s provisioning".
> **Pipeline task:** `cmqx7fbtp0003yxhi3dshk5un` · 4 typed children (Harvest → Design → Author → Review).
> **Cluster:** harvested **live, read-only** from a disposable kind cluster (`k8s-rig`, 1 node) via the
> E1-conformant read-only MCP service (`provider:'mcp'`, verb-enum, `list_secret_names`).
> **Models:** specialists `claude-haiku-4-5`, harness orchestrator `claude-opus-4-8`.
> **Outcome:** Author **92/100** · Reviewer **NEEDS-REVISION 72/100** (one named, fixable gap — see §6).
> **Status:** **NOT applied.** Apply is out-of-band, GitOps-reconcile / human-gated. This is the genuine
> run output — including the review gating honestly — not a curated success.

---

## 1. Objective (the one-line input)

> *"Add a HorizontalPodAutoscaler (min 2, max 5, 70% CPU) and CPU/memory requests+limits to the orders-api
> Deployment in the trading namespace (protocol: kubernetes-gitops)"*

Plus a read-only cluster-service descriptor (inline) for the Harvester to self-provision. No further input.

## 2. Current state (Phase-0 Harvest — live, read-only)

| Thing | Harvested value |
|---|---|
| Deployment `orders-api` | apps/v1, 2/2 ready, image `nginx:1.27-alpine`, port 80 |
| **Resource requests/limits** | **NONE** (`resources: {}`) — the target gap |
| **HPA** | **None** — static at 2 replicas |
| Service | ClusterIP `10.96.193.234`, 80→80 |
| **LimitRange / ResourceQuota / PDB** | **None** (namespace `trading` has no constraints) |
| Secrets | `list_secret_names` surfaced names/keys only — **no values** read out |

The Harvester reported `✅ COMPLETE — all reads succeeded, no denials`. It explicitly captured the namespace
constraints (none) — keep this fact in mind for §6.

## 3. Change package — declarative artifacts (kustomize overlay)

```
overlays/trading/orders-api/
├── kustomization.yaml
├── deployment-patch.yaml
└── hpa.yaml
```

**`deployment-patch.yaml`** (strategic-merge — adds the missing resources block):
```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: orders-api, namespace: trading }
spec:
  template:
    spec:
      containers:
      - name: orders-api
        resources:
          requests: { cpu: 250m, memory: 256Mi }
          limits:   { cpu: 1000m, memory: 512Mi }
```

**`hpa.yaml`**:
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: orders-api, namespace: trading }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: orders-api }
  minReplicas: 2
  maxReplicas: 5
  metrics:
  - type: Resource
    resource:
      name: cpu
      target: { type: Utilization, averageUtilization: 70 }
```

**`kustomization.yaml`** references `../../base/orders-api`, `patchesStrategicMerge: [deployment-patch.yaml]`,
`resources: [hpa.yaml]`. (Author assumption: the base Deployment lives at that kustomize path — flagged.)

**Design rationale (Author):** the CPU **request** (250m) is the HPA's utilization denominator — without it the
`type: Resource` CPU metric is undefined and the HPA won't scale. The single atomic commit guarantees the request
lands before the HPA, so scaling is valid from the moment of apply. Declarative only — **no `kubectl patch`/`scale`**.

## 4. Validation facts (offline, deterministic — facts, not verdicts)

| Tool | Command | Expected |
|---|---|---|
| **kubeconform** | `kubeconform -summary -output json deployment-patch.yaml hpa.yaml` | `valid: 2, invalid: 0` (schema) |
| **kustomize build** | `kustomize build overlays/trading/orders-api/` | renders Deployment(patched)+HPA, no error |
| **OPA / conftest** | `conftest test -p policy.rego deployment-patch.yaml hpa.yaml` | `2 passed, 0 failed` (requests+limits present, min≤max, scaleTargetRef→Deployment) |

No `kubectl diff` / live-cluster contact anywhere — the validation is offline + reproducible.

## 5. Rollback

1. **GitOps (preferred):** `git revert <commit>` → reconciler removes the HPA + restores the prior Deployment spec.
2. **Deployment-only:** `kubectl rollout undo deployment/orders-api -n trading --to-revision=<n>` (note: leaves the HPA without a request to scale on — GitOps revert is preferred).
3. **Manual:** `kubectl delete hpa orders-api -n trading` + optionally remove the resources block; rescale to 2.

Rollback-readiness checklist (prior revision captured, HPA-deletion safe, resource-removal safe, reconcile idempotent) all ✅.

**Apply order:** single atomic commit → reconciler applies the Deployment patch first, then the HPA. ~30 s apply
(no pod restart — pod template spec unchanged), 1–2 min HPA stabilization, 5–10 min observation window.

## 6. Independent review — **NEEDS-REVISION (72/100)**

The GitOps Change Reviewer ran an 8-point QA and **PASSED** seven: policy compliance, the **critical HPA↔CPU-request
dependency** (it independently verified the request is the utilization denominator), declarative-not-imperative,
offline validation facts, rollback, documentation, atomic apply.

**It gated on one blocking gap — and it was right to:**
> *"Missing Phase-0 harvest output showing LimitRange, ResourceQuota, and PDB for the `trading` namespace …
> this gap prevents me from independently verifying constraint fit (requirement #3)."*

**Path to approval (Reviewer's own):** the Author either forwards the Phase-0 constraint evidence, or adds explicit
assumption flags. Then all 8 criteria pass.

### The honest pipeline finding (why this example is worth keeping)
The Harvester **did** capture the constraints (§2: LimitRange/ResourceQuota/PDB = none). But the Reviewer reviews the
**Author's package**, and the Author's output **didn't restate** that constraint evidence — so the Reviewer, reading
the package, couldn't verify constraint-fit and correctly returned NEEDS-REVISION. This is a real
**context-propagation gap**: information present upstream (harvest) didn't propagate through the Author's deliverable
to the Reviewer. The fix is a one-line role-guidance tweak (the Author must forward the harvested constraint findings,
or the §6 chain must carry the harvest snapshot to the Reviewer) — exactly the kind of traceability gap the
adversarial review exists to catch. **This is the review working, not failing.**

## 7. What this run validated (and the one caveat)
- ✅ End-to-end cognition against a **real cluster**: harvest → design → author → declarative GitOps package → review.
- ✅ **Security floor live:** read-only by verb-enum + RBAC; `list_secret_names` surfaced names/keys, **never values**.
- ✅ **Declarative + facts-not-verdicts:** kustomize/HPA manifests + offline kubeconform/kustomize/OPA.
- ✅ **Review gates honestly:** NEEDS-REVISION on a genuine traceability gap, not a rubber-stamp.
- ⚠️ **SYNTHESIZE was orphaned** by a concurrent deploy (`pm2 reload` killed the worker mid-turn) — the children's
  outputs above ARE the deliverable; only the harness-root `report.md` aggregation was lost. (Lesson:
  don't deploy during an in-flight pipeline — see `feedback_no_push_during_inflight_run`.)

## 8. See also
- `README.md` — rig build/teardown · `DEMO-RUN-GUIDE.md` — how to run it · `../kubernetes-gitops-pipeline.md` — the design
- The network analog: `../../network-provisioning/phase4-ceos-rig/example-change-report.md` (APPROVED 92 — a clean run, for contrast)
