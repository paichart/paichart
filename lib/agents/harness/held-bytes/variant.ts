/**
 * PLATFORM-HELD-BYTES — the ONE held-capability predicate and the ONE leaf→leg protocol resolution.
 *
 * PHASE 10 (2026-10-17, PHASE10-PLAN.md W1; owner decisions PH-1/PH-10, panel D4): held is a platform CAPABILITY, not a variant. A
 * leg is HELD-CAPABLE when its protocol is in `HELD_CAPABLE_PROTOCOLS` — the keys of `HELD_JOIN_VERSIONS` below (observability-config
 * from 1.10.0, kubernetes-gitops from 1.18.0 — the held text is folded into each). The RETIRED `observability-config-held` is NOT a member (panel D4): its row is a DEPRECATED tombstone, so a leg titled with
 * it composes on the harness OPERATING BASE alone (`PROTOCOL_ROW_NOT_ACTIVE_LEG_BASE_ONLY`, execution-system-prompt.ts LEG-tier branch)
 * with no obs text and no held text — it must not be held-enforced by rules its agents never saw (panel PC-S5 / AE-S3 / AR-S3).
 * Measured: 0 of 218 obs-bound leaves sit on a non-obs leg (prod, 2026-10-17). A domain joins by being added here once its rig has a
 * file source + descriptors (PH-11) — by ONE row in `HELD_JOIN_VERSIONS`. The capability ACTS on a leg only when that leg has held files; the carrier's scope rule is the
 * ONE predicate in held-bytes/scope.ts.
 *
 * GLOSSARY: Stage B called this "the held variant". Comments across the held-bytes code that say "variant leg" mean a
 * HELD-CAPABLE leg. Stamped vocabulary keeps its original strings on purpose (`not-variant-leg`, `pipeline-held-variant`,
 * `variant-protocol-not-injected`): renaming a stamped value breaks every tally that reads it.
 *
 * `resolveOwningLegProtocol` is the ONE async leaf→leg resolution. A leaf (ACTION child) carries `metadata.protocol` as a
 * PRESENT-BUT-NULL key, so asking the leaf answers null in every lane (the trap `resolveRollbackLane` documents); the leg is
 * found through the leaf's own stage's `metadata.harnessTaskId`. The leaf's `stage_id` is READ here, never threaded in by a
 * caller: an adapter that omits a threaded field lands silently on the fail-open arm (the 2026-09-18 contractApplicability
 * defect). The core calls it ONCE after the loop and threads the answer to the step, the capture-position branch,
 * `prepareHeldPackage` and the nets; a caller that passes nothing (rescue path, replays, the lab, the equivalence gate)
 * gets the SAME answer through `buildNetContext`'s lazy memo of this same function (A6).
 *
 * Outcomes (a positive non-held answer is not an error):
 *   leg            the leaf's leg was found; `heldCapable` says whether its protocol is held-capable;
 *   self           the task IS a PIPELINE (a leg) — its own protocol decides;
 *   no-leg         no stage, or a stage with no harnessTaskId ⇒ positive NOT held-capable (the net stamps NOT_STAMPED);
 *   could-not-check a read THREW, or harnessTaskId names a row that does not exist ⇒ the step returns `could-not-check`,
 *                  capture keeps today's position, the conditional nets stamp `errorFact()`.
 */
import { canonicalProtocolName, resolveTaskProtocol } from '../program-protocol';

/** The RETIRED held-variant token (Stage B → G3). Its protocol row is a DEPRECATED tombstone since Phase 10. Kept as a NAME so the
 *  seed, MI-13 (G3 history) and the binding check can refer to it — NOT held-capable (panel D4). Never add it to
 *  PROGRAM_PROTOCOL_NAMES (leg tier). */
export const HELD_VARIANT_TOKEN = 'observability-config-held';
export const HELD_VARIANT_PROTOCOL = canonicalProtocolName(HELD_VARIANT_TOKEN);
/** The observability protocol — held-capable since Phase 10 (the held text is folded into it). */
export const HELD_OBS_PROTOCOL = canonicalProtocolName('observability-config');

