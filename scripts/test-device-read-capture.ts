/**
 * held-network step 3 batch 2b (P3 / P4) — the DEVICE-READ capture lane, end to end over the pure pieces: the declaration
 * (device-sources.ts) → the scope (device-read-scope.ts) → the extractor's device lane (extract.ts) → prepareHeldCapture (R10, caps).
 *
 * Fixtures are the REAL stored record shape: two `fetch_data getters:["config"]` calls from a production network Harvester
 * (scripts/fixtures/quote-fidelity/neg-net-harvest.json, already in the repo; lab devices, lab credentials only) — the host map
 * `structuredContent.hosts.<device>.output.config.{running,startup}`. Multi-host and bundled-getter shapes are built FROM those
 * records (hosts merged; a facts getter beside config), never invented from scratch.
 *
 * Run: npx ts-node -r tsconfig-paths/register scripts/test-device-read-capture.ts
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@127.0.0.1:5432/stub';
process.env.PAICHART_SKIP_DB_CONNECT = 'true';
process.env.HELD_BYTES_CAPTURE_ENABLED = 'true';
process.env.ARTIFACT_SECRET_REDACT_ENABLED = 'true';
import * as fs from 'fs';
import * as path from 'path';
import { extractDeclaredFiles, withDeviceEvidenceOnly } from '../lib/agents/harness/held-bytes/extract';
import { buildDeviceReadScope, declaredDevicesFor } from '../lib/agents/harness/held-bytes/device-read-scope';
import { resolveLegDeviceSources, buildDeviceSourcesSnapshot } from '../lib/agents/harness/device-sources';
import { prepareHeldCapture } from '../lib/services/held-bytes-capture';
import { PLATFORM_DEFAULT_DESCRIPTORS, DEVICE_READ_DESCRIPTORS, FILE_DESCRIPTOR_TOOLS } from '../lib/agents/harness/held-bytes/descriptors';
import { tableFromDeclarations } from '../lib/services/held-descriptor-table';
import { readLegDeviceSources } from '../lib/agents/harness/device-sources-read';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const he = require('../lib/mcp/server/config/held-eligibility.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const decl = require('../lib/mcp/server/config/held-file-declaration.js');

let passed = 0; let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`✅ ${name}`); } catch (e) { failed++; console.log(`❌ ${name}\n   ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

type Rec = Record<string, any>;
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/quote-fidelity/neg-net-harvest.json'), 'utf8')) as { toolCalls: Rec[] };
const configCalls = FIX.toolCalls.filter((t) => t.tool === 'services' && JSON.stringify(t.arguments).includes('"fetch_data"'));
const SVC = String(configCalls[0]?.result?.content?.[0]?.data?.targetService);
const SID = String(configCalls[0]?.result?.content?.[0]?.data?.metadata?.targetServiceId);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const hostsOf = (r: Rec) => r.result.content[0].data.result.structuredContent.hosts as Rec;
const DEV = Object.keys(hostsOf(configCalls[0]))[0];
const DEV2 = Object.keys(hostsOf(configCalls[1]))[0];
const others = FIX.toolCalls.filter((t) => t.tool === 'services' && !JSON.stringify(t.arguments).includes('"fetch_data"'));

const body = (lines: string[]) => `# Leg\n\n## Device sources\n${lines.map((l) => `- ${l}`).join('\n')}\n\nHarvest.\n`;
const scopeOf = (lines: string[] | null, records: Rec[], contract?: unknown) =>
  buildDeviceReadScope(resolveLegDeviceSources({ contractValue: contract, taskBody: lines ? body(lines) : 'no block' }), records);
const ext = (records: Rec[], lines: string[] | null, opts: Record<string, unknown> = {}) =>
  extractDeclaredFiles(records, undefined, { gitFileSourceLeg: true, deviceRead: scopeOf(lines, records), ...opts });
const outcomes = (x: ReturnType<typeof extractDeclaredFiles>) =>
  [...x.files.map((f) => `${f.toolCallIndex} held ${f.target} ${f.path} ${f.selector}`), ...x.refusals.map((r) => `${r.toolCallIndex} ${r.refusal} ${r.selector ?? ''}`)].sort();

(async () => {
  await test('F0 the fixture is the real shape: two single-host fetch_data config calls, hosts.<dev>.output.config.running a string', () => {
    assert(configCalls.length === 2, `config calls ${configCalls.length}`);
    for (const c of configCalls) for (const h of Object.values(hostsOf(c))) assert(typeof (h as Rec).output.config.running === 'string', 'running string');
    assert(DEV !== DEV2, 'two devices');
  });

  await test('C1 both devices declared device-read for the service ⇒ both configs held, target device:<host>, path /running-config, positional pointer', () => {
    const recs = [...others, ...configCalls];
    const x = ext(recs, [`${DEV}: device-read — service ${SVC}`, `${DEV2}: device-read — service ${SVC}`]);
    assert(x.files.length === 2 && x.refusals.length === 0, JSON.stringify(outcomes(x)));
    assert(x.files.every((f) => f.path === '/running-config' && /^device:/.test(f.target) && f.selector === `/structuredContent/hosts/${f.target.slice(7)}/output/config/running`
      && f.declaredBy === 'platform-default' && f.serviceId === SID), JSON.stringify(outcomes(x)));
    assert(x.stats.notAConfigRead === 0, 'no non-config fetch_data call in the fixture');
  });

  await test('C2 FAIL CLOSED: no block / unparseable / contract-vs-body conflict ⇒ nothing held, ONE named call-level refusal per config call', () => {
    const recs = [...configCalls];
    for (const [lines, contract, name] of [
      [null, undefined, 'device-sources-absent'],
      [[`${DEV}: device-read - service ${SVC}`], undefined, 'device-sources-unparseable'],
      [[`${DEV}: device-read — service ${SVC}`], { deviceSources: { 'network-provisioning': [`${DEV}: device-read — service other`] } }, 'device-sources-conflict'],
    ] as Array<[string[] | null, unknown, string]>) {
      const sc = buildDeviceReadScope(resolveLegDeviceSources({ contractValue: (contract as Rec | undefined)?.deviceSources?.['network-provisioning'], taskBody: lines ? body(lines) : 'x' }), recs);
      const x = extractDeclaredFiles(recs, undefined, { deviceRead: sc });
      assert(x.files.length === 0 && x.refusals.length === 2 && x.refusals.every((r) => r.refusal === name && r.selector === null), `${name}: ${JSON.stringify(outcomes(x))}`);
    }
    const could = buildDeviceReadScope({ state: 'could-not-check', grammarVersion: 1, reason: 'read-threw' }, recs);
    const y = extractDeclaredFiles(recs, undefined, { deviceRead: could });
    assert(y.files.length === 0 && y.refusals.every((r) => r.refusal === 'device-sources-unresolved'), JSON.stringify(outcomes(y)));
  });

  await test('C3 only one device declared ⇒ that one held; the other host refused device-not-declared (an undeclared read never becomes a base)', () => {
    const x = ext([...configCalls], [`${DEV}: device-read — service ${SVC}`, `${DEV2}: command-package`]);
    assert(x.files.length === 1 && x.files[0].target === `device:${DEV}`, JSON.stringify(outcomes(x)));
    assert(x.refusals.length === 1 && x.refusals[0].refusal === 'device-not-declared' && x.refusals[0].selector!.includes(DEV2), JSON.stringify(outcomes(x)));
  });

  await test('C4 a git-file line alone does NOT license a device read of that device (device-read only)', () => {
    const x = ext([...configCalls], [`${DEV}: git-file — service github-service ; acme/configs/${DEV}.cfg`, `${DEV2}: device-read — service ${SVC}`]);
    assert(x.files.length === 1 && x.files[0].target === `device:${DEV2}`, JSON.stringify(outcomes(x)));
    assert(x.refusals.some((r) => r.refusal === 'device-not-declared' && r.selector!.includes(DEV)), JSON.stringify(outcomes(x)));
  });

  await test('C5 SEVERAL HOSTS in one call ⇒ each declared host held, each undeclared host refused, in one call', () => {
    const merged = clone(configCalls[0]);
    Object.assign(hostsOf(merged), clone(hostsOf(configCalls[1])));
    hostsOf(merged)['sw-extra'] = clone(Object.values(hostsOf(configCalls[1]))[0]);
    const x = ext([merged], [`${DEV}: device-read — service ${SVC}`, `${DEV2}: device-read — service ${SVC}`]);
    assert(x.files.length === 2 && x.refusals.length === 1 && x.refusals[0].refusal === 'device-not-declared', JSON.stringify(outcomes(x)));
    assert(new Set(x.files.map((f) => f.toolCallIndex)).size === 1, 'one call');
  });

  await test('C6 a config read BUNDLED with other getters (L-N1 R-2) is captured; a call with no config output is not a config read (no row)', () => {
    const bundled = clone(configCalls[0]);
    const h = Object.values(hostsOf(bundled))[0] as Rec;
    h.output.facts = { hostname: DEV, vendor: 'x', interface_list: ['Ethernet1'] };
    h.output.interfaces = { Ethernet1: { is_up: true, mac_address: '00:00:00:00:00:01' } };
    const factsOnly = clone(configCalls[1]);
    const h2 = Object.values(hostsOf(factsOnly))[0] as Rec;
    h2.output = { facts: { hostname: DEV2 } };
    const x = ext([bundled, factsOnly], [`${DEV}: device-read — service ${SVC}`, `${DEV2}: device-read — service ${SVC}`]);
    assert(x.files.length === 1 && x.files[0].toolCallIndex === 0, JSON.stringify(outcomes(x)));
    assert(x.refusals.length === 0 && x.stats.notAConfigRead === 1, `${JSON.stringify(outcomes(x))} ${JSON.stringify(x.stats)}`);
  });

  await test('C7 the CLI-text tool and the inventory tool are never a device file; a failed getter call holds nothing and writes no row', () => {
    const x = ext([...others], [`${DEV}: device-read — service ${SVC}`, `${DEV2}: device-read — service ${SVC}`]);
    assert(x.files.length === 0 && x.refusals.length === 0, JSON.stringify(outcomes(x)));
    const failedCall = clone(configCalls[0]); failedCall.success = false;
    const y = ext([failedCall], [`${DEV}: device-read — service ${SVC}`]);
    assert(y.files.length === 0 && y.refusals.length === 0 && y.stats.deviceLaneFailed === 1, JSON.stringify(y.stats));
  });

  await test('C8 a service the block does not declare ⇒ device-service-not-declared (call level); a name, never the caller spelling', () => {
    const x = ext([...configCalls], [`${DEV}: device-read — service another-device-svc`]);
    assert(x.files.length === 0 && x.refusals.length === 2 && x.refusals.every((r) => r.refusal === 'device-service-not-declared'), JSON.stringify(outcomes(x)));
    const spelled = clone(configCalls[0]); spelled.arguments = { ...spelled.arguments, targetService: 'another-device-svc' };
    const y = ext([spelled], [`${DEV}: device-read — service another-device-svc`]);
    assert(y.refusals.length === 1 && y.refusals[0].refusal === 'device-service-not-declared', `the caller's spelling never matches: ${JSON.stringify(outcomes(y))}`);
  });

  await test('C9 a DESCRIPTOR-URL declaration matches the row THIS execution registered from that exact URL (by id); unregistered ⇒ unresolved', () => {
    const URL = 'https://example.invalid/descriptors/devices.json';
    const reg = { tool: 'registry', success: true, arguments: { action: 'register', descriptorUrl: URL },
      result: { content: [{ type: 'data', data: { success: true, serviceId: SID, serviceName: SVC } }] } };
    const recs = [reg, ...configCalls];
    const x = ext(recs, [`${DEV}: device-read — service ${URL}`, `${DEV2}: device-read — service ${URL}`]);
    assert(x.files.length === 2, JSON.stringify(outcomes(x)));
    const sc = scopeOf([`${DEV}: device-read — service ${URL}`], [...configCalls]);
    assert(sc.state === 'declared' && sc.unresolvedServices.length === 1 && declaredDevicesFor(sc, SVC, SID) === null, JSON.stringify(sc));
    const y = ext([...configCalls], [`${DEV}: device-read — service ${URL}`]);
    assert(y.files.length === 0 && y.refusals.every((r) => r.refusal === 'device-service-not-declared'), JSON.stringify(outcomes(y)));
    const otherId = clone(reg); otherId.result.content[0].data.serviceId = 'svc-someone-else';
    const z = ext([otherId, ...configCalls], [`${DEV}: device-read — service ${URL}`]);
    assert(z.files.length === 0, `a registration of another row never matches the call's resolved id: ${JSON.stringify(outcomes(z))}`);
  });

  await test('C10 an EMPTY running config for a declared device ⇒ device-config-empty ("the read returned no configuration")', () => {
    const e = clone(configCalls[0]); (Object.values(hostsOf(e))[0] as Rec).output.config.running = '';
    const x = ext([e], [`${DEV}: device-read — service ${SVC}`]);
    assert(x.files.length === 0 && x.refusals.length === 1 && x.refusals[0].refusal === 'device-config-empty', JSON.stringify(outcomes(x)));
  });

  await test('C11 NOT a Device-sources leg (no scope) ⇒ the device lane does not exist: identical to the pre-change extractor', () => {
    const recs = [...FIX.toolCalls];
    const x = extractDeclaredFiles(recs, undefined, { gitFileSourceLeg: true });
    assert(x.files.length === 0 && x.refusals.length === 0 && x.stats.notAConfigRead === 0, JSON.stringify(outcomes(x)));
    assert(JSON.stringify(PLATFORM_DEFAULT_DESCRIPTORS).indexOf('fetch_data') < 0, 'the name-keyed table never carries the device lane');
    assert(JSON.stringify(FILE_DESCRIPTOR_TOOLS) === JSON.stringify(['get_ingress_config', 'get_otel_config']), 'order-pinned lane list unchanged');
    assert(DEVICE_READ_DESCRIPTORS.length === 1 && DEVICE_READ_DESCRIPTORS[0].legScope === 'device-read', 'one device-lane entry');
  });

  await test('C12 LIVE eligibility as the defaults: foreign ⇒ nothing; a successful unstamped call ⇒ nothing (fail closed, counted); own ⇒ held', () => {
    const lines = [`${DEV}: device-read — service ${SVC}`];
    const mk = (fact: object | null) => { const r = clone(configCalls[0]); if (fact) he.setOnRecord(r, fact); return r; };
    const f = ext([mk({ serviceId: SID, eligibility: 'foreign', heldFilesSha256: null })], lines, { live: true });
    assert(f.files.length === 0 && f.refusals.length === 0 && f.stats.foreignRowNotHeld === 1, JSON.stringify(f.stats));
    const u = ext([mk(null)], lines, { live: true });
    assert(u.files.length === 0 && u.stats.unstampedDefaultCall === 1, JSON.stringify(u.stats));
    const o = ext([mk({ serviceId: SID, eligibility: 'own', heldFilesSha256: null })], lines, { live: true });
    assert(o.files.length === 1 && o.files[0].eligibility === 'own', JSON.stringify(outcomes(o)));
  });

  await test('C13 prepareHeldCapture: the device base is held R10-REDACTED (no lab community or password hash in clear); stats name the lane', () => {
    // A LIVE record carries the device's secrets in clear (the stored fixture is already persist-redacted): plant them back.
    const live = configCalls.map((c) => {
      const r = clone(c);
      for (const h of Object.values(hostsOf(r)) as Rec[]) {
        h.output.config.running = String(h.output.config.running)
          .replace('community <<REDACTED-SECRET>> ro', 'community s3cr3tLabCommX ro')
          .replace('secret sha512 <<REDACTED-SECRET>>', 'secret sha512 $6$abcdefgh$ijklmnopqrstuvwxyz0123456789');
      }
      return r;
    });
    assert(live.every((r) => /s3cr3tLabCommX/.test(JSON.stringify(r))), 'plant');
    const recs = [...others, ...live];
    const plan = prepareHeldCapture({ toolCallResults: recs, task: { id: 't', povId: 'pov' }, logger: { warn: () => undefined, info: () => undefined },
      gitFileSourceLeg: true, deviceRead: scopeOf([`${DEV}: device-read — service ${SVC}`, `${DEV2}: device-read — service ${SVC}`], recs) });
    assert(plan && plan.files.length === 2, JSON.stringify(plan?.refusals));
    for (const f of plan!.files) {
      assert(!/s3cr3tLabComm/.test(f.content), 'the lab SNMP community never reaches a held blob');
      assert(!/\$6\$|sha512 [^<\s]/.test(f.content), 'no password hash in clear');
      assert(f.redactedCount >= 1 || /<<REDACTED-SECRET>>/.test(f.content), 'R10 ran');
    }
    const none = prepareHeldCapture({ toolCallResults: recs, task: { id: 't', povId: 'pov' }, logger: { warn: () => undefined, info: () => undefined }, gitFileSourceLeg: true });
    assert(none === null, 'no scope ⇒ nothing captured from these records (the pre-change behaviour)');
  });

  const regTable = (target: string, pathConst = '/running-config') => {
    const NETDECL = { tool: 'fetch_data', select: 'structuredContent.hosts.*.output.config.running', target: { template: target }, path: { const: pathConst } };
    const V = decl.validateHeldFiles({ files: [NETDECL], notAFile: ['list_devices', 'show_commands'] }, { serviceName: SVC, capabilityToolNames: ['fetch_data', 'list_devices', 'show_commands'], platformServiceNames: [], platformPins: [], platformTargets: [] });
    assert(V.ok !== false && V.sha256, JSON.stringify(V));
    return tableFromDeclarations([{ serviceId: SID, sha: V.sha256 }], [{ sha256: V.sha256, heldFiles: V.declaration }]).table;
  };
  await test('C14 the REGISTRANT path on a Device-sources leg: non-Git files are held only for a declared device of a declared service', () => {
    const table = regTable('device:{key}');
    const recs = [...configCalls];
    const reg = (lines: string[] | null) => extractDeclaredFiles(recs, table, { deviceRead: scopeOf(lines, recs) });
    const both = reg([`${DEV}: device-read — service ${SVC}`, `${DEV2}: device-read — service ${SVC}`]);
    assert(both.files.length === 2 && both.files.every((f) => f.declaredBy === 'registrant'), JSON.stringify(outcomes(both)));
    const one = reg([`${DEV}: device-read — service ${SVC}`]);
    assert(one.files.length === 1 && one.refusals.length === 1 && one.refusals[0].refusal === 'device-not-declared', JSON.stringify(outcomes(one)));
    const none = reg(null);
    assert(none.files.length === 0 && none.refusals.every((r) => r.refusal === 'device-sources-absent'), JSON.stringify(outcomes(none)));
    const off = extractDeclaredFiles(recs, table, {});
    assert(off.files.length === 2, 'off a Device-sources leg the registrant path is unchanged');
  });

  await test('C14b (mcp-hub SF-1) a registrant device file is held ONLY as device:<device> at /running-config — the one form every consumer reads', () => {
    const recs = [...configCalls];
    const lines = [`${DEV}: device-read — service ${SVC}`, `${DEV2}: device-read — service ${SVC}`];
    for (const [t, p] of [['{key}', '/running-config'], ['device:{key}', '/startup-config']] as Array<[string, string]>) {
      const x = extractDeclaredFiles(recs, regTable(t, p), { deviceRead: scopeOf(lines, recs) });
      assert(x.files.length === 0 && x.refusals.length === 2 && x.refusals.every((r) => r.refusal === 'device-not-declared' && (r.detail as Record<string, unknown>)?.reason === 'target-form'),
        `${t} ${p}: ${JSON.stringify(outcomes(x))}`);
      assert(extractDeclaredFiles(recs, regTable(t, p), {}).files.length === 2, 'off a Device-sources leg: unchanged');
    }
  });

  await test('C15 the leg read: only a Device-sources leg reads; the contract projection is read, never the whole inputContext', async () => {
    let sql = ''; let calls = 0;
    // push 2 (O-2): the row carries the first-execution snapshot; the reader governs from it (device-sources-read.ts)
    const desc = body([`${DEV}: device-read — service ${SVC}`]);
    const snapshot = JSON.parse(JSON.stringify(buildDeviceSourcesSnapshot(resolveLegDeviceSources({ contractValue: undefined, taskBody: desc }), '2026-10-26T00:00:00.000Z')));
    const db = { $queryRaw: async (q: { strings?: string[]; sql?: string }) => { calls++; sql = (q.strings ?? []).join('?') || String(q.sql ?? ''); return [{ description: desc, contract: null, snapshot }]; } };
    const r = await readLegDeviceSources(db as never, { kind: 'leg', legId: 'L', heldCapable: false, ownStageId: 's', deviceSource: true });
    assert(r.state === 'parsed' && calls === 1 && /"inputContext" -> 'interfaceContract'/.test(sql) && /metadata -> 'deviceSourcesSnapshot'/.test(sql), `${JSON.stringify(r)} ${sql}`);
    const noSnap = await readLegDeviceSources({ $queryRaw: async () => [{ description: desc, contract: null, snapshot: null }] } as never,
      { kind: 'leg', legId: 'L', heldCapable: false, ownStageId: 's', deviceSource: true });
    assert(noSnap.state === 'snapshot-absent', `a leg first executed before push 2 holds nothing: ${JSON.stringify(noSnap)}`);
    const scope = buildDeviceReadScope(noSnap, []);
    assert(scope.state === 'refuse' && scope.refusal === 'device-sources-snapshot-absent', JSON.stringify(scope));
    const n = await readLegDeviceSources(db as never, { kind: 'leg', legId: 'L', heldCapable: false, ownStageId: 's', deviceSource: false });
    assert(n.state === 'not-device-source-leg' && calls === 1, 'a non-network leg reads nothing');
    const t = await readLegDeviceSources({ $queryRaw: async () => { throw new Error('x'); } } as never, { kind: 'leg', legId: 'L', heldCapable: false, ownStageId: 's', deviceSource: true });
    assert(t.state === 'could-not-check', 'a read failure is could-not-check');
  });

  // ── push 2 (P8 / S3-E): an UNPINNED customer Git row — the declared LINE is the pin ───────────────────────────────────
  const SHA = 'c'.repeat(40);
  const gitRead = (svc: string, args: Rec, text = 'hostname sw1\ninterface uplink1\n   description to-core-a\n', uriPath?: string, uriOwnerRepo?: string) => ({
    tool: 'services', success: true, arguments: { action: 'call', targetService: svc, tool: 'get_file_contents', arguments: args },
    result: { content: [{ type: 'data', data: { success: true, targetService: svc, tool: 'get_file_contents', metadata: { targetServiceId: `id-${svc}` },
      arguments: args, result: { content: [{ type: 'text', text: 'ok' }, { type: 'resource', resource: {
        uri: `repo://${uriOwnerRepo ?? `${args.owner}/${args.repo}`}/sha/${SHA}/contents/${uriPath ?? String(args.path).replace(/^\//, '')}`, mimeType: 'text/plain', text } }] } } }] },
  });
  const LINE = `${DEV}: git-file — service acme-git ; acme/net-configs/network/sw1.cfg`;
  const ok1 = { owner: 'acme', repo: 'net-configs', path: 'network/sw1.cfg' };

  await test('G1 P8: the declared file from an unpinned customer Git service is held — target github:<owner>:<repo>, the line path, the served commit', () => {
    const x = ext([gitRead('acme-git', ok1)], [LINE]);
    assert(x.files.length === 1 && x.refusals.length === 0, JSON.stringify(outcomes(x)));
    const f = x.files[0];
    assert(f.target === 'github:acme:net-configs' && f.path === '/network/sw1.cfg' && f.sourceRevision === SHA && f.declaredBy === 'platform-default', JSON.stringify(f));
  });

  await test('G2 P8 the other direction: any other file holds NOTHING, named git-file-not-declared with the differing field; a never-holdable path keeps its own name', () => {
    const cases: Array<[Rec, string]> = [
      [{ ...ok1, path: 'network/sw2.cfg' }, 'path'], [{ ...ok1, repo: 'net-configs-fork' }, 'repo'], [{ ...ok1, owner: 'acme-lookalike' }, 'owner'],
      [{ ...ok1, ref: 'feature-x' }, 'ref'], [{ ...ok1, sha: SHA }, 'sha']];
    for (const [args, field] of cases) {
      const x = ext([gitRead('acme-git', args)], [LINE]);
      assert(x.files.length === 0 && x.refusals.length === 1 && x.refusals[0].refusal === 'git-file-not-declared' && x.refusals[0].detail?.field === field,
        `${field}: ${JSON.stringify(outcomes(x))} ${JSON.stringify(x.refusals[0]?.detail)}`);
    }
    const uri = ext([gitRead('acme-git', ok1, undefined, 'network/other.cfg')], [LINE]);
    assert(uri.files.length === 0 && uri.refusals[0]?.refusal === 'git-file-not-declared' && uri.refusals[0]?.detail?.field === 'path', `served URI disagrees: ${JSON.stringify(outcomes(uri))}`);
    const atRef = ext([gitRead('acme-git', { ...ok1, ref: 'v2' })], [`${LINE} @ v2`]);
    assert(atRef.files.length === 1, `a line naming a ref holds that ref: ${JSON.stringify(outcomes(atRef))}`);
    const inv = ext([gitRead('acme-git', { ...ok1, path: 'nornir/hosts.yaml' })], [`${DEV}: git-file — service acme-git ; acme/net-configs/nornir/hosts.yaml`]);
    assert(inv.files.length === 0 && inv.refusals[0]?.refusal === 'credentials-file', `never holdable: ${JSON.stringify(outcomes(inv))}`);
  });

  await test('G3 P8 scope: a service the leg does NOT declare git-file holds nothing (no row, as before); a failed call holds nothing (counted); off a Device-sources leg the lane does not exist', () => {
    const x = ext([gitRead('other-git', ok1)], [LINE]);
    assert(x.files.length === 0 && x.refusals.length === 0, JSON.stringify(outcomes(x)));
    const failedCall = clone(gitRead('acme-git', ok1)) as Rec; failedCall.success = false; failedCall.result.isError = true;
    const f = ext([failedCall], [LINE]);
    assert(f.files.length === 0 && f.stats.declaredGitFailed === 1, JSON.stringify(f.stats));
    const off = extractDeclaredFiles([gitRead('acme-git', ok1)], undefined, { gitFileSourceLeg: true });
    assert(off.files.length === 0 && off.refusals.length === 0, 'no device scope ⇒ no lane');
  });

  await test('G4 owner Phase-0 §4b + D-1 (push 3): a device that DECLARES a Git file never holds its device read (EVIDENCE: no blob, no handle) — held Git file or not; a device-read-only device keeps its config', () => {
    const lines = [`${DEV}: git-file — service acme-git ; acme/net-configs/network/sw1.cfg`, `${DEV}: device-read — service ${SVC}`];
    const recs = [gitRead('acme-git', ok1), configCalls[0]];
    const sc = scopeOf(lines, recs);
    const both = withDeviceEvidenceOnly(extractDeclaredFiles(recs, undefined, { gitFileSourceLeg: true, deviceRead: sc }), sc);
    assert(JSON.stringify(both.files.map((f) => f.target)) === '["github:acme:net-configs"]', JSON.stringify(outcomes(both)));
    assert(both.refusals.length === 1 && both.refusals[0].refusal === 'device-read-evidence-only' && both.refusals[0].target === null, JSON.stringify(outcomes(both)));
    const wrong = [gitRead('acme-git', { ...ok1, path: 'network/sw9.cfg' }), configCalls[0]];
    const sc2 = scopeOf(lines, wrong);
    const fallback = withDeviceEvidenceOnly(extractDeclaredFiles(wrong, undefined, { gitFileSourceLeg: true, deviceRead: sc2 }), sc2);
    assert(fallback.files.length === 0 && fallback.refusals.some((r) => r.refusal === 'device-read-evidence-only' && r.target === null),
      `no held Git file ⇒ still evidence only (the leg forces git-file-not-held; no base the Author cannot use): ${JSON.stringify(outcomes(fallback))}`);
    const readOnly = [`${DEV}: device-read — service ${SVC}`];
    const sc3 = scopeOf(readOnly, [configCalls[0]]);
    const kept = withDeviceEvidenceOnly(extractDeclaredFiles([configCalls[0]], undefined, { gitFileSourceLeg: true, deviceRead: sc3 }), sc3);
    assert(kept.files.length === 1 && kept.files[0].target === `device:${DEV}`, `a device-read-only device keeps its config as the base: ${JSON.stringify(outcomes(kept))}`);
    // mixed leg: ANOTHER device declares a Git file — this device-read-only device still keeps its config (the rule is per device)
    const mixed = [`other-dev: git-file — service acme-git ; acme/net-configs/network/other.cfg`, `${DEV}: device-read — service ${SVC}`];
    const sc4 = scopeOf(mixed, [configCalls[0]]);
    const keptMixed = withDeviceEvidenceOnly(extractDeclaredFiles([configCalls[0]], undefined, { gitFileSourceLeg: true, deviceRead: sc4 }), sc4);
    assert(keptMixed.files.length === 1 && keptMixed.files[0].target === `device:${DEV}`, `per device, not per leg: ${JSON.stringify(outcomes(keptMixed))}`);
    // the FACTS read the extractor's own result, so the comparison still sees the device text
    const src = fs.readFileSync(path.join(__dirname, '../lib/services/held-bytes-capture.ts'), 'utf8');
    assert(/const ex = withDeviceEvidenceOnly\(extractDeclaredFiles\(/.test(src), 'capture applies the one-base rule');
    assert(!fs.readFileSync(path.join(__dirname, '../lib/agents/harness/device-source-facts.ts'), 'utf8').includes('withDeviceEvidenceOnly'), 'the facts never do');
  });

  await test('G5 P8 on the REGISTRANT path: an unpinned registrant Git declaration (no gitPin) on a service the leg declares git-file — the line is the pin, both directions', () => {
    const GITDECL = { tool: 'get_file_contents', select: 'content[type=resource].resource.text', target: { const: 'acme-repo' }, path: { argument: 'path' } };
    const V = decl.validateHeldFiles({ files: [GITDECL] }, { serviceName: 'acme-git', capabilityToolNames: ['get_file_contents'], platformServiceNames: [], platformPins: [], platformTargets: [] });
    assert(V.ok !== false && V.sha256, JSON.stringify(V));
    const table = tableFromDeclarations([{ serviceId: 'id-acme-git', sha: V.sha256 }], [{ sha256: V.sha256, heldFiles: V.declaration }]).table;
    const run = (args: Rec) => { const recs = [gitRead('acme-git', args)]; return extractDeclaredFiles(recs, table, { gitFileSourceLeg: true, deviceRead: scopeOf([LINE], recs) }); };
    const good = run(ok1);
    assert(good.files.length === 1 && good.files[0].declaredBy === 'registrant' && good.files[0].target === 'github:acme:net-configs' && good.files[0].path === '/network/sw1.cfg',
      JSON.stringify(outcomes(good)));
    const other = run({ ...ok1, path: 'network/sw2.cfg' });
    assert(other.files.length === 0 && other.refusals[0]?.refusal === 'git-file-not-declared' && other.refusals[0]?.detail?.field === 'path', JSON.stringify(outcomes(other)));
  });

  await test('G6 review folds: a read with NO served URI holds nothing (hub SF-1); a line naming a PLATFORM pin on a customer service holds nothing (hub SF-2); a mixed-case org matches (sec-ops SF-2)', () => {
    const noUri = clone(gitRead('acme-git', ok1)) as Rec;
    noUri.result.content[0].data.result.content[1].resource.uri = undefined;
    const a = ext([noUri], [LINE]);
    assert(a.files.length === 0 && a.refusals[0]?.refusal === 'git-file-not-declared' && a.refusals[0]?.detail?.field === 'uri', JSON.stringify(outcomes(a)));
    const plat = { owner: 'paichart', repo: 'paichart-lab-configs', path: 'network/sw1.cfg' };
    const b = ext([gitRead('acme-git', plat)], [`${DEV}: git-file — service acme-git ; paichart/paichart-lab-configs/network/sw1.cfg`]);
    assert(b.files.length === 0 && b.refusals[0]?.refusal === 'path-invalid' && b.refusals[0]?.detail?.reason === 'reserved-target', JSON.stringify(outcomes(b)));
    const mixed = ext([gitRead('acme-git', { owner: 'Acme', repo: 'Net-Configs', path: 'network/sw1.cfg' })], [`${DEV}: git-file — service acme-git ; Acme/Net-Configs/network/sw1.cfg`]);
    assert(mixed.files.length === 1 && mixed.files[0].target === 'github:acme:net-configs', `mixed case: ${JSON.stringify(outcomes(mixed))}`);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pin = require('../lib/mcp/server/config/git-file-source-pin.js');
    const p = pin.pinFromDeclaration({ owner: 'Acme', repo: 'NetCfg' });
    assert(pin.checkGitArguments(p, { owner: 'Acme', repo: 'NetCfg', path: 'a.cfg' }).ok === true && pin.checkGitArguments(p, { owner: 'acme', repo: 'netcfg', path: 'a.cfg' }).ok === true,
      'a mixed-case declared pin admits its own repo (the WI-B10 call gate refused every spelling before)');
  });

  await test('C16 MI-13 _devsrcleg equals DEVICE_SOURCE_PROTOCOLS pair for pair (a domain that declares Device sources joins BOTH)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DEVICE_SOURCE_PROTOCOLS } = require('../lib/agents/harness/held-bytes/variant') as { DEVICE_SOURCE_PROTOCOLS: string[] };
    const sh = fs.readFileSync(path.join(__dirname, 'report-mechanism-inventory.sh'), 'utf8');
    const m = /CREATE TEMP VIEW _devsrcleg AS SELECT \* FROM \(VALUES ([^)]*(?:\)[^;]*?)?)\) v\(name\);/.exec(sh);
    assert(m, '_devsrcleg view present');
    const names = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
    assert(JSON.stringify(names) === JSON.stringify([...DEVICE_SOURCE_PROTOCOLS].sort()), `${names} vs ${DEVICE_SOURCE_PROTOCOLS}`);
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
