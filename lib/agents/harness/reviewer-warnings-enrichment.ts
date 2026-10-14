/**
 * reviewerWarnings — leg-synthesize net (WARNINGS-INVISIBLE, 2026-10-08).
 * Design + panel + audit + owner decisions: cline_docs/reviews/warnings-invisible-2026-10-08/SYNTHESIS.md (v0.3, O1–O5).
 *
 * THE QUESTION: which labelled non-blocking warnings did this leg's reviewer(s) write — and, at a program root,
 * which did every child leg's reviewers and Node C write? The reviewer transcribes them at its own persist
 * (`reviewerVerdict.warnings`, `reviewer-warnings.ts`); this net HOISTS the stamped transcription onto the leg
 * (never re-parses prose), so the lean card and the leg / program `report.md` render from ONE source and cannot
 * disagree (execution-facts F1/F2). It runs PRE-tx in `stampExecutionNets`, which the core and the post-completion
 * rescue share — dual-path and rescue-safe by construction (agent-execution F2/F8).
 *
 * SHAPE (Protocol 10 — transcriptions, ids, counts; no adjective, no severity):
 *   leg:     { checked, reason, tier:'leg', renderScope, reviewers:[{taskId, executionId, role, inFlight, reason?,
 *              warnings:[{id, registered, text, truncated?}], overflowCount?}], count, ids }
 *   program: { checked, reason, tier:'program', renderScope, legs:[{legTaskId, legTitle, executionId, reason?, count,
 *              ids, reviewers:[…]}], reviewers:[…Node C…], count, ids }
 * reason: 'transcribed' | 'no-child-stage' | 'no-reviewer' | 'no-reviewer-verdict' | 'pre-feature'.
 * `checked:true` ⇔ at least one reviewer's verdict carried the transcription (`warnings` present, possibly []).
 * An absence is a NAMED reason, never a missing key (audit A3: `0` on the card means checked-and-none).
 *
 * renderScope (owner decision O1, 2026-10-08) is decided HERE so the terminal persist renders from the fact alone
 * and carries no protocol knowledge:
 *   'leg-section'     — a leg of one of the four infra change-package protocols; only `change_reviewer` lines render.
 *   'program-section' — a pov-program root: every child leg's lines (value legs included) + Node C's own.
 *   'fact-only'       — everything else (requirements-authoring, network-derivation / value legs at LEG tier,
 *                        artifact-synthesis, unknown). The fact is stamped; no section is ever appended.
 *
 * `registered` = the id is on the per-protocol code set below, pinned equal to the ids the protocol TEXT names
 * (owner decision D2: never rewritten to `other` — an unlisted id is transcribed verbatim and flagged).
 *
 * GATES NOTHING. No `qualityGate`, no `programReleasable`, no consumer beyond the card and the report section.
 */

import type { PrismaClient } from '@prisma/client';
import { REVIEWER_ROLES } from './parse-verdict';
import { findLegReviewerTasks } from './leg-reviewers';
import { readAuthoritativeResultField, type AuthoritativeReadClient } from './authoritative-result-read';

/** Leg protocols whose `change_reviewer` warnings render into the leg report.md (O1). */
export const LEG_SECTION_PROTOCOLS: ReadonlySet<string> = new Set([
  'network-provisioning-protocol',
  'terraform-iac-protocol',
  'kubernetes-gitops-protocol',
  'observability-config-protocol',
]);
/** Program-root protocols whose report.md gets the program section (O1). */
export const PROGRAM_SECTION_PROTOCOLS: ReadonlySet<string> = new Set(['pov-program-protocol']);
/** The only reviewer role whose lines render in a LEG section. */
export const LEG_SECTION_REVIEWER_ROLE = 'change_reviewer';

/**
 * Registered warning ids per protocol (D2). MUST equal, per leg protocol, the ids that protocol's text names plus the
 * ids the shared `change_reviewer` role names — pinned by `test:reviewer-warnings-net` (N9) against
 * `seed-protocol-prompts.ts` and `ROLE_GUIDANCE_LIBRARY['change_reviewer']`. Add an id HERE in the same commit as the
 * text. Program protocols stay out: Node C writes no label (WARNINGS-INVISIBLE batch 2, owner G2).
 * `restated-conclusion` (batch 2, 2026-10-08) is defined once, in the shared role, so all four leg protocols carry it.
 */
export const REGISTERED_WARNING_IDS: Readonly<Record<string, readonly string[]>> = {
  'network-provisioning-protocol': ['reachability-after-suppression', 'restated-conclusion'],
  'terraform-iac-protocol': ['restated-conclusion'],
  'kubernetes-gitops-protocol': ['restated-conclusion'],
  'observability-config-protocol': ['restated-conclusion'],
};

type Client = Pick<PrismaClient, 'task' | 'agentExecution'> & AuthoritativeReadClient;

interface ReviewerEntry {
  taskId: string;
  executionId: string | null;
  role: string | null;
  inFlight: boolean;
  reason?: 'no-reviewer-verdict' | 'pre-feature' | 'no-selectable-execution';
  warnings: Array<{ id: string; registered: boolean; text: string; truncated?: true }>;
  overflowCount?: number;
}

function parseJson(v: string | null): any {
  if (v == null) return null;
  try { return JSON.parse(v); } catch { return null; }
}

