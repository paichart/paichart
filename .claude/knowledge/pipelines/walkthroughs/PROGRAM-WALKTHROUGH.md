# The program tier — walkthrough (kept-file telemetry program)

**Worked example:** program root `cmvr9hd78000uyxvn32ctl8xc` "Telemetry export authorization across fabric, cluster, cloud and monitoring
(protocol: pov-program)", POV "Telemetry Export Authorisation — Kept Files", launched 2026-10-27 22:33:03Z, completed 23:10:12Z.
pov-program 2.2.0; every program-tier agent is on Sonnet 5.

**The program in one sentence:** one objective and two published design files become a plan of four legs (one that produces a value, three
that change real config files), approved at five human gates, checked across the legs by a program reviewer, and released only if every fact
the program gate reads is true.

**The legs are walked separately:** `K8S-LEG-WALKTHROUGH.md`, `TERRAFORM-LEG-WALKTHROUGH.md`, `OBSERVABILITY-LEG-WALKTHROUGH.md`, and (for
a value leg in depth) `NETWORK-LEG-WALKTHROUGH.md`. This walkthrough is everything around them.

## The map (what talks to what)

```
requirements.program.md + topology.json        (published design files)
            │ read by
Program task (root) ── run 1: CREATE ──► Program Architect ──► plan + interface contract + DAG
            │ run 2: PLAN-SPAWN ──► creates every node below and stops
            ▼
 plan gate (human) ─► fabric leg (value) ─► range gate (human) ─┬► k8s leg ──► k8s gate (human)
                                                                ├► terraform leg ──► cloud gate (human)
                                                                └► observability leg ──► obs gate (human)
                         four legs ─► producer (writes the deliverable)
                         four legs ─► Node C (program reviewer)
            │ run 3: SYNTHESIZE (after all 12 nodes finish) ──► programReleasable = AND(facts) ──► a person decides
```

Each arrow is a **dependency**: a node starts only when everything pointing into it has finished.
- A **gate** is a task a person completes. It carries no data.
- **Data** travels on the arrows from a leg: the fabric leg's range reaches the three change legs, and each leg's deliverable reaches the
  producer and Node C.

## Stop 1 — The design files (requirements.md and topology.json)

**Where:** the two URLs in the program task's description, published in the public repo under
`program-artifacts/telemetry-export-held/`. They are not stored in the platform; the Architect fetches them.

**requirements.program.md** (about 45K characters) is the *change request, written once*:
- **Program scope:** four legs; each is a distinct domain; applying anything is out of scope.
- **Design decisions:** rows such as `kubernetes-gitops.existing-grant` → *replace*, each tied to a quoted owner answer. These become the
  **branch conditions** every leg answers.
- **Approvals:** who approves what, and when (the five gates).
- **Pipeline objectives:** what each leg must do, including *"the change is to the config-repo file `topology.json` names"*.
- **Design constraints:** static values go into the **interface contract**; the range travels on a **DAG edge** because it is unknown
  until the fabric leg runs.
- **Acceptance:** Node C's checks 1–5. Their numbers are fixed, so later text can refer to them.

**topology.json** is the *estate*:
- the four systems;
- **where each config lives** (`configRepo` for the cluster and cloud files);
- the read-only service descriptors;
- the declared planted test artifacts.

It holds no device names or addresses beyond what the design needs; values are discovered by harvesting.

**Key takeaway:** *"You describe the outcome and the rules once, not the steps. The agents discover today's values from your systems."*

## Stop 2 — The program task (the root)

**Where:** stage "Deliver the Four-Domain Program" → the root task. Its description is three lines: the intent and the two URLs. The
`(protocol: pov-program)` in the title selects the program playbook.

**It runs three times:**

| Run | When | What it did | Its record |
|---|---|---|---|
| **CREATE** | 22:33:03 (32 s) | checked for a duplicate earlier run in the POV (none); created the child stage "Program: … (Run 20261027-2233)"; created **only** the Program Architect task | `pipeline-index.json` |
| **PLAN-SPAWN** | 22:37:13 (5 min 36 s) | read the Architect's plan; enforced the 8-leg cap; created the 11 other nodes with their dependencies and contract; then **stopped at the plan gate** | `pipeline-index.json` (its 28 tool calls are the creation log) |
| **SYNTHESIZE** | 23:08:33 (2 min 7 s) | gate-checked each leg from facts; read Node C's verdict; checked coverage; computed **`programReleasable`**; published the deliverable | `pipeline-index.json` + **`report.md`** |

