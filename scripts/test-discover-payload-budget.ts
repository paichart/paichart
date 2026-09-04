#!/usr/bin/env ts-node
/**
 * services(action:'discover') payload-budget regression guard
 *
 * Guards the 2026-08-21 de-bloat: a prod discover call (category:'security',
 * limit:20) returned 76-79KB against the agent tool-loop's 8,000-char Tier-1
 * cap — the agent saw ~10% of the service list with no indication it was cut.
 * 64.6KB of it was per-tool DESCRIPTIONS (~3.3KB each) kept by the old
 * lightweight mode; the heaviest rows were seeded straight to DB bypassing
 * TOOL_DESCRIPTION_MAX, so input caps can never bound the response — the lean
 * must live producer-side. Precedent: test:embedded-envelope (2026-07-08).
 *
 * The fixture reproduces the prod shape (one 11-tool service with 3.3KB
 * descriptions). Assertions are behavioural where possible: the deep-walk (T2)
 * survives fixture drift; the budget numbers (T1/T3) are the measured contract.
 *
 * Follow-up: cline_docs/follow-ups/services-discover-payload-bloat-2026-08-21.md
 * Reviews:   cline_docs/reviews/discover-payload-debloat-2026-08-21/
 *
 * Run: npx ts-node -r tsconfig-paths/register scripts/test-discover-payload-budget.ts
 */

// DATABASE_URL must be stubbed before anything reaching lib/prisma.ts is imported.
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
process.env.PAICHART_SKIP_DB_CONNECT ||= 'true';

import assert from 'node:assert';
// The cap the agent tool loop actually enforces — import, never hardcode.
import { MAX_TOOL_RESULT_LENGTH } from '../lib/agents/harness/agentic-tool-loop';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ServiceDiscoveryHandler } = require('../lib/mcp/server/tools/hub/service-discovery-handler');

/** Per-service size budget (default/lean mode, chars of JSON). Catches a new
 *  fat per-row field creeping in (the _metricsBasis class) even while the
 *  fixture total still fits. Raise deliberately, with a measurement, or hoist
 *  the new field to response level instead. */
const DISCOVER_PER_SERVICE_BUDGET = 1200;

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${(err as Error).message}`);
  }
}

// ── Fixture: prod-shaped security category ──────────────────────────────────

const OWNER_ID = 'cowner00000000000000000000';
const fatDescription = (tool: string) =>
  `${tool}: ${'An extensively documented security operation covering hunting, triage, enrichment and response. '.repeat(34)}`; // ~3.3KB

function makeService(name: string, toolCount: number, fatTools: boolean) {
  return {
    id: `c${name.replace(/[^a-z]/g, '').slice(0, 10).padEnd(24, '0')}`,
    name,
    description: `${name} — a security service for detection and response. `.repeat(10).slice(0, 580),
    version: '1.0.0',
    status: 'ACTIVE',
    responseTime: 42,
    successRate: 99.1,
    lastHeartbeat: new Date('2026-08-21T00:00:00Z'),
    createdAt: new Date('2026-06-01T00:00:00Z'),
    capabilities: {
      tools: Array.from({ length: toolCount }, (_, i) => ({
        name: `${name.replace(/-service$/, '')}_tool_${i}`,
        description: fatTools ? fatDescription(`tool_${i}`) : `does thing ${i}`,
        inputSchema: { type: 'object', properties: { q: { type: 'string' }, scope: { type: 'string' } } },
      })),
      resources: [],
      prompts: [],
    },
    configuration: {
      category: 'security',
      endpoint: `https://example.com/${name}/mcp`,
      transport: 'streamable-http',
      serviceType: 'external',
      approvalStatus: 'APPROVED',
      ownerEmail: 'owner@example.com',
      ownerId: OWNER_ID,
      createdBy: OWNER_ID,
      evaluationResult: {
        riskLevel: 'MEDIUM',
        risks: [
          'External endpoint processes security telemetry; data residency depends on the vendor region.',
          'Token scope grants read access to detections; rotate credentials on the vendor cadence.',
          'Vendor rate limits apply; sustained polling may throttle the shared tenant.',
        ],
        approvalRecommendation: 'Approved for production use with quarterly credential rotation and scoped tokens.',
      },
    },
    permissions: { publicAccess: true, owner: OWNER_ID, canDelete: [OWNER_ID], canModify: [OWNER_ID] },
  };
}

const FIXTURE = [
  makeService('purple-ai-service', 11, true),        // the 36.5KB prod analogue
  makeService('google-secops-service', 8, true),     // the 26.4KB prod analogue
  makeService('trend-vision-one-service', 4, false),
  makeService('token-validator-service', 1, false),
];

function makeHandler() {
  const prisma = {
    mCPTool: {
      count: async ({ where }: any) =>
        where?.configuration?.path?.[0] === 'ownerId' ? 0 : FIXTURE.length,
      findMany: async () => JSON.parse(JSON.stringify(FIXTURE)),
    },
    $queryRaw: async () => [],
  };
  const utilities = { isUserAdmin: async () => false };
  return new ServiceDiscoveryHandler(prisma, utilities, null);
}

