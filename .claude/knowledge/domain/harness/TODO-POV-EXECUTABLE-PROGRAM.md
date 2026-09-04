# TODO: POV as Executable Program

**Status**: **Sessions A+B SHIPPED (2026-07-15)** — Session A: all engine enablers (CC1 parent retrigger, CC2/2b PIPELINE-predecessor chaining + notChained facts, CC4 depth single-source, CC7 interfaceContract channel + loud-fail, `e466eeee`); Session B: `pov-program-protocol` (6 of 10 injection slots) + `program_architect` role + `scripts/seed-program-templates.ts` per the ADD canon and design-proposal v1.2 (D1–D12). **Note the derived choreography**: program CREATE spans TWO harness executions — PLAN (Architect only) then PLAN-SPAWN on the Architect-completion retrigger — because CC7 accepts the contract only at `task.create` and PIPELINE children start only via the dep-completion path (rationale in the protocol const's header comment, seed-protocol-prompts.ts). ⚠ Prod deploy: protocol auto-seeds on push; `seed-program-templates.ts` is a MANUAL prod step (ADD §7). **Next: Session C** — live validation per `cline_docs/reviews/program-architect-design-2026-07-15/PROGRAM-TEST-PLAN.md` (T2 minimal 1-pipeline program → T3 full network+terraform → T4 failure rounds). *(Pre-B state: materially de-risked 2026-07-14 — Phase-5 cascading proven live; see reframe below.)*
**Phase**: 6
**Created**: 2026-04-05
**Estimated Effort**: High (3-5 sessions) → **revised 2026-07-14: ~3-4 sessions for a topology-as-code program-MVP**
**Dependencies**: Phase 3 (event-driven), Phase 4 (pipeline templates), Phase 5 (cascading pipelines — **PROVEN 2026-07-14, see below**)

---

## 2026-07-14 reframe — design-artifact-driven programs (Steve + session findings)

The original framing below is "execute a pre-built POV structure." The stronger framing: **a design
artifact IS the program input** — a network topology + design requirements in, a whole multi-device /
multi-domain POV out, with today's pipeline harness runs (network-provisioning / terraform-iac /
kubernetes-gitops) as the program's CHILDREN. The recursion is natural because **a PIPELINE task is just
a task**: the harness's decomposition, dependency ordering, last-sibling retrigger, QA gate, and
completion stamp are all level-agnostic.

