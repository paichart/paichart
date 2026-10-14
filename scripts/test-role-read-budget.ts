#!/usr/bin/env ts-node
/**
 * Per-role read budget for the read_more pager (2026-10-12, size plan owner decision R1).
 *
 * Pins BOTH directions:
 *  - the Program Architect (program_architect, and value_chain_architect — the same guidance constant) gets 9 pages per
 *    document / 12 per run, and the pager + trailer actually use them;
 *  - every other role — every ROLE_GUIDANCE_LIBRARY key and every seeded defaultRole — gets today's 6 / 8, and the
 *    default-budget trailer is BYTE-IDENTICAL to the pre-change output (goldens captured from 39877f71 before the edit).
 * Plus the threading: the ONE production caller (execution-core) passes the resolved role, and a real loop run serves a
 * 7th window to the Architect and refuses it to a default role.
 *
 * Run: npm run test:role-read-budget
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  DEFAULT_READ_BUDGET, PROGRAM_ARCHITECT_READ_BUDGET, ROLE_READ_BUDGETS, readBudgetFor,
} from '../lib/agents/role-read-budget';
import {
  createPagerState, buildMoreRemainsTrailer, executeToolTurn, runAgenticToolLoop, READ_MORE_WINDOW_BOUNDS,
  MAX_TOOL_RESULT_LENGTH,
} from '../lib/agents/harness/agentic-tool-loop';
import { ROLE_GUIDANCE_LIBRARY } from '../lib/services/agentTemplateBuilder/pAIchartUniversalTemplate';
import { LLMProvider } from '../lib/services/llm/types';

let passed = 0, failed = 0;
const ok = (c: boolean, what: string) => {
  if (c) { passed++; console.log(`  ✅ ${what}`); } else { failed++; console.log(`  ❌ ${what}`); }
};
const ROOT = join(__dirname, '..');

async function main() {
  // ── 1. The table ─────────────────────────────────────────────────────────────
  console.log('\n── 1: the role table ──');
  ok(DEFAULT_READ_BUDGET.pagesPerDocument === 6 && DEFAULT_READ_BUDGET.pagesPerRun === 8, 'default is today\'s 6 / 8');
  ok(PROGRAM_ARCHITECT_READ_BUDGET.pagesPerDocument === 9 && PROGRAM_ARCHITECT_READ_BUDGET.pagesPerRun === 12,
     'Program Architect is 9 / 12 (owner decision R1)');
  ok(MAX_TOOL_RESULT_LENGTH + PROGRAM_ARCHITECT_READ_BUDGET.pagesPerDocument * READ_MORE_WINDOW_BOUNDS.max === 71000,
     'Program Architect physical read per document = 8,000 + 9 x 7,000 = 71,000');
  ok(JSON.stringify(Object.keys(ROLE_READ_BUDGETS).sort()) === JSON.stringify(['program_architect', 'value_chain_architect']),
     'exactly two roles depart from the default: program_architect, value_chain_architect');
  ok(Object.isFrozen(ROLE_READ_BUDGETS) && Object.isFrozen(DEFAULT_READ_BUDGET) && Object.isFrozen(PROGRAM_ARCHITECT_READ_BUDGET),
     'table and budgets are frozen');
  ok(ROLE_GUIDANCE_LIBRARY.program_architect === ROLE_GUIDANCE_LIBRARY.value_chain_architect,
     'value_chain_architect shares program_architect\'s guidance (the reason it shares the budget)');

  // Every role the platform knows: the guidance library + every seeded defaultRole.
  const seeded = new Set<string>();
  for (const f of readdirSync(join(ROOT, 'scripts')).filter((n) => /^seed-.*\.ts$/.test(n))) {
    for (const m of readFileSync(join(ROOT, 'scripts', f), 'utf8').matchAll(/defaultRole: '([a-z_]+)'/g)) seeded.add(m[1]);
  }
  const roles = new Set<string>([...Object.keys(ROLE_GUIDANCE_LIBRARY), ...seeded]);
  ok(roles.size >= 30 && roles.has('program_architect') && roles.has('requirements_author'), `role enumeration is real (${roles.size} roles)`);
  const wrong: string[] = [];
  for (const r of roles) {
    const b = readBudgetFor(r);
    const expectArch = r === 'program_architect' || r === 'value_chain_architect';
    const want = expectArch ? PROGRAM_ARCHITECT_READ_BUDGET : DEFAULT_READ_BUDGET;
    if (b.pagesPerDocument !== want.pagesPerDocument || b.pagesPerRun !== want.pagesPerRun) wrong.push(r);
  }
  ok(wrong.length === 0, `every enumerated role reads its expected budget (non-Architect = 6 / 8)${wrong.length ? ' — WRONG: ' + wrong.join(', ') : ''}`);
  for (const r of [null, undefined, '', 'Program Architect', 'PROGRAM_ARCHITECT', 'program_architect ', '__proto__', 'constructor', 'toString', 'AI Assistant']) {
    ok(readBudgetFor(r as any) === DEFAULT_READ_BUDGET, `readBudgetFor(${JSON.stringify(r)}) → default (exact key match only)`);
  }

  // ── 2. Pager state ───────────────────────────────────────────────────────────
  console.log('\n── 2: createPagerState ──');
  {
    const d = createPagerState(100);
    ok(d.pagesPerDocument === 6 && d.maxPagerTurns === 8, 'no budget → 6 / min(8, 25) = 8 (unchanged)');
    const a = createPagerState(100, readBudgetFor('program_architect'));
    ok(a.pagesPerDocument === 9 && a.maxPagerTurns === 12, 'Architect at 100 turns → 9 / min(12, 25) = 12');
    const a30 = createPagerState(30, readBudgetFor('program_architect'));
    ok(a30.maxPagerTurns === 7, 'Architect at its REAL 30 turns → min(12, floor(7.5)) = 7: the turn cap binds (reported to the owner)');
    ok(createPagerState(48, readBudgetFor('program_architect')).maxPagerTurns === 12, 'maxToolTurns 48 is the least that reaches 12');
    ok(createPagerState(47, readBudgetFor('program_architect')).maxPagerTurns === 11, '47 turns reach only 11');
    ok(createPagerState(30).maxPagerTurns === 7, 'default role at 30 turns → 7 (unchanged)');
  }

  // ── 3. Trailer: default budget byte-identical; 9-page math ──────────────────────
  console.log('\n── 3: trailer ──');
  {
    // Captured from the pre-change buildMoreRemainsTrailer (six args; per-origin cap the module constant 6).
    const cases: Array<[number, number, number, number, number, number]> = [
      [2, 14000, 45956, 1, 2, 7], [2, 40000, 45956, 1, 1, 7], [2, 8000, 100000, 1, 1, 7], [2, 44000, 45956, 6, 7, 7],
      [1, 15000, 50000, 1, 1, 8], [3, 20000, 30000, 2, 3, 8],
    ];
    const GOLDEN = [
      "\n[more remains] — continue: read_more({ ref: \"2\", offset: 14000, limit: 6392 }). 31956 characters remain; 5 more window(s) at that size finish this result, and 5 window(s) are available. Each window costs a turn. A scoped/narrower re-read of the source is usually cheaper than paging on, where a narrower form exists.",
      "\n[more remains] — continue: read_more({ ref: \"2\", offset: 40000 }). 5956 characters remain; 1 more window(s) at that size finish this result, and 5 window(s) are available. Each window costs a turn. A scoped/narrower re-read of the source is usually cheaper than paging on, where a narrower form exists.",
      "\n[more remains] — 92000 characters remain; the 5 window(s) left for this result reach at most 35000 of them, so the final 57000 are BEYOND this pager's reach at any window size. Do not page on to find out. Re-read the source scoped/narrower, or name that tail as a gap in your output. A scoped/narrower re-read of the source is usually cheaper than paging on, where a narrower form exists.",
      "\n[more remains] — 1956 characters remain and NO pager windows are left for this result. Stop paging: re-read the source scoped/narrower, or name that tail as a gap in your output. A scoped/narrower re-read of the source is usually cheaper than paging on, where a narrower form exists.",
      "\n[more remains] — continue: read_more({ ref: \"1\", offset: 15000, limit: 7000 }). 35000 characters remain; 5 more window(s) at that size finish this result, and 5 window(s) are available. Each window costs a turn. A scoped/narrower re-read of the source is usually cheaper than paging on, where a narrower form exists.",
      "\n[more remains] — continue: read_more({ ref: \"3\", offset: 20000 }). 10000 characters remain; 2 more window(s) at that size finish this result, and 4 window(s) are available. Each window costs a turn. A scoped/narrower re-read of the source is usually cheaper than paging on, where a narrower form exists.",
    ];
    const got = cases.map((c) => buildMoreRemainsTrailer(...c, DEFAULT_READ_BUDGET.pagesPerDocument));
    ok(got.every((t, i) => t === GOLDEN[i]), 'default budget: all six trailers byte-identical to the pre-change output');

    // A 64,000-char spec (the checked limit), first read_more at the default window → offset 14,000, 1 page on the ref.
    const def = buildMoreRemainsTrailer(1, 14000, 64000, 1, 1, 8, DEFAULT_READ_BUDGET.pagesPerDocument);
    const arch = buildMoreRemainsTrailer(1, 14000, 64000, 1, 1, 12, PROGRAM_ARCHITECT_READ_BUDGET.pagesPerDocument);
    ok(/the 5 window\(s\) left for this result reach at most 35000/.test(def) && /BEYOND this pager's reach/.test(def),
       '6 pages: a 64,000 document is unreachable — 5 windows reach 35,000 of 50,000');
    ok(arch.includes('limit: 6250') && arch.includes('8 window(s) are available') && arch.includes('50000 characters remain'),
       '9 pages: 8 windows left, suggests the minimum finishing window 6,250 (14,000 + 8 x 6,250 = 64,000)');
    // The per-RUN cap still binds when it is the smaller: 12-run budget with 10 already spent → 2 left.
    ok(buildMoreRemainsTrailer(1, 14000, 64000, 1, 10, 12, 9).includes('the 2 window(s) left'),
       '9 pages: the per-run cap still binds when smaller (min of both)');
  }

  // ── 4. pagerServe: per-origin cap from the pager state ─────────────────────────
  console.log('\n── 4: per-origin cap served from the pager ──');
  const ctx = { executionId: 'exec-rb', userId: 'user-a', turn: 1 };
  const mkDeps = (body: string) => ({
    getToolDefinition: async (name: string) => ({ serverName: `srv-${name}` }),
    executeToolOnServer: async () => ({ body }),
    logger: { warn: () => {} },
  } as any);
  async function pageToEnd(budgetRole: string | null, bodyLen: number) {
    const pager = createPagerState(100, readBudgetFor(budgetRole));
    const deps = mkDeps('x'.repeat(bodyLen));
    await executeToolTurn([{ id: 'c', name: 'alpha', arguments: '{}' }], deps, ctx, {}, pager);
    const total = (pager.store.get(1) as string).length;
    let offset = MAX_TOOL_RESULT_LENGTH, windows = 0, last = '';
    for (let i = 0; i < 12; i++) {
      const r = await executeToolTurn([{ id: `p${i}`, name: 'read_more', arguments: JSON.stringify({ ref: '1', offset, limit: 7000 }) }], deps, ctx, {}, pager);
      last = r.toolResultBlocks[0].content;
      if (r.toolResultBlocks[0].is_error) break;
      windows++;
      if (last.includes('[end of result]')) break;
      offset += 7000;
    }
    return { total, windows, last };
  }
  {
    const a = await pageToEnd('program_architect', 70_980);
    ok(a.total <= 71000 && a.total > 64000, `Architect fixture is a ${a.total}-char result (64K < n <= 71K)`);
    ok(a.windows === 9 && a.last.includes('[end of result]'), 'Architect: 9 windows of 7,000 read the result to its end');
    const d = await pageToEnd(null, 70_980);
    ok(d.windows === 6 && /already paged ref 1 6 times/.test(d.last), 'default role: refused after 6 windows (message names 6)');
    const pager = createPagerState(100, readBudgetFor('program_architect'));
    const deps = mkDeps('y'.repeat(200_000));
    await executeToolTurn([{ id: 'c', name: 'alpha', arguments: '{}' }], deps, ctx, {}, pager);
    let msg = '';
    for (let i = 0; i < 10; i++) {
      const r = await executeToolTurn([{ id: `q${i}`, name: 'read_more', arguments: JSON.stringify({ ref: '1', offset: 8000 + i * 100, limit: 100 }) }], deps, ctx, {}, pager);
      msg = r.toolResultBlocks[0].content;
    }
    ok(/already paged ref 1 9 times/.test(msg), 'Architect: the 10th window on one ref is refused, and the message names 9');
  }

  // ── 5. Threading: the core passes the role; a real loop honours it ───────────────
  console.log('\n── 5: threading ──');
  {
    const core = readFileSync(join(ROOT, 'lib', 'services', 'execution-core.ts'), 'utf8');
    const call = core.slice(core.indexOf('runAgenticToolLoop({'), core.indexOf('}, {', core.indexOf('runAgenticToolLoop({')));
    ok(/\n\s+agentRole,\n/.test(call), 'execution-core (the ONE production caller, both adapters) passes the resolved agentRole');
    const loop = readFileSync(join(ROOT, 'lib', 'agents', 'harness', 'agentic-tool-loop.ts'), 'utf8');
    ok(loop.includes('createPagerState(maxToolTurns, readBudgetFor(agentRole))'), 'the loop builds its pager from readBudgetFor(agentRole)');
    ok(!/READ_MORE_PAGES_PER_ORIGIN/.test(loop.replace(/\/\/.*$/gm, '')), 'no module-level per-origin constant survives in code');

    // Behavioural: 7 read_more windows on one ref. The 7th is served to the Architect, refused to a default role.
    const mkResp = (over: Record<string, unknown> = {}) => ({
      text: 'final answer', stopReason: 'end_turn', usage: { inputTokens: 10, outputTokens: 5 },
      rawContentBlocks: [{ type: 'text', text: 'final answer' }], ...over,
    });
    const mkToolUse = (id: string, name: string, args: unknown) =>
      mkResp({ stopReason: 'tool_use', text: '', functionCalls: [{ id, name, arguments: JSON.stringify(args) }], rawContentBlocks: [{ type: 'tool_use', id }] });
    async function run(agentRole: string | null) {
      const script = [mkToolUse('c0', 'alpha', {})];
      for (let i = 0; i < 7; i++) script.push(mkToolUse(`r${i}`, 'read_more', { ref: '1', offset: 8000 + i * 100, limit: 100 }));
      script.push(mkResp(), mkResp(), mkResp());
      let i = 0;
      const r = await runAgenticToolLoop({
        prompt: 'p', cfg: {
          maxTokens: 4096, temperature: 0.3, topP: undefined, stopSequences: undefined, systemPrompt: 's',
          provider: LLMProvider.ANTHROPIC_SDK, model: 'test-model', apiKey: 'sk-test-FAKE', webSearch: undefined,
          cacheControl: undefined, thinkingBudgetTokens: undefined,
        } as any,
        mcpFunctions: [{ name: 'alpha', description: 'x', parameters: {} }] as any,
        maxToolTurns: 100, signal: new AbortController().signal, deadlineAt: Date.now() + 3_600_000,
        agentRole, executionId: 'e', taskId: 't', userId: 'u',
      }, {
        getToolDefinition: async (name: string) => ({ serverName: `srv-${name}` }) as any,
        executeToolOnServer: async () => ({ body: 'z'.repeat(30_000) }) as any,
        generateText: async () => { if (i >= script.length) throw new Error('script exhausted'); return script[i++] as any; },
        logger: { info: () => {}, warn: () => {}, error: () => {} } as any,
      });
      return r.toolCallResults.filter((t) => t.tool === 'read_more');
    }
    const arch = await run('program_architect');
    ok(arch.length === 7 && arch.every((t) => t.success), 'loop run as program_architect: all 7 windows served');
    const def = await run('config_change_author');
    ok(def.length === 7 && def.slice(0, 6).every((t) => t.success) && def[6].success === false && /6 times/.test(String(def[6].error)),
       'loop run as config_change_author: the 7th window refused at 6');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
