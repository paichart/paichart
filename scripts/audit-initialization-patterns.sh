#!/bin/bash
# Audit for silent initialization failure patterns
# Based on SCRAM Authentication Bug learnings (Nov 2025)
#
# Usage: ./scripts/audit-initialization-patterns.sh
#
# Detects:
# 1. Constructor async initialization (dangerous)
# 2. Module-level client creation (dangerous)
# 3. process.env access in constructors (risky)
# 4. Missing lazy initialization patterns (risky)
# 5. Event listener timing issues (risky)

echo "╔═══════════════════════════════════════╗"
echo "║ SILENT INITIALIZATION FAILURE AUDIT   ║"
echo "╚═══════════════════════════════════════╝"
echo ""
echo "Based on: SCRAM Auth Bug (Nov 2025)"
echo "Pattern: Constructor init + undefined env vars = silent failures"
echo ""

ISSUES=0
WARNINGS=0

# Color codes
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. Constructor Async Initialization"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Risk: High - Runs before env vars loaded"
echo ""

CONSTRUCTOR_ASYNC=$(grep -rn "constructor" lib/ --include="*.ts" -A 20 2>/dev/null | \
  grep -E "this\.(initialize|connect|start|setup|init)\(" | \
  grep -v "// " | wc -l)

if [ "$CONSTRUCTOR_ASYNC" -gt 0 ]; then
  echo -e "${RED}❌ Found: $CONSTRUCTOR_ASYNC potential issues${NC}"
  grep -rn "constructor" lib/ --include="*.ts" -A 20 2>/dev/null | \
    grep -E "this\.(initialize|connect|start|setup|init)\(" | \
    grep -v "// " | head -10
  ISSUES=$((ISSUES + CONSTRUCTOR_ASYNC))
else
  echo -e "${GREEN}✅ No constructor async initialization found${NC}"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. Module-Level Client Creation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Risk: High - Creates connection at import time"
echo ""

MODULE_CLIENTS=$(grep -rn "^const.*= new Client\|^let.*= new Client\|^const.*= new Pool\|^let.*= new Pool" lib/ --include="*.ts" 2>/dev/null | wc -l)

if [ "$MODULE_CLIENTS" -gt 0 ]; then
  echo -e "${RED}❌ Found: $MODULE_CLIENTS potential issues${NC}"
  grep -rn "^const.*= new Client\|^let.*= new Client\|^const.*= new Pool\|^let.*= new Pool" lib/ --include="*.ts" 2>/dev/null
  ISSUES=$((ISSUES + MODULE_CLIENTS))
else
  echo -e "${GREEN}✅ No module-level client creation found${NC}"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. process.env in Constructors"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Risk: Medium - May be undefined at module load"
echo "   Exception: NODE_ENV checks for logging are safe"
echo ""

# Find process.env in constructors, excluding safe NODE_ENV checks
ENV_CONSTRUCTOR=$(grep -rn "constructor" lib/ --include="*.ts" -A 20 2>/dev/null | \
  grep "process\.env\." | \
  grep -v "NODE_ENV" | wc -l)

if [ "$ENV_CONSTRUCTOR" -gt 0 ]; then
  echo -e "${YELLOW}⚠️  Found: $ENV_CONSTRUCTOR potential issues (excluding NODE_ENV)${NC}"
  grep -rn "constructor" lib/ --include="*.ts" -A 20 2>/dev/null | \
    grep "process\.env\." | \
    grep -v "NODE_ENV" | head -10
  WARNINGS=$((WARNINGS + ENV_CONSTRUCTOR))
else
  echo -e "${GREEN}✅ No risky process.env access in constructors${NC}"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4. Missing Lazy Initialization"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Risk: Medium - isConnected without connect() method"
echo ""

MISSING_CONNECT=0
for file in $(grep -rl "isConnected" lib/ --include="*.ts" 2>/dev/null); do
  has_connect=$(grep -cE "async connect\(\)|connect\(\):|public connect\(" "$file" 2>/dev/null || echo 0)
  if [ "$has_connect" = "0" ]; then
    echo -e "${YELLOW}⚠️  $file - has isConnected but no connect() method${NC}"
    MISSING_CONNECT=$((MISSING_CONNECT + 1))
  fi
