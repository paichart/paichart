#!/bin/bash
# replay-held-variant.sh — PLATFORM-HELD-BYTES Stage B replays (plan v4.1 §3 V-0 / V-10, §5 exit item 1). Built 2026-10-15.
#
# WHAT: runs scripts/replay-held-variant.ts (nets + lean card + chainer JSON.stringify(entry) + §6 render, per task) over a
# NAMED production population at TWO trees — the BASE tree (STAGE-B-BASELINE.md: deployed commit 7d9b283b6) and the NEW
# tree (this checkout) — and diffs them. Then the POSITIVE CONTROLS: real observability legs replayed with the variant
# token stamped by the real stamp writer (`--control`), at the NEW tree, diffed against the same tasks replayed plainly.
#
# PASS (exit 0) = zero removed/changed lines on non-variant data, every added line matching --allow-added (the plan's only
# sanctioned addition is a `not stamped (not-variant-leg)` line, from V-5 on), AND each control's delta equal to the step's
# recorded expectation (scripts/fixtures/held-variant-control-expected.json, key --step). A control whose delta is EMPTY
# fails whatever the expectation: an inert control proves nothing.
#
# THE HARNESS RUNS THE NEW RUNNER AT BOTH TREES: the two runner files (replay-held-variant.ts, replay-nets.ts) are copied
# into the base worktree before its pass, so the comparison is "same printer, base lib vs new lib". The base worktree is
# throwaway (git worktree add <path> 7d9b283b6); the copies are never committed there.
#
# POPULATIONS (each printed with its count; ids.txt is their union, deduplicated):
#   P-LEGS   every PIPELINE leg created since --since + every child in those legs' stages (the nets byte-identity
#            population). Covers config_change_author rows (editApplication must stay ABSENT), Harvester rows (heldBytes
#            ABSENT) and leg rows from pipeline-index.json (the hoist ABSENT), and every dialectLint / applyBlockPlaceholder
#            / rollbackContainment stamp (byte-identical — EF S-V3-1).
#   P-HELD   every task whose execution owns a held_file_refs CAPTURE row (the obs Harvesters captured since
#            2026-10-14 03:00:00Z — the held population).
#   P-NOLEG  Harvester leaves (infra_state_harvester) whose stage carries no harnessTaskId (the positive non-variant case:
#            V-5a NOT_STAMPED).
#   CONTROL  --controls (default: the newest observability legs with an Author child, up to 2): replayed with the variant
#            token; contractPropagation on them must stay byte-identical (EF S-V3-2 — it scans briefs, not packages).
#
# SAFETY (read-only, enforced by Postgres): the prod URL lives only in this process; ssh tunnel closed on exit; the session is
# forced default_transaction_read_only=on and a write is attempted FIRST and must be refused; in-flight executions must be 0.
#
# Usage:
#   scripts/replay-held-variant.sh --base-tree <worktree@7d9b283b6> --out <dir> --step <V-n> [--since 2026-07-18]
#        [--allow-added '<regex>'] [--controls '<legId> <legId>'] [--ids '<id> <id>' (smoke: those ids only, no populations)]
#        [--phase base|new|controls|all (default all; a finished base.out is reused)] [--jobs N (default 4 parallel chunks)]
# Runtime: ~2,900 tasks, ~1 h per pass (this replay still reads LIVE production — the latency per query is the cost;
# replay-nets-byte-identity.sh moved to an offline snapshot on 2026-10-26, NETS-REPLAY-FAST-OFFLINE) plus the chain replay — run the phases as
# separate invocations when one would exceed a background time limit.
set -u
PROD=<PROD_USER>@<PROD_HOST>
BASE_TREE=""; OUT=""; STEP=""; SINCE="2026-07-18"; ALLOW='not stamped \(not-variant-leg\)'; CONTROLS=""; IDS=""; PHASE=all; JOBS=4
while [ $# -gt 0 ]; do case "$1" in
  --base-tree) BASE_TREE="$2"; shift 2;; --out) OUT="$2"; shift 2;; --step) STEP="$2"; shift 2;; --since) SINCE="$2"; shift 2;;
  --allow-added) ALLOW="$2"; shift 2;; --controls) CONTROLS="$2"; shift 2;; --ids) IDS="$2"; shift 2;; --phase) PHASE="$2"; shift 2;; --jobs) JOBS="$2"; shift 2;;
  *) echo "unknown arg $1"; exit 2;; esac; done
