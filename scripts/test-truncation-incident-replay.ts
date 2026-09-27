#!/usr/bin/env ts-node
/**
 * Truncation incident REPLAY — register E1 (2026-09-24 incidents, shipped 2026-09-25).
 *
 * Runs the SHIPPING code — finalizeTextForStopReason, assessExecutionQuality,
 * buildExecutionResultJson, pickResultJsonSummary, leanFactsLine — over the REAL result.json
 * artifacts exported from prod before the customer POV was deleted, md5-verified against the
 * fixtures README. Nothing here reimplements a shipping function: a replay of a COPY reproduces the
 * original mistake (execution-facts discovery §D).
 *
 * Why fixtures and not replay-*.ts: the incident rows were DELETED from prod on 2026-09-24, so a
 * DB-backed runner has nothing to read. These files are the only surviving specimens.
 *
 * SPECIMENS — two incidents, two controls (more than one specimen per direction):
 *   cmuerm2n2004nyxzz74tfptsz  Author, partial text, no retry           → TRUNCATED_PARTIAL_OUTPUT
 *   cmuerrjuz004wyxzzd9ktsqbp  Reviewer, #90 replaced the response      → TRUNCATED_PARTIAL_OUTPUT
 *   cmues0gb60058yxzzuw5b309z  Author re-run, empty-text R4 recovered   → clean (control)
 *   cmuescx3b005zyxzzluezoh9u  Reviewer of the re-run                   → clean (control)
 *
 * ⚠️ WHAT THE REVIEWER FIXTURE TEACHES (found writing this suite): its finalResponse DOES contain
 * "Response was truncated due to token limit" — but as the reviewer QUOTING the Author's chained
 * <prior_output>, not as finalize's own note. A note-substring corpus proxy therefore counted this
 * row for the wrong reason: the row WAS truncated (outputTokens 25420 = 24000 ceiling + 1420 #90
 * reflection, token-ceiling.md M4), but the note it matched is the predecessor's. The proxy has a
 * false-positive channel (a quote) as well as the false-negative one (#90 dropping the note), which
 * is why the corpus query is now keyed on toolLoop.deliverableTruncated, not on prose. R4 below pins
 * the discrimination with the shipping finalize function.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { finalizeTextForStopReason } from '../lib/services/llm/finalize-response';
import { assessExecutionQuality } from '../lib/agents/harness/execution-quality';
import { buildExecutionResultJson, pickResultJsonSummary, ExecutionResultJsonInput } from '../lib/services/execution-artifacts';
/* eslint-disable @typescript-eslint/no-var-requires */
const { leanFactsLine } = require('../lib/mcp/server/tools/advanced/lean-card-facts');

console.log('🧪 Truncation incident replay (register E1)\n');

let passed = 0;
let failed = 0;
function test(description: string, fn: () => void) {
  try { fn(); console.log(`✅ ${description}`); passed++; } catch (error) {
    console.error(`❌ ${description}`);
    if (error instanceof Error) console.error(`   ${error.message}`);
    failed++;
  }
}
function expectEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const REPO_ROOT = path.resolve(__dirname, '..');
const FIX_DIR = path.join(REPO_ROOT, 'cline_docs/follow-ups/partial-text-truncation-2026-09-24-fixtures');

const AUTHOR = 'cmuerm2n2004nyxzz74tfptsz';
const REVIEWER = 'cmuerrjuz004wyxzzd9ktsqbp';
const AUTHOR_RERUN = 'cmues0gb60058yxzzuw5b309z';
const REVIEWER_RERUN = 'cmuescx3b005zyxzzluezoh9u';

/** The recorded evidence for the reviewer's LOOP-EXIT stop reason. It is NOT in the artifact (#90
 *  replaced the response; tokensUsed does not split output) and the prod row is deleted, so it rides
 *  here with its source: token-ceiling.md M4 — outputTokens 25420 = 24000 (DEFAULT_MAX_TOKENS at the
 *  time) + 1420 (#90 reflection). A call that consumed exactly its ceiling stopped at max_tokens. */
