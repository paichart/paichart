/**
 * Leg replay lab — L-CS-N GIT-ONLY HARVEST PLANT (owner 2026-11-05, "most customers will have only Git files"). $0.
 *
 * A bench node whose stored leg read its devices LIVE (the devext firewall-a3 edge leg) is re-cast as the same leg in a Git-only world:
 * its frozen Harvester's tool calls are REPLACED, on a snapshot COPY, by one `get_file_contents` per named Git file, served by a
 * committed lab-repo fixture (fixture-tools.ts — the probed github-service shape, the shipping `validateServiceCall`) and persisted
 * through the SHIPPING `buildExecutionResultJson`, exactly as fixtureCaptureReadiness builds them. Every stored copy of the Harvester's
 * result.json is patched and re-read (LK11). Downstream, the shipping capture holds the Git files (held store), L-CS-a computes
 * `liveEvidence` over these calls (gitOnly […]), and a persisted Author's package is re-stamped PURELY over the new held files
 * (`restampPersisted`). The Harvester's TEXT is not rewritten (the Reviewer never reads it; named in the report).
 *
 *   node.harvestFromFixture: { fixture: "<dir relative to the experiment>", paths: ["network/base/ceos1-startup.cfg", …], ref?: "main" }
 */
import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';
import { parseLabSampleSource } from './lab-sample';
import { loadFileFixture, createFixtureToolServer, FIXTURE_TOOL, LAB_PERSIST_LOGGER } from './fixture-tools';
import { buildExecutionResultJson } from '../../lib/services/execution-artifacts';
import { frozenHarvesterEntry } from './held-store';
import type { Snapshot } from './snapshot';

export interface HarvestFromFixture { fixture: string; paths: string[]; ref?: string }
export interface GitHarvestReport { harvesterExecutionId: string; calls: number; copies: number; commit: string; paths: string[]; textUnchanged: true }

export async function gitHarvestCalls(dir: string, spec: HarvestFromFixture): Promise<{ toolCalls: unknown[]; commit: string }> {
  const fx = loadFileFixture(path.resolve(dir, spec.fixture));
  const service = fx.serviceNames[0];
  const recs: Array<Record<string, unknown>> = [];
  for (const p of spec.paths) {
    if (!fx.files.has(p)) throw new Error(`git-harvest-plant: ${p} is not in fixture ${spec.fixture}`);
    const args = { owner: fx.spec.owner, repo: fx.spec.repo, path: p, ref: spec.ref ?? 'main' };
    const srv = createFixtureToolServer(fx, null, null);
    const result = await srv.executeToolOnServer('lab', 'services', { action: 'call', targetService: service, tool: FIXTURE_TOOL, arguments: args });
    recs.push({ tool: 'services', success: true, arguments: { action: 'call', targetService: service, tool: FIXTURE_TOOL, arguments: args }, result });
  }
  const rj = buildExecutionResultJson({ taskId: 't', taskTitle: 'lab', agentRole: 'infra_state_harvester', modelUsed: 'lab', finalResponse: '', confidenceScore: null,
    turnCount: recs.length, maxToolTurns: recs.length, toolCallResults: recs as any, successfulToolCalls: recs.length, failedToolCalls: 0, executionTime: 0, tokensUsed: 0,
    correctionTurnUsed: false, logger: LAB_PERSIST_LOGGER } as any) as { toolCalls?: unknown[] };
  if (!Array.isArray(rj.toolCalls) || rj.toolCalls.length !== recs.length) throw new Error('git-harvest-plant: the shipping persist did not return one stored call per read');
  return { toolCalls: rj.toolCalls, commit: fx.spec.commit };
}

export async function withGitHarvest(snap: Snapshot, dir: string, spec: HarvestFromFixture): Promise<{ snap: Snapshot; report: GitHarvestReport }> {
  const { toolCalls, commit } = await gitHarvestCalls(dir, spec);
  const h = frozenHarvesterEntry(snap);
  const copy: Snapshot = JSON.parse(JSON.stringify(snap));
  const arts = copy.childArtifacts.filter((a) => a.executionId === h.executionId && a.name === 'result.json');
  if (!arts.length) throw new Error(`git-harvest-plant: no stored result.json for the frozen Harvester ${h.executionId}`);
  for (const a of arts) {
    const r = JSON.parse(a.content) as Record<string, unknown>;
    // The device-lane facts the stored harvest carried describe the OLD calls — drop them (recomputed downstream where the lab does).
    for (const k of ['deviceSourceReads', 'gitDeviceComparison', 'liveEvidence', 'heldBytes']) delete r[k];
    a.content = JSON.stringify({ ...r, toolCalls });
    if (JSON.stringify((JSON.parse(a.content) as { toolCalls: unknown }).toolCalls) !== JSON.stringify(toolCalls)) throw new Error('git-harvest-plant: re-read mismatch');
  }
  return { snap: copy, report: { harvesterExecutionId: h.executionId, calls: toolCalls.length, copies: arts.length, commit, paths: spec.paths, textUnchanged: true } };
}

