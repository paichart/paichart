# Programs

A **program** runs several pipelines as one change: one spec, one plan a person approves, then the pipelines (its **legs**),
each for one domain or one group of systems, then a final review that the legs fit together. This page is the reference for
running one. To run your first, use [FIRST-RUN.md](FIRST-RUN.md); for the short procedure, [OPERATING.md](OPERATING.md). A single
pipeline is covered in [PIPELINES.md](PIPELINES.md), and everything there applies to each leg. Terms are in
[GLOSSARY.md](GLOSSARY.md); the evidence for each claim is in the [verification pack](../verification/README.md).

## 1. What a program is

A program turns one spec (`requirements.md` and `topology.json`) into a reviewed set of change packages for several systems,
none of them applied. The steps:

1. a planner (the **Program Architect**) reads the spec and writes a plan and an **interface contract**: the values every leg
   must use exactly;
2. a person approves the plan;
3. the legs run, side by side or one after another as the plan says, each under its own domain's rules and all against the
   same contract;
4. a final review (the **integration review**) checks, from recorded facts, that the legs fit together;
5. the platform records whether the program is releasable (`programReleasable`), and a person decides.

A program plans and reviews. It never applies a change: applying is yours, in your own change process.

**When to use one:** several vendors, teams or domains that need separate designs and separate approvals over one shared
design. A few devices of one vendor under one team are a single pipeline
([PROGRAM-SHAPES.md](PROGRAM-SHAPES.md); [design/FIREWALL-POLICY-USE-CASE.md](design/FIREWALL-POLICY-USE-CASE.md) §4).

## 2. Launch a program

Create a task of type `PIPELINE` whose title ends `(protocol: pov-program)` and whose description gives the two spec URLs and
nothing else, assign the *Pipeline Harness* template, and start it:

```
perform(action: "task.create", parameters: {
  povId, stageId,                              // a host stage in an EXECUTION phase
  title: "<program objective> (protocol: pov-program)",
  type: "PIPELINE",
  description: "Program intent: <one line>.\n\nDesign artifacts for the Program Architect (fetch ONLY these two URLs):\n- topology-as-code: https://raw.githubusercontent.com/<owner>/<repo>/main/<directory>/topology.json\n- requirements: https://raw.githubusercontent.com/<owner>/<repo>/main/<directory>/requirements.md"
})
perform(action: "agent.assign", parameters: { taskId: "<program task id>", agentTemplateId: "<Pipeline Harness template id>" })   // template(action: "list") shows the id
perform(action: "agent.execute", parameters: { taskId: "<program task id>", waitForCompletion: false })
```

Launching spends your Anthropic credit. The plan takes about five minutes; then the program waits at the plan gate.

### Where the two files come from

`topology.json` and `requirements.md` live in a new directory, one per objective, in a repository whose raw URLs your hub can
fetch ([WRITING-A-SPEC.md](WRITING-A-SPEC.md), "Where the two files go"). Never edit a published one: it is a run's input of
record. One published spec serves every run of its objective. Write the spec by hand, from the shape of a released example,
with [WRITING-A-SPEC.md](WRITING-A-SPEC.md).

### Running again in a project that already holds a run

Put a run number in the title (`<objective> (Run 2) (protocol: pov-program)`) and stamp the clearance on the new task before
you start it: [TROUBLESHOOTING-A-RUN.md](TROUBLESHOOTING-A-RUN.md), "Launching again in the same project". A first run in a
fresh project needs neither. Each finished run leaves its stages behind, so the clearance names every earlier run's
`Program: …` stage and its legs' `Pipeline: …` stages.

## 3. What you will see

1. **The plan.** The program creates a stage named `Program: <objective>` and one task in it, the planner's. The planner fetches
   the two URLs and writes its plan: the interface contract first, then the intent, the legs and what each waits for, its
   assumptions and open questions, and an estimate of cost and time. Each leg is given a type, `value` or `change` (§10).
2. **The tasks.** When the plan is written, the program creates everything else in that stage: the **plan gate**, the other
   gates the plan names, one `PIPELINE` task per leg (each holding the contract), a task that composes the final document, and
   the integration review. It posts the plan for approval and stops. **No leg runs until a person releases the plan gate.**
3. **The legs.** When you release a gate, the legs waiting on it start within seconds. Each runs as its own pipeline, in its own
   stage, with its own agents and its own reviewer.
4. **The integration review** runs when the legs have finished. It waits for the legs only, never for a gate, so its verdict is
   there to read before you decide a gate that follows a leg.
