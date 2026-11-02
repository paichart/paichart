/**
 * measure-r10-echo.ts — $0, READ-ONLY corpus measure for R10 v8 ECHO REDACTION (register R10-ECHO-REDACTION).
 *
 * Runs the SHIPPING persist redaction (`redactArtifactsForPersist`) over stored LAB samples, which are RAW (pre-R10): a Harvester
 * sample is { finalResponse: <role>.md, toolCalls: toolCalls.json } with report.md = finalResponse (as score-n1's canary does);
 * every other role output (author/reviewer, pre-correction, correction-raw) is a finalResponse-only execution.
 *
 * Reports, per population:
 *   - executions, keyed tokens collected (the echo source), eligible literals, executions with ≥ 1 echo, echo hits by location;
 *   - EVERY echo hit with its context (the line, redacted by v8, with the hit marked «ECHO») — the hand-read list for the
 *     false-redaction count; the literal is MASKED to its length unless `--unmask` is passed (only for synthetic lab values or a
 *     public corpus);
 *   - the guard's rejections by reason, with the rejected literals of the two contested classes (short 4..7, letters-only),
 *     so the minimum length is justified from the corpus, not asserted;
 *   - the NAIVE comparator: echo hits with no guard at all (any token ≥ 1 char), to show what the guard removes.
 * `--files <listFile>` instead: every listed file (one path per line) is one execution whose single tool result is the file text
 * (the SELF-echo measure on a config / repo corpus: a value a rule redacted in the file, reappearing bare in the same file).
 * Usage: npx tsx scripts/measure-r10-echo.ts (--lab <runsDir> | --files <listFile>) [--unmask] [--max-shown N]
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  PLACEHOLDER, redactSecretsDeep, redactArtifactSecrets, redactArtifactsForPersist, buildEchoMatcher, echoLiteralsFor,
  ECHO_MIN_LENGTH, ECHO_MIN_LETTERS_ONLY,
} from '../lib/agents/harness/redact-artifact-secrets';

const argv = process.argv.slice(2);
const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const filesList = arg('--files');
const runsDir = arg('--lab') ?? (filesList ? path.dirname(filesList) : undefined);
if (!runsDir) { console.error('usage: (--lab <runsDir> | --files <listFile>) [--unmask] [--max-shown N]'); process.exit(2); }
const mask = !argv.includes('--unmask'); // sec-ops R10v8 SF-7: values are MASKED by default; --unmask only for synthetic lab/public corpora
const maxShown = Number(arg('--max-shown') ?? 500);

const OUTPUT_ROLES = ['harvester.md', 'author.md', 'reviewer.md', 'author.pre-correction.md', 'author.correction-raw.md'];

function* sampleDirs(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = path.join(dir, e.name);
    if (/^sample-\d+$/.test(e.name)) yield p; else yield* sampleDirs(p);
  }
}

function rejectReason(l: string): string {
  if (l.length < ECHO_MIN_LENGTH) return `short(<${ECHO_MIN_LENGTH})`;
  if (/\s/.test(l)) return 'whitespace';
  if (l.includes(PLACEHOLDER) || l.includes('<<') || l.includes('>>')) return 'placeholder';
  if (/^[\d.:\/,+\-]+$/.test(l)) return 'number-like';
  if (/^(.)\1*$/s.test(l)) return 'repeated';
  if (/^(?:\$\{|\{\{|\$\()/.test(l)) return 'reference';
  if (/^<[^<>]*>$/.test(l)) return 'angle-placeholder';
  if (/^(?:~|\.{1,2})?\/[\w.\/-]+$/.test(l)) return 'path';
  if (/[()[\]{}]|\|\||&&|=>|\.\.\.|\u2026/.test(l)) return 'code-syntax';
  if (/^(?!eyJ)[A-Za-z_]\w*(?:\??\.[A-Za-z_]\w*)+$/.test(l) && (l.match(/\d/g) ?? []).length <= 1) return 'member-access';
  if (/^(?:\$[A-Z][A-Z0-9_]*|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)$/.test(l)) return 'constant-name';
  if (/^arn:/.test(l)) return 'arn';
  if (/^[A-Za-z]+$/.test(l.replace(/[-_.]/g, ''))) return l.replace(/[-_.]/g, '').length < ECHO_MIN_LETTERS_ONLY ? 'letters-only-short' : 'letters-only-single-case';
  return 'stopword/other';
}

function strip(t: string): string {
  let s = t;
  for (let k = 0; k < 4; k++) { const b = s; s = s.replace(/^\\*["'`]/, '').replace(/(?:\\*["'`][}\])]*|[;,])$/, ''); if (s === b) break; }
  return s;
}

const totals = {
  executions: 0, withToolCalls: 0, keyedTokens: 0, eligibleLiterals: 0, execWithEcho: 0,
  echoHits: { toolCalls: 0, finalResponse: 0, reportMd: 0, other: 0 }, naiveHits: 0, naiveExecWithEcho: 0,
  rejected: {} as Record<string, number>,
};
const contested: Record<string, Map<string, number>> = { short: new Map(), lettersOnly: new Map(), code: new Map() };
const shown: string[] = [];

/** Count echo hits per location by diffing base (no echo) and v8 outputs — a placeholder present in v8 and not in base. */
function countLoc(base: unknown, cur: unknown, where: string, out: Record<string, number>, ctx: string[], lit: (s: string) => string): void {
  if (typeof base === 'string' && typeof cur === 'string') {
    if (base === cur) return;
    const loc = where.startsWith('$.toolCalls') ? 'toolCalls' : where === '$.finalResponse' ? 'finalResponse' : where === 'reportMd' ? 'reportMd' : 'other';
    const n = cur.split(PLACEHOLDER).length - base.split(PLACEHOLDER).length;
    out[loc] = (out[loc] ?? 0) + n;
    const bl = base.split('\n'); const cl = cur.split('\n');
    for (let i = 0; i < cl.length; i++) if (bl[i] !== cl[i]) ctx.push(`${loc} :: ${lit(bl[i] ?? '')}`);
    return;
  }
  if (Array.isArray(base) && Array.isArray(cur)) { base.forEach((b, i) => countLoc(b, cur[i], `${where}[${i}]`, out, ctx, lit)); return; }
  if (base && cur && typeof base === 'object' && typeof cur === 'object') {
    for (const k of Object.keys(base as object)) countLoc((base as Record<string, unknown>)[k], (cur as Record<string, unknown>)[k], `${where}.${k}`, out, ctx, lit);
  }
}

