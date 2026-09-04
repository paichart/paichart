# Pipeline Domain-Fit Catalog

> **Purpose**: the companion to [`PIPELINE-USE-CASE-DESIGN-PLAYBOOK.md`](./PIPELINE-USE-CASE-DESIGN-PLAYBOOK.md).
> The playbook is the *procedure* (how to take one use case from triage → shipped). This is the
> *map*: **which domains fit the Pipeline Harness, what transfers between them, and a worked
> Phase-1 fit-triage per candidate.** Add an entry here before you start Phase 2 on a new domain.
>
> **Who maintains it**: pipeline-harness-specialist, as candidates are triaged.

## The pattern is domain-agnostic

network-provisioning is not "a network thing" — it's one instance of a **shape**:

> **read-only harvest → declarative design → an approved-but-unapplied change package → a
> deterministic, *convergent* executor applies it OUTSIDE the autonomous loop.**

That's the cognition/actuation seam (playbook Phase 1) at full generality. Any domain whose work
has this shape is a candidate. The seam test is the gate; this catalog is the worked answers.

## Cross-domain fit table

| Domain | Harvest (read-only) | Deliverable (the terminus) | Actuator (outside the loop) | Fit |
|--------|---------------------|----------------------------|-----------------------------|-----|
| **Network provisioning** (shipped) | NAPALM/eAPI getters (`get_config`, `get_interfaces`) | per-device change package (config + show-validation + rollback) | human-gated apply / Ansible | ✅ shipped, real-device-validated |
| **Kubernetes / GitOps** | `kubectl get/describe`, API read verbs, `helm get values`, Argo `app get` | manifest / kustomize overlay / Helm-values diff (+ policy facts + rollback) | **Argo CD / Flux reconcile** or `kubectl apply` | ✅ strong (see §K8s) |
| **Terraform / cloud IaC** | `describe`/`list` APIs, `terraform plan`, state read | HCL diff / **plan output** / PR to the IaC repo | `terraform apply` — native converge + rollback (state) | ✅ **GO** (see §Terraform — cleanest seam, strongest moat) |
| **DB schema** | introspect schema | a migration file | a deterministic migrator | 🟡 candidate |
| **Firewall / SG / DNS / observability-as-code** | read current policy/zone/config | desired-state artifact | the domain's apply tool / GitOps | 🟡 candidate |

## What transfers vs what is domain-specific

Decide these in Phase 3 for each new domain. The split is stable across domains:

**Transfers for free (platform-level):**
- The **4-stage decomposition** — State Harvester → Architect → Change-Package Author → Reviewer.
- The **self-provision-from-descriptor** model (register a read-only service per run → use → teardown).
- **R9** untrusted-output sanitization — *every* external system's output (resource names,
  annotations, log lines, banners) is attacker-influenceable; the guard is the same. **But it
  only fires if the service is reached via the `services` gateway** (R9 site A gates on
  `toolCall.name === 'services'`) — a bespoke first-class tool bypasses it. So register + call via
  `services`, never a custom tool. (R9 is ON in prod since 2026-06-29; its unresolved C1 false-positive risk is worse for
  colon-/role-label-dense formats like k8s YAML.)
- The **WS4 contract shape** — read-only verb-enum, JWKS identity, per-service audience, scope.

**Domain-specific (the real per-use-case work):**
1. **Read-only tool surface** — *harder* to guarantee where one CLI/MCP bundles read+write
   (`kubectl`, `aws`, `terraform`). R1's typed **verb-enum** (allow get/list/describe/plan only)
   is the critical control, more than for a getters-only service.
2. **R10 secret families** — the redactor's patterns are network-config-shaped (`enable secret`,
   `snmp community`). A new domain needs its own families (k8s base64 `Secret` values, `token:`/
   `password:` in YAML, AWS `AKIA…` keys, **Terraform state is secret-dense**). Tune R10 — and fix
   the prose colon-FP — *before* enabling it for a domain.
3. **Deliverable shape** — what the Author emits (per-device config / k8s manifest / Terraform plan).
4. **Actuation terminus** — where it lands (Ansible / Argo reconcile / `terraform apply`).
5. **Harvest scope** — clusters/accounts have ≫ state than a 2-device lab; the conditional Phase-0
   harvest needs namespace/label/region/resource-type filters to stay in token budget.
