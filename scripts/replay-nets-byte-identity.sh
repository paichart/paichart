#!/bin/bash
# replay-nets-byte-identity.sh — prove a change to the mechanical nets moves NO existing fact on production.
#
# WHAT IT IS: a dry run. It runs the SHIPPING net registry (scripts/replay-nets.ts → the same MECHANICAL_NETS /
# buildNetContext / runNetsAtPoint the engine calls) against tasks that already exist in production, at two commits,
# and diffs what each would stamp and render. Nothing is stamped or written.
#
# WHAT IT PROVES: zero changed/removed lines ⇒ no existing leg or child gets a different fact, card line or
# disposition from the new code. Every ADDED line must be accounted for (pass --allow-added '<regex>').
# WHAT IT CANNOT PROVE: behaviour on a shape that does not exist in production yet (a new arm) — that is the
# fixtures' job and the first live run's.
#
# Population: every PIPELINE leg created since --since AND every child in those legs' stages (the nets run at two
# points: leg SYNTHESIZE and leaf persist — legs alone exercise only one). value-chain 2026-10-02: 2,196 tasks;
# batch 2a 2026-10-26: 3,087.
#
# OFFLINE SNAPSHOT (NETS-REPLAY-FAST-OFFLINE, 2026-10-26). Both passes read a LOCAL copy of the tables the nets read,
# never live production:
#   - the snapshot is dumped ONCE into --snapshot <dir> (must be OUTSIDE every git work tree: it is production data —
#     use the session scratchpad), then restored into a local scratch database `nets_replay_<id>` that is reused while
#     it carries the same snapshot id. No production access during the passes ⇒ no pipeline freeze, and the two passes
#     read identical inputs by construction (a run in flight can no longer spoil the comparison).
#   - TABLES: tasks · stages · task_dependencies · agent_executions · agent_artifacts · mcp_tools · agent_templates —
#     derived from the import closure of scripts/replay-nets.ts (every model / raw table it reaches) and the enrichments'
#     declared `Pick<Prisma.TransactionClient, …>` types. agent_templates is NOT in those: leg-reviewers.ts and
#     plan-spawn-carry.ts JOIN it through a relation FILTER (`where: { agentTemplate: { templateType } }`), which a
#     model-name derivation cannot see — the fail-loud check below found it on its first pass (95 errored statements;
#     the swallowed errors had already changed the base output). Relation filters count as reads. EXCLUDED COLUMNS: mcp_tools.credentials, mcp_tools.configuration (no
#     net reads them; secrets never leave production). Every OTHER table is dropped from the scratch database and the
#     excluded columns do not exist there, so a read the snapshot cannot serve ERRORS — it never reads as empty.
#   - FAIL LOUD: a pass whose database sessions hit ANY error (a missing table or column, a write) is a failed pass,
#     detected client-agnostically from Postgres's own per-database rollback counter (pg_stat_database.xact_rollback,
#     delta over the pass; an enrichment that swallows the error into a could-not-check fact cannot hide it). Add a
#     table the nets newly read to SNAP_TABLES below and take a fresh snapshot.
#   - re-use: a base pass is CACHED in <snapshot>/base-cache, keyed by base commit + its dirty state + the population
#     (sha256 of ids.txt) + snapshot id — a second change against the same base and snapshot runs only the new pass.
#
# SAFETY of the dump (read-only, enforced by Postgres, not by intent):
#   - the prod DATABASE_URL is fetched over ssh into THIS process's memory only — never written to a file, never put on
#     a command line (it reaches psql/pg_dump as PG* environment variables);
#   - an ssh tunnel to the prod host's local Postgres, closed on exit;
#   - the session is forced read-only (`default_transaction_read_only=on`), and a write is attempted FIRST and must be
#     refused, or the script aborts; the data is read in ONE `REPEATABLE READ READ ONLY` transaction (consistent across
#     tables); the schema by pg_dump --schema-only.
#   - the snapshot files are mode 600 in a mode-700 directory; the scratch database is ALTERed read-only after the load.
#
# Usage:
#   scripts/replay-nets-byte-identity.sh --base-tree <path-to-worktree-at-BASE-commit> --out <dir> --snapshot <dir>
#        [--since 2026-07-18] [--scope protocol=<name>|role=<agentRole>]... [--ids <file>] [--allow-added '<regex>']
#   --snapshot <dir>  an existing snapshot (has manifest.json) is REUSED; an empty/new dir gets a fresh dump. Take a fresh
#                     one for a release or health-run; the summary prints the snapshot's age.
#   --scope           routine changes only (releases and health-runs keep the full window): protocol=<p> keeps legs whose
#                     metadata.protocol is <p> (the stored form, e.g. network-provisioning-protocol) plus their stage
#                     children — legs with NO stored protocol (95 of 643 in the 2026-07-18 window) are never in a protocol
#                     scope; role=<r> keeps the window's tasks with agentRole <r>. Repeat to AND them.
#   --ids <file>      replay exactly these task ids (e.g. a stored run's ids.txt) instead of --since/--scope.
#   Make the base worktree with:  git worktree add <path> <BASE-SHA>   (the base pass runs THAT tree's code)
#   Local scratch DB admin URL: $NETS_REPLAY_LOCAL_PG, else the main checkout's .env DATABASE_URL (needs CREATEDB).
#   Remove a scratch database: dropdb nets_replay_<id> (its snapshot dir can restore it again).
#   RETENTION 24 h (NETS-REPLAY-SNAPSHOT-RETENTION): every run first calls scripts/replay-snapshot-gc.sh, which deletes
#   registered snapshot dirs, output dirs and nets_replay_* databases whose snapshot is older than 24 h; then it registers
#   this run's --snapshot and --out dirs (out marker: .nets-replay-out.json) and holds a shared lock for the run, so the
#   hourly timer never deletes under a running pass. Timer install/uninstall: that script's header.
#
# Runtime: a pass over the snapshot takes minutes (measured in cline_docs/reviews/nets-replay-fast-offline-2026-10-26/
#   BUILD.md); the old live passes were ~60-65 min per ~2,300 tasks — latency per query to production, NOT process
#   start-up (xargs already ran ONE ts-node process per pass). --start-at / --base-start-at are retired (no pass is long
#   enough to need a resume).
# ⚠️ Learned 2026-10-02: build the read-only option with encodeURIComponent — URLSearchParams encodes a space as '+',
#   and Postgres then rejects the option name.
set -u
PROD=<PROD_USER>@<PROD_HOST>
SNAP_TABLES="tasks stages task_dependencies agent_executions agent_artifacts mcp_tools agent_templates"
EXCLUDED_COLUMNS="mcp_tools.credentials mcp_tools.configuration"
BASE_TREE=""; OUT=""; SNAP=""; SINCE="2026-07-18"; ALLOW='does not apply at leaf-persist'; IDS_IN=""; SCOPES=()
while [ $# -gt 0 ]; do case "$1" in
  --base-tree) BASE_TREE="$2"; shift 2;; --out) OUT="$2"; shift 2;; --since) SINCE="$2"; shift 2;;
  --snapshot) SNAP="$2"; shift 2;; --scope) SCOPES+=("$2"); shift 2;; --ids) IDS_IN="$2"; shift 2;;
  --allow-added) ALLOW="$2"; shift 2;;
  --start-at|--base-start-at) echo "$1 is retired: passes run over a local snapshot and take minutes — re-run the pass"; exit 2;;
  *) echo "unknown arg $1"; exit 2;; esac; done