const REVIEWER_RECORDED = { outputTokens: 25420, ceilingAtTime: 24000, reflectionOutputTokens: 1420 };

// The note is taken FROM the shipping finalize function — this suite carries no copy of it.
const NOTE = finalizeTextForStopReason('max_tokens', '', { hitMaxTurns: false }).appendedNote as string;

type Artifact = Record<string, any>;
function readReadmeMd5s(): Map<string, string> {
  const readme = fs.readFileSync(path.join(FIX_DIR, 'README.md'), 'utf-8');
  const m = new Map<string, string>();
  for (const row of readme.matchAll(/^\| `(\w+)` \| (\w+) \| ([\w.-]+) \| `([0-9a-f]{32})` \|$/gm)) {
    m.set(`${row[1]}__${row[2]}__${row[3]}`, row[4]);
  }
  return m;
}
const MD5S = readReadmeMd5s();
function load(execId: string): Artifact {
  const name = fs.readdirSync(FIX_DIR).find((f) => f.startsWith(`${execId}__`) && f.endsWith('__result.json'));
  if (!name) throw new Error(`fixture for ${execId} missing`);
  const buf = fs.readFileSync(path.join(FIX_DIR, name));
  const want = MD5S.get(name.replace(/\.json$/, '.json'));
  const got = crypto.createHash('md5').update(buf).digest('hex');
  if (!want) throw new Error(`${name} has no md5 row in the fixtures README`);
  if (got !== want) throw new Error(`${name} md5 ${got} ≠ README ${want} — not the exported specimen`);
  return JSON.parse(buf.toString('utf-8'));
}

const quietLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {} } as unknown as ExecutionResultJsonInput['logger'];

/** Build the result.json the SHIPPING builder would stamp today from the fixture's own fields, then
 *  hoist it through the real whitelist — the path the card reads. */
function cardFor(a: Artifact, execId: string, over: Partial<ExecutionResultJsonInput>): string {
  const built = buildExecutionResultJson({
    taskId: a.taskId, taskTitle: a.taskTitle, agentRole: a.agentRole, modelUsed: a.modelUsed,
    finalResponse: a.finalResponse, confidenceScore: a.confidenceScore,
    turnCount: a.toolLoop.totalTurns, maxToolTurns: 30, toolCallResults: [], successfulToolCalls: 0, failedToolCalls: 0,
    executionTime: a.executionTime, tokensUsed: a.tokensUsed, correctionTurnUsed: a.toolLoop.correctionTurnUsed,
    diagnosticRetryUsed: a.toolLoop.diagnosticRetryUsed,
    truncationRetryUsed: a.toolLoop.truncationRetryUsed, truncationRetryRecovered: a.toolLoop.truncationRetryRecovered,
    executionId: execId, logger: quietLogger,
    ...over,
  });
  return leanFactsLine(pickResultJsonSummary(built)) as string;
}

// ── R0: specimen identity ─────────────────────────────────────────────────────────────────────
test('R0: all four specimens load and match the md5 recorded in the fixtures README', () => {
  for (const id of [AUTHOR, REVIEWER, AUTHOR_RERUN, REVIEWER_RERUN]) load(id);
});

// ── Incident 1: the Author, partial text ─────────────────────────────────────────────────────
const author = load(AUTHOR);
const authorRaw = author.finalResponse.endsWith(NOTE) ? author.finalResponse.slice(0, -NOTE.length) : null;

test('R1 (Author, evidence): the note is FINALIZE\'s own — max_tokens round-trips the persisted finalResponse byte-for-byte', () => {
  if (authorRaw === null) throw new Error('Author finalResponse does not end with the shipping MAX_TOKENS note');
  expectEq(finalizeTextForStopReason('max_tokens', authorRaw, { hitMaxTurns: author.toolLoop.hitMaxTurns }).finalText, author.finalResponse, 'round-trip');
  // (No length literal: 22624 is the CODE-POINT count; JS .length counts UTF-16 units and the document
  // carries emoji. The byte-for-byte round-trip above is the assertion.)
  expectEq(authorRaw.trim().length > 0, true, 'raw deliverable is non-empty (PARTIAL, not NO_OUTPUT)');
});

