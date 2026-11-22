/**
 * Config sources STEP 2 (2026-11-15) — the Harvester facts on a Config-sources leg (kubernetes-gitops from 1.19.0), PURE.
 *
 *   configSourceReads   "for each source line the leg declares, which call read it?" Per declared line: `git-file` → the read call
 *                       (tool-call index) or `read-failed` / `not-read`; `live-read` → `read` with the number of successful calls
 *                       to the declared service, or `read-failed` / `result-truncated` / `not-read`; `supplied` → no read applies.
 *                       Plus the declaration (or why there is none) and how many Git files the leg read that NO line declares
 *                       (never held — config-source-scope.ts).
 *   liveEvidence        the Config arm (`lane: 'config'`): was the live system read, or is this a Git-only run? Computed FROM the
 *                       read record above, never a second reading of the tool calls.
 *
 * Both read the execution's OWN tool calls as result.json carries them, through the SHIPPING call reader and the SHIPPING extractor
 * (the same definition of "a Git file read" capture uses). Facts, never verdicts: indices, states, counts. An OPERATOR fact
 * (`configSourceReads`) and an agent-rendered fact (`liveEvidence`); neither is a gate input.
 */
import { extractDeclaredFiles } from './held-bytes/extract';
import { PLATFORM_DEFAULT_DESCRIPTORS } from './held-bytes/descriptors';
import { withConfigSourcesScope } from './held-bytes/config-source-scope';
import type { LegConfigSourcesResolution } from './config-sources-read';
import { assertNeverConfigKind, CONFIG_SOURCES_GRAMMAR_VERSION } from './config-sources';
import { endpointResolvedServices, gitArgsMatch, serviceCalls, serviceMatcher, shownService } from './device-source-facts';
import { validFileCompareRecord, FILE_RETURNED_KEYS_CAP } from './git-live-drift';
import { quotableLine } from './file-compare-quote-seam';

export const CONFIG_SOURCE_READS_VERSION = 1;
export const CONFIG_LIVE_EVIDENCE_VERSION = 1;
export const CONFIG_LIVE_EVIDENCE_NAME_CAP = 20;

type Obj = Record<string, unknown>;

function declarationOf(sources: LegConfigSourcesResolution): Obj {
  switch (sources.state) {
    case 'parsed': return { state: 'parsed', source: sources.source, grammarVersion: sources.grammarVersion, lines: sources.entries.length };
    case 'unparseable': return { state: 'unparseable', source: sources.source, grammarVersion: sources.grammarVersion, problem: sources.problem, lineIndex: sources.lineIndex };
    case 'conflict': return { state: 'conflict', grammarVersion: sources.grammarVersion };
    case 'absent': return { state: 'absent', grammarVersion: sources.grammarVersion };
    case 'could-not-check': return { state: 'could-not-check', grammarVersion: sources.grammarVersion, reason: sources.reason };
    case 'snapshot-absent': case 'snapshot-unreadable': case 'snapshot-changed': case 'snapshot-text-reverted':
      return { state: sources.state, grammarVersion: sources.grammarVersion };
    default: return { state: 'not-config-source-leg' };
  }
}

