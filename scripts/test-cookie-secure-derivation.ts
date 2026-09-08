/**
 * E33 (2026-09-09): the auth cookies' Secure flag is derived from the PUBLIC origin's scheme, never
 * from NODE_ENV. A production build served over plain http (a LAN self-host) used to set Secure
 * cookies the browser never returned, so every page after login bounced to /login. Prod (https)
 * is unchanged. This pins the derivation so a refactor cannot quietly put NODE_ENV back.
 */
import * as fs from 'fs';
const src = fs.readFileSync('lib/config.ts', 'utf8');
const cookie = src.slice(src.indexOf('cookie: {'), src.indexOf('cookie: {') + 900);
const secureLine = cookie.split('\n').find((l) => /^\s*secure:/.test(l)) || '';
let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) failed++; };
check("cookie.secure derives from PUBLIC_BASE_URL's scheme", /PUBLIC_BASE_URL\.startsWith\('https:\/\/'\)/.test(secureLine));
check('cookie.secure does not consult NODE_ENV', !/NODE_ENV/.test(secureLine));
check('lib/config.ts imports PUBLIC_BASE_URL', /import \{[^}]*PUBLIC_BASE_URL[^}]*\} from '@\/lib\/auth\/public-base-url'/.test(src));
if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\n✅ cookie Secure derivation pinned');
