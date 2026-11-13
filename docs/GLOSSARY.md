# Glossary

The words pAIchart's documents use, in plain terms. Each entry says what the thing is and where you meet it.

## Projects and work

| Term | Meaning |
|---|---|
| **POV** | Proof of value — pAIchart's name for a **project**. Everything a run creates lives in a POV. The web app calls them Projects. |
| **Phase**, **stage** | How a project is divided. A project has phases; a phase has stages; a stage holds tasks. A run creates its own stage. |
| **Task** | One unit of work with a title, a description and a status. An agent, a gate and a whole pipeline are each a task — which is why you can open any of them in the web app and read what it was asked and what it produced. |
| **Agent template** | The definition of one kind of agent (its role, its instructions, the model it runs on). `npm run db:seed` installs them. |

## Pipelines and programs

| Term | Meaning |
|---|---|
| **Pipeline** | One chain of agents that produces one reviewed result: **harvest** (read the current state) → **design** → **author** (write the change) → **review**. |
| **Program** | Several pipelines coordinated as one change, with values passed between them and gates between steps. |
| **Leg** | One pipeline inside a program. |
| **Value leg** | A leg that works out a value (an address, a number) and changes nothing. Its result is the value, checked. |
| **Change leg** | A leg that produces a change package for one system. |
| **Harness** | The coordinating agent of a pipeline or a program. It creates the other tasks, starts them in order, and writes the final result. You attach the *Pipeline Harness* template to the task you launch. |
| **Protocol token** | The `(protocol: …)` text in a task's title, for example `(protocol: pov-program)`. It tells the harness which set of rules to follow. |
| **Program Architect** | The first agent of a program. It reads your two input files and writes the **plan**: the legs, the gates, and the interface contract. |
| **Interface contract** | The part of the plan every leg receives: the facts and rules the legs must agree on. A leg cannot start without it. |
| **Producer** | The agent that assembles the program's final deliverable from the legs' results. |
| **Integration review** (also **Node C**) | The independent reviewer at the end of a program. It checks that the legs' results fit together and meet the acceptance checks in your spec. |

## Approvals and results

| Term | Meaning |
|---|---|
| **Gate** | A point where the program stops until a person approves. Your approvals are how a person regulates the agents in the graph: the work behind a gate does not start until you release it. A gate is a task; releasing it means marking it completed. |
| **Plan gate** | The first gate. Nothing runs before you have read the plan and released it. |
| **Value gate** | The gate after a leg that works out a value (an address, a range). You approve the value before any leg uses it. |
| **Change gate** | The gate for one change package. The detailed guides also call it a package gate or a change-method gate. |
| **Apply gate** | A gate whose description says *apply, then confirm*: a person applies one phase of a change and releases the gate so the next leg reads the changed state. Most programs have none. |
| **Change package** | What a change leg gives you: the edits, a rollback, and the checks to run before and after. **Nothing is applied for you** — applying it is your step. |
| **Approved**, **needs-revision**, **escalated** | The outcome of a leg. *Approved*: its reviewer found nothing blocking. *Needs-revision*: the reviewer refused it and said why — a refusal of a wrong change is the pipeline working. *Escalated*: it stopped and asks a person to decide. |
| **`programReleasable`** | The stored fact that says a program's result may be released: every leg approved, the integration review approved, and every mechanical check clean. `true` or `false`; it is computed, not an opinion. |
| **Reviewer score**, **confidence** | Numbers a reviewer or an agent reports. They are recorded for you to read; they do not decide whether a program is releasable. |
| **Containment** | A mechanical check that a value a leg uses really is the value another leg worked out (or really lies inside the range it was drawn from). `checked-clean` means it holds. |
| **Fact** and **verdict** | A *fact* is something the platform measured and can be checked (a hash, a count, a diff). A *verdict* is an agent's judgement. pAIchart's release decision rests on facts. |

## Reading your systems

| Term | Meaning |
|---|---|
| **Read-only service** | A service you register with the hub through which agents read your systems (a switch, a cluster, cloud state). It offers no way to change anything. |
| **Descriptor** | A small JSON file that describes a service to the hub: its address and what it can read. |
| **Device sources** | The block in a spec that says, for each device, where its configuration is read from. Four kinds: **`git-file`** — a file in your Git repository; the leg edits a kept copy of it. **`device-read`** — the running configuration, read whole from the device; the leg edits a kept copy of it. Declared together with `git-file` for one device, the Git file is edited and the device read is evidence. **`live-read`** — the running configuration read as evidence only, never kept or edited; for a device the leg needs to see and does not change. **`command-package`** — no read; the package is written as commands ("no read" in the spec checklist). |
| **Kept file** (also **held file**) | A configuration file whose exact bytes pAIchart stored when it was read, so the Author changes it only by edits to that stored copy. **Base** is the copy as read; **candidate** is the copy after the edits. |
| **Git file source** | The service that reads files from a Git repository for kept files. |
| **Pin** | The one repository the Git file source may read (`GIT_FILE_SOURCE_PIN`). A request for any other repository is refused. |
| **Redaction** | Replacing a secret with a placeholder before an agent sees it or before it is stored. A kept copy with a redacted secret is exact for comparison and is not a file to load onto a device. |
| **Rig**, **lab** | A test environment — switches, a cluster, a cloud emulator — that a use case runs against. |

## Running pAIchart

| Term | Meaning |
|---|---|
| **Hub** | The pAIchart server your AI client connects to (`…/mcp`). It holds the tools, the service registry and the runs. |
| **MCP** | Model Context Protocol — the standard an AI client such as Claude uses to call tools on a server. |
| **MCP API key** | The key you generate in Profile Settings that lets your AI client act as you on your hub. |
| **Spec** | Your `requirements.md`: the objective, its rules, who approves what, and the final checks. With `topology.json` (the systems in scope) it is the whole input of a program. |
| **Use case** | A ready-made spec and topology that has been run. The released ones are in [`paichart/paichart-configs`](https://github.com/paichart/paichart-configs). |
