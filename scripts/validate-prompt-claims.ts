#!/usr/bin/env ts-node
/**
 * validate-prompt-claims — pin agent-facing prompt CLAIMS to the codebase.
 *
 * WHY THIS EXISTS. Seeded prompts and templates tell agents how the platform behaves: which error
 * they will see, which action to call, which code to branch on. Nothing pinned those statements to
 * the code, so they drift silently — and unlike a stale comment, a stale PROMPT actively misleads
 * an autonomous consumer at runtime.
 *
 * Two real instances found by hand on 2026-07-25, both fabricated (the quoted string existed
 * NOWHERE in the tree):
 *   - "invariant failed"                                   → real messages start "Pipeline cannot complete: ..."
 *   - "Invalid task status transition: COMPLETED -> COMPLETED (terminal status)"
 *                                                          → ASCII arrow + a parenthetical the validator never emits
 * An agent told to recognise a failure by a string the code never produces will never recognise it,
 * and will miss the documented recovery path. Two in three inspected: a class, not accidents.
 *
 * WHAT IT CHECKS (conservative by design — a validator that cries wolf gets ignored):
 *   1. QUOTED ERROR MESSAGES — a message a prompt attributes to the platform must appear somewhere
 *      in lib/ or app/. Existence only; we do NOT try to match the full interpolated string.
 *   2. ERROR CODES — a code cited in an error context must be a real AppError code in lib/errors.ts.
 *   3. MCP ACTION NAMES — an action a prompt tells an agent to call must exist in the router.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK. Semantic claims ("this returns within 30s", "#195 is open")
 * are not mechanically decidable — those belong in the specialist discovery-prompt expectation
 * blocks, where a human/agent judges them (Protocol 11 Part C). This tool covers the mechanical
 * half so the judgement half has less to do.
 *
 * Run: npm run validate:prompt-claims        (CI battery — every commit)
 * Also invoked by: prompt-construction-specialist and template-system-specialist discovery runs.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let failed = 0;
const findings: string[] = [];
const warnings: string[] = [];

/**
 * Severity by audience. seed-protocol-prompts.ts / seed-*template*.ts are EXECUTED by autonomous
 * agents — a wrong claim there makes an agent miss a recovery path at runtime, so it FAILS the
 * build. The operational guides are read by humans, where a paraphrased error is a doc nit; those
 * report as warnings so CI is never blocked by prose while the drift stays visible.
 */
function isAgentExecuted(file: string): boolean {
  if (/^scripts\//.test(file)) {
    return /seed-protocol-prompts\.ts$/.test(file) || /seed-.*template.*\.ts$/.test(file);
  }
  return true; // lib/ + app/ hits are live agent-facing strings — always build-failing
}

function flag(file: string, kind: string, claim: string, detail: string) {
  const line = `  ${isAgentExecuted(file) ? '❌' : '⚠️ '} ${file}\n     ${kind}: ${claim}\n     ${detail}`;
  if (isAgentExecuted(file)) { failed++; findings.push(line); } else { warnings.push(line); }
}

// ── the prompt surfaces shipped to agents ──────────────────────────────────────────────────────
function promptFiles(): string[] {
  const out: string[] = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'scripts'))) {
    if (/^seed-.*\.ts$/.test(f)) out.push(`scripts/${f}`);
  }
  return out;
}

// ── the codebase we check claims against ───────────────────────────────────────────────────────
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name.startsWith('.')) continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx|js)$/.test(e.name)) out.push(rel);
  }
  return out;
}
const CODE = [...walk('lib'), ...walk('app')].map(read).join('\n');
const ERROR_CODES = new Set(
  Array.from(read('lib/errors.ts').matchAll(/'([A-Z][A-Z0-9_]{3,})'/g)).map((m) => m[1])
);
const ROUTER_ACTIONS = new Set(
  Array.from(
    read('lib/mcp/tasks/action/tasks-action-router.ts').matchAll(/'([a-z]+\.[a-z]+)'/g)
  ).map((m) => m[1])
);

/**
 * Every action name the platform actually routes, across ALL tools (project / perform / analytics /
 * services / template / registry) — not just the task router. Harvested from the tool + handler
 * surface rather than hand-listed, so it cannot go stale independently of the code.
 */
