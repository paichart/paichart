/**
 * Config sources STEP 2 (2026-11-15; DESIGN §1.4 "Drift effect/fact split", sec-ops Layer-1 conditions C1–C3, C8) — the PLATFORM's
 * own calls of the cluster service's compare tool, decided here and made through an INJECTED caller.
 *
 * This module decides WHICH calls are made and with WHAT, and turns each outcome into one `PlatformDriftCall` record. It never
 * touches the hub: the caller (execution-core) supplies `call`, which goes through the full `services.call` pipeline as the run owner.
 * So everything here is testable without a service, and the lab / replay pass a caller that never calls.
 *
 * RULES:
 *   - Only on a PARSED Config-sources declaration. Any other state makes NO call and returns no record (the fact then reads
 *     `no-platform-call-record`; the leg is forced by the carrier anyway).
 *   - One call per declared `git-file` line whose file is HELD in this capture (C3: a file that is not held is never sent). The
 *     manifest is the held bytes exactly as stored — the R10-REDACTED text (C1: never raw) — and the marker is the R10 placeholder (C2).
 *   - The service is the block's ONE `live-read` line's service. None ⇒ `no-live-read-source` (a Git-only run). More than one ⇒
 *     `more-than-one-live-read-source` (which cluster a file belongs to is not declared). A descriptor URL resolves to the row this
 *     execution registered from it, else `live-read-service-unresolved`.
 *   - At most `maxCalls` calls per leg (C8); the rest are `per-leg-call-cap`. No retry. The caller owns the timeout.
 *   - NEVER THROWS: a caller that throws is `call-failed`.
 */
import { createHash } from 'crypto';
import type { LegConfigSourcesResolution } from './config-sources-read';
import { declaredGitFiles, isDescriptorUrlService } from './config-sources';
import { configPinRefusesRef } from './held-bytes/config-source-scope';
import { isFileOfGitLine, registrationsByDescriptorUrl } from './held-bytes/device-read-scope';
import { validateCompareResult, COMPARE_TOOL_METHOD, DRIFT_PATHS_SHOWN_CAP, type DriftNotChecked, type PlatformDriftCall, type ValidatedObject } from './git-live-drift';

export const PLATFORM_DRIFT_MAX_CALLS_PER_LEG = 20;
/** sec-ops slice-3b F3: the WHOLE leg's comparisons share one wall-clock budget — the calls run before the Harvester's persist. */
export const PLATFORM_DRIFT_LEG_BUDGET_MS = 120_000;
export const PLATFORM_DRIFT_MAX_CONSECUTIVE_FAILURES = 2;

/**
 * sec-ops slice-3b F1: what is STORED of a result is the VALIDATED PROJECTION — the fields the validator kept, at most
 * DRIFT_PATHS_SHOWN_CAP differing paths per call (every total kept) — plus the raw result's size and sha. Never the raw result:
 * `detail`, unknown keys and anything that failed a grammar never reach result.json, so no reader of it (an agent's verbose
 * `agent.results` included) can meet them, and twenty honest results cannot outgrow the artifact. The projection has the tool's own
 * shape, so the fact re-validates it on every read with the SAME validator.
 */
function projectionOf(objects: readonly ValidatedObject[], manifestSha256: string): unknown {
  let left = DRIFT_PATHS_SHOWN_CAP;
  return {
    method: COMPARE_TOOL_METHOD, manifestSha256,
    objects: objects.map((o) => {
      if (o.state !== 'compared') return { kind: o.kind, namespace: o.namespace, name: o.name, state: o.state, ...(o.reason ? { reason: o.reason } : {}) };
      const shown = (o.differing ?? []).slice(0, left);
      left -= shown.length;
      return { kind: o.kind, namespace: o.namespace, name: o.name, state: 'compared', declaredPaths: o.declaredPaths, differingTotal: o.differingTotal,
        differing: shown, redactedNotComparedTotal: o.redactedNotComparedTotal };
    }),
  };
}
function sizeAndSha(raw: unknown): { resultBytes: number; resultSha256: string } | Record<string, never> {
  try { const t = JSON.stringify(raw) ?? ''; return { resultBytes: Buffer.byteLength(t, 'utf8'), resultSha256: createHash('sha256').update(t, 'utf8').digest('hex') }; }
  catch { return {}; }
}

/** What the injected caller reports. `result` is the tool's result object as the service returned it (validated later, on read). */
export type DriftCallOutcome =
  | { kind: 'result'; result: unknown }
  | { kind: 'no-compare-tool' }   // the service's registered tools do not include the compare tool
  | { kind: 'refused' }           // the hub refused (policy, eligibility, rate limit)
  | { kind: 'foreign-service' }   // the service row is not the run owner's (the hub refuses to SEND held bytes to it)
  | { kind: 'tool-refused' }      // the service returned an error result
  | { kind: 'failed' };           // a throw, a timeout, an unreadable envelope
export type DriftCaller = (args: { targetService: string; manifest: string; redactedMarker: string }) => Promise<DriftCallOutcome>;

export interface HeldFileForDrift { target: string; path: string; content: string; sha256: string }

const OUTCOME_REASON: Record<Exclude<DriftCallOutcome['kind'], 'result'>, DriftNotChecked> = {
  'no-compare-tool': 'service-declares-no-compare-tool', refused: 'call-refused', 'foreign-service': 'service-not-owned', 'tool-refused': 'tool-refused', failed: 'call-failed',
};

