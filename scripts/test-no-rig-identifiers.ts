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
 * the same one the retired `test-requirements-skeleton-parity.ts` enforced for the splice instruction.
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
  // added 2026-11-28 (obligation audit F4-1): the rest of each rig service's tool surface, read from the services' own
  // source (~/paichart/usecases/*-lab), plus a rig-only RESULT field. The list was hand-picked before and missed these.
  'get_prometheus_config', 'get_grafana_dashboard', 'get_grafana_datasources', 'list_grafana_dashboards', 'truncatedTo50',
  'compare_manifest', 'compare_declared_fields',
  'get_structured_data', 'list_network_devices', 'run_show_commands', 'send_commands', 'show_commands',
  // hosts / infra
  'paichart.app', 'localstack', 'k8s-rig-control-plane', 'promstack', 'devext', '192.168.86',
];

/**
 * Is this source line a JS COMMENT (skipped) rather than shipped text?
 * ⚠️ 2026-11-28 (obligation audit F4-1): the old test, `^\s*(\/\/|\*|\/\*)`, also matched every line that starts with
 * markdown `**bold**` — 87 such lines in protocol bodies went unscanned, which is how `query_metric` sat in the observability
 * protocol while this guard passed. A JSDoc continuation is `*` followed by a space, `/` or end of line; `**` never is.
 */
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*(?=\s|\/|$))/;

/** Agent-facing consts: protocol bodies. Operator HOWTO/GUIDE consts are exempt. */
const AGENT_FACING = /^const\s+(PIPELINE_[A-Z0-9_]*PROTOCOL|[A-Z0-9_]*ORCHESTRATOR_PROTOCOL)\s*=/;
const EXEMPT = /HOWTO|GUIDE|_PROMPT\b/;

type Hit = { file: string; owner: string; id: string; line: number; excerpt: string };

/** Names of consts interpolated (\${NAME} / \${NAME(…)}) into agent-facing consts, transitively. */
function interpolatedIntoAgentFacing(lines: string[]): Set<string> {
  const body = new Map<string, string[]>();
  let owner = '';
  for (const text of lines) {
    const m = text.match(/^(?:export\s+)?const\s+([A-Z0-9_]+)\s*(?::[^=]*)?=/);
    if (m) { owner = m[1]; body.set(owner, []); }
    else if (/^`;/.test(text)) owner = '';
    if (owner) body.get(owner)!.push(text);
  }
  const facing = new Set([...body.keys()].filter(n => AGENT_FACING.test(`const ${n} =`) && !EXEMPT.test(n)));
  const found = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of [...facing, ...found]) {
      for (const t of body.get(n) ?? []) {
        if (COMMENT_LINE.test(t)) continue;
        for (const mm of t.matchAll(/\$\{([A-Z0-9_]{4,})\b/g)) {
          if (!facing.has(mm[1]) && !found.has(mm[1]) && body.has(mm[1])) { found.add(mm[1]); grew = true; }
        }
      }
    }
  }
  return found;
}

function scanSeed(): Hit[] {
  const file = 'scripts/seed-protocol-prompts.ts';
  const lines = readFileSync(join(ROOT, file), 'utf8').split('\n');
  const hits: Hit[] = [];
  // A const INTERPOLATED into an agent-facing body is agent-facing too (2026-10-02, value-chain B1.4): shared
  // passages moved out of protocol bodies into section consts (NETWORK_*), whose names AGENT_FACING does not match.
  // Without this their text — still delivered to agents — would silently leave the scan. Computed to a fixed point.
  const interpolated = interpolatedIntoAgentFacing(lines);
  let owner = '';
  lines.forEach((text, i) => {
    const m = text.match(/^(?:export\s+)?const\s+([A-Z0-9_]+)\s*(?::[^=]*)?=/); // `export const` + typed consts are boundaries too (2026-10-02)
    if (m) owner = m[1];
    // ⚠️ CLOSE the template literal, or everything after the last protocol body — the PROTOCOLS
    // metadata array, with its version changelogs — is attributed to that body and reported as a
    // leak. Caught on this guard's FIRST run: 5 of 12 hits were changelog prose naming the rig a
    // run happened on, which is legitimate and not agent-facing.
    else if (/^`;/.test(text)) owner = '';
    if (!(AGENT_FACING.test(`const ${owner} =`) || interpolated.has(owner)) || EXEMPT.test(owner)) return;
    // Skip comment lines — changelog prose legitimately names the rig a run happened on.
    if (COMMENT_LINE.test(text)) return;
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
    if (COMMENT_LINE.test(text)) return;
    for (const id of RIG_IDENTIFIERS) {
      const at = text.indexOf(id);
      if (at >= 0) hits.push({ file, owner: 'ROLE_GUIDANCE_LIBRARY', id, line: base + i, excerpt: text.slice(Math.max(0, at - 70), at + 70) });
    }
  });
  return hits;
}

