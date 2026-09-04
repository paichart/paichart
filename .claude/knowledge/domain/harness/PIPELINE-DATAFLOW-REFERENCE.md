# Pipeline Dataflow Reference

**Purpose**: Per-role I/O contract (READS / PRODUCES / CONSUMED BY) for the Pipeline Harness's two canonical pipeline shapes — synthesis and default. Tells you exactly what each role consumes and produces in steady-state. Companion to:
- `HARNESS-MENTAL-MODEL.md` — concepts and design rationale
- `PIPELINE-OBSERVABILITY-GUIDE.md` — how to investigate at runtime
- `PIPELINE-HARNESS-USER-GUIDE.md` — user-facing setup
- `run6-run7-dataflow-evidence.md` (same directory) — **primary-source evidence** this doc cites

**Audience**: Engineers modifying the harness/engine; admins debugging a specific role's behavior; reviewers validating that a code change preserves the I/O contract.

**Created**: 2026-04-29 (post-Run 7 default-shape validation).

---

## The two pipeline shapes (quick map)

| Shape | Decomposition | Children | Deliverable producer | Empirical anchor |
|---|---|---|---|---|
| **Synthesis** (with Phase 0) | Acquirer → Harvester → Editor → Reviewer | 4 | **Editor** (intermediate by dep-graph) | Run 6 |
| **Synthesis** (no Phase 0) | Harvester → Editor → Reviewer | 3 | Editor (intermediate) | (not exercised in this validation series) |
| **Default** | e.g., Architect → Audit → Roadmap (Security Assessment) | 3-7 | **The leaf** | Run 7 |

The deliverable producer differs by topology — Editor for synthesis (intermediate), leaf for default. Both go through the same metadata-driven engine extraction. **The engine is shape-agnostic by construction**.

---

## Cross-cutting concepts (read these first)

### Chained context — §6 Pipeline Context

Each non-harness child receives its dependencies' full `result.json.finalResponse` content auto-injected into its system prompt as a `## §6 Pipeline Context` block, before the LLM turn begins. Implementation: `lib/agents/harness/context-chainer.ts`. Full text, not summary — research showed full outperforms summary by ~50% (per `HARNESS-MENTAL-MODEL.md` Chapter 3).

**Implication**: when Role B has dep on Role A, Role B reads Role A's full output without making any tool call. Role B does NOT need `agent.results` or `task.context` to fetch it — it's already in front of the LLM. The chained-context-prefer guidance in role guidance + universal template Step 4 enforces this preference.

**Empirical evidence**: Run 6 Reviewer used 2 tool calls (just `task.comment` × 2) — read the Editor's article entirely from §6, no agent.results. Run 6 Editor sometimes still called agent.results redundantly (10 tool calls) — pattern is non-deterministic. See evidence file Reviewer + Editor sections.

### Tool budget pattern

Each execution has a turn budget (~30 max tool turns) and an inputToken budget. Tool calls cost both. Most roles land in the 2-15 tool-call range. Acquirer is the outlier (29 tool calls in Run 6 — dominated by external MCP service calls).

**Implication**: roles with lots of upstream chained content typically need fewer tool calls (chained context covers the input). Roles fetching external data (Acquirer) or auditing infrastructure (Run 7 Audit Specialist with `services.health` checks) burn more.

**Code reference**: tool-result truncation at 50KB (`agentExecutionEngine.ts:1605-1626`, commit `c1492c70`) prevents tool-result-cascade bloat; chained-context-prefer guidance reduces the need for re-fetches.

### Quality-gate signals

The harness's SYNTHESIZE mode reads each child's `result.json` and applies the 3-band quality gate from `pipeline-orchestrator-protocol`:
- **≥ 70** confidence → ✅ accept, proceed
- **50-69** confidence → ⚠️ retry the child once with diagnostic feedback (bounded)
- **< 50** confidence → 🔴 escalate; harness halts SYNTHESIS and escalates to human

The engine separately enforces a 4-point invariant on `task.complete` (see `HARNESS-MENTAL-MODEL.md` Chapter 2): pipelineStageId set + child stage non-empty + all children terminal + back-pointer match. This is SERVER-SIDE, not agent-mediated.

