#!/bin/bash
# Time Bomb Pattern Scanner
# Discovers latent code issues that cause problems over time
#
# Usage: ./scripts/time-bomb-scan.sh [--verbose]
#
# Created: 2026-01-06
# Reference: /.claude/knowledge/discoveries/time-bomb-pattern-discovery.md

set -e

VERBOSE=false
if [ "$1" = "--verbose" ]; then
  VERBOSE=true
fi

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           TIME BOMB PATTERN SCANNER                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

WARNINGS=0

# 1. Orphaned Cleanup Methods
echo "━━━ 1. ORPHANED CLEANUP METHODS ━━━"
cleanup_methods=$(grep -rn "clean.*=.*function\|\.clean.*=\|cleanup.*function\|purge.*function\|expire.*function" \
  --include="*.js" --include="*.ts" lib/ 2>/dev/null | grep -v node_modules | grep -v "\.d\.ts" || true)

if [ -n "$cleanup_methods" ]; then
  echo "Found cleanup-related methods:"
  echo "$cleanup_methods" | while read -r line; do
    file=$(echo "$line" | cut -d: -f1)
    method=$(echo "$line" | grep -oP '(clean|purge|expire)\w*' | head -1)
    if [ -n "$method" ]; then
      calls=$(grep -rn "$method(" --include="*.js" --include="*.ts" lib/ app/ 2>/dev/null | grep -v "function\|=.*=>" | wc -l)
      if [ "$calls" -eq 0 ]; then
        echo -e "  ${RED}⚠️  NEVER CALLED: $method in $file${NC}"
        ((WARNINGS++)) || true
      elif $VERBOSE; then
        echo -e "  ${GREEN}✓${NC} $method (called $calls times)"
      fi
    fi
  done
fi
echo ""

# 2. In-Memory Collections Without Cleanup
echo "━━━ 2. IN-MEMORY COLLECTIONS ━━━"
maps=$(grep -rn "new Map()\|= new Map\|\.Map()" --include="*.js" --include="*.ts" lib/ 2>/dev/null | \
  grep -v node_modules | grep -v test | grep -v "\.d\.ts" || true)

if [ -n "$maps" ]; then
  echo "$maps" | while read -r line; do
    file=$(echo "$line" | cut -d: -f1)
    has_delete=$(grep -c "\.delete(\|\.clear(" "$file" 2>/dev/null | tr -d '[:space:]' || echo "0")
    has_cleanup=$(grep -c "cleanup\|expire\|ttl\|TTL" "$file" 2>/dev/null | tr -d '[:space:]' || echo "0")

    if [ "${has_delete:-0}" -eq 0 ] && [ "${has_cleanup:-0}" -eq 0 ]; then
      linenum=$(echo "$line" | cut -d: -f2)
      echo -e "  ${YELLOW}⚠️  No cleanup: $file:$linenum${NC}"
      ((WARNINGS++)) || true
    elif $VERBOSE; then
      echo -e "  ${GREEN}✓${NC} $file (has cleanup)"
    fi
  done
fi
echo ""

# 3. Timers Without Cleanup
echo "━━━ 3. TIMERS ━━━"
intervals=$(grep -rn "setInterval" --include="*.js" --include="*.ts" lib/ 2>/dev/null | \
  grep -v node_modules | grep -v "\.d\.ts" | wc -l)
clears=$(grep -rn "clearInterval" --include="*.js" --include="*.ts" lib/ 2>/dev/null | \
  grep -v node_modules | grep -v "\.d\.ts" | wc -l)
timeouts=$(grep -rn "setTimeout" --include="*.js" --include="*.ts" lib/ 2>/dev/null | \
  grep -v node_modules | grep -v "\.d\.ts" | wc -l)
clear_timeouts=$(grep -rn "clearTimeout" --include="*.js" --include="*.ts" lib/ 2>/dev/null | \
  grep -v node_modules | grep -v "\.d\.ts" | wc -l)

echo "  setInterval: $intervals, clearInterval: $clears"
echo "  setTimeout: $timeouts, clearTimeout: $clear_timeouts"

