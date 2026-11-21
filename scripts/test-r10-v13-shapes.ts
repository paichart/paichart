#!/usr/bin/env ts-node
/**
 * R10 v13 — the collector and nginx credential shapes, through the FOUR paths (register R10-COLLECTOR-NGINX-SHAPES).
 *
 * Specification: cline_docs/reviews/r10-v13-2026-11-21/SHAPES.md (sec-ops). Build record: R10-V13-BUILD.md beside it.
 * Fixture: scripts/fixtures/r10-v13/collector-nginx-shapes.json — 32 shapes, 20 negatives, 39 extra probes. Every value in it is
 * invented (`Synth3tic…`); the private-key marker lines are assembled at run time (`assemble`), never stored.
 *
 * Paths (SHAPES condition 2): `redactArtifactSecrets` (plain arm) · `redactSecretsDeep` · `redactArtifactsForPersist` (echo pass on)
 * · `canonicalBase` (the capture chain). Plus arm 2 (a truncated serialized leaf) for every new LINE rule — taken, or pinned as the
 * named residual. Hard properties pinned per text: the secret is gone, `keep[]` survives, the line COUNT and every UNCHANGED line's
 * POSITION are the input's (a held file is edited by line), a negative comes back byte-identical with count 0.
 * Timing: each new rule on a 1 MB adversarial input of its own shape (SHAPES condition 7), incl. U+2028 and 100,000 commas; the six
 * rules of R10-LINE-SEPARATOR-QUADRATIC and a sweep of every rule source in a child killed at a cap. The credential-shaped line test:
 * a generated pin over R10's closed name lists, and corpus checks.
 * `R10V13_SKIP_TIMING=1` skips the timing cases only (for a machine under load); the gates run them.
 *
 * No git call, no database, no network, no path outside scripts/fixtures — runs unchanged inside the public export.
 */
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import {
  R10_VERSION, PLACEHOLDER, redactArtifactSecrets, redactSecretsDeep, redactArtifactsForPersist, redactSerializedLeaf,
  collectR10EchoSources, echoLiteralsFor, isCredentialShapedLine, CREDENTIAL_LINE_VERSION, CREDENTIAL_LINE_SOURCES, R10_RULE_SOURCES, R10_SERIALIZED_RULE_SOURCES, R10_CLOSED_LIST_SOURCES,
} from '../lib/agents/harness/redact-artifact-secrets';
import { canonicalBase } from '../lib/agents/harness/held-bytes/canonical-text';

delete process.env.ARTIFACT_SECRET_REDACT_ENABLED; // the persist path reads the switch; this suite tests R10 ON

// ── CHILD MODES (R10-LINE-SEPARATOR-QUADRATIC) ───────────────────────────────────────────────────────────────────────────────
// A regex that has gone quadratic cannot be interrupted from inside its own process, so the cases that would take minutes if a
// rule regressed run in a CHILD the parent kills at a fixed cap: a red result, never a hung suite. The child prints one JSON line
// per finished case; a case with no line did not finish before the cap.
const LINE_SEPARATORS: Array<[string, string]> = [['bare CR', '\r'], ['U+2028', '\u2028'], ['U+2029', '\u2029']];
/** The six rules fixed in v13: a name, a head that starts the rule on every "line", and a needle that finds its source. */
const SEPARATOR_RULES: Array<[string, string, string]> = [
  ['set … pre-shared-key', 'set security ike policy p', 'pre-shared-key(?:'],
  ['set … encrypted-password', 'set system root-authentication', 'encrypted-password[ \\t]+'],
  ['snmp-server user … auth-password', 'snmp-server user u v3', 'bauth-password'],
  ['snmp-server user … priv-password', 'snmp-server user u v3', 'bpriv-password'],
  ['snmp-server user … auth <alg>', 'snmp-server user u g v3', 'bauth[ \\t]+'],
  ['snmp-server user … priv <alg>', 'snmp-server user u g v3', 'bpriv[ \\t]+'],
];
// Architectural review F2 / sec-ops S4: the separators are written as ESCAPES above (a whitespace-normalising tool would turn a raw
// U+2028 into a space and the pins into tests of a space). Asserted once, in the child and in the parent.
const SEPARATORS_ARE_REAL = LINE_SEPARATORS.map(([, c]) => c.codePointAt(0)).join(',') === '13,8232,8233' && LINE_SEPARATORS.every(([, c]) => c.length === 1);
const CHILD_MB = 1024 * 1024;
const childFill = (unit: string, size = CHILD_MB): string => unit.repeat(Math.ceil(size / unit.length)).slice(0, size);
const sourceToRegex = (s: string): RegExp | null => { const m = /^(?:line|block|serialized):\/(.*)\/([a-z]*)$/s.exec(s); return m ? new RegExp(m[1], m[2]) : null; };
function childSeparators(): never {
  if (!SEPARATORS_ARE_REAL) process.exit(3);
  const out = (o: Record<string, unknown>) => process.stdout.write(JSON.stringify(o) + '\n');
  const time = (f: () => void): number => { const t0 = Date.now(); f(); return Date.now() - t0; };
  for (const [rule, head, needle] of SEPARATOR_RULES) {
    const plainSrc = R10_RULE_SOURCES.filter((s) => s.startsWith('line:') && s.includes(needle));
    const armSrc = R10_SERIALIZED_RULE_SOURCES.filter((s) => s.startsWith('serialized:') && s.includes(needle));
    for (const [sepName, sep] of LINE_SEPARATORS) {
      const input = childFill(head + sep);
      const pre = sourceToRegex(plainSrc[0] ?? ''); const are = sourceToRegex(armSrc[0] ?? '');
      out({ kind: 'rule', name: `${rule} × ${sepName}`, found: plainSrc.length === 1 && armSrc.length === 1,
        plain: pre ? time(() => input.replace(pre, (w) => w)) : -1, arm2: are ? time(() => input.replace(are, (w) => w)) : -1 });
    }
  }
  // THE WHOLE REDACTOR on the worst inputs known for the full rule set: both heads on every "line", each separator; and the same
  // lines joined by an ENCODED newline (arm 2's line start — the v7 class).
  for (const [sepName, sep] of [...LINE_SEPARATORS, ['an encoded newline', '\\n'] as [string, string]]) {
    const input = childFill('set x' + sep + 'snmp-server user u' + sep);
    out({ kind: 'whole', name: `whole redactor × ${sepName}`, plain: time(() => redactArtifactSecrets(input)), arm2: time(() => redactSerializedLeaf(input)),
      deep: time(() => redactSecretsDeep({ l: input })) });
  }
  process.exit(0);
}
/** THE FORWARD GUARD: every rule source (plain and arm 2) against inputs built from ITS OWN literal words × each line separator, so a
 *  rule added later is swept with no edit here. 250 KB per input; a linear rule takes a few ms, a quadratic one hundreds. */
