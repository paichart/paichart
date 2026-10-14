/**
 * raw-tool-witness.ts — what an execution's tool calls ACTUALLY RETURNED, as text documents. Pure, zero-DB.
 *
 * Shared by two facts that ask different questions of the same witness (VERBATIM-QUOTE-OMISSION, 2026-10-13;
 * cline_docs/reviews/verbatim-quote-omission-2026-10-13/):
 *   - `quoteFidelity`       — does a quote in a deliverable reproduce a span of a raw result? (pairing + alignment)
 *   - `rollbackContainment` — is each restore line present in what this leg witnessed? (membership; E1 moved its
 *                             witness here from the Harvester's finalResponse, which is a TRANSCRIPTION, not a witness:
 *                             on 2026-10-01 the transcription said `$remote_actr` and the net certified it 19/19.)
 * One extractor for both, deliberately — two extractors of "what the tool returned" is the two-extractor drift class.
 *
 * ── WHAT IT READS ────────────────────────────────────────────────────────────────────────────────────────────────
 * `result.json.toolCalls[].result`, every string leaf, recursively. A string that is itself JSON is parsed and walked —
 * that is how a service's `structuredContent.files["otlp-ingress.conf"]` body is reached. Each string leaf is one
 * document, split on `\n`.
 *
 * ⚠️ `toolCalls[].result` is the PRE-R9 raw payload (sanitize-chained-output.ts: "RAW, UNSANITIZED PAYLOADS ARE
 * PERSISTED BY DESIGN"). The model saw the R9-sanitised form. So every raw line carries an ALTERNATE FORM — its
 * shipping-sanitizer rendering — whenever the call was stamped `rewritten`, and a consumer accepts either. The
 * sanitiser is applied PER LINE: site A sanitises the whole JSON envelope, so a pattern spanning a line break is not
 * reproduced here. That residue is named, not hidden: `rewritten` rides on every document a consumer reports.
 *
 * ⚠️ TWO TRUNCATIONS, both NAMED on the document, never silent:
 *   - persisted (`{truncated:true, preview}` — >50 KB at persist): only the preview's complete string literals are
 *     recoverable; lines past it are not witnessed here. The platform's own `note` is NOT walked (it is not a result).
 *   - in-loop (`resultTruncatedForLlm`): the persisted result is whole, but the model saw an 8 KB prefix, so a quote
 *     that stops short of the document is not the model's omission.
 */
import { sanitizeChainedOutput } from './sanitize-chained-output';

export interface RawToolDocument {
  /** Index into `toolCalls`. */
  call: number;
  /** `<service>.<tool>` for a `services` call, else the platform tool name. */
  tool: string;
  /** Key path inside the result (`…structuredContent.files.otlp-ingress.conf`) — how a file-artifact lane is read. */
  path: string;
  lines: string[];
  persistTruncated: boolean;
  llmTruncated: boolean;
  /** The call was stamped `rewritten` by R9 site A: each line also matches its sanitised form. */
  rewritten: boolean;
}

const STR_LIT = /"((?:[^"\\]|\\.)*)"/g;

function toolNameOf(tc: Record<string, unknown>): string {
  const base = typeof tc.tool === 'string' ? tc.tool : typeof tc.name === 'string' ? tc.name : '?';
  let a: unknown = tc.arguments;
  if (typeof a === 'string') {
    try { a = JSON.parse(a); } catch { a = null; }
  }
  if (a && typeof a === 'object' && typeof (a as Record<string, unknown>).tool === 'string') {
    const ar = a as Record<string, unknown>;
    return `${typeof ar.targetService === 'string' ? ar.targetService : '?'}.${ar.tool as string}`;
  }
  return base;
}

function walk(v: unknown, path: string, out: Array<{ path: string; text: string }>, trunc: { hit: boolean }): void {
  if (typeof v === 'string') {
    const st = v.trimStart();
    if ((st.startsWith('{') || st.startsWith('[')) && st.length > 2) {
      try { walk(JSON.parse(st), path, out, trunc); return; } catch { /* not JSON — a document */ }
    }
    out.push({ path, text: v });
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => walk(x, `${path}[${i}]`, out, trunc));
    return;
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (o.truncated === true && typeof o.preview === 'string') {
      // Partial JSON: recover every COMPLETE string literal. The platform's `note` beside it is not a result.
      trunc.hit = true;
      for (const m of o.preview.matchAll(STR_LIT)) {
        let s: unknown;
        try { s = JSON.parse(`"${m[1]}"`); } catch { continue; }
        walk(s, `${path}.preview`, out, trunc);
      }
      return;
    }
    for (const [k, x] of Object.entries(o)) walk(x, path ? `${path}.${k}` : k, out, trunc);
  }
}

/** Every string leaf of every tool result, as a document. Never throws on a malformed entry — it skips it. */
export function extractRawToolDocuments(toolCalls: unknown): RawToolDocument[] {
  if (!Array.isArray(toolCalls)) return [];
  const docs: RawToolDocument[] = [];
  toolCalls.forEach((tc, call) => {
    if (!tc || typeof tc !== 'object') return;
    const t = tc as Record<string, unknown>;
    if (t.result == null) return;
    const strs: Array<{ path: string; text: string }> = [];
    const trunc = { hit: false };
    walk(t.result, '', strs, trunc);
    const tool = toolNameOf(t);
    for (const s of strs) {
      docs.push({
        call, tool, path: s.path, lines: s.text.split('\n'),
        persistTruncated: trunc.hit,
        llmTruncated: t.resultTruncatedForLlm === true,
        rewritten: t.rewritten === true,
      });
    }
  });
  return docs;
}

/** NFKC + trim: the comparison form used on BOTH sides of every match in this domain's witness reads. */
export function normLine(s: string): string {
  return s.normalize('NFKC').trim();
}

/**
 * The forms a raw line may legitimately be quoted as: itself, and — when R9 rewrote the call — its sanitised
 * rendering. Both NFKC + trimmed. Returned de-duplicated; the first is always the raw form.
 */
export function acceptableForms(line: string, rewritten: boolean): string[] {
  const raw = normLine(line);
  if (!rewritten || !raw) return [raw];
  const san = normLine(sanitizeChainedOutput(line).text);
  return san && san !== raw ? [raw, san] : [raw];
}

export interface RawWitness {
  /** Every non-blank trimmed line the tool calls returned, plus each rewritten call's sanitised form. */
  lines: Set<string>;
  calls: number;
  persistTruncatedCalls: number;
  rewrittenCalls: number;
}

/**
 * The membership witness `rollbackContainment` reads (E1). TRIMMED EXACT LINE, the net's existing matching rule —
 * NFKC is NOT applied to the raw form here, because the restore lines it is compared with are trimmed only; the
 * sanitised alternate (which IS NFKC'd, as R9 does) covers what the model was actually shown.
 */
export function buildRawWitness(toolCalls: unknown): RawWitness {
  const docs = extractRawToolDocuments(toolCalls);
  const lines = new Set<string>();
  const calls = new Set<number>();
  const truncCalls = new Set<number>();
  const rwCalls = new Set<number>();
  for (const d of docs) {
    calls.add(d.call);
    if (d.persistTruncated) truncCalls.add(d.call);
    if (d.rewritten) rwCalls.add(d.call);
    for (const l of d.lines) {
      const t = l.trim();
      if (!t) continue;
      lines.add(t);
      if (d.rewritten) {
        const s = sanitizeChainedOutput(l).text.trim();
        if (s) lines.add(s);
      }
    }
  }
  return { lines, calls: calls.size, persistTruncatedCalls: truncCalls.size, rewrittenCalls: rwCalls.size };
}