**Platform facts on the root (task metadata):**
- `qualityGate` approved 90;
- **`programReleasable: true`**;
- `programConfidence` 91;
- `deliverableSourceTaskId`, which points to the producer.

**Key takeaway:** *"One task coordinates the whole program, and it stops for people at every point you asked it to."*

## Stop 3 — The Program Architect (the plan)

**Where:** child stage → "Produce program plan + interface contract…" (template *Program Architect*). 220 s. Artifacts: `result.json`,
**`report.md`** (the plan, about 22K characters).

**What it read:** POV details, then **the two design files** (fetched through a browsing service, in 7 pages) and nothing else. It does not
touch any system.

**What the plan contains (report sections):**
1. **Interface Contract:** one JSON block that every leg and Node C receive. It holds the crossing value's description, the static
   constraints per domain (namespace, selector, ports, role ARN, endpoint, actions, **`configRepo`** per file-backed domain), service
   descriptors, branch conditions, approvers, acceptance checks and planted artifacts.
2. **Intent.**
3. **Pipeline DAG:** every node with its type and dependencies. **Each leg is typed `value` or `change`**, which you approve at the plan gate.
4. **Assumptions & Open Questions:** 10 items, each with the default that applies if nobody answers. Example: item 3, the terraform `ref` is
   not declared, so the leg reads the default branch.
5. **Cost & Time Estimate:** about 25–35 tasks; time dominated by human gate latency.

**Key takeaway:** *"Before any system is touched, you get a written plan: the leg types, the agreed constraints, the open questions with
their defaults, and a cost estimate. Nothing runs until a person approves it."*

## Stop 4 — The gates (where people decide)

Five APPROVAL tasks, each assigned to a named person from the requirements' approvals table:

| Gate | Released | What the approver checked (this run) |
|---|---|---|
| **Plan** (Josh Allen; released by pipeline-harness for the owner) | 22:44:31Z | the leg types; that the file paths reached the k8s and terraform legs; the contract stored on every leg; the open items |
| **Range** (Steve Terry) | 22:54:25Z | the fabric leg's `10.99.0.0/27` against an independent recomputation from the switch configs |
| **Cluster change** (Jacob Wilcox) | 23:08:26Z | the k8s held edit |
| **Cloud change** (Josh Allen) | 23:08:30Z | the terraform held edit |
| **Observability change** (Jacob Wilcox) | 23:08:33Z | the observability held edits |

How a gate works:
- A gate **only says "go"**: it blocks the nodes behind it and carries no data.
- The plan and range gates block the legs.
- The three change gates sit *after* their legs and approve the packages. They do not block Node C, which reviews before them.
- Each release is a `task.complete` with a completion note naming the approver of record and what was checked.

**Key takeaway:** *"People approve the plan, the key value, and each change, at the points your own process names."*

## Stop 5 — The value leg (fabric)

Covered in depth in `NETWORK-LEG-WALKTHROUGH.md` (value leg section). In this run:
- harvest both switches → derive the smallest aligned range covering the six exporter loopbacks → `10.99.0.0/27`;
- the reviewer approved at 92;
- containment checked-clean;
- **it changes nothing**.

Its deliverable travels on the DAG edge into the three change legs (the record shows "inherited cross-pipeline entry" inside each leg).

## Stop 6 — The producer (the deliverable)

**Where:** "Compose program deliverable…" (template *Technical Writer*). 58 s. It gets the four legs' deliverables in its chained context.

**`report.md`** (14K characters) is the customer-facing program deliverable:
1. Executive summary
2. The derived value
3–5. One section per change package (cluster, cloud, observability)
6. Validation and rollback status
7. Release gate

It summarises; the **legs' own reports remain the authoritative packages**.

## Stop 7 — Node C (the program reviewer)

**Where:** "Review program integration…" (template *Program Integration Reviewer*). 3 min 13 s. It gets all four legs' deliverables (4 of 4,
none degraded), and it **reads the Architect's plan itself** (`agent.results`, verbose, paged) plus each leg's facts card.

**What it checked:**

