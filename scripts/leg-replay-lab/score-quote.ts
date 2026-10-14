/**
 * Leg replay lab — HARVESTER QUOTE SCORE (VERBATIM-QUOTE-OMISSION group C lab, 2026-10-13). $0, offline.
 *
 * Per sample, per fenced block, which file a quote reproduces and how faithfully — composed ONLY from the shipping
 * `computeQuoteFidelity` (harvest point). Nothing here aligns, pairs or classifies lines of its own.
 *
 * WHY MORE THAN THE STAMPED FACT. The fact answers its own question: a finding is an omission/added/stripped line in a
 * block LABELLED verbatim, or an edited line in any block (its rule 1). That is right for production and wrong as the
 * C1 score: an UNLABELLED block that silently drops the header reads clean, so a Harvester that only stops writing the
 * word "verbatim" would pass. C1 asks for the whole file or a labelled excerpt with `# [elided: …]` at each gap. So the
 * score also reads every block STRICTLY — the same function over the same block with a verbatim label prepended, which
 * makes every unexempted omission a finding while the fact's own exemptions (named elision markers, whole top-level
 * units, comments beside an excerpt) still apply. Both readings are reported; neither replaces the stamped fact.
 *
 * ISOLATION. Each block is scored alone (every other block's body blanked, fences kept so no label leaks across), and
 * against ONE file tool's raw documents at a time, so a clean block still says which file it quotes — the stamped fact
 * names a source only on a finding.
 *
 * STANDALONE (read-only against production, $0; the run 3 live control's P1/S2 reader):
 *   npx ts-node -r tsconfig-paths/register scripts/leg-replay-lab/score-quote.ts <executionId>[,<executionId>…] [--json]
 * Reads each execution's newest result.json over the lab's read-only psql channel and prints, per execution: the stamped
 * quoteFidelity (if any), the score, and per block the file it quotes, its label claim and its strict findings.
 * P1 = `faithful: true`; S2 = `addedInVerbatimFile > 0` or any strict `added` > 0, or `editedLines > 0`.
 */
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'postgresql://leg-replay-lab:never@127.0.0.1:1/never_connects';
if (!process.env.PAICHART_SKIP_DB_CONNECT) process.env.PAICHART_SKIP_DB_CONNECT = 'true';
if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'warn';
import { computeQuoteFidelity } from '../../lib/agents/harness/quote-fidelity';
import { fencedBlockLines } from '../../lib/agents/harness/dialect-lint';
import { RECORDED_FILE_TOOLS } from './recorded-tools';

/** The label line the strict reading prepends — matches VERBATIM_CLAIM_RE, carries no negation. */
export const STRICT_LABEL = 'Strict reading: verbatim.';
const MARKER_HEADING_RE = /^\s{0,3}#{1,6}\s*(Harvested Allocations|Derived Values|Consumed Values)\b/gim;

const innerToolOf = (tc: any): string | null => {
  let a = tc?.arguments;
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = null; } }
  return tc?.tool === 'services' && typeof a?.tool === 'string' ? a.tool : null;
};

interface Block { blockLine: number; lines: number[] }
function blocksOf(text: string): Block[] {
  const out: Block[] = [];
  let prev = -99;
  for (const b of fencedBlockLines(text)) {
    if (!out.length || b.line !== prev + 1) out.push({ blockLine: b.line - 1, lines: [] });
    out[out.length - 1].lines.push(b.line);
    prev = b.line;
  }
  return out;
}

export interface BlockScore {
  blockLine: number;
  /** The file tool whose raw this block pairs with (first in RECORDED_FILE_TOOLS order), or null (not a file quote). */
  tool: string | null;
  claim: 'verbatim' | 'none' | null;
  /** Shipping reading (the stamped fact's rule): totals of this block's finding, or null when it has none. */
  finding: { omittedComment: number; omittedContent: number; adjacentComment: number; changed: number; added: number; edited: number; inlineStripped: number; escalates: boolean } | null;
  /** Strict reading: the same block labelled verbatim. Null = no unexempted gap, change or addition. */
  strict: { omittedComment: number; omittedContent: number; adjacentComment: number; changed: number; added: number; edited: number } | null;
  elisions: { named: number; wholeUnit: number; adjacentToExcerpt: number };
}