/** held-k8s 1g (EF B-2): the ONE table of held-capable protocols and the protocol VERSION each one became held-capable at. MI-13's
 *  `_heldleg` keys on it STRUCTURALLY — a leg whose FIRST pipeline-index.json composed `name` at ≥ that version — never on the
 *  facts the held sections audit (a population defined by `editApplication` presence would make the "missing editApplication"
 *  🔴 zero by construction). A domain joins by adding its row (PH-11); `report-mechanism-inventory.sh` must carry every pair as
 *  a literal (pinned by test-held-bytes-store). Versions are the protocol's own semver, as stamped in `protocolInjection.delta`. */
export const HELD_JOIN_VERSIONS: Readonly<Record<string, string>> = Object.freeze({
  [HELD_OBS_PROTOCOL]: '1.10.0',
  // held-k8s step 3 (the join, 2026-10-19): kubernetes-gitops becomes held-capable at the version that carries the held text.
  [canonicalProtocolName('kubernetes-gitops')]: '1.18.0',
  // held-terraform step 3 (the join, 2026-10-21): terraform-iac becomes held-capable at the version that carries the held text.
  [canonicalProtocolName('terraform-iac')]: '1.15.0',
  // held-network step 3 J1 (push 2, 2026-10-26): network-provisioning joins at the version the join TEXT (J2, push 3) will carry.
  // AWAITING TEXT below until push 3 seeds it — held capability is OFF for network until then.
  [canonicalProtocolName('network-provisioning')]: '1.25.0',
});

/**
 * held-network step 3 J1 (push 2): a joined protocol whose held TEXT has not shipped yet. Held capability keys on the protocol NAME
 * (never the version a leg composed — the join deploy needs no legs of the domain in flight), so a join row alone would make every
 * live leg of that domain held-enforced by rules its agents never saw (the panel PC-S5 principle). A protocol listed here has its
 * join row (MI-13 `_heldjoin` keys on it, so the first leg composing the join version is measured) but is NOT held-capable.
 * THE TEXT COMMIT REMOVES ITS ENTRY: `test:held-variant-protocol` pins "listed ⇔ the seed's version is below the join version, and
 * the seed text carries no held-files section", so seeding the join version without removing the entry — or removing it without the
 * text — reds the battery. A STATIC gate on purpose: the leg replay lab runs the candidate tree's own join line (a runtime version
 * gate would make the lab's same-tree baseline arm, 1.24.0 with the J1 code on, NOT held — J2-TEXT-DRAFT §5).
 */
// held-network step 3 push 3 (the text commit, network-provisioning 1.25.0): network's entry removed — empty until the next domain joins ahead of its text.
export const HELD_JOIN_AWAITING_TEXT: readonly string[] = Object.freeze([]);

/** Every held-capable domain protocol, canonical form = the keys of HELD_JOIN_VERSIONS minus HELD_JOIN_AWAITING_TEXT (one source). */
export const HELD_CAPABLE_PROTOCOLS: readonly string[] = Object.freeze(Object.keys(HELD_JOIN_VERSIONS).filter((p) => !HELD_JOIN_AWAITING_TEXT.includes(p)));

/** Is this protocol NAME held-capable? Short or long form; anything else (null, '', another domain) is not. */
export function isHeldCapableProtocol(name: string | null | undefined): boolean {
  return typeof name === 'string' && name.length > 0 && HELD_CAPABLE_PROTOCOLS.includes(canonicalProtocolName(name));
}

/** The predicate over a LEG (a PIPELINE task): stamp first, title fallback — the shared ladder (`resolveTaskProtocol`). */
export function isHeldCapableLeg(leg: { title?: string | null; metadata?: unknown }): boolean {
  return isHeldCapableProtocol(resolveTaskProtocol(leg).protocol ?? '');
}

/** held-k8s (SYNTHESIS v3 §6.2 1b-scope): the protocols whose legs may read a Git FILE SOURCE (github-service). A descriptor with
 *  `legScope: 'git-file-source'` captures only on such a leg, so an observability leg that calls github-service holds nothing
 *  (MI-13 🔴 "github captures on a leg that is not a Git file source" is 0 by construction). Distinct from HELD_CAPABLE_PROTOCOLS on purpose: in
 *  step 2 a k8s leg captures (shadow) while it is not yet held-capable. Canonical long form. */
