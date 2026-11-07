#!/usr/bin/env bash
# run-gates-clean.sh — run the full pre-push gates in a CLEAN copy of the repo at a commit (default HEAD).
#
#   scripts/run-gates-clean.sh            # gates for HEAD
#   scripts/run-gates-clean.sh <commit>   # gates for another commit
#   KEEP=1 scripts/run-gates-clean.sh     # keep the temporary copy and logs afterwards
#
# Why a clean copy: the main checkout is shared (other sessions edit it), so a gate run there can pass on someone else's
# uncommitted edit, or fail on it. A detached worktree at the commit runs exactly what will be pushed.
#
# Gates, in order (the same set CI enforces, plus the build): lint · check-naming · demo-write coverage · resource-authz coverage ·
# the full test battery (`test:all-validation`) · the golden set · `npm run build`.
#
# The battery is ONE `&&` chain, so it stops at its first failing suite and everything after it is UNVERIFIED. When it fails, this
# script names the failing suite and lists every suite after it — re-run those after the fix (they are not "passed").
#
# Exit 0 only if every gate passed. Logs: printed paths (kept with KEEP=1, else removed with the copy).
set -u
ROOT="$(git rev-parse --show-toplevel)"
REV="${1:-HEAD}"
SHA="$(git -C "$ROOT" rev-parse --short "$REV")" || { echo "unknown commit: $REV"; exit 2; }
WORK="$(mktemp -d "${TMPDIR:-/tmp}/gates-${SHA}-XXXX")"
TREE="$WORK/tree"; LOGS="$WORK/logs"; mkdir -p "$LOGS"

cleanup() {
  if [ "${KEEP:-0}" = "1" ]; then echo "kept: $WORK"; return; fi
  git -C "$ROOT" worktree remove --force "$TREE" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

git -C "$ROOT" worktree add -q --detach "$TREE" "$SHA" || { echo "could not create the clean copy"; exit 2; }
ln -s "$ROOT/node_modules" "$TREE/node_modules"
# The leg-replay lab cache is gitignored: without it the golden set falls through to the read-only PRODUCTION snapshot channel
# (LL-CS-17, LL-CS-28). Link the main checkout's cache so a gate run never reads production.
[ -d "$ROOT/scripts/leg-replay-lab/cache" ] && ln -s "$ROOT/scripts/leg-replay-lab/cache" "$TREE/scripts/leg-replay-lab/cache"
[ -f "$ROOT/.env" ] && cp "$ROOT/.env" "$TREE/.env"   # local test settings (the battery's local-DB suites read it)
echo "gates for $SHA ($(git -C "$ROOT" log -1 --format=%s "$SHA" | cut -c1-80))"

FAILED=0
run() {
  local name="$1"; shift
  if (cd "$TREE" && "$@") >"$LOGS/$name.log" 2>&1; then echo "  ✅ $name"
  else echo "  ❌ $name   (log: $LOGS/$name.log)"; FAILED=1; return 1; fi
}

run lint            npm run lint
run check-naming    npm run check-naming
run demo-write      npx ts-node scripts/test-demo-write-coverage.ts
run resource-authz  npx ts-node scripts/test-resource-authz-coverage.ts
if ! run battery npm run test:all-validation; then
  # which suite stopped the chain, and what never ran
  STOPPED="$(grep -E '^> [^ ]+ (test|validate):' "$LOGS/battery.log" | tail -1 | sed -E 's/^> [^ ]+ //')"
  echo "     stopped at: ${STOPPED:-unknown}"
  if [ -n "$STOPPED" ]; then
    (cd "$TREE" && node -e '
      const c=require("./package.json").scripts["test:all-validation"]||"";
      const l=[...c.matchAll(/npm run ([\w:.-]+)/g)].map(m=>m[1]); const i=l.indexOf(process.argv[1]);
      const rest=i<0?[]:l.slice(i+1);
      console.log(`     never ran (UNVERIFIED, re-run after the fix): ${rest.length} suite(s)`);
      rest.forEach(s=>console.log("       "+s));' "$STOPPED")
  fi
fi
run golden-set      npm run test:golden-set
run build           npm run build

if [ "$FAILED" = "0" ]; then echo "ALL GATES PASSED for $SHA"; else echo "GATES FAILED for $SHA"; [ "${KEEP:-0}" = "1" ] || echo "(re-run with KEEP=1 to keep the logs)"; fi
exit "$FAILED"
