#!/usr/bin/env ts-node
/**
 * Report how far each `agent_templates` row has drifted from what the code would generate today.
 *
 * WHY THIS EXISTS. `agent_templates` rows are seeded MANUALLY. The deploy deliberately does not re-seed
 * them, because rows are editable through the GUI template editor and an every-deploy re-seed would
 * silently clobber those edits (`scripts/deploy/blue-green-deploy.sh:243-246`). That is a considered trade, not an
 * oversight — but its cost is that a correct fix can sit in the library indefinitely while agents run the
 * old text, and NOTHING measures the gap. Filed 2026-08-03, unbuilt until now.
 *
 * It has since produced two live instances. On 2026-08-04 a role-guidance fix (`93457dfc`) was committed,
 * reviewed, and invisible to production until someone happened to run the reseed by hand. The same day,
 * local rows were found stamped 2026-04-16 — four months stale — which made two separate diagnostics
 * point at phantom problems before the staleness was identified as the cause.
 *
 * ⚠️ IT REPORTS. IT DOES NOT WRITE, and it is not a gate by default (Protocol 10 — ship the fact).
 * Auto-reseeding is the thing the manual-seed policy exists to prevent. Deliver a fix with a TARGETED
 * script that refuses to overwrite what it cannot prove is machine-generated — see
 * the OWNING seed script(s) — `grep -rln "defaultRole: '<role>'" scripts/seed-*.ts`.
 *
 * ⚠️ "NOT COMPARABLE" IS REPORTED SEPARATELY AND LOUDLY, and that is the load-bearing design choice.
 * Not every row is generated from the universal base plus a library entry — the harness template builds
 * from its own base, and some roles have no `ROLE_GUIDANCE_LIBRARY` entry at all (documented exemptions,
 * see `audit-role-guidance-coverage.ts`). Folding those into "clean" would report an UNMEASURED ZERO:
 * rows that cannot be checked, counted as rows that passed. That is Register Pattern 1, and this codebase
 * has hit it enough times to name it.
 *
 * STATES:
 *   CURRENT        row === what the code generates today.
 *   STALE          row decomposes into base + guidance, but the guidance differs from the library.
 *                  Safe to refresh with a targeted reseed. THIS IS THE SIGNAL.
 *   UNVERIFIABLE   row does NOT decompose against the current base. Either GUI-edited, or seeded from an
 *                  older base. NOT safe to auto-refresh — the reported prefix-match % separates the two.
 *   NOT COMPARABLE no library entry for the role, so there is nothing to compare against.
 *
 * Usage:
 *   npm run report:template-freshness            # report, always exit 0
 *   npm run report:template-freshness -- --strict  # exit 1 if any row is STALE (for a caller that wants a gate)
 *   npm run report:template-freshness -- --verbose # show the differing lines
 */
import { prisma } from '@/lib/prisma';
import { AGENT_MODELS } from '@/lib/agents/model-tiers';
import { buildHarnessPromptTemplate } from '@/lib/agents/harness-template';
import { DEFAULT_MAX_TOKENS } from '@/lib/services/llm/types';
import {
  PAICHART_UNIVERSAL_BASE_TEMPLATE,
  ROLE_GUIDANCE_LIBRARY,
  getRoleSpecificGuidance,
} from '@/lib/services/agentTemplateBuilder/pAIchartUniversalTemplate';

const MARKER = '${roleSpecificGuidance}';
const STRICT = process.argv.includes('--strict');
const VERBOSE = process.argv.includes('--verbose');

type State = 'CURRENT' | 'STALE' | 'UNVERIFIABLE' | 'NOT COMPARABLE';

/**
 * Templates whose seed script defines its OWN base (a `const PROMPT_TEMPLATE` local to the script)
 * rather than using PAICHART_UNIVERSAL_BASE_TEMPLATE. They cannot be checked by this method, and calling
 * them DIVERGED accuses them of a GUI edit they do not have. Verified 2026-08-04 by reading the scripts.
 * A NEW own-base template will surface as UNVERIFIABLE, which is the correct answer until someone adds it
 * here — the list failing open is deliberate.
 */
const OWN_GENERATOR = new Set(['MCP Service Orchestrator', 'MCP Workflow Orchestrator']);

interface Row {
  name: string;
  role: string;
  updatedAt: Date;
  state: State;
  detail: string;
  diffs: Array<{ from: string; to: string }>;
}

function decompose(live: string): string | null {
  const i = PAICHART_UNIVERSAL_BASE_TEMPLATE.indexOf(MARKER);
  if (i < 0) throw new Error('base template no longer contains the guidance marker — aborting');
  const prefix = PAICHART_UNIVERSAL_BASE_TEMPLATE.slice(0, i);
  const suffix = PAICHART_UNIVERSAL_BASE_TEMPLATE.slice(i + MARKER.length);
  if (!live.startsWith(prefix)) return null;
  if (suffix && !live.endsWith(suffix)) return null;
  return live.slice(prefix.length, suffix ? live.length - suffix.length : undefined);
}

function diffLines(a: string, b: string): Array<{ from: string; to: string }> {
  const A = a.split('\n');
  const B = b.split('\n');
  const out: Array<{ from: string; to: string }> = [];
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    if ((A[i] ?? '') !== (B[i] ?? '')) out.push({ from: A[i] ?? '(absent)', to: B[i] ?? '(absent)' });
  }
  return out;
}

/**
 * Templates seeded from their OWN base rather than the universal one, but whose text is now
 * importable and therefore CHECKABLE (2026-08-27).
 *
 * These used to fall straight into NOT COMPARABLE — "unmeasured", which for `Pipeline Harness`
 * meant the orchestrator of every pipeline run had no automated text verification anywhere.
 * The fix is not a special case in the checker: it is that the template TEXT moved into a
 * side-effect-free module the seeder and the checker both import, so there is ONE construction and
 * a checker cannot disagree with the seeder about what "current" means.
 *
 * To add another: extract its text out of its seed script the same way, then register the builder.
 */
const OWN_GENERATOR_BUILDERS: Record<string, () => string> = {
  'Pipeline Harness': buildHarnessPromptTemplate,
};

/** Templates seeded as the BARE base with the placeholder unsubstituted, ON PURPOSE. */
const BARE_BASE_BY_DESIGN = new Set(['pAIchart Universal Agent Template']);

/**
 * modelParameters drift — a SECOND, INDEPENDENT axis (added 2026-08-27).
 *
 * The prompt comparison covers `promptTemplate` ONLY, so a row can be prompt-CURRENT while its
 * model or token ceiling has drifted and the report still prints a clean bill. That gap was real:
 * until today the only check that a model/maxTokens delivery had landed was a one-off script's own
 * post-verify, and deleting the spent script would have taken the check with it.
 *
 * Both sides are importable, so this is a genuine comparison, not a heuristic: the model must be one
 * of the sanctioned `AGENT_MODELS` tiers and maxTokens must equal `DEFAULT_MAX_TOKENS`. It
 * deliberately does NOT assert WHICH tier a given row belongs on — that mapping lives in the seed
 * scripts' data blocks, which cannot be imported without executing them. Off-tier is reported as a
 * FACT to look at, never as a verdict (Protocol 10).
 */
function checkModelParams(metadata: unknown): string | null {
  const mp = (metadata as any)?.modelParameters;
  if (!mp) return 'no modelParameters on the row';
  const problems: string[] = [];
  const tiers = new Set<string>(Object.values(AGENT_MODELS) as string[]);
  if (!mp.model) problems.push('no model set');
  else if (!tiers.has(mp.model)) problems.push(`model "${mp.model}" is not a sanctioned tier`);
  if (mp.maxTokens !== DEFAULT_MAX_TOKENS) problems.push(`maxTokens ${mp.maxTokens} !== DEFAULT_MAX_TOKENS ${DEFAULT_MAX_TOKENS}`);
  return problems.length ? problems.join('; ') : null;
}

async function main() {
  const templates = await prisma.agentTemplate.findMany({
    where: { status: 'ACTIVE' },
    select: { name: true, defaultRole: true, promptTemplate: true, updatedAt: true, metadata: true },
    orderBy: { name: 'asc' },
  });

  const rows: Row[] = [];
  const modelDrift: Array<{ name: string; role: string; problem: string }> = [];
  for (const t of templates) {
    // Independent of the prompt verdict: a prompt-CURRENT row can still be model-drifted.
    const mpProblem = checkModelParams(t.metadata);
    if (mpProblem) modelDrift.push({ name: t.name, role: t.defaultRole, problem: mpProblem });
    const live = t.promptTemplate ?? '';
    const role = t.defaultRole;
    const base = { name: t.name, role, updatedAt: t.updatedAt, diffs: [] as Row['diffs'] };

    // Own-generator templates we CAN verify, because their text is importable.
    const builder = OWN_GENERATOR_BUILDERS[t.name];
    if (builder) {
      const want = builder();
      rows.push(live === want
        ? { ...base, state: 'CURRENT', detail: 'own generator (verified against its extracted module)' }
        : { ...base, state: 'STALE', detail: `own generator — live text differs from ${t.name}'s module (${live.length} vs ${want.length} chars)` });
      continue;
    }
    if (!ROLE_GUIDANCE_LIBRARY[role]) {
      rows.push({ ...base, state: 'NOT COMPARABLE', detail: 'no ROLE_GUIDANCE_LIBRARY entry for this role' });
      continue;
    }
    if (OWN_GENERATOR.has(t.name)) {
      rows.push({ ...base, state: 'NOT COMPARABLE', detail: 'seeded from its own base template, not the universal one' });
      continue;
    }
    // The generic row is seeded as the BARE base, placeholder unsubstituted, ON PURPOSE
    // (`seed-agent-templates.ts:53`). Comparing it against base+guidance reports ~11 differing lines and
    // is a FALSE POSITIVE — it was this checker's single STALE finding on its first run.
    // NAME-SCOPED (2026-08-27). This exemption previously applied to ANY role, so a row whose
    // guidance had been wiped back to the bare base would read "CURRENT — by design" forever.
    // Only the Universal template is seeded unsubstituted on purpose.
    if (live === PAICHART_UNIVERSAL_BASE_TEMPLATE) {
      if (BARE_BASE_BY_DESIGN.has(t.name)) {
        rows.push({ ...base, state: 'CURRENT', detail: 'bare base template (placeholder unsubstituted by design)' });
      } else {
        rows.push({ ...base, state: 'STALE', detail: 'guidance MISSING — row is the bare base, but this template is not seeded that way' });
      }
      continue;
    }

    const guidance = getRoleSpecificGuidance(role);
    const expected = PAICHART_UNIVERSAL_BASE_TEMPLATE.replace(MARKER, guidance);
    if (live === expected) {
      rows.push({ ...base, state: 'CURRENT', detail: '' });
      continue;
    }

    const extracted = decompose(live);
    if (extracted === null) {
      // Report HOW FAR the row tracks the current base. A GUI-edited row typically matches most of the
      // prefix and diverges late; a row seeded from an older base diverges early. The reader classifies —
      // this only supplies the number that makes classification possible.
      const i = PAICHART_UNIVERSAL_BASE_TEMPLATE.indexOf(MARKER);
      const prefix = PAICHART_UNIVERSAL_BASE_TEMPLATE.slice(0, i);
      let k = 0;
      while (k < prefix.length && k < live.length && prefix[k] === live[k]) k++;
      rows.push({
        ...base,
        state: 'UNVERIFIABLE',
        detail: `matches ${((100 * k) / prefix.length).toFixed(0)}% of the current base prefix — GUI edit, or seeded from an older base`,
      });
      continue;
    }

    const diffs = diffLines(extracted, guidance);
    rows.push({ ...base, state: 'STALE', detail: `${diffs.length} guidance line(s) differ`, diffs });
  }

  const by = (s: State) => rows.filter(r => r.state === s);
  const bar = '='.repeat(104);
  console.log(`\n${bar}`);
  console.log('  AGENT TEMPLATE FRESHNESS — live rows vs what the code generates today');
  console.log(`  ${templates.length} ACTIVE template(s)`);
  console.log(bar);

  for (const state of ['STALE', 'UNVERIFIABLE', 'NOT COMPARABLE', 'CURRENT'] as State[]) {
    const set = by(state);
    const icon = { STALE: '🟡', UNVERIFIABLE: '🔴', 'NOT COMPARABLE': '⚪', CURRENT: '✅' }[state];
    console.log(`\n${icon} ${state} (${set.length})`);
    if (set.length === 0) {
      console.log('   (none)');
      continue;
    }
    for (const r of set) {
      const age = r.updatedAt.toISOString().slice(0, 10);
      console.log(`   ${r.name.padEnd(34)} ${r.role.padEnd(28)} ${age}${r.detail ? `  — ${r.detail}` : ''}`);
      if (VERBOSE && r.diffs.length) {
        for (const d of r.diffs.slice(0, 4)) {
          console.log(`       - ${d.from.trim().slice(0, 88)}`);
          console.log(`       + ${d.to.trim().slice(0, 88)}`);
        }
        if (r.diffs.length > 4) console.log(`       … ${r.diffs.length - 4} more`);
      }
    }
  }

  // ── second axis: modelParameters ────────────────────────────────────────────────────────
  console.log(`\n${'-'.repeat(104)}`);
  if (modelDrift.length === 0) {
    console.log(`  ✅ modelParameters: all ${templates.length} ACTIVE row(s) on a sanctioned tier at maxTokens ${DEFAULT_MAX_TOKENS}`);
  } else {
    console.log(`  🟡 modelParameters DRIFT (${modelDrift.length}) — prompt state above says nothing about these:`);
    for (const d of modelDrift) console.log(`     ${d.name.padEnd(34)} ${d.role.padEnd(28)} ${d.problem}`);
    console.log(`     Deliver by re-running the OWNING seed script(s); they write modelParameters from`);
    console.log(`     lib/agents/model-tiers.ts + DEFAULT_MAX_TOKENS.`);
  }

  console.log(`\n${'-'.repeat(104)}`);
  if (by('STALE').length > 0) {
    console.log('  🟡 STALE rows carry library changes that agents are NOT running. Deliver them by');
    console.log('     re-running the OWNING seed script(s) for the role — find them with:');
    console.log('       grep -rln "defaultRole: \'<role>\'" scripts/seed-*.ts   (a role can have SEVERAL owners)');
    console.log('     They rebuild the whole row from source of truth. Do NOT run the generic');
    console.log('     seed-agent-templates.ts to fix a domain role.');
  }
  if (by('UNVERIFIABLE').length > 0) {
    console.log('  🔴 UNVERIFIABLE rows cannot be refreshed automatically. Inspect each by hand: a GUI edit is');
    console.log('     worth keeping; a stale base template is worth re-seeding. The prefix % separates them.');
  }
  if (by('NOT COMPARABLE').length > 0) {
    console.log('  ⚪ NOT COMPARABLE rows were NOT checked. They are not clean — they are unmeasured.');
  }
  if (by('STALE').length === 0 && by('UNVERIFIABLE').length === 0) {
    console.log('  ✅ Every comparable row matches the code on BOTH axes checked.');
  }
  // Say what is NOT covered, so "0 STALE" is never read as "the whole row is verified".
  console.log('  ℹ️  COVERED: promptTemplate (base + role guidance) and modelParameters.');
  console.log('     NOT covered: metadata.protocol / loadProtocols, constraints, capabilities, tags,');
  console.log('     defaultRole. Their expected values live in the seed scripts\' data blocks, which');
  console.log('     cannot be imported without executing them. Re-running the owning seed script');
  console.log('     RESTORES them from source of truth — but nothing here DETECTS their drift.');
  console.log(`${'-'.repeat(104)}\n`);

  await prisma.$disconnect();
  process.exit(STRICT && by('STALE').length > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('❌ failed:', e instanceof Error ? e.message : e);
  process.exit(2);
});
