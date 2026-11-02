/**
 * replay-r10-versions.ts — READ-ONLY before/after replay of an R10 version change over stored production text
 * (PLATFORM-HELD-BYTES Stage B push 1, P1-3; sec-ops v2 S-3(g), v3 NB-1). Run through scripts/replay-r10-versions.sh,
 * which extracts the BASE R10 module from git (default HEAD) into a temp file and passes its path as R10_BASE.
 *
 * Populations (every stored row, paged by id):
 *   result.json  through redactSecretsDeep (the persist path, both arms)
 *   report.md    through redactArtifactSecrets (the persist path's markdown arm)
 *   held_blobs   through redactArtifactSecrets (the held capture's plain arm; a blob is already R10 output, so a move
 *                here means v3 would hash the file differently — G-HOLD-ID)
 *   persist      R10 v8 (2026-10-24): each execution's result.json PAIRED with its report.md through redactArtifactsForPersist
 *                (the shipping persist call, both passes) — the only population that exercises the ECHO pass, whose source is
 *                the whole persist. `echoHits` counts the current tree's echo placeholders (0 on a base without the field).
 *   pager        R10 v9 (2026-10-26, R-1): every stored read_more window whose PREDECESSOR window of the same ref is stored too
 *                (its end = this window's offset) — the CURRENT tree's R10 over `lead + window` (lead = the predecessor's tail back
 *                to its last line start, pagerPersistLead) against the window alone. `pagerHits` = placeholders the lead adds,
 *                i.e. stored values a window boundary split (the leak R-1 closes). Masked: the redacted line only.
 * R10 v9 (R-2): object KEYS are compared too (by position — a redacted key keeps its insertion order), and a ` #n` collision
 * suffix the current tree adds is not a kept token.
 * For each string leaf, base and current outputs are compared LINE BY LINE. A line that differs is a MOVED line:
 *   + ADDED        current redacts a token base left (new coverage). Printed in its CURRENT (redacted) form.
 *   - EXEMPTED     base redacted a token current keeps, and the kept token is WHOLLY a reference (`${NAME}`,
 *                  `${env:NAME}`, `{{ .x }}`) — the intended v3 exemption. Printed in its CURRENT form (a reference).
 *   ! NEW-MISS     base redacted a token current keeps that is NOT a reference. MUST be 0. Printed in its BASE
 *                  (redacted) form only — never the kept value.
 *   ~ CHANGED      any other difference (e.g. a placeholder moved inside the line). Printed in CURRENT form. Read each.
 * Output is masked by construction: only redactor OUTPUT lines are printed, and only the redacted side of a NEW-MISS.
 * Safety as measure-r10-gaps.sh: pg client, a 25006 write probe before reading, no Prisma.
 */
import { Client } from 'pg';
import * as path from 'path';
import * as CUR from '../lib/agents/harness/redact-artifact-secrets';

