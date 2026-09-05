/**
 * Seed Trend Vision One Service into MCPTool database
 *
 * Registers trend-vision-one-service for Hub discovery/orchestration.
 * Run: npx ts-node scripts/seed-trend-vision-one-service.ts
 *
 * IDEMPOTENT — findFirst + update/create (see seed-eodhd-service.ts). Never a canonical-id upsert.
 *
 * NOTES:
 * - Upstream (github.com/trendmicro/vision-one-mcp-server) is a Go, stdio-only binary; we expose it
 *   over streamable-http via a supergateway bridge (services/trend-vision-one-service/). endpoint
 *   suffix `/mcp` → streamable-http.
 * - authType NONE: the Hub forwards no credential; the container holds the Trend API key.
 *   trend-vision-one-service must be in SSRF_EXEMPT_SERVICES, NOT in TRUSTED_INTERNAL_SERVICES.
 * - category 'security'; seed writes status ACTIVE directly (bypasses PENDING_APPROVAL).
 * - publicAccess:false — staged on a placeholder key (Trend errors on an EMPTY key, so the box .env
 *   uses a non-empty placeholder; tool calls fail until the customer's real key is installed). Flip
 *   true after the real key + a live verify.
 * - Curated READ-ONLY subset of the 60+ upstream tools. Confirm/expand the live surface via
 *   registry(action:"tools", service_name:"trend-vision-one-service") once connected with a real key.
 *
 * @see /.claude/knowledge/patterns/docker-mcp-service-gold-standard-v2.md Step 10
 * @see cline_docs/follow-ups/external-mcp-server-integration-options-2026-07-11.md Chapter 3
 */

import { PrismaClient, MCPAuthType, MCPToolStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const SERVICE_NAME = 'trend-vision-one-service';

// Real tool schemas for the 12 curated read-only tools (of the 60+ on the server), pulled from the
// live server's tools/list on 2026-07-12. To refresh: re-run scripts/pull-mcp-schemas.py 3111 <out> <tools...> (on the box) and
// replace this file. See .claude/knowledge/mcp-servers/trend-vision-one/README.md "Follow-up".
const TREND_TOOLS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'seed-data', 'trend-vision-one-tools.json'), 'utf8'),
) as Array<{ name: string; description: string; inputSchema: object }>;

const CANONICAL_DATA = {
  name: 'trend-vision-one-service',
  description: "Trend Vision One (XDR) — read-only security telemetry: Workbench alerts and observed attack techniques, endpoint inventory, attack-surface (CREM) risk, cloud posture (CSPM), container vulnerabilities, threat intelligence (IoCs), email security, and IAM.\n\nWHEN TO USE:\n✅ Triage Workbench/XDR alerts and attack techniques\n✅ Inventory endpoints and attack surface (high-risk users, public IPs)\n✅ Review cloud posture + container vulnerabilities\n✅ Look up threat-intel IoCs\n\nFEATURES:\n- Read-only curated surface of the 60+ Trend Vision One tools\n- Self-hosted, localhost-only, static Trend API-key auth",
  version: '1.0.0',
  status: 'ACTIVE' as MCPToolStatus,
  authType: 'NONE' as MCPAuthType,
  capabilities: { tools: TREND_TOOLS } as object,
  configuration: {
    endpoint: 'http://localhost:3111/mcp',
    transport: 'streamable-http',
    category: 'security',
    serviceType: 'mcp_service',
    ownerId: 'cmh86xj81002tyxmi5k2qv1ls',        // <maintainer-email>
    ownerEmail: '<maintainer-email>',
    healthCheck: '/health',
    timeout: 90000,
    maxExecutionTime: 90000,
    rateLimit: { requests: 20, windowMs: 60000 },
  },
  credentials: {} as object,
  permissions: { owner: 'cmh86xj81002tyxmi5k2qv1ls', canModify: ['cmh86xj81002tyxmi5k2qv1ls'], canDelete: ['cmh86xj81002tyxmi5k2qv1ls'], publicAccess: false } as object,  // GATED PRIVATE until the customer's real Trend key + live verify; flip true then
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
