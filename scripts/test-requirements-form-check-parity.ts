/**
 * PARITY GATE — the TypeScript requirements form check vs the Python operator tools (2026-10-09).
 *
 * Runs the Python CLIs (via scripts/requirements-form-check-parity-driver.py, which executes each script as __main__)
 * and the TS port over three corpora and requires IDENTICAL results:
 *   (a) the 9 trial drafts (.claude/skills/requirements-spec/work/log-archive-namespace-write-2026-10-09/draft-*),
 *       each with its own objective.txt and the owner's answers.md;
 *   (b) every ~/paichart/program-artifacts/* /requirements*.md (no objective exists for these: an EMPTY objective is
 *       used, the lint runs without --declared — both sides get the same inputs, which is what parity needs);
 *   (c) every fixture the Python suites feed their checkers, HARVESTED from the suites themselves (never re-typed).
 *
 * What "identical" means per check:
 *   coverage   the CLI's --json `{errors, read, stats}` deep-equals checkCoverage(); exit code equal
 *   citations  full stdout + exit code (the Python keeps its logic in main(); the text is the whole observable)
 *   clauses    the CLI's --json `{checked, dropped}` deep-equals checkClauses(); exit code equal
 *   lint       full stdout + exit code of `--lint` (+ `--declared`)
 *   size       `--program-view` stdout + exit; the VIEW FILE Python wrote is byte-equal to programView();
 *              `--size-check` stdout + exit on the view AND on the raw draft (so every size number is exact)
 *   registry   Python load_registry() deep-equals the generated REQUIREMENTS_REGISTRY
 *
 * A mismatch is a FINDING to explain, never to paper over: the output names the case, the check and the first diff.
 * Corpus (b)/(c-lint) need the public repo (PAICHART_PUBLIC_REPO or ~/paichart); absent, they SKIP BY NAME.
 *
 * Run: npm run test:requirements-form-check-parity
 */
import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join, basename } from 'path';
import * as os from 'os';
import { checkCoverage } from '../lib/agents/harness/requirements-coverage';
import { checkCitations, renderCitationsCli } from '../lib/agents/harness/requirements-citations';
import { checkClauses, rowItemMapFromAnswers } from '../lib/agents/harness/requirements-clauses';
import { renderLintCli, renderProgramViewCli, renderSizeCheckCli } from '../lib/agents/harness/requirements-size-lint';
import { REQUIREMENTS_REGISTRY, REQUIREMENTS_TEMPLATE_TEXT } from '../lib/agents/harness/requirements-form-check.generated';
import { PY_PATTERN_LOG, pyRe, pyFinditer, pySplit, pyStrip, pyJsonDumpsStr, cpLen, pyRepr, pyCommas } from '../lib/agents/harness/requirements-pysem';
import '../lib/agents/harness/requirements-form-check';

const ROOT = join(__dirname, '..');
const DRIVER = join(__dirname, 'requirements-form-check-parity-driver.py');
const TRIAL = join(ROOT, '.claude', 'skills', 'requirements-spec', 'work', 'log-archive-namespace-write-2026-10-09');
const PUBLIC = process.env.PAICHART_PUBLIC_REPO || join(os.homedir(), 'paichart');
const ARTIFACTS = join(PUBLIC, 'program-artifacts');
const TEMPLATE = join(ARTIFACTS, '_TEMPLATE', 'requirements.template.md');
/** No-public-repo mode (G5, 2026-10-10 — EF F4(b)): size + lint live in the PUBLIC requirements-rules.py. Without the
 *  public repo (CI), those two checks are SKIPPED BY NAME and coverage / citations / clauses — both sides of which live
 *  in copov15 — still run on every trial draft and harvested fixture. */
const RULES_PRESENT = existsSync(join(PUBLIC, 'scripts', 'requirements-rules.py'));

type Check = 'coverage' | 'citations' | 'clauses' | 'lint' | 'size';
interface Case { id: string; corpus: 'trial' | 'published' | 'fixture'; checks: Check[]; draft: string; objective?: string; answers?: string; declared?: string | null }

/** Python's text-mode read: universal newlines (\r\n and lone \r → \n). */
const pyRead = (p: string) => readFileSync(p, 'utf8').replace(/\r\n?/g, '\n');

function canon(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(canon);
  if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x as object).sort().map(k => [k, canon((x as Record<string, unknown>)[k])]));
  return x;
}
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
function firstDiff(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return `at char ${i}: py=${JSON.stringify(a.slice(Math.max(0, i - 40), i + 80))} ts=${JSON.stringify(b.slice(Math.max(0, i - 40), i + 80))}`;
}

