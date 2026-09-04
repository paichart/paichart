#!/usr/bin/env npx ts-node
/**
 * probe-cache-breakpoint.ts — DOES the breakpoint split actually produce a
 * cross-execution cache read in OUR request shape?
 *
 * READ-ONLY against pAIchart. Makes real Anthropic API calls (~$0.30).
 * Writes nothing to our DB, touches no prod, deploys nothing.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * The entire cache-breakpoint workstream rests on ONE unverified premise: that
 * moving the breakpoint yields a cross-execution `cache_read_input_tokens > 0`.
 * Nobody has observed it. Three specialists reasoned about it from docs, and the
 * coordinator was wrong three times (wrong lever, wrong scope, wrong instrument).
 *
 * This is a FALSIFICATION test, not a measurement. A red result kills the
 * workstream for thirty cents, before anyone writes the implementation.
 *
 * ── WHAT IT DOES ───────────────────────────────────────────────────────────
 *   A. Reads the REAL preamble from the local DB (same query as the engine).
 *   B. Counts its tokens against the DEFAULT model (free; settles the ~42K claim
 *      and the Haiku 4,096-token floor in one call).
 *   C. CONTROL  — today's shape: ONE system block, breakpoint at the end.
 *                 Two calls with DIFFERENT suffixes. Expect: no cross-call read.
 *   D. TREATMENT — split shape: TWO system blocks, breakpoint on the first.
 *                 Two calls with DIFFERENT suffixes. Expect: call 2 reads.
 *
 * The control arm is what makes this a test rather than a demo — without it a
 * read on D proves nothing (it could be ambient behaviour).
 *
 * ── WHAT A RESULT MEANS ────────────────────────────────────────────────────
 *   D2 read > 0, C2 read == 0  → premise CONFIRMED. Proceed to revise the plan.
 *   D2 read == 0               → premise FALSIFIED. Stop the workstream. This is
 *                                the outcome worth thirty cents.
 *   C2 read > 0                → we already get cross-execution reuse and the
 *                                whole finding is wrong. Investigate before anything else.
 *
 * Usage:  npx ts-node scripts/probe-cache-breakpoint.ts            # dry run, no API calls
 *         npx ts-node scripts/probe-cache-breakpoint.ts --execute  # makes 4 billable calls
 */
import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '@prisma/client';
import { UNIVERSAL_AGENT_RULES } from '../lib/agents/universal-agent-rules';

const EXECUTE = process.argv.includes('--execute');
// Resolve the API key the way the ENGINE does — from the DB, in-process.
// The credential is never printed, never passed through a shell, and never
// leaves the machine this runs on. Mirrors llm-service.ts resolveUserSettings:
// per-user settings.llm.apiKey, else the global llm_settings CustomSchema.
const USER_ARG = (process.argv.find((a) => a.startsWith('--user=')) || '').split('=')[1];

async function resolveApiKey(prisma: PrismaClient): Promise<{ key: string; source: string }> {
  if (process.env.ANTHROPIC_API_KEY) return { key: process.env.ANTHROPIC_API_KEY, source: 'env' };
  if (USER_ARG) {
    const u = await prisma.user.findFirst({ where: { email: USER_ARG }, select: { id: true } });
    if (u) {
      const us = await prisma.userSettings.findUnique({ where: { userId: u.id } });
      const llm = (us?.settings as any)?.llm;
      // Field name mirrors llm-service extractSettingsConfig: for the anthropic
      // providers the key lives at `anthropicApiKey`, NOT `apiKey`.
      const uk = llm?.anthropicApiKey || llm?.apiKey;
      if (uk && !llm.useSystemProvider) return { key: uk, source: `user:${USER_ARG}` };
    }
  }
  const g = await prisma.customSchema.findFirst({ where: { name: 'llm_settings' } });
  const gs = (g?.schema as any) || {};
  const gk = gs.anthropicApiKey || gs.apiKey;
  if (gk) return { key: gk, source: `global llm_settings (provider=${gs.provider ?? '?'})` };
  throw new Error('No API key found (env, --user=<email> settings, or global llm_settings)');
}
// Haiku 4.5 is the platform default and has the HIGHEST cache floor (4,096
// tokens vs Sonnet's 1,024) — probing the default path also probes the worst case.
const MODEL = process.env.PROBE_MODEL || 'claude-haiku-4-5';

async function buildRealPreamble(prisma: PrismaClient): Promise<string> {
  // Mirrors execution-system-prompt.ts:190-198 exactly — same filter, same order,
  // same cap. If this drifts from the engine the probe is measuring a fiction.
  const protocols = await prisma.agentPromptLibrary.findMany({
    where: { tags: { has: 'protocol' }, status: 'ACTIVE' },
    select: { name: true, description: true, promptText: true },
    orderBy: { name: 'asc' },
    take: 10,
  });
  const section = protocols
    .map((p) => `### Protocol: ${p.name}\n${p.description}\n\n${p.promptText}`)
    .join('\n\n---\n\n');
  return `${UNIVERSAL_AGENT_RULES}\n\n---\n\n## Available Orchestration Protocols\n\n${section}\n\n---\n\n`;
}

type Usage = { write: number; read: number; uncached: number };
const usageOf = (r: any): Usage => ({
  write: r.usage?.cache_creation_input_tokens ?? 0,
  read: r.usage?.cache_read_input_tokens ?? 0,
  uncached: r.usage?.input_tokens ?? 0,
});
const fmt = (u: Usage) =>
  `write ${u.write.toLocaleString().padStart(7)}  read ${u.read.toLocaleString().padStart(7)}  uncached ${u.uncached.toLocaleString().padStart(6)}`;