/**
 * L-CS-N ADDENDUM (h) — `node.harvestFromSample: 'lab-sample:<run>/<H node>/<H arm>/<i>'`: the same re-cast as `withGitHarvest`, but the
 * replacing calls are a step-3 Harvester LAB SAMPLE's own persisted calls (its `toolCalls.json`, already in the shipping persist shape).
 * Used by a Reviewer bench node whose fact must describe a live-read harvest the stored leg never made (R-FWA3-FIXED: ceos2 declared
 * `live-read` and read whole). Refused unless: the sample exists, did not error, is VALID (its recorded / fixture tiers served it), is a
 * Harvester sample, its run's node replays the SAME production Harvester this snapshot chains, and that run's arm read the protocol text
 * whose sha the caller pins (`expectProtocolSha256`). Every stored copy is patched and re-read; the Harvester's text is not rewritten
 * (the Reviewer never reads it; named in the report).
 */
export interface SampleHarvestReport { harvesterExecutionId: string; source: string; calls: number; copies: number; toolCallsSha256: string; protocolSha256: string; textUnchanged: true }
export function withSampleHarvest(snap: Snapshot, source: string, expectProtocolSha256: string, runsDir = path.join(__dirname, 'runs')): { snap: Snapshot; report: SampleHarvestReport } {
  const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
  const ref = parseLabSampleSource(source);
  const runDir = path.join(runsDir, ref.run);
  const sdir = path.join(runDir, ref.node, ref.arm, `sample-${String(ref.i).padStart(2, '0')}`);
  const fail = (why: string): never => { throw new Error(`harvestFromSample ${source}: ${why}`); };
  if (!fs.existsSync(path.join(sdir, 'sample.json'))) fail('no sample there');
  const sample = JSON.parse(fs.readFileSync(path.join(sdir, 'sample.json'), 'utf8'));
  if (sample.error) fail(`the sample errored (${sample.error})`);
  if (sample.node !== ref.node || sample.variant !== ref.arm || sample.i !== ref.i) fail(`sample.json names ${sample.node}/${sample.variant}/${sample.i}`);
  if (sample.harvesterOnly !== true) fail('not a Harvester sample');
  if (sample.valid !== true) fail('the sample is not VALID (its recorded or fixture tier did not serve it)');
  const manifest = JSON.parse(fs.readFileSync(path.join(runDir, 'manifest.json'), 'utf8'));
  const mn = manifest.nodes?.[ref.node];
  if (!mn || mn.harvesterOnly !== true) fail(`run node ${ref.node} is not a harvester node`);
  const h = frozenHarvesterEntry(snap);
  if (mn.authorExecutionId !== h.executionId) fail(`the sample replays Harvester ${mn.authorExecutionId}; this snapshot chains ${h.executionId}`);
  const protoFile = path.join(runDir, ref.node, ref.arm, 'protocol.md');
  if (!fs.existsSync(protoFile)) fail('the run saved no protocol.md for that arm');
  const protocolSha256 = sha(fs.readFileSync(protoFile, 'utf8'));
  if (protocolSha256 !== expectProtocolSha256) fail(`the sample's arm read protocol ${protocolSha256.slice(0, 12)}, this node's arm reads ${expectProtocolSha256.slice(0, 12)}`);
  const tcText = fs.readFileSync(path.join(sdir, 'toolCalls.json'), 'utf8');
  const toolCalls = JSON.parse(tcText);
  if (!Array.isArray(toolCalls) || !toolCalls.length) fail('the sample stored no tool calls');
  const copy: Snapshot = JSON.parse(JSON.stringify(snap));
  const arts = copy.childArtifacts.filter((a) => a.executionId === h.executionId && a.name === 'result.json');
  if (!arts.length) fail(`no stored result.json for the frozen Harvester ${h.executionId}`);
  for (const a of arts) {
    const r = JSON.parse(a.content) as Record<string, unknown>;
    for (const k of ['deviceSourceReads', 'gitDeviceComparison', 'liveEvidence', 'heldBytes']) delete r[k];
    a.content = JSON.stringify({ ...r, toolCalls });
    if (JSON.stringify((JSON.parse(a.content) as { toolCalls: unknown }).toolCalls) !== JSON.stringify(toolCalls)) fail('re-read mismatch');
  }
  return { snap: copy, report: { harvesterExecutionId: h.executionId, source, calls: toolCalls.length, copies: arts.length, toolCallsSha256: sha(tcText), protocolSha256, textUnchanged: true } };
}
