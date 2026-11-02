#!/usr/bin/env ts-node
/**
 * PLATFORM-HELD-BYTES Stage B V-7 — `project({ action: 'held.get' })` (held-get-handler.ts, project-dispatcher.js, tool-schemas.js,
 * serverManager.stripAgentForbiddenActions). Plan STAGE-B-PLAN.md v4.1 §3 V-7; boundary BD-1 / N3-a, hub S4 / N-c / N-d.
 * CI-safe: no DB. The handler's client is injected by wrapping the module's `handleHeldGet` export (the dispatcher destructures it
 * at CALL time), so every case below goes through the REAL wiring: MCPCoreManager.processRequest → the v5 server's `project`
 * handler (wrapWithSchema + resolveUserContext) → ProjectDispatcher → the handler; the stdio server; the embedded (agent) server.
 */
process.env.PAICHART_SKIP_DB_CONNECT = 'true';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { MCPCoreManager } from '../lib/mcp/server/mcp-core';
import * as heldGet from '../lib/mcp/server/tools/held-get-handler';
import { stripAgentForbiddenActions, AGENT_FORBIDDEN_ACTIONS, mcpServerManager } from '../lib/services/mcp/serverManager';
import { mcpToolRegistry } from '../lib/services/mcp/toolRegistry';
import { EmbeddedMCPServer } from '../lib/mcp/embedded-server';
const { CONSOLIDATED_SCHEMAS } = require('../lib/mcp/server/config/tool-schemas');
const { ProjectDispatcher } = require('../lib/mcp/server/tools/dispatchers/project-dispatcher');
const { PureSDKNativeServer } = require('../mcp-server-v5');

let passed = 0; let failed = 0;
const pending: Array<{ d: string; fn: () => Promise<void> | void }> = [];
const test = (d: string, fn: () => Promise<void> | void) => { pending.push({ d, fn }); };
function eq(a: unknown, b: unknown, what = '') { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c: unknown, what: string) { if (!c) throw new Error(what); }

const POV = 'cpovaaaaaaaaaaaaaaaaaaaaa'; const OTHER_POV = 'cpovbbbbbbbbbbbbbbbbbbbbb';
const EXEC = 'cexecaaaaaaaaaaaaaaaaaaaa'; const AUTHOR_EXEC = 'cexecbbbbbbbbbbbbbbbbbbbb';
const REF = 'crefaaaaaaaaaaaaaaaaaaaaa'; const BASE_REF = 'crefbbbbbbbbbbbbbbbbbbbbb'; const CAND_REF = 'crefccccccccccccccccccccc';
const OWNER = 'cuserownerxxxxxxxxxxxxxxx'; const STRANGER = 'cuserstrangerxxxxxxxxxxxx';
const TEXT = 'receivers:\n  otlp:\n    protocols:\n      grpc:\n        endpoint: 0.0.0.0:4317\n';
const CAND_TEXT = TEXT.replace('4317', '4318');
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

function refRow(id: string, kind: string, text: string, o: Record<string, unknown> = {}) {
  return { id, scope: POV, blobSha256: sha(text), executionId: kind === 'CAPTURE' ? EXEC : AUTHOR_EXEC, kind, legTaskId: 'cleg', rootTaskId: 'croot',
    serviceId: null, serviceName: 'otel', sourceTool: 'get_otel_config', toolCallIndex: kind === 'CAPTURE' ? 0 : null, selector: null, target: 'collector-1',
    path: '/etc/otel/config.yaml', declaredBy: 'descriptor', descriptorVersion: 1, hashBasis: 'utf8', decodeVersion: 1, redactorVersion: 'paichart.r10/3',
    redactedCount: 0, lineCount: 5, newline: 'lf', bom: false, finalNewline: true, serviceReportsComplete: true, derivedRawByteLength: 70,
    placeholderPreexistingCount: 0, createdAt: new Date(0), ...o };
}

