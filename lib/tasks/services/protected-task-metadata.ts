/**
 * protected-task-metadata.ts — the ONE home for platform-owned task-metadata key protection.
 * THREE classes, three semantics (WS2 Phase A 2026-08-17 + platform-run-keys panel 2026-08-19 —
 * cline_docs/reviews/platform-owned-metadata-keys-2026-08-19/SYNTHESIS.md):
 *
 *   (a) PLATFORM_STAMP_KEYS — immutable after platform write. Echo accepted, DIFFER rejected
 *       (400 / strip-warn per surface). Closes FORGE/CHANGE.
 *   (b) PLATFORM_RUN_KEYS — platform-MUTABLE run state (written by the harness via MCP
 *       task.update and by engine/completion writers). DROPPED UNCONDITIONALLY at EDITOR
 *       surfaces (drop-always, warn on STRUCTURAL differ, never throw). Closes the THIRD axis:
 *       STALE-CLOBBER — the POV editor round-trips every task's load-time metadata snapshot, so
 *       any key whose value changed since form-load would be silently reverted by a save (the
 *       verified live case: a stale pipelineStageId breaks the retrigger reactor's lookup and
 *       the pipeline hangs with no error). Echo-equality CANNOT rescue a throw here: these
 *       values legitimately change mid-run, so a differing inbound is the signature of an
 *       INNOCENT stale snapshot, not a user error (PhasesSection auto-saves without the user
 *       even pressing Save).
 *   (c) AUDIT_STRIP_KEYS — guard-written audit facts, stripped on ALL client surfaces INCLUDING
 *       MCP (a client-writable audit fact is a spoofable claim). Different from (b): the MCP
 *       path must KEEP writing run keys while NEVER writing audit facts.
 *
 * The three ERASE/FORGE/STALE axes:
 *   - ERASE is closed by MERGE SEMANTICS (assembleUpdateData C5 / the MCP handler's merge /
 *     put.ts read-merge) — omission means "don't touch".
 *   - FORGE/CHANGE is closed by enforceProtocolStampImmutable (stamp keys).
 *   - STALE-CLOBBER is closed by dropPlatformRunKeys (run keys, editor surfaces only).
 *
 * ⚠️ SURFACE MAP (normative): dropPlatformRunKeys is wired at the FIVE editor seams ONLY —
 * assembleUpdateData (web funnel), put.ts update + both create branches, taskBulkService. It must
 * NEVER be added to the MCP task.update handler, MCP task.complete, the completion core, or any
 * engine writer: the harness writes qualityGate/pipelineStageId/etc THROUGH the MCP path — a
 * "consistency" edit adding the drop there breaks every pipeline (mutation-pinned in
 * scripts/test-platform-run-keys.ts P4).
 *
 * EXCLUDED from PLATFORM_RUN_KEYS, deliberately (each would break a legitimate writer):
 *   - duplicateAcknowledged — HUMAN operator clearance (MCP/description today; a future GUI
 *     clearance affordance must be a TARGETED endpoint like /api/agents/configure, never the
 *     wholesale save). Revisit-trigger: if the protocol's clearance stage-binding rule loosens.
 *   - modelParameters, mcpConfiguration — editor-OWNED (the wholesale save exists to carry them).
 *   - workflowResult — written by workflowEngine THROUGH the web funnel (an automation caller on
 *     an editor-classified surface); listing it would erase the workflow engine's own output.
 *   - protocol/protocolResolvedAt — the stronger stamp guard (folding them here would lose the
 *     forge observable).
 *
 * CONSEQUENCES documented (panel D6): after this ships, a corrupted run key cannot be repaired
 * from any GUI/REST surface — MCP task.update (or a script) is the repair channel, by design.
 * NON-GOALS: automation-surface staleness (an MCP client re-sending old metadata is the platform
 * channel, Phase A settled); platform-side key DELETION undone by automation resends; the
 * editor's DISPLAY of run state going stale mid-run (a UI refresh concern, not a write hazard).
 * Stage metadata needs NO arm: the POV PUT stage-update branch writes only
 * name/description/status/order (verified put.ts:899-908) — harnessTaskId is not exposed.
 *
 * `task.metadata.protocol` + `protocolResolvedAt` are platform-written routing facts (resolved
 * once from the title token at the execution chokepoint, `prepare-task-for-execution.ts`).
 * Client task paths must not forge, change, OR erase them:
 *
 *   - ERASE is closed by MERGE SEMANTICS (assembleUpdateData C5 / the MCP handler's merge /
 *     put.ts read-merge) — omission means "don't touch", so no guard can or needs to see it.
 *   - FORGE/CHANGE is closed HERE: an inbound value that DIFFERS from the stored one (including
 *     a novel value on an unstamped task, and `null` over a stamp — clearing is a platform
 *     re-resolution, not a client op) is rejected. An EQUAL echo is accepted silently and the
 *     key is dropped from the incoming object so the merge preserves the stored copy untouched
 *     — the POV editor legitimately round-trips whole task entities and must not 400 on save.
 *
 * ONE shared function called at every surface, deliberately NOT per-site copies: the four-site
 * `completedWithDependencyOverride` strip pattern already shipped one ordering bug (the bulk
 * wave-3 incident). Loudness per surface: schema-guarded surfaces THROW
 * (`ProtocolStampImmutableError`, 400, code `PROTOCOL_STAMP_IMMUTABLE`); the POV bulk-save
 * surface STRIPS-WITH-WARN under the SAME error code (Steve-approved F5 exception — its callers
 * cannot reasonably omit fields they never set; the shared code keeps the greps unified).
 *
 * PLATFORM CHANNELS ARE EXEMPT BY CONSTRUCTION, not by allowlist: the stamp writer
 * (`prepareTaskForExecution`, Postgres-side jsonb merge) and the engine's terminal writers do
 * not cross the client update surfaces this guard sits on.
 */

