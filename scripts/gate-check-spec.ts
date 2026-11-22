/**
 * gate-check-spec.ts — the `--spec <requirements.md>` option of the operator's gate report (`scripts/gate-check.ts`,
 * `npm run report:gate`). PURE: text and stored values in, lines out. No database, no file read, no git.
 *
 * Config sources STEP 3 slice P4, plan W11 (owner decision 4, option b; warn, not block). A sources block the spec gives a leg
 * reaches that leg only when the Program Architect copies it into the plan's contract under the leg's protocol token (or the leg's
 * own task text carries it). When the copy is dropped:
 *   - a leg of a `forced` protocol (Kubernetes, Terraform) or a network change leg is stopped by name — visible;
 *   - a leg of a `runs-undeclared` protocol (observability, from 1.12.0) RUNS, on the service's files, with nothing saying its
 *     declared sources were lost — the silent case this option exists for.
 * The other direction is reported too: a contract key the spec gives no lines for (the planner wrote a block nobody declared).
 *
 * ONE FINDER, ONE PARSER PER GRAMMAR. Where the spec's blocks are is answered by the publish check (`checkSources`,
 * scripts/check-requirements-sources.ts); whether a contract value or a task text carries a block is answered by the shipping
 * readers (device-sources.ts, config-sources.ts). This file holds no kind name, no heading pattern and no protocol name: the tokens
 * come from DEVICE_SOURCE_LANES and from `configSourcesReadKeys(awaiting)` — so a protocol whose text has not shipped has no row
 * here until it leaves the awaiting list, with no edit to this file.
 *
 * A FACT REPORT (Protocol 10): each row says what the spec declares and what the stored contract carries. It decides nothing, changes
 * no exit code and stops nothing.
 */
import { checkSources, type SourcesBlock } from './check-requirements-sources';
import { CONFIG_SOURCE_AWAITING_TEXT, CONFIG_SOURCE_LANES, DEVICE_SOURCE_LANES, assertNeverLane, deviceSourceLaneOf, protocolRunsUndeclared } from '../lib/agents/harness/held-bytes/variant';
import { configSourcesReadKeys } from '../lib/agents/harness/plan-spawn-carry';
import { contractDeviceSourcesValue, parseDeviceSourcesContractValue, resolveLegDeviceSources, sameDeclaration } from '../lib/agents/harness/device-sources';
import { contractConfigSourcesValue, parseConfigSourcesContractValue, resolveLegConfigSources, sameConfigDeclaration } from '../lib/agents/harness/config-sources';