[ -n "$BASE_TREE" ] && [ -n "$OUT" ] && [ -n "$SNAP" ] || { echo "need --base-tree, --out and --snapshot"; exit 2; }
[[ "$SINCE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}([ T][0-9:.]+)?$ ]] || { echo "--since must be a date/timestamp"; exit 2; }
GC="$(cd "$(dirname "$0")" && pwd)/replay-snapshot-gc.sh"   # 24 h retention: expire FIRST (covers a machine that was off)
"$GC" || { echo "✗ snapshot retention clean-up failed (above) — resolve it before replaying"; exit 1; }
NEW_TREE="$(cd "$(dirname "$0")/.." && pwd)"; BASE_TREE="$(cd "$BASE_TREE" && pwd)"
mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"   # ABSOLUTE: pass() cd's into a tree (EF-P2-2)
umask 077; mkdir -p "$SNAP"; SNAP="$(cd "$SNAP" && pwd)"; chmod 700 "$SNAP"
if git -C "$SNAP" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "✗ ABORT: --snapshot $SNAP is inside a git work tree — it holds production data; use the scratchpad"; exit 2
fi
{ "$GC" --register snapshot "$SNAP" && "$GC" --register out "$OUT"; } || { echo "✗ could not register for retention"; exit 1; }
exec 9>>"$("$GC" --state-dir)/run.lock"; flock -s -w 600 9 || { echo "✗ could not take the replay run lock"; exit 1; }
: > "$OUT/logs.txt"

# ── local scratch database admin URL (never production) ─────────────────────────────────────────────────────────────
LOCAL_ADMIN="${NETS_REPLAY_LOCAL_PG:-}"
if [ -z "$LOCAL_ADMIN" ]; then
  MAIN_CHECKOUT="$(cd "$(git -C "$NEW_TREE" rev-parse --git-common-dir)/.." && pwd)"
  for envf in "$NEW_TREE/.env" "$MAIN_CHECKOUT/.env"; do
    [ -f "$envf" ] && LOCAL_ADMIN=$(grep -E '^DATABASE_URL=' "$envf" | head -1 | cut -d= -f2- | tr -d '"'"'") && break
  done
fi
[ -n "$LOCAL_ADMIN" ] || { echo "✗ no local Postgres URL: set NETS_REPLAY_LOCAL_PG"; exit 2; }
case "$LOCAL_ADMIN" in *localhost*|*127.0.0.1*) ;; *) echo "✗ ABORT: the scratch database must be local (got a non-local host)"; exit 2;; esac
# local_url <db> [extra-query] — the admin URL with another database name and no query string
local_url() { node -e 'const u=new URL(process.argv[1]); u.pathname="/"+process.argv[2]; u.search=process.argv[3]||""; console.log(u.toString())' "$LOCAL_ADMIN" "$1" "${2:-}"; }
LOCAL_ADMIN_DB=$(local_url postgres)

