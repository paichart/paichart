#!/usr/bin/env bash
#
# detect-dual-files.sh — flag any `lib/**/*.ts` with a `.js` sibling
#
# Background: we discovered in Apr 2026 that 13+ pairs of `lib/**/*.ts` +
# `lib/**/*.js` files had silently drifted in production, because Node's
# resolver (and Next.js webpack) picks `.js` over `.ts` for extensionless
# imports — and ts-node's `register()` does NOT change priority order.
# This meant weeks of TS edits were shadowed in production.
#
# Full diagnosis and plan:
#   cline_docs/reviews/dual-ts-js-drift-eradication-2026-04-07/
#
# This detector is the "lock the door behind us" safety net: after Phase 2
# of the eradication plan completes, NO new `lib/**/*.ts` should ever get a
# `.js` sibling committed to the repo. This script enforces that in both
# local pre-commit hooks and CI.
#
# Transition strategy: while Phase 2 is in progress, known-drift pairs are
# listed in `.dual-files-allowlist.txt`. The detector reports them as
# informational, but fails the build if ANY new dual pair appears that
# isn't in the allowlist. As each Phase 2 commit lands, the corresponding
# entry is removed from the allowlist. When the allowlist is empty, the
# detector becomes fully strict and the allowlist can be deleted.
#
# Exit codes:
#   0  — no unknown dual pairs found (allowlist satisfied)
#   1  — new dual pairs found (not in allowlist) — enforcement failure
#
# Usage:
#   ./scripts/detect-dual-files.sh            # check mode (default)
#   ./scripts/detect-dual-files.sh --report   # report all pairs, never fail

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ALLOWLIST="$REPO_ROOT/.dual-files-allowlist.txt"
MODE="${1:-check}"

# Scan scope (widened 2026-04-08 during Phase 3 post-UAT cleanup, plan v4 improvement #2):
#   - lib/ (the original Bug Class 73 scope)
#   - scripts/ (catches e.g. a hypothetical scripts/detect-dual-files.ts shadow)
#   - repo root at depth=1 only (catches a hypothetical server.ts shadowing server.js,
#     or mcp-server-http.ts shadowing mcp-server-http-clean.js)
# Intentionally excluded: node_modules, .next, .turbo, dist, build, coverage, .git
SEARCH_DIRS=("$REPO_ROOT/lib" "$REPO_ROOT/scripts")

if [ ! -d "$REPO_ROOT/lib" ]; then
  echo "ERROR: $REPO_ROOT/lib does not exist" >&2
  exit 2
fi

# Collect all current dual pairs: `.ts` files with a `.js` sibling at the
# same path. Exclude `.d.ts` declaration files.
CURRENT_PAIRS=()

# is_bootstrap_pattern: returns 0 (true) if a .js file is a ts-node bootstrap for
# its .ts sibling — i.e. it explicitly requires the .ts file by extension after
# registering ts-node. This is a legitimate pattern (e.g. server.js → server.ts)
# and is NOT the Bug Class 73 silent-shadow failure mode.
is_bootstrap_pattern() {
  local js_file="$1"
  local ts_basename
  ts_basename="$(basename "${js_file%.js}")"
  # Match either `require('./X.ts')` or `require("./X.ts")` — explicit .ts extension
  if grep -qE "require\(['\"]\./${ts_basename}\.ts['\"]\)" "$js_file" 2>/dev/null; then
    return 0
  fi
  return 1
}

# 1) Recursive scans of lib/ and scripts/
for dir in "${SEARCH_DIRS[@]}"; do
  [ -d "$dir" ] || continue
  while IFS= read -r ts_file; do
    # Skip .d.ts declaration files
    [[ "$ts_file" == *.d.ts ]] && continue
    js_file="${ts_file%.ts}.js"
    if [ -f "$js_file" ]; then
      # Skip legitimate ts-node bootstrap pairs (see is_bootstrap_pattern above)
      if is_bootstrap_pattern "$js_file"; then
        continue
      fi
      rel="${ts_file#$REPO_ROOT/}"
      rel="${rel%.ts}"
      CURRENT_PAIRS+=("$rel")
    fi
  done < <(find "$dir" -type f -name "*.ts" \
    -not -path "*/node_modules/*" \
    -not -path "*/.next/*" \
    -not -path "*/.turbo/*" \
    -not -path "*/dist/*" \
    -not -path "*/build/*" \
    -not -path "*/coverage/*" \
    2>/dev/null)
done

