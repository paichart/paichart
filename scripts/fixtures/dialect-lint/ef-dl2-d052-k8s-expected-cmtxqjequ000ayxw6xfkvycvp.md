# GitOps Change Package — NetworkPolicy Ingress Controls, `trading` Namespace

## 1. Manifests

**File: `netpol/default-deny-ingress.yaml`**
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: trading
spec:
  podSelector: {}
  policyTypes:
    - Ingress
```

**File: `netpol/allow-orders-api-ingress.yaml`**
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-orders-api-ingress
  namespace: trading
spec:
  podSelector:
    matchLabels:
      app: orders-api        # harvested Deployment/pod selector, verbatim — see §3
  policyTypes:
    - Ingress
  ingress:
    - ports:
        - protocol: TCP
          port: 80
      # deliberately no `from:` clause — port-only scope, rationale in §4.2
```

**File: `kustomization.yaml`**
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - netpol/default-deny-ingress.yaml
  - netpol/allow-orders-api-ingress.yaml
```

Both objects ship in a **single commit / single Kustomization** (no separate overlays, no patches) — see §6 ordering.

---

## 2. Namespace Constraint Evidence (Restated from Harvest)

Restated verbatim from the Architect's §6 handoff (itself carried from the Cluster State Harvester). Presence and absence are both reported as findings — none omitted:

| Constraint kind | Harvested result | Finding |
|---|---|---|
| NetworkPolicy | `items: []` | **ABSENT** — namespace was fully open to ingress prior to this change; this package introduces the first ingress control. |
| LimitRange | `items: []` | **ABSENT** — no per-container resource floor/ceiling enforced. |
| ResourceQuota | `items: []` | **ABSENT** — no namespace-level aggregate quota enforced. |
| PodDisruptionBudget | `items: []` | **ABSENT** — no PDB exists for orders-api or any other workload in `trading`. |

All four reads returned explicit empty `items: []` (verified empty reads, not timeouts/errors). This package's manifests introduce **no** LimitRange/ResourceQuota/PDB object — none of these four constraint kinds gate or interact with a NetworkPolicy object type, so this package does not need to fit inside a quota/limit envelope; they are restated here purely per the evidence-obligation requirement, not because they constrain this change.

### 2.1 Selector-fit Evidence

| Object | Selector as authored in this package | Source |
|---|---|---|
| `allow-orders-api-ingress.spec.podSelector.matchLabels` | `{app: orders-api}` | quoted **verbatim from the harvested Deployment `spec.selector.matchLabels`** (`{"app": "orders-api"}`), confirmed to also match the harvested live pod labels (`{"app":"orders-api","tier":"backend","pod-template-hash":"7b8d4c94b4"}`) — the extra `tier`/`pod-template-hash` keys on the live pods do not prevent a `matchLabels` selector match since `matchLabels` is satisfied by a subset match. |
| `default-deny-ingress.spec.podSelector` | `{}` (empty selector, matches all pods) | fixed by program interface contract — not derived from harvest, deliberately unconditional. |

**Not used**: topology.json's `claimedPodSelector` (`{app: orders-api}`) is corroborating only per the contract's explicit non-authoritative flag. It happens to match the harvested value exactly in this case — a confirmation, not the basis for this package's selector.

---

## 3. Chosen-Value Rationale (alternatives compared)

No approved-but-unapplied change to the `trading` namespace was named by the harvest, the Architect's design, or this task — so each comparison below is evaluated only against the harvested (current) state; there is no second state to re-run the comparison against.

### 3.1 `policyTypes: [Ingress]` only (chosen) vs `[Ingress, Egress]`

- **Chosen — Ingress only**: at harvested state, the 2 Running orders-api pods keep 100% of their current outbound behavior (DNS resolution, any downstream call) unaffected. Zero live-traffic risk.
- **Rejected — Ingress+Egress**: adding `Egress` to `policyTypes` without any `egress:` rules block makes Kubernetes treat egress as **default-deny for the selected pods** (empty policyTypes entry = deny-all for that direction unless rules are present). The harvest captured **no egress-destination inventory** (no Service/Endpoints objects for DNS, no record of what orders-api calls outbound). Enabling this today would immediately break DNS resolution and any outbound calls for both live Running pods — a certain regression, not a hardening step, given zero egress visibility.
- **Decision**: Ingress-only. Egress-default-deny is a legitimate future step but requires its own harvest pass over egress destinations first (named gap, not designed around by invention).

### 3.2 Allow-policy scope: port-only (chosen) vs `namespaceSelector`/`podSelector`-restricted "from"

- **Chosen — port-only** (`ports: [{protocol: TCP, port: 80}]`, no `from:`): closes every port except the one the harvested Deployment/pods actually expose (80/TCP), without asserting any caller-identity claim the harvest never produced. At harvested state this has **zero breakage risk** to any current caller of orders-api:80, known or unknown.
- **Rejected — caller-restricted `from`**: the harvest recorded **no Service/Endpoints/Ingress objects identifying orders-api's legitimate callers**. Picking any namespace/pod selector to restrict `from` would require guessing which namespace(s) are legitimate — with apply out-of-band and no dry-run tool available in this pipeline, a wrong guess would silently break a real caller (e.g. an API gateway) with no pre-apply signal.
- **Decision**: port-only. This is an explicit, harvest-driven scope limitation to be revisited once caller-identity evidence is harvested — not a completed narrowing.

### 3.3 Operator revisit triggers (unchanged from design, carried forward)

If a second workload is added to `trading`: (a) it gets no ingress by default under `default-deny-ingress`'s `podSelector: {}` — correct, no action needed; (b) it will need its **own** `allow-<workload>-ingress` policy — `allow-orders-api-ingress`'s selector does not extend to it; (c) because `allow-orders-api-ingress` has no `from:` restriction, any pod that can route to orders-api:80 — including the new workload — is already permitted to call it; if that is undesired, the operator must add a `namespaceSelector`/`podSelector` restriction once the actual caller set is known; (d) verify the new workload is not mislabeled `app: orders-api` (label-collision risk against both policies).

---

## 4. Drift

**Not graded.** No GitOps repo desired-state baseline was supplied to this run (per program interface contract: `drift.graded: false`). No drift claim — one-sided or otherwise — is made anywhere in this package.

---

## 5. Deterministic Offline Validation

All checks are static/offline — no cluster contact, no `kubectl diff`, no server-side dry-run.

### 5.1 `kubeconform` — schema validity

```
kubeconform -strict -summary -schema-location default netpol/default-deny-ingress.yaml netpol/allow-orders-api-ingress.yaml
```
**Expected output:**
```
Summary: 2 resources found parsing 2 stream(s) - Valid: 2, Invalid: 0, Errors: 0, Skipped: 0
```

### 5.2 `kustomize build` — deterministic render

```
kustomize build .
```
**Expected output** (kustomize serializes via alphabetically-sorted map keys with no transformers applied — this is a direct, no-patch concatenation of the two authored files above, so the rendering is fully determined by what this package contains):
```
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: trading
spec:
  podSelector: {}
  policyTypes:
  - Ingress
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-orders-api-ingress
  namespace: trading
