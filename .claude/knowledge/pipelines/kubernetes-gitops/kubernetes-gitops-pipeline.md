# Kubernetes / GitOps Provisioning — Pipeline Use-Case Design

> **RFC** per [`../README.md`](../README.md) conventions. Design proposal, not a lab report.

| Field | Value |
|-------|-------|
| **Status** | 🟡 DRAFT — Phases 1–3 designed + **Phase 5 reviewed (2026-06-27): 5-specialist GO-with-fixes, 86% mean**, all corrections folded; **C3 resolved (WS3 lens — verb-enum is the customer's half).** **Next: Phase 6 build (owner: pipeline-harness-specialist) — see `IMPLEMENTATION-PLAN.md` (WP-A..E, anchor-keyed).** Review: `cline_docs/reviews/kubernetes-gitops-design-2026-06-27/REVIEW.md`. |
| **Owner** | pipeline-harness-specialist (coordinates) |
| **Pattern** | the cognition/actuation seam (read-only harvest → declarative design → approved-but-unapplied change → GitOps reconciler converges it). See [`../PIPELINE-DOMAIN-FIT-CATALOG.md`](../PIPELINE-DOMAIN-FIT-CATALOG.md) §K8s. |
| **Reference impl** | mirrors the shipped `network-provisioning` (device-reaching) shape. |

---

## Objective (Phase 1 — the seam)

Kubernetes config change is a **strong harness fit** (arguably cleaner than network provisioning).

- **Cognition (→ harness):** read-only harvest of cluster state → design a desired state against an
  objective (add an HPA + limits, right-size requests from observed usage, roll an ingress,
  reconcile drift) → author it as **declarative artifacts** (manifest / kustomize overlay /
  Helm-values diff) with **validation facts** and a **rollback**. Idempotent.
- **Actuation (→ OUT of loop):** `kubectl apply` / `helm upgrade` / **Argo CD or Flux reconcile** —
  a native convergent executor with rollback (revision history / git revert).
- **Terminus:** an approved-but-unapplied, **GitOps-ready change** committed to / PR'd against the
  cluster's config repo; the reconciler converges it. **The harness never calls a write verb.**

---

## Design (Phase 2 — decomposition)

### Persona set (mirror the shipped 4-stage shape)

| # | Template (persona) | Role/type | Tool surface | Produces | Depends-on |
|---|--------------------|-----------|--------------|----------|------------|
| 0 | **Cluster State Harvester** | ORCHESTRATOR | read-only k8s service ONLY (verb-enum: `get`/`list`/`describe`, `helm get values`, `argo app get`) | structured cluster-state snapshot for the target scope: current manifests/values, workload inventory, quota/LimitRange/PDB/policy baseline, **secret *metadata* (names/keys) not values**, observed-usage metrics if a metrics tool is present | — (entry; **conditional** — drops out if the caller supplies current state, like artifact-synthesis Phase 0) |
| 1 | **Workload Architect** | ARCHITECT | none (pure reasoning over the snapshot) | the desired-state design: which resources change/add, rationale, constraints honored (quotas, PDBs, OPA/Kyverno policy), rollout strategy + blast radius | Harvester |
| 2 | **Manifest & Rollback Author** | DOCUMENTER | none (authoring); *optionally* a **local-only** validation tool (`kubeconform` / client-side `kubectl diff`) | **the deliverable** — declarative artifacts (manifest/kustomize/Helm-values diff) + validation facts + rollback (prior revision / git revert). `metadata.deliverableSourceTaskId` → `report.md` | Architect |
| 3 | **Change Reviewer** | REVIEWER | none | QA verdict: meets objective? policy-compliant? rollback sound? drift/blast-radius risks? score vs threshold. `suppressDefaultReportMd` → `result.json` only — the **gate**, not the deliverable | Author |

### DAG

`Harvester → Architect → Author → Reviewer` (linear, like network-provisioning). The Harvester
(Phase 0) is the only **conditional** node.

### Producer / QA-gate split (Editor/Reviewer pattern)

- **Producer** = the Author (stage 2) — harness sets `metadata.deliverableSourceTaskId`; its change
  package becomes the customer-facing `report.md`.
- **Gate** = the Reviewer (stage 3) — `suppressDefaultReportMd`; produces `result.json` only; its
  review is the gate (returns needs-revision below threshold, as network-provisioning's did).
- Keep producer and gate **separate**.

### Tool / credential surface (the k8s-specific sharp edges — most of the real work)

1. **Only the Harvester reaches the cluster. Read-only, verb-enum, NOT free-text.** `wrapWithSchema`
   validates the envelope only — the inner args reach the service unvalidated, so the service needs
   its own structured **Zod verb-enum** (`get`/`list`/`describe`/`getValues`/`appGet`), not a
   free-text `kubectl …` string (bypassable via `;`, newline, `--`).
2. **"Read-only" in k8s ≠ the read-ish verbs.** The verb-enum MUST exclude actuation-bearing
   subresources that *look* read-adjacent: **`pods/exec`, `attach`, `port-forward`, `proxy`, `cp`,
   `eviction`, `scale`** (exec = arbitrary in-pod command = full actuation; port-forward/proxy =
   network pivot). Allowlist resource GETs/LISTs/DESCRIBE only.
3. **Don't harvest Secret *values*.** The Architect needs secret *existence* (names/keys), almost
   never plaintext. Harvesting `get secrets -o yaml` pulls base64 plaintext into context. Default:
   metadata only — this shrinks the R10 surface to near-zero by construction. (If a use case truly
   needs a value, that's an explicit, reviewed carve-out.)
4. **Confinement caveat (hard-won, playbook Phase 2.4):** tool access is **user-scoped, not
   template-scoped**; an empty `mcpTools` list silently grants all six consolidated tools. To truly
   confine the cluster service to the Harvester, every *other* sibling needs an explicit `mcpTools`
   omitting it + a CI invariant — OR accept the cooperative model (as network-provisioning did). Decide in Phase 3.
5. **Deliverable shape: declarative > imperative.** Emit desired-state manifests for GitOps
   (commit/PR), never imperative `kubectl patch`/`scale` commands — the latter drifts from the seam.
6. **R9/R10 inherited** (platform guards, validated): R9 sanitizes harvested output (resource
   names/annotations/log lines are attacker-influenceable); R10 needs **k8s secret families**
   (base64 `Secret` values, `token:`/`password:` in YAML, kubeconfig creds) + the prose colon-FP
   fix — a Phase-3 item, only relevant if (3) ever permits value harvest.
7. **Harvest scoping** — a cluster ≫ a 2-device lab; the Harvester must scope by
   namespace/label/resource-type to stay in token budget.

---

## Required Work (Phase 3 — designed 2026-06-27)

Numbered `R<n>`/`K<n>` (K = k8s-specific), flagged by risk. **⛔ = design-first — resolve before any
code.** Reuses the proven network-provisioning R-set (R1/R2/R8/R9/R10) where it maps.

> **Reviewed 2026-06-27 — 5-specialist Protocol 2 panel, GO-with-fixes (86% mean).** All corrections
> below are folded; full per-specialist findings + recommendation-coverage table:
> `cline_docs/reviews/kubernetes-gitops-design-2026-06-27/REVIEW.md`.

### Security floor — ⛔ design-first

- **R1 ⛔ — Read-only service surface — a `(resource, verb, subresource)` ALLOWLIST, not a verb-set.**
  (Sharpened by the 2026-06-27 review — sec-ops C1 + validation-engine C1/C2.) A verb-set
  `{get,list,describe}` is necessary but NOT sufficient: actuation/leak primitives ride *through*
  allowed verbs. The control is a **closed `z.enum` of bare resource KINDS** (`pods`, `deployments`,
  `configmaps`, …) with **`secrets` absent** (→ a dedicated `listSecretNames` verb, names/keys only),
  **no `subresource` field at all** (subresources denied by default), and **no `--raw`/`rawPath`/`apiPath`**
  param (a raw API path is a universal bypass to `…/exec`, `…/secrets`). Explicitly forbidden, at the
  verb-enum AND the RBAC SA (R2): `pods/log` (GET that streams secrets), `pods/ephemeralcontainers`
  (`kubectl debug`), `exec`/`attach`/`port-forward`/`cp`, `nodes/proxy`+`services/proxy`+`pods/proxy`,
  `serviceaccounts/token`, CSR `approve`, RBAC `escalate`/`bind`, `impersonate`/`--as`, `eviction`,
  `scale`, `watch`. Args are a `.strict()` object, RFC1123-pattern-validated (`name`/`namespace`),
  selector length-capped, passed as the typed API client / argv-array — **never a shell string**.
  - **Reached via the `services` gateway, never a bespoke tool** — see the cross-ref in §R9 (R9 site A
    gates on `toolCall.name === 'services'`; a custom tool bypasses the injection guard *and* the
    consolidated-tool wrapper). Internal SSRF-exempt routing also skips the policy injection-regex, so
    **the service's own Zod `.parse()` is the SOLE runtime guard** — `wrapWithSchema` validates the
    envelope only (`dispatch-with-schema.js`); a "grade-A descriptor" (B3) is registry fidelity, not a
    runtime gate.
  - **C3 RESOLVED (Steve, 2026-06-27 — the WS3 lens): the verb-enum is the CUSTOMER's half; pAIchart
    does NOT own or CI-test it.** val C3 correctly observed "B5 can only test the verb-enum if pAIchart
    owns the service" — but the right conclusion is that **B5 is mis-assigned, not that pAIchart should
    own the service.** R1 (verb-enum) + R2 (RBAC) are the customer's half — the *same* split as
    network-provisioning's WS4 (the device service's R1/R2a/R8/R10 are self-certified, NOT pAIchart-tested;
    the spike accepted them unexercised). Owning+CI-testing a reference service to validate the customer's
    control is the **WS3-category mistake** (pAIchart taking responsibility for the customer's security).
    So: **(a)** pAIchart's CI tests pAIchart's OWN half (protocol validator, R9/R10 families, harness
    invariants — see B5); **(b)** the verb-enum + `(resource,verb,subresource)` allowlist + exclusions
    live in a published **k8s integration spec (the WS4 analog) + a self-certify checklist** — the
    customer's responsibility; **(c)** a throwaway **kind/minikube rig + an OPTIONAL reference/example
    read-only service** is the Phase-4 validation lab (exactly like the cEOS rig + Nornir MCP) and a
    copy-paste worked example — **not** owned production infra, **not** a CI gate on customer services.
    The verb-enum being the sole runtime guard raises the *stakes* (rigorous spec + checklist), not the
    *responsibility* — same as R10 redaction was load-bearing yet still the customer's.
- **R2 ⛔ — Cluster credential boundary (defense-in-depth: RBAC ∧ verb-enum).** The service
  authenticates with a **least-privilege read-only ServiceAccount** — RBAC bound to `get`/`list` on
  *only* the scoped resource types, **no `secrets` get** (see K1), **no `pods/exec`**, namespace-scoped
  where possible. No-fallback token; storage/injection path defined. **RBAC is the customer's
  enforcement half** (the WS3-drop lane lesson): even a verb-enum hole cannot exec/write if the SA
  lacks the verb. Stronger than network devices, which often lack granular authZ.
- **K1 ⛔ — Secret-value & log harvest policy, enforced at R1/R2 (not by prompt discipline).** Default
  **metadata-only**; `secrets` is out of the R1 enum, `pods/log` is an R1 structural deny (both above),
  RBAC denies Secret-value reads. The Architect needs *existence*, not plaintext. **But K1 does NOT make
  R10 moot** (review C2): plaintext still reaches context via *allowed non-Secret GETs* — ConfigMap
  `data`, inline `env[].value`, container `args` (`--password=`), `last-applied-configuration`
  annotation, and **`helm get values`** (Helm's password home). So K1 caps the *Secret-kind* surface;
  R10 (below) covers the rest. Any deliberate value/log harvest = an explicit, reviewed carve-out.

### Inherited platform — confirm/extend, don't rebuild

- **R9 — Untrusted-output sanitize.** Inherited; **flag-gated; ON in prod since 2026-06-29** (default-OFF in code only) — NOT a
  checkbox: a real dependency for this path. Only fires when the service is reached via the `services`
  gateway (see R1). Its C1 enable-gate (detector false-positives on `system:`/`act as`) is *worse* for
  k8s (`system:masters`/`system:serviceaccount`, colon-dense YAML) → route a k8s corpus into the C1
  regression before claiming coverage. k8s carriers: annotations, labels, ConfigMap data, event/log
  strings. **Edge (harness owner):** the verb-enum *rejection* path is R9-exempt (site A skips
  `success:false`), so a rejection that throws can echo attacker-influenceable resource names into the
  error → §6 unsanitized; prefer structured rejection over a thrown echo.
- **R10 — Artifact secret-redact: ON BY DEFAULT for k8s, not "near-moot."** (Review C2.) K1 caps the
  *Secret-kind* surface, but plaintext reaches context via *allowed non-Secret GETs* — ConfigMap `data`,
  `env[].value`, container `args`, `last-applied-configuration`, and `helm get values`. So enable R10
  with **k8s families** (base64 `Secret`, `token:`/`password:`/`apiKey:` in YAML, kubeconfig,
  SA/bearer/JWT, ConfigMap/env literals) + redact `helm get values` output + fix the **prose colon-FP**
  (YAML is colon-dense). R10 is the net for everything R1/R2 don't deny outright.

### Functional / deliverable design

- **K2 — Harvest-scoping contract, re-anchored to the 8 KB per-call cap** (review CRITICAL; confirmed
  by the harness owner). The binding constraint is NOT token budget / the 50 KB cap — it's the **8 KB
  Tier-1 per-tool-result cap** (`MAX_TOOL_RESULT_LENGTH`, `agentic-tool-loop.ts:298`): a broad
  `get -o yaml` is clipped to 8 KB *before the Harvester's LLM reasons over it*. So B2 must mandate
  **many narrow, projected/scoped reads** (`-o jsonpath`/`--field-selector`/per-resource), never broad
  dumps. The §6 chain itself is safe to 128 KB/512 KB (`context-chainer.ts:30-31`). **Code dependency
  (not B2):** surfacing the per-call `truncated`/`originalChars` facts to the Reviewer is a
  `render-pipeline-context.ts` change (owned by agent-execution) — today only the inline truncation
  *marker* in `finalResponse` makes partiality visible.
- **K3 — Deliverable + GitOps terminus.** Declarative artifacts only (manifest / kustomize overlay /
  Helm-values diff) — **never imperative `kubectl patch`/`scale`.** Lands as a PR to the config repo /
  an output artifact; the apply is **Argo/Flux reconcile or `kubectl apply`, outside the loop.**
  **Don't conflate two things (arch N1):** declarative-vs-imperative is a **GitOps-hygiene NORM**, not
  the security boundary. The **security boundary is R1∧R2** — an agent execution's entire MCP surface is
  the six consolidated tools (`agentExecutionEngine.ts:477`), none of which is `kubectl apply`; the only
  write path is `services.call` → the read-only service. So worst case of an imperative `kubectl patch`
  *string* is a less-GitOps-friendly **deliverable**, never a cluster mutation. The terminus is
  structurally non-actuating regardless of the LLM's output.
- **R-val — Deterministic validation (Protocol 10): facts, not verdicts.** The Author ships verifiable
  checks — but **`kubectl diff` is OUT** (review I1/I2): it's server-dry-run-backed (POSTs to the API,
  invokes admission webhooks, needs write/dry-run auth) — neither local nor read-only, and it would
  FAIL on a strictly read-only SA. In-loop facts are **purely offline**: `kubeconform` (schema) +
  `kustomize build` + `conftest`/OPA (policy). Server dry-run, if ever wanted, belongs with the
  out-of-loop apply step, not the harness.

### Build items (Phase 6)

- **B1 — Templates + role-guidance, REUSE-FIRST (CORRECTED by the review + harness owner).** Owned by
  pipeline-harness-specialist. The picks must trace to the role's *actual text*, not a "neutral" claim:
  - **Change Reviewer → neutralize `change_reviewer` IN PLACE** (it says "exact *show command*"
    `:470`, "*per-device*" `:468/471` — not zero-domain-specific). show command→validation fact,
    per-device→per-resource; keep the key (no rename/clone). **Gate: a network-provisioning dry-run.**
  - **Manifest & Rollback Author → neutralize `config_change_author` IN PLACE** (~70% neutral, not 90% —
    device/show ×6, `:459-462`). k8s manifests *are* config; the §6/facts/rollback discipline survives
    verbatim. Keep the key. **Gate: a network-provisioning dry-run.**
  - **Workload Architect → ADD one neutral key `infra_change_architect`**, generalized from
    the original network design role's §6 skeleton (keep the chain contract, drop VLAN/SVI).
    *(2026-07-01: network itself was later repointed onto `infra_change_architect` too — the `network_design_architect` key is retired.)* **Do NOT use `solution_architect`** — it's POV-interactive,
    has no §6 contract, and instructs the forbidden `task.context`/`agent.results` anti-pattern (`:174-175`).
  - **Cluster State Harvester → ADD one new key `infra_state_harvester`, modeled on `artifact_harvester`
    (`:375-388`), NOT `network_state_harvester`.** Owner correction: `network_state_harvester` **has no
    role-guidance key** (it falls through to the generic fallback; its discipline is protocol-only, and
    the seed's "4 new roles" comment is stale). `artifact_harvester` is the *only* harvester WITH a key
    and already carries the tool-using-harvester disciplines (iterative `services.call` not
    `workflow.execute`; escalate-don't-fabricate-on-empty; raw-not-paraphrase; §6-PRODUCING structure).
  - **Net: 2 in-place neutralizations (reviewer + author, dry-run-gated) + 2 net-new neutral keys
    (`infra_change_architect`, `infra_state_harvester`).** Not 0–1. Name both new keys explicitly in the
    seed (the 2026-06-16 omission lesson; `validate:role-guidance-coverage` is the backstop). k8s
    specifics ride in B2 + the auto-chained manifests (the syntax exemplar), not in cloned roles.
- **K4 — Confidence-gate calibration: security denials ≠ harvest failures** (harness-owner NEW; also a
  Phase-5 item). A denied `exec`/`secrets`/`pods/log` is a `success:false` tool call → trips #89
  anti-fabrication + `executionDegradation` → can tank the Harvester's confidence even though the
  *control worked*. B2/calibration must classify expected verb-enum denials as non-degrading.
- **K5 — Confinement: accept the cooperative model (decided)** (sec-ops N1 / arch N2). Tool access is
  user-scoped, not template-scoped (empty `mcpTools` → all-six grant; per-template confinement doesn't
  wire on `agent.assign`), so Architect/Author/Reviewer also hold the cluster service. **Acceptable here
  ONLY because R1∧R2 make the worst case an extra read, never a write/exec** — same call
  network-provisioning made. Tie this acceptance to **R10-on** (every stage's context can then pull
  ConfigMap/env plaintext). Don't over-build per-sibling `mcpTools`-omit + CI-invariant; it's not
  load-bearing when the service is read-only by construction. (The parked track-1 executor-allowlist gate
  is broader platform hardening, not a blocker.)
- **B2 — Protocol text** `PIPELINE_KUBERNETES_GITOPS_PROTOCOL` (read-only CRITICAL SAFETY INVARIANT,
  conditional Phase 0, decomposition, deliverable wiring, facts-not-verdicts, descriptor model) +
  protocol-matcher routing.
- **B3 — Descriptor (WS4-conformant)** for the read-only k8s service (register payload: name/endpoint/
  category + read-only `capabilities.tools` + the now-required top-level `description`, commit `4922c935`).
  **`capabilities.tools` is discovery/ergonomics metadata, NOT a security boundary** (boundary N / val I5):
  real read-only enforcement is the service-side Zod verb-enum (R1) + RBAC (R2) + user-scoped `mcpTools`.
  A "grade-A descriptor" (full typed `inputSchema` per tool) is **registry fidelity**, not a runtime gate —
  the service must still call its own `.parse()` at the top. Keep the two clearly separate.
- **B4 — Logging/audit** — `securityEvent: true` on verb-enum rejections **incl. impersonation- and
  raw-path-attempts** (not just `exec`); a harvest audit trail modelled on `stage_activities`.
- **B5 — Test coverage of pAIchart's OWN half** (NOT the customer's verb-enum — see C3). pAIchart's CI
  pins the **protocol validator + the R9/R10 k8s families + the harness invariants**. The **verb-enum
  pathological matrix** — reject `pods/log`, `--raw`, `pods/ephemeralcontainers`, `exec`/`attach`/`cp`,
  `nodes/proxy`+`services/proxy`+`pods/proxy`, `impersonate`/`--as`, `eviction`/`scale`/`watch`,
  `;`/newline injection, homoglyph — is the **reference service's self-test + the integration spec's
  self-certify checklist** (the customer runs it against *their* service), not a CI gate pAIchart owns. IF
  the optional reference service ships, pin its exclusion list as a §K invariant (mirror §I/§J) + an
  enum-parity guard (descriptor ↔ Zod) — as the reference's own tests.

**Critical path:** R1 + R2 + K1 (the ⛔ trio) gate everything — they define what "read-only" *means*
for k8s (a `(resource,verb,subresource)` allowlist, not a verb-set). **C3 resolved (WS3 lens): the
verb-enum is the customer's half** (spec + self-cert), so pAIchart's build is its OWN half — B2 (protocol)
+ B1 (roles) + R9-enable + R10-on + B5 (pAIchart's surface) — plus the published k8s integration spec
and an *optional* reference service / kind rig for Phase-4 (not owned infra). R9 is wired but dark (a
real dependency, not a checkbox). Then B1–B5 + R-val + K4 + K5.

## Validation Plan (Phase 5)

- ✅ **5-specialist review done** (2026-06-27, 86% GO-with-fixes) — `cline_docs/reviews/kubernetes-gitops-design-2026-06-27/`.
- **Network-provisioning dry-run** — the equivalence gate for the B1 in-place neutralizations
  (`change_reviewer`/`config_change_author`): confirm the live network pipeline still produces an
  equivalent change package *before* the edits ship (not a string-pinned test).
- **Confidence-gate calibration (K4)** — verify a security-denial (`exec`/`secrets` rejection) does
  NOT read as harvest degradation.
- **Phase-4 real-cluster validation** — a throwaway kind/minikube cluster + a read-only k8s service
  behind a tunnel (mirrors the cEOS rig); validates pAIchart's *cognition* against real k8s state.
- The **verb-enum tool-spike + pathological matrix** is the **reference service's / customer's**
  self-cert (C3), not a pAIchart CI step.

## Decision Log

- **2026-06-27** — Phase 1 GO (seam test): strong fit; GitOps reconciler is the native convergent terminus.
- **2026-06-27** — Phase 2 decomposition: 4-stage mirror of network-provisioning. Key calls:
  (a) verb-enum **excludes `exec`/`attach`/`port-forward`/`proxy`/`cp`** — "read-only" in k8s is not
  the naive read verbs; (b) **harvest secret metadata, not values** — shrinks R10 surface by
  construction; (c) deliverable is **declarative manifests for GitOps**, not imperative commands.
- **2026-06-27** — Phase 3 / role-reuse (Steve): **reuse roles, don't duplicate.** Drove the playbook
  Phase-2 anti-duplication rule.
- **2026-06-27** — Phase 5 review (5 specialists, 86% GO-with-fixes) CORRECTED the role plan: the
  "neutral" claims were untraced. `change_reviewer`/`config_change_author` carry real network-isms →
  **neutralize IN PLACE, gated by a network-provisioning DRY-RUN** (not string-pinned tests — a
  deliberate rewrite is a different string by design). `solution_architect` is the wrong base (no §6
  contract). `network_state_harvester` has **no role key** → `infra_state_harvester` is net-new, based
  on **`artifact_harvester`**. **Net: 2 in-place neutralizations + 2 net-new keys, not 0–1.** R1 is a
  `(resource,verb,subresource)` allowlist (not a verb-set); R10 ON for k8s (not near-moot); K2 anchors
  to the 8 KB per-call cap; `kubectl diff` dropped (server-dry-run); + K4 (security-denials ≠
  degradation). Owner of the build fold: pipeline-harness-specialist.
- **2026-06-27** — C3 RESOLVED via the WS3 lens (Steve): the verb-enum (R1) + RBAC (R2) are the
  **customer's half**, same split as network-provisioning's WS4 device service. "Ship+own+CI-test a
  reference service to validate the verb-enum" is the **WS3-category mistake** (pAIchart owning the
  customer's security control) → **dropped**. pAIchart tests its OWN half (B5); the verb-enum lives in a
  published k8s integration spec + self-cert checklist; a kind rig + optional reference service are a
  throwaway Phase-4 lab + worked example (like cEOS), not owned infra or a CI gate. The build shrinks.
- **2026-06-27** — Phase-6 BUILD-READINESS (3 executors: prompt-construction 88 / template-system 88 /
  agent-execution 80 = 85% GO). Corrections in `IMPLEMENTATION-PLAN.md`. Key refinements: **K4 is
  channel-dependent** — a denial returned as MCP `isError:true` is `success:true` by construction, so K4
  collapses to an E1 spec line (service returns `isError`, not a throw) + protocol prose + a verify-only
  test (no engine classifier unless denials throw). **The protocol stays NEW** (Steve): a protocol is a
  per-domain decomposition spec (hardcoded template table) — reuse is for the shared *roles*; copy the
  generic structure. **Re-seed coupling:** in-place role edits need the network seed re-run before the
  dry-run gate is meaningful. `infra_state_harvester` draws on BOTH `artifact_harvester` + `synthesis_source_acquirer`.
