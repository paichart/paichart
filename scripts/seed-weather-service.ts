/**
 * Seed Weather Service into MCPTool database
 *
 * Registers the weather-service for Hub discovery and orchestration.
 * Run: npx ts-node scripts/seed-weather-service.ts
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

const SERVICE_NAME = 'weather-service';

const CANONICAL_DATA = {
  name: 'weather-service',
  description: 'OpenWeatherMap-powered weather data service with smart caching. Provides current conditions, 5-day forecasts, hourly forecasts, and air quality data.',
  version: '1.0.0',
  status: 'ACTIVE' as MCPToolStatus,
  authType: 'NONE' as MCPAuthType,
  capabilities: {
  "tools": [
    {
      "name": "current_weather",
      "description": "Get current weather conditions for a location with temperature, humidity, wind, and conditions",
      "inputSchema": {
        "type": "object",
        "required": [
          "location"
        ],
        "properties": {
          "units": {
            "enum": [
              "metric",
              "imperial"
            ],
            "type": "string",
            "default": "metric",
            "description": "Temperature units: metric (Celsius) or imperial (Fahrenheit)"
          },
          "location": {
            "type": "string",
            "description": "City name, country code (e.g., 'London,UK', 'New York,US')"
          }
        }
      }
    },
    {
      "name": "forecast",
      "description": "Get multi-day weather forecast (up to 5 days) with temperature ranges and conditions",
      "inputSchema": {
        "type": "object",
        "required": [
          "location"
        ],
        "properties": {
          "days": {
            "type": "number",
            "default": 5,
            "maximum": 5,
            "minimum": 1,
            "description": "Number of days to forecast (1-5)"
          },
          "units": {
            "enum": [
              "metric",
              "imperial"
            ],
            "type": "string",
            "default": "metric"
          },
          "location": {
            "type": "string",
            "description": "City name, country code"
          }
        }
      }
    },
    {
      "name": "hourly_forecast",
      "description": "Get 24-hour weather forecast with 3-hour intervals",
      "inputSchema": {
        "type": "object",
        "required": [
          "location"
        ],
        "properties": {
          "units": {
            "enum": [
              "metric",
              "imperial"
            ],
            "type": "string",
            "default": "metric"
          },
          "location": {
            "type": "string",
            "description": "City name, country code"
          }
        }
      }
    },
    {
      "name": "air_quality",
      "description": "Get air quality index (AQI) and pollution components for a location",
      "inputSchema": {
        "type": "object",
        "required": [
          "location"
        ],
        "properties": {
          "location": {
            "type": "string",
            "description": "City name, country code"
          }
        }
      }
    }
  ]
} as object,
  configuration: {
    endpoint: 'http://localhost:3102/sse',
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
