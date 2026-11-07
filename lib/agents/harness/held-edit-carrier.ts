/**
 * PLATFORM-HELD-BYTES Stage B V-9 — the FAIL-CLOSED carrier (plan STAGE-B-PLAN.md v4.1 §3 V-9; D-I; arch S-B′, boundary BV3-1,
 * AE S4(ii), sec-ops SF-B, EF n3-2/n3-5, PC S-18).
 *
 * On EVERY held-capable-leg qualityGate write carrying an outcome, the MCP `task.update` handler (the single qualityGate writer —
 * `qualityGate` is in PLATFORM_RUN_KEYS, so web/bulk/POV-PUT drop it) calls `applyHeldEditCarrier` BEFORE its RepeatableRead tx
 * and BEFORE the verdict-mismatch guard. It writes `qualityGate.heldEdit = { state, reviewerSaw, agentOutcome, forced, reason? }`
 * and rewrites an incoming `approved` to `needs-revision` UNLESS the package is OUT OF SCOPE (Phase 10, held-bytes/scope.ts
 * `heldPackageOutOfScope`) or all three hold:
 *   1. the selected Author's `editApplication.state` is `applied`;
 *   2. the selected Reviewer's `reviewedEditDiff.state` is `rendered`;
 *   3. it names the selected Author execution AND its `candidateDigest8` equals that Author's stamp.
 * Reasons: `<state>` / `reviewer-saw-no-diff` / `reviewed-stale-author`. Asymmetric: it blocks, never approves.
 *
 * FAIL-CLOSED: the carrier is NOT inside the guard's swallow-all try/catch. A read error is `could-not-check`, a missing Author
 * stamp `no-author-stamp`, a missing Reviewer stamp `reviewer-saw-no-diff` — every one forces. Inputs come through the ONE
 * child selector (`selectLegChildStamp`) the hoist and V-6 share. A non-variant PIPELINE task is a no-op (it reads nothing).
 *
 * THE ONLY WRITER of `qualityGate.heldEdit` (push-2 code review BC-P2-1 / ARCH-P2-1 / AE-P2-6): an inbound `heldEdit` on ANY
 * write is deleted first, before either early return — the guard and the deliverable's Platform outcome line read it as the
 * platform's, so an agent-authored copy would hide a dangerous mismatch or print a false "overridden" line.
 * THE LEG'S OWN EVIDENCE (SEC-P2-1): the stage comes from the STORED `task.metadata.pipelineStageId`, never from the incoming
 * write; a write that re-points the stage AND carries an outcome forces `stage-rebind`; and the selected Author's committed BASE
 * refs must name this leg (`legTaskId`, written at the Author's persist from its own stage back-pointer), or `author-not-of-leg`
 * — so a two-step re-point (re-point, then approve) also forces.
 */
import { isHeldCapableLeg, carrierAppliesDeviceForce } from './held-bytes/variant';
import { readLegDeviceSources, type LegDeviceSourcesResolution } from './device-sources-read';
import { isFileOfGitLine } from './held-bytes/device-read-scope';
import { GIT_FILE_SOURCE_PINS } from '@/lib/mcp/server/config/git-file-source-pin';
import { heldPackageOutOfScope } from './held-bytes/scope';
import { selectLegEditApplication, selectLegReviewedDiff, selectLegHarvesterHeldBytes, legEditApplicationState, type ChildStamp } from './held-bytes-nets';

export type HeldEditReason = string;
export interface HeldEditVerdict { state: string; reviewerSaw: string; reason: HeldEditReason | null; inScope: boolean }

