# The Pipeline Harness: A Production Orchestration Layer for Typed Multi-Agent Delivery

**Draft v2 (with war-story infusion comments)** · 2026-04-06

Steve Terry · pAIchart · `steve.terry@paichart.com`

**Live system:** `https://paichart.app/mcp` · **Project page:** `https://paichart.com/harness` · **Extended technical report:** `paichart.com/harness/extended`

<!--
V2 EDITING NOTES (not for publication — remove before submission)

This draft is v1 with inline <!-- WAR STORY --> comments marking where specific
anecdotes from .claude/knowledge/domain/harness/WAR-STORIES-HARVEST.md
("Template rationalization + Pipeline Harness v1" section) could be infused
to make the prose sound more human and less model-generated.

Each annotation contains:
  - STORY NAME from the harvest file
  - THE CONCRETE DETAIL to fold in (number, duration, error message, file path)
  - SUGGESTED DIRECTION for weaving it into the surrounding sentence

The comments are NOT the final prose. The goal is to reduce the cost of
"which story goes where" so the author focuses on voice and sentence editing.

Priority order (most valuable first):
  1. §3.1 / §5 Exp 3 — tool turn limit 22/30, auto-comment masked the failure
  2. §3.1 Context awareness — V2 token exhaustion with graceful degradation
  3. §3.1 Specialization — dependencyIds three-layer drift (4 deploy cycles)
  4. §4 Architectural Decisions — spread-first specialist review catch
  5. §3.1 / §5 — task.status vs executionStatus divergence (two state machines)
  6. §3.1 Self-evaluation / §3.6 Prompt ownership — confidence missing on 2 of 3
-->

---

## Abstract

We present the **Pipeline Harness**, a production system that takes a one-sentence objective — "assess cloud security posture and produce a remediation roadmap" — and autonomously delivers the outcome. A meta-agent decomposes the objective into typed specialist tasks, assigns templates, wires dependencies, executes each specialist in order, chains complete outputs between dependent tasks without summarization, and gates quality with confidence-scored completion loops. The harness operates in two auto-detected modes: it either decomposes an objective from scratch, or orchestrates tasks the user has pre-authored. A 6-task pipeline completes in 488 seconds with 100% task completion and no human intervention; a 3-task pipeline in 228 seconds. The system is available as a running multi-user MCP server at `paichart.app/mcp` for direct inspection by readers with any MCP-compatible client; authentication is via GitHub OAuth into a demo role. We document the architectural decisions that made orchestration robust under production load — prompt section ownership, pre-execution context chaining, dual-path execution (in-process TypeScript vs HTTP MCP server), fire-and-forget with parallel polling, and per-attack-vector compliance with Anthropic's MCP security specification — and we report a concurrency stress test that exercises the system under ~20 simulated concurrent users across five workload patterns with 96/96 MCP calls succeeding and zero degradation.

---

## 1. Introduction

Large language models have become remarkably capable on isolated tasks. They can write a security assessment, draft a migration plan, or summarize a compliance audit when given a narrow prompt. What they cannot do on their own is the thing that actually matters for production delivery: decide that a security assessment requires a specific sequence of specialist activities; execute each activity with domain-appropriate reasoning; pass full outputs between activities without summarization loss; evaluate whether each step meets quality thresholds; iterate when quality is insufficient; and do all this while staying grounded in a persistent business context — customer, compelling event, regulatory regime — that shapes what "correct" means.

We call the distance between individual model capability and these production requirements the **orchestration gap**, and we argue that closing it is harder than improving the base model.

The Pipeline Harness is a production implementation of the orchestration layer that closes this gap. It runs inside pAIchart, a Sales Engineering platform whose domain unit is the Proof of Value record — a single POV carries the customer, the objective, the solution scope, the team, the timeline, and any regional compliance frameworks that apply. Given a one-sentence objective, the harness reads the POV, decomposes the goal into 3-7 typed specialist tasks, assigns the right specialist template to each, wires dependencies explicitly, and executes the specialists in order. Between dependent tasks, a pre-execution hook injects the predecessor's complete output into the successor's prompt — no summarization, no telephone game. Every specialist reports a confidence score; below 70 the harness re-executes with diagnostic feedback, below 50 it escalates. The harness runs to completion or escalates honestly — it will not report success with unfinished children.

The system is available for direct inspection as a running production server at `paichart.app/mcp`. Adding `{"mcpServers": {"paichart": {"url": "https://paichart.app/mcp"}}}` to a Claude Desktop or ChatGPT configuration is enough to connect. New users are auto-registered via GitHub OAuth with a demo role that grants read access to demo POVs and read/write on a personal sandbox. We provide this as an alternative (or complement) to the more common code-release and benchmark-result approaches to reproducibility.

This paper reports what we learned building and operating the harness for Sales Engineering work. We focus on three things. First, six capabilities we believe are jointly necessary for goal-directed autonomous delivery — decomposition, typed specialization, knowledge transfer, self-evaluation, persistence, and context awareness — and why we have not found a prior system that combines them. Second, the architectural decisions that moved the harness from "works on a laptop" to "survives production multi-user load", including the decisions that only became load-bearing once the system had to handle more than one user at a time. Third, honest threats to the validity of our empirical claims: sample sizes are small, experiments were conducted by the author, scalability is designed for 100 users but stress-tested at ~20, and we have not run a head-to-head comparison against a no-harness baseline.

## 2. Related Work

Three classes of systems address fragments of the orchestration gap.

**Multi-agent orchestration frameworks.** CrewAI provides role-based task delegation with Python crew definitions. LangGraph models multi-agent work as state machines with checkpoint persistence. AutoGen structures multi-agent coordination as dialogue, with conversation as the primary coordination primitive. Microsoft's approach emphasizes composability; CrewAI emphasizes role typing; LangGraph emphasizes explicit control flow. OpenAI Swarm takes the opposite stance — intentionally minimal, no persistence, handoffs only. These frameworks provide primitives but require developers to instantiate them for each domain. None have persistent business context, none implement confidence-gated quality loops, and none produce non-code structured deliverables as a first-class concern.

