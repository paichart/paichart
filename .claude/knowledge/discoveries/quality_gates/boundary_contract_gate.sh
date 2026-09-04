#!/bin/bash

# Boundary Contract Quality Gate
# Validates that plans involving data transformations properly handle field propagation
# Prevents "boundary field leakage" bugs (Oct 20-21, 2025 pattern)
#
# Usage: boundary_contract_gate.sh <plan-file>
# Exit 0: No issues
# Exit 1: Manual review required

echo "=== BOUNDARY CONTRACT GATE ==="
echo ""

PLAN_FILE=$1

if [ -z "$PLAN_FILE" ]; then
  echo "Usage: boundary_contract_gate.sh <plan-file>"
  echo "Example: boundary_contract_gate.sh feature-plan.md"
  exit 1
fi

if [ ! -f "$PLAN_FILE" ]; then
  echo "❌ Error: File not found: $PLAN_FILE"
  exit 1
fi

# Initialize counters
BOUNDARY_SCORE=0
JWT_TRANSFORMS=0
USER_TRANSFORMS=0
RBAC_USAGE=0
API_FORWARDING=0

# 1. Detect boundary transformations
echo "📊 Analyzing boundaries in plan..."
BOUNDARY_KEYWORDS=$(grep -oE "→|transform|convert|map|decode|encode" "$PLAN_FILE" | wc -l)

if [ $BOUNDARY_KEYWORDS -gt 0 ]; then
  echo "   Found $BOUNDARY_KEYWORDS boundary transformation indicators"
  BOUNDARY_SCORE=$((BOUNDARY_SCORE + 1))
else
  echo "   No explicit boundary transformations found"
fi

echo ""

# 2. Check for JWT-related transformations
echo "🔍 Checking for JWT/Token transformations..."
JWT_TRANSFORMS=$(grep -ci "JWT\|jwt\|token\|payload\|mintMcp\|verifyAccess\|RS256\|HS256" "$PLAN_FILE")

if [ $JWT_TRANSFORMS -gt 0 ]; then
  echo "   ⚠️  JWT transformations detected ($JWT_TRANSFORMS references)"
  echo ""
  echo "   📋 REQUIRED CONTRACT FIELDS:"
  echo "      - sub/userId (user identifier)"
  echo "      - email (for getAuthUser compatibility)"
  echo "      - role (for RBAC filtering)"
  echo "      - scope (OAuth scope string)"
  echo "      - azp (authorized party / client_id)"
  echo "      - jti (JWT ID for revocation)"
  echo ""
  echo "   ✅ VALIDATION CHECKLIST:"
  echo "      - [ ] mintMcpToken includes email parameter"
  echo "      - [ ] mintMcpToken includes role parameter"
  echo "      - [ ] All call sites pass email and role"
  echo "      - [ ] getAuthUser can extract email and role from JWT"
  echo "      - [ ] Compare with HS256 JWT (should have same fields)"
  echo ""

  BOUNDARY_SCORE=$((BOUNDARY_SCORE + 2))
else
  echo "   ✅ No JWT transformations detected"
fi

echo ""

# 3. Check for User object transformations
echo "🔍 Checking for User object transformations..."
USER_TRANSFORMS=$(grep -ci "user\|req\.user\|AuthUser\|getAuthUser" "$PLAN_FILE")

if [ $USER_TRANSFORMS -gt 0 ]; then
  echo "   ⚠️  User object transformations detected ($USER_TRANSFORMS references)"
  echo ""
  echo "   📋 REQUIRED CONTRACT FIELDS:"
  echo "      - id/userId (database identifier)"
  echo "      - email (user email address)"
  echo "      - role (USER, ADMIN, DEMO_USER, etc.)"
  echo "      - token (if forwarding to API) ← CRITICAL!"
  echo ""
  echo "   ✅ VALIDATION CHECKLIST:"
  echo "      - [ ] req.user includes id/userId"
  echo "      - [ ] req.user includes email"
  echo "      - [ ] req.user includes role"
  echo "      - [ ] req.user includes token (if API forwarding)"
  echo "      - [ ] ContextEnricher preserves all fields"
  echo ""

  BOUNDARY_SCORE=$((BOUNDARY_SCORE + 2))
else
  echo "   ✅ No User object transformations detected"
fi

echo ""

# 4. Check for RBAC usage
echo "🔍 Checking for RBAC dependencies..."
RBAC_USAGE=$(grep -ci "role\|permission\|RBAC\|DEMO_USER\|ADMIN\|USER.*role\|canAccess" "$PLAN_FILE")