6. **Mechanical-net checkers ("leaves") — CODE, not prompt, and earned by a live failure.** A
   guarantee that rides on a deterministic computation an LLM can't be trusted with — CIDR prefix
   arithmetic, quota/quantity sums, cross-leg value equality — **cannot be enforced by a protocol
   contract.** The prompt tells the Architect to get it right; the *check that it did* is platform
   code. (Runs 5/6 proved this: the design claimed `10.99.0.0/31` for members `.1/.2` — a /31 covers
   only `.0/.1` — twice, despite an explicit brief warning. Prompt text was demonstrably insufficient
   against a repeatable model failure; cf. the "how many R's in strawberry" class — binary prefix math
   is exactly the token-level determinism LLMs fumble.) The check lives as a **`kind`-dispatched
   leaf**: `lib/agents/harness/derivation-containment.ts` implements **two** branches as of
   2026-08-02 — `cidr` (member-within-aggregate, harvested-containment, and minimal-prefix
   arithmetic) and `asn` (provenance membership + RFC-fixed range classes) — consumed from the
   `## Derived Values` block that **only network-provisioning emits** (verified 2026-08-02 — the
   consuming protocols emit `## Consumed Values` instead), pinned by the run-5/6 and run-15 fixtures in
   `scripts/test-derivation-containment.ts`. Generic-by-construction: the engine dispatches
   on the `kind` tag, so a new domain's derivation adds a *branch* (a k8s label-subset check, a
   terraform address-containment check) — and reuses `cidr` for free if it derives CIDRs. **Two
   standing rules:**
   - **A leaf is earned by a live failure, OR by a load-bearing prose-only property of a class
     already measured as non-binding** (Protocol 13's mechanical-net rule; second path added
     2026-08-02). Note
     the seam when a domain grows a derivation step; do NOT speculatively build the checker. It's a
     *code* deliverable (unit tests, review, deploy gate) — not DB-editable content like a prompt,
     precisely because its correctness is the whole point and an editable checker re-introduces the
     fallibility it exists to catch.

     **THE SECOND PATH, and why it exists.** The `asn` leaf was built with no live failure behind it
     — no run had ever produced a bad AS number, and the trigger was a *customer question*. Under the
     original one-path rule that was speculative. The rule was amended rather than the exception
     excused, because the case generalises:
     - the property it checks was **live and prose-only** — Node C was instructed to verify
       "every package used the SAME IP/VLAN/ASN values", and this codebase has **measured twice**
       (Runs 15/16, `numbered-spec-checks-not-binding`) that prose checks are not binding. So the
       failure class was not hypothetical; only its *occurrence* was.
     - it was the cheapest way to test whether the `kind` dispatch is generic at all — and it
       **found a real constraint** nobody had articulated (range policy is a *unary* predicate and
       has no seat above the harvest gate) plus a **live fail-open** (numeric values silently
       dropped from `derivedValues`). Neither was visible from the dispatch site.
     - a four-specialist panel reviewed it before any code was written.

     **The second path, stated as a test.** All three must hold, or it is speculation:
     1. **Load-bearing** — a wrong value causes real harm (here: authorising a hostile AS number).
     2. **Prose-only** — the sole existing guard is an instruction to an LLM.
     3. **Class already measured as non-binding** — we have *observed* prose checks of this kind
        being skipped. Not "might be skipped": measured. Runs 15/16 are the evidence.

     Condition 3 is what keeps the path narrow. Without it, every prose instruction becomes an
     argument for a checker and the rule stops meaning anything. With it, the trigger is a
     **demonstrated** enforcement gap rather than an imagined failure.

     Note what the original rule was protecting against and still does: building a checker for a
     failure mode nobody has evidence for. The second path does not weaken that — it recognises that
     "we have never seen it fail" and "nothing would catch it if it did" are different statements,
     and the second one is also evidence.
   - **An un-checked kind falls to `unsupported[]` → Node C, which is graceful DEGRADATION, not
     equivalent safety.** Node C is an LLM re-doing the exact arithmetic the leaf exists because LLMs
     can't. A domain that derives an un-leafed value is protected only as well as an LLM recomputes it.

## Why IaC / GitOps domains can fit *better* than physical devices

The seam test wants the actuator to have "real convergence + rollback." Network devices don't
natively — that had to be bolted on (human gate + Ansible). **Terraform `apply` and GitOps
reconciliation *are* that** — idempotent convergence + rollback (state file / git revert) built in.
The harness produces desired state; the reconciler converges it. That is the cleanest possible
terminus, which is why k8s/Terraform are high-value next candidates.

---

## §K8s — Kubernetes / GitOps (Phase-1 triage, 2026-06-27)

**Verdict: GO — a strong, arguably cleaner fit than network provisioning.**

