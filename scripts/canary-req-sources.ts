/**
 * canary-req-sources.ts: the pure logic of the req-src-* canary controls (scripts/canary-check.ts), kept apart so that
 * `test:canary-req-sources` can prove each control fires on a fault without a database.
 *
 * Origin: STEP 1 section 7 item 6 of cline_docs/reviews/config-sources-plans-2026-11-09/STEP1-REQUIREMENTS-PLAN.md (owner G4-c,
 * go 2026-11-10). This is the first program run from a GENERATED spec that carries Device sources blocks. The Program Architect is
 * not lab-replayable, so these controls carry the live evidence that it copied the spec's blocks:
 *   req-src-contract-equals-spec  every contract carrying a lane key holds exactly the spec's block for that lane, and a leg of
 *                                 that lane carries it; a key for a lane the spec gives no block is a FINDING (the Architect
 *                                 invented one).
 *   req-src-keys-parse            every key under `deviceSources`, on every contract, is source lines the platform parses (no
 *                                 prose note, no key that no protocol reads).
 *   req-src-snapshot-contract     each Device-sources leg's first-execution snapshot is `parsed`, taken from the CONTRACT, and
 *                                 declares what the spec's block declares. A value leg without its own block has no snapshot.
 *   req-src-value-card-git-only   a declared value leg's card word is exactly `git-only` and equals the stored fact.
 *
 * ONE PARSER (LL-CS-22). Every grammar question goes to lib/agents/harness/device-sources.ts, and the spec's blocks and lanes are
 * found by scripts/check-requirements-sources.ts (the publish check). This file holds no kind name and no separator character.
 * Each function returns PASS / UNEXERCISED / FINDING with the lines it read (Protocol 10: facts, printed for a person).
 */
import { checkSources, type Lane } from './check-requirements-sources';
import {
  contractDeviceSourcesValue, readDeviceSourcesSnapshot, resolveLegDeviceSources, sameDeclaration, type LegDeviceSources,
} from '../lib/agents/harness/device-sources';
import { DEVICE_SOURCE_LANES, deviceSourceLaneOf } from '../lib/agents/harness/held-bytes/variant';

export type ReqSrcVerdict = 'PASS' | 'UNEXERCISED' | 'FINDING';
export interface ReqSrcResult { verdict: ReqSrcVerdict; lines: string[] }
/** A contract carrier: a program leg (it has a protocol) or another task that carries the interface contract (Node C). */
export interface Carrier { id: string; kind: 'leg' | 'nodeC'; protocol: string | null; contract: unknown; metadata: unknown }

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const LANE_KEYS: Readonly<Record<Lane, string>> = Object.freeze(Object.fromEntries(
  Object.values(DEVICE_SOURCE_LANES).map((x) => [x.lane, x.contractKey]),
) as Record<Lane, string>);
const KNOWN_KEYS = new Set(Object.values(LANE_KEYS));

const describe = (r: LegDeviceSources): string => (r.state === 'parsed'
  ? `parsed ${r.entries.length} line(s) from ${r.source}`
  : r.state === 'unparseable' ? `unparseable (${r.problem}${r.lineIndex === null ? '' : ` at line ${r.lineIndex + 1}`})` : r.state);

/** The spec's ONE block per lane, as the publish check reads it. A spec the publish check refuses is itself the finding. */
export function specLaneBlocks(specText: string): { lanes: Partial<Record<Lane, LegDeviceSources>>; problems: string[]; lines: string[] } {
  const r = checkSources(specText);
  const problems = r.errors.map((e) => `spec ${e.rule}${e.section ? ` [${e.section}]` : ''}: ${e.message}`);
  const lanes: Partial<Record<Lane, LegDeviceSources>> = {};
  const lines: string[] = [];
  for (const b of r.blocks) {
    lines.push(`  spec "${b.section}" line ${b.line}: lane ${b.lane ?? '?'} (${b.laneSource}), ${describe(b.resolution)}`);
    if (!b.lane) { problems.push(`spec block at line ${b.line} has no lane`); continue; }
    if (b.resolution.state === 'parsed' && !lanes[b.lane]) lanes[b.lane] = b.resolution;
  }
  return { lanes, problems, lines };
}

const deviceSourcesOf = (contract: unknown): unknown => (isObj(contract) ? contract.deviceSources : undefined);
const fromContract = (contract: unknown, key: string): LegDeviceSources =>
  resolveLegDeviceSources({ contractValue: contractDeviceSourcesValue(contract, key), taskBody: null });

