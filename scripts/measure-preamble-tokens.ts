#!/usr/bin/env npx ts-node
/**
 * measure-preamble-tokens.ts — how many tokens is each SINGLE-PROTOCOL preamble,
 * and does it clear the model's minimum cacheable prefix?
 *
 * READ-ONLY. Uses `countTokens`, which is FREE and generates no completion.
 * Writes nothing to our DB.
 *
 * ── WHY ────────────────────────────────────────────────────────────────────
 * The 2026-08-09 cache probe measured the `loadProtocols` preamble (40,210
 * tokens, ~10x over the Haiku floor) and concluded the split is safe. But that
 * path is 41% of production. The other 53% is `metadata.protocol` — rules plus
 * ONE protocol — whose preamble is an order of magnitude smaller. Estimates put
 * kubernetes-gitops at only ~27% over the 4,096 floor.
 *
 * Below the floor there is NO ERROR: `cache_creation_input_tokens: 0`, silence,
 * and a permanently uncached prefix. So this must be measured, not estimated,
 * before choosing the breakpoint location (SYNTHESIS decision 2, narrow vs wide).
 *
 * ── FIDELITY ───────────────────────────────────────────────────────────────
 * Mirrors execution-system-prompt.ts:282 EXACTLY:
 *     `${UNIVERSAL_AGENT_RULES}\n\n---\n\n## Protocol\n\n${promptText}\n\n---\n\n`
 * Note it uses promptText ONLY — no `description`, unlike the loadProtocols
 * path at :212-219 which renders `### Protocol: ${name}\n${description}...`.
 * If this drifts from the engine, the measurement is a fiction.
 *
 * Usage: npx ts-node scripts/measure-preamble-tokens.ts [--user=<email>]
 */
import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '@prisma/client';
import { UNIVERSAL_AGENT_RULES } from '../lib/agents/universal-agent-rules';

const USER_ARG = (process.argv.find((a) => a.startsWith('--user=')) || '').split('=')[1];

// Minimum cacheable prefix is model-dependent and NOT MONOTONIC across
// generations. Source: claude-api skill, shared/prompt-caching.md.
//
//   Opus 5 / Fable 5 / Mythos 5 ........  512   <- the NEWEST have the LOWEST
//   Opus 4.8 / Sonnet 5 / Sonnet 4.6 ... 1024
//   Opus 4.7 / Haiku 3.5 ............... 2048
//   Opus 4.6 / Opus 4.5 / Haiku 4.5 .... 4096   <- our DEFAULT is the worst case
//
// Two independent things vary by model and neither transfers:
//   1. the FLOOR (above), and
//   2. the TOKEN COUNT of identical text — kubernetes-gitops measures 4,818 on
//      Haiku and 6,821 on Sonnet, 42% apart. So a preamble size computed once
//      at seed time is wrong for every other model.
const MODELS = [
  { id: 'claude-haiku-4-5', floor: 4096 },
  { id: 'claude-sonnet-5', floor: 1024 },
  { id: 'claude-opus-5', floor: 512 },
  { id: 'claude-fable-5', floor: 512 },
];

async function resolveApiKey(prisma: PrismaClient): Promise<{ key: string; source: string }> {
  if (process.env.ANTHROPIC_API_KEY) return { key: process.env.ANTHROPIC_API_KEY, source: 'env' };
  if (USER_ARG) {
    const u = await prisma.user.findFirst({ where: { email: USER_ARG }, select: { id: true } });
    if (u) {
      const us = await prisma.userSettings.findUnique({ where: { userId: u.id } });
      const llm = (us?.settings as any)?.llm;
      const uk = llm?.anthropicApiKey || llm?.apiKey;
      if (uk && !llm.useSystemProvider) return { key: uk, source: `user:${USER_ARG}` };
    }
  }
  const g = await prisma.customSchema.findFirst({ where: { name: 'llm_settings' } });
  const gs = (g?.schema as any) || {};
  const gk = gs.anthropicApiKey || gs.apiKey;
  if (gk) return { key: gk, source: 'global llm_settings' };
  throw new Error('No API key found (env, --user=<email>, or global llm_settings)');
}

