/**
 * WI-B10 (2026-10-23) — the registration side of registrant file declarations (lib/mcp/server/tools/hub/
 * registrant-declaration.js) + the agent tool strip of `registry.heldFiles`. Pure (fake fetch; no DB, no network).
 * Design: cline_docs/reviews/held-network-2026-10-22/WI-B10-DESIGN.md §9.1 A/B/C/D/F, §10.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://x:x@127.0.0.1:1/x'; // tool-schemas reaches prisma.ts
// eslint-disable-next-line @typescript-eslint/no-var-requires
const rd = require('../lib/mcp/server/tools/hub/registrant-declaration.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerFieldsSchema, CONSOLIDATED_SCHEMAS } = require('../lib/mcp/server/config/tool-schemas.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GIT_FILE_SOURCE_PINS } = require('../lib/mcp/server/config/git-file-source-pin.js');
import { PLATFORM_DEFAULT_DESCRIPTORS } from '../lib/agents/harness/held-bytes/descriptors';
import { stripAgentForbiddenActions } from '../lib/services/mcp/agent-tool-strip';

let passed = 0; let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`); } catch (e) { failed++; console.log(`  ❌ ${name}: ${(e as Error).message}`); }
}
function eq(a: unknown, b: unknown, msg = '') { const A = JSON.stringify(a); const B = JSON.stringify(b); if (A !== B) throw new Error(`${msg} expected ${B}, got ${A}`); }

const DESC = {
  _comment: 'ignored', name: 'acme-devices', description: 'Read-only device state for the acme fabric', endpoint: 'https://devices.acme.example/mcp',
  category: 'automation', version: '1.0.0', capabilities: { tools: ['list_devices', 'fetch_data', 'show_commands'] },
  heldFiles: { files: [{ tool: 'fetch_data', select: 'structuredContent.hosts.*.output.config.running', target: { template: '{key}' }, path: { const: '/running-config' } }], notAFile: ['list_devices', 'show_commands'] },
  extra: { anything: true },
};
const okFetch = (json: object = DESC) => async () => ({ ok: true, json, sha256: 'a'.repeat(64), url: 'https://raw.example/d.json' });

(async () => {
  console.log('\n── B-2: alias laundering ──');
  await test('two spellings of heldFiles ⇒ collision', () => eq(rd.aliasCollision({ heldFiles: [], held_files: [] }), 'heldFiles'));
  await test('two spellings of descriptorUrl ⇒ collision', () => eq(rd.aliasCollision({ descriptor_url: 'a', 'descriptor-url': 'b' }), 'descriptorUrl'));
  await test('one spelling ⇒ fine', () => eq(rd.aliasCollision({ held_files: [], descriptorUrl: 'x' }), null));

  console.log('\n── C-4 / SF-3: agent refusal (both arms + controls) ──');
  await test('callingExecutionId ⇒ refused', () => eq(rd.agentDeclarationRefusal({ heldFiles: [] }, { callingExecutionId: 'e1' }, 'http'), true));
  await test('embedded transport ⇒ refused even with no callingExecutionId', () => eq(rd.agentDeclarationRefusal({ heldFiles: [] }, {}, 'embedded'), true));
  await test('a human (http, no execution) may declare', () => eq(rd.agentDeclarationRefusal({ heldFiles: [] }, { user: { id: 'u' } }, 'http'), false));
  await test('I-7 condition 1: isAgentCaller is the ONE predicate (embedded or callingExecutionId)', () => {
    eq([rd.isAgentCaller({}, 'embedded'), rd.isAgentCaller({ callingExecutionId: 'e1' }, 'http'), rd.isAgentCaller({ user: { id: 'u' } }, 'http')], [true, true, false]);
  });
  await test('I-7: resolveFromDescriptor passes allowQuery through to the fetch; a query refusal never echoes the URL', async () => {
    let seenOpts: unknown = null;
    const refusing = async (_u: string, o: unknown) => { seenOpts = o; return { ok: false, reason: 'descriptor-query', preConnect: true }; };
    const r = await rd.resolveFromDescriptor({ descriptorUrl: 'https://g.example/f?private_token=SECRET99' }, { registerFieldsSchema, fetch: refusing, allowQuery: false });
    eq([r.ok, r.code, seenOpts], [false, 'descriptor-query', { allowQuery: false }]);
    if (r.message.includes('SECRET99') || r.message.includes('g.example')) throw new Error('refusal echoed the URL');
    if (!/operator/.test(r.message)) throw new Error('refusal does not say an operator must register it');
  });
  await test('I-7: provenance.url is the fetch storedUrl (query values masked), never the raw URL', async () => {
    const masked = async () => ({ ...(await okFetch()()), storedUrl: 'https://g.example/f?private_token=***' });
    const r = await rd.resolveFromDescriptor({ descriptorUrl: 'https://g.example/f?private_token=SECRET99' }, { registerFieldsSchema, fetch: masked, allowQuery: true });
    eq([r.ok, r.provenance?.url], [true, 'https://g.example/f?private_token=***']);
  });
  // I-7 condition 3.2(b): the row as WRITTEN — the real fetch (network faked) → resolveFromDescriptor → declarationColumns, the
  // exact object both create sites spread (service-registration-handler :412 / :480; the only writer of the column).
  const onlyMasked = (stored: unknown) => {
    if (typeof stored !== 'string') return false;
    const u = new URL(stored);
    if (u.search === '' || u.search === '?***') return true;
    return [...new URLSearchParams(u.search.slice(1))].every(([, v]) => v === '***');
  };
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const realFetch = require('../lib/mcp/server/config/descriptor-fetch.js').fetchDescriptor;
  const descBody = JSON.stringify(DESC);
  const fakeNet = (_o: Record<string, unknown>, onRes: (res: unknown) => void) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { EventEmitter } = require('events');
    const req = new EventEmitter(); req.destroy = () => undefined;
    req.end = () => { const res = new EventEmitter(); res.statusCode = 200; res.headers = { 'content-type': 'application/json' }; res.resume = () => undefined; onRes(res); setImmediate(() => { res.emit('data', Buffer.from(descBody)); res.emit('end'); }); };
    return req;
  };
  const viaRealFetch = (url: string, opts: Record<string, unknown>) => realFetch(url, { ...opts, httpsRequest: fakeNet, dnsLookup: (_h: string, _o: object, cb: (e: null, a: unknown) => void) => cb(null, [{ address: '185.199.108.133', family: 4 }]) });
  await test('I-7 3.2(b): the column as WRITTEN holds no query value other than *** (real fetch → resolve → declarationColumns)', async () => {
    const r = await rd.resolveFromDescriptor({ descriptorUrl: 'https://gitlab.corp.example/api/v4/projects/7/repository/files/d.json/raw?ref=main&private_token=SECRETTOK' }, { registerFieldsSchema, fetch: viaRealFetch, allowQuery: true });
    if (!r.ok) throw new Error(`resolve failed: ${r.code}`);
    const cols = rd.declarationColumns({ provenance: r.provenance });
    eq([onlyMasked(cols.descriptorUrl), JSON.stringify(cols).includes('SECRETTOK')], [true, false]);
  });
  await test('I-7 3.2(b) NEGATIVE CONTROL: a raw-stored URL fails the same assertion', async () => {
    const raw = async (u: string) => ({ ...(await okFetch()()), url: u, storedUrl: u });
    const r = await rd.resolveFromDescriptor({ descriptorUrl: 'https://g.example/f?private_token=SECRETTOK' }, { registerFieldsSchema, fetch: raw, allowQuery: true });
    eq(onlyMasked(rd.declarationColumns({ provenance: r.provenance }).descriptorUrl), false);
  });
  await test('an agent with descriptorUrl only is NOT refused (NS-1 (a))', () => eq(rd.agentDeclarationRefusal({ descriptorUrl: 'x' }, { callingExecutionId: 'e1' }, 'embedded'), false));

  console.log('\n── NS-1 (a) + WB-2: register from the fetched bytes ──');
  await test('projection: descriptor fields only (no _comment/extra), heldFiles carried, provenance stamped', async () => {
    const r = await rd.resolveFromDescriptor({ descriptorUrl: 'https://raw.example/d.json' }, { registerFieldsSchema, fetch: okFetch() });
    eq(r.ok, true); eq(Object.keys(r.validatedArgs).sort(), ['authType', 'capabilities', 'category', 'description', 'endpoint', 'name', 'version']);
    eq([r.validatedArgs.name, r.validatedArgs.authType, r.provenance.rawSha256], ['acme-devices', 'NONE', 'a'.repeat(64)]);
    eq(r.heldFiles.files.length, 1);
  });
  await test('a typed SECURITY field that disagrees ⇒ DESCRIPTOR_FIELD_DISAGREES', async () => {
    const r = await rd.resolveFromDescriptor({ descriptorUrl: 'x', endpoint: 'https://evil.example/mcp' }, { registerFieldsSchema, fetch: okFetch() });
    eq([r.ok, r.code], [false, 'DESCRIPTOR_FIELD_DISAGREES']);
  });
  await test('capabilities compare as the SET of tool names (order-insensitive)', async () => {
    const r = await rd.resolveFromDescriptor({ descriptorUrl: 'x', capabilities: { tools: ['show_commands', 'fetch_data', 'list_devices'] } }, { registerFieldsSchema, fetch: okFetch() });
    eq(r.ok, true);
    const r2 = await rd.resolveFromDescriptor({ descriptorUrl: 'x', capabilities: { tools: ['fetch_data'] } }, { registerFieldsSchema, fetch: okFetch() });
    eq([r2.ok, r2.code], [false, 'DESCRIPTOR_FIELD_DISAGREES']);
  });
  await test('a fillable field the descriptor omits may come from the caller; one it carries wins', async () => {
    const { category, ...noCat } = DESC; void category;
    const r = await rd.resolveFromDescriptor({ descriptorUrl: 'x', category: 'monitoring', version: '9.9.9' }, { registerFieldsSchema, fetch: okFetch(noCat) });
    eq([r.ok, r.validatedArgs.category, r.validatedArgs.version], [true, 'monitoring', '1.0.0']);
  });
  await test('missing required field ⇒ DESCRIPTOR_MISSING_FIELD', async () => {
    const { endpoint, ...noEp } = DESC; void endpoint;
    const r = await rd.resolveFromDescriptor({ descriptorUrl: 'x' }, { registerFieldsSchema, fetch: okFetch(noEp) });
    eq([r.ok, r.code], [false, 'DESCRIPTOR_MISSING_FIELD']);
  });
  await test('fetched bytes meet the typed constraints (internal:// endpoint, bad name) ⇒ DESCRIPTOR_INVALID', async () => {
    const r = await rd.resolveFromDescriptor({ descriptorUrl: 'x' }, { registerFieldsSchema, fetch: okFetch({ ...DESC, endpoint: 'internal://x' }) });
    eq([r.ok, r.code], [false, 'DESCRIPTOR_INVALID']);
    const r2 = await rd.resolveFromDescriptor({ descriptorUrl: 'x' }, { registerFieldsSchema, fetch: okFetch({ ...DESC, name: 'Bad Name' }) });
    eq([r2.ok, r2.code], [false, 'DESCRIPTOR_INVALID']);
  });
  await test('a fetch failure carries its named reason and no fetched content', async () => {
    const r = await rd.resolveFromDescriptor({ descriptorUrl: 'x' }, { registerFieldsSchema, fetch: async () => ({ ok: false, reason: 'descriptor-redirect', preConnect: false }) });
    eq([r.ok, r.code], [false, 'descriptor-redirect']);
  });

  console.log('\n── F: platform reservations (pinned to the platform tables) ──');
  await test('reserved names = the platform default services ∪ Git pin names', () => {
    const fromTable = [...new Set(PLATFORM_DEFAULT_DESCRIPTORS.map((d) => d.service))].sort();
    eq([...rd.PLATFORM_DECLARATION_SERVICE_NAMES].sort(), fromTable);
    for (const n of Object.keys(GIT_FILE_SOURCE_PINS)) eq(fromTable.includes(n), true, `pin ${n}`);
  });
  await test('reserved targets = every const target in the platform table', () => {
    const t = new Set<string>();
    for (const d of PLATFORM_DEFAULT_DESCRIPTORS) for (const f of d.files ?? []) if ('const' in f.target) t.add(f.target.const);
    eq([...rd.PLATFORM_DECLARATION_TARGETS].sort(), [...t].sort());
  });
  await test('buildDeclaration on a platform name ⇒ refused; on the customer service ⇒ ok with a sha', () => {
    eq(rd.buildDeclaration(DESC.heldFiles, { serviceName: 'observability-readonly', capabilities: DESC.capabilities }).reason, 'platform-service-name');
    const v = rd.buildDeclaration(DESC.heldFiles, { serviceName: 'acme-devices', capabilities: DESC.capabilities });
    eq([v.ok, typeof v.sha256, v.declaration.files.length], [true, 'string', 1]);
  });
  await test('the platform pin is refused for a customer gitPin', () => {
    const v = rd.buildDeclaration([{ tool: 'get_file_contents', select: 'content[type=resource].resource.text', path: { uri: 'path' }, gitPin: { owner: 'paichart', repo: 'paichart-configs' } }], { serviceName: 'acme-git', capabilities: { tools: ['get_file_contents'] } });
    eq([v.ok, v.reason], [false, 'git-pin-is-platform']);
  });

  console.log('\n── adoption / lock / columns ──');
  const row = { id: 's1', name: 'acme-devices', status: 'ACTIVE', configuration: { ownerId: 'u1' }, descriptorSha256: 'a'.repeat(64), declarationSource: 'fetched' };
  await test('adopt: same owner + same raw descriptor bytes', () => eq(rd.adoptable(row, { userId: 'u1', rawSha256: 'a'.repeat(64) }), true));
  await test('no adopt: other owner / other bytes / not URL-registered', () => {
    eq(rd.adoptable(row, { userId: 'u2', rawSha256: 'a'.repeat(64) }), false);
    eq(rd.adoptable(row, { userId: 'u1', rawSha256: 'b'.repeat(64) }), false);
    eq(rd.adoptable({ ...row, descriptorSha256: null }, { userId: 'u1', rawSha256: 'a'.repeat(64) }), false);
  });
  await test('isDescriptorOwned keys on descriptorSha256 (a URL row with no heldFiles is still locked)', () => {
    eq(rd.isDescriptorOwned({ descriptorSha256: 'x', declarationSource: null }), true); eq(rd.isDescriptorOwned({ descriptorSha256: null }), false);
  });
  await test('columns: declaration + provenance; provenance alone for a URL row without heldFiles; nothing for a plain row', () => {
    const at = new Date(0);
    eq(Object.keys(rd.declarationColumns({ decl: { declaration: { files: [] }, sha256: 's', source: 'fetched' }, provenance: { url: 'u', rawSha256: 'r', fetchedAt: at } })).sort(),
      ['declarationSource', 'descriptorFetchedAt', 'descriptorSha256', 'descriptorUrl', 'heldFiles', 'heldFilesSha256']);
    eq(Object.keys(rd.declarationColumns({ provenance: { url: 'u', rawSha256: 'r', fetchedAt: at } })).sort(), ['descriptorFetchedAt', 'descriptorSha256', 'descriptorUrl']);
    eq(rd.declarationColumns({}), {});
  });

  await test('orphanedDeclarationTools: a capabilities change that drops a declared tool is named; a superset is fine', () => {
    const r = { heldFiles: { files: [{ tool: 'fetch_data' }, { tool: 'get_x' }], notAFile: [] } };
    eq(rd.orphanedDeclarationTools(r, { tools: ['fetch_data'] }), ['get_x']);
    eq(rd.orphanedDeclarationTools(r, { tools: ['fetch_data', 'get_x', 'more'] }), []);
    eq(rd.orphanedDeclarationTools({ heldFiles: null }, { tools: [] }), []);
  });

  console.log('\n── SF-6: agent registry definition ──');
  const regDef = { name: 'registry', description: 'Manage Service Registry', inputSchema: { type: 'object', properties: { action: { enum: ['register', 'list'] }, descriptorUrl: { type: 'string' }, heldFiles: {} }, required: ['action'] } };
  await test('agents see descriptorUrl, never heldFiles; actions + description untouched', () => {
    const s = stripAgentForbiddenActions(regDef);
    eq(Object.keys(s.inputSchema.properties).sort(), ['action', 'descriptorUrl']);
    eq([s.inputSchema.properties.action.enum, s.description], [['register', 'list'], 'Manage Service Registry']);
    eq(Object.keys(regDef.inputSchema.properties).length, 3, 'original not mutated');
  });
  await test('a tool with no forbidden entry keeps its reference', () => { const t = { name: 'services', inputSchema: {} }; eq(stripAgentForbiddenActions(t) === t, true); });
  await test('the boundary declares descriptorUrl and heldFiles (bounded there, not passed through)', () => {
    const reg = CONSOLIDATED_SCHEMAS.registry.inputSchema;
    eq(reg.safeParse({ action: 'register', descriptorUrl: 'https://x.example/' + 'a'.repeat(2100) }).success, false);
    eq(reg.safeParse({ action: 'register', descriptorUrl: 'https://x.example/d.json', heldFiles: Array.from({ length: 65 }, () => ({})) }).success, false);
    eq(reg.safeParse({ action: 'register', descriptorUrl: 'https://x.example/d.json' }).success, true);
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
