#!/usr/bin/env ts-node
/**
 * THE REFUSING FLIP SCRIPT (WS1 Phase C, D3) — flips the Pipeline Harness template's protocol
 * injection mode between `loadProtocols: true` (legacy load-all) and `'composed'` (base + the
 * task's ONE stamped protocol). This is THE ONLY sanctioned way to flip:
 *
 *   ⚠️ NEVER re-run scripts/seed-harness-template.ts to change the mode — it rewrites the whole
 *   template (prompt, model params, metadata) and would clobber any GUI edits. This script reads
 *   the row, ASSERTS the exact state it expects, writes ONE key via a Postgres-side jsonb merge,
 *   and prints before/after. Anything unexpected → it REFUSES and changes nothing.
 *
 * Usage:
 *   ts-node -r tsconfig-paths/register scripts/flip-harness-protocol-mode.ts            # dry-run (default)
 *   ts-node ... scripts/flip-harness-protocol-mode.ts --flip                            # true → 'composed'
 *   ts-node ... scripts/flip-harness-protocol-mode.ts --revert                          # 'composed' → true
 *   ts-node ... scripts/flip-harness-protocol-mode.ts --render-hash                     # rollback-drill hash
 *
 * --render-hash renders a SAMPLE composed prompt (real DB protocol rows, fixed synthetic task/
 * harness inputs) and prints its sha256 — capture it PRE-flip and compare POST-un-flip: the
 * rollback drill's verify step is render-hash byte-equality, run BEFORE any code revert is even
 * considered (a code revert with the template still flipped silently de-protocols every harness;
 * the deploy gate scripts/verify-template-mode-compat.ts backstops that direction).
 */
import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import { applySystemPromptInjections } from '../lib/services/execution-system-prompt';

const TEMPLATE_NAME = 'Pipeline Harness';
const arg = (f: string) => process.argv.includes(f);
const logger = {
  info: (d: Record<string, unknown>, m: string) => console.log(`   [info] ${m}`),
  warn: (d: Record<string, unknown>, m: string) => console.log(`   [warn] ${m}`),
};

(async () => {
  const row = await prisma.agentTemplate.findFirst({
    where: { name: TEMPLATE_NAME, status: 'ACTIVE' },
    select: { id: true, name: true, metadata: true },
  });
  if (!row) { console.error(`REFUSING: no ACTIVE template named "${TEMPLATE_NAME}"`); process.exit(1); }
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const lp = meta.loadProtocols;
  console.log(`Template: ${row.name} (${row.id})`);
  console.log(`BEFORE: loadProtocols = ${JSON.stringify(lp)}`);
  console.log(`Metadata keys: [${Object.keys(meta).sort().join(', ')}]`);

  if (arg('--render-hash')) {
    const prompt = await applySystemPromptInjections('SAMPLE-HEAD', {
      harnessContext: null,
      template: { id: row.id, name: row.name },
      templateMetadata: meta,
      taskProtocol: { protocol: null, source: 'stamp' },
    }, prisma, logger);
    console.log(`RENDER-HASH (mode=${JSON.stringify(lp)}, base-only sample): sha256=${createHash('sha256').update(prompt).digest('hex')}`);
    console.log(`RENDER-CHARS: ${prompt.length}`);
    await prisma.$disconnect();
    return;
  }

  const doFlip = arg('--flip'), doRevert = arg('--revert');
  if (!doFlip && !doRevert) {
    console.log('Dry-run (no --flip / --revert / --render-hash given). No changes made.');
    await prisma.$disconnect();
    return;
  }
  if (doFlip && doRevert) { console.error('REFUSING: both --flip and --revert given'); process.exit(1); }

  const expected = doFlip ? true : 'composed';
  const target = doFlip ? 'composed' : true;
  if (lp !== expected) {
    console.error(`REFUSING: expected loadProtocols === ${JSON.stringify(expected)}, found ${JSON.stringify(lp)}. ` +
      `The row is not in the state this direction flips FROM — investigate before touching it.`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // ONE key, Postgres-side jsonb merge (BC19-safe — never a whole-object replace).
  const patch = JSON.stringify({ loadProtocols: target });
  await prisma.$executeRaw`
    UPDATE agent_templates
    SET metadata = COALESCE(metadata, '{}'::jsonb) || ${patch}::jsonb
    WHERE id = ${row.id}`;

  const after = await prisma.agentTemplate.findUnique({ where: { id: row.id }, select: { metadata: true } });
  const lpAfter = ((after?.metadata ?? {}) as Record<string, unknown>).loadProtocols;
  console.log(`AFTER:  loadProtocols = ${JSON.stringify(lpAfter)}`);
  if (lpAfter !== target) { console.error('❌ post-write verification FAILED'); process.exit(1); }
  console.log(`✅ ${doFlip ? 'FLIPPED to composed' : 'REVERTED to load-all'}. ` +
    (doRevert ? 'Now run --render-hash and compare against the pre-flip capture before considering any code action.' :
      'Run the leg canary before any program run (D3 sequence).'));
  await prisma.$disconnect();
})();