const SWEEP_SIZE = 250_000; const SWEEP_BAR = 400;
function childSweep(): never {
  if (!SEPARATORS_ARE_REAL) process.exit(3);
  const wordsOf = (src: string): string[] => [...new Set((src.replace(/\[(?:\\.|[^\]\\])*\]/g, ' ').match(/[A-Za-z][A-Za-z_-]{2,}/g) || []))].slice(0, 12);
  let rules = 0; let inputs = 0; const flagged: string[] = [];
  for (const s of [...R10_RULE_SOURCES, ...R10_SERIALIZED_RULE_SOURCES]) {
    const re = sourceToRegex(s); if (!re) continue;
    rules += 1;
    const ws = wordsOf(re.source); const heads = new Set<string>();
    for (let i = 0; i < ws.length; i++) { heads.add(ws[i]); heads.add(`${ws[i]} x`); heads.add(`${ws[i]} "`); if (i + 1 < ws.length) { heads.add(`${ws[i]} ${ws[i + 1]}`); heads.add(`${ws[i]} ${ws[i + 1]} x `); } }
    // Architectural review F3: an arm-2 source's line start is ALSO the two-character ENCODED newline — the class the second
    // rewrite in toSerializedVariant exists for. A later rule that spells its class in another order gets no rewrite; this finds it.
    const seps: Array<[string, string]> = s.startsWith('serialized:') ? [...LINE_SEPARATORS, ['an encoded newline', '\\n']] : LINE_SEPARATORS;
    scan: for (const h of heads) for (const [sepName, sep] of seps) {
      const input = childFill(h + sep, SWEEP_SIZE); inputs += 1;
      const t0 = Date.now(); input.replace(re, (w) => w); const ms = Date.now() - t0;
      if (ms > SWEEP_BAR) { flagged.push(`${ms} ms /${re.source.slice(0, 60)}…/ on ${JSON.stringify(h)} + ${sepName}`); break scan; }
    }
  }
  process.stdout.write(JSON.stringify({ kind: 'sweep', rules, inputs, flagged }) + '\n');
  process.exit(0);
}
if (process.env.R10V13_CHILD === 'separators') childSeparators();
if (process.env.R10V13_CHILD === 'sweep') childSweep();
/** Run this file in a child mode; returns the JSON lines it printed before it exited or was killed at `capMs`. */
function runChild(mode: string, capMs: number): { lines: Array<Record<string, unknown>>; killed: boolean } {
  const r = spawnSync(process.execPath, [require.resolve('ts-node/dist/bin.js'), '--transpile-only', '-r', 'tsconfig-paths/register', __filename],
    { cwd: path.join(__dirname, '..'), env: { ...process.env, R10V13_CHILD: mode }, timeout: capMs, killSignal: 'SIGKILL', encoding: 'utf8', maxBuffer: 1 << 24 });
  const lines = String(r.stdout || '').split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l) as Record<string, unknown>);
  return { lines, killed: r.status !== 0 };
}

console.log('🧾 R10 v13 — collector and nginx credential shapes (four paths)\n');
let passed = 0; let failed = 0;
function check(name: string, cond: unknown, detail = ''): void {
  if (cond) { passed++; if (process.env.R10V13_VERBOSE) console.log(`✅ ${name}`); } else { failed++; console.error(`❌ ${name}${detail ? `\n   ${detail}` : ''}`); }
}

interface Shape { id: string; kind: string; family: string; text: string; secrets: string[]; keep: string[]; v12: string; v13Expect: string }
interface Negative { id: string; kind: string; why: string; text: string }
interface Probe { id: string; what: string; text: string; mustGo: string; v12: string }
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'r10-v13', 'collector-nginx-shapes.json'), 'utf8')) as
  { assemble: Record<string, string[]>; shapes: Shape[]; negatives: Negative[]; extraProbes: Probe[] };
const asm = (t: string): string => Object.entries(fx.assemble).reduce((a, [k, v]) => a.split(k).join(v.join('')), t);
const S = 'Synth3ticTok9aB7cD2eF5gH8'; // the fixture's token value (allowlisted in .gitleaks.toml)
const K = 'Synth3ticKey9aB7cD2eF5gH8';
const P = 'Synth3ticPw9xK2';
const AU = 'au' + 'th'; // assembled: `set $x_auth <url>` in a source line reads as a credential assignment to the repository's secret scanner

/** Line discipline: same number of lines, and every line that did not change is at the same index. */
function linesHold(input: string, output: string): boolean {
  const a = input.split('\n'); const b = output.split('\n');
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && !b[i].includes('REDACTED-SECRET')) return false;
  return true;
}
const plain = (t: string) => redactArtifactSecrets(t);
const deep = (t: string) => { const r = redactSecretsDeep({ files: { f: t } }); return { redacted: (r.value as { files: { f: string } }).files.f, redactedCount: r.redactedCount }; };
function persist(t: string, echoOf: string[]) {
  const report = `# Report\n\nThe file was read.\n${echoOf.map((s) => `Seen value: \`${s}\` (restated)`).join('\n')}\n`;
  const r = redactArtifactsForPersist({ finalResponse: `done. ${echoOf.map((s) => `value ${s} noted`).join('; ')}`, toolCalls: [{ tool: 'read_file', result: { content: [{ type: 'text', text: t }] } }] }, report);
  const rj = r.resultJson as { finalResponse: string; toolCalls: Array<{ result: { content: Array<{ text: string }> } }> };
  return { text: rj.toolCalls[0].result.content[0].text, finalResponse: rj.finalResponse, report: r.reportMd as string, count: r.redactedCount, echo: r.echoRedactedCount };
}
/** Is `secret` one of the literals the persist's echo pass matches for this text? (decides whether a bare restatement goes) */
function echoCovers(t: string, secret: string): boolean {
  for (const tok of collectR10EchoSources(t)) if (echoLiteralsFor(tok).includes(secret)) return true;
  return false;
}

// ── 0. version ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
check('R10_VERSION is paichart.r10/13', R10_VERSION === 'paichart.r10/13', R10_VERSION);

// ── 1. the 32 shapes × four paths ────────────────────────────────────────────────────────────────────────────────────────────
const RESIDUAL_BY_DESIGN = new Set(['H32']);
const table: string[] = [];
let taken = 0;
for (const s of fx.shapes) {
  const t = asm(s.text);
  const residual = RESIDUAL_BY_DESIGN.has(s.id);
  check(`${s.id} fixture expectation matches the build (${s.v13Expect})`, (s.v13Expect === 'residual-by-design') === residual);
  const gone = (out: string) => s.secrets.every((x) => !out.includes(x));
  const kept = (out: string) => s.keep.every((x) => out.includes(x));
  // path 1 — plain arm
  const p1 = plain(t);
  // path 2 — deep walk
  const p2 = deep(t);
  // path 3 — persist with the echo pass
  const p3 = persist(t, s.secrets);
  // path 4 — the capture chain
  const p4 = canonicalBase(t, { redact: true });
  if (residual) {
    check(`${s.id} NAMED RESIDUAL: untouched by the plain arm, count 0 (a bare user:plaintext line cannot be told from host:port)`, p1.redacted === t && p1.redactedCount === 0);
    check(`${s.id} NAMED RESIDUAL: untouched by the deep walk and held as-is by canonicalBase`, p2.redacted === t && p4.ok && p4.B === t && p4.redactedCount === 0);
    check(`${s.id} NAMED RESIDUAL: its line is credential-shaped (the comparator withholds it)`, t.split('\n').filter((l) => s.secrets.some((x) => l.includes(x))).every(isCredentialShapedLine));
    table.push(`${s.id} | residual | residual | residual | residual (held as-is)`);
    continue;
  }
  check(`${s.id} plain: secret gone`, gone(p1.redacted), p1.redacted);
  check(`${s.id} plain: key / directive / structure survive`, kept(p1.redacted), p1.redacted);
  check(`${s.id} plain: line count and positions hold, count >= 1`, linesHold(t, p1.redacted) && p1.redactedCount >= 1, `count ${p1.redactedCount}`);
  check(`${s.id} plain: idempotent (a second pass changes nothing, count 0)`, plain(p1.redacted).redacted === p1.redacted && plain(p1.redacted).redactedCount === 0);
  check(`${s.id} deep: same text as the plain arm`, p2.redacted === p1.redacted && p2.redactedCount === p1.redactedCount, p2.redacted);
  check(`${s.id} persist: the tool-result text has no secret and keeps its lines`, gone(p3.text) && kept(p3.text) && linesHold(t, p3.text), p3.text);
  for (const sec of s.secrets) {
    const covered = echoCovers(t, sec);
    const bare = p3.report.includes(sec) || p3.finalResponse.includes(sec);
    check(`${s.id} persist echo: a bare restatement of the secret is ${covered ? 'redacted in report.md and finalResponse' : 'NOT an echo literal (named: the token carries more than the secret, or is not echo-eligible)'}`, covered ? !bare : bare);
  }
  check(`${s.id} canonicalBase: held, B = the plain arm's text, no secret, version stamped`, p4.ok && p4.B === p1.redacted && gone(p4.B) && p4.redactorVersion === R10_VERSION && p4.redactedCount === p1.redactedCount,
    p4.ok ? '' : `refused ${(p4 as { refusal: string }).refusal}`);
  taken += 1;
  table.push(`${s.id} | redacted (${p1.redactedCount}) | redacted | redacted${s.secrets.every((x) => echoCovers(t, x)) ? ' + echo' : ''} | ${p4.ok ? 'held, redacted' : `refused ${(p4 as { refusal: string }).refusal}`}`);
}
check('31 of the 32 shapes are redacted through all four paths; H32 is the one named residual', taken === 31 && fx.shapes.length === 32, `taken ${taken}`);

