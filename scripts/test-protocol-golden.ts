#!/usr/bin/env ts-node
/**
 * test-protocol-golden — the byte-identity pin for every existing agent-facing text (value-chain build B1, 2026-10-02).
 *
 * WHY: the value-chain-program build REFACTORS the seed source of protocols and role guidance that every existing run
 * reads (pov-program, network-provisioning, program_architect, infra_change_architect → shared section constants) and
 * ADDS new protocols/roles beside them. The owner's constraint is that existing runs stay byte-unchanged. "Suites green"
 * does not prove that — several seed scanners slice SOURCE text and pass vacuously after a split. This test pins what
 * agents actually RECEIVE: the rendered protocol bodies, the universal base template, the universal agent rules, and
 * every role-guidance entry.
 *
 * WHAT IT ASSERTS: every key in the golden file is PRESENT and its sha256 EQUAL. New keys are allowed (reported), so
 * additive batches pass; any byte change to an existing text fails, naming the key.
 *
 * UPDATING: `--update` rewrites the golden. A legitimate change to an existing text (a protocol edit, a guidance fix, the
 * eventual promotion) MUST ride a version bump of what changed in the same commit, and the owning seed must be reseeded —
 * the failure message prints the grep that finds it.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/test-protocol-golden.ts            # check (CI)
 *   npx ts-node -r tsconfig-paths/register scripts/test-protocol-golden.ts --update   # regenerate
 *   npx ts-node -r tsconfig-paths/register scripts/test-protocol-golden.ts --db       # ALSO compare to local DB rows
 */
// The seed module instantiates PrismaClient at load (no connection). CI has no DB — stub the URL before requiring it.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub';

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const { PROTOCOLS } = require('./seed-protocol-prompts') as { PROTOCOLS: Array<{ name: string; promptText: string; tags?: string[]; status?: string }> };
const { PROGRAM_PROTOCOL_NAMES, canonicalProtocolName } = require('../lib/agents/harness/program-protocol') as
  { PROGRAM_PROTOCOL_NAMES: readonly string[]; canonicalProtocolName: (n: string) => string };
const { UNIVERSAL_AGENT_RULES } = require('../lib/agents/universal-agent-rules');
const { PAICHART_UNIVERSAL_BASE_TEMPLATE, ROLE_GUIDANCE_LIBRARY } = require('../lib/services/agentTemplateBuilder/pAIchartUniversalTemplate');

const GOLDEN = join(__dirname, 'fixtures', 'protocol-golden.json');
type Entry = { sha256: string; chars: number };
type Golden = Record<string, Record<string, Entry>>;

const h = (t: string): Entry => ({ sha256: createHash('sha256').update(t, 'utf8').digest('hex'), chars: t.length });

function current(): Golden {
  const protocols: Record<string, Entry> = {};
  for (const p of PROTOCOLS) protocols[p.name] = h(p.promptText);
  const roles: Record<string, Entry> = {};
  for (const [k, v] of Object.entries(ROLE_GUIDANCE_LIBRARY as Record<string, string>)) roles[k] = h(v);
  return {
    protocols,
    roles,
    shared: { PAICHART_UNIVERSAL_BASE_TEMPLATE: h(PAICHART_UNIVERSAL_BASE_TEMPLATE), UNIVERSAL_AGENT_RULES: h(UNIVERSAL_AGENT_RULES) },
  };
}

async function dbCheck(cur: Golden): Promise<number> {
  // Rendered text vs what the local DB actually holds (B0 reseeded it). Out of CI: needs a real DB.
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  let bad = 0;
  try {
    const rows = await prisma.agentPromptLibrary.findMany({ where: { name: { in: Object.keys(cur.protocols) } }, select: { name: true, promptText: true } });
    for (const r of rows) {
      if (h(r.promptText).sha256 !== cur.protocols[r.name].sha256) { console.log(`  ❌ DB row ${r.name} differs from the rendered seed (reseed: npm run seed:protocols)`); bad++; }
    }
    console.log(`  DB cross-check: ${rows.length} rows compared, ${bad} differ`);
  } finally { await prisma.$disconnect(); }
  return bad;
}

/**
 * Size budgets, exclusions and the program-tier LAYERING pin. A budget is a ceiling, not a hash, so these texts stay
 * editable; the exclusions pin that the VALUE leg carries none of the change-package text it exists to drop.
 *
 * Promotion E (E2, 2026-10-05; SYNTHESIS §9 A4, AR-L2, ND5, ND7): value-chain-program is a DEPRECATED TOMBSTONE, so the
 * two comparisons against pov-program that lived here — the `vc ≤ pov + 5,000` budget and the B2b "a value-chain delta
 * names no leg token more often than pov-program does" ratchet — are DELETED (a tombstone compared with a 65 K text
 * proves nothing). They are replaced by: an ABSOLUTE ceiling on pov-program; an ABSOLUTE-ZERO layering pin over every
 * seeded program-tier row; and a CONTENT pin on the tombstone.
 */
function budgetCheck(): number {
  const text = (n: string) => PROTOCOLS.find((p) => p.name === n)?.promptText;
  const pov = text('pov-program-protocol'), nd = text('network-derivation-protocol');
  let bad = 0;
  const check = (ok: boolean, msg: string) => { console.log(`  ${ok ? '✓' : '❌'} budget: ${msg}`); if (!ok) bad++; };
  // Absolute ceiling (owner decision ND7, 2026-10-05): 65,752 = value-chain-program 1.1.1 (64,752) + 1,000. Kept only if
  // promotion E's corrections replace obsolete text; a raise (to ~66,300) is an explicit owner decision recorded here,
  // never a silent edit of this number.
  // Raised 2026-10-12 by explicit owner decision (Steve: "approve"; PHASE4-CONTAINMENT-PROPAGATION B3): +1,000 to fit
  // BRANCH D4 (net +950, pov-program 2.2.0). Never a silent drift: any further raise is another owner decision.
  const POV_PROGRAM_CEILING = 66752;
  if (pov) check(pov.length <= POV_PROGRAM_CEILING, `pov-program ${pov.length} ≤ ${POV_PROGRAM_CEILING.toLocaleString()} (ND7)`);
  if (nd) {
    check(nd.length <= 30000, `network-derivation ${nd.length} ≤ 30,000`);
    for (const banned of ['Phase 2 — Config Change-Package Author', '## Validation = facts', 'Phase 3 — Change Reviewer', 'aggregate into the final change package', '## Consumed Values']) {
      check(!nd.includes(banned), `network-derivation carries no "${banned}"`);
    }
  }
  // LAYERING PIN, ABSOLUTE (AR-L2; memory feedback_protocol_layer_independence): a PROGRAM protocol names no domain.
  // For EVERY seeded row whose name is in PROGRAM_PROTOCOL_NAMES (derived from the constant — never a hard-coded pair, so
  // a program protocol seeded later is covered the day it lands), the count of EVERY seeded leg-protocol token is ZERO.
  // Leg tokens = seeded `protocol`-tagged rows that are neither the base (`protocol-base`) nor program tier.
  // An absolute zero states the rule; a ratchet against a frozen baseline can be "re-based" by re-freezing a larger one.
  const programRows = new Set(PROGRAM_PROTOCOL_NAMES.map(canonicalProtocolName));
  const legTokens = PROTOCOLS
    .filter((p) => (p.tags ?? []).includes('protocol') && !(p.tags ?? []).includes('protocol-base') && !programRows.has(p.name))
    .map((p) => p.name.replace(/-protocol$/, ''));
  check(legTokens.includes('network-derivation') && legTokens.includes('network-provisioning'),
    `leg-token set derived non-vacuously (${legTokens.length}: ${legTokens.join(', ')})`);
  const seededProgramRows = PROTOCOLS.filter((p) => programRows.has(p.name));
  check(seededProgramRows.some((p) => p.name === 'pov-program-protocol'), 'pov-program-protocol is among the seeded program-tier rows checked');
  for (const row of seededProgramRows) {
    const leaked = legTokens.map((t) => [t, row.promptText.split(t).length - 1] as const).filter(([, n]) => n > 0);
    check(leaked.length === 0,
      `${row.name} names 0 leg-protocol tokens${leaked.length ? ` — LEAKED: ${leaked.map(([t, n]) => `${t}×${n}`).join(', ')}` : ''}`);
  }
  // TOMBSTONE, pinned by CONTENT (A4, ND5): DEPRECATED, short, and carrying the 1.1.1 recovery pointer (git object +
  // the rendered sha256 recorded at E0). It never moves again; a change here is a change to a retired row.
  const vcRow = PROTOCOLS.find((p) => p.name === 'value-chain-program-protocol');
  if (vcRow) {
    check(vcRow.status === 'DEPRECATED', `value-chain-program-protocol is seeded DEPRECATED (is ${vcRow.status ?? 'ACTIVE by default'})`);
    check(vcRow.promptText.length <= 1000, `value-chain-program tombstone ${vcRow.promptText.length} ≤ 1,000`);
    for (const must of ['git show 6f0bea84:scripts/seed-protocol-prompts.ts', 'd0176d506703df191db19ea7cc4114a05d7a20d939c1d79116c90ff0e42b48cc']) {
      check(vcRow.promptText.includes(must), `value-chain-program tombstone carries "${must.slice(0, 40)}"`);
    }
    // The seeded DESCRIPTION is the whole recovery signal of the 2a refusal (errorCode is NULL; the engine interpolates
    // it verbatim on both throw paths) — PC-E2 L3. It must keep the relaunch instruction and the HOWTO pointer, and
    // (owner decision ND8 (a)) name NO successor until the E10 regression controls pass; the post-E10 commit that
    // seeds the successor sentence inverts the last check in the same change, by design.
    const vcDesc = (vcRow as { description?: string }).description ?? '';
    check(vcDesc.includes('relaunch as a new task'), 'value-chain-program tombstone description keeps "relaunch as a new task" (2a payload)');
    check(vcDesc.includes('HOWTO-use-program-harness'), 'value-chain-program tombstone description keeps the HOWTO-use-program-harness pointer (2a payload)');
    // ND8 (a) inverted after E10 passed (2026-10-05: controls ND2/1/2/3, 0 stop-line hits) — the successor is now earned and named.
    check(vcDesc.includes('superseded by pov-program-protocol') && vcDesc.includes('(protocol: pov-program)'), 'value-chain-program tombstone description names its successor and the relaunch token (ND8 (a), post-E10)');
  } else {
    check(false, 'value-chain-program-protocol row is still seeded (a DEPRECATED tombstone — never deleted; its name stays in PROGRAM_PROTOCOL_NAMES)');
  }
  // B3 role budgets (AU-3: soft until a measured draft; measured 2026-10-02 — 18,973 / 3,799 / 5,390).
  const role = (k: string) => (ROLE_GUIDANCE_LIBRARY as Record<string, string>)[k];
  const pa = role('program_architect'), vca = role('value_chain_architect'), da = role('derivation_architect'), dr = role('derivation_reviewer');
  // Promotion E, E3 (2026-10-05; TS §1.4 / P9): ONE constant renders both Architect keys, so the old +3,000 budget
  // became strict equality — replaced in the SAME commit that deleted auditValueChainVocabulary, so nothing in CI loses
  // coverage of value_chain_architect. A fork of either key fails here.
  check(!!pa && !!vca && vca === pa, `value_chain_architect === program_architect (${vca?.length} vs ${pa?.length} chars; one constant)`);
  check(!!pa && pa.length <= 21304, `program_architect ≤ 21,304 chars (${pa?.length}) — absolute ceiling (E3 review PC-L3 / AR-F5)`);
  if (da) check(da.length <= 4500, `derivation_architect ${da.length} ≤ 4,500`);
  if (dr) check(dr.length <= 6000, `derivation_reviewer ${dr.length} ≤ 6,000`);
  return bad;
}

async function main() {
  const cur = current();
  if (process.argv.includes('--update')) {
    writeFileSync(GOLDEN, JSON.stringify(cur, null, 2) + '\n');
    const n = Object.values(cur).reduce((a, g) => a + Object.keys(g).length, 0);
    console.log(`✓ golden written: ${n} texts → ${GOLDEN}`);
    console.log('  A change to an EXISTING text must ride a version bump in the same commit, and its owning seed must be reseeded.');
    return 0;
  }
  if (!existsSync(GOLDEN)) { console.log(`❌ no golden at ${GOLDEN} — run with --update once`); return 1; }
  const gold: Golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  let failed = 0, checked = 0;
  const added: string[] = [];
  for (const [group, entries] of Object.entries(gold)) {
    for (const [key, e] of Object.entries(entries)) {
      checked++;
      const c = cur[group]?.[key];
      if (!c) { console.log(`❌ ${group}/${key}: MISSING (it existed in the golden)`); failed++; continue; }
      if (c.sha256 !== e.sha256) {
        console.log(`❌ ${group}/${key}: CHANGED (${e.chars} → ${c.chars} chars). An existing agent-facing text changed.`);
        if (group === 'roles') console.log(`   owning seed(s): grep -rln "defaultRole: '${key}'" scripts/seed-*.ts`);
        if (group === 'protocols') console.log('   protocols are seeded by scripts/seed-protocol-prompts.ts (deploy reseeds them)');
        failed++;
      }
    }
  }
  for (const [group, entries] of Object.entries(cur)) for (const key of Object.keys(entries)) if (!gold[group]?.[key]) added.push(`${group}/${key}`);
  if (added.length) console.log(`  new (allowed, not yet in golden): ${added.join(', ')}`);
  failed += budgetCheck();
  if (process.argv.includes('--db')) failed += await dbCheck(cur);
  console.log(`\n📊 golden: ${checked - failed} of ${checked} existing texts byte-identical${failed ? `, ${failed} FAILED` : ''}`);
  if (failed) console.log('   If the change is intended: bump the version of what changed, run with --update, reseed the owning seed.');
  return failed ? 1 : 0;
}

main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(1); });
