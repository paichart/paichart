#!/bin/bash
# Cross-System Integrity Quality Gate
# Prevents breaking changes and integration conflicts

PLAN_FILE=${1:-""}
if [ -z "$PLAN_FILE" ]; then
    echo "Usage: $0 <plan_file_path>"
    exit 1
fi

if [ ! -f "$PLAN_FILE" ]; then
    echo "❌ File not found: $PLAN_FILE"
    exit 1
fi

ISSUES=0
WARNINGS=0

echo "🔄 Running Cross-System Integrity Gate..."
echo "📋 Plan: $(basename $PLAN_FILE)"
echo ""

# Gate 1: API Breaking Changes
echo "=== Gate 1: API Breaking Changes Check ==="
BREAKING_CHANGES=$(grep -E "remove.*endpoint|delete.*route|deprecate.*API|change.*response.*format" "$PLAN_FILE" | wc -l)

if [ $BREAKING_CHANGES -gt 0 ]; then
    echo "❌ BREAKING CHANGE RISK: API modifications detected"
    echo "   Found $BREAKING_CHANGES potential breaking changes"
    grep -E "remove.*endpoint|delete.*route|deprecate.*API|change.*response.*format" "$PLAN_FILE" --color=always
    ISSUES=$((ISSUES + 1))
else
    echo "✅ No breaking API changes detected"
fi

# Gate 2: Database Schema Impact
echo ""
echo "=== Gate 2: Database Schema Impact ==="
SCHEMA_CHANGES=$(grep -E "alter.*table|drop.*column|modify.*field|change.*type|remove.*model" "$PLAN_FILE" | wc -l)

if [ $SCHEMA_CHANGES -gt 0 ]; then
    echo "❌ SCHEMA RISK: Database structure changes detected"
    echo "   Found $SCHEMA_CHANGES potential schema modifications"
    grep -E "alter.*table|drop.*column|modify.*field|change.*type|remove.*model" "$PLAN_FILE" --color=always
    ISSUES=$((ISSUES + 1))
else
    echo "✅ No breaking schema changes detected"
fi

# Gate 3: Authentication System Changes  
echo ""
echo "=== Gate 3: Authentication System Changes ==="
AUTH_CHANGES=$(grep -E "change.*auth.*flow|modify.*jwt|update.*token.*validation|alter.*session" "$PLAN_FILE" | wc -l)

if [ $AUTH_CHANGES -gt 0 ]; then
    echo "⚠️  AUTH RISK: Authentication system changes detected"
    echo "   Found $AUTH_CHANGES authentication modifications - requires specialist review"
    grep -E "change.*auth.*flow|modify.*jwt|update.*token.*validation|alter.*session" "$PLAN_FILE" --color=always
    WARNINGS=$((WARNINGS + 1))
    echo "   🔒 Requires: auth-permissions-specialist review"
fi

# Gate 4: MCP Protocol Compatibility
echo ""
echo "=== Gate 4: MCP Protocol Compatibility ==="
MCP_CHANGES=$(grep -E "mcp.*tool.*schema|change.*mcp.*resource|modify.*tool.*handler|update.*mcp.*server" "$PLAN_FILE" | wc -l)

if [ $MCP_CHANGES -gt 0 ]; then
    echo "⚠️  MCP RISK: MCP protocol changes detected"
    echo "   Found $MCP_CHANGES MCP modifications - requires compatibility verification"
    grep -E "mcp.*tool.*schema|change.*mcp.*resource|modify.*tool.*handler" "$PLAN_FILE" --color=always
    WARNINGS=$((WARNINGS + 1))
    echo "   🔌 Requires: mcp-integration-specialist review"
fi

# Gate 5: Service Integration Dependencies
echo ""
echo "=== Gate 5: Service Integration Dependencies ==="

# Extract service names mentioned in plan
SERVICES_MENTIONED=$(grep -E "\w+Service|\w+Manager|\w+Handler" "$PLAN_FILE" | grep -o '\w*Service\|\w*Manager\|\w*Handler' | sort -u | wc -l)

