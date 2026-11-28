/**
 * Requirements SOURCES check: the configuration-sources blocks of a requirements.md, read by the SHIPPING parser
 * (STEP 1 Phase A, 2026-11-09; plan cline_docs/reviews/config-sources-plans-2026-11-09/STEP1-REQUIREMENTS-PLAN.md section 4.1,
 * owner G1-G5).
 *
 * ONE PARSER. Every grammar question (which kinds exist, the separator, a heading line, what a block is, whether two blocks
 * declare the same thing) is answered by lib/agents/harness/device-sources.ts, the module the platform itself reads a leg's
 * declaration with. This file only finds WHERE the blocks are (fences, sections, owner items) and applies the four rules.
 * It holds no kind name and no separator character of its own; `test:requirements-sources` pins that (LL-CS-22).
 * Run directly (docs/WRITING-A-SPEC.md, the spec-writer agent). Until 2026-11-28 the retired Author's Python publish pass called this CLI.
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
 * CONFIG SOURCES (2026-11-16, kubernetes-gitops 1.19.0 prep; STEP2-BUILD.md section 7.3). A leg whose protocol keeps a FILE declares a
 * config-sources block instead, read ONLY by lib/agents/harness/config-sources.ts (block, contract value, resolveLegConfigSources,
 * sameConfigDeclaration) with the protocol table CONFIG_SOURCE_LANES (held-bytes/variant.ts). The same rules apply by analogy:
 *   S1  fenced, inside a leg section; a leg section holds at most ONE sources block of EITHER grammar (a leg has one protocol, and
 *       the two tables share no protocol, so a section with both is wrong whichever it is). The leg's protocol is the ONE
 *       config-sources protocol the section names (title or text outside fences); none named is an ERROR that lists the leg tokens
 *       the section does name (only kubernetes-gitops legs declare config sources today), two named is an ERROR. No lane sentence:
 *       the table has one lane (change), and a generated spec carries no config lane sentence yet.
 *   S2  resolves `parsed` as the contract copy and the task-body copy (resolveLegConfigSources, same text both sides).
 *   S3  transcription vs the owner's items (sameConfigDeclaration), both directions.
 *   S4  every block of one protocol declares the same thing: the platform carries ONE block per protocol token and every leg of
 *       that protocol reads and holds every declared file in it (owner 2026-11-15, multi-leg ADDENDUM 2).
 *   S5  NOT CHECKED: a ref vs the service pin, descriptor registration, that the block covers the cluster the leg changes.
 *
 * LABELS (2026-11-23, the observability-config 1.12.0 join). On a protocol with a label table (`configLabelTableOf`: observability;
 * Kubernetes and Terraform have none, so nothing changes for them) every label of a PARSED block must name one of the platform's
 * file targets. The check asks the SHIPPING block-level function (`resolveConfigLabels`, held-bytes/config-label.ts) - the one the
 * platform runs when it takes the leg's snapshot - so an unsupported label is an S2 ERROR at publish rather than a leg forced
 * `config-sources-unparseable`. It applies to EVERY line, whatever its kind: the platform checks a Git-only block's labels too.
 * An owner item's block gets the same check (S3: fix the answer before the merge). Printed NOT CHECKED: that the Git path written
 * beside a label is the file that label's target serves, and that the named service is the one the platform's file table is keyed on.
 *
 * WHAT TO DO. Every S2 (and an owner item's "does not parse") ends with the fix: scripts/requirements-sources-fix-text.ts, one
 * sentence per problem word, typed on the shipping problem unions. That file words; it answers no grammar question.
 *
 * OWNER ITEMS ARE KEYED ON THEIR TOKEN (2026-11-17, STEPS-2-4-PLAN section 3b item 6; record STEP4-REQ-CHECK-TOKEN-KEYING.md). An owner
 * item's config-sources block is resolved under ONE protocol: the config-sources token that prefixes the item's rows in the owner's
 * ROW-ITEM-MAP (answers.md, `--answers`; the rule the retired check-requirements-clauses.py used: "an item governs the legs whose token
 * prefixes its rows"). It is never resolved by trying every key: terraform-iac and kubernetes-gitops share their kinds, so the text
 * alone cannot tell them apart. An item whose rows name no config-sources token, or several, is an S3 ERROR (fail closed). Without
 * the map, the candidates are every config-sources protocol the check reads: exactly one (today) resolves as before; several is the
 * same S3 ERROR, asking for the map. A block is compared only with items of its own leg's protocol; an item carried on a leg of
 * another protocol is named.
 *
 * Lane. A generated spec (it has `## Design decisions`) states each leg's lane with one fixed sentence (LANE_SENTENCES). A
 * hand-written spec has no such sentence; there the lane is INFERRED from the phrase the Program Architect itself keys a value
 * leg on, "changes nothing" (pAIchartUniversalTemplate.ts token bullet), and the output says it was inferred.
 *
 * Usage: npx ts-node -r tsconfig-paths/register scripts/check-requirements-sources.ts --draft <requirements.md> [--objective <objective.txt>] [--answers <answers.md>] [--json]
 * Exit 0 clean, 1 any ERROR, 2 usage.
 */
