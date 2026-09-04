# Autonomous Delivery Stack

**Purpose**: A landing map for the full set of components that move pAIchart toward its north star — **autonomous delivery of POV outcomes from objective to accepted deliverable, without human orchestration**.
**Status**: Living doc — shipped elements marked ✅, roadmap elements marked 🗺️, gaps to true autonomy marked ⚠️.
**Created**: 2026-04-15 | **Updated**: 2026-07-16 (added Capability Statements; Layer 6 harness-of-harnesses partially realized by the Program Harness / pov-program layer)
**Audience**: Engineers asking "where does my concern fit?" and "what's the path from here to full autonomy?"

---

## The North Star

> A human describes a sales opportunity. The platform generates the POV structure (phases, stages, pipeline tasks), the Pipeline Harness decomposes each pipeline into specialist work, agents execute with confidence-scored outputs, reactors cascade work and escalate when needed, customer-facing artifacts land in their hands. Humans intervene only when the system flags it — and each intervention feeds back into template improvement. The POV delivers itself.

We are not at the north star today. We are at a stage where the **inner loop** — "given a PIPELINE task, produce a completed stage of specialist deliverables" — is shipped and validated end-to-end. The **outer loops** — phase cascade, POV-level orchestration, outcome feedback — are partially architected and partially greenfield.

### North Star, restated (2026-09-01) — the Portfolio Steward

The end state now has a name and a settled tier vocabulary (Steve + pipeline-harness, 2026-09-01):
**Pipeline → Program → Portfolio** (scope nouns, matching the P3M ladder a customer PMO already
speaks; a POV IS a portfolio of programs), and at the portfolio tier runs a long-lived agent, the
**Portfolio Steward** (role noun, paired with its tier the way Program Architect pairs with
program). "Steward" is deliberate: it holds the POV in trust for an owner who retains authority —
it watches every event, learns from each round's outcome, authors the next round's description
(the only agent-reaching channel), launches rounds, and PROPOSES gate-shaped decisions. It never
releases a gate. The name encodes the authority model.

**Architecture ruling — episodic, never a daemon.** "Long-running" means a long-lived POV-root
task whose brain runs episodically: reactor-woken, re-hydrated from durable STRUCTURED state, then
quiet — the same proven pattern as the program root, one tier up. Not a persistent conversation
(context rot, cost, no clean recovery) and not an agent-written free-form memory (Protocol 10 +
injection — see the WikiSkill assessment). **The Steward's memory is Layer 7a's ledger**: it wakes
to facts ("P4-class refusals: 1, overturned; template X degrading; confidence uninformative"), not
to a transcript it must re-derive lessons from — re-derivation is the blind-re-roll problem at POV
scale.

**Build path (each stage earned, per the Layer-5 ordering ruling):** 7a ledger (the Steward's
memory — buildable now) → Layer 5 cascades with evidence-grounded feedback (its hands) → the
Steward itself (a `pov-portfolio` protocol on the EXISTING harness machinery — the program tier
already proved the recursion; role key `portfolio_steward`) → 6b/7b grow into it when customers
exist. Nothing is thrown away: the episodic-with-durable-state engine has been running a
long-lived agent at program scale since 2026-07.

---

## Capability Statements

Prose summaries of the two shipped engines, in capability-statement register (for positioning / outreach /
onboarding). They describe Layer 2 (Pipeline Harness) and its composition layer (Program Harness — the
"harness-of-harnesses" Layer 6 anticipated; see that layer for the remaining gap).

### Pipeline Harness — autonomous multi-agent delivery engine

Designed and shipped a meta-agent that turns a single high-level objective into a reviewed, multi-specialist
deliverable with no human orchestration in the loop. Given an objective, the harness decomposes it into 3–7
typed specialist tasks, assigns the right agent template to each, wires their dependencies into an execution
DAG, and then exits — deliberately never running the children itself. An event-driven reactor layer
(PostgreSQL NOTIFY/LISTEN) cascades each child as its dependencies clear, auto-chains every upstream
deliverable into the next agent's prompt, and re-enters the harness exactly once to synthesize the final
customer-facing artifact.

The system is a planning / synthesis engine, not an actuator, and its safety model is built around that
constraint. Because the autonomous loop assumes children do idempotent, re-runnable work — producing text —
any use case whose work has external side effects (mutating infrastructure, sending mail, moving money) keeps
the side-effecting act outside the loop: the harness produces an approved-but-unapplied deliverable, and the
apply step stays human-gated. That discipline is enforced by four layers: reactor re-entry, retrigger chains
bounded by a per-harness generation budget ("Guard 8") that makes runaway self-triggering impossible, a
confidence-gated quality loop (accept / re-execute-with-diagnostic / escalate-to-human), and a server-side
anti-fabrication invariant that structurally prevents an agent from reporting a pipeline complete when its
children aren't.