/** A stub client: refs, refusals, a POV, a manifest, blobs. Records the ORDER of every call. */
function world(o: { povMeta?: unknown; owner?: string; activityThrows?: boolean; blobs?: Record<string, string>; refs?: any[] } = {}) {
  const calls: string[] = [];
  const activities: any[] = [];
  const refs = o.refs ?? [refRow(REF, 'CAPTURE', TEXT), refRow(BASE_REF, 'BASE', TEXT), refRow(CAND_REF, 'CANDIDATE', CAND_TEXT)];
  const blobs = o.blobs ?? { [sha(TEXT)]: TEXT, [sha(CAND_TEXT)]: CAND_TEXT };
  const manifest = JSON.stringify({ files: [{ handle: 'H1', path: '/etc/otel/config.yaml', baseRefId: BASE_REF, candidateRefId: CAND_REF }] });
  const db: any = {
    heldFileRef: {
      findUnique: async (a: any) => { calls.push(`ref.findUnique:${a.where.id}`); return refs.find((r) => r.id === a.where.id) ?? null; },
      findMany: async (a: any) => { calls.push('ref.findMany'); return refs.filter((r) => r.executionId === a.where.executionId && r.kind === a.where.kind); },
    },
    heldCaptureRefusal: { findMany: async () => { calls.push('refusal.findMany'); return []; } },
    agentArtifact: { findFirst: async (a: any) => { calls.push('artifact.findFirst'); return a.where.executionId === AUTHOR_EXEC ? { content: manifest } : null; } },
    pOV: { findUnique: async (a: any) => { calls.push('pov.findUnique');
      return a.where.id === POV ? { id: POV, ownerId: o.owner ?? OWNER, metadata: o.povMeta ?? {}, team: { members: [] } } : null; } },
    activity: { create: async (a: any) => { calls.push('activity.create'); if (o.activityThrows) throw new Error('insert failed'); activities.push(a.data); return a.data; } },
    $queryRaw: async (_s: any, ...vals: any[]) => {
      calls.push('blob.read');
      const flat = JSON.stringify(_s?.values ?? vals);
      const hit = Object.keys(blobs).find((k) => flat.includes(k));
      return hit ? [{ content: Buffer.from(blobs[hit], 'utf8') }] : [];
    },
  };
  return { db, calls, activities };
}

// Inject the stub client at the module boundary the dispatcher reads (call-time destructure in project-dispatcher.js).
const realHandle = heldGet.handleHeldGet;
let current = world();
const transportsSeen: string[] = [];
(heldGet as any).handleHeldGet = (p: any, c: any, opts: any) => { transportsSeen.push(opts.transport); return realHandle(p, c, { ...opts, db: current.db }); };

const text = (r: any): string => (r?.result?.content ?? r?.content ?? []).map((c: any) => c.text).join('\n');
const isErr = (r: any) => !!(r?.result?.isError ?? r?.isError);

// ─── the real HTTP wiring ─────────────────────────────────────────────────────────────────────────────────────────────────
const silent: any = new Proxy({}, { get: () => () => silent });
function v5(transport?: 'stdio') {
  const s = new PureSDKNativeServer(transport ? { transport } : undefined);
  s.logger = silent;
  s.basicTools = { getToolHandler: () => null };
  s.advancedTools = {}; s.hubTools = {}; s.chatgptConnector = {};
  s.collectToolHandlers();
  return s;
}
const httpServer = v5();
const mgr = new MCPCoreManager({ logger: silent, prismaClient: {} as never, sessionStore: {} as never });
(mgr as any)._mcpServer = httpServer;
let rid = 0;
const call = (args: Record<string, unknown>, user: unknown) =>
  mgr.processRequest({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'project', arguments: { action: 'held.get', ...args } }, id: ++rid }, user);
const httpUser = (o: Record<string, unknown> = {}) => ({ id: OWNER, userId: OWNER, email: 'o@x.test', role: 'USER', authMethod: 'jwt', ...o });

