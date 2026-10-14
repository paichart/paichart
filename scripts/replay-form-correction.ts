#!/usr/bin/env ts-node
/**
 * replay-form-correction.ts — Step A.5 OFFLINE correction replay (mechanical-reflection-trigger, plan §10).
 *
 * For every corpus specimen the SHIPPING form check fires on, rebuild the Author's turn context from persisted
 * data, send the SHIPPING correction prompt to the SAME model the specimen used (reflection mode: no tools), and
 * run the SHIPPING adoption guard. Then measure, independently of the guard, whether anything changed OUTSIDE
 * the lines the prompt named. Prod is read only (default_transaction_read_only). Nothing is written to prod.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/replay-form-correction.ts --rows <replay-rows.jsonl> --out <dir>            # dry run: prompts only, $0
 *   npx ts-node -r tsconfig-paths/register scripts/replay-form-correction.ts --rows <replay-rows.jsonl> --out <dir> --spend    # real calls (~$1)
 *
 * `--rows` is the `--dump` output of scripts/replay-form-check.ts (so both scripts read the same corpus).
 *
 * CONTEXT RECONSTRUCTION — THE APPROXIMATION (state it in every report):
 *   system   = execution.config.systemPrompt (the template prompt persisted at claim). The live system prompt ALSO
 *              carried the protocol injection (domain protocol body); that text is not persisted per execution and is
 *              NOT re-rendered here (the current seed is a later version than the one the specimen ran under).
 *   user     = task.description (the brief). The live user message also carried chained context.
 *   (omitted)= every tool turn. Tool results are persisted truncated, and the correction pass is tool-less.
 *   assistant= the persisted finalResponse (the package).
 *   user     = the shipping correction prompt.
 * Effect: the model sees its package and the defect list, but not the protocol prose or the evidence it read.
 * For a copy-only correction that is the input that matters; for anything else it is a LOWER bound.
 *
 * GO CRITERION (coordinator 2026-10-07): ≥ 12 of 15 adopted, and 0 adopted outputs change anything outside the
 * named lines. "Named" is narrow on purpose (review M3): an undercount names its header line only.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { analyzePackageForm, triggerHits } from '../lib/agents/harness/package-form-check';
import { runFormCorrection, buildFormCorrectionPrompt, checkFormCorrectionAdoption } from '../lib/agents/harness/form-correction';
import { costForExecution } from '../lib/services/llm/model-pricing';
import { LLMProvider } from '../lib/services/llm/types';

interface Row { eid: string; tid: string; st: string; proto: string | null; approved: boolean | null; model: string | null; fr: string }
interface Ctx { eid: string; systemPrompt: string | null; maxTokens: number | null; temperature: number | null; description: string | null }

function fetchContexts(ids: string[]): Map<string, Ctx> {
  const list = ids.map((i) => `'${i.replace(/[^a-z0-9]/g, '')}'`).join(',');
  const sql = `SELECT row_to_json(t) FROM (SELECT e.id eid, e.config->>'systemPrompt' "systemPrompt",
    (e.config->>'maxTokens')::int "maxTokens", (e.config->>'temperature')::float temperature, c.description
    FROM agent_executions e JOIN tasks c ON c.id = e."taskId" WHERE e.id IN (${list})) t;`;
  const remote = 'cd /var/www/paichart-app/current && source .env.production && ' +
    'PGOPTIONS="-c default_transaction_read_only=on" psql "$DATABASE_URL" -At -P pager=off';
  const out = execFileSync('ssh', ['<PROD_USER>@<PROD_HOST>', remote], { input: sql, maxBuffer: 256 * 1024 * 1024 }).toString();
  const m = new Map<string, Ctx>();
  for (const l of out.split('\n')) if (l.trim().startsWith('{')) { const c = JSON.parse(l); m.set(c.eid, c); }
  return m;
}

/**
 * 0-based original line indices the prompt NAMED (review M3, 2026-10-07): an UNDERCOUNT names its header line ONLY —
 * its body is the content and must not move; a SHORT hunk names its header and its body (the body is what gets
 * replaced; the guard separately proves the replacement is a listed source span); a marker names its own line.
 * Every other changed line is collateral, adopted or not.
 */
