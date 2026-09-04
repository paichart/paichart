/* eslint-disable no-console -- test script: prints its own ✅/❌ ledger by design */
/**
 * test:public-base-url — equivalence + derivation gate for lib/auth/public-base-url.ts (D4, 2026-09-04).
 *
 * WHY child processes: the module reads APP_BASE_URL ONCE at load; the only way to test variants is a
 * fresh process per case. Parent spawns `ts-node <this file> --child <case>` with a controlled env.
 *
 * What it proves (panel: cline_docs/reviews/public-base-url-derivation-2026-09-04/SYNTHESIS.md):
 *   A  prod value           → every derived constant === the exact strings shipped before D4
 *   B  env DELETED          → same (the fallback keeps CI / env-blind scripts byte-identical)
 *   C  trailing slash, D whitespace, F upper-case host → same (canonicalisation)
 *   E  http://localhost:3000 → derived shape; mint→verify round trips succeed; a token carrying the
 *                              OLD prod issuer/audience is REJECTED (a verifier that kept a literal in
 *                              one branch would pass every positive test — this is the one that bites)
 *   M* malformed values      → module load exits non-zero
 *   P* NODE_ENV=production   → unset throws from assertPublicBaseUrlConfigured(); set → ok; plain http
 *                              on a non-loopback host → warning
 * Consumer wiring: auth-constants and audience-policy re-export the SAME values (identity, not copies);
 * audienceForService() derives from the same prefix (NFKD pipeline intact).
 */
import { spawnSync } from 'child_process';
import * as path from 'path';

const PROD = 'https://paichart.app';
const EXPECT_PROD = {
  PUBLIC_BASE_URL: PROD, JWT_ISSUER: PROD,
  API_AUDIENCE: `${PROD}/api`, MCP_FRONTDOOR_AUDIENCE: `${PROD}/mcp`,
  LEGACY_AUDIENCES: [`${PROD}/api`, `${PROD}/mcp`],
  MCP_SERVICE_AUDIENCE_PREFIX: `${PROD}/mcp/`,
};

