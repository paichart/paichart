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
import { computeLiveEvidenceFromReadRecord } from '../lib/agents/harness/live-evidence';
import { parseDeviceSourceLine } from '../lib/agents/harness/device-sources';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { leanFactsLine } = require('../lib/mcp/server/tools/advanced/lean-card-facts');
import { pickResultJsonSummary } from '../lib/services/execution-artifacts';

type Tx = Prisma.TransactionClient;
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const args = process.argv.slice(2);
const many = (flag: string) => args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
const ROOT = many('--root')[0];
const EXPECT = many('--expect').map(s => { const at = s.lastIndexOf('@'); return { name: s.slice(0, at), version: s.slice(at + 1) }; });
const CONTROL_NAMES = many('--control');

interface TaskRow { id: string; title: string; type: string; status: string; agentRole: string | null; metadata: unknown; stage_id: string | null; created_at: Date; description?: string | null; contract?: unknown }
interface ExecRow { id: string; taskId: string; status: string; errorCode: string | null; createdAt: Date; logs: string[]; art: string | null; artName: string | null }

const meta = (t: TaskRow) => (isObj(t.metadata) ? t.metadata : {});
const parse = (s: string | null): Record<string, unknown> | null => { if (!s || s[0] !== '{') return null; try { const j = JSON.parse(s); return isObj(j) ? j : null; } catch { return null; } };

