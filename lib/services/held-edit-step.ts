/**
 * PLATFORM-HELD-BYTES Stage B V-5c — `runEditApplicationStep`: the post-loop step that applies a variant Author's edits
 * (plan STAGE-B-PLAN.md v4.1 §3 V-5c; §0.1 A6). Called by the core after the requirements step and before
 * `onStoringResults`, and by the lab's `live.ts` at the same position (ME S-1). NEVER throws: any error ⇒ `could-not-check`.
 *
 * Scope: `config_change_author`, non-PIPELINE, on a HELD-CAPABLE leg (the core's one `resolveOwningLegProtocol` answer). Every
 * other execution gets `null` and its result.json is byte-identical (the net stamps NOT_STAMPED).
 *
 * Inputs read: `input.task.inputContext` — the PREPARED snapshot (engine and stream both hand the snapshot the prepare
 * wrote; an explicit-inputContext stream override has no `heldView` ⇒ `no-base`). `resolveHeldFiles` is INJECTED: production
 * reads `held_file_refs` + `held_views` + the blob (`resolveHeldFilesFromStore`), the lab resolves in memory from L-1 —
 * same output both ways (pinned).
 *
 * Package-state inputs decided here (precedence 1–6 of `computeEditApplication`):
 *   binding-mismatch / variant-protocol-not-injected  the leaf's own protocolInjection (heldBindingState);
 *   demo-pov                                         an item the chainer refused in a demo POV — before any read;
 *   could-not-check                                  the leg resolution, or the resolver, threw;
 *   handle-namespace-ambiguous                       more than one chained entry carries heldView (V-4 / boundary N3-b);
 *   per-file states                                  the verified binding (binding-invalid, view-not-rendered, …).
 */
import { createHash } from 'crypto';
import { computeEditApplication, type EditApplication, type HeldFileInput, type PlatformState } from '@/lib/agents/harness/held-bytes/apply';
import { collectHeldViewItems, type HeldViewItem } from '@/lib/agents/harness/held-bytes/entries';
import { heldBindingState, type OwningLegResolution } from '@/lib/agents/harness/held-bytes/variant';
import { readHeldView, readHeldBlobText, HELD_REF_SELECT } from '@/lib/services/held-bytes-store';
import {
  decideEditCorrection, editCorrectionTime, runEditCorrectionTurn, type EditCorrectionFact,
} from '@/lib/agents/harness/held-edit-correction';
import type { ReflectionErrorFact } from '@/lib/agents/harness/agentic-tool-loop';

export const HELD_EDIT_AUTHOR_ROLE = 'config_change_author';

/** One verified held file: the ref the step bound to, for the persist's BASE row (V-5d) and the Author manifest (V-5h). */
export interface ResolvedHeldRef {
  handle: string;
  refId: string;
  scope: string;
  blobSha256: string;
  r9Version: string;
  viewVersion: string;
  row: Record<string, unknown>;
}

export interface ResolveHeldFilesCtx { authorTaskId: string; authorStageId: string | null; scope: string | null; legTaskId: string | null }
export type ResolveHeldFiles = (items: HeldViewItem[], ctx: ResolveHeldFilesCtx) => Promise<{ files: HeldFileInput[]; refs: ResolvedHeldRef[] }>;

export interface EditStepInput {
  task: { id: string; type?: string | null; povId?: string | null; inputContext: unknown };
  agentRole: string | null;
  finalResponse: string;
  owningLeg: OwningLegResolution;
  protocolInjection: { protocolNames?: unknown; degraded?: unknown } | null | undefined;
  r9Version: string;
  /** R10-V8-RESIDUALS (b): the tokens R10's keyed rules will take from this execution's tool records at persist
   *  (collectR10EchoSources(toolCallResults)) — an applied edit must never carry one bare. In memory only; never stamped. */
  persistEchoTokens?: ReadonlySet<string>;
  /** The Author task's own stage (where its Harvester must live). Read by the caller at the point of use. */
  authorStageId: string | null;
  /** F-T2-1 (b): compute the correction DECISION and stop — never run the turn. execution-core previews the step this way, before the
   *  form correction, to learn whether the held-edit correction will take the one reflection pass. */
  decideOnly?: boolean;
  /** The correction turn's inputs (V-5c). Absent ⇒ the decision is still stamped, the turn never runs (`flag-off`). */
  correction?: {
    enabled: boolean;
    correctionTurnUsed: boolean;
    formCorrectionAttempted: boolean;
    budgetFlagged: boolean;
    deadlineAt: number;
    loopStartedAt: number;
    currentResponse: any;
    messageHistory: any[];
    totalUsage: any;
    prompt: string;
    normalizedLlmConfig: any;
    mcpFunctions: any;
    executionId: string;
    userId: string | undefined;
    generateText: (prompt: string, options: any, userId?: string) => Promise<any>;
    logger: { info: (o: object, m: string) => void; warn: (o: Record<string, unknown>, m: string) => void };
  };
}

