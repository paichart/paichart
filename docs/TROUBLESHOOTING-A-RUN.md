# Troubleshooting a run

A run has stopped, or you cannot tell whether it has. This page finds out which, and what to do. Work down it in order: the
first three checks answer most cases. Every term is in [GLOSSARY.md](GLOSSARY.md).

Two things a run never does: it never applies a change to your systems, and it never passes a gate by itself. So the worst
case is a run that stops, never one that did something you did not approve.

## First: where is the run?

**1. List its tasks.** Ask your AI client, or run:
```
project(action: 'task.list', povId: '<pov id>')
```
Each task shows its type and status. Read it like this:

| You see | It means |
|---|---|
| a task of type `APPROVAL` *In Progress*, and the plan or leg it approves is *Completed* | **The run is waiting for you.** That is a gate. Go to "Waiting at a gate". |
| a `PIPELINE` or agent task *In Progress*, changed in the last few minutes | **It is working.** A plan takes about 5 minutes, a leg 5 to 10. Wait. |
| every task *Completed* | **It finished.** Read the program task's last comment and `programReleasable`. |
| a task with execution status `FAILED` (its status still reads *In Progress*) | **Something broke.** Go to "A task failed". |
| a task *In Progress* with nothing new for 15 minutes, no gate waiting and no task failed | **It is stuck.** Go to "Nothing is moving". |

Three things in that list that mislead:

- **Every gate reads *In Progress* from the moment the plan creates it**, long before the run reaches it. A gate is waiting for
  you only when the plan or leg it approves is *Completed*. Go by the titles, not by the order of the list.
- **A failed task still reads *In Progress*.** Look at the execution status column, and check for `FAILED` before you decide a
  run is stuck.
- **The program task reads *In Progress* with execution status `SUCCESS` for the whole run.** That is its last step finishing
  (writing the plan, for example), not the run's result. The result is `programReleasable`, written at the end.

**2. Read the run's own words.** The program writes a comment at each stop:
```
project(action: 'task.context', taskId: '<program task id>')
```

**3. Check the hub can reach its database** (on the machine that runs pAIchart):
```bash
curl -s localhost:8080/health          # look for "database":{"state":"ok"}
```
Anything other than `ok` is covered under "Nothing is moving". So is a reply with no `database` part at all: that is an older
version, and its `"status":"ok"` says nothing about the database.

## Waiting at a gate

The most common "stop", and not a fault. A gate is a point where the run waits for a person.

- See what to check: `npm run report:gate -- <gate task id>` (in the pAIchart directory) prints the checks for that gate, each
  marked ✓ or ✗, from stored facts. If it says the leg still has an execution running, wait a minute and run it again.
- Read what was produced: in the web app, **Projects** → the project → the task → **Agents → Artifacts**.
- Release it: tell your AI client *"If it looks good, release the gate"*, or set the gate task to **Completed** in the web app.
- If you released it and the next step did not start: read the gate's status back
  (`project(action: 'task.context', taskId: '<gate id>')`). If it is not *Completed*, release it again.

Do **not** release a plan gate when the plan is wrong (a leg missing, a leg of the wrong kind, a system you did not expect).
Fix the spec and launch a new run; a plan cannot be edited after the fact.

## A leg came back refused, or the program is not releasable

`needs-revision` on a leg, or `programReleasable: false`, is the run **working**: a reviewer or a mechanical check refused
something. It is not a broken install.

1. Read why. The program task's final comment names the leg and the reason; the leg's reviewer lists what it refused:
   `perform(action: 'agent.results', parameters: { taskId: '<the leg's Review task id>' })`.
2. Decide whether the refusal is right. [READING-A-RUN.md](READING-A-RUN.md) explains which statements are measured facts and
   which are an agent's judgement.
3. If the spec was unclear or wrong, fix the spec ([WRITING-A-SPEC.md](WRITING-A-SPEC.md)) and launch a **new** run. A program
   that has had a leg refused cannot be turned releasable in place, by design: re-running one leg does not change the result.

## A task failed

Read the failure:
```
perform(action: 'agent.results', parameters: { taskId: '<the failed task id>' })
```

| The failure says | Cause | What to do |
|---|---|---|
| no usable LLM key; an authentication error from Anthropic | your Anthropic API key is missing or wrong | web app → **Profile Settings → AI Provider Settings**: *Use System Provider* off, paste the key, **Save Changes** (top right). Then run the task again. |
| `LLM_PROVIDER_CREDIT_EXHAUSTED`; "credit balance is too low" | your Anthropic account is out of credit | top up, then run the task again |
| `Agent template not found: "…"` | a template the run needs was never installed | in the pAIchart directory: `npm run db:seed` (it adds what is missing and changes nothing else), then launch a new run |
| the harvest step could not read a file or a device | a service the run reads through is down or refusing | check the service: `curl -s localhost:3100/health` (browser service), `curl -s -o /dev/null -w '%{http_code}\n' localhost:3110/healthz` (Git file source: 503 means its token is missing or expired). Then run the task again. |
| "repo is outside the file source pin" | the spec names a Git repository other than the one your install is pinned to | either change the spec's file lines to the pinned repository, or change `GIT_FILE_SOURCE_PIN` in `.env` and restart the hub |
| a provider error with no clear cause ("terminated", "overloaded", a timeout) | the model call failed on Anthropic's side | run the task again |

