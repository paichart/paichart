/**
 * HUB-DEAF-TO-DATABASE (2026-11-13) — nothing in the hub may disconnect the SHARED Prisma client.
 *
 * The defect: `smart-error-recovery.js` built an EnterpriseParameterIntelligence (which holds the shared singleton) on every
 * failed tool call and called its `disconnect()`, i.e. `$disconnect()` on the hub's only database client. Two failures a few
 * milliseconds apart, with queries in flight, leave Prisma's engine stuck on "Engine is not yet connected": the process stays
 * alive, `/health` stays 200, and every database call fails until a restart. Found on a fresh self-host's first program run.
 *
 * Two halves, both needed:
 *   STATIC   — every `$disconnect(` under lib/ is on the allowlist (process shutdown, test helpers) or is guarded by
 *              `!== globalPrisma`. A new unguarded one fails here.
 *   BEHAVIOUR — the two classes that take "an injected client or the shared one" never disconnect the shared one, and do
 *              disconnect a client they were given. Mutation: delete either guard and the matching case fails.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@127.0.0.1:1/stub';
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = '') => { if (ok) { passed++; console.log(`  ✅ ${name}`); } else { failed++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); } };

// ── STATIC ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const ALLOW: Record<string, string> = {
  'lib/prisma.ts': 'process-exit cleanup of the client this module owns',
  'lib/database/test-mappers.ts': 'a test helper, never loaded by the hub',
};
const GUARDED = ['lib/mcp/server/utils/enterprise-parameter-intelligence.js', 'lib/mcp/server/security/compliance-monitor.js'];
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name === 'node_modules' || e.name === 'generated' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|tsx|js|cjs|mjs)$/.test(e.name) ? [path.join(d, e.name)] : []);
const offenders: string[] = [];
for (const f of walk(path.join(ROOT, 'lib'))) {
  const rel = path.relative(ROOT, f);
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((l, i) => {
    if (!/\$disconnect\s*\(/.test(l) || /^\s*(\/\/|\*)/.test(l)) return;
    if (ALLOW[rel]) return;
    const guarded = GUARDED.includes(rel) && lines.slice(Math.max(0, i - 3), i).some(p => /!==\s*globalPrisma/.test(p));
    if (!guarded) offenders.push(`${rel}:${i + 1}`);
  });
}
check('no unguarded $disconnect( under lib/ (allowlist: lib/prisma.ts, test-mappers.ts)', offenders.length === 0, offenders.join(', '));
const ser = fs.readFileSync(path.join(ROOT, 'lib/mcp/server/utils/smart-error-recovery.js'), 'utf8');
check('smart-error-recovery no longer calls intelligence.disconnect()', !/^\s*await intelligence\.disconnect\(\)/m.test(ser));

// ── BEHAVIOUR ────────────────────────────────────────────────────────────────────────────────────────────────────────────
(async () => {
  const { prisma: shared } = require('../lib/prisma');
  let sharedDisconnects = 0;
  const original = shared.$disconnect;
  shared.$disconnect = async () => { sharedDisconnects++; };
  try {
    const { EnterpriseParameterIntelligence } = require('../lib/mcp/server/utils/enterprise-parameter-intelligence');
    const { ComplianceMonitor } = require('../lib/mcp/server/security/compliance-monitor');

    await new EnterpriseParameterIntelligence().disconnect();
    check('EnterpriseParameterIntelligence (shared client) does not disconnect it', sharedDisconnects === 0);
    let own = 0;
    await new EnterpriseParameterIntelligence({ $disconnect: async () => { own++; } }).disconnect();
    check('EnterpriseParameterIntelligence disconnects a client it was given', own === 1 && sharedDisconnects === 0);

    const cm = new ComplianceMonitor();
    await cm.disconnect();
    check('ComplianceMonitor (shared client) does not disconnect it', sharedDisconnects === 0);
    let own2 = 0;
    const cm2 = new ComplianceMonitor({ $disconnect: async () => { own2++; } });
    await cm2.disconnect();
    check('ComplianceMonitor disconnects a client it was given', own2 === 1 && sharedDisconnects === 0);
  } finally {
    shared.$disconnect = original;
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