**1. Two halves.**
- **Cognition (→ harness):** read-only harvest of cluster state (`kubectl get/describe`, API read
  verbs, `helm get values`, Argo `app get`) → design the desired state against an objective (add an
  HPA + limits, right-size requests from observed usage, roll an ingress, reconcile drift) → author
  it as **declarative artifacts** (manifest / kustomize overlay / Helm-values diff / Argo-renderable
  diff) with **validation facts** (`kubectl diff`, `kubeconform`, OPA/conftest policy results) and a
  **rollback** (prior revision / `helm rollback` / git revert). Idempotent — re-running regenerates
  the same YAML.
- **Actuation (→ OUT of loop):** `kubectl apply` / `helm upgrade` / **Argo CD or Flux reconcile** —
  native convergence (the control loop drives actual→desired, retries, reports health) + native
  rollback (revision history / git revert).

**2. Seam rule → ✅.** Cognition half is pure declarative design (idempotent, re-runnable, reads are
safe to retry). Actuation half has a *native convergent executor with rollback* — exactly what the
seam demands. Cleaner than network gear, where that executor was bolted on.

**3. Reject?** No — high planning value (right-sizing, policy-compliant authoring, multi-resource
changes, drift analysis).

**4. Terminus.** An **approved-but-unapplied, GitOps-ready change** (manifest/overlay/values diff +
validation facts + rollback), committed to / PR'd against the cluster's config repo; **Argo CD /
Flux reconciles it** (or a human runs `kubectl apply`). The harness never calls a write verb.
*pAIchart proves the desired state is correct + safe; the reconciler proves the cluster converges to it.*

**Phase-1 surfaces (resolve in later phases, NOT part of the fit verdict):**
- **R1 read-only is the hard part** — `kubectl`/`helm` bundle read+write; verb-enum must expose
  *only* get/list/describe (no apply/patch/delete/scale).
- **R10 needs k8s secret families** — base64 `Secret` values, `token:`/`password:` in YAML,
  kubeconfig creds — plus the prose colon-FP fix (YAML is colon-dense).
- **Harvest scoping** — namespace/label/resource-type filters for token budget.
- **Declarative > imperative** — emit desired-state manifests (GitOps), not imperative `kubectl
  patch`; the latter drifts from the seam.

**Phase 2 DONE (2026-06-27)** → decomposition designed in
[`kubernetes-gitops/kubernetes-gitops-pipeline.md`](./kubernetes-gitops/kubernetes-gitops-pipeline.md)
(4-stage mirror: Cluster State Harvester / ORCHESTRATOR · Workload Architect / ARCHITECT · Manifest
& Rollback Author / DOCUMENTER · Change Reviewer / REVIEWER + the k8s-specific tool-surface sharp
edges). **Next gate: Phase 3 (required work).**

---

## §Terraform — cloud IaC (Phase-1 triage, 2026-06-29)

**Verdict: GO — the cleanest-fitting domain yet *and* the strongest moat. But the hard part moves: the
read-only contract + state-secret handling is sharper here than anywhere, and it IS the make-or-break.**
**Target buyer: the governed team / regulated org** (not the solo engineer — see "why, not just Claude").

**1. Two halves.**
- **Cognition (→ harness):** read-only harvest of current IaC + real deployed state — `terraform plan`
  (refresh-only; surfaces **drift** — the real diff, not pasted files), `terraform show -json` (current
  state, **redacted**), `terraform state list`, provider `describe`/`list`, the repo HCL → design the
  change against an objective (add/right-size a resource, an SG/firewall rule, a tag/policy standard,
  reconcile drift) → author it as **declarative HCL** (a module/`.tf` diff, a PR to the IaC repo) with
  **validation facts** (`terraform validate`, `tflint`, the expected `plan` add/change/destroy counts,
  OPA/conftest/Sentinel policy results) and a **rollback** (revert the HCL + apply / state rollback).
  Idempotent — re-running regenerates the same HCL.
- **Actuation (→ OUT of loop):** `terraform apply` — the **native convergent executor** (plan→apply
  drives actual→desired, retries, reports) with a built-in plan/apply gate + rollback. Or the team's
  existing governed run: **Atlantis / Terraform Cloud-Enterprise / Spacelift** PR-driven apply.

**2. Seam rule → ✅✅ (the cleanest of any domain).** Cognition half is pure declarative HCL design.
Actuation half is `terraform apply` — Terraform's own **plan/apply seam *is* the cognition/actuation
seam**, executor + rollback native, nothing bolted on (network) and no separate reconciler needed
(k8s). `terraform plan` is uniquely dual-purpose: it's **both** a harvest fact (the real, drift-aware
diff) **and** the validation fact (exactly what apply will do).

