/**
 * Config sources STEP 3, slice P2 (plan §9.2 "Applier fixtures") — the SHIPPING applier (`computeEditApplication`) on a Git base for an
 * observability target: a shape no test had applied. OBS-GIT-1 … OBS-GIT-8 here; OBS-GIT-9 (rollback directives) lives in the
 * rollback-containment suite and OBS-GIT-10 (quoteFidelity's file lane on the Git target) in the quote-fidelity suite.
 *
 * On a DECLARED observability leg the Author is shown, as handles, exactly the files the block names and the platform holds:
 *   - a `git-file` label ⇒ the handle's path is the GIT path (`/observability/otelcol/config.yaml`), never the service path;
 *   - a `service-held` label ⇒ the handle's path is the service path (`/etc/nginx/conf.d/<key>`).
 * The served copy of a Git-based label (evidence) and an undeclared sibling are handle-less: there is nothing to name.
 * PURE: no DB, no agent text.
 *
 * Run: npm run test:held-edits   (second file of that script)
 */
import { computeEditApplication, type EditApplication, type HeldFileInput } from '../lib/agents/harness/held-bytes/apply';
import { SEARCH_MARKER, DIVIDER_MARKER, REPLACE_MARKER, CREATE_OPEN_MARKER, CREATE_CLOSE_MARKER, HELD_EDITS_HEADING } from '../lib/agents/harness/held-bytes/edits';
import { buildView } from '../lib/agents/harness/held-bytes/view';
import { R9_VERSION } from '../lib/agents/harness/sanitize-chained-output';

let passed = 0; let failed = 0;
function test(d: string, fn: () => void) { try { fn(); console.log(`✅ ${d}`); passed++; } catch (e) { console.error(`❌ ${d}\n   ${(e as Error).message}`); failed++; } }
function eq(a: unknown, b: unknown, what = '') { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c: unknown, what: string) { if (!c) throw new Error(what); }

const COLLECTOR = [
  'receivers:',
  '  otlp:',
  '    protocols:',
  '      grpc:',
  '        endpoint: 0.0.0.0:4317',
  'processors:',
  '  batch:',
  '    timeout: 5s',
  'exporters:',
  '  debug: {}',
  'service:',
  '  pipelines:',
  '    traces:',
  '      receivers: [otlp]',
  '      processors:',
  '        - batch',
  '      exporters: [debug]',
  '',
].join('\n');
// two same-named `server {` blocks whose bodies share the `deny all;` line
const NGINX = [
  'server {',
  '    listen 4318;',
  '    location / {',
  '        allow 10.0.0.0/8;',
  '        deny all;',
  '    }',
  '}',
  'server {',
  '    listen 8443;',
  '    location / {',
  '        allow 10.0.0.0/8;',
  '        deny all;',
  '    }',
  '}',
  '',
].join('\n');
const held = (handle: string, path: string, base: string): HeldFileInput => {
  const v = buildView(base, R9_VERSION);
  if (!v.ok) throw new Error('fixture view');
  return { handle, path, state: 'rendered', baseText: base, viewText: v.viewText, rewrittenLines: v.rewrittenLines, redactorVersion: 'paichart.r10/12' };
};
const GIT_OTEL = held('H1', '/observability/otelcol/config.yaml', COLLECTOR);            // a git-file label's base
const GIT_NGINX = held('H2', '/observability/nginx/operator-access.conf', NGINX);        // a second git-file label's base
const SVC_NGINX = held('H3', '/etc/nginx/conf.d/otlp-ingress.conf', NGINX);              // a service-held label's base
const FILES = [GIT_OTEL, GIT_NGINX, SVC_NGINX];
const edit = (h: string, search: string[], replace: string[]) => [`${SEARCH_MARKER} ${h}`, ...search, DIVIDER_MARKER, ...replace, REPLACE_MARKER].join('\n');
const pkg = (...edits: string[]) => ['# Package', '', `## ${HELD_EDITS_HEADING}`, '', ...edits.flatMap((e) => [e, '']), '## Validation', 'otelcol validate', ''].join('\n');
const apply = (fr: string, files: HeldFileInput[] = FILES) => computeEditApplication(fr, { files, r9Version: R9_VERSION });
const names = (a: EditApplication) => a.refusals.map((r) => r.name);
const candidate = (a: EditApplication, handle: string) => (a.files.find((f) => f.handle === handle) as unknown as { candidateText?: string } | undefined)?.candidateText ?? null;

