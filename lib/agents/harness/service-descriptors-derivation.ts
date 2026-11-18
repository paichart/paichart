/**
 * service-descriptors-derivation — the platform derives `interfaceContract.serviceDescriptors` at leg creation
 * (ARCHITECT-COMPOSED-DESCRIPTOR, owner decision 2026-11-17 "go with your recommendations").
 *
 * Record: cline_docs/reviews/architect-contract-stepback-2026-11-17/ (DERIVATION-MAP.md rules 1-4, CORPUS.md).
 * Corpus: the Program Architect copies a SUPPLIED value right (58/58 URLs) and fills a SILENCE wrong (a composed descriptor object in
 * 4 of 5 all-Git-only programs; leg-name keys). For a protocol with a sources block the declared read line already names the service,
 * so the platform writes `serviceDescriptors[token]` from that line and nothing else.
 *
 * Rules (one function, applied to EVERY contract the platform stores for a program child — plan-spawn-carry.ts):
 *  1. A protocol with a sources lane (DEVICE_SOURCE_LANES `deviceSources`; CONFIG_SOURCE_PROTOCOLS `configSources`) whose block in the
 *     contract PARSES with the shipping parser: the derived value is the ONE distinct service the token's `device-read` / `live-read`
 *     lines name, when it is a descriptor URL.
 *  2. No read line (Git-only / supplied / command-package) ⇒ no entry. Two or more distinct services ⇒ no entry (owner A4,
 *     MULTI-CLUSTER-CONFIG-SOURCES). A line that names a REGISTERED service by name ⇒ no entry: the leg calls that service as it is,
 *     and the leg protocol reads `serviceDescriptors` as "a URL or an inline descriptor object" (never a name).
 *  3. The Architect's value: equal to the derived one ⇒ kept byte-unchanged; different / composed ⇒ replaced; present where the block
 *     derives none ⇒ removed. The platform never writes a value no declared line names.
 *  4. Nothing to derive FROM — a protocol without a sources lane (observability-config today; terraform-iac joined at 1.17.0), or a lane token whose
 *     contract block is absent or unparseable (the leg may declare its block in its own task text, which this program-wide contract
 *     cannot see): the Architect's entry stands, except a value that is neither a string URL nor an object with a string `endpoint`
 *     (no leg can use it) ⇒ removed.
 *  Keys that are not a leg protocol token are REPORTED (`unknownKeys`) and left untouched (owner decision owed before removing).
 *
 * PURE and TOTAL: never throws (a throw inside is caught and the input is returned unchanged, `failed: true`). When nothing changes the
 * SAME object is returned (byte-identical storage, unchanged sha). A FACT, never a verdict (Protocol 10): it records what the platform
 * did to the contract and why, by named reason.
 */

import { CONFIG_SOURCE_LANES, CONFIG_SOURCE_PROTOCOLS, DEVICE_SOURCE_LANES } from './held-bytes/variant';
import { contractDeviceSourcesValue, isDescriptorUrlService, parseDeviceSourcesContractValue } from './device-sources';
import { contractConfigSourcesValue, parseConfigSourcesContractValue } from './config-sources';

export const SERVICE_DESCRIPTORS_FACT_VERSION = 1;

/** Leg protocol tokens with NO sources lane today: the Architect's descriptor is the only source (rule 4). Steps 3/4 of Config
 *  sources move a token from here into CONFIG_SOURCE_LANES (STEPS-2-4-PLAN §4.3 / §5.3); it must then leave this list (pinned). */
export const DESCRIPTOR_ONLY_TOKENS: readonly string[] = Object.freeze(['observability-config']); // terraform-iac joined CONFIG_SOURCE_LANES at 1.17.0 (STEP 4)

type Lane = { field: 'deviceSources' | 'configSources'; protocol: string };
/** token → the field + protocol its block is read with. Derived from the ONE lane tables, never retyped. */
const SOURCE_LANE_TOKENS: ReadonlyMap<string, Lane> = new Map<string, Lane>([
  ...Object.entries(DEVICE_SOURCE_LANES).map(([protocol, l]) => [l.contractKey, { field: 'deviceSources', protocol }] as [string, Lane]),
  ...CONFIG_SOURCE_PROTOCOLS.map((protocol) => [CONFIG_SOURCE_LANES[protocol].contractKey, { field: 'configSources', protocol }] as [string, Lane]),
]);

