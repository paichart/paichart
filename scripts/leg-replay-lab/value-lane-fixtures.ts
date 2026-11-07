/**
 * Leg replay lab — VALUE-LEG-GIT fixtures (`vlg-fixtures`, 2026-11-06, model-evaluation). $0: cached snapshots + the committed Git
 * fixture only; no network, no production read (every snapshot named here must already be in the lab cache — a miss throws).
 *
 * Builds, into the gitignored lab cache (`cache/vlg/`, production device data):
 *   device-pool.json         the Harvester cells' device tier (network-fixtures.ts B4 pool): ceos1/ceos2 `config` from the replayed
 *                            Harvester's OWN stored reads (the 1.26.0 canary value leg), the narrow getters (interfaces, interfaces_ip,
 *                            bgp_config, …) from the L-N1 X-DERIV value-leg Harvester's stored reads of the same rig, that
 *                            registration's id re-stamped to the replayed leg's (exactly once per entry); R10 placeholders restored to
 *                            the lab canary values (as L-CS-N); proved: identity (each inner result = its record), reversal (un-planting
 *                            = the proved pool), no placeholder left.
 *   device-pool-plant3.json  the same pool + the I3 PLANT on ceos1: `interface Loopback15` (description telemetry-exporter (existing
 *                            allocation), 10.99.0.3/32) + its BGP `network` line in the running config, and the same interface in the
 *                            `interfaces` / `interfaces_ip` getters — an allocation on the running device that its Git file does not hold.
 *   harvest-git-only.calls.json  the frozen Git-only harvest's calls: one get_file_contents per switch (fixture l-n1-0b35ce3, ref main).
 *   harvest-git-live.calls.json  ceos1 git-file + device-read, ceos2 git-file: the replayed leg's stored descriptor `registry register`,
 *                            ceos1's Git read, ceos1's running config WITH the plant, ceos2's Git read.
 * Both call files go through the SHIPPING persist (`buildExecutionResultJson`: R9/R10 at persist), so they are what a stored
 * result.json would hold. Prints each file's sha256 (the experiment pins them).
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { loadSnapshot } from './snapshot';
import { parsedResult } from './rebuild';
import { buildDevicePool, provePool, plantDevicePool, provePlants, type DevicePool, type DevicePlant } from './network-fixtures';
import { loadFileFixture, createFixtureToolServer, FIXTURE_TOOL, LAB_PERSIST_LOGGER } from './fixture-tools';
import { buildExecutionResultJson } from '../../lib/services/execution-artifacts';

export const VLG_HARVESTER = 'cmw478njh002kyx2v0v0t3goy';         // the 1.26.0 canary's value-leg Harvester (NET-VALUE-C126's leg)
export const VLG_NARROW_SOURCE = 'cmuwbn2vm00g6yx9dwf1q6lit';     // the L-N1 X-DERIV value-leg Harvester (same rig, narrow getters)
export const VLG_CANARY_B_HARVESTER = 'cmw4vrkll005eyxr3tlj2a38r'; // canary B's CHANGE-leg Harvester (network text batch 1)
const SERVICE = 'ceos-lab-readonly';
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
const j = (s: string) => JSON.stringify(s).slice(1, -1); // a string as it appears inside JSON text

/** The I3 plant: an allocation the running ceos1 holds and its Git file does not. */
export const PLANT3: DevicePlant[] = [
  { host: 'ceos1', getter: 'config', find: j('interface Loopback13\n   description telemetry-exporter (existing allocation)\n   ip address 10.99.0.29/32\n!\n'),
    replace: j('interface Loopback13\n   description telemetry-exporter (existing allocation)\n   ip address 10.99.0.29/32\n!\ninterface Loopback15\n   description telemetry-exporter (existing allocation)\n   ip address 10.99.0.3/32\n!\n'),
    count: 1, why: 'I3: 10.99.0.3/32 configured on the device, never committed' },
  { host: 'ceos1', getter: 'config', find: j('      network 10.99.0.29/32\n'), replace: j('      network 10.99.0.29/32\n      network 10.99.0.3/32\n'), count: 1, why: 'its BGP network statement' },
  { host: 'ceos1', getter: 'interfaces_ip', find: '"Loopback13":{"ipv4":{"10.99.0.29":{"prefix_length":32}},"ipv6":{}}',
    replace: '"Loopback13":{"ipv4":{"10.99.0.29":{"prefix_length":32}},"ipv6":{}},"Loopback15":{"ipv4":{"10.99.0.3":{"prefix_length":32}},"ipv6":{}}', count: 1, why: 'the same interface, interfaces_ip getter' },
  { host: 'ceos1', getter: 'interfaces', find: '"Loopback12":{"is_up":true,"is_enabled":true,"description":"telemetry-exporter (existing allocation)","last_flapped":1788907768.9046867,"mtu":65535,"speed":0,"mac_address":""}',
    replace: '"Loopback12":{"is_up":true,"is_enabled":true,"description":"telemetry-exporter (existing allocation)","last_flapped":1788907768.9046867,"mtu":65535,"speed":0,"mac_address":""},"Loopback15":{"is_up":true,"is_enabled":true,"description":"telemetry-exporter (existing allocation)","last_flapped":1788907768.905,"mtu":65535,"speed":0,"mac_address":""}',
    count: 1, why: 'the same interface, interfaces getter' },
];

