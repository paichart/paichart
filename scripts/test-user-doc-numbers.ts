/**
 * test:user-doc-numbers — every number and fixed word the user documents state about the Kubernetes drift check is pinned to the
 * code constant it describes (Protocol 11 Part C: a documented number must match the tree). Added 2026-11-17 with
 * docs/KUBERNETES-SERVICE.md (item 3 of the kubernetes-gitops 1.19.0 ship).
 *
 * Reads constants from the shipping modules, the reference compare service's Python source (as text — no Python needed), and the
 * reason words from git-live-drift.ts's REASON_WORDS (as text: it is not exported). A doc edit that changes a number, or a code
 * change that moves one, fails here until both agree.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  COMPARE_TOOL_METHOD, DRIFT_PATHS_SHOWN_CAP, DRIFT_OBJECTS_CAP, DRIFT_FILES_CAP,
} from '../lib/agents/harness/git-live-drift';
import { PLATFORM_DRIFT_MAX_CALLS_PER_LEG, PLATFORM_DRIFT_LEG_BUDGET_MS } from '../lib/agents/harness/platform-drift-run';
const hub = require('../lib/mcp/server/config/platform-drift-call');

const ROOT = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const DOC = read('docs/KUBERNETES-SERVICE.md');
// The reference service source: the private lab copy in this repo, or the public copy (`usecases/kubernetes-lab/`, maintained in the
// public repo directly). Neither exists in the export projection: there the service-side halves of the checks are SKIPPED by name;
// the doc-vs-platform halves still run, and the private battery (the gate) checks both halves. (Export dry-run 2026-11-17.)
const PY_PATHS = ['.claude/knowledge/pipelines/kubernetes-gitops/phase4-kind-rig/k8s-mcp-readonly/declared_compare.py',
  'usecases/kubernetes-lab/k8s-mcp-readonly/declared_compare.py'];
const PY_PATH = PY_PATHS.find((p) => fs.existsSync(path.join(ROOT, p))) ?? null;
const PY: string | null = PY_PATH ? read(PY_PATH) : null;
if (!PY) console.log('  ⏭  SKIP the reference-service halves (declared_compare.py is not in this tree — expected in the public export)');
const pyHas = (needle: string): boolean => PY === null || PY.includes(needle);
const pyEq = (name: string, value: number): boolean => PY === null || pyConst(name) === value;
const DRIFT_SRC = read('lib/agents/harness/git-live-drift.ts');

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, detail = '') => {
  if (ok) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const pyConst = (name: string): number => {
  const m = (PY ?? '').match(new RegExp(`^${name} = ([0-9_]+)`, 'm'));
  return m ? Number(m[1].replace(/_/g, '')) : NaN;
};
const fmt = (n: number) => n.toLocaleString('en-US');
const row = (label: string) => DOC.split('\n').find((l) => l.startsWith(`| ${label} |`)) ?? '';

console.log('test:user-doc-numbers — docs/KUBERNETES-SERVICE.md vs the code');

// ── the compare tool's identity
t('tool name = PLATFORM_DRIFT_TOOL', DOC.includes(`\`${hub.PLATFORM_DRIFT_TOOL}\``), String(hub.PLATFORM_DRIFT_TOOL));
t('method string = COMPARE_TOOL_METHOD (and the reference service METHOD)',
  DOC.includes(`"method": "${COMPARE_TOOL_METHOD}"`) && pyHas(`METHOD = "${COMPARE_TOOL_METHOD}"`), COMPARE_TOOL_METHOD);

// ── the limits table
const kb = hub.PLATFORM_DRIFT_MANIFEST_MAX_BYTES / 1024;
t('manifest size = PLATFORM_DRIFT_MANIFEST_MAX_BYTES = service MAX_MANIFEST_BYTES',
  row('manifest size per call').includes(`${kb} KB (${fmt(hub.PLATFORM_DRIFT_MANIFEST_MAX_BYTES)} bytes)`)
  && pyEq('MAX_MANIFEST_BYTES', hub.PLATFORM_DRIFT_MANIFEST_MAX_BYTES), row('manifest size per call'));
t('manifest size in the reasons table = the same limit', DOC.includes(`over ${kb} KB`));
t('objects per file = DRIFT_OBJECTS_CAP = service MAX_DOCUMENTS',
  row('objects per file').includes(`| ${DRIFT_OBJECTS_CAP} |`) && pyEq('MAX_DOCUMENTS', DRIFT_OBJECTS_CAP), row('objects per file'));
t('paths the service returns per object = service MAX_DIFFERING_PATHS',
  PY === null || row('differing paths the service returns per object').includes(`| ${pyConst('MAX_DIFFERING_PATHS')} (`), row('differing paths the service returns per object'));
t('paths kept per file = DRIFT_PATHS_SHOWN_CAP',
  row('differing paths pAIchart keeps per file').includes(`| ${DRIFT_PATHS_SHOWN_CAP} (`), row('differing paths pAIchart keeps per file'));
t('calls per leg = PLATFORM_DRIFT_MAX_CALLS_PER_LEG; files recorded = DRIFT_FILES_CAP',
  row('files compared per leg').includes(`${PLATFORM_DRIFT_MAX_CALLS_PER_LEG} calls; ${DRIFT_FILES_CAP} files recorded`), row('files compared per leg'));
t('the call limit in the reasons table = PLATFORM_DRIFT_MAX_CALLS_PER_LEG', DOC.includes(`more than ${PLATFORM_DRIFT_MAX_CALLS_PER_LEG} files in one leg`));
t('time per leg = PLATFORM_DRIFT_LEG_BUDGET_MS',
  row('time per leg for all comparisons').includes(`| ${PLATFORM_DRIFT_LEG_BUDGET_MS / 1000} seconds |`), row('time per leg for all comparisons'));

// ── every "not checked" reason the platform can show is explained, in the platform's own words
// The KUBERNETES method's table only (`REASON_WORDS`): since Config sources STEP 3 P3 the module also holds the file method's
// words (observability, unreachable before 1.12.0 — its user page is the S7 row's), which are not this page's.
const K8S_WORDS_SRC = DRIFT_SRC.slice(DRIFT_SRC.indexOf('const REASON_WORDS: Record<string, string> = {'), DRIFT_SRC.indexOf('\n};', DRIFT_SRC.indexOf('const REASON_WORDS: Record<string, string> = {')));
const words = [...K8S_WORDS_SRC.matchAll(/^\s+'[a-z-]+': '((?:[^'\\]|\\.)+)',$/gm)].map((m) => m[1].replace(/\\'/g, "'"));
t('REASON_WORDS read from the source', words.length >= 15, String(words.length));
for (const w of words) t(`reason explained: "${w}"`, DOC.includes(`| ${w} |`));

// ── the three compared summaries
for (const s of ['compared — no differences', 'compared — differences', 'compared — with gaps']) t(`state named: ${s}`, DOC.includes(s));

// ── docs/TERRAFORM-SERVICE.md vs the code (terraform-iac 1.17.0, 2026-11-19): the stop sentence is the platform's own constant, every
// forced witness reason and every Config sources kind is named, and the never-held examples are refused by the one predicate.
{
  const TF = read('docs/TERRAFORM-SERVICE.md');
  const PIPE = read('docs/PIPELINES.md');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { planWitnessStopSentenceFor } = require('../lib/agents/harness/plan-witness-stop-sentence');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { heldPathRefusal } = require('../lib/mcp/server/config/git-file-source-pin.js');
  t('Terraform page: the stop sentence is the platform constant, byte for byte', TF.includes(`> ${planWitnessStopSentenceFor('terraform-iac', '1.17.0')}`));
  const CARRIER = read('lib/agents/harness/plan-witness.ts');
  for (const r of ['stop-sentence-altered', 'stop-sentence-absent', 'witness-incomplete', 'witness-whole-value']) {
    t(`forced reason named on the Terraform page and in PIPELINES: ${r}`, TF.includes(`\`${r}\``) && PIPE.includes(`\`${r}\``) && CARRIER.includes(`'${r}'`));
  }
  for (const k of ['git-file', 'live-read', 'supplied']) t(`Config sources kind explained: ${k}`, TF.includes(`| \`${k}\` |`));
  for (const p of ['terraform.tfstate', 'prod.tfvars', 'tfplan', '.terraform/x.tf', '.terraformrc', '.terraform.d/credentials.tfrc.json']) {
    t(`never-read example is refused by the platform: ${p}`, heldPathRefusal(`a/${p}`) !== null);
  }
  t('Terraform page names the two state tools the descriptor offers', TF.includes('`state_list`') && TF.includes('`state_pull`'));
  t('Terraform page: git-file-not-held is the unheld-file reason', TF.includes('`git-file-not-held`'));
}

console.log(`\n${fail ? '❌' : '✅'} user-doc-numbers: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