/**
 * The package FORM-CORRECTION prompt (prompt-construction review L3, 2026-10-07): agent-facing text that reaches every
 * domain's config_change_author, built in code rather than seeded. Every non-comment line of the module is scanned, so
 * a future item template or bullet cannot name a rig. (The interpolated parts — headings, hunk headers, markers — are
 * the Author's own package text and are not platform text.)
 */
function scanFormCorrection(): Hit[] {
  const file = 'lib/agents/harness/form-correction.ts';
  const src = readFileSync(join(ROOT, file), 'utf8');
  if (!src.includes('export function buildFormCorrectionPrompt')) throw new Error('buildFormCorrectionPrompt not found — this guard is scanning nothing');
  const hits: Hit[] = [];
  src.split('\n').forEach((text, i) => {
    if (COMMENT_LINE.test(text)) return;
    for (const id of RIG_IDENTIFIERS) {
      const at = text.indexOf(id);
      if (at >= 0) hits.push({ file, owner: 'form-correction prompt', id, line: i + 1, excerpt: text.slice(Math.max(0, at - 70), at + 70) });
    }
  });
  return hits;
}

/**
 * ROLE GUIDANCE NAMES NO SERVICE (owner, 2026-10-24: "we should not mention a service to be used and remain service
 * agnostic … keep role guidance service/vendor/device etc agnostic"). Role guidance ships to every domain and every
 * install; which service reads a URL or a file is the protocol's or the task's to say, and the platform's own lab
 * services (the browser, our Git service) may be superseded or absent on a customer's install. Platform TOOLS
 * (`registry`, `services`, `project`, `perform`) are not services and stay nameable.
 * Named exemptions shrink, never grow: each is a text not yet rewritten, with the batch that owes it.
 */
