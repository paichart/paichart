# Program Harness User Guide

**Version**: 1.0 | **Created**: 2026-07-16 | **Status**: Production — pov-program v1.0.8 live (T2–T5 passed, customer demo POV published)

> **This guide = how to RUN/USE a program** (a pipeline-of-pipelines). For a single pipeline, see the
> sibling [`PIPELINE-HARNESS-USER-GUIDE.md`](./PIPELINE-HARNESS-USER-GUIDE.md) — a program's legs ARE
> pipelines, so everything there applies to each leg; this guide covers only the composition layer.
> To **design** a new program use-case: [`PROGRAM-USE-CASE-DESIGN-PLAYBOOK.md`](./PROGRAM-USE-CASE-DESIGN-PLAYBOOK.md)
> (the procedure) + [`firewall-policy-use-case.md`](./firewall-policy-use-case.md) (decision framework +
> worked examples). Public claim narrative + proofs: `github.com/paichart/paichart/tree/main/verification`.

## 1. What a program is

A **program** turns ONE design artifact (topology-as-code + requirements) into a **reviewed,
multi-domain, approved-but-unapplied deliverable**, with a mandatory human approval gate and per-team
gates. It is a PIPELINE task whose children are pipelines: a **Program Architect** reads the design and
emits a plan + a binding **interface contract**; a human releases the plan; the domain pipelines run
(in parallel or sequenced per the plan's DAG) against the shared contract; a **program integration
reviewer (Node C)** checks cross-pipeline conformance; and release is stamped as a deterministic machine
fact (`programReleasable`) that a **human** converts into the release decision.

Like a pipeline, a program is a **planning/synthesis engine, not an actuator** — it produces
approved-but-unapplied change packages; apply stays out-of-band and human-gated.

**When to use a program (vs one pipeline)**: multiple vendors/teams/domains needing separate specialist
chains AND separate approvals, coordinated across a shared design. A few same-vendor devices under one
team = one pipeline. Full decision matrix: `firewall-policy-use-case.md` §4.

## 2. Launch a program

Create a **PIPELINE task** whose **title carries the `(protocol: pov-program)` token** and whose
**description names ONLY the two design-artifact URLs**, then assign the `Pipeline Harness` template and
execute:

```
perform(action: "task.create", parameters: {
  povId, stageId,                              // a host stage in an EXECUTION phase
  title: "<program objective> (protocol: pov-program)",
  type: "PIPELINE",
  description: "Program intent: <one line>.\n\nDesign artifacts for the Program Architect (fetch ONLY these two URLs):\n- topology-as-code: https://raw.githubusercontent.com/<owner>/<repo>/main/program-artifacts/<name>/topology.json\n- requirements: https://raw.githubusercontent.com/<owner>/<repo>/main/program-artifacts/<name>/requirements.md"
})
perform(action: "agent.assign", taskId: "<program task id>", agentTemplateName: "Pipeline Harness")
perform(action: "agent.execute", taskId: "<program task id>")
```

The title token is **load-bearing** — without it the harness runs the generic orchestrator, not the
program protocol. The design artifacts must be reachable by URL (the Architect fetches them via the
Browser Automation Service; pAIchart has no generic URL-fetch tool).

## 3. The lifecycle you'll observe

A program CREATE spans **two harness executions** (a mechanical necessity — the contract is accepted
only at `task.create`, and pipeline children start only via dependency-completion):

1. **PLAN (execution 1, CREATE mode)** — the harness creates a child stage `Program: <objective> (Run …)`,
   records `metadata.pipelineStageId` on itself, spawns the **Program Architect** (an ACTION child,
   dependency-free — it starts immediately), and exits. Nothing else is created yet.
2. **The Architect** fetches the two URLs and produces its plan as its `report.md`, with a fixed section
   order: **`## Interface Contract` FIRST** (one JSON block, deliberately in the head so truncation
   can't eat it) → `## Intent` → `## Pipeline DAG` → `## Assumptions & Open Questions` → `## Cost & Time
   Estimate`.
3. **PLAN-SPAWN (execution 2, auto-retriggered)** — the harness reads the plan (fetches the Architect's
   report.md), enforces the **≤ 8-pipeline cap**, then creates the full roster in ONE program stage:
   - the mandatory **plan-approval gate** (template-less `APPROVAL`, born `IN_PROGRESS`);
   - any **per-team approval gates** the plan's DAG names (multi-team case);
   - the **child PIPELINE tasks** from the DAG — each carrying the **interface contract**, each depending
     on its gate (+ any upstream sibling-pipeline edges the DAG orders);
   - a **producer** (Technical Writer) + **Node C** (Change Reviewer, report.md suppressed — it's the QA
     gate), each depending on all the pipelines;
   - wires `metadata.deliverableSourceTaskId` → the producer.
   It posts the plan for approval and **exits**. **No child pipeline runs until a human releases the gate.**
4. **You release the gate(s)** (§5). The dep-satisfied pipelines queue within seconds and run their own
   domain protocols in their own child stages — **in parallel** (no edges) or **sequenced** (DAG edges),
   each with the contract rendered first in its §6 as a BINDING block.
5. **PROGRAM SYNTHESIZE (auto-retriggered when producer + Node C complete)** — the harness fact-gates
   the children, reads Node C's structured verdict, checks the chained-coverage facts, computes
   `programReleasable` (a deterministic AND), stamps the facts on itself, completes, and posts ONE final
   comment: the per-pipeline gate table, the deliverable pointer, and the release-is-a-human-decision
   handoff.

## 4. The interface contract (the coordination mechanism)

The Architect computes the **interface contract** — the invariants EVERY pipeline must honor (shared
addressing/naming/flow constants). PLAN-SPAWN passes it as a **sibling of `title`** in each pipeline
child's `task.create` (exactly one level deep); the platform stores it as `inputContext.interfaceContract`
and renders it FIRST in that child's §6 as a BINDING block. **A pipeline child that reaches execution
without its contract FAILS LOUD (`INTERFACE_CONTRACT_MISSING`)** — it can never silently compose (VT-01).
This is the *declarative* coordination. For *runtime* interdependencies (a leg needs an upstream leg's
designed output), the DAG wires an edge and the downstream leg chains the upstream's `report.md` into
its §6 (see `firewall-policy-use-case.md` §2/§3 Approach 3).

## 5. Releasing gates (important operational detail)

- Gates are **born `IN_PROGRESS`** ("with the human"), so release is a **single MCP `task.complete`
  call**: `perform(action: "task.complete", taskId: "<gate id>")`.
- **Release via MCP `task.complete` or the GUI Approve button — either surface works.** Both fire the
  dependency-completion reactor, and gate completion is dependency-ENFORCED (an out-of-order release is
  structurally rejected with DEPENDENCY_NOT_SATISFIED). (The historic GUI reactor gap was closed by the
  completion-path unification, Flip A 2026-07-24 — this bullet's old trigger line has fired.)
- Multi-team programs have per-team gates in addition to the plan gate — release each (the DAG holds the
  cascade until its gate completes).

## 6. Reading the result

- **`programReleasable`** (on the program task's `metadata`): a deterministic AND over child outcomes,
  reviewer verdict, and coverage facts — `true` only when every child gate is `approved`/≥85, Node C is
  APPROVED, and coverage is clean (`predecessors === chainCapablePredecessors`, `degradedPredecessors 0`,
  `notChained []`). It is an **input to a human release decision, never the decision** (VT-06).
- **`programConfidence`** = engine-computed MIN of the legs' confidences (the weakest leg sets it).
- **The composed deliverable** = the producer's `report.md`, extracted to the program's `report.md`.
- **The final comment** carries the per-pipeline gate table + the deliverable pointer + the apply-order
  note (apply is out-of-band, human-gated).
- A **read-only demo account** can open all of this in the public demo POV "pAIchart Verified Delivery —
  Live Exhibits" (Exhibit 1 = a fully green program; Exhibits 2–4 = the failure modes).

## 7. Failure semantics — what you'll see, and it never hangs or applies

| Situation | What the program does | Proof |
|---|---|---|
| A leg **can never run** (contract lost post-gate) | leg + its forward cone marked FAILED with attribution; healthy legs preserved; program **escalates** naming the root leg; `programReleasable:false`; awaits human | VT-02 / Exhibit 2 |
| A leg's reviewer returns **needs-revision** | `programReleasable:false`, keyed on the OUTCOME (a high score can't rescue a needs-revision) | VT-04 |
| A leg's **deliverable goes missing** | coverage facts (`degradedPredecessors`) block release — a count that "looks complete" can't mask a missing deliverable | VT-05 |
| **Hostile content in harvested state** (prompt-injection / secret) | design step refuses/escalates, release blocks; not obeyed, not leaked | VT-07 / Exhibit 3 |
| A synthesis turn **truncates** at the token ceiling | auto-recovered: retried with headroom in-loop; a residual is terminalized + escalated, never a silent hang (R4) | truncation-r4 review |
| The plan gate is **never released** | parks indefinitely; nothing queues, no timeout misfires | VT-03 / Exhibit 4 |

## 8. Guardrails (the invariants you can rely on)

- **Approved-but-unapplied** — the program never actuates; apply is a separate human/GitOps/`terraform
  apply` step it can only recommend (incl. the safe apply order).
- **≤ 8 child pipelines per program** — a deliberate blast-radius/cost cap; group devices if the path is
  wider (`firewall-policy-use-case.md` §5).
- **Contract loud-fail** — a pipeline child without its contract aborts loudly, never silently composes.
- **Human gates everywhere** — the plan gate + per-team gates are dependency nodes the platform can
  never auto-complete; release + the final release decision are always human.

## 9. Retries — why a leg re-runs its children, and when to worry (live-proven FW-A3 campaign, 2026-08)

Three mechanisms, one design rule: **judgment decides whether to retry; code guarantees a retry can
never regress and never runs away.**

1. **In-execution repairs** (engine, invisible when healthy): truncation retry-with-headroom,
   diagnostic retry, one correction turn on unaddressed failed tool calls. At most a fact in the
   artifact (`truncationRetryUsed`, `correctionTurnUsed`).
2. **Quality-gate retry band** (leg SYNTHESIZE, per child confidence): **>=70 accept · 50-69
   re-execute once · <50 escalate**. Safety is code: keep-best selection makes a worse retry
   self-supersede (a retry can never regress the leg); the generation budget (10) bounds the whole
   retrigger chain. Known limit: the retried child runs on byte-identical inputs (blind re-roll) —
   it fixes stochastic failures, wastes a run on systematic ones; feedback-wiring is deliberately
   deferred until keep-best logs earn the design.
3. **Staleness re-execution** (not confidence-driven): a child whose inputs changed under it — a
   reviewer whose verdict predates a re-authored package — is re-run to restore coherence. The
   repair cascades in causal order (design -> author -> review), tracked by the harness itself.

**What NEVER retries**: a well-executed reviewer's NEEDS-REVISION (a verdict is a quality outcome,
not a weak execution — re-rolling it would turn the band into "roll until it passes" and destroy
the trust model), and FAILED executions (they escalate). **Normal signature** (observed twice,
FW-A3.2/A3.3 dmz legs): band-retry the Designer -> staleness re-run Author -> staleness re-run
Reviewer -> accept, <=4 generations, zero human touches. **Worry signature**: the same child
re-executed repeatedly with no staleness rationale, or generations approaching the budget.

## 10. Running a remediation campaign (multi-round operations — FW-A3, five rounds to green)

When a round ends non-green and you re-run after a fix, the choreography that made FW-A3 work:

- **Archive, never delete.** A non-green round is the *provenance* of its fix: disposition comment
  on the program root naming defect/fix/continuation; gates left unreleased (parked-at-gate is an
  honest terminal-for-humans state); next round in a SIBLING stage.
- **Clearances up front.** The duplicate check recurses (program root AND each leg). Bake a
  `PRE-FLIGHT CLEARANCE:` block into the program task DESCRIPTION naming every prior program stage;
  in the PLAN-SPAWN->gate-release window, append per-leg clearance blocks to each pipeline child's
  description naming that leg's prior stages (description-block form clears whichever duplicate is
  detected; `metadata.duplicateAcknowledged` names only one). A program leg's duplicate-halt is
  TERMINAL — pre-arm is mandatory, and the gate hold makes the stamps race-free.
- **Wait for the full roster before releasing ANY gate** (it spawns progressively; count against
  the plan's DAG: architect + gates + legs + producer + Node C).
- **Review the produced value at each domain gate**, from the lean-card FACTS: at the
  post-derivation gate expect `derivationContainment: checked, 0 violations`; at the consuming
  gates expect consumed == produced verbatim + `upstreamContainment: green` + coverage clean. A
  surprising fact ⇒ read the actual report.md BEFORE releasing (twice in this campaign the stamped
  reason and the naive reading of it differed).
- **Fix at the right layer, then re-run as validation**: rig/input gaps -> topology+inputs; craft
  slips -> role guidance (+ TARGETED reseed — template rows never auto-reseed); contract ambiguity
  -> protocol clause (auto-seeds on deploy); format variance that recurs -> mechanical tolerance
  (code + fixtures; the FW-A3 rule of thumb: the same prose contract failing on a second axis is
  the corpus evidence that earns the code fix).
- **Ops interleave** (shared prod host): teardown -> push/deploy -> reseed if roles changed ->
  rebuild rig (re-randomize seed) -> pre-flight -> launch. Never push while a rig is up.

Worked record: VT-18 (public verification pack) + `cline_docs/firewall-a3-validation-2026-08-21/`.

## 11. See also

- Design a use-case: [`PROGRAM-USE-CASE-DESIGN-PLAYBOOK.md`](./PROGRAM-USE-CASE-DESIGN-PLAYBOOK.md) ·
  [`firewall-policy-use-case.md`](./firewall-policy-use-case.md) · [`PROGRAM-COMPOSITION-CATALOG.md`](./PROGRAM-COMPOSITION-CATALOG.md).
- Leg-level detail: [`PIPELINE-HARNESS-USER-GUIDE.md`](./PIPELINE-HARNESS-USER-GUIDE.md).
- **Run the human side of the gates**: [`PROGRAM-OPERATOR-GATE-PLAYBOOK.md`](./PROGRAM-OPERATOR-GATE-PLAYBOOK.md) — plan-gate probing, mechanical package checks, apply discipline, and the read-raw-output rule. Every device-facing defect across two campaigns was caught by an operator step, not an agent tier.
- Forensically assess a run: [`PROGRAM-RUN-FORENSICS-GUIDE.md`](./PROGRAM-RUN-FORENSICS-GUIDE.md).
- Design rationale (D1–D12): `cline_docs/reviews/program-architect-design-2026-07-15/design-proposal.md`.
- Test/forensics ledger: `cline_docs/reviews/program-architect-design-2026-07-15/PROGRAM-TEST-PLAN.md`.
- Public proofs: `github.com/paichart/paichart/tree/main/verification` (OVERVIEW + ARCHITECTURE + VT-01..08).
