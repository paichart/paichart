#!/usr/bin/env npx ts-node
/**
 * test-program-protocol-token.ts — the anchored program-protocol discriminator.
 *
 * WHY THIS FILE EXISTS: before 2026-08-08 the discriminator was an UNANCHORED substring
 * (`contains: '(protocol: pov-program'` — no closing paren) duplicated at two call sites, and it
 * was wrong in both directions. The fails-CLOSED direction was known. The fails-OPEN direction —
 * `pov-program-lite` matching `pov-program` — survived because nothing tested it. Every case
 * below that says COLLISION is a case the old code got wrong.
 *
 * Run: npm run test:program-protocol-token
 */
import {
  PROGRAM_PROTOCOL_NAMES,
  programProtocolToken,
  programProtocolTokens,
  isProgramProtocolTitle,
  canonicalProtocolName,
  resolveProtocolStamp,
  isProgramProtocol,
  isProgramHarnessTask,
  resolveTaskProtocol,
  programHarnessProtocolFilter,
} from '../lib/agents/harness/program-protocol';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`✅ ${name}`); passed++; }
  catch (e) { console.log(`❌ ${name}\n   ${(e as Error).message}`); failed++; }
}
function assert(c: boolean, m: string) { if (!c) throw new Error(m); }

// ─── the canonical form ────────────────────────────────────────────────────────────────────
test('token is anchored on BOTH sides — the closing paren is the fix', () => {
  assert(programProtocolToken('pov-program') === '(protocol: pov-program)', 'canonical form');
  assert(programProtocolToken('pov-program').endsWith(')'), 'closing paren present — its absence WAS the bug');
});

test('a real production title matches', () => {
  // Verbatim shape from prod: 33 live tasks carry exactly this token.
  assert(isProgramProtocolTitle('Westpac infrastructure change program (Run 2) (protocol: pov-program)'),
    'the canonical live form must still match — anchoring must not break 33 existing program tasks');
});

// ─── fails-OPEN: the direction that had no coverage ────────────────────────────────────────
test('COLLISION: pov-program-lite must NOT match pov-program', () => {
  assert(!isProgramProtocolTitle('Student experiment (protocol: pov-program-lite)'),
    'a variant must not silently INHERIT F12 enforcement and the F10 programConfidence stamp');
});

test('COLLISION: pov-programme must NOT match', () => {
  assert(!isProgramProtocolTitle('X (protocol: pov-programme)'), 'near-miss spelling must not match');
});

test('COLLISION: an unterminated token must NOT match', () => {
  // The old prefix test matched this; a truncated/typo title is not a program declaration.
  assert(!isProgramProtocolTitle('Truncated title (protocol: pov-program'), 'unterminated token is not a match');
});

// ─── fails-CLOSED: the known direction ─────────────────────────────────────────────────────
test('a differently-named program protocol does not match until REGISTERED', () => {
  assert(!isProgramProtocolTitle('X (protocol: student-program)'),
    'not registered ⇒ no match. This is correct-and-loud by design: registering is one edit to ' +
    'PROGRAM_PROTOCOL_NAMES, and forgetting it means the harness runs WITHOUT its safety nets.');
});

test('registering a name is the ONLY thing needed to opt in', () => {
  const registered = PROGRAM_PROTOCOL_NAMES.map(n => `X (protocol: ${n})`);
  assert(registered.length > 0, 'at least one program protocol registered');
  assert(registered.every(isProgramProtocolTitle), 'every registered name matches its own token');
});

// ─── leg protocols must never match ────────────────────────────────────────────────────────
test('LEG protocols must NOT be treated as program harnesses', () => {
  for (const leg of ['network-provisioning', 'terraform-iac', 'kubernetes-gitops', 'artifact-synthesis']) {
    assert(!isProgramProtocolTitle(`X (protocol: ${leg})`), `${leg} is a leg, not a program`);
  }
});

// ─── shape / robustness ────────────────────────────────────────────────────────────────────
test('null, undefined and empty titles are safe and false', () => {
  assert(!isProgramProtocolTitle(null), 'null');
  assert(!isProgramProtocolTitle(undefined), 'undefined');
  assert(!isProgramProtocolTitle(''), 'empty');
  assert(!isProgramProtocolTitle('no token at all'), 'no token');
});

test('token list is non-empty and every entry is anchored', () => {
  const toks = programProtocolTokens();
  assert(toks.length === PROGRAM_PROTOCOL_NAMES.length, 'one token per registered name');
  assert(toks.every(t => t.startsWith('(protocol: ') && t.endsWith(')')), 'all anchored both sides');
});

// ═══ WS2 PHASE A (2026-08-17): resolver, tier predicate, filter, and stamp-era guards ═══════