const ROLE_GUIDANCE_SERVICE_NAMES = ['browser-automation-service', 'Browser Automation Service', 'browser service', 'scrape_page', 'github-service'];
const ROLE_GUIDANCE_SERVICE_EXEMPT: Record<string, string> = {
  buildProgramArchitectGuidance: 'Program Architect URL fetch — names the platform Git file source (github-service) and the browser service; owed by its own text batch (live-control gated; register ROLE-GUIDANCE-AGNOSTIC)',
};
function scanRoleGuidanceServiceNames(): { hits: Hit[]; exempted: string[] } {
  const file = 'lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts';
  const src = readFileSync(join(ROOT, file), 'utf8');
  const start = src.indexOf('ROLE_GUIDANCE_LIBRARY');
  if (start < 0) throw new Error('ROLE_GUIDANCE_LIBRARY not found — this guard is scanning nothing');
  const hits: Hit[] = [];
  const exempted = new Set<string>();
  let owner = '';
  const startLine = src.slice(0, start).split('\n').length - 1;
  src.split('\n').forEach((text, i) => {
    const fn = text.match(/^(?:export\s+)?function\s+([A-Za-z0-9_]+)/) || text.match(/^(?:export\s+)?const\s+([A-Za-z0-9_]+)/);
    if (fn) owner = fn[1];
    const role = text.match(/^\s{2}'([a-z_]+)':/);
    if (role) owner = role[1];
    if (i < startLine) return; // the library and the builders after it; nothing above it ships to agents as role guidance
    if (COMMENT_LINE.test(text)) return;
    for (const id of ROLE_GUIDANCE_SERVICE_NAMES) {
      const at = text.indexOf(id);
      if (at < 0) continue;
      if (ROLE_GUIDANCE_SERVICE_EXEMPT[owner]) { exempted.add(owner); continue; }
      hits.push({ file, owner, id, line: i + 1, excerpt: text.slice(Math.max(0, at - 70), at + 70) });
    }
  });
  return { hits, exempted: [...exempted] };
}
const svc = scanRoleGuidanceServiceNames();
for (const e of Object.keys(ROLE_GUIDANCE_SERVICE_EXEMPT)) {
  if (!svc.exempted.includes(e)) {
    console.log(`❌ role-guidance service exemption "${e}" no longer needed — remove it (exemptions shrink, never linger)`);
    process.exit(1);
  }
  console.log(`⚪ role guidance names a service in ${e} — EXEMPT: ${ROLE_GUIDANCE_SERVICE_EXEMPT[e]}`);
}
if (svc.hits.length) {
  console.log(`❌ ${svc.hits.length} service name(s) in ROLE GUIDANCE (role guidance stays service-agnostic):\n`);
  for (const h of svc.hits) console.log(`  ${h.file}:${h.line}  [${h.owner}]  "${h.id}"\n     …${h.excerpt.replace(/\s+/g, ' ')}…\n`);
  process.exit(1);
}
console.log(`✅ role guidance names no service (${ROLE_GUIDANCE_SERVICE_NAMES.length} names checked)`);
// L-N1 crib (2026-10-24): the Harvester's descriptor-URL route is the PLATFORM tool, stated in the role (a protocol that names
// no route — requirements-authoring — must not be left to guess, and must not be told its protocol "states" one).
{
  const ug = readFileSync(join(ROOT, 'lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts'), 'utf8');
  if (!ug.includes("Register a descriptor URL through the platform's \\`registry\\` tool with \\`descriptorUrl\\` alone — the platform takes the name and every other field from the descriptor — unless your protocol names another route.")
      || ug.includes('which states how a descriptor URL is handled')) {
    console.log('❌ infra_state_harvester descriptor-URL route sentence missing, or the false "protocol states how" claim returned');
    process.exit(1);
  }
  // held-network step 2 (owner 2026-10-24): the Program Architect carries each network change leg's Device sources into the
  // contract; without it every network program leg stops at Phase 0 once network-provisioning 1.23.0 is live.
  // VALUE-LEG-GIT (2026-11-06): the sentence now carries both network lanes — the change leg's key + its stop, and the value leg's own key.
  if (!ug.includes('a change leg\'s as \\`deviceSources["network-provisioning"]\\` (a change leg without them stops), and a value leg\'s as \\`deviceSources["network-derivation"]\\` ONLY when the requirements give that value leg lines of its own. Otherwise emit no \\`network-derivation\\` key at all')) {
    console.log('❌ program_architect deviceSources carry sentence missing');
    process.exit(1);
  }
  // Config sources STEP 2 Architect batch (2026-11-16; ARCHITECT-CONTRACT-KEY-BY-LEG option (a) + ARCHITECT-COMPOSED-DESCRIPTOR +
  // the configSources key): maps keyed by PROTOCOL token, never by leg; no descriptor assembled from source lines; Kubernetes lines
  // under configSources["kubernetes-gitops"], never deviceSources; a shared token's block carries every leg's lines, read by every leg.
  for (const want of [
    'serviceDescriptors["<protocol token>"]\\`, keyed by the leg\'s PROTOCOL token',
    'never by a leg name or a label of your own: each leg looks up its entry only at its token, and two legs of one token share ONE key',
    'gets NO \\`serviceDescriptors\\` entry from you: the platform writes that leg\'s descriptor from the service its block\'s read lines name',
    'Never write an object made of a service name, an owner, a repository or file paths: a Git file is not a service descriptor.',
    'For a URL on \\`raw.githubusercontent.com\\`, read the file with the Git file service',
    'no other route reads that file: escalate via \\`task.comment\\` and stop.',
    'A value leg the requirements give no lines of its own is a leg with no sources block.',
    'plus, for a leg with no sources block, its service-descriptor URL',
    'The contract reaches every leg verbatim; a description is rewritten. Never compose one.',
    'Where the inputs give two legs of one token different descriptors, emit neither: raise it under Assumptions & open questions.',
    'under the other field at that leg\'s own token: \\`configSources["kubernetes-gitops"]\\`, \\`configSources["terraform-iac"]\\` (such a leg without them stops) — never under \\`deviceSources\\`', // terraform-iac joined at 1.17.0 (STEP 4)
    'Where two legs carry the same token in your DAG, its one block carries every line the requirements give either leg, once each; every leg receives all of them',
    // Config sources STEP 3 (observability-config 1.12.0 CANDIDATE; owner decision 11 — the UNCONDITIONAL rule; SYNTHESIS-v2 §13.1): the exception names the
    // protocol TOKEN, never a property, and sits directly after the Git-files sentence; the key sentence is the VALUE-LEG-GIT form that held (LL-CS-74).
    'and a leg whose lines are all Git files needs none. The one exception is an \\`observability-config\\` leg: with or without a block of its own, always put the descriptor the inputs give for it in \\`serviceDescriptors["observability-config"]\\`, exactly as they give it.',
    'The platform replaces or removes that entry where the leg\'s block names a service on its own lines; that is the platform\'s to decide, never yours. Where the inputs give that leg no descriptor, emit no entry and say so under Assumptions & open questions.',
    'An observability leg\'s \\`## Config sources\\` lines go the same way under \\`configSources["observability-config"]\\`, ONLY when the requirements give that leg lines of its own. Otherwise emit no \\`configSources["observability-config"]\\` key at all — never a note, a reason or an empty value in its place: that leg runs without a sources block, which is valid for it, and it keeps its descriptor entry.',
  ]) {
    if (!ug.includes(want)) { console.log('❌ program_architect Config-sources batch sentence missing: ' + want); process.exit(1); }
  }
  if (ug.includes('never assemble one from a source line')) { console.log('❌ program_architect: the process-worded descriptor rule is back (LL-CS-74: name the forbidden output)'); process.exit(1); }
  if (ug.includes('serviceDescriptors["<leg token>"]')) { console.log('❌ program_architect: the leg-token descriptor key is back'); process.exit(1); }
}

