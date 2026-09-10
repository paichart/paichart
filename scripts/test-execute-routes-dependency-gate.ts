/** 2026-09-10: every execution ENTRY PATH gates on dependency settledness with the reactor's predicate —
 *  MCP (agent-execute-handler), the GUI/SSE stream route, and the REST task execute route. The two REST/SSE
 *  routes had no gate at all (a click could start a leg whose predecessors were not settled, the H-5 class). */
import * as fs from 'fs';
let failed = 0; const check = (n: string, ok: boolean) => { console.log(`${ok ? '✅' : '❌'} ${n}`); if (!ok) failed++; };
const stream = fs.readFileSync('app/api/pov/agent/execute/stream/route.ts', 'utf8');
const rest = fs.readFileSync('app/api/tasks/[taskId]/agent/execute/route.ts', 'utf8');
const mcp = fs.readFileSync('lib/mcp/tasks/action/handlers/agent/agent-execute-handler.ts', 'utf8');
for (const [name, src] of [['stream route', stream], ['REST task execute route', rest]] as const) {
  check(`${name}: calls listUnsatisfiedDeps (the reactor's predicate, ONE definition of satisfied)`, /listUnsatisfiedDeps\(task\.id, prisma\)/.test(src));
  check(`${name}: refuses with DEPENDENCY_NOT_SATISFIED before creating an execution`, src.indexOf("'DEPENDENCY_NOT_SATISFIED'") > 0 && src.indexOf("'DEPENDENCY_NOT_SATISFIED'") < src.indexOf('createAgentExecution({'));
}
check('stream route answers 409', /status: 409, headers: \{ 'Content-Type': 'application\/json' \}/.test(stream));
check('MCP path still gates on settledness (parity reference)', /completed but not yet settled/.test(mcp));
if (failed) { console.error(`\n${failed} failed`); process.exit(1); } console.log('\n✅ dependency gate present on every execution entry path');