**Empirical evidence**: All 9 specialist executions across Runs 6+7 landed in accept band (≥70). Lowest score was Run 7 Roadmap leaf at 72 — within the accept band, no retry needed. See evidence file confidence-trends section.

### Forensic signals

Three forensic JSONB fields are written into `result.json` / `pipeline-index.json` for queryable provenance:

| Field | Written by | Read for |
|---|---|---|
| `confidenceScore` | Engine (parsed from `Confidence: N/100` trailing line in finalResponse) | Quality-gate decision; trending across runs |
| `protocolValidation.missingSteps[]` | Engine post-execution validator (`pipelineProtocolValidator.ts`) | "ALL CLEAR — No detection signals fired" GUI render; admin compliance audit |
| `reportMdSource` | Engine extraction (only on harness pipeline-index.json, only when extraction fired) | Provenance audit ("which task's content became the harness's report.md?") |
| `qualityMetrics.toolCallSuccess` | Engine post-execution from toolCalls array | Tool-failure-rate confidence cap (objective guard at engine line 1182) |
| `resolvedMode` / `resolvedReasonCode` | `harnessModeResolver.ts` (pre-LLM) | Survives budget-exhausted runs that blank `protocolValidation`; mode-discrimination during forensics |

These are **forensic-only** — none of them gate execution status. They're surfaced in the GUI's Pipeline Results panel + queryable via SQL per `PIPELINE-OBSERVABILITY-GUIDE.md` SQL playbook.

### Metadata-driven extraction (the rework's centerpiece)

**Two metadata fields** wired by harness CREATE mode in Step 5a:
- `harness.metadata.deliverableSourceTaskId` — set on the harness task — points at the child whose `finalResponse` is the customer deliverable
- `<source>.metadata.suppressDefaultReportMd` — set on the leaf — disables the leaf's automatic `report.md` (so only the harness's `report.md` exists, no competing artifact)

In synthesis pipelines, these point at *different* children (Editor for source, Reviewer for suppress). In default pipelines, they point at the *same* child (the leaf is both).

**Engine post-processing** (inside the same `prisma.$transaction` as artifact write):
1. **Extraction**: when `getReportMdDecision()` returns `source: 'upstream'`, fetch source's most-recent SUCCESS `result.json`, parse `finalResponse`, write as harness's `report.md` content.
2. **Substitution**: scan harness's just-written `pipeline-index.json` content for the `{{HARNESS_REPORT_MD_ID}}` placeholder, substitute the just-created report.md ID, update via `tx.agentArtifact.update`.

Code references: `agentArtifactPolicy.ts:getReportMdDecision`, `agentExecutionEngine.ts:1685-1730` (extraction), `agentExecutionEngine.ts:1810-1851` (substitution). Mirrored in stream-route.

**Empirical evidence**: Both Run 6 and Run 7 produced byte-identical extracted report.md (16,189 bytes Run 7, 17,247 bytes Run 6) and `replacements: 5` substitution event in Run 7 (multiple placeholder occurrences in synthesis-comment prose, all substituted in one pass).

---

## Harness CREATE mode

**Mode**: First execution. `metadata.pipelineStageId` is absent → resolver picks CREATE.
**Topology**: Both shapes.
**Deliverable status**: Harness root (PIPELINE type — receives engine extraction at SYNTHESIZE commit, NOT here).

### READS
- Task description + POV context (objective, customer, country) — directly from task fields and `project(action: "pov.details")` (~1 tool call)
- Universal template + `pipeline_harness_orchestrator` role guidance (auto-injected into system prompt by engine)
- Protocol block — since 2026-08-17 (composed injection, `loadProtocols: 'composed'`) the engine injects `## Harness Operating Base` + the task's ONE stamped protocol as `## Active Protocol:` (the legacy `loadProtocols: true` mode injected ALL `'protocol'`-tagged prompts under `## Available Orchestration Protocols` — retained as the rollback path) (template metadata). Currently 2 protocols: pipeline-orchestrator (default) + artifact-synthesis (specialist).
- `## Harness Context (Platform-Resolved)` block — pre-LLM resolver writes mode + reasonCode + pipelineStageId + child-stage state. The harness reads what was resolved; doesn't detect mode itself.