const cases: Case[] = [];
const skipped: string[] = [];

// (a) trial drafts
const answers = pyRead(join(TRIAL, 'answers.md'));
for (const d of readdirSync(TRIAL).filter(n => n.startsWith('draft-')).sort()) {
  const dir = join(TRIAL, d);
  const objective = pyRead(join(dir, 'objective.txt'));
  cases.push({ id: `trial/${d}`, corpus: 'trial', checks: RULES_PRESENT ? ['coverage', 'citations', 'clauses', 'lint', 'size'] : ['coverage', 'citations', 'clauses'], draft: pyRead(join(dir, 'report.md')), objective, answers, declared: objective });
}
if (!RULES_PRESENT) skipped.push(`(a) size + lint on the trial drafts — ${join(PUBLIC, 'scripts', 'requirements-rules.py')} not present (no-public mode)`);

// (b) published specs
if (existsSync(ARTIFACTS)) {
  for (const d of readdirSync(ARTIFACTS).sort()) {
    const dir = join(ARTIFACTS, d);
    let files: string[] = [];
    try { files = readdirSync(dir).filter(f => /^requirements.*\.md$/.test(f)).sort(); } catch { continue; }
    for (const f of files) {
      cases.push({ id: `published/${d}/${f}`, corpus: 'published', checks: ['coverage', 'citations', 'clauses', 'lint', 'size'], draft: pyRead(join(dir, f)), objective: '', answers, declared: null });
    }
  }
} else skipped.push(`(b) published specs — ${ARTIFACTS} not present`);

// (c) fixtures harvested from the Python suites
const harvest = JSON.parse(execFileSync('python3', [DRIVER, 'harvest'], { encoding: 'utf8', maxBuffer: 1 << 28 }));
for (const [suite, r] of Object.entries(harvest.suites as Record<string, unknown>)) {
  if (typeof r === 'string') skipped.push(`(c) ${basename(suite)} — ${r}`);
  else if ((r as { exit: number }).exit !== 0) throw new Error(`Python suite ${suite} is RED (exit ${(r as { exit: number }).exit}) — parity over a failing suite proves nothing`);
}
(harvest.cases as Array<Record<string, string>>).forEach((c, i) => {
  const id = `fixture/${c.kind}#${i}`;
  if (c.kind === 'coverage') cases.push({ id, corpus: 'fixture', checks: ['coverage'], draft: c.draft });
  else if (c.kind === 'citations') cases.push({ id, corpus: 'fixture', checks: ['citations'], draft: c.draft, objective: c.objective });
  else if (c.kind === 'clauses') cases.push({ id, corpus: 'fixture', checks: ['clauses'], draft: c.draft, objective: c.objective, answers: c.answers });
  else if (c.kind === 'lint' && RULES_PRESENT) cases.push({ id, corpus: 'fixture', checks: ['lint'], draft: c.draft, declared: c.declared });
});

// Write every case's inputs; run the Python CLIs once over the manifest.
const tmp = mkdtempSync(join(os.tmpdir(), 'req-parity-'));
const manifest = cases.map((c, i) => {
  const dir = join(tmp, String(i));
  require('fs').mkdirSync(dir);
  const files: Record<string, string> = { draft: join(dir, 'requirements.md'), view: join(dir, 'requirements.program.md') };
  writeFileSync(files.draft, c.draft);
  if (c.objective !== undefined) { files.objective = join(dir, 'objective.txt'); writeFileSync(files.objective, c.objective); }
  if (c.answers !== undefined) { files.answers = join(dir, 'answers.md'); writeFileSync(files.answers, c.answers); }
  if (c.declared) { files.declared = join(dir, 'declared.txt'); writeFileSync(files.declared, c.declared); }
  return { id: c.id, checks: c.checks, files };
});
writeFileSync(join(tmp, 'manifest.json'), JSON.stringify(manifest));
const py: Array<Record<string, [string, number] | string | null>> = JSON.parse(execFileSync('python3', [DRIVER, 'run', join(tmp, 'manifest.json')], { encoding: 'utf8', maxBuffer: 1 << 28 }));

let failed = 0;
const perCorpus: Record<string, { cases: number; comparisons: number; mismatches: number }> = {};
const tally = (c: Case, ok: boolean, what: string, detail: string) => {
  const t = (perCorpus[c.corpus] ||= { cases: 0, comparisons: 0, mismatches: 0 });
  t.comparisons++;
  if (!ok) { t.mismatches++; failed++; console.log(`❌ ${c.id} — ${what}: ${detail}`); }
};

