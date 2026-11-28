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
import { CONFIG_SOURCE_LANES, CONFIG_SOURCE_PROTOCOLS, DEVICE_SOURCE_LANES, deviceSourceLaneOf } from '../lib/agents/harness/held-bytes/variant';
import { contractConfigSourcesValue, resolveLegConfigSources, sameConfigDeclaration, type LegConfigSources } from '../lib/agents/harness/config-sources';
import { printable } from './gate-check-spec';

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
    // A Config sources block (kubernetes-gitops, 2026-11-16) is not a device lane: listed, never compared here (csk-contract-carried checks it).
    if (b.grammar !== 'device') { lines.push(`  spec "${b.section}" line ${b.line}: config ${b.protocol}, ${b.resolution.state} (not a device lane; see csk-contract-carried)`); continue; }
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

const describeCfg = (r: LegConfigSources): string => (r.state === 'parsed'
  ? `parsed ${r.entries.length} line(s) from ${r.source}`
  : r.state === 'unparseable' ? `unparseable (${r.problem}${r.lineIndex === null ? '' : ` at line ${r.lineIndex + 1}`})` : r.state);

/**
 * The Config sources counterpart of contractEqualsSpec (2026-11-27, owner: item 4; register follow-on of the 2026-11-21 discovery
 * finding "nothing compares a spec's Config sources block with the contract"). For every protocol whose legs declare a Config sources
 * block today (CONFIG_SOURCE_PROTOCOLS: kubernetes-gitops, terraform-iac, observability-config), every carrier's
 * `configSources["<token>"]` must hold EXACTLY the spec's block for that token (shipping parser, sameConfigDeclaration: line order
 * and whitespace do not count, a changed, dropped or added line does). A leg of that protocol with no key while the spec gives one is a
 * finding, as is a key the spec never gave. One block per protocol token (owner 2026-11-15): two DIFFERENT spec blocks for one token
 * are a finding of the spec. Read-only; facts, no verdict on the run.
 */
export function configContractEqualsSpec(carriers: readonly Carrier[], specText: string): ReqSrcResult {
  const r = checkSources(specText);
  const lines: string[] = [];
  let finding = false, exercised = false;
  r.errors.forEach((e) => { finding = true; lines.push(`  spec ${e.rule}${e.section ? ` [${e.section}]` : ''}: ${e.message} - FINDING (the canary's spec must pass the publish check)`); });
  const want: Record<string, LegConfigSources> = {};
  for (const b of r.blocks) {
    if (b.grammar !== 'config') continue;
    lines.push(`  spec "${b.section}" line ${b.line}: config ${b.protocol}, ${describeCfg(b.resolution)}`);
    if (b.resolution.state !== 'parsed') continue;
    const prev = want[b.protocol];
    if (prev && !sameConfigDeclaration(prev, b.resolution)) { finding = true; lines.push(`  spec: two different ${b.protocol} blocks (one block per protocol token) - FINDING`); continue; }
    want[b.protocol] = b.resolution;
  }
  for (const protocol of CONFIG_SOURCE_PROTOCOLS) {
    const key = CONFIG_SOURCE_LANES[protocol].contractKey, spec = want[key];
    for (const c of carriers) {
      const raw = contractConfigSourcesValue(c.contract, key);
      if (raw === undefined || raw === null) {
        if (spec && c.kind === 'leg' && c.protocol === protocol) { finding = true; lines.push(`  leg ${c.id} (${key}): no configSources["${key}"] while the spec gives ${key} a block - FINDING`); }
        continue;
      }
      exercised = true;
      const got = resolveLegConfigSources({ protocol: key, contractValue: raw, taskBody: null });
      if (!spec) { finding = true; lines.push(`  ${c.kind} ${c.id}: configSources["${key}"] = ${describeCfg(got)}, but the spec gives ${key} NO block (invented) - FINDING`); continue; }
      const same = got.state === 'parsed' && sameConfigDeclaration(got, spec);
      lines.push(`  ${c.kind} ${c.id}: configSources["${key}"] ${describeCfg(got)} ${same ? '= the spec block' : '≠ the spec block - FINDING'}`);
      if (!same) finding = true;
    }
  }
  if (finding) return { verdict: 'FINDING', lines };
  return exercised ? { verdict: 'PASS', lines } : { verdict: 'UNEXERCISED', lines: [...lines, '  no contract carries a configSources key'] };
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

// csk-k8s-facts (2026-11-16): its first live run reported a false FINDING because it recomputed from the stored WRAPPER
// `{ version, calls }` and compared with key order significant. Pure helpers, tested in test:canary-req-sources.
/** The calls array of a stored `platformDriftCalls` record (`{ version, calls }`); a bare array is accepted as-is. */
export const driftCallsOf = (rec: unknown): unknown => (isObj(rec) && Array.isArray(rec.calls) ? rec.calls : rec);
/** JSON with object keys sorted, so a recompute and a stored fact compare by content, not by key order. */
export const canonJson = (o: unknown): string => JSON.stringify(o, (_k, v) => (isObj(v) ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))) : v));

