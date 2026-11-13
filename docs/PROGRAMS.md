# Programs

> **This guide = how to RUN/USE a program** (a pipeline-of-pipelines). For a single pipeline, see the
> sibling [`PIPELINES.md`](PIPELINES.md) — a program's legs ARE
> pipelines, so everything there applies to each leg; this guide covers only the composition layer.
> To **design** a new program use-case: [`DESIGNING-A-PROGRAM.md`](design/DESIGNING-A-PROGRAM.md)
> (the procedure) + [`FIREWALL-POLICY-USE-CASE.md`](design/FIREWALL-POLICY-USE-CASE.md) (decision framework +
> worked examples). Evidence for each claim: the [verification pack](../verification/README.md).

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
team = one pipeline. Full decision matrix: `FIREWALL-POLICY-USE-CASE.md` §4.

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
perform(action: "agent.execute", parameters: { taskId: "<program task id>", waitForCompletion: false })
```

> **Launching from an interactive session (Claude Code, Claude Desktop, ChatGPT):** pass
> `parameters: { taskId, waitForCompletion: false }`. A bare `agent.execute` waits for the run and, on a long
> one, the client reports *"The operation timed out"* — **the run has usually started anyway.** Watch it with
> `agent.status`. If a timeout does happen, check the task's executions before retrying: a retry while the
> first run is still active is refused (`DUPLICATE_ACTIVE_EXECUTION`), but a retry after it finished is a
> genuine second run.

The title token is **load-bearing** — without it the harness runs the generic orchestrator, not the
program protocol. The design artifacts must be reachable by URL (the Architect fetches them via the
Browser Automation Service; pAIchart has no generic URL-fetch tool).

### Where the two artifacts come from

`topology.json` and `requirements.md` live in a NEW directory, one per objective, in a repository whose raw URLs your hub can
fetch ([WRITING-A-SPEC.md](WRITING-A-SPEC.md), "Where the two files go") — never edit a published one; it is a run's input of
record. (`program-artifacts/` in this repository is the frozen archive of earlier runs' inputs; nothing new goes there.) One published spec serves every run of its objective, so you make one **per objective**, not
per run.

Write the spec by hand: a short document (about one page) in the shape of a released example, using
[WRITING-A-SPEC.md](WRITING-A-SPEC.md). It has seven questions you must answer before launch and eighteen you answer only where
you care; the rest are decided by the planner or a leg and you read them at a gate. For a leg that grants access in production
or changes routing, more of those questions become must-answer.

### Running again in a project that already holds a run

Put a run number in the title (`<objective> (Run 2) (protocol: pov-program)`) and stamp the clearance on the new task before
you start it: [TROUBLESHOOTING-A-RUN.md](TROUBLESHOOTING-A-RUN.md), "Launching again in the same project". A first run in a
fresh project needs neither. Each finished run leaves its stages behind, so the clearance must name every earlier run's
`Program: …` stage.

## 3. The lifecycle you'll observe

A program CREATE spans **two harness executions** (a mechanical necessity — the contract is accepted
only at `task.create`, and pipeline children start only via dependency-completion):

1. **PLAN (execution 1, CREATE mode)** — the harness creates a child stage `Program: <objective> (Run …)`,
   records `metadata.pipelineStageId` on itself, spawns the **Program Architect** (an ACTION child,
   dependency-free — it starts immediately), and exits. Nothing else is created yet.
2. **The Architect** fetches the two URLs and produces its plan as its `report.md`, with a fixed section
   order: **`## Interface Contract` FIRST** (one JSON block, deliberately in the head so truncation
   can't eat it) → `## Intent` → `## Pipeline DAG` → `## Assumptions & Open Questions` → `## Cost & Time
   Estimate`. Since pov-program 2.0.0 every DAG entry states its **leg type** (`leg type: change` or
   `leg type: value` — §10), and the plan gate's description lists them: you approve leg types there.
3. **PLAN-SPAWN (execution 2, auto-retriggered)** — the harness reads the plan (fetches the Architect's
   report.md), enforces the **≤ 8-pipeline cap**, then creates the full roster in ONE program stage:
   - the mandatory **plan-approval gate** (template-less `APPROVAL`, born `IN_PROGRESS`);
   - any **per-team approval gates** the plan's DAG names (multi-team case);
   - the **child PIPELINE tasks** from the DAG — each carrying the **interface contract**, each depending
     on its gate (+ any upstream sibling-pipeline edges the DAG orders);
   - a **producer** (Technical Writer) + **Node C** (the `Program Integration Reviewer` — unbound, no domain
     protocol, since pov-program 2.0.0; earlier runs used the network-bound `Change Reviewer`; report.md
     suppressed — it's the QA gate), each depending on all the pipelines and **never on a gate** — so Node C
     reviews before you decide any gate that waits on a leg;
   - wires `metadata.deliverableSourceTaskId` → the producer.
   It posts the plan for approval and **exits**. **No child pipeline runs until a human releases the gate.**
4. **You release the gate(s)** (§5). The dep-satisfied pipelines queue within seconds and run their own
   domain protocols in their own child stages — **in parallel** (no edges) or **sequenced** (DAG edges),
   each with the contract rendered first in its §6 as a BINDING block.
5. **PROGRAM SYNTHESIZE (auto-retriggered when every child, gates included, is terminal)** — the harness fact-gates
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
*Since 2026-10-17 (Q2 leg-contract heal):* when the program's own harness creates a pipeline child **without**
`interfaceContract`, the platform stores the program plan's contract itself (the same one a create carrying it stores) and
the `task.create` result says so in one sentence; or it records why it declined (`metadata.interfaceContractSource.arm =
'create-absent-declined'` + `declineReason`), and the leg then fails loud naming that reason. Any other way of creating a
leg without its contract (GUI, REST, an external client) still fails loud as above.
This is the *declarative* coordination. For *runtime* interdependencies (a leg needs an upstream leg's
designed output), the DAG wires an edge and the downstream leg chains the upstream's `report.md` into
its §6 (see `FIREWALL-POLICY-USE-CASE.md` §2/§3 Approach 3).

**Network legs: the `## Device sources` block rides the contract.** Write each network leg's block in `requirements.md`; the Architect
copies it exactly into the contract as `deviceSources["network-provisioning"]`. **List every switch a leg must SEE, not only the one it
changes** (a value derived on one switch must not collide with another's allocations — the FW-A3 lesson of 2026-11-01).
**A generated `requirements.md` asks for it (requirements-authoring 1.11.0, 2026-11-09):** the requirements generator asks, for each
network leg, which switches it changes and which it only needs to see, and where each one's configuration is read from (the
`network-provisioning.sources` question; it stays OPEN until you answer it, and never comes from the harvest). It writes one block per
lane — one for the change legs, one for a value leg — and the publish step checks each block with the same parser the platform uses.
A hand-written spec still carries the block you write.
⚠️ **Known limit (2026-11-10): a GENERATED spec with two network legs (a value leg plus a change leg) cannot pass publish yet.** The
generator has no row-id rule for two legs on one token, so the publish checks misread the draft (first live run, three generations,
none publishable). Write that shape by hand until it is fixed; a generated spec with one network leg is unaffected.
⚠️ **Known limitation (accepted 2026-11-05):** a switch left out of a leg's block is not checked by that leg, and its Reviewer can approve
a colliding value (it accepts the package's "that check belongs to the integration review" in every lab sample); Node C is then the only
check — it caught the 2026-11-01 case. Listing the switch closes it. Two network
change legs can share one block when they need the same lines; different lines per change leg for the same switch are not supported
yet. **A value leg has its own key (network-derivation ≥ 1.3.0, 2026-11-06):** give it its own `## Device sources` section in
`requirements.md` and the Architect copies it as `deviceSources["network-derivation"]`; give it none and the Architect emits no such key
(the value leg reads through its descriptor and reads no Git file). Git-only is allowed and stated, never blocked — the value card reads
`liveEvidence: git-only (declared devices)`. Since network-derivation 1.3.1 its `git-file-only` warning is a line of its own and reaches
the leg report. On a change leg (network-provisioning ≥ 1.27.0) a Git file that differs from its device is applied incrementally, never
loaded whole, and a declared source that could not be read is refused by the leg's own Reviewer. Details: `PIPELINES.md`
§ "Which devices to list" and § "Network: kept device configurations".

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
5. **Read every spawned LEG's task description, not just the plan.** PLAN-SPAWN composes each leg's
   description from the plan by model, and it can drop lines. Check each leg carries what the plan gave
   it — its service descriptor, its leg type, its scope. If one is missing, add it to that leg task
   (`task.update`) in the hold window, before any gate is released. *(2026-10-09: both legs were spawned
   without the descriptors the plan named; the harvester correctly blocked — register
   PLAN-SPAWN-DESCRIPTOR-DROP.)*
   **Standing control (Steve, 2026-10-10, option C):** do this for EVERY leg of EVERY program, before the plan
   gate is released. A leg passes when its service descriptor (URL or inline JSON) is in its description OR in
   its `inputContext.interfaceContract`. The contract also counts, because legs harvest from a contract-carried
   descriptor; that is how most legs before October received it. It stays manual until the structured
   `serviceDescriptors` contract key ships.

*Earned 2026-09-17 (telemetry-export-four-domain). The Architect flagged exactly two items — a
gate-wiring ambiguity in the requirements (*"confirm G1–G4 should gate only their own domain's
pipeline, or should P2/P3/P4 also wait on G1"*) and an approver who was not on the team. The plan gate
was released without answering either. Both predictions came true: all four change packages were
produced with zero domain approvals, and the observability gate fell to the owner. Nothing failed and
nothing hung — the program simply ran the reading nobody chose on purpose.*

**The positive reading matters too**: the Architect detecting an ambiguity in a human-authored
requirements document, picking a defensible reading, and refusing to resolve it silently is the
behaviour you want. The control only works if someone reads the question.

### Delegating gate release to an AI coordinator (operator practice, 2026-10-01)

An owner may let the session that launched a program review and release its gates while they are away.
It works only if the rules are fixed BEFORE the run and the record says who decided:

1. **State the release rules in advance, per gate.** Plan gate: the contract matches the requirements'
   decisions and the open questions are ones the owner has already accepted. Value gate: the producing leg
   is APPROVED and its value recomputes. Method gates: release only for an APPROVED leg.
2. **Hold, don't stretch.** Anything outside the rules — a needs-revision leg, a new open question, a
   contract deviation — is left OPEN for the owner with notes. Never release a non-approved leg's gate
   "to let the program settle" under delegation; that release is the owner's call.
3. **Record the delegation on every release:** "released by <coordinator> on <owner>'s delegation
   (approver of record: <owner>)", plus the evidence checked. The release note is the audit trail.
4. **Make the waiting reliable.** The coordinator must be woken when a gate becomes ready; test any
   watcher against a known state first, and treat an empty or failed probe as an error — an untested
   watcher once left a plan gate waiting 80 minutes.
5. **Nothing else under delegation:** no code changes, pushes or reseeds during the run; the only
   recovery is re-executing a child killed by a platform restart.

## 6. Reading the result

- **`programReleasable`** (on the program task's `metadata`): a deterministic AND over facts — `true` only
  when every child pipeline's `qualityGate.outcome` is `approved` (a leg the platform **forced** to needs-revision — e.g. a kept file or device source it could not hold; *Forced outcomes* in the pipeline guide — is not approved, so the program is not releasable until that leg is fixed and re-run), no child carries `verdictMismatch: true`,
  no child's `derivationContainment` lists a violation (or an unaccounted-for `unsupported[]` entry, and any
  `checked: false` has a benign reason), Node C's terminal verdict is APPROVED with no blocking issues, and
  coverage is clean for the producer and Node C (`predecessors === chainCapablePredecessors`,
  `degradedPredecessors 0`, `notChained []`). **No confidence number appears in it** — scores are recorded,
  never gated on (pov-program 1.0.10, 2026-07-18; runs before that also gated `reviewerScore ≥ 85`). The
  canonical formula is the pov-program protocol's SYNTHESIZE gate step. It is an **input to a human release
  decision, never the decision** (VT-06).
- **`needs-node-c` — a decision handed to Node C.** Some facts on a leg cannot be decided by the leg alone (e.g. a consuming leg whose
  upstream value was checked by a different leg, or a rollback line its own harvest did not witness). The leg stamps `needs-node-c`
  with a reason instead of guessing; **Node C** (the program integration reviewer) must answer it explicitly — e.g. confirm the value
  the leg used equals the value the upstream leg published, quoting both. An unanswered `needs-node-c` keeps `programReleasable` false.
- **What Node C checks:** that every leg's protocol token and leg type match the approved plan; that values one leg publishes and another
  consumes agree; the program's own numbered acceptance checks from the spec; and every `needs-node-c` delegated to it. It is a
  reviewer, not a re-runner: it reads the legs' facts and deliverables, never re-executes them.
- **A forced or refused leg:** a leg the platform forced to needs-revision, or one whose Reviewer refused, is not `approved`, so the
  program is not releasable until that leg is fixed and re-run as a fresh task (with the duplicate clearance — pipeline guide,
  *Re-running*).
- **Reviewer warnings** (2026-10-08, WARNINGS-INVISIBLE): lines a leg reviewer (or Node C) labelled
  `NON-BLOCKING WARNING (<id>):`. The platform transcribes them (`reviewerVerdict.warnings`), stamps them on each
  leg and on the program (`reviewerWarnings`; card: `reviewerWarnings: N (ids)`, `0` = checked and none, no segment =
  not measured) and lists their text in the program `report.md` under **Reviewer warnings (non-blocking)**, by leg.
  They are recorded facts and **never an input to `programReleasable`**. Read them before releasing.
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
| A leg's reviewer returns **needs-revision** | `programReleasable:false`, keyed on the OUTCOME (a high score can't rescue a needs-revision). **Fixing the cause does NOT make the program green — see §9 before re-running anything** | VT-04 |
| A leg's **deliverable goes missing** | coverage facts (`degradedPredecessors`) block release — a count that "looks complete" can't mask a missing deliverable | VT-05 |
| **Hostile content in harvested state** (prompt-injection / secret) | design step refuses/escalates, release blocks; not obeyed, not leaked | VT-07 / Exhibit 3 |
| A synthesis turn **truncates** at the token ceiling | auto-recovered: retried with headroom in-loop; a residual is terminalized + escalated, never a silent hang (R4) | truncation-r4 review |
| The plan gate is **never released** | parks indefinitely; nothing queues, no timeout misfires | VT-03 / Exhibit 4 |

## 8. Guardrails (the invariants you can rely on)

- **Approved-but-unapplied** — the program never actuates; apply is a separate human/GitOps/`terraform
  apply` step it can only recommend (incl. the safe apply order).
- **⚠️ Never apply a block containing `<<REDACTED-SECRET>>`, `<REDACTED-SECRET>` or any other `<REDACTED…>` /
  `<<REDACTED…>>` form** (check with `grep -nE '<{1,2}REDACTED' <package file>`) — they are secret placeholders, and devices accept them as literal values (EOS community / `secret 0` / enable / TACACS
  key lines, nginx `proxy_set_header`, otelcol headers; device-verified 2026-10-13). A green `nginx -t`
  or `otelcol validate` does not prove such a block safe, and on EOS a full config replace with a
  redacted password-hash line can delete the object (the only admin user included) while printing
  success. Hold and re-author instead. A leg's `report.md` flags such lines under **Platform warnings
  (non-blocking)** since 2026-10-13; the absence of that section is not clearance. Full rule:
  [`GATES.md`](GATES.md) (Apply gate, step 2).
- **≤ 8 child pipelines per program** — a deliberate blast-radius/cost cap; group devices if the path is
  wider (`FIREWALL-POLICY-USE-CASE.md` §5).
- **Contract loud-fail** — a pipeline child without its contract aborts loudly, never silently composes.
- **Human gates everywhere** — the plan gate + per-team gates are dependency nodes the platform can
  never auto-complete; release + the final release decision are always human.

## 9. Retries, and running a leg again

**Retries the platform performs.** A leg may run one of its agents a second time when that agent's result scores in a middle
band; you will see two executions on that task. A second attempt can never make the leg worse: the platform keeps the better
result. Each agent is re-run at most once per run of the leg, and a leg that runs out of attempts ends as failed, never
hanging.

**Running a leg again by hand.** A leg came back `needs-revision`, you found the cause, and you want the program to release.
**It will not.** Once a leg of a program has been refused, `programReleasable: true` cannot be reached in that program, by
design: the record of the refusal stays. Fix the cause (usually the spec) and launch a new run
([TROUBLESHOOTING-A-RUN.md](TROUBLESHOOTING-A-RUN.md), "A leg came back refused").

## 10. Value legs

Use a **value leg** when one leg's job is to work out a value from what it reads (a free address, the range covering a set of
addresses) and other legs use it. A value leg changes nothing and produces no change package.