/** configSourceReads. `sources` is never `not-config-source-leg` here (the enrichment returns NOT_STAMPED first). */
export function computeConfigSourceReads(sources: LegConfigSourcesResolution, toolCalls: unknown): Obj {
  const declaration = declarationOf(sources);
  if (sources.state !== 'parsed') {
    return { version: CONFIG_SOURCE_READS_VERSION, checked: false, reason: `config-sources-${sources.state}`, declaration };
  }
  const records = Array.isArray(toolCalls) ? toolCalls : [];
  const calls = serviceCalls(records);
  const matches = serviceMatcher(records);
  const items: Obj[] = [];
  let notRead = 0;
  for (const e of sources.entries) {
    switch (e.kind) {
      case 'supplied': items.push({ label: e.label, kind: 'supplied' }); break;
      case 'git-file': {
        const mine = calls.filter((c) => matches(e.service, c) && gitArgsMatch(e, c.args));
        const okCall = mine.find((c) => c.ok);
        const read: Obj = okCall ? { state: 'read', toolCallIndex: okCall.index, ...(okCall.truncated ? { resultTruncated: true } : {}) }
          : mine.length ? { state: 'read-failed', toolCallIndex: mine[0].index } : { state: 'not-read' };
        if (read.state === 'not-read') notRead++;
        items.push({ label: e.label, kind: 'git-file', service: shownService(e.service), path: e.path, ref: e.ref, read });
        break;
      }
      case 'live-read': {
        // A live read is ANY successful call to the declared service (the service is the cluster's read-only surface; which objects
        // the leg needs is the leg's objective, not the declaration's). Counts, never a judgement of coverage.
        const mine = calls.filter((c) => matches(e.service, c));
        const ok = mine.filter((c) => c.ok);
        const read: Obj = ok.length ? { state: 'read', calls: ok.length, ...(ok.some((c) => c.truncated) ? { truncatedCalls: ok.filter((c) => c.truncated).length } : {}) }
          : mine.some((c) => c.truncated) ? { state: 'result-truncated', toolCallIndex: mine.find((c) => c.truncated)!.index }
            : mine.length ? { state: 'read-failed', toolCallIndex: mine[0].index, failedCalls: mine.length } : { state: 'not-read' };
        if (read.state === 'not-read') notRead++;
        items.push({ label: e.label, kind: 'live-read', service: shownService(e.service), read });
        break;
      }
      case 'service-held':
        // A `service-held` line belongs to a protocol whose labels name FILES, and that protocol's read record is built from the
        // stored compare record (`computeFileConfigSourceReads`, below) — never here: "a call to the service succeeded" is not "the
        // file was returned" (plan W9, §13 B3). Every production caller routes on `protocolDeclaresServiceFiles` first, so this arm
        // is unreachable; it throws rather than answer (STEP 3 P5: until now it computed a call-count record nothing could reach,
        // under a comment promising slice P3 would replace it). The registry turns a throw into the net's named error fact.
        throw new Error('configSourceReads: a service-held line reached the call-based read record — its protocol reads the compare record');
      default: return assertNeverConfigKind(e);
    }
  }
  // Git files the leg read through a file lane that NO line declares — the count capture refused to hold (one definition: the
  // shipping extractor with the Config scope applied).
  const scoped = withConfigSourcesScope(extractDeclaredFiles(records, PLATFORM_DEFAULT_DESCRIPTORS, { gitFileSourceLeg: true, live: false }), sources);
  const undeclaredGitFileReads = scoped.refusals.filter((r) => r.refusal === 'git-file-not-declared').length;
  // DESCRIPTOR-REGISTRATION-ROUTE: which declared descriptor URLs were tied to a hand registration by endpoint (absent when none).
  const byEndpoint = endpointResolvedServices(records, sources.entries.flatMap((e) => ('service' in e ? [e.service] : [])));
  return { version: CONFIG_SOURCE_READS_VERSION, checked: true, declaration, items, notRead, undeclaredGitFileReads,
    ...(byEndpoint.length ? { resolvedByEndpoint: byEndpoint } : {}) };
}

// ── Config sources STEP 3 P3 — a protocol whose labels name FILES (observability): the read record comes from the compare record ──

/** A capture outcome ⇒ the read state of its declared line. The file WAS returned whenever capture has an item for it — held, kept
 *  as evidence, or refused by name — and the RECORD says so itself (`returned: true`, written by exactly those branches of the
 *  builder): that is `read`. The "no file" outcomes and the whole-record outcomes are this table. An outcome that is neither —
 *  a word this reader does not know, with no `returned` — is `unknown-outcome`, NEVER `read` (architectural F5: fail-closed; it
 *  lands in `liveNotRead`). So "read" cannot mean "some call to the service succeeded" (plan W9, §13 B3). */
