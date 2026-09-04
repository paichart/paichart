#!/bin/bash
# Security-UX Balance Quality Gate  
# Validates authentication friction vs onboarding value

PLAN_FILE=${1:-""}
if [ -z "$PLAN_FILE" ]; then
    echo "Usage: $0 <plan_file_path>"
    exit 1
fi

if [ ! -f "$PLAN_FILE" ]; then
    echo "❌ File not found: $PLAN_FILE"
    exit 1
fi

WARNINGS=0
ISSUES=0

echo "🔐 Running Security-UX Balance Gate..."
echo "📋 Plan: $(basename $PLAN_FILE)"
echo ""

# Gate 1: Tool distribution balance
echo "=== Gate 1: Tool Access Distribution ==="
UNAUTHENTICATED_TOOLS=$(grep -E "unauthenticated.*access|public.*access|no.*auth.*required" "$PLAN_FILE" -A 10 | grep -o '`[^`]*`' | wc -l)
AUTHENTICATED_TOOLS=$(grep -E "authentication.*required|require.*auth|protected|auth.*check" "$PLAN_FILE" -A 10 | grep -o '`[^`]*`' | wc -l)

echo "📊 Tool Distribution:"
echo "   Public Tools: $UNAUTHENTICATED_TOOLS"
echo "   Protected Tools: $AUTHENTICATED_TOOLS"

# Calculate ratios  
if [ $UNAUTHENTICATED_TOOLS -gt 0 ] && [ $AUTHENTICATED_TOOLS -gt 0 ]; then
    TOTAL_TOOLS=$((UNAUTHENTICATED_TOOLS + AUTHENTICATED_TOOLS))
    PUBLIC_RATIO=$((UNAUTHENTICATED_TOOLS * 100 / TOTAL_TOOLS))
    echo "   Public Ratio: ${PUBLIC_RATIO}%"
    
    # Optimal range: 40-70% public tools for good onboarding
    if [ $PUBLIC_RATIO -lt 30 ]; then
        echo "⚠️  UX WARNING: Too few public tools ($PUBLIC_RATIO%) - may hinder onboarding"
        echo "   Recommendation: Consider making more read-only operations public"
        WARNINGS=$((WARNINGS + 1))
    elif [ $PUBLIC_RATIO -gt 80 ]; then
        echo "⚠️  SECURITY WARNING: Too many public tools ($PUBLIC_RATIO%) - may indicate insufficient protection"
        echo "   Recommendation: Review if write operations are properly protected"
        WARNINGS=$((WARNINGS + 1))
    else
        echo "✅ Good balance of public ($PUBLIC_RATIO%) vs protected tools"
    fi
else
    echo "⚠️  WARNING: Cannot calculate tool distribution - check plan format"
    WARNINGS=$((WARNINGS + 1))
fi

# Gate 2: Onboarding flow completeness
echo ""
echo "=== Gate 2: Onboarding Flow Check ==="
ONBOARDING_ELEMENTS=$(grep -E "trial|signup|explore|demo|getting.*started|new.*user|first.*time" "$PLAN_FILE" | wc -l)

if [ $ONBOARDING_ELEMENTS -eq 0 ]; then
    echo "⚠️  UX WARNING: No clear onboarding path identified"
    echo "   Recommendation: Add trial/demo/exploration tools for new users"
    WARNINGS=$((WARNINGS + 1))
elif [ $ONBOARDING_ELEMENTS -gt 0 ]; then
    echo "✅ Onboarding elements present ($ONBOARDING_ELEMENTS found)"
    # Show what was found
    grep -E "trial|signup|explore|demo|getting.*started" "$PLAN_FILE" | head -3
fi

# Gate 3: Authentication friction analysis
echo ""
echo "=== Gate 3: Authentication Friction Analysis ==="

# Check for friction indicators
HIGH_FRICTION=$(grep -E "must.*auth|require.*login|need.*credential|auth.*before" "$PLAN_FILE" | wc -l)
LOW_FRICTION=$(grep -E "optional.*auth|gradual.*auth|progressive.*disclosure" "$PLAN_FILE" | wc -l)

