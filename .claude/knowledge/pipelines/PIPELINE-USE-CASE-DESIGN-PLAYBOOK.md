# Pipeline Use-Case Design Playbook

> **Purpose**: a repeatable procedure for taking a *"could the Pipeline Harness do X?"*
> idea from triage → design → draft → validation → shipped protocol. Capture it once,
> reuse it for every future harness use case.
>
> **Who runs it**: pipeline-harness-specialist (coordinates), pulling in the domain
> specialists named at each gate.
>
> **Output**: a `pipelines/<use-case>/` directory with a design proposal + protocol draft
> (RFC skeleton, per [`README.md`](./README.md)), and — once validated — a seeded protocol
> + templates.
>
> **Sibling doc**: this playbook is the *design / extend* process. For the **runtime mechanics**
> (how the harness executes — the three modes, context chaining, confidence, dependencies,
> troubleshooting), see [`PIPELINE-HARNESS-USER-GUIDE.md`](./PIPELINE-HARNESS-USER-GUIDE.md).

## Reference implementations — study both

Two **shipped** examples, of different *shapes*, anchor this playbook:

- **`artifact-synthesis-protocol` — the PROVEN, shipped end-to-end example.** It went
  through this entire procedure and is live: the protocol entry in
  `scripts/seed-protocol-prompts.ts`, templates in `scripts/seed-artifact-synthesis-templates.ts`
  (e.g. `Editorial Writer`, `Publication Reviewer`), the Editor/Reviewer deliverable-QA split,
  and a conditional Phase 0 (Source Acquisition). **This is what a *completed* Phase 6 looks
  like — read it to see the destination.** It was created from a real working session; the
  playbook generalizes *its* path.
- **`network-provisioning/` — the SECOND shipped end-to-end example (2026-06-25), and the
  *device-reaching* one.** Went through this whole procedure and is live: protocol + 4
  templates + role-guidance promoted and **seeded on prod**, a HOWTO section, the
  **self-provision (register → use → delete) + descriptor / WS4 integration-spec** model that
  artifact-synthesis doesn't have, and **real-device validation against a live Arista cEOS
  lab** (the R9/R10 guards validated against real config). Its fresh-session kickoff prompts
  (`SPECIALIST-REVIEW-PROMPT.md`, `REAL-DEVICE-VALIDATION-PROMPT.md`) are the worked examples
  for Appendix A.

> When a step is unclear, look at the shipped examples: **artifact-synthesis** for the
> pure-cognition shape, **network-provisioning** for anything *device / external-system
> reaching* (self-provision, descriptor, launch/credential boundary).

- **`pov-program` — the META-DOMAIN exemplar (2026-07-15, Session B): a program OF pipelines.**
  Authored per this playbook's own procedure with the specialists being *pipelines* — one net-new
  role (`program_architect`), everything else reused (harness template, `change_reviewer` Node C,
  `Technical Writer` producer). Study it for: a **human plan-approval gate** (template-less ACTION
  dependency node), a runtime-computed **interface contract** carried on a structured channel
  (CC7 `interfaceContract` at `task.create`, rendered as a BINDING §6 block), a **fact-only
  program gate** (`programReleasable` = AND over child `qualityGate`/`reviewerVerdict`/chained-coverage
  facts, never chained prose), and a CREATE that spans **two harness executions** (PLAN → PLAN-SPAWN)
  because the contract doesn't exist until the Architect runs. Design record:
  `cline_docs/reviews/program-architect-design-2026-07-15/design-proposal.md` (v1.2).

---

## Source-of-truth files (anchor every promotion to these *categories*)

Seed scripts are the source of truth — never hand-edit the DB. **Don't hardcode a
file list here** (it drifts — there are ~19 `seed-*.ts` files and counting). Discover the
live set and pick the ones your use case touches:

```bash
ls scripts/seed-*.ts        # the live, authoritative list
```