if [ "$intervals" -gt "$clears" ]; then
  echo -e "  ${YELLOW}⚠️  More setInterval than clearInterval (potential leak)${NC}"
  ((WARNINGS++)) || true
fi
echo ""

# 4. Event Listeners
echo "━━━ 4. EVENT LISTENERS ━━━"
ons=$(grep -rn "\.on(" --include="*.js" --include="*.ts" lib/ 2>/dev/null | \
  grep -v node_modules | grep -v "\.d\.ts" | wc -l)
offs=$(grep -rn "\.off(\|\.removeListener(\|\.removeAllListeners(" --include="*.js" --include="*.ts" lib/ 2>/dev/null | \
  grep -v node_modules | grep -v "\.d\.ts" | wc -l)

echo "  .on() calls: $ons"
echo "  .off()/.removeListener() calls: $offs"

if [ "$ons" -gt $((offs * 3)) ]; then
  echo -e "  ${YELLOW}⚠️  Significantly more .on() than removals${NC}"
  ((WARNINGS++)) || true
fi
echo ""

# 5. TODO/FIXME Comments
echo "━━━ 5. TODO/FIXME COMMENTS ━━━"
todos=$(grep -rn "TODO\|FIXME\|HACK\|XXX" --include="*.js" --include="*.ts" lib/ app/ 2>/dev/null | \
  grep -v node_modules | grep -v "\.d\.ts" | wc -l)
echo "  Found $todos TODO/FIXME/HACK/XXX comments"

if [ "$todos" -gt 20 ]; then
  echo -e "  ${YELLOW}⚠️  High TODO count - review for stale items${NC}"
  if $VERBOSE; then
    grep -rn "TODO\|FIXME" --include="*.js" --include="*.ts" lib/ app/ 2>/dev/null | \
      grep -v node_modules | head -10
  fi
fi
echo ""

# 6. Empty Catch Blocks
echo "━━━ 6. ERROR HANDLING ━━━"
# This is a simplified check - manual review recommended
empty_catches=$(grep -rn "catch.*{" --include="*.js" --include="*.ts" lib/ -A 1 2>/dev/null | \
  grep -B1 "^[^:]*-[[:space:]]*}[[:space:]]*$" | grep "catch" | wc -l || echo "0")

echo "  Potentially empty catch blocks: $empty_catches"
if [ "$empty_catches" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠️  Review catch blocks for silent error swallowing${NC}"
  ((WARNINGS++)) || true
fi
echo ""

# 7. Dead Exports (simplified check)
echo "━━━ 7. DEAD CODE CHECK ━━━"
# Check for declared but potentially unused Maps
dead_maps=$(grep -rn "this\.\w\+ = new Map()" --include="*.js" lib/ 2>/dev/null | \
  grep -v node_modules || true)

if [ -n "$dead_maps" ]; then
  echo "$dead_maps" | while read -r line; do
    file=$(echo "$line" | cut -d: -f1)
    prop=$(echo "$line" | grep -oP 'this\.\K\w+(?=\s*=)')
    if [ -n "$prop" ]; then
      uses=$(grep -c "this\.$prop" "$file" 2>/dev/null || echo "0")
      if [ "$uses" -le 1 ]; then
        echo -e "  ${RED}⚠️  DEAD: this.$prop in $file (only declared, never used)${NC}"
        ((WARNINGS++)) || true
      fi
    fi
  done
fi
echo ""

# Summary
echo "╔══════════════════════════════════════════════════════════════╗"
if [ "$WARNINGS" -gt 0 ]; then
  echo -e "║  ${YELLOW}SCAN COMPLETE: $WARNINGS potential time bombs found${NC}              ║"
  echo "║  Run with --verbose for more details                         ║"
else
  echo -e "║  ${GREEN}SCAN COMPLETE: No obvious time bombs detected${NC}              ║"
fi
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Reference: /.claude/knowledge/discoveries/time-bomb-pattern-discovery.md"