// ─── principal ────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('principal rule: the matrix', () => {
  const R = heldGet.heldGetPrincipalRefusal;
  eq(R({ user: { id: 'u', authMethod: 'jwt' } }, 'http'), null);
  eq(R({ user: { id: 'u', authMethod: '' } }, 'http'), 'HELD_GET_REFUSED_UNAUTHENTICATED');
  eq(R({ user: { id: 'u' } }, 'http'), 'HELD_GET_REFUSED_UNAUTHENTICATED', 'rehydrated session user, no authMethod (A21): ');
  eq(R({ user: { id: 'u' }, authMethod: 'jwt' } as never, 'http'), 'HELD_GET_REFUSED_UNAUTHENTICATED', 'top-level authMethod (global fallback shape, N3-a): ');
  eq(R({ user: { id: 'u' } }, 'stdio'), null, 'stdio: ');
  eq(R({ user: null }, 'stdio'), 'HELD_GET_REFUSED_UNAUTHENTICATED');
  eq(R({ user: { id: 'u', authMethod: 'jwt' } }, 'embedded'), heldGet.HELD_GET_REFUSED_AGENT_CALLER);
  eq(R({ user: { id: 'u', authMethod: 'jwt' }, callingExecutionId: 'cexec' }, 'http'), heldGet.HELD_GET_REFUSED_AGENT_CALLER);
  eq(R({ user: { id: 'u' }, callingExecutionId: 'cexec' }, 'stdio'), heldGet.HELD_GET_REFUSED_AGENT_CALLER);
  eq(R({ user: { id: 'u', authMethod: 'jwt', role: 'DEMO_USER' } }, 'http'), 'HELD_GET_REFUSED_DEMO');
  eq(R(undefined, 'http'), 'HELD_GET_REFUSED_UNAUTHENTICATED');
});

test('HTTP processRequest: an authenticated owner reads the bytes; transport http; Activity once', async () => {
  current = world(); transportsSeen.length = 0;
  const r: any = await call({ refId: REF }, httpUser());
  ok(!isErr(r), `not an error: ${text(r)}`);
  eq(transportsSeen, ['http']);
  const content = r.result.content;
  eq(content.length, 2);
  eq(content[1].text, TEXT, 'verbatim body: ');
  eq(sha(content[1].text), JSON.parse(content[0].text).blobSha256, 'sha256(utf8(body)) === blobSha256: ');
  eq(current.activities.length, 1);
});

test('HTTP: a session-fallback user WITHOUT authMethod is refused (SSE fallback, hub N-d; A21)', async () => {
  current = world();
  const r: any = await call({ refId: REF }, { id: OWNER, userId: OWNER, role: 'USER' });
  ok(isErr(r) && text(r).includes('HELD_GET_REFUSED_UNAUTHENTICATED'), text(r));
  eq(current.calls, [], 'no read before the principal check: ');
});

test('HTTP: a session-fallback user WITH authMethod is allowed (SSE fallback)', async () => {
  current = world();
  const r: any = await call({ refId: REF }, { id: OWNER, userId: OWNER, role: 'USER', authMethod: 'oauth' });
  ok(!isErr(r), text(r));
});

test('HTTP: no user never reaches the handler (enforceToolSecurity)', async () => {
  current = world(); transportsSeen.length = 0;
  let out: any; let threw = false;
  try { out = await call({ refId: REF }, null); } catch { threw = true; }
  ok(threw || out?.error, `refused before dispatch: ${JSON.stringify(out)}`);
  eq(transportsSeen, [], 'handler never called: ');
  eq(current.calls, []);
});

test('HTTP: the GLOBAL fallback context (top-level authMethod) is refused (N3-a)', async () => {
  current = world();
  httpServer.setUserContext({ user: { id: OWNER, email: 'o@x.test', role: 'ADMIN' }, authenticated: true, authMethod: 'jwt' });
  const r: any = await httpServer.toolHandlers.get('project')({ action: 'held.get', refId: REF }, {});
  ok(isErr(r) && text(r).includes('HELD_GET_REFUSED_UNAUTHENTICATED'), text(r));
  eq(current.calls, []);
});

