#!/usr/bin/env ts-node
/**
 * Verify UNIVERSAL_AGENT_RULES actually reaches agents.
 *
 * WHY THIS EXISTS. Until 2026-08-04 the preamble was concatenated into every protocol's stored
 * `promptText` at seed time, so it could not go missing: the rows carried it. Rec #9 moved it to a
 * single runtime injection to stop a PIPELINE task receiving six copies (~6,342 tokens/turn).
 *
 * That split its delivery across TWO artifacts which deploy at DIFFERENT MOMENTS:
 *
 *   - the seeded rows      → written pre-flip (`production-deploy.yml`, deliberately, so the MCP
 *                            server's prompt cache loads them at startup)
 *   - the injection code   → live only AFTER the symlink flip + pm2 restart
 *
 * Between those two moments the OLD code serves the NEW rows and **agents receive no universal rules
 * at all**. The window is short — unless a deploy aborts after seeding, which has happened on this
 * box (2026-08-02, twice, from build/rig contention). Worse, a code ROLLBACK to before `05117149`
 * without a re-seed is a PERMANENT silent loss: new rows carry nothing, old code injects nothing, and
 * nothing about the resulting prompt looks wrong.
 *
 * Neither failure is visible in output. An agent without the preamble does not announce it; it just
 * stops being told not to fabricate. So this check exists to make the state assertable.
 *
 * THE TWO CONDITIONS, which must hold TOGETHER:
 *   A. No protocol row STARTS with the preamble (post-rec-9 rows are clean).
 *   B. The running code injects it.
 *
 * A-and-B    → correct (rows clean, code injects).
 * !A and !B  → correct, pre-rec-9 (rows carry it, code does not inject).
 * A and !B   → 🔴 SILENT LOSS. Agents get nothing. This is the rollback/abort state.
 * !A and B   → ⚠️ DOUBLE. Agents get it twice; wasteful, not dangerous.
 *
 * ⚠️ CONDITION A MUST BE ANCHORED. `pipeline-orchestrator-protocol` legitimately REFERENCES the rules
 * deep in its body (position ~28,084 of 30,920 chars). An unanchored `LIKE '%Universal Agent Rules%'`
 * therefore returns 1 on a perfectly healthy system and reads as a stale row forever. The first draft
 * of this check made exactly that mistake.
 *
 * Usage:  npx ts-node scripts/verify-preamble-delivery.ts
 * Exit 0 = consistent · Exit 1 = silent loss · Exit 2 = double · Exit 3 = could not determine
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const MARKER = 'Universal Agent Rules';
const ANCHOR_CHARS = 200;
// Overridable so the FAILURE states can be mutation-verified against a copy, without editing the
// real file on a production host. A checker whose alarm paths have never fired is a checker nobody
// should trust — that is this session's most repeated finding.
const INJECTION_SITE = process.env.PREAMBLE_INJECTION_SITE
  ? path.resolve(process.env.PREAMBLE_INJECTION_SITE)
  : path.join(__dirname, '..', 'lib', 'services', 'execution-system-prompt.ts');

async function main() {
  const prisma = new PrismaClient();
  try {
    // (A) rows — anchored, for the reason in the header
    const rows = await prisma.agentPromptLibrary.findMany({
      where: { tags: { has: 'protocol' }, status: 'ACTIVE' },
      select: { name: true, promptText: true },
    });
    if (rows.length === 0) {
      console.error('❌ no ACTIVE protocol rows found — cannot determine delivery state');
      process.exit(3);
    }
    const prepended = rows.filter(r => (r.promptText ?? '').slice(0, ANCHOR_CHARS).includes(MARKER));
    const rowsClean = prepended.length === 0;

    // (B) code — does the running release inject it?
    if (!fs.existsSync(INJECTION_SITE)) {
      console.error(`❌ injection site not found: ${INJECTION_SITE}`);
      process.exit(3);
    }
    const src = fs.readFileSync(INJECTION_SITE, 'utf-8');
    // Count real injections, not the import or comments: template-literal uses of the constant.
    const injections = (src.match(/\$\{UNIVERSAL_AGENT_RULES\}/g) ?? []).length;
    const codeInjects = injections > 0;

    console.log(`  protocol rows        : ${rows.length} ACTIVE`);
    console.log(`  rows with a PREPEND  : ${prepended.length}${prepended.length ? ` (${prepended.map(r => r.name).join(', ')})` : ''}`);
    console.log(`  injection sites      : ${injections}`);

    if (rowsClean && codeInjects) {
      console.log('✅ consistent — rows clean, code injects once per prompt');
      process.exit(0);
    }
    if (!rowsClean && !codeInjects) {
      console.log('✅ consistent — pre-rec-9 shape (rows carry the preamble, code does not inject)');
      process.exit(0);
    }
    if (rowsClean && !codeInjects) {
      console.error('');
      console.error('🔴 SILENT LOSS: rows no longer carry the preamble AND the running code does not');
      console.error('   inject it. Every protocol-reading agent is running with NO universal rules,');
      console.error('   and nothing about their prompts looks wrong.');
      console.error('   Cause is almost always a code rollback past 05117149 without a re-seed, or a');
      console.error('   deploy that aborted between seeding and the symlink flip.');
      console.error('   Fix: complete the deploy, or re-seed to match the running code (npm run seed:protocols).');
      process.exit(1);
    }
    console.error('');
    console.error('⚠️  DOUBLE: rows still carry the preamble AND the code injects it — agents receive it');
    console.error('   twice. Wasteful, not dangerous. Re-seed to clear the stored copies.');
    process.exit(2);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error('❌ verification failed to run:', err instanceof Error ? err.message : err);
  process.exit(3);
});
