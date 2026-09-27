#!/usr/bin/env ts-node
/**
 * TEST — authoritative-execution selection coverage (BC75 anti-drift, retry-band keep-best 2026-07-04).
 *
 * Fails the build on any NEW hand-rolled "the authoritative SUCCESS execution for a task"
 * query that neither routes through selectAuthoritativeExecution (lib/services/execution-selection.ts)
 * NOR carries an explicit `// selection-exempt: <reason>` marker. Before this feature there were
 * FOUR implementations across 8 sites with three ordering keys — exactly the drift class this locks.
 *
 * Fingerprint: an `agentExecution.find{First,Many}` whose `where` names BOTH `taskId` and
 * `status: 'SUCCESS'` (the authoritative-selection shape). Pruner keep-sets (status IN [SUCCESS,FAILED]
 * or FAILED — never a bare `status: 'SUCCESS'` where) and the reactor identity-read are NOT this shape
 * and are not flagged.
 *
 * RWF Wave B (2026-09-26) adds two ARTIFACT fingerprints, both judged PER CALL with NO file-level escape.
 * The file-level escape below (`usesSelector`) would let a re-inlined read hide in any file that also
 * imports the helper, and after Wave B every net file does:
 *   A  raw SQL: a query over `agent_artifacts` keyed on the CONTENT's `->>'taskId'`. An artifact belongs to an
 *      execution; keying it by a denormalized copy of the task id is how the nets came to read "the newest
 *      result.json" instead of the execution the chainer chained.
 *   B  Prisma: an `agentArtifact.find{First,Many}` naming `taskId` with neither an `executionId` key nor
 *      `supersededById: null` in its window.
 * Either is flagged unless a `// selection-exempt: <reason>` marker sits within ~400 chars. `.js` files are
 * scanned too (lib/mcp/server/tools/advanced/agent-results-handler.js was invisible before). A positive
 * control runs the detectors over the pre-Wave-B query text, because after the fix there are 0 real hits
 * and a detector that is never shown to match proves nothing.
 *
 * CI-safe: static source scan, no imports of app code, no DB.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const rel = (p: string) => path.relative(ROOT, p);

let passed = 0, failed = 0;
const ok = (c: boolean, m: string) => { if (c) { passed++; console.log(`  ✅ ${m}`); } else { failed++; console.log(`  ❌ ${m}`); } };

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); }
    else if ((e.name.endsWith('.ts') || e.name.endsWith('.js')) && !e.name.endsWith('.test.ts') && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

// The selection module itself IS the implementation — exempt by definition.
const SELF = 'lib/services/execution-selection.ts';

console.log('\n🧪 TEST — authoritative-execution selection coverage (BC75 drift-lock)\n');

const failures: string[] = [];

/** Fingerprint A — a raw query over agent_artifacts keyed on the content's taskId. Returns match offsets. */
function artifactTaskIdSql(src: string): number[] {
  const hits: number[] = [];
  const re = /->>?\s*'taskId'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const around = src.slice(Math.max(0, m.index - 400), m.index + 200);
    if (/agent_artifacts/.test(around)) hits.push(m.index);
  }
  return hits;
}
/** Fingerprint B — an agentArtifact.find* naming taskId with no executionId and no supersededById: null. */
function artifactTaskIdPrisma(src: string): number[] {
  const hits: number[] = [];
  const re = /agentArtifact\s*\.\s*find(?:First|Many)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const w = src.slice(m.index, m.index + 600);
    if (/taskId/.test(w) && !/executionId\s*:/.test(w) && !/supersededById\s*:\s*null/.test(w)) hits.push(m.index);
  }
  return hits;
}
const exemptNear = (src: string, at: number) => /selection-exempt\s*:/.test(src.slice(Math.max(0, at - 400), at + 200));
let artifactFingerprints = 0;
const dirs = ['lib', 'app'].map(d => path.join(ROOT, d));
let scanned = 0, fingerprints = 0;