The stable *categories* (which file is which is self-evident from the name):

| Artifact category | Typical file(s) | Never |
|-------------------|-----------------|-------|
| Protocol prompt text | `seed-protocol-prompts.ts` (`PROTOCOLS[]`) | hand-edit prompts in the DB |
| Agent templates | `seed-agent-templates.ts` (+ domain template seeds, e.g. `seed-artifact-synthesis-templates.ts`, `seed-harness-template.ts`) | hand-create templates in the DB |
| Workflows | `seed-named-workflows.ts`, `seed-example-workflows.ts`, `seed-mcp-workflow-orchestration-template.ts` | author multi-step orchestration ad-hoc |
| MCP services | `seed-<service>-service.ts` (per external service) | register persistent prod services by hand |
| Operational prompts / guides | `seed-operational-prompts.ts` (incl. `HOWTO-register-service`) | document a procedure outside its `/prompt` |
| Shipped-harness invariants | `.claude/knowledge/discoveries/pipeline-harness-discovery.md` | assume; run the discovery |

### Authoring vs runtime — and what an agent can actually reach

A procedure has up to **three distinct audiences**; do not conflate them.

| Audience | Reaches knowledge via | Can discover/run `/prompt` guides? |
|----------|-----------------------|------------------------------------|
| **You, design-time** | the filesystem — reads/edits the seed script | n/a |
| **Human / MCP client** (Claude Desktop, ChatGPT, you-as-client) | MCP — `list_prompts()` → `prompt_command("/prompt <name>")` | ✅ yes |
| **Agent execution** (harness child) | **only the injected protocol + template prompt text** | ❌ **no** |

**Verified 2026-06-16 (`agentExecutionEngine.ts:477`, mirrored in stream/route):** an agent
execution's entire MCP tool surface is the six consolidated tools — `project`, `perform`,
`analytics`, `template`, `services`, `registry`. **`list_prompts` / `prompt_command` are
NOT in that set** (they're client-facing only). An agent **cannot** discover or read a
seeded `/prompt` guide at runtime, and it has no repo filesystem access either.

Consequences for design:
- A procedure an **agent must execute at runtime** must be **written into the injected
  protocol prompt text** (or the template) — that's the only inbound knowledge channel the
  agent has. And the action it needs must be one of the six consolidated tools (e.g.
  `registry(action: "register" / "delete")` is reachable; a `/prompt` guide is not).
- A guide for a **human or MCP client** can be a seeded `/prompt` (e.g.
  `HOWTO-register-service`), discoverable via `list_prompts` — but that serves humans/clients,
  never an agent execution.
- **Design docs** (this audience) cite the seed script as source of truth.

> Rule of thumb: **agent executes it** → bake the steps into the protocol/template text +
> confirm the action is in the consolidated six. **Human/client reads it** → a seeded
> `/prompt` is fine. **You author it** → the seed script.

### Transient (per-cycle) registered artifacts — register → use → **delete**

If your use case registers services/tools/workflows that are relevant to **one run only**
(e.g. provisioning hundreds/thousands of devices, where a permanent registry row per device
is pure bloat), treat the registration as **ephemeral and clean it up**:

- Create/update at cycle start, **delete at cycle end** — `registry(action: "register" /
  "update" / "delete")`. The full procedure is the **`HOWTO-register-service`** prompt in
  `seed-operational-prompts.ts`.
- Contrast with *persistent* registration (the per-external-service seed scripts above),
  which is permanent infrastructure and is **not** cleaned up.
- The deciding question: *is this artifact infrastructure (persist + seed) or scaffolding
  for one cycle (register, use, delete)?* Scaffolding must own its teardown — otherwise the
  registry bloats one row per device per run.
- **Device / external-system-reaching use case → drive the per-cycle registration from a
  `descriptor`.** The descriptor is a JSON service definition the task points at — supplied
  inline, or at a URL the harness fetches via the **browser automation service**
  (`scrape_page`), since pAIchart has **no generic URL-fetch tool** (so the browser service is
  the intentional, only fetch path — say so in the protocol text, or the LLM hallucinates a
  generic fetcher). The descriptor **IS** the `registry(register)` payload —
  `{name, description, endpoint, category, capabilities:{tools:[…]}}` (DECLARE model: no separate
  "discover" step). **`description` is required** — registry rejects a `register` without one
  (min 10 chars), so omitting it makes the harness's first self-provision fail + retry (live finding). The customer authors it; the harness self-provisions it; tools must be **read-only**.
  The normative contract the descriptor's service must satisfy is the **WS4 device-service
  integration spec** (`network-provisioning/DEVICE-SERVICE-INTEGRATION-SPEC.md`: R1 read-only
  verb-enum, R2a credential resolution, R8 scope, R10 self-redaction, + JWKS / per-service
  audience). Mirror it for any new device-reaching use case. (network-provisioning is the
  worked example — its `REAL-DEVICE-VALIDATION-PROMPT.md` ran this end-to-end.)

---

## Phase 1 — Fit triage (the seam test) 🚦

Decide *whether* and *how much* of the use case the harness should own. **Do this before
any decomposition** — it's the gate that prevents the actuation-in-the-loop anti-pattern.

1. **Split the use case into two halves:**
   - **Cognition** — knowledge work that produces *artifacts* (analysis, design, generated
     text/config, review). Idempotent: re-running regenerates the same kind of output.
   - **Actuation** — anything with an **external side effect** (mutating infra, sending
     mail, moving money, writing to a system of record).
2. **Apply the seam rule:** the harness's safety model (reactor re-entry, retrigger chains
   bounded by Guard 8, confidence + anti-fabrication) assumes children do **idempotent,
   re-runnable** work. So:
   - **Cognition half → harness.** Always a candidate.
   - **Actuation half → OUT of the autonomous loop.** It goes to a human-gated consumer
     (Claude Code) or a deterministic executor (Ansible/Terraform/etc.) that has real
     convergence + rollback. The harness produces an *approved-but-unapplied* deliverable.
