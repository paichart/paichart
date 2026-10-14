/**
 * Leg replay lab — the SHIPPING mechanical nets over a replayed package.
 *
 * Two invocation points, exactly as production runs them (lib/services/execution-nets.ts `stampExecutionNets`):
 *   - `leaf-persist` on the Author (markerPresence, rollbackContainment compute half) — these are the facts the
 *     chainer carries into the Reviewer's §6, so they are computed BEFORE the Reviewer is rebuilt;
 *   - `leg-synthesize` on the owning leg, after the review (derivationContainment, dialectLint, contractPropagation,
 *     rollbackContainment hoist) — what the leg's card and the program gate would read.
 * Both run `runNetsAtPoint` over `MECHANICAL_NETS` with a context from the shipping `buildNetContext`; the only lab
 * part is the Prisma client (replay-prisma.ts), which serves the snapshot with the replayed executions added.
 *
 * `verdictFreshness` is EXCLUDED by design: it compares the Reviewer's frozen chained input against later Author
 * runs of the same task, which is a statement about production history that a replay cannot make true or false.
 *
 * `computeFormCheckFact` (toolLoop.formCheck, not a registry net) is stamped by the live runner at the same point
 * execution-core stamps it — see live.ts.
 */
import { MECHANICAL_NETS } from '../../lib/agents/harness/mechanical-nets';
import { runNetsAtPoint } from '../../lib/agents/harness/net-registry';
import { buildNetContext } from '../../lib/agents/harness/net-context';
import { isProgramHarnessTask } from '../../lib/agents/harness/program-protocol';
import { buildReplayPrisma, taskRowToPrisma, type ReplaySubstitution } from './replay-prisma';
import type { Snapshot } from './snapshot';

export const LEG_NETS_EXCLUDED: Record<string, string> = {
  verdictFreshness: 'compares the Reviewer\'s frozen chained input with later production Author runs — not meaningful for a replay',
};

export interface NetRun {
  point: 'leaf-persist' | 'leg-synthesize';
  stamped: Record<string, Record<string, unknown>>;
  /** Nets whose enrichment THREW (stub-unsupported shapes included) — their stamped value is the net's errorFact. */
  errors: Record<string, string>;
  notApplicable: string[];
  queries: string[];
}

/** `toolCalls` (2026-10-13): the node execution's own result.json `toolCalls`, as production hands them to the nets
 *  (execution-nets.ts reads them off the BUILT resultJson). Omitted ⇒ `[]`, as before — the stubbed Author's calls carry
 *  nothing a net reads; a recorded-tools Harvester passes its served calls so `quoteFidelity` (harvest point) has its witness. */
export async function runAuthorLeafNets(snap: Snapshot, role: string, text: string, replayExecutionId: string, toolCalls?: unknown): Promise<NetRun> {
  const { client, queries } = buildReplayPrisma(snap, [{ taskId: snap.author.task.id, executionId: replayExecutionId, resultJson: { finalResponse: text, ...(toolCalls !== undefined ? { toolCalls } : {}) } }]);
  const t = taskRowToPrisma(snap.author.task);
  const ctx = buildNetContext({
    prisma: client, task: { id: t.id, type: t.type, metadata: t.metadata, inputContext: snap.author.exec.config?.inputContext ?? t.inputContext },
    agentRole: role, harnessMode: null, finalResponse: text, programTier: false, executionId: replayExecutionId,
    ...(toolCalls !== undefined ? { toolCalls } : {}),
  });
  return runPoint('leaf-persist', ctx, queries);
}

/** The leg's SYNTHESIZE view with the replayed Author (and Reviewer, when given) as the authoritative children. */
export async function runLegSynthesizeNets(snap: Snapshot, subs: ReplaySubstitution[]): Promise<NetRun | null> {
  if (!snap.leg) return null;
  const { client, queries } = buildReplayPrisma(snap, subs);
  const leg = taskRowToPrisma(snap.leg);
  const programTier = leg.type === 'PIPELINE' && isProgramHarnessTask(leg as never);
  const ctx = buildNetContext({
    prisma: client, task: { id: leg.id, type: leg.type, metadata: leg.metadata, inputContext: leg.inputContext },
    agentRole: leg.agentRole, harnessMode: 'SYNTHESIZE', finalResponse: null, programTier, executionId: 'lab-leg-synthesize',
  });
  return runPoint('leg-synthesize', ctx, queries);
}

async function runPoint(point: 'leaf-persist' | 'leg-synthesize', ctx: ReturnType<typeof buildNetContext>, queries: string[]): Promise<NetRun> {
  const nets = MECHANICAL_NETS.filter((n) => n.point === point && !LEG_NETS_EXCLUDED[n.name]);
  const notApplicable = nets.filter((n) => !n.appliesTo(ctx)).map((n) => n.name);
  const stamped: Record<string, Record<string, unknown>> = {};
  const errors: Record<string, string> = {};
  await runNetsAtPoint(point, ctx, nets, (n, f) => { stamped[n] = f as Record<string, unknown>; },
    (n, e) => { errors[n] = e instanceof Error ? e.message : String(e); });
  return { point, stamped, errors, notApplicable, queries };
}

/** One line per net for a report row: the disposition / reason / counts, never a verdict. */
export function summarizeFacts(stamped: Record<string, Record<string, unknown>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, f] of Object.entries(stamped)) {
    if (name === 'markerPresence') {
      out[name] = ['harvestedAllocations', 'derivedValues', 'consumedValues'].map((k) => `${k}:${f[k] === true ? '✓' : f[k] === false ? '✗' : '?'}`).join(' ');
    } else if (name === 'rollbackContainment') {
      const d = (f.rollbackDisposition ?? {}) as Record<string, unknown>;
      out[name] = `${d.disposition ?? '?'} (${d.reason ?? f.reason ?? '?'}) found ${f.restoreLinesFound ?? '-'}/${f.restoreLinesTotal ?? '-'}`;
    } else if (name === 'derivationContainment') {
      const d = (f.containmentDisposition ?? {}) as Record<string, unknown>;
      out[name] = `${d.disposition ?? '?'} (${d.reason ?? f.reason ?? '?'}) violations ${Array.isArray(f.violations) ? f.violations.length : '-'}`;
    } else if (name === 'dialectLint') {
      out[name] = `checked ${f.checked} ${f.reason ?? ''} violations ${Array.isArray(f.violations) ? f.violations.length : '-'}`.trim();
    } else if (name === 'contractPropagation') {
      out[name] = `checked ${f.checked} ${f.reason ?? ''}`.trim();
    } else if (name === 'quoteFidelity') {
      const b = (f.blocks ?? {}) as Record<string, unknown>;
      const d = (f.quoteFidelityDisposition ?? {}) as Record<string, unknown>;
      out[name] = `${d.disposition ?? '?'} (${f.reason ?? '?'}) pairable ${b.pairable ?? '-'} complete ${b.complete ?? '-'} escalating ${b.escalating ?? '-'}`;
    } else if (name === 'reviewerWarnings') {
      out[name] = `checked ${f.checked} ${f.reason ?? ''} count ${f.count ?? '-'} ids [${Array.isArray(f.ids) ? f.ids.join(',') : ''}]`;
    } else {
      out[name] = `checked ${f.checked ?? '?'} ${f.reason ?? ''}`.trim();
    }
  }
  return out;
}