# 2) Root-level scan at depth=1 only (catches e.g. server.ts shadowing server.js)
while IFS= read -r ts_file; do
  [[ "$ts_file" == *.d.ts ]] && continue
  js_file="${ts_file%.ts}.js"
  if [ -f "$js_file" ]; then
    if is_bootstrap_pattern "$js_file"; then
      continue
    fi
    rel="${ts_file#$REPO_ROOT/}"
    rel="${rel%.ts}"
    CURRENT_PAIRS+=("$rel")
  fi
done < <(find "$REPO_ROOT" -maxdepth 1 -type f -name "*.ts" 2>/dev/null)

# Load allowlist (if present) into an associative array for O(1) lookup
declare -A ALLOWED
if [ -f "$ALLOWLIST" ]; then
  while IFS= read -r line; do
    # Skip empty lines and comments
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    # Trim whitespace
    line="$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    ALLOWED["$line"]=1
  done < "$ALLOWLIST"
fi

# Classify each current pair as allowed or new drift
NEW_DRIFT=()
ALLOWED_HITS=()
for pair in "${CURRENT_PAIRS[@]}"; do
  if [ -n "${ALLOWED[$pair]:-}" ]; then
    ALLOWED_HITS+=("$pair")
  else
    NEW_DRIFT+=("$pair")
  fi
done

# Also find stale allowlist entries (files no longer dual)
declare -A CURRENT_LOOKUP
for pair in "${CURRENT_PAIRS[@]}"; do
  CURRENT_LOOKUP["$pair"]=1
done
STALE_ALLOWLIST=()
for allowed_pair in "${!ALLOWED[@]}"; do
  if [ -z "${CURRENT_LOOKUP[$allowed_pair]:-}" ]; then
    STALE_ALLOWLIST+=("$allowed_pair")
  fi
done

# Report
echo "================================================================"
echo "Dual TS/JS File Detector"
echo "================================================================"
echo "Search: ${SEARCH_DIRS[*]} + repo root (depth=1)"
echo "Allowlist: $ALLOWLIST ($([ -f "$ALLOWLIST" ] && echo "present" || echo "absent"))"
echo ""
echo "Current dual pairs: ${#CURRENT_PAIRS[@]}"
echo "  Allowed (in allowlist): ${#ALLOWED_HITS[@]}"
echo "  New drift (not allowed): ${#NEW_DRIFT[@]}"
echo "  Stale allowlist entries: ${#STALE_ALLOWLIST[@]}"
echo ""

if [ ${#ALLOWED_HITS[@]} -gt 0 ]; then
  echo "ℹ  Allowed dual pairs (known drift, tracked for Phase 2 deletion):"
  for pair in "${ALLOWED_HITS[@]}"; do
    echo "    $pair (.ts + .js)"
  done
  echo ""
fi

if [ ${#NEW_DRIFT[@]} -gt 0 ]; then
  echo "✗ NEW DRIFT DETECTED (not in allowlist):"
  for pair in "${NEW_DRIFT[@]}"; do
    echo "    $pair.ts has a .js sibling"
  done
  echo ""
  echo "Why this fails the build:"
  echo "  Node's resolver picks .js over .ts for extensionless imports, so"
  echo "  the .ts file becomes unreachable in production. Every edit to the"
  echo "  .ts is silently shadowed. See the full diagnosis at:"
  echo "    cline_docs/reviews/dual-ts-js-drift-eradication-2026-04-07/"
  echo ""
  echo "How to fix:"
  echo "  1. If the .js is stale: delete it (the .ts is the source of truth)"
  echo "  2. If the .js is intentional (JS-only callers from paichart-mcp):"
  echo "     add the pair to $ALLOWLIST with a comment explaining why"
  echo ""
fi

if [ ${#STALE_ALLOWLIST[@]} -gt 0 ]; then
  echo "⚠  Stale allowlist entries (pair no longer exists):"
  for pair in "${STALE_ALLOWLIST[@]}"; do
    echo "    $pair (remove from $ALLOWLIST)"
  done
  echo ""
fi

# Enforcement
if [ "$MODE" = "--report" ]; then
  echo "Mode: report-only (never fails)"
  exit 0
fi

if [ ${#NEW_DRIFT[@]} -gt 0 ]; then
  echo "✗ FAIL: ${#NEW_DRIFT[@]} new dual pair(s) not in allowlist"
  exit 1
fi

if [ ${#STALE_ALLOWLIST[@]} -gt 0 ]; then
  echo "⚠  WARNING: ${#STALE_ALLOWLIST[@]} stale allowlist entries (not a build failure, but clean up)"
fi

echo "✓ OK: no new dual drift detected"
exit 0
