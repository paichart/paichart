/**
 * Leg replay lab — L-S3-a, an AUTHOR cell's whole upstream from lab samples (L-CS-O stage 3, 2026-11-24).
 *
 * WHY. A stage-3 Author cell must read the design an earlier stage's Architect LAB SAMPLE wrote, over the harvest a Harvester LAB SAMPLE
 * read — not the stored production chain. The lab had a Harvester source for an ARCHITECT cell (`harvesterSourceByVariant`, L-K-c) and an
 * Author source for a REVIEWER cell (`authorSourceByVariant`, L-9); nothing bound an Architect sample into an Author's §6.
 *
 *   upstreamFromSamplesByVariant: { <arm>: { harvester: 'lab-sample:<run>/<H node>/<H arm>/<i>',
 *                                             architect: 'lab-sample:<run>/<X node>/<X arm>/<i>' } }
 *
 * The Harvester half is L-K-c exactly (lab.ts `architectHarvesterSource`, run with the AUTHOR as the consumer): its identity checks, its
 * entry rebuild, and the held store built from the SAMPLE's served calls by the shipping capture (as the Architect arm does). This file
 * is the Architect half. An Architect lab sample is accepted only when (refused by name, never borrowed):
 *   - it exists, ran without error, is an `architectOnly` sample, and is the node/arm/i it names;
 *   - its run's node replays the SAME production Architect execution this Author's frozen Architect entry chains;
 *   - its run bound the SAME Harvester sample this Author binds (the run manifest's `harvesterSource.source`) — one harvest, one design;
 *   - the Architect prompt its run saved (author.system.md + author.user.md) is BYTE-IDENTICAL to the one the X node renders NOW (the
 *     caller renders it with the shipping path): the design was written against exactly what this tree would show that Architect.
 * The Author then sees the frozen Architect entry with the chainer's derived fields rebuilt from the sample (chain.ts
 * `chainEntryFromResult`: R9 + the per-predecessor cap, the replay's own leaf stamps); every other field is the frozen one.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { parseLabSampleSource, type LabSampleRef } from './lab-sample';

const RUNS_DIR = path.join(__dirname, 'runs');
const sha256 = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

export interface UpstreamSamplesSpec { harvester: string; architect: string }
export interface LoadedArchitectSample { ref: LabSampleRef; dir: string; text: string; textSha256: string; confidenceScore: number | null; toolCalls: unknown[]; turns: number | null; sampleExecutionId: string }

export function checkUpstreamSpec(nodeId: string, arm: string, spec: unknown): UpstreamSamplesSpec {
  const s = spec as Partial<UpstreamSamplesSpec> | null;
  if (!s || typeof s.harvester !== 'string' || typeof s.architect !== 'string') throw new Error(`${nodeId}/${arm}: upstreamFromSamplesByVariant needs { harvester, architect } lab-sample sources`);
  for (const k of ['harvester', 'architect'] as const) if (!s[k]!.startsWith('lab-sample:')) throw new Error(`${nodeId}/${arm}: upstream ${k} must be lab-sample:<run>/<node>/<arm>/<i>, got ${s[k]}`);
  return { harvester: s.harvester!, architect: s.architect! };
}

/** Read an Architect lab sample and check it is what it claims to be (see the header). `renderedPrompt` = the X node's render NOW. */
export function loadArchitectLabSample(source: string, expect: { architectExecutionId: string; harvesterSource: string; renderedPrompt: { system: string; user: string } },
  runsDir = RUNS_DIR): LoadedArchitectSample {
  const ref = parseLabSampleSource(source);
  const runDir = path.join(runsDir, ref.run);
  const dir = path.join(runDir, ref.node, ref.arm, `sample-${String(ref.i).padStart(2, '0')}`);
  const fail = (why: string): never => { throw new Error(`L-S3-a: ${source} — ${why}`); };
  if (!fs.existsSync(path.join(dir, 'sample.json'))) fail('no sample there');
  const sample = JSON.parse(fs.readFileSync(path.join(dir, 'sample.json'), 'utf8'));
  if (sample.error) fail(`the sample errored (${sample.error})`);
  if (sample.node !== ref.node || sample.variant !== ref.arm || sample.i !== ref.i) fail(`sample.json names ${sample.node}/${sample.variant}/${sample.i}`);
  if (sample.architectOnly !== true) fail('not an Architect sample');
  if (!fs.existsSync(path.join(dir, 'author.md'))) fail('the sample saved no design (author.md)');
  const manifest = JSON.parse(fs.readFileSync(path.join(runDir, 'manifest.json'), 'utf8'));
  const mn = manifest.nodes?.[ref.node];
  if (!mn) fail(`the run manifest has no node ${ref.node}`);
  if (mn.architectOnly !== true) fail(`run node ${ref.node} is not an architect node`);
  if (mn.authorExecutionId !== expect.architectExecutionId) fail(`the sample's Architect execution is ${mn.authorExecutionId}; this Author chains ${expect.architectExecutionId}`);
  const bound = mn.variants?.[ref.arm]?.harvesterSource?.source ?? 'persisted';
  if (bound !== expect.harvesterSource) fail(`the design was written over harvest ${bound}; this Author binds ${expect.harvesterSource} — one harvest, one design`);
  const saved = { system: fs.readFileSync(path.join(runDir, ref.node, ref.arm, 'author.system.md'), 'utf8'), user: fs.readFileSync(path.join(runDir, ref.node, ref.arm, 'author.user.md'), 'utf8') };
  if (saved.system !== expect.renderedPrompt.system) fail(`its Architect system prompt (sha ${sha256(saved.system).slice(0, 12)}) differs from today's render (sha ${sha256(expect.renderedPrompt.system).slice(0, 12)})`);
  if (saved.user !== expect.renderedPrompt.user) fail(`its Architect user prompt (sha ${sha256(saved.user).slice(0, 12)}) differs from today's render (sha ${sha256(expect.renderedPrompt.user).slice(0, 12)})`);
  const text = fs.readFileSync(path.join(dir, 'author.md'), 'utf8');
  return { ref, dir, text, textSha256: sha256(text), confidenceScore: typeof sample.author?.confidence === 'number' ? sample.author.confidence : null,
    toolCalls: Array.isArray(sample.calls) ? sample.calls : [], turns: typeof sample.author?.turns === 'number' ? sample.author.turns : null,
    sampleExecutionId: `lab-${ref.node}-${ref.arm}-${ref.i}-x` };
}