**Autonomous coding agents.** Devin demonstrated persistent autonomous coding agents capable of iterating until tests pass. Factory.ai, Cursor, and Windsurf extend this pattern with developer tooling integration. These systems show strong persistence and specialization — but only for code. They have no multi-specialist decomposition, no cross-agent knowledge transfer, no confidence gating, and no non-code deliverables such as business cases, architecture reviews, or customer-facing reports.

**Meta-harness and self-optimizing systems.** Recent work on meta-harnesses (Lee et al., 2026) explores automated optimization of harness code through agentic proposers that search code-space for improved harness implementations. Our work is complementary rather than competing: they optimize *what a single harness should do*; we operate *multiple typed specialists under a persistent domain context*. Their filesystem-as-middleware insight — that richer, selectively-accessed prior context outperforms compressed summaries — informed our decision to inject complete predecessor outputs rather than summaries (§3.3). Liu et al. (2026) present Omni-SimpleMem with a PROCEED/ITERATE/PIVOT decision framework for autonomous research pipelines and report a 53% F1 improvement from returning full text rather than LLM summaries — another result that directly informed our context-chaining design. We cite these as parallel approaches, not prior work we improve upon.

**Sales Engineering and PoV automation.** Vivun tracks POV timelines and stakeholder maps. Consensus and Demostack automate demo experiences. None of these produce AI-generated deliverables; none have the concept of a specialist agent. The Sales Engineering vendors know their customers and have the right data model (the POV as the unit of work); the multi-agent frameworks know orchestration but not the domain. Nothing yet bridges the gap.

**Where we land.** No existing system combines the six capabilities we identify in §3.1. We take existing patterns — typed specialization from CrewAI, persistence from Devin and the claw-code ecosystem, pre-execution hooks from middleware traditions, POV context from Vivun — and assemble them into an orchestration layer that produces structured customer-facing outcomes autonomously.

## 3. System

### 3.1 Six Capabilities for Autonomous Delivery

Six capabilities have to be in place for autonomous delivery to work, and the argument is not that any one of them is novel — most have prior art somewhere — but that none of the systems we surveyed combine all six. They are: task decomposition, typed specialization, knowledge transfer, self-evaluation, persistence, and context awareness.

**Task decomposition** means a meta-agent reads the objective plus the persistent context and produces a dependency-wired graph of typed sub-tasks. The harness uses claude-sonnet-4-5 as its planner — the specialists run on Haiku, because cost matters when a single pipeline can produce ten LLM calls.

**Typed specialization** means eight functional types (ARCHITECT, BUILDER, ANALYST, REVIEWER, OPERATOR, DOCUMENTER, ORCHESTRATOR, GENERALIST) that are orthogonal to domain categories. Seventeen specialist templates map to these types. The orthogonality is the part that matters in practice: the harness selects specialists by functional role ("I need a REVIEWER for this task") rather than by template name, so adding a new template with `templateType: REVIEWER` makes it immediately available for orchestration without touching the harness prompt. We learned this the hard way when the template registry and harness prompt drifted out of sync for about a day and every new template required a prompt edit.

<!--
WAR STORY — infuse here or in §4 Architectural Decisions:
"dependencyIds — the parameter that got stripped three different ways"

CONCRETE DETAIL: Adding dependencyIds to task.create took four deploy cycles
and three "I found the bug!" moments before a dependency row actually
landed in task_dependencies. First drop: the standalone MCP server's
Tier 2 HTTP forwarding path had an explicit per-action allowlist
(task-action-handler.js lines 268-288) that didn't include dependencyIds.
Second drop: mcp-action-validation.ts at line 283 — Zod strips unknown
fields by default, and the task.create schema didn't declare dependencyIds.
Third drop: we tested on production before the validation fix had deployed.
Four deploys. Three triumphant "root cause found!" commits. Pattern #49
(MCP Parameter Three-Layer Update) exists because of this.

SUGGESTED DIRECTION: Add a one-line parenthetical or footnote after
"orthogonality matters in practice." Something like: "The pattern we
discovered — tool schema, validation schema, handler — became Pattern #49
after dependencyIds got silently dropped at three consecutive layers
across four deploy cycles." It sounds human because nobody plans to ship
the same fix four times.
-->


**Knowledge transfer** is implemented by a pre-execution hook that injects the complete output of each dependency into its successor's prompt as structured markdown. No summarization, no "telephone game" degradation. §3.3 describes the mechanism.

**Self-evaluation** means every agent output ends with a confidence score from 0 to 100. The harness parses the score via six regex patterns (one for each common way agents report it), uses it as a quality gate at the 70 and 50 thresholds, and re-executes with specific diagnostic feedback in the retry band. The scores are self-reported; we do not independently verify them. An honest agent is a prerequisite.

<!--
WAR STORY — infuse here or in §3.6 (if you add a prompt-ownership subsection):
"Confidence score missing from 2 of 3 Phase 0 agents — the template hierarchy trap"

CONCRETE DETAIL: In Experiment 1, the Solution Architect reported confidence
92/100 cleanly. The Security Analyst and Business Analyst reported null.
Initial hypothesis: regex parser too narrow. Three iterations of parser
patterns later, confidence was still null. The actual cause: the Universal
Template's output-rules section (which contained the confidence instruction)
is part of the system prompt. Custom templates replace the system prompt
entirely via the three-priority chain in buildSystemPrompt() — so agents
with custom templates never saw the instruction. Fix was moving the
instruction into buildAgentPrompt() §8 Output Requirements (engine-owned,
always built regardless of template). Six-line fix, one-hour diagnosis.

