#!/bin/bash
# replay-r10-versions.sh — run scripts/replay-r10-versions.ts READ-ONLY against production: every stored result.json,
# report.md and held blob through the BASE R10 (from git, default HEAD) and the CURRENT tree's R10, line by line.
# Same safety as measure-r10-gaps.sh: the prod DATABASE_URL is fetched over ssh into this process's memory only, an ssh
# tunnel closed on exit, the session forced read-only and a 25006 write probe before any read. Masked output.
#   scripts/replay-r10-versions.sh [base-git-ref]        e.g. scripts/replay-r10-versions.sh 949cef690
set -u
PROD=<PROD_USER>@<PROD_HOST>
PORT=15436
HERE="$(cd "$(dirname "$0")/.." && pwd)"
BASE_REF="${1:-HEAD}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git -C "$HERE" show "$BASE_REF:lib/agents/harness/redact-artifact-secrets.ts" > "$TMP/r10-base.ts" || exit 2
RAW=$(ssh -o ConnectTimeout=10 "$PROD" 'cd /var/www/paichart-app/current && set -a && source .env.production && set +a && printf %s "$DATABASE_URL"') \
  || exit 2
ssh -N -o ExitOnForwardFailure=yes -L $PORT:localhost:5432 "$PROD" & TPID=$!
trap 'kill $TPID 2>/dev/null; rm -rf "$TMP"' EXIT
sleep 3
URL=$(node -e 'const u=new URL(process.argv[1]); u.hostname="localhost"; u.port=process.argv[2]; const q=u.search?"&":"?"; console.log(u.toString()+q+"options="+encodeURIComponent("-c default_transaction_read_only=on"))' "$RAW" "$PORT")
unset RAW
cd "$HERE" && R10_BASE="$TMP/r10-base.ts" DATABASE_URL="$URL" npx ts-node -r tsconfig-paths/register scripts/replay-r10-versions.ts
