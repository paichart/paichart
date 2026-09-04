# Terraform / Cloud IaC Pipeline — Implementation Plan **v2** (executable, review-folded)

> **Supersedes v1** (`IMPLEMENTATION-PLAN.md`, kept as the review-annotated record). All 4-specialist
> must-fixes baked into the WP items. Review: `cline_docs/reviews/terraform-iac-design-2026-06-29/REVIEW.md`
> (**~85 → ~92, SHIP-WITH-EDITS**). Roles REUSED (`pAIchartUniversalTemplate.ts` `config_change_author:456`,
> `change_reviewer:465`, `infra_change_architect:481`, `infra_state_harvester:491`) — only protocol + templates
> + the integration spec are new. Anchors grep-verified 2026-06-29. **Target ≥90 (security path).**

## 0. Objective (the seam)
Harvest read-only IaC state → design → author a **declarative HCL change as a PR** with validation FACTS + rollback →
independent review → approved-but-unapplied. `terraform apply` (the customer's governed run) is out-of-band. The moat:
**secret-dense state never enters an LLM.**

## 1. Cross-cutting decisions (build these FIRST — they reshape every WP)

| # | Decision | Rationale |
|---|---|---|
| **INV-HARVEST** | The harvester's primary read is **`terraform state pull`** (raw state JSON — **guaranteed zero-provider, zero-init, zero-lock**) + `state list` (addresses). Redact by the state's own **`sensitive_attributes`** markers (in-state, no provider needed). **Live `terraform plan` is an opt-in, sandboxed, drift-only exception** (CR-1d). | The design pivot. `show -json` may need provider schemas (init→provider download = the code-exec surface). `state pull` avoids it AND self-describes sensitivity. ⚠️ **Phase-4 must verify** `state pull` carries `sensitive_attributes` for our redactor + that any `show`/`plan` path is truly sandboxed. |
| **INV-NO-CODE-EXEC** | The verb-enum does NOT contain code execution. `plan`/`validate`/`init` run arbitrary code via `data "external"`, module/provider sources, arg-injection. Containment = WP-D's 4 controls (arg-confinement + sandbox + deny-set + state-pull default). | CR-1. *(Provisioners run at apply, not plan — out of scope.)* |
| **INV-LLM-NO-EXEC** | NO LLM-facing stage runs `plan`/`validate`/`init`/`tflint`. The Author emits **expected** validation facts (the commands + expected results), never run-results; the customer's governed CI runs them on the PR. | CR-2 (unanimous). `validate` needs `init` → launches provider binaries on LLM-authored HCL → RCE. |
| **INV-NO-RAW-STATE** | The Phase-0 skip path ("caller supplies state") accepts **redacted `state pull` JSON only — never raw `.tfstate`**; the protocol + HOWTO never instruct users to paste state. | CR-3 — raw-state paste defeats the moat. |

## 2. WP-A — the protocol document (`scripts/seed-protocol-prompts.ts`)
| # | Anchor | Change | Gate |
|---|---|---|---|
| A1 | new `const PIPELINE_TERRAFORM_IAC_PROTOCOL` (mirror the k8s const **:1496**) | The protocol body: self-provision lifecycle; the **4-phase decomposition table**; the harvest verbs **`stateList`/`statePull`** (default) + `plan` (sandboxed exception) — **and the Harvester must do many narrow, address-scoped reads** (anti-pattern = a whole-state pull dumped unscoped → the 8 KB cap clips it; idiom = `state list` → targeted per-address). **⚠️INV-LLM-NO-EXEC:** the **Author MUST NOT run `plan`/`validate`/`tflint`** — expected-plan-counts are a Harvester fact; the Author writes *expected* validation commands+results. **⚠️IM-1:** the **Reviewer** explicitly checks the expected plan is **destroy/replace-bounded** (no surprise `-`/`-/+`). **⚠️IM-2:** drift is per-hop — the **Architect** reconciles **in-scope** drift (with a Reviewer-visible callout) and **HALTs (needs-revision) on out-of-scope** drift, and **carries plan-bounds/drift/policy forward into its `finalResponse`** (§6 is one-hop; the Author is 2 hops from the Harvester). **⚠️IM-10:** the **Author restatement names the TF artifacts** — OPA/Sentinel/conftest policies + tag/naming standards + provider quotas + workspace (not k8s's LimitRange/PDB). Deliverable contract: HCL/module diff **as a PR** + expected plan + policy facts + rollback. **⚠️IM-7:** include a **Protocol-10 honest-residual** note (a fabricated/compromised TF service steers a confidently-wrong `approved`). | ts-node-compiles (NOT the seed tsconfig — false-clean); reads as a TF sibling of the k8s protocol |
| A2 | `PROTOCOLS[]` entry (mirror the k8s entry **:1636**) | `name:'terraform-iac-protocol'`; **⚠️IM-4 the `description` LEADS with TF-distinctive keywords** (HCL, `.tf`, terraform, workspace, module, provider, cloud resource, S3/SG/IAM) so the harness routes TF tasks here, not to k8s. **⚠️IM-8 full metadata parity:** `tags:['mcp','protocol','domain:provisioning']`, `category:'AUTOMATION'`, `complexity:'EXPERT'`, `isPublic:false`, `version`, `createdBy`. | `loadProtocols` finds it; named-load by exact `name` (`agentExecutionEngine.ts:1908`) |

## 3. WP-B — the 4 templates (`scripts/seed-terraform-iac-templates.ts`, new — mirror `seed-kubernetes-gitops-templates.ts`)
| # | Change | Gate |
|---|---|---|
| B1 | 4 templates, `metadata.protocol:'terraform-iac-protocol'` (**must EXACTLY match A2's `name`** — else silent protocol-less degradation, `:1915`), `model:'claude-haiku-4-5'`, category AUTOMATION: **IaC State Harvester** (`infra_state_harvester`/ORCHESTRATOR) · **Infrastructure Architect** (`infra_change_architect`/ARCHITECT) · **HCL Rollback Author** (`config_change_author`/DOCUMENTER) · **Plan Policy Reviewer** (`change_reviewer`/REVIEWER). **⚠️IM-5 NO `&` in names** (the k8s GS7 trap — `&` defeats exact-name `findFirst` → duplicate). **⚠️IM-6** set the Harvester's `modelParameters.maxToolTurns` explicitly (the large-estate address-scoped read loop needs it — `agentExecutionEngine.ts:767` reads it; default otherwise) — decide N, don't inherit by omission. | 4 templates Created; Haiku; `protocol:'terraform-iac-protocol'`; names `&`-free |
| B2 | **No `pAIchartUniversalTemplate` edit** — all 4 roles reused. TF nuance rides in the protocol (WP-A), not the shared role. The `infra_state_harvester` both-bases discipline is baked (verified) — preserved as long as B1 keeps `defaultRole:'infra_state_harvester'` + the `getRoleSpecificGuidance` replace. | seeded promptTemplate carries the right baked role guidance |

## 4. WP-C — ⛔ R10 Terraform secret families (`lib/agents/harness/redact-artifact-secrets.ts` `PATTERNS:59`)
| # | Change | Gate |
|---|---|---|
| C1 | **⚠️IM-3:** R10 is a **`report.md`-PROSE backstop only — K1 is the SOLE state defense** (a raw state secret as a JSON leaf loses key-context, won't match — say so in the header). Add **value-shape-gated** TF families AND a **JSON-quoted-key variant** (`^[ \t]*"(?:password\|token\|secret_key\|access_key\|client_secret\|private_key…)"[ \t]*:[ \t]*"…secret-shaped…"`) — the k8s bare-key anchor `^[ \t]*key` misses TF's `"key": "val"` machine output. Reuse the secret-shaped lookahead `(?=\S*[\d$.\/=+])`; use a token group that stops before the closing `"`. | raw secret redacted; HCL/JSON identifiers preserved |
| C2 | `scripts/test-security-invariants.ts` — new **§M** (mirror the R10 k8s block **:278-308**) | tfvars `password = "x"` + JSON `"secret_key": "AKIA…"` redacted; **FP controls**: `"resource_name": "my-bucket"` NOT redacted, `description = "the password policy"` NOT redacted; a negative-control proving a pattern *can* fail; bump the invariant count + banner. | `npm run test:security` green; FP controls hold |

## 5. WP-D — ⛔ the customer integration spec (`terraform-iac/TERRAFORM-SERVICE-INTEGRATION-SPEC.md`, new — mirror `K8S-SERVICE-INTEGRATION-SPEC.md`)
The read-only Terraform MCP service contract (pAIchart specs + self-certs; does NOT CI-test the customer's half — WS3):
1. **R1 verb-enum** — `statePull`/`stateList` (default, zero-provider) + `validate`(authored-HCL only, sandboxed) + `plan`(sandboxed, opt-in drift). **Deny-set (⚠️CR-1c):** `apply`/`destroy`/`import`/`state rm`/`state mv`/`taint`/`force-unlock`/`console`/`refresh`(writes state)/`state push`/`replace-provider`/`workspace new`/`workspace delete`/`output`/`graph`; **`init`/`get` are service-internal only**, never caller-invokable.
2. **⚠️CR-1a arg-confinement** — each verb's Zod is `.strict()`; **forbid** `chdir`/`working_dir`/`path`/`var`/`var_file`/`source`/module-override/`target`/`parallelism`/`TF_*`/env passthrough. The workspace/config-root is **resolved server-side from the verified `sub`**, never caller/LLM-supplied. `wrapWithSchema` validates the envelope only — the service's own `.parse()` is the inner guard.
3. **⚠️CR-1b sandboxed runner** — any `plan`/`validate` runs in an **ephemeral, network-egress-restricted** (provider registry + state backend only), **least-priv read-only-cloud-credentialed** sandbox; modules/providers **pinned/vendored** (`-plugin-dir`, private mirror, `init -upgrade=false`).
4. **K1 state-secret default-deny (the moat)** — `statePull` redacts by the state's `sensitive_attributes`; never emit raw secret values; `output` is denied (secret-bearing).
5. **⚠️IM-9 the service self-defends for ANY caller stage** — assume the Architect/Author/Reviewer *can* reach it (tool access is user-scoped, not template-scoped); R1/R2/R8 are the **sole** gate, never "only the Harvester calls it."
6. **`isError` denial channel** — out-of-policy verb → `isError:true` result (NOT a throw); reason text carries **no var/state values** (⚠️N).
7. **R2a JWKS identity** — RS256, `kid` rotation, reject `none`/HS256, no fallback identity; **per-service `aud` (RFC 8707)** named (⚠️N).
8. **⚠️IM-7 Protocol-10 honest residual** — a compromised/buggy service returning fabricated state → confidently-wrong `approved`; name the trust assumption (mirror k8s spec §8).

## 6. WP-E — HOWTO (`PIPELINE_HARNESS_GUIDE`; cached → needs pm2 restart + re-auth to land)
Add a **"Terraform / Cloud IaC *(protocol: terraform-iac)*"** section (mirror the k8s one): decomposition, the PR-deliverable + **the state-never-in-LLM line + ⚠️CR-3 never-paste-raw-state**, an example title (`"Add a versioning-enabled S3 bucket with a deny-public-ACL policy to the prod workspace (protocol: terraform-iac)"`), when-to-use (governed team), the validated note. Bump the HOWTO version. ts-node-verify.

## 7. Build order
**WP-C + WP-D first** (the ⛔ security floor) → re-confirm with sec-ops if WP-D drifts from the review → **WP-A** → **WP-B** → **WP-E** → seed (WP-A before WP-B; grep-confirm the protocol-name match) + pm2 restart + re-auth → **Phase 4 rig**.

## 8. Flagged decisions (resolve at build / Phase 4 — not blockers)
- **D1 — `state pull` empirical check (Phase 4):** confirm `terraform state pull` is truly zero-provider AND carries `sensitive_attributes` for the redactor; confirm any `show`/`plan` path is sandboxed per WP-D §3. If `state pull` lacks the sensitivity markers in practice, fall back to `show -json` *inside the CR-1b sandbox*.
- **D2 — the sandbox mechanism (Phase 4 rig):** LocalStack (free, AWS-emulation, no real creds) vs an ephemeral runner + private plugin mirror against a sandbox cloud account. LocalStack is the cheap rig default.
- **D3 — Harvester `maxToolTurns` value (IM-6):** pick N for the address-scoped read loop (k8s harness template uses 100 as precedent).

## 9. Out of scope → Phase 4
The validation rig: a throwaway Terraform workspace (LocalStack or sandbox account) + a read-only IaC MCP service implementing WP-D, analogous to the kind/cEOS rigs — stands up `state pull`/`state list` against real state, runs a `(protocol: terraform-iac)` pipeline, produces a real change report. After WP-A..E + sec-ops sign-off.
