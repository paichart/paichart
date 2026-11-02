#!/bin/bash
# measure-r10-gaps.sh — run scripts/measure-r10-gaps.ts READ-ONLY against production (registers R10-KEYNAME-BLIND,
# R10-ESCAPED-TAB-INDENT). Same safety as replay-held-capture.sh: the prod DATABASE_URL is fetched over ssh into this
# process's memory only, an ssh tunnel closed on exit, and the session forced read-only (the script also refuses
# unless `transaction_read_only` reads on). Output is masked: key, length, shape class — never a value.
set -u
PROD=<PROD_USER>@<PROD_HOST>
PORT=15435
HERE="$(cd "$(dirname "$0")/.." && pwd)"
RAW=$(ssh -o ConnectTimeout=10 "$PROD" 'cd /var/www/paichart-app/current && set -a && source .env.production && set +a && printf %s "$DATABASE_URL"') \
  || exit 2
ssh -N -o ExitOnForwardFailure=yes -L $PORT:localhost:5432 "$PROD" & TPID=$!
trap 'kill $TPID 2>/dev/null' EXIT
sleep 3
URL=$(node -e 'const u=new URL(process.argv[1]); u.hostname="localhost"; u.port=process.argv[2]; const q=u.search?"&":"?"; console.log(u.toString()+q+"options="+encodeURIComponent("-c default_transaction_read_only=on"))' "$RAW" "$PORT")
unset RAW
cd "$HERE" && DATABASE_URL="$URL" npx ts-node -r tsconfig-paths/register scripts/measure-r10-gaps.ts "$@"