- The plan gives every leg a type, `value` or `change`, and quotes the phrase in your spec a value leg rests on. You approve
  the types at the plan gate. A leg that works out a value *and* changes a system is a change leg.
- In the spec, a value leg's section says "Changes nothing." and its heading names the protocol and type, for example
  `(network-derivation, value)` ([WRITING-A-SPEC.md](WRITING-A-SPEC.md), Part 1).
- Gates: the plan, then a gate after the value leg (you approve the value, and releasing it starts the legs that use it), then
  one change gate per change leg.
- A value leg may declare its own Device sources. When it reads Git files only, its result says
  `liveEvidence: git-only (declared devices)`: the value was worked out from the files, and anything configured on a device
  but not committed was not seen.
- The final review checks every leg's protocol and type against the plan you approved, and that each leg that uses the value
  applied exactly the value that was published.

## 11. See also

- Design a use-case: [`DESIGNING-A-PROGRAM.md`](design/DESIGNING-A-PROGRAM.md) ·
  [`FIREWALL-POLICY-USE-CASE.md`](design/FIREWALL-POLICY-USE-CASE.md) · [`PROGRAM-SHAPES.md`](PROGRAM-SHAPES.md).
- Leg-level detail: [`PIPELINES.md`](PIPELINES.md).
- **Make the requirements.md** (§2 "Where the two artifacts come from"): by hand, from [WRITING-A-SPEC.md](WRITING-A-SPEC.md).
- **Run the human side of the gates**: [`GATES.md`](GATES.md) — plan-gate probing, mechanical package checks, apply discipline, and the read-raw-output rule. Every device-facing defect across two campaigns was caught by an operator step, not an agent tier.
- A run that stopped: [TROUBLESHOOTING-A-RUN.md](TROUBLESHOOTING-A-RUN.md).
- Public proofs: `github.com/paichart/paichart/tree/main/verification` (OVERVIEW + ARCHITECTURE + VT-01..08).

---

## How big a program can be

**Keep each leg to about five or six devices, and add legs, not devices per leg.** Every limit on how much an agent can read
applies per leg and resets for the next one. A change across 20 devices is a program of four or five legs, not one leg of 20.
Group the legs along real boundaries: team, site, vendor, or how much one change window may touch
([design/FIREWALL-POLICY-USE-CASE.md](design/FIREWALL-POLICY-USE-CASE.md) has the decision matrix). A program holds at most
eight pipelines.
