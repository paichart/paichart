#!/bin/bash
#
# POV Access Completeness Audit Script
#
# Purpose: Find all instances of:
# 1. POV queries missing ownerId/metadata before validatePOVAccess calls
# 2. Dual permission checks (validatePOVAccess + checkPermission)
#
# Created: November 7, 2025
# Triggered by: Task domain permission bug discovery
#

set -e

echo "════════════════════════════════════════════════════════════"
echo "🔍 POV Access Completeness Audit"
echo "════════════════════════════════════════════════════════════"
echo ""

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_FILES=0
INCOMPLETE_QUERIES=0
DUAL_CHECKS=0
COMPLETE_QUERIES=0

# Arrays to store results
declare -a INCOMPLETE_FILES
declare -a DUAL_CHECK_FILES
declare -a COMPLETE_FILES

echo "Phase 1: Scanning for validatePOVAccess usage..."
echo "─────────────────────────────────────────────────────────────"
echo ""

# Find all files using validatePOVAccess
VALIDATE_FILES=$(grep -r "validatePOVAccess" lib/ app/ --include="*.ts" -l 2>/dev/null | grep -v "node_modules" | grep -v "cline_docs" | grep -v ".claude" | grep -v "temp-scripts" || true)

if [ -z "$VALIDATE_FILES" ]; then
  echo "${YELLOW}⚠️  No files found using validatePOVAccess${NC}"
  exit 0
fi

echo "Found $(echo "$VALIDATE_FILES" | wc -l) files using validatePOVAccess"
echo ""

# Check each file
for file in $VALIDATE_FILES; do
  TOTAL_FILES=$((TOTAL_FILES + 1))

  # Skip the definition file itself
  if [[ "$file" == *"validate-pov-access.ts"* ]]; then
    continue
  fi

  # Check if file has POV query
  if grep -q "prisma.pOV.find" "$file"; then

    # Extract POV query section (20 lines after findUnique)
    POV_QUERY=$(grep -A 20 "prisma.pOV.find" "$file" 2>/dev/null || echo "")

    # Check for required fields
    HAS_OWNER_ID=$(echo "$POV_QUERY" | grep -c "ownerId" || echo "0")
    HAS_METADATA=$(echo "$POV_QUERY" | grep -c "metadata" || echo "0")
    HAS_TEAM_MEMBERS=$(echo "$POV_QUERY" | grep -c "members" || echo "0")
    HAS_POV_ID=$(echo "$POV_QUERY" | grep -c "id:" || echo "0")

    MISSING=""
    if [ "$HAS_OWNER_ID" -eq "0" ]; then
      MISSING="${MISSING}ownerId "
    fi
    if [ "$HAS_METADATA" -eq "0" ]; then
      MISSING="${MISSING}metadata "
    fi
    if [ "$HAS_TEAM_MEMBERS" -eq "0" ]; then
      MISSING="${MISSING}team.members "
    fi
    if [ "$HAS_POV_ID" -eq "0" ]; then
      MISSING="${MISSING}id "
    fi

    if [ -n "$MISSING" ]; then
      # Incomplete query found
      INCOMPLETE_QUERIES=$((INCOMPLETE_QUERIES + 1))
      INCOMPLETE_FILES+=("$file|$MISSING")
      echo "${RED}❌ INCOMPLETE${NC}: $file"
      echo "   Missing: $MISSING"
      echo ""
    else
      # Complete query
      COMPLETE_QUERIES=$((COMPLETE_QUERIES + 1))
      COMPLETE_FILES+=("$file")
    fi
  fi
done

echo ""
echo "Phase 2: Scanning for dual permission checks..."
echo "─────────────────────────────────────────────────────────────"
echo ""

# Find files with BOTH validatePOVAccess AND checkPermission
for file in $VALIDATE_FILES; do
  # Skip the definition files
  if [[ "$file" == *"validate-pov-access.ts"* ]] || [[ "$file" == *"permissions.ts"* ]]; then
    continue
  fi

  # Check if file also has checkPermission call (not just import)
  if grep -q "await.*checkPermission\|checkPermission(" "$file" 2>/dev/null; then
    DUAL_CHECKS=$((DUAL_CHECKS + 1))
    DUAL_CHECK_FILES+=("$file")
    echo "${YELLOW}⚠️  DUAL CHECK${NC}: $file"

    # Show context
    DUAL_LINES=$(grep -n "validatePOVAccess\|checkPermission(" "$file" | grep -v "import" | head -5)
    echo "   Lines: $(echo "$DUAL_LINES" | cut -d: -f1 | tr '\n' ',' | sed 's/,$//')"
    echo ""
  fi
done

echo ""
echo "════════════════════════════════════════════════════════════"
echo "📊 AUDIT RESULTS"
echo "════════════════════════════════════════════════════════════"
echo ""

echo "${BLUE}Summary:${NC}"
echo "  Total files scanned: $TOTAL_FILES"
echo "  Complete POV queries: ${GREEN}$COMPLETE_QUERIES${NC}"
echo "  Incomplete POV queries: ${RED}$INCOMPLETE_QUERIES${NC}"
echo "  Dual permission checks: ${YELLOW}$DUAL_CHECKS${NC}"
echo ""

