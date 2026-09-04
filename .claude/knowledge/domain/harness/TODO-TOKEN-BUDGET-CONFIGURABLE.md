# TODO — Configurable Per-User Token Budget + Reset + Usage Display

**Status**: SCOPED — ready for implementation
**Created**: 2026-04-10
**Origin**: Lakeshore + Meridian pipeline runs consumed 1.2M tokens in 4 minutes, exceeding the hardcoded 1M/hour budget. Follow-up run 55 minutes later was still blocked because the sliding 1-hour window hadn't expired.

---

## Problem

The token budget is hardcoded at `lib/services/llm/types.ts:1050-1051`:
```ts
MAX_PER_HOUR: 1000000,   // 1M
MAX_PER_DAY: 10000000,   // 10M
```

A single pipeline with 3+ children consumes 1-1.5M tokens due to context chaining — each child receives the full predecessor output, so input token counts grow with pipeline depth. The 1M budget is too low for pipeline work and there's no way to change it without editing source code.

The hourly reset (`lib/services/llm/tokenManager.ts:175-183`) uses a **sliding window** from `lastReset`, not a fixed clock boundary. This means:
- Budget resets only when `checkBudget()` is called AND >= 1 hour since `lastReset`
- `lastReset` slides to `now` on each reset, so the window starts from the most recent reset, not from a fixed wall-clock hour
- If a pipeline exhausts the budget at 03:58 and the window started at 03:55, the next reset won't fire until 04:55 — a 57-minute wait even though the user "feels" like an hour has passed

Users have no visibility into when the window started, how much budget remains, or when it resets. They just see "Token budget exceeded" with no actionable guidance.

### Production evidence (Apr 10 2026)

```
03:55 — Lakeshore harness starts, lastReset slides to 03:55, hourly=0
03:58:07 — TokenManager warns: "Approaching hourly limit: 81.1%"
03:58:45 — Budget exceeded: 1105678 > 1000000
03:59:15 — Lakeshore harness finishes at ~1.2M tokens used
04:50:05 — New execution: "1199743 > 1000000" — only 55 min since reset, blocked
```

## Proposed changes

### 1. Per-user configurable token budget (profile settings)

**Schema**: Add to User model `settings` JSON or new column:
```ts
tokenBudgetPerHour: number  // default 2000000 (2M)
```

**Read path**: `lib/services/llm/mcp-integration.ts:200` currently reads `MCPTokenDefaults.BUDGET.MAX_PER_HOUR`. Change to:
```ts
const userBudget = user.settings?.tokenBudgetPerHour ?? MCPTokenDefaults.BUDGET.MAX_PER_HOUR;
```

Same change at `lib/services/llm/llm-service.ts:192`.

