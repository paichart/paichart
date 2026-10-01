/**
 * test:role-model-params — pins the per-role model-parameter table (lib/agents/role-model-params.ts, 2026-09-29).
 *
 * Why these checks: the panel (cline_docs/reviews/requirements-author-output-budget-2026-09-29/) found the binding
 * limit on a long single-call Author is the EXECUTION WATCHDOG, not the model's output ceiling — so a ceiling raised
 * past what the watchdog fits turns a truncation into a watchdog kill. Every bound here is DERIVED from the runtime
 * constants, never restated, so a change to the watchdog formula or the throughput floor re-checks this table.
 * Pure: no database, no network.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { ROLE_MODEL_PARAMS, expectedMaxTokens, LONG_DOCUMENT_MAX_TOKENS } from '../lib/agents/role-model-params';
import { DEFAULT_MAX_TOKENS } from '../lib/services/llm/types';
import { RUNTIME_LIMITS, maxOutputTokensForModel } from '../lib/validation/runtime-limits';
import { AGENT_MODELS } from '../lib/agents/model-tiers';

let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { passed++; console.log(`✅ ${name}`); } else { failed++; console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

// 1. Watchdog fit — a first attempt at the full ceiling, at the throughput FLOOR, plus the retry safety margin, must
//    fit the watchdog a template with the default turn count gets. (Templates in the table set no maxToolTurns.)
const watchdogSec = (RUNTIME_LIMITS.EXECUTION_TIMEOUT_BASE_MS
  + RUNTIME_LIMITS.DEFAULT_TOOL_TURNS * RUNTIME_LIMITS.EXECUTION_TIMEOUT_PER_TURN_MS) / 1000;
for (const [role, p] of Object.entries(ROLE_MODEL_PARAMS)) {
  if (p.maxTokens === undefined) continue;
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

// 5. Single source — the owning seed WRITES from the table and the freshness report EXPECTS from it. If either stops
//    reading it, a reseeded row is reported as permanent drift (or the report's remedy writes the default back).
const seed = readFileSync(join(__dirname, 'seed-requirements-authoring-templates.ts'), 'utf8');
const report = readFileSync(join(__dirname, 'report-template-freshness.ts'), 'utf8');
check('owning seed writes maxTokens from expectedMaxTokens(role)', /maxTokens:\s*expectedMaxTokens\(role\)/.test(seed));
check('owning seed passes each template\'s own role', (seed.match(/MODEL_PARAMS\('(?:infra|synthesis)', \d+, '[a-z_]+'\)/g) || []).length === 3);
check('freshness report expects maxTokens from expectedMaxTokens(role)', /expectedMaxTokens\(role\)/.test(report)
  && /checkModelParams\(t\.metadata, t\.defaultRole\)/.test(report));

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
