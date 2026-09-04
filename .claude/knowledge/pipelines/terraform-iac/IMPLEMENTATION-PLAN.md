# Terraform / Cloud IaC Pipeline — Implementation Plan

> Anchor-keyed build spec (subsumes Phase 3). Mirrors the k8s build, **minus role creation** — all 4 roles
> already exist (`pAIchartUniversalTemplate.ts`: `config_change_author:456`, `change_reviewer:465`,
> `infra_change_architect:481`, `infra_state_harvester:491`). Design: `terraform-iac-pipeline.md`. Anchors
> grep-verified 2026-06-29. **The ⛔ security floor (WP-C/WP-D) is the make-or-break — the sec-ops review gates it.**
> Each item: file · anchor (line) · change · gate. Build order at the bottom.

## ⚠️ REVIEW OUTCOME (2026-06-29) — read before building
4-specialist review (sec-ops 78→92, prompt-construction 86, template-system 88, pipeline-harness 89) →
**SHIP-WITH-EDITS, ~85→~92.** Full synthesis + traceability: `cline_docs/reviews/terraform-iac-design-2026-06-29/REVIEW.md`.
**The design pivot the review produced — fold it everywhere:** the safe harvest is **`terraform show -json` /
`state list` over a state snapshot/replica, NOT live `terraform plan`** (show/state-list launch no providers →
zero code-exec, zero lock); live `plan` is an **opt-in, sandboxed, drift-only exception**. So the Harvester's
verb set is `show`/`stateList` first, `plan` exceptional. Must-fixes before the Phase-6 build:
- **CR-1 (WP-D):** the verb-enum does NOT contain code execution (`external`/module/provider/arg-injection) — add
  arg-confinement (`.strict()`, server-side workspace binding, no `chdir`/`var`/`source`/`target`/`TF_*`), a
  sandboxed no-egress runner, a fuller deny-set (`console`/`refresh`/`output`/`init`-as-caller…), and CR-1d (the pivot).
- **CR-2 (WP-A/WP-B):** the LLM-facing stages must NOT run `plan`/`validate`/`tflint` (locks state / runs provider
  binaries on LLM-authored HCL → RCE). Strike "local-only validate/tflint" as a safety property.
- **CR-3 (WP-A/WP-E):** forbid the raw-`.tfstate` escape hatch (the Phase-0 skip path) — redacted `show -json` only, never raw state, never tell users to paste state.
- **IM-1** Reviewer destroy/replace-bounded check · **IM-2** drift per-hop + scope-gated (out-of-scope HALT) · **IM-3** R10 = prose-backstop-only/K1-sole-state-defense + JSON-quoted-key families + redact-by-`sensitive_values` · **IM-4** TF-distinctive routing description + exact protocol-name match · **IM-5** drop `&` from 2 template names · **IM-6** decide harvester `maxToolTurns` · **IM-7** D1 Protocol-10 residual · **IM-8** A2 full metadata parity · **IM-9 (WP-D)** the read-only service must **self-defend assuming ANY pipeline stage may call it** (R1/R2/R8 are the sole gate — confinement is user-scoped, not template-scoped; never "only the Harvester calls it") · **IM-10 (WP-A)** the Author restatement must **name the TF constraint artifacts** (OPA/Sentinel/conftest policies + tag/naming standards + provider quotas + workspace), not a one-liner.
- **Open Qs resolved:** Q1 `-lock=false` is the floor (no mandatory replica), default to snapshot; Q2 `state list`+address-scoped `show -json` redacted by `sensitive_values`; Q3 flag-don't-absorb, halt on out-of-scope drift.
- **Side action:** the `template-system-specialist` config is **stale** (says 8-value enum; now 9 `ACQUIRER`; template inventory outdated) — maintenance-pass pairing-diff, separate from this build.