// ─── canonicalization (foreclosure FC2: the stamp carries the LONG library-row name) ───────
test('canonicalProtocolName: pure suffix rule, no I/O, idempotent', () => {
  assert(canonicalProtocolName('pov-program') === 'pov-program-protocol', 'short → long');
  assert(canonicalProtocolName('pov-program-protocol') === 'pov-program-protocol', 'long passes through');
  assert(canonicalProtocolName('network-provisioning') === 'network-provisioning-protocol', 'legs too');
});

test('canonical names appear in the SEED (source-text parity — namespace-drift detector)', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const seed = fs.readFileSync(path.resolve(__dirname, 'seed-protocol-prompts.ts'), 'utf-8');
  // research-program is DELIBERATELY DB-only (removed from the seed while authored) — its name
  // registration is code-not-seed by design; every OTHER registered name must have a seed row.
  for (const n of PROGRAM_PROTOCOL_NAMES.filter(n => n !== 'research-program')) {
    assert(seed.includes(`'${canonicalProtocolName(n)}'`),
      `canonical name ${canonicalProtocolName(n)} missing from the seed — short/long namespace drift`);
  }
});

// ─── the resolver (title → stamp), incl. LEG names (foreclosure FC1 made mechanical) ───────
test('resolver: registered program token → canonical LONG stamp', () => {
  const r = resolveProtocolStamp('Fabric change (Run 2) (protocol: pov-program)');
  assert(r.protocol === 'pov-program-protocol' && r.tokenCount === 1, JSON.stringify(r));
});
test('resolver: a LEG token is stamped too — Phase C reads it for 5 of 6 protocols', () => {
  const r = resolveProtocolStamp('Harden the bucket (protocol: terraform-iac)');
  assert(r.protocol === 'terraform-iac-protocol' && r.tokenCount === 1, JSON.stringify(r));
});
test('resolver: no token → null, count 0 (stamped as explicit null by the chokepoint)', () => {
  const r = resolveProtocolStamp('Plain title with no token');
  assert(r.protocol === null && r.tokenCount === 0, JSON.stringify(r));
});
test('resolver: unterminated token is NOT a token (the anchoring lesson at resolution time)', () => {
  const r = resolveProtocolStamp('Truncated (protocol: pov-program');
  assert(r.protocol === null && r.tokenCount === 0, JSON.stringify(r));
});
test('resolver: pov-program-lite stamps ITSELF, never pov-program', () => {
  const r = resolveProtocolStamp('Student (protocol: pov-program-lite)');
  assert(r.protocol === 'pov-program-lite-protocol', JSON.stringify(r));
});
test('resolver: two tokens → FIRST wins, count records the multiplicity (the chokepoint warns)', () => {
  const r = resolveProtocolStamp('A (protocol: pov-program) B (protocol: terraform-iac)');
  assert(r.protocol === 'pov-program-protocol' && r.tokenCount === 2, JSON.stringify(r));
});
test('resolver: null/undefined/empty are safe', () => {
  assert(resolveProtocolStamp(null).protocol === null, 'null');
  assert(resolveProtocolStamp(undefined).protocol === null, 'undefined');
  assert(resolveProtocolStamp('').protocol === null, 'empty');
});

// ─── the TIER predicate (stamped-name era; NO library I/O, status-independent) ─────────────
test('tier: every registered name is a program, SHORT and LONG form', () => {
  for (const n of PROGRAM_PROTOCOL_NAMES) {
    assert(isProgramProtocol(n), `${n} (short)`);
    assert(isProgramProtocol(canonicalProtocolName(n)), `${n} (long)`);
  }
});
test('tier: research-program is a program with its row DRAFT and ABSENT FROM THE SEED — row status is irrelevant BY DESIGN', () => {
  // Pins QA1/FC3: tier membership must never depend on agent_prompt_library. The one protocol
  // this requirement exists for is DB-only + DRAFT today.
  assert(isProgramProtocol('research-program'), 'short');
  assert(isProgramProtocol('research-program-protocol'), 'long');
});
test('tier: legs, near-misses, null, empty are NOT programs', () => {
  for (const n of ['network-provisioning', 'terraform-iac-protocol', 'pov-program-lite', 'pov-programme']) {
    assert(!isProgramProtocol(n), n);
  }
  assert(!isProgramProtocol(null) && !isProgramProtocol(undefined) && !isProgramProtocol(''), 'null-family');
});
test('NO LIBRARY I/O: the module imports no prisma/db — tier resolves with the row absent entirely', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const src = fs.readFileSync(path.resolve(__dirname, '../lib/agents/harness/program-protocol.ts'), 'utf-8');
  assert(!/from '@\/lib\/prisma'|from '\.\.\/.*prisma'|PrismaClient/.test(src),
    'program-protocol.ts must stay PURE — a library lookup breaks the §6b DRAFT lifecycle and adds a fail-open I/O mode');
});

