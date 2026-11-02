#!/usr/bin/env bash
# INTERNAL-FIT IF-3 (2026-10-24) — POSITIVE CONTROL for MI-13's shared-eligibility lines.
#
# WHY: no grant exists yet, so every IF-3 🔴 reads 0 on the corpus — and a 0 from a line that cannot fire is unmeasured. This runs
# the block's OWN SQL (extracted from report-mechanism-inventory.sh, unchanged) against SYNTHETIC rows in TEMP tables that SHADOW
# the real ones (pg_temp is searched first), on the LOCAL database, in a session that writes nothing permanent. Each 🔴 gets
# exactly one planted hit; the expected values below are the control. Label contract (LL-T-41): lines are matched on a PREFIX;
# renaming a line in the inventory must update this file in the same commit.
#
# Usage: scripts/check-mi13-if3-control.sh    (reads DATABASE_URL from .env; LOCAL only — refuses a non-localhost URL)
set -euo pipefail
cd "$(dirname "$0")/.."
URL=$(grep -E '^DATABASE_URL' .env | sed -E 's/^DATABASE_URL="?([^"?]*).*/\1/')
case "$URL" in *@localhost*|*@127.0.0.1*) ;; *) echo "refusing: not a localhost DATABASE_URL"; exit 2 ;; esac

INV=scripts/report-mechanism-inventory.sh
SQLALL=$(awk '/^SQL=\$\(cat <<'"'"'SQL'"'"'/{f=1;next} f&&/^SQL$/{exit} f' "$INV")
SECTION=$(awk '/^-- INTERNAL-FIT IF-3 \(2026-10-24\): shared held eligibility/{f=1} f{print} f&&/^\\endif/{exit}' <<<"$SQLALL")
[ -n "$SECTION" ] || { echo "could not extract the IF-3 block"; exit 2; }

P1='cmpovaaaaaaaaaaaaaaaaaaaaa1'; P2='cmpovbbbbbbbbbbbbbbbbbbbbb2'
OUT=$(psql "$URL" -X -q -v ON_ERROR_STOP=1 <<SQL
SET client_min_messages = warning;
CREATE TEMP TABLE held_file_refs (id text, kind text, "executionId" text, eligibility text, "grantPovId" text, "serviceId" text);
CREATE TEMP TABLE held_capture_refusals (id text, "executionId" text, refusal text, eligibility text, "grantPovId" text, "serviceId" text);
CREATE TEMP TABLE mcp_tools (id text, name text, configuration jsonb, "heldGrantPovIds" text[]);
CREATE TEMP TABLE agent_executions (id text, "taskId" text);
CREATE TEMP TABLE tasks (id text, pov_id text);
CREATE TEMP TABLE "POV" (id text, "ownerId" text, "teamId" text);
CREATE TEMP TABLE "TeamMember" ("teamId" text, "userId" text);

INSERT INTO agent_executions VALUES ('e1','t1');
INSERT INTO tasks VALUES ('t1','$P1');
INSERT INTO "POV" VALUES ('$P1','someone','team1'), ('$P2','someone','team2');
INSERT INTO "TeamMember" VALUES ('team1','owner1');                                  -- owner1 is on P1's team, NOT on P2's
INSERT INTO mcp_tools VALUES ('s1','acme','{"ownerId":"owner1"}','{$P1,$P2}');        -- one grant entry naming a POV owner1 left (control)
INSERT INTO mcp_tools VALUES ('sp','github-service','{}','{}');                          -- an OWNERLESS (platform) row (HELD-CAPTURE-COMPARE-ELIGIBILITY)
INSERT INTO held_file_refs VALUES
 ('r1','CAPTURE','e1','granted','$P1'),       -- clean granted (control)
 ('r2','CAPTURE','e1','granted',NULL),        -- granted without a grantPovId
 ('r3','CAPTURE','e1','own','$P1'),           -- grantPovId on a non-granted row (other direction)
 ('r4','CAPTURE','e1','admin',NULL),          -- outside the closed set
 ('r5','BASE','e1','own',NULL),               -- eligibility on a BASE row
 ('r6','CAPTURE','e1','granted','$P2'),       -- grantPovId is not the execution's task POV
 ('r7','CAPTURE','e1','install',NULL);        -- install-wide on hosted
INSERT INTO held_file_refs VALUES
 ('r8','CAPTURE','e1','own',NULL,'sp'),       -- 'own' on an ownerless row
 ('r9','CAPTURE','e1','platform',NULL,'sp'),  -- 'platform' on an ownerless row (control)
 ('r10','CAPTURE','e1','own',NULL,'s1');      -- 'own' on an OWNED row (control)
INSERT INTO held_capture_refusals VALUES ('f1','e1','declaration-unavailable','granted','$P1');   -- clean (control)
INSERT INTO held_capture_refusals VALUES ('f2','e1','source-not-pinned','own',NULL,'sp');           -- 'own' on an ownerless row
$SECTION
SQL
)
fail=0
expect() { # prefix value
  local got; got=$(grep -F "$1" <<<"$OUT" | head -1 | awk -F'|' '{gsub(/^ +| +$/,"",$2); print $2}')
  if [ "$got" = "$2" ]; then echo "  ✅ $1 = $2"; else echo "  ❌ $1 expected $2, got '${got}'"; fail=1; fi
}
expect '⚪ mcp_tools rows carrying a POV grant list' '1 / 2'
expect '⚪ granted CAPTURE refs + refusals' '4'
expect '⚪ grant entries naming a POV the row owner is no longer a literal member of' '1'
expect '🔴 eligibility granted ⇔ grantPovId set, broken in either direction' '2'
expect '🔴 an eligibility outside the closed set' '1'
expect '🔴 a BASE / CANDIDATE ref carrying an eligibility or grantPovId' '1'
expect "🔴 a granted row whose grantPovId is not its execution's task POV" '1'
expect '🔴 an install-wide row on the HOSTED platform' '1'
expect '🔴 a CAPTURE ref/refusal on a row OWNERLESS NOW' '2'
expect '⚪ CAPTURE refs/refusals on a row ownerless now with a stored eligibility' '3'
if [ "$fail" = 0 ]; then echo "✅ MI-13 IF-3 control: every planted hit fired"; else echo "❌ MI-13 IF-3 control FAILED"; echo "$OUT" | head -40; exit 1; fi