// held-terraform step 1 (T-1, 2026-10-21): terraform-iac joins as a Git file source BEFORE it is held-capable (the k8s order) —
// inert until its Harvester text calls github-service (step 2); MI-13 `_gitsrcleg` carries the same pair (pinned).
// held-network step 1 (item 1c, 2026-10-23): network-provisioning joins as a Git file source BEFORE it is held-capable (the k8s /
// terraform order) — inert until its Harvester text names a Git read (step 2); MI-13 `_gitsrcleg` carries the same triple (pinned).
export const GIT_FILE_SOURCE_PROTOCOLS: readonly string[] = Object.freeze([
  canonicalProtocolName('kubernetes-gitops'), canonicalProtocolName('terraform-iac'), canonicalProtocolName('network-provisioning'),
]);

export function isGitFileSourceLeg(leg: { title?: string | null; metadata?: unknown }): boolean {
  const p = resolveTaskProtocol(leg).protocol;
  return !!p && GIT_FILE_SOURCE_PROTOCOLS.includes(canonicalProtocolName(p));
}

/** held-network step 3 batch 2b (P3 / S3-A, 2026-10-26): the protocols whose legs declare a per-device `## Device sources` block
 *  (device-sources.ts). Capture holds a device configuration (the device-read lane, descriptors.ts DEVICE_READ_DESCRIPTORS) only on
 *  such a leg and only for a device the block declares `device-read`. Distinct from HELD_CAPABLE_PROTOCOLS on purpose: network is
 *  NOT held-capable until J1 — until then a device base is SHADOW only (written to the store, shown to no agent). Canonical form. */
// VALUE-LEG-GIT (owner G1–G4, 2026-11-06): network-derivation joins as a VALUE lane. A value leg never holds anything (G2-b): its
// declaration feeds the READ record and the device facts (deviceSourceReads, gitDeviceComparison, liveEvidence) only — capture never
// receives a device scope and the carrier never forces on it (`deviceSourceLane`, below; every consumer switches exhaustively).
export type DeviceSourceLane = 'change' | 'value';
/** The ONE table: protocol (canonical long form) → its lane and its key under `interfaceContract.deviceSources` (G2-a: each protocol
 *  its own key, so a value leg can list every switch it must see without changing what the change legs declare). */
export const DEVICE_SOURCE_LANES: Readonly<Record<string, { lane: DeviceSourceLane; contractKey: string }>> = Object.freeze({
  [canonicalProtocolName('network-provisioning')]: { lane: 'change', contractKey: 'network-provisioning' },
  [canonicalProtocolName('network-derivation')]: { lane: 'value', contractKey: 'network-derivation' },
});
export const DEVICE_SOURCE_PROTOCOLS: readonly string[] = Object.freeze(Object.keys(DEVICE_SOURCE_LANES));

/** Exhaustiveness guard (LL-CS-05): a new lane added to `DeviceSourceLane` fails to compile at every switch that uses it. */
export function assertNeverLane(lane: never): never {
  throw new Error(`device-source lane not handled: ${String(lane)}`);
}

/** The lane of a protocol, or null when it declares no Device sources. */
export function deviceSourceLaneOf(protocol: string | null | undefined): DeviceSourceLane | null {
  return protocol ? DEVICE_SOURCE_LANES[canonicalProtocolName(protocol)]?.lane ?? null : null;
}

/** The leg's key under `interfaceContract.deviceSources` (null when its protocol declares no Device sources). */
export function deviceSourceContractKeyOf(protocol: string | null | undefined): string | null {
  return protocol ? DEVICE_SOURCE_LANES[canonicalProtocolName(protocol)]?.contractKey ?? null : null;
}