3. **Reject only if** there is no cognition half worth automating (the use case is *pure*
   actuation with no planning/synthesis value).
4. **Output of this phase:** one paragraph naming the two halves + the **terminus** (what
   the harness produces, where actuation happens). This becomes the design doc's Objective.

> Reference incident-class: regenerating a document twice is harmless; re-running `conf t`
> is not. If the "work" can't be safely retried by a reactor, it's actuation — keep it out.

> **The seam generalizes across domains.** IaC/Terraform, Kubernetes/GitOps, DB-schema,
> firewall/DNS — all share this shape (read-only harvest → declarative design →
> approved-but-unapplied artifact → a *convergent* executor outside the loop), and some fit
> *better* than physical devices (Terraform `apply` / GitOps reconcile are native convergent
> actuators with rollback). For worked per-domain fit-triages + what transfers vs what's
> domain-specific, see [`PIPELINE-DOMAIN-FIT-CATALOG.md`](./PIPELINE-DOMAIN-FIT-CATALOG.md).

---

## Phase 2 — Decomposition design ✏️

Mirror the shipped `artifact-synthesis-protocol` shape.

1. **Define the agent persona set** (the *sketch*) — this is the
   **pipeline-harness-specialist's** step: name 3–5 child specialists in a table
   (`template name | type | tool surface | produces | depends-on`). Each row is a *persona* —
   a specialist role the pipeline needs. Keep it to 3–7 tasks total (incl. the harness);
   don't over-decompose. You *propose* the personas here; **confirmation + authoring of them
   is owned downstream** (Phase 6) by template-system + prompt-construction.
   - **⚠️ REUSE ROLES BEFORE MINTING (the anti-duplication rule).** Each persona maps to a
     `defaultRole` keyed into `ROLE_GUIDANCE_LIBRARY` (`lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts`).
     **Before adding a new role key, grep the library** — the deliverable/QA-split roles are the
     **most-reusable across use-cases**. BUT:
     - **⚠️ TRACE EACH REUSE PICK TO THE ROLE'S ACTUAL TEXT, NOT TO A CLAIM THAT IT'S NEUTRAL.**
       (This is Protocol 10 fact-vs-verdict operating on the *reuse doc itself* — the k8s review,
       2026-06-27, caught this exact playbook line over-claiming.) "Neutral-looking" roles carry
       domain vocabulary: **`change_reviewer` is the closest to neutral** (the canonical QA-gate —
       the terminal `## VERDICT:` block [grammar canonical HERE, protocols only reference it] +
       named blocking issues + facts-not-prose + `suppressDefaultReportMd`; it is also the sole
       member of `REVIEWER_ROLES` in `parse-verdict.ts`, which is what emits the structured
       `reviewerVerdict` fact — a NEW reviewer key needs that set extended too, see
       ADD-A-PIPELINE-HARNESS-AGENT.md §4)
       **but still says "exact *show command*" and "*per-device*"**; **`config_change_author` is
       only ~70% neutral** (device/show-command ×6). Reuse them, but **neutralize the domain-isms
       in place** (show command→validation fact, per-device→per-resource) — they're strict supersets
       (a device *is* a resource; a show command *is* a validation fact). Keep the key name (no
       rename, no duplication).
     - **Generic POV roles are NOT drop-in for a harness pipeline.** `solution_architect`/`data_analyst`
       look like the Architect/Harvester but are **POV-interactive** — they lack the **§6 auto-chain
       contract** and instruct the forbidden `task.context`/`agent.results` anti-pattern (metadata, not
       the snapshot, + the 50KB-cap trap). A harness persona must inherit from a **harness-pipeline**
       role, not a POV role.
     - **Mint a new key ONLY** when the persona carries genuinely *domain-specific intelligence* an
       existing role can't express *and the injected protocol can't carry it either*. Set the bar high:
       network's VLAN/SVI/routing once seemed to justify a domain-specific `network_design_architect`, but
       it turned out the **protocol** expresses that fine, so even network was repointed onto the neutral
       `infra_change_architect` (2026-07-01) — the role key was retired. **Prefer generalizing** a
       harness-pipeline role to a neutral `infra_*` one over cloning per domain — the harness
       **auto-chains the harvested live state into §6, so it IS the syntax exemplar**: the
       Author/Reviewer rarely need domain syntax baked in. (Realistic net-new for an infra use case:
       **~2 keys** — a harness-architect + a §6-*producing* harvester — not 0.)
     - **BACKWARD-COMPAT — the equivalence gate for an in-place neutralization is a DRY-RUN of the
       live pipeline that already uses the role, NOT a string-pinned test.** A deliberate rewrite is
       a different string *by design* → the pinned test fails and a green build proves nothing about
       whether the live agent still produces an equivalent deliverable. Run the existing use-case's
       pipeline (e.g. the cEOS lab for network) and confirm output-meaning parity before the edit
       ships. (A role-KEY *rename* is additionally a Protocol 11 drift sweep — template `defaultRole`
       + all refs in the same commit.)
     - **Personas are templates + role-guidance, NOT `.claude/agents` specialists** — never mint a
       `kubernetes-specialist` agent for a use case. (A tool-less persona's *template* can also be
       shared, not just its role — the Reviewer especially.)
