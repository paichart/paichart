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

// The Program Architect chooses each program leg's `(protocol: <token>)` from a CLOSED list inside
// its own ROLE_GUIDANCE_LIBRARY entry. Nothing connected that list to the protocol rows it names,
// so it went stale silently: `observability-config` shipped 2026-09-10 and was still absent on
// 2026-09-18 — in the same bullet warning that a mis-tokened entry misroutes a whole pipeline. A
// stale list fails in the SAME DIRECTION as no list: the Architect has no sanctioned token for the
// new domain, composes one, and it passes create time unchallenged (protocol resolution is a pure
// name rule with no library lookup) and fails at leg execution, after gate approval.
//
// Protocol rows that are NOT composable into a program DAG. Each carries a reason a future author
// must EDIT rather than delete. Same discipline as INTENTIONALLY_GENERIC_ROLES above.
const NON_PROGRAM_LEG_PROTOCOLS: Record<string, string> = {
  'pipeline-orchestrator-protocol':
    'The default base every harness composes over — not a domain a DAG entry can name.',
  'pov-program-protocol':
    'Program tier (a pipeline OF pipelines). A program leg is a leg, never another program.',
  'research-program-protocol':
    'Program tier, same reason. DB-only row that may be absent from the seed entirely — its ' +
    'stale-entry warning below is expected, not a finding.',
  'requirements-authoring-protocol':
    'Generates the SPECIFICATION a program is graded against — it cannot be a leg OF that program. ' +
    'D2 of its design rejects the recursion outright (a program generating a program\'s spec is ' +
    'recursive complexity for no benefit), and D3 makes it OPTIONAL and off the critical path: it ' +
    'runs when a customer does not write their own requirements.md, and its output is consumed by a ' +
    'HUMAN at the plan gate, never by a downstream leg. If that ever changes, ADD the token to the ' +
    'Architect vocabulary and DELETE this entry — never leave both. ' +
    '(template-system, 2026-09-21 review F5 — cline_docs/reviews/requirements-authoring-review-2026-09-21/.)',
  'artifact-synthesis-protocol':
    'Leg tier and it WOULD resolve, but the program machinery is provisioning-shaped: the interface ' +
    'contract carries subnets/VLANs/ASNs/tags, ingestion requires a topology with `nodes`, and the ' +
    'Step-5 gate reads derivationContainment (a harvest-vs-derive net). No synthesis leg has been ' +
    'composed into a program as of 2026-09-18 (seed corpus; production runs not queried). If you ' +
    'make one composable, ADD the token to the Architect vocabulary and DELETE this entry — never ' +
    'leave both.',
};

// Protocol rows as authored in the seed. Anchored to the row key so a `name:` inside a changelog
// string cannot match. A false positive here is LOUD (a build failure), never silent.
const PROTOCOL_ROW_RX = /\n\s*name:\s*'([a-z0-9-]+-protocol)'/g;

/** Returns [failures, warnings]. Failures exit 1; warnings keep the allowlist honest. */
function auditArchitectVocabulary(scriptsDir: string): [string[], string[]] {
  const failures: string[] = [];
  const warnings: string[] = [];
  const guidance = ROLE_GUIDANCE_LIBRARY['program_architect'];
  if (!guidance) {
    return [['program_architect has no ROLE_GUIDANCE_LIBRARY entry — the domain-token vocabulary check cannot run.'], warnings];
  }

  const seed = readFileSync(join(scriptsDir, 'seed-protocol-prompts.ts'), 'utf8');
  const rows = new Set<string>();
  let m: RegExpExecArray | null;
  PROTOCOL_ROW_RX.lastIndex = 0;
  while ((m = PROTOCOL_ROW_RX.exec(seed)) !== null) rows.add(m[1]);

  for (const row of [...rows].sort()) {
    if (row in NON_PROGRAM_LEG_PROTOCOLS) continue;
    const token = row.replace(/-protocol$/, '');
    if (!guidance.includes(token)) {
      failures.push(
        `'${token}' is a seeded protocol row (${row}) but is absent from the program_architect ` +
        `domain-token vocabulary.\n     FIX ONE OF:\n` +
        `       • add it to the "Map each per-pipeline objective" bullet in\n` +
        `         lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts, then reseed\n` +
        `         scripts/seed-program-templates.ts (report:template-freshness will show it STALE), OR\n` +
        `       • add '${row}' to NON_PROGRAM_LEG_PROTOCOLS in this script WITH A REASON.`
      );
    }
  }
  for (const row of Object.keys(NON_PROGRAM_LEG_PROTOCOLS)) {
    if (!rows.has(row)) {
      warnings.push(`'${row}' is allowlisted as a non-leg protocol but is not a seeded row — stale entry unless it is DB-only.`);
    }
  }
  return [failures, warnings];
}

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

  const [vocabFailures, vocabWarnings] = auditArchitectVocabulary(scriptsDir);
  warnings.push(...vocabWarnings);

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

  if (missing.length > 0 || vocabFailures.length > 0) {
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
    for (const f of vocabFailures) console.log(`❌ ${f}`);
    process.exit(1);
  }

  console.log('\n✓ Every seeded role has role-specific guidance or a documented generic exemption.');
}

main();