test('HTTP: an agent-loop caller (callingExecutionId) is refused, with and without a sessionId', async () => {
  for (const extra of [{}, { sessionId: 'sess-1' }]) {
    current = world();
    const r: any = await httpServer.toolHandlers.get('project')({ action: 'held.get', refId: REF },
      { user: httpUser(), authenticated: true, callingExecutionId: 'cexecxxxxxxxxxxxxxxxxxxxx', ...extra });
    ok(isErr(r) && text(r).includes('HELD_GET_REFUSED_AGENT_CALLER'), text(r));
    eq(current.calls, []);
  }
});

test('stdio server: the configured user (no authMethod) is allowed; transport stdio', async () => {
  const s = v5('stdio');
  current = world(); transportsSeen.length = 0;
  s.setUserContext({ user: { id: OWNER, email: 'o@x.test', role: 'USER' }, authenticated: true });
  const r: any = await s.toolHandlers.get('project')({ action: 'held.get', refId: REF }, {});
  ok(!isErr(r), text(r));
  eq(transportsSeen, ['stdio']);
});

test('embedded (agent) server: refused with and without sessionId, before any read', async () => {
  const e: any = new EmbeddedMCPServer({ logLevel: 'error' });
  e.logger = silent;
  await e.registerToolImplementations();
  e.isRunning = true;
  for (const extra of [{}, { sessionId: 'sess-1' }, { callingExecutionId: 'cexecxxxxxxxxxxxxxxxxxxxx' }]) {
    current = world(); transportsSeen.length = 0;
    const r: any = await e.callTool('project', { action: 'held.get', refId: REF },
      { user: { id: OWNER, email: 'o@x.test', role: 'ADMIN', token: 't' }, authenticated: true, ...extra });
    ok(text(r).includes('HELD_GET_REFUSED_AGENT_CALLER'), text(r));
    eq(transportsSeen, ['embedded']);
    eq(current.calls, []);
  }
});

test('dispatcher transport: default http; an unknown value falls back to http; the stdio entry passes stdio', () => {
  eq(new ProjectDispatcher({}, {}).transport, 'http');
  eq(new ProjectDispatcher({}, {}, { transport: 'nope' }).transport, 'http');
  eq(new PureSDKNativeServer().transport, 'http');
  const src = fs.readFileSync(path.join(__dirname, '../mcp-server-v5.js'), 'utf8');
  ok(/new PureSDKNativeServer\(\{ transport: 'stdio' \}\)/.test(src), 'main() builds the stdio server with transport stdio');
  ok(/new PureSDKNativeServer\(\)/.test(fs.readFileSync(path.join(__dirname, '../lib/mcp/server/mcp-core.ts'), 'utf8')), 'mcp-core builds the http default');
  ok(/new ProjectDispatcher\(basicTools, advancedTools, \{ transport: 'embedded' \}\)/.test(fs.readFileSync(path.join(__dirname, '../lib/mcp/embedded-server.ts'), 'utf8')), 'embedded-server passes embedded');
});

// ─── roles / access ───────────────────────────────────────────────────────────────────────────────────────────────────────
test('DEMO_USER refused; demo POV, a stranger and a missing ref all answer the SAME not-found', async () => {
  current = world();
  ok(text(await call({ refId: REF }, httpUser({ role: 'DEMO_USER' }))).includes('HELD_GET_REFUSED_DEMO'), 'demo user');
  const outs: string[] = [];
  current = world({ povMeta: { isDemo: true } }); outs.push(text(await call({ refId: REF }, httpUser({ role: 'ADMIN' }))));
  current = world({ owner: OWNER }); outs.push(text(await call({ refId: REF }, httpUser({ id: STRANGER, userId: STRANGER }))));
  ok(current.activities.length === 0, 'no Activity on a denied read');
  current = world(); outs.push(text(await call({ refId: 'crefzzzzzzzzzzzzzzzzzzzzz' }, httpUser())));
  current = world({ refs: [refRow(REF, 'CAPTURE', TEXT, { scope: OTHER_POV })] }); outs.push(text(await call({ refId: REF }, httpUser())));
  eq(new Set(outs).size, 1, 'uniform: '); eq(outs[0], '❌ held.get: not-found');
});

