#!/usr/bin/env ts-node
/**
 * test-next15-guards — NEXT15-FOLLOWUPS (2026-11-04).
 *   G1 no route / page / layout types its params synchronously (`params: { x: string }` without Promise) — Next 15 passes a
 *      Promise and Next 16 removes the sync shim, so a sync-typed signature would break silently at the upgrade;
 *   G1b negative control: the matcher flags a planted sync signature and passes a Promise one;
 *   G2 the custom server passes THE next.config.js as its `conf` (a custom-server conf REPLACES next.config.js at runtime, so a
 *      hand-written subset let build and runtime diverge).
 */
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
let passed = 0; let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`✅ ${name}`); } catch (e: any) { failed++; console.log(`❌ ${name}\n   ${e?.message || e}`); }
}
function ok(c: unknown, m: string) { if (!c) throw new Error(m); }

const SYNC_PARAMS = /params\s*:\s*\{\s*[A-Za-z_$][\w$]*\??\s*:\s*string/;
const flagged = (lines: string[]) => lines.filter((l) => l && SYNC_PARAMS.test(l) && !/Promise</.test(l));

test('G1 no sync-typed params in app/**/route.ts, page.tsx, layout.tsx', () => {
  const out = execSync(`grep -rnE "params\\s*:\\s*\\{\\s*[A-Za-z_$][A-Za-z0-9_$]*\\??\\s*:\\s*string" app --include=route.ts --include=page.tsx --include=layout.tsx || true`,
    { cwd: ROOT, encoding: 'utf8' }).split('\n');
  const bad = flagged(out);
  ok(bad.length === 0, `sync-typed params (type them as Promise<...> and await once):\n   ${bad.join('\n   ')}`);
});
test('G1b negative control: a planted sync signature is flagged, a Promise one is not', () => {
  ok(flagged(['app/x/page.tsx:3:export default function P({ params }: { params: { id: string } }) {']).length === 1, 'sync not flagged');
  ok(flagged(['app/x/page.tsx:3:export default async function P({ params }: { params: Promise<{ id: string }> }) {']).length === 0, 'Promise flagged');
});
test('G2 server.ts passes next.config.js itself as the custom-server conf', () => {
  const s = readFileSync(join(ROOT, 'server.ts'), 'utf8');
  ok(/conf:\s*require\(['"]\.\/next\.config\.js['"]\)/.test(s), "server.ts must pass `conf: require('./next.config.js')`");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