echo "📊 Authentication Friction Indicators:"
echo "   High Friction Elements: $HIGH_FRICTION"
echo "   Low Friction Elements: $LOW_FRICTION"

# Check for proper error messaging
ERROR_QUALITY=$(grep -E "error.*message|auth.*required.*message|helpful.*guidance" "$PLAN_FILE" | wc -l)
if [ $ERROR_QUALITY -eq 0 ]; then
    echo "⚠️  UX WARNING: No mention of helpful error messages for auth requirements"
    echo "   Recommendation: Include guidance for users when authentication is needed"
    WARNINGS=$((WARNINGS + 1))
else
    echo "✅ Error message quality considered ($ERROR_QUALITY references)"
fi

# Gate 4: Business value vs security trade-off
echo ""
echo "=== Gate 4: Business Value Analysis ==="

# Look for explicit business reasoning
BUSINESS_REASONING=$(grep -E "business.*decision|revenue|conversion|onboarding.*value|user.*acquisition" "$PLAN_FILE" | wc -l)
SECURITY_REASONING=$(grep -E "security.*risk|data.*protection|privacy|vulnerability" "$PLAN_FILE" | wc -l)

if [ $BUSINESS_REASONING -gt 0 ] && [ $SECURITY_REASONING -gt 0 ]; then
    echo "✅ Both business and security considerations documented"
elif [ $BUSINESS_REASONING -eq 0 ]; then
    echo "⚠️  BUSINESS WARNING: No business value reasoning found"
    echo "   Recommendation: Document why this access pattern benefits the business"
    WARNINGS=$((WARNINGS + 1))
elif [ $SECURITY_REASONING -eq 0 ]; then
    echo "⚠️  SECURITY WARNING: No security risk assessment found"
    echo "   Recommendation: Document security implications of access decisions"
    WARNINGS=$((WARNINGS + 1))
fi

# Gate 5: Data exposure risk
echo ""
echo "=== Gate 5: Data Exposure Risk Check ==="

# Check for sensitive data in public tools
SENSITIVE_DATA_PUBLIC=$(grep -A 5 -B 5 "unauthenticated\|public\|no.*auth" "$PLAN_FILE" | grep -E "email|phone|address|credit|payment|private|sensitive|confidential" | wc -l)

if [ $SENSITIVE_DATA_PUBLIC -gt 0 ]; then
    echo "❌ DATA EXPOSURE RISK: Sensitive data mentioned in public access context"
    echo "   Found $SENSITIVE_DATA_PUBLIC potential exposure risks"
    grep -A 5 -B 5 "unauthenticated\|public\|no.*auth" "$PLAN_FILE" | grep -E "email|phone|address|credit|payment|private|sensitive|confidential" --color=always
    ISSUES=$((ISSUES + 1))
else
    echo "✅ No sensitive data exposure in public access sections"
fi

# Summary
echo ""
echo "=== Security-UX Balance Gate Summary ==="
echo "📊 Warnings: $WARNINGS (non-blocking recommendations)"
echo "🚨 Issues: $ISSUES (blocking problems)"
echo "📋 Plan File: $PLAN_FILE"

if [ $ISSUES -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo "✅ SECURITY-UX BALANCE GATE: PASSED"
        echo "   Excellent balance between security and user experience"
    else
        echo "✅ SECURITY-UX BALANCE GATE: PASSED WITH WARNINGS"
        echo "   $WARNINGS recommendations for improvement"
    fi
    exit 0
else
    echo "❌ SECURITY-UX BALANCE GATE: FAILED"
    echo "   $ISSUES critical issues must be resolved before implementation"
    echo ""
    echo "🛠️  Required Actions:"
    echo "   1. Remove sensitive data from public access sections"
    echo "   2. Apply Security vs UX Trade-off Decision Matrix"
    echo "   3. Get sec-ops-specialist review for data exposure risks"
    echo "   4. Document business justification for access patterns"
    exit 1
fi