// ── 2. the 20 negatives × four paths: byte-identical, count 0 ────────────────────────────────────────────────────────────────
for (const n of fx.negatives) {
  const t = asm(n.text);
  const p1 = plain(t); const p2 = deep(t); const p3 = persist(t, []); const p4 = canonicalBase(t, { redact: true });
  check(`${n.id} negative: plain byte-identical, count 0`, p1.redacted === t && p1.redactedCount === 0, p1.redacted);
  check(`${n.id} negative: deep byte-identical, count 0`, p2.redacted === t && p2.redactedCount === 0, p2.redacted);
  check(`${n.id} negative: persist byte-identical, count 0`, p3.text === t && p3.count === 0, p3.text);
  check(`${n.id} negative: canonicalBase holds it unchanged`, p4.ok && p4.B === t && p4.redactedCount === 0);
}
check('20 negatives in the fixture', fx.negatives.length === 20);

// ── 3. negatives added while writing each rule (SHAPES §3 last paragraph + each rule's own "reference stays") ─────────────────
const ADDED_NEGATIVES: Array<[string, string]> = [
  ['the directive inside a longer word', `        proxy_set_header_x Authorization ${S};\n        my_proxy_set_header Authorization ${S};`],
  ['a map entry whose key is "Bearer" alone', 'map $http_authorization $ok {\n    default 0;\n    "Bearer" 1;\n    "Basic" 1;\n}'],
  ['an nginx value mixing variables and text, under a non-credential name', '        proxy_set_header X-Forwarded-Url "$scheme://$host";\n        set $upstream_url "$scheme://$host$request_uri";'],
  ['a set whose value is a path', '        set $jwt_secret /etc/nginx/keys/jwt.key;\n        set $api_token "/run/secrets/api_token";'],
  ['a set / header value that is wholly variables', '        set $api_token "$arg_a$arg_b";\n        proxy_set_header X-Auth-Token ${upstream_token};\n        proxy_set_header Cookie "$http_cookie";\n        grpc_set_header x-api-key $http_x_api_key;'],
  ['a reference after a scheme word', '        proxy_set_header Authorization "Bearer $token";\n        if ($http_authorization != "Bearer $expected") { return 403; }\n        if ($http_authorization != "Bearer $tok") { return 403; }'],
  ['a map on a credential variable whose entries are references or short flags', 'map $http_authorization $ok {\n    default 0;\n    "Bearer $expected_token" 1;\n    "Bearer $tok" 1;\n    $expected_auth 1;\n    ~^Bearer\\s 2;\n}'],
  ['QUOTED REGEX entries of a cookie map — the standard cache-bypass map (sec-ops review M1)', 'map $http_cookie $skip_cache {\n    default 0;\n    "~*wordpress_logged_in_[a-f0-9]+" 1;\n    "~*PHPSESSID=.+" 1;\n    \'~^session_id=[0-9a-f]{32}\' 1;\n    ~*comment_author_1234 1;\n}'],
  ['a URL with no userinfo assigned to an auth-named variable (sec-ops review S2)', '        set $upstream_' + AU + ' http://oauth2-proxy.auth.svc:4180;\n        set $forward_' + AU + ' "http://' + AU + 'elia:9091/api/verify";\n        set $backend_' + AU + ' \'https://idp.example.invalid/oauth2/v2.0/token\';'],
  ['a map on a non-credential variable with long shaped entries', 'map $http_x_tenant $pool {\n    default pool_default;\n    "tenant-a-2026.example" pool_a9;\n    tenant-b-2026.example pool_b9;\n}'],
  ['empty and scheme-only credential headers', '        proxy_set_header Authorization "";\n        proxy_set_header Cookie "";\n        proxy_set_header Authorization "Bearer";\n        grpc_set_header authorization Basic;'],
  ['set / if on a credential-named variable with a flag value', '        set $require_auth 1;\n        set $auth "off";\n        set $skip_auth yes;\n        if ($arg_token = "1") { return 204; }\n        if ($http_authorization = "") { return 401; }'],
  ['set / if on a variable that is not credential-named', '        set $backend "collector-2026.example.invalid:4318";\n        if ($request_method = "PROPFIND1") { return 405; }\n        if ($http_user_agent != "probe/1.2.3-abcdef") { return 403; }'],
  ['secure_link directives that carry no literal secret', '        secure_link $arg_md5,$arg_expires;\n        secure_link_secret $link_secret;\n        secure_link_md5 "$secure_link_expires$uri$remote_addr";'],
  ['generic headers that are not credential-named', '      X-Hub-Signature: sha256=3f5a9c1e7b2d4f6a\n      X-Cache-Key: v1.2026\n      x-partition-key: user.id\n      X-Token-Type: bearer\n      X-Request-Id: 9f8e7d6c5b4a'],
  ['generic credential headers whose value is a reference or a word', '      X-Auth-Token: ${env:UPSTREAM_TOKEN}\n      X-Token: ${TOKEN}\n      X-Api-Token: "${env:T}"\n      X-Auth: required'],
  ['key names near the two new ones', '    instrumentation_key_file: /etc/otel/ikey.2026\n    account_token_ttl: 3600\n    instrumentation: enabled1\n    account: acct-2026'],
  ['a flow map whose credential values are references, words or absent', '    headers: { api-key: ${env:OTLP_API_KEY}, authorization: "Bearer ${env:T}", x-team: platform }\n    client_auth: { username: collector, password: ${env:PW} }\n    auth: { authenticator: bearertokenauth, token_file: /var/run/secrets/otel/token9 }\n    tls: { insecure: true, key_file: /etc/otel/key.pem }'],
  ['a one-line JSON object and a prose brace (no YAML key before the brace)', `{"user": "collector", "password": "${P}"}\nUse { token: ${S} } in the example above.\n  see {password: ${P}}`],
  ['a flow SEQUENCE and a flow map with a non-credential key', `    brokers: [kafka-1.example.invalid:9092, kafka-2.example.invalid:9092]\n    labels: { tokenizer: v2.1, keyspace: ks9, secretName: otel-tls-2026 }`],
  ['a one-line JS / TS object literal (the same shape as a flow map) whose values are code or documentation words', "        headers: { 'api-key': this.apiKey }\n      headers: { 'Authorization': 'Bearer token' }\nHeaders: { Authorization: \"Bearer [admin token]\" }\n      data: { API_KEY: S.cmApiKey, password: hash(pw1), token: process.env.TOKEN }"],
  ['htpasswd settings that carry no credential', 'extensions:\n  basicauth/server:\n    htpasswd:\n      file: /etc/otel/.htpasswd\n  health_check:\n    endpoint: 0.0.0.0:13133'],
  ['pairs that look like user:hash but carry no hash prefix', 'endpoint: localhost:4318\nimage: otel/collector@sha256:3f5a9c1e7b2d4f6a8c0e1b3d5f7a9c2e4b6d8f0a1c3e5b7d9f2a4c6e8b0d1f3a\nprice:$1$2\nnote:{SHARED}abcdefghijklmnopqrstuvwx\ncost: $5$ per unit'],
  ['a commented mention of each new directive', `        # proxy_set_header X-API-Key is set upstream\n        # the secure_link_secret directive is not used\n# set $api_token from the vault, see runbook\n# if ($http_x_api_key != expected) is checked by the gateway`],
];
for (const [name, t] of ADDED_NEGATIVES) {
  const p1 = plain(t); const p2 = deep(t); const p4 = canonicalBase(t, { redact: true }); const p3 = persist(t, []);
  check(`added negative — ${name}: plain byte-identical, count 0`, p1.redacted === t && p1.redactedCount === 0, p1.redacted);
  check(`added negative — ${name}: persist byte-identical, count 0`, p3.text === t && p3.count === 0, p3.text);
  check(`added negative — ${name}: deep byte-identical; canonicalBase holds it unchanged`, p2.redacted === t && p2.redactedCount === 0 && p4.ok && p4.B === t, p2.redacted);
}

