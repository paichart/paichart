/**
 * Seed: the four RETIRED PLATFORM-HELD-BYTES held-variant templates (Stage B V-8 → G3 → retired at Phase 10, 2026-10-17).
 *
 * RETIRED — seeded **DEPRECATED** (panel D-row F9 / TS-S2, the value-chain ND6 precedent): each row binds `HELD_VARIANT_PROTOCOL`,
 * which Phase 10 made a DEPRECATED tombstone, so the row cannot run on any path — an execution through it throws
 * `NAMED_PROTOCOL_NOT_FOUND` with the retired-row message before any spend. DEPRECATED (not INACTIVE, which was these rows' pre-flip
 * STAGED label) so the label matches the behaviour. The held text and the two held constraints now live on the BASE observability
 * protocol + templates (seed-observability-templates.ts). The seed is the source of truth for status: run it once after the Phase 10
 * deploy (PHASE10-PLAN.md §5 / the panel's reseed checklist); a revert of Phase 10 re-seeds ACTIVE from the reverted tree.
 * ⚠️ REFUSES A NAME COLLISION: a row with one of these names that this seed did not write (its `metadata.protocol` is not the
 * variant) is never overwritten — the seed stops and names it.
 *
 * Each row REUSES its base template's role and row (`buildTemplateRow` from seed-observability-templates.ts) and changes only the
 * name, the description (prefixed RETIRED), `metadata.protocol` (the retired variant) and the two held constraints (now the base's).
 *
 * Run: npx ts-node -r tsconfig-paths/register scripts/seed-observability-held-templates.ts
 * Never run it to "check it compiles" — it writes. Typecheck with tsc --noEmit.
 */
import { PrismaClient } from '@prisma/client';
import { TEMPLATES as BASE_TEMPLATES, buildTemplateRow, type TemplateSeed } from './seed-observability-templates';
import { HELD_VARIANT_PROTOCOL } from '../lib/agents/harness/held-bytes/variant';
import { HELD_VARIANT_TEMPLATE_NAMES } from '../lib/agents/harness/held-bytes/variant-protocol';