SUGGESTED DIRECTION: Add a sentence after "six regex patterns" that
acknowledges the parser wasn't the real problem the first time we shipped
this. Something like: "We initially thought the reliability problem was
parser coverage — and added patterns until we had six — but the actual
issue was that the instruction to report confidence lived in a template
section that custom templates replace. Moving it to an engine-owned
prompt section fixed reliability more than any parser change did."
This sentence is the kind of thing that only someone present for the
debugging would write.
-->



**Persistence** means the harness iterates until the pipeline is complete or it escalates explicitly. Bounded retries (max 2 per task) prevent runaway token consumption, and a self-completion guard prevents the harness from reporting success while children remain unfinished. The guard exists because one of our early tests produced a harness that cheerfully wrote a celebratory summary despite rate-limit failures leaving three of four children incomplete — the celebratory summary read almost exactly like the actual success summaries. We added the guard the next day.

<!--
WAR STORY — infuse here or as part of the §5 Experiment 3 narrative:
"The harness ran out of tool turns at 22 of 30 and we thought it was fine"

CONCRETE DETAIL: The earliest version of the guard-inducing failure.
First autonomous harness run on Demo Financial Corp. 178 seconds,
22 tool calls out of a 30-call MAX_TOOL_TURNS ceiling, confidence 88/100.
The auto-comment was already implemented at this point, so the run
produced a structured success comment with artifact fetch commands that
looked exactly like a normal completed pipeline. We checked the database
afterward and found PIPELINE-2 through PIPELINE-5 still OPEN with zero
execution records. The harness had reported success while 80% of the
pipeline sat unexecuted. The confidence score (88/100, self-reported)
had no relationship to the proportion of work completed. The commit
(d64a28a2) that made MAX_TOOL_TURNS configurable via template metadata
raised it to 100 for the harness, which bought more runway but did not
solve the self-completion problem — that required the Line 19 guard.

SUGGESTED DIRECTION: Replace the vague "one of our early tests produced
a harness that cheerfully wrote a celebratory summary" with the specific:
"The earliest version of this failure was a run that consumed 22 of
its 30 tool-turn budget executing one of five children, then wrote a
structured success comment with confidence 88/100 before returning.
The self-reported confidence had no relationship to the proportion of
work completed." This is concrete enough that a reviewer who has never
seen the system can imagine the exact moment you noticed.
-->



**Context awareness** means every agent prompt is grounded in the POV record: customer identity, objective, solution, team, timeline, regional compliance frameworks, execution history. Context is injected into engine-owned prompt sections at every execution, which is how an Australian customer's pipeline ends up referencing ASD Essential Eight and APRA CPS 234 without the harness prompt mentioning either framework.

<!--
WAR STORY — infuse here (as a sidebar) or in §6.1 Emergent Behavior:
"The re-execution that blew past the token limit and then designed
 a complete plan in prose anyway"

CONCRETE DETAIL: After Experiment 3's V1 harness left 4 of 5 tasks
unexecuted, I re-ran the harness task hoping it would pick up where it
left off. The re-execution returned SUCCESS in 32 seconds. Tool calls: 4.
Succeeded: 0. Failed: 4. Error on every call: "Token budget exceeded:
Request would exceed hourly limit (117518 > 100000)". The first tool
call — a simple project(action:"pov.details") — already pushed us over
the 100K/hour allowance because V1 had burned 117,323 tokens before
this run started. The harness could not call a single tool. And yet
its finalResponse contained a complete six-task pipeline plan with
typed templates, explicit dependencies, and an escalation paragraph
naming the exact error, quantifying the impact, and offering three
actionable remediations in priority order. Confidence score, honestly
self-reported: 0/100 — "Pipeline designed but execution blocked by
system constraints." No prompt instruction covers this case; we never
told the harness "if all tools fail, design a plan in prose and escalate
with remediation options." It emerged from the intersection of
persistence, context awareness, and honest confidence reporting.

SUGGESTED DIRECTION: If you want this as a standalone moment in §6.1,
the sentence is: "When a re-execution of the harness hit its hourly
token budget on the first tool call and every subsequent call, it
designed a complete plan in prose, named the root cause, and proposed
three remediations — a behavior we had never instructed and never
tested for." If you want to keep §6.1 tight, fold it into context
awareness here with a shorter version: "This is also how a run that
failed every tool call because the token budget was exhausted still
managed to produce a structured remediation proposal — it reasoned
from context, not from tools."
-->



### 3.2 Dual-Mode Operation

The harness auto-detects one of two modes at execution start. It calls `task.list` on its own stage, filters out its own task ID, and counts the remaining tasks. Zero siblings means **CREATE mode**: decompose the objective, create a new pipeline stage, author the tasks itself, assign templates, wire dependencies, execute. One or more siblings means **ORCHESTRATE mode**: the user has already authored the work tasks, so the harness infers templates from each task's description, wires dependencies by a combination of explicit references and a type hierarchy fallback, and executes.

The type hierarchy — ARCHITECT → BUILDER → REVIEWER → ANALYST → DOCUMENTER — lives at the prompt level rather than in engine code, because the interesting case is when a task description explicitly references a specific upstream task ("using the vulnerability audit findings"). That override is LLM reasoning; it cannot be expressed as deterministic engine logic without NLP. The default hierarchy applies when descriptions are vague.

### 3.3 Context Chaining as a Pre-Execution Hook

Before any agent execution starts, the engine checks whether the task has dependencies. If it does, the context chainer reads each dependency's `result.json`, extracts the complete `finalResponse`, and injects it into the current task's prompt in a structured section:

```
## Pipeline Context (from previous tasks)

### Previous Task: Design data migration strategy
- Agent Role: solution_architect
- Confidence Score: 88/100

**Output:**
[complete deliverable text, no summarization, no truncation]

**Use the above output to inform your work. Build on what was
produced — do not repeat or re-derive it.**
```

