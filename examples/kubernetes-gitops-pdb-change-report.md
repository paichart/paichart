# Kubernetes / GitOps — Change Report (PodDisruptionBudget)
## The gap the first package found, refused once for the right reason, then closed with a different answer

> **Source:** pAIchart **kubernetes-gitops** pipeline runs (`protocol: kubernetes-gitops` 1.3.0), 2026-09-11.
> **POV:** Autonomous Delivery Use Cases · phase *Kubernetes GitOps Rollout* · rounds **R1 → R2 → R2b**
> **This report's pipeline task:** `cmtwhdi4d006qyx1rnnxkblay` (R2b) · `qualityGate: approved` · reviewer **90** · pipeline confidence 92
> **The round it revises:** `cmtwh44dv002xyx1rdi2cygju` (R2) · reviewer **NEEDS-REVISION 88** — quoted in full in [Addendum B](#addendum-b--the-refusal-it-revises-verbatim)
> **Environment:** harvested **live, read-only** from a Kubernetes cluster (a disposable `kind` cluster standing in for production) through a customer-governed read-only MCP service — verb-enum allowlist **and** RBAC; four narrow reads, zero denials, zero truncation.
> **Outcome:** Harvester 97 → Architect → Author 90 → Reviewer **APPROVED / blocking: none**.
> **Status:** **NOT applied.** The output is a kustomize overlay to be merged; apply is an Argo/Flux reconcile or `kubectl apply`, out of band and human-gated. pAIchart never actuates.
>
> 📎 **The harvested current state — the Deployment's verbatim selector, the (absent) PDBs, LimitRanges and ResourceQuotas this package was designed against — is in [Addendum A](#addendum-a--current-state-as-harvested-live-read-only).**

---

## Why this example is different from the other five

The [first Kubernetes example](./kubernetes-gitops-change-report.md) in this directory ends in a NEEDS-REVISION. This one ends in an approval — but the interesting part is the **sequence of three runs** it sits at the end of, because each run's output shaped the next:

1. **R1** (HPA + resource requests/limits on `orders-api`, APPROVED 85) closed its package with a *known gaps* list, and one line in it read: *"No PodDisruptionBudget exists for `orders-api`; flagged as a standing availability gap."* That sentence became the next objective. Nobody wrote a ticket.
2. **R2** (add a PDB with `minAvailable: 1`) was **refused** — NEEDS-REVISION 88 — and the refusal is the kind you want. The objective had required a rationale for `minAvailable: 1` over `maxUnavailable: 1` or a percentage, *and* an account of what happens if R1's HPA (approved but not applied) later scales the Deployment from 2 to 5 replicas. The Author set `minAvailable: 1` and never compared the alternatives. The reviewer did the arithmetic the package didn't: at 2 replicas the two forms are equivalent, **but at 5 replicas an absolute `minAvailable: 1` permits four simultaneous voluntary evictions** — a materially weaker guarantee than `maxUnavailable: 1`. Everything else in that package passed (selector byte-identical to the harvest, constraint evidence restated, rollback, no mutation). One real availability-design gap, caught from the package alone. Verbatim in Addendum B.
3. **R2b** (this report) re-ran the objective with the rationale made mandatory — and with the prescribed `minAvailable: 1` **removed**, so the Author had to reason to the field rather than defend a given one. It built the four-cell table (both absolute forms, both percentage forms, at 2 and at 5 replicas, with Kubernetes' ceiling/floor rounding rules), chose **`maxUnavailable: 1`** — the only scale-invariant form — and named the one case that breaks it (replicas dropping to 1). The reviewer **recomputed every cell independently** before approving:

> All four cells check out against Kubernetes' actual PDB semantics (ceiling for `minAvailable%`, floor for `maxUnavailable%`; `maxUnavailable` absolute is scale-invariant, `minAvailable` absolute is not). This is a genuine, independently-verified three-way comparison — not a reworded restatement of the prior round.

The first example in this directory showed a reviewer refusing to approve what it couldn't verify. This one shows the other half: a refusal that **changed the answer**, and a revision that was approved because it was *different*, not because it was louder.

---

## What the pipeline did, autonomously (R2b)

You hand pAIchart **one plain-English objective** plus a descriptor URL for a read-only cluster service. With no further input it:

1. **Self-provisioned** the read-only cluster service from the descriptor (fetched, registered, used, torn down at synthesis) — pAIchart stores no cluster credentials.
2. **Harvested**, in four narrow reads: the `orders-api` Deployment (2/2 ready; **selector `{app: orders-api}` quoted verbatim** — the harvester itself warned downstream not to use the broader pod-template label set that also carries `tier: backend`), the namespace's PodDisruptionBudgets (none), LimitRanges (none), ResourceQuotas (none). No secret was touched; none was in scope.
3. **Designed** the PDB against the harvested state *and* the approved-but-unapplied HPA ceiling, producing the availability-rationale table.
4. **Authored** the deliverable below: a two-file kustomize overlay, three **offline** validation facts as command + literal expected output (`kubeconform`, `kustomize build`, `conftest`/OPA with the Rego shipped alongside), a `git revert` rollback with the reconciler-prune consequence stated, ordering (single additive object — no dependency on R1 either way), the constraint evidence restated verbatim, and the Architect's rationale carried forward verbatim.
5. **Reviewed** it through an independent QA agent — every cell of the rationale recomputed, drift honestly graded *not performed* (no repo baseline was supplied — the package refuses to claim "no drift" from a one-sided read), **APPROVED / blocking: none / 90**.

**Read-only by construction; nothing leaves the cluster it shouldn't.** The service refuses non-read verbs at its allowlist, and the ServiceAccount behind it cannot write, exec, or `get` secrets even if the service had a bug (a `delete --dry-run=server` and a `get secret` were both proven FORBIDDEN before the run). This run needed no secret metadata and asked for none.

---

## THE DELIVERABLE

*Verbatim — the harness root's `report.md`, the Author's change package as the reviewer approved it. Nothing below this line was edited.*

---

# GitOps Change Package: orders-api PodDisruptionBudget — R2b (trading namespace)

## 1. Declarative Artifact

Additive-only change: one new `policy/v1` PodDisruptionBudget object, delivered as a kustomize overlay. No existing object is modified.

**`manifests/trading/orders-api-pdb/kustomization.yaml`**
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: trading
resources:
  - pdb.yaml
```

**`manifests/trading/orders-api-pdb/pdb.yaml`**
```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: orders-api-pdb
  namespace: trading
spec:
  maxUnavailable: 1
  selector:
    matchLabels:
      app: orders-api
```

Selector (`{"app": "orders-api"}`) and value (`maxUnavailable: 1`) are transcribed verbatim from the Architect's design — no other label keys added, no `minAvailable` field set (mutually exclusive, correctly omitted).

## 2. Validation Facts (deterministic, offline — no cluster contact)

### 2a. Schema validity — kubeconform

```
kubeconform -strict -summary -output json manifests/trading/orders-api-pdb/pdb.yaml
```
**Expected output:**
```json
{"resources":[{"filename":"manifests/trading/orders-api-pdb/pdb.yaml","kind":"PodDisruptionBudget","name":"orders-api-pdb","version":"policy/v1","status":"valid"}],"summary":{"valid":1,"invalid":0,"errors":0,"skipped":0}}
```
`PodDisruptionBudget` is a core/built-in `policy/v1` type, present in kubeconform's bundled OpenAPI schema set — no CRD schema fetch required, so this is fully offline and deterministic against the manifest above.

### 2b. Render correctness — kustomize build

```
kustomize build manifests/trading/orders-api-pdb/
```
**Expected output:**
```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: orders-api-pdb
  namespace: trading
spec:
  maxUnavailable: 1
  selector:
    matchLabels:
      app: orders-api
```
The overlay applies no patches, generators, or name/label transformers — `namespace: trading` in the kustomization matches the resource's own `metadata.namespace`, so the base loader passes the resource through unchanged. The rendered output is therefore identical, byte-for-byte, to `pdb.yaml` above.

### 2c. Policy compliance — conftest / OPA

**`policy/pdb-selector.rego`** (mandated by this package, ships alongside the manifest):
```rego
package main

deny_missing_selector[msg] {
  input.kind == "PodDisruptionBudget"
  not input.spec.selector.matchLabels
  msg := "PodDisruptionBudget must set spec.selector.matchLabels"
}

deny_missing_budget_field[msg] {
  input.kind == "PodDisruptionBudget"
  not input.spec.maxUnavailable
  not input.spec.minAvailable
  msg := "PodDisruptionBudget must set exactly one of maxUnavailable/minAvailable"
}

deny_both_budget_fields[msg] {
  input.kind == "PodDisruptionBudget"
  input.spec.maxUnavailable
  input.spec.minAvailable
  msg := "PodDisruptionBudget must not set both maxUnavailable and minAvailable"
}
```

```
conftest test --policy policy/ manifests/trading/orders-api-pdb/pdb.yaml
```
**Expected output:**
```
3 tests, 3 passed, 0 warnings, 0 failures, 0 exceptions
```
All three deny rules evaluate false against `pdb.yaml` (selector is set, exactly one of `maxUnavailable`/`minAvailable` is set), so conftest reports all rules as passed with zero denials.

## 3. Rollback Plan

- **Mechanism**: git revert of the commit that adds `manifests/trading/orders-api-pdb/`. This is additive-only — there is no prior `orders-api-pdb` (or any other PDB) revision in the `trading` namespace to restore; rollback removes the object entirely rather than reverting to a prior version.
- **Effect of revert**: the GitOps reconciler (Argo CD / Flux) prunes the `orders-api-pdb` object on next sync after the revert lands — reverting to the harvested pre-change state (no PDB present).
- **No coordinated rollback needed elsewhere**: this change touches no other object; reverting it has no dependency on the R1 HPA or any other in-flight change.

## 4. Recommended Change Ordering

- **Single-object, additive, no ordering prerequisites.** This PDB does not depend on the R1 HPA being applied first, in parallel, or at all — the Architect's Availability Rationale (below) confirms `maxUnavailable: 1` holds the "≥1 available, ≤1 disrupted at a time" guarantee at both the harvested 2-replica state and the HPA's 5-replica ceiling, independent of which is live at apply time.
- **Maintenance window**: none required — creating a PDB is non-disruptive by itself (it constrains future voluntary evictions; it does not evict anything on creation). Standard GitOps sync cadence is sufficient; no off-hours window needed.
- **Caveat for future changes (not this change)**: if `orders-api` replicas are ever scaled to 1 (below the harvested floor of 2), this PDB must be revisited before that scale-down, per the Architect's rationale §3 below — flagged here for the Reviewer's awareness, not actioned in this package.

## 5. Namespace Constraint Evidence (restated verbatim from harvest/design, for independent Reviewer verification)

- **`LimitRange`**: none found in `trading` namespace.
- **`ResourceQuota`**: none found in `trading` namespace.
- **`PodDisruptionBudget`** (any kind): none found in `trading` namespace — `orders-api-pdb` is the **first** disruption-budget object in this namespace.
- **Conclusion carried forward**: there is no existing constraint envelope for this new object to reconcile against, and no existing PDB it could double-cover or conflict with.
- **Drift check**: no config-repo desired-state baseline was supplied in the task body or §6 for this object. Per protocol, drift is graded **not performed** for this change — this is not a claim of "no drift detected."

## 6. Availability Rationale (carried forward verbatim from the Architect's design)

### 1. Disruption-tolerance semantics and arithmetic, at 2 and 5 replicas

Kubernetes' PDB rounding rule (per the disruption controller): when a percentage is used, **`minAvailable`% rounds up (ceiling)**; **`maxUnavailable`% rounds down (floor)**. `allowedDisruptions` (the number of pods the eviction API will let a voluntary disruption take at once) is then:
- for `minAvailable` (absolute or %): `allowedDisruptions = currentHealthy − minAvailable`
- for `maxUnavailable` (absolute or %): `allowedDisruptions = maxUnavailable` directly (capped so `currentHealthy − allowedDisruptions ≥ desiredHealthy`)

| Form | @ 2 replicas (harvested) | @ 5 replicas (R1 HPA ceiling, if later applied) | Guarantee holds at both? |
|---|---|---|---|
| `minAvailable: 1` (absolute) | allowed disruptions = 2−1 = **1**; min available = 1 | allowed disruptions = 5−1 = **4**; min available = 1 | ❌ — fixed absolute value doesn't scale: at 5 replicas it permits **4 simultaneous voluntary evictions**, violating "at most one at a time" |
| `maxUnavailable: 1` (absolute) | allowed disruptions = **1**; min available = 2−1 = 1 | allowed disruptions = **1**; min available = 5−1 = 4 | ✅ — absolute cap on unavailable pods is scale-invariant: exactly 1 disruption allowed, and available count never reaches 0, at either replica count |
| `minAvailable: 50%` | ceil(0.5×2) = 1 → allowed disruptions = 2−1 = 1 | ceil(0.5×5) = 3 → allowed disruptions = 5−3 = **2** | ❌ — at 5 replicas permits 2 simultaneous disruptions |
| `maxUnavailable: 50%` | floor(0.5×2) = 1 → allowed disruptions = 1 | floor(0.5×5) = 2 → allowed disruptions = **2** | ❌ — same failure as above; percentage forms scale allowed disruptions proportionally with replica count, which is exactly what breaks the "at most one" bound once replicas > 2 |

### 2. Chosen form and value: `spec.maxUnavailable: 1`

- **`minAvailable: 1` rejected** — identical to `maxUnavailable: 1` at today's 2 replicas, but as an absolute floor it does not tighten as replica count grows; at 5 replicas it silently permits 4 concurrent disruptions. This is precisely the gap R2 left open (no comparison against the R1 HPA ceiling).
- **Both percentage forms rejected** — Kubernetes' own rounding rule (ceiling for `minAvailable`%, floor for `maxUnavailable`%) makes the allowed-disruption count grow with replica count. That is proportional, not the fixed "at most one pod at a time" this Deployment needs; at 5 replicas both percentage variants allow 2 simultaneous evictions.
- **`maxUnavailable: 1` (absolute) selected** — it is the only form whose semantics are defined directly in terms of "how many pods may be unavailable right now," independent of total replica count. It yields `allowedDisruptions = 1` and `minAvailable(effective) ≥ 1` at both 2 and 5 replicas, so the guarantee (never zero available; at most one voluntarily disrupted at a time) holds today **and** does not silently weaken if the R1 HPA is later applied — no coordinated PDB edit is required alongside an HPA-driven scale event within the 2–5 replica range.

### 3. What an operator must revisit if replica count changes

- **If `spec.replicas` drops to 1** (below the HPA's stated floor of 2, e.g. a manual scale-down or a future HPA `minReplicas` change): `maxUnavailable: 1` would allow `currentHealthy(1) − allowedDisruptions(1) = 0` available pods — the "never zero available" guarantee **breaks** at that point. This PDB must be revisited (e.g., temporarily disabled, or the Deployment must not be scaled below 2 while this PDB is in force) before any voluntary disruption is permitted at replica=1.
- **If the HPA ceiling changes above 5**, `maxUnavailable: 1` still holds the guarantee unmodified (it is scale-invariant above the floor) — no PDB change is required purely for a higher ceiling.
- **If a business requirement later calls for tolerating more than one concurrent voluntary disruption** (e.g., faster node-drain during large clusters), the value must be deliberately re-evaluated and increased — it will not adapt on its own, by design.

Confidence: 90 — Manifest and validation facts are deterministically derivable from the authored files (no cluster contact, no invented state); constraint evidence and Availability Rationale are carried forward verbatim from the Architect's design as required. One residual dependency: kubeconform's exact JSON field ordering/format is quoted from its documented summary-output contract rather than a live tool run, since no cluster/tool execution is available in this design-only leg.


---

## Addendum A — Current state, as harvested (live, read-only)

The pre-change ground truth the package above was designed against, reproduced from the Phase 0 Harvester's deliverable (R2b, four scoped reads, confidence 97). The package's §5 constraint evidence and the PDB's selector should match this line for line. Nothing here was written by a model from memory: every value is a tool result from the cluster, and the harvester's own "for downstream (verbatim-quotable)" block at the end is what the Architect and Author were bound to copy.

### State Summary

**Scope:** Read-only harvest of current cluster state for the `orders-api` PodDisruptionBudget provisioning objective in the `trading` namespace, k8s-lab rig. Self-provisioned `k8s-rig-readonly` service from the descriptor at the given URL (fetched via `browser-automation-service scrape_page`, parsed, then `registry.register` — landed `status: ACTIVE` immediately, auto-approving `automation` category, callable without further action). 4 narrow, scoped read-only calls issued; **no read failures, no partial harvest, no truncation.**

#### 1. orders-api Deployment (trading namespace)

| Field | Value |
|---|---|
| `replicas` (spec) | `2` |
| `readyReplicas` / `availableReplicas` (status) | `2` / `2` |
| Pod selector (`spec.selector.matchLabels`) — **VERBATIM** | `{"app": "orders-api"}` |
| Pod template labels (`spec.template.metadata.labels`) — **VERBATIM** | `{"app": "orders-api", "tier": "backend"}` |
| Container image | `nginx:1.27-alpine` |
| Rollout strategy | `RollingUpdate` (`maxUnavailable: 25%`, `maxSurge: 25%`) |
| `resourceVersion` / `generation` | `547` / `1` |
| Available condition | `True` — "Deployment has minimum availability." |

> **Selector to quote downstream:** the PDB's `spec.selector.matchLabels` must be `{"app": "orders-api"}` (the Deployment's own selector) to correctly target these pods — not the broader template label set which also carries `tier: backend`.

#### 2. Existing PodDisruptionBudgets (trading namespace)

| resourceType | namespace | items found |
|---|---|---|
| `poddisruptionbudgets` | `trading` | `[]` — **confirmed: none exist** |

Matches the objective's expectation ("expect none, per objective — confirm this"): **confirmed empty, no PDB currently selects these pods.**

#### 3. Namespace constraints (trading namespace)

| resourceType | namespace | items found |
|---|---|---|
| `limitranges` | `trading` | `[]` — none found |
| `resourcequotas` | `trading` | `[]` — none found |
| `poddisruptionbudgets` (other, non orders-api) | `trading` | `[]` — none found (same list as §2, confirmed no other PDBs exist in namespace either) |

**No LimitRange, ResourceQuota, or other PodDisruptionBudget constraints exist in the `trading` namespace.** The Architect designs the new PDB against an unconstrained namespace — no min/max resource envelopes or competing disruption budgets to reconcile against.

#### Gaps / notes
- Secret metadata was not harvested — task description marks this "not expected here" and no secret-bearing objects are in scope for a PDB change; none requested.
- No drift baseline (config-repo desired state) was supplied in the task body — per protocol this harvester does not attempt a repo comparison; downstream Architect/Reviewer must grade drift-check as **not performed** unless a baseline is separately supplied.
- All 4 reads succeeded on first attempt; zero `isError` responses, zero denials encountered (none of the calls touched an out-of-policy verb).

#### For downstream (verbatim-quotable)
- **PDB target selector:** `matchLabels: {app: orders-api}`
- **Current replica count:** `2`
- **Constraint findings:** trading namespace has **no** LimitRange, **no** ResourceQuota, and **no** existing PodDisruptionBudget of any kind — the new PDB is the first disruption-budget object in this namespace.

Confidence: 97 — Fully verified from live read-only tool outputs across all 4 required checks (Deployment, existing PDB, LimitRange, ResourceQuota); no assumptions, no partial failures, no truncation encountered.


---

## Addendum B — The refusal it revises, verbatim

R2's reviewer verdict (pipeline task `cmtwh44dv002xyx1rdi2cygju`, 2026-09-11 04:52Z), unedited. The package it refused set `spec.minAvailable: 1`; the only mention of `maxUnavailable` anywhere in that package was inside its own OPA rule text. Read the blocking issue against the R2b rationale table above — the revision adopted the reviewer's arithmetic and then went one step further than the reviewer asked, by changing the field.

### Review: GitOps Change Package — `orders-api-pdb` (PodDisruptionBudget, namespace `trading`)

I reviewed the Phase 2 Manifest Rollback Author's package (§6) against the five review dimensions in my task description. Summary: the package is well-constructed on manifest correctness, constraint-fit, validation-fact format, and rollback — but it does not address one item the task explicitly requires me to verify: the **availability-strategy rationale** (minAvailable 1 vs maxUnavailable 1 vs a percentage form).

#### Blocking issue

1. **Availability rationale not addressed.** The task requires verifying that the package addresses *why* `minAvailable: 1` was chosen over `maxUnavailable: 1` or a percentage-based value (e.g. `50%`), especially given the R1 HPA plan (approved but not applied) that would scale `orders-api` from 2 → 5 replicas. The package sets `spec.minAvailable: 1` (Section 1) but nowhere compares it against the alternatives or discusses the consequence of an absolute `minAvailable` count under a future replica-count change. This matters concretely: at today's 2/2 replicas, `minAvailable: 1` and `maxUnavailable: 1` are operationally equivalent (both tolerate exactly 1 voluntary disruption); but if R1's HPA is later applied and replicas scale to 5, `minAvailable: 1` would then permit **4** simultaneous voluntary evictions — a materially different availability guarantee than `maxUnavailable: 1` (which would still cap disruption at 1 regardless of replica count) or a percentage form (which scales proportionally). The package's own R1/HPA note (Section 2, Section 5.1) correctly flags that HPA is "orthogonal" and "not applied," but stops short of stating the design trade-off this creates for the chosen field — it notes the fact without addressing the rationale the task asks for. This is a gap in approval-readiness documentation, not a manifest defect: a reviewer/approver reading this package cannot see why the absolute-count field was chosen with a pending scale-up in the same namespace.

No other blocking issues identified.

#### Assessment table

| Area | Status | Finding |
|---|---|---|
| Policy compliance (conftest/OPA) | PASS | `pdb.rego`'s two `deny` rules correctly gate on `minAvailable`/`maxUnavailable` presence and `selector.matchLabels` presence; both are satisfied by the manifest. Expected output (`2 tests, 2 passed, 0 failures...`) is a literal, deterministic fact, not prose. |
| Validation-step format | PASS | All three checks (kubeconform, kustomize build, conftest) use the required shape: fenced command block immediately followed by a fenced literal-expected-output block. No table used, no "looks correct" prose. `kubectl diff` is correctly absent (would require write auth / cluster contact). |
| Selector-fit | PASS | PDB `spec.selector.matchLabels: {app: orders-api}` is stated as byte-for-byte identical to the harvested Deployment `spec.selector.matchLabels`. Package transparently flags a residual, non-blocking risk (cross-workload label uniqueness across `tier` not independently verified) — an honest caveat, not a defect. |
| Constraint-fit | PASS | LimitRange, ResourceQuota, and existing PDB in `trading` all harvested as "None found" — restated verbatim in Section 2, correctly interpreted as "no conflict possible" for an additive object. |
| **Availability rationale (minAvailable vs maxUnavailable vs %)** | **FAIL — blocking** | Not addressed in the package; see blocking issue above. |
| R1 HPA interaction note | PARTIAL / addressed-at-fact-level | HPA state (none applied, static 2/2, R1 orthogonal/out of scope) is stated, satisfying the factual half of the requirement, but is not connected to the availability-rationale discussion that the task also requires. |
| Blast-radius | PASS | Single, additive, standalone object; no existing PDB to replace; no ordering dependency on other changes; affects exactly 2 named, harvested pods. |
| Rollback adequacy | PASS | Git-native (`git revert` of the introducing commit, or delete-from-repo as an equivalent path); no direct `kubectl delete`; consistent with reconciler prune semantics. |
| No-mutation / apply-is-out-of-band | PASS | Package explicitly states no `kubectl patch/apply/scale` appears anywhere, and that apply is a separate, human/reconciler-gated step (Section 1, Section 5.2–5.3). |
| Machine-parsed blocks | N/A | Harvested Allocations/Derived Values/Consumed Values all show ✗ in §6, but this change derives no CIDR/ASN/aggregate value requiring those blocks (selector copy is a direct restatement, not a derivation) — correctly absent, not a defect. |
| Dialect lint | ACCEPTED-FROM-CLAIMS | No `## Program Interface Contract` block was present in my context to check tokens against mechanically; manifest syntax (`policy/v1` PDB, `matchLabels`) is standard native Kubernetes API and kustomize syntax on its face, but I cannot certify this against a contract I don't have. |

#### Maintenance-window readiness

Package states no maintenance window is required — additive PDB against an already-healthy 2/2 Deployment has no disruptive side effect and only constrains future voluntary evictions. That reasoning is sound and I do not dispute it; it is orthogonal to the blocking issue above (which concerns the design of the field's *value*, not the safety of *adding* it).

### VERDICT: NEEDS-REVISION
Blocking issues: Availability rationale not addressed — the package sets `spec.minAvailable: 1` without comparing it to `maxUnavailable: 1` or a percentage-based alternative, despite the task's explicit requirement to verify this rationale is addressed; this is material given the R1 HPA plan (2→5 replicas, approved but not applied) which would change the effective disruption-tolerance semantics of an absolute `minAvailable` count. Author should add an explicit comparison/justification (or confirm the 2-replica-today equivalence and state the field should be revisited if/when R1 HPA is applied) to the package before re-submission.
Confidence: 88