**Profile UI** (https://paichart.app/profile): Number input or slider under the existing "LLM Provider Settings" section where the API key is already configured.

| Setting | Min | Default | Max | Notes |
|---|---|---|---|---|
| Tokens per hour | 500,000 | 2,000,000 | 10,000,000 | Users with own API key can go higher |
| Tokens per day | 5,000,000 | 20,000,000 | 100,000,000 | Same |

**Why 2M default**: A 5-child pipeline with context chaining consumes 1-1.5M tokens. The 2M default handles this in a single hour without hitting the cap. The old 1M default was set before pipeline harness existed.

### 2. Reset button

**API endpoint**: `POST /api/profile/token-budget/reset`
- Clears `budgetTracking.delete(userId)` in the in-memory TokenManager
- Next LLM call creates a fresh tracking entry with zero usage
- Auth: user can only reset their own budget

**Profile UI**: "Reset Token Budget" button. Shows confirmation: "This will reset your hourly and daily token counters. Are you sure?"

**Implementation note**: The TokenManager is a singleton in the web process. The reset endpoint must call `tokenManager.resetBudget(userId)` — add this method (it's a one-liner: `this.budgetTracking.delete(userId)`).

**Cross-process concern**: Token budget is tracked in paichart-mcp (where agent executions run, pid 1760842 in production). The profile API runs in paichart-web. Two options:
- **Option A**: Expose a `/reset-budget` endpoint on the paichart-mcp process (internal, localhost only) that paichart-web calls. Adds an HTTP round-trip but keeps the architecture clean.
- **Option B**: Move budget tracking to a shared store (Redis or PostgreSQL). More correct but heavier change.
- **Option C**: Since `tokenManager` uses `globalThis`, and after Fix 2 both processes share the same `lib/services/llm/tokenManager.ts` module, check whether both processes maintain independent budget maps (they do — separate V8 heaps). Option A is the pragmatic choice.

**Recommend Option A** — one internal endpoint, no shared-state infrastructure needed.

### 3. Usage display in profile

**API endpoint**: `GET /api/profile/token-budget/status`
- Returns: `{ hourlyUsed, hourlyLimit, dailyUsed, dailyLimit, lastReset, resetsIn }`
- `resetsIn`: seconds until the next hourly reset (calculated from `lastReset + 3600 - now`)

**Profile UI**: Progress bar + text:
```
Token Usage: 423,000 / 2,000,000 (21.2%) — resets in 47 minutes
[████░░░░░░░░░░░░░░░░] 21%
```

When budget exceeded:
```
Token Usage: 1,199,743 / 2,000,000 (60.0%) — EXCEEDED, resets in 5 minutes
[████████████░░░░░░░░] 60%
[Reset Now] button
```

**Same cross-process concern as #2**: budget tracking lives in paichart-mcp. The status endpoint in paichart-web would need to query paichart-mcp for the current tracking state. Option A (internal endpoint) covers both reset and status.

### 4. Raise default budget (no UI needed, immediate code change)

**File**: `lib/services/llm/types.ts:1050-1051`
```ts
// Before:
MAX_PER_HOUR: 1000000,   // 1M
MAX_PER_DAY: 10000000,   // 10M

// After:
MAX_PER_HOUR: 2000000,   // 2M — pipeline harness + 5 children with context chaining
MAX_PER_DAY: 20000000,   // 20M — supports ~10 pipeline runs per day
```

This can ship immediately as a one-line change without any UI work. The per-user configurable setting (item 1) can follow later and will override this default.

## Implementation order

1. **Raise default to 2M** — one-line fix, immediate relief, no UI needed
2. **Per-user configurable budget** — schema + profile API + profile UI
3. **Reset button** — internal endpoint + profile UI button
4. **Usage display** — status endpoint + progress bar UI

Items 1 can ship standalone. Items 2-4 are a single feature unit (~2-3 hours).

## Files to modify

| File | Change |
|---|---|
| `lib/services/llm/types.ts` | Raise defaults (item 1) |
| `lib/services/llm/tokenManager.ts` | Add `resetBudget(userId)` method + `getBudgetStatus(userId)` method |
| `lib/services/llm/mcp-integration.ts` | Read budget from user settings instead of hardcoded constant |
| `lib/services/llm/llm-service.ts` | Same |
| `prisma/schema.prisma` | Add `tokenBudgetPerHour` to User settings (or existing settings JSON) |
| `app/api/profile/token-budget/route.ts` | New — GET status, POST reset |
| `mcp-server-http-clean.js` | Internal endpoint for cross-process budget status/reset |
| `components/profile/TokenBudgetSettings.tsx` | New — slider + progress bar + reset button |
| Profile page | Add TokenBudgetSettings component |

## Specialist review needed

- **api-efficiency-specialist**: cross-process budget query pattern (Option A vs B vs C)
- **frontend-provocateur-specialist**: profile UI for the budget slider + progress bar
- **auth-permissions-specialist**: ensure reset endpoint is user-scoped (can't reset other users' budgets)

## Related

- `lib/services/llm/tokenManager.ts` — current budget tracking implementation
- `lib/services/llm/types.ts:1050-1051` — hardcoded defaults
- `lib/services/llm/mcp-integration.ts:200-201` — where budget is consumed for tool calls
- Whitepaper §4.3, §5.1 — token budget exhaustion as emergent behavior trigger
- `.claude/knowledge/domain/harness/TODO-ARTIFACT-RETENTION-ARCHIVE.md` — related per-user settings work

## Version

- **v1** (2026-04-10): Initial scope from Meridian/Lakeshore token budget investigation