// ─────────────────────────────── child ───────────────────────────────
async function child(caseName: string): Promise<void> {
  // CI belt-and-suspenders (DATABASE_URL-transitive rule): nothing here touches the DB, but a
  // transitively-loaded module reading DATABASE_URL at import time must not break CI.
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getTestKeys, installTestKeysIntoEnv } = require('../test/fixtures/test-jwt-keys');
  installTestKeysIntoEnv();
  const keys = getTestKeys();
  process.env.JWT_PRIVATE_KEY_BASE64 = Buffer.from(keys.current.privateKeyPEM).toString('base64');

  // Load AFTER env is staged — `import` would hoist above the env setup.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const pbu = require('../lib/auth/public-base-url');
  const ac = require('../lib/auth/auth-constants');
  const policy = require('../lib/mcp/server/tools/hub/audience-policy');
  const tm = require('../lib/auth/token-manager');
  const { SignJWT, importPKCS8, decodeJwt } = require('jose');
  /* eslint-enable @typescript-eslint/no-require-imports */

  let failed = 0;
  const check = (name: string, ok: boolean, detail = '') => {
    if (!ok) failed++;
    console.log(`  ${ok ? '✅' : '❌'} [${caseName}] ${name}${!ok && detail ? ` — ${detail}` : ''}`);
  };
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  const DERIVED: Record<string, string> = { E: 'http://localhost:3000', H: 'http://intranet.example' };
  const expectBase = DERIVED[caseName] ?? PROD;
  const expected = DERIVED[caseName] ? {
    PUBLIC_BASE_URL: expectBase, JWT_ISSUER: expectBase,
    API_AUDIENCE: `${expectBase}/api`, MCP_FRONTDOOR_AUDIENCE: `${expectBase}/mcp`,
    LEGACY_AUDIENCES: [`${expectBase}/api`, `${expectBase}/mcp`],
    MCP_SERVICE_AUDIENCE_PREFIX: `${expectBase}/mcp/`,
  } : EXPECT_PROD;

  // 1. module constants — exact strings, exact order
  for (const [k, v] of Object.entries(expected)) {
    check(`${k} === ${JSON.stringify(v)}`, eq(pbu[k], v), `got ${JSON.stringify(pbu[k])}`);
  }
  check('LEGACY_AUDIENCES is frozen', Object.isFrozen(pbu.LEGACY_AUDIENCES));
  check('LEGACY_AUDIENCES.length === 2 (audience-widening guard)', pbu.LEGACY_AUDIENCES.length === 2);
  check('front door is in the accept-list', pbu.LEGACY_AUDIENCES.includes(pbu.MCP_FRONTDOOR_AUDIENCE));
  check('front door sits under the issuer (RFC 9728 resource)', pbu.MCP_FRONTDOOR_AUDIENCE === `${pbu.JWT_ISSUER}/mcp`);
  check('PUBLIC_BASE_URL_SOURCE', pbu.PUBLIC_BASE_URL_SOURCE === (caseName === 'B' ? 'fallback' : 'env'));

  // 2. consumer wiring — identity, not copies
  check('auth-constants re-exports LEGACY_AUDIENCES (identity)', ac.LEGACY_AUDIENCES === pbu.LEGACY_AUDIENCES);
  check('auth-constants re-exports JWT_ISSUER', ac.JWT_ISSUER === pbu.JWT_ISSUER);
  check('auth-constants no longer exports the dead /services/ prefix', ac.PER_SERVICE_AUDIENCE_PREFIX === undefined);
  check('audience-policy MCP_FRONTDOOR_AUDIENCE identity', policy.MCP_FRONTDOOR_AUDIENCE === pbu.MCP_FRONTDOOR_AUDIENCE);
  check('audience-policy INTERNAL_API_AUDIENCE identity', policy.INTERNAL_API_AUDIENCE === pbu.API_AUDIENCE);
  check('audienceForService derives from the prefix', policy.audienceForService({ name: 'Snowflake Service' }) === `${expectBase}/mcp/snowflake-service`);
  check('audienceForService NFKD pipeline intact', policy.audienceForService({ name: 'Café Analytics' }) === `${expectBase}/mcp/cafe-analytics`);

  // 3. mint → verify round trips through the REAL token-manager
  const payload = { userId: 'u-test', email: 'gate@example.com', role: 'USER' };
  try {
    const access = await tm.signAccessToken(payload);
    const d = decodeJwt(access);
    check('signAccessToken iss === JWT_ISSUER', d.iss === pbu.JWT_ISSUER, `iss=${d.iss}`);
    check('signAccessToken aud === API_AUDIENCE', d.aud === pbu.API_AUDIENCE, `aud=${d.aud}`);
    await tm.verifyAccessToken(access);
    check('access token round-trips through verifyAccessToken', true);
    const refresh = await tm.signRefreshToken(payload);
    await tm.verifyRefreshToken(refresh);
    check('refresh token round-trips through verifyRefreshToken', true);
    const mcp = await tm.mintMcpToken({ userId: 'u-test', email: 'gate@example.com', role: 'USER', scope: 'mcp', audience: pbu.MCP_FRONTDOOR_AUDIENCE, purpose: 'oauth-callback' });
    const m = decodeJwt(mcp);
    check('mintMcpToken iss === JWT_ISSUER', m.iss === pbu.JWT_ISSUER, `iss=${m.iss}`);
    await tm.verifyAccessToken(mcp);
    check('front-door MCP token round-trips through verifyAccessToken', true);
  } catch (e) {
    check('round trips', false, String((e as Error).message));
  }

  // 4. NEGATIVE (derived path only): the OLD prod issuer/audience must be rejected
  if (caseName === 'E') {
    const pk = await importPKCS8(keys.current.privateKeyPEM, 'RS256');
    const old = await new SignJWT({ sub: 'u-test', userId: 'u-test', email: 'gate@example.com', role: 'USER' })
      .setProtectedHeader({ alg: 'RS256', kid: keys.current.kid })
      .setIssuer(PROD).setAudience(`${PROD}/mcp`).setExpirationTime('15m').setIssuedAt().sign(pk);
    let rejected = false;
    try { await tm.verifyAccessToken(old); } catch { rejected = true; }
    check('token with the OLD prod issuer/audience is REJECTED under the derived base', rejected);
  }

  // 5. production assert behaviour (pure function of NODE_ENV + source)
  const asrt = (env: Record<string, string>) => { try { return { ok: true, r: pbu.assertPublicBaseUrlConfigured(env) }; } catch (e) { return { ok: false, msg: String((e as Error).message) }; } };
  if (caseName === 'B') {
    const r = asrt({ NODE_ENV: 'production' });
    check('production + fallback → assert THROWS naming APP_BASE_URL', !r.ok && /APP_BASE_URL/.test(r.msg || ''));
    check('non-production + fallback → assert passes', asrt({ NODE_ENV: 'development' }).ok);
  } else {
    check('production + env value → assert passes', asrt({ NODE_ENV: 'production' }).ok);
  }
  if (caseName === 'E') check('localhost http in production → no warning', (asrt({ NODE_ENV: 'production' }).r?.warnings.length ?? 1) === 0);
  if (caseName === 'H') check('non-loopback http in production → warning', (asrt({ NODE_ENV: 'production' }).r?.warnings.length ?? 0) === 1);

  if (failed) { console.error(`  [${caseName}] ${failed} failed`); process.exit(1); }
}