// ─── the F10 predicate: stamp AUTHORITATIVE, title TRANSITIONAL, rename inert ──────────────
test('F10: stamped program task is a program even with a TOKEN-LESS title (the read moved off the title)', () => {
  assert(isProgramHarnessTask({ title: 'renamed to anything', metadata: { protocol: 'pov-program-protocol' } }),
    'stamp governs');
});
test('F10: R1 CLOSED — a stamped LEG task retitled INTO a program token stays a leg', () => {
  assert(!isProgramHarnessTask({ title: 'sneaky (protocol: pov-program)', metadata: { protocol: 'terraform-iac-protocol' } }),
    'a post-stamp rename must not move the guard — this IS the mid-run self-disable/self-promote closure');
});
test('F10: resolved-to-nothing (protocol: null) does NOT fall back to the title', () => {
  assert(!isProgramHarnessTask({ title: 'x (protocol: pov-program)', metadata: { protocol: null } }),
    'null is a positive resolution outcome, not an absence');
});
test('F10 TRANSITIONAL: an unstamped (pre-Phase-A) task falls back to the title token', () => {
  assert(isProgramHarnessTask({ title: 'legacy (protocol: pov-program)', metadata: {} }), 'title fallback');
  assert(isProgramHarnessTask({ title: 'legacy (protocol: pov-program)', metadata: null }), 'null metadata');
  assert(!isProgramHarnessTask({ title: 'legacy leg (protocol: terraform-iac)', metadata: {} }), 'leg title');
});

// ─── the F12 filter shape ──────────────────────────────────────────────────────────────────
test('F12 filter: stamp-equals disjuncts (OR of equals — Prisma has no `in` for JSON paths) + transitional title disjuncts', () => {
  const f = programHarnessProtocolFilter();
  const stampDisjuncts = f.OR.filter(c => JSON.stringify(c).includes('"path":["protocol"]'));
  const titleDisjuncts = f.OR.filter(c => JSON.stringify(c).includes('"title"'));
  assert(stampDisjuncts.length === PROGRAM_PROTOCOL_NAMES.length, 'one stamp-equals per registered name');
  assert(stampDisjuncts.every(c => JSON.stringify(c).includes('-protocol"')), 'stamp disjuncts use CANONICAL names');
  assert(titleDisjuncts.length === PROGRAM_PROTOCOL_NAMES.length, 'transitional title disjuncts present');
});

// ─── DISJUNCT-REMOVAL GATE: the transition may not end as a quiet cleanup commit ───────────
test('GATE: removing the transitional title disjunct requires the RECORDED VERIFIED BACKFILL', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const root = path.resolve(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'lib/agents/harness/program-protocol.ts'), 'utf-8');
  const hasDisjunct = src.includes('title: { contains: token }');
  const backfillRecord = path.join(root, 'cline_docs/reviews/ws2-phase-a-2026-08-17/BACKFILL-VERIFIED.md');
  assert(hasDisjunct || fs.existsSync(backfillRecord),
    'the title disjunct is gone but no BACKFILL-VERIFIED.md record exists — pre-stamp tasks just silently lost F12/F10');
});

// ─── drift guards (stamp era): call sites use the shared module correctly ──────────────────
test('DRIFT GUARD: F12 call site composes the shared filter under AND (never inline title/metadata literals)', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const src = fs.readFileSync(path.resolve(__dirname, '../lib/agents/harness/prepare-task-for-execution.ts'), 'utf-8');
  assert(src.includes('programHarnessProtocolFilter()'), 'F12 must use the shared filter');
  const win = src.slice(src.indexOf('const programParent'), src.indexOf('structurallyRequiresContract = !!programParent'));
  assert(/AND:\s*\[/.test(win),
    'AND-lift missing — two metadata keys in one literal is last-writer-wins and matches the wrong harness');
  const offenders = src.split('\n').filter(l =>
    !l.trim().startsWith('//') && !l.trim().startsWith('*') &&
    /['"`]\(protocol: [a-z]/.test(l));
  assert(offenders.length === 0, `inline token literal reintroduced:\n     ${offenders.join('\n     ')}`);
});
test('DRIFT GUARD: F10 call site reads the shared stamp-first predicate, no inline title test', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const src = fs.readFileSync(path.resolve(__dirname, '../lib/tasks/services/complete-task-terminally.ts'), 'utf-8');
  assert(src.includes('isProgramHarnessTask(existing)'), 'F10 must use isProgramHarnessTask');
  assert(!src.includes('isProgramProtocolTitle('), 'F10 must not read the title directly anymore');
});
test('DRIFT GUARD: the stamp write is write-if-absent + Postgres-side jsonb merge (BC19-safe)', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const src = fs.readFileSync(path.resolve(__dirname, '../lib/agents/harness/prepare-task-for-execution.ts'), 'utf-8');
  assert(src.includes(`!('protocol' in taskMeta)`), 'write-if-absent guard missing — an overwrite re-opens R1');
  assert(/COALESCE\(metadata, '\{\}'::jsonb\) \|\| /.test(src),
    'stamp must merge Postgres-side — an app-side read-spread-update loses concurrent metadata writes');
  assert(src.includes('protocolResolvedAt'), 'the resolution-marker pair member is missing');
});


// ── WS1 Phase C: resolveTaskProtocol (the injection ladder head — F1 fix) ────
const moduleSrc = (require('fs') as typeof import('fs')).readFileSync(
  (require('path') as typeof import('path')).join(__dirname, '../lib/agents/harness/program-protocol.ts'), 'utf8');

test('resolveTaskProtocol: stamped string → canonical + source stamp', () => {
  const r = resolveTaskProtocol({ title: 'anything', metadata: { protocol: 'terraform-iac-protocol' } });
  assert(r.protocol === 'terraform-iac-protocol' && r.source === 'stamp', JSON.stringify(r));
});

test('resolveTaskProtocol: stamped NULL → {null, stamp} — does NOT fall through to a title token', () => {
  const r = resolveTaskProtocol({ title: 'x (protocol: pov-program) y', metadata: { protocol: null } });
  assert(r.protocol === null && r.source === 'stamp', JSON.stringify(r));
});

test('P4 stamp-beats-title: stamp AUTHORITATIVE when title disagrees (post-stamp rename moves nothing)', () => {
  const r = resolveTaskProtocol({
    title: 'renamed (protocol: pov-program)',
    metadata: { protocol: 'terraform-iac-protocol' },
  });
  assert(r.protocol === 'terraform-iac-protocol' && r.source === 'stamp', JSON.stringify(r));
});

test('resolveTaskProtocol: key ABSENT + title token → canonicalized + source title-fallback', () => {
  const r = resolveTaskProtocol({ title: 'Deploy net (protocol: network-provisioning)', metadata: { other: 1 } });
  assert(r.protocol === 'network-provisioning-protocol' && r.source === 'title-fallback', JSON.stringify(r));
});

test('resolveTaskProtocol: key absent + no token → {null, none}', () => {
  const r = resolveTaskProtocol({ title: 'plain pipeline task', metadata: null });
  assert(r.protocol === null && r.source === 'none', JSON.stringify(r));
});

test('P3 DUAL-PATH STAMP PARITY: a PRE-STAMP snapshot resolves IDENTICALLY to the post-stamp row', () => {
  // The stream injects from a route-edge task fetch taken BEFORE createAgentExecution writes the
  // stamp (AE-I1 keeps the fetch there); the engine reads post-stamp. This pin is the one that
  // would have caught F1: for any title, resolver(pre-stamp) === resolver(post-stamp-written-
  // from-that-title) — convergence by construction, because the fallback IS the writer function.
  const titles = [
    'Run (protocol: pov-program) now',
    'Leg (protocol: terraform-iac)',
    'Multi (protocol: k8s-deploy) then (protocol: pov-program)', // first-wins, matching the writer
    'No token at all',
  ];
  for (const title of titles) {
    const pre = resolveTaskProtocol({ title, metadata: null });                       // stream's stale snapshot
    const written = resolveProtocolStamp(title).protocol;                             // what the chokepoint stamps
    const post = resolveTaskProtocol({ title, metadata: { protocol: written } });     // engine's fresh row
    assert(pre.protocol === post.protocol,
      `divergence for ${JSON.stringify(title)}: pre=${pre.protocol} post=${post.protocol}`);
  }
});

test('resolveTaskProtocol: malformed stamped value (non-kebab) resolves to null, source stamp (never a guess)', () => {
  const r = resolveTaskProtocol({ title: '(protocol: pov-program)', metadata: { protocol: 'NOT VALID!!' } });
  assert(r.protocol === null && r.source === 'stamp', JSON.stringify(r));
});

test('isProgramHarnessTask is a THIN WRAPPER over resolveTaskProtocol (one ladder — source pin)', () => {
  assert(/isProgramProtocol\(resolveTaskProtocol\(task\)\.protocol\)/.test(moduleSrc),
    'isProgramHarnessTask must delegate to resolveTaskProtocol — a second inline ladder is the drift class F1 came from');
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