# ── take the snapshot (once) ─────────────────────────────────────────────────────────────────────────────────────────
take_snapshot() {
  echo "taking a fresh snapshot into $SNAP $(date +%T)"
  local RAW; RAW=$(ssh "$PROD" 'cd /var/www/paichart-app/current && set -a && source .env.production && set +a && printf %s "$DATABASE_URL"')
  [ -n "$RAW" ] || { echo "✗ could not read the production URL"; exit 1; }
  local PORT=$((20000 + RANDOM % 20000))
  ssh -N -o ExitOnForwardFailure=yes -L "$PORT:localhost:5432" "$PROD" 9>&- & TPID=$!
  trap 'kill $TPID 2>/dev/null' EXIT
  sleep 3; kill -0 $TPID 2>/dev/null || { echo "✗ ssh tunnel on port $PORT failed"; exit 1; }
  # The URL becomes PG* variables of THIS shell (memory), never argv or a file. Read-only is forced per session.
  eval "$(node - "$RAW" "$PORT" <<'JS'
const u = new URL(process.argv[2]); const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
const v = { PGHOST: 'localhost', PGPORT: process.argv[3], PGUSER: decodeURIComponent(u.username),
  PGPASSWORD: decodeURIComponent(u.password), PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
  PGOPTIONS: '-c default_transaction_read_only=on' };
const ssl = u.searchParams.get('sslmode'); if (ssl) v.PGSSLMODE = ssl;
for (const [k, x] of Object.entries(v)) console.log(`export ${k}=${q(x)}`);
JS
)"
  unset RAW
  local probe; probe=$(psql -At -c "CREATE TEMP TABLE _ro_probe(x int);" 2>&1 | head -1)
  case "$probe" in *"read-only transaction"*) echo "✓ read-only enforced: $probe";; *) echo "✗ ABORT: write probe was not refused: $probe"; exit 1;; esac
  local inflight; inflight=$(psql -At -c "SELECT count(*) FROM agent_executions WHERE status IN ('RUNNING','PENDING','QUEUED');")
  echo "in-flight executions at the dump: $inflight (recorded; both passes read the same snapshot either way)"
  pg_dump --schema-only -Fc -f "$SNAP/schema.dump" || { echo "✗ pg_dump --schema-only failed"; exit 1; }
  # Column lists (production order, minus the excluded ones), then ONE consistent read-only transaction for every table.
  local script="$SNAP/.copy.sql"; : > "$script"
  echo "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;" >> "$script"
  echo "\\copy (SELECT now() AT TIME ZONE 'UTC', (SELECT max(\"updatedAt\") FROM agent_executions), (SELECT max(\"createdAt\") FROM agent_artifacts), (SELECT max(updated_at) FROM tasks), $inflight) TO '$SNAP/watermarks.copy'" >> "$script"
  local t cols
  for t in $SNAP_TABLES; do
    cols=$(psql -At -c "SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position) FROM information_schema.columns
                        WHERE table_schema='public' AND table_name='$t'
                          AND '$t.' || column_name <> ALL (string_to_array('$EXCLUDED_COLUMNS', ' '));")
    [ -n "$cols" ] || { echo "✗ table $t not found in production"; exit 1; }
    printf '%s\n' "$cols" > "$SNAP/$t.columns"
    echo "\\copy (SELECT $cols FROM public.$t) TO '$SNAP/$t.copy'" >> "$script"
  done
  echo "COMMIT;" >> "$script"
  psql -v ON_ERROR_STOP=1 -q -f "$script" || { echo "✗ data dump failed"; exit 1; }
  rm -f "$script"
  kill $TPID 2>/dev/null; trap - EXIT
  unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGOPTIONS PGSSLMODE
  # manifest: id = UTC time + the first 10 hex of a hash over every data file
  node - "$SNAP" "$SNAP_TABLES" "$EXCLUDED_COLUMNS" <<'JS' || exit 1
const fs = require('fs'), crypto = require('crypto'), path = require('path');
const [dir, tables, excluded] = process.argv.slice(2);
const all = crypto.createHash('sha256'); const t = {};
for (const name of tables.split(' ')) {
  const buf = fs.readFileSync(path.join(dir, name + '.copy'));
  const sha = crypto.createHash('sha256').update(buf).digest('hex'); all.update(name + sha);
  let rows = 0; for (const b of buf) if (b === 10) rows++;
  t[name] = { rows, sha256: sha, columns: fs.readFileSync(path.join(dir, name + '.columns'), 'utf8').trim().split(',') };
}
const [takenAt, maxExecUpdatedAt, maxArtifactCreatedAt, maxTaskUpdatedAt, inflight] = fs.readFileSync(path.join(dir, 'watermarks.copy'), 'utf8').trim().split('\t');
const stamp = takenAt.replace(/[-:]/g, '').replace(' ', 'T').slice(0, 15) + 'Z';
const id = `${stamp}-${all.digest('hex').slice(0, 10)}`.toLowerCase();
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ id, takenAt, source: 'production (read-only)',
  watermarks: { maxExecUpdatedAt, maxArtifactCreatedAt, maxTaskUpdatedAt }, inflightAtDump: Number(inflight),
  excludedColumns: excluded.split(' '), tables: t }, null, 2) + '\n');
