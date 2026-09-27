/**
 * Rig identifiers must not appear in AGENT-FACING shipped text (2026-09-23).
 *
 * WHY. Protocol bodies and ROLE_GUIDANCE_LIBRARY entries are injected into the prompts of agents
 * running on SOMEONE ELSE'S infrastructure. A lab device name, a rig workload, or — worst — the tool
 * name of OUR read-only rig service is meaningless there at best and misleading at worst: a customer's
 * Kubernetes MCP service exposes different tools, and a protocol that names ours teaches an agent to
 * call something that does not exist on their cluster. That is the unsatisfiable-predicate class.
 *
 * THE DISTINCTION THIS ENFORCES, which the corpus already drew and then broke in two places:
 *   ✅ PLATFORM vocabulary — `state list`, `show ip interface brief`, `promtool check config`,
 *      `otelcol validate`. Every customer running that platform has these.
 *   ❌ OUR SERVICE's tool names — `get_scrape_targets`, `list_resource_names`, `state_pull` as a TOOL.
 *      Name the OBSERVABLE or the read SHAPE instead: "the scrape-target listing", "a projected list
 *      read that returns identifiers without full object specs".
 *
 * Found 2026-09-23 by a question, not by a check: `get_scrape_targets` x2 in the observability
 * protocol, a rig workload name in the kubernetes protocol, and — in the same sitting — a rig
 * workload name I had just added to the ORCHESTRATOR BASE, which ships to every domain.
 *
 * SCOPE. Agent-facing bodies ONLY. Operator-facing HOWTO/GUIDE prompts are EXEMPT by design: a
 * worked example naming a real rig is exactly what an operator needs, and that audience split is
 * the same one `test-requirements-skeleton-parity.ts` enforces for the splice instruction.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

/** Identifiers that exist only in OUR lab. Extend when a rig gains a device/service/tool. */
const RIG_IDENTIFIERS = [
  // devices + workloads
  'orders-api', 'ceos1', 'ceos2', 'acme-app-logs', 'db_master', 'app_logs',
  // our registered rig service names
  'k8s-rig-readonly', 'ceos-lab-readonly', 'terraform-readonly', 'observability-readonly',
  'tf-readonly', 'k8s-mcp', 'obs-mcp', 'nornir-mcp',
  // our rig services' TOOL names (the subtle ones)
  'get_scrape_targets', 'get_rules', 'query_metric', 'get_otel_config', 'get_ingress_config', 'stack_health',
  'list_resource_names', 'list_resources', 'list_secret_names', 'get_resource',
  'state_list', 'state_pull', 'list_devices', 'fetch_data',
  // hosts / infra
  'paichart.app', 'localstack', 'k8s-rig-control-plane', 'promstack', 'devext', '192.168.86',
];

/** Agent-facing consts: protocol bodies. Operator HOWTO/GUIDE consts are exempt. */
const AGENT_FACING = /^const\s+(PIPELINE_[A-Z0-9_]*PROTOCOL|[A-Z0-9_]*ORCHESTRATOR_PROTOCOL)\s*=/;
const EXEMPT = /HOWTO|GUIDE|_PROMPT\b/;

type Hit = { file: string; owner: string; id: string; line: number; excerpt: string };

function scanSeed(): Hit[] {
  const file = 'scripts/seed-protocol-prompts.ts';
  const lines = readFileSync(join(ROOT, file), 'utf8').split('\n');
  const hits: Hit[] = [];
  let owner = '';
  lines.forEach((text, i) => {
    const m = text.match(/^const\s+([A-Z0-9_]+)\s*=/);
    if (m) owner = m[1];
    // ⚠️ CLOSE the template literal, or everything after the last protocol body — the PROTOCOLS
    // metadata array, with its version changelogs — is attributed to that body and reported as a
    // leak. Caught on this guard's FIRST run: 5 of 12 hits were changelog prose naming the rig a
    // run happened on, which is legitimate and not agent-facing.
    else if (/^`;/.test(text)) owner = '';
    if (!AGENT_FACING.test(`const ${owner} =`) || EXEMPT.test(owner)) return;
    // Skip comment lines — changelog prose legitimately names the rig a run happened on.
    if (/^\s*(\/\/|\*|\/\*)/.test(text)) return;
    for (const id of RIG_IDENTIFIERS) {
      const at = text.indexOf(id);
      if (at >= 0) hits.push({ file, owner, id, line: i + 1, excerpt: text.slice(Math.max(0, at - 70), at + 70) });
    }
  });
  return hits;
}

function scanRoleGuidance(): Hit[] {
  const file = 'lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts';
  const src = readFileSync(join(ROOT, file), 'utf8');
  const start = src.indexOf('ROLE_GUIDANCE_LIBRARY');
  if (start < 0) throw new Error('ROLE_GUIDANCE_LIBRARY not found — this guard is scanning nothing');
  const lines = src.slice(start).split('\n');
  const hits: Hit[] = [];
  const base = src.slice(0, start).split('\n').length;
  lines.forEach((text, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(text)) return;
    for (const id of RIG_IDENTIFIERS) {
      const at = text.indexOf(id);
      if (at >= 0) hits.push({ file, owner: 'ROLE_GUIDANCE_LIBRARY', id, line: base + i, excerpt: text.slice(Math.max(0, at - 70), at + 70) });
    }
  });
  return hits;
}

const hits = [...scanSeed(), ...scanRoleGuidance()];
if (hits.length === 0) {
  console.log(`✅ no rig identifiers in agent-facing text (${RIG_IDENTIFIERS.length} identifiers checked)`);
  process.exit(0);
}
console.log(`❌ ${hits.length} rig identifier(s) in AGENT-FACING shipped text:\n`);
for (const h of hits) {
  console.log(`  ${h.file}:${h.line}  [${h.owner}]  "${h.id}"`);
  console.log(`     …${h.excerpt.replace(/\s+/g, ' ')}…\n`);
}
console.log('Name the OBSERVABLE or the read SHAPE, not our rig. Operator HOWTOs are exempt.');
process.exit(1);