export async function runPlatformDriftCalls(input: {
  sources: LegConfigSourcesResolution;
  /** The files THIS capture holds (the plan's files: redacted stored text + its hash). */
  heldFiles: readonly HeldFileForDrift[];
  /** The execution's tool-call records (to resolve a descriptor-URL service to the row this run registered). */
  toolCalls: readonly unknown[];
  redactedMarker: string;
  call: DriftCaller;
  maxCalls?: number;
  /** The compare tool's manifest limit in UTF-8 bytes (the hub refuses above it WITH a security event — so no call is made). */
  maxManifestBytes?: number;
  /** A reason that stops EVERY call before it is made (e.g. `redaction-off`, F4): each held file gets it, nothing is sent. */
  blocked?: DriftNotChecked | null;
  /** Total wall-clock budget for the leg's calls (F3); `now` is injectable for the tests. */
  legBudgetMs?: number;
  now?: () => number;
}): Promise<PlatformDriftCall[] | null> {
  const { sources } = input;
  if (sources.state !== 'parsed') return null;
  const gitLines = declaredGitFiles(sources);
  if (gitLines.length === 0) return [];
  const live = sources.entries.filter((e) => e.kind === 'live-read');
  let service: string | null = null;
  let blocked: DriftNotChecked | null = null;
  if (live.length === 0) blocked = 'no-live-read-source';
  else if (live.length > 1) blocked = 'more-than-one-live-read-source';
  else {
    const declared = live[0].kind === 'live-read' ? live[0].service : '';
    if (!isDescriptorUrlService(declared)) service = declared;
    else {
      const rows = registrationsByDescriptorUrl(input.toolCalls).get(declared) ?? [];
      const names = [...new Set(rows.map((r) => r.serviceName).filter((n): n is string => !!n))];
      if (names.length === 1) service = names[0];
      else blocked = 'live-read-service-unresolved';
    }
  }
  if (input.blocked) blocked = input.blocked;
  const max = input.maxCalls ?? PLATFORM_DRIFT_MAX_CALLS_PER_LEG;
  const now = input.now ?? Date.now;
  const deadline = now() + (input.legBudgetMs ?? PLATFORM_DRIFT_LEG_BUDGET_MS);
  const out: PlatformDriftCall[] = [];
  let made = 0;
  // F3 early stop: a refusal that will repeat for every file (the service has no compare tool, the hub refuses the call, the row is
  // not the owner's) is asked ONCE; two failures in a row stop the rest. The remaining files get the SAME named outcome, uncalled.
  let stopWith: DriftNotChecked | null = null;
  let failuresInARow = 0;
  for (const line of gitLines) {
    const head = { label: line.label, path: line.path };
    const held = configPinRefusesRef(line) ? undefined : input.heldFiles.find((f) => isFileOfGitLine(f, line));
    if (!held) { out.push({ ...head, outcome: 'file-not-held' }); continue; }
    if (blocked || !service) { out.push({ ...head, outcome: blocked ?? 'live-read-service-unresolved' }); continue; }
    if (input.maxManifestBytes !== undefined && Buffer.byteLength(held.content, 'utf8') > input.maxManifestBytes) { out.push({ ...head, outcome: 'manifest-too-large', service }); continue; }
    if (stopWith) { out.push({ ...head, outcome: stopWith, service }); continue; }
    if (made >= max) { out.push({ ...head, outcome: 'per-leg-call-cap', service }); continue; }
    if (now() >= deadline) { out.push({ ...head, outcome: 'leg-time-budget', service }); continue; }
    made++;
    // C1: the sha of the bytes SENT. It must equal the held base hash; if it ever does not, the record says so by carrying the sent
    // sha (the validator then refuses the result as `sha-mismatch` only if the SERVICE answered for other bytes).
    const manifestSha256 = createHash('sha256').update(Buffer.from(held.content, 'utf8')).digest('hex');
    const sent = { service, manifestSha256, manifestLength: Buffer.byteLength(held.content, 'utf8'),
      ...(manifestSha256 !== held.sha256 ? { heldSha256: held.sha256 } : {}) };
    const t0 = Date.now();
    let outcome: DriftCallOutcome;
    try { outcome = await input.call({ targetService: service, manifest: held.content, redactedMarker: input.redactedMarker }); }
    catch { outcome = { kind: 'failed' }; }
    const durationMs = Date.now() - t0;
    if (outcome.kind === 'result') {
      failuresInARow = 0;
      const v = validateCompareResult(outcome.result, manifestSha256);
      const about = sizeAndSha(outcome.result);
      if (v.ok) out.push({ ...head, outcome: 'called', ...sent, durationMs, ...about, result: projectionOf(v.objects, manifestSha256) });
      else out.push({ ...head, outcome: v.reason, ...sent, durationMs, ...about }); // `result-shape` / `sha-mismatch`: nothing of the result is kept
      continue;
    }
    const reason = OUTCOME_REASON[outcome.kind];
    out.push({ ...head, outcome: reason, ...sent, durationMs });
    if (outcome.kind === 'no-compare-tool' || outcome.kind === 'refused' || outcome.kind === 'foreign-service') stopWith = reason;
    failuresInARow = outcome.kind === 'failed' ? failuresInARow + 1 : 0;
    if (failuresInARow >= PLATFORM_DRIFT_MAX_CONSECUTIVE_FAILURES) stopWith = 'call-failed';
  }
  return out;
}
