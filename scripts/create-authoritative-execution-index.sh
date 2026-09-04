#!/bin/bash
# 2026-07-04 retry-band keep-best: partial index backing the authoritative-execution
# selector (selectAuthoritativeExecution — WHERE taskId=? AND status='SUCCESS' AND
# "supersededById" IS NULL ORDER BY "createdAt" DESC, id DESC LIMIT 1).
#
# Predicate matches the selector exactly; the pruner keep-set queries deliberately do
# NOT use this index (they must see superseded rows too — they ride @@index([taskId]);
# database-manager-analysis.md LOW-2).
#
# CONCURRENTLY: avoids blocking writes; cannot run in a transaction (psql -c runs each
# statement outside a transaction block). IF NOT EXISTS: idempotent re-run after any
# DB rebuild — raw-SQL partial indexes are invisible to Prisma's diff engine and
# survive `db push` (proven since 2026-04-18 by idx_agent_executions_active_per_task).
#
# Pattern: .claude/knowledge/patterns/database-drift-elimination-pattern.md
# Plan: cline_docs/reviews/retry-band-keep-best-2026-07-04/ (arch synthesis §3 item 3
#        + database-manager-analysis.md Surface 1 / LOW-3)

set -euo pipefail

echo "🚀 keep-best partial index — starting $(date -Iseconds)"

if [ -z "${DATABASE_URL:-}" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable not set"
    exit 1
fi

# INVALID-index cleanup (mirrors the L3 + JSONB scripts' §3.c): CREATE ... IF NOT EXISTS
# silently succeeds on a stale INVALID index left by a PRIOR failed CONCURRENTLY build,
# leaving it permanently unused. Matters more now this runs automatically on every deploy —
# drop-if-invalid so the CREATE below actually rebuilds it.
STALE=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -c \
    "SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = 'idx_agent_executions_authoritative_per_task' AND NOT i.indisvalid;")
if [ "$STALE" = "1" ]; then
    echo "⚠️  Found INVALID idx_agent_executions_authoritative_per_task (prior failed build) — dropping to rebuild."
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP INDEX CONCURRENTLY IF EXISTS idx_agent_executions_authoritative_per_task;"
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_executions_authoritative_per_task
     ON agent_executions (\"taskId\", \"createdAt\" DESC, id DESC)
     WHERE status = 'SUCCESS' AND \"supersededById\" IS NULL;"

echo "✅ idx_agent_executions_authoritative_per_task ensured $(date -Iseconds)"
