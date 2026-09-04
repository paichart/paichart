#!/usr/bin/env ts-node
/**
 * replay-dialect-lint.ts — run the REAL dialect-lint enrichment against a REAL completed leg and
 * print what it would stamp. Read-only; writes nothing.
 *
 *   npx ts-node scripts/replay-dialect-lint.ts <legTaskId> [<legTaskId> ...]
 *
 * WHY THIS EXISTS, from day one rather than after the fact
 * -------------------------------------------------------
 * The derivation-containment enrichment was reachable only by executing a full program run — rig
 * rebuild, 30-50 minutes, human gates. At that cost it got "verified" by reading source, and three
 * defects shipped that way, each a runtime fact static review passed (a reason string no leg ever
 * stamped; a field never rendered on the card the gate reads; an artifact-name predicate that
 * matched zero rows forever). `replay-containment.ts` was written afterwards to close that.
 *
 * This net starts with its replay. Point it at any completed leg — including the IGP-T1 rounds whose
 * packages earned the lint — and read the fact in seconds.
 */
import { PrismaClient } from '@prisma/client';
import { computeDialectLintFact } from '../lib/agents/harness/dialect-lint-enrichment';

const prisma = new PrismaClient();

async function replay(legTaskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: legTaskId },
    select: { id: true, title: true, type: true, metadata: true, inputContext: true },
  });
  if (!task) { console.log(`\n❌ ${legTaskId} — no such task`); return; }

  const stageId = (task.metadata as Record<string, unknown> | null)?.pipelineStageId;
  const contract = (task.inputContext as { interfaceContract?: unknown } | null)?.interfaceContract;

  console.log(`\n${'='.repeat(78)}`);
  console.log(`LEG  ${task.title.slice(0, 66)}`);
  console.log(`     type=${task.type}  stage=${String(stageId ?? '(none)')}  contract=${contract ? 'present' : 'ABSENT'}`);

  const fact = await computeDialectLintFact(prisma, { stageId, interfaceContract: contract });

  const checked = (fact as { checked?: boolean }).checked;
  const reason = (fact as { reason?: string }).reason;
  const tokens = (fact as { tokensConsidered?: string[] }).tokensConsidered ?? [];
  const violations = (fact as { violations?: unknown[] }).violations ?? [];
  const blockKinds = (fact as { blockKinds?: Record<string, number> }).blockKinds ?? {};
  const transcription = (fact as { transcription?: { checked?: boolean; reason?: string; missing?: unknown[]; stanzasConsidered?: number; linesRequired?: number; linesPresent?: number; byStanza?: Record<string, { present: number; required: number; attempted: boolean; complete: boolean }> } }).transcription;

  console.log(`\n  ABSENCE half  checked=${checked}${reason ? `  reason=${reason}` : ''}`);
  console.log(`     tokens considered : ${tokens.length ? tokens.join(' · ') : '(none)'}`);
  console.log(`     violations        : ${violations.length}`);
  for (const v of violations as Array<Record<string, unknown>>) {
    console.log(`        🛑 ${String(v.token)}  ${v.line ? `(line ${String(v.line)})` : ''} ${v.text ? String(v.text).trim().slice(0, 70) : ''}`);
  }
  console.log(`     block kinds       : ${Object.keys(blockKinds).length ? JSON.stringify(blockKinds) : '(none)'}`);
  if (!Object.keys(blockKinds).length) {
    console.log(`        ⚠️  no fenced blocks classified — "0 violations" here means NOTHING WAS SCANNED, not "clean"`);
  }

  if (transcription) {
    console.log(`\n  PRESENCE half checked=${transcription.checked}${transcription.reason ? `  reason=${transcription.reason}` : ''}`);
    console.log(`     stanzas considered: ${transcription.stanzasConsidered ?? 0}`);
    const missing = transcription.missing ?? [];
    // RENDER THE RATIO, AND ONLY VERDICT WHERE THE FACT SUPPORTS ONE (2026-08-27).
    // This line used to append "← the R7 omission shape" whenever anything was missing, which
    // CONTRADICTED the fact's own scope note ("does NOT know a leg's INTENT: compare linesPresent
    // against linesRequired before reading `missing` as a defect"). On IGP-T1 R15 it therefore
    // announced the R7 defect over a correct minimal P3 (2 of 10) and a correct P4 removal package
    // (1 of 10) — legs that must NOT carry the deploy stanza. The data was right; the presentation
    // lied about it, which is the worse failure: a reader trusts the rendering, not the JSON.
    // R7 is the HIGH-BUT-INCOMPLETE shape — a leg plainly transcribing the stanza that dropped a
    // line (live: 8 of 10) — never a near-zero reading.
    const req = Number(transcription.linesRequired ?? 0);
    const present = Number(transcription.linesPresent ?? 0);
    const byStanza = transcription.byStanza ?? {};
    const stanzaKeys = Object.keys(byStanza);
    // PER-STANZA is the exact test (2026-08-28). The 0.5 ratio below was a PROXY for stanza
    // attribution the fact carried all along, and it failed on R18-P1: a correct coexistence deploy
    // read 12 of 13 — complete on the deploy stanza, untouched on the preference-knob stanza that
    // belongs to P3 — and the ratio 0.92 tripped the R7 wording on a package with nothing wrong.
    // R7 is ATTEMPTED AND INCOMPLETE within one stanza. A stanza at 0 present is not this phase's job.
    if (stanzaKeys.length) {
      for (const k of stanzaKeys) {
        const b = byStanza[k];
        const state = b.complete ? 'complete'
          : b.attempted ? '← ATTEMPTED BUT INCOMPLETE: the R7 omission shape'
          : 'not attempted (not this phase\'s stanza)';
        console.log(`     ${k.padEnd(22)} ${b.present} of ${b.required}  ${state}`);
      }
      const r7 = stanzaKeys.filter((k) => byStanza[k].attempted && !byStanza[k].complete);
      console.log(`     lines present     : ${present} of ${req}  (flattened total — read the per-stanza rows above)`);
      if (r7.length) {
        console.log(`     R7 RISK           : ${r7.join(', ')}`);
        for (const m of missing as Array<Record<string, unknown>>) {
          console.log(`        ✗ ${String(m.line ?? m.text ?? JSON.stringify(m)).slice(0, 76)}`);
        }
      }
      return;
    }
    const ratio = req > 0 ? present / req : 0;
    const looksLikeR7 = missing.length > 0 && ratio >= 0.5;
    console.log(`     lines present     : ${present} of ${req}`);
    if (looksLikeR7) {
      console.log(`     MISSING lines     : ${missing.length}  ← HIGH-BUT-INCOMPLETE: the R7 omission shape`);
    } else if (missing.length > 0) {
      console.log(`     MISSING lines     : ${missing.length}  (near-zero — EXPECTED unless this leg deploys the canonical stanza;`);
      console.log(`                          a removal/verification/preference leg legitimately carries almost none of it)`);
    } else {
      console.log(`     MISSING lines     : 0`);
    }
    for (const m of missing as Array<Record<string, unknown>>) {
      console.log(`        ✗ ${String(m.line ?? m.text ?? JSON.stringify(m)).slice(0, 76)}`);
    }
  }

  console.log(`\n  → would stamp resultJson.dialectLint (whitelisted, head-slice-safe)`);
}

async function main() {
  const ids = process.argv.slice(2).filter(a => !a.startsWith('-'));
  if (!ids.length) {
    console.error('usage: npx ts-node scripts/replay-dialect-lint.ts <legTaskId> [...]');
    process.exit(1);
  }
  for (const id of ids) await replay(id);
  console.log('');
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error('replay failed:', e?.message ?? e); await prisma.$disconnect(); process.exit(1); });