const templateText = existsSync(TEMPLATE) ? pyRead(TEMPLATE) : REQUIREMENTS_TEMPLATE_TEXT;
cases.forEach((c, i) => {
  const r = py[i];
  const m = manifest[i].files;
  (perCorpus[c.corpus] ||= { cases: 0, comparisons: 0, mismatches: 0 }).cases++;
  if (c.checks.includes('coverage')) {
    const [out, code] = r.coverage as [string, number];
    const ts = checkCoverage(c.draft, REQUIREMENTS_REGISTRY);
    const pyJ = JSON.parse(out);
    tally(c, same(pyJ, ts), 'coverage findings', JSON.stringify(canon(pyJ)).slice(0, 300) + ' VS ' + JSON.stringify(canon(ts)).slice(0, 300));
    tally(c, code === (ts.errors.length ? 1 : 0), 'coverage exit', `py ${code}`);
  }
  if (c.checks.includes('citations')) {
    const [out, code] = r.citations as [string, number];
    const ts = renderCitationsCli(checkCitations(c.objective!, c.draft));
    tally(c, out === ts.stdout, 'citations stdout', firstDiff(out, ts.stdout));
    tally(c, code === ts.exit, 'citations exit', `py ${code} ts ${ts.exit}`);
  }
  if (c.checks.includes('clauses')) {
    const [out, code] = r.clauses as [string, number];
    const ts = checkClauses(c.objective!, rowItemMapFromAnswers(c.answers!), c.draft);
    const pyJ = JSON.parse(out);
    tally(c, same(pyJ, ts), 'clauses findings', JSON.stringify(pyJ).slice(0, 300) + ' VS ' + JSON.stringify(ts).slice(0, 300));
    tally(c, code === (ts.dropped.length ? 1 : 0), 'clauses exit', `py ${code}`);
  }
  if (c.checks.includes('lint')) {
    const [out, code] = r.lint as [string, number];
    const ts = renderLintCli(m.draft, c.draft, templateText, c.declared ?? null);
    tally(c, out === ts.stdout, 'lint stdout', firstDiff(out, ts.stdout));
    tally(c, code === ts.exit, 'lint exit', `py ${code} ts ${ts.exit}`);
  }
  if (c.checks.includes('size')) {
    const [pvOut, pvCode] = r.programView as [string, number];
    const ts = renderProgramViewCli(m.draft, m.view, c.draft);
    tally(c, pvOut === ts.stdout && pvCode === ts.exit, 'program-view stdout/exit', firstDiff(pvOut, ts.stdout));
    const pyView = r.view as string | null;
    tally(c, (pyView === null) === (ts.view === null) && (pyView === null || pyView === ts.view), 'program-view bytes',
      pyView && ts.view ? firstDiff(pyView, ts.view) : `py ${pyView === null ? 'none' : 'view'} ts ${ts.view === null ? 'none' : 'view'}`);
    if (pyView !== null && ts.view !== null) {
      const [svOut, svCode] = r.sizeView as [string, number];
      const sv = renderSizeCheckCli([{ path: m.view, text: ts.view }]);
      tally(c, svOut === sv.stdout && svCode === sv.exit, 'size-check (view)', firstDiff(svOut, sv.stdout));
    }
    const [srOut, srCode] = r.sizeRaw as [string, number];
    const sr = renderSizeCheckCli([{ path: m.draft, text: c.draft }]);
    tally(c, srOut === sr.stdout && srCode === sr.exit, 'size-check (raw)', firstDiff(srOut, sr.stdout));
  }
});