for (const dir of dirs) {
  for (const file of walk(dir)) {
    const r = rel(file);
    if (r === SELF) continue;
    const src = fs.readFileSync(file, 'utf8');
    scanned++;

    // RWF Wave B: artifact reads keyed on a task id, judged per call — NO usesSelector escape.
    for (const at of [...artifactTaskIdSql(src), ...artifactTaskIdPrisma(src)]) {
      artifactFingerprints++;
      if (!exemptNear(src, at)) {
        const line = src.slice(0, at).split('\n').length;
        failures.push(`${r}:${line} — result artifact read keyed on a TASK id (content ->>'taskId' or agentArtifact.find* by taskId) instead of the authoritative execution; use readAuthoritativeResultField or mark "// selection-exempt: <reason>"`);
      }
    }

    // Find each agentExecution.findFirst/findMany call window and inspect its where-block text.
    const callRe = /agentExecution\s*\.\s*find(?:First|Many)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = callRe.exec(src)) !== null) {
      // Window = from the call to a bounded lookahead (covers the options object).
      const window = src.slice(m.index, m.index + 600);
      const looksAuthoritative = /taskId/.test(window) && /status\s*:\s*['"]SUCCESS['"]/.test(window);
      if (!looksAuthoritative) continue;
      fingerprints++;
      // Comment-context check: is there a `selection-exempt:` marker within ~5 lines before the call?
      const before = src.slice(Math.max(0, m.index - 400), m.index);
      const exempt = /selection-exempt\s*:/.test(before) || /selection-exempt\s*:/.test(window);
      // Or: this file uses the shared selector (the selection lives there, this raw call is a
      // downstream artifact read keyed on an id the selector already returned).
      const usesSelector = /selectAuthoritativeExecution\s*\(/.test(src);
      if (!exempt && !usesSelector) {
        const line = src.slice(0, m.index).split('\n').length;
        failures.push(`${r}:${line} — authoritative agentExecution.find* (taskId + status:'SUCCESS') without selectAuthoritativeExecution or a "// selection-exempt: <reason>" marker`);
      }
    }
  }
}

ok(scanned > 100, `scanned ${scanned} source files`);
// Positive control (Wave B): the detectors must flag the pre-Wave-B read, verbatim in shape.
const OLD_READ = "await prisma.$queryRaw`\n  SELECT (content::jsonb)->>'finalResponse' AS fr FROM agent_artifacts\n  WHERE name = 'result.json' AND content LIKE '{%'\n    AND (content::jsonb)->>'taskId' = ${authorChild.id}\n  ORDER BY \"createdAt\" DESC LIMIT 1`";
const OLD_PRISMA = "prisma.agentArtifact.findFirst({ where: { name: 'result.json', execution: { taskId } }, orderBy: { createdAt: 'desc' } })";
ok(artifactTaskIdSql(OLD_READ).length === 1, 'positive control: fingerprint A flags the pre-Wave-B content-taskId query');
ok(artifactTaskIdPrisma(OLD_PRISMA).length === 1, 'positive control: fingerprint B flags a taskId-keyed agentArtifact.find*');
ok(artifactTaskIdPrisma("prisma.agentArtifact.findFirst({ where: { executionId: e.id, name: 'result.json' } })").length === 0,
  'negative control: an executionId-keyed artifact read is not flagged');
console.log(`  ℹ️  artifact fingerprints in real code: ${artifactFingerprints} (0 expected after Wave B unless exempt-marked)`);
ok(fingerprints > 0, `found ${fingerprints} authoritative-selection fingerprint(s) — sanity that the detector matches real code`);
ok(failures.length === 0, failures.length === 0
  ? 'every authoritative selection uses the shared selector or is explicitly exempt'
  : `${failures.length} uncovered authoritative selection(s):\n     - ${failures.join('\n     - ')}`);

console.log(`\n──────────────────────────────────────────────────`);
console.log(`  Passed: ${passed}  Failed: ${failed}`);
console.log(failed === 0 ? '  ✅ selection-coverage: GREEN' : '  ❌ selection-coverage: RED');
process.exit(failed === 0 ? 0 : 1);
