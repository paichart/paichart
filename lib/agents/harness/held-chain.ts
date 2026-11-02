/**
 * PLATFORM-HELD-BYTES Stage B V-6 — the held fields a chained entry carries (plan STAGE-B-PLAN.md v4.1 §3 V-6; §0.1 A1, A3, A5;
 * boundary BV3-2, DB NOTE-d). Called by the chainer for ONE dependency, and ONLY when that dependency's selected result.json
 * already carries a variant stamp (`heldBytes` on a Harvester, `editApplication` on an Author) — stamps that exist only on
 * variant legs — so a non-variant chain makes NO new read and every entry is byte-identical. NEVER throws (a failure is a
 * named state on the field, never a chain error).
 *
 *   Harvester → Author     `heldView`: one item per handle (`assignHandles` over the execution's CAPTURE refs + refusals —
 *                          the manifest's order); POINTERS (refId, harvesterExecutionId, r9Version, viewVersion) + the view
 *                          text; no baseSha256. Views are WRITTEN only in `writeViews` mode (prepare), READ otherwise; a demo
 *                          POV is `demo-pov` before any read. Budgets: a view ≤ 64 KB; ≤ 256 KB of view text per chain,
 *                          decided in handle order BEFORE the spread (over ⇒ `view-over-budget`).
 *   Harvester → Architect  `heldIndex`: handle, path, line count. Never the file.
 *   Author → Reviewer      `editDiff`: RECOMPUTED server-side — the Author's manifest gives each file's BASE ref; each is
 *                          verified (kind BASE, the Author execution, the leg's POV and leg); views READ by full key; the pure
 *                          applier re-runs over the persisted finalResponse; the recomputed candidate digest must equal the
 *                          stamped one (else `diff-recompute-mismatch`); the diff text ≤ 64 KB (else `diff-over-budget`).
 *                          A manifest record with no baseRefId (a rolled-back package, A3) ⇒ `base-not-held`.
 */
import { assignHandles, orderHeldObjects, type HandleObject } from './held-bytes/handles';
import type { HeldViewItem } from './held-bytes/entries';
import { computeEditApplication, type HeldFileInput } from './held-bytes/apply';
import { renderEditDiff } from './held-bytes/diff';
import { candidateSetDigest8 } from './held-bytes/edit-fact';
import { EDIT_APPLICATION_MANIFEST_NAME } from './held-bytes/edit-manifest';
import { r9VersionInEffect } from './sanitize-chained-output';
import { resolveOwningLegProtocol, type OwningLegResolution } from './held-bytes/variant';
import { heldPackageOutOfScope } from './held-bytes/scope';
import { HELD_REF_SELECT, readHeldView, readHeldBlobText } from '../../services/held-bytes-store';
import { resolveHeldView, isDemoPovMetadata } from '../../services/held-bytes-views';

export const HELD_VIEW_MAX_CHARS = 64 * 1024;
export const HELD_CHAIN_BUDGET_CHARS = 256 * 1024;
export const HELD_DIFF_MAX_CHARS = 64 * 1024;
const AUTHOR_ROLE = 'config_change_author';
const ARCHITECT_ROLE = 'infra_change_architect';
const REVIEWER_ROLE = 'change_reviewer';

export interface HeldConsumer { role: string | null; povId: string | null; demoPov: boolean; leg: OwningLegResolution }
/** Mutable across one chain: the view budget is spent in handle order across entries. */
export interface HeldChainState { budgetUsed: number; consumer?: HeldConsumer | null }

type Db = any;

async function consumerOf(db: Db, taskId: string, state: HeldChainState): Promise<HeldConsumer | null> {
  if (state.consumer !== undefined) return state.consumer;
  const t = await db.task.findUnique({ where: { id: taskId }, select: { id: true, type: true, agentRole: true, povId: true, metadata: true, title: true } });
  if (!t) { state.consumer = null; return null; }
  const pov = t.povId ? await db.pOV.findUnique({ where: { id: t.povId }, select: { metadata: true } }) : null;
  const leg = await resolveOwningLegProtocol(db, t);
  state.consumer = { role: t.agentRole ?? null, povId: t.povId ?? null, demoPov: isDemoPovMetadata(pov?.metadata), leg };
  return state.consumer;
}