export interface QuoteScore {
  blocks: BlockScore[];
  fileBlocks: number;
  /** Every file-lane block reads clean STRICTLY, and there is at least one (a harvest that quotes no file is not faithful). */
  faithful: boolean;
  fileBlocksStrictClean: number;
  verbatimFileFindings: number;
  /** G-H-ADD: file-lane blocks labelled verbatim that carry an added line (a note written inside the fence). */
  addedInVerbatimFile: number;
  /** G-H-CORRUPT: edited lines (the `$remote_actr` class) in ANY block, shipping reading. */
  editedLines: number;
  /** A verbatim-labelled block that also carries a named elision marker — label truthfulness, a subcount to read. */
  verbatimLabelledExcerpts: number;
  prometheusBlocks: number;
  prometheusVerbatimLabelled: number;
  prometheusChangedLines: number;
  markerHeadings: number;
  chars: number;
}

export function scoreHarvesterQuotes(text: string, toolCalls: unknown): QuoteScore {
  const lines = text.split('\n');
  const tcs = Array.isArray(toolCalls) ? toolCalls : [];
  const byTool = new Map(RECORDED_FILE_TOOLS.map((t) => [t, tcs.filter((tc) => innerToolOf(tc) === t)]));
  const blocks: BlockScore[] = [];
  for (const b of blocksOf(text)) {
    const keep = new Set(b.lines);
    const others = new Set(blocksOf(text).flatMap((x) => x.lines).filter((l) => !keep.has(l)));
    const isolated = lines.map((l, i) => (others.has(i + 1) ? '' : l));
    const strictDoc = [...isolated.slice(0, b.blockLine - 1), STRICT_LABEL, ...isolated.slice(b.blockLine - 1)].join('\n');
    let score: BlockScore = { blockLine: b.blockLine, tool: null, claim: null, finding: null, strict: null, elisions: { named: 0, wholeUnit: 0, adjacentToExcerpt: 0 } };
    for (const [tool, calls] of byTool) {
      if (!calls.length) continue;
      const f: any = computeQuoteFidelity({ point: 'harvest', deliverable: isolated.join('\n'), toolCalls: calls });
      if (f.blocks?.pairable !== 1) continue;
      const s: any = computeQuoteFidelity({ point: 'harvest', deliverable: strictDoc, toolCalls: calls });
      const tot = (x: any) => x ? {
        omittedComment: x.totals.omittedComment, omittedContent: x.totals.omittedContent, adjacentComment: x.totals.adjacentComment,
        changed: x.totals.changed, added: x.totals.added, edited: x.changed.filter((c: any) => c.kind === 'edited').length,
      } : null;
      const ff = (f.findings ?? [])[0] ?? null;
      const sf = (s.findings ?? []).find((x: any) => x.escalates) ?? null;
      score = {
        blockLine: b.blockLine, tool, claim: f.claims?.verbatim ? 'verbatim' : 'none',
        finding: ff ? { ...tot(ff)!, inlineStripped: ff.changed.filter((c: any) => c.kind === 'inline-comment-stripped').length, escalates: ff.escalates } : null,
        strict: tot(sf),
        elisions: { named: f.elisions?.named ?? 0, wholeUnit: f.elisions?.wholeUnit ?? 0, adjacentToExcerpt: f.elisions?.adjacentToExcerpt ?? 0 },
      };
      break;
    }
    blocks.push(score);
  }
  const fileLane = blocks.filter((b) => b.tool && b.tool !== 'get_prometheus_config');
  const prom = blocks.filter((b) => b.tool === 'get_prometheus_config');
  const strictClean = fileLane.filter((b) => !b.strict).length;
  return {
    blocks,
    fileBlocks: fileLane.length,
    faithful: fileLane.length > 0 && strictClean === fileLane.length,
    fileBlocksStrictClean: strictClean,
    verbatimFileFindings: fileLane.filter((b) => b.claim === 'verbatim' && b.finding?.escalates).length,
    addedInVerbatimFile: fileLane.filter((b) => b.claim === 'verbatim' && (b.finding?.added ?? 0) > 0).length,
    editedLines: blocks.reduce((n, b) => n + (b.finding?.edited ?? 0), 0),
    verbatimLabelledExcerpts: blocks.filter((b) => b.claim === 'verbatim' && b.elisions.named > 0).length,
    prometheusBlocks: prom.length,
    prometheusVerbatimLabelled: prom.filter((b) => b.claim === 'verbatim').length,
    prometheusChangedLines: prom.reduce((n, b) => n + (b.finding?.edited ?? 0), 0),
    markerHeadings: (text.match(MARKER_HEADING_RE) ?? []).length,
    chars: text.length,
  };
}

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { runReadOnlySql } = require('./snapshot') as typeof import('./snapshot');
  const ids = (process.argv[2] ?? '').split(',').filter(Boolean);
  const asJson = process.argv.includes('--json');
  if (!ids.length || ids.some((i) => !/^[a-z0-9]{20,40}$/.test(i))) {
    console.error('usage: score-quote.ts <executionId>[,<executionId>…] [--json]');
    process.exit(2);
  }
  const out: Record<string, unknown> = {};
  for (const id of ids) {
    const raw = runReadOnlySql(`SELECT a.content FROM agent_artifacts a WHERE a."executionId" = '${id}' AND a.name = 'result.json' ORDER BY a."createdAt" DESC LIMIT 1;`).trim();
    if (!raw.startsWith('{')) { out[id] = { error: 'no result.json for this execution' }; continue; }
    const r = JSON.parse(raw);
    const score = scoreHarvesterQuotes(r.finalResponse ?? '', r.toolCalls ?? []);
    const qf = r.quoteFidelity ?? null;
    const strictAdded = score.blocks.reduce((n, b) => n + (b.strict?.added ?? 0), 0);
    out[id] = {
      agentRole: r.agentRole ?? null, stopReason: r.toolLoop?.finalStopReason ?? null,
      stampedQuoteFidelity: qf ? { reason: qf.reason, escalating: qf.blocks?.escalating ?? 0, disposition: qf.quoteFidelityDisposition?.disposition } : null,
      P1_faithful: score.faithful, S2: { addedInVerbatimFile: score.addedInVerbatimFile, strictAddedLines: strictAdded, editedLines: score.editedLines, fires: score.addedInVerbatimFile > 0 || strictAdded > 0 || score.editedLines > 0 },
      score: { ...score, blocks: score.blocks.filter((b) => b.tool) },
    };
  }
  if (asJson) console.log(JSON.stringify(out, null, 2));
  else for (const [id, v] of Object.entries<any>(out)) {
    if (v.error) { console.log(`${id}: ${v.error}`); continue; }
    console.log(`${id} (${v.agentRole}, stop ${v.stopReason}) · stamped ${v.stampedQuoteFidelity ? `${v.stampedQuoteFidelity.reason} / escalating ${v.stampedQuoteFidelity.escalating}` : 'none'} · P1 faithful ${v.P1_faithful} · S2 ${v.S2.fires ? 'FIRES' : 'clear'} (verbatim+added ${v.S2.addedInVerbatimFile}, strict added ${v.S2.strictAddedLines}, edited ${v.S2.editedLines}) · file blocks ${v.score.fileBlocksStrictClean}/${v.score.fileBlocks} strict-clean · prometheus ${v.score.prometheusBlocks} (labelled verbatim ${v.score.prometheusVerbatimLabelled}) · markers ${v.score.markerHeadings}`);
    for (const b of v.score.blocks) console.log(`   L${b.blockLine} ${b.tool} claim ${b.claim} · strict ${b.strict ? JSON.stringify(b.strict) : 'clean'} · elisions named ${b.elisions.named} wholeUnit ${b.elisions.wholeUnit} adjacentToExcerpt ${b.elisions.adjacentToExcerpt}`);
  }
}
