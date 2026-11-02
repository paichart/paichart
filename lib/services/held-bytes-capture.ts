/**
 * PLATFORM-HELD-BYTES — the shadow capture helper (Stage A WI-4, 2026-10-14). Two halves, both NEVER THROW:
 *
 *   prepareHeldCapture  PURE, synchronous. Runs right after the execution's duration is taken and BEFORE anything else
 *                       reads the loop's records (owner decision OA-8 as amended; panel AE S3 / D5) — so a later net that
 *                       mutated a shared record could not change what is held. Extracts the declared files, applies the
 *                       caps and the text checks, runs R10's plain arm and hashes B (canonical-text.ts). Its output
 *                       (HeldCapturePlan) holds strings, numbers and booleans only — nothing aliases a loop record.
 *   captureHeldFiles    I/O. Runs as late as possible, just before the terminal persist: one SELECT for the owning
 *                       leg/root (the SHARED owning-leg predicate — panel arch S4), one autocommit blob upsert, then a
 *                       per-row validator and a batch guard so the terminal transaction is only ever handed rows it can
 *                       insert (owner decision OA-19 layers 1–2; the savepoint in the transaction is layer 3).
 *
 * SHADOW: nothing here changes what any agent sees, and with the switch off (HELD_BYTES_CAPTURE_ENABLED absent or not
 * exactly 'true') both halves do nothing at all. LOGGING is content-free: counts, refusal names, durations, and
 * name/code/metaCode of an error — never a body, a path from a refused file, a hash, or an error message (panel SF-3).
 *
 * Plan: cline_docs/reviews/platform-held-bytes-2026-10-13/STAGE-A-PLAN.md WI-4 / §3 / §5.
 */
import { Prisma } from '@prisma/client';
import { extractDeclaredFiles, withDeviceEvidenceOnly, type ExtractedFile, type ExtractedRefusal } from '@/lib/agents/harness/held-bytes/extract';
import type { DeviceReadScope } from '@/lib/agents/harness/held-bytes/device-read-scope';
import {
  checkLegacyText,
  canonicalBase,
  DECODE_VERSION,
  HASH_BASIS_LEGACY,
} from '@/lib/agents/harness/held-bytes/canonical-text';
import { isR10Disabled, collectR10EchoSources } from '@/lib/agents/harness/redact-artifact-secrets';
import { HELD_FILE_CAP, HELD_EXECUTION_CAP, HELD_EXECUTION_FILE_CAP } from '@/lib/agents/harness/held-bytes/caps';
import { owningLegPredicate } from '@/lib/agents/harness/program-protocol';
import { heldPathRefusal } from '@/lib/mcp/server/config/git-file-source-pin';
import {
  upsertHeldBlobs,
  validateHeldRow,
  errorFacts,
  heldBlobKey,
  type HeldCapturePlan,
  type HeldCaptureBatch,
  type HeldFileRefRow,
  type HeldCaptureRefusalRow,
  type PlannedHeldFile,
  type PlannedRefusal,
} from './held-bytes-store';

export interface HeldCaptureLogger {
  warn: (obj: Record<string, unknown>, msg: string) => void;
  info?: (obj: Record<string, unknown>, msg: string) => void;
}

/** The kill switch (owner decision OA-9): opt-in, exactly 'true'. */
export function isHeldCaptureEnabled(): boolean {
  return process.env.HELD_BYTES_CAPTURE_ENABLED === 'true';
}

type Source = Pick<ExtractedRefusal, 'serviceName' | 'serviceId' | 'identitySource' | 'sourceTool' | 'toolCallIndex'
  | 'declaredBy' | 'descriptorVersion' | 'declarationSha256' | 'eligibility' | 'grantPovId'> & { selector: string | null; target: string | null; path: string | null };

function refusalFrom(src: Source, scope: string | null, refusal: string, detail?: Record<string, string | number>): PlannedRefusal {
  return {
    scope, serviceId: src.serviceId, serviceName: src.serviceName, identitySource: src.identitySource,
    sourceTool: src.sourceTool, toolCallIndex: src.toolCallIndex, selector: src.selector, target: src.target, path: src.path,
    refusal, ...(detail ? { detail } : {}), declaredBy: src.declaredBy, descriptorVersion: src.descriptorVersion, declarationSha256: src.declarationSha256 ?? null, eligibility: src.eligibility ?? null, grantPovId: src.grantPovId ?? null,
  };
}