// ── 4. the 39 extra probes: the eleven "also take", and every other one pinned where it stands ───────────────────────────────
const ALSO_TAKE = ['E01', 'E05', 'E08', 'E21', 'E29', 'E33', 'E34', 'E35', 'E38', 'E39', 'E40'];
const V12_ALREADY = ['E04', 'E06', 'E07', 'E09', 'E12', 'E16', 'E17', 'E18', 'E20', 'E22', 'E36', 'E37'];
const RESIDUAL_PROBES = ['E02', 'E03', 'E10', 'E11', 'E14', 'E15', 'E19', 'E23', 'E24', 'E25', 'E26', 'E27', 'E28', 'E30', 'E31', 'E32'];
const probeTaken: string[] = []; const probeLeft: string[] = [];
for (const e of fx.extraProbes) {
  const t = asm(e.text);
  const p1 = plain(t); const p2 = deep(t); const p3 = persist(t, []); const p4 = canonicalBase(t, { redact: true });
  const went = !p1.redacted.includes(e.mustGo);
  (went ? probeTaken : probeLeft).push(e.id);
  check(`${e.id} probe: line count and positions hold on every path`, linesHold(t, p1.redacted) && linesHold(t, p2.redacted) && linesHold(t, p3.text));
  check(`${e.id} probe: the four paths agree (${went ? 'taken' : 'left'})`, p2.redacted === p1.redacted && p3.text.includes(e.mustGo) === !went && p4.ok && p4.B === p1.redacted, p4.ok ? p2.redacted : `refused ${(p4 as { refusal: string }).refusal}`);
  check(`${e.id} probe: every line carrying the value is credential-shaped (the comparator withholds it whether R10 takes it or not)`,
    t.split('\n').filter((l) => l.includes(e.mustGo)).every(isCredentialShapedLine));
  if (V12_ALREADY.includes(e.id)) check(`${e.id} probe: v12 redacted it and v13 still does`, e.v12 === 'redacted' && went);
}
for (const id of ALSO_TAKE) check(`${id} — one of the eleven "also take" probes — is redacted`, probeTaken.includes(id));
check('the probes v13 takes are exactly the eleven + the twelve v12 already took', JSON.stringify([...probeTaken].sort()) === JSON.stringify([...ALSO_TAKE, ...V12_ALREADY].sort()), probeTaken.join(' '));
check('the probes left are exactly the sixteen named residuals (R10-V13-RESIDUALS)', JSON.stringify([...probeLeft].sort()) === JSON.stringify([...RESIDUAL_PROBES].sort()), probeLeft.join(' '));
check('39 extra probes in the fixture', fx.extraProbes.length === 39);