export async function heldEntryFields(db: Db, input: {
  consumerTaskId: string;
  depExecutionId: string;
  parsed: Record<string, unknown>;
  writeViews: boolean;
  state: HeldChainState;
}): Promise<Record<string, unknown>> {
  const { parsed } = input;
  const harvester = !!parsed.heldBytes && typeof parsed.heldBytes === 'object';
  const author = !!parsed.editApplication && typeof parsed.editApplication === 'object';
  if (!harvester && !author) return {};
  // BC-N3 (G3 entry, 2026-10-16): the catch below is ROLE-AWARE. A throw before the consumer resolved (or on a consumer that is
  // not a variant leaf) emits NOTHING — a held state must never reach a consumer whose variant status was never established (that
  // broke non-variant §6 byte-identity on a double fault). A resolved variant consumer gets the field for ITS role: the Author a
  // `view-unavailable` item, the Architect a `view-unavailable` index row, the Reviewer `could-not-check`. Each still fails closed.
  let c: HeldConsumer | null = null;
  try {
    c = await consumerOf(db, input.consumerTaskId, input.state);
    if (!c || !c.leg.heldCapable) return {};
    if (harvester && (c.role === AUTHOR_ROLE || c.role === ARCHITECT_ROLE)) return await harvesterFields(db, c, input);
    if (author && c.role === REVIEWER_ROLE) return { editDiff: await recomputeEditDiff(db, c, input.depExecutionId, parsed) };
    return {};
  } catch {
    return heldFailureFields(c, { harvester, author, depExecutionId: input.depExecutionId });
  }
}

/** BC-N3: the field a held-chain failure leaves, by the RESOLVED consumer's role; `{}` when the consumer never resolved. PURE. */
export function heldFailureFields(c: Pick<HeldConsumer, 'role' | 'leg'> | null, d: { harvester: boolean; author: boolean; depExecutionId: string }): Record<string, unknown> {
  if (!c || !c.leg.heldCapable) return {};
  if (d.harvester && c.role === AUTHOR_ROLE) return { heldView: [{ handle: 'H1', path: '', state: 'view-unavailable' }] };
  if (d.harvester && c.role === ARCHITECT_ROLE) return { heldIndex: [{ handle: 'H1', path: '', state: 'view-unavailable' }] };
  if (d.author && c.role === REVIEWER_ROLE) return { editDiff: { state: 'could-not-check', authorExecutionId: d.depExecutionId } };
  return {};
}

/**
 * PC-P2-3 (G3 entry, 2026-10-16): the named state when a variant Harvester held NO file at all — no capture ref and no capture
 * refusal for that execution — read off its own `heldBytes` stamp. Plan V-6: "always — a named state when unavailable"; before
 * this the consumer got an empty `heldView`/`heldIndex`, which renders NOTHING, so an Author told "each held file is shown to you
 * once" saw neither a file nor a reason. PURE. Closed set: `capture-off` (the capture switch was off) · `no-files` (no as-deployed
 * file was read) · `no-capture` (the step did not run — the net's own fallback) · `capture-rolled-back` (the capture batch rolled
 * back to its savepoint) · `no-held-refs` (anything else: a stamp claiming files, none found in this scope).
 */
export function heldNoneState(heldBytes: unknown): string {
  const hb = (heldBytes && typeof heldBytes === 'object' ? heldBytes : {}) as Record<string, unknown>;
  if (hb.reason === 'capture-off' || hb.reason === 'no-files' || hb.reason === 'no-capture') return hb.reason;
  if (hb.refWrite === 'rolled-back') return 'capture-rolled-back';
  return 'no-held-refs';
}

