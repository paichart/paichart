/* eslint-disable no-console -- test script: prints its own ✅/❌ ledger by design */
/**
 * test:hub-endpoint-allowlist — gate for lib/utils/endpoint-allowlist.js (E14, 2026-09-07).
 * Panel: cline_docs/reviews/self-host-endpoint-allowlist-2026-09-07/SYNTHESIS.md — the case list is the union
 * of sec-ops T1–T17 and validation-engine T1–T24, plus boundary-contract BC-1 (gate-9 agreement) and BC-3
 * (SSRF-safe ≠ trusted). Pure: no DB, no network. Every static pin is negative-controlled.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const al = require('../lib/utils/endpoint-allowlist');
const { validateUrlSafety } = require('../lib/utils/url-safety');
const policy = require('../lib/mcp/server/config/service-approval-policy');

const ROOT = path.resolve(__dirname, '..');
let passed = 0; const fails: string[] = [];
const check = (label: string, cond: boolean) => { cond ? passed++ : fails.push(label); };
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const env = (list: string | undefined, extra: Record<string, string> = {}) => {
  const e: Record<string, string> = { APP_BASE_URL: 'http://192.168.86.111:3000', MCP_HTTP_PORT: '8080', ...extra };
  if (list !== undefined) e.HUB_PRIVATE_ENDPOINT_ALLOWLIST = list;
  al._resetForTests(e);
};
const safe = (u: string) => al.validateEndpointSafety(u).safe === true;
const blocked = (u: string) => al.validateEndpointSafety(u).safe === false;
const entry = (u: string) => al.validateEndpointSafety(u).matchedEntry;

// ── T1/T2 unset, empty, unrelated entry ⇒ byte-identical to validateUrlSafety on the invariant list ──
const INVARIANT = ['http://2130706433/mcp', 'http://0x7f000001/mcp', 'http://127.1/mcp', 'http://127.0.0.1/mcp',
  'http://169.254.169.254/', 'http://10.0.0.5/', 'http://[::ffff:7f00:1]/', 'http://[::]/', 'http://localhost./',
  'https://api.example.com/mcp', 'http://[2606:4700::1111]/'];
for (const v of [undefined, '', '   ', '10.9.9.9:1']) {
  env(v);
  for (const u of INVARIANT) check(`T1/T2 [${v ?? 'unset'}] ${u} identical to pure gate`, al.validateEndpointSafety(u).safe === validateUrlSafety(u).safe);
}

// ── exact host:port ──
env('127.0.0.1:3107,192.168.86.0/24,10.0.0.5:80,10.0.0.6:443');
check('T3 exact host:port matches', safe('http://127.0.0.1:3107/mcp') && entry('http://127.0.0.1:3107/mcp') === '127.0.0.1:3107');
check('T3 result shape: allowlisted flag, reason absent', al.validateEndpointSafety('http://127.0.0.1:3107/mcp').allowlisted === true && al.validateEndpointSafety('http://127.0.0.1:3107/mcp').reason === undefined);
check('T4 port mismatch still blocked', blocked('http://127.0.0.1:3108/mcp'));
check('T5 URL-side canonical forms match (127.1 / hex / decimal / octal / :03107)', ['http://127.1:3107/', 'http://0x7f000001:3107/', 'http://2130706433:3107/', 'http://0177.0.0.1:3107/', 'http://127.0.0.1:03107/'].every(safe));
check('T7 effective port 80 (elided) matches entry :80', safe('http://10.0.0.5/mcp') && safe('http://10.0.0.5:80/mcp'));
check('T8 effective port is scheme-aware (:443 entry ↔ https, not http)', safe('https://10.0.0.6/mcp') && blocked('http://10.0.0.6/mcp'));
check('T14 IPv6 loopback never matches an IPv4 entry', blocked('http://[::1]:3107/'));
check('T8b mapped IPv6 of an allowlisted host matches (same socket)', safe('http://[::ffff:7f00:1]:3107/') && safe('http://[::ffff:127.0.0.1]:3107/'));
// ── CIDR ──
check('T11 CIDR matches every port on the network', safe('http://192.168.86.1:80/') && safe('http://192.168.86.255:9999/') && entry('http://192.168.86.1/') === '192.168.86.0/24');
check('T11 outside the CIDR blocked', blocked('http://192.168.87.1/'));
// ── hard-deny wins over listed ──
env('169.254.169.254:80,0.0.0.0:80,127.0.0.1:3107,192.168.86.0/24');
check('T13 metadata / link-local never allowlistable', blocked('http://169.254.169.254/') && blocked('http://169.254.1.1/') && blocked('http://2852039166/') && blocked('http://[::ffff:a9fe:a9fe]/'));
check('T13 0.0.0.0 / [::] never allowlistable', blocked('http://0.0.0.0:80/') && blocked('http://0/') && blocked('http://[::]/'));
check('T21 hub own listeners denied by host:port (web + mcp, loopback + public host)', blocked('http://192.168.86.111:3000/mcp') && blocked('http://192.168.86.111:8080/mcp') && blocked('http://127.0.0.1:3000/') && blocked('http://127.0.0.1:8080/'));
check('T21 own-listener reason names the self-loop', /own listener/.test(al.validateEndpointSafety('http://127.0.0.1:3000/').reason));
check('T21 same host, different port stays allowlistable', safe('http://192.168.86.111:3107/') && safe('http://127.0.0.1:3107/'));
check('T9/T20 hostnames never match (no DNS): localhost, .local, bare name', blocked('http://localhost:3107/') && blocked('http://nornir.local:3107/') && blocked('http://foo.internal:3107/'));
check('T22 site-8 pure function is untouched by the allowlist', validateUrlSafety('http://127.0.0.1:3107/').safe === false && validateUrlSafety('http://192.168.86.5/').safe === false);
// ── parser ──
const P = (s: string) => al.parseEndpointAllowlist(s);
check('T15 whitespace / trailing comma / CRLF → 2 entries, 0 rejected', P(' 127.0.0.1:3107 , ,10.0.0.5:80,\r\n').entries.length === 2 && P(' 127.0.0.1:3107 , ,10.0.0.5:80,\r\n').rejected.length === 0);
check('T16 dotenv-quoted whole value → 1 entry', P('"127.0.0.1:3107"').entries.length === 1);
check('T6 entry-side canonicalisation (127.1 / hex / decimal / :03107 → 127.0.0.1:3107)', ['127.1:3107', '0x7f000001:3107', '2130706433:3107', '127.0.0.1:03107'].every((e) => { const r = P(e).entries[0]; return r && r.host === '127.0.0.1' && r.port === 3107; }));
const REJECT: Array<[string, RegExp]> = [
  ['192.168.86.111/24', /host bits/], ['192.168.86.0/33', /prefix/], ['0.0.0.0/0', /prefix/], ['10.0.0.0/4', /prefix/], ['10.0.0.0/7', /prefix/],
  ['127.0.0.0/8', /overlaps/], ['169.254.0.0/16', /overlaps/], ['0.0.0.0/8', /overlaps/],
  ['127.0.0.1', /explicit port/], ['http://127.0.0.1:3107/mcp', /scheme or path/], ['127.0.0.1:3107/mcp', /scheme or path/],
  ['nornir.local:3107', /IPv4 literal/], ['nornir-mcp:3107', /IPv4 literal/], ['LOCALHOST:3107', /IPv4 literal/], ['[::1]:3107', /IPv6/],
  ['127.0.0.1:0', /port/], ['127.0.0.1:65536', /port/], ['127.0.0.1:abc', /port/], ['169.254.169.254:80', /hard-deny/], ['*', /explicit port|IPv4/],
];
for (const [e, why] of REJECT) { const r = P(e); check(`T9/T10/T12/T17/T20 rejects ${e}`, r.entries.length === 0 && r.rejected.length === 1 && why.test(r.rejected[0].why)); }
check('T18 malformed sibling ignored, valid entry survives, rejected named', (() => { const r = P('garbage,127.0.0.1:3107,also/garbage'); return r.entries.length === 1 && r.rejected.map((x: { raw: string }) => x.raw).join() === 'garbage,also/garbage'; })());
env('garbage,,,'); check('T12/T19 all-malformed ⇒ empty ⇒ identical to unset (never allow-all)', blocked('http://127.0.0.1:3107/') && safe('https://api.example.com/') && al.getEndpointAllowlistReport().entries.length === 0 && al.getEndpointAllowlistReport().rejected.length === 1);
env('100.64.0.0/10'); check('Tailscale space stays allowlistable', safe('http://100.101.102.103:3107/'));
check('report shape', (() => { const r = al.getEndpointAllowlistReport(); return r.envName === 'HUB_PRIVATE_ENDPOINT_ALLOWLIST' && Array.isArray(r.entries) && Array.isArray(r.rejected); })());

// ── spawned child with the env DELETED (the module reads once at load — an inherited .env must not leak in) ──
const child = spawnSync(process.execPath, ['-e', "const a=require('./lib/utils/endpoint-allowlist');console.log(JSON.stringify(a.validateEndpointSafety('http://127.0.0.1:3107/mcp')))"], { cwd: ROOT, encoding: 'utf8', env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'HUB_PRIVATE_ENDPOINT_ALLOWLIST')) as NodeJS.ProcessEnv });
check('child (env deleted) → blocked', child.status === 0 && /"safe":false/.test(child.stdout));
const child2 = spawnSync(process.execPath, ['-e', "const a=require('./lib/utils/endpoint-allowlist');console.log(JSON.stringify(a.validateEndpointSafety('http://127.0.0.1:3107/mcp')))"], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, HUB_PRIVATE_ENDPOINT_ALLOWLIST: '127.0.0.1:3107' } as NodeJS.ProcessEnv });
check('child (env set) → allowlisted', child2.status === 0 && /"allowlisted":true/.test(child2.stdout));

// ── BC-1: gate 9 agrees with the connect gate ──
const base = { name: 'ceos-lab-readonly', description: 'Read-only EOS harvest for the network-provisioning pipeline', endpoint: 'http://127.0.0.1:3107/mcp', category: 'automation', capabilities: { tools: ['list_devices'] } };
const evA = policy.evaluateServiceRegistration(base, { userId: 'u1', endpointAllowlisted: true, endpointAllowlistEntry: '127.0.0.1:3107' }).evaluation;
const evB = policy.evaluateServiceRegistration(base, { userId: 'u1' }).evaluation;
check('BC-1 allowlisted → gate 9 does NOT REJECT (no CRITICAL BLOCKED_ENDPOINT)', evA.approvalRecommendation !== 'REJECT' && !evA.risks.some((r: { type: string }) => r.type === 'BLOCKED_ENDPOINT'));
check('BC-1 allowlisted → LOW OPERATOR_ALLOWLISTED_ENDPOINT warning recorded', evA.warnings.some((w: { type: string; severity: string }) => w.type === 'OPERATOR_ALLOWLISTED_ENDPOINT' && w.severity === 'LOW'));
check('BC-1 NOT allowlisted → gate 9 still REJECTs a private literal (negative control)', evB.approvalRecommendation === 'REJECT' && evB.risks.some((r: { type: string }) => r.type === 'BLOCKED_ENDPOINT'));
check('BC-1 dead admin-role carve-out is gone', !/isAdmin/.test(read('lib/mcp/server/config/service-approval-policy.js')));
check('BC-1 register handler passes endpointAllowlisted to gate 9', /endpointAllowlisted:\s*!!endpointCheck\?\.allowlisted/.test(read('lib/mcp/server/tools/hub/service-registration-handler.js')));
check('BC-2 phantom top-level riskLevel/violations reads are gone', !/serviceEvaluation\.(riskLevel|violations|warnings)\b/.test(read('lib/mcp/server/tools/hub/service-registration-handler.js')));

// ── BC-3: SSRF-safe ≠ trusted ──
check('BC-3 trust-level.js never references the network decision', !/url-safety|isSSRFExempt|endpoint-allowlist|HUB_PRIVATE_ENDPOINT_ALLOWLIST/.test(read('lib/services/workflow/security/trust-level.js')));
check('BC-3 the SSRF list no longer wears the trust list\'s local name', !/\bisTrustedInternal\b/.test(read('lib/mcp/server/config/service-call-policy.js')));

// ── static pins (negative-controlled by construction: the regexes match the real lines today) ──
const libFiles = (dir: string): string[] => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) => d.isDirectory() ? libFiles(path.join(dir, d.name)) : [path.join(dir, d.name)]);
const readers = libFiles('lib').filter((f) => /\.(js|ts)$/.test(f) && /process\.env\.HUB_PRIVATE_ENDPOINT_ALLOWLIST|env\[ENV_NAME\]/.test(read(f)));
check(`T15/T23 exactly one env reader in lib/ (${readers.join(',')})`, readers.length === 1 && readers[0].endsWith('endpoint-allowlist.js'));
check('T17/T23 url-safety.js stays pure: zero require/import, zero process.env', !/\brequire\(|^import /m.test(read('lib/utils/url-safety.js')) && !/process\.env/.test(read('lib/utils/url-safety.js')));
const sites = ['lib/mcp/server/tools/hub/hub-utilities.js', 'lib/mcp/server/tools/hub/service-call-handler.js', 'lib/mcp/server/tools/hub/service-health-handler.js', 'lib/mcp/server/tools/hub/workflow-tools-handler.js'];
check('T16/T24 the connect sites call validateEndpointSafety (5 expressions across 4 files)', sites.reduce((n, f) => n + (read(f).match(/validateEndpointSafety\(/g) || []).length, 0) === 5);
check('T16/T24 the parameter scan (service-call-policy.js) still calls the pure validateUrlSafety, never the allowlist', /validateUrlSafety\(url\)/.test(read('lib/mcp/server/config/service-call-policy.js')) && !/validateEndpointSafety|endpoint-allowlist/.test(read('lib/mcp/server/config/service-call-policy.js')));
check('both entrypoints log the allowlist report at boot', /getEndpointAllowlistReport/.test(read('server.ts')) && /getEndpointAllowlistReport/.test(read('mcp-server-http-clean.js')));

console.log(`\n${fails.length ? '❌' : '✅'} test:hub-endpoint-allowlist — ${passed} passed, ${fails.length} failed`);
for (const f of fails) console.log(`   ❌ ${f}`);
process.exit(fails.length ? 1 : 0);
