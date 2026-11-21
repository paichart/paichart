#!/bin/bash
# replay-held-capture.sh — run scripts/replay-held-capture.ts READ-ONLY against production (PLATFORM-HELD-BYTES WI-10).
#
# SAFETY (enforced by Postgres, not by intent — the replay-nets-byte-identity.sh pattern):
#   - the prod DATABASE_URL is fetched over ssh into THIS process's memory only — never written to a file;
#   - an ssh tunnel to the prod host's local Postgres, closed on exit;
#   - the session is forced read-only (`default_transaction_read_only=on`); the runner ALSO attempts a write first and aborts
#     unless it is refused.
#
# Usage:
#   scripts/replay-held-capture.sh                      # the archive replay (§11.2)
#   scripts/replay-held-capture.sh --predict <execId>…  # the predicted rows per execution
#   scripts/replay-held-capture.sh --compare <execId>…  # §11.3 G-CAP-live: prediction vs table rows + hashes (exit 1 on a mismatch)
#   scripts/replay-held-capture.sh --compare-all        # --compare over every execution with a CAPTURE ref or capture refusal
#   scripts/replay-held-capture.sh --check-held         # MI-13 🔴 11 (prints UNMEASURED on any failure, never 0)
#   scripts/replay-held-capture.sh --device-sources     # held-network step 3 batch 2b: Device sources grammar corpus over network legs
#   scripts/replay-held-capture.sh --device-lane        # … the device-read lane + the two network Harvester facts over stored Harvesters
#   HELD_REPLAY_DEVICE_LANE=off scripts/replay-held-capture.sh --compare-all   # predict WITHOUT the device lane (nothing else moved)
#   HELD_REPLAY_CONFIG_SCOPE=off scripts/replay-held-capture.sh --compare-all  # predict WITHOUT the Config-sources capture scope (nothing else moved)
#   scripts/replay-held-capture.sh --compare-base <base-tree>   # THE GATE FOR A CODE CHANGE (CAPTURE-REPLAY-NOT-CLEAN-SINCE-PIN-CUT, 2026-11-15):
#        runs --compare-all with the BASE tree's code and with this tree's code and compares them execution by execution
#        (scripts/held-capture-replay-diff.sh). Exit 0 = the same verdict and detail on every execution = the change moved no capture.
#        Use this, not --compare-all's own exit code: --compare-all predicts stored executions with TODAY's pin and snapshot rule, so an
#        execution that ran under an earlier one reads ❌ forever (36 of 40 on 2026-11-15 held a file from the retired repo).
#        <base-tree>: a worktree at the base commit with node_modules (git worktree add <path> <BASE-SHA>; ln -s <repo>/node_modules <path>/).
#        Both passes read LIVE production one after the other; a run that captures a file between them shows as one differing execution.
#   scripts/replay-held-capture.sh --archive-base <base-tree>   # Config sources STEP 3 P0 (W19): the ARCHIVE replay, base against new,
#        execution by execution. ONE upper bound on result.json createdAt is fixed here and handed to both passes (HELD_REPLAY_UNTIL; set
#        it yourself to repeat a window). The base pass runs THIS tree's runner over the BASE tree's lib/ — in a temporary tree of
#        symbolic links, so nothing is written into the base tree — transpile-only (the runner may use a type the base lacks); the new
#        pass runs it over this tree's lib/, type-checked. Compared: the header and the `exec <id> …` lines (held count, refusal names,
#        a hash of the sorted (toolCallIndex, selector, sha256) list). NOT compared: the CPU line and the aggregate report. Exit 0 =
#        identical; 1 = an execution differs, or is present in one pass only (its own class); 2 = a pass did not complete.
#        LIMITS: the population is keyed on the two service tool names (get_otel_config, get_ingress_config) — a Git-only observability
#        Harvester is outside it; a change to the RUNNER is on both sides, so it does not show here (use --compare-base or a knob).
#        When the two trees' lib/ are identical the mode prints a WARNING: it then proves determinism under the one bound, nothing more.
#        HELD_REPLAY_KEEP_OUT=<dir> keeps the two outputs; a directory inside a git work tree is refused.
#   scripts/replay-held-capture.sh --config-lane                # the Config-lane corpus on production (every PIPELINE task, no date bound)
#   scripts/replay-held-capture.sh --config-lane --local-db <name>   # … on a LOCAL read-only copy (e.g. a nets_replay_<id> scratch
#        database): no ssh, no production read. The local server URL comes from NETS_REPLAY_LOCAL_PG, else DATABASE_URL in this
#        tree's or the main checkout's .env; it must be localhost. The runner's 25006 write probe is required there too.
#   scripts/replay-held-capture.sh --config-lane-base <base-tree> [--local-db <name>]   # the corpus base against new, leg by leg and
#        snapshot by snapshot (this runner over the base tree's lib/ and over this tree's; the `leg` and `snapshot` lines compared by
#        held-capture-replay-diff.sh). THE GATE for a lib/ change that touches the Config-sources rules: a stored leg whose AS-SHIPPED
#        governing state or force moves, or a stored snapshot that stops governing, is a DIFFERS. The all-rows-shipped state is not
#        comparable to a base from before a lane row, so the NEW pass's own exit code carries it (an observability leg that declares
#        nothing must read not-config-source-leg with no force) and a non-zero one fails the gate. Same limits as --archive-base.
#   scripts/replay-held-capture.sh --file-read-counts           # STEP3 plan §7: rows exposing the Git file-read tool; stored workflows
#        that read a key-named file through an unpinned file service
#   HELD_REPLAY_DEVICE_SCOPE_GATE=off scripts/replay-held-capture.sh --compare-all   # predict with the device scope gated as before 2026-11-21
# Env: HELD_REPLAY_SINCE (default 2026-08-01); HELD_REPLAY_UNTIL (archive mode: exclusive upper bound, UTC "YYYY-MM-DD HH:MM:SS").
set -u
# Review F8: a mode this wrapper does not know is refused HERE, before any ssh or tunnel.
case "${1:-}" in
  ""|--predict|--compare|--compare-all|--compare-base|--archive-base|--check-held|--device-sources|--device-lane|--config-lane|--config-lane-base|--file-read-counts) ;;
  *) echo "✗ unknown mode ${1} — see the usage lines at the top of $0"; exit 2;;