/**
 * PHASE 10 scope rule — THE ONE predicate lives in held-bytes/scope.ts (phase10-panel/SYNTHESIS.md §1a; owner decisions D1, D2):
 * the carrier's SCOPE DECISION is "state ∈ the D1 list AND the stamp shows no held grammar". It is recorded as `inScope` — a decision
 * record, not a claim that the package changes no held file (panel AR-N1). Out of scope ⇒ never forced BY SCOPE; every other state,
 * and any package with held grammar, still forces. A run-level override (`stage-rebind`, `author-not-of-leg`) can still force an
 * out-of-scope package: the stamp then reads `inScope:false` + `forced:true` + `reason` — legitimate by design (panel §4 C3; the
 * reason is what forced, and `heldEditWouldForce` keys on it). An unreadable stamp is never out of scope (`author.state === 'ok'`).
 */
export { HELD_OUT_OF_SCOPE_STATES } from './held-bytes/scope';

/** The pure rule (shared by the carrier and the verdict-mismatch guard via `heldEditWouldForce`). */
export function heldEditVerdict(author: ChildStamp | null, reviewer: ChildStamp | null, readError = false): HeldEditVerdict {
  if (readError || !author) return { state: 'could-not-check', reviewerSaw: 'could-not-check', reason: 'could-not-check', inScope: true };
  const state = legEditApplicationState(author);
  const rf = reviewer && reviewer.state === 'ok' ? reviewer.fact : null;
  const reviewerSaw = rf && typeof rf.state === 'string' ? (rf.state as string) : 'reviewer-saw-no-diff';
  // `author.state === 'ok'` guards the scope read: an unreadable stamp is `no-author-stamp` (forces), never out of scope.
  if (author.state === 'ok' && heldPackageOutOfScope(author.fact)) return { state, reviewerSaw, reason: null, inScope: false };
  if (state !== 'applied') return { state, reviewerSaw, reason: state, inScope: true };
  if (!rf || rf.state !== 'rendered') return { state, reviewerSaw, reason: 'reviewer-saw-no-diff', inScope: true };
  const a = author.state === 'ok' ? author : null;
  // A1: a digest must be PRESENT on both sides and equal; an absent one is unjudgeable ⇒ could-not-check (BC-P2-N2).
  if (!a || typeof rf.candidateDigest8 !== 'string' || typeof a.fact.candidateDigest8 !== 'string') return { state, reviewerSaw, reason: 'could-not-check', inScope: true };
  if (rf.authorExecutionId !== a.executionId || rf.candidateDigest8 !== a.fact.candidateDigest8) {
    return { state, reviewerSaw, reason: 'reviewed-stale-author', inScope: true };
  }
  return { state, reviewerSaw, reason: null, inScope: true };
}

/** ONE shared predicate (arch v4 S-G): would the carrier force an approval here? Reads the stamped `heldEdit`. */
export function heldEditWouldForce(heldEdit: unknown): boolean {
  if (!heldEdit || typeof heldEdit !== 'object') return false;
  return typeof (heldEdit as { reason?: unknown }).reason === 'string';
}

type CarrierDb = Parameters<typeof selectLegEditApplication>[0] & {
  heldFileRef: { findMany: (a: { where: { executionId: string; kind: 'BASE' | 'CAPTURE' }; select: Record<string, true>; take?: number }) => Promise<Array<{ legTaskId?: string | null; target?: string; path?: string }>> };
  heldCaptureRefusal: {
    count: (a: { where: { executionId: string; refusal: 'source-not-pinned' } }) => Promise<number>;
    findFirst?: (a: { where: { executionId: string; refusal: { in: string[] } }; select: { refusal: true } }) => Promise<{ refusal: string } | null>;
  };
};

/** Cap on the device names a forced stamp lists (the count stays exact). */
const DEVICES_NOT_HELD_CAP = 20;