**3. Reject?** No — highest governed-team value (drift reconciliation, policy-compliant + multi-module
authoring, right-sizing from real state, the audit trail), and the **#1 moat is strongest here:
secret-dense state never enters an LLM** (the solo-engineer "just paste it into Claude" path leaks
every secret in `.tfstate`; the pipeline harvests metadata-not-values + redacts).

**4. Terminus.** An **approved-but-unapplied PR to the IaC repo** (HCL diff + expected `plan` + policy
facts + rollback), reviewed; the team's **`terraform apply` / Atlantis / TFC run** converges it. The
harness never runs apply/destroy. *pAIchart proves the HCL is correct, safe, policy-compliant, and
diff-bounded; terraform proves the cloud converges to it.* Lands as a PR **in the workflow they already
use** — which is the governed-team fit.

**Phase-1 surfaces (the hard parts — resolve in later phases, NOT part of the fit verdict):**
- **R1 read-only is HARDER than k8s — `plan` is not purely read-only.** It takes a **state lock** + calls
  provider data-sources/refresh (read APIs). The service must expose only `plan`/`show`/`state list`/
  `validate` (NEVER apply/destroy/import/state-rm/taint), run plan `-lock=false` or against a state
  read-replica, and accept that "read-only" = *no infra writes*, not *no side effects*. Sharpest R1 surface yet.
- **R10/K1 — state is the MOST secret-dense surface, and this IS the moat (make-or-break).** `.tfstate`
  embeds secret **values** inline (passwords, keys, certs, connection strings) — denser than k8s Secrets.
  Harvest MUST use `show -json` with redaction / never raw state; K1 = harvest resource **shape +
  addresses + drift**, not secret attribute values. R10 needs TF families (HCL `sensitive`, `sensitive_attributes`,
  provider creds, `*.tfvars`). Get it right → "your state never touches an LLM" is real; get it wrong → the moat collapses.
- **Drift is a first-class design INPUT** (unlike network/k8s where current ≈ declared): plan surfaces
  declared-vs-actual — the Architect reconciles or flags it, never treats it as noise.
- **Harvest scoping** — workspace/module/resource-address filters; a real estate's plan ≫ a 2-device lab,
  so the 8 KB tool-result cap + chunked, address-scoped reads matter more here.

**Provider-agnostic dividend:** one HCL+plan model covers AWS/Azure/GCP/Cloudflare/… — this single
use-case **subsumes the "AWS"/cloud candidates**. Build Terraform, get the cloud category.

**Phase 2 DONE (2026-06-29)** → decomposition designed in
[`terraform-iac/terraform-iac-pipeline.md`](./terraform-iac/terraform-iac-pipeline.md): the 4-stage mirror
(IaC State Harvester / ORCHESTRATOR · Infrastructure Architect / ARCHITECT · HCL & Rollback Author /
DOCUMENTER · Plan & Policy Reviewer / REVIEWER) + the TF tool-surface sharp edges. **Headline: all 4 roles
reused** (`infra_state_harvester`, `infra_change_architect`, `config_change_author`, `change_reviewer` — the
k8s work already neutralized them); only templates + protocol are new. **Next gate: Phase 3 (required work).**

---

## §IGP-Migration — routing-protocol migration, OSPF→IS-IS (Phase-1 triage, 2026-08-21)

**Verdict: GO — as a PROGRAM use-case on the already-shipped network-provisioning leg domain, not a
new leg domain.** Trigger: live customer question (migrating OSPF→IS-IS). The leg-level fit was
settled when network-provisioning shipped; what's new here is the *phase-cycle* choreography and one
derivation seam. Design skeleton: `cline_docs/igp-migration-design-2026-08-21/DESIGN-SKELETON.md`.

**1. Two halves.**
- **Cognition (→ harness):** read-only harvest (running-config, OSPF neighbors/areas, RIB, interface
  state) → design the target IS-IS topology (area→level mapping, NETs from router-IDs, metric
  translation) → author **per-phase, per-device change packages** (config + show-command validation
  criteria + rollback) following ships-in-the-night discipline: (P1) deploy IS-IS alongside OSPF,
  (P2) verify adjacency/route parity, (P3) shift protocol preference, (P4) remove OSPF.
- **Actuation (→ OUT of loop):** human-gated apply per phase (Ansible/manual). Between phases the
  next leg **re-harvests live post-apply state** — verification is against reality, never the plan.