import * as fs from 'fs';
import {
  parseDeviceSourcesBlock, resolveLegDeviceSources, sameDeclaration, type LegDeviceSources,
} from '../lib/agents/harness/device-sources';
import {
  configLabelTableOf, parseConfigSourcesBlock, resolveLegConfigSources, sameConfigDeclaration, type ConfigLabelCheck, type LegConfigSources,
} from '../lib/agents/harness/config-sources';
import { resolveConfigLabels } from '../lib/agents/harness/held-bytes/config-label';
import { configFix, deviceFix } from './requirements-sources-fix-text';
import { CONFIG_SOURCE_LANES, CONFIG_SOURCE_PROTOCOLS, DEVICE_SOURCE_LANES } from '../lib/agents/harness/held-bytes/variant';
import { LEG_TOKENS, rowItemMapFromAnswers, type RowItemMap } from '../lib/agents/harness/spec-check-shared';

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

export type SourcesBlock =
  | { grammar: 'device'; section: string; line: number; lane: Lane | null; laneSource: 'sentence' | 'inferred' | 'none';
      resolution: LegDeviceSources }
  /** A config-sources block: its protocol (contract key) and lane come from CONFIG_SOURCE_LANES, never from a sentence. */
  | { grammar: 'config'; section: string; line: number; protocol: string; lane: Lane; laneSource: 'table';
      resolution: LegConfigSources;
      /** The platform's block-level label check, for a PARSED block of a protocol with a label table; null otherwise (not asked). */
      labelCheck: ConfigLabelCheck | null };
export interface SourcesFinding { rule: 'S1' | 'S2' | 'S3' | 'S4'; section: string | null; message: string }
export interface SourcesResult {
  mode: 'generated' | 'hand-written'; blocks: SourcesBlock[]; errors: SourcesFinding[]; notChecked: string[];
  /** `unkeyed`: a config-sources item whose protocol could not be named (no token, or several); it is an S3 ERROR. */
  items: Array<{ item: number; grammar: 'device' | 'config'; state: LegDeviceSources['state'] | 'unkeyed' }>;
}
export interface SourcesCheckOptions {
  /** The config-sources contract keys the check reads. Default: the protocols whose text has shipped (SHIPPED_CONFIG_KEYS). Tests
   *  inject a row still awaiting its text to prove the check before that text ships; production callers never pass it. */
  configKeys?: readonly string[];
  /** The owner's item to rows map (answers.md ROW-ITEM-MAP). Given, it is the ONLY source of an owner item's protocol. */
  rowItemMap?: RowItemMap | null;
}