// arch-text-2 (2026-11-17, Architect step-back text: descriptors only for a leg without a sources block; Git-file fetch route). The
// Program Architect is not lab-replayable, so these are its live controls. Pure, tested both ways in test:canary-req-sources (AT1-AT6).
export interface ArchDescriptorLeg { id: string; fact: unknown }
/** PASS when the platform had to remove or replace nothing (the Architect wrote no descriptor it should not); FINDING otherwise. */
export function archDescriptorsRespected(legs: readonly ArchDescriptorLeg[]): { verdict: 'PASS' | 'FINDING' | 'UNEXERCISED'; lines: string[] } {
  const lines: string[] = []; let finding = false, seen = 0;
  for (const l of legs) {
    if (!isObj(l.fact)) { lines.push(`  leg ${l.id}: no serviceDescriptors fact (created before the derivation)`); continue; }
    seen++;
    const removed = Array.isArray(l.fact.removed) ? l.fact.removed : []; const replaced = Array.isArray(l.fact.replaced) ? l.fact.replaced : [];
    lines.push(`  leg ${l.id}: derived=${JSON.stringify(l.fact.derived ?? [])} removed=${JSON.stringify(removed)} replaced=${JSON.stringify(replaced)}`);
    if (removed.length || replaced.length) { finding = true; lines.push('    the platform corrected an Architect descriptor: FINDING (the text did not hold)'); }
  }
  if (!seen) return { verdict: 'UNEXERCISED', lines };
  return { verdict: finding ? 'FINDING' : 'PASS', lines };
}
/** PASS when the Architect read raw.githubusercontent.com URLs through the Git file service and made no scrape_page call for one. */
export function archFetchRoute(calls: readonly unknown[]): { verdict: 'PASS' | 'FINDING' | 'UNEXERCISED'; lines: string[] } {
  const argObj = (a: unknown): Record<string, unknown> => { if (isObj(a)) return a; if (typeof a === 'string') { try { const j = JSON.parse(a); return isObj(j) ? j : {}; } catch { return {}; } } return {}; };
  let scrapes = 0, gitReads = 0;
  for (const c of calls) {
    if (!isObj(c)) continue;
    const a = argObj(c.arguments); const tool = String(a.tool ?? c.tool ?? '');
    const inner = argObj(a.arguments);
    if (tool === 'scrape_page' && /raw\.githubusercontent\.com/.test(String(inner.url ?? ''))) scrapes++;
    if (tool === 'get_file_contents') gitReads++;
  }
  const lines = [`  scrape_page calls on raw.githubusercontent.com: ${scrapes}; get_file_contents calls: ${gitReads}`];
  if (!scrapes && !gitReads) return { verdict: 'UNEXERCISED', lines };
  return { verdict: scrapes ? 'FINDING' : 'PASS', lines };
}