5. **The result.** When every task, gates included, is finished, the program checks the recorded facts, records
   `programReleasable`, completes, and posts one final comment: a table of the legs, where the composed document is, and a
   reminder that release is your decision.

## 4. The interface contract

The contract is what keeps the legs consistent: shared addresses, names, flow definitions. The planner writes it; every leg
receives it as fixed values, shown first in what the leg's agents read, to be used exactly and never re-derived.

- **A leg that reaches its start without the contract stops with an error** (`INTERFACE_CONTRACT_MISSING`). It never runs on
  a guess. When the program itself creates a leg and leaves the contract off, the platform supplies the plan's contract, or
  records why it could not.
- **The contract is fixed when the legs are created.** A corrected plan does not reach legs that already exist
  ([GATES.md](GATES.md), "Plan gate").
- **A value one leg produces for another** is not in the contract, because it is not known up front. The plan makes the later
  leg wait for the earlier one, and the earlier leg's result is handed to it.

**Network legs: the `## Device sources` block travels in the contract.** Write each network leg's block in `requirements.md`;
the planner copies it exactly.

- **List every device a leg must see, not only the ones it changes.** A value worked out for one switch must not collide with
  what another switch already uses, and a leg checks only the devices it is given.
- **Known limitation:** a device left out of a leg's block is not checked by that leg, and that leg's reviewer can approve a
  value that collides there. The integration review is then the only check. Listing the device closes the gap.
- Two change legs can share one block when they need the same lines. Different lines for the same device in two change legs
  are not supported.
- **A value leg has its own block** (its own `## Device sources` section in the spec). With none, it reads through its service
  and reads no Git file. Reading Git files only is allowed and is stated on its result (§10).
- On a change leg, a Git file that differs from its device is applied line by line, never loaded whole, and a declared source
  that could not be read is refused by that leg's reviewer.

Details: [PIPELINES.md](PIPELINES.md), "Which devices to list" and "Network: kept device configurations".

## 5. Gates

A gate is a task that waits for a person. Release one either way:

- `perform(action: "task.complete", parameters: { taskId: "<gate id>" })`, then read the gate's status back; or
- in the web app: open the gate task, set its status to **Completed**, **Save Changes**.

A gate released out of order is refused (`DEPENDENCY_NOT_SATISFIED`). What to check before each kind of gate is in
[GATES.md](GATES.md).

### The plan gate is where your answers still count

The planner addresses its open questions to this gate. Releasing without answering them is not neutral: it selects whichever
reading the planner chose, and the program runs on that. Before you release, read the plan and check:

1. **"Assumptions & Open Questions".** Any item asking you to confirm something is a question you answer by releasing. If your
   answer should change what a leg does, write it into that leg's task description (`task.update`) before you release, or fix
   the spec and launch again. A gate's note is a record for people; no agent reads it.
2. **What each leg and gate waits for.** That is the order that will be built. A gate that waits for the leg it was meant to
   hold back records a decision; it does not control anything.
3. **Every named approver is on the project's team.** A gate whose approver is not a member goes to the project's owner, without
   any error.
4. **Who each gate is assigned to**, on the gate task itself, the plan gate included. The assignment shows who is expected to
   decide; it is not enforced (any team member can release a gate), so make sure it names the right person. `task.assign`
   corrects it before release.
5. **Each leg's task description**, not only the plan. The program writes each leg's description from the plan and can drop a
   line. Check that each leg names the service it reads through (in its description or in its contract), its type and its
   scope. Add what is missing to that leg's description before you release anything.

A planner that notices an ambiguity in your spec, picks a defensible reading and tells you is doing what you want. The control
works only if someone reads the question.

### Letting your AI client release gates

You may let the session that launched a program check and release its gates for you. Fix the rules before the run:

1. **State the rule for each gate in advance.** For example: release the value gate when the leg is approved and its value
   recomputes; release a change gate only for an approved leg.
2. **Anything outside the rules is left open for you**, with notes: a refused leg, a new open question, a contract that differs
   from the spec.
3. **Every release says who decided:** "released by <client> for <owner> (approver of record: <owner>)", and what was checked.

The `paichart-operator` agent works this way: it never releases a gate you have not approved.

## 6. Reading the result

- **`programReleasable`** (on the program task) is `true` only when all of these hold, each from a recorded fact: every leg's
  outcome is `approved`; no leg's reviewer verdict contradicts its recorded outcome; no leg's containment check lists a
  violation; the integration review's verdict is approved with nothing blocking; and the final document and the integration
  review each received every leg's result. **No score is part of it.** It is an input to your release decision, never the
  decision.
