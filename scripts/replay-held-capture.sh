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
#   scripts/replay-held-capture.sh --check-held         # MI-13 🔴 11 (prints UNMEASURED on any failure, never 0)
# Env: HELD_REPLAY_SINCE (default 2026-08-01).
set -u
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
