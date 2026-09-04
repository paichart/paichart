# Kubernetes/GitOps — Phase 6 Implementation Plan (build spec)

> **Owner:** pipeline-harness-specialist (coordinates) → template-system + prompt-construction +
> agent-execution + sec-ops + validation-engine. **Source:** the RFC (`kubernetes-gitops-pipeline.md`)
> + the review (`cline_docs/reviews/kubernetes-gitops-design-2026-06-27/REVIEW.md`).
> **Status:** NOT STARTED — Phase 5 GO-with-fixes folded; resolve nothing else first (C3 decided).
>
> **⚠️ Anchors, not line numbers.** Each row's durable key is **file + the grep anchor** (a symbol /
> string / `const`). Line numbers are **"as of commit `0bf529c5` — re-grep before editing"**: this build
> edits these very files, so the numbers drift. Verify with the grep column, never the line.
>
> **Scope (the WS3/C3 split):** this plan is **pAIchart's half + the published spec**. The **verb-enum
> (R1) + RBAC (R2) live in the *customer's* service** — specced + self-certified, NOT built here. ~Half
> the rows are **net-new files** (no line number exists yet).

## Build-readiness review (2026-06-27) — 3 executors, 85% GO

prompt-construction **88** · template-system **88** · agent-execution **80** = **85% mean, GO to start.**
Corrections folded into the WP rows below. **WP-B is confirmed a NEW protocol** (Steve): a protocol is a
*per-domain decomposition spec* (it hardcodes the template-name table) — reuse is for the shared *roles*,
not the protocol; **copy** the generic structure (seam + self-provision lifecycle + SYNTHESIZE +
facts-not-verdicts), swap the domain decomposition/vocab. **Don't untag `network-provisioning-protocol`** —
the harness's `loadProtocols` would then drop it and network tasks lose their decomposition.