[ -n "$BASE_TREE" ] && [ -n "$OUT" ] && [ -n "$STEP" ] || { echo "need --base-tree, --out and --step"; exit 2; }
NEW_TREE="$(cd "$(dirname "$0")/.." && pwd)"; mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"
RUNNER_FILES="scripts/replay-held-variant.ts scripts/replay-nets.ts"

RAW=$(ssh "$PROD" 'cd /var/www/paichart-app/current && set -a && source .env.production && set +a && printf %s "$DATABASE_URL"')
ssh -N -o ExitOnForwardFailure=yes -L 15434:localhost:5432 "$PROD" & TPID=$!
trap 'kill $TPID 2>/dev/null' EXIT
sleep 3
URL=$(node -e 'const u=new URL(process.argv[1]); u.hostname="localhost"; u.port="15434"; const q=u.search?"&":"?"; console.log(u.toString()+q+"options="+encodeURIComponent("-c default_transaction_read_only=on"))' "$RAW")
unset RAW; export DATABASE_URL="$URL"
# Production posture for the surfaces replayed: R9 on (it rewrites chained text). Same value at both trees.
export CONNECTED_OUTPUT_SANITIZE_ENABLED=true PAICHART_APP_NAME=paichart-replay-held-variant

probe=$(psql "$URL" -At -c "CREATE TEMP TABLE _ro_probe(x int);" 2>&1 | head -1)
case "$probe" in *"read-only transaction"*) echo "✓ read-only enforced: $probe";; *) echo "✗ ABORT: write probe was not refused: $probe"; exit 1;; esac
inflight=$(psql "$URL" -At -c "SELECT count(*) FROM agent_executions WHERE status IN ('RUNNING','PENDING','QUEUED');")
echo "in-flight executions: $inflight (must be 0 for the two passes to read the same data)"; [ "$inflight" = 0 ] || exit 1

if [ -n "$IDS" ]; then
  printf '%s\n' $IDS > "$OUT/ids.txt"; echo "SMOKE population: $(wc -l < "$OUT/ids.txt") ids"
elif [ ! -s "$OUT/ids.txt" ]; then
  psql "$URL" -At -c "WITH legs AS (SELECT id, metadata->>'pipelineStageId' ps FROM tasks WHERE type='PIPELINE' AND created_at >= '$SINCE')
    SELECT id FROM legs UNION SELECT c.id FROM tasks c JOIN legs l ON c.stage_id = l.ps ORDER BY 1;" > "$OUT/p-legs.txt"
  psql "$URL" -At -c "SELECT DISTINCT e.\"taskId\" FROM held_file_refs r JOIN agent_executions e ON e.id = r.\"executionId\"
    WHERE r.kind = 'CAPTURE' ORDER BY 1;" > "$OUT/p-held.txt"
  psql "$URL" -At -c "SELECT t.id FROM tasks t LEFT JOIN stages s ON s.id = t.stage_id
    WHERE t.\"agentRole\" = 'infra_state_harvester' AND coalesce(s.metadata->>'harnessTaskId','') = '' ORDER BY 1;" > "$OUT/p-noleg.txt"
  sort -u "$OUT/p-legs.txt" "$OUT/p-held.txt" "$OUT/p-noleg.txt" > "$OUT/ids.txt"
fi
for p in legs held noleg; do [ -f "$OUT/p-$p.txt" ] && printf '  P-%-6s %s\n' "$(echo $p | tr a-z A-Z)" "$(wc -l < "$OUT/p-$p.txt")"; done
N=$(wc -l < "$OUT/ids.txt"); echo "population (union): $N tasks"