const authorQuality = assessExecutionQuality({
  toolCallResults: [], failedToolCalls: 0, text: author.finalResponse, rawDeliverableText: authorRaw,
  stopReason: 'max_tokens', loopExitStopReason: 'max_tokens',
  task: { id: author.taskId, type: 'AGENT' }, executionId: AUTHOR, turnCount: author.toolLoop.totalTurns,
});

test('R2 (Author, classifier): the shipping cascade stamps TRUNCATED_PARTIAL_OUTPUT with the real partial length', () => {
  expectEq(authorQuality.executionDegradation?.errorCategory, 'TRUNCATED_PARTIAL_OUTPUT', 'category');
  if (!String(authorQuality.executionDegradation?.degradationReason).includes(`${(authorRaw as string).length} chars`)) {
    throw new Error('reason must carry the real partial length');
  }
});

test('R3 (Author, card): the fact survives the real whitelist and the card names the category FIRST and the retry state', () => {
  // Incident-time facts: no retry (the pre-2026-09-25 trigger required EMPTY text).
  const line = cardFor(author, AUTHOR, { executionDegradation: authorQuality.executionDegradation ?? undefined, finalStopReason: 'max_tokens' });
  // confidenceScore is null on this artifact (the truncation cut the Confidence line), so the category leads.
  expectEq(line.startsWith('**Facts:** errorCategory: TRUNCATED_PARTIAL_OUTPUT | truncation: final stop max_tokens (no retry)'), true, `card: ${line}`);
});

// ── Incident 2: the Reviewer, #90 replaced the response ───────────────────────────────────────
const reviewer = load(REVIEWER);

test('R4 (Reviewer, evidence): the note in its text is a QUOTE of the predecessor, not finalize\'s — the note proxy\'s false-positive channel', () => {
  const fr: string = reviewer.finalResponse;
  expectEq(fr.includes('Response was truncated due to token limit'), true, 'the substring IS present (a note-proxy hit)');
  expectEq(fr.endsWith(NOTE), false, 'but finalize did NOT append it');
  expectEq(fr.includes('<prior_output>'), true, 'it is quoted as the chained predecessor\'s note');
  expectEq(reviewer.toolLoop.diagnosticRetryUsed, true, '#90 fired — the persisted response is the reflection');
  // #90 requires a parsed pre-#90 confidence in [50,69], i.e. a NON-EMPTY raw deliverable; the
  // reflection states the prior score in its own words.
  expectEq(/\(60→68\)/.test(fr), true, 'the reflection names its pre-#90 score (60, inside the #90 band)');
  expectEq(REVIEWER_RECORDED.outputTokens, REVIEWER_RECORDED.ceilingAtTime + REVIEWER_RECORDED.reflectionOutputTokens, 'recorded outputTokens = ceiling + reflection ⇒ loop exit was max_tokens');
});

// The pre-#90 raw text is not persisted (#90 replaced it). Its length is unknown; its NON-emptiness
// is established by R4. The classifier's truncation branch reads emptiness only.
const REVIEWER_RAW_PLACEHOLDER = '[pre-#90 partial — not persisted; non-empty per R4]';
function reviewerQuality(withFix: boolean) {
  return assessExecutionQuality({
    toolCallResults: [], failedToolCalls: 0,
    text: reviewer.finalResponse,                 // the REAL post-#90 text — so P7 et al. see what prod saw
    rawDeliverableText: REVIEWER_RAW_PLACEHOLDER,
    stopReason: 'end_turn',                       // #90's reflection stop reason (what the old wiring read)
    ...(withFix ? { loopExitStopReason: 'max_tokens' } : {}),
    task: { id: reviewer.taskId, type: 'AGENT' }, executionId: REVIEWER, turnCount: reviewer.toolLoop.totalTurns,
  });
}