const isFence = (l: string) => l.trim().startsWith('```');
/** A line the SHIPPING parser treats as a sources heading (asked of the parser, never of a local pattern). */
const isDeviceHeading = (l: string) => parseDeviceSourcesBlock(l.trim()).state !== 'absent';
/** The config-sources protocols (contract key = the token a spec names) and every leg token a spec may name. */
// Config sources STEP 4 (2026-11-17): only the protocols whose Config-sources TEXT has shipped (CONFIG_SOURCE_PROTOCOLS = the table minus
// CONFIG_SOURCE_AWAITING_TEXT): a row awaiting its text declares nothing yet. Owner items are keyed on their token (header, section 3b
// item 6), so a second protocol here no longer makes a Kubernetes owner item ambiguous (tests inject terraform-iac to prove it).
export const SHIPPED_CONFIG_KEYS: readonly string[] = Object.freeze(CONFIG_SOURCE_PROTOCOLS.map((p) => CONFIG_SOURCE_LANES[p].contractKey));
const knownLegTokens = (keys: readonly string[]) => [...new Set([...LEG_TOKENS, ...Object.values(DEVICE_SOURCE_LANES).map((v) => v.contractKey), ...keys])];
/** The config heading is protocol-independent in the parser (the protocol only decides the kinds), so any table row asks it. */
const isConfigHeading = (l: string) => parseConfigSourcesBlock(l.trim(), SHIPPED_CONFIG_KEYS[0]).state !== 'absent';
/** The config-sources tokens an owner item's rows name (first segment of each row id, as the retired check-requirements-clauses.py read it). */
const itemConfigTokens = (rows: ReadonlySet<string> | undefined, keys: readonly string[]) =>
  [...new Set([...(rows ?? [])].map((r) => r.split('.')[0]))].filter((t) => keys.includes(t)).sort();
const isSourcesHeading = (l: string) => isDeviceHeading(l) || isConfigHeading(l);
const tokenRe = (t: string) => new RegExp(`(?<![\\w-])${t.replace(/[-]/g, '\\-')}(?![\\w-])`);
/** The label check the platform runs at the snapshot (config-sources-read.ts `configSnapshotDecision`): asked only of a PARSED block
 *  of a protocol with a label table. Null = not asked (no table, or the block did not parse). */
function labelCheckOf(protocol: string, resolution: LegConfigSources): ConfigLabelCheck | null {
  const table = configLabelTableOf(protocol);
  return table !== null && resolution.state === 'parsed' ? resolveConfigLabels(resolution.entries, table) : null;
}
/** A label problem, said for a spec writer: the label itself (greppable), its place among the block's source lines, the word, the fix. */
function labelProblemText(protocol: string, resolution: LegConfigSources, check: ConfigLabelCheck): string | null {
  if (check.state !== 'problem' || resolution.state !== 'parsed') return null;
  const at = check.lineIndex;
  const where = at === null ? 'a label' : `label "${resolution.entries[at]?.label ?? '?'}" (source line ${at + 1} of the block)`;
  return `${where} is not one the platform can resolve for ${protocol}: ${check.problem} - ${configFix(check.problem, protocol)}`;
}
const configLaneOf = (key: string): Lane => {
  const row = Object.values(CONFIG_SOURCE_LANES).find((v) => v.contractKey === key);
  if (!row) throw new Error(`not a config-sources protocol: ${key}`);
  return row.lane;
};

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

