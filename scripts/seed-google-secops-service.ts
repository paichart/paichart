/**
 * Seed Google SecOps (Chronicle) Service into MCPTool database
 *
 * Registers google-secops-service for Hub discovery/orchestration.
 * Run: npx ts-node scripts/seed-google-secops-service.ts
 *
 * IDEMPOTENT — findFirst + update/create (see seed-eodhd-service.ts). Never a canonical-id upsert.
 *
 * NOTES:
 * - endpoint suffix `/mcp` → streamable-http. Upstream secops_mcp is stdio-only FastMCP; we serve
 *   it over streamable-http via a thin wrapper (services/google-secops-service/secops_http.py) —
 *   no bridge (anthropic-mcp-sdk-guru decision 2026-07-12).
 * - authType NONE: the Hub forwards no credential; the container holds its own GCP service-account
 *   key. google-secops-service must be in SSRF_EXEMPT_SERVICES, NOT in TRUSTED_INTERNAL_SERVICES.
 * - category 'security': seed writes status ACTIVE directly (bypasses PENDING_APPROVAL).
 * - publicAccess:false until real Chronicle creds (SA key + project/customer/region) are installed —
 *   the service boots on placeholders (lazy client init) but tool calls fail until then.
 * - Tenant context (project/customer/region) defaults from the container's CHRONICLE_* env, so tools
 *   don't require those params. Curated READ-ONLY subset of the 32 upstream tools.
 *
 * @see /.claude/knowledge/patterns/docker-mcp-service-gold-standard-v2.md Step 10
 * @see cline_docs/follow-ups/external-mcp-server-integration-options-2026-07-11.md Chapter 4
 */

import { PrismaClient, MCPAuthType, MCPToolStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const SERVICE_NAME = 'google-secops-service';

// Real tool schemas pulled from the live server's tools/list (2026-07-12) — 9 curated of 68.
// Refresh: scripts/pull-mcp-schemas.py 3110 <out> <tools...> then replace seed-data/google-secops-tools.json.
const TOOLS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'seed-data', 'google-secops-tools.json'), 'utf8'),
) as Array<{ name: string; description: string; inputSchema: object }>;

const CANONICAL_DATA = {
  name: 'google-secops-service',
  description: "Google Security Operations (Chronicle) SIEM — read-only threat detection, investigation, and hunting: natural-language event search, alerts, entity/IoC lookups, detection rules, threat intelligence, and investigations.\n\nWHEN TO USE:\n✅ Search security events in natural language\n✅ Retrieve and triage alerts\n✅ Look up an entity (IP / domain / hash / user) across telemetry\n✅ Get IoC matches and threat intelligence\n✅ Review detection rules and investigations\n\nFEATURES:\n- Chronicle SIEM over the caller's tenant (project/customer/region from config)\n- Read-only curated tool surface\n- Self-hosted, localhost-only, static GCP service-account auth",
  version: '1.0.0',
  status: 'ACTIVE' as MCPToolStatus,
  authType: 'NONE' as MCPAuthType,
  capabilities: { tools: TOOLS } as object,
  configuration: {
    endpoint: 'http://localhost:3110/mcp',
    transport: 'streamable-http',
    category: 'security',
    serviceType: 'mcp_service',
    ownerId: 'cmh86xj81002tyxmi5k2qv1ls',        // <maintainer-email>
    ownerEmail: '<maintainer-email>',
    healthCheck: '/health',
    timeout: 90000,
    maxExecutionTime: 90000,  // Chronicle queries can be slow; keep below the 300s hard cap
    rateLimit: { requests: 20, windowMs: 60000 },
  },
  credentials: {} as object,
  permissions: { owner: 'cmh86xj81002tyxmi5k2qv1ls', canModify: ['cmh86xj81002tyxmi5k2qv1ls'], canDelete: ['cmh86xj81002tyxmi5k2qv1ls'], publicAccess: false } as object,  // GATED PRIVATE until real Chronicle creds land; flip true then
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
