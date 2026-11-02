#!/usr/bin/env bash
# series-cut-draft.sh — print a DRAFT series-cut ledger entry for the latest deploy, with every mechanical fact filled in.
#
#   scripts/series-cut-draft.sh [<push time, ISO UTC>] [<base commit>]
#     push time: as printed by scripts/ship.sh (default: unknown — fill it in)
#     base:      the commit origin/main was at BEFORE the push (default: the commit before the first cut-relevant commit
#                among the last 30 on origin/main — CHECK IT)
#
# Fills in: release, both processes' restart time (THE CUT), commit range, the changed files that make it a cut (the same path
# list as the pre-push warning, scripts/check-series-cut-owed.sh), and any protocol version changes in the seed file.
# Leaves marked blanks for the judgement parts: what moved by construction, the stored field to key on, exclusion window, rollback.
# It never edits the ledger: review the draft, then prepend it to .claude/knowledge/pipelines/SERIES-CUT-LEDGER.md and add the
# one-line index entry in CLAUDE.md (§ SERIES CUTS).
# Read-only on production. Production host: $PROD_SSH (same convention as report-mechanism-inventory.sh).
set -u
PROD="${PROD_SSH:-<PROD_USER>@<PROD_HOST>}"
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT"
PUSHED_AT="${1:-<push time>}"
git fetch -q origin 2>/dev/null
HEAD_SHA="$(git rev-parse --short origin/main)"
# the cut-relevant path list, taken from the pre-push warning so the two can never disagree
CUT_PATHS="$(grep -m1 "^CUT_PATHS=" scripts/check-series-cut-owed.sh | sed -E "s/^CUT_PATHS='(.*)'$/\1/")"
[ -n "$CUT_PATHS" ] || { echo "could not read CUT_PATHS from scripts/check-series-cut-owed.sh"; exit 2; }
if [ -n "${2:-}" ]; then BASE="$(git rev-parse --short "$2")"
else
  FIRST=""
  for c in $(git rev-list --max-count=30 origin/main); do
    if git diff-tree --no-commit-id --name-only -r "$c" | grep -qE "$CUT_PATHS"; then FIRST="$c"; else [ -n "$FIRST" ] && break; fi
  done
  [ -n "$FIRST" ] || { echo "no cut-relevant commit in the last 30 on origin/main — pass <base> explicitly, or this is NOT a series cut"; exit 2; }
  BASE="$(git rev-parse --short "$FIRST^")"
fi
FILES="$(git diff --name-only "$BASE" origin/main | grep -E "$CUT_PATHS" || true)"
REL="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$PROD" 'ls -1t /var/www/paichart-app/releases | head -1' 2>/dev/null)"
RESTART="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$PROD" 'pm2 jlist 2>/dev/null | python3 -W ignore -c "import json,sys,datetime; print(min(datetime.datetime.fromtimestamp(p[\"pm2_env\"][\"pm_uptime\"]/1000, datetime.timezone.utc) for p in json.load(sys.stdin)).isoformat(timespec=\"milliseconds\").replace(\"+00:00\",\"Z\"))"' 2>/dev/null)"
VERS="$(git diff "$BASE" origin/main -- scripts/seed-protocol-prompts.ts | grep -E "^[-+] +version: '" | sed -E "s/^([-+]) +version: '([^']+)'.*/\1\2/" | paste -sd' ' -)"
COMMITS="$(git log --format='%h %s' "$BASE..origin/main" -- $(echo "$FILES") 2>/dev/null | cut -c1-110)"

cat <<EOF
⚠️ **SERIES CUT ${RESTART:-<restart time>} — <one-line title: what changed>** (pushed ${PUSHED_AT}, \`${BASE}..${HEAD_SHA}\`; release \`${REL:-<release>}\`; cut = both processes' restart).
- **What changed:** <how a stored fact is computed, or what an agent reads — one or two sentences>.
  Cut-relevant files:
$(echo "$FILES" | sed 's/^/    - /')
  Commits touching them:
$(echo "$COMMITS" | sed 's/^/    - /')
$( [ -n "$VERS" ] && echo "  Protocol version lines changed in the seed (− old / + new): $VERS" )
- **Key:** <the stored field to split on — never time alone, e.g. \`<fact>.version\` = N or \`protocolInjection.delta.version\`>.
- **Movers by construction:** <what moves and where; the replay result if a fact changed (tasks identical / version-only / other)>.
- **Exclusion window:** <none, or from the release directory time to the restart>.
- **Rollback:** <revert <commit>; reseed if a protocol or template changed>.
- Record: <register entry / review folder>.
EOF
echo
echo "(DRAFT — check the base commit, fill the <…> parts, then prepend to .claude/knowledge/pipelines/SERIES-CUT-LEDGER.md and index it in CLAUDE.md.)"