const NO_FILE_STATES: Readonly<Record<string, string>> = Object.freeze({
  'not-read': 'not-read', 'read-failed': 'read-failed', 'not-returned': 'answered-key-not-returned', 'result-not-readable': 'result-not-readable',
  'no-capture-plan': 'no-capture-plan', 'compare-error': 'compare-error', 'label-not-resolved': 'label-not-resolved',
  // STEP 3 P5 (join preconditions 16, 17): the file is NOT read from the declared service, and the record says which condition —
  // a file at this name came back from a call the declared service is not tied to; the declared service answered under a
  // registered name the platform's file table is not keyed on. Neither is `not-read` (a call was made), neither is `read`.
  'file-from-other-service': 'file-from-other-service', 'registered-under-other-name': 'registered-under-other-name',
});

/**
 * configSourceReads for a protocol whose labels name files — from the STORED compare record's `capture` list (what capture did for
 * every declared line), re-validated here. `record` absent or not valid ⇒ `checked:false, reason:'no-compare-record'`: it NEVER
 * falls back to a reading of the tool calls. A declaration that is not `parsed` is named, as for every protocol.
 */
export function computeFileConfigSourceReads(sources: LegConfigSourcesResolution, record: unknown): Obj {
  const declaration = declarationOf(sources);
  if (sources.state !== 'parsed') return { version: CONFIG_SOURCE_READS_VERSION, checked: false, reason: `config-sources-${sources.state}`, declaration, unit: 'files' };
  return fileConfigSourceReadsOf(declaration, record);
}

/**
 * The files read record of a PARSED declaration, from the compare record — the body of `computeFileConfigSourceReads`, taking the
 * `declaration` object itself. STEP 3 P5 (whole-diff review F9): the rolled-back overlay (file-source-compare-run.ts) re-computes
 * a Harvester's `configSourceReads` from the record AS PERSISTED with the declaration object its stamp already carries, so the
 * stamp never says `held` for a file the store did not take — and a replay of that Harvester (which reads the persisted record)
 * reproduces the stamp.
 */
export function fileConfigSourceReadsOf(declaration: Obj, record: unknown): Obj {
  const rec = validFileCompareRecord(record, quotableLine);
  if (!rec) return { version: CONFIG_SOURCE_READS_VERSION, checked: false, reason: 'no-compare-record', declaration, unit: 'files' };
  const returned = rec.returnedKeys as Record<string, string[]>;
  let notRead = 0;
  const items = (rec.capture as Obj[]).map((c) => {
    const head = { label: c.label, kind: c.kind, ...(c.service !== undefined ? { service: c.service } : {}), ...(c.target !== undefined ? { target: c.target, path: c.path } : {}) };
    if (c.kind === 'supplied') return head;
    const outcome = String(c.outcome);
    const state = NO_FILE_STATES[outcome] ?? (c.returned === true ? 'read' : 'unknown-outcome');
    if (state === 'not-read') notRead++;
    return { ...head, read: { state, outcome, ...(c.toolCallIndex !== undefined ? { toolCallIndex: c.toolCallIndex } : {}),
      ...(state === 'answered-key-not-returned' && typeof c.target === 'string' ? { returnedKeys: (returned[c.target] ?? []).slice(0, FILE_RETURNED_KEYS_CAP) } : {}) } };
  });
  // The declared descriptor URLs no registration of the execution was tied to (the record's list, re-validated above) — the
  // network read record's `unresolvedServices`, absent when none.
  return { version: CONFIG_SOURCE_READS_VERSION, checked: true, declaration, unit: 'files', credentialLineVersion: rec.credentialLineVersion, harvesterExecutionId: rec.harvesterExecutionId, items, notRead,
    ...(Array.isArray(rec.unresolvedServices) ? { unresolvedServices: rec.unresolvedServices } : {}) };
}

