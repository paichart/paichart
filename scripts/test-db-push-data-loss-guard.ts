/**
 * test-db-push-data-loss-guard.ts — pins the deploy's data-loss guard (register DB-PUSH-ACCEPT-DATA-LOSS-INVERTED).
 *
 * Prisma parses `--accept-data-loss` as an on/off flag and DISCARDS any `=value`, so `--accept-data-loss=false`
 * means "accept". Proven 2026-10-14 on a scratch DB with stdin not a terminal and CI unset (the deploy's
 * conditions): plain `db push` refused and kept the rows (exit 1); `--accept-data-loss=false` dropped the table.
 *
 * Asserts:
 *  1. No executable file (scripts/, .github/, prisma/, package.json) writes `accept-data-loss=` with any value.
 *  2. The deploy script's only `db push --accept-data-loss` sits inside the ACCEPT_DATA_LOSS = "yes" branch,
 *     and the default branch is a plain `npx prisma db push` that exits non-zero on refusal.
 *  3. The workflow passes ACCEPT_DATA_LOSS = yes only on a hand-run workflow_dispatch whose boolean input
 *     `accept_data_loss` defaults to false.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const SELF = path.relative(ROOT, __filename);
let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) { passed++; console.log(`  ✅ ${name}`); } else { failed++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.git') && e.name !== '.github') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(sh|ya?ml|ts|js|mjs|cjs|json|prisma|sql|py)$/.test(e.name)) out.push(p);
  }
}

console.log('🛡️  db push data-loss guard');

// 1. No `accept-data-loss=<anything>` in executable files.
const files: string[] = [];
for (const d of ['scripts', '.github', 'prisma']) walk(path.join(ROOT, d), files);
files.push(path.join(ROOT, 'package.json'));
const offenders = files
  .filter((f) => path.relative(ROOT, f) !== SELF)
  .filter((f) => /accept-data-loss=/.test(fs.readFileSync(f, 'utf8')))
  .map((f) => path.relative(ROOT, f));
check('no executable file writes accept-data-loss=<value> (it always means "accept")', offenders.length === 0, offenders.join(', '));

// 2 + 3 read the PRIVATE deploy files (scripts/deploy/** and production-deploy.yml never export). In a public checkout
// they have nothing to check: skip them BY NAME there. In the private source (cline_docs present) a missing file FAILS.
const deployPath = path.join(ROOT, 'scripts/deploy/blue-green-deploy.sh');
const wfPath = path.join(ROOT, '.github/workflows/production-deploy.yml');
const isPrivateSource = fs.existsSync(path.join(ROOT, 'cline_docs'));
if (!isPrivateSource && !fs.existsSync(deployPath)) {
  console.log('  ⏭️  SKIPPED (named): deploy-script + workflow checks — private files, absent in this checkout');
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}
// 2. The deploy script.
const lines = fs.readFileSync(deployPath, 'utf8').split('\n');
const code = lines.map((l, i) => ({ l: l.trim(), i })).filter(({ l }) => l && !l.startsWith('#') && !l.startsWith('echo'));
const acceptIdx = code.filter(({ l }) => /db push\b.*--accept-data-loss/.test(l));
check('exactly one db push --accept-data-loss in the deploy script', acceptIdx.length === 1, `found ${acceptIdx.length}`);
if (acceptIdx.length === 1) {
  const pos = code.findIndex(({ i }) => i === acceptIdx[0].i);
  const guard = code[pos - 1]?.l ?? '';
  check('it is the first statement of the ACCEPT_DATA_LOSS = "yes" branch',
    /^if \[ "\$\{ACCEPT_DATA_LOSS:-no\}" = "yes" \]; then$/.test(guard), guard);
}
const plain = code.filter(({ l }) => /^npx prisma db push(\s*\|\|\s*\{)?\s*$/.test(l));
check('the default branch is a plain `npx prisma db push || {` with an explicit failure exit', plain.length === 1 && /\|\|\s*\{/.test(plain[0].l));
if (plain.length === 1) {
  const pos = code.findIndex(({ i }) => i === plain[0].i);
  const block = code.slice(pos, pos + 3).map(({ l }) => l);
  check('the refusal branch exits 1', block.includes('exit 1'), block.join(' | '));
}

// 3. The workflow.
const wf = fs.readFileSync(wfPath, 'utf8');
check('workflow_dispatch input accept_data_loss is boolean, default false',
  /accept_data_loss:\s*\n(?:\s+description:.*\n)?\s+type: boolean\s*\n\s+default: false/.test(wf));
check('ACCEPT_DATA_LOSS is yes only on workflow_dispatch with the input set',
  wf.includes("ACCEPT_DATA_LOSS='${{ github.event_name == 'workflow_dispatch' && inputs.accept_data_loss && 'yes' || 'no' }}'"));
check('the deploy ssh passes ACCEPT_DATA_LOSS to the script',
  /ACCEPT_DATA_LOSS='\$ACCEPT_DATA_LOSS' bash \/tmp\/blue-green-deploy/.test(wf));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