type Exec = { dir: string; role: string; obj: Record<string, unknown>; report: string | null; withTc: boolean };
function* executions(): Generator<Exec> {
  if (filesList) {
    for (const f of fs.readFileSync(filesList, 'utf8').split('\n').filter(Boolean)) {
      let text = ''; try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
      if (text.includes('\u0000')) continue;
      yield { dir: f, role: 'file', obj: { toolCalls: [{ tool: 'services', result: { content: [{ type: 'text', text }] } }] }, report: null, withTc: true };
    }
    return;
  }
  for (const dir of sampleDirs(runsDir as string)) {
    const tcPath = path.join(dir, 'toolCalls.json');
    let toolCalls: unknown[] | null = null;
    if (fs.existsSync(tcPath)) { try { const j = JSON.parse(fs.readFileSync(tcPath, 'utf8')); if (Array.isArray(j)) toolCalls = j; } catch { /* unreadable */ } }
    for (const role of OUTPUT_ROLES) {
      const p = path.join(dir, role);
      if (!fs.existsSync(p)) continue;
      const fr = fs.readFileSync(p, 'utf8');
      const withTc = role === 'harvester.md' && toolCalls !== null;
      yield { dir, role, obj: withTc ? { finalResponse: fr, toolCalls } : { finalResponse: fr }, report: fr, withTc };
    }
  }
}