async function readReviewer(
  prisma: Client,
  t: { id: string; agentRole: string | null },
  protocol: string | null,
): Promise<ReviewerEntry> {
  const inFlight = (await prisma.agentExecution.count({
    where: { taskId: t.id, status: { in: ['PENDING', 'RUNNING'] } },
  })) > 0;
  const read = await readAuthoritativeResultField(prisma, t.id, 'reviewerVerdict');
  const base = { taskId: t.id, executionId: read.executionId, role: t.agentRole, inFlight, warnings: [] as ReviewerEntry['warnings'] };
  if (!read.executionId) return { ...base, reason: 'no-selectable-execution' };
  const verdict = parseJson(read.value);
  if (!verdict || typeof verdict !== 'object') return { ...base, reason: 'no-reviewer-verdict' };
  if (!Array.isArray(verdict.warnings)) return { ...base, reason: 'pre-feature' };
  const registeredSet = new Set(protocol ? REGISTERED_WARNING_IDS[protocol] ?? [] : []);
  const entry: ReviewerEntry = {
    ...base,
    warnings: verdict.warnings
      .filter((w: any) => w && typeof w.id === 'string' && typeof w.text === 'string')
      .map((w: any) => ({ id: w.id, registered: registeredSet.has(w.id), text: w.text, ...(w.truncated ? { truncated: true as const } : {}) })),
  };
  if (typeof verdict.warningsOverflowCount === 'number' && verdict.warningsOverflowCount > 0) {
    entry.overflowCount = verdict.warningsOverflowCount;
  }
  return entry;
}

function summarize(reviewers: ReviewerEntry[]): { checked: boolean; reason: string; count: number; ids: string[] } {
  const transcribed = reviewers.filter(r => !r.reason);
  if (transcribed.length === 0) {
    const reason = reviewers.some(r => r.reason === 'pre-feature') ? 'pre-feature' : 'no-reviewer-verdict';
    return { checked: false, reason, count: 0, ids: [] };
  }
  const count = transcribed.reduce((n, r) => n + r.warnings.length + (r.overflowCount ?? 0), 0);
  const ids = [...new Set(transcribed.flatMap(r => r.warnings.map(w => w.id)))];
  return { checked: true, reason: 'transcribed', count, ids };
}

async function reviewersOf(prisma: Client, stageId: string, protocol: string | null): Promise<ReviewerEntry[]> {
  const tasks = (await findLegReviewerTasks(prisma, stageId)).filter(t => !!t.agentRole && REVIEWER_ROLES.has(t.agentRole));
  const out: ReviewerEntry[] = [];
  for (const t of tasks) out.push(await readReviewer(prisma, t, protocol));
  return out;
}

export async function computeReviewerWarningsFact(
  prisma: Client,
  { stageId, programTier, protocol }: { stageId: unknown; programTier?: boolean; protocol: unknown },
): Promise<Record<string, unknown>> {
  const proto = typeof protocol === 'string' ? protocol : null;
  const tier = programTier === true ? 'program' : 'leg';
  const renderScope = tier === 'program'
    ? (proto && PROGRAM_SECTION_PROTOCOLS.has(proto) ? 'program-section' : 'fact-only')
    : (proto && LEG_SECTION_PROTOCOLS.has(proto) ? 'leg-section' : 'fact-only');
  if (typeof stageId !== 'string' || !stageId) {
    return { checked: false, reason: 'no-child-stage', tier, renderScope, count: 0, ids: [] };
  }

  if (tier === 'leg') {
    const reviewers = await reviewersOf(prisma, stageId, proto);
    if (reviewers.length === 0) return { checked: false, reason: 'no-reviewer', tier, renderScope, count: 0, ids: [] };
    const s = summarize(reviewers);
    return { checked: s.checked, reason: s.reason, tier, renderScope, reviewers, count: s.count, ids: s.ids };
  }

  // PROGRAM arm: each child leg's STAMPED leg fact (the execution Node C chains), then Node C's own lines.
  const legTasks = await prisma.task.findMany({
    where: { stageId, type: 'PIPELINE' },
    select: { id: true, title: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 20,
  });
  const legs: Array<Record<string, unknown>> = [];
  let legCount = 0;
  const legIds: string[] = [];
  for (const l of legTasks) {
    const read = await readAuthoritativeResultField(prisma, l.id, 'reviewerWarnings');
    const fact = parseJson(read.value);
    if (!read.executionId) { legs.push({ legTaskId: l.id, legTitle: l.title, executionId: null, reason: 'no-selectable-execution', count: 0, ids: [] }); continue; }
    if (!fact || typeof fact !== 'object') { legs.push({ legTaskId: l.id, legTitle: l.title, executionId: read.executionId, reason: 'pre-feature', count: 0, ids: [] }); continue; }
    const count = typeof fact.count === 'number' ? fact.count : 0;
    const ids = Array.isArray(fact.ids) ? fact.ids : [];
    legCount += count;
    legIds.push(...ids);
    legs.push({
      legTaskId: l.id, legTitle: l.title, executionId: read.executionId,
      ...(fact.checked ? {} : { reason: fact.reason ?? 'no-reviewer-verdict' }),
      count, ids, reviewers: Array.isArray(fact.reviewers) ? fact.reviewers : [],
    });
  }
  const nodeC = await reviewersOf(prisma, stageId, proto);
  const n = nodeC.length ? summarize(nodeC) : { checked: false, reason: 'no-reviewer', count: 0, ids: [] as string[] };
  const anyLegChecked = legs.some(l => !l.reason);
  const checked = n.checked || anyLegChecked;
  return {
    checked,
    reason: checked ? 'transcribed' : (legs.length === 0 && nodeC.length === 0 ? 'no-reviewer' : 'pre-feature'),
    tier, renderScope,
    legs,
    reviewers: nodeC,
    count: legCount + n.count,
    ids: [...new Set([...legIds, ...n.ids])],
  };
}
