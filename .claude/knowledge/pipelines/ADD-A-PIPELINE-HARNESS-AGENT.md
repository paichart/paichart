# Guide: Adding a New Pipeline Harness Agent / Domain

> **Status**: canonical procedure · **Created**: 2026-06-16 · **Owner**: template-system-specialist + pipeline-harness-specialist
>
> This is the end-to-end checklist for adding a new specialist agent (or a whole new domain) to the
> Pipeline Harness. It exists because **no single such guide existed before** — the procedure was
> reconstructed from precedents each time, which structurally skipped steps that live in files the
> precedent doesn't reference (notably the ROLE guidance — see the 2026-06-16 network-provisioning gap
> in §4). Follow this list in order; don't reconstruct from a seed file alone.

---

## 0. The 3-axis classification model (read first)

Every template is classified on **three independent axes** that answer different questions and are read
by different consumers. Getting these right is the core of authoring a good template.

| Axis | Question | Who reads it (runtime) | Example |
|------|----------|------------------------|---------|
| **`role`** (`defaultRole`) | What persona does the agent claim? | **The LLM** — its `ROLE_GUIDANCE_LIBRARY` entry is **baked into `promptTemplate` at seed time** (see §4); that frozen prompt is what the agent reads at runtime | `qa_test_engineer` |
| **`templateType`** | What *kind* of work does this do? | The harness P9 scope matcher | `REVIEWER` |
| **`category`** | What *domain* is this for? | Recommendations engine + API filters | `AUTOMATION` |

They are independent: a `Solution Architect` (ARCHITECT / DEVELOPMENT) and a `Senior Developer`
(BUILDER / DEVELOPMENT) share a domain but differ in type.

> **⚠️ The `role` axis is the one the LLM actually reads** — and it is the most commonly under-weighted.
> See §4. It is NOT just a label; its `ROLE_GUIDANCE_LIBRARY` entry is the persona the model is given.

