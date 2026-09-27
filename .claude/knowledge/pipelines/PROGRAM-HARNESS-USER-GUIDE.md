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

### 🔴 Put a RUN NUMBER in the title. It looks cosmetic and it is not.

`title: "<objective> (Run N) (protocol: pov-program)"`

Every leg runs its own duplicate check against the stages in its phase, and **a leg's check is not
cleared by the root's clearance** — PLAN-SPAWN composes leg descriptions from the plan and carries no
`PRE-FLIGHT CLEARANCE` block into them. What a leg CAN do is place itself in a series: the run number
propagates from the root title into every leg title and child-stage name, so a leg meeting a prior
run's completed stage reads it as history rather than as itself.

**Proven both ways, same week:**

| | root title | what the legs did |
|---|---|---|
| Westpac Run 24 | `… (Run 24) (protocol: pov-program)` | legs carried NO clearance and still proceeded — *"prior runs' pipelines (19-23) are historical, unrelated to this execution"* |
| A run titled without one | `Authorise the telemetry export path…` | leg stage named `(Run 20260922-0638)`; the next run's fabric leg read it as a duplicate and **HALTED** |

A bare timestamp discriminates for a machine but not for a reader deciding *"is that me, or is that
history?"* — which is the judgement the duplicate check actually makes.

⚠️ **The halt is TERMINAL** (F17, one-way forward-cone freeze). Recovery is a fresh task tree, not a
retry — so this costs a whole run's setup when you get it wrong.

### The clearance burden grows by one leg per run

Each completed run leaves **its own leg child stages** behind in the phase, and the next run must be
legible against all of them. The root's `PRE-FLIGHT CLEARANCE` should name prior **`Program:`** stages
by exact ID; the run number is what handles the **`Pipeline:`** leg stages underneath them. A
successful run is what makes the next one harder — which is counter-intuitive enough to be worth
stating. Westpac reached Run 26 on this convention, so it scales; it just has to be adopted from
Run 1, not retrofitted at Run 6.

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

### ⚠️ The plan gate is not a formality — read `## Assumptions & Open Questions` BEFORE releasing it

The Program Architect can address questions **to this gate**, and it is the only place they can be
answered while the answer still changes anything. Releasing the gate without answering them is not
neutral: it **silently selects** whichever reading the Architect chose, and the program then runs on
that choice.

Before `task.complete` on a plan gate, read the Architect's deliverable and check:

1. **`## Assumptions & Open Questions`** — any item phrased *"Human: confirm …"* or *"confirm before
   approval"* is a question you are answering by approving. **If your answer should change what a leg
   does, write it into that leg's DESCRIPTION (`task.update`) before you release the gate that holds
   it** — or fix the requirements and re-run. A gate's completion comment is a record for humans; no
   agent ever reads it, so an answer written there changes nothing and the leg runs its default
   (G1, 2026-09-24: a leg's scope was deferred to "customer confirmation at the gate" — a channel the
   leg cannot read).
2. **The `## Pipeline DAG` "Depends on" column** — this is the graph that will be built. Check that
   each gate blocks the leg you intended. A gate that depends on the leg it was meant to govern is a
   **record, not a control**.
3. **Every named approver is on the POV team.** An approver who is not a member cannot be routed to,
   and the gate falls to the POV owner without failing.
4. **Read each gate's RECORDED assignee — including the plan gate you are about to release.** Check
   the task, not the harness's roster comment: on 2026-09-24 the roster listed the plan gate under the
   PM while the gate itself sat with the owner, because the protocol's routing rule covered only the
   gates *beyond* the plan gate (fixed in pov-program 1.8.3 — step 3 now assigns it). A gate on the
   wrong person is released by the wrong person, and an owner-assigned gate looks exactly like one
   that was meant to be. `task.assign` corrects it before release.

