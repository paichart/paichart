#!/bin/bash
# Apply ALL sanctioned raw-SQL schema constructs (partial / expression indexes that Prisma
# cannot express and `db push` therefore never creates).
#
# WHY THIS EXISTS: schema.prisma is the single source of truth for columns/tables (`db push`),
# but partial UNIQUE indexes, partial indexes, and JSONB-expression indexes live outside it in
# per-construct ops scripts (the "sanctioned db-push exception"). Historically each was applied
# by hand over SSH after deploy — a latent gap: a fresh server built from the repo, or a deploy
# where someone forgot, silently lacks them. One of them (idx_agent_executions_active_per_task)
# is CORRECTNESS-bearing (the "one active execution per task" race guard), so a missing index is
# not merely a performance regression.
#
# This wrapper makes them deterministic: every member script is idempotent
# (CREATE INDEX CONCURRENTLY IF NOT EXISTS + invalid-index self-heal), so running the whole set
# on every deploy AND on a fresh provision is safe and a no-op when already present. Called from
# .github/workflows/production-deploy.yml right after `prisma db push`, and runnable standalone:
#   source .env.production && bash scripts/apply-raw-sql-indexes.sh
#
# FAIL-LOUD: if any member fails (e.g. the active-unique script aborts on genuinely duplicate
# active executions), this exits non-zero so the deploy stops — a silently-skipped schema
# construct is exactly the drift this closes.
#
# Pattern: .claude/knowledge/patterns/database-drift-elimination-pattern.md
# Adding a new raw-SQL index: create scripts/create-<name>-index.sh (idempotent, ON_ERROR_STOP),
# then add its basename to INDEX_SCRIPTS below.

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
    echo "❌ ERROR: DATABASE_URL not set — source .env.production (or the deploy env) first."
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The sanctioned raw-SQL index set (order-independent; each is self-contained + idempotent).
# ONLY genuine db-push exceptions belong here: partial UNIQUE, partial, and JSONB-expression
# indexes Prisma cannot express. Plain composite B-tree indexes must be @@index in schema.prisma
# (created by db push) — do NOT add them here.
# EXCLUDED: scripts/create-production-indices.sh (Oct 2025) — its 10 plain composite indexes were
# migrated into schema.prisma as @@index (verified 2026-07-04: all present with the same "P0 Fix
# Issue #5" provenance), so db push creates them and the script is dead. Candidate for retirement.
INDEX_SCRIPTS=(
    "create-agent-execution-active-unique-index.sh"   # correctness: one active execution per task
    "create-authoritative-execution-index.sh"          # perf: keep-best authoritative selector
    "create-tasks-pipeline-stage-jsonb-index.sh"       # perf: pipeline child-stage lookup
)

echo "🗂️  Applying ${#INDEX_SCRIPTS[@]} raw-SQL index script(s) — $(date -Iseconds)"

for name in "${INDEX_SCRIPTS[@]}"; do
    path="$SCRIPT_DIR/$name"
    if [ ! -f "$path" ]; then
        echo "❌ ERROR: expected index script missing: $name"
        exit 1
    fi
    echo "── $name"
    bash "$path"
done

echo "✅ All raw-SQL indexes ensured — $(date -Iseconds)"
