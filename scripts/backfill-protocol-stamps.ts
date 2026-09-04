#!/usr/bin/env npx ts-node
/**
 * backfill-protocol-stamps.ts — WS2 Phase A (2026-08-17): one-time stamp backfill + the
 * PERMANENT protocol-rename recovery path (FC5).
 *
 * WHY: the stamp is written at first execution, but F12 reads the PARENT harness row — and an
 * in-flight program's parent may never re-execute (the ph headline finding). This script stamps
 * every `type='PIPELINE'` task whose TITLE carries a resolvable `(protocol: …)` token, so the
 * transitional stamp-OR-title disjunct can eventually be removed.
 *
 * SCOPE, deliberate: only title-resolvable tasks are stamped. Token-less legacy tasks are LEFT
 * UNSTAMPED (key absent = never-resolved) — stamping them `null` would gain nothing and the
 * transitional fallback is a no-op for them anyway (no token to match).
 *
 * WRITE MECHANISM: Postgres-side jsonb `||` (same as the chokepoint writer) — never clobbers a
 * concurrent metadata writer, never overwrites an existing stamp (`metadata ? 'protocol'` guard
 * in the WHERE). This is a PLATFORM channel: it deliberately bypasses the client-surface guard.
 *
 * USAGE (admin, local or prod shell):
 *   npx ts-node --transpile-only scripts/backfill-protocol-stamps.ts            # DRY RUN (default)
 *   npx ts-node --transpile-only scripts/backfill-protocol-stamps.ts --write    # stamp
 *
 * AFTER a verified prod run: record the counts in
 * cline_docs/reviews/ws2-phase-a-2026-08-17/BACKFILL-VERIFIED.md — the disjunct-removal GATE pin
 * in test-program-protocol-token.ts refuses to let the transitional title disjunct disappear
 * without that file existing.
 *
 * PROTOCOL RENAME RECOVERY: after renaming a protocol (seed + PROGRAM_PROTOCOL_NAMES), stamped
 * tasks still carry the OLD canonical name and retitling cannot fix them (the title is inert
 * post-consumption; the stamp is write-protected on client paths). Re-run this script with
 * --rename <old-canonical> <new-canonical> to migrate stamps directly.
 */
import { PrismaClient } from '@prisma/client';
import { resolveProtocolStamp } from '../lib/agents/harness/program-protocol';

const WRITE = process.argv.includes('--write');
const renameIdx = process.argv.indexOf('--rename');
const RENAME = renameIdx > -1 ? { from: process.argv[renameIdx + 1], to: process.argv[renameIdx + 2] } : null;

async function main() {
  const prisma = new PrismaClient();
  try {
    if (RENAME) {
      if (!RENAME.from?.endsWith('-protocol') || !RENAME.to?.endsWith('-protocol')) {
        console.error('❌ --rename takes CANONICAL names (both ending -protocol)'); process.exit(1);
      }
      const hits = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM tasks WHERE type = 'PIPELINE' AND metadata->>'protocol' = ${RENAME.from}`;
      console.log(`rename ${RENAME.from} -> ${RENAME.to}: ${hits.length} stamped task(s)${WRITE ? '' : ' (DRY RUN)'}`);
      if (WRITE && hits.length) {
        const stamp = JSON.stringify({ protocol: RENAME.to, protocolResolvedAt: new Date().toISOString() });
        const n = await prisma.$executeRaw`
          UPDATE tasks SET metadata = metadata || ${stamp}::jsonb
          WHERE type = 'PIPELINE' AND metadata->>'protocol' = ${RENAME.from}`;
        console.log(`✅ migrated ${n} stamp(s)`);
      }
      return;
    }

    const candidates = await prisma.task.findMany({
      where: { type: 'PIPELINE' },
      select: { id: true, title: true, metadata: true },
    });
    let stamped = 0, alreadyStamped = 0, noToken = 0, multiple = 0;
    for (const t of candidates) {
      const meta = (t.metadata as Record<string, unknown> | null) ?? {};
      if ('protocol' in meta) { alreadyStamped++; continue; }
      const r = resolveProtocolStamp(t.title);
      if (!r.protocol) { noToken++; continue; }
      if (r.tokenCount > 1) multiple++;
      if (WRITE) {
        const stamp = JSON.stringify({ protocol: r.protocol, protocolResolvedAt: new Date().toISOString() });
        await prisma.$executeRaw`
          UPDATE tasks SET metadata = COALESCE(metadata, '{}'::jsonb) || ${stamp}::jsonb
          WHERE id = ${t.id} AND (metadata IS NULL OR NOT metadata ? 'protocol')`;
      }
      stamped++;
      console.log(`  ${WRITE ? '📌' : '(dry)'} ${t.id}  ${r.protocol}${r.tokenCount > 1 ? '  ⚠️ multiple tokens, first won' : ''}`);
    }
    console.log(`\n${WRITE ? '✅ BACKFILL' : '🔍 DRY RUN'}: ${stamped} stamped, ${alreadyStamped} already stamped, ${noToken} token-less (left never-resolved), ${multiple} multi-token`);
    if (WRITE) {
      const verify = await prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*) AS n FROM tasks
        WHERE type = 'PIPELINE' AND title LIKE '%(protocol: %' AND (metadata IS NULL OR NOT metadata ? 'protocol')`;
      console.log(`VERIFY: ${verify[0].n} title-token PIPELINE task(s) remain unstamped (expect 0 — malformed tokens excepted).`);
      console.log('Next: record counts in cline_docs/reviews/ws2-phase-a-2026-08-17/BACKFILL-VERIFIED.md (the disjunct-removal gate).');
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