The agent never knows context chaining happened. It simply finds the relevant predecessor output already in its prompt. This matters because an earlier design exposed the chainer as a tool the agent had to call, and omissions were routine. Removing the agent from the critical path made context fidelity a property of the engine rather than of prompt compliance.

<!--
WAR STORY — infuse here or in §5 Experiment 2:
"Task status vs executionStatus — two state machines pretending to be one"

CONCRETE DETAIL: First end-to-end test of the pre-execution chainer hook.
Task A (Solution Architect) executed cleanly — engine set
executionStatus='SUCCESS' and wrote artifacts. Task B (Business Analyst)
then executed and... the chainer logged that Task A wasn't ready to
chain from. We stared at that log line for several minutes. Task A's
status field was still OPEN. The engine had updated executionStatus but
not the task-level status. The chainer's check was depTask.status ===
'COMPLETED', which had never become true. Two parallel state machines
on the same row — status (OPEN/IN_PROGRESS/COMPLETED/BLOCKED, the
business-level state) and executionStatus (PENDING/RUNNING/SUCCESS/FAILED,
the execution-level state) — had drifted because the agent-execution
flow predated the harness work and was designed for manual tasks where
a human would later click "Mark Complete" in the GUI. For automated
pipelines, no human was coming. Fix was two lines: add status:'COMPLETED'
to both the engine transaction and the streaming-route transaction
(commit 0bdb0185), plus make the chainer accept either field as
"ready to chain from" as a belt-and-suspenders measure.

SUGGESTED DIRECTION: This is a tiny story but it's the kind that sounds
real. Add a sentence after "context fidelity a property of the engine"
that acknowledges the two-field design sat in our way: "The Task row
carries two status fields (status and executionStatus) for different
purposes, and the engine was originally updating only one of them —
when the chainer started querying the other, we had to add the missing
write to both execution paths." Nobody inventing this story would know
that a single Task row has two parallel status fields.
-->



A design choice worth noting: we inject complete outputs rather than summaries, even though the prompts are larger. Two findings pushed us here. Lee et al.'s Meta-Harness work showed that richer selectively-accessed context outperforms compressed summaries. Liu et al.'s Omni-SimpleMem work showed that returning full dialogue rather than LLM-generated summaries produced a 53% F1 improvement on their memory benchmarks. Both are experimental results for different systems, but they point in the same direction. For pipeline sizes under ~10 tasks, full-text injection is the right default. Selective access becomes interesting at larger scales; we discuss this in §5.

### 3.4 Algorithm

```
1:  context  ← read_pov_details(POV)
2:  if stage_has_siblings(): mode ← ORCHESTRATE else mode ← CREATE
3:  if mode = CREATE:
4:      phase    ← select_phase(context, objective)
5:      stage    ← create_pipeline_stage(phase, objective)
6:      G        ← decompose(objective, context)    # typed task graph
7:  else:
8:      G        ← read_siblings_and_infer_templates()
9:  for each v ∈ topological_order(G):
10:     ctx      ← chain_dependency_context(v)      # pre-exec hook
11:     apply_chained_context(v, ctx)
12:     o, c     ← execute_specialist(v)            # LLM call
13:     if c ≥ 70:     mark_completed(v, c)
14:     elif c ≥ 50 and retries(v) < 2:
15:         retry_execute(v, diagnostic_feedback)   # goto 12
16:     else:
17:         escalate_to_human(v, c, diagnostics)
18:         return partial_result()
19: if all_children_completed(): post_summary()
20: else: post_incomplete_report_with_resume_commands()
```

Line 19 is the self-completion guard: the harness verifies all children finished before reporting success. This guard was added in response to a specific failure mode where a rate-limited harness wrote a celebratory summary despite three of four children remaining unfinished.

## 4. Architectural Decisions

Six decisions are worth stating explicitly because each one moved the harness from "works for me" to "survives production load".

**Prompt section ownership.** The system prompt is template-owned; the user prompt is engine-owned. Cross-cutting instructions — confidence reporting, output format, comment character limits — live in an engine-owned §8 of the user prompt, not in template system prompts. Custom templates replace the system prompt entirely, so system-prompt instructions are silently absent for custom-template agents; engine-owned user prompt sections apply uniformly.

**Context chaining as a pre-execution hook** (§3.3). The agent never knows the chainer ran.

**Dual-mode with auto-detection** (§3.2). The sibling count is the signal. No mode flag, no explicit user configuration.

**Two execution paths.** The platform has two code paths for the same MCP actions. The in-process TypeScript path serves the execution engine (harness plus specialists); it uses direct Prisma queries, no HTTP, no rate limiting. The HTTP MCP server path serves external clients (Claude Desktop, ChatGPT, Gemini, CLI); it uses fuzzy template matching, friendly error formatting, and rate limiting at 300 req/min. The handlers in the two paths are not duplicates — they serve different clients with different needs. TypeScript handlers are lean because agents send exact parameters; JavaScript handlers are rich because humans need forgiveness.

<!--
WAR STORY — infuse here or in §6.2 (found-by-review theme):
"The spread-first catch — boundary specialist reviews ARE worth it"

CONCRETE DETAIL: After deleting a per-action apiPayload allowlist in
the MCP JavaScript path, the replacement was a spread operation that
compiled cleanly and lint-passed:

  const apiPayload = {
    action,
    parameters: finalParameters,
    ...finalParameters,           // ← silently broken
    includeResourceContext: true,
  };

A boundary-contract specialist reviewed the change and came back with
UNSAFE: spread ordering means ...finalParameters can overwrite the
named parameters field whenever finalParameters contains a parameters
key — which Claude Desktop's nested parameter format actually produces.
The collision would silently corrupt the nested parameters object,
breaking preNormalizeParameters() at app/api/mcp/tasks/action/route.ts
line 13. The fix was swapping the spread to first position so named
fields win the key collision. One-line fix, but neither the build nor
any automated test would have caught it — the bug required a specific
Claude Desktop payload shape to manifest, and most of our tests used
flat parameter structures.

