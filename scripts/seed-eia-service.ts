/**
 * Seed EIA Service into MCPTool database
 *
 * Registers the eia-service for Hub discovery and orchestration.
 * Run: npx ts-node scripts/seed-eia-service.ts
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

const SERVICE_NAME = 'eia-service';

const CANONICAL_DATA = {
  name: 'eia-service',
  description: 'U.S. Energy Information Administration data analytics service. Provides electricity generation, capacity, pricing, and energy storage opportunity analysis across all U.S. states.',
  version: '1.0.0',
  status: 'ACTIVE' as MCPToolStatus,
  authType: 'NONE' as MCPAuthType,
  capabilities: {
  "tools": [
    {
      "name": "find_high_potential_energy_storage_areas",
      "description": "Analyze multiple states to identify high-potential energy storage deployment opportunities using capacity mix, demand patterns, renewable integration, grid stability, and price signals",
      "inputSchema": {
        "type": "object",
        "required": [
          "states"
        ],
        "properties": {
          "states": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "maxItems": 10,
            "minItems": 1,
            "description": "State codes to analyze (e.g., ['TX', 'CA', 'NY'])"
          },
          "analysisDepth": {
            "enum": [
              "basic",
              "detailed"
            ],
            "type": "string",
            "default": "basic",
            "description": "Analysis depth: basic (fast) or detailed (comprehensive)"
          }
        }
      }
    },
    {
      "name": "get_state_electricity_profile_summary",
      "description": "Get 5-year electricity profile for a state with year-over-year metrics including generation, capacity, fuel mix, and pricing trends",
      "inputSchema": {
        "type": "object",
        "required": [
          "state"
        ],
        "properties": {
          "state": {
            "type": "string",
            "maxLength": 2,
            "minLength": 2,
            "description": "Two-letter state code (e.g., 'TX', 'CA', 'NY')"
          },
          "years": {
            "type": "number",
            "default": 5,
            "maximum": 10,
            "minimum": 1,
            "description": "Number of years to include (1-10)"
          }
        }
      }
    },
    {
      "name": "get_generation_mix_by_state",
      "description": "Get net generation breakdown by fuel type with percentage shares for coal, natural gas, nuclear, solar, wind, hydro, and other sources",
      "inputSchema": {
        "type": "object",
        "required": [
          "state"
        ],
        "properties": {
          "state": {
            "type": "string",
            "maxLength": 2,
            "minLength": 2,
            "description": "Two-letter state code"
          },
          "period": {
            "enum": [
              "latest",
              "annual",
              "monthly"
            ],
            "type": "string",
            "default": "latest",
            "description": "Time period: latest (most recent), annual, or monthly"
          }
        }
      }
    },
    {
      "name": "get_capacity_utilization_by_state",
      "description": "Get summer/winter capacity and utilization ratios for a state including actual generation, peak demand, and efficiency metrics",
      "inputSchema": {
        "type": "object",
        "required": [
          "state"
        ],
        "properties": {
          "state": {
            "type": "string",
            "maxLength": 2,
            "minLength": 2,
            "description": "Two-letter state code"
          },
          "season": {
            "enum": [
              "summer",
              "winter",
              "both"
            ],
            "type": "string",
            "default": "both",
            "description": "Season: summer, winter, or both"
          }
        }
      }
    },
    {
      "name": "compare_retail_electricity_prices",
      "description": "Compare monthly retail electricity prices across states with volatility metrics, trend analysis, and state rankings",
      "inputSchema": {
        "type": "object",
        "required": [
          "states"
        ],
        "properties": {
          "months": {
            "type": "number",
            "default": 12,
            "maximum": 24,
            "minimum": 1,
            "description": "Number of months to analyze (1-24)"
          },
          "sector": {
            "enum": [
              "residential",
              "commercial",
              "industrial",
              "all"
            ],
            "type": "string",
            "default": "residential",
            "description": "Customer sector"
          },
          "states": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "maxItems": 10,
            "minItems": 2,
            "description": "States to compare (2-10 states)"
          }
        }
      }
    },
    {
      "name": "discover_electricity_route_metadata",
      "description": "Discover available datasets, facets, and metadata for EIA electricity data including operating capacity, operational data, retail sales, state profiles, and RTO region data",
      "inputSchema": {
        "type": "object",
        "required": [],
        "properties": {
          "dataset": {
            "enum": [
              "operating-generator-capacity",
              "electric-power-operational-data",
              "retail-sales",
              "state-electricity-profiles",
              "rto-region-data"
            ],
            "type": "string",
            "description": "Specific dataset to explore (omit for all)"
          }
        }
      }
    }
  ]
} as object,
  configuration: {
    endpoint: 'http://localhost:3103/sse',
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
