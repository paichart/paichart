#!/usr/bin/env ts-node
/**
 * System-Prompt Injection Tail Tests — convergence Phase 5a equivalence gate
 *
 * B1 method: the golden EXPECTED strings below are hand-derived from the INLINE
 * code being replaced (engine buildSystemPrompt tail + stream route.ts:503-574
 * mirror, read at ade8d315 BEFORE the swap) — not from the new module — so the
 * gate proves the extraction reproduces the pre-swap bytes, per adapter.
 *
 * Matrix (prompt-construction signoff 2c, reduced to the tail this phase touches):
 * scope-self-check-only, harness minimal/full, {{-sanitization, loadProtocols
 * (2 / cap-hit-10 / db-throw), named protocol (found / not-found / throw),
 * metadata-null tripwire, layout ordering (protocols → harness → HEAD → scope).
 * Plus the PC-I1 dead-branch guard: the engine call site must keep reading the
 * structurally-dead `task.modelParameters?.systemPrompt` — "fixing" it to the
 * metadata path would resurrect a dead Priority-2 and change engine output.
 *
 * CI-safe: stub DATABASE_URL before imports that could reach lib/prisma.
 *
 * Created: 2026-07-05
 * Plan: cline_docs/reviews/execution-path-convergence-2026-07-04/phase-5-confidence-assessment.md §5a
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';

import * as fs from 'fs';
import { UNIVERSAL_AGENT_RULES } from '../lib/agents/universal-agent-rules';
import * as path from 'path';
import { applySystemPromptInjections, applySystemPromptInjectionsWithFact, buildSystemPromptInjectionBlocks } from '../lib/services/execution-system-prompt';

console.log('🧪 System-Prompt Injection Tail Tests (Phase 5a equivalence gate)\n');

let passed = 0;
let failed = 0;
function test(d: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`✅ ${d}`); passed++; })
    .catch((e) => { console.error(`❌ ${d}`); if (e instanceof Error) console.error(`   ${e.message}`); failed++; });
}
function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg); }
function assertEq(actual: string, expected: string, label: string) {
  if (actual !== expected) {
    const i = [...actual].findIndex((c, idx) => c !== expected[idx]);
    throw new Error(`${label}: first divergence at char ${i}\n   expected …${JSON.stringify(expected.slice(Math.max(0, i - 40), i + 40))}\n   actual   …${JSON.stringify(actual.slice(Math.max(0, i - 40), i + 40))}`);
  }
}

// ── GOLDEN fragments — copied VERBATIM from the pre-swap inline code ──────────
// (engine agentExecutionEngine.ts:1335-1346 === stream route.ts:563-574, verified byte-identical)
const GOLDEN_SCOPE_CHECK = `\n\n---\n\n## Scope Self-Check (escape hatch)\n\n` +
  `Before generating substantive content, evaluate whether this task is genuinely within your role's scope. Use these criteria:\n\n` +
  `- The task description aligns with the kind of work your role/template is designed for\n` +
  `- You have the required information, tools, or context to produce a useful result\n` +
  `- A different specialist role would NOT be a better fit for this task\n\n` +
  `**If this task is outside your scope, do NOT fabricate content.** Instead, return ONLY a structured marker and stop:\n\n` +
  `\`\`\`\n` +
  `[TEMPLATE_MISMATCH] This task does not match my role's scope.\n` +
  `Reason: <one-sentence explanation of why this is wrong-template, e.g. "Task asks for code implementation but my role is security review">\n` +
  `Suggested role: <which template type would be appropriate, e.g. "BUILDER">\n` +
  `\`\`\`\n\n` +
  `Use this escape hatch ONLY when you are confident the assignment is wrong — partial scope coverage is normal and you should proceed with what you CAN do, noting the rest in your output. The escape hatch is for the case where producing any content would be misleading.`;

// engine :1264-1271 === stream :512-519 (verified byte-identical)
function goldenHarnessBlock(mode: string, reason: string, resolvedAt: string, opts: { pipelineStageId?: string; childStageTerminalCount?: number; childStageTaskCount?: number } = {}): string {
  return `## Harness Context (Platform-Resolved)\n\n` +
    `**Your mode is: ${mode}**\n\n` +
    `Reason: ${reason}\n` +
    `Resolved at: ${resolvedAt}\n` +
    (opts.pipelineStageId ? `Pipeline stage ID: \`${opts.pipelineStageId}\`\n` : '') +
    (opts.childStageTaskCount !== undefined
      ? `Child stage tasks: ${opts.childStageTerminalCount}/${opts.childStageTaskCount} terminal\n` : '') +
    `\nThis is platform ground truth — proceed accordingly.\n\n---\n\n`;
}

const HC = (over: Record<string, unknown> = {}) => ({
  mode: 'SYNTHESIZE',
  reasonCode: 'last-child-terminal',
  reason: 'All child tasks terminal',
  resolvedAt: '2026-07-05T00:00:00.000Z',
  pipelineStageId: null,
  ...over,
}) as any;

const logs: Array<{ level: string; msg: string; data: Record<string, unknown> }> = [];
const logger = {
  info: (data: Record<string, unknown>, msg: string) => logs.push({ level: 'info', msg, data }),
  warn: (data: Record<string, unknown>, msg: string) => logs.push({ level: 'warn', msg, data }),
};

// Phase C: mockDb is ARGS-AWARE (D6) — composed mode issues TWO distinct findMany/findFirst
// queries (protocol-base tag; delta by name), so the mock must dispatch on the WHERE clause.
// Legacy call shapes are preserved: protocol-tag findMany → cfg.protocols, name-less findFirst
// → cfg.named (pre-Phase-C tests unchanged).
function mockDb(cfg: {
  protocols?: Array<{ name: string; description: string; promptText: string; version?: string | null }>;
  named?: { promptText: string; version?: string | null } | null;
  bases?: Array<{ name: string; description?: string | null; promptText: string; version?: string | null }>;
  rows?: Record<string, { promptText: string; status?: string; version?: string | null }>;
  throwOn?: 'findMany' | 'findFirst' | 'findMany-base';
}) {
  return {
    agentPromptLibrary: {
      findMany: async (args: any) => {
        const tag = args?.where?.tags?.has;
        if (tag === 'protocol-base') {
          if (cfg.throwOn === 'findMany-base') throw new Error('db down');
          return (cfg.bases ?? []).map(b => ({ ...b, description: b.description ?? null })).slice(0, args?.take ?? undefined);
        }
        if (cfg.throwOn === 'findMany') throw new Error('db down');
        return cfg.protocols ?? [];
      },
      findFirst: async (args: any) => {
        if (cfg.throwOn === 'findFirst') throw new Error('db down');
        const name = args?.where?.name;
        if (cfg.rows && name && name in cfg.rows) return cfg.rows[name];
        if (cfg.rows) return null; // rows-mode: unknown name = nonexistent
        return cfg.named ?? null;
      },
    },
  };
}

const BASE = 'HEAD: You are the resolved base prompt.';
const noCtx = { harnessContext: null, template: null, templateMetadata: null };

(async () => {

await test('bare: no harness/template/metadata → base + scope self-check, byte-golden', async () => {
  logs.length = 0;
  const out = await applySystemPromptInjections(BASE, noCtx, mockDb({}), logger);
  assertEq(out, BASE + GOLDEN_SCOPE_CHECK, 'bare output');
  // Phase C rebaseline (recorded, not silent): the bare path now emits EXACTLY the one B2
  // observability line (mode:'none' fact) — a deliberate all-modes fact line, not noise creep.
  // The sharper pin: one info, zero warns, and it IS the fact line.
  assert(logs.length === 1 && logs[0].level === 'info' && logs[0].msg === 'Protocol injection resolved',
    'bare path emits exactly the one protocol-injection fact line');
  assert((logs[0].data as any).protocolInjection?.mode === 'none', 'bare-path fact mode is none');
});

await test('harness minimal (no stage id, no child counts) → golden block prepended', async () => {
  const out = await applySystemPromptInjections(BASE, { ...noCtx, harnessContext: HC() }, mockDb({}), logger);
  assertEq(out, goldenHarnessBlock('SYNTHESIZE', 'All child tasks terminal', '2026-07-05T00:00:00.000Z') + BASE + GOLDEN_SCOPE_CHECK, 'harness-minimal output');
});

await test('harness full (pipelineStageId + child counts) → both optional lines, golden', async () => {
  const hc = HC({ pipelineStageId: 'cmstage01', childStageTerminalCount: 3, childStageTaskCount: 5 });
  const out = await applySystemPromptInjections(BASE, { ...noCtx, harnessContext: hc }, mockDb({}), logger);
  assertEq(out, goldenHarnessBlock('SYNTHESIZE', 'All child tasks terminal', '2026-07-05T00:00:00.000Z', { pipelineStageId: 'cmstage01', childStageTerminalCount: 3, childStageTaskCount: 5 }) + BASE + GOLDEN_SCOPE_CHECK, 'harness-full output');
});

await test('harness reason {{-sanitization: {{VAR}} → \\{\\{VAR}} (prompt-construction 4.4)', async () => {
  const out = await applySystemPromptInjections(BASE, { ...noCtx, harnessContext: HC({ reason: 'Stage {{STAGE}} empty' }) }, mockDb({}), logger);
  assert(out.includes('Reason: Stage \\{\\{STAGE}} empty\n'), 'handlebars-like literal escaped');
  assert(!out.includes('Reason: Stage {{STAGE}}'), 'raw {{ must not survive');
});

await test('loadProtocols (2 protocols) → golden section, name-joined with ---, PREPENDED above harness (layout pin)', async () => {
  logs.length = 0;
  const protocols = [
    { name: 'alpha-protocol', description: 'First.', promptText: 'Do alpha.' },
    { name: 'beta-protocol', description: 'Second.', promptText: 'Do beta.' },
  ];
  const out = await applySystemPromptInjections(BASE,
    { harnessContext: HC(), template: { id: 't1', name: 'Harness' }, templateMetadata: { loadProtocols: true } },
    mockDb({ protocols }), logger);
  // 2026-08-04: UNIVERSAL_AGENT_RULES is now injected ONCE here rather than concatenated into every
  // protocol's promptText at seed time (a PIPELINE task previously received SIX copies). A visible
  // consequence is that the preamble is now the FIRST text in the prompt — it used to sit buried
  // inside the first protocol entry's body. That position change is deliberate: a preamble read
  // first is the point of a preamble. These goldens pin it so it cannot drift back or vanish.
  const goldenSection = `${UNIVERSAL_AGENT_RULES}\n\n---\n\n## Available Orchestration Protocols\n\n` +
    `### Protocol: alpha-protocol\nFirst.\n\nDo alpha.\n\n---\n\n### Protocol: beta-protocol\nSecond.\n\nDo beta.` +
    `\n\n---\n\n`;
  assertEq(out, goldenSection + goldenHarnessBlock('SYNTHESIZE', 'All child tasks terminal', '2026-07-05T00:00:00.000Z') + BASE + GOLDEN_SCOPE_CHECK, 'loadProtocols layout: protocols → harness → HEAD → scope');
  assert(logs.some(l => l.level === 'info' && l.msg === 'Protocol injection for PIPELINE task'), 'engine-canonical info log');
  assert(!logs.some(l => l.level === 'warn'), 'no cap-hit warn under the cap');
});

await test('ORDER: the rendered sequence is preamble → protocols → mode → base → constraints → scope', async () => {
  // The reason this test can exist at all: assembly is now an ordered list, not a prepend chain.
  // Under the old form, code order and rendered order were REVERSED, which is how a comment came to
  // justify the Harness Context position as "BEFORE protocol injection" (citing a pattern doc at 98%
  // confidence) while the mode block actually rendered AFTER ~30 KB of protocol prose. Asserting
  // order directly is the guard that was previously impossible to write.
  const out = await applySystemPromptInjections(BASE,
    { harnessContext: HC(), template: { id: 't1', name: 'H' }, templateMetadata: { loadProtocols: true } },
    mockDb({ protocols: [{ name: 'alpha-protocol', description: 'First.', promptText: 'Do alpha.' }] }),
    logger);

  const seq = [
    '## Universal Agent Rules',
    '## Available Orchestration Protocols',
    '## Harness Context (Platform-Resolved)',
    BASE,
  ].map(marker => ({ marker, at: out.indexOf(marker) }));

  for (const { marker, at } of seq) {
    assert(at !== -1, `block missing from the rendered prompt: ${marker}`);
  }
  for (let i = 1; i < seq.length; i++) {
    assert(seq[i].at > seq[i - 1].at,
      `rendered out of order: "${seq[i].marker}" (${seq[i].at}) must follow "${seq[i - 1].marker}" (${seq[i - 1].at})`);
  }
  // Tail order: constraints then scope self-check, both after the base prompt.
  assert(out.indexOf(BASE) < out.lastIndexOf(GOLDEN_SCOPE_CHECK.trim().slice(0, 24)),
    'scope self-check must render after the base prompt');
});

await test('REC-9: the preamble appears EXACTLY ONCE per prompt, in both injection modes', async () => {
  // The regression this guards is the whole point of the change. Before 2026-08-04 the rules were
  // concatenated into every protocol's promptText at seed time, so a PIPELINE task loading six
  // protocols carried SIX copies (~27 KB, 15% of its protocol block, every turn). Now one injection
  // site carries them for every agent — which trades a duplication problem for a DISAPPEARANCE one:
  // if that site stops firing, every protocol-reading agent silently loses the preamble and nothing
  // about the prompt looks wrong. Count, do not merely assert presence.
  const marker = '## Universal Agent Rules';
  const six = Array.from({ length: 6 }, (_, i) => ({ name: `p${i}`, description: 'd', promptText: 'body' }));
  const multi = await applySystemPromptInjections(BASE,
    { ...noCtx, templateMetadata: { loadProtocols: true } }, mockDb({ protocols: six }), logger);
  assert(multi.split(marker).length - 1 === 1, `loadProtocols: preamble must appear exactly once across six protocols, found ${multi.split(marker).length - 1}`);

  const single = await applySystemPromptInjections(BASE,
    { ...noCtx, templateMetadata: { protocol: 'network-provisioning-protocol' } },
    mockDb({ named: { promptText: 'body' } }), logger);
  assert(single.split(marker).length - 1 === 1, `named protocol: preamble must appear exactly once, found ${single.split(marker).length - 1}`);

  // And it must NOT appear when no protocol is injected — the preamble rides protocol injection by
  // design (18 of 35 templates), and adding it unconditionally would change who pays for it.
  const none = await applySystemPromptInjections(BASE, { ...noCtx, templateMetadata: {} }, mockDb({}), logger);
  assert(none.split(marker).length - 1 === 0, 'no protocol injected ⇒ no preamble — it rides protocol injection by design');
});

await test('loadProtocols cap-hit (exactly 10) → cap warn with loadedProtocols names', async () => {
  logs.length = 0;
  const ten = Array.from({ length: 10 }, (_, i) => ({ name: `p${i}`, description: 'd', promptText: 't' }));
  await applySystemPromptInjections(BASE, { ...noCtx, templateMetadata: { loadProtocols: true } }, mockDb({ protocols: ten }), logger);
  const warn = logs.find(l => l.level === 'warn' && l.msg.includes('10-skill cap'));
  assert(warn, 'cap-hit warn fired');
  assert(Array.isArray((warn!.data as any).loadedProtocols) && (warn!.data as any).loadedProtocols.length === 10, 'warn carries the loaded names');
});

await test('loadProtocols db-throw → warn, prompt degrades to protocol-less (never throws)', async () => {
  logs.length = 0;
  const out = await applySystemPromptInjections(BASE, { ...noCtx, templateMetadata: { loadProtocols: true } }, mockDb({ throwOn: 'findMany' }), logger);
  assertEq(out, BASE + GOLDEN_SCOPE_CHECK, 'protocol-less degradation');
  assert(logs.some(l => l.level === 'warn' && l.msg === 'Failed to load protocols — harness will use fallback planning'), 'engine-canonical failure warn');
});

await test('named protocol found → golden ## Protocol prepend + info log', async () => {
  logs.length = 0;
  const out = await applySystemPromptInjections(BASE, { ...noCtx, templateMetadata: { protocol: 'net-provision' } }, mockDb({ named: { promptText: 'Provision carefully.' } }), logger);
  // Same single-injection change as the loadProtocols golden above — the specialist path gets the
  // preamble once, first, instead of receiving it inside the protocol body.
  assertEq(out, `${UNIVERSAL_AGENT_RULES}\n\n---\n\n## Protocol\n\nProvision carefully.\n\n---\n\n` + BASE + GOLDEN_SCOPE_CHECK, 'named-protocol output');
  assert(logs.some(l => l.level === 'info' && l.msg === 'Injected named protocol into specialist system prompt'), 'engine-canonical info log');
});

// BEHAVIOUR CHANGED 2026-08-08 (WS4 panel, architectural-review BLOCKING finding).
// This test previously pinned "not found → warn, prompt unchanged" — i.e. the agent RAN with no
// protocol at all. On a leaf that degrades to plausible-but-unguided output; on a harness bound to
// a single protocol it is silent catastrophic degradation (no mode procedures, no tool-call
// mechanics) that still reports SUCCESS. A non-resolving name is DETERMINISTIC — retrying can
// never fix it — so it now throws. The TRANSIENT db-throw case below is untouched and still
// degrades, which is the distinction the old code could not draw.
// Pre-checked against prod before flipping: all 5 distinct bound protocol names on live
// agent_templates resolve, so no production template changes behaviour.
await test('named protocol NOT FOUND → THROWS (deterministic config error, never runs protocol-less)', async () => {
  logs.length = 0;
  let threw: Error | null = null;
  try {
    await applySystemPromptInjections(BASE, { ...noCtx, templateMetadata: { protocol: 'ghost' } }, mockDb({ named: null }), logger);
  } catch (e) { threw = e as Error; }
  assert(threw !== null, 'must throw rather than run the agent with no protocol');
  assert(threw!.message.includes('NAMED_PROTOCOL_NOT_FOUND'), 'carries the grep key');
  assert(threw!.message.includes('ghost'), 'names the unresolved binding');
  assert(logs.some(l => l.level === 'warn' && (l.data as any).errorCode === 'NAMED_PROTOCOL_NOT_FOUND'), 'structured errorCode logged');
});

await test('named protocol db-throw → warn with protocol field, prompt unchanged (never throws)', async () => {
  logs.length = 0;
  const out = await applySystemPromptInjections(BASE, { ...noCtx, templateMetadata: { protocol: 'net-provision' } }, mockDb({ throwOn: 'findFirst' }), logger);
  assertEq(out, BASE + GOLDEN_SCOPE_CHECK, 'unchanged on throw');
  const warn = logs.find(l => l.level === 'warn' && l.msg === 'Failed to load named protocol');
  assert(warn && (warn.data as any).protocol === 'net-provision', 'warn carries the protocol name');
});

await test('metadata-null tripwire: template present + null metadata → loud warn, content unchanged', async () => {
  logs.length = 0;
  const out = await applySystemPromptInjections(BASE, { harnessContext: null, template: { id: 'tpl1', name: 'Analyst' }, templateMetadata: null }, mockDb({}), logger);
  assertEq(out, BASE + GOLDEN_SCOPE_CHECK, 'content unchanged by tripwire');
  const warn = logs.find(l => l.level === 'warn' && l.msg.includes('metadata is null'));
  assert(warn && (warn.data as any).templateName === 'Analyst' && (warn.data as any).templateId === 'tpl1', 'tripwire warn with template identity');
});

await test('loadProtocols=true wins over protocol name when both set (else-if pin) — AND warns', async () => {
  logs.length = 0;
  const out = await applySystemPromptInjections(BASE, { ...noCtx, templateMetadata: { loadProtocols: true, protocol: 'ignored' } },
    mockDb({ protocols: [{ name: 'a', description: 'd', promptText: 't' }], named: { promptText: 'MUST NOT APPEAR' } }), logger);
  assert(out.includes('## Available Orchestration Protocols') && !out.includes('MUST NOT APPEAR'), 'loadProtocols branch exclusive');
  // The precedence is correct; what was wrong was that it happened SILENTLY. Silent skipping is
  // this codebase's most-repeated root cause, so the discard must be visible (2026-08-10).
  const w = logs.find(l => l.level === 'warn' && l.msg.includes('BOTH loadProtocols and protocol'));
  assert(w, 'both-set warn fired');
  assert((w!.data as any).ignoredProtocol === 'ignored', 'warn names the protocol that was discarded');
});

await test('loadProtocols alone does NOT fire the both-set warn (no false positive)', async () => {
  logs.length = 0;
  await applySystemPromptInjections(BASE, { ...noCtx, templateMetadata: { loadProtocols: true } },
    mockDb({ protocols: [{ name: 'a', description: 'd', promptText: 't' }] }), logger);
  assert(!logs.some(l => l.level === 'warn' && l.msg.includes('BOTH loadProtocols and protocol')),
    'no both-set warn when only loadProtocols is set — the 93% path stays quiet');
});

// ── WS1 Phase C: composed mode (base + one), mode parse, tier-split, fact ────
// Composed goldens are HAND-DERIVED from the D1.5 layout decision (SYNTHESIS.md), NOT harvested
// from the implementation (D6). Headings are pc-owned and PINNED here — the misroute guard and
// the protocol fences key off these exact strings.
const RULES_BLK = `${UNIVERSAL_AGENT_RULES}\n\n---\n\n`;
const goldenBaseBlk = (body: string) => `## Harness Operating Base\n\n${body}\n\n---\n\n`;
const goldenDeltaBlk = (name: string, body: string) =>
  `## Active Protocol: ${name} (governs; overrides the base where they differ)\n\n${body}\n\n---\n\n`;

const composedCtx = (over: Record<string, unknown> = {}) => ({
  harnessContext: null,
  template: { id: 'tpl1', name: 'Harness' },
  templateMetadata: { loadProtocols: 'composed' } as Record<string, unknown>,
  ...over,
}) as any;
const composedDb = (over: Parameters<typeof mockDb>[0] = {}) => mockDb({
  bases: [{ name: 'pipeline-execution-protocol', description: 'base', promptText: 'BASEBODY', version: '3.11.0' }],
  rows: { 'terraform-iac-protocol': { promptText: 'DELTABODY', status: 'ACTIVE', version: '1.2.1' } },
  ...over,
});
const STAMPED = { protocol: 'terraform-iac-protocol', source: 'stamp' } as const;

await test('composed golden: stamped ACTIVE leg → rules + base + delta, byte-golden, fact complete', async () => {
  logs.length = 0;
  const { prompt, protocolInjection: f } = await applySystemPromptInjectionsWithFact(
    BASE, composedCtx({ taskProtocol: STAMPED }), composedDb(), logger);
  assertEq(prompt,
    RULES_BLK + goldenBaseBlk('BASEBODY') + goldenDeltaBlk('terraform-iac-protocol', 'DELTABODY') + BASE + GOLDEN_SCOPE_CHECK,
    'composed output');
  assert(f.mode === 'composed', 'fact.mode');
  assert(f.base?.name === 'pipeline-execution-protocol' && f.base?.version === '3.11.0', 'fact.base row+version');
  assert(f.delta?.name === 'terraform-iac-protocol' && f.delta?.version === '1.2.1', 'fact.delta row+version');
  assert(f.stampSource === 'stamp', 'fact.stampSource');
  assert(f.protocolNames.join(',') === 'pipeline-execution-protocol,terraform-iac-protocol', 'fact.protocolNames');
  assert(f.preambleChars === (RULES_BLK + goldenBaseBlk('BASEBODY') + goldenDeltaBlk('terraform-iac-protocol', 'DELTABODY')).length, 'fact.preambleChars');
  assert(logs.some(l => l.level === 'info' && l.msg === 'Protocol injection resolved'), 'observability line fires (composed)');
});

await test('composed EXACTLY-ONCE: rules once, base heading once, delta heading once (B7)', async () => {
  const out = await applySystemPromptInjections(BASE, composedCtx({ taskProtocol: STAMPED }), composedDb(), logger);
  assert(out.split(UNIVERSAL_AGENT_RULES).length - 1 === 1, 'universal rules exactly once');
  assert(out.split('## Harness Operating Base').length - 1 === 1, 'base heading exactly once');
  assert(out.split('## Active Protocol:').length - 1 === 1, 'delta heading exactly once');
  assert(out.split('## Scope Self-Check').length - 1 === 1, 'scope self-check exactly once');
});

await test('composed stamped-NULL → base-only, INFO not warn (the documented default)', async () => {
  logs.length = 0;
  const { prompt, protocolInjection: f } = await applySystemPromptInjectionsWithFact(
    BASE, composedCtx({ taskProtocol: { protocol: null, source: 'stamp' } }), composedDb(), logger);
  assertEq(prompt, RULES_BLK + goldenBaseBlk('BASEBODY') + BASE + GOLDEN_SCOPE_CHECK, 'base-only output');
  assert(f.delta === null && f.stampSource === 'stamp', 'fact: no delta, stamp source');
  assert(!logs.some(l => l.level === 'warn'), 'stamped-null must NOT warn');
});

await test('composed title-fallback source recorded (the F1 convergence rung)', async () => {
  const { protocolInjection: f } = await applySystemPromptInjectionsWithFact(
    BASE, composedCtx({ taskProtocol: { protocol: 'terraform-iac-protocol', source: 'title-fallback' } }), composedDb(), logger);
  assert(f.stampSource === 'title-fallback' && f.delta?.name === 'terraform-iac-protocol', 'title-fallback rung');
});

await test('composed + template protocol → FALLBACK rung (template-metadata), NO both-set warn (re-scope)', async () => {
  logs.length = 0;
  const { protocolInjection: f } = await applySystemPromptInjectionsWithFact(
    BASE,
    composedCtx({ templateMetadata: { loadProtocols: 'composed', protocol: 'terraform-iac' }, taskProtocol: { protocol: null, source: 'none' } }),
    composedDb(), logger);
  assert(f.stampSource === 'template-metadata' && f.delta?.name === 'terraform-iac-protocol', 'template fallback canonicalized');
  assert(!logs.some(l => l.msg.includes('BOTH loadProtocols and protocol')), "composed+protocol is a rung, not a conflict — must NOT warn");
});

await test('composed no stamp / no token / no template binding → base-only + PROTOCOL_STAMP_ABSENT warn', async () => {
  logs.length = 0;
  const { prompt, protocolInjection: f } = await applySystemPromptInjectionsWithFact(
    BASE, composedCtx({ taskProtocol: { protocol: null, source: 'none' } }), composedDb(), logger);
  assertEq(prompt, RULES_BLK + goldenBaseBlk('BASEBODY') + BASE + GOLDEN_SCOPE_CHECK, 'base-only output');
  assert(logs.some(l => l.level === 'warn' && (l.data as any).errorCode === 'PROTOCOL_STAMP_ABSENT'), 'stamp-absent warn');
  assert(f.stampSource === 'none', 'fact source none');
});

await test('composed taskProtocol NOT SUPPLIED → tripwire warn + base-only (call-site-not-updated guard)', async () => {
  logs.length = 0;
  const { prompt } = await applySystemPromptInjectionsWithFact(BASE, composedCtx(), composedDb(), logger);
  assertEq(prompt, RULES_BLK + goldenBaseBlk('BASEBODY') + BASE + GOLDEN_SCOPE_CHECK, 'base-only output');
  assert(logs.some(l => (l.data as any).errorCode === 'PROTOCOL_RESOLUTION_MISSING'), 'tripwire warn');
});

await test('composed stamped protocol NONEXISTENT row → THROWS NAMED_PROTOCOL_NOT_FOUND (keeps a947df55)', async () => {
  let threw = '';
  try {
    await applySystemPromptInjections(BASE,
      composedCtx({ taskProtocol: { protocol: 'ghost-protocol', source: 'stamp' } }), composedDb(), logger);
  } catch (e) { threw = (e as Error).message; }
  assert(threw.startsWith('NAMED_PROTOCOL_NOT_FOUND'), `expected NAMED_PROTOCOL_NOT_FOUND, got: ${threw || 'no throw'}`);
});

// ── FC9 TIER-SPLIT, pinned BOTH DIRECTIONS so it cannot be "fixed" into symmetry (D6) ────────
await test('TIER-SPLIT program: pov-program-protocol row DRAFT → HARD-FAIL PROTOCOL_ROW_NOT_ACTIVE', async () => {
  let threw = '';
  try {
    await applySystemPromptInjections(BASE,
      composedCtx({ taskProtocol: { protocol: 'pov-program-protocol', source: 'stamp' } }),
      composedDb({ rows: { 'pov-program-protocol': { promptText: 'PROG', status: 'DRAFT', version: '1.1.0' } } }), logger);
  } catch (e) { threw = (e as Error).message; }
  assert(threw.startsWith('PROTOCOL_ROW_NOT_ACTIVE'), `program tier must hard-fail, got: ${threw || 'no throw'}`);
});

await test('TIER-SPLIT leg: terraform row DRAFT → base-only + warn + degraded FACT (never a throw)', async () => {
  logs.length = 0;
  const { prompt, protocolInjection: f } = await applySystemPromptInjectionsWithFact(
    BASE, composedCtx({ taskProtocol: STAMPED }),
    composedDb({ rows: { 'terraform-iac-protocol': { promptText: 'DELTABODY', status: 'DRAFT', version: '1.2.1' } } }), logger);
  assertEq(prompt, RULES_BLK + goldenBaseBlk('BASEBODY') + BASE + GOLDEN_SCOPE_CHECK, 'leg degrades to base-only');
  assert(f.degraded === 'PROTOCOL_ROW_NOT_ACTIVE_LEG_BASE_ONLY', 'degradation fact recorded');
  assert(logs.some(l => l.level === 'warn' && (l.data as any).errorCode === 'PROTOCOL_ROW_NOT_ACTIVE'), 'loud warn');
});

await test('composed base cardinality 0 → THROWS PROTOCOL_BASE_NOT_FOUND', async () => {
  let threw = '';
  try { await applySystemPromptInjections(BASE, composedCtx({ taskProtocol: STAMPED }), composedDb({ bases: [] }), logger); }
  catch (e) { threw = (e as Error).message; }
  assert(threw.startsWith('PROTOCOL_BASE_NOT_FOUND'), `got: ${threw || 'no throw'}`);
});

await test('composed base cardinality 2 → THROWS PROTOCOL_BASE_AMBIGUOUS (findMany take:2, never findFirst)', async () => {
  let threw = '';
  try {
    await applySystemPromptInjections(BASE, composedCtx({ taskProtocol: STAMPED }),
      composedDb({ bases: [
        { name: 'pipeline-execution-protocol', promptText: 'A', version: '1' },
        { name: 'rogue-base', promptText: 'B', version: '1' },
      ] }), logger);
  } catch (e) { threw = (e as Error).message; }
  assert(threw.startsWith('PROTOCOL_BASE_AMBIGUOUS'), `got: ${threw || 'no throw'}`);
});

await test('composed base-load DB blip → DEGRADES protocol-less (transient contract), never throws', async () => {
  logs.length = 0;
  const { prompt, protocolInjection: f } = await applySystemPromptInjectionsWithFact(
    BASE, composedCtx({ taskProtocol: STAMPED }), composedDb({ throwOn: 'findMany-base' }), logger);
  assertEq(prompt, BASE + GOLDEN_SCOPE_CHECK, 'protocol-less degrade');
  assert(f.degraded === 'PROTOCOL_LOAD_DB_ERROR', 'degradation fact');
});

await test('composed + harness context → binding line in the Harness Context block, byte-golden', async () => {
  const out = await applySystemPromptInjections(BASE,
    composedCtx({ harnessContext: HC(), taskProtocol: STAMPED }), composedDb(), logger);
  const harnessWithBinding =
    `## Harness Context (Platform-Resolved)\n\n**Your mode is: SYNTHESIZE**\n\nReason: All child tasks terminal\n` +
    `Resolved at: 2026-07-05T00:00:00.000Z\nProtocol binding: terraform-iac-protocol\n\nThis is platform ground truth — proceed accordingly.\n\n---\n\n`;
  assertEq(out,
    RULES_BLK + goldenBaseBlk('BASEBODY') + goldenDeltaBlk('terraform-iac-protocol', 'DELTABODY') + harnessWithBinding + BASE + GOLDEN_SCOPE_CHECK,
    'composed+harness output');
});

await test('composed base-only + harness → binding line reads "base only"', async () => {
  const out = await applySystemPromptInjections(BASE,
    composedCtx({ harnessContext: HC(), taskProtocol: { protocol: null, source: 'stamp' } }), composedDb(), logger);
  assert(out.includes('Protocol binding: base only\n'), 'base-only binding line');
});

await test('LEGACY modes carry NO binding line (goldens above already pin bytes; belt+braces)', async () => {
  const out = await applySystemPromptInjections(BASE, { ...noCtx, harnessContext: HC() }, mockDb({}), logger);
  assert(!out.includes('Protocol binding:'), 'no binding line outside composed');
});

// ── Mode parse totality (B4) ─────────────────────────────────────────────────
await test('mode parse: unrecognised TRUTHY loadProtocols → THROWS UNKNOWN_PROTOCOL_MODE', async () => {
  for (const bad of ['yes', 1, {}, 'all'] as unknown[]) {
    let threw = '';
    try { await applySystemPromptInjections(BASE, { ...noCtx, templateMetadata: { loadProtocols: bad } } as any, mockDb({}), logger); }
    catch (e) { threw = (e as Error).message; }
    assert(threw.startsWith('UNKNOWN_PROTOCOL_MODE'), `loadProtocols=${JSON.stringify(bad)} must throw, got: ${threw || 'no throw'}`);
  }
});

await test('mode parse: falsy loadProtocols stays legacy (false/0/"" → named-or-none, no throw)', async () => {
  for (const falsy of [false, 0, '', null, undefined] as unknown[]) {
    const out = await applySystemPromptInjections(BASE, { ...noCtx, templateMetadata: { loadProtocols: falsy } } as any, mockDb({}), logger);
    assertEq(out, BASE + GOLDEN_SCOPE_CHECK, `falsy ${JSON.stringify(falsy)} → none`);
  }
});

// ── NEW lattice cell (D6): the rollback path stays quiet-usable ──────────────
await test('loadProtocols:true + task STAMP → stamp ignored + INFO, output = all-mode golden (rollback cell)', async () => {
  logs.length = 0;
  const out = await applySystemPromptInjections(BASE,
    { ...noCtx, templateMetadata: { loadProtocols: true }, taskProtocol: STAMPED } as any,
    mockDb({ protocols: [{ name: 'a', description: 'd', promptText: 't' }] }), logger);
  const expected = `${UNIVERSAL_AGENT_RULES}\n\n---\n\n## Available Orchestration Protocols\n\n### Protocol: a\nd\n\nt\n\n---\n\n` + BASE + GOLDEN_SCOPE_CHECK;
  assertEq(out, expected, 'all-mode output unchanged by stamp');
  assert(logs.some(l => l.level === 'info' && l.msg.includes('not consulted in this mode')), 'stamp-ignored info');
  assert(!logs.some(l => l.level === 'warn'), 'quiet-usable: no warns');
});

// ── Facade + block-list equivalence (the Phase B amendment, D1.4) ────────────
await test('buildSystemPromptInjectionBlocks: join(blocks.text) === applySystemPromptInjections (facade equivalence)', async () => {
  const ctx = composedCtx({ harnessContext: HC(), taskProtocol: STAMPED, constraints: ['no secrets'] });
  const { blocks } = await buildSystemPromptInjectionBlocks(BASE, ctx, composedDb() as any, logger);
  const joined = blocks.map(b => b.text).join('');
  const facade = await applySystemPromptInjections(BASE, ctx, composedDb() as any, logger);
  assertEq(joined, facade, 'block-list join vs facade');
  assert(blocks.map(b => b.kind).join(',') === 'rules,base,delta,harness,basePrompt,constraints,scopeSelfCheck',
    'block kinds in RENDER order');
});

// ── Observability fires in all four modes (B2) ───────────────────────────────
await test('observability: the fact line fires in all/named/composed/none', async () => {
  const runs: Array<[string, () => Promise<unknown>]> = [
    ['all', () => applySystemPromptInjections(BASE, { ...noCtx, templateMetadata: { loadProtocols: true } }, mockDb({ protocols: [{ name: 'a', description: 'd', promptText: 't' }] }), logger)],
    ['named', () => applySystemPromptInjections(BASE, { ...noCtx, templateMetadata: { protocol: 'p1' } }, mockDb({ named: { promptText: 'X' } }), logger)],
    ['composed', () => applySystemPromptInjections(BASE, composedCtx({ taskProtocol: STAMPED }), composedDb(), logger)],
    ['none', () => applySystemPromptInjections(BASE, noCtx, mockDb({}), logger)],
  ];
  for (const [mode, run] of runs) {
    logs.length = 0;
    await run();
    const line = logs.find(l => l.msg === 'Protocol injection resolved');
    assert(line, `fact line missing in ${mode} mode`);
    assert((line!.data as any).protocolInjection?.mode === mode, `fact.mode wrong in ${mode} mode`);
  }
});

// ── PC-I1 dead-branch guard + call-site source pins ──────────────────────────

const engineSrc = fs.readFileSync(path.join(__dirname, '../lib/services/agentExecutionEngine.ts'), 'utf8');

await test('PC-I1 E-guard: engine call site still reads the structurally-dead task.modelParameters?.systemPrompt — do NOT "fix" to the metadata path', () => {
  // Task has no modelParameters scalar (it lives at task.metadata.modelParameters);
  // this expression is always undefined, making the engine single-branch (template
  // only). Changing it to task.metadata... would RESURRECT a dead Priority-2 and
  // change engine output — a 5b+ flagged decision, never a drive-by fix.
  assert(engineSrc.includes('task.modelParameters?.systemPrompt'), 'engine dead-branch expression replaced — see phase-5-prompt-construction-signoff.md IMPORTANT-1');
  assert(!/buildSystemPrompt\([^)]*task\.metadata[^)]*\)/.test(engineSrc), 'engine buildSystemPrompt call must not read task.metadata for the prompt');
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
})();
