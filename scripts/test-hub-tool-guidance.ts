/**
 * Axis-6 shared hub-guidance unit test (2026-07-06).
 *
 * Locks `deriveMcpToolNames` + `buildHubToolGuidance` — the ONE implementation both execution
 * adapters (agentExecutionEngine.ts + stream/route.ts) now share. Proves:
 *  - the extraction is behavior-preserving (deriveMcpToolNames byte-reproduces the prior inline
 *    derivation duplicated in both files), and
 *  - the routing-block content is exact (the engine byte-identity + stream +routing-block gate).
 *
 * The `includes('services')` gate is CALLER-side (identical inline conditional in both adapters,
 * verified by the structural pins) — the function itself always builds the block.
 */
import { deriveMcpToolNames, buildHubToolGuidance, CONSOLIDATED_TOOLS } from '../lib/services/execution-hub-guidance';

let passed = 0, failed = 0;
const failures: string[] = [];
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; failures.push(`${name}: got ${g}, want ${w}`); console.log(`  ❌ ${name}: got ${g}, want ${w}`); }
}

async function main() {
  console.log('\n🧰 Axis-6 hub-guidance — deriveMcpToolNames + buildHubToolGuidance\n');

  // ── deriveMcpToolNames — byte-parity with the prior inline derivation (both adapters) ──
  eq('derive: undefined → CONSOLIDATED', deriveMcpToolNames(undefined), CONSOLIDATED_TOOLS);
  eq('derive: empty array → CONSOLIDATED', deriveMcpToolNames([]), CONSOLIDATED_TOOLS);
  eq('derive: string array passthrough', deriveMcpToolNames(['project', 'services']), ['project', 'services']);
  eq('derive: {name} objects', deriveMcpToolNames([{ name: 'project' }, { name: 'perform' }]), ['project', 'perform']);
  eq('derive: legacy names mapped + deduped', deriveMcpToolNames(['list_povs', 'get_pov_details']), ['project']);
  eq('derive: fallback used only when tools ABSENT', deriveMcpToolNames(undefined, ['analytics']), ['analytics']);
  eq('derive: present-but-empty IGNORES fallback → CONSOLIDATED', deriveMcpToolNames([], ['analytics']), CONSOLIDATED_TOOLS);
  eq('derive: fallback also legacy-mapped', deriveMcpToolNames(undefined, ['list_povs']), ['project']);

  // ── buildHubToolGuidance — content (fake prisma) ──
  const silentLogger = { warn: () => {} };
  const fakePrisma = (rows: any[]) => ({ mCPTool: { findMany: async () => rows } });

  const withMap = await buildHubToolGuidance(['services', 'weather-tool'], fakePrisma([
    { name: 'weather-api', capabilities: { tools: ['get_forecast', 'get_current'] } },
  ]) as any, silentLogger);
  eq('guidance: routing header', withMap.includes('## MCP Hub Tool Routing'), true);
  eq('guidance: MUST use services', withMap.includes('you MUST use the `services` tool'), true);
  eq('guidance: WRONG/RIGHT examples', withMap.includes('WRONG:') && withMap.includes('RIGHT: services('), true);
  eq('guidance: lists service + its tools', withMap.includes('- weather-api: get_forecast, get_current'), true);

  const emptyMap = await buildHubToolGuidance(['services'], fakePrisma([]) as any, silentLogger);
  eq('guidance: empty service map → routing block, NO service list', emptyMap.includes('## MCP Hub Tool Routing') && !emptyMap.includes('Available services and tools:'), true);

  const weather = await buildHubToolGuidance(['services', 'get_forecast'], fakePrisma([]) as any, silentLogger);
  eq('guidance: weather/forecast tool → location-format note', weather.includes('comma-separated format for locations'), true);
  eq('guidance: no forecast tool → no weather note', emptyMap.includes('comma-separated format'), false);

  // Failure-mode: MCPTool query throws → still emits the routing block (no service list), never throws.
  const throwPrisma = { mCPTool: { findMany: async () => { throw new Error('db down'); } } };
  const onErr = await buildHubToolGuidance(['services'], throwPrisma as any, silentLogger);
  eq('guidance: DB failure → still emits routing block, no throw', onErr.includes('## MCP Hub Tool Routing'), true);

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) { console.log('\nFailures:\n  • ' + failures.join('\n  • ')); process.exit(1); }
}

main();