if [ $RBAC_USAGE -gt 0 ]; then
  echo "   ⚠️  RBAC filtering detected ($RBAC_USAGE references)"
  echo ""
  echo "   📋 CRITICAL REQUIREMENT:"
  echo "      - user.role MUST exist at filtering point"
  echo "      - Role must be passed through ALL boundaries"
  echo ""
  echo "   ✅ VALIDATION CHECKLIST:"
  echo "      - [ ] JWT payload includes role"
  echo "      - [ ] getAuthUser extracts role from JWT"
  echo "      - [ ] req.user includes role"
  echo "      - [ ] API receives role in user object"
  echo "      - [ ] No boundary drops role field"
  echo ""

  BOUNDARY_SCORE=$((BOUNDARY_SCORE + 2))
else
  echo "   ✅ No RBAC filtering detected"
fi

echo ""

# 5. Check for API forwarding
echo "🔍 Checking for API forwarding..."
API_FORWARDING=$(grep -ci "api.*forward\|apiClient\|API.*call\|fetch.*api\|Authorization.*Bearer" "$PLAN_FILE")

if [ $API_FORWARDING -gt 0 ]; then
  echo "   ⚠️  API forwarding detected ($API_FORWARDING references)"
  echo ""
  echo "   📋 CRITICAL REQUIREMENT:"
  echo "      - req.user.token MUST exist for Authorization header"
  echo ""
  echo "   ✅ VALIDATION CHECKLIST:"
  echo "      - [ ] MCP authentication sets req.user.token"
  echo "      - [ ] ContextEnricher includes token in apiUserContext"
  echo "      - [ ] API client receives token"
  echo "      - [ ] Token forwarded in Authorization header"
  echo ""

  BOUNDARY_SCORE=$((BOUNDARY_SCORE + 2))
else
  echo "   ✅ No API forwarding detected"
fi

echo ""

# 6. Summary and recommendations
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "BOUNDARY CONTRACT VALIDATION SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Boundary Risk Score: $BOUNDARY_SCORE/10"
echo ""

if [ $BOUNDARY_SCORE -eq 0 ]; then
  echo "✅ LOW RISK - No boundary transformations detected"
  echo "   Plan appears safe from boundary field leakage"
  echo ""
  exit 0
fi

if [ $BOUNDARY_SCORE -le 3 ]; then
  echo "⚠️  MODERATE RISK - Some boundary transformations detected"
  echo "   Recommendation: Review contracts, add validation logging"
  echo ""
fi

if [ $BOUNDARY_SCORE -ge 4 ]; then
  echo "🔴 HIGH RISK - Multiple boundary transformations detected"
  echo "   Recommendation: Run boundary-contract-specialist before implementation"
  echo ""
fi

echo "REQUIRED ACTIONS:"
echo "- [ ] Map all boundaries plan will cross"
echo "- [ ] Define contracts (required fields) for each boundary"
echo "- [ ] Validate source produces what destination needs"
echo "- [ ] Add BoundaryLogger at each crossing point"
echo "- [ ] Compare with working implementation if similar code exists"
echo "- [ ] Create contract tests for critical boundaries"
echo ""

echo "HISTORICAL CONTEXT:"
echo "- Oct 20, 2025: Missing req.user.token → API forwarding failed (2h debug)"
echo "- Oct 21, 2025: Missing JWT email/role → RBAC broken (1h debug)"
echo "- Both bugs: Authentication succeeded, downstream failed mysteriously"
echo "- Both fixes: Add missing fields to source (1-line change)"
echo ""

if [ $BOUNDARY_SCORE -ge 4 ]; then
  echo "📋 NEXT STEPS:"
  echo "   1. Activate boundary-contract-specialist"
  echo "   2. Run: cline_docs/discovery-prompts/boundary-contract-discovery.md"
  echo "   3. Use 5-minute comparative analysis protocol"
  echo "   4. Validate all contracts before implementation"
  echo ""
  exit 1  # Requires specialist review
fi

if [ $BOUNDARY_SCORE -ge 1 ]; then
  echo "📋 NEXT STEPS:"
  echo "   1. Review checklist items above"
  echo "   2. Consider adding BoundaryLogger during development"
  echo "   3. Reference: cline_docs/debugging-methodology-boundary-contracts.md"
  echo ""
  exit 1  # Requires manual review
fi

exit 0
