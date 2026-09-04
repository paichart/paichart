/**
 * Seed Token Validator Service into MCPTool database
 *
 * Registers the token-validator-service for Hub discovery and orchestration.
 * Run: npx ts-node scripts/seed-token-validator-service.ts
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

const SERVICE_NAME = 'token-validator-service';

const CANONICAL_DATA = {
  name: 'token-validator-service',
  description: 'Token Validator Service - Customer onboarding tool for external service developers. Validates JWT integration, explains trust levels (OWNER/TEAM_MEMBER/SCOPED/ANONYMOUS), demonstrates JWKS validation with 11-step results, provides copy-paste code examples (TypeScript/JavaScript/Python). Perfect for: New customer onboarding, trust level debugging, JWKS validation proof, support troubleshooting. Production-validated Component 5 (34ms JWKS validation, 100% success rate).',
  version: '1.0.0',
  status: 'ACTIVE' as MCPToolStatus,
  authType: 'NONE' as MCPAuthType,
  capabilities: {
  "tools": [
    {
      "name": "verify_auth",
      "description": "Validates JWT token from pAIchart Hub using JWKS endpoint and returns comprehensive debugging information including trust level explanation, step-by-step validation results, token claims, Component 5 verification, and copy-paste code examples",
      "inputSchema": {
        "type": "object",
        "properties": {
          "testMessage": {
            "type": "string",
            "description": "Optional test message to echo back"
          },
          "codeLanguage": {
            "enum": [
              "typescript",
              "javascript",
              "python"
            ],
            "type": "string",
            "description": "Programming language for code example"
          }
        }
      }
    }
  ]
} as object,
  configuration: {
    endpoint: 'http://localhost:3105/sse',
    transport: 'sse',
    category: 'security',
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