// ── Terraform leg facts (cst-tf-facts, terraform-iac 1.17.0 + the Program Architect's configSources["terraform-iac"] sentence; pre-registered
// 2026-11-19 BEFORE the Architect sentence deploys). Pure: the caller hands over, per Terraform leg, how many of its tasks carry the Config
// sources snapshot and each child's role + stored result.json. FINDING is the hand-read trigger, never a verdict on the run.
export type TfLegFacts = { id: string; tasks: number; snapshotOn: number; kids: ReadonlyArray<{ role: string; result: Record<string, unknown> | null }> };
export function tfLegFacts(legs: readonly TfLegFacts[]): { verdict: 'PASS' | 'FINDING' | 'UNEXERCISED'; lines: string[] } {
  const lines: string[] = []; let finding = false, witnesses = 0;
  if (!legs.length) return { verdict: 'UNEXERCISED', lines: ['  no terraform-iac leg'] };
  for (const l of legs) {
    lines.push(`  leg ${l.id}: Config sources snapshot on ${l.snapshotOn} of ${l.tasks} task(s)`);
    if (!l.snapshotOn) { finding = true; lines.push('    no snapshot: the leg received no `## Config sources` block (the contract carried none under configSources["terraform-iac"], or the leg stopped) : FINDING'); }
    for (const k of l.kids) {
      const j = k.result; if (!j) continue;
      if ('platformDriftCalls' in j) { finding = true; lines.push(`    ${k.role}: platformDriftCalls present on a Terraform leg (no Git-vs-live method exists) : FINDING`); }
      const d = isObj(j.gitLiveDrift) ? j.gitLiveDrift : null;
      if (d) lines.push(`    ${k.role}: gitLiveDrift checked=${String(d.checked)} reason=${String(d.reason ?? '-')}`);
      if (d && d.checked === true) { finding = true; lines.push('      gitLiveDrift reads checked on a Terraform leg : FINDING'); }
      if (k.role !== 'config_change_author') continue;
      const w = isObj(j.planWitness) ? j.planWitness : null;
      if (!w) { finding = true; lines.push('    config_change_author: no planWitness fact : FINDING'); continue; }
      witnesses++;
      const n = (x: unknown) => (Array.isArray(x) ? x.length : 0);
      lines.push(`    config_change_author: planWitness stopSentence=${String(w.stopSentence)} missing=${n(w.missing)} missingResources=${n(w.missingResources)} wholeValueKeys=${n(w.wholeValueKeys)} listsCover=${String(w.listsCover)}`);
      if (w.stopSentence !== 'verbatim' || n(w.missing) || n(w.missingResources) || n(w.wholeValueKeys)) { finding = true; lines.push('      the witness check found a fault : FINDING (read the package; the leg should read needs-revision)'); }
      else if (w.listsCover !== 'all-edits') lines.push('      not every edit was read by the platform ; the Reviewer checked those by eye (read its review)');
    }
  }
  if (finding) return { verdict: 'FINDING', lines };
  if (!witnesses) return { verdict: 'UNEXERCISED', lines: [...lines, '  no Author execution carried a result ; an absence, not a pass'] };
  return { verdict: 'PASS', lines: [...lines, `  ${witnesses} Author execution(s): a clean planWitness; no drift call; every leg holds its declared sources`] };
}

// ── observability-config 1.12.0, the join (pre-registered 2026-11-23, BEFORE the deploy; owner decision of the same day on the
// placeholder exception). Three controls, each decided from STORED facts only. A leg "declares" when the platform's own resolver
// (`resolveLegConfigSources`, the shipping function) reads a block for it ; from its task text or from the contract key.
/** Every line of the three controls passes through the gate report's `printable()` (sec-ops, join review): a stored string (a
 *  reason, a label, a kind, a summary) is written by a run and can carry terminal escape sequences or control characters. */
const cso = (verdict: ReqSrcVerdict, lines: string[]): ReqSrcResult => ({ verdict, lines: lines.map((l) => printable(l)) });
const OBS_PROTOCOL = 'observability-config-protocol';
const OBS_KEY = 'observability-config';
const FORCE_OF_THE_CONFIG_LANE = (reason: unknown): boolean => typeof reason === 'string'
  && (reason.startsWith('config-sources-') || reason === 'git-file-not-held' || reason === 'service-held-not-held');
const REGISTRATION_STATES = new Set(['file-from-other-service', 'registered-under-other-name']);

export interface ObsContractLeg { id: string; description: string | null; contract: unknown }
/**
 * cso-obs-no-placeholder-key (owner decision 2026-11-23: the exception ships as is and is watched). On every observability leg the
 * plan's contract must carry `configSources` as an OBJECT (or not at all) and, under `observability-config`, either nothing / null
 * or lines that PARSE. A placeholder there (an empty string, a note, an empty list, an object) or a non-object `configSources`
 * stops the leg by name (`config-sources-unparseable`; `config-sources-snapshot-absent` on a leg first stamped before the join) ;
 * a leg that declares nothing included. PASS needs at least one observability leg; with none the control is UNEXERCISED.
 */