async function harvesterFields(db: Db, c: HeldConsumer, input: { depExecutionId: string; writeViews: boolean; state: HeldChainState; parsed: Record<string, unknown> }): Promise<Record<string, unknown>> {
  const refs = await db.heldFileRef.findMany({ where: { executionId: input.depExecutionId, kind: 'CAPTURE', scope: c.povId ?? '' }, select: HELD_REF_SELECT });
  const refusals = await db.heldCaptureRefusal.findMany({ where: { executionId: input.depExecutionId }, select: { toolCallIndex: true, selector: true, target: true, path: true, refusal: true } });
  // PC-P2-3: nothing held at all ⇒ ONE named state for either consumer (an empty list renders nothing).
  if (refs.length === 0 && refusals.length === 0) return { heldNone: { state: heldNoneState(input.parsed.heldBytes) } };
  const handles = harvesterHandles(refs, refusals);
  // F-N2-1 (b): only handleless refusals (evidence kept, nothing held) ⇒ the same ONE named state, never an empty list.
  if (handles.length === 0) return { heldNone: { state: heldNoneState(input.parsed.heldBytes) } };
  if (c.role === ARCHITECT_ROLE) return heldIndexEntryFields(handles, refs);
  const r9Version = r9VersionInEffect();
  return heldViewEntryFields(handles, refs, (ref) => resolveHeldView(db, { scope: ref.scope, blobSha256: ref.blobSha256 }, { writeViews: input.writeViews, demoPov: false, r9Version }),
    { demoPov: c.demoPov, depExecutionId: input.depExecutionId, state: input.state });
}

// ── The PURE entry builders (plan §4 L-3 / L-4 / L-8b): the chainer above and the leg replay lab render the same fields
// through these, the lab resolving views and bases in memory (L-1) instead of from the store. ───────────────────────────

/** A held CAPTURE ref as the builders read it (a subset of HELD_REF_SELECT). */
export interface HeldCaptureRefLike { id: string; scope: string; blobSha256: string; toolCallIndex: number | null; selector: string | null; target: string | null; path: string | null; lineCount: number | null }
export interface HeldRefusalLike { toolCallIndex: number; selector: string | null; target: string | null; path: string | null;
  /** The capture refusal's name (F-N2-1 (b): a HANDLELESS_CAPTURE_REFUSALS member gets no handle). Absent ⇒ a handle, as before. */
  refusal?: string | null }
export type HeldViewResolution = { state: 'rendered'; view: { viewText: string; lineCount: number; r9Version: string; viewVersion: string; rewrittenLines: number[] } } | { state: string };

/** Handles over one Harvester execution's CAPTURE refs + capture refusals — the manifest's order. */
export function harvesterHandles(refs: readonly HeldCaptureRefLike[], refusals: readonly HeldRefusalLike[]) {
  const objs: Array<HandleObject & { handleless?: boolean }> = [
    ...refs.map((r) => ({ toolCallIndex: r.toolCallIndex as number, selector: r.selector, target: r.target, path: r.path, held: true, blobSha256: r.blobSha256, refId: r.id })),
    ...refusals.map((r) => ({ toolCallIndex: r.toolCallIndex, selector: r.selector, target: r.target, path: r.path, held: false,
      handleless: typeof r.refusal === 'string' && HANDLELESS_CAPTURE_REFUSALS.has(r.refusal) })),
  ];
  // F-N2-1 (b): a handleless refusal still CONSUMES its number (the numbering never shifts — handles.ts), it just gets no handle. It
  // carries no identity (target/path null), so `assignHandles` makes it its own handle at its own index in the order; drop exactly that.
  // An identity-bearing refusal is never dropped here (it could share a pair with a held capture).
  const dropped = new Set(orderHeldObjects(objs).flatMap((o, i) => (o.handleless === true && o.target === null && o.path === null ? [i] : [])));
  return assignHandles(objs).filter((h) => !dropped.has(h.handleIndex));
}

/**
 * F-N2-1 (b) (owner 2026-10-26, held-network L-N2 ADDENDUM (b)) — capture refusals that get NO handle: the Author is not shown them as a
 * held item and cannot name them; the Architect's heldIndex does not list them. ONE member, by design:
 *   - `device-read-evidence-only` — the running config of a device whose declared Git file is the base of record (D-1). It is EVIDENCE:
 *     the device facts (`gitDeviceComparison`, `deviceSourceReads`) read the extractor's own result, and the device's base is the Git
 *     file under ITS handle (or, when that file is not held, the carrier forces `git-file-not-held`). As an `unheld` item it told the
 *     Author a second, uneditable file of the same device existed (B-L2: `H2 — · not shown (unheld)`).
 * Every OTHER refusal keeps its handle, because it marks a file the Author would otherwise expect to find and must be told is NOT
 * held: `source-not-pinned` (A-NL3: the held device comes first, nothing packaged for it), `git-file-not-declared`, `secret-manifest`,
 * `credentials-file` / `state-file` / `tfvars-file`, `echo-secret-residual`, `device-config-empty`, the descriptor/path refusals. Hiding
 * one of them would turn "this file is not held" into silence, and an Author that then retypes the file whole falls back to the pre-held
 * behaviour unseen. Adding a member is a decision, never a sweep.
 */