test('R5 (Reviewer, classifier — the #90 case): loop-exit max_tokens + post-#90 end_turn still classifies TRUNCATED_PARTIAL_OUTPUT', () => {
  expectEq(reviewerQuality(true).executionDegradation?.errorCategory, 'TRUNCATED_PARTIAL_OUTPUT', 'category');
});

test('R6 (Reviewer, MUTATION — the pre-§3.3 wiring): reading the post-#90 stop reason alone loses the truncation on the REAL text', () => {
  // This is what made the incident invisible. If this ever classifies, the specimen no longer
  // discriminates the fix and R5 proves nothing.
  const cat = reviewerQuality(false).executionDegradation?.errorCategory ?? null;
  if (cat === 'TRUNCATED_PARTIAL_OUTPUT') throw new Error('old wiring classified it — the fixture no longer discriminates the §3.3 fix');
});

test('R7 (Reviewer, card): confidence, category, truncation and the rejected verdict all reach the card', () => {
  const line = cardFor(reviewer, REVIEWER, { executionDegradation: reviewerQuality(true).executionDegradation ?? undefined, finalStopReason: 'max_tokens' });
  expectEq(line.startsWith('**Facts:** confidence: 68 | errorCategory: TRUNCATED_PARTIAL_OUTPUT | truncation: final stop max_tokens (no retry)'), true, `card: ${line}`);
  if (!line.includes('reviewerVerdict: rejected')) throw new Error(`the builder's verdict parse must still reach the card: ${line}`);
});

// ── Controls: the re-run pair, same stage, same prompt ────────────────────────────────────────
for (const [id, label] of [[AUTHOR_RERUN, 'Author re-run (R4 recovered)'], [REVIEWER_RERUN, 'Reviewer of the re-run']] as const) {
  const a = load(id);
  test(`R8 (CONTROL — ${label}): no finalize note, the cascade stays clean, and the card carries NO truncation segment`, () => {
    expectEq(a.finalResponse.endsWith(NOTE), false, 'no finalize note');
    expectEq(a.finalResponse.includes('Response was truncated due to token limit'), false, 'no note substring either');
    const q = assessExecutionQuality({
      toolCallResults: [], failedToolCalls: 0, text: a.finalResponse, rawDeliverableText: a.finalResponse,
      stopReason: 'end_turn', loopExitStopReason: 'end_turn',
      task: { id: a.taskId, type: 'AGENT' }, executionId: id, turnCount: a.toolLoop.totalTurns,
    });
    expectEq(q.executionDegradation, null, 'clean');
    const line = cardFor(a, id, { finalStopReason: 'end_turn', truncationRetryStopReason: a.toolLoop.truncationRetryUsed ? 'end_turn' : null });
    if (line.includes('truncation:') || line.includes('errorCategory')) throw new Error(`control must render clean: ${line}`);
  });
}

// ── The proxy measurement, printed per bucket with the total asserted (discovery practice) ────
test('R9 (proxy census over ALL result.json fixtures): note-substring hits vs finalize-tail hits', () => {
  const files = fs.readdirSync(FIX_DIR).filter((f) => f.endsWith('__result.json'));
  let substring = 0; let tail = 0; let neither = 0;
  for (const f of files) {
    const fr: string = JSON.parse(fs.readFileSync(path.join(FIX_DIR, f), 'utf-8')).finalResponse ?? '';
    const s = fr.includes('Response was truncated due to token limit'); const t = fr.endsWith(NOTE);
    if (t) tail++; if (s) substring++; if (!s && !t) neither++;
  }
  console.log(`   ${files.length} result.json fixtures: substring ${substring} · finalize-tail ${tail} · neither ${neither}`);
  expectEq(substring + neither, files.length, 'every fixture binned (tail ⊂ substring)');
  expectEq(substring, 2, 'substring hits'); expectEq(tail, 1, 'finalize-tail hits — the quote is the difference');
});

console.log('\n=====================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('=====================================');
process.exit(failed > 0 ? 1 : 0);