Proven in production across four shipped domains — generic objective-synthesis plus real-device-validated
network, Kubernetes/GitOps, and Terraform/Cloud-IaC provisioning pipelines — each producing an
approved-but-unapplied infrastructure change against a customer's real state, read-only by construction, with
credential-free self-provisioning and secret-redaction guards. A typical six-task pipeline completes
end-to-end in ~8 minutes. The architecture generalizes through a repeatable use-case design playbook, so a
new autonomous domain is a configuration-and-review exercise rather than an engineering rewrite.

### Program Harness — autonomous multi-pipeline delivery across domain boundaries

Designed and shipped a composition layer over the pipeline engine that turns a single design artifact — a
topology-as-code file plus a requirements spec — into a reviewed, multi-domain, approved-but-unapplied change
package spanning separate vendors, tools, and approval teams. Given the design, a Program Architect emits a
plan and a binding interface contract (the invariants every pipeline must honor); a human releases a mandatory
plan-approval gate; N domain pipelines then run — in parallel against the shared contract, or DAG-sequenced
when a downstream design genuinely needs an upstream's designed output, with each upstream deliverable
auto-chained into the next pipeline's prompt — and a program integration reviewer checks that the
independently-produced slices cohere end-to-end from structured facts, not prose.

Like the pipeline engine it composes, the program is a planning / synthesis engine, not an actuator, and its
safety model lives at that seam. It emits approved-but-unapplied change packages and can recommend the safe
apply order, but the apply step stays human-gated and out-of-band. Release is a deterministic AND over child
facts — every leg approved, every reviewer score above threshold, cross-pipeline coverage complete — emitted
as a machine fact (`programReleasable`) that a human converts into the release decision, never as the decision
itself. The gate is facts-only by construction: an LLM cross-domain coherence opinion may ship as an advisory
but can never gate release deterministically, and no program-level judgment is re-derived from a chained
deliverable's prose. The human approval gates — the plan gate plus one per approval team — are dependency
nodes the platform can never auto-complete, and a hard cap on child pipelines bounds blast radius and cost.

