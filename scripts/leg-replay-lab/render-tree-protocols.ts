#!/usr/bin/env ts-node
/**
 * Leg replay lab — render the network texts from the seed of a TREE (its own lib), $0, no DB (L-CS-N S-1, 2026-11-05).
 *
 *   npx ts-node -r tsconfig-paths/register scripts/leg-replay-lab/render-tree-protocols.ts <tree root> <out dir>
 *
 * protocol-history.ts renders a past seed over TODAY's lib, which cannot render a candidate whose seed imports lib it adds itself
 * (1.26.0 imports GIT_FILE_READ_CALL_DECLARED). Copy this file into a detached worktree of the candidate commit and run it THERE.
 * Writes <name>.md for the network texts and HOWTO; prints name, version, sha256, chars.
 */
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'postgresql://leg-replay-lab:never@127.0.0.1:1/never_connects';
if (!process.env.PAICHART_SKIP_DB_CONNECT) process.env.PAICHART_SKIP_DB_CONNECT = 'true';
if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'warn';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const [tree, out] = [process.argv[2], process.argv[3]];
if (!tree || !out) throw new Error('usage: render-tree-protocols.ts <tree root> <out dir>');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PROTOCOLS } = require(path.join(path.resolve(tree), 'scripts', 'seed-protocol-prompts.ts'));
fs.mkdirSync(out, { recursive: true });
for (const p of PROTOCOLS as Array<{ name: string; version: string; promptText: string }>) {
  if (!['network-provisioning-protocol', 'network-derivation-protocol', 'HOWTO-use-pipeline-harness'].includes(p.name)) continue;
  fs.writeFileSync(path.join(out, `${p.name}.md`), p.promptText);
  console.log(p.name, p.version, crypto.createHash('sha256').update(p.promptText, 'utf8').digest('hex'), p.promptText.length);
}
