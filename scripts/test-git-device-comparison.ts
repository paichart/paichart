/**
 * held-network step 3 batch 2b (P5 / S3-C) — the mechanical Git-file vs device comparison (git-device-comparison.ts) and the two
 * Harvester facts that use it (device-source-facts.ts), with the PLANTED fixtures STEP2-TEXT-DRAFT §10 owes:
 *   a line moved between parents ⇒ a difference; rendered defaults, intra-block reorder, `end` / banner / comments ⇒ not.
 * The DEVICE side is a real stored running configuration (scripts/fixtures/quote-fidelity/neg-net-harvest.json — lab device, lab
 * credentials only); the GIT side is an operator-authored startup file built for it (comments, a banner, a different block order).
 *
 * Run: npx ts-node -r tsconfig-paths/register scripts/test-git-device-comparison.ts
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@127.0.0.1:5432/stub';
process.env.PAICHART_SKIP_DB_CONNECT = 'true';
process.env.ARTIFACT_SECRET_REDACT_ENABLED = 'true';
import * as fs from 'fs';
import * as path from 'path';
import { compareGitWithDevice as compareAny, configEntries, renderGitDeviceComparisonForPrompt, DIFFERENCE_LIST_CAP, type ComparisonResult } from '../lib/agents/harness/git-device-comparison';
/** push 2 (v2): every pair here is in a parsed, comparable form — the hierarchy-form states are pinned in test-config-hierarchy.ts. */
const compareGitWithDevice = (a: string, b: string): ComparisonResult => { const r = compareAny(a, b); if (r.state !== 'compared') throw new Error(`not compared: ${JSON.stringify(r)}`); return r; };
import { computeDeviceSourceReads, computeGitDeviceComparison } from '../lib/agents/harness/device-source-facts';
import { resolveLegDeviceSources } from '../lib/agents/harness/device-sources';
import { renderPipelineContextSection } from '../lib/agents/harness/render-pipeline-context';
import { GIT_DEVICE_COMPARISON_READERS } from '../lib/agents/harness/context-chainer';