for (const { dir, role, obj, report, withTc } of executions()) {
  {
    const fr = report;
    totals.executions++; if (withTc) totals.withToolCalls++;
    // Base = the v7 persist (pass 1 only), collecting the keyed tokens.
    const sink = new Set<string>();
    const bj = redactSecretsDeep(obj, sink).value;
    const bm = fr === null ? null : redactArtifactSecrets(fr, sink).redacted;
    totals.keyedTokens += sink.size;
    const lits = new Set<string>();
    for (const t of sink) {
      const s = strip(t);
      const shipped = echoLiteralsFor(t); // the SHIPPING literal forms (the counts below describe what the persist matches)
      if (shipped.length) for (const l of shipped) lits.add(l);
      else {
        const why = rejectReason(s);
        totals.rejected[why] = (totals.rejected[why] ?? 0) + 1;
        if (why.startsWith('short') && s.length >= 4) contested.short.set(s, (contested.short.get(s) ?? 0) + 1);
        if (why.startsWith('letters-only')) contested.lettersOnly.set(s, (contested.lettersOnly.get(s) ?? 0) + 1);
        if (['code-syntax', 'member-access', 'constant-name', 'arn', 'path'].includes(why)) contested.code.set(s, (contested.code.get(s) ?? 0) + 1);
      }
    }
    totals.eligibleLiterals += lits.size;
    const cur = redactArtifactsForPersist(obj, fr);
    const loc: Record<string, number> = {};
    const ctx: string[] = [];
    const lit = (line: string) => {
      // mark each eligible literal in the BASE line (the line before the echo pass) with «ECHO:<lit|masked>»
      let s = line;
      for (const l of [...lits].sort((a, b) => b.length - a.length)) {
        s = s.split(l).join(`«ECHO:${mask ? `${l.length}ch` : l}»`);
      }
      const at = s.indexOf('«ECHO');
      const from = at > 120 ? at - 120 : 0;
      return (from ? '…' : '') + s.slice(from).replace(/\s+/g, ' ').trim().slice(0, 260);
    };
    countLoc(bj, cur.resultJson, '$', loc, ctx, lit);
    if (bm !== null) countLoc(bm, cur.reportMd, 'reportMd', loc, ctx, lit);
    const hits = Object.values(loc).reduce((a, b) => a + b, 0);
    if (hits !== cur.echoRedactedCount) shown.push(`!! count mismatch ${dir}/${role}: diff ${hits} vs echoRedactedCount ${cur.echoRedactedCount}`);
    if (hits > 0) {
      totals.execWithEcho++;
      for (const [k, v] of Object.entries(loc)) (totals.echoHits as Record<string, number>)[k] += v;
      for (const c of ctx) if (shown.length < maxShown) shown.push(`${filesList ? dir : path.relative(runsDir as string, dir)}/${role} ${c}`);
    }
    // NAIVE: no guard — every collected token (stripped), any length, literal substring count over base outputs.
    const naive = [...sink].map(strip).filter((s) => s.length > 0 && !s.includes(PLACEHOLDER));
    let nh = 0;
    const scan = (v: unknown): void => {
      if (typeof v === 'string') { for (const l of naive) nh += v.split(l).length - 1; return; }
      if (Array.isArray(v)) v.forEach(scan); else if (v && typeof v === 'object') Object.values(v).forEach(scan);
    };
    scan(bj); if (bm !== null) scan(bm);
    totals.naiveHits += nh; if (nh > 0) totals.naiveExecWithEcho++;
  }
}

// Sanity: the build's matcher must agree with echoEligible on the contested sets (no accidental admission).
for (const m of Object.values(contested)) for (const l of m.keys()) if (buildEchoMatcher([l])) shown.push(`!! guard leak: ${l}`);

console.log(JSON.stringify(totals, null, 2));
const fmt = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${mask ? `${k.length}ch` : k}×${v}`).join(', ');
console.log(`rejected short (4..${ECHO_MIN_LENGTH - 1} chars): ${fmt(contested.short) || '(none)'}`);
console.log(`rejected letters-only: ${fmt(contested.lettersOnly) || '(none)'}`);
console.log(`rejected code / path / constant / arn: ${fmt(contested.code) || '(none)'}`);
console.log(`--- echo hits (line before the echo pass; «ECHO:…» marks each eligible literal) ---`);
for (const s of shown) console.log(s);