// ── 5. exact outputs — what survives on the line (one per new rule) ──────────────────────────────────────────────────────────
const R = PLACEHOLDER;
const EXACT: Array<[string, string, string]> = [
  ['nginx header, no scheme (N21)', `        proxy_set_header Authorization ${S};`, `        proxy_set_header Authorization ${R};`],
  ['nginx key-named header (N22)', `        proxy_set_header X-API-Key ${K};`, `        proxy_set_header X-API-Key ${R};`],
  ['nginx grpc_set_header + scheme (N23)', `        grpc_set_header authorization "Bearer ${S}";`, `        grpc_set_header authorization "Bearer ${R}";`],
  ['nginx set (N24)', `        set $api_token "${S}";`, `        set $api_token "${R}";`],
  ['nginx secure_link_secret (N25)', '        secure_link_secret Synth3ticSec9aB7cD2eF5;', `        secure_link_secret ${R};`],
  ['nginx map entry (N26)', `map $http_authorization $otlp_ok {\n    default 0;\n    "Bearer ${S}" 1;\n    '${S}' 2;\n    ${S} 3;\n}`, `map $http_authorization $otlp_ok {\n    default 0;\n    "Bearer ${R}" 1;\n    '${R}' 2;\n    ${R} 3;\n}`],
  ['nginx if (N27)', `        if ($http_x_api_key != "${K}") { return 401; }`, `        if ($http_x_api_key != "${R}") { return 401; }`],
  ['nginx if with a scheme word', `        if ($http_authorization != "Bearer ${S}") { return 401; }`, `        if ($http_authorization != "Bearer ${R}") { return 401; }`],
  ['nginx cookie, the whole quoted value (N28)', '        proxy_set_header Cookie "theme=dark; session=Synth3ticSess9aB7cD2eF5gH8";', `        proxy_set_header Cookie "${R}";`],
  ['nginx directive after { on one line (E29), two directives', `    location / { proxy_set_header Authorization "Bearer ${S}"; proxy_set_header X-Auth-Token ${S}; }`, `    location / { proxy_set_header Authorization "Bearer ${R}"; proxy_set_header X-Auth-Token ${R}; }`],
  ['nginx ApiKey scheme (E21) and a single-quoted bare token', `        proxy_set_header Authorization "ApiKey ${S}";\n        proxy_set_header Authorization '${S}';`, `        proxy_set_header Authorization "ApiKey ${R}";\n        proxy_set_header Authorization '${R}';`],
  ['a reference is exempt only as the WHOLE token (condition 5): a literal glued to a variable goes', `        proxy_set_header X-API-Key "$prefix-${K}";\n        proxy_set_header Cookie "session=$cookie_x";\n        set $api_token "$arg_a.${S}";\n        if ($http_x_api_key != "$salt-${K}") { return 401; }\n        secure_link_secret $base-Synth3ticSec9aB7cD2eF5;`,
    `        proxy_set_header X-API-Key "${R}";\n        proxy_set_header Cookie "${R}";\n        set $api_token "${R}";\n        if ($http_x_api_key != "${R}") { return 401; }\n        secure_link_secret ${R};`],
  ['htpasswd hashes, any indent, tail kept', 'operator:$apr1$Synth3ti$Synth3ticSynth3ticSyn9.\n    reader:{SHA}U3ludGgzdGljU3ludGgzdGljOTk=:a comment\n  alice: $2y$05$Synth3ticSynth3ticSynth.Synth3ticSynth3ticSynth3ticSy9', `operator:${R}\n    reader:${R}:a comment\n  alice: ${R}`],
  ['an htpasswd hash after a KEY on the same line (sec-ops review S1)', 'auth: admin:$apr1$Synth3ti$Synth3ticSynth3ticSyn9.\n  htpasswd: "admin:$2y$05$Synth3ticSynth3ticSynth.Synth3ticSynth3ticSynth3ticSy9"\n- users: \'ops:{SHA}U3ludGgzdGljU3ludGgzdGljOTk=\'', `auth: admin:${R}\n  htpasswd: "admin:${R}"\n- users: 'ops:${R}'`],
  ['S2 boundary: a literal still goes, and a URL WITH userinfo is not exempt (it goes whole — the set rule runs before the URL rule)', `        set $upstream_${AU} "${S}";\n        set $forward_${AU} http://ops:${P}@${AU}elia:9091/api/verify;`, `        set $upstream_${AU} "${R}";\n        set $forward_${AU} ${R};`],
  ['collector htpasswd inline block (C19) — plaintext only inside the block', `extensions:\n  basicauth/server:\n    htpasswd:\n      inline: |\n        operator:${P}\n        reader:$apr1$Synth3ti$Synth3ticSynth3ticSyn9.\n\n        third:two words ${P}  \n  health_check:\n    endpoint: host:${P}`,
    `extensions:\n  basicauth/server:\n    htpasswd:\n      inline: |\n        operator:${R}\n        reader:${R}\n\n        third:${R}  \n  health_check:\n    endpoint: host:${P}`],
  ['collector htpasswd inline, one-line form', `    htpasswd:\n      inline: operator:${P}`, `    htpasswd:\n      inline: operator:${R}`],
  ['flow map (C18): the value goes, the rest of the line stays', `    headers: { api-key: ${K}, x-scope-orgid: tenant-a }`, `    headers: { api-key: ${R}, x-scope-orgid: tenant-a }`],
  ['flow map (E35), two credentials, quoted and scheme forms', `    client_auth: { username: c, password: ${P} }\n    headers: {"X-Token": "${S}", authorization: "Bearer ${S}", 'api-key': '${K}'}`, `    client_auth: { username: c, password: ${R} }\n    headers: {"X-Token": "${R}", authorization: "Bearer ${R}", 'api-key': '${R}'}`],
  ['generic x- header (C20) and the two key names (E05, E08)', `      X-Token: ${S}\n      X-Amz-Security-Token: "${S}"\n    instrumentation_key: ${S}\n    account_token: ${S}`, `      X-Token: ${R}\n      X-Amz-Security-Token: ${R}\n    instrumentation_key: ${R}\n    account_token: ${R}`],
  ['collector header with the ApiKey scheme (E01)', `    headers:\n      Authorization: "ApiKey ${S}"`, `    headers:\n      Authorization: "ApiKey ${R}"`],
];
for (const [name, input, want] of EXACT) {
  const got = plain(input).redacted;
  check(`exact — ${name}`, got === want, `got:  ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`);
  check(`exact — ${name}: lines hold`, linesHold(input, got));
}

// ── 6. arm 2 — every new LINE rule on a truncated serialized leaf (taken), and the three block scans (named residual: kept) ───
const leaf = (line: string): string => '{"c":"' + 'x'.repeat(60) + '\\n' + JSON.stringify(line).slice(1, -1) + '\\nnext: 1';
const arm2 = (line: string): string => (redactSecretsDeep({ k: leaf(line) }).value as { k: string }).k;
const ARM2_TAKEN: Array<[string, string, string]> = [
  ['nginx header, bare', `  proxy_set_header Authorization ${S};`, S],
  ['nginx header, quoted', `  proxy_set_header X-API-Key "${K}";`, K],
  ['nginx header + scheme, grpc', `  grpc_set_header authorization "ApiKey ${S}";`, S],
  ['nginx set', `  set $api_token "${S}";`, S],
  ['nginx secure_link_secret', '  secure_link_secret Synth3ticSec9aB7cD2eF5;', 'Synth3ticSec9aB7cD2eF5'],
  ['nginx if', `  if ($http_x_api_key != "${K}") { return 401; }`, K],
  ['htpasswd hash', 'operator:$apr1$Synth3ti$Synth3ticSynth3ticSyn9.', '$apr1$Synth3ti$Synth3ticSynth3ticSyn9.'],
  ['generic x- header', `      X-Token: ${S}`, S],
  ['instrumentation_key', `    instrumentation_key: ${S}`, S],
  ['account_token', `    account_token: ${S}`, S],
];
for (const [name, line, secret] of ARM2_TAKEN) {
  const out = arm2(line);
  check(`arm 2 — ${name}: redacted in a truncated serialized leaf, the encoded newlines kept`, !out.includes(secret) && out.includes('\\nnext: 1') && out.startsWith('{"c":"' + 'x'.repeat(60) + '\\n') && out.includes(PLACEHOLDER), out);
}
const ARM2_RESIDUAL: Array<[string, string, string]> = [
  ['flow map', `    headers: { api-key: ${K}, x-scope-orgid: tenant-a }`, K],
  ['htpasswd inline plaintext', `    htpasswd:\n      inline: |\n        operator:${P}`, P],
  ['nginx map entry', `map $http_authorization $ok {\n    "Bearer ${S}" 1;\n}`, S],
];
for (const [name, line, secret] of ARM2_RESIDUAL) {
  check(`arm 2 — ${name}: NAMED RESIDUAL, kept in a truncated serialized leaf (the block scans are plain-arm only, like every block rule)`, arm2(line).includes(secret));
}
check('arm 2 — a mid-line-anchored rule derives its encoded-newline arm (the source rewrite applies)',
  R10_RULE_SOURCES.some((s) => s.startsWith('line:/((?:^|[{;])')) && !redactSerializedLeaf('x'.repeat(60) + `\\n  secure_link_secret Synth3ticSec9aB7cD2eF5;\\n`).redacted.includes('Synth3ticSec9aB7cD2eF5'));