test('ADMIN who is not owner/member reads (validatePOVAccess admin arm)', async () => {
  current = world();
  ok(!isErr(await call({ refId: REF }, httpUser({ id: STRANGER, userId: STRANGER, role: 'ADMIN' }))), 'admin');
});

// ─── Activity, response ───────────────────────────────────────────────────────────────────────────────────────────────────
test('Activity row BEFORE content; its metadata exact, no hash, no content', async () => {
  current = world();
  await call({ refId: REF }, httpUser());
  ok(current.calls.indexOf('activity.create') < current.calls.indexOf('blob.read'), `order ${current.calls}`);
  eq(current.activities[0].action, 'held.get'); eq(current.activities[0].type, 'held-bytes');
  eq(Object.keys(current.activities[0].metadata).sort(), ['executionId', 'kind', 'povId', 'redactorVersion', 'refId']);
  const flat = JSON.stringify(current.activities[0]);
  ok(!flat.includes(sha(TEXT)) && !flat.includes('receivers'), 'no hash, no content');
});

test('Activity insert failure refuses, and no blob is read', async () => {
  current = world({ activityThrows: true });
  const r: any = await call({ refId: REF }, httpUser());
  ok(isErr(r) && !text(r).includes('receivers'), text(r));
  ok(!current.calls.includes('blob.read'), 'no read');
});

test('response metadata keys exact; untrustedConnectedOutput; mode/applicable', async () => {
  current = world();
  const r: any = await call({ refId: REF }, httpUser());
  const m = JSON.parse(r.result.content[0].text);
  eq(Object.keys(m), ['kind', 'refId', 'blobSha256', 'redactorVersion', 'redactedCount', 'lineCount', 'newline', 'bom', 'finalNewline', 'mode', 'applicable', 'untrustedConnectedOutput']);
  eq([m.kind, m.refId, m.untrustedConnectedOutput, m.mode, m.applicable], ['CAPTURE', REF, true, 'replace-file', true]);
  const placeholder = TEXT.replace('0.0.0.0:4317', '<<REDACTED-SECRET>>');
  current = world({ refs: [refRow(REF, 'CAPTURE', placeholder)], blobs: { [sha(placeholder)]: placeholder } });
  const m2 = JSON.parse((await call({ refId: REF }, httpUser()) as any).result.content[0].text);
  eq([m2.mode, m2.applicable], ['diff-only', false]);
});

test('held-k8s step 3 (SF-5): a Git ref (sourceRevision set) also names its target + path, in that order; an obs ref (no sourceRevision) does not', async () => {
  const rev = 'a'.repeat(40);
  current = world({ refs: [refRow(REF, 'CAPTURE', TEXT, { sourceRevision: rev, target: 'github:acme:configs', path: 'k8s/app.yaml' })] });
  const m = JSON.parse((await call({ refId: REF }, httpUser()) as any).result.content[0].text);
  eq(Object.keys(m).slice(-3), ['sourceRevision', 'target', 'path']);
  eq([m.sourceRevision, m.target, m.path], [rev, 'github:acme:configs', 'k8s/app.yaml']);
  current = world({ refs: [refRow(REF, 'CAPTURE', TEXT, { sourceRevision: null })] });
  const o = JSON.parse((await call({ refId: REF }, httpUser()) as any).result.content[0].text);
  ok(!('target' in o) && !('path' in o) && !('sourceRevision' in o), 'obs metadata byte-identical (no Git keys)');
});

