# How a pipeline works

A short account of how one pipeline runs inside pAIchart, what cannot go wrong by construction, and what you can change
without touching code. It names no files or functions. Terms are in [GLOSSARY.md](GLOSSARY.md).

This page is about a **single pipeline** (one leg). A **program** is several pipelines coordinated as one change, with
approval gates between them and values passed from one to the next; it is built from the mechanics described here and is
covered in [PROGRAMS.md](PROGRAMS.md). To run one, start at [OPERATING.md](OPERATING.md).

Three chapters: how it runs, what can't break, how it extends.

---

# Chapter 1 — Lifecycle

## The shape

A pipeline, at rest, is really just a graph. One *harness* task sits at the top — a task of type PIPELINE. When it runs well, it sprouts a dedicated *child stage* containing N regular (non-PIPELINE) tasks, each with its own template, dependencies, and eventual artifacts. The harness watches that child stage, waits for everything inside it to reach a terminal state, then returns to consolidate the results into a final deliverable.

That's the entire picture. Three characters: the harness, the child stage, the children. The cleverness is in how the three stay connected without a hard foreign key, and how the harness decides what to do each time it wakes up.

## Role is a classification, not a flag

When any task is opened in the UI, a lookup at the phase level classifies it into one of three roles: HARNESS, CHILD, or NONE. The classification isn't stored on the task — it's derived. A task is a HARNESS if its own type equals PIPELINE. It's a CHILD if some PIPELINE task in the same phase claims its stage as that harness's child stage. Otherwise it's NONE.

This is why the same task can legitimately be classified HARNESS even while it lives inside another harness's child stage — the nested-pipeline case. It's a harness to its own children and a child of its parent at the same time. The role lookup simply asks: "Are you a PIPELINE type?" first. If yes, HARNESS. Only if the answer is no does the lookup go looking for a parent.

Role, then, is the UI's entry point into the story. Once a task's role is known, everything else follows: which other tasks to draw as siblings, whether to show a parent-harness breadcrumb, whether to show the synthesis status badge.

## Three modes, one protocol, platform resolves it

The harness has one *protocol prompt* — a plain chunk of markdown that describes all three modes together. The protocol is injected verbatim into the harness agent's system prompt. It is not rendered per-mode. There is no dispatcher somewhere saying "run in SYNTHESIZE mode this time." The modes are a description of behavior, not a configuration.

A single piece of information — the pipelineStageId — plus the state of the stage it points to, determines which branch of the protocol applies:

- If metadata has no pipelineStageId at all, or it points to an empty stage, the harness is in **CREATE** mode. It plans the pipeline, creates a fresh child stage, writes that stage's id back into its own metadata, creates the child tasks with their templates and dependencies, then exits.

- If the child stage has tasks but some are missing template assignments or wiring, the harness is in **ORCHESTRATE** mode. Rare — it happens when a prior CREATE was interrupted mid-flight, or a human added a task by hand. The agent finishes the setup and exits.

- If every task in the child stage is terminal, the harness is in **SYNTHESIZE** mode. It walks the children's outputs, quality-gates them, aggregates everything into a final artifact, and completes itself.

- If the child stage has tasks but some are still running, the in-flight branch of ORCHESTRATE applies — the agent posts a short "pipeline in flight" comment and exits. It has nothing to do.

**The platform resolves the mode before the agent runs.** It reads the same stored state directly and puts the result into the agent's prompt as a `## Harness Context (Platform-Resolved)` block above the protocol. The agent reads the resolved mode; it does not detect one. This matters under degraded conditions (a failed tool call, an exhausted token budget), where an agent left to work the mode out for itself can guess wrong.

A separate post-execution validator categorises the actual run by inspecting the tool calls the agent made. This is the secondary signal: the resolver says what mode the platform expected; the validator says what mode the agent's tool calls actually exhibit. Disagreement between the two is a forensic signal — not a bug, just a flag that warrants attention.

## The lifecycle

