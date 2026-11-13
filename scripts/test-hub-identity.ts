/**
 * The hub states which install it is — and never states the fallback origin as its own (register SELFHOST-CONNECTION-NAME).
 * `lib/auth/public-base-url.ts` reads the environment ONCE at module load, so each case runs in a fresh child process.
 *
 * Run: npm run test:hub-identity
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

if (process.argv.includes('--child')) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getHubIdentity } = require('../lib/mcp/server/tools/hub/hub-identity');
  process.stdout.write('IDENTITY ' + JSON.stringify(getHubIdentity()) + '\n');
  process.exit(0);
}

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, detail = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); } else { failed++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function child(appBaseUrl: string | undefined): any {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.APP_BASE_URL;
  if (appBaseUrl !== undefined) env.APP_BASE_URL = appBaseUrl;
  const r = spawnSync('npx', ['ts-node', '-r', 'tsconfig-paths/register', path.resolve(__filename), '--child'], { env, encoding: 'utf8' });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('IDENTITY '));
  if (!line) throw new Error(`child printed no identity (exit ${r.status}): ${(r.stderr || '').slice(-400)}`);
  return JSON.parse(line.slice('IDENTITY '.length));
}

console.log('the hub reports its own address');
const self = child('http://192.168.86.111:3000');
ok(self.baseUrl === 'http://192.168.86.111:3000' && self.source === 'APP_BASE_URL', 'a self-host with APP_BASE_URL set reports that origin', JSON.stringify(self));
const hosted = child('https://paichart.app/');
ok(hosted.baseUrl === 'https://paichart.app' && hosted.source === 'APP_BASE_URL', 'the hosted site (APP_BASE_URL set) reports its canonical origin', JSON.stringify(hosted));

console.log('never the fallback as fact');
const unset = child(undefined);
ok(unset.baseUrl === null && unset.source === 'not-set' && typeof unset.note === 'string', 'APP_BASE_URL unset: baseUrl null, source not-set, a note', JSON.stringify(unset));
ok(!JSON.stringify(unset).includes('paichart.app'), 'APP_BASE_URL unset: the hosted origin appears nowhere in the report');
const blank = child('   ');
ok(blank.baseUrl === null && blank.source === 'not-set', 'APP_BASE_URL blank: treated as unset', JSON.stringify(blank));

console.log('wiring');
const handler = fs.readFileSync(path.join(__dirname, '../lib/mcp/server/tools/hub/user-services-handler.js'), 'utf8');
ok(/hub:\s*getHubIdentity\(\)/.test(handler) && handler.includes("require('./hub-identity')"), 'registry list (user-services-handler) returns `hub: getHubIdentity()`');
ok(handler.indexOf('hub: getHubIdentity()') > handler.indexOf('const response = {') && handler.indexOf('hub: getHubIdentity()') < handler.indexOf('services,\n'), 'the field sits in the response beside `user`');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
