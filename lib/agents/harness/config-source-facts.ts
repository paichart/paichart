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
import { assertNeverConfigKind } from './config-sources';
import { endpointResolvedServices, gitArgsMatch, serviceCalls, serviceMatcher, shownService } from './device-source-facts';

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
    case 'snapshot-absent': case 'snapshot-unreadable': case 'snapshot-changed': return { state: sources.state, grammarVersion: sources.grammarVersion };
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
