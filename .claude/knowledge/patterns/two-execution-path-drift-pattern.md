# Two-Execution-Path Drift Pattern

**Type**: Structural Risk Pattern — Detection + Remediation
**Status**: **CONFIRMED** — two observed instances (2026-04-14 agent execution tool loops; 2026-05-02 POV select phantom canonical) + several latent risk sites
**Confidence**: 75% — two distinct instances confirm the pattern, and the second surfaced a new failure mode (phantom canonical) worth its own remediation steps
**Related**: `.claude/knowledge/domain/harness/automation-loop-closure-architecture.md` §Hindsight Lessons, `.claude/knowledge/patterns/orchestration-reactor-pattern.md` §Common Pitfalls, `.claude/knowledge/patterns/field-leakage-prevention-pattern.md`

---

## Pattern Overview

**Problem**: The same domain concern (tool loop, task-completion handling, dedup check, validation rule) is implemented in two or more independent code paths. Over time the paths silently drift apart — one gets fixed, the other doesn't; one accepts new config fields, the other hardcodes; one handles an edge case, the other doesn't. Bugs lurk in the path that doesn't get exercised in the dev loop, surfacing only in production or under specific triggers.

**Detection**: Grep a concern-indicative constant/field name across the repo. If it appears in two files that both claim to handle "the same thing," they've either drifted already or will.

**Remediation**: Extract a shared function both paths call. Short-term mitigation: mirror the change in both paths and add a comment in each pointing at the other.

---

## The Observed Instance (Canonical Example)

**Setting**: Agent execution in pAIchart.

**Two paths**:
- `lib/services/agentExecutionEngine.ts` — executes queued `agent_executions` rows (status=PENDING). Engine path, polled every 10s.
- `app/api/pov/agent/execute/stream/route.ts` — streams execution responses for GUI-initiated executions. Stream path, one request per click.

**Both paths implement**: an agentic tool loop. LLM generates function calls → engine executes → feeds results back → LLM responds → repeat until stopReason !== 'tool_use' or a turn cap trips.

**How they drifted**:

| Concern | Engine path | Stream path (pre-fix) | Impact |
|---|---|---|---|
| `MAX_TOOL_TURNS` | Read from template metadata (up to 100) | Hardcoded `10` | 95% of harness runs silently starved at 10 turns while template specified 100 |
| PIPELINE auto-complete skip | Applied (no status=COMPLETED for PIPELINE type) | Missing initially | Harness tasks marked COMPLETED prematurely by stream route, defeating retrigger reactor |
| Reactor hooks on completion | Wired | Wired (after the gap was caught) | Reactors didn't fire on stream-path completions until noticed |

**Time spent diagnosing**: ~8 iteration cycles attributing "agent hit max turns" to protocol/agent-behavior issues before grepping for `MAX_TOOL_TURNS` and finding the second definition.

**Fix applied**: Mirror the stream route's `MAX_TOOL_TURNS` read from template metadata (commit `e008aba2`). A shared extraction is a future-target, not today's work — the mirror keeps both paths correct until then.

---

## Second Instance (2026-05-02): POV Select Phantom Canonical

**Setting**: POV editor data-fetch path. UI bug — task dependencies didn't render even after client-side fixes shipped.

**Two paths**:
- `lib/pov/prisma/select.ts:fullPOV` — exported, named "full", uses `taskFullSelect` which includes `dependencies` and `dependents`. Looks canonical.
- `lib/pov/services/pov.ts:23 PoVService.get()` — runtime production path. Was rewritten as an N+1 optimization (1000ms → 200ms per its own comment). Replaced `include: fullPOV.include` with a hand-rolled `select` that omits dependency/dependent edges entirely.

**The new failure mode**: *one path masquerades as the source of truth while the production path is elsewhere*. This is structurally distinct from the agent-execution case because both paths there were real. Here, `fullPOV` is **phantom canonical** — exported, imported into the service file (line 7), and accurate-looking, but its `.include` is never actually invoked at runtime in `.get()`.

**How six specialists missed it**:

