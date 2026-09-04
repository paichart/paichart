/**
 * Protocol retrieval-verb coverage.
 *
 * WHY THIS EXISTS (2026-08-25, IGP-T1 R10): pipeline-orchestrator-protocol told the harness the
 * reviewer's verdict lives in `result.json.finalResponse`, named NO retrieval verb (0 mentions of
 * `agent.results` in 32.9K chars), and forbade `verbose: true` — the only flag that returns a body.
 * The harness called `task.context` (the pointer channel) four times, could not quote the verdict,
 * and stamped `approved` over a NEEDS-REVISION.
 *
 * The identical defect had already been found and fixed at the PROGRAM tier (pov-program 1.0.14,
 * 2026-07-23). The pipeline tier was never swept. Measured across the corpus that day, pov-program
 * was the ONLY protocol naming the verb — every other one described WHAT to read and never HOW.
 *
 * THE RULE: a protocol that tells an agent to read `result.json` / `finalResponse` / `report.md`
 * from another task MUST name `agent.results` somewhere. Content without retrieval is an
 * instruction an agent cannot follow — and it fails SILENTLY, by substituting the wrong verb.
 *
 * Deliberately coarse: presence-of-verb, not call-site matching. A precise check here would need to
 * parse prose, and a checker that is wrong produces confident false findings (the 2026-07-28 lesson).
 */
import { PrismaClient } from '@prisma/client';

const BODY_REFS = ['result.json', 'finalResponse', 'report.md'];
const VERB = 'agent.results';

/**
 * Only a READ instruction needs a retrieval verb. Protocols also mention these artifacts
 * DESCRIPTIVELY — "the Reviewer produces `result.json` only", "the engine extracts its output as
 * `report.md`" — which is artifact WIRING, not a fetch an agent must perform. Measured 2026-08-25:
 * 3 of 4 failures were exactly that shape, and a check that is 3-noise-to-1-signal gets ignored.
 *
 * So a reference counts only when read-intent appears in the window before it. Kept deliberately
 * simple and over-inclusive rather than clever: a checker that is wrong produces confident false
 * findings (2026-07-28).
 */
const READ_INTENT = /\b(read|retriev\w*|fetch\w*|inspect|consult|quote|examine|look at|parse|page to)\b/i;
/**
 * ...and the reader must be the AGENT. "the customer fetches the harness's report.md" describes a
 * HUMAN in Claude Desktop, who has `fetch`; the agent does not. Both surviving hits in
 * artifact-synthesis were exactly that (2026-08-25), so a human subject in the window disqualifies.
 */
const HUMAN_SUBJECT = /\b(customer|human|operator|reviewer reads|in Claude Desktop|for humans)\b/i;
const WINDOW = 200;

function readRefCount(text: string): number {
  let n = 0;
  for (const t of BODY_REFS) {
    let i = text.indexOf(t);
    while (i !== -1) {
      const pre = text.slice(Math.max(0, i - WINDOW), i);
      if (READ_INTENT.test(pre) && !HUMAN_SUBJECT.test(pre)) n++;
      i = text.indexOf(t, i + t.length);
    }
  }
  return n;
}

async function main() {
  const prisma = new PrismaClient();
  const rows = await prisma.agentPromptLibrary.findMany({
    where: { name: { contains: 'protocol' } },
    select: { name: true, version: true, status: true, promptText: true },
  });
  await prisma.$disconnect();

  if (rows.length === 0) {
    console.error('❌ No protocol rows found — cannot verify (empty is NOT clean).');
    process.exit(1);
  }

  let failed = 0;
  let pending = 0;
  for (const r of rows.sort((a, b) => a.name.localeCompare(b.name))) {
    const mentions = BODY_REFS.map((t) => ({ t, n: r.promptText.split(t).length - 1 })).filter((x) => x.n > 0);
    const allMentions = mentions.reduce((s, x) => s + x.n, 0);
    const total = readRefCount(r.promptText);
    const namesVerb = r.promptText.includes(VERB);
    // A non-ACTIVE row cannot mislead an agent today (DRAFT = not yet runnable; a program-tier
    // non-ACTIVE stamp hard-fails). Report it, do NOT fail on it — otherwise a permanently-parked
    // stub keeps this check red forever and blocks its CI entry. It still has to be fixed BEFORE
    // promotion, so it is named, never silently skipped (the 2026-08-08 silent-exclusion lesson).
    if (r.status !== 'ACTIVE' && total > 0 && !namesVerb) {
      pending++;
      console.log(`  🟡 ${r.name} (${r.version}, ${r.status}) — ${total} read instruction(s), no ${VERB}; fix BEFORE activating`);
      continue;
    }
    if (total === 0) {
      console.log(`  ⚪ ${r.name} (${r.version}) — ${allMentions} descriptive mention(s), 0 read instructions`);
    } else if (namesVerb) {
      console.log(`  ✅ ${r.name} (${r.version}) — ${total} read instruction(s), names ${VERB}`);
    } else {
      failed++;
      console.log(`  ❌ ${r.name} (${r.version}) — ${total} read instruction(s) but NEVER names ${VERB}`);
    }
  }

  console.log('');
  if (pending > 0) {
    console.log(`🟡 ${pending} non-ACTIVE protocol(s) carry the defect — not counted as failures, but they must be fixed before activation.`);
  }
  if (failed > 0) {
    console.error(`❌ ${failed} protocol(s) tell an agent to read an artifact body without naming the verb that returns one.`);
    console.error(`   Fix: name \`perform(action: "agent.results", taskId, verbose: true, limit: 1)\` at the read site.`);
    console.error(`   \`task.context\` is the POINTER channel and never returns a body; \`fetch\` is client-only.`);
    process.exit(1);
  }
  console.log('✅ Every protocol referencing an artifact body names its retrieval verb.');
}

main().catch((e) => { console.error('❌ check failed to run:', e?.message ?? e); process.exit(1); });
