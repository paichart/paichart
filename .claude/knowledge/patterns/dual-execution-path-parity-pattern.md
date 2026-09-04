# Pattern: Dual Execution Path Parity — ✅ RETIRED 2026-07-06 (convergence complete)

**Status**: **RETIRED to adapter-render guidance.** The engine (`agentExecutionEngine.ts`) and the
stream route (`app/api/pov/agent/execute/stream/route.ts`) are now **one shared execution core
(`lib/services/execution-core.ts` `runExecutionCore`) + two thin presentation adapters**. The bug class
this pattern guarded — silent cross-path output drift — is now **structurally impossible**: `result.json`,
`report.md`, terminal persist, task status, auto-comment, quality cascade, confidence parse/cap, #90
diagnostic retry, and content-validation all run ONCE in the core. Both adapters call it; they differ only
in presentation + a few documented per-adapter facts.

**What replaced this pattern — the ADAPTER-RENDER discipline** (the only thing left to keep straight):
- The shared **core** owns every execution OUTCOME. Change an outcome once, in `execution-core.ts` (or the
  modules it calls: `execution-artifacts.ts`, `execution-terminal-persist.ts`, `execution-quality.ts`,
  `diagnostic-retry.ts`, `parse-confidence.ts`, `agentic-tool-loop.ts`, `execution-selection.ts`).
- Each **adapter** owns only PRESENTATION + prep: the engine's EventEmitter progress; the stream's ~30 SSE
  emissions (pinned in source order by `test:sse-event-sequence`). These legitimately differ — do NOT sync them.
- **Permanent per-adapter forks (NOT drift)**: the stream's `tool_result_card`/`function_call`/web-search SSE
  + `result.json.extensions` (N-6, stream-only — the engine yields `undefined`); the prompt HEADS (six axes,
  per-adapter policy — prompt-construction signoff §2a; head convergence is separate post-6b work).
- **`fireReactors` CONVERGED (Flip 1, 2026-07-06)**: both adapters `true` — GUI-triggered runs now fire the
  post-commit reactors like the engine (cascade pipeline children + queue ready dependents). `prune` is the ONE
  remaining transitional core param — engine `true`, stream `false` (Flip 2, still Steve-gated). Both pinned by
  `test:execution-core-boundary` (the stream assert is split: `fireReactors:true` / `prune:false`).