**Phase-0 probe — PASSED live (2026-07-14, and it caught + fixed the cascade's one real bug).** A
top-level PIPELINE task (`cmrkmy4z60009yx15yixfmqtu`, re-run 8) with a dependency edge on a trivial
manual-complete task **auto-queued 3 seconds after the dependency completed** and ran its children
unattended (harness template pre-assigned via `agent.configure`). **CORRECTION (2026-07-15 design panel):
the forward-cascade reactor IS stage-scoped** (`taskReadyReactorService.ts:156`) — the probe worked because
both tasks shared a stage. Design consequence: a program's child pipelines MUST be siblings in ONE
"Program: X" stage (design-proposal D3). The probe then exposed the gap: the auto-queued harness stayed `OPEN` (only the
agent.execute handler transitioned status), so the SYNTHESIZE retrigger's `status='IN_PROGRESS'` guard
silently never fired — **fixed same-day**: `createAgentExecution` now does OPEN→IN_PROGRESS at the
chokepoint (all entry paths), and the retrigger guard logs loudly on a wrong-status harness.
⇒ **Phase 5 (cascading pipelines) now works end-to-end**; "the POV runs itself" is a dependency-wiring
exercise (+ pre-assigning the harness template — the remaining `autoExecute`/auto-assign gap).

**Prerequisites that shipped since this doc was written (the program-level gate currency):**
- Structured child outcomes: `reviewerVerdict` (transcribed terminal `## VERDICT:` block),
  `metadata.qualityGate{outcome, reviewerScore, verdictMismatch}`, confidence aggregation — a program
  orchestrator consumes FACTS, not prose through an 8KB slice (verdict-misread fix,
  `cline_docs/reviews/harness-synthesize-verdict-misread-2026-07-14/`).
- result.json field-order contract (compact fields before bulky payloads) — child summaries are
  head-slice-visible by design.
- Three domain protocols (network / k8s / terraform) + neutral shared roles + the authoring canon
  (`.claude/knowledge/pipelines/ADD-A-PIPELINE-HARNESS-AGENT.md`) — a program protocol is "just another
  domain" whose specialists happen to be pipelines.
- In-agent-loop `agent.execute` prompt-returns (no wall-clock burn if a program harness ever executes
  a child pipeline in-loop); deploy self-seeds protocols.

**Market context (2026-07-15, verified deep-research — full report:
`MARKET-LANDSCAPE-AGENTIC-DELIVERY-2026-07.md`):** every ingredient is commoditizing (HITL primitives,
dry-run change packages, MCP-accessible digital-twin validation) but **the composition is unoccupied** —
no surveyed system spans physical+IaC+GitOps under an engagement-structure program with verdict-fact gates
and never-auto-actuate apply. Academic validation: Cornetto (ETH, 231 scenarios) — best LLM fully resolves
only 25% of config-repair scenarios; conclusion = LLM automation REQUIRES verification-gated iterative
workflows (our architecture). Nearest threats: Cisco AgenticOps (opposite trust posture), Forward AI
(validation leg expanding). Consequence for this plan: wire deterministic validation legs (Batfish/Forward
MCP) into Reviewer roles EARLY — consume them, don't rebuild them.

**The genuinely NEW work (difficulty order):**
1. **The Program Architect** — the hard cognitive piece: partition ONE coherent design into per-pipeline
   objectives WITH interface contracts between them (shared IP/VLAN/ASN plan the switch configs, IaC
   underlay, and k8s networking must all honor), emitted as §6 context for every child pipeline. Get
   this wrong ⇒ six individually-approved packages that don't compose. Needs its own role pair + a
   Protocol-2 specialist panel (pipeline-harness + architectural-review + task-dependency) before code.
2. **Ingestion — topology-as-code first, diagrams later**: `topology.json` (containerlab-style — the
   cEOS rig file is the exemplar) + `requirements.md` via URL in the task description (the descriptor
   pattern). Vision-parsing a diagram into that structure is a bolt-on, not a foundation.
3. **Cross-pipeline chaining**: chain a completed child PIPELINE's `report.md` (deliverable) rather than
   its forensic pipeline-index — one conditional in `context-chainer.ts`.
4. **Gates**: the phase-gate model below stands; qualityGate/verdict facts are the machine-readable
   currency for release decisions.
5. **Nesting hardening**: 10-protocol injection cap headroom; clobber-invariant assumptions
   (one-harness-per-stage) under nesting; budget/concurrency across ~6 pipelines × 4 children.

**Specialist decision (2026-07-15, Steve + session):** do NOT mint a program specialist yet —
`pipeline-harness-specialist` is the documented first responder for the program level (its config
carries the Program Harness section; discovery Phase 14 has the audits). **Mint trigger**: after
Session C, when pipeline-harness-specialist exceeds the Protocol-12 budget (~500 lines) or carries
3+ program-specific dated blocks — the split is then an EVICTION of the program sections, not fresh
authoring. **Name when minted: `pov-program-specialist`** (matches the protocol token; never
"program-harness-specialist" — grep/fuzzy-match collision with pipeline-harness-specialist).

---

## Introduction

Phases 3-5 build the components: auto-execution, reusable templates, and cross-stage cascading. Phase 6 combines them into a single concept: **the POV itself is an executable program**.

A POV's structure (phases → stages → tasks) IS the program definition. Phases are sequential blocks. Stages within a phase can be parallel or sequential. Tasks within a stage are a pipeline. A single "execute POV" command runs the entire thing.

This is the full realization of the vision document's most ambitious idea: the SE builds the POV structure (or selects a POV template), clicks "execute," and the entire engagement delivers itself.

## Objective

A user creates (or selects) a POV with pre-configured stages and pipeline templates. One command — `perform(action: "pov.execute", povId: "...")` — triggers the full cascade:

1. Phase 1's stages execute in order (or parallel, based on configuration)
2. Each stage's PIPELINE task orchestrates its work tasks
3. When a stage completes, the next auto-triggers
4. When a phase completes, the next phase's stages begin
5. The POV delivers all results — assessments, audits, reports — without intervention

**End state**: "Execute POV" is one command that produces a complete customer deliverable.

## Conceptual Design

```
POV: Acme Security Assessment
│
├── Planning Phase (sequential)
│   ├── Stage 1: Requirements [Pipeline Template: Stakeholder Analysis]
│   │   ├── PIPELINE (autoExecute: true)
│   │   ├── Stakeholder interviews (ANALYST)
│   │   └── Scope definition (ARCHITECT)
│   │       ↓ cascade
│   └── Stage 2: Framework Design [Pipeline Template: Architecture Review]
│       ├── PIPELINE (autoExecute: true)
│       ├── Assessment framework (ARCHITECT)
│       └── Peer review (REVIEWER)
│           ↓ phase complete → next phase
│
├── Execution Phase (sequential)
│   ├── Stage 3: Security Audit [Pipeline Template: Security Posture Assessment]
│   │   ├── PIPELINE (autoExecute: true)
│   │   ├── Infrastructure scan (REVIEWER)
│   │   ├── Compliance audit (REVIEWER)
│   │   └── Risk quantification (ANALYST)
│   │       ↓ cascade
│   └── Stage 4: Remediation Design [Pipeline Template: Solution Design]
│       ├── PIPELINE (autoExecute: true)
│       ├── Remediation architecture (ARCHITECT)
│       └── Cost-benefit analysis (ANALYST)
│           ↓ phase complete → next phase
│
└── Review Phase (sequential)
    └── Stage 5: Deliverables [Pipeline Template: Executive Report]
        ├── PIPELINE (autoExecute: true)
        ├── Executive summary (DOCUMENTER)
        └── Implementation roadmap (DOCUMENTER)
            ↓ POV COMPLETE
```

**One command**: `perform(action: "pov.execute", povId: "...")` → triggers Stage 1 → cascades through all 5 stages → produces complete security assessment.

## Key Design Decisions

### POV Templates vs Ad-Hoc

**POV Templates**: Pre-built POV structures for common engagement types
- "Security Posture Assessment" POV template → 3 phases, 5 stages, 12 tasks, all pre-wired
- Apply to a customer → execute → delivers complete assessment

**Ad-Hoc**: User builds the POV manually, applies pipeline templates per stage, then executes

**Recommendation**: Support both. POV templates are the premium experience. Ad-hoc is the current model enhanced with one-click execution.

### Execution Control

Not every POV should run unattended. Design for:
- **Full auto**: Execute entire POV without stopping (for trusted, well-tested templates)
- **Phase gates**: Auto-execute within phases, pause between phases for human review
- **Stage gates**: Pause after each stage for review before cascading
- **Task gates**: Current behavior (manual execution per task)

**Recommendation**: Phase gates as default — auto-execute within a phase, pause between phases. The human reviews Phase 1 output before Phase 2 starts. Override with `executionMode: "full_auto" | "phase_gates" | "stage_gates" | "manual"`.

### Budget and Cost Control

A full POV execution could be 12+ tasks across 5 stages. At ~$1-2 per pipeline run, a full POV might cost $5-10.

**Controls needed:**
- Per-POV execution budget (max spend before pausing)
- Cost estimate before execution ("This POV will cost approximately $X and take Y minutes")
- Running cost tracker visible to the user
- Auto-pause if budget exceeded

### Progress Visibility

The user needs to see:
- Which phase/stage is currently executing
- Which tasks are complete, in-progress, or pending
- Confidence scores rolling in as tasks complete
- Estimated time remaining
- Cost consumed so far

**This maps to the existing POV detail view** — phases, stages, tasks with statuses. No new UI needed, just real-time updates as the POV executes.

## Implementation Procedure

### Step 1: `pov.execute` MCP Action
- New handler that triggers the first stage's PIPELINE task
- Sets `autoExecute: true` on all PIPELINE tasks in the POV (or respects existing flags)
- Records execution mode (full_auto, phase_gates, etc.)

### Step 2: Execution Tracker
- Track POV-level execution state: which phase, which stage, overall progress
- Could be a field on the POV model or a separate execution record

### Step 3: Phase Gate Logic
- After all stages in a phase complete, check execution mode
- `full_auto`: auto-trigger next phase
- `phase_gates`: pause and notify user ("Phase 1 complete. Review and approve Phase 2?")

### Step 4: Cost Estimator
- Before execution, estimate: (number of tasks) × (average cost per task) = total estimate
- Display to user with "Proceed?" confirmation

### Step 5: POV Templates (Extension of Phase 4)
- Pre-built POV structures with phases, stages, and pipeline templates
- `perform(action: "pov.createFromTemplate", templateName: "Security Assessment", customerName: "Acme Corp")`

## Related Context

- **Phase 3**: `TODO-EVENT-DRIVEN-PIPELINES.md` — auto-execution engine
- **Phase 4**: `TODO-PIPELINE-TEMPLATES.md` — reusable pipeline definitions per stage
- **Phase 5**: `TODO-CASCADING-PIPELINES.md` — cross-stage cascade
- **POV model**: `prisma/schema.prisma` — POV has phases → stages → tasks structure
- **Vision doc**: `VISION.md` — "The POV as an Executable Program" section

## Success Criteria

- [ ] `pov.execute` triggers full POV execution with configurable gates
- [ ] Phase gates work (pause between phases, user approves)
- [ ] Cost estimation before execution
- [ ] Real-time progress visibility during execution
- [ ] At least one POV template for a common engagement type
- [ ] Full POV execution completes end-to-end in < 30 minutes (5-stage POV)

## Risks

- **Cost**: Full auto POV execution could cost $5-10 per run. Budget controls essential.
- **Quality cascade**: Bad output in Phase 1 propagates through all subsequent phases. Phase gates mitigate this.
- **Complexity**: This is the most complex feature in the roadmap. Only attempt after Phases 3-5 are solid.
- **User trust**: Users may not trust full auto for customer-facing deliverables initially. Phase gates build trust gradually.
