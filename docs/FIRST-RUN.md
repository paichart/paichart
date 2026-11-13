# Your first run

Three steps: look at a finished run, run the same one yourself, then try a bigger one. Words used here: a **pipeline** is one
chain of agents (harvest the current state → design → author → review) that produces one reviewed change package or one
checked value. A **program** is several pipelines coordinated as one change; each pipeline in a program is called a **leg**. A
**gate** is a point where the program stops until a person approves. pAIchart never applies a change: you get a package, and
applying it is your step.

**Why there are gates.** A program is a graph of AI agents, and **your approvals are how a person regulates that graph**. The
agents cannot pass a gate themselves: the work behind it does not start until you have looked at what was produced and said
yes. A gate is where you check the plan before any agent acts on it, check a value before another agent builds on it, and
check a change package before you would apply it. Saying no — leaving a gate closed — is a normal outcome, not a failure.

**You can watch and approve in the web app.** Open your install in a browser, choose **Projects** in the left sidebar
(refresh the page if the project is not listed yet), and click the project: every task of the run is there with its title,
its description, the agent assigned to it and its result, and each gate is a task whose title usually starts `APPROVE`.
Releasing a gate means marking that task completed — in the web app, or with the call shown below.

In the web app, step by step:
- **To read what an agent produced** (the plan, a leg's result): click the project, click the task (for the plan, the one
  whose title starts *Produce program plan*). Two menus appear, **Tasks** and **Agents**. Choose **Agents → Artifacts** and
  open the report.
- **To release a gate:** in the project, open the phase menu (named after your phase — *First run* here), select the gate task
  (for the plan gate, the one whose title starts *APPROVE PROGRAM PLAN*), open the **Tasks** menu, change the status from
  **In Progress** to **Completed**, and press **Save Changes**.
- **Or just say it to Claude** — the simplest way: *"If the plan looks good, release the gate."* Claude reads what was produced,
  tells you what it found, and releases the gate for you.

## 1. See a finished run (no install needed)