`templateType` values (assign per the orchestrator protocol's type table): `ARCHITECT` (design),
`BUILDER` (code), `ANALYST` (analyze), `REVIEWER` (QA), `OPERATOR` (deploy/coordinate), `DOCUMENTER`
(deliverable docs), `ORCHESTRATOR` (calls external MCP services), `ACQUIRER` (gathers raw external events),
`GENERALIST` (fallback). The harness assigns by type (and, for domain protocols, by name).

---

## The ordered checklist

### 1. (New domain only) Seed the protocol
- Add a `PROTOCOLS[]` entry in **`scripts/seed-protocol-prompts.ts`** (the canonical, per-protocol-upsert
  seed — safe to re-run; it does `findFirst`→update/create, no wipe).
- **`promptText: UNIVERSAL_AGENT_RULES + YOUR_PROTOCOL`** — the universal rules are prepended at seed time;
  do not duplicate them.
- **`tags` must include the literal `'protocol'`** — required for the legacy `loadProtocols: true`
  load-all path (ALL `tag=protocol` ACTIVE prompts, `take: 10`, name-ordered — now the ROLLBACK
  mode) and for protocol tooling. Under the live `loadProtocols: 'composed'` mode (2026-08-17) the
  delta is loaded BY NAME from the task's stamp, and the base by the `protocol-base` tag.
- **The title token IS the router now.** Since composed injection the platform resolves
  `(protocol: <name>)` from the title ONCE at first execution and stamps it — the harness never
  selects among protocols (pre-2026-08-17 the harness LLM matched descriptions; that era is over).
  Word the `description`/`useCase`
  to route your intent here, and have the task title carry an explicit `(protocol: <name>)` token.
- Protocols are **plain markdown, injected verbatim** — `{{tokens}}` are NOT substituted on this path.
  Resolve every placeholder to a literal before seeding.
- Escaping trap: inside the TS template literal, escape backticks as `` \` `` and `${}` as `\${}`.
  **Typecheck locally** (`tsc --noEmit` on the file) — a TS2796 cascade surfaces at the first array item,
  not the offending line.
- **QA/reviewer gate wording (2026-07-14, verdict-misread fix):** if your domain has a reviewer phase, its
  SYNTHESIZE approval rule must READ the reviewer's **terminal `## VERDICT:` block** — "approved only if the
  terminal block says APPROVED with `Blocking issues: none`; the terminal block supersedes
  all earlier prose; an issue not carried into it was retracted and is NOT blocking. The Confidence NUMBER is
  a recorded fact, NOT a gate input (2026-07-18 calibration study — do not add a ≥ N conjunct)" — and the reviewer bullet
  must say *"Ends its response with the terminal `## VERDICT:` block"*. **REFERENCE the block; NEVER redefine
  the grammar** — the one canonical definition lives in the `change_reviewer` ROLE guidance (GS8 single-source;
  `test-parse-verdict.ts` fails the build if a protocol re-defines the alternation). Copy the live network/k8s/
  terraform SYNTHESIZE sections, not the pre-fix draft.

### 2. Author the templates
- New file **`scripts/seed-<domain>-templates.ts`**, mirroring `scripts/seed-artifact-synthesis-templates.ts`
  (idempotent `findFirst`→update/create; per-domain seed keeps the shipped base set unpolluted).
- Per template set: `name`, `description` (should say *"Reads <protocol-name> before beginning work."*),
  `category`, `templateType` (per §0), `defaultRole`, `tags`, `timeout`, `metadata.modelParameters`
  (`anthropic_sdk` / **`AGENT_MODELS.<tier>`** / `temperature 0.3` / `useSystemPrompt: true` /
  `maxRetries: 2`) — ⚠️ **import the tier, never a literal**:
  `import { AGENT_MODELS } from '../lib/agents/model-tiers'`. Pick `infra` for device/state-reaching
  domains, `synthesis` for cognition/writing work (2026-08-09: the literal was hoisted out of all 9
  seed scripts precisely so a new domain cannot re-introduce a 10th copy),
  `hasModelParameters: true`, `modelParamsVersion`, and **`metadata.protocol: '<protocol-name>'`** (the
  engine injects that one protocol into this specialist's system prompt).
- `complexity` (if set): `AgentComplexity` is `SIMPLE | MEDIUM | COMPLEX | EXPERT` — **there is no `HIGH`**.
- Deliverable/QA wiring is **NOT** in the template — see §5.

### 3. (Provisional work) Tag it
- If this is a spike / not-yet-blessed: tag templates `spike`/`provisional`, set the protocol
  `isPublic: false`, and add a loud `// ⚠️ PROVISIONAL — remove after …` comment. Do **not** document it
  in the user-facing guides (`HOWTO-use-pipeline-harness`, the operational catalog) until it's promoted.

### 4. ⭐ ROLE — add a `ROLE_GUIDANCE_LIBRARY` entry for EACH new `defaultRole`
> **This is the step the seed-mirroring approach silently skips**, because the entries live in a DIFFERENT
> file than the seed (`lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts`). The 2026-06-16
> network-provisioning spike authored 4 templates and missed this until an explicit re-ask.

- For each new role, add a `ROLE_GUIDANCE_LIBRARY` entry (**Pattern #44 GS2**: 7–10 actionable bullets,
  including **`**Deliverable**:`** and **`**Coordination**:`** subsections — the contract audit enforces this).
- **Why it matters + the mechanism:** at seed time the script bakes the guidance into the stored
  `promptTemplate` (`BASE_TEMPLATE.replace('${roleSpecificGuidance}', getRoleSpecificGuidance(role))`); that
  frozen prompt is what the agent runs (the runtime Universal-Template path that would re-read the library was
  deleted, commit `4077c049`). So `getRoleSpecificGuidance(role)` falling back to a thin GENERIC template for
  an unknown role **silently bakes weak guidance — no error**. Two consequences: (1) a missing entry ships a
  quietly-degraded agent; (2) **changing a role entry requires RE-SEEDING** the affected templates — the live
  row holds the old bake until then. ("Provisioning-only / dead at runtime" ≠ unimportant; it means *baked*.)
- **Chain consumers** (any specialist that reads a predecessor's output) MUST carry the **chained-context
  discipline** in their entry: *read your input from §6 Pipeline Context; do NOT re-fetch it via
  `perform(action:'agent.results', verbose:true)`* — that loads the upstream's full result.json into your
  toolCalls, hits the 50KB truncation cap, and corrupts what the NEXT agent reads from you (the empirically
  observed 28.6% truncation failure mode). The base template's generic "prefer §6" line is NOT enough — name
  the specific tool call.
- **§6-PRODUCING tool-using harvesters** (a Phase-0 node that REACHES an external service via `services.call`
  and structures its output for downstream §6) are the mirror of chain-consumers, and their entry composes
  from **TWO** existing bases — not one: **`artifact_harvester`** (the §6-producing structure +
  escalate-don't-fabricate-on-empty) **AND `synthesis_source_acquirer`** (the **tool-loop** discipline:
  iterative scoped `services.call` — call→inspect→decide-next, NOT `services(action:'workflow.execute')`;
  succeed-with-partial; a `## … Summary` header; a count/scope budget). The tool-loop discipline lives in
  **`synthesis_source_acquirer`**, NOT `artifact_harvester` — basing a tool-using harvester on
  `artifact_harvester` alone under-specifies the read loop. (k8s `infra_state_harvester`, 2026-06-27 —
  harness-owner correction; cf. `cline_docs/reviews/kubernetes-gitops-design-2026-06-27/`.)
- **QA/reviewer roles — REUSE `change_reviewer`; a new reviewer key needs THREE wirings.** All three live
  domains (network/k8s/terraform) share the neutral `change_reviewer` role — the domain framing rides in the
  protocol, not the role — and that reuse is what makes the terminal-verdict machinery work for free. If you
  genuinely need a NEW reviewer role key: (a) its guidance must carry the same terminal `## VERDICT:` block
  section (grammar identical — the parser is token-locked); (b) **add the key to `REVIEWER_ROLES` in
  `lib/agents/harness/parse-verdict.ts`** — otherwise the structured `reviewerVerdict` fact is never emitted
  for that domain and both the SYNTHESIZE truncation fallback and the qualityGate mismatch guard go blind;
  (c) `test-parse-verdict.ts`'s coupling test asserts every `REVIEWER_ROLES` entry's guidance contains the
  marker — run it. (2026-07-14 verdict-misread fix; `cline_docs/reviews/harness-synthesize-verdict-misread-2026-07-14/`.)
- **Legitimately generic roles** (guidance comes from elsewhere, e.g. a harness meta-agent driven by an
  injected protocol, or a Phase-0 node with no predecessor) don't need an entry — but you must add them to
  `INTENTIONALLY_GENERIC_ROLES` in `scripts/audit-role-guidance-coverage.ts` **with a reason**. That makes the
  omission a documented decision instead of a silent gap.
- **CI enforces both:** `validate:role-guidance` (entry shape) + `validate:role-guidance-coverage` (every
  seeded role has an entry or a documented exemption). Both run in pre-commit and `test:all-validation`.

### 5. Deliverable / QA wiring is set at RUNTIME by the harness, not in the template
- The harness (in CREATE mode) sets `metadata.deliverableSourceTaskId` on itself → the deliverable-producer
  child (its `report.md` is extracted as the customer deliverable), and `suppressDefaultReportMd` on the QA
  child (so the reviewer emits `result.json` only). Templates only need the correct `templateType`.

### 6. Confinement (`selectedTools`) — usually skip
- `metadata.mcpToolConfiguration.selectedTools` (consolidated string names) is the *offer-surface* control.
- **It does NOT reach the runtime grant on the harness `agent.assign` path today** — the engine reads
  `task.mcpContext.tools`, which `agent.assign` never populates → empty → defaults to **all six** consolidated
  tools. Only an explicit `agent.configure` populates it, which the harness doesn't call. Real enforcement
  needs the parked track-1 engine gate. So unless you've built that, `selectedTools` is decorative — omit it
  and let templates inherit the default all-six grant.

### 7. Seed to the target environment
- `.ts` files deploy via CI on push (docs/`.md` are deploy-ignored). **Back up first** (targeted `pg_dump -t
  agent_prompt_library -t agent_templates`), then run the seeds:
  `NODE_ENV=production npx ts-node --project prisma/tsconfig.seed.json scripts/seed-<...>.ts`.

### 8. Run a pipeline
- Create a `PIPELINE` task (title carries the `(protocol: <name>)` token; descriptor/inputs in the body),
  assign the **`Pipeline Harness`** template (promotes the task to PIPELINE), then **`agent.execute`** to kick
  CREATE — the harness task is NOT auto-queued on assign (only specialist children are; the harness needs an
  explicit execute or the dep-completion retrigger). Pass `parameters: { taskId, waitForCompletion: false }`
  for a prompt return with the executionId (2026-07-14) — the default polls to completion (up to 19 min),
  which a short client tool-timeout surfaces as a spurious error while the run streams on server-side. Either
  way, check `task.context` for the child stage + comments.

---

## Gotchas (all observed, not hypothetical)
- **Silent role fallback** (§4) — the #1 trap. CI now catches it.
- **`selectedTools` is a no-op on the assign path** (§6).
- **`AgentComplexity` has no `HIGH`** (§2) — use `EXPERT`.
- **Protocols aren't variable-substituted** when injected — resolve `{{tokens}}` to literals (§1).
- **PIPELINE tasks aren't auto-queued on assign** — explicit `agent.execute` (§8).
- **10-protocol injection cap** — once >10 `tag=protocol` ACTIVE prompts exist, some silently won't inject.
- **Template-literal escaping** in seed files — `` \` `` / `\${}`; typecheck locally before push.
- **A new reviewer role key without a `REVIEWER_ROLES` entry silently disables the verdict fact** (§4) —
  the pipeline still runs, but result.json carries no `reviewerVerdict` and the mismatch guard can't fire.
- **Result.json fields an orchestrator must see go BEFORE `finalResponse`** — SYNTHESIZE reads children
  through head-slice caps (fetch 50KB → tool-loop 8KB); a signal after a long finalResponse is invisible
  (the 2026-07-14 verdict-misread mechanism; order pinned by `test-execution-artifacts-parity.ts`).

## References
- Worked example (provisional): the **network-provisioning** spike — `.claude/knowledge/pipelines/network-provisioning/`
  (`TEMPLATE-AUTHORING-SPEC.md`, `network-provisioning-pipeline.md`, the spike Decision Log).
- Worked example (meta-domain, 2026-07-15): the **pov-program** domain — a program OF pipelines authored per this
  checklist (`pov-program-protocol` + `program_architect` role + `scripts/seed-program-templates.ts`); its CREATE
  spans TWO harness executions (PLAN → PLAN-SPAWN) because the interface contract is computed at runtime — see
  `cline_docs/reviews/program-architect-design-2026-07-15/design-proposal.md` and the protocol const's header comment.
- Pattern #44 (8 Gold Standards): `.claude/knowledge/patterns/agent-template-gold-standard-pattern.md`.
- Tool-grant flow: `.claude/knowledge/domain/mcp/tool-assignment-flow.md`.
- Protocol injection: `.claude/knowledge/domain/harness/pipeline-harness-library.md`.
- Shape precedent: `scripts/seed-artifact-synthesis-templates.ts` + `scripts/seed-protocol-prompts.ts`.
- CI guards: `scripts/audit-role-guidance-contract.ts` (shape) + `scripts/audit-role-guidance-coverage.ts` (coverage).
