/**
 * measure-r10-gaps.ts — READ-ONLY measurement for register R10-KEYNAME-BLIND and R10-ESCAPED-TAB-INDENT (2026-10-14).
 * Run through scripts/measure-r10-gaps.sh (prod tunnel, read-only session). Prints MASKED findings only — key, length,
 * a coarse shape class; never a value.
 *
 *  KEYNAME: an object key in R10's secret-key list (taken from R10's own JSON-quoted rule) whose value is a non-empty
 *           string that is not the placeholder — in a stored toolCalls result object, or inside a JSON string leaf.
 *  ESCAPED: a string leaf with literal \n / \t escapes whose UNESCAPED form R10 would now redact — i.e. a secret-shaped
 *           line that persisted unredacted because it was escaped when R10 saw it.
 */
import { Client } from 'pg';
import { redactArtifactSecrets, redactSecretsDeep, PLACEHOLDER, R10_RULE_SOURCES } from '../lib/agents/harness/redact-artifact-secrets';

// R10's own key alternation, lifted from its JSON-quoted rule so the measure cannot drift from the redactor.
const src = R10_RULE_SOURCES.find((s) => s.includes('"(?:password|passwd'));
if (!src) throw new Error('R10 JSON-quoted rule not found — measure would not match the redactor');
const alt = src.slice(src.indexOf('"(?:') + 4, src.indexOf(')"'));
const KEY_RE = new RegExp(`^(?:${alt})$`, 'i');