| Specialist | What they audited | What they concluded | Why they missed it |
|---|---|---|---|
| task-dependency | `taskFullSelect`, normalizer | "Wire carries deps" | Looked at schema files, not service queries |
| phase-stage | `lib/pov/prisma/select.ts:111,124,199,217` | "Both modes share `/api/pov/${povId}` data path" | Verified the shared path but not whether the path uses `fullPOV.include` |
| pipeline-harness | Raw SQL in reactor | "Harness reads DB directly, not client state" | Correct for harness; but didn't audit the editor's wire |
| mcp-tool-architecture | MCP tool handlers | "Zero `components/` imports in MCP" | Right answer for MCP layer; out of scope for this bug |
| types-system | `EntityTypes.ts`, `taskFullSelect` | "Type matches API contract" | Checked the named contract, not the runtime query |
| mcp-hub | Federation surface | "Domain orthogonal" | Correct |

All six audited the schema file. None grepped `prisma.task.findMany` or `prisma.pOV.findUnique` in the service layer to confirm the schema's `fullPOV` was actually used. The optimization comment at `pov.ts:19-22` even *cites the OLD code* ("`include: fullPOV.include`") — visible documentation that the canonical was deliberately bypassed.

**Time spent diagnosing**: 4 iteration cycles. Two prior commits shipped client-side fixes that couldn't help because the wire never carried the data. A single grep of `prisma.task.findMany` in `lib/services/` would have surfaced the bypass immediately.

**Fix applied**: Extract `taskDepsSelect` constant in `lib/tasks/prisma/select.ts`. Both `taskFullSelect` and the optimized service select spread it. Drift on the dep-edge shape becomes structurally impossible (commit `8d256992`).

**Lessons**:

1. **Schema files can lie by omission**. An exported "full" select is not necessarily what the production path uses. Always grep the actual `prisma.X.find*` call in services.
2. **Optimization commits create phantom canonicals**. The OLD-code comment is a dead giveaway — but only if you read the service file. Specialists who audited the schema file alone never saw it.
3. **Multi-specialist consensus is not multi-perspective coverage**. Six specialists audited the same schema file from six different conceptual angles. None audited the runtime query path. Independence of opinion ≠ independence of evidence.
4. **The "drift class" framing matters more than the fix**. Adding `dependencies` directly to the service select would also work, but extracting a shared constant prevents future drift on this specific edge shape — addressing the class, not just the instance.

---

## Latent Risk Sites (Not Yet Observed as Bugs, But Structurally Similar)

If the pattern name is correct, other places likely have the same hazard. Scan these:

### Task completion logic

- `agentExecutionEngine.ts` — task.update on successful execution
- `app/api/pov/agent/execute/stream/route.ts` — task.update on successful execution
- `lib/mcp/tasks/action/handlers/task/task-complete-handler.ts` — MCP perform(task.complete)
- `lib/mcp/tasks/action/handlers/task/task-update-handler.ts` — MCP perform(task.update) with status

Any PIPELINE-type rule (or future composite-task-type rule) needs consistency across ALL four. Missing one creates a bypass.

### Execution failure logic

- `agentExecutionEngine.ts` failure path (try/catch around agent execution)
- `agentExecutionEngine.ts` stale-execution cleanup sweeper (every poll cycle)
- `app/api/pov/agent/execute/stream/route.ts` — its own failure handling

### Task creation

- `lib/mcp/tasks/action/handlers/task/task-create-handler.ts` — MCP perform(task.create)
- `lib/tasks/handlers/task.ts` — REST API handler
- Direct Prisma `task.create` calls inside bulk import scripts or workflow-engine spawns

### Validation rules

Any rule stated at multiple layers (client, Zod schema, DB constraint) — if the rule gets updated, all three need the update or the least-restrictive layer wins.

---

## Detection Checklist

Use this checklist when you suspect drift OR before shipping a new rule:

- [ ] Grep the whole repo for any constants involved (`grep -rn 'MAX_TOOL_TURNS' lib/ app/`)
- [ ] Grep for the handler action name (`grep -rn 'task\.update' lib/ app/`)
- [ ] Grep for the target Prisma call (`grep -rn 'prisma\.task\.update' lib/ app/`)
- [ ] Grep for the specific field being validated (`grep -rn 'status.*COMPLETED' lib/`)
- [ ] Identify every place a user-facing operation can be invoked (MCP handler, REST route, stream route, bulk import, scheduler, etc.)
- [ ] For each invocation path, confirm the rule is applied consistently

If the rule is applied in two places, the drift clock has started.

### Phantom Canonical Variant (New, from 2026-05-02)

When a "canonical" schema/select/config file looks like the source of truth, ALSO run:

