/**
 * WI-B10 (2026-10-23) — the ONE held-file declaration grammar + validator (lib/mcp/server/config/held-file-declaration.js)
 * and the mid-path star it adds to the extractor. Pure: no DB, no network.
 * Design: cline_docs/reviews/held-network-2026-10-22/WI-B10-DESIGN.md §9.1 D/F/H/I, §10.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const decl = require('../lib/mcp/server/config/held-file-declaration.js');
import { extractDeclaredFiles } from '../lib/agents/harness/held-bytes/extract';
import type { Descriptor } from '../lib/agents/harness/held-bytes/descriptors';

let passed = 0; let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✅ ${name}`); } catch (e) { failed++; console.log(`  ❌ ${name}: ${(e as Error).message}`); }
}
function eq(a: unknown, b: unknown, msg = '') {
  const A = JSON.stringify(a); const B = JSON.stringify(b);
  if (A !== B) throw new Error(`${msg} expected ${B}, got ${A}`);
}

const CTX = {
  serviceName: 'acme-devices',
  capabilityToolNames: ['fetch_data', 'list_devices', 'show_commands', 'get_file_contents'],
  platformServiceNames: ['observability-readonly', 'github-service'],
  platformPins: [{ owner: 'paichart', repo: 'paichart-lab-configs' }],
  platformTargets: ['obs-ingress', 'obs-otelcol', 'github:paichart:paichart-lab-configs'],
};
const NET = { tool: 'fetch_data', select: 'structuredContent.hosts.*.output.config.running', target: { template: '{key}' }, path: { const: '/running-config' } };
const GIT = { tool: 'get_file_contents', select: 'content[type=resource].resource.text', path: { uri: 'path' }, gitPin: { owner: 'acme', repo: 'net-configs' } };

console.log('\n── grammar ──');
test('parse: key, bracket, trailing star, mid star', () => {
  eq(decl.parseSelector('structuredContent.yaml').ok, true);
  eq(decl.parseSelector('content[type=resource].resource.text').ok, true);
  eq(decl.parseSelector('structuredContent.files.*').hasStar, true);
  eq(decl.parseSelector('structuredContent.hosts.*.output.config.running').hasStar, true);
});
test('parse: refusals', () => {
  eq(decl.parseSelector('a.*.b.*').reason, 'selector-multiple-stars');
  eq(decl.parseSelector('content[type=resource].*').reason, 'selector-star-with-bracket');
  eq(decl.parseSelector('*').reason, 'selector-bare-star');
  eq(decl.parseSelector('a..b').reason, 'selector-empty-segment');
  eq(decl.parseSelector('a.b c', { strict: true }).reason, 'selector-bad-key');
  eq(decl.parseSelector('x'.repeat(2049)).reason, 'selector-too-long');
});
test('pathProblem is the moved function (same verdicts)', () => {
  eq(decl.pathProblem('/etc/x'), null);
  eq(decl.pathProblem('etc/x'), 'not-absolute');
  eq(decl.pathProblem('/a/../b'), 'dot-dot-segment');
  eq(decl.pathProblem('/a b'), 'line-separator');
  eq(decl.pathProblem('/a‮b'), 'bidi-control');
});

console.log('\n── validateHeldFiles ──');
test('a network device declaration validates; the sha is canonical (key order does not matter)', () => {
  const r = decl.validateHeldFiles({ files: [NET], notAFile: ['show_commands', 'list_devices'] }, CTX);
  eq(r.ok, true);
  const r2 = decl.validateHeldFiles({ notAFile: ['list_devices', 'show_commands'], files: [{ path: NET.path, target: NET.target, select: NET.select, tool: NET.tool }] }, CTX);
  eq(r2.sha256, r.sha256);
  eq(r.declaration.notAFile, ['list_devices', 'show_commands']);
});
test('a bare array (human shape) validates', () => { eq(decl.validateHeldFiles([NET], CTX).ok, true); });
test('a customer GitHub entry: target DERIVED from its own gitPin', () => {
  const r = decl.validateHeldFiles([GIT], CTX);
  eq(r.ok, true); eq(r.declaration.files[0].target, { const: 'github:acme:net-configs' });
});
const refuse = (name: string, input: unknown, reason: string, ctx: object = CTX) =>
  test(`refused: ${reason} (${name})`, () => { const r = decl.validateHeldFiles(input, ctx); eq(r.ok, false); eq(r.reason, reason); });
refuse('platform service name', [NET], 'platform-service-name', { ...CTX, serviceName: 'observability-readonly' });
refuse('tool outside the row capabilities (guard 2)', [{ ...NET, tool: 'other_tool' }], 'tool-not-in-capabilities');
refuse('platform pin (WB-1: never the platform Git source)', [{ ...GIT, gitPin: { owner: 'PaiChart', repo: 'paichart-lab-configs' } }], 'git-pin-is-platform');
refuse('github const target without a pin', [{ ...NET, target: { const: 'github:acme:x' } }], 'target-github-needs-git-pin');
refuse('platform target', [{ ...NET, target: { const: 'obs-otelcol' } }], 'target-is-platform');
// sec-ops build SF-2: argument targets are agent-controlled; a github: template literal; a platform target even with no ctx list.
refuse('target taken from a call argument', [{ ...NET, target: { argument: 'target' } }], 'target-from-argument');
refuse('template with a literal github: prefix', [{ ...NET, target: { template: 'github:paichart:{key}' } }], 'target-github-needs-git-pin');
refuse('platform target with an EMPTY ctx list (the one shared list)', [{ ...NET, target: { const: 'OBS-INGRESS' } }], 'target-is-platform', { ...CTX, platformTargets: [] });
refuse('explicit target beside a gitPin', [{ ...GIT, target: { const: 'x' } }], 'target-derived-from-git-pin');
refuse('gitPin path must be the served uri', [{ ...GIT, path: { const: '/x' } }], 'git-pin-path-must-be-uri');
refuse('template variable other than {key}', [{ ...NET, target: { template: '{device}' } }], 'target-template-variable');
refuse('template without a star', [{ ...NET, select: 'structuredContent.x', target: { template: '{key}' } }], 'target-template-needs-star');
refuse('unsafe const path', [{ ...NET, path: { const: '/a/../b' } }], 'path-unsafe');
refuse('unknown entry key', [{ ...NET, extra: 1 }], 'entry-unknown-key');
refuse('unknown top-level key', { files: [NET], extra: [] }, 'unknown-key');
refuse('duplicate (tool, select)', [NET, NET], 'duplicate-entry');
refuse('a tool both declared and notAFile', { files: [NET], notAFile: ['fetch_data'] }, 'tool-also-not-a-file');
refuse('empty', [], 'files-empty');
refuse('too many entries', Array.from({ length: 65 }, (_, i) => ({ ...NET, select: `structuredContent.h${i}.*.x` })), 'too-many-entries');
test('never throws on hostile input', () => {
  for (const x of [null, 1, 'x', { __proto__: { files: [NET] } }, [null], [{ tool: 1 }]]) {
    const r = decl.validateHeldFiles(x as unknown, CTX); eq(r.ok, false);
  }
});
test('revalidateStoredGrammar: grammar only', () => {
  eq(decl.revalidateStoredGrammar({ files: [NET], notAFile: [] }).ok, true);
  eq(decl.revalidateStoredGrammar({ files: [{ tool: 'x', select: 'a.*.*' }] }).ok, false);
});

console.log('\n── extractor: mid-path star ──');
const table: Descriptor[] = [{ descriptorVersion: 1, service: 'acme-devices', tool: 'fetch_data', files: [NET as never] }];
const rec = (hosts: unknown) => ({
  tool: 'services', success: true, arguments: { action: 'call', targetService: 'acme-devices', tool: 'fetch_data' },
  result: { content: [{ type: 'data', data: { targetService: 'acme-devices', tool: 'fetch_data', success: true,
    metadata: { targetServiceId: 'svc1' }, arguments: { getters: ['config'] },
    result: { structuredContent: { hosts } } } }] },
});
test('one file per device, key bound to {key}; a device without config is skipped', () => {
  const r = extractDeclaredFiles([rec({
    ceos1: { output: { config: { running: 'hostname ceos1\n', startup: 's' } } },
    ceos2: { output: { config: { running: 'hostname ceos2\n' } } },
    ceos3: { output: { facts: {} } },
  })], table);
  eq(r.files.map((f) => [f.target, f.path, f.selector, f.text]), [
    ['ceos1', '/running-config', '/structuredContent/hosts/ceos1/output/config/running', 'hostname ceos1\n'],
    ['ceos2', '/running-config', '/structuredContent/hosts/ceos2/output/config/running', 'hostname ceos2\n'],
  ]);
  eq(r.refusals.length, 0);
});
test('no device carries config ⇒ descriptor-mismatch absent (a row)', () => {
  const r = extractDeclaredFiles([rec({ ceos1: { output: { facts: {} } } })], table);
  eq(r.files.length, 0); eq(r.refusals.map((x) => [x.refusal, x.detail]), [['descriptor-mismatch', { reason: 'absent' }]]);
});
test('a non-string running config is not-a-string, never coerced', () => {
  const r = extractDeclaredFiles([rec({ ceos1: { output: { config: { running: 5 } } } })], table);
  eq(r.refusals.map((x) => [x.refusal, x.detail]), [['descriptor-mismatch', { reason: 'not-a-string' }]]);
});
test('a digest-named DEVICE key is service data, not a digest (the star map is skipped)', () => {
  const r = extractDeclaredFiles([rec({ checksum: { output: { config: { running: 'x\n' } } } })], table);
  eq(r.files.length, 1);
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
