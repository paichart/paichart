/**
 * Config-sources network push 1a (DESIGN v2 §1.4 `liveEvidence` build spec; execution-facts review S1/S3/S4) — `liveEvidence`, PURE.
 *
 * QUESTION (one, and only one — "a fact answers ONE question"): for each device the leg's GOVERNING Device-sources declaration names,
 * was its LIVE running configuration read by the Harvester, read from a Git file only, or does no read apply? It is NOT containment,
 * NOT provenance and NEVER a gate input: it is never a `containmentDisposition` reason, now or as a later earned verdict (EF-N2 — if
 * one is ever earned it ships under its own name).
 *
 * ONE DEFINITION OF "READ": computed through the shared READ RECORD (`computeDeviceSourceReads`, device-source-facts.ts — the same
 * extractor capture uses), never a second reading of the tool calls, and never a read of the sibling `deviceSourceReads` STAMP. The
 * record's state strings are carried VERBATIM (`whole-config`, `not-read`, `read-failed`, `result-truncated`, `empty-config`).
 *
 * COUNTS FIRST (EF-S1). Every declared device lands in EXACTLY ONE bucket (the bucket-sum pin asserts it):
 *   liveRead       declares a live read (`device-read` or `live-read`) and the record says `whole-config`
 *   liveNotRead[]  declares a live read and the record says anything else (state verbatim)
 *   gitOnly[]      declares a Git file and no live read (with the Git read's record state)
 *   notApplicable  `command-package` (no read applies)
 * `liveDeclared` = liveRead + liveNotRead. An unclassifiable row THROWS (the registry stamps `errorFact`): an else-branch is a claim
 * that every other case was enumerated, so there is none.
 *
 * SUMMARY, computed from the counts and nothing else, in this precedence: `no-items` (zero devices — an absence, not a rate) ·
 * `some-not-read` · `none-declared` (no device declares a live read) · `some-git-only` · `all-read`. VALUE-LEG-GIT (G2-c/G4-a): with
 * `gitOnlyWord` (the value lane), a leg whose every device is Git-file-only (command-package aside) reads `git-only` instead of `none-declared`.
 * A NON-PARSED declaration (absent / unparseable / conflict / snapshot-* / could-not-check) is passed through by name:
 * `checked:false, reason: device-sources-<state>` with the record's `declaration` — no summary, no buckets.
 * NAMES: each list carries at most LIVE_EVIDENCE_NAME_CAP entries (render WHAT, not how many); a capped list records its true total
 * under `capped` so the bucket sum still holds.
 *
 * VERSION KEYING (EF-S3): the pure function computes unconditionally (the lab lever calls it). WHETHER it is stamped is the
 * enrichment's population answer (live-evidence-enrichment.ts): only on an execution whose STAMPED protocol version is a released
 * Config-sources version (`LIVE_EVIDENCE_MIN_VERSIONS`), so every stored leg replays byte-identical forever.
 */
import { computeDeviceSourceReads } from './device-source-facts';
import { parseDeviceSourceLine } from './device-sources';
import type { LegDeviceSourcesResolution } from './device-sources-read';
import { canonicalProtocolName } from './program-protocol';

export const LIVE_EVIDENCE_VERSION = 1;
/** EF-S1: names per list (the DEVICES_NOT_HELD_CAP precedent). */
export const LIVE_EVIDENCE_NAME_CAP = 20;

/**
 * EF-S3: the released Config-sources version per protocol (canonical long form). A leg composing BELOW it — every stored leg today —
 * gets NOT_STAMPED. network-provisioning 1.26.0 is the network text (1b + 1c). k8s / terraform / obs join with their own rows at their
 * own code pushes. Value legs (network-derivation) were absent until 2026-11-06 (a value-leg Harvester always read live, EF-S4.8);
 * VALUE-LEG-GIT (owner G1-a, D11(5) reversed for DECLARED sources) lets a value leg declare Git-only devices, so the fact is now the
 * stated limit, never a false signal.
 */
export const LIVE_EVIDENCE_MIN_VERSIONS: Readonly<Record<string, string>> = Object.freeze({
  [canonicalProtocolName('network-provisioning')]: '1.26.0',
  // VALUE-LEG-GIT (owner G1–G4, 2026-11-06): the value leg's own text version — keys the leg's SYNTHESIZE hoist (the leg composes
  // network-derivation). Its Harvester composes the network-provisioning text (1.26.0 above) and stamps only on a DECLARED value leg.
  [canonicalProtocolName('network-derivation')]: '1.3.0',
});