async function main() {
  const prisma = new PrismaClient();
  const preamble = await buildRealPreamble(prisma);
  const rest = `## Harness Context (Platform-Resolved)\n\n**Your mode is: SYNTHESIZE**\nResolved at: ${new Date().toISOString()}\n\n---\n\nYou are a probe agent.`;
  await prisma.$disconnect();

  console.log('═'.repeat(78));
  console.log(' CACHE BREAKPOINT PROBE — falsification test');
  console.log('═'.repeat(78));
  console.log(`  model              : ${MODEL}`);
  console.log(`  preamble           : ${preamble.length.toLocaleString()} chars`);
  console.log(`  rest (variable)    : ${rest.length.toLocaleString()} chars`);
  console.log(`  mode               : ${EXECUTE ? '🔴 EXECUTE (4 billable calls)' : '🟢 DRY RUN (no API calls)'}`);

  if (!EXECUTE) {
    console.log('\n  Dry run. Re-run with --execute to make the 4 API calls (~$0.30).');
    console.log('  Nothing was sent to the Anthropic API.');
    return;
  }

  const prisma2 = new PrismaClient();
  const { key, source } = await resolveApiKey(prisma2);
  await prisma2.$disconnect();
  console.log(`  credential source  : ${source} (len ${key.length}, never printed)`);
  const client = new Anthropic({ apiKey: key });

  // ── B. token count (free) — settles the size claim + the Haiku floor ──────
  const counted = await client.messages.countTokens({
    model: MODEL as any,
    system: [{ type: 'text', text: preamble }],
    messages: [{ role: 'user', content: 'x' }],
  });
  const floor = MODEL.includes('haiku') ? 4096 : 1024;
  console.log(`\n  preamble tokens    : ${counted.input_tokens.toLocaleString()}`);
  console.log(`  cache floor (${MODEL.includes('haiku') ? 'Haiku' : 'other'}) : ${floor.toLocaleString()}  ` +
    (counted.input_tokens >= floor ? '✅ above' : '🔴 BELOW — cannot cache, probe is moot'));

  const call = (system: any, suffix: string) =>
    client.messages.create({
      model: MODEL as any,
      max_tokens: 16,
      system,
      messages: [{ role: 'user', content: `Reply with the single word OK. ${suffix}` }],
    });

  // ── C. CONTROL: today's shape — ONE block, breakpoint at the end ──────────
  console.log('\n' + '─'.repeat(78));
  console.log(' C — CONTROL (today: one system block, breakpoint at the end)');
  console.log('─'.repeat(78));
  const oneBlock = (s: string) => [
    { type: 'text' as const, text: s, cache_control: { type: 'ephemeral' as const } },
  ];
  const c1 = usageOf(await call(oneBlock(preamble + rest), 'alpha'));
  console.log(`  call 1  ${fmt(c1)}`);
  const c2 = usageOf(await call(oneBlock(preamble + rest + '\nDifferent task context.'), 'beta'));
  console.log(`  call 2  ${fmt(c2)}   ← expect read 0 (suffix differs, one breakpoint at the tail)`);

  // ── D. TREATMENT: split — TWO blocks, breakpoint on the first ─────────────
  console.log('\n' + '─'.repeat(78));
  console.log(' D — TREATMENT (split: two system blocks, breakpoint on the FIRST)');
  console.log('─'.repeat(78));
  const twoBlocks = (pre: string, tail: string) => [
    { type: 'text' as const, text: pre, cache_control: { type: 'ephemeral' as const } },
    { type: 'text' as const, text: tail },
  ];
  const d1 = usageOf(await call(twoBlocks(preamble, rest), 'gamma'));
  console.log(`  call 1  ${fmt(d1)}`);
  const d2 = usageOf(await call(twoBlocks(preamble, rest + '\nDifferent task context.'), 'delta'));
  console.log(`  call 2  ${fmt(d2)}   ← THE RESULT: read > 0 means the premise holds`);

  // ── verdict ──────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(78));
  if (c2.read > 0) {
    console.log(' ⚠️  UNEXPECTED — the control also read across calls.');
    console.log('     We may already have cross-execution reuse and the premise is wrong.');
    console.log('     Investigate before doing anything else.');
  } else if (d2.read > 0) {
    console.log(' ✅ PREMISE CONFIRMED — the split produces a cross-call cache read.');
    console.log(`    control call 2 read ${c2.read}, treatment call 2 read ${d2.read.toLocaleString()}`);
    console.log(`    write avoided on the treatment: ${(d1.write - d2.write).toLocaleString()} tokens`);
    console.log('    → proceed to revise the plan against SYNTHESIS items 1-8.');
  } else {
    console.log(' 🔴 PREMISE FALSIFIED — the split did NOT produce a cache read.');
    console.log('    Stop the workstream. This is the outcome worth thirty cents.');
  }
  console.log('═'.repeat(78));
  console.log('\n Also settled by this run:');
  console.log('  • whether a 2-block system + top-level auto-cache compose (open question 1)');
  console.log('  • the real preamble token count (vs the ~42K estimate)');
  console.log('  • whether the default-model path clears its cache floor');
}

main().catch((e) => { console.error('PROBE FAILED:', e?.message || e); process.exit(1); });
