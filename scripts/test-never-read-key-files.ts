/**
 * Config sources STEP 3, slice P1 (plan v2.1 §7 / W18, sec-ops's re-ruling) — the KEY-NAMED never-read / never-held files:
 * a password file (`htpasswd`) and key material (`.key`, `.pem`, `.p12`, `.pfx`, `.jks`, `.keystore`, an SSH identity file).
 *
 * ONE predicate (`heldPathRefusal`, git-file-source-pin.js) at its four sites:
 *   the PINNED call gate            always
 *   capture (every lane)            always — plus a private-key block in the file's TEXT, whatever its name
 *   block resolution                always (test-config-sources-step3.ts GR1, LB2)
 *   the UNPINNED call gate          only for an agent run (the server-set execution id) and the admin "run workflow" route
 *
 * The three routes into the unpinned gate are driven through their REAL handlers. For the two agent routes the tool call starts at
 * the loop's own `executeToolTurn` and passes through mcpService — the ONE writer of `callingExecutionId` — so no test here hands
 * the gate a context with the id already set (plan §13 D, SO (a)).
 *
 * Run: npm run test:never-read-key-files
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://ci:ci@localhost:5432/ci_stub';
process.env.PAICHART_SKIP_DB_CONNECT = 'true'; // no DB is touched; lib/prisma's eager $connect would process.exit(1) on the stub (the test-gateway-id-first rule)
import * as fs from 'fs';
import * as path from 'path';
import { executeToolTurn, runAgenticToolLoop } from '../lib/agents/harness/agentic-tool-loop';
import { embeddedMCPServer } from '../lib/mcp/embedded-server';
import { mcpService } from '../lib/services/mcp/mcpService';
import { prepareHeldCapture } from '../lib/services/held-bytes-capture';

/* eslint-disable @typescript-eslint/no-var-requires */
const pin = require('../lib/mcp/server/config/git-file-source-pin') as {
  heldPathRefusal: (p: string) => string | null; keyNamedPathRefusal: (p: string) => string | null; isKeyNamedPathRefusal: (p: string) => boolean;
  hasPrivateKeyBlock: (t: unknown) => boolean; checkGitArguments: (s: unknown, a: unknown) => Record<string, unknown>;
  unpinnedFileReadPathRefusal: (t: string, a: unknown, o?: unknown) => Record<string, unknown> | null;
  unpinnedPathForms: (raw: string) => { forms: string[]; unjudgeable: boolean }; UNPINNED_DECODE_ROUNDS: number; UNPINNED_MAX_NORMALISED_PATH: number;
  KEY_MATERIAL_FILE_SUFFIXES: readonly string[]; SSH_IDENTITY_FILE_NAMES: readonly string[] };
const policy = require('../lib/mcp/server/config/service-call-policy') as {
  validateServiceCall: (...a: unknown[]) => { allowed: boolean; violations: Array<{ type: string; message: string; severity: string }> };
  NEVER_READ_KEY_FILE_MESSAGE: string; UNJUDGEABLE_FILE_PATH_MESSAGE: string; ADMIN_WORKFLOW_ROUTE: string; keyNamesApplyAtUnpinnedGate: (c: unknown) => boolean };
const { sanitizeForResponse } = require('../lib/mcp/server/tools/response-sanitizer.js') as { sanitizeForResponse: (s: unknown) => string };
const { ServiceCallHandler } = require('../lib/mcp/server/tools/hub/service-call-handler');
const { WorkflowToolsHandler } = require('../lib/mcp/server/tools/hub/workflow-tools-handler');
// The gates' compliance events go through a DB-backed singleton; stub it so no DB is touched (the test-held-bytes-capture rule). The
// events are counted: a refusal on these routes must still raise one.
const { ComplianceMonitor } = require('../lib/mcp/server/security/compliance-monitor');
const securityEvents: unknown[] = [];
ComplianceMonitor.getInstance = () => ({ logSecurityEvent: async (...a: unknown[]) => { securityEvents.push(a); } });
/* eslint-enable @typescript-eslint/no-var-requires */

type Rec = Record<string, unknown>;
const fails: string[] = []; let passed = 0;
const check = (label: string, cond: boolean, detail = '') => { if (cond) { passed++; console.log(`✅ ${label}`); } else { fails.push(label); console.log(`❌ ${label}${detail ? `\n   ${detail}` : ''}`); } };
const KEYMSG = policy.NEVER_READ_KEY_FILE_MESSAGE;
const types = (v: { violations: Array<{ type: string }> }) => v.violations.map((x) => x.type);

/** A private-key BEGIN marker, assembled — never written whole in this file: it is a marker with no key under it, and the
 *  repository's secret scanner (rightly) flags the literal. */
const PK = (label: string) => ['-----BEGIN ', label, 'PRIVATE', ' KEY-----'].join('');
const KEY_NAMED: Array<[string, string]> = [
  ['.htpasswd', 'credentials-file'], ['conf.d/.htpasswd', 'credentials-file'], ['nginx/htpasswd.users', 'credentials-file'], ['NGINX/.HTPASSWD', 'credentials-file'],
  ['tls/server.key', 'key-material-file'], ['a/b/cert.pem', 'key-material-file'], ['store.p12', 'key-material-file'], ['id.pfx', 'key-material-file'],
  ['trust.jks', 'key-material-file'], ['app.keystore', 'key-material-file'], ['TLS/SERVER.KEY', 'key-material-file'],
  ['.ssh/id_rsa', 'key-material-file'], ['id_dsa', 'key-material-file'], ['keys/id_ecdsa', 'key-material-file'], ['id_ed25519', 'key-material-file'],
];
const NOT_NAMED = ['observability/otelcol/config.yaml', 'nginx/otlp-ingress.conf', 'k8s/secret.yaml', 'tls/server.crt', 'docs/keys.md', 'id_rsa.pub', 'monkey', 'a.key/readme.md',
  'keystore/readme.md', 'pem', 'terraform/main.tf', 'server.keys', 'x.pemx'];
const LEGACY: Array<[string, string]> = [['terraform/terraform.tfstate', 'state-file'], ['env/prod.tfvars', 'tfvars-file'], ['.terraformrc', 'credentials-file'], ['nornir/hosts.yaml', 'credentials-file'], ['tfplan', 'state-file']];

const GH = 'github-service';
const good = { owner: 'paichart', repo: 'paichart-configs' };
const AGENT = { user: { id: 'u', role: 'ADMIN' }, callingExecutionId: 'exec-1' };
const CHAT = { user: { id: 'u', role: 'ADMIN' } };
const ADMIN_ROUTE = { user: { id: 'u', role: 'ADMIN' }, source: 'mcp_hub_workflow', route: policy.ADMIN_WORKFLOW_ROUTE };
const unpinnedCall = (p: unknown, ctx: unknown) => policy.validateServiceCall('acme-files', 'get_file_contents', { owner: 'acme', repo: 'infra', path: p }, ctx, ['get_file_contents'], 'acme-files',
  { name: 'acme-files', configuration: { ownerId: 'u1' } });