### PRODUCES (work product)
- **Side effects** (via tool calls):
  - `stage.create` × 1 — creates the child stage; engine's `task-update-handler` automatically writes `harnessTaskId` back-pointer onto the new stage's metadata
  - `task.update` (self) × 1 — records `metadata.pipelineStageId` (the join field; without this the retrigger reactor can't find the harness)
  - `task.create` × N — children with `dependencyIds` wired (synthesis: 4 with linear chain; default: 3-7 depending on shape)
  - `agent.assign` × N — template assignment per child (template name from harness's mental decomposition; the `templateScopeMatcher` verification was RETIRED 2026-07-17 — 0 true positives ever)
  - `task.update` (self) × 1 — Step 5a: sets `metadata.deliverableSourceTaskId = <deliverable-producer child id>`
  - `task.update` (leaf) × 1 — Step 5a: sets `metadata.suppressDefaultReportMd = true`
  - `task.comment` × 1 — Step 6: PIPELINE QUEUED breadcrumb (first-line `**Child stage:** \`<id>\` — <name>` + child roster + dep-chain prose)
- **finalResponse**: harness CREATE summary text (1500-2500 chars typical) — child stage name + decomposition table + Step 5a wiring confirmation + closing notes. Becomes `pipeline-index.json` artifact.
- **`pipeline-index.json` artifact** — only artifact CREATE produces (per Option A defense — no `report.md` because source task has no SUCCESS execution yet).

### CONSUMED BY
- **Reactor cascade**: `taskReadyReactorService` queues dep-free children once their `agent_executions` row is created
- **Harness SYNTHESIZE later**: re-reads `task.metadata` (the back-pointer to its own stage + the deliverableSourceTaskId)
- **Customer**: GUI Pipeline Results panel shows the CREATE execution + child roster

### Empirical evidence
Run 6: 16 tool calls, 2,043 chars finalResponse, 90KB pipeline-index.json. Run 7: 14 tool calls, 1,755 chars finalResponse, 84KB pipeline-index.json. Both wired Step 5a correctly first-attempt. See evidence file "Harness CREATE mode" section.

---

## Phase 0 Acquirer (synthesis-conditional)

**Mode**: Run during cascade if synthesis-protocol selected AND task description names external MCP services (e.g., `eia-service`, `weather-service`) OR uses acquisition phrases ("pull from", "fetch from", etc.).
**Topology**: Synthesis only, when external sources are needed (4-child shape).
**Deliverable status**: Intermediate per dep-graph (no upstream deps).

### READS
- Task description (set by harness CREATE in Step 4)
- Universal template + `synthesis_source_acquirer` role guidance
- `artifact-synthesis-protocol` (specialist-bound: template's `metadata.protocol` field → engine injects ONE named protocol per `agentExecutionEngine.ts:2456-2468`)
- `## §6 Pipeline Context` — empty (no upstream)
- External MCP services (eia, weather, eodhd, etc.) via `services` and `perform` tool calls

### PRODUCES
- **Side effects**: `task.comment` × 1-2 (status updates only — never the delivery channel)
- **finalResponse**: normalized event table in Markdown with prescribed structure:
  - `## Acquisition Summary` block — per-source OK/FAILED/PARTIAL status
  - `## Normalized Event Table` — flat Markdown table with columns: timestamp, source, source_id, type, actor, title, summary, url
  - Trailing `Confidence: N/100 — <rationale>`
- **`result.json` artifact** — wraps finalResponse + structured metadata (toolCalls, qualityMetrics, etc.). NO `report.md` (intermediate, no leaf-status).

### CONSUMED BY
- **Phase 1-2 Harvester via §6 Pipeline Context** — chained-context-injector reads Acquirer's `result.json.finalResponse` and pre-populates Harvester's prompt
- **Harness SYNTHESIZE later**: confidence score for quality gate; result.json for forensic audit-trail

### Empirical evidence
Run 6 Acquirer: 2m56s, 95 confidence, 29 tool calls (24 `services` + 3 `registry` + 2 `perform`), 17,080-char finalResponse, 301KB result.json. The size growth (`result.json` >> `finalResponse`) reflects the toolCalls array forensic data. See evidence file "Phase 0 Acquirer" section.

---

## Phase 1-2 Harvester (synthesis only)

**Mode**: Run after Phase 0 (or first if no Phase 0).
**Topology**: Synthesis (3-child or 4-child).
**Deliverable status**: Intermediate.

### READS
- Task description
- Universal template + `artifact_harvester` role guidance
- `artifact-synthesis-protocol` (specialist-bound)
- `## §6 Pipeline Context` — Phase 0 Acquirer's full `result.json.finalResponse` (or empty if no Phase 0)

### PRODUCES
- **Side effects**: `task.comment` × 1-2 (status only)
- **finalResponse**: 5-15 findings document with per-finding structure:
  - `## Finding N: <Title>`
  - `**What happened**` — concrete event description
  - `**Why surprising / load-bearing**` — what made it memorable
  - `**Resolution / outcome**` — verifiable details (file paths, metrics, error codes, quotes)
  - `**Artifact relevance**` — where this lands in target artifact
  - Trailing `Confidence: N/100 — <rationale>`
- **`result.json` artifact** — intermediate, NO `report.md`

### CONSUMED BY
- **Phase 3-6 Editor via §6 Pipeline Context**
- **Harness SYNTHESIZE later**: confidence + audit-trail

### Empirical evidence
Run 6 Harvester: 2m12s, 95 confidence, 7 tool calls, 18,005-char finalResponse, 79KB result.json. Notable: self-disclosed `agent.results(verbose: true)` use despite chained-context-prefer guidance. See evidence file "Phase 1-2 Harvester" section.

---

## Phase 3-6 Editor (synthesis only — DELIVERABLE PRODUCER)

**Mode**: Run after Harvester.
**Topology**: Synthesis (3-child or 4-child).
**Deliverable status**: Intermediate per dep-graph, BUT deliverable producer per Step 5a (the harness's `metadata.deliverableSourceTaskId` points HERE).

### READS
- Task description
- Universal template + `editorial_writer` role guidance
- `artifact-synthesis-protocol` (specialist-bound)
- `## §6 Pipeline Context` — Phase 1-2 Harvester's full `result.json.finalResponse` (the findings document)

### PRODUCES
- **Side effects**: `task.comment` × 1-2 (status only)
- **finalResponse**: full annotated/restructured/integrated artifact text (the customer article, 1500-2000 words for synthesis-pipeline target). Markdown-formatted prose. Trailing `Confidence: N/100`.
- **`result.json` artifact** — intermediate per dep-graph (Reviewer is downstream), NO `report.md`. But this `finalResponse` is what becomes the harness's `report.md` via engine extraction.

### CONSUMED BY
- **Phase 4+7 Reviewer via §6 Pipeline Context** — Reviewer reads the article to assess
- **Engine extraction at harness's SYNTHESIZE commit time** — `tx.agentArtifact.findFirst({where: { execution: { taskId: <Editor task id>, status: 'SUCCESS' }, name: 'result.json' }})` → parse `finalResponse` → write as harness's `report.md` content. THIS IS THE DELIVERABLE EXTRACTION.

### Empirical evidence
Run 6 Editor: 2m27s, 95 confidence, 10 tool calls, 17,247-char finalResponse, 117KB result.json. Editor's `finalResponse` byte-identical to harness's `report.md` (verified `byte_identical = t`). See evidence file "Phase 3-6 Editor" section + harness SYNTHESIZE engine extraction event.

---

## Phase 4+7 Reviewer (synthesis only — LEAF, QA gate)

**Mode**: Run after Editor.
**Topology**: Synthesis (3-child or 4-child).
**Deliverable status**: LEAF per dep-graph. **NOT** the deliverable producer (the harness's `metadata.suppressDefaultReportMd: true` is set on this task).

### READS
- Task description
- Universal template + `publication_reviewer` role guidance (with the **Artifact policy** bullet that names the suppression mechanism)
- `artifact-synthesis-protocol` (specialist-bound)
- `## §6 Pipeline Context` — Phase 3-6 Editor's full `result.json.finalResponse` (the article being reviewed)

### PRODUCES
- **Side effects**: `task.comment` × 0-2 (status only)
- **finalResponse**: structured review with:
  - Phase 4 (Self-Critique): conflation table with severity ratings + suggested splits
  - Phase 7 (Assess): rating in `READY (90+) / NEEDS EDITING (70-89) / NEEDS REVISION (50-69) / NEEDS REWORK (<50)` band with numeric score
  - Gap list per phase: severity HIGH/MEDIUM/LOW + exact location (section + paragraph) + specific fix recommendation
  - Trailing `Confidence: N/100 — <calibrated honesty against publishable bar>`
- **`result.json` artifact ONLY** — `suppressDefaultReportMd: true` honored by engine. NO `report.md`.

### CONSUMED BY
- **Harness SYNTHESIZE**: confidence score for quality gate; finalResponse for "key findings" synthesis section in pipeline-index.json. The Reviewer's review IS the QA telemetry, NOT the customer deliverable.
- **Customer (forensic only)**: visible via Agents tab → Artifacts → Reviewer's result.json. Customer reads it if they want the QA gap list.
- **NOT chained anywhere** — Reviewer is the leaf.

### Empirical evidence
Run 6 Reviewer: 1m20s, 82 confidence, 2 tool calls (cleanest pattern of any specialist — pure chained-context). 12,087-char finalResponse, 19KB result.json. Reviewer's role boundary is respected: "I did not re-verify [numeric figures] against the raw EIA/weather/EODHD source data ... outside my scope". See evidence file "Phase 4+7 Reviewer" section.

---

## Default-shape intermediate (e.g., Architect, Builder, Audit)

**Mode**: Run during cascade after dep clears.
**Topology**: Default (3-7 child shapes — Security Assessment, Development, Go-to-Market).
**Deliverable status**: Intermediate per dep-graph.

### READS
- Task description
- Universal template + role-specific guidance (Solution Architect, Senior Software Developer, Security Analyst, etc.)
- **NO specialist-bound protocol** — only the universal template + role guidance. (`pipeline-orchestrator-protocol` is harness-only via `loadProtocols`; default-shape children don't receive a protocol.)
- `## §6 Pipeline Context` — upstream specialist's full `result.json.finalResponse`, OR empty if first child (no deps)

### PRODUCES
- **Side effects**: `task.comment` × 0-3 (status only); occasional external tool calls (e.g., Audit specialist's `services.health` checks against MCP services)
- **finalResponse**: role-specific deliverable shape per role guidance:
  - Architect: framework/architecture document
  - Builder: implementation deliverable (code, configuration)
  - Audit/Reviewer: findings report with severity ratings
  - Documenter: prose document
  - Trailing `Confidence: N/100`
- **`result.json` artifact ONLY** — intermediate, NO `report.md`

### CONSUMED BY
- **Next downstream specialist via §6 Pipeline Context**
- **Harness SYNTHESIZE later**: confidence + audit-trail

### Empirical evidence
Run 7 Architect (no upstream deps): 1m14s, 92 confidence, 4 tool calls (minimal — read pov + write 1 comment), 25,995-char finalResponse, 71KB result.json. Run 7 Audit (depends on Architect): 1m26s, 78 confidence, 13 tool calls (Audit-specific `services.health` checks), 26,622-char finalResponse, 126KB result.json. See evidence file "Default-shape intermediate" section.

---

## Default-shape leaf (e.g., Documenter, Roadmap producer — DELIVERABLE PRODUCER + leaf)

**Mode**: Run last in cascade.
**Topology**: Default.
**Deliverable status**: BOTH leaf AND deliverable producer. The harness's CREATE Step 5a wires both metadata fields to this same child:
- `harness.metadata.deliverableSourceTaskId = <leaf id>`
- `leaf.metadata.suppressDefaultReportMd = true`

### READS
- Task description
- Universal template + role guidance (e.g., Technical Writer, Business Analyst — whatever role produces the customer-facing prose)
- NO specialist-bound protocol
- `## §6 Pipeline Context` — upstream specialist's full `result.json.finalResponse`

### PRODUCES
- **Side effects**: `task.comment` × 0-4 (status only)
- **finalResponse**: customer-facing deliverable in role-specific format. Markdown prose. Trailing `Confidence: N/100`.
- **`result.json` artifact ONLY** — `suppressDefaultReportMd: true` → NO `report.md`.

### CONSUMED BY
- **Engine extraction at harness's SYNTHESIZE commit time** — fetches THIS task's `result.json.finalResponse` → writes as harness's `report.md` content. THIS IS THE DELIVERABLE EXTRACTION (parallel to synthesis Editor's role, but the leaf in default shapes).
- **Harness SYNTHESIZE**: confidence + audit-trail

### Empirical evidence
Run 7 Roadmap leaf (Business Analyst): 1m12s, 72 confidence, 11 tool calls, 16,189-char finalResponse, 139KB result.json. `byte_identical = t` against harness's report.md (16,189 bytes). See evidence file "Default-shape leaf" section.

---

## Harness SYNTHESIZE mode

**Mode**: Re-fired automatically by `pipelineRetriggerReactorService` when all children are terminal. `metadata.pipelineStageId` is set + child stage all-terminal → resolver picks SYNTHESIZE.
**Topology**: Both shapes.
**Deliverable status**: Harness root.

### READS
- Its own `task.metadata` (`deliverableSourceTaskId`, `pipelineStageId`)
- `## Harness Context (Platform-Resolved)` block — resolver writes mode + childStageTerminalCount
- All children's `result.json.confidenceScore` — for quality-gate decision (≥70 accept, 50-69 retry, <50 escalate)
- All children's `result.json` artifacts via `agent.results` or chained context — for synthesis prose composition (key findings, audit trail)
- All children's `qualityMetrics`, `errorCategory`, `protocolValidation` — for forensic audit-trail in pipeline-index.json

### PRODUCES (work product)
- **Side effects**:
  - `task.context` × N (children) — read child status/results
  - `task.complete` × 1 — closes the harness task (gated by 4-point invariant server-side)
  - `task.comment` × 1 — final SYNTHESIZE comment (similar content to finalResponse — breadcrumb + deliverable pointer + quality gates + audit trail + re-run note)
- **finalResponse**: PIPELINE SYNTHESIS COMPLETE prose. Structure:
  - First line: `**Child stage:** \`<id>\` — <name>` breadcrumb
  - Quality Gate Summary table (per child)
  - Deliverable Wiring Verification (confirms metadata fields)
  - Run Test Goal Validation (custom, varies)
  - All child artifacts list (audit trail with fetch IDs)
  - **`📄 Final deliverable: fetch(id: "artifact-{{HARNESS_REPORT_MD_ID}}")`** — placeholder for engine substitution
  - Trailing `Confidence: N/100`
- **`pipeline-index.json` artifact** — wraps finalResponse + structured metadata (resolvedMode, qualityMetrics, toolCalls, **reportMdSource** when extraction fired)
- **DOES NOT directly produce `report.md`** — engine extracts in post-processing, see next section

### CONSUMED BY
- **Engine post-processing** (extraction + substitution — same transaction)
- **Customer**: GUI Pipeline Results panel shows SYNTHESIZE execution + ALL CLEAR signal + EXECUTIONS section
- **Reactor**: `pipelineRetriggerReactorService` checks for further retriggers (none — task is now COMPLETED-terminal)

### Empirical evidence
Run 6 SYNTHESIZE: 1m12s, 95 confidence, 10 tool calls, 3,359-char finalResponse, 132KB pipeline-index.json + 17,247-byte report.md. Run 7 SYNTHESIZE: 1m03s, 81 confidence, 8 tool calls, 3,485-char finalResponse, 118KB pipeline-index.json + 16,189-byte report.md. Both pre-substitution finalResponses contained 5 occurrences of `{{HARNESS_REPORT_MD_ID}}` (per Run 7 substitution log `replacements: 5`). See evidence file "Harness SYNTHESIZE mode" section.

---

## Engine post-processing (extraction + substitution)

**Mode**: Runs INSIDE the harness SYNTHESIZE execution's success-path `prisma.$transaction`, AFTER `tx.agentArtifact.createMany()` but BEFORE `tx.agentExecution.update SUCCESS`. Fires only for PIPELINE harness with `decision.source === 'upstream'` (gated condition in `agentArtifactPolicy.ts:getReportMdDecision`).
**Topology**: Both shapes.
**Implementation**: Engine-side success-path transaction at `agentExecutionEngine.ts:1317-1640`; mirrored in stream-route at `app/api/pov/agent/execute/stream/route.ts:1218-1460` (re-verified 2026-06-10 post tool-loop extraction).

### READS
- Harness's just-written `pipeline-index.json` content (the SYNTHESIZE finalResponse stringified)
- Source task's most-recent SUCCESS `result.json` content — POV-scoped (`task: { povId: thisPovId }` cross-tenant safety guard)
- Source task's `result.json` truncation marker — `[TRUNCATED: exceeded 5MB limit]` check
- Harness's just-written `report.md` artifact id (only after extraction succeeded)

### PRODUCES (Work product — purely server-side, engine doesn't speak to LLM)
- **Side effects**:
  - **Extraction**: writes harness's `report.md` content via `tx.agentArtifact.createMany` already invoked; engine just decides what `reportMdContent` is (Editor/leaf's finalResponse on success; error-header `# ⚠️ Report Extraction Failed` on failure)
  - **Substitution**: updates harness's `pipeline-index.json` content via `tx.agentArtifact.update` — substitutes `{{HARNESS_REPORT_MD_ID}}` placeholder for actual report.md id (using `String.split.join` for all occurrences in one pass)
- **Forensic field**: `result.json.reportMdSource = { mode: 'upstream', sourceTaskId, extractFailureReason? }` — written into the harness's pipeline-index.json
- **Forensic logs** (pino):
  - `Extracted upstream finalResponse for harness report.md` (info, level 30) — sourceTaskId, sourceExecutionId, sourceContentLength
  - `Substituted harness report.md ID in pipeline-index.json deliverable pointer` (info, level 30) — pipelineIndexArtifactId, reportMdArtifactId, **replacements** count
  - On failure: `Failed to parse upstream source result.json...`, `No upstream source artifact found...`, etc. (warn, level 40) + `Customer-facing report.md extraction failed; produced error-header report.md instead` (error, level 50) — Theme 1 fail-loud guarantee

### CONSUMED BY
- **Customer** via `fetch(id: "artifact-<harness's report.md>")` → gets the clean prose (Editor's article OR leaf's roadmap)
- **GUI ArtifactViewer** — renders `report.md` as the canonical customer deliverable
- **Admin via `PIPELINE-OBSERVABILITY-GUIDE.md` Phase 7 forensic recipes** — pm2 log inspection + reportMdSource SQL probe

### Empirical evidence
Run 7 events captured in pm2 buffer:
```
07:54:46.115Z — Extracted upstream finalResponse for harness report.md
              — sourceTaskId: cmojr93d20073..., sourceExecutionId: cmojrbypw...,
                sourceContentLength: 16189
07:54:46.143Z — Substituted harness report.md ID in pipeline-index.json deliverable pointer
              — pipelineIndexArtifactId: cmojreup3009h..., reportMdArtifactId: cmojreup3009i...,
                replacements: 5
```
28ms between extraction and substitution — same transaction. Run 6 events rolled out of pm2 buffer (older than buffer depth) but same code path; identical shape. See evidence file "Engine post-processing" section.

---

## Anti-patterns (common confusions)

### "SYNTHESIZE mode does Phase 7" — WRONG

**Phase 7 (Assess)** is the **Reviewer specialist's** job within `artifact-synthesis-protocol`. The Reviewer agent in its own execution produces the rating + gap list as its `finalResponse`.

**Harness SYNTHESIZE mode** is the **harness root's** third lifecycle mode (after CREATE / ORCHESTRATE). It CONSUMES the Reviewer's Phase 7 output for quality gating; it does NOT produce it.

Two completely different things called "synthesis" — easily conflated. Always disambiguate by saying "Reviewer's Phase 7" vs "harness's SYNTHESIZE mode".

### "Two report.md files compete" — WAS the bug, IS NOT after the rework

Pre-rework (before 2026-04-28): leaf produced `report.md` automatically (via `shouldProduceMarkdownReport`-based policy). In synthesis, the Reviewer leaf's `report.md` was the LEAF's QA review, NOT the customer article — leading to the Run 4 bug ("the deliverable that wasn't the deliverable").

Post-rework: leaf has `suppressDefaultReportMd: true` (Step 5a), so leaf produces only `result.json`. Harness has `report.md` (engine extracts from source). **Single canonical report.md**, on the harness root, contains the actual customer deliverable (Editor's article in synthesis; leaf's deliverable in default).

### "Customer fetches the leaf's report.md" — NO

Customer fetches the **harness's** `report.md`. The harness root carries:
- `pipeline-index.json` — forensic harness summary
- `report.md` — customer deliverable (extracted by engine)

The Reviewer (synthesis) has only `result.json` — that's the QA review, accessible by drilling into the Reviewer's Artifacts tab. NOT the customer deliverable.

### "The harness writes its own report.md" — NO

The harness writes its `pipeline-index.json` (its `finalResponse` becomes that artifact). The harness's `report.md` is written by the **engine post-processing**, NOT by the harness LLM. The harness's `finalResponse` and the harness's `report.md` are TWO DIFFERENT THINGS.

This is what the substitution variant of trust-direction-shift solves: harness can't reference its own report.md ID at compose time (engine generates that ID at commit). Placeholder + substitution bridges the gap.

### "Default pipeline doesn't use Step 5a" — WRONG

Default pipelines DO use Step 5a — the harness wires both metadata fields to the SAME child (the leaf). Net effect: same content (leaf's finalResponse), different artifact location (harness's report.md instead of leaf's). The metadata-driven extraction is shape-agnostic by construction (validated by Run 7).

---

## Related reading

- **`HARNESS-MENTAL-MODEL.md`** — concepts and design rationale (read this first if you're new to the harness)
- **`PIPELINE-OBSERVABILITY-GUIDE.md`** — runtime investigation (when something looks wrong)
- **`PIPELINE-HARNESS-USER-GUIDE.md`** — user-facing setup (admin building a new pipeline)
- **`WAR-STORIES-HARVEST.md`** — empirical lessons (especially story #7: substitution variant of trust-direction-shift)
- **`run6-run7-dataflow-evidence.md`** (same directory) — primary-source evidence this doc cites
- **`cline_docs/runs/run-comparison.md`** — run-series metrics tracker
- **`cline_docs/reviews/report-md-policy-rework-2026-04-28/implementation-plan.md`** — the rework's plan + 5-specialist review bundle
- **`cline_docs/reviews/report-md-pointer-substitution-2026-04-29/implementation-plan.md`** — the substitution follow-up plan

### Source-code anchors

| Behavior | File | Lines |
|---|---|---|
| Artifact policy decision | `lib/services/agentArtifactPolicy.ts` | `getReportMdDecision()` |
| Engine extraction | `lib/services/agentExecutionEngine.ts` | 1685-1730 |
| Engine substitution | `lib/services/agentExecutionEngine.ts` | 1810-1851 |
| Stream-route mirror | `app/api/pov/agent/execute/stream/route.ts` | 1370-1473 |
| Mode resolver | `lib/services/harnessModeResolver.ts` | (whole file) |
| Pipeline-retrigger reactor | `lib/services/pipelineRetriggerReactorService.ts` | (whole file) |
| Protocol validator | `lib/services/pipelineProtocolValidator.ts` | (whole file) |
| Tool-result truncation | `lib/services/agentExecutionEngine.ts` | 1605-1626 |
| Stale-execution watchdog | `lib/services/agentExecutionEngine.ts` | 162-218 |
| Universal template | `lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts` | 1-460 |
| Pipeline-orchestrator protocol prose | `scripts/seed-protocol-prompts.ts` | 80-380 |
| Artifact-synthesis protocol prose | `scripts/seed-protocol-prompts.ts` | 437-920 |
| Step 5a inline prose | `scripts/seed-protocol-prompts.ts` | (within orchestrator protocol body, post-Step 5) |
