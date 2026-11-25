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
 *  2b. (Config sources STEP 3 slice P4, plan §6 — mcp-hub's five cases; owner decision E, sec-ops F-9.) Two per-protocol points of the
 *     Config arm, both read from the lane tables and never from a protocol name:
 *       - the SERVICE LINES of a block are its `live-read` lines AND its `service-held` lines (a kind only observability-config has):
 *         a block whose one service is named only on `service-held` lines derives that service like any other (rule 1);
 *       - a parsed block with NO service line on a protocol whose lane row says `descriptorWithoutServiceLine: 'keep'`
 *         (observability-config: the leg still reads its read-only service for targets and rules) is NOT a removing case: the
 *         Architect's value is KEPT when it is a string descriptor URL, and removed (`not-a-descriptor`) when it is anything else —
 *         an object too, even one with an `endpoint` (the composed-descriptor case this module exists to stop), and a string that is
 *         not ONE WHOLE URL token (`isWholeTokenDescriptorUrl`). The fact names the CONDITION, `no-service-line`, with the lane's
 *         rule beside it (`rule: 'keep'`); whether a value was kept is said only by the `kept` list (a removed value and a token the
 *         Architect left out carry the same condition). A `remove` row (Kubernetes, Terraform) keeps rule 2 exactly (`no-read-line`).
 *     Rule 4 (block absent / unparseable) is NOT narrowed: a usable inline object still stands there.
 *     LIVE for observability-config since the 1.12.0 join (2026-11-23): the token is a lane token — a contract with NO block for it
 *     keeps the Architect's entry exactly as rule 4 does, and the fact then names `block-absent` for the token.
 *  Keys that are not a leg protocol token are REPORTED (`unknownKeys`) and left untouched (owner decision owed before removing).
 *
 * PURE and TOTAL: never throws (a throw inside is caught and the input is returned unchanged, `failed: true`). When nothing changes the
 * SAME object is returned (byte-identical storage, unchanged sha). A FACT, never a verdict (Protocol 10): it records what the platform
 * did to the contract and why, by named reason.
 */

import {
  CONFIG_SOURCE_AWAITING_TEXT, CONFIG_SOURCE_LANES, DEVICE_SOURCE_LANES, assertNeverConfigDescriptorRule, configSourceProtocolsFor, descriptorWithoutServiceLineOf,
  type ConfigDescriptorWithoutServiceLine,
} from './held-bytes/variant';
import { contractDeviceSourcesValue, isDescriptorUrlService, parseDeviceSourcesContractValue } from './device-sources';
import { assertNeverConfigKind, contractConfigSourcesValue, parseConfigSourcesContractValue, type ConfigSourceLine } from './config-sources';

/** The version stamped on `interfaceContractSource.serviceDescriptors.version`, on every NEW contract of EVERY protocol.
 *  2 since the observability-config 1.12.0 join (2026-11-23; decided 2026-11-22 by three reviews, STEP3-P4-BUILD.md §9a): it is the
 *  SERIES-CUT KEY for the contracts the changed derivation writes (rule 2b's two points are live from this version). A stored fact
 *  at version 1 was written before the join. `RESOLVER_VERSION` (plan-spawn-carry.ts) did NOT move — its next number is reserved.
 *  Pinned by test:service-descriptors-derivation P9: a `runs-undeclared` protocol off the awaiting list with a version below 2 is red. */
export const SERVICE_DESCRIPTORS_FACT_VERSION = 2;

type Lane = { field: 'deviceSources' | 'configSources'; protocol: string };
/** Leg protocol tokens with NO sources lane today: the Architect's descriptor is the only source (rule 4). DERIVED since Config
 *  sources STEP 3 (plan W5 row 12; it was a hand-kept list): the contract keys of the Config lane rows still AWAITING their text —
 *  membership comes from the ONE table and the ONE awaiting list, so a token cannot be in this list and in the sources lane at once,
 *  and it leaves here the moment its text ships. Today: `observability-config`. */
export function descriptorOnlyTokens(awaiting: readonly string[] = CONFIG_SOURCE_AWAITING_TEXT): readonly string[] {
  return Object.keys(CONFIG_SOURCE_LANES).filter((p) => awaiting.includes(p)).map((p) => CONFIG_SOURCE_LANES[p].contractKey);
}
/** token → the field + protocol its block is read with. Derived from the ONE lane tables, never retyped; a function of the awaiting list. */
function sourceLaneTokens(awaiting: readonly string[] = CONFIG_SOURCE_AWAITING_TEXT): ReadonlyMap<string, Lane> {
  return new Map<string, Lane>([
    ...Object.entries(DEVICE_SOURCE_LANES).map(([protocol, l]) => [l.contractKey, { field: 'deviceSources', protocol }] as [string, Lane]),
    ...configSourceProtocolsFor(awaiting).map((protocol) => [CONFIG_SOURCE_LANES[protocol].contractKey, { field: 'configSources', protocol }] as [string, Lane]),
  ]);
}

/** Every key the platform recognises as a leg protocol token under `serviceDescriptors`. */
export function knownDescriptorTokens(awaiting: readonly string[] = CONFIG_SOURCE_AWAITING_TEXT): string[] {
  const lanes = sourceLaneTokens(awaiting);
  return [...lanes.keys(), ...descriptorOnlyTokens(awaiting).filter((t) => !lanes.has(t))];
}

export type NotDerivedReason =
  | 'no-read-line'          // the block parses and names no device-read / live-read service (Git-only, supplied, command-package)
  | 'no-service-line'       // the same CONDITION on a protocol whose lane row says `keep` (stamped with `rule: 'keep'`): the Architect's
                            // value is not removed FOR THIS REASON — `kept` says whether it stood, `removed` whether it was not a URL
  | 'multiple-services'     // two or more distinct read services (owner A4)
  | 'registered-service'    // the one read service is named by registration, not a descriptor URL
  | 'block-absent'          // a lane token with no block in the contract (rule 4 applies)
  | 'block-unparseable';    // a lane token whose contract block does not parse (rule 4 applies)

export type RemovedReason = Exclude<NotDerivedReason, 'block-absent' | 'block-unparseable' | 'no-service-line'> | 'not-a-descriptor' | 'field-not-object';

export interface ServiceDescriptorsFact {
  version: number;
  /** The Architect's `serviceDescriptors` as received. */
  fieldShape: 'absent' | 'object' | 'not-object';
  /** Tokens whose STORED value is the service their declared read line names (kept-equal, added or replaced). */
  derived: string[];
  /** Tokens whose Architect value is stored byte-unchanged (equal to the derived value, rule 4 with a usable value, or rule 2b with a
   *  descriptor URL). */
  kept: string[];
  /** Tokens the Architect left out and the platform wrote. */
  added: string[];
  /** Tokens whose Architect value differed from the derived one and was replaced; `composed` = it was not a string. */
  replaced: Array<{ token: string; reason: 'differs' | 'composed' }>;
  /** Architect entries the platform removed, with why. */
  removed: Array<{ token: string; reason: RemovedReason }>;
  /** Lane tokens with a block (or an Architect entry) from which nothing was derived, with why. `rule` is present only beside
   *  `no-service-line`: the lane row's rule for that condition (today always `keep`). */
  notDerived: Array<{ token: string; reason: NotDerivedReason; rule?: ConfigDescriptorWithoutServiceLine }>;
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

export const KEPT_DESCRIPTOR_URL_MAX_CHARS = 2048;
/** ONE WHOLE URL TOKEN (sec-ops, P4 review LOW 1 and its re-check): a string of at most 2,048 characters, every one of them
 *  PRINTABLE ASCII (0x21–0x7E) — so no whitespace, no control character, and no non-ASCII character at all: a descriptor URL needs
 *  none (an international host is written in punycode), and one rule removes bidirectional and zero-width characters, the soft
 *  hyphen, the Arabic letter mark, the Mongolian vowel separator, variation selectors and Unicode tag characters together — that
 *  parses as an http or https URL with a host and no userinfo. Stricter than
 *  `isDescriptorUrlService` (a scheme test, live for every protocol and NOT changed here): that test passes `https://a b`, a URL
 *  followed by prose, and `https://user:pass@host`. Used by the keep arm only; never throws. */
export function isWholeTokenDescriptorUrl(v: unknown): boolean {
  if (typeof v !== 'string' || v.length === 0 || v.length > KEPT_DESCRIPTOR_URL_MAX_CHARS) return false;
  if (!/^[\u0021-\u007e]+$/.test(v)) return false;
  try {
    const u = new URL(v);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname !== '' && u.username === '' && u.password === '';
  } catch { return false; }
}
/** Rule 2b's keep arm: ONLY one whole descriptor URL token stands (an object is the composed case — sec-ops F-9; a string with
 *  anything beside the URL is not a descriptor). Narrower than rule 4 on purpose. */
export function isKeptWithoutServiceLine(v: unknown): boolean {
  return typeof v === 'string' && isDescriptorUrlService(v) && isWholeTokenDescriptorUrl(v);
}

/** The service a Config-sources line names ON A SERVICE LINE, or null (a `git-file` line names the Git file service, which is never a
 *  leg's descriptor; `supplied` names none). Exhaustive over the kinds: a new kind fails to compile here. */
export function configLineService(e: ConfigSourceLine): string | null {
  switch (e.kind) {
    case 'live-read': return e.service;
    case 'service-held': return e.service;
    case 'git-file': return null;
    case 'supplied': return null;
    default: return assertNeverConfigKind(e);
  }
}

type Derivation = { kind: 'value'; service: string } | { kind: 'none'; reason: NotDerivedReason; rule?: ConfigDescriptorWithoutServiceLine };

/** What the token's contract block derives (rules 1-2). PURE. */
export function deriveForToken(contract: unknown, token: string, awaiting: readonly string[] = CONFIG_SOURCE_AWAITING_TEXT): Derivation | null {
  const lane = sourceLaneTokens(awaiting).get(token);
  if (!lane) return null;
  let services: string[];
  let noServiceLine: { reason: NotDerivedReason; rule?: ConfigDescriptorWithoutServiceLine } = { reason: 'no-read-line' };
  if (lane.field === 'deviceSources') {
    const p = parseDeviceSourcesContractValue(contractDeviceSourcesValue(contract, token));
    if (p.state === 'absent') return { kind: 'none', reason: 'block-absent' };
    if (p.state === 'unparseable') return { kind: 'none', reason: 'block-unparseable' };
    services = p.entries.flatMap((e) => (e.kind === 'device-read' || e.kind === 'live-read' ? [e.service] : []));
  } else {
    const p = parseConfigSourcesContractValue(contractConfigSourcesValue(contract, token), lane.protocol);
    if (p.state === 'absent') return { kind: 'none', reason: 'block-absent' };
    if (p.state === 'unparseable') return { kind: 'none', reason: 'block-unparseable' };
    services = p.entries.flatMap((e) => { const s = configLineService(e); return s === null ? [] : [s]; });
    const rule = descriptorWithoutServiceLineOf(lane.protocol);
    switch (rule) {
      case 'keep': noServiceLine = { reason: 'no-service-line', rule }; break;
      case 'remove': case null: break;
      default: assertNeverConfigDescriptorRule(rule);
    }
  }
  const distinct = Array.from(new Set(services));
  if (distinct.length === 0) return { kind: 'none', ...noServiceLine };
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
export function deriveServiceDescriptors(contract: Record<string, unknown>, awaiting: readonly string[] = CONFIG_SOURCE_AWAITING_TEXT): { contract: Record<string, unknown>; fact: ServiceDescriptorsFact } {
  try {
    return derive(contract, awaiting);
  } catch {
    const fact = emptyFact('absent');
    fact.failed = true;
    return { contract, fact };
  }
}

function derive(contract: Record<string, unknown>, awaiting: readonly string[]): { contract: Record<string, unknown>; fact: ServiceDescriptorsFact } {
  const raw = contract.serviceDescriptors;
  const fieldShape: ServiceDescriptorsFact['fieldShape'] = raw === undefined ? 'absent' : isObj(raw) ? 'object' : 'not-object';
  const fact = emptyFact(fieldShape);
  const architect: Record<string, unknown> = isObj(raw) ? raw : {};
  const known = new Set(knownDescriptorTokens(awaiting));

  const unknown = Object.keys(architect).filter((k) => !known.has(k));
  fact.unknownKeyCount = unknown.length;
  fact.unknownKeys = unknown.slice(0, UNKNOWN_KEY_MAX).map((k) => k.replace(/[^A-Za-z0-9._-]/g, '?').slice(0, UNKNOWN_KEY_MAX_CHARS));

  const out: Record<string, unknown> = {};
  let changed = false;
  // 1. The Architect's entries, in its order.
  for (const [k, v] of Object.entries(architect)) {
    if (!known.has(k)) { out[k] = v; continue; }
    const d = deriveForToken(contract, k, awaiting);
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
    // Rule 2b's keep arm: a parsed block with no service line on a `keep` protocol — a descriptor URL stands, nothing else does.
    if (d && d.reason === 'no-service-line') {
      fact.notDerived.push({ token: k, reason: d.reason, ...(d.rule ? { rule: d.rule } : {}) });
      if (isKeptWithoutServiceLine(v)) { fact.kept.push(k); out[k] = v; }
      else { fact.removed.push({ token: k, reason: 'not-a-descriptor' }); changed = true; }
      continue;
    }
    // Rule 4: nothing to derive from (no sources lane, or the block is absent / unparseable).
    if (d) fact.notDerived.push({ token: k, reason: d.reason });
    if (isUsableDescriptorValue(v)) { fact.kept.push(k); out[k] = v; }
    else { fact.removed.push({ token: k, reason: 'not-a-descriptor' }); changed = true; }
  }
  // 2. Lane tokens the Architect left out.
  for (const token of sourceLaneTokens(awaiting).keys()) {
    if (Object.prototype.hasOwnProperty.call(architect, token)) continue;
    const d = deriveForToken(contract, token, awaiting);
    if (!d) continue;
    if (d.kind === 'value') { fact.derived.push(token); fact.added.push(token); out[token] = d.service; changed = true; }
    else if (d.reason !== 'block-absent') fact.notDerived.push({ token, reason: d.reason, ...(d.rule ? { rule: d.rule } : {}) });
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
