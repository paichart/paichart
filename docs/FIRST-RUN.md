# Your first run

Look at a finished run (section 1), run the same one yourself (section 2), then try a bigger one (section 4, no lab needed); section 3 is reference for every run. Words used here (all of them, and more,
are in [GLOSSARY.md](GLOSSARY.md)): a **pipeline** is one
chain of agents (harvest the current state → design → author → review) that produces one reviewed change package or one
checked value. A **program** is several pipelines coordinated as one change; each pipeline in a program is called a **leg**. A
**gate** is a point where the program stops until a person approves. pAIchart never applies a change: you get a package, and
applying it is your step.

**Why there are gates.** A program is a graph of AI agents, and **your approvals are how a person regulates that graph**. The
agents are never asked to pass a gate themselves: the work behind it does not start until you have looked at what was produced and said
yes. A gate is where you check the plan before any agent acts on it, check a value before another agent builds on it, and
check a change package before you would apply it. Saying no — leaving a gate closed — is a normal outcome, not a failure.

**You can watch and approve in the web app.** Open your install in a browser, choose **Projects** in the left sidebar
(refresh the page if the project is not listed yet), and click the project: every task of the run is there with its title,
its description, the agent assigned to it and its result, and each gate is a task whose title usually starts `APPROVE`.
Releasing a gate means marking that task completed — in the web app, or with the call shown below.

In the web app, step by step:
- **To read what an agent produced** (the plan, a leg's result): click the project, click the task (for the plan, the one
  whose title starts *Produce program plan*). Two tabs appear, **Tasks** and **Agents**. Choose **Agents → Artifacts** and
  open the report.
- **To release a gate:** in the project, open the phase (named after your phase — *First run* here; the run's tasks sit in the
  stage the program created inside it), select the gate task (for the plan gate, the one whose title starts *APPROVE PROGRAM
  PLAN*), open the **Tasks** tab, change the status from
  **In Progress** to **Completed**, and press **Save Changes**.
- **Or just say it to Claude** — the simplest way: *"If the plan looks good, release the gate."* Claude reads what was produced,
  tells you what it found, and releases the gate for you.

## 1. See a finished run (no install needed)