export const HANDLELESS_CAPTURE_REFUSALS: ReadonlySet<string> = new Set(['device-read-evidence-only']);

/** Harvester → Architect: handles, paths, line counts. Never the file. */
export function heldIndexEntryFields(handles: ReturnType<typeof harvesterHandles>, refs: readonly HeldCaptureRefLike[]): Record<string, unknown> {
  const refById = new Map(refs.map((r) => [r.id, r]));
  return { heldIndex: handles.map((h) => ({ handle: h.handle, path: h.path ?? '', ...(h.refId ? { lineCount: refById.get(h.refId)?.lineCount } : {}),
    ...(h.state !== 'bound' ? { state: h.state } : {}) })) };
}

/** Harvester → Author: one item per handle, budgets decided in handle order BEFORE the spread. */
export async function heldViewEntryFields(handles: ReturnType<typeof harvesterHandles>, refs: readonly HeldCaptureRefLike[],
  resolve: (ref: HeldCaptureRefLike) => Promise<HeldViewResolution>, opts: { demoPov: boolean; depExecutionId: string; state: HeldChainState }): Promise<Record<string, unknown>> {
  const refById = new Map(refs.map((r) => [r.id, r]));
  const items: HeldViewItem[] = [];
  for (const h of handles) {
    const path = h.path ?? '';
    if (opts.demoPov) { items.push({ handle: h.handle, path, state: 'demo-pov' }); continue; }
    if (h.state !== 'bound' || !h.refId || !h.blobSha256) { items.push({ handle: h.handle, path, state: h.state === 'handle-ambiguous' ? 'handle-ambiguous' : 'unheld' }); continue; }
    const ref = refById.get(h.refId)!;
    const v = await resolve(ref);
    if (v.state !== 'rendered' || !('view' in v)) { items.push({ handle: h.handle, path, state: v.state as HeldViewItem['state'] }); continue; }
    const text = v.view.viewText;
    if (text.length > HELD_VIEW_MAX_CHARS || opts.state.budgetUsed + text.length > HELD_CHAIN_BUDGET_CHARS) {
      items.push({ handle: h.handle, path, state: 'view-over-budget' }); continue;
    }
    opts.state.budgetUsed += text.length;
    items.push({ handle: h.handle, path, lineCount: v.view.lineCount, refId: h.refId, harvesterExecutionId: opts.depExecutionId,
      r9Version: v.view.r9Version, viewVersion: v.view.viewVersion, viewText: text, rewrittenLines: v.view.rewrittenLines });
  }
  return { heldView: items };
}

async function recomputeEditDiff(db: Db, c: HeldConsumer, authorExecutionId: string, parsed: Record<string, unknown>): Promise<Record<string, unknown>> {
  const stamped = parsed.editApplication as Record<string, unknown>;
  const base = editDiffBase(authorExecutionId, stamped);
  if (c.demoPov) return { ...base, state: 'demo-pov' };
  const art = await db.agentArtifact.findFirst({ where: { executionId: authorExecutionId, name: EDIT_APPLICATION_MANIFEST_NAME }, select: { content: true }, orderBy: { createdAt: 'desc' } });
  if (!art) return { ...base, state: 'no-manifest' };
  const manifest = JSON.parse(art.content) as { files?: EditDiffManifestRec[]; rollback?: string[] };
  const recs = Array.isArray(manifest.files) ? manifest.files : [];
  if (recs.length === 0 || recs.some((r) => !r.baseRefId)) return { ...base, state: 'base-not-held' };
  const legId = c.leg.kind === 'leg' ? c.leg.legId : null;
  const files: HeldFileInput[] = [];
  for (const r of recs) {
    const ref = await db.heldFileRef.findUnique({ where: { id: r.baseRefId }, select: HELD_REF_SELECT });
    if (!ref || ref.kind !== 'BASE' || ref.executionId !== authorExecutionId || ref.scope !== c.povId || !legId || ref.legTaskId !== legId) return { ...base, state: 'binding-invalid' };
    const view = await readHeldView(db, { scope: ref.scope, baseSha256: ref.blobSha256, r9Version: r.r9Version, viewVersion: r.viewVersion });
    if (!view) return { ...base, state: 'view-not-built' };
    const baseText = await readHeldBlobText(db, ref.scope, ref.blobSha256);
    if (baseText === null) return { ...base, state: 'base-not-held' };
    files.push({ handle: r.handle, path: ref.path, state: 'rendered', baseText, viewText: view.viewText, rewrittenLines: view.rewrittenLines, redactorVersion: ref.redactorVersion });
  }
  return editDiffEntryFields({ authorExecutionId, stamped, files, r9Version: recs[0].r9Version, finalResponse: typeof parsed.finalResponse === 'string' ? parsed.finalResponse : '' });
}

