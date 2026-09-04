# Adding a PROGRAM protocol — a new composition model at the program tier

**Created**: 2026-08-08 (WS5 of `cline_docs/follow-ups/pluggable-program-protocols-2026-08-08.md`).
**Owner**: `pipeline-harness-specialist` (coordinates); authoring is
`prompt-construction-specialist` + `template-system-specialist`.
**Tier**: PROGRAM. The leg-tier equivalent is `ADD-A-PIPELINE-HARNESS-AGENT.md`.

---

## 0. Do you actually need this? (read first — most people don't)

Three different jobs get confused. Pick the right door:

| you want to… | read | is it engine work? |
|---|---|---|
| run a program of existing pipelines | `PROGRAM-HARNESS-USER-GUIDE.md` | no |
| design a **new use case** on the existing composition model (a DAG of legs, gates, Node C) | `PROGRAM-USE-CASE-DESIGN-PLAYBOOK.md` | no |
| add a **new domain** for a leg (a firewall vendor, a new IaC target) | `ADD-A-PIPELINE-HARNESS-AGENT.md` | no |
| author a **new composition model** — a different graph structure, different gate semantics, a different notion of "done" | **this doc** | no, but it is the deepest of the four |

**The test**: if `pov-program`'s shape (a DAG of sibling pipelines, human APPROVAL gates, a
facts-only integration review, `programReleasable` as an AND over child outcomes) can express your
objective **with different content**, you want the design playbook, not this. Only author a new
program protocol when the *composition model itself* differs.

**Before you start**: you author in `DRAFT` ("not yet runnable" — never composed; a program-tier
stamp naming it hard-fails) and flip to `ACTIVE` to run — see
**§6b** for the lifecycle and its one real limitation, because it shapes how you plan the work.

⚠️ The design playbook says *"engine change — you should almost never land here"*, and that is still
true. **A new program protocol is not an engine change.** It is a new protocol body plus a
one-line registration. If you find yourself wanting to change the cascade, the stage law, or the
reactors, stop and escalate — you have left protocol authoring and entered engine work.

---

## 1. Naming — decide this FIRST, and rename before the first real run

Naming is unusually load-bearing here, for three unrelated reasons.

### 1a. The base is loaded by tag, not by alphabetical luck (2026-08-17)

Under composed injection the base is loaded by its **`protocol-base` tag** with an exactly-one
contract (`findMany take:2` — zero or multiple ACTIVE base rows THROW; the health-run pins it), so
the old hazard — `pipeline-orchestrator-protocol` being just one alphabetical row in a
`take: 10` window that names sorting before it could push out — is retired. What remains yours:
never tag a second row `protocol-base`, and know the legacy `loadProtocols: true` mode (the
rollback state) still uses the name-ordered `take: 10` window, where alphabetical position
matters again.

Today 3 of 6 sort before the base; it falls off the window at 10 such names. Not imminent — but a
research programme producing several variants can get there, and **the drop is silent to the
agent** (a cap-hit `logger.warn` fires; the agent is told nothing and proceeds as if its routing
table were complete).

```
sorts AFTER the base  ✅   research-*, student-*, staged-*, sequenced-*, topology-*
sorts BEFORE the base ⚠️   adaptive-*, composition-*, experimental-*, graph-*, iterative-*
```

Prefer a late-sorting name. Yes, this means a query's `ORDER BY` is influencing your naming — that
is a symptom of the unfixed silent-cap-drop (WS3.2), not a good state, but it is true today and
costs nothing to respect.

### 1b. Never prefix with an existing program protocol's name

`pov-program-lite`, `pov-programme` and similar cannot inherit another protocol's guards — since
2026-08-08 by title-token ANCHORING, and since WS2 Phase A (2026-08-17) more fundamentally: the
title token is resolved ONCE at first execution into the `task.metadata.protocol` STAMP (canonical
long name), and tier membership is exact-name equality on that stamped name
(`lib/agents/harness/program-protocol.ts`). A variant stamps ITSELF (`pov-program-lite-protocol`)
and derives leg tier unless registered. Before the 2026-08-08 fix a variant picked up F12
enforcement and the F10 `programConfidence` stamp whether or not either applied. Don't re-open the
question by naming adjacently — the naming advice stands even though the mechanism moved.

### 1c. Name the WORK, not the author or the phase

