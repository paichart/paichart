#!/usr/bin/env bash
# publish.sh — the ONLY sanctioned way to push the public repo (2026-09-08).
#
# Why a script: the human-typed sequence (`--out` → link → generate → chain → `--into` → commit → push) was
# run ~22 times over three days and slipped twice — once `--into` projected a tree that had moved since the
# validated export (standing rule 8), once a guard grep inside an && chain silently skipped the chain and the
# push went out with NO verdict. A script makes the gate structural: the public push cannot precede a green
# chain, and the tree projected is the tree that was validated (it refuses to run on a dirty tree, and
# re-checks HEAD before `--into`).
#
# Usage:  scripts/export/publish.sh "<public commit message>"      # full cycle, ~15–20 min
#         scripts/export/publish.sh --dry-run                        # export + chain only, no push
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EXPORT=/tmp/paichart-export
PUBLIC="${PAICHART_PUBLIC_CLONE:-$HOME/paichart}"
LOG="${EXPORT}-chain.log"
MSG="${1:-}"
cd "$ROOT"

[ -n "$MSG" ] || { echo "usage: $0 \"<public commit message>\" | --dry-run"; exit 2; }
[ -z "$(git status --porcelain)" ] || { echo "❌ refusing: copov15 working tree is dirty — commit or stash first (rule 8: the tree projected must be the tree validated)"; exit 1; }
HEAD_BEFORE=$(git rev-parse HEAD)

echo "▶ export --out ($HEAD_BEFORE)"
rm -rf "$EXPORT"; python3 scripts/export-public.py --out "$EXPORT" | tail -1
ln -s "$ROOT/node_modules" "$EXPORT/node_modules"
( cd "$EXPORT" && npx prisma generate >/dev/null 2>&1 ) || { echo "❌ prisma generate failed in the export"; exit 1; }

echo "▶ test:all-validation on the export (log: $LOG)"
if ( cd "$EXPORT" && npm run test:all-validation > "$LOG" 2>&1 ); then
  echo "✅ chain green"
else
  echo "❌ chain RED — nothing pushed. Last lines:"; tail -20 "$LOG"; exit 1
fi

[ "$MSG" = "--dry-run" ] && { echo "dry run: export validated, no push"; exit 0; }
[ "$(git rev-parse HEAD)" = "$HEAD_BEFORE" ] || { echo "❌ refusing: copov15 HEAD moved during the chain ($HEAD_BEFORE → $(git rev-parse HEAD)); re-run"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "❌ refusing: tree became dirty during the chain"; exit 1; }

echo "▶ export --into $PUBLIC"
python3 scripts/export-public.py --into "$PUBLIC" | tail -1
( cd "$PUBLIC" && git add -A && git commit -q -m "$MSG" && git push -q origin main && echo "✅ public pushed: $(git rev-parse --short HEAD)" )