SUGGESTED DIRECTION: Add a sentence or two either here ("The dual-path
architecture creates real risk, and a recent refactor to remove a
per-action allowlist shipped a silent key-collision bug that a
specialist boundary review caught before it hit production") or — if
you want it in §6.2 with the access control gap story — as part of
the "found by reading, not by failure" theme: "A boundary-contract
review of a spread-operator refactor caught a field-ordering bug that
would have silently corrupted Claude Desktop payloads. No test suite
we have would have flagged it." This is a small story but it's the
kind of specific detail that anchors a reader.
-->



**Fire-and-forget with parallel polling.** The `agent.execute` handler creates a PENDING execution record and fires `executeById()` without awaiting it, then returns immediately with `RUNNING` status. The MCP HTTP request cannot block for the 30-120 seconds a typical LLM call takes. A polling loop picks up any still-PENDING executions every 10 seconds and runs them via `Promise.allSettled` — up to 5 in parallel. Both paths use an atomic compare-and-swap on `PENDING → RUNNING` to prevent double-execution when they race.

**POV access on every handler.** Every MCP handler calls `validatePOVAccess(user, pov, { throwOnDeny: true })`. The shared utility handles owner, team member, demo, and admin cases uniformly. During routine audit we found `agent-results-handler.ts` had an inline DEMO_USER-only check instead of calling the shared utility — a medium-severity access control gap that let any authenticated non-demo user read any POV's execution artifacts by supplying a foreign task ID. The fix was one import and five lines of code. The lesson: inline access checks drift from the canonical implementation and are not caught by integration tests that use admin credentials.

The extended technical report (paichart.com/harness/extended) documents thirteen additional decisions in depth, including transport-boundary argument coercion, native-enum drift prevention, transactional dependency validation, the orphaned-execution watchdog, and the scalability architecture for 100 concurrent users.

## 5. Experiments

Seven production experiments on live infrastructure. All experiments run against the production Next.js 14 + PostgreSQL 16 deployment on Digital Ocean against real POV records (some marked demo, but with realistic content). All run by one operator over approximately one week.

**Experiment 1: Manual proof-of-concept.** Three tasks chained by hand via MCP, no automation. The point was to discover where friction lives. Six friction points emerged: no way to set inputContext via MCP, inconsistent confidence reporting, manual context chaining at the database level, only metadata passed between tasks, MCP timeouts for long LLM calls, no dependency enforcement. Each friction point became a design decision in the following experiments.

**Experiment 2: Automatic context chaining.** A two-task pipeline with the chainer running as a pre-execution hook. Logs confirmed the chainer read 26,048 characters of the architect's output and injected it into the analyst's prompt. The analyst's response explicitly referenced and built on the architect's framework. Zero manual intervention. This validated the hook approach.

**Experiment 3: First autonomous run (Test A).** The full harness on Demo Financial Corp: "assess cloud security posture and produce remediation roadmap". 178 seconds, 22 tool calls, 5 tasks created, templates assigned, dependencies wired, first task executed. The harness hit its token budget before completing the remaining four tasks but left them fully prepared. First end-to-end proof that the full loop works. Also exposed a plan-to-execute transition fragility — the meta-agent occasionally treats planning completion as task completion — which was corrected in a later prompt revision.

<!--
WAR STORY — THIS IS THE PRIMARY LANDING SPOT:
Two stories both anchor here, but they are TWO STORIES, not one experiment.

STORY A (the incompleteness masking):
"The harness ran out of tool turns at 22 of 30 and we thought it was fine"
  - Demo Financial Corp POV, objective "assess cloud security posture"
  - 178 seconds, 22 tool calls (20 succeeded, 2 failed), confidence 88/100
  - Harness created 5 tasks, executed PIPELINE-1 (Solution Architect)
  - PIPELINE-2 through PIPELINE-5 left OPEN with no execution records
  - Engine's auto-comment post-execution listed artifacts and confidence
    as if it were a normal successful run — that's the masking
  - Motivated the self-completion guard (§3.5 line 19) AND the MAX_TOOL_TURNS
    configurability (commit d64a28a2 raised harness to 100)

STORY B (the graceful degradation):
"The re-execution that blew past the token limit and then designed
 a complete plan in prose anyway"
  - SAME TASK, re-executed to continue the pipeline. NOT a new objective.
  - 32 seconds, 4 tool calls ALL FAILED
  - Error on every call: "Token budget exceeded: Request would exceed
    hourly limit (117518 > 100000)"
  - First run had burned 117,323 tokens; hourly limit was 100,000
  - Re-execution couldn't call project(pov.details), task.create,
    agent.assign, or even task.comment to post progress
  - Despite zero successful tool calls, finalResponse contained:
    * A six-task pipeline plan (decomposed differently from the first run)
    * Typed template assignments for all six
    * Explicit dependency graph
    * A three-option escalation paragraph naming the exact error,
      quantifying impact, and proposing remediations in priority order
  - Honestly self-reported confidence: 0/100
  - "Pipeline designed but execution blocked by system constraints"

VERIFY BEFORE USING: Was confidence 88/100 self-reported by the harness
in its finalResponse text, or was it the engine's default? The harness's
own plan comment should contain "Confidence: 88" somewhere if self-reported.
The §3.1 self-evaluation claim depends on this being agent-reported, not
engine-defaulted.

WHY TWO STORIES, NOT ONE:
- Story A's lesson is quality-gate deception: self-reported confidence
  had no relationship to proportion-completed. Fix: self-completion guard.
- Story B's lesson is emergent graceful degradation: the harness produced
  useful output through a channel it hadn't been instructed to use. Fix:
  none needed — it's a capability we want to preserve, not fix.
- Folding them into one paragraph blurs both. Experiment 3 should
  present Story A (it's the one that motivated the self-completion
  guard from §3.5). Story B belongs in §6.1 Emergent Behavior as a
  second example alongside the parallel topology.

SUGGESTED EDIT TO §5 EXPERIMENT 3: Replace the current paragraph with
Story A, two sentences:

  "Experiment 3: First autonomous run (Test A). The full harness on
  Demo Financial Corp, objective 'assess cloud security posture and
  produce remediation roadmap'. 178 seconds, 22 tool calls (20
  succeeded, 2 failed), confidence 88/100, one of five children
  executed. The run returned SUCCESS with a structured auto-comment,
  and on first inspection looked like a normal completed pipeline —
  until we queried the task list and found PIPELINE-2 through
  PIPELINE-5 still OPEN with no execution records. The harness had
  reported success with 80% of the pipeline unexecuted; self-reported
  confidence bore no relationship to the proportion of work completed.
  The failure motivated two of the architectural decisions in §3:
  the self-completion guard (§3.5 line 19) and configurable tool-turn
  budgets per template (the Pipeline Harness is set to 100; default
  is 30)."