export function checkSources(draft: string, objective?: string | null, opts: SourcesCheckOptions = {}): SourcesResult {
  // De-duplicated: a caller listing a protocol that has since shipped must not read as a leg naming it twice.
  const CONFIG_KEYS: readonly string[] = [...new Set(opts.configKeys ?? SHIPPED_CONFIG_KEYS)];
  const rowMap = opts.rowItemMap ?? null;
  const { sections: secs, strayHeadings } = sections(draft);
  const mode: SourcesResult['mode'] = secs.some((s) => DD_TITLE_RE.test(s.title)) ? 'generated' : 'hand-written';
  const errors: SourcesFinding[] = [];
  const blocks: SourcesBlock[] = [];
  for (const h of strayHeadings) {
    errors.push({ rule: 'S1', section: h.section, message: `line ${h.line}: a sources heading outside a fence (it would split the spec's sections) - put the block in a fence` });
  }
  for (const s of secs) {
    const srcFences = s.fences.filter((f) => f.body.some(isDeviceHeading));
    const cfgFences = s.fences.filter((f) => !f.body.some(isDeviceHeading) && f.body.some(isConfigHeading));
    if (srcFences.length + cfgFences.length === 0) continue;
    if (!LEG_SECTION_RE.test(s.title)) errors.push({ rule: 'S1', section: s.title, message: 'a sources block outside a leg\'s "Pipeline N objective" section' });
    if (srcFences.length + cfgFences.length > 1) {
      const both = srcFences.length && cfgFences.length ? ' (a device-sources block AND a config-sources block: a leg has one protocol, so one grammar)' : '';
      errors.push({ rule: 'S1', section: s.title, message: `${srcFences.length + cfgFences.length} sources blocks in one leg section (exactly one allowed)${both}` });
    }
    const outside = s.outside.join('\n');
    if (cfgFences.length) {
      const named = `${s.title}\n${outside}`;
      const keys = CONFIG_KEYS.filter((k) => tokenRe(k).test(named));
      if (keys.length !== 1) {
        const legs = knownLegTokens(CONFIG_KEYS).filter((k) => tokenRe(k).test(named));
        errors.push({ rule: 'S1', section: s.title, message: keys.length === 0
          ? `a config-sources block on a leg that names no config-sources protocol (it names: ${legs.join(', ') || 'no leg protocol'}); only ${CONFIG_KEYS.join(', ')} legs declare config sources today`
          : `a config-sources block on a leg that names several config-sources protocols (${keys.join(', ')}): the leg's protocol is ambiguous` });
      } else {
        for (const f of cfgFences) {
          const body = f.body.join('\n');
          const resolution = resolveLegConfigSources({ protocol: keys[0], contractValue: body, taskBody: body });
          const labelCheck = labelCheckOf(keys[0], resolution);
          blocks.push({ grammar: 'config', section: s.title, line: f.start, protocol: keys[0], lane: configLaneOf(keys[0]), laneSource: 'table', resolution, labelCheck });
          if (resolution.state !== 'parsed') {
            const detail = resolution.state === 'unparseable'
              ? `${resolution.problem}${resolution.lineIndex === null ? '' : ` at block line ${resolution.lineIndex + 1}`} (as the ${resolution.source === 'contract' ? 'contract copy' : 'task-body copy'}) - ${configFix(resolution.problem, keys[0])}`
              : resolution.state;
            errors.push({ rule: 'S2', section: s.title, message: `config-sources block at line ${f.start} does not parse as the platform reads it for ${keys[0]}: ${detail}` });
          }
          const labelText = labelCheck ? labelProblemText(keys[0], resolution, labelCheck) : null;
          if (labelText) errors.push({ rule: 'S2', section: s.title, message: `config-sources block at line ${f.start}: ${labelText}` });
        }
      }
    }
    if (srcFences.length === 0) continue;
    const said = (Object.keys(LANE_SENTENCES) as Lane[]).filter((k) => outside.includes(LANE_SENTENCES[k]));
    let lane: Lane | null = null; let laneSource: SourcesBlock['laneSource'] = 'none';
    if (said.length === 1) { lane = said[0]; laneSource = 'sentence'; }
    else if (said.length > 1) errors.push({ rule: 'S1', section: s.title, message: 'both lane sentences in one leg section' });
    else if (mode === 'generated') errors.push({ rule: 'S1', section: s.title, message: `no lane sentence: a generated spec says "${LANE_SENTENCES.change}" or "${LANE_SENTENCES.value}"` });
    else { lane = VALUE_PHRASE_RE.test(outside) ? 'value' : 'change'; laneSource = 'inferred'; }
    for (const f of srcFences) {
      const body = f.body.join('\n');
      const resolution = resolveLegDeviceSources({ contractValue: body, taskBody: body });
      blocks.push({ grammar: 'device', section: s.title, line: f.start, lane, laneSource, resolution });
      if (resolution.state !== 'parsed') {
        const detail = resolution.state === 'unparseable'
          ? `${resolution.problem}${resolution.lineIndex === null ? '' : ` at block line ${resolution.lineIndex + 1}`} (as the ${resolution.source === 'contract' ? 'contract copy' : 'task-body copy'}) - ${deviceFix(resolution.problem)}`
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
    const parsedCfgItems: Array<{ item: number; protocol: string; res: LegConfigSources }> = [];
    for (const it of objectiveItems(objective)) {
      // A config-sources block in an owner item: resolved under the ONE protocol its token names (header), never under every key.
      const cfgText = unfenced(it.text);
      if (parseConfigSourcesBlock(cfgText, SHIPPED_CONFIG_KEYS[0]).state !== 'absent') {
        const rows = rowMap ? rowMap.get(it.item) : undefined;
        const cand = rowMap ? itemConfigTokens(rows, CONFIG_KEYS) : [...CONFIG_KEYS];
        if (cand.length !== 1) {
          items.push({ item: it.item, grammar: 'config', state: 'unkeyed' });
          const named = rows && rows.size ? [...rows].sort().join(', ') : 'none';
          errors.push({ rule: 'S3', section: null, message: !rowMap
            ? `owner item ${it.item}: a config-sources block, but no row-item map names its protocol and the check reads ${cand.length} config-sources protocols (${cand.join(', ')}) - pass the owner's answers (--answers) so the item is keyed on its token`
            : cand.length === 0
              ? `owner item ${it.item}: a config-sources block, but its rows in the owner's map name no config-sources token (rows: ${named}; tokens read: ${CONFIG_KEYS.join(', ')}) - map the item to its leg's row before the merge`
              : `owner item ${it.item}: a config-sources block whose rows name several config-sources tokens (${cand.join(', ')}; rows: ${named}): the item's protocol is ambiguous - one item per protocol` });
        } else {
          const res = resolveLegConfigSources({ protocol: cand[0], contractValue: undefined, taskBody: cfgText });
          items.push({ item: it.item, grammar: 'config', state: res.state });
          if (res.state !== 'parsed') {
            errors.push({ rule: 'S3', section: null, message: `owner item ${it.item}: its config-sources block does not parse (${res.state === 'unparseable' ? `${res.problem} - ${configFix(res.problem, cand[0])}` : res.state}) - fix the answer before the merge` });
          } else {
            // The same label check the spec's block gets: a label the platform cannot resolve is the OWNER's answer to fix, and it is
            // cheaper found here than after the merge. The item still takes part in transcription (it parsed), so one fault is one error.
            const itemLabels = labelCheckOf(cand[0], res);
            const itemLabelText = itemLabels ? labelProblemText(cand[0], res, itemLabels) : null;
            if (itemLabelText) errors.push({ rule: 'S3', section: null, message: `owner item ${it.item}: its config-sources block: ${itemLabelText} - fix the answer before the merge` });
            parsedCfgItems.push({ item: it.item, protocol: cand[0], res });
          }
        }
      }
      const res = resolveLegDeviceSources({ contractValue: undefined, taskBody: unfenced(it.text) });
      if (res.state === 'absent') continue;
      items.push({ item: it.item, grammar: 'device', state: res.state });
      if (res.state !== 'parsed') {
        errors.push({ rule: 'S3', section: null, message: `owner item ${it.item}: its sources block does not parse (${res.state === 'unparseable' ? `${res.problem} - ${deviceFix(res.problem)}` : res.state}) - fix the answer before the merge` });
        continue;
      }
      parsedItems.push({ item: it.item, res });
    }
    const good = blocks.filter((b): b is Extract<SourcesBlock, { grammar: 'device' }> => b.grammar === 'device' && b.resolution.state === 'parsed');
    const goodCfg = blocks.filter((b): b is Extract<SourcesBlock, { grammar: 'config' }> => b.grammar === 'config' && b.resolution.state === 'parsed');
    for (const it of parsedCfgItems) {
      if (!goodCfg.some((b) => b.protocol === it.protocol && sameConfigDeclaration(b.resolution, it.res))) {
        const elsewhere = goodCfg.find((b) => b.protocol !== it.protocol && sameConfigDeclaration(b.resolution, it.res));
        errors.push({ rule: 'S3', section: null, message: elsewhere
          ? `owner item ${it.item} is a ${it.protocol} item, but the block that declares it sits on a ${elsewhere.protocol} leg ("${elsewhere.section}", line ${elsewhere.line}) - an item is carried only on a leg of its own protocol`
          : `owner item ${it.item}: no config-sources block in the spec declares what the item declares (dropped, retyped or partly carried)` });
      }
    }
    for (const b of goodCfg) {
      if (!parsedCfgItems.some((it) => it.protocol === b.protocol && sameConfigDeclaration(b.resolution, it.res))) {
        const other = parsedCfgItems.find((it) => it.protocol !== b.protocol && sameConfigDeclaration(b.resolution, it.res));
        errors.push({ rule: 'S3', section: b.section, message: other
          ? `${b.protocol} config-sources block at line ${b.line} carries owner item ${other.item}, which is a ${other.protocol} item - no ${b.protocol} item declares it`
          : `config-sources block at line ${b.line} matches no owner item (a block the owner never gave)` });
      }
    }
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
    const ofLane = blocks.filter((b): b is Extract<SourcesBlock, { grammar: 'device' }> => b.grammar === 'device' && b.lane === lane && b.resolution.state === 'parsed');
    for (const b of ofLane.slice(1)) {
      if (!sameDeclaration(b.resolution, ofLane[0].resolution)) {
        errors.push({ rule: 'S4', section: b.section, message: `the ${lane}-lane block at line ${b.line} differs from the one in "${ofLane[0].section}": the platform carries ONE block per lane, so every ${lane} leg in a program reads the same list (plan L1)` });
      }
    }
  }
  for (const key of CONFIG_KEYS) {
    const ofKey = blocks.filter((b): b is Extract<SourcesBlock, { grammar: 'config' }> => b.grammar === 'config' && b.protocol === key && b.resolution.state === 'parsed');
    for (const b of ofKey.slice(1)) {
      if (!sameConfigDeclaration(b.resolution, ofKey[0].resolution)) {
        errors.push({ rule: 'S4', section: b.section, message: `the ${key} config-sources block at line ${b.line} differs from the one in "${ofKey[0].section}": the platform carries ONE block per protocol token and every ${key} leg reads and holds every file in it - give each leg the same block listing every leg's files (owner 2026-11-15)` });
      }
    }
  }
  if (blocks.some((b) => b.grammar === 'config')) {
    notChecked.push('config sources: that a ref is inside the Git service\'s pin, that an evidence service or descriptor registers, and that the block covers the cluster each leg changes');
  }
  // A protocol whose labels were resolved: say what resolving a label does NOT prove (AU-12: a label beside the wrong Git path).
  for (const p of [...new Set(blocks.flatMap((b) => (b.grammar === 'config' && b.labelCheck !== null ? [b.protocol] : [])))]) {
    notChecked.push(`config sources (${p}): each label names a platform file target (checked), but NOT that the Git path written beside a label is the file that target serves, and NOT that the named service is the one the platform keeps that file from (the run reports a difference or a file it could not keep; it does not refuse the pairing)`);
  }
  return { mode, blocks, errors, notChecked, items };
}

export function renderSourcesCli(r: SourcesResult): string {
  const dev = r.blocks.filter((b) => b.grammar === 'device').length;
  const out: string[] = [`requirements sources check (${r.mode} spec): ${r.blocks.length} block(s) (device ${dev}, config ${r.blocks.length - dev})`];
  for (const b of r.blocks) {
    const n = b.resolution.state === 'parsed' ? `${b.resolution.entries.length} line(s)` : b.resolution.state;
    const what = b.grammar === 'config' ? `config ${b.protocol}, lane ${b.lane} (${b.laneSource})` : `device, lane ${b.lane ?? '?'} (${b.laneSource})`;
    const labels = b.grammar === 'config' && b.labelCheck !== null ? `, labels ${b.labelCheck.state === 'resolved' ? 'resolved' : b.labelCheck.problem}` : '';
    out.push(`  - "${b.section}" line ${b.line}: ${what}, ${n}${labels}`);
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
  if (!draftPath) { console.error('usage: check-requirements-sources.ts --draft <requirements.md> [--objective <objective.txt>] [--answers <answers.md>] [--json]'); process.exit(2); }
  const objPath = arg('--objective');
  const ansPath = arg('--answers');
  const r = checkSources(fs.readFileSync(draftPath, 'utf8'), objPath ? fs.readFileSync(objPath, 'utf8') : null,
    { rowItemMap: ansPath ? rowItemMapFromAnswers(fs.readFileSync(ansPath, 'utf8')) : null });
  process.stdout.write((argv.includes('--json') ? JSON.stringify(r, null, 2) : renderSourcesCli(r)) + '\n');
  process.exit(r.errors.length ? 1 : 0);
}