// the structured arm: a parsed `headers` object with a generic x- key is judged through rule 23 (the vocabulary gained auth|credential)
{
  const r = redactSecretsDeep({ headers: { 'X-Token': S, 'X-Upstream-Auth': K, 'X-Token-Type': 'bearer', 'X-Scope-OrgID': 'tenant-a', author: 'a.b9' } });
  const h = (r.value as { headers: Record<string, string> }).headers;
  check('structured arm: a generic credential header FIELD is redacted; the non-credential fields beside it are not', h['X-Token'] === PLACEHOLDER && h['X-Upstream-Auth'] === PLACEHOLDER && h['X-Token-Type'] === 'bearer' && h['X-Scope-OrgID'] === 'tenant-a' && h.author === 'a.b9' && r.redactedCount === 2, JSON.stringify(h));
}

// ── 7. persist: a value keyed by a new rule is echo-redacted where it reappears bare ─────────────────────────────────────────
{
  const p = persist(`        proxy_set_header X-API-Key ${K};\n        set $api_token "${S}";`, [K, S]);
  check('persist echo: a header value and a set value restated bare are gone from report.md and finalResponse', !p.report.includes(K) && !p.report.includes(S) && !p.finalResponse.includes(K) && !p.finalResponse.includes(S) && p.echo >= 4, `echo ${p.echo}`);
  const c = canonicalBase(`proxy_set_header X-API-Key ${K};\n# rotate ${K} quarterly\n`, { redact: true });
  check('canonicalBase: a held file that restates a v13-keyed value bare is REFUSED echo-secret-residual (never held less redacted than result.json)', !c.ok && (c as { refusal: string }).refusal === 'echo-secret-residual');
}

// S3 (sec-ops review): a cookie's VALUE restated bare is echo-redacted (the echo literal used to be only `session=<v>`)
{
  const V = 'Synth3ticSess9aB7cD2eF5gH8';
  const p = persist(`        proxy_set_header Cookie "theme=dark; session=${V}";`, [V]);
  check('persist echo (S3): the cookie VALUE restated bare is gone from report.md and finalResponse; `dark` is not an echo literal', !p.report.includes(V) && !p.finalResponse.includes(V) && p.echo >= 2 && echoCovers(`proxy_set_header Cookie "theme=dark; session=${V}";`, V) && !echoCovers(`proxy_set_header Cookie "theme=dark; session=${V}";`, 'dark'), `echo ${p.echo}`);
}

// ── 8. the credential-shaped line test: corpus checks over this fixture, and the GENERATED pin over R10's closed name lists ─────────────────────────────────────────────────
check('CREDENTIAL_LINE_VERSION is its own version, not R10\'s', CREDENTIAL_LINE_VERSION === 'paichart.credline/2' && CREDENTIAL_LINE_SOURCES.length >= 5 && !R10_RULE_SOURCES.some((s) => CREDENTIAL_LINE_SOURCES.includes(s)));
{
  const texts: Array<[string, string, string[]]> = [
    ...fx.shapes.map((s) => [s.id, asm(s.text), s.secrets] as [string, string, string[]]),
    ...fx.extraProbes.map((e) => [e.id, asm(e.text), [e.mustGo]] as [string, string, string[]]),
    ...EXACT.map(([n, i]) => [n, i, []] as [string, string, string[]]),
  ];
  const missChanged: string[] = []; const missSecret: string[] = [];
  for (const [id, t, secrets] of texts) {
    const a = t.split('\n'); const b = plain(t).redacted.split('\n');
    a.forEach((l, i) => {
      if (l !== b[i] && !isCredentialShapedLine(l)) missChanged.push(`${id}:${i + 1}`);
      if (secrets.some((x) => l.includes(x)) && !isCredentialShapedLine(l)) missSecret.push(`${id}:${i + 1}`);
    });
  }
  check('corpus check (a): every line R10 changes in the v13 fixture and the exact cases is credential-shaped', missChanged.length === 0, missChanged.join(' '));
  check('corpus check (b): every line carrying a fixture secret is credential-shaped, whether or not R10 takes it', missSecret.length === 0, missSecret.join(' '));
  const ordinary = ['exporters:', '  otlphttp:', '    compression: gzip', 'server {', '    listen 4318;', '        proxy_pass http://otel-collector:4318;', '    timeout: 10s', '', '}'];
  // credline/2 (sec-ops J3 / J5 / J6; coordinator ruling on `pass`, 2026-11-22) — every line has a STATED answer
  const v2: Array<[string, boolean, string]> = [
    ['        proxy_pass http://otel-collector:4318;', false, 'the routing directive at the start of its statement is ordinary'],
    ['fastcgi_pass unix:/run/php.sock;', false, 'another of the six'],
    ['grpc_pass grpc://otel-collector:4317;', false, 'another of the six'],
    ['        proxy_pass http://user:hunter2@host;', true, 'still flagged: a URL with userinfo'],
    ['        proxy_pass https://host/hook?api_key=abc;', true, 'still flagged: a credential name in the query'],
    ['        proxy_pass http://bypass-upstream:4318;', true, 'the exemption covers the ONE leading word; `pass` later in the line flags it'],
    ['    location / { proxy_pass http://otel-collector:4318; }', true, 'not at the start of the statement: no exemption (over-withheld, stated)'],
    ['    set $x proxy_pass_upstream;', true, 'the word inside a value earns nothing'],
    ['    proxy_pass_header X-Trace;', true, 'a longer directive is not one of the six'],
    ['    proxy_pass_request_headers off;', true, 'a longer directive is not one of the six'],
    ['    smtp_pass hunter2;', true, 'a credential name'], ['    db_pass: hunter2', true, 'a credential name'], ['pass: hunter2', true, 'a credential name'],
    ['PGPASS=hunter2', true, 'a credential name, any case'], ['    compass_url example;', true, 'a substring test: over-withheld, stated'],
    ['    db_pwd hunter2;', true, 'J3 pwd'], ['    creds hunter2;', true, 'J3 cred'], ['    apikey hunter2;', true, 'J3 key'], ['    signing hunter2;', true, 'J3 sign'],
    ['    hmac hunter2;', true, 'J3 hmac'], ['    license hunter2;', true, 'J3 licen'],
    ['users: ops:hunter2', true, 'J5 a bare pair after one key'], ['    endpoint: otel:4317', true, 'J5: a host:port after a key is withheld too (stated)'],
    ['    endpoint: otel', false, 'J5: a plain value after a key is ordinary'], ['    endpoint: http://otel:4317', false, 'J5: a URL after a key is ordinary (the `//` exclusion applies to the FIRST colon only — stated)'],
    ['    content_by_lua_block {', true, 'J6 Lua'], ['    js_set $t main.token;', true, 'J6 njs'], ['    evaluation_interval: 15s', true, 'J6: `lua` inside a word is over-withheld (stated)'],
  ];
  for (const [l, want, why] of v2) check(`credline/2 — ${JSON.stringify(l.trim())} is ${want ? 'credential-shaped' : 'ordinary'} (${why})`, isCredentialShapedLine(l) === want);
  check('the test is not "every line": ordinary structure lines are not credential-shaped', ordinary.every((l) => !isCredentialShapedLine(l)), ordinary.filter(isCredentialShapedLine).join(' | '));
}