/**
 * THE NO-BLOCK ARM (plan §3.2, §13 A6) — a leg of a `runs-undeclared` protocol that declares nothing and ran on the service's files.
 * A pure function the ENRICHMENT calls; it is NOT inside `computeConfigSourceReads` and NOT in the context memo, so the
 * `liveEvidence` Config arm can never be handed it.
 *
 * ⚠️ `checked:false, reason:'config-sources-absent', declaration.state:'absent'` are ALSO the words of a Kubernetes or Terraform leg
 * whose block is absent — and THAT leg is forced. The same declaration state keeps the same word; what followed is said by ONE key:
 * `undeclared` is present ⇔ the leg's protocol is `runs-undeclared` and the leg ran on the service's files. NO TALLY MAY KEY ON THE
 * REASON STRING ALONE — MI-13 splits on the PRESENCE of `undeclared`.
 *
 * `files` / `refusals` come from the `heldBytes` digest capture already made — never a re-extraction. No digest ⇒ `capture: 'off'`
 * (the switch) or `'no-digest'` — never `files: 0`, which would read as "called nothing".
 */
export function undeclaredConfigSourceReads(heldBytes: unknown): Obj {
  const d = heldBytes && typeof heldBytes === 'object' && !Array.isArray(heldBytes) ? (heldBytes as Obj) : null;
  const refused = d && d.refused && typeof d.refused === 'object' && !Array.isArray(d.refused) ? (d.refused as Obj) : null;
  const undeclared: Obj = d === null ? { heldFrom: 'service', capture: 'no-digest' }
    : d.reason === 'capture-off' ? { heldFrom: 'service', capture: 'off' }
      : typeof d.held === 'number' && refused
        ? { heldFrom: 'service', files: d.held, refusals: Object.values(refused).reduce((n: number, v) => n + (typeof v === 'number' ? v : 0), 0) }
        : { heldFrom: 'service', capture: 'no-digest' };
  return { version: CONFIG_SOURCE_READS_VERSION, checked: false, reason: 'config-sources-absent',
    declaration: { state: 'absent', grammarVersion: CONFIG_SOURCES_GRAMMAR_VERSION }, undeclared };
}

/**
 * liveEvidence, Config arm, for a protocol whose labels name FILES (`unit: 'files'`). Its items are FILES (labels), and each lands in
 * EXACTLY ONE bucket (the bucket-sum pin asserts it):
 *   liveReadItems     a Git base with a `live-read` line whose served file capture has (read)
 *   serviceHeldItems  a `service-held` base whose file capture has (read)
 *   liveNotRead[]     either of those whose file capture does NOT have — the record's state verbatim (`not-read`, `read-failed`,
 *                     `answered-key-not-returned` with the keys the service did return, …)
 *   gitOnlyFiles[]    a Git base with NO `live-read` line — the same set as the comparison's `no-live-read-line` (pinned)
 * SUMMARY, from the counts and nothing else, in this precedence: `no-items` · `some-not-read` · `all-git-only` (EVERY file is a Git
 * base with no live read — a statement about the configuration FILES only) · `some-git-only` · `all-read`. The word `git-only` of
 * the other Config-sources protocols is never used here: a file kept from the service is not a Git-only file.
 */