export function obsNoPlaceholderKey(legs: readonly ObsContractLeg[]): ReqSrcResult {
  if (!legs.length) return cso('UNEXERCISED', ['  no observability-config leg']);
  const lines: string[] = []; let finding = false; let declared = 0; let undeclared = 0;
  for (const l of legs) {
    const c = isObj(l.contract) ? l.contract : {};
    const cs = c.configSources;
    const shape = cs === undefined || cs === null ? 'absent' : isObj(cs) ? 'object' : Array.isArray(cs) ? 'ARRAY' : typeof cs;
    const hasKey = isObj(cs) && Object.prototype.hasOwnProperty.call(cs, OBS_KEY) && cs[OBS_KEY] !== null && cs[OBS_KEY] !== undefined;
    const r = resolveLegConfigSources({ protocol: OBS_PROTOCOL, contractValue: contractConfigSourcesValue(l.contract, OBS_KEY), taskBody: l.description });
    lines.push(`  leg ${l.id}: configSources ${shape}; ${OBS_KEY} key ${hasKey ? 'present' : 'absent'}; the platform reads: ${r.state}${'source' in r ? ` (${r.source})` : ''}${'problem' in r ? ` : ${r.problem}` : ''}`);
    if (shape !== 'absent' && shape !== 'object') { finding = true; lines.push('    `configSources` is not an object: every observability leg of the program is stopped (config-sources-unparseable) : FINDING'); continue; }
    if (r.state === 'absent') { undeclared++; continue; }
    if (r.state === 'parsed') { declared++; continue; }
    finding = true;
    lines.push(hasKey && r.state === 'unparseable'
      ? `    a value under configSources["${OBS_KEY}"] that is not source lines (a placeholder, a note, an empty value): the leg is stopped by name : FINDING ; the plan must carry NO key for a leg with no block`
      : `    the leg's declaration reads ${r.state}: the leg is stopped by name : FINDING`);
  }
  if (finding) return cso('FINDING', lines);
  return cso('PASS', [...lines, `  ${legs.length} observability leg(s): ${undeclared} declare nothing and carry no key, ${declared} declare a block that parses; no placeholder`]);
}

export interface ObsFactsLeg { id: string; description: string | null; contract: unknown; snapshot: boolean; heldEdit: unknown; harvester: Record<string, unknown> | null }
const declares = (l: ObsFactsLeg): boolean => resolveLegConfigSources({ protocol: OBS_PROTOCOL, contractValue: contractConfigSourcesValue(l.contract, OBS_KEY), taskBody: l.description }).state !== 'absent';
/**
 * cso-obs-undeclared-leg: an observability leg that declares NOTHING runs as before ; no Config-sources snapshot, no Config-lane
 * force on its quality gate, and its Harvester carries the `configSourceReads.undeclared` stamp and no comparison record.
 * UNEXERCISED when the program has no such leg, or none has a Harvester result yet.
 */
