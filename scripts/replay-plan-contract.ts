#!/usr/bin/env ts-node
/**
 * replay-plan-contract.ts — run the SHIPPING plan resolver (lib/agents/harness/plan-spawn-carry.ts) over real
 * program roots. READ-ONLY. Run by hand, never in CI.
 *
 *   npm run replay:plan-contract                      # every program root: resolution census + predictions
 *   npm run replay:plan-contract -- --root <rootId>   # one root: the LIVE-VALIDATION instrument (v2 §5.3)
 *   npm run replay:plan-contract -- --carry [--since <ISO>]   # C3-a: what the clearance carry WOULD write
 *
 * Point DATABASE_URL at a read-only connection (`options=-c default_transaction_read_only=on`).
 *
 * WHY. C2-a stores the PLAN's interface contract at create and lets a contract-less Node C inherit it. Whether a
 * plan resolves is a property of real Architect outputs, so the census is measured with the shipping module, not
 * a re-implementation (the plan-time numbers came from a Python re-implementation and `strpos`; this replaces them).
 *
 * Census mode prints, per the v2 §4.4 exit:
 *   - the resolution reason for every root (expected: all resolve except the named misses);
 *   - the expected-ZERO reasons (too-deep, not-storable, heading-not-atx, section-oversize, response-oversize,
 *     empty-object) — any non-zero is read before ship;
 *   - since 08-26: roots with legs, resolved / total;
 *   - since 08-28: the `suppliedMatched` prediction per contract-bearing child (legs, Node C) and per root;
 *   - `legBaseline` per root and the would-be Q5 outcome for every contract-LESS reviewer-set child.
 *
 * Live mode (`--root`) recomputes `planSha256` and each contract-bearing child's LIVE canonical sha, and checks
 * `storedAtWriteSha256 === planSha256 === live sha` and `source:'plan'` on every row. This is the PRIMARY live
 * instrument; the forensics §4c SQL is an independent cross-check (it cannot reproduce these hashes from SQL —
 * jsonb orders keys by length then bytes).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  resolvePlanContract,
  legBaseline,
  canonicalContractSha,
  planProgramClearanceCarry,
  clearanceTokens,
  type PlanDb,
  type PlanResolution,
} from '../lib/agents/harness/plan-spawn-carry';
import { PROGRAM_PROTOCOL_NAMES, canonicalProtocolName } from '../lib/agents/harness/program-protocol';
import { isReviewerSet } from '../lib/agents/harness/parse-verdict';

const prisma = new PrismaClient();
const db = prisma as unknown as PlanDb;
const EXPECTED_ZERO: PlanResolution[] = ['too-deep', 'not-storable', 'heading-not-atx', 'section-oversize', 'response-oversize', 'empty-object'];
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

async function children(stageId: string) {
  return prisma.task.findMany({
    where: { stageId },
    select: { id: true, title: true, type: true, agentRole: true, createdAt: true, metadata: true, inputContext: true,
      agentTemplate: { select: { templateType: true } } },
  });
}

async function census() {
  const names = PROGRAM_PROTOCOL_NAMES.map(canonicalProtocolName);
  const roots = await prisma.$queryRaw<Array<{ id: string; ps: string | null; protocol: string; created: Date }>>`
    SELECT id, metadata->>'pipelineStageId' AS ps, metadata->>'protocol' AS protocol, created_at AS created
      FROM tasks WHERE type = 'PIPELINE' AND metadata->>'protocol' = ANY(${names}) ORDER BY created_at`;
  const byStatus = new Map<string, string[]>();
  const D0826 = new Date('2026-08-26T00:00:00Z'), D0828 = new Date('2026-08-28T00:00:00Z');
  let r0826 = 0, r0826ok = 0;
  const pred = { legsTrue: 0, legsFalse: 0, nodeCTrue: 0, nodeCFalse: 0, rootsExact: 0, rootsDiffer: 0 };
  const q5: Array<{ root: string; child: string; outcome: string }> = [];
  const baselines: Array<{ root: string; legCount: number; distinct: number; equalsPlan: boolean | null; comparand: string | null }> = [];

  for (const r of roots) {
    let status: string;
    let planSha: string | null = null;
    if (!r.ps) status = 'no-program-stage';
    else {
      try {
        const p = await resolvePlanContract(db, r.ps);
        status = p.status; planSha = p.planSha256;
      } catch (e) { status = `resolver-error (${(e as Error)?.name})`; }
    }
    byStatus.set(status, [...(byStatus.get(status) ?? []), `${r.id} ${r.protocol} ${r.created.toISOString().slice(0, 10)}`]);
    if (!r.ps) continue;
    const kids = await children(r.ps);
    const legs = kids.filter((k) => k.type === 'PIPELINE');
    if (legs.some((l) => l.createdAt >= D0826)) { r0826++; if (status === 'resolved') r0826ok++; }

    if (status === 'resolved' && planSha) {
      const lb = await legBaseline(db, r.ps, null, planSha);
      baselines.push({ root: r.id, legCount: lb.baseline.legCount, distinct: lb.baseline.distinctShas.length, equalsPlan: lb.baseline.equalsPlan, comparand: lb.comparand });
      for (const k of kids) {
        const reviewer = k.type !== 'PIPELINE' && isReviewerSet(k.agentRole, k.agentTemplate?.templateType ?? null);
        const c = (k.inputContext as Record<string, unknown> | null)?.interfaceContract;
        if (reviewer && !isObj(c)) q5.push({ root: r.id, child: k.id, outcome: lb.comparand ? `refuse ${lb.comparand}` : 'inherit' });
      }
      if (legs.some((l) => l.createdAt >= D0828)) {
        let anyDiffer = false, anyHeld = false;
        for (const k of kids) {
          const c = (k.inputContext as Record<string, unknown> | null)?.interfaceContract;
          if (!isObj(c)) continue;
          anyHeld = true;
          const match = canonicalContractSha(c) === planSha;
          if (!match) anyDiffer = true;
          if (k.type === 'PIPELINE') match ? pred.legsTrue++ : pred.legsFalse++;
          else if (isReviewerSet(k.agentRole, k.agentTemplate?.templateType ?? null)) match ? pred.nodeCTrue++ : pred.nodeCFalse++;
        }
        if (anyHeld) anyDiffer ? pred.rootsDiffer++ : pred.rootsExact++;
      }
    }
  }

  console.log(`\nprogram roots: ${roots.length}  (protocols: ${names.join(', ')})`);
  for (const [s, ids] of [...byStatus.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${s.padEnd(28)} ${ids.length}`);
    if (s !== 'resolved') for (const id of ids) console.log(`      ${id}`);
  }
  console.log('\nexpected-ZERO reasons:');
  for (const z of EXPECTED_ZERO) console.log(`  ${z.padEnd(20)} ${(byStatus.get(z) ?? []).length}`);
  console.log(`\nroots with legs since 08-26: resolved ${r0826ok} / ${r0826}`);
  console.log(`since 08-28 suppliedMatched predictions: legs ${pred.legsTrue} true / ${pred.legsFalse} false · ` +
    `Node C ${pred.nodeCTrue} / ${pred.nodeCFalse} · roots ${pred.rootsExact} all-exact / ${pred.rootsDiffer} some-differ`);
  const cmp = new Map<string, number>();
  for (const b of baselines) cmp.set(b.comparand ?? 'pass (legs = plan)', (cmp.get(b.comparand ?? 'pass (legs = plan)') ?? 0) + 1);
  console.log(`\nlegBaseline over resolved roots: ${[...cmp.entries()].map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  const q5c = new Map<string, number>();
  for (const q of q5) q5c.set(q.outcome, (q5c.get(q.outcome) ?? 0) + 1);
  console.log(`would-be Q5 for contract-LESS reviewer-set children (resolved roots): ${q5.length} — ${[...q5c.entries()].map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}`);
}

/**
 * C3-a replay: for every program root holding a METADATA clearance (since `since`), run the SHIPPING read-only
 * planner (`planProgramClearanceCarry`: S7 binding, shape, prior stages) per leg and compute what the carry
 * statement would append, with the shipping token rule (`clearanceTokens`, the JS mirror of the statement's
 * SQL rule — the statement itself is proved on real Postgres by test:plan-spawn-carry-behavioral; prod is
 * read-only, so it is never executed here). A carry only APPENDS, so "narrow" is 0 by construction; it is
 * counted anyway. Also prints description-only roots and unbound roots (both expected 0 since 09-25).
 */