The composition mechanics — a structured interface-contract channel that loud-fails if a pipeline reaches
execution without its contract, inter-pipeline dependency chaining with a settledness guard so a half-built
design is never chained forward, the deterministic release gate, and cross-pipeline conformance review — are
built and shipped. The parallel-coordination path is proven live (network and Terraform pipelines run
concurrently against one contract, producing the first end-to-end green program); the sequenced-dependency
path is mechanism-complete pending its first full validation run. The architecture generalizes through a
program composition catalog and a use-case design playbook, so a new multi-domain program — multi-vendor
firewall policy across a path of firewalls, a multi-cluster GitOps rollout, a multi-account cloud landing
zone — is a configuration-and-review exercise (author the topology and the contract; reuse or configure each
leg's domain) rather than an engineering rewrite. Canonical docs: `../../pipelines/PROGRAM-HARNESS-USER-GUIDE.md`
and its three siblings (design playbook, composition catalog, run-forensics guide).

---

## The Stack

Ordered from bottom (execution primitive) to top (meta-level goal). Each layer depends on the ones below it.

### Layer 1 — Agent Execution Engine ✅ SHIPPED

**What**: Runs individual agent executions. LLM call, agentic tool loop, artifact persistence, status tracking.
**Where**: `lib/services/agentExecutionEngine.ts` (engine path, polled), `app/api/pov/agent/execute/stream/route.ts` (stream path, GUI-initiated).
**Authoritative docs**: `.claude/agents/agent-execution-specialist.md`
**Known structural hazard**: two parallel tool-loop implementations — see the specialist for the "audit both paths" rule.

### Layer 2 — Pipeline Harness ✅ SHIPPED (v3.3.0, validated 2026-04-14)

**What**: Meta-agent that decomposes a PIPELINE task into 3-7 typed specialist sub-tasks, wires dependencies, and (via reactors) delegates execution. Runs in three modes: CREATE (first run — decompose), ORCHESTRATE (rare — finish partial setup), SYNTHESIZE (auto-triggered — aggregate child results, complete self with confidence score).
**Where**: Template `Pipeline Harness` (in DB via `scripts/seed-harness-template.ts`) + protocol `pipeline-orchestrator-protocol` (in DB via `scripts/seed-protocol-prompts.ts`) + handler invariants + reactor-driven re-entry.
**Authoritative docs**: `PIPELINE-HARNESS-USER-GUIDE.md`, `automation-loop-closure-architecture.md`
**Specialist (to be created — see #76)**: `pipeline-harness-specialist` will coordinate across all touching specialists.

### Layer 3 — Seed Scripts ✅ SHIPPED

**What**: Content-management layer for protocols and templates in the database. Idempotent findFirst + update/create. Single source of truth for what ships to prod.
**Where**: `scripts/seed-protocol-prompts.ts`, `scripts/seed-harness-template.ts`, `scripts/seed-artifact-synthesis-templates.ts`.
**Authoritative docs**: Pattern #44 `agent-template-gold-standard-pattern.md`, Pattern #45 `prompt-library-gold-standard-pattern.md` (GS1-GS8 including Universal Agent Rules preamble and Template+Protocol Separation).
**Specialists**: `prompt-construction-specialist`, `template-system-specialist`.

### Layer 4 — Orchestration Reactors ✅ SHIPPED (2 of ~9)

**What**: Event-driven services that close automation loops between components. A reactor hooks a domain event (task completed, artifact created, confidence scored), checks guards, queues an orchestration action. Fire-and-forget, never blocks the emitter, always logs triggered AND skipped-because-X.
**Shipped (2026-04-14)**:
- `pipelineRetriggerReactorService` — triggers harness SYNTHESIZE when last child terminal (metadata-based detection via `metadata.pipelineStageId`)
- `taskReadyReactorService` — queues executions when deps satisfied OR task created/assigned dep-free. Two entry points: `maybeQueueReadyDependents` (cascade) + `maybeQueueIfDepFree` (kickstart).
**Authoritative docs**: Pattern #46 `orchestration-reactor-pattern.md`, `automation-loop-closure-architecture.md`.
**Specialist**: `event-system-specialist` (pattern in My Pattern Library).

### Layer 5 — Roadmap Reactors 🗺️ ARCHITECTED, NOT SHIPPED

Priority-ranked in `automation-loop-closure-architecture.md §Reactor Roadmap`:

| # | Reactor | Triggered by | Action | Blocks |
|---|---|---|---|---|
| 1 | Next-Stage Auto-Fire | All tasks in stage N terminal | Queue stage N+1's PIPELINE task | Multi-stage POVs self-delivering |
| 2 | Quality-Gate | task.complete with confidence < 50 | Re-run with diagnostic feedback | Pipeline self-correction |
| 3 | Artifact-Downstream | agentArtifact created with tag | Inject into dependent task's inputContext | Context chaining without explicit wiring |
| 4 | Phase-Transition | Last stage in phase terminal | Advance phase pointer, cascade to #1 | Phase-level automation |
| 5 | POV-Milestone | Scheduled date reached | Notification + optional status-report pipeline | Forecast drift alerting |
| 6 | Escalation | Confidence < 50 after retry OR FAILED twice | Notify POV owner with assembled context | Human-in-loop knowing WHY they're needed |
| 7 | Template-Degradation | Rolling success rate below threshold | Queue template-improvement specialist | Self-improving templates |

**Existing TODOs**: `TODO-EVENT-DRIVEN-PIPELINES.md` (#1), various others.

**⚠️ Ordering ruling (2026-09-01, Steve + pipeline-harness): build Layer 7a BEFORE the cascade
reactors (#1/#4), not after.** Two earned reasons. (a) The stage boundary is where the system
currently LEARNS: each round's task description is authored fresh with the prior round's lessons
(anti-pattern quotes, applied-world assumptions, clearances) — the ONLY agent-reaching channel
(HOWTO-use-program-harness 2.3.3). An auto-fired next stage either launches on a stale pre-authored
description (losing the mechanism that made R19→P4-Completion work) or needs a lesson-carrying
brain whose input is Layer 7a's data. Cascade-first = a faster loop that learns nothing between
iterations. (b) #2's diagnostic-feedback re-run carries a live-earned amplification hazard: feedback
into an automated re-run must be an EVIDENCE-GROUNDED stamped fact, never a raw reviewer narrative —
a false reviewer diagnostic invites the author to "fix" a correct package
(`cline_docs/follow-ups/r19-p4-reviewer-false-positive-2026-08-31.md` item 7). Layer 7a (run/verdict calibration — gate decisions vs eventual dispositions, by role and
template; data already persisted, retires the quarterly hand-tallies, activates #7) is that first
build; 7b (POV/customer outcomes) stays deferred until customer volume exists.

### Layer 6 — POV-Level Orchestration ⚠️ PARTIAL (harness-of-harnesses shipped; sales-input front-end still a gap)

**What**: Two distinct pieces were folded together here. (a) The **harness-of-harnesses mechanism** — a
meta-agent that plans and composes *multiple* pipelines into one reviewed, gated deliverable. (b) The
**sales-input front-end** — a component that takes a sales-opportunity spec (customer, objective, solution
area, timeline) and generates the full delivery structure (phase templates applied, stages sequenced,
pipeline tasks drafted).
**Status**: (a) **SHIPPED** as the **Program Harness** (`pov-program` protocol) — a Program Architect emits a
plan + interface contract, a human releases a plan-approval gate, N domain pipelines run parallel/DAG-sequenced
against the contract, and a program integration reviewer gates a deterministic `programReleasable`. This is
precisely the "harness-of-harnesses" the original path-forward anticipated. Docs:
`../../pipelines/PROGRAM-HARNESS-USER-GUIDE.md` + siblings; see also the Capability Statements above.
(b) **still a gap** — phase templates exist (`populate-phase-templates-improved.ts`) but no agent layer applies
them automatically from a sales input; `setup-demo-mode.ts` (dev-only) is the closest analog.
**Path forward**: the remaining Layer-6 work is the **sales-input → POV-structure generator** (the "POV
Architect" front-end) that would emit the phases/stages/pipeline-tasks a Program Harness then composes.

### Layer 7 — Outcome Tracking & Feedback Loop ⚠️ GAP (split 2026-09-01: 7a buildable now, 7b needs customers)

Outcomes exist at three granularities; only the top one is missing. The split exists because "Layer 7"
read as POV-only and made the whole layer look blocked on customer volume — it is not.

#### 7a — Run/Verdict Calibration (data EXISTS today; the build is aggregation, not signal capture)

**What**: Did a refused package get vindicated or overturned? Does confidence correlate with anything?
Is a reviewer's false-positive rate rising? Is template X's run-level success rate degrading?
Every steering question the platform currently answers by QUARTERLY HAND-TALLY (verdict-mismatch
tallies, the 2026-07-18 calibration study, retry-band suppression review, the R19 false-positive
finding) lives at this granularity.
**Status**: The raw dispositions are already persisted (verdicts, qualityGate outcomes, releasable
stamps, completion rounds, escalations — 56 archived legs / 20 rounds at 2026-09-01); nothing reads
them longitudinally.
**Components needed**:
- Disposition ledger queries (refused-and-vindicated / refused-and-falsified / approved-and-held /
  approved-and-overturned, by role and template)
- Exposure to reactors (activates #7 Template-Degradation at run granularity — a template degrades
  measurably across runs long before any POV closes; feeds #2's evidence-grounded-feedback constraint)
- Retires the health-run's manual tallies (verdict consumption, retry-band Phase 3 inputs)

**This is the "highest-leverage next build" named in How to Read This Doc and the Layer-5 ordering ruling.**

#### 7b — POV/Customer Outcomes (GAP — needs customer volume; the original Layer-7 text)

**What**: Did the customer accept the deliverable? Does template A win more POVs than template B?
**Status**: No POV completions to feed it (UAT); no external signal capture (customer acceptance, CRM).
**Components needed**:
- Outcome-recording channel (human marks POV as Won/Lost/Ongoing, or CRM integration writes the signal)
- Aggregation joining 7a's ledger to POV outcomes (confidence bucket × POV result, template × win rate)
**Build trigger**: customer volume. By then 7a is the proven pattern it plugs into (the same
shape-proven-one-level-down argument as Program Architect → POV Architect).

### Layer 8 — External Trigger Surface ⚠️ GAP

**What**: Reactors today fire on internal domain events. True autonomy includes reacting to external signals: webhooks from CRMs, emails from customers, scheduled events from calendars, status changes from external services.
**Status**: MCP Hub can *call* external services, but there's no standardized reactor surface for *receiving* external triggers.
**Candidate architecture**: Extend the reactor pattern with an "External Signal Reactor" class that subscribes to webhook deliveries and translates them into domain events.

---

## Pointer Table (at-a-glance)

| Element | Layer | Authoritative Doc | Specialist |
|---|---|---|---|
| Agent Execution Engine | 1 | `agent-execution-specialist.md` | agent-execution-specialist |
| Streaming Route | 1 | same + §Streaming Route | agent-execution-specialist |
| Pipeline Harness | 2 | `PIPELINE-HARNESS-USER-GUIDE.md` + arch doc | pipeline-harness-specialist *(to be created)* |
| Seed Scripts (templates) | 3 | Pattern #44 | template-system-specialist |
| Seed Scripts (protocols) | 3 | Pattern #45 | prompt-construction-specialist |
| Orchestration Reactors (shipped) | 4 | Pattern #46 + arch doc | event-system-specialist |
| Roadmap Reactors | 5 | arch doc §Reactor Roadmap | event-system-specialist |
| POV-Level Orchestration | 6 | *(not yet written)* | *(TBD)* |
| Outcome Tracking (7a run/verdict · 7b POV/customer) | 7 | *(not yet written)* | *(TBD)* |
| External Triggers | 8 | *(not yet written)* | *(TBD)* |

---

## How to Read This Doc

**If you're investigating a specific concern**: jump to the layer that owns it, follow the pointer to the authoritative doc or specialist.

**If you're making architectural changes**: check which layer you're modifying, check its dependencies (layers below it), audit the cross-refs in the authoritative doc for downstream impact.

**If you're planning new work**: Layer 7a (run/verdict calibration) is the highest-leverage next build (see the 2026-09-01 ordering ruling in Layer 5) — it retires recurring quarterly hand-tallies and is the prerequisite that makes the Layer 5 cascade reactors worth building. Layer 5 reactors each close a human-intervention loop but are parked behind that ruling; Layers 6-8 are greenfield but higher ambiguity (6b has a proven shape one level down).

**If you want to measure progress toward the north star**: count shipped reactors (2/9) and gap layers (6-8 are open). Progress is measured by how many events fire reactors automatically vs. require human nudge.

---

## Cohesion Rules for Future Docs

When adding a new doc in this area, follow these conventions so the stack stays mappable:

1. **Every new reactor** gets an entry in the event catalogue (`automation-loop-closure-architecture.md §Event Catalogue`) AND references Pattern #46.
2. **Every new specialist** gets a "My Pattern Library" section pointing at the patterns they use — don't duplicate pattern content in the specialist.
3. **Every new layer-component doc** gets an entry in the Pointer Table above and a one-line reference in the layer section.
4. **Cross-refs are bidirectional** — if doc A points at doc B, doc B's "Related" section points back at A.

---

## Open Questions

These don't have authoritative answers today — raise in your next harness-architecture session:

- **When do we migrate from inline hooks to an event bus?** The architecture doc says ~10 reactors. We have 2. Path to 10 is Layer 5 work. Threshold is a soft call.
- **Who owns Layer 6 (POV-level orchestration)?** Is it a harness-of-harnesses, or a different abstraction entirely (rule-based generator, LLM-driven architect)?
- **What's the outcome signal format?** CRM webhook, human UI checkbox, external test harness? Layer 7b can't progress without picking one (7a needs no external signal — its dispositions are already persisted).
- **Do we want reactors to run cross-POV?** Today each reactor fires in the context of one POV. Template-degradation and Escalation reactors would cross POV boundaries. Is that OK?

---

## Related

- `automation-loop-closure-architecture.md` — strategic view of reactors + event catalogue + scaling plan
- `Pattern #44 agent-template-gold-standard-pattern.md` — template authoring
- `Pattern #45 prompt-library-gold-standard-pattern.md` — protocol authoring + universal rules + template/protocol separation
- `Pattern #46 orchestration-reactor-pattern.md` — tactical reactor authoring
- `Pattern (draft) two-execution-path-drift-pattern.md` — structural hazard + audit checklist
- `PIPELINE-HARNESS-USER-GUIDE.md` — harness overview
- `TODO-EVENT-DRIVEN-PIPELINES.md` — next-stage auto-fire reactor plan
- `TODO-CASCADING-PIPELINES.md` — cross-stage/phase cascade plans

---

**Security posture for this stack**: `.claude/knowledge/pipelines/LLM-ORCHESTRATION-SECURITY-POSTURE.md`
— the orchestration-specific properties (binding-frame authority amplification, integrity-vs-sanitisation,
unsatisfiable-predicate guards, provenance forgery, co-location as authorization). Platform-internal
implementation detail stays in this directory; that document is the design-facing record.
