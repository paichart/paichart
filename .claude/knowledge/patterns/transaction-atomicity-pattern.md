# Pattern: Transaction Atomicity for Multi-Table State Changes

**Confidence**: 88% | **Last Audited**: 2026-06-08 (TS4 / BC19 corrected the lost-update guidance — see ⚠ in "Read-Then-Write Race Protection"; the multi-table-atomicity guidance is sound, the prior lost-update claim was wrong)
**Applied In**: 5 files, 8 transaction blocks, 3 commits
**Test**: `npm run build` (type-safe, all paths verified)

## Rule

When a single logical operation writes to 2+ tables, wrap ALL writes in `prisma.$transaction()`. If any write fails, the entire operation rolls back — no partial state.

```typescript
// BAD: partial state if task.update fails after execution.update succeeds
await prisma.agentExecution.update({ where: { id }, data: { status: 'SUCCESS' } });
await prisma.task.update({ where: { id: taskId }, data: { executionStatus: 'SUCCESS' } });

// GOOD: atomic — both succeed or both roll back
await prisma.$transaction(async (tx) => {
  await tx.agentExecution.update({ where: { id }, data: { status: 'SUCCESS' } });
  await tx.task.update({ where: { id: taskId }, data: { executionStatus: 'SUCCESS' } });
});
```

## When to Use

| Scenario | Use Transaction? | Reason |
|----------|-----------------|--------|
| Create artifacts + update execution + update task | **YES** | 3 tables, one logical operation |
| Update execution FAILED + create error artifact | **YES** | 2 tables, must be consistent |
| Read execution + update workflow stats | **YES — but a plain tx is NOT enough for lost-update** (see ⚠ below) | Read-then-write race; needs RR/`FOR UPDATE`/atomic statement, not just a tx |
| Record step in parallel execution | **YES — but a plain tx is NOT enough for lost-update** (see ⚠ below) | Concurrent writes can overwrite; a default-isolation tx does not stop this |
| Log activity after successful operation | **NO** | Fire-and-forget, non-critical |
| Single-table single-row update | **NO** | Already atomic by default |
| Independent reads (Promise.all) | **NO** | No write conflicts possible |

## When NOT to Use

- **Fire-and-forget activity logging**: Intentionally non-transactional. Logging failure should never roll back the primary operation. See `fire-and-forget-activity-logging-pattern.md`.
- **Single-table writes**: Prisma single-row operations are already atomic.
- **Independent parallel reads**: `Promise.all([prisma.a.findMany(), prisma.b.count()])` has no write conflicts.
- **SSE/WebSocket events**: Network I/O cannot be inside a transaction — batch DB ops first, send events after commit.

## The Pattern

### Basic: Two-Table Atomic Update

```typescript
await prisma.$transaction(async (tx) => {
  await tx.agentExecution.update({
    where: { id: executionId },
    data: { status: 'FAILED', endTime: new Date() },
  });

  await tx.task.update({
    where: { id: taskId },
    data: { executionStatus: 'FAILED', updatedAt: new Date() },
  });
});
```

### Advanced: Create + Read-Back + Update (3 Tables)

```typescript
await prisma.$transaction(async (tx) => {
  // 1. Create artifacts
  await tx.agentArtifact.createMany({ data: artifacts });

  // 2. Read back (within same transaction = consistent)
  const created = await tx.agentArtifact.findMany({
    where: { executionId },
  });

  // 3. Update execution status
  await tx.agentExecution.update({
    where: { id: executionId },
    data: { status: 'SUCCESS', endTime: new Date(), logs },
  });

  // 4. Update task with artifact references
  await tx.task.update({
    where: { id: taskId },
    data: {
      executionStatus: 'SUCCESS',
      outputArtifacts: created.map(a => ({ id: a.id, name: a.name })),
    },
  });
});
```

### With SSE/Streaming: DB First, Events After