function namedLines(text: string): Set<number> {
  const a = analyzePackageForm(text);
  const named = new Set<number>();
  for (const h of triggerHits(a)) {
    const b = a.blocks.find((x) => x.index === h.block)!;
    if (h.kind === 'hunk-count-mismatch' && h.hunkRange) {
      const short = h.observed!.old < h.declared!.old || h.observed!.new < h.declared!.new;
      const [at, end] = short ? h.hunkRange : [h.hunkRange[0], h.hunkRange[0] + 1];
      for (let k = at; k < end; k++) named.add(b.openLine + k); // body index k ⇒ 0-based package line openLine + k
    } else {
      named.add(h.line - 1);
    }
  }
  return named;
}

/** Line-level LCS diff. Returns original indices deleted, and insertions keyed by the original index they precede. */
function lineDiff(a: string[], b: string[]): { deleted: number[]; insertedBefore: number[] } {
  const n = a.length; const m = b.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const deleted: number[] = []; const insertedBefore: number[] = [];
  let i = 0; let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) { deleted.push(i++); } else { insertedBefore.push(i); j++; }
  }
  while (i < n) deleted.push(i++);
  while (j < m) { insertedBefore.push(n); j++; }
  return { deleted, insertedBefore };
}

/** 0-based index of the LAST `Confidence:` line outside fences (the guard lets its FORM change, never its number). */
function lastConfidenceLine(text: string): number {
  const a = analyzePackageForm(text);
  const inFence = new Set<number>();
  for (const bl of a.blocks) for (let k = bl.openLine - 1; k <= bl.closeLine - 1; k++) inFence.add(k);
  for (let k = a.lines.length - 1; k >= 0; k--) if (!inFence.has(k) && /\bconfidence\b\**\s*:/i.test(a.lines[k])) return k;
  return -1;
}

function collateral(original: string, corrected: string): { outside: number; samples: string[]; confidenceReformatted: boolean } {
  const a = original.split('\n'); const b = corrected.split('\n');
  const named = namedLines(original);
  // The confidence line is reported in its OWN column, never silently folded into "named".
  const conf = lastConfidenceLine(original);
  const { deleted, insertedBefore } = lineDiff(a, b);
  const confidenceReformatted = conf >= 0 && deleted.includes(conf);
  if (conf >= 0) named.add(conf);
  const samples: string[] = [];
  let outside = 0;
  for (const d of deleted) if (!named.has(d)) { outside++; if (samples.length < 4) samples.push(`- L${d + 1}: ${a[d].slice(0, 90)}`); }
  // An insertion is inside a named region when it sits between named lines (or directly after one).
  for (const k of insertedBefore) if (!named.has(k) && !named.has(k - 1)) { outside++; if (samples.length < 4) samples.push(`+ before L${k + 1}`); }
  return { outside, samples, confidenceReformatted };
}

/**
 * --rescore <outDir>: re-judge SAVED corrections with the CURRENT shipping guard and the M3 collateral metric. Reads
 * `<eid>.corrected.md` (and the call's stop reason / tokens / cost from `a5-results.json` when present) against the
 * ORIGINAL `fr` from --rows. No API call, $0. Use it whenever the guard changes after a paid run: the corrections are
 * the expensive part, the judgement is not.
 */