- [ ] Grep for the actual runtime call: `grep -rn 'prisma\.<model>\.\(findUnique\|findMany\|findFirst\|update\|create\)' lib/services/` — does it use the canonical's `include`/`select` or hand-roll its own?
- [ ] Search for optimization markers: `grep -rn '// OLD CODE\|// commented for rollback\|// rollback\|N+1' lib/services/ lib/handlers/` — these are the giveaway that a canonical was deliberately bypassed
- [ ] Check imports: `grep -rn 'import.*<canonicalName>' lib/` — if the canonical is imported but its `.include` / `.select` is not used in the same file, it's phantom canonical
- [ ] When auditing data-shape bugs, grep BOTH the schema file AND the service: `grep -rn '<fieldName>' lib/<domain>/prisma/ lib/<domain>/services/` — discrepancies surface immediately
- [ ] If the schema file is the only thing auditors are looking at, expand the audit perimeter to include `lib/services/<domain>/*.ts` — the production query likely lives there

**Heuristic**: any service file whose top has `import { fullX } from '../prisma/select'` BUT whose body uses `prisma.X.findUnique({ select: { id: true, ... } })` (literal-object select, not `fullX.include`) is a candidate for phantom-canonical drift.

---

## Remediation Strategies

### Short-term: Mirror + cross-reference comment

Apply the change to both paths. Add a comment in each pointing at the other:

```ts
// MIRROR of agentExecutionEngine.ts:650 — MAX_TOOL_TURNS must read from
// the same config source. If you change this, update there too.
// @see .claude/knowledge/patterns/two-execution-path-drift-pattern.md
const MAX_TOOL_TURNS = templateMetadata?.modelParameters?.maxToolTurns ?? 30;
```

Cheap, doesn't require refactoring. The comment is a tripwire for future edits.

### Medium-term: Extract shared function

If the concern is more than a single constant — a whole loop, a multi-step validation chain, a state machine — extract a shared module both paths call. The shared module is a single truth for the rule:

```ts
// lib/services/agentToolLoop.ts (future)
export async function runAgentToolLoop({
  execution,
  template,
  // ... params ...
}: RunParams): Promise<ToolLoopResult> {
  const MAX_TOOL_TURNS = template?.metadata?.modelParameters?.maxToolTurns ?? 30;
  // ... single implementation used by both engine and stream route
}
```

Higher upfront cost, but every future rule applies automatically to both.

### Long-term: Discover extraction opportunities via structural linting

A custom ESLint rule or grep-driven CI check could flag "two files importing the same Prisma model and calling update with the same status transition" — surface structural drift before it becomes a bug. Not built yet; candidate for a future tooling session.

---

## Anti-Patterns

### Don't: assume a comment claiming parity is true

`agentExecutionEngine.ts` had the stream route's hardcoded `10` comment-annotated as "`same as agentExecutionEngine`" — the comment was a LIE from a copy-paste that never got updated when the engine version changed. Comments claiming parity need to be verified via grep, not trusted at face value.

### Don't: fix only the path exercised in your current test

If a bug manifests in the stream path but you fix only the stream path, you've created new drift relative to the engine path. Either:
- Confirm the engine path is structurally immune (it doesn't implement this concern at all), OR
- Apply the same fix to both.

### Don't: extract prematurely from a single instance

You need 2-3 concrete duplications before a shared extraction pays off. Drift pattern exists to catch existing drift; extract when the drift is measurable, not preemptively.

---

## Success Indicators

You've successfully navigated this pattern when:
- New rules are checked across all relevant paths before merge
- Shared functions exist for concerns that appear in 3+ paths
- Comments in paths that still duplicate point at each other explicitly
- A grep for the canonical constant/field name returns 1 result (extracted) or is co-located in a single file

---

## References

- **Architecture doc**: `.claude/knowledge/domain/harness/automation-loop-closure-architecture.md` §Hindsight Lessons §Lesson 2
- **Reactor pattern**: `.claude/knowledge/patterns/orchestration-reactor-pattern.md` §Common Pitfalls §Multiple-execution-path drift
- **First canonical example commit**: `e008aba2` (fix(stream-execute): read maxToolTurns from template metadata)
- **Second canonical example commits**: `0215b8c0` + `d5d5b617` (client-side fixes that couldn't help) and `8d256992` (the actual root-cause fix in the service layer)
- **Pattern registry**: `.claude/knowledge/patterns/PATTERN-REGISTRY.md` — eligible for promotion now that two instances are confirmed