export function computeFileLiveEvidenceFromReadRecord(record: Obj): Obj {
  const base = { version: CONFIG_LIVE_EVIDENCE_VERSION, lane: 'config', unit: 'files', point: 'harvester' };
  if (record.checked !== true) return { ...base, checked: false, reason: record.reason, declaration: record.declaration };
  const rows = Array.isArray(record.items) ? (record.items as Obj[]) : [];
  const byLabel = new Map<string, { base: Obj | null; live: Obj | null }>();
  for (const row of rows) {
    const g = byLabel.get(String(row.label)) ?? { base: null, live: null };
    if (row.kind === 'live-read') g.live = row; else if (row.kind === 'git-file' || row.kind === 'service-held') g.base = row;
    else throw new Error(`liveEvidence (config files): a declared line with no classifiable kind (${String(row.kind)})`);
    byLabel.set(String(row.label), g);
  }
  const liveReadItems: Obj[] = []; const serviceHeldItems: Obj[] = []; const liveNotRead: Obj[] = []; const gitOnlyFiles: string[] = [];
  let gitFileLines = 0; let serviceHeld = 0; let liveDeclared = 0;
  const readOf = (r: Obj) => (r.read && typeof r.read === 'object' ? (r.read as Obj) : {});
  const notReadOf = (label: string, r: Obj): Obj => { const rd = readOf(r); return { label, kind: r.kind, state: rd.state, ...(Array.isArray(rd.returnedKeys) ? { returnedKeys: rd.returnedKeys } : {}) }; };
  for (const [label, g] of byLabel) {
    if (!g.base) throw new Error('liveEvidence (config files): a live-read line with no base line');
    if (g.base.kind === 'service-held') {
      serviceHeld++;
      if (readOf(g.base).state === 'read') serviceHeldItems.push({ label }); else liveNotRead.push(notReadOf(label, g.base));
      continue;
    }
    gitFileLines++;
    if (!g.live) { gitOnlyFiles.push(label); continue; }
    liveDeclared++;
    if (readOf(g.live).state === 'read') liveReadItems.push({ label }); else liveNotRead.push(notReadOf(label, g.live));
  }
  const items = byLabel.size;
  const summary = items === 0 ? 'no-items'
    : liveNotRead.length > 0 ? 'some-not-read'
      : gitOnlyFiles.length === items ? 'all-git-only'
        : gitOnlyFiles.length > 0 ? 'some-git-only'
          : 'all-read';
  const cap: Obj = {};
  return {
    ...base, checked: true, declaration: record.declaration,
    ...(typeof record.credentialLineVersion === 'string' ? { credentialLineVersion: record.credentialLineVersion } : {}),
    summary,
    items, gitFileLines, serviceHeld, liveDeclared, liveRead: liveReadItems.length, serviceHeldRead: serviceHeldItems.length,
    liveNotRead: capped(liveNotRead, 'liveNotRead', cap),
    liveReadItems: capped(liveReadItems, 'liveReadItems', cap),
    serviceHeldItems: capped(serviceHeldItems, 'serviceHeldItems', cap),
    gitOnlyFiles: capped(gitOnlyFiles, 'gitOnlyFiles', cap),
    ...(Object.keys(cap).length ? { capped: cap } : {}),
  };
}

/** Whitespace runs to one space; the Markdown emphasis marks (`*`, `_`, a backtick) dropped. A character loop — the Author's text is
 *  model output, so no pattern runs over it. The ONLY normalisation the Git-only statement check makes. */
export function normaliseForSentence(text: string): string {
  let out = ''; let space = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d || c === 0xa0) { space = out.length > 0; continue; }
    if (c === 0x2a || c === 0x5f || c === 0x60) continue;
    if (space) { out += ' '; space = false; }
    out += text[i];
  }
  return out;
}

/**
 * Owner decision 2a — a FACT, no force: did the Author's package state, for each file the fact lists as Git-only, the protocol's
 * fixed sentence? `sentence` is the protocol text's own constant with one `{label}` slot (git-only-statement-sentence.ts — the
 * WORDS are prompt-construction's); null ⇒ no sentence is registered for the composed version, and the check says so by name.
 * The sentence is searched once per listed label after `normaliseForSentence` on both sides, and nothing else.
 */
export function computeGitOnlyStatement(packageText: string | null | undefined, labels: readonly string[], sentence: string | null): Obj {
  const listed = labels.length;
  if (sentence === null || !sentence.includes('{label}')) return { listed, checked: false, reason: 'no-sentence-for-version' };
  const hay = normaliseForSentence(packageText ?? '');
  const missing = labels.filter((l) => !hay.includes(normaliseForSentence(sentence.split('{label}').join(l))));
  return { listed, checked: true, stated: listed - missing.length, missing: missing.slice(0, CONFIG_LIVE_EVIDENCE_NAME_CAP), ...(missing.length > CONFIG_LIVE_EVIDENCE_NAME_CAP ? { missingTotal: missing.length } : {}) };
}