Sign in at [paichart.app](https://paichart.app). A Claude client signs in with GitHub; a ChatGPT client signs in with
Microsoft. A first sign-in is a demo account: you can browse the demo projects and use any public MCP service. Until the
account is promoted to a standard user, you cannot create or edit projects or run agents. Choose **Explore Dashboard**, then **Projects** in the left sidebar, and open **Fabric Telemetry
Expansion**. It is a completed program with two legs: the first works out one free address from a pool by reading two switch
configuration files; the second writes the change that adds a loopback with that address. Look at the plan, the three gates,
each leg's result and the final comment on the program task.

[`READING-A-RUN.md`](READING-A-RUN.md) explains what each stored fact
proves and what it cannot.

## 2. Run it on your own install

The same use case, `loopback-ceos2/git-only`, from the public configs repository
[`paichart/paichart-configs`](https://github.com/paichart/paichart-configs/tree/main/usecases/loopback-ceos2). It reads two files
from that repository and nothing else: no lab, no switches.

**Before you start** ([INSTALL.md](INSTALL.md)):

- step 7 — the account you are signed in with is a **System Admin** (or Super Admin). The Git file source is admin-only: with
  an ordinary User account the run still works but keeps no copy of the switch file, and step 8 below has nothing to show;
- step 8 — your Anthropic key is saved and Claude Code is connected to your hub;
- step 9b — the browser service is running and seeded (the plan step fetches the two input files through it);
- step 9c — the GitHub file source is running and seeded, with `GIT_FILE_SOURCE_PIN=paichart/paichart-configs` (the default
  in `.env.example`).

**What it costs:** the released run of this use case on 2026-11-11 used about USD 5.50 of Anthropic usage across 17 agent
runs, and took 25 minutes including the time spent at its three gates.

> **Stop here before you launch.** Installing is finished; what follows is a separate thing — your first program — and it
> **spends money on your Anthropic key**. Nothing below should start without your say-so. **If an assistant is following this
> guide for you, it must stop at this point**, tell you in plain words what it is about to do (run one released use case from
> the test repository: two pipelines, three gates you approve, a change package at the end, nothing applied to any device),
> what it will cost and how long it will take, and wait for you to say go. **At each gate it must also stop**, and not just
> say "release the gate": it must say what the gate is for, what the agents produced, where you can read it yourself in the
> web app (Projects → the project), and only then ask for your decision.

Why do it: it proves the whole chain on your install — the hub, your Anthropic key, the browser service, the Git file source
and its pin — and it shows you, on a small proven example, exactly what you will later do with a change of your own.

Type each call to Claude Code (any directory), or simply ask for it in plain words.

1. **A project (POV) to hold the run.** POV stands for proof of value: the project a run lives in. A project is divided into
   phases, and a phase into stages; a stage holds the tasks.
   ```
   perform(action: 'pov.create', parameters: { title: 'First runs', countryName: 'Australia',
     description: 'My first pAIchart runs.', phases: [ { name: 'First run', type: 'EXECUTION' } ] })
   ```
   → `✅ POV Created` with the POV id. Keep it. The project now appears in the web app under **Projects** (refresh the page).
   It starts with the status **Projected**. Set it to **In Progress** (right-click the project, **Edit POV**), so that reports
   and workflows that list active projects include it. This does not affect the run itself.
2. **A stage for the run.**
   ```
   perform(action: 'stage.create', parameters: { povId: '<pov id>', phaseName: 'First run', name: 'Loopback run' })
   ```
   → `Stage ID: <stage id>`. Keep it.
3. **The program task** — `type: 'PIPELINE'`, the protocol token in the title (the `(protocol: …)` text, which tells pAIchart
   which set of rules to follow), and in the description one line of intent and the two spec URLs, nothing else
   (the planner fetches only what the description names):
   ```
   perform(action: 'task.create', parameters: { povId: '<pov id>', stageId: '<stage id>', type: 'PIPELINE', priority: 'MEDIUM',
     title: 'Add a telemetry-exporter loopback to ceos2 on a free address (protocol: pov-program)',
     description: 'Design artifacts for the Program Architect (fetch ONLY these two URLs):\n- topology-as-code: https://raw.githubusercontent.com/paichart/paichart-configs/main/usecases/loopback-ceos2/git-only/topology.json\n- requirements: https://raw.githubusercontent.com/paichart/paichart-configs/main/usecases/loopback-ceos2/git-only/requirements.md' })
   ```
   → `Task ID: <task id>`, `Status: OPEN`.
4. **Give it the harness and start it.** The harness is the coordinating agent: it creates the other tasks and starts them in order. (`agent.execute` attaches it to a `PIPELINE` task that has none, so the `agent.assign` call is optional; it is shown so you can see what runs.) `template(action: 'list')` shows the id of the **Pipeline Harness** template: find the entry named exactly `Pipeline Harness` and copy its id (a 25-character string beginning with `c`).
   ```
   perform(action: 'agent.assign',  parameters: { taskId: '<task id>', agentTemplateId: '<Pipeline Harness template id>' })
   perform(action: 'agent.execute', parameters: { taskId: '<task id>', waitForCompletion: false })
   ```
   → `Execution Status: RUNNING`. Within a minute the program creates its own stage and starts the **Program Architect**,
   which reads the two files and writes the plan. **The plan takes about five minutes**; nothing needs you until then. To see
   where it is, ask for `project(action: 'task.context', taskId: '<task id>')` every minute or so.
5. **Read the plan, then release the plan gate.** When the plan is ready the program comments
   `⏸ PROGRAM PLAN AWAITING APPROVAL` on your task, with the gate's id — `project(action: 'task.context', taskId: '<task id>')`
   shows the comment. Every task of the run, with its id, type and status, is listed by
   `project(action: 'task.list', povId: '<pov id>')`: the plan is the task whose title starts *Produce program plan*, the gates
   are the tasks of type `APPROVAL`, the legs are the tasks of type `PIPELINE`. **To read the plan itself**, in the web app open **Projects** → your project → the task whose title starts *Produce program
   plan* → **Agents → Artifacts** — the easiest way — or ask for
   `perform(action: 'agent.results', parameters: { taskId: '<Program Architect task id>', verbose: true })`. (The comment also
   offers a `fetch(id: …)` line; on some versions that id does not resolve — use one of the two ways above.) The comment may
   say the gates are **unassigned, please reassign**: that is because the spec's approvers are placeholders. You do not need
   to reassign anything — as the project's owner you can release each gate yourself. The plan should show **two legs — a value leg and a
   change leg — and three gates**. The approvers named in the spec are placeholders (`…@example.com`), so each gate falls to
   you as the project's owner. `npm run report:gate -- <gate id>` (run in `~/paichart`) prints what to check, from stored facts. Then:
   ```
   perform(action: 'task.complete', parameters: { taskId: '<plan gate id>' })
   ```
   → the reply names the gate. **Read the gate's status back** — `project(action: 'task.context', taskId: '<gate id>')` must
   show `Status: COMPLETED`. A release sent within seconds of the step before it finishing can be refused while the state
   settles: the reply then says `DEPENDENCY_NOT_SATISFIED`, or the status still reads `IN_PROGRESS`. That is not a fault. Send
   it again (usually the first try works; on a slow machine it has taken up to five tries over about 50 seconds).

   **5a. Finding the other two gates.** All three gates are tasks of type `APPROVAL` in the program's own stage (their titles
   usually start `APPROVE`): `project(action: 'task.list', povId: '<pov id>')` lists them with their ids and status. A gate can be released only when
   the step before it has finished.
   **Releasing the plan gate starts the first agent pipeline** — we call it a **leg**. Here it is the leg that works out the
   address; it takes a few minutes, and the next gate cannot be released until it has finished.

   **5b. From here you can hand the rest to Claude.** Say: *"Check if the leg is completed and, if it looks good, release the next
   two approval gates."* Claude waits for each leg, reads its result, tells you what it found, and releases the address gate
   and then the network change gate. The program runs on until it finishes with **`programReleasable: true`** — every leg and
   the integration review approved — or stops with **needs-revision**, which names what was refused and why. On this small,
   proven example that is a reasonable way to see a whole run; on a change of your own, read each result yourself before you
   approve. Steps 6 and 7 say what each gate is about.

6. **The address gate.** The value leg publishes one address inside `10.99.0.0/24` that neither switch file uses, and changes
   nothing. `npm run report:gate -- <address gate id>` prints the address and whether the leg's reviewer approved it; the
   leg's own report is `perform(action: 'agent.results', parameters: { taskId: '<value leg task id>', verbose: true })`
   (the leg is the `PIPELINE` task in the same list whose title ends `(protocol: network-derivation)`). Check the address,
   then release the gate with `task.complete` as in step 5. The change leg starts.
7. **The network change gate.** The change leg produces a package: edits to `network/base/ceos2-startup.cfg` that add one
   loopback and a BGP `network` statement, plus a rollback. The program's integration review runs before this gate.
   `npm run report:gate -- <network change gate id>` prints the facts to check; the package itself is the change leg's report:
   `perform(action: 'agent.results', parameters: { taskId: '<change leg task id>', verbose: true })` (the `PIPELINE` task whose
   title ends `(protocol: network-provisioning)`), or open that task in the web app and read its report. Read the package,
   then release the gate the same way.

8. **See exactly what changed** — the most convincing part of the run. pAIchart kept the exact bytes of the switch file as it
   was read from Git (the **base**) and as the Author left it (the **candidate**). Fetch both and compare them; the comparison is
   evidence, not an agent's description. The simplest way is to ask Claude:

   *"Show me what the change leg did to the switch file. Find the Author task in my project, get its execution id and edit
   receipt, fetch the BASE and CANDIDATE kept copies of the edited file with held.get, save them and show me a unified diff.
   Do not paraphrase the diff."*

   The calls behind that request:
   ```
   project(action: 'task.list', pov_name: 'First runs')                                   # the task whose title starts "Author config change-package"
   perform(action: 'agent.results', parameters: { taskId: '<Author task id>', verbose: true })   # the execution id ("• ID: c…", 25 characters) and the edit receipt
   project(action: 'held.get', executionId: '<execution id>', handle: 'H1', kind: 'BASE')
   project(action: 'held.get', executionId: '<execution id>', handle: 'H1', kind: 'CANDIDATE')
   ```
   (`verbose: true` is needed for now: the short result card shows only the last 8 characters of the execution id. The edit
   receipt names each kept file and its handle — `H1` is the edited file here.) What you should see, as on the fresh install this
   guide was checked on:
   ```diff
   +interface Loopback14
   +   description telemetry-exporter (existing allocation)
   +   ip address 10.99.0.3/32
   +!
    router bgp 65002
    …
   +   network 10.99.0.3/32
   ```
   Two insertions, nothing removed: 64 lines before, 69 after, every original line still there in the same order, and the address
   is the one the first leg worked out and you approved. The other switch file has a base copy and **no** candidate (`held.get`
   answers `not-found` for it) — it was read and never edited. Each `held.get` also returns a hash of the copy and writes a
   record of who read it.

   **Two things to know about the kept copies.** They are stored with secrets replaced: the file's SNMP line reads
   `snmp-server community <<REDACTED-SECRET>> ro` in both copies (that value in the test repository is a deliberate fake, there so
   you can see this happen), and `held.get` marks them `applicable: false`, `mode: "diff-only"`. So the comparison is exact, but
   **a kept copy is not a file to load onto a switch**. To apply the change you apply the added lines; to undo it you remove them,
   or restore the file from Git at the commit the copy names (`sourceRevision`).
   [SELF-HOST-KEPT-FILES.md](SELF-HOST-KEPT-FILES.md) explains what is stored, where, and who can read it.

`project(action: 'task.context', taskId: '<task id>')` shows where the run is at any time.

**You are done when** the program task carries `programReleasable: true` and its final comment lists every leg and the
integration review as approved. The released run chose `10.99.0.3/32`; yours should choose an address the two files do not
use, and say which rule it applied. The package says its values were checked against the committed files only — that is the
stated limit of a Git-only run, not a defect.

If a leg is refused, read why before assuming the install is broken: a refusal names its reason, and refusing a wrong change
is the pipeline working. [`READING-A-RUN.md`](READING-A-RUN.md) shows
how to read one.

## 3. Things every run shares

**What your run cost.** `npm run report:run-cost -- <pov id>` (run in `~/paichart`) prints the Anthropic cost of every agent run
in the project, by model and by task. The run this guide was checked on, on a fresh install on 2026-11-13: USD 5.39, 17 agent
runs, 21.5 minutes including the gates.

**If a run stops** — [TROUBLESHOOTING-A-RUN.md](TROUBLESHOOTING-A-RUN.md) covers every case. The one specific to a fresh install: a leg sits *In Progress* for more than 15 minutes with nothing new — check whether the
hub can reach its database: `curl -s localhost:8080/health` shows `"database": { "state": … }`. `ok` means the hub is fine and the
run is waiting on something else (a gate, usually). `unreachable` means PostgreSQL is down or restarting; the hub reconnects by
itself when it returns. `engine-dead` means the hub's own database client is broken; the hub notices within about 30 seconds,
exits, and systemd starts a fresh one (`sudo journalctl -u paichart-mcp --since -5min | grep 'engine in this process is gone'` shows it). While the
database cannot be reached the hub answers requests with "cannot reach its database … do not sign in again" — that is accurate:
signing in again does not help. After a hub restart, reconnect Claude Code (`/mcp`) and launch the run again: a run that was in flight when the hub restarted
cannot be resumed. Keep the stopped run (mark it superseded: [TROUBLESHOOTING-A-RUN.md](TROUBLESHOOTING-A-RUN.md), "Launching again in
the same project") and stamp the new task as described under "Re-running a program" below, or launch in a new project (no stamp needed).

**Re-running a program** (an escalated leg, a corrected artifact): a finished program cannot be re-run in place.
Create a fresh PIPELINE task with a run number in its title (`… (Run 2) (protocol: pov-program)`) and stamp the prior program stage on it
([TROUBLESHOOTING-A-RUN.md](TROUBLESHOOTING-A-RUN.md), "Launching again in the same project") — the harness's pre-flight
halts on a duplicate `Program: …` stage and accepts only a machine-checkable clearance, never prose in the description:
```
perform(action: 'task.update', parameters: { taskId: '<new task id>', metadata: { duplicateAcknowledged: ['<stage id>', …] } })
```
then `agent.assign` + `agent.execute` as in section 2, step 4. The list names every earlier run's `Program: …` stage and each of its
legs' `Pipeline: …` stages (`project(action: 'pov.details')` lists the stages): the full rule is in
[TROUBLESHOOTING-A-RUN.md](TROUBLESHOOTING-A-RUN.md), "Launching again in the same project".

**Releasing a gate**: after `perform(action: 'task.complete', …)` on a gate, read the gate's own status back — a release
issued within seconds of the upstream leg completing can be rejected while the dependency state settles (it took up to
five attempts over ~50 s on a laptop). The action's reply text is not the state; `Status: COMPLETED` on the gate is.

A failure at section 2, step 4 (the launch) with `llm_initialized` means the running user has no resolvable LLM key ([INSTALL.md](INSTALL.md) step 8:
Profile Settings → AI Provider Settings). A leg that escalates on its harvest usually means a rig service answered `initialize`
but could not READ — check the rig README's readiness probes, not the container list.

## 4. A bigger example

[`firewall-partner-path-r2`](https://github.com/paichart/paichart-configs/tree/main/usecases/firewall-partner-path-r2) is a
program of **two change legs**, the second waiting for the first. An edge leg on `ceos1` lets partner traffic in, picks a free
address pool to translate it to, and advertises that pool; a core leg on `ceos2` then admits exactly that pool. It shows a value
one leg chooses being used, unchanged, by the next. Its `git-only` variant needs **no lab**: like the first run it reads the two
switch files from `paichart/paichart-configs`, so everything in section 2's "Before you start" is enough. It has released on
both of its variants; its README says what a successful run looks like.

Launch it exactly as in section 2, steps 2 to 4, with a new stage and these two URLs in the description:

```
https://raw.githubusercontent.com/paichart/paichart-configs/main/usecases/firewall-partner-path-r2/git-only/topology.json
https://raw.githubusercontent.com/paichart/paichart-configs/main/usecases/firewall-partner-path-r2/git-only/requirements.md
```

What differs from the first run:

- **Three gates again, but two change packages:** the plan gate, then a gate for the edge package, then one for the core
  package. The core leg does not start until the edge leg has finished and its gate is released.
- **Read the pool at the edge gate.** The edge leg states which pool it chose and why it is free. The core leg uses that pool
  and may not choose another; the final review checks that both legs carry the same one.
- **It reads Git files only,** so the pool is checked against the committed files, not against running switches. The package
  says so. The `git-live` variant reads the running switches as well, and needs two switches and a read-only device service:
  its README lists what must be running. The lab recipes are in this repository under `usecases/` (`network-lab`,
  `kubernetes-lab`, `terraform-lab`, `observability-lab`).
- **Run it in a project that is not marked as a demo:** a demo project does not show the switch files to the agent that
  writes the change.

The release is still your decision. A run can show every leg approved and the final review approved and still record
`programReleasable: false` on a mechanical check. Read the facts ([READING-A-RUN.md](READING-A-RUN.md)), not the adjectives.

## Next

- Two quick things to say to Claude Code, now that a project exists: *"Which pAIchart hub am I connected to, and as whom?"* and,
  with the project set to **In Progress**, *"Run the weekly-pov-digest workflow"* (it lists your projects by status; no agent runs).

- [Operator runbook](OPERATING.md) — running programs day to day.
- [Program spec checklist](WRITING-A-SPEC.md) — writing the two input files for a
  change of your own. Put them in any repository whose raw URLs your hub's browser service can fetch; if a leg reads
  configuration files from Git, that repository must be the one `GIT_FILE_SOURCE_PIN` names.
- [Other use cases](https://github.com/paichart/paichart-configs/tree/main/usecases) in the configs repository.
