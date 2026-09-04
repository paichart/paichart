# Sanctioned DB-Push Exception: Raw-SQL Ops Script Pattern

**Type**: DevOps + Database Pattern — schema evolution exception
**Created**: 2026-04-18 (established via L3 + A6 ship)
**Confidence**: **97%** — 4 canonical instances in production, zero incidents
**Status**: Production-proven, the canonical escape hatch from `db push`
**Pairs with**: `database-drift-elimination-pattern.md` (the default `db push` everywhere rule)

---

## Pattern Overview

**Problem**: `prisma db push` is the project default for schema changes (zero-drift by design, see pairing pattern). But **three schema constructs cannot be expressed through `db push`**:

1. **Partial unique indexes** — Prisma schema has no `@@unique(..., where: ...)` syntax
2. **JSONB expression indexes** — `@@index([field])` can't express `((metadata->>'key'))`
3. **`CONCURRENTLY` non-blocking builds** — `db push` runs inside a transaction; `CREATE INDEX CONCURRENTLY` cannot

Any schema change that needs any one of these must go through a sanctioned escape hatch: a raw-SQL ops script applied via SSH + `psql`, NOT via `db push`.

**Solution**: A hardened bash script at `scripts/create-*-index.sh` that:
- Pre-checks for blocking conditions
- Handles INVALID-index stale state from prior failed runs
- Creates the index with `CONCURRENTLY`
- Verifies `indisvalid=true` AND the WHERE-clause predicate is present
- Refreshes planner stats with `ANALYZE`

Paired with a documentation-only annotation in `prisma/schema.prisma` pointing at the script, so future readers can trace the raw-SQL index back to its origin without confusion about why it isn't in the schema.

---

## When to Use This Pattern

Use the ops-script exception ONLY when your schema change needs one or more of:

| Need | Why `db push` can't | Example |
|---|---|---|
| Partial UNIQUE index | Prisma schema: no `where:` on `@@unique` | `idx_agent_executions_active_per_task` — one active execution per task (L3) |
| JSONB expression index | Prisma schema: `@@index([field])` is column-only | `idx_tasks_pipeline_stage_id` — A6 |
| `CREATE INDEX CONCURRENTLY` on a large table | `db push` runs in a transaction | 10-index P0 batch (Oct 28 2025) |
| `CREATE UNIQUE INDEX CONCURRENTLY` | Combines two restrictions | L3 |

**Scale threshold for CONCURRENTLY**: at small table sizes (<1K rows) `db push` builds finish in milliseconds and the CONCURRENTLY argument is moot — prefer schema-managed indexes there. The partial + JSONB restrictions are independent of scale.

---

## When NOT to Use

Use normal `db push` (per the drift-elimination pattern) when:

- ❌ A plain `@@index([field])` or `@@unique([field])` expresses the constraint — Prisma handles it
- ❌ Small table, no partial/JSONB need — no CONCURRENTLY needed
- ❌ The index is part of an enum or model addition — that's `db push` territory

Every deviation from `db push` is a hygiene cost (raw-SQL indexes don't show up in `prisma migrate status`, schema docs require manual annotation). Only deviate when schema semantics force it.

---

## Canonical Instances (Production-Proven)

| Script | Date | Type | Empirical |
|---|---|---|---|
| `prisma/migrations/20250811_add_execution_triggers/migration.sql` line 50 | Aug 2025 | Partial JSONB `idx_agent_executions_id_status` | **Survived 200+ `db push --accept-data-loss=false` deploys** since Dec 2025 drift-elimination switch — direct proof the exception is safe |
| `scripts/create-production-indices.sh` | Oct 28 2025 | 10× `CREATE INDEX CONCURRENTLY` on performance-critical tables | First canonical ops-script instance. Pattern precedent. |
| `scripts/create-agent-execution-active-unique-index.sh` | Apr 18 2026 | Partial UNIQUE `idx_agent_executions_active_per_task` (L3) | Added full dev-ops hardening: ON_ERROR_STOP, duplicate pre-check, INVALID cleanup, indisvalid + WHERE-clause post-verify |
| `scripts/create-tasks-pipeline-stage-jsonb-index.sh` | Apr 18 2026 | Partial JSONB expression `idx_tasks_pipeline_stage_id` (A6) | Refined the template: removed duplicate pre-check (non-unique), added informational stats log, added `ANALYZE tasks` post-create |

The Aug 2025 instance is the load-bearing empirical proof: a raw-SQL index outside `schema.prisma` that persists across 200+ `db push` deploys without drift, without error, without intervention. The mechanism is safe.

---

## Script Template (Hardened)

Clone this from `scripts/create-agent-execution-active-unique-index.sh` or `scripts/create-tasks-pipeline-stage-jsonb-index.sh` — pick the one closer to your use case.

```bash
#!/bin/bash
# <PLAN §X>: <one-line purpose — what this index prevents or accelerates>
#
# <2-3 sentences on WHY the index is a db-push exception:
#   - Which of partial-unique / JSONB-expression / CONCURRENTLY applies
#   - Why Prisma schema can't express it>
#
# CONCURRENTLY: non-blocking build. Cannot run in a transaction; psql -c
# runs each statement outside a transaction block. psql -v ON_ERROR_STOP=1
# ensures any psql-side error aborts the script.
#
# Plan: <path to implementation-plan.md>
# Pattern: .claude/knowledge/patterns/sanctioned-db-push-exception-ops-script-pattern.md

set -euo pipefail

echo "🚀 <INDEX NAME> — starting $(date -Iseconds)"

if [ -z "${DATABASE_URL:-}" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable not set"
    exit 1
fi

# STEP 1 (OPTIONAL — only for UNIQUE indexes) — Duplicate pre-check
# A UNIQUE constraint fails the CREATE if any taskId already has >1 active row.
# Abort here with a clear message rather than partway through the CREATE.
#
# For non-unique indexes, REPLACE this block with an informational stats log:
#   echo "ℹ️  Baseline stats:"
#   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -c "SELECT COUNT(*), pg_size_pretty(pg_relation_size('<table>')) FROM <table> WHERE <predicate>;"
#
# (If your index is UNIQUE:)
echo "🔍 Pre-check: any duplicate constraint-violating rows?"
DUPE_COUNT=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -c \
    "SELECT COUNT(*) FROM (SELECT <keys> FROM <table> WHERE <predicate> GROUP BY <keys> HAVING COUNT(*) > 1) d;")
if [ "$DUPE_COUNT" != "0" ]; then
    echo "❌ ABORT: $DUPE_COUNT row(s) violate the constraint. Resolve before creating."
    exit 2
fi
echo "   ✓ No duplicates; safe to proceed."

# STEP 2 — INVALID-index cleanup. CREATE ... IF NOT EXISTS silently succeeds
# on a stale INVALID index from a prior failed CONCURRENTLY build, leaving
# us with no valid index. Drop any such leftover before the create.
echo "🧹 Checking for stale INVALID index from prior failed runs..."
STALE=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -c \
    "SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = '<INDEX_NAME>' AND NOT i.indisvalid;")
if [ "$STALE" = "1" ]; then
    echo "   ⚠️  Found INVALID index; dropping before re-creating."
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP INDEX CONCURRENTLY IF EXISTS <INDEX_NAME>;"
else
    echo "   ✓ No stale index."
fi

# STEP 3 — Create the index.
echo "🔒 Creating <INDEX_NAME> (CONCURRENTLY)..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "CREATE [UNIQUE] INDEX CONCURRENTLY IF NOT EXISTS <INDEX_NAME> ON <table> (<columns-or-expression>) [WHERE <predicate>];"

# STEP 4 — Post-create verification. Three arms:
#   (a) name exists — CREATE could fail with no error code in extreme cases
#   (b) indisvalid=true — CONCURRENTLY can fail mid-build, leaving an INVALID index
#   (c) indexdef contains the WHERE clause — catches the catastrophic case
#       where the predicate was dropped and we accidentally created a
#       full-table index instead of a partial one
#
# CRITICAL — the awk regex on (c) must match YOUR predicate:
#   - /WHERE \(type = /   for WHERE type = 'VAL'
#   - /WHERE \(status = ANY/  for WHERE status IN (...)
#   - Mismatch = silent pass on a non-partial index (catastrophic — the
#     full-table version of a partial index is a different, much larger object).
echo "📋 Verifying (name, indisvalid, WHERE clause)..."
VERIFY=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -F'|' -c "
    SELECT c.relname, i.indisvalid, pg_get_indexdef(i.indexrelid)
    FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = '<INDEX_NAME>';
")
if [ -z "$VERIFY" ]; then
    echo "❌ ABORT: index not found after create."
    exit 3
fi
echo "   Result: $VERIFY"
echo "$VERIFY" | awk -F'|' '
    $2 != "t" { print "❌ ABORT: indisvalid != true"; exit 4 }
    $3 !~ /<YOUR_PREDICATE_REGEX>/ { print "❌ ABORT: indexdef missing WHERE predicate — would be a full-table index"; exit 5 }
    { print "   ✓ valid + partial (WHERE clause present)" }'

# STEP 5 — Refresh planner stats. Helps Postgres commit to the new plan
# immediately instead of waiting for autovacuum. Cheap on any table size.
echo "📊 Refreshing planner stats..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "ANALYZE <table>;"

echo "✅ Done — finished $(date -Iseconds)"
```

---

## Schema Annotation (Documentation-Only)

Paired with the ops script, add a comment on the affected Prisma model so future readers can trace the raw-SQL index back to its origin:

```prisma
model AffectedModel {
  // ... fields ...
  @@index([regularField])  // regular Prisma-managed index
  // 2026-MM-DD <PLAN-ID>: <raw-SQL index name> applied via ops script:
  //   scripts/create-<thing>-index.sh
  // Prisma cannot express <partial|JSONB expression|CONCURRENTLY>; sanctioned
  // db-push exception per:
  //   .claude/knowledge/patterns/sanctioned-db-push-exception-ops-script-pattern.md
  // Plan: cline_docs/reviews/<plan-dir>/implementation-plan.md §<section>
  @@map("table_name")
}
```

The annotation is **documentation-only** — Prisma does NOT generate the index from this comment. The ops script is the source of truth.

---

## Deploy Flow (Standard)

Two-phase when paired with code changes, one-phase when the index ships alone:

**Code-first (preferred — the index is purely additive planner optimization)**:
1. Push commit containing the ops script + schema annotation
2. CI deploys via standard `db push` (ignores the raw-SQL index — empirically proven)
3. SSH to prod, run the script:
   ```bash
   ssh root@<prod-host>
   cd /var/www/<app>/current
   source .env.production
   DATABASE_URL="$DATABASE_URL" ./scripts/create-<thing>-index.sh
   ```
4. Script self-verifies. Non-zero exit = rollback.

**Index-first (rare — use when code changes depend on the index for perf-acceptable behavior)**:
- Apply via inline SSH `psql` before pushing code. Add the ops script in the same push or a follow-up.

---

## Rollback

Indexes created through this pattern are purely additive (non-unique) or add failure modes handled in code (UNIQUE — typed errors, P2002 catch). Rollback is universal:

```sql
DROP INDEX CONCURRENTLY IF EXISTS <INDEX_NAME>;
```

**Non-blocking on queries** (SHARE UPDATE EXCLUSIVE lock; concurrent SELECT + INSERT + UPDATE continue unaffected). Safe any time outside:
- Long-running analytics crons that lock the table (site-specific; check local cron)
- Long-running transactions — `DROP INDEX CONCURRENTLY` waits them out

**Correction to prior guidance**: Local machine `pg_dump` pulls (documented as 22:00–00:00 AEST on the pAIchart deploy) are read-only and do NOT block `DROP INDEX CONCURRENTLY`. That window applies to `pg_dump`-incompatible operations, not this pattern.

---

## Discovery Grep (for specialist agents)

```bash
# Find all ops scripts following this pattern
ls scripts/create-*-index.sh

# Find schema annotations that reference raw-SQL indexes
grep -rn 'sanctioned db-push exception\|applied via ops script\|idx_.*partial' prisma/schema.prisma

# Find the hardening shape (ON_ERROR_STOP, INVALID cleanup, post-verify)
grep -n 'ON_ERROR_STOP=1\|indisvalid\|DROP INDEX CONCURRENTLY' scripts/create-*-index.sh

# Find raw-SQL indexes in prisma/migrations/ (legacy documentation folder —
# this was the pre-Dec-2025 mechanism; shipped instances still visible there)
grep -rn 'CREATE INDEX CONCURRENTLY\|CREATE UNIQUE INDEX CONCURRENTLY' prisma/migrations/
```

---

## Common Pitfalls

### Pitfall 1: Wrong post-verify regex (catastrophic on partial indexes)

The post-create awk regex must match YOUR predicate's shape. Copy-pasting from L3 (`/WHERE \(status = ANY/`) to an A6-style JSONB index is wrong — the predicate is `WHERE type = 'PIPELINE'`. Wrong regex = silent pass on a non-partial index. Use the appropriate form:

| Predicate | awk regex |
|---|---|
| `WHERE status IN ('A', 'B')` | `/WHERE \(status = ANY/` |
| `WHERE type = 'PIPELINE'` | `/WHERE \(type = /` |
| `WHERE deletedAt IS NULL` | `/WHERE \(("deletedAt" IS NULL\|deleted_at IS NULL)/` |

Always test the regex on a sample indexdef output locally before trusting it in prod.

### Pitfall 2: Silent INVALID-index leftovers

If a `CREATE ... CONCURRENTLY` is interrupted (SIGINT, network flap, timeout), it leaves a row in `pg_index` with `indisvalid=false`. A subsequent `CREATE ... IF NOT EXISTS` silently succeeds (the index name exists) but the new run doesn't replace the invalid one — you end up with no valid index and no error.

The INVALID-cleanup block in the template handles this explicitly. **Don't skip it** even if you're "sure" the prior run succeeded.

### Pitfall 3: Relying on `db push` to maintain the index

`db push` doesn't drop out-of-band raw-SQL indexes (empirically proven across 200+ deploys on this project), but it also doesn't **maintain** them. If the underlying column type changes, or the model is dropped, the index becomes orphaned. Schema annotations help future readers notice; specialist reviews (database-manager) should grep for orphans periodically.

### Pitfall 4: Forgetting to run ANALYZE

A freshly-created index on a warm table may not be picked by the planner until stats refresh. Add `ANALYZE <table>` at the end of the script — it's cheap at any table size and avoids the "I ran the script but EXPLAIN still shows seq-scan" confusion.

---

## Related Patterns

- **`database-drift-elimination-pattern.md`** — the default `db push` everywhere rule that this pattern is the sanctioned exception to
- **`orchestration-reactor-pattern.md`** — reactors using raw `$queryRaw` that benefit from these indexes
- **`pattern-registry.md`** — registry entry

## Related Plans

- **L3**: `cline_docs/reviews/agent-execute-race-condition-2026-04-18/implementation-plan.md` §Phase 5
- **A6**: `cline_docs/reviews/pipeline-context-a6-2026-04-18/implementation-plan.md` §Phase 1
- **Initial 10-index batch (Oct 2025)**: `scripts/create-production-indices.sh`

---

**Pattern Status**: ✅ Production-proven across 4 canonical instances, zero incidents
**Confidence**: 97% — 3% reserved for (a) theoretical planner behavior under extreme concurrent load (not observed), (b) future Prisma error-shape drift on the P2002 catcher (mitigated by 3-arm matcher in the Zod/error-class pattern)
**Recommendation**: Default to `db push`; use this pattern only when schema semantics demand it
