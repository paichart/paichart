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
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

// The selection module itself IS the implementation — exempt by definition.
const SELF = 'lib/services/execution-selection.ts';

console.log('\n🧪 TEST — authoritative-execution selection coverage (BC75 drift-lock)\n');

const failures: string[] = [];
const dirs = ['lib', 'app'].map(d => path.join(ROOT, d));
let scanned = 0, fingerprints = 0;

for (const dir of dirs) {
  for (const file of walk(dir)) {
    const r = rel(file);
    if (r === SELF) continue;
    const src = fs.readFileSync(file, 'utf8');
    scanned++;

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
ok(fingerprints > 0, `found ${fingerprints} authoritative-selection fingerprint(s) — sanity that the detector matches real code`);
ok(failures.length === 0, failures.length === 0
  ? 'every authoritative selection uses the shared selector or is explicitly exempt'
  : `${failures.length} uncovered authoritative selection(s):\n     - ${failures.join('\n     - ')}`);

console.log(`\n──────────────────────────────────────────────────`);
console.log(`  Passed: ${passed}  Failed: ${failed}`);
console.log(failed === 0 ? '  ✅ selection-coverage: GREEN' : '  ❌ selection-coverage: RED');
process.exit(failed === 0 ? 0 : 1);