- **A leg the platform forced to `needs-revision`** (for example a kept file it could not hold) or one its reviewer refused is
  not approved, so the program is not releasable. Running that leg again does not change this: fix the cause and launch a new
  run ([TROUBLESHOOTING-A-RUN.md](TROUBLESHOOTING-A-RUN.md)).
- **A decision handed to the integration review** (`needs-node-c`). Some things a leg cannot settle alone, such as whether the
  value it used is the value another leg published. The leg records that it is handing the decision on, and the integration
  review must answer it explicitly, quoting both values. Unanswered, the program is not releasable.
- **What the integration review checks:** every leg's protocol and type against the plan you approved; that a value one leg
  publishes and another uses is the same value; the spec's own numbered final checks; and every decision handed to it. It reads
  the legs' facts and results; it never runs a leg again.
- **Reviewer warnings.** A reviewer may mark a line as a non-blocking warning. The platform records these and lists them in the
  program's `report.md` under "Reviewer warnings (non-blocking)", by leg. They never affect `programReleasable`. Read them
  before you release.
- **`programConfidence`** is the lowest of the legs' confidence scores. It is an agent's judgement, recorded, not a bar.
- **The composed document** is the program's `report.md`.
- **The final comment** has the table of legs, where the document is, and the order to apply the packages in.

[READING-A-RUN.md](READING-A-RUN.md) explains which of these are measured facts and which are an agent's judgement.

## 7. When something goes wrong

A program never hangs silently and never applies anything.

| Situation | What the program does | Evidence |
|---|---|---|
| A leg can never run (it has lost its contract) | that leg and everything after it are marked failed, with the cause; healthy legs are kept; the program stops and names the leg; not releasable | VT-02 |
| A leg's reviewer returns `needs-revision` | not releasable, whatever the score. Fixing the cause does not make this program releasable (§9) | VT-04 |
| A leg's result goes missing | the coverage check blocks release: a count that looks complete cannot hide a missing result | VT-05 |
| Hostile content in what a leg read (an injected instruction, a secret) | the design step refuses or stops, and release is blocked; the content is not obeyed and not leaked | VT-07 |
| An agent's answer is cut off at its length limit | retried automatically with more room; if that fails, the task ends as failed, never left hanging | |
| The plan gate is never released | the program waits indefinitely; nothing starts and nothing times out | VT-03 |

What to do in each case: [TROUBLESHOOTING-A-RUN.md](TROUBLESHOOTING-A-RUN.md).

## 8. What you can rely on

- **Nothing is applied.** The program produces packages and recommends the order to apply them in.
- **Never apply a block that contains a secret placeholder** (`<<REDACTED-SECRET>>`, `<REDACTED-SECRET>` or any other
  `<REDACTED…>` form). Devices and services accept them as literal values. Full rule: [GATES.md](GATES.md), "Applying a package",
  step 3.
- **At most eight pipelines per program.** Group systems into legs if the change is wider.
- **A leg without its contract stops with an error.**
- **Gates wait for a person.** The platform's own machinery never completes a gate; the project's owner, a team member or an
  administrator does, directly or through their AI client ([GATES.md](GATES.md), "Who can release a gate"). The release
  decision at the end is always yours.

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

## See also

- The short procedure: [OPERATING.md](OPERATING.md). Your first program: [FIRST-RUN.md](FIRST-RUN.md).
- Gates and applying a package: [GATES.md](GATES.md). A run that stopped: [TROUBLESHOOTING-A-RUN.md](TROUBLESHOOTING-A-RUN.md).
- Choosing a shape and designing a program: [PROGRAM-SHAPES.md](PROGRAM-SHAPES.md), [design/DESIGNING-A-PROGRAM.md](design/DESIGNING-A-PROGRAM.md).
- Writing the spec: [WRITING-A-SPEC.md](WRITING-A-SPEC.md). One guided tour of a whole program: [walkthroughs/PROGRAM-WALKTHROUGH.md](walkthroughs/PROGRAM-WALKTHROUGH.md).

## How big a program can be

**Keep each leg to about five or six devices, and add legs, not devices per leg.** Every limit on how much an agent can read
applies per leg and resets for the next one. A change across 20 devices is a program of four or five legs, not one leg of 20.
Group the legs along real boundaries: team, site, vendor, or how much one change window may touch
([design/FIREWALL-POLICY-USE-CASE.md](design/FIREWALL-POLICY-USE-CASE.md) has the decision matrix). A program holds at most
eight pipelines.
