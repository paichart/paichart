#!/usr/bin/env ts-node
/**
 * PLATFORM-HELD-BYTES Stage A — the capture path: the declared-file extractor (WI-3) and, in a later commit, the capture
 * helper (WI-4). Plan: cline_docs/reviews/platform-held-bytes-2026-10-13/STAGE-A-PLAN.md WI-3 / WI-4.
 *
 * FIXTURE RULE (panel BC-A1 fix 5): every FAILURE shape is produced by the producer's OWN code — the real gateway handler
 * (ServiceCallHandler) driven with stub dependencies, wrapped by the real embedded-server envelope, recorded by the real
 * loop catch path (executeToolTurn). Never a success fixture with a flag flipped: that pins a shape production never
 * produces. The success shape is a stored production specimen (scripts/fixtures/quote-fidelity/run2-harvest.json).
 *
 * CI-safe: stub DATABASE_URL before any import that reaches lib/prisma (the handler's tree does); no DB is touched.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';

import * as fs from 'fs';
import * as path from 'path';
import {
  extractDeclaredFiles,
  digestFamily,
  resolveJsonPointer,
  toJsonPointer,
} from '../lib/agents/harness/held-bytes/extract';
import { PLATFORM_DEFAULT_DESCRIPTORS, FILE_DESCRIPTOR_TOOLS } from '../lib/agents/harness/held-bytes/descriptors';
import { FILE_ARTIFACT_TOOLS, laneOf } from '../lib/agents/harness/quote-fidelity';
import { executeToolTurn } from '../lib/agents/harness/agentic-tool-loop';
import { EmbeddedMCPServer, embeddedMCPServer } from '../lib/mcp/embedded-server';
import { mcpService } from '../lib/services/mcp/mcpService';
import { prepareHeldCapture, captureHeldFiles, refsAllWritten } from '../lib/services/held-bytes-capture';
import { buildExecutionResultJson } from '../lib/services/execution-artifacts';
import { stampExecutionNets } from '../lib/services/execution-nets';
import * as crypto from 'crypto';
const { ServiceCallHandler } = require('../lib/mcp/server/tools/hub/service-call-handler');
// The gateway's compliance block logs a security event through a DB-backed singleton; stub it so no DB is touched.
const { ComplianceMonitor } = require('../lib/mcp/server/security/compliance-monitor');
ComplianceMonitor.getInstance = () => ({ logSecurityEvent: async () => undefined });

console.log('🗄️  held-bytes capture — extractor (WI-3) + helper (WI-4)\n');

let passed = 0;
let failed = 0;
const pending: Array<{ d: string; fn: () => Promise<void> | void }> = [];
function test(d: string, fn: () => Promise<void> | void) { pending.push({ d, fn }); }
function eq(actual: unknown, expected: unknown, what = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${what}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function ok(cond: unknown, what: string) { if (!cond) throw new Error(what); }

type Rec = Record<string, unknown>;
const RUN2 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'quote-fidelity', 'run2-harvest.json'), 'utf8'));
const RUN2_CALLS: Rec[] = RUN2.toolCalls;
const SERVICE_ID = 'cmv5t9tgo009fyxghmn7axqse';
const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === 'object') { Object.freeze(o); for (const v of Object.values(o as Rec)) deepFreeze(v); }
  return o;
};
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

// ── producer-built failure fixtures ────────────────────────────────────────────────────────────────────────────────
const server = new EmbeddedMCPServer({ logLevel: 'error' });
const wrap = (result: unknown) => (server as unknown as { enhanceWithStructuredOutput: (r: unknown, t: string, a: unknown) => unknown })
  .enhanceWithStructuredOutput(result, 'services', { action: 'call' });

function rigService(overrides: Rec = {}): Rec {
  return {
    id: SERVICE_ID, name: 'observability-readonly', status: 'ACTIVE', endpoint: null, // no endpoint ⇒ the call try throws
    capabilities: { tools: ['stack_health', 'get_otel_config', 'get_ingress_config', 'get_prometheus_config'] },
    configuration: {}, isPublic: true, ...overrides,
  };
}
function makeHandler(service: Rec | null) {
  const prisma = {
    mCPTool: { findFirst: async () => service },
    activity: { create: async () => ({}) },
  };
  const utilities = { checkServiceAccess: async () => true, trackServiceInteraction: async () => undefined };
  return new ServiceCallHandler(prisma, utilities);
}
const ctxUser = { user: { id: 'user-test', email: 'owner@example.invalid', role: 'ADMIN' } };

/** Run one call through the REAL production path: gateway handler → EmbeddedMCPServer.callTool (its structured-output
 *  wrap) → mcpService.callEmbeddedTool (which REBUILDS `_meta`, panel CR-B1) → the loop's executeToolTurn (its catch path
 *  on a throw). The handler is installed as the embedded server's `services` implementation; userId 'system' keeps
 *  mcpService off the database. Returns the loop's ToolCallRecord. */
const emb = embeddedMCPServer as unknown as { isRunning: boolean; toolImplementations: Map<string, Function> };
emb.isRunning = true; // the server's own running flag (isReady() and callTool() both read it); no transport is started
async function recordFor(service: Rec | null, args: Rec): Promise<Rec> {
  const handler = makeHandler(service);
  emb.toolImplementations.set('services', (a: unknown) => handler.handle(a, ctxUser));
  const { toolCallRecords } = await executeToolTurn(
    [{ id: 'tu_1', name: 'services', arguments: JSON.stringify(args) }],
    {
      getToolDefinition: async () => ({ serverName: 'paichart' }),
      executeToolOnServer: async (_s: string, _t: string, a: unknown) =>
        (mcpService as unknown as { callEmbeddedTool: (t: string, a: unknown, o: Rec) => Promise<unknown> }).callEmbeddedTool('services', a, { userId: 'system' }),
      logger: { warn: () => undefined },
    },
    { executionId: 'exec-held-test', userId: 'user-test', turn: 1 },
  );
  return toolCallRecords[0] as unknown as Rec;
}

(async () => {
  // Producer outputs, built once.
  const failedOtel = await recordFor(rigService(), { action: 'call', targetService: 'observability-readonly', tool: 'get_otel_config', arguments: {} });
  const failedTypo = await recordFor(rigService(), { action: 'call', targetService: 'observability-readonly', tool: 'get_nginx_config', arguments: {} });
  const rateLimited = await (async () => {
    const svc = rigService({ configuration: { rateLimit: { requests: 1, windowMs: 60000 } } });
    await recordFor(svc, { action: 'call', targetService: 'observability-readonly', tool: 'get_otel_config', arguments: {} });
    return recordFor(svc, { action: 'call', targetService: 'observability-readonly', tool: 'get_otel_config', arguments: {} });
  })();
  const threwNotFound = await recordFor(null, { action: 'call', targetService: 'observability-readonly', tool: 'get_otel_config', arguments: {} });
  const threwUnparseable = await (async () => {
    const { toolCallRecords } = await executeToolTurn(
      [{ id: 'tu_x', name: 'services', arguments: '{"action":"call", not json' }],
      { getToolDefinition: async () => ({ serverName: 'paichart' }), executeToolOnServer: async () => ({}), logger: { warn: () => undefined } },
      { executionId: 'exec-held-test', userId: 'user-test', turn: 1 },
    );
    return toolCallRecords[0] as unknown as Rec;
  })();

  // ── producer shapes are what the plan says they are (guards the fixtures themselves) ──────────────────────────────
  test('producer (CR-B1): a failed call reaches the loop content-shaped + isError, with _meta REBUILT by mcpService — no gateway targetService', () => {
    const r = failedOtel.result as Rec;
    ok(failedOtel.success === true && r.isError === true, 'isError on a completed call');
    eq(((r.content as Rec[])[0]).type, 'text', 'content[0].type ');
    ok(String(((r.content as Rec[])[0]).text).includes('failed'), 'the gateway failure text');
    eq(Object.keys(r._meta as Rec).sort(), ['executionTime', 'serverName', 'toolName'], '_meta keys ');
  });
  test('producer: RATE_LIMITED reaches the loop the same way; the record holds PARSED arguments', () => {
    const r = rateLimited.result as Rec;
    ok(r.isError === true && String(((r.content as Rec[])[0]).text).includes('Rate Limit'), 'rate-limit text');
    ok(!('targetService' in (r._meta as Rec)), 'no targetService in _meta');
    ok(typeof rateLimited.arguments === 'object', 'arguments parsed');
  });
  test('producer: a gateway THROW (service not found) records success:false with the RAW argument string', () => {
    eq(threwNotFound.success, false);
    ok(typeof threwNotFound.arguments === 'string', 'raw string arguments');
    ok(String(threwNotFound.error).includes('not found'), 'not-found error');
  });

  // ── success shape: the run2 production specimen ────────────────────────────────────────────────────────────────
  test('run2 (six calls): 3 files, 0 refusals — calls 0 and 3–5 yield nothing (closed-world table)', () => {
    const r = extractDeclaredFiles(deepFreeze(clone(RUN2_CALLS)));
    eq(r.files.length, 3, 'files ');
    eq(r.refusals.length, 0, 'refusals ');
    eq(r.files.map((f) => [f.toolCallIndex, f.selector, f.target, f.path]), [
      // the service's own key order (operator-access first in this specimen) — the extractor never re-sorts
      [1, '/structuredContent/files/operator-access.conf', 'obs-ingress', '/etc/nginx/conf.d/operator-access.conf'],
      [1, '/structuredContent/files/otlp-ingress.conf', 'obs-ingress', '/etc/nginx/conf.d/otlp-ingress.conf'],
      [2, '/structuredContent/yaml', 'obs-otelcol', '/etc/otelcol/config.yaml'],
    ]);
    ok(r.files.every((f) => f.serviceId === SERVICE_ID && f.identitySource === 'envelope'), 'serviceId from the envelope');
    ok(r.files.every((f) => f.declaredBy === 'platform-default' && f.descriptorVersion === 1), 'declaredBy/version');
  });
  test('run2: the captured text is the RAW structuredContent string, byte for byte (no R9, no truncation)', () => {
    const r = extractDeclaredFiles(RUN2_CALLS);
    for (const f of r.files) {
      const data = ((RUN2_CALLS[f.toolCallIndex].result as Rec).content as Rec[])[0].data as Rec;
      eq(f.text, resolveJsonPointer(data.result, f.selector), `${f.selector} `);
    }
  });
  test('JSON Pointer re-extraction (BC-A4): every selector resolves back to its leaf, incl. dotted keys and ~1', () => {
    const r = extractDeclaredFiles(RUN2_CALLS);
    for (const f of r.files) {
      const data = ((RUN2_CALLS[f.toolCallIndex].result as Rec).content as Rec[])[0].data as Rec;
      ok(typeof resolveJsonPointer(data.result, f.selector) === 'string', f.selector);
    }
    const root = { structuredContent: { files: { 'a/b.conf': 'x', 'c~d.conf': 'y' } } };
    eq(resolveJsonPointer(root, toJsonPointer(['structuredContent', 'files', 'a/b.conf'])), 'x');
    eq(resolveJsonPointer(root, toJsonPointer(['structuredContent', 'files', 'c~d.conf'])), 'y');
    eq(toJsonPointer(['structuredContent', 'files', 'a/b.conf']), '/structuredContent/files/a~1b.conf');
  });
  test('input is never mutated (extractor runs over a deep-frozen copy without throwing)', () => {
    const frozen = deepFreeze(clone(RUN2_CALLS));
    extractDeclaredFiles(frozen);
  });

  // ── failure shapes, from the producers ─────────────────────────────────────────────────────────────────────────
  test('SERVICE_CALL_FAILED on a declared file tool ⇒ is-error {level: envelope}, identity from the ARGUMENTS (as production records it)', () => {
    const r = extractDeclaredFiles([failedOtel]);
    eq(r.files.length, 0);
    eq(r.refusals.map((x) => [x.refusal, x.detail, x.identitySource, x.serviceId, x.serviceName, x.sourceTool]),
      [['is-error', { level: 'envelope' }, 'arguments', null, 'observability-readonly', 'get_otel_config']]);
  });
  test('DEFENSIVE gateway-meta: an envelope that DOES carry _meta.targetService / requestedTool is identified by them (unreachable today)', () => {
    const rec = clone(failedOtel);
    (rec.result as Rec)._meta = { targetService: 'observability-readonly', requestedTool: 'get_ingress_config' };
    eq(extractDeclaredFiles([rec]).refusals.map((x) => [x.identitySource, x.sourceTool]), [['gateway-meta', 'get_ingress_config']]);
  });
  test('a FAILED call that names the service by REGISTRY ID ⇒ nothing recorded, stats.failedUnmatched (context, CR-B1)', async () => {
    const byId = await recordFor(rigService(), { action: 'call', targetService: SERVICE_ID, tool: 'get_otel_config', arguments: {} });
    const r = extractDeclaredFiles([byId]);
    eq([r.refusals.length, r.files.length, r.stats.failedUnmatched], [0, 0, 1]);
  });
  test('RATE_LIMITED ⇒ is-error {level: envelope}, identity from the call\'s own arguments', () => {
    const r = extractDeclaredFiles([rateLimited]);
    eq(r.refusals.map((x) => [x.refusal, x.detail, x.identitySource, x.serviceId]),
      [['is-error', { level: 'envelope' }, 'arguments', null]]);
  });
  test('a gateway THROW ⇒ is-error {level: threw}, identity parsed from the RAW argument string (BC-A10)', () => {
    const r = extractDeclaredFiles([threwNotFound]);
    eq(r.refusals.map((x) => [x.refusal, x.detail, x.identitySource, x.serviceName, x.sourceTool]),
      [['is-error', { level: 'threw' }, 'arguments', 'observability-readonly', 'get_otel_config']]);
  });
  test('a services discover/health call is counted notACall, never unidentified (CR-N4)', () => {
    const rec = { tool: 'services', success: true, arguments: { action: 'discover', capability: 'x' }, result: { content: [] } };
    const r = extractDeclaredFiles([rec]);
    eq([r.stats.notACall, r.stats.unidentified], [1, 0]);
  });
  test('the descriptor table is DEEP-frozen (CR-N5)', () => {
    ok(Object.isFrozen(PLATFORM_DEFAULT_DESCRIPTORS[0]) && Object.isFrozen(PLATFORM_DEFAULT_DESCRIPTORS[0].files), 'entries and files frozen');
  });
  test('unparseable raw arguments ⇒ nothing recorded, stats.unidentified', () => {
    const r = extractDeclaredFiles([threwUnparseable]);
    eq([r.files.length, r.refusals.length, r.stats.unidentified], [0, 0, 1]);
  });
  test('producer: an agent\'s tool-name typo is BLOCKED by the compliance policy before the rig — a THROW, not a rig reply', () => {
    // The plan (arch D-1) assumed the gateway passes an unknown tool to the rig (validateToolArguments returns early).
    // At HEAD the compliance policy runs first and refuses a tool not registered with the service, so the loop records
    // success:false with the raw argument string. The extractor outcome is the same — no row — via the `threw` path.
    eq(failedTypo.success, false);
    ok(String(failedTypo.error).includes('compliance policy'), String(failedTypo.error));
  });
  test('a FAILED call to a tool absent from the table (agent typo) ⇒ no row, stats.undeclaredFailed (arch D-1)', () => {
    const r = extractDeclaredFiles([failedTypo]);
    eq([r.refusals.length, r.stats.undeclaredFailed], [0, 1]);
  });
  test('a SUCCESSFUL call to a tool absent from the table ⇒ not-declared (the rig grew a tool)', () => {
    const rec = clone(RUN2_CALLS[3]);
    ((rec.result as Rec).content as Rec[])[0].data = { ...(((rec.result as Rec).content as Rec[])[0].data as Rec), tool: 'get_new_thing' };
    const r = extractDeclaredFiles([rec]);
    eq(r.refusals.map((x) => [x.refusal, x.sourceTool, x.identitySource]), [['not-declared', 'get_new_thing', 'envelope']]);
  });
  test('a FAILED stack_health (notAFile) writes nothing — errors are checked only for declared file tools', async () => {
    const rec = await recordFor(rigService(), { action: 'call', targetService: 'observability-readonly', tool: 'stack_health', arguments: {} });
    ok(rec.success === true && (rec.result as Rec).isError === true, 'a real failed stack_health');
    eq(extractDeclaredFiles([rec]).refusals.length, 0);
  });
  test('get_prometheus_config (notAFile) ⇒ nothing; a service with no descriptors ⇒ nothing (call 0)', () => {
    const rec = clone(RUN2_CALLS[3]);
    ((rec.result as Rec).content as Rec[])[0].data = { ...(((rec.result as Rec).content as Rec[])[0].data as Rec), tool: 'get_prometheus_config' };
    eq(extractDeclaredFiles([rec, RUN2_CALLS[0]]).refusals.length, 0);
  });
  test('levels inner and structured from the result itself', () => {
    const inner = clone(RUN2_CALLS[2]);
    ((((inner.result as Rec).content as Rec[])[0].data as Rec).result as Rec).isError = true;
    const structured = clone(RUN2_CALLS[2]);
    ((((structured.result as Rec).content as Rec[])[0].data as Rec).result as Rec).structuredContent = { success: false };
    eq(extractDeclaredFiles([inner, structured]).refusals.map((x) => x.detail), [{ level: 'inner' }, { level: 'structured' }]);
  });

  test('the table is keyed on (service, tool): a get_otel_config on ANOTHER service yields nothing', () => {
    const rec = clone(RUN2_CALLS[2]);
    ((rec.result as Rec).content as Rec[])[0].data = { ...(((rec.result as Rec).content as Rec[])[0].data as Rec), targetService: 'other-service' };
    const r = extractDeclaredFiles([rec]);
    eq([r.files.length, r.refusals.length], [0, 0]);
  });
  test('keyed on BOTH service and tool: a planted second service whose get_otel_config is notAFile yields nothing', () => {
    const rec = clone(RUN2_CALLS[2]);
    ((rec.result as Rec).content as Rec[])[0].data = { ...(((rec.result as Rec).content as Rec[])[0].data as Rec), targetService: 'other-rig' };
    const table = [...PLATFORM_DEFAULT_DESCRIPTORS,
      { descriptorVersion: 1, service: 'other-rig', tool: 'get_otel_config', notAFile: 'planted: same tool name, not a file here' }];
    const r = extractDeclaredFiles([rec], table);
    eq([r.files.length, r.refusals.length], [0, 0]);
  });
  test('an argument source reads data.arguments (what the gateway normalised and the service received), never the raw string (BC-A5)', () => {
    const rec = clone(RUN2_CALLS[2]);
    const data = ((rec.result as Rec).content as Rec[])[0].data as Rec;
    data.arguments = { device: 'edge-1' };
    (rec.arguments as Rec).arguments = '{"device":"WRONG"}'; // the agent's text — must not be read
    const table = [{ descriptorVersion: 1, service: 'observability-readonly', tool: 'get_otel_config',
      files: [{ select: 'structuredContent.yaml', target: { argument: 'device' }, path: { const: '/etc/otelcol/config.yaml' } }] }];
    const r = extractDeclaredFiles([rec], table);
    eq(r.files.map((f) => f.target), ['edge-1']);
  });
  test('not-declared rows carry the table version they were judged against', () => {
    const rec = clone(RUN2_CALLS[3]);
    ((rec.result as Rec).content as Rec[])[0].data = { ...(((rec.result as Rec).content as Rec[])[0].data as Rec), tool: 'get_new_thing' };
    eq(extractDeclaredFiles([rec]).refusals.map((x) => x.descriptorVersion), [1]);
  });

  // ── digest keys, mismatch, unsafe paths ────────────────────────────────────────────────────────────────────────
  test('digest family: contentSha256, sha-256, fileHash, sha512, content_md5, etag, checksum match; others do not', () => {
    eq(['contentSha256', 'sha-256', 'fileHash', 'sha512', 'content_md5', 'etag', 'checksum', 'Digest', 'shadow', 'name', 'yaml'].map(digestFamily),
      ['sha256', 'sha256', 'hash', 'sha512', 'md5', 'etag', 'checksum', 'digest', null, null, null]);
  });
  test('a contentSha256 key under structuredContent ⇒ raw-digest-present (family token, never the value)', () => {
    const rec = clone(RUN2_CALLS[2]);
    const sc = (((((rec.result as Rec).content as Rec[])[0].data as Rec).result as Rec).structuredContent as Rec);
    sc.contentSha256 = 'f'.repeat(64);
    const r = extractDeclaredFiles([rec]);
    eq(r.refusals.map((x) => [x.refusal, x.detail]), [['raw-digest-present', { field: 'sha256' }]]);
    ok(!JSON.stringify(r).includes('f'.repeat(64)), 'the digest value must appear nowhere in the output');
  });
  test('a FILE named "digest" under files ⇒ held, not a digest refusal (selector keys excluded)', () => {
    const rec = clone(RUN2_CALLS[1]);
    const sc = (((((rec.result as Rec).content as Rec[])[0].data as Rec).result as Rec).structuredContent as Rec);
    (sc.files as Rec).digest = 'server { listen 81; }\n';
    const r = extractDeclaredFiles([rec]);
    eq([r.refusals.length, r.files.length], [0, 3]);
  });
  test('structuredContent.yaml as a number ⇒ descriptor-mismatch (never coerced)', () => {
    const rec = clone(RUN2_CALLS[2]);
    ((((((rec.result as Rec).content as Rec[])[0].data as Rec).result as Rec).structuredContent as Rec)).yaml = 42;
    eq(extractDeclaredFiles([rec]).refusals.map((x) => [x.refusal, x.detail]), [['descriptor-mismatch', { reason: 'not-a-string' }]]);
  });
  test('ingress keys "a\\u0000.conf" and "../x.conf" ⇒ path-invalid with path and target null', () => {
    const rec = clone(RUN2_CALLS[1]);
    const sc = (((((rec.result as Rec).content as Rec[])[0].data as Rec).result as Rec).structuredContent as Rec);
    sc.files = { 'a\u0000.conf': 'x\n', '../x.conf': 'y\n' };
    const r = extractDeclaredFiles([rec]);
    eq(r.refusals.map((x) => [x.refusal, x.path, x.target, x.detail]),
      [['path-invalid', null, null, { field: 'path' }], ['path-invalid', null, null, { field: 'path' }]]);
    // CR-B2: an unbindable KEY is never stored — its row points at the parent map; a bindable bad path keeps its pointer
    eq(r.refusals.map((x) => x.selector), ['/structuredContent/files', '/structuredContent/files/..~1x.conf']);
  });

  // ── closed-world table, lane equivalence, statics ──────────────────────────────────────────────────────────────
  test('closed-world (BC-A2): the observability-readonly tool set equals the rig source\'s @mcp.tool() functions', () => {
    const rigSrc = path.join(__dirname, '..', '.claude', 'knowledge', 'pipelines', 'observability',
      'phase4-promstack-rig', 'obs-mcp-readonly', 'server.py');
    // The rig source is private (pipelines/observability never exports). In the PUBLIC repo this one pin has nothing to
    // compare against: skip it BY NAME there. In the private source (cline_docs present) a missing rig file still FAILS.
    const isPrivateSource = fs.existsSync(path.join(__dirname, '..', 'cline_docs'));
    if (!isPrivateSource && !fs.existsSync(rigSrc)) {
      console.log('   ⏭️  SKIPPED (named): closed-world rig pin — the rig source is private and absent in this checkout');
      return;
    }
    const src = fs.readFileSync(rigSrc, 'utf8');
    const rigTools = [...src.matchAll(/@mcp\.tool\(\)[^\n]*\n(?:\s*@[^\n]*\n)*\s*(?:async\s+)?def\s+(\w+)/g)].map((m) => m[1]).sort();
    const table = PLATFORM_DEFAULT_DESCRIPTORS.filter((d) => d.service === 'observability-readonly').map((d) => d.tool).sort();
    eq(rigTools.length, 10, 'rig tool count ');
    eq(table, rigTools, 'table vs rig ');
  });
  test('lane equivalence: FILE_ARTIFACT_TOOLS deep-equals [ingress, otel] IN THAT ORDER', () => {
    // ORDER MATTERS: scoreHarvesterQuotes builds byTool in RECORDED_FILE_TOOLS order (scripts/leg-replay-lab/
    // score-quote.ts:89; recorded-tools.ts spreads this export) and the last pairable tool's score wins. "Fixing" this
    // pin to another order silently moves the strict scorer (panel EF S-1).
    eq([...FILE_ARTIFACT_TOOLS], ['get_ingress_config', 'get_otel_config']);
    eq([...FILE_DESCRIPTOR_TOOLS], ['get_ingress_config', 'get_otel_config']);
  });
  test('lane equivalence: laneOf unchanged over every document of every quote-fidelity fixture', () => {
    const frozenLaneOf = (doc: { tool: string; path: string }) => {
      const leaf = doc.tool.split('.').pop() ?? '';
      if (['get_ingress_config', 'get_otel_config'].includes(leaf)) return 'file-artifact';
      if (/(^|\.)files\./.test(doc.path)) return 'file-artifact';
      return 'other';
    };
    const dir = path.join(__dirname, 'fixtures', 'quote-fidelity');
    const { extractRawToolDocuments } = require('../lib/agents/harness/raw-tool-witness');
    let n = 0;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const spec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      for (const doc of extractRawToolDocuments(spec.toolCalls || [])) { eq(laneOf(doc), frozenLaneOf(doc), `${f} ${doc.tool} `); n++; }
    }
    ok(n > 0, 'no documents compared');
  });
  test('static (SF-2): extract.ts imports nothing from R9 and never reads R9 sibling fields or a pager stash', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'agents', 'harness', 'held-bytes', 'extract.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    ok(!src.includes('sanitize-chained-output'), 'R9 import');
    for (const f of ['.rewritten', '.sanitized', '.rewriteClasses', 'pager', 'resultTruncatedForLlm']) ok(!code.includes(f), `reads ${f}`);
  });

  // ═══════════════════════════════ WI-4: the capture helper (two halves) ═══════════════════════════════════════════
  const withFlag = async <T>(value: string | undefined, fn: () => Promise<T> | T): Promise<T> => {
    const prev = process.env.HELD_BYTES_CAPTURE_ENABLED;
    if (value === undefined) delete process.env.HELD_BYTES_CAPTURE_ENABLED; else process.env.HELD_BYTES_CAPTURE_ENABLED = value;
    try { return await fn(); } finally {
      if (prev === undefined) delete process.env.HELD_BYTES_CAPTURE_ENABLED; else process.env.HELD_BYTES_CAPTURE_ENABLED = prev;
    }
  };
  type Op = { op: string; q?: any };
  const mockDb = (opts: { upsertThrows?: boolean; legs?: unknown[] } = {}) => {
    const ops: Op[] = [];
    return {
      ops,
      db: {
        $queryRaw: async (q: any) => { ops.push({ op: '$queryRaw', q }); return (opts.legs ?? [{ legTaskId: 'leg1', rootTaskId: 'root1' }]) as any; },
        $executeRaw: async (q: any) => {
          ops.push({ op: '$executeRaw', q });
          if (opts.upsertThrows) throw Object.assign(new Error('ERROR: duplicate DETAIL: Key (scope, sha256)=(p, ' + 'e'.repeat(64) + ')'), { name: 'PrismaClientKnownRequestError', code: 'P2010', meta: { code: '21000', message: 'DETAIL: Key (scope, sha256)=(p, x)' } });
          return 1;
        },
      },
    };
  };
  const warns: Array<{ o: Record<string, unknown>; m: string }> = [];
  const logger = { warn: (o: Record<string, unknown>, m: string) => { warns.push({ o, m }); }, info: () => undefined };
  const TASK = { id: 'cmtaskHB', povId: 'cmpovHB' };
  const runBoth = async (records: unknown[], dbo = mockDb(), task = TASK) => {
    const plan = prepareHeldCapture({ toolCallResults: records, task, logger });
    const batch = await captureHeldFiles(dbo.db as any, { executionId: 'cmexecHB', taskId: task.id, plan, logger });
    return { plan, batch, ops: dbo.ops };
  };
  const ingressWith = (files: Record<string, unknown>) => {
    const rec = clone(RUN2_CALLS[1]);
    (((((rec.result as Rec).content as Rec[])[0].data as Rec).result as Rec).structuredContent as Rec).files = files;
    return rec;
  };

  test('switch: unset / "false" / "1" ⇒ prepareHeldCapture returns null; captureHeldFiles(null) makes ZERO db calls', async () => {
    for (const v of [undefined, 'false', '1', 'TRUE']) {
      await withFlag(v, async () => {
        const { plan, batch, ops } = await runBoth(RUN2_CALLS);
        ok(plan === null && batch === null && ops.length === 0, `flag ${v}: plan ${JSON.stringify(plan)?.slice(0, 40)} ops ${ops.length}`);
      });
    }
  });
  test('no declared call ⇒ null, zero db calls', async () => {
    await withFlag('true', async () => {
      const { plan, ops } = await runBoth([RUN2_CALLS[0], RUN2_CALLS[3]]);
      ok(plan === null && ops.length === 0, 'no work');
    });
  });
  test('run2, flag on ⇒ 3 refs, 0 refusals; ONE $executeRaw (the upsert) + ONE $queryRaw (legs); VALUES sorted + unique', async () => {
    await withFlag('true', async () => {
      const { batch, ops } = await runBoth(RUN2_CALLS);
      ok(batch && batch.refs.length === 3 && batch.refusals.length === 0, JSON.stringify(batch?.stats));
      eq(ops.map((o) => o.op), ['$queryRaw', '$executeRaw'], 'ops ');
      const v = ops[1].q.values as unknown[];
      const keys: string[] = [];
      for (let i = 0; i < v.length; i += 4) keys.push(`${v[i]}|${v[i + 1]}`);
      eq(keys, [...new Set(keys)].sort(), 'sorted, unique ');
      ok(batch!.refs.every((r) => r.legTaskId === 'leg1' && r.rootTaskId === 'root1' && r.kind === 'CAPTURE'), 'leg/root/kind');
      ok(batch!.refs.every((r) => r.redactorVersion === 'paichart.r10/2' && r.hashBasis === 'legacy-decoded-text'), 'facts');
    });
  });
  test('the leg/root SELECT uses the SHARED owning-leg predicate (protocol conjunct on both joins)', async () => {
    await withFlag('true', async () => {
      const { ops } = await runBoth(RUN2_CALLS);
      const sql: string = ops[0].q.sql;
      ok((sql.match(/metadata->>'protocol' IS NOT NULL/g) || []).length === 2, sql);
      ok(/leg\.type = 'PIPELINE'/.test(sql) && /root\.type = 'PIPELINE'/.test(sql), sql);
    });
  });
  test('leg lookup ambiguous / empty ⇒ legTaskId and rootTaskId null, refs still written', async () => {
    await withFlag('true', async () => {
      for (const legs of [[], [{ legTaskId: 'a', rootTaskId: null }, { legTaskId: 'b', rootTaskId: null }]]) {
        const { batch } = await runBoth(RUN2_CALLS, mockDb({ legs }));
        ok(batch!.refs.length === 3 && batch!.refs.every((r) => r.legTaskId === null && r.rootTaskId === null), JSON.stringify(legs));
      }
    });
  });
  test('povId null ⇒ ONE no-scope row PER CALL carrying its file count, ZERO upserts (code review AE SF-1)', async () => {
    await withFlag('true', async () => {
      const { batch, ops } = await runBoth(RUN2_CALLS, mockDb(), { id: 't', povId: null as unknown as string });
      eq(batch!.refusals.map((r) => [r.refusal, r.toolCallIndex, r.detail, r.selector]), [['no-scope', 1, { files: 2 }, null], ['no-scope', 2, { files: 1 }, null]]);
      ok(!ops.some((o) => o.op === '$executeRaw'), 'no upsert');
    });
  });
  test('povId null + 10,000 files over two calls ⇒ exactly TWO rows (the no-scope branch is bounded too)', async () => {
    await withFlag('true', async () => {
      const files = (n: number, p: string) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${p}${i}.conf`, `f${i}\n`]));
      const { batch } = await runBoth([ingressWith(files(5000, 'a')), ingressWith(files(5000, 'b'))], mockDb(), { id: 't', povId: null as unknown as string });
      eq(batch!.refusals.map((r) => (r.detail as any).files), [5000, 5000]);
    });
  });
  test('upsert throws ⇒ 0 refs, store-error × 3 with detail {class: db}, resolves; the warn carries no DETAIL', async () => {
    await withFlag('true', async () => {
      warns.length = 0;
      const { batch } = await runBoth(RUN2_CALLS, mockDb({ upsertThrows: true }));
      ok(batch!.refs.length === 0, 'refs');
      eq(batch!.refusals.map((r) => [r.refusal, r.detail]), [['store-error', { class: 'db' }], ['store-error', { class: 'db' }], ['store-error', { class: 'db' }]]);
      ok(!/DETAIL|Key \(/.test(JSON.stringify(warns)), 'DETAIL leaked into a log');
    });
  });
  test('an injected throw in the pure half ⇒ null, ONE content-free warn; in the I/O half ⇒ { refs: [], refusals: [] }', async () => {
    await withFlag('true', async () => {
      warns.length = 0;
      const poisoned = [new Proxy({}, { get: () => { throw Object.assign(new Error('boom secret-ish text'), { code: 'X1' }); } })];
      const plan = prepareHeldCapture({ toolCallResults: poisoned as unknown[], task: TASK, logger });
      ok(plan === null && warns.length === 1 && !JSON.stringify(warns).includes('secret-ish'), JSON.stringify(warns));
      // Key allowlist (an Error object stringifies to {} and would hide a raw `err` from the substring check).
      const allowed = new Set(['code', 'metaCode', 'name', 'durationMs', 'executionId', 'files', 'refs', 'invalidRows', 'held', 'refused']);
      ok(Object.keys(warns[0].o).every((k) => allowed.has(k)), `warn keys: ${Object.keys(warns[0].o).join(',')}`);
      const p2 = prepareHeldCapture({ toolCallResults: RUN2_CALLS, task: TASK, logger })!;
      const throwingDb = { $queryRaw: async () => [{ legTaskId: 'l', rootTaskId: null }], $executeRaw: async () => 1 };
      const bad = { ...p2, files: null as unknown as [] }; // corrupt plan ⇒ throws inside the I/O half
      const b = await captureHeldFiles(throwingDb as any, { executionId: 'e', taskId: 't', plan: bad, logger });
      ok(b !== null && b.refs.length === 0 && b.refusals.length === 0, JSON.stringify(b));
    });
  });
  test('per-row validator: a row with a NUL-bearing required column is DROPPED and counted, never nulled', async () => {
    await withFlag('true', async () => {
      const p2 = prepareHeldCapture({ toolCallResults: RUN2_CALLS, task: TASK, logger })!;
      p2.files[0] = { ...p2.files[0], serviceName: 'observability\u0000readonly' };
      const b = await captureHeldFiles(mockDb().db as any, { executionId: 'e', taskId: 't', plan: p2, logger });
      ok(b!.refs.length === 2 && b!.stats.invalidRows === 1, JSON.stringify(b!.stats));
      ok(b!.refs.every((r) => typeof r.serviceName === 'string' && !r.serviceName.includes('\u0000')), 'no NUL reaches createMany');
    });
  });
  test('CR-B2 helper level: a NUL-key path-invalid refusal LANDS as one row (invalidRows 0), never dropped by the validator', async () => {
    await withFlag('true', async () => {
      const { batch } = await runBoth([ingressWith({ 'a\u0000.conf': 'x\n' })]);
      eq([batch!.refusals.map((r) => [r.refusal, r.selector]), batch!.stats.invalidRows ?? 0],
        [[['path-invalid', '/structuredContent/files']], 0]);
    });
  });
  test('SF-V1: an OVERLONG file key (2,100 chars) still lands its path-invalid row (parent pointer), invalidRows 0', async () => {
    await withFlag('true', async () => {
      const { batch } = await runBoth([ingressWith({ ['k'.repeat(2100) + '.conf']: 'x\n' })]);
      eq([batch!.refusals.map((r) => [r.refusal, r.selector]), batch!.stats.invalidRows ?? 0], [[['path-invalid', '/structuredContent/files']], 0]);
    });
  });
  test('SF-V2: a sha key with 300 digits ⇒ raw-digest-present with the CLOSED token "sha" (bindable), invalidRows 0', async () => {
    await withFlag('true', async () => {
      const rec = clone(RUN2_CALLS[2]);
      (((((rec.result as Rec).content as Rec[])[0].data as Rec).result as Rec).structuredContent as Rec)['sha' + '1'.repeat(300)] = 'x';
      const { batch } = await runBoth([rec]);
      eq([batch!.refusals.map((r) => [r.refusal, r.detail]), batch!.stats.invalidRows ?? 0], [[['raw-digest-present', { field: 'sha' }]], 0]);
    });
  });
  test('SF-V3: TAB, ESC, C1, U+2028, a bidi override, an empty or "." segment in a path ⇒ path-invalid (R9-safe rendering)', async () => {
    await withFlag('true', async () => {
      for (const key of ['a\tb.conf', 'a\u001bb.conf', 'a\u0085b.conf', 'a\u2028b.conf', 'a\u202eb.conf', '.']) {
        const { batch } = await runBoth([ingressWith({ [key]: 'x\n' })]);
        eq(batch!.refusals.map((r) => r.refusal), ['path-invalid'], `${JSON.stringify(key)} `);
      }
    });
  });
  test('arch S1: the context counters are LOGGED even when nothing is held', async () => {
    await withFlag('true', async () => {
      const infos: Array<Record<string, unknown>> = [];
      const lg = { warn: () => undefined, info: (o: Record<string, unknown>) => { infos.push(o); } };
      prepareHeldCapture({ toolCallResults: [failedTypo], task: TASK, logger: lg });
      ok(infos.some((o) => (o.stats as any)?.undeclaredFailed === 1), JSON.stringify(infos));
    });
  });
  test('batch guard: a ref whose blob was not written ⇒ refsAllWritten false (the whole batch would drop)', () => {
    const ref = { scope: 'p', blobSha256: 'a'.repeat(64) } as any;
    ok(refsAllWritten([ref], new Set(['p\u0001' + 'a'.repeat(64)])), 'written ⇒ true');
    ok(!refsAllWritten([ref], new Set()), 'not written ⇒ false');
  });
  test('precedence: over-cap (pre-R10, R10 never runs) > NUL > lone surrogate > CR > BOM; detail.bytes = pre-R10 length', async () => {
    await withFlag('true', async () => {
      const r10 = require('../lib/agents/harness/redact-artifact-secrets');
      const orig = r10.redactArtifactSecrets;
      let r10Calls = 0;
      r10.redactArtifactSecrets = (t: string) => { r10Calls++; return orig(t); };
      try {
        const big = 'x'.repeat(5 * 1024 * 1024 + 1);
        const { batch } = await runBoth([ingressWith({ 'a.conf': big + '\u0000' })]);
        eq(batch!.refusals.map((r) => [r.refusal, r.detail]), [['over-cap', { capScope: 'file', bytes: Buffer.byteLength(big + '\u0000') }]]);
        eq(r10Calls, 0, 'R10 calls on an oversize file ');
      } finally { r10.redactArtifactSecrets = orig; }
      const cases: Array<[string, string]> = [['a\u0000b\ud800\r', 'nul-byte'], ['a\ud800\r', 'lone-surrogate'], ['\ufeffa\r\n', 'decode-violated'], ['\ufeffa\n', 'legacy-bom']];
      for (const [text, name] of cases) {
        const { batch } = await runBoth([ingressWith({ 'a.conf': text })]);
        eq(batch!.refusals.map((r) => r.refusal), [name], `${JSON.stringify(text)} `);
      }
    });
  });
  test('execution cap: four ~4.5 MB files ⇒ the 4th crosses 16 MB and is refused capScope execution; never truncated', async () => {
    await withFlag('true', async () => {
      const f = 'y'.repeat(4.5 * 1024 * 1024);
      const { batch } = await runBoth([ingressWith({ 'a.conf': f, 'b.conf': f, 'c.conf': f, 'd.conf': f })]);
      ok(batch!.refs.length === 3, `refs ${batch!.refs.length}`);
      eq(batch!.refusals.map((r) => [r.refusal, (r.detail as any).capScope]), [['over-cap', 'execution']]);
    });
  });
  test('file-count cap (AE S2): 10,000 tiny files over two calls ⇒ ≤ 256 refs, ONE over-cap count row per call, one upsert', async () => {
    await withFlag('true', async () => {
      const files = (n: number, p: string) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${p}${i}.conf`, `f${p}${i}\n`]));
      const { batch, ops } = await runBoth([ingressWith(files(5000, 'a')), ingressWith(files(5000, 'b'))]);
      ok(batch!.refs.length === 256, `refs ${batch!.refs.length}`);
      const counts = batch!.refusals.filter((r) => (r.detail as any)?.capScope === 'count');
      eq(counts.map((r) => (r.detail as any).files), [4744, 5000], 'per-call collapsed counts ');
      eq(ops.filter((o) => o.op === '$executeRaw').length, 1, 'upsert statements ');
    });
  });
  test('R10 timing (AE N2): a 5 MB file of near-miss secret-shaped lines through the pure half in < 2 s', async () => {
    await withFlag('true', async () => {
      const line = 'snmp-server communiti public RO password_hint: none secret_ish = 1\n';
      const text = line.repeat(Math.floor((5 * 1024 * 1024 - 1024) / line.length));
      const t0 = Date.now();
      const plan = prepareHeldCapture({ toolCallResults: [ingressWith({ 'a.conf': text })], task: TASK, logger });
      const ms = Date.now() - t0;
      ok(plan !== null && ms < 2000, `took ${ms} ms`);
    });
  });
  test('NFKC-rewritable text (full-width, ellipsis, NBSP) is held BYTE FOR BYTE — the raw record, never R9 output (SF-2)', async () => {
    await withFlag('true', async () => {
      const text = 'server_name ｅｘａｍｐｌｅ… \u00a0;\n';
      const plan = prepareHeldCapture({ toolCallResults: [ingressWith({ 'a.conf': text })], task: TASK, logger })!;
      eq(plan.files[0].content, text);
    });
  });
  test('block Q (helper): V19 through the helper — sha256(C) appears NOWHERE in the batch; the token is gone', async () => {
    await withFlag('true', async () => {
      const C = 'auth:\n  bearer_token: ' + 'abcd' + 'efgh1234567890XYZ' + '\nnext: 1\n';
      const { batch } = await runBoth([ingressWith({ 'a.conf': C })]);
      const hashC = crypto.createHash('sha256').update(C, 'utf8').digest('hex');
      const ser = JSON.stringify(batch);
      ok(!ser.includes(hashC) && !ser.includes('abcdefgh1234567890XYZ') && batch!.refs[0].redactedCount >= 1, 'pre-R10 hash or token leaked');
    });
  });
  test('block Q (helper): R10 off ⇒ every ref stamps redactorVersion "none"', async () => {
    await withFlag('true', async () => {
      const prev = process.env.ARTIFACT_SECRET_REDACT_ENABLED;
      process.env.ARTIFACT_SECRET_REDACT_ENABLED = 'false';
      try {
        const { batch } = await runBoth(RUN2_CALLS);
        ok(batch!.refs.length === 3 && batch!.refs.every((r) => r.redactorVersion === 'none'), JSON.stringify(batch!.refs.map((r) => r.redactorVersion)));
      } finally { if (prev === undefined) delete process.env.ARTIFACT_SECRET_REDACT_ENABLED; else process.env.ARTIFACT_SECRET_REDACT_ENABLED = prev; }
    });
  });
  test('block Q (helper): V20 through the helper ⇒ escaped-secret-residual, NO ref', async () => {
    await withFlag('true', async () => {
      const C = 'body: "header line\\npassword: ' + 'hunter2' + 'secret' + '\\nmore"\nnext: 1\n';
      const { batch } = await runBoth([ingressWith({ 'a.conf': C })]);
      ok(batch!.refs.length === 0, 'no ref');
      eq(batch!.refusals.map((r) => r.refusal), ['escaped-secret-residual']);
    });
  });
  test('aliasing (D5): the REAL buildExecutionResultJson + stampExecutionNets run over DEEP-FROZEN records without a throw — as infra_state_harvester (the real obs role) too', async () => {
   for (const role of ['artifact_harvester', 'infra_state_harvester']) {
    const frozen = deepFreeze(clone(RUN2_CALLS));
    const nullDb: any = new Proxy({}, { get: () => new Proxy(() => undefined, { get: () => async () => null, apply: async () => [] }) });
    const rj = buildExecutionResultJson({
      taskId: 't', taskTitle: 'T', agentRole: role, modelUsed: 'm', finalResponse: 'done', confidenceScore: 80,
      turnCount: 1, maxToolTurns: 10, toolCallResults: frozen as any, successfulToolCalls: 6, failedToolCalls: 0,
      executionTime: 1, tokensUsed: 1, correctionTurnUsed: false,
    } as any);
    await stampExecutionNets(nullDb, { task: { id: 't', type: 'ACTION', metadata: {} }, agentRole: role, harnessMode: null,
      finalResponse: 'done', executionId: 'e', logger: { warn: () => undefined } }, rj);
   }
  });
  test('signature pin: captureHeldFiles never receives toolCallResults or resultJson; the plan type holds primitives only', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'services', 'held-bytes-capture.ts'), 'utf8');
    const sig = src.slice(src.indexOf('export async function captureHeldFiles'), src.indexOf('Promise<HeldCaptureBatch | null>'));
    ok(!/toolCallResults|resultJson/.test(sig), sig);
    const store = fs.readFileSync(path.join(__dirname, '..', 'lib', 'services', 'held-bytes-store.ts'), 'utf8');
    for (const iface of ['PlannedHeldFile', 'PlannedRefusal', 'HeldCapturePlan']) {
      const body = store.slice(store.indexOf(`export interface ${iface}`), store.indexOf('\n}', store.indexOf(`export interface ${iface}`)));
      const types = [...body.matchAll(/:\s*([^;]+);/g)].map((m) => m[1].trim());
      for (const t of types) ok(/^(string|number|boolean|null|PlannedHeldFile\[\]|PlannedRefusal\[\]|Record<string, (number|string \| number)>|string \| null|number \| null)$/.test(t), `${iface}: ${t}`);
    }
  });
  test('static: held-bytes-capture.ts imports nothing from R9 and reads no R9 sibling field', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'services', 'held-bytes-capture.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    ok(!src.includes('sanitize-chained-output'), 'R9 import');
    ok(!/\.(rewritten|sanitized|rewriteClasses)\b/.test(code), 'R9 sibling read');
  });

  for (const { d, fn } of pending) {
    try { await fn(); console.log(`✅ ${d}`); passed++; } catch (e) {
      console.error(`❌ ${d}`); if (e instanceof Error) console.error(`   Error: ${e.message}`); failed++;
    }
  }
  console.log(`\n📊 Total Tests:  ${passed + failed}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Total Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log('✅ All tests passed!');
  process.exit(0); // the gateway's connection pool arms a cleanup timer
})().catch((e) => { console.error('❌ harness crashed:', e); process.exit(1); });