/** R10 placeholders → the lab canary values (the L-CS-N device-plants values; never scored). */
function secretPlants(): DevicePlant[] {
  const out: DevicePlant[] = [];
  for (const [host, comm] of [['ceos1', 's3cr3tLabComm1'], ['ceos2', 's3cr3tLabComm2']] as const) {
    out.push({ host, getter: 'config', find: 'username <<REDACTED-SECRET>> privilege', replace: 'username admin privilege', count: 1 });
    out.push({ host, getter: 'config', find: 'secret sha512 <<REDACTED-SECRET>>', replace: 'secret sha512 $6$vlgLabSalt$VlgLabFakeHashNotARealCryptValue0123456789abcdefghijABCDEFGHIJ.', count: 1 });
    out.push({ host, getter: 'config', find: 'snmp-server community <<REDACTED-SECRET>> ro', replace: `snmp-server community ${comm} ro`, count: 1 });
  }
  return out;
}

function cachedCalls(id: string): Array<Record<string, any>> {
  const f = path.join(__dirname, 'cache', 'snapshots', `${id}.json`);
  if (!fs.existsSync(f)) throw new Error(`vlg-fixtures: snapshot ${id} is not in the lab cache — this command never reads production`);
  const snap = loadSnapshot(id);
  return (parsedResult(snap.author)!.toolCalls ?? []) as Array<Record<string, any>>;
}

function registrationId(calls: Array<Record<string, any>>): string {
  const reg = calls.find((t) => t.tool === 'registry' && (t.arguments as any)?.action === 'register' && t.success !== false);
  const id = reg?.result?.content?.[0]?.data?.serviceId;
  if (typeof id !== 'string') throw new Error('vlg-fixtures: no successful registry register in the source record');
  return id;
}

function restampIdentity(pool: DevicePool, from: string, to: string, onlyFrom: string): string[] {
  const done: string[] = [];
  for (const e of pool.entries) {
    if (e.from.executionId !== onlyFrom) continue;
    const t = JSON.stringify(e.result);
    const n = t.split(from).length - 1;
    if (n === 0) continue;
    if (n !== 1) throw new Error(`vlg-fixtures identity: ${e.host}/${e.getter} carries ${from} ${n}× (want exactly once)`);
    e.result = JSON.parse(t.split(from).join(to));
    (e as any).identityRestamped = `${from} → ${to}`;
    done.push(`${e.tool}:${e.host ?? ''}/${e.getter ?? ''}`);
  }
  return done;
}