async function carryReplay(since: string) {
  const names = PROGRAM_PROTOCOL_NAMES.map(canonicalProtocolName);
  const roots = await prisma.$queryRaw<Array<{ id: string; ps: string | null; ack_type: string | null; desc_clear: boolean }>>`
    SELECT id, metadata->>'pipelineStageId' AS ps, jsonb_typeof(metadata->'duplicateAcknowledged') AS ack_type,
           COALESCE(description, '') ILIKE '%PRE-FLIGHT CLEARANCE:%' AS desc_clear
      FROM tasks WHERE type = 'PIPELINE' AND metadata->>'protocol' = ANY(${names}) AND created_at >= ${new Date(since)}
     ORDER BY created_at`;
  let rootsWith = 0, legs = 0, noWrite = 0, write = 0, fromEmpty = 0, narrow = 0, unbound = 0, shape = 0;
  const descOnly: string[] = [], unboundRoots: string[] = [];
  for (const r of roots) {
    const hasMeta = r.ack_type === 'string' || r.ack_type === 'array';
    if (!hasMeta) { if (r.desc_clear) descOnly.push(r.id); continue; }
    if (!r.ps) continue;
    rootsWith++;
    const kids = await prisma.task.findMany({ where: { stageId: r.ps, type: 'PIPELINE' }, select: { id: true, metadata: true } });
    let rootUnbound = false;
    for (const k of kids) {
      legs++;
      const m = (k.metadata as Record<string, unknown> | null) ?? {};
      const plan = await planProgramClearanceCarry(db, { stageId: r.ps, legMetadata: m });
      if (plan.outcome === 'skipped') { if (plan.reason === 'root-clearance-unbound') { unbound++; rootUnbound = true; } else shape++; continue; }
      if (plan.outcome !== 'carry') { noWrite++; continue; }
      const cur = clearanceTokens(m.duplicateAcknowledged) ?? [];
      const missing = plan.target.filter((t) => !cur.includes(t));
      const after = [...cur, ...missing];
      if (cur.some((t) => !after.includes(t))) narrow++;
      if (missing.length === 0) noWrite++;
      else { write++; if (cur.length === 0) fromEmpty++; }
    }
    if (rootUnbound) unboundRoots.push(r.id);
  }
  console.log(`
C3 carry replay since ${since}: ${rootsWith} roots with a metadata clearance / ${legs} legs → ` +
    `${noWrite} no-write, ${write} write (${fromEmpty} from empty), ${narrow} narrow · skipped: unbound ${unbound}, existing-shape ${shape}`);
  console.log(`description-only cleared roots (NOT carried): ${descOnly.length}${descOnly.length ? ' — ' + descOnly.join(', ') : ''}`);
  console.log(`unbound roots (S7 skip): ${unboundRoots.length}${unboundRoots.length ? ' — ' + unboundRoots.join(', ') : ''}`);
}

