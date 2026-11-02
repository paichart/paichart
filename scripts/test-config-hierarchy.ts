/**
 * held-network step 3 push 2 — the hierarchy-form audit (STEP3-INVENTORY §8) and owner decision O-1 (`inside-sub-block`).
 *
 *   H*  config-hierarchy.ts — which form a configuration text expresses its hierarchy in, on SYNTHETIC IOS-style, NX-OS-style,
 *       brace (indented and unindented), `set` and flat texts. Real file/device PAIRS exist for the EOS lab rig only; every other form
 *       here is synthetic (register NETWORK-PLATFORM-PROFILE, NETWORK-SECOND-VENDOR-RIG).
 *   C*  git-device-comparison.ts v2 — the forms decide whether a pair is compared; a pair it cannot read is a NAMED state.
 *   O*  the `inside-sub-block` kind — decided from parent chains only; both directions (a sibling or shallower move stays `moved`).
 *
 * Run: npx ts-node -r tsconfig-paths/register scripts/test-config-hierarchy.ts
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@127.0.0.1:5432/stub';
process.env.PAICHART_SKIP_DB_CONNECT = 'true';
process.env.ARTIFACT_SECRET_REDACT_ENABLED = 'true';
import { configHierarchyForm, formsComparable, isParsedForm } from '../lib/agents/harness/config-hierarchy';
import { compareGitWithDevice, renderGitDeviceComparisonForPrompt, type ComparisonResult } from '../lib/agents/harness/git-device-comparison';

let passed = 0; let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`✅ ${name}`); } catch (e) { failed++; console.log(`❌ ${name}\n   ${(e as Error).message}`); }
}
function eq(a: unknown, b: unknown, what = '') { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c: unknown, m: string) { if (!c) throw new Error(m); }
const compared = (r: ReturnType<typeof compareGitWithDevice>): ComparisonResult => { ok(r.state === 'compared', `not compared: ${JSON.stringify(r)}`); return r as ComparisonResult; };

// ── synthetic texts (generic names, documentation addresses; no vendor rig identifiers) ──
const IOS = ['! Last configuration change', 'hostname edge1', '!', 'interface GigabitEthernet0/1', ' description uplink-a', ' ip address 192.0.2.1 255.255.255.252',
  ' no shutdown', '!', 'interface GigabitEthernet0/2', ' description uplink-b', ' shutdown', '!', 'router bgp 64500', ' bgp router-id 192.0.2.1',
  ' neighbor 192.0.2.2 remote-as 64501', ' !', ' address-family ipv4', '  network 198.51.100.0 mask 255.255.255.0', '  neighbor 192.0.2.2 activate',
  ' exit-address-family', '!', 'line vty 0 4', ' transport input ssh', '!', 'end'].join('\n');
const NXOS = ['!Command: show running-config', '!Time: generic', 'version 9.3(1)', 'hostname edge2', 'feature bgp', 'feature lacp', '',
  'interface Ethernet1/1', '  description uplink-a', '  no switchport', '  ip address 192.0.2.5/30', '  no shutdown', '',
  'router bgp 64502', '  router-id 192.0.2.5', '  address-family ipv4 unicast', '    network 198.51.100.0/24', '  neighbor 192.0.2.6',
  '    remote-as 64503', '    address-family ipv4 unicast'].join('\n');
const BRACES = ['system {', '    host-name edge3;', '    services {', '        ssh;', '    }', '}', 'interfaces {', '    ge-0/0/0 {',
  '        description uplink-a;', '        mtu 9000;', '    }', '    ge-0/0/1 {', '        description uplink-b;', '    }', '}'].join('\n');
const BRACES_FLAT = BRACES.split('\n').map((l) => l.trim()).join('\n'); // the same braces, no indentation
const SET = ['set system host-name edge3', 'set system services ssh', 'set interfaces ge-0/0/0 description uplink-a', 'set interfaces ge-0/0/0 mtu 9000',
  'set interfaces ge-0/0/1 description uplink-b'].join('\n');
const FLAT = ['hostname edge4', 'ip routing', 'ntp server 192.0.2.123'].join('\n');

test('H1 forms: IOS-style and NX-OS-style ⇒ indent; indented braces ⇒ braces; unindented braces ⇒ braces-unindented (NOT parsed); set ⇒ set; flat; empty', () => {
  eq([IOS, NXOS, BRACES, BRACES_FLAT, SET, FLAT, '!\n# only comments\nend\n'].map(configHierarchyForm),
    ['indent', 'indent', 'braces', 'braces-unindented', 'set', 'flat', 'empty']);
  eq([isParsedForm('indent'), isParsedForm('braces'), isParsedForm('set'), isParsedForm('flat'), isParsedForm('braces-unindented')], [true, true, true, true, false]);
});

test('H2 forms: a banner body, a brace inside a banner, and a description ending in a word are not structure', () => {
  eq(configHierarchyForm('banner motd ^C\nsystem {\nhello\n^C\nhostname x\ninterface A\n description d\n'), 'indent');
  eq(configHierarchyForm('set system host-name x\n# comment\nset system ntp server 192.0.2.1\n'), 'set');
  eq(configHierarchyForm('set system host-name x\nhostname y\n'), 'flat', 'a set file with one non-set statement is not set form: ');
});

test('H3 comparable pairs: equal forms; flat vs indent/braces; NEVER set vs another form, indent vs braces, or anything unparsed', () => {
  eq([formsComparable('indent', 'indent'), formsComparable('flat', 'indent'), formsComparable('braces', 'flat'), formsComparable('set', 'set')], [true, true, true, true]);
  eq([formsComparable('set', 'braces'), formsComparable('flat', 'set'), formsComparable('indent', 'braces'), formsComparable('braces-unindented', 'braces-unindented')], [false, false, false, false]);
});

test('C1 IOS-style: reorder, comments, exit-address-family both sides ⇒ 0 differences; a line moved between interfaces ⇒ moved', () => {
  const reordered = IOS.replace(' description uplink-a\n ip address 192.0.2.1 255.255.255.252', ' ip address 192.0.2.1 255.255.255.252\n description uplink-a');
  eq(compared(compareGitWithDevice(reordered, IOS)).differencesTotal, 0);
  const mv = compared(compareGitWithDevice(IOS.replace(' shutdown\n!\nrouter', '!\nrouter').replace(' no shutdown\n', ' no shutdown\n shutdown\n'), IOS));
  eq(mv.differences.map((d) => [d.kind, d.line, d.gitParents.join('>'), (d.deviceParents ?? []).join('>')]),
    [['moved', 'shutdown', 'interface GigabitEthernet0/1', 'interface GigabitEthernet0/2']]);
});

test('C2 NX-OS-style: 2-space indent and a nested neighbor block parse; a nested move is reported with both chains', () => {
  eq(compared(compareGitWithDevice(NXOS, NXOS)).differencesTotal, 0);
  const g = NXOS.replace('    network 198.51.100.0/24\n', '').replace('    remote-as 64503\n', '    remote-as 64503\n    network 198.51.100.0/24\n');
  const r = compared(compareGitWithDevice(g, NXOS));
  eq([r.differencesTotal, r.differences[0].kind, r.differences[0].gitParents, r.differences[0].deviceParents],
    [1, 'moved', ['router bgp 64502', 'neighbor 192.0.2.6'], ['router bgp 64502', 'address-family ipv4 unicast']]);
});

test('C3 braces (indented): a sibling move (ge-0/0/0 → ge-0/0/1) ⇒ moved; reorder ⇒ none', () => {
  const g = BRACES.replace('        mtu 9000;\n', '').replace('        description uplink-b;\n', '        description uplink-b;\n        mtu 9000;\n');
  eq(compared(compareGitWithDevice(g, BRACES)).differences.map((d) => d.kind), ['moved']);
});

test('C4 set form: compared as flat statements — a statement under another path is ANOTHER line (absent-on-device), never a silent pass', () => {
  const g = SET.replace('set interfaces ge-0/0/0 mtu 9000', 'set interfaces ge-0/0/1 mtu 9000');
  const r = compared(compareGitWithDevice(g, SET));
  eq([r.forms, r.differences.map((d) => [d.kind, d.line])], [{ git: 'set', device: 'set' }, [['absent-on-device', 'set interfaces ge-0/0/1 mtu 9000']]]);
});

test('C5 NOT compared, by name: an unindented brace text (either side) ⇒ hierarchy-form-not-parsed; set vs braces / indent vs braces ⇒ hierarchy-forms-differ', () => {
  eq(compareGitWithDevice(BRACES_FLAT, BRACES), { state: 'hierarchy-form-not-parsed', forms: { git: 'braces-unindented', device: 'braces' } });
  eq(compareGitWithDevice(BRACES, BRACES_FLAT).state, 'hierarchy-form-not-parsed');
  // the silent pass the state exists for: moving mtu between blocks in an unindented brace text changes NO (parents, line) pair
  const moved = BRACES_FLAT.replace('mtu 9000;\n', '').replace('description uplink-b;\n', 'description uplink-b;\nmtu 9000;\n');
  eq(compareGitWithDevice(moved, BRACES_FLAT).state, 'hierarchy-form-not-parsed');
  eq(compareGitWithDevice(SET, BRACES), { state: 'hierarchy-forms-differ', forms: { git: 'set', device: 'braces' } });
  eq(compareGitWithDevice(IOS, BRACES).state, 'hierarchy-forms-differ');
  eq(compared(compareGitWithDevice(FLAT, IOS)).forms, { git: 'flat', device: 'indent' });
});

// ── O-1: inside-sub-block — the EOS rig shape (stored pairs cmvmze6p…, cmvn5928…): file `router bgp X › network`, device
//    `router bgp X › address-family ipv4 › network`; `protocol https` stays a difference. Generic values.
const FILE_BGP = ['hostname sw1', 'management api http-commands', '   protocol https', '   no shutdown', 'router bgp 64510', '   router-id 192.0.2.10',
  '   network 198.51.100.1/32', '   network 198.51.100.2/32', '   network 198.51.100.3/32'].join('\n');
const DEV_BGP = ['hostname sw1', 'management api http-commands', '   no shutdown', 'router bgp 64510', '   router-id 192.0.2.10', '   !',
  '   address-family ipv4', '      network 198.51.100.1/32', '      network 198.51.100.2/32', '      network 198.51.100.3/32'].join('\n');

test('O1 the rig shape: the 3 `network` lines ⇒ inside-sub-block (device chain extends the file chain); `protocol https` ⇒ absent-on-device', () => {
  const r = compared(compareGitWithDevice(FILE_BGP, DEV_BGP));
  eq(r.differences.map((d) => [d.kind, d.line, d.deviceParents ?? null]), [
    ['absent-on-device', 'protocol https', null],
    ['inside-sub-block', 'network 198.51.100.1/32', ['router bgp 64510', 'address-family ipv4']],
    ['inside-sub-block', 'network 198.51.100.2/32', ['router bgp 64510', 'address-family ipv4']],
    ['inside-sub-block', 'network 198.51.100.3/32', ['router bgp 64510', 'address-family ipv4']]]);
  eq(r.differencesTotal, 4, 'still reported, never dropped: ');
});

test('O2 the other direction: a SIBLING sub-block move stays moved; a SHALLOWER device chain stays moved; a TOP-LEVEL file line inside a block stays moved', () => {
  const sib = compared(compareGitWithDevice(DEV_BGP.replace('   address-family ipv4', '   address-family ipv6'), DEV_BGP));
  eq(sib.differences.map((d) => [d.kind, d.line.split(' ')[0]]), [['absent-on-device', 'address-family'], ['moved', 'network'], ['moved', 'network'], ['moved', 'network']],
    'address-family ipv6 → ipv4 (siblings under router bgp): ');
  const shallow = compared(compareGitWithDevice(DEV_BGP, FILE_BGP));
  ok(shallow.differences.filter((d) => d.line.startsWith('network')).every((d) => d.kind === 'moved'), JSON.stringify(shallow.differences));
  const top = compared(compareGitWithDevice('hostname sw1\nntp server 192.0.2.123\n', 'hostname sw1\nvrf mgmt\n   ntp server 192.0.2.123\n'));
  eq(top.differences.map((d) => d.kind), ['moved'], 'a top-level line found inside a block: ');
  // a LONGER device chain that does not START with the file's chain is another place, not a sub-block (mutation M2)
  const longer = compared(compareGitWithDevice('router bgp 1\n   network 198.51.100.0/24\n', 'router bgp 1\ninterface E1\n   vrf A\n      network 198.51.100.0/24\n'));
  eq(longer.differences.map((d) => [d.kind, d.deviceParents]), [['moved', ['interface E1', 'vrf A']]]);
});

test('O3 deeper descendants count (P › X › Y); when the device has the line in a sibling AND a sub-block, the sub-block is named', () => {
  const deep = compared(compareGitWithDevice('router bgp 1\n   network 198.51.100.0/24\n', 'router bgp 1\n   vrf blue\n      address-family ipv4\n         network 198.51.100.0/24\n'));
  eq(deep.differences.map((d) => [d.kind, d.deviceParents]), [['inside-sub-block', ['router bgp 1', 'vrf blue', 'address-family ipv4']]]);
  const both = compared(compareGitWithDevice('router bgp 1\n   network 198.51.100.0/24\nrouter bgp 2\n',
    'router bgp 2\n   network 198.51.100.0/24\nrouter bgp 1\n   address-family ipv4\n      network 198.51.100.0/24\n'));
  eq(both.differences.map((d) => d.kind), ['inside-sub-block']);
});

test('O4 render: inside-sub-block is stated as a fact with both chains; a not-compared device names its state and both forms; no verdict words', () => {
  const r = compared(compareGitWithDevice(FILE_BGP, DEV_BGP));
  const fact = { checked: true, method: 'parent-context-lines/2', devices: [{ device: 'sw1', gitFile: { path: 'n/sw1.cfg' }, ...r },
    { device: 'sw2', gitFile: { path: 'n/sw2.cfg' }, ...compareGitWithDevice(SET, BRACES) }] };
  const out = (renderGitDeviceComparisonForPrompt(fact) ?? []).join('\n');
  ok(out.includes('`network 198.51.100.1/32` — in the file under `router bgp 64510`; on the device inside a sub-block of it, under `router bgp 64510` › `address-family ipv4`'), out);
  ok(out.includes('`sw2`: not compared — hierarchy-forms-differ (file form `set`, device form `braces`)'), out);
  ok(!/\b(drift|mismatch|matches|correct|wrong|stale|normali[sz])/i.test(out), 'facts only');
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
