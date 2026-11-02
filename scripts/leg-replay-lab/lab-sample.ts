/**
 * Leg replay lab — L-9, a LAB SAMPLE as the fixed Author (PLATFORM-HELD-BYTES Stage B G2; plan §4; model-evaluation lane §1.3
 * L-9 and the v3 delta S-2).
 *
 * The Reviewer bench needs a FIXED variant Author package, and production holds none (the variant has never run live). So a node
 * names, per arm, `authorSourceByVariant: { <arm>: 'lab-sample:<run folder>/<G1 node>/<G1 arm>/<i>' }`: the saved `author.md` of
 * that G1 sample stands in for the Author, exactly as `authorSource: 'persisted'` lets a production package stand in. No Author
 * call is made.
 *
 * VALIDITY (refused by name, never silently borrowed):
 *   - the sample exists, ran without error, and is the node/arm it names;
 *   - the sample's run ran the SAME production Author execution as this node, under the SAME variant protocol text (sha), and the
 *     Author prompt it saved (system + user) is BYTE-IDENTICAL to the one this node builds for that Author — so its held view,
 *     brief (a node input edit that also edits the REVIEWER's brief still passes; one that changes the Author's does not) and text
 *     are exactly what the sample answered;
 *   - the sample's own stamp REPRODUCES: the pure applier over the sample's text and this node's held files gives the stamped
 *     state and `candidateDigest8` (the S-1 post-run check, restated on the bench's input).
 *
 * PLANTS (G2): an EditSpec op aimed at `lab-sample:<ref>` edits the sample's text (normally inside its edit block) BEFORE the
 * stamp. The stamp is then recomputed with the PURE `computeEditApplication` over the same held files — never the full shipping
 * step: `HELD_EDIT_CORRECTION_ENABLED` is global via `exp.flags` and must never let a plant buy an Opus correction turn inside a
 * Reviewer bench (S-2 (b)). The re-stamp's correction fact is the shipping decision with the turn OFF (`flag-off`, or the
 * earlier reason the decision would give), so a planted refusal is stamped exactly as it would be with the flag off.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { computeEditApplication, type HeldFileInput, type EditApplication } from '../../lib/agents/harness/held-bytes/apply';
import { buildEditApplicationFact } from '../../lib/agents/harness/held-bytes/edit-fact';
import { decideEditCorrection } from '../../lib/agents/harness/held-edit-correction';
import type { ResolvedHeldRef } from '../../lib/services/held-edit-step';

const sha256 = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
export const LAB_SAMPLE_PREFIX = 'lab-sample:';
const RUNS_DIR = path.join(__dirname, 'runs');

export interface LabSampleRef { run: string; node: string; arm: string; i: number; source: string }

/** `lab-sample:<run>/<node>/<arm>/<i>` → its parts. `<i>` is the 1-based sample number. */
export function parseLabSampleSource(source: string): LabSampleRef {
  const m = /^lab-sample:([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/(\d{1,3})$/.exec(source);
  if (!m) throw new Error(`L-9: "${source}" is not lab-sample:<run>/<node>/<arm>/<i>`);
  return { run: m[1], node: m[2], arm: m[3], i: Number(m[4]), source };
}

export interface LoadedLabSample {
  ref: LabSampleRef;
  dir: string;
  text: string;
  textSha256: string;
  sample: Record<string, any>;
  /** The G1 sample's saved editApplication.json `fact` (null when the arm stamped none). */
  stamped: Record<string, any> | null;
  runManifestNode: Record<string, any>;
}

/** Read a G1 sample and check it is what it claims to be (node, arm, Author execution, input edit, protocol text). */
export function loadLabSample(source: string, expect: { authorExecutionId: string; protocolSha256: string; authorPrompt: { system: string; user: string } }, runsDir = RUNS_DIR): LoadedLabSample {
  const ref = parseLabSampleSource(source);
  const runDir = path.join(runsDir, ref.run);
  const dir = path.join(runDir, ref.node, ref.arm, `sample-${String(ref.i).padStart(2, '0')}`);
  if (!fs.existsSync(path.join(dir, 'sample.json'))) throw new Error(`L-9: ${source} — no sample at ${path.relative(path.join(__dirname, '..', '..'), dir)}`);
  const sample = JSON.parse(fs.readFileSync(path.join(dir, 'sample.json'), 'utf8'));
  if (sample.error) throw new Error(`L-9: ${source} — the sample errored (${sample.error})`);
  if (sample.node !== ref.node || sample.variant !== ref.arm || sample.i !== ref.i) throw new Error(`L-9: ${source} — sample.json names ${sample.node}/${sample.variant}/${sample.i}`);
  const text = fs.readFileSync(path.join(dir, 'author.md'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(runDir, 'manifest.json'), 'utf8'));
  const mn = manifest.nodes?.[ref.node];
  if (!mn) throw new Error(`L-9: ${source} — the run manifest has no node ${ref.node}`);
  if (mn.authorExecutionId !== expect.authorExecutionId) throw new Error(`L-9: ${source} — the sample's Author execution is ${mn.authorExecutionId}, this node's is ${expect.authorExecutionId}`);
  const vr = mn.variants?.[ref.arm];
  if (!vr?.protocol?.sha256) throw new Error(`L-9: ${source} — the run manifest records no protocol for arm ${ref.arm}`);
  if (vr.protocol.sha256 !== expect.protocolSha256) throw new Error(`L-9: ${source} — the sample ran protocol ${String(vr.protocol.sha256).slice(0, 12)}, this arm runs ${expect.protocolSha256.slice(0, 12)}`);
  for (const part of ['system', 'user'] as const) {
    const f = path.join(runDir, ref.node, ref.arm, `author.${part}.md`);
    if (!fs.existsSync(f)) throw new Error(`L-9: ${source} — the run saved no author.${part}.md`);
    if (fs.readFileSync(f, 'utf8') !== expect.authorPrompt[part]) throw new Error(`L-9: ${source} — the sample's Author ${part} prompt differs from the one this node builds (held view, brief or text moved)`);
  }
  const ea = fs.existsSync(path.join(dir, 'editApplication.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'editApplication.json'), 'utf8')) : null;
  return { ref, dir, text, textSha256: sha256(text), sample, stamped: ea?.fact ?? null, runManifestNode: mn };
}

export interface PureStamp { app: EditApplication; fact: Record<string, unknown> }

/** The PURE re-stamp: the shipping applier + the shipping fact builder over `text` and the node's held files; the correction
 *  decision is the shipping one with the turn OFF (never a correction call). `refWrite` is the lab's named value. */
export function pureStamp(text: string, files: HeldFileInput[], refs: ResolvedHeldRef[], r9Version: string, persistEchoTokens?: Iterable<string>): PureStamp {
  // R10-V8-RESIDUALS (b) / sec-ops batch-1 SF-3: the sample's own tool-record echo sources, as the live step applied with.
  const app = computeEditApplication(text, { files, r9Version, persistEchoTokens });
  const correction = decideEditCorrection({ application: app, correctionTurnUsed: false, formCorrectionAttempted: false, budgetFlagged: false, enabled: false,
    time: () => { throw new Error('L-9: the pure re-stamp never reaches the correction time budget'); } });
  const fact = buildEditApplicationFact({ app, heldFiles: files, refWrite: 'lab-not-written', textSource: 'loop', correction,
    baseShaByHandle: Object.fromEntries(refs.map((r) => [r.handle, r.blobSha256])) });
  return { app, fact };
}

/** S-1 restated on the bench input: the sample's own text re-stamps to its saved stamp (state + candidateDigest8). */
export function sampleReproduces(loaded: LoadedLabSample, stamp: PureStamp): { ok: boolean; detail: string } {
  const s = loaded.stamped;
  if (!s) return { ok: false, detail: 'the sample saved no editApplication stamp' };
  const ok = s.state === stamp.fact.state && s.candidateDigest8 === stamp.fact.candidateDigest8;
  return { ok, detail: `stamped ${s.state}/${s.candidateDigest8} · re-stamped ${stamp.fact.state}/${stamp.fact.candidateDigest8}` };
}