**Binding conditions (resolve before the relevant code):**
1. **C4 — denial CHANNEL ✅ LOCKED `isError:true` (Steve, 2026-06-27); C4 is verify-only.** A verb-enum denial returned as
   MCP `isError:true` is recorded `success:true` by the loop (`agentic-tool-loop.ts:669`; `mcpService.ts:544`
   *returns* `isError`, does not throw) → it **cannot** trip #89 / `executionDegradation` by construction, and
   the LLM still sees the denial text (escalate-don't-fabricate). So **K4 collapses to: an E1 spec line
   (customer service reports denials as `isError:true`, NOT a JSON-RPC throw) + WP-B protocol prose + a
   verify-only engine test.** Engine classification is needed ONLY if denials must throw — and then it must
   key off a **structured code, never customer error text** (Protocol-10 verdict-smell).
2. **Re-seed ordering for A1/A2 (the in-place role edits).** Role guidance is baked into `promptTemplate`
   at seed time, so editing the library changes nothing in the live network rows until the network seed
   re-runs. **Order: deploy A1–A4 code → re-run `seed-network-provisioning-templates.ts` → network dry-run
   passes → run the k8s seed.** (Seeding is a manual post-deploy step, not CI.)
3. **D3 re-anchor** (below) — post-execution summary via the StageActivity service, guarded on `pipelineStageId`.

**Deferred / backlog (NOT Phase-6):**
- **C5** (truncation field-render) — optional legibility win; the inline marker already shows partiality.
- **`loadProtocols` inject-all → routed single-protocol** — at ~7–8 protocols the `take:10` alphabetical cap
  silently truncates (currently **4 of 10** after k8s). The named-protocol path (`metadata.protocol`) already
  exists; switch pipeline tasks to it when the catalog grows. Flag for the next use-case author.

**Handbacks:** E1 denial-channel → pipeline-harness + sec-ops (customer-half contract); D3 write-site → database-manager.

## Build order (critical path)

1. **WP-A — roles (B1)** — the dry-run-gated in-place edits + 2 new keys. Gates everything (the personas).
2. **WP-B — protocol text (B2)** — the new protocol + matcher + HOWTO.
3. **WP-C — guards (R9/R10/K4)** — R10 families + on; R9 C1 dependency; the denial-≠-degradation calibration.
4. **WP-D — pAIchart's tests (B5) + audit (B4)**.
5. **WP-E — the published spec + optional reference rig (C3, B3)** — the customer's-half contract + Phase-4 lab.

---

## WP-A — Roles (B1) · owner: prompt-construction (text) + template-system (templates)

> **Progress (2026-06-27):** ✅ A3 + A4 (new neutral keys `infra_change_architect` + `infra_state_harvester`) +
> A5 (`scripts/seed-kubernetes-gitops-templates.ts`) + A6 (coverage + Deliverable-Contract validations green,
> typecheck clean) — committed (net-new, zero network risk). ⏳ **A1 + A2 HELD** for the re-seed-aware
> network dry-run gate (they edit the live `change_reviewer`/`config_change_author`; the drafts are ready
> but must not seed to prod until the dry-run proves network parity).

| # | R | File | Anchor (grep) | Line* | Change | Gate |
|---|---|------|---------------|-------|--------|------|
| A1 | B1 | `lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts` | `'change_reviewer':` | 465 | **Neutralize IN PLACE**: "exact show command"→"validation fact"; "per-device"→"per-resource". Keep the key. | **network-provisioning dry-run** (output-meaning parity) |
| A2 | B1 | same | `'config_change_author':` | 456 | **Neutralize IN PLACE** (device/show ×6 → neutral). k8s manifests *are* config. Keep the key. | **network dry-run** |
| A3 | B1 | same | `'network_design_architect':` (insert a new key beside it) | 446 | **ADD `'infra_change_architect'`** — generalize its §6 skeleton (keep the chain/no-refetch/50KB-cap rules), drop VLAN/SVI. Leave `network_design_architect` untouched. | — |
| A4 | B1 | same | `'artifact_harvester':` **+** `'synthesis_source_acquirer':` | 375 / 360 | **ADD `'infra_state_harvester'` from BOTH** (prompt-construction fix): `artifact_harvester` (§6-PRODUCING + escalate-don't-fabricate) **AND** `synthesis_source_acquirer` (the iterative scoped `services.call` loop, succeed-with-partial, `## Acquisition Summary` header — the *tool-loop* discipline lives HERE, not in artifact_harvester) + k8s K2 narrow-reads + secret-metadata-not-values. NOT `network_state_harvester` (no key). | — |
| A5 | B1 | `scripts/seed-kubernetes-gitops-templates.ts` **(NEW)** | model on `const TEMPLATES` | n/a | 4 templates mirroring network (template-system fixes): **specialists on `claude-haiku-4-5`** (Steve, 2026-06-28 — deliberate split: the harvested config is the syntax exemplar, so Haiku authors fine for the specialists; the Pipeline Harness orchestrator runs `claude-sonnet-5` (verified against the live `agent_templates` row 2026-08-05; this line previously said `claude-opus-4-8`, which was never true of the seeded template — no template of any kind is on an Opus model). Overrides the earlier "all-Sonnet" finding); `templateType` **ORCHESTRATOR/ARCHITECT/DOCUMENTER/REVIEWER**; **`metadata.protocol: 'kubernetes-gitops-protocol'`** on each (NOT `loadProtocols` — that's the harness flag); `category: AUTOMATION` (produces a change package, not DEPLOYMENT); `tags` **must NOT include `'protocol'`**; timeouts 600/300/600/300; `createdBy` via `SEED_OWNER_EMAIL→owner.id ?? 'system'`; idempotent `findFirst→update/create`. **No** deliverable wiring (set at runtime). `defaultRole`: `infra_state_harvester`/`infra_change_architect`/`config_change_author`/`change_reviewer`. | — |
| A6 | B1 | `scripts/audit-role-guidance-coverage.ts` | `INTENTIONALLY_GENERIC_ROLES` | ~94 | Assert both new keys resolve via **`covered`** (auto-discovered, `:55`) — **do NOT add `infra_state_harvester` to the exemption list** (unlike `network_state_harvester`; it needs real tool-use guidance). CI: `validate:role-guidance-coverage`. | CI green |

*Do NOT use `solution_architect` (`:171`) — POV-interactive, no §6 contract, instructs the forbidden `task.context`/`agent.results` anti-pattern.*

## WP-B — Protocol text (B2) · owner: prompt-construction

> **Progress (2026-06-27):** ✅ B1 (`const PIPELINE_KUBERNETES_GITOPS_PROTOCOL`, copying the generic
> structure + the self-provision lifecycle + narrow-reads + the `isError` expected-denial handling +
> facts-not-verdicts/no-kubectl-diff + declarative-GitOps) + B2 (`PROTOCOLS[]` entry
> `kubernetes-gitops-protocol`, tag `protocol`, 4 of 10) + B4 (verified seed-only, no engine change) —
> committed; typecheck clean, protocol-validator 18/18, escaping matches network (single-backslash).
> 🅿️ B3 (HOWTO-use-pipeline-harness section) **DEFERRED to promote-time** — it's a *user-facing* `/prompt`,
> so it must not advertise the capability until it's runnable + validated (mirrors network, whose HOWTO
> landed at promotion). Add it last, with the public guides, when k8s ships.

| # | R | File | Anchor (grep) | Line* | Change |
|---|---|------|---------------|-------|--------|
| B1 | B2 | `scripts/seed-protocol-prompts.ts` | `const PIPELINE_PROVISIONING_PROTOCOL` (**copy its generic structure**) | 1382 | **ADD `const PIPELINE_KUBERNETES_GITOPS_PROTOCOL`** — NEW, copying the generic seam/mode/SYNTHESIZE verbatim + swapping domain bits. Must-haves: read-only CRITICAL SAFETY INVARIANT; conditional Phase 0; 4-stage decomposition; **the full self-provision register→call→teardown lifecycle (`:1425-1433`)** (prompt-construction — "descriptor model" was under-specified); facts-not-verdicts (kubeconform/kustomize/OPA — **no kubectl diff**); declarative-GitOps deliverable; 8KB→narrow-reads; **K4 with an EXPLICIT denial list** (exec/secrets/`pods/log`/proxy denials = control working, not harvest failure — shapes the LLM narrative; pairs with E1's `isError` channel). |
| B2 | B2 | same | `const PROTOCOLS: ProtocolSeed[]` / `name: 'network-provisioning-protocol'` | 1465 / 1495 | **ADD a `PROTOCOLS[]` entry**; `promptText: UNIVERSAL_AGENT_RULES + PIPELINE_KUBERNETES_GITOPS_PROTOCOL` (mirror :1497); tag `protocol`. |
| B3 | B2 | same | `name: 'HOWTO-use-pipeline-harness'` | 1514 | Add a Kubernetes/GitOps section (mirror the network-provisioning one). |
| B4 | B2 | `lib/services/agentExecutionEngine.ts` | `templateMetadata?.loadProtocols === true` | 1882 | **Verify only — confirmed seed-only, no engine change** (agent-execution): `loadProtocols` injects ALL protocol-tagged into the harness (`take:10`, alphabetical); k8s = 4 of 10. The **specialists** name it via `metadata.protocol` (cap-immune). **Backlog (not now):** at ~7–8 protocols the cap silently truncates → switch pipeline tasks to routed single-protocol injection. |

## WP-C — Guards: R10 / R9 / K4 · owner: agent-execution + sec-ops

> **Progress (2026-06-27):** ✅ C1 (R10 k8s/cloud families — YAML `key:value`/env `KEY=value` secret keys
> + AWS AKIA, value-secret-shaped to stay FP-safe; **bare `:` removed from the generic pattern** — the
> colon-FP fix) + D1 (§K test, 13 checks incl. FP guards; **security-invariants 80→94, §J network R10
> still green**) + C2 (env-template k8s enable note) + ✅ **C4** (§L K4 tripwire — pins the
> `isError`→`success:true`→non-degrading chain across mcpService + the tool-loop; security-invariants 94→99).
> ⛔ **C3** blocked on the platform C1 detector decision. 🅿️ **C5** deferred (optional).

| # | R | File | Anchor (grep) | Line* | Change | Gate |
|---|---|------|---------------|-------|--------|------|
| C1 | R10 | `lib/agents/harness/redact-artifact-secrets.ts` | `const PATTERNS: RegExp[]` | 55 | **Add k8s families**: base64 `Secret` values, `token:`/`password:`/`apiKey:` YAML, kubeconfig, SA/bearer/JWT, ConfigMap/env literals; **fix the prose colon-FP**. | §J/§K regression |
| C2 | R10 | `.env.production.template` + `.env.example` | `ARTIFACT_SECRET_REDACT_ENABLED` | 70 / 94 | **R10 ON for k8s** (per K1/K5 — non-Secret GETs leak past RBAC). Doc the engagement default. | — |
| C3 | R9 | `lib/agents/harness/sanitize-chained-output.ts` (+ its C1 decision) | `CONNECTED_OUTPUT_SANITIZE_ENABLED` (gate at `agentic-tool-loop.ts:699`) | 699 | **Dependency, not a code edit:** route a **k8s corpus into the C1 detector regression** before enabling (system:masters / colon-dense YAML trips it). | **BLOCKED on the C1 decision** |
| C4 | K4 | E1 spec + WP-B prose + `agentic-tool-loop.ts` (verify) | `success: true` hardcoded at `:347`; `mcpService.ts:544` returns `isError` | 347 | **RE-LABELED "verify + spec," not engine change** (agent-execution): a denial returned as `isError:true` is recorded `success:true` → **cannot** trip #89/degradation by construction. So: **E1 spec line** (customer service returns `isError:true`, not a throw) + WP-B denial-list prose + a **verify-only test** (assert `isError` → `success:true`, no degradation). Engine classification ONLY if denials must throw — then key off a structured **code**, never customer error text. | verify-only test |
| C5 | K2 | `lib/agents/harness/render-pipeline-context.ts` | `renderPipelineContextSection` (renders only agentRole/confidence/finalResponse `:35-41`) | 16 | **Optional enhancement:** surface `truncated`/`originalChars` (`context-chainer.ts:47-48`) into §6. Today the inline marker (`:184`) shows partiality. | — |

## WP-D — Tests (B5, pAIchart's half) + audit (B4) · owner: validation-engine + agent-execution

> **Progress (2026-06-28):** ✅ D1 (§K, done under WP-C). ✅ **D2 verified-agnostic — NO new test needed**:
> `pipelineProtocolValidator` validates the harness's runtime decomposition *structure* (CREATE/
> SYNTHESIZE/ORCHESTRATE tool-call sequence), not per-protocol content, so the k8s protocol's identical
> 4-stage shape is already covered by the existing generic tests (18/18). The genuine k8s happy-path is
> the **E2E smoke** (`pipeline-harness-e2e-test.md`) — needs a running pipeline → deferred to the rig phase.
> ◻️ **D3** (harvest audit, post-exec `StageActivity` via `logStageActivityWithDetails`, guarded on
> `pipelineStageId`) — a code item with a **database-manager handback**; pair with the rig/seed phase.

| # | R | File | Anchor (grep) | Line* | Change |
|---|---|------|---------------|-------|--------|
| D1 | B5 | `scripts/test-security-invariants.ts` | `── J. R10 —` (add `── K.` after) | 190 | **§K**: pin the R10 k8s families (mirror §I/§J shape `:139`/`:190`). Wired in `test:all-validation`. |
| D2 | B5 | `lib/services/pipelineProtocolValidator.ts` (+ its test) | the validator | — | Cover the new protocol's routing/validation (mirror `test:pipeline-protocol-validator`). |
| D3 | B4 | `lib/pov/services/stageActivityService.ts` (write API) — call from the engine's **post-execution** path | `logStageActivityWithDetails` (:42); guard on `harnessContext.pipelineStageId` (:1876) | 42 | **RE-ANCHORED** (agent-execution): NOT `mcpContext:454` (pre-exec, no `stageId` FK). Write ONE post-execution summary `StageActivity` (`HARVEST_COMPLETED`, metadata `{securityEvent:true, resourcesAccessed}`) via the **service** (not inline `prisma.create` — skips validation), guarded on a present `pipelineStageId`. Per-verb events are the **customer's** service (C3). **Handback: database-manager** for the write-site. |

## WP-E — Published spec + optional reference (C3 / B3) · owner: pipeline-harness + sec-ops

> **Progress (2026-06-28):** ✅ E1 (`K8S-SERVICE-INTEGRATION-SPEC.md`, DRAFT v0.1) — the customer-half
> contract: R1 `(resource,verb,subresource)` allowlist + exclusions, `secrets`→`list_secret_names`,
> typed/`.strict()` args, R2 read-only ServiceAccount (RBAC ∧ verb-enum), R8 namespace scope, R10
> k8s families, JWKS identity (§2 ~verbatim from network), and **§6.5 the `isError` denial-channel MUST**
> (the locked C4 contract). Open: descriptor category, reference service / rig, publish location.
> ✅ **E2/E3 artifacts drafted (2026-06-28)** → `phase4-kind-rig/`: the **E1-conformant read-only k8s MCP
> service** (`k8s-mcp-readonly/server.py` — verb-enum allowlist + `list_secret_names` metadata-only +
> `isError` denial channel), `kind-config.yaml`, `readonly-rbac.yaml` (read-only SA/R2), `sample-workloads.yaml`
> (the `trading/orders-api` harvest target, HPA/limits absent), `k8s-readonly-descriptor.json`, and the
> **README** (build runbook) + **DEMO-RUN-GUIDE** (run procedure). ⏳ **Prod build pending**: install kind+kubectl,
> create cluster, build+run the service, reuse the ceos-lab tunnel (:3107) *(superseded 2026-07-15: dedicated `k8s-lab.paichart.app` → :3112 route)*, seed k8s to UAT, run the pipeline.

| # | R | File | Anchor | Line* | Change |
|---|---|------|--------|-------|--------|
| E1 | C3 | `.claude/knowledge/pipelines/kubernetes-gitops/K8S-SERVICE-INTEGRATION-SPEC.md` **(NEW)** | model on `network-provisioning/DEVICE-SERVICE-INTEGRATION-SPEC.md` | n/a | The **customer's-half contract**: the `(resource,verb,subresource)` allowlist + exclusions (`pods/log`, `--raw`, `ephemeralcontainers`, exec/attach/cp, nodes/services/pods `proxy`, `serviceaccounts/token`, CSR approve, RBAC escalate/bind, impersonate/`--as`, eviction/scale/watch), `secrets`→`listSecretNames`, `.strict()` + RFC1123 args, typed-client-not-shell, RBAC SA, JWKS identity, **self-certify checklist**. **+ DENIAL CHANNEL ✅ LOCKED (2026-06-27, resolves K4/C4):** the service MUST report verb-enum/RBAC denials as MCP `isError:true` tool-result content, **NOT** a JSON-RPC throw — the loop then treats them as non-degrading by construction. |
| E2 | B3 | `descriptors/` (public **paichart** repo) **(NEW, optional)** | reference read-only k8s descriptor | n/a | Read-only `capabilities.tools` (full typed `inputSchema` = grade-A) + top-level `description`. Worked example + Phase-4 rig service — **not owned infra, not a CI gate** (`capabilities.tools` ≠ security boundary; the service calls its own `.parse()`). |
| E3 | — | (Phase-4 rig) | throwaway kind/minikube + read-only service + tunnel | n/a | Mirrors the cEOS rig; validates pAIchart's **cognition** against real k8s state. |

---

## Gates / done-criteria

- **Shared-role edits (A1/A2) — the re-seed-aware equivalence gate, in ORDER** (template-system + prompt-construction):
  1. `grep scripts/test-*.ts` for pinned strings ("show command", "per-device", role fragments) — a
     30-second catch BEFORE the rewrite (the string-pinned-tests lesson; a deliberate rewrite is a
     different string by design, so string tests are NOT the equivalence gate).
  2. Deploy A1–A4 code → **re-run `seed-network-provisioning-templates.ts`** (the live network rows keep
     the OLD baked text until re-seeded — seeding is a manual post-deploy step, not CI).
  3. **Network dry-run** of the cEOS-validated objective (`9023b41d`), pre/post: assert the neutralized
     Author still emits per-device config + real `show`+expected-output **FACTS** (the protocol re-supplies
     `show`, `:1443` — the dry-run proves the redundancy holds) + rollback; the neutralized Reviewer still
     emits verdict+confidence line-1, still blocks prose-validation, still gates `approved` at ≥85%.
  4. Only then run the k8s seed.
- **C4: denial channel ✅ LOCKED `isError:true`** (Steve, 2026-06-27) → C4 is verify-only, no classifier. (sec-ops/harness *confirm* in E1; no decision left open.)
- **C3 (R9) is BLOCKED** on the platform C1 detector decision — don't claim R9 coverage until it lands.
- `npm run build` + `test:all-validation` green (incl. the new §K + role-coverage).
- Before commit, **re-grep every anchor in this plan** — the line numbers above are as-of `0bf529c5`.
