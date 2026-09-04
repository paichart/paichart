#!/usr/bin/env ts-node
/**
 * SDK RequestOptions coverage gate — the enforcement half of F-NEW-5.
 *
 * THE BUG THIS EXISTS FOR (2026-07-17): an option accepted at a layer boundary, forwarded faithfully
 * by every intermediate layer, and never read at the terminus. TypeScript's structural typing makes
 * that legal at every hop, so no layer errors and no test failed. A Browser Automation scrape burned
 * 60,196ms (= the SDK's DEFAULT_REQUEST_TIMEOUT_MSEC of 60,000 + overhead) inside a live pipeline
 * harvest and killed the leg — while the gateway advertised `effectiveTimeout: 300000`.
 *
 * WHY A GREP GATE AND NOT A TYPE: "declared-but-unread option-bag field" is precisely what structural
 * typing permits; no lint rule sees cross-function property non-consumption. This mirrors the
 * enforcement half of `boundary-contract-wrapper-enforcement-pattern.md` (94%): a canonical shape plus
 * an automated grep test that fails CI when a caller bypasses it. That pattern's own lesson is why
 * this file exists — the codebase ALREADY had timeout enforcement in `mcpClientWrapper.executeTool`
 * and `protocolHandler`, and every wiring site bypassed them (`clientWrapper: null as any`) until they
 * rotted into dead code (both files deleted 2026-07-17 after an 8-month prod-log zero-hit
 * verification). Enforcement without a bypass test does not survive the N-th author.
 *
 * THE RULE: an SDK `.callTool(` call must pass RequestOptions (the THIRD argument — 2nd is
 * resultSchema, so options-in-2nd-position is a WORSE bug), or carry an explicit exempt marker.
 */
import * as fs from 'fs';
import * as path from 'path';

let passed = 0, failed = 0;
function test(desc: string, fn: () => void) {
  try { fn(); console.log(`✅ ${desc}`); passed++; }
  catch (e) { console.log(`❌ ${desc}\n   ${e instanceof Error ? e.message : e}`); failed++; }
}
function assert(c: boolean, m: string) { if (!c) throw new Error(m); }

const ROOT = path.join(__dirname, '..');
const EXEMPT = 'request-options-exempt:';

/** Files that legitimately call an MCP SDK client. Add here when a new one appears. */
const SITES = [
  'lib/mcp/server/tools/hub/service-call-handler.js',
  'lib/mcp/server/tools/hub/workflow-tools-handler.js',
  'lib/services/workflow/integrations/service-caller.ts',
  'lib/services/mcp/mcpService.ts',
];

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * Find `.callTool(` invocations and return the ~600 chars following each, so we can look for a third
 * argument. Deliberately crude: this gate is a tripwire, not a parser. It must be robust to comments
 * (which is why the exempt marker is checked on the same slice).
 */
function callToolSlices(src: string): string[] {
  const out: string[] = [];
  // SDK-CLIENT RECEIVERS ONLY. `embeddedMCPServer.callTool(toolName, args, context)` is an
  // in-process call with a positional signature and NO RequestOptions — a different contract, not a
  // member of this class (flagging it was this gate's own first false positive).
  // The embedded path's lack of any timeout enforcement is real (F-NEW-5 M2) but needs a different
  // mechanism (race/AbortSignal) and a deliberate decision — tracked separately, NOT gated here.
  const re = /\b(client|pooledClient)\.callTool\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(src.slice(m.index, m.index + 600));
  return out;
}

test('GATE: every .callTool( site passes RequestOptions (3rd arg) or is explicitly exempt', () => {
  const offenders: string[] = [];
  for (const rel of SITES) {
    for (const slice of callToolSlices(read(rel))) {
      if (slice.includes(EXEMPT)) continue;
      // The fixed shape is `.callTool({...}, undefined, { timeout: ... })` — require BOTH the
      // resultSchema slot placeholder and a timeout key in the tail.
      const hasThirdArg = /,\s*(undefined|CallToolResultSchema)\s*,/.test(slice);
      const hasTimeout = /timeout\s*:/.test(slice);
      if (!hasThirdArg || !hasTimeout) offenders.push(rel);
    }
  }
  assert(offenders.length === 0,
    `.callTool( without RequestOptions in: ${[...new Set(offenders)].join(', ')}\n` +
    `   Pass options as the THIRD arg: .callTool({name, arguments}, undefined, { timeout: <ms> })\n` +
    `   Without it the SDK applies its 60s default and any advertised effectiveTimeout is a FALSE fact.\n` +
    `   If a site genuinely must not set one, add a "// ${EXEMPT} <reason>" comment beside the call.`);
});