/** The Author's frozen context with its ONE Architect entry rebuilt from the replayed design (chain.ts field rules, via the caller's
 *  `rebuild` — `chainEntryFromResult`). Refused when the context has no, or more than one, Architect entry. */
export function patchArchitectEntry(ctx: Record<string, any>, rebuild: (old: Record<string, any>) => Record<string, any>): Record<string, any> {
  if (!Array.isArray(ctx?.chainedFrom)) throw new Error('L-S3-a: the Author context has no chainedFrom');
  const idx = ctx.chainedFrom.findIndex((e: any) => e?.agentRole === 'infra_change_architect');
  if (idx < 0) throw new Error('L-S3-a: the Author context has no Architect entry');
  if (ctx.chainedFrom.filter((e: any) => e?.agentRole === 'infra_change_architect').length !== 1) throw new Error('L-S3-a: more than one Architect entry');
  const chainedFrom = [...ctx.chainedFrom];
  chainedFrom[idx] = rebuild(ctx.chainedFrom[idx]);
  return { ...ctx, chainedFrom };
}

/** L-S3-b: a Reviewer cell's lab-sample Author must have been produced over the SAME upstream samples this cell binds — read from that
 *  sample's run manifest (`nodes[<node>].variants[<arm>].held.upstream`). Refused by name otherwise. */
export function checkAuthorSampleUpstream(manifest: any, node: string, arm: string, upstream: UpstreamSamplesSpec, source: string): void {
  const u = manifest?.nodes?.[node]?.variants?.[arm]?.held?.upstream;
  if (!u) throw new Error(`L-S3-b: ${source} — its run recorded no upstream binding for ${node}/${arm} (not an L-S3-a Author sample)`);
  if (u.harvester?.source !== upstream.harvester) throw new Error(`L-S3-b: ${source} — its Author read harvest ${u.harvester?.source}; this cell binds ${upstream.harvester}`);
  if (u.architect?.source !== upstream.architect) throw new Error(`L-S3-b: ${source} — its Author read design ${u.architect?.source}; this cell binds ${upstream.architect}`);
}