Every shipped protocol names what the work *is*: `network-provisioning`, `terraform-iac`,
`kubernetes-gitops`, `artifact-synthesis`, `pov-program`.

`student-*` names who wrote it. `research-*` names what phase it is in. **Both date badly** — if the
model works it stops being a student project and stops being research, leaving a name that
misdescribes it.

That matters more than usual because **renaming later is expensive and is normally refused**. When
renaming "Node C" was evaluated, the string appeared 424 times in five forms across run records, VT
docs and forensics guides, and the rename was rejected on those grounds. Once your protocol has run
history, the same trap closes on it.

**Rule: a provisional name is fine; a provisional name that accretes run history is not.** If you
must start provisional, write down the rename trigger and take it before the first run that anyone
will cite.

📌 **A live worked example is open right now** — `research-program-protocol` is deliberately named
against this rule, with the decision and the rename trigger recorded in **Appendix A**. It also
documents the sharper mechanical deadline (`DRAFT` → `ACTIVE`), which applies to any protocol.

### 1d. Shape

`<what-it-is>-protocol`, lowercase, hyphenated. The `-protocol` suffix is the convention every row
follows and some tooling reads.
### 1e. ⚠️ A protocol has a MINIMUM useful size, and it is model-dependent

Nothing enforces this and nothing warns about it, so it has to be an authoring rule.

The prompt cache has a **minimum cacheable prefix**, below which content silently does not cache —
`cache_creation_input_tokens: 0`, no error, no log. The floor **varies by model and is NOT
monotonic across generations**:

| model | minimum |
|---|---:|
| Claude Opus 5 / Fable 5 | 512 tokens |
| Claude Sonnet 5, Sonnet 4.6, Opus 4.8 | 1,024 |
| **Haiku 4.5** | **4,096** ← *and Haiku 4.5 is the platform's DEFAULT model* |

**This binds a protocol bound via `metadata.protocol`** (a LEAF specialist's single-injection
path). The injected preamble there is `UNIVERSAL_AGENT_RULES` (~2,026 tokens) **plus your
protocol** — so a leaf-bound protocol under ~2,100 tokens can land the whole preamble under
Haiku's floor. **The harness tier no longer has this problem** (2026-08-17, composed injection):
a harness prompt carries rules + the ~10K-token orchestration BASE + your delta, so even a tiny
delta rides a preamble that clears every floor — the research-program 🔴 below INVERTS to ✅ the
moment it runs composed. The floor concern is now leaf-binding-only.

Measured 2026-08-09:

```
pov-program            ~12.3K  ✅        network-provisioning   ~7.2K  ✅
pipeline-orchestrator   ~9.9K  ✅        terraform-iac          ~6.0K  ✅
artifact-synthesis      ~9.8K  ✅        kubernetes-gitops      ~5.7K  ✅ (only ~1.6K margin)
research-program        ~2.9K  🔴 BELOW THE HAIKU FLOOR
```

