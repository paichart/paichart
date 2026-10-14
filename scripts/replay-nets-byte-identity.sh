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
# points: leg SYNTHESIZE and leaf persist — legs alone exercise only one). value-chain 2026-10-02: 2,196 tasks.
#
# SAFETY (read-only, enforced by Postgres, not by intent):
#   - the prod DATABASE_URL is fetched over ssh into THIS process's memory only — never written to a file;
#   - an ssh tunnel to the prod host's local Postgres, closed on exit;
#   - the session is forced read-only (`default_transaction_read_only=on`), and a write is attempted FIRST and must be
#     refused, or the script aborts;
#   - load is one query stream (connection_limit from the prod URL); measured load average ~0.1 during a full pass.
#
# Usage:
#   scripts/replay-nets-byte-identity.sh --base-tree <path-to-worktree-at-BASE-commit> --out <dir> [--since 2026-07-18]
#        [--allow-added '<regex>'] [--start-at <N>]          # --start-at resumes the NEW pass at task N (1-based)
#   Make the base worktree with:  git worktree add <path> <BASE-SHA>   (the base pass runs THAT tree's code)
#   Re-use a finished base pass: if <out>/base.out exists with every task, it is NOT re-run (data is static when no
#   pipeline run is in flight — check that first; a run in flight makes the two passes read different data).
#
# Runtime: ~60-65 min per pass at ~2,300 tasks (≈37 tasks/min); a two-pass run exceeds a 2 h background limit — run
#   the passes as two invocations (a complete base pass is reused), or plan on a --start-at resume.
# ⚠️ Learned 2026-10-02: (1) build the read-only option with encodeURIComponent — URLSearchParams encodes a space as
#   '+', and Postgres then rejects the option name; (2) a pass cut off mid-run leaves a partial final task: resume with
#   --start-at <that task's index> — the script trims the duplicated header at the join.
set -u
PROD=<PROD_USER>@<PROD_HOST>
BASE_TREE=""; OUT=""; SINCE="2026-07-18"; ALLOW='does not apply at leaf-persist'; START=1
while [ $# -gt 0 ]; do case "$1" in
  --base-tree) BASE_TREE="$2"; shift 2;; --out) OUT="$2"; shift 2;; --since) SINCE="$2"; shift 2;;
  --allow-added) ALLOW="$2"; shift 2;; --start-at) START="$2"; shift 2;;
  *) echo "unknown arg $1"; exit 2;; esac; done
[ -n "$BASE_TREE" ] && [ -n "$OUT" ] || { echo "need --base-tree and --out"; exit 2; }
NEW_TREE="$(cd "$(dirname "$0")/.." && pwd)"; mkdir -p "$OUT"

RAW=$(ssh "$PROD" 'cd /var/www/paichart-app/current && set -a && source .env.production && set +a && printf %s "$DATABASE_URL"')
ssh -N -o ExitOnForwardFailure=yes -L 15433:localhost:5432 "$PROD" & TPID=$!
trap 'kill $TPID 2>/dev/null' EXIT
sleep 3
URL=$(node -e 'const u=new URL(process.argv[1]); u.hostname="localhost"; u.port="15433"; const q=u.search?"&":"?"; console.log(u.toString()+q+"options="+encodeURIComponent("-c default_transaction_read_only=on"))' "$RAW")
unset RAW; export DATABASE_URL="$URL"

probe=$(psql "$URL" -At -c "CREATE TEMP TABLE _ro_probe(x int);" 2>&1 | head -1)
case "$probe" in *"read-only transaction"*) echo "✓ read-only enforced: $probe";; *) echo "✗ ABORT: write probe was not refused: $probe"; exit 1;; esac
inflight=$(psql "$URL" -At -c "SELECT count(*) FROM agent_executions WHERE status IN ('RUNNING','PENDING','QUEUED');")
echo "in-flight executions: $inflight (must be 0 for the two passes to read the same data)"; [ "$inflight" = 0 ] || exit 1

if [ ! -s "$OUT/ids.txt" ]; then
  psql "$URL" -At -c "WITH legs AS (SELECT id, metadata->>'pipelineStageId' ps FROM tasks WHERE type='PIPELINE' AND created_at >= '$SINCE')
    SELECT id FROM legs UNION SELECT c.id FROM tasks c JOIN legs l ON c.stage_id = l.ps ORDER BY 1;" > "$OUT/ids.txt"
fi
N=$(wc -l < "$OUT/ids.txt"); echo "population: $N tasks (since $SINCE)"

pass() { (cd "$1" && xargs -a "$2" npx ts-node --compiler-options '{"module":"commonjs"}' scripts/replay-nets.ts 2>&1 \
          | grep -v '"level"\|prisma:info\|SLOW QUERY'); }
BASE_DONE=$(grep -c '^cm' "$OUT/base.out" 2>/dev/null); BASE_DONE=${BASE_DONE:-0}   # never `|| echo 0`: grep -c already prints 0
if [ "$BASE_DONE" != "$N" ]; then
  echo "base pass ($BASE_TREE) $(date +%T)"; pass "$BASE_TREE" "$OUT/ids.txt" > "$OUT/base.out"
fi
if [ "$START" -gt 1 ] && [ -s "$OUT/new.out" ]; then
  # keep tasks 1..START-1 from the earlier partial pass; trim the blank + separator lines that open task START
  cut=$(grep -n '^cm' "$OUT/new.out" | sed -n "${START}p" | cut -d: -f1)
  head -n $((cut - 3)) "$OUT/new.out" > "$OUT/new.part1"
  tail -n +"$START" "$OUT/ids.txt" > "$OUT/resume-ids.txt"
  echo "new pass resumed at task $START ($NEW_TREE) $(date +%T)"; pass "$NEW_TREE" "$OUT/resume-ids.txt" > "$OUT/new.part2"
  cat "$OUT/new.part1" "$OUT/new.part2" > "$OUT/new.out"
else
  echo "new pass ($NEW_TREE) $(date +%T)"; pass "$NEW_TREE" "$OUT/ids.txt" > "$OUT/new.out"
fi

echo "tasks: base $(grep -c '^cm' "$OUT/base.out") · new $(grep -c '^cm' "$OUT/new.out")"
diff "$OUT/base.out" "$OUT/new.out" > "$OUT/replay.diff"
removed=$(grep -c '^<' "$OUT/replay.diff"); added=$(grep '^>' "$OUT/replay.diff" | grep -vc -- "$ALLOW"); allowed=$(grep '^>' "$OUT/replay.diff" | grep -c -- "$ALLOW")
leaf=$(grep -c 'point=leaf-persist' "$OUT/base.out")
echo "removed/changed: $removed · unexplained added: $added · allowed added: $allowed (leaf tasks: $leaf)"
[ "$removed" = 0 ] && [ "$added" = 0 ] && echo "✅ BYTE-IDENTICAL on every existing fact" || { echo "❌ DIFFERS — read $OUT/replay.diff"; exit 1; }