```typescript
// Batch ALL database operations in transaction
await prisma.$transaction(async (tx) => {
  await tx.agentExecution.update({ ... });
  await tx.agentArtifact.createMany({ ... });
});

// Send SSE events AFTER transaction commits (not inside) — always via safeWrite
// (2026-08-21: raw writer.write is banned route-wide by test:terminal-persist-ponr P7;
// safeWrite absorbs client disconnects so they can never flip a committed outcome)
await safeWrite(`data: ${JSON.stringify({ type: 'execution_update' })}\n\n`);
await safeWrite(`data: ${JSON.stringify({ type: 'artifact_created' })}\n\n`);
await safeWrite('data: [DONE]\n\n');
```

### Read-Then-Write Race Protection

> ⚠ **CORRECTED 2026-06-08 (TS4 / bug-class BC19).** The earlier version of this section claimed a plain
> `$transaction` "serializes reads and writes" and prevents lost-update. **It does not.** A `$transaction`
> at Prisma's default isolation (READ COMMITTED) gives **atomicity and torn-read protection only** — a plain
> `findUnique`/`SELECT` inside it takes **no row lock**, so two concurrent transactions both read `v0`, both
> compute a merge in app memory, and the second `UPDATE SET col = <literal>` overwrites the first. The lost
> update still happens. (This misconception had propagated to `task.ts:648`, `orchestration-tracker.recordStep`,
> and registry BC47 — BC19 tracks the sweep.)

```typescript
// BAD #1: no tx — parallel steps read same metadata, overwrite each other (lost update).
const execution = await prisma.mCPWorkflowExecution.findUnique({ where: { id } });
await prisma.mCPWorkflowExecution.update({ where: { id }, data: { metadata: { ...execution?.metadata, steps: [...steps, newStep] } } });

// BAD #2: a PLAIN $transaction does NOT fix lost-update (no row lock at READ COMMITTED) —
// it only makes the read+write atomic-as-a-unit and prevents torn reads. Still racy.
await prisma.$transaction(async (tx) => { /* findUnique → app-merge → update */ });
```

**To actually prevent lost-update, pick ONE** (the merge must serialize against concurrent writers):

```typescript
// GOOD (a) — atomic single statement: the merge happens INSIDE SQL referencing the column,
// so a concurrent writer blocks then re-reads the committed value. Race-free, SILENT (no retry),
// lightest pool footprint. Best for single-row jsonb shallow merge. (TS4 used this — see
// lib/tasks/services/inputContext.ts mergeTaskInputContext.)
await prisma.$queryRaw`UPDATE "tasks" SET "inputContext" = COALESCE("inputContext",'{}'::jsonb) || ${json}::jsonb,
  "updated_at" = now() WHERE id = ${id} RETURNING "inputContext"`;  // raw UPDATE bypasses @updatedAt → set it

// GOOD (b) — RepeatableRead/Serializable isolation: a concurrent writer aborts with 40001.
// SAFE but LOUD — the caller must catch 40001 and retry. The repo's applied choice for multi-field
// merges that can't collapse to one statement (task.ts:763, task-update-handler.ts:602).
await prisma.$transaction(async (tx) => { /* findUnique → merge → update */ },
  { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

// GOOD (c) — SELECT … FOR UPDATE row-lock inside a tx (e.g. lib/pov/handlers/post.ts:59) when you
// must lock a set of rows for a multi-row invariant rather than merge a single row.
```

### §Retry — `withSerializationRetry` (the "and retry" half of GOOD(b)) — 2026-06-09

**Silent vs loud, the decision tree:**
- **GOOD(a) atomic** and **GOOD(c) `FOR UPDATE` (WAIT)** are **SILENT** — they block/re-read, never abort.
  **NEVER wrap them in retry.**
- **GOOD(b) RR/Serializable** and **`FOR UPDATE NOWAIT` (55P03)** are **LOUD** — they abort/fail-fast with a
  serialization conflict, and are the **only** mechanisms `withSerializationRetry` applies to.

`lib/database/serialization-retry.ts` `withSerializationRetry(fn, site)` is the named implementation of GOOD(b)'s
"caller must catch 40001 and retry" clause. It's a thin adapter over the shared `withRetry` core (BC14:
exponential backoff + **full jitter** + max-attempt + total-delay caps) with a serialization-aware predicate
(`RETRYABLE_SQLSTATES` = {40001, 40P01, 55P03} + Prisma `P2034`; excludes 53300/P2002/P2025). Sleeps happen
**outside** `$transaction`, so a pooled connection is never held across a backoff.

