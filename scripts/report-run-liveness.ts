#!/usr/bin/env ts-node
/**
 * Run liveness report (item 10, 2026-09-15; buckets corrected 2026-09-16).
 *
 * Answers the question the graph could not: **which PIPELINE runs are actually live?**
 *
 * Before this, a stopped run had no machine-readable reason in 69 of 100 cases, so
 * "abandoned dev debris", "waiting on a human gate" and "genuine hang" were one
 * indistinguishable pile. This classifies every non-terminal PIPELINE task and — the
 * point of the exercise — names what is left UNEXPLAINED.
 *
 * Classification is FACT-BASED and ordered most-specific-first. Nothing here is
 * inferred about intent: every bucket except UNEXPLAINED is backed by a stamp, a
 * status, or a dependency that exists in the database.
 *
 * ── WHY THE BUCKETS CHANGED (2026-09-16) ─────────────────────────────────────
 *
 * The first version asked three questions (disposed? halted? open gate in my own
 * child stage?) and swept everything else into UNEXPLAINED. Measured against the
 * live corpus that bucket held **71 of 104 rows**, and the docstring above told the
 * reader it was "the only bucket worth investigating". It was read as a backlog of
 * hung runs twice — on 2026-09-15, where it looked like dismissible debris and was
 * hiding a systematic `executionDegradation` defect, and again on 2026-09-16.
 *
 * Classified against predicates that already existed in the schema, the 71 were:
 *   • 59 blocked by an incomplete DEPENDENCY — queued nodes whose predecessor has
 *     not released them. Not hung. Not debris. Simply not asked about: the old gate
 *     check looked only INSIDE the run's own child stage and never at the run's own
 *     inbound edges.
 *   • 21 with children still in progress — mid-run, between child executions, so no
 *     agent_execution row is RUNNING at the instant of the query.
 *   • a handful genuinely stranded.
 *
 * **The dangerous class was invisible precisely because it shared a bucket with the
 * benign majority.** "Children all settled, harness never re-entered" is the
 * non-terminal-family shape that F16/F17/F20/R4 exist to kill, and it is the one
 * thing here worth a human's attention — so it now gets its own loud bucket instead
 * of being 3 rows among 71.
 *
 * ⚠️ A residual bucket is not a finding. UNEXPLAINED means "no predicate matched",
 * i.e. *not yet asked the right question* — and it reads like a discovery. If you
 * extend this script, add the predicate; do not let the pile grow and re-acquire a
 * reputation for meaning something.
 *
 * ⚠️ SETTLED is reported as a FACT with an age, never as a verdict. A harness that
 * has just seen its last child complete is mid-retrigger and belongs here for a few
 * seconds legitimately. No threshold decides anything: the age is printed and the
 * reader judges (Protocol 10 — ship the fact, earn the verdict).
 *
 *   npm run report:run-liveness            # summary
 *   npm run report:run-liveness -- --list  # name the SETTLED and UNEXPLAINED rows
 */
import { PrismaClient } from '@prisma/client';
import { readRunDisposition } from '../lib/tasks/run-disposition';

const prisma = new PrismaClient();
const LIST = process.argv.includes('--list');

const BUCKETS = [
  'RUNNING',
  'children in progress',
  'queued (dependency unsatisfied)',
  'waiting (open human gate)',
  'halted (awaiting human)',
  'escalated (terminal verdict)',
  'disposed',
  'SETTLED (harness not re-entered)',
  'UNEXPLAINED',
] as const;
type Bucket = typeof BUCKETS[number];

/** Buckets that deserve a human's eye. Everything else is a run behaving correctly. */
const LOUD: ReadonlySet<Bucket> = new Set(['SETTLED (harness not re-entered)', 'UNEXPLAINED']);

