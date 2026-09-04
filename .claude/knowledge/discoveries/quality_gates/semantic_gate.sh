#!/bin/bash
# Semantic Consistency Quality Gate
# Prevents Plan 11-type semantic conflicts

PLAN_FILE=${1:-""}
if [ -z "$PLAN_FILE" ]; then
    echo "Usage: $0 <plan_file_path>"
    exit 1
fi

if [ ! -f "$PLAN_FILE" ]; then
    echo "❌ File not found: $PLAN_FILE"
    exit 1
fi

CONFLICTS=0

echo "🔍 Running Semantic Consistency Gate..."
echo "📋 Plan: $(basename $PLAN_FILE)"
echo ""

# Gate 1: Identity-requiring language in unauthenticated sections
echo "=== Gate 1: Identity Language Check ==="
IDENTITY_IN_UNAUTH=$(grep -A 10 -B 5 "unauthenticated.*access\|public.*access\|no.*auth.*required" "$PLAN_FILE" | grep -E "list_my_|get_.*_status|user_.*|my_.*|your_.*" | wc -l)

if [ $IDENTITY_IN_UNAUTH -gt 0 ]; then
    echo "❌ SEMANTIC CONFLICT: Identity-requiring functions in unauthenticated section"
    echo "   Found $IDENTITY_IN_UNAUTH instances of personal language in public access sections"
    grep -A 10 -B 5 "unauthenticated.*access\|public.*access" "$PLAN_FILE" | grep -E "list_my_|get_.*_status|user_.*|my_.*|your_.*" --color=always
    CONFLICTS=$((CONFLICTS + 1))
    echo ""
else
    echo "✅ No identity language in unauthenticated sections"
fi

# Gate 2: Personal data access without identity verification
echo "=== Gate 2: Personal Data Access Check ==="
PERSONAL_NO_AUTH=$(grep -E "my_\w+|your_\w+|user_specific.*data|personal.*info" "$PLAN_FILE" | grep -v -E "auth\|require.*auth\|protected\|login" | wc -l)

if [ $PERSONAL_NO_AUTH -gt 0 ]; then
    echo "❌ SEMANTIC CONFLICT: Personal data access without authentication requirement"
    echo "   Found $PERSONAL_NO_AUTH instances of personal data operations without auth"
    grep -E "my_\w+|your_\w+|user_specific.*data|personal.*info" "$PLAN_FILE" | grep -v -E "auth\|require.*auth\|protected" --color=always
    CONFLICTS=$((CONFLICTS + 1))
    echo ""
else
    echo "✅ Personal data operations properly protected"
fi

# Gate 3: Ownership language consistency
echo "=== Gate 3: Ownership Language Check ==="
OWNERSHIP_CONFLICTS=$(grep -E "list_my|get_my|my_services|my_trial|my_data" "$PLAN_FILE" | grep -E "public|unauthenticated|open.*access" | wc -l)

if [ $OWNERSHIP_CONFLICTS -gt 0 ]; then
    echo "❌ SEMANTIC CONFLICT: Ownership language with public access"
    echo "   Found $OWNERSHIP_CONFLICTS instances of 'my/your' language in public contexts"
    grep -E "list_my|get_my|my_services|my_trial|my_data" "$PLAN_FILE" | grep -E "public|unauthenticated|open.*access" --color=always
    CONFLICTS=$((CONFLICTS + 1))
    echo ""
else
    echo "✅ Ownership language properly aligned with access control"
fi

# Gate 4: Authentication requirement clarity
echo "=== Gate 4: Authentication Clarity Check ==="
AUTH_MENTIONS=$(grep -E "require.*auth|authentication.*required|need.*login|must.*auth" "$PLAN_FILE" | wc -l)
TOOL_MENTIONS=$(grep -E "tool|function|operation|endpoint" "$PLAN_FILE" | wc -l)

if [ $AUTH_MENTIONS -eq 0 ] && [ $TOOL_MENTIONS -gt 5 ]; then
    echo "⚠️  CLARITY WARNING: Many tools/operations but no clear authentication requirements"
    echo "   Consider adding explicit authentication sections"
elif [ $AUTH_MENTIONS -gt 0 ]; then
    echo "✅ Authentication requirements clearly documented"
fi

# Summary
echo ""
echo "=== Semantic Gate Summary ==="
echo "📊 Conflicts Found: $CONFLICTS"
echo "📋 Plan File: $PLAN_FILE"
echo "🔍 Total Lines Analyzed: $(wc -l < "$PLAN_FILE")"

if [ $CONFLICTS -eq 0 ]; then
    echo "✅ SEMANTIC CONSISTENCY GATE: PASSED"
    echo "   No semantic conflicts detected. Plan is consistent."
    exit 0
else
    echo "❌ SEMANTIC CONSISTENCY GATE: FAILED"
    echo "   $CONFLICTS semantic conflicts must be resolved before implementation"
    echo ""
    echo "🛠️  Recommended Actions:"
    echo "   1. Review identity-requiring functions and ensure proper authentication"
    echo "   2. Move personal data operations to authenticated sections"  
    echo "   3. Apply Authentication Access Decision Matrix to conflicted tools"
    echo "   4. Consider alternative public tools for onboarding/exploration"
    exit 1
fi