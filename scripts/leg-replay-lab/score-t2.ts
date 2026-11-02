/**
 * Leg replay lab — the L-T2 scorer (held-terraform step 3, the join; LAB-PREREG-L-T2.md §5). $0, offline. ADDITIVE:
 *   - Author gates (G1 edit scores, G-APPLY, G-SCOPE, G-FAILCLOSED, G-AMBIG, SG-WIN, SG-DIFF, restore / git revert, unheld grammar,
 *     correction arbitration) and the Reviewer gates come from score-k2 (`scoreK2Run`, `k2ReviewerGates`) unchanged — every one of them
 *     is domain-neutral (SG-DIFF normalises `a/`, `b/` and a leading slash, so `--- a/terraform/main.tf` names `/terraform/main.tf`).
 *   - The live-brief Harvester cell (G-T-REF) comes from score-t1 (`scoreT1Runs`) unchanged.
 *   - NEW here: the ARCH-QUOTE reading for HCL. score-edits `scoreArchitect` counts any 3 held lines in order, and HCL repeats the
 *     same trivial lines in every block (`}`, `  }`, blank) — a design that writes two NEW resources would read as a quote of the held
 *     file. A fenced block is a held-file quote here only when ≥ 3 NON-TRIVIAL held lines appear in it in order (trivial = blank, or
 *     only braces / brackets / parentheses / commas). Reported BESIDE the registered (generic) reading, never instead of it.
 * Mutation (must turn `t2-self-test` red): trivial-blind.
 */
import * as fs from 'fs';
import * as path from 'path';
import { scoreK2Run, k2ReviewerGates } from './score-k2';
import { scoreT1Runs } from './score-t1';
import { heldFilesOf } from './score-edits';

export type T2Mutation = 'trivial-blind';
const TRIVIAL_RE = /^[\s{}()[\],]*$/;
export const isTrivialHclLine = (l: string) => TRIVIAL_RE.test(l);

function fencedBodies(text: string): string[] {
  const out: string[] = []; const re = /^(\s*)(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^\1\2\s*$/gm; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[3]);
  return out;
}
/** How many lines of `base` (non-trivial ones unless mutated) appear in `body` in order. */
export function inOrderNonTrivial(base: string, body: string, mutate?: T2Mutation): number {
  const keep = (l: string) => mutate === 'trivial-blind' || !isTrivialHclLine(l);
  const b = base.split('\n').filter(keep).map((l) => l.trimEnd()); const s = body.split('\n').filter(keep).map((l) => l.trimEnd());
  let i = 0, n = 0;
  for (const line of s) { const j = b.indexOf(line, i); if (j >= 0) { n++; i = j + 1; } }
  return n;
}
export function hclArchQuotes(out: string, bases: Record<string, string>, mutate?: T2Mutation): Array<{ handle: string; lines: number }> {
  const quotes: Array<{ handle: string; lines: number }> = [];
  for (const body of fencedBodies(out)) for (const [h, base] of Object.entries(bases)) { const n = inOrderNonTrivial(base, body, mutate); if (n >= 3) quotes.push({ handle: h, lines: n }); }
  return quotes;
}

export function scoreT2Run(runDirs: string[], exp: { nodes: any[] }, mutate?: T2Mutation): { md: string[] } {
  const k2 = scoreK2Run(runDirs, exp as never);
  const md: string[] = ['# L-T2 scores (score-t2.ts) — arithmetic only; the decision is LAB-PREREG-L-T2.md; READ every named sample', '',
    '> Author + Reviewer tables below are score-k2 (domain-neutral parts). Its "k8s additions" headings and its k8s-document ARCH-QUOTE /',
    '> SG-DOC columns do NOT apply to HCL: read ARCH-QUOTE from the HCL table in this section, and SG-DOC is not a terraform gate.', ''];
  md.push('## ARCH-QUOTE — HCL reading (≥ 3 non-trivial held lines in order in one fenced block)', '', '| node | arm | sample | names a handle | HCL quotes |', '|---|---|---|---|---|');
  for (const run of runDirs) for (const nd of exp.nodes.filter((n) => n.architectOnly)) {
    const nodeDir = path.join(run, nd.id); if (!fs.existsSync(nodeDir)) continue;
    for (const arm of fs.readdirSync(nodeDir).filter((d) => fs.statSync(path.join(nodeDir, d)).isDirectory())) {
      const cell = path.join(nodeDir, arm);
      const heldCell = fs.readdirSync(cell).some((f) => /^held-base-/.test(f)) ? cell : null;
      for (const s of fs.readdirSync(cell).filter((d) => /^sample-\d+$/.test(d) && fs.existsSync(path.join(cell, d, 'author.md')))) {
        const out = fs.readFileSync(path.join(cell, s, 'author.md'), 'utf8');
        const q = heldCell ? hclArchQuotes(out, heldFilesOf(heldCell).bases, mutate) : [];
        md.push(`| ${nd.id} | ${arm} | ${path.basename(run)}/${s} | ${/\bH[1-9][0-9]{0,2}\b/.test(out)} | ${q.length ? q.map((x) => `${x.handle} ${x.lines} lines`).join(', ') : '0'} |`);
      }
    }
  }
  const t1 = scoreT1Runs(runDirs, { nodes: exp.nodes.filter((n) => n.scoring?.role === 'harvester') });
  md.push('', '## Harvester (score-t1, the live-brief G-T-REF cell)', '', ...t1.md.slice(4));
  const rev = k2ReviewerGates(runDirs, exp as never);
  md.push('', '## Reviewer gates (score-k2 k2ReviewerGates)', '', ...rev.md);
  md.push('', '## Author + inherited gates (score-k2)', '', ...k2.md);
  return { md };
}

export function t2SelfTest(opts: { mutate?: T2Mutation } = {}): { ok: boolean; failures: string[] } {
  const m = opts.mutate; const f: string[] = [];
  const BASE = ['# The application log bucket.', 'resource "aws_s3_bucket" "app_logs" {', '  bucket = "acme-app-logs"', '  tags = merge({', '    team = "platform"', '  }, local.inventory_tags)', '}', '',
    'resource "random_password" "db_master" {', '  length = 24', '}', ''].join('\n');
  const bases = { H1: BASE };
  const newRes = '```hcl\nresource "aws_s3_bucket_versioning" "app_logs" {\n  bucket = aws_s3_bucket.app_logs.id\n\n  versioning_configuration {\n    status = "Enabled"\n  }\n}\n\n```\n';
  if (hclArchQuotes(newRes, bases, m).length !== 0) f.push('HCL ARCH-QUOTE: a NEW resource (trivial lines shared with H1 only) reads as a quote');
  const quote = '```hcl\n# The application log bucket.\nresource "aws_s3_bucket" "app_logs" {\n  bucket = "acme-app-logs"\n```\n';
  if (hclArchQuotes(quote, bases, m).length !== 1) f.push('HCL ARCH-QUOTE: three non-trivial held lines in order are not read as a quote');
  const two = '```hcl\nresource "random_password" "db_master" {\n  length = 24\n}\n```\n';
  if (hclArchQuotes(two, bases, m).length !== 0) f.push('HCL ARCH-QUOTE: two non-trivial held lines read as a quote');
  return { ok: f.length === 0, failures: f };
}
