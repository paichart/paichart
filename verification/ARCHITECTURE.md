# Architecture — the invariants behind the verification pack

This document stays at the **invariant level**: behaviors guarded by regression pins or structural
server-side checks. Version-specific protocol behaviors live in the decision log at the bottom with
explicit version stamps, so drift is visible rather than silent.

## Execution model (pipeline layer)

- **Three-mode lifecycle**: a harness run resolves to CREATE (decompose, wire the DAG, exit),
  ORCHESTRATE (children in flight — exit and wait), or SYNTHESIZE (all children terminal — gate,
  aggregate, complete). The mode is resolved **server-side from database state** and injected into the
  agent's context — an agent degraded by budget exhaustion cannot mis-detect its own mode.
- **The harness never executes children.** Children start via dependency-completion events only. The
  first wave starts when created dependency-free; every later task starts when its last dependency
  settles.
- **Settled, not just completed**: a pipeline dependency counts as satisfied only when it is completed
  AND its final execution has persisted its deliverable — downstream consumers can never chain a
  stale pre-completion snapshot. (Verified live: consumer queued 84ms *after* the deliverable
  committed, versus 13.5s *before* it on the pre-fix build.)
- **Deliverable chaining is fact-carrying**: every upstream deliverable chained into a prompt carries
  per-predecessor facts — source artifact, truncation, sanitization, not-chained reasons — aggregated
  into a coverage block (`chainCapablePredecessors`, `degradedPredecessors`) that release gates
  consume deterministically.

## Program layer

- A program is a PIPELINE task whose children are pipelines, composed from one design artifact via a
  Program Architect that emits a plan + a binding **interface contract** (shared addressing/naming
  constants). The contract travels as a structured field — never as prose subject to truncation.
- A pipeline child without its contract **fails loudly at execution-creation time** — structurally
  (derived from the program topology), not from a settable flag. It cannot silently compose.
- **Human gates are dependency nodes**: template-less APPROVAL tasks the platform can never
  auto-queue. Everything downstream waits on human release; a parked gate parks its program
  indefinitely and is excluded — structurally, by event anchoring — from every failure-detection
  mechanism.
- **Release is a human verdict fed by machine facts**: `programReleasable` is a deterministic AND over
  child quality-gate outcomes, reviewer verdicts, and chained-coverage facts. It is an input to a
  human decision, never the decision.

## Safety and anti-fabrication stack

1. **Planning, not actuating**: side-effecting work stays outside the loop; deliverables are
   approved-but-unapplied changes.
2. **Bounded self-triggering**: reactor retrigger chains carry a per-harness generation budget.
3. **4-point completion invariant** (server-side): a pipeline cannot be reported complete unless its
   child stage exists, is non-empty, all children are terminal, and the stage's ownership back-pointer
   matches the completing task.
4. **Verdict reconciliation**: stamped quality outcomes are checked against the reviewer's own
   transcribed verdict; contradictions are annotated as facts, logged, and counted.
5. **Engine-computed facts over agent adherence**: where an agent could mis-report a derivable value
   (mode, program confidence, coverage), the platform computes and stamps the fact itself.
6. **Failure propagation**: a child that can never run is marked terminal with its reason, its
   downstream cone is marked with attribution, and the parent is retriggered to escalate — hangs are
   treated as defects, and every known hang class is anchored to a platform event, not a timer.

## Decision log (version-stamped)

- `pov-program` v1.0.1 — approval gates are type APPROVAL and **born IN_PROGRESS** (a single human
  release call); an earlier draft used ACTION.
- `pov-program` v1.0.2 — one reference v1.0.1 missed was aligned to the APPROVAL wording here
  ("bonus catch" class: prose drift is treated as a defect). Also: PLAN-SPAWN creates any
  **requirements-named approval-gate nodes** from the
  Architect's DAG: template-less APPROVAL, born IN_PROGRESS, assignee set to the plan's named
  approver, wired with the DAG's edges. The plan gate remains the mandatory floor. The Architect emits
  gate nodes **only when requirements name per-domain/per-team approvers** — it is explicitly
  forbidden from inventing gates — and the plan's DAG section lists each gate with what it approves,
  who approves, and its edges.
- `pov-program` v1.0.4–v1.0.5 — contract-nesting hardening (structural loud-fail independent of any
  flag); plan retrieval corrected to full-artifact fetch (pointers vs bodies).
- `pov-program` v1.0.6 — escalation distinguishes the ROOT failing leg from downstream casualties
  (`blockedByUpstreamFailure`).
- `pov-program` v1.0.7 — release gate consumes the coverage FACTS (`chainCapablePredecessors`,
  `degradedPredecessors`) instead of a raw predecessor count that could false-block on gates and
  false-pass on missing deliverables.
- `pipeline-orchestrator` v3.9.0 — duplicate-halt stamps a structured fact; program legs with settled
  terminal outcomes (escalated / duplicate-halted) are terminalized by the platform at persist time so
  programs block on outcomes instead of hanging on open legs.