SUGGESTED EDIT TO §6.1 (where the parallel topology is discussed):
Add a second paragraph introducing Story B as the second emergence
example. See the §6.1 annotation block for suggested prose.

That split keeps Experiment 3 tight and gives the §6.1 claim two
independent data points instead of one.
-->



**Experiment 4: Emergent topology.** "Assess cloud migration readiness" on Pipeline Test Corp, an Australian customer. The harness produced two behaviors it was not prompted for. First, a non-linear dependency graph: three parallel roots (infrastructure, security, operational assessment) feeding a synthesis task, which in turn fed a cost-benefit task, both feeding an executive report. We did not instruct the harness to find parallelism. Second, regional framework propagation: the security task description named ASD Essential Eight, APRA CPS 234, and the Privacy Act 1988. The harness prompt does not enumerate regional frameworks; they emerged from the POV's country field via the meta-agent's reasoning. The pipeline completed planning in 127 seconds but stopped before execution — the failure mode from Experiment 3 again. The prompt was revised to add an explicit execution-follow-through gate.

**Experiment 5: Full autonomous pipeline with fault recovery (Test C).** The predecessor run on Demo Financial Corp was killed mid-pipeline by a production deployment restart. This was unintended but valuable: it left two zombie RUNNING execution records in the database, which became an opportunity to validate the orphaned-execution watchdog we had built in parallel. On engine startup, the watchdog transitioned both zombies to FAILED atomically with their task state. A fresh run then completed a 6-task compliance assessment — compliance baseline → gap analysis → ROI → remediation roadmap → findings report → implementation timeline — in **488 seconds with 6/6 tasks completed**. Task 2 produced detailed SOX, PCI-DSS, and CCPA gap tables with risk scores (8 critical, 10 high, 6 medium) and a remediation roadmap with effort and cost estimates; confidence 78/100, with the agent explicitly noting the limitation "confidence bounded by lack of actual system access for detailed control testing". Three distinct bug fixes were validated in one run: the watchdog, pre-write dependency validation, and the execution-follow-through prompt revision.

**Experiment 6: ORCHESTRATE mode (Test G).** The inverse setup: instead of giving the harness an objective, we pre-authored three work tasks on a clean POV (design data migration strategy, audit data migration risks, produce executive briefing) and added a PIPELINE task. The harness detected three siblings, inferred the right template for each from its description (Solution Architect, Security Analyst, Technical Writer — 3/3 correct), wired a linear dependency chain, executed the three specialists in order with context chaining, and completed the pipeline in **228 seconds with 3/3 tasks completed**. Confidence scores: 88, 85, 92. This was the first end-to-end validation of ORCHESTRATE mode and the self-completion guard.

**Experiment 7: Concurrency stress test.** Using Claude Code's experimental agent teams feature, we spawned five independent Claude Code instances (Reader, Writer, Hub Operator, Searcher, Chaos Agent), each running four rounds of parallel MCP tool calls against the production server. Peak load was five concurrent sessions with bursts of ~20-30 parallel tool calls. Both before and after we deployed the scalability architecture changes (connection pool sizing, rate limiter rationalization, TRUSTED_PROXY configuration, Map limit enforcement), the test produced **96/96 calls successful, zero failures, zero degradation across five workload patterns**. Server-side metrics stayed flat: heap 59 MB constant across 30 sampling intervals, PostgreSQL active connections constant at 1, zero PM2 restarts. The test exercises the read/write MCP surface; it does not directly test `Promise.allSettled` parallelism on the execution engine, which we discuss in §6.

### 5.1 Production Metrics

| Metric | Value |
|---|---|
| Pipeline decomposition (Experiment 3) | ~30 seconds |
| Full 6-task CREATE pipeline (Experiment 5) | 488 seconds, 6/6 tasks |
| Full 3-task ORCHESTRATE pipeline (Experiment 6) | 228 seconds, 3/3 tasks |
| Template inference accuracy (Experiments 4-6) | 10/10 correct |
| Confidence score parsing success | 100% of recent runs |
| Concurrency stress test (Experiment 7) | 96/96 calls, 0 failures |
| Task types | 7 (rationalized from 13) |
| Template types | 8 |
| Active templates | 17 |
| Documented production patterns | 52 |

## 6. Discussion

### 6.1 Emergent Behavior and Prompt Engineering

The most interesting result is not a performance number but the emergent behavior in Experiment 4. The meta-agent produced a parallel dependency graph, mapped task kinds to POV lifecycle phases, and applied region-specific compliance frameworks — none of which the prompt instructs. Our harness prompt specifies decomposition rules and constraints (3-7 tasks, typed specialists, explicit dependencies) and leaves structure to the meta-agent. A prescriptive prompt ("always create exactly five tasks with roles A, B, C, D, E") would have suppressed these behaviors.

<!--
WAR STORY — add Story B here (the §5 Experiment 3 annotation splits
Stories A and B for this purpose):
"The re-execution that blew past the token limit and then designed
 a complete plan in prose anyway"