let passed = 0; let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`✅ ${name}`); } catch (e) { failed++; console.log(`❌ ${name}\n   ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

type Rec = Record<string, any>;
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/quote-fidelity/neg-net-harvest.json'), 'utf8')) as { toolCalls: Rec[] };
const configCall = FIX.toolCalls.find((t) => t.tool === 'services' && JSON.stringify(t.arguments).includes('"fetch_data"'))!;
const hosts = configCall.result.content[0].data.result.structuredContent.hosts as Rec;
const DEV = Object.keys(hosts)[0];
const DEVICE = hosts[DEV].output.config.running as string;
const SVC = String(configCall.result.content[0].data.targetService);

/** The operator's Git startup file for the same device: no rendered defaults, comments + a banner, blocks and lines reordered. */
const GIT = [
  `! Startup configuration for ${DEV} — authored in Git; comments are never compared`,
  `hostname ${DEV}`,
  '!',
  'banner login',
  'Authorised access only — this line is not configuration',
  'EOF',
  '!',
  'router ospf 1',
  '   max-lsa 12000',
  '   network 10.0.12.0/30 area 0.0.0.0',
  '   network 1.1.1.1/32 area 0.0.0.0',
  '   passive-interface Loopback0',
  '   router-id 1.1.1.1',
  '!',
  'interface Loopback0',
  '   ip address 1.1.1.1/32',
  '   description router-id / migration anchor',
  '!',
  'interface Ethernet1',
  '   ip ospf network point-to-point',
  '   ip ospf cost 10',
  '   ip address 10.0.12.1/30',
  '   no switchport',
  '   description to-ceos2 (ospf cost 10)',
  '!',
  'management api http-commands',
  '   no shutdown',
  '   protocol http',
  '   !',
  '   vrf default',
  '      no shutdown',
  '!',
  'snmp-server community gitSideComm42 ro',
  'ip routing',
  '!',
  'end',
  '',
].join('\n');

(async () => {
  await test('P0 the planted Git file vs the real running config: NO difference (rendered defaults, reorder, comments, banner, end, a differing secret)', () => {
    const r = compareGitWithDevice(GIT, DEVICE);
    assert(r.differencesTotal === 0, JSON.stringify(r.differences));
    assert(r.deviceOnlyLines > 0, 'the device renders lines the file does not state (defaults) — counted, never listed');
  });

  await test('P1 a line MOVED between parents ⇒ a `moved` difference naming both parents', () => {
    const moved = GIT.replace('   ip address 10.0.12.1/30\n', '').replace('   ip address 1.1.1.1/32\n', '   ip address 1.1.1.1/32\n   ip address 10.0.12.1/30\n');
    const r = compareGitWithDevice(moved, DEVICE);
    assert(r.differencesTotal === 1 && r.differences[0].kind === 'moved', JSON.stringify(r.differences));
    assert(JSON.stringify(r.differences[0].gitParents) === '["interface Loopback0"]' && JSON.stringify(r.differences[0].deviceParents) === '["interface Ethernet1"]', JSON.stringify(r.differences[0]));
  });

  await test('P2 a NESTED move (a child moved to another block two levels deep) and a line absent on the device', () => {
    const g = GIT.replace('      no shutdown\n', '      no shutdown\n      ip routing\n').replace('ip routing\n!\nend', '!\nend') + 'ntp server 192.0.2.1\n';
    const r = compareGitWithDevice(g, DEVICE);
    const kinds = r.differences.map((d) => `${d.kind}:${d.line}`).sort();
    assert(JSON.stringify(kinds) === JSON.stringify(['absent-on-device:ntp server 192.0.2.1', 'moved:ip routing']), JSON.stringify(r.differences));
    const mv = r.differences.find((d) => d.kind === 'moved')!;
    assert(mv.gitParents.join(' > ') === 'management api http-commands > vrf default' && mv.deviceParents!.length === 0, JSON.stringify(mv));
  });

  await test('P3 banners with a delimiter (multi-line and one-line), brace-only lines and indentation width are structure, not lines', () => {
    const a = 'banner motd ^C\nhello\nworld ^C\nhostname x\ninterface A\n description d\n';
    const b = 'hostname x\nbanner motd #one line#\ninterface A\n      description d\n}\n';
    assert(compareGitWithDevice(a, b).differencesTotal === 0, JSON.stringify(compareGitWithDevice(a, b)));
    const junos = 'interfaces {\n    ge-0/0/0 {\n        description up;\n        mtu 9000;\n    }\n}\n';
    const junosReordered = 'interfaces {\n    ge-0/0/0 {\n        mtu 9000;\n        description up;\n    }\n}\n';
    assert(compareGitWithDevice(junos, junosReordered).differencesTotal === 0, 'brace config reorder');
    const junosMoved = 'interfaces {\n    ge-0/0/1 {\n        mtu 9000;\n    }\n    ge-0/0/0 {\n        description up;\n    }\n}\n';
    assert(compareGitWithDevice(junosMoved, junosReordered).differences.some((d) => d.kind === 'moved' && d.line === 'mtu 9000;'), 'brace config move');
    assert(configEntries('end\n!\n# x\n').length === 0, 'end / comments');
  });

  await test('P4 SECRETS: a difference line is emitted R10-redacted in context, never in clear', () => {
    const g = `${GIT}username ops secret 0 PlainPassw0rdX\nsnmp-server host 192.0.2.9 version 2c topSecretComm9\n`;
    const r = compareGitWithDevice(g, DEVICE);
    const text = JSON.stringify(r);
    assert(r.differencesTotal >= 2 && !/PlainPassw0rdX|topSecretComm9|gitSideComm42/.test(text), text);
  });

  await test('P5 the list is capped (total stays exact) and long lines are cut', () => {
    const many = Array.from({ length: 60 }, (_, i) => `ip route 10.${i}.0.0/16 192.0.2.1 ${'x'.repeat(i === 0 ? 400 : 1)}`).join('\n');
    const r = compareGitWithDevice(`${GIT}${many}\n`, DEVICE);
    assert(r.differencesTotal === 60 && r.differences.length === DIFFERENCE_LIST_CAP, `${r.differencesTotal} / ${r.differences.length}`);
    assert(r.differences[0].line.length <= 161, `cap ${r.differences[0].line.length}`);
  });

  // ── the facts ──
  const gitCall = {
    tool: 'services', success: true, arguments: { action: 'call', targetService: 'github-service', tool: 'get_file_contents' },
    result: { content: [{ type: 'data', data: { success: true, targetService: 'github-service', tool: 'get_file_contents', metadata: { targetServiceId: 'svc-gh' },
      arguments: { owner: 'paichart', repo: 'paichart-lab-configs', path: `network/base/${DEV}-startup.cfg` },
      result: { content: [{ type: 'text', text: 'successfully downloaded text file' }, { type: 'resource', resource: {
        uri: `repo://paichart/paichart-lab-configs/sha/${'a'.repeat(40)}/contents/network/base/${DEV}-startup.cfg`, mimeType: 'text/plain', text: GIT } }] } } }] },
  };
  const lines = [`${DEV}: git-file — service github-service ; paichart/paichart-lab-configs/network/base/${DEV}-startup.cfg`, `${DEV}: device-read — service ${SVC}`];
  const sources = resolveLegDeviceSources({ contractValue: lines, taskBody: null });
  const records = [gitCall, configCall];

  await test('F1 gitDeviceComparison: both sources declared and read ⇒ compared, 0 differences on the planted pair; the Git read is matched on owner/repo/path', () => {
    const f = computeGitDeviceComparison(sources, records) as Rec;
    assert(f.checked === true && f.comparedDevices === 1 && f.devices[0].state === 'compared' && f.devices[0].differencesTotal === 0, JSON.stringify(f));
    assert(f.devices[0].gitFile.toolCallIndex === 0 && f.devices[0].deviceRead.toolCallIndex === 1, JSON.stringify(f.devices[0]));
  });

  await test('F2 gitDeviceComparison named states: no device with both ⇒ not checked; a Git read at another ref / path ⇒ no-git-file-text; no device read ⇒ no-device-config-text', () => {
    const one = computeGitDeviceComparison(resolveLegDeviceSources({ contractValue: [lines[1]], taskBody: null }), records) as Rec;
    assert(one.checked === false && one.reason === 'no-device-declares-both-sources', JSON.stringify(one));
    // Config-sources push 0 (D3): a missing ref IS main, so `@ main` vs a call with no ref is now the SAME read (see F-P0); the case this
    // assertion guards — a line naming a ref the call did not pass — moves to a non-main ref.
    const atRef = computeGitDeviceComparison(resolveLegDeviceSources({ contractValue: [`${lines[0]} @ release`, lines[1]], taskBody: null }), records) as Rec;
    assert(atRef.devices[0].state === 'no-git-file-text', `a ref the call did not pass is not that read: ${JSON.stringify(atRef)}`);
    const noDev = computeGitDeviceComparison(sources, [gitCall]) as Rec;
    assert(noDev.devices[0].state === 'no-device-config-text', JSON.stringify(noDev));
    const none = computeGitDeviceComparison(resolveLegDeviceSources({ contractValue: undefined, taskBody: null }), records) as Rec;
    assert(none.checked === false && none.reason === 'device-sources-absent', JSON.stringify(none));
  });

  await test('F3 deviceSourceReads (F-NW1 platform half): each declared source → its read call or a named state; undeclared config reads are counted', () => {
    const f = computeDeviceSourceReads(sources, records) as Rec;
    assert(f.checked === true && f.notRead === 0 && f.declaration.source === 'contract', JSON.stringify(f));
    const s = f.devices[0].sources as Rec[];
    assert(s.find((x) => x.kind === 'git-file')!.read.state === 'read' && s.find((x) => x.kind === 'device-read')!.read.state === 'whole-config', JSON.stringify(s));
    const other = FIX.toolCalls.filter((t) => t.tool === 'services' && JSON.stringify(t.arguments).includes('"fetch_data"'))[1];
    const two = computeDeviceSourceReads(resolveLegDeviceSources({ contractValue: [`${DEV}: device-read — service ${SVC}`, `sw-unread: device-read — service ${SVC}`], taskBody: null }), [configCall, other]) as Rec;
    const unread = (two.devices as Rec[]).find((d) => d.device === 'sw-unread')!.sources[0].read;
    assert(two.notRead === 1 && unread.state === 'not-read' && two.undeclaredDeviceConfigReads === 1, JSON.stringify(two));
    const failedCall = JSON.parse(JSON.stringify(configCall)); failedCall.success = false;
    const failed = computeDeviceSourceReads(resolveLegDeviceSources({ contractValue: [`${DEV}: device-read — service ${SVC}`], taskBody: null }), [failedCall]) as Rec;
    assert(failed.devices[0].sources[0].read.state === 'read-failed', JSON.stringify(failed));
    const absent = computeDeviceSourceReads(resolveLegDeviceSources({ contractValue: undefined, taskBody: 'no block' }), records) as Rec;
    assert(absent.checked === false && absent.reason === 'device-sources-absent' && absent.declaration.state === 'absent', JSON.stringify(absent));
  });

  await test('F-P0 push 0 (D3, execution-facts B1): a missing ref is main on BOTH sides — explicit main, refs/heads/main and a gate-rewritten echo still read', () => {
    const withRef = (ref: string) => {
      const c = JSON.parse(JSON.stringify(gitCall));
      const set = (o: Rec) => { if (o && typeof o === 'object' && o.owner !== undefined && o.path !== undefined) o.ref = ref; };
      const walk = (o: Rec): void => { if (!o || typeof o !== 'object') return; set(o); for (const v of Object.values(o)) walk(v as Rec); };
      walk(c);
      if (typeof c.arguments === 'string') { const a = JSON.parse(c.arguments); walk(a); c.arguments = JSON.stringify(a); }
      return c;
    };
    for (const ref of ['main', 'refs/heads/main']) {
      const f = computeDeviceSourceReads(sources, [withRef(ref), configCall]) as Rec;
      const git = (f.devices[0].sources as Rec[]).find((x) => x.kind === 'git-file')!;
      assert(git.read.state === 'read', `a call carrying ref ${ref} on a line naming no ref must read: ${JSON.stringify(git)}`);
      const c = computeGitDeviceComparison(sources, [withRef(ref), configCall]) as Rec;
      assert(c.devices[0].state === 'compared', `comparison must find the Git text at ref ${ref}: ${JSON.stringify(c.devices[0])}`);
    }
    const atMain = computeDeviceSourceReads(resolveLegDeviceSources({ contractValue: [`${lines[0]} @ main`, lines[1]], taskBody: null }), records) as Rec;
    assert((atMain.devices[0].sources as Rec[]).find((x) => x.kind === 'git-file')!.read.state === 'read', `a line @ main matches a call with no ref (D3): ${JSON.stringify(atMain)}`);
    // sec-ops PUSH0 S-2: `refs/heads/<x>` folds to `<x>` — a line @ release matches a call at refs/heads/release (both gates admit it)
    const atRel = computeDeviceSourceReads(resolveLegDeviceSources({ contractValue: [`${lines[0]} @ release`, lines[1]], taskBody: null }), [withRef('refs/heads/release'), configCall]) as Rec;
    assert((atRel.devices[0].sources as Rec[]).find((x) => x.kind === 'git-file')!.read.state === 'read', `refs/heads/release reads a line @ release: ${JSON.stringify(atRel)}`);
    const other = computeDeviceSourceReads(sources, [withRef('release'), configCall]) as Rec;
    assert((other.devices[0].sources as Rec[]).find((x) => x.kind === 'git-file')!.read.state === 'not-read', 'NEGATIVE CONTROL: a call at another ref is still not that read');
  });

  await test('F4 the §6 SEAM: a carried checked comparison renders facts (no verdict words); an entry without it renders no line', () => {
    const moved = GIT.replace('   ip address 10.0.12.1/30\n', '').replace('   ip address 1.1.1.1/32\n', '   ip address 1.1.1.1/32\n   ip address 10.0.12.1/30\n');
    const f = computeGitDeviceComparison(sources, [{ ...gitCall, result: JSON.parse(JSON.stringify(gitCall.result).split(JSON.stringify(GIT)).join(JSON.stringify(moved))) }, configCall]) as Rec;
    assert(f.devices[0].differencesTotal === 1, JSON.stringify(f));
    const withF = renderPipelineContextSection({ chainedFrom: [{ taskTitle: 'Harvest', agentRole: 'infra_state_harvester', finalResponse: 'x', gitDeviceComparison: f }] } as never).join('\n');
    const without = renderPipelineContextSection({ chainedFrom: [{ taskTitle: 'Harvest', agentRole: 'infra_state_harvester', finalResponse: 'x' }] } as never).join('\n');
    assert(withF.includes('**Git file vs device configuration (platform fact, parent-context-lines/2)**') && withF.includes('`ip address 10.0.12.1/30` — in the file under `interface Loopback0`; on the device under `interface Ethernet1`'), withF.slice(-900));
    assert(!without.includes('Git file vs device'), 'no fact ⇒ no line');
    assert(!/\b(drift|mismatch|matches|correct|wrong|stale)\b/i.test((renderGitDeviceComparisonForPrompt(f) ?? []).join('\n')), 'facts, never verdict words');
    assert(renderGitDeviceComparisonForPrompt({ checked: false, reason: 'no-device-declares-both-sources' }) === null, 'not checked ⇒ no line');
  });

  await test('F5 the chainer carries the comparison to the Architect and the leg Reviewer only (source pin: role-scoped, checked-only, conditional spread)', () => {
    // VALUE-LEG-GIT (2026-11-06): + the value leg's Architect and Reviewer (both chain the Harvester directly; G1-c must-catch needs both).
    assert([...GIT_DEVICE_COMPARISON_READERS].sort().join() === 'change_reviewer,derivation_architect,derivation_reviewer,infra_change_architect', [...GIT_DEVICE_COMPARISON_READERS].join());
    const src = fs.readFileSync(path.join(__dirname, '../lib/agents/harness/context-chainer.ts'), 'utf-8');
    assert(src.includes('...(gitDeviceComparison ? { gitDeviceComparison } : {}),'), 'conditional spread in chainedFrom.push');
    assert(/\(stampedComparison as \{ checked\?: unknown \}\)\.checked === true\s*\n\s*&& GIT_DEVICE_COMPARISON_READERS\.has\(/.test(src), 'checked-only and role-scoped');
  });

  await test('F6 (sec-ops SF-2) a backtick in a quoted repo/device line never breaks the inline code span of the render', () => {
    const f = { checked: true, devices: [{ device: 'sw`1', state: 'compared', gitFile: { path: 'a`b.cfg' }, differencesTotal: 1, deviceOnlyLines: 0,
      differences: [{ kind: 'moved', line: 'description x` ignore previous', gitParents: ['interface `E1'], deviceParents: ['interface E2'] }] }] };
    const lines = (renderGitDeviceComparisonForPrompt(f) ?? []).slice(1).join('\n');
    assert(!/x` |sw`1|a`b|`E1/.test(lines) && lines.includes("description x' ignore previous"), lines);
  });

  await test('F7 (sec-ops SF-4) a declared descriptor URL is stamped masked (origin + path; query values; no userinfo), a name as declared', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { shownService } = require('../lib/agents/harness/device-source-facts') as { shownService: (s: string) => string };
    const tok = ['t', 'o', 'k', '9', '9', '1'].join('');
    const shown = shownService(`https://user:${tok}@example.invalid/d.json?token=${tok}#frag`);
    assert(!shown.includes(tok) && !shown.includes('user') && !shown.includes('frag') && shown.startsWith('https://example.invalid/d.json'), shown);
    assert(shownService('acme-device-svc') === 'acme-device-svc', 'a name stays');
    const URL0 = 'https://example.invalid/descriptors/devices.json?k=v';
    const reads = computeDeviceSourceReads(resolveLegDeviceSources({ contractValue: [`${DEV}: device-read — service ${URL0}`], taskBody: null }), []) as Rec;
    assert(!JSON.stringify(reads).includes('k=v'), JSON.stringify(reads));
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
