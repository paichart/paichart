# Network Provisioning Pipeline — Design Proposal

> **Status**: 🔴 Draft — REVIEWED 2026-06-16, **BLOCKED** (review did not clear 85%; 3 blockers open) · **Created**: 2026-06-16 · **Owner**: pipeline-harness-specialist
> **Companion**: [`PIPELINE_PROVISIONING_PROTOCOL.draft.md`](./PIPELINE_PROVISIONING_PROTOCOL.draft.md) — the candidate protocol prompt text.
> **Review**: [`cline_docs/reviews/network-provisioning-design-2026-06-16/CONSOLIDATED-REVIEW.md`](../../../../cline_docs/reviews/network-provisioning-design-2026-06-16/CONSOLIDATED-REVIEW.md) — sec-ops 74% · boundary-contract 72% · mcp-tool-architecture 78% · architectural-review 88%. **Build phase HALTED** until R1/R2/R3/R8/R10 close.

---

## Objective

Use the Pipeline Harness to do the **cognitive half** of network device provisioning:
turn a provisioning intent (e.g. *"Provision VLAN 220 (IoT) across campus distribution +
access layer"*) into an **approved, reviewable change package** — per-device candidate
configs, deterministic validation steps, and a rollback plan — gated by a QA reviewer
and a confidence score.

### Why the harness fits — and the seam that defines the design

Provisioning has two halves:

- **Cognition** (decompose intent → design → generate config → review) is *knowledge
  work that produces artifacts*. This is the harness's bullseye — identical in shape to
  the shipped `artifact-synthesis-protocol` (a producer specialist + a QA-gate reviewer).
- **Actuation** (`ssh` in and push `conf t`) is an *external side effect*. It is an
  **anti-pattern inside the harness's autonomous reactor loop**, for one load-bearing
  reason: the harness's safety model assumes children do **idempotent, re-runnable**
  work. The engine failure path fires `maybeRetriggerPipelineHarness` and the harness
  re-SYNTHESIZEs on terminal status; retrigger chains run to the Guard 8 generation budget.
  (Precision, per 2026-06-16 review: the reactor does **not** auto-retry a FAILED child — a
  FAILED child makes the harness SYNTHESIZE/escalate. The non-idempotency hazard is the
  *execution-level* re-run path — `maxRetries:3`, the `FAILED→retry` CAS, and the in-loop
  correction turn — which can re-run a child's tool calls.) Regenerating a document twice is
  harmless. Re-running
  `conf t` — or retrying an execution that already pushed *half* a config before it died —
  is not. The harness has **no transactional/rollback semantics for external side
  effects**.

**Design consequence — the apply-gate terminus:** this pipeline ends at *approved change
package*. Apply happens **out-of-band** — a human engineer in Claude Code (interactive,
human-gated, real bash tool), or a deterministic idempotent applier (Ansible / NAPALM /
Nornir) that consumes the change package via MCP and provides real convergence + rollback
the harness cannot. The harness already refuses to *do* the work (setup-and-exit, never
calls `agent.execute`); this extends the refusal to device mutation.

Secondary reasons the actuation half stays out of the loop:
- **Deliverable-channel mismatch** — the harness certifies that *text is trustworthy*
  (confidence + anti-fabrication), not that *a device is in the desired state*. It can
  score 84/100 on a claim that a BGP session is up while the session is down.
- **Fact vs verdict (Protocol 10)** — an LLM deciding "the device looks provisioned" is
  the textbook verdict-shipped-as-fact failure. Provisioning wants *deterministic*
  verification.
- **Blast-radius asymmetry** — a runaway harness chain today burns tokens + writes
  spurious artifacts (bounded by Guard 8). A runaway chain with `enable` on network gear
  takes down a network.

---

## Design

### Child specialists (4 + harness root)

| # | Specialist (template) | Type | Tool surface | Produces | Depends on |
|---|----------------------|------|-------------|----------|------------|
| **0** | **Network State Harvester** *(conditional)* | ACQUIRER | **read-only** ssh (`show*` allowlist) + IPAM/NetBox MCP | current-state snapshot: topology, VLAN/IP allocation, device inventory, software versions | — |
| **1** | **Network Design Architect** | ARCHITECT | none (pure cognition) | addressing/VLAN/routing design, SVI plan, inter-device dependency map | P0 |
| **2** | **Config & Change-Package Author** | ENGINEER | none | per-device candidate configs **+** deterministic pre/post validation steps **+** rollback config, assembled into one change package | P1 |
| **3** | **Change Reviewer** | REVIEWER | none | risk + standards-lint + blast-radius + maintenance-window/approval verdict | P2 |

**DAG:** `P0 → P1 → P2 → P3` (linear). P0 is **conditional** — it drops out when the
engineer supplies current state in the task body (same rule as artifact-synthesis
Phase 0 "Source Acquisition").

### Deliverable / QA-gate split (reuses shipped metadata wiring)

- **Deliverable producer = P2.** Harness root sets `metadata.deliverableSourceTaskId → P2`;
  the engine extracts P2's output as the customer-facing `report.md` (the change package).
  This is the *Editor* role from synthesis.
- **QA gate = P3.** `suppressDefaultReportMd` on the Reviewer leaf → it produces
  `result.json` only; its review is the gate, not the artifact. The *Publication Reviewer*
  role from synthesis.
- **Harness SYNTHESIZE** aggregates child confidences into a **status**: `approved` only if the
  Reviewer confidence clears threshold; otherwise `needs-revision`. The confidence aggregation *is*
  the gate.
  - **Review correction (2026-06-16, architectural-review) — Option A:** the engine extracts P2's
    output as `report.md` **verbatim**, so the status **cannot** be injected as a header into the
    change package without changing the deliverable contract. Carry the status in the **harness
    summary + `pipeline-index.json`**, leaving `report.md` as P2 verbatim. (Stamping a status header
    into `report.md` would be a harness-core change — this design needs none.)

### Why this decomposition (rejected alternatives)

- **No "Apply Executor" child** — that is the actuation-in-the-loop anti-pattern
  (re-entry hazard above).
- **Validation lives in P2, not folded into the Reviewer** — so the *deliverable* carries
  its own proof steps, and the Reviewer independently *judges* them. Producer and gate
  stay separate (the synthesis lesson: Editor produces, Reviewer gates).

---

## Required Work

Concrete items that must exist before this is shippable. **None exist today.**

### R1 — Read-only ssh tool surface design ⛔ (highest-risk — **REOPENED by 2026-06-16 review**)

The Network State Harvester (P0) is the *only* child permitted device contact, and it must
be **read-only by construction**, not by hope.

> **⛔ BLOCKER (review 2026-06-16, unanimous across sec-ops + boundary-contract + mcp-tool-architecture):**
> the earlier "DECIDED" close was an **overclaim** and is retracted. An MCP tool does **not**
> inherit the read-only guard "by construction." An agent reaches the device only via
> `services(action:'call', …)`; `wrapWithSchema('services')` validates the **envelope only**
> (`services-dispatcher.js:60–64`) — the inner `arguments` (`device`/`cmd`) reach the destination
> service **unvalidated by this server**. The read-only guard is **net-new app code inside the
> device service**. And a **free-text `show*` allowlist is bypassable** (`; conf t`, `\n`/`\r`
> injection, `do conf t`, `| tclsh`, vendor pager/shell escapes, unicode homoglyphs, multi-line
> config-as-argument). R1 is **not closed.**

**Revised R1 requirements (must all hold before the spike):**
- **Structured command schema, not a string allowlist** — the command is a **Zod verb-enum**
  (`show_run | show_vlan | show_ip_route | …`) + typed args. The enum *is* the allowlist, and it
  becomes inherited shape-validation. (Replaces "allowlist a `show*` string.")
- **Register as an internal, SSRF-exempt hub service** (mirror `seed-snowflake-service.ts`), reached by
  the Harvester via `services(action:'call', targetService:'network-readonly-exec', tool:'show_run',
  arguments:{ device, … })`. **There is no `network_readonly_exec(device, cmd)` function** — that call
  signature in earlier drafts is wrong. Internal routing **skips the policy injection-regex**
  (`service-call-handler.js:157-253`), so the **enum schema is the sole guard** — it must be airtight.
- **The guard lives + is spiked INSIDE the device service** — the harness/dispatcher does not enforce it.
- **No interactive/privileged mode** — reject any input that escalates to enable/config.
- **Per-vendor command mapping** — `show run` (IOS) vs `show configuration` (Junos); the enum maps per vendor.
- **Output size cap** — `show run` on a chassis can be large; bound it (token budget + DoS).
- **Spike scope** — prove the enum guard against the **full pathological list** (sec-ops), not just
  `show run` OK / `conf t` rejected. Owned by mcp-tool-architecture + sec-ops + mcp-hub.
- **Persistent-tool vs ephemeral-registration — the scale fork (open, build-phase):**
  two ways the Harvester can reach devices:
  - **(A) one persistent tool, device-as-parameter** — `network_readonly_exec(device, cmd)`
    resolves creds at call time. **No per-device registry rows.** Lean here — a network
    device is an ssh endpoint, not an MCP server, so there's nothing natural to register
    *per device*, and the bloat concern evaporates.
  - **(B) ephemeral per-cycle registration** — register the device(s)/gateway as MCP
    service(s) at cycle start, children call them, **`registry(action: "delete")` at cycle
    end**. Applies *only* if access must route through the hub's per-service
    auth/audit/health path. At hundreds/thousands of devices this **must** clean up — a
    permanent row per device per run is pure bloat (Steve, 2026-06-16). See the playbook's
    "Transient registered artifacts" rule.
    - **The agent can't read a guide for this.** Agent executions don't have
      `list_prompts`/`prompt_command` — their tool set is the six consolidated tools
      (`agentExecutionEngine.ts:477`). `registry` IS in the set, so the agent can call
      `registry(action: "register" / "delete")` mechanically — but the *procedure* (when to
      register, what to clean up afterward) must be **spelled out in the injected
      provisioning protocol text**, not left to a discoverable `HOWTO-register-service`
      prompt (that guide serves humans / MCP clients only). See the playbook's "Authoring vs
      runtime" rule.
  - **Lean: (A).** Revisit (B) only if a per-service security/audit boundary per device
    turns out to be a hard requirement.
  - **Review note (2026-06-16):** (B) is **non-idempotent actuation inside the harness retry/Guard-8
    loop** — a child that dies after `register` but before `delete` **orphans registry rows on
    retrigger**, contradicting this pipeline's own seam rule (boundary-contract). And (B) buys a
    per-device **audit/rate** boundary, **not** a per-device **auth** boundary — service auth is
    `checkServiceAccess(userId, …)`, still user-scoped (mcp-tool-architecture). So (B) does **not**
    deliver confinement. If ever used, gate it on idempotent-upsert + a cleanup reactor. **(A) confirmed.**
- **Self-provisioning (C) — Steve, 2026-06-16 — the SPIKE vehicle (and a possible prod simplification):**
  rather than the harness owning a bespoke internal read-only service, **the pipeline task carries the
  device/Ansible MCP service descriptor (endpoint + schema), and the pipeline registers it as its opening
  move**, then the Harvester calls its read tool, then teardown deletes it:
  `registry(register, {category:<auto-approving>, endpoint})` → `registry(update, {add read tools})` →
  Harvester `services(call, tool:'show_*')` → `registry(delete)`.
  - **Gating condition (VERIFIED):** calling requires `status:'ACTIVE'` (`service-call-handler.js:153`).
    register lands ACTIVE only on the **auto-approved path** (automation / data-services / monitoring /
    communication / ai-intelligence); `security`-type needs admin approval → would **stall the run**. The
    protocol MUST register under an auto-approving category.
  - **"Both steps" confirmed:** register (create+activate) + update (attach read tool schemas — without it
    the service advertises no callable tools). All encoded in the **protocol text** (agent can't read
    `HOWTO-register-service` at runtime — no `list_prompts`/`prompt_command`).
  - **Reconciliation with (A)/(B):** per-run self-registration is **(B)-flavored** and inherits the two
    review caveats — (i) **non-idempotent in the retry/Guard-8 loop** (orphans the row if a child dies
    after register/before delete → needs idempotent-upsert + cleanup-on-failure), and (ii) it buys
    audit/rate, **not** confinement (auth stays user-scoped). It is **bounded** (ONE gateway row, not
    per-device) so bloat is small.
  - **Verdict:** **for the UAT spike, (C) is the right vehicle** — self-contained, UAT-safe, resolves the
    "which service in UAT" dependency (the task carries the descriptor), and exercises the full
    register→update→use→delete lifecycle as bonus learning. **For prod, the safer shape is registering the
    device/Ansible gateway ONCE persistently** (like `seed-snowflake-service.ts`) and having pipelines just
    CALL it — sidestepping the orphan/idempotency issue. **Revisit (C)-per-run vs persistent-once at
    re-review; the spike doesn't need to settle it.**
  - This reshapes R1 from "build an internal Zod-enum service" into "**EITHER** build that internal read-only
    service **OR** point at an external device/Ansible MCP service"; the spike uses the latter — real if
    available in UAT, else a mock MCP server returning canned `show` output. See `SPIKE-PLAN.md`.
  - **Descriptor delivery — inline vs fetched (Steve, 2026-06-16):** the device-service descriptor
    (endpoint + schema) can be supplied **inline** in the task, or the task can carry only a **URL
    reference** (e.g. GitHub raw → a structured JSON descriptor) that the **Harvester fetches first** via
    `services(call, browser-automation-service, scrape_page, {url})`, then registers. The fetched variant
    keeps the task lean but adds a fetch+parse failure mode and lengthens the trust chain
    (task→doc→endpoint = SSRF surface; prod needs a guarded fetch + R8). Spike runs inline first (Run 1),
    fetched second (Run 2) — see `SPIKE-PLAN.md`.

### R2 — Credential boundary contract ⛔ (gate before any tool ships) — **split by 2026-06-16 review**

Read-only device credentials flow into exactly one specialist (P0). The review split this into two
distinct redaction scopes — the original wording covered only the connection cred:

**R2a — connection credential (the device login secret):**
- Creds scoped to read-only device accounts (TACACS+/RADIUS role or local read-only user).
- **Never** logged or placed in thrown errors — Phase 8.3 discipline (`apiKey`-in-logs), stronger here.
- **Follow the Anthropic no-fallback discipline** (`anthropic-sdk-provider.ts:67-74`), **NOT** the
  Gemini-style env-var fallback (`llm-service.ts:144-147`) — a device cred must never silently fall
  back to an ambient env secret. These are **shared-infra secrets** (net-new storage), not per-user.
- Decide storage/injection path (resource-manager secret? per-POV credential vault?).

**R2b — harvested output (secrets *inside* `show run`):** see **R10** — `show run` output itself carries
enable secrets / SNMP communities / TACACS keys / PSKs, and the original R2 did not cover them.

(Launch-authorization — "who can run a pipeline that reaches real devices?" — was R2's last bullet; the
review promoted it to its own item, **R8**, because it was unspecified, not just under-specified.)

### R3 — Four agent templates (do not exist yet)

Unlike the artifact-synthesis templates, these are net-new and must be seeded from the
**source of truth `scripts/seed-agent-templates.ts`** (not hand-created in the DB):
`Network State Harvester`, `Network Design Architect`, `Config & Change-Package Author`,
`Change Reviewer`. Each needs role/type, capabilities, model params, and the universal
template's Deliverable Contract guidance. The Harvester's template must also align with
Pattern #44's Gold Standards. (template-system-specialist owns the authoring;
mcp-tool-architecture-specialist owns the Harvester's tool grant.)

> **⛔ BLOCKER (review 2026-06-16) — confinement must be a *control*, not a convention.**
> "Only the Harvester touches devices" does **not** hold by construction. The device service is
> reached via `services(action:'call')`, authorized by `checkServiceAccess(userId, …)` —
> **user-scoped, never template-scoped** (`hub-utilities.js:229-267`). Any sibling child that carries
> `services` in its grant can call the device service as the **same launching user**. And an **empty**
> `mcpTools` list silently defaults to **all six** consolidated tools (`agentExecutionEngine.ts:506-508`).
> **Required:** the three cognition templates (Architect, Author, Reviewer) must declare an **explicit,
> non-empty `mcpTools` list that OMITS `services`**, and a **CI invariant** in
> `scripts/test-security-invariants.ts` must assert it (so a future empty-list edit can't silently
> re-grant device access). Only then is the one-specialist seam enforced.

> **✅ RESOLUTION (2026-06-16) — confine via config (Part C); park the engine gate.**
> R-ENG-4 (agent-exec investigation, 92%) verdict: the tool-list **is** the offer-surface but **not**
> an enforcement boundary — config is *necessary but not sufficient*. Decision (Steve):
> - **Confinement = Part C config.** The three cognition templates (Architect, Author, Reviewer)
>   carry an explicit `['project','perform','analytics','template','registry']` (omits `services`),
>   pinned by a CI invariant in `scripts/test-security-invariants.ts`. For a **cooperative model**
>   (the operational reality) this is the confinement — the model is never *offered* `services`.
> - **Engine executor gate (track-1 A+B) PARKED** → `cline_docs/follow-ups/track-1-tool-confinement-build-spec.md`.
>   It's platform hardening (jailbreak/injection resistance), **not** a network-provisioning blocker,
>   and is **incomplete without track B** (per-principal `checkServiceAccess`).
> - **Residual ACCEPTED (must stay visible to the re-review):** (a) the **Harvester** legitimately
>   holds `services`, so it can reach *any* service, not just the device tool — only **track B** confines
>   that; (b) an injection-compromised cognition node has offer-surface removal but no engine block until
>   track-1 ships. Both are out of scope for the cooperative threat model this pipeline targets; sec-ops +
>   boundary-contract must explicitly sign off on accepting them at re-review.
> **R3 status: design resolved; the CI-invariant + 5-tool lists are Phase-6 build work (Part C), gated on re-review.**

### R4 — Protocol prompt text → seed

Promote [`PIPELINE_PROVISIONING_PROTOCOL.draft.md`](./PIPELINE_PROVISIONING_PROTOCOL.draft.md)
into `scripts/seed-protocol-prompts.ts` as a `PROTOCOLS[]` entry. **Escaping reminder:**
inside the TS template literal, escape backticks as `` \` `` and `${}` as `\${}` (the
template-literal-escaping trap).

> **Review correction (2026-06-16):** there is **no code-level `matchProtocol()` matcher**. Routing is
> **LLM-text matching** on the protocol's `description` / "When to Use" prose **plus an explicit
> `(protocol: network-provisioning)` title token** (the artifact-synthesis mechanism). Word the
> `description`/`useCase` to route provisioning intent here; do not look for a matcher function to edit.

### R5 — Deterministic-validation requirement (Protocol 10)

P2's validation section must specify *facts* — the exact `show` command + expected output
that proves each change — not LLM verdicts ("verify it looks right"). The change package
ships facts; the apply step earns the verdict by running them.

### R6 — Apply-side integration (out of scope for the harness, but the consuming end)

Define how Claude Code / Ansible consumes the change package via MCP: artifact retrieval,
the human approval step, post-apply validation feeding back as a *separate* read-only
"post-change validation" run (a sibling use case).

> **Review tripwire (2026-06-16, architectural-review):** the apply-side must treat a `status: approved`
> change package as **"a human may apply this,"** never as **"auto-apply unattended."** `approved` is a
> verdict about *package trustworthiness*, not a green light to actuate without a human in the loop.

### R7 — Logging & device-access audit trail

The pipeline **inherits the codebase logging standard automatically** — pino via
`lib/logger.ts`, the `pino-structured-logging-pattern`, CI-enforced by `validate:logging`
(zero `console.*`, pino-adoption scorecard) + ESLint `no-console`. No new logging
infrastructure needed. On top of that, this use case has specific requirements:

- **Read-only device-access audit trail** — every `network_readonly_exec` call (which
  device, which `show` command, by which user/execution) should be logged as an audit
  record, modelled on `stage_activities` (the harness's forensic table) via the
  `fire-and-forget-activity-logging-pattern`. This is the "who looked at what" trail a
  security review of the pipeline will ask for.
- **`securityEvent: true`** on credential-boundary events — cred-resolution failure, and
  any allowlist escalation rejection (`conf t` attempted) — matching the
  `reactor-skip-counter` / clobber-sentinel convention so they surface in the same
  security-log filters.
- **Secrets never logged** — device/enable creds out of all log lines and thrown errors
  (R2 / Phase 8.3). The device service must redact at its own boundary.
- **Redact attacker-supplied creds from the rejection record itself** (review 2026-06-16) — when an
  escalation attempt is rejected and audited, the rejected input may *contain* a typed secret; scrub it
  from the `securityEvent` audit row, don't store the raw attempted command verbatim.

### R8 — Launch-authorization model ⛔ (NEW — 2026-06-16 review, CRITICAL)

The design never answered *"who can launch a pipeline that reaches real devices?"* Routing is by
task-description matching, so the implicit answer is "any authenticated user who can create a
provisioning-shaped PIPELINE task" — and with fork (A) the only thing constraining *which* device is
hit is an **LLM-supplied `device` argument**. Required before any device-reaching run:
- A **role/permission launch gate** (not every USER may launch a device-reaching provisioning pipeline).
- A **principal ↔ device-scope binding** — the launching user is authorized for the in-scope devices/site,
  validated against the LLM-supplied `device` arg (don't trust the model to stay in scope).
- A **launch-time `securityEvent` audit** recording who launched which provisioning run against which scope.

### R9 — Device-output sanitization before LLM context ⛔ (NEW — 2026-06-16 review)

Harvester device output (banners, hostnames, running config) flows into the Architect/Author/Reviewer
**LLM prompts**. ANSI/control chars or **prompt-injection text in a device banner** could steer a child to
emit a malicious-but-`approved` change package a human then applies. Sanitize device output (strip control
chars; neutralize injection-shaped content) **before it enters any child's context**.

### R10 — Deliverable secret-redaction boundary + rollback-fidelity exception ⛔ (NEW — 2026-06-16 review, CRITICAL)

`show run` output carries enable secrets, SNMP communities, TACACS/RADIUS keys, PSKs — and P2's output is
extracted **verbatim** into the customer-facing `report.md` (`agentExecutionEngine.ts:1388–1392`, `:1473–1481`,
only a 5MB truncate, **no redaction**; **no secret-masking utility exists in `lib/` today**). The **rollback
plan** is the leak vector (it legitimately needs prior config). Required:
- A **deterministic, vendor-aware redaction boundary** applied to harvested config before it lands in the deliverable.
- A **rollback-fidelity exception** — a redacted `community <REDACTED>` is not a working rollback. Resolve via
  placeholder-token / vault reference / device-archived-config so rollback stays executable without inlining the secret.
- Prose-only "don't include secrets" is a Protocol-10 *verdict* and is **insufficient alone** — this must be a code boundary.

---

## Validation Plan

Before promoting past Draft:

1. **Read-only tool spike** — prove the allowlist holds against an attempt to escalate
   (`show run` OK; `conf t` rejected; chained `; conf t` rejected). Pathological-input list
   first (per the pathological-case-framing habit).
2. **Specialist review (3 min)** — sec-ops + boundary-contract (R1/R2 tool + credential
   surface), architectural-review (the apply-gate seam + reactor re-entry argument).
   Target ≥ 85% confidence.
3. **Dry-run harness pass** — ✅ **DONE (Spike Run 1, 2026-06-16)** — ran end-to-end with the Harvester
   self-provisioning context7-docs as a read stand-in; produced a change package + QA verdict, **never**
   attempted mutation, Guard 8 + 4-point completion invariant held, SYNTHESIZE fired correctly. See the
   Spike Run 1 Decision Log row + `cline_docs/network-provisioning-spike-execution-guide.md`. (Done against
   a stand-in, not a lab device — R1/R2/R8/R9/R10 still unexercised; see Blockers.)
4. **Confidence-gate calibration** — partially validated by Run 1: 85% threshold held, Reviewer 72/100 →
   `needs-revision` (correctly withheld approval on a placeholder-laden package). **Still pending:** a
   deliberate known-bad config that *should* be rejected on substance (not just placeholders).

---

## Blockers to a real-device pipeline (post-spike T7 build list — 2026-06-16)

Spike Run 1 validated the **cognition/orchestration layer** (decomposition, deliverable quality,
deterministic-validation, QA gate, self-provision lifecycle). It did **not** exercise any of the
following — context7-docs was a clean documentation stand-in with no real device, credentials, or
secrets. These five ⛔ items are the gap between "the idea works" and "safe to point at real switches",
and they stand exactly as the 4-specialist review (2026-06-16) left them. Full definitions in Required
Work above; this is the consolidated actionable list.

| # | Blocker | Build | Severity |
|---|---------|-------|----------|
| **R1** | Read-only tool surface | Real read-only device tool as a **structured Zod verb-enum** (`show_run`/`show_vlan`/…) inside an **internal SSRF-exempt hub service** — the enum is the guard; **no** free-text `show*` allowlist (bypassable). | ⛔ highest-risk |
| **R2** | Credential boundary | Read-only device creds with **no-fallback** discipline, defined storage/injection path, never logged (R2a). Secrets-in-output → R10 (R2b). | ⛔ gate before any tool ships |
| **R8** | Launch-authorization | **Role gate** + **principal↔device-scope binding** (validate LLM-supplied `device` arg against the launcher's authorized scope) + launch-time `securityEvent` audit. | ⛔ critical |
| **R9** | Device-output sanitization | Strip control chars / neutralize **prompt-injection in device banners** before harvested output enters any child LLM prompt. | ⛔ |
| **R10** | Deliverable secret-redaction | **Code-level** vendor-aware redaction of `show run` secrets before they land verbatim in `report.md` (no masking util in `lib/` today) + a **rollback-fidelity exception** (vault ref/placeholder so redaction doesn't break rollback). | ⛔ critical |

**Not blockers:** track-1 engine confinement gate (*parked* — non-cooperative threat model only);
R3 Part-C confinement (*now optional* — `services` confinement descoped, and it doesn't wire on the
assign path regardless). **Lower-criticality open:** R6 (apply-side integration + human approval gate),
R7 (device-access audit trail — rides on building R1). **Done/validated by the spike:** R4 (protocol
seeded), R5 (deterministic-validation — confirmed live).

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-16 | Harness does cognition only; apply is out-of-band (Claude Code / Ansible) | Reactor re-entry + retrigger chains assume idempotent work; `conf t` is not idempotent and has no rollback in the loop. |
| 2026-06-16 | Single device-touching specialist (P0), read-only allowlist | Minimize blast radius + credential exposure to one specialist. |
| 2026-06-16 | Validation = deterministic facts, not LLM verdicts | Protocol 10; provisioning needs verifiable state checks. |
| 2026-06-16 | Doc uses RFC/design-proposal skeleton, not lab-report | Nothing built/run yet — results/conclusion would be filler; Decision Log + Required Work converge instead. |
| 2026-06-16 | **Read-only device access is a new MCP tool (`network_readonly_exec`), not a bash tool** | Inherits the schema/validation/audit surface the harness already trusts; a raw bash tool re-implements the guard from scratch. (R1 closed.) |
| 2026-06-16 | **Templates seeded from `scripts/seed-agent-templates.ts`** (source of truth), Harvester is the only one granted the read-only tool | Matches the repo convention (seed scripts are source of truth); confines the device-tool grant to one specialist. (R3 anchored.) |
| 2026-06-16 | Lean **persistent tool with device-as-parameter (A)** over ephemeral per-device registration (B); if (B) is ever needed it must register → use → **delete** | A device is an ssh endpoint, not an MCP server — nothing natural to register per device, so (A) has no bloat. (B) only if a per-service audit boundary per device becomes a hard requirement; at scale it must self-clean (Steve). (R1 fork.) |
| 2026-06-16 | Inherit the codebase pino logging standard; add a **device-access audit trail** (model on `stage_activities`) + `securityEvent` on credential-boundary events | Logging approach is already defined + CI-enforced; the use case's *positive* need is the "who ran which `show` against which device" trail a security review will require. (R7.) |
| 2026-06-16 | **Procedures must be baked into the injected protocol text, not discoverable prompts** — agent executions can't `list_prompts`/`prompt_command` | Verified `agentExecutionEngine.ts:477`: agent tool surface is the six consolidated tools (`project/perform/analytics/template/services/registry`). `/prompt` guides are client-only. `registry` IS available, so register→use→delete is mechanically possible — but the steps go in the protocol text. (Steve, corrected my earlier assumption.) |
| 2026-06-16 | **Protocol 2 review run (4 specialists, discovery-first) → BLOCKED; build halted** | sec-ops 74%, boundary-contract 72%, mcp-tool-architecture 78%, architectural-review 88%. Aggregate < 85% target; 3 blockers. Seam architecture (cognition-only, apply out-of-band, Protocol-10 fact-vs-verdict) is **sound (88%)**; the tool/credential/confinement plumbing under it is not. See `cline_docs/reviews/network-provisioning-design-2026-06-16/`. |
| 2026-06-16 | **R1 REOPENED — "MCP tool inherits the guard by construction" was an overclaim** | `wrapWithSchema('services')` validates the envelope only; inner `device`/`cmd` args are unvalidated by this server. The read-only guard is net-new app code **inside the device service**, and a free-text `show*` allowlist is bypassable. Replaced with a **structured Zod verb-enum** + internal SSRF-exempt hub service. (Unanimous: sec-ops + boundary-contract + mcp-tool-architecture.) |
| 2026-06-16 | **One-specialist confinement is a CONTROL to build, not a property we have** | Service auth is `checkServiceAccess(userId, …)` — user-scoped, not template-scoped; empty `mcpTools` defaults to all six tools. Cognition templates must explicitly omit `services` + a CI invariant must assert it (R3). |
| 2026-06-16 | **Three new Required-Work items opened: R8 (launch-auth), R9 (device-output sanitization), R10 (deliverable secret-redaction + rollback exception)** | Launch-auth was unspecified (not just thin); device banners are an injection vector into child LLM context; `show run` secrets leak verbatim into `report.md` with no masking utility in `lib/`. R2 split into R2a (connection-cred) + R2b (→R10). |
| 2026-06-16 | **R3 resolved: confine via Part C config; PARK the engine executor gate** | R-ENG-4 — tool-list is offer-surface, not enforcement. Config (explicit 5-tool list omitting `services` + CI invariant) confines a cooperative model = the operational reality. Engine gate (track-1 A+B) → `cline_docs/follow-ups/` as platform hardening (incomplete without track B; not a blocker). Residual (Harvester broadly `services`-capable; injection unblocked pre-track-1) ACCEPTED for the cooperative threat model — sec-ops + boundary-contract sign off at re-review. |
| 2026-06-16 | **Self-provisioning (C) adopted as the SPIKE vehicle** — pipeline registers the task-supplied device/Ansible MCP service (register→update→call-read→delete) | Resolves the "which service in UAT" dependency: the task carries the descriptor, the pipeline bootstraps it. VERIFIED gate: call requires `status:'ACTIVE'` (`service-call-handler.js:153`); register lands ACTIVE only on auto-approving categories → protocol must use one. (B)-flavored → inherits orphan/idempotency + non-confinement caveats; acceptable for a bounded, UAT-safe spike. Prod likely uses persistent-once registration; revisit at re-review. (Steve.) |
| 2026-06-16 | **Confinement DESCOPED for the spike (Steve): templates carry the default all-six grant; R3 Part C now OPTIONAL, not required** | "I don't care about `services` being a tool for the templates." 3-specialist consult (tmpl/exec/harness) + direct read confirmed `selectedTools` confinement does **not** reach the runtime grant on the harness `agent.assign` path anyway (engine reads `task.mcpContext.tools`, which assign never populates → all-six fallback; `agentExecutionEngine.ts:451,492,506` / `agent-assign-handler.ts:235-242`). So the Part-C CI-invariant + 5-tool lists are deferred unless prod confinement is later wanted; the R3 "residual ACCEPTED" stands as the live posture. |
| 2026-06-16 | **Spike Run 1 GREEN — cognition/orchestration layer validated end-to-end (PROD-as-UAT, context7-docs stand-in)** | Task `cmqgap1wb0003yxvcf4zpk4l1` (ElevenLabs POV). All 5 observations positive: (#protocol) harness selected `network-provisioning-protocol` by title-match out of all injected protocols; (#decomp) clean 4-stage chain + deps; (#self-provision) register→ACTIVE→call→**delete** ran, registry left clean; (#deliverable/QA) Author→`report.md`, Reviewer→`result.json` (report.md suppressed); (#change-package) expert-grade Cisco IOS — per-device config + 15 deterministic validation FACTS + device-scoped rollback + 9-step gated ordering + ASD-E8/ISM (AU) alignment, anti-fabrication respected (12 `[SP-n]` placeholders catalogued, not invented) — validates R5/Protocol-10. QA gate correctly returned **needs-revision** (Reviewer 72 < 85) with 3 real blocking issues incl. an Author-missed pre-change VLAN-220 conflict check. Chained-context discipline held (`anyTruncated:false` — the 3 role-guidance entries paid off). 1/17 CREATE tool calls failed (non-fatal, undiagnosed). **Scope of proof:** the spike validated the COGNITION layer ONLY — none of R1/R2/R8/R9/R10 were exercised (context7 stand-in carries no real device/creds/secrets), so those remain the gates to a *real-device* pipeline. Seeded protocol + 4 templates + 3 role entries remain PROVISIONAL on prod. |
