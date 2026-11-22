/**
 * Config sources STEP 3 P3 (plan W2, §13.A A4, §13.B B4 / E5) — the execution core's ONE entry to the file comparison.
 *
 * Called ONCE by the core, SYNCHRONOUSLY, right after the held capture is planned and before the next `await` — so the served-side
 * evidence (text that is never stored) lives for exactly this call: the core holds it in one block, hands it here, and drops it.
 * Nothing here is async, nothing calls a service, and no held or served byte leaves the process: the comparison is made on two
 * texts the platform already has in memory (the `platform-compare` method — git-live-drift.ts `GIT_LIVE_DRIFT_METHODS`).
 *
 * POPULATION — `undefined` (no record, nothing stamped) unless ALL hold:
 *   - the persisting execution is a Harvester leaf;
 *   - its own composed protocol is at its released Config-sources version (`liveEvidenceVersionApplies` — the SAME test the stamps use);
 *   - the leg's governing declaration is `parsed` — never the presence of a Config-sources protocol on the resolution, and never the
 *     version alone (an execution composed at the Config-sources text can persist after that text was reverted: the leg then governs
 *     as `snapshot-text-reverted`, and nothing is compared — P2 sec-ops condition);
 *   - the leg's protocol's method row says `by: 'platform-compare'`.
 *
 * NEVER THROWS (the `prepareHeldCapture` / `runLegPlatformDrift` pattern): the builder has its own try, and so does this — a throw
 * here gives `undefined`, which every fact reads as the named state `no-compare-record`. LOGGING is content-free: counts, state
 * names and an error's class — never a label, a path, a line or a sha.
 */
import type { LegConfigSourcesResolution } from '@/lib/agents/harness/config-sources-read';
import { gitLiveDriftPlatformCompares, computeFileGitLiveDrift, FILE_COMPARE_METHOD } from '@/lib/agents/harness/git-live-drift';
import { buildFileSourceCompare, rolledBackFileSourceCompare, rolledBackEditOverlap,
  type CaptureEvidence, type Comparator, type ComparePlanView, type EditHunkFile } from '@/lib/agents/harness/file-source-compare';
import { quotableLine } from '@/lib/agents/harness/file-compare-quote-seam';
import { fileConfigSourceReadsOf } from '@/lib/agents/harness/config-source-facts';
import { isR10Disabled } from '@/lib/agents/harness/redact-artifact-secrets';

type Logger = { info?: (o: Record<string, unknown>, m: string) => void; warn: (o: Record<string, unknown>, m: string) => void };

