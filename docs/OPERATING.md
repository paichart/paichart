# Operator runbook — from an objective to a change package you apply

**Who this is for:** the person who runs programs: a platform engineer, a sales engineer preparing a demo, or a customer's engineer.
You do not need to know how the platform works inside. **Start here;** each step links to the detailed guide when you need it.

**What you get at the end:** one reviewed change package per system, each built from the real file or live state, with the edits, a
rollback, and the checks to run before and after you apply it. **Nothing is ever applied for you.** Agents are read-only, and
applying is your step.

**Scope:** programs run against lab environments — that is what has been proven so far. The steps are the same on the hosted
platform and on your own install.

---

## Step 1 — Write the objective and its spec (once per objective)

A program reads two published files: **`requirements.md`** (the objective, the rules, who approves what, the final checks) and
**`topology.json`** (where each system's configuration lives). The spec names the systems and the fixed values (a pool, a port); it never
states what is configured on them now. The agents read that from the sources the spec declares.

- **Write the spec by hand:** about one page, in the shape of a released example, using [WRITING-A-SPEC.md](WRITING-A-SPEC.md). Put both files in any repository whose raw URLs your hub can fetch; if a leg reads configuration files from Git,
  that repository must be the one your hub's Git pin names. This is the route in use.
- **Re-run a spec that has already released:** use its published URLs unchanged.
- **Detail:** [DESIGNING-A-PROGRAM.md](design/DESIGNING-A-PROGRAM.md) (designing a new kind of program); [PROGRAM-SHAPES.md](PROGRAM-SHAPES.md) (shapes).
- **For a network leg:** each device's configuration source goes in a `## Device sources` block (`git-file`, `device-read`,
  `live-read` or `command-package`: [GLOSSARY.md](GLOSSARY.md), *Device sources*). See [PIPELINES.md](PIPELINES.md), "Device sources".

## Step 2 — Launch

1. **Create a fresh POV, or a fresh stage.** Its name and description describe the work, never the test: agents read them. A fresh POV
   is cleanest, because it needs no duplicate clearance and agents cannot reach older runs.
2. **Create one PIPELINE task:**
   - title ends `(protocol: pov-program)`; in a project that already holds a run of this objective, put a run number before it
     (`… (Run 2) (protocol: pov-program)`) and stamp the clearance: [TROUBLESHOOTING-A-RUN.md](TROUBLESHOOTING-A-RUN.md), "Launching again";
   - the description states the intent and gives the two spec URLs ("fetch ONLY these two URLs").
3. **Attach the Pipeline Harness template** (`agent.assign`). A pipeline task never starts on assign.
4. **Start it:** `agent.execute` with `waitForCompletion: false`. If your client times out, the run is still going: check the
   executions before you try again.

**Detail:** [PROGRAMS.md](PROGRAMS.md) §2 (launch) and §3 (the lifecycle you will see).

## Step 3 — Release the gates

The program stops at every gate until a person completes it.

**Gates you will see:**
- **the plan gate** — after the Architect plans;
- **a value gate** — after a leg that derives a value, such as an address range;
- **one change gate per change package.**

Releasing a gate never applies anything; it lets the next stage run.

| Gate | Check before you release it |
|---|---|
| **Plan** | One leg per system you expected, each typed **value** or **change**. Each change leg's contract names its config file exactly (owner, repo, ref, path), or its service. Read the plan's "Assumptions & Open Questions": the defaults it lists apply if you release. |
| **Value** | The derived value, its containment fact (`checked-clean`, 0 violations), and the reviewer's verdict. |
| **Change** | The edit receipt (`editApplication`: each edit matched once, applied N of N). The reviewer saw the platform's diff (`heldEdit.reviewerSaw: rendered`), and nothing was forced. The consumed value equals the upstream one. The reviewer's verdict. |

**`npm run report:gate -- <gate id>`** prints these checks from the stored facts, each marked ✓ or ✗, for whichever gate you give it.
It decides nothing; it shows the evidence, including the reviewer's blocking reasons when there are any.

Complete a gate with `task.complete` and a note saying what you checked. **A leg that comes back needs-revision is often the pipeline
working:** read why before anything else. A correct refusal counts as success.

**Detail:** [GATES.md](GATES.md) (what to do at each gate, and the traps); [PROGRAMS.md](PROGRAMS.md) §5.

## Step 4 — Read the result

When every leg and gate is done, the program synthesises and stamps **`programReleasable`**. That is an AND:
- every leg approved;
- the program reviewer approved;
- every value contained;
- every input delivered.

It is the input to your release decision, not the decision itself.

- **How to read it:** [READING-A-RUN.md](READING-A-RUN.md). It explains facts versus verdicts, the signal catalogue, the hand read in order,
  and **what nothing checks**. The per-domain tours sit beside it (network, Kubernetes, Terraform, observability, program).
- **Stored before and after copies of a kept file:** `project(action: "held.get", executionId, handle, kind)` with `kind` = `BASE` or
  `CANDIDATE`.

## Step 5 — Apply it yourself

The package names, per system: the edits, the rollback, and the validation steps, each a command with an exact expected answer.

1. **Check the candidate before you apply**, if you want certainty. These change nothing:
   - Kubernetes: `kubectl apply --dry-run=server`;
   - Terraform: `terraform plan`;
   - nginx-style configs: `nginx -t` in a throwaway container.
2. **Apply in your own change process,** then run the package's checks before and after.
3. **For a network device:** apply the edits to your own copy, in a configuration session. Check the device's own diff against the
   package, and use a revert timer. See [PIPELINES.md](PIPELINES.md) § Kept files.

**Remember:** whether the real system enforces the change is a stated, untested premise until you apply it and its checks pass.

---

**If a run stops, or something looks wrong:** [TROUBLESHOOTING-A-RUN.md](TROUBLESHOOTING-A-RUN.md) finds where the run is and why. For a refusal, read the leg's facts line and its reviewer's reasons first. Then see [PROGRAMS.md](PROGRAMS.md) §7
(failure semantics: a run never hangs and never applies).