**Shipped timeline**: Phase 0.5 (`e5086b92`…`00d2e5da`, 6 live-drift hotfixes) → Phases 1–5 (analyzers;
**last-turn deliverable text — NOT accumulate-prose**; #90 retry; terminal persist; system-prompt/hydration)
→ **Phase 6 core extraction: engine adapter `ef768e7a`, stream adapter `200dd0e7`** (both UAT-banked). The
**arg-level divergence manifest** (`cline_docs/reviews/execution-path-convergence-2026-07-04/divergence-manifest.md`)
is the authoritative record of every remaining per-adapter fact + disposition. Drift-locking gates:
`test:execution-core-boundary`, `test:sse-event-sequence`, `test:terminal-persist-ponr`, plus the parity pins
retargeted to the single core.

> ⚠ **Everything below is the HISTORICAL journey record** (Apr–Jul 2026), kept for provenance. The
> "Rule" / "What Must Stay In Sync" table and its `file:line` refs describe the pre-convergence **two-file
> world and are no longer current** — do NOT use them to locate code or as a sync checklist.

## Update 2026-07-04: CONVERGENCE REVIEWED + Phase 0.5 parity hotfixes SHIPPED

**This pattern's END was designed** (now DONE — see the RETIRED banner above): a 6-specialist Protocol-2
review approved (93% post-edit) collapsing both paths into ONE execution core + TWO presentation adapters.
Phase 0.5 hotfixes shipped 2026-07-04 (`e5086b92`…`00d2e5da`), fixing 6 live drifts/bugs the review found:
stream post-commit SUCCESS→FAILED flip (safeWrite, `test:terminal-persist-ponr`), engine tokensUsed
pre-retry-fold snapshot + zero-drop, stream validator missing `taskContext`, engine report.md UNSANITIZED
(now shared `sanitizeLLMForMarkdown`), stream keyless proceed-on-default (now typed `USER_CONFIG_REQUIRED`
fail-fast, `test:byok-fail-fast-parity`), engine P7 find-on-full-text drift.

## Update 2026-06-10: THE TOOL LOOP IS EXTRACTED

The largest remaining duplicate — the agentic tool loop itself (initial LLM call,
P2 provider-error check, option assembly, tool-turn body, message threading,
token accumulation, #89 correction turn) — now has **exactly one implementation**:
`lib/agents/harness/agentic-tool-loop.ts` (`normalizeModelConfig`,
`buildLlmCallOptions`, `executeToolTurn`, `runAgenticToolLoop`). Both paths are
wiring blocks passing observers (engine: 2 EventEmitter-progress observers;
stream: 7 SSE/logs observers). Phases 0-3 shipped 2026-06-10 across 12 commits
(Phase 0 convergence `349c8f84..64b7c864`; Phase 1 `00325b21..dad7cd98`; Phase 2
`584ff06a..0af88cf5`; Phase 3 `099d1361..ebc20d27`). Seven drift instances
(D-A..D-G) found and eradicated en route. Gates: `test:llm-call-options` (35) +
`test:agentic-tool-loop` (61) in test:all-validation; inline-loop tripwire greps
in agent-execution-discovery §6.4. Review: 4-specialist battery @ 91.5%
(`cline_docs/reviews/tool-loop-extraction-2026-06-10/`).

**Still inline in both paths** (the pattern below remains live for these):
stop-reason handling, #90 diagnostic retry, detection cascade wiring, content
validation, report.md content, task status sync, auto-comment, artifact
truncation, execution pruning.

**Intentional stream-only divergence (NOT drift)**: the `tool_result_card` SSE
event (2026-06-10, Monitoring activity feed) is emitted only by the stream
route's `onToolResult` observer — SSE is presentation-layer; the engine path
has no SSE surface. Do not "mirror" it.

## Update 2026-05-14: "Future Fix" SHIPPED

The "Future Fix" section below (extract shared logic into common module) **has now been done** in commit `e480a5c0`. `result.json` artifact construction lives in `lib/services/execution-artifacts.ts:buildExecutionResultJson`. Both paths import + call. Parity test at `scripts/test-execution-artifacts-parity.ts` (26 tests).

**5 drift sites discovered + eradicated by the extraction**:
- `hitMaxTurns` hardcoded `30` in stream vs `MAX_TOOL_TURNS` in engine
- `tokensUsed: 0` hardcoded in stream vs real value in engine
- `agentRole`: stream raw `body.agentConfig.role` vs engine `resolvedRole`
- `executionTime`: pre-calculated in engine, inlined in stream (numerically equivalent today)
- `diagnosticRetryUsed`: engine emitted, stream missing

The parity concern below is now **structurally impossible** for `result.json` fields. The pattern remains relevant for **non-artifact concerns** (task status sync, auto-comment, artifact size truncation, execution pruning) — those still live in both files inline.

---

## Rule

Any change to agent execution outcomes (artifacts, status updates, comments, metrics) must be applied to BOTH execution paths or one path silently produces different results.

| Path | File | When Used |
|------|------|-----------|
| **Engine path** | `lib/services/agentExecutionEngine.ts` | MCP `agent.execute`, API trigger, polling-based execution |
| **Streaming path** | `app/api/pov/agent/execute/stream/route.ts` | GUI-triggered execution with SSE streaming |

Both paths create `result.json` + `report.md`, update `task.executionStatus`, write `task.outputArtifacts`, and create `AgentExecution` records. They MUST produce identical artifact formats and side effects.

## What Must Stay In Sync

| Concern | Engine Location | Stream Location | Status |
|---------|----------------|-----------------|--------|
| **Agent user prompt (§1-§8 + Output Requirements)** | `agentExecutionEngine.ts` `buildAgentPrompt` (delegates) | `stream/route.ts:~525` (calls builder) | ✅ Via shared `buildAgentPromptBody` (B1, 2026-06-09); §6 via `renderPipelineContextSection` (D4). Engine-vs-shared byte-`===` gate `test-build-agent-prompt-parity.ts` (33 fixtures) + content lock `test-build-agent-prompt-body.ts` |
| **result.json structure** | `runExecutionCore` (`agentExecutionEngine.ts:878`) | `runExecutionCore` (`stream/route.ts:682`) | ✅ ONE build site: `execution-core.ts:288` via `buildExecutionResultJson` (Phase 6b, 2026-07; refs corrected 2026-08-21) |
| report.md content | engine success-tx region (after `:1317`) | stream success-tx region (after `:1218`) | ⚠ Still inline in both |
| Confidence parsing | `agentExecutionEngine.ts` (calls shared) | `stream/route.ts` (calls shared) | ✅ Via shared `parseConfidenceScore` (`lib/agents/harness/parse-confidence.ts`, A 2026-06-09). Both initial + retry re-parse call it (retry corrected to last-match-wins). Dual-layer parity test `scripts/test-confidence-parse-parity.ts` (structural drift-lock + golden). |
| Task status sync | shared terminal persist | shared terminal persist | ✅ Converged (Phase 6b): `execution-terminal-persist.ts` success-tx owns it for both paths *(was "⚠ still inline in both" — corrected 2026-08-21)* |
| Auto-comment | shared terminal persist | shared terminal persist | ✅ Converged: `execution-terminal-persist.ts:791` (`tx.comment.create`), one site *(corrected 2026-08-21)* |
| Artifact size truncation (5MB) | shared constant | shared constant | ✅ Converged: `MAX_ARTIFACT_SIZE` exported once from `execution-terminal-persist.ts:67` *(was "⚠ duplicated in both" — corrected 2026-08-21)* |
| Execution pruning | shared `execution-retention.ts` `selectExecutionsToDelete` @ 10/10 (in-tx) | SAME shared selector — GUI prunes-on-complete too | ✅ CONVERGED (Flip 2, 2026-07-06; was engine-only) |
| **Post-completion reactors** | fired via the shared core tail (`persistTerminalSuccess`/`persistTerminalFailure`, `fireReactors:true`) | SAME shared core tail (`fireReactors:true`) | ✅ **CONVERGED (Flip 1, 2026-07-06)** — the stream now fires both reactors post-commit + fire-and-forget via the shared core, exactly the fix the historical note below prescribed. HISTORICAL (pre-Flip-1): NOT a blanket "GUI pipelines stall": the reactors ALSO fire from `task-complete-handler.ts:349-350`, so a GUI pipeline child whose agent calls `perform(task.complete)` DOES cascade. The gap is the engine's INLINE safety-net the stream lacks: (a) a GUI pipeline child whose agent FAILS to call task.complete → engine's inline fire would still re-trigger the harness, stream wouldn't → stall; (b) a GUI-executed NON-pipeline task with DEPENDENTS sets `status:COMPLETED` directly (no task.complete) → engine queues dependents inline (`:1640`), stream doesn't → dependents never queue. Uncertain GUI value (pipeline children usually run via engine/poller) + real-pipeline-touch risk → not fixed. Found in the 2026-06-09 parity sweep. Fix: mirror the engine's fire-and-forget reactor calls in the stream success path (after the tx commits), `.catch(()=>{})`, idempotent. Pipeline-harness review required. **2026-07-24 UPDATE (completion-path unification, Flips A+B): sub-case (b) is CLOSED — every human completion surface (web PATCH/PUT, kanban move, MCP task.update, bulk) now routes through `complete-task-terminally.ts` and fires the reactors post-commit; only the direct-status residual (a) framing remains historical.** |
| **Confidence cap** | `agentExecutionEngine.ts` (calls shared) | `stream/route.ts` (calls shared) | ✅ Via shared `applyConfidenceCap` (`lib/agents/harness/parse-confidence.ts`, A 2026-06-09 — pure: counts in → `{score,capped,original}`, caller logs). Closes BC75 #5 (the cap was the part that drifted — stream had skipped it). Earlier the doc claimed "via shared helper" but it was INLINE-MIRRORED until A landed. |
| Diagnostic-retry control-flow | `agentExecutionEngine.ts:~981+` | `stream/route.ts:~896+` | ⚠ Inline-mirrored in both (impure — LLM call + SSE + state). Its confidence RE-PARSE now routes through the shared `parseConfidenceScore` (A 2026-06-09); the band/guard control-flow stays inline. |

## Checklist (copy-paste for PRs)

When modifying agent execution outcomes:
- [ ] Changed in `agentExecutionEngine.ts`
- [ ] Changed in `stream/route.ts` (same logic, adapted for streaming context)
- [ ] Artifact format identical in both paths
- [ ] Side effects (comments, status updates) present in both paths

## Discovery

Apr 2026 — During artifact restructure, auto-comment addition, confidence parsing, and status sync, each change had to be applied to both files. Forgetting the streaming path would have created silent inconsistency where GUI-triggered executions produce different artifacts than MCP-triggered ones.

## Future Fix

Extract shared logic into a common module (e.g., `lib/services/execution-artifacts.ts`) that both paths import. This eliminates the parity concern entirely. Until then, this pattern serves as the manual guard.
