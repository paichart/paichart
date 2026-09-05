# pAIchart Pipeline Harness: Goal-Directed Multi-Agent Delivery for Domain-Scoped Outcomes

**Version**: Reference v2.1 | **Date**: 2026-04-06 | **Role**: **Extended technical reference and internal companion document**

> **About this document.** This is the comprehensive technical reference for the pAIchart Pipeline Harness. It is intentionally exhaustive — it documents every design decision, pattern, experiment, research direction, and related-work connection in one place. It is **not** the arxiv submission; that is `WHITEPAPER-ARXIV-v1.md`, a tighter document derived from this one. This reference exists to serve as a single source of truth for the harness architecture, provide complete context for new contributors, and support the arxiv paper as a citable extended reference ("see the full technical report at paichart.com/harness/extended for complete details"). Update this document when a new design decision, experiment, or pattern is added — the arxiv submission is regenerated from this reference, not the other way around.
>
> **Session 4-6 additions** (v2.1): Dual-mode operation (CREATE + ORCHESTRATE); scalability architecture analyzed for 100 concurrent users and validated at ~20 via agent-team stress testing; security access-control gap identified and closed. See version history for full changelog.

---

## Authors & Affiliations

*[To be completed]*

---

## Code, Platform, and Resources

| Resource | URL |
|----------|-----|
| **Production platform** | [https://paichart.app](https://paichart.app) |
| **Live MCP endpoint** (streamable HTTP) | [https://paichart.app/mcp](https://paichart.app/mcp) |
| **Project page** (interactive demo + architecture diagrams) | [https://paichart.com/harness](https://paichart.com/harness) *(to be published alongside this paper)* |
| **Corresponding author** | `<maintainer-email>` |

**Reproducibility and access.** The pAIchart Pipeline Harness is deployed as a single-tenant, multi-user production platform intended as a Proof of Value demonstration for enterprise deployment — not a research prototype. Readers may inspect the system directly by connecting any MCP-compatible client (Claude Desktop, ChatGPT, Gemini, or a CLI) to `https://paichart.app/mcp` and authenticating via GitHub OAuth. New users are auto-registered with the `DEMO_USER` role, which grants read access to demo POVs and read/write access to a personal sandbox. Elevated roles (standard `USER`, `ADMIN`) are available by contacting the corresponding author.

**Source code availability.** The platform is closed-source at the time of writing. Per-section source references in this paper cite specific files and line ranges; authors are willing to share relevant source excerpts with reviewers on request. An open-source companion artifact repository containing the Pipeline Harness template definition, the execution engine core, and the context chainer is under consideration for a future release.

**Production context.** Unlike research prototypes that exercise agent frameworks in isolated benchmark conditions, the Pipeline Harness operates inside a running Sales Engineering platform with real POV data (including demo POVs designed for public inspection), multi-user access controls, OAuth authentication, per-IP rate limiting, and compliance with Anthropic's MCP security best practices (see Section 4.19). Though the current deployment is single-tenant (one organization, many users), it is architected as a PoV of an enterprise-ready pattern: any organization considering similar multi-agent orchestration for customer-facing deliverables can inspect a running example rather than reason about one from specifications. Several design decisions documented in this paper (prompt section ownership, dual execution path parity, POV access coverage, the scalability architecture) only become load-bearing under production multi-user conditions and would not surface in single-operator benchmark testing.

---

## Abstract

We present the **pAIchart Pipeline Harness**, a production, single-tenant, multi-user system for goal-directed autonomous delivery of structured, customer-facing outcomes within persistent business contexts. Given a single high-level objective, the harness decomposes the goal into typed specialist tasks, wires dependencies, executes them in order with automatic context chaining, gates quality via confidence-scored completion loops, and reports deliverables — without manual intervention. The harness operates in two auto-detected modes: **CREATE mode** (decompose an objective from scratch) and **ORCHESTRATE mode** (assign specialists to and execute existing user-defined tasks). The system is live at [https://paichart.app/mcp](https://paichart.app/mcp), accepts authenticated MCP connections from Claude Desktop, ChatGPT, Gemini, and CLI clients, and is positioned as a Proof of Value for enterprise deployment of multi-agent orchestration rather than a research prototype.

The system combines six capabilities that, to our knowledge, do not exist together in any prior work: (1) task decomposition via meta-agent planning, (2) typed specialization through eight functional roles, (3) automatic knowledge transfer between dependent tasks without summarization loss, (4) self-evaluation via confidence-gated progression, (5) persistence through bounded re-execution, and (6) grounding in a persistent domain context (Proof of Value).

We describe a set of architectural decisions that together make the system robust under production deployment — including prompt section ownership, dual execution path parity (HTTP streaming vs embedded polling), three-layer parameter validation, type-based template auto-assignment, automatic pre-execution context chaining, native-enum drift prevention, fire-and-forget execution with parallel polling, a self-completion guard, and an orphaned-execution watchdog for restart-tolerance. We additionally document a scalability architecture analyzed by specialist review for a target of 100 concurrent users and validated at ~20 simulated concurrent users via agent-team stress testing, including per-IP rate limiting, connection pool sizing, in-memory Map enforcement, and multi-tier security validation (POV access across all handlers).

We present results from seven production experiments and two stress tests, including: a 6-task autonomous CREATE-mode pipeline completed in 488 seconds with 100% task completion (Experiment 5); a 3-task ORCHESTRATE-mode pipeline completed in 228 seconds with 100% completion (Experiment 6); two documented cases of emergent planning behavior (non-linear dependency graph generation; cross-phase stage distribution); a fault-recovery validation following a mid-pipeline deployment restart; and a concurrency stress test simulating 20 concurrent users across 5 distinct workload patterns (96/96 MCP calls, zero failures, zero degradation). We argue that the hard problem in production AI is not individual model capability but the **orchestration layer** that coordinates specialists, manages knowledge flow, and evaluates quality — and that this layer must be engineered for production concurrency and security from the outset, not bolted on after the fact.

**Keywords**: multi-agent systems, goal-directed planning, pipeline orchestration, context chaining, confidence-gated execution, domain-aware agents, meta-agent decomposition, Proof of Value delivery

---

## 1. Introduction

### 1.1 The Orchestration Gap

Large language models have achieved remarkable capabilities on isolated tasks — writing code, answering questions, drafting documents. Delivering structured, customer-facing outcomes in domain-specific contexts, however, remains a fundamentally different challenge. A single LLM can write a security assessment when given a narrow prompt, but it cannot autonomously (a) decide that a security assessment requires a specific sequence of specialist activities, (b) execute each activity with domain-appropriate reasoning, (c) pass knowledge between activities without summarization loss, (d) evaluate whether each step meets quality thresholds, (e) iterate when quality is insufficient, and (f) maintain awareness of the broader business context — customer, compelling event, compliance regime, competitive landscape — that shapes what "correct" means.

We call this distance between individual model capability and production delivery requirements the **orchestration gap**.

### 1.2 Why Existing Approaches Fall Short

Three classes of systems partially address the orchestration gap but each omits essential capabilities:

- **Agent orchestration frameworks** (CrewAI, LangGraph, AutoGen, Swarm) provide primitives for multi-agent coordination but are developer-facing libraries, not products. They require code to instantiate for each domain, have no persistent business context, and lack confidence-gated quality loops.
- **Autonomous coding agents** (Devin, Factory.ai, Cursor, Windsurf) demonstrate single-agent persistence but produce only code. They have no multi-specialist decomposition, no cross-agent knowledge transfer, and no non-code deliverable types.
- **Sales engineering platforms** (Vivun, Consensus, Demostack) track POV workflows but do not produce deliverables. They have domain context but no agents, no decomposition, no autonomous work.

Section 2 provides a detailed positioning against these classes. No existing system combines the six capabilities we identify as essential for goal-directed autonomous delivery.

### 1.3 Contributions

1. **A six-capability framework** for evaluating goal-directed autonomous systems: task decomposition, typed specialization, knowledge transfer, self-evaluation, persistence, and context awareness.

2. **A typed template system** that formalizes specialist roles orthogonally to domain categories, enabling automatic specialist selection by functional role rather than by template name.

3. **An automatic context chaining mechanism** implemented as a pre-execution hook that transfers complete outputs between dependent tasks without summarization, eliminating the "telephone game" degradation common in sequential multi-agent systems.

4. **A confidence-gated completion loop** with hypothesis-driven re-execution (the harness reads failing artifacts and provides specific diagnostic feedback rather than blind retry) and a self-completion guard that prevents premature success reporting.

5. **Dual-mode operation**: CREATE mode (decompose an objective) and ORCHESTRATE mode (execute existing user-defined tasks by inferring templates and dependencies from task descriptions), auto-detected by sibling presence in the same stage.

6. **Production-deployed architectural patterns** (in active use in the production environment, with varying degrees of load exposure) including the three-layer parameter contract, dual-path execution parity, prompt section ownership, type-based template auto-assignment, native-enum drift prevention, transport-boundary coercion defense, fire-and-forget execution with parallel polling, orphaned-execution watchdog, transactional dependency validation, and side-effect-only MCP update handling.

7. **Scalability architecture designed for 100 concurrent users** (specialist-reviewed; stress-tested at ~20 simulated concurrent users via Claude Code agent teams): dual TypeScript/JavaScript execution paths (embedded in-process for the execution engine; HTTP for external AI clients), per-IP rate limiting with `TRUSTED_PROXY`-gated header trust, connection pool sizing for burst tolerance, and bounded in-memory state with enforced limits.

8. **Empirical results from seven production experiments and two concurrency stress tests** including two documented cases of emergent topology design (non-linear dependency graphs; cross-phase stage distribution), a fault-recovery validation showing self-healing from mid-pipeline server restarts, a full ORCHESTRATE-mode pipeline completion, and a 20-user stress test producing 96/96 MCP calls with zero failures and zero degradation.

9. **A live, publicly-inspectable production system** at [https://paichart.app/mcp](https://paichart.app/mcp) that readers can connect to directly via any MCP-compatible client (Claude Desktop, ChatGPT, Gemini, CLI) with GitHub OAuth auto-registration to a demo role. To our knowledge, this is the first multi-agent orchestration paper whose primary artifact is not a code release or benchmark but a running production server that reviewers and practitioners can exercise themselves.

10. **Documented compliance with Anthropic MCP Security Best Practices** (Section 4.19), including confused-deputy prevention (per-client consent with state validation), token passthrough prohibition (audience-bound token minting), session hijacking protection (user-bound secure session IDs), and scope minimization (least-privilege default via the `DEMO_USER` role). Security compliance is documented per attack vector rather than claimed as blanket certification.

### 1.4 Paper Structure

Section 2 surveys related work and positions our contributions. Section 3 presents the system architecture including a formal problem formulation and the harness main loop as Algorithm 1. Section 4 documents the architectural decisions most critical to production operation. Section 5 describes five production experiments progressing from manual proofs-of-concept to full autonomous pipelines with fault recovery. Section 6 discusses emergent behavior, limitations, and implications. Section 7 concludes. Appendices document qualitative harness behavior, discovered pipeline topologies, the template inventory, production patterns, implementation guidance, research extensions, deployment details, and extended related work.

---

## 2. Related Work

### 2.1 Multi-Agent Orchestration Frameworks

Recent work on multi-agent LLM systems includes CrewAI (role-based task delegation with Python crew definitions), LangGraph (graph-based state machines with checkpoint persistence), AutoGen (conversational multi-agent protocols built on dialogue), and OpenAI Swarm (lightweight agent handoff patterns). These frameworks provide composable primitives for building multi-agent applications but place significant burden on the developer to instantiate for specific domains. CrewAI has specialization (typed roles) but no context awareness or self-evaluation. LangGraph has graph infrastructure but lacks specialization and confidence gating. AutoGen has dialogue-based knowledge transfer but no structured deliverable types. Swarm is intentionally minimal and lacks nearly all six capabilities.

### 2.2 Autonomous Agents for Code and Content

Devin (Cognition) demonstrated persistent autonomous coding agents capable of iterating toward code that passes tests. Factory.ai, Cursor, and Windsurf extend this pattern with developer tooling integration. These systems exhibit strong persistence and specialization for the code domain but produce only code artifacts. They lack multi-specialist decomposition, cross-agent knowledge transfer, confidence-gated quality loops, and non-code deliverables such as business cases, risk analyses, or customer-facing reports.

### 2.3 Meta-Harness and Self-Optimizing Systems

Recent work on meta-harnesses (Lee et al., 2026) explores automated optimization of harness code itself through agentic proposers that search code-space for improved harness implementations. Our work differs in focus: rather than optimizing harness *implementations*, we address the orchestration of typed specialists within a persistent domain context, producing business-scoped deliverables rather than benchmark improvements. The two approaches are complementary — a meta-harness could in principle optimize the Pipeline Harness prompt and template assignments over time.

### 2.4 The claw-code Ecosystem: Typed-Role Agent Patterns

The claw-code project and its supporting ecosystem (oh-my-codex, clawhip, oh-my-openagent) demonstrated multi-agent orchestration with typed roles (Architect, Executor, Reviewer) for autonomous code generation, notably porting an entire codebase overnight while the developer slept. We adopt three patterns directly from this ecosystem: separation of notification from execution (clawhip), persistent completion loops (the Ralph pattern in oh-my-codex), and category-based routing (Sisyphus in oh-my-openagent). Our work extends these patterns from developer-facing code generation to customer-facing structured deliverables, and adds the persistent business context, confidence-gated quality loops, and domain-aware decomposition that distinguish POV delivery from code delivery.

### 2.5 Sales Engineering and PoV Automation

Platforms such as Vivun, Consensus, and Demostack address Sales Engineering workflows but focus on tracking, demo automation, and evaluation metrics rather than autonomous deliverable production. Vivun has deep POV context awareness — customer details, timelines, stakeholder mapping — but does not use AI agents to produce deliverables. Consensus and Demostack automate demo experiences but do not produce assessments, architectures, or business cases. No prior system we are aware of combines multi-agent orchestration with domain-scoped business context for PoV delivery.

### 2.6 Positioning: The Six-Capability Gap

Table 1 summarizes the capability coverage of representative systems across the three classes above. The Pipeline Harness is the only system we are aware of that combines all six capabilities.

**Table 1: Capability Coverage of Representative Systems**

| Capability | CrewAI | LangGraph | AutoGen | Devin | Vivun | **Pipeline Harness** |
|------------|--------|-----------|---------|-------|-------|---------------------|
| Task decomposition | Partial | ❌ | ❌ | ❌ | ❌ | **✓** |
| Typed specialization | ✓ | ❌ | ❌ | ❌ | ❌ | **✓** |
| Knowledge transfer | ❌ | Partial | Partial | ❌ | ❌ | **✓** |
| Self-evaluation | ❌ | ❌ | ❌ | ❌ | ❌ | **✓** |
| Persistence | ❌ | Partial | ❌ | ✓ | ❌ | **✓** |
| Context awareness | ❌ | ❌ | ❌ | ❌ | Partial | **✓** |
| **All six together** | ❌ | ❌ | ❌ | ❌ | ❌ | **✓** |

---

## 3. System Architecture

### 3.1 Problem Formulation

Let $\mathcal{O}$ be a high-level objective expressed in natural language (e.g., "Assess cloud security posture and produce remediation roadmap"). Let $\mathcal{C}$ be a persistent domain context — a Proof of Value record containing customer identity, objective, solution scope, team structure, timeline, regional compliance frameworks, and historical execution records. Let $\mathcal{T} = \{t_1, \ldots, t_n\}$ denote the set of typed specialist templates available to the system, where each $t_i$ has a functional type $\tau(t_i) \in \Sigma$ for $\Sigma = \{\text{ARCHITECT, BUILDER, ANALYST, REVIEWER, OPERATOR, DOCUMENTER, ORCHESTRATOR, GENERALIST}\}$.

The Pipeline Harness problem is to produce a deliverable $\mathcal{D}$ satisfying $\mathcal{O}$ under $\mathcal{C}$, by constructing and executing a directed acyclic graph $G = (V, E)$ where:

- $V$ is a set of typed tasks $v_i = (d_i, \tau_i)$ with description $d_i$ and required specialist type $\tau_i \in \Sigma$.
- $E \subseteq V \times V$ wires dependencies such that $(v_i, v_j) \in E$ means $v_i$'s output must be available in $v_j$'s input context.
- Each $v_i$ is executed by a specialist template $t \in \mathcal{T}$ with $\tau(t) = \tau_i$, producing an output $o_i$ and a confidence score $c_i \in [0, 100]$.
- The final deliverable $\mathcal{D}$ is produced by the DOCUMENTER-typed task whose in-edges include all terminal work.

The harness must perform four functions autonomously: (1) decomposition $\mathcal{O} \mapsto G$, (2) specialist assignment $V \mapsto \mathcal{T}$, (3) execution ordering respecting $E$, and (4) quality gating based on $\{c_i\}$ with bounded re-execution.

### 3.2 System Overview

The Pipeline Harness is implemented as a meta-agent template within the pAIchart platform. A user provides a high-level objective; the harness autonomously:

1. Reads the Proof of Value context ($\mathcal{C}$)
2. Selects an appropriate phase for the pipeline's activities
3. Creates a dedicated pipeline stage as the workspace
4. Decomposes the objective into 3-7 typed tasks ($G$)
5. Assigns specialist templates based on task requirements
6. Wires dependencies explicitly
7. Executes tasks in dependency order with automatic context chaining
8. Evaluates each output via confidence scoring
9. Re-executes low-confidence outputs with feedback, or escalates
10. Reports pipeline progress and final deliverables

### 3.3 The Six Capabilities

We identify six capabilities essential to goal-directed autonomous delivery.

#### 3.3.1 Task Decomposition

High-level objectives are decomposed into typed sub-tasks. The harness meta-agent (implemented with claude-sonnet-4-5 for planning capacity) reads $\mathcal{C}$ and produces a dependency-wired task graph.

#### 3.3.2 Specialization

Different cognitive approaches for different problems. The template type system defines eight functional roles (Table 2) orthogonally to domain categories, enabling role-based selection that decouples orchestration logic from template inventory.

**Table 2: Template Type Taxonomy**

| Type | Functional Role | Example Templates |
|------|----------------|-------------------|
| ARCHITECT | Evaluates options, designs solutions | Solution Architect, Technical Consultant |
| BUILDER | Implements specifications | Senior Software Developer |
| ANALYST | Derives insights from data | Business Analyst, Data Analyst, Marketing Strategist |
| REVIEWER | Validates against standards | QA Test Engineer, Security Analyst |
| OPERATOR | Manages execution and coordination | DevOps Engineer, Project Manager |
| DOCUMENTER | Produces human-readable artifacts | Technical Writer |
| ORCHESTRATOR | Invokes external services | MCP Service Orchestrator |
| GENERALIST | Fallback for multi-domain tasks | Universal Agent Template |

#### 3.3.3 Knowledge Transfer

Complete output from one specialist is injected into the next specialist's prompt without summarization. Section 3.5 describes the mechanism.

#### 3.3.4 Self-Evaluation

Every agent output includes a confidence score in $[0, 100]$. The Pipeline Harness uses these scores as quality gates, determining whether to accept, retry, or escalate.

#### 3.3.5 Persistence

The harness iterates until the work is complete or explicitly escalates. Bounded re-execution (maximum two retries per task) prevents runaway token consumption while ensuring the system does not abandon work prematurely. Section 3.6 details the completion loop.

#### 3.3.6 Context Awareness

All agent activity is grounded in $\mathcal{C}$, which carries customer identity, objective, solution scope, team structure, timeline, regional compliance frameworks, and historical execution records. Context is injected into every prompt via engine-owned sections §1-§5.

### 3.4 Template Type System

#### 3.4.1 Orthogonality of Category and Type

We define templates along two orthogonal dimensions:

- **Category** (domain): DEVELOPMENT, SECURITY, ANALYSIS, DEPLOYMENT, etc. — what domain the template works in.
- **TemplateType** (functional role): ARCHITECT, BUILDER, REVIEWER, etc. — how the template approaches work.

A Security Analyst is in the SECURITY category but is a REVIEWER type. A Solution Architect is in the DEVELOPMENT category but is an ARCHITECT type. This orthogonality enables the harness to select specialists by functional role ("I need a REVIEWER for this task") without coupling orchestration logic to specific template names. Adding a new template with `templateType: REVIEWER` makes it automatically available to the harness without changes to the harness prompt.

#### 3.4.2 Role Guidance Library

Each template defines a `defaultRole` that maps to a role-specific guidance entry. Guidance entries are 7-10 actionable bullets providing domain-specific instructions with exact tool names, common mistake callouts, and output expectations. Guidance is injected into the system prompt at execution time via placeholder resolution.

### 3.5 Automatic Context Chaining

#### 3.5.1 The Chain Mechanism

When a task has dependencies, the execution engine invokes the context chainer as a **pre-execution hook** before starting execution:

1. For each dependency task, the chainer reads the latest successful execution's `result.json` artifact.
2. It extracts `finalResponse` (complete LLM output), `confidenceScore`, and `qualityMetrics`.
3. It constructs a `chainedFrom` array and merges it into the current task's `inputContext`.
4. The execution engine renders this in prompt section §6 (Pipeline Context) with explicit instructions to build on prior work.

The agent never knows context chaining is happening — it simply finds the relevant context already in its prompt. This is invoked regardless of trigger source (MCP, API, or the harness itself), ensuring consistent behavior across entry paths.

#### 3.5.2 Structured Rendering

Rather than dumping raw JSON, the engine renders chained context as structured markdown:

```markdown
## Pipeline Context (from previous tasks)

### Previous Task: [title]
- Agent Role: [role]
- Confidence Score: [score]/100

**Output:**
[complete deliverable — no summarization]

**Use the above output to inform your work. Build on what was produced — do not repeat or re-derive it.**
```

This structured format both improves agent comprehension and explicitly prevents re-derivation of prior work.

### 3.6 Confidence-Gated Completion Loop

Every agent is instructed (via the template-independent §8 Output Requirements section) to end its output with a confidence score. The execution engine parses this via six regex patterns covering common output formats. Results are written to `result.json` as a structured `confidenceScore` field.

**Table 3: Completion Loop Gates**

| Confidence | Harness Action |
|-----------|---------------|
| $\geq 70$ | Accept, advance pipeline |
| $50{-}69$ | Re-execute once with feedback |
| $< 50$ | Escalate to human with context |
| Failed | Retry once, then escalate |

Maximum 2 re-executions per task. This bounded persistence prevents runaway token consumption while ensuring the system does not abandon work prematurely.

### 3.7 Dependency Enforcement and State Machine

The execution engine checks task dependencies before starting any execution. If any dependency is incomplete, execution is blocked with a clear error listing the blocker tasks. This prevents invalid pipeline states where downstream agents execute before their inputs are available.

The platform enforces a task status state machine with transitions $\text{OPEN} \to \text{IN\_PROGRESS} \to \text{COMPLETED}$ and $* \to \text{BLOCKED}$. Direct $\text{OPEN} \to \text{COMPLETED}$ transitions are forbidden and validated by `validateTaskStatusTransition()`. Both execution entry points (engine poller and streaming route) transition tasks through `IN_PROGRESS` at execution start, satisfying the state machine when the engine later marks tasks `COMPLETED`.

### 3.8 Artifact and Observability Architecture

Each successful execution produces two artifacts:

- **`result.json`** — Machine-readable. Contains `finalResponse` (complete LLM output), `confidenceScore`, `qualityMetrics` (tool success rate, turn counts, response length), and execution metadata.
- **`report.md`** — Human-readable. Contains only the LLM's deliverable text, cleaned of system metadata.

After artifact creation, the engine automatically posts a task comment containing the agent role, execution duration, tool call statistics, confidence score, and `fetch(id: "artifact-...")` commands for each artifact. This provides visibility across three surfaces: the GUI comment stream, MCP tool responses (for AI clients), and downstream agent prompts via context chaining.

### 3.9 Algorithm 1: The Harness Main Loop

```
Algorithm 1: Pipeline Harness Main Loop
────────────────────────────────────────────────────
Input:  High-level objective O; POV context C; template set T
Output: Deliverable D with confidence-scored trace

 1:  context  ← read_pov_details(C)
 2:  phase    ← select_phase(context, O)
 3:  stage    ← create_pipeline_stage(phase, O)
 4:  G        ← decompose_objective(O, context)    # typed task graph
 5:  for each v ∈ topological_order(G):
 6:      t    ← select_template(τ(v), T)           # by functional type
 7:      assign_template(v, t)
 8:      wire_dependencies(v, in_edges(v, G))
 9:  for each v ∈ topological_order(G):
10:      ctx  ← chain_dependency_context(v)        # pre-exec hook
11:      apply_chained_context(v, ctx)
12:      o, c ← execute_agent(v)                   # specialist runs
13:      if c ≥ 70:
14:          mark_completed(v, c)
15:      else if c ≥ 50 and retries(v) < 2:
16:          post_feedback(v, "improve: <gap>")
17:          retry_execute(v)                      # goto 12
18:      else:
19:          escalate_to_human(v, c, diagnostics)
20:          return partial(D)
21:  D ← aggregate_artifacts(terminal_nodes(G))
22:  post_summary_comment(harness_task, D, metrics)
23:  return D
```

The implementation enforces step 13 as a template-independent constraint via the §8 prompt section; steps 10-11 are a pre-execution hook invoked by the execution engine; step 6 uses fuzzy template-name matching with a type filter; step 4 is the meta-agent's LLM call constrained by the harness prompt (see Section 4.7).

### 3.10 Dual Mode Operation: CREATE and ORCHESTRATE

Algorithm 1 describes **CREATE mode**, where the harness decomposes an objective into new tasks. In practice, users often design pipeline structure themselves (in the GUI or via MCP) and want the harness to execute their structure rather than design its own. **ORCHESTRATE mode** handles this case.

**Mode auto-detection.** At execution start, the harness calls `project(action: "task.list", stageId: YOUR_STAGE_ID)` and filters out its own task ID. The remaining tasks are its *siblings*. The mode rule is simple:

- **Zero siblings** → CREATE mode (execute Algorithm 1)
- **One or more siblings** → ORCHESTRATE mode (Algorithm 2)

**Algorithm 2** replaces steps 1-8 of Algorithm 1 with sibling inspection:

```
Algorithm 2: ORCHESTRATE Mode
────────────────────────────────────────────────────
Input:  POV context C; stage with sibling tasks S = {s₁, ..., sₙ}
Output: Deliverable D with confidence-scored trace

 1:  for each s ∈ S:
 2:      τ(s)  ← infer_type_from_description(s.description)
 3:      t     ← select_template(τ(s), T)
 4:      assign_template(s, t)
 5:      deps  ← infer_deps(s.description, S)      # explicit refs OR
 6:                                                  # type hierarchy fallback
 7:      wire_dependencies(s, deps)
 8:  # Continue from step 9 of Algorithm 1
 9:  for each s ∈ topological_order(S):
10:      ctx  ← chain_dependency_context(s)
11:      apply_chained_context(s, ctx)
12:      o, c ← execute_agent(s)
13:      ...                                       # same as Algorithm 1
```

**Dependency inference** uses two signals in order of precedence:
1. **Explicit references in task descriptions** — if Task C says "using the vulnerability audit findings," the harness wires C→[task containing audit] specifically.
2. **Type hierarchy fallback** — when descriptions are vague: `ARCHITECT → BUILDER → REVIEWER → ANALYST → DOCUMENTER`. Parallel tasks of the same type run concurrently.

The type hierarchy is implemented at the **prompt level**, not in engine code. This design choice is intentional: the override case (description-based inference) is LLM reasoning that cannot be expressed as deterministic engine logic without full NLP, and two sources of truth would create maintenance burden. The risk is bounded because the template pins the model to claude-sonnet-4-5, and failure modes are obvious (no dependencies wired) rather than silent.

**Self-completion guard.** Both modes share a template-level rule: the harness must verify that all child tasks are in `COMPLETED` state before reporting success. If any sibling (ORCHESTRATE) or created task (CREATE) remains `OPEN` or `IN_PROGRESS` at the time the harness would report completion, the harness must instead (a) list completed and remaining tasks, (b) explain why execution stopped (token budget, rate limit, error), and (c) provide explicit `agent.execute` commands for the remaining tasks. This prevents false success reporting when budget exhaustion or rate limiting interrupts a run mid-execution.

**Empirical validation.** Experiment 6 (Section 5.9) validates ORCHESTRATE mode end-to-end: a 3-task pipeline designed by the user was orchestrated by the harness in 228 seconds with 100% completion, template inference accuracy 3/3, and correct linear dependency wiring via the type hierarchy.

---

## 4. System Design Decisions

This section documents the most significant architectural decisions made during implementation. Each decision was validated through production incidents, specialist review, or both. Decisions are ordered by when they became load-bearing.

### 4.1 Prompt Section Ownership

We distinguish two prompt layers with different ownership:

- **System prompt** — Template-owned. Contains role identity, specialization, role-specific tool workflows. Custom templates replace the Universal Template entirely.
- **User prompt** — Engine-owned. Contains eight sections (§1-§8) built fresh at each execution. Always present regardless of which template is assigned.

Cross-cutting instructions (confidence reporting, output format, character limits) belong in §8 of the user prompt, not the system prompt. This ensures instructions apply to all agents uniformly, even those with custom system prompts that would otherwise override them. We formalize this as the **Prompt Section Ownership Pattern**.

### 4.2 Dual Execution Path Parity

The platform supports two execution entry points: a polling-based engine for programmatic triggers and a streaming route for GUI-initiated executions. Both must produce identical artifacts, apply identical side effects, and maintain consistent status transitions. Any feature that modifies execution outcomes must be applied to both paths. Violation of this constraint creates silent output inconsistency between UI-triggered and MCP-triggered pipelines. All subsequent decisions in this section implicitly carry a dual-path obligation.

### 4.3 MCP Parameter Three-Layer Contract

Adding a new parameter to an MCP action requires updates at three layers:

1. **Tool schema** (`tool-schemas.js`) — for AI client discovery
2. **Validation schema** (`mcp-action-validation.ts`) — Zod action-specific schema
3. **Handler** (`task-create-handler.ts` etc.) — destructure and use

Zod's default behavior strips unknown fields. A parameter present in the tool schema and handler but absent from the validation schema is silently removed at the validation boundary. We formalize this as the **MCP Parameter Three-Layer Pattern** (Appendix D).

### 4.4 Transport Boundary Argument Coercion Defense

At MCP transport boundaries (stdio → SSE, HTTP → SSE), arguments can be silently coerced between object and string representations. We implement `ensureObject()` guards at all `callTool` sites and use spread-first parameter forwarding (`{...finalParameters, action, parameters: ...}`) to prevent user-controlled fields from overwriting framework fields.

### 4.5 Context Chaining as Pre-Execution Hook

Rather than exposing context chaining as a tool the agent must call, we implemented it as a **pre-execution hook** in the agent task service. This is invoked automatically before any agent execution begins, regardless of trigger source. The agent never knows context chaining is happening — it simply finds the relevant context already in its prompt.

This decision eliminated an entire class of coordination failures: in an earlier design where the agent had to explicitly fetch upstream context, omissions were common and context fidelity depended on prompt compliance. The pre-execution hook removes agent behavior from the critical path entirely.

### 4.6 Template Type as Orthogonal Dimension

We decoupled template type (functional role) from template category (domain), per Section 3.4. This enables the harness to select specialists by what they do rather than by name, decoupling orchestration logic from the template catalog. Adding a new template with `templateType: REVIEWER` makes it automatically available to the harness for tasks requiring review.

### 4.7 Configurable Tool Turn Limits

The agentic tool loop has a `MAX_TOOL_TURNS` constant that defaults to 30 but can be overridden per-template via metadata. The Pipeline Harness template sets this to 100 because orchestration requires more tool calls than single-task execution (task creation, template assignment, status checking, context retrieval, and comment posting across multiple child tasks). Execution timeouts scale with `MAX_TOOL_TURNS` via the formula $T_\text{exec} = 180\text{s} + 30\text{s} \cdot \text{MAX\_TOOL\_TURNS}$.

### 4.8 Confidence Instruction in User Prompt §8

Cross-cutting instructions that all agents must follow cannot live in the system prompt because custom templates replace the Universal Template entirely. We moved the confidence reporting instruction to user prompt §8 (Output Requirements), which is built by the execution engine and always present regardless of template. This is a direct application of Section 4.1.

### 4.9 Type-Based Template Auto-Assignment (`PIPELINE` Type)

The execution engine recognizes a dedicated `PIPELINE` value in the `TaskType` enum. When a task with `type: PIPELINE` is executed without an explicit template assignment, the engine automatically resolves the Pipeline Harness template by name and attaches it to the task before proceeding. This is implemented as a single pre-execution check in the MCP execute handler.

Two properties follow:

1. **Reduced orchestration friction**: Creating a harness task requires a single call (`task.create` with `type: PIPELINE`) and execute, instead of three calls (create, assign, execute).
2. **Type as semantic contract**: The `PIPELINE` type communicates orchestration intent at the data layer. Any future subsystem observing task types can reason about orchestrator tasks without introspecting templates or agent configurations.

We formalize this as the **Type-Based Auto-Assignment Pattern**. It is a narrow, targeted use of task type for behavioral dispatch — not a general mechanism for binding task types to templates. The Pipeline Harness is currently the only template auto-assigned this way.

### 4.10 TaskType Rationalization and the Native Enum Pattern

The `TaskType` Prisma enum originally contained 13 values including four browser-automation types and four MCP service sub-types. Static analysis revealed that no code paths branched on any specific value beyond the default `ACTION`; the enum functioned only as UI labels and as keys into a category-compatibility mapping. We rationalized the enum from 13 values to 7: `ACTION`, `DECISION`, `MILESTONE`, `APPROVAL`, `DOCUMENT`, `MCP_SERVICE`, and `PIPELINE`.

The rationalization exposed a related issue: a Zod validation schema used hardcoded `z.enum([...])` listing a subset of `TaskType` values rather than `z.nativeEnum(TaskType)`. Because Zod strips unknown fields, client requests with new enum values were silently rejected at the validation boundary. The fix — replacing `z.enum([...])` with `z.nativeEnum(TaskType)` — restored auto-synchronization between the Prisma schema and the validation layer. We formalize this as the **Native Enum Pattern**: Zod enums derived from Prisma enums must use `z.nativeEnum()` to prevent drift-induced silent failures.

### 4.11 Orphaned Execution Watchdog for Restart Tolerance

In a production test (Section 5.6 baseline), a deployment-triggered PM2 restart killed in-flight executions while they were running. The killed processes had no opportunity to transition their execution records to a terminal state, leaving zombie `RUNNING` records in the database with no corresponding live process. Downstream status checks reported "still running" indefinitely, and the in-memory OAuth token store was wiped by the restart, producing spurious "token expired" errors unrelated to the actual token TTL.

We implemented a two-layer **orphaned execution watchdog**:

1. **Startup cleanup** (once, at engine initialization): Any execution with `status = RUNNING` and `createdAt` older than 2 minutes is transitioned to `FAILED` atomically with its task's `executionStatus` field. At startup, any running execution is definitely orphaned — the current process has not started any work yet.
2. **Poll-cycle cleanup** (every 10 seconds): Any execution with `status ∈ \{PENDING, RUNNING\}` and `createdAt` older than 20 minutes is transitioned to `FAILED` atomically with its task's `executionStatus`. The 20-minute threshold is a safe upper bound on the maximum tool-loop timeout for the default template configuration.

Both cleanups use `prisma.$transaction` per the **Transaction Atomicity Pattern** (Appendix D), ensuring that execution state and task state cannot diverge. Integrity tests were updated to validate the new transaction blocks (27/27 passing).

### 4.12 Transactional Dependency Validation

A related production incident surfaced during the same test: the harness occasionally created tasks with `dependencyIds` pointing to sibling tasks that did not yet exist, producing a foreign-key constraint violation that aborted the enclosing transaction. The root cause was the harness creating tasks sequentially but declaring dependencies on future tasks in the same batch.

We introduced **pre-write dependency validation** in both `task-create-handler` and `task-update-handler`. Inside the enclosing `$transaction`, the handler first queries `tx.task.findMany({ where: { id: { in: dependencyIds } } })` to verify existence. IDs not found are filtered out with a warning log; the `createMany` proceeds with the valid subset. This transforms a hard failure (transaction abort) into graceful degradation (partial wiring plus a warning that can be diagnosed asynchronously).

### 4.13 Task Status State Machine Enforcement Across Paths

The platform enforces a task status state machine (Section 3.7). During Test A (Section 5.3), we observed tasks remaining in `OPEN` status even after successful execution, because raw engine updates bypassed the state machine validation. The fix transitions tasks from `OPEN` to `IN_PROGRESS` at the start of execution in both paths — engine poller and streaming route — satisfying the state machine constraint when the engine later marks tasks `COMPLETED`. This is a direct application of Section 4.2 (Dual Execution Path Parity).

### 4.14 Dual-Mode Operation and the Self-Completion Guard

Section 3.10 describes CREATE and ORCHESTRATE modes. Two design decisions underpin the implementation:

**Mode detection lives in the prompt, not the engine.** The harness detects its mode by calling `task.list` with its own stage ID and filtering out its own task ID. This is prompt-level logic because it depends on reasoning about sibling semantics (what counts as "related work to orchestrate"), which is inherently LLM-level. Pushing mode detection into engine code would require either hard-coding stage relationships (fragile) or NLP (overkill).

**Self-completion is enforced at the prompt level via a dedicated rule.** The template contains an explicit "Never Self-Complete With Unfinished Children" section that mandates verification of all child task statuses before reporting success. An earlier test (Experiment 6 predecessor) revealed that a rate-limited harness wrote a celebratory summary despite having left 3 of 4 children `OPEN`. The fix was a template-level rule, not an engine check, because the engine cannot distinguish "harness chose to report partial results as a graceful degradation" from "harness failed to notice unfinished work." The prompt provides the distinction.

### 4.15 Two Execution Paths: Embedded TypeScript and MCP JavaScript

The same MCP actions are served through two different code paths:

**Path 1: Embedded (TypeScript, in-process).** Used by the execution engine when running harness and child specialists. Flow: `agentExecutionEngine.ts` → `mcpServerManager.executeToolOnServer()` → in-process TypeScript handlers under `lib/mcp/tasks/action/handlers/`. No HTTP, no rate limiting, lean Prisma queries with POV access validation. User JWT passed in-memory.

**Path 2: MCP Server (JavaScript entry, TypeScript handlers via ts-node).** Used by Claude Desktop, ChatGPT, Gemini, and CLI clients. Flow: MCP HTTP request → `mcp-server-http-clean.js` → `sdk-native-advanced-tools.js` dispatcher → JS handlers under `lib/mcp/server/tools/advanced/` → **in-process `router-bridge.js` → `tasks-action-router.ts`** (Tier 1, direct Prisma; the primary path since Phase 2 proper of the dual TS/JS drift eradication workstream, 2026-04-08). A residual Tier 2 HTTP fallback to `apiClient.post('/api/mcp/tasks/action')` exists but should not fire in practice — any `tier:'http-fallback'` pino log entry indicates a Bug Class 73 regression. OAuth/API key authentication. Rich handlers with fuzzy template-name matching, parameter normalization, friendly error messages, and Claude Desktop output formatting. (Historical note: before Phase 2 proper, the bridge `require()` was wrapped in a try/catch that silently fell back to HTTP in the MCP worker because `mcp-server-http-clean.js` did not register ts-node; this masked weeks of `.ts` edits — see Bug Class 73 in `.claude/knowledge/domain/mcp/bug-class-registry.md` and §4.7 stress test follow-up in `WHITEPAPER-ARXIV-v3.md`.)

**Why two paths exist.** The MCP server runs as a separate PM2 process with pure JavaScript (no ts-node in production for latency reasons). It cannot import TypeScript handlers directly, so it has its own JavaScript handler layer. The JS handlers add MCP protocol concerns (human-facing error messages, fuzzy matching) while the TS handlers remain lean because agents send exact parameters and reason over raw errors themselves.

**Why this matters for reproducibility.** Anyone reading the codebase may see two files with similar names — e.g., `lib/mcp/tasks/action/handlers/agent/agent-results-handler.ts` and `lib/mcp/server/tools/advanced/agent-results-handler.js` — and assume they are duplicates. They are not: they serve different paths and have different responsibilities. We formalize the distinction so future contributors do not remove one under the assumption that it is redundant.

### 4.16 Fire-and-Forget Execution and Parallel Polling

The `agent.execute` handler creates a `PENDING` execution record and fires `agentExecutionEngine.executeById()` **without `await`**, then returns immediately with `{ status: "RUNNING", executionId }`. The LLM call runs in the background. This is necessary because MCP HTTP has a 30-second request timeout while LLM executions can take 30-120 seconds.

**Parallel polling.** The execution engine's polling loop runs every 10 seconds, finds `PENDING` executions (up to 5 per batch), and processes them via `Promise.allSettled` — in **parallel**. Previously the loop used `for...of await`, processing serially at one execution per 30 seconds. The change to parallel execution yields a theoretical ~5x throughput improvement for the polling path. We have not directly measured this speedup under load because our single-client stress tests serialize at the MCP JavaScript handler (see the "Observed nuance" paragraph below), and the multi-client agent-team stress test (Experiment 7) exercises read/write MCP traffic rather than concurrent `agent.execute` submissions. Directly measuring the parallel speedup requires either multiple independent MCP clients issuing concurrent `agent.execute` calls or a synthetic test that creates `PENDING` records directly via the database. Both are straightforward follow-ups.

**CAS (compare-and-swap) claim.** Both paths (direct `executeById` and polling loop) start by atomically transitioning `PENDING → RUNNING` via `prisma.agentExecution.updateMany({ where: { id, status: 'PENDING' }})`. Only the winner of the CAS sees `count === 1` and proceeds. This prevents double-execution when both paths race to pick up the same execution.

**Per-execution error boundary.** The parallel change required moving the safety-net error handling from an outer `try/catch` (which would short-circuit the whole batch on the first failure) into a per-execution wrapper inside the `Promise.allSettled` callback. Each execution's failure is now independent: one crashed agent does not block its siblings from running, and each failure atomically transitions its own execution record to `FAILED` with an error artifact.

**Database safety under parallelism.** A specialist review (Section 5.10 methodology) validated that 5 parallel executions consume at most 33% of the 15-connection Prisma pool (raised to 25 in Section 4.17). The LLM call itself holds no database connection — connections are released during the 10-60 second HTTP wait to Anthropic, and re-acquired only for brief CAS and completion transactions (~10-50ms each).

**Observed nuance.** Our stress test of the parallel path (Section 5.10, 5-task experiment) did not show parallelism as expected because the MCP JavaScript handler (Path 2) auto-polls for results before returning to the caller — serializing a single MCP client's sequential calls even though the server-side execution engine is parallel-capable. The parallelism manifests when multiple independent MCP clients submit executions concurrently, not when one client fires five `agent.execute` calls in a row.

### 4.17 Scalability Architecture for 100 Concurrent Users

A specialist review at the 100-concurrent-user mark (n=100 simulated users for a 1000-user company) identified five scaling concerns, each addressed in v2.1:

**TRUSTED_PROXY for per-IP rate limiting.** The enhanced rate limiter at `middleware/rate-limiter-enhanced.ts` uses `x-forwarded-for` for client identification only when the `TRUSTED_PROXY` environment variable is set. Without it, all users collapse to a single `'direct'` bucket and share one rate limit — a critical correctness bug for multi-user operation. We set `TRUSTED_PROXY=true` in the `paichart-web` PM2 environment block. The underlying code reads:

```typescript
if (process.env.TRUSTED_PROXY) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
}
return 'direct';  // fallback for local/direct connections
```

**Connection pool sizing.** The Prisma pool was 15 connections (set in `lib/prisma.ts`). We raised it to 25 for burst headroom at 100 users (max PostgreSQL connections is 100). We also removed an unconditional `pgbouncer=true` hint that was disabling Prisma prepared statements despite PgBouncer not being installed — a ~10-15% query performance loss for no benefit.

**Rate limiter rationalization.** Three separate rate limiters were analyzed and sized:
- `writeOperationLimiter` in `lib/utils/rate-limiter.ts` — raised from 30/min to 300/min (the MCP tasks/action endpoint handles both reads and writes through a single POST route, so polling calls count alongside actual writes)
- MCP HTTP middleware in `lib/auth/mcp-http-middleware.ts` — raised from 100/min to 300/min via `MCP_RATE_LIMIT_MAX_REQUESTS` env var
- `writeOperationLimiter` now also includes pino `warn`-level logging of every 429 response with `{identifier, remaining, retryAfterSec}` so rate limit events are observable rather than silent

**In-memory Map enforcement.** The `TaskSubscriptionService` defined `MAX_TASKS=5000`, `MAX_USERS=2000`, and `MAX_SUBSCRIPTIONS_PER_TASK=100` constants but never enforced them in the `subscribe()` method. Under sustained load, subscription Maps could grow unbounded. We added explicit size checks that throw an error when limits are reached, preventing memory exhaustion during long operational windows.

**Web search tool hygiene.** An audit of the Anthropic SDK provider revealed that web search was being added to every agent execution `"for testing"` regardless of whether the `webSearch` option was configured. We removed the unconditional injection so that web search is now added only when explicitly enabled via template configuration. This cuts tool definition overhead from every execution and eliminates a class of unexpected LLM behaviors.

We partially validated these fixes via a concurrency stress test (Section 5.10) that produced 100/100 score with zero failures, zero degradation, and stable memory footprint across 5 workload patterns at ~20 simulated concurrent users. Note that the stress test exercised read/write MCP traffic — it did not directly simulate 100 users, nor did it exercise the execution engine's parallel `Promise.allSettled` path since all teammates issued read/write actions rather than concurrent `agent.execute` calls. Architectural fitness for 100 users is inferred from the specialist review combined with this partial validation.

### 4.18 POV Access Validation Coverage

Every MCP handler enforces POV access validation via the shared `validatePOVAccess(user, pov, { throwOnDeny: true })` utility. During routine audit, three specialists (auth-permissions, sec-ops, mcp-integration) independently confirmed a **MEDIUM-HIGH severity gap**: `agent-results-handler.ts` had an inline `if (user.role === 'DEMO_USER')` check that restricted only demo users, allowing any authenticated non-demo user to read agent execution results — including full artifact content — from any POV by supplying a foreign task ID.

The fix replaced the inline DEMO_USER-only check with the standard `validatePOVAccess` call, matching the sibling `agent-status-handler.ts` pattern. The shared utility handles owner, team member, demo, and admin cases uniformly across all roles. Following the fix, we migrated both `agent-status-handler.ts` and `agent-results-handler.ts` from the legacy `lib/mcp/handlers/` directory to the standard `lib/mcp/tasks/action/handlers/agent/` location, consolidating all agent handlers in one place.

**Lesson.** Inline access checks are a known anti-pattern: they drift from the canonical implementation over time, they are not caught by integration tests that use admin credentials, and they accumulate into the kind of security debt that is easy to miss and hard to audit. The shared `validatePOVAccess` utility is the single point of enforcement; all handlers must call it. As a follow-up, a grep-based integrity test that flags any MCP handler file missing a `validatePOVAccess` invocation (with `pov.create` allowlisted because there is no pre-existing POV to validate against) would convert the current audit-driven detection into a continuously-enforced invariant. This test is not yet implemented and is tracked as a future item.

### 4.19 Compliance with Anthropic MCP Security Best Practices

Anthropic's MCP Security Best Practices specification ([modelcontextprotocol.io/specification/draft/basic/security_best_practices](https://modelcontextprotocol.io/specification/draft/basic/security_best_practices)) enumerates a set of attack vectors (confused deputy, token passthrough, SSRF, session hijacking, local compromise, scope inflation) with normative mitigations marked **MUST** and **SHOULD**. Because pAIchart is a remote MCP server operating in a production multi-user context, most of these apply directly. We document compliance per attack vector rather than claim blanket "MCP-compliant" status.

**Confused deputy protection (MUST).** pAIchart's OAuth proxy implements per-client consent stored server-side keyed by `client_id`, with the consent check running *before* any third-party authorization flow. State parameters are cryptographically generated, stored server-side after explicit consent approval (not before), validated at the callback with exact string matching, and single-use with short expiration. Redirect URIs are validated against registered values with exact string matching (no wildcards). Consent cookies use the `__Host-` prefix with `Secure`, `HttpOnly`, `SameSite=Lax`, and are bound to specific `client_id` rather than a global "user has consented" flag.

**Token passthrough prohibition (MUST NOT).** pAIchart's MCP server mints its own access tokens bound to its own audience (`paichart-api` or per-client audience values) and does not accept tokens issued for other services. The JWT validation layer checks the `aud` claim against expected values and rejects tokens that do not match. Token audience validation is load-bearing — we cite it in Section 4.18 as part of the broader POV access coverage story. We do not forward external tokens to downstream services; each downstream call (to Anthropic, OAuth providers, external MCP services) uses credentials owned by the platform, not the user.

**SSRF protection (SHOULD, remote-client variant).** pAIchart is primarily a remote MCP *server*, so the client-side SSRF risks in the specification (OAuth metadata discovery fetches, redirect chains, cloud metadata endpoints) apply to clients connecting *to* us rather than to our outbound behavior. For the limited cases where our platform acts as a client (MCP Hub service discovery, external OAuth provider callbacks, LLM API calls), outbound traffic is HTTPS-only, targets a small allowlist of known endpoints, and does not accept arbitrary URLs from user-controlled input. The SSRF attack surface in an LLM-orchestration platform is dominated by tool call patterns rather than OAuth discovery, and our tool call layer is constrained to registered MCP tools with schema-validated parameters (Section 4.3).

**Session hijacking protection (MUST).** Session IDs are generated via `crypto.randomUUID()` and bound to user-specific information — the `user_id` is derived from the JWT token, not provided by the client. MCP servers are instructed to verify all inbound requests and not to use sessions for authentication. All API routes enforce JWT validation via the `requireAuth` middleware; session state is auxiliary, not authoritative. The `agentExecutionEngine` orphan watchdog (Section 4.11) also protects against stale session cleanup across PM2 restarts.

**Scope minimization (SHOULD).** pAIchart implements a least-privilege default through role-based access control. The `DEMO_USER` role (assigned to new GitHub OAuth users by default) is scoped to demo POVs and a personal sandbox. Standard `USER` role requires out-of-band verification by the platform operator. `ADMIN` role is reserved for platform administration. Scopes are per-role rather than per-tool, which is a pragmatic simplification relative to the specification's progressive-elevation model — but aligned with the spirit of minimization (new users cannot accidentally access production POVs, and incidental token compromise for a `DEMO_USER` has a blast radius of demo data only).

**Local MCP server compromise (N/A).** pAIchart is a remote HTTP MCP server, not a local stdio binary. Users never download and execute our code; they connect to a hosted endpoint. The specification's local-compromise mitigations (sandboxing, startup command review, path restriction) apply to local MCP server authors, not to us.

**Audit log.** Every successful and failed authentication event is logged to `/var/log/paichart/oauth-audit.log` with structured pino output including `userId`, `clientId`, `action`, and `result`. OAuth failures, token validation failures, and POV access denials all emit structured log events suitable for downstream monitoring. Rate limit events are logged per Section 4.17.

**What we do not claim.** We do not claim comprehensive security certification (SOC 2, ISO 27001, FedRAMP). We do not claim formal verification of the access control layer. We claim conformance to the MUST and SHOULD items in the MCP security specification that apply to remote multi-user server deployments, with the caveats noted per attack vector above. Inline access checks in `agent-results-handler.ts` (Section 4.18) were a spec-compliance gap we discovered and closed during this work — the fact that the gap existed for any period illustrates the need for continuous audit, not a lapse in intent.

---

## 5. Production Experiments

### 5.1 Experimental Methodology

All experiments were conducted on production infrastructure (Digital Ocean Next.js 14 deployment with PostgreSQL 16) against live POV records. Each experiment begins with a stated objective and a specific POV context. Success criteria are task creation, specialist assignment, execution completion, and confidence score parsing. We do not use simulated or synthetic data; all POV records represent realistic customer engagements (some marked as demo, but with realistic domain content). Observability is via pino-structured server logs, execution-level metrics from the agent execution engine, and MCP tool responses.

Experiments progress from manual proofs-of-concept (Sections 5.2-5.3) through full autonomous runs (Sections 5.4-5.6), culminating in a fault-recovery validation (Section 5.6) following a mid-pipeline server restart.

### 5.2 Experiment 1: Manual Pipeline Proof of Concept (Phase 0)

We validated the core pipeline concept by manually executing a three-task pipeline (ARCHITECT → REVIEWER → ANALYST) on production infrastructure without automation. The test revealed six distinct friction points:

1. Inability to set `inputContext` via MCP due to validation constraints
2. Inconsistent confidence score reporting in prose outputs
3. Manual context chaining requiring database-level operations
4. Only metadata passed between tasks, not complete outputs
5. MCP timeout for long-running executions
6. No dependency enforcement at execution time

Each friction point informed a specific architectural decision in subsequent phases — respectively addressed by Sections 4.3, 4.8, 4.5, 3.5, 4.7, and 3.7.

### 5.3 Experiment 2: Automatic Context Chaining (Phase 1)

We implemented the context chainer as a pre-execution hook. A two-task pipeline (ARCHITECT → ANALYST) was created with explicit dependencies via MCP. Upon executing the ANALYST task, logs confirmed the chainer:

- Detected the dependency
- Read 26,048 characters of the architect's `finalResponse`
- Injected it into the analyst's `inputContext`
- Rendered it as Pipeline Context in §6

Zero manual intervention was required. The analyst produced a business case that explicitly referenced and built upon the architect's framework. This validated the pre-execution hook approach (Section 4.5).

### 5.4 Experiment 3: Autonomous Pipeline Harness — Initial Run (Test A)

We implemented the Pipeline Harness as a meta-agent template using claude-sonnet-4-5 with an expanded tool turn limit of 100. The harness was given the objective: "Assess cloud security posture and produce remediation roadmap for Demo Financial Corp."

**Execution trace** (178 seconds, 22 tool calls, confidence 88/100):

1. Called `project(action: "pov.details")` to understand the POV
2. Created 5 child tasks in the appropriate phase
3. Assigned specialist templates matching each task's type
4. Wired explicit dependencies
5. Executed the first task (Solution Architect) successfully
6. Reported pipeline plan as a structured task comment
7. Hit its execution budget before completing remaining tasks

The remaining tasks were fully created, assigned, and dependency-wired, ready for execution. This experiment validated the full harness loop for the first time but exposed the 5.10 fragility — a plan-to-execute transition requiring prompt hardening.

### 5.5 Experiment 4: Emergent Topology — Parallel and Cross-Phase (Test B)

A subsequent run on a clean POV ("Assess cloud migration readiness for Pipeline Test Corp", Australian customer context) produced two distinct emergent behaviors.

**Emergent Behavior 1: Non-linear dependency graph.** The meta-agent produced a graph with parallel roots and a synthesis fan-in:

```
Tasks 1, 2, 3 → parallel (no inter-dependencies)
    ↓
Task 4 → depends on Tasks 1, 2, 3 (synthesis)
Task 5 → depends on Tasks 1, 3 (TCO + architecture)
    ↓
Task 6 → depends on all predecessors (executive report)
```

This topology was not instructed. The harness's decomposition prompt specifies only that dependencies should be explicit; it does not describe parallel, conditional, or multi-predecessor graphs. The meta-agent independently reasoned about task independence and designed the optimal dependency structure.

**Emergent Behavior 2: Cross-phase stage distribution.** Rather than placing all pipeline tasks in a single stage, the harness created three new stages across two phases of the POV:

```
Phase: Build and Deploy
  ├── Stage: Assessment Workstreams (3 parallel tasks)
  │   ├── Infrastructure & Workload Assessment     [ARCHITECT]
  │   ├── Security & Compliance Baseline (AU)      [REVIEWER]
  │   └── Operational Maturity Evaluation          [ANALYST]
  └── Stage: Strategy and Analysis (2 tasks)
      ├── Migration Strategy & Phasing             [ARCHITECT]
      │   ↑ depends on all 3 workstream tasks
      └── Cost-Benefit & ROI Analysis              [ANALYST]
          ↑ depends on Strategy

Phase: Assessment and Validation
  └── Stage: Final Deliverables (1 task)
      └── Executive Recommendation Report          [DOCUMENTER]
          ↑ depends on Strategy + Cost-Benefit
```

Three findings from this run:

1. **Phase-aware decomposition**: The harness correctly mapped task categories to POV lifecycle phases (assessments in Execution, synthesis in Review) without being told which phase to use for which purpose.
2. **Regional context propagation**: The POV specified Australia. The Security task description explicitly references ASD Essential Eight, APRA CPS 234, and the Privacy Act 1988 — compliance frameworks specific to Australian financial services. This was emergent from context; the harness prompt does not enumerate regional frameworks.
3. **PIPELINE-type auto-assignment validated end-to-end**: The harness task was created with `type: PIPELINE` and no template; the execution engine resolved and attached Pipeline Harness automatically (Section 4.9).

**Partial execution observation.** This run also exposed the plan-to-execute fragility: the harness completed Phase A (planning, 127 seconds, 25+ tool calls) and produced a summary without executing child tasks. Prompt v3 strengthened the transition with explicit self-check instructions and a "planning without execution is a failure" directive.

### 5.6 Experiment 5: Full Autonomous Pipeline with Fault Recovery (Test C)

The final experiment tested the prompt v3 execution follow-through fix *and* the orphaned-execution watchdog and transactional dependency validation introduced in Sections 4.11-4.12. The setup was unusual: during Experiment 4's predecessor run (a "Test A re-run" on Demo Financial Corp), a production deployment restart killed both the harness and its in-flight child execution mid-stream. This left two zombie `RUNNING` execution records in the database — an unintended but valuable fault-recovery test case.

Following deployment of the bug fixes:

- **Startup watchdog execution confirmed.** Server logs show `"orphanedCount":2,"msg":"Cleaned up orphaned RUNNING executions on startup"` immediately after engine initialization.
- **Zombie records properly terminated.** Both pre-existing zombie executions were transitioned to `FAILED` with correct `endTime` stamps, and their tasks' `executionStatus` fields were reset. A follow-up query confirmed no residual `RUNNING` state.

We then ran a new pipeline on the same POV with the objective: "Assess regulatory compliance readiness" for Demo Financial Corp.

**Results.**

| Metric | Value |
|--------|-------|
| Total harness duration | **488 seconds (~8.1 minutes)** |
| Tasks created | 6 |
| Tasks executed | 6 |
| Tasks completed | **6/6 (100%)** |
| Harness final status | SUCCESS |
| Report artifact size | 94,831 characters |
| Result artifact size | 4,124,724 characters |
| Dependency FK errors | 0 |
| Child execution confidence range | 78-92 |

**Pipeline topology (linear chain):**

```
1. Compliance Posture Baseline (REVIEWER)
    ↓
2. Gap Analysis & Risk Scoring (REVIEWER)
    ↓
3. ROI & Cost-Benefit Analysis (ANALYST)
    ↓
4. Technical Remediation Roadmap (ARCHITECT)
    ↓
5. Findings Report (DOCUMENTER)
    ↓
6. Implementation Timeline (OPERATOR)
```

**Output quality.** Task 2 produced detailed SOX, PCI-DSS, and CCPA gap tables with risk scores (8 Critical / 10 High / 6 Medium findings), a three-phase remediation roadmap with effort and cost estimates ($500K-$750K over 18-26 weeks), and a self-assessed confidence of 78/100. The agent noted its own limitation — "confidence limited by lack of actual system access for detailed control testing" — an example of honest self-evaluation via the confidence instrument.

**Three distinct fixes validated in one run.**

1. **Orphaned execution watchdog (Section 4.11)** — two zombie records cleaned on startup, logged with explicit orphan count.
2. **Transactional dependency validation (Section 4.12)** — zero FK constraint violations (the harness created tasks in valid order; if any had referenced future tasks, the validation would have degraded gracefully).
3. **Prompt v3 execution follow-through** — the harness executed all 6 children rather than stopping at planning, confirming the self-check gate works.

### 5.7 Emergent Behavior Analysis

Across the five experiments we observed three categories of emergent behavior not explicitly prompted:

1. **Parallel topology design** (Experiment 4): The meta-agent reasoned about task independence and produced non-linear dependency graphs with multi-predecessor synthesis tasks.
2. **Phase-aware decomposition** (Experiment 4): The meta-agent mapped task kinds to POV lifecycle phases without explicit phase-to-task-type rules.
3. **Regional framework propagation** (Experiment 4): Customer country context triggered application of region-specific compliance frameworks (ASD Essential Eight, APRA CPS 234) without explicit framework enumeration in the prompt.

These observations suggest that meta-agent prompt engineering should favor principles and constraints over explicit pattern prescriptions. See Section 6.2 for further discussion.

### 5.9 Experiment 6: Orchestrate Mode Full Completion (Test G)

This experiment validates ORCHESTRATE mode (Section 3.10) end-to-end on production infrastructure. The setup inverts the pattern of earlier experiments: instead of providing an objective and letting the harness decompose it, we pre-create the pipeline structure and let the harness assign specialists and execute.

**Setup.** On Pipeline Test Corp (clean POV, Australian customer), we created a new stage "Test G — Full Orchestrate Verification" containing three work tasks authored manually via MCP:

1. "Design data migration strategy" — description references Australian Privacy Act, data classification tiers, sequencing plan (implies ARCHITECT)
2. "Audit data migration risks and compliance" — description references APRA CPS 234 and risk register (implies REVIEWER)
3. "Produce data migration executive briefing" — description references CTO-ready briefing with timeline and investment (implies DOCUMENTER)

We then added a fourth task with `type: PIPELINE` and the description "Orchestrate the data migration assessment pipeline: read sibling tasks, assign specialist templates, wire dependencies, and execute all tasks to completion." PIPELINE-type auto-assignment attached the Pipeline Harness template (Section 4.9).

**Execution trace** (228 seconds wall clock, 100% completion):

1. **Mode detection**: the harness called `task.list` with its own stage ID, filtered its own ID, found 3 siblings, and reported `Mode: ORCHESTRATE. Found 3 sibling tasks.` via a task comment.
2. **Template inference**: parsing each sibling's description, the harness inferred and assigned `Solution Architect`, `Security Analyst`, and `Technical Writer` respectively. Accuracy: 3/3.
3. **Dependency wiring**: the harness used explicit description references (Task 3 said "Using the data migration architecture") combined with the type hierarchy fallback to wire a linear chain: `Task1 → Task2 → Task3`. Accuracy: 3/3.
4. **Sequential execution**: the harness executed tasks in topological order via `agent.execute`, polled each via `agent.status`, retrieved results via `agent.results`, and marked each complete via `task.complete` with the parsed confidence score.
5. **Context chaining verification**: Task 2's prompt context included Task 1's complete architecture output; Task 3's context included both Task 1 and Task 2. Verified via logs.
6. **Self-completion guard**: after all 3 siblings were marked COMPLETED, the harness posted a summary comment and marked its own task COMPLETED.

**Results.** 4/4 tasks completed (3 siblings + harness). Total pipeline duration: 228 seconds. Zero manual intervention. Zero dependency wiring failures. Template inference accuracy: 3/3 (100%). Mode detection: correct. Self-completion guard: satisfied (harness verified all siblings before reporting).

**Significance.** Experiment 6 demonstrates that the harness can operate as an executor of user-designed pipelines, not only as a planner-executor. This is important for two reasons:

1. **User trust and agency**: users who want to design their own pipeline structure (perhaps to match an internal process or compliance requirement) can do so in the GUI and hand execution to the harness. They retain control over structure while gaining automation of execution.
2. **Gradual autonomy adoption**: an organization rolling out the harness can start in ORCHESTRATE mode (existing tasks, harness executes) before advancing to CREATE mode (harness designs and executes). The learning curve is shorter.

**A predecessor failure worth documenting.** An earlier Test F run exposed the self-completion bug (Section 4.14): the harness wrote a celebratory success summary despite rate-limit-induced failures on 3 of 4 children. The fix — a prompt-level "Never Self-Complete With Unfinished Children" rule — was validated in Experiment 6 where all 4 tasks genuinely completed. The template rule is a response to a specific production failure mode, not a hypothetical concern.

### 5.10 Experiment 7: Concurrency Stress Test (Agent Teams)

This experiment tests the platform's concurrency behavior under 20 simulated concurrent users across 5 distinct workload patterns. The test uses Claude Code's experimental agent teams feature to spawn 5 independent Claude Code instances (teammates), each running 4 rounds of parallel MCP tool calls against the production MCP server.

**Methodology.** Each teammate operates as an independent authenticated MCP client with its own session, context, and connection pool slot. The five workload patterns are:

1. **Reader** — 4 rounds × 4 parallel reads (`pov.list`, `pov.details`, `task.list`)
2. **Writer** — 4 rounds × create + (update ‖ comment ‖ context) + complete
3. **Hub Operator** — 4 rounds × parallel (`services.discover`, `services.health`, `registry.list`, `list_prompts`) + `workflow.list`
4. **Searcher** — 4 rounds × 2 parallel searches + 2 parallel fetches with round-trip title consistency checking
5. **Chaos Agent** — 4 rounds × 6 parallel mixed operations (`pov.list`, `pov.details`, `task.list`, `search`, `services.discover`, `template.list`)

At peak load, all 5 teammates fire their workload in parallel, creating 5+ concurrent MCP connections with bursts of ~20-30 parallel tool calls. Total ~96 MCP operations across the full test.

**Baseline (Run 1, 2026-03-30).** Score: 100/100. All 100 calls succeeded. Zero concurrency issues. Server-side metrics: heap +0 MB, error rate delta 0, PG max utilization 21%.

**Post-scalability-fix run (Run 2, 2026-04-06).** After deploying the Section 4.17 changes (connection pool 15→25, rate limiters 30→300/min, TRUSTED_PROXY, Map limit enforcement, web search hygiene, pino logging of rate limit events), we re-ran the stress test to validate that the changes did not introduce regressions and that the pool/rate limits operate correctly.

**Results (Run 2).** Score: **100/100**.

| Teammate | Calls | Failures | Degradation |
|----------|-------|----------|-------------|
| Reader | 16/16 | 0 | None |
| Writer | 20/20 | 0 | None |
| Hub Operator | 20/20 | 0 | None |
| Searcher | 16/16 | 0 | None |
| Chaos Agent | 24/24 | 0 | None |
| **TOTAL** | **96/96** | **0** | **None** |

**Server-side metrics (Run 2).**

| Metric | Pre | Post | Verdict |
|--------|-----|------|---------|
| Web heap memory | 59 MB | 59 MB | Stable (GC reclaimed during load) |
| MCP process memory | 244 MB | 321 MB | +77 MB (within 1 GB restart threshold) |
| PG active connections | 1 | 1 | Stable |
| PG idle connections | 17 | 24 | Pool warming to new limit (25) |
| PG total / max | 18/100 | 25/100 | Healthy (25% utilization) |
| PM2 restarts | 0 | 0 | No instability |
| Rate limit 429s | 0 | 0 | None hit |
| Real-time heap samples (30 × 10s) | Flat | Flat | Zero spikes |

**Cross-tool consistency observations.**

- Reader detected Writer's concurrent activity mid-test (task count 52→53 between rounds) — evidence of correct cross-teammate visibility without data corruption.
- Searcher achieved 8/8 round-trip title matches (search title == fetch title) — no race conditions between search indexing and result retrieval.
- Chaos Agent observed stable template count (17), service count (11), and monotonically-increasing cache age (8396 → 42297 ms) across 4 rounds — single shared cache with no eviction under load.
- Hub Operator observed cache hit rate climbing 50% → 85.7% over 4 rounds — LRU cache warming behavior as designed.
- Writer's terminal-status guard correctly rejected a COMPLETED → IN_PROGRESS transition attempt — state machine enforcement (Section 4.13) validated under concurrent write pressure.

**Significance.** Run 2's 100/100 score validates that the scalability fixes (Section 4.17) did not introduce regressions and that the raised limits provide comfortable headroom. The test was the first cross-tool concurrent validation of the entire platform — not just the harness, but the shared infrastructure (connection pool, rate limiters, caches, event emitter, session management) that all harness runs depend on. Stability under this workload was a prerequisite for deploying the harness to customers with >1 concurrent user.

**Complementary observation from a separate parallel-execution test.** We also ran a targeted 5-task parallel execution experiment (five Haiku-model specialist tasks fired simultaneously via MCP) to directly measure the impact of the `Promise.allSettled` fix (Section 4.16). The expected outcome was ~10 seconds (all 5 running in parallel). The observed outcome was ~56 seconds (5 × ~10 seconds serialized). Investigation revealed the cause: the MCP JavaScript handler (Path 2 in Section 4.15) auto-polls for execution results before returning to the caller, serializing a single MCP client's sequential calls even though the server-side execution engine is parallel-capable. True parallelism manifests when independent MCP clients submit executions concurrently — which is exactly the scenario tested by the agent-teams stress test above, where 5 teammates produced correct concurrent behavior.

**Peak CPU observation.** During the single-client 5-task test, web server CPU spiked to 28.2% on a single execution (LLM response JSON parsing and artifact creation), then returned to baseline within 5 seconds. This is consistent with bursty response-processing workloads and well within a 2-vCPU production droplet's capacity. Sustained load would require either more vCPUs or moving to PM2 cluster mode (identified as P2 in the scalability review; deferred until operational demand justifies it).

### 5.11 Production Metrics Summary

**Table 4: Production Metrics Across All Experiments**

| Metric | Value |
|--------|-------|
| Pipeline decomposition time | ~30 seconds |
| Single specialist execution (median) | 33-47 seconds |
| Full 4-task pipeline (Experiment 3, Test A) | 178 seconds (partial execution; prompt limit) |
| 6-task plan + wiring (Experiment 4, Test B) | 127 seconds (planning only) |
| **Full 6-task CREATE pipeline (Experiment 5, Test C)** | **488 seconds, 100% completion** |
| **Full 3-task ORCHESTRATE pipeline (Experiment 6, Test G)** | **228 seconds, 100% completion** |
| Context chaining success | 100% of runs |
| Dependency enforcement success | 100% of runs |
| Confidence score parse success | 100% of recent runs |
| Mode auto-detection | 100% of runs (Experiment 6) |
| Template inference accuracy (ORCHESTRATE) | 100% (3/3 in Experiment 6) |
| PIPELINE-type auto-assignment | Verified (Experiments 4, 5, 6) |
| Cross-phase stage creation | Verified (Experiment 4) |
| Orphaned execution cleanup | Verified (Experiment 5 startup) |
| Self-completion guard | Verified (Experiment 6) |
| Concurrency stress test score | 100/100 (Experiment 7, Runs 1 and 2) |
| Concurrent MCP calls (Experiment 7) | 96/96 successful, zero degradation |
| Template types | 8 |
| Task types (post-rationalization) | 7 (was 13) |
| Active templates | 17 |
| Documented production patterns | 52 |

---

## 6. Discussion

### 6.1 The Orchestration Layer Thesis

The models will continue to improve at individual tasks. General intelligence, however, requires more than a capable base model — it requires an **orchestration layer** that decides what to do, who should do it, how knowledge flows, and whether the result is good enough. The Pipeline Harness is an instantiation of that orchestration layer for a specific domain (PoV delivery).

We hypothesize that the architectural patterns documented here generalize to other domains where structured, multi-step, customer-facing outcomes must be delivered autonomously. We leave empirical validation of this hypothesis to future work; however, the decoupling of template type from category (Section 4.6), the domain-agnostic context chaining mechanism (Section 3.5), and the general confidence-gating framework (Section 3.6) are intentionally domain-independent.

### 6.2 Emergent Behavior and the Limits of Explicit Instruction

The emergent behaviors observed in Experiment 4 (parallel topology, phase-aware decomposition, regional framework propagation) exceed what the harness prompt explicitly instructs. We did not prompt for parallelism, dependency graph optimization, multi-predecessor synthesis, phase-to-task-type mapping, or regional framework awareness — yet the meta-agent produced all of them. This suggests that prompt engineering for meta-agents should favor *principles and constraints* over *prescribed patterns*. A prescriptive prompt ("always create exactly five tasks with roles A, B, C, D, E") would have suppressed these behaviors; our actual prompt specifies decomposition rules and constraints (3-7 tasks, typed specialists, explicit dependencies) and leaves structure to the meta-agent.

### 6.3 Token Budget and Cost Dynamics

A full 5-task pipeline (one harness plus four specialist executions) consumes approximately 130,000 tokens. Experiment 5's 6-task pipeline exceeded this. We note this as a practical consideration for anyone deploying similar systems: multi-agent pipelines multiply token consumption, and budget guards must account for the full execution chain. The platform enforces per-user hourly and daily budgets (500K/hour, 2M/day in production) with graceful escalation on exhaustion.

### 6.4 Failure Modes and Graceful Degradation

We observed three failure modes and corresponding degradations:

1. **Token budget exhausted** (Experiment 3): The harness designed the complete plan in its response, documented the blocker, and provided actionable escalation. Graceful.
2. **Plan-to-execute transition failure** (Experiment 4): The harness completed planning and declared victory without executing. This was a *prompt fragility* corrected by prompt v3 (Section 5.5).
3. **Server restart mid-execution** (Experiment 5 baseline): Zombie `RUNNING` records accumulated in the database. Corrected structurally by the orphaned-execution watchdog (Section 4.11) rather than by prompt changes.

We note that prompt-based mitigations (v3) and structural mitigations (watchdog) address different failure categories: prompts constrain agent behavior, while structural guards handle the environment. The Pipeline Harness uses both. Where possible, we prefer structural guards because they cannot be bypassed by prompt variations or model updates.

### 6.5 Limitations

Current limitations include:

1. **No cross-pipeline memory.** Each pipeline execution starts fresh. Insights from previous pipelines are not reused.
2. **No learning loop.** The system does not observe which decomposition strategies produce higher confidence scores over time.
3. **Single-trigger execution.** The harness must be manually invoked per objective. Auto-triggered pipelines from POV state changes remain future work (see Appendix F, event-driven continuation).
4. **Harness task placement is an open design question.** In CREATE mode, the harness task lives where the user placed it while its pipeline lives in a newly created stage. Whether the harness should relocate itself into the stage it creates (for visual grouping) or remain in place (for consistency with ORCHESTRATE mode where it is already a sibling of its targets) is unresolved. Current recommendation is to remain in place. See Appendix F for the three-option analysis.
5. **Plan-to-execute transition and self-completion require prompt discipline.** Experiment 4 exposed a failure where the meta-agent treated planning completion as task completion. Experiment 6's predecessor exposed a related failure where the harness wrote a celebratory summary despite rate-limit-induced failures on children. Both were addressed via prompt rules (prompt v3 and the self-completion guard respectively). A stronger structural guarantee — engine-level detection of PIPELINE tasks with unexecuted children — would be more robust than prompt discipline alone, and remains future work.
6. **Single-client parallel execution is serialized at the MCP protocol layer.** The server-side execution engine supports parallel execution via `Promise.allSettled` (Section 4.16), but a single MCP client submitting sequential `agent.execute` calls does not observe parallelism because the MCP JavaScript handler (Path 2) auto-polls for results before returning. Parallelism manifests only with multiple independent MCP clients. This is correct behavior for typical usage but surprising during single-client stress testing.
7. **Horizontal scaling beyond a single node requires further work.** The current architecture is designed to scale to ~100 concurrent users on a 2-vCPU droplet with single-process PM2 instances based on specialist review of the connection pool, rate limiter, Map sizing, and LLM-bound wait patterns. Empirical validation to date is at ~20 simulated concurrent users (Experiment 7); validation at the full 100-user target is a natural follow-up. Moving beyond 100 requires either larger instances or PM2 cluster mode with Redis-backed rate limiting, Map sharing, and event bus. Identified as a P2 item in the scalability review.

### 6.6 Extensibility

The architecture is explicitly designed for extension. The template type system (Section 3.4) accepts new types via the `TemplateType` enum and new templates via the database, without changes to the harness prompt. The context chaining mechanism (Section 3.5) is agnostic to task type and domain. The MCP tool layer (Section 4.3) accepts new parameters through the three-layer contract. Several extensions proposed in earlier design have since been delivered: TaskType rationalization with PIPELINE auto-assignment (Sections 4.9, 4.10), the orphaned-execution watchdog (Section 4.11), dual-mode operation with ORCHESTRATE mode (Sections 3.10, 4.14), and the scalability architecture for 100 concurrent users (Section 4.17). Appendix F documents extensions remaining as future work; several earlier-planned items (Orchestrate Mode, Scalability) have already graduated from Appendix F to body sections.

### 6.7 Threats to Validity

We state the following threats to validity openly, both to preempt reviewer objections and to inform operators deploying similar systems.

**Sample sizes are small.** Our empirical claims rest on **seven experiments and two stress-test runs**, conducted over ~1 week on production infrastructure by a single operator. Template inference accuracy "100% across 7 assignments" is statistically thin; a deployment serving tens of distinct POVs across weeks would produce more meaningful distributions. We report the observations as production evidence of feasibility, not as statistically validated benchmarks.

**Single-operator bias.** All experiments were conducted by the system's author on POVs we created ourselves. We did not run the harness against adversarial inputs, unfamiliar objective phrasings, or user-authored pipelines beyond Test G's manually-created ORCHESTRATE pipeline. A more diverse operator base is likely to expose edge cases we did not hit.

**Scalability claim is extrapolated.** We claim the architecture is designed for 100 concurrent users based on specialist review of connection pool sizing, rate limiter headroom, Map size limits, and the LLM-bound nature of agent work (which releases database connections during the slow part of each execution). **We have not directly tested 100 users.** Experiment 7 stress-tested at ~20 simulated concurrent users via agent teams. The 100-user figure is an architectural target, not a measured result.

**Parallel throughput is theoretical.** The execution engine's `Promise.allSettled` change yields a theoretical ~5x throughput improvement for the polling path, but we have not directly observed this speedup. Single-client tests serialize at the MCP JavaScript handler layer (which auto-polls for results). The multi-client stress test does not exercise `agent.execute` directly. Direct measurement of the parallel speedup is straightforward follow-up work.

**Self-healing behaviors tested once each.** The orphaned-execution watchdog was observed clearing 2 zombie records on one production startup (Experiment 5). The transactional dependency validation has not fired in production because we have not yet seen a real FK constraint attempt. The self-completion guard was added in response to a specific failure mode; the post-fix test (Experiment 6) had all children naturally complete, so the guard was not exercised in its intended failure case. We claim the mechanisms are in place, not that they have been repeatedly battle-tested.

**Confidence scores are self-reported.** The confidence-gated completion loop depends on agents honestly reporting confidence. We parse a numeric score from the output but we do not independently verify it. An agent that overstates its confidence would bypass the quality gates. We mitigate this by using template prompts that encourage honest self-assessment and by cross-checking confidence against observable quality signals (tool success rates, output length), but we do not claim robustness against adversarial self-assessment.

**Hypothesis-driven re-execution has never actually fired in production.** The harness prompt instructs the meta-agent to diagnose weakness and re-execute with specific feedback when confidence falls in the 50-69 range. In the experiments reported here, no specialist output landed in that range, so the re-execution branch was never exercised. We claim the mechanism exists and is wired correctly; we do not claim it has been operationally validated.

**Prior-session experiments are taken on faith.** Experiments 1-5 were conducted in sessions preceding the current author's involvement. We have not personally re-verified them. The empirical details are consistent with the architectural decisions and log entries documented in the platform history, but they should be treated as well-documented reports rather than independently reproduced results.

**No comparison against a naive baseline.** We have not, for example, run the same objectives through a single-LLM no-harness baseline to quantify the benefit of the orchestration layer. This is the most important missing empirical datum: we claim the orchestration layer matters, but we do not present a head-to-head comparison demonstrating the magnitude of that benefit. A head-to-head study comparing (a) single Sonnet prompt with extended tool use, (b) manually-chained specialists, and (c) the Pipeline Harness on the same objectives across multiple POVs would substantially strengthen the empirical claim.

**Generalizability beyond PoV delivery is a conjecture.** Section 6.1 argues the architecture generalizes to other domains requiring structured multi-step autonomous delivery. This is a conjecture, not a demonstrated result. We leave empirical validation in non-PoV domains as future work.

We report these threats to be transparent about what the paper's empirical sections do and do not demonstrate. The architectural contributions (patterns, decisions, algorithms, dual-mode operation, scalability and security architecture) are independent of the empirical claims and stand on their own as engineering knowledge.

### 6.8 Concurrency and Scalability: Engineering for Production from Day One

A key thesis of our work is that production AI systems must be engineered for concurrency and security from the outset — not retrofitted. Experiment 7 demonstrates why.

When we first attempted to validate 100 concurrent user operation, a discovery-first scan of the architecture (conducted autonomously by a specialist review) identified five concerns ranging from correct (transactions released database connections during LLM calls, well within pool capacity) to critical (`TRUSTED_PROXY` not set, causing all users to share a single rate limit bucket; execution engine processing serially despite having parallel infrastructure available). None of these were discovered by running the system under load — they were discovered by **reading the code with the right mental model**.

This matches our broader experience: the expensive failures in production AI are rarely individual tool bugs. They are architectural assumptions that hold for one user but break silently for ten. A rate limiter that treats all users as one is not broken in single-user testing. A connection pool that works fine for one pipeline run hits contention only when two pipelines run concurrently. A security check that allows access based on role rather than POV membership passes every integration test that uses an admin account. These issues are invisible until they are catastrophic, so they must be found structurally — through code review, specialist audit, and deliberate stress testing — before they are found operationally.

We argue this generalizes: any multi-agent orchestration system intended for production multi-user operation must treat scalability, security, and concurrency as **architectural concerns**, not operational ones. The Pipeline Harness's scalability architecture (Section 4.17), security coverage (Section 4.18), and dual-path execution model (Section 4.15) are documented as first-class system properties, not footnotes.

---

## 7. Conclusion

We presented the pAIchart Pipeline Harness, a production system for goal-directed autonomous delivery in business-contextual domains. The system combines six capabilities — task decomposition, specialization, knowledge transfer, self-evaluation, persistence, and context awareness — that together enable autonomous production of structured, customer-facing outcomes. Five production experiments demonstrate the system's behavior progressing from manual proofs-of-concept through autonomous multi-agent pipelines with emergent topology design and fault recovery.

We argue that the hard problem in production AI is not individual model capability but the orchestration layer that coordinates specialists, manages knowledge flow, and evaluates quality. The architectural patterns documented here — from prompt section ownership to automatic pre-execution context chaining to the orphaned-execution watchdog — represent concrete design decisions that close the gap between isolated model capability and autonomous delivery. As language models continue to improve, we expect the orchestration layer to become the primary differentiator between AI tools and AI colleagues. The Pipeline Harness is an early step in that direction.

---

## References

*[To be populated — target ~40 references spanning multi-agent systems, agent frameworks, meta-learning, sales engineering automation, and related LLM orchestration literature]*

---

## Appendix A: Qualitative Harness Behavior

### A.1 Tool Call Statistics

**Experiment 5 (Test C, 6-task pipeline):**

| Phase | Tool Calls | Duration | Notes |
|-------|-----------|----------|-------|
| Context read | 2 | ~4s | `pov.details`, `task.list` |
| Stage creation | 1 | ~1s | New pipeline stage |
| Task creation | 6 | ~8s | One per child task |
| Template assignment | 6 | ~6s | `agent.assign` each |
| Dependency wiring | 5 | ~5s | `task.update` with `dependencyIds` |
| Child execution + polling | ~60 | ~440s | 6 executions, ~50s each + status polls |
| Completion marking | 6 | ~6s | `task.complete` with confidence |
| Final summary comment | 1 | ~1s | `task.comment` |
| **Total** | **~87** | **488s** | |

The harness's own tool turns were within the 100-turn budget. Per-child execution tool counts averaged 4-8.

### A.2 Decomposition Trajectory Analysis

**Experiment 5 walk-through.** The harness received the objective "Assess regulatory compliance readiness" with POV context identifying Demo Financial Corp as a financial services customer. Observable decision points in the trace:

1. **Phase selection**: The harness chose Planning Phase for assessment work, applying the heuristic "assessments precede implementation."
2. **Domain framework selection**: Without explicit instruction, the harness identified SOX, PCI-DSS, and CCPA as relevant frameworks for a US-based financial services company. The POV country context (United States, West Coast) propagated into both task descriptions and the security analyst's framework choices.
3. **Task granularity**: The harness produced 6 tasks rather than 3 or 7. Analysis suggests the meta-agent optimizes for the maximum distinct deliverables justifiable under the objective (baseline → gap → ROI → remediation → documentation → timeline) without producing redundant tasks.
4. **Role sequencing**: The harness applied the implicit type ordering REVIEWER (baseline, gap) → ANALYST (ROI) → ARCHITECT (remediation) → DOCUMENTER (findings) → OPERATOR (timeline). This matches a natural workflow for compliance assessment and was not prompted.
5. **Execution discipline**: The harness did not batch-execute children; it ran them sequentially respecting the linear dependency chain. For pipelines with parallel roots (Experiment 4), the topology would have enabled concurrency — future work includes validating concurrent execution paths.

The meta-agent's trace shows no explicit reasoning about these choices in natural language; they emerge from the prompt constraints and context. See Section 6.2 for discussion.

---

## Appendix B: Discovered Pipeline Topologies

### B.1 Linear Pipeline (Sequential)

Standard assessment pipelines produce linear topologies:

```
ARCHITECT → REVIEWER → ANALYST → DOCUMENTER
```

### B.2 Parallel-then-Synthesis (Emergent, Experiment 4)

The cloud migration readiness pipeline demonstrates an emergent parallel topology:

```
ARCHITECT ─┐
ANALYST   ─┼─→ REVIEWER → DOCUMENTER
REVIEWER  ─┘
```

Independent assessments run in parallel; a synthesis task depends on all three; the final report depends on everything.

### B.3 Orchestrator-First (Data Gathering)

Pipelines requiring external data begin with an ORCHESTRATOR:

```
ORCHESTRATOR → ARCHITECT → REVIEWER → ANALYST → DOCUMENTER
```

The orchestrator invokes external MCP services to gather data; subsequent specialists consume the gathered data via context chaining.

### B.4 Cross-Phase Distributed Pipeline (Emergent, Experiment 4)

```
Execution Phase
  ├── Workstream A (ARCHITECT) ─┐
  ├── Workstream B (REVIEWER)  ─┼─→ Strategy (ARCHITECT)
  └── Workstream C (ANALYST)   ─┘        ↓
                                    Cost-Benefit (ANALYST)
                                         ↓
Review Phase
  └── Executive Report (DOCUMENTER)
```

The harness placed independent assessments in Execution phase, synthesis and analysis in a second stage of the same phase, and the final deliverable in a separate stage in the Review phase. This topology was emergent — the harness prompt describes stage creation but does not mandate cross-phase distribution.

### B.5 Six-Step Linear Chain with Fault Recovery (Experiment 5)

```
Compliance Baseline (REVIEWER)
    ↓
Gap Analysis (REVIEWER)
    ↓
ROI Analysis (ANALYST)
    ↓
Remediation Roadmap (ARCHITECT)
    ↓
Findings Report (DOCUMENTER)
    ↓
Implementation Timeline (OPERATOR)
```

Linear sequential dependency chain. Validated post-bug-fix with orphaned-execution watchdog cleaning two prior zombie records and the full pipeline completing in 488 seconds with 100% task completion. This topology was intentionally tested because its lack of parallelism and simple fan-in structure isolates the effect of the Session 3 bug fixes from emergent topology variation.

---

## Appendix C: Template Inventory

### C.1 ARCHITECT Type

- **Solution Architect** (DEVELOPMENT): End-to-end solution design, enterprise architecture
- **Technical Consultant** (DEVELOPMENT): Feasibility evaluation, technology recommendation
- **Sales Engineer** (GENERAL): POV strategy, technical win execution

### C.2 BUILDER Type

- **Senior Software Developer** (DEVELOPMENT): Production code, test coverage, documentation

### C.3 ANALYST Type

- **Business Analyst** (ANALYSIS): Requirements, ROI, stakeholder translation
- **Data Analyst** (ANALYSIS): Metrics, trends, statistical analysis
- **Marketing Strategist** (ANALYSIS): GTM, competitive positioning

### C.4 REVIEWER Type

- **QA Test Engineer** (TESTING): Test planning, coverage, automation
- **Security Analyst** (SECURITY): Compliance audit, risk assessment

### C.5 OPERATOR Type

- **DevOps Engineer** (DEPLOYMENT): Infrastructure, deployment, monitoring
- **Project Manager** (AUTOMATION): Coordination, timelines, stakeholder updates

### C.6 DOCUMENTER Type

- **Technical Writer** (DOCUMENTATION): Deliverable synthesis, customer-ready output

### C.7 ORCHESTRATOR Type

- **MCP Service Registry** (MCP_SERVICE): Service registration and lifecycle
- **MCP Service Orchestrator** (MCP_SERVICE): Multi-service reasoning
- **MCP Workflow Orchestrator** (MCP_SERVICE): Declarative workflow execution

### C.8 GENERALIST Type

- **pAIchart Universal Agent Template** (GENERAL): Fallback, multi-purpose

---

## Appendix D: Production Patterns

Selected patterns most relevant to harness operation (see the pAIchart pattern registry for complete documentation of 52 patterns as of v2.1):

- **#44 Agent Template Gold Standard** — 8-point checklist for template quality
- **#49 MCP Parameter Three-Layer** — tool schema + validation schema + handler contract (Section 4.3)
- **#50 Dual Execution Path Parity** — engine and streaming route must stay synchronized (Section 4.2)
- **#51 Prompt Section Ownership** — system prompt vs user prompt responsibilities (Section 4.1)
- **#52 Side-Effect-Only Update** — NO_EFFECT bypass for handlers where the effective change is in the transaction (e.g., `dependencyIds` wiring) rather than in the `updateData` object. Without the bypass, the handler throws NO_EFFECT and silently rejects valid updates.
- **Type-Based Auto-Assignment** — narrow use of task type for behavioral dispatch (Section 4.9)
- **Native Enum** — `z.nativeEnum(PrismaEnum)` to prevent drift-induced silent failures (Section 4.10)
- **Task Status State Machine** — `OPEN → IN_PROGRESS → COMPLETED` enforced across all execution paths (Section 4.13)
- **Transport Boundary Argument Coercion** — `ensureObject()` guards at all MCP transport boundaries (Section 4.4)
- **Transaction Atomicity** — multi-table state changes must occur inside `prisma.$transaction` (Sections 4.11, 4.12)
- **Orphaned Execution Watchdog** — startup and poll-cycle cleanup of zombie `RUNNING` records (Section 4.11)
- **Transactional Dependency Validation** — pre-write existence check filters invalid FKs (Section 4.12)
- **Dual-Mode Mode Detection** — stage sibling presence determines CREATE vs ORCHESTRATE at prompt level (Sections 3.10, 4.14)
- **Self-Completion Guard** — template-level rule requiring verification of all child task statuses before success reporting (Section 4.14)
- **Fire-and-Forget with CAS Claim** — `agent.execute` returns immediately; polling loop picks up `PENDING` records in parallel via `Promise.allSettled`; atomic CAS transition prevents double-execution (Section 4.16)
- **Two Execution Paths** — embedded TypeScript (in-process) vs MCP JavaScript (external clients); same actions, different handler layers, different operational characteristics (Section 4.15)
- **TRUSTED_PROXY-Gated Header Trust** — per-IP rate limiting requires explicit opt-in to trust `x-forwarded-for`; default is fail-safe to `direct` bucket (Section 4.17)
- **Structured Rate Limit Logging** — every 429 response logs via pino `warn` with `{identifier, remaining, retryAfterSec}` so rate limit events are observable (Section 4.17)
- **POV Access Coverage** — every MCP handler must call the shared `validatePOVAccess` utility; inline checks are a known anti-pattern and produce drift over time (Section 4.18)
- **Field Leakage Prevention** — spread operator ordering to prevent user-controlled field override
- **Database Drift Elimination** — `db push` everywhere (development + production)

---

## Appendix E: Implementation Patterns and Guidance

### E.1 Adding New Template Types

New template types are added via the `TemplateType` Prisma enum. Template instances reference the type through the `templateType` field. The harness's decomposition prompt includes a template type table that must be updated when new types are added. The harness uses fuzzy template name matching at assignment time, so templates can be added without updating the harness prompt if their name clearly indicates their purpose.

### E.2 Extending the Completion Loop

The completion loop thresholds (70, 50) are currently hardcoded in the Pipeline Harness prompt. Extension to per-pipeline configurable thresholds requires moving these values to template metadata and threading them through to the harness's instruction set.

### E.3 Adding New MCP Parameters

Any new MCP action parameter requires updates at three layers (tool schema, validation schema, handler). Missing any layer results in silent parameter stripping at the Zod validation boundary. See Pattern #49 for the complete contract.

### E.4 Custom Template System Prompts

Custom templates override the Universal Template entirely. Cross-cutting instructions (confidence scoring, output format, comment character limits) must live in user prompt §8 (engine-owned) not in system prompt text, or they will be silently absent for custom-template agents.

### E.5 Monitoring Orphaned Executions

The orphaned-execution watchdog logs cleanup events at `warn` level with `orphanedCount` metadata. Operators should monitor these logs; a non-zero orphan count on any startup following a restart is expected, but a non-zero orphan count during normal poll cycles indicates that an execution outlived its 20-minute safe bound, suggesting either pathological tool usage or a hung LLM provider.

---

## Appendix F: Research Directions and Extensions

This section documents planned and proposed extensions. Each can be developed independently without disrupting the core architecture, per Section 6.6.

### F.1 TaskType Rationalization and PIPELINE Task Type — DELIVERED

*Status as of v2.0: Implemented and deployed.* See Sections 4.9-4.10.

### F.2 Orphaned Execution Watchdog — DELIVERED

*Status as of v2.0: Implemented and deployed.* See Section 4.11 and Experiment 5 (Section 5.6).

### F.3 Transactional Dependency Validation — DELIVERED

*Status as of v2.0: Implemented and deployed.* See Section 4.12.

### F.4 Orchestrate Mode — DELIVERED

*Status as of v2.1: Implemented and validated in Experiment 6.* See Sections 3.10 and 4.14.

**Historical design note.** The three-option analysis for harness task placement (Stay / Relocate / Hybrid) informed the final design: Option A (Stay) was selected because consistency across modes (ORCHESTRATE mode requires the harness to be a sibling of its targets) outweighs the visual-grouping benefit of relocation in CREATE mode. Cross-referencing is provided via auto-comment fetch commands.

### F.5 Cascading Pipelines Across Stages

Currently each pipeline is self-contained within a single stage (or a small set of stages for cross-phase variants). Extension to cross-stage cascading would enable stage-level chaining: the last task of stage $N$ feeds the first task of stage $N+1$, and pipelines are auto-triggered as their prerequisite stages complete. This would turn the POV structure itself into an executable program.

### F.6 Event-Driven Pipeline Continuation

The agent execution engine polls for pending executions every 10 seconds. Extension would enable the engine to detect tasks whose dependencies have just completed and auto-execute them, removing the need for the harness to manually manage each child execution. This enables "fire-and-forget" pipeline execution bounded only by token budget and time constraints.

### F.7 Meta-Learning from Execution History

All execution records, confidence scores, retry counts, and artifact contents are persisted. A meta-learning layer could observe which decomposition patterns produce higher average confidence, which template types are best for which objective types, and which feedback patterns lead to successful retries. This would enable the harness to improve at orchestration by observing its own past performance.

### F.8 Cross-Pipeline Intelligence

Extension to cross-pipeline memory within the same POV would enable insights from previous pipelines to inform subsequent ones — the Security Audit pipeline's findings would be available to the Migration Readiness pipeline without re-discovery.

### F.9 Agent-to-Agent Evaluation via MCP/A2A

The platform exposes POV data to AI clients via the MCP protocol. A future extension would enable the customer's own AI evaluator to connect and assess pAIchart's deliverables directly, with feedback flowing back into the pipeline as re-execution triggers. This creates a cross-organizational feedback loop between AI systems — to our knowledge, no prior system supports this.

### F.10 Meta-Harness: Harnesses That Design Harnesses

A meta-harness would design new pipeline templates based on high-level category specifications ("design a reusable pipeline template for compliance gap assessments"). This represents a form of self-improvement where the orchestration system creates the tools that make itself more capable.

### F.11 Structural Plan-to-Execute Enforcement

Prompt v3 and the Self-Completion Guard (Section 4.14) address the plan-to-execute transition and false-success reporting via prompt discipline. A stronger structural guarantee would be engine-level detection: if the harness's execution ends and its child PIPELINE tasks remain unexecuted, the engine could either auto-trigger execution or mark the harness execution as incomplete. This moves the enforcement from prompt compliance to platform behavior and is complementary to the existing prompt-level rules.

### F.12 Scalability Architecture for 100 Concurrent Users — DELIVERED

*Status as of v2.1: Implemented and validated in Experiment 7.* See Section 4.17.

The delivered work comprises five targeted fixes (TRUSTED_PROXY, connection pool sizing, rate limiter rationalization, Map limit enforcement, web search hygiene) plus structured rate-limit logging for observability. Future work (identified as P2 during the scalability review) includes moving to PM2 cluster mode with Redis-backed state sharing for horizontal scaling beyond a single node.

### F.13 POV Access Coverage Audit — DELIVERED

*Status as of v2.1: Implemented after specialist audit.* See Section 4.18.

The `agent-results-handler.ts` gap (inline DEMO_USER-only check rather than the shared `validatePOVAccess` utility) was identified by three independent specialist reviews (auth-permissions, sec-ops, mcp-integration) during routine audit. Both `agent-status-handler.ts` and `agent-results-handler.ts` were migrated from the legacy `lib/mcp/handlers/` location to the standard `lib/mcp/tasks/action/handlers/agent/` directory, consolidating all agent handlers and making the access control story easier to audit.

### F.14 PIVOT Decision Logic for the Completion Loop

The completion loop (Section 3.6) currently has two outcomes on low confidence: re-execute with feedback (confidence 50-69) or escalate (confidence < 50). The Omni-SimpleMem work (Liu et al., 2026) proposes a third outcome: **PIVOT** — change approach when re-execution does not improve quality. For the Pipeline Harness, PIVOT would mean changing the assigned template type (e.g., if a REVIEWER fails to find gaps, try an ANALYST) or reframing the task description. This requires the harness to reason about *why* a task failed, not just that it failed — which is inherently LLM-level reasoning and would live in the prompt.

### F.15 Selective Context Access (Deferred)

The Meta-Harness work (Lee et al., 2026) proposes filesystem-based selective context access where the agent receives a manifest plus fetch commands rather than full upstream output. We analyzed this for the Pipeline Harness and **deferred it**: the Omni-SimpleMem finding that full-text outperforms LLM summaries by +53% F1 is a strong counter-argument for small pipelines (3-6 tasks), and current pipelines complete in under 10 minutes with full-text injection. We would revisit this when pipelines exceed 10 tasks with fan-in dependencies, at which point accumulated context approaches model context-window limits.

### F.16 Cross-Pipeline Learning from Execution History

Beyond F.7 (meta-learning from execution history), a related extension is cross-pipeline learning *within* a single POV: the Security Audit pipeline's findings become available to the Migration Readiness pipeline without re-discovery. This requires a POV-level artifact index and a retrieval mechanism integrated with the context chainer. We note this as a specific instance of F.8 with a narrower scope.

---

## Appendix G: Deployment and Operational Details

### G.1 Infrastructure

pAIchart is deployed on Digital Ocean with blue-green deployment via GitHub Actions. The platform consists of two PM2 processes: a Next.js web server handling UI and API traffic, and a standalone MCP server handling AI client connections. A PostgreSQL 16 database persists all state.

### G.2 Model Configuration

Template-level model parameters are configurable via the `metadata.modelParameters` field on each template. The Pipeline Harness uses claude-sonnet-4-5 for its reasoning capacity during decomposition. Specialist templates default to claude-haiku-4-5 for cost efficiency. Temperature is 0.3 across templates to favor consistent, grounded output over creative variation.

### G.3 Token Budget Guards

The MCP server enforces per-user token budgets with hourly and daily limits (500K/hour, 2M/day in production). These budgets apply to MCP tool calls made by agents. Rate limit violations result in explicit error responses that the harness handles gracefully via escalation.

### G.4 Artifact Retention

The execution engine prunes old executions to limit storage growth. The most recent 5 successful executions and 5 failed executions are retained per task. Artifacts associated with pruned executions are deleted atomically with the execution records.

### G.5 Observability

Server logs are structured via pino. Agent execution traces include `executionId`, `taskId`, tool call counts, token counts, and turn counts. Orphan cleanup events log at `warn` level with explicit `orphanedCount`. Integrity tests (27 tests, Layer 1 pattern + Layer 2 behavior) validate architectural invariants on every build.

---

## Appendix H: Extended Related Work

### H.1 Prompt Orchestration Frameworks

Prompt orchestration frameworks (DSPy, Guidance, LMQL) provide primitives for structured LLM output and multi-step reasoning within a single model context. They differ from the Pipeline Harness in focus: they optimize single-agent prompt composition and constraint satisfaction, not multi-agent work distribution with persistent business context.

### H.2 Automated Evolution of Agent Systems

AlphaEvolve, GEPA, and similar systems use evolutionary search over prompt or code space to improve agent performance. Our work is orthogonal — rather than optimizing agent prompts in search, we operate a fixed orchestration layer with manually-designed prompts, and validate emergent behavior as a property of the base meta-agent's planning capacity. A combination is plausible future work: evolving the harness prompt to improve decomposition quality as measured by child-task confidence scores.

### H.3 Typed Multi-Agent Systems in Research Settings

Several recent research systems explore typed multi-agent coordination, including systems with planner-executor-critic roles and multi-model ensembles where different models handle different cognitive functions. These typically operate in research benchmark contexts (math reasoning, code generation) rather than production customer-delivery contexts. The six-capability framework (Section 1) is our attempt to articulate what distinguishes production delivery requirements from research benchmark requirements.

### H.4 Ralph and Persistent Completion Loops

The Ralph pattern — iterate through edit, run, check cycles until all checks pass — originated in the claw-code ecosystem for autonomous code generation. We adopted the persistence aspect of Ralph but adapted it to deliverable production: instead of "iterate until tests pass," the Pipeline Harness iterates until confidence thresholds are met or human escalation is appropriate. The key adaptation is replacing binary test outcomes with continuous confidence scores, which enables more nuanced quality gating.

### H.5 Transaction Atomicity in Agent Systems

Most agent frameworks treat database operations as side effects handled by the agent itself. Our design treats multi-table state changes as first-class transactional concerns at the platform layer, not the agent layer. The orphaned-execution watchdog (Section 4.11) and transactional dependency validation (Section 4.12) are specific applications of this principle. We view this as an under-researched area: agent frameworks inherit data consistency issues from their database layers but rarely document the transaction patterns needed for production robustness.

### H.6 Autonomous Research and Memory System Optimization (Omni-SimpleMem)

Liu et al. (2026) present Omni-SimpleMem, an autoresearch-guided system that autonomously discovers architectural and prompt-engineering improvements to a lifelong multimodal agent memory system. Their work is complementary to ours in three respects:

1. **PROCEED / ITERATE / PIVOT decision framework**: Their autonomous research pipeline uses a three-way decision logic (metric improvement ≥ 0.5% → PROCEED; ambiguous → ITERATE; two consecutive degradations → PIVOT). We adopt PROCEED and ITERATE as the 70+ and 50-69 confidence bands in our completion loop (Section 3.6), and identify PIVOT as future work (Appendix F.14).

2. **Full-text outperforms LLM summaries**: They found that returning original dialogue rather than LLM summaries improved token-overlap F1 by +53% — an important counter-result to naive summarization strategies in multi-agent pipelines. This finding directly informed our decision to inject complete predecessor outputs in context chaining (Section 3.5) rather than summaries, and to defer selective context access (Appendix F.15) until scale demands it.

3. **Bug fixes dominate hyperparameter tuning**: Their taxonomy of discovery types shows bug fixes (+175%) exceeding cumulative hyperparameter contributions (+44% architecture + minor tuning). This aligns with our own operational experience — the expensive improvements in the Pipeline Harness are architectural (orphan watchdog, self-completion guard, scalability fixes) rather than prompt tuning.

Omni-SimpleMem optimizes a single multimodal memory system for recall accuracy on benchmarks. We operate a multi-agent orchestration layer producing customer-facing deliverables with business context. Neither subsumes the other, but the shared methodological insights (three-way decisions, full-text over summary, architectural bug fixes) cross domains.

### H.7 Meta-Harness: Automated Harness Search (Lee et al., 2026)

Lee et al. present Meta-Harness, a system for automated optimization of harness code through an agentic proposer searching code-space for improved implementations. Their key findings — particularly the result that filesystem-based selective context (10M tokens of diagnostic history accessible via grep/cat) outperforms compressed summaries by 7.7 points using 4× fewer tokens — informed our design philosophy even where we did not directly adopt their approach.

Specifically, we considered selective context access for the Pipeline Harness but **deferred it** (Appendix F.15) after weighing the Meta-Harness result against the Omni-SimpleMem finding (H.6, #2) that full-text outperforms summaries in the 3-6 task pipeline range. The right design depends on pipeline size: full-text for small pipelines, selective access for larger ones where accumulated context approaches context-window limits.

We note that a meta-harness applied to the Pipeline Harness — optimizing harness prompts and template assignments via automated search — is plausible future work (Appendix F.10). The Pipeline Harness's structured logging of decomposition traces, confidence scores, and artifact contents provides the substrate a meta-harness would search over.

---

## Document Extensibility

This whitepaper is structured for ongoing extension as new capabilities are added to the Pipeline Harness. The primary extension points are:

| New Content Type | Extension Location |
|------------------|-------------------|
| New experimental run | Section 5 (add subsection 5.N, update Table 4 metrics) |
| New architectural decision | Section 4 (add subsection 4.N, update Appendix D patterns) |
| New template type | Section 3.3 (Table 2), Appendix C (new type subsection) |
| New harness mode | Section 3.10 (add sub-section), add algorithm box, add design decision in Section 4, add experiment in Section 5 |
| New execution path | Section 4.15 (extend the Two Execution Paths subsection) |
| New scalability fix | Section 4.17 (extend the Scalability Architecture subsection), update Experiment 7 with post-fix run |
| New security finding | Section 4.18 (extend POV Access Coverage), add pattern to Appendix D |
| New emergent behavior | Section 5.7 + Section 6.2 |
| New limitation discovered | Section 6.5 |
| New concurrency observation | Section 6.7 |
| New research direction | Appendix F |
| New pipeline topology | Appendix B |
| New pattern adopted | Appendix D |
| New related work to address | Appendix H |
| New research paper referenced | Appendix H (new subsection) + Section 2 (if directly related) |
| Delivered research direction | Move from Appendix F.N to Section 4.N, leave a "DELIVERED" stub in Appendix F |

The core structure (Abstract, Introduction, Related Work, Architecture, Design Decisions, Experiments, Discussion, Conclusion) should remain stable. Appendices are the primary extension points, and F (Research Directions) is explicitly designed to move items into Section 4 as they are delivered — this whitepaper evolves by promoting appendix items to body sections as they graduate from proposed to production. Each promotion preserves the Appendix F entry as a stub noting the delivery, so the lineage from proposal to production is visible in the document history.

**Graduation pattern.** When a Research Direction moves from Appendix F to Section 4:

1. Add new subsection `4.N` with full implementation details
2. Replace the Appendix F.N body with: *Status as of v[X.Y]: Implemented and deployed. See Section 4.N.*
3. Add empirical validation as new Experiment `5.N` if applicable
4. Update limitations in Section 6.5 (remove the item if it was listed there)
5. Update version history with a single entry summarizing all of the above
6. Update Abstract and Contributions (Section 1.3) if the change is significant

This graduation pattern was applied in v2.1 to Orchestrate Mode (F.4), Scalability (F.12), and POV Access Coverage (F.13). The graduation preserves traceability while keeping the main document current.

### Version History

- **v1.0** (2026-04-03): Initial draft after Phase 2 harness deployment.
- **v1.1** (2026-04-04): Added Test B results and TaskType rationalization.
- **v2.0** (2026-04-04): Restructured for arxiv-style publication. Added Problem Formulation (Section 3.1), Algorithm 1 (Section 3.9), expanded Experiments with Test C and fault-recovery validation (Section 5.6), added Orphaned Execution Watchdog (Section 4.11) and Transactional Dependency Validation (Section 4.12), added Appendix A (Qualitative Harness Behavior) and Appendix H (Extended Related Work), reorganized appendices to mirror arxiv conventions. Promoted delivered extensions from Appendix F into Section 4.
- **v2.1** (2026-04-06): Added dual-mode operation (CREATE + ORCHESTRATE) throughout the paper: new Section 3.10 with Algorithm 2, design decision 4.14 (Dual-Mode + Self-Completion Guard), Experiment 6 (Section 5.9) validating ORCHESTRATE mode end-to-end. Added two-execution-path architecture (Section 4.15: embedded TypeScript vs MCP JavaScript). Added fire-and-forget + parallel polling (Section 4.16) with CAS claim pattern. Added scalability architecture for 100 concurrent users (Section 4.17): TRUSTED_PROXY, connection pool sizing, rate limiter rationalization, Map limit enforcement, web search hygiene, structured rate-limit logging. Added POV access coverage audit (Section 4.18) closing a MEDIUM-HIGH severity access control gap in `agent-results-handler.ts`. Added Experiment 7 (Section 5.10) concurrency stress test via agent teams, 96/96 calls with zero failures and zero degradation across 5 workload patterns in both pre- and post-fix runs. Added Section 6.7 **Threats to Validity** (sample sizes, single-operator bias, scalability extrapolation, parallel throughput theoretical, self-healing tested once, confidence self-reported, hypothesis-driven re-execution never fired, prior experiments on faith, no head-to-head baseline comparison, generalizability conjecture). Renumbered previous 6.7 to 6.8 (Concurrency and Scalability thesis). Updated limitations (removed orchestrate-mode as limitation; delivered). Added Pattern #52 Side-Effect-Only Update to Appendix D. Marked Appendix F.4 (Orchestrate Mode), F.12 (Scalability), F.13 (POV Access Coverage) as DELIVERED. Added Appendix F.14 (PIVOT Logic), F.15 (Selective Context Access, Deferred), F.16 (Cross-Pipeline Learning within POV). Added Appendix H.6 (Omni-SimpleMem cross-reference) and H.7 (Meta-Harness cross-reference). **Honesty pass**: reworded scalability claims to distinguish architectural design (100 users) from empirical validation (20 users), flagged the `~5x throughput` figure as theoretical rather than measured, removed an inaccurate claim about a non-existent integrity test (now documented as future work), corrected `52+` to `52` and `16-17` to `17`, and changed "production-validated" to "production-deployed" where appropriate. **Live artifact pass**: added Code, Platform, and Resources block at top with live MCP endpoint, GitHub OAuth auto-registration flow, and enterprise PoV positioning. Added Contribution #9 (live publicly-inspectable production system) and #10 (MCP Security Best Practices compliance). Added Section 4.19 Compliance with Anthropic MCP Security Best Practices documenting per-attack-vector compliance (confused deputy, token passthrough, SSRF, session hijacking, scope minimization) with honest caveats about what is and is not claimed.
