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
// Config sources STEP 3 slice P4 (plan §6 / mcp-hub F-L10-1): the six registration rows for an OBSERVABILITY block.
import { computeFileConfigSourceReads, computeConfigLiveEvidenceFromReadRecord } from '../lib/agents/harness/config-source-facts';
import { computeFileGitLiveDrift, renderGitLiveDriftForPrompt, validFileCompareRecord } from '../lib/agents/harness/git-live-drift';
import { quotableLine } from '../lib/agents/harness/file-compare-quote-seam';
import { SERVICE_SHOWN_MAX_CHARS } from '../lib/agents/harness/source-field-bounds';
import { buildFileSourceCompare } from '../lib/agents/harness/file-source-compare';
import { configSourceForce } from '../lib/agents/harness/held-bytes/config-source-scope';
import { captureScopesFor, type OwningLegResolution } from '../lib/agents/harness/held-bytes/variant';
import { configSnapshotDecision, governingConfigSourcesAsOf } from '../lib/agents/harness/config-sources-read';
import { serviceMatcher } from '../lib/agents/harness/device-source-facts';
import { prepareHeldCaptureWithEvidence } from '../lib/services/held-bytes-capture';

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

  // ══ Config sources STEP 3 slice P4 (plan §6; mcp-hub F-L10-1) — the six registration rows for an OBSERVABILITY block ══
  // A `service-held` line names its service by a descriptor URL or by a registered name. Each row is one way a Harvester can have
  // registered (or failed to register) the read-only service in its own execution; for each, through the REAL chain — the one
  // resolver (`registrationsByDescriptorUrl` inside `serviceMatcher`), the real capture (`prepareHeldCaptureWithEvidence` with the
  // declared-files scope), the real compare record and the real force — the suite states: does the URL line resolve, is the file
  // held, what does `configSourceReads` say, is the leg forced. The same six with the line naming the service BY NAME are the control.
  // The served files are the stored run-2 harvest's own records. Reached only at the join (the row awaits its text): every helper is
  // asked with an EMPTY awaiting list.
  console.log('── P4: the six registration rows, an observability service-held line (URL-declared, then name-declared) ──');
  process.env.HELD_BYTES_CAPTURE_ENABLED = 'true';
  const OBS = 'observability-config-protocol';
  const OBS_URL = `${PUB}observability-readonly-descriptor.json`;
  const OBS_EP = DECLARED_DESCRIPTOR_ENDPOINTS[OBS_URL];
  const CUSTOMER_URL = 'https://example.com/descriptors/my-observability.json';
  const RUN2 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'quote-fidelity', 'run2-harvest.json'), 'utf8')) as { toolCalls: Rec[] };
  const INGRESS = RUN2.toolCalls[1];
  const dataOf = (rec: Rec): Rec => rec.result.content[0].data;
  const OBS_NAME = String(dataOf(INGRESS).targetService); const OBS_ID = String(dataOf(INGRESS).metadata.targetServiceId);
  /** The stored call, as made to a service registered under another name and id. */
  const callTo = (name: string, id: string): Rec => { const r = clone(INGRESS); r.arguments.targetService = name; dataOf(r).targetService = name; dataOf(r).metadata.targetServiceId = id; return r; };
  const LABEL = 'obs-ingress.otlp-ingress.conf';
  const NONE: readonly string[] = [];
  const declared = (service: string) => declaredLines([`${LABEL}: service-held — service ${service}`]);
  const declaredLines = (lines: string[]) => {
    const description = `Change it.\n\n## Config sources\n${lines.join('\n')}\n\n## Notes\nx\n`;
    const d = configSnapshotDecision({ type: 'PIPELINE', protocol: OBS, description, interfaceContract: null, takenAt: 't' }, NONE);
    assert(d.action === 'write', `the fixture block did not snapshot: ${JSON.stringify(d)}`);
    return governingConfigSourcesAsOf({ description, contract: null, snapshot: d.snapshot, protocolStamped: true }, OBS, NONE) as LegConfigSourcesResolution;
  };
  const logger = { warn: () => undefined, info: () => undefined };
  /** One row through the real chain. */
  const run = (service: string, records: Rec[], lines?: string[]) => {
    const sources = lines ? declaredLines(lines) : declared(service);
    assert(sources.state === 'parsed', `the declaration does not govern as parsed: ${JSON.stringify(sources)}`);
    const leg = { kind: 'leg', legId: 'leg1', heldCapable: true, ownStageId: 's1', configSourceProtocol: OBS } as OwningLegResolution;
    const sc = captureScopesFor(leg, sources);
    const { plan, evidence } = prepareHeldCaptureWithEvidence({ toolCallResults: records, task: { id: 'cmtaskP4', povId: 'cmpovP4' }, logger, gitFileSourceLeg: sc.gitFileSourceLeg,
      ...(sc.configSources ? { configSources: sc.configSources, configSourceProtocol: sc.configSourceProtocol } : {}) });
    const files = ((plan?.files ?? []) as unknown as Array<{ target: string; path: string }>).map((f) => ({ target: f.target, path: f.path }));
    const refusals = ((plan?.refusals ?? []) as unknown as Array<{ refusal: string; detail?: Rec }>).map((r) => `${r.refusal}${r.detail?.case ? `:${r.detail.case}` : ''}`).sort();
    const record = buildFileSourceCompare({ sources: sources as never, harvesterExecutionId: 'exH', plan, evidence, toolCalls: records, redactionOff: false });
    const reads = computeFileConfigSourceReads(sources, record) as Rec;
    const item = (reads.items as Rec[] | undefined)?.find((i) => i.label === LABEL);
    return {
      resolves: (c: { service: string; serviceId: string }) => serviceMatcher(records)(service, c),
      held: files.some((f) => f.target === 'obs-ingress' && f.path === '/etc/nginx/conf.d/otlp-ingress.conf'), heldCount: files.length, refusals,
      read: item ? `${item.read.state} (${item.read.outcome})` : `no item (${String(reads.reason)})`, notRead: reads.notRead,
      readIndex: item?.read?.toolCallIndex ?? null, unresolved: reads.unresolvedServices ?? null, record, reads,
      force: configSourceForce(sources, files),
    };
  };
  const obsReg = (args: Rec, data: Rec = {}) => reg(args, { serviceId: OBS_ID, serviceName: OBS_NAME, ...data });
  const handAt = (endpoint: string, data: Rec = {}) => obsReg({ name: data.serviceName ?? OBS_NAME, endpoint, description: 'd' }, { endpoint, ...data });
  const refused = (): Rec => { const r = handAt(OBS_EP); r.result = { content: [{ type: 'text', text: `❌ A service named '${OBS_NAME}' is already registered` }], isError: true }; return r; };
  const adopted = (): Rec => obsReg({ descriptorUrl: OBS_URL }, { adopted: true, status: 'ACTIVE' });
  const FORCED = { reason: 'service-held-not-held', serviceFilesNotHeld: [LABEL], serviceFilesNotHeldTotal: 1 };
  const OWN = { service: OBS_NAME, serviceId: OBS_ID };
  type Row = { name: string; service: string; records: Rec[]; who: { service: string; serviceId: string }; resolves: boolean; held: boolean; read: string; force: unknown };
  // STEP 3 P5 (join preconditions 16, 17): the fact now says WHAT HAPPENED. Before P5 row 2 read `no-capture-plan` and rows 3, 5, 6
  // read `not-read` — the leg was (and is) forced; only the words moved.
  const HELD_READ = 'read (held)'; const OTHER_NAME_READ = 'registered-under-other-name (registered-under-other-name)';
  const OTHER_SERVICE_READ = 'file-from-other-service (file-from-other-service)'; const NO_PLAN_READ = 'no-capture-plan (no-capture-plan)';
  const ROWS: Row[] = [
    { name: '1 hand registration at the table\'s endpoint, success', service: OBS_URL, records: [handAt(OBS_EP), INGRESS], who: OWN, resolves: true, held: true, read: HELD_READ, force: null },
    // the URL line DOES resolve to the row the Harvester registered — but the platform's held-file table for this service is keyed
    // on the name `observability-readonly`, so a call to a row of another name extracts no file: nothing held, the leg forced.
    // With no other capturable call in the execution there is no capture plan at all. Until P5 the read state was `no-capture-plan`,
    // a word that names the capture switch or a failure; it now names THIS cause (`registered-under-other-name`).
    { name: '2 hand registration at the table\'s endpoint, ANOTHER NAME', service: OBS_URL, records: [handAt(OBS_EP, { serviceName: 'obs-mine', serviceId: 'svc-mine' }), callTo('obs-mine', 'svc-mine')],
      who: { service: 'obs-mine', serviceId: 'svc-mine' }, resolves: true, held: false, read: OTHER_NAME_READ, force: FORCED },
    { name: '3 hand registration REFUSED (the name is already registered)', service: OBS_URL, records: [refused(), INGRESS], who: OWN, resolves: false, held: false, read: OTHER_SERVICE_READ, force: FORCED },
    { name: '4 registration by descriptorUrl, ADOPTED', service: OBS_URL, records: [adopted(), INGRESS], who: OWN, resolves: true, held: true, read: HELD_READ, force: null },
    { name: '5 hand registration at an endpoint that is NOT the table\'s', service: OBS_URL, records: [handAt('https://obs.example.com/mcp'), INGRESS], who: OWN, resolves: false, held: false, read: OTHER_SERVICE_READ, force: FORCED },
    { name: '6 any hand registration, the line names a CUSTOMER URL', service: CUSTOMER_URL, records: [handAt(OBS_EP), INGRESS], who: OWN, resolves: false, held: false, read: OTHER_SERVICE_READ, force: FORCED },
  ];
  for (const r of ROWS) {
    await test(`DR-P4-${r.name}: URL line resolves ${r.resolves ? 'YES' : 'NO'} · held ${r.held ? 'YES' : 'NO'} · read ${r.read} · ${r.force ? 'FORCED service-held-not-held' : 'not forced'}`, () => {
      const got = run(r.service, r.records);
      eq([got.resolves(r.who), got.held, got.read, got.force], [r.resolves, r.held, r.read, r.force]);
      if (!r.held) eq(got.heldCount, 0, 'nothing else may be held on the leg: ');
    });
  }
  await test('DR-P4-N the same six registrations with the line naming the service BY NAME: rows 1, 3, 4, 5, 6 resolve and hold with no registration needed; row 2 (a row of another name) does not', () => {
    for (const r of ROWS) {
      const got = run(OBS_NAME, r.records);
      const other = r.name.startsWith('2 ');
      // row 2 with a NAME-declared line: the declared service (`observability-readonly`) was never called — the call went to a row
      // of another name — and nothing was captured, so there is no plan: `no-capture-plan`, as before P5 (the other-name word is for
      // a declared service that DID answer).
      eq([got.resolves(r.who), got.held, got.read, got.force], other ? [false, false, NO_PLAN_READ, FORCED] : [true, true, HELD_READ, null], `${r.name}: `);
    }
  });
  await test('DR-P4-W an unresolved URL line never holds the file: the served file is refused BY NAME (service-file-not-declared: wrong-service), never dropped', () => {
    eq(run(OBS_URL, [refused(), INGRESS]).refusals.filter((x) => x.startsWith('service-file-not-declared')), ['service-file-not-declared:no-label', 'service-file-not-declared:wrong-service']);
    eq(run(OBS_URL, [handAt(OBS_EP), INGRESS]).refusals.filter((x) => x.startsWith('service-file-not-declared')), ['service-file-not-declared:no-label'], 'resolved: only the undeclared sibling is refused: ');
  });

  // ══ STEP 3 slice P5 — join preconditions 16 and 17: the FACT says what happened; the force is untouched ══
  const ghRecord = (p: string, text: string): Rec => {
    const args = { owner: 'paichart', repo: 'paichart-configs', path: p };
    return { tool: 'services', success: true, arguments: { action: 'call', targetService: 'github-service', tool: 'get_file_contents', arguments: args },
      result: { content: [{ type: 'data', data: { success: true, targetService: 'github-service', tool: 'get_file_contents', arguments: args,
        result: { content: [{ type: 'text', text: 'successfully downloaded text file' },
          { type: 'resource', resource: { uri: `repo://paichart/paichart-configs/sha/0ea432e751cc622ffab91d7a90386c66cadf8733/contents/${p}`, mimeType: 'text/plain; charset=utf-8', text } }] },
        metadata: { targetServiceId: 'github-service' } } }] } };
  };
  const GIT_OTEL_LINE = 'obs-otelcol: git-file — service github-service ; paichart/paichart-configs/observability/otelcol/config.yaml';
  const GIT_OTEL_REC = ghRecord('observability/otelcol/config.yaml', 'receivers: {}\n');
  const OBS_URL_SHOWN = OBS_URL;   // no query, no userinfo: the IF-2 masker shows it as written
  await test('DR-P5-16 an unresolved URL line whose file WAS returned: the read record says `file-from-other-service` with that call\'s index — never `not-read`, never `read` — and names the unresolved service; the leg is forced exactly as before', () => {
    for (const r of ROWS.filter((x) => /^[356] /.test(x.name))) {
      const got = run(r.service, r.records);
      eq([got.read, got.readIndex, got.notRead, got.force], [OTHER_SERVICE_READ, 1, 0, FORCED], `${r.name}: `);
      eq(got.unresolved, [r.service], `${r.name} — the declared URL no registration is tied to: `);
      // the record never says the DECLARED service returned the file: no `returned` on the entry (the reader's `read` comes from it)
      eq((got.record.capture as Rec[]).map((c) => [c.outcome, 'returned' in c, c.toolCallIndex]), [['file-from-other-service', false, 1]], `${r.name} — the capture entry: `);
      const live = computeConfigLiveEvidenceFromReadRecord(got.reads);
      eq([live.summary, live.serviceHeldRead, (live.liveNotRead as Rec[]).map((x) => x.state)], ['some-not-read', 0, ['file-from-other-service']], `${r.name} — liveEvidence: `);
    }
    // a RESOLVED line names no unresolved service, and a name-declared line never does
    eq([run(OBS_URL, [handAt(OBS_EP), INGRESS]).unresolved, run(OBS_NAME, [INGRESS]).unresolved], [null, null], 'resolved: ');
    // the same condition on a Git-plus-live label: the comparison says so too (before P5: "the declared service was not called")
    const pair = run(OBS_URL, [refused(), ghRecord('observability/nginx/otlp-ingress.conf', 'server {}\n'), INGRESS],
      [`${LABEL}: git-file — service github-service ; paichart/paichart-configs/observability/nginx/otlp-ingress.conf`, `${LABEL}: live-read — service ${OBS_URL}`]);
    const f = (pair.record.files as Rec[])[0];
    eq([f.state, f.reason, (pair.record.capture as Rec[]).map((c) => c.outcome), pair.unresolved], ['not-checked', 'served-file-from-other-service', ['held', 'file-from-other-service'], [OBS_URL_SHOWN]], 'Git + live: ');
    const text = renderGitLiveDriftForPrompt(computeFileGitLiveDrift(pair.record, 'parsed', quotableLine), { quotable: quotableLine })!.join('\n');
    assert(text.includes('a file at this name was returned by a call the platform could not tie to the declared service') && !text.includes('undefined'), text);
  });
  await test('DR-P5-17 a service registered under ANOTHER NAME reads `registered-under-other-name` — with no other capture (before P5: `no-capture-plan`) AND in a mixed block with a Git file held (before P5: `answered-key-not-returned`); every other line keeps its own word; the force is untouched', () => {
    const otherName = [handAt(OBS_EP, { serviceName: 'obs-mine', serviceId: 'svc-mine' }), callTo('obs-mine', 'svc-mine')];
    const alone = run(OBS_URL, otherName);
    eq([alone.read, alone.readIndex, alone.unresolved, alone.force], [OTHER_NAME_READ, 1, null, FORCED], 'nothing else captured: ');
    eq((alone.record.capture as Rec[]).map((c) => [c.outcome, 'returned' in c]), [['registered-under-other-name', false]], 'no `returned` on the entry: ');
    const mixedLines = [GIT_OTEL_LINE, `${LABEL}: service-held — service ${OBS_URL}`];
    const mixed = run(OBS_URL, [GIT_OTEL_REC, ...otherName], mixedLines);
    eq([mixed.read, mixed.readIndex, mixed.heldCount, (mixed.record.capture as Rec[]).map((c) => c.outcome), mixed.force],
      [OTHER_NAME_READ, 2, 1, ['held', 'registered-under-other-name'], FORCED], 'a Git file held beside it: ');
    // the Git-only file of the mixed block keeps its own reason; a no-plan record keeps `no-capture-plan` on every OTHER line
    eq((mixed.record.files as Rec[]).map((x) => x.reason), ['no-live-read-line'], 'mixed, files: ');
    const noPlanMixed = run(OBS_URL, otherName, mixedLines);
    eq([(noPlanMixed.record.capture as Rec[]).map((c) => c.outcome), (noPlanMixed.record.files as Rec[]).map((x) => x.reason)],
      [['no-capture-plan', 'registered-under-other-name'], ['no-capture-plan']], 'no plan, two lines: ');
    // NOT this condition: the declared service answered under the TABLE's name and returned another file ⇒ `answered-key-not-returned`
    const tableName = clone(INGRESS); tableName.result.content[0].data.result.structuredContent.files = { 'something-else.conf': 'x\n' };
    eq(run(OBS_URL, [handAt(OBS_EP), tableName]).read, 'answered-key-not-returned (not-returned)', 'the table\'s name, another file: ');
    // NOT this condition: the TABLE's name, and the call returned NO file at all (nothing for capture to extract — so only the
    // name test separates it from the other-name case): `no-capture-plan` with no plan, `answered-key-not-returned` beside a held Git file
    const empty = clone(INGRESS); empty.result.content[0].data.result.structuredContent.files = {};
    eq([run(OBS_URL, [handAt(OBS_EP), empty]).read, run(OBS_URL, [GIT_OTEL_REC, handAt(OBS_EP), empty], mixedLines).read], [NO_PLAN_READ, 'answered-key-not-returned (not-returned)'], 'the table\'s name, no file returned: ');
    // NOT this condition: the call under the other name FAILED ⇒ `read-failed` in a mixed block, `no-capture-plan` with no plan
    const failedCall = callTo('obs-mine', 'svc-mine'); failedCall.success = false; failedCall.result.isError = true;
    eq([run(OBS_URL, [GIT_OTEL_REC, otherName[0], failedCall], mixedLines).read, run(OBS_URL, [otherName[0], failedCall]).read], ['read-failed (read-failed)', NO_PLAN_READ], 'a failed call: ');
    // a Git-plus-live label on that service: the comparison names the condition (before P5: "returned no file at this name")
    const pairLines = [`${LABEL}: git-file — service github-service ; paichart/paichart-configs/observability/nginx/otlp-ingress.conf`, `${LABEL}: live-read — service ${OBS_URL}`];
    const pair = run(OBS_URL, [ghRecord('observability/nginx/otlp-ingress.conf', 'server {}\n'), ...otherName], pairLines);
    eq((pair.record.files as Rec[]).map((x) => [x.state, x.reason]), [['not-checked', 'service-registered-under-other-name']], 'Git + live: ');
    const text = renderGitLiveDriftForPrompt(computeFileGitLiveDrift(pair.record, 'parsed', quotableLine), { quotable: quotableLine })!.join('\n');
    assert(text.includes('the declared service answered under a registered name the platform reads no files from') && !text.includes('undefined'), text);
  });
  await test('DR-P5-V the record re-validates with the new words and the list; a forged `unresolvedServices` (not a list, over the cap, a control character) voids the whole record', () => {
    const got = run(OBS_URL, [refused(), INGRESS]);
    assert(validFileCompareRecord(got.record, quotableLine), 'the record re-validates');
    for (const [what, forged] of [['a string', 'x'], ['an empty list', []], ['over the cap', Array.from({ length: 21 }, (_, i) => `https://e.example/${i}`)], ['a control character', ['https://e.example/\u001b[31m']],
      ['a bidi override', ['https://e.example/‮']], ['a number', [1]], ['over-long', [`https://e.example/${'a'.repeat(SERVICE_SHOWN_MAX_CHARS)}`]]] as Array<[string, unknown]>) {
      const bad = clone(got.record); bad.unresolvedServices = forged;
      eq([validFileCompareRecord(bad, quotableLine), computeFileConfigSourceReads(declared(OBS_URL), bad).reason], [null, 'no-compare-record'], `${what}: `);
    }
    // a declared URL with a query: the value is MASKED before it is stored (the IF-2 masker), never as written
    const q = 'https://example.com/d.json?token=abc123';
    const masked = run(q, [handAt(OBS_EP), INGRESS]).unresolved as string[];
    assert(masked.length === 1 && !masked[0].includes('abc123'), `a query value on the record: ${JSON.stringify(masked)}`);
  });

  // Coordinator ruling 5 (P4): the derivation's KEEP arm (a Git-only observability block keeps the Architect's descriptor URL) must
  // not be a route around the checks every other descriptor meets. The kept value lives ONLY in `serviceDescriptors[token]`, which
  // no platform code reads to decide anything: resolution, capture and the force read the DECLARED LINES and the execution's own
  // registration records. So a kept URL — the published one or a customer's — holds no file and resolves no line.
  await test('DR-P4-K a Git-only block with a KEPT descriptor URL: the kept URL resolves nothing and holds nothing — every served file is refused by name, whatever was registered', () => {
    const GIT_ONLY = ['obs-otelcol: git-file — service github-service ; paichart/paichart-configs/observability/otelcol/config.yaml'];
    for (const [what, records] of [['hand at the table endpoint', [handAt(OBS_EP), INGRESS, RUN2.toolCalls[2]]], ['by descriptorUrl', [adopted(), INGRESS, RUN2.toolCalls[2]]],
      ['a customer URL registered by descriptorUrl', [obsReg({ descriptorUrl: CUSTOMER_URL }), INGRESS, RUN2.toolCalls[2]]]] as Array<[string, Rec[]]>) {
      const got = run('', records, GIT_ONLY);
      eq(got.heldCount, 0, `${what}: a served file was held on a Git-only declaration: `);
      assert(got.refusals.length > 0 && got.refusals.every((x) => x.startsWith('service-file-not-declared')), `${what}: ${JSON.stringify(got.refusals)}`);
      // the declared Git file was not read in this execution, so the leg is forced by THAT name — the kept URL changes nothing
      eq(got.force, { reason: 'git-file-not-held', gitFilesNotHeld: ['obs-otelcol'], gitFilesNotHeldTotal: 1 }, `${what}: `);
      for (const url of [OBS_URL, CUSTOMER_URL]) assert(!got.resolves({ service: url, serviceId: url }), 'a URL is never a service identity');
    }
  });
  await test('DR-P4-K2 no platform code reads `serviceDescriptors` to decide anything: its only readers are the derivation, its one door, and the Architect\'s text', () => {
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === 'node_modules' || e.name.startsWith('.') ? [] : walk(path.join(d, e.name)))
      : /\.(ts|tsx|js)$/.test(e.name) ? [path.join(d, e.name)] : []);
    const root = path.join(__dirname, '..');
    const readers = ['lib', 'app'].flatMap((d) => walk(path.join(root, d))).filter((f) => fs.readFileSync(f, 'utf8').includes('serviceDescriptors')).map((f) => path.relative(root, f)).sort();
    eq(readers, ['lib/agents/harness/held-bytes/variant.ts', 'lib/agents/harness/plan-spawn-carry.ts', 'lib/agents/harness/service-descriptors-derivation.ts',
      'lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts'], 'a NEW reader of serviceDescriptors: if it resolves, registers or holds anything from the value, the keep arm needs the same check there: ');
    // variant.ts only DESCRIBES the column in comments
    const v = fs.readFileSync(path.join(root, 'lib/agents/harness/held-bytes/variant.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert(!v.includes('serviceDescriptors'), 'variant.ts reads serviceDescriptors in code');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