test('stored bytes that fail their sha256 are not returned', async () => {
  current = world({ blobs: { [sha(TEXT)]: TEXT + 'tampered' } });
  const r: any = await call({ refId: REF }, httpUser());
  ok(isErr(r) && text(r).includes('integrity') && !text(r).includes('receivers'), text(r));
});

test('by handle: CAPTURE via the capture handles; BASE / CANDIDATE via the Author manifest; an unknown handle is not-found', async () => {
  current = world();
  const c: any = await call({ executionId: EXEC, handle: 'H1', kind: 'CAPTURE' }, httpUser());
  eq(JSON.parse(c.result.content[0].text).refId, REF);
  current = world();
  const b: any = await call({ executionId: AUTHOR_EXEC, handle: 'H1', kind: 'BASE' }, httpUser());
  eq(JSON.parse(b.result.content[0].text).refId, BASE_REF);
  current = world();
  const k: any = await call({ executionId: AUTHOR_EXEC, handle: 'H1', kind: 'CANDIDATE' }, httpUser());
  eq(JSON.parse(k.result.content[0].text).refId, CAND_REF); eq(k.result.content[1].text, CAND_TEXT);
  current = world();
  eq(text(await call({ executionId: EXEC, handle: 'H2', kind: 'CAPTURE' }, httpUser())), '❌ held.get: not-found');
  current = world();
  eq(text(await call({ executionId: EXEC, handle: 'H1', kind: 'BASE' }, httpUser())), '❌ held.get: not-found', 'no manifest: ');
});

// ─── schema (L1) ──────────────────────────────────────────────────────────────────────────────────────────────────────────
test('schema: exactly one form; regexes; refine runs before the transform', () => {
  const S = CONSOLIDATED_SCHEMAS.project.inputSchema;
  const okp = (a: object) => S.safeParse({ action: 'held.get', ...a }).success;
  ok(okp({ refId: REF }), 'refId');
  ok(okp({ executionId: EXEC, handle: 'H12', kind: 'BASE' }), 'handle form');
  ok(!okp({}), 'neither');
  ok(!okp({ refId: REF, executionId: EXEC }), 'mixed');
  ok(!okp({ refId: REF, handle: 'H1', kind: 'BASE', executionId: EXEC }), 'both');
  ok(!okp({ executionId: EXEC, handle: 'H1' }), 'kind missing');
  ok(!okp({ executionId: EXEC, handle: 'H0', kind: 'BASE' }), 'H0');
  ok(!okp({ executionId: EXEC, handle: 'H1000', kind: 'BASE' }), 'H1000');
  ok(!okp({ executionId: EXEC, handle: 'H1', kind: 'VIEW' }), 'kind enum');
  ok(!okp({ refId: 'not-a-cuid' }), 'refId regex');
  ok(S.safeParse({ action: 'pov.list' }).success, 'other actions untouched');
  ok(S.safeParse({ action: 'pov.list', refId: REF }).success, 'the refine scopes to held.get');
  const src = fs.readFileSync(path.join(__dirname, '../lib/mcp/server/config/tool-schemas.js'), 'utf8');
  ok(src.indexOf("if (v.action !== 'held.get') return;") < src.indexOf('.transform(stripDangerousKeys)', src.indexOf("if (v.action !== 'held.get') return;")), 'refine before transform');
});

test('HTTP: a malformed held.get is refused by the schema before the handler', async () => {
  current = world(); transportsSeen.length = 0;
  const r: any = await call({ refId: REF, handle: 'H1' }, httpUser());
  ok(isErr(r) && text(r).includes('validation failed'), text(r));
  eq(transportsSeen, []);
});

// ─── agent surface: the strip ─────────────────────────────────────────────────────────────────────────────────────────────
const agentShape = () => ({ name: 'project', description: CONSOLIDATED_SCHEMAS.project.description,
  inputSchema: zodToJsonSchema(CONSOLIDATED_SCHEMAS.project.inputSchema, { target: 'jsonSchema7' }) as any });