export interface EditStepResult {
  application: EditApplication;
  textSource: 'loop' | 'edit-correction' | 'diagnostic-retry';
  files: HeldFileInput[];
  refs: ResolvedHeldRef[];
  /** The correction decision (and outcome when attempted). Always present on a step result. */
  correction: EditCorrectionFact;
  /** The deliverable after the step: the corrected text when adopted, else the input text. */
  text: string;
  /** The current response after the step (the correction's when adopted). */
  currentResponse?: any;
  reflectionError?: ReflectionErrorFact;
}

export function isEditStepEligible(agentRole: string | null, taskType: string | null | undefined, owningLeg: OwningLegResolution | null): boolean {
  return agentRole === HELD_EDIT_AUTHOR_ROLE && taskType !== 'PIPELINE' && !!owningLeg && (owningLeg.heldCapable || owningLeg.kind === 'could-not-check');
}

const ENTRY_STATE_TO_PLATFORM: Record<string, PlatformState> = {
  'view-not-built': 'view-not-rendered', 'view-unavailable': 'view-not-rendered', 'view-not-rendered': 'view-not-rendered',
  'view-line-map-unstable': 'view-line-map-unstable', 'view-over-budget': 'view-over-budget', 'handle-ambiguous': 'handle-ambiguous',
  unheld: 'unheld',
};

export async function runEditApplicationStep(input: EditStepInput, resolveHeldFiles: ResolveHeldFiles): Promise<EditStepResult | null> {
  const { owningLeg } = input;
  if (!isEditStepEligible(input.agentRole, input.task.type, owningLeg)) return null;
  const empty = { files: [] as HeldFileInput[], refs: [] as ResolvedHeldRef[] };
  const done = (application: EditApplication, r = empty): EditStepResult => ({
    application, textSource: 'loop', ...r, text: input.finalResponse, currentResponse: input.correction?.currentResponse,
    correction: { attempted: false, notAttemptedReason: 'platform-state' },
  });
  const withCorrection = async (application: EditApplication, r: typeof empty): Promise<EditStepResult> => {
    const c = input.correction;
    const decision = decideEditCorrection({
      application,
      correctionTurnUsed: c?.correctionTurnUsed ?? false, formCorrectionAttempted: c?.formCorrectionAttempted ?? false,
      budgetFlagged: c?.budgetFlagged ?? false, enabled: !!c?.enabled,
      time: () => editCorrectionTime({ deadlineAt: c!.deadlineAt, now: Date.now(), loopStartedAt: c!.loopStartedAt,
        draftChars: input.finalResponse.length, lastTurnOutputTokens: c?.currentResponse?.usage?.outputTokens ?? null,
        totalOutputTokens: c?.totalUsage?.outputTokens ?? null }),
    });
    const base: EditStepResult = { application, textSource: 'loop', ...r, text: input.finalResponse, currentResponse: c?.currentResponse, correction: decision };
    if (!decision.attempted || !c || input.decideOnly) return base;
    const turn = await runEditCorrectionTurn({
      text: input.finalResponse, before: application, files: r.files, r9Version: input.r9Version, persistEchoTokens: input.persistEchoTokens, currentResponse: c.currentResponse,
      messageHistory: c.messageHistory, totalUsage: c.totalUsage, prompt: c.prompt, normalizedLlmConfig: c.normalizedLlmConfig,
      mcpFunctions: c.mcpFunctions, executionId: c.executionId, userId: c.userId,
      timeoutMs: decision.timeBudget?.boundMs ?? 1,
    }, { generateText: c.generateText, logger: c.logger });
    const correction = { ...decision, ...turn.outcome };
    if (turn.outcome.adopted && turn.after) {
      return { ...base, application: turn.after, textSource: 'edit-correction', text: turn.text, currentResponse: turn.currentResponse, correction,
        ...(turn.reflectionError ? { reflectionError: turn.reflectionError } : {}) };
    }
    return { ...base, correction, ...(turn.reflectionError ? { reflectionError: turn.reflectionError } : {}) };
  };
  try {
    if (owningLeg.kind === 'could-not-check') return done(computeEditApplication(input.finalResponse, { files: [], r9Version: input.r9Version, preState: 'could-not-check' }));
    const binding = heldBindingState(true, input.protocolInjection);
    if (binding) return done(computeEditApplication(input.finalResponse, { files: [], r9Version: input.r9Version, preState: binding }));
    const { entries, items } = collectHeldViewItems(input.task.inputContext);
    if (items.some((i) => i.state === 'demo-pov')) return done(computeEditApplication(input.finalResponse, { files: [], r9Version: input.r9Version, preState: 'demo-pov' }));
    if (entries > 1) {
      return done(computeEditApplication(input.finalResponse, {
        files: items.map((i) => ({ handle: i.handle, path: i.path, state: 'handle-ambiguous' as PlatformState })),
        r9Version: input.r9Version, platformStates: ['handle-namespace-ambiguous'], persistEchoTokens: input.persistEchoTokens,
      }));
    }
    const named = items.filter((i) => i.state).map((i) => ({ handle: i.handle, path: i.path, state: ENTRY_STATE_TO_PLATFORM[i.state as string] ?? 'view-not-rendered' } as HeldFileInput));
    const live = items.filter((i) => !i.state);
    const resolved = live.length
      ? await resolveHeldFiles(live, { authorTaskId: input.task.id, authorStageId: input.authorStageId, scope: input.task.povId ?? null, legTaskId: owningLeg.kind === 'leg' ? owningLeg.legId : null })
      : empty;
    const files = [...resolved.files, ...named];
    return await withCorrection(computeEditApplication(input.finalResponse, { files, r9Version: input.r9Version, persistEchoTokens: input.persistEchoTokens }), { files, refs: resolved.refs });
  } catch {
    return done(computeEditApplication(input.finalResponse, { files: [], r9Version: input.r9Version, preState: 'could-not-check' }));
  }
}

/**
 * F-T2-1 (b) (held-terraform step 3; owner 2026-10-21, LAB-PREREG-L-T2 §7) — THE arbitration of the run's ONE reflection pass between
 * the form correction and the held-edit correction. The shipped order (#89 → form → requirements → edit → #90) spent the pass on a
 * form fix even when the same package carried a refused held edit; the carrier then forced needs-revision on a package one correction
 * from correct. When the form correction is about to run (its decision says `attempted`) on an edit-step-eligible Author, preview the
 * edit step (decision only, no turn): if the held-edit correction would take the pass, the form correction stands down with the named
 * reason `prior-pass-reserved:edit-correction` and the edit correction runs at its usual position. The held fault forces the leg; the
 * form fault is on a file the platform does not hold and still reaches the Reviewer. ONE function for every caller (execution-core
 * and the leg replay lab's live path), so the two cannot drift. Never throws: a preview failure keeps the shipped order.
 */
export async function arbitrateReflectionPass<F extends { correction: { attempted?: boolean } }>(
  formCheck: F | null, stepInput: EditStepInput | null, resolveHeldFiles: ResolveHeldFiles,
): Promise<{ formCheck: F | null; reserved: boolean; refusals: string[] }> {
  if (!formCheck || formCheck.correction.attempted !== true || !stepInput) return { formCheck, reserved: false, refusals: [] };
  if (!isEditStepEligible(stepInput.agentRole, stepInput.task.type, stepInput.owningLeg)) return { formCheck, reserved: false, refusals: [] };
  try {
    const preview = await runEditApplicationStep({ ...stepInput, decideOnly: true }, resolveHeldFiles);
    if (preview?.correction.attempted !== true) return { formCheck, reserved: false, refusals: [] };
    return {
      formCheck: { ...formCheck, correction: { attempted: false, notAttemptedReason: 'prior-pass-reserved:edit-correction' } } as F,
      reserved: true, refusals: preview.application.refusals.map((r) => r.name),
    };
  } catch {
    return { formCheck, reserved: false, refusals: [] };
  }
}

/** #90 replaced the deliverable: re-run the PURE applier on the post-#90 text over the SAME verified files (V-5c). */
export function recountEditApplication(prior: EditStepResult, text: string, r9Version: string, persistEchoTokens?: ReadonlySet<string>): EditStepResult {
  const pre = prior.application.state;
  const preState = pre === 'binding-mismatch' || pre === 'variant-protocol-not-injected' || pre === 'demo-pov' || pre === 'could-not-check' ? pre : undefined;
  return {
    ...prior,
    text, // AE-P2-3: prepareHeldPackage re-derives from step.text on a missing base — it must be the persisted (post-#90) text
    textSource: 'diagnostic-retry',
    application: computeEditApplication(text, {
      files: prior.files, r9Version, persistEchoTokens, ...(preState ? { preState } : {}),
      ...(pre === 'handle-namespace-ambiguous' ? { platformStates: ['handle-namespace-ambiguous' as PlatformState] } : {}),
    }),
  };
}

const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
const HARVESTER_ROLES = new Set(['infra_state_harvester']);

type StoreDb = Parameters<typeof readHeldView>[0] & {
  heldFileRef: { findUnique: (a: { where: { id: string }; select: typeof HELD_REF_SELECT }) => Promise<Record<string, unknown> | null> };
  agentExecution: { findUnique: (a: { where: { id: string }; select: { taskId: true } }) => Promise<{ taskId: string } | null> };
  task: { findUnique: (a: { where: { id: string }; select: { stageId: true; agentRole: true } }) => Promise<{ stageId: string | null; agentRole: string | null } | null> };
};

/**
 * PRODUCTION resolver — binding = POINTERS, VERIFIED (plan V-5c; DB NOTE-a, boundary N3-c, sec-ops NOTE-5). For each item:
 * the ref row by id must be `kind = 'CAPTURE'`, of `harvesterExecutionId`, whose task is a Harvester in the Author's OWN
 * stage, `scope` = the Author's POV and `legTaskId` = the Author's leg (a null leg fails). The base sha comes from the
 * VERIFIED ref; `r9Version` / `viewVersion` are selectors and the view is read by the full key (a forged selector can only
 * miss — `view-not-rendered` — or select another rendering of the same verified bytes). The shown `viewText` must hash to the
 * server's view. Any mismatch ⇒ `binding-invalid`, and no other POV's view is ever read. A thrown read propagates (the step
 * maps it to `could-not-check`).
 */
export function resolveHeldFilesFromStore(db: StoreDb): ResolveHeldFiles {
  return async (items, ctx) => {
    const files: HeldFileInput[] = []; const refs: ResolvedHeldRef[] = [];
    for (const it of items) {
      const invalid = (): void => { files.push({ handle: it.handle, path: it.path, state: 'binding-invalid' }); };
      if (!it.refId || !it.harvesterExecutionId || !it.r9Version || !it.viewVersion || !ctx.scope || !ctx.legTaskId) { invalid(); continue; }
      const ref = await db.heldFileRef.findUnique({ where: { id: it.refId }, select: HELD_REF_SELECT });
      if (!ref || ref.kind !== 'CAPTURE' || ref.executionId !== it.harvesterExecutionId || ref.scope !== ctx.scope || ref.legTaskId !== ctx.legTaskId) { invalid(); continue; }
      const exec = await db.agentExecution.findUnique({ where: { id: String(ref.executionId) }, select: { taskId: true } });
      const harvester = exec ? await db.task.findUnique({ where: { id: exec.taskId }, select: { stageId: true, agentRole: true } }) : null;
      if (!harvester || !ctx.authorStageId || harvester.stageId !== ctx.authorStageId || !HARVESTER_ROLES.has(String(harvester.agentRole))) { invalid(); continue; }
      const scope = String(ref.scope); const blobSha256 = String(ref.blobSha256);
      const view = await readHeldView(db, { scope, baseSha256: blobSha256, r9Version: it.r9Version, viewVersion: it.viewVersion });
      if (!view) { files.push({ handle: it.handle, path: it.path, state: 'view-not-rendered' }); continue; }
      if (typeof it.viewText === 'string' && sha(it.viewText) !== sha(view.viewText)) { invalid(); continue; }
      const baseText = await readHeldBlobText(db, scope, blobSha256);
      if (baseText === null) { files.push({ handle: it.handle, path: it.path, state: 'base-not-held' }); continue; }
      files.push({ handle: it.handle, path: String(ref.path), state: 'rendered', baseText, viewText: view.viewText,
        rewrittenLines: view.rewrittenLines, redactorVersion: String(ref.redactorVersion) });
      refs.push({ handle: it.handle, refId: it.refId, scope, blobSha256, r9Version: it.r9Version, viewVersion: it.viewVersion, row: ref });
    }
    return { files, refs };
  };
}