// (d) SEMANTICS PROBES — every Python pattern the port compiles, plus the string primitives, over adversarial text.
// The corpus does not exercise Unicode \w/\b/\s, U+2028, CR, NBSP or astral chars (measured: an ASCII `\b` mutant and a
// JS-whitespace `split` mutant both passed every corpus case), so each is compared with Python's own answer here.
const ADVERSARIAL = [
  'port 8080 and éport 81 and port\u00a0443 and tcp/22, udp:53, host:8443',
  'the address 10.0.0.1é and é10.0.0.2 and 10.0.0.3. and 10.0.0.4/24.\nand .5, .6 and .7',
  'arn:aws:s3:::acme-app-logs/* arn:aws:iam::123456789012:role/x\u2028tail',
  '## Design decisions\u2028## Pipeline 1 objective — kubernetes-gitops\nbody\r\n## Pipeline 2 objective — terraform-iac\n',
  '1. The target is `x`.\n2. The bucket leg states what else, if anything, changes; it reports the literal criterion.\n\n3. Last\n',
  'item 3–5 and items\u00a02 and item 22: "quoted" and (declared — item 4: "q") é\u0661\u0662 pods',
  '\u001cword\u001d  \u0085x\u00a0y\u2003z\ufeffw  ',
  '🗑 {{PLACEHOLDER}} — tier: not-applicable — reason\n- `terraform-iac.collateral` — q — tier: `default`\n',
  'three harvested pods, 2 existing buckets, twelve namespaces; (derived — basis: Phase 0 shows two OTLP blocks)',
  'Writing rules #3 and Writing rules* #1, #2 and #7',
  'aws_s3_bucket.app_logs and résumé_x.y and google_project.p-1',
  'end with a newline\n',
];
const probes: Array<Record<string, unknown>> = [];
for (const { pattern, flags } of PY_PATTERN_LOG.values()) {
  const f = (flags.i ? 'i' : '') + (flags.m ? 'm' : '') + (flags.s ? 's' : '');
  for (const text of ADVERSARIAL) probes.push({ op: 'finditer', pattern, flags: f, text });
}
for (const text of ADVERSARIAL) {
  probes.push({ op: 'split', text }, { op: 'strip', text, chars: null }, { op: 'strip', text, chars: ' —-|`*' },
    { op: 'dumps', text }, { op: 'len', text }, { op: 'repr', text });
}
for (const n of [0, 7, 999, 1000, -1725, 51725, 1234567]) probes.push({ op: 'commas', n });
writeFileSync(join(tmp, 'probes.json'), JSON.stringify(probes));
const pyProbe: unknown[] = JSON.parse(execFileSync('python3', [DRIVER, 'probes', join(tmp, 'probes.json')], { encoding: 'utf8', maxBuffer: 1 << 28 }));
let probeMismatch = 0;
probes.forEach((p, i) => {
  let ts: unknown;
  const text = p.text as string;
  if (p.op === 'finditer') {
    const re = pyRe(p.pattern as string, { i: (p.flags as string).includes('i'), m: (p.flags as string).includes('m'), s: (p.flags as string).includes('s') });
    ts = pyFinditer(re, text).map(m => [m[0], m.slice(1).map(g => (g === undefined ? null : g))]);
  } else if (p.op === 'split') ts = pySplit(text);
  else if (p.op === 'strip') ts = pyStrip(text, (p.chars as string | null) ?? undefined);
  else if (p.op === 'dumps') ts = pyJsonDumpsStr(pyJsonDumpsStr(text)).length;
  else if (p.op === 'len') ts = cpLen(text);
  else if (p.op === 'repr') ts = pyRepr(text);
  else if (p.op === 'commas') ts = pyCommas(p.n as number);
  if (JSON.stringify(ts) !== JSON.stringify(pyProbe[i])) {
    probeMismatch++; failed++;
    if (probeMismatch <= 10) console.log(`❌ probe ${p.op} ${p.pattern ?? ''} on ${JSON.stringify(text)?.slice(0, 60)}: py=${JSON.stringify(pyProbe[i]).slice(0, 160)} ts=${JSON.stringify(ts).slice(0, 160)}`);
  }
});
console.log(`${probeMismatch ? '❌' : '✅'} semantics probes: ${PY_PATTERN_LOG.size} patterns × ${ADVERSARIAL.length} texts + string primitives = ${probes.length} probes, ${probeMismatch} mismatches`);

// registry
const pyReg = JSON.parse(execFileSync('python3', [DRIVER, 'registry'], { encoding: 'utf8' }));
const { _options, ...pyClasses } = pyReg;
const regOk = same(pyClasses, REQUIREMENTS_REGISTRY.classes) && same(_options, Object.fromEntries(REQUIREMENTS_REGISTRY.options))
  && JSON.stringify(Object.keys(_options)) === JSON.stringify(REQUIREMENTS_REGISTRY.options.map(([k]) => k));
console.log(`${regOk ? '✅' : '❌'} registry: Python load_registry() == generated REQUIREMENTS_REGISTRY`);
if (!regOk) failed++;

rmSync(tmp, { recursive: true, force: true });
for (const [k, v] of Object.entries(perCorpus)) {
  console.log(`${v.mismatches ? '❌' : '✅'} corpus ${k}: ${v.cases} cases, ${v.comparisons} comparisons, ${v.mismatches} mismatches`);
}
for (const s of skipped) console.log(`⏭️  SKIPPED (named): ${s}`);
console.log(failed ? `\n❌ ${failed} parity mismatch(es)` : '\n✅ TS port == Python on every case');
process.exit(failed ? 1 : 0);
