/**
 * test-seed-model-params-guard.ts — no model-parameter literals in seed scripts.
 *
 * Guards the "silent partial application" disease (model-tiers.ts header; the
 * 2026-08-20 maxtokens-sonnet-flip review): a numeric maxTokens or a bare
 * 'claude-*' model string in a seed script is a value that a later migration
 * WILL miss — the constant moves, the literal (and therefore prod, after the
 * next reseed of that one file) does not. Seeds must import DEFAULT_MAX_TOKENS
 * (lib/services/llm/types) and AGENT_MODELS (lib/agents/model-tiers).
 *
 * Scope: scripts/seed-*.ts only. Zero known exceptions (BC_SMOKE_TEST's
 * intentional 1024 is an ad-hoc prod row, not seeded from scripts/).
 * Exit 0 clean; exit 1 with file:line listing on any hit.
 */
import * as fs from 'fs';
import * as path from 'path';

const SCRIPTS_DIR = path.join(__dirname);
const seedFiles = fs
  .readdirSync(SCRIPTS_DIR)
  .filter((f) => /^seed-.*\.ts$/.test(f))
  .sort();

const MAX_TOKENS_LITERAL = /maxTokens:\s*\d/;
const MODEL_LITERAL = /model:\s*['"`]claude-/;

let failures = 0;
for (const file of seedFiles) {
  const lines = fs.readFileSync(path.join(SCRIPTS_DIR, file), 'utf8').split('\n');
  lines.forEach((line, i) => {
    // Strip line comments so prose mentioning a historical value can't trip the guard.
    const code = line.replace(/\/\/.*$/, '');
    if (MAX_TOKENS_LITERAL.test(code)) {
      console.error(`❌ maxTokens literal: scripts/${file}:${i + 1}: ${line.trim()}`);
      failures++;
    }
    if (MODEL_LITERAL.test(code)) {
      console.error(`❌ model literal: scripts/${file}:${i + 1}: ${line.trim()}`);
      failures++;
    }
  });
}

if (failures > 0) {
  console.error(`\n${failures} model-parameter literal(s) in ${seedFiles.length} seed scripts — import DEFAULT_MAX_TOKENS / AGENT_MODELS instead.`);
  process.exit(1);
}
console.log(`✅ seed model-params guard: ${seedFiles.length} seed scripts scanned, no maxTokens/model literals`);