test('OBS-GIT-1 collector YAML on a Git base: a list item inserted', () => {
  const a = apply(pkg(edit('H1', ['      processors:', '        - batch'], ['      processors:', '        - memory_limiter', '        - batch'])));
  eq([a.state, a.applied, names(a)], ['applied', 1, []]);
  eq(candidate(a, 'H1'), COLLECTOR.replace('        - batch', '        - memory_limiter\n        - batch'), 'the candidate is the base plus the one line: ');
});
test('OBS-GIT-2 one nested scalar changed', () => {
  const a = apply(pkg(edit('H1', ['      grpc:', '        endpoint: 0.0.0.0:4317'], ['      grpc:', '        endpoint: 127.0.0.1:4317'])));
  eq([a.state, a.applied, names(a)], ['applied', 1, []]);
  eq(candidate(a, 'H1'), COLLECTOR.replace('0.0.0.0:4317', '127.0.0.1:4317'));
});
test('OBS-GIT-3 nginx: an `allow` line inserted before `deny all;` in ONE of two same-named server blocks — a hunk matching both is refused by name', () => {
  const both = apply(pkg(edit('H2', ['        deny all;'], ['        allow 192.168.0.0/16;', '        deny all;'])));
  eq([both.state, names(both)], ['refused', ['search-not-unique']], 'the short hunk: ');
  const one = apply(pkg(edit('H2', ['    listen 8443;', '    location / {', '        allow 10.0.0.0/8;', '        deny all;'],
    ['    listen 8443;', '    location / {', '        allow 10.0.0.0/8;', '        allow 192.168.0.0/16;', '        deny all;'])));
  eq([one.state, one.applied, names(one)], ['applied', 1, []], 'anchored on the block\'s own listen line: ');
  const c = candidate(one, 'H2') ?? '';
  eq([c.split('allow 192.168.0.0/16;').length - 1, c.indexOf('allow 192.168.0.0/16;') > c.indexOf('listen 8443;')], [1, true], 'exactly one insert, in the second block: ');
});
test('OBS-GIT-4 the same edit written against the SERVICE path: there is no such handle on a declared leg ⇒ refused', () => {
  // the served copy of the collector config (`/etc/otelcol/config.yaml`) is evidence — handle-less; the Author can only invent a handle for it
  const a = apply(pkg(edit('H9', ['      grpc:', '        endpoint: 0.0.0.0:4317'], ['      grpc:', '        endpoint: 127.0.0.1:4317'])));
  eq([a.state, names(a), a.candidateFiles], ['refused', ['unknown-handle'], 0]);
  ok(!FILES.some((f) => f.path === '/etc/otelcol/config.yaml'), 'the fixture shows the served copy as a handle');
});
test('OBS-GIT-5 an edit to the undeclared sibling: it has no handle ⇒ refused; and it cannot be smuggled in beside a good edit', () => {
  const a = apply(pkg(edit('H1', ['    timeout: 5s'], ['    timeout: 10s']), edit('H4', ['    listen 4318;'], ['    listen 4319;'])));
  // `partial`: the good edit on H1 matched, the invented handle was refused BY NAME — and NO candidate is produced for any file
  eq([a.state, a.candidateFiles, names(a)], ['partial', 0, ['unknown-handle']]);
  // (`candidateFiles` 0 is the applier's count of files that go forward — none does)
});
test('OBS-GIT-6 a `create` at a held Git path ⇒ refused (either slash spelling), and at the service path of a held service file', () => {
  const create = (on: string, p: string) => pkg([`${CREATE_OPEN_MARKER} H9 on ${on} ${p}`, 'receivers: {}', CREATE_CLOSE_MARKER].join('\n'));
  for (const p of ['/observability/otelcol/config.yaml', 'observability/otelcol/config.yaml']) {
    const a = apply(create('H2', p));
    eq([a.state, names(a), a.candidateFiles], ['refused', ['overlapping-edits'], 0], `${p}: `);
  }
  eq(names(apply(create('H1', '/etc/nginx/conf.d/otlp-ingress.conf'))), ['overlapping-edits'], 'the service-held file\'s path: ');
});
test('OBS-GIT-7 the whole Git file rewritten in a fence ⇒ `held-file-written-whole`', () => {
  const a = apply(['# Package', '', '## Desired state', '', '```yaml', COLLECTOR.replace('0.0.0.0:4317', '127.0.0.1:4317'), '```', ''].join('\n'));
  eq([a.state, names(a)], ['refused', ['held-file-written-whole']]);
});
test('OBS-GIT-8 a `service-held` label edited by its own handle on the same leg, beside a Git-file edit', () => {
  const a = apply(pkg(edit('H1', ['    timeout: 5s'], ['    timeout: 10s']),
    edit('H3', ['    listen 4318;'], ['    listen 4319;'])));
  eq([a.state, a.applied, a.candidateFiles, names(a)], ['applied', 2, 2, []]);
  eq([candidate(a, 'H1'), candidate(a, 'H3')], [COLLECTOR.replace('timeout: 5s', 'timeout: 10s'), NGINX.replace('listen 4318;', 'listen 4319;')]);
  // the two nginx files have identical bytes: the edit by H3 never touches H2 (the Git-held one)
  ok(!a.files.some((f) => f.handle === 'H2' && (f as unknown as { candidateText?: string }).candidateText !== undefined && (f as unknown as { candidateText?: string }).candidateText !== NGINX), 'the Git-held nginx file moved');
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
