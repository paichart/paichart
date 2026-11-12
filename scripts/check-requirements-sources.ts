/**
 * Requirements SOURCES check: the configuration-sources blocks of a requirements.md, read by the SHIPPING parser
 * (STEP 1 Phase A, 2026-11-09; plan cline_docs/reviews/config-sources-plans-2026-11-09/STEP1-REQUIREMENTS-PLAN.md section 4.1,
 * owner G1-G5).
 *
 * ONE PARSER. Every grammar question (which kinds exist, the separator, a heading line, what a block is, whether two blocks
 * declare the same thing) is answered by lib/agents/harness/device-sources.ts, the module the platform itself reads a leg's
 * declaration with. This file only finds WHERE the blocks are (fences, sections, owner items) and applies the four rules.
 * It holds no kind name and no separator character of its own; `test:requirements-sources` pins that (LL-CS-22).
 * The Python publish pass (scripts/publish-generated-spec.py prepare) calls this CLI and never parses a block itself.
 * This is the one requirements check whose canonical semantics is TypeScript, because the shipping parser is.
 *
 * Rules (all ERRORs; any ERROR stops the publish, and no waiver clears one, because each is a stop the platform would hit at
 * run time):
 *   S1  a sources block sits in a fence inside a leg's `## Pipeline N objective` section, at most one per section, and (in a
 *       generated spec) the section carries exactly one of the two fixed lane sentences. A sources heading OUTSIDE a fence is
 *       an error (it would split the spec's sections).
 *   S2  the block resolves `parsed` both ways the platform reads it: as the Program Architect's contract copy and as the leg's
 *       task-body copy (resolveLegDeviceSources with the same text on both sides), never `unparseable` or `conflict`.
 *   S3  (with --objective) transcription: every owner item's block is carried by a spec block that declares the same thing
 *       (sameDeclaration), and every spec block is one the owner gave.
 *   S4  every block of one lane declares the same thing: the platform carries ONE block per protocol key
 *       (DEVICE-SOURCES-MULTI-NETWORK-LEG / G1-a, plan limit L1).
 *   S5  printed as NOT CHECKED: device coverage of the leg's scope (L4), the ref vs the service pin, descriptor registration.
 *
 * Lane. A generated spec (it has `## Design decisions`) states each leg's lane with one fixed sentence (LANE_SENTENCES). A
 * hand-written spec has no such sentence; there the lane is INFERRED from the phrase the Program Architect itself keys a value
 * leg on, "changes nothing" (pAIchartUniversalTemplate.ts token bullet), and the output says it was inferred.
 *
 * Usage: npx ts-node -r tsconfig-paths/register scripts/check-requirements-sources.ts --draft <requirements.md> [--objective <objective.txt>] [--json]
 * Exit 0 clean, 1 any ERROR, 2 usage.
 */
import * as fs from 'fs';
import {
  parseDeviceSourcesBlock, resolveLegDeviceSources, sameDeclaration, type LegDeviceSources,
} from '../lib/agents/harness/device-sources';

export type Lane = 'change' | 'value';
/** The two fixed lane sentences a generated spec carries beside each block (plan section 4.3). */
export const LANE_SENTENCES: Readonly<Record<Lane, string>> = Object.freeze({
  change: 'This leg changes device configuration.',
  value: 'This leg changes no device configuration.',
});
/** The phrase the Program Architect keys a value leg on (hand-written specs only; the lane is then reported as inferred). */
const VALUE_PHRASE_RE = /\bchanges nothing\b/i;
const LEG_SECTION_RE = /^Pipeline \d+ objective\b/;
const DD_TITLE_RE = /^Design decisions\b/;

export interface SourcesBlock {
  section: string; line: number; lane: Lane | null; laneSource: 'sentence' | 'inferred' | 'none';
  resolution: LegDeviceSources;
}
export interface SourcesFinding { rule: 'S1' | 'S2' | 'S3' | 'S4'; section: string | null; message: string }
export interface SourcesResult {
  mode: 'generated' | 'hand-written'; blocks: SourcesBlock[]; errors: SourcesFinding[]; notChecked: string[];
  items: Array<{ item: number; state: LegDeviceSources['state'] }>;
}

const isFence = (l: string) => l.trim().startsWith('```');
/** A line the SHIPPING parser treats as a sources heading (asked of the parser, never of a local pattern). */
const isSourcesHeading = (l: string) => parseDeviceSourcesBlock(l.trim()).state !== 'absent';

