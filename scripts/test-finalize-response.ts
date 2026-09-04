#!/usr/bin/env ts-node
/**
 * TEST — finalizeTextForStopReason (SDK Phase 2, engine↔stream parity)
 *
 * The shared terminal-stop finalizer both the engine and the stream route call. A wrong branch here
 * means a streamed truncation/refusal silently loses its user-facing message (the gap this closes),
 * or the two paths diverge. CI-safe: pure helper, no deps.
 */
import { finalizeTextForStopReason } from '@/lib/services/llm/finalize-response';

let passed = 0, failed = 0;
const ok = (c: boolean, m: string) => { if (c) { passed++; console.log(`  ✅ ${m}`); } else { failed++; console.log(`  ❌ ${m}`); } };

console.log('\n🧪 TEST — finalizeTextForStopReason\n');

const MAX_TURNS = '\n\n> **Note**: Agent reached the maximum tool call limit and was stopped.';
const TRUNC = '\n\n> **Note**: Response was truncated due to token limit.';
const DECLINED = 'The model declined to process this request.';

// ── normal completion ──
{
  const r = finalizeTextForStopReason('end_turn', 'the answer', { hitMaxTurns: false });
  ok(r.finalText === 'the answer' && r.appendedNote === null, 'end_turn: text unchanged, no note');
}

// ── max-turns (checked first, regardless of stop_reason) ──
{
  const r = finalizeTextForStopReason('tool_use', 'partial', { hitMaxTurns: true });
  ok(r.finalText === 'partial' + MAX_TURNS && r.appendedNote === MAX_TURNS, 'max-turns: appends the limit note');
  const r2 = finalizeTextForStopReason('max_tokens', 'x', { hitMaxTurns: true });
  ok(r2.appendedNote === MAX_TURNS, 'hitMaxTurns takes precedence over stop_reason');
}

// ── max_tokens ──
{
  const r = finalizeTextForStopReason('max_tokens', 'cut off here', { hitMaxTurns: false });
  ok(r.finalText === 'cut off here' + TRUNC && r.appendedNote === TRUNC, 'max_tokens: appends the truncated note');
}

// ── refusal ──
{
  const empty = finalizeTextForStopReason('refusal', '', { hitMaxTurns: false });
  ok(empty.finalText === DECLINED && empty.appendedNote === DECLINED, 'refusal (no text): becomes the declined message');

  const ws = finalizeTextForStopReason('refusal', '   \n ', { hitMaxTurns: false });
  ok(ws.finalText === DECLINED, 'refusal (whitespace-only text): becomes the declined message');

  const partial = finalizeTextForStopReason('refusal', 'I can help with the safe part…', { hitMaxTurns: false });
  ok(partial.finalText === 'I can help with the safe part…' && partial.appendedNote === null,
    'refusal (partial text): keeps the produced text, no note (mirrors engine text||message)');
}

// ── null/empty handling ──
{
  ok(finalizeTextForStopReason(null, null, { hitMaxTurns: false }).finalText === '', 'null stop_reason + null text → empty string');
  ok(finalizeTextForStopReason(undefined, undefined, { hitMaxTurns: false }).appendedNote === null, 'undefined → no note');
}

console.log(`\n${'─'.repeat(50)}\n  Passed: ${passed}  Failed: ${failed}`);
if (failed > 0) process.exit(1);
console.log('  ✅ finalizeTextForStopReason: GREEN\n');
