/**
 * Registry endpoint schema parity gate
 *
 * 2026-07-27 (mcp-hub-specialist). `registry(action:'register')` carried a
 * scheme refine (`mcp://` or `http`); `registry(action:'update')` did NOT —
 * it was a bare `z.string().url()`, and Zod's `.url()` accepts ANY scheme.
 *
 * Attack chain that closed:
 *   1. register a service over http://            (passes)
 *   2. update its endpoint to internal://x        (previously passed)
 *   3. isInternalService() now returns true       (InternalServiceRouter.js:213-215
 *      reads registry state — endpoint prefix OR configuration.type)
 *   4. services.call short-circuits at STEP 2.5a  (service-call-handler.js:141),
 *      skipping validateServiceCall (approved-tools whitelist, BLOCKED_PATTERNS,
 *      SSRF BLOCKED_URLS, size limits) AND checkServiceAccess (authorization)
 *
 * Containment was incidental — routeCall keys on service.id against a 3-entry
 * hardcoded map, so a cuid never matched (bypass-and-fail, not
 * bypass-and-execute). That protection disappears if anyone adds a name-based
 * fallback to the router, so the schema is the real gate and this pins it.
 *
 * This is a PARITY test, not just a value test: it asserts register and update
 * agree, so a future constraint added to one and not the other fails here.
 * Third gap found on this path (R3-B5 array caps were swept, endpoint was not).
 *
 * Run: npm run test:registry-endpoint-parity
 *      (ts-node + tsconfig-paths; bare `node` cannot resolve the .ts prisma
 *       import in this load chain, and bare `tsx` is not on PATH)
 */

// MUST precede the require below. `tool-schemas.js` reaches `lib/prisma.ts`
// transitively (smart-error-recovery → enterprise-parameter-intelligence), and
// that module THROWS at import time when DATABASE_URL is unset. Locally the
// repo's .env masks this; CI has no .env, so the suite died on import before
// running a single assertion. This test needs no DB — only the Zod schemas —
// so a syntactically-valid dummy URL is sufficient. See
// [[feedback_ci_database_url_transitive]].
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
// Also skip the eager $connect() in lib/prisma.ts: it calls process.exit(1) at
// module scope on failure, which killed this suite on a CI runner with no
// Postgres even though every assertion passed. Schema-only suite — no DB needed.
process.env.PAICHART_SKIP_DB_CONNECT ||= 'true';

const { CONSOLIDATED_SCHEMAS } = require('../lib/mcp/server/config/tool-schemas');

type Case = { endpoint: string; shouldPass: boolean; why: string };

const CASES: Case[] = [
  // The bypass this test exists to prevent
  { endpoint: 'internal://project',              shouldPass: false, why: 'internal:// bypasses the hub gateway (the 2026-07-27 finding)' },
  { endpoint: 'internal://evil',                 shouldPass: false, why: 'arbitrary internal:// target' },
  { endpoint: 'INTERNAL://project',              shouldPass: false, why: 'uppercase scheme must not slip the prefix check' },

  // Other schemes .url() would otherwise wave through
  { endpoint: 'file:///etc/passwd',              shouldPass: false, why: 'file:// is not an MCP transport' },
  { endpoint: 'ftp://example.com',               shouldPass: false, why: 'ftp:// is not an MCP transport' },
  { endpoint: 'ws://example.com',                shouldPass: false, why: 'WebSocket transport removed Jan 2026' },
  { endpoint: 'javascript:alert(1)',             shouldPass: false, why: 'script scheme' },

  // Legitimate shapes that must keep working
  { endpoint: 'http://localhost:3100/sse',       shouldPass: true,  why: 'local SSE service (10 live prod services)' },
  { endpoint: 'https://mcp.example.com/mcp',     shouldPass: true,  why: 'remote streamable-http' },
  { endpoint: 'https://a.co/mcp?apikey=k',       shouldPass: true,  why: 'query params preserved (alpha-vantage shape)' },
  { endpoint: 'mcp://some-service',              shouldPass: true,  why: 'mcp:// scheme explicitly allowed' },
];

const BASE_REGISTER = {
  action: 'register',
  name: 'parity-probe-service',
  description: 'A service registered purely to exercise endpoint schema parity in tests.',
  category: 'data-services',
};

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail: string) {
  if (ok) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(`${label} — ${detail}`); console.log(`  ❌ ${label} — ${detail}`); }
}

// CONSOLIDATED_SCHEMAS.registry = { title, description, inputSchema } — the
// Zod object lives at .inputSchema. Fail loudly if that shape ever moves,
// rather than silently passing zero assertions.
const schema = CONSOLIDATED_SCHEMAS?.registry?.inputSchema;
if (!schema || typeof schema.safeParse !== 'function') {
  console.error('FATAL: CONSOLIDATED_SCHEMAS.registry.inputSchema is not a Zod schema — export shape changed?');
  process.exit(1);
}

console.log('\n=== Layer 1: register endpoint accepts/rejects correctly ===');
for (const c of CASES) {
  const r = schema.safeParse({ ...BASE_REGISTER, endpoint: c.endpoint });
  check(
    `register ${c.endpoint.padEnd(34)} → ${c.shouldPass ? 'accept' : 'reject'}`,
    r.success === c.shouldPass,
    `${c.why} (got ${r.success ? 'accept' : 'reject'})`
  );
}

console.log('\n=== Layer 2: update endpoint accepts/rejects correctly ===');
for (const c of CASES) {
  const r = schema.safeParse({
    action: 'update',
    service_name: 'parity-probe-service',
    updates: { endpoint: c.endpoint },
  });
  check(
    `update   ${c.endpoint.padEnd(34)} → ${c.shouldPass ? 'accept' : 'reject'}`,
    r.success === c.shouldPass,
    `${c.why} (got ${r.success ? 'accept' : 'reject'})`
  );
}

console.log('\n=== Layer 3: PARITY — register and update must agree on every case ===');
for (const c of CASES) {
  const reg = schema.safeParse({ ...BASE_REGISTER, endpoint: c.endpoint }).success;
  const upd = schema.safeParse({
    action: 'update',
    service_name: 'parity-probe-service',
    updates: { endpoint: c.endpoint },
  }).success;
  check(
    `parity   ${c.endpoint.padEnd(34)} (register=${reg}, update=${upd})`,
    reg === upd,
    'register and update DISAGREE — a constraint was added to one path only'
  );
}

console.log('\n' + '='.repeat(70));
console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
if (failed > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  - ${f}`));
  console.log('\n❌ Registry endpoint parity FAILED');
  process.exit(1);
}
console.log('✅ Registry endpoint parity PASSED');
