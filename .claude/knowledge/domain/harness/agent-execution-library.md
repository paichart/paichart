# agent-execution-specialist — Domain Library

> ⚠ **ERRATA (2026-07-24/25 — completion-path unification; record:
> `cline_docs/reviews/completion-path-unification-2026-07-24/`)**: read this doc's completion-path
> claims and line refs with suspicion — (1) the 4-point PIPELINE invariant's inline copies in
> `task-complete-handler.ts` / `task-update-handler.ts` were DELETED; the ONE copy is
> `lib/tasks/services/complete-task-terminally.ts` `assertPipelineCompletionInvariant`, inherited by
> every human write-site incl. web + bulk; (2) the F9 TaskReady deferral and the F10
> programConfidence stamp moved core-side (`fireCompletionReactors` / `computeProgramConfidenceStamp`);
> (3) gate release is first-class from EITHER surface (GUI or MCP), cascades fire on all surfaces,
> and completion is dependency-ENFORCED — any "only MCP task.complete fires the reactor(s)" claim
> here is historical; (4) `validateTaskStatusTransition` lives in
> `lib/tasks/services/status-transitions.ts` (task.ts re-exports); (5)
> `AgentTaskService.updateExecution` was deleted (dead code).

> **Created 2026-06-11** (Protocol 12 wave 2): depth evicted from `.claude/agents/agent-execution-specialist.md`.
> Verbatim at eviction; dates are provenance. The paired discovery's proven greps outrank this file.

## [evicted] Pino Structured Logging for Agent Execution

### Logging Architecture (Two Systems)
| System | Purpose | Output |
|--------|---------|--------|
| **pino** (primary) | Server-side structured JSON logging | PM2 stdout (`pm2 logs paichart`) |
| **OAuth audit logger** | OAuth-specific file logging | `/var/log/paichart/oauth-audit.log` |

