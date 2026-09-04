#!/bin/bash
# A6 — JSONB partial index on tasks.metadata->>'pipelineStageId'
#
# Accelerates existing reactor `$queryRaw` lookups:
#   - pipelineRetriggerReactorService.ts:111 — bitmap-heap → index scan (~24× faster)
#   - agentExecutionConfigBuilder.ts:190 — seq-scan → index scan (eliminated full-scan)
# And enables the new /api/pov/[povId]/phase/[phaseId]/pipeline-context endpoint
# without a cold-path scan cost.
#
# Partial predicate WHERE type = 'PIPELINE':
#   - Only ~18 of 358 prod rows match today
#   - Scales cleanly as the table grows
#   - Non-unique index (unlike L3's) — duplicates are legal, no pre-check needed
#
# CONCURRENTLY: non-blocking build. Cannot run in a transaction; psql -c runs
# each statement outside a transaction block. psql -v ON_ERROR_STOP=1 ensures
# any psql-side error aborts the script.
#
# Clones scripts/create-agent-execution-active-unique-index.sh (L3, 2026-04-18, 96%).
# Differences vs L3:
#   - No duplicate pre-check (A6 is non-unique)
#   - Informational stats log (replaces the removed pre-check — dev-ops I-2)
#   - Post-create regex: /WHERE \(type = / (NOT /WHERE \(status = ANY/ — dev-ops I-1)
#     Wrong regex would silently pass verification on a non-partial JSONB
#     extraction index (catastrophic: full-table index is a different, larger object)
#   - Optional ANALYZE tasks post-create (database-manager N-1)
#
# Sanctioned db-push exception per:
#   .claude/knowledge/patterns/database-drift-elimination-pattern.md
# Pattern precedent: scripts/create-production-indices.sh (Oct 28 2025),
#   scripts/create-agent-execution-active-unique-index.sh (2026-04-18 L3).
#
# Plan: cline_docs/reviews/pipeline-context-a6-2026-04-18/implementation-plan.md §Phase 1
# Review confidence: arch-review synthesis 95.5% post-edit.

set -euo pipefail

echo "🚀 A6 JSONB partial index — starting $(date -Iseconds)"

if [ -z "${DATABASE_URL:-}" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable not set"
    exit 1
fi

# A4 — Informational stats log (non-blocking; replaces L3's duplicate pre-check
# since A6 is non-unique and duplicates can't block creation). Captures the
# baseline so operators see table size + PIPELINE count in the deploy log —
# if a future operator runs the script on a 50M-row table, they'll notice
# before a 60-minute build.
echo "ℹ️  Baseline stats (informational — A6 is non-unique, no blocker):"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -F'|' -c "SELECT
  (SELECT COUNT(*) FROM tasks WHERE type = 'PIPELINE') AS pipeline_rows,
  (SELECT COUNT(DISTINCT metadata->>'pipelineStageId') FROM tasks WHERE type = 'PIPELINE') AS distinct_stage_ids,
  (SELECT pg_size_pretty(pg_relation_size('tasks'))) AS table_size;"

# INVALID-index cleanup (identical to L3 §3.c). CREATE ... IF NOT EXISTS silently
# succeeds on a stale INVALID index from a prior failed CONCURRENTLY build,
# leaving us with no valid index. Drop any such leftover before the create.
echo "🧹 Checking for stale INVALID index from prior failed runs..."
STALE=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -c \
    "SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = 'idx_tasks_pipeline_stage_id' AND NOT i.indisvalid;")
if [ "$STALE" = "1" ]; then
    echo "   ⚠️  Found INVALID index; dropping before re-creating."
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP INDEX CONCURRENTLY IF EXISTS idx_tasks_pipeline_stage_id;"
else
    echo "   ✓ No stale index."
fi

# Create the index.
echo "🔒 Creating idx_tasks_pipeline_stage_id (partial JSONB expression, CONCURRENTLY)..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_pipeline_stage_id ON tasks ((metadata->>'pipelineStageId')) WHERE type = 'PIPELINE';"

# Post-create verification (dev-ops I-1 regex fix + event-system N1 from L3):
# - name exists
# - indisvalid = true (CONCURRENTLY can fail mid-build and leave an invalid index)
# - indexdef contains `WHERE (type = ...)` — catches the catastrophic case where
#   the partial predicate got stripped and we created a full-table JSONB
#   extraction index instead
echo "📋 Verifying (name, indisvalid, WHERE clause)..."
VERIFY=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -F'|' -c "
    SELECT c.relname, i.indisvalid, pg_get_indexdef(i.indexrelid)
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'idx_tasks_pipeline_stage_id';
")
if [ -z "$VERIFY" ]; then
    echo "❌ ABORT: index not found after create."
    exit 3
fi
echo "   Result: $VERIFY"
echo "$VERIFY" | awk -F'|' '
    $2 != "t" { print "❌ ABORT: indisvalid is not true"; exit 4 }
    $3 !~ /WHERE \(type = / { print "❌ ABORT: indexdef does not contain the WHERE (type = ...) predicate — would be a full JSONB extraction index, not partial"; exit 5 }
    { print "   ✓ Index is valid AND partial (WHERE clause present)." }
'

# O3 — Optional ANALYZE tasks post-create (database-manager N-1). Cheap at
# 358 rows; helps the planner commit to the new plan immediately instead of
# waiting for autovacuum's next stats update.
echo "📊 Refreshing tasks planner stats..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "ANALYZE tasks;"

echo "✅ A6 index ready — finished $(date -Iseconds)"
