# Agent Execution Engine Discovery

## 🆕 2026-08-17 — WS1 Phase C composed-injection tripwires

```bash
grep -c "mode === 'composed'" lib/services/execution-system-prompt.ts        # expect 2 — the branch + block-list kinds
grep -c "resolveTaskProtocol" lib/services/agentExecutionEngine.ts           # expect 2 — import + buildSystemPrompt tail
grep -c "resolveTaskProtocol" app/api/pov/agent/execute/stream/route.ts      # expect 3 — import + F1 comment + :501 call
grep -c "protocolInjection" lib/services/execution-artifacts.ts              # expect 4 — input field + destructure + emit + whitelist
grep -c "PROTOCOL_ROW_NOT_ACTIVE" lib/services/execution-system-prompt.ts    # expect 5 — tier-split both directions + header
```
A drop in the resolveTaskProtocol counts means a call site reverted to a raw metadata/title read —
the F1 drift class. `protocolInjection` leaving the whitelist silently strips the 10th signal from
lean surfaces. Suites: test:system-prompt-injections (37) · test:program-protocol-token (40, P3/P4).

## 🆕 2026-07-18 — derivationContainment surfacing path (YOUR lane; arithmetic is pipeline-harness's)

The CIDR under-covering check (the subnetting leaf) is pipeline-harness's
`lib/agents/harness/derivation-containment.ts` — NOT this domain. But the FACT rides your artifact-gen
+ result-surfacing path, and the evidence-flow arc shipped two fixes here. E1: the results-handler
hoist missed PIPELINE execs entirely (they persist `pipeline-index.json`, not `result.json`); GAP-1:
the size-capped lean card is a separate surface that needs the shared `leanFactsLine` helper to print
the hoisted facts (else unreachable without `verbose:true`). Records:
`cline_docs/reviews/{confidence-gate-demotion,reactor-cascade-audit}-2026-07-18/`.

```bash
grep -c "'derivationContainment'" lib/services/execution-artifacts.ts                     # expect 1 — the QUOTED whitelist entry, beside reviewerVerdict (same hoist path). Quoted on purpose: a bare count broke on 2026-08-04 when a header comment added two prose mentions
grep -c "pipeline-index.json" lib/mcp/tasks/action/handlers/agent/agent-results-handler.ts # EXPECT 2 — E1: hoist matches result.json OR pipeline-index.json (was result.json only = 0% hit for PIPELINE execs; also retro-fixed reviewerVerdict/qualityMetrics hoisting there)
grep -c "leanFactsLine" lib/mcp/server/tools/advanced/task-action-handler.js              # EXPECT 2 — GAP-1: the lean card prints the hoisted facts via the SHARED helper (import + call); the sibling agent-results-handler.js builder consumes it too
grep -c "derivationContainment" lib/mcp/server/tools/advanced/lean-card-facts.js          # EXPECT 5 — the shared **Facts:** line surfaces confidence | reviewerVerdict | derivationContainment (+containmentDisposition, nested under it, 2026-08-03)
grep -c "^test(" scripts/test-lean-card-facts.ts                                          # expect 41 — the shared-helper pin (dedup'd + pinned by the born-ready session; do not re-fold). Was 12 at authoring; the suite grew through the asn-kind, containmentDisposition and F7 work. A count that only ever grows is a weak pin — it catches deletion, not drift
```

## 🆕 2026-07-16 — truncation-stall R1-R4 (Sonnet-5 adaptive-thinking exhausts max_tokens)

Root cause: Sonnet-5 runs adaptive extended thinking BY DEFAULT (billed as output vs `max_tokens`); a
heavy final SYNTHESIZE/PLAN turn exhausts the ceiling mid-thinking → `stop_reason:max_tokens`, ZERO
text. The `finalize-response.ts` note (56 chars) masked the emptiness → silent-green SUCCESS.
```bash
grep -c "TRUNCATED_NO_OUTPUT" lib/agents/harness/execution-quality.ts   # EXPECT 4 — R2 fact: classify the RAW pre-note text (rawDeliverableText), gated stopReason==='max_tokens' && rawDeliverableEmpty, BEFORE EMPTY_DELIVERABLE, type-independent
grep -c "maybeRetryTruncatedFullTurn" lib/agents/harness/agentic-tool-loop.ts   # EXPECT 4 (1 def + 3 'full'-site calls) — R4 Layer-1 in-loop retry, once/execution, re-issue identical request at min(2×cfg.maxTokens, ceiling); flows through the normal while-guard so a SYNTHESIZE reaches task.complete
grep -c "truncatedNoOutput" lib/services/execution-selection.ts   # EXPECT 5 — keep-best Arm 3: a truncated-empty retry can't supersede a non-truncated target
```
EXPECT: `STANDARD_AGENT_LIMIT: 24000` (R1, was 8000, `lib/services/llm/types.ts:1085` — it is an OBJECT PROPERTY inside `MCPTokenDefaults`, colon not equals; a grep on `STANDARD_AGENT_LIMIT = ` returns empty and false-reads as removed. `DEFAULT_MAX_TOKENS` at :1126 derives from it). Fold the truncated attempt's usage
ONLY on retry-SUCCESS — folding on the throw path double-counts (impl-panel Finding 1).
`truncationRetryUsed/Recovered` emit in `toolLoop` (before finalResponse). Layer 2 (persist-tx
escalation) is pipeline-harness/event-system's lane. `cline_docs/reviews/truncation-r4-2026-07-16/`.

## 🆕 2026-07-14 — result.json field-order contract + reviewerVerdict emission

```bash
# reviewerVerdict parsed INSIDE the canonical builder, role-gated; emitted BEFORE finalResponse
# (head-slice caps: fetch 50KB → tool-loop 8KB — order decides orchestrator visibility).
grep -n "reviewerVerdict\|REVIEWER_ROLES\|FIELD ORDER" lib/services/execution-artifacts.ts | head
# Parser (pure, null-on-miss, token-locked, last-match-wins) + guard (flag-only qualityGate reconciliation)
grep -n "export function parseReviewerVerdict\|VERDICT_MARKER" lib/agents/harness/parse-verdict.ts
grep -n "annotateQualityGateVerdictMismatch" lib/mcp/tasks/action/handlers/task/task-update-handler.ts
npm run test:parse-verdict   # EXPECT 15 pass; parity suite pins the order: npm run test:execution-artifacts-parity (37)
```
EXPECT: exactly ONE grammar DEFINITION (`## VERDICT: APPROVED | NEEDS-REVISION`) repo-wide, in
`pAIchartUniversalTemplate.ts` change_reviewer guidance — plus string-PIN hits in
`scripts/test-parse-verdict.ts` (expect-assertions quoting the grammar; pins, not definitions —
verified 2026-08-16: 2 files total, 1 definition + 1 test pin). A new result.json field an orchestrator must
see goes BEFORE `finalResponse`. Record: `cline_docs/reviews/harness-synthesize-verdict-misread-2026-07-14/`.

```bash
# 2026-07-15 Session-A (program enablers) — chainer PIPELINE branch + prepare loud-fail
grep -n "isPipelinePredecessor\|notChained\|INTERFACE_CONTRACT_MISSING" lib/agents/harness/context-chainer.ts lib/agents/harness/prepare-task-for-execution.ts | head
# EXPECT: loud-fail sits BEFORE the try{ chainDependencyContext } block (unswallowable);
# chainer skips ALWAYS push a notChained reason. Full audit: pipeline-harness-discovery Phase 14.
```