**First run is always CREATE.** A standalone pipeline is started explicitly by a person (or another agent). A pipeline that is a leg of a program is started by the platform when the tasks it depends on (an earlier leg, an approval gate) complete. The dep-free reactor that auto-queues normal tasks when their dependencies clear does *not* queue PIPELINE tasks — that's a deliberate semantic guard. The harness enters, sees empty metadata, decides CREATE, sets up the child stage and children, and exits.

**Each child runs independently** in dependency order, just like any other task. As each one completes (or fails), a separate reactor wakes up — the pipeline-retrigger reactor. It asks one question: does the completed task's stage belong to some IN_PROGRESS PIPELINE harness, and are all the tasks in that stage now terminal? If so, queue a new execution of the harness.

"Terminal" here is a union: a task is terminal if its status is COMPLETED, OR if its executionStatus is FAILED. A FAILED child doesn't hang the pipeline — the harness will still re-enter and decide what to do about the failure during SYNTHESIZE.

A short debounce (roughly 30 seconds) sits in front of this retrigger to absorb the common case where several children finish in rapid succession. Without it, we'd queue N redundant harness executions and collapse them via the partial unique-index race guard; with it, we usually queue one cleanly.

**When the harness re-enters**, it is once again reading its own metadata and the state of the child stage — completely fresh. It doesn't trust narrative comments from its prior runs; it trusts only live state. This is why the protocol opens with "prior runs are not evidence." If CREATE set metadata last time, SYNTHESIZE can see it now. The handoff between runs is entirely through durable state — metadata, task statuses, execution records — not through any in-memory handoff.

**The final run is SYNTHESIZE.** It calls task.complete on the harness, producing the deliverable artifact. The harness transitions to COMPLETED. The pipeline is done.

## The joins

Nothing in the schema enforces "this is your parent." The relationship is a *bidirectional* piece of JSON: the harness records its child stage in its own metadata.pipelineStageId, and the platform records the back-pointer harnessTaskId in the child stage's metadata at the moment the harness writes its pipelineStageId. Two structured pointers, neither protected by a foreign key.

The forward pointer drives day-to-day routing — the reactor's "who owns this completing child?" query is a reverse lookup against it: find an IN_PROGRESS PIPELINE task in the same phase whose metadata claims the completed child's stage. The phase scope is a sanity check — a harness and its children should always live in one phase.

The back-pointer exists to defend against silent corruption. If something ever writes a different harness's stage id into the harness's metadata mid-run — a clobber, a stale id, a hand-edit — the harness's bookkeeping says one stage but the stage's bookkeeping says someone else owns it. The handler invariant on completion checks both directions before letting the harness mark itself done; the reactor checks both before queuing a SYNTHESIZE. A mismatch surfaces as a typed error with a stable code rather than a silent completion against the wrong children.

The UI performs the forward lookup ("give me my siblings") for HARNESS-role and the reverse lookup for CHILD-role classification. Both sides of the relationship still derive from the same metadata, just two fields instead of one — and the role lookup itself never needs the back-pointer because role is determined by *type* (the task is PIPELINE) and *stage membership*, not by integrity-check evidence.

## The synthesis signal

The lifecycle has one failure mode that's invisible unless you surface it: the harness ran CREATE successfully, the children all finished and produced their own artifacts, but SYNTHESIZE never ran. A run that only did CREATE produces a `pipeline-index.json` and no `report.md` at all: the harness's `report.md` exists only after SYNTHESIZE has run. So the absence of the deliverable is itself the failure indicator.

Every harness execution carries, inside its result artifact, two records of which mode it ran in: the platform-resolved mode (written before the LLM turn started) and the validator-derived mode (written from the post-execution tool log). They normally agree. The HARNESS role lookup pulls the harness's latest successful execution, reads either mode value, and converts it to a badge: SYNTHESIZE means the pipeline closed cleanly; CREATE or ORCHESTRATE mean the pipeline only did its structural setup and SYNTHESIZE is still pending.