async function main() {
  const tasks = await prisma.task.findMany({
    where: { type: 'PIPELINE', status: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] } },
    select: { id: true, title: true, status: true, metadata: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const ids = tasks.map(t => t.id);

  // ── Bulk lookups. Deliberately three queries rather than three-per-task: the old
  // per-task gate check was an N+1 and every predicate added here would have multiplied it.
  const live = await prisma.agentExecution.findMany({
    where: { status: { in: ['RUNNING', 'PENDING'] } },
    select: { taskId: true },
  });
  const liveIds = new Set(live.map(e => e.taskId));

  // Inbound edges: a run whose predecessor has not completed is QUEUED, not stalled.
  // This is the predicate whose absence produced the 59-row phantom backlog.
  const deps = await prisma.taskDependency.findMany({
    where: { taskId: { in: ids } },
    select: { taskId: true, dependsOn: { select: { status: true } } },
  });
  const blockedIds = new Set(
    deps.filter(d => d.dependsOn && d.dependsOn.status !== 'COMPLETED').map(d => d.taskId),
  );

  // Child stages, in one query. A child stage tells us three different things:
  // an open template-less task is a human gate (D4); a non-terminal child means the
  // run is still moving; all-terminal children with a non-terminal harness is SETTLED.
  const stageIds = tasks
    .map(t => String(((t.metadata ?? {}) as Record<string, unknown>).pipelineStageId ?? ''))
    .filter(Boolean);
  const children = stageIds.length
    ? await prisma.task.findMany({
        where: { stageId: { in: stageIds } },
        select: { stageId: true, status: true, agentTemplateId: true },
      })
    : [];
  const byStage = new Map<string, typeof children>();
  for (const c of children) {
    if (!c.stageId) continue;
    const arr = byStage.get(c.stageId) ?? [];
    arr.push(c);
    byStage.set(c.stageId, arr);
  }

  // Last execution per task — only used to AGE the SETTLED rows, never to classify them.
  const lastExec = new Map<string, Date>();
  for (const e of await prisma.agentExecution.findMany({
    where: { taskId: { in: ids } },
    select: { taskId: true, endTime: true, startTime: true },
  })) {
    const when = e.endTime ?? e.startTime;
    if (!when) continue;
    const prev = lastExec.get(e.taskId);
    if (!prev || when > prev) lastExec.set(e.taskId, when);
  }

  const counts = new Map<Bucket, number>();
  const named: Partial<Record<Bucket, { id: string; title: string; created: Date; age: string }[]>> = {};

  for (const t of tasks) {
    const md = (t.metadata ?? {}) as Record<string, unknown>;
    const stageId = String(md.pipelineStageId ?? '');
    const kids = byStage.get(stageId) ?? [];
    const openGate = kids.some(c => c.status !== 'COMPLETED' && c.agentTemplateId === null);
    const openKids = kids.some(c => c.status !== 'COMPLETED');
    const gate = (md.qualityGate ?? null) as { outcome?: string } | null;
    const executed = lastExec.has(t.id);

    let bucket: Bucket;
    if (liveIds.has(t.id)) {
      bucket = 'RUNNING';
    } else if (readRunDisposition(md)) {
      // A human recorded that this run is no longer being pursued.
      bucket = 'disposed';
    } else if (
      (md.duplicateHalt != null && md.duplicateAcknowledged == null) ||
      md.cannotRun != null
    ) {
      // A stamped halt whose release has NOT arrived. An acknowledged duplicate is
      // NOT halted — that distinction was itself a defect until 2026-09-15.
      bucket = 'halted (awaiting human)';
    } else if (gate?.outcome === 'escalated') {
      // Escalation is an OUTCOME, not a hang (F20). The run reached a verdict and stopped.
      bucket = 'escalated (terminal verdict)';
    } else if (openGate) {
      bucket = 'waiting (open human gate)';
    } else if (blockedIds.has(t.id)) {
      // Queued behind an unfinished predecessor. Correct, and the largest class.
      bucket = 'queued (dependency unsatisfied)';
    } else if (openKids) {
      bucket = 'children in progress';
    } else if (executed) {
      // Executed at least once, nothing left to wait for, and still non-terminal:
      // either the children all settled and the harness never re-entered SYNTHESIZE,
      // or CREATE produced no children at all. Both are the non-terminal-family shape.
      bucket = 'SETTLED (harness not re-entered)';
    } else {
      bucket = 'UNEXPLAINED';
    }

    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    if (LOUD.has(bucket)) {
      const since = lastExec.get(t.id);
      const age = since
        ? `${Math.floor((Date.now() - since.getTime()) / 3_600_000)}h since last execution`
        : 'never executed';
      (named[bucket] ??= []).push({ id: t.id, title: t.title, created: t.createdAt, age });
    }
  }

  console.log('\n📊 PIPELINE run liveness\n' + '='.repeat(52));
  for (const b of BUCKETS) {
    const n = counts.get(b) ?? 0;
    const mark = LOUD.has(b) && n > 0 ? '  ⚠️' : '';
    console.log(`  ${b.padEnd(34)} ${String(n).padStart(4)}${mark}`);
  }
  console.log('='.repeat(52));
  console.log(`  total non-terminal                 ${String(tasks.length).padStart(4)}`);

  const loudTotal = [...LOUD].reduce((s, b) => s + (counts.get(b) ?? 0), 0);
  if (loudTotal === 0) {
    console.log('\n✅ Every non-terminal run has a machine-readable reason.\n');
  } else {
    console.log('\n⚠️  Only the marked buckets are worth investigating. Everything above them is a');
    console.log('    run behaving correctly — queued, mid-flight, or stopped with a recorded reason.');
    console.log('');
    console.log('    SETTLED  — children all terminal (or none created) and the harness has not');
    console.log('               re-entered. A few minutes here is the normal retrigger window; hours');
    console.log('               is the non-terminal-family shape (F16/F17/F20/R4). Read the age.');
    console.log('    UNEXPLAINED — no predicate matched. That means the question has not been asked,');
    console.log('               NOT that a defect has been found. Add the predicate.');
    if (LIST) {
      for (const b of LOUD) {
        for (const u of named[b] ?? []) {
          console.log(`\n    [${b}]`);
          console.log(`    ${u.created.toISOString().slice(0, 10)}  ${u.id}  ${u.age}`);
          console.log(`      ${u.title.slice(0, 68)}`);
        }
      }
      console.log('');
    } else {
      console.log('\n    Re-run with --list to name them.');
    }
  }
  console.log('');
  await prisma.$disconnect();
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
