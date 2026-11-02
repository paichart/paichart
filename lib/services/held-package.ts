/**
 * PLATFORM-HELD-BYTES Stage B V-5d — `prepareHeldPackage`: the I/O half of a variant Author's package, PRE-transaction (plan
 * STAGE-B-PLAN.md v4.1 §3 V-5d, §3.2; §0.1 A2, A3). Runs BEFORE `stampExecutionNets`, so the nets transcribe its outcome;
 * NEVER throws; touches nothing an agent reads and does not move `executionTime` (CTF-SEAM-6).
 *
 *   1. BASE touch-and-verify — one ordered statement (`touchHeldBases`); a base the GC took since the step read it is
 *      `base-not-held` for that FILE, and the application is RE-COMPUTED (pure) with that file in that state.
 *   2. CANDIDATE blobs — upserted (autocommit) ONLY when the package state is `applied`; a write failure ⇒ `unheld`.
 *   3. Rows per §3.2 — BASE for every verified base (id minted here, call provenance NULL, encoding copied from its CAPTURE,
 *      `fromRefId` = the CAPTURE); CANDIDATE for every applied file (`hashBasis: 'platform-candidate-text'`, `decodeVersion:
 *      'none'`, counts on the candidate, newline/bom/finalNewline the base's, `fromRefId` = its BASE, NULL for a create).
 *      Each row passes `validateHeldRow`; ANY failure ⇒ the package is `unheld` and no row is written.
 * The rows ride to `runTerminalSuccessTx`, which writes them under SAVEPOINT held_package (V-5e).
 */
import { computeEditApplication, type EditApplication, type HeldFileInput } from '@/lib/agents/harness/held-bytes/apply';
import { countLines, countPlaceholders } from '@/lib/agents/harness/held-bytes/canonical-text';
import { CANDIDATE_HASH_BASIS, heldBlobKey, newHeldRefId, touchHeldBases, upsertHeldBlobs, validateHeldRow, type HeldPackageRefRow } from '@/lib/services/held-bytes-store';
import type { EditStepResult, ResolvedHeldRef } from '@/lib/services/held-edit-step';
import { HELD_FILE_CAP, HELD_EXECUTION_CAP } from '@/lib/agents/harness/held-bytes/caps';

export interface PreparedHeldPackage {
  /** The application after the pre-tx checks (re-computed when a base went missing; state `unheld` on a write failure). */
  application: EditApplication;
  rows: HeldPackageRefRow[];
  baseRefIdByHandle: Record<string, string>;
  candidateRefIdByHandle: Record<string, string>;
  baseShaByHandle: Record<string, string>;
  /** The step's verified refs, for the Author manifest. */
  refs: ResolvedHeldRef[];
}

type Db = Parameters<typeof touchHeldBases>[0];

const unheld = (app: EditApplication): EditApplication => ({ ...app, state: 'unheld', candidateFiles: 0 });