**To run a failed task again:**
```
perform(action: 'agent.execute', parameters: { taskId: '<the failed task id>', waitForCompletion: false })
```
The run carries on from there. A failed task is not retried automatically, so a run with a failed task waits until you do this.
It spends credit: the rest of that leg, and every leg after it.

If the hub's log shows one of these messages but no task reads `FAILED` (the hub may have stopped before it could record the
failure), treat it the same way, and check "Nothing is moving" as well.

## Nothing is moving

No gate is waiting, nothing has failed, and nothing has changed for 15 minutes.

1. **The hub's database** — `curl -s localhost:8080/health`:
   - `"state":"ok"` — the hub is fine; go to step 2.
   - `"state":"unreachable"` — PostgreSQL is down or restarting. Check it (`sudo systemctl is-active postgresql`). The hub
     reconnects by itself when the database returns.
   - `"state":"engine-dead"` — the hub's own database client is broken. The hub exits within about 30 seconds and its
     supervisor starts a fresh one (`sudo journalctl -u paichart-mcp --since -5min | grep 'engine in this process is gone'`).
     If it has not restarted: `sudo systemctl restart paichart-mcp`.
   - **no `database` part in the reply** — an older version, which cannot report this and does not restart itself. Look in the
     log instead: `sudo journalctl -u paichart-mcp --since -1hour | grep -c 'Engine is not yet connected'`. Any count above 0
     means the hub's database client is broken: `sudo systemctl restart paichart-mcp`, then update the install.
   While the hub cannot reach its database it answers "cannot reach its database … do not sign in again". That message is
   accurate: signing in again does not help. An older version says the opposite, "needs you to sign in again", and signing in
   again fails: see "Your AI client has lost the hub".
2. **Both processes are up** — `systemctl is-active paichart-mcp paichart-web` should print `active` twice. The web process
   runs the background check that starts queued agent work; if it is down, queued tasks wait.
3. **What the platform thinks of the run** — `npm run report:run-liveness -- --list` (in the pAIchart directory) lists every
   unfinished run and why it has not finished: waiting on a gate, waiting on another task, still working, or stopped with a
   recorded reason. Two of its labels need your attention. `SETTLED (harness not re-entered)`: the run's tasks have all
   stopped and the program has not picked up again; a few minutes of this is normal, longer usually means a task failed.
   `UNEXPLAINED`: no recorded reason, typically a task left *In Progress* with nothing running behind it after a hub restart.
4. **After a hub restart**, a run that was in flight cannot be resumed. Reconnect your AI client, then either delete the
   stopped run's tasks and stages in the web app and launch again, or keep them and launch a new run as described next.
   This differs from a failed task. A task the restart left *In Progress* has no recorded failure, and running it again is
   not a tested way back; launching again is the way known to work.

## Launching again in the same project

A new run of the same objective in a project that already holds one stops at its first step with a duplicate notice, unless you
tell it the earlier run is known. Two ways:

- **Simplest:** launch in a new project, or delete the earlier run's tasks and stages first.
- **Keep the earlier run:** create a new task whose title carries a run number, for example
  `… (Run 2) (protocol: pov-program)`. The number does two things: a task with the same title in the same stage is not created
  again (the call returns the existing one), and each leg reads the earlier run's stages as history, not as itself. Then stamp
  the earlier runs' stages on the new task before you start it, as a list:
  ```
  perform(action: 'task.update', parameters: { taskId: '<new task id>', metadata: { duplicateAcknowledged: ['<stage id>', '<stage id>', …] } })
  ```
  The list names, for **every** earlier run of this objective in the project, its `Program: …` stage and each of its legs'
  `Pipeline: …` stages (for a single pipeline: its `Pipeline: …` stage). `project(action: 'pov.details', povId: '<pov id>')`
  lists the stages. A list that leaves one out stops the new run again. The program passes the list on to its legs.

This is the one rule for running again; the other guides point here. **What can and cannot be run again in place:** a task whose
execution **failed** ("A task failed" above) can be run again, and the run carries on. A program or leg that **finished**, was
**refused**, was stopped as a **duplicate**, or was left behind by a hub restart cannot: launch a new run.

## Your AI client has lost the hub

"No pAIchart tools", or "needs you to sign in again":

- After a hub restart the client's session is gone: in Claude Code type `/mcp` and reconnect, or exit and run `claude -c`.
- If reconnecting fails and the same key still signs in to the web app, the key is fine and the hub is the problem: go to
  "Nothing is moving", step 1.
- `claude mcp list` should show `paichart … ✔ Connected`. If it shows nothing, the connection was saved for a different
  directory: add it again and say "save it for all my projects" ([INSTALL.md](INSTALL.md) step 8).
- If your Claude account also has the hosted paichart.app connector, its tools start `mcp__claude_ai_…`. Those are the hosted
  site, not your install.

## What did it cost?

`npm run report:run-cost -- <pov id>` (in the pAIchart directory) prints the Anthropic cost of every agent run in the project,
by model and by task. A run that stopped early has still spent what it ran.

## Still stuck

Collect these before asking for help: the output of `project(action: 'task.list', …)` for the project, the program task's last
comment, `curl -s localhost:8080/health`, and the last 200 lines of `sudo journalctl -u paichart-mcp`. Remove any keys or
tokens first.