esac
if [ "${1:-}" = "--archive-base" ] || [ "${1:-}" = "--config-lane-base" ]; then
  MODE="$1"
  SELF_DIR="$(cd "$(dirname "$0")" && pwd)"; NEW_TREE="$(cd "$SELF_DIR/.." && pwd)"
  BASE_TREE="${2:-}"
  { [ -n "$BASE_TREE" ] && [ -d "$BASE_TREE/lib" ] && [ -d "$BASE_TREE/scripts" ] && [ -e "$BASE_TREE/node_modules" ] && [ -f "$BASE_TREE/tsconfig.json" ]; } \
    || { echo "usage: $0 $MODE <base-tree>   (a tree at the base commit, with lib/, scripts/, tsconfig.json and node_modules)"; exit 2; }
  BASE_TREE="$(cd "$BASE_TREE" && pwd)"
  if [ "$MODE" = "--config-lane-base" ]; then
    PASS_ARGS=(--config-lane)
    if [ "${3:-}" = "--local-db" ]; then [ -n "${4:-}" ] || { echo "usage: $0 --config-lane-base <base-tree> [--local-db <database name>]"; exit 2; }; PASS_ARGS+=(--local-db "$4"); fi
  else PASS_ARGS=(); fi
  # Review F8: the kept outputs name production ids — refuse a directory inside any git work tree (a check, not a comment).
  if [ -n "${HELD_REPLAY_KEEP_OUT:-}" ]; then
    mkdir -p "$HELD_REPLAY_KEEP_OUT" || exit 2
    if git -C "$HELD_REPLAY_KEEP_OUT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      echo "✗ ABORT: HELD_REPLAY_KEEP_OUT ($HELD_REPLAY_KEEP_OUT) is inside a git work tree — the outputs name production ids; use the session scratchpad"; exit 2
    fi
  fi
  umask 077; T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT   # the outputs name production execution ids — never left behind
  # The base pass's tree: every entry of the base tree by symbolic link, except scripts/, which holds links to the base's scripts
  # and REAL copies of this tree's runner files. Node resolves a linked file to its real path, so every lib/ module is the base's.
  mkdir -p "$T/base/scripts"
  for e in "$BASE_TREE"/* "$BASE_TREE"/.[!.]*; do
    [ -e "$e" ] || continue; n="$(basename "$e")"
    case "$n" in scripts|.git) ;; *) ln -s "$e" "$T/base/$n";; esac
  done
  for e in "$BASE_TREE"/scripts/*; do ln -s "$e" "$T/base/scripts/$(basename "$e")"; done
  for f in replay-held-capture.ts held-capture-compare.ts; do rm -f "$T/base/scripts/$f"; cp "$SELF_DIR/$f" "$T/base/scripts/$f"; done
  if [ "$MODE" = "--archive-base" ]; then
    export HELD_REPLAY_UNTIL="${HELD_REPLAY_UNTIL:-$(date -u '+%Y-%m-%d %H:%M:%S')}"
    echo "archive window: result.json createdAt >= ${HELD_REPLAY_SINCE:-2026-08-01} and < $HELD_REPLAY_UNTIL (UTC) — the same for both passes"
  fi
  # Review F4: with identical lib/ trees the two passes run the SAME code — say so, so an "identical" is not read as proof about a change.
  if diff -rq "$BASE_TREE/lib" "$NEW_TREE/lib" >/dev/null 2>&1; then
    echo "⚠️  WARNING: $BASE_TREE/lib and $NEW_TREE/lib are IDENTICAL. Both passes run the same lib/ code: an \"identical\" below proves the"
    echo "    replay is deterministic over one window, and NOTHING about a change (this runner is on both sides by design)."
  fi
  echo "base pass (this runner over $BASE_TREE/lib @ $(git -C "$BASE_TREE" rev-parse --short HEAD 2>/dev/null)$(git -C "$BASE_TREE" diff --quiet HEAD -- lib 2>/dev/null || echo ' +uncommitted lib changes'))"
  HELD_REPLAY_RUN_TREE="$T/base" TS_NODE_TRANSPILE_ONLY=1 bash "$SELF_DIR/replay-held-capture.sh" "${PASS_ARGS[@]+"${PASS_ARGS[@]}"}" > "$T/base.out" 2>&1   # its own exit code is history, not the gate
  echo "new pass  (this runner over $NEW_TREE/lib @ $(git -C "$NEW_TREE" rev-parse --short HEAD 2>/dev/null)$(git -C "$NEW_TREE" diff --quiet HEAD -- lib 2>/dev/null || echo ' +uncommitted lib changes'))"
  bash "$SELF_DIR/replay-held-capture.sh" "${PASS_ARGS[@]+"${PASS_ARGS[@]}"}" > "$T/new.out" 2>&1; NEW_RC=$?
  [ -n "${HELD_REPLAY_KEEP_OUT:-}" ] && cp "$T/base.out" "$T/new.out" "$HELD_REPLAY_KEEP_OUT/"
  bash "$SELF_DIR/held-capture-replay-diff.sh" "$T/base.out" "$T/new.out"; DIFF_RC=$?
  if [ "$MODE" = "--config-lane-base" ]; then
    # The diff compares the AS-SHIPPED lines (`leg`, `snapshot`). The ALL-ROWS-SHIPPED state is not comparable to a base from before a
    # lane row — the NEW pass's own exit code carries its rule (an observability leg that declares nothing must read
    # not-config-source-leg with no force; every snapshot must read back and govern), so here that exit code is part of the gate.
    grep -a -v '^{"level"' "$T/new.out" | grep -a -E '^(ℹ️|⚠️|   |✅|⛔|  - )' | tail -12
    [ "$NEW_RC" -eq 0 ] || { echo "❌ the NEW pass's own check failed (exit $NEW_RC) — see the lines above"; exit 1; }
  fi
  exit $DIFF_RC
fi
if [ "${1:-}" = "--compare-base" ]; then
  SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
  BASE_TREE="${2:-}"
  { [ -n "$BASE_TREE" ] && [ -f "$BASE_TREE/scripts/replay-held-capture.sh" ] && [ -e "$BASE_TREE/node_modules" ]; } \
    || { echo "usage: $0 --compare-base <base-tree>   (a worktree at the base commit, with node_modules)"; exit 2; }
  BASE_TREE="$(cd "$BASE_TREE" && pwd)"
  umask 077; T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT   # the outputs name production execution ids and paths — never left behind
  echo "base pass ($BASE_TREE @ $(git -C "$BASE_TREE" rev-parse --short HEAD 2>/dev/null))"
  (cd "$BASE_TREE" && bash scripts/replay-held-capture.sh --compare-all) > "$T/base.out" 2>&1   # its own exit code is history, not the gate
  echo "new pass  ($(cd "$SELF_DIR/.." && pwd) @ $(git -C "$SELF_DIR/.." rev-parse --short HEAD 2>/dev/null))"
  bash "$SELF_DIR/replay-held-capture.sh" --compare-all > "$T/new.out" 2>&1
  bash "$SELF_DIR/held-capture-replay-diff.sh" "$T/base.out" "$T/new.out"
  exit $?
fi
HERE="$(cd "$(dirname "$0")/.." && pwd)"
RUN_TREE="${HELD_REPLAY_RUN_TREE:-$HERE}"   # --archive-base's base pass: the tree the runner is started in (internal)
if [ "${1:-}" = "--config-lane" ] && [ "${2:-}" = "--local-db" ]; then
  # A LOCAL read-only copy: no ssh, no production read. Only --config-lane takes it (it needs four tables a scratch copy holds).
  DB="${3:-}"; [ -n "$DB" ] || { echo "usage: $0 --config-lane --local-db <database name>"; exit 2; }
  LOCAL="${NETS_REPLAY_LOCAL_PG:-}"
  if [ -z "$LOCAL" ]; then
    # Review F7: `--git-common-dir` is RELATIVE in a main checkout (".git") — resolve it from $HERE; and a .env with no DATABASE_URL
    # must not end the search (the main checkout's is tried next).
    MAIN_CHECKOUT="$(cd "$HERE" && cd "$(git rev-parse --git-common-dir)/.." && pwd)"
    for envf in "$HERE/.env" "$MAIN_CHECKOUT/.env"; do
      [ -f "$envf" ] || continue
      LOCAL=$(grep -E '^DATABASE_URL=' "$envf" | head -1 | cut -d= -f2- | tr -d '"'"'")
      [ -n "$LOCAL" ] && break
    done
  fi
  [ -n "$LOCAL" ] || { echo "✗ no local Postgres URL: set NETS_REPLAY_LOCAL_PG"; exit 2; }
  URL=$(node -e 'const u=new URL(process.argv[1]); if(!["localhost","127.0.0.1","::1","[::1]"].includes(u.hostname)){process.exit(3)} u.pathname="/"+process.argv[2]; u.search="?options="+encodeURIComponent("-c default_transaction_read_only=on"); console.log(u.toString())' "$LOCAL" "$DB") \
    || { echo "✗ ABORT: --local-db needs a LOCAL Postgres URL (localhost) — refusing a non-local host"; exit 2; }
  unset LOCAL
  cd "$RUN_TREE" && DATABASE_URL="$URL" npx ts-node -r tsconfig-paths/register scripts/replay-held-capture.ts --config-lane
  exit $?
fi
PROD=<PROD_USER>@<PROD_HOST>
PORT=${HELD_REPLAY_PORT:-15434}
RAW=$(ssh -o ConnectTimeout=10 "$PROD" 'cd /var/www/paichart-app/current && set -a && source .env.production && set +a && printf %s "$DATABASE_URL"') \
  || { [ "${1:-}" = "--check-held" ] && echo UNMEASURED; exit 2; }
ssh -N -o ExitOnForwardFailure=yes -L $PORT:localhost:5432 "$PROD" & TPID=$!
trap 'kill $TPID 2>/dev/null' EXIT
sleep 3
URL=$(node -e 'const u=new URL(process.argv[1]); u.hostname="localhost"; u.port=process.argv[2]; const q=u.search?"&":"?"; console.log(u.toString()+q+"options="+encodeURIComponent("-c default_transaction_read_only=on"))' "$RAW" "$PORT")
unset RAW
cd "$RUN_TREE" && DATABASE_URL="$URL" npx ts-node -r tsconfig-paths/register scripts/replay-held-capture.ts "$@"
