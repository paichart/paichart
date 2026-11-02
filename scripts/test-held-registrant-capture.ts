/**
 * WI-B10 (2026-10-23) — capture under registrant declarations, end to end over the pure pieces: the server-only eligibility
 * channel (held-eligibility.js), the ONE table (held-descriptor-table.ts), the extractor's registrant / eligibility rules
 * (extract.ts) and the persist elision for a declared Git source. Pure: no DB, no network.
 * Design: cline_docs/reviews/held-network-2026-10-22/WI-B10-DESIGN.md §9.1 E/G/I/J, §10 A-1/A-8/A-10/A-11d.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const he = require('../lib/mcp/server/config/held-eligibility.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const decl = require('../lib/mcp/server/config/held-file-declaration.js');
import { extractDeclaredFiles } from '../lib/agents/harness/held-bytes/extract';
import { tableFromDeclarations, stampedDeclarationPairs, buildHeldDescriptorTable } from '../lib/services/held-descriptor-table';
import { elideGitFileSourceStatus, GIT_STATUS_ELIDED_TEXT } from '../lib/agents/harness/held-bytes/git-status-elision';

let passed = 0; let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`); } catch (e) { failed++; console.log(`  ❌ ${name}: ${(e as Error).message}`); }
}
function eq(a: unknown, b: unknown, msg = '') { const A = JSON.stringify(a); const B = JSON.stringify(b); if (A !== B) throw new Error(`${msg} expected ${B}, got ${A}`); }

const NET = { tool: 'fetch_data', select: 'structuredContent.hosts.*.output.config.running', target: { template: '{key}' }, path: { const: '/running-config' } };
const V = decl.validateHeldFiles({ files: [NET], notAFile: ['list_devices'] }, { serviceName: 'acme-devices', capabilityToolNames: ['fetch_data', 'list_devices', 'show_commands'], platformServiceNames: [], platformPins: [], platformTargets: [] });
const SHA: string = V.sha256;
const SNAP = [{ sha256: SHA, heldFiles: V.declaration }];
const SID = 'svc-acme-1';

function call(tool: string, result: unknown, opts: { serviceName?: string; serviceId?: string; success?: boolean } = {}) {
  const name = opts.serviceName ?? 'acme-devices';
  return {
    tool: 'services', success: opts.success ?? true, arguments: { action: 'call', targetService: name, tool },
    result: { content: [{ type: 'data', data: { targetService: name, tool, success: true, metadata: { targetServiceId: opts.serviceId ?? SID }, arguments: {}, result } }] },
  };
}
const netResult = { structuredContent: { hosts: { ceos1: { output: { config: { running: 'hostname ceos1\n' } } } } } };
const stamp = (rec: object, fact: object) => { he.setOnRecord(rec, fact); return rec; };
const ownFact = { serviceId: SID, eligibility: 'own', heldFilesSha256: SHA, gitSource: false };

(async () => {
  console.log('\n── eligibility channel (server-only) ──');
  await test('eligibilityOf: no ownerId ⇒ platform; owner ⇒ own; other ⇒ foreign', () => {
    eq([he.eligibilityOf({ configuration: {} }, 'u1'), he.eligibilityOf({ configuration: { ownerId: 'u1' } }, 'u1'), he.eligibilityOf({ configuration: { ownerId: 'u2' } }, 'u1')], ['platform', 'own', 'foreign']);
  });
  await test('the fact rides context → result → record and is NEVER serialised', () => {
    const ctx = {}; he.recordForContext(ctx, he.factFor({ id: SID, configuration: { ownerId: 'u1' }, heldFilesSha256: SHA }, 'u1'));
    const result = { content: [] }; he.attachToResult(result, he.takeForContext(ctx));
    const rec = { tool: 'services' }; he.setOnRecord(rec, he.ofResult(result));
    eq(he.fromRecord(rec).eligibility, 'own'); eq(JSON.stringify(rec), '{"tool":"services"}'); eq(JSON.stringify(result), '{"content":[]}');
    eq(he.takeForContext(ctx), null, 'taken once');
  });
  await test('a malformed fact is never attached', () => { const r = {}; he.setOnRecord(r, { serviceId: SID, eligibility: 'admin', heldFilesSha256: null }); eq(he.fromRecord(r), null); });

  console.log('\n── the ONE table ──');
  await test('stampedDeclarationPairs: own + sha only (foreign / platform / no-sha skipped)', () => {
    const recs = [stamp({}, ownFact), stamp({}, { ...ownFact, eligibility: 'foreign' }), stamp({}, { ...ownFact, heldFilesSha256: null }), {}];
    eq(stampedDeclarationPairs(recs), [{ serviceId: SID, sha: SHA }]);
  });
  await test('tableFromDeclarations: registrant entries keyed by serviceId + sha; unknown sha ⇒ unavailable; bad grammar ⇒ invalid', () => {
    const t = tableFromDeclarations([{ serviceId: SID, sha: SHA }, { serviceId: 'x', sha: 'f'.repeat(64) }, { serviceId: 'y', sha: 'e'.repeat(64) }],
      [...SNAP, { sha256: 'e'.repeat(64), heldFiles: { files: [{ tool: 't', select: 'a.*.*' }] } }]);
    const reg = t.table.filter((d) => d.declaredBy === 'registrant');
    eq(reg.map((d) => [d.serviceId, d.tool, d.declarationSha256, d.notAFileTools]), [[SID, 'fetch_data', SHA, ['list_devices']]]);
    eq([[...t.unavailableShas], [...t.invalidShas]], [['f'.repeat(64)], ['e'.repeat(64)]]);
  });
  await test('buildHeldDescriptorTable: no query when capture is off or nothing is stamped; a DB error ⇒ unavailable + stat (never throws)', async () => {
    let queries = 0; const db = { heldDeclaration: { findMany: async () => { queries++; throw new Error('db down'); } } };
    await buildHeldDescriptorTable(db, [stamp({}, ownFact)], false); await buildHeldDescriptorTable(db, [{}], true);
    eq(queries, 0);
    const t = await buildHeldDescriptorTable(db, [stamp({}, ownFact)], true);
    eq([queries, [...t.unavailableShas], t.stats.descriptorLookupFailed], [1, [SHA], 1]);
  });

  console.log('\n── extractor rules ──');
  const T = tableFromDeclarations([{ serviceId: SID, sha: SHA }], SNAP);
  const run = (recs: unknown[], o: object = {}) => extractDeclaredFiles(recs, T.table, { live: true, unavailableShas: T.unavailableShas, invalidShas: T.invalidShas, ...o });
  await test('own + stamped sha ⇒ held as registrant, sha on the file', () => {
    const r = run([stamp(call('fetch_data', netResult), ownFact)]);
    eq(r.files.map((f) => [f.target, f.path, f.declaredBy, f.declarationSha256]), [['ceos1', '/running-config', 'registrant', SHA]]);
  });
  await test('B-1: foreign row with a declaration ⇒ nothing held, foreignRowNotHeld', () => {
    const r = run([stamp(call('fetch_data', netResult), { ...ownFact, eligibility: 'foreign' })]);
    eq([r.files.length, r.refusals.length, r.stats.foreignRowNotHeld], [0, 0, 1]);
  });
  // ── INTERNAL-FIT IF-3: shared eligibility (hosted POV grant · self-host install-wide) ──
  const GPOV = 'cmpovaaaaaaaaaaaaaaaaaaaaa1';
  await test('IF-3: a GRANTED registrant call is held and stamped eligibility=granted + the ONE granting POV', () => {
    const r = run([stamp(call('fetch_data', netResult), { ...ownFact, eligibility: 'granted', grantPovId: GPOV })]);
    eq(r.files.map((f) => [f.declaredBy, f.eligibility, f.grantPovId]), [['registrant', 'granted', GPOV]]);
  });
  await test('IF-3: an INSTALL-wide registrant call is held, stamped install, no grantPovId', () => {
    const r = run([stamp(call('fetch_data', netResult), { ...ownFact, eligibility: 'install' })]);
    eq(r.files.map((f) => [f.eligibility, f.grantPovId]), [['install', null]]);
  });
  await test('IF-3: an OWN call is stamped own; a PLATFORM-default call is stamped platform; replay (unstamped) stores null', () => {
    const own = run([stamp(call('fetch_data', netResult), ownFact)]);
    const plat = run([stamp(call('get_otel_config', { structuredContent: { yaml: 'x: 1\n' } }, { serviceName: 'observability-readonly', serviceId: 'svc-obs' }), { serviceId: 'svc-obs', eligibility: 'platform', heldFilesSha256: null })]);
    const replay = run([call('get_otel_config', { structuredContent: { yaml: 'x: 1\n' } }, { serviceName: 'observability-readonly', serviceId: 'svc-obs' })], { live: false });
    eq([own.files[0]?.eligibility, plat.files[0]?.eligibility, replay.files[0]?.eligibility, replay.files[0]?.grantPovId], ['own', 'platform', null, null]);
  });
  await test('IF-3: a granted call whose snapshot is missing ⇒ declaration-unavailable refusal, stamped granted (never a silent fallback)', () => {
    const r = run([stamp(call('fetch_data', netResult), { ...ownFact, eligibility: 'granted', grantPovId: GPOV, heldFilesSha256: 'f'.repeat(64) })]);
    eq(r.refusals.map((x) => [x.refusal, x.eligibility, x.grantPovId]), [['declaration-unavailable', 'granted', GPOV]]);
  });
  await test('B-1: a squatted (foreign) row under a PLATFORM-DEFAULT name ⇒ nothing held', () => {
    const rec = call('get_otel_config', { structuredContent: { yaml: 'receivers: {}\n' } }, { serviceName: 'observability-readonly', serviceId: 'svc-squat' });
    const r = run([stamp(rec, { serviceId: 'svc-squat', eligibility: 'foreign', heldFilesSha256: null })]);
    eq([r.files.length, r.stats.foreignRowNotHeld], [0, 1]);
  });
  await test('sec-ops build SF-2: a registrant {key} template that RESOLVES to a github: or platform target is refused at capture', () => {
    for (const key of ['github:paichart:paichart-lab-configs', 'GitHub:acme:x', 'obs-otelcol']) {
      const res = { structuredContent: { hosts: { [key]: { output: { config: { running: 'x\n' } } } } } };
      const r = run([stamp(call('fetch_data', res), ownFact)]);
      eq([r.files.length, r.refusals.map((x) => [x.refusal, x.detail?.reason])], [0, [['path-invalid', 'reserved-target']]], key);
    }
  });
  await test('§10 A-8 (as written, sec-ops build SF-1): an UNSTAMPED successful live call to a platform default holds NOTHING + is counted', () => {
    const rec = call('get_otel_config', { structuredContent: { yaml: 'receivers: {}\n' } }, { serviceName: 'observability-readonly', serviceId: 'svc-obs' });
    const r = run([rec]);
    eq([r.files.length, r.refusals.length, r.stats.unstampedDefaultCall], [0, 0, 1]);
  });
  await test('§10 A-8: REPLAY (live:false) of the same unstamped stored record still predicts the platform-default row', () => {
    const rec = call('get_otel_config', { structuredContent: { yaml: 'receivers: {}\n' } }, { serviceName: 'observability-readonly', serviceId: 'svc-obs' });
    const r = run([rec], { live: false });
    eq([r.files.length, r.files[0]?.declaredBy, r.stats.unstampedDefaultCall], [1, 'platform-default', 0]);
  });
  await test('a stamped platform/own call to a default is held with no counter', () => {
    const rec = call('get_otel_config', { structuredContent: { yaml: 'x: 1\n' } }, { serviceName: 'observability-readonly', serviceId: 'svc-obs' });
    const r = run([stamp(rec, { serviceId: 'svc-obs', eligibility: 'own', heldFilesSha256: null })]);
    eq([r.files.length, r.stats.unstampedDefaultCall, r.stats.foreignRowNotHeld], [1, 0, 0]);
  });
  await test('§10 A-10: a stamped sha whose snapshot is missing ⇒ declaration-unavailable (named, never a name fallback)', () => {
    const r = run([stamp(call('fetch_data', netResult), { ...ownFact, heldFilesSha256: 'a'.repeat(64) })]);
    eq(r.refusals.map((x) => [x.refusal, x.declaredBy, x.declarationSha256]), [['declaration-unavailable', 'registrant', 'a'.repeat(64)]]);
  });
  await test('an invalid snapshot ⇒ declaration-invalid', () => {
    const r = extractDeclaredFiles([stamp(call('fetch_data', netResult), ownFact)], T.table, { live: true, invalidShas: new Set([SHA]) });
    eq(r.refusals.map((x) => x.refusal), ['declaration-invalid']);
  });
  await test('§10 A-11d: an undeclared tool ⇒ a stat naming it (no row); a notAFile tool ⇒ nothing', () => {
    const r = run([stamp(call('show_commands', { content: [] }), ownFact), stamp(call('list_devices', { content: [] }), ownFact)]);
    eq([r.refusals.length, r.stats.registrantUndeclared, r.registrantUndeclaredTools], [0, 1, ['show_commands']]);
  });
  await test('an UNSTAMPED live call to a registrant service holds nothing (fail closed)', () => {
    const r = run([call('fetch_data', netResult)]);
    eq([r.files.length, r.refusals.length], [0, 0]);
  });
  await test('legacy replay (live false): registrant entries match by serviceId', () => {
    const r = extractDeclaredFiles([call('fetch_data', netResult)], T.table, { live: false });
    eq(r.files.map((f) => [f.declaredBy, f.declarationSha256]), [['registrant', SHA]]);
  });

  console.log('\n── declared Git source (WB-1) ──');
  const GIT = decl.validateHeldFiles([{ tool: 'get_file_contents', select: 'content[type=resource].resource.text', path: { uri: 'path' }, gitPin: { owner: 'acme', repo: 'net-configs' } }],
    { serviceName: 'acme-git', capabilityToolNames: ['get_file_contents'], platformServiceNames: [], platformPins: [], platformTargets: [] });
  const GT = tableFromDeclarations([{ serviceId: 'svc-git', sha: GIT.sha256 }], [{ sha256: GIT.sha256, heldFiles: GIT.declaration }]);
  const gitCall = (owner: string, uriOwner = owner) => {
    const res = { content: [{ type: 'text', text: 'successfully downloaded text file (SHA: abc)' },
      { type: 'resource', resource: { uri: `repo://${uriOwner}/net-configs/sha/${'1'.repeat(40)}/contents/net/ceos1.cfg`, text: 'hostname ceos1\n' } }] };
    const rec = call('get_file_contents', res, { serviceName: 'acme-git', serviceId: 'svc-git' });
    (rec.arguments as Record<string, unknown>).arguments = { owner, repo: 'net-configs', path: 'net/ceos1.cfg' };
    ((rec.result.content[0] as { data: Record<string, unknown> }).data).arguments = { owner, repo: 'net-configs', path: 'net/ceos1.cfg' };
    return stamp(rec, { serviceId: 'svc-git', eligibility: 'own', heldFilesSha256: GIT.sha256, gitSource: true });
  };
  await test('own repo on a Git-file-source leg ⇒ held, target derived from the pin, revision recorded', () => {
    const r = extractDeclaredFiles([gitCall('acme')], GT.table, { live: true, gitFileSourceLeg: true });
    eq(r.files.map((f) => [f.target, f.path, f.sourceRevision]), [['github:acme:net-configs', '/net/ceos1.cfg', '1'.repeat(40)]]);
  });
  await test('another repo ⇒ source-not-pinned (the declared pin is enforced at capture)', () => {
    const r = extractDeclaredFiles([gitCall('evil')], GT.table, { live: true, gitFileSourceLeg: true });
    eq(r.refusals.map((x) => [x.refusal, x.detail]), [['source-not-pinned', { field: 'owner' }]]);
  });
  await test('outside a Git-file-source leg ⇒ outOfScopeLane, nothing held', () => {
    const r = extractDeclaredFiles([gitCall('acme')], GT.table, { live: true, gitFileSourceLeg: false });
    eq([r.files.length, r.stats.outOfScopeLane], [0, 1]);
  });
  await test('persist elision covers a DECLARED Git source (gitSource fact): the blob-id status line is replaced', () => {
    const out = elideGitFileSourceStatus(gitCall('acme')) as { result: { content: Array<{ data: { result: { content: Array<{ text?: string }> } } }> } };
    eq(out.result.content[0].data.result.content[0].text, GIT_STATUS_ELIDED_TEXT);
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