function rescore(rowsFile: string, dir: string): void {
  const rows: Row[] = fs.readFileSync(rowsFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const saved = fs.existsSync(path.join(dir, 'a5-results.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'a5-results.json'), 'utf8')) : { table: [] };
  const prior = new Map<string, any>((saved.table ?? []).map((t: any) => [t.eid, t]));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.corrected.md'));
  console.log(`🔁 rescore — ${files.length} saved corrections in ${dir} (no API calls, $0)\n`);
  const table: any[] = [];
  for (const f of files.sort()) {
    const eid = f.replace('.corrected.md', '');
    const r = rows.find((x) => x.eid === eid);
    if (!r) { console.log(`  ⚠️ ${eid}: not in --rows, skipped`); continue; }
    const corrected = fs.readFileSync(path.join(dir, f), 'utf8');
    const p = prior.get(eid) ?? {};
    const stop = p.stop ?? 'end_turn';
    const adoption = checkFormCorrectionAdoption({ original: r.fr, corrected, stopReason: stop });
    const col = corrected ? collateral(r.fr, corrected) : { outside: 0, samples: [], confidenceReformatted: false };
    const row = {
      eid, proto: (r.proto || '?').replace('-protocol', ''),
      hits: triggerHits(analyzePackageForm(r.fr)).map((h) => h.kind === 'hunk-count-mismatch' ? (h.extraBodyLines ? `undercount+${h.extraBodyLines}` : 'short-hunk') : 'marker-located').join('+'),
      stop, adopted: adoption.adopted, reason: adoption.notAdoptedReason ?? null, detail: adoption.detail ?? null,
      wasAdopted: p.adopted ?? null, wasReason: p.reason ?? null, outsideNamed: col.outside, samples: col.samples,
      confidenceReformatted: col.confidenceReformatted,
    };
    table.push(row);
    console.log(`${row.adopted ? '✅' : '❌'} ${eid} ${row.proto} ${row.hits} → ${row.adopted ? 'ADOPTED' : row.reason}` +
      `${row.detail ? ` (${row.detail})` : ''} · outside-named ${row.outsideNamed}` +
      `${row.confidenceReformatted ? ' · confidence line reformatted' : ''} · paid-run verdict: ${row.wasAdopted === null ? '?' : row.wasAdopted ? 'adopted' : row.wasReason}`);
    for (const smp of row.samples) console.log(`      ${smp}`);
  }
  const adopted = table.filter((t) => t.adopted);
  const collat = adopted.filter((t) => t.outsideNamed > 0);
  console.log(`\nadopted ${adopted.length}/${table.length} · adopted with change outside the named lines: ${collat.length}` +
    (saved.costTotal !== undefined ? ` · paid-run cost $${Number(saved.costTotal).toFixed(3)}` : ''));
  console.log(`GO criterion (≥12/15 adopted AND 0 collateral): ${adopted.length >= 12 && collat.length === 0 ? 'MET' : 'NOT MET'}`);
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const rowsFile = arg('--rows');
  const rescoreDir = arg('--rescore');
  if (rowsFile && rescoreDir) return rescore(rowsFile, rescoreDir);
  const outDir = arg('--out');
  if (!rowsFile || !outDir) throw new Error('usage: --rows <replay-rows.jsonl> (--out <dir> [--spend] [--only <eidPrefix>] | --rescore <outDir>)');
  const spend = args.includes('--spend');
  fs.mkdirSync(outDir, { recursive: true });

  const rows: Row[] = fs.readFileSync(rowsFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  let specimens = rows.filter((r) => triggerHits(analyzePackageForm(r.fr || '')).length > 0);
  if (arg('--only')) specimens = specimens.filter((r) => r.eid.startsWith(arg('--only')!));
  console.log(`🔧 replay-form-correction — ${specimens.length} specimens (${spend ? 'LIVE CALLS' : 'DRY RUN, $0'})\n`);
  const ctx = fetchContexts(specimens.map((s) => s.eid));

  // Live calls only: load the LOCAL .env (ANTHROPIC_API_KEY; llmService's import chain needs DATABASE_URL, the local
  // DB — nothing here writes to any database). Prod is reached only through the read-only ssh/psql above.
  if (spend) require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const { llmService } = spend ? await import('../lib/services/llm/llm-service') : { llmService: null as any };
  const table: any[] = [];
  let costTotal = 0; let inTotal = 0; let outTotal = 0;
  for (const s of specimens) {
    const c = ctx.get(s.eid);
    if (!c) throw new Error(`no execution context for ${s.eid}`);
    const prompt = buildFormCorrectionPrompt(analyzePackageForm(s.fr));
    fs.writeFileSync(path.join(outDir, `${s.eid}.prompt.md`), prompt);
    if (!spend) { table.push({ eid: s.eid, model: s.model, promptChars: prompt.length }); continue; }

    const brief = c.description || '(task description not persisted)';
    const messageHistory: any[] = [{ role: 'user', content: brief }];
    const totalUsage = { inputTokens: 0, outputTokens: 0 } as any;
    const cfg: any = {
      maxTokens: c.maxTokens ?? 24000, temperature: c.temperature ?? 0.3, topP: undefined, stopSequences: undefined,
      systemPrompt: c.systemPrompt ?? undefined, provider: LLMProvider.ANTHROPIC_SDK, model: s.model,
      apiKey: process.env.ANTHROPIC_API_KEY, webSearch: undefined, cacheControl: undefined, thinkingBudgetTokens: undefined,
    };
    let lastResponse: any = null;
    const r = await runFormCorrection({
      text: s.fr, currentResponse: { text: s.fr, stopReason: 'end_turn' }, messageHistory, totalUsage, prompt: brief,
      // No tool turns in this synthetic history (text-only assistant turn, no thinking blocks) ⇒ no tool set to repeat.
      normalizedLlmConfig: cfg, mcpFunctions: undefined, executionId: `a5-${s.eid}`, userId: undefined, force: true,
    }, {
      generateText: async (p: string, o: any, u?: string) => { lastResponse = await llmService.generateText(p, o, u); return lastResponse; },
      logger: { info: () => {}, warn: (o: any, m: string) => console.warn('  warn', m, o?.err ?? ''), error: (o: any, m: string) => console.warn('  error', m, o?.apiErrorMessage ?? '') },
    });
    const usage = lastResponse?.usage ?? {};
    const cost = costForExecution({ inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens, cacheCreationTokens: usage.cacheCreationTokens }, s.model, new Date()).costUsd ?? 0;
    costTotal += cost; inTotal += usage.inputTokens ?? 0; outTotal += usage.outputTokens ?? 0;
    const corrected = r.correctedText ?? '';
    fs.writeFileSync(path.join(outDir, `${s.eid}.corrected.md`), corrected);
    const col = corrected ? collateral(s.fr, corrected) : { outside: 0, samples: [], confidenceReformatted: false };
    const row = {
      eid: s.eid, date: s.st.slice(0, 10), proto: (s.proto || '?').replace('-protocol', ''), model: s.model,
      reviewer: s.approved === true ? 'approved' : s.approved === false ? 'refused' : '—',
      hits: triggerHits(analyzePackageForm(s.fr)).map((h) => h.kind === 'hunk-count-mismatch' ? (h.extraBodyLines ? `undercount+${h.extraBodyLines}` : 'short-hunk') : 'marker-located').join('+'),
      stop: lastResponse?.stopReason ?? null, adopted: !!r.correction.adopted, reason: r.correction.notAdoptedReason ?? null,
      detail: r.adoption?.detail ?? null, postHits: r.correction.postHitsTotal ?? null,
      outsideNamed: col.outside, outsideSamples: col.samples,
      inTok: usage.inputTokens ?? 0, outTok: usage.outputTokens ?? 0, costUsd: Number(cost.toFixed(4)), ms: r.correction.durationMs,
    };
    table.push(row);
    console.log(`${row.adopted ? '✅' : '❌'} ${s.eid} ${row.proto} ${row.model} ${row.hits} → ${row.adopted ? 'ADOPTED' : row.reason}` +
      `${row.detail ? ` (${row.detail})` : ''} · outside-named ${row.outsideNamed} · ${row.inTok}/${row.outTok} tok · $${row.costUsd}`);
  }
  fs.writeFileSync(path.join(outDir, 'a5-results.json'), JSON.stringify({ table, costTotal, inTotal, outTotal }, null, 2));
  if (spend) {
    const adopted = table.filter((t) => t.adopted);
    const collat = adopted.filter((t) => t.outsideNamed > 0);
    console.log(`\nadopted ${adopted.length}/${table.length} · adopted with change outside the named lines: ${collat.length} · ` +
      `tokens ${inTotal} in / ${outTotal} out · cost $${costTotal.toFixed(3)}`);
    console.log(`GO criterion (≥12/15 adopted AND 0 collateral): ${adopted.length >= 12 && collat.length === 0 ? 'MET' : 'NOT MET'}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