export function contractEqualsSpec(carriers: readonly Carrier[], specText: string): ReqSrcResult {
  const spec = specLaneBlocks(specText);
  const lines = [...spec.lines];
  let finding = spec.problems.length > 0, exercised = false;
  spec.problems.forEach((p) => lines.push(`  ${p} - FINDING (the canary's spec must pass the publish check)`));
  for (const lane of Object.keys(LANE_KEYS) as Lane[]) {
    const key = LANE_KEYS[lane], want = spec.lanes[lane];
    for (const c of carriers) {
      const ownLane = c.kind === 'leg' ? deviceSourceLaneOf(c.protocol) : null;
      const raw = contractDeviceSourcesValue(c.contract, key);
      const present = raw !== undefined && raw !== null;
      if (!present) {
        if (want && ownLane === lane) { finding = true; lines.push(`  ${c.kind} ${c.id} (${lane} leg): no deviceSources["${key}"] while the spec gives the ${lane} lane a block - FINDING`); }
        continue;
      }
      exercised = true;
      const got = fromContract(c.contract, key);
      if (!want) { finding = true; lines.push(`  ${c.kind} ${c.id}: deviceSources["${key}"] = ${describe(got)}, but the spec gives the ${lane} lane NO block (invented) - FINDING`); continue; }
      const same = got.state === 'parsed' && sameDeclaration(got, want);
      lines.push(`  ${c.kind} ${c.id}: deviceSources["${key}"] ${describe(got)} ${same ? '= the spec block' : '≠ the spec block - FINDING'}`);
      if (!same) finding = true;
    }
  }
  if (finding) return { verdict: 'FINDING', lines };
  return exercised ? { verdict: 'PASS', lines } : { verdict: 'UNEXERCISED', lines: [...lines, '  no contract carries a deviceSources key'] };
}

export function keysParse(carriers: readonly Carrier[]): ReqSrcResult {
  const lines: string[] = []; let finding = false, seen = 0;
  for (const c of carriers) {
    const ds = deviceSourcesOf(c.contract);
    if (ds === undefined || ds === null) continue;
    seen++;
    if (!isObj(ds)) { finding = true; lines.push(`  ${c.kind} ${c.id}: deviceSources is not an object keyed by protocol - FINDING`); continue; }
    for (const key of Object.keys(ds)) {
      if (!KNOWN_KEYS.has(key)) { finding = true; lines.push(`  ${c.kind} ${c.id}: deviceSources["${key}"] is a key no protocol reads - FINDING`); continue; }
      const got = fromContract(c.contract, key);
      lines.push(`  ${c.kind} ${c.id}: deviceSources["${key}"] ${describe(got)}${got.state === 'parsed' ? '' : ' - FINDING'}`);
      if (got.state !== 'parsed') finding = true;
    }
  }
  if (!seen) return { verdict: 'UNEXERCISED', lines: ['  no contract carries deviceSources'] };
  return { verdict: finding ? 'FINDING' : 'PASS', lines };
}

export function snapshotContract(carriers: readonly Carrier[], specText: string): ReqSrcResult {
  const spec = specLaneBlocks(specText);
  const lines: string[] = []; let finding = spec.problems.length > 0, seen = 0;
  spec.problems.forEach((p) => lines.push(`  ${p} - FINDING`));
  for (const c of carriers) {
    if (c.kind !== 'leg') continue;
    const lane = deviceSourceLaneOf(c.protocol); if (!lane) continue;
    seen++;
    const want = spec.lanes[lane];
    const snap = readDeviceSourcesSnapshot(c.metadata);
    if (snap === null) {
      const ok = !want && lane === 'value';
      lines.push(`  leg ${c.id} (${lane}): no snapshot${ok ? ' (correct: the spec gives this value lane no block)' : ' - FINDING'}`);
      if (!ok) finding = true; continue;
    }
    if (snap === 'unreadable') { finding = true; lines.push(`  leg ${c.id} (${lane}): snapshot unreadable - FINDING`); continue; }
    const r = snap.resolution;
    const ok = r.state === 'parsed' && r.source === 'contract' && !!want && sameDeclaration(r, want);
    lines.push(`  leg ${c.id} (${lane}): snapshot ${describe(r)}${want ? '' : ' (spec has no block for this lane)'}${ok ? ' = the spec block' : ' - FINDING (want parsed, source contract, equal to the spec)'}`);
    if (!ok) finding = true;
  }
  if (!seen) return { verdict: 'UNEXERCISED', lines: [...lines, '  no Device-sources leg'] };
  return { verdict: finding ? 'FINDING' : 'PASS', lines };
}

/** The card's liveEvidence word: the regex vlg-h4 reads it with, so both controls read the card one way. */
export const CARD_WORD_RE = /liveEvidence: ([a-z-]+) \(declared devices\)/;
export function valueCardGitOnly(cards: ReadonlyArray<{ legId: string; card: string; factSummary: unknown }>): ReqSrcResult {
  const lines: string[] = []; let finding = false;
  for (const c of cards) {
    const word = CARD_WORD_RE.exec(c.card)?.[1] ?? null;
    const ok = word === 'git-only' && word === c.factSummary;
    lines.push(`  value leg ${c.legId}: card word=${word ?? 'ABSENT'} fact summary=${String(c.factSummary ?? '-')}${ok ? '' : ' - FINDING (want git-only on both)'}`);
    if (!ok) finding = true;
  }
  if (!cards.length) return { verdict: 'UNEXERCISED', lines: ['  no declared value leg with a pipeline-index.json'] };
  return { verdict: finding ? 'FINDING' : 'PASS', lines };
}