export function obsUndeclaredLeg(legs: readonly ObsFactsLeg[]): ReqSrcResult {
  const mine = legs.filter((l) => !declares(l));
  if (!mine.length) return cso('UNEXERCISED', [`  no observability leg that declares nothing (${legs.length} observability leg(s))`]);
  const lines: string[] = []; let finding = false; let seen = 0;
  for (const l of mine) {
    const he = isObj(l.heldEdit) ? l.heldEdit : null;
    lines.push(`  leg ${l.id}: snapshot ${l.snapshot ? 'PRESENT' : 'none'}; heldEdit ${he ? `forced=${String(he.forced)} reason=${String(he.reason ?? '-')}` : 'not stamped yet'}`);
    if (l.snapshot) { finding = true; lines.push('    a Config-sources snapshot on a leg that declares nothing : FINDING'); }
    if (he && FORCE_OF_THE_CONFIG_LANE(he.reason)) { finding = true; lines.push('    the Config lane names a reason on a leg that declares nothing : FINDING (a failed read of the leg\'s own row reads config-sources-could-not-check ; read the platform log line CONFIG_SOURCES_LEG_ROW_READ_FAILED)'); }
    const j = l.harvester; if (!j) continue;
    seen++;
    const r = isObj(j.configSourceReads) ? j.configSourceReads : null;
    lines.push(`    Harvester: configSourceReads ${r ? `checked=${String(r.checked)} reason=${String(r.reason ?? '-')} undeclared=${isObj(r.undeclared) ? JSON.stringify(r.undeclared) : 'ABSENT'}` : 'ABSENT'}; fileSourceCompare ${'fileSourceCompare' in j ? 'PRESENT' : 'absent'}`);
    if (!r || !isObj(r.undeclared) || r.checked !== false) { finding = true; lines.push('    no `undeclared` stamp on the Harvester of a leg that declares nothing (composed below 1.12.0, or the stamp is missing) : FINDING'); }
    if ('fileSourceCompare' in j || 'gitLiveDrift' in j) { finding = true; lines.push('    a comparison record or a Git-vs-live fact on a leg that declares nothing : FINDING'); }
  }
  if (finding) return cso('FINDING', lines);
  if (!seen) return cso('UNEXERCISED', [...lines, '  no Harvester result yet ; an absence, not a pass']);
  return cso('PASS', [...lines, `  ${seen} Harvester(s) of ${mine.length} leg(s) that declare nothing: stamped undeclared, nothing compared, nothing forced by the Config lane`]);
}
/**
 * cso-obs-declared-facts: a DECLARED observability leg carries its snapshot; its Harvester carries the platform's comparison record
 * and the three facts computed from it; and every declared service line was tied to a registration (the Harvester registered with
 * the descriptor URL alone): no `unresolvedServices`, no line reading `file-from-other-service` / `registered-under-other-name`.
 * UNEXERCISED when the program has no declared observability leg, or none has a Harvester result yet.
 */
export function obsDeclaredFacts(legs: readonly ObsFactsLeg[]): ReqSrcResult {
  const mine = legs.filter(declares);
  if (!mine.length) return cso('UNEXERCISED', [`  no DECLARED observability leg (${legs.length} observability leg(s)) ; an absence, not a pass`]);
  const lines: string[] = []; let finding = false; let seen = 0;
  for (const l of mine) {
    lines.push(`  leg ${l.id}: Config sources snapshot ${l.snapshot ? 'present' : 'ABSENT'}`);
    if (!l.snapshot) { finding = true; lines.push('    a declared leg with no snapshot (it is stopped: config-sources-snapshot-absent) : FINDING'); }
    const j = l.harvester; if (!j) continue;
    seen++;
    const has = (k: string) => (isObj(j[k]) ? 'yes' : 'NO');
    lines.push(`    Harvester: fileSourceCompare=${has('fileSourceCompare')} configSourceReads=${has('configSourceReads')} liveEvidence=${isObj(j.liveEvidence) ? String(j.liveEvidence.summary ?? j.liveEvidence.reason) : 'NO'} gitLiveDrift=${isObj(j.gitLiveDrift) ? `checked=${String(j.gitLiveDrift.checked)}${j.gitLiveDrift.reason ? ` reason=${String(j.gitLiveDrift.reason)}` : ''}` : 'NO'}`);
    for (const k of ['fileSourceCompare', 'configSourceReads', 'liveEvidence', 'gitLiveDrift']) if (!isObj(j[k])) { finding = true; lines.push(`    ${k} is not stamped on the Harvester of a declared leg : FINDING`); }
    const r = isObj(j.configSourceReads) ? j.configSourceReads : null;
    if (r && isObj(r.undeclared)) { finding = true; lines.push('    the `undeclared` stamp on a leg that declares a block : FINDING'); }
    const items = r && Array.isArray(r.items) ? (r.items as unknown[]).filter(isObj) : [];
    for (const it of items) {
      const state = isObj(it.read) ? String(it.read.state) : '?';
      lines.push(`      ${String(it.label)} (${String(it.kind)}): ${state}`);
      if (REGISTRATION_STATES.has(state)) { finding = true; lines.push('        the file was not tied to the declared service: the Harvester did not register with the descriptor URL alone : FINDING'); }
    }
    const unresolved = r && Array.isArray(r.unresolvedServices) ? r.unresolvedServices.length : 0;
    if (unresolved) { finding = true; lines.push(`    ${unresolved} declared descriptor URL(s) no registration of the run was tied to : FINDING`); }
  }
  if (finding) return cso('FINDING', lines);
  if (!seen) return cso('UNEXERCISED', [...lines, '  no Harvester result yet ; an absence, not a pass']);
  return cso('PASS', [...lines, `  ${seen} Harvester(s) of ${mine.length} declared leg(s): the comparison record and its three facts are stamped; every declared service line was tied to a registration`]);
}