console.log(`snapshot ${id}: ` + Object.entries(t).map(([k, v]) => `${k} ${v.rows}`).join(' · '));
JS
  chmod 600 "$SNAP"/*
}
[ -s "$SNAP/manifest.json" ] || take_snapshot
SNAP_ID=$(node -e 'console.log(require(process.argv[1]).id)' "$SNAP/manifest.json")
DB="nets_replay_$(printf %s "$SNAP_ID" | tr -c 'a-z0-9\n' '_')"
LOCAL_DB=$(local_url "$DB")
# retention marker for --out (its age = this snapshot's age; scripts/replay-snapshot-gc.sh)
node -e 'const m=require(process.argv[1]); require("fs").writeFileSync(process.argv[2], JSON.stringify({kind:"nets-replay-out",
  snapshotId:m.id, snapshotTakenAt:m.takenAt, snapshotDir:process.argv[3], writtenAt:new Date().toISOString()})+"\n", {mode:0o600})' \
  "$SNAP/manifest.json" "$OUT/.nets-replay-out.json" "$SNAP" || exit 1
# The snapshot restores what it RECORDS it holds; a snapshot that lacks a table this script now requires (taken before the
# table joined SNAP_TABLES) is refused here, before any pass. Tables SNAP_TABLES itself misses are caught at run time.
SNAP_HAS=$(node -e 'console.log(Object.keys(require(process.argv[1]).tables).join(" "))' "$SNAP/manifest.json")
for t in $SNAP_TABLES; do
  case " $SNAP_HAS " in *" $t "*) ;; *) echo "✗ FAIL LOUD: snapshot $SNAP_ID has no table $t (it holds: $SNAP_HAS) — take a fresh snapshot"; exit 1;; esac
done

# ── restore the snapshot into the scratch database (reused while it carries the same snapshot id) ───────────────────
have=$(psql "$LOCAL_ADMIN_DB" -At -c "SELECT shobj_description(oid, 'pg_database') FROM pg_database WHERE datname='$DB';")
if [ "$have" != "$SNAP_ID" ]; then
  echo "restoring snapshot $SNAP_ID into local database $DB $(date +%T)"
  psql "$LOCAL_ADMIN_DB" -q -c "DROP DATABASE IF EXISTS \"$DB\";" -c "CREATE DATABASE \"$DB\";" || exit 1
  pg_restore --schema-only --no-owner --no-privileges --exit-on-error -d "$LOCAL_DB" "$SNAP/schema.dump" || { echo "✗ schema restore failed"; exit 1; }
  # Only the snapshot tables may exist: every other table is DROPPED (a read of it errors, never reads as empty), and so
  # are the excluded columns.
  keep=$(printf "'%s'," $SNAP_HAS); keep="${keep%,}"
  drops=$(psql "$LOCAL_DB" -At -c "SELECT string_agg(format('DROP TABLE public.%I CASCADE;', tablename), ' ') FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ($keep);")
  [ -n "$drops" ] && { PGOPTIONS='-c client_min_messages=warning' psql "$LOCAL_DB" -q -c "$drops" || exit 1; }
  for c in $(node -e 'console.log(require(process.argv[1]).excludedColumns.join(" "))' "$SNAP/manifest.json"); do psql "$LOCAL_DB" -q -c "ALTER TABLE public.${c%%.*} DROP COLUMN IF EXISTS \"${c#*.}\";" || exit 1; done
  load="$OUT/.load.sql"; echo "SET session_replication_role = replica;" > "$load"   # FK order is irrelevant to a copy
  for t in $SNAP_HAS; do
    [ "$(sha256sum < "$SNAP/$t.copy" | cut -c1-64)" = "$(node -e 'console.log(require(process.argv[1]).tables[process.argv[2]].sha256)' "$SNAP/manifest.json" "$t")" ] \
      || { echo "✗ $SNAP/$t.copy does not match its manifest sha256"; exit 1; }
    echo "\\copy public.$t ($(cat "$SNAP/$t.columns")) FROM '$SNAP/$t.copy'" >> "$load"; done
  psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -q -f "$load" || { echo "✗ data load failed"; exit 1; }; rm -f "$load"
  for t in $SNAP_HAS; do
    want=$(node -e 'console.log(require(process.argv[1]).tables[process.argv[2]].rows)' "$SNAP/manifest.json" "$t")
    got=$(psql "$LOCAL_DB" -At -c "SELECT count(*) FROM public.$t;")
    [ "$want" = "$got" ] || { echo "✗ $t: loaded $got rows, manifest says $want"; exit 1; }
  done
  psql "$LOCAL_DB" -q -c "ANALYZE;" || exit 1
  psql "$LOCAL_ADMIN_DB" -q -c "ALTER DATABASE \"$DB\" SET default_transaction_read_only = on;" -c "COMMENT ON DATABASE \"$DB\" IS '$SNAP_ID';" || exit 1
fi
probe=$(psql "$LOCAL_DB" -At -c "CREATE TEMP TABLE _ro_probe(x int);" 2>&1 | head -1)
case "$probe" in *"read-only transaction"*) ;; *) echo "✗ ABORT: the scratch database is not read-only: $probe"; exit 1;; esac
TAKEN=$(node -e 'const m=require(process.argv[1]); const h=(Date.now()-Date.parse(m.takenAt.replace(" ","T")+"Z"))/3.6e6; console.log(`${m.takenAt}Z (${h.toFixed(1)} h old; ${m.inflightAtDump} in flight at the dump)`)' "$SNAP/manifest.json")
echo "snapshot $SNAP_ID taken $TAKEN → local database $DB"

# ── population (from the snapshot, never production) ────────────────────────────────────────────────────────────────
if [ -n "$IDS_IN" ]; then
  grep -E '^c[a-z0-9]{24}$' "$IDS_IN" > "$OUT/ids.txt"
  [ "$(grep -c '' "$IDS_IN")" = "$(grep -c '' "$OUT/ids.txt")" ] || { echo "✗ --ids has lines that are not task ids"; exit 2; }
  missing=$(psql "$LOCAL_DB" -At -c "SELECT count(*) FROM unnest(string_to_array('$(paste -sd, "$OUT/ids.txt")', ',')) i WHERE NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = i);")
  [ "$missing" = 0 ] || { echo "✗ $missing --ids tasks are not in the snapshot"; exit 1; }
  POPDESC="--ids $IDS_IN"
else
  legf="TRUE"; taskf="TRUE"
  for s in "${SCOPES[@]+"${SCOPES[@]}"}"; do
    v="${s#*=}"; [[ "$v" =~ ^[A-Za-z0-9_.-]+$ ]] || { echo "--scope value must be [A-Za-z0-9_.-]"; exit 2; }
    case "$s" in protocol=*) legf="$legf AND metadata->>'protocol' = '$v'";; role=*) taskf="$taskf AND \"agentRole\" = '$v'";;
      *) echo "--scope must be protocol=<name> or role=<agentRole>"; exit 2;; esac
  done
  psql "$LOCAL_DB" -At -c "WITH legs AS (SELECT id, metadata->>'pipelineStageId' ps FROM tasks WHERE type='PIPELINE' AND created_at >= '$SINCE' AND $legf),
    pop AS (SELECT id FROM legs UNION SELECT c.id FROM tasks c JOIN legs l ON c.stage_id = l.ps)
    SELECT t.id FROM tasks t JOIN pop USING (id) WHERE $taskf ORDER BY 1;" > "$OUT/ids.txt"
  POPDESC="since $SINCE${SCOPES[*]+ scope ${SCOPES[*]}}"
fi
N=$(grep -c '' "$OUT/ids.txt"); echo "population: $N tasks ($POPDESC)"; [ "$N" -gt 0 ] || { echo "✗ empty population"; exit 1; }

# pass <tree> <report>. The REPORT is its own file, written synchronously by the preload (NEW tree's copy, so the base
# tree's older runner gets it too); stdout/stderr — pino, prisma — go to $OUT/logs.txt. NEVER filter a shared stdout with
# `grep -v '"level"'` again: node splits long lines across pipe writes (register REPLAY-STDOUT-INTERLEAVE, 2026-10-15).
# ONE process per pass (`-s` lifts xargs's 128 KiB batch to ~2 MB ≈ 75,000 ids). A pass FAILS when any of its database
# sessions hit an error: the scratch database's rollback counter must not move (the read-only probe above ran first).
PRELOAD="$NEW_TREE/scripts/replay-report-preload.js"
rollbacks() { sleep 1; psql "$LOCAL_ADMIN_DB" -At -c "SELECT xact_rollback FROM pg_stat_database WHERE datname='$DB';"; }
pass() {
  local r0 r1 t0=$SECONDS; : > "$2"; r0=$(rollbacks)
  (cd "$1" && DATABASE_URL="$LOCAL_DB?connection_limit=3" REPLAY_REPORT="$2" xargs -s 2000000 -a "$OUT/ids.txt" \
     npx ts-node --compiler-options '{"module":"commonjs"}' -r "$PRELOAD" scripts/replay-nets.ts >>"$OUT/logs.txt" 2>&1)
  r1=$(rollbacks)
  echo "  pass took $(( (SECONDS - t0) / 60 )) min $(( (SECONDS - t0) % 60 )) s"
  if [ "$r1" != "$r0" ]; then
    echo "❌ FAIL LOUD: $((r1 - r0)) database statement(s) ERRORED during the pass over snapshot $SNAP_ID — a read the snapshot"
    echo "   cannot serve (a table or column not in it) or a write. Nothing was compared. Read $OUT/logs.txt; add the table to"
    echo "   SNAP_TABLES and take a fresh snapshot."; exit 1
  fi
}
BLOCK='^c[a-z0-9]{24}  \['   # a block header is "<cuid>  [<TYPE>] …"; a §6 or card line can also start with "cm"
complete() { local got; got=$(grep -cE "$BLOCK" "$1" 2>/dev/null); [ "${got:-0}" = "$N" ]; }

BASE_SHA=$(git -C "$BASE_TREE" rev-parse HEAD); BASE_DIRTY=$(git -C "$BASE_TREE" status --porcelain | sha256sum | cut -c1-12)
KEY=$(printf '%s|%s|%s|%s' "$BASE_SHA" "$BASE_DIRTY" "$(sha256sum < "$OUT/ids.txt" | cut -c1-64)" "$SNAP_ID" | sha256sum | cut -c1-20)
CACHE="$SNAP/base-cache/$KEY.out"; mkdir -p "$SNAP/base-cache"
if complete "$CACHE"; then
  cp "$CACHE" "$OUT/base.out"; echo "base pass REUSED from cache (base ${BASE_SHA:0:9}, key $KEY)"
else
  echo "base pass ($BASE_TREE @ ${BASE_SHA:0:9}) $(date +%T)"; pass "$BASE_TREE" "$OUT/base.out"
  complete "$OUT/base.out" && cp "$OUT/base.out" "$CACHE" && chmod 600 "$CACHE"
fi
echo "new pass ($NEW_TREE @ $(git -C "$NEW_TREE" rev-parse --short HEAD)) $(date +%T)"; pass "$NEW_TREE" "$OUT/new.out"

# A pass that wrote fewer task blocks than ids is a crashed run, not a diff — and two EMPTY passes diff as "identical".
# FAIL, never warn (EF-P2-1/2).
for f in base new; do
  got=$(grep -cE "$BLOCK" "$OUT/$f.out" 2>/dev/null); got=${got:-0}
  [ "$got" = "$N" ] || { echo "❌ $f pass wrote $got of $N task blocks — read $OUT/logs.txt (nothing was compared)"; exit 1; }
done

echo "tasks: base $(grep -cE "$BLOCK" "$OUT/base.out") · new $(grep -cE "$BLOCK" "$OUT/new.out") · snapshot $SNAP_ID"
diff "$OUT/base.out" "$OUT/new.out" > "$OUT/replay.diff"
removed=$(grep -c '^<' "$OUT/replay.diff"); added=$(grep '^>' "$OUT/replay.diff" | grep -vc -- "$ALLOW"); allowed=$(grep '^>' "$OUT/replay.diff" | grep -c -- "$ALLOW")
leaf=$(grep -c 'point=leaf-persist' "$OUT/base.out")
echo "removed/changed: $removed · unexplained added: $added · allowed added: $allowed (leaf tasks: $leaf)"
[ "$removed" = 0 ] && [ "$added" = 0 ] && echo "✅ BYTE-IDENTICAL on every existing fact" || { echo "❌ DIFFERS — read $OUT/replay.diff"; exit 1; }
