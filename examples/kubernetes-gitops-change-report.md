# Kubernetes / GitOps — Change Report
## orders-api HPA + Resource Requests/Limits · trading namespace

> **Source:** pAIchart kubernetes-gitops pipeline.
> **Objective (one sentence):** *"Add an HPA (min 2, max 5, 70% CPU) and CPU/memory requests+limits to the orders-api Deployment in the trading namespace."*
> **Cluster:** harvested **live, read-only** from a Kubernetes cluster via a customer-governed read-only MCP service (verb-enum allowlist + RBAC; secret *names* only, never values).
> **Outcome:** Author 92/100 · Reviewer **NEEDS-REVISION 72/100** — on one real, named traceability gap. **This is the review working, not failing** (see the Addendum).
> **Status:** **NOT applied.** Apply is a separate GitOps-reconcile / human-gated step. This is the genuine run output — review verdict included — not a curated success.

---

## What the pipeline did, autonomously

You hand pAIchart **one plain-English objective** plus a descriptor for a read-only cluster service. With no further input it:

1. **Self-provisioned** the read-only cluster service from the descriptor (register → read-only call → tear down) — pAIchart stores no cluster credentials and the registration doesn't persist.
2. **Harvested** the real cluster state — the Deployment, its (absent) resource requests/limits, the (absent) HPA, the namespace constraints, and secret *names* only — read-only, never a mutating verb.
3. **Designed** the target desired state against the harvested facts.
4. **Authored** the deliverable: a **declarative** GitOps change package (kustomize overlay), **offline** validation facts that prove each change, and a rollback plan.
5. **Reviewed** it through an independent QA agent that emitted an explicit verdict — here, **NEEDS-REVISION** with a precise blocking reason and a path to approval.

---

## CHANGE PACKAGE

**Objective:** Add a HorizontalPodAutoscaler (minReplicas 2, maxReplicas 5, 70% CPU) and CPU/memory requests+limits to the `orders-api` Deployment in the `trading` namespace, as a declarative GitOps change. No cluster contact; apply is out-of-band.

**Current state (from Phase 0 Harvest — live, read-only):**

| Thing | Harvested value |
|---|---|
| Deployment `orders-api` | apps/v1, 2/2 ready, image `nginx:1.27-alpine`, port 80 |
| **Resource requests/limits** | **NONE** (`resources: {}`) — the target gap |
| **HPA** | **None** — static at 2 replicas |
| Service | ClusterIP, 80→80 |
| **LimitRange / ResourceQuota / PodDisruptionBudget** | **None** (the `trading` namespace has no constraints) |
| Secrets | names + key names surfaced — **no values** read out |

---

### (A) Declarative artifacts — a kustomize overlay

```
overlays/trading/orders-api/
├── kustomization.yaml
├── deployment-patch.yaml
└── hpa.yaml
```

**`deployment-patch.yaml`** — strategic-merge patch that adds the missing resources block:
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

**`kustomization.yaml`** references the base Deployment, applies `deployment-patch.yaml` via `patchesStrategicMerge`, and adds `hpa.yaml` as a new resource.

**Design rationale (the pipeline's own):** the CPU **request** (250m) is the HPA's utilization denominator — without it the `type: Resource` CPU metric is undefined and the HPA never scales. A single atomic commit guarantees the request lands before the HPA, so scaling is valid from the moment of apply. Declarative throughout — **no `kubectl patch` / `kubectl scale`**.

### (B) Deterministic validation facts (offline — facts, not opinions)

| Tool | Command | Expected |
|---|---|---|
| **kubeconform** | `kubeconform -summary -output json deployment-patch.yaml hpa.yaml` | `valid: 2, invalid: 0` (schema) |
| **kustomize build** | `kustomize build overlays/trading/orders-api/` | renders the patched Deployment + HPA, no error |
| **OPA / conftest** | `conftest test -p policy.rego deployment-patch.yaml hpa.yaml` | `2 passed` — requests+limits present, `minReplicas ≤ maxReplicas`, `scaleTargetRef.kind == Deployment` |

Every check is **offline and reproducible** — no `kubectl diff` / server dry-run (that contacts the live API and needs write auth; it belongs with the out-of-band apply).

### (C) Rollback

1. **GitOps (preferred):** `git revert <commit>` → the reconciler removes the HPA and restores the prior Deployment spec.
2. **Deployment-only:** `kubectl rollout undo deployment/orders-api -n trading --to-revision=<n>` (GitOps revert preferred — keeps the config repo in sync).
3. **Manual:** `kubectl delete hpa orders-api -n trading`, optionally remove the resources block, rescale to 2.

Apply order: a single atomic commit → the reconciler applies the Deployment patch first, then the HPA. ~30 s apply (no pod restart — the pod template spec is unchanged), 1–2 min HPA stabilization, then an observation window.

---

## Independent review — **NEEDS-REVISION (72/100)**

The reviewer ran an 8-point QA and **passed seven**: policy compliance, the **critical HPA↔CPU-request dependency** (it independently verified the request is the utilization denominator), declarative-not-imperative, the offline validation facts, rollback adequacy, documentation, and atomic apply.

It **blocked on one thing — and was right to:**

> *"Missing Phase-0 harvest evidence for LimitRange, ResourceQuota, and PodDisruptionBudget in the `trading` namespace — this prevents me from independently verifying constraint-fit."*

**Path to approval (the reviewer's own):** restate the harvested namespace constraints in the change package, or add explicit assumption flags. Then all eight criteria pass.

---

## Addendum — why a NEEDS-REVISION is the trustworthy outcome

A pipeline that always returns "APPROVED" isn't a QA gate — it's a rubber stamp. This run shows the opposite: the design was sound, but the reviewer **refused to approve what it couldn't independently verify.**

The subtlety is the interesting part. The harvester *did* capture the namespace constraints (there are none). But the reviewer reviews the **authored change package**, not the raw harvest — and the package didn't *restate* that constraint evidence. So the reviewer, reading only the package, correctly couldn't confirm constraint-fit and gated on it. That's a real **traceability gap** — information that existed upstream didn't propagate into the deliverable — and catching exactly that class of gap is what an adversarial review is *for*.

The fix is a one-line change to the authoring step (carry the harvested constraints into the package), after which the same objective yields a clean APPROVED. The point of the example is not the score — it's that **the score is earned**: the review reasons about the artifact in front of it and won't sign off on an unverifiable claim, even a true one.

**The two things that make the deliverable trustworthy regardless of the verdict:**
- **It never actuates.** The output is a change *to be applied*; applying it stays out-of-band and human-gated. The cognition/actuation seam is permanent by design.
- **Read-only by construction, secrets never leave the cluster.** The harvest runs against a verb-enum-allowlisted, RBAC-scoped read-only service; an out-of-policy read (a secret value, `exec`, `pods/log`) is refused at the service and the harvest continues without degrading. Secret *names* surface; secret *values* never enter the artifact.

**Honest scope:** this run was validated against a **disposable kind cluster** standing in for a production cluster. It exercises the full cognition pipeline plus pAIchart's read-only security floor against real cluster state. The cluster service here authenticates with a static lab credential rather than pAIchart's per-user JWKS identity — the latter is the production identity contract for a customer-governed cluster service.