/**
 * COUNTED EXCEPTION — shrinks, never grows (2026-11-28, obligation audit F4-1; owner sitting 1 decision 4). Fixing the
 * comment-skip above surfaced observability-config 1.12.0 naming our rig service's tools. The text fix rides the final
 * text release (CLOSE-OUT-PLAN Track C, Protocol 16). Until then these exact (protocol, identifier, count) hits pass; ANY
 * other hit fails, and a listed hit that disappears fails too, so the exception is deleted with the text that owed it.
 * Record: cline_docs/reviews/protocol-obligation-audit-2026-11-28/AUDIT.md (F4-1).
 */
const KNOWN_RIG_HITS: Record<string, number> = {
  'PIPELINE_OBSERVABILITY_CONFIG_PROTOCOL|get_prometheus_config': 2,
  'PIPELINE_OBSERVABILITY_CONFIG_PROTOCOL|get_grafana_dashboard': 1,
  'PIPELINE_OBSERVABILITY_CONFIG_PROTOCOL|get_grafana_datasources': 1,
  'PIPELINE_OBSERVABILITY_CONFIG_PROTOCOL|query_metric': 1,
  'PIPELINE_OBSERVABILITY_CONFIG_PROTOCOL|truncatedTo50': 1,
};
const allHits = [...scanSeed(), ...scanRoleGuidance(), ...scanFormCorrection()];
const seen: Record<string, number> = {};
for (const h of allHits) { const k = `${h.owner}|${h.id}`; seen[k] = (seen[k] ?? 0) + 1; }
for (const [k, n] of Object.entries(KNOWN_RIG_HITS)) {
  if ((seen[k] ?? 0) !== n) {
    console.log(`❌ counted rig exception "${k}" expects ${n} hit(s), found ${seen[k] ?? 0} — the text moved: update or DELETE the exception (it shrinks, never grows)`);
    process.exit(1);
  }
  console.log(`⚪ ${k.replace('|', ': ')} ×${n} — EXEMPT until the final text release (audit F4-1)`);
}
const hits = allHits.filter(h => !(`${h.owner}|${h.id}` in KNOWN_RIG_HITS));
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