## WP-A — the protocol document
| # | File · anchor | Change | Gate |
|---|---|---|---|
| A1 | `scripts/seed-protocol-prompts.ts` — new `const PIPELINE_TERRAFORM_IAC_PROTOCOL` (mirror `PIPELINE_KUBERNETES_GITOPS_PROTOCOL` **:1496**) | The protocol document: the self-provision lifecycle (read-only TF service: `plan`/`show`/`stateList`/`validate`), the 4-phase decomposition table, the TF sharp edges (⛔ verb-enum, `-lock=false`/read-replica contract, **K1 state-secret default-deny**, drift-as-input, **the Author restates the harvested policy/constraint baseline** — k8s NEEDS-REVISION lesson), the deliverable contract (HCL/module diff **as a PR** + expected `plan` + policy facts + rollback), the seam (never apply/destroy). | `ts-node` compiles (NOT the seed tsconfig — false-clean); protocol reads as a sibling of the k8s one |
| A2 | same — `PROTOCOLS[]` entry (mirror the k8s entry **:1636**) | `{ name:'terraform-iac-protocol', description, promptText: UNIVERSAL_AGENT_RULES + PIPELINE_TERRAFORM_IAC_PROTOCOL, tags:['protocol'], … }`. | `loadProtocols` finds it (tag `protocol`, ACTIVE) |

## WP-B — the 4 templates (roles REUSED — no `pAIchartUniversalTemplate` change)
| # | File · anchor | Change | Gate |
|---|---|---|---|
| B1 | `scripts/seed-terraform-iac-templates.ts` *(new — mirror `seed-kubernetes-gitops-templates.ts`, esp. `COMMON_MODEL_PARAMS:57`)* | 4 templates, each `metadata.protocol:'terraform-iac-protocol'`, `modelParameters.model:'claude-haiku-4-5'`, category AUTOMATION: **IaC State Harvester** (`defaultRole:'infra_state_harvester'`, ORCHESTRATOR, `maxToolTurns` for the scoped read loop) · **Infrastructure Architect** (`infra_change_architect`, ARCHITECT) · **HCL & Rollback Author** (`config_change_author`, DOCUMENTER) · **Plan & Policy Reviewer** (`change_reviewer`, REVIEWER). | seed → 4 templates Created; `template(action:list)` shows them, Haiku, `protocol:'terraform-iac-protocol'` |
| B2 | — | **No role-guidance edit.** Confirm the reused roles' baked guidance fits Terraform (esp. `infra_state_harvester` = both bases per the harness-owner rule; `config_change_author` neutral). If a TF-specific nuance is needed, it goes in the PROTOCOL (A1), not the shared role. | the seeded promptTemplate carries the right baked role guidance |

## WP-C — ⛔ R10 Terraform secret families (security floor)
| # | File · anchor | Change | Gate |
|---|---|---|---|
| C1 | `lib/agents/harness/redact-artifact-secrets.ts` — `PATTERNS[]` **:59** (after the k8s/AWS families **:77**) | Add TF secret-VALUE families, **value-shape-gated** like the k8s ones (no bare-`:`/`=` FP): HCL/tfvars `<key> = "<secret>"` for the secret-key set, state `"sensitive_attributes"` markers, provider-cred keys (`access_key`/`secret_key`/`token`/`client_secret`/`private_key`), `AKIA` already covered. Reuse the secret-shaped lookahead `(?=\S*[\d$.\/=+])`. | raw secret redacted, prose/HCL identifiers preserved |
| C2 | `scripts/test-security-invariants.ts` — new **§M** (mirror the R10 k8s block **:278-308**) | TF R10 checks: tfvars `password = "x"` redacted; HCL `secret_key = "AKIA…"`/`token` redacted; state sensitive value redacted; **FP controls** — `resource "x" { name = "y" }` NOT redacted, `description = "the password policy"` NOT redacted. Update the invariant count. | `npm run test:security` green; the FP controls hold |

