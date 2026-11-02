#!/usr/bin/env ts-node
/**
 * TEMPLATE-MODE COMPATIBILITY GATE (WS1 Phase C, B4 — deploy-time).
 *
 * The protocol-injection MODE lives in two artifacts that change at different moments: the
 * agent_templates rows (`metadata.loadProtocols` — flipped by an operator script, NOT by deploy)
 * and the injection CODE (this deploy). A deploy whose code does not understand a value an ACTIVE
 * template carries would throw UNKNOWN_PROTOCOL_MODE on EVERY execution of that template — loud
 * per-run, but better caught once, red, at deploy time (the production-deploy.yml:484 SILENT-LOSS
 * gate precedent, applied to a second artifact pair).
 *
 * The accept-set is NOT replicated here (replication drifts): each stored value is probed against
 * the REAL deployed mode parse — buildSystemPromptInjectionBlocks with a stub db. A value the
 * deployed code rejects rejects here, definitionally.
 *
 * Exit codes (workflow contract, mirrors verify-preamble-delivery.ts):
 *   0 = every ACTIVE template's loadProtocols value is understood by the deployed code
 *   1 = INCOMPATIBLE — at least one ACTIVE template carries a value this code throws on
 *   3 = could not determine (DB unreachable etc.) — warn, check manually
 */
import { prisma } from '../lib/prisma';
import { buildSystemPromptInjectionBlocks } from '../lib/services/execution-system-prompt';

const silentLogger = { info: () => {}, warn: () => {} };

async function valueUnderstood(value: unknown): Promise<boolean> {
  const stubDb = {
    agentPromptLibrary: {
      // one base row so 'composed' probes past the cardinality checks ('all' / loadProtocols:true was RETIRED 2026-10-16 and now
      // throws UNKNOWN_PROTOCOL_MODE, so a template still carrying it is reported INCOMPATIBLE here)
      findMany: async (args: { where?: { tags?: { has?: string } } }) =>
        args?.where?.tags?.has === 'protocol-base'
          ? [{ name: 'probe-base', description: null, promptText: 'x', version: '0' }]
          : [],
      findFirst: async () => null,
    },
  };
  try {
    await buildSystemPromptInjectionBlocks('probe', {
      harnessContext: null,
      template: null,
      templateMetadata: { loadProtocols: value },
      taskProtocol: { protocol: null, source: 'stamp' },
    }, stubDb, silentLogger);
    return true;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('UNKNOWN_PROTOCOL_MODE')) return false;
    // Any OTHER throw means the mode parsed and a later rung objected to the probe fixture —
    // the value itself is understood.
    return true;
  }
}

(async () => {
  try {
    const templates = await prisma.agentTemplate.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, metadata: true },
    });
    const carriers = templates
      .map(t => ({ ...t, lp: (t.metadata as Record<string, unknown> | null)?.loadProtocols }))
      .filter(t => t.lp !== undefined);
    let bad = 0;
    for (const t of carriers) {
      if (await valueUnderstood(t.lp)) {
        console.log(`✅ ${t.name}: loadProtocols=${JSON.stringify(t.lp)} understood`);
      } else {
        console.log(`❌ ${t.name} (${t.id}): loadProtocols=${JSON.stringify(t.lp)} is NOT understood by the deployed injection code — every execution of this template will throw UNKNOWN_PROTOCOL_MODE`);
        // loadProtocols:true = the RETIRED load-all mode (2026-10-16). A self-host seeded before 2026-09-09 (E35) can still carry
        // it; the one-key fix (BC19-safe jsonb merge):
        if (t.lp === true) console.log(`   fix: UPDATE agent_templates SET metadata = metadata || '{"loadProtocols":"composed"}'::jsonb WHERE id = '${t.id}';`);
        bad++;
      }
    }
    if (carriers.length === 0) console.log('ℹ️ no ACTIVE template carries loadProtocols — nothing to verify');
    // (The E35 warn for a harness still on `true` is gone: since the load-all retirement, 2026-10-16, `true` is NOT understood and
    // is reported ❌ above, with its fix.)
    await prisma.$disconnect();
    process.exit(bad > 0 ? 1 : 0);
  } catch (e) {
    console.error('⚠️ could not determine template-mode compatibility:', e instanceof Error ? e.message : e);
    try { await prisma.$disconnect(); } catch { /* ignore */ }
    process.exit(3);
  }
})();