const KNOWN_ACTIONS = new Set<string>(ROUTER_ACTIONS);
for (const rel of [...walk('lib/mcp')]) {
  for (const m of read(rel).matchAll(/case\s+'([a-z]+\.[a-z]+)'|action(?:Name)?\s*===\s*'([a-z]+\.[a-z]+)'|'([a-z]+\.[a-z]+)':\s*(?:async|\()/g)) {
    const a = m[1] || m[2] || m[3];
    if (a) KNOWN_ACTIONS.add(a);
  }
}

// Codes that are real but not AppError members (transport/validation layers own them).
const NON_APPERROR_CODES = new Set([
  'INVALID_INPUT', 'UNSUPPORTED_ACTION', 'NESTED_TASK_GUARD', 'INVALID_STATUS_TRANSITION',
  'INTERNAL_ERROR', 'DEPENDENCY_NOT_SATISFIED',
]);

/**
 * Fenced code blocks are the prompt's OWN sample code (python/bash/json it shows the reader), not
 * claims about our platform. Matching inside them produced pure noise on the first run — e.g. a
 * python snippet's own `'error': 'Public key not found'`. Strip them before extracting claims.
 */
function stripFences(src: string): string {
  return src.replace(/\\`\\`\\`[\s\S]*?\\`\\`\\`/g, '\n').replace(/```[\s\S]*?```/g, '\n');
}

/**
 * Is a quoted message backed by the code? Messages are usually built with interpolation
 * (`Invalid task status transition: ${from} → ${to}`), so the fully-rendered string a prompt
 * quotes will NEVER appear literally. Test a SHRINKING prefix and pass on the longest run of
 * leading words that appears: we are asking "does this message exist at all", not "is it quoted
 * exactly". Only a message whose first three words appear nowhere is reported — that is the
 * fabricated case (both real 2026-07-25 bugs failed at the very first words).
 */
function messageBackedByCode(msg: string): boolean {
  const cleaned = msg.replace(/[`*]/g, '').split(/\$\{|<[a-z]/i)[0].trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 2) return true;                 // too short to be a meaningful claim
  for (let n = Math.min(words.length, 8); n >= 2; n--) {
    const probe = words.slice(0, n).join(' ').replace(/[:.,;!?]+$/, '');
    if (probe.length < 8) continue;
    const variants = [probe, probe.replace(/→/g, '->'), probe.replace(/->/g, '→')];
    if (variants.some((v) => CODE.includes(v))) return true;
  }
  return false;
}

console.log('🧪 Prompt-claim validation (agent-facing prompts vs the codebase)\n');

for (const file of promptFiles()) {
  const src = stripFences(read(file));

  // ── 1. quoted error messages attributed to the platform ──────────────────────────────────────
  const msgRe =
    /(?:error(?: code)?[:=]?\s*|failed with\s*|fails with\s*|rejected with\s*|returns\s*|message[:=]\s*)\*?["“]([^"”\n]{8,160})["”]\*?/gi;
  for (const m of Array.from(src.matchAll(msgRe))) {
    if (!messageBackedByCode(m[1])) {
      flag(file, 'QUOTED MESSAGE NOT IN CODE', `"${m[1]}"`,
        'No such string in lib/ or app/. An agent told to recognise this will never match it. ' +
        'Quote the real message, or key the guidance on the error CODE instead.');
    }
  }

  // ── 2. error codes cited in an error context ─────────────────────────────────────────────────
  // The `\\?` before each delimiter is load-bearing (2026-07-25). Prompt bodies are authored
  // INSIDE TypeScript template literals, so every backtick in the prose is escaped as \` in the
  // source this validator reads. Without tolerating that backslash, the rule silently skipped
  // EVERY backticked code in scripts/seed-protocol-prompts.ts — i.e. the entire pipeline-harness
  // troubleshooting table, our most agent-facing prompt surface (4 citations, all unchecked).
  // Found by negative-controlling this validator rather than trusting its green tick.
  const codeRe = /(?:error code|code)\s*[:=]?\s*\\?[`'"]([A-Z][A-Z0-9_]{3,})\\?[`'"]/g;
  for (const m of Array.from(src.matchAll(codeRe))) {
    const code = m[1];
    if (!ERROR_CODES.has(code) && !NON_APPERROR_CODES.has(code)) {
      flag(file, 'UNKNOWN ERROR CODE', code,
        'Not a code in lib/errors.ts nor a known transport-layer code. Agents branching on it will never match.');
    }
  }

  // ── 3. MCP action names the prompt tells an agent to call ────────────────────────────────────
  const actionRe = /[`'"]((?:task|agent|pov|phase|stage)\.[a-z]+)[`'"]/g;
  for (const m of Array.from(src.matchAll(actionRe))) {
    const action = m[1];
    if (ROUTER_ACTIONS.size && !ROUTER_ACTIONS.has(action) && !CODE.includes(`'${action}'`)) {
      flag(file, 'UNKNOWN MCP ACTION', action,
        'Not routable by tasks-action-router and not referenced anywhere in lib/ or app/.');
    }
  }
}

// ── 4. agent-facing action references inside CODE (handler errors, remediation prose) ──────────
//
// The stage.list defect lived in BOTH the prompt and stage-create-handler's thrown Error. Scanning
// only prompts would have fixed the instance and left the class: remediation text is agent-facing
// guidance too, and an agent following `project(action: "stage.list")` from an error message fails
// exactly as it would following it from a prompt. Only tool-call FORMS are checked
// (`project(action: "x.y")`), which is what an agent would actually copy — a bare mention of an
// action name in a comment is not an instruction.
for (const rel of [...walk('lib'), ...walk('app')]) {
  const src = read(rel);
  for (const m of Array.from(
    src.matchAll(/\b(?:project|perform|analytics|services|template|registry)\(\s*\{?\s*action:\s*["']([a-z]+\.[a-z]+)["']/g)
  )) {
    const action = m[1];
    if (!KNOWN_ACTIONS.has(action)) {
      flag(rel, 'AGENT-FACING CALL TO UNKNOWN ACTION', action,
        'This tool-call form appears in code an agent reads (error/remediation text) but the action ' +
        'is not routable anywhere. An agent following it calls a tool that does not exist.');
    }
  }
}

if (warnings.length) {
  console.log(`⚠️  ${warnings.length} claim(s) in HUMAN-facing guides not backed by the codebase (not build-failing):\n`);
  console.log(warnings.join('\n\n'));
  console.log('');
}

if (findings.length) {
  console.log('Findings in AGENT-EXECUTED prompts:\n');
  console.log(findings.join('\n\n'));
  console.log(`\n❌ ${failed} prompt claim(s) not backed by the codebase.\n`);
  console.log('Each is a statement an autonomous agent will act on. Fix the prompt, or fix the code.');
  process.exit(1);
}

console.log('✅ Every checkable prompt claim is backed by the codebase.');
console.log(`   (${promptFiles().length} prompt file(s); ${ERROR_CODES.size} error codes, ${ROUTER_ACTIONS.size} router actions known)`);