## WP-D — ⛔ the customer-service integration spec (WS3 — pAIchart specs, customer implements + self-certs)
| # | File · anchor | Change | Gate |
|---|---|---|---|
| D1 | `terraform-iac/TERRAFORM-SERVICE-INTEGRATION-SPEC.md` *(new — mirror `kubernetes-gitops/K8S-SERVICE-INTEGRATION-SPEC.md`)* | The read-only Terraform MCP service contract: **R1** the `plan`/`show`/`stateList`/`validate` verb-enum (exclude apply/destroy/import/state-rm/mv/taint); **the `-lock=false`/state-read-replica requirement** (plan must not block a real apply); **K1** state-secret redaction (`show -json` redacted / `state list` addresses — NEVER raw state or `sensitive` values); the **`isError` denial channel** (out-of-policy verb → isError result, not a throw); **R2a** JWKS per-user identity (the production bar). pAIchart specs + self-certs; does NOT CI-test the customer's half (the WS3 lens). | a customer can implement a conformant read-only TF service from this doc alone |

## WP-E — HOWTO (client-facing; needs pm2 restart + re-auth to land)
| # | File · anchor | Change | Gate |
|---|---|---|---|
| E1 | `scripts/seed-protocol-prompts.ts` — `PIPELINE_HARNESS_GUIDE` (the Kubernetes/GitOps section is the model) | Add a **"Terraform / Cloud IaC *(protocol: terraform-iac)*"** use-case section: decomposition, the PR-deliverable + plan-bound contract, the read-only TF service + state-never-in-LLM line, an example title (`"Add a versioning-enabled S3 bucket with a deny-public-ACL policy to the prod workspace (protocol: terraform-iac)"`), when-to-use, governed-team note. Bump the HOWTO version. | ts-node-verified; section reads parallel to the k8s one |

## Out of scope here → Phase 4 (separate)
- **The validation rig** — a throwaway Terraform workspace (LocalStack or a sandbox cloud account) + a read-only IaC MCP service implementing WP-D, analogous to the kind/cEOS rigs. Stands up `plan`/`show` against real state, runs a `(protocol: terraform-iac)` pipeline, produces a real change report. Build after WP-A..E + the sec-ops sign-off.

## Build order
**WP-C + WP-D first** (the ⛔ security floor — they define what "read-only" *means* for TF and gate everything) → **sec-ops review** (confidence gate) → **WP-A** (protocol) → **WP-B** (templates) → **WP-E** (HOWTO) → seed + Phase 4 rig.

## Open questions (resolve in the review)
- **Q1 — plan side-effects:** is `-lock=false` acceptable to the customer, or is a state read-replica mandatory? (A live `plan` lock could collide with their CI apply.) sec-ops + dev-ops call.
- **Q2 — K1 granularity:** harvest `show -json` redacted (rich shape, must redact well) vs `state list` + targeted `show` per address (leaner, less secret exposure)? The redaction-confidence vs design-richness tradeoff.
- **Q3 — drift authority:** when plan shows drift, does the Architect *reconcile* it into the change or *flag-and-stop*? Default: flag + design around, never silently absorb (could mask a manual prod change).

## Specialist review (the confidence gate — focused, not the k8s 6-panel)
The novel surface is the TF security floor + the protocol; roles + harness mechanics are proven twice. Recommend **3**:
- **`sec-ops-specialist`** — WP-C/WP-D: the verb-enum, the `-lock=false`/read-replica contract, the K1 state-secret default-deny (the moat), the R10 TF families. **Primary gate.**
- **`prompt-construction-specialist`** (or `template-system`) — WP-A/WP-B: the protocol document + the 4 templates reusing the roles correctly (esp. the harvester's both-bases discipline + the Author's policy-restatement).
- **`pipeline-harness-specialist`** — the decomposition fit + the WS3 shared-responsibility split (D1) + Protocol-10 (any new client-facing signal).
Run each discovery-first; target ≥90 (security path).