import { ProtocolStampImmutableError } from '@/lib/errors';

export const PLATFORM_STAMP_KEYS = ['protocol', 'protocolResolvedAt'] as const;

export interface StampGuardOptions {
  /** Surface label for logs/errors (e.g. 'web-funnel', 'mcp-task-update', 'pov-bulk-save'). */
  surface: string;
  /** 'throw' = clean 400 (schema-guarded surfaces); 'strip-warn' = POV bulk exception (F5). */
  onViolation: 'throw' | 'strip-warn';
  /** Warn sink for the strip-warn mode and the echo debug line. */
  warn?: (fields: Record<string, unknown>, message: string) => void;
}

/**
 * Enforce stamp immutability on an inbound metadata object. MUTATES `incoming`: platform stamp
 * keys are always removed from it (echo or violation), so downstream merge/replace logic never
 * sees them — the stored values survive by omission under merge, and by the caller re-applying
 * `existing` under any residual replace path.
 *
 * @returns the list of keys that were VIOLATIONS (empty on clean/echo input).
 */
export function enforceProtocolStampImmutable(
  incoming: Record<string, unknown>,
  existing: Record<string, unknown> | null | undefined,
  taskId: string,
  opts: StampGuardOptions
): string[] {
  const existingMeta = existing ?? {};
  const violations: string[] = [];

  for (const key of PLATFORM_STAMP_KEYS) {
    if (!(key in incoming)) continue;
    const inboundValue = incoming[key];
    const storedValue = key in existingMeta ? existingMeta[key] : undefined;
    const isEcho = key in existingMeta && inboundValue === storedValue;

    // Always remove the key from the incoming object — echo or not, the stored value governs.
    delete incoming[key];

    if (isEcho) continue; // legitimate round-trip: silent no-op.

    violations.push(key);
    if (opts.onViolation === 'throw') {
      throw new ProtocolStampImmutableError(taskId, key, {
        surface: opts.surface,
        inboundValue,
        storedValue: storedValue ?? '(unstamped)',
      });
    }
    opts.warn?.(
      { taskId, key, surface: opts.surface, errorCode: 'PROTOCOL_STAMP_IMMUTABLE' },
      `Stripped inbound platform stamp key "${key}" (differing value) from ${opts.surface} metadata — the stamp is platform-written`
    );
  }
  return violations;
}

/**
 * Platform-run keys: platform-MUTABLE run state. Written by the harness LLM via MCP task.update
 * (qualityGate, pipelineStageId, duplicateHalt, cannotRun, deliverableSourceTaskId,
 * suppressDefaultReportMd, programReleasable — protocol-prescribed stamps) and by
 * engine/completion writers (truncationStall + cannotRunPersistedAt: execution-terminal-persist;
 * blockedByUpstreamFailure{failedDependencyTaskId nested}: mark-forward-cone — the agent bail
 * contract ALSO stamps failedDependencyTaskId TOP-LEVEL, so both forms are listed;
 * programConfidence family: complete-task-terminally F10; confidenceScore + completionSummary:
 * MCP task.complete buildUpdateData; requiresInterfaceContract: task-create-handler CC7;
 * mcpStorageVersion/mcpStorageLocation: agent-configure-handler). Shallow TOP-LEVEL keys only —
 * nested content (verdictMismatch*, reviewerVerdict, the cone's nested failedDependencyTaskId)
 * rides its carrier.
 */