test('strip: removes held.get from the real JSON-schema enum AND the description, on a clone', () => {
  const t = agentShape();
  ok(t.inputSchema.properties.action.enum.includes('held.get') && t.description.includes('held.get'), 'precondition: the schema offers it');
  const s = stripAgentForbiddenActions(t);
  ok(!s.inputSchema.properties.action.enum.includes('held.get'), 'enum stripped');
  ok(!s.description.includes('held.get'), 'description stripped');
  eq(s.inputSchema.properties.action.enum, ['pov.list', 'pov.details', 'task.list', 'task.context']);
  ok(t.inputSchema.properties.action.enum.includes('held.get') && t.description.includes('held.get'), 'original untouched');
  const other = { name: 'perform', description: 'held.get', inputSchema: { properties: { action: { enum: ['held.get'] } } } };
  ok(stripAgentForbiddenActions(other) === other, 'other tools untouched (same reference)');
  eq(AGENT_FORBIDDEN_ACTIONS, { project: ['held.get'] });
});

test('HUB-P2-1 / ARCH-P2-2: the AGENT project definition is byte-identical to the pre-held.get schema (deployed 7d9b283b6)', () => {
  // sha256(JSON.stringify({name, description, inputSchema: zodToJsonSchema(...)})) as agentShape() builds it, computed on the
  // 7d9b283b6 tree (no held.get) on 2026-10-15. A legitimate later change to the project schema moves this too — that is a
  // fleet-wide agent tool-bytes change (cache prefix, tokens) and needs its own CLAUDE.md series cut, not a silent re-pin.
  const s = stripAgentForbiddenActions(agentShape());
  eq(createHash('sha256').update(JSON.stringify(s)).digest('hex'), '69e50f31a0fd47dd219827504cec5c756493a629c7fe99224fb29de2a34d59f7');
  for (const p of ['refId', 'executionId', 'handle', 'kind']) ok(!(p in s.inputSchema.properties), `${p} stripped`);
  ok(['refId', 'executionId', 'handle', 'kind'].every((p) => p in agentShape().inputSchema.properties), 'the registry/external schema keeps them');
});

test('getToolDefinitions (both agent build sites): stripped every call; the registry keeps held.get', async () => {
  const shared = agentShape();
  const origGetAll = (mcpToolRegistry as any).getAllTools;
  (mcpToolRegistry as any).getAllTools = () => new Map([['paichart:project', { name: 'project', serverName: 'paichart', description: shared.description, inputSchema: shared.inputSchema }]]);
  try {
    for (let i = 0; i < 2; i++) {
      const defs = await mcpServerManager.getToolDefinitions(['project']);
      ok(!defs[0].tool.inputSchema.properties.action.enum.includes('held.get'), `call ${i + 1} stripped`);
      ok(!defs[0].tool.description.includes('held.get'), `call ${i + 1} description stripped`);
    }
    ok(shared.inputSchema.properties.action.enum.includes('held.get'), 'registry schema still lists held.get (hub N-c)');
  } finally { (mcpToolRegistry as any).getAllTools = origGetAll; }
  const engine = fs.readFileSync(path.join(__dirname, '../lib/services/agentExecutionEngine.ts'), 'utf8');
  const stream = fs.readFileSync(path.join(__dirname, '../app/api/pov/agent/execute/stream/route.ts'), 'utf8');
  ok(/getToolDefinitions\(/.test(engine) && /getToolDefinitions\(/.test(stream), 'both agent build sites use getToolDefinitions');
});

test('InternalServiceRouter.handleProject never gains held.get', () => {
  const src = fs.readFileSync(path.join(__dirname, '../lib/mcp/server/tools/internal/InternalServiceRouter.js'), 'utf8');
  ok(!src.includes('held.get'), 'no held.get in the internal router');
});

(async () => {
  for (const { d, fn } of pending) {
    try { await fn(); passed++; console.log(`  ✅ ${d}`); }
    catch (e) { failed++; console.log(`  ❌ ${d}\n     ${(e as Error).message}`); }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
