/**
 * Seed Cloudflare (Code Mode) Service into MCPTool database
 *
 * Registers cloudflare-service for Hub discovery/orchestration.
 * Run: npx ts-node scripts/seed-cloudflare-service.ts
 *
 * IDEMPOTENT — findFirst + update/create (see seed-eodhd-service.ts). Never a canonical-id upsert.
 *
 * NOTES:
 * - Cloudflare's server is REMOTE (mcp.cloudflare.com/mcp). We register a LOCAL endpoint
 *   (http://localhost:3109/mcp) that a Caddy reverse proxy (services/cloudflare-service/) forwards
 *   to it, injecting the account's API token as a Bearer — the Hub can't attach that itself.
 * - Code Mode = just TWO tools (search + execute) covering ~2,500 Cloudflare API endpoints.
 * - authType NONE: the Hub forwards no credential; the proxy holds the token. cloudflare-service
 *   must be in SSRF_EXEMPT_SERVICES, NOT in TRUSTED_INTERNAL_SERVICES.
 * - category 'automation' (auto-approved family); seed writes status ACTIVE directly anyway.
 * - publicAccess:false until the token is installed + verified; flip true then.
 * - ACCOUNT-AGNOSTIC: nothing here is tied to a Cloudflare account — the account follows the token
 *   in the shared .env, so switching accounts is a token swap + container recreate.
 *
 * @see /.claude/knowledge/patterns/docker-mcp-service-gold-standard-v2.md Step 10
 * @see cline_docs/follow-ups/external-mcp-server-integration-options-2026-07-11.md Chapter 2
 */

import { PrismaClient, MCPAuthType, MCPToolStatus } from '@prisma/client';

const prisma = new PrismaClient();

const SERVICE_NAME = 'cloudflare-service';

const CANONICAL_DATA = {
  name: 'cloudflare-service',
  description: "Cloudflare API access via Code Mode — the entire Cloudflare API (~2,500 endpoints across Workers, KV, R2, D1, DNS, Zero Trust, Radar, and more) exposed through just two tools that run generated JavaScript against the OpenAPI spec and the Cloudflare API client.\n\nWHEN TO USE:\n✅ Discover Cloudflare API endpoints for a product/capability (search)\n✅ Call any Cloudflare API endpoint (execute)\n✅ Inspect DNS, Workers, R2/KV/D1, Zero Trust, Radar, analytics\n\nFEATURES:\n- Token-efficient: 2 tools cover the whole API (Grade A schema cost)\n- search: query the OpenAPI spec for matching endpoints\n- execute: call cloudflare.request() against discovered endpoints\n- Account follows the API token (account-agnostic; scope read-only for safety)",
  version: '1.0.0',
  status: 'ACTIVE' as MCPToolStatus,
  authType: 'NONE' as MCPAuthType,
  capabilities: {
    tools: [
      {
        name: 'search',
        description: 'Write JavaScript to query the Cloudflare OpenAPI spec (spec.paths) and return matching endpoints (method, path, summary). Runs in an isolated sandbox on the server.',
        inputSchema: {
          type: 'object',
          required: ['code'],
          properties: {
            code: {
              type: 'string',
              description: "An async JS function body iterating over spec.paths, returning matching endpoints. e.g. async () => { const r=[]; for (const [path,methods] of Object.entries(spec.paths)) for (const [m,op] of Object.entries(methods)) if (op.tags?.some(t=>t.toLowerCase()==='dns')) r.push({method:m.toUpperCase(),path,summary:op.summary}); return r; }",
            },
          },
        },
      },
      {
        name: 'execute',
        description: 'Write JavaScript to call cloudflare.request() against discovered endpoints and return the result. Also handles the GraphQL Analytics API via POST to /client/v4/graphql.',
        inputSchema: {
          type: 'object',
          required: ['code'],
          properties: {
            code: {
              type: 'string',
              description: "An async JS function body calling cloudflare.request({method, path, body?}) and returning response.result. e.g. async () => { const r = await cloudflare.request({method:'GET', path:`/accounts/${accountId}/workers/scripts`}); return r.result; }",
            },
            account_id: {
              type: 'string',
              description: 'Cloudflare account ID. Required for user tokens; auto-detected for account tokens with the "Account Resources: Read" permission.',
            },
          },
        },
      },
    ],
  } as object,
  configuration: {
    endpoint: 'http://localhost:3109/mcp',
    transport: 'streamable-http',
    category: 'automation',
    serviceType: 'mcp_service',
    ownerId: 'cmh86xj81002tyxmi5k2qv1ls',        // <maintainer-email>
    ownerEmail: '<maintainer-email>',
    healthCheck: '/healthz',
    timeout: 60000,
    maxExecutionTime: 60000,
    rateLimit: { requests: 30, windowMs: 60000 },
  },
  credentials: {} as object,
  permissions: { owner: 'cmh86xj81002tyxmi5k2qv1ls', canModify: ['cmh86xj81002tyxmi5k2qv1ls'], canDelete: ['cmh86xj81002tyxmi5k2qv1ls'], publicAccess: true } as object,  // PUBLIC — verified functional on Steve's read-only token (2026-07-12)
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