// THE GENERATED PIN (architectural review F1): one line per NAME of R10's closed lists, expanded from the lists' own regex sources,
// so a name added to a rule later without a matching entry in the line test turns this red. Each generated name is first checked to
// MATCH its list (the expander is honest), and for rule 23 / the nginx rules that R10 really takes the line (the name is live).
{
  /** Expand a small regex subset (literals, escapes, classes, non-capturing groups, `?` `+` `{m,n}`) into sample strings: every
   *  alternative of every group; an optional or `{0,n}` part both absent and once; a class as its first member. */
  const expand = (src: string): string[] => {
    let i = 0;
    const cls = (): string => { let j = i + 1; let first = ''; while (src[j] !== ']') { if (src[j] === '\\') j += 1; if (!first && src[j] !== '^') first = src[j]; j += 1; } i = j + 1; return first; };
    const quant = (opts: string[]): string[] => {
      if (src[i] === '?') { i += 1; return ['', ...opts]; }
      if (src[i] === '+') { i += 1; return opts; }
      if (src[i] === '*') { i += 1; return ['', ...opts]; }
      if (src[i] === '{') { const m = /^\{(\d+)(?:,(\d*))?\}/.exec(src.slice(i)); if (m) { i += m[0].length; return m[1] === '0' ? ['', ...opts] : opts; } }
      return opts;
    };
    const cross = (a: string[], b: string[]): string[] => a.flatMap((x) => b.map((y) => x + y));
    const alt = (): string[] => {
      const out: string[] = []; let seq: string[] = [''];
      for (;;) {
        const c = src[i];
        if (c === undefined || c === ')') { out.push(...seq); return out; }
        if (c === '|') { i += 1; out.push(...seq); seq = ['']; continue; }
        let atom: string[];
        if (c === '(') { i += src.startsWith('(?:', i) ? 3 : 1; atom = alt(); i += 1; }
        else if (c === '[') atom = [cls()];
        else if (c === '\\') { atom = [src[i + 1] === 'w' ? 'a' : src[i + 1] === 'd' ? '1' : src[i + 1]]; i += 2; }
        else { atom = [c]; i += 1; }
        seq = cross(seq, quant(atom));
      }
    };
    return [...new Set(alt())].filter((x) => x.length > 0);
  };
  const lists: Array<[string, string, (name: string) => string, boolean]> = [
    ['rule 23 key name', R10_CLOSED_LIST_SOURCES.rule23KeyNames, (n) => `    ${n}: abcd1234x`, true],
    ['nginx credential variable', R10_CLOSED_LIST_SOURCES.ngxCredentialVariable, (n) => `        set $${n} "abcd1234x";`, true],
    ['nginx credential variable in an if', R10_CLOSED_LIST_SOURCES.ngxCredentialVariable, (n) => `        if ($${n} = "abcd1234x") { return 403; }`, true],
    ['nginx credential variable opening a map', R10_CLOSED_LIST_SOURCES.ngxCredentialVariable, (n) => `map $${n} $ok {`, false],
    ['nginx credential header', R10_CLOSED_LIST_SOURCES.ngxCredentialHeader, (n) => `        proxy_set_header ${n} abcd1234x;`, true],
    ['flow-map key', R10_CLOSED_LIST_SOURCES.rule23KeyNames, (n) => `    headers: { ${n}: abcd1234x, x-scope-orgid: tenant-a }`, true],
  ];
  let generated = 0;
  for (const [what, src, line, r10Takes] of lists) {
    const names = expand(src); const whole = new RegExp(`^(?:${src})$`, 'i');
    const notInList = names.filter((n) => !whole.test(n));
    const notFlagged = names.filter((n) => !isCredentialShapedLine(line(n)));
    const notTaken = r10Takes ? names.filter((n) => plain(line(n)).redactedCount === 0) : [];
    generated += names.length;
    check(`generated pin — ${what}: the expander produced names of the list itself (${names.length})`, names.length >= 9 && notInList.length === 0, notInList.slice(0, 8).join(' '));
    check(`generated pin — ${what}: EVERY name of the closed list flags its line`, notFlagged.length === 0, notFlagged.slice(0, 12).join(' '));
    if (r10Takes) check(`generated pin — ${what}: R10 takes every generated line (the names are live)`, notTaken.length === 0, notTaken.slice(0, 12).join(' '));
  }
  for (const ctx of ['    htpasswd:', '      inline: |', '      inline: operator:abcd1234x', '    headers:', '    authorization:', 'tacacs server T1', 'radius server R1', 'mac security', 'snmp {', '-----BEGIN RSA PRIVATE KEY-----'])
    check(`generated pin — block context line ${JSON.stringify(ctx.trim())} is flagged (the caller then withholds the block: the contract)`, isCredentialShapedLine(ctx) || ctx.trim() === 'mac security' || ctx.trim() === '    headers:'.trim());
  check('generated pin — the entry lines of a block are NOT judged by this function (the contract): a bare map entry is not flagged, the map line is', !isCredentialShapedLine('    abcd1234efgh 1;') && isCredentialShapedLine('map $http_authorization $ok {'));
  check(`generated pin — ${generated} lines generated from the closed lists`, generated >= 300);
}