Sign in at [paichart.app](https://paichart.app). A Claude client signs in with GitHub; a ChatGPT client signs in with
Microsoft. A first sign-in has demo access, which is read-only. Open **Dashboard > Projects** and open **Fabric Telemetry
Expansion**. It is a completed program with two legs: the first works out one free address from a pool by reading two switch
configuration files; the second writes the change that adds a loopback with that address. Look at the plan, the three gates,
each leg's result and the final comment on the program task.

[`walkthroughs/READING-A-RUN.md`](../.claude/knowledge/pipelines/walkthroughs/READING-A-RUN.md) explains what each stored fact
proves and what it cannot.

## 2. Run it on your own install

The same use case, `loopback-ceos2/git-only`, from the public configs repository
[`paichart/paichart-configs`](https://github.com/paichart/paichart-configs/tree/main/usecases/loopback-ceos2). It reads two files
from that repository and nothing else: no lab, no switches.

**Before you start** ([INSTALL.md](INSTALL.md)):

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

1. **A project (POV) to hold the run.** POV stands for proof of value: the project a run lives in.
   ```
   perform(action: 'pov.create', parameters: { title: 'First runs', countryName: 'Australia',
     description: 'My first pAIchart runs.', phases: [ { name: 'First run', type: 'EXECUTION' } ] })
   ```
   → `✅ POV Created` with the POV id. Keep it. The project now appears in the web app under **Projects** (refresh the page).
2. **A stage for the run.**
   ```
   perform(action: 'stage.create', parameters: { povId: '<pov id>', phaseName: 'First run', name: 'Loopback run' })
   ```
   → `Stage ID: <stage id>`. Keep it.
3. **The program task** — `type: 'PIPELINE'`, the protocol token in the title, and the two input files in the description and
   nothing else there (the planner fetches only what the description names):
   ```
   perform(action: 'task.create', parameters: { povId: '<pov id>', stageId: '<stage id>', type: 'PIPELINE', priority: 'MEDIUM',
     title: 'Add a telemetry-exporter loopback to ceos2 on a free address (protocol: pov-program)',
     description: 'Design artifacts for the Program Architect (fetch ONLY these two URLs):\n- topology-as-code: https://raw.githubusercontent.com/paichart/paichart-configs/main/usecases/loopback-ceos2/git-only/topology.json\n- requirements: https://raw.githubusercontent.com/paichart/paichart-configs/main/usecases/loopback-ceos2/git-only/requirements.md' })
   ```
   → `Task ID: <task id>`, `Status: OPEN`.
4. **Give it the harness and start it.** `template(action: 'list')` shows the id of the **Pipeline Harness** template.
   ```
   perform(action: 'agent.assign',  parameters: { taskId: '<task id>', agentTemplateId: '<Pipeline Harness template id>' })
   perform(action: 'agent.execute', parameters: { taskId: '<task id>', waitForCompletion: false })
   ```
   → `Execution Status: RUNNING`. Within a minute the program creates its own stage and starts the **Program Architect**,
   which reads the two files and writes the plan. **The plan takes about five minutes**; nothing needs you until then. To see
   where it is, ask for `project(action: 'task.context', taskId: '<task id>')` every minute or so.
5. **Read the plan, then release the plan gate.** When the plan is ready the program comments
   `⏸ PROGRAM PLAN AWAITING APPROVAL` on your task, with the gate's id. **To read the plan itself**, in the web app open **Projects** → your project → the task whose title starts *Produce program
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
   settles; send it again (usually the first try works; on a slow machine it has taken up to five tries over about 50 seconds).

   **Finding the other two gates.** All three gates are tasks of type `APPROVAL` in the program's own stage (their titles
   usually start `APPROVE`): `project(action: 'task.list', povId: '<pov id>')` lists them with their ids and status. A gate can be released only when
   the step before it has finished.
   **Releasing the plan gate starts the first agent pipeline** — we call it a **leg**. Here it is the leg that works out the
   address; it takes a few minutes, and the next gate cannot be released until it has finished.

   **From here you can hand the rest to Claude.** Say: *"Check if the leg is completed and, if it looks good, release the next
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

`project(action: 'task.context', taskId: '<task id>')` shows where the run is at any time.

**You are done when** the program task carries `programReleasable: true` and its final comment lists every leg and the
integration review as approved. The released run chose `10.99.0.3/32`; yours should choose an address the two files do not
use, and say which rule it applied. The package says its values were checked against the committed files only — that is the
stated limit of a Git-only run, not a defect.

If a leg is refused, read why before assuming the install is broken: a refusal names its reason, and refusing a wrong change
is the pipeline working. [`walkthroughs/READING-A-RUN.md`](../.claude/knowledge/pipelines/walkthroughs/READING-A-RUN.md) shows
how to read one.

## 3. Things every run shares

**What your run cost.** `npm run report:run-cost -- <pov id>` (run in `~/paichart`) prints the Anthropic cost of every agent run
in the project, by model and by task. The run this guide was checked on, on a fresh install on 2026-11-13: USD 5.39, 17 agent
runs, 21.5 minutes including the gates.

**If a run stops for no visible reason** — a leg sits *In Progress* for more than ten minutes with nothing new, or Claude Code
says the hub "needs you to sign in again" — the hub may have lost its database connection while still reporting healthy. Check:
`sudo journalctl -u paichart-mcp --since -5min | grep -c 'Engine is not yet connected'`. A number above 0 means that is what
happened: `sudo systemctl restart paichart-mcp`, reconnect Claude Code (`/mcp`), and launch the run again in a new stage (the
stopped run cannot be resumed; you can delete its tasks in the web app or leave them). Please report it — it is a known defect
being worked on.

**Re-running a program** (an escalated leg, a corrected artifact): a finished program cannot be re-run in place.
Create a fresh PIPELINE task in the same stage and stamp the prior program stage on it — the harness's pre-flight
halts on a duplicate `Program: …` stage and accepts only a machine-checkable clearance, never prose in the description:
```
perform(action: 'task.update', parameters: { taskId: '<new task id>', metadata: { duplicateAcknowledged: '<prior Program: … stage id>' } })
```
then `agent.assign` + `agent.execute` as in step 4 above. Stamp the MOST RECENT prior `Program: …` stage id (the harness's
first comment on that run names it; `project(action: 'pov.details')` lists the stages).

**Releasing a gate**: after `perform(action: 'task.complete', …)` on a gate, read the gate's own status back — a release
issued within seconds of the upstream leg completing can be rejected while the dependency state settles (it took up to
five attempts over ~50 s on a laptop). The action's reply text is not the state; `Status: COMPLETED` on the gate is.

A failure at step 4 (the launch) with `llm_initialized` means the running user has no resolvable LLM key ([INSTALL.md](INSTALL.md) step 8:
Profile Settings → LLM). A leg that escalates on its harvest usually means a rig service answered `initialize`
but could not READ — check the rig README's readiness probes, not the container list.

## 4. A bigger example, with its own lab


`usecases/firewall-a3-partner-path/` is a complete program (three sequenced pipelines) with its rigs. With
[INSTALL.md](INSTALL.md) step 9b done and the rigs up (that directory's README — the network lab is a recipe: you supply the
switch image yourself, from a free vendor account), this is the whole launch — five hub calls, typed to Claude
in `~/paichart` or issued directly. Each line's response is what a working install returns.

> **Status (2026-11-02): the corrected spec has not yet been re-run live as a full program.** A fresh-install run on
> 2026-11-01 found three things, all fixed since: the edge leg read only the switch it changes and chose a NAT pool that
> collided with the other switch (the program's integration review caught it, and the program correctly refused to release);
> the Device sources block did not reach either network leg; and a kept copy of one switch was refused by an over-cautious
> redaction check. The spec now declares both switches for both network legs, and the redaction check is fixed. Until the
> next full live run, treat a refusal on this program as information to read, not as a broken install.

> **Kept files are on by default (2026-11-01).** `.env.example` sets `HELD_BYTES_CAPTURE_ENABLED=true` with R9 and R10 on: the
> network legs keep each switch's running configuration and edit it by reference. That is why the spec's network legs now carry a
> `## Device sources` block (`ceos1` / `ceos2: device-read — service <descriptor>`): network-provisioning ≥ 1.23.0 refuses a network
> change leg whose devices have no declared source. Read **[`SELF-HOST-KEPT-FILES.md`](SELF-HOST-KEPT-FILES.md)** — what is stored,
> where, and who can read it — before you run this.

1. **A POV to hold your use cases, with the phases named up front** (phases are created WITH the POV — there is no
   `phase.create`; a POV created without `phases` gets the default Planning/Execution/Review three):
   ```
   perform(action: 'pov.create', parameters: { title: 'pAIchart Use Cases', countryName: 'Australia',
     description: 'Runnable use cases for a self-hosted pAIchart …',
     phases: [ { name: 'Firewall Rules Change', type: 'EXECUTION' },
               { name: 'Network and Terraform', type: 'EXECUTION' },
               { name: 'OSPF ISIS Migration',   type: 'EXECUTION' } ] })
   ```
   → `✅ POV Created` with the POV id, `Sales Theatre: APJ` (from the country), `Phases Created: 3` in that order,
   dates spread across the POV's 90 days. Keep the POV id.
2. **A stage for the run**, in the first phase:
   ```
   perform(action: 'stage.create', parameters: { povId: '<pov id>', phaseName: 'Firewall Rules Change', name: 'FW-A3 Program Run' })
   ```
   → `Stage ID: <stage id>`. Keep it.
3. **The program task** — `type: 'PIPELINE'`, the protocol token in the title, the two artifact URLs in the description
   and nothing else there (the Architect fetches ONLY what the description names):
   ```
   perform(action: 'task.create', parameters: { povId: '<pov id>', stageId: '<stage id>', type: 'PIPELINE', priority: 'MEDIUM',
     title: 'Partner-HTTPS security policy path with edge SNAT (protocol: pov-program)',
     description: 'Program intent: end-to-end partner-HTTPS policy across ceos1 (edge, SNAT) -> LocalStack dmz-sg -> ceos2 (core), three sequenced pipelines with transitive chaining.\n\nDesign artifacts for the Program Architect (fetch ONLY these two URLs):\n- topology-as-code: https://raw.githubusercontent.com/paichart/paichart/main/usecases/firewall-a3-partner-path/topology.json\n- requirements: https://raw.githubusercontent.com/paichart/paichart/main/usecases/firewall-a3-partner-path/requirements.md' })
   ```
   → `Task ID: <task id>`, `Status: OPEN`.
4. **Give it the harness.** The Pipeline Harness template was seeded by `db:seed`; `template(action: 'list')` shows its id.
   ```
   perform(action: 'agent.assign',  parameters: { taskId: '<task id>', agentTemplateId: '<Pipeline Harness template id>' })
   perform(action: 'agent.execute', parameters: { taskId: '<task id>', waitForCompletion: false })
   ```
   → `Execution Status: RUNNING` with an execution id. The harness's first pass takes ~30 s: it creates a child stage
   `Program: … (Run <timestamp>)` and spawns the **Program Architect** as the sole child of step PLAN — that is a
   `task.comment` on your task, and the harness execution ends `SUCCESS` (it exits on purpose; the reactor re-triggers
   it when the Architect finishes).
5. **Read the plan, release the gate.** The Architect fetches the two URLs through your browser-automation service
   (paging the 14 KB requirements with `read_more`), self-provisions nothing yet, and writes the program plan —
   `## Interface Contract` first (real subnets, VLAN/ASN, tags — as ONE JSON block), the pipeline DAG, and
   **Assumptions & open questions**. When it lands, the harness comments `⏸ PROGRAM PLAN AWAITING APPROVAL` with the
   roster and the gate id. Read the assumptions — that list is your disambiguation checklist — then:
   ```
   perform(action: 'task.complete', parameters: { taskId: '<G0 gate id from the comment>' })
   ```
   Nothing runs before that. After it: the three legs in sequence (each self-provisions its rig service from the
   descriptor, harvests read-only, designs, is reviewed, tears the registration down), one human gate per domain, the
   producer's deliverable and Node C's verdict, and a final comment with the gate table and `programReleasable`.
   `project(action: 'task.context', taskId: '<task id>')` at any time shows where it is.

**What a finished run looks like** (Run 7 of this use case on one laptop hosting hub + both rigs, 2026-09-10 — `programReleasable: true` in ~42 minutes):
Architect ~2 min → three legs of ~8–12 min each (harvest → design → author → review; each self-provisions its rig service
at `127.0.0.1` and the reviewer approves or escalates) → Producer + Node C ~4 min → program synthesis. The stamp on the
program task is the machine fact — `programReleasable`, `qualityGate.outcome`, and each leg's `containmentDisposition` —
and the release is still your decision: a run can show every leg approved and Node C approved, and still stamp
`programReleasable: false` on a mechanical containment conjunct. Read the facts, not the adjectives.

## Next

- [Operator runbook](../.claude/knowledge/pipelines/OPERATOR-RUNBOOK.md) — running programs day to day.
- [Program spec checklist](../.claude/knowledge/pipelines/PROGRAM-SPEC-CHECKLIST.md) — writing the two input files for a
  change of your own. Put them in any repository whose raw URLs your hub's browser service can fetch; if a leg reads
  configuration files from Git, that repository must be the one `GIT_FILE_SOURCE_PIN` names.
- [Other use cases](https://github.com/paichart/paichart-configs/tree/main/usecases) in the configs repository.