function shape(v: string): string {
  if (/^<[^>]*>$|^\*+$|redact|^x+$|example|placeholder|changeme|^\$\{|^\{\{/i.test(v)) return 'placeholder-like';
  if (/^[0-9a-f]{16,}$/i.test(v)) return 'hex';
  if (/^[A-Za-z0-9+/=_-]{20,}$/.test(v)) return 'token-like';
  if (/^\$\d\$|^[0-9]+$/.test(v)) return 'hash/numeric';
  return 'other';
}
type Hit = { kind: string; artifact: string; name: string; path: string; key?: string; len: number; shape?: string; extra?: number };
const hits: Hit[] = [];

/** FULL multi-level JSON-string decode (Stage B P1-3 fix, sec-ops v2 B-3): one level per pass (`\\X` pairs read left to
 *  right, so an escaped backslash is never mistaken for an escape), repeated until nothing decodes, at most 8 levels.
 *  The pre-fix tool decoded ONE level, so on a multi-backslash leaf R10 re-matched its OWN placeholder glued to the
 *  leftover backslashes and reported 'still missed' leaves that held no secret (R10-MULTI-ESCAPE-PREVIEW, withdrawn). */
function decodeFully(v: string): string {
  let u = v;
  for (let level = 0; level < 8; level++) {
    const next = u.replace(/\\(["\\nrt])/g, (_m, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '' : c));
    if (next === u) break;
    u = next;
  }
  return u;
}
/** Placeholders a redaction ADDED: a token that already started with the placeholder (R10 re-matching its own output
 *  glued to trailing characters) replaces one placeholder with one, so it counts 0 — the "skip placeholder-prefixed
 *  tokens" half of the fix. */
const countPh = (t: string) => t.split(PLACEHOLDER).length - 1;
const added = (before: string, after: string) => Math.max(0, countPh(after) - countPh(before));
let leaves = 0, escapedLeaves = 0, objs = 0, tabIndented = 0, nowCaught = 0, nowMissed = 0;
const dates: string[] = [];
const missedShapes: string[] = [];
const redactedLines = new Map<string, number>();

function walk(v: unknown, path: string, art: { id: string; name: string }, inSerial = false): void {
  if (typeof v === 'string') {
    leaves++;
    const t = v.trim();
    if (!inSerial && (t.startsWith('{') || t.startsWith('[')) && t.length < 2_000_000) {
      try { walk(JSON.parse(t), path + '«json»', art, true); } catch { /* not JSON */ }
    }
    if (v.includes('\\n') || v.includes('\\t')) {
      escapedLeaves++;
      const u = decodeFully(v);
      const r = redactArtifactSecrets(u);
      const n = added(u, r.redacted);
      if (n > 0) {
        hits.push({ kind: 'ESCAPED', artifact: art.id, name: art.name, path, len: v.length, extra: n });
        // Would TODAY's persist path (the deep walk, both arms) catch it? 0 ⇒ a CURRENT gap; > 0 ⇒ fixed since it was stored.
        const deep = redactSecretsDeep(v).value;
        if (typeof deep === 'string' && added(v, deep) > 0) nowCaught++; else { nowMissed++;
          missedShapes.push(`${art.id} ${path.slice(0, 70)} :: ` + r.redacted.split('\n').filter((l) => l.includes(PLACEHOLDER)).map((l) => l.trim().slice(0, 70)).join(' | ')); }
        dates.push((art as any).t);
      }
      if (n > 0) for (const line of r.redacted.split('\n')) if (line.includes(PLACEHOLDER)) {
        // SAFE to print: R10's own output — the value is already the placeholder. Collapse runs of whitespace.
        const shown = line.replace(/\s+/g, ' ').trim().slice(0, 140); redactedLines.set(shown, (redactedLines.get(shown) || 0) + 1);
        tabIndented += /\t/.test(line.slice(0, line.search(/\S/) + 1)) ? 1 : 0;
      }
    }
    return;
  }
  if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`, art, inSerial)); return; }
  if (v && typeof v === 'object') {
    objs++;
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (KEY_RE.test(k) && typeof x === 'string' && x.length > 0 && !x.includes(PLACEHOLDER)) {
        hits.push({ kind: 'KEYNAME', artifact: art.id, name: art.name, path: `${path}.${k}`, key: k, len: x.length, shape: shape(x) });
      }
      walk(x, `${path}.${k}`, art, inSerial);
    }
  }
}

async function main(): Promise<void> {
  // pg Client (NOT Prisma — Prisma drops the URL's read-only option): prove a write is refused (25006) before reading.
  const c = new Client({ connectionString: process.env.DATABASE_URL }); c.on('error', () => undefined); await c.connect();
  try { await c.query('CREATE TEMP TABLE _r10_ro_probe(x int)'); throw new Error('ABORT: a write was NOT refused'); }
  catch (e) { if (String((e as Error).message).startsWith('ABORT')) throw e; if ((e as { code?: string }).code !== '25006') throw new Error(`ABORT: probe failed with ${(e as { code?: string }).code}, not 25006`); }
  let after = ''; let n = 0;
  for (;;) {
    const { rows } = await c.query<{ id: string; name: string; t: string; content: string }>(
      `SELECT id, name, "createdAt"::text t, content FROM agent_artifacts WHERE name = 'result.json' AND id > $1 ORDER BY id LIMIT 200`, [after]);
    if (!rows.length) break;
    for (const r of rows) {
      n++;
      let j: any; try { j = JSON.parse(r.content || ''); } catch { continue; }
      if (Array.isArray(j?.toolCalls)) j.toolCalls.forEach((tc: any, i: number) => walk(tc?.result, `toolCalls[${i}].result`, r));
    }
    after = rows[rows.length - 1].id;
  }
  const by = (k: string) => hits.filter((h) => h.kind === k);
  console.log(JSON.stringify({ resultJsonScanned: n, stringLeaves: leaves, objects: objs, escapedLeaves,
    keyName: { hits: by('KEYNAME').length, byKey: tally(by('KEYNAME').map((h) => h.key!.toLowerCase())), byShape: tally(by('KEYNAME').map((h) => h.shape!)) },
    escaped: { hits: by('ESCAPED').length, artifacts: new Set(by('ESCAPED').map((h) => h.artifact)).size } }, null, 2));
  dates.sort(); console.log(`ESCAPED: caught by today's deep walk ${nowCaught}, STILL MISSED today ${nowMissed}; stored ${dates[0]} → ${dates[dates.length - 1]}`);
  for (const m of missedShapes) console.log(`  STILL-MISSED ${m}`);
  console.log(`ESCAPED redacted lines (R10 output, values already placeholders): tab-indented ${tabIndented}`);
  for (const [l, c] of [...redactedLines].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${c}\t${l}`);
  if (process.env.SHOW_HITS) for (const h of hits.slice(0, 60)) console.log(`${h.kind}\t${h.artifact}\t${h.path.slice(0, 120)}\tlen=${h.len}\t${h.shape ?? ''}\t${h.extra ?? ''}`);
  await c.end();
}
function tally(a: string[]): Record<string, number> { return a.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {} as Record<string, number>); }
main().catch((e) => { console.error(e); process.exit(1); });
