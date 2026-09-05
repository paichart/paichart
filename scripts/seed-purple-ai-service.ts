/**
 * Seed Purple AI (SentinelOne) Service into MCPTool database
 *
 * Registers purple-ai-service for Hub discovery and orchestration.
 * Run: npx ts-node scripts/seed-purple-ai-service.ts
 *
 * IDEMPOTENT — findFirst + update/create (see seed-eodhd-service.ts for the
 * rationale; never a canonical-id upsert).
 *
 * NOTES:
 * - endpoint suffix `/mcp` → transport `streamable-http` (the upstream server
 *   speaks streamable-http natively; no bridge).
 * - authType NONE: the Hub forwards no credential; the container holds the
 *   SentinelOne console token. purple-ai-service must be in SSRF_EXEMPT_SERVICES
 *   (service-call-policy.js) and must NOT be in TRUSTED_INTERNAL_SERVICES.
 * - category 'security': the user-facing registry tool would land this
 *   PENDING_APPROVAL, but a seed writes status directly (ACTIVE), bypassing the
 *   approval evaluator.
 * - Curated subset of the 31 upstream tools. Expand as needed, or confirm the
 *   live set via registry(action:"tools", service_name:"purple-ai-service").
 *
 * @see /.claude/knowledge/patterns/docker-mcp-service-gold-standard-v2.md Step 10
 * @see cline_docs/follow-ups/external-mcp-server-integration-options-2026-07-11.md
 */

import { PrismaClient, MCPAuthType, MCPToolStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const SERVICE_NAME = 'purple-ai-service';

// Real tool schemas pulled from the live server's tools/list (2026-07-12) — 11 curated of 33.
// Refresh: scripts/pull-mcp-schemas.py 3108 <out> <tools...> then replace seed-data/purple-ai-tools.json.
const TOOLS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'seed-data', 'purple-ai-tools.json'), 'utf8'),
) as Array<{ name: string; description: string; inputSchema: object }>;

const CANONICAL_DATA = {
  name: 'purple-ai-service',
  description: "SentinelOne Purple AI — read-only security operations: natural-language threat questions, PowerQuery analytics over the Singularity Data Lake, alert / vulnerability / asset triage, and external threat intelligence (IP / hash / domain / URL reputation).\n\nWHEN TO USE:\n✅ Ask a security question in natural language (purple_ai)\n✅ Run PowerQuery analytics over security telemetry\n✅ Triage alerts and vulnerabilities\n✅ Look up threat intel for an IP, file hash, or domain\n✅ Enumerate assets / inventory\n\nFEATURES:\n- Read-only (cannot mutate the SentinelOne account)\n- Natural-language + structured query surface\n- External threat-intel enrichment\n- Self-hosted, localhost-only, static-token auth",
  version: '1.0.0',
  status: 'ACTIVE' as MCPToolStatus,
  authType: 'NONE' as MCPAuthType,
  capabilities: { tools: TOOLS } as object,
  configuration: {
    endpoint: 'http://localhost:3108/mcp',
    transport: 'streamable-http',
    category: 'security',
    serviceType: 'mcp_service',
    ownerId: 'cmh86xj81002tyxmi5k2qv1ls',        // <maintainer-email>
    ownerEmail: '<maintainer-email>',
    healthCheck: '/health',
    timeout: 90000,
    maxExecutionTime: 90000,  // security queries (purple_ai/powerquery) can be slow; keep below the 300s hard cap
    rateLimit: { requests: 20, windowMs: 60000 },
  },
  credentials: {} as object,
  permissions: { owner: 'cmh86xj81002tyxmi5k2qv1ls', canModify: ['cmh86xj81002tyxmi5k2qv1ls'], canDelete: ['cmh86xj81002tyxmi5k2qv1ls'], publicAccess: false } as object,  // GATED PRIVATE until the real SentinelOne token lands (dummy token can't authenticate); flip to true then
};

async function main() {
  console.log(`Seeding ${SERVICE_NAME}...`);

  const existing = await prisma.mCPTool.findFirst({ where: { name: SERVICE_NAME } });

  if (existing) {
    await prisma.mCPTool.update({ where: { id: existing.id }, data: CANONICAL_DATA });
    console.log(`  ✓ updated existing row (id: ${existing.id})`);
  } else {
    await prisma.mCPTool.create({ data: { id: SERVICE_NAME, ...CANONICAL_DATA } });
    console.log(`  ✓ created new row with canonical id: ${SERVICE_NAME}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