function capped<T>(list: T[], name: string, cap: Obj): T[] {
  if (list.length <= CONFIG_LIVE_EVIDENCE_NAME_CAP) return list;
  cap[name] = list.length;
  return list.slice(0, CONFIG_LIVE_EVIDENCE_NAME_CAP);
}

/**
 * liveEvidence, Config arm — from an already-computed read record. Every declared line lands in EXACTLY ONE bucket:
 *   liveReadItems   `live-read`, the record says `read`
 *   liveNotRead[]   `live-read`, the record says anything else (state verbatim)
 *   gitFiles[]      `git-file` (with the Git read's record state)
 *   suppliedItems   `supplied` (no read applies)
 * SUMMARY, from the counts and nothing else, in this precedence: `no-items` · `some-not-read` · `git-only` (no `live-read` line and at
 * least one `git-file` line — a Git-only run, stated) · `none-declared` (no `live-read` and no `git-file` line: every line `supplied`)
 * · `all-read`. A NON-PARSED declaration is passed through by name: `checked:false, reason: config-sources-<state>`.
 */
export function computeConfigLiveEvidenceFromReadRecord(record: Obj): Obj {
  // STEP 3 P3: a read record of a protocol whose labels name FILES has its own buckets and words (below this arm THROWS on a
  // `service-held` row by design — it has no bucket for one).
  if (record.unit === 'files') return computeFileLiveEvidenceFromReadRecord(record);
  const base = { version: CONFIG_LIVE_EVIDENCE_VERSION, lane: 'config', point: 'harvester' };
  if (record.checked !== true) return { ...base, checked: false, reason: record.reason, declaration: record.declaration };
  const rows = Array.isArray(record.items) ? (record.items as Obj[]) : [];
  const liveReadItems: Obj[] = []; const liveNotRead: Obj[] = []; const gitFiles: Obj[] = []; const suppliedItems: Obj[] = [];
  for (const row of rows) {
    const read = row.read && typeof row.read === 'object' ? (row.read as Obj) : {};
    if (row.kind === 'live-read') {
      if (read.state === 'read') liveReadItems.push({ label: row.label, calls: read.calls });
      else liveNotRead.push({ label: row.label, state: read.state });
    } else if (row.kind === 'git-file') gitFiles.push({ label: row.label, gitRead: read.state });
    else if (row.kind === 'supplied') suppliedItems.push({ label: row.label });
    else throw new Error(`liveEvidence (config): a declared line with no classifiable kind (${String(row.kind)})`);
  }
  const items = rows.length;
  const liveRead = liveReadItems.length;
  const liveDeclared = liveRead + liveNotRead.length;
  const summary = items === 0 ? 'no-items'
    : liveNotRead.length > 0 ? 'some-not-read'
      : liveDeclared === 0 ? (gitFiles.length > 0 ? 'git-only' : 'none-declared')
        : 'all-read';
  const cap: Obj = {};
  const undeclared = typeof record.undeclaredGitFileReads === 'number' ? record.undeclaredGitFileReads : 0;
  return {
    ...base, checked: true, declaration: record.declaration, summary,
    items, liveDeclared, liveRead, gitFileLines: gitFiles.length, supplied: suppliedItems.length,
    liveNotRead: capped(liveNotRead, 'liveNotRead', cap),
    liveReadItems: capped(liveReadItems, 'liveReadItems', cap),
    gitFiles: capped(gitFiles, 'gitFiles', cap),
    suppliedItems: capped(suppliedItems, 'suppliedItems', cap),
    ...(undeclared > 0 ? { undeclaredGitFileReads: undeclared } : {}),
    ...(Object.keys(cap).length ? { capped: cap } : {}),
  };
}

/** THE LAB LEVER'S SIGNATURE: the governing Config-sources resolution + the Harvester's toolCalls. Pure, unconditional — the
 *  version gate is the enrichment's. */
export function computeConfigLiveEvidence(sources: LegConfigSourcesResolution, toolCalls: unknown): Obj {
  return computeConfigLiveEvidenceFromReadRecord(computeConfigSourceReads(sources, toolCalls));
}
