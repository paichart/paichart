#!/usr/bin/env ts-node
/**
 * replay-parse-identity.ts — prove a change to the marker-block parser leaves EVERY existing parse
 * byte-identical. PURE: no database, no network. Reads a corpus file and two copies of the module.
 *
 *   npx ts-node --transpile-only scripts/replay-parse-identity.ts \
 *     --corpus <rows.jsonl> --base <path/to/old/derivation-containment.ts> --new <path/to/new/derivation-containment.ts>
 *
 * Exit 0 only when every (text × marker) parse is in the `same` bin AND the bin total equals
 * rows × 3. Any steal / gain / different, or a total that does not add up, exits 1.
 *
 * WHY (C2/C3 2026-10-04, plan v2 §4.4 EF-F10): the program plan reader needed the parser's heading
 * regex, section rule and fence grammar EXPORTED rather than re-typed. An extraction is a refactor
 * only if it moves no parse. This runner is the proof, and it is committed so the next extraction
 * reuses it instead of rebuilding it (B's PARSE-STEAL check, 2026-10-04, was the first run of this
 * method; same population, same bins).
 *
 * SCOPE, stated: byte-identity proves the EXISTING callers unchanged. It cannot see a hazard only a
 * NEW caller exercises (e.g. a cached `gim` RegExp passes this replay and still corrupts a
 * first-match-only reader through `lastIndex`). The primitive pins in scripts/test-plan-spawn-carry.ts
 * cover that half.
 *
 * ── Corpus: re-pull it at deploy time (read-only, prod) ──────────────────────────────────────────
 * Population = every result.json whose content mentions any of the three marker phrases
 * (case-insensitive): a text without the phrase cannot match the heading regex, so this is the
 * complete set the parser can ever answer non-null on. The pull NEVER casts `content::jsonb` (one
 * row with a lone UTF-16 surrogate escape crashes any query that does — MI-13 trap 1); it ships the
 * raw text and parses it in JS, counting rows that fail.
 *
 *   PGOPTIONS="-c default_transaction_read_only=on" psql "$URL" -At -c "
 *     SELECT json_build_object('exec', a.\"executionId\", 'c', a.content) FROM agent_artifacts a
 *      WHERE a.name = 'result.json' AND a.content LIKE '{%'
 *        AND (a.content ILIKE '%harvested allocations%' OR a.content ILIKE '%derived values%'
 *             OR a.content ILIKE '%consumed values%')" > raw.jsonl
 *   node -e 'const fs=require("fs");const o=[];let bad=0;for(const l of fs.readFileSync("raw.jsonl","utf8").split("\n")){
 *     if(!l.trim())continue;const r=JSON.parse(l);let fr;try{fr=JSON.parse(r.c).finalResponse}catch{bad++;continue}
 *     if(typeof fr==="string")o.push(JSON.stringify({exec:r.exec,fr}))}
 *     fs.writeFileSync("rows.jsonl",o.join("\n")+"\n");console.log({rows:o.length,bad})'
 *
 * Base module: `git show <base-commit>:lib/agents/harness/derivation-containment.ts > base.ts`.
 * 2026-10-04 (C2/C3 build): 1,056 rows, 0 unparseable, 3,168 parses — all `same`. POSITIVE CONTROL,
 * same corpus: base = 71ffd705 (pre-PARSE-STEAL) gives `same 3158 · steal 10`, B's exact 10 rows —
 * the runner can see a change when there is one.
 */
/* eslint-disable @typescript-eslint/no-var-requires */
import * as fs from 'fs';
import * as path from 'path';

const MARKERS = ['## Harvested Allocations', '## Derived Values', '## Consumed Values'] as const;

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

type Parse = (text: string | null | undefined, marker: string) => unknown[] | null;

function load(modulePath: string): Parse {
  const abs = path.resolve(modulePath);
  const mod = require(abs);
  if (typeof mod.parseFencedJsonBlock !== 'function') {
    throw new Error(`${abs} exports no parseFencedJsonBlock`);
  }
  return mod.parseFencedJsonBlock as Parse;
}

function main(): number {
  const corpus = arg('--corpus');
  const basePath = arg('--base');
  const newPath = arg('--new');
  if (!corpus || !basePath || !newPath) {
    console.error('usage: replay-parse-identity.ts --corpus <rows.jsonl> --base <old module> --new <new module>');
    return 2;
  }
  if (path.resolve(basePath) === path.resolve(newPath)) {
    console.error('--base and --new resolve to the same file — the comparison would be vacuous');
    return 2;
  }
  const baseParse = load(basePath);
  const newParse = load(newPath);

  const lines = fs.readFileSync(corpus, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  const bins = { same: 0, steal: 0, gain: 0, different: 0 };
  const changed: Array<{ exec: string; marker: string; bin: string }> = [];
  let rows = 0;
  for (const line of lines) {
    const row = JSON.parse(line) as { exec?: string; fr?: string | null };
    rows++;
    for (const marker of MARKERS) {
      const a = baseParse(row.fr ?? null, marker);
      const b = newParse(row.fr ?? null, marker);
      const sa = JSON.stringify(a);
      const sb = JSON.stringify(b);
      let bin: keyof typeof bins;
      if (sa === sb) bin = 'same';
      else if (a !== null && b === null) bin = 'steal';
      else if (a === null && b !== null) bin = 'gain';
      else bin = 'different';
      bins[bin]++;
      if (bin !== 'same') changed.push({ exec: row.exec ?? '?', marker, bin });
    }
  }

  const total = bins.same + bins.steal + bins.gain + bins.different;
  console.log(`rows: ${rows}   parses: ${total} (expected rows × ${MARKERS.length} = ${rows * MARKERS.length})`);
  console.log(`same ${bins.same} · steal ${bins.steal} · gain ${bins.gain} · different ${bins.different}`);
  for (const c of changed.slice(0, 50)) console.log(`  ${c.bin.padEnd(9)} ${c.marker.padEnd(26)} ${c.exec}`);
  if (changed.length > 50) console.log(`  … ${changed.length - 50} more`);

  if (total !== rows * MARKERS.length) {
    console.error('❌ bin total does not equal rows × markers — the runner itself is wrong');
    return 1;
  }
  if (rows === 0) {
    console.error('❌ empty corpus — an empty replay proves nothing');
    return 1;
  }
  if (bins.same !== total) {
    console.error(`❌ ${total - bins.same} parse(s) changed — the change is NOT byte-identical for existing callers`);
    return 1;
  }
  console.log('✅ every parse byte-identical');
  return 0;
}

process.exit(main());