/**
 * held-network step 3 push 2 (owner O-4, 2026-10-26 — the 1.24.0 B2 rule, platform-enforced; the G-4 analogue), GENERALISED in push 3
 * (owner D-1, 2026-10-26, sec-ops push-2 SF-4): on a Device-sources leg, EVERY device the IMMUTABLE declaration snapshot declares with a
 * non-`command-package` source must have a HELD BASE in the authoritative Harvester's capture:
 *   - a device that declares a `git-file` line is satisfied ONLY by that Git file held (owner Phase-0 §4b: the Git file is the base of
 *     record and the device read is evidence) — else `git-file-not-held` (`gitFileDevicesNotHeld` names them). A refused ref, an
 *     unreadable file, a `git-file-not-declared` read, or a read never made all leave no held file, so all force;
 *   - a device that declares `device-read` and NO Git file is satisfied by its device configuration (`device:<device>`) held — else
 *     `device-read-not-held` (`devicesNotHeld` names them);
 *   - a `command-package` device never forces (the grammar refuses it beside another source: `command-package-not-alone`).
 * One reason per stamp, the FAMILY ordered `git-file-not-held` > `device-read-not-held`; both lists are stamped whenever either fires.
 * The declaration is the GOVERNING one — the leg's first-execution snapshot, checked against the live text (device-sources-read.ts,
 * sec-ops push-2 SF-1): a missing / unreadable / CHANGED snapshot, a snapshot that declares NO block (`device-sources-absent`, D-1 item 2:
 * the protocol stops a leg with a device without a line, so a held-capable leg with no block fails closed), an unparseable or conflicting
 * block, or a read that could not be made forces by that name, and so does a snapshot refusal the authoritative Harvester's CAPTURE
 * recorded (an edit made during the capture and reverted before this write). The "≥ 1.25.0" scope of D-1 is carried by the
 * held-capability gate itself (name-keyed, effective at the join — the k8s/terraform precedent): the carrier runs on a network leg
 * only once network is held-capable — true since push 3 (network-provisioning 1.25.0, 2026-10-27), which emptied
 * `HELD_JOIN_AWAITING_TEXT`. PURE over the reads the carrier made.
 */
export interface DeviceForce { reason: string; devicesNotHeld?: string[]; devicesNotHeldTotal?: number; gitFileDevicesNotHeld?: string[]; gitFileDevicesNotHeldTotal?: number }
export function deviceReadForce(sources: LegDeviceSourcesResolution, captureRefs: ReadonlyArray<{ target?: string; path?: string }>, captureSnapshotRefusal: string | null = null):
  DeviceForce | null {
  if (captureSnapshotRefusal) return { reason: captureSnapshotRefusal };
  const r = sources;
  if (r.state === 'not-device-source-leg') return null;
  if (r.state !== 'parsed') return { reason: `device-sources-${r.state}` }; // absent (D-1 item 2) · unparseable · conflict · snapshot-* · could-not-check
  const gitHeld = (d: string) => r.entries.some((l) => l.kind === 'git-file' && l.device === d && !platformPinRefusesRef(l)
    && captureRefs.some((x) => typeof x.target === 'string' && typeof x.path === 'string' && isFileOfGitLine({ target: x.target, path: x.path }, l)));
  const declaresGit = (d: string) => r.entries.some((e) => e.kind === 'git-file' && e.device === d);
  const gitNotHeld = [...new Set(r.entries.filter((e) => e.kind === 'git-file').map((e) => e.device))].filter((d) => !gitHeld(d));
  const readNotHeld = [...new Set(r.entries.filter((e) => e.kind === 'device-read').map((e) => e.device))]
    .filter((d) => !declaresGit(d) && !captureRefs.some((x) => x.target === `device:${d}`));
  if (!gitNotHeld.length && !readNotHeld.length) return null;
  return {
    reason: gitNotHeld.length ? 'git-file-not-held' : 'device-read-not-held',
    ...(readNotHeld.length ? { devicesNotHeld: readNotHeld.slice(0, DEVICES_NOT_HELD_CAP), devicesNotHeldTotal: readNotHeld.length } : {}),
    ...(gitNotHeld.length ? { gitFileDevicesNotHeld: gitNotHeld.slice(0, DEVICES_NOT_HELD_CAP), gitFileDevicesNotHeldTotal: gitNotHeld.length } : {}),
  };
}