// ── The Config sources READ RULE widened to kubernetes-gitops and terraform-iac (pre-registered 2026-11-26, BEFORE the deploy; lab
// widening controls 3/3 each, cline_docs/reviews/config-sources-plans-2026-11-09/WIDENING-CONTROLS-BUILD-NOTE-DRAFT.md). Control
// `rrw-k8s-tf-read-rule`. A DECLARED Kubernetes or Terraform leg (its Config sources snapshot is present): every Harvester result
// carries `protocolInjection.configSourcesReadRule: true`, every declared line is `read`, and the leg is not forced `git-file-not-held`.
// The extra live reads the lab saw (8 of 8 samples; the stored runs 0) are printed as a WATCH, never a finding: they are harmless to the
// facts. An undeclared leg (no snapshot) gets no rule and is not checked here.
export interface RrwLeg { id: string; protocol: string; snapshot: boolean; heldEdit: unknown; harvesters: ReadonlyArray<Record<string, unknown> | null> }
export const READ_RULE_WIDENED_PROTOCOLS: readonly string[] = Object.freeze(['kubernetes-gitops-protocol', 'terraform-iac-protocol']);
const innerToolsOf = (j: Record<string, unknown>): string[] => (Array.isArray(j.toolCalls) ? j.toolCalls : []).flatMap((c) => {
  if (!isObj(c) || c.tool !== 'services') return [];
  const a = isObj(c.arguments) ? c.arguments : isObj(c.input) ? c.input : null;
  return a && a.action === 'call' && typeof a.tool === 'string' ? [a.tool] : [];
});
export function readRuleWidened(legs: readonly RrwLeg[]): ReqSrcResult {
  const mine = legs.filter((l) => READ_RULE_WIDENED_PROTOCOLS.includes(l.protocol) && l.snapshot);
  if (!mine.length) return cso('UNEXERCISED', [`  no DECLARED kubernetes-gitops / terraform-iac leg (${legs.length} leg(s) of those protocols) ; an absence, not a pass`]);
  const lines: string[] = []; let finding = false; let seen = 0;
  for (const l of mine) {
    const he = isObj(l.heldEdit) ? l.heldEdit : null;
    const forced = !!he && he.forced === true;
    lines.push(`  leg ${l.id} (${l.protocol})${forced ? ` FORCED(${String(he!.reason)})` : ''}`);
    if (forced && String(he!.reason) === 'git-file-not-held') { finding = true; lines.push('    forced git-file-not-held : FINDING'); }
    for (const j of l.harvesters) {
      if (!j) continue;
      seen++;
      const pi = isObj(j.protocolInjection) ? j.protocolInjection : {};
      const rule = pi.configSourcesReadRule === true;
      lines.push(`    Harvester: configSourcesReadRule=${rule ? 'true' : 'ABSENT'}`);
      if (!rule) { finding = true; lines.push('      the read rule was not rendered on a declared Harvester of a widened protocol : FINDING'); }
      const r = isObj(j.configSourceReads) ? j.configSourceReads : null;
      const items = r && Array.isArray(r.items) ? (r.items as unknown[]).filter(isObj) : [];
      if (!r) { finding = true; lines.push('      configSourceReads not stamped : FINDING'); }
      for (const it of items) {
        const state = isObj(it.read) ? String(it.read.state) : '?';
        lines.push(`      ${String(it.label)} (${String(it.kind)}): ${state}`);
        if (state !== 'read') { finding = true; lines.push('        a declared line not read : FINDING'); }
      }
      const tools = innerToolsOf(j);
      const counts = tools.reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {});
      lines.push(`      WATCH services calls: ${Object.entries(counts).map(([k, n]) => `${k}×${n}`).join(', ') || 'none'}${counts.list_secret_names ? ' (list_secret_names present)' : ''}`);
    }
  }
  if (finding) return cso('FINDING', lines);
  if (!seen) return cso('UNEXERCISED', [...lines, '  no Harvester result yet ; an absence, not a pass']);
  return cso('PASS', [...lines, `  ${seen} Harvester(s) of ${mine.length} declared leg(s): the rule rendered, every declared line read, no git-file-not-held force (hand-compare the WATCH line with the stored pre-widening runs)`]);
}
