#!/usr/bin/env ts-node
/**
 * TEST — token-usage-persistence Phase 1 (pricing derivation + column builder + response contract)
 *
 * The riskiest new logic is COST derivation: time-versioned rates, as-of pricing, cache multipliers,
 * serving-model keying, unknown→null. Plus the shared column builder's null semantics and the Zod
 * contract for the analytics surface.
 *
 * CI-safe: stub DATABASE_URL before any import that might reach lib/prisma transitively.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';
import { readFileSync } from 'fs';
import { join } from 'path';
import { costForExecution, resolvePricingKey, PRICING_VERSION } from '@/lib/services/llm/model-pricing';
import { buildTokenUsageColumns, aggregateUsageRows, rollUpAndDeleteExecutions, ROLLUP_NO_POV, ROLLUP_UNKNOWN_MODEL, type UsageRow } from '@/lib/services/execution-artifacts';
import { TokenUsageSummarySchema } from '@/lib/validation/analytics-response';

let passed = 0, failed = 0;
const ok = (c: boolean, m: string) => { if (c) { passed++; console.log(`  ✅ ${m}`); } else { failed++; console.log(`  ❌ ${m}`); } };
const near = (a: number | null, b: number) => a != null && Math.abs(a - b) < 1e-9;

const M = 1_000_000; // 1 MTok — makes $/MTok rates the expected dollar figure directly
const introDate = new Date('2026-07-15');   // within Sonnet-5 intro window (≤ 2026-08-31)
const stdDate = new Date('2026-09-15');      // after intro expiry

console.log('\n🧪 TEST — token-usage persistence\n');

// ── resolvePricingKey: family mapping + sonnet-5 vs sonnet-4 disambiguation ──
console.log('── resolvePricingKey ──');
{
  ok(resolvePricingKey('claude-sonnet-5') === 'sonnet-5', 'sonnet-5 → sonnet-5 (not legacy)');
  ok(resolvePricingKey('claude-sonnet-4-6') === 'sonnet-legacy', 'sonnet-4-6 → sonnet-legacy');
  ok(resolvePricingKey('claude-fable-5') === 'fable' && resolvePricingKey('claude-mythos-5') === 'fable', 'fable/mythos → fable');
  ok(resolvePricingKey('claude-opus-4-8') === 'opus', 'opus-4-8 → opus');
  ok(resolvePricingKey('claude-haiku-4-5-20251001') === 'haiku', 'dated haiku snapshot → haiku');
  ok(resolvePricingKey('gpt-4o') === null && resolvePricingKey(null) === null && resolvePricingKey('') === null, 'unknown/null/empty → null');
}

// ── costForExecution: base rates (1M in + 1M out), no cache ──
console.log('\n── cost: base rates ──');
{
  const io = { inputTokens: M, outputTokens: M };
  ok(near(costForExecution(io, 'claude-sonnet-5', introDate).costUsd, 2 + 10), 'sonnet-5 INTRO: $2 in + $10 out = $12');
  ok(near(costForExecution(io, 'claude-sonnet-5', stdDate).costUsd, 3 + 15), 'sonnet-5 STANDARD (after 2026-08-31): $3 + $15 = $18');
  ok(near(costForExecution(io, 'claude-sonnet-4-6', introDate).costUsd, 3 + 15), 'sonnet-4-6: $3 + $15 = $18');
  ok(near(costForExecution(io, 'claude-opus-4-8', introDate).costUsd, 5 + 25), 'opus: $5 + $25 = $30');
  ok(near(costForExecution(io, 'claude-fable-5', introDate).costUsd, 10 + 50), 'fable: $10 + $50 = $60');
  ok(near(costForExecution(io, 'claude-haiku-4-5', introDate).costUsd, 1 + 5), 'haiku: $1 + $5 = $6');
}

// ── cache multipliers (priced off the input rate) ──
console.log('\n── cost: cache multipliers ──');
{
  // opus input rate = $5/MTok. cacheRead = 0.1× = $0.5/M; cacheCreation(5m) = 1.25× = $6.25/M.
  ok(near(costForExecution({ cacheReadTokens: M }, 'claude-opus-4-8', introDate).costUsd, 0.5), 'cacheRead = input × 0.1 ($0.50/M on opus)');
  ok(near(costForExecution({ cacheCreationTokens: M }, 'claude-opus-4-8', introDate).costUsd, 6.25), 'cacheCreation = input × 1.25 ($6.25/M on opus)');
}

// ── serving-model keying: a Fable→Opus rescue prices at OPUS (modelUsed = serving model) ──
console.log('\n── cost: serving model ──');
{
  const io = { inputTokens: M, outputTokens: M };
  ok(near(costForExecution(io, 'claude-opus-4-8', introDate).costUsd, 30), 'rescued call stored as claude-opus-4-8 prices at Opus ($30), not Fable');
}

// ── unknown / unpriceable → null cost, priced:false (never fabricated 0) ──
console.log('\n── cost: unpriceable ──');
{
  const r = costForExecution({ inputTokens: M }, 'gpt-4o', introDate);
  ok(r.costUsd === null && r.priced === false, 'unknown model → costUsd null, priced false');
  const n = costForExecution({ inputTokens: M }, null, introDate);
  ok(n.costUsd === null && n.priced === false, 'null model → costUsd null, priced false');
  ok(typeof PRICING_VERSION === 'string' && PRICING_VERSION.length > 0, 'pricingVersion is stamped');
}

// ── buildTokenUsageColumns: null semantics ──
console.log('\n── buildTokenUsageColumns ──');
{
  const none = buildTokenUsageColumns(undefined, null);
  ok(none.inputTokens === null && none.outputTokens === null && none.cacheReadTokens === null
     && none.cacheCreationTokens === null && none.modelUsed === null,
    'undefined usage (failure before any LLM call) → all columns null');
  const some = buildTokenUsageColumns({ inputTokens: 10, outputTokens: 20, cacheReadTokens: 3, cacheCreationTokens: 4 }, 'claude-sonnet-5');
  ok(some.inputTokens === 10 && some.outputTokens === 20 && some.cacheReadTokens === 3 && some.cacheCreationTokens === 4 && some.modelUsed === 'claude-sonnet-5',
    'present usage → passthrough incl. modelUsed');
  ok(buildTokenUsageColumns({ inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheCreationTokens: 0 }, undefined).modelUsed === null,
    'undefined modelUsed → null (never a fabricated default)');
}

// ── TokenUsageSummarySchema: the analytics contract ──
console.log('\n── TokenUsageSummarySchema ──');
{
  const good = {
    totalTokensUsed: 100, totalInputTokens: 60, totalOutputTokens: 40,
    totalCacheReadTokens: 5, totalCacheCreationTokens: 2, totalCostUsd: 1.23, costCoverage: 0.5,
    byModel: [{ model: 'claude-sonnet-5', executions: 3, inputTokens: 60, outputTokens: 40, costUsd: 1.23 }],
  };
  ok(TokenUsageSummarySchema.safeParse(good).success, 'valid token-usage summary parses');
  ok(TokenUsageSummarySchema.safeParse({ ...good, totalCostUsd: 'nope' }).success === false, 'wrong-typed cost rejected');
  ok(TokenUsageSummarySchema.safeParse({ ...good, byModel: [{ model: 'anything-server-fallback-id', executions: 1, inputTokens: 1, outputTokens: 1, costUsd: 0 }] }).success,
    'byModel.model is OPEN (accepts a non-registry served id)');
}

// ── aggregateUsageRows: the durable roll-up bucketing (Phase 2 #1) ──
console.log('\n── aggregateUsageRows (roll-up before PRUNE) ──');
{
  const d = (iso: string) => new Date(iso);
  const row = (o: Partial<UsageRow>): UsageRow => ({
    startTime: d('2026-07-02T10:00:00Z'), inputTokens: 100, outputTokens: 50,
    cacheReadTokens: 10, cacheCreationTokens: 5, modelUsed: 'claude-sonnet-5', povId: 'cpov1', ...o,
  });

  // same (povId, day, model) → merged
  const merged = aggregateUsageRows([row({}), row({ inputTokens: 200, outputTokens: 20 })]);
  ok(merged.length === 1 && merged[0].executions === 2n && merged[0].inputTokens === 300n && merged[0].outputTokens === 70n,
    'same (povId,day,model) rows MERGE: executions 2, tokens summed (BigInt)');
  ok(merged[0].cacheReadTokens === 20n && merged[0].cacheCreationTokens === 10n, 'cache tokens summed too');

  // different UTC day → separate buckets; day is startTime not now
  const twoDays = aggregateUsageRows([row({}), row({ startTime: d('2026-07-03T01:00:00Z') })]);
  ok(twoDays.length === 2 && twoDays.some(b => b.bucketDate === '2026-07-02') && twoDays.some(b => b.bucketDate === '2026-07-03'),
    'different UTC day → separate buckets (bucketDate = startTime day)');

  // sentinels
  const sent = aggregateUsageRows([row({ povId: null, modelUsed: null })]);
  ok(sent[0].povId === ROLLUP_NO_POV && sent[0].modelUsed === ROLLUP_UNKNOWN_MODEL, 'null povId/model → __none__/__unknown__ sentinels');

  // skip all-null-token rows + no-startTime rows
  const skipped = aggregateUsageRows([
    row({ inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null }),
    row({ startTime: null }),
  ]);
  ok(skipped.length === 0, 'all-null-token AND no-startTime rows are skipped');

  // a real row still counts when others are skipped
  const mixed = aggregateUsageRows([row({ inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null }), row({})]);
  ok(mixed.length === 1 && mixed[0].executions === 1n, 'skip does not drop the valid sibling row');
}

// ── parity guard: rollUpAndDeleteExecutions is called at exactly 3 delete sites (of the 5 that exist) ──
console.log('\n── parity: rollUpAndDeleteExecutions call sites ──');
{
  const fs = require('fs') as typeof import('fs');
  // The 3 token-bearing execution-delete sites now route their DELETE through this fn (BC-#2). The
  // lookbehind excludes the `function rollUpAndDeleteExecutions(` definition line in execution-artifacts.ts.
  const files = ['lib/services/execution-terminal-persist.ts', 'lib/services/mcp/resourceManager.ts'];
  let calls = 0;
  for (const f of files) {
    const src = fs.readFileSync(require('path').join(__dirname, '..', f), 'utf8');
    calls += (src.match(/(?<!function )rollUpAndDeleteExecutions\(/g) || []).length;
  }
  ok(calls === 3, `exactly 3 rollUpAndDeleteExecutions() call sites (core PRUNE + resourceManager byTask + byAge) — found ${calls}`);
}

// ── BC-#2 structural: the rollup reads from DELETE…RETURNING, never a pre-delete findMany ──
console.log('\n── BC-#2 structural: exactly-once construction ──');
{
  const fs = require('fs') as typeof import('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'lib/services/execution-artifacts.ts'), 'utf8');
  const start = src.indexOf('export async function rollUpAndDeleteExecutions');
  const body = src.slice(start, src.indexOf('\n}\n', start));
  ok(/DELETE FROM agent_executions[\s\S]*RETURNING/.test(body), 'rolls up from a DELETE … RETURNING (only the rows THIS tx removed)');
  ok(!/agentExecution\.findMany|\.findMany\(/.test(body), 'no pre-delete findMany of executions — a pre-read reopens the concurrent double-count race');
}

// ── BC-#2 behavioral + summary (async IIFE — the tx-mock calls await) ──
(async () => {
  console.log('\n── BC-#2 behavioral: exactly-once via tx-mock ──');
  {
    const d = new Date('2026-07-02T10:00:00Z');
    const mkRow = (o: Partial<UsageRow>): UsageRow => ({
      startTime: d, inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheCreationTokens: 5,
      modelUsed: 'claude-sonnet-5', povId: 'cpov1', ...o,
    });
    const makeMock = (returned: UsageRow[]) => {
      const executeRawCalls: unknown[][] = [];
      const client = {
        // simulate DELETE … RETURNING → the rows THIS tx actually removed
        $queryRaw: async (..._a: unknown[]) => returned,
        // one INSERT … ON CONFLICT per distinct (pov,day,model) bucket
        $executeRaw: async (...a: unknown[]) => { executeRawCalls.push(a); return 1; },
      };
      return { client, executeRawCalls };
    };

    // Request 3 ids; the DELETE only RETURNS 2 (the 3rd was already removed by a concurrent pruner) across 2 buckets.
    const returned = [mkRow({}), mkRow({ modelUsed: 'claude-opus-4-8' })];
    const m = makeMock(returned);
    const deleted = await rollUpAndDeleteExecutions(m.client as never, ['id1', 'id2', 'id3-already-gone']);
    ok(deleted === 2, 'returns the RETURNING count (2), NOT the requested id count (3) — a concurrently-deleted row is not re-counted');
    ok(m.executeRawCalls.length === 2, 'rolls up exactly the 2 returned buckets — exactly-once by construction');

    const empty = makeMock([]);
    const none = await rollUpAndDeleteExecutions(empty.client as never, []);
    ok(none === 0 && empty.executeRawCalls.length === 0, 'empty id list → short-circuits, no query, returns 0');
  }

  // ── PROVIDER MAPPING: a genuine ZERO must survive to the column ────────────
  // Regression guard for the 2026-08-10 fix. The provider mapped cache counters with
  // `|| undefined`, so a genuine 0 became undefined → NULL in agent_executions. Because
  // avg() skips NULLs and every standing query filters `IS NOT NULL`, an execution that
  // cached NOTHING silently LEFT THE SAMPLE — so cache averages were computed over
  // survivors only, and a partial cache collapse would have read as "unchanged".
  // Source-asserted (the repo idiom, cf. test-mode-resolver-injection) because the mapping
  // is inline in generateText and not independently callable.
  {
    const src = readFileSync(join(__dirname, '..', 'lib/services/llm/anthropic-sdk-provider.ts'), 'utf8');
    ok(/cache_read_input_tokens \?\? undefined/.test(src),
       'provider maps cache_read_input_tokens with ?? (preserves a genuine 0)');
    ok(/cache_creation_input_tokens \?\? undefined/.test(src),
       'provider maps cache_creation_input_tokens with ?? (preserves a genuine 0)');
    ok(!/cache_(read|creation)_input_tokens \|\| undefined/.test(src),
       'provider does NOT use || on cache counters — || maps 0 to undefined and drops the row from every average');
  }

  console.log(`\n${'─'.repeat(50)}\n  Passed: ${passed}  Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log('  ✅ token-usage: GREEN\n');
})();