Two records exist because they cover different failure modes. The validator's mode is missing on perfectly-clean runs (the validator only writes when there are issues to flag) and on degraded runs where the agent couldn't make tool calls. The platform-resolved mode is always present whenever a PIPELINE task runs — even if the agent did nothing useful on its turn, the platform already wrote what mode it should have been in. That's the signal that survives degradation.

The whole synthesis-status work, then, is one simple idea: the data that tells you whether the pipeline actually finished already exists on disk for every execution. We just needed to surface it — and to make sure it was always present.

## Why this design holds up

The design rests on three properties that are worth naming because they're the things a reviewer should check whenever the harness gets changed:

First, **state is durable, handoffs are not**. Every harness re-entry starts from scratch; everything the harness needs to know about prior runs must be legible from live metadata, task state, and execution records. Comments and narrative are not evidence. This is what lets the pipeline survive partial failures, reactor restarts, and multi-execution retries.

Second, **mode is derived from state, not assigned**. No flag says "run SYNTHESIZE now." The platform reads the world and resolves; the agent reads what was resolved. That means adding a fourth mode would be a resolver-and-protocol change (a small server-side function plus the prose that describes what the agent should do in that mode), not a scheduler change. And because the resolver and the post-execution validator answer the same question from the same source of truth, a misbehaving agent that ignores the resolved mode can be diagnosed by comparing the two records — they live side by side in the same artifact.

Third, **the join is a piece of JSON in two directions, with no referential integrity**. That's both the design's elegance and its main liability. Child tasks can be moved between stages; metadata can be hand-edited; a stale pipelineStageId can point to a stage that no longer exists; the harness's metadata can be clobbered mid-run to point at someone else's stage. The reactor's guards (phase scoping, IN_PROGRESS filter, child-count sanity check) plus the bidirectional pointer match (handler 4-point invariant; reactor mirror) are what keep this from breaking in practice. The two pointers are belt-and-suspenders because either alone could be hand-edited, but flipping both consistently across an in-flight harness is hard to do by accident.

Given those three properties, the entire lifecycle is: the user starts the harness, the agent builds the structure, the children run, the reactor wakes the harness back up when the work is done, the agent synthesises and closes. The loop usually runs two or three times per pipeline. No persistent scheduler, no mode machine, no parent-pointer FK.

---

# Chapter 2 — Guarantees

The harness is simple because it refuses to track anything it doesn't have to. That simplicity only holds if the things it *does* track can't be corrupted. Every corner case that could put the system in an ambiguous state must be prevented structurally rather than trusted to cooperation.

The most important guarantee is that **no task can ever have more than one active execution at a time.** Active here means any execution in a pre-terminal state — waiting, queued, or running. Two active executions on the same task would race to produce artifacts, race to update the task's status, race to overwrite the denormalized summary fields. Any one of those races could corrupt the state the harness trusts on re-entry.

The system defends that guarantee in three layers. The first is a semantic gate: the normal dependency-free reactor, which queues regular tasks as soon as their dependencies clear, refuses to queue PIPELINE tasks at all. PIPELINE tasks have their own lifecycle — user-initiated first run plus pipeline-specific retriggers afterwards — and the dep-free reactor is only meant for regular tasks. The second layer is a runtime idempotency check: before any reactor creates an execution, it looks for an existing PENDING, READY, or RUNNING execution on the same task and bails silently if one is found. Each bail is tagged with a source label so forensic tooling can tell whether the skip came from a dep-free retrigger, a dep-completion retrigger, or a pipeline retrigger. The third layer is a database constraint — a partial unique index that refuses to insert a second active row even if both earlier layers somehow let two concurrent creates through. That third layer caught the race that actually slipped past the other two: two concurrent reactor fires both reading "no active execution" at the same millisecond and both trying to insert.

The three layers have a deliberate property. Each could close the gap on its own. Together they give different error surfaces — an invisible log line at the first, a counter bump at the second, a structured typed error with a stable code at the third. When a lower layer catches something a higher layer should have handled, that's a forensic signal worth investigating — one of the cheaper gates has drifted out of alignment.