const prisma = new PrismaClient();
const SEED_OWNER_EMAIL = (process.env.SEED_OWNER_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase();

const DESCRIPTIONS: Readonly<Record<string, string>> = {
  'Observability Held State Harvester': `RETIRED 2026-10-17 (PLATFORM-HELD-BYTES Phase 10: folded into observability-config ≥ 1.10.0; use the base Observability template). Was: Phase 0 of ${HELD_VARIANT_PROTOCOL} — the Observability State Harvester's work unchanged; on this pipeline the platform holds the bytes of each config file an as-deployed read returns. Reads ${HELD_VARIANT_PROTOCOL} before beginning work.`,
  'Observability Held Change Architect': `RETIRED 2026-10-17 (PLATFORM-HELD-BYTES Phase 10: folded into observability-config ≥ 1.10.0; use the base Observability template). Was: Phase 1 of ${HELD_VARIANT_PROTOCOL} — the target design; names each held file it changes by handle and path (H<n> (<path>)) with the section and intent, never quoting it. Reads ${HELD_VARIANT_PROTOCOL} before beginning work.`,
  'Observability Held Config Rollback Author': `RETIRED 2026-10-17 (PLATFORM-HELD-BYTES Phase 10: folded into observability-config ≥ 1.10.0; use the base Observability template). Was: Phase 2 of ${HELD_VARIANT_PROTOCOL} — THE deliverable producer. Edits held files by reference (SEARCH/REPLACE edits under Held File Edits, restore H<n> under Held File Rollback); any file not held is written in full. Reads ${HELD_VARIANT_PROTOCOL} before beginning work.`,
  'Observability Held Change Reviewer': `RETIRED 2026-10-17 (PLATFORM-HELD-BYTES Phase 10: folded into observability-config ≥ 1.10.0; use the base Observability template). Was: Phase 3 of ${HELD_VARIANT_PROTOCOL} — the QA gate; reviews the platform's diff of the held-file edits and the rest of the package. Reads ${HELD_VARIANT_PROTOCOL} before beginning work.`,
};

// HELD_AUTHOR_CONSTRAINT / HELD_REVIEWER_CONSTRAINT moved to lib/agents/harness/held-bytes/variant-protocol.ts (Phase 10 W6).
export { HELD_AUTHOR_CONSTRAINT, HELD_REVIEWER_CONSTRAINT } from '../lib/agents/harness/held-bytes/variant-protocol';
import { HELD_AUTHOR_CONSTRAINT, HELD_REVIEWER_CONSTRAINT } from '../lib/agents/harness/held-bytes/variant-protocol';

export const HELD_TEMPLATES: TemplateSeed[] = BASE_TEMPLATES.map((base) => {
  const name = HELD_VARIANT_TEMPLATE_NAMES[base.name];
  if (!name) throw new Error(`no variant name for base template "${base.name}"`);
  return { ...base, name, description: DESCRIPTIONS[name], tags: [...base.tags, 'held-variant'], metadata: { ...base.metadata, protocol: HELD_VARIANT_PROTOCOL } };
});

/** The row a variant template seeds, without the DB write (golden-pinned; reused by the lab). */
export function buildHeldTemplateRow(t: TemplateSeed) {
  const row = buildTemplateRow(t);
  return {
    ...row,
    capabilities: { ...row.capabilities, 'Protocol-Driven': `Reads ${HELD_VARIANT_PROTOCOL} from injected context before acting` },
    constraints: t.defaultRole === 'config_change_author' ? { ...row.constraints, ...HELD_AUTHOR_CONSTRAINT }
      : t.defaultRole === 'change_reviewer' ? { ...row.constraints, ...HELD_REVIEWER_CONSTRAINT }
      : row.constraints,
  };
}

async function main() {
  console.log('Seeding the RETIRED held-variant observability templates (DEPRECATED)...\n');
  const owner = SEED_OWNER_EMAIL ? await prisma.user.findUnique({ where: { email: SEED_OWNER_EMAIL }, select: { id: true } }) : null;
  const createdBy = owner?.id ?? 'system';
  // Refuse every collision BEFORE any write: a partial seed would leave a mixed roster.
  const existing = new Map<string, { id: string; metadata: unknown }>();
  for (const t of HELD_TEMPLATES) {
    const row = await prisma.agentTemplate.findFirst({ where: { name: t.name }, select: { id: true, metadata: true } });
    if (!row) continue;
    const protocol = (row.metadata as Record<string, unknown> | null)?.protocol;
    if (protocol !== HELD_VARIANT_PROTOCOL) {
      throw new Error(`refusing to overwrite "${t.name}" (id ${row.id}): it binds ${JSON.stringify(protocol)}, not ${HELD_VARIANT_PROTOCOL} — this seed did not write it`);
    }
    existing.set(t.name, row);
  }
  for (const t of HELD_TEMPLATES) {
    const data = buildHeldTemplateRow(t);
    const prior = existing.get(t.name);
    if (prior) {
      await prisma.agentTemplate.update({ where: { id: prior.id }, data: { ...data, status: 'DEPRECATED', version: '0.1.0', updatedAt: new Date() } });
      console.log(`  Updated (DEPRECATED): ${t.name}`);
    } else {
      const created = await prisma.agentTemplate.create({ data: { ...data, status: 'DEPRECATED', version: '0.1.0', usageCount: 0, createdBy } });
      console.log(`  Created (DEPRECATED): ${created.id} — ${t.name}`);
    }
  }
  await prisma.$disconnect();
}

if (require.main === module) main().catch((e) => {
  console.error('Seed failed:', e);
  prisma.$disconnect();
  process.exit(1);
});
