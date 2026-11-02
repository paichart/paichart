#!/usr/bin/env node
/**
 * Summary tables for scripts/measure-quote-pairing-tie.ts (QUOTE-PAIRING-TIE, 2026-11-01). Reads <dir>/rows.jsonl,
 * blocks.jsonl, ties.jsonl and prints: population per domain, ties per domain and per document-pair type, every document
 * change and every mover. Read-only over the files.  Usage: node scripts/measure-quote-pairing-tie-summary.js <QPT_OUT dir>
 */
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
if (!dir) { console.error('usage: measure-quote-pairing-tie-summary.js <dir>'); process.exit(2); }
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rows = read('rows.jsonl');
const blocks = read('blocks.jsonl');
const ties = read('ties.jsonl');
const dom = (p) => (p || 'none').replace(/-protocol$/, '');
// Document type: the FILE lane is a Git/declared file read; a fetch_data config getter is a device read (running or startup).
const dtype = (d) => {
  if (d.lane === 'file-artifact') return 'file';
  const m = /config\.(running|startup)/.exec(d.path || '');
  if (/fetch_data/.test(d.tool) && m) return `device-${m[1]}`;
  return `other:${d.tool}`;
};

console.log(`control0 (copy === shipping, per task): ${rows.filter((r) => r.control0 === true).length}/${rows.length} identical, `
  + `${rows.filter((r) => r.control0 === false).length} differ, ${rows.filter((r) => r.inputs === 0).length} with no captured input, `
  + `${rows.filter((r) => r.replayError).length} replay errors`);
const sv = {};
for (const r of rows) sv[r.stored_version] = (sv[r.stored_version] || 0) + 1;
console.log('stored quoteFidelity version per task:', JSON.stringify(sv));

const T = {};
const tot = { tasks: 0, legs: 0, blocks: 0, pairable: 0, pairableCand2: 0, ties: 0, docChanged: 0, movers: 0, storedV6Tasks: 0 };
for (const r of rows) {
  const k = dom(r.protocol);
  T[k] ??= { tasks: 0, legs: new Set(), blocks: 0, pairable: 0, pairableCand2: 0, ties: 0, docChanged: 0, movers: 0, storedV6Tasks: 0 };
  T[k].tasks++; T[k].legs.add(r.leg); T[k].docChanged += r.docChanged; T[k].movers += r.movers.length;
  if (r.stored_version === '6') T[k].storedV6Tasks++;
}
for (const b of blocks) {
  const k = dom(b.protocol);
  T[k].blocks++;
  if (b.pairable) T[k].pairable++;
  if (b.pairable && b.docs.length >= 2) T[k].pairableCand2++;
  if (b.tied) T[k].ties++;
}
console.log('\nper domain (blocks = analysed blocks with >= 3 non-blank lines):');
for (const [k, v] of Object.entries(T).sort()) {
  v.legs = v.legs.size;
  console.log(`  ${k.padEnd(30)} ${JSON.stringify(v)}`);
  for (const x of Object.keys(tot)) tot[x] += v[x];
}
console.log(`  ${'TOTAL'.padEnd(30)} ${JSON.stringify(tot)}`);
console.log(`  non-pairable blocks with >= 2 candidate documents: ${blocks.filter((b) => !b.pairable && b.docs.length >= 2).length}`);
const tiedBlocks = blocks.filter((b) => b.tied);
if (tiedBlocks.length !== ties.length) console.log(`  ✗ MISMATCH: blocks.jsonl ties ${tiedBlocks.length} vs ties.jsonl ${ties.length}`);

const pt = {};
for (const t of ties) {
  const k = t.tied.map(dtype).sort().join(' + ');
  pt[k] ??= { ties: 0, docChanged: 0, movers: 0 };
  pt[k].ties++; if (t.changedDoc) pt[k].docChanged++; if (t.mover) pt[k].movers++;
}
console.log('\nties per document-pair type (the documents tied at the best line-set count):');
let sum = 0;
for (const [k, v] of Object.entries(pt).sort()) { console.log(`  ${k.padEnd(52)} ${JSON.stringify(v)}`); sum += v.ties; }
console.log(`  (sum ${sum} = ties ${ties.length}: ${sum === ties.length ? 'ok' : '✗ MISMATCH'})`);

console.log('\nevery tie where the tie-break picks a different document:');
for (const t of ties.filter((x) => x.changedDoc)) {
  const name = (i) => { const d = t.tied.find((x) => x.i === i); return `${dtype(d)} m.${d.ev.matched}/gap.${d.ev.gapCost}/findings.${d.ev.findingCount}`; };
  console.log(`  ${t.tid} L${t.blockLine} ${dom(t.protocol)} ${t.role} (stored v${t.storedVersion}): ${name(t.chosen)} -> ${name(t.tiebreakChoice)} `
    + `| blockMoved=${t.blockMoved} legOutcomeMoved=${t.legOutcomeMoved} MOVER=${t.mover}`);
}
console.log('\nmovers (leg-level fact, ship -> tiebreak):');
for (const r of rows.filter((x) => x.movers.length)) console.log(`  ${r.tid} blocks ${r.movers.join(',')}\n    ship     ${JSON.stringify(r.ship)}\n    tiebreak ${JSON.stringify(r.tiebreak)}`);
console.log(`\ntasks whose WHOLE fact moved (any field): ${rows.filter((r) => r.factMoved).map((r) => r.tid).join(', ') || 'none'}`);
for (const r of rows.filter((x) => x.factMoved)) {
  console.log(`  ${r.tid}: fields that differ = ${Object.keys(r.factDiff || {}).join(', ')}`);
  for (const [k, v] of Object.entries(r.factDiff || {})) if (k !== 'findings') console.log(`    ${k}: ${JSON.stringify(v.ship)} -> ${JSON.stringify(v.tiebreak)}`);
}