(async () => {
  console.log('── the predicate ──');
  check('KN1 every key-named file is refused by name, case-insensitively, in any directory',
    KEY_NAMED.every(([p, want]) => pin.heldPathRefusal(p) === want && pin.keyNamedPathRefusal(p) === want && pin.isKeyNamedPathRefusal(p)),
    KEY_NAMED.filter(([p, want]) => pin.heldPathRefusal(p) !== want).map(([p]) => p).join(', '));
  check('KN1 not on the list, on purpose: generic names, a public key, a directory named like a key file', NOT_NAMED.every((p) => pin.heldPathRefusal(p) === null),
    NOT_NAMED.filter((p) => pin.heldPathRefusal(p) !== null).join(', '));
  check('KN1 the older names keep their refusal NAMES and are not the key-named class', LEGACY.every(([p, want]) => pin.heldPathRefusal(p) === want && !pin.isKeyNamedPathRefusal(p) && pin.keyNamedPathRefusal(p) === null));
  check('KN1 a path both classes name keeps the OLDER name (no stored refusal changes its name)', pin.heldPathRefusal('.terraform.d/server.key') === 'credentials-file' && !pin.isKeyNamedPathRefusal('.terraform.d/server.key'));
  check('KN1 the lists are closed and frozen', Object.isFrozen(pin.KEY_MATERIAL_FILE_SUFFIXES) && Object.isFrozen(pin.SSH_IDENTITY_FILE_NAMES)
    && JSON.stringify(pin.KEY_MATERIAL_FILE_SUFFIXES) === JSON.stringify(['.key', '.pem', '.p12', '.pfx', '.jks', '.keystore'])
    && JSON.stringify(pin.SSH_IDENTITY_FILE_NAMES) === JSON.stringify(['id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519']));
  check('KN1 the content half: a private-key block is key material; a public key, a certificate and a mention are not',
    [`${PK('')}\nnot-a-key`, `x\n${PK('RSA ')}`, PK('OPENSSH '), PK('EC '), PK('ENCRYPTED ')].every((t) => pin.hasPrivateKeyBlock(t))
    && ['-----BEGIN CERTIFICATE-----', '-----BEGIN PUBLIC KEY-----', 'ssl_certificate_key /etc/ssl/private/server.key;', 'BEGIN PRIVATE KEY', '', null, 42].every((t) => !pin.hasPrivateKeyBlock(t)));
  {
    const t0 = Date.now(); const hostile = '-----BEGIN ' + 'A '.repeat(200000);
    // one definition with R10: the marker capture refuses by is the marker the redactor's PEM rule matches
    const r10 = fs.readFileSync(path.join(__dirname, '../lib/agents/harness/redact-artifact-secrets.ts'), 'utf8');
    const pinSrc = fs.readFileSync(path.join(__dirname, '../lib/mcp/server/config/git-file-source-pin.js'), 'utf8');
    check('KN1 the private-key marker is the SAME shape R10 redacts by (one definition of "a private-key block")',
      r10.includes('const PEM_BEGIN = /-----BEGIN (?:[A-Z0-9]+ ){0,3}PRIVATE KEY-----/y;') && pinSrc.includes('const PRIVATE_KEY_BLOCK_RE = /-----BEGIN (?:[A-Z0-9]+ ){0,3}PRIVATE KEY-----/;'));
    check('KN1 the content check is linear on a hostile input (400,000 characters of near-matches, under 250 ms)', pin.hasPrivateKeyBlock(hostile) === false && Date.now() - t0 < 250, `${Date.now() - t0} ms`);
  }

  console.log('── the message ──');
  check('KN2 ONE static message of its own: none of & < > " \' , within the 200-character cap, byte-for-byte through the sanitizer, not the Terraform wording',
    !/[&<>"']/.test(KEYMSG) && KEYMSG.length <= 200 && sanitizeForResponse(KEYMSG) === KEYMSG && !/Terraform|tfstate|device inventory/i.test(KEYMSG) && /htpasswd/.test(KEYMSG), `${KEYMSG.length} chars`);

  console.log('── the pinned call gate: always ──');
  for (const [p, want] of [['observability/nginx/.htpasswd', 'credentials-file'], ['observability/nginx/tls/server.key', 'key-material-file']] as Array<[string, string]>) {
    const a = pin.checkGitArguments(GH, { ...good, path: p });
    check(`KN3 the pin check names ${want} and marks the class (${p})`, a.ok === false && a.field === 'path' && a.pathRefusal === want && a.keyNamed === true, JSON.stringify(a));
    for (const [who, ctx] of [['a chat client', CHAT], ['an agent run', AGENT], ['no context', {}]] as Array<[string, unknown]>) {
      const v = policy.validateServiceCall(GH, 'get_file_contents', { ...good, path: p }, ctx, ['get_file_contents'], GH);
      check(`KN3 the pinned gate refuses ${p} for ${who}, with the class's own type and message`, v.allowed === false && JSON.stringify(types(v)) === JSON.stringify(['NEVER_READ_KEY_FILE']) && v.violations[0].message === KEYMSG, JSON.stringify(v.violations));
    }
  }
  {
    const v = policy.validateServiceCall(GH, 'get_file_contents', { ...good, path: 'terraform/terraform.tfstate' }, AGENT, ['get_file_contents'], GH);
    check('KN3 an older name on the pinned gate keeps its type and its Terraform wording', JSON.stringify(types(v)) === JSON.stringify(['PINNED_ARGUMENT']) && /Terraform state/.test(v.violations[0].message));
    const ok = policy.validateServiceCall(GH, 'get_file_contents', { ...good, path: 'observability/otelcol/config.yaml' }, AGENT, ['get_file_contents'], GH);
    check('KN3 a configuration file on the pinned gate is allowed', ok.allowed === true, JSON.stringify(ok.violations));
  }

  console.log('── the unpinned call gate: an agent run and the admin workflow route only ──');
  check('KN4 the predicate: an agent run (server-set id) and the admin route apply the class; a chat client does not; the id is read from the CONTEXT',
    policy.keyNamesApplyAtUnpinnedGate(AGENT) && policy.keyNamesApplyAtUnpinnedGate(ADMIN_ROUTE) && !policy.keyNamesApplyAtUnpinnedGate(CHAT) && !policy.keyNamesApplyAtUnpinnedGate({})
    && !policy.keyNamesApplyAtUnpinnedGate(null) && !policy.keyNamesApplyAtUnpinnedGate({ callingExecutionId: '' }) && !policy.keyNamesApplyAtUnpinnedGate({ route: 'something-else' }));
  for (const [p] of KEY_NAMED) {
    const agent = unpinnedCall(p, AGENT); const admin = unpinnedCall(p, ADMIN_ROUTE); const chat = unpinnedCall(p, CHAT);
    check(`KN4 ${p}: refused for an agent run and on the admin route (own type, own message); a chat client keeps today's behaviour`,
      JSON.stringify(types(agent)) === JSON.stringify(['NEVER_READ_KEY_FILE']) && agent.violations[0].message === KEYMSG
      && JSON.stringify(types(admin)) === JSON.stringify(['NEVER_READ_KEY_FILE']) && chat.allowed === true,
      JSON.stringify([types(agent), types(admin), types(chat)]));
  }
  check('KN4 the id is never read from ARGUMENTS: a chat call that puts callingExecutionId or route in its arguments is still a chat call',
    policy.validateServiceCall('acme-files', 'get_file_contents', { owner: 'a', repo: 'b', path: 'tls/server.key', callingExecutionId: 'x', route: policy.ADMIN_WORKFLOW_ROUTE }, CHAT, ['get_file_contents'], 'acme-files').allowed === true);
  check('KN4 percent-encoded and ./-prefixed forms are refused for an agent too (the gate decodes two rounds, as for the older names)',
    ['tls/server%2Ekey', 'tls/server%252Ekey', './tls/server.key', '%2Ehtpasswd'].every((p) => unpinnedCall(p, AGENT).allowed === false && unpinnedCall(p, CHAT).allowed === true));
  // Review fix (sec-ops F1): every form that evaded the unpinned gate — each must be refused for an agent run and on the admin
  // route, and each must leave a CHAT caller's call alone (today's behaviour for the key names).
  const EVASIONS: Array<[string, unknown, string]> = [
    ['a trailing "/."', 'tls/server.key/.', 'NEVER_READ_KEY_FILE'], ['a trailing "/x/.."', 'tls/server.key/x/..', 'NEVER_READ_KEY_FILE'],
    ['an SSH identity file with "/."', 'keys/id_rsa/.', 'NEVER_READ_KEY_FILE'], ['a password file with "/."', '.htpasswd/.', 'NEVER_READ_KEY_FILE'],
    ['a trailing space', 'tls/server.key ', 'NEVER_READ_KEY_FILE'], ['a query', 'server.key?x=1', 'NEVER_READ_KEY_FILE'], ['a fragment', 'server.key#f', 'NEVER_READ_KEY_FILE'],
    ['a ";" suffix', 'server.key;v', 'NEVER_READ_KEY_FILE'], ['an encoded NUL', 'server.key%00', 'NEVER_READ_KEY_FILE'], ['a raw NUL', 'server.key\u0000', 'NEVER_READ_KEY_FILE'],
    ['a trailing backslash', 'server.key\\', 'NEVER_READ_KEY_FILE'], ['triple encoding', 'server%25252Ekey', 'NEVER_READ_KEY_FILE'],
    ['fullwidth characters', '\uFF53\uFF45\uFF52\uFF56\uFF45\uFF52\uFF0E\uFF4B\uFF45\uFF59', 'NEVER_READ_KEY_FILE'], ['a zero-width space before the dot', 'server\u200B.key', 'NEVER_READ_KEY_FILE'],
    ['a zero-width space inside the suffix', 'server.k\u200Bey', 'NEVER_READ_KEY_FILE'], ['a backslash separator', 'tls\\server.key', 'NEVER_READ_KEY_FILE'],
    // a path whose name cannot be read at all is refused under its OWN type
    ['a malformed escape elsewhere in the path', 'server%2ekey%ZZ', 'UNJUDGEABLE_FILE_PATH'], ['a lone percent sign', 'docs/100%.md', 'UNJUDGEABLE_FILE_PATH'],
    ['more encoding rounds than the gate reads', 'x%2525252525252Ekey', 'UNJUDGEABLE_FILE_PATH'], ['a path that is an array', ['tls/server.key'], 'UNJUDGEABLE_FILE_PATH'],
    // review fix R1: the cut used to FAIL on these (a character `.` does not match after the separator, or `trim()` eating it)
    ['a "?" then a space', 'server.key? ', 'NEVER_READ_KEY_FILE'], ['a ";" then a space and text', 'server.key; x', 'NEVER_READ_KEY_FILE'],
    ['a "?" then a line separator', 'server.key?\u2028x', 'NEVER_READ_KEY_FILE'], ['a line separator inside the suffix', 'server.k\u2028ey', 'NEVER_READ_KEY_FILE'],
    ['a paragraph separator before the dot', 'server\u2029.key', 'NEVER_READ_KEY_FILE'],
    ['a path longer than the gate normalises', `${'a/'.repeat(2100)}server.key/.`, 'UNJUDGEABLE_FILE_PATH'],
    ['a path that is an object', { toString: 'tls/server.key' }, 'UNJUDGEABLE_FILE_PATH'], ['a path that is a number', 7, 'UNJUDGEABLE_FILE_PATH'],
  ];
  for (const [what, p, type] of EVASIONS) {
    const agent = unpinnedCall(p as string, AGENT); const admin = unpinnedCall(p as string, ADMIN_ROUTE); const chat = unpinnedCall(p as string, CHAT);
    check(`KN4 evasion — ${what}: refused for an agent run and on the admin route (${type}); a chat caller's call is left alone`,
      JSON.stringify(types(agent)) === JSON.stringify([type]) && JSON.stringify(types(admin)) === JSON.stringify([type]) && chat.allowed === true,
      JSON.stringify([types(agent), types(admin), types(chat)]));
  }
  {
    const v = unpinnedCall('server%2ekey%ZZ', AGENT).violations[0];
    check('KN4 the unreadable-path refusal has its own static message (none of & < > " \', within 200 characters, HIGH not CRITICAL)',
      v.message === policy.UNJUDGEABLE_FILE_PATH_MESSAGE && !/[&<>"']/.test(v.message) && v.message.length <= 200 && sanitizeForResponse(v.message) === v.message && v.severity === 'HIGH', `${v.message.length} chars, ${v.severity}`);
  }
  check('KN4 no over-blocking from the new forms: ordinary paths with dot segments, a query-free name, a normalised lookalike of nothing',
    ['./conf/app.yaml', 'conf/app.yaml/.', 'conf/nginx.conf ', 'docs/key-rotation.md', 'conf/app.yaml?ref=main', 'a%20b/app.yaml'].every((p) => unpinnedCall(p, AGENT).allowed === true),
    ['./conf/app.yaml', 'conf/app.yaml/.', 'conf/nginx.conf ', 'docs/key-rotation.md', 'conf/app.yaml?ref=main', 'a%20b/app.yaml'].filter((p) => unpinnedCall(p, AGENT).allowed !== true).join(', '));
  // (a `../` in arguments is refused by the gate's separate path-traversal pattern, so that form is asked of the predicate itself)
  check('KN4 … and a resolved `..` that lands on a configuration file is not refused by this predicate', pin.unpinnedFileReadPathRefusal('get_file_contents', { path: 'a/b/../c.yaml' }, { keyNames: true }) === null
    && pin.unpinnedFileReadPathRefusal('get_file_contents', { path: 'tls/x.key/../app.yaml' }, { keyNames: true }) === null);
  check('KN4 a call with NO path at all is not this gate\'s business (absent or null), for any caller',
    [AGENT, ADMIN_ROUTE, CHAT].every((c) => policy.validateServiceCall('acme-files', 'get_file_contents', { owner: 'a', repo: 'b' }, c, ['get_file_contents'], 'acme-files').allowed === true
      && policy.validateServiceCall('acme-files', 'get_file_contents', { owner: 'a', repo: 'b', path: null }, c, ['get_file_contents'], 'acme-files').allowed === true));
  check('KN4 the check never rewrites the caller\'s arguments (the normalised path is for the check only)', (() => {
    const args = { owner: 'acme', repo: 'infra', path: 'conf/app.yaml/x/..' }; const before = JSON.stringify(args);
    policy.validateServiceCall('acme-files', 'get_file_contents', args, AGENT, ['get_file_contents'], 'acme-files'); return JSON.stringify(args) === before; })());
  // The OLDER names had the same hole since push 0 — closed for EVERY caller (strictly tighter; build record B11).
  const OLD_EVASIONS = ['terraform.tfstate/.', 'terraform.tfstate/x/..', 'env/prod.tfvars?x', 'terraform%25252Etfstate', 'terraform%2Etfstate%ZZ', 'x.tfstate ', 'nornir/hosts.yaml/.', '.terraformrc#a', 'terraform\u200B.tfstate', 'tfplan\u0000'];
  for (const p of OLD_EVASIONS) {
    check(`KN4 older name, evasion ${JSON.stringify(p)}: refused for a chat caller, an agent and the admin route alike (NEVER_READ_PATH)`,
      [CHAT, AGENT, ADMIN_ROUTE].every((c) => JSON.stringify(types(unpinnedCall(p, c))) === JSON.stringify(['NEVER_READ_PATH'])), JSON.stringify([CHAT, AGENT, ADMIN_ROUTE].map((c) => types(unpinnedCall(p, c)))));
  }
  check('KN4 the path forms: bounded decoding, and the form list for a plain path is the plain path only',
    pin.UNPINNED_DECODE_ROUNDS === 5 && JSON.stringify(pin.unpinnedPathForms('conf/app.yaml')) === JSON.stringify({ forms: ['conf/app.yaml'], unjudgeable: false })
    && pin.unpinnedPathForms('a%2Fb').forms.includes('a/b') && pin.unpinnedPathForms('%').unjudgeable === true);
  {
    const t0 = Date.now(); const long = `${'a/'.repeat(50000)}${'%25'.repeat(20000)}2Ekey`;
    pin.unpinnedFileReadPathRefusal('get_file_contents', { path: long }, { keyNames: true });
    check('KN4 the forms are bounded on a hostile path (160,000 characters, 20,000 nested escapes, under 500 ms)', Date.now() - t0 < 500, `${Date.now() - t0} ms`);
  }
  {
    // Review fix R1 (sec-ops): the segment cut is by INDEX. The old pattern was quadratic on many `?` before a U+2028, for every caller.
    const time = (path: string, opts?: unknown) => { const t0 = process.hrtime.bigint(); pin.unpinnedFileReadPathRefusal('get_file_contents', { path }, opts); return Number(process.hrtime.bigint() - t0) / 1e6; };
    const hostile = `${'?'.repeat(24000)}\u2028`;
    const five = `${'%2525252525'}2E${hostile}`;           // a five-times-encoded prefix: six forms are judged
    const best = (f: () => number) => Math.min(f(), f(), f());
    const tChat = best(() => time(hostile)); const tAgent = best(() => time(hostile, { keyNames: true })); const tFive = best(() => time(five, { keyNames: true }));
    check('KN4 R1 timing: 24,000 "?" + U+2028 is judged in under 50 ms (chat and agent); the five-times-encoded variant in under 200 ms', tChat < 50 && tAgent < 50 && tFive < 200, `${tChat.toFixed(1)} / ${tAgent.toFixed(1)} / ${tFive.toFixed(1)} ms`);
    const big = best(() => time(`${'?'.repeat(1000000)}\u2028`));
    check('KN4 R1 timing: 1,000,000 "?" + U+2028 (it did not finish in 5 minutes before) is judged in under 500 ms', big < 500, `${big.toFixed(1)} ms`);
    const src = fs.readFileSync(path.join(__dirname, '../lib/mcp/server/config/git-file-source-pin.js'), 'utf8');
    const norm = src.slice(src.indexOf('function tolerantPercentDecode'), src.indexOf('function unpinnedFileReadPathRefusal')).replace(/\/\/.*$/gm, '');
    check('KN4 R1: no pattern in the normalisation uses `.` or a nested quantifier over caller text (the cut is an index; the escapes are fixed-width)',
      // every regex literal of the normalisation, by hand-kept list: a new one must be read for backtracking and added here
      !/\.\*|\.\+/.test(norm) && norm.includes('const cut = seg.search(/[?#;]/);')
      && JSON.stringify((norm.match(/\/(?:\\.|\[[^\]]*\]|[^/\n\[])+\/[gimsuy]*(?=[.,;)])/g) ?? []).sort()) === JSON.stringify([
        '/%(?![0-9A-Fa-f]{2})/', '/%[0-9A-Fa-f]{2}/', '/(?:%[0-9A-Fa-f]{2})+/g', '/[?#;]/', '/\\\\/g', '/^(\\.\\/)+/', '/^\\/+/'].sort()),
      JSON.stringify(norm.match(/\/(?:\\.|\[[^\]]*\]|[^/\n\[])+\/[gimsuy]*(?=[.,;)])/g)));
    check('KN4 R1: the path this gate normalises is bounded (4,096 characters); above it the plain forms are still judged for the older names',
      pin.UNPINNED_MAX_NORMALISED_PATH === 4096 && pin.unpinnedPathForms('a'.repeat(5000)).unjudgeable === true && pin.unpinnedPathForms('a'.repeat(5000)).forms.length === 1
      && pin.unpinnedFileReadPathRefusal('get_file_contents', { path: `${'a/'.repeat(2100)}terraform.tfstate` })?.pathRefusal === 'state-file'
      && pin.unpinnedFileReadPathRefusal('get_file_contents', { path: `${'a/'.repeat(2100)}app.yaml` }) === null);
  }
  check('KN4 the older names are refused for EVERY caller, as before (their own type and wording)',
    [CHAT, AGENT, ADMIN_ROUTE].every((c) => { const v = unpinnedCall('terraform/terraform.tfstate', c); return JSON.stringify(types(v)) === JSON.stringify(['NEVER_READ_PATH']) && /Terraform state/.test(v.violations[0].message); }));
  check('KN4 another tool with the same path is not this gate\'s business', policy.validateServiceCall('acme-files', 'read_file', { path: 'tls/server.key' }, AGENT, ['read_file'], 'acme-files').allowed === true);
  check('KN4 the unpinned function without the option is today\'s function: key names pass, the older names do not',
    pin.unpinnedFileReadPathRefusal('get_file_contents', { path: 'tls/server.key' }) === null && pin.unpinnedFileReadPathRefusal('get_file_contents', { path: 'x.tfstate' }) !== null
    && pin.unpinnedFileReadPathRefusal('get_file_contents', { path: 'tls/server.key' }, { keyNames: true })?.keyNamed === true);

  console.log('── capture: every lane, always — by name and by content ──');
  {
    // one successful ingress read AS PRODUCTION STORED IT (the recorded harvest fixture of the quote-fidelity suite), with its
    // served files replaced — the record's envelope, ids and meta are the real ones.
    const RUN2 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'quote-fidelity', 'run2-harvest.json'), 'utf8')) as { toolCalls: Rec[] };
    const real = RUN2.toolCalls.find((c) => (c.arguments as Rec | undefined)?.tool === 'get_ingress_config');
    if (!real) throw new Error('the recorded fixture has no get_ingress_config call');
    const rec = (files: Rec) => { const r = JSON.parse(JSON.stringify(real)) as { result: { content: Array<{ data: { result: { structuredContent: { files: Rec } } } }> } };
      r.result.content[0].data.result.structuredContent.files = files; return r; };
    const warned: unknown[] = [];
    process.env.HELD_BYTES_CAPTURE_ENABLED = 'true';
    const plan = prepareHeldCapture({ toolCallResults: [rec({
      'otlp-ingress.conf': 'server { listen 4318; }\n', '.htpasswd': 'operator:$apr1$abc\n', 'server.key': 'not really a key\n',
      'inline.conf': `server {\n# ${PK('RSA ')}\n}\n` })], task: { id: 't', povId: 'pov-1' }, logger: { warn: (o: unknown) => warned.push(o), info: () => undefined }, live: false });
    const held = (plan?.files ?? []).map((f) => f.path).sort();
    const refused = (plan?.refusals ?? []).map((r) => `${r.path}:${r.refusal}`).sort();
    check('KN5 capture holds the configuration file and refuses the three others by name: a password file, a key by name, a key by CONTENT',
      JSON.stringify(held) === JSON.stringify(['/etc/nginx/conf.d/otlp-ingress.conf'])
      && JSON.stringify(refused) === JSON.stringify(['/etc/nginx/conf.d/.htpasswd:credentials-file', '/etc/nginx/conf.d/inline.conf:key-material-file', '/etc/nginx/conf.d/server.key:key-material-file']),
      JSON.stringify({ held, refused, planNull: plan === null, warned: warned.slice(0, 2) }));
    check('KN5 a refused file leaves no bytes on its refusal row', (plan?.refusals ?? []).every((r) => !('content' in r) && !('text' in r)));
  }
  {
    const cap = fs.readFileSync(path.join(__dirname, '../lib/services/held-bytes-capture.ts'), 'utf8').replace(/\/\/.*$/gm, '');
    const iPath = cap.indexOf('const byPath = heldPathRefusal(f.path);'); const iKey = cap.indexOf("if (hasPrivateKeyBlock(C)) { refusals.push(refusalFrom(f, scope, 'key-material-file')); continue; }");
    const iBase = cap.indexOf('const base = canonicalBase(C,');
    check('KN5 order at capture: the name check, then the content check on the SERVED text, both before the text is canonicalised or redacted', iPath > 0 && iKey > iPath && iBase > iKey);
  }

  console.log('── the three routes into the unpinned gate, through their real handlers ──');
  // The registry: one UNPINNED, registrant-owned file service. Its endpoint answers nothing, so a call that gets PAST the gate fails
  // at the connection — a different failure from the gate's refusal.
  const FILES = { id: 'svc-acme-files', name: 'acme-files', status: 'ACTIVE', capabilities: { tools: ['get_file_contents'] },
    configuration: { ownerId: 'user-test', endpoint: 'http://127.0.0.1:9/mcp', transport: 'streamable-http' }, permissions: { publicAccess: true }, isPublic: true };
  const registry = { findUnique: async ({ where }: { where: Rec }) => ((where.id === FILES.id || where.name === FILES.name) ? FILES : null), findFirst: async () => FILES, findMany: async () => [FILES], update: async () => FILES };
  const execs: Rec[] = [];
  const wfPrisma: Rec = { mCPTool: registry, activity: { create: async () => ({}) },
    mCPWorkflowExecution: { count: async () => 0, create: async ({ data }: { data: Rec }) => { const row = { id: 'wfx-1', ...data }; execs.push(row); return row; },
      update: async ({ data }: { data: Rec }) => { execs.push(data); return { id: 'wfx-1', ...data }; }, findUnique: async () => ({ id: 'wfx-1', steps: [] }) },
    mCPWorkflow: { findFirst: async () => null }, task: { findUnique: async () => null } };
  wfPrisma.$transaction = async (fn: (tx: unknown) => unknown) => fn(wfPrisma);
  const callHandler = new ServiceCallHandler({ mCPTool: registry, activity: { create: async () => ({}) } }, { checkServiceAccess: async () => true, trackServiceInteraction: async () => undefined });
  const wfHandler = new WorkflowToolsHandler(wfPrisma, { routeCall: async () => ({}) });
  // The embedded server's `services` tool, as the dispatcher routes it: `call` → the gateway handler, `workflow.execute` → the workflow
  // handler. Each receives the context mcpService BUILT — this test adds nothing to it but the user fields the stub database cannot give.
  const seenContexts: Rec[] = [];
  const emb = embeddedMCPServer as unknown as { isRunning: boolean; toolImplementations: Map<string, Function> };
  emb.isRunning = true;
  emb.toolImplementations.set('services', async (a: Rec, ctx: Rec) => {
    seenContexts.push(ctx);
    const context = { ...ctx, user: { ...(ctx?.user as Rec), id: 'user-test', email: 'owner@example.invalid', role: 'ADMIN' } };
    return a.action === 'workflow.execute' ? wfHandler.handleExecuteWorkflow(a, context) : callHandler.handle(a, context);
  });
  const raced = <T>(p: Promise<T>): Promise<T | string> => Promise.race([p.catch((e) => `THREW ${(e as Error).message}`), new Promise<string>((r) => setTimeout(() => r('TIMED-OUT (it got past the gate)'), 8000).unref())]);
  /** One tool call from the LOOP's own tool turn: executeToolTurn passes `{ sessionId: <the execution id>, userId, timeout }`, the
   *  stand-in for serverManager forwards exactly that pick, and mcpService — the one writer — turns sessionId into callingExecutionId. */
  const fromLoop = async (args: Rec, executionId: string): Promise<string> => {
    const { toolCallRecords } = await executeToolTurn(
      [{ id: 'tu_1', name: 'services', arguments: JSON.stringify(args) }],
      { getToolDefinition: async () => ({ serverName: 'paichart' }),
        executeToolOnServer: async (_s: string, _t: string, a: unknown, o: { sessionId?: string; userId?: string; timeout?: number }) =>
          (mcpService as unknown as { callEmbeddedTool: (t: string, a: unknown, o: Rec) => Promise<unknown> }).callEmbeddedTool('services', a, { sessionId: o.sessionId, userId: 'system', timeout: o.timeout }),
        logger: { warn: () => undefined } } as never,
      { executionId, userId: 'user-test', turn: 1 } as never);
    return JSON.stringify(toolCallRecords[0]);
  };
  /** The same call from a chat client: the dispatcher hands the handler a context with NO execution id (mcpService is not on that path). */
  const fromChat = (args: Rec): Promise<unknown> => (args.action === 'workflow.execute' ? wfHandler.handleExecuteWorkflow(args, CHAT_USER) : callHandler.handle(args, CHAT_USER));
  const CHAT_USER = { user: { id: 'user-test', email: 'owner@example.invalid', role: 'ADMIN' } };
  const KEYCALL = { action: 'call', targetService: 'acme-files', tool: 'get_file_contents', arguments: { owner: 'acme', repo: 'infra', path: 'tls/server.key' } };
  const CONFCALL = { ...KEYCALL, arguments: { owner: 'acme', repo: 'infra', path: 'conf/app.yaml' } };
  const WFKEY = { action: 'workflow.execute', executionMode: 'sequential', steps: [{ service: 'acme-files', tool: 'get_file_contents', arguments: KEYCALL.arguments }] };
  const WFCONF = { ...WFKEY, steps: [{ service: 'acme-files', tool: 'get_file_contents', arguments: CONFCALL.arguments }] };
  const sawKeyMsg = (s: unknown) => String(typeof s === 'string' ? s : JSON.stringify(s)).includes(KEYMSG);

  // Route 1 — direct services.call
  seenContexts.length = 0;
  const r1 = await raced(fromLoop(KEYCALL, 'exec-route-1'));
  check('KN6 route 1 (services.call) from an AGENT\'s tool turn: the id set by mcpService reaches the gate, and the key file is refused with the class\'s message',
    sawKeyMsg(r1) && seenContexts[0]?.callingExecutionId === 'exec-route-1', `${String(r1).slice(0, 300)} | ctx ${JSON.stringify(seenContexts[0])?.slice(0, 160)}`);
  const r1chat = await raced(fromChat(KEYCALL));
  check('KN6 route 1 from a chat client: NOT refused by this rule (it goes on to the service and fails there)', !sawKeyMsg(r1chat), String(JSON.stringify(r1chat)).slice(0, 300));
  const r1conf = await raced(fromLoop(CONFCALL, 'exec-route-1'));
  check('KN6 route 1, an agent reading a configuration file: not refused by this rule', !sawKeyMsg(r1conf), String(r1conf).slice(0, 200));

  // Route 2 — a workflow step (SO (a): the agent's workflow call through the real handler)
  seenContexts.length = 0;
  const r2 = await raced(fromLoop(WFKEY, 'exec-route-2'));
  check('KN6 route 2 (a workflow step) from an AGENT\'s tool turn: the id reaches the step\'s gate through the real workflow handler, and the key file is refused',
    sawKeyMsg(r2) && seenContexts[0]?.callingExecutionId === 'exec-route-2', `${String(r2).slice(0, 400)} | ctx ${JSON.stringify(seenContexts[0])?.slice(0, 160)}`);
  const r2chat = await raced(fromChat(WFKEY));
  check('KN6 route 2 from a chat client: NOT refused by this rule', !sawKeyMsg(r2chat), String(JSON.stringify(r2chat)).slice(0, 300));
  const r2conf = await raced(fromLoop(WFCONF, 'exec-route-2'));
  check('KN6 route 2, an agent\'s workflow reading a configuration file: not refused by this rule', !sawKeyMsg(r2conf), String(r2conf).slice(0, 200));

  // Route 3 — the admin "run workflow" web route (orchestrationServiceCaller): refused for EVERY caller
  {
    const { prisma } = require('../lib/prisma'); // eslint-disable-line @typescript-eslint/no-var-requires
    prisma.mCPTool.findUnique = registry.findUnique; prisma.mCPTool.findFirst = registry.findFirst;
    const { orchestrationServiceCaller } = require('../lib/services/workflow/integrations/service-caller'); // eslint-disable-line @typescript-eslint/no-var-requires
    const ctx = (role: string) => ({ user: { id: 'user-test', email: 'owner@example.invalid', role }, execution: { requestId: 'r' } });
    for (const role of ['ADMIN', 'USER']) {
      const r3 = await raced(orchestrationServiceCaller.callService(ctx(role), 'acme-files', 'get_file_contents', KEYCALL.arguments));
      check(`KN6 route 3 (the admin workflow route), caller role ${role}: the key file is refused although the context carries NO execution id`, sawKeyMsg(r3), String(JSON.stringify(r3)).slice(0, 300));
    }
    const r3conf = await raced(orchestrationServiceCaller.callService(ctx('ADMIN'), 'acme-files', 'get_file_contents', CONFCALL.arguments));
    check('KN6 route 3, a configuration file: not refused by this rule', !sawKeyMsg(r3conf), String(JSON.stringify(r3conf)).slice(0, 200));
    const sc = fs.readFileSync(path.join(__dirname, '../lib/services/workflow/integrations/service-caller.ts'), 'utf8').replace(/\/\/.*$/gm, '');
    check('KN6 route 3 builds its gate context itself, with the route marker and no execution id', /source: 'mcp_hub_workflow', route: ADMIN_WORKFLOW_ROUTE \}/.test(sc) && !/callingExecutionId/.test(sc));
  }

  console.log('── the execution id is never empty, and has one writer ──');
  {
    const ROOT = path.join(__dirname, '..');
    const rd = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const loop = rd('lib/agents/harness/agentic-tool-loop.ts'); const svc = rd('lib/services/mcp/mcpService.ts');
    check('KN7 every tool call of the loop carries the loop\'s own execution id as sessionId', (loop.match(/\{ sessionId: ctx\.executionId, userId: ctx\.userId \|\| 'system', timeout: RUNTIME_LIMITS\.TOOL_CALL_TIMEOUT_MS \}/g) ?? []).length === 1
      && (loop.match(/deps\.executeToolOnServer\(/g) ?? []).length === 1);
    check('KN7 mcpService is the one writer of callingExecutionId on a tool context, from options.sessionId', (svc.match(/callingExecutionId:/g) ?? []).length === 1
      && svc.includes('...(options.sessionId ? { callingExecutionId: options.sessionId } : {}),'));
    // A plain directory walk, NOT `git grep`: the public export is validated in a directory that is not a git repository (plan §9.5;
    // the first form called git and the ship's export dry run refused the push, 2026-11-21).
    const walkSource = (dir: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '.next' || e.name.startsWith('.git')) continue;
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walkSource(rel, out);
        else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(e.name)) out.push(rel);
      }
      return out;
    };
    const writers = [...walkSource('lib'), ...walkSource('app')]
      .filter((f) => /callingExecutionId\s*:\s*[A-Za-z(]/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')))
      .filter((f) => /\bcallingExecutionId\s*:\s*(options|args|parameters|params|body|input|request)\b/.test(rd(f))).sort();
    // Two files match the shape `callingExecutionId: <options|args|…>.…`: mcpService (THE writer, from options.sessionId) and
    // leg-child-override.ts, whose match is a LOG field echoing its own function argument (already the server-set id, handed down by
    // the action router) — not a context writer. A third file here is a new writer to read by hand.
    check('KN7 no OTHER file builds callingExecutionId from arguments, a request body or parameters',
      JSON.stringify(writers) === JSON.stringify(['lib/services/leg-child-override.ts', 'lib/services/mcp/mcpService.ts'])
      && /log\.warn\(\{ taskId: args\.taskId[\s\S]{0,160}callingExecutionId: args\.callingExecutionId \?\? null, errorCode: 'LEG_CHILD_OVERRIDE_REFUSED' \}/.test(rd('lib/services/leg-child-override.ts')), writers.join(', '));
    let threw = ''; let provider = 0;
    try {
      await runAgenticToolLoop({ prompt: 'x', cfg: { model: 'm', maxTokens: 10 } as never, maxToolTurns: 1, deadlineAt: null, agentRole: null, executionId: '', taskId: 't' } as never,
        { generateText: async () => { provider++; return { text: 'x', stopReason: 'end_turn' }; }, getToolDefinition: async () => null, executeToolOnServer: async () => ({}), logger: { warn: () => undefined, info: () => undefined, debug: () => undefined, error: () => undefined } } as never);
    } catch (e) { threw = (e as Error).message; }
    check('KN7 the loop REFUSES to start without an execution id — before any provider call', threw.startsWith('AGENT_LOOP_NO_EXECUTION_ID') && provider === 0, `${threw} / provider calls ${provider}`);
    // with an EMPTY session id mcpService sets no id — which is why the loop must never have one
    seenContexts.length = 0;
    await raced((mcpService as unknown as { callEmbeddedTool: (t: string, a: unknown, o: Rec) => Promise<unknown> }).callEmbeddedTool('services', CONFCALL, { sessionId: '', userId: 'system' }));
    check('KN7 control: an empty session id yields NO callingExecutionId (the reason for the loop\'s guard)', seenContexts.length === 1 && !('callingExecutionId' in seenContexts[0]), JSON.stringify(seenContexts[0])?.slice(0, 200));
  }

  // ══ Config sources STEP 3 slice P5 — join precondition 5: two of the three call-chain links sec-ops proved BY READING (P1) ══
  // KN6 drove the routes with a stand-in for `serverManager.executeToolOnServer` and a hand-written `services` switch in place of
  // the dispatcher. Here the SAME calls go through the REAL ones, wired as production wires them:
  //   the loop's tool turn → the REAL `mcpServerManager.executeToolOnServer` (as execution-core.ts passes it) → the real
  //   `mcpService.callTool` → the embedded server's `services` tool = the REAL `wrapWithSchema('services', …)` over the REAL
  //   `ServicesDispatcher` over a REAL `HubToolsHandler` (as embedded-server.ts registers it) → the real gateway / workflow handlers.
  // What is still a stub: the database (the same stub registry row as KN6), the hub's access check and its interaction tracker,
  // and the user fields the stub database cannot give — the same three things KN6 states. The third link (the web route above
  // `orchestrationServiceCaller.callService`) needs a real session and a real database: scripts/test-admin-workflow-route-behavioral.ts.
  console.log('── KN8: the real server manager and the real services dispatcher (join precondition 5) ──');
  {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { mcpServerManager, MCPServerStatus } = require('../lib/services/mcp/serverManager');
    const { HubToolsHandler } = require('../lib/mcp/server/tools/hub-tools-handler');
    const { ServicesDispatcher } = require('../lib/mcp/server/tools/dispatchers/services-dispatcher');
    const { wrapWithSchema } = require('../lib/mcp/server/tools/dispatchers/dispatch-with-schema');
    /* eslint-enable @typescript-eslint/no-var-requires */
    const EMBEDDED = 'paichart-embedded-mcp';
    const hub = new HubToolsHandler(wfPrisma);
    hub.utilities.checkServiceAccess = async () => true; hub.utilities.trackServiceInteraction = async () => undefined;
    const dispatcher = new ServicesDispatcher(hub);
    const realServices = wrapWithSchema('services', dispatcher.handle.bind(dispatcher));
    const dispatched: Array<{ action: unknown; ctx: Rec }> = [];
    const priorImpl = emb.toolImplementations.get('services') as Function;
    emb.toolImplementations.set('services', async (a: Rec, ctx: Rec) => {
      dispatched.push({ action: a.action, ctx });
      return realServices(a, { ...ctx, user: { ...(ctx?.user as Rec), id: 'user-test', email: 'owner@example.invalid', role: 'ADMIN' } });
    });
    // The real manager, with ONE connected server planted in its map (it holds no connection: the embedded server is in-process).
    const servers = (mcpServerManager as unknown as { servers: Map<string, Rec> }).servers;
    const hadServer = servers.has(EMBEDDED); const priorServer = servers.get(EMBEDDED);
    servers.set(EMBEDDED, { name: EMBEDDED, status: MCPServerStatus.CONNECTED, errorCount: 0, lastActivity: new Date(0) });
    const forwarded: Rec[] = [];
    const origCallTool = (mcpService as unknown as { callTool: Function }).callTool.bind(mcpService);
    (mcpService as unknown as { callTool: Function }).callTool = (s: string, t: string, a: unknown, o: Rec) => { forwarded.push({ server: s, tool: t, options: o }); return origCallTool(s, t, a, o); };
    /** The loop's tool turn, with execution-core's own wiring of the manager — on a WIDER options object than the loop builds (two
     *  extra fields), so the test can see that the manager forwards its three-field pick and nothing else. (The platform-only
     *  option that pick exists to keep out is pinned by name in test-security-invariants PD20; this file does not name it — PD20's
     *  sweep lists every file that does.) */
    const viaManager = async (args: Rec, executionId: string): Promise<string> => {
      const { toolCallRecords } = await executeToolTurn(
        [{ id: 'tu_8', name: 'services', arguments: JSON.stringify(args) }],
        { getToolDefinition: async () => ({ serverName: EMBEDDED }),
          executeToolOnServer: (srv: string, t: string, a: unknown, o: { sessionId: string; userId: string; timeout: number }) =>
            mcpServerManager.executeToolOnServer(srv, t, a as Record<string, unknown>, { ...o, anExtraOption: 'x', callingExecutionId: 'forged-by-the-caller' } as never),
          logger: { warn: () => undefined } } as never,
        { executionId, turn: 1 } as never);
      return JSON.stringify(toolCallRecords[0]);
    };
    try {
      // Link 1 + link 2, route 1 (services.call)
      dispatched.length = 0; forwarded.length = 0;
      const k1 = await raced(viaManager(KEYCALL, 'exec-kn8-1'));
      check('KN8 link 1 — the REAL serverManager.executeToolOnServer forwards the loop\'s execution id to mcpService as sessionId, and ONLY its three-field pick (every other field of the caller\'s object is dropped)',
        forwarded.length === 1 && forwarded[0].server === EMBEDDED && forwarded[0].tool === 'services'
        && JSON.stringify(Object.keys(forwarded[0].options as Rec).sort()) === JSON.stringify(['sessionId', 'timeout', 'userId']) && (forwarded[0].options as Rec).sessionId === 'exec-kn8-1',
        JSON.stringify(forwarded).slice(0, 300));
      check('KN8 link 1 — the tool context the embedded server receives is exactly { user, authenticated, callingExecutionId }: the loop\'s id, never a field the caller added',
        dispatched.length === 1 && dispatched[0].ctx.callingExecutionId === 'exec-kn8-1'
        && JSON.stringify(Object.keys(dispatched[0].ctx).sort()) === JSON.stringify(['authenticated', 'callingExecutionId', 'user']), JSON.stringify(dispatched[0]?.ctx)?.slice(0, 200));
      check('KN8 link 2 — through the REAL ServicesDispatcher (schema wrapper, CUID check, action switch) and the real HubToolsHandler the context reaches the gate: the key file is refused with the class\'s message',
        sawKeyMsg(k1), String(k1).slice(0, 400));
      const k1conf = await raced(viaManager(CONFCALL, 'exec-kn8-1'));
      check('KN8 link 2 — the same route, a configuration file: NOT refused by this rule (it goes on to the service and fails there)', !sawKeyMsg(k1conf) && !String(k1conf).includes('Invalid action'), String(k1conf).slice(0, 300));
      // route 2 (a workflow step) through the same two real links
      dispatched.length = 0;
      const k2 = await raced(viaManager(WFKEY, 'exec-kn8-2'));
      check('KN8 links 1 + 2, route 2 (workflow.execute): the id reaches the step\'s gate through the real dispatcher and the key file is refused',
        sawKeyMsg(k2) && dispatched[0]?.action === 'workflow.execute' && dispatched[0]?.ctx.callingExecutionId === 'exec-kn8-2', `${String(k2).slice(0, 400)} | ${JSON.stringify(dispatched[0]?.ctx)?.slice(0, 160)}`);
      const k2conf = await raced(viaManager(WFCONF, 'exec-kn8-2'));
      check('KN8 links 1 + 2, route 2, a configuration file: not refused by this rule', !sawKeyMsg(k2conf), String(k2conf).slice(0, 300));
      // a CHAT call through the same real dispatcher: no execution id on the context ⇒ not an agent ⇒ not refused by this rule
      const chat = await raced(realServices(KEYCALL, CHAT_USER) as Promise<unknown>);
      check('KN8 link 2 — a chat client through the real dispatcher: NOT refused by this rule', !sawKeyMsg(chat), String(JSON.stringify(chat)).slice(0, 300));
      // the dispatcher hands the handler the context OBJECT it was given (it never rebuilds it)
      const seen: unknown[] = [];
      const probe = new ServicesDispatcher({ handleCallService: async (_a: unknown, c: unknown) => { seen.push(c); return { content: [] }; }, handleExecuteWorkflow: async (_a: unknown, c: unknown) => { seen.push(c); return { content: [] }; } });
      const ctxObj = { user: { id: 'u' }, callingExecutionId: 'exec-x' };
      await probe.handle({ action: 'call', targetService: 's', tool: 't' }, ctxObj); await probe.handle({ action: 'workflow.execute', steps: [] }, ctxObj);
      check('KN8 link 2 — the dispatcher passes the SAME context object to the gateway and the workflow handler', seen.length === 2 && seen[0] === ctxObj && seen[1] === ctxObj);
      // a server that is NOT connected: the manager refuses before mcpService is asked
      servers.set(EMBEDDED, { name: EMBEDDED, status: MCPServerStatus.DISCONNECTED, errorCount: 0, lastActivity: new Date(0) });
      forwarded.length = 0;
      const down = await raced(viaManager(CONFCALL, 'exec-kn8-3'));
      check('KN8 link 1 — a server that is not connected: the manager throws and mcpService is never called', forwarded.length === 0 && String(down).includes('not connected'), String(down).slice(0, 200));
    } finally {
      (mcpService as unknown as { callTool: Function }).callTool = origCallTool;
      if (hadServer) servers.set(EMBEDDED, priorServer as Rec); else servers.delete(EMBEDDED);
      emb.toolImplementations.set('services', priorImpl);
    }
    const ROOT = path.join(__dirname, '..');
    const strip = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    check('KN8 static — execution-core hands the loop the manager\'s own method with the loop\'s options object; the embedded server registers `services` as the wrapped dispatcher',
      /executeToolOnServer: \(s: string, t: string, a: unknown, o: \{ sessionId: string; userId: string; timeout: number \}\) =>\s*mcpServerManager\.executeToolOnServer\(s, t, a as Record<string, any>, o\),/.test(strip('lib/services/execution-core.ts'))
      && strip('lib/mcp/embedded-server.ts').includes("services: wrapWithSchema('services', servicesDispatcher.handle.bind(servicesDispatcher)),")
      && strip('lib/mcp/embedded-server.ts').includes('const servicesDispatcher = new ServicesDispatcher(hubTools);'));
  }

  console.log(`\n${passed} passed, ${fails.length} failed`);
  process.exit(fails.length === 0 ? 0 : 1);
})().catch((e) => { console.error('❌ test-never-read-key-files threw:', e); process.exit(1); });
