#!/usr/bin/env ts-node
/**
 * TEST — model-capabilities.ts (SDK-upgrade Phase 2, WU-1)
 *
 * The capability map is the single source for the model-conditional request shape; a wrong
 * entry reintroduces the exact Opus-4.8 400 this whole task exists to fix. Guards: per-model
 * temperature/thinking/effort caps, fail-loud on unknown model, and clampEffort's non-monotonic
 * edge cases (Sonnet 4.6 has max but not xhigh).
 *
 * CI-safe: model-capabilities imports only runtime-limits (dependency-free). No prisma.
 * Run: npm run test:model-capabilities
 */
import { capabilitiesFor, acceptsEffort, clampEffort, supportsThinkingBudget, EffortLevel } from '@/lib/services/llm/model-capabilities';

let passed = 0, failed = 0;
const ok = (c: boolean, m: string) => { if (c) { passed++; console.log(`  ✅ ${m}`); } else { failed++; console.log(`  ❌ ${m}`); } };

console.log('\n🧪 TEST — model-capabilities\n');

// ── per-model capability matrix (the live set + the regex-covered others) ──
console.log('── capability matrix ──');
{
  const haiku = capabilitiesFor('claude-haiku-4-5');
  ok(haiku.acceptsTemperature === true && haiku.thinkingMode === 'none' && haiku.allowedEfforts.length === 0 && haiku.outputCeiling === 64000,
    'haiku-4-5: temp YES, thinking none, effort NONE (errors), 64K');

  const sonnet = capabilitiesFor('claude-sonnet-4-6');
  ok(sonnet.acceptsTemperature === true && sonnet.thinkingMode === 'adaptive'
     && sonnet.allowedEfforts.includes('max') && !sonnet.allowedEfforts.includes('xhigh') && sonnet.outputCeiling === 64000,
    'sonnet-4-6: temp YES, adaptive, effort max but NOT xhigh, 64K');

  const opus8 = capabilitiesFor('claude-opus-4-8');
  ok(opus8.acceptsTemperature === false && opus8.thinkingMode === 'adaptive'
     && opus8.allowedEfforts.includes('xhigh') && opus8.allowedEfforts.includes('max') && opus8.outputCeiling === 128000,
    'opus-4-8: temp NO (removed), adaptive, effort full incl xhigh+max, 128K');

  const opus6 = capabilitiesFor('claude-opus-4-6');
  ok(opus6.acceptsTemperature === true && !opus6.allowedEfforts.includes('xhigh') && opus6.allowedEfforts.includes('max'),
    'opus-4-6: temp YES (not removed until 4.7), max but NOT xhigh');

  // NB: `opus45` is Opus *4.5*. It was named `opus5` until 2026-08-05, which became a genuine
  // misreading hazard once real Opus 5 landed below — do not rename it back.
  const opus45 = capabilitiesFor('claude-opus-4-5');
  ok(opus45.allowedEfforts.includes('high') && !opus45.allowedEfforts.includes('max') && !opus45.allowedEfforts.includes('xhigh'),
    'opus-4-5: effort high max, NO max/xhigh');

  const opus5 = capabilitiesFor('claude-opus-5');
  ok(opus5.acceptsTemperature === false && opus5.thinkingMode === 'adaptive'
     && opus5.allowedEfforts.includes('xhigh') && opus5.allowedEfforts.includes('max')
     && opus5.outputCeiling === 128000 && opus5.serverSideFallback === true,
    'opus-5: temp NO, adaptive (on by default), effort full incl xhigh+max, 128K, fallback YES');

  // Regression guard for the shared-substring risk between the two branches above: `opus-4-5` must
  // NOT fall through to the `/opus-5/` branch, and Opus 5 must not be shaped as 4.5. If these two
  // ever agree, the regex order in capabilitiesFor() has been broken.
  ok(opus45.allowedEfforts.length !== opus5.allowedEfforts.length && opus45.serverSideFallback === false,
    'opus-4-5 vs opus-5: distinct branches, no substring cross-match');

  const fable = capabilitiesFor('claude-fable-5');
  ok(fable.acceptsTemperature === false && fable.thinkingMode === 'always-on'
     && fable.allowedEfforts.includes('xhigh') && fable.outputCeiling === 128000,
    'fable-5: temp NO, thinking ALWAYS-ON (omit config), effort full, 128K');

  const sonnet5 = capabilitiesFor('claude-sonnet-5');
  ok(sonnet5.acceptsTemperature === false && sonnet5.thinkingMode === 'adaptive'
     && sonnet5.allowedEfforts.includes('xhigh') && sonnet5.allowedEfforts.includes('max')
     && sonnet5.outputCeiling === 128000,
    'sonnet-5: temp NO (rejected — first non-Opus/Fable), adaptive, effort full incl xhigh, 128K');
}