A related guarantee is that **a constraint fire should always correspond to a findable existing row.** If the database refuses an insert claiming another active execution exists but a follow-up query can't find one, that's a phantom — usually because the matcher that identifies our specific constraint has gone stale against a library upgrade. Phantoms log a separate forensic code and surface in the daily email with a red advisory.

Three smaller guarantees round out the set. **The harness can never retrigger itself** — the pipeline-retrigger reactor exits when the task that just completed is the harness it would wake, preventing a harness-completing-itself loop. (A completing pipeline may wake a *different* harness: its parent program.) **Retrigger never crosses a phase** — the reactor's "who owns this completed child?" query is scoped to the same phase, so stale metadata pointing across POV or phase boundaries cannot claim ownership of a child. **A template-less execution cannot start** — both execution paths check for a null agent template before any LLM call and throw a typed error with a stable code if one is missing, rather than silently falling back to a deprecated universal template that hasn't been used in production for months.

A further guarantee: **mode information is always present in the artifact**. The platform resolves the harness's mode from DB state before the LLM turn starts and writes the resolved mode into the result artifact alongside the post-execution validator's mode. The validator was the original signal but it has two failure modes — it's silent on perfectly-clean runs (no issues to flag), and it's silent on budget-exhausted runs (no tool calls to inspect). The resolver's mode covers both gaps because the platform writes it regardless of what the agent does. A clean run that previously would have shipped a mode-less artifact now reliably carries the resolved mode; a degraded run that previously would have lied about its mode now carries the truth. This is the fifth application of the platform's "load-bearing facts must be platform-recorded, not agent-supplied" rule — alongside task lifecycle ownership, the pipeline-retrigger phase scope, the active-execution unique constraint, and the clobber-detection back-pointer.

Two further applications concern the deliverable itself. **Deliverable extraction**: when a Pipeline Harness sets `metadata.deliverableSourceTaskId` in CREATE mode, the engine — not the agent — fetches the source child's `finalResponse` at SYNTHESIZE-commit time and writes it as the harness's `report.md`. This moved a load-bearing customer-facing fact (which artifact IS the deliverable) from agent-time decision to commit-time computation. **Pointer substitution**: a structural variation of the same principle — the harness can't reference its own `report.md` artifact ID at SYNTHESIZE compose time because that ID is generated by the very transaction the agent triggered. The harness writes a known placeholder (`{{HARNESS_REPORT_MD_ID}}`); the engine substitutes the actual ID after artifact creation, inside the same transaction. This is the *substitution variant* of the trust-direction-shift pattern (the seventh application overall, the first variant where the agent literally cannot write the value because it doesn't exist yet — a pattern likely to recur for any post-commit-known fact the agent needs to reference).

The last guarantee runs at the protocol layer with a server-side enforcement gate behind it. **A harness cannot claim completion without evidence.** Before calling task.complete on itself, the agent is instructed to verify with live tool calls that its deliverable artifact exists, that its child stage actually contains tasks, and that those tasks are terminal. The server's completion handler enforces a 4-point invariant on top of that — the three points just listed plus a fourth: the child stage's back-pointer must agree that this harness owns it. The fourth point is what catches the silent-corruption case where the harness's own metadata was clobbered mid-run to point at someone else's stage; without it, the previous three points would happily verify against the wrong children. A mismatch on point four surfaces as a typed error with a stable code, separately tagged in the security-event channel. Agents that fabricate completion get rejected server-side regardless of which point trips. The protocol rule is a cost-saving nudge — following it avoids a wasted round-trip — not a security boundary.

Together, these guarantees are what make the harness's opportunistic behavior safe. The agent re-reads state each run and picks a mode for itself; it would be dangerous to trust that picking if the state it reads could be corrupted. The guarantees keep the state clean.

---

# Chapter 3 — Customisation

The harness's plug-and-play character — what makes it a research substrate rather than a scheduler — comes from a small set of surfaces through which behavior can be changed without touching code.

