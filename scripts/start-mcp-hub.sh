#!/bin/bash

# MCP Hub Startup Script
# Ensures MCP HTTP server starts with proper database connectivity

set -e

echo "🚀 Starting MCP Hub..."

# Check if PostgreSQL is running
if ! pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
    echo "❌ PostgreSQL is not running. Please start PostgreSQL first."
    exit 1
fi

# Check database connection
if ! PGPASSWORD=postgres psql -U postgres -h localhost -d copov15 -c "SELECT 1;" > /dev/null 2>&1; then
    echo "❌ Cannot connect to copov15 database. Please check your database setup."
    exit 1
fi

echo "✅ Database connection verified"

# Determine environment
if [ "$NODE_ENV" = "production" ]; then
    echo "🏭 Starting MCP Hub in PRODUCTION mode"
    export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/copov15?pgbouncer=true"
    export MCP_HTTP_PORT=${MCP_HTTP_PORT:-8080}
    export MCP_HTTP_AUTH_REQUIRED=true
    # JWT_ACCESS_SECRET retired 2026-06-05 (RS256-only auth) — no longer exported
else
    echo "🛠️ Starting MCP Hub in DEVELOPMENT mode"
    export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/copov15?pgbouncer=true"
    export MCP_HTTP_PORT=8080
    export MCP_HTTP_AUTH_REQUIRED=true
    # JWT_ACCESS_SECRET retired 2026-06-05 (RS256-only auth) — no longer exported
fi

echo "🔌 MCP Hub will be available at: http://localhost:${MCP_HTTP_PORT}/mcp"
echo "🔐 Authentication: ${MCP_HTTP_AUTH_REQUIRED}"

# Start the MCP HTTP server (production uses the "clean" entry point)
node mcp-server-http-clean.js