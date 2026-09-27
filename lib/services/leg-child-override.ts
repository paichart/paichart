/**
 * Leg-child override refusal (RWF Stage 1 D1, 2026-09-26; sec-ops-D1-review.md).
 *
 * `perform(agent.execute).overrideConfig` is `.passthrough()`, and agentTaskService builds the execution config from
 * it. On a PIPELINE CHILD (a harness's child, a program leg, Node C) three of its keys corrupt the run:
 *   - `.prompt` replaces the task's §1 directive;
 *   - `.inputContext` is not rendered, but it SUPPRESSES re-chaining (the child's §6 keeps its predecessors'
 *     PREVIOUS outputs, so a re-run reviewer re-reviews the old package while looking fresh) and skips the
 *     interface-contract guard;
 *   - `.agentRole` changes the role the verdict parser keys on.
 * `overrideConfig.modelParameters` is validated with a passthrough schema and SPREAD after agentRole/prompt, so
 * `modelParameters: { prompt, agentRole }` reached the same two hazards (sec-ops F1). Hence an ALLOWLIST, not a
 * denylist: a pipeline child may carry `modelParameters` with KNOWN model-parameter keys only, and nothing else — and
 * not the two keys that select the MODEL (X18, below).
 * `maxRetries`/`timeout` were dropped from the allowlist (sec-ops F2): nothing reads them today and nothing bounds them.
 *
 * The hazard belongs to the TASK, not the caller: humans calling agent.execute on a pipeline child are refused too.
 * Out of scope, recorded (register): the REST task-execute route (human/GUI only, no skipChaining), the stream route,
 * `agent.configure` and `task.update` writing prompt/agentRole onto a child (sec-ops F3 — one bug class).
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { ApiError, ErrorCode } from '@/lib/errors';
import { MODEL_PARAMETER_KEYS } from '@/lib/validation/model-parameters';
import { harnessOwnedTaskIds } from './child-stage-settled';

/** The ONLY overrideConfig keys a pipeline child may carry. */
export const LEG_CHILD_OVERRIDE_ALLOWED_KEYS: readonly string[] = ['modelParameters'];

/**
 * Model-selecting keys a pipeline child may NOT take per run, even though they are known model parameters (RWF X18,
 * Steve 2026-09-27, option B). The judged party choosing its judge's model is the hazard: a harness could re-run its
 * own reviewer on a weaker model. A child's model is set on its task or template — a visible, persistent, human act.
 * BOTH keys, because either one selects the model.
 */
export const LEG_CHILD_REFUSED_MODEL_KEYS: readonly string[] = ['model', 'provider'];

/** What the known-hazardous keys do — facts only, stated in the refusal (Protocol 10). */
const HAZARD: Record<string, string> = {
  prompt: 'replaces the task\'s directive',
  inputContext: 'is not rendered, but suppresses re-chaining (the child would work from its predecessors\' PREVIOUS outputs) and skips the interface-contract guard',
  agentRole: 'changes the role the verdict parser keys on',
  'modelParameters.model': 'changes the model the child runs on (set it on the task or template instead)',
  'modelParameters.provider': 'changes the model provider the child runs on (set it on the task or template instead)',
};

/**
 * The override keys a pipeline child may NOT take: every non-null top-level key outside the allowlist, plus
 * `modelParameters.<k>` for every non-null k that is not a known model-parameter key. PURE.
 */
export function disallowedOverrideKeys(overrideConfig: unknown): string[] {
  if (!overrideConfig || typeof overrideConfig !== 'object') return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(overrideConfig as Record<string, unknown>)) {
    if (v === undefined || v === null) continue;
    if (!LEG_CHILD_OVERRIDE_ALLOWED_KEYS.includes(k)) { out.push(k); continue; }
    if (k === 'modelParameters' && typeof v === 'object') {
      for (const [mk, mv] of Object.entries(v as Record<string, unknown>)) {
        if (mv !== undefined && mv !== null && (!MODEL_PARAMETER_KEYS.includes(mk) || LEG_CHILD_REFUSED_MODEL_KEYS.includes(mk))) {
          out.push(`modelParameters.${mk}`);
        }
      }
    }
  }
  return out;
}

type LegClient = Pick<PrismaClient | Prisma.TransactionClient, 'stage' | '$queryRaw'>;

/**
 * Is this task a pipeline child? Its stage names an owning harness (`stage.metadata.harnessTaskId`, a PK read) OR a
 * PIPELINE task claims the stage via `metadata.pipelineStageId` (the Guard 3 shape, index-backed — reused from
 * harnessOwnedTaskIds, which keeps the literal `type = 'PIPELINE'` the partial index needs). A task with no stage
 * is standalone. A query failure PROPAGATES: the call fails with nothing written (fail closed).
 */
export async function isLegChild(client: LegClient, taskId: string, stageId: string | null | undefined): Promise<boolean> {
  if (!stageId) return false;
  const stage = await client.stage.findUnique({ where: { id: stageId }, select: { metadata: true } });
  if (typeof (stage?.metadata as Record<string, unknown> | null)?.harnessTaskId === 'string') return true;
  return (await harnessOwnedTaskIds(client, [taskId])).has(taskId);
}

/** Refusal text: known hazards named with their effect, the rest counted; at most 5 names, each capped (sec-ops F6). */
export function legChildRefusalMessage(keys: string[]): string {
  const named = keys.slice(0, 5).map((k) => k.slice(0, 64));
  const effects = named.filter((k) => HAZARD[k]).map((k) => `\`overrideConfig.${k}\` ${HAZARD[k]}`);
  const more = keys.length > named.length ? ` (+${keys.length - named.length} more)` : '';
  return `LEG_CHILD_OVERRIDE_REFUSED: this task is a pipeline child, and a pipeline child's execution may override ` +
    `only \`modelParameters\` tuning keys (known model-parameter keys other than model/provider). Refused: ${named.map((k) => `\`${k}\``).join(', ')}${more}.` +
    (effects.length ? ` ${effects.join('; ')}.` : '') +
    ` Re-run with \`{ taskId }\` only.`;
}

/**
 * Throws ApiError(LEG_CHILD_OVERRIDE_REFUSED, 400) when a pipeline child is executed with a disallowed override.
 * Runs NO query unless a disallowed key is present, so a plain `{ taskId }` call costs nothing (sec-ops F4).
 */
export async function refuseLegChildOverrides(
  client: LegClient,
  args: { taskId: string; stageId: string | null | undefined; overrideConfig: unknown; callingExecutionId?: string },
  log: { warn: (o: Record<string, unknown>, m: string) => void },
): Promise<void> {
  const keys = disallowedOverrideKeys(args.overrideConfig);
  if (keys.length === 0) return;
  if (!(await isLegChild(client, args.taskId, args.stageId))) return;
  log.warn({ taskId: args.taskId, refusedKeys: keys.slice(0, 5), refusedCount: keys.length,
    callingExecutionId: args.callingExecutionId ?? null, errorCode: 'LEG_CHILD_OVERRIDE_REFUSED' },
    'agent.execute override refused on a pipeline child');
  throw new ApiError(ErrorCode.LEG_CHILD_OVERRIDE_REFUSED, legChildRefusalMessage(keys),
    { taskId: args.taskId, refusedKeys: keys.slice(0, 5), refusedCount: keys.length, code: 'LEG_CHILD_OVERRIDE_REFUSED' });
}

/**
 * RWF X17 (2026-09-27; sec-ops D1 review F3). `agent.configure` writes a task's role and prompt PERSISTENTLY — and with no
 * prompt given it SYNTHESISES a new directive from the role and title, so even a template-only call replaces the task's
 * prompt. From inside an agent run, on a pipeline child, that is the D1 bypass made permanent: a harness rewriting its own
 * child's configuration. Refused when the call comes from an agent's tool loop (`callingExecutionId` is threaded only by the
 * loop; Desktop, ChatGPT, GUI and REST callers never carry it) AND the task is a pipeline child.
 *
 * NOT refused: a HUMAN configuring a child — a visible, persistent, deliberate act (the X18 principle: a child's config is
 * set on its task, by a person). The harness verb for a child's template is `agent.assign`, which the protocols use and
 * which takes the role from the template. Measured before building: in 816 harness runs (90 days) harnesses called
 * agent.configure twice — both template-only, on their own children, both silently replacing the child's prompt.
 */
export async function refuseAgentLoopConfigure(
  client: LegClient,
  args: { taskId: string; stageId: string | null | undefined; callingExecutionId?: string },
  log: { warn: (o: Record<string, unknown>, m: string) => void },
): Promise<void> {
  if (!args.callingExecutionId) return;          // a human caller — allowed, and no query
  if (!(await isLegChild(client, args.taskId, args.stageId))) return;
  log.warn({ taskId: args.taskId, callingExecutionId: args.callingExecutionId, errorCode: 'LEG_CHILD_CONFIGURE_REFUSED' },
    'agent.configure from inside an agent run refused on a pipeline child');
  throw new ApiError(ErrorCode.LEG_CHILD_CONFIGURE_REFUSED,
    'LEG_CHILD_CONFIGURE_REFUSED: this task is a pipeline child, and agent.configure from inside a pipeline run would ' +
    'rewrite its role and prompt permanently (with no prompt given, agent.configure synthesises a new one). To give a child ' +
    'a template, use `perform(action: "agent.assign", parameters: { taskId, agentTemplateName })`; the role comes from the ' +
    'template and the task description stays the brief. A person may still configure the task directly.',
    { taskId: args.taskId, code: 'LEG_CHILD_CONFIGURE_REFUSED' });
}

/** Where a modelParameters write can hide in a task.create / task.update payload. PURE. */
export function modelParametersWritePaths(parameters: unknown): string[] {
  const obj = (v: unknown): Record<string, unknown> | null => {
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    if (typeof v === 'string') { try { const p = JSON.parse(v); return p && typeof p === 'object' && !Array.isArray(p) ? p : null; } catch { return null; } }
    return null;
  };
  const p = obj(parameters);
  if (!p) return [];
  const found: string[] = [];
  const has = (o: Record<string, unknown> | null, k: string) => !!o && Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;
  if (has(p, 'modelParameters')) found.push('modelParameters');
  if (has(obj(p.metadata), 'modelParameters')) found.push('metadata.modelParameters');
  const u = obj(p.updates);
  if (has(u, 'modelParameters')) found.push('updates.modelParameters');
  if (has(obj(u?.metadata), 'modelParameters')) found.push('updates.metadata.modelParameters');
  return found;
}

/**
 * RWF "A, agent-only" (Steve, 2026-09-27). A task's model parameters are set by a PERSON (the GUI, whose route is
 * separate) or seeded on its template — never written by an agent run. From inside a run, `task.create`/`task.update`
 * carrying `modelParameters` would PERSISTENTLY pin a task's model (the X18 hazard made permanent: a harness choosing its
 * own reviewer's model). Refused whenever the call comes from an agent's tool loop (`callingExecutionId`), on ANY task —
 * there is no legitimate agent use (measured: 0 of 1,445 agent task.update calls in 90 days carried modelParameters).
 * Human MCP callers (Desktop, ChatGPT) keep the capability: that is a product surface, not a safety one.
 */
export function refuseAgentLoopModelParameters(
  action: string,
  parameters: unknown,
  callingExecutionId: string | undefined,
  log: { warn: (o: Record<string, unknown>, m: string) => void },
): void {
  if (!callingExecutionId || (action !== 'task.create' && action !== 'task.update')) return;
  const paths = modelParametersWritePaths(parameters);
  if (paths.length === 0) return;
  log.warn({ action, callingExecutionId, paths, errorCode: 'AGENT_MODEL_PARAMETERS_REFUSED' },
    'modelParameters write from inside an agent run refused');
  throw new ApiError(ErrorCode.AGENT_MODEL_PARAMETERS_REFUSED,
    `AGENT_MODEL_PARAMETERS_REFUSED: ${action} from inside an agent run may not set model parameters (${paths.join(', ')}). ` +
    'A task\'s model is set by a person, or on its agent template. Remove modelParameters and retry.',
    { action, paths, code: 'AGENT_MODEL_PARAMETERS_REFUSED' });
}