The scaffold authored for the first research protocol is **already under it**. That is harmless on the
harness tier (composed rides the base past every floor), and becomes real only if a protocol this
small is ever bound singly to a LEAF template. *(2026-08-11: that scaffold now lives ONLY in the DB row — it was
removed from the seed so deploys don't clobber the author's work-in-progress; see §7's removal note.)*

**What to do**: don't pad a protocol to hit a number — that is exactly the prompt cruft the audit
guidance says to remove. Instead:
1. **Know which injection path yours uses.** On the harness tier (composed or legacy load-all)
   the combined preamble clears every floor and this does not apply.
2. **If yours will be bound singly, measure it** — `client.messages.count_tokens` against the model
   that will actually serve it, not a guess.
3. **Check `cache_creation_input_tokens` on the first real run.** A zero with no read is the
   signature. It is the only observable, because nothing errors.

⚠️ **Mitigating fact, don't lean on it**: render order is `tools → system → messages`, so the
cached prefix is *tools + preamble* and MCP tool schemas may lift a small protocol over the floor.
But caching is only enabled when tools are present at all
(`agentic-tool-loop.ts:266`) — so a small protocol on a tool-less path was never caching anyway.

*(Source: `claude-api` skill → `shared/prompt-caching.md`; measurements in
`cline_docs/reviews/cache-breakpoint-split-2026-08-09/`.)*

---

## 2. What you inherit and CANNOT change (the substrate)

Design **within** these. A protocol cannot override them, and a protocol that assumes otherwise
fails in ways no happy-path test will show.

| invariant | where | consequence if you design against it |
|---|---|---|
| **Stage law** — the dependency cascade is stage-scoped (`AND t.stage_id = …`) | `taskReadyReactorService.ts` | a cross-stage edge **silently never fires**. Program children must be siblings in ONE stage. |
| **CC6** — a PIPELINE-with-deps never auto-queues; dependency-completion is its only auto-start path | `taskReadyReactorService.ts` | a child pipeline with no incoming edge and no gate simply never starts |
| **Cycles are rejected** at write time; the topological sort throws | `task-update-handler.ts`, `graph.ts` | no back-edges. Iteration must be **unrolled** (see §6) |
| **`MAX_DEPTH` 20** on dependency chains | `lib/utils/graph.ts` | deep chains throw |
| **Gates are template-less `APPROVAL` tasks** | design D4 | give a gate a template and the reactors will try to run it |
| **Contracts are accepted only at `task.create`** | CC7 | forces the two-execution CREATE choreography (§5) |
| **`report.md` is gated to leaf (zero-dependent) non-PIPELINE tasks** | `agentArtifactPolicy.ts` | a node with dependents produces `result.json` only |
| **One completion invariant** — the 4-point PIPELINE check | `complete-task-terminally.ts` | you cannot complete a PIPELINE task with non-terminal children |

## 3. What you CAN change (this is most of the design space)

All protocol prose. Nothing here is platform-enforced:

- **the graph shape** — parallel, sequenced, grouped, or something new (`PROGRAM-COMPOSITION-CATALOG.md`)
- **the number and placement of gates** — `pov-program`'s three approvals are prose, not platform
- **the child cap** — `pov-program`'s "at most 8 child pipelines" is one sentence in its body
- **the release predicate** — what `programReleasable` ANDs over
- **whether there is an integration reviewer at all** (`pov-program` has Node C; yours needn't)
- **the roles you spawn** and what each produces

---

## 4. Your protocol is a DELTA, not a standalone document

This is the single most misunderstood thing at this tier, and it was measured on 2026-08-08.

`pipeline-orchestrator-protocol` is the **de-facto harness operating base**. Every other protocol
is a delta on it, and **no delta defines all three modes**. `pov-program`'s entire ORCHESTRATE
coverage is one table row saying *"per the default orchestrator's ORCHESTRATE rules"*.

Under composed injection the base is ALWAYS present by construction (base + your one delta —
that is the composition), so this works and is now the designed shape rather than an accident of
load-all. **Write your protocol the same way**: state what differs, delegate the mechanics.
New hard rule (R8's cross-delta ban): a delta may lean on the BASE only — never on another
delta, which is no longer in the same prompt.

Two kinds of dependence, which fail very differently — know which you are writing:

- **Kind A — delegation** (*"see `pipeline-orchestrator-protocol` Step 5a for tool-call mechanics"*).
  If the base is ever absent this is **loud**: the agent reaches a step with no syntax and flails.
- **Kind B — override** (*"MIN across children, never the default orchestrator's average"*).
  If the base is absent this is **silent and self-concealing**: the sentence reads as complete, the
  agent does the right thing, and nothing observable changes.

Prefer Kind A phrasing. Where you must override, **state the rule self-containedly** rather than
only by contrast, so the sentence survives without its referent.

⚠️ Also inherited: `UNIVERSAL_AGENT_RULES` is prepended once at seed time — a **behavioural** base
(never fabricate, trust verified state, turn efficiency). It carries **no** mode semantics and no
tool-call mechanics. Don't restate it; don't rely on it for operations.

⚠️ **GS8** — the terminal `## VERDICT:` grammar is canonical in `ROLE_GUIDANCE_LIBRARY`. Protocols
**reference** it, never redefine it. Pinned by `test:parse-verdict`.

---

## 5. The two-execution CREATE choreography (mechanical, not stylistic)

If your model uses interface contracts, CREATE **must** span two harness executions:

1. **PLAN** — spawn the planning child only.
2. **PLAN-SPAWN** — on that child's completion retrigger, read its plan and create the gate + child
   pipelines *with* their contracts.

Why it can't be one execution: contracts are accepted **only** at `task.create` (CC7), and PIPELINE
children start **only** via dependency-completion (CC6). Both facts are platform, not prose.

**Reading the planning child's output**: it is a CHILD, not a §6 dependency, so its deliverable is
**not** auto-chained. Retrieve it with
`perform(action:"agent.results", taskId:"<child id>", verbose:true, limit:1)`.
`verbose:true` is load-bearing — without it the 3 KB cap returns a lean card whose only body
pointers are **client-only** `fetch(id:)` hints, a dead end on the engine surface. `task.context`
gives the pointer, never the body. Every PLAN-SPAWN from v1.0.5→1.0.13 paid a failed turn to this.

---

## 6. Non-DAG structures: unroll, don't cycle

Back-edges are rejected at write time. But **the harness creates tasks at runtime**, so
iterate-until-converged is expressible as **unrolled generations**: each retrigger spawns a fresh
generation rather than revisiting a node.

⚠️ Bounded by **Guard 8** (`MAX_HARNESS_REACTOR_GENERATIONS`, default 10, env-tunable) — **but
Guard 8 may not be the bound that actually fires.** Generation *N+1* must depend on generation *N*
to receive its state (§6 chaining rides dependency edges), so the connected dependency component
grows monotonically, and `GraphLimits.MAX_NODES` (100) is enforced on exactly the `task.create` /
`task.update` calls a harness makes to wire the next generation. At ~10 tasks per generation, ten
generations is exactly 100 nodes — and the failure is a mid-run throw
(`Dependency graph too complex`), not a graceful stop. **Compute this for your shape before you
design on it**: open questions and cheap probes in
`cline_docs/follow-ups/structures-beyond-dag-2026-08-08.md`. Guard 8 was
built as a **runaway backstop, not an iteration budget**, and nobody has deliberately used it as a
convergence bound. If your model depends on it, say so explicitly in the protocol body and raise it
with `pipeline-harness-specialist` first — you are overloading a safety mechanism, which is
legitimate but must not be silent.

Not supported at all: agent-pull/blackboard models (work is *pushed* by dependency-completion) and
Petri-net token multiplicity.

Three-level nesting (program → program → pipeline) is **untested**. Nothing obviously blocks it; no
run has tried it. Probe before promising it.

---

## 6b. Lifecycle: you author in DRAFT, and testing is the awkward part

*(Unnumbered insertion — deliberately `6b` rather than a new `7`, so the existing section numbers
do not shift. Renumbering a live doc is how a load-bearing clause gets displaced: run 15 shipped a
non-minimal aggregate because a spec edit renumbered a new clause into the slot held by the
minimality check, and two successive reviews then never performed it.)*

### The states

| state | injected? | you can run it? | use it when |
|---|---|---|---|
| `DRAFT` | **no** — never composed; a PROGRAM-tier stamp naming it HARD-FAILS (`PROTOCOL_ROW_NOT_ACTIVE`), a leg-tier stamp degrades base-only + warn | no | authoring — "not yet runnable" (under composed injection, non-injection-elsewhere is automatic; see §6b) |
| `ACTIVE` | **yes — into EVERY PIPELINE task, platform-wide** | yes | testing, and once live |

`status` is per-entry in `scripts/seed-protocol-prompts.ts` and **defaults to `ACTIVE`**, so you
must ask for `DRAFT` explicitly:

```ts
status: 'DRAFT',   // reserves the name + entry; injected nowhere
```

### Why `DRAFT` and not "just remove the `protocol` tag"

The tag lever is tempting and half-works. There are **two** injection queries
(`execution-system-prompt.ts`) and they filter differently:

```
loadProtocols:true       → where { tags has 'protocol',      status: 'ACTIVE' }  (legacy load-all)
loadProtocols:'composed' → base:  { tags has 'protocol-base', status: 'ACTIVE' }
                           delta: { name: <task stamp> }   ← no tag filter, no status filter
                                    (status checked AFTER load: program-tier non-ACTIVE throws,
                                     leg-tier degrades base-only — the §6b tier-split)
named-single             → where { name: …,                  status: 'ACTIVE' }  ← no tag filter
```

Removing the tag blocks the first path only — a tag-less row is **still reachable by a template
that binds it by name**. `DRAFT` blocks both, and keeps the row visible to protocol tooling,
queries and greps (a tag-less protocol row silently drops out of every `'protocol' = ANY(tags)`
audit, including the ones in this directory).

### Testing under composed injection (2026-08-17 — the platform-wide-exposure era is over)

**Per-protocol injection shipped** (WS1 Phase C, `cline_docs/reviews/ws1-phase-c-2026-08-17/`):
the harness prompt is COMPOSED — the orchestration base plus the ONE protocol the task's stamp
names. Flipping your row to `ACTIVE` no longer broadcasts it into every PIPELINE prompt: a
protocol reaches a prompt **only when a task's stamp names it**, so testing is scoped to the tasks
you create with your token. The old checklist (scoped ACTIVE windows, announcing the exposure,
flipping back between rounds) is retired — the exposure it managed no longer exists.

What `DRAFT` means now — **"not yet runnable," no longer "not yet broadcast"**:

- Non-injection-elsewhere is automatic under composition (a stamp must name you), so `DRAFT`'s
  old broadcast-protection purpose is moot. Its surviving meaning is the runnability gate, and
  the two TIERS treat it differently — this is the part that can surprise you:
- ⚠️ **PROGRAM tier**: a task stamped to a program protocol whose row is not `ACTIVE`
  **HARD-FAILS by name** (`PROTOCOL_ROW_NOT_ACTIVE`). Deliberate: the base carries **zero
  PLAN-SPAWN content**, so a program harness composed on the base alone would not flail — it
  would plausibly synthesize a malformed one-child "program". Registering your name early in
  `PROGRAM_PROTOCOL_NAMES` (§7) plus a `DRAFT` row therefore means test tasks fail LOUDLY with
  your protocol's name in the error until you flip `ACTIVE` — which is the designed lifecycle,
  not a bug to work around.
- **LEG tier**: a stamped-but-non-`ACTIVE` leg protocol degrades to **base-only** with a loud
  warn + a degradation fact on the execution (`protocolInjection.degraded`) + the base's misroute
  guard as the agent-side observable. A cheap **probe run** (one small task with your token,
  before flipping ACTIVE) shows you exactly that degradation signature — useful for verifying
  your token/stamp wiring without your protocol's body in play.

Still true and still yours to keep sharp: the **"When to Use"** section — it no longer steers
routing (the stamp does), but it is what a human reads to pick the right token, and the fences
key off the binding it documents.

### Going live, and coming back

- **Live**: replace the scaffold body, `status: 'DRAFT'` → `'ACTIVE'`, `npm run seed:protocols`.
  The production deploy auto-seeds protocols, so it ships on merge.
- **Verify which state actually landed** — do not assume:
  ```sql
  SELECT name, status, tags, length("promptText")
  FROM agent_prompt_library WHERE 'protocol' = ANY(tags) ORDER BY name;
  ```
  ⚠️ There is **no freshness checker for `agent_prompt_library`** (`report:template-freshness`
  covers `agent_templates` only) and prompt rows are GUI-editable, so the DB is the only truth.
- **Retiring**: flip back to `DRAFT` (or `DEPRECATED`) rather than deleting the row — the name
  stays reserved and run history stays interpretable.

⚠️ **A GUI flip is TRANSIENT — the seed script is the source of truth.** The prompt-library editor
does expose a status control (`PromptEditor.tsx`, and the PUT applies it), so you *can* flip a row
to ACTIVE from the GUI — useful for a quick local probe. **But the production deploy runs
`seed:protocols`, and the update path writes `status` from the seed entry, so your GUI change is
silently reverted on the next deploy.** The durable flip is the one-word edit in
`scripts/seed-protocol-prompts.ts`.

This is the OPPOSITE of the `agent_templates` trade, and confusing them costs a debugging session:

| surface | deploy | the hazard |
|---|---|---|
| `agent_templates` | does **not** re-seed (deliberately, to protect GUI edits) | rows go **stale** — hence `npm run report:template-freshness` |
| `agent_prompt_library` | **does** re-seed every deploy | GUI edits are **silently clobbered** |

Neither hazard has a detector on the prompt-library side. "I changed it and it went back" is the
symptom; the seed entry is the answer.

**Live example — and a deliberate exception to the rule above** (2026-08-11):
`research-program-protocol` exists as a `DRAFT` DB row with its name already registered in
`PROGRAM_PROTOCOL_NAMES`, but it is **NOT in the seed** — its entry was removed while the model is
being authored directly on the row, precisely so the every-deploy re-seed cannot clobber that work.
The cost is stated in the seed's tombstone comment: the row is DB-only (no durable source) until
authorship finishes, and the finished body MUST come back into the seed with (or before) the flip
to `ACTIVE` — after which the orphan guard stops 🔴-warning about it. Both hazards this section
describes still apply to every OTHER protocol; the exception is scoped to active authorship only.

---

## 7. Registration — the ordered checklist

1. **Author the protocol body** as a `const` in `scripts/seed-protocol-prompts.ts`, and add its
   `PROTOCOLS[]` entry with `tags: ['protocol', 'domain:<family>']`.
   The `domain:*` axis is real and already in use — `domain:program`, `domain:provisioning`,
   `domain:synthesis`. `pipeline-orchestrator-protocol` is the only row with **no** domain tag,
   which is how you can tell it apart. Give yours its own family so a future tag-scoped budget
   (WS3) can carry it separately.

2. **Set a `version`** in the entry. Absent ⇒ it defaults, and your changelog has nowhere to live.
   Every protocol here carries its history in that comment; follow the convention.

3. 🔴 **Register the name in `PROGRAM_PROTOCOL_NAMES`**
   (`lib/agents/harness/program-protocol.ts`). **One line, and it is not optional.**
   **Register it EARLY — while the protocol is still DRAFT.** Registering only once it goes live
   means every run before that had no belt and no stamp, silently. It is cheap to register early
   and silent to forget. `research-program` is registered today against a DRAFT row, deliberately.

   Without it your program silently loses:
   - the **F12** structural interface-contract belt (`prepare-task-for-execution.ts`), and
   - the **F10** `programConfidence` stamp (`complete-task-terminally.ts`).

   No error, no log — the guards simply don't apply. This fails **closed** by design: a
   name-pattern match would be worse, because inheriting `programConfidence` wrongly stamps a false
   fact. Since WS2 Phase A (2026-08-17) registration gates tier membership on the **stamped
   canonical name** (`task.metadata.protocol`, resolved once from the title at first execution),
   evaluated at READ time — so registering a name is RETROACTIVE over already-stamped tasks, which
   is exactly why registering early is cheap and forgetting is silent. Add the name and
   `npm run test:program-protocol-token`.

4. **Author any new roles** in `ROLE_GUIDANCE_LIBRARY` — and name the step explicitly in whatever
   spec you write. It is baked into `promptTemplate` at seed time and is the axis the LLM actually
   reads; a missing entry silently bakes generic guidance. CI (`validate:role-guidance-coverage`)
   backstops it, but specify it up front. A 2026-06-16 spike omitted this step and nearly shipped.

5. **Seed as `DRAFT`** — `status: 'DRAFT'` in the entry, then `npm run seed:protocols`
   (per-row idempotent upsert). **See §6b for the full lifecycle**: why `DRAFT` and not
   tag-removal, the platform-wide exposure that testing requires, and how to flip.
   The production deploy auto-seeds protocols, so yours ships on merge — harmlessly, as DRAFT.
   ⚠️ **Templates do NOT.** If your model needs new agent templates, seeding them is a **manual
   production step** (`scripts/seed-program-templates.ts` is the precedent). Protocol-ships-but-
   template-doesn't is invisible until a run fails.

6. **Verify what actually landed**, don't assume:
   ```sql
   SELECT name, version, tags, length("promptText")
   FROM agent_prompt_library WHERE 'protocol' = ANY(tags) ORDER BY name;
   ```
   ⚠️ There is **no freshness checker for `agent_prompt_library`** — `report:template-freshness`
   covers `agent_templates` only, and prompt rows are GUI-editable. Version equality is decent
   evidence, not proof of body equality.

7. **Launch** with the token in the task title: `… (protocol: <your-name>)`.
   ⚠️ Since WS2 Phase A (2026-08-17) the token is a **create-time input, consumed ONCE**: at the
   task's first execution the platform resolves it into the write-protected
   `task.metadata.protocol` stamp. **Editing the title afterwards changes nothing** (a
   disagreement warns; the stamp governs) — before first execution, editing the title IS the
   re-route channel. The harness still selects its protocol by matching the token against each
   injected protocol's "When to Use" (Phase C moves that selection platform-side). Give yours a
   sharp, discriminating "When to Use" — that section is the routing mechanism, not decoration.

---

## 8. Validate before you trust it

- `npm run test:program-protocol-token` — the name is registered, the resolver stamps it canonically, and tier derives from the stamp (32 pins incl. the no-library-I/O and disjunct-removal gates)
- `npm run test:parse-verdict` — you referenced the VERDICT grammar, didn't redefine it
- `npm run test:reactor-race-guard` — nesting/cascade pins still hold
- **A live run** on a throwaway POV — which requires flipping to `ACTIVE` first (§6b: this exposes
  your protocol to every PIPELINE prompt for the duration; scope the window and flip back).
  Everything above is static; none of it proves an agent follows your prose. Write the verification doc **at test time**, not reconstructed afterwards.
- Then read `PROGRAM-RUN-FORENSICS-GUIDE.md` and hand-recompute your release predicate from the
  persisted facts. If you cannot, neither can a reviewer.

---

## 9. Gotchas (all observed, none hypothetical)

- **The title token is a create-time INPUT, not a live channel (fixed WS2 Phase A, 2026-08-17).**
  Historically this bullet read: *"a harness can rename its own task and disable its own guards
  mid-run, with no error"* — true until Phase A, and the incident record stays because it is why
  the stamp exists. Today: the token is resolved ONCE at first execution into the write-protected
  `task.metadata.protocol` stamp; a post-stamp rename moves NO guard (F12/F10 read the stamp; a
  title/stamp disagreement warns as `PROTOCOL_TITLE_STAMP_MISMATCH`); a task-path write to
  `metadata.protocol` returns 400 `PROTOCOL_STAMP_IMMUTABLE`; and metadata writes MERGE on every
  surface, so omission cannot erase the stamp either. The residual: pre-Phase-A tasks are covered
  by a transitional stamp-OR-title disjunct until the recorded backfill
  (`scripts/backfill-protocol-stamps.ts`) — its removal is test-gated. Still don't build anything
  NEW on the title: it is an input, and only until it is consumed.
- **A child created WITHOUT its token silently routes to the default orchestrator** — generic
  decomposition, no domain chain, nothing throws.
- **Confidence is not a gate input**, at any tier. A 45-vs-92 pair on byte-identical inputs
  established that `approved/NN` carries verdict *direction*, not correctness. Gate on outcomes and
  facts. Scores are still stamped as recorded facts.
- **Prose guards in this domain have failed at least once each; mechanical ones have held.**
  Minimality was checked in exactly one prose clause, an edit displaced it, and two successive
  reviews never performed it. If a check is load-bearing, mechanise it and treat prose as advisory.
- **A non-terminal leg hangs the whole program** — the completion guard never satisfies. Six
  terminalization classes exist for this (F16/F17/F20/R4/PRE_FLIGHT_BAIL/duplicate-halt). If you
  invent a new way for a node to settle without completing, you have invented a seventh; raise it.
- **Don't reach for the 1-hour prompt-cache TTL** as a cost win — see
  `cline_docs/follow-ups/resolvedat-cache-prefix-2026-08-08.md`. It would cost 2× to write and buy
  nothing today.

---

## 10. References

- `PROTOCOL-AUTHORING-GUIDE.md` — **the umbrella writing/maintenance rules for ALL protocol
  classes** (layering, closed vocabularies, derive/consume, duplication discipline, change
  procedure). This document owns program-tier STRUCTURE; that one owns the prose rules.
- `PROGRAM-USE-CASE-DESIGN-PLAYBOOK.md` — designing a use case on an existing model
- `PROGRAM-COMPOSITION-CATALOG.md` — the shape map (S0–S3) and selection axes
- `PROGRAM-HARNESS-USER-GUIDE.md` — running one
- `PROGRAM-RUN-FORENSICS-GUIDE.md` — assessing a run from persisted records
- `ADD-A-PIPELINE-HARNESS-AGENT.md` — the leg-tier equivalent of this doc
- `cline_docs/reviews/program-architect-design-2026-07-15/design-proposal.md` — D1–D12, why the
  composition machinery is shaped as it is
- `cline_docs/follow-ups/pluggable-program-protocols-2026-08-08.md` — the open work on making
  protocol injection per-protocol rather than load-all

---

## Appendix A — the `research-program` rename decision (OPEN, deliberately)

**Status**: 🟡 **DEFERRED by decision, 2026-08-08.** Not an oversight. Revisit when the student
picks a composition structure.

### The decision

`research-program-protocol` was seeded under a name that §1c says not to use: *"research"* names
a **phase of work**, not the work. It was chosen anyway, knowingly, because **you cannot name a
shape you have not designed yet** — and a wrong-but-honest placeholder beats inventing a
structural name that the eventual structure contradicts.

So the rename is deferred until the student's composition model exists. At that point the name
should describe the **model**, the way every shipped protocol does (`network-provisioning`,
`terraform-iac`, `pov-program`).

### The real deadline is `DRAFT` → `ACTIVE`, not "the first run"

§1c says "rename before the first run anyone will cite". For *this* protocol there is a sharper and
more mechanical line, and it is worth knowing because it makes the deferral safe:

**The protocol seed has no rename path.** It matches an existing row by
`findFirst({ where: { name } })` (`seed-protocol-prompts.ts:3241-3243`) and `name` is `@unique`, so
changing the name in the entry **creates a NEW row and orphans the old one** — it does not rename
anything.

There is a precedent to copy, and it is a *hand-rolled per-script block*, not a framework: two
template seeds carry a legacy-name migration that renames rows **in place** before the idempotent
upsert — `HARVESTER_LEGACY_NAME` in `scripts/seed-artifact-synthesis-templates.ts:66-71` (the
2026-04-15 "Research Analyst" → "Artifact Harvester" rename) and
`scripts/seed-mcp-service-integration-template.ts`. Its stated reason is exactly the one that
applies here: *"we keep the same row (update, not delete+create)"*, so existing references stay
valid. **Neither `seed-protocol-prompts.ts` nor `seed-harness-template.ts` has one.**

That makes the cost a step function:

| rename while… | what happens to the orphan | cost |
|---|---|---|
| **`DRAFT`** (today) | orphan is DRAFT ⇒ injected nowhere, invisible to routing | **≈ zero** — delete the row at leisure, or leave it |
| **`ACTIVE`** | orphan stays ACTIVE and protocol-tagged ⇒ **still injected into every PIPELINE prompt**, a stale duplicate competing for a `take: 10` slot | manual row deletion required, and a live duplicate until you do it |

**So: rename while it is still DRAFT and the whole question costs nothing.** After it goes ACTIVE
you inherit a cleanup step and a window where two versions of the same protocol are both live.

### Rename checklist (when the trigger fires)

1. `scripts/seed-protocol-prompts.ts` — the `const` identifier, the `PROTOCOLS[]` `name`, the
   `description`, and the changelog line in `version`
2. `lib/agents/harness/program-protocol.ts` — `PROGRAM_PROTOCOL_NAMES` (the **short** form; the
   library row is `<name>-protocol`, the title token is `(protocol: <name>)`)
3. Any tasks already STAMPED with the old canonical name — their stamped name leaves
   `PROGRAM_PROTOCOL_NAMES` the instant the list changes, silently losing F12 and F10. Since WS2
   Phase A retitling CANNOT recover them (the title is inert post-consumption and the stamp is
   write-protected): run `scripts/backfill-protocol-stamps.ts --rename <old-canonical>
   <new-canonical> --write` — the dedicated platform migration path
4. **Prefer an in-place rename over an orphan**: add a legacy-name migration block to
   `seed-protocol-prompts.ts` following the `HARVESTER_LEGACY_NAME` precedent (rename the row by
   its old name before the upsert runs), rather than seeding a new row and deleting the old one.
   Same row = existing references stay valid. If you skip that, `npm run seed:protocols` then
   **delete the orphaned row yourself** — nothing removes it for you.
5. `npm run test:program-protocol-token`
6. Re-check §1a: does the new name still sort AFTER `pipeline-orchestrator-protocol`?

### Candidate names, contingent on the structure

Pick for the model, not the project. All of these sort after the base (§1a):

| if the structure is… | candidate |
|---|---|
| iterative / converging via unrolled generations (§6) | `staged-program`, `refining-program` |
| strictly ordered legs with handoffs | `sequenced-program` |
| a genuinely new topology class | name the topology |
| still exploratory when it ships | keep `research-program` — **and record that as a decision here**, not a default |

That last row matters: if the name survives, it should survive because someone chose it, not
because the trigger was never checked.
