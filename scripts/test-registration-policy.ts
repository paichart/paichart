/* eslint-disable no-console -- test script: prints its own ✅/❌ ledger by design */
/**
 * test:registration-policy — the three self-host knobs are NO-OPS when unset (prod byte-identical),
 * behave as documented when set, and are actually WIRED at the three provisioning sites.
 */
import * as fs from 'fs';
import * as path from 'path';
import { defaultUserRole, registrationAllowed, mailProviderConfigured } from '../lib/auth/registration-policy';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => { if (!ok) failed++; console.log(`  ${ok ? '✅' : '❌'} ${name}${!ok && detail ? ` — ${detail}` : ''}`); };
const ROOT = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

console.log('▶ unset env = SaaS behaviour (prod is byte-identical)');
check('DEFAULT_USER_ROLE unset → DEMO_USER', defaultUserRole({}) === 'DEMO_USER');
check('DEFAULT_USER_ROLE empty → DEMO_USER', defaultUserRole({ DEFAULT_USER_ROLE: '  ' }) === 'DEMO_USER');
check('ALLOW_REGISTRATION unset → true', registrationAllowed({}) === true);
check('mail provider unset → false', mailProviderConfigured({}) === false);

console.log('▶ set env');
check('DEFAULT_USER_ROLE=USER', defaultUserRole({ DEFAULT_USER_ROLE: 'USER' }) === 'USER');
check('DEFAULT_USER_ROLE=user (case-insensitive)', defaultUserRole({ DEFAULT_USER_ROLE: 'user' }) === 'USER');
check('DEFAULT_USER_ROLE=DEMO_USER', defaultUserRole({ DEFAULT_USER_ROLE: 'DEMO_USER' }) === 'DEMO_USER');
for (const bad of ['ADMIN', 'SUPER_ADMIN', 'root', 'admin ']) {
  let threw = false; try { defaultUserRole({ DEFAULT_USER_ROLE: bad }); } catch { threw = true; }
  check(`DEFAULT_USER_ROLE=${JSON.stringify(bad)} → throws (never an admin default)`, threw);
}
for (const v of ['false', 'FALSE', '0', 'no', 'off']) check(`ALLOW_REGISTRATION=${v} → false`, registrationAllowed({ ALLOW_REGISTRATION: v }) === false);
for (const v of ['true', 'yes', '1', 'anything-else']) check(`ALLOW_REGISTRATION=${v} → true`, registrationAllowed({ ALLOW_REGISTRATION: v }) === true);
check('mail provider set → true', mailProviderConfigured({ BREVO_API_KEY: 'x' }) === true);

console.log('▶ wiring — the three provisioning sites use the policy, none keeps a DEMO_USER literal as the role');
const sites: Array<[string, RegExp]> = [
  ['app/api/auth/register/route.ts', /role:\s*defaultUserRole\(\)/],
  ['lib/auth/oauth/oauth-service.ts', /role:\s*defaultUserRole\(\)/],
  ['lib/auth/oauth/mcp-oauth-validator.js', /role:\s*defaultUserRole\(\)/],
];
for (const [f, rx] of sites) {
  const src = read(f);
  check(`${f} assigns role via defaultUserRole()`, rx.test(src));
  // A `where: { role: 'DEMO_USER' }` FILTER (demo ceiling count) is legitimate; an ASSIGNMENT is not.
  const literalAssignments = src.split('\n').filter(l => /role:\s*(UserRole\.|PrismaUserRole\.|')DEMO_USER/.test(l) && !/where:/.test(l));
  check(`${f} has no literal DEMO_USER role assignment`, literalAssignments.length === 0, literalAssignments.join(' | '));
  check(`${f} checks registrationAllowed()`, /registrationAllowed\(\)/.test(src));
}
const reg = read('app/api/auth/register/route.ts');
const guardIdx = reg.indexOf('mailProviderConfigured()'); const lookupIdx = reg.indexOf('prisma.user.findUnique');
check('register: mail-provider guard sits BEFORE the existing-user lookup (never inserts/deletes first)', guardIdx > 0 && lookupIdx > 0 && guardIdx < lookupIdx);
check('register: mail-less path returns 503', /status:\s*503/.test(reg));
check('register: disabled path returns 403', /status:\s*403/.test(reg));
const policy = read('lib/auth/registration-policy.ts');
check('policy module has zero imports/requires', !/^\s*(import |const .*= require\()/m.test(policy));

console.log(failed ? `\n❌ test:registration-policy — ${failed} failed` : '\n✅ test:registration-policy — all pass');
process.exit(failed ? 1 : 0);