CONCRETE DETAIL (to fold into the prose):
  - Same Experiment 3 task (Demo Financial Corp cloud security posture),
    re-executed to continue the pipeline where V1 had stopped
  - 32 seconds, 4 tool calls, all 4 failed
  - Error on every call: "Token budget exceeded: Request would exceed
    hourly limit (117518 > 100000)"
  - V1 had burned 117,323 tokens; the 100,000/hour rate limit was
    exhausted before this re-execution could call even
    project(action: "pov.details")
  - Despite zero successful tool invocations, finalResponse contained:
    a six-task pipeline plan, typed template assignments, an explicit
    dependency graph, and a three-option escalation paragraph
  - Self-reported confidence: 0/100 ("Pipeline designed but execution
    blocked by system constraints")
  - Three remediation options were proposed in priority order: wait
    for hourly quota reset, manually increase token budget for this
    POV, execute pipeline in next time window
  - No prompt instruction covers "what to do when every tool fails" —
    it emerged from persistence + context awareness + honest
    confidence reporting interacting under a constraint we had not
    tested for
  - Fix was raising MAX_PER_HOUR from 100000 to 500000 and
    MAX_PER_DAY from 500000 to 2000000 in lib/services/llm/types.ts
    (commit 2d6fcfab). The behavior itself was not fixed — it is a
    capability we want to preserve.

SUGGESTED PROSE (second paragraph after the parallel topology discussion):

"Experiment 3's re-execution produced a second emergent behavior that
is structurally different from the parallel topology but arguably
more striking. We re-ran the same harness task to continue the
pipeline, and the re-execution hit the hourly token budget on its
very first tool call — an innocent project(pov.details) request.
Every subsequent call failed with the same rate-limit error.
Four calls attempted, four calls failed, thirty-two seconds elapsed.
And yet the finalResponse contained a complete six-task pipeline
plan — typed template assignments, an explicit dependency graph, and
a three-option escalation paragraph naming the exact rate-limit error
and proposing remediations in priority order. Honest self-reported
confidence: 0/100, with the gloss 'Pipeline designed but execution
blocked by system constraints.' No prompt instruction covers the
scenario 'what to do when every tool fails'; the behavior emerged
from the intersection of persistence, context awareness, and honest
confidence reporting when the only remaining output channel was the
finalResponse text. We raised the hourly token budget and preserved
the behavior — it is a capability, not a bug. Two emergence cases
from the same prompt under different constraints suggest the pattern
is not a single lucky draw."

This paragraph is longer than its neighbor (the parallel topology
paragraph) because it carries more unfamiliar detail. If you want
the section balanced, trim it. The two non-negotiable details are:
(a) the exact error message "117518 > 100000" and (b) the fact that
zero tool calls succeeded.
-->

The implication for meta-agent prompt engineering is to prefer principles and constraints over prescribed patterns. Give the meta-agent enough context to reason over and enough structure to stay on the rails, and the interesting behaviors find themselves.

### 6.2 Scalability and Security Are Architectural Concerns

A scalability review at the 100-concurrent-user mark identified five concerns that would not have surfaced in single-operator testing: `TRUSTED_PROXY` was not set, so all users collapsed into a single rate-limit bucket; the execution engine processed pending executions serially despite having parallel infrastructure available; the connection pool was sized for single-user operation; in-memory Maps had defined size limits but never enforced them; and a phantom PgBouncer hint was disabling Prisma prepared statements for a PgBouncer that was not actually running. None of these are novel problems. What is worth reporting is that they were found by reading the code with a specialist's mental model, not by watching the system fail under load. Production AI systems that intend to serve more than one user must treat concurrency and security as *architectural* concerns found by review, not *operational* concerns found by incident.

The same point holds for the `agent-results-handler.ts` access control gap we discovered and closed. An integration test suite using admin credentials will never catch an inline role-specific check that incorrectly allows non-admin non-demo users to read any POV's artifacts. The right defense is treating shared access-validation utilities as the single point of enforcement and auditing for calls to them.

<!--
WAR STORY — reinforces §6.2 "found-by-review" theme:
"The spread-first catch — boundary specialist reviews ARE worth it"

CONCRETE DETAIL: Refactor that replaced a per-action parameter allowlist
in the MCP JavaScript handler with a spread operator. The spread was
ordered so ...finalParameters came AFTER the named parameters field.
When Claude Desktop sends a payload with a nested parameters key,
the spread silently overwrites apiPayload.parameters, breaking Tier 2
routing. The build passed. Lint passed. Tests passed (none used the
specific Claude Desktop nested shape). A boundary-contract specialist
reviewed the diff and returned UNSAFE within minutes. Fix was reversing
the spread order to let named fields win key collisions.

SUGGESTED DIRECTION: Add a third example to the found-by-review pattern:
"The spread-operator key collision that our boundary specialist caught
in a refactor diff — no test we had would have exercised the specific
Claude Desktop payload shape that would have triggered it — is the
same lesson in a different clothes. Production AI systems that serve
heterogeneous clients cannot rely on integration tests that use a
single canonical payload shape; they need specialist review that
thinks about what weird payloads look like in the wild."
-->



### 6.3 Threats to Validity

Sample sizes are small: seven experiments, two stress-test runs, approximately one week of operation, one operator. Statistical claims should be read as feasibility demonstrations rather than validated benchmarks. Specifically:

- **Template inference accuracy of 10/10** is across three experiments with small assignment counts, not a large-scale measurement.
- **The "scalability for 100 concurrent users" claim** is designed by specialist review and validated at ~20 via agent teams. 100-user testing is straightforward follow-up work.
- **The parallel execution speedup** is theoretical. Our single-client stress test serializes at the MCP JavaScript handler because the client-side handler auto-polls for results before returning to the caller. True `Promise.allSettled` parallelism manifests only with multiple independent MCP clients, which the agent-team stress test does not exercise on the `agent.execute` path.
- **Self-healing mechanisms** (orphaned-execution watchdog, transactional dependency validation, self-completion guard) were each observed operating correctly exactly once. They are in place, not battle-tested.
- **Confidence scores are self-reported.** We parse them but do not independently verify; a dishonest agent would bypass the quality gate.
- **Hypothesis-driven re-execution** has never actually fired in production because no specialist output landed in the 50-69 retry band during the reported experiments. The mechanism exists; operational validation is pending.
- **We have not run a head-to-head comparison against a no-harness baseline.** Our claim that orchestration matters is supported by qualitative observation of what a single Sonnet call can and cannot do with extended tool use, not by a controlled comparison. This is the most important missing empirical datum and is planned follow-up work.

### 6.4 What We Claim and What We Do Not

We claim the architecture is a correct implementation of the six capabilities, that it operates in production multi-user conditions without the failure modes we have documented, that the design decisions (prompt section ownership, pre-execution context chaining, dual-path execution, POV access coverage, scalability architecture) are worth adopting by other multi-agent systems intended for production deployment, and that the Pipeline Harness is available as a live artifact for direct inspection at `paichart.app/mcp`.

We do not claim formal verification of the access control layer, statistical significance of the empirical results, a controlled comparison against alternatives, or generalizability beyond PoV delivery. We do not claim comprehensive security certification (SOC 2, ISO 27001); we claim per-attack-vector conformance to Anthropic's MCP security best practices specification for remote multi-user server deployments, which is an engineering claim, not a compliance claim.

## 7. Conclusion

The Pipeline Harness is a production orchestration layer for goal-directed multi-agent delivery. It takes a one-sentence objective, decomposes it into typed specialist tasks, chains their outputs, gates quality by confidence, and produces a deliverable — or escalates honestly when it cannot. It is available as a running server at `paichart.app/mcp` that readers can connect to directly.

The broader argument the paper defends is that the hard problem in production AI is not individual model capability but the orchestration layer that coordinates specialists, manages knowledge flow, evaluates quality, and survives multi-user concurrency. Models will continue to improve. The orchestration layer — which decides what to do, who should do it, how knowledge flows, and whether the result is good enough — is the differentiator between a capable tool and a system that can actually deliver customer outcomes without human babysitting. We built one. Here is how it works and what broke along the way.

## References

*[To be populated. Target ~25 references spanning multi-agent systems, agent frameworks, POV automation, and MCP security specifications.]*

## Appendix A: Reproducibility

The Pipeline Harness is deployed as a production multi-user system, not a research prototype.

**Live access.** Connect any MCP-compatible client to `https://paichart.app/mcp` and authenticate via GitHub OAuth. New users auto-register with `DEMO_USER` role: read access to demo POVs, read/write on a personal sandbox. To reproduce Experiment 6 (ORCHESTRATE mode), create a new stage on any accessible POV, add three tasks with descriptions implying ARCHITECT / REVIEWER / DOCUMENTER roles, add a fourth task with `type: PIPELINE`, and execute it. Expected result: the harness detects three siblings, assigns templates, wires dependencies, and executes the three specialists in 180-300 seconds.

**Elevated access.** Standard `USER` role (write access to production POVs) and `ADMIN` role available by emailing `steve.terry@paichart.com`.

**Source code.** Closed at the time of writing. Per-section source references in this paper cite specific files and line ranges in the reference technical report (paichart.com/harness/extended); source excerpts are available to reviewers on request. An open-source artifact repository containing the harness template definition, the execution engine core, and the context chainer is under consideration for a future release.

## Appendix B: MCP Security Compliance Summary

Per-attack-vector compliance with the Anthropic MCP Security Best Practices specification (modelcontextprotocol.io/specification/draft/basic/security_best_practices). Full details in the reference technical report.

| Attack vector | Compliance |
|---|---|
| Confused deputy | Per-client consent stored server-side; state validation before cookie set; `__Host-` prefix; exact redirect URI matching |
| Token passthrough | MCP server mints own audience-bound tokens; no forwarding of external tokens |
| SSRF | HTTPS-only outbound; allowlisted endpoints; remote-server variant (limited outbound surface) |
| Session hijacking | `crypto.randomUUID()` session IDs bound to JWT user ID; all inbound requests require auth |
| Scope minimization | Least-privilege default via `DEMO_USER` role; elevated roles require out-of-band approval |
| Local compromise | N/A — remote HTTP server |

Not claimed: SOC 2, ISO 27001, FedRAMP certification, or formal verification. Claimed: engineering conformance to MUST and SHOULD items in the specification that apply to remote multi-user server deployments.

## Appendix C: Discovered Pipeline Topologies

We have observed four topologies across the experiments:

```
Linear:        ARCHITECT → REVIEWER → ANALYST → DOCUMENTER

Parallel fan-in:     ARCHITECT ─┐
                     ANALYST   ─┼→ REVIEWER → DOCUMENTER
                     REVIEWER  ─┘

Orchestrator-first:  ORCHESTRATOR → ARCHITECT → REVIEWER → ANALYST → DOCUMENTER

Cross-phase:         Execution Phase:
                       Workstream A (ARCHITECT) ─┐
                       Workstream B (REVIEWER)  ─┼→ Strategy → Cost-Benefit
                       Workstream C (ANALYST)   ─┘
                     Review Phase:
                       Executive Report (DOCUMENTER)
```

The linear topology is the default for assessment pipelines. The parallel fan-in and cross-phase topologies emerged without being prompted, as described in Experiment 4. The orchestrator-first topology appears when the objective requires external data gathering before specialist work begins.

---

**Extended technical report:** [paichart.com/harness/extended](https://paichart.com/harness/extended) contains the comprehensive version of this paper including all architectural decisions, production patterns, research directions, related-work cross-references, and deployment details.