const CTX = { user: { id: 'ccaller0000000000000000000', email: 'caller@example.com', role: 'USER' } };

function walk(node: unknown, visit: (obj: Record<string, unknown>, path: string) => void, path = '$') {
  if (Array.isArray(node)) node.forEach((v, i) => walk(v, visit, `${path}[${i}]`));
  else if (node && typeof node === 'object') {
    visit(node as Record<string, unknown>, path);
    for (const [k, v] of Object.entries(node)) walk(v, visit, `${path}.${k}`);
  }
}

async function main() {
  console.log('\n📦 discover payload budget (2026-08-21 de-bloat guard)\n');

  const handler = makeHandler();
  const lean = await handler.handle({ action: 'discover', category: 'security', limit: 20 }, CTX);
  const leanJson = JSON.stringify(lean);

  check(`T1: default (lean) response fits the agent tool-result cap (${leanJson.length} < ${MAX_TOOL_RESULT_LENGTH})`, () => {
    assert.ok(
      leanJson.length < MAX_TOOL_RESULT_LENGTH,
      `lean discover response is ${leanJson.length} chars — over the ${MAX_TOOL_RESULT_LENGTH} Tier-1 cap; every agent selecting a service is silently truncated again`
    );
  });

  check('T2: no per-tool description/inputSchema anywhere in the default response (deep-walk)', () => {
    const offenders: string[] = [];
    walk(lean, (obj, path) => {
      if (!/capabilities(\.|\[|$)/.test(path)) return;
      if ('description' in obj && 'name' in obj && /tools/.test(path)) offenders.push(`${path} (description)`);
      if ('inputSchema' in obj) offenders.push(`${path} (inputSchema)`);
    });
    assert.strictEqual(offenders.length, 0, `tool detail leaked into lean mode: ${offenders.join(', ')}`);
    for (const svc of lean.services) {
      if (svc.capabilities?.tools) {
        assert.ok(
          svc.capabilities.tools.every((t: unknown) => typeof t === 'string'),
          `${svc.name}: lean tools must be a string array of names`
        );
      }
    }
  });

  check(`T3: every service entry within the per-row budget (≤ ${DISCOVER_PER_SERVICE_BUDGET} chars)`, () => {
    for (const svc of lean.services) {
      const size = JSON.stringify(svc).length;
      assert.ok(
        size <= DISCOVER_PER_SERVICE_BUDGET,
        `${svc.name} serializes to ${size} chars (> ${DISCOVER_PER_SERVICE_BUDGET}) — a new per-row field crept in? Hoist constants to response level.`
      );
    }
  });

  check('T4: metrics-basis texts appear at RESPONSE level, not per service row', () => {
    assert.ok(typeof lean._metricsBasis === 'string' && lean._metricsBasis.length > 0, 'response-level _metricsBasis missing');
    for (const svc of lean.services) {
      assert.ok(!('_metricsBasis' in svc), `${svc.name} carries per-row _metricsBasis — hoisted 2026-08-21, do not re-stamp`);
      assert.ok(!('_metricsHint' in svc), `${svc.name} carries per-row _metricsHint`);
    }
  });

  check('T5: lean mode drops evaluationResult prose but keeps selection fields', () => {
    for (const svc of lean.services) {
      assert.ok(!svc.configuration?.evaluationResult, `${svc.name}: evaluationResult present in lean configuration`);
      assert.strictEqual(svc.configuration?.category, 'security', `${svc.name}: category missing from lean configuration`);
      assert.ok(svc.configuration?.approvalStatus, `${svc.name}: approvalStatus missing from lean configuration`);
    }
  });

  check('T6: schemaMode carries a MEASURED size fact, no fabricated tokenEstimate (Protocol 10)', () => {
    assert.ok(!('tokenEstimate' in (lean.schemaMode || {})), 'tokenEstimate re-appeared — it was a fabricated multiplier, measured ~4× wrong');
    assert.strictEqual(typeof lean.schemaMode?.servicesChars, 'number', 'schemaMode.servicesChars (measured fact) missing');
  });

  // ── Opt-in full path: unchanged escape hatch ──────────────────────────────
  const full = await handler.handle({ action: 'discover', category: 'security', limit: 20, includeSchemas: true }, CTX);

  check('T7: includeSchemas:true still returns full tool descriptions AND inputSchemas (BC on the escape hatch)', () => {
    const purple = full.services.find((s: any) => s.name === 'purple-ai-service');
    assert.ok(purple, 'fixture service missing from full response');
    const tools = purple.capabilities.tools;
    assert.ok(tools.length === 11, `expected 11 tools, got ${tools.length}`);
    assert.ok(tools.every((t: any) => typeof t === 'object' && t.description && t.inputSchema), 'full mode lost tool descriptions or schemas');
    assert.ok(!('descriptionTruncated' in purple), 'full mode must not truncate the service description');
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  console.log(`   (lean response measured: ${leanJson.length} chars for the 4-service security fixture)`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Suite crashed:', err);
  process.exit(1);
});