async function stageTasks(tx: Tx, stageId: string | null): Promise<TaskRow[]> {
  if (!stageId) return [];
  return tx.$queryRaw<TaskRow[]>`SELECT id, title, type::text AS type, status::text AS status, "agentRole", metadata, stage_id, created_at,
      description, ("inputContext" -> 'interfaceContract') AS contract
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
interface Ctx { root: TaskRow; legs: TaskRow[]; nodeC: TaskRow[]; execs: ExecRow[]; legKids: TaskRow[] }

// VALUE-LEG-GIT (network-derivation 1.3.0, 2026-11-06; LAB-RESULT-VLG.md §4): shared helpers for the vlg-* controls.
const VALUE_PROTOCOL = 'network-derivation-protocol';
const valueLegs = (legs: TaskRow[]) => legs.filter((l) => meta(l).protocol === VALUE_PROTOCOL);
const CHANGE_PROTOCOL = 'network-provisioning-protocol';
const changeLegs = (legs: TaskRow[]) => legs.filter((l) => meta(l).protocol === CHANGE_PROTOCOL);
const kidsOf = (l: TaskRow, kids: TaskRow[]) => kids.filter((k) => k.stage_id === meta(l).pipelineStageId);
const latestResult = (execs: ExecRow[], taskId: string, name = 'result.json') => {
  const e = execs.filter((x) => x.taskId === taskId && x.artName === name).pop(); return e ? parse(e.art) : null;
};
const gitFileOnlyWarnings = (rv: unknown): string[] => (isObj(rv) && Array.isArray(rv.warnings)
  ? (rv.warnings as unknown[]).filter((w) => isObj(w) && w.id === 'git-file-only').map((w) => String((w as Record<string, unknown>).text ?? '')) : []);
const devNames = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(isObj(x) ? x.device : x)) : []);
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
  // Config sources network step (network-provisioning 1.26.0, 2026-11-05; DESIGN v2 §3.8 / ME-S10): the liveEvidence fact.
  // Population = the LATEST result.json per task that carries a `deviceSourceReads` stamp (network-provisioning Harvester / Author
  // persists on a device-source leg). network-derivation (the value leg) is outside the version table and stamps nothing — not a miss.
  'live-evidence-stamped': {
    what: 'network-provisioning 1.26.0 — every network execution with a deviceSourceReads stamp carries liveEvidence, and its counts equal a recompute from that stamp',
    run: ({ execs }) => {
      const latest = new Map<string, ExecRow>();
      for (const e of execs) if (e.artName === 'result.json' && parse(e.art)) latest.set(e.taskId, e);
      const lines: string[] = []; let finding = false, checked = 0;
      const devs = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(isObj(x) ? x.device : x)).sort().join(',') : '');
      for (const e of latest.values()) {
        const j = parse(e.art)!; const dsr = j.deviceSourceReads; const le = j.liveEvidence;
        if (!isObj(dsr)) continue;
        checked++;
        if (!isObj(le)) { finding = true; lines.push(`  task ${e.taskId} exec ${e.id}: deviceSourceReads present, liveEvidence ABSENT — FINDING`); continue; }
        if (le.checked !== true) { lines.push(`  task ${e.taskId}: liveEvidence checked:false reason=${String(le.reason)} (read it)`); if (dsr.checked === true) finding = true; continue; }
        const want = computeLiveEvidenceFromReadRecord(dsr) as Record<string, unknown>;
        const diffs = (['summary', 'items', 'liveDeclared', 'liveRead', 'notApplicable'] as const).filter((k) => want[k] !== le[k])
          .concat((['gitOnly', 'liveNotRead', 'liveReadDevices'] as const).filter((k) => devs(want[k]) !== devs(le[k])));
        lines.push(`  task ${e.taskId}: summary=${String(le.summary)} items=${String(le.items)} liveRead=${String(le.liveRead)} gitOnly=[${devs(le.gitOnly)}] liveNotRead=[${devs(le.liveNotRead)}] contractDevices=${JSON.stringify(le.contractDevices ?? null).slice(0, 80)}${diffs.length ? `  ≠ recompute on [${diffs.join(',')}] — FINDING` : ''}`);
        if (diffs.length) finding = true;
      }
      if (finding) return { verdict: 'FINDING', lines };
      if (checked) return { verdict: 'PASS', lines: [...lines, `  ${checked} network execution(s) carry liveEvidence equal to the recompute`] };
      return { verdict: 'UNEXERCISED', lines: [...lines, '  no execution carried a deviceSourceReads stamp — an absence, not a pass'] };
    },
  },

  // ── VALUE-LEG-GIT (network-derivation 1.3.0 + program_architect sentence, 2026-11-06; LAB-RESULT-VLG.md §4, owner G1–G7).
  'vlg-live-evidence-stamped': {
    what: 'network-derivation 1.3.0 — the lane-aware twin of live-evidence-stamped: every execution with a deviceSourceReads stamp carries liveEvidence equal to a recompute with ITS lane options (value lane ⇒ git-only word). Use this instead of live-evidence-stamped on a program with a declared value leg (that control recomputes without lane options, so a Git-only value leg reads ≠ by construction).',
    run: ({ legs, legKids, execs }) => {
      const valueTasks = new Set(valueLegs(legs).flatMap((l) => kidsOf(l, legKids).map((k) => k.id)));
      const latest = new Map<string, ExecRow>();
      for (const e of execs) if (e.artName === 'result.json' && parse(e.art)) latest.set(e.taskId, e);
      const lines: string[] = []; let finding = false, checked = 0;
      for (const e of latest.values()) {
        const j = parse(e.art)!; const dsr = j.deviceSourceReads; const le = j.liveEvidence;
        if (!isObj(dsr)) continue;
        checked++;
        const lane = valueTasks.has(e.taskId) ? 'value' : 'change';
        if (!isObj(le)) { finding = true; lines.push(`  [${lane}] task ${e.taskId}: deviceSourceReads present, liveEvidence ABSENT — FINDING`); continue; }
        if (le.checked !== true) { lines.push(`  [${lane}] task ${e.taskId}: liveEvidence checked:false reason=${String(le.reason)} (read it)`); if (dsr.checked === true) finding = true; continue; }
        const want = computeLiveEvidenceFromReadRecord(dsr, undefined, lane === 'value' ? { gitOnlyWord: true } : {}) as Record<string, unknown>;
        const diffs: string[] = [...(['summary', 'items', 'liveDeclared', 'liveRead', 'notApplicable'] as const).filter((k) => want[k] !== le[k]),
          ...(['gitOnly', 'liveNotRead', 'liveReadDevices'] as const).filter((k) => devNames(want[k]).sort().join() !== devNames(le[k]).sort().join())];
        lines.push(`  [${lane}] task ${e.taskId}: summary=${String(le.summary)} gitOnly=[${devNames(le.gitOnly)}]${diffs.length ? `  ≠ recompute on [${diffs.join(',')}] — FINDING` : ''}`);
        if (diffs.length) finding = true;
      }
      if (finding) return { verdict: 'FINDING', lines };
      if (checked) return { verdict: 'PASS', lines: [...lines, `  ${checked} execution(s) carry liveEvidence equal to the lane-aware recompute`] };
      return { verdict: 'UNEXERCISED', lines: [...lines, '  no execution carried a deviceSourceReads stamp — an absence, not a pass'] };
    },
  },
  'vlg-pa1-contract-keys': {
    what: 'program_architect sentence — each value leg\'s contract carries deviceSources["network-derivation"] (and a change leg\'s keeps deviceSources["network-provisioning"]); the lines print for a hand comparison with requirements.md',
    run: ({ legs }) => {
      const lines: string[] = []; let finding = false; const vl = valueLegs(legs);
      for (const l of legs) {
        const ds = isObj(l.contract) && isObj((l.contract as Record<string, unknown>).deviceSources) ? (l.contract as Record<string, Record<string, unknown>>).deviceSources : null;
        const keys = ds ? Object.keys(ds) : [];
        lines.push(`  leg ${l.id} (${String(meta(l).protocol ?? '?')}) deviceSources keys=[${keys.join(', ')}]`);
        for (const k of keys) lines.push(`    ${k}: ${JSON.stringify(ds![k]).slice(0, 300)}`);
        if (vl.includes(l) && !keys.includes('network-derivation')) { finding = true; lines.push('    value leg WITHOUT deviceSources["network-derivation"] — FINDING (when requirements.md gives the value leg a block)'); }
      }
      if (!vl.length) return { verdict: 'UNEXERCISED', lines: [...lines, '  no network-derivation leg'] };
      return { verdict: finding ? 'FINDING' : 'PASS', lines: [...lines, '  hand-compare each printed line with requirements.md: copied exactly, no merge, no drop'] };
    },
  },
  // VALUE-LEG-GIT fix (owner G9, 2026-11-06): canary B found the compressed Architect sentence wrote a PROSE NOTE under the value key
  // (the platform reads it as an `unparseable` declaration). The fixed sentence: the key ONLY when requirements give the value leg lines.
  'vlg-pa3-no-prose-key': {
    what: 'program_architect "no key unless lines" sentence — a value leg\'s deviceSources["network-derivation"], when present, is source lines that parse; absent is correct when requirements give the leg none',
    run: ({ legs }) => {
      const lines: string[] = []; let finding = false; const vl = valueLegs(legs);
      for (const l of vl) {
        const ds = isObj(l.contract) && isObj((l.contract as Record<string, unknown>).deviceSources) ? (l.contract as Record<string, Record<string, unknown>>).deviceSources : null;
        if (!ds || !('network-derivation' in ds)) { lines.push(`  value leg ${l.id}: no network-derivation key (correct when requirements give it no lines)`); continue; }
        const v = ds['network-derivation'];
        const raw = typeof v === 'string' ? v.split(/\r?\n/) : Array.isArray(v) ? v.map(String) : [JSON.stringify(v)];
        const entries = raw.map((x) => x.trim()).filter((x) => x && !/^#{1,6}[ \t]/.test(x));
        const bad = entries.filter((x) => { const p = parseDeviceSourceLine(x); return !p || !p.ok; });
        lines.push(`  value leg ${l.id}: network-derivation entries=${entries.length} unparsed=${bad.length}${bad.length ? ` — e.g. ${JSON.stringify(bad[0]).slice(0, 140)}` : ''}`);
        if (!entries.length || bad.length) finding = true;
      }
      if (!vl.length) return { verdict: 'UNEXERCISED', lines: [...lines, '  no network-derivation leg'] };
      return { verdict: finding ? 'FINDING' : 'PASS', lines };
    },
  },
  'vlg-h1-brief-block': {
    what: 'network-derivation 1.3.0 — a declared value leg\'s Harvester brief carries a ## Device sources block + the own-key sentence, and the Harvester does not stop on the block-vs-contract difference',
    run: ({ legs, legKids, execs }) => {
      const lines: string[] = []; let finding = false, seen = 0;
      for (const l of valueLegs(legs).filter((x) => isObj(meta(x).deviceSourcesSnapshot))) {
        const h = kidsOf(l, legKids).find((k) => k.agentRole === 'infra_state_harvester'); if (!h) continue; seen++;
        const d = String(h.description ?? '');
        const block = d.includes('## Device sources'), own = d.includes("This block is this leg's own");
        const stopped = isObj(meta(h).cannotRun) || typeof meta(h).cannotRun === 'string' || (latestResult(execs, h.id)?.finalResponse as string ?? '').match(/differs from the contract/i);
        lines.push(`  value leg ${l.id} harvester ${h.id}: block=${block} ownKeySentence=${own} stopped=${!!stopped}`);
        if (!block || !own || stopped) finding = true;
      }
      if (!seen) return { verdict: 'UNEXERCISED', lines: [...lines, '  no declared value leg (no deviceSourcesSnapshot)'] };
      return { verdict: finding ? 'FINDING' : 'PASS', lines };
    },
  },
  'vlg-h2-no-block-no-git': {
    what: 'network-derivation 1.3.0 (BR-1, owner G5 A) — a value leg with NO own block, whose contract carries deviceSources["network-provisioning"], briefs "read no Git file" and its Harvester makes 0 get_file_contents calls',
    run: ({ legs, legKids, execs }) => {
      const lines: string[] = []; let finding = false, seen = 0;
      for (const l of valueLegs(legs).filter((x) => !isObj(meta(x).deviceSourcesSnapshot))) {
        const ds = isObj(l.contract) && isObj((l.contract as Record<string, unknown>).deviceSources) ? (l.contract as Record<string, Record<string, unknown>>).deviceSources : null;
        if (!ds || !('network-provisioning' in ds)) continue;
        const h = kidsOf(l, legKids).find((k) => k.agentRole === 'infra_state_harvester'); if (!h) continue; seen++;
        const sentence = String(h.description ?? '').includes('read no Git file');
        const calls = execs.filter((e) => e.taskId === h.id && e.artName === 'result.json').flatMap((e) => { const j = parse(e.art); return Array.isArray(j?.toolCalls) ? (j!.toolCalls as unknown[]) : []; });
        const gitReads = calls.filter((c) => JSON.stringify(c).includes('get_file_contents')).length;
        lines.push(`  value leg ${l.id} harvester ${h.id}: noGitSentence=${sentence} get_file_contents=${gitReads}`);
        if (!sentence || gitReads > 0) finding = true;
      }
      if (!seen) return { verdict: 'UNEXERCISED', lines: [...lines, '  no undeclared value leg in a program carrying the change key — run one on purpose (the lab could not attribute it)'] };
      return { verdict: finding ? 'FINDING' : 'PASS', lines };
    },
  },
  'vlg-h3-synthesize-names': {
    what: 'network-derivation 1.3.0 — the value leg\'s SYNTHESIZE output names every device its Reviewer\'s git-file-only lines name',
    run: ({ legs, legKids, execs }) => {
      const lines: string[] = []; let finding = false, seen = 0;
      for (const l of valueLegs(legs)) {
        const r = kidsOf(l, legKids).find((k) => k.agentRole === 'derivation_reviewer'); if (!r) continue;
        const warns = gitFileOnlyWarnings(latestResult(execs, r.id)?.reviewerVerdict); if (!warns.length) continue; seen++;
        const synth = String(latestResult(execs, l.id, 'pipeline-index.json')?.finalResponse ?? '');
        const devs = [...new Set(warns.flatMap((w) => w.match(/[A-Za-z0-9][A-Za-z0-9._-]*/g) ?? []).filter((t) => synth.includes(t) || /\d/.test(t)))];
        lines.push(`  value leg ${l.id}: warnings=${warns.length} — read: ${warns.map((w) => w.slice(0, 120)).join(' | ')}`);
        lines.push(`    SYNTHESIZE names (tokens of the warnings found in its output): ${devs.filter((t) => synth.includes(t)).join(', ') || 'NONE'}`);
        if (!devs.some((t) => synth.includes(t))) finding = true;
      }
      if (!seen) return { verdict: 'UNEXERCISED', lines: [...lines, '  no value leg with a git-file-only line'] };
      return { verdict: finding ? 'FINDING' : 'PASS', lines: [...lines, '  hand-read: every Git-only device the warnings name appears in the SYNTHESIZE header'] };
    },
  },
  'vlg-h4-card-and-outcome': {
    what: 'network-derivation 1.3.0 + card (G2-d) — a declared value leg\'s card shows liveEvidence: <word> (declared devices); a Git-only value is approved; one git-file-only line per Git-only device',
    run: ({ legs, legKids, execs }) => {
      const lines: string[] = []; let finding = false, seen = 0;
      for (const l of valueLegs(legs).filter((x) => isObj(meta(x).deviceSourcesSnapshot))) {
        const idx = latestResult(execs, l.id, 'pipeline-index.json'); if (!idx) continue; seen++;
        const card = String(leanFactsLine(pickResultJsonSummary(idx)) ?? '');
        const word = /liveEvidence: ([a-z-]+) \(declared devices\)/.exec(card)?.[1] ?? null;
        const le = isObj(idx.liveEvidence) ? idx.liveEvidence : {};
        const gitOnly = devNames(le.gitOnly);
        const r = kidsOf(l, legKids).find((k) => k.agentRole === 'derivation_reviewer');
        const warns = r ? gitFileOnlyWarnings(latestResult(execs, r.id)?.reviewerVerdict) : [];
        const outcome = String((isObj(meta(l).qualityGate) ? (meta(l).qualityGate as Record<string, unknown>).outcome : null) ?? '—');
        lines.push(`  value leg ${l.id}: card word=${word ?? 'ABSENT'} fact summary=${String(le.summary ?? '—')} gitOnly=[${gitOnly}] warnings=${warns.length} outcome=${outcome}`);
        if (!word || word !== le.summary || (gitOnly.length && (warns.length < gitOnly.length || outcome !== 'approved'))) finding = true;
      }
      if (!seen) return { verdict: 'UNEXERCISED', lines: [...lines, '  no declared value leg with a pipeline-index.json'] };
      return { verdict: finding ? 'FINDING' : 'PASS', lines };
    },
  },

  // ── NB1 network text batch 1 (network-provisioning 1.27.0 + network-derivation 1.3.1, 2026-11-07; LAB-RESULT-NB1.md §(f)).
  // The NB1 network cells shipped at n=5; these controls carry the LIVE evidence. Every one is a proxy that PRINTS what it read:
  // a FINDING is a line to hand-read before the next network text change, never a verdict on its own (Protocol 10).
  'nb1-apply-base': {
    what: 'network-provisioning 1.27.0 Apply base — on a change leg whose Harvester\'s gitDeviceComparison lists differences for a device, the Architect states it and requires an incremental apply (or a Git-sync first), the Author never loads that device\'s file whole, and the Reviewer\'s blocking items print for an over-block read',
    run: ({ legs, legKids, execs }) => {
      const lines: string[] = []; let finding = false, seen = 0;
      const WHOLE = /(rollback\s+clean-config|configure\s+replace|copy\s+\S+\s+session-config|copy\s+\S+\s+running-config)/i;
      for (const l of changeLegs(legs)) {
        const kids = kidsOf(l, legKids);
        const h = kids.find((k) => k.agentRole === 'infra_state_harvester'); if (!h) continue;
        const gdc = latestResult(execs, h.id)?.gitDeviceComparison;
        const drifted = isObj(gdc) && Array.isArray(gdc.devices)
          ? (gdc.devices as unknown[]).filter((d) => isObj(d) && d.state === 'compared' && Number(d.differencesTotal) > 0).map((d) => d as Record<string, unknown>) : [];
        if (!drifted.length) continue; seen++;
        const arch = kids.find((k) => k.agentRole === 'infra_change_architect');
        const author = kids.find((k) => k.agentRole === 'config_change_author');
        const rev = kids.find((k) => k.agentRole === 'change_reviewer');
        const aText = String(arch ? latestResult(execs, arch.id)?.finalResponse ?? '' : '');
        const pText = String(author ? latestResult(execs, author.id)?.finalResponse ?? '' : '');
        for (const d of drifted) {
          const dev = String(d.device); const path = isObj(d.gitFile) ? String(d.gitFile.path ?? '') : '';
          const base = path.split('/').pop() ?? '';
          const stated = aText.includes(dev) && /incremental|git[- ]sync|reconcil/i.test(aText);
          // a placeholder device (`<device>`, `<host>`, `<switch>`) applies to every device, the drifted one included (canary B's
          // released package wrote `copy flash:<device>-lb14.cfg session-config` — it never names ceos1)
          const all = pText.split(/\r?\n/).filter((x) => WHOLE.test(x));
          const loads = all.filter((x) => x.includes(dev) || (base && x.includes(base)) || /<\s*(device|host|switch|node)\s*>/i.test(x));
          lines.push(`  leg ${l.id} device ${dev}: differences=${String(d.differencesTotal)} architectStatesIncremental=${stated} authorWholeFileLinesNamingIt=${loads.length} (whole-file lines in the package: ${all.length})`);
          all.forEach((x) => lines.push(`    whole-file line${loads.includes(x) ? ' (names it or a placeholder)' : ''}: ${x.trim().slice(0, 160)}`));
          if (!stated || loads.length) finding = true;
        }
        const v = rev ? latestResult(execs, rev.id)?.reviewerVerdict : null;
        if (isObj(v)) {
          lines.push(`    reviewer approved=${String(v.approved)}`);
          if (v.approved !== true && Array.isArray(v.blocking)) (v.blocking as unknown[]).forEach((b) => lines.push(`    blocking (read for an over-block): ${String(b).slice(0, 200)}`));
        }
      }
      if (!seen) return { verdict: 'UNEXERCISED', lines: [...lines, '  no change leg with a drifted device (gitDeviceComparison differences 0 or absent)'] };
      return { verdict: finding ? 'FINDING' : 'PASS', lines: [...lines, '  hand-read: a whole-file line on a device\'s OWN fresh running-config copy is the allowed form (R-APPLY-OK shape)'] };
    },
  },
  'nb1-nc1-claims': {
    what: 'network-provisioning 1.27.0 (d) — every Harvester sentence pairing a Git-file mention with a device-read mention and a difference word, each address it names classified against that execution\'s stored tool results: WARNING = on the device read and not in the Git read (true, safe direction); FINDING = in the Git read and not on the device (the unsafe direction) or absent from the source the claim says has it',
    run: ({ legs, legKids, execs }) => {
      const lines: string[] = []; let finding = false, seen = 0, warnings = 0;
      const DIFF = /not present|not in (its|the)|lacks|absent from|additional|versus|only (in|on) the device|does not (carry|contain|appear)/i;
      for (const l of [...changeLegs(legs), ...valueLegs(legs)]) {
        const h = kidsOf(l, legKids).find((k) => k.agentRole === 'infra_state_harvester'); if (!h) continue;
        const j = latestResult(execs, h.id); if (!j) continue;
        const gdc = j.gitDeviceComparison; if (!isObj(gdc) || gdc.checked !== true) continue; seen++;
        const calls = Array.isArray(j.toolCalls) ? (j.toolCalls as unknown[]).filter(isObj) : [];
        const text = (re: RegExp) => calls.filter((c) => re.test(JSON.stringify(c.arguments ?? c.input ?? ''))).map((c) => JSON.stringify(c.result ?? c.output ?? '')).join('\n');
        const gitText = text(/get_file_contents/), devText = text(/fetch_data|get_config|show /);
        const sentences = String(j.finalResponse ?? '').split(/(?<=[.!?])\s+|\n/).filter((s) => /git/i.test(s) && /device|running/i.test(s) && DIFF.test(s));
        for (const s of sentences) {
          const ips = [...new Set(s.match(/\b\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?\b/g) ?? [])];
          const cls = ips.map((ip) => { const bare = ip.split('/')[0]; const g = gitText.includes(bare), d = devText.includes(bare);
            return `${ip}:${d && !g ? 'WARNING' : g && !d ? 'FINDING(unsafe)' : !gitText || !devText ? 'READ(no stored results)' : 'READ'}`; });
          if (cls.some((c) => c.includes('FINDING'))) finding = true;
          warnings += cls.filter((c) => c.endsWith('WARNING')).length;
          lines.push(`  harvester ${h.id}: ${cls.join(' ') || 'no address named — READ'} — "${s.trim().slice(0, 180)}"`);
        }
      }
      if (!seen) return { verdict: 'UNEXERCISED', lines: [...lines, '  no Harvester with a checked gitDeviceComparison (no device declares both sources)'] };
      if (finding) return { verdict: 'FINDING', lines };
      return { verdict: 'PASS', lines: [...lines, `  ${warnings} counted WARNING(s) (true, safe direction — measured, not gated: register HARVESTER-RESTATES-DEVICE-DIFF)`] };
    },
  },
  'nb1-held-unread': {
    what: 'network-provisioning 1.27.0 — a change leg with a device whose declared git-file / device-read source could not be read: the change Reviewer itself refuses naming that device (not only the platform force)',
    run: ({ legs, legKids, execs }) => {
      const lines: string[] = []; let finding = false, seen = 0;
      const UNREAD = new Set(['read-failed', 'not-read', 'empty-config', 'result-truncated']);
      for (const l of changeLegs(legs)) {
        const kids = kidsOf(l, legKids);
        const h = kids.find((k) => k.agentRole === 'infra_state_harvester'); if (!h) continue;
        const dsr = latestResult(execs, h.id)?.deviceSourceReads;
        const unread = isObj(dsr) && Array.isArray(dsr.devices) ? (dsr.devices as unknown[]).filter(isObj).filter((d) => Array.isArray(d.sources)
          && (d.sources as unknown[]).some((s) => isObj(s) && (s.kind === 'git-file' || s.kind === 'device-read') && isObj(s.read) && UNREAD.has(String(s.read.state)))).map((d) => String(d.device)) : [];
        if (!unread.length) continue; seen++;
        const rev = kids.find((k) => k.agentRole === 'change_reviewer');
        const v = rev ? latestResult(execs, rev.id)?.reviewerVerdict : null;
        const blocking = isObj(v) && Array.isArray(v.blocking) ? (v.blocking as unknown[]).map(String) : [];
        const qg = isObj(meta(l).qualityGate) ? (meta(l).qualityGate as Record<string, unknown>) : {};
        const he = isObj(qg.heldEdit) ? qg.heldEdit : {};
        for (const dev of unread) {
          const named = blocking.some((b) => b.includes(dev));
          lines.push(`  leg ${l.id} device ${dev}: unread · reviewer approved=${isObj(v) ? String(v.approved) : 'no-verdict'} blockingNamesIt=${named} · platform forced=${String(he.forced ?? false)}${he.reason ? `(${String(he.reason)})` : ''}`);
          if (!isObj(v) || v.approved === true || !named) finding = true;
        }
      }
      if (!seen) return { verdict: 'UNEXERCISED', lines: [...lines, '  no change leg had an unread declared source (the JL3 shape) — an absence, not a pass'] };
      return { verdict: finding ? 'FINDING' : 'PASS', lines };
    },
  },
  'nb1-c-marker': {
    what: 'network-provisioning 1.27.0 marker clause — the Author\'s package description lines are plain ASCII; the lines print so a person can check each new member of a marked population carries the marker',
    run: ({ legs, legKids, execs }) => {
      const lines: string[] = []; let finding = false, seen = 0;
      for (const l of changeLegs(legs)) {
        const a = kidsOf(l, legKids).find((k) => k.agentRole === 'config_change_author'); if (!a) continue;
        const desc = String(latestResult(execs, a.id)?.finalResponse ?? '').split(/\r?\n/).filter((x) => /^\s*[+]?\s*description\s/i.test(x));
        if (!desc.length) continue; seen++;
        for (const x of desc) { const ascii = /^[\x20-\x7e\t]*$/.test(x); lines.push(`  author ${a.id}: ${ascii ? '' : 'NON-ASCII — FINDING · '}${x.trim().slice(0, 140)}`); if (!ascii) finding = true; }
      }
      if (!seen) return { verdict: 'UNEXERCISED', lines: [...lines, '  no Author description lines'] };
      return { verdict: finding ? 'FINDING' : 'PASS', lines: [...lines, '  hand-read: each NEW interface of a marked population carries the marker its existing members share'] };
    },
  },
  'nb1-c-gitonly-change': {
    what: 'network-provisioning 1.27.0 + GIT_ONLY_WORD_MIN_VERSIONS — a change leg with a Git-only declared device shows liveEvidence: git-only / some-git-only on its card, equal to the leg fact',
    run: ({ legs, execs }) => {
      const lines: string[] = []; let finding = false, seen = 0;
      for (const l of changeLegs(legs)) {
        const idx = latestResult(execs, l.id, 'pipeline-index.json'); if (!idx) continue;
        const le = isObj(idx.liveEvidence) ? idx.liveEvidence : {}; const gitOnly = devNames(le.gitOnly);
        if (!gitOnly.length) continue; seen++;
        const card = String(leanFactsLine(pickResultJsonSummary(idx)) ?? '');
        const word = /liveEvidence: ([a-z-]+)/.exec(card)?.[1] ?? null;
        lines.push(`  change leg ${l.id}: gitOnly=[${gitOnly}] fact summary=${String(le.summary ?? '—')} card word=${word ?? 'ABSENT'}`);
        if (!word || word !== le.summary || !/git-only/.test(String(le.summary))) finding = true;
      }
      if (!seen) return { verdict: 'UNEXERCISED', lines: [...lines, '  no change leg with a Git-only declared device'] };
      return { verdict: finding ? 'FINDING' : 'PASS', lines };
    },
  },
  'nb1-c-h1': {
    what: 'network-derivation 1.3.1 brief — a declared value leg\'s Harvester brief carries the narrow-reads line for each device-read device and a "make no call to any device service" line for each Git-only device, and the Harvester makes no device-service call for a Git-only device',
    run: ({ legs, legKids, execs }) => {
      const lines: string[] = []; let finding = false, seen = 0;
      for (const l of valueLegs(legs).filter((x) => isObj(meta(x).deviceSourcesSnapshot))) {
        const h = kidsOf(l, legKids).find((k) => k.agentRole === 'infra_state_harvester'); if (!h) continue; seen++;
        const d = String(h.description ?? '');
        const noCall = [...d.matchAll(/make no call to any device service for `?([A-Za-z0-9._-]+)`?/g)].map((m) => m[1]);
        const narrow = /narrow reads of `?[A-Za-z0-9._-]+`? only/.test(d);
        const calls = execs.filter((e) => e.taskId === h.id && e.artName === 'result.json').flatMap((e) => { const j = parse(e.art); return Array.isArray(j?.toolCalls) ? (j!.toolCalls as unknown[]) : []; });
        const breaches = noCall.filter((dev) => calls.some((c) => { const s = JSON.stringify(c); return !s.includes('get_file_contents') && /fetch_data|get_config|show /.test(s) && s.includes(dev); }));
        lines.push(`  value leg ${l.id} harvester ${h.id}: noCallLines=[${noCall}] narrowLine=${narrow} deviceCallsForNoCallDevices=[${breaches}]`);
        if (breaches.length) finding = true;
      }
      if (!seen) return { verdict: 'UNEXERCISED', lines: [...lines, '  no declared value leg'] };
      return { verdict: finding ? 'FINDING' : 'PASS', lines: [...lines, '  hand-read: the brief\'s lines match the block (every Git-only device has a no-call line)'] };
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
        const r = CONTROLS[name].run({ root, legs, nodeC, execs, legKids });
        console.log(`\nCONTROL ${name}: ${voidReason ? 'VOID (canary void)' : r.verdict}\n  ${CONTROLS[name].what}`);
        r.lines.forEach(x => console.log(x));
      }
    }, { timeout: 120_000 });
  } finally { await prisma.$disconnect(); }
}
main().catch(e => { console.error(e); process.exit(1); });