const semver = (v: unknown): [number, number, number] | null => {
  const m = typeof v === 'string' ? /^(\d+)\.(\d+)\.(\d+)/.exec(v) : null;
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const atLeast = (a: [number, number, number], b: [number, number, number]) =>
  a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] >= b[2];

/**
 * Does the execution's OWN stamped protocol injection (`result.json → protocolInjection.delta {name, version}`, the field MI-13
 * `_heldleg` keys) name a protocol at or above its released Config-sources version? A leaf runs in `named` mode and records the
 * delta it composed; a leg's SYNTHESIZE records its composed delta. Absent / degraded / unparseable ⇒ false (a population answer).
 */
export function liveEvidenceVersionApplies(protocolInjection: unknown): boolean {
  const pi = protocolInjection && typeof protocolInjection === 'object' ? (protocolInjection as Record<string, unknown>) : null;
  const delta = pi && pi.delta && typeof pi.delta === 'object' ? (pi.delta as Record<string, unknown>) : null;
  if (!delta || typeof delta.name !== 'string' || !delta.name) return false;
  const min = LIVE_EVIDENCE_MIN_VERSIONS[canonicalProtocolName(delta.name)];
  const have = semver(delta.version);
  const need = semver(min);
  return !!have && !!need && atLeast(have, need);
}

/**
 * VALUE-LEG-GIT network text batch 1 (owner-approved 2026-11-07): the CHANGE lane's `git-only` word is released with
 * network-provisioning 1.27.0 — its Reviewer sentence names the card word, so the word ships WITH that text and never before. Keyed
 * on the STAMPING execution's own `protocolInjection.delta` (the Harvester computes the word; the Author transcribes and the leg hoists
 * that stamp), so every stored change leg (composed below 1.27.0) replays byte-identical. The value lane is unconditional (1.3.0).
 */
export const GIT_ONLY_WORD_MIN_VERSIONS: Readonly<Record<string, string>> = Object.freeze({
  [canonicalProtocolName('network-provisioning')]: '1.27.0',
});

/** Does the execution's own composed protocol release the change lane's `git-only` word? Absent / unparseable ⇒ false. */
export function gitOnlyWordApplies(protocolInjection: unknown): boolean {
  const pi = protocolInjection && typeof protocolInjection === 'object' ? (protocolInjection as Record<string, unknown>) : null;
  const delta = pi && pi.delta && typeof pi.delta === 'object' ? (pi.delta as Record<string, unknown>) : null;
  if (!delta || typeof delta.name !== 'string' || !delta.name) return false;
  const have = semver(delta.version);
  const need = semver(GIT_ONLY_WORD_MIN_VERSIONS[canonicalProtocolName(delta.name)]);
  return !!have && !!need && atLeast(have, need);
}

type Obj = Record<string, unknown>;
const LIVE_KINDS = new Set(['device-read', 'live-read']);

function capped<T>(list: T[], name: string, cap: Obj): T[] {
  if (list.length <= LIVE_EVIDENCE_NAME_CAP) return list;
  cap[name] = list.length;
  return list.slice(0, LIVE_EVIDENCE_NAME_CAP);
}

/**
 * Contract-devices fold (owner decision option 1, 2026-11-05, L-CS-N ADDENDUM (d)): the devices the leg's PROGRAM INTERFACE CONTRACT
 * names in its `deviceSources` (across EVERY leg key — the contract the leg Reviewer itself reads) that THIS leg's governing declaration
 * does not declare. A PLAIN FACT: a name list and counts, no scope judgement (whether such a device is in this leg's scope is the
 * Reviewer's call under R1 v2 clause (c) — Protocol 10). It does NOT move the summary word, the buckets or the bucket sum.
 * WHY: in the re-crib, every refusing cell had something concrete NAMING the undeclared device; the approving cells had a green
 * `all-read` and nothing naming it. The contract already held the name.
 * PARSING: each entry through the SHIPPING line grammar (`parseDeviceSourceLine` — one definition of a device name, under the same kind
 * gate as the declaration). TOLERANT, never strict and never a throw: an entry that does not parse is COUNTED (`unparsedEntries`) and
 * names nothing; blank lines and a copied `#` heading line are not entries. A non-object `deviceSources` names nothing, by reason.
 * No contract / no `deviceSources` ⇒ `contractDevices: {checked:false, reason}` and NO `contractNotDeclared` list (nothing renders).
 * THE FOUR STORED SHAPES (model-written; nets-replay snapshot, 25 network legs since 2026-10-24, 13 carry the key — pinned LE18):
 *   1 object of ARRAYS of lines            ⇒ names                (the firewall-a3 lab contract)
 *   2 object of a MARKDOWN STRING block     ⇒ names, line by line, the copied `## Device sources` heading skipped
 *   3 object with a PROSE NOTE              ⇒ `no-device-list` (nothing parses), no list
 *   4 a PLAIN STRING                        ⇒ `device-list-not-keyed`, no list
 */
const isPlainObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const HEADING_LINE_RE = /^#{1,6}[ \t]/;

function contractDevices(interfaceContract: unknown, declared: ReadonlySet<string>, excludeKeys: readonly string[]): { contractDevices: Obj; notDeclared?: string[] } {
  if (!isPlainObj(interfaceContract)) return { contractDevices: { checked: false, reason: 'no-contract' } };
  const ds = interfaceContract.deviceSources;
  if (ds === undefined || ds === null) return { contractDevices: { checked: false, reason: 'no-device-list' } };
  if (!isPlainObj(ds)) return { contractDevices: { checked: false, reason: 'device-list-not-keyed' } };
  const named: string[] = [];
  let entries = 0;
  let unparsedEntries = 0;
  // VALUE-LEG-GIT (owner G4-b FALLBACK, 2026-11-06): stored contracts key `deviceSources` by LEG (`network-provisioning-core`, `-edge`),
  // and folding every such key is the point of option 1 — so the fold stays across every key, EXCEPT the keys the caller excludes: on a
  // change leg, the value lane's key (`network-derivation`, and a leg-suffixed `network-derivation-…`), whose switch list is a value leg's
  // read scope, never a change leg's. `legKeys` stays the count of keys present, so the stamp's shape is unchanged.
  const excluded = (k: string) => excludeKeys.some((x) => k === x || k.startsWith(`${x}-`));
  // sec-ops F2 (2026-11-06): a skipped key is NAMED on the stamp (`excludedKeys`, only when one was skipped — every other stamp keeps its shape),
  // so a change leg's device filed under a value-lane-looking key is visible, never a silent drop.
  const excludedKeys = Object.keys(ds).filter(excluded);
  for (const value of Object.entries(ds).filter(([k]) => !excluded(k)).map(([, v]) => v)) {
    const lines: Array<string | null> = typeof value === 'string' ? value.split(/\r?\n/)
      : Array.isArray(value) ? value.flatMap((v) => (typeof v === 'string' ? v.split(/\r?\n/) : [null]))
        : [null];
    for (const line of lines) {
      if (line !== null && (line.trim() === '' || HEADING_LINE_RE.test(line.trim()))) continue;
      entries++;
      const p = line === null ? null : parseDeviceSourceLine(line);
      if (!p || !p.ok) { unparsedEntries++; continue; }
      if (!named.includes(p.line.device)) named.push(p.line.device);
    }
  }
  // Shape 3 (a prose note under a key, e.g. `{"note": "Not applicable — …"}`): nothing parses, so the contract names NO device —
  // the same answer as no list at all, by its own reason, and no list (a word in a note is never a device name).
  if (named.length === 0) {
    return { contractDevices: { checked: false, reason: 'no-device-list', legKeys: Object.keys(ds).length, entries, unparsedEntries, ...(excludedKeys.length ? { excludedKeys: excludedKeys.slice(0, LIVE_EVIDENCE_NAME_CAP) } : {}) } };
  }
  const notDeclared = named.filter((d) => !declared.has(d));
  return {
    contractDevices: { checked: true, legKeys: Object.keys(ds).length, entries, unparsedEntries, devicesNamed: named.length, notDeclared: notDeclared.length,
      ...(excludedKeys.length ? { excludedKeys: excludedKeys.slice(0, LIVE_EVIDENCE_NAME_CAP) } : {}) },
    notDeclared,
  };
}

/** liveEvidence from an already-computed read record (the registry path: the ctx memo hands the record both nets share).
 *  `interfaceContract` — the owning leg's stored `inputContext.interfaceContract` (undefined/null ⇒ `no-contract`). */
/** VALUE-LEG-GIT: who the fact is for. `excludeContractKeys` — `deviceSources` keys the contract fold skips (G4-b fallback: a change leg
 *  skips the value lane's key; default none, so every existing caller computes what it did). `gitOnlyWord` (owner G2-c / G4-a) — a leg
 *  whose every device is Git-file-only reads `git-only` instead of `none-declared`; the VALUE lane only until network-provisioning's
 *  next text version. */
export interface LiveEvidenceOptions { excludeContractKeys?: readonly string[]; gitOnlyWord?: boolean }