export async function buildVlgFixtures(): Promise<Record<string, string>> {
  const outDir = path.join(__dirname, 'cache', 'vlg');
  fs.mkdirSync(outDir, { recursive: true });
  const hCalls = cachedCalls(VLG_HARVESTER);
  const nCalls = cachedCalls(VLG_NARROW_SOURCE);
  const sources = [{ executionId: VLG_HARVESTER, toolCalls: hCalls }, { executionId: VLG_NARROW_SOURCE, toolCalls: nCalls }];
  const proved = buildDevicePool(sources, [SERVICE]);
  const bad = provePool(proved, new Map(sources.map((s) => [s.executionId, s.toolCalls])));
  if (bad.length) throw new Error(`vlg-fixtures identity FAILED: ${bad.join(' | ')}`);
  const cfg = proved.entries.filter((e) => e.getter === 'config');
  if (cfg.length !== 2 || cfg.some((e) => e.from.executionId !== VLG_HARVESTER)) throw new Error('vlg-fixtures: the two config entries must be the replayed Harvester\'s own reads');
  const toId = registrationId(hCalls); const fromId = registrationId(nCalls);
  const restamped = restampIdentity(proved, fromId, toId, VLG_NARROW_SOURCE);
  const secrets = secretPlants();
  const { pool: base } = plantDevicePool(proved, secrets);
  const r1 = provePlants(proved, base, secrets);
  if (r1.length) throw new Error(`vlg-fixtures secret reversal FAILED: ${r1.join(' | ')}`);
  const { pool: planted } = plantDevicePool(base, PLANT3);
  const r2 = provePlants(base, planted, PLANT3);
  if (r2.length) throw new Error(`vlg-fixtures I3 plant reversal FAILED: ${r2.join(' | ')}`);
  for (const [name, p] of [['device-pool', base], ['device-pool-plant3', planted]] as const) {
    if (/REDACTED-SECRET/.test(JSON.stringify(p.entries.map((e) => e.result?.content?.[0]?.data?.result ?? null)))) throw new Error(`vlg-fixtures: a placeholder survives in ${name}`);
  }
  const noLeak = JSON.stringify(base);
  if (noLeak.includes('10.99.0.3/32') || noLeak.includes('"10.99.0.3"')) throw new Error('vlg-fixtures: 10.99.0.3 is present in the UNPLANTED pool');

  // ── frozen harvest calls ──
  const fx = loadFileFixture(path.join(__dirname, 'fixtures', 'l-n1-0b35ce3'));
  const srv = createFixtureToolServer(fx, null, null);
  const gitRec = async (p: string) => {
    const args = { owner: fx.spec.owner, repo: fx.spec.repo, path: p, ref: 'main' };
    const result = await srv.executeToolOnServer('lab', 'services', { action: 'call', targetService: 'github-service', tool: FIXTURE_TOOL, arguments: args });
    return { tool: 'services', success: true, arguments: { action: 'call', targetService: 'github-service', tool: FIXTURE_TOOL, arguments: args }, result };
  };
  const raw = (t: Record<string, any>) => ({ tool: t.tool, success: t.success !== false, arguments: t.arguments, result: t.result });
  const reg = hCalls.find((t) => t.tool === 'registry' && (t.arguments as any)?.action === 'register')!;
  // The frozen calls are STORED shape: the device text keeps its R10 placeholders (buildExecutionResultJson does not redact — R10 runs in
  // the tool loop), so the plant goes onto the PROVED (stored) pool, never the secret-restored one.
  const { pool: storedPlanted } = plantDevicePool(proved, PLANT3);
  const cfg1 = storedPlanted.entries.find((e) => e.getter === 'config' && e.host === 'ceos1')!;
  const cfg1Stored = hCalls[cfg1.from.index];
  const persist = (recs: Array<Record<string, any>>) => {
    const rj = buildExecutionResultJson({ taskId: 't', taskTitle: 'lab', agentRole: 'infra_state_harvester', modelUsed: 'lab', finalResponse: '', confidenceScore: null,
      turnCount: recs.length, maxToolTurns: recs.length, toolCallResults: recs as any, successfulToolCalls: recs.length, failedToolCalls: 0, executionTime: 0, tokensUsed: 0,
      correctionTurnUsed: false, logger: LAB_PERSIST_LOGGER } as any) as { toolCalls?: unknown[] };
    if (!Array.isArray(rj.toolCalls) || rj.toolCalls.length !== recs.length) throw new Error('vlg-fixtures: the shipping persist did not return one stored call per record');
    return rj.toolCalls;
  };
  const gitOnly = persist([await gitRec('network/base/ceos1-startup.cfg'), await gitRec('network/base/ceos2-startup.cfg')]);
  const gitLive = persist([raw(reg), await gitRec('network/base/ceos1-startup.cfg'),
    { tool: 'services', success: true, arguments: cfg1Stored.arguments, result: cfg1.result }, await gitRec('network/base/ceos2-startup.cfg')]);
  const liveText = JSON.stringify(gitLive);
  if (!liveText.includes(j('ip address 10.99.0.3/32'))) throw new Error('vlg-fixtures: the persisted git-live calls lost the I3 plant');
  if (JSON.stringify(gitOnly).includes('10.99.0.3/32')) throw new Error('vlg-fixtures: the Git-only calls carry 10.99.0.3');
  if (/s3cr3tLabComm|vlgLabSalt/.test(JSON.stringify((gitLive as any[])[2]))) throw new Error('vlg-fixtures: a lab canary secret reached the stored-shape device call (the Git files carry the lab repo\'s own canary; the device text must keep its R10 placeholders)');

  const files: Record<string, string> = {
    'device-pool.json': JSON.stringify({ ...base, built: { restamped, secretPlants: secrets.length, from: [VLG_HARVESTER, VLG_NARROW_SOURCE] } }, null, 1),
    'device-pool-plant3.json': JSON.stringify({ ...planted, built: { restamped, secretPlants: secrets.length, plant3: PLANT3.map((p) => `${p.host}/${p.getter}: ${p.why}`), from: [VLG_HARVESTER, VLG_NARROW_SOURCE] } }, null, 1),
    'harvest-git-only.calls.json': JSON.stringify(gitOnly, null, 2),
    'harvest-git-live.calls.json': JSON.stringify(gitLive, null, 2),
  };
  // Network text batch 1 (2026-11-07): the canary B CHANGE-leg Harvester's own pool (its config reads + the same narrow getters,
  // re-stamped to ITS registration), secrets restored, no plant — its registration id must match its record (capture identity).
  const bCalls = cachedCalls(VLG_CANARY_B_HARVESTER);
  const bSources = [{ executionId: VLG_CANARY_B_HARVESTER, toolCalls: bCalls }, { executionId: VLG_NARROW_SOURCE, toolCalls: nCalls }];
  const bProved = buildDevicePool(bSources, [SERVICE]);
  const bBad = provePool(bProved, new Map(bSources.map((x) => [x.executionId, x.toolCalls])));
  if (bBad.length) throw new Error(`vlg-fixtures canary B identity FAILED: ${bBad.join(' | ')}`);
  if (bProved.entries.filter((e) => e.getter === 'config' && e.from.executionId === VLG_CANARY_B_HARVESTER).length !== 2) throw new Error('vlg-fixtures: canary B config entries must be its own two reads');
  const bRestamped = restampIdentity(bProved, fromId, registrationId(bCalls), VLG_NARROW_SOURCE);
  const { pool: bBase } = plantDevicePool(bProved, secrets);
  const bR = provePlants(bProved, bBase, secrets);
  if (bR.length) throw new Error(`vlg-fixtures canary B secret reversal FAILED: ${bR.join(' | ')}`);
  if (/REDACTED-SECRET/.test(JSON.stringify(bBase.entries.map((e) => e.result?.content?.[0]?.data?.result ?? null)))) throw new Error('vlg-fixtures: a placeholder survives in the canary B pool');
  files['device-pool-canary-b.json'] = JSON.stringify({ ...bBase, built: { restamped: bRestamped, secretPlants: secrets.length, from: [VLG_CANARY_B_HARVESTER, VLG_NARROW_SOURCE] } }, null, 1);
  const shas: Record<string, string> = {};
  for (const [f, t] of Object.entries(files)) { fs.writeFileSync(path.join(outDir, f), t); shas[`cache/vlg/${f}`] = sha(t); }
  console.log(`vlg-fixtures: pool ${base.entries.length} entries (config ×2 from ${VLG_HARVESTER}; ${restamped.length} narrow entries re-stamped ${fromId} → ${toId}); secrets restored ${secrets.length}; I3 plant ${PLANT3.length} sites`);
  for (const [f, h] of Object.entries(shas)) console.log(`  ${h}  ${f}`);
  return shas;
}
