/**
 * Leg replay lab — L-K-c, the ARCHITECT's Phase 0 source (held-k8s step 1k; LAB-DESIGN-model-evaluation.md §1).
 *
 * WHY. L-K1's Architect cells (A-NODRIFT / A-DRIFT-IN / A-DRIFT-OUT) must decide on a drift finding the step-2 Harvester wrote.
 * Production holds no such harvest (the text is not live), so an `architectOnly` node (L-8) names, per arm, where its Harvester
 * entry comes from:
 *
 *   harvesterSourceByVariant: { <arm>: 'persisted'                              — the frozen entry, as today (default)
 *                                     | 'lab-sample:<run>/<H node>/<H arm>/<i>'  — an L-K1 Harvester lab sample
 *                                     | 'frozen:<file>' }                        — a hand-written fallback harvest in the
 *                                                                                  experiment folder (pre-registered beside it)
 *
 * VALIDITY of a lab sample (refused by name, never silently borrowed — the L-9 rules, restated for a Harvester):
 *   - the sample exists, ran without error, is the node/arm/i it names, and is VALID (its recorded + fixture tiers served it);
 *   - its run manifest's node is a harvester node whose production execution is the SAME Harvester this Architect's frozen entry
 *     chains (`executionId`);
 *   - its run ran the SAME protocol text (sha) the H node builds for that arm now, and the Harvester prompt it saved
 *     (author.system.md + author.user.md) is BYTE-IDENTICAL to the one the H node builds now (brief input edit included);
 *   - its run read the SAME fixture (digest over the planted bytes, L-K-a/L-K-b) the H node loads now — or both read none.
 *
 * WHAT THE ARCHITECT THEN SEES. The frozen Harvester entry with the chainer's derived fields rebuilt from the replayed harvest
 * (chain.ts `patchHarvesterEntry`: R9 + the per-predecessor cap on the text, the leaf stamps from the SHIPPING leaf nets re-run
 * over the sample's text + its persisted-shape toolCalls, its confidence). Every other field (task, role, ordering, contract) is
 * the frozen one. The §6 render is the shipping renderer's, through rebuildPrompt.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { parseLabSampleSource, type LabSampleRef } from './lab-sample';

export const HARVESTER_SOURCE_FROZEN_PREFIX = 'frozen:';
const RUNS_DIR = path.join(__dirname, 'runs');
const sha256 = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

export interface LoadedHarvesterSample {
  ref: LabSampleRef; dir: string; text: string; textSha256: string; toolCalls: unknown[];
  confidenceScore: number | null; turns: number | null; toolCallCount: number; toolCallFailed: number;
  /** The id the sample's leaf nets ran under (runHarvesterSample's `hId`) — the chain entry's executionId. */
  sampleExecutionId: string;
}

/** Read an L-K1 Harvester sample and check it is what it claims to be (see the header). */
export function loadHarvesterLabSample(source: string, expect: {
  harvesterExecutionId: string; protocolSha256: string; harvesterPrompt: { system: string; user: string }; fixtureDigest: string | null;
}, runsDir = RUNS_DIR): LoadedHarvesterSample {
  const ref = parseLabSampleSource(source);
  const runDir = path.join(runsDir, ref.run);
  const dir = path.join(runDir, ref.node, ref.arm, `sample-${String(ref.i).padStart(2, '0')}`);
  const fail = (why: string) => { throw new Error(`L-K-c: ${source} — ${why}`); };
  if (!fs.existsSync(path.join(dir, 'sample.json'))) fail('no sample there');
  const sample = JSON.parse(fs.readFileSync(path.join(dir, 'sample.json'), 'utf8'));
  if (sample.error) fail(`the sample errored (${sample.error})`);
  if (sample.node !== ref.node || sample.variant !== ref.arm || sample.i !== ref.i) fail(`sample.json names ${sample.node}/${sample.variant}/${sample.i}`);
  if (sample.harvesterOnly !== true) fail('not a Harvester sample');
  if (sample.valid === false) fail('the sample is INVALID (its recorded or fixture tier did not serve it) — never a fixed input');
  const manifest = JSON.parse(fs.readFileSync(path.join(runDir, 'manifest.json'), 'utf8'));
  const mn = manifest.nodes?.[ref.node];
  if (!mn) fail(`the run manifest has no node ${ref.node}`);
  if (mn.harvesterOnly !== true) fail(`run node ${ref.node} is not a harvester node`);
  if (mn.authorExecutionId !== expect.harvesterExecutionId) fail(`the sample's Harvester execution is ${mn.authorExecutionId}; this Architect chains ${expect.harvesterExecutionId}`);
  const vr = mn.variants?.[ref.arm];
  if (!vr?.protocol?.sha256) fail(`the run manifest records no protocol for arm ${ref.arm}`);
  if (vr.protocol.sha256 !== expect.protocolSha256) fail(`the sample ran protocol ${String(vr.protocol.sha256).slice(0, 12)}, the H node's arm builds ${expect.protocolSha256.slice(0, 12)}`);
  for (const part of ['system', 'user'] as const) {
    const f = path.join(runDir, ref.node, ref.arm, `author.${part}.md`);
    if (!fs.existsSync(f)) fail(`the run saved no author.${part}.md`);
    if (fs.readFileSync(f, 'utf8') !== expect.harvesterPrompt[part]) fail(`the sample's Harvester ${part} prompt differs from the one the H node builds now (brief, text or template moved)`);
  }
  const ranDigest: string | null = mn.fixture?.digest ?? null;
  if (ranDigest !== expect.fixtureDigest) fail(`the sample read fixture ${ranDigest ? ranDigest.slice(0, 12) : 'none'}, the H node loads ${expect.fixtureDigest ? expect.fixtureDigest.slice(0, 12) : 'none'}`);
  const text = fs.readFileSync(path.join(dir, 'harvester.md'), 'utf8');
  const tcf = path.join(dir, 'toolCalls.json');
  const toolCalls = fs.existsSync(tcf) ? JSON.parse(fs.readFileSync(tcf, 'utf8')) : [];
  return { ref, dir, text, textSha256: sha256(text), toolCalls: Array.isArray(toolCalls) ? toolCalls : [],
    confidenceScore: typeof sample.author?.confidence === 'number' ? sample.author.confidence : null,
    turns: typeof sample.author?.turns === 'number' ? sample.author.turns : null,
    toolCallCount: Array.isArray(toolCalls) ? toolCalls.length : 0,
    toolCallFailed: Array.isArray(toolCalls) ? toolCalls.filter((t: any) => t?.success === false).length : 0,
    sampleExecutionId: `lab-${ref.node}-${ref.arm}-${ref.i}-h` };
}

/** `frozen:<file>` — a hand-written harvest kept in the experiment folder (the pre-registered fallback). */
export function loadFrozenHarvest(dir: string, source: string): { file: string; text: string; textSha256: string } {
  if (!source.startsWith(HARVESTER_SOURCE_FROZEN_PREFIX)) throw new Error(`L-K-c: ${source} is not frozen:<file>`);
  const rel = source.slice(HARVESTER_SOURCE_FROZEN_PREFIX.length);
  const f = path.resolve(dir, rel);
  if (!f.startsWith(path.resolve(dir) + path.sep)) throw new Error(`L-K-c: ${source} — the fallback must live in the experiment folder`);
  if (!fs.existsSync(f)) throw new Error(`L-K-c: ${source} — no file`);
  const text = fs.readFileSync(f, 'utf8');
  if (!text.trim()) throw new Error(`L-K-c: ${source} — the fallback harvest is empty`);
  return { file: rel, text, textSha256: sha256(text) };
}