*Earned 2026-09-17 (telemetry-export-four-domain). The Architect flagged exactly two items — a
gate-wiring ambiguity in the requirements (*"confirm G1–G4 should gate only their own domain's
pipeline, or should P2/P3/P4 also wait on G1"*) and an approver who was not on the team. The plan gate
was released without answering either. Both predictions came true: all four change packages were
produced with zero domain approvals, and the observability gate fell to the owner. Nothing failed and
nothing hung — the program simply ran the reading nobody chose on purpose.*

**The positive reading matters too**: the Architect detecting an ambiguity in a human-authored
requirements document, picking a defensible reading, and refusing to resolve it silently is the
behaviour you want. The control only works if someone reads the question.

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
| A leg's reviewer returns **needs-revision** | `programReleasable:false`, keyed on the OUTCOME (a high score can't rescue a needs-revision). **Fixing the cause does NOT make the program green — see §9b before re-running anything** | VT-04 |
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
   self-supersede (a retry can never regress the leg); the generation budget (10 per pipeline leg, 25 per
   program root — since 2026-09-26 an exhausted budget ends the harness FAILED instead of hanging it) bounds
   the whole retrigger chain. A leg that re-runs a child and exits is recorded as `reExecutionExit`, and is
   never marked FAILED while that child is still running (`deadEndExempt` explains why). Known limit: the retried child runs on byte-identical inputs (blind re-roll) —
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

### 9b. Re-running a leg BY HAND after it completed — three paths, and none of them reaches `true`

§9 is about retries the platform performs. This is about the one YOU perform: a leg completed
`needs-revision`, you found the cause, you fixed it, and you want the program to go green.

🔴 **It will not go green. `programReleasable: true` is not recoverable once a leg has gone bad, and
that is the design, not a limitation you are working around.** Read this before spending an hour
discovering it.

The gate (pov-program Step 5) is *"a deterministic AND, no judgment calls"*, and its first two
conjuncts are `every child pipeline qualityGate.outcome === "approved"` AND `no child has
verdictMismatch: true`. Every path below leaves at least one of those false.

| path | deliverable | stamped outcome | result |
|---|---|---|---|
| **In-place re-execute** the leg's children, then the leg | ✅ refreshed and authoritative | ❌ frozen — `task.complete` rejects COMPLETED→COMPLETED | `false`, **plus** a `verdictMismatch: true` you created |
| **Replicate the leg** as a new PIPELINE task in the program stage | ✅ new leg fine | ❌ the OLD leg is still a child pipeline carrying its bad outcome | `false` — and risks an F17 duplicate-halt |
| **Park + standalone completion round** (§10, the sanctioned path) | ✅ | verdict deliberately **preserved** | `false` *by design* — *"the program completes with its original verdict PRESERVED"* |

**What in-place re-execution IS good for.** It is the cheapest way to prove your fix works. Done on the
telemetry-export cloud leg (2026-09-22) after a planted-artifact declaration gap was closed, every hop
improved: harvester clean, architect 78→90, author 74→88, reviewer 85/not-approved→87/approved with
zero blocking. The refreshed `report.md` IS authoritative for downstream consumers —
`selectAuthoritativeExecution` is newest-non-superseded-SUCCESS with the R8 non-empty floor, shared by
the chainer, the `report.md` policy and terminal persist. So the producer and Node C read the good
deliverable. Only the STAMP is stuck.

⚠️ **One distinction the protocol text currently misses.** pov-program calls in-place re-execution
*"a blind re-roll on identical inputs"*. True of a bare `agent.execute` — and NOT true if you edit the
task description first, because the description is, in that same paragraph's words, *"the ONLY channel
that reaches the round's agents"*. In-place + unchanged inputs is a blind re-roll; in-place + an edited
description carries the lesson. That is why the run above improved at every hop instead of re-rolling
the same dice.

⚠️ **In-place re-execution mints a metric artifact you must not leave unlabelled.** The refreshed
SYNTHESIZE stamps `reviewerVerdict.approved: true` against a frozen `needs-revision`, so the guard
records `verdictMismatch: true`. **Nothing disagreed** — the stamp is stale by construction. The
quarterly verdict-consumption tally counts exactly these, so CLAUDE.md carries an exclusion rule and a
mechanical separator (the harness writes `RE-EXECUTED` into its own `qualityGate.note`). Mechanism and
open questions: `cline_docs/follow-ups/stale-stamp-after-post-terminal-rerun-2026-09-22.md`.

🔴 **Do not "reconcile" the stamp by hand.** Editing `qualityGate.outcome` to `approved` is not
reconciling two views of the truth — it is editing a gate's inputs until it emits the verdict you want,
and nothing in the record would distinguish it from falsifying a gate (the VT-24 shape). It would not
even work: `verdictMismatch: true` is an independent conjunct and survives the edit. That is
tamper-evidence, and it is deliberate.

