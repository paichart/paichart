#!/usr/bin/env bash
# WI-B10 (2026-10-23, design §9.1 J) — POSITIVE CONTROL for MI-13's registrant-declaration lines.
#
# WHY: no customer service has declared files yet, so every registrant 🔴 reads 0 on the corpus — and a 0 from a line that cannot
# fire is unmeasured. This runs the subsection's OWN SQL (extracted from report-mechanism-inventory.sh, unchanged) against
# SYNTHETIC rows in TEMP tables that SHADOW the real ones (pg_temp is searched first), on the LOCAL database, in a session that
# writes nothing permanent. Each 🔴 gets exactly one planted hit; the expected values below are the control.
# Label contract (LL-T-41): lines are matched on a PREFIX; renaming a line in the inventory must update this file in the same commit.
#
# Usage: scripts/check-mi13-wib10-control.sh    (reads DATABASE_URL from .env; LOCAL only — refuses a non-localhost URL)
set -euo pipefail
cd "$(dirname "$0")/.."
URL=$(grep -E '^DATABASE_URL' .env | sed -E 's/^DATABASE_URL="?([^"?]*).*/\1/')
case "$URL" in *@localhost*|*@127.0.0.1*) ;; *) echo "refusing: not a localhost DATABASE_URL"; exit 2 ;; esac

INV=scripts/report-mechanism-inventory.sh
SQLALL=$(awk '/^SQL=\$\(cat <<'"'"'SQL'"'"'/{f=1;next} f&&/^SQL$/{exit} f' "$INV")
SECTION=$(awk '/^-- WI-B10 \(2026-10-23, design §9.1 J\)/{f=1} f{print} f&&/^\\endif/{exit}' <<<"$SQLALL")
[ -n "$SECTION" ] || { echo "could not extract the WI-B10 subsection"; exit 2; }

A='a'; SHA_OK=$(printf 'a%.0s' $(seq 1 64)); SHA_MISSING=$(printf 'b%.0s' $(seq 1 64)); SHA_PIN=$(printf 'c%.0s' $(seq 1 64))
OUT=$(psql "$URL" -X -q -v ON_ERROR_STOP=1 <<SQL
SET client_min_messages = warning;
CREATE TEMP TABLE held_file_refs (id text, kind text, "executionId" text, "sourceTool" text, "declaredBy" text, "serviceId" text,
  "declarationSha256" text);
CREATE TEMP TABLE held_capture_refusals (id text, "executionId" text, refusal text, "declaredBy" text, "declarationSha256" text);
CREATE TEMP TABLE held_declarations (sha256 text, "heldFiles" jsonb, "grammarVersion" int);
CREATE TEMP TABLE mcp_tools (id text, name text, "heldFiles" jsonb, "heldFilesSha256" text, "declarationSource" text);

INSERT INTO held_declarations VALUES
 ('$SHA_OK',  '{"files":[{"tool":"fetch_data","select":"a.*.b"}],"notAFile":[]}', 1),
 ('$SHA_PIN', '{"files":[{"tool":"get_file_contents","select":"c","gitPin":{"owner":"PaiChart","repo":"paichart-lab-configs"}}],"notAFile":[]}', 1);
INSERT INTO mcp_tools VALUES
 ('t1','acme-devices','{"files":[],"notAFile":[]}','$SHA_OK','fetched'),
 ('t2','observability-readonly','{"files":[],"notAFile":[]}','$SHA_OK','direct'),     -- F(a) hit
 ('t3','acme-orphan','{"files":[],"notAFile":[]}','$SHA_MISSING','direct');          -- row without a snapshot hit
INSERT INTO held_file_refs VALUES
 ('r1','CAPTURE','e1','fetch_data','registrant','t1','$SHA_OK'),          -- clean (control)
 ('r2','CAPTURE','e1','fetch_data','registrant','t1',NULL),               -- registrant without sha
 ('r3','CAPTURE','e1','get_otel_config','platform-default','x','$SHA_OK'),-- non-registrant with sha
 ('r4','CAPTURE','e1','fetch_data','registrant','t1','$SHA_MISSING'),     -- snapshot missing
 ('r5','CAPTURE','e1','show_commands','registrant','t1','$SHA_OK');       -- tool not in its snapshot
INSERT INTO held_capture_refusals VALUES ('f1','e1','declaration-unavailable','registrant','$SHA_MISSING');
$SECTION
SQL
)
fail=0
expect() { # prefix value
  local got; got=$(grep -F "$1" <<<"$OUT" | head -1 | awk -F'|' '{gsub(/^ +| +$/,"",$2); print $2}')
  if [ "$got" = "$2" ]; then echo "  ✅ $1 = $2"; else echo "  ❌ $1 expected $2, got '${got}'"; fail=1; fi
}
expect '⚪ mcp_tools rows carrying a held-file declaration' '1 / 2'
expect '⚪ held_declarations snapshots' '2'
expect '⚪ registrant CAPTURE refs' '4 / 2 / 1'   # count(DISTINCT) ignores the planted NULL sha
expect '🔴 a registrant CAPTURE ref without a declarationSha256' '1'
expect '🔴 a non-registrant held row carrying a declarationSha256' '1'
expect '🔴 a registrant CAPTURE whose declaration snapshot is missing' '1'
expect '🔴 a registrant CAPTURE on a tool its own snapshot does not declare' '1'
expect '🔴 a stored declaration whose gitPin equals a platform pin' '1'
expect '🔴 an mcp_tools declaration on a platform-default service name' '1'
expect '🔴 an mcp_tools row whose heldFilesSha256 has no snapshot' '1'
if [ "$fail" = 0 ]; then echo "✅ MI-13 WI-B10 control: every planted hit fired"; else echo "❌ MI-13 WI-B10 control FAILED"; exit 1; fi