interface Fence { start: number; body: string[] }
interface Section { title: string; start: number; lines: string[]; fences: Fence[]; outside: string[] }

/** H2 sections, fence-aware: a `## ` line inside a fence is content, not a heading. */
function sections(text: string): { sections: Section[]; strayHeadings: Array<{ line: number; section: string }> } {
  const lines = text.split(/\r?\n/);
  const out: Section[] = [];
  const stray: Array<{ line: number; section: string }> = [];
  let cur: Section = { title: '(before the first section)', start: 0, lines: [], fences: [], outside: [] };
  let fence: Fence | null = null;
  lines.forEach((l, i) => {
    if (fence) {
      if (isFence(l)) { cur.fences.push(fence); fence = null; } else fence.body.push(l);
      cur.lines.push(l);
      return;
    }
    if (isFence(l)) { fence = { start: i + 1, body: [] }; cur.lines.push(l); return; }
    if (isSourcesHeading(l)) stray.push({ line: i + 1, section: cur.title });
    else if (l.startsWith('## ')) { out.push(cur); cur = { title: l.slice(3).trim(), start: i + 1, lines: [], fences: [], outside: [] }; return; }
    cur.lines.push(l); cur.outside.push(l);
  });
  if (fence) cur.fences.push(fence);
  out.push(cur);
  return { sections: out, strayHeadings: stray };
}