if [ -z "$CONTROLS" ]; then
  CONTROLS=$(psql "$URL" -At -c "SELECT l.id FROM tasks l WHERE l.type='PIPELINE' AND l.title LIKE '%(protocol: observability-config)%'
    AND EXISTS (SELECT 1 FROM tasks c WHERE c.stage_id = l.metadata->>'pipelineStageId' AND c.\"agentRole\"='config_change_author')
    ORDER BY l.created_at DESC LIMIT 2;" | tr '\n' ' ')
fi
echo "controls: $CONTROLS"; printf '%s\n' $CONTROLS > "$OUT/controls.txt"

run() { # <report-file> <tree> <args...>   — the REPORT is a file (see --report in the runner); stdout/stderr are logs
  # NEVER compare stdout filtered with `grep -v '"level"'`: pino and console.log share fd 1, node splits a long line across
  # pipe writes, a log line lands in the middle of a report line, and the filter deletes the WHOLE glued line (measured
  # 2026-10-15: half a §6 table row vanished from one control replay and read as a mover). replay-nets-byte-identity.sh
  # carries that pattern — register REPLAY-STDOUT-INTERLEAVE.
  local report="$1" tree="$2"; shift 2
  (cd "$tree" && npx ts-node --compiler-options '{"module":"commonjs"}' -r tsconfig-paths/register scripts/replay-held-variant.ts \
     --report "$report" "$@" >>"$OUT/logs.txt" 2>&1)
}
pass() { # <tree> <idsfile> <report>
  local tree="$1" ids="$2" report="$3"; local d="$OUT/.chunks.$(basename "$report")"
  rm -rf "$d"; mkdir -p "$d"
  # Batches of 50 ids per process (startup ~10 s each), JOBS of them at once (measured 2026-10-15: one stream ≈ 8 tasks/min
  # over the tunnel, ~6 h a pass). Each chunk reports to its OWN file; they are concatenated in chunk order, so the report is
  # byte-identical to a serial run. Every job is read-only (the session option rides DATABASE_URL).
  split -l 50 -d -a 4 "$ids" "$d/c."
  export -f run; export OUT
  ls "$d"/c.* | grep -v '\.out$' | xargs -P "$JOBS" -I{} bash -c 'run "{}.out" "$0" $(cat "{}")' "$tree"
  : > "$report"; for c in $(ls "$d"/c.* | grep -v '\.out$'); do cat "$c.out" >> "$report"; done
  local want got; want=$(wc -l < "$ids"); got=$(grep -cE "$BLOCK" "$report")
  rm -rf "$d"
  # FAIL, never warn (push-2 code review EF-P2-1): a short pass is a crashed chunk, and a base-only phase used to exit 0 on it.
  [ "$want" = "$got" ] || { echo "❌ pass wrote $got of $want task blocks (a chunk failed — read $OUT/logs.txt)"; return 1; }
}
# A block header is "<cuid>  [<TYPE>] …"; a §6 or card line can also start with "cm", so never count '^cm'.
BLOCK='^c[a-z0-9]{24}  \['

if [ "$PHASE" = all ] || [ "$PHASE" = base ]; then
  BASE_DONE=$(grep -cE "$BLOCK" "$OUT/base.out" 2>/dev/null); BASE_DONE=${BASE_DONE:-0}
  if [ "$BASE_DONE" != "$N" ]; then
    for f in $RUNNER_FILES; do cp "$NEW_TREE/$f" "$BASE_TREE/$f"; done
    echo "base pass ($BASE_TREE @ $(git -C "$BASE_TREE" rev-parse --short HEAD), runner copied in, transpile-only) $(date +%T)"
    # TRANSPILE-ONLY for the base pass only: the copied NEW runner may pass an argument the base lib does not declare (since V-5,
    # runNetsAtPoint's onNotStamped). The base lib ignores it at runtime — exactly what the base tree did when deployed; a
    # type-checked compile refuses it and the pass writes 0 blocks. Proven 2026-10-15: a transpile-only base at 7d9b283b6 is
    # byte-identical to V-0's type-checked base (2,834 tasks). NOTE: the copy leaves the base worktree's runner files replaced.
    TS_NODE_TRANSPILE_ONLY=true pass "$BASE_TREE" "$OUT/ids.txt" "$OUT/base.out" || exit 1
  else echo "base pass reused ($BASE_DONE tasks)"; fi
fi
if [ "$PHASE" = all ] || [ "$PHASE" = new ]; then
  echo "new pass ($NEW_TREE @ $(git -C "$NEW_TREE" rev-parse --short HEAD)) $(date +%T)"; pass "$NEW_TREE" "$OUT/ids.txt" "$OUT/new.out" || exit 1
fi
if [ "$PHASE" = all ] || [ "$PHASE" = controls ]; then
  for c in $CONTROLS; do
    echo "control $c $(date +%T)"
    stage=$(psql "$URL" -At -c "SELECT metadata->>'pipelineStageId' FROM tasks WHERE id='$c';")
    kids=$(psql "$URL" -At -c "SELECT id FROM tasks WHERE stage_id='$stage' ORDER BY id;" | tr '\n' ' ')
    : > "$OUT/control-$c.plain"; : > "$OUT/control-$c.variant"
    run "$OUT/control-$c.plain" "$NEW_TREE" $c $kids
    run "$OUT/control-$c.variant" "$NEW_TREE" --control "$c"
  done
fi

fail=0
if [ "$PHASE" = all ] || [ "$PHASE" = new ]; then
  # The compare is this run's verdict: a missing or empty pass is a FAILURE, never a skipped comparison (EF-P2-1).
  for f in base new; do [ -s "$OUT/$f.out" ] || { echo "❌ $OUT/$f.out is missing or empty — nothing compared"; exit 1; }; done
fi
if [ -s "$OUT/base.out" ] && [ -s "$OUT/new.out" ]; then
  echo "tasks: base $(grep -cE "$BLOCK" "$OUT/base.out") · new $(grep -cE "$BLOCK" "$OUT/new.out")"
  diff "$OUT/base.out" "$OUT/new.out" > "$OUT/replay.diff"
  removed=$(grep -c '^<' "$OUT/replay.diff"); added=$(grep '^>' "$OUT/replay.diff" | grep -Evc -- "$ALLOW"); allowed=$(grep '^>' "$OUT/replay.diff" | grep -Ec -- "$ALLOW")
  echo "removed/changed: $removed · unexplained added: $added · allowed added: $allowed"
  for k in 'CHAIN:' 'ENTRY\[' '§6|' 'CARD:'; do echo "  surface lines (base) $k $(grep -c -- "$k" "$OUT/base.out")"; done
  if [ "$removed" = 0 ] && [ "$added" = 0 ]; then echo "✅ BYTE-IDENTICAL on non-variant data"; else echo "❌ DIFFERS — read $OUT/replay.diff"; fail=1; fi
fi
for c in $CONTROLS; do
  [ -s "$OUT/control-$c.variant" ] || continue
  # The control's own header line and the leg's title line are expected to differ; every other difference is a mover.
  diff <(grep -v '^CONTROL ' "$OUT/control-$c.plain") <(grep -v '^CONTROL ' "$OUT/control-$c.variant") > "$OUT/control-$c.diff"
  n=$(grep -c '^[<>]' "$OUT/control-$c.diff"); raw=$(grep -o 'raw SQL operations (not overlaid): [0-9]*' "$OUT/control-$c.variant")
  echo "control $c: $n differing lines · $raw · $(head -1 "$OUT/control-$c.variant")"
  [ "$n" -gt 0 ] || { echo "  ❌ INERT CONTROL — the variant token moved nothing"; fail=1; }
done
if [ -n "$CONTROLS" ] && [ -s "$OUT/control-$(echo $CONTROLS | cut -d' ' -f1).variant" ]; then
  npx ts-node "$NEW_TREE/scripts/check-held-variant-controls.ts" --step "$STEP" --out "$OUT" $CONTROLS || fail=1
fi
exit $fail