export const PLATFORM_RUN_KEYS = [
  'qualityGate',
  'pipelineStageId',
  'duplicateHalt',
  'cannotRun',
  'cannotRunPersistedAt',
  'deliverableSourceTaskId',
  'suppressDefaultReportMd',
  'programReleasable',
  'programConfidence',
  'programConfidenceChildren',
  'programConfidenceMissing',
  'blockedByUpstreamFailure',
  'failedDependencyTaskId',
  'truncationStall',
  'requiresInterfaceContract',
  'confidenceScore',
  'completionSummary',
  'mcpStorageVersion',
  'mcpStorageLocation',
] as const;

/** Guard-written audit facts — stripped on ALL client surfaces INCLUDING MCP (class (c)). */
export const AUDIT_STRIP_KEYS = ['completedWithDependencyOverride'] as const;

export interface RunKeyDropOptions {
  /** Surface label for the warn (e.g. 'web-funnel', 'pov-bulk-save', 'pov-bulk-create', 'bulk-update'). */
  surface: string;
  /** Warn sink — fired ONLY when a dropped value STRUCTURALLY differs from stored. */
  warn?: (fields: Record<string, unknown>, message: string) => void;
}

/** Structural equality over platform-serialized JSONB round-trips (key order is stable through
 *  the storage round-trip; `===` would classify EVERY object echo as differing → 100% warn noise). */
function structurallyEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

/**
 * Drop platform-run keys from an EDITOR-surface inbound metadata object. MUTATES `incoming`:
 * every PLATFORM_RUN_KEY present is removed unconditionally — the stored value governs (the
 * inbound copy is a form-load-time snapshot that may predate mid-run platform writes). Never
 * throws. Warns ONCE per key ONLY when the dropped value structurally differed from stored
 * (an equal echo is silent — the routine case for every save of a previously-run task).
 *
 * The warn is a FACT log (Protocol 10): "the editor's copy of <key> was stale; the run's value
 * was kept" — expected during live runs, not a violation. Error code
 * PLATFORM_RUN_KEY_STALE_DROP is deliberately DISTINCT from PROTOCOL_STAMP_IMMUTABLE so the
 * forge-signal greps stay clean.
 *
 * @returns the keys that were dropped WITH a differing value (the forensic observable).
 */
export function dropPlatformRunKeys(
  incoming: Record<string, unknown>,
  existing: Record<string, unknown> | null | undefined,
  taskId: string,
  opts: RunKeyDropOptions
): string[] {
  const existingMeta = existing ?? {};
  const differed: string[] = [];
  for (const key of PLATFORM_RUN_KEYS) {
    if (!(key in incoming)) continue;
    const inboundValue = incoming[key];
    const storedValue = key in existingMeta ? existingMeta[key] : undefined;
    delete incoming[key];
    if (structurallyEqual(inboundValue, storedValue)) continue; // echo — silent
    differed.push(key);
    opts.warn?.(
      { taskId, key, surface: opts.surface, errorCode: 'PLATFORM_RUN_KEY_STALE_DROP' },
      `Dropped stale platform-run key "${key}" from ${opts.surface} metadata (value differed from stored — the run's value was kept)`
    );
  }
  return differed;
}

/**
 * Strip guard-written AUDIT facts from ANY client-surface inbound metadata (class (c) — applies
 * to MCP too, unlike the run-key drop). MUTATES `incoming`. Warns on presence when a sink is
 * given (presence IS the anomaly for audit facts — they are never legitimately client-sent).
 */
export function stripAuditFacts(
  incoming: Record<string, unknown>,
  warn?: (fields: Record<string, unknown>, message: string) => void,
  context?: Record<string, unknown>
): void {
  for (const key of AUDIT_STRIP_KEYS) {
    if (!(key in incoming)) continue;
    delete incoming[key];
    warn?.(
      { ...(context ?? {}), key },
      `Stripped inbound ${key} from metadata (audit fact is guard-written only)`
    );
  }
}