/** Every key the platform recognises as a leg protocol token under `serviceDescriptors`. */
export function knownDescriptorTokens(): string[] {
  return [...SOURCE_LANE_TOKENS.keys(), ...DESCRIPTOR_ONLY_TOKENS.filter((t) => !SOURCE_LANE_TOKENS.has(t))];
}

export type NotDerivedReason =
  | 'no-read-line'          // the block parses and names no device-read / live-read service (Git-only, supplied, command-package)
  | 'multiple-services'     // two or more distinct read services (owner A4)
  | 'registered-service'    // the one read service is named by registration, not a descriptor URL
  | 'block-absent'          // a lane token with no block in the contract (rule 4 applies)
  | 'block-unparseable';    // a lane token whose contract block does not parse (rule 4 applies)

export type RemovedReason = Exclude<NotDerivedReason, 'block-absent' | 'block-unparseable'> | 'not-a-descriptor' | 'field-not-object';

export interface ServiceDescriptorsFact {
  version: number;
  /** The Architect's `serviceDescriptors` as received. */
  fieldShape: 'absent' | 'object' | 'not-object';
  /** Tokens whose STORED value is the service their declared read line names (kept-equal, added or replaced). */
  derived: string[];
  /** Tokens whose Architect value is stored byte-unchanged (equal to the derived value, or rule 4 with a usable value). */
  kept: string[];
  /** Tokens the Architect left out and the platform wrote. */
  added: string[];
  /** Tokens whose Architect value differed from the derived one and was replaced; `composed` = it was not a string. */
  replaced: Array<{ token: string; reason: 'differs' | 'composed' }>;
  /** Architect entries the platform removed, with why. */
  removed: Array<{ token: string; reason: RemovedReason }>;
  /** Lane tokens with a block (or an Architect entry) from which nothing was derived, with why. */
  notDerived: Array<{ token: string; reason: NotDerivedReason }>;
  /** Keys that are not a leg protocol token — left untouched (sanitised, capped; the count is untruncated). */
  unknownKeys: string[];
  unknownKeyCount: number;
  /** True when the derivation threw or its result would exceed a storage bound: the contract was stored as received. */
  failed: boolean;
}

export const UNKNOWN_KEY_MAX = 12;
export const UNKNOWN_KEY_MAX_CHARS = 64;

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Rule 4: a value a leg can use — a descriptor URL, or an inline descriptor object with a string `endpoint`. */
export function isUsableDescriptorValue(v: unknown): boolean {
  if (typeof v === 'string') return isDescriptorUrlService(v);
  return isObj(v) && typeof v.endpoint === 'string' && v.endpoint.trim() !== '';
}

type Derivation = { kind: 'value'; service: string } | { kind: 'none'; reason: NotDerivedReason };

/** What the token's contract block derives (rules 1-2). PURE. */
export function deriveForToken(contract: unknown, token: string): Derivation | null {
  const lane = SOURCE_LANE_TOKENS.get(token);
  if (!lane) return null;
  let services: string[];
  if (lane.field === 'deviceSources') {
    const p = parseDeviceSourcesContractValue(contractDeviceSourcesValue(contract, token));
    if (p.state === 'absent') return { kind: 'none', reason: 'block-absent' };
    if (p.state === 'unparseable') return { kind: 'none', reason: 'block-unparseable' };
    services = p.entries.flatMap((e) => (e.kind === 'device-read' || e.kind === 'live-read' ? [e.service] : []));
  } else {
    const p = parseConfigSourcesContractValue(contractConfigSourcesValue(contract, token), lane.protocol);
    if (p.state === 'absent') return { kind: 'none', reason: 'block-absent' };
    if (p.state === 'unparseable') return { kind: 'none', reason: 'block-unparseable' };
    services = p.entries.flatMap((e) => (e.kind === 'live-read' ? [e.service] : []));
  }
  const distinct = Array.from(new Set(services));
  if (distinct.length === 0) return { kind: 'none', reason: 'no-read-line' };
  if (distinct.length > 1) return { kind: 'none', reason: 'multiple-services' };
  if (!isDescriptorUrlService(distinct[0])) return { kind: 'none', reason: 'registered-service' };
  return { kind: 'value', service: distinct[0] };
}