// ── sonnet-5 pattern must NOT swallow sonnet-4-5/4-6 (false-match guard) ──
console.log('\n── sonnet-5 vs sonnet-4-x disambiguation ──');
{
  ok(capabilitiesFor('claude-sonnet-4-6').acceptsTemperature === true, 'sonnet-4-6 still resolves to its own branch (temp YES)');
  ok(capabilitiesFor('claude-sonnet-5').acceptsTemperature === false, 'sonnet-5 resolves to the no-temp branch');
}

// ── serverSideFallback: fable/mythos ONLY ──
console.log('\n── serverSideFallback ──');
{
  ok(capabilitiesFor('claude-fable-5').serverSideFallback === true, 'fable-5: serverSideFallback TRUE');
  ok(capabilitiesFor('claude-mythos-5').serverSideFallback === true, 'mythos-5: serverSideFallback TRUE (same surface)');
  for (const mdl of ['claude-opus-4-8', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-haiku-4-5']) {
    ok(capabilitiesFor(mdl).serverSideFallback === false, `${mdl}: serverSideFallback false`);
  }
}

// ── supportsThinkingBudget: UI/gating predicate derived from the map (WU-10 drift-sweep) ──
// Oracle = the proven truth table: budget control shows ONLY for adaptive models. This pins the
// UI thinking-gate to the capability map so it can't re-drift on a model bump (the old hardcoded
// includes('claude-sonnet-4')||includes('claude-opus-4') gate wrongly hid it for Sonnet 5).
console.log('\n── supportsThinkingBudget (UI gate ↔ capability map) ──');
{
  for (const mdl of ['claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-opus-4-5', 'claude-sonnet-5', 'claude-sonnet-4-6']) {
    ok(supportsThinkingBudget(mdl) === true, `${mdl}: adaptive → budget control SHOWN`);
  }
  ok(supportsThinkingBudget('claude-sonnet-5') === true, 'sonnet-5: SHOWN (the bug the old gate hid — false→true)');
  // always-on (Fable/Mythos) and none (Haiku): no user-configurable budget → hidden
  for (const mdl of ['claude-fable-5', 'claude-mythos-5', 'claude-haiku-4-5']) {
    ok(supportsThinkingBudget(mdl) === false, `${mdl}: always-on/none → budget control HIDDEN`);
  }
  // fail-SAFE (not fail-loud) for a display gate: unknown/empty → false, never throws
  ok(supportsThinkingBudget('gpt-4o') === false, 'unknown model → false (fail-safe, no throw)');
  ok(supportsThinkingBudget(undefined) === false, 'undefined → false');
  ok(supportsThinkingBudget('') === false, 'empty string → false');
}

// ── fail-loud on unknown model (the boundary-contract I2 invariant) ──
console.log('\n── fail-loud on unknown model ──');
{
  let threw = false;
  try { capabilitiesFor('gpt-4o'); } catch { threw = true; }
  ok(threw, 'unknown model THROWS (no silent legacy shape)');
  let threw2 = false;
  try { capabilitiesFor('claude-opus-9-9'); } catch { threw2 = true; }
  ok(threw2, 'unknown future claude model THROWS');
}

// ── clampEffort: non-monotonic edges ──
console.log('\n── clampEffort ──');
{
  const sonnet = capabilitiesFor('claude-sonnet-4-6');
  const opus8 = capabilitiesFor('claude-opus-4-8');
  const haiku = capabilitiesFor('claude-haiku-4-5');
  ok(clampEffort('high' as EffortLevel, sonnet) === 'high', 'default high accepted by sonnet');
  ok(clampEffort('xhigh' as EffortLevel, sonnet) === 'high', 'xhigh on sonnet → clamps to high (no xhigh)');
  ok(clampEffort('max' as EffortLevel, sonnet) === 'max', 'max on sonnet → max (supported)');
  ok(clampEffort('xhigh' as EffortLevel, opus8) === 'xhigh', 'xhigh on opus-4-8 → xhigh (supported)');
  ok(clampEffort('xhigh' as EffortLevel, capabilitiesFor('claude-sonnet-5')) === 'xhigh', 'xhigh on sonnet-5 → xhigh (first Sonnet with it)');
  ok(clampEffort('max' as EffortLevel, capabilitiesFor('claude-opus-4-5')) === 'high', 'max on opus-4-5 → high (no max)');
  ok(clampEffort('high' as EffortLevel, haiku) === null, 'any effort on haiku → null (omit effort)');
  ok(acceptsEffort(haiku) === false && acceptsEffort(opus8) === true, 'acceptsEffort: haiku false, opus true');
}

console.log(`\n${'─'.repeat(50)}\n  Passed: ${passed}  Failed: ${failed}`);
if (failed > 0) process.exit(1);
console.log('  ✅ model-capabilities: GREEN\n');
