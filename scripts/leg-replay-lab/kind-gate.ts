/**
 * Leg replay lab — L-CS-N per-arm KIND GATE (Config sources network step; DESIGN v2 §1.2 / §3.4, audit F15, model-evaluation S3).
 *
 * Push 1a parses the grammar-v2 kind `live-read` only while the static gate `LIVE_READ_KIND_ENABLED` is true, and that constant flips
 * with the network TEXT commit (network-provisioning 1.26.0). The lab runs the 1.25.0 base arm and the 1.26.0 candidate arm on the SAME
 * 1a tree, so the gate is bound PER ARM through the lab-only override `__setLiveReadKindForLab` (pinned by test:device-sources LR7:
 * callable only from `scripts/leg-replay-lab/` and `scripts/test-*`):
 *
 *   variants.<arm>.liveReadKind: 'open'   — the candidate: a planted `live-read` line parses, capture moves the device to
 *                                           `live-read-evidence-only`, the facts see it as declared evidence.
 *   variants.<arm>.liveReadKind: 'closed' — the base: `live-read` is `unknown-kind` exactly as production 1.25.0 reads it.
 *   unset                                 — the tree's constant (no override). Since 1.26.0 merged (2026-11-05) the constant is TRUE,
 *                                           so an unset arm parses `live-read`; a block with no `live-read` line (every experiment
 *                                           written before this lever) resolves byte-identically either way.
 *
 * The gate is MODULE STATE (the parser is pure and reads it), so two arms with different gates must never interleave: `run()` groups
 * samples by gate (beside the L-Z2 check-data groups) and binds the gate around each group; `prepare` binds it at the top of every
 * per-arm loop. `withArmKindGate` restores the previous override on exit, so a throw never leaks an open gate into the next arm.
 *
 * DRY-RUN REFUSAL (S3): on an OPEN arm, a cell whose declaration or brief carries a `live-read` line must resolve `parsed` with at
 * least one `live-read` entry — through the SHIPPING grammar (`resolveLegDeviceSources` for the leg; `parseDeviceSourcesBlock` for the
 * child brief the input edit writes). A block that resolves `unparseable` (or carries no `live-read` entry) would measure the
 * candidate text against a declaration production would refuse, so the dry run stops. A CLOSED arm carrying a `live-read` line is
 * reported (`closedArmUnknownKind: true`), never refused: that IS the 1.25.0 reading.
 */
import { __setLiveReadKindForLab, liveReadKindEnabled, resolveLegDeviceSources, contractDeviceSourcesValue, parseDeviceSourcesBlock } from '../../lib/agents/harness/device-sources';
import type { Snapshot } from './snapshot';

export type ArmKindGate = 'open' | 'closed';
export const LIVE_READ_LINE_RE = /^[ \t]*(?:[-*][ \t]+)?`?[^\s:`]+:[ ]live-read\b/m;

/** The arm's declared gate (null ⇒ the tree's constant, no override). Anything else is refused by name. */
export function armKindGate(spec: { liveReadKind?: unknown } | undefined, arm: string): ArmKindGate | null {
  const g = spec?.liveReadKind;
  if (g === undefined || g === null) return null;
  if (g !== 'open' && g !== 'closed') throw new Error(`variant ${arm}: liveReadKind must be 'open' or 'closed' (got ${JSON.stringify(g)})`);
  return g;
}

/** The override this module last set (null ⇒ none). Every set goes through `set()` so `withArmKindGate` can restore it. */
let lastSet: boolean | null = null;
function set(on: boolean | null): void { lastSet = on; __setLiveReadKindForLab(on); }
const toFlag = (g: ArmKindGate | null): boolean | null => (g === null ? null : g === 'open');