/** Owner items `N. ...` (the merge script's shape: an item runs to the next item, a column-0 heading/table/comment, or the end). */
function objectiveItems(objective: string): Array<{ item: number; text: string }> {
  const out: Array<{ item: number; text: string }> = [];
  let cur: { item: number; lines: string[] } | null = null;
  for (const l of objective.split(/\r?\n/)) {
    const m = /^(\d{1,2})\. /.exec(l);
    if (m) { if (cur) out.push({ item: cur.item, text: cur.lines.join('\n') }); cur = { item: parseInt(m[1], 10), lines: [l.slice(m[0].length)] }; continue; }
    if (cur && /^(?:#{1,6}\s|\||\s*<!--)/.test(l)) { out.push({ item: cur.item, text: cur.lines.join('\n') }); cur = null; continue; }
    if (cur) cur.lines.push(l);
  }
  if (cur) out.push({ item: cur.item, text: cur.lines.join('\n') });
  return out;
}

/** A fence line is presentation: it ends the block, exactly like the blank line the parser already stops at. */
const unfenced = (t: string) => t.split(/\r?\n/).map((l) => (isFence(l) ? '' : l)).join('\n');

export function checkSources(draft: string, objective?: string | null): SourcesResult {
  const { sections: secs, strayHeadings } = sections(draft);
  const mode: SourcesResult['mode'] = secs.some((s) => DD_TITLE_RE.test(s.title)) ? 'generated' : 'hand-written';
  const errors: SourcesFinding[] = [];
  const blocks: SourcesBlock[] = [];
  for (const h of strayHeadings) {
    errors.push({ rule: 'S1', section: h.section, message: `line ${h.line}: a sources heading outside a fence (it would split the spec's sections) - put the block in a fence` });
  }
  for (const s of secs) {
    const srcFences = s.fences.filter((f) => f.body.some(isSourcesHeading));
    if (srcFences.length === 0) continue;
    if (!LEG_SECTION_RE.test(s.title)) errors.push({ rule: 'S1', section: s.title, message: 'a sources block outside a leg\'s "Pipeline N objective" section' });
    if (srcFences.length > 1) errors.push({ rule: 'S1', section: s.title, message: `${srcFences.length} sources blocks in one leg section (exactly one allowed)` });
    const outside = s.outside.join('\n');
    const said = (Object.keys(LANE_SENTENCES) as Lane[]).filter((k) => outside.includes(LANE_SENTENCES[k]));
    let lane: Lane | null = null; let laneSource: SourcesBlock['laneSource'] = 'none';
    if (said.length === 1) { lane = said[0]; laneSource = 'sentence'; }
    else if (said.length > 1) errors.push({ rule: 'S1', section: s.title, message: 'both lane sentences in one leg section' });
    else if (mode === 'generated') errors.push({ rule: 'S1', section: s.title, message: `no lane sentence: a generated spec says "${LANE_SENTENCES.change}" or "${LANE_SENTENCES.value}"` });
    else { lane = VALUE_PHRASE_RE.test(outside) ? 'value' : 'change'; laneSource = 'inferred'; }
    for (const f of srcFences) {
      const body = f.body.join('\n');
      const resolution = resolveLegDeviceSources({ contractValue: body, taskBody: body });
      blocks.push({ section: s.title, line: f.start, lane, laneSource, resolution });
      if (resolution.state !== 'parsed') {
        const detail = resolution.state === 'unparseable'
          ? `${resolution.problem}${resolution.lineIndex === null ? '' : ` at block line ${resolution.lineIndex + 1}`} (as the ${resolution.source === 'contract' ? 'contract copy' : 'task-body copy'})`
          : resolution.state;
        errors.push({ rule: 'S2', section: s.title, message: `block at line ${f.start} does not parse as the platform reads it: ${detail}` });
      }
    }
  }

  const notChecked = [
    'that the block lists every device in the leg\'s scope (the owner\'s declaration; a device left out is not checked by that leg - plan L4)',
    'that a ref is inside the Git service\'s pin (refused at run time)',
    'that a descriptor URL registers (the skill checks it at step 0)',
  ];
  const items: SourcesResult['items'] = [];
  if (objective == null) notChecked.unshift('S3 transcription: no --objective given');
  else {
    const parsedItems: Array<{ item: number; res: LegDeviceSources }> = [];
    for (const it of objectiveItems(objective)) {
      const res = resolveLegDeviceSources({ contractValue: undefined, taskBody: unfenced(it.text) });
      if (res.state === 'absent') continue;
      items.push({ item: it.item, state: res.state });
      if (res.state !== 'parsed') {
        errors.push({ rule: 'S3', section: null, message: `owner item ${it.item}: its sources block does not parse (${res.state === 'unparseable' ? res.problem : res.state}) - fix the answer before the merge` });
        continue;
      }
      parsedItems.push({ item: it.item, res });
    }
    const good = blocks.filter((b) => b.resolution.state === 'parsed');
    for (const it of parsedItems) {
      if (!good.some((b) => sameDeclaration(b.resolution, it.res))) {
        errors.push({ rule: 'S3', section: null, message: `owner item ${it.item}: no block in the spec declares what the item declares (dropped, retyped or partly carried)` });
      }
    }
    for (const b of good) {
      if (!parsedItems.some((it) => sameDeclaration(b.resolution, it.res))) {
        errors.push({ rule: 'S3', section: b.section, message: `block at line ${b.line} matches no owner item (a block the owner never gave)` });
      }
    }
  }

  for (const lane of Object.keys(LANE_SENTENCES) as Lane[]) {
    const ofLane = blocks.filter((b) => b.lane === lane && b.resolution.state === 'parsed');
    for (const b of ofLane.slice(1)) {
      if (!sameDeclaration(b.resolution, ofLane[0].resolution)) {
        errors.push({ rule: 'S4', section: b.section, message: `the ${lane}-lane block at line ${b.line} differs from the one in "${ofLane[0].section}": the platform carries ONE block per lane, so every ${lane} leg in a program reads the same list (plan L1)` });
      }
    }
  }
  return { mode, blocks, errors, notChecked, items };
}

export function renderSourcesCli(r: SourcesResult): string {
  const out: string[] = [`requirements sources check (${r.mode} spec): ${r.blocks.length} block(s)`];
  for (const b of r.blocks) {
    const n = b.resolution.state === 'parsed' ? `${b.resolution.entries.length} line(s)` : b.resolution.state;
    out.push(`  - "${b.section}" line ${b.line}: lane ${b.lane ?? '?'} (${b.laneSource}), ${n}`);
  }
  if (r.errors.length === 0) out.push('OK: S1-S4 clean');
  for (const e of r.errors) out.push(`ERROR ${e.rule}${e.section ? ` [${e.section}]` : ''}: ${e.message}`);
  out.push('NOT CHECKED (S5):');
  for (const n of r.notChecked) out.push(`  - ${n}`);
  return out.join('\n');
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const draftPath = arg('--draft');
  if (!draftPath) { console.error('usage: check-requirements-sources.ts --draft <requirements.md> [--objective <objective.txt>] [--json]'); process.exit(2); }
  const objPath = arg('--objective');
  const r = checkSources(fs.readFileSync(draftPath, 'utf8'), objPath ? fs.readFileSync(objPath, 'utf8') : null);
  process.stdout.write((argv.includes('--json') ? JSON.stringify(r, null, 2) : renderSourcesCli(r)) + '\n');
  process.exit(r.errors.length ? 1 : 0);
}