**Pattern Reference**: `/.claude/knowledge/patterns/pino-structured-logging-pattern.md` (Pattern #43, 96% confidence)

### Execution Domain Logger: `mcpLogger` (Unified)

Per the pino structured logging strategy (Pattern #43), loggers match the **code's domain**, not the entity being modified. The entire execution engine is MCP domain code. All events -- including task `executionStatus` sync writes and SSE streaming -- use `mcpLogger` to keep a single execution's log trail **filterable under one domain**.

**Engine** (`agentExecutionEngine.ts`): Uses Strategy B (module logger):
```typescript
import { mcpLogger } from '@/lib/logger';
const logger = mcpLogger.child({ module: 'AgentExecutionEngine' });
```

**Streaming route** (`stream/route.ts`): Uses `mcpLogger` directly (Strategy A):
```typescript
import { mcpLogger } from '@/lib/logger';
```

**Why NOT `taskLogger`/`apiLogger`**: Task status sync inside a `$transaction` is an execution lifecycle event, not a task CRUD operation. Using multiple domain loggers would fragment a single execution's trace across domains, making debugging harder.

### Correct pino API (Object-First)
```typescript
import { mcpLogger } from '@/lib/logger';

// Execution lifecycle state change (engine uses `logger` alias, same domain)
mcpLogger.info({ executionId: 'cxyz123', status: 'RUNNING', taskId: 'ctask456' }, 'Agent execution started');

// Execution success with artifacts
mcpLogger.info({ executionId: 'cxyz123', status: 'SUCCESS', artifactCount: 3, durationMs: 4500 }, 'Agent execution completed');

// Task executionStatus sync (still mcpLogger — it's an execution lifecycle event)
mcpLogger.info({ executionId: 'cxyz123', taskId: 'ctask456', executionStatus: 'SUCCESS' }, 'Task executionStatus synchronized');

// LLM service error — always use { err: error } key
mcpLogger.error({ err: error, executionId: 'cxyz123', llmProvider: 'anthropic' }, 'LLM generation failed');

// Transaction failure
mcpLogger.error({ err: error, executionId: 'cxyz123', transactionPath: 'error-path' }, 'Atomic transaction failed in execution engine');
```

### Production Log Analysis for Execution Engine

**Log file locations** (on production server via SSH):
- Engine logs (paichart-web): `/var/log/paichart/web-combined-1.log`
- MCP server logs (paichart-mcp): `/var/log/paichart/mcp-combined-0.log`

**Note**: `pm2 logs` output may be truncated. For full traces, `grep` the log files directly via SSH.

```bash
# Full execution trace for a specific execution (most reliable method)
ssh <PROD_USER>@<PROD_HOST> "grep 'TARGET_EXECUTION_ID' /var/log/paichart/web-combined-1.log"

# All agent execution lifecycle events (unified under mcp domain)
ssh <PROD_USER>@<PROD_HOST> "grep '\"module\":\"AgentExecutionEngine\"' /var/log/paichart/web-combined-1.log | tail -50"

# Per-turn LLM timing breakdown (added Mar 2026)
ssh <PROD_USER>@<PROD_HOST> "grep 'TARGET_EXECUTION_ID' /var/log/paichart/web-combined-1.log | grep 'turn completed'"

# Execution failures
ssh <PROD_USER>@<PROD_HOST> "grep '\"module\":\"AgentExecutionEngine\"' /var/log/paichart/web-combined-1.log | grep FAILED"

# MCP poll-and-return logs (Claude Desktop path)
ssh <PROD_USER>@<PROD_HOST> "grep 'TARGET_EXECUTION_ID' /var/log/paichart/mcp-combined-0.log"

# Streaming route execution logs (GUI path)
ssh <PROD_USER>@<PROD_HOST> "grep 'Streaming agent execution' /var/log/paichart/web-combined-1.log | tail -20"
```

### Execution Logging Checklist
When reviewing execution engine implementations, verify:
- [ ] Uses `mcpLogger` (or module child of it) for ALL execution events (not `console.log`)
- [ ] Does NOT mix `taskLogger`/`apiLogger` into execution code (keeps domain unified)
- [ ] pino API is object-first: `logger.method({ key: value }, 'message')`
- [ ] Error serialization uses `{ err: error }` key (not `{ error: error }`)
- [ ] No `console.log` / `console.error` / `console.warn` in execution files
- [ ] Per-turn LLM timing emitted to BOTH pino and `logs` array (dual-channel)
- [ ] `totalUsage` accumulates tokens across all agentic loop turns (not just initial call)
- [ ] Execution start log includes `executionId` and `taskId` (both paths)

## [evicted] Core Knowledge and Expertise

### 1. Execution Engine Architecture (agentExecutionEngine.ts - 2561 lines)

- **Pattern**: EventEmitter-based singleton with pending queue processing
- **Key Class**: `AgentExecutionEngine extends EventEmitter`
- **Singleton Access**: `AgentExecutionEngine.getInstance()`
- **Queue Processing**: `processPendingExecutions()` runs on initialization and periodically
- **Safety Net**: Outer try/catch in `processPendingExecutions()` prevents queue stalls
- **Key File**: `/lib/services/agentExecutionEngine.ts`

### System Prompt Assembly — `buildSystemPrompt()` Priority Chain (line ~1780, post-extraction)

Three-tier fallback for determining what system prompt the LLM receives:

1. **Priority 1 — Agent Template**: If the task has an assigned `agentTemplate` with a non-empty `promptTemplate`, use it. This is the normal production path — every task should have a named template. The `promptTemplate` column contains the fully-baked prompt (role guidance already inline from seed-time interpolation or GUI editing).

2. **Priority 2 — User System Prompt**: If no template but a user-configured system prompt exists (from the Agent Builder's task-mode "Task Instructions" field). Niche path.

3. **Priority 3 — Universal Template Fallback — REMOVED (commit `4077c049`, 2026-06-10)**: previously `resolvePAIchartUniversalTemplate(agentRole, task)` resolved `PAICHART_UNIVERSAL_BASE_TEMPLATE` with `${roleSpecificGuidance}` from `ROLE_GUIDANCE_LIBRARY` at runtime. Production usage was **zero** (0 of 128 executions), so the dead fallback was deleted and replaced with a fail-loud guard (see below). `ROLE_GUIDANCE_LIBRARY` is now **dead at runtime** — no execution path consults it. The Universal Template source remains only for offline/seed-time template authoring.

**Fail-loud guard (SHIPPED, commit `4077c049`)**: the engine now throws `NoTemplateAssignedError(execution.id, task.id)` when `resolvedTemplate` is null (engine `:570`, stream `:420`) — a clear typed error instead of silently falling through to the Universal Template. The error's `.code` surfaces through the outer-catch → `errorCategory` into `error.json` for GUI routing. This formally closed the Priority-3 path. Rationale: the GUI (Agent Builder) is the source of truth for templates; every task must have an explicit template assignment.

**Template ownership model (decided Apr 2026, task #83)**:
- **Seed scripts** are provisioning-only (run once at initial setup). They set ALL template fields — `promptTemplate`, `category`, `templateType`, `capabilities`, `constraints`, `tags`, `defaultRole`, `version`, model parameters.
- **GUI (Agent Builder)** is the ongoing editing surface. Edits write directly to the DB. However, the Agent Builder form only exposes a subset of fields: `role`, `prompt` (promptTemplate), `description`, and model parameters (`provider`, `model`, `temperature`, `maxTokens`, etc.). Fields like `category`, `templateType`, `capabilities`, `constraints`, `tags`, `defaultRole`, `version` are NOT editable via the GUI — they require psql or Prisma Studio to change after provisioning. Adding them to the form is straightforward but not yet wired.
- Re-running seed scripts after GUI edits **silently overwrites** user edits — no `isUserModified` protection exists. Convention: don't re-run seeds on a live DB.
- The execution engine reads template fields from the DB at execution time. It uses `resolvedTemplate.promptTemplate` for the system prompt, `resolvedTemplate.metadata` for protocol injection and model parameters. No runtime dependency on `.ts` source files for named templates.

#### Execution States
```
PENDING --> RUNNING --> SUCCESS
                   \-> FAILED
```

- **PENDING**: Execution created, waiting for queue processing
- **RUNNING**: Actively processing with LLM (status set via `updateExecutionStatus`)
- **SUCCESS**: Completed with artifacts (set inside `$transaction`)
- **FAILED**: Error occurred (set inside `$transaction`)

#### Transaction Atomicity Pattern (#37)

**Success Path** (line ~815):
```typescript
await prisma.$transaction(async (tx) => {
  // 1. Create artifacts
  // 2. Update execution to SUCCESS
  // 3. Update task executionStatus to SUCCESS
  // All three in one atomic transaction
});
```

**Error Path** (line ~890):
```typescript
await prisma.$transaction(async (tx) => {
  // 1. Update execution to FAILED
  // 2. Update task executionStatus to FAILED
  // 3. Create error artifact
  // All three in one atomic transaction
});
```

**Safety-Net Error Path** (line ~208, in processPendingExecutions):
```typescript
await prisma.$transaction(async (tx) => {
  // Catches errors that escape the main execution flow
  // Updates execution to FAILED + task to FAILED
});
```

#### Critical Anti-Pattern: updateExecutionStatus Cannot Accept tx

The `updateExecutionStatus` helper method (line ~1524) uses its own `prisma.` calls internally. It CANNOT be passed a transaction client (`tx`). Inside transactions, you MUST inline the update as `tx.agentExecution.update(...)` directly. This is a known architectural constraint.

### 2. Streaming Route (stream/route.ts)

> **Note**: The non-streaming GUI route was removed in Mar 2026. The GUI now always uses this streaming route.

- **Pattern**: SSE (Server-Sent Events) with TransformStream + agentic tool loop via `generateText`
- **Key File**: `/app/api/pov/agent/execute/stream/route.ts`
- **Architecture**: Long-lived HTTP connection with real-time event streaming. Uses `generateText()` (not `streamText()`) to get `stopReason`, `functionCalls`, and `rawContentBlocks` needed for multi-turn tool calling. Tool results are sent as formatted `text_chunk` SSE events with markdown formatting.

> **⚠️ CRITICAL WARNING (Apr 14, 2026):** The streaming route contains its OWN tool loop — independent from the one in `agentExecutionEngine.ts`. These are two parallel implementations of the same concern and will silently drift without a shared abstraction. Confirmed drift as of today:
>
> | Concern | Engine path | Stream path (historically) |
> |---|---|---|
> | `MAX_TOOL_TURNS` | Read from `template.metadata.modelParameters.maxToolTurns` | Was hardcoded `10` (fixed in commit `e008aba2`) |
> | PIPELINE auto-complete skip | Applied | Was missing (fixed earlier) |
> | Completion reactor hooks (INLINE) | Wired (`:1639-1640` post-extraction; fires `maybeRetriggerPipelineHarness` + `maybeQueueReadyDependents` after every completion) | **NOT wired inline** — see gap note below |
> | `TIMEOUT_PER_TURN_MS` (D-A) | 30s (halved at `98232961`, not mirrored) | Was 60s → 1980s total vs 1080s (fixed `9f55a9f4`, 2026-06-10) |
> | P2 provider-error fail-loud (D-B) | Present since Apr 2026 | Was ABSENT — GUI masked provider errors as "empty response" (fixed `b5a8d59c`, 2026-06-10) |
> | Per-tool `durationMs` (D-C) | Was turn-cumulative (inflated forensics) | Correct per-tool (engine fixed `349c8f84`, 2026-06-10) |
> | Model fallback chain (D-D) | Had call-site `?? haiku` bypassing env | Correct (engine fixed `64b7c864`, 2026-06-10) |
> | Initial-call provider fallback (D-E) | All 4 sites had `?? ANTHROPIC_SDK` | Initial call lacked it (3-of-4) — found by review field matrix; FIXED STRUCTURALLY by Phase 1 extraction (`dad7cd98`) |
> | `maxToolTurns` source (D-F) | `resolvedTemplate?.metadata` | `task.agentTemplate?.metadata` — different resolution paths; loop takes resolved number as input (Phase 2-3 contract) |
> | `result.json.modelUsed` accuracy (D-G) | Both paths read SOURCE config (`\|\| 'default'`), blind to settings/env resolution; provider metadata misreported `this.model` not `effectiveModel` | Found by Phase-1 smoke (GUI run showed 'default'); fixed `6eb9e5c9` — provider reports effectiveModel, both feeds chain response-metadata → normalized → 'default' |
>
> **EXTRACTION COMPLETE (2026-06-10)**: the tool loop now has EXACTLY ONE
> implementation — `lib/agents/harness/agentic-tool-loop.ts` (657 lines):
> `normalizeModelConfig` + two-mode `buildLlmCallOptions` (Phase 1:
> `00325b21`/`89924430`/`dad7cd98`), `executeToolTurn` (Phase 2:
> `584ff06a`/`6dae2f53`/`0af88cf5`), `runAgenticToolLoop` incl. the P2 check
> and #89 correction turn (Phase 3: `099d1361`/`241d4fea`/`ebc20d27`). Both
> callers are now wiring blocks: the engine passes 2 observers (EventEmitter
> progress), the stream passes 7 (every SSE event + logs[] entry at its
> original wire position). Caller-side per A6: stop-reason handling, #90
> retry, detection cascade, content validation, the abort timer.
> Gates: `test:llm-call-options` (35) + `test:agentic-tool-loop` (61, incl.
> the 2026-04-16 incident replay, H2 turn-accounting invariants, H3 verbatim
> pino-string contract) — both in test:all-validation. Engine soak passed
> pre-stream-flip (cmq7kd3gr, H4). **The drift table above is now historical
> record — this class of drift is structurally impossible.** The warning at
> the top of this section remains valid for OTHER cross-path concerns
> (reactor hooks, completion semantics, cascade signals).
>
> **Phase 0 convergence (2026-06-10)**: the four D-A..D-D drifts above were found in ~20 min of
> side-by-side inventory for the tool-loop extraction plan (`cline_docs/agent-tool-loop-extraction-plan.md`)
> and fixed as 4 independent commits. The loops are now behaviorally identical — the planned
> extraction (Phases 1-3) is what makes them STAY identical.
>
> **🟠 Reactor parity gap (DEFERRED 2026-06-09, from the stream-route parity sweep):** the engine fires both
> post-completion reactors INLINE as a safety net (independent of the agent calling `task.complete`); the SSE
> stream route fires NEITHER. NOT a blanket break: the reactors ALSO fire from `task-complete-handler.ts:349-350`,
> so a GUI pipeline child whose agent calls `perform(task.complete)` cascades fine. The deferred gap is the
> edge cases the inline net would catch: (a) a GUI pipeline child whose agent FAILS to call task.complete → no
> harness re-trigger → stall; (b) a GUI-executed NON-pipeline task with dependents (sets `status:COMPLETED`
> directly, no task.complete) → `maybeQueueReadyDependents` never fires → dependents never queue. Uncertain GUI
> value + real-pipeline-touch risk → not fixed; see `dual-execution-path-parity-pattern.md` (Post-completion
> reactors row) + `pipeline-harness-specialist.md`.
>
> **Rule of thumb:** When introducing ANY rule that applies to "agent execution" (turn budgets, completion semantics, reactor hooks, status transitions, type-specific guards), audit BOTH paths and either mirror the code or extract a shared function. Grep the stream route for `MAX_TOOL_TURNS`, `task.update`, completion-status setters, and anything else touching execution lifecycle.
>
> See `.claude/knowledge/domain/harness/automation-loop-closure-architecture.md` §Hindsight Lessons for the debugging story that led to this warning.

> **Engine-skip is load-bearing for harness defense reachability (Apr 2026):** The `isPipelineTask` check at `agentExecutionEngine.ts:1604,1614` and `app/api/pov/agent/execute/stream/route.ts:1444,1450` (verified 2026-06-10 post-extraction) is what makes the handler-side 4-point invariant defense reachable. Without the skip, PIPELINE tasks would auto-complete via the engine's success-path task update and bypass `task-complete-handler.ts`'s invariant entirely — silent corruption defense vanishes. **`scripts/test-pipeline-engine-skip.ts` regression test locks this in** — if a future refactor removes either skip, the test fails. Treat the skip as a structural invariant, not a convenience.

#### SSE Event Types (13 total)
| Event Type | Purpose | When Emitted |
|-----------|---------|-------------|
| `execution_started` | Initial handshake (executionId, taskId, taskTitle, startTime) | First event on stream open |
| `text_chunk` | LLM text output (PROSE ONLY since 2026-06-10 — tool results moved to `tool_result_card`) | During streaming response |
| `tool_result_card` | Structured tool outcome `{turn, tool, server, success, durationMs, preview, error?}` for the Monitoring activity feed (stream-only by design — SSE is presentation-layer) | After each tool executes (via `onToolResult` observer) |
| `prompt_snapshot` | Runtime-assembled prompts `{systemPrompt, userPrompt, lengths}` — the ONLY place the exact LLM input is visible (not persisted; live-only + stream-only by design) | Once, before the loop call |
| `log_update` | Execution log entries | Throughout execution |
| `execution_update` | Status change notification | On state transitions |
| `artifact_created` | New artifact available | After artifact persistence |
| `function_call` | LLM function/tool call | When LLM invokes a tool |
| `web_search_results` | Web search data | When LLM searches the web |
| `citations` | Source citations | When LLM provides citations |
| `search_queries` | Search query terms | When LLM generates queries |
| `error` | Error notification | On execution failure |
| `[DONE]` | Stream termination | End of execution |

#### SSE-After-Commit Pattern

The streaming route follows a critical pattern: **batch DB operations first, send streaming events after commit**. This prevents clients from receiving events about state that hasn't been persisted yet.

```typescript
// CORRECT: DB write inside transaction, SSE event after
await prisma.$transaction(async (tx) => {
  // DB writes here (execution + task + artifact)
});
// SSE events here (after transaction committed) — always via safeWrite
// (2026-08-21: ALL SSE writes route through safeWrite; raw writer.write is
// banned by test:terminal-persist-ponr P7 — disconnect stops streaming, never work)
await safeWrite(`data: ${JSON.stringify({type: 'artifact_created', ...})}\n\n`);
```

#### Log Optimization

`updateExecutionLogs` was optimized from 9 DB writes to 1 checkpoint + final transaction:
- Logs accumulated in an in-memory array during execution
- Sent to client via SSE `log_update` events for real-time feedback
- Persisted to database only at checkpoints and final completion
- Reduces DB write pressure from O(n) to O(1) per execution

#### Dual-Channel Logging (Mar 2026)

Both execution paths emit timing data to **two separate channels**:

| Channel | Fed By | Destination | Content |
|---------|--------|-------------|---------|
| **`logs` array** (in-memory) | `logs.push(...)` | SSE `log_update` → GUI log panel → DB `agentExecution.logs` | Human-readable: `"Turn 3 LLM: 140.6s (85,000 tokens)"` |
| **pino / `mcpLogger`** | `mcpLogger.info({...})` | PM2 stdout → `/var/log/paichart/web-*.log` | Structured JSON: `{ turn: 3, llmDurationMs: 140600, inputTokens: 85000 }` |

The `logs` array is request-scoped (local variable in handler), garbage collected when the request completes. Adding per-turn entries (~60 chars each) has negligible memory impact.

#### Per-Turn LLM Timing (Mar 2026)

Both paths now emit per-turn timing for the agentic loop:
- **Initial LLM call**: `llmDurationMs`, `inputTokens`, `outputTokens`, `stopReason`, `turn: 0`
- **Each agentic turn**: `turn`, `toolDurationMs`, `llmDurationMs`, `inputTokens`, `outputTokens`, `stopReason`
- **Completion**: `executionTimeMs`, `tokensUsed`, `turnCount`, `toolCallCount`

This enables instant diagnosis of slow executions — e.g., "Turn 3 tools took 45ms but LLM took 140s with 85K input tokens."

#### Token Accumulation (Streaming Route)

The streaming route now tracks `totalUsage` across all agentic loop turns (matching the engine path). Previously only the initial LLM call's tokens were counted.

#### Error Handling in Streaming

When `generateText()` throws (outer catch block):
```typescript
// Atomic error transaction (3 writes -> 1 transaction)
await prisma.$transaction(async (tx) => {
  // 1. execution -> FAILED
  // 2. task -> FAILED
  // 3. Create error.json artifact
});
// Then send SSE events: error, log_update, execution_update, artifact_created, [DONE]
```

**Note**: Since the route uses `generateText()` (not `streamText()`), there is no `chunk.error` path. Errors are thrown as exceptions and caught by the outer `catch` block.

### 4. LLM Provider Architecture

#### Provider Stack
- **LLM Service**: `/lib/services/llm/llm-service.ts` (1004 lines) - Provider-agnostic orchestration
- **Types File**: `/lib/services/llm/types.ts` (1060 lines) - Model registry, interfaces, token defaults, content block types (`text`, `tool_result`, `tool_use` blocks)
- **Anthropic SDK Provider**: `/lib/services/llm/anthropic-sdk-provider.ts` (792 lines) - Primary provider
- **Core Methods**: `generateText()` (used by both engine AND streaming route for agentic tool loop; streams internally via `stream().finalMessage()` since 2026-07-04). `streamText()` was DELETED 2026-07-04 (zero callers + fatal input_json_delta bug — follow-ups item 4); `llm-service.streamText` falls back to `generateText` for providers without the method
- **Abort Signal**: `LLMRequestOptions.signal` threads through to `client.messages.create(body, { signal })` in the Anthropic SDK
- **Multi-Tool Response Fields (P4)**: `LLMResponse` now exposes `functionCalls?: Array<{id, name, arguments}>` (all tool_use blocks, not just first), `stopReason?: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'pause_turn' | 'refusal'`, and `rawContentBlocks?: any[]`
- **Content Block Arrays**: `MessageWithCacheControl.content` widened from `string` to `string | Array<text|tool_result|tool_use blocks>`. Provider handles `Array.isArray(msg.content)` in `generateText` (the `streamText` sibling handled it too until its 2026-07-04 deletion).
- **tool_use Collection**: Provider uses `.filter()` (not `.find()`) for tool_use blocks — captures ALL tool calls per response, not just the first. `functionCall` (singular) is backward-compat alias for `functionCalls[0]`.

#### Per-Request Isolation (Mar 2026 — Singleton Mutation Fix)

The LLM provider is a **singleton**. Prior to Mar 2026, `setModel()` and `setApiKey()` mutated the singleton, causing cross-request model bleed and cross-user API key leakage. Both were eliminated:

- **Model**: Passed per-request via `LLMRequestOptions.model` → `mergedOptions.model || this.model` (`effectiveModel` pattern in provider)
- **API Key**: Passed per-request via `LLMRequestOptions.apiKey` → `getClientForRequest()` creates a one-off `Anthropic` client when apiKey differs from default
- **User Settings**: `llmService.resolveUserSettings(userId)` returns `{ provider, apiKey }` without mutating. Callers thread these into `generateText()` options.
- **`setModel()`/`setApiKey()`**: Removed from provider. Interface comment warns against reintroduction.

#### API Key + Model Resolution Chain
```
Per-request options.apiKey  (from resolveUserSettings — user's own key)
  -> Constructor default    (process.env.ANTHROPIC_API_KEY)

Per-request options.model   (from task modelParameters)
  -> User settings model    (from resolveUserSettings — future, Issue 5)
    -> Environment ANTHROPIC_MODEL
      -> Hardcoded 'claude-haiku-4-5'  (lowest)
```

#### Current Model Registry (Mar 2026)
```typescript
// lib/services/llm/types.ts - anthropicModels
'claude-haiku-4-5'   // Default. Fastest. Lightweight tasks.
'claude-sonnet-4-6'  // Best for everyday tasks with reasoning.
'claude-opus-4-6'    // Most capable. Complex analysis.
```

#### How to Update Default Model
1. Update hardcoded fallback in `anthropic-sdk-provider.ts` constructor (line ~44)
2. Update `.env` and `.env.production` `ANTHROPIC_MODEL=`
3. Update model registry in `types.ts` (`anthropicModels`) — use alias not dated ID
4. Update all UI defaults: `AgentBuilder.tsx`, `AgentBuilderForm.tsx`, `AgentConfigTab.tsx`, `ModelParametersSection.tsx`
5. Update fallbacks in `agent-templates-adapter.ts` (4 references). NOTE: `agentExecutionEngine.ts` call-site fallbacks were REMOVED 2026-06-10 (D-D, commit `64b7c864`) — the engine now resolves `config.model ?? userLLMSettings.model` and lets the provider default (env `ANTHROPIC_MODEL` → hardcoded) handle the tail, per the documented chain. Do NOT re-add call-site model fallbacks to either execution path.
6. Update template fallback in `agentTaskService.ts` (line ~224) — model AND provider
7. Update `seed-agent-templates.ts`
8. Update model list order in `route.ts` (llm/models), UI components, `ModelParametersSection.tsx`

**Grep to find all default model references**:
```bash
grep -rn "claude-haiku-4-5\|claude-sonnet-4-6\|claude-sonnet-5\|claude-opus-4-8\|claude-opus-5\|claude-fable-5\|ANTHROPIC_MODEL" --include="*.ts" --include="*.tsx" --include="*.env" | grep -v node_modules | grep -v .next
```

#### How to Add/Update Provider Models
1. Add model entry to `anthropicModels` in `types.ts` with `name`, `description`, `maxTokens`, `contextWindow`, `supportsStreaming`, `supportsFunctions`, `supportsPromptCache`
2. Add to model list arrays in: `AgentBuilderForm.tsx`, `AgentConfigTab.tsx`, `ModelParametersSection.tsx`, `app/api/llm/models/route.ts`
3. If thinking-capable: verify `effectiveModel.includes()` check in `anthropic-sdk-provider.ts` (~line 177, ~511) matches the model ID pattern
4. Use **alias** (e.g., `claude-haiku-4-5`) not dated ID (e.g., `claude-haiku-4-5-20251001`) — aliases auto-resolve to latest

#### Thinking Model Detection
Models containing `sonnet-4` or `opus-4` in the ID are detected as "thinking" models. This enables extended thinking parameters in the API call (`thinking.type = 'enabled'`). This check uses `effectiveModel` (per-request) in `anthropic-sdk-provider.ts` lines ~177 and ~511.

#### Execution-Level Timeout (Mar 2026)

All 3 LLM call sites are protected by `AbortController` timeouts. The engine path uses a **1080-second (18-minute) scaled timeout** to accommodate multi-turn tool loops; the route-level paths use matching constants:

| Call Site | File | Timeout Var | Abort Var | Duration |
|-----------|------|-------------|-----------|----------|
| Engine `executeAgent()` | `agentExecutionEngine.ts` | `executionTimeoutMs` | `executionAbort` | **1080s** (scaled: `MAX_TOOL_TURNS * TIMEOUT_PER_TURN_MS` = 30 * 30s) |
| Streaming route | `execute/stream/route.ts` | `streamTimeout` (hoisted) | `streamAbort` | Scaled — **genuinely matches engine since 2026-06-10** (D-A fixed un-mirrored 60s/turn → 30s; was 1980s vs 1080s) |
| MCP poll-and-return | `task-action-handler.js` | `maxWaitMs` | N/A | **1140s** (19 min — engine worst case 1080s + 60s buffer; raised from 300s 2026-06-10) |

**Engine timeout constants**:
- `MAX_TOOL_TURNS = 30` — hard cap on agentic loop iterations (increased from 10, Apr 2026)
- `TIMEOUT_PER_TURN_MS = 30_000` (30s per turn)
- Total: `30 * 30_000 = 1_080_000ms` (18 min)

**Signal threading path**: `AbortController.signal` → `LLMRequestOptions.signal` → `mergeOptions()` spread → `client.messages.create(body, { signal })` in Anthropic SDK. Signal is now passed to ALL `generateText()` calls in the agentic loop (was previously missing from continuation calls).

On abort, the error is caught by the existing error paths which run the atomic `$transaction` (FAILED + task FAILED + error artifact). No new error handling was needed — the existing paths handle `AbortError` the same as any other error.

**Streaming route note**: `streamTimeout` is hoisted before the `try` block so `clearTimeout` is accessible in the `catch`. Cleared in 2 places: after successful completion and in the outer `catch`.

#### Embedded Server Tool Registration (Mar 2026)

The embedded server registers **6 consolidated tools** via an `allTools` object and a `for...of` loop (not individual `.set()` calls):

| Consolidated Tool | Dispatcher | Actions | Delegates To |
|---|---|---|---|
| `project` | `ProjectDispatcher` | `pov.list`, `pov.details`, `task.list`, `task.context` | basicTools + advancedTools |
| `perform` | None (direct bind) | 14 actions via three-tier fallback | `advancedTools.handleExecuteTaskAction` |
| `analytics` | `AnalyticsDispatcher` | `recommendations.get`, `team.performance` | advancedTools |
| `template` | `TemplateDispatcher` | `list`, `details` | basicTools |
| `services` | `ServicesDispatcher` | `discover`, `call`, `health`, `workflow.*` (7 total) | hubTools |
| `registry` | `RegistryDispatcher` | `register`, `list`, `update`, `delete`, `tools` | hubTools |

**Architecture**: 5 dispatchers route by `action` parameter to handler methods. `perform` is intentionally NOT a dispatcher — it uses the three-tier fallback pattern (direct → HTTP → fail-closed) shared by all 14 of its actions, with special pre-processing only for `pov.create` (rate limiting), `stage.create`/`task.create` (parameter hoisting), and `agent.execute` (fire-and-forget + poll-and-return). The remaining 10 actions flow generically through the three-tier dispatch. This architecture is proven and should not be split into a dispatcher unless LLM tool-call accuracy degrades from the 14-action schema overload.

`HubToolsHandler` is instantiated with the shared `prisma` singleton. All auth, SSRF prevention, rate limiting, and access control are enforced inside handlers — not in the transport layer.

### 5. Agentic Tool Loop (P4 -- Mar 2026)

The execution engine now supports multi-turn tool calling, implementing the full Anthropic `tool_use`/`tool_result` protocol:

#### Loop Structure
```
Initial LLM call (generateText)
  while (stopReason === 'tool_use' && functionCalls?.length && turnCount < MAX_TOOL_TURNS)
    Execute ALL tool_use blocks for this turn (not just first)
    Build tool_result array (success or is_error: true)
    Append assistant rawContentBlocks + user tool_result to message history
    Call generateText again (with signal!)
    Accumulate tokens
    turnCount++
  Final response (stopReason !== 'tool_use')
```

#### Key Constants
- `MAX_TOOL_TURNS = 30` — hard cap prevents infinite loops (increased from 10, Apr 2026)
- Tool result has **two independent truncation rules** — see "Two-tier tool result truncation" below

#### Two-tier tool result truncation (Apr 2026)

There are **two distinct tool-result truncation rules** in the engine, with different thresholds, different purposes, and different scopes. They are easy to conflate. They are not redundant — the first protects the LLM during the tool loop; the second protects the persisted artifact from chained-context cascade. **Both must be present.**

| Rule | Threshold | Where applied | What it protects |
|------|-----------|---------------|------------------|
| **Tier 1: LLM-loop truncation** | 8 KB (`MAX_TOOL_RESULT_LENGTH = 8000`) | **`lib/agents/harness/agentic-tool-loop.ts`** (`executeToolTurn` — extraction 2026-06-10; was inline in both callers) — applied to the `toolResultContent` string fed BACK to the LLM as a `tool_result` content block | LLM context window during the next loop turn — large tool outputs would otherwise blow the model's input budget |
| **Tier 2: Persistence truncation** | 50 KB per `toolCalls[].result` entry | **`lib/services/execution-artifacts.ts:~155-168`** (inside `buildExecutionResultJson` — moved there at the May 2026 `e480a5c0` extraction; this row previously pointed at the caller files, stale) | Persisted `result.json.toolCalls[].result` size, specifically against the **chained-context cascade** failure mode |

**The asymmetric coverage gap (closed 2026-04-28)**: until commit `c1492c70`, only Tier 1 existed. That meant the LLM's context window was bounded during the tool loop, but the structured `toolCallResults.push({result: toolResult})` site (now inside `executeToolTurn` in the shared module) stored the FULL untruncated result for persistence. When a downstream agent in a synthesis chain called `perform(action: "agent.results", taskId: <upstream>, verbose: true)`, the upstream's full result.json — including its own toolCalls[] with their own results — got persisted in the agent's own `toolCalls[N].result` field. The next agent down the chain compounded again. Empirical observation on the 2026-04-27 Trial A run: Acquirer 300KB → Harvester 1.7MB → Editor 5.2MB (broke Postgres JSONB parser on deep escape nesting). Tier 2 closes this by truncating any per-call result over 50KB to a `{truncated, originalSize, preview, note}` shape.

**Threshold rationale (50KB)**: typical individual MCP service responses are 5-30KB (EIA / weather / eodhd / project tools observed in production). 50KB lets normal tool calls pass unchanged. Pathological upstream-artifact-fetch calls (which can be MBs) get bounded at the depth-cascade source. Forensic visibility preserved via the truncation record's `originalSize` + `preview` (2KB) — diagnosing what data the agent saw doesn't require storing every byte.

**What Tier 2 does NOT do**: it does not change agent behavior — agents may still call `agent.results` / `fetch` redundantly even when chained context already covers the upstream output. The structural fix to that wastefulness lives in the universal template's Tool Workflow §2 ("prefer chained context over re-fetching", added 2026-04-28). Tier 2 bounds the consequence regardless of whether the agent follows the rule.

**When extending the engine**: if you add a new persistence path that captures tool-call results, mirror Tier 2 there too. The two-execution-path-parity pattern applies — both engine and stream-route already mirror this; any third path needs the same.

#### Per-Turn Tool Execution
- ALL `functionCalls[]` in the response are executed (not just `functionCall` singular)
- Tool errors are returned as `is_error: true` tool_result blocks — the LLM adapts and retries or reports
- Each tool call records `turn` number and `durationMs` in artifact metadata

#### Message History Construction
- **Assistant turns**: Use `rawContentBlocks` from provider (preserves text + tool_use blocks with IDs)
- **User turns**: Array of `tool_result` blocks with `tool_use_id` matching the assistant's tool_use IDs
- Content block arrays (not strings) maintain proper Anthropic API format

#### Signal and Timeout
- `signal` from `AbortController` is passed to ALL `generateText()` calls in the loop (was previously missing from continuation calls — fixed in P4)
- Scaled timeout (1080s) accommodates up to 10 tool turns

#### Progress Events
- Proportional `loopProgress(turn, phase)` events in the **75-90% band**
- Phase indicators: `executing_tools`, `awaiting_llm`, etc.

#### Token Accumulation
- `totalUsage` object tracks `inputTokens` and `outputTokens` across all turns (not mutation of original response)
- Final artifact includes aggregated token counts

#### Stop Reason Handling
| Stop Reason | Behavior |
|-------------|----------|
| `end_turn` | Normal completion — use response text |
| `tool_use` | Continue loop (execute tools, call LLM again) |
| `max_tokens` | Truncation note appended, exit loop |
| `refusal` | Error — execution fails with refusal message |
| `stop_sequence` / `pause_turn` | Normal exit from loop |

#### Artifact Metadata
The `result.json` artifact includes a `toolLoop` summary:
```json
{
  "toolLoop": {
    "totalTurns": 3,
    "hitMaxTurns": false,
    "totalToolExecutions": 7
  }
}
```
Each tool call entry includes `turn`, `durationMs`, `tool`, `server`, `arguments`, `result`/`error`, `success`, `timestamp`. As of 2026-04-26 (commit `d652a630`) tool execution forensics live ONLY in `result.json.toolCalls` (structured) — they are NOT concatenated onto `finalResponse` and therefore NOT echoed into `report.md`. See "Deliverable Contract" below.

#### JSON Schema Generation (P4 -- Deferred #2 COMPLETED)
Tool definitions now use real JSON Schema via `zod-to-json-schema` with `jsonSchema7` target in `embedded-server.ts`. This replaces the previous stub that returned `{type: 'object', properties: {}, additionalProperties: true}` for all tools. LLM tools now get proper structured parameter definitions.

### 6. MCP Tool Execution Path (Claude Desktop)

The execution engine has a second execution path beyond web GUI streaming:

#### Architecture
```
Claude Desktop --(stdio)--> MCP Server (paichart-mcp)
  --(HTTP POST)--> /api/mcp/tasks/action
    --> agent-execute-handler.ts (fire-and-forget)
    --> agentExecutionEngine.executeById()
```

#### Key Files for MCP Path
| File | Purpose |
|------|---------|
| `/lib/mcp/tasks/action/handlers/agent/agent-execute-handler.ts` | Fire-and-forget dispatcher |
| `/lib/mcp/server/tools/advanced/task-action-handler.js` | MCP-side poll-and-return |
| `/lib/mcp/handlers/agent-results-handler.ts` | Results retrieval handler |
| `/lib/mcp/handlers/agent-status-handler.ts` | Status polling handler |
| `/lib/mcp/server/utils/api-client.js` | HTTP client (30s timeout) |
| `/lib/mcp/server/config/server-config.js` | Timeout/retry config |
| `/lib/validation/mcp-action-validation.ts` | Zod schemas for all actions |

#### Fire-and-Forget + Poll-and-Return Pattern
The MCP path uses a two-layer pattern to avoid HTTP timeouts:
1. **Web server** (`agent-execute-handler.ts`): Dispatches execution with `.then()/.catch()` (no await), returns instantly
2. **MCP server** (`task-action-handler.js`): Polls `agent.status` every 5s for up to 1140s (19 min), then fetches `agent.results` and returns everything in one shot

**Critical**: The HTTP timeout between MCP server and web server is 30s. LLM calls take 30-120s. Individual poll calls are <1s. MCP tool calls from Claude Desktop have NO timeout.

#### Validation Schema Gotcha
The Zod validation at `/lib/validation/mcp-action-validation.ts` strips unknown fields. Every field the handler needs MUST be in the schema. Example: `agent.status` schema must include `executionId` or polls will silently fail.

### 7. Supporting Services

| Service | File | Lines | Purpose |
|---------|------|-------|---------|
| Agent Template Service | `/lib/services/agentTemplateService.ts` | 751 | Template loading and variable injection |
| Agent Task Service | `/lib/services/agentTaskService.ts` | 602 | Execution setup: model resolution, config assembly, CAS guard |
| Validation (Web) | `/lib/validation/agent-template-validation.ts` | 711 | AgentExecuteSchema with prompt injection prevention |
| Validation (MCP) | `/lib/validation/mcp-action-validation.ts` | 703 | Zod schemas for all MCP actions |
| Rate Limiting | `/lib/middleware/rate-limit.ts` | 403 | `agentExecutionLimiter` for execution endpoints |
| POV Helpers | `/lib/utils/pov-helpers.ts` | 182 | `getPOVFromTask` for task-to-POV resolution |
| POV Access | `/lib/auth/validate-pov-access.ts` | 558 | POV access validation and authorization |
| Embedded MCP Server | `/lib/mcp/embedded-server.ts` | 2839 | Tool execution during LLM calls (6 consolidated tools, ~33 actions) |
| Hub Tools Handler | `/lib/mcp/server/tools/hub-tools-handler.js` | 291 | Hub service call/discovery/workflow delegation |
| Context Enricher | `/lib/mcp/server/middleware/context-enricher.js` | 96 | Per-request user context (not global) |
| Resource Manager (TS) | `/lib/services/mcp/resourceManager.ts` | 2053 | Artifact cleanup (keep last 3 per task), implements `IResourceManager` |
| Resource Manager Shared | `/lib/mcp/resource-manager-shared.js` | 132 | Shared constants (`RESOURCE_KEY_PREFIX`, `CACHE_DEFAULTS`), helpers (`buildResourceKey`, `generateDownloadUrl`) |
| Resource Manager Types | `/lib/mcp/resource-manager-types.ts` | 124 | `IResourceManager` interface, `POVContext`, `BaseResource` types |

### 8. Artifact Generation and Lifecycle

Both execution paths create artifacts atomically inside transactions.

#### Deliverable Contract (2026-04-26)

The `finalResponse` field — the LLM agent's last assistant message — is the **single canonical deliverable channel** for an execution. The contract has three downstream consumers and they all read the same field:

1. **Customer-facing deliverable** (leaf tasks only): `report.md` is `finalResponse` rendered verbatim as Markdown
2. **Pipeline chained context** (intermediate tasks): downstream specialists' context-chainer reads upstream `result.json.finalResponse` — never comments, never report.md
3. **Forensics**: `result.json.finalResponse` for programmatic access

**Comments are coordination, not delivery.** `task.comment` is for short status/coordination updates (e.g., "workflow submitted, polling..."). Never the delivery channel. The pre-2026-04-26 pattern of splitting deliverables across multiple 2,000-char comments is gone — the engine §8 prose was rewritten in commit `d0c0f2d8`, the universal template + role guidance in `04fb7630`, the orchestrator templates in `ff5a6bf0`.

**Tool execution forensics stay structured.** As of commit `d652a630` (2026-04-26) the engine no longer concatenates per-turn `## Tool Execution (Turn N)` markdown onto `finalResponse`, and the stream route no longer accumulates `**Tool Result**` text into `generatedText`. Tool data lives in `result.json.toolCalls` (full per-turn array with `arguments`, `result`/`error`, `success`, `durationMs`, `timestamp`). SSE `text_chunk` events still fire for live UI tool-result visibility — only the persisted-artifact accumulator stops carrying the dump.

#### Artifact Policy (`lib/services/agentArtifactPolicy.ts`, 2026-04-28)

`getReportMdDecision()` returns a discriminated union (`{produce:false}` | `{produce:true, source:'self'}` | `{produce:true, source:'upstream', sourceTaskId}`) gating report.md creation:

| Task type | dependents | metadata signal | JSON artifact | report.md? |
|-----------|-----------|------------------|---------------|------------|
| `PIPELINE` (harness root) | any | `metadata.deliverableSourceTaskId` set + source SUCCESS | `pipeline-index.json` | ✅ — engine extracts source task's `finalResponse` (= customer deliverable, e.g., Editor's article in synthesis) |
| `PIPELINE` (harness root) | any | metadata set, source NOT yet SUCCESS | `pipeline-index.json` | ❌ — Option A defense; prevents harness CREATE writing misleading report.md before children complete |
| `PIPELINE` (harness root) | any | (no metadata) | `pipeline-index.json` | ❌ — default; pre-existing pipelines or skipped Step 5a |
| Non-PIPELINE | 0 (leaf) | `metadata.suppressDefaultReportMd: true` | `result.json` | ❌ — leaf is QA gate or otherwise not the deliverable; harness publishes |
| Non-PIPELINE | 0 (leaf) | (no metadata) | `result.json` | ✅ — `report.md = finalResponse` verbatim, customer-facing |
| Non-PIPELINE | 1+ (intermediate) | n/a | `result.json` | ❌ — chained context only; not directly consumed by humans |

**Deliverable extraction** (engine + stream-route): when `decision.source === 'upstream'`, the engine's success-path transaction fetches the source task's most-recent SUCCESS `result.json`, parses `finalResponse`, and writes it as the harness's `report.md` content — POV-scoped (cross-tenant safety guard), truncation-checked, sanity-warned for suspiciously-short outputs. On extraction failure: produces an error-header `report.md` (fail-loud, not silent) plus structured pino warn/error logs with shape `{ executionId, sourceTaskId, sourceExecutionId?, sourceContentLength?, candidateType?, isNull?, extractFailureReason?, err? }`.

**Pointer substitution** (engine + stream-route, 2026-04-29): the harness can't reference its own `report.md` artifact ID at SYNTHESIZE compose time — that ID is generated AT COMMIT TIME after `task.complete`. Phase C.3 protocol prose tells the harness to write the literal placeholder `{{HARNESS_REPORT_MD_ID}}` in its deliverable pointer; after `tx.agentArtifact.createMany(...)` runs, the engine post-processes: query `report.md` artifact's just-created ID, substitute the placeholder in `pipeline-index.json.content`, write back via `tx.agentArtifact.update`. Gated on `task.type === 'PIPELINE' && decision.source === 'upstream' && reportMdContent !== null` so the placeholder can't accidentally fire for non-harness tasks. Forensic log shape: `{ executionId, pipelineIndexArtifactId, reportMdArtifactId, replacements }` on success; `{ executionId, pipelineIndexArtifactId }` + missing-placeholder warn on harness-LLM compliance failure (forensic only — customer still gets whatever literal ID the harness wrote).

#### Substitution pattern (precedent set 2026-04-29 — read before adding the next one)

The pointer substitution above established a new architectural pattern in the engine: **the engine may syntactically substitute known placeholder tokens that agents wrote at compose time, with values generated at commit time.** This is the *substitution variant* of the trust-direction-shift pattern (4th application; first variant where the agent CAN'T write the value because the agent's own transaction is what generates it). See `WAR-STORIES-HARVEST.md` story #7 closure for the broader paper-context.

The pattern's hard boundary preserves Steve's principle #4 (*agents do not strip / rewrite content for downstream artifacts*): the engine substitutes **syntactic tokens**, never **semantic content**. The agent intentionally wrote a placeholder *in place of* a value it can't know yet. The engine fills in the value mechanically. The engine does NOT reinterpret, rewrite, or reorder the agent's prose.

**When to use this pattern**: a load-bearing fact (artifact ID, attestation hash, downstream task ID, etc.) is generated by the same transaction the agent triggered — so the agent's compose-time prose can't reference it. Use a known token + commit-time substitution. Do NOT use this pattern for content the agent can know (route everything through chained context or pre-LLM resolved metadata). Do NOT use it to bypass principle #4 for "convenience" rewrites.

**Adding a new substitution in this engine**: place the substitution inside the success-path `prisma.$transaction`, between `tx.agentArtifact.createMany` and the `findMany` that builds `outputArtifacts`. Mirror in stream-route per the dual-execution-path-parity rule. Use a distinctive `{{ALL_CAPS_TOKEN}}` literal (avoid Handlebars semantics — protocol prose doesn't support `{{}}` resolution, so the token must be inert until the engine sees it). Gate on `task.type` + decision shape so the substitution can't accidentally fire for tasks where the token has no meaning. Always log forensically (success: include before/after IDs; absence: warn so compliance gaps surface). Never silently fall back — if substitution fails, the customer still gets *something*, but operators must see the warn.

**Don't generalise prematurely** (per `feedback_dont_boil_ocean.md`): if a 2nd substitution surfaces, evaluate whether to extract a `substitutePlaceholders(content, registry)` helper. Until then, duplicate the inline pattern — one site is not abstraction, two is the question, three is the answer.

`result.json` top-level keys: `taskId`, `taskTitle`, `agentRole`, `generatedAt`, `modelUsed`, `finalResponse` (LLM deliverable text — no tool dump as of `d652a630`), `confidenceScore`, optional `originalConfidence`/`confidenceCapped`, optional `executionDegradation`/`errorCategory`, optional `protocolValidation`, optional `resolvedMode`/`resolvedReasonCode` (mode-resolver, 2026-04-26), optional `reportMdSource` ({mode, sourceTaskId?, extractFailureReason?} — 2026-04-28), optional `templateScopeMismatch`, `qualityMetrics`, `executionTime`, `tokensUsed`, `mcpToolsProvided`, `toolCalls`, `toolLoop`.

**Error Artifacts** (error path): `error.json` with stack trace and execution context.

**Auto-completion comment** (Apr 2026): After artifact creation, the engine auto-posts a task comment with role, duration, tool call stats, confidence score, and `fetch(id: "artifact-xxx")` commands for each artifact. This is a *coordination comment about the execution itself*, compatible with the Deliverable Contract (it's not the delivery channel).

**Critical Rule**: Artifact creation MUST be inside the same `$transaction` as the execution status update. Never create artifacts outside the transaction boundary.

#### Artifact Lifecycle and Cleanup
- Per-execution artifact count varies by policy: PIPELINE → 1 (`pipeline-index.json`), leaf non-PIPELINE → 2 (`result.json` + `report.md`), intermediate non-PIPELINE → 1 (`result.json`)
- Task `outputArtifacts` field is overwritten to reference only the latest execution's artifacts
- **Pruning** (Flip 2, 2026-07-06): shared status-aware `selectExecutionsToDelete` — in-tx 10 SUCCESS + 10 FAILED, daily-midnight RM settle to 4/4; deletes via atomic `rollUpAndDeleteExecutions` (BC-#2)
- **Daily cleanup**: `cleanupArtifactsByAge(90)` removes artifacts older than 90 days

#### Automatic Context Chaining (Apr 2026; chokepoint move 2026-06-07, commit 6c640337)
- `lib/agents/harness/context-chainer.ts` — reads `result.json.finalResponse` from completed dependency tasks (NOT comments, NOT report.md)
- Extracts `finalResponse`, `confidenceScore`, `qualityMetrics` and merges into `task.inputContext`
- §6 in user prompt renders this as structured "Pipeline Context" with previous task output
- Transparent — agents receive previous outputs without tool calls
- **WHERE it runs (2026-06-07):** invoked at the single row-creation chokepoint `createAgentExecution()` via the thin `lib/agents/harness/prepare-task-for-execution.ts`, BEFORE the INSERT — so **ALL** execution paths chain (explicit `agent.execute`, both task-ready reactors, pipeline-retrigger, REST route, SSE stream). Previously it ran ONLY in `executeAgentOnTask` (explicit path), so reactor-cascade children got `inputContext=NULL` → empty §6 → truncated `agent.results` fallback. Two-execution-path parity bug; fixed by centralizing.
- **A1 cap (`context-chainer.ts`):** per-predecessor 128KB / total 512KB, truncate-with-marker, never-drop-a-predecessor, tail-first trim. Truncation facts carried in `pipelineMetadata.{anyTruncated,totalChars}` + per-entry `{truncated,originalChars}` (queryable — monitor via DB, not logs). A THIRD distinct cap (NOT the 8KB tool-loop cap, NOT the 50KB persistence cap).
- **`applyChainedContext` returns the merged `inputContext`** (was void) so the SSE stream route adopts it in-memory (no replication-lag re-read). `skipChaining` arg preserves the explicit-path skip-on-override.

### 9. Task-Execution State Synchronization

The `executionStatus` field on the Task model MUST stay synchronized with the AgentExecution status. Both are updated in the same transaction:

```typescript
await prisma.$transaction(async (tx) => {
  await tx.agentExecution.update({ where: { id: executionId }, data: { status: 'SUCCESS' } });
  await tx.task.update({ where: { id: taskId }, data: { executionStatus: 'SUCCESS' } });
});
```

**Anti-pattern**: Updating execution status without updating task status (or vice versa) leaves the system in an inconsistent state.

### 10. ResourceManager Guards and Dual-Manager Architecture

Both resource managers now implement the shared `IResourceManager` interface (Feb 2026 extraction), but they have **different method sets**:

- **`SimpleResourceManager`** (JS, MCP servers): Has `registerResource()` and `updateResource()`
- **`MCPResourceManager`** (TS, REST API singleton): Does NOT have these methods

The execution engine uses `MCPResourceManager` (the TS singleton). Guard checks remain essential:

```typescript
// Both methods guard against missing functions on the TS manager
if (!this.resourceManager || typeof this.resourceManager.registerResource !== 'function') return;
if (!this.resourceManager || typeof this.resourceManager.updateResource !== 'function') return;
```

**Shared infrastructure** (Feb 2026): Both managers share constants and helpers from `resource-manager-shared.js`:
- `buildResourceKey('artifact', id)` — constructs prefixed cache keys
- `RESOURCE_KEY_PREFIX.ARTIFACT`, `.EXECUTION`, `.TEMPLATE` — dash-prefix constants
- `CACHE_DEFAULTS.MAX_RESOURCES` (5000), `.TTL_MS` (10 min)
- `IResourceManager` interface in `resource-manager-types.ts` defines the common contract

These guards are essential. The TS resourceManager is primarily used for artifact cleanup and discovery, not for execution-time resource registration.

### 11. Execution Setup Layer (agentTaskService.ts)

The `AgentTaskService.executeAgentOnTask()` method is the setup path for **explicit** `agent.execute` only — it is NOT the universal gateway (the reactor cascade, pipeline-retrigger, REST route, and SSE stream all bypass it; assuming otherwise hid the 2026-06-07 chaining-parity bug). The one chokepoint EVERY path funnels through is `createAgentExecution()` (`lib/services/agent-execution-create.ts`) — that is where row creation AND dependency chaining now happen. `executeAgentOnTask` controls:

#### Model Parameter Resolution Chain (Priority Order)
```
1. overrideConfig.modelParameters  (MCP caller or API override)
2. task.metadata.modelParameters   (task-level, must be non-empty {})
3. agentTemplate defaults          (hardcoded + template.metadata.modelParameters spread)
4. Empty {}                        (no model parameters — engine defaults apply)
```

**Critical**: The template fallback (priority 3) hardcodes `provider: 'anthropic_sdk'` and `model: 'claude-haiku-4-5'`. These MUST match the current model registry. The template's `metadata.modelParameters` JSON field is spread on top, allowing per-template model overrides.

#### Execution Config Assembly
```typescript
const executionConfig = {
  agentRole, prompt, inputContext,
  maxRetries, timeout, priority,
  ...modelParameters,          // ← FLAT spread (model, provider at top level)
  mcpToolId, mcpWorkflowId, mcpContext, mcpMetadata,
  metadata: { triggeredBy, triggeredAt }
};
```
**Note**: `modelParameters` is spread flat into `executionConfig`, not nested. So `config.model` and `config.provider` are top-level keys.

#### CAS Guard (Compare-and-Swap)
Prevents duplicate execution via `updateMany` with WHERE condition:
```typescript
const claimed = await prisma.task.updateMany({
  where: {
    id: taskId,
    OR: [
      { executionStatus: null },
      { executionStatus: { notIn: ['RUNNING', 'PENDING', 'READY'] } },
    ],
  },
  data: { executionStatus: 'PENDING' }
});
if (claimed.count === 0) {
  // Race lost — delete orphaned execution, throw error
}
```
This is preceded by a preliminary check (`if task.executionStatus === 'RUNNING'`) for fast-fail UX.

#### Known Atomicity Gap
`updateExecution()` (line ~561) updates execution status and task status in **separate** `prisma.` calls (NOT a `$transaction`). This is acceptable for intermediate status updates during execution, since the final success/error paths in the engine use proper atomic transactions.

### 12. Prompt Assembly Architecture (buildAgentPrompt)

**Key File**: `lib/agents/harness/build-agent-prompt-body.ts` — `buildAgentPromptBody()` is the SINGLE SOURCE OF
TRUTH for the §1-§8 user prompt since B1-S2 (2026-06-09). The engine's `buildAgentPrompt()` private method now
just `return buildAgentPromptBody(task, config, context)`; the SSE stream route also delegates to it. Byte-`===`
gate: `scripts/test-build-agent-prompt-parity.ts`; content lock: `test-build-agent-prompt-body.ts`.
**Pattern Reference**: `/.claude/knowledge/patterns/agent-prompt-assembly-pattern.md` (CrewAI-aligned) + `dual-execution-path-parity-pattern.md`

#### Configure-Time vs Execution-Time Split

Agent prompts are built in **two phases**:

| Phase | When | What | Where stored |
|-------|------|------|-------------|
| **Configure-time** | When template applied (GUI or MCP) | System prompt (resolved template), user directive, inputContext | `task.prompt`, `task.metadata.modelParameters.systemPrompt`, `task.inputContext` |
| **Execution-time** | When agent runs | Full §1–§8 user message assembled from stored fields + live task data | Passed directly to LLM, not stored |

The snapshot is taken **once at configure time**. If the task title/description/assignee changes after template application, the stored system prompt won't auto-update — the template must be re-applied.

#### User Message Assembly Order (§1–§8)

```
§1 Directive          — task.prompt (synthesized "As a {role}, complete: {title}" if not set)
§2 Expected Output    — agentTemplate.outputSchema (completion contract, if set)
§3 Task Context       — title, description, priority, status, due date
§4 Task Sequence      — parent/subtasks (if any)
§5 Environment        — POV, Phase, Team, Assignee
§6 Chained Context    — task.inputContext (previous task output, if any)
§7 Available Tools    — MCP tools (if configured)
§8 Workflow/Constraints — workflow phases, success metrics, constraints
```

The **system prompt** is `agentTemplate.promptTemplate` with placeholders resolved — it is NEVER injected into the user message to avoid duplication.

#### Directive Synthesis Rule (§1): NEVER copy description

The `task.prompt` field is a **directive** (what to achieve), not a description copy. When no explicit prompt is set, the configure handler synthesizes:

```typescript
finalUserPrompt = `As a ${finalAgentRole}, complete the following task: "${taskWithContext.title}"`;
```

**Why**: Before March 2026, the handler used `prompt || taskWithContext?.description || ''` which caused the description to appear twice in the LLM context (once as §1 directive, again as §3 task context). With large templates (~9K chars) this caused empty responses on Haiku. Fixed to title-only synthesis.

**Implication for users**: The "Task Instructions" field in the UI will show a lean directive after applying a template. If richer task-specific instructions are needed, write them explicitly in the Task Instructions textarea and Save — those will be used as §1 instead of the synthesized version.

#### Chained Context (§6): Intent vs Reality

**Intent**: `task.inputContext` was designed to carry output from a *previous* task forward to the next task in a sequence — e.g., Task A's analysis findings injected into Task B's execution context.

**Reality (updated 2026-06-06)**: There IS now an automatic pipeline. The context-chainer
(`lib/agents/harness/context-chainer.ts`, created 2026-04-04) reads each completed dependency's
`result.json.finalResponse` and merges it into the executing task's `inputContext.chainedFrom[]`. As of
commit `6c640337` it runs at the `createAgentExecution` row-creation chokepoint via
`prepare-task-for-execution.ts`, so it fires on EVERY execution path (explicit, both reactors,
pipeline-retrigger, REST, SSE stream) — not just `agent.execute`. The configure handler's old habit of
ALSO writing a structural snapshot into `inputContext` (task/POV/phase fields duplicating §3/§5) was
REMOVED 2026-06-10 — user-supplied inputContext now passes through verbatim; the snapshot's unique
content (POV Customer/Solution) moved to §5 (+ engine pov selects gained customerName/solution).

**Manual chaining** still works (set `inputContext` via `agent.configure` / the AgentBuilder editor) and
renders via the generic "## Chained Context" branch; automatic dependency chaining renders via the
structured "## Pipeline Context" branch. Both go through the shared `render-pipeline-context.ts` (D4).

#### Dead Code: POST /api/tasks/[taskId]/agent

`app/api/tasks/[taskId]/agent/route.ts` — `POST` handler is **dead code**. No frontend component or service calls it. It predates `/api/agents/configure` and does a raw `prisma.task.update` without template merging, prompt building, or tool resolution. It also unconditionally sets `executionStatus: 'PENDING'` which would violate the CAS guard. Safe to deprecate/remove.

#### Bug Class: Wrong Endpoint for Agent Fields (Mar 2026)

`PUT /api/tasks/{id}` goes through `UpdateTaskSchema` (Zod) which only accepts: `title`, `description`, `assigneeId`, `priority`, `dueDate`, `estimatedHours`, `tags`. It silently strips ALL agent fields (`agentRole`, `agentTemplateId`, `prompt`, `metadata`, `executionStatus`). Any UI component that needs to set agent fields must use `POST /api/agents/configure` instead.

Fixed in AgentSection.tsx (Mar 2026): both `handleApplyTemplate` and `handleSavePrompt` were calling `PUT /api/tasks/{id}` and silently writing nothing. Switched to `POST /api/agents/configure`.

### Agent Configuration Pipeline (Apr 2026)

#### Execution Limits

- **MAX_TOOL_TURNS = 30** (increased from 10, Apr 2026)
- Timeout per turn: 30s
- Total execution timeout: 1080s (18 min)

#### System Prompt Assembly (`buildSystemPrompt`)

Three-priority resolution with optional hub guidance:

| Priority | Source | Notes |
|----------|--------|-------|
| 1 (highest) | `agentTemplate.promptTemplate` | Resolved with `${contextualInformation}` and `${agentRole}` placeholders |
| 2 | User system prompt | From UI or `metadata.modelParameters.systemPrompt` |
| 3 (fallback) | pAIchart Universal Template | `resolvePAIchartUniversalTemplate()` |
| +append | Hub tool guidance | `buildHubToolGuidance()` appended when services tool is available |

#### User Prompt Assembly (`buildAgentPromptBody`, shared — engine `buildAgentPrompt` delegates) — 8 Sections

| Section | Content | Source |
|---------|---------|--------|
| §1 Directive | `config.prompt` or synthesized from role + title | task.prompt / fallback synthesis |
| §2 Expected Output | `template.outputSchema` | agentTemplate |
| §3 Task Context | title, description, priority, status, type, dueDate | live task data |
| §4 Task Sequence | parent/subtasks | task relations |
| §5 Environment | POV, Phase, Team, Assignee | live context |
| §6 Pipeline Context | Auto-chained from dependency tasks (structured rendering) or legacy inputContext (raw JSON) | context-chainer.ts → task.inputContext; **rendered by the shared `lib/agents/harness/render-pipeline-context.ts` (D4, 2026-06-08) — engine + SSE stream both call it, no drift** |
| §7 Available Tools | MCP tools with routing guidance | resolved tool list |
| §8 Output Requirements | **ALWAYS present, template-independent**: Deliverable Contract — `finalResponse` is the deliverable channel (becomes `report.md` for leaf tasks, chained as context for downstream specialists); comments are coordination only; confidence score instruction. Rewritten 2026-04-26 commit `d0c0f2d8`. | hardcoded in engine |

#### Config Score Breakdown

| Component | Points | Condition |
|-----------|--------|-----------|
| Template | 30 | template-based (counts when template is applied) |
| Prompt | 25 | task.prompt is set |
| System Prompt | 25 | template-based (counts when template is applied) |
| Model Params | 20 | modelParameters configured |

#### Status Transition Rule

Agents **must** call `task.update(IN_PROGRESS)` before `task.complete`. The transition `OPEN → COMPLETED` is rejected — tasks must pass through `IN_PROGRESS` first.

#### Key Files

| File | Purpose |
|------|---------|
| `lib/services/agentExecutionEngine.ts` | Execution engine; `buildSystemPrompt` (here) + `buildAgentPrompt` (delegates to the shared builder ↓) |
| `lib/agents/harness/build-agent-prompt-body.ts` | `buildAgentPromptBody` — shared §1-§8 user prompt (single source of truth, B1-S2) |
| `lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts` | Universal template + role guidance library |
| `app/api/mcp/tasks/context/route.ts` | Config score calculation |

### Pre-Flight Auth Check Before LLM Call (Apr 2026)

> **⚠️ INVARIANT:** The engine must throw a structured `AuthError` BEFORE any LLM call when the triggering user has no apiKey. No env-var fallback, no POV-owner fallback, no silent degradation.

The pre-flight check sits in `agentExecutionEngine.ts` immediately after the userLLMSettings resolution block (around line 566). Placement matters — before this point there are no LLM-side side-effects to roll back; after this point the engine commits to the execution.

```ts
// After userLLMSettings resolution
if (!userLLMSettings?.apiKey) {
  throw new AuthError(
    'No API key configured for your account. Visit /settings/llm to configure.',
    {
      code: 'USER_CONFIG_REQUIRED',
      userId,
      taskId: execution.taskId,
      executionId: execution.id,
      authFailureMode: 'no-apikey',
    }
  );
}
```

**Why placement matters**:
- Too early (before user resolution) → you throw with no userId for forensics
- Too late (after token budget check or first API call) → you charge the user's token budget for an auth failure they can't control

**Error artifact shape** — when pre-flight throws, both error.json artifact sites (safety-net + inner catch in the engine) embed `errorCategory: 'USER_CONFIG_REQUIRED'` in the artifact JSON. The GUI reads this to render a "Fix settings" banner with deep-link to `/settings/llm` instead of generic "execution failed."

**No env-var autodiscovery** — Anthropic SDK silently reads `process.env.ANTHROPIC_API_KEY` if the constructor receives `apiKey: undefined`. Defeat this by throwing BEFORE `new Anthropic(...)` in `anthropic-sdk-provider.ts:getClientForRequest`:

```ts
if (!options?.apiKey) {
  throw new Error('AnthropicSdkProvider.getClientForRequest: apiKey required (no env-var fallback)');
}
return new Anthropic({ apiKey: options.apiKey });
```

**Deployed 2026-04-16** (commit `d8350372`) — zero AuthError events across 7 production executions (full pipeline harness with 5 reactor-queued children).

### extractUserId Warn-Log on Fallback (Drift Detection)

When `extractUserId(context, task)` falls back to `task.assigneeId` because `context.triggeredBy.id` is missing or malformed, emit a WARN log capturing the drifted shape. This is cheap insurance that catches future shape drift 10-20x faster than silent fallback ever would.

```ts
// lib/services/agentExecutionEngine.ts (:2261 post-extraction)
function extractUserId(context: any, task: { assigneeId?: string | null }): string | undefined {
  const fromContext = context?.triggeredBy?.id;
  if (typeof fromContext === 'string' && fromContext.length > 0) {
    return fromContext;
  }

  // Drift detector — legacy JSONB rows OR new reactor-shape bug
  logger.warn({
    taskId: task.id,
    assigneeId: task.assigneeId,
    triggeredByShape: typeof context?.triggeredBy,
    triggeredByValue: context?.triggeredBy,
  }, 'extractUserId falling back to task.assigneeId — context.triggeredBy.id missing or malformed. Reactor code may be storing triggeredBy as a string instead of {id: string, source: TriggeredBySource}.');

  return task.assigneeId || undefined;
}
```

**Why WARN not ERROR** — legacy JSONB rows (pre-`TriggeredBySchema`) legitimately have no `id` field; we don't want to flood alerts. Post-schema drift would produce the same log; grep pino for this message to find whichever reactor site is writing a bad shape.

**Paired with write-boundary enforcement** — the wrapper (`lib/services/agent-execution-create.ts`) parses with `TriggeredBySchema.parse` and throws `BoundaryContractViolation` on failure. So new code cannot produce a row that triggers this warn log; only legacy rows or raw `prisma.agentExecution.create` bypasses can. The CI grep test (`scripts/test-agent-execution-security.ts` G8) prevents those bypasses from landing.

**Pattern reference**: `boundary-contract-wrapper-enforcement-pattern.md` — asymmetric write-strict/read-soft is a deliberate design choice, not inconsistency.

### Detection Signal Cascade — P3 through P10 (Apr 2026)

> **⚠️ INVARIANT:** Every signal in the cascade is **additive metadata**, never control flow. Status stays SUCCESS regardless of how many signals fire. Downstream consumers (GUI, harness chainer, reactor) decide what to do.

The engine's post-execution analysis emits 7 detection signals + 1 anti-fabrication intervention (correction turn) + 1 coverage signal (`chainedContext`, D1 2026-06-08 — pipeline input coverage, emit-only, both result.json paths via `deriveChainedContextSignal`). Pattern: `agent-output-trustworthiness-defense-stack-pattern.md`.

**File:line anchors in `agentExecutionEngine.ts`:**

| # | Signal | Engine line | Stream-route mirror line |
|---|--------|-------------|--------------------------|
| P9 (pre) | ~~`TEMPLATE_SCOPE_MISMATCH`~~ | RETIRED 2026-07-17 (matcher deleted) | — |
| #89 | Anti-fabrication correction turn | **IN THE SHARED MODULE** — `lib/agents/harness/agentic-tool-loop.ts` (`runAgenticToolLoop`, post-loop block); callers consume `correctionTurnUsed` from `AgenticLoopResult` (engine :822, stream :794) | same module |
| #90 | Diagnostic retry (50-69 confidence band) | ~981 (`_isInDiagnosticBand`, after objective-guard cap) | ~896 (mirrored — parity closed 2026-06-10) |
| P3 | `TOOL_FAILURES` | ~1134 | ~1033 |
| P4 | `TOOL_LOOP_DEGRADED` | ~1120 | ~1024 |
| P5 | `BUDGET_EXHAUSTED` | ~1105 | ~1014 |
| P7 | `SILENT_REFUSAL` | ~1175 | ~1057 |
| P8 | `PROTOCOL_STEP_SKIPPED` | ~1251 (`validatePipelineProtocolSteps`) | ~1113 |
| P9 (promote) | ~~`TEMPLATE_SCOPE_MISMATCH`~~ | RETIRED 2026-07-17 | — |
| P10 | `TEMPLATE_MISMATCH_SELF_REPORTED` | ~1221 (anchored regex) | ~1093 |

*(Anchors re-verified 2026-06-10 post-extraction — the loop's removal shifted everything below ~770 in the engine and ~645 in the stream.)*

**Cascade priority** (top wins for `errorCategory`; co-occurring fields populate independently):
1. **P10 OVERRIDES** — agent's self-report is highest signal-to-noise
2. P5 BUDGET_EXHAUSTED (most specific error)
3. P4 TOOL_LOOP_DEGRADED
4. P3 TOOL_FAILURES
5. P7 SILENT_REFUSAL
6. P8 PROTOCOL_STEP_SKIPPED (only if no above matched)
7. P9 promotion (lowest)

**Co-occurring evidence fields** in `result.json` (always populated when underlying signal fires, regardless of cascade winner):
- `executionDegradation` — P3/P4/P5/P7
- `protocolValidation` — P8
- `templateScopeMismatch` — P9
- `confidenceCapped` + `originalConfidence` — confidence cap (engine line ~933, objective guard)
- `toolLoop.correctionTurnUsed` — #89 fired
- `toolLoop.diagnosticRetryUsed` — #90 fired (50-69 retry, 2026-04-28)

**Intervention #90 — Diagnostic retry (cascade-time, 2026-04-28)**

The HOWTO + protocol prose + harness specialist had been documenting a "50-69 confidence band → re-execute once with diagnostic feedback" rule for several months. Until 2026-04-28 it was a silent contract gap — documented but not implemented. Searched for `retryOnLowConfidence`, `maybeReexecute`, etc. — found zero hits; only `elicitation-prompts-generator.js` displayed a retry-band hint in a follow-up analytics prompt (display-only).

Implementation lives at engine line ~981 (post-extraction), immediately after the objective-guard cap. Modeled on intervention #89 (anti-fabrication correction turn) — same in-loop retry pattern (replaces `currentResponse` + `finalResponse`, accumulates tokens to `totalUsage`, non-fatal on error, bounded to ONE retry per execution via `diagnosticRetryUsed` flag, empty `functions: []` to prevent loop re-entry).

**Trigger conditions** (all must hold):
- `confidenceScore` parsed AND in `[50, 69]`
- NOT `confidenceCapped` (capping already adjusted; don't retry guard-flagged executions)
- NOT `correctionTurnUsed` (#89 already had a chance to improve narrative)
- Agent did NOT self-flag budget exhaustion in `finalResponse` (regex on first 1500 chars: `token budget|rate limit|MCP tool calls.*blocked|hourly.*budget.*exhaust|all MCP tools are rate-limited`). A same-window retry would hit the same wall.

**Forensic value** beyond recovery: even if the retry also scores 50-69, two data points indicate the issue is structural rather than transient. The `confidenceDelta` field on the structured pino log (priorConfidence vs retryConfidence) is the offline-analysis signal. Steve's framing 2026-04-28: *"the retry is at least a placeholder for easier identification of the problem"*.

**Stream-route parity is now MIRRORED** (closed 2026-06-10; was deferred 2026-04-28). The stream route carries the full #90 diagnostic-retry block (`correctionTurnUsed` at ~944, `diagnosticRetryUsed` gate at ~1059, set at ~1131, surfaced in result.json at ~1346) with the same trigger conditions and bounding as the engine. The "every signal in BOTH paths" rule now holds with **no exceptions** — a future audit finding #90 in only one path is genuine drift, not an intentional asymmetry.

**Auto-promote of task.type at agent.assign (2026-04-28)** — complementary fix in `lib/mcp/tasks/action/handlers/agent/agent-assign-handler.ts`. When the assigned template's `defaultRole === 'pipeline_harness_orchestrator'` and current `task.type === 'ACTION'`, auto-promote to `PIPELINE`. The artifact policy keys on `task.type === 'PIPELINE'` to produce `pipeline-index.json` on the harness root and skip `report.md`. Without this server-side enforcement, default-typed harness tasks misclassify as leaves. Idempotent on already-PIPELINE; logs WARN if type is exotic (DECISION/APPROVAL/etc.) without overwriting. See pipeline-harness-specialist.md §Auto-promote complement to L1.

**Two cascade-time retry layers (named 2026-04-28 — both observed firing in Run 2):**

The platform has TWO distinct retry mechanisms that fire AFTER an execution's main tool loop completes. They sit at different layers, fire on different signals, produce different artifact shapes, and complement rather than overlap. Both have been observed firing in the same pipeline run (the Reviewer in 2026-04-28 Run 2 had intervention #90 fire in-loop AND was then re-executed cross-execution by the harness's SYNTHESIZE quality gate).

| Retry layer | Where | Trigger | Mechanism | Artifact shape | Bounded by |
|-------------|-------|---------|-----------|----------------|------------|
| **Engine-level (#90)** | `agentExecutionEngine.ts:~981` | Confidence parsed in `[50, 69]`, no budget exhaustion self-flag, no prior corrective intervention | In-loop second LLM call with diagnostic feedback prompt; replaces `currentResponse` + `finalResponse` within the same `agent_executions` row | Single execution row; `toolLoop.diagnosticRetryUsed: true`; `confidenceDelta` logged | One retry per execution (flag-gated) |
| **Harness-level (SYNTHESIZE quality gate)** | `seed-protocol-prompts.ts:282-288` (protocol prose; harness LLM executes the logic) | Child confidence in 50-69 band per protocol; empirically also fires on `< 50` cases when the harness LLM diagnoses a recoverable cause (Run 2 observed: confidence 25 → harness diagnosed "context-chain gap, fabricated critique without reading article" → re-executed → 92) | Cross-execution; harness posts a structured `**HARNESS DIAGNOSTIC**` comment on the child task (root cause + specific corrective feedback), then calls fresh `agent.execute` on that child; harness exits, retrigger reactor brings it back when the child re-completes | Two `agent_executions` rows for the child task; SYNTHESIZE harness's `pipeline-index.json` quality-gate table records `25/100 → 92/100 ⚠️ Re-executed` | Once per child per pipeline run (protocol explicit); empirically extended to `< 50` cases when harness can diagnose the cause |

**When each one fires (decision tree)**:
- LLM returns response with parsed confidence → engine-level checks first (in-loop, before storage)
  - `[50, 69]` + retry-eligible → intervention #90 fires; result is stored AS the post-retry confidence (which may be lower than the pre-retry value if the agent reflects honestly)
  - `< 50` or `>= 70` → engine doesn't retry; stores as-is
- Execution row is committed → reactor cascade fires the next child (or the harness's SYNTHESIZE retrigger if all children terminal)
- Harness in SYNTHESIZE reads child's stored confidence → applies harness-level quality gate
  - `>= 70` → accept, proceed to synthesis
  - `[50, 69]` → harness re-executes the child once (protocol explicit)
  - `< 50` → protocol says "escalate, don't synthesize"; empirically, harness LLM may instead diagnose the cause and re-execute (observed beneficial recovery in Run 2)

**Why both layers exist together**: engine-level catches the case where the agent's first LLM response was structurally weak but recoverable in-loop with reflection. Harness-level catches the case where the entire execution's I/O pattern was wrong (e.g., the Reviewer in Run 2 used `task.context` for upstream content instead of reading auto-chained §6 — a tool-selection failure that no in-loop retry could fix because the same tool would be called again). The harness's structured diagnostic comment provides corrective feedback the next execution sees as input context.

**Forensic signature**: a Reviewer (or any leaf) with two `agent_executions` rows where the first scored < 50 and the second scored >= 70, accompanied by a `**HARNESS DIAGNOSTIC**` task comment between them, is the harness-level retry firing. A leaf with one execution row whose `toolLoop.diagnosticRetryUsed = true` is intervention #90 firing. Both can fire in the same pipeline (different rows, different children). When investigating low-confidence children, check both layers.

**Engine vs stream-route parity** is mandatory — every signal in BOTH paths. Verified via grep (see pipeline-harness-discovery.md Phase 9). Drift here re-creates the two-execution-path-drift class.

**When extending the cascade:**
- Decide priority position (most-specific signals fire first)
- Pure-function helper in `lib/services/<name>Validator.ts` or `<name>Matcher.ts`
- Unit tests in `scripts/test-<name>.ts` with regression test for canonical incident
- Wire BOTH paths
- Update this section's table + the umbrella pattern doc

**Debug visibility limitation** (discovered 2026-04-16 smoke test; PARTIALLY closed 2026-06-10): `agent_executions.config.systemPrompt` is the BASE template prompt (set by `agentExecutionConfigBuilder` at task-config time), NOT the runtime-assembled prompt that `buildSystemPrompt` produces. Anything appended at execution time — P10 escape hatch, hub tool guidance, protocol injection — is NOT persisted in the config. To inspect "what did the LLM actually see":
- **GUI runs (stream path)**: the `prompt_snapshot` SSE event (2026-06-10) carries the FULL runtime-assembled system + user prompts → Monitoring tab "Prompts (this run)" collapsed panel. LIVE-ONLY — gone after reload, not persisted.
- Engine runs / forensics: pino logs around the execution timestamp (prompt length, not content); trust the code path (`buildSystemPrompt` runs before every LLM call; appends are unconditional unless guarded)
- A PERSISTED record would still require a new persistence path (the deferred "Option 2"; consider a truncation ceiling if implemented)

## [evicted] Key Information

### Critical Files (Complete Inventory)

| File | Lines | Purpose | Risk Level |
|------|-------|---------|------------|
| `/lib/services/agentExecutionEngine.ts` | 2561 | Core engine, queue processing, singleton (MCP path) | CRITICAL |
| `/app/api/pov/agent/execute/stream/route.ts` | 1843 | SSE streaming endpoint with agentic tool loop (GUI) | HIGH |
| `/lib/mcp/tasks/action/handlers/agent/agent-execute-handler.ts` | 255 | MCP fire-and-forget dispatcher | HIGH |
| `/lib/mcp/server/tools/advanced/task-action-handler.js` | 580 | MCP poll-and-return (Claude Desktop) | HIGH |
| `/lib/services/llm/llm-service.ts` | 1004 | LLM service (generateText, streamText) | HIGH |
| `/lib/services/llm/anthropic-sdk-provider.ts` | 792 | Anthropic SDK, API key, thinking models, multi-tool response | HIGH |
| `/lib/services/llm/types.ts` | 1060 | Model registry, interfaces, token defaults, content block types | MEDIUM |
| `/lib/services/agentTemplateService.ts` | 751 | Template loading and variable injection | MEDIUM |
| `/lib/services/agentTaskService.ts` | 602 | Execution setup: model resolution, config assembly, CAS guard | HIGH |
| `/lib/validation/agent-template-validation.ts` | 711 | AgentExecuteSchema, injection prevention | HIGH |
| `/lib/validation/mcp-action-validation.ts` | 703 | Zod schemas for all MCP task actions | HIGH |
| `/lib/mcp/handlers/agent-results-handler.ts` | 442 | Agent results retrieval with artifacts | MEDIUM |
| `/lib/mcp/handlers/agent-status-handler.ts` | 191 | Execution status polling | MEDIUM |
| `/lib/mcp/embedded-server.ts` | 2839 | Tool calls during LLM execution, MCP tool registry | HIGH |
| `/lib/mcp/server/middleware/context-enricher.js` | 96 | Per-request user context isolation | MEDIUM |
| `/lib/services/mcp/resourceManager.ts` | 2053 | Artifact cleanup (hourly/daily), implements `IResourceManager` | MEDIUM |
| `/lib/mcp/resource-manager-shared.js` | 132 | Shared key constants, helpers, `generateDownloadUrl` | LOW |
| `/lib/mcp/resource-manager-types.ts` | 124 | `IResourceManager` interface, shared types | LOW |
| `/lib/middleware/rate-limit.ts` | 403 | agentExecutionLimiter | MEDIUM |
| `/lib/auth/validate-pov-access.ts` | 558 | POV access authorization | HIGH |

**Total Domain**: ~17,700 lines across 20 files (2 execution paths)

### Common Tasks You Handle

1. **Transaction Atomicity Audits**
   - Verify all success paths wrap execution + task + artifacts in `$transaction`
   - Verify all error paths wrap execution FAILED + task FAILED + error artifact in `$transaction`
   - Ensure `updateExecutionStatus` is NOT called inside transactions (use inline `tx.` instead)
   - Success criteria: Zero partial state updates possible

2. **SSE Streaming Modifications**
   - Add new event types following the established pattern
   - Ensure SSE-after-commit ordering (DB writes before SSE events)
   - Validate log optimization (in-memory accumulation, checkpoint persistence)
   - Success criteria: Events always reflect committed state

3. **Execution Lifecycle Changes**
   - Modify state transitions (PENDING -> RUNNING -> SUCCESS/FAILED)
   - Add new execution states or transition guards
   - Ensure task `executionStatus` stays synchronized
   - Success criteria: No orphaned or inconsistent states

4. **Error Handling Improvements**
   - Add error recovery mechanisms
   - Improve error artifact generation
   - Strengthen the safety-net catch in `processPendingExecutions`
   - Success criteria: Every error path updates both execution AND task atomically

5. **LLM Integration Changes**
   - Modify prompt construction or template injection
   - Change streaming chunk processing
   - Add new LLM response properties to handle
   - Success criteria: All chunk types properly handled and persisted

### When to Use This Specialist
- Adding or modifying execution state transitions
- Working on transaction atomicity in execution paths
- Modifying SSE streaming events or adding new event types
- Debugging inconsistent execution/task states
- Optimizing execution queue processing
- Adding new artifact types to execution results
- Modifying LLM integration or prompt construction
- Working on the agentic tool loop in streaming or engine paths
- Rate limiting changes for execution endpoints

## [evicted] Learning Notes

- **Pattern**: Transaction Atomicity (#37) - Success paths and error paths MUST both use `$transaction` wrapping execution + task + artifacts. This prevents partial state updates that leave the system inconsistent.
- **Gotcha**: `updateExecutionStatus` helper uses its own `prisma.` calls internally and CANNOT accept a transaction client (`tx`). Inside transactions, inline the update as `tx.agentExecution.update(...)` directly.
- **Gotcha**: The MCP engine path uses fire-and-forget (no await on `executeById`). This is intentional to avoid HTTP timeout but means execution is NOT durable across server restarts.
- **Tip**: Log optimization in the streaming route reduces DB writes from 9 to 1 checkpoint + final. Logs accumulate in memory, stream to client via SSE, and persist to DB only at checkpoints.
- **Critical**: SSE-after-commit pattern - always batch DB operations inside `$transaction`, then send SSE events after the transaction commits. Sending events about uncommitted state is an anti-pattern.
- **Pattern**: Every error path must update BOTH execution AND task status atomically. There are two error paths: (1) streaming route outer catch (generateText throws), (2) processPendingExecutions safety-net catch. Both use `$transaction`.
- **Insight**: The execution engine is an EventEmitter singleton. It emits events for progress tracking (`streamExecutionProgress`). Components can listen for execution progress updates.
- **Note (Mar 2026)**: Non-streaming GUI route removed. GUI now uses streaming-only with agentic tool loop. MCP engine path still uses fire-and-forget.
- **Critical**: Task `executionStatus` must always match execution `status`. They are updated in the same transaction. If you see them out of sync, it indicates a bug in transaction boundaries.
- **Pattern**: `agentExecutionLimiter` in rate-limit.ts prevents execution endpoint abuse. Check rate limiting when modifying execution endpoints.
- **Bug Class (Feb 2026)**: `resourceManager.registerResource` and `resourceManager.updateResource` are NOT functions on the TS singleton (`MCPResourceManager`). Always guard with `typeof` check before calling. Note: The JS manager (`SimpleResourceManager`) DOES have these methods — they share `IResourceManager` interface but have different method sets. See `resource-manager-types.ts` for the common contract.
- **Bug Class (Feb 2026)**: MCP HTTP timeout (30s) vs LLM execution time (30-120s). The MCP path MUST be fire-and-forget on the web side. Never `await` the full LLM call in an HTTP handler called by the MCP server.
- **Bug Class (Feb 2026)**: Zod validation schemas at `mcp-action-validation.ts` strip unknown fields. If a handler expects a field (like `executionId`), it MUST be in the Zod schema or it silently disappears. This caused the poll-and-return feature to fail on first deploy.
- **Bug Class (Feb 2026)**: Embedded MCP server tool calls need user context. `callTool(name, args)` must also pass `context` with `{ user, authenticated }` or `ContextEnricher.enrichContext()` crashes on destructuring.
- **Pattern (Feb 2026)**: Poll-and-return for Claude Desktop. MCP tool calls have no timeout, so the MCP server polls `agent.status` every 5s internally and returns full results in one shot. This eliminates 3-step manual polling.
- **Insight (updated Flip 2, 2026-07-06)**: Artifact cleanup keeps last 4 SUCCESS + 4 FAILED per task, status-aware (daily @ midnight UTC) + removes anything >90 days (daily). Task `outputArtifacts` field only references the latest execution's artifacts (overwritten, not appended).
- **Insight (Mar 2026, line count refreshed 2026-06-10)**: `embedded-server.ts` has grown from ~300 to 2,839 lines. It now contains the full MCP tool registry and execution infrastructure, not just a thin wrapper. Risk level elevated to HIGH.
- **Correction (Mar 2026, refined Apr 2026)**: `raw_response.txt` is NOT created by any execution path. Success-path artifacts are policy-driven by `lib/services/agentArtifactPolicy.ts`: PIPELINE tasks → `pipeline-index.json` only; leaf non-PIPELINE → `result.json` + `report.md`; intermediate non-PIPELINE → `result.json` only. Error paths create `error.json`. See "Artifact Policy" table in §8.
- **Deliverable Contract (Apr 2026, commit `d0c0f2d8` + `04fb7630` + `ff5a6bf0` + `d652a630`)**: `finalResponse` is the canonical deliverable channel. `report.md = finalResponse` verbatim for leaf tasks; downstream specialists read `result.json.finalResponse` as chained context. `task.comment` is coordination only — never the delivery channel. Tool execution dumps no longer appended to `finalResponse` (engine: post-loop `## Tool Execution (Turn N)` builder removed; stream: per-turn `generatedText += toolResultText` removed). Tool forensics stay structured in `result.json.toolCalls`. SSE `text_chunk` events still fire for live UI visibility.
- **Bug Class (Mar 2026)**: Singleton mutation — `setModel()` and `setApiKey()` on the provider permanently changed state for ALL requests. Model would "stick" from any previous request; concurrent users could get each other's API keys. Fixed: model via `effectiveModel = mergedOptions.model || this.model`; API key via `getClientForRequest(mergedOptions)` creates one-off Anthropic client. `resolveUserSettings()` replaces `initializeWithUserSettings()`. Both mutation methods removed from provider.
- **Insight (Mar 2026)**: Model defaults cascade: task modelParameters > user settings model (future) > env var `ANTHROPIC_MODEL` > hardcoded `claude-haiku-4-5`. The `anthropicModels` registry in `types.ts` defines available models using **aliases** (not dated IDs). **Superseded 2026-06-19 (SDK Phase-2 WU-1), corrected here 2026-08-05**: thinking detection is NO LONGER the substring test `effectiveModel.includes('sonnet-4')` / `includes('opus-4')`. That approach is what `capabilitiesFor(model)` (`lib/services/llm/model-capabilities.ts`) replaced, because any model without the magic substring was silently mis-shaped — the exact bug that made `claude-opus-4-8` uncallable. Request shape now comes from the per-model capability map (`thinkingMode`, `acceptsTemperature`, `allowedEfforts`, `outputCeiling`, `serverSideFallback`), which **throws on an unknown model** rather than falling through to a legacy shape. Do not reintroduce substring matching on model ids.
- **Feature (Mar 2026)**: Execution-level timeout via `AbortController` at 2 LLM call sites (engine + streaming route). Engine uses 1080s (scaled for 30 tool turns); streaming route uses matching constants. Signal threads through `LLMRequestOptions.signal` → Anthropic SDK `{ signal }`. On abort, existing atomic error transactions handle the failure. MCP poll-and-return uses 1140s (19 min, raised from 300s 2026-06-10) — sized to outlive the engine's 1080s worst case.
- **Feature (Mar 2026)**: Hub service tools (`services(action: "call")`, `services(action: "discover")`, `services(action: "workflow.execute")`) wired into embedded server. Agents can now call external services during task execution. `HubToolsHandler` instantiated with shared prisma singleton. All security enforced inside handlers.
- **Bug Fix (Mar 2026)**: `hub-tools-handler.js` had a broken relative import path (`../../validation/mcp-hub-validation` should be `../../../validation/mcp-hub-validation`). Never surfaced until webpack traced the import from `embedded-server.ts`. The dynamic `import()` with try/catch fallback masked it in the stdio MCP server. **Update Apr 8 2026 (Phase 2.P0.5)**: dynamic `import()` converted to synchronous `require()` at module-load time across 5 call sites (commit `b86b3dec`), and `mcp-hub-validation.js` was deleted in Phase 2 proper — the path now resolves extensionlessly to `mcp-hub-validation.ts` via ts-node CJS hooks in both PM2 processes.
- **Feature (Mar 2026)**: Agentic multi-turn tool loop — up to 30 tool turns per execution (increased from 10, Apr 2026) with full Anthropic tool_use/tool_result protocol compliance. All tool_use blocks executed per turn. Signal passed to ALL LLM calls. Scaled timeout (1080s). Token accumulation. Tool errors returned to LLM as is_error tool_result.
- **Bug Fix (Mar 2026)**: tool_use_id was discarded in anthropic-sdk-provider.ts lines 292-295. Now preserved in functionCalls[].id and functionCall.id (optional for Gemini compat). Streaming path also fixed.
- **Feature (Mar 2026)**: JSON Schema generation now real — zod-to-json-schema with jsonSchema7 target replaces stub in embedded-server.ts.
- **Bug Fix (Mar 2026)**: `agentTaskService.ts` template fallback had stale model `claude-3-opus-20240229` (deprecated, not in registry) and provider `anthropic` (legacy name). Fixed to `claude-haiku-4-5` / `anthropic_sdk`. This file controls the execution config assembly and model resolution chain — any model default change must also update line ~224 here.
- **Insight (Mar 2026)**: `agentTaskService.ts` `modelParameters` are spread FLAT into `executionConfig` (not nested). So `config.model`, `config.provider` are top-level keys, not `config.modelParameters.model`. The MCP caller (e.g., ChatGPT) can pass `overrideConfig.modelParameters.model` to override the default.
- **Insight (Mar 2026)**: `updateExecution()` in `agentTaskService.ts` has a known non-atomic task status update (separate `prisma.task.update`, not `$transaction`). This is acceptable for intermediate status only; the engine's final success/error paths use proper atomic transactions.
- **Observation (Mar 2026) — RESOLVED 2026-06-10**: MCP poll-and-return timeout (was 300s/5min) was shorter than engine execution timeout (1080s/18min); prod-observed 455s/9-turn Sonnet runs exceeded it, so Claude Desktop got "still running" instead of results. Fixed: `maxWaitMs` raised to 1140s (engine worst case + 60s buffer). If a CLIENT times out before the window, execution continues server-side and `agent.results` still works — the longer window is never worse than the old behavior.
- **Feature (Mar 2026)**: Per-turn LLM timing added to both execution paths (pino + GUI logs array). Each turn now logs `toolDurationMs` and `llmDurationMs` separately, enabling instant diagnosis of slow executions. Initial LLM call logged as `turn: 0`. Streaming route `logs` array includes human-readable entries like `"Turn 3 LLM: 140.6s (85,000 tokens)"`.
- **Fix (Mar 2026)**: Streaming route was missing `totalUsage` token accumulation across agentic loop turns — only the initial LLM call's tokens were counted. Now matches the engine's accumulation pattern.
- **Insight (Mar 2026)**: Agent template features (extended thinking, prompt caching, web search) are fully wired end-to-end but off by default. They flow through `task.metadata.modelParameters` → `executionConfig` (flat spread) → `generateText()` options → Anthropic SDK provider. Extended thinking requires `thinkingBudgetTokens > 0` AND a thinking-capable model (Sonnet/Opus 4+). All three are opt-in per-task via the `/agents` UI.
- **Architecture (Mar 2026)**: Prompt assembly is split across two phases. Configure-time (`agent-configure-handler.ts`) builds and stores the system prompt + directive. Execution-time assembles the full §1–§8 user message from stored fields + live task data via the SHARED `buildAgentPromptBody()` (`lib/agents/harness/build-agent-prompt-body.ts`) — both the engine's `buildAgentPrompt()` and the streaming route delegate to it (B1-S2; no more "matching logic" duplication). The snapshot is taken once — re-apply template to refresh if task data changes.
- **Bug Fix (Mar 2026)**: `agent-configure-handler.ts` previously used `prompt || taskWithContext?.description || ''` which copied task description into the directive field. This caused description duplication (§1 + §3), wasting ~2,400 tokens and causing empty Haiku responses with large templates. Fixed to synthesize directive from title only: `"As a ${role}, complete the following task: '${title}'"`.
- **Insight (Mar 2026; SUPERSEDED 2026-06-10)**: the configure-time structural snapshot in `task.inputContext` was removed (it duplicated §3/§5 and rendered misleadingly under "Chained Context"); automatic dependency-output chaining has existed since the chokepoint move (`6c640337`). §6 now carries ONLY: user-supplied context and/or run-time `chainedFrom[]` dependency outputs.
- **Bug Class (Mar 2026)**: `PUT /api/tasks/{id}` uses `UpdateTaskSchema` which silently strips all agent fields (`agentRole`, `agentTemplateId`, `prompt`, `metadata`, `executionStatus`). Never use this endpoint to set agent configuration. Always use `POST /api/agents/configure` for agent fields.
- **Dead Code (Mar 2026)**: `POST /api/tasks/[taskId]/agent` has no active callers. It predates `/api/agents/configure`, does raw `prisma.task.update` without template merging, and unconditionally sets `executionStatus: 'PENDING'` (CAS violation). Safe to deprecate.

### Deferred Improvements (Mar 2026 Assessment)

Three improvements identified during the execution engine audit, deferred for future sessions:

1. **BullMQ job queue** (for MCP engine fire-and-forget path)
   - **Why defer**: Multi-hour feature requiring new infrastructure (Redis, job queue, worker process). Current fire-and-forget works correctly but is not durable across server restarts. Less critical now that GUI uses streaming (long-lived connection, not fire-and-forget).
   - **Impact**: Prevents loss of in-flight MCP executions during deploys/restarts.
   - **Effort**: ~4-6 hours (Redis setup, BullMQ integration, worker, monitoring).

2. **~~Proper JSON Schema generation~~** -- **COMPLETED (Mar 2026, P4)**
   - `zod-to-json-schema` with `jsonSchema7` target now replaces the stub in `embedded-server.ts`.
   - LLM tools get proper structured JSON Schema definitions for constrained generation.
   - Implemented as part of the agentic tool loop work (commit 1583baf2).

3. **Embedded server decomposition** (splitting 2,839-line file)
   - **Why defer**: The file works correctly and has no bugs. Decomposition is a maintainability improvement, not a correctness fix. Should be done when the file next needs significant changes.
   - **Impact**: Easier maintenance, clearer responsibility boundaries.
   - **Effort**: ~2-3 hours (extract tool registry, structured output, resource handling into separate modules).

## [evicted] Pre-Recommendation Verification (Meta-Learning from task.update Case)

Before recommending architectural changes or refactoring:

### 1. Check Existing Patterns First
```bash
# Search for transaction patterns in execution code
grep -r "\$transaction" /home/steve/copov15/lib/services/agentExecutionEngine.ts /home/steve/copov15/app/api/pov/agent/execute/ -n

# Count execution state update patterns
grep -r "status.*PENDING\|status.*RUNNING\|status.*SUCCESS\|status.*FAILED" /home/steve/copov15/lib/services/agentExecutionEngine.ts -c

# Check for updateExecutionStatus callers
grep -r "updateExecutionStatus\|updateExecutionLogs" /home/steve/copov15/lib/services/ /home/steve/copov15/app/api/ --include="*.ts" -l
```

**Questions to Ask**:
- Is this transaction pattern used consistently across all paths?
- Does the error path match the success path in atomicity?
- Is the SSE-after-commit ordering preserved?
- Are both execution AND task updated together?

### 2. Verify Architectural Layer

**Before saying**: "This should use a job queue"
**First verify**: Is the current setTimeout pattern intentional and documented?

**Execution Layers**:
```
API Route Layer (/app/api/pov/agent/execute/)
  - Receives HTTP request, validates, responds immediately
  - Delegates to engine or runs inline (streaming)

Engine Layer (/lib/services/agentExecutionEngine.ts)
  - Queue processing, state management, LLM orchestration
  - Singleton with EventEmitter for progress

Service Layer (/lib/services/llm/, /lib/services/agent*.ts)
  - LLM calls, template loading, task management
  - Stateless service functions
```

### 3. "Should" vs "Must" Refactor

**"MUST refactor" when**:
- Transaction atomicity is broken (execution updated without task)
- SSE events sent before DB commit
- Error paths don't update both execution and task
- State transitions allow invalid paths

**"SHOULD refactor" when**:
- setTimeout could be replaced with BullMQ (durability improvement)
- Log checkpoint frequency could be optimized
- Additional SSE event types would improve UX

### 4. Confidence Calibration

**Adjust confidence DOWN if**:
- You haven't verified all three error paths
- You haven't checked the SSE-after-commit ordering
- The change affects both streaming route and engine paths

**Adjust confidence UP if**:
- Transaction boundaries are clearly maintained
- All state transitions are audited
- Both execution AND task status updates are verified

## [evicted] Architectural Assessment Guidelines

### Transaction Atomicity Checklist

Before approving changes, verify:

- [ ] **Success path**: execution SUCCESS + task SUCCESS + artifacts in one `$transaction`
- [ ] **Error path (streaming)**: execution FAILED + task FAILED + error artifact in one `$transaction`
- [ ] **Safety-net path**: processPendingExecutions catch uses `$transaction`
- [ ] **No `updateExecutionStatus` inside transactions** (use inline `tx.` instead)
- [ ] **SSE events sent AFTER transaction commit** (not inside)
- [ ] **Task executionStatus matches execution status** after every transition

### SSE Event Ordering Checklist

- [ ] DB operations batched inside `$transaction`
- [ ] SSE events emitted after transaction commits
- [ ] `[DONE]` is always the last event
- [ ] Error events include both `error` and `execution_update` types
- [ ] `artifact_created` events reference persisted artifact IDs
