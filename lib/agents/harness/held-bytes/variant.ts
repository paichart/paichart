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

/** Is `metadata.configSourcesSnapshot` a JSON OBJECT (not absent, null, an array or a scalar)? The metadata-only test the Git-lane
 *  twin, the resolution marker and the carrier's gate share for a `runs-undeclared` protocol (STEP 3 P2, plan W1 / §13 A7). */
export function hasConfigSourcesSnapshotObject(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const v = (metadata as Record<string, unknown>).configSourcesSnapshot;
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** The METADATA-ONLY twin of the Git-lane switch (`captureScopesFor` is the one capture asks — it also sees the governing
 *  declaration). By NAME for the three protocols on the list, as before. STEP 3 P2 (plan W1): a leg of a `runs-undeclared`
 *  protocol (observability) is a Git file source exactly when its text HAS SHIPPED (the row is off the awaiting list) AND the leg
 *  carries a snapshot object. MI-13's `_gitsrcleg` states the same two columns (name, rule), so its 1b-scope RED line counts a Git
 *  CAPTURE on an observability leg with no snapshot — and one on a leg whose text was reverted (plan A7: that leg holds NOTHING).
 *  Where the twin and the helper differ, nothing is held either way: a failed leg-row read, a block on a leg with no snapshot, and
 *  the text-reverted leg (the helper turns the lane ON there so every Git file is refused BY NAME; the twin reads off). */
export function isGitFileSourceLeg(leg: { title?: string | null; metadata?: unknown }, awaiting: readonly string[] = CONFIG_SOURCE_AWAITING_TEXT): boolean {
  const p = resolveTaskProtocol(leg).protocol;
  if (!p) return false;
  const c = canonicalProtocolName(p);
  if (GIT_FILE_SOURCE_PROTOCOLS.includes(c)) return true;
  // CONFIG_SOURCE_LANES / the awaiting list are declared below; both are read at CALL time, never at module load.
  return CONFIG_SOURCE_LANES[c]?.noBlock === 'runs-undeclared' && !awaiting.includes(c) && hasConfigSourcesSnapshotObject(leg.metadata);
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

// ── Config sources STEP 2 (owner decision (b), 2026-11-15): Kubernetes — and later observability and Terraform — declare their sources
// in a SEPARATE table under a SEPARATE contract field, `interfaceContract.configSources["<token>"]`. They are NEVER added to
// DEVICE_SOURCE_LANES: membership there makes a protocol a network Device-sources leg everywhere (the network kinds, the device read
// record, device-read capture, the lane forces, the device facts, the gate/canary/lab tooling). Steps 3 and 4 add rows HERE only.
// Pinned by scripts/test-config-sources.ts: the two tables share no protocol and no contract key.
export type ConfigSourceLane = 'change';
/** Config sources STEP 3 (plan v2.1 §2): what a leg of the protocol does when it declares NO block.
 *    'forced'           the harness stops the leg (Kubernetes, Terraform — owner D1): a leg with no snapshot is `snapshot-absent`,
 *                       forced by name.
 *    'runs-undeclared'  the leg runs exactly as it did before the protocol had a Config lane (observability — owner decision: no
 *                       existing spec may stop). A leg with no snapshot AND no live block is `not-config-source-leg`.
 *  The per-leg answer is given by ONE function, `governingConfigSources` (config-sources-read.ts). The Kubernetes value lane adds a
 *  third value at its own P2 — this column is the one written rule both plans share. */
export type ConfigNoBlock = 'forced' | 'runs-undeclared';
/** Config sources STEP 3 slice P4 (plan §6 row 3, owner decision E, sec-ops F-9): what the platform does with the Program Architect's
 *  `serviceDescriptors[token]` when the protocol's contract block PARSES and names NO service on a service line (only `git-file` /
 *  `supplied` lines).
 *    'remove'  no declared line names a service, so no descriptor is stored (Kubernetes, Terraform — the rule since 2026-11-17: a
 *              Git-only leg reads no service).
 *    'keep'    the leg still reads its read-only service for things the block does not declare (observability: targets and rules),
 *              so the Architect's value is KEPT — a string descriptor URL only; anything else is removed.
 *  Read through `descriptorWithoutServiceLineOf`, never by a protocol name. */
export type ConfigDescriptorWithoutServiceLine = 'keep' | 'remove';
/** The ONE table: protocol (canonical long form) → its lane, its key under `interfaceContract.configSources`, its no-block rule, and
 *  what happens to the Architect's descriptor when the block names no service. */
export const CONFIG_SOURCE_LANES: Readonly<Record<string, { lane: ConfigSourceLane; contractKey: string; noBlock: ConfigNoBlock; descriptorWithoutServiceLine: ConfigDescriptorWithoutServiceLine }>> = Object.freeze({
  [canonicalProtocolName('kubernetes-gitops')]: { lane: 'change', contractKey: 'kubernetes-gitops', noBlock: 'forced', descriptorWithoutServiceLine: 'remove' },
  // Config sources STEP 4 (2026-11-17, STEPS-2-4-PLAN §5): Terraform — `.tf` files kept from Git, state read as EVIDENCE through the
  // read-only service (`live-read`), or supplied.
  [canonicalProtocolName('terraform-iac')]: { lane: 'change', contractKey: 'terraform-iac', noBlock: 'forced', descriptorWithoutServiceLine: 'remove' },
  // Config sources STEP 3 (2026-11-21, slice P1): observability — the collector and nginx files kept from Git (`git-file`) or from
  // the read-only service (`service-held`), the served file read as evidence (`live-read`). `runs-undeclared`: a leg with no block
  // behaves as it does today. ⚠️ THE ROW AND THAT RULE ARE ONE EDIT: this row with `noBlock: 'forced'` would turn 74 of the 79
  // stored observability legs into `snapshot-absent` and forced once the text ships (measured by the P0 red control).
  // INERT until observability-config 1.12.0 removes it from CONFIG_SOURCE_AWAITING_TEXT.
  // `descriptorWithoutServiceLine: 'keep'` (slice P4): a Git-only observability block still leaves the leg reading its read-only
  // service for targets and rules, so the Architect's descriptor URL stands. ⚠️ THIS VALUE AND THE JOIN ARE ONE RULE: with `remove`
  // here, taking the row off the awaiting list deletes the descriptor of every Git-only observability leg (register
  // CONFIG-SOURCES-OBS-JOIN-PRECONDITIONS item 3).
  [canonicalProtocolName('observability-config')]: { lane: 'change', contractKey: 'observability-config', noBlock: 'runs-undeclared', descriptorWithoutServiceLine: 'keep' },
});
/** Rows whose protocol TEXT does not carry the `## Config sources` section yet (the HELD_JOIN_AWAITING_TEXT pattern): the row exists
 *  so the code can ship first, and every consumer treats the protocol as NOT a Config-sources protocol until its text commit removes it
 *  from this list. kubernetes-gitops left at 1.19.0; terraform-iac left at 1.17.0 (Config sources STEP 4); observability-config
 *  leaves at 1.12.0 (STEP 3 — the join). */
export const CONFIG_SOURCE_AWAITING_TEXT: readonly string[] = Object.freeze([canonicalProtocolName('observability-config')]);
/** The protocols whose legs declare a `## Config sources` block for a given awaiting list (the table minus the rows awaiting their
 *  text). EVERY reader of the awaiting list takes it as a DEFAULTED parameter (plan W5): production passes nothing and gets the
 *  shipped list; the tests, the corpus replay and the lab pass `[]` to ask "as if every row's text had shipped" through the SAME
 *  functions — never through a second copy of a rule. */
export function configSourceProtocolsFor(awaiting: readonly string[] = CONFIG_SOURCE_AWAITING_TEXT): readonly string[] {
  return Object.keys(CONFIG_SOURCE_LANES).filter((p) => !awaiting.includes(p));
}
/** The protocols whose legs declare a `## Config sources` block TODAY (the table minus the rows awaiting their text). */
export const CONFIG_SOURCE_PROTOCOLS: readonly string[] = Object.freeze(configSourceProtocolsFor());

/** Exhaustiveness guard (LL-CS-05): a new lane added to `ConfigSourceLane` fails to compile at every switch that uses it. */
export function assertNeverConfigLane(lane: never): never {
  throw new Error(`config-source lane not handled: ${String(lane)}`);
}
/** The same guard for the no-block column. */
export function assertNeverConfigNoBlock(v: never): never {
  throw new Error(`config-source no-block rule not handled: ${String(v)}`);
}

/** The same guard for the descriptor-without-a-service-line column. */
export function assertNeverConfigDescriptorRule(v: never): never {
  throw new Error(`config-source descriptor rule not handled: ${String(v)}`);
}
/** Slice P4 — THE ONE reader of the `descriptorWithoutServiceLine` column (short token or long name). Null for a protocol with no row:
 *  the caller has no Config lane to derive from. Exhaustive over the column, so a third value fails to compile here. */
export function descriptorWithoutServiceLineOf(protocol: string | null | undefined): ConfigDescriptorWithoutServiceLine | null {
  if (!protocol) return null;
  const row = CONFIG_SOURCE_LANES[canonicalProtocolName(protocol)];
  if (!row) return null;
  switch (row.descriptorWithoutServiceLine) {
    case 'keep': return 'keep';
    case 'remove': return 'remove';
    default: return assertNeverConfigDescriptorRule(row.descriptorWithoutServiceLine);
  }
}

/** Does this protocol's no-block rule say `runs-undeclared` (short token or long name; false for null, empty, or a protocol with no
 *  row)? Exhaustive over the no-block column. */
export function protocolRunsUndeclared(protocol: string | null | undefined): boolean {
  if (!protocol) return false;
  const row = CONFIG_SOURCE_LANES[canonicalProtocolName(protocol)];
  if (!row) return false;
  switch (row.noBlock) {
    case 'forced': return false;
    case 'runs-undeclared': return true;
    default: return assertNeverConfigNoBlock(row.noBlock);
  }
}
/** STEP 3 P3 (architectural F5) — THE ONE TEST for "a leg of a `runs-undeclared` protocol that declares NOTHING" (observability with
 *  no block: it runs exactly as it did before the protocol had a Config lane). `declarationState` is the leg's governing
 *  declaration state. The no-block arm of `configSourceReads` and the `liveEvidence` hoist both ask this; neither spells it. */
export function isUndeclaredRunsLeg(protocol: string | null | undefined, declarationState: string): boolean {
  return declarationState === 'not-config-source-leg' && protocolRunsUndeclared(protocol);
}

/** The Config-sources lane of a protocol, or null when it declares none today (not in the table, or awaiting its text). */
export function configSourceLaneOf(protocol: string | null | undefined, awaiting: readonly string[] = CONFIG_SOURCE_AWAITING_TEXT): ConfigSourceLane | null {
  if (!protocol) return null;
  const p = canonicalProtocolName(protocol);
  return configSourceProtocolsFor(awaiting).includes(p) ? CONFIG_SOURCE_LANES[p].lane : null;
}

/** The leg's key under `interfaceContract.configSources` (null when its protocol declares no Config sources today). */
export function configSourceContractKeyOf(protocol: string | null | undefined, awaiting: readonly string[] = CONFIG_SOURCE_AWAITING_TEXT): string | null {
  if (!protocol) return null;
  const p = canonicalProtocolName(protocol);
  return configSourceProtocolsFor(awaiting).includes(p) ? CONFIG_SOURCE_LANES[p].contractKey : null;
}

/** k8s value-lane P1 (2026-11-20): the Config-sources lane of a LEG today, or null — the ONE leg-level classifier (mirrors
 *  `deviceSourceLaneOfLeg`). `legProtocolHasConfigLane`, the resolution's `configSourceProtocol` and the carrier's force all go
 *  through it. It answers for the leg's PROTOCOL: whether THIS leg is a declared leg is `governingConfigSources`' answer (a
 *  `runs-undeclared` leg with no block reads `not-config-source-leg` there). */
export function configSourceLaneOfLeg(leg: { title?: string | null; metadata?: unknown }, awaiting: readonly string[] = CONFIG_SOURCE_AWAITING_TEXT): ConfigSourceLane | null {
  return configSourceLaneOf(resolveTaskProtocol(leg).protocol, awaiting);
}
/** Does this leg's PROTOCOL have a Config lane today (its row is in the table and its text has shipped)? Renamed from
 *  `isConfigSourceLeg` (STEP 3 P1, plan W5): for a `runs-undeclared` protocol a leg of it is NOT thereby a declared leg. */
export function legProtocolHasConfigLane(leg: { title?: string | null; metadata?: unknown }, awaiting: readonly string[] = CONFIG_SOURCE_AWAITING_TEXT): boolean {
  return configSourceLaneOfLeg(leg, awaiting) !== null;
}
/** The Config-sources marker, spread into an owning-leg resolution: present ⇔ the leg's PROTOCOL has a Config lane today (not:
 *  "this leg declared a block" — plan W5 row 2). `{}` on every other leg, so every existing resolution keeps its exact shape (and
 *  the field is absent on every leg of a row still awaiting its text). */
function configSourceField(leg: { title?: string | null; metadata?: unknown }, awaiting: readonly string[] = CONFIG_SOURCE_AWAITING_TEXT): { configSourceProtocol?: string } {
  const p = resolveTaskProtocol(leg).protocol;
  return p && legHasConfigDeclarationToGovern(leg, awaiting) ? { configSourceProtocol: canonicalProtocolName(p) } : {};
}

/** STEP 3 P2 (plan §13 A7 — the rollback hole): must this leg's Config-sources declaration be READ and governed? Yes when its
 *  protocol has a Config lane today (the text has shipped) — and ALSO when its protocol is `runs-undeclared`, its row AWAITS its text
 *  and the leg carries a snapshot object. That second case is a leg that DECLARED sources (a snapshot was taken) and whose protocol
 *  text is no longer live — a revert. Left off the lane, capture would be unscoped and the served files would be held as bases
 *  beside the leg's earlier Git refs. So the declaration is read, `governingConfigSources` answers `snapshot-text-reverted`, capture
 *  holds nothing and the carrier forces by that name. A `forced` protocol's awaiting row is unchanged (existing behaviour, outside
 *  this step — a register candidate, plan A7 "scope limit"). */
export function legHasConfigDeclarationToGovern(leg: { title?: string | null; metadata?: unknown }, awaiting: readonly string[] = CONFIG_SOURCE_AWAITING_TEXT): boolean {
  if (configSourceLaneOfLeg(leg, awaiting) !== null) return true;
  const p = resolveTaskProtocol(leg).protocol;
  const row = p ? CONFIG_SOURCE_LANES[canonicalProtocolName(p)] : undefined;
  if (!row) return false;
  switch (row.noBlock) {
    case 'forced': return false;
    case 'runs-undeclared': return hasConfigSourcesSnapshotObject(leg.metadata);
    default: return assertNeverConfigNoBlock(row.noBlock);
  }
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
      /** VALUE-LEG-GIT: present ONLY on a value-lane Device-sources leg (`'value'`); absent ⇒ the change lane */ deviceSourceLane?: 'value';
      /** Config sources STEP 2: present ⇔ the leg declares Config sources today — its protocol (canonical long name); its lane: `configSourceLaneOfResolution` */ configSourceProtocol?: string }
  | { kind: 'leg'; legId: string; heldCapable: boolean; /** the LEAF's own stage, read here (the step's binding check) */ ownStageId: string;
      /** held-k8s 1b-scope: the leg may read a Git file source; absent ⇒ false */ gitFileSource?: boolean;
      /** held-network step 3 batch 2b: the leg declares Device sources; absent ⇒ false */ deviceSource?: boolean;
      /** VALUE-LEG-GIT: present ONLY on a value-lane Device-sources leg (`'value'`); absent ⇒ the change lane */ deviceSourceLane?: 'value';
      /** Config sources STEP 2: present ⇔ the leg declares Config sources today — its protocol (canonical long name); its lane: `configSourceLaneOfResolution` */ configSourceProtocol?: string }
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
  /** The Config-sources awaiting list — DEFAULTED; production passes nothing (plan W5: tests and the corpus replay pass `[]`). */
  awaiting: readonly string[] = CONFIG_SOURCE_AWAITING_TEXT,
): Promise<OwningLegResolution> {
  if (task.type === 'PIPELINE') return { kind: 'self', legId: task.id, heldCapable: isHeldCapableLeg(task), gitFileSource: isGitFileSourceLeg(task, awaiting), deviceSource: isDeviceSourceLeg(task), ...valueLaneField(task), ...configSourceField(task, awaiting) };
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
    return { kind: 'leg', legId, heldCapable: isHeldCapableLeg(leg), ownStageId: own.stageId, gitFileSource: isGitFileSourceLeg(leg, awaiting), deviceSource: isDeviceSourceLeg(leg), ...valueLaneField(leg), ...configSourceField(leg, awaiting) };
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

/** k8s value-lane P1 (2026-11-20): the Config-sources lane an owning-leg RESOLUTION carries, or null. DERIVED from
 *  `configSourceProtocol` — never a stored field, so a hand-built resolution (the carrier's, the lab arm's) cannot lack it. Reads the
 *  FULL table: the protocol's presence on the resolution already means "declares Config sources today" (`configSourceField`), and
 *  the lab arm sets it on purpose for a row still awaiting its text. */
export function configSourceLaneOfResolution(owningLeg: OwningLegResolution | null | undefined): ConfigSourceLane | null {
  if (!owningLeg || (owningLeg.kind !== 'self' && owningLeg.kind !== 'leg') || !owningLeg.configSourceProtocol) return null;
  return CONFIG_SOURCE_LANES[canonicalProtocolName(owningLeg.configSourceProtocol)]?.lane ?? null;
}

/** k8s value-lane P1: does held capture take this leg's Config-sources declaration as its Git scope? Exhaustive over the lane
 *  (LL-CS-05) — a new lane fails to compile here until it is answered. */
export function heldCaptureTakesConfigScope(owningLeg: OwningLegResolution | null | undefined): boolean {
  const lane = configSourceLaneOfResolution(owningLeg);
  if (lane === null) return false;
  switch (lane) {
    case 'change': return true;
    default: return assertNeverConfigLane(lane);
  }
}

/**
 * STEP 3 P2 (plan W1) — THE ONE answer to "what does held capture take from this leg": the Git-lane switch, the Config scope and
 * the protocol the scope belongs to, TOGETHER. Its production callers are the capture call in execution-core.ts and the rescue's
 * (execution-completion-anchored.ts); the capture replay (scripts/replay-held-capture.ts) calls it too. The leg replay lab's held
 * store does NOT yet — it still asks the metadata twin (`isGitFileSourceLeg`) and passes a scope without its protocol (which
 * capture judges as the STRICTEST protocol since STEP 3 P3: no served file is held under such a scope); it must
 * call this helper before any observability lab cell is built (a P3 condition, STEP3-P2-BUILD.md "Review fixes" group B).
 *
 * THE RULE (one wording):
 *   - No resolved leg (`no-leg`, `could-not-check`, or a PIPELINE task's own persist, for which the core resolves none): nothing —
 *     the Git lane off, no scope. (A failed owning-leg read is therefore today's non-variant path: plan §13 A8, recorded, not changed.)
 *   - The Config scope is the leg's governing declaration when the lane takes one (`heldCaptureTakesConfigScope`), else null.
 *   - The Git lane, for a protocol whose row is `forced` and for every protocol with no Config row: BY NAME, as before
 *     (`owningLeg.gitFileSource`).
 *   - The Git lane, for a `runs-undeclared` protocol: ON only when a Config scope is passed and its state is not
 *     `not-config-source-leg`. So a leg that declares nothing reads no Git lane at all (today's behaviour), and a declaration that is
 *     NOT `parsed` — a missing, unreadable, changed or text-reverted snapshot, a failed leg-row read — has the lane ON and every Git
 *     file refused by name.
 */
export function captureScopesFor<S extends { state: string }>(
  owningLeg: OwningLegResolution | null | undefined, legConfigSources: S | null | undefined,
): { gitFileSourceLeg: boolean; configSources: S | null; configSourceProtocol: string | null } {
  if (!owningLeg || (owningLeg.kind !== 'self' && owningLeg.kind !== 'leg')) return { gitFileSourceLeg: false, configSources: null, configSourceProtocol: null };
  const configSources = legConfigSources && heldCaptureTakesConfigScope(owningLeg) ? legConfigSources : null;
  const protocol = owningLeg.configSourceProtocol ? canonicalProtocolName(owningLeg.configSourceProtocol) : null;
  const row = protocol ? CONFIG_SOURCE_LANES[protocol] : undefined;
  let gitFileSourceLeg = owningLeg.gitFileSource === true;
  if (row) {
    switch (row.noBlock) {
      case 'forced': break;
      case 'runs-undeclared': gitFileSourceLeg = configSources !== null && configSources.state !== 'not-config-source-leg'; break;
      default: return assertNeverConfigNoBlock(row.noBlock);
    }
  }
  return { gitFileSourceLeg, configSources, configSourceProtocol: configSources ? protocol : null };
}

/** k8s value-lane P1: does the held-edit carrier apply the Config-sources forces (the D-1 force, the declaration-state force) to
 *  this leg? Exhaustive over the lane. */
export function carrierAppliesConfigForce(leg: { title?: string | null; metadata?: unknown }, awaiting: readonly string[] = CONFIG_SOURCE_AWAITING_TEXT): boolean {
  const lane = configSourceLaneOfLeg(leg, awaiting);
  // STEP 3 P2 (plan §13 A7): a `runs-undeclared` leg carrying a snapshot while its row awaits its text is governed too — the carrier
  // reads its declaration (`snapshot-text-reverted`) and forces by that name. The lane of the FULL table decides how.
  if (lane === null) {
    if (!legHasConfigDeclarationToGovern(leg, awaiting)) return false;
    const p = resolveTaskProtocol(leg).protocol;
    const full = p ? CONFIG_SOURCE_LANES[canonicalProtocolName(p)]?.lane ?? null : null;
    if (full === null) return false;
    switch (full) {
      case 'change': return true;
      default: return assertNeverConfigLane(full);
    }
  }
  switch (lane) {
    case 'change': return true;
    default: return assertNeverConfigLane(lane);
  }
}

/** k8s value-lane P1: may the platform make its Git-vs-live drift calls for this leg's lane? Exhaustive over the lane. WHICH
 *  method a protocol has, or none, stays the method table's answer (git-live-drift.ts `GIT_LIVE_DRIFT_METHODS`). */
export function platformDriftAppliesToLane(owningLeg: OwningLegResolution | null | undefined): boolean {
  const lane = configSourceLaneOfResolution(owningLeg);
  if (lane === null) return false;
  switch (lane) {
    case 'change': return true;
    default: return assertNeverConfigLane(lane);
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