The most expressive surface is the **protocol library**. A protocol is a markdown document held in the database. Each pipeline task names its protocol in its title, in the form `(protocol: network-provisioning)`. The platform resolves that name once, records it on the task, and gives the harness agent two texts: the orchestration base, which every pipeline shares, and that ONE protocol. Which protocol applies is never the agent's judgement, and a task that names a protocol that does not exist or is retired fails before any model call. Adding a new strategy is a seed script: write the markdown, seed it, and the next run that names it uses it. The strategy is expressed in the agent's native interface, prose instructions, so authoring it is prompt work, not software engineering. The protocol texts are in [`scripts/seed-protocol-prompts.ts`](../scripts/seed-protocol-prompts.ts), exactly as the agents receive them.

A second injection mode serves a different purpose. A specialist template can carry a specific protocol name in its own metadata, which injects exactly one protocol to coordinate cross-task behavior. This is for workflows where several specialist tasks need the same mental model (shared vocabulary, output contracts, decision rules), so each specialist reads the same document and interprets the others' outputs consistently. One rule sits on top: the children of a pipeline never inherit the harness's orchestration protocol. That protocol describes orchestrator-side behavior and would confuse a specialist doing concrete work.

A third surface is the **template itself**. Templates are data — database-backed, editable through the UI or seed scripts, live-reloaded on next execution. Modifying a template's role guidance, tool list, default model, temperature, or metadata flags changes how agents using that template behave the next time they run. A gold-standard pattern anchors the template's structure across eight fields to keep templates consistent, but the values in those fields are freely editable. Adding a new role or a new allowed tool is a template edit, not an engine change.

A fourth surface is how tasks in a pipeline **share state with each other**. When a task completes, its result is stored as an artifact. Downstream tasks — those that depended on it — have its final answer injected into their own prompt as a Pipeline Context section, marked as reference data, not instructions. The inject is the full text up to a size cap, not a summary; research cited in the design decision found full outputs outperform summaries by roughly half. The chain is implicit through dependency order, so the harness itself doesn't have to orchestrate it — defining a new specialist that consumes a specific upstream task is a template and dependency-wiring change, nothing deeper.

There is a clear line between what these surfaces can and cannot change. A new planning idea, a new specialist role, a new output contract between phases, a new consistency rule for a workflow — all expressible as prose changes in protocols, templates, or task descriptions. What isn't expressible there: the trigger that starts the first execution, the reactor that retriggers the harness, the debounce window, the three-layer race guards, the post-hoc validator that classifies modes. Those are code. The line is roughly: if the change is "instruct the agent to think or act differently," it's a prose change; if it's "change what the agent is permitted to do, or when the system acts," it's an engine change.

The asymmetry is the design's point. Authoring strategies is meant to be easy so many can be tried. Changing scheduling is meant to be hard so the core stays stable. The result is a system where research iteration happens in one place — the prompt library — and infrastructure stability lives in another.

A useful corollary follows. The harness is a place where external research can land without code changes — but only research of a particular shape. When you're reading a paper and wondering whether its idea could run here, the question to ask is: is the novelty *how the agent thinks* or *what the agent is allowed to do*?

Reasoning contributions — prompting strategies, self-critique loops, branching exploration, explicit planning steps before action, sampling multiple answers and picking the most-agreed — map cleanly onto protocols. They are expressible as prose instructions, and the existing engine runs them without modification. The Context Chaining decision to inject full predecessor outputs rather than summaries is an example already in production: the finding came from a paper, became a design decision, shipped as configuration.

Capability contributions do not fit the protocol path. Fine-tuning needs weights and a training pipeline. Retrieval with custom embeddings needs vector infrastructure. New tool use needs tools registered in the MCP layer. Changing when the reactor fires or how debouncing behaves is engine code.

The rule of thumb: reasoning-shaped novelty lands as a prompt-library seed; capability-shaped novelty lands as engineering work. The ease of the first path is what makes the harness a research substrate; the hardness of the second is what keeps the substrate stable.

---