export type SourcesField = 'deviceSources' | 'configSources';
/** A leg as the plan gate reads it: its protocol token (from the title), its stored contract, its own task text. */
export interface SpecLeg { token: string; contract: unknown; description: string | null }
/** What the stored contract carries for one token. `absent`: no key (or a null value). */
export type ContractKeyState = 'absent' | 'parsed' | 'unparseable';
export interface SpecTokenRow {
  token: string;
  field: SourcesField;
  /** The spec has at least one block the finder attributes to this token. */
  specDeclares: boolean;
  /** At least one reading leg's stored contract carries the token's key under `field`. */
  contractCarriesKey: boolean;
  /** How the shipping reader reads the carried value (`absent` when no leg carries it). */
  contractState: ContractKeyState;
  /** Legs of this token (the legs that read the key); 0 when the plan made none. */
  legs: number;
  /** …of which carry the key in their stored contract. */
  legsCarryingKey: number;
  /** …of which carry a sources block in their OWN task text (the platform reads that when the contract has none). */
  legsWithOwnBlock: number;
  /** The token's key sits under the OTHER sources field in some leg's contract (owner decision (b), 2026-11-15: two tables, two
   *  fields — network tokens under `deviceSources`, Config-sources tokens under `configSources`). The platform does not read it
   *  there, so it never counts as "carries the key". */
  keyInWrongField: boolean;
  /** The spec's block(s) of this token against the block the contract carries, as DECLARATIONS (the shipping parsers' own sameness
   *  rule: the same set of lines after the parser's normalisation). `true` equal · `false` not equal · `null` not compared (one side
   *  absent, or a side that does not parse). ✓ is printed ONLY on `true`. */
  linesEqual: boolean | null;
  /** The spec gives legs of this ONE protocol blocks that declare different things: one contract key per protocol cannot carry both. */
  specBlocksDiffer: boolean;
  /** The spec's own check reported a problem, or a block it found states no lane: a "no" for the spec may be a block that was not
   *  attributed. The row then says "no block attributed", never "spec declares lines: no". */
  specUncertain: boolean;
  /** `specDeclares !== contractCarriesKey`. */
  differs: boolean;
  /** ✓ true · ✗ false · informational null — the report's own three marks. */
  mark: boolean | null;
  line: string;
}
export interface SpecComparison {
  /** One row per token that the spec declares, the contract carries, or a leg runs under. */
  rows: SpecTokenRow[];
  /** The finder's own errors (S1-S4), as it words them: a block it could not attribute is not counted in any row. */
  finderErrors: string[];
  /** Device blocks whose lane the finder could not tell (no lane sentence): attributed to no token. */
  unattributedBlocks: number;
  lines: Array<{ mark: boolean | null; text: string }>;
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const yn = (b: boolean) => (b ? 'yes' : 'no');
export const SPEC_FINDER_ERROR_CAP = 8;

/** Everything this report prints that came from a spec or a stored contract (section titles, finder messages, keys) passes through
 *  here: terminal escape sequences, control characters (C0, DEL, C1) and bidirectional / zero-width characters are REMOVED, so a
 *  heading in a requirements file cannot recolour, overwrite or reorder an operator's terminal line. Linear: four character-class
 *  passes, no nested quantifier. */
export function printable(text: string): string {
  return text
    .replace(/\u001b\[[0-9;?]*[ -\/]*[@-~]/g, '')     // CSI sequences
    .replace(/\u001b[0-~]/g, '')                       // two-character escapes (ESC + one final byte)
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, '')
    .replace(/[\t\n]/g, ' ');                          // one printed line stays one line
}

/** Token → the field its block is read from. Derived from the two lane tables; a function of the awaiting list. */
export function specTokens(awaiting: readonly string[] = CONFIG_SOURCE_AWAITING_TEXT): Array<{ token: string; field: SourcesField; protocol: string | null }> {
  return [
    ...Object.entries(DEVICE_SOURCE_LANES).map(([protocol, l]) => ({ token: l.contractKey, field: 'deviceSources' as const, protocol })),
    ...Object.entries(CONFIG_SOURCE_LANES).filter(([, l]) => configSourcesReadKeys(awaiting).includes(l.contractKey))
      .map(([protocol, l]) => ({ token: l.contractKey, field: 'configSources' as const, protocol })),
  ];
}

/** The token a spec block belongs to, or null (a device block with no lane). */
function blockToken(b: SourcesBlock): string | null {
  if (b.grammar === 'config') return b.protocol;
  if (b.lane === null) return null;
  return Object.values(DEVICE_SOURCE_LANES).find((l) => l.lane === b.lane)?.contractKey ?? null;
}

function contractKeyState(contract: unknown, t: { token: string; field: SourcesField; protocol: string | null }): ContractKeyState {
  if (!isObj(contract) || !isObj(contract[t.field])) return 'absent';
  const p = t.field === 'deviceSources'
    ? parseDeviceSourcesContractValue(contractDeviceSourcesValue(contract, t.token))
    : parseConfigSourcesContractValue(contractConfigSourcesValue(contract, t.token), t.protocol ?? t.token);
  return p.state;
}
const otherField = (f: SourcesField): SourcesField => (f === 'deviceSources' ? 'configSources' : 'deviceSources');
/** The token is a key of the OTHER field's object: a block filed where the platform never looks for this protocol. */
function keyUnderWrongField(contract: unknown, t: { token: string; field: SourcesField }): boolean {
  if (!isObj(contract)) return false;
  const other = contract[otherField(t.field)];
  return isObj(other) && Object.prototype.hasOwnProperty.call(other, t.token) && other[t.token] !== undefined && other[t.token] !== null;
}
function ownBlock(description: string | null, t: { field: SourcesField; protocol: string | null; token: string }): boolean {
  if (!description) return false;
  return t.field === 'deviceSources'
    ? resolveLegDeviceSources({ contractValue: undefined, taskBody: description }).state !== 'absent'
    : resolveLegConfigSources({ protocol: t.protocol ?? t.token, contractValue: undefined, taskBody: description }).state !== 'absent';
}

/** What a dropped block means for a leg of this token — asked of the lane helpers, never of a protocol name. Exhaustive over the
 *  Device lane; the Config column is read through `protocolRunsUndeclared`. */
const STOPPED = 'a leg of this protocol with no block is forced to needs-revision by name: its package is not approved';
function droppedMeans(t: { token: string; field: SourcesField }): string {
  if (t.field === 'configSources') {
    return protocolRunsUndeclared(t.token)
      ? 'a leg of this protocol with no block RUNS, on the files its read-only service returns, and nothing stops it: the sources the spec declares would not apply'
      : STOPPED;
  }
  const lane = deviceSourceLaneOf(t.token);
  if (lane === null) return STOPPED;
  switch (lane) {
    case 'change': return STOPPED;
    case 'value': return 'a value leg with no block RUNS and reads no Git file by declaration: the sources the spec declares would not apply';
    default: return assertNeverLane(lane);
  }
}

/** The declaration the contract carries for a token, read as the platform reads it (contract value only). */
function contractDeclaration(contract: unknown, t: { token: string; field: SourcesField; protocol: string | null }) {
  return t.field === 'deviceSources'
    ? { field: 'deviceSources' as const, res: resolveLegDeviceSources({ contractValue: contractDeviceSourcesValue(contract, t.token), taskBody: undefined }) }
    : { field: 'configSources' as const, res: resolveLegConfigSources({ protocol: t.protocol ?? t.token, contractValue: contractConfigSourcesValue(contract, t.token), taskBody: undefined }) };
}
/** Do two blocks declare the same thing — the SHIPPING sameness rule of each grammar; false across grammars. */
function sameBlock(a: SourcesBlock, b: SourcesBlock): boolean {
  if (a.grammar === 'device' && b.grammar === 'device') return sameDeclaration(a.resolution, b.resolution);
  if (a.grammar === 'config' && b.grammar === 'config') return sameConfigDeclaration(a.resolution, b.resolution);
  return false;
}
function blockEqualsContract(b: SourcesBlock, contract: unknown, t: { token: string; field: SourcesField; protocol: string | null }): boolean {
  const c = contractDeclaration(contract, t);
  if (b.grammar === 'device' && c.field === 'deviceSources') return sameDeclaration(b.resolution, c.res);
  if (b.grammar === 'config' && c.field === 'configSources') return sameConfigDeclaration(b.resolution, c.res);
  return false;
}

/**
 * Compare what the spec declares with what the stored plan contract carries, per protocol token. `awaiting` is the Config-sources
 * awaiting list (defaulted; the tests ask both states). ✓ means the DECLARATIONS are equal, never only "a key is present".
 */
export function compareSpecToContract(input: { spec: string; legs: readonly SpecLeg[]; awaiting?: readonly string[] }): SpecComparison {
  const awaiting = input.awaiting ?? CONFIG_SOURCE_AWAITING_TEXT;
  const tokens = specTokens(awaiting);
  const found = checkSources(input.spec, null, { configKeys: configSourcesReadKeys(awaiting) });
  const declared = new Map<string, SourcesBlock[]>();
  let unattributed = 0;
  for (const b of found.blocks) {
    const tok = blockToken(b);
    if (tok === null) unattributed++; else declared.set(tok, [...(declared.get(tok) ?? []), b]);
  }
  const specUncertain = unattributed > 0 || found.errors.length > 0;
  const rows: SpecTokenRow[] = [];
  for (const t of tokens) {
    const own = input.legs.filter((l) => l.token === t.token);
    // The readers of a key are the legs of its token. With none (the plan made no such leg) every leg's contract is asked: the
    // contract is the program's one copy.
    const readers = own.length ? own : input.legs;
    const states = readers.map((l) => contractKeyState(l.contract, t));
    const carrying = states.filter((s) => s !== 'absent').length;
    const contractCarriesKey = carrying > 0;
    const contractState: ContractKeyState = states.find((s) => s === 'unparseable') ?? states.find((s) => s === 'parsed') ?? 'absent';
    const blocks = declared.get(t.token) ?? [];
    const specDeclares = blocks.length > 0;
    const keyInWrongField = input.legs.some((l) => keyUnderWrongField(l.contract, t));
    if (!specDeclares && !contractCarriesKey && own.length === 0 && !keyInWrongField) continue;
    const legsWithOwnBlock = own.filter((l) => ownBlock(l.description, t)).length;
    const differs = specDeclares !== contractCarriesKey;
    const specParsed = blocks.every((b) => b.resolution.state === 'parsed');
    const specBlocksDiffer = specParsed && blocks.some((b) => !sameBlock(b, blocks[0]));
    // Lines are compared only when both sides exist and parse and the spec says ONE thing for the token.
    let linesEqual: boolean | null = null;
    if (specDeclares && contractCarriesKey && specParsed && !specBlocksDiffer && contractState === 'parsed') {
      linesEqual = readers.every((l, i) => states[i] === 'absent' || blockEqualsContract(blocks[0], l.contract, t));
    }
    let mark: boolean | null;
    let tail = '';
    if (!differs) {
      mark = specDeclares ? linesEqual === true : null;
      if (!specDeclares) tail = '';
      else if (specBlocksDiffer) tail = ' — but the spec gives legs of this protocol DIFFERENT blocks: the contract has one key per protocol and cannot carry both (every leg of the protocol reads the one block)';
      else if (!specParsed) tail = ' — lines not compared: the spec\'s block does not parse as the platform reads it';
      else if (contractState === 'unparseable') tail = ' — but the platform cannot read the carried value as lines';
      else if (linesEqual === false) tail = ' — it carries a key, but the LINES DIFFER from the spec\'s block (compared as declarations: the same set of lines)';
      else tail = ' — lines equal: yes';
      if (specDeclares && own.length > 0 && carrying < own.length) { mark = false; tail += ` — only ${carrying} of ${own.length} leg(s) of this protocol carry it`; }
    } else if (specDeclares) {
      const everyLegHasIt = own.length > 0 && legsWithOwnBlock === own.length;
      mark = everyLegHasIt ? null : false;
      tail = everyLegHasIt
        ? ` — DIFFERS, but every leg of this protocol (${own.length}) carries a block in its own task text, which the platform reads (its lines are not compared here)`
        : ` — DIFFERS: the spec's block did not reach the plan's contract under this protocol's key${own.length ? ` (${legsWithOwnBlock} of ${own.length} leg(s) carry a block in their own task text)` : ' (the plan made no leg of this protocol)'}; ${droppedMeans(t)}`;
    } else {
      mark = false;
      tail = specUncertain
        ? ' — the contract carries a key and no spec block was attributed to this protocol (read the spec check\'s problems below before reading this as "the spec does not declare it")'
        : ' — DIFFERS: the contract carries a block the spec does not declare (check where the planner took it from)';
    }
    if (keyInWrongField) {
      // Reported as what it is — never as "carries the key: yes", and always ✗: the platform reads this protocol only under `field`.
      mark = false;
      tail += ` — the plan filed this protocol's block under ${otherField(t.field)}, the WRONG field: the platform reads it only under ${t.field}`;
    }
    // A "no" for the spec is said as "no" only when the finder found every block and attributed it (architectural F5).
    const specSays = specDeclares ? 'spec declares lines: yes' : specUncertain ? 'no block attributed to this protocol' : 'spec declares lines: no';
    rows.push({
      token: t.token, field: t.field, specDeclares, contractCarriesKey, contractState, legs: own.length, legsCarryingKey: own.length ? carrying : 0,
      legsWithOwnBlock, keyInWrongField, linesEqual, specBlocksDiffer, specUncertain, differs, mark,
      line: printable(`${t.token} (${t.field}): ${specSays} — contract carries the key: ${yn(contractCarriesKey)}${tail}`),
    });
  }
  const finderErrors = found.errors.map((e) => printable(`${e.rule}${e.section ? ` [${e.section}]` : ''}: ${e.message}`));
  const lines: SpecComparison['lines'] = [];
  if (rows.length === 0) {
    lines.push({ mark: null, text: specUncertain
      ? 'no sources block was attributed to a protocol and the plan\'s contract carries no sources key'
      : 'the spec declares no sources block and the plan\'s contract carries no sources key' });
  }
  for (const r of rows) lines.push({ mark: r.mark, text: r.line });
  if (unattributed > 0) lines.push({ mark: null, text: `${unattributed} Device sources block(s) in the spec state no lane (change or value), so they are counted under no protocol above` });
  if (finderErrors.length) {
    lines.push({ mark: null, text: `the spec's own check reports ${finderErrors.length} problem(s) — a block it could not attribute is counted in no row above:` });
    for (const e of finderErrors.slice(0, SPEC_FINDER_ERROR_CAP)) lines.push({ mark: null, text: `    ${e.slice(0, 300)}` });
    if (finderErrors.length > SPEC_FINDER_ERROR_CAP) lines.push({ mark: null, text: `    … ${finderErrors.length - SPEC_FINDER_ERROR_CAP} more (run the spec check itself for the full list)` });
  }
  return { rows, finderErrors, unattributedBlocks: unattributed, lines };
}