if [ $SERVICES_MENTIONED -gt 3 ]; then
    echo "⚠️  INTEGRATION COMPLEXITY: $SERVICES_MENTIONED services/components involved"
    echo "   High integration complexity detected - consider impact analysis"
    grep -E "\w+Service|\w+Manager|\w+Handler" "$PLAN_FILE" | grep -o '\w*Service\|\w*Manager\|\w*Handler' | sort -u | head -10
    WARNINGS=$((WARNINGS + 1))
    echo "   🔄 Recommends: integration-manager-specialist review"
elif [ $SERVICES_MENTIONED -gt 0 ]; then
    echo "✅ Moderate integration complexity ($SERVICES_MENTIONED services)"
fi

# Gate 6: Performance Impact Assessment
echo ""
echo "=== Gate 6: Performance Impact Assessment ==="
PERF_RISKS=$(grep -E "list.*all|bulk.*operation|no.*limit|unlimited|fetch.*everything" "$PLAN_FILE" | wc -l)

if [ $PERF_RISKS -gt 0 ]; then
    echo "⚠️  PERFORMANCE RISK: Unbounded operations detected"
    echo "   Found $PERF_RISKS potentially expensive operations"
    grep -E "list.*all|bulk.*operation|no.*limit|unlimited|fetch.*everything" "$PLAN_FILE" --color=always
    WARNINGS=$((WARNINGS + 1))
    echo "   📊 Recommends: performance-analyst-specialist review"
else
    echo "✅ No obvious performance risks detected"
fi

# Gate 7: Transaction Boundary Analysis
echo ""
echo "=== Gate 7: Transaction Boundary Analysis ==="
MULTI_TABLE_OPS=$(grep -E "create.*and.*update|update.*multiple|bulk.*insert|transaction|atomic" "$PLAN_FILE" | wc -l)

if [ $MULTI_TABLE_OPS -gt 0 ]; then
    echo "✅ Multi-table operations detected - transaction awareness present"
    echo "   Found $MULTI_TABLE_OPS operations that span multiple tables/entities"
    # Check if transactions are explicitly mentioned
    if ! grep -q "transaction\|atomic\|rollback" "$PLAN_FILE"; then
        echo "⚠️  WARNING: Multi-table operations without explicit transaction strategy"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo "✅ No complex multi-table operations detected"
fi

# Summary
echo ""
echo "=== Cross-System Integrity Gate Summary ==="
echo "🚨 Critical Issues: $ISSUES (blocking)"
echo "⚠️  Warnings: $WARNINGS (review recommended)"
echo "📋 Plan File: $PLAN_FILE"

# Generate specialist recommendation based on findings
echo ""
echo "🤝 Specialist Review Recommendations:"
if [ $WARNINGS -gt 0 ] || [ $ISSUES -gt 0 ]; then
    if grep -q "auth" "$PLAN_FILE"; then
        echo "   🔒 auth-permissions-specialist - For authentication changes"
    fi
    if grep -q "mcp\|tool\|hub" "$PLAN_FILE"; then
        echo "   🔌 mcp-integration-specialist - For MCP protocol changes"
    fi
    if [ $SERVICES_MENTIONED -gt 2 ]; then
        echo "   🔄 integration-manager-specialist - For complex service integration"
    fi
    if [ $PERF_RISKS -gt 0 ]; then
        echo "   📊 performance-analyst-specialist - For performance optimization"
    fi
    if [ $SCHEMA_CHANGES -gt 0 ]; then
        echo "   🗄️ database-manager-specialist - For schema modifications"
    fi
else
    echo "   ✅ No specialist reviews required based on current analysis"
fi

if [ $ISSUES -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo ""
        echo "✅ CROSS-SYSTEM INTEGRITY GATE: PASSED"
        echo "   No integration conflicts detected. Proceed with confidence."
    else
        echo ""
        echo "✅ CROSS-SYSTEM INTEGRITY GATE: PASSED WITH WARNINGS"
        echo "   $WARNINGS recommendations for specialist review"
    fi
    exit 0
else
    echo ""
    echo "❌ CROSS-SYSTEM INTEGRITY GATE: FAILED"
    echo "   $ISSUES critical integration issues must be resolved"
    echo ""
    echo "🛠️  Required Actions:"
    echo "   1. Address breaking changes with proper migration strategy"
    echo "   2. Get database-manager-specialist approval for schema changes"
    echo "   3. Validate authentication changes with auth-permissions-specialist"
    echo "   4. Ensure backward compatibility for all API modifications"
    exit 1
fi