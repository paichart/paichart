/**
 * Seed ALL Named Workflows into MCPWorkflow (mcp_workflows)
 *
 * WHY THIS EXISTS (2026-05-31): named workflows lived ONLY in the production database —
 * not in any seed/source — so definitions, fixes (e.g. the token-troubleshooting step-0
 * `action` repair), and even *which workflows exist* were unreproducible and unreviewable.
 * This seed is a complete, version-controlled snapshot of prod `mcp_workflows`.
 *
 * SOURCE OF TRUTH: scripts/named-workflows.json — captured VERBATIM from prod on 2026-05-31
 * (18 workflows: 14 ACTIVE + 4 DEPRECATED). After this, edit named workflows via that JSON
 * + reseed, NOT direct DB writes (a direct edit drifts from source — the problem this fixes).
 *
 * STATUS-FAITHFUL: each workflow is seeded with its captured status, so DEPRECATED ones
 * (pov-workflow-showcase, browser-automation-service-*) stay deprecated — a rebuild restores
 * the exact prod state, including what's intentionally retired.
 *
 * KEYED ON `name` (MCPWorkflow.name is @unique) → updates existing rows by name, never
 * duplicates (rows carry cuid ids we don't control).
 *
 * SUPERSEDES scripts/seed-example-workflows.ts: all 6 of that file's workflows
 * (pov-status-report, blocked-task-escalation, screenshot-documentation,
 * competitor-price-monitor, task-completion-notify, weekly-pov-digest) are live in prod and
 * captured here. Keeping both seeds = two sources for those 6 = drift. Retire the example
 * seed once this lands (its richer inline descriptions are NOT the live prod copy — prod's
 * are leaner; re-apply them via this JSON if desired).
 *
 * NOT auto-run by production-deploy (same as the example seed). Run manually after a DB
 * rebuild or to re-apply source definitions. Prod already matches this snapshot, so a run
 * today is an idempotent no-op.
 *
 * RUNTIME CAVEAT (definition validity ≠ runs-today): Snowflake-dependent workflows
 * (cross-service-*, snowflake-token-test) only EXECUTE once Snowflake billing is active
 * (free trial lapsed 2026-05-31); their definitions are valid and seeded regardless.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/seed-named-workflows.ts
 */

import { PrismaClient, MCPWorkflowStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface NamedWorkflow {
  name: string;
  description: string | null;
  category: string | null;
  status: string;
  steps: unknown;
  triggers: unknown;
  schedule: unknown;
  createdBy: string | null;
}

async function main() {
  const dataFile = path.join(__dirname, 'named-workflows.json');
  const workflows: NamedWorkflow[] = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));

  console.log('='.repeat(60));
  console.log(`Seeding ${workflows.length} named workflows (upsert by name, status-faithful)`);
  console.log('='.repeat(60));

  let created = 0;
  let updated = 0;

  for (const wf of workflows) {
    try {
      const existing = await prisma.mCPWorkflow.findUnique({ where: { name: wf.name } });

      const common = {
        description: wf.description ?? undefined,
        category: wf.category ?? undefined,
        steps: (wf.steps ?? {}) as object,
        triggers: (wf.triggers ?? {}) as object,
        ...(wf.schedule != null ? { schedule: wf.schedule as object } : {}),
        // MCPWorkflowStatus = ACTIVE | PAUSED | DISABLED | DEPRECATED | ERROR
        // (NO 'INACTIVE' — an earlier cast invented it, breaking the type-checked
        // seed run; the JSON only ever carries ACTIVE/DEPRECATED).
        status: (wf.status as MCPWorkflowStatus) ?? MCPWorkflowStatus.ACTIVE,
        ...(wf.createdBy != null ? { createdBy: wf.createdBy } : {}),
      };

      if (existing) {
        await prisma.mCPWorkflow.update({
          where: { name: wf.name },
          data: { ...common, updatedAt: new Date() },
        });
        updated++;
        console.log(`  ↻ updated: ${wf.name} (${wf.status})`);
      } else {
        await prisma.mCPWorkflow.create({ data: { name: wf.name, ...common } });
        created++;
        console.log(`  ＋ created: ${wf.name} (${wf.status})`);
      }
    } catch (error) {
      console.error(`  ❌ failed: ${wf.name}:`, error);
    }
  }

  const active = workflows.filter((w) => w.status === 'ACTIVE').length;
  const deprecated = workflows.filter((w) => w.status === 'DEPRECATED').length;
  console.log('='.repeat(60));
  console.log(`Done. created=${created}, updated=${updated}, total=${workflows.length} (ACTIVE=${active}, DEPRECATED=${deprecated})`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
