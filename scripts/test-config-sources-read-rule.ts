#!/usr/bin/env ts-node
/**
 * Config sources read rule (2026-11-25, register OBS-MULTILEG-HARVESTER-READS-OWN-FILE-ONLY) — the platform rule inserted into a
 * declared Harvester's BRIEF, directly after its `## Config sources` block (owner option A after lab ADDENDUM B), and its ONE gate.
 *
 *   RR1  the rule and its paragraph, byte for byte (682-char line) — a string pin;
 *   RR2  the allow-list is observability-config ONLY (widening is a reviewed one-line change);
 *   RR3  the injection tail renders NOTHING for it (no tail block): the flag only stamps the fact; prompts byte-identical on/off;
 *   RR4  the pure gate both ways: Harvester vs Architect / Author / Reviewer / Node C / no role; PIPELINE; parsed vs no-block vs
 *        could-not-check vs snapshot-absent vs snapshot-changed; observability vs Kubernetes vs Terraform; a network Harvester;
 *   RR5  the resolver over a stub database: ON for a declared observability Harvester; no read at all for a non-harvest role or a
 *        PIPELINE task; no leg-row read for a Kubernetes / Terraform leg; a throwing database answers OFF and never throws;
 *   RR6  the same answer before and after a run (the resolver is a function of rows the Harvester's run does not write);
 *   RR7  the three callers use the ONE gate and the ONE switch (source pins: engine, stream route, lab rebuild);
 *   RR8  the insertion: exact position after the block's last line (the stored ingress brief's neighbourhood), the brief's bytes
 *        otherwise identical, no heading block ⇒ after the description, every gated-OFF decision ⇒ the SAME task object;
 *   RR9  both builders render it (user §3 and the system HEAD's "Your Context"), each exactly once, right after the block.
 *
 * CI-safe: stub DATABASE_URL before imports that could reach lib/prisma.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';

import * as fs from 'fs';
import * as path from 'path';
import { applySystemPromptInjectionsWithFact, buildSystemPromptInjectionBlocks } from '../lib/services/execution-system-prompt';
import {
  CONFIG_SOURCES_READ_RULE_PROTOCOLS, CONFIG_SOURCES_READ_RULE_LINE, CONFIG_SOURCES_READ_RULE_PARAGRAPH, configSourcesReadRuleDecision,
  resolveConfigSourcesReadRule, insertConfigSourcesReadRule, withConfigSourcesReadRule, briefTaskFor,
} from '../lib/agents/harness/config-sources-read-rule';
import { buildAgentPromptBody } from '../lib/agents/harness/build-agent-prompt-body';
import { buildContextSummary } from '../lib/services/agentTemplateBuilder/pAIchartUniversalTemplate';
import { configSnapshotDecision } from '../lib/agents/harness/config-sources-read';

let passed = 0;
let failed = 0;
async function test(d: string, fn: () => void | Promise<void>) {
  try { await fn(); console.log(`✅ ${d}`); passed++; } catch (e) { console.error(`❌ ${d}\n   ${(e as Error).message}`); failed++; }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string) { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}: got ${x}, want ${y}`); }

const LINE =
  "Every line of the `## Config sources` block in your brief is a declared source of this leg, whatever else your brief says, " +
  "including a line whose file this leg's objective does not change: handle each line as your protocol says for its kind. " +
  "Your brief may limit what this leg changes; it never removes a declared line from what you read. " +
  "Never treat a declared line as another leg's, as outside this leg's scope, or as a file the block does not declare: " +
  "the rules for an undeclared file (read only as context, or named and not quoted) never apply to it. " +
  "The platform checks your reads against every declared line, and a declared Git file you did not read stops this leg's approval.";
const PARA = `**Config Sources Read Rule (Platform-Resolved):** ${LINE}`;

const logger = { info: () => {}, warn: () => {}, child() { return this; } } as any;
const BASE = 'HEAD: You are the resolved base prompt.';
function mockDb(named?: string) {
  return {
    agentPromptLibrary: {
      findFirst: async (a: any) => (named && a?.where?.name === 'p1' ? { promptText: named, version: '1.0.0', status: 'ACTIVE', description: null } : null),
      findMany: async () => [{ name: 'harness-base', description: null, promptText: 'BASE-TEXT', version: '1' }],
    },
  } as any;
}

// ── the stub database for the resolver (RR5/RR6) ────────────────────────────────────────────────────────────────────────────
const OBS_LINES = [
  'obs-otelcol: git-file — service github-service ; paichart/paichart-configs/observability/otelcol/config.yaml',
  'obs-otelcol: live-read — service observability-readonly',
  'obs-ingress.otlp-ingress.conf: git-file — service github-service ; paichart/paichart-configs/observability/nginx/otlp-ingress.conf',
  'obs-ingress.otlp-ingress.conf: live-read — service observability-readonly',
  'obs-ingress.operator-access.conf: git-file — service github-service ; paichart/paichart-configs/observability/nginx/operator-access.conf',
  'obs-ingress.operator-access.conf: live-read — service observability-readonly',
];
const OBS_BLOCK = `## Config sources\n${OBS_LINES.join('\n')}`;
type LegFixture = { protocol: string; description: string; contract: unknown; withSnapshot: boolean };
function legFixture(f: LegFixture) {
  const d = configSnapshotDecision({ type: 'PIPELINE', protocol: f.protocol, description: f.description, interfaceContract: f.contract, takenAt: '2026-11-25T00:00:00.000Z' });
  const snapshot = f.withSnapshot && d.action === 'write' ? d.snapshot : null;
  return { title: 'Pipeline: leg', metadata: { protocol: f.protocol, ...(snapshot ? { configSourcesSnapshot: snapshot } : {}) }, description: f.description, contract: f.contract, snapshot };
}
function stubDb(leg: ReturnType<typeof legFixture> | null, opts: { throwOn?: 'task' | 'query' } = {}) {
  const reads: string[] = [];
  const db = {
    task: {
      findUnique: async (a: any) => {
        reads.push(`task:${a.where.id}`);
        if (opts.throwOn === 'task') throw new Error('boom');
        if (a.where.id === 'child1') return { stageId: 'stage1' };
        if (a.where.id === 'leg1' && leg) return { title: leg.title, metadata: leg.metadata };
        return null;
      },
    },
    stage: { findUnique: async () => { reads.push('stage'); return { metadata: { harnessTaskId: 'leg1' } }; } },
    $queryRaw: async () => {
      reads.push('legRow');
      if (opts.throwOn === 'query') throw new Error('boom');
      return leg ? [{ description: leg.description, contract: leg.contract, snapshot: leg.snapshot, protocolStamped: true }] : [];
    },
  };
  return { db: db as any, reads };
}
const CHILD = { id: 'child1', type: 'ACTION', title: 'Harvest current observability state', metadata: {} };
const OBS_LEG = () => legFixture({ protocol: 'observability-config-protocol', description: `Leg body.\n\n${OBS_BLOCK}\n`,
  contract: { configSources: { 'observability-config': OBS_BLOCK } }, withSnapshot: true });

(async () => {
  console.log('🧪 Config sources read rule (block + gate)\n');

  await test('RR1 the rule and its paragraph are pinned byte for byte (line 682 chars, paragraph 732; 734 inserted with its blank line)', () => {
    assert(CONFIG_SOURCES_READ_RULE_LINE === LINE, 'the line moved — a change to it is a text change (Protocol 16): re-measure');
    assert(CONFIG_SOURCES_READ_RULE_PARAGRAPH === PARA, 'the paragraph moved');
    eq([LINE.length, PARA.length], [682, 732], 'lengths');
    assert(!PARA.includes('\n') && !PARA.startsWith('#'), 'one paragraph, no heading (a heading would capture the brief\'s next sentence)');
    for (const w of ['returned, not kept', 'context only', 'observability']) assert(!LINE.includes(w), `the line names domain-only wording: ${w}`);
  });

  await test('RR2 the allow-list is observability-config ONLY', () => {
    eq([...CONFIG_SOURCES_READ_RULE_PROTOCOLS], ['observability-config-protocol'], 'allow-list');
    assert(Object.isFrozen(CONFIG_SOURCES_READ_RULE_PROTOCOLS), 'the allow-list must be frozen');
  });

  await test('RR3 the injection tail renders nothing for the rule: on/off prompts byte-identical, kinds unchanged; the flag only stamps the fact', async () => {
    const ctxs: Array<[string, any, any]> = [
      ['none', { harnessContext: null, template: null, templateMetadata: null }, mockDb()],
      ['named', { harnessContext: null, template: { id: 't', name: 'T' }, templateMetadata: { protocol: 'p1' }, constraints: ['no secrets'] }, mockDb('PROTO')],
    ];
    for (const [mode, ctx, db] of ctxs) {
      const absent = await applySystemPromptInjectionsWithFact(BASE, ctx, db, logger);
      const off = await applySystemPromptInjectionsWithFact(BASE, { ...ctx, configSourcesReadRule: false }, db, logger);
      const on = await applySystemPromptInjectionsWithFact(BASE, { ...ctx, configSourcesReadRule: true }, db, logger);
      assert(absent.prompt === off.prompt && on.prompt === absent.prompt, `${mode}: the flag changed the system prompt`);
      assert(!on.prompt.includes('Config Sources Read Rule'), `${mode}: a tail block rendered`);
      assert(!('configSourcesReadRule' in absent.protocolInjection) && !('configSourcesReadRule' in off.protocolInjection), `${mode}: fact key with the flag off`);
      eq(on.protocolInjection.configSourcesReadRule, true, `${mode}: fact key with the flag on`);
      for (const v of ['true', 1, {}]) assert(!('configSourcesReadRule' in (await applySystemPromptInjectionsWithFact(BASE, { ...ctx, configSourcesReadRule: v }, db, logger)).protocolInjection), `${mode}: a non-boolean flag ${JSON.stringify(v)} stamped the fact`);
      const { blocks } = await buildSystemPromptInjectionBlocks(BASE, { ...ctx, configSourcesReadRule: true }, db, logger);
      assert(!blocks.some((b) => (b.kind as string) === 'configSourcesRule'), `${mode}: a configSourcesRule block kind`);
    }
  });

  const parsed = { state: 'parsed', entries: [] } as any;
  const obsLeg = { kind: 'leg', legId: 'leg1', heldCapable: true, ownStageId: 's', configSourceProtocol: 'observability-config-protocol' } as any;
  const dec = (o: Partial<{ taskType: string; agentRole: string | null; owningLeg: any; sources: any }>) =>
    configSourcesReadRuleDecision({ taskType: 'ACTION', agentRole: 'infra_state_harvester', owningLeg: obsLeg, sources: parsed, ...o });

  await test('RR4a the pure gate: ON only for a declared observability Harvester; every other role OFF', () => {
    eq(dec({}), { on: true, reason: 'on', sourcesState: 'parsed' }, 'declared obs Harvester');
    for (const role of ['infra_change_architect', 'config_change_author', 'change_reviewer', 'program_integration_reviewer', 'program_architect', 'pipeline_harness_orchestrator', '', null]) {
      eq(dec({ agentRole: role }).reason, 'not-a-harvester', `role ${role}`);
    }
    eq(dec({ taskType: 'PIPELINE' }).reason, 'pipeline-task', 'PIPELINE row');
  });

  await test('RR4b the pure gate: the declaration — parsed ON; no-block / could-not-check / snapshot-absent / snapshot-changed / unparseable OFF', () => {
    eq(dec({ owningLeg: { kind: 'leg', legId: 'l', heldCapable: false, ownStageId: 's' } }).reason, 'no-config-source-leg', 'no-block obs leg (no configSourceProtocol)');
    eq(dec({ owningLeg: { kind: 'could-not-check', reason: 'read-threw', heldCapable: false } }).reason, 'no-config-source-leg', 'owning leg could-not-check');
    eq(dec({ owningLeg: { kind: 'no-leg', reason: 'no-stage', heldCapable: false } }).reason, 'no-config-source-leg', 'no leg');
    for (const state of ['not-config-source-leg', 'could-not-check', 'snapshot-absent', 'snapshot-unreadable', 'snapshot-changed', 'unparseable', 'absent', 'snapshot-text-reverted']) {
      eq(dec({ sources: { state } }), { on: false, reason: 'declaration-not-parsed', sourcesState: state }, state);
    }
    eq(dec({ sources: null }).reason, 'declaration-not-parsed', 'no read');
  });

  await test('RR4c the pure gate: Kubernetes and Terraform OFF under the allow-list; a network Harvester OFF', () => {
    eq(dec({ owningLeg: { ...obsLeg, configSourceProtocol: 'kubernetes-gitops-protocol' } }).reason, 'protocol-not-on-allow-list', 'k8s parsed');
    eq(dec({ owningLeg: { ...obsLeg, configSourceProtocol: 'terraform-iac-protocol' } }).reason, 'protocol-not-on-allow-list', 'tf parsed');
    eq(dec({ agentRole: 'network_state_harvester', owningLeg: { kind: 'leg', legId: 'l', heldCapable: true, ownStageId: 's', deviceSource: true } }).reason, 'no-config-source-leg', 'network Harvester');
    eq(dec({ owningLeg: { ...obsLeg, configSourceProtocol: 'observability-config' } }).on, true, 'the short protocol name canonicalises');
  });

  await test('RR5a the resolver: ON for a declared observability Harvester through the shipping reads (snapshot governs)', async () => {
    const leg = OBS_LEG();
    assert(leg.snapshot, 'fixture: the shipping snapshot decision must write a snapshot for the obs block');
    const { db, reads } = stubDb(leg);
    const r = await resolveConfigSourcesReadRule(db, CHILD, 'infra_state_harvester');
    eq(r, { on: true, reason: 'on', sourcesState: 'parsed' }, 'declared obs Harvester');
    eq(reads, ['task:child1', 'stage', 'task:leg1', 'legRow'], 'reads');
  });

  await test('RR5b the resolver: no read for a non-harvest role or a PIPELINE task; no leg-row read for k8s / tf / a no-block leg', async () => {
    for (const role of ['infra_change_architect', 'config_change_author', 'change_reviewer']) {
      const { db, reads } = stubDb(OBS_LEG());
      eq((await resolveConfigSourcesReadRule(db, CHILD, role)).reason, 'not-a-harvester', role);
      eq(reads, [], `${role} reads`);
    }
    { const { db, reads } = stubDb(OBS_LEG()); eq((await resolveConfigSourcesReadRule(db, { ...CHILD, type: 'PIPELINE' }, 'infra_state_harvester')).reason, 'pipeline-task', 'PIPELINE'); eq(reads, [], 'PIPELINE reads'); }
    const offAllowList = async (protocol: string) => {
      const leg = { title: 'Pipeline: leg', metadata: { protocol }, description: 'x', contract: null, snapshot: null };
      const { db, reads } = stubDb(leg as any);
      eq((await resolveConfigSourcesReadRule(db, CHILD, 'infra_state_harvester')).reason, 'protocol-not-on-allow-list', protocol);
      assert(!reads.includes('legRow'), `${protocol}: the leg row was read`);
    };
    await offAllowList('kubernetes-gitops-protocol');
    await offAllowList('terraform-iac-protocol');
    // an observability leg that declares nothing (no snapshot, no block): runs-undeclared ⇒ OFF, without its row
    const none = legFixture({ protocol: 'observability-config-protocol', description: 'Leg body, no block.', contract: null, withSnapshot: false });
    const { db, reads } = stubDb(none);
    const r = await resolveConfigSourcesReadRule(db, CHILD, 'infra_state_harvester');
    assert(!r.on, `no-block obs leg: ${JSON.stringify(r)}`);
    assert(r.reason === 'no-config-source-leg' || r.sourcesState === 'not-config-source-leg', `no-block obs leg reason: ${JSON.stringify(r)} (reads ${reads.join(',')})`);
  });

  await test('RR5c the resolver: snapshot-absent (a block, no snapshot) OFF; a throwing database OFF, never thrown', async () => {
    const noSnap = legFixture({ protocol: 'observability-config-protocol', description: `Leg body.\n\n${OBS_BLOCK}\n`, contract: { configSources: { 'observability-config': OBS_BLOCK } }, withSnapshot: false });
    { const { db } = stubDb(noSnap); eq(await resolveConfigSourcesReadRule(db, CHILD, 'infra_state_harvester'), { on: false, reason: 'declaration-not-parsed', sourcesState: 'snapshot-absent' }, 'snapshot-absent'); }
    { const { db } = stubDb(OBS_LEG(), { throwOn: 'task' }); const r = await resolveConfigSourcesReadRule(db, CHILD, 'infra_state_harvester'); eq(r.on, false, 'task read threw'); }
    { const { db } = stubDb(OBS_LEG(), { throwOn: 'query' }); eq(await resolveConfigSourcesReadRule(db, CHILD, 'infra_state_harvester'), { on: false, reason: 'declaration-not-parsed', sourcesState: 'could-not-check' }, 'leg row read threw (could-not-check)'); }
    { const r = await resolveConfigSourcesReadRule(null as any, CHILD, 'infra_state_harvester'); eq(r.on, false, 'no database at all (the owning-leg read fails closed)'); }
    { const bad = { toString() { throw new Error('boom'); } } as unknown as string; eq(await resolveConfigSourcesReadRule(stubDb(OBS_LEG()).db, CHILD, bad), { on: false, reason: 'gate-threw' }, 'a throw inside the gate'); }
  });

  await test('RR6 the same answer before and after a run: the resolver reads only rows a Harvester run does not write', async () => {
    // Its inputs: the child's own stageId (set at create), the stage's harnessTaskId (set at CREATE), the leg's title + protocol stamp
    // (write-if-absent at the leg's FIRST execution, before any child exists) and the leg's snapshot (taken in the SAME statement,
    // AUDIT_STRIP — no client writes it). A Harvester run writes its own execution/task rows only, none of these.
    const leg = OBS_LEG();
    const a = await resolveConfigSourcesReadRule(stubDb(leg).db, CHILD, 'infra_state_harvester');
    const b = await resolveConfigSourcesReadRule(stubDb(leg).db, { ...CHILD, metadata: { protocol: null, lastExecutionId: 'e1' } }, 'infra_state_harvester');
    eq(a, b, 'before vs after (the child row gained run metadata)');
    const src = fs.readFileSync(path.join(__dirname, '../lib/agents/harness/held-bytes/variant.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export async function resolveOwningLegProtocol'), src.indexOf('export function heldCaptureTakesDeviceScope'));
    assert(/select: \{ stageId: true \}/.test(fn) && /select: \{ metadata: true \}/.test(fn) && /select: \{ title: true, metadata: true \}/.test(fn),
      'resolveOwningLegProtocol reads a column this test does not account for — re-check that a Harvester run cannot change its answer');
  });

  await test('RR7 the three callers use the ONE gate and the ONE switch; the tail block is gone', () => {
    const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
    const engine = read('lib/services/agentExecutionEngine.ts');
    const route = read('app/api/pov/agent/execute/stream/route.ts');
    const rebuild = read('scripts/leg-replay-lab/rebuild.ts');
    const arm = read('scripts/leg-replay-lab/config-sources-arm.ts');
    const tail = read('lib/services/execution-system-prompt.ts');
    assert(/resolveConfigSourcesReadRule\(prisma/.test(engine) && /briefTaskFor\(task, readRule\)/.test(engine)
      && /this\.buildAgentPrompt\(promptTask,/.test(engine) && /this\.buildSystemPrompt\(agentRole, promptTask,/.test(engine), 'engine: gate → briefTaskFor → BOTH builders');
    assert(/resolveConfigSourcesReadRule\(prisma/.test(route) && /briefTaskFor\(task, \{ on: readRuleOn \}\)/.test(route)
      && /buildContextSummary\(briefTask\)/.test(route) && /const promptTask = \{ \.\.\.briefTask,/.test(route) && /configSourcesReadRule: readRuleOn,/.test(route), 'stream route: gate → briefTaskFor → BOTH builders + the fact');
    assert(/labLeafConfigSourcesReadRule\(/.test(rebuild) && /briefTaskFor\(task, \{ on: ruleOn \}\)/.test(rebuild)
      && /buildAgentPromptBody\(briefTask,/.test(rebuild) && /buildContextSummary\(briefTask as any\)/.test(rebuild) && /configSourcesReadRule: ruleOn/.test(rebuild), 'lab rebuild');
    assert(/configSourcesReadRuleDecision\(\{/.test(arm), 'the lab answers with the shipping pure decision');
    assert(!/CONFIG_SOURCES_READ_RULE_BLOCK|configSourcesRule'/.test(tail), 'the system-tail block must be gone (one placement)');
    for (const [n, s] of [['engine', engine], ['route', route], ['rebuild', rebuild]] as const) {
      assert(!s.includes('CONFIG_SOURCES_READ_RULE_PROTOCOLS') && !/HARVEST_LEAF_ROLE_RE/.test(s) && !s.includes('insertConfigSourcesReadRule(task.description).text'), `${n} decides part of the gate or the insertion itself`);
    }
  });

  // ── RR8 / RR9: the insertion ──────────────────────────────────────────────────────────────────────────────────────────────────
  const NARROWING = "Read only the files this leg's own objective concerns via the labels above that match otlp-ingress.conf (obs-ingress.otlp-ingress.conf: git-file + live-read) as declared sources; files with other labels returned by a service read are named but not quoted per Config sources discipline.";
  const INGRESS_BRIEF = `Read-only harvest for the OTLP ingress sender-restriction change (edit target: observability/nginx/otlp-ingress.conf, ports TCP 4317 and TCP 4318).\n\n${OBS_BLOCK}\n\n${NARROWING} Also harvest the full witnessed surface this protocol requires.`;
  const strip = (t: string) => t.replace(`\n\n${PARA}`, '');

  await test('RR8a the stored ingress brief: the rule lands DIRECTLY after the block\'s last line, before the narrowing sentence; all other bytes identical', () => {
    const r = insertConfigSourcesReadRule(INGRESS_BRIEF);
    eq(r.anchor, 'after-block', 'anchor');
    const last = OBS_LINES[OBS_LINES.length - 1];
    assert(r.text.includes(`${last}\n\n${PARA}\n\n${NARROWING}`), 'neighbourhood: last block line, blank line, the rule, blank line, the narrowing sentence');
    eq(r.at, INGRESS_BRIEF.indexOf(last) + last.length, 'insertion offset = the end of the block\'s last line');
    assert(strip(r.text) === INGRESS_BRIEF, 'removing the insertion gives the brief back byte for byte');
    assert(r.text.split(PARA).length === 2, 'inserted exactly once');
  });

  await test('RR8b edge cases: block at the end; no heading line ⇒ after the description; empty; only the FIRST heading; a heading that is not a whole line is not the block; CRLF', () => {
    const atEnd = `Brief.\n\n${OBS_BLOCK}`;
    eq(insertConfigSourcesReadRule(atEnd), { text: `${atEnd}\n\n${PARA}`, anchor: 'after-block', at: atEnd.length }, 'block at the end');
    const trailing = `${atEnd}\n`;
    eq(insertConfigSourcesReadRule(trailing).text, `${atEnd}\n\n${PARA}\n`, 'block then one trailing newline');
    const noBlock = `Brief with no block. ${NARROWING}`;
    eq(insertConfigSourcesReadRule(noBlock), { text: `${noBlock}\n\n${PARA}`, anchor: 'end-of-description', at: noBlock.length }, 'no heading line ⇒ after the description (the orchestrator dropped the block)');
    eq(insertConfigSourcesReadRule(''), { text: PARA, anchor: 'end-of-description', at: 0 }, 'empty description');
    eq(insertConfigSourcesReadRule(null).text, PARA, 'null description');
    const two = `${OBS_BLOCK}\n\nmiddle\n\n## Config sources\nx: git-file — service s ; o/r/p`;
    const r2 = insertConfigSourcesReadRule(two);
    eq(r2.at, OBS_BLOCK.length, 'the FIRST heading line is the block');
    const inline = `See the ## Config sources block below.\n## Config sources (copied)\nline`;
    eq(insertConfigSourcesReadRule(inline).anchor, 'end-of-description', 'neither an inline mention nor a different heading is the block');
    const spaced = `x\n## Config sources  \na: b\n\ny`;
    eq(insertConfigSourcesReadRule(spaced).text, `x\n## Config sources  \na: b\n\n${PARA}\n\ny`, 'trailing spaces on the heading line');
    const crlf = `x\r\n## Config sources\r\na: b\r\n\r\ny`;
    const rc = insertConfigSourcesReadRule(crlf);
    assert(rc.anchor === 'after-block' && strip(rc.text) === crlf, 'CRLF: found, bytes otherwise identical');
    for (const t of [INGRESS_BRIEF, atEnd, trailing, noBlock, two, inline, spaced, crlf]) assert(strip(insertConfigSourcesReadRule(t).text) === t, `round trip: ${JSON.stringify(t.slice(0, 30))}`);
  });

  await test('RR8c every gated-OFF decision ⇒ the SAME task object (no insertion); ON ⇒ a copy, the stored task untouched', () => {
    const task = { id: 'h', title: 'Harvest', description: INGRESS_BRIEF, other: 1 };
    for (const o of [{ agentRole: 'config_change_author' }, { agentRole: 'change_reviewer' }, { agentRole: 'infra_change_architect' }, { taskType: 'PIPELINE' },
      { owningLeg: { kind: 'leg', legId: 'l', heldCapable: false, ownStageId: 's' } }, { sources: { state: 'could-not-check' } }, { sources: { state: 'snapshot-absent' } },
      { owningLeg: { ...obsLeg, configSourceProtocol: 'kubernetes-gitops-protocol' } }, { owningLeg: { ...obsLeg, configSourceProtocol: 'terraform-iac-protocol' } },
      { agentRole: 'network_state_harvester', owningLeg: { kind: 'leg', legId: 'l', heldCapable: true, ownStageId: 's', deviceSource: true } }] as any[]) {
      const d = dec(o);
      assert(!d.on, `expected OFF for ${JSON.stringify(o)}`);
      assert(briefTaskFor(task, d) === task, `OFF (${d.reason}) must return the same object`);
    }
    assert(briefTaskFor(task, { on: false, reason: 'gate-threw' } as any) === task, 'gate-threw');
    const on = briefTaskFor(task, dec({}));
    assert(on !== task && task.description === INGRESS_BRIEF && on.description === withConfigSourcesReadRule(task).description && (on as any).other === 1, 'ON: a copy with only the description changed');
  });

  await test('RR9 both builders render the rule once, right after the block: user §3 Description and the system HEAD "Your Context"', () => {
    const task = { id: 'h', title: 'Harvest', description: INGRESS_BRIEF, status: 'IN_PROGRESS', type: 'ACTION', priority: 'MEDIUM' };
    const on = briefTaskFor(task, dec({}));
    const userOff = buildAgentPromptBody(task, {}, {});
    const userOn = buildAgentPromptBody(on, {}, {});
    const headOff = buildContextSummary(task as any);
    const headOn = buildContextSummary(on as any);
    const last = OBS_LINES[OBS_LINES.length - 1];
    for (const [n, off, onT] of [['user §3', userOff, userOn], ['system HEAD', headOff, headOn]] as const) {
      assert(onT.split(PARA).length === 2, `${n}: the rule must render exactly once`);
      assert(onT.includes(`${last}\n\n${PARA}\n\n${NARROWING}`), `${n}: the rule sits directly after the block`);
      assert(strip(onT) === off, `${n}: everything else byte-identical`);
    }
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