export interface EditDiffManifestRec { handle: string; path: string; baseRefId?: string; r9Version: string; viewVersion: string }

// Phase 10 W5 + panel F3 / audit A-S1: `authorState` = the Author's STAMPED editApplication state, and `authorOutOfScope` = THE
// predicate (held-bytes/scope.ts) over that stamp — the SAME answer the carrier reaches, so the render and the carrier cannot disagree.
const editDiffBase = (authorExecutionId: string, stamped: Record<string, unknown>) =>
  ({ authorExecutionId, ...(typeof stamped.candidateDigest8 === 'string' ? { candidateDigest8: stamped.candidateDigest8 } : {}),
    ...(typeof stamped.state === 'string' ? { authorState: stamped.state } : {}),
    ...(heldPackageOutOfScope(stamped) ? { authorOutOfScope: true } : {}) });

/** Author → Reviewer, PURE: the applier re-run over the Author's text and the verified held files; the recomputed digest must
 *  equal the stamped one; the diff text bounded. The chainer feeds it store-verified files; the lab feeds it L-1's. */
export function editDiffEntryFields(input: { authorExecutionId: string; stamped: Record<string, unknown>; files: HeldFileInput[]; r9Version: string; finalResponse: string }): Record<string, unknown> {
  const { authorExecutionId, stamped, files } = input;
  const base = editDiffBase(authorExecutionId, stamped);
  // BC-N1 (G3 entry, 2026-10-16): plan A1 — an ABSENT stamped digest (an errorFact Author, a stamp the net never built) is
  // `could-not-check`, never a rendered diff: with no digest there is nothing to prove the recompute is the package the Author's
  // stamp describes. (Before: the compare was skipped and the Reviewer was shown a diff + stamped `rendered`.)
  if (typeof stamped.candidateDigest8 !== 'string') return { ...base, state: 'could-not-check' };
  const views: Record<string, string> = {};
  for (const f of files) if (typeof f.viewText === 'string') views[f.handle] = f.viewText;
  const app = computeEditApplication(input.finalResponse, { files, r9Version: input.r9Version });
  const digest = candidateSetDigest8(app, files);
  if (digest !== stamped.candidateDigest8) return { ...base, state: 'diff-recompute-mismatch' };
  const diffText = renderEditDiff(views, app);
  if (diffText.length > HELD_DIFF_MAX_CHARS) return { ...base, state: 'diff-over-budget' };
  // `applied` (PC-P2-1): the applied-edit count, so the render can say "no held-file edit was applied" without parsing the diff.
  return { mode: app.files.some((f) => f.state === 'applied' && f.mode === 'diff-only') ? 'diff-only' : 'replace-file', diffText,
    refused: app.refused, rollback: app.rollback.map((r) => r.handle), authorExecutionId, candidateDigest8: digest, applied: app.applied,
    ...(typeof stamped.state === 'string' ? { authorState: stamped.state } : {}),
    ...(heldPackageOutOfScope(stamped) ? { authorOutOfScope: true } : {}),
    // Panel F3: the files the platform held for this leg — the fact a Reviewer needs to judge a held file changed some other way.
    heldFiles: files.map((f) => ({ handle: f.handle, path: f.path })) };
}
