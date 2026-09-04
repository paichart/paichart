#!/bin/bash
# Analytics Baseline Measurement Runner
# Phase 3A-PRE Task 1: Automated baseline profiling

echo "🔬 Analytics Performance Baseline Measurement"
echo "=============================================="
echo ""

# Check if server is running
echo "1️⃣ Checking if server is running..."
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "   ✅ Server is running"
else
    echo "   ❌ Server not running. Please start it:"
    echo "      npm run dev"
    echo ""
    exit 1
fi

# Get auth token
echo ""
echo "2️⃣ Auth Token Required"
echo ""
echo "   To get your auth token:"
echo "   1. Open http://localhost:3000 in your browser"
echo "   2. Login if needed"
echo "   3. Open DevTools (F12) → Application tab → Cookies"
echo "   4. Find cookie named 'token'"
echo "   5. Copy the value"
echo ""
read -p "   Paste your auth token here: " AUTH_TOKEN
echo ""

if [ -z "$AUTH_TOKEN" ]; then
    echo "   ❌ No token provided. Exiting."
    exit 1
fi

# Validate token
echo "3️⃣ Validating token..."
if curl -s -H "Authorization: Bearer $AUTH_TOKEN" http://localhost:3000/api/pov > /dev/null 2>&1; then
    echo "   ✅ Token is valid"
else
    echo "   ❌ Token is invalid. Please check and try again."
    exit 1
fi

# Run profiling
echo ""
echo "4️⃣ Running baseline profiling (this will take 2-3 minutes)..."
echo ""

AUTH_TOKEN="$AUTH_TOKEN" \
BASE_URL="http://localhost:3000" \
ITERATIONS=50 \
ts-node -r tsconfig-paths/register scripts/profile-analytics-baseline.ts

echo ""
echo "✅ Baseline measurement complete!"
echo "   Review the report at: docs/performance/analytics-baseline-2025-12-12.json"
echo ""
