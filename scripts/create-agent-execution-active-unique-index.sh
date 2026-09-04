#!/bin/bash
# 2026-04-18 L3: DB-level enforcement of "one active execution per task."
# Prevents duplicate PENDING/RUNNING rows for the same task, closing the
# race window exposed by the agent.assign + agent.execute sequence and any
# future coordination bugs in code paths that create agent_executions.
#
# Partial index WHERE status IN ('PENDING','RUNNING'):
#   - Active set: PENDING, RUNNING (what the constraint guards against).
#   - Terminal set (excluded): SUCCESS, FAILED. Re-execution after failure
#     is unblocked because terminal rows fall outside the predicate.
#   - SCHEDULED (excluded): pre-active; transitions to PENDING at startTime
#     and hits the constraint naturally at that point.
#   Note: AgentExecution.status is typed `String` in prisma/schema.prisma
#   (not the ExecutionStatus enum). Runtime values observed in code + prod:
#   PENDING / SCHEDULED / RUNNING / SUCCESS / FAILED only. CANCELLED/TIMEOUT
#   do not exist on this table.
#
# CONCURRENTLY: avoids blocking writes during index build. Cannot run in
# a transaction; psql -c runs each statement outside a transaction block.
# psql -v ON_ERROR_STOP=1 ensures any psql-side error aborts the script.
#
# Follows the sanctioned db-push exception per:
#   .claude/knowledge/patterns/database-drift-elimination-pattern.md
# and the ops-script pattern established by:
#   scripts/create-production-indices.sh (Oct 28, 2025)
#
# Plan: cline_docs/reviews/agent-execute-race-condition-2026-04-18/implementation-plan.md §5.B

set -euo pipefail

echo "🚀 L3 partial UNIQUE index — starting $(date -Iseconds)"

if [ -z "${DATABASE_URL:-}" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable not set"
    exit 1
fi

# 3.b — Automated duplicate pre-check (§5.F.1 previously human-driven).
# If any taskId has more than one active execution, the CREATE UNIQUE INDEX
# will fail; abort here with a clear message rather than partway through.
echo "🔍 Pre-check: any duplicate active executions?"
DUPE_COUNT=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -c \
    "SELECT COUNT(*) FROM (SELECT \"taskId\" FROM agent_executions WHERE status IN ('PENDING','RUNNING') GROUP BY \"taskId\" HAVING COUNT(*) > 1) d;")
if [ "$DUPE_COUNT" != "0" ]; then
    echo "❌ ABORT: $DUPE_COUNT task(s) have duplicate active executions. Resolve before creating the unique index."
    echo "   Query: SELECT \"taskId\", COUNT(*) FROM agent_executions WHERE status IN ('PENDING','RUNNING') GROUP BY \"taskId\" HAVING COUNT(*) > 1;"
    exit 2
fi
echo "   ✓ No duplicates; safe to proceed."

# 3.c — INVALID-index cleanup. CREATE ... IF NOT EXISTS silently succeeds
# on a stale INVALID index from a prior failed CONCURRENTLY build, leaving
# us with no valid index. Drop any such leftover before the create.
echo "🧹 Checking for stale INVALID index from prior failed runs..."
STALE=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -c \
    "SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = 'idx_agent_executions_active_per_task' AND NOT i.indisvalid;")
if [ "$STALE" = "1" ]; then
    echo "   ⚠️  Found INVALID index; dropping before re-creating."
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP INDEX CONCURRENTLY IF EXISTS idx_agent_executions_active_per_task;"
else
    echo "   ✓ No stale index."
fi

# Create the index.
echo "🔒 Creating idx_agent_executions_active_per_task (partial UNIQUE, CONCURRENTLY)..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_executions_active_per_task ON agent_executions (\"taskId\") WHERE status IN ('PENDING', 'RUNNING');"

# 3.d — Post-create verification: name exists AND indisvalid = true AND
# indexdef includes the WHERE clause (event-system N1: a non-partial unique
# index would block all re-executions — catastrophic).
echo "📋 Verifying (name, indisvalid, WHERE clause)..."
VERIFY=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -F'|' -c "
    SELECT c.relname, i.indisvalid, pg_get_indexdef(i.indexrelid)
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'idx_agent_executions_active_per_task';
")
if [ -z "$VERIFY" ]; then
    echo "❌ ABORT: index not found after create."
    exit 3
fi
echo "   Result: $VERIFY"
echo "$VERIFY" | awk -F'|' '
    $2 != "t" { print "❌ ABORT: indisvalid is not true"; exit 4 }
    $3 !~ /WHERE \(status = ANY/ { print "❌ ABORT: indexdef does not contain the WHERE predicate — non-partial unique would block re-execution"; exit 5 }
    { print "   ✓ Index is valid AND partial (WHERE clause present)." }
'

echo "✅ L3 index ready — finished $(date -Iseconds)"