if [ $INCOMPLETE_QUERIES -gt 0 ]; then
  echo "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo "${RED}🚨 INCOMPLETE POV QUERIES (HIGH PRIORITY)${NC}"
  echo "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "These files call validatePOVAccess with incomplete POV data:"
  echo "Impact: DEMO_USER operations will fail (isOwner and isDemo checks won't work)"
  echo ""

  for item in "${INCOMPLETE_FILES[@]}"; do
    FILE=$(echo "$item" | cut -d'|' -f1)
    MISSING=$(echo "$item" | cut -d'|' -f2)
    echo "  ${RED}❌${NC} $FILE"
    echo "     Missing: $MISSING"
    echo ""
  done

  echo "${BLUE}Fix Pattern:${NC}"
  echo "  Add to POV query select:"
  echo "    id: true,              // For logging"
  echo "    ownerId: true,         // CRITICAL - isOwner check"
  echo "    metadata: true,        // CRITICAL - isDemo check"
  echo "    team: { select: { members: { select: { userId: true } } } }"
  echo ""
fi

if [ $DUAL_CHECKS -gt 0 ]; then
  echo "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo "${YELLOW}⚠️  DUAL PERMISSION CHECKS (REVIEW NEEDED)${NC}"
  echo "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "These files use BOTH validatePOVAccess AND checkPermission:"
  echo "Review: Are both checks needed or is one redundant?"
  echo ""

  for file in "${DUAL_CHECK_FILES[@]}"; do
    echo "  ${YELLOW}⚠️${NC}  $file"
  done

  echo ""
  echo "${BLUE}Assessment Questions:${NC}"
  echo "  1. Is checkPermission for system-level operation? (OK to keep both)"
  echo "  2. Is checkPermission redundant with validatePOVAccess? (Remove it)"
  echo "  3. Should operation be POV-scoped only? (Remove checkPermission)"
  echo ""
fi

if [ $INCOMPLETE_QUERIES -eq 0 ] && [ $DUAL_CHECKS -eq 0 ]; then
  echo "${GREEN}✅ ALL CLEAR!${NC}"
  echo ""
  echo "All POV queries include required fields for validatePOVAccess:"
  echo "  - ownerId (for isOwner check)"
  echo "  - metadata (for isDemo check)"
  echo "  - team.members (for isTeamMember check)"
  echo ""
  echo "No dual permission checks found (consistent auth model)."
  echo ""
fi

echo "════════════════════════════════════════════════════════════"
echo "📁 Full Report"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Saved to: cline_docs/reviews/task-domain-security-audit-2025-11-06/pov-access-scan-results.txt"
echo ""

# Save detailed report
{
  echo "POV Access Completeness Audit Report"
  echo "Generated: $(date)"
  echo "Scan Scope: lib/ app/ directories"
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "SUMMARY"
  echo "═══════════════════════════════════════════════════════════"
  echo ""
  echo "Total files scanned: $TOTAL_FILES"
  echo "Complete POV queries: $COMPLETE_QUERIES"
  echo "Incomplete POV queries: $INCOMPLETE_QUERIES"
  echo "Dual permission checks: $DUAL_CHECKS"
  echo ""

  if [ $INCOMPLETE_QUERIES -gt 0 ]; then
    echo "═══════════════════════════════════════════════════════════"
    echo "INCOMPLETE POV QUERIES (HIGH PRIORITY)"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    for item in "${INCOMPLETE_FILES[@]}"; do
      FILE=$(echo "$item" | cut -d'|' -f1)
      MISSING=$(echo "$item" | cut -d'|' -f2)
      echo "File: $FILE"
      echo "Missing: $MISSING"
      echo ""
    done
  fi

  if [ $DUAL_CHECKS -gt 0 ]; then
    echo "═══════════════════════════════════════════════════════════"
    echo "DUAL PERMISSION CHECKS (REVIEW NEEDED)"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    for file in "${DUAL_CHECK_FILES[@]}"; do
      echo "File: $file"
      echo ""
    done
  fi

  if [ $COMPLETE_QUERIES -gt 0 ]; then
    echo "═══════════════════════════════════════════════════════════"
    echo "COMPLETE POV QUERIES (CORRECTLY IMPLEMENTED)"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    for file in "${COMPLETE_FILES[@]}"; do
      echo "✅ $file"
    done
    echo ""
  fi

} > cline_docs/reviews/task-domain-security-audit-2025-11-06/pov-access-scan-results.txt

echo "✅ Audit complete!"
echo ""

# Exit with status based on findings
if [ $INCOMPLETE_QUERIES -gt 0 ]; then
  echo "${YELLOW}⚠️  Action required: Fix $INCOMPLETE_QUERIES incomplete POV queries${NC}"
  exit 1
else
  echo "${GREEN}✅ All POV queries are complete${NC}"
  exit 0
fi