spec:
  ingress:
  - ports:
    - port: 80
      protocol: TCP
  podSelector:
    matchLabels:
      app: orders-api
  policyTypes:
  - Ingress
```

### 5.3 `conftest`/OPA — policy compliance

**Policy file: `policy/netpol.rego`** (authored for this package; enforces that every NetworkPolicy object it evaluates declares `Ingress` in `policyTypes` — the one structural invariant this change must hold, per §3.1):
```rego
package main

deny[msg] {
  input.kind == "NetworkPolicy"
  not contains_ingress(input.spec.policyTypes)
  msg := sprintf("NetworkPolicy %s must include policyTypes: Ingress", [input.metadata.name])
}

contains_ingress(types) {
  types[_] == "Ingress"
}
```

```
conftest test --policy policy/ netpol/default-deny-ingress.yaml netpol/allow-orders-api-ingress.yaml
```
**Expected output** (1 `deny` rule evaluated once per input document = 2 tests; both manifests declare `policyTypes: [Ingress]` so both pass):
```
2 tests, 2 passed, 0 warnings, 0 failures, 0 exceptions, 0 skipped
```

All three checks are satisfiable at the point this package invokes them: the scope is exactly these two files (no leftover/out-of-scope object can contaminate the conftest match), and there is no staged multi-step ordering within validation itself — both objects are validated together, matching the atomic-apply recommendation in §6.

---

## 6. Rollback Plan

- **Mechanism**: `git revert` of the single commit that introduces `kustomization.yaml`, `netpol/default-deny-ingress.yaml`, and `netpol/allow-orders-api-ingress.yaml`.
- **Reconciler-prune consequence (stated explicitly per program contract)**: once the revert commit is merged and the GitOps reconciler (Argo CD / Flux) syncs it, the reconciler will **prune both NetworkPolicy objects from the live cluster** (assuming prune-on-sync is enabled for this Kustomization/Application, which is the reconciler's standing configuration, not something this package sets). The `trading` namespace **reverts to its harvested pre-change state: zero NetworkPolicy objects, fully open ingress** — identical to the state recorded in §2. This is a full reversal, not a partial one: there is no intermediate state between "both policies active" and "namespace fully open" in this design, since both objects ship in one commit.
- No object-level rollback ordering is required beyond the single revert — both objects were added together and are removed together.

---

## 7. Recommended Change Ordering + Maintenance Window

1. **Ship both manifests in the same commit / same Kustomization sync wave** (as authored above) — this is the primary ordering control. If `default-deny-ingress` reconciles even briefly before `allow-orders-api-ingress`, the two currently-Running orders-api pods lose all ingress for that gap. A single atomic commit/apply removes this risk at the reconciler level; do not split these into two commits or two Kustomizations.
2. If the reconciler cannot guarantee atomic multi-object application (tool-specific; verify with the GitOps operator before merge), sequence `allow-orders-api-ingress` to sync **strictly before** `default-deny-ingress` as a fallback — never the reverse.
3. **Maintenance window**: this is the first NetworkPolicy introduced into a previously fully-open namespace. Recommend merging during a monitored, low-traffic window with the on-call/orders-api owner available, even though the design (§3) targets zero traffic impact — so that an unexpected label mismatch (§3.3) or an unharvested caller dependency is caught immediately rather than silently.
4. No maintenance window is required for rollback (§6) — a git revert + reconciler prune is symmetric and equally safe to run at any time.

---

*Apply is a separate, reconciler-/human-gated step: this package is an approved-but-unapplied declarative change for a GitOps reconciler (or a human running `kubectl apply` under change control) to converge — nothing in this pipeline applies it.*

Confidence: 84 — Manifests, validation facts, and rollback are fully deterministic and traceable to the harvested evidence carried from §6; two explicit assumptions remain unverifiable in this pipeline: (1) the reconciler's prune-on-sync and same-wave-atomicity behavior is asserted as the reconciler's standing configuration, not confirmed against a live reconciler config (no cluster/reconciler read available to this role); (2) conftest's default summary-line format is quoted from known CLI behavior, not from a harvested tool run, since no prior conftest execution exists in this pipeline to capture literally.