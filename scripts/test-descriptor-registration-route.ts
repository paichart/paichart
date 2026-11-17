/**
 * DESCRIPTOR-REGISTRATION-ROUTE (2026-11-16, owner-approved; OPEN-REGISTER row of that name).
 *
 * A declared `service <descriptor URL>` line was tied to a service ONLY through a successful `registry register` carrying that
 * `descriptorUrl`. A Harvester that registered the same service BY HAND (name + endpoint + …) was not tied to it, so the platform
 * made no drift call and recorded a cluster it had read as NOT read (production Harvester cmwj3xa7v007dyxpd6b9i1gxn).
 *
 * The fix is ONE resolver (`registrationsByDescriptorUrl`) that also accepts a hand registration whose endpoint equals the endpoint
 * the platform's static table lists for that URL. This suite drives BOTH routes through EVERY consumer:
 *   capture scope (buildDeviceReadScope / declaredDevicesFor) · deviceSourceReads · configSourceReads + liveEvidence (config arm)
 *   · the platform drift call (runPlatformDriftCalls)
 * and the negative cases: a different endpoint, an unknown URL, an endpoint the table lists twice, a failed registration, two hand
 * registrations, a name the agent chose. Plus the table pinned against the published descriptor files.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@127.0.0.1:5432/stub';
process.env.PAICHART_SKIP_DB_CONNECT = 'true';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { buildDeviceReadScope, declaredDevicesFor, registrationsByDescriptorUrl } from '../lib/agents/harness/held-bytes/device-read-scope';
import { DECLARED_DESCRIPTOR_ENDPOINTS, descriptorUrlByEndpoint, normalisedEndpoint } from '../lib/agents/harness/held-bytes/declared-descriptor-endpoints';
import { resolveLegDeviceSources } from '../lib/agents/harness/device-sources';
import { resolveLegConfigSources } from '../lib/agents/harness/config-sources';
import type { LegConfigSourcesResolution } from '../lib/agents/harness/config-sources-read';
import type { LegDeviceSourcesResolution } from '../lib/agents/harness/device-sources-read';
import { computeDeviceSourceReads } from '../lib/agents/harness/device-source-facts';
import { computeConfigSourceReads, computeConfigLiveEvidence } from '../lib/agents/harness/config-source-facts';
import { runPlatformDriftCalls, type DriftCaller } from '../lib/agents/harness/platform-drift-run';

let passed = 0; let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`✅ ${name}`); } catch (e) { failed++; console.log(`❌ ${name}\n   ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
const eq = (a: unknown, b: unknown, what = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
type Rec = Record<string, any>;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
/** Key-order-free form (the stored stamp went through jsonb, which reorders keys). */
const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as Rec).sort().map((k) => [k, canon((v as Rec)[k])])) : v;

const PUB = 'https://raw.githubusercontent.com/paichart/paichart/main/descriptors/';
const K8S_URL = `${PUB}k8s-readonly-descriptor.json`;
const CEOS_URL = `${PUB}ceos-lab-readonly-descriptor.json`;
const K8S_EP = 'https://k8s-lab.paichart.app/mcp';
const CEOS_EP = 'https://ceos-lab.paichart.app/mcp';

/** A successful registry register record as the platform stores it. `args` decides the route. */
const reg = (args: Rec, data: Rec = {}): Rec => ({
  tool: 'registry', success: true, arguments: { action: 'register', ...args },
  result: { content: [{ type: 'data', data: { success: true, serviceId: 'svc-1', serviceName: 'k8s-rig-readonly', ...data } }], isError: false },
});
const byUrl = (url: string, data: Rec = {}) => reg({ descriptorUrl: url }, { endpoint: DECLARED_DESCRIPTOR_ENDPOINTS[url], ...data });
const byHand = (endpoint: string, data: Rec = {}, args: Rec = {}) => reg({ name: data.serviceName ?? 'k8s-rig-readonly', endpoint, description: 'd', ...args }, { endpoint, ...data });

// ── the stored production execution ──
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/descriptor-registration-route/k8s-hand-registered-harvester.json'), 'utf8')) as
  { declaredLines: string[]; storedFacts: Rec; toolCalls: Rec[] };
const K8S = 'kubernetes-gitops-protocol';
const cfg = (lines: string[]) => resolveLegConfigSources({ protocol: K8S, contractValue: lines.join('\n'), taskBody: null }) as LegConfigSourcesResolution;
const FX_SRC = cfg(FX.declaredLines);

// ── a network leg: the device-read fixture another suite already uses (two real fetch_data calls) ──
const NET = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/quote-fidelity/neg-net-harvest.json'), 'utf8')) as { toolCalls: Rec[] };
const configCalls = NET.toolCalls.filter((t) => t.tool === 'services' && JSON.stringify(t.arguments).includes('"fetch_data"'));
const SVC = String(configCalls[0]?.result?.content?.[0]?.data?.targetService);
const SID = String(configCalls[0]?.result?.content?.[0]?.data?.metadata?.targetServiceId);
const DEV = Object.keys(configCalls[0].result.content[0].data.result.structuredContent.hosts)[0];
const devSrc = (lines: string[]) => resolveLegDeviceSources({ contractValue: undefined, taskBody: `# Leg\n\n## Device sources\n${lines.map((l) => `- ${l}`).join('\n')}\n` }) as LegDeviceSourcesResolution;
const CEOS_LINE = `${DEV}: device-read — service ${CEOS_URL}`;

(async () => {
  console.log('── the table ──');
  await test('DR-T1 every table entry equals the endpoint of the published descriptor file it names (in-repo copy, and the public repo when present)', () => {
    const copies: Record<string, string[]> = {
      'ceos-lab-readonly-descriptor.json': ['scripts/leg-replay-lab/inputs/2026-10-26-held-network-l-n2/fixtures/descriptors/ceos-lab-readonly-descriptor.json'],
      'k8s-readonly-descriptor.json': ['.claude/knowledge/pipelines/kubernetes-gitops/phase4-kind-rig/k8s-readonly-descriptor.json'],
      'observability-readonly-descriptor.json': ['.claude/knowledge/pipelines/observability/phase4-promstack-rig/observability-readonly-descriptor.json'],
      'terraform-readonly-descriptor.json': ['.claude/knowledge/pipelines/terraform-iac/phase4-localstack-rig/terraform-readonly-descriptor.json'],
    };
    const publicRepo = path.join(process.env.HOME ?? '/nonexistent', 'paichart', 'descriptors');
    let compared = 0;
    for (const [url, endpoint] of Object.entries(DECLARED_DESCRIPTOR_ENDPOINTS)) {
      assert(url.startsWith(PUB), `${url} is not a platform-published descriptor URL`);
      const file = url.slice(PUB.length);
      const candidates = [...(copies[file] ?? []).map((p) => path.join(__dirname, '..', p)), path.join(publicRepo, file), path.join(__dirname, '..', 'descriptors', file)]
        .filter((p) => fs.existsSync(p));
      for (const p of candidates) { eq(JSON.parse(fs.readFileSync(p, 'utf8')).endpoint, endpoint, `${p}: `); compared++; }
    }
    if (compared === 0) console.log('   (no descriptor file in this tree — the table was checked against nothing here)');
  });
  await test('DR-T2 every table endpoint is unique, so one registration can never match two declared URLs; a duplicated endpoint resolves NEITHER', () => {
    const idx = descriptorUrlByEndpoint();
    eq(idx.size, Object.keys(DECLARED_DESCRIPTOR_ENDPOINTS).length, 'every entry indexed: ');
    const dup = { 'https://a.example/d.json': K8S_EP, 'https://b.example/d.json': K8S_EP, [CEOS_URL]: CEOS_EP };
    eq([...descriptorUrlByEndpoint(dup).keys()], [normalisedEndpoint(CEOS_EP)], 'duplicate dropped: ');
    eq([...registrationsByDescriptorUrl([byHand(K8S_EP)], dup).keys()], [], 'a hand registration at a duplicated endpoint resolves nothing: ');
  });
  await test('DR-T3 endpoints compare as endpoints: host case and a trailing slash fold; another path, scheme, port or userinfo does not', () => {
    eq(normalisedEndpoint('https://K8S-LAB.paichart.app/mcp/'), normalisedEndpoint(K8S_EP));
    eq(normalisedEndpoint('https://k8s-lab.paichart.app:443/mcp'), normalisedEndpoint(K8S_EP), 'default port: ');
    for (const other of ['https://k8s-lab.paichart.app/mcp2', 'http://k8s-lab.paichart.app/mcp', 'https://k8s-lab.paichart.app:8443/mcp', 'https://k8s-lab.paichart.app.evil.example/mcp']) {
      assert(normalisedEndpoint(other) !== normalisedEndpoint(K8S_EP), other);
    }
    eq(normalisedEndpoint('https://u:p@k8s-lab.paichart.app/mcp'), null, 'userinfo: ');
    eq(normalisedEndpoint('not a url'), null);
  });

  console.log('── the one resolver ──');
  await test('DR-R1 the descriptorUrl route is unchanged (keyed by the exact string, any URL, with or without a table entry)', () => {
    const m = registrationsByDescriptorUrl([byUrl(K8S_URL), reg({ descriptorUrl: 'https://example.com/own.json' })]);
    eq(m.get(K8S_URL), [{ serviceId: 'svc-1', serviceName: 'k8s-rig-readonly', resolvedBy: 'descriptor-url' }]);
    eq(m.get('https://example.com/own.json')?.map((r) => r.resolvedBy), ['descriptor-url'], 'a customer URL by descriptorUrl: ');
  });
  await test('DR-R2 a hand registration at the table endpoint resolves THAT URL (resolvedBy endpoint); the result endpoint wins over the argument', () => {
    eq(registrationsByDescriptorUrl([byHand(K8S_EP)]).get(K8S_URL), [{ serviceId: 'svc-1', serviceName: 'k8s-rig-readonly', resolvedBy: 'endpoint' }]);
    const argOnly = byHand(K8S_EP); delete argOnly.result.content[0].data.endpoint;
    eq(registrationsByDescriptorUrl([argOnly]).get(K8S_URL)?.length, 1, 'no result endpoint ⇒ the argument: ');
    const hubRewrote = byHand('https://elsewhere.example/mcp', { endpoint: K8S_EP });
    eq(registrationsByDescriptorUrl([hubRewrote]).get(K8S_URL)?.length, 1, 'the endpoint the hub stored is what was registered: ');
  });
  await test('DR-R3 NEGATIVE: another endpoint · a failed or refused registration · a non-register action · a non-string descriptorUrl · the agent\'s chosen NAME — resolve nothing', () => {
    const none = (records: Rec[], what: string) => eq([...registrationsByDescriptorUrl(records).keys()], [], what);
    none([byHand('https://k8s-other.example/mcp')], 'other endpoint: ');
    const refused = byHand(K8S_EP); refused.result = { content: [{ type: 'text', text: '❌ registry validation failed' }], isError: true };
    none([refused], 'refused: ');
    const failed = byHand(K8S_EP); failed.success = false; none([failed], 'success:false: ');
    const notOk = byHand(K8S_EP, { success: false }); none([notOk], 'data.success false: ');
    none([{ ...byHand(K8S_EP), arguments: { action: 'update', endpoint: K8S_EP } }], 'update: ');
    none([reg({ descriptorUrl: null, endpoint: K8S_EP }, { endpoint: K8S_EP })], 'descriptorUrl null: ');
    // the name the agent chose equals the rig row's name, the endpoint is someone else's: nothing
    none([byHand('https://attacker.example/mcp', { serviceName: 'k8s-rig-readonly' })], 'name only: ');
  });
  await test('DR-R4 an UNKNOWN declared URL stays unresolved even when a hand registration sits at a real endpoint', () => {
    const sc = buildDeviceReadScope(devSrc([`${DEV}: device-read — service https://example.com/my-descriptor.json`]), [byHand(CEOS_EP, { serviceId: SID, serviceName: SVC }), ...configCalls]);
    assert(sc.state === 'declared', JSON.stringify(sc));
    eq(sc.unresolvedServices, ['https://example.com/my-descriptor.json']);
  });

  console.log('── consumer 1: capture scope (buildDeviceReadScope / declaredDevicesFor) ──');
  await test('DR-C1 network device-read by descriptor URL: descriptorUrl route AND hand route both put the device in scope; another endpoint does not', () => {
    for (const [what, r] of [['descriptor-url', byUrl(CEOS_URL, { serviceId: SID, serviceName: SVC })], ['endpoint', byHand(CEOS_EP, { serviceId: SID, serviceName: SVC })]] as const) {
      const sc = buildDeviceReadScope(devSrc([CEOS_LINE]), [r, ...configCalls]);
      assert(sc.state === 'declared' && sc.unresolvedServices.length === 0, `${what}: ${JSON.stringify(sc)}`);
      eq([...(declaredDevicesFor(sc, SVC, SID) ?? [])], [DEV], `${what}: `);
    }
    const sc = buildDeviceReadScope(devSrc([CEOS_LINE]), [byHand(K8S_EP, { serviceId: SID, serviceName: SVC }), ...configCalls]);
    assert(sc.state === 'declared', 'declared');
    eq([sc.unresolvedServices, declaredDevicesFor(sc, SVC, SID)], [[CEOS_URL], null], 'another endpoint: ');
  });

  console.log('── consumer 2: deviceSourceReads ──');
  await test('DR-C2 deviceSourceReads: both routes read the device whole; the hand route is NAMED (resolvedByEndpoint); the descriptorUrl stamp carries no new key', () => {
    const viaUrl = computeDeviceSourceReads(devSrc([CEOS_LINE]), [byUrl(CEOS_URL, { serviceId: SID, serviceName: SVC }), ...configCalls]) as Rec;
    const viaHand = computeDeviceSourceReads(devSrc([CEOS_LINE]), [byHand(CEOS_EP, { serviceId: SID, serviceName: SVC }), ...configCalls]) as Rec;
    const none = computeDeviceSourceReads(devSrc([CEOS_LINE]), [byHand('https://x.example/mcp', { serviceId: SID, serviceName: SVC }), ...configCalls]) as Rec;
    eq(viaUrl.devices[0].sources[0].read.state, 'whole-config', 'url: ');
    eq(viaHand.devices[0].sources[0].read.state, 'whole-config', 'hand: ');
    eq(none.devices[0].sources[0].read.state, 'not-read', 'other endpoint: ');
    assert(!('resolvedByEndpoint' in viaUrl), 'the descriptorUrl stamp is unchanged');
    eq(viaHand.resolvedByEndpoint, [CEOS_URL], 'named: ');
    eq(none.unresolvedServices, [CEOS_URL], 'still unresolved, named: ');
    const { resolvedByEndpoint: _r, ...rest } = viaHand;
    eq(rest, viaUrl, 'otherwise identical to the descriptorUrl stamp: ');
  });

  console.log('── consumer 3: configSourceReads + liveEvidence (the stored production execution) ──');
  await test('DR-C3 the stored Harvester cmwj3xa7v007dyxpd6b9i1gxn: stored facts said not-read; recomputed, the cluster is READ (6 calls) and the route is named', () => {
    assert(FX_SRC.state === 'parsed', JSON.stringify(FX_SRC));
    eq(FX.storedFacts.configSourceReads.items[1].read, { state: 'not-read' }, 'the stored (false) fact: ');
    eq(FX.storedFacts.liveEvidence.summary, 'some-not-read', 'stored: ');
    const csr = computeConfigSourceReads(FX_SRC, FX.toolCalls) as Rec;
    eq(csr.items.map((i: Rec) => [i.label, i.read.state, i.read.calls ?? null]), [['sample-workloads', 'read', null], ['cluster', 'read', 6]]);
    eq([csr.notRead, csr.resolvedByEndpoint], [0, [K8S_URL]]);
    const le = computeConfigLiveEvidence(FX_SRC, FX.toolCalls) as Rec;
    eq([le.summary, le.liveRead, le.liveNotRead], ['all-read', 1, []], 'liveEvidence: ');
  });
  await test('DR-C3b the same execution re-keyed to the descriptorUrl route reads the same, with no route key (the canary shape); a different endpoint keeps the stored fact', () => {
    const recs = clone(FX.toolCalls);
    recs[4].arguments = { action: 'register', descriptorUrl: K8S_URL };
    const csr = computeConfigSourceReads(FX_SRC, recs) as Rec;
    eq([csr.items[1].read.state, 'resolvedByEndpoint' in csr], ['read', false]);
    const other = clone(FX.toolCalls);
    other[4].arguments.endpoint = 'https://k8s-elsewhere.example/mcp'; other[4].result.content[0].data.endpoint = 'https://k8s-elsewhere.example/mcp';
    const o = computeConfigSourceReads(FX_SRC, other) as Rec;
    eq(o.items[1].read, FX.storedFacts.configSourceReads.items[1].read, 'byte-equal to the stored fact: ');
    eq(canon(o), canon(FX.storedFacts.configSourceReads), 'the whole stamp equals what production stored: ');
  });

  console.log('── consumer 4: the platform drift call ──');
  const FIXDRIFT = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'git-live-drift', 'compare-result.json'), 'utf8')) as { manifest: string; result: Rec };
  const held = { target: 'github:paichart:paichart-configs', path: '/k8s/sample-workloads.yaml', content: FIXDRIFT.manifest, sha256: createHash('sha256').update(FIXDRIFT.manifest, 'utf8').digest('hex') };
  const seen: Rec[] = [];
  const caller: DriftCaller = async (a) => { seen.push(a); return { kind: 'result', result: clone(FIXDRIFT.result) }; };
  const drift = async (toolCalls: Rec[]) => { seen.length = 0; return (await runPlatformDriftCalls({ sources: FX_SRC, heldFiles: [held], toolCalls, redactedMarker: '<<REDACTED-SECRET>>', call: caller }))!; };
  await test('DR-C4 the drift call: the stored hand registration now CALLS the registered row; the descriptorUrl route still calls', async () => {
    const hand = await drift(FX.toolCalls);
    eq([hand.map((c) => c.outcome), seen.map((s) => s.targetService)], [['called'], ['k8s-rig-readonly']], 'hand: ');
    const recs = clone(FX.toolCalls); recs[4].arguments = { action: 'register', descriptorUrl: K8S_URL };
    eq((await drift(recs)).map((c) => c.outcome), ['called'], 'descriptorUrl: ');
  });
  await test('DR-C5 the drift call stays unresolved for another endpoint, and for TWO hand registrations under different names (never picks one)', async () => {
    const other = clone(FX.toolCalls); other[4].result.content[0].data.endpoint = 'https://k8s-elsewhere.example/mcp';
    eq([(await drift(other)).map((c) => c.outcome), seen.length], [['live-read-service-unresolved'], 0], 'other endpoint: ');
    const two = [...clone(FX.toolCalls), byHand(K8S_EP, { serviceId: 'svc-2', serviceName: 'k8s-second' })];
    eq([(await drift(two)).map((c) => c.outcome), seen.length], [['live-read-service-unresolved'], 0], 'two names: ');
    const twoSame = [...clone(FX.toolCalls), byHand(K8S_EP, { serviceId: 'svc-2', serviceName: 'k8s-rig-readonly' })];
    eq((await drift(twoSame)).map((c) => c.outcome), ['called'], 'two registrations of ONE name: ');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
