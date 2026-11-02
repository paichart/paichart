#!/usr/bin/env ts-node
/**
 * canary-plan.ts — print the exact launch plan for a CANARY re-run of the latest released program. READ-ONLY.
 *
 *   npm run report:canary-plan                          # the latest released program
 *   npm run report:canary-plan -- --root <root id>      # a specific released root
 *   npm run report:canary-plan -- --expect pov-program-protocol@2.2.1   # pre-fill the report:canary --expect
 *
 * The no-regression rule (Protocol 16, rule 3): after every agent-text deploy, re-run the latest released program from its
 * published spec as a NEW root; it must release again. Setting one up meant looking up the root's title, description, spec URLs,
 * POV team and phase by hand. This prints all of it, filled in, plus the launch calls, the rig probe and the verdict command.
 *
 * It CREATES NOTHING on purpose: a POV, stage and task must be created through the app (permissions, team setup, activity
 * records), so the printed calls are run by the operator — or by the coordinator on the owner's go — through MCP. It also does not
 * spend: launching the canary costs about one program run (~$12) and is the owner's decision.
 *
 * Every query runs inside ONE transaction set READ ONLY. Run from the server (`cd current && source .env.production`).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const rootId = arg('--root');
      const roots = await tx.$queryRaw<Array<{ id: string; title: string; description: string | null; povId: string; stage_id: string; completed_at: Date | null; metadata: unknown }>>`
        SELECT id, title, description, pov_id AS "povId", stage_id, completed_at, metadata FROM tasks
        WHERE type = 'PIPELINE' AND metadata->>'protocol' = 'pov-program-protocol' AND metadata->>'programReleasable' = 'true'
          AND (${rootId ?? null}::text IS NULL OR id = ${rootId ?? null})
        ORDER BY completed_at DESC NULLS LAST LIMIT 1`;
      const root = roots[0];
      if (!root) { console.error(rootId ? `no released pov-program root ${rootId}` : 'no released pov-program root found'); process.exit(2); }
      const [pov] = await tx.$queryRaw<Array<{ title: string; description: string | null; objective: string | null; teamId: string | null }>>`
        SELECT title, description, objective, "teamId" FROM "POV" WHERE id = ${root.povId}`;
      const team = pov?.teamId ? await tx.$queryRaw<Array<{ id: string; name: string | null; email: string; role: string }>>`
        SELECT u.id, u.name, u.email, tm.role::text AS role FROM "TeamMember" tm JOIN "User" u ON u.id = tm."userId" WHERE tm."teamId" = ${pov.teamId} ORDER BY tm.role` : [];
      const [stage] = await tx.$queryRaw<Array<{ name: string; phaseName: string; phaseType: string }>>`
        SELECT s.name, p.name AS "phaseName", p.type::text AS "phaseType" FROM stages s JOIN "Phase" p ON p.id = s."phaseId" WHERE s.id = ${root.stage_id}`;
      const urls = (root.description ?? '').match(/https:\/\/\S+/g) ?? [];
      const expect = arg('--expect') ?? '<changed protocol>@<new version>';

      console.log(`CANARY PLAN — re-run of released root ${root.id} (completed ${root.completed_at?.toISOString() ?? '?'}; programReleasable: true)`);
      console.log(`\nSpec URLs (verify their served bytes are unchanged before launch):`); urls.forEach(u => console.log(`  ${u}`));
      console.log(`\n1. NEW POV (fresh: no duplicate clearance, and agents cannot reach older runs). Name and text describe the WORK, never the test.`);
      console.log(`   title (copy, or a variant that still describes the work): ${pov?.title}`);
      console.log(`   description: ${pov?.description ?? ''}`);
      console.log(`   objective: ${pov?.objective ?? ''}`);
      console.log(`   team to add (same as the released run):`); team.forEach(m => console.log(`     ${m.role.padEnd(16)} ${m.name ?? ''} <${m.email}> ${m.id}`));
      console.log(`   phases: [{ name: "${stage?.phaseName}", type: "${stage?.phaseType}" }]`);
      console.log(`   → perform pov.create {title, description, objective, status: IN_PROGRESS, countryName, phases}, then pov.update {projectManager, salesEngineers}`);
      console.log(`\n2. STAGE in that phase: name "${stage?.name}"  → perform stage.create {povId, phaseId, name}`);
      console.log(`\n3. ROOT TASK (title and description BYTE-IDENTICAL to the released root):`);
      console.log(`   type: PIPELINE · priority: HIGH`);
      console.log(`   title: ${root.title}`);
      console.log(`   description:\n${(root.description ?? '').split('\n').map(l => '     ' + l).join('\n')}`);
      console.log(`   → perform task.create {povId, stageId, type: PIPELINE, priority: HIGH, title, description}`);
      console.log(`   → perform agent.assign {taskId, agentTemplateId: <Pipeline Harness>}   (a PIPELINE task never starts on assign)`);
      console.log(`\n4. BEFORE LAUNCH: the deploy has landed (prod protocol row reads the new version) · 0 executions in flight · rigs up`);
      console.log(`   rig probe (read-only): see .claude/knowledge/pipelines/RIG-HOSTING.md — containers, the four tunnels, the ingress's kind network`);
      console.log(`   pre-register the canary in the run sheet: expected outcome, the change's live control, stop lines, cap (~$20)`);
      console.log(`\n5. LAUNCH (owner's spend, ~$12): perform agent.execute {taskId, waitForCompletion: false}`);
      console.log(`   release each gate after: npm run report:gate -- <gate id>`);
      console.log(`\n6. VERDICT: npm run report:canary -- --root <new root id> --expect ${expect} [--control <name>]`);
      console.log(`   then hand-read every leg; record the close-out in the run sheet; a passing canary is a candidate golden case.`);
    }, { timeout: 60_000 });
  } finally { await prisma.$disconnect(); }
}
main().catch(e => { console.error(e); process.exit(1); });
