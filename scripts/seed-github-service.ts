/**
 * Seed the GitHub MCP Service (read-only held-file source) into the MCPTool database.
 *
 * Run: npx ts-node scripts/seed-github-service.ts
 *
 * IDEMPOTENT — findFirst + update/create (gold standard v2 Step 10). Never a canonical-id upsert.
 *
 * NOTES:
 * - Two containers (docker-compose.yml): the official github-mcp-server (pinned by digest, `--read-only --tools
 *   get_file_contents`, NO token, no host port) and a Caddy proxy on 127.0.0.1:3110 that injects the read-only
 *   fine-grained token per request and strips the X-MCP-* configuration headers. See services/github-service/README.md.
 * - authType NONE: the Hub forwards no credential; the proxy holds the token. github-service is in
 *   SSRF_EXEMPT_SERVICES, NOT in TRUSTED_INTERNAL_SERVICES (no pAIchart JWT ever reaches a third-party binary).
 * - Tool schema is the LIVE server's (Step 10b): scripts/seed-data/github-service-tools.json, pulled 2026-10-18 from
 *   v2.0.2 (the pinned digest). Re-pull on any re-pin.
 * - publicAccess:false (admin-only). An admin-launched pipeline can call it (checkServiceAccess admin branch); that covers
 *   the probe and owner-run held pipelines. The flip to true is an OWNER DECISION, not a follow-on step (see permissions).
 * - No ownerId/ownerEmail (platform infrastructure; see seed-cloudflare-service.ts for why an owner is wrong here).
 *
 * @see .claude/knowledge/patterns/docker-mcp-service-gold-standard-v2.md
 * @see cline_docs/follow-ups/held-git-repos-checklist-2026-10-17.md §6
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, MCPAuthType, MCPToolStatus } from '@prisma/client';
import { assertByNameSeedOwnsRow } from './mcp-tool-seed-guard';

const prisma = new PrismaClient();

const SERVICE_NAME = 'github-service';

const tools = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-data', 'github-service-tools.json'), 'utf8'));

const CANONICAL_DATA = {
  name: SERVICE_NAME,
  description:
    'Read-only access to the configuration files held in a GitHub repository (the platform\'s held-file source for ' +
    'Kubernetes manifests and Terraform files). One tool: get_file_contents returns a file\'s exact text (and the ' +
    'commit it was read at) or a directory listing.\n\nWHEN TO USE:\n✅ Read the as-committed text of a config file ' +
    'an Author will edit\n✅ List a directory of the config repository\n\nNOT FOR: live cluster/state/device reads ' +
    '(use the domain\'s read-only rig service — those are evidence, this is the file).',
  version: '2.0.2',
  status: 'ACTIVE' as MCPToolStatus,
  authType: 'NONE' as MCPAuthType,
  capabilities: { tools } as object,
  configuration: {
    endpoint: 'http://localhost:3110/mcp',
    transport: 'streamable-http',
    category: 'automation',
    serviceType: 'mcp_service',
    // The Hub reads healthCheckPath (hub-utilities.js / service-health-handler.js); healthCheck is kept for parity with the
    // other seeds only — it is inert (dev-ops B1, mcp-hub SF-1). /healthz maps GitHub's answer to 200/503.
    healthCheckPath: '/healthz',
    healthCheck: '/healthz',
    timeout: 30000,
    maxExecutionTime: 30000,
    // Per user per service; the PAT's 5,000/h is SHARED, so keep this well below it (mcp-hub SF-3).
    rateLimit: { requests: 20, windowMs: 60000 },
  },
  credentials: {} as object,
  // ADMIN-ONLY. Do NOT flip to true on the cloudflare precedent: measured 2026-10-18, the fine-grained PAT READS ANY PUBLIC
  // REPO (owner/repo are free arguments and the server does not enforce an Mcp-Param pin), and true admits every account
  // incl. demo users. The flip needs an owner decision (sec-ops F1, mcp-hub SF-3; register HELD-GIT-MCP-K8S-TERRAFORM).
  permissions: { publicAccess: false } as object,
};

async function main() {
  if (!Array.isArray(tools) || tools.length !== 1 || tools[0]?.name !== 'get_file_contents') {
    throw new Error('github-service-tools.json must hold exactly the get_file_contents tool (the server runs --tools get_file_contents)');
  }
  console.log(`Seeding ${SERVICE_NAME}...`);
  // LAB-CONFIGS Build 1 (owner 2026-11-03): say which repo agents may read, LOUDLY when the pin is unset — a self-hoster who forgot
  // it would otherwise find every read of their own repo refused (PINNED_ARGUMENT). Reads the same .env the hub reads.
  require('dotenv').config();
  const { GIT_FILE_SOURCE_PINS } = require('../lib/mcp/server/config/git-file-source-pin');
  const pin = GIT_FILE_SOURCE_PINS[SERVICE_NAME];
  if (process.env.GIT_FILE_SOURCE_PIN && process.env.GIT_FILE_SOURCE_PIN.trim()) {
    console.log(`  ✓ .env here pins ONE repo agents may read through it: ${pin.owner}/${pin.repo} (branch main) — the hub uses it after its next restart`);
  } else {
    console.log(`  ⚠️  GIT_FILE_SOURCE_PIN is NOT set in .env here — agents can read ONLY ${pin.owner}/${pin.repo} (the platform default).`);
    console.log(`     On a self-host with your own config repo: add GIT_FILE_SOURCE_PIN=<owner>/<repo> to the hub's .env and restart`);
    console.log('     the hub (run sheet step 9c). Every read of any other repo is refused until you do.');
  }
  const existing = await prisma.mCPTool.findFirst({ where: { name: SERVICE_NAME } });
  // Stage B P1-5 (hub v3 N-b): update only this seed's OWN row (id === SERVICE_NAME); the self-match passes, so a re-seed works.
  assertByNameSeedOwnsRow(existing, SERVICE_NAME);
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