// ── 9. timing — each new rule on 1 MB of its own shape (SHAPES condition 7), plain arm and arm 2 ────────────────────────────
if (process.env.R10V13_SKIP_TIMING === '1') {
  console.log('⏭️  timing cases SKIPPED (R10V13_SKIP_TIMING=1) — not a gate run');
} else {
  const MB = 1024 * 1024; const BAR = 1500;
  const fill = (unit: string): string => unit.repeat(Math.ceil(MB / unit.length)).slice(0, MB);
  const U = '\u2028';
  const CASES: Array<[string, string]> = [
    ['nginx header: the directive repeated, no terminator', fill('proxy_set_header Authorization ')],
    ['nginx header: directive + scheme repeated', fill('proxy_set_header Authorization "Bearer ')],
    ['nginx header: `;` + directive prefix repeated', fill(';proxy_set_header X-')],
    ['nginx header: one directive, 1 MB of `$`', 'proxy_set_header Cookie ' + '$'.repeat(MB)],
    ['nginx header: one directive, 1 MB of `$a`', 'proxy_set_header X-Auth-Token ' + fill('$a')],
    ['nginx header: one directive, an unclosed quote of 1 MB', 'proxy_set_header X-API-Key "' + 'a'.repeat(MB)],
    ['nginx header: 1 MB of `{`', '{'.repeat(MB)],
    ['nginx header: 1 MB of `;`', ';'.repeat(MB)],
    ['nginx header: a directive on every U+2028 "line"', fill('proxy_set_header Authorization x' + U)],
    ['nginx set: the prefix repeated, quote never closed', fill('set $api_token "')],
    ['nginx set: long variable-name segments', 'set $' + fill('abc_') + ' x'],
    ['nginx set: U+2028 after every prefix', fill('set $api_token "a' + U)],
    ['nginx secure_link_secret repeated', fill('secure_link_secret ')],
    ['nginx if: the prefix repeated', fill('if ($http_authorization != "')],
    ['nginx if: U+2028 after every prefix', fill('if ($http_x_api_key != "Bearer ' + U)],
    ['htpasswd hash: `name:$apr1$` repeated', fill('operator:$apr1$')],
    ['htpasswd hash: `a:` repeated on one line', fill('a:')],
    ['htpasswd hash: 1 MB with no colon', 'a'.repeat(MB)],
    ['htpasswd hash: `{SHA}` repeated', fill('x:{SHA}')],
    ['htpasswd hash: a pair on every U+2028 "line"', fill('a:$2y$05$' + U)],
    ['rule 23 generic header: `x-a-` repeated', fill('x-a-')],
    ['rule 23 generic header: `x-token-` on every line', fill('x-token-\n')],
    ['flow map: 100,000 commas', '    headers: { ' + ','.repeat(100_000) + ' }'],
    ['flow map: 1 MB of commas', '    headers: { ' + ','.repeat(MB) + ' }'],
    ['flow map: `, password: ` repeated', '    auth: { ' + fill(', password: ')],
    ['flow map: 1 MB of `{`', '    headers: ' + '{'.repeat(MB)],
    ['flow map: 1 MB of quotes after a key', '    headers: { api-key: ' + '"'.repeat(MB)],
    ['flow map: a long alphanumeric run after `{`', '    headers: { ' + 'a'.repeat(MB)],
    ['flow map: a head on every U+2028 "line"', fill('h: { api-key: ' + U)],
    ['htpasswd inline: one 1 MB entry of spaces', 'htpasswd:\n  inline: |\n    a:' + ' '.repeat(MB)],
    ['htpasswd inline: 100,000 entries', 'htpasswd:\n  inline: |\n' + '    a:b\n'.repeat(100_000)],
    ['nginx map: 100,000 quoted entries never closed', 'map $http_authorization $ok {\n' + '"aaaaaaaa\n'.repeat(100_000)],
    ['nginx map: one 1 MB entry', 'map $http_authorization $ok {\n"' + 'a1'.repeat(MB / 2)],
  ];
  for (const [name, input] of CASES) {
    let t0 = Date.now(); const r = redactArtifactSecrets(input); const ms = Date.now() - t0;
    check(`timing plain — ${name} (${input.length} chars) under ${BAR} ms (got ${ms} ms)`, ms < BAR);
    check(`timing plain — ${name}: line count unchanged`, r.redacted.split('\n').length === input.split('\n').length);
    const enc = input.split('\n').join('\\n');
    t0 = Date.now(); redactSerializedLeaf(enc); const ms2 = Date.now() - t0;
    check(`timing arm 2 — ${name} (${enc.length} chars) under ${BAR} ms (got ${ms2} ms)`, ms2 < BAR);
  }
  // R10-LINE-SEPARATOR-QUADRATIC — the six fixed rules × bare CR / U+2028 / U+2029 at 1 MB, each rule's own regex (plain source and
  // derived arm-2 source), then the whole redactor; in a child killed at 60 s (v12 took about 100 s on ONE of these inputs).
  {
    const CAP = 60_000;
    const c = runChild('separators', CAP);
    check('the separator pins hold a real CR, U+2028 and U+2029 (code points 13, 8232, 8233), written as escapes', SEPARATORS_ARE_REAL);
    check(`separator child finished before its ${CAP / 1000} s cap (a kill here = a rule is scanning across a line separator again)`, !c.killed);
    const expected = [...SEPARATOR_RULES.flatMap(([rule]) => LINE_SEPARATORS.map(([sepName]) => `${rule} × ${sepName}`)),
      ...[...LINE_SEPARATORS.map(([n]) => n), 'an encoded newline'].map((n) => `whole redactor × ${n}`)];
    for (const name of expected) {
      const l = c.lines.find((x) => x.name === name);
      if (!l) { check(`timing separators — ${name}: finished before the cap`, false, 'no result: the child was killed first'); continue; }
      if (l.kind === 'rule') check(`timing separators — ${name}: the rule's source was found once in each arm`, l.found === true);
      check(`timing separators — ${name} (1 MB) plain under ${BAR} ms (got ${l.plain} ms)`, typeof l.plain === 'number' && l.plain >= 0 && l.plain < BAR);
      check(`timing separators — ${name} (1 MB) arm 2 under ${BAR} ms (got ${l.arm2} ms)`, typeof l.arm2 === 'number' && l.arm2 >= 0 && l.arm2 < BAR);
      if (l.kind === 'whole') check(`timing separators — ${name} (1 MB) deep walk under ${2 * BAR} ms (got ${l.deep} ms)`, typeof l.deep === 'number' && l.deep < 2 * BAR);
    }
    const SWEEP_CAP = 300_000;
    const sw = runChild('sweep', SWEEP_CAP);
    const res = sw.lines.find((x) => x.kind === 'sweep') as { rules: number; inputs: number; flagged: string[] } | undefined;
    check(`sweep child finished before its ${SWEEP_CAP / 1000} s cap`, !sw.killed && !!res);
    check(`sweep — every rule source swept (${res?.rules ?? 0} sources, ${res?.inputs ?? 0} inputs of ${SWEEP_SIZE} chars): none over ${SWEEP_BAR} ms on its own words × CR / U+2028 / U+2029`,
      !!res && res.rules >= 90 && res.flagged.length === 0, (res?.flagged ?? []).join('\n   '));
  }
  const LINE_CASES: Array<[string, string]> = [['1 MB of `://`', fill('://')], ['1 MB of `a`', 'a'.repeat(MB)], ['1 MB of `$`', '$'.repeat(MB)], ['1 MB of `a:`', fill('a:')], ['1 MB with U+2028', fill('a ' + U)]];
  for (const [name, input] of LINE_CASES) {
    const t0 = Date.now(); isCredentialShapedLine(input); const ms = Date.now() - t0;
    check(`timing isCredentialShapedLine — ${name} under 250 ms (got ${ms} ms)`, ms < 250);
  }
}

if (process.env.R10V13_TABLE) { console.log('\nshape | plain | deep | persist | canonicalBase'); for (const row of table) console.log(row); console.log(`probes taken: ${probeTaken.join(' ')}\nprobes left: ${probeLeft.join(' ')}`); }
console.log(`\n${failed === 0 ? '✅' : '❌'} R10 v13 shapes: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