/**
 * sec-ops push-3 SF-1 (the CAPTURE ref carries no ref name — `isFileOfGitLine` matches target + path only): a declared line on a PLATFORM
 * pin's repo (`GIT_FILE_SOURCE_PINS`) whose ref the pin never admits (the line's ref, else the default branch) can never have been held
 * AT THAT REF — the pin refuses the read (`source-not-pinned`) — so a file held at the same target + path is another revision (a
 * default-branch read) and never satisfies the line. A customer row's declared line is held only at its own ref (P8,
 * `matchDeclaredGitLine`); two devices declaring one path at two refs on a customer row stay a residual (the record §6).
 */
function platformPinRefusesRef(l: { owner: string; repo: string; ref: string | null }): boolean {
  const o = l.owner.toLowerCase(); const rp = l.repo.toLowerCase();
  return Object.values(GIT_FILE_SOURCE_PINS as Record<string, { owner: string; repo: string; refs: readonly string[] }>)
    .some((pin) => pin.owner.toLowerCase() === o && pin.repo.toLowerCase() === rp && !pin.refs.includes(l.ref ?? 'main'));
}

/** The forcing reasons `deviceReadForce` names devices for (the stamp then carries the device lists). */
export const DEVICE_NOT_HELD_REASONS: readonly string[] = Object.freeze(['git-file-not-held', 'device-read-not-held']);

/** Mutates `pendingMerge.qualityGate` in place. No-op unless the task is a held-variant PIPELINE leg and the write carries an
 *  outcome. Never throws: every failure is a forcing state. `deps` exists for the fixtures only (a network leg is not held-capable
 *  until J1 takes effect); production passes nothing. */