/** G4-c (inert by DECLARATION): a value leg is a Device-sources leg only when its first-execution snapshot exists — and the snapshot is
 *  taken for a value leg only when it declares a block (prepare-task-for-execution.ts). No snapshot ⇒ today's path, byte-identical. A
 *  change leg keeps its rule: its protocol decides (a missing snapshot there is a named fail-closed state, device-sources-read.ts). */
function hasDeviceSourcesSnapshot(metadata: unknown): boolean {
  return !!metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    && (metadata as Record<string, unknown>).deviceSourcesSnapshot !== undefined && (metadata as Record<string, unknown>).deviceSourcesSnapshot !== null;
}

export function isDeviceSourceLeg(leg: { title?: string | null; metadata?: unknown }): boolean {
  const lane = deviceSourceLaneOf(resolveTaskProtocol(leg).protocol);
  if (lane === null) return false;
  switch (lane) {
    case 'change': return true;
    case 'value': return hasDeviceSourcesSnapshot(leg.metadata);
    default: return assertNeverLane(lane);
  }
}

/** The lane of a leg that IS a Device-sources leg (isDeviceSourceLeg), else null. */
export function deviceSourceLaneOfLeg(leg: { title?: string | null; metadata?: unknown }): DeviceSourceLane | null {
  return isDeviceSourceLeg(leg) ? deviceSourceLaneOf(resolveTaskProtocol(leg).protocol) : null;
}

export type OwningLegResolution =
  | { kind: 'self'; legId: string; heldCapable: boolean; /** held-k8s 1b-scope; absent ⇒ false */ gitFileSource?: boolean;
      /** held-network step 3 batch 2b: the leg declares Device sources (DEVICE_SOURCE_PROTOCOLS); absent ⇒ false */ deviceSource?: boolean;
      /** VALUE-LEG-GIT: present ONLY on a value-lane Device-sources leg (`'value'`); absent ⇒ the change lane */ deviceSourceLane?: 'value' }
  | { kind: 'leg'; legId: string; heldCapable: boolean; /** the LEAF's own stage, read here (the step's binding check) */ ownStageId: string;
      /** held-k8s 1b-scope: the leg may read a Git file source; absent ⇒ false */ gitFileSource?: boolean;
      /** held-network step 3 batch 2b: the leg declares Device sources; absent ⇒ false */ deviceSource?: boolean;
      /** VALUE-LEG-GIT: present ONLY on a value-lane Device-sources leg (`'value'`); absent ⇒ the change lane */ deviceSourceLane?: 'value' }
  | { kind: 'no-leg'; reason: 'no-stage' | 'no-harness-task-id'; heldCapable: false }
  | { kind: 'could-not-check'; reason: 'read-threw' | 'leg-row-missing' | 'task-row-missing'; heldCapable: false };

type Db = {
  task: { findUnique: (a: { where: { id: string }; select: Record<string, true> }) => Promise<unknown> };
  stage: { findUnique: (a: { where: { id: string }; select: Record<string, true> }) => Promise<unknown> };
};

/** The value-lane marker, spread into a resolution: `{}` on every leg but a declared value leg, so every change-leg and non-device
 *  resolution keeps its exact shape. */
function valueLaneField(leg: { title?: string | null; metadata?: unknown }): { deviceSourceLane?: 'value' } {
  const lane = deviceSourceLaneOfLeg(leg);
  if (lane === null) return {};
  switch (lane) {
    case 'change': return {};
    case 'value': return { deviceSourceLane: 'value' };
    default: return assertNeverLane(lane);
  }
}