export async function prepareHeldPackage(db: Db, input: {
  executionId: string;
  step: EditStepResult;
  r9Version: string;
  legTaskId: string | null;
  rootTaskId: string | null;
  /** R10-V8-RESIDUALS (b) / sec-ops batch-1 SF-1: the same tool-record echo sources the step applied with, for the recompute on a
   *  missing base (in memory only, never stamped). */
  persistEchoTokens?: ReadonlySet<string>;
}): Promise<PreparedHeldPackage> {
  const { step } = input;
  const empty = { rows: [], baseRefIdByHandle: {}, candidateRefIdByHandle: {}, baseShaByHandle: {}, refs: step.refs };
  if (step.refs.length === 0) return { application: step.application, ...empty };
  try {
    // 1. BASE touch-and-verify (per-file set difference).
    const touch = await touchHeldBases(db, step.refs.map((r) => ({ scope: r.scope, sha256: r.blobSha256 })));
    if (!touch.ok) return { application: unheld(step.application), ...empty };
    let application = step.application;
    if (touch.missing.size > 0) {
      const gone = new Set(step.refs.filter((r) => touch.missing.has(heldBlobKey(r.scope, r.blobSha256))).map((r) => r.handle));
      const files: HeldFileInput[] = step.files.map((f) => (gone.has(f.handle) ? { handle: f.handle, path: f.path, state: 'base-not-held' } : f));
      application = computeEditApplication(step.text, { files, r9Version: input.r9Version, persistEchoTokens: input.persistEchoTokens });
      return { application, ...empty };
    }
    // 3a. BASE rows.
    const rows: HeldPackageRefRow[] = []; const baseRefIdByHandle: Record<string, string> = {}; const baseShaByHandle: Record<string, string> = {};
    const baseRowByHandle: Record<string, HeldPackageRefRow> = {};
    for (const r of step.refs) {
      const c = r.row as Record<string, any>;
      const row: HeldPackageRefRow = {
        id: newHeldRefId(), scope: r.scope, blobSha256: r.blobSha256, executionId: input.executionId, kind: 'BASE',
        legTaskId: input.legTaskId, rootTaskId: input.rootTaskId, serviceId: c.serviceId, serviceName: c.serviceName,
        sourceTool: null, toolCallIndex: null, selector: null, target: c.target, path: c.path, declaredBy: null, descriptorVersion: null, declarationSha256: null, eligibility: null, grantPovId: null,
        hashBasis: c.hashBasis, decodeVersion: c.decodeVersion, redactorVersion: c.redactorVersion, redactedCount: c.redactedCount,
        lineCount: c.lineCount, newline: c.newline ?? null, bom: c.bom ?? null, finalNewline: c.finalNewline ?? null,
        serviceReportsComplete: c.serviceReportsComplete ?? null, derivedRawByteLength: c.derivedRawByteLength ?? null,
        placeholderPreexistingCount: c.placeholderPreexistingCount,
        // K-3 (DB SF-1): inherited from the CAPTURE, read via HELD_REF_SELECT; the CANDIDATE spread below carries it on.
        sourceRevision: typeof c.sourceRevision === 'string' ? c.sourceRevision : null,
        fromRefId: r.refId,
      };
      rows.push(row); baseRefIdByHandle[r.handle] = row.id; baseShaByHandle[r.handle] = r.blobSha256; baseRowByHandle[r.handle] = row;
    }
    // 2 + 3b. CANDIDATE blobs and rows — only when applied.
    const candidateRefIdByHandle: Record<string, string> = {};
    if (application.state === 'applied') {
      const cands = application.files.filter((f) => f.state === 'applied' && f.candidateText !== undefined && f.candidateSha256);
      const scope = step.refs[0].scope;
      // DB-P2-3: a CANDIDATE is a held blob and takes the Stage A caps. A `count=N` edit splices its REPLACE N times (the 256 KB
      // edit cap counts it once), so a candidate can outgrow its base: over a cap ⇒ the package is `unheld`, nothing written.
      const sizes = cands.map((f) => Buffer.byteLength(f.candidateText as string, 'utf8'));
      if (sizes.some((n) => n > HELD_FILE_CAP) || sizes.reduce((a, n) => a + n, 0) > HELD_EXECUTION_CAP) return { application: unheld(application), ...empty };
      const up = await upsertHeldBlobs(db, cands.map((f) => ({ scope, sha256: f.candidateSha256 as string, content: f.candidateText as string,
        storedByteLength: Buffer.byteLength(f.candidateText as string, 'utf8') })));
      if (!up.ok) return { application: unheld(application), ...empty };
      for (const f of cands) {
        const base = baseRowByHandle[f.op === 'create' ? (f.onHandle as string) : f.handle];
        if (!base) return { application: unheld(application), ...empty };
        const cand = f.candidateText as string;
        const row: HeldPackageRefRow = {
          ...base, id: newHeldRefId(), blobSha256: f.candidateSha256 as string, kind: 'CANDIDATE',
          path: f.op === 'create' ? f.path : base.path,
          hashBasis: CANDIDATE_HASH_BASIS, decodeVersion: 'none',
          redactedCount: countPlaceholders(cand), lineCount: countLines(cand), placeholderPreexistingCount: 0,
          serviceReportsComplete: null, derivedRawByteLength: null,
          fromRefId: f.op === 'create' ? null : base.id,
        };
        rows.push(row); candidateRefIdByHandle[f.handle] = row.id;
      }
    }
    if (!rows.every((r) => validateHeldRow('ref', r))) return { application: unheld(application), ...empty };
    return { application, rows, baseRefIdByHandle, candidateRefIdByHandle, baseShaByHandle, refs: step.refs };
  } catch {
    return { application: unheld(step.application), ...empty };
  }
}