type R10 = typeof CUR;
const PH = CUR.PLACEHOLDER;
const REF_WHOLE = /^["']?(?:\$\{(?:env:)?[A-Za-z_]\w{0,127}\}|\{\{[ \t]{0,8}\.[\w.]{1,256}[ \t]{0,8}\}\})["']?$/;

const counts = { leaves: 0, movedLeaves: 0, added: 0, exempted: 0, newMiss: 0, changed: 0 };
const byPop: Record<string, { rows: number; movedRows: number; added: number; exempted: number; newMiss: number; changed: number }> = {};
const shown: string[] = [];
const MAX_SHOWN = Number(process.env.MAX_SHOWN || 400);
/** R10_REPLAY_ONLY=<artifact id,…>: restrict the result.json and persist populations to these rows (re-reading a named mover). */
const ONLY: Set<string> | null = process.env.R10_REPLAY_ONLY ? new Set(process.env.R10_REPLAY_ONLY.split(',').map((x) => x.trim()).filter(Boolean)) : null;

/** Text the CURRENT line shows that the BASE line does not: the line's non-placeholder pieces (split on whitespace and on
 *  the placeholder) that are not a substring of the base line. Both lines are R10 outputs of the SAME original line, and R10
 *  only replaces tokens with the placeholder, so any such piece is a token base hid and current kept. Direction-free: it
 *  holds whether the line gained, lost or moved placeholders (code review sec-ops S-1 — the former count-based classifier
 *  printed a kept secret as CHANGED when the same line also gained a redaction elsewhere). */
function keptTokens(base: string, cur: string): string[] {
  return cur.split(PH).flatMap((seg) => seg.split(/\s+/)).filter((t) => t.length > 0 && !base.includes(t));
}

/** NEW-MISS whenever current keeps any non-reference token, whatever the placeholder counts say. */
function classify(baseLine: string, curLine: string): 'added' | 'exempted' | 'newMiss' | 'changed' {
  const kept = keptTokens(baseLine, curLine);
  if (kept.some((t) => !REF_WHOLE.test(t))) return 'newMiss';
  if (kept.length > 0) return 'exempted';
  return curLine.split(PH).length > baseLine.split(PH).length ? 'added' : 'changed';
}

function compareText(pop: string, id: string, where: string, base: string, cur: string): number {
  if (base === cur) return 0;
  const bl = base.split('\n');
  const cl = cur.split('\n');
  let moved = 0;
  for (let i = 0; i < Math.max(bl.length, cl.length); i++) {
    if (bl[i] === cl[i]) continue;
    moved++;
    const k = bl[i] === undefined || cl[i] === undefined ? 'changed' : classify(bl[i], cl[i]);
    counts[k]++; byPop[pop][k]++;
    if (shown.length < MAX_SHOWN || k === 'newMiss') {
      // Printed side: NEW-MISS and CHANGED in their BASE (redacted) form; ADDED and EXEMPTED in CURRENT form — safe, since
      // every current piece is either in the base line or a whole reference (keptTokens).
      const line = ((k === 'newMiss' || k === 'changed') ? bl[i] ?? '' : cl[i] ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
      const mark = { added: '+', exempted: '-', newMiss: '!', changed: '~' }[k];
      shown.push(`${mark} ${pop} ${id} ${where.slice(-90)} :: ${line}`);
    }
  }
  return moved;
}

/** Walk two redactSecretsDeep outputs in parallel; compare string leaves. */
function walkPair(pop: string, id: string, b: unknown, c: unknown, where: string): number {
  if (typeof b === 'string' && typeof c === 'string') {
    // R10 v9: two JSON TEXT leaves that differ are compared STRUCTURALLY (the differing sub-path is named, still masked) — a
    // one-line compact JSON text compared line by line reads every difference as one line and hides where it is.
    if (b !== c && /^\s*[{[]/.test(b) && /^\s*[{[]/.test(c)) {
      let pb: unknown; let pc: unknown;
      try { pb = JSON.parse(b); pc = JSON.parse(c); } catch { pb = undefined; }
      if (pb !== undefined && pb !== null && typeof pb === 'object') return walkPair(pop, id, pb, pc, `${where}{json}`);
    }
    counts.leaves++;
    const m = compareText(pop, id, where, b, c);
    if (m) counts.movedLeaves++;
    return m;
  }
  if (Array.isArray(b) && Array.isArray(c)) return b.reduce((n: number, x, i) => n + walkPair(pop, id, x, c[i], `${where}[${i}]`), 0);
  if (b && c && typeof b === 'object' && typeof c === 'object') {
    let n = 0;
    const bk = Object.keys(b as object);
    const ck = Object.keys(c as object);
    if (bk.length !== ck.length) { counts.changed++; byPop[pop].changed++; shown.push(`~ ${pop} ${id} ${where} :: key count differs`); return 1; }
    for (let i = 0; i < bk.length; i++) {
      // R10 v9 (R-2): a KEY is text the persist redacts. Compared line by line like a leaf; the collision suffix is not a kept token.
      if (bk[i] !== ck[i]) {
        const curKey = /^.* #\d+$/.test(ck[i]) && !/ #\d+$/.test(bk[i]) ? ck[i].replace(/ #\d+$/, '') : ck[i];
        counts.leaves++;
        if (compareText(pop, id, `${where}.{key}`, bk[i], curKey)) counts.movedLeaves++;
        n += 1;
      }
      n += walkPair(pop, id, (b as Record<string, unknown>)[bk[i]], (c as Record<string, unknown>)[ck[i]], `${where}.${ck[i]}`);
    }
    return n;
  }
  if (JSON.stringify(b) !== JSON.stringify(c)) { counts.changed++; byPop[pop].changed++; shown.push(`~ ${pop} ${id} ${where} :: structure differs`); return 1; }
  return 0;
}

async function page(c: Client, sql: string, fn: (r: Record<string, unknown>) => void): Promise<void> {
  let after = '';
  for (;;) {
    const { rows } = await c.query(sql, [after]);
    if (!rows.length) break;
    for (const r of rows) fn(r);
    after = rows[rows.length - 1].k as string;
  }
}

/** `--self-test`: the classifier on synthetic pairs, no DB (the positive control: each class must be reachable, and a
 *  NEW-MISS must print only the base's redacted form). Exit 1 on any mismatch. */
function selfTest(): number {
  byPop.t = { rows: 0, movedRows: 0, added: 0, exempted: 0, newMiss: 0, changed: 0 };
  const cases: Array<[string, string, string, keyof typeof counts]> = [
    ['added', 'access_token: Synth3tic9', `access_token: ${PH}`, 'added'],
    ['exempted', `password: ${PH}`, 'password: ${env:PG_PASS}', 'exempted'],
    ['exempted quoted', `password: "${PH}"`, 'password: "${env:PG_PASS}"', 'exempted'],
    ['new miss', `password: ${PH}`, 'password: Synth3ticLEAK9', 'newMiss'],
    ['new miss mid-line', `a ${PH} b ${PH} c`, `a ${PH} b Synth3ticLEAK9 c`, 'newMiss'],
    // sec-ops S-1 probes: a kept secret on a line that ALSO gained a redaction elsewhere; a moved placeholder.
    ['kept secret + new redaction on one line', `password: ${PH} url: postgres://u:pw9@db`, `password: Synth3ticLEAK9 url: postgres://u:${PH}@db`, 'newMiss'],
    ['kept Spring default (B-1)', `password: ${PH}`, 'password: ${DB_PASS:Synth3ticLEAK9}', 'newMiss'],
    ['changed (same count, placeholder moved)', `k: ${PH} v: x`, `k: ${PH} v: x `, 'changed'],
  ];
  let bad = 0;
  for (const [name, base, cur, want] of cases) {
    const before = { ...counts };
    compareText('t', name, '', base, cur);
    const got = (Object.keys(counts) as Array<keyof typeof counts>).find((k) => counts[k] !== before[k]);
    const ok = got === want;
    if (!ok) bad++;
    console.log(`${ok ? '✅' : '❌'} self-test ${name}: ${got}`);
  }
  const leaked = shown.some((l) => l.includes('Synth3ticLEAK9'));
  console.log(`${leaked ? '❌' : '✅'} self-test: no NEW-MISS value printed`);
  return bad || leaked ? 1 : 0;
}

async function main(): Promise<void> {
  if (process.argv.includes('--self-test')) process.exit(selfTest());
  const basePath = process.env.R10_BASE;
  if (!basePath) throw new Error('R10_BASE (path to the base redact-artifact-secrets.ts) not set — run via replay-r10-versions.sh');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const BASE: R10 = require(path.resolve(basePath));
  console.log(`base ${BASE.R10_VERSION} → current ${CUR.R10_VERSION}`);
  const c = new Client({ connectionString: process.env.DATABASE_URL }); c.on('error', () => undefined); await c.connect();
  try { await c.query('CREATE TEMP TABLE _r10_ro_probe(x int)'); throw new Error('ABORT: a write was NOT refused'); }
  catch (e) { if (String((e as Error).message).startsWith('ABORT')) throw e; if ((e as { code?: string }).code !== '25006') throw new Error(`ABORT: probe failed with ${(e as { code?: string }).code}, not 25006`); }

  for (const pop of ['result.json', 'report.md', 'held_blobs', 'persist', 'pager']) byPop[pop] = { rows: 0, movedRows: 0, added: 0, exempted: 0, newMiss: 0, changed: 0 };

  await page(c, `SELECT id k, content FROM agent_artifacts WHERE name = 'result.json' AND id > $1 ORDER BY id LIMIT 200`, (r) => {
    if (ONLY && !ONLY.has(String(r.k))) return;
    byPop['result.json'].rows++;
    let j: unknown; try { j = JSON.parse(String(r.content ?? '')); } catch { return; }
    const b = BASE.redactSecretsDeep(j).value; const cur = CUR.redactSecretsDeep(j).value;
    if (walkPair('result.json', String(r.k), b, cur, '$')) byPop['result.json'].movedRows++;
  });
  await page(c, `SELECT id k, content FROM agent_artifacts WHERE name = 'report.md' AND id > $1 ORDER BY id LIMIT 200`, (r) => {
    byPop['report.md'].rows++;
    const t = String(r.content ?? '');
    counts.leaves++;
    if (compareText('report.md', String(r.k), '', BASE.redactArtifactSecrets(t).redacted, CUR.redactArtifactSecrets(t).redacted)) { byPop['report.md'].movedRows++; counts.movedLeaves++; }
  });
  // persist: result.json + report.md of ONE execution through the persist call (R10 v8 echo).
  let echoHits = 0; let echoRows = 0;
  await page(c, `SELECT j.id k, j.content jc, m.content mc FROM agent_artifacts j
                   LEFT JOIN agent_artifacts m ON m."executionId" = j."executionId" AND m.name = 'report.md'
                  WHERE j.name = 'result.json' AND j.id > $1 ORDER BY j.id LIMIT 200`, (r) => {
    if (ONLY && !ONLY.has(String(r.k))) return;
    byPop.persist.rows++;
    let j: unknown; try { j = JSON.parse(String(r.jc ?? '')); } catch { return; }
    const md = r.mc === null || r.mc === undefined ? null : String(r.mc);
    const b = BASE.redactArtifactsForPersist(j, md); const cur = CUR.redactArtifactsForPersist(j, md);
    const e = (cur as { echoRedactedCount?: number }).echoRedactedCount ?? 0;
    echoHits += e; if (e > 0) echoRows++;
    let moved = walkPair('persist', String(r.k), b.resultJson, cur.resultJson, '$');
    if (md !== null) { counts.leaves++; moved += compareText('persist', String(r.k), 'report.md', b.reportMd ?? '', cur.reportMd ?? ''); }
    if (moved) byPop.persist.movedRows++;
  });
  console.log(`persist echo: ${echoHits} placeholder(s) over ${echoRows} execution(s)`);
  // pager (R10 v9 R-1): stored read_more windows rejoined to their stored predecessor (same ref, contiguous offsets).
  const pagerLead = (CUR as { pagerPersistLead?: (f: string, o: number) => string }).pagerPersistLead;
  let pagerWindows = 0; let pagerJoined = 0; let pagerHits = 0;
  if (pagerLead) {
    const HDR = /^\[read_more ref=(\d+) offset=(\d+)\.\.(\d+) of (\d+)\]\n/;
    const body = (t: string): string => {
      const s0 = t.replace(HDR, '');
      const cut = s0.search(/\n\[(?:more remains\]|end of result\])/);
      return cut >= 0 ? s0.slice(0, cut) : s0;
    };
    await page(c, `SELECT id k, content FROM agent_artifacts WHERE name = 'result.json' AND id > $1 AND content LIKE '%read_more ref=%' ORDER BY id LIMIT 200`, (r) => {
      let j: { toolCalls?: Array<{ tool?: string; result?: unknown }> }; try { j = JSON.parse(String(r.content ?? '')); } catch { return; }
      const wins: Array<{ ref: string; off: number; end: number; body: string }> = [];
      for (const tc of Array.isArray(j.toolCalls) ? j.toolCalls : []) {
        if (tc?.tool !== 'read_more' || typeof tc.result !== 'string') continue;
        const m = HDR.exec(tc.result); if (!m) continue;
        wins.push({ ref: m[1], off: Number(m[2]), end: Number(m[3]), body: body(tc.result) });
      }
      if (!wins.length) return;
      byPop.pager.rows++;
      let movedRow = false;
      for (const w of wins) {
        pagerWindows++;
        const prev = wins.find((p) => p.ref === w.ref && p.end === w.off);
        if (!prev) continue;
        pagerJoined++;
        const lead = pagerLead(prev.body, prev.body.length);
        if (!lead) continue;
        const alone = CUR.redactSecretsDeep({ l: w.body }).value as { l: string };
        const joined = CUR.redactSecretsDeep({ l: lead + w.body }).value as { l: string };
        const add = joined.l.split(PH).length - 1 - (alone.l.split(PH).length - 1) - (CUR.redactSecretsDeep({ l: lead }).value as { l: string }).l.split(PH).length + 1;
        if (add > 0) {
          pagerHits += add; movedRow = true; counts.added += add; byPop.pager.added += add;
          const firstLine = joined.l.split(/\n|\\n/)[0].replace(/\s+/g, ' ').trim().slice(0, 160);
          shown.push(`+ pager ${String(r.k)} ref=${w.ref}@${w.off} :: ${firstLine}`);
        }
      }
      if (movedRow) byPop.pager.movedRows++;
    });
  }
  console.log(`pager (R-1): ${pagerWindows} stored read_more window(s), ${pagerJoined} with a stored predecessor, ${pagerHits} placeholder(s) the lead adds${pagerLead ? '' : ' — UNMEASURED (the current tree has no pagerPersistLead)'}`);
  const held = await c.query(`SELECT to_regclass('public.held_blobs') IS NOT NULL AS ok`);
  if (held.rows[0].ok) {
    await page(c, `SELECT scope || '/' || sha256 k, convert_from(content, 'UTF8') t FROM held_blobs WHERE scope || '/' || sha256 > $1 ORDER BY 1 LIMIT 200`, (r) => {
      byPop.held_blobs.rows++;
      const t = String(r.t ?? '');
      counts.leaves++;
      if (compareText('held_blobs', String(r.k).slice(-12), '', BASE.redactArtifactSecrets(t).redacted, CUR.redactArtifactSecrets(t).redacted)) { byPop.held_blobs.movedRows++; counts.movedLeaves++; }
    });
  }
  await c.end();
  console.log(JSON.stringify({ totals: counts, byPopulation: byPop }, null, 2));
  for (const s of shown) console.log(s);
  console.log(`NEW-MISS ${counts.newMiss} (must be 0)`);
  if (counts.newMiss > 0) process.exit(1);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