const FILE_LEVEL = new Set(['raw-digest-present', 'descriptor-mismatch', 'path-invalid', 'source-not-pinned',
  // held-network step 3 batch 2b (P3/P4): per-device refusals on the device-read lane (file level: one per host)
  'device-not-declared', 'device-config-empty',
  // push 2: P8 (a Git file that is not a declared line) and the one-base-per-device rule (a device read kept as evidence)
  'git-file-not-declared', 'device-read-evidence-only']);

/**
 * held-k8s G-5 (SYNTHESIS v3, sec-ops S1a): a held file must never contain a credential, and R10 misses plaintext Kubernetes
 * Secret values (measured 2026-10-18: `db-password` in both `stringData` and base64 `data`). So a file holding a `kind: Secret`
 * document with a top-level `data:` or `stringData:` map is REFUSED (`secret-manifest`) and its bytes are never stored.
 * SealedSecret / ExternalSecret are holdable (no plaintext). Line-anchored, per `---` document; a YAML flow form slips this
 * pre-filter (accepted limit — R10 still runs on everything that IS held).
 */
export function isPlaintextSecretManifest(text: string): boolean {
  for (const doc of text.split(/^---[ \t]*$/m)) {
    if (/^kind:[ \t]*["']?Secret["']?[ \t]*(#.*)?$/m.test(doc) && /^(data|stringData):/m.test(doc)) return true;
  }
  return false;
}

/**
 * held-terraform T-3 / T-4: the PATH refusals (`state-file`, `tfvars-file`, `credentials-file` — TF-PATH-RULE-GAPS) are the pin module's ONE function — the call gate refuses
 * the read, capture refuses to hold (defence in depth, every descriptor). Re-exported for this module's callers and tests.
 */
export { heldPathRefusal };

/**
 * sec-ops step-1 SF-2 (content half): Terraform STATE or PLAN JSON under ANY name (`state.json`, `plan.out.json`) — a
 * `"terraform_version":` key AND one of the state/plan keys (`"lineage"` state · `"prior_state"` / `"planned_values"` /
 * `"resource_changes"` `terraform show -json` plan). No `.tf` / HCL file carries that JSON key (`required_version` differs). ⇒ `state-file`.
 */
export function isTerraformStateOrPlanJson(text: string): boolean {
  return /"terraform_version"\s*:/.test(text) && /"(lineage|prior_state|planned_values|resource_changes)"\s*:/.test(text);
}

/** PURE half. Returns null when the switch is off, there is no record, or no call is a declared file lane. */
export function prepareHeldCapture(args: {
  toolCallResults: readonly unknown[] | null | undefined;
  task: { id: string; povId: string | null };
  logger: HeldCaptureLogger;
  /** held-k8s 1b-scope: the owning leg may read a Git file source (OwningLegResolution.gitFileSource). Absent ⇒ false. */
  gitFileSourceLeg?: boolean;
  /** WI-B10: the ONE table from the async pre-step (held-descriptor-table.ts); absent ⇒ the platform defaults. */
  heldTable?: { table: readonly import('@/lib/agents/harness/held-bytes/descriptors').Descriptor[]; unavailableShas: ReadonlySet<string>; invalidShas: ReadonlySet<string>; stats: Record<string, number> } | null;
  /** WI-B10: LIVE capture reads each record's call-time eligibility stamp; a stored-record replay passes false (legacy). */
  live?: boolean;
  /** R10-V8-RESIDUALS (a): the execution's deliverable, part of the persist's echo source (with every tool record). */
  echoSourceText?: string | null;
  /** held-network step 3 batch 2b (P3/P4): the device-read scope — present ⇔ the owning leg declares Device sources (built by
   *  device-read-scope.ts from the leg's declaration + these records). Absent ⇒ no device-read lane (every non-network capture). */
  deviceRead?: DeviceReadScope | null;
}): HeldCapturePlan | null {
  if (!isHeldCaptureEnabled()) return null;
  const t0 = Date.now();
  try {
    const records = args.toolCallResults;
    if (!Array.isArray(records) || records.length === 0) return null;
    // held-network step 3 push 2 (owner Phase-0 §4b): ONE held base per device — a device whose declared Git file is held here
    // keeps its device read as evidence only (withDeviceEvidenceOnly; a no-op off a Device-sources leg).
    const ex = withDeviceEvidenceOnly(extractDeclaredFiles(records, args.heldTable?.table ?? undefined, {
      gitFileSourceLeg: args.gitFileSourceLeg === true, live: args.live === true,
      unavailableShas: args.heldTable?.unavailableShas, invalidShas: args.heldTable?.invalidShas,
      ...(args.deviceRead ? { deviceRead: args.deviceRead } : {}),
    }), args.deviceRead);
    // held-network step 3 batch 2b: device-lane context counts — a journal fact only when non-zero (no other capture's lines move).
    if (ex.stats.notAConfigRead + ex.stats.deviceLaneFailed > 0) {
      args.logger.info?.({ stats: { notAConfigRead: ex.stats.notAConfigRead, deviceLaneFailed: ex.stats.deviceLaneFailed } },
        'held-bytes: device-read lane context counts');
    }
    // P3 fail-closed: a device config NOT held because the leg's declaration is missing / unparseable / conflicting / unread is
    // logged by refusal NAME and count (content-free: never a device, host, line or service string).
    const declRefusals = ex.refusals.filter((r) => r.refusal.startsWith('device-sources-') || r.refusal === 'device-service-not-declared');
    if (declRefusals.length > 0) {
      const byName: Record<string, number> = {};
      for (const r of declRefusals) byName[r.refusal] = (byName[r.refusal] ?? 0) + 1;
      args.logger.info?.({ taskId: args.task.id, deviceReadRefusals: byName },
        'held-bytes: device configuration read on a Device-sources leg NOT held — the leg declares no matching device-read source (fail closed)');
    }
    // WI-B10: the eligibility / registrant counters are journal facts (field names and tool names only — never values).
    const { foreignRowNotHeld, unstampedDefaultCall, registrantUndeclared } = ex.stats;
    if (foreignRowNotHeld + unstampedDefaultCall + registrantUndeclared + (args.heldTable?.stats?.descriptorLookupFailed ?? 0) > 0) {
      args.logger.info?.({ stats: { foreignRowNotHeld, unstampedDefaultCall, registrantUndeclared, descriptorLookupFailed: args.heldTable?.stats?.descriptorLookupFailed ?? 0 },
        registrantUndeclaredTools: ex.registrantUndeclaredTools }, 'held-bytes: WI-B10 eligibility / registrant counts');
    }
    if (unstampedDefaultCall > 0) {
      // §10 A-8 (sec-ops build SF-1): 0 by construction — every live services call is stamped at the call handler. A non-zero
      // means a call path stopped stamping and its files were NOT held (fail closed). Loud, so the regression is seen.
      args.logger.warn({ taskId: args.task.id, unstampedDefaultCall }, 'held-bytes: successful services call(s) carried no held-eligibility stamp — NOT held (fail closed); a call path is not stamping');
    }
    if (ex.stats.pinViolationsOnSuccess > 0) {
      // A Git file-source call that the CALL-TIME gate did not stop broke the pin at capture (e.g. a served URI that disagrees
      // with the request). An integrity signal on a security boundary — the call-time gate logs its own refusals, so a
      // violation on an errored call is counted only (SYNTHESIS v3 note 23). Field names only, never values.
      args.logger.warn({ securityEvent: true, taskId: args.task.id, pinViolations: ex.stats.pinViolationsOnSuccess },
        'held-bytes: Git file-source pin violated on a completed call — file not held (source-not-pinned)');
    }
    if (ex.files.length === 0 && ex.refusals.length === 0) {
      // Nothing to hold — but the context counters must still be VISIBLE (code review arch S1): an agent's tool-name slip
      // (undeclaredFailed), a failed call named by registry id (failedUnmatched) and unidentified calls are journal facts.
      const { unidentified, undeclaredFailed, failedUnmatched, outOfScopeLane, notAFileRead } = ex.stats;
      if (unidentified + undeclaredFailed + failedUnmatched + outOfScopeLane + notAFileRead > 0) {
        args.logger.info?.({ stats: { unidentified, undeclaredFailed, failedUnmatched, outOfScopeLane, notAFileRead } }, 'held-bytes: context counts (nothing held)');
      }
      return null;
    }
    const scope = args.task.povId ?? null;
    const stats: Record<string, number> = {
      servicesCalls: ex.stats.servicesCalls, declaredCalls: ex.stats.declaredCalls,
      unidentified: ex.stats.unidentified, undeclaredFailed: ex.stats.undeclaredFailed, failedUnmatched: ex.stats.failedUnmatched,
      // held-k8s: present only when non-zero, so an observability capture's stats line is unchanged.
      ...(ex.stats.outOfScopeLane ? { outOfScopeLane: ex.stats.outOfScopeLane } : {}),
      ...(ex.stats.notAFileRead ? { notAFileRead: ex.stats.notAFileRead } : {}),
      ...(ex.stats.pinViolations ? { pinViolations: ex.stats.pinViolations } : {}),
      // WI-B10: present only when non-zero, so an existing capture's stats line is unchanged.
      ...(ex.stats.foreignRowNotHeld ? { foreignRowNotHeld: ex.stats.foreignRowNotHeld } : {}),
      ...(ex.stats.unstampedDefaultCall ? { unstampedDefaultCall: ex.stats.unstampedDefaultCall } : {}),
      ...(ex.stats.registrantUndeclared ? { registrantUndeclared: ex.stats.registrantUndeclared } : {}),
      ...(args.heldTable?.stats?.descriptorLookupFailed ? { descriptorLookupFailed: args.heldTable.stats.descriptorLookupFailed } : {}),
    };
    const callLevel = ex.refusals.filter((r) => !FILE_LEVEL.has(r.refusal));
    // File-level items in tool-call order (held candidates and file-level refusals both count toward the file cap).
    type Item = { kind: 'file'; f: ExtractedFile } | { kind: 'refusal'; r: ExtractedRefusal };
    const items: Item[] = [
      ...ex.files.map((f) => ({ kind: 'file' as const, f })),
      ...ex.refusals.filter((r) => FILE_LEVEL.has(r.refusal)).map((r) => ({ kind: 'refusal' as const, r })),
    ];
    const idx = (it: Item) => (it.kind === 'file' ? it.f.toolCallIndex : it.r.toolCallIndex);
    items.sort((a, b) => idx(a) - idx(b)); // stable: within a call, held candidates first

    const refusals: PlannedRefusal[] = [];
    const files: PlannedHeldFile[] = [];

    // no-scope precedes every other refusal (§5 order): a POV-less task is refused by that name — ONE row per declared
    // call carrying its file count, never one per file (code review AE SF-1 / arch S2: the count cap must bound this
    // branch too — thousands of rows in the terminal transaction would meet Prisma's 5 s timeout, which no savepoint
    // rescues).
    if (scope === null) {
      const perCall = new Map<number, { src: Source; files: number }>();
      for (const r of callLevel) perCall.set(r.toolCallIndex, { src: r, files: perCall.get(r.toolCallIndex)?.files ?? 0 });
      for (const it of items) {
        const src: Source = it.kind === 'file' ? it.f : it.r;
        const e = perCall.get(src.toolCallIndex);
        if (e) e.files++;
        else perCall.set(src.toolCallIndex, { src, files: 1 });
      }
      for (const { src, files: n } of perCall.values()) {
        refusals.push(refusalFrom({ ...src, selector: null, target: null, path: null }, null, 'no-scope', n > 0 ? { files: n } : undefined));
      }
      return { scope, files, refusals, stats: { ...stats, refused: refusals.length, durationMs: Date.now() - t0 } };
    }
    for (const r of callLevel) refusals.push(refusalFrom(r, scope, r.refusal, r.detail));

    // File-count cap (OA-23): past it, ONE over-cap row per call.
    const overCountByCall = new Map<number, { src: Source; files: number }>();
    let seen = 0;
    let executionBytes = 0;
    const redact = !isR10Disabled();
    // R10-V8-RESIDUALS (a): the persist's echo source (every tool record + the deliverable), computed once, lazily — only when a
    // file reaches canonicalBase. In memory only (the values ARE secrets).
    let echoTokens: Set<string> | null = null;
    const echoSources = (): Set<string> => (echoTokens ??= collectR10EchoSources(records, args.echoSourceText ?? null));
    for (const it of items) {
      seen++;
      const src: Source = it.kind === 'file' ? it.f : it.r;
      if (seen > HELD_EXECUTION_FILE_CAP) {
        const e = overCountByCall.get(src.toolCallIndex);
        if (e) e.files++;
        else overCountByCall.set(src.toolCallIndex, { src: { ...src, selector: null, target: null, path: null }, files: 1 });
        continue;
      }
      if (it.kind === 'refusal') { refusals.push(refusalFrom(it.r, scope, it.r.refusal, it.r.detail)); continue; }
      const f = it.f;
      const C = f.text;
      const byPath = heldPathRefusal(f.path); // held-terraform T-3/T-4: before every text check (a state file may be huge)
      if (byPath) { refusals.push(refusalFrom(f, scope, byPath)); continue; }
      if (isTerraformStateOrPlanJson(C)) { refusals.push(refusalFrom(f, scope, 'state-file')); continue; } // SF-2 content half
      if (isPlaintextSecretManifest(C)) { refusals.push(refusalFrom(f, scope, 'secret-manifest')); continue; }
      const rawBytes = Buffer.byteLength(C, 'utf8');
      if (rawBytes > HELD_FILE_CAP) { refusals.push(refusalFrom(f, scope, 'over-cap', { capScope: 'file', bytes: rawBytes })); continue; }
      const legacy = checkLegacyText(C);
      if (legacy) { refusals.push(refusalFrom(f, scope, legacy)); continue; }
      const base = canonicalBase(C, { redact, echoTokens: redact ? echoSources() : undefined });
      if (!base.ok) { refusals.push(refusalFrom(f, scope, base.refusal)); continue; }
      const bBytes = Buffer.byteLength(base.B, 'utf8');
      if (bBytes > HELD_FILE_CAP) { refusals.push(refusalFrom(f, scope, 'over-cap', { capScope: 'file', bytes: bBytes })); continue; }
      if (executionBytes + bBytes > HELD_EXECUTION_CAP) {
        executionBytes = HELD_EXECUTION_CAP + 1; // the file that crosses the cap and every later file
        refusals.push(refusalFrom(f, scope, 'over-cap', { capScope: 'execution', bytes: bBytes }));
        continue;
      }
      // A ref needs the gateway's id; without it the file is dropped and counted (context — MI-13 🔴 10 names it as a
      // cause). Checked BEFORE the byte budget so a dropped file never spends it (code review AE N-4 / arch N2).
      if (f.serviceId === null) { stats.noServiceId = (stats.noServiceId ?? 0) + 1; continue; }
      executionBytes += bBytes;
      files.push({
        sha256: base.baseHash, content: base.B, storedByteLength: bBytes,
        serviceId: f.serviceId, serviceName: f.serviceName, sourceTool: f.sourceTool, toolCallIndex: f.toolCallIndex,
        selector: f.selector, target: f.target, path: f.path, declaredBy: f.declaredBy, descriptorVersion: f.descriptorVersion, declarationSha256: f.declarationSha256 ?? null, eligibility: f.eligibility ?? null, grantPovId: f.grantPovId ?? null,
        hashBasis: HASH_BASIS_LEGACY, decodeVersion: DECODE_VERSION, redactorVersion: base.redactorVersion,
        redactedCount: base.redactedCount, lineCount: base.lineCount, placeholderPreexistingCount: base.preexistingPlaceholders,
        sourceRevision: f.sourceRevision,
      });
    }
    for (const { src, files: n } of overCountByCall.values()) {
      refusals.push(refusalFrom(src, scope, 'over-cap', { capScope: 'count', files: n }));
    }
    return {
      scope, files, refusals,
      stats: { ...stats, held: files.length, refused: refusals.length, heldBytes: executionBytes > HELD_EXECUTION_CAP ? -1 : executionBytes, durationMs: Date.now() - t0 },
    };
  } catch (err) {
    args.logger.warn({ ...errorFacts(err), durationMs: Date.now() - t0 }, 'held-bytes: prepareHeldCapture failed — nothing captured');
    return null;
  }
}

type HeldDb = {
  $queryRaw: <T = unknown>(query: Prisma.Sql) => Promise<T>;
  $executeRaw: (query: Prisma.Sql) => Promise<number>;
};

/** The owning leg and its program root, via the SHARED owning-leg predicate. Null on a miss, ambiguity or error. */
async function resolveLegAndRoot(db: HeldDb, taskId: string): Promise<{ legTaskId: string | null; rootTaskId: string | null }> {
  try {
    const rows = await db.$queryRaw<Array<{ legTaskId: string; rootTaskId: string | null }>>(Prisma.sql`
      SELECT leg.id AS "legTaskId", root.id AS "rootTaskId"
        FROM tasks h
        JOIN tasks leg ON ${owningLegPredicate(Prisma.sql`h.stage_id`, 'leg')}
        LEFT JOIN tasks root ON ${owningLegPredicate(Prisma.sql`leg.stage_id`, 'root')}
       WHERE h.id = ${taskId}`);
    if (!Array.isArray(rows) || rows.length !== 1) return { legTaskId: null, rootTaskId: null };
    return { legTaskId: rows[0].legTaskId ?? null, rootTaskId: rows[0].rootTaskId ?? null };
  } catch {
    return { legTaskId: null, rootTaskId: null };
  }
}

/** The batch guard's predicate (exported for its own test): every ref names a blob the upsert wrote. */
export function refsAllWritten(refs: readonly HeldFileRefRow[], written: ReadonlySet<string>): boolean {
  return refs.every((r) => written.has(heldBlobKey(r.scope, r.blobSha256)));
}

/** I/O half. Returns null when the plan is null (no work); otherwise a batch the terminal transaction can insert. */
export async function captureHeldFiles(db: HeldDb, args: {
  executionId: string;
  taskId: string;
  plan: HeldCapturePlan | null;
  logger: HeldCaptureLogger;
}): Promise<HeldCaptureBatch | null> {
  const plan = args.plan;
  if (!plan) return null;
  const t0 = Date.now();
  const { executionId } = args;
  try {
    const stats: Record<string, number> = { ...plan.stats };
    let refusals: HeldCaptureRefusalRow[] = plan.refusals.map((r) => ({ ...r, executionId }));
    let refs: HeldFileRefRow[] = [];
    let written = new Set<string>();
    if (plan.files.length > 0 && plan.scope !== null) {
      const scope = plan.scope;
      const { legTaskId, rootTaskId } = await resolveLegAndRoot(db, args.taskId);
      const up = await upsertHeldBlobs(db, plan.files.map((f) => ({ scope, sha256: f.sha256, content: f.content, storedByteLength: f.storedByteLength })));
      if (!up.ok) {
        args.logger.warn({ executionId, ...up.fault, files: plan.files.length }, 'held-bytes: blob upsert failed — files refused store-error');
        refusals = refusals.concat(plan.files.map((f) => ({
          executionId, scope, serviceId: f.serviceId, serviceName: f.serviceName, identitySource: 'envelope',
          sourceTool: f.sourceTool, toolCallIndex: f.toolCallIndex, selector: f.selector, target: f.target, path: f.path,
          refusal: 'store-error', detail: { class: 'db' }, declaredBy: f.declaredBy, descriptorVersion: f.descriptorVersion, declarationSha256: f.declarationSha256 ?? null, eligibility: f.eligibility ?? null, grantPovId: f.grantPovId ?? null,
        })));
      } else {
        written = up.written;
        refs = plan.files.map((f) => ({
          scope, blobSha256: f.sha256, executionId, kind: 'CAPTURE', legTaskId, rootTaskId,
          serviceId: f.serviceId, serviceName: f.serviceName, sourceTool: f.sourceTool, toolCallIndex: f.toolCallIndex,
          selector: f.selector, target: f.target, path: f.path, declaredBy: f.declaredBy, descriptorVersion: f.descriptorVersion, declarationSha256: f.declarationSha256 ?? null, eligibility: f.eligibility ?? null, grantPovId: f.grantPovId ?? null,
          hashBasis: f.hashBasis, decodeVersion: f.decodeVersion, redactorVersion: f.redactorVersion,
          redactedCount: f.redactedCount, lineCount: f.lineCount, newline: null, bom: null, finalNewline: null,
          serviceReportsComplete: null, derivedRawByteLength: null, placeholderPreexistingCount: f.placeholderPreexistingCount,
          sourceRevision: f.sourceRevision,
        }));
      }
    }
    // Layer 1: per-row validation — drop and count, never null a required column.
    const refsOk = refs.filter((r) => validateHeldRow('ref', r));
    const refusalsOk = refusals.filter((r) => validateHeldRow('refusal', r));
    const invalid = (refs.length - refsOk.length) + (refusals.length - refusalsOk.length);
    if (invalid > 0) {
      stats.invalidRows = invalid;
      args.logger.warn({ executionId, invalidRows: invalid }, 'held-bytes: rows failed validation and were dropped');
    }
    // Layer 2: the batch guard — every ref must point at a blob THIS upsert wrote; any doubt drops the whole batch.
    if (!refsAllWritten(refsOk, written)) {
      args.logger.warn({ executionId, refs: refsOk.length }, 'held-bytes: batch guard dropped the whole batch');
      return { refs: [], refusals: [], stats: { ...stats, batchDropped: 1 } };
    }
    stats.ioDurationMs = Date.now() - t0;
    args.logger.info?.({ executionId, held: refsOk.length, refused: refusalsOk.length, durationMs: stats.ioDurationMs, stats }, 'held-bytes: capture batch ready');
    return { refs: refsOk, refusals: refusalsOk, stats };
  } catch (err) {
    args.logger.warn({ executionId, ...errorFacts(err) }, 'held-bytes: captureHeldFiles failed — nothing captured');
    return { refs: [], refusals: [], stats: { error: 1 } };
  }
}