const emptyFact = (fieldShape: ServiceDescriptorsFact['fieldShape']): ServiceDescriptorsFact => ({
  version: SERVICE_DESCRIPTORS_FACT_VERSION, fieldShape, derived: [], kept: [], added: [], replaced: [], removed: [], notDerived: [],
  unknownKeys: [], unknownKeyCount: 0, failed: false,
});

/**
 * Apply rules 1-4 to one contract. Returns the contract to STORE and the fact. The same object comes back when nothing changed.
 * Top-level key order is kept; inside `serviceDescriptors` a replaced value keeps its position and an added one is appended.
 */
export function deriveServiceDescriptors(contract: Record<string, unknown>): { contract: Record<string, unknown>; fact: ServiceDescriptorsFact } {
  try {
    return derive(contract);
  } catch {
    const fact = emptyFact('absent');
    fact.failed = true;
    return { contract, fact };
  }
}

function derive(contract: Record<string, unknown>): { contract: Record<string, unknown>; fact: ServiceDescriptorsFact } {
  const raw = contract.serviceDescriptors;
  const fieldShape: ServiceDescriptorsFact['fieldShape'] = raw === undefined ? 'absent' : isObj(raw) ? 'object' : 'not-object';
  const fact = emptyFact(fieldShape);
  const architect: Record<string, unknown> = isObj(raw) ? raw : {};
  const known = new Set(knownDescriptorTokens());

  const unknown = Object.keys(architect).filter((k) => !known.has(k));
  fact.unknownKeyCount = unknown.length;
  fact.unknownKeys = unknown.slice(0, UNKNOWN_KEY_MAX).map((k) => k.replace(/[^A-Za-z0-9._-]/g, '?').slice(0, UNKNOWN_KEY_MAX_CHARS));

  const out: Record<string, unknown> = {};
  let changed = false;
  // 1. The Architect's entries, in its order.
  for (const [k, v] of Object.entries(architect)) {
    if (!known.has(k)) { out[k] = v; continue; }
    const d = deriveForToken(contract, k);
    if (d && d.kind === 'value') {
      fact.derived.push(k);
      if (v === d.service) { fact.kept.push(k); out[k] = v; }
      else { fact.replaced.push({ token: k, reason: typeof v === 'string' ? 'differs' : 'composed' }); out[k] = d.service; changed = true; }
      continue;
    }
    if (d && (d.reason === 'no-read-line' || d.reason === 'multiple-services' || d.reason === 'registered-service')) {
      fact.notDerived.push({ token: k, reason: d.reason });
      fact.removed.push({ token: k, reason: d.reason });
      changed = true;
      continue;
    }
    // Rule 4: nothing to derive from (no sources lane, or the block is absent / unparseable).
    if (d) fact.notDerived.push({ token: k, reason: d.reason });
    if (isUsableDescriptorValue(v)) { fact.kept.push(k); out[k] = v; }
    else { fact.removed.push({ token: k, reason: 'not-a-descriptor' }); changed = true; }
  }
  // 2. Lane tokens the Architect left out.
  for (const token of SOURCE_LANE_TOKENS.keys()) {
    if (Object.prototype.hasOwnProperty.call(architect, token)) continue;
    const d = deriveForToken(contract, token);
    if (!d) continue;
    if (d.kind === 'value') { fact.derived.push(token); fact.added.push(token); out[token] = d.service; changed = true; }
    else if (d.reason !== 'block-absent') fact.notDerived.push({ token, reason: d.reason });
  }

  if (fieldShape === 'not-object') {
    // A non-object field carries no per-token entry a leg can read. It is replaced only when there is something to derive.
    if (Object.keys(out).length === 0) return { contract, fact };
    fact.removed.push({ token: '(field)', reason: 'field-not-object' });
    changed = true;
  }
  if (!changed) return { contract, fact };
  if (fieldShape === 'absent' && Object.keys(out).length === 0) return { contract, fact };

  const next: Record<string, unknown> = {};
  let placed = false;
  for (const [k, v] of Object.entries(contract)) {
    if (k === 'serviceDescriptors') { next[k] = out; placed = true; } else next[k] = v;
  }
  if (!placed) next.serviceDescriptors = out;
  return { contract: next, fact };
}