2. **Draw the DAG.** Mark any *conditional* phase (e.g. a "harvest current state" Phase 0
   that drops out when the input is supplied — like artifact-synthesis Phase 0).
3. **Pick the deliverable producer + QA-gate split** (the Editor/Reviewer pattern):
   - **Producer** task → harness sets `metadata.deliverableSourceTaskId` at it; its output
     becomes the customer-facing `report.md`.
   - **Reviewer leaf** → `suppressDefaultReportMd`; produces `result.json` only; its review
     is the *gate*, not the deliverable. Keep producer and gate **separate**. The gate's verdict
     is the reviewer's terminal `## VERDICT:` block (+ the structured `reviewerVerdict` fact in
     result.json) — your protocol's SYNTHESIZE rule must read ONLY that block, never re-derive
     from mid-response prose (2026-07-14 verdict-misread fix).
4. **Minimize the tool/credential surface — and don't trust the platform to confine it for
   you.** (Hard-won in the network-provisioning review, `cline_docs/reviews/network-provisioning-design-2026-06-16/`.)
   - Prefer **read-only** + an **MCP tool over bash**, but know the limit: the
     consolidated-tool wrapper (`wrapWithSchema`) validates the **envelope only**. The
     **inner tool-call args reach your service unvalidated** — they need their own
     **structured Zod validation: a verb _enum_, not a free-text allowlist** (free-text is
     bypassable via `; conf t`, newline injection, `do conf t`, homoglyphs…). *"MCP inherits
     the guard" is FALSE for inner args.*
   - **Confinement is NOT "give the tool to one persona."** Tool access is **user-scoped,
     not template-scoped**, and an **empty `mcpTools` list silently grants all six
     consolidated tools** (`agentExecutionEngine.ts:506`). To actually confine a sensitive
     tool, **every _other_ sibling template** must carry an explicit `mcpTools` list that
     *omits* it — backed by a **CI invariant**. Otherwise any sibling holding `services` can
     call your device service as the same user.