export function computeLiveEvidenceFromReadRecord(record: Obj, interfaceContract?: unknown, opts: LiveEvidenceOptions = {}): Obj {
  const base = { version: LIVE_EVIDENCE_VERSION, point: 'harvester' };
  if (record.checked !== true) {
    return { ...base, checked: false, reason: record.reason, declaration: record.declaration };
  }
  const rows = Array.isArray(record.devices) ? (record.devices as Array<{ device: string; sources: Obj[] }>) : [];
  const liveReadDevices: Obj[] = [];
  const liveNotRead: Obj[] = [];
  const gitOnly: Obj[] = [];
  const notApplicableDevices: Obj[] = [];
  for (const row of rows) {
    const sources = Array.isArray(row.sources) ? row.sources : [];
    const live = sources.find((s) => LIVE_KINDS.has(s.kind as string));
    const git = sources.find((s) => s.kind === 'git-file');
    const readOf = (s: Obj) => (s.read && typeof s.read === 'object' ? (s.read as Obj) : {});
    if (sources.some((s) => s.kind === 'command-package')) {
      notApplicableDevices.push({ device: row.device, kind: 'command-package' });
    } else if (live) {
      const r = readOf(live);
      if (r.state === 'whole-config') liveReadDevices.push({ device: row.device, kind: live.kind, toolCallIndex: r.toolCallIndex });
      else liveNotRead.push({ device: row.device, kind: live.kind, state: r.state });
    } else if (git) {
      gitOnly.push({ device: row.device, gitRead: readOf(git).state });
    } else {
      throw new Error(`liveEvidence: device row with no classifiable source (${sources.map((s) => String(s.kind)).join(',')})`);
    }
  }
  const items = rows.length;
  const liveRead = liveReadDevices.length;
  const notApplicable = notApplicableDevices.length;
  const liveDeclared = liveRead + liveNotRead.length;
  const summary = items === 0 ? 'no-items'
    : liveNotRead.length > 0 ? 'some-not-read'
      : liveDeclared === 0 ? (opts.gitOnlyWord === true && gitOnly.length > 0 && gitOnly.length + notApplicable === items ? 'git-only' : 'none-declared')
        : gitOnly.length > 0 ? 'some-git-only'
          : 'all-read';
  const cap: Obj = {};
  const contract = contractDevices(interfaceContract, new Set(rows.map((r) => String(r.device))), opts.excludeContractKeys ?? []);
  const undeclared = typeof record.undeclaredDeviceConfigReads === 'number' ? record.undeclaredDeviceConfigReads : 0;
  return {
    ...base, checked: true, declaration: record.declaration, summary,
    items, liveDeclared, liveRead, notApplicable,
    liveNotRead: capped(liveNotRead, 'liveNotRead', cap),
    gitOnly: capped(gitOnly, 'gitOnly', cap),
    liveReadDevices: capped(liveReadDevices, 'liveReadDevices', cap),
    notApplicableDevices: capped(notApplicableDevices, 'notApplicableDevices', cap),
    ...(undeclared > 0 ? { undeclaredDeviceConfigReads: undeclared } : {}),
    ...(Array.isArray(record.unresolvedServices) ? { unresolvedServices: record.unresolvedServices } : {}),
    contractDevices: contract.contractDevices,
    ...(contract.notDeclared ? { contractNotDeclared: capped(contract.notDeclared, 'contractNotDeclared', cap) } : {}),
    ...(Object.keys(cap).length ? { capped: cap } : {}),
  };
}

/**
 * THE LAB LEVER'S SIGNATURE (model-evaluation L-CS-a): the governing Device-sources resolution + the Harvester's toolCalls (the
 * result.json shape; a non-array reads as []) + the owning leg's stored interface contract (contract-devices fold, 2026-11-05: THREE
 * parameters — the lab's loader pins the arity, so a lab that does not pass the contract is refused, never silently `no-contract`). Pure, unconditional — the version gate is the enrichment's.
 */
export function computeLiveEvidence(sources: LegDeviceSourcesResolution, toolCalls: unknown, interfaceContract?: unknown, opts: LiveEvidenceOptions = {}): Obj {
  return computeLiveEvidenceFromReadRecord(computeDeviceSourceReads(sources, toolCalls), interfaceContract, opts);
}

// §6 render: client-safe module (no server imports) — re-exported for callers and tests.
export { renderLiveEvidenceForPrompt, listTotal, LIVE_EVIDENCE_RENDER_NAME, LIVE_EVIDENCE_SCOPE_CLAUSE, CONTRACT_NOT_DECLARED_LABEL } from './live-evidence-render';