export async function applyHeldEditCarrier(
  db: CarrierDb,
  task: { id?: string | null; type?: string | null; title?: string | null; metadata?: unknown } | null | undefined,
  pendingMerge: Record<string, unknown>,
  deps: { isHeldCapableLeg?: (l: { title?: string | null; metadata?: unknown }) => boolean } = {},
): Promise<{ applied: boolean; forced: boolean }> {
  const qg = pendingMerge?.qualityGate as Record<string, unknown> | undefined;
  if (qg && typeof qg === 'object' && 'heldEdit' in qg) delete qg.heldEdit; // the carrier is the only writer (BC-P2-1)
  if (!task || task.type !== 'PIPELINE' || !qg || typeof qg !== 'object' || typeof qg.outcome !== 'string') return { applied: false, forced: false };
  if (!(deps.isHeldCapableLeg ?? isHeldCapableLeg)({ title: task.title ?? null, metadata: task.metadata })) return { applied: false, forced: false };
  const stageId = (task.metadata as Record<string, unknown> | null)?.pipelineStageId;
  const incomingStage = pendingMerge.pipelineStageId;
  const rebind = incomingStage !== undefined && incomingStage !== stageId;
  let author: ChildStamp | null = null; let reviewer: ChildStamp | null = null; let readError = false; let notOfLeg = false;
  let notPinned = false;
  let deviceForce: ReturnType<typeof deviceReadForce> = null;
  try {
    // held-k8s step 3 (owner G-4, SYNTHESIS v3 §6.4): a Git read off the pin (another repo, another ref, a sha) is refused at call
    // time and recorded at capture as `source-not-pinned`. On a held-capable leg it leaves no base, so the package would read
    // `no-base` (out of scope) and the leg would silently degrade to retyping the file. Force it instead, like a stage rebind.
    const harvester = await selectLegHarvesterHeldBytes(db, stageId);
    if (harvester.executionId) {
      notPinned = (await db.heldCaptureRefusal.count({ where: { executionId: harvester.executionId, refusal: 'source-not-pinned' } })) > 0;
    }
    // push 2 (O-4) + push 3 (D-1): a declared non-command-package device with no held base forces (a no-op off a Device-sources leg).
    if (carrierAppliesDeviceForce({ title: task.title ?? null, metadata: task.metadata })) { // VALUE-LEG-GIT: change lane only (G2-b)
      const refs = harvester.executionId
        ? await db.heldFileRef.findMany({ where: { executionId: harvester.executionId, kind: 'CAPTURE' }, select: { target: true, path: true }, take: 1000 }) // one Harvester's capture refs (held-file caps bound it far lower); a cut can only ADD a force — the safe direction
        : [];
      const snapRefusal = harvester.executionId && db.heldCaptureRefusal.findFirst
        ? await db.heldCaptureRefusal.findFirst({ where: { executionId: harvester.executionId,
            refusal: { in: ['device-sources-snapshot-absent', 'device-sources-snapshot-unreadable', 'device-sources-snapshot-changed'] } }, select: { refusal: true } })
        : null;
      const sources = task.id
        ? await readLegDeviceSources(db as never, { kind: 'self', legId: task.id, heldCapable: true, deviceSource: true })
        : { state: 'could-not-check' as const, grammarVersion: 1, reason: 'read-threw' as const };
      deviceForce = deviceReadForce(sources, refs, snapRefusal?.refusal ?? null);
    }
    author = await selectLegEditApplication(db, stageId);
    reviewer = await selectLegReviewedDiff(db, stageId);
    if (author.state === 'ok' && author.fact.state === 'applied') {
      const bases = await db.heldFileRef.findMany({ where: { executionId: author.executionId, kind: 'BASE' }, select: { legTaskId: true } });
      notOfLeg = !task.id || bases.length === 0 || bases.some((b) => b.legTaskId !== task.id);
    }
  } catch { readError = true; }
  const base = heldEditVerdict(author, reviewer, readError);
  // Precedence (push 2; push 3 D-1): stage-rebind > source-not-pinned > the device force (a capture snapshot refusal · device-sources-<state>
  // incl. absent · git-file-not-held > device-read-not-held) > author-not-of-leg > the package's own reason.
  const v: HeldEditVerdict = rebind ? { ...base, reason: 'stage-rebind' }
    : notPinned && !readError ? { ...base, reason: 'source-not-pinned' }
    : deviceForce && !readError ? { ...base, reason: deviceForce.reason }
    : notOfLeg && base.reason === null ? { ...base, reason: 'author-not-of-leg' } : base;
  const agentOutcome = qg.outcome as string;
  const forced = agentOutcome === 'approved' && v.reason !== null;
  const df = deviceForce && v.reason === deviceForce.reason && DEVICE_NOT_HELD_REASONS.includes(v.reason) ? deviceForce : null;
  const devicesNotHeld = df ? {
    ...(df.devicesNotHeld ? { devicesNotHeld: df.devicesNotHeld, devicesNotHeldTotal: df.devicesNotHeldTotal } : {}),
    ...(df.gitFileDevicesNotHeld ? { gitFileDevicesNotHeld: df.gitFileDevicesNotHeld, gitFileDevicesNotHeldTotal: df.gitFileDevicesNotHeldTotal } : {}),
  } : {};
  qg.heldEdit = { state: v.state, reviewerSaw: v.reviewerSaw, agentOutcome, forced, inScope: v.inScope, ...(v.reason !== null ? { reason: v.reason } : {}), ...devicesNotHeld };
  if (forced) qg.outcome = 'needs-revision';
  return { applied: true, forced };
}

/** The leg deliverable's "Platform outcome" line (PC S-18) — present iff forced. */
export function heldEditOutcomeLine(heldEdit: unknown): string | null {
  if (!heldEdit || typeof heldEdit !== 'object') return null;
  const h = heldEdit as Record<string, unknown>;
  if (h.forced !== true) return null;
  const clean = (s: unknown) => String(s ?? 'unknown').replace(/[^a-z0-9-]/gi, '');
  // PC-P2-2: each slot carries its own fact — the Author's state, what the Reviewer saw, and the forcing reason.
  return `Platform outcome: needs-revision — edit application \`${clean(h.state)}\` / reviewer \`${clean(h.reviewerSaw)}\` / reason \`${clean(h.reason)}\`; the leg's approval was overridden by the platform.`;
}
