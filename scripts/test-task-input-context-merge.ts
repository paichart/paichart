#!/usr/bin/env ts-node
/**
 * TEST-TS4: atomic inputContext merge (2026-06-08)
 *
 * Locks in the TS4 race fix (BC19). `mergeTaskInputContext` must use an ATOMIC single-statement
 * Postgres `||` merge (merge evaluated in-SQL referencing the column) — NOT an app-side
 * findUnique→spread→update, which lost concurrent foreign writes. And `applyChainedContext` must
 * delegate to it (no resurrected read-modify-write).
 *
 * Raw SQL can't be unit-run without a live DB; this is a SOURCE regression guard (same approach as
 * test-response-sanitizer), CI-safe, no imports that reach prisma.
 *
 * Run: npm run test:task-input-context-merge
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import * as fs from 'fs';
import * as path from 'path';

let passed = 0, failed = 0;
const failures: string[] = [];
const pass = (m: string) => { passed++; console.log(`  ✅ ${m}`); };
const fail = (m: string, d?: string) => { failed++; failures.push(d ? `${m} — ${d}` : m); console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`); };

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const helper = read('lib/tasks/services/inputContext.ts');
const chainer = read('lib/agents/harness/context-chainer.ts');

console.log('\n🔒 TEST-TS4 — atomic inputContext merge (BC19)\n');
console.log('── Part A: mergeTaskInputContext is the race-free atomic construct ──\n');

// A1 — atomic in-SQL shallow merge (COALESCE + jsonb || patch). This is the race fix.
if (/COALESCE\("inputContext",\s*'\{\}'::jsonb\)\s*\|\|\s*\$\{JSON\.stringify\(patch\)\}::jsonb/.test(helper)) {
  pass('A1 atomic merge: COALESCE("inputContext",\'{}\') || ${patch}::jsonb');
} else fail('A1 atomic || merge construct missing');

// A2 — RETURNING (preserves A2: authoritative in-memory value, no second read)
if (/RETURNING "inputContext"/.test(helper)) pass('A2 RETURNING "inputContext" (A2 in-memory return preserved)');
else fail('A2 RETURNING missing');

// A3 — raw UPDATE must set updated_at (bypasses Prisma @updatedAt)
if (/"updated_at"\s*=\s*now\(\)/.test(helper)) pass('A3 "updated_at" = now() (raw UPDATE bypasses @updatedAt)');
else fail('A3 updated_at = now() missing');

// A4 — parameterized (no raw interpolation of taskId into SQL string)
if (/WHERE id = \$\{taskId\}/.test(helper) && /Prisma\.sql`/.test(helper)) pass('A4 parameterized via Prisma.sql (taskId bound, not concatenated)');
else fail('A4 not safely parameterized');

console.log('\n── Part B: applyChainedContext delegates (no resurrected read-modify-write) ──\n');

// B1 — chainer calls the helper
if (/mergeTaskInputContext\(taskId, patch\)/.test(chainer)) pass('B1 applyChainedContext delegates to mergeTaskInputContext');
else fail('B1 chainer does not call mergeTaskInputContext');

// B2 — the OLD racy pattern is gone from applyChainedContext (no findUnique+update RMW)
{
  // isolate applyChainedContext body
  const idx = chainer.indexOf('export async function applyChainedContext');
  const body = idx >= 0 ? chainer.slice(idx) : chainer;
  const noRacyRead = !/prisma\.task\.findUnique/.test(body) || chainer.indexOf('prisma.task.findUnique') < idx;
  const noRacyWrite = !/prisma\.task\.update/.test(body);
  if (noRacyWrite) pass('B2 applyChainedContext no longer does prisma.task.update (racy RMW removed)');
  else fail('B2 racy prisma.task.update still present in applyChainedContext');
  if (noRacyRead) pass('B2b applyChainedContext no longer does its own findUnique read-then-write');
  else fail('B2b racy findUnique still in applyChainedContext');
}

console.log('\n── Part C: inheritInterfaceContractIfAbsent — the 2026-08-26 contract-inheritance write ──\n');
{
  const prep = read('lib/agents/harness/prepare-task-for-execution.ts');

  // C1 — the write-if-absent guard is IN THE STATEMENT, not app-side. An app-side check-then-act
  // is a TOCTOU: two concurrent prepares of the same child both read "absent" and both write.
  const guardInSql = /UPDATE "tasks"[\s\S]{0,600}?AND NOT \(COALESCE\("inputContext"[\s\S]{0,200}?\?\s*'interfaceContract'/.test(helper);
  guardInSql ? pass('C1 write-if-absent guard lives inside the UPDATE (EvalPlanQual re-check)')
             : fail('C1 write-if-absent guard is not in-statement — reintroduces the TOCTOU');

  // C2 — CHILD-TYPE EXCLUSION. Without it a contract-less PIPELINE leg (whose stage is owned by the
  // PROGRAM parent) would be HEALED with the program's contract and F16 would never fire — silently,
  // with the wrong contract. This is the scoping decision that existed in prose and not in code.
  /c\.type <> 'PIPELINE'/.test(helper)
    ? pass("C2 scoped to NON-PIPELINE children (c.type <> 'PIPELINE') — F16 is never backstopped")
    : fail('C2 missing child-type exclusion — would heal PIPELINE legs and silence F16');

  // C3 — json-null on BOTH sides. `?` is TRUE for a key holding JSON null; copying one would wedge
  // the child forever (SQL sees the key present, the JS truthiness check reads false, F16 throws
  // every run with no retry).
  const bothSides = (helper.match(/jsonb_typeof\([^)]*"inputContext"->'interfaceContract'\) = 'object'/g) || []).length;
  bothSides >= 3
    ? pass(`C3 json-null guarded on both sides (${bothSides} typeof checks)`)
    : fail('C3 json-null not guarded on both parent and child — permanent wedge', `found ${bothSides}`);

  // C4 — THE QUALIFIER. programHarnessProtocolFilter matches pov-program only, but the parent here
  // is a LEG (measured on prod: every contract-bearing parent is network-provisioning /
  // terraform-iac). Using it would match ZERO parents forever while tests and EXPLAIN read green.
  const rightQualifier = /p\.metadata->>'protocol' IS NOT NULL/.test(helper);
  // Check for USE, not MENTION: the file deliberately NAMES the wrong filter in a comment
  // explaining why it is not used. A bare occurrence test flags that comment — the same
  // prose-mentions-a-banned-token false positive dialect-lint scans only fenced blocks to avoid.
  const wrongQualifier = /import[^;]*programHarnessProtocolFilter/.test(helper)
    || /^\s*[^*/\n]*\bprogramHarnessProtocolFilter\s*\(/m.test(helper);
  rightQualifier && !wrongQualifier
    ? pass('C4 qualifier is protocol-IS-NOT-NULL, not the pov-program-only filter (0-row trap)')
    : fail('C4 wrong parent qualifier — the fix would be a permanent no-op', `right=${rightQualifier} wrong=${wrongQualifier}`);

  // C5 — deterministic parent. An F16-recovered leg beside its dead predecessor both point at the
  // same stage; an unordered pick can inherit the DEAD leg's contract.
  /ORDER BY p\.created_at DESC[\s\S]{0,80}LIMIT 1/.test(helper)
    ? pass('C5 parent selection is deterministic (ordered, LIMIT 1)')
    : fail('C5 parent selection is nondeterministic — may inherit a superseded leg contract');

  // C6 — FAIL-CLOSED on oversize. A truncated binding contract is worse than none.
  const failsClosed = /contract-too-large[\s\S]{0,120}return null/.test(helper) && !/slice\(0, *deps\.maxBytes/.test(helper);
  failsClosed ? pass('C6 oversize contract copies NOTHING (fail-closed, never truncated)')
              : fail('C6 oversize handling is not fail-closed');

  // C7 — provenance rides SIBLING keys. Inside `interfaceContract` it would corrupt the value every
  // child transcribes; inside `pipelineMetadata` the chainer replaces it wholesale each execution.
  const siblingProvenance = /interfaceContract: safe,[\s\S]{0,160}interfaceContractInheritedFrom/.test(helper);
  siblingProvenance ? pass('C7 provenance keys are siblings of interfaceContract, not nested inside it')
                    : fail('C7 provenance placement wrong');

  // C8 — NO R9 at the copy site. Sanitising a binding constant corrupts the exact value every child
  // must transcribe verbatim (the C1/R5 incident: platform mutation inside an agent-attributed view
  // produced a false blocking verdict and cost a full round).
  !/sanitizeConnectedOutput|neutraliz/i.test(helper)
    ? pass('C8 no R9/neutralising transform at the copy site')
    : fail('C8 an R9-style transform reached the copy site');
}

console.log('\n── Part D: placement invariants in prepareTaskForExecution ──\n');
{
  const prep = read('lib/agents/harness/prepare-task-for-execution.ts');
  const iInherit = prep.indexOf('inheritInterfaceContractIfAbsent(taskId');
  const iSnapshot = prep.indexOf('const contractCheck = await prisma.task.findUnique');
  const iSkip = prep.indexOf('if (opts.skipChaining)');

  // D1 — THE RACE. The inheritance write must land BEFORE the contractCheck snapshot, so that read
  // sees the installed contract. After it, the F16 guard reads hasContract=false and marks the child
  // FAILED for a contract the platform just installed — self-inflicted, no second actor needed.
  (iInherit > 0 && iSnapshot > 0 && iInherit < iSnapshot)
    ? pass('D1 inheritance writes BEFORE the contractCheck snapshot (no self-inflicted F16)')
    : fail('D1 inheritance is not before the snapshot read — F16 can fire on an installed contract');

  // D2 — runs before the skipChaining return, so an override execution still gets the row updated.
  (iInherit > 0 && iSkip > 0 && iInherit < iSkip)
    ? pass('D2 inheritance runs before the skipChaining early return')
    : fail('D2 skipChaining path never inherits');

  // D3 — TS3: that path must still RETURN NULL, or BC-T6-1 replaces the caller's explicit override
  // with the row value — the inverse of its purpose.
  /if \(opts\.skipChaining\) \{[\s\S]{0,600}?return null;/.test(prep)
    ? pass('D3 skipChaining still returns null (BC-T6-1 override not clobbered)')
    : fail('D3 skipChaining no longer returns null — explicit overrides would be clobbered');

  // D4 — the dep-free child (the harvester — the fix's PRIMARY target) must still get its merged
  // context back, or the SSE route's §6 render and the frozen config never see the contract.
  /if \(!chained\) return inheritedContext;/.test(prep)
    ? pass('D4 dep-free children return the inherited context (the harvester is dep-free)')
    : fail('D4 dep-free path returns null — the fix would be invisible to §6 and the snapshot');

  // D5 — DISJOINTNESS is the real invariant behind "predicate parity": inheritance is NON-PIPELINE
  // only and the F16 structural arm is PIPELINE only, so the guard can never demand a contract that
  // inheritance declines to supply. Do not "unify" the tiers.
  /contractCheck\?\.type === 'PIPELINE'/.test(prep) && /c\.type <> 'PIPELINE'/.test(helper)
    ? pass('D5 populations are disjoint — F16 structural arm PIPELINE-only, inheritance non-PIPELINE-only')
    : fail('D5 disjointness broken — guard and inheritance could disagree about the same task');

  // D6 — evidence, not silent healing. Without this the fix institutionalises the harness's
  // paraphrase failure and adherence regressions become invisible.
  /CONTRACT_INHERITED_FROM_LEG/.test(prep)
    ? pass('D6 every inheritance leaves a greppable evidence log')
    : fail('D6 healing is silent — adherence regressions would be unmeasurable');
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ✅ ${passed} passed, ${failed ? '❌ ' + failed + ' failed' : '0 failed'}`);
if (failed > 0) { console.log('\nFailures:\n  • ' + failures.join('\n  • ')); process.exit(1); }
console.log('✅ atomic inputContext merge suite passed\n');