| Check | Finding | Grade |
|---|---|---|
| Leg types / title tokens match the plan's DAG | all four match (P1 value, P2–P4 change) | verified |
| **1** consumed range = the fabric leg's value | all three declare and **apply** `10.99.0.0/27` | verified |
| **2** the fabric leg's members are inside the range | the platform's containment fact | platform fact, cited |
| **2b** the range is the tightest correct cover | **recomputed independently** (members 1–29 need a /27) | verified (own arithmetic) |
| **3** no widening; actions bounded | k8s ingress 4317/4318 only; S3 `PutObject` only; obs `deny all` otherwise | verified |
| **4** every consuming leg got the real value | the platform's coverage facts, plus its own cross-check | fact + verified |
| **5** held files: applied, scoped to the named file | each leg's `editApplication` and held file match the contract; anchors copied back unchanged | fact + verified |

It also looked at the value leg (correctly *not* asked for a change package), dialect, blast radius, rollback, apply governance, planted-artifact
handling, and noted the observability reviewer's warning.

**Verdict:** `## VERDICT: APPROVED / Blocking issues: none / Confidence: 93`. `evidenceGrading`: 7 verified, 2 accepted, 1 both.

**Key takeaway:** *"A separate reviewer checks the legs against each other and against the plan: the same value everywhere, nothing wider,
edits only to the files you named. It does the arithmetic itself."*

## Stop 8 — Program synthesis and the release AND

**Where:** the root task's SYNTHESIZE comment ("PROGRAM SYNTHESIS COMPLETE"), its `report.md`, and its metadata.

**`programReleasable`** is computed by the program gate, not by any reviewer, as an **AND** of:
1. **every leg's outcome is approved** (`qualityGate.outcome` on each leg: 92 / 90 / 90 / 90);
2. **Node C approved** (its parsed verdict);
3. **containment holds** (the value leg checked-clean; the consumers discharged, upstream green);
4. **coverage is complete** (the producer and Node C each received 4 of 4 chain-capable predecessors, 0 degraded).

All true ⇒ **`programReleasable: true`**. Confidence is recorded but is **not** part of the AND.

**The program `report.md`** = the producer's deliverable, plus an appended section **"Reviewer warnings (non-blocking)"**: the observability
reviewer's `restated-conclusion` warning, by leg. These warnings are the reviewers' record and are **not** inputs to `programReleasable`.
`reportMdSource: { mode: upstream, sourceTaskId: <producer>, reviewerWarningsAppended: 1 }`.

**Release is still a human decision.** `programReleasable` is the machine input; a person releases.

**Key takeaway:** *"The release check is a plain AND over facts: every leg approved, the program reviewer approved, the value proven
correct, every leg given the real value. If any is false, the program is not releasable."*

## The leg task versus the agents inside it (applies to every leg)

| | **An agent inside a leg** (e.g. the Author) | **The leg task** (the pipeline) |
|---|---|---|
| Who | one agent doing one job | a coordinator (the harness) that runs **twice**: CREATE (sets up the team), SYNTHESIZE (wraps up) |
| Writes | its own output (the Author: the change package) | no package; a short plan note, then a short synthesis note |
| Record | `result.json` (facts about **its** output); the Author also has `edit-application.manifest.json` | `pipeline-index.json` per run, with **leg-wide facts aggregated across its children**: `editApplication` (copied up), `derivationContainment`, `verdictFreshness`, `reviewerWarnings`, `dialectLint`, `contractPropagation` |
| `report.md` | — | written at SYNTHESIZE and **equal to the Author's package**, copied verbatim (`reportMdSource: upstream`) |
| Outcome | — | the leg's verdict, **on the leg task's metadata**: `qualityGate` (+ `heldEdit`) |

**Node C, the producer and the release AND read the leg task, not the agents inside it.** The same pattern repeats one level up: the program
root's `report.md` is the producer's deliverable, and its verdict (`programReleasable`) is on its metadata.

## The program in numbers

| | |
|---|---|
| Nodes | 12 (Architect, 5 gates, 4 legs, producer, Node C) + the root's 3 runs; 29 agent executions in all |
| Agents inside legs | 15 (fabric 3: read, derive, check; each change leg 4: read, design, write, check) |
| Wall time | 37 min end to end, gates included (22:33:03Z → 23:10:12Z) |
| Cost | $11.49 at today's prices; agent time 51.7 min (much of it in parallel) |
| Output | one derived value, three held-file change packages (each with validation and rollback), one program deliverable |
| Applied | nothing; people apply each package through their own process |
| Secrets in any stored record | 0 of 6 lab values (positive control confirmed) |