// ─────────────────────────────── parent ──────────────────────────────
function run(caseName: string, env: Record<string, string | undefined>): number {
  const childEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'APP_BASE_URL' && k !== 'NODE_ENV') childEnv[k] = v;
  for (const [k, v] of Object.entries(env)) if (v !== undefined) childEnv[k] = v;
  const r = spawnSync('npx', ['ts-node', '-r', 'tsconfig-paths/register', path.resolve(__filename), '--child', caseName], { env: childEnv, encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  if (r.status !== 0) process.stdout.write((r.stderr || '').split('\n').filter(l => /Error|❌|failed/.test(l)).slice(0, 6).join('\n') + '\n');
  return r.status ?? 1;
}

async function main(): Promise<void> {
  const i = process.argv.indexOf('--child');
  if (i >= 0) { await child(process.argv[i + 1]); return; }

  let failed = 0;
  const expectOk = (name: string, env: Record<string, string | undefined>) => { console.log(`\n▶ case ${name}`); if (run(name, env) !== 0) { failed++; console.log(`❌ case ${name} FAILED`); } };
  const expectFail = (name: string, value: string) => {
    // Must fail for the RIGHT reason: the module's own APP_BASE_URL error, not an unrelated crash.
    const r = spawnSync('npx', ['ts-node', '-r', 'tsconfig-paths/register', path.resolve(__filename), '--child', name], { env: { ...process.env, APP_BASE_URL: value, DATABASE_URL: process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub' }, encoding: 'utf8' });
    const ok = r.status !== 0 && /APP_BASE_URL/.test(r.stderr || '');
    if (!ok) failed++;
    console.log(`  ${ok ? '✅' : '❌'} malformed ${JSON.stringify(value)} → ${ok ? 'rejected by the module' : r.status === 0 ? 'ACCEPTED (bug)' : 'failed for an UNRELATED reason'}`);
  };

  expectOk('A', { APP_BASE_URL: PROD });
  expectOk('B', {});                                   // DELETED from env, not just empty
  expectOk('C', { APP_BASE_URL: `${PROD}/` });
  expectOk('D', { APP_BASE_URL: `  ${PROD}  ` });
  expectOk('F', { APP_BASE_URL: 'HTTPS://PAICHART.APP:443' });
  expectOk('E', { APP_BASE_URL: 'http://localhost:3000' });
  expectOk('H', { APP_BASE_URL: 'http://intranet.example' });

  console.log('\n▶ malformed values must fail at module load');
  for (const bad of ['paichart.app', 'https://paichart.app/x', 'https://a:b@paichart.app', 'https://paichart.app/?x=1', 'https://paichart.app/#f', 'ftp://paichart.app']) expectFail('M', bad);

  console.log(failed ? `\n❌ test:public-base-url — ${failed} case(s) failed` : '\n✅ test:public-base-url — all cases pass');
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