**2. Seam rule → ✅.** Identical to shipped network-provisioning (same getters, same deliverable
shape, same terminus). The migration adds only *sequencing with human gates* — which is exactly the
program layer's gate mechanism (template-less ACTION tasks releasing the cascade on `task.complete`).

**3. Reject?** No — high value: migrations are the network change class customers fear most, and the
approved-but-unapplied + phase-gated posture is precisely what they want from tooling here.

**4. Terminus.** Per phase: an approved change package; a human/Ansible applies it; the following
leg's harvest confirms convergence before the next gate opens. The harness never writes to a device.

**Phase-1 surfaces (resolve in later phases, NOT part of the fit verdict):**
- **NET/system-ID derivation is an un-leafed kind** — BCD-packing a router-ID into a NET is the same
  token-level arithmetic class as CIDR math (runs 5/6/15). Today it falls to `unsupported[]` →
  Node C = graceful degradation, not equivalent safety. A `net` leaf likely qualifies under the
  **second-path rule** (load-bearing + prose-only + class measured non-binding, Runs 15/16) — but
  per standing practice, **corpus-measure against real run artifacts first** (Tier-1 runs generate
  the corpus). Do NOT build speculatively.
- **Metric translation** (OSPF cost → IS-IS metric, wide-metrics on) is a second derivation seam —
  same treatment: note it, measure it, leaf it only if the corpus shows it's load-bearing.
- **Phase discipline as protocol prose vs per-run objective** — Tier 1 carries it in the program
  requirements artifact; if productized, decide protocol variant vs network-provisioning section
  (panel call). Prose-only ordering rules ("never remove OSPF before parity") are exactly the
  measured-non-binding class — the *gates* are the binding control, not the prose.
- **Roles transfer** — expect all 4 reused (`infra_state_harvester`, `infra_change_architect`,
  `config_change_author`, `change_reviewer`), the terraform precedent. Any NEW role must name the
  `ROLE_GUIDANCE_LIBRARY` step + reuse `change_reviewer` terminal-verdict wiring (ADD guide §1/§4).
- **Rig** — cEOS rig (down since 2026-07-24; docker start + eAPI-405 probe) needs an OSPF-configured
  baseline seeded as the "customer" brownfield state; consider 3-4 nodes for a real adjacency mesh.
- **Open customer questions** (block Phase 2, not the verdict): vendor/platform mix, device/area
  count (batching vs 8-leg cap), multi-area→L1/L2 design authority, design-only vs actuation
  expectations.

---

## Mitigation typology — what ages how across model generations (2026-08-22, from the FW-A3 campaign)

The mechanical-net rules above generalize: every guard in this stack is one of four types, sorted by
**model-dependence** — i.e. what happens to it when the underlying model improves. Canonical answer
to "would a better model avoid these problems / will our guards impede one?"

| Type | Examples | Better model → | Impedes a better model? |
|---|---|---|---|
| **Mechanical checks** | containment leaves, block parsers, AND-gates, keep-best, generation budgets | passes them more often | **Never** — they verify OUTPUTS, not process; an always-right model just always passes, at ms cost. They also generate the AUDIT EVIDENCE, which even a perfect model cannot self-certify |
| **Format contracts** | exact headings, fenced-JSON schemas, terminal VERDICT grammar | complies more easily | No — they are interface specs, like an API. Tolerance additions (e.g. the fence-inversion arm) help every model |
| **Calibrated thresholds** | retry band 50–69, confidence floors | distribution shifts | Re-tunable by design; keep-best/suppression logs are the recalibration data (the band ships "on probation" for exactly this) |
| **Prose guidance** | role clauses, protocol procedures | ⚠️ the one real risk | Stale PROCEDURE can impose busywork or anchor to old failure modes. Defenses: every ⚠️ clause carries incident provenance (removable when provably obsolete); write PROPERTIES not procedures (requirements template rule 3); Protocol 12 size budgets; prune at the model-upgrade validation round |

**Operating principle: judgment lives in prompts (cheap to swap as models improve); guarantees live
in code (model-independent).** A model upgrade's playbook: run a validation round as the canary
(the FW-A3 campaign doubled as the Sonnet-5 canary — ~120 executions, defects at LLM-typical rates,
all caught), then a deliberate pruning pass over prose guidance asking "which clauses stopped
earning their keep?" — the pass we have exercised least, because nothing has been obsoleted yet.

Scale intuition (measured, FW-A3): format-contract misses ran ~3 in 12 leg-runs on a frontier
model. A 5x better model still fails weekly at fleet scale — **a better model shrinks the failure
RATE; only the architecture bounds the failure COST** (this campaign's: zero shipped defects across
four failing rounds).