/** Bind the gate for the duration of `fn` (sync or async) and restore the PREVIOUS override after, even on a throw. */
export async function withArmKindGate<T>(gate: ArmKindGate | null, fn: () => Promise<T> | T): Promise<T> {
  const before = lastSet;
  set(toFlag(gate));
  try { return await fn(); } finally { set(before); }
}
/** Set the gate with no scope (the per-arm loops in prepare); `resetKindGate()` after prepare. */
export function bindKindGate(gate: ArmKindGate | null): void { set(toFlag(gate)); }
export function resetKindGate(): void { set(null); }

export interface KindGateCheck {
  gate: ArmKindGate | null;
  effectiveOpen: boolean;
  leg: { liveReadLine: boolean; state: string; liveReadEntries: number; problem?: string | null } | null;
  brief: { liveReadLine: boolean; state: string; liveReadEntries: number; problem?: string | null } | null;
  closedArmUnknownKind: boolean;
  refusal: string | null;
}

function legDeclaration(snap: Snapshot): { description: string | null; contract: unknown } | null {
  const leg = snap.leg as Record<string, any> | null;
  if (!leg) return null;
  const ic = typeof leg.inputContext === 'string' ? (() => { try { return JSON.parse(leg.inputContext); } catch { return null; } })() : leg.inputContext;
  return { description: (leg.description as string | null) ?? null, contract: ic?.interfaceContract ?? null };
}

/** S3: read the cell's declaration (leg) and the child brief (the node's subject task — the Harvester's or Author's) under the gate the
 *  arm binds, through the shipping grammar. Call it with the arm's gate bound. */
export function kindGateCheck(snap: Snapshot, gate: ArmKindGate | null, cell: string): KindGateCheck {
  const effectiveOpen = liveReadKindEnabled();
  const decl = legDeclaration(snap);
  const legText = `${decl?.description ?? ''}\n${JSON.stringify(contractDeviceSourcesValue(decl?.contract) ?? '')}`;
  const legHas = LIVE_READ_LINE_RE.test(legText) || /: live-read — /.test(legText);
  let leg: KindGateCheck['leg'] = null;
  if (decl) {
    const r = resolveLegDeviceSources({ contractValue: contractDeviceSourcesValue(decl.contract), taskBody: decl.description });
    leg = { liveReadLine: legHas, state: r.state, liveReadEntries: r.state === 'parsed' ? r.entries.filter((e) => e.kind === 'live-read').length : 0,
      problem: r.state === 'unparseable' ? r.problem : null };
  }
  const briefText = (snap.author?.task?.description as string | null) ?? null;
  const briefHas = !!briefText && LIVE_READ_LINE_RE.test(briefText);
  let brief: KindGateCheck['brief'] = null;
  if (briefText) {
    const p = parseDeviceSourcesBlock(briefText);
    brief = { liveReadLine: briefHas, state: p.state, liveReadEntries: p.state === 'parsed' ? p.entries.filter((e) => e.kind === 'live-read').length : 0,
      problem: p.state === 'unparseable' ? p.problem : null };
  }
  let refusal: string | null = null;
  if (effectiveOpen) {
    if (leg?.liveReadLine && (leg.state !== 'parsed' || leg.liveReadEntries === 0)) refusal = `${cell}: kind gate OPEN, but the leg's planted declaration resolves ${leg.state}${leg.problem ? ` (${leg.problem})` : ''} with ${leg.liveReadEntries} live-read entr(y/ies) — production 1.26.0 would not read this block as declared (S3)`;
    else if (brief?.liveReadLine && (brief.state !== 'parsed' || brief.liveReadEntries === 0)) refusal = `${cell}: kind gate OPEN, but the brief's Device sources block resolves ${brief.state}${brief.problem ? ` (${brief.problem})` : ''} with ${brief.liveReadEntries} live-read entr(y/ies) (S3)`;
  }
  return { gate, effectiveOpen, leg, brief, closedArmUnknownKind: !effectiveOpen && (!!leg?.liveReadLine || !!brief?.liveReadLine), refusal };
}
