/**
 * validationToolCalls (NETWORK-VALIDATION-RELEASE-RATE §4, 2026-10-23) — the fact, both directions, on REAL production legs.
 *
 * Fixtures: scripts/fixtures/validation-tool-calls/network-legs-2026-10-23.json — the 13 network-provisioning legs measured in
 * cline_docs/reviews/held-network-2026-10-22/VALIDATION-WITNESS-MEASURE.md §4 (7 whose validation tool calls the live tool rejected,
 * 6 with valid calls), Author package verbatim + the Harvester toolCalls the index reads.
 *
 * What is pinned:
 *   V1  the positive control: the 7 invalid legs read a finding, the 6 valid legs read none (13/13, the owner's acceptance).
 *   V2  three sources, each finding naming its own; the strong (schema) wording vs the weak (observed) wording — the observed arm NEVER
 *       says "requires" (an argument every observed call carried can be optional; network-held-1).
 *   V3  the optional-argument fixture (network-held-1's request): omitting an argument every observed call carried is NOT a finding;
 *       with an invented key it is, and the omission rides along as an observation.
 *   V4  the enrichment: network legs only (NOT_STAMPED elsewhere and with no leg), the source order row → registration → observed, and
 *       the named unchecked reason when nothing is known — never "invalid".
 *   V5  render: nothing when the package wrote no validation tool call; positional arguments; unchecked lines.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@127.0.0.1:5432/stub';
import {
  computeValidationToolCalls, extractValidationToolCalls, renderValidationToolCallsForPrompt, checkCall, argumentShape,
} from '../lib/agents/harness/validation-tool-calls';
import { buildValidationToolCallsIndex, computeValidationToolCallsFact } from '../lib/agents/harness/validation-tool-calls-enrichment';
import { NOT_STAMPED } from '../lib/agents/harness/net-registry';
import { authoritativeReadStub } from './fixtures/authoritative-read-stub';
import { renderPipelineContextSection } from '../lib/agents/harness/render-pipeline-context';

let passed = 0; let failed = 0;
const declared = (require('fs').readFileSync(__filename, 'utf-8').match(/^ {2}await test\(/gm) || []).length;
async function test(desc: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`  ✅ ${desc}`); } catch (e) { failed++; console.log(`  ❌ ${desc}\n       ${(e as Error).message}`); }
}
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }

// eslint-disable-next-line @typescript-eslint/no-var-requires
const FX = require('./fixtures/validation-tool-calls/network-legs-2026-10-23.json') as {
  legs: Array<{ leg: string; outcome: string; expect: 'differs' | 'matches'; authorTaskId: string; harvestTaskId: string; authorText: string; harvestToolCalls: unknown[] }>;
};
const factOf = (l: (typeof FX.legs)[number]) =>
  computeValidationToolCalls(l.authorText, buildValidationToolCallsIndex(l.harvestToolCalls, new Map())) as Record<string, any>;
const leg = (p: string) => FX.legs.find((l) => l.leg.startsWith(p))!;

// A minimal harvest: one successful fetch_data {filter_name, getters} on service S1 (the measured shape), no schema anywhere.
const SVC = 'cmsvc00000000000000000001';
const okCall = (args: Record<string, unknown>, tool = 'fetch_data') => ({ tool: 'services', success: true,
  arguments: { action: 'call', targetService: 'ceos-lab-readonly', tool, arguments: args },
  result: { content: [{ data: { targetService: 'ceos-lab-readonly', success: true, metadata: { targetServiceId: SVC } } }], rawHead: 'ok' } });
const HARVEST = [okCall({ filter_name: 'ceos1', getters: ['interfaces_ip'] }), okCall({ filter_name: 'ceos2', getters: ['config'] })];
const pkg = (call: string) => `# Change package\n\n## Validation Steps\n\n\`\`\`\n${call}\n\`\`\`\n`;
const pure = (call: string, harvest: unknown[] = HARVEST, rows = new Map<string, unknown>()) =>
  computeValidationToolCalls(pkg(call), buildValidationToolCallsIndex(harvest, rows)) as Record<string, any>;

async function main() {
  console.log('\n📋 validationToolCalls — network validation-step tool calls vs what the tool accepts\n');

  await test('V1 positive control: every invalid leg reads a finding; every valid leg reads none (13 real legs)', () => {
    assert(FX.legs.length === 13, `13 fixture legs, got ${FX.legs.length}`);
    const wrong = FX.legs.filter((l) => (factOf(l).findings.length > 0 ? 'differs' : 'matches') !== l.expect);
    assert(!wrong.length, `misread: ${wrong.map((l) => `${l.leg.slice(0, 9)} expect ${l.expect}`).join(', ')}`);
    assert(FX.legs.filter((l) => l.expect === 'differs').length === 7 && FX.legs.filter((l) => l.expect === 'differs' && l.outcome === 'approved').length === 4,
      'the measured class: 7 invalid legs, 4 of them approved');
  });

  await test('V2a strong source (cmutlr0lo, a registration that carried inputSchema): "requires `getters`, absent here" + `query` not in the schema', () => {
    const f = factOf(leg('cmutlr0lo'));
    assert(f.findings.every((x: any) => x.source === 'harvest-registration' && x.missingRequired?.includes('getters') && x.notInSchema?.includes('query')), JSON.stringify(f.findings));
    const r = renderValidationToolCallsForPrompt(f)!.join('\n');
    assert(r.includes("the service's registered schema requires `getters`, absent here") && r.includes('(harvest-registration)'), r);
  });

  await test('V2b weak source (cmudn5kmd, names-only registration): the invented keys named; the observed wording NEVER says "requires"', () => {
    const f = factOf(leg('cmudn5kmd'));
    assert(f.findings.length === 6 && f.findings.every((x: any) => x.source === 'harvest-observed' && x.neverObserved?.join() === 'target,getter'), JSON.stringify(f.findings[0]));
    const r = renderValidationToolCallsForPrompt(f)!.join('\n');
    assert(r.includes('no successful `fetch_data` call in this leg\'s harvest used `target`, `getter`'), r);
    assert(!/requires|required|missing/i.test(r), `observed wording must not assert a requirement:\n${r}`);
  });

  await test('V2c positional arguments (cmuq21tro: `fetch_data(interfaces_ip, filter_name=ceos1)`) are a finding; its show_commands calls are named UNCHECKED, not invalid', () => {
    const f = factOf(leg('cmuq21tro'));
    assert(f.findings.length === 6 && f.findings.every((x: any) => x.positional === 1), JSON.stringify(f.findings[0]));
    assert(f.unchecked.length === 4 && f.unchecked.every((u: any) => u.tool === 'show_commands' && u.reason === 'schema-not-registered'), JSON.stringify(f.unchecked));
  });

  await test('V3 the optional-argument fixture: omitting `filter_name` (carried by every observed call) is NOT a finding — it can be optional', () => {
    const f = pure("services(action:'call', targetService:'ceos-lab-readonly', tool:'fetch_data', arguments:{ getters:['interfaces_ip'] })");
    assert(f.calls === 1 && f.checkedCalls === 1 && f.findings.length === 0, JSON.stringify(f));
    assert(renderValidationToolCallsForPrompt(f)!.join('\n').includes('none differ'), 'a clean comparison says so');
  });

  await test('V3b omission WITH an invented key: a finding; the omission rides along worded as an observation', () => {
    const f = pure("services(action:'call', targetService:'ceos-lab-readonly', tool:'fetch_data', arguments:{ getter:'interfaces_ip' })");
    const x = f.findings[0];
    assert(f.findings.length === 1 && x.source === 'harvest-observed' && x.neverObserved.join() === 'getter' && x.notCarriedObserved.join() === 'filter_name,getters', JSON.stringify(f));
    const r = renderValidationToolCallsForPrompt(f)!.join('\n');
    assert(r.includes('omitted here (observation only — an argument can be optional)') && !/requires/i.test(r), r);
  });

  await test('V4a source order: a ROW schema outranks the registration and the observed calls', () => {
    const rows = new Map<string, unknown>([[SVC, { tools: [{ name: 'fetch_data', inputSchema: { type: 'object', required: ['getters'], properties: { getters: {}, filter_name: {} } } }] }]]);
    const f = pure("fetch_data(getter='interfaces_ip', filter_name='ceos1')", HARVEST, rows);
    assert(f.findings[0].source === 'service-row' && f.findings[0].missingRequired.join() === 'getters' && f.findings[0].serviceId === SVC, JSON.stringify(f.findings));
  });

  await test('V4b a schema that ALLOWS extra keys: an unlisted key alone is not a finding (asserted only when additionalProperties is false)', () => {
    const rows = new Map<string, unknown>([[SVC, { tools: [{ name: 'fetch_data', inputSchema: { required: ['getters'], properties: { getters: {} } } }] }]]);
    assert(pure("fetch_data(getters=['x'], extra='y')", HARVEST, rows).findings.length === 0, 'additional allowed ⇒ no finding');
    const strict = new Map<string, unknown>([[SVC, { tools: [{ name: 'fetch_data', inputSchema: { required: ['getters'], properties: { getters: {} }, additionalProperties: false } }] }]]);
    assert(pure("fetch_data(getters=['x'], extra='y')", HARVEST, strict).findings[0]?.notInSchema?.join() === 'extra', 'additionalProperties:false ⇒ finding');
  });

  await test('V4c no schema and no successful call of the tool ⇒ the NAMED reason, never a finding; an unknown named service ⇒ service-not-resolved', () => {
    const f = pure("show_commands(command='show ip route')", [...HARVEST, okCall({ commands: ['x'] }, 'show_commands')].slice(0, 2).concat([
      { tool: 'services', success: true, arguments: { action: 'call', targetService: 'ceos-lab-readonly', tool: 'show_commands', arguments: { command: 'x' } },
        result: { content: [{ data: { targetService: 'ceos-lab-readonly', success: true, metadata: { targetServiceId: SVC } } }], rawHead: 'validation errors for call[run_show_commands]' } } as never]));
    assert(f.findings.length === 0 && f.unchecked?.[0]?.reason === 'schema-not-registered', `a REJECTED harvest call is not an observation: ${JSON.stringify(f)}`);
    const g = pure("services(action:'call', targetService:'other-svc', tool:'fetch_data', arguments:{ getters:['x'] })");
    assert(g.unchecked?.[0]?.reason === 'service-not-resolved' && g.findings.length === 0, JSON.stringify(g));
  });

  // ── the enrichment (impure half), through the shared authoritative-read stub ──
  const stubDb = (protocol: string | null, opts: { noStage?: boolean; harvest?: unknown[]; row?: unknown } = {}) => {
    const exec = { id: 'exec-h', taskId: 'harvester', createdAt: new Date(), result: { finalResponse: 'harvest', toolCalls: opts.harvest ?? HARVEST } };
    return {
      ...authoritativeReadStub([exec as never]),
      task: {
        findUnique: async ({ where }: { where: { id: string } }) => where.id === 'author' ? { stageId: opts.noStage ? null : 'stage-1' }
          : where.id === 'leg-1' ? { title: 'Leg', metadata: protocol ? { protocol } : {} } : null,
        findMany: async () => [{ id: 'harvester', title: 'Harvest current state', agentRole: 'infra_state_harvester' }, { id: 'author', title: 'Author', agentRole: 'config_change_author' }],
      },
      stage: { findUnique: async () => ({ metadata: { harnessTaskId: 'leg-1' } }) },
      mCPTool: { findUnique: async () => (opts.row === undefined ? null : { capabilities: opts.row }) },
    } as never;
  };
  const AUTH = pkg("services(action:'call', targetService:'ceos-lab-readonly', tool:'fetch_data', arguments:{ query:'interfaces', filter_name:'ceos1' })");

  await test('V4d enrichment, network leg: stamped, scope named, harvest source recorded, observed source (row deleted)', async () => {
    const f = await computeValidationToolCallsFact(stubDb('network-provisioning-protocol'), { taskId: 'author', deliverable: AUTH }) as Record<string, any>;
    assert(f !== NOT_STAMPED && f.scope === 'network-provisioning' && f.checked === true && f.harvestSource === 'harvester', JSON.stringify(f));
    assert(f.findings[0]?.source === 'harvest-observed' && f.findings[0].neverObserved.join() === 'query', JSON.stringify(f.findings));
  });

  await test('V4e enrichment, a LIVE row with a schema (the WI-B10 path): the row is the source, keyed on the resolved serviceId', async () => {
    const f = await computeValidationToolCallsFact(stubDb('network-provisioning-protocol',
      { row: { tools: [{ name: 'fetch_data', inputSchema: { required: ['getters'], properties: { getters: {}, filter_name: {} } } }] } }), { taskId: 'author', deliverable: AUTH }) as Record<string, any>;
    assert(f.findings[0]?.source === 'service-row' && f.findings[0].serviceId === SVC && f.findings[0].missingRequired.join() === 'getters', JSON.stringify(f.findings));
  });

  await test('V4f enrichment, NOT a network leg (k8s), no protocol, or no stage: NOT_STAMPED — every other domain stays byte-identical', async () => {
    for (const [p, o] of [['kubernetes-gitops-protocol', {}], [null, {}], ['network-provisioning-protocol', { noStage: true }]] as Array<[string | null, { noStage?: boolean }]>) {
      const f = await computeValidationToolCallsFact(stubDb(p, o), { taskId: 'author', deliverable: AUTH });
      assert(f === NOT_STAMPED, `${p} ${JSON.stringify(o)} → ${JSON.stringify(f)}`);
    }
  });

  await test('V5 render: no validation tool call ⇒ no line; a bare call of an unknown tool is not extracted; argument parsing reads keys and positionals', () => {
    assert(renderValidationToolCallsForPrompt(pure('show ip interface brief')) === null, 'nothing to say');
    assert(extractValidationToolCalls(pkg('ping(10.0.0.1)'), new Set(['fetch_data'])).length === 0, 'unknown bare tool');
    const s = argumentShape("(interfaces_ip, filter_name='ceos1', getters=['a','b'])");
    assert(s.keys.join() === 'filter_name,getters' && s.positional === 1, JSON.stringify(s));
    assert(checkCall({ tool: 'fetch_data', namedService: null, keys: ['getters'], positional: 0, line: 1 },
      { source: 'harvest-observed', serviceId: SVC, carriedByAll: ['getters', 'filter_name'], usedByAny: ['getters', 'filter_name'], calls: 2 }) === null,
    'omission alone under the observed source is not a finding');
  });

  await test('V5b a provenance `"source":` line and a rollback section are never read as validation calls', () => {
    const doc = '## Validation Steps\n\n```json\n{"kind":"cidr","source":"fetch_data(config, retrieve=running) filter_name=ceos1"}\n```\n\n## Rollback validation\n\n```\nfetch_data(bogus=1)\n```\n'; // a ROLLBACK heading that also says "validation" — only the restore exclusion keeps it out (M10)
    assert(extractValidationToolCalls(doc, new Set(['fetch_data'])).length === 0, JSON.stringify(extractValidationToolCalls(doc, new Set(['fetch_data']))));
  });

  await test('V6 the SEAM: a chained Author entry carrying the fact renders it in the Reviewer\'s §6; an entry without it renders no line (byte-identical)', () => {
    const fact = factOf(leg('cmutlr0lo'));
    const withF = renderPipelineContextSection({ chainedFrom: [{ taskTitle: 'Author', agentRole: 'config_change_author', finalResponse: 'pkg', validationToolCalls: fact }] }).join('\n');
    const without = renderPipelineContextSection({ chainedFrom: [{ taskTitle: 'Author', agentRole: 'config_change_author', finalResponse: 'pkg' }] }).join('\n');
    assert(withF.includes('**Validation tool calls (platform fact)**') && withF.includes("registered schema requires `getters`"), withF.slice(0, 400));
    assert(!without.includes('Validation tool calls'), 'no fact ⇒ no line');
  });

  await test('V6b the chainer carries the field ONLY when the Author stamped it (source pin: a conditional spread, never a null key)', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../lib/agents/harness/context-chainer.ts'), 'utf-8');
    assert(/\.\.\.\(\(parsed as \{ validationToolCalls\?: unknown \}\)\.validationToolCalls && typeof/.test(src), 'conditional spread in chainedFrom.push');
    assert(!/validationToolCalls: [^,]*\?\? null/.test(src), 'never stamped as a null key on every entry');
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  if (passed + failed !== declared) { console.error(`❌ SELF-CHECK: ${declared} declared, ${passed + failed} executed`); process.exit(1); }
  process.exit(failed > 0 ? 1 : 0);
}
main();
