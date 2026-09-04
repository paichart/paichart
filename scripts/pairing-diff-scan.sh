#!/usr/bin/env bash
# pairing-diff-scan.sh — Quarterly config↔discovery pairing-diff scan (CLAUDE.md Protocol 12 / health-run).
#
# Flags the canonical failure "config updated in a refactor, paired discovery lagged":
# a specialist config edited since SINCE whose RESOLVED paired discovery was NOT edited.
#
# Improvement over the old inline scan (2026-07-12): resolves each config's REAL discovery
# pointer instead of assuming `${basename}-discovery.md`. The name-assumption silently skipped
# 8 live pairs whose discovery filename differs from the specialist basename (e.g.
# dev-ops → deployment-discovery, validation-engine → validation-discovery). Retired tombstones
# are detected via the frontmatter `description: RETIRED` / `⚰️ RETIRED` heading (a whole-file
# RETIRED grep false-positives on configs that mention other retired agents in prose).
#
# Usage:  scripts/pairing-diff-scan.sh [SINCE_DATE]
#   SINCE_DATE defaults to the PREVIOUS health-run date. Pass e.g. 2026-07-12.
#
# Exit: 0 always (advisory tool). Each flag/warning is a candidate for human review
# (Protocol 11 Part C): READ both files and diff the config's CLAIMS against the discovery —
# a config-only edit may not need a discovery change; every contradiction IS a finding.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

SINCE="${1:-2026-07-12}"
DISCO_DIR=".claude/knowledge/discoveries"

echo "=== Pairing-diff scan (config edited since $SINCE, RESOLVED discovery untouched) ==="
echo ""

total=0; scanned=0; tombstone=0; unpaired=0; flagged=0; broken=0

# Resolve a config's primary discovery basename (e.g. "deployment-discovery.md").
# Chain: (1) first discoveries/*.md under a "Discovery Prompt"/"My Discovery" heading,
#        (2) name-matched ${b}-discovery.md if it exists on disk,
#        (3) first discoveries/*.md mentioned anywhere in the config.
resolve_discovery() {
  local f="$1" b="$2" hln prim
  hln=$(grep -niE "^#+.*discovery prompt|my discovery" "$f" | head -1 | cut -d: -f1 || true)
  if [ -n "$hln" ]; then
    prim=$(tail -n +"$hln" "$f" | grep -oE "discoveries/[a-z0-9-]+\.md" | head -1 | sed 's|discoveries/||' || true)
    [ -n "$prim" ] && { echo "$prim"; return; }
  fi
  if [ -f "$DISCO_DIR/${b}-discovery.md" ]; then
    echo "${b}-discovery.md"; return
  fi
  prim=$(grep -oE "discoveries/[a-z0-9-]+\.md" "$f" | head -1 | sed 's|discoveries/||' || true)
  [ -n "$prim" ] && echo "$prim"
}

for f in .claude/agents/*-specialist.md; do
  b=$(basename "$f" -specialist.md)
  total=$((total+1))

  # Skip retired tombstones (reliable markers only)
  if grep -qE "^description: RETIRED|^# ⚰️ RETIRED" "$f"; then
    tombstone=$((tombstone+1))
    continue
  fi

  d_name=$(resolve_discovery "$f" "$b")
  if [ -z "$d_name" ]; then
    unpaired=$((unpaired+1))
    echo "⚠️  UNPAIRED — no resolvable discovery pointer: $b"
    continue
  fi

  d="$DISCO_DIR/$d_name"
  if [ ! -f "$d" ]; then
    broken=$((broken+1))
    echo "⚠️  BROKEN POINTER — $b → $d_name (file missing on disk)"
    continue
  fi

  scanned=$((scanned+1))
  cc=$(git log --oneline --since="$SINCE" -- "$f" | wc -l | tr -d ' ')
  dc=$(git log --oneline --since="$SINCE" -- "$d" | wc -l | tr -d ' ')
  if [ "$cc" -gt 0 ] && [ "$dc" -eq 0 ]; then
    flagged=$((flagged+1))
    echo "⚠️  DRIFT CANDIDATE — config edited since $SINCE, discovery untouched:"
    echo "        $b  →  $d_name"
  fi
done

echo ""
echo "=== Coverage summary ==="
echo "  specialist configs      : $total"
echo "  scanned (resolved pair) : $scanned"
echo "  retired tombstones      : $tombstone (correctly excluded)"
echo "  UNPAIRED (needs a pair) : $unpaired"
echo "  BROKEN pointers         : $broken"
echo "  DRIFT candidates        : $flagged"
echo ""
echo "Each DRIFT candidate is a heuristic pre-filter hit — READ both files and diff the config's"
echo "CLAIMS against the discovery (Protocol 11 Part C). A config-only edit may not need a discovery"
echo "change; every contradiction IS a finding. See SPECIALIST-LIFECYCLE-GUIDE §3 MAINTAIN."
