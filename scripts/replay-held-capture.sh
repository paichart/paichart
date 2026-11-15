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
#   scripts/replay-held-capture.sh --compare-base <base-tree>   # THE GATE FOR A CODE CHANGE (CAPTURE-REPLAY-NOT-CLEAN-SINCE-PIN-CUT, 2026-11-15):
#        runs --compare-all with the BASE tree's code and with this tree's code and compares them execution by execution
#        (scripts/held-capture-replay-diff.sh). Exit 0 = the same verdict and detail on every execution = the change moved no capture.
#        Use this, not --compare-all's own exit code: --compare-all predicts stored executions with TODAY's pin and snapshot rule, so an
#        execution that ran under an earlier one reads ❌ forever (36 of 40 on 2026-11-15 held a file from the retired repo).
#        <base-tree>: a worktree at the base commit with node_modules (git worktree add <path> <BASE-SHA>; ln -s <repo>/node_modules <path>/).
#        Both passes read LIVE production one after the other; a run that captures a file between them shows as one differing execution.
# Env: HELD_REPLAY_SINCE (default 2026-08-01).
set -u
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
PROD=<PROD_USER>@<PROD_HOST>
PORT=15434
HERE="$(cd "$(dirname "$0")/.." && pwd)"
RAW=$(ssh -o ConnectTimeout=10 "$PROD" 'cd /var/www/paichart-app/current && set -a && source .env.production && set +a && printf %s "$DATABASE_URL"') \
  || { [ "${1:-}" = "--check-held" ] && echo UNMEASURED; exit 2; }
ssh -N -o ExitOnForwardFailure=yes -L $PORT:localhost:5432 "$PROD" & TPID=$!
trap 'kill $TPID 2>/dev/null' EXIT
sleep 3
URL=$(node -e 'const u=new URL(process.argv[1]); u.hostname="localhost"; u.port=process.argv[2]; const q=u.search?"&":"?"; console.log(u.toString()+q+"options="+encodeURIComponent("-c default_transaction_read_only=on"))' "$RAW" "$PORT")
unset RAW
cd "$HERE" && DATABASE_URL="$URL" npx ts-node -r tsconfig-paths/register scripts/replay-held-capture.ts "$@"
