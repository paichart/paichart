#!/usr/bin/env bash
# ship.sh — push main safely: show what goes out, refuse while a pipeline run is in flight, push, watch the PRODUCTION deploy,
# and print the release + restart time a series-cut entry needs.
#
#   scripts/ship.sh            # interactive: asks before pushing
#   YES=1 scripts/ship.sh      # no prompt (the in-flight refusal still applies)
#
# Rules it encodes (CLAUDE.md / memory):
#   - a push to main auto-deploys when code or scripts change, and the deploy restart orphans running pipeline executions ⇒
#     never push while any execution is RUNNING / PENDING / QUEUED (checked read-only on prod);
#   - watch the "Production Deploy" workflow specifically (other workflows on the same push can be skipped or unrelated);
#   - the series-cut pre-push warning (.githooks/pre-push) still fires; after a cut-relevant deploy, run
#     scripts/series-cut-draft.sh to draft the ledger entry.
# Read-only on production. Production host: $PROD_SSH (same convention as report-mechanism-inventory.sh).
set -u
PROD="${PROD_SSH:-<PROD_USER>@<PROD_HOST>}"
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "main" ] || { echo "not on main (on $BRANCH) — refusing"; exit 2; }
git fetch -q origin || { echo "git fetch failed"; exit 2; }
if [ -n "$(git log --oneline HEAD..origin/main)" ]; then echo "origin/main has commits you do not have — pull/rebase first"; exit 2; fi
OUT="$(git log --oneline origin/main..HEAD)"
[ -n "$OUT" ] || { echo "nothing to push"; exit 0; }

echo "── commits to push ($(echo "$OUT" | wc -l)):"; echo "$OUT" | sed 's/^/   /'
FILES="$(git diff --name-only origin/main..HEAD)"
echo "── files: $(echo "$FILES" | wc -l)"
DEPLOYS=0
if echo "$FILES" | grep -qvE '^(cline_docs/|\.claude/|CLAUDE\.md$|README|.*\.md$)'; then DEPLOYS=1; fi
[ "$DEPLOYS" = "1" ] && echo "   ⚠️  includes code/scripts — this push DEPLOYS" || echo "   docs only — expected not to deploy"
echo "$FILES" | grep -vE '^(cline_docs/|\.claude/)' | sed 's/^/   /' | head -20

INFLIGHT="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$PROD" 'cd /var/www/paichart-app/current && source .env.production && psql "$DATABASE_URL" -tA -c "SELECT count(*) FROM agent_executions WHERE status IN ('"'"'RUNNING'"'"','"'"'PENDING'"'"','"'"'QUEUED'"'"');"' 2>/dev/null | tr -d '[:space:]')"
case "$INFLIGHT" in
  0) echo "── in-flight executions on prod: 0 ✓" ;;
  ''|*[!0-9]*) echo "── could not read in-flight executions on prod — refusing (fix ssh/PROD_SSH, or check by hand)"; exit 2 ;;
  *) echo "── in-flight executions on prod: $INFLIGHT — REFUSING (a deploy restart would orphan them; wait and re-run)"; exit 3 ;;
esac

if [ "${YES:-0}" != "1" ]; then read -r -p "push $(echo "$OUT" | wc -l) commit(s) to origin/main? [y/N] " a; [ "$a" = "y" ] || { echo "aborted"; exit 1; }; fi
PUSHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push origin main || { echo "push failed"; exit 1; }
HEAD_SHA="$(git rev-parse HEAD)"
echo "── pushed at $PUSHED_AT ($(git rev-parse --short HEAD))"
[ "$DEPLOYS" = "1" ] || { echo "docs only — not waiting for a deploy"; exit 0; }

command -v gh >/dev/null || { echo "gh not installed — watch the Production Deploy workflow by hand"; exit 0; }
RUN=""
for _ in $(seq 1 18); do
  RUN="$(gh run list --branch main --limit 10 --json databaseId,name,headSha --jq ".[] | select(.headSha==\"$HEAD_SHA\") | select(.name|test(\"Production\")) | .databaseId" 2>/dev/null | head -1)"
  [ -n "$RUN" ] && break; sleep 10
done
[ -n "$RUN" ] || { echo "no Production Deploy run found for $HEAD_SHA after 3 min — check GitHub Actions (path filters may have skipped it)"; exit 0; }
echo "── watching Production Deploy run $RUN …"
if gh run watch "$RUN" --exit-status >/dev/null 2>&1; then echo "── deploy: SUCCESS"; else echo "── deploy: FAILED or cancelled — gh run view $RUN"; exit 4; fi
ssh -o BatchMode=yes -o ConnectTimeout=10 "$PROD" 'echo "release: $(ls -1t /var/www/paichart-app/releases | head -1)"; pm2 jlist 2>/dev/null | python3 -W ignore -c "import json,sys,datetime; [print(\"restart:\", p[\"name\"], datetime.datetime.fromtimestamp(p[\"pm2_env\"][\"pm_uptime\"]/1000, datetime.timezone.utc).isoformat(timespec=\"milliseconds\").replace(\"+00:00\",\"Z\")) for p in json.load(sys.stdin)]"'
echo "── if this push changed what agents read or how a fact is computed: scripts/series-cut-draft.sh $PUSHED_AT"
