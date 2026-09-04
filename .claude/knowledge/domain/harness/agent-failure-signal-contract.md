# Agent failure-signal contract — what a failure tells the caller, per code

> **What this answers**: an agent execution failed. What does the caller *see*, on which surface, and can
> it branch on it? Written 2026-07-26 after the async error-surface work (`96f6acf5`…`669d5a20`), with the
> reachability column grounded in **observed live runs**, not grep.
>
> **Owner**: `agent-execution-specialist` (write path) with `boundary-contract-specialist` (read surfaces).
> Not auto-loaded — greppable on demand, per Protocol 12.

---

## 1. The three carriers (a code reaches a caller by exactly one of these)

| Carrier | Surface | When | Notes |
|---|---|---|---|
| `AppError.code` | the throw itself, preserved across both MCP boundaries | **synchronous** — the failure happens inside the `perform()` call | Pinned by `scripts/test-mcp-boundary-error-codes.ts` (2026-04-25 ITEM 3g.1) |
| `agent_executions."errorCode"` | `agent.status` → `errorCode` | **asynchronous** — dispatch returned success, the run failed later | Added 2026-07-25. Forward-only: rows that failed before that date are `null` |
| `error.json` → `errorCategory` | `agent.results` → `errorCategory` | asynchronous | Written in the **same transaction, from the same value** as the column, so the two cannot drift. Covers historical rows the column does not |

**`null` means "no code recorded"** — either the execution did not fail, or it failed without a typed error.
It is **never** a placeholder. Synthesizing `'UNKNOWN'` would be a verdict an agent branches on wrongly
(Protocol 10), and the shape test pins the literal `null`.

## 2. The codes, by reachability

`lib/errors.ts` defines **28** codes; most are transport/validation and never reach an agent-execution
surface. These are the ones that do:

| Code | Sync / async | Agent-actionable? | Where documented |
|---|---|---|---|
| `CAN_NEVER_RUN` | **sync** — thrown before any execution row exists | **Yes, but do NOT retry as-is** — it refuses identically every time. Fix the cause (usually a program child missing `inputContext.interfaceContract`), then execute | harness troubleshooting table |
| `NO_TEMPLATE_ASSIGNED` | **async** — engine-side, after dispatch returned success | **Yes** — assign a template and re-run; the active-execution CAS explicitly permits FAILED→retry | harness troubleshooting table |
| `COMPLETION_CONFLICT` | sync | Yes — re-read; if already COMPLETED someone else finished it, do not retry blindly | harness troubleshooting table |
| `INVALID_TRANSITION` | sync | Yes — COMPLETED is terminal; create a fresh task | harness troubleshooting table |
| `PIPELINE_INVARIANT` / `PIPELINE_STAGE_MISMATCH` | sync | Yes — anti-fabrication gate; inspect stage pointer + children | harness troubleshooting table |
| `DUPLICATE_ACTIVE_EXECUTION` → surfaced as `DUPLICATE_RECORD` | sync | Yes — wait or cancel the in-flight execution | tool errors |
| `EXECUTION_NOT_CLAIMABLE` | async, **internal** | **No — deliberately not surfaced.** It is not a failure: the poller won the create→dispatch race and owns a genuinely-RUNNING row. Surfacing it would invite a retry the partial-unique index rejects | *(intentionally undocumented to agents)* |
| `TASK_CAN_NEVER_RUN` | async, **task-level** | Informational — stamped by cone marking when an upstream leg cannot produce what a downstream leg must consume. No execution failed, so it appears in logs + task state, **not** on `errorCode` | forward-cone / F16 |
| `PRE_FLIGHT_BAIL_TERMINALIZED` | async, **non-terminal family** | Informational — the pipeline bailed in pre-flight (cannotRun/escalated stamped, no child stage). The *task's* `executionStatus` goes FAILED so the program can escalate; the execution row stays `SUCCESS` | non-terminal family |

### The guard asymmetry that makes `NO_TEMPLATE_ASSIGNED` reachable

Worth knowing, because it looks unreachable at first glance: the **MCP pre-flight** (`agent-execute-handler`)
accepts `agentRole` + `prompt` as valid configuration, while the **engine** requires a resolved template FK
and throws otherwise. That divergence is deliberate and documented at the throw site — the engine is the
reactor/queue path with no user present; the stream route is interactive. So a task configured via
`agent.configure` with a custom role and prompt but **no template** passes the handler and fails at the
engine, asynchronously. Verified live twice on 2026-07-26.

## 3. Which surface to read, and when

- **`agent.status`** — the hot polling surface (its own `nextSteps` tells agents to call it every 10-30s).
  Returns `errorCode` only. It deliberately does **not** join artifact content: a `content` join on the poll
  path is the worst possible place for it. It also returns **no logs**, so never instruct an agent to
  "review the logs" here.
- **`agent.results`** — already loads artifacts with content, so `errorCategory` is hoisted at zero extra
  query cost, alongside the full `error.json` payload for forensics.

## 4. Things that are NOT signals (removed 2026-07-25)

`progress`, `error`, `output`, `metrics` were all read from **columns that have never existed** on
`agent_executions` — see Bug Class 80 in `.claude/knowledge/domain/mcp/bug-class-registry.md`. `progress`
in particular reported `0` for every execution including completed ones, which an agent could read as
"no work done" and retry a run that already burned a full LLM call. If you are looking for a field that
"used to be there", check that registry entry before re-adding it.

## 5. Provenance

Every reachability claim above was observed, not inferred:

- `NO_TEMPLATE_ASSIGNED` — forced twice (scratch task; guard-probe child), `errorCode` confirmed **in the
  column** by direct DB read, `error.json` present, token columns `NULL` (failure preceded any LLM call)
- `EXECUTION_NOT_CLAIMABLE` — observed in a real create→dispatch race (two `Executing agent` 4 ms apart →
  `already claimed by another path — skipping`), still one clean persist
- `TASK_CAN_NEVER_RUN` + `PRE_FLIGHT_BAIL_TERMINALIZED` — observed on a program whose cloud leg refused to
  invent an aggregate its upstream never published
- `fireReactors: false` — verified by retrigger count on a deliberately-failed MCP-dispatched **pipeline
  child**: exactly **1** retrigger (the engine adapter's). `true` would have produced 2, because
  `persistTerminalFailure` fires reactors *even on a CAS miss*

## 6. See also

- `cline_docs/reviews/agent-error-code-surface-2026-07-25/` — panel ruling, plan, and run-12 forensics
- `.claude/knowledge/domain/mcp/bug-class-registry.md` — Bug Class 80 (phantom column reads)
- `lib/services/execution-terminal-persist.ts` — the ONE terminal failure transaction (column + artifact)
- `scripts/test-mcp-boundary-error-codes.ts` — sync contract + the async read surfaces
- `.claude/knowledge/protocols/signal-design-protocol.md` — Protocol 10 (fact vs verdict)