async function live(rootId: string) {
  const root = await prisma.task.findUnique({ where: { id: rootId }, select: { metadata: true } });
  const ps = (root?.metadata as Record<string, unknown> | null)?.pipelineStageId as string | undefined;
  if (!ps) { console.log(`❌ ${rootId}: no metadata.pipelineStageId`); process.exitCode = 1; return; }
  const p = await resolvePlanContract(db, ps);
  console.log(`root ${rootId} program stage ${ps}: plan ${p.status} sha ${p.planSha256 ?? '—'} architect ${p.architectTaskId ?? '—'}/${p.architectExecutionId ?? '—'}`);
  let bad = 0;
  for (const k of await children(ps)) {
    const c = (k.inputContext as Record<string, unknown> | null)?.interfaceContract;
    const f = (k.metadata as Record<string, any> | null)?.interfaceContractSource;
    const liveSha = isObj(c) ? canonicalContractSha(c) : null;
    const ok = !isObj(c) || (f?.source === 'plan' || f?.source === 'plan-inherited') && f?.storedAtWriteSha256 === p.planSha256 && liveSha === p.planSha256;
    if (!ok) bad++;
    console.log(`  ${ok ? '✅' : '❌'} ${k.id} ${k.type.padEnd(8)} ${(k.agentRole ?? '—').padEnd(22)} source=${f?.source ?? '—'} ` +
      `resolution=${f?.planResolution ?? '—'} suppliedMatched=${f?.suppliedMatched ?? '—'} live=${liveSha?.slice(0, 12) ?? 'none'} ` +
      `stored=${f?.storedAtWriteSha256?.slice(0, 12) ?? '—'} carry=${JSON.stringify((k.metadata as any)?.duplicateAcknowledgedCarry?.lastAttempt ?? null)}`);
  }
  console.log(bad ? `❌ ${bad} row(s) off-plan — read their planResolution` : '✅ every contract-bearing row holds the plan (stored = plan = live)');
  if (bad) process.exitCode = 1;
}

(async () => {
  const i = process.argv.indexOf('--root');
  const sinceIdx = process.argv.indexOf('--since');
  if (i >= 0 && process.argv[i + 1]) await live(process.argv[i + 1]);
  else if (process.argv.includes('--carry')) await carryReplay(sinceIdx >= 0 ? process.argv[sinceIdx + 1] : '2026-09-25T01:31:00Z');
  else await census();
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