## 🆕 2026-07-06 — Convergence Phase 6 COMPLETE: BOTH adapters over execution-core.ts (one core, two adapters)
```bash
# The happy-path SPINE (tool loop → post-loop cascade → persistTerminalSuccess) lives ONCE in the shared
# core (lib/services/execution-core.ts runExecutionCore). BOTH agentExecutionEngine.ts AND
# app/api/pov/agent/execute/stream/route.ts are now THIN ADAPTERS: each keeps claim/prep + the FAILURE catch
# (persistTerminalFailure + F-1 rethrow) and delegates the happy path to the core. Engine swap ef768e7a,
# STREAM swap 200dd0e7 — both UAT-banked. The paths are now SYMMETRIC; older blocks' "engine vs stream
# inline" language is HISTORICAL. Current map (prove-verified 2026-07-06):
ls lib/services/execution-core.ts   # runExecutionCore(input, observers) — the ONE shared happy-path spine
grep -c "runAgenticToolLoop({"       lib/services/execution-core.ts lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/stream/route.ts  # Expect: 1 core + 0 engine + 0 stream (BOTH adapters delegate)
grep -c "persistTerminalSuccess(prisma" lib/services/execution-core.ts lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/stream/route.ts  # Expect: 1 core + 0 engine + 0 stream
grep -c "persistTerminalFailure(prisma" lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/stream/route.ts  # expect 2 — 1 engine + 1 stream (failure stays ADAPTER-side — seam)
grep -c "runExecutionCore("           lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/stream/route.ts  # expect 2 — 1 engine + 1 stream (both adapters call the core)
# Gate: test:execution-core-boundary (13) — C-4 (core does zero create/claim/hydration), reactor-thread pins
# (engine true/true + stream false/false, no hardcoded literal), stream F1/F1b input-assembly pins
# (extensions shared-ref, buildSuccessLogs mutate), ordered-call (cap→retry→quality→persist), seam pins.
```
**M3 shipped + soaked** (`d8056204`): the content-validation guard is engine-canonical on BOTH paths
(conjunct + apiError) + a new additive `EMPTY_DELIVERABLE` errorCategory in `execution-quality.ts`. The
CORE owns the ONE guard (both adapters deleted their inline copies).
**Do NOT "find" as bugs**: the I-6 `result.json.executionTime` origin (core `endTime-startTime`; the stream
adopted it at the swap — micro-delta), the endTime capture-MOMENT shift (core captures pre-#90-retry), the
stream-only `result.json.extensions` (N-6; engine yields undefined), the per-adapter prompt HEADS (six axes).
**AUTHORITATIVE map**:
`cline_docs/reviews/execution-path-convergence-2026-07-04/{phase-6b-implementation-plan.md, divergence-manifest.md}`.

## 🆕 2026-07-06 — Multi-turn PROMPT TREATMENT (how the loop feeds + re-pins the prompt)
```bash
# The SYSTEM prompt is re-sent as the top-level `system` param on EVERY generateText call — both the
# `full` and the `reflection`/correction modes, because it lives in buildLlmCallOptions' shared `base` —
# so it is re-attended with SYSTEM-ROLE AUTHORITY every one of up to ~100 turns. The USER prompt (§1-§8)
# is only messageHistory[0]: pinned at the head, but user-role weight, salience recedes as tool-result
# turns pile on. Each tool turn APPENDS assistant tool_use + user tool_result (Tier-1 truncated).
grep -n "systemPrompt: cfg.systemPrompt" lib/agents/harness/agentic-tool-loop.ts   # must stay in `base` (both modes)
grep -n "messageHistory" lib/agents/harness/agentic-tool-loop.ts | head
# DELIVERABLE = LAST-TURN assistant message: assembledText = currentResponse.text (post-#89/#90), NOT accumulated.
grep -n "assembledText" lib/agents/harness/agentic-tool-loop.ts lib/services/execution-core.ts | head
```
**Why it matters**: durable GUARDRAILS go in BOTH the system TAIL (`renderConstraintsBlock`, re-pinned every
turn) AND user §8 — the **Axis-5 double** (redundancy-for-recall). Deliberately same-SEMANTIC not byte-identical
(tail sanitizes + suppresses-empty; §8 raw + always-header). C-1: the engine always used last-turn; the STREAM
converged from accumulate→last-turn (Phase 2). HEAD/TAIL construction ownership lives in prompt-construction's
config + discovery — this block is the loop-TREATMENT lens only.

## 🆕 2026-07-05 — Convergence Phases 4b/5a/5b-i: the terminal txs, prompt-injection tail, and hydration shapes are SINGLE-SOURCE
```bash
# The two paths are now thin over FOUR shared modules — analyses that grep only the two big files MISS the logic:
ls lib/services/execution-terminal-persist.ts lib/services/execution-system-prompt.ts lib/services/execution-hydration.ts lib/agents/harness/execution-quality.ts
# Terminal persist (4b): ONE persistTerminalSuccess/persistTerminalFailure pair; 4a CAS + count-guard live INSIDE it:
grep -c "persistTerminalSuccess(prisma\|persistTerminalFailure(prisma" lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/stream/route.ts  # expect 2 — 1 engine (FAILURE only) + 1 stream (FAILURE only); persistTerminalSuccess is in execution-core.ts for BOTH adapters; see the Phase-6 block above
# System-prompt INJECTION TAIL (5a): shared applySystemPromptInjections; resolution HEADS stay per-adapter POLICY
# (six-axis divergence is DELIBERATE — see phase-5-prompt-construction-signoff.md 2a; do NOT converge heads ad hoc):
grep -c "applySystemPromptInjectionsWithFact(" lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/stream/route.ts  # expect 2 — one call site per execution path (engine + stream). Symbol RENAMED from applySystemPromptInjections( when the protocol-injection FACT was added; the old grep matched 0 and read as 'clean' (drift-sweep 2026-08-23). Prose-arithmetic '1 + 1' also replaced — the audit cannot parse it
# Hydration shapes (5b-i): 11-field template UNION select + §4/§5 task-relation superset, consumed at all 3 sites:
grep -c "EXECUTION_TEMPLATE_SELECT" lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/stream/route.ts  # Expect: 3 + 2 (engine: import + poller + executeById; stream: import + route fetch)
# P9 templateScopeMismatch is LIVE on the engine since 5b-i (was dead-by-select for its whole life before).
```
Gates: test:terminal-persist-shape (21) / test:system-prompt-injections (13) / test:execution-hydration (10) +
the retargeted fleet (failed-persist-cas, pipeline-engine-skip, mode-resolver-injection, integrity F-series).
PARKED/PENDING (do not "find" these as bugs): 5b-ii context-builder merge (parked — premise invalidated, see
phase-5-confidence-assessment.md tail), 5b-iii I-10 snapshot-at-create (inventoried, 6 callers), reactor/PRUNE
flips (Steve-gated). Phase 6 (runExecutionCore, BOTH adapters) SHIPPED + the Protocol-11 §-by-§ sweep of
THIS doc done 2026-07-06; authoritative inventory = cline_docs/reviews/execution-path-convergence-2026-07-04/divergence-manifest.md.


**Last Updated**: 2026-06-20 — propagated the SDK-0.105 capability-map architecture into §5 (broadened the loop grep + added a capability-map/finalizer grep block + What-to-look-for: `model-capabilities`/`capabilitiesFor`, `buildAnthropicRequest`, `normalizeStopReason`, `finalize-response`, `pause_turn` resume). (Prior: 2026-06-19 — paired §11 to the agent-execution-specialist config: TWO-AXIS model resolution (MODEL fail-loud `MODEL_UNRESOLVED` via `normalizeModelConfig` + PROVIDER/KEY from profile), model-aware maxTokens, D-1 maxToolTurns template-lock; corrected stale `effectiveModel`/maxToolTurns claims; 2026-06-10.)
**Status**: v6.4 - SSE event list refreshed (11 types incl. `execution_started`); content-block grep false-positives documented
**Confidence**: Very High - Based on production-validated patterns including Claude Desktop fixes
**Last Validated**: 2026-06-10 (full 17-phase run, all checks PASS)

## 🆕 2026-06-25 — Harness output guards (R9/R10) + their feature flags

```bash
# The two pure modules + where they wire into execution
grep -rln "sanitizeChainedOutput\|redactArtifactsForPersist\|redactSecretsDeep" lib/ app/
grep -nE "sanitizeChainedOutput|CONNECTED_OUTPUT_SANITIZE_ENABLED" lib/agents/harness/agentic-tool-loop.ts lib/agents/harness/context-chainer.ts
grep -nE "redactArtifactsForPersist|ARTIFACT_SECRET_REDACT_ENABLED" lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/stream/route.ts

# R9 TELEMETRY CONTRACT (added 2026-07-26) — the facts each site records about its own rewrite.
# Expect 4 hits in the tool-loop (sanitized/neutralizedCount/strippedControlChars/neutralizedCategories
# assigned inside the ONE `services`+flag gate) and 3 in the chainer (per-predecessor chainedFrom entry).
grep -nE "record\.(sanitized|neutralizedCount|strippedControlChars|neutralizedCategories)" lib/agents/harness/agentic-tool-loop.ts
grep -nE "^\s+(sanitized|neutralizedCount|strippedControlChars):" lib/agents/harness/context-chainer.ts
```
R9 (`CONNECTED_OUTPUT_SANITIZE_ENABLED`, ON in prod since 2026-06-29) sanitizes connected-service output before the reasoner; R10 (`ARTIFACT_SECRET_REDACT_ENABLED`) redacts secrets from persisted report.md/result.json. Both **env-var, default OFF** (no live toggle; `pm2 restart` to apply). What they enable + toggle + enable-gates: `.claude/knowledge/domain/harness/harness-output-guards.md`.

**Telemetry semantic (2026-07-26 — the C1 dataset).** Both sites record the rewrite as emit-only
Protocol-10 facts, and at site A **presence means "R9 examined this result", not "R9 rewrote it"**
(`sanitized` says that). Absent = flag off / non-`services` tool / call threw; present-and-`false` is
the **denominator** the false-positive rate needs. `neutralizedCount` alone answers only "did an
injection pattern fire" — a strip-only rewrite has count 0, which is why `strippedControlChars` is
recorded. Emit-only record fields are therefore FIVE, not two: `resultTruncatedForLlm`, `resultChars`,
`sanitized`, `neutralizedCount`, `strippedControlChars` (+ conditional `neutralizedCategories`).
Matched TEXT is deliberately pino-only, never on the record. Pinned: `test:agentic-tool-loop` §5f.

## 🆕 2026-06-21 — Cross-process invariant (poller is paichart-web ONLY)

```bash
# Where the background poller is started (start() -> setInterval processPendingExecutions)
grep -n "processingInterval = setInterval\|async processPendingExecutions\|async start(" lib/services/agentExecutionEngine.ts
# Who starts the engine — ONLY server-init (paichart-web). The MCP process does NOT.
grep -rn "initializeAgentExecutionEngine\|initializeServer()" lib/server-init.ts mcp-server-http-clean.js
# Both init sites carry matching CROSS-PROCESS INVARIANT comments:
grep -n "CROSS-PROCESS INVARIANT" lib/server-init.ts mcp-server-http-clean.js
```

**Invariant**: the agent-execution **background poller + zombie cleanup** (`agentExecutionEngine.start()` -> 10s `processPendingExecutions`) runs in **paichart-web ONLY**. `paichart-mcp` calls `initializeMCPServices()` (tool registry) but NOT `initializeServer()`, so it has no poller. MCP foreground executions run **inline** (`executeById`) and are fine; the web poller is the **BACKSTOP** for PENDING execs that don't run inline (reactor-queued / dependency-gated / failed-to-start) — it catches them via a cross-process `status IN (PENDING,RUNNING)` query, and the `active_per_task` unique index prevents double-execution. **Risk if web is down or MCP runs standalone: those execs STALL + zombies aren't cleaned.** Event systems (phase-stage / execution-events / prompt-registry) self-heal/self-connect on use, so they need no pre-warm in MCP (phase-stage self-heal added 2026-06-20 after it was the one that *didn't*). See the matching code comments at both init sites.

## 🆕 2026-05-27 Session — Run These Greps FIRST (MCP transport authz — pentest-verified)

```bash
# Tool calls are authz-scoped to the REQUESTING user via 3 fail-closed gates (a hijacked
# agent can't exceed the caller). Confirm none regressed:
grep -nE "extractUserId|AuthError|admin fallback disabled" lib/services/agentExecutionEngine.ts lib/mcp/server/utils/api-client.js
grep -nE "buildTokenPayload|requireWrite|validatePOVAccess|buildPOVAccessFilterWithRole" lib/mcp/server/utils/build-token-payload.js lib/mcp/server/tools/advanced/task-action-handler.js

# BYOK enforced — no platform-key fallback (demo/USER agents need their own key):
grep -nE "USER_CONFIG_REQUIRED|resolveUserSettings|ANTHROPIC_API_KEY" lib/services/agentExecutionEngine.ts

# resolveUserContext fallback: DO NOT throw (stdio/Claude Desktop relies on it; HTTP never reaches it):
grep -nE "resolveUserContext|setUserContext|StreamableHTTPServerTransport" mcp-server-v5.js lib/mcp/server/mcp-core.ts
```

SDK GHSA-345p-7cg4-v4c7 verified NOT exposed (960-req concurrent leak test). Prompt-injection = bad text, not escalation (the tool-authz boundary holds). Refs: [[prelaunch-pentest-2026-05-26]], `TODO-agent-prompt-injection-testing.md`.

---

## 🆕 2026-06-16 — Tool-grant resolution + confinement (tool-confinement investigation)

> Full trace: `cline_docs/reviews/network-provisioning-design-2026-06-16/agent-execution-tool-confinement-findings.md`
> + REQ `cline_docs/follow-ups/REQ-agent-tool-confinement-engine-2026-06-16.md` (PARKED 2026-06-16; build spec alongside). **Investigation only — NO fix shipped yet.**

```bash
# Resolution chain: selectedTools (GUI) → mcpContext.tools → resolved names → executable mcpFunctions.
grep -nE "mcpToolConfiguration|selectedTools" lib/pov/api/agent-templates-adapter.ts lib/mcp/tasks/action/handlers/agent/agent-configure-handler.ts
grep -nE "CONSOLIDATED_TOOLS|mcpToolNames|getToolDefinitions|mcpFunctions" lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/stream/route.ts

# ⚠️ D1 FOOTGUN — an empty/collapsed tool list silently expands to ALL SIX (incl. services/registry).
# KNOWINGLY ACCEPTED 2026-06-16 (global flip DECLINED — track 2 deferred).
# CENTRALIZED 2026-07-06 into deriveMcpToolNames (lib/services/execution-hub-guidance.ts) — the
# inline `[...CONSOLIDATED_TOOLS]` spread is GONE from both big files (0 hits there is convergence,
# NOT the footgun removed). Audit the ONE shared helper instead:
grep -n "names = \[\.\.\.CONSOLIDATED_TOOLS\]" lib/services/execution-hub-guidance.ts   # expect 1 — the empty→all-six fallback lives here now
grep -c "deriveMcpToolNames(" lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/stream/route.ts   # expect 1 + 1 — the CALL site in each adapter (the import line carries no paren) [refreshed 2026-08-16 health-run; prior inline expectation engine:532/stream:433 was stale post-Phase-6]

# ⚠️ GRANT-BLIND EXECUTOR — the per-turn dispatcher does NOT check that an invoked tool was granted.
# Excluding a tool removes it from the model's OFFER surface, but a model that emits it anyway still executes.
# The pending track-1 fix is an allowlist gate HERE (assert toolCall.name ∈ grantedSet before dispatch):
grep -nE "for \(const toolCall of functionCalls|getToolDefinition\(toolCall\.name\)" lib/agents/harness/agentic-tool-loop.ts
# Expect: loop at ~:294 + getToolDefinition(toolCall.name) at ~:295 with NO membership guard between them.
# If a `grantedSet`/`not granted` check appears around :295 → track-1 executor gate SHIPPED; update this note.

# Service-call auth is USER-scoped, not template/agent-scoped (the real confinement gap — hub domain, not engine):
grep -nE "checkServiceAccess" lib/mcp/server/tools/hub/hub-utilities.js lib/mcp/server/tools/hub/service-call-handler.js
# Expect: checkServiceAccess(userId, service) — publicAccess|ownerId===userId|isUserAdmin only.
```

**Verdict (R-ENG-4):** the tool list is an **offer-surface** control (excluding a tool removes it from the
executable `functions:` array — genuine, not advisory), **NOT** an authorization boundary. True confinement
needs (1) the executor allowlist gate above [engine/shared] **+** (2) per-service/principal scope on
`checkServiceAccess` [hub — boundary-contract + sec-ops, BLOCKER #1]. **No seeded template sets an explicit
grant today** — all rely on the empty→all-six default; the two MCP orchestrators *depend* on it to reach
`services`/`registry` (why the D1 flip was declined). The three network-provisioning cognition templates
would be the first seed-authored templates to carry explicit `selectedTools`.

---

## Objective

Perform a comprehensive discovery of the agent execution engine domain, focusing on transaction atomicity, SSE streaming architecture, execution lifecycle state management, error handling completeness, and LLM integration. This discovery is scoped to the execution ENGINE -- the runtime system that processes agent executions -- not the broader MCP integration or artifact retrieval UI.

## Context

The agent execution system has two execution paths:
1. **GUI Streaming Route** (`/app/api/pov/agent/execute/stream/route.ts`) - SSE-based with TransformStream, agentic tool loop via `generateText`
2. **MCP Engine** (`/lib/services/agentExecutionEngine.ts`) - EventEmitter-based singleton with pending queue processing (Claude Desktop path)

**Note**: The non-streaming GUI route (`/app/api/pov/agent/execute/route.ts`) was removed in Mar 2026. The GUI now always uses streaming execution.

The critical architectural pattern is Transaction Atomicity (#37): every state transition must update execution status, task status, and artifacts in a single `$transaction`.

## Discovery Scope

### Phase 1: Transaction Atomicity Audit
The most critical aspect. Every execution path must atomically update execution + task + artifacts.

### Phase 2: Execution Lifecycle Tracing
Map all state transitions from PENDING through RUNNING to SUCCESS/FAILED.

### Phase 3: SSE Streaming Architecture
Audit all 11 SSE event types, verify SSE-after-commit ordering.

### Phase 4: Error Path Completeness
Verify every error path updates BOTH execution AND task status atomically.

### Phase 5: LLM Service Integration
Trace how the engine integrates with the LLM service for text generation and streaming.

### Phase 6: Supporting Services Audit
Rate limiting, validation, POV access, template loading.

---

## Search Strategies

### 0. Typed Errors (Apr 2026; Priority-3 fallback removed 2026-06-10)

```bash
echo "=== TYPED EXECUTION ERRORS ==="
# Apr 2026: two typed error classes added to lib/errors.ts for the engine path.
# Both extend AppError and expose `.code` for GUI errorCategory routing.
grep -n '^export class \(NoTemplateAssignedError\|DuplicateActiveExecutionError\)' lib/errors.ts
echo "NoTemplateAssignedError (Concern B) + DuplicateActiveExecutionError (L3)"

echo "--- Engine guard sites that throw typed errors ---"
grep -rn 'throw new NoTemplateAssignedError\|throw new DuplicateActiveExecutionError' lib/services/ app/api/

echo "--- Outer-catch .code → errorCategory wiring ---"
# The outer catches at agentExecutionEngine.ts:1631 + :308 read error.code
# into execution.errorCategory for error.json. Typed errors surface through
# this path automatically; plain new Error() would yield undefined.
grep -n '(error as any)?.code\|errorCategory:\s*execErrCode\|errorCategory:\s*errCode' lib/services/agentExecutionEngine.ts

echo "--- Priority-3 Universal Template fallback: REMOVED (commit 4077c049, 2026-06-10) ---"
# The deprecated Priority-3 fallback in buildSystemPrompt + the stream-route
# ad-hoc fallback were deleted after the 30-day observation window showed zero
# prod hits. Replaced by fail-loud NoTemplateAssignedError (engine:569, stream:420).
# These greps should now return ZERO (markers gone, fallback dead). If they hit,
# the dead fallback was re-introduced.
grep -rn 'DEPRECATED.*Concern B\|DEPRECATED.*Priority 3\|resolvePAIchartUniversalTemplate' lib/services/ app/api/ && echo "WARNING: dead fallback re-introduced" || echo "✓ Priority-3 fallback stays removed"

echo "--- Sibling reactor-skip-counter (related pattern) ---"
ls lib/services/reactor-skip-counter.ts 2>/dev/null
echo "See event-system discovery §3.3"
```

### 1. Transaction Atomicity Audit (CRITICAL)

```bash
# Find ALL $transaction blocks in execution paths
echo "=== Transaction Blocks in Execution Domain ==="
grep -n "\$transaction" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts

# Verify each transaction contains BOTH execution AND task updates
echo ""
echo "=== Execution Status Updates Inside Transactions ==="
grep -n "status.*SUCCESS\|status.*FAILED\|executionStatus" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts

# Find any execution status updates OUTSIDE transactions (potential bugs)
echo ""
echo "=== updateExecutionStatus Calls (should NOT be inside $transaction) ==="
grep -n "updateExecutionStatus\|updateExecutionLogs" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts

# Check that updateExecutionStatus helper does NOT accept tx parameter
echo ""
echo "=== updateExecutionStatus Method Signature ==="
grep -A5 "private async updateExecutionStatus" /home/steve/copov15/lib/services/agentExecutionEngine.ts
```

**What to look for**:
- Every `$transaction` block should update BOTH execution status AND task executionStatus
- `updateExecutionStatus` should NOT be called inside a `$transaction` (it uses its own `prisma.`)
- Inside transactions, execution updates should use `tx.agentExecution.update(...)` directly
- Artifact creation should be inside the same transaction as status updates

### 2. Execution State Transitions

```bash
# Map all state transitions
echo "=== All Execution State Transitions ==="
grep -n "status.*'PENDING'\|status.*'RUNNING'\|status.*'SUCCESS'\|status.*'FAILED'" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts

# Find the execution creation point (initial PENDING state)
echo ""
echo "=== Execution Creation (PENDING) ==="
grep -n "agentExecution\.create" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts

# Find RUNNING transitions
echo ""
echo "=== RUNNING Transitions ==="
grep -n "RUNNING" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts

# Find the queue guard (only process PENDING executions)
echo ""
echo "=== Queue Processing Guard ==="
grep -B3 -A10 "processPendingExecutions" /home/steve/copov15/lib/services/agentExecutionEngine.ts | head -40

# Check for execution status validation before processing
echo ""
echo "=== Status Guard Before Processing ==="
grep -n "status !== 'pending'\|status !== 'PENDING'" /home/steve/copov15/lib/services/agentExecutionEngine.ts
```

**What to look for**:
- Clear PENDING -> RUNNING -> SUCCESS/FAILED transitions
- No skipped states (e.g., PENDING directly to SUCCESS)
- Guard conditions preventing re-processing of non-PENDING executions
- Task executionStatus synchronized at every state change

### 3. SSE Event Emissions

```bash
# Find ALL SSE event type emissions in streaming route
echo "=== SSE Event Types in Streaming Route ==="
grep -n "type:.*'" /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts | grep -v "//\|content"

# Find the [DONE] termination signal
echo ""
echo "=== Stream Termination ([DONE]) ==="
grep -n "DONE" /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts

# Verify TransformStream setup
echo ""
echo "=== TransformStream Setup ==="
grep -n "TransformStream\|readable\|writable\|TextEncoder\|writer\|encoder" \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts | head -15

# Check SSE content-type header
echo ""
echo "=== SSE Content-Type ==="
grep -n "text/event-stream\|event-stream" /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts

# Verify SSE-after-commit ordering (events after $transaction)
echo ""
echo "=== SSE-After-Commit Pattern Verification ==="
grep -n "\$transaction\|writer\.write\|encoder\.encode" \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts | head -40
```

**What to look for**:
- All 13 SSE event types are emitted: execution_started, prompt_snapshot, text_chunk, tool_result_card, log_update, execution_update, artifact_created, function_call, web_search_results, citations, search_queries, error, [DONE]
- `prompt_snapshot` (2026-06-10): runtime-assembled system + user prompts, emitted ONCE before the loop call — the only place the exact LLM input is visible (live-only, not persisted, stream-only)
- `execution_started` is the FIRST event (initialData defined ~line 295, written ~line 315) — carries executionId, taskId, taskTitle, startTime
- `tool_result_card` (2026-06-10, Monitoring Medium): structured per-tool outcome emitted from the `onToolResult` observer; since this event exists, `text_chunk` carries PROSE ONLY (live Deliverable Contract). Consumer: `lib/pov/api/agent-service.ts` (`onToolResultCard`) → `AgentMonitoringView` activity cards. STREAM-ONLY by design.
- **Grep false-positive warning**: `type: '[a-z_]*'` also matches `type: 'tool_result'` (~line 800 — Anthropic content block in message history, NOT an SSE event), `type: 'object'` (JSON schema), and `type: 'text'` (content block). Only count emissions that flow through `safeWrite(...)` — since the 2026-08-21 sweep, NO emission uses raw `writer.write(encoder.encode(...))` (the only raw writes are inside safeWrite itself and the heartbeat).
- **SSE write contract (2026-08-21 — F2 SUPERSEDED)**: every SSE write at every phase routes through `safeWrite` (a `clientGone`-latched absorb-on-transport-failure helper); a client disconnect stops the streaming, never the work. The 2026-07-04 F2 ruling ("pre-commit writes propagate-on-disconnect") was superseded with lead + boundary sign-off after a disconnect discarded a completed deliverable. Pinned by `test:terminal-persist-ponr` P7 (zero raw writes) + P8 (latch), and by the zero-raw gate in `test:sse-event-sequence`. Record: `cline_docs/reviews/stream-safewrite-sweep-2026-08-21/`.
- `[DONE]` is always the last event, even on error paths
- SSE events are sent AFTER `$transaction` commits (SSE-after-commit pattern)
- TransformStream is properly set up with TextEncoder

### 4. Error Path Completeness

```bash
# Find ALL error handling blocks
echo "=== Error Handling in Engine ==="
grep -n "catch\|error\|FAILED" /home/steve/copov15/lib/services/agentExecutionEngine.ts | grep -i "catch\|failed" | head -20

echo ""
echo "=== Error Handling in Streaming Route ==="
grep -n "catch\|FAILED" /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts | grep -i "catch\|failed" | head -20

# Find the safety-net catch in processPendingExecutions
echo ""
echo "=== Safety-Net Catch (processPendingExecutions) ==="
grep -B2 -A15 "Error in processPendingExecutions" /home/steve/copov15/lib/services/agentExecutionEngine.ts

# Check that error paths create error artifacts
echo ""
echo "=== Error Artifact Creation ==="
grep -n "error\.json\|error.*artifact" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts

# Verify outer catch error handling in streaming (generateText throws, no chunk.error)
echo ""
echo "=== Outer Catch Error Handling ==="
grep -B3 -A10 "catch.*error\|FAILED" /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts | head -30
```

**What to look for**:
- Two error paths exist: (1) streaming route outer catch (generateText throws), (2) processPendingExecutions safety-net in engine
- Each error path uses `$transaction` to atomically update execution + task
- Error artifacts (error.json) are created inside the same transaction
- No error path leaves execution in RUNNING state without updating task

### 5. LLM Service Integration

```bash
# Find LLM service method calls
echo "=== LLM Service Calls ==="
grep -n "generateText\|streamText\|llmService\|LLMService" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts | head -20

# Find LLM service initialization
echo ""
echo "=== LLM Service Initialization ==="
grep -n "new LLMService\|LLMService\.\|llm.*service" \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts | head -10

# Trace prompt construction
echo ""
echo "=== Prompt Construction ==="
grep -n "systemPrompt\|userPrompt\|messages\|prompt" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts | head -20

# Find streaming chunk processing
echo ""
echo "=== Streaming Chunk Processing ==="
grep -n "chunk\.\|for await\|async.*generator\|yield" \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts | head -20

# Check LLM types for chunk structure
echo ""
echo "=== LLM Chunk Types ==="
grep -n "interface.*Chunk\|type.*Chunk\|text.*functionCall\|webSearch" \
  /home/steve/copov15/lib/services/llm/types.ts | head -15
```

```bash
# Check agentic tool loop implementation — SINCE 2026-06-10 the loop lives in
# the SHARED MODULE; the callers only wire observers + consume AgenticLoopResult.
echo "=== Agentic Tool Loop (shared module) ==="
# Broadened 2026-06-20 (SDK 0.105): the loop now resolves model caps at the chokepoint
# (normalizeModelConfig + capabilitiesFor) and resumes on pause_turn — keep the original
# anchors AND these.
grep -n "MAX_TOOL_TURNS\|stopReason\|functionCalls\|tool_use\|turnCount\|normalizeModelConfig\|pause_turn\|capabilitiesFor\|buildLlmCallOptions" \
  /home/steve/copov15/lib/agents/harness/agentic-tool-loop.ts | head -25

echo "=== Caller delegation (expect 1 runAgenticToolLoop per path) ==="
grep -n "runAgenticToolLoop({\|loopResult" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts | head -8

# Check content block types
echo ""
echo "=== Content Block Types in LLM Types ==="
grep -n "tool_result\|tool_use\|rawContentBlocks\|functionCalls\|stopReason" \
  /home/steve/copov15/lib/services/llm/types.ts | head -15

# SDK 0.105 capability-map architecture (added 2026-06-20) — model-conditional request layer.
echo ""
echo "=== Capability map + shared finalizer + single request builder (SDK 0.105) ==="
grep -n "capabilitiesFor\|clampEffort\|ModelCapabilities" \
  /home/steve/copov15/lib/services/llm/model-capabilities.ts | head
grep -n "finalizeTextForStopReason" \
  /home/steve/copov15/lib/services/llm/finalize-response.ts | head -3
grep -n "buildAnthropicRequest\|normalizeStopReason" \
  /home/steve/copov15/lib/services/llm/anthropic-sdk-provider.ts | head
grep -n "anthropicModels\|LLM_STOP_REASONS\|toModelOptions\|effort" \
  /home/steve/copov15/lib/services/llm/types.ts | head
```

**What to look for**:
- Which LLM methods are called: `generateText()` for both engine AND streaming route (with agentic tool loop)
- How prompts are constructed from templates and task context
- How tool results are sent as formatted SSE `text_chunk` events (markdown with JSON code blocks)
- Error handling for LLM service failures
- Agentic loop: `while` loop with `stopReason === 'tool_use'` check
- `functionCalls` array populated (not just singular `functionCall`)
- `rawContentBlocks` and `stopReason` exposed from provider
- `signal` passed to ALL `generateText()` calls in the loop
- Tool errors returned as `is_error: true` tool_result blocks
- **Model-conditional request (SDK 0.105)**: `capabilitiesFor(model)` (fail-loud) drives temperature-drop / adaptive
  thinking / `output_config.effort` per model; ONE `buildAnthropicRequest` builds both paths; `normalizeStopReason`
  maps `stop_reason` (replaced the dual `as` cast). Picker derives from `anthropicModels` via `toModelOptions`.
- **pause_turn resume**: the loop while-guard continues on `pause_turn` (not only `tool_use`) — no silent truncation.
- **Engine↔stream terminal parity**: both paths call `finalizeTextForStopReason` (max-turns / max_tokens / refusal);
  ctx-window surfaces as `CONTEXT_WINDOW_EXCEEDED` errorCategory.

### 6. Supporting Services Audit

```bash
# Rate limiting for execution endpoints
echo "=== Execution Rate Limiting ==="
grep -n "agentExecutionLimiter\|execution.*limit\|rate.*limit.*agent" \
  /home/steve/copov15/lib/middleware/rate-limit.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts

# Validation schema (AgentExecuteSchema)
echo ""
echo "=== AgentExecuteSchema Usage ==="
grep -n "AgentExecuteSchema\|agentExecuteSchema\|safeParse.*execute" \
  /home/steve/copov15/lib/validation/agent-template-validation.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts | head -15

# Prompt injection prevention
echo ""
echo "=== Prompt Injection Prevention ==="
grep -n "detectPromptInjection\|injection\|sanitize" \
  /home/steve/copov15/lib/validation/agent-template-validation.ts | head -10

# POV access validation
echo ""
echo "=== POV Access Validation in Execution ==="
grep -n "validatePOVAccess\|withPOVAccess\|getPOVFromTask" \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts

# Template service integration
echo ""
echo "=== Template Service Integration ==="
grep -n "agentTemplateService\|getTemplate\|loadTemplate\|template" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts | head -15
```

**What to look for**:
- Rate limiting is applied to both execution endpoints
- AgentExecuteSchema validates input with prompt injection prevention
- POV access is validated before execution starts
- Template loading provides the agent's system prompt and configuration

### 6.4. Phase 0 Convergence Parity Greps (2026-06-10 — D-A..D-D)

```bash
# The four convergence fixes (commits 349c8f84, b5a8d59c, 9f55a9f4, 64b7c864) made the
# two tool loops behaviorally identical pending extraction. Verify none regressed:

echo "=== D-A: per-turn timeout identical (expect 30_000 in BOTH) ==="
grep -n "TIMEOUT_PER_TURN_MS = " lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/stream/route.ts

echo "=== D-B: P2 provider-error check in BOTH paths (expect 1 hit each) ==="
grep -c "LLM call failed at provider layer" lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/stream/route.ts

echo "=== D-C: per-tool durationMs from toolStartTime in BOTH (expect 0 turnStartTime) ==="
grep -c "durationMs: Date.now() - toolStartTime" lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/stream/route.ts
# Match the CODE pattern only — a D-C explanatory comment mentions the old name
grep -n "Date.now() - turnStartTime" lib/services/agentExecutionEngine.ts && echo "REGRESSION: turn-level timing back" || echo "✓ turn-level durationMs gone"

echo "=== D-D: no call-site model fallback in EITHER path (expect 0) ==="
grep -c "claude-haiku-4-5" lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/stream/route.ts

echo "=== EXTRACTION COMPLETE (2026-06-10): the tool loop has ONE implementation ==="
# Both paths delegate to lib/agents/harness/agentic-tool-loop.ts. Expect:
#   runAgenticToolLoop: 1 call site per path
grep -c "runAgenticToolLoop({" lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/stream/route.ts
#   buildLlmCallOptions: 0 residual per path since convergence Phase 3 (2026-07-05) — the #90 retry
#   was extracted to lib/agents/harness/diagnostic-retry.ts (runDiagnosticRetry), which now owns the
#   sole caller-side buildLlmCallOptions('reflection', …). Post-loop cascade extracted to
#   execution-quality.ts (Phase 1); deliverable text via loopResult.assembledText (Phase 2).
grep -c "buildLlmCallOptions(" lib/agents/harness/diagnostic-retry.ts   # Expect: 1 (the shared retry)
grep -c "buildLlmCallOptions" lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/stream/route.ts   # Expect: 0 + 0

echo "=== Inline-loop tripwire (BC75 phantom-canonical shape — expect ZERO) ==="
# A while-loop on stopReason in either caller file means someone re-inlined the loop.
grep -n "while (currentResponse.stopReason" lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/stream/route.ts && echo "WARNING: inline tool loop re-introduced" || echo "✓ no inline loop"
grep -n "generateText(.*, {$" lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/stream/route.ts && echo "WARNING: inline options object re-introduced" || echo "✓ no inline option objects"
```

**Cross-link**: `cline_docs/agent-tool-loop-extraction-plan.md` — these greps become obsolete
once Phase 2-3 extraction lands (the shared module IS the parity guarantee then).

### 6.5. Engine-Skip Parity Audit (Apr 2026 — load-bearing for harness defense; CENTRALIZED Phase 6, 2026-07-06)

> **⚠️ Updated 2026-07-12**: the `isPipelineTask` skip is **no longer duplicated in the two big files** —
> Phase 6 convergence moved it INTO the shared terminal-persist core (`execution-terminal-persist.ts`), the
> ONE place the SUCCESS terminal update is now written for BOTH adapters. Grepping `agentExecutionEngine.ts` /
> `stream/route.ts` for `isPipelineTask` now correctly returns ZERO — that is convergence, NOT broken defense.
> Audit the single-source site instead:

```bash
# Verify the isPipelineTask skip exists at the ONE shared terminal-persist site.
# This skip is what makes the handler-side 4-point invariant reachable —
# if removed, PIPELINE tasks auto-complete via the engine and bypass defense.

echo "=== Shared terminal-persist: isPipelineTask declaration + conditional spread ==="
grep -n "isPipelineTask" /home/steve/copov15/lib/services/execution-terminal-persist.ts
# Expect: declaration (:527) + `...(isPipelineTask ? {} : { status: 'COMPLETED' })` spread (:740).
# Refs verified 2026-07-26 (were ~:483/~:493 — ~50 and ~250 lines stale). Four other uses at
# :556 (isProgramLeg), :608, :658, :703 — the SHAPE claim is "one declaration, one status spread".

echo ""
echo "=== Adapters MUST be empty now (Phase-6 centralization — NOT a broken path) ==="
grep -c "isPipelineTask" /home/steve/copov15/lib/services/agentExecutionEngine.ts /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts
# Expect: 0 + 0. A NON-zero hit means someone re-inlined the skip in an adapter (drift returning).

# The shared site MUST contain:
#   const isPipelineTask = currentTaskType?.type === 'PIPELINE';
#   ...(isPipelineTask ? {} : { status: 'COMPLETED' }),
#
# If the shared spread is absent, defense is broken for BOTH paths at once.
# Regression test: scripts/test-pipeline-engine-skip.ts (locked in npm run test:all-validation)
```

**Pattern reference**: `dual-execution-path-parity-pattern.md` — the regression test IS the parity enforcement.
Post-Phase-6 the single shared write-site is *itself* the parity guarantee (nothing to mirror), and the test
now guards that one site; before Phase 6 the test caught inadvertent removal in either duplicated copy.

### 6.6. Context-Chaining Chokepoint Audit (2026-06-07 — commit 6c640337)

```bash
# Dependency context chaining (§6 Pipeline Context) must run for EVERY execution
# path. It is invoked ONCE at the row-creation chokepoint, NOT per-path. A prior
# bug had it only on the explicit agent.execute path → reactor-cascade children
# got inputContext=NULL → empty §6 → truncated agent.results fallback.

echo "=== Chaining is invoked at the createAgentExecution chokepoint (before INSERT) ==="
grep -n "prepareTaskForExecution" /home/steve/copov15/lib/services/agent-execution-create.ts
# Expect: 1 call, before prisma.agentExecution.create

echo ""
echo "=== chainer is consumed ONLY by the thin pre-execution step (not per-path) ==="
grep -rn "chainDependencyContext\|applyChainedContext" /home/steve/copov15/lib --include="*.ts" | grep -v "context-chainer.ts"
# Expect: ONLY lib/agents/harness/prepare-task-for-execution.ts
# Violation: any match in agentTaskService.ts (the old explicit-path call site — chaining moved OFF it)

echo ""
echo "=== A1 §6 cap + queryable truncation tripwire ==="
grep -n "PER_PREDECESSOR_SOFT_CAP\|TOTAL_CONTEXT_CEILING\|anyTruncated" /home/steve/copov15/lib/agents/harness/context-chainer.ts
# Expect: per-predecessor 128KB + total 512KB consts; anyTruncated carried on pipelineMetadata.
# Monitor truncation in prod via DB: inputContext->'pipelineMetadata'->>'anyTruncated' (NOT logs).
```

**Note**: this is the SAME two-execution-path-parity class as 6.5 — the cure was centralizing at the chokepoint (`createAgentExecution`) so there is nothing to mirror. `createAgentExecution` is the universal row-creation gateway; `executeAgentOnTask` is the explicit-`agent.execute` setup path only.

**Cross-link**: agent-execution-specialist.md §"Engine-skip is load-bearing for harness defense reachability".

---

### 7. Streaming Route Agentic Tool Loop (Mar 2026)

```bash
# Verify agentic loop in streaming route (uses generateText, not streamText)
echo "=== Streaming Route Tool Loop ==="
grep -n "MAX_TOOL_TURNS\|stopReason\|functionCalls\|generateText\|tool_use\|turnCount" \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts | head -20

# Check CAS guard (atomic claim before execution)
echo ""
echo "=== CAS Guard ==="
grep -n "claimed\|ALREADY_RUNNING" \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts

# Check MCP tool loading
echo ""
echo "=== MCP Tool Loading ==="
grep -n "mcpServerManager\|getToolDefinitions\|executeToolOnServer" \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts | head -10

# Check engine queue processing interval (MCP path)
echo ""
echo "=== Queue Processing Schedule ==="
grep -n "setInterval\|processPending\|queue.*interval\|poll" /home/steve/copov15/lib/services/agentExecutionEngine.ts | head -10
```

**What to look for**:
- Streaming route uses `generateText()` (not `streamText()`) for full agentic tool loop
- `while (stopReason === 'tool_use')` loop with `MAX_TOOL_TURNS` cap
- CAS guard via `updateMany` with WHERE condition prevents duplicate execution
- MCP tools loaded via `mcpServerManager.getToolDefinitions()`
- Tool results sent as SSE `text_chunk` events with markdown formatting
- Engine queue processing runs on initialization (for MCP/Claude Desktop path)

### 8. Artifact Creation Flows

```bash
# Find all artifact creation points
echo "=== Artifact Creation ==="
grep -n "agentArtifact\.create\|artifact.*create\|createMany.*artifact" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts

# Find artifact types (result.json, pipeline-index.json, report.md, error.json)
echo ""
echo "=== Artifact Types ==="
grep -n "result\.json\|pipeline-index\.json\|report\.md\|raw_response\|error\.json\|name:.*\.json\|name:.*\.md\|name:.*\.txt" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts

# Verify artifact policy gate (PIPELINE → no report.md; leaf → report.md; intermediate → JSON only)
echo ""
echo "=== Artifact Policy ==="
grep -n "shouldProduceMarkdownReport\|produceMd\|jsonArtifactName\|pipeline-index" \
  /home/steve/copov15/lib/services/agentArtifactPolicy.ts \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts

# Verify artifacts created inside transactions
echo ""
echo "=== Artifact Inside Transaction Check ==="
grep -B5 "agentArtifact" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts | grep -E "\$transaction|tx\.|agentArtifact"

# Deliverable Contract (2026-04-26): no tool dumps in finalResponse
echo ""
echo "=== No Tool-Dump Leak in finalResponse (commit d652a630) ==="
# These should return ZERO matches in ENGINE/STREAM execution paths.
# If they reappear, the leak from before commit d652a630 is back.
grep -n "## Tool Execution (Turn\|finalResponse = (finalResponse || '') + toolMarkdown\|generatedText += toolResultText" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts || echo "✓ no leak markers found"

# Verify structured tool forensics still present (these MUST exist)
echo ""
echo "=== Tool Forensics in result.json ==="
grep -n "toolCalls:\|qualityMetrics:\|toolCallSuccess:\|mcpToolsProvided:\|toolLoop:" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts
```

**What to look for**:
- Three artifact types: `result.json` (always for non-PIPELINE), `pipeline-index.json` (only for PIPELINE harness tasks), `report.md` (only for leaf non-PIPELINE per `agentArtifactPolicy.ts`)
- Error artifacts: `error.json` with stack trace and context
- ALL artifact creation inside `$transaction` boundaries
- Artifact IDs used in SSE `artifact_created` events
- **Deliverable Contract**: NO `## Tool Execution (Turn N)` builder in either execution path. `result.json.toolCalls` (and `qualityMetrics`, `mcpToolsProvided`, `toolLoop`) stay populated.

### 9. System Health Validation

```bash
echo "=== Agent Execution Engine Health Check ==="
echo ""
echo "1. Core Engine:"
[ -f /home/steve/copov15/lib/services/agentExecutionEngine.ts ] && echo "   agentExecutionEngine.ts: EXISTS ($(wc -l < /home/steve/copov15/lib/services/agentExecutionEngine.ts) lines)" || echo "   agentExecutionEngine.ts: MISSING"

echo "2. Non-Streaming Route (REMOVED Mar 2026):"
[ -f /home/steve/copov15/app/api/pov/agent/execute/route.ts ] && echo "   execute/route.ts: EXISTS (UNEXPECTED - should be deleted)" || echo "   execute/route.ts: REMOVED (correct)"

echo "3. Streaming Route:"
[ -f /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts ] && echo "   execute/stream/route.ts: EXISTS ($(wc -l < /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts) lines)" || echo "   execute/stream/route.ts: MISSING"

echo "4. LLM Service:"
[ -f /home/steve/copov15/lib/services/llm/llm-service.ts ] && echo "   llm-service.ts: EXISTS ($(wc -l < /home/steve/copov15/lib/services/llm/llm-service.ts) lines)" || echo "   llm-service.ts: MISSING"

echo "5. Validation:"
[ -f /home/steve/copov15/lib/validation/agent-template-validation.ts ] && echo "   agent-template-validation.ts: EXISTS ($(wc -l < /home/steve/copov15/lib/validation/agent-template-validation.ts) lines)" || echo "   agent-template-validation.ts: MISSING"

echo ""
echo "=== Transaction Block Count ==="
echo "  Engine: $(grep -c '\$transaction' /home/steve/copov15/lib/services/agentExecutionEngine.ts 2>/dev/null || echo 0) transactions"
echo "  Streaming: $(grep -c '\$transaction' /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts 2>/dev/null || echo 0) transactions"

echo ""
echo "=== SSE Event Type Count ==="
echo "  Event types: $(grep -c "type:.*'" /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts 2>/dev/null || echo 0) emissions"

echo ""
echo "=== Error Path Count ==="
echo "  Engine errors: $(grep -c 'FAILED' /home/steve/copov15/lib/services/agentExecutionEngine.ts 2>/dev/null || echo 0) FAILED references"
echo "  Streaming errors: $(grep -c 'FAILED' /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts 2>/dev/null || echo 0) FAILED references"

echo ""
echo "=== Rate Limiting ==="
grep -c "agentExecutionLimiter" /home/steve/copov15/lib/middleware/rate-limit.ts 2>/dev/null && echo "  agentExecutionLimiter: DEFINED" || echo "  agentExecutionLimiter: NOT FOUND"
```

---

## Output Format

```markdown
# Agent Execution Engine Discovery Report

## Summary
- Core engine: X lines (agentExecutionEngine.ts)
- Execution paths: 2 (GUI streaming + MCP engine)
- Transaction blocks: X total (Y in engine, Z in streaming route)
- SSE event types: X/13 verified
- Error paths: X (all atomically consistent: YES/NO)
- Rate limiting: Configured/Missing
- Non-streaming route: REMOVED (Mar 2026)

## Transaction Atomicity Status

### Success Paths
| Location | File | Line | Atomic | Verified |
|----------|------|------|--------|----------|
| Engine success | agentExecutionEngine.ts | ~705 | YES/NO | |
| Non-streaming success | route.ts | ~319 | YES/NO | |
| Streaming success | stream/route.ts | ~??? | YES/NO | |

### Error Paths
| Location | File | Line | Atomic | Updates Both | Error Artifact |
|----------|------|------|--------|-------------|----------------|
| Engine safety-net | agentExecutionEngine.ts | ~168 | YES/NO | YES/NO | YES/NO |
| Streaming outer catch | stream/route.ts | ~??? | YES/NO | YES/NO | YES/NO |

## SSE Event Audit
| Event Type | Found | Line | After Commit |
|-----------|-------|------|-------------|
| execution_started | YES/NO | | |
| prompt_snapshot | YES/NO | | |
| text_chunk | YES/NO | | |
| tool_result_card | YES/NO | | |
| log_update | YES/NO | | |
| execution_update | YES/NO | | |
| artifact_created | YES/NO | | |
| function_call | YES/NO | | |
| web_search_results | YES/NO | | |
| citations | YES/NO | | |
| search_queries | YES/NO | | |
| error | YES/NO | | |
| [DONE] | YES/NO | | |

## State Transition Map
PENDING --> RUNNING --> SUCCESS
                   \-> FAILED

Guards: [list guards preventing invalid transitions]
Synchronization: [task executionStatus synced at each transition: YES/NO]

## Issues Found
1. [CRITICAL/HIGH/MEDIUM/LOW] - Description
2. ...

## Recommendations
1. [Priority] - Action
2. ...
```

### 10. MCP Execution Path (Claude Desktop) - Feb 2026 / Three-Tier Refactor Mar 2026

```bash
# Trace the MCP execution chain: Claude Desktop -> MCP server -> web server
echo "=== MCP Agent Execute Handler ==="
grep -n "executeById\|fire-and-forget\|agentExecutionEngine" \
  /home/steve/copov15/lib/mcp/tasks/action/handlers/agent/agent-execute-handler.ts

# Check three-tier fallback in perform handler (Mar 2026 refactor)
echo ""
echo "=== Three-Tier Fallback Pattern ==="
grep -n "TIER 1\|TIER 2\|TIER 3\|routeAction\|buildTokenPayload\|Authentication required" \
  /home/steve/copov15/lib/mcp/server/tools/advanced/task-action-handler.js

# Check router bridge (JS→TS boundary — now loads cleanly in both processes
# via ts-node registered in server.js AND mcp-server-http-clean.js, as of
# Phase 2 proper / Bug Class 73 eradication Apr 8 2026. Both PM2 workers log
# `tier:'direct'` at startup. See bug-class-registry.md BC73.)
echo ""
echo "=== Router Bridge ==="
grep -n "routeAction\|TasksActionRouter\|skipLogging" \
  /home/steve/copov15/lib/mcp/tasks/action/router-bridge.js

# Check buildTokenPayload security guards
echo ""
echo "=== buildTokenPayload Guards ==="
grep -n "VALID_ROLES\|trim()\|userId is missing\|Invalid user role" \
  /home/steve/copov15/lib/mcp/server/utils/build-token-payload.js

# Check poll-and-return logic in MCP server
echo ""
echo "=== Poll-and-Return in MCP Server ==="
grep -n "agent\.execute\|pollIntervalMs\|maxWaitMs\|agent\.status\|agent\.results" \
  /home/steve/copov15/lib/mcp/server/tools/advanced/task-action-handler.js

# Check HTTP timeout config
echo ""
echo "=== MCP HTTP Timeout Config ==="
grep -n "timeout\|retries" \
  /home/steve/copov15/lib/mcp/server/config/server-config.js

# Check Zod validation schemas for agent actions
echo ""
echo "=== Zod Schemas for Agent Actions ==="
grep -n "'agent\.\(execute\|status\|results\)'" \
  /home/steve/copov15/lib/validation/mcp-action-validation.ts

# Verify executionId is in agent.status schema (critical for poll-and-return)
echo ""
echo "=== agent.status Schema Fields ==="
grep -A5 "'agent.status'" /home/steve/copov15/lib/validation/mcp-action-validation.ts

# Check embedded server context passing
echo ""
echo "=== Embedded Server Tool Call Context ==="
grep -n "callTool\|context\|ContextEnricher" \
  /home/steve/copov15/lib/mcp/embedded-server.ts

# Check resourceManager guard patterns
echo ""
echo "=== ResourceManager Method Guards ==="
grep -n "typeof this.resourceManager\.\(registerResource\|updateResource\)" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts

# Verify shared module infrastructure (Feb 2026 extraction)
echo ""
echo "=== Shared Resource Manager Infrastructure ==="
echo "IResourceManager interface:"
grep -n "implements IResourceManager" /home/steve/copov15/lib/services/mcp/resourceManager.ts
echo "Shared imports in TS manager:"
grep -n "resource-manager-types\|resource-manager-shared" /home/steve/copov15/lib/services/mcp/resourceManager.ts
echo "Shared imports in embedded server:"
grep -n "resource-manager-shared" /home/steve/copov15/lib/mcp/embedded-server.ts
```

**What to look for**:
- `agent-execute-handler.ts` uses fire-and-forget (no `await` on `executeById`)
- `task-action-handler.js` polls `agent.status` every 5s, max 1140s (19 min — engine worst case 1080s + 60s buffer; raised from 300s 2026-06-10), then fetches results
- `mcp-action-validation.ts` has `executionId` in the `agent.status` schema
- `embedded-server.ts` passes context to tool implementations, imports `generateDownloadUrl` from `resource-manager-shared.js`
- `agentExecutionEngine.ts` guards `registerResource`/`updateResource` with `typeof` checks (TS manager lacks these methods; JS manager has them)
- Both managers implement `IResourceManager` interface from `resource-manager-types.ts`
- HTTP timeout is 30s (server-config.js) — individual poll calls must be <30s

### 11. LLM Provider and Model Configuration

```bash
# Anthropic SDK provider constructor and per-request isolation
echo "=== Anthropic Provider Constructor + getClientForRequest ==="
grep -n "constructor\|getClientForRequest\|effectiveModel\|this\.model\|this\.client" \
  /home/steve/copov15/lib/services/llm/anthropic-sdk-provider.ts | head -15

# Current model registry (use aliases, not dated IDs)
echo ""
echo "=== Anthropic Model Registry ==="
grep -A6 "anthropicModels" /home/steve/copov15/lib/services/llm/types.ts | head -25

# Thinking model detection (must use effectiveModel, not this.model)
echo ""
echo "=== Thinking Model Detection ==="
grep -n "effectiveModel\|sonnet-4\|opus-4\|thinking" /home/steve/copov15/lib/services/llm/anthropic-sdk-provider.ts | head -10

# Per-request isolation: resolveUserSettings (not initializeWithUserSettings)
echo ""
echo "=== Per-Request User Settings Resolution ==="
grep -n "resolveUserSettings\|userLLMSettings\|apiKey:" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts | head -15

# Default model references — find ALL hardcoded model defaults
echo ""
echo "=== Default Model References (all files) ==="
grep -rn "claude-haiku-4-5\|claude-sonnet-4-6\|claude-sonnet-5\|claude-opus-4-8\|claude-opus-5\|claude-fable-5\|ANTHROPIC_MODEL" \
  /home/steve/copov15/lib/services/ \
  /home/steve/copov15/app/api/ \
  /home/steve/copov15/components/ \
  /home/steve/copov15/scripts/ \
  /home/steve/copov15/lib/pov/ \
  /home/steve/copov15/lib/agents/ \
  --include="*.ts" --include="*.tsx" | grep -v node_modules | head -30
# ⚠️ lib/agents/ added 2026-08-09: `lib/agents/model-tiers.ts` is now the SINGLE SOURCE OF TRUTH
# for template model selection (AGENT_MODELS tiers). A sweep for "all model defaults" that omits
# it misses the canonical one — the Protocol 11 "scope by what the pattern IS, not where you
# expect it to live" axis.

# Verify NO singleton mutation (setModel/setApiKey should not exist)
echo ""
echo "=== Singleton Mutation Check (should be empty) ==="
grep -rn "\.setModel(\|\.setApiKey(" \
  /home/steve/copov15/lib/services/llm/ --include="*.ts" | grep -v "interface\|NOTE\|removed"

# Token defaults for agent execution
echo ""
echo "=== Token Defaults ==="
grep -A5 "MCPTokenDefaults\|DEFAULT_MAX_TOKENS\|AGENT_EXECUTION_MAX_TOKENS" \
  /home/steve/copov15/lib/services/llm/types.ts | head -15

# Production env check
echo ""
echo "=== Production ANTHROPIC_MODEL ==="
ssh <PROD_USER>@<PROD_HOST> "cd /var/www/paichart-app/current && grep ANTHROPIC_MODEL .env.production" 2>/dev/null || echo "SSH not available"
```

**🆕 2026-06-18 — TWO-AXIS model resolution (the model-resolution cleanup `6ba54c5d`/`a8ea07f9`, Protocol-2 reviewed).** Model config resolves on **two orthogonal axes** at the single chokepoint `normalizeModelConfig` (`lib/agents/harness/agentic-tool-loop.ts`), which BOTH the engine (`agentExecutionEngine.ts`) and stream (`stream/route.ts`) paths feed:

- **MODEL axis — *which* LLM**: template-default → task/Agent-Builder override → **FAIL LOUD `MODEL_UNRESOLVED`** if absent (`AppError(..., 'MODEL_UNRESOLVED')`, surfaces as `errorCategory` in `error.json`, mirrors the apiKey `USER_CONFIG_REQUIRED` at `agentExecutionEngine.ts:633`). **There is no silent-Haiku fallback for agent execution** — the provider's `effectiveModel = mergedOptions.model || this.model` tail and the `claude-haiku-4-5` env default are now **upstream-dead for this path** (model is always resolved-or-thrown before the provider). The `model` field was **removed from user-profile settings** (it's a template/task property, not a credential).
- **PROVIDER + KEY axis — *whose* credentials**: `resolveUserSettings()` → `{ provider, apiKey }` from the user profile — their own key vs the system/org key (`useSystemProvider` / "Preferred Mode = system default"). Independent of the model.
- **maxTokens**: clamped model-aware at the chokepoint — `maxOutputTokensForModel(model)` (Opus 128K, Sonnet/Haiku 64K), NOT a static 64000.
- **maxToolTurns (D-1)**: a template-locked **orchestration** param — read from the template row, and task-path writes are **rejected** (`rejectTemplateControlledKeys`, 400). See `runtime-limits-discovery.md` (closed backlog ledger) + the `agent-execution-specialist` "Runtime ceilings I OWN" block.
- Guarded by `scripts/test-model-resolution-parity.ts` (model fail-loud, both builders share `buildTemplateModelParameters`, no `claude` literal, model-aware ceiling).

```bash
# Two-axis chokepoint + fail-loud (expect MODEL_UNRESOLVED + maxOutputTokensForModel)
grep -nE "MODEL_UNRESOLVED|maxOutputTokensForModel|userLLMSettings" lib/agents/harness/agentic-tool-loop.ts
# Model field gone from UserLLMSettings (expect provider?/apiKey? ONLY — NO model?)
grep -nA3 "interface UserLLMSettings" lib/agents/harness/agentic-tool-loop.ts
```

**What to look for**:
- Default model: `claude-haiku-4-5` is the **provider-singleton boot default only** (env `ANTHROPIC_MODEL`); it is NOT reached on the agent-execution path (model fail-louds — see two-axis above)
- Per-request isolation: `getClientForRequest(mergedOptions)` creates one-off client when `apiKey` provided
- `resolveUserSettings()` returns `{ provider, apiKey }` (NO `model` — two-axis); replaces deprecated `initializeWithUserSettings`
- `effectiveModel = mergedOptions.model || this.model` still exists *at the provider*, but `mergedOptions.model` is now always the resolved (or thrown) value — the `|| this.model` tail no longer fires for agent execution
- NO `setModel()` or `setApiKey()` calls anywhere (singleton mutation eliminated)
- Thinking models detected by `effectiveModel.includes('sonnet-4')` / `effectiveModel.includes('opus-4')`
- Model aliases used (e.g., `claude-haiku-4-5`), NOT dated IDs (e.g., `claude-haiku-4-5-20251001`)
- All model references consistent across codebase after model updates

**How to change default model** (checklist):
1. `anthropic-sdk-provider.ts` constructor fallback (line ~44)
2. `.env` and `.env.production` `ANTHROPIC_MODEL=`
3. `types.ts` model registry entry (`anthropicModels`)
4. UI components: `AgentBuilder.tsx`, `AgentBuilderForm.tsx`, `AgentConfigTab.tsx`, `ModelParametersSection.tsx`
5. Engine fallbacks: `agent-templates-adapter.ts` (4). `agentExecutionEngine.ts` call-site fallbacks REMOVED 2026-06-10 (D-D) — engine resolves `config.model ?? userLLMSettings.model`, provider default handles the tail. Grep `claude-haiku-4-5` in the engine should return 0.
6. Template fallback: `agentTaskService.ts` (line ~224) — model AND provider
7. `seed-agent-templates.ts`. NOTE: `app/api/llm/models/route.ts` no longer hardcodes a list — it READS the `anthropicModels`/`geminiModels` registry in `types.ts` (wired 2026-06-18), so step 3 covers the picker automatically.

**How to add a new provider model**:
1. Add to `anthropicModels`/`geminiModels` in `types.ts` (use alias, set correct `maxTokens`/`contextWindow`) — this single edit now surfaces it in `/api/llm/models` (the picker reads the registry; no route edit needed)
2. Add to the model `<SelectItem>` lists in the UI files that still hardcode them (`AgentBuilderForm.tsx` etc.) — those are NOT yet wired to the registry (a future cleanup; the route is)
3. If thinking-capable: verify `effectiveModel.includes()` pattern match

### 12. Artifact Cleanup and Lifecycle

```bash
# Artifact cleanup intervals
echo "=== Artifact Cleanup Scheduling ==="
grep -B2 -A5 "cleanupArtifactsByTask\|cleanupArtifactsByAge" \
  /home/steve/copov15/lib/services/mcp/resourceManager.ts | head -25

# Task outputArtifacts overwrite pattern
echo ""
echo "=== Task outputArtifacts Update ==="
grep -n "outputArtifacts" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts

# Artifact count per execution
echo ""
echo "=== Artifacts Created Per Execution ==="
grep -B2 -A15 "createMany" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts | head -25
```

**What to look for**:
- Daily @ midnight UTC: `cleanupArtifactsByTask()` — status-aware, keeps last 4 SUCCESS + 4 FAILED per task (shared `selectExecutionsToDelete`); non-terminal never deleted
- Daily: `cleanupArtifactsByAge(90)` removes >90 day artifacts
- Per-execution artifact count varies by `agentArtifactPolicy.ts`: PIPELINE → 1 (`pipeline-index.json`); leaf non-PIPELINE → 2 (`result.json` + `report.md`); intermediate non-PIPELINE → 1 (`result.json`)
- Task `outputArtifacts` is overwritten (not appended) with latest execution's artifacts
- Deliverable Contract (2026-04-26): `report.md = finalResponse` verbatim — no engine-side tool dumps. Forensic data lives in `result.json.toolCalls`

### 13. Pino Structured Logging for Execution Engine

Per Pattern #43 (96% confidence), the execution domain uses `mcpLogger` exclusively — loggers match the **code's domain** (MCP), not the entity being modified (task). This keeps a single execution's log trail filterable under one domain.

```bash
# Verify mcpLogger is the sole domain logger in execution files
echo "=== mcpLogger Usage in Execution Domain ==="
grep -rn "mcpLogger" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts

# Verify engine uses module child logger (Strategy B)
echo -e "\n=== Engine Module Logger ==="
grep -n "mcpLogger.child" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts

# Verify NO taskLogger/apiLogger mixed in (domain should be unified)
echo -e "\n=== Domain Fragmentation Check (should be empty) ==="
grep -rn "taskLogger\|apiLogger" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts

# Detect legacy console.log in execution files (should be zero)
echo -e "\n=== Legacy console.log (should be empty) ==="
grep -rn "console\.\(log\|error\|warn\|info\)" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts

# Verify correct pino API (object-first, not message-first)
echo -e "\n=== Verify Object-First pino API ==="
grep -rn "mcpLogger\.\(info\|warn\|error\)({" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/ --include="*.ts" | head -10
grep -rn "logger\.\(info\|warn\|error\)({" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts | head -10

# Check error serialization uses { err: error } key
echo -e "\n=== Error Serialization Pattern ==="
grep -rn "{ err:" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/ --include="*.ts" | head -10
```

**What to look for**:
- `mcpLogger` used for ALL execution events (lifecycle, task sync, SSE, LLM errors)
- Engine uses `mcpLogger.child({ module: 'AgentExecutionEngine' })` as local `logger` (Strategy B)
- Streaming route uses `mcpLogger` directly (Strategy A)
- NO `taskLogger` or `apiLogger` in execution files (would fragment domain tracing)
- No `console.log` remaining in execution domain files
- pino API is object-first: `logger.method({ key: value }, 'message')`
- Error serialization uses `{ err: error }` key (not `{ error: error }`)
- Per-turn LLM timing in BOTH pino and `logs` array (dual-channel, added Mar 2026)
- `totalUsage` token accumulation across agentic loop turns (streaming route, added Mar 2026)

### 13a. Token-Usage Persistence (Phase 1, 2026-07-02)

Structured LLM token FACTS are persisted as nullable columns on `agent_executions`
(`inputTokens`/`outputTokens`/`cacheReadTokens`/`cacheCreationTokens`/`modelUsed`) + `@@index([modelUsed, startTime])`.
Cost is DERIVED on read (`model-pricing.ts`, time-versioned, priced as-of `startTime`), never stored (Protocol 10).

- **Accumulator**: `totalUsage` is now `AccumulatedUsage` (input/output + cache); ONE `addUsage()` mutator
  at all 6 sites (4 in `agentic-tool-loop.ts` + the 2 diagnostic-retry callers, engine + stream). Widening
  the accumulator is the precursor — miss a site and the cache total silently under-counts.
- **Write-sites** *(refreshed 2026-07-05, convergence Phase 4b)*: shared `buildTokenUsageColumns()`
  (in `execution-artifacts.ts`) is spread at exactly TWO sites, both inside the shared terminal-persist
  core `execution-terminal-persist.ts` (`runTerminalSuccessTx` + `runTerminalFailureTx`) — the four
  former inline terminal updates (engine + stream × SUCCESS + FAILED) were extracted there. Adapters
  pass caller-owned usage; FAILED persists partial spend via each adapter's `capturedUsage` ref.
  `modelUsed` = serving model (null, never a fabricated 'default').

```bash
# expect: ONE addUsage helper, used at 6 sites; buildTokenUsageColumns spread at the 2 core tx sites ONLY
grep -rn "addUsage\|AccumulatedUsage" lib/agents/harness/agentic-tool-loop.ts lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/stream/route.ts | wc -l
grep -c "buildTokenUsageColumns(" lib/services/execution-terminal-persist.ts                              # Expect: 2 (SUCCESS + FAILED core txs)
grep -c "buildTokenUsageColumns" lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/stream/route.ts   # Expect: 0 + 0 (inline spreads are drift returning)
grep -rn "capturedUsage" lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/stream/route.ts           # FAILED-path hoist (adapter-side, feeds the core)
```
What to look for: a NEW terminal-update path that writes status without spreading `buildTokenUsageColumns`
(token columns would go null on that path); a new accumulation site not using `addUsage` (cache under-count).

### 13b. Per-Turn LLM Timing and Dual-Channel Logging (Mar 2026)

```bash
# Per-turn timing is emitted by the SHARED MODULE since 2026-06-10 (via the
# injected logger — the pino `module` binding still reflects each caller's
# child logger, so production greps are unchanged).
echo "=== Per-Turn LLM Timing (shared module — emits for BOTH paths) ==="
grep -n "turn completed\|Initial LLM call completed\|toolDurationMs\|llmDurationMs" \
  /home/steve/copov15/lib/agents/harness/agentic-tool-loop.ts

echo ""
echo "=== Stream GUI timing entries (caller-side, via onTurnComplete observer) ==="
grep -n "Turn.*LLM:\|Initial LLM call:" \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts

# Verify token accumulation consumed from the loop result (both callers)
echo ""
echo "=== totalUsage consumption (callers destructure from AgenticLoopResult) ==="
grep -n "totalUsage" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts | head -8

# Verify GUI-visible timing in logs array
echo ""
echo "=== GUI Log Array Timing Entries ==="
grep -n "logs\.push.*LLM:" \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts

# Production: per-turn timing for a specific execution
echo ""
echo "=== Production Per-Turn Timing ==="
echo "Run: ssh <PROD_USER>@<PROD_HOST> \"grep 'TARGET_ID' /var/log/paichart/web-combined-1.log | grep 'turn completed'\""
```

**What to look for**:
- Both paths emit `Initial LLM call completed` with `llmDurationMs`, `inputTokens`, `outputTokens`, `stopReason`, `turn: 0`
- Both paths emit `Agentic tool loop: turn completed` with `turn`, `toolDurationMs`, `llmDurationMs`, token counts
- Streaming route `logs` array includes human-readable entries: `"Initial LLM call: 3.2s (12,450 tokens)"` and `"Turn N LLM: 140.6s (85,000 tokens)"`
- Streaming route has `totalUsage` accumulation (matches engine pattern)
- Engine completion log: `executionTimeMs`, `tokensUsed`
- Streaming completion log: `executionTimeMs`, `tokensUsed`, `turnCount`, `toolCallCount`

---

### 14. Execution Timeout Audit (Mar 2026)

```bash
# Verify AbortController at all 3 LLM call sites
echo "=== Execution Timeouts ==="
grep -n "AbortController\|AbortSignal\|executionAbort\|streamAbort\|executionTimeout\|streamTimeout" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts

# Verify signal threading through LLM stack
echo ""
echo "=== Signal in LLM Options ==="
grep -n "signal" \
  /home/steve/copov15/lib/services/llm/types.ts \
  /home/steve/copov15/lib/services/llm/anthropic-sdk-provider.ts

# Verify clearTimeout on all exit paths
echo ""
echo "=== clearTimeout Cleanup ==="
grep -n "clearTimeout" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts
```

```bash
# Also check agentic loop timeout scaling
echo ""
echo "=== Agentic Loop Timeout Constants ==="
grep -n "MAX_TOOL_TURNS\|TIMEOUT_BASE_MS\|TIMEOUT_PER_TURN_MS\|executionTimeoutMs" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts

echo ""
echo "=== MCP Poll-and-Return Timeout ==="
grep -n "maxWaitMs\|pollIntervalMs" \
  /home/steve/copov15/lib/mcp/server/tools/advanced/task-action-handler.js
```

**What to look for**:
- 2 AbortController instances: `executionAbort` (engine), `streamAbort` (streaming route)
- Both pass `signal` in LLMRequestOptions
- `clearTimeout` called on success and outer catch paths
- `streamTimeout` hoisted before try block in streaming route (scope visibility for catch)
- `LLMRequestOptions.signal` defined in types.ts
- Anthropic provider passes signal as `client.messages.create(body, { signal })` (second arg, not body)
- Engine timeout scaled: `TIMEOUT_BASE_MS` (180s) + `MAX_TOOL_TURNS` (30, default `|| 30`) * `TIMEOUT_PER_TURN_MS` (30s) = 1080s
- MCP poll timeout: `maxWaitMs` = 1,140,000 (19 min — must outlive the engine's 1080s worst case; raised from 300,000 on 2026-06-10), `pollIntervalMs` = 5,000 (5s)
- Signal passed to ALL `generateText()` calls in the agentic loop (not just the first)

### 15. Hub Service Tools in Embedded Server (Mar 2026)

```bash
# Verify HubToolsHandler import and instantiation
echo "=== Hub Tools in Embedded Server ==="
grep -n "HubToolsHandler\|hubTools\|services\|registry" \
  /home/steve/copov15/lib/mcp/embedded-server.ts

# Count total registered tools (consolidated: allTools object entries, not .set() calls)
echo ""
echo "=== Total Embedded Server Tools ==="
echo "  allTools entries (consolidated):"
grep -A 10 "const allTools" /home/steve/copov15/lib/mcp/embedded-server.ts | grep -c ":"
echo "  Dispatcher actions:"
grep -c "case ['\"]" /home/steve/copov15/lib/mcp/server/tools/dispatchers/*.js

# Verify tool schemas in CONSOLIDATED_SCHEMAS
echo ""
echo "=== Consolidated Tool Schemas ==="
grep -n "^  project:\|^  perform:\|^  analytics:\|^  template:\|^  services:\|^  registry:" \
  /home/steve/copov15/lib/mcp/server/config/tool-schemas.js

# Check hub-tools-handler validation import path (was buggy, fixed Mar 2026)
echo ""
echo "=== Hub Validation Import Path ==="
grep -n "mcp-hub-validation" \
  /home/steve/copov15/lib/mcp/server/tools/hub-tools-handler.js
```

**What to look for**:
- `HubToolsHandler` imported and instantiated with `prisma` in `registerToolImplementations()`
- **6 consolidated tools** registered via `allTools` object: `project`, `perform`, `analytics`, `template`, `services`, `registry`
- Each tool uses a dispatcher that routes by `action` parameter to underlying operations
- Total underlying operations: ~21 (4 project + 13 perform + 2 analytics + 2 template + 7 services + 5 registry) — but the LLM sees only 6 tool names
- All 6 tool schemas in `CONSOLIDATED_SCHEMAS` (tool-schemas.js)
- Validation import path: `../../../validation/mcp-hub-validation` (extensionless — resolves to `.ts` via ts-node since Phase 2 proper Apr 8 2026; was `.js` until Bug Class 73 eradication). Still NOT `../../` — path-depth fix from Mar 2026 is preserved.

### 16. Agentic Tool Loop Audit (Mar 2026)

```bash
# Verify agentic loop implementation
echo "=== Agentic Loop Structure ==="
grep -n "while.*stopReason\|MAX_TOOL_TURNS\|turnCount\|functionCalls" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts

# Check tool_use_id preservation
echo ""
echo "=== tool_use_id Preservation ==="
grep -n "tool_use_id\|\.id" \
  /home/steve/copov15/lib/services/llm/anthropic-sdk-provider.ts | head -15

# Check content block handling in provider
echo ""
echo "=== Content Block Array Handling ==="
grep -n "Array.isArray.*content\|rawContentBlocks\|stopReason\|functionCalls" \
  /home/steve/copov15/lib/services/llm/anthropic-sdk-provider.ts

# Verify tool result truncation (Tier 1 — IN THE SHARED MODULE since 2026-06-10)
echo ""
echo "=== Tool Result Truncation (module) ==="
grep -n "MAX_TOOL_RESULT_LENGTH\|truncat" \
  /home/steve/copov15/lib/agents/harness/agentic-tool-loop.ts

# Check progress events (caller-side: engine wires loopProgress via onTurnStart observer)
echo ""
echo "=== Loop Progress Events (engine caller) ==="
grep -n "loopProgress\|executing_tools\|LOOP_START\|LOOP_END" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts
```

**What to look for**:
- `while` loop with `stopReason === 'tool_use'` and `turnCount < MAX_TOOL_TURNS`
- `functionCalls[]` iterated (all tool_use blocks per turn, not just first)
- `tool_use_id` preserved in provider's `functionCalls[].id` (required) and `functionCall.id` (optional for Gemini compat)
- `rawContentBlocks` passed through from provider response for message history construction
- Tool result truncation at 8K chars via `truncateForLlm()` (`:307`, C1 2026-07-08): the marker is an ENRICHED fact-forward directive (counts + recovery options: re-read-narrower / **`read_more(ref, offset)` page the tail** when no narrower form exists (2026-07-10 `3264e28f`, memory-backed loop pager) / flag-the-gap), NOT the old bare `\n... [truncated]`; the record gains emit-only `resultTruncatedForLlm` + `resultChars` (C2), set by mutating the already-pushed record AFTER the observer ran (the SSE card never sees them — deliberate)
- `is_error: true` on failed tool_result blocks
- `loopProgress(turn, phase)` events in 75-90% band
- `totalUsage` accumulation across all turns
- `toolLoop` summary in result artifact: `{ totalTurns, hitMaxTurns, totalToolExecutions }`

### 17. Execution Setup Layer (agentTaskService.ts) — Mar 2026

The execution setup layer is where execution config is assembled, model parameters resolved, and the CAS guard prevents duplicate execution. This file bridges the API/MCP layer and the execution engine.

```bash
# Model parameter resolution chain (priority order)
echo "=== Model Parameter Resolution Chain ==="
grep -n "overrideConfig\|taskMetadata\|agentTemplate\|modelParameters" \
  /home/steve/copov15/lib/services/agentTaskService.ts

# Verify default model matches current registry (should be claude-haiku-4-5)
echo ""
echo "=== Default Model in Template Fallback ==="
grep -A5 "Build model parameters from agent template" \
  /home/steve/copov15/lib/services/agentTaskService.ts

# CAS guard — atomic claim via updateMany with WHERE condition
echo ""
echo "=== CAS Guard (Duplicate Execution Prevention) ==="
grep -B2 -A15 "claimed\|updateMany" \
  /home/steve/copov15/lib/services/agentTaskService.ts

# Execution config assembly — what goes into the execution record
echo ""
echo "=== Execution Config Assembly ==="
grep -B2 -A25 "executionConfig =" \
  /home/steve/copov15/lib/services/agentTaskService.ts

# Preliminary guard (non-atomic, before CAS)
echo ""
echo "=== Preliminary Status Guard ==="
grep -n "already executing\|RUNNING\|PENDING" \
  /home/steve/copov15/lib/services/agentTaskService.ts

# Template metadata modelParameters spread
echo ""
echo "=== Template Metadata ModelParameters ==="
grep -n "agentTemplate.metadata.*modelParameters" \
  /home/steve/copov15/lib/services/agentTaskService.ts

# RESOLVED 2026-07-25 (completion-path unification 5.1): AgentTaskService.updateExecution was
# DELETED — zero repo callers, zero prod-log traces in 30 days; the SUCCESS→'COMPLETED'-as-any
# ExecutionStatus enum bug went with it. This grep now guards against REINTRODUCTION:

echo "=== updateExecution must stay deleted (zero matches expected) ==="
grep -c "async updateExecution(" \
  /home/steve/copov15/lib/services/agentTaskService.ts   # EXPECT 0 — deleted 63e24f19; reappearance = re-add-the-dead-thing drift
```

**Analysis Points:**
- ~~`updateExecution()` non-atomic execution/task update~~ RESOLVED-BY-DELETION 2026-07-25 (see grep above)
- `executionConfig` spreads `modelParameters` at top level (flat, not nested) — model and provider become top-level config keys

---

## Special Attention Areas

1. **Transaction Atomicity**: Every success and error path MUST use `$transaction` wrapping execution + task + artifacts
2. **updateExecutionStatus Constraint**: Cannot accept `tx` parameter; must inline `tx.agentExecution.update()` inside transactions
3. **SSE-After-Commit**: Events must be emitted AFTER transaction commits, not inside
4. **Non-Streaming Route REMOVED**: GUI now uses streaming-only (Mar 2026). Only MCP engine uses fire-and-forget.
5. **Safety-Net Catch**: `processPendingExecutions` outer catch prevents queue stalls
6. **Log Optimization**: Streaming route accumulates logs in memory, persists at checkpoints
7. **Streaming uses generateText**: Not streamText. `generateText` returns `stopReason`, `functionCalls`, `rawContentBlocks` needed for tool loop.
8. **Task-Execution Sync**: `executionStatus` on task MUST match execution `status` at all times
9. **Rate Limiting**: `agentExecutionLimiter` applied to streaming execution endpoint
10. **Prompt Injection**: `AgentExecuteSchema` includes `detectPromptInjection` validation
11. **MCP HTTP Timeout**: MCP server has 30s HTTP timeout. Agent execution handler MUST be fire-and-forget (no await on executeById)
12. **Zod Schema Stripping**: `mcp-action-validation.ts` strips fields not in the schema. Every handler field must be in the Zod schema
13. **ResourceManager Guards**: `registerResource` and `updateResource` methods don't exist on the TS singleton (`MCPResourceManager`). Must guard with `typeof` checks. Note: JS `SimpleResourceManager` DOES have these. Both implement `IResourceManager` interface (Feb 2026) but have different method sets.
14. **Context Enricher**: Tool calls from embedded server need context passed or ContextEnricher crashes on `baseContext` destructuring
15. **Artifact Cleanup**: resourceManager keeps last 4 SUCCESS + 4 FAILED per task, status-aware (daily @ midnight UTC) + removes >90 days (daily)
16. **Shared Resource Infrastructure (Feb 2026)**: Both resource managers share `resource-manager-shared.js` (key prefixes, helpers, `generateDownloadUrl`). `embedded-server.ts` imports from shared module, not from `simple-resource-manager.js`. Types in `resource-manager-types.ts`.
17. **Execution Timeout (Mar 2026; constants refreshed 2026-06-10)**: AbortController at 2 LLM call sites (engine + streaming route). Engine uses **1080s scaled timeout** (`TIMEOUT_BASE_MS` 180s + `MAX_TOOL_TURNS` 30 * `TIMEOUT_PER_TURN_MS` 30s) for multi-turn. Both `MAX_TOOL_TURNS` and per-turn timeout are read from `template.metadata.modelParameters.maxToolTurns` (default 30), clamped to `RUNTIME_LIMITS.MAX_TOOL_TURNS` (200) at the read site (R-1). **D-1 (2026-06-18): `maxToolTurns` is template-locked — it is read from the template ROW only; task/execution-path writes are REJECTED (`rejectTemplateControlledKeys`, clean 400), not silently ignored.** Streaming route also has agentic loop with matching timeout constants. Signal threads through `LLMRequestOptions.signal` → Anthropic SDK `{ signal }`. Signal passed to ALL `generateText()` calls in the agentic loop. `clearTimeout` must be called on ALL exit paths (success, outer catch). Streaming route hoists `streamTimeout` before `try` for catch-block visibility.
18. **Hub Tools in Embedded Server (Mar 2026)**: 2 consolidated hub tools (`services`, `registry`) registered via dispatchers and `HubToolsHandler(prisma)`. Auth enforced inside handlers, not transport. `hub-tools-handler.js` validation import path was fixed from `../../` to `../../../` (webpack surfaced the pre-existing bug).
19. **~~convertZodToJsonSchema Stub~~** (COMPLETED Mar 2026): Replaced with real `zod-to-json-schema` (`jsonSchema7` target) in `embedded-server.ts`. LLM tools now get proper JSON Schema definitions.
20. **Agentic Tool Loop (Mar 2026; cap raised to 30 Apr 2026)**: Up to 30 tool turns per execution (`MAX_TOOL_TURNS`, default `|| 30`). While-loop checks `stopReason === 'tool_use'`. All tool_use blocks executed per turn. Tool errors returned as is_error tool_result. Tool results truncated at 8K chars via `truncateForLlm()` with an auto-nudge directive (narrower re-read / `read_more` page / flag-gap; the `read_more` memory-backed pager added 2026-07-10 `3264e28f` — `READ_MORE_FUNCTION_DEF` injected into `mcpFunctions`, loop-intercepted, NOT a registered tool) + emit-only `resultTruncatedForLlm`/`resultChars` record fields (C1+C2 2026-07-08 `ed702abb`). Message history uses rawContentBlocks + tool_result arrays. Signal passed to ALL generateText calls.
21. **tool_use_id Preservation (Mar 2026)**: Provider now preserves id on all tool_use blocks. functionCalls[] has required id. functionCall (singular) has optional id (Gemini compat). Streaming path also preserves id.
22. **JSON Schema Generation (Mar 2026)**: Stub replaced with real zod-to-json-schema (jsonSchema7 target) in embedded-server.ts. LLM tools now get proper JSON Schema definitions.
23. **Execution Setup Layer (`agentTaskService.ts`)**: Controls model parameter resolution chain, execution config assembly, and CAS guard — for the **explicit** `agent.execute` path only (NOT the universal gateway; reactor cascade / retrigger / REST / SSE bypass it). Model defaults in template fallback MUST match current registry (`claude-haiku-4-5` / `anthropic_sdk`). Template metadata `modelParameters` are spread at top level. `updateExecution()` has a known non-atomic task update (uses separate `prisma.task.update`, not `$transaction`) — acceptable for intermediate status only. **Dependency context chaining is NO LONGER here (removed 2026-06-07, commit 6c640337) — it moved to the `createAgentExecution()` chokepoint (`lib/services/agent-execution-create.ts` → `lib/agents/harness/prepare-task-for-execution.ts`) so all paths chain.**

## Risk Assessment Matrix

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Partial state update (execution but not task) | Critical | Low (if transactions maintained) | $transaction wrapping |
| SSE events before DB commit | High | Medium | SSE-after-commit pattern |
| updateExecutionStatus inside transaction | High | Medium | Inline tx. pattern |
| Engine setTimeout not durable (MCP path) | Medium | Low (only MCP path, not GUI) | BullMQ migration (deferred) |
| Safety-net catch failure | Critical | Very Low | Outer try/catch in processPendingExecutions |
| Missing error artifact | Medium | Low | Error artifact inside same transaction |
| Tool loop infinite cycle | Medium | Very Low | MAX_TOOL_TURNS = 30 + stopReason check |
| Queue stall (stuck RUNNING) | High | Low | Safety-net catch, status guard, 1080s/1140s timeout |
| Rate limit bypass | Medium | Low | agentExecutionLimiter on both endpoints |
| LLM call hangs indefinitely | High | Low | 1080s (engine + routes) AbortController timeout, 1140s MCP poll timeout |
| Hub tool abuse by agent | Medium | Low | Per-service rate limits + access control inside ServiceCallHandler |
| ~~JSON Schema stub~~ | ~~Low~~ | ~~Medium~~ | **RESOLVED** (Mar 2026): zod-to-json-schema with jsonSchema7 target |

## Success Criteria

- All transaction blocks verified to update BOTH execution AND task atomically
- All 11 SSE event types documented with line numbers (incl. `execution_started`; exclude content-block false positives like `type: 'tool_result'`)
- All 2 error paths verified (streaming outer catch, engine safety-net)
- SSE-after-commit ordering confirmed for all event emissions
- updateExecutionStatus NOT called inside any $transaction
- Rate limiting confirmed on streaming execution endpoint
- Task executionStatus synchronized at every state transition
- Execution timeout verified at all 2 LLM call sites (1080s engine + streaming route) with clearTimeout on all exit paths
- Embedded server tools verified: 6 consolidated tools (~33 actions) registered via `allTools` object with `for...of` loop
- AbortController signal threading verified: LLMRequestOptions → Anthropic SDK RequestOptions
- Agentic loop: MAX_TOOL_TURNS enforced, stopReason checked, tool_use_id preserved
- Tool result truncation at 8K chars verified (post-2026-07-08: expect `truncateForLlm` + the enriched directive + C2 record fields, and test-agentic-tool-loop tests 5/5b/5c/6)
- Token accumulation across all turns verified
- Scaled timeout (1080s for engine, 1140s MCP poll — poll must outlive engine) verified