test('GATE: options are never passed in the SECOND slot (that slot is resultSchema — a worse bug)', () => {
  const offenders: string[] = [];
  for (const rel of SITES) {
    for (const slice of callToolSlices(read(rel))) {
      // `}, { timeout` / `}, {timeout` => options landed in the resultSchema slot.
      if (/\}\s*,\s*\{\s*(timeout|resetTimeoutOnProgress|maxTotalTimeout|signal)/.test(slice)) offenders.push(rel);
    }
  }
  assert(offenders.length === 0,
    `RequestOptions passed as the 2nd arg (parsed as resultSchema!) in: ${[...new Set(offenders)].join(', ')}`);
});

test('GATE: the gateway hard cap and the loop ceiling read ONE shared constant (no drift)', () => {
  const gw = read('lib/mcp/server/tools/hub/service-call-handler.js');
  const loop = read('lib/agents/harness/agentic-tool-loop.ts');
  assert(gw.includes('RUNTIME_LIMITS.TOOL_CALL_TIMEOUT_MS'),
    'service-call-handler.js no longer reads the shared constant — a re-introduced literal WILL drift from the loop');
  assert(loop.includes('RUNTIME_LIMITS.TOOL_CALL_TIMEOUT_MS'),
    'agentic-tool-loop.ts no longer reads the shared constant');
  assert(!/timeout:\s*30000/.test(loop),
    'the decorative 30000 literal is back in the tool loop — it was never enforced and the one live datapoint falsifies it');
});

test('GATE: the shared constant exists and is sane', () => {
  const rl = read('lib/validation/runtime-limits.ts');
  assert(/TOOL_CALL_TIMEOUT_MS:\s*300_000/.test(rl), 'TOOL_CALL_TIMEOUT_MS missing or changed — update this gate deliberately');
});

// M2 (2026-07-17, panel decision): the bound HIERARCHY as enforced invariants, not prose.
// Four bounds exist: per-call gateway cap (300s) < default watchdog envelope (1080s) <
// RUNNING-reaper threshold (> max admissible envelope). A violated ordering ships a false
// terminal fact (reaper flipping a live run to FAILED) or an unreachable advertised cap.
test('GATE: bound ordering — INV-B: RUNNING reaper > max admissible watchdog envelope', () => {
  const rl = read('lib/validation/runtime-limits.ts');
  const num = (name: string) => {
    const m = rl.match(new RegExp(`${name}:\\s*([\\d_]+)`));
    assert(!!m, `${name} missing from runtime-limits.ts`);
    return Number(m![1].replace(/_/g, ''));
  };
  const maxEnvelope = num('EXECUTION_TIMEOUT_BASE_MS') + num('MAX_TOOL_TURNS') * num('EXECUTION_TIMEOUT_PER_TURN_MS');
  assert(num('EXECUTION_REAPER_RUNNING_MS') > maxEnvelope,
    `EXECUTION_REAPER_RUNNING_MS (${num('EXECUTION_REAPER_RUNNING_MS')}) must exceed the max watchdog envelope (${maxEnvelope}) — ` +
    'else the reaper flips legitimate long runs (Pipeline Harness = 100 turns) to FAILED mid-flight. ' +
    'If you raised MAX_TOOL_TURNS, raise the reaper threshold with it.');
});

test('GATE: bound ordering — INV-A (default case): gateway per-call cap fits the default watchdog envelope', () => {
  const rl = read('lib/validation/runtime-limits.ts');
  const num = (name: string) => {
    const m = rl.match(new RegExp(`${name}:\\s*([\\d_]+)`));
    assert(!!m, `${name} missing from runtime-limits.ts`);
    return Number(m![1].replace(/_/g, ''));
  };
  const defaultEnvelope = num('EXECUTION_TIMEOUT_BASE_MS') + num('DEFAULT_TOOL_TURNS') * num('EXECUTION_TIMEOUT_PER_TURN_MS');
  assert(num('TOOL_CALL_TIMEOUT_MS') <= defaultEnvelope,
    `TOOL_CALL_TIMEOUT_MS (${num('TOOL_CALL_TIMEOUT_MS')}) exceeds the default watchdog envelope (${defaultEnvelope}) — ` +
    'the advertised per-call cap would be envelope-dominated (unreachable) for default-turn executions. ' +
    'Known residual: a template with maxToolTurns <= 3 shrinks the envelope below the cap; no such template exists (documented, not guarded).');
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