**Contract:** `fn` MUST contain ONLY the `prisma.$transaction(...)` call — a retry re-runs the entire `fn`, so
post-tx side-effects (`logFieldChange`, notifications, SSE) stay OUTSIDE (see Post-Transaction Side-Effects below).

**THE DECISION RULE (when to retry vs convert):** a GOOD(b) site gets `withSerializationRetry` **iff
database-manager classifies it contention-prone AND its logic is multi-step (can't collapse to one statement)**.
For a **simple-merge** high-contention site, **prefer BC47-style atomic (GOOD-a) / FOR-UPDATE (GOOD-c) conversion
over retry** — that removes the abort source entirely (it's silent + pool-lighter). Retry is for genuinely
multi-field merges like `task.ts` updateTask. (2026-06-09: `task.ts`/`task-update-handler`/`agent-configure`
wrap with retry; `agentTemplateService`/`metadata` were converted to atomic instead.) Cross-link BC14 (backoff)
+ BC19/BC47 (mechanism choice).

**Worked example — the completion core (2026-07-24, completion-path unification P2)**:
`lib/tasks/services/complete-task-terminally.ts` `completeTaskTerminally` is the canonical
two-layer shape: the retried closure contains ONLY `$transaction(runTaskCompletionTx)` (Layer 1 —
pure in-tx spine, fresh read → guards → CAS `updateMany` gated on count, exactly-once by
rollback); everything non-idempotent is OUTSIDE it — expensive fact computation (F10) PRE-tx,
comment/activity/reactors in a POST-COMMIT tail (`fireCompletionEffects`). Purity is structural,
not conventional: `test-serialization-retry-boundary.ts` (site in WRAP_SITES; reactor names in
MARKERS) + `test-completion-tx-shape.ts` (statement-order fixture) + the SPINE pins in
`test-completion-core-boundary.ts` (single CAS writer, Layer-1 side-effect-free, `fireReactors`
threaded-never-hardcoded).

### Post-Transaction Side-Effects (Return From Tx, Don't Closure-Capture)

When a transaction needs to capture data for **post-tx side-effects** (e.g., fire-and-forget activity logging that must NOT run on rollback, SSE event emission, cache warming), **return the captured data from the tx callback** rather than assigning to a `let` declared in the outer scope.

**Why this matters**:
1. **TypeScript narrowing** — `let x: T | null = null` declared outside the tx, then assigned inside the closure, narrows to `null` literal in the outer scope. TS can't track closure assignments back to the outer narrowing context. The outer `if (x)` check then narrows the truthy branch to `never`, producing `Property 'foo' does not exist on type 'never'` build errors. (See: TypeScript issue #9998 — closure-assigned variables don't update outer narrowing.)
2. **Forensic correctness** — fire-and-forget loggers like `logFieldChange` use the global Prisma singleton, NOT the surrounding `tx`. If the side-effect call sits textually inside the tx callback but uses the global client, it persists even on rollback — recording state that never committed. Returning the side-effect data and dispatching AFTER the await makes the rollback case structurally impossible to log.

```typescript
// BAD: closure-captured `let` outside the tx
let mergedLog: { keys: string[]; before: Record<string, unknown>; after: Record<string, unknown> } | null = null;
const { task } = await prisma.$transaction(async (tx) => {
  // ... merge happens here, mergedLog assigned ...
  mergedLog = { keys, before, after };
  return { task };
});
if (mergedLog) {
  // ❌ TS narrows mergedLog to `never` here — build fails
  for (const key of mergedLog.keys) { ... }
}

// GOOD: return the side-effect data from the tx
type MergedLog = { keys: string[]; before: Record<string, unknown>; after: Record<string, unknown> };
const { task, mergedLog } = await prisma.$transaction(async (tx) => {
  let mergedLog: MergedLog | null = null;
  // ... merge happens here, mergedLog assigned ...
  mergedLog = { keys, before, after };
  return { task, mergedLog };  // ← carry it out
});
if (mergedLog) {
  // ✅ TS narrows correctly — `mergedLog: MergedLog`
  for (const key of mergedLog.keys) {
    logFieldChange(taskId, userId, { name: `metadata.${key}`, ... });  // fire-and-forget AFTER tx
  }
}
```

**Production example**: `lib/mcp/tasks/action/handlers/task/task-update-handler.ts` — `_pendingMetadataMerge` block captures `mergedMetadataLog` inside the tx, returns it, then iterates `logFieldChange` calls after the await. Catches forensic-correctness bug from `cline_docs/reviews/harness-clobber-detection-2026-04-25/` (DB-manager CRITICAL-1) where the original closure-captured `let` would have written activity rows even on tx rollback.

## Inlining Helper Methods

If a helper method uses `prisma.` directly (e.g., `updateExecutionStatus`), you cannot call it inside a `$transaction` — it would use a separate connection. Inline the helper's logic using `tx.` instead.

```typescript
// BAD: helper uses prisma.agentExecution.update() — outside transaction
await prisma.$transaction(async (tx) => {
  await this.updateExecutionStatus(id, 'FAILED', { endTime }); // WRONG: uses prisma, not tx
  await tx.task.update({ ... });
});

// GOOD: inline the helper logic using tx
await prisma.$transaction(async (tx) => {
  await tx.agentExecution.update({
    where: { id },
    data: { status: 'FAILED', endTime, updatedAt: new Date() },
  });
  await tx.task.update({ ... });
});
```

## Detection: Finding Missing Transactions

```bash
# Find files with multiple prisma writes in sequence (potential missing transactions)
# Look for 2+ "await prisma." writes in the same function
grep -rn 'await prisma\.' --include='*.ts' lib/ app/ | \
  awk -F: '{print $1}' | sort | uniq -c | sort -rn | head -20

# Find files that DON'T use $transaction but have multiple writes
grep -rL '\$transaction' --include='*.ts' lib/ app/ | \
  xargs grep -l 'await prisma\.' | \
  xargs grep -c 'await prisma\.' | \
  awk -F: '$2 > 2 {print}' | sort -t: -k2 -rn | head -20
```

## Production Examples (Feb 2026)

| File | Tables | Operations | Commit |
|------|--------|------------|--------|
| `orchestration-tracker.ts:complete()` | MCPWorkflowExecution, MCPWorkflow | Update execution + update workflow stats | `6ab0b51e` |
| `orchestration-tracker.ts:recordStep()` | MCPWorkflowExecution | Read metadata + append step (race protection) | `6ab0b51e` |
| `orchestration-tracker.ts:fail()` | MCPWorkflowExecution | Read metadata + update with error | `6ab0b51e` |
| `agentExecutionEngine.ts` (success) | agentArtifact, agentExecution, task | Create + read-back + update + update | `21452b2e` |
| `agentExecutionEngine.ts` (error) | agentExecution, task | Update FAILED + update FAILED | `21452b2e` |
| `execute/route.ts` (success) | agentArtifact, agentExecution, task | Create + read-back + update + update | `21452b2e` |
| `execute/route.ts` (error) | agentExecution, agentArtifact | Update FAILED + create error artifact | `21452b2e` |
| `execute/stream/route.ts` (success) | agentExecution, agentArtifact | Update SUCCESS + create 3 artifacts | `21452b2e` |
| `execute/stream/route.ts` (error) | agentExecution, agentArtifact | Update FAILED + create error artifact | `21452b2e` |

## Intentional Non-Transactional Operations

These are **correct** without transactions:

| File | Why No Transaction |
|------|-------------------|
| `taskActivityService.ts` (all log functions) | Fire-and-forget activity logging — failure must not roll back primary operation |
| `bulkUpdateTasks()` in `task-action-service.ts` | Already uses `$transaction` internally |
| Team member CRUD (`team/route.ts`) | Single-row operations, microsecond failure window |

## Related Patterns

- **fire-and-forget-activity-logging-pattern.md**: The counterpart — when NOT to use transactions
- **parallel-query-optimization-pattern.md**: For reads, use `Promise.all` (no transaction needed)
- **global-prisma-singleton-pattern.md**: The singleton provides the `prisma` client used in transactions
