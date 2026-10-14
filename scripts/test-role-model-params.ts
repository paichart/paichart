/**
 * test:role-model-params — pins the per-role model-parameter table (lib/agents/role-model-params.ts, 2026-09-29).
 *
 * Why these checks: the panel (cline_docs/reviews/requirements-author-output-budget-2026-09-29/) found the binding
 * limit on a long single-call Author is the EXECUTION WATCHDOG, not the model's output ceiling — so a ceiling raised
 * past what the watchdog fits turns a truncation into a watchdog kill. Every bound here is DERIVED from the runtime
 * constants, never restated, so a change to the watchdog formula or the throughput floor re-checks this table.
 * Pure: no database, no network.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  ROLE_MODEL_PARAMS, expectedMaxTokens, LONG_DOCUMENT_MAX_TOKENS, expectedMaxToolTurns, roleToolTurnParams,
  PROGRAM_ARCHITECT_MAX_TOOL_TURNS,
} from '../lib/agents/role-model-params';
import { ROLE_READ_BUDGETS, readBudgetFor, PROGRAM_ARCHITECT_READ_BUDGET } from '../lib/agents/role-read-budget';
import { createPagerState } from '../lib/agents/harness/agentic-tool-loop';
import { DEFAULT_MAX_TOKENS } from '../lib/services/llm/types';
import { RUNTIME_LIMITS, maxOutputTokensForModel } from '../lib/validation/runtime-limits';
import { AGENT_MODELS } from '../lib/agents/model-tiers';

let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { passed++; console.log(`✅ ${name}`); } else { failed++; console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

// 1. Watchdog fit — a first attempt at the full ceiling, at the throughput FLOOR, plus the retry safety margin, must
//    fit the watchdog that ROLE's turn count gets (the default 30 unless the table sets maxToolTurns).
const turnsFor = (role: string) => expectedMaxToolTurns(role) ?? RUNTIME_LIMITS.DEFAULT_TOOL_TURNS;
const watchdogMsFor = (turns: number) => RUNTIME_LIMITS.EXECUTION_TIMEOUT_BASE_MS + turns * RUNTIME_LIMITS.EXECUTION_TIMEOUT_PER_TURN_MS;
for (const [role, p] of Object.entries(ROLE_MODEL_PARAMS)) {
  if (p.maxTokens === undefined) continue;
  const watchdogSec = watchdogMsFor(turnsFor(role)) / 1000;
  const needSec = p.maxTokens / RUNTIME_LIMITS.OUTPUT_TOKENS_PER_SEC_FLOOR + RUNTIME_LIMITS.TRUNCATION_RETRY_SAFETY_MS / 1000;
  check(`${role}: ${p.maxTokens} tokens fits the ${watchdogSec}s watchdog at ${RUNTIME_LIMITS.OUTPUT_TOKENS_PER_SEC_FLOOR} tok/s`,
    needSec <= watchdogSec, `needs ${needSec.toFixed(0)}s`);
  // 2. Never above what any sanctioned tier's model accepts (a value the API would clamp is a value nobody gets).
  const ceilings = (Object.values(AGENT_MODELS) as string[]).map(m => [m, maxOutputTokensForModel(m)] as const);
  const over = ceilings.filter(([, c]) => p.maxTokens! > c);
  check(`${role}: ${p.maxTokens} is within every sanctioned tier's output ceiling`, over.length === 0,
    over.map(([m, c]) => `${m} ${c}`).join(', '));
  // 3. An entry exists only to RAISE a role above the default; an entry at or below it is dead weight.
  check(`${role}: entry is above DEFAULT_MAX_TOKENS (${DEFAULT_MAX_TOKENS})`, p.maxTokens > DEFAULT_MAX_TOKENS);
}

// 4. The measured roles resolve as decided; everything else falls back to the default.
check('requirements_author resolves to LONG_DOCUMENT_MAX_TOKENS', expectedMaxTokens('requirements_author') === LONG_DOCUMENT_MAX_TOKENS);
check('requirements_reviewer stays at DEFAULT_MAX_TOKENS (no reviewer output data yet — panel)',
  expectedMaxTokens('requirements_reviewer') === DEFAULT_MAX_TOKENS);
check('an unknown / missing role resolves to DEFAULT_MAX_TOKENS',
  expectedMaxTokens('no_such_role') === DEFAULT_MAX_TOKENS && expectedMaxTokens(undefined) === DEFAULT_MAX_TOKENS);

// 4b. Tool turns (owner decision R1 option A, 2026-10-12). The engine/stream resolve a template's turn cap as
//     min(finite positive metadata.modelParameters.maxToolTurns || DEFAULT_TOOL_TURNS, MAX_TOOL_TURNS) — replicated
//     here (test-dual-path-timeout-parity pins that both paths share it) so the pin is on the EFFECTIVE value.
const resolveTurns = (raw: unknown) => {
  const n = Number(raw);
  return Math.min(Number.isFinite(n) && n > 0 ? n : RUNTIME_LIMITS.DEFAULT_TOOL_TURNS, RUNTIME_LIMITS.MAX_TOOL_TURNS);
};
check('program_architect resolves to 48 turns', resolveTurns(roleToolTurnParams('program_architect').maxToolTurns) === 48
  && PROGRAM_ARCHITECT_MAX_TOOL_TURNS === 48);
check('value_chain_architect (same guidance constant, DEPRECATED row) resolves to 48 turns',
  resolveTurns(roleToolTurnParams('value_chain_architect').maxToolTurns) === 48);
check('program_architect at 48 turns: per-run read cap is 12 (= its pagesPerRun)',
  createPagerState(resolveTurns(48), readBudgetFor('program_architect')).maxPagerTurns === 12
  && PROGRAM_ARCHITECT_READ_BUDGET.pagesPerRun === 12);
check('48 is the SMALLEST cap that reaches 12 (47 → 11; the default 30 → 7)',
  createPagerState(47, PROGRAM_ARCHITECT_READ_BUDGET).maxPagerTurns === 11
  && createPagerState(RUNTIME_LIMITS.DEFAULT_TOOL_TURNS, PROGRAM_ARCHITECT_READ_BUDGET).maxPagerTurns === 7);
for (const role of Object.keys(ROLE_READ_BUDGETS)) {
  const b = readBudgetFor(role);
  check(`${role}: its read budget's per-run cap (${b.pagesPerRun}) is reachable at its turn cap (${turnsFor(role)})`,
    createPagerState(resolveTurns(expectedMaxToolTurns(role)), b).maxPagerTurns === b.pagesPerRun);
}
check('watchdog: 1,080 s at the default 30 turns → 1,620 s at 48',
  watchdogMsFor(RUNTIME_LIMITS.DEFAULT_TOOL_TURNS) === 1_080_000 && watchdogMsFor(turnsFor('program_architect')) === 1_620_000);
check('48-turn watchdog stays under the RUNNING reaper (no false FAILED mid-flight)',
  watchdogMsFor(48) < RUNTIME_LIMITS.EXECUTION_REAPER_RUNNING_MS);
for (const [role, p] of Object.entries(ROLE_MODEL_PARAMS)) {
  if (p.maxToolTurns === undefined) continue;
  check(`${role}: maxToolTurns ${p.maxToolTurns} is an integer above the default and within MAX_TOOL_TURNS`,
    Number.isInteger(p.maxToolTurns) && p.maxToolTurns > RUNTIME_LIMITS.DEFAULT_TOOL_TURNS
    && p.maxToolTurns <= RUNTIME_LIMITS.MAX_TOOL_TURNS);
}
//     Every other role writes NO key (→ engine default, unchanged). Exactly two roles carry a turn entry.
const turnRoles = Object.entries(ROLE_MODEL_PARAMS).filter(([, p]) => p.maxToolTurns !== undefined).map(([r]) => r).sort();
check('exactly program_architect + value_chain_architect carry a maxToolTurns entry', turnRoles.join(',') === 'program_architect,value_chain_architect',
  turnRoles.join(','));
const seededRoles = new Set<string>();
for (const f of readdirSync(__dirname).filter(f => /^seed-.*\.ts$/.test(f))) {
  for (const m of readFileSync(join(__dirname, f), 'utf8').matchAll(/defaultRole:\s*'([a-z_]+)'/g)) seededRoles.add(m[1]);
}
const othersWithKey = [...seededRoles].filter(r => !turnRoles.includes(r) && 'maxToolTurns' in roleToolTurnParams(r));
check(`every other seeded defaultRole (${seededRoles.size - turnRoles.length}) writes no maxToolTurns key`,
  seededRoles.size > 20 && othersWithKey.length === 0, othersWithKey.join(','));
check('near-miss keys get no turn entry (__proto__, constructor, Program Architect, null)',
  ['__proto__', 'constructor', 'toString', 'Program Architect', 'program_architect ', ''].every(r => expectedMaxToolTurns(r) === undefined)
  && expectedMaxToolTurns(null) === undefined && expectedMaxTokens('constructor') === DEFAULT_MAX_TOKENS);
//     Which seeds write maxToolTurns at all (comments stripped): the harness (its own literal 100), the terraform
//     harvester ROW (IM-6 literal 60 — per-ROW, not per-role: infra_state_harvester has five owners and only this row
//     departs) and the two Architect owners (from the table) — nothing else, so no other template's turn limit moved.
const writers = readdirSync(__dirname).filter(f => /^seed-.*\.ts$/.test(f)).filter(f =>
  readFileSync(join(__dirname, f), 'utf8').split('\n').some(l => /maxToolTurns|roleToolTurnParams/.test(l.replace(/\/\/.*$/, '')))).sort();
check('seeds writing a turn cap: harness + terraform harvester row + the two Architect owners only',
  writers.join(',') === 'seed-harness-template.ts,seed-program-templates.ts,seed-terraform-iac-templates.ts,seed-value-chain-templates.ts',
  writers.join(','));
check('the terraform harvester row keeps its own 60 (and is the only turn literal in that seed)',
  (readFileSync(join(__dirname, 'seed-terraform-iac-templates.ts'), 'utf8').split('\n')
    .filter(l => /maxToolTurns:\s*\d/.test(l.replace(/\/\/.*$/, ''))).map(l => l.match(/maxToolTurns:\s*(\d+)/)![1])).join(',') === '60');
check('the Pipeline Harness keeps its own 100', /maxToolTurns:\s*100,/.test(readFileSync(join(__dirname, 'seed-harness-template.ts'), 'utf8')));
for (const f of ['seed-program-templates.ts', 'seed-value-chain-templates.ts']) {
  const src = readFileSync(join(__dirname, f), 'utf8');
  check(`${f}: modelParameters spreads roleToolTurnParams(role), passed each template's defaultRole`,
    /\.\.\.roleToolTurnParams\(role\)/.test(src)
    && /modelParameters\(template\.model, template\.timeout, template\.defaultRole\)/.test(src));
}

// 5. Single source — the owning seed WRITES from the table and the freshness report EXPECTS from it. If either stops
//    reading it, a reseeded row is reported as permanent drift (or the report's remedy writes the default back).
const seed = readFileSync(join(__dirname, 'seed-requirements-authoring-templates.ts'), 'utf8');
const report = readFileSync(join(__dirname, 'report-template-freshness.ts'), 'utf8');
check('owning seed writes maxTokens from expectedMaxTokens(role)', /maxTokens:\s*expectedMaxTokens\(role\)/.test(seed));
check('owning seed passes each template\'s own role', (seed.match(/MODEL_PARAMS\('(?:infra|synthesis|requirementsAuthor)', \d+, '[a-z_]+'\)/g) || []).length === 3);
check('freshness report expects maxToolTurns from expectedMaxToolTurns(role)', /expectedMaxToolTurns\(role\)/.test(report));
check('freshness report expects maxTokens from expectedMaxTokens(role)', /expectedMaxTokens\(role\)/.test(report)
  && /checkModelParams\(t\.metadata, t\.defaultRole\)/.test(report));

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
