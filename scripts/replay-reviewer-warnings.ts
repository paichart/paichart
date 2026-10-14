/**
 * replay-reviewer-warnings — proves the WARNINGS-INVISIBLE render leaves every existing report.md byte-identical
 * (SYNTHESIS v0.3 §4, execution-facts replay design). READ-ONLY: it consumes a JSONL dump, never the DB.
 *
 * Dump (prod, read-only): cline_docs/reviews/warnings-invisible-2026-10-08/replay-dump.sql →
 *   ssh … psql -q < replay-dump.sql > dump.jsonl
 * Each row: a PIPELINE report.md, its harness execution, the task's protocol, and every verdict-role reviewer child of
 * its stage with the finalResponse of that reviewer's latest SUCCESS execution started AT OR BEFORE the harness
 * execution (selection as of the leg run — later re-runs must not leak in).
 *
 * For each row it runs the SHIPPING pure functions only — computeReviewerWarnings (G1) over each reviewer's text,
 * the net's render-scope rule, appendReviewerWarningsSection — and asserts output === stored bytes.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/replay-reviewer-warnings.ts <dump.jsonl>            # expect 0 changed
 *   … --mutation   # control: a LOOSE grammar (any line containing the literal) — must flip leg cmuw8e6c90010yx9erg4d21t1
 *   … --inject     # control: a synthetic warning on one report per infra domain — prefix-equal + exactly one section
 */
import * as fs from 'fs';
import { computeReviewerWarnings, WARNING_LABEL } from '@/lib/agents/harness/reviewer-warnings';
import { parseReviewerVerdict } from '@/lib/agents/harness/parse-verdict';
import { appendReviewerWarningsSection, WARNINGS_SECTION_HEADING } from '@/lib/services/report-warnings-section';
import { LEG_SECTION_PROTOCOLS, PROGRAM_SECTION_PROTOCOLS } from '@/lib/agents/harness/reviewer-warnings-enrichment';

const [, , file, flag] = process.argv;
if (!file) { console.error('usage: replay-reviewer-warnings.ts <dump.jsonl> [--mutation|--inject]'); process.exit(2); }
const MUTATION = flag === '--mutation';
const INJECT = flag === '--inject';
const MUTATION_LEG = 'cmuw8e6c90010yx9erg4d21t1';

type Row = { artId: string; execId: string; taskId: string; protocol: string | null; report: string;
  reviewers: Array<{ taskId: string; role: string; finalResponse: string | null }> };

function warningsOf(text: string): Array<{ id: string; text: string }> {
  if (!MUTATION) return computeReviewerWarnings(text).warnings;
  // LOOSE grammar (the failure the position + line-start rules exist to prevent): any line with the literal.
  return text.split('\n').filter(l => l.includes(WARNING_LABEL)).map(l => ({ id: 'loose', text: l.trim() }));
}

const rows: Row[] = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const b = { identical: 0, changed: 0, noReviewer: 0, noVerdict: 0, factOnly: 0 };
const changed: string[] = [];
let injected = 0; const injectedOk: string[] = [];
const injectDomains = new Set(['network-provisioning-protocol', 'terraform-iac-protocol', 'observability-config-protocol']);

for (const r of rows) {
  const proto = r.protocol;
  const isProgram = !!proto && PROGRAM_SECTION_PROTOCOLS.has(proto);
  const renderScope = isProgram ? 'program-section' : (proto && LEG_SECTION_PROTOCOLS.has(proto) ? 'leg-section' : 'fact-only');
  if (renderScope === 'fact-only') b.factOnly++;
  if (r.reviewers.length === 0) b.noReviewer++;
  const reviewers = r.reviewers.map((rv, i) => {
    const v = rv.finalResponse ? parseReviewerVerdict(rv.finalResponse) : null;
    if (!v && !MUTATION) { b.noVerdict++; return { executionId: `as-of-${i}`, role: rv.role, warnings: [] as any[] }; }
    return { executionId: `as-of-${i}`, role: rv.role, warnings: warningsOf(rv.finalResponse ?? '') };
  });
  if (INJECT && injectDomains.has(proto ?? '') && reviewers.some(x => x.role === 'change_reviewer')) {
    injectDomains.delete(proto!);
    const target = reviewers.find(x => x.role === 'change_reviewer')!;
    target.warnings = [{ id: 'injected', text: 'synthetic control line' }];
    injected++;
  }
  const fact = isProgram
    ? { checked: true, renderScope, legs: [], reviewers }
    : { checked: true, renderScope, reviewers };
  const out = appendReviewerWarningsSection(r.report, fact);
  if (out.content === r.report) { b.identical++; continue; }
  b.changed++;
  changed.push(`${r.taskId} (${proto ?? 'no protocol'}) +${out.appended}`);
  if (INJECT) {
    const sections = out.content.split(WARNINGS_SECTION_HEADING).length - 1;
    if (out.content.startsWith(r.report.replace(/\s*$/, '')) && sections === 1) injectedOk.push(`${proto} ${r.taskId}`);
  }
}

console.log(`\nreport.md replayed: ${rows.length}`);
console.log(`  identical ${b.identical} · changed ${b.changed}   (context: no-reviewer ${b.noReviewer} · reviewer-without-verdict ${b.noVerdict} · fact-only scope ${b.factOnly})`);
for (const c of changed.slice(0, 20)) console.log(`  changed: ${c}`);

if (MUTATION) {
  const hit = changed.some(c => c.startsWith(MUTATION_LEG));
  console.log(hit ? `✅ mutation control: the loose grammar flips ${MUTATION_LEG} (the replay can see a change)` : `❌ mutation control: ${MUTATION_LEG} did NOT flip`);
  process.exit(hit ? 0 : 1);
}
if (INJECT) {
  const pass = injected === 3 && injectedOk.length === 3 && b.changed === 3;
  console.log(pass ? `✅ injection control: 3 domains, each prefix-equal + exactly one section (${injectedOk.join(' · ')})`
                   : `❌ injection control: injected ${injected}, ok ${injectedOk.length}, changed ${b.changed}`);
  process.exit(pass ? 0 : 1);
}
const pass = b.changed === 0 && b.identical === rows.length;
console.log(pass ? '✅ every existing report.md is byte-identical under the new render' : '❌ existing report.md would change');
process.exit(pass ? 0 : 1);
