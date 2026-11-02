#!/usr/bin/env ts-node
/**
 * canary-check.ts — read a CANARY program run and print its pre-registered verdict from stored facts. READ-ONLY.
 *
 *   npm run report:canary -- --root <canaryRootId> [--expect <protocol>@<version> ...] [--control <name> ...]
 *
 * The no-regression rule (Protocol 16 § standing rule): after every agent-text deploy, re-run the latest released program
 * from its published spec as a NEW root; it must release again before the next text change ships. This turns that run
 * into a verdict a person can check in a minute, keyed on stored facts only (Protocol 10 — no score, no adjective):
 *
 *   VOID     an --expect is unmet: no execution in the program ran the deployed text (or ran a different version).
 *            The canary tested nothing; re-run after the deploy/reseed has landed.
 *   PENDING  the root is not COMPLETED yet (or is held at a gate) — read again later.
 *   PASS     root COMPLETED and `metadata.programReleasable === true`.
 *   FAIL     root COMPLETED (or FAILED) without `programReleasable: true`. A finding: the same spec released before.
 *            Read the per-leg lines and hand-read the non-approved legs before any next text change.
 *
 * --expect name@version   every program execution whose `protocolInjection.delta.name` (or named-mode protocolNames) is
 *                         `name` must carry `version`, and at least one must exist — otherwise VOID. Read from
 *                         `pipeline-index.json` for PIPELINE executions (they write no result.json) and `result.json` else.
 *
 * --control <name>        a pre-registered LIVE CONTROL for one shipped change (CONTROLS below). Each control classifies
 *                         itself as PASS / PASS-DECLINED / UNEXERCISED / FINDING. UNEXERCISED is an absence, not a pass.
 *
 * Read-only: every query runs inside ONE transaction set `READ ONLY` (the database enforces it, not intent). Point
 * DATABASE_URL at production from the server (`cd current && source .env.production`) or a read-only replica.
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const args = process.argv.slice(2);
const many = (flag: string) => args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
const ROOT = many('--root')[0];
const EXPECT = many('--expect').map(s => { const at = s.lastIndexOf('@'); return { name: s.slice(0, at), version: s.slice(at + 1) }; });
const CONTROL_NAMES = many('--control');

interface TaskRow { id: string; title: string; type: string; status: string; agentRole: string | null; metadata: unknown; stage_id: string | null; created_at: Date }
interface ExecRow { id: string; taskId: string; status: string; errorCode: string | null; createdAt: Date; logs: string[]; art: string | null; artName: string | null }

const meta = (t: TaskRow) => (isObj(t.metadata) ? t.metadata : {});
const parse = (s: string | null): Record<string, unknown> | null => { if (!s || s[0] !== '{') return null; try { const j = JSON.parse(s); return isObj(j) ? j : null; } catch { return null; } };

async function stageTasks(tx: Tx, stageId: string | null): Promise<TaskRow[]> {
  if (!stageId) return [];
  return tx.$queryRaw<TaskRow[]>`SELECT id, title, type::text AS type, status::text AS status, "agentRole", metadata, stage_id, created_at
    FROM tasks WHERE stage_id = ${stageId} ORDER BY created_at`;
}
async function executions(tx: Tx, taskIds: string[]): Promise<ExecRow[]> {
  if (!taskIds.length) return [];
  return tx.$queryRaw<ExecRow[]>`SELECT e.id, e."taskId", e.status, e."errorCode", e."createdAt", e.logs,
      a.content AS art, a.name AS "artName"
    FROM agent_executions e
    LEFT JOIN agent_artifacts a ON a."executionId" = e.id AND a.name IN ('result.json', 'pipeline-index.json')
    WHERE e."taskId" = ANY(${taskIds}) ORDER BY e."createdAt"`;
}

// ── pre-registered live controls (one per shipped change; add new ones here, never edit a used one) ─────────────
interface Ctx { root: TaskRow; legs: TaskRow[]; nodeC: TaskRow[]; execs: ExecRow[] }
type ControlResult = { verdict: 'PASS' | 'PASS-DECLINED' | 'UNEXERCISED' | 'FINDING'; lines: string[] };
const CONTROLS: Record<string, { what: string; run: (c: Ctx) => ControlResult }> = {
  // Wave 3 D2 (pov-program 2.2.1, 2026-10-31): PLAN-SPAWN Step 4 now states the create-absent heal truthfully.
  'd2-contract-omission': {
    what: 'pov-program 2.2.1 Step 4 — a leg created without interfaceContract is supplied from the plan, or declines and fails loud naming the reason',
    run: ({ root, legs, execs }) => {
      const lines: string[] = []; let finding = false, healed = 0, declined = 0;
      for (const l of legs) {
        const m = meta(l), src = isObj(m.interfaceContractSource) ? m.interfaceContractSource : {};
        const arm = String(src.arm ?? '(none)');
        const cannot = isObj(m.cannotRun) ? JSON.stringify(m.cannotRun) : String(m.cannotRun ?? '');
        const superseded = /supersed/i.test(cannot);
        const missing = execs.some(e => e.taskId === l.id && (e.errorCode === 'INTERFACE_CONTRACT_MISSING' || e.logs.some(x => x.includes('INTERFACE_CONTRACT_MISSING'))))
          || /INTERFACE_CONTRACT_MISSING/.test(cannot);
        lines.push(`  leg ${l.id} arm=${arm}${src.declineReason ? ` declineReason=${String(src.declineReason)}` : ''}${superseded ? ' SUPERSEDED' : ''}${missing ? ' INTERFACE_CONTRACT_MISSING' : ''}`);
        if (arm === 'create-absent') { healed++; if (superseded || missing) finding = true; }
        else if (arm === 'create-absent-declined') { declined++; if (!missing && l.status === 'COMPLETED') lines.push('    (declined yet completed — read it)'); }
        else if (superseded) finding = true;
      }
      // the harness still behaving as if the old sentence held: a task.update carrying interfaceContract
      const rootCalls = execs.filter(e => e.taskId === root.id).flatMap(e => {
        const j = parse(e.art); return Array.isArray(j?.toolCalls) ? (j!.toolCalls as unknown[]) : [];
      });
      const updates = rootCalls.filter(c => isObj(c) && /task\.update/.test(JSON.stringify(c.arguments ?? '')) && /interfaceContract/.test(JSON.stringify(c.arguments ?? '')));
      if (updates.length) { finding = true; lines.push(`  ${updates.length} task.update call(s) from the root carried interfaceContract (create-only) — FINDING`); }
      if (finding) return { verdict: 'FINDING', lines };
      if (healed) return { verdict: 'PASS', lines: [...lines, `  ${healed} leg(s) supplied from the plan`] };
      if (declined) return { verdict: 'PASS-DECLINED', lines: [...lines, `  ${declined} decline(s), each predicted by the text — read the reason`] };
      return { verdict: 'UNEXERCISED', lines: [...lines, '  every leg was created with its contract — an absence, not a pass'] };
    },
  },
};

async function main() {
  if (!ROOT) { console.error('usage: canary-check.ts --root <id> [--expect name@version ...] [--control name ...]'); process.exit(2); }
  for (const c of CONTROL_NAMES) if (!CONTROLS[c]) { console.error(`unknown control "${c}" — known: ${Object.keys(CONTROLS).join(', ')}`); process.exit(2); }
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const [root] = await tx.$queryRaw<TaskRow[]>`SELECT id, title, type::text AS type, status::text AS status, "agentRole", metadata, stage_id, created_at FROM tasks WHERE id = ${ROOT}`;
      if (!root) { console.error(`root ${ROOT} not found`); process.exit(2); }
      const rm = meta(root);
      const children = await stageTasks(tx, typeof rm.pipelineStageId === 'string' ? rm.pipelineStageId : null);
      const legs = children.filter(t => t.type === 'PIPELINE');
      const legKids = (await Promise.all(legs.map(l => stageTasks(tx, typeof meta(l).pipelineStageId === 'string' ? (meta(l).pipelineStageId as string) : null)))).flat();
      const nodeC = children.filter(t => t.type !== 'PIPELINE' && t.agentRole === 'change_reviewer');
      const execs = await executions(tx, [root.id, ...children.map(t => t.id), ...legKids.map(t => t.id)]);

      console.log(`CANARY ${root.id} · "${root.title}"`);
      console.log(`  protocol=${String(rm.protocol ?? '?')} status=${root.status} legs=${legs.length} nodeC=${nodeC.length} executions=${execs.length}`);

      // VOID check
      let voidReason = '';
      for (const ex of EXPECT) {
        const seen = new Map<string, number>();
        for (const e of execs) {
          const pi = parse(e.art)?.protocolInjection;
          if (!isObj(pi)) continue;
          const d = isObj(pi.delta) ? pi.delta : null;
          const names = d ? [String(d.name)] : Array.isArray(pi.protocolNames) ? pi.protocolNames.map(String) : [];
          if (!names.some(n => n === ex.name || n === `${ex.name}-protocol` || `${n}-protocol` === ex.name)) continue;
          const v = d ? String(d.version ?? 'null') : 'named-mode';
          seen.set(v, (seen.get(v) ?? 0) + 1);
        }
        const summary = [...seen].map(([v, n]) => `${v}×${n}`).join(', ') || 'none';
        console.log(`  expect ${ex.name}@${ex.version}: ran ${summary}`);
        if (!seen.has(ex.version)) voidReason ||= `no execution ran ${ex.name}@${ex.version}`;
        else if ([...seen.keys()].some(v => v !== ex.version && v !== 'named-mode')) voidReason ||= `mixed versions of ${ex.name} (${summary}) — the deploy landed mid-run`;
      }

      // per-leg facts
      for (const l of legs) {
        const m = meta(l), qg = isObj(m.qualityGate) ? m.qualityGate : {}, he = isObj(qg.heldEdit) ? qg.heldEdit : null;
        const kids = legKids.filter(k => k.stage_id === m.pipelineStageId);
        const rev = kids.filter(k => k.agentRole && /reviewer/.test(k.agentRole));
        const verdicts = rev.map(r => { const last = execs.filter(e => e.taskId === r.id && e.artName === 'result.json').pop(); const v = parse(last?.art ?? null)?.reviewerVerdict; return isObj(v) ? `${v.approved === true ? 'approved' : 'not-approved'}` : 'no-verdict'; });
        console.log(`  leg  ${l.status.padEnd(11)} outcome=${String(qg.outcome ?? '—').padEnd(14)} reviewer=${verdicts.join('/') || '—'}${he?.forced ? ` FORCED(${String(he.reason)})` : ''} · ${l.title.slice(0, 70)}`);
      }
      for (const n of nodeC) {
        const last = execs.filter(e => e.taskId === n.id && e.artName === 'result.json').pop(); const v = parse(last?.art ?? null)?.reviewerVerdict;
        console.log(`  nodeC ${n.status.padEnd(10)} reviewer=${isObj(v) ? (v.approved === true ? 'approved' : 'not-approved') : 'no-verdict'} · ${n.title.slice(0, 70)}`);
      }

      const releasable = rm.programReleasable;
      let verdict: string;
      if (voidReason) verdict = `VOID — ${voidReason}`;
      else if (root.status !== 'COMPLETED' && root.status !== 'FAILED') verdict = `PENDING — root is ${root.status}`;
      else if (releasable === true) verdict = 'PASS — programReleasable: true';
      else verdict = `FAIL — root ${root.status}, programReleasable: ${String(releasable)} (the same spec released before: hand-read the non-approved legs before the next text change)`;
      console.log(`\nCANARY VERDICT: ${verdict}`);

      for (const name of CONTROL_NAMES) {
        const r = CONTROLS[name].run({ root, legs, nodeC, execs });
        console.log(`\nCONTROL ${name}: ${voidReason ? 'VOID (canary void)' : r.verdict}\n  ${CONTROLS[name].what}`);
        r.lines.forEach(x => console.log(x));
      }
    }, { timeout: 120_000 });
  } finally { await prisma.$disconnect(); }
}
main().catch(e => { console.error(e); process.exit(1); });
