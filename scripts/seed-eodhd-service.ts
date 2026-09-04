/**
 * Seed EODHD Service into MCPTool database
 *
 * Registers the eodhd-service for Hub discovery and orchestration.
 * Run: npx ts-node scripts/seed-eodhd-service.ts
 *
 * IDEMPOTENT — safe to re-run. Uses findFirst + update/create pattern
 * rather than `where: { id: 'canonical' }` upsert because the existing
 * production row has an auto-CUID id (created via the user-facing
 * `registry.register` MCP handler before the SSRF gate landed, 2026-05-16
 * Phase 3 C1). This pattern is robust whether the row currently has the
 * canonical id, an auto-CUID id, or doesn't exist at all.
 *
 * Filed against `cline_docs/follow-ups/missing-seed-scripts-ssrf-exempt-services.md`.
 *
 * @see /.claude/knowledge/patterns/docker-mcp-service-gold-standard-v2.md Step 10
 */

import { PrismaClient, MCPAuthType, MCPToolStatus } from '@prisma/client';

const prisma = new PrismaClient();

const SERVICE_NAME = 'eodhd-service';

const CANONICAL_DATA = {
  name: 'eodhd-service',
  description: 'EOD Historical Data financial market intelligence service. Provides comprehensive market data for stocks, ETFs, crypto, forex, and indices with real-time quotes, fundamentals, and historical analysis.\n\nWHEN TO USE:\n✅ Get daily stock prices and historical OHLCV data\n✅ Real-time market quotes for any symbol\n✅ Search for ticker symbols by company name\n✅ Access company fundamentals and valuation metrics\n✅ Financial market analysis and research\n✅ Cross-correlate market data with weather and energy trends\n\nFEATURES:\n- Global coverage (stocks, ETFs, crypto, forex, indices)\n- Real-time quotes updated every minute\n- Historical data with adjusted closes\n- Company fundamentals (financials, valuation, statistics)\n- Symbol search and discovery\n- Smart caching (1m-7d TTL by data type)\n- Completes commodities intelligence stack (weather + energy + markets)',
  version: '1.0.0',
  status: 'ACTIVE' as MCPToolStatus,
  authType: 'NONE' as MCPAuthType,
  capabilities: {
  "tools": [
    {
      "name": "get_eod_data",
      "description": "Get end-of-day (daily) OHLCV data for stocks, ETFs, indices, forex, or crypto with historical price data and adjusted closes",
      "inputSchema": {
        "type": "object",
        "required": [
          "symbol"
        ],
        "properties": {
          "to": {
            "type": "string",
            "description": "End date (YYYY-MM-DD format, optional)"
          },
          "from": {
            "type": "string",
            "description": "Start date (YYYY-MM-DD format, optional)"
          },
          "symbol": {
            "type": "string",
            "description": "Stock symbol with exchange (e.g., 'AAPL.US', 'TSLA.US', 'BTC-USD')"
          }
        }
      }
    },
    {
      "name": "get_live_quote",
      "description": "Get real-time quote for a symbol including current price, volume, change, and previous close",
      "inputSchema": {
        "type": "object",
        "required": [
          "symbol"
        ],
        "properties": {
          "symbol": {
            "type": "string",
            "description": "Stock symbol with exchange (e.g., 'AAPL.US', 'MSFT.US')"
          }
        }
      }
    },
    {
      "name": "search_ticker",
      "description": "Search for ticker symbols by company name or partial symbol to discover available securities",
      "inputSchema": {
        "type": "object",
        "required": [
          "query"
        ],
        "properties": {
          "query": {
            "type": "string",
            "description": "Company name or ticker symbol to search (e.g., 'Apple', 'AAPL', 'Tesla')"
          }
        }
      }
    },
    {
      "name": "get_fundamentals",
      "description": "Get comprehensive fundamental data for stocks including company info, financials, valuation metrics, and key statistics",
      "inputSchema": {
        "type": "object",
        "required": [
          "symbol"
        ],
        "properties": {
          "symbol": {
            "type": "string",
            "description": "Stock symbol with exchange (e.g., 'AAPL.US', 'MSFT.US')"
          }
        }
      }
    }
  ]
} as object,
  configuration: {
    endpoint: 'http://localhost:3104/sse',
    transport: 'sse',
    category: 'data-services',
    serviceType: 'mcp_service',
    healthCheck: '/health',
    timeout: 60000,
    rateLimit: { requests: 20, windowMs: 60000 },  // 2026-05-26: per-user hub rate limit (durability for live hardening)
  },
  credentials: {} as object,
  permissions: { publicAccess: true } as object,
};

async function main() {
  console.log(`Seeding ${SERVICE_NAME}...`);

  const existing = await prisma.mCPTool.findFirst({ where: { name: SERVICE_NAME } });

  if (existing) {
    await prisma.mCPTool.update({
      where: { id: existing.id },
      data: CANONICAL_DATA,
    });
    console.log(`  ✓ updated existing row (id: ${existing.id})`);
  } else {
    await prisma.mCPTool.create({
      data: { id: SERVICE_NAME, ...CANONICAL_DATA },
    });
    console.log(`  ✓ created new row with canonical id: ${SERVICE_NAME}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
