#!/usr/bin/env ts-node
/**
 * MCP TRANSPORT PARITY GATE (2026-05-31) — A1 interim defense.
 *
 * pAIchart serves MCP over TWO paths that must agree but are maintained separately:
 *   • stdio  — the SDK `Server` in mcp-server-v5.js (SDK shapes the response)
 *   • HTTP   — the hand-rolled `MCPCoreManager.processRequest` switch in mcp-core.ts
 * Because the HTTP path hand-builds every response, spec fields the SDK carries for free
 * must be mirrored by hand — and silently drift if forgotten. The 2026-05-31 tool-loading
 * work was Exhibit A: `instructions` + `_meta` (alwaysLoad) were both silently dropped on
 * HTTP, and serverInfo had drifted. The durable fix (migrate HTTP onto
 * Server.connect(StreamableHTTPServerTransport)) is gated on the stateless transition
 * (Protocol 9 Tracked Item #2 / SEP-2567). THIS test is the interim guard: it fails when the
 * two paths drift on the fields that matter, so the next edit can't reintroduce the bug.
 *
 * CI-SAFE BY CONSTRUCTION: static source pins only. NO DB, server, or network
 * (per the DATABASE_URL-transitive rule). Pins stable patterns, not volatile copy.
 *
 * Guards: serverInfo parity (HTTP↔stdio) · instructions single-source + present on HTTP ·
 * getServerInstructions on the shape interface (I1) · _meta/alwaysLoad passthrough at all
 * tool-build sites (C1).
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub'; // nothing here touches the DB

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const fails: string[] = [];
let passed = 0;
const check = (label: string, cond: boolean) => { cond ? passed++ : fails.push(label); };
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const mcpCore = fs.readFileSync(path.join(ROOT, 'lib/mcp/server/mcp-core.ts'), 'utf8');       // HTTP path
const v5 = fs.readFileSync(path.join(ROOT, 'mcp-server-v5.js'), 'utf8');                        // stdio SDK path
const toolSchemas = fs.readFileSync(path.join(ROOT, 'lib/mcp/server/config/tool-schemas.js'), 'utf8');

// ── A. serverInfo parity — both paths advertise the SAME identity ──
// (Two independent literals in two files; pin both to the canonical value so a change to
//  either fails here, forcing the editor to keep them in sync. This is the split-brain
//  that drifted to paichart-mcp-sdk/1.0.0 vs paichart/5.0.0 before the fix.)
check('HTTP initialize serverInfo = paichart/5.0.0', mcpCore.includes("serverInfo: { name: 'paichart', version: '5.0.0' }"));
check('stdio SDK Server serverInfo name = paichart', v5.includes("name: 'paichart'"));
check('stdio SDK Server has instructions wired', v5.includes('instructions: this.getServerInstructions()'));

// ── B. instructions — single-source + actually emitted on HTTP ──
check('HTTP initialize sources instructions from getServerInstructions()', mcpCore.includes('mcpServer?.getServerInstructions?.()'));
check('HTTP initialize result carries the instructions field', mcpCore.includes('instructions: serverInstructions'));
check('PureSDKNativeServerShape declares getServerInstructions(): string [I1 build-guard]', mcpCore.includes('getServerInstructions(): string'));

// ── C. _meta / anthropic-alwaysLoad passthrough reaches clients on BOTH transports [C1] ──
// HTTP: getToolCapabilities (CONSOLIDATED + TOOL_SCHEMAS loops) + getToolsForUser re-map.
// stdio: ListToolsRequestSchema handler. Source markers live in tool-schemas.js.
check('tool-schemas: >=2 entry-point tools carry anthropic/alwaysLoad', count(toolSchemas, '"anthropic/alwaysLoad": true') >= 2);
check('v5: schema._meta passthrough present >=3x (getToolCapabilities x2 + stdio ListTools)', count(v5, 'schema._meta ? { _meta: schema._meta }') >= 3);
check('v5: getToolsForUser carries capability._meta through the re-map', count(v5, 'capability._meta ? { _meta: capability._meta }') >= 1);

// ── Report ──
console.log('='.repeat(60));
console.log('MCP Transport Parity Gate');
console.log('='.repeat(60));
if (fails.length) {
  console.error(`❌ ${fails.length} parity check(s) FAILED:`);
  for (const f of fails) console.error(`   - ${f}`);
  console.error('\nstdio↔HTTP drift detected, OR the alwaysLoad/_meta passthrough or instructions');
  console.error('wiring regressed. See scripts/test-mcp-transport-parity.ts header + A1 in');
  console.error('.claude/knowledge/protocols/mcp-sdk-upgrade-protocol.md (Tracked Item #2).');
  process.exit(1);
}
console.log(`✅ Passed: ${passed} — stdio↔HTTP parity intact (serverInfo, instructions, _meta passthrough).`);