async function main() {
  const prisma = new PrismaClient();

  // Every protocol row, ACTIVE or not — a DRAFT row is inert today but is
  // exactly what someone activates later without re-checking the floor.
  const protocols = await prisma.agentPromptLibrary.findMany({
    where: { tags: { has: 'protocol' } },
    select: { name: true, promptText: true, status: true },
    orderBy: { name: 'asc' },
  });

  // Which protocols are actually BOUND by a template, and how much traffic.
  const templates = await prisma.agentTemplate.findMany({ select: { name: true, metadata: true } });
  const bound = new Map<string, string[]>();
  for (const t of templates) {
    const p = (t.metadata as any)?.protocol;
    if (typeof p === 'string') bound.set(p, [...(bound.get(p) || []), t.name]);
  }

  const { key, source } = await resolveApiKey(prisma);
  await prisma.$disconnect();
  const client = new Anthropic({ apiKey: key });

  console.log('═'.repeat(96));
  console.log(' SINGLE-PROTOCOL PREAMBLE SIZE vs MINIMUM CACHEABLE PREFIX');
  console.log('═'.repeat(96));
  console.log(`  credential      : ${source} (never printed)`);
  console.log(`  rules chars     : ${UNIVERSAL_AGENT_RULES.length.toLocaleString()}`);
  console.log(`  shape           : rules + "## Protocol" + promptText  (engine :282, no description)`);
  console.log(`  countTokens     : FREE — no completion generated, nothing written\n`);

  const rows: any[] = [];
  for (const p of protocols) {
    const preamble = `${UNIVERSAL_AGENT_RULES}\n\n---\n\n## Protocol\n\n${p.promptText}\n\n---\n\n`;
    const r: any = { name: p.name, status: p.status, chars: preamble.length, bound: bound.get(p.name) || [] };
    for (const m of MODELS) {
      const c = await client.messages.countTokens({
        model: m.id as any,
        system: [{ type: 'text', text: preamble }],
        messages: [{ role: 'user', content: 'x' }],
      });
      r[m.id] = c.input_tokens;
    }
    rows.push(r);
  }

  const pad = (s: any, n: number) => String(s).padEnd(n);
  const rpad = (s: any, n: number) => String(s).padStart(n);
  console.log('  ' + pad('protocol', 30) + pad('status', 8) +
    MODELS.map((m) => rpad(m.id.replace('claude-', '') + ' /' + m.floor, 22)).join(''));
  console.log('  ' + '─'.repeat(30 + 8 + 22 * MODELS.length));

  let anyBelow = false;
  let anyThin = false;
  for (const r of rows) {
    const cells = MODELS.map((m) => {
      const v = r[m.id];
      const marginPct = (v / m.floor - 1) * 100;
      const below = v < m.floor;
      const thin = !below && marginPct < 50;
      if (r.status === 'ACTIVE') { if (below) anyBelow = true; if (thin) anyThin = true; }
      const mark = below ? '!!' : thin ? ' *' : '  ';
      return rpad(`${v.toLocaleString()} (${marginPct.toFixed(0)}%)${mark}`, 22);
    });
    console.log('  ' + pad(r.name, 30) + pad(r.status, 8) + cells.join(''));
  }

  console.log('\n' + '═'.repeat(96));
  console.log(' VERDICT');
  console.log('═'.repeat(96));
  if (anyBelow) {
    console.log(' 🔴 An ACTIVE, template-bound protocol is BELOW the Haiku floor.');
    console.log('    A narrow split leaves it PERMANENTLY UNCACHED, silently. Wide split, or');
    console.log('    exclude that path from the split. Do not ship narrow as-is.');
  } else if (anyThin) {
    console.log(' ⚠️  All ACTIVE protocols clear the floor, but at least one has <50% margin.');
    console.log('    Margin erodes with protocol EDITS, not code changes — a prose trim can');
    console.log('    silently drop it under. If narrow is chosen, add a floor assertion.');
  } else {
    console.log(' ✅ Every ACTIVE protocol clears the Haiku floor with >50% margin.');
    console.log('    The floor is not an argument for the wide split. Decide on other grounds.');
  }
  console.log('\n Note: a DRAFT row below the floor is inert TODAY and becomes live the moment');
  console.log(' someone flips status in the GUI. That is an authoring constraint, not a bug.');
}

main().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
