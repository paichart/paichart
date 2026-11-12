#!/usr/bin/env ts-node
/**
 * gate-check.ts — print what to check before releasing a program GATE, from stored facts. READ-ONLY.
 *
 *   npm run report:gate -- <gate task id>
 *
 * The operator runbook (`.claude/knowledge/pipelines/OPERATOR-RUNBOOK.md` Step 3) lists what to check at each gate; this prints those
 * checks with the facts behind them, so anyone can release a gate with the same evidence the coordinator uses. It decides nothing:
 * every line is a stored fact (Protocol 10), marked ✓ / ✗ / · (informational) against the runbook's check, and the last line says the
 * release is the person's decision. Gate type is derived from what the gate depends on:
 *   PLAN gate   — depends on the Program Architect (non-PIPELINE): the legs, their types, the contract each holds, the plan's
 *                 "Assumptions & Open Questions" (the defaults that apply if you release);
 *   VALUE gate  — depends on a value leg (network-derivation): its outcome, the derived values, containment, the reviewer;
 *   CHANGE gate — depends on a change leg: outcome, the kept-file receipt, what the reviewer saw, consumed vs upstream, the reviewer.
 *
 * Every query runs inside ONE transaction set READ ONLY. Point DATABASE_URL at production from the server (`cd current && source
 * .env.production`) or at a read-only connection.
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { DEVICE_SOURCE_LANES, deviceSourceContractKeyOf } from '../lib/agents/harness/held-bytes/variant';

type Tx = Prisma.TransactionClient;
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const parse = (s: string | null | undefined): Record<string, unknown> | null => { if (!s || s[0] !== '{') return null; try { const j = JSON.parse(s); return isObj(j) ? j : null; } catch { return null; } };
interface T { id: string; title: string; type: string; status: string; agentRole: string | null; metadata: unknown; inputContext: unknown; stage_id: string | null }
const meta = (t: T) => (isObj(t.metadata) ? t.metadata : {});
let holds = 0, fails = 0;
const line = (ok: boolean | null, s: string) => { if (ok === true) holds++; if (ok === false) fails++; console.log(`  ${ok === true ? '✓' : ok === false ? '✗' : '·'} ${s}`); };

async function task(tx: Tx, id: string): Promise<T | undefined> {
  return (await tx.$queryRaw<T[]>`SELECT id, title, type::text AS type, status::text AS status, "agentRole", metadata, "inputContext", stage_id FROM tasks WHERE id = ${id}`)[0];
}
async function stageTasks(tx: Tx, stageId: unknown): Promise<T[]> {
  if (typeof stageId !== 'string') return [];
  return tx.$queryRaw<T[]>`SELECT id, title, type::text AS type, status::text AS status, "agentRole", metadata, "inputContext", stage_id FROM tasks WHERE stage_id = ${stageId} ORDER BY created_at`;
}
async function latestArtifact(tx: Tx, taskId: string, name: string): Promise<string | null> {
  const r = await tx.$queryRaw<Array<{ content: string | null }>>`SELECT a.content FROM agent_executions e JOIN agent_artifacts a ON a."executionId" = e.id AND a.name = ${name}
    WHERE e."taskId" = ${taskId} AND e.status = 'SUCCESS' ORDER BY e."createdAt" DESC LIMIT 1`;
  return r[0]?.content ?? null;
}
const tokenOf = (title: string) => (title.match(/\(protocol:\s*([a-z0-9-]+)\)/i)?.[1] ?? '?');

async function planGate(tx: Tx, gate: T, architect: T) {
  console.log(`PLAN gate — the Architect's plan (${architect.id})`);
  const siblings = await stageTasks(tx, gate.stage_id);
  const legs = siblings.filter(t => t.type === 'PIPELINE');
  line(legs.length > 0, `${legs.length} leg(s) created (check: one per system you expected)`);
  // Device sources keys (ARCHITECT-CONTRACT-KEY-BY-LEG, 2026-11-12): the platform reads `deviceSources` ONLY at a protocol key
  // (DEVICE_SOURCE_LANES). A plan that keys it by leg name or anything else leaves every leg reading no Device sources, silently.
  const knownKeys = Object.values(DEVICE_SOURCE_LANES).map(x => x.contractKey);
  const contractOf = (l: T) => (isObj(l.inputContext) && isObj((l.inputContext as Record<string, unknown>).interfaceContract) ? (l.inputContext as Record<string, Record<string, unknown>>).interfaceContract : null);
  const anyDs = legs.map(contractOf).find(c => c && c.deviceSources !== undefined)?.deviceSources;
  if (anyDs !== undefined) {
    if (!isObj(anyDs)) line(false, `the contract's deviceSources is not an object keyed by protocol token — no leg will read Device sources from it`);
    else {
      const unknown = Object.keys(anyDs).filter(k => !knownKeys.includes(k));
      line(unknown.length === 0, `the contract's deviceSources keys: ${Object.keys(anyDs).join(', ') || 'none'}${unknown.length ? ` — NOT read by the platform: ${unknown.join(', ')} (it reads only ${knownKeys.join(', ')})` : ''}`);
    }
  }
  for (const l of legs) {
    const tok = tokenOf(l.title), m = meta(l), src = isObj(m.interfaceContractSource) ? m.interfaceContractSource : {};
    const ic = isObj(l.inputContext) && isObj((l.inputContext as Record<string, unknown>).interfaceContract) ? (l.inputContext as Record<string, Record<string, unknown>>).interfaceContract : null;
    // the contract carries every domain's entry; show only THIS leg's (keyed by its protocol token)
    const repos = ic ? Object.entries(ic).filter(([k, v]) => k === tok && isObj(v) && isObj((v as Record<string, unknown>).configRepo)).map(([, v]) => JSON.stringify((v as Record<string, unknown>).configRepo)) : [];
    const kind = tok.includes('derivation') ? 'VALUE' : 'CHANGE';
    console.log(`    leg ${l.id}  ${kind}  (protocol: ${tok})  ${l.title.slice(0, 70)}`);
    line(m.requiresInterfaceContract === true && !!ic, `      holds the interface contract (source: ${String(src.source ?? src.arm ?? '—')})`);
    const dsKey = deviceSourceContractKeyOf(tok), ds = ic && isObj(ic.deviceSources) ? ic.deviceSources : null;
    if (dsKey && ds) line(ds[dsKey] !== undefined || null, `      Device sources for this leg (key ${dsKey}): ${ds[dsKey] !== undefined ? 'present' : 'none — the leg reads no Git file or device by declaration; check that is intended'}`);
    if (kind === 'CHANGE') line(repos.length > 0 || null, `      config files named in its contract: ${repos.length ? repos.join(' · ') : 'none (a service-held or device leg — check its descriptor)'}`);
  }
  const deps = await tx.$queryRaw<Array<{ taskId: string; dependsOnId: string }>>`SELECT "taskId", "dependsOnId" FROM task_dependencies WHERE "taskId" = ANY(${siblings.map(s => s.id)})`;
  const legIds = new Set(legs.map(l => l.id)), gateIds = new Set(siblings.filter(s => s.type === 'APPROVAL').map(s => s.id));
  for (const t of siblings.filter(s => s.type === 'ACTION' && s.id !== architect.id)) {
    const d = deps.filter(x => x.taskId === t.id).map(x => x.dependsOnId);
    line(d.length > 0 && d.every(x => legIds.has(x)) && !d.some(x => gateIds.has(x)), `${t.title.slice(0, 60)} depends on the legs only (never a gate): ${d.length} dependencies`);
  }
  const report = await latestArtifact(tx, architect.id, 'report.md');
  const i = report ? report.search(/^#+\s*Assumptions\s*&\s*Open Questions/im) : -1;
  if (i >= 0 && report) {
    const rest = report.slice(i); const end = rest.slice(3).search(/\n#{1,2} /); const sec = (end > 0 ? rest.slice(0, end + 3) : rest).slice(0, 2500);
    console.log('  · the plan\'s Assumptions & Open Questions (the defaults that apply if you release):');
    sec.split('\n').slice(1).forEach(x => x.trim() && console.log(`      ${x}`));
  } else line(null, 'no "Assumptions & Open Questions" section found in the plan — read the Architect report directly');
}

async function legChecks(tx: Tx, leg: T, kind: 'VALUE' | 'CHANGE') {
  const m = meta(leg), qg = isObj(m.qualityGate) ? m.qualityGate : {}, he = isObj(qg.heldEdit) ? qg.heldEdit : null;
  console.log(`${kind} gate — leg ${leg.id} (protocol: ${tokenOf(leg.title)}) ${leg.title.slice(0, 70)}`);
  line(leg.status === 'COMPLETED', `leg status ${leg.status}`);
  line(qg.outcome === 'approved', `leg outcome ${String(qg.outcome ?? '—')} (reviewer score ${String(qg.reviewerScore ?? '—')}) — a needs-revision can be the pipeline working: read why`);
  const pi = parse(await latestArtifact(tx, leg.id, 'pipeline-index.json'));
  const dc = isObj(pi?.derivationContainment) ? (pi!.derivationContainment as Record<string, unknown>) : null;
  const disp = dc && isObj(dc.containmentDisposition) ? (dc.containmentDisposition as Record<string, unknown>) : null;
  const viol = Array.isArray(dc?.violations) ? (dc!.violations as unknown[]).length : null;
  if (kind === 'VALUE') {
    line(Array.isArray(dc?.derivedValues) && (dc!.derivedValues as unknown[]).length > 0, `derived value(s): ${JSON.stringify(dc?.derivedValues ?? null)}`);
    line(disp?.reason === 'checked-clean' && viol === 0, `containment: ${String(disp?.reason ?? '—')}, ${viol ?? '?'} violation(s)`);
  } else {
    // a consuming leg is checked against upstream, not recomputed, so it carries no violations list: only a real violation counts
    line((viol ?? 0) === 0 && disp?.disposition === 'benign', `containment: ${String(disp?.reason ?? '—')} (${String(disp?.disposition ?? '—')})${viol === null ? '' : `, ${viol} violation(s)`}`);
    if (Array.isArray(dc?.consumedValues)) line(true, `consumed value(s): ${JSON.stringify(dc!.consumedValues)} — checked against upstream`);
    if (isObj(dc?.carriedInDerivedBlock)) line(null, `carriedInDerivedBlock: ${JSON.stringify(dc!.carriedInDerivedBlock)} (checked as consumed)`);
    if (he) {
      line(he.state === 'applied' || he.state === 'no-edits', `kept-file edit: state ${String(he.state)}, in scope ${String(he.inScope)}`);
      line(he.reviewerSaw === 'rendered' || he.state === 'no-edits', `the reviewer saw: ${String(he.reviewerSaw ?? '—')} (the platform's diff = rendered)`);
      line(he.forced !== true, `forced by the platform: ${he.forced === true ? `YES (${String(he.reason)})` : 'no'}`);
    } else line(null, 'no kept-file fact on this leg (a leg with no held file)');
  }
  const kids = await stageTasks(tx, m.pipelineStageId);
  const author = kids.find(k => k.agentRole === 'config_change_author');
  if (author) {
    const ea = parse(await latestArtifact(tx, author.id, 'result.json'))?.editApplication;
    if (isObj(ea)) line(ea.state === 'applied' && Number(ea.applied) === Number(ea.total), `edit receipt: ${String(ea.applied)}/${String(ea.total)} applied, refused ${JSON.stringify(ea.refused ?? {})}, files ${JSON.stringify(ea.files ?? [])}`);
  }
  for (const r of kids.filter(k => /reviewer/.test(k.agentRole ?? ''))) {
    const v = parse(await latestArtifact(tx, r.id, 'result.json'))?.reviewerVerdict;
    if (isObj(v)) {
      const eg = isObj(v.evidenceGrading) ? v.evidenceGrading : {};
      line(v.approved === true && Array.isArray(v.blocking) && v.blocking.length === 0, `${r.agentRole} verdict: ${v.approved === true ? 'APPROVED' : 'NOT approved'}, ${Array.isArray(v.blocking) ? v.blocking.length : '?'} blocking; findings verified ${String(eg.verifiedLines ?? '?')} / accepted on trust ${String(eg.acceptedLines ?? '?')}`);
      if (Array.isArray(v.blocking) && v.blocking.length) (v.blocking as unknown[]).forEach(b => console.log(`      blocking: ${String(b).slice(0, 200)}`));
    } else line(false, `${r.agentRole}: no verdict found`);
  }
}

async function main() {
  const gateId = process.argv.slice(2).find(a => !a.startsWith('-'));
  if (!gateId) { console.error('usage: gate-check.ts <gate task id>'); process.exit(2); }
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const gate = await task(tx, gateId);
      if (!gate) { console.error(`task ${gateId} not found`); process.exit(2); }
      console.log(`GATE ${gate.id} [${gate.type}, ${gate.status}] ${gate.title.slice(0, 90)}`);
      if (gate.type !== 'APPROVAL') console.log('  · note: this task is not an APPROVAL task — reading it as a gate anyway');
      const dep = (await tx.$queryRaw<Array<{ dependsOnId: string }>>`SELECT "dependsOnId" FROM task_dependencies WHERE "taskId" = ${gateId}`).map(d => d.dependsOnId);
      if (!dep.length) { console.error('this gate depends on nothing — cannot tell what it gates'); process.exit(2); }
      for (const id of dep) {
        const up = await task(tx, id); if (!up) continue;
        if (up.type !== 'PIPELINE') await planGate(tx, gate, up);
        else await legChecks(tx, up, tokenOf(up.title).includes('derivation') ? 'VALUE' : 'CHANGE');
      }
      console.log(`\n${holds} check(s) hold · ${fails} do not${fails ? ' — read each ✗ before releasing' : ''}. Releasing is your decision (task.complete with a note of what you checked).`);
    }, { timeout: 120_000 });
  } finally { await prisma.$disconnect(); }
}
main().catch(e => { console.error(e); process.exit(1); });