export async function resolveOwningLegProtocol(
  db: Db,
  task: { id: string; type?: string | null; title?: string | null; metadata?: unknown },
): Promise<OwningLegResolution> {
  if (task.type === 'PIPELINE') return { kind: 'self', legId: task.id, heldCapable: isHeldCapableLeg(task), gitFileSource: isGitFileSourceLeg(task), deviceSource: isDeviceSourceLeg(task), ...valueLaneField(task) };
  try {
    const own = (await db.task.findUnique({ where: { id: task.id }, select: { stageId: true } })) as { stageId: string | null } | null;
    if (!own) return { kind: 'could-not-check', reason: 'task-row-missing', heldCapable: false };
    if (!own.stageId) return { kind: 'no-leg', reason: 'no-stage', heldCapable: false };
    const stage = (await db.stage.findUnique({ where: { id: own.stageId }, select: { metadata: true } })) as { metadata: unknown } | null;
    const legId = (stage?.metadata as Record<string, unknown> | null)?.harnessTaskId;
    if (typeof legId !== 'string' || !legId) return { kind: 'no-leg', reason: 'no-harness-task-id', heldCapable: false };
    const leg = (await db.task.findUnique({ where: { id: legId }, select: { title: true, metadata: true } })) as
      { title: string | null; metadata: unknown } | null;
    if (!leg) return { kind: 'could-not-check', reason: 'leg-row-missing', heldCapable: false };
    return { kind: 'leg', legId, heldCapable: isHeldCapableLeg(leg), ownStageId: own.stageId, gitFileSource: isGitFileSourceLeg(leg), deviceSource: isDeviceSourceLeg(leg), ...valueLaneField(leg) };
  } catch {
    return { kind: 'could-not-check', reason: 'read-threw', heldCapable: false };
  }
}

/** VALUE-LEG-GIT (G2-b): does held capture take this Device-sources leg's declaration as its device scope? The change lane only — a
 *  value leg has no Author, so a held base there is size and a handle nobody uses. Exhaustive over the lane (LL-CS-05). */
export function heldCaptureTakesDeviceScope(owningLeg: OwningLegResolution | null | undefined): boolean {
  if (!owningLeg || (owningLeg.kind !== 'self' && owningLeg.kind !== 'leg') || owningLeg.deviceSource !== true) return false;
  const lane: DeviceSourceLane = owningLeg.deviceSourceLane === 'value' ? 'value' : 'change';
  switch (lane) {
    case 'change': return true;
    case 'value': return false;
    default: return assertNeverLane(lane);
  }
}

/** VALUE-LEG-GIT (G2-b): does the held-edit carrier apply the Device-sources forces (D-1, O-4) to this leg? The change lane only. */
export function carrierAppliesDeviceForce(leg: { title?: string | null; metadata?: unknown }): boolean {
  const lane = deviceSourceLaneOfLeg(leg);
  if (lane === null) return false;
  switch (lane) {
    case 'change': return true;
    case 'value': return false;
    default: return assertNeverLane(lane);
  }
}

/** A memo that resolves at most once per persist: primed with the core's answer, or resolving lazily on first use. */
export function owningLegMemo(
  db: Db, task: { id: string; type?: string | null; title?: string | null; metadata?: unknown },
  primed?: OwningLegResolution | null,
): () => Promise<OwningLegResolution> {
  let p: Promise<OwningLegResolution> | null = primed ? Promise.resolve(primed) : null;
  return () => (p ??= resolveOwningLegProtocol(db, task));
}

/**
 * The leaf's binding check (V-5a): a held-capable leg must have run its leaf on a held-capable protocol. A leaf binds its
 * template's protocol in `named` mode and records it in `protocolInjection.protocolNames` (execution-system-prompt.ts
 * ProtocolInjectionFact) — the witness, with no new field. Leg held-capable, leaf not ⇒ `binding-mismatch`; the injection
 * recorded a `degraded` reason (a string code, e.g. PROTOCOL_LOAD_DB_ERROR) ⇒ `variant-protocol-not-injected` (stamped
 * vocabulary, kept); else null.
 */
export function heldBindingState(
  legHeldCapable: boolean,
  protocolInjection: { protocolNames?: unknown; degraded?: unknown } | null | undefined,
): 'binding-mismatch' | 'variant-protocol-not-injected' | null {
  if (!legHeldCapable) return null;
  const names = Array.isArray(protocolInjection?.protocolNames) ? (protocolInjection!.protocolNames as unknown[]) : [];
  if (!names.some((n) => typeof n === 'string' && isHeldCapableProtocol(n))) return 'binding-mismatch';
  if (typeof protocolInjection?.degraded === 'string' && protocolInjection.degraded.length > 0) return 'variant-protocol-not-injected';
  return null;
}