**Why there is no leg-exclusion mechanism, and why we are not building one.** Measured across the whole
corpus (2026-09-22) — re-run the queries, do not trust these numbers:

```bash
# Three numbers, one call: (1) bad legs + how many were ever re-run, (2) the blocked-program
# distribution by bad-leg count, (3) legs replicated inside a program stage.
ssh <PROD_USER>@<PROD_HOST> 'cd /var/www/paichart-app/current && source .env.production && psql "$DATABASE_URL" -P pager=off -c "
WITH prog AS (SELECT p.id, p.metadata->>'"'"'pipelineStageId'"'"' sid, p.metadata->>'"'"'programReleasable'"'"' rel
  FROM tasks p WHERE p.type='"'"'PIPELINE'"'"' AND p.metadata->>'"'"'programReleasable'"'"' IS NOT NULL),
legs AS (SELECT g.id pid, g.rel, c.id lid, left(c.title,34) t,
  c.metadata->'"'"'qualityGate'"'"'->>'"'"'outcome'"'"' oc FROM prog g
  JOIN tasks c ON c.stage_id=g.sid AND c.type='"'"'PIPELINE'"'"')
SELECT '"'"'bad-legs-ever-rerun'"'"' metric,
  count(*) FILTER (WHERE oc <> '"'"'approved'"'"')::text AS a,
  count(*) FILTER (WHERE oc <> '"'"'approved'"'"' AND (SELECT count(*) FROM agent_executions e WHERE e.\"taskId\"=lid) > 2)::text AS b
FROM legs
UNION ALL SELECT '"'"'blocked-programs / of-which-zero-bad-legs'"'"',
  count(DISTINCT pid) FILTER (WHERE rel='"'"'false'"'"')::text,
  count(DISTINCT pid) FILTER (WHERE rel='"'"'false'"'"' AND pid NOT IN (SELECT pid FROM legs WHERE oc <> '"'"'approved'"'"'))::text
FROM legs
UNION ALL SELECT '"'"'legs-replicated-in-stage'"'"',
  (SELECT count(*) FROM (SELECT pid,t FROM legs GROUP BY pid,t HAVING count(*)>1) x)::text, '"'"'-'"'"';"'
```

**37 bad legs, 0 ever re-executed at leg level, 0 ever replicated inside a program stage.** The only
child-level re-execution in the corpus is the telemetry-export cloud leg written up above — created
while investigating this very question. In 37 opportunities nobody has needed it. Two further reasons it would be wrong even with a population:
**11 of the 40 blocked programs have ZERO bad legs** (they block on Node C, coverage, containment or
`verdictMismatch`), so exclusion is irrelevant to over a quarter of the failures it appears to address;
and the mechanism's job would be to distinguish *"this leg's failure was superseded"* from *"this leg
failed"*, which nothing mechanical can decide — the platform already refuses the identical inference
elsewhere and says why: *"Deriving 'no author was expected' from 'no author exists' is circular, so the
platform refuses to guess."*

**What to do instead**: §10. Park the program at its gate, run the completion round as a standalone
pipeline, and let the program's record say what actually happened. A program's verdict is a record, not
a target.

## 10. Running a remediation campaign (multi-round operations — FW-A3, five rounds to green)

When a round ends non-green and you re-run after a fix, the choreography that made FW-A3 work:

- **Archive, never delete.** A non-green round is the *provenance* of its fix: disposition comment
  on the program root naming defect/fix/continuation; gates left unreleased (parked-at-gate is an
  honest terminal-for-humans state); next round in a SIBLING stage.
- **Clearances up front — on the ROOT.** The duplicate check recurses (program root AND each leg). Put
  the clearance on the program ROOT: `metadata.duplicateAcknowledged` = every prior `Program: …` stage
  id (a LIST when there have been several prior runs), or a `PRE-FLIGHT CLEARANCE:` description block.
  Since pov-program 1.8.5 the harness CARRIES a root clearance to each leg in PLAN-SPAWN
  (`duplicateAcknowledged` = the prior `Pipeline: …` stage ids + `duplicateAcknowledgedFrom` = the
  root). **Verify before releasing the plan gate**: the approval comment reports each leg's RECORDED
  list, or read a leg's metadata. A program leg's duplicate-halt is TERMINAL — a missing stamp is not
  recoverable after release. If the root carried no clearance and the comment WARNS instead, stamp each
  leg yourself in the gate hold (race-free).
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
