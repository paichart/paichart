#!/usr/bin/env ts-node
/**
 * Public-mirror byte-parity gate for the containment library (2026-08-16).
 *
 * lib/agents/harness/derivation-containment.ts is published VERBATIM as
 * ~/paichart/packages/containment-checks/src/index.ts (@paichart/containment-checks).
 * The private tree is the source of truth; the public copy is a mirror. This test
 * fails when they diverge — the Protocol 11 Pass-5 "user-facing mirror" failure,
 * except the mirror is a public npm package.
 *
 * On divergence the fix is DIRECTIONAL: edit the private canonical, re-copy to the
 * public package, run the package's own suite (`npm test` there, 81 tests), bump its
 * version, push both repos. Never edit the public copy first.
 *
 * SKIP semantics: exits 0 with a named SKIP when the public repo is not present on
 * this machine (CI, other checkouts). A skip is counted and printed, never silent —
 * the quarterly out-of-CI battery runs this where ~/paichart exists.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CANONICAL = path.join(__dirname, '../lib/agents/harness/derivation-containment.ts');
const MIRROR = process.env.PAICHART_PUBLIC_REPO
  ? path.join(process.env.PAICHART_PUBLIC_REPO, 'packages/containment-checks/src/index.ts')
  : path.join(os.homedir(), 'paichart/packages/containment-checks/src/index.ts');

if (!fs.existsSync(MIRROR)) {
  console.log(`⏭️  SKIP (named, counted): public repo not present at ${path.dirname(path.dirname(MIRROR))} — parity unverified on this machine, not clean.`);
  process.exit(0);
}

const a = fs.readFileSync(CANONICAL, 'utf-8');
const b = fs.readFileSync(MIRROR, 'utf-8');

if (a === b) {
  console.log(`✅ containment public parity: mirror is byte-identical (${a.length} bytes)`);
  process.exit(0);
}

// Locate the first divergence for a useful failure message.
let i = 0;
while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
const lineNo = a.slice(0, i).split('\n').length;
console.error(`❌ containment public parity: DIVERGED at byte ${i} (~line ${lineNo} of the canonical).`);
console.error(`   canonical: ${CANONICAL} (${a.length} bytes)`);
console.error(`   mirror:    ${MIRROR} (${b.length} bytes)`);
console.error(`   Fix directionally: edit canonical -> re-copy to the package -> run its suite -> bump version -> push both.`);
process.exit(1);
