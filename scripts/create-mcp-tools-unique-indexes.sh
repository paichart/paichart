#!/bin/bash
# 2026-10-14 — DB-level uniqueness for MCP service registrations (register REGISTRATION-UNIQUENESS-TOCTOU,
# follow-up cline_docs/follow-ups/registration-uniqueness-toctou-2026-09-22.md).
#
# registry(action:'register') checked name and endpoint uniqueness by READ-then-WRITE
# (service-registration-handler.js), and the database enforced neither, so two concurrent self-provisions of the
# same descriptor could both pass the check and both write. These two unique indexes make the claim true; the
# handlers keep the read as the fast path for the message and map a lost race (Prisma P2002) to the SAME error.
#
#   mcp_tools_name_key      UNIQUE (name)                       — the exact index Prisma creates for
#                                                                 `name String @unique`; pre-creating it lets the
#                                                                 deploy's PLAIN `db push` read "already in sync"
#                                                                 (adding @unique is otherwise a data-loss WARNING
#                                                                 and the plain push refuses — tested 2026-10-14).
#   mcp_tools_endpoint_key  UNIQUE ((configuration->>'endpoint')) — a JSONB expression index Prisma cannot express
#                                                                 (the sanctioned db-push exception). NULL endpoints
#                                                                 (internal services without one) do not collide.
#
# Idempotent: duplicate pre-check, INVALID-index self-heal, CREATE ... CONCURRENTLY IF NOT EXISTS, post-verify.
# Run by scripts/apply-raw-sql-indexes.sh on every deploy (after db push) and standalone:
#   source .env.production && bash scripts/create-mcp-tools-unique-indexes.sh
# Pattern: .claude/knowledge/patterns/sanctioned-db-push-exception-ops-script-pattern.md

set -euo pipefail

echo "🚀 mcp_tools unique indexes — starting $(date -Iseconds)"

if [ -z "${DATABASE_URL:-}" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable not set"
    exit 1
fi
# Standalone runs: strip Prisma-only query parameters psql rejects (the wrapper already does this).
DATABASE_URL=$(printf '%s' "$DATABASE_URL" | sed -E 's/([?&])(pgbouncer|connection_limit|pool_timeout|schema|socket_timeout|statement_cache_size|pgbouncer_mode)=[^&]*//g; s/^([^?]*)&/\1?/; s/[?&]$//')

q() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -c "$1"; }

# Runs BEFORE `db push` (deploy + db:seed) so an EXISTING install's plain push reads "in sync" instead of refusing the
# @unique data-loss warning (database-manager S1). On a FRESH database the table does not exist yet: skip, and the push
# creates mcp_tools_name_key itself; the post-push run (apply-raw-sql-indexes.sh) then adds the endpoint index.
if [ "$(q "SELECT to_regclass('public.mcp_tools') IS NULL;")" = "t" ]; then
    echo "   ⏭️  mcp_tools does not exist yet (fresh database) — skipping; db push creates the name index, the post-push run adds the endpoint index."
    exit 0
fi

# Pre-check: a duplicate makes CREATE UNIQUE INDEX fail partway; abort here with the rows named instead.
echo "🔍 Pre-check: duplicate names / endpoints?"
DUP_NAMES=$(q "SELECT count(*) FROM (SELECT name FROM mcp_tools GROUP BY name HAVING count(*) > 1) d;")
DUP_EPS=$(q "SELECT count(*) FROM (SELECT configuration->>'endpoint' FROM mcp_tools WHERE configuration->>'endpoint' IS NOT NULL GROUP BY 1 HAVING count(*) > 1) d;")
if [ "$DUP_NAMES" != "0" ] || [ "$DUP_EPS" != "0" ]; then
    echo "❌ ABORT: $DUP_NAMES duplicate name(s), $DUP_EPS duplicate endpoint(s). Resolve by hand before creating the indexes."
    echo "   SELECT name, count(*) FROM mcp_tools GROUP BY name HAVING count(*) > 1;"
    echo "   SELECT configuration->>'endpoint', count(*) FROM mcp_tools WHERE configuration->>'endpoint' IS NOT NULL GROUP BY 1 HAVING count(*) > 1;"
    exit 2
fi
echo "   ✓ No duplicates."

ensure_index() {
    local name="$1" ddl="$2"
    if [ "$(q "SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = '$name' AND NOT i.indisvalid;")" = "1" ]; then
        echo "   ⚠️  $name exists but is INVALID (a prior failed CONCURRENTLY build); dropping before re-creating."
        q "DROP INDEX CONCURRENTLY IF EXISTS \"$name\";" >/dev/null
    fi
    echo "🔒 $name"
    q "$ddl" >/dev/null
}

ensure_index mcp_tools_name_key \
    "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS \"mcp_tools_name_key\" ON \"mcp_tools\" (\"name\");"
ensure_index mcp_tools_endpoint_key \
    "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS \"mcp_tools_endpoint_key\" ON \"mcp_tools\" ((\"configuration\" ->> 'endpoint'));"

# Post-verify: both present, VALID, UNIQUE, on the expected column/expression. A same-named index of the wrong
# shape (e.g. non-unique) would silently leave the race open, so the definition is asserted, not just the name.
# (bool || text renders 'true'/'false', not 't'/'f' — compare against 'true'.)
echo "📋 Verifying (valid, unique, definition)..."
VERIFY=$(q "SELECT c.relname || '|' || i.indisvalid || '|' || i.indisunique || '|' || pg_get_indexdef(i.indexrelid)
            FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
            WHERE c.relname IN ('mcp_tools_name_key', 'mcp_tools_endpoint_key') ORDER BY 1;")
echo "$VERIFY" | sed 's/^/   /'
echo "$VERIFY" | awk -F'|' '
    BEGIN { n = 0 }
    { n++ }
    $2 != "true" { print "❌ ABORT: " $1 " is not valid"; bad = 1 }
    $3 != "true" { print "❌ ABORT: " $1 " is not UNIQUE"; bad = 1 }
    $1 == "mcp_tools_name_key"     && $4 !~ /\(name\)/                       { print "❌ ABORT: mcp_tools_name_key is not on (name)"; bad = 1 }
    $1 == "mcp_tools_endpoint_key" && $4 !~ /configuration ->> .endpoint./  { print "❌ ABORT: mcp_tools_endpoint_key is not on configuration->>endpoint"; bad = 1 }
    $4 ~ / WHERE /                                                           { print "❌ ABORT: " $1 " is a PARTIAL index — uniqueness would hold only for part of the table"; bad = 1 }
    END { if (n != 2) { print "❌ ABORT: expected 2 indexes, found " n; bad = 1 } if (bad) exit 3; print "   ✓ Both indexes valid, unique, on the expected keys." }
'

echo "✅ mcp_tools unique indexes ready — finished $(date -Iseconds)"
