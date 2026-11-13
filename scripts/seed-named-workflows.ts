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
 * SELF-HOST MODE (2026-11-14, owner decision; cline_docs/reviews/selfhost-workflows-2026-11-14/). `npm run db:seed` passes
 * `--self-host`. A self-host has the built-in project service and whatever its owner registers (the install guide adds the
 * browser service and the Git file source) — NOT the notification, token-validator, Snowflake, weather, EIA or EODHD services
 * these workflows call. Measured on the self-host test machine: every workflow run failed with "Service not found or inactive".
 * So, with the flag, the overlay `scripts/named-workflows.self-host.json` decides:
 *   - `install`  — three workflows, with definitions that call only services a self-host has (the engine has NO optional step:
 *                  a failed email step fails the whole workflow, so those steps are removed, not softened);
 *   - `examples` — four snapshot workflows created PAUSED, their description saying which service each needs;
 *   - anything else in the snapshot is NOT created.
 * An EXISTING self-host that already holds the 18 rows: nothing is deleted. A row that is not in `install` is set to PAUSED only
 * when a service it calls has no ACTIVE row in mcp_tools (so a workflow the owner made runnable by registering the service is
 * left alone, and a re-seed does not pause it again). The built-in `paichart-*` services count as present.
 * WITHOUT the flag this script is unchanged: all 18, status-faithful. Production never runs it automatically.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/seed-named-workflows.ts               # the full snapshot (maintainers)
 *   npx ts-node -r tsconfig-paths/register scripts/seed-named-workflows.ts --self-host   # what db:seed runs
 *   npx ts-node -r tsconfig-paths/register scripts/seed-named-workflows.ts --only=a,b     # just these, from the snapshot
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

interface SelfHostOverlay {
  install: NamedWorkflow[];
  examples: Record<string, { needs: string; tool: string; warning?: string }>;
}

/** Service names a workflow definition calls. */
function servicesOf(wf: NamedWorkflow): string[] {
  const steps = ((wf.steps as { steps?: Array<{ service?: unknown }> } | null)?.steps ?? []) as Array<{ service?: unknown }>;
  return [...new Set(steps.map((st) => String(st?.service ?? '')).filter(Boolean))];
}

/** True when the service is built in, or has an ACTIVE row matched by id, then by exact name (the workflow paths' own rule). */
async function serviceIsPresent(ref: string): Promise<boolean> {
  if (ref.startsWith('paichart-')) return true;
  const row = await prisma.mCPTool.findFirst({ where: { status: 'ACTIVE', OR: [{ id: ref }, { name: ref }] }, select: { id: true } });
  return row != null;
}

async function seedSelfHost(snapshot: NamedWorkflow[]) {
  const overlay: SelfHostOverlay = JSON.parse(fs.readFileSync(path.join(__dirname, 'named-workflows.self-host.json'), 'utf-8'));
  const byName = new Map(snapshot.map((w) => [w.name, w]));
  for (const n of [...overlay.install.map((w) => w.name), ...Object.keys(overlay.examples)]) {
    if (!byName.has(n)) throw new Error(`named-workflows.self-host.json names "${n}", which is not in named-workflows.json`);
  }
  const installNames = new Set(overlay.install.map((w) => w.name));
  console.log('='.repeat(60));
  console.log(`Seeding named workflows for a SELF-HOST: ${overlay.install.length} installed, ${Object.keys(overlay.examples).length} examples (PAUSED), ${snapshot.length - overlay.install.length - Object.keys(overlay.examples).length} not created`);
  console.log('='.repeat(60));

  const write = async (wf: NamedWorkflow, status: MCPWorkflowStatus, description: string | null) => {
    const data = { description: description ?? undefined, category: wf.category ?? undefined, steps: (wf.steps ?? {}) as object, triggers: (wf.triggers ?? {}) as object, status };
    const existing = await prisma.mCPWorkflow.findUnique({ where: { name: wf.name } });
    if (existing) await prisma.mCPWorkflow.update({ where: { name: wf.name }, data: { ...data, updatedAt: new Date() } });
    else await prisma.mCPWorkflow.create({ data: { name: wf.name, ...data } });
    return existing ? 'updated' : 'created';
  };

  for (const wf of overlay.install) {
    console.log(`  ✓ ${await write(wf, MCPWorkflowStatus.ACTIVE, wf.description)}: ${wf.name} (ACTIVE — runs on a self-host)`);
  }
  for (const [name, ex] of Object.entries(overlay.examples)) {
    const wf = byName.get(name)!;
    const existing = await prisma.mCPWorkflow.findUnique({ where: { name }, select: { status: true } });
    const present = await serviceIsPresent(ex.needs);
    if (existing && existing.status === MCPWorkflowStatus.ACTIVE && present) {
      console.log(`  · left alone: ${name} (ACTIVE, and "${ex.needs}" is registered here)`);
      continue;
    }
    const prefix = `EXAMPLE — not runnable on this install. It needs a registered service named "${ex.needs}" that exposes the tool "${ex.tool}"; then set its status to Active in the Workflows editor.${ex.warning ? ' ' + ex.warning : ''}\n\n`;
    console.log(`  ⏸ ${await write(wf, MCPWorkflowStatus.PAUSED, prefix + (wf.description ?? ''))}: ${name} (PAUSED example — needs ${ex.needs})`);
  }
  // Rows from an earlier full seed that are neither installed nor examples: never deleted; paused only when they cannot run here.
  for (const wf of snapshot) {
    if (installNames.has(wf.name) || overlay.examples[wf.name]) continue;
    const existing = await prisma.mCPWorkflow.findUnique({ where: { name: wf.name }, select: { status: true } });
    if (!existing) continue;
    if (existing.status !== MCPWorkflowStatus.ACTIVE) { console.log(`  · left alone: ${wf.name} (${existing.status})`); continue; }
    const missing: string[] = [];
    for (const ref of servicesOf(wf)) if (!(await serviceIsPresent(ref))) missing.push(ref);
    if (missing.length === 0) { console.log(`  · left alone: ${wf.name} (ACTIVE, every service it calls is registered here)`); continue; }
    await prisma.mCPWorkflow.update({ where: { name: wf.name }, data: { status: MCPWorkflowStatus.PAUSED, updatedAt: new Date() } });
    console.log(`  ⏸ paused: ${wf.name} (was ACTIVE; not registered here: ${missing.join(', ')})`);
  }
  console.log('='.repeat(60));
  await prisma.$disconnect();
}

async function main() {
  const dataFile = path.join(__dirname, 'named-workflows.json');
  const workflows: NamedWorkflow[] = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  if (process.argv.includes('--self-host')) return seedSelfHost(workflows);
  // --only a,b : apply just the named workflows from the snapshot (used to bring two production rows in line without
  // re-applying the other sixteen).
  const onlyArg = process.argv.find((x) => x.startsWith('--only='));
  if (onlyArg) {
    const only = new Set(onlyArg.slice('--only='.length).split(',').map((x) => x.trim()).filter(Boolean));
    for (const n of only) if (!workflows.some((w) => w.name === n)) throw new Error(`--only names "${n}", which is not in named-workflows.json`);
    for (let i = workflows.length - 1; i >= 0; i--) if (!only.has(workflows[i].name)) workflows.splice(i, 1);
  }

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