5. **Output:** the Design section of the proposal.

---

## Phase 3 — Identify required work 📋

Enumerate everything that must exist before the use case is shippable. Typical items:

- **Templates** — author in `scripts/seed-agent-templates.ts` (Pattern #44 Gold Standards;
  Deliverable Contract guidance). Grant tools to the minimum set of specialists.
- **Protocol text** — draft now (Phase 4), promote into `scripts/seed-protocol-prompts.ts`
  later (Phase 6); add to the protocol-selection matcher so the use case routes here.
- **New tools** — register in the MCP hub; if they touch external systems, read-only +
  allowlist + escalation-rejection are hard requirements (owned by
  mcp-tool-architecture-specialist + sec-ops).
- **Credential boundary contract** — scope creds; never log/throw secrets (Phase 8.3
  discipline, stronger for high-value secrets); decide storage/injection, **launch-_authorization_**
  (who may launch a run that reaches external systems — a *gate*, not just a log), and
  launch-audit. (network-provisioning R8: launch-authorization was *entirely unspecified*
  in the first draft — the playbook now forces the question.) **⚠️ Mind the lane:** a
  4-specialist design review of a launch-gate + *conformance-allowlist* for this concluded it
  was a **certification / change-management authority pAIchart shouldn't own** — pAIchart
  **orchestrates; it does not certify** the customer's external service (and can't verify its
  truthfulness anyway). The honest split: pAIchart enforces its *own* half (R9/R10 above); the
  customer governs *which* external service they trust + its conformance via a **published
  contract** (e.g. the WS4 device-service integration spec), **not** a pAIchart-enforced gate.
  Design-first saved building the dropped layer — zero code. (`cline_docs/reviews/ws3-design-2026-06-24/`, SUPERSEDED.)
  **The test-boundary corollary (k8s review, 2026-06-27):** a required-work item that proposes to
  **build CI / a test that validates the *customer's* half** (their read-only verb-enum, their RBAC,
  their redaction) is the **same WS3-category smell** — it has pAIchart owning the customer's security
  control. *Our CI tests our half; their half is a published spec + a self-certify checklist they run.*
  When a review says "ship+own a reference service so we can test their verb-enum in our CI," the
  correct fold is "that control is theirs → spec it + self-cert it," with at most a **throwaway
  validation rig + an optional reference/example service** (like the cEOS lab) — never owned infra or a
  CI gate on customer services. (The verb-enum being the *sole* runtime guard raises the *stakes* of the
  spec, not the *ownership* — load-bearing ≠ ours, same as the customer's R10.)
- **Deterministic validation (Protocol 10)** — if the deliverable asserts external state,
  the producer must ship *facts* (verifiable checks), not LLM verdicts.
- **Logging & audit** — you inherit the codebase logging standard *for free* (pino via
  `lib/logger.ts`; `pino-structured-logging-pattern`; CI-enforced by `validate:logging` +
  ESLint `no-console`). Beyond inheriting it, decide three things for your use case:
  (1) what it logs; (2) which events are **`securityEvent: true`** (the codebase convention —
  credential-boundary events, escalation rejections, mismatch/skip); (3) whether it needs an
  **audit trail** of external-system access — if so, model it on `stage_activities` (the
  harness's forensic table) using the `fire-and-forget-activity-logging-pattern`. Secrets
  are **never** logged (Phase 8.3).
- **Untrusted-output + secret-leak guards are now INHERITED (platform-wide, validated).**
  A child that reads sensitive/untrusted external data is covered by two shipped, flag-gated
  guards a new protocol gets for free: **R9** (`lib/agents/harness/sanitize-chained-output.ts`)
  neutralizes untrusted connected-service output before pAIchart's reasoner reads it; **R10**
  (`lib/agents/harness/redact-artifact-secrets.ts`) redacts secrets from the persisted
  `report.md`/`result.json`. Both were **validated against real Arista cEOS output
  (2026-06-25)**. Ref: `.claude/knowledge/domain/harness/harness-output-guards.md` (modules,
  call-sites, the `CONNECTED_OUTPUT_SANITIZE_ENABLED` / `ARTIFACT_SECRET_REDACT_ENABLED`
  flags, enable-gates). *What you still decide per use case:* whether your secret/output
  families are covered (R10's pattern set is extensible — EOS forms were added during the
  real-device run), and any "fidelity" carve-out (a rollback config that *must* echo prior
  state) as an explicit, reviewed exception. (Origin: network-provisioning R10 — `show run`
  secrets leaked verbatim into the package; the guards were built in response.)
  - **⚠️ INVARIANT — the connected service MUST be reached via the `services` gateway, or R9
    never fires.** R9 site A is gated on `toolCall.name === 'services'` (`agentic-tool-loop.ts`):
    it only sanitizes output that arrives through `services.call` / a registered descriptor.
    **Wiring an external service as a bespoke first-class tool silently bypasses R9** — the
    untrusted output reaches the reasoner unsanitized. So any pipeline that harvests from an
    external/connected system MUST register it and call it via `services`, never a custom tool.
    (And R9 is **ON in prod** since 2026-06-29 — default-OFF in code only; its C1 gate was accepted-with-risk rather than resolved: false-positives on
    prose with `system:`/`act as`, is *worse* for colon-/role-label-dense formats like k8s YAML.
    R9-enablement is DONE; what remains is the C1 false-positive rate, now measurable from
    site-A telemetry — see harness-output-guards.md "Reading R9 firings".)

Each item is a numbered `R<n>` in the design doc's Required Work, flagged by risk
(design-first items ⛔ get resolved before any code).

---

## Phase 4 — Author the docs 📝

1. `mkdir .claude/knowledge/pipelines/<use-case>/`.
2. Write the **design proposal** using the RFC skeleton (Status · Objective · Design ·
   Required Work · Validation Plan · Decision Log) — *not* lab-report (nothing's run yet).
3. Write the **protocol prompt-text draft** (`PIPELINE_<NAME>_PROTOCOL.draft.md`): seed-entry
   metadata, the CRITICAL SAFETY INVARIANT (if actuation is involved), conditional phases,
   decomposition table, dependency wiring, deliverable wiring, facts-not-verdicts validation,
   SYNTHESIZE/status logic, and a placeholder table.
4. Add the use case to the README index.

---

## Phase 5 — Validate before promoting 🧪

Do **not** seed until these pass:

0. **Write the specialist-review launch prompt** — save a copy-paste-ready prompt as
   `SPECIALIST-REVIEW-PROMPT.md` in the use-case dir so the review can run in a fresh
   session. It must: point the specialists at the design docs by path, instruct each to run
   **discovery-first**, name the specialists + per-specialist focus areas (mapped to the
   Required-Work items), set the ≥ 85% confidence target, require a recommendation-coverage
   table, and sequence the build-phase actors (e.g. template-system-specialist) *after* a
   passing review. (Network-provisioning's is the worked example.)
1. **Tool spike** (if a new tool) — prove the allowlist/read-only guard holds against
   escalation attempts. List pathological inputs first.
2. **Specialist review** (Protocol 2) — minimum sec-ops + boundary-contract +
   architectural-review for any external-tool/credential surface; target ≥ 85% confidence.
   Run each specialist discovery-first. Templates are authored by **template-system-specialist**
   (`scripts/seed-agent-templates.ts`) as a build step *after* the review passes — not before.
   - **⚠️ PUT THE OWNING-SUBSYSTEM SPECIALIST *ON* THE PANEL — don't let it stand in as
     "the coordinator."** (Lesson from the k8s review, 2026-06-27.) A harness use-case's design is
     authored in the **pipeline-harness-specialist's** lens, so it's tempting to treat *it* as the
     design's author/coordinator and staff the panel only with the cross-cutting reviewers. That's
     backwards: the highest-value findings are usually in the *owner's* domain (here: the §6-chaining
     caps, the role-reuse mechanics, the `services`-gateway R9 gating — all of which the four
     outside-in reviewers could only see partially, and which `architectural-review` explicitly
     *handed back* to the owner). Include the owning specialist as a **distinct reviewer voice**
     (it catches domain findings the others miss) **and** name it the **owner of the fold**. So the
     security row (sec-ops + boundary-contract + architectural-review) + validation-engine for a
     verb-enum + **the owning-subsystem specialist** ≈ 5 reviewers. "Prefer more specialists, not fewer."
3. **Dry-run harness pass** — run the pipeline against a lab/mock; confirm it produces the
   deliverable + QA verdict, **never** actuates, and that Guard 8 + the 4-point completion
   invariant still hold.
4. **Confidence-gate calibration** — pick the reviewer threshold; verify it rejects a
   known-bad input.
5. **Test coverage** — if the protocol adds routing/decomposition/validation logic, add a
   unit test mirroring `test:pipeline-protocol-validator` / `test:template-scope-matcher` and
   wire it into the `test:all-validation` chain. (Authored now, run at Phase 6.)

---

## Phase 6 — Promote to shipped 🚀

1. **Confirm + author the personas** → **template-system-specialist** authors the templates
   in `scripts/seed-agent-templates.ts` (Pattern #44 Gold Standards, template data
   structure); **prompt-construction-specialist** confirms/crafts each persona's
   role-specific prompt (role-specific intelligence, template hierarchy). The
   **pipeline-harness-specialist** then signs off that the authored personas still match the
   Phase 2 decomposition intent. (Pull these two into the Phase 5 review instead if the
   personas are novel/high-risk rather than variations on existing specialists.)
2. **Seed protocol** → `scripts/seed-protocol-prompts.ts` as a `PROTOCOLS[]` entry.
   **Escaping trap**: inside the TS template literal, escape backticks `` \` `` and `${}`
   `\${}`; typecheck locally before pushing (TS2796 surfaces at the first array item, not
   the offending line).
3. **Add a HOWTO section** — extend the `HOWTO-use-pipeline-harness` prompt (also in
   `scripts/seed-protocol-prompts.ts`) with a section for the use case, mirroring the
   artifact-synthesis / network-provisioning entries: the decomposition, any conditional
   Phase 0, the deliverable/QA split, an example task title, and (if device-reaching) the
   descriptor model. This is the user-facing `/prompt` surface — document only what works
   *now* (no future-feature notes). Re-seed + `pm2 restart paichart-mcp` lands prompt changes;
   the client must `/mcp` re-auth to refresh its prompt list.
4. **Wire the matcher** so the use case's task descriptions route to the new protocol.
5. **Land the test coverage** — run the Phase 5.5 unit test in `test:all-validation`, and
   extend `pipeline-harness-e2e-test.md` with the new use case's happy path so the smoke
   suite exercises it.
6. **Run the pipeline-harness discovery** to confirm no drift (it's the regression net).
7. **Flip the README index status** to Built/Shipped; close the Decision Log.

---

## The procedure, in one breath

> **Triage the seam** (cognition → harness, actuation → out) → **decompose** (specialists +
> DAG + producer/QA split + terminus) → **list required work** (templates, tools, creds,
> validation) → **write the RFC + protocol draft** → **validate** (spike, review, dry-run,
> calibrate, tests) → **promote** (seed templates + protocol, wire matcher, land tests, run
> the discovery). When in doubt, mirror the shipped `artifact-synthesis-protocol`.

---

## Appendix A — Anatomy of a fresh-session continuation prompt

Several gates of this playbook run best as a **clean session** — a specialist review (Phase
5.0), a real-device validation, or a self-contained build phase. The handoff is a
**copy-paste-ready prompt** saved in the use-case dir (alongside `SPECIALIST-REVIEW-PROMPT.md`)
so the next session starts cold but on-rails. Done well it runs **one-shot** — the
network-provisioning `REAL-DEVICE-VALIDATION-PROMPT.md` provisioned an Arista cEOS lab and
ran the protocol against it in a single Claude Desktop paste (2026-06-25).

**Why it works:** a fresh session has the repo + auto-memory but *not* this session's reasoning.
The prompt supplies only the **delta** — the decisions and facts that aren't recoverable from
the tree — and *points* at everything that is (don't re-explain what a Read will show).

**The ingredients** (the cEOS prompt has all seven):

1. **One-line objective** — what to continue + which gate (e.g. "set up an Arista cEOS rig for
   REAL-DEVICE VALIDATION of the network-provisioning protocol").
2. **CONTEXT as pointers, not prose** — name the memory entry + the roadmap/spec **paths** to
   read; state what's already shipped in one breath. The session reads the detail itself.
3. **The DECIDED approach** — the conclusion already reached + *why the alternatives lost*
   (e.g. "cEOS over Cisco — no account + CSR1000v needs 4GB"). Stops the session re-litigating.
4. **Hard facts that aren't in the tree** — host specs, RAM ceilings, account/image prereqs,
   prod IPs. The session can't grep these.
5. **Concrete deliverables** — an enumerated list of artifacts to produce, so "done" is checkable.
6. **An HONEST CAVEAT** — what this gate does *not* prove (e.g. "static creds, NOT WS4-conformant
   — validates cognition, not the identity contract"). Keeps the record from over-claiming.
7. **A "start by confirming X with the user" opener** — surfaces the one human-gated prereq
   before the session assumes it (e.g. "is the cEOS image on prod yet?").

**Carry the standing constraints** in a one-liner (no AI co-author trailers; commit direct to
main; prefer MCP over psql; verify file:line before citing) — a cold session won't have them.

> Worked examples: `network-provisioning/SPECIALIST-REVIEW-PROMPT.md` (review gate) and
> `network-provisioning/REAL-DEVICE-VALIDATION-PROMPT.md` (real-device gate, proven one-shot).
