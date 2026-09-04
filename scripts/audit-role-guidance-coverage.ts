#!/usr/bin/env ts-node
/**
 * ROLE_GUIDANCE_LIBRARY coverage audit (companion to audit-role-guidance-contract.ts).
 *
 * The *contract* audit checks the SHAPE of entries that exist. This audit checks
 * COVERAGE: every `defaultRole` seeded into agent_templates must either
 *   (a) have a ROLE_GUIDANCE_LIBRARY entry (lib/services/agentTemplateBuilder/
 *       pAIchartUniversalTemplate.ts) — so the LLM gets role-specific persona
 *       guidance per Pattern #44 GS2, OR
 *   (b) appear in INTENTIONALLY_GENERIC_ROLES below with a documented reason.
 *
 * WHY THIS EXISTS (gap found 2026-06-16, network-provisioning spike):
 * `getRoleSpecificGuidance()` falls back to GENERIC guidance for an unknown role
 * SILENTLY — no error, no warning. The `role` axis is the one the LLM actually
 * reads (interpolated into the prompt), so a new specialist template whose role
 * is missing from the library quietly ships with weak guidance. Worse, the
 * standard authoring move — "mirror an existing seed file" — structurally CANNOT
 * surface the step, because the role-guidance entries live in a DIFFERENT file
 * than the seed. Four network-provisioning templates were authored with the
 * role-guidance step missed until an explicit re-ask. This check turns that
 * silent omission into a build-time decision.
 *
 * IMPLEMENTATION NOTE: seed files are read as TEXT, never imported. Seed scripts
 * run main()/new PrismaClient() at module load and would need DATABASE_URL (the
 * CI runner has none) — importing them would break CI. Regex extraction is the
 * safe, drift-proof approach (auto-discovers new seed-*.ts files).
 *
 * Usage:
 *   npx ts-node scripts/audit-role-guidance-coverage.ts
 *   npm run validate:role-guidance-coverage
 *
 * Exit code 1 if any seeded role lacks an entry and is not allowlisted.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { ROLE_GUIDANCE_LIBRARY } from '../lib/services/agentTemplateBuilder/pAIchartUniversalTemplate';

// Roles deliberately running on generic/base-template guidance (no library entry).
// Adding a role here is a DOCUMENTED decision — each MUST carry a reason. This is
// the escape hatch that keeps the check honest without forcing a library entry for
// roles whose guidance legitimately comes from elsewhere.
const INTENTIONALLY_GENERIC_ROLES: Record<string, string> = {
  pipeline_harness_orchestrator:
    'Harness meta-agent — its instructions come from the injected pipeline-orchestrator-protocol (loadProtocols:true), not ROLE_GUIDANCE_LIBRARY.',
  // network_state_harvester removed 2026-07-01 — network-provisioning Phase 0 now uses the shared
  // `infra_state_harvester` (which HAS a library entry), so the generic-fallback escape hatch is no longer needed.
};

// Match `defaultRole: 'snake_case'` (single or double quotes) in seed files.
const DEFAULT_ROLE_RX = /defaultRole:\s*['"]([a-z0-9_]+)['"]/g;

function collectSeededRoles(scriptsDir: string): Map<string, string[]> {
  const roleSources = new Map<string, string[]>();
  const seedFiles = readdirSync(scriptsDir).filter(f => /^seed-.*\.ts$/.test(f));
  for (const file of seedFiles) {
    const text = readFileSync(join(scriptsDir, file), 'utf8');
    let m: RegExpExecArray | null;
    DEFAULT_ROLE_RX.lastIndex = 0;
    while ((m = DEFAULT_ROLE_RX.exec(text)) !== null) {
      const role = m[1];
      if (!roleSources.has(role)) roleSources.set(role, []);
      if (!roleSources.get(role)!.includes(file)) roleSources.get(role)!.push(file);
    }
  }
  return roleSources;
}

function main(): void {
  const scriptsDir = __dirname;
  const roleSources = collectSeededRoles(scriptsDir);
  const libraryKeys = new Set(Object.keys(ROLE_GUIDANCE_LIBRARY));
  const seededRoles = [...roleSources.keys()].sort();

  const covered: string[] = [];
  const generic: string[] = [];
  const missing: string[] = [];

  for (const role of seededRoles) {
    if (libraryKeys.has(role)) covered.push(role);
    else if (role in INTENTIONALLY_GENERIC_ROLES) generic.push(role);
    else missing.push(role);
  }

  // Soft warnings — keep the allowlist honest (non-fatal).
  const warnings: string[] = [];
  for (const role of Object.keys(INTENTIONALLY_GENERIC_ROLES)) {
    if (libraryKeys.has(role)) {
      warnings.push(`'${role}' is allowlisted AND has a library entry — remove it from INTENTIONALLY_GENERIC_ROLES.`);
    }
    if (!roleSources.has(role)) {
      warnings.push(`'${role}' is allowlisted but no longer seeded anywhere — stale allowlist entry, remove it.`);
    }
  }

  console.log('Role-Guidance Coverage Audit');
  console.log('============================\n');
  console.log(`Seeded roles:        ${seededRoles.length}`);
  console.log(`✅ Have entry:        ${covered.length}`);
  console.log(`➖ Intentional generic: ${generic.length}`);
  console.log(`❌ Missing entry:     ${missing.length}\n`);

  for (const role of generic) {
    console.log(`➖ ${role}  (generic: ${INTENTIONALLY_GENERIC_ROLES[role]})`);
  }

  if (warnings.length > 0) {
    console.log('\n--- Warnings (non-fatal) ---');
    for (const w of warnings) console.log(`⚠️  ${w}`);
  }

  if (missing.length > 0) {
    console.log('\n--- Failures ---\n');
    for (const role of missing) {
      console.log(`❌ ${role}  (seeded in: ${roleSources.get(role)!.join(', ')})`);
    }
    console.log(
      '\nEvery seeded defaultRole must have role-specific guidance the LLM reads.\n' +
      'FIX ONE OF:\n' +
      '  • Add a ROLE_GUIDANCE_LIBRARY entry for the role in\n' +
      '    lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts (Pattern #44 GS2 —\n' +
      "    7-10 actionable bullets incl. **Deliverable**: and **Coordination**: subsections), OR\n" +
      '  • If the role legitimately runs on generic/base-template or protocol-injected guidance,\n' +
      '    add it to INTENTIONALLY_GENERIC_ROLES in this script WITH A REASON.\n' +
      'Background: getRoleSpecificGuidance() degrades to generic guidance SILENTLY for unknown roles.\n' +
      'See .claude/knowledge/pipelines/ADD-A-PIPELINE-HARNESS-AGENT.md.'
    );
    process.exit(1);
  }

  console.log('\n✓ Every seeded role has role-specific guidance or a documented generic exemption.');
}

main();
