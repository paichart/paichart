#!/usr/bin/env tsx
/**
 * Refresh-Token Rotation Race Repro / Regression Test
 *
 * Reproduces the concurrent-refresh race fixed 2026-06-12
 * (cline_docs/reviews/refresh-token-race-2026-06-12/PLAN-v2.md):
 * N parallel POST /api/auth/refresh calls carrying the SAME refresh token.
 *
 * Pre-fix:  one racer wins the BC36 delete+create rotation; the others throw
 *           P2025 inside the transaction → 401 (observed prod 2026-06-11
 *           21:02 UTC, two identical P2025 events 7 ms apart).
 * Post-fix: the route-level single-flight dedups all racers onto one
 *           rotation → ALL succeed with the SAME new token pair, and exactly
 *           one rotation occurred (old token row replaced by exactly one new
 *           row).
 *
 * Usage (local — .env auto-loaded for MCP_ADMIN_EMAIL / MCP_ADMIN_PASSWORD):
 *   npm run dev &
 *   npx tsx scripts/test-refresh-race.ts
 *
 * Env overrides:
 *   BASE_URL              target server (default http://localhost:3000)
 *   TEST_USER_EMAIL       login email    (default MCP_ADMIN_EMAIL)
 *   TEST_USER_PASSWORD    login password (default MCP_ADMIN_PASSWORD)
 *   RACE_PARALLELISM      concurrent refresh calls (default 3 — matches the
 *                         observed Promise.all of three dashboard fetches)
 *
 * Exit codes: 0 = all assertions pass, 1 = failure
 *
 * @created 2026-06-12 (PLAN-v2 §6 test 1)
 */

import 'dotenv/config';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.TEST_USER_EMAIL || process.env.MCP_ADMIN_EMAIL;
const PASSWORD = process.env.TEST_USER_PASSWORD || process.env.MCP_ADMIN_PASSWORD;
const PARALLELISM = parseInt(process.env.RACE_PARALLELISM || '3', 10) || 3;
const REFRESH_COOKIE = process.env.COOKIE_REFRESH_TOKEN || 'refresh_token';

let failures = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
  } else {
    failures++;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Extract a cookie value from a response's Set-Cookie headers. */
function getCookie(response: Response, name: string): string | null {
  for (const value of response.headers.getSetCookie()) {
    const match = value.match(new RegExp(`^${name}=([^;]*)`));
    if (match && match[1]) return decodeURIComponent(match[1]);
  }
  return null;
}

async function main() {
  console.log(`\n🔬 Refresh-token race test → ${BASE_URL} (parallelism: ${PARALLELISM})\n`);

  if (!EMAIL || !PASSWORD) {
    console.error('❌ No credentials: set TEST_USER_EMAIL/TEST_USER_PASSWORD (or MCP_ADMIN_EMAIL/MCP_ADMIN_PASSWORD in .env)');
    process.exit(1);
  }

  // 1. Login to obtain a refresh token
  console.log('1️⃣  Login');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!loginRes.ok) {
    console.error(`❌ Login failed: ${loginRes.status} ${await loginRes.text()}`);
    process.exit(1);
  }
  const refreshToken = getCookie(loginRes, REFRESH_COOKIE);
  if (!refreshToken) {
    console.error(`❌ Login response set no '${REFRESH_COOKIE}' cookie`);
    process.exit(1);
  }
  console.log('  ✅ logged in, refresh cookie obtained');

  // 2. Fire N parallel refreshes with the SAME refresh token.
  // (No need to wait for access-token expiry: the refresh route rotates
  // unconditionally, so concurrent calls exercise the exact raced code path.)
  console.log(`\n2️⃣  ${PARALLELISM} parallel refreshes with the same token`);
  const results = await Promise.all(
    Array.from({ length: PARALLELISM }, () =>
      fetch(`${BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: `${REFRESH_COOKIE}=${refreshToken}` },
      }).then(async (res) => ({
        status: res.status,
        newToken: getCookie(res, REFRESH_COOKIE),
        body: await res.json().catch(() => null) as { success?: boolean } | null,
      }))
    )
  );

  const okCount = results.filter((r) => r.status === 200).length;
  console.log(`  → statuses: [${results.map((r) => r.status).join(', ')}]`);

  // 3. Assertions
  console.log('\n3️⃣  Assertions');
  assert(
    okCount === PARALLELISM,
    `all ${PARALLELISM} refreshes succeed`,
    `only ${okCount}/${PARALLELISM} returned 200 — losers raced the rotation (pre-fix behavior)`
  );

  const newTokens = new Set(results.map((r) => r.newToken).filter(Boolean));
  assert(
    newTokens.size === 1,
    'exactly ONE rotation occurred (all racers share the same new refresh token)',
    `${newTokens.size} distinct new tokens — rotation was not deduplicated`
  );

  // 4. The shared successor token must actually work (and the old one must not)
  console.log('\n4️⃣  Post-race token validity');
  const successor = [...newTokens][0];
  if (successor) {
    const successorRes = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `${REFRESH_COOKIE}=${successor}` },
    });
    assert(successorRes.status === 200, 'successor token refreshes successfully');
  } else {
    assert(false, 'successor token refreshes successfully', 'no successor token captured');
  }

  const replayRes = await fetch(`${BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { Cookie: `${REFRESH_COOKIE}=${refreshToken}` },
  });
  assert(
    replayRes.status === 401,
    'original (rotated) token is rejected — BC36 one-time-use preserved',
    `got ${replayRes.status}`
  );

  console.log(`\n${failures === 0 ? '✅ PASS' : `❌ FAIL (${failures} assertion${failures === 1 ? '' : 's'})`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('❌ Test crashed:', err);
  process.exit(1);
});