export function runLegFileSourceCompare(input: {
  sources: LegConfigSourcesResolution | null;
  /** The owning leg's Config-sources protocol (canonical long name), or null when the leg did not resolve. */
  protocol: string | null;
  isHarvester: boolean;
  versionApplies: boolean;
  plan: ComparePlanView | null;
  evidence: CaptureEvidence | null;
  toolCalls: readonly unknown[];
  executionId: string;
  logger: Logger;
  /** Tests inject a comparator; production passes none. */
  compare?: Comparator;
}): Record<string, unknown> | undefined {
  if (!input.isHarvester || !input.versionApplies || !input.sources || input.sources.state !== 'parsed') return undefined;
  if (!gitLiveDriftPlatformCompares(input.protocol)) return undefined;
  try {
    const record = buildFileSourceCompare({
      sources: input.sources, harvesterExecutionId: input.executionId, plan: input.plan, evidence: input.evidence,
      toolCalls: input.toolCalls, redactionOff: isR10Disabled(), ...(input.compare ? { compare: input.compare } : {}),
    });
    const byState: Record<string, number> = {};
    for (const f of Array.isArray(record.files) ? (record.files as Array<Record<string, unknown>>) : []) {
      const k = f.state === 'not-checked' ? `not-checked:${String(f.reason)}` : String(f.state);
      byState[k] = (byState[k] ?? 0) + 1;
    }
    const budget = record.budget as Record<string, unknown> | undefined;
    const errored = (byState['not-checked:compare-error'] ?? 0) > 0;
    (errored ? input.logger.warn : input.logger.info ?? (() => undefined)).call(input.logger,
      { executionId: input.executionId, files: Array.isArray(record.files) ? record.files.length : 0, byState, opsUsed: budget?.opsUsed ?? null,
        errorCode: errored ? 'FILE_SOURCE_COMPARE_ERROR' : 'FILE_SOURCE_COMPARE' },
      errored ? 'file comparison failed for a Config-sources Harvester — every label reads compare-error' : 'file comparison made for a Config-sources Harvester');
    return record;
  } catch (err) {
    input.logger.warn({ executionId: input.executionId, errorName: err instanceof Error ? err.name : typeof err, errorCode: 'FILE_SOURCE_COMPARE_FAILED' },
      'file comparison could not be made — no compare record');
    return undefined;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Plan §13 A3 (second route) — what a Harvester's CAPTURE overlay adds on a ROLLED-BACK savepoint: the compare record with no
 * held base, and the `gitLiveDrift` computed from THAT record by the same pure function the net used. `{}` on a committed
 * savepoint (the stamped values stand) and on every execution with no compare record — so every other overlay is unchanged.
 */
export function harvesterCompareOverlay(resultJson: Record<string, unknown>, rolledBack: boolean): Record<string, unknown> {
  const rec = resultJson.fileSourceCompare;
  if (!rolledBack || !isObj(rec) || rec.method !== FILE_COMPARE_METHOD) return {};
  const rb = rolledBackFileSourceCompare(rec);
  const drift = resultJson.gitLiveDrift;
  // STEP 3 P5 (whole-diff review F9): the read record is a function of the SAME record, so it is re-computed from the rolled-back one
  // too — else it kept `outcome: 'held'` for a file the store did not take, beside a record and a `gitLiveDrift` that say it is not
  // held, and a replay of this Harvester (it reads the persisted record) would not reproduce the stamp. `liveEvidence` is NOT
  // rewritten: it is computed from the read STATES (`read` — the service returned the file — is unchanged by a rollback), never
  // from an outcome word; pinned equal (WRT2).
  const reads = resultJson.configSourceReads;
  return { fileSourceCompare: rb,
    ...(isObj(drift) && drift.method === FILE_COMPARE_METHOD && drift.checked === true ? { gitLiveDrift: computeFileGitLiveDrift(rb, 'parsed', quotableLine) } : {}),
    ...(isObj(reads) && reads.unit === 'files' && reads.checked === true && isObj(reads.declaration) ? { configSourceReads: fileConfigSourceReadsOf(reads.declaration, rb) } : {}) };
}

/** Plan §13 C2 — what an Author's PACKAGE overlay adds on a rolled-back package: its transcribed `gitLiveDrift` with every
 *  `editOverlap` reading `package-rolled-back`. `{}` otherwise. */
export function authorDriftOverlay(resultJson: Record<string, unknown>, rolledBack: boolean): Record<string, unknown> {
  const d = resultJson.gitLiveDrift;
  if (!rolledBack || !isObj(d) || d.method !== FILE_COMPARE_METHOD || !Array.isArray(d.files)) return {};
  return { gitLiveDrift: rolledBackEditOverlap(d) };
}

/**
 * Plan §3.4 — the held files the Author's edit step resolved, each with its capture identity, the sha of the BASE the step used
 * and the base line ranges of its applied hunks (`start` is 1-based on the view, which is line-for-line with the base). Read in the
 * core's pre-transaction held-edit step, where the applier's hunks are in memory. Never throws: null = no record of the edit.
 */
export function editHunkFilesOrNull(
  application: { files?: ReadonlyArray<{ handle: string; op: 'edit' | 'create'; state: string; hunks?: ReadonlyArray<{ start: number; searchLen: number }> }> },
  refs: ReadonlyArray<{ handle: string; blobSha256: string; row: Record<string, unknown> }>,
  baseShaByHandle: Readonly<Record<string, string>>,
): EditHunkFile[] | null {
  try {
    return refs.map((r) => {
      const fa = (application.files ?? []).find((f) => f.handle === r.handle);
      const applied = fa?.state === 'applied';
      return {
        target: String(r.row.target ?? ''), path: String(r.row.path ?? ''), baseSha256: baseShaByHandle[r.handle] ?? r.blobSha256 ?? null,
        op: fa?.op ?? 'edit', applied,
        hunks: applied ? (fa?.hunks ?? []).map((h): [number, number] => [h.start, h.start + Math.max(h.searchLen, 1) - 1]) : [],
      };
    });
  } catch { return null; }
}
