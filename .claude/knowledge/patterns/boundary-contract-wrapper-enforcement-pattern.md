# Boundary-Contract Wrapper Enforcement Pattern

**Type**: Architecture / Data Integrity
**Created**: 2026-04-16
**Confidence**: 94% ✅ (2nd-pass boundary-contract + sec-ops + architectural review)
**Status**: Production-proven (task #85 reactor userId propagation)

---

## Pattern Overview

### Problem

When N independent writers assemble the same JSONB blob (or any loosely-typed shared record), documentation-only shape rules don't survive the N-th author. One writer gets the shape wrong, the record persists silently, and the bug surfaces far downstream as a masked symptom (empty LLM response, orphan execution, wrong user billed).

The 2026-04-15 reactor-userId drift was exactly this: 6 write sites assembled `agent_executions.context.triggeredBy`. Two got the shape right (`{id: userId}`), four wrote a bare string (`completedTaskId`). The engine's `extractUserId` silently fell back to `task.assigneeId` (POV owner) → POV owner's apiKey used for the LLM call → cross-user billing risk + masked failures.

### Solution

Funnel ALL writes to the contract-bearing field through a single wrapper function that parses the payload with a strict Zod schema BEFORE `prisma.*.create`. Enforce wrapper-only use with an automated grep-based test that fails CI if any caller bypasses it.

Three structural parts:

1. **Strict typed schema** — Zod `.strict()` + `.cuid()` on IDs + required discriminator enum + optional lineage fields
2. **Canonical wrapper** — single file, single function, throws `BoundaryContractViolation` on parse failure BEFORE the DB write
3. **Automated enforcement test** — pattern test that grep-bans raw writes outside the wrapper file

### Results

- **Would have caught the original bug at write-time**: bare-string payload → `.cuid()` rejects it → throw before DB write; no orphan rows, no masked downstream failures
- **6 write sites standardized** in one migration (all 6 now call the wrapper)
- **Dual-layer tests**: 5 pattern + 8 behavior = 13 tests, all passing
- **Zero regressions** across 7 production executions (MCP-direct + 3 reactor sources + retrigger)
- **Runtime cost negligible** (~10-50µs per parse, <0.5% of the Prisma write it guards)

---

## The Pattern

### Before (documentation-only)

```ts
// Site 1 — agentTaskService.ts
await prisma.agentExecution.create({
  data: {
    taskId,
    context: { triggeredBy: { id: userId } },  // correct shape
    // ...
  },
});

// Site 2 — taskReadyReactorService.ts (DRIFT — bare string)
await prisma.agentExecution.create({
  data: {
    taskId: dependent.id,
    context: { triggeredBy: completedTaskId },  // wrong — string, not object
    // ...
  },
});
```

No schema enforcement. Reviewer may miss the drift. Drift persists until downstream masks it.

### After (wrapper + strict schema)

```ts
// lib/services/types/triggered-by.ts — the contract
export const TriggeredBySourceEnum = z.enum([
  'mcp-direct', 'api-task-execute', 'api-pov-stream',
  'reactor-task-ready', 'reactor-task-ready-initial',
  'reactor-pipeline-retrigger', 'child-assignee-fallback', 'system',
]);

export const TriggeredBySchema = z.object({
  id: z.string().cuid('triggeredBy.id must be a CUID userId'),
  source: TriggeredBySourceEnum,
  parentExecutionId: z.string().cuid().optional(),
  parentTaskId: z.string().cuid().optional(),
}).strict();

// lib/services/agent-execution-create.ts — the wrapper
export async function createAgentExecution(args: CreateAgentExecutionArgs) {
  const parseResult = TriggeredBySchema.safeParse(args.triggeredBy);
  if (!parseResult.success) {
    log.error({ taskId: args.taskId, issues: parseResult.error.issues },
      'triggeredBy shape contract violation at wrapper boundary');
    throw new BoundaryContractViolation(...);
  }
  const validatedTriggeredBy = parseResult.data;

  const execution = await prisma.agentExecution.create({
    data: { /* ... uses validatedTriggeredBy ... */ },
  });

  // Fire-and-forget forensic audit in separate transaction
  logActivityWithDetails({ /* authMethod, triggeredBySource, parent lineage */ });
  return execution;
}

// Every call site now
await createAgentExecution({ taskId, triggeredBy: { id: userId, source: 'mcp-direct' }, ... });
```

### Automated enforcement test

```ts
// scripts/test-agent-execution-security.ts
test('G8 Pattern: prisma.agentExecution.create only in lib/services/agent-execution-create.ts', () => {
  const violations: string[] = [];
  for (const file of walkTs('lib', ['agent-execution-create.ts'])) {
    if (/\bprisma\.agentExecution\.create\s*\(/.test(read(file))) {
      violations.push(file);
    }
  }
  if (violations.length) throw new Error(`Raw-create violations: ${violations.join(', ')}`);
});
```

Grep test catches regressions at CI time. An AST rule would be stronger for nuanced cases (destructured clients), but substring-grep hits 95%+ of real drift at zero tooling cost.

---

## When This Pattern is SAFE

- ✅ Multiple independent writers assemble the same record or blob
- ✅ The field has a non-trivial shape contract (not just a scalar)
- ✅ Drift would be silently absorbed somewhere downstream (the hardest bugs to find)
- ✅ You can grep-identify all current writers (finite, countable, auditable)

## When This Pattern is UNSAFE

- ❌ Single-writer tables — wrapper is overhead with no drift defense payoff
- ❌ Hot-path where the Zod parse cost dominates (rare; parse is ~10-50µs, so only matters at >10k writes/sec with contention)
- ❌ Field semantics genuinely vary by caller — use a discriminated union instead, or split the table

---

## Performance Analysis

| Concern | Before | After |
|---|---|---|
| Write cost | ~2ms Prisma | ~2ms Prisma + ~20µs Zod parse |
| Overhead | 0 | <1% |
| Drift debugging | Hours (masked as downstream symptom) | 0 (parse throws at write with schema-pointing message) |
| Legacy row reads | — | `safeParse` + warn-log fallback path (don't break old rows) |

The asymmetric enforcement is deliberate:

- **Write boundary**: `parse` → throw → refuse to persist malformed shapes
- **Read boundary**: `safeParse` → WARN + legacy fallback → backward compat with old rows that predate the schema

---

## Real-World Results

**Deployed**: 2026-04-16 (commits `d95b0608` + `d8350372` + `5085e533`)

**Scope**:
- 1 new schema file (`triggered-by.ts`)
- 1 new wrapper (`agent-execution-create.ts`)
- 1 new error class (`BoundaryContractViolation`)
- 6 call sites migrated
- 1 dual-layer test file (13 tests)

**Production verification** (fresh pipeline run via GUI):

| # | Source | Lineage | Result |
|---|---|---|---|
| 1 | `mcp-direct` (harness CREATE) | — | ✅ SUCCESS, user propagated |
| 2 | `reactor-task-ready-initial` | parent = harness | ✅ SUCCESS |
| 3 | `reactor-task-ready-initial` | parent = harness | ✅ SUCCESS |
| 4-6 | `reactor-task-ready` (dep chain) | parent = harness | ✅ SUCCESS |
| 7 | `reactor-pipeline-retrigger` (SYNTHESIZE) | parent = harness | ✅ SUCCESS |

All 7 executions carried the triggering user's userId (propagated, not fallback). All 4 source enum values exercised. `task_activities.details` forensic trail populated for every row.

---

## Testing Strategy

### Layer 1: Pattern tests (grep-based, runs at CI)

```ts
test('Raw prisma.agentExecution.create only in wrapper file', () => {
  // grep lib/ + app/ — all hits must be in the wrapper file or test fails
});

test('No `apiKey` substring in logger.*(...) in lib/services/llm/', () => {
  // Prevents accidental key logging alongside the wrapper migration
});
```

### Layer 2: Behavior tests (actually exercise the schema)

```ts
test('TriggeredBySchema rejects bare-string', () => {
  const result = TriggeredBySchema.safeParse('cmnzq6g5j000syx0b7z9axajs');
  expect(result.success).toBe(false);  // the original bug shape
});

test('TriggeredBySchema rejects object missing source', () => {
  const result = TriggeredBySchema.safeParse({ id: userId });  // pre-migration shape
  expect(result.success).toBe(false);
});

test('TriggeredBySchema rejects unknown keys (.strict() — typo + prototype pollution defense)', () => {
  const result = TriggeredBySchema.safeParse({ id, source: 'mcp-direct', unknownKey: 'x' });
  expect(result.success).toBe(false);
});

test('TriggeredBySchema accepts full record with reactor lineage', () => {
  const result = TriggeredBySchema.safeParse({
    id: userId, source: 'reactor-task-ready',
    parentExecutionId: execId, parentTaskId: taskId,
  });
  expect(result.success).toBe(true);
});
```

Pattern tests catch "a new call site bypassed the wrapper." Behavior tests catch "the schema got weakened." Both layers matter — either alone leaves a gap.

---

## Error Handling Strategy

**Writes throw**: `BoundaryContractViolation extends ValidationError` with structured context (taskId, received shape, Zod issues). The pino log at wrapper entry captures the violation path for forensics.

**Reads warn-log, fall back**: `extractUserId` uses `safeParse` and logs WARN with the malformed value on failure. This lets legacy JSONB rows (written before the schema existed) keep working while any future drift surfaces loudly in logs. Warn-log includes `triggeredByShape: typeof context.triggeredBy` and the value itself — "catches drift 10-20x faster in prod than silent fallback ever would" (boundary-contract specialist).

**Audit log writes are fire-and-forget in a separate transaction** — if Activity write fails the execution remains authoritative. Loud-log on failure inside the helper, never swallow.

---

## Specialist Validation

- **boundary-contract-specialist** (94% 2nd-pass) — "Wrapper + `.strict()` schema is the structural defense documentation-only guidance can't match. The 6-site migration in one commit is the correct shape."
- **sec-ops-specialist** (93% 2nd-pass) — "Strict + CUID + enum also blocks prototype-pollution-via-`__proto__` and typo variants. Confirmed safe at write boundary."
- **architectural-review-specialist** (94% 2nd-pass) — "`prisma.agentExecution.create` appearing outside the wrapper should be treated as an architectural-level CI failure, not a review-time nit. The grep test gets us there."
- **validation-engine-specialist** (ship-with-minor-polish) — schema idioms clean; wrap `ZodError` in custom error class for catch-block clarity.
- **database-manager-specialist** (92% proceed) — JSONB shape enforced at app-layer is correct; no DB-side constraint needed.

---

## Implementation Checklist

- [ ] Identify the boundary field (which JSONB blob or loosely-typed record has multiple writers?)
- [ ] Grep-enumerate every current write site — get a finite list
- [ ] Write a Zod schema with `.strict()` + `.cuid()` on IDs + required discriminator enum
- [ ] Build the wrapper function — single file, single export, parse-then-write
- [ ] Create a typed error class (`BoundaryContractViolation extends ValidationError`)
- [ ] Migrate ALL write sites atomically (one commit if feasible — prevents half-migrated state)
- [ ] Add pattern test: grep raw create calls — must fail if any exist outside wrapper
- [ ] Add behavior tests for each drift shape you want to reject (bare string, missing field, unknown key)
- [ ] Add read-side `safeParse` with WARN log + legacy fallback (don't break old rows)
- [ ] Wire test into `npm run test:all-validation`

---

## Common Opportunities in Your Codebase

```bash
# Find JSONB fields with multiple writers
grep -rn "context: {" lib/ app/api/ --include="*.ts" | grep -v test
grep -rn "metadata: {" lib/services/ --include="*.ts"

# Find auth-smell patterns (optional chaining with fallback to different identity)
grep -rn "\.id ||" lib/services/ app/api/ --include="*.ts"
grep -rn "userId ||" lib/services/ app/api/ --include="*.ts"

# Find raw Prisma creates that should funnel through a wrapper
grep -rn "prisma\.\w*\.create\s*(" lib/ app/ --include="*.ts"
```

---

## Anti-Patterns to Avoid

❌ **Documentation-only shape rules** — "writers should pass `{id, source}`" in a README survives zero quarters
✅ **GOOD**: Strict Zod + wrapper + automated test — structural enforcement that outlasts the author

❌ **Per-writer Zod parsing** — easy to forget at a new call site; symmetric enforcement gap
✅ **GOOD**: One wrapper, one parse point, everyone funnels through it

❌ **Soft-parse at write time** (`safeParse` + log) — preserves the drift; downstream still breaks
✅ **GOOD**: Hard throw at write (`parse`), soft warn at read (`safeParse`) — asymmetric for good reason

❌ **Forgetting the test** — migration lands clean, new caller in 3 months bypasses wrapper, drift silently returns
✅ **GOOD**: CI-enforced grep test; raw creates outside wrapper break the build

❌ **Joining the audit log write to the execution-create transaction** — audit-write failure rolls back the execution, creating a sec-ops hole (execution happened but no forensic trail)
✅ **GOOD**: Fire-and-forget the audit log in a separate transaction; loud-log on failure; execution remains authoritative

❌ **Using `'system'` enum value as a fallback when user resolution fails** — re-creates the silent-billing bug under a new name
✅ **GOOD**: `'system'` is reserved for bona fide infrastructure-originated executions (seeders, startup jobs). Audit callers periodically to keep the invariant

---

## Related Patterns

- **`orchestration-reactor-pattern.md`** (Pattern #46) — reactors are a common source of boundary-drift (N writers → same JSONB field); this wrapper is the structural defense. See the "Context Field Shape Drift Across Reactor Boundary" pitfall in that pattern.
- **`field-leakage-prevention-pattern.md`** — sibling pattern for API↔component boundaries; same "validate at boundary" philosophy, different scope.
- **`fire-and-forget-activity-logging-pattern.md`** — the audit log write inside the wrapper uses this pattern (separate transaction, loud-log-on-failure).
- **`global-prisma-singleton-pattern.md`** — the wrapper is a natural place to standardize the Prisma client used for the create.

**Use Together**:
- Wrapper enforcement + discovery grep checks = structural + process defense
- Wrapper + fire-and-forget audit = correct transaction boundaries
- Wrapper + `extractUserId` safeParse = asymmetric write-strict/read-soft enforcement

---

**Pattern Status**: Production ✅ | **Confidence**: 94% | **Drift Eliminated**: 4 of 6 write sites had wrong shape pre-migration; 0 of 6 wrong post-migration. Would have caught the original 2026-04-15 reactor userId drift at write-time if shipped earlier.

---

## Validating Instance — F-NEW-5 "option-bag terminus drop" (2026-07-17)

**This pattern's own failure mode, recurring — and found the hard way.**

The codebase ALREADY had timeout enforcement in the right shape: `mcpClientWrapper.executeTool`
(`options?.timeout || this.config.requestTimeout`) and `protocolHandler` (`setTimeout(..., options.timeout ?? 30000)`).
**There was no bypass test.** Every wiring site went around them — `serverManager` assigns
`clientWrapper: null as any` at `:173/:197/:540`, each with a *"Will be replaced with proper wrapper later"*
comment that never came true — and both layers rotted into dead code (verified: **0 hits in 8 months** of prod
logs against a 239k-hit positive control) while the live path silently lost the behavior. Both files —
`mcpClientWrapper.ts` and `protocolHandler.ts` — plus the legacy `MCPIntegration` mock chain were **deleted
2026-07-17** (BC79 follow-up, two staged commits); `mcp-integration.ts` survives as type exports only.

Cost: a `timeout` threaded through five layers and consumed by none for ~2 years; a Browser Automation scrape
burned **60,196ms** (the SDK's 60s default) and killed a live pipeline leg, while the gateway advertised
`effectiveTimeout: 300000` — **a false fact in production**.

**What this instance adds to the pattern:**
1. **The enforcement half is the load-bearing half.** A correct wrapper with no bypass test is *worse* than no
   wrapper — it looks like the contract is handled, so the next reader stops looking. Confidence in this
   pattern's "automated grep-based test" step should be read as **mandatory, not optional**.
2. **The grep gate generalizes beyond writes.** The original instance banned raw `prisma.*.create` outside the
   wrapper; this one asserts a required *argument* is present at an SDK call
   (`scripts/test-sdk-request-options-coverage.ts`). Same mechanism, different terminus.
3. **Pattern-First was skipped, and it cost hours.** CLAUDE.md says check the registry BEFORE implementing.
   Four specialist lenses independently re-derived this pattern's solution shape from scratch. Reading it first
   would have named the diagnosis in minutes. *The registry only pays if it is consulted first.*

Full analysis: `cline_docs/reviews/f-new-5-timeout-drop-2026-07-17/PANEL-SYNTHESIS.md` ·
Registry entry: `.claude/knowledge/domain/mcp/bug-class-registry.md` Bug Class 79