done

if [ "$MISSING_CONNECT" -eq 0 ]; then
  echo -e "${GREEN}✅ All isConnected classes have connect() methods${NC}"
else
  WARNINGS=$((WARNINGS + MISSING_CONNECT))
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5. Event Listener Timing (Race Conditions)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Risk: Medium - Listeners registered after events fire"
echo ""

# Look for .on('connected') that comes AFTER await statements
LISTENER_TIMING=$(grep -rn "registerEventSystem\|\.register(" lib/ --include="*.ts" -A 10 2>/dev/null | \
  grep "\.on('connected" | wc -l)

if [ "$LISTENER_TIMING" -gt 0 ]; then
  echo -e "${YELLOW}⚠️  Found $LISTENER_TIMING potential timing issues - verify listeners are set BEFORE registration${NC}"
  WARNINGS=$((WARNINGS + 1))
else
  echo -e "${GREEN}✅ No obvious event listener timing issues${NC}"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6. Singleton Constructor Safety"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Checking singleton patterns for non-empty constructors"
echo "   (Empty constructors are safe, non-empty need review)"
echo ""

UNSAFE_SINGLETONS=0
for file in $(grep -rl "getInstance\|getShared" lib/ --include="*.ts" 2>/dev/null); do
  # Check if constructor is empty (safe) or has content (needs review)
  # Empty constructor patterns: "constructor() {}" or "private constructor() {}"
  has_empty_constructor=$(grep -cE "constructor\(\)\s*\{\s*\}" "$file" 2>/dev/null)
  has_empty_constructor=${has_empty_constructor:-0}
  has_any_constructor=$(grep -cE "constructor\(" "$file" 2>/dev/null)
  has_any_constructor=${has_any_constructor:-0}

  # If has constructor but it's not empty, flag for review
  if [ "$has_any_constructor" -gt 0 ] && [ "$has_empty_constructor" -eq 0 ]; then
    # Check if constructor body contains async patterns on same line
    has_risky_pattern=$(grep -E "constructor.*\{.*this\.(init|connect|start)" "$file" 2>/dev/null | wc -l)
    has_risky_pattern=${has_risky_pattern:-0}
    if [ "$has_risky_pattern" -gt 0 ]; then
      echo -e "${RED}❌ $file - singleton with risky constructor${NC}"
      UNSAFE_SINGLETONS=$((UNSAFE_SINGLETONS + 1))
    fi
  fi
done

if [ "$UNSAFE_SINGLETONS" -eq 0 ]; then
  echo -e "${GREEN}✅ All singletons have safe constructors${NC}"
else
  ISSUES=$((ISSUES + UNSAFE_SINGLETONS))
fi
echo ""

echo "╔═══════════════════════════════════════╗"
echo "║ AUDIT SUMMARY                         ║"
echo "╚═══════════════════════════════════════╝"
echo ""

if [ "$ISSUES" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
  echo -e "${GREEN}✅ PASSED - No silent initialization patterns detected${NC}"
  echo ""
  echo "All checks passed:"
  echo "  • No constructor async initialization"
  echo "  • No module-level client creation"
  echo "  • No risky process.env access"
  echo "  • All isConnected classes have connect()"
  echo "  • Singleton constructors are safe"
  exit 0
elif [ "$ISSUES" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  PASSED WITH WARNINGS${NC}"
  echo ""
  echo "Critical issues: 0"
  echo "Warnings: $WARNINGS (review recommended)"
  exit 0
else
  echo -e "${RED}❌ FAILED - Found $ISSUES critical issues${NC}"
  echo ""
  echo "Critical issues: $ISSUES (must fix)"
  echo "Warnings: $WARNINGS"
  echo ""
  echo "Fix patterns available in:"
  echo "  /.claude/knowledge/discoveries/silent-initialization-failure-discovery.md"
  exit 1
fi
