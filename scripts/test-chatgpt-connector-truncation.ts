#!/usr/bin/env ts-node
/**
 * TEST-Q2: ChatGPT connector fetch truncation signal (2026-06-08)
 *
 * Locks in the Q2 signal-design fix: the connector fetch truncation marker is an
 * honest FACT (characters, not "bytes"; no recovery tool baked in), recovery routing
 * lives in getNextStepsForResource()/`_meta.nextSteps`, the artifact case is an honest
 * dead-end (no false agent.results/search promise), and the resource cap is centralized.
 *
 * CI-safety: chatgpt-connector-handler.js transitively require()s lib/prisma. Stub
 * DATABASE_URL with obviously-fake creds BEFORE the require (the Prisma client is created
 * lazily — pure methods never query). See [[feedback_ci_database_url_transitive]].
 *
 * Run: npm run test:chatgpt-connector-truncation
 */

/* eslint-disable @typescript-eslint/no-require-imports */
process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgresql://fake:fake@127.0.0.1:5432/fake_test_db?schema=public';

import * as fs from 'fs';
import * as path from 'path';

const ChatGPTConnectorHandler = require('../lib/mcp/server/tools/chatgpt-connector-handler.js');

let passed = 0;
let failed = 0;
const failures: string[] = [];
const pass = (m: string) => { passed++; console.log(`  ✅ ${m}`); };
const fail = (m: string, d?: string) => { failed++; failures.push(d ? `${m} — ${d}` : m); console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`); };

const h = new ChatGPTConnectorHandler();

console.log('\n🔌 TEST-Q2 — connector fetch truncation signal\n');
console.log('── Part A: behavioral (pure methods) ──\n');

// A1 — under cap → no truncation, text unchanged
{
  const r = h._capContent('short body', 50000);
  if (r.text === 'short body' && r.truncation === null) pass('A1 under-cap → {text unchanged, truncation: null}');
  else fail('A1 under-cap wrong', JSON.stringify(r).slice(0, 120));
}

// A2 — over cap → honest fact, CHARACTERS (not bytes), NO tool name
{
  const big = 'x'.repeat(60000);
  const r = h._capContent(big, 50000);
  const t = r.truncation;
  const okFact = t && t.truncated === true && t.returnedChars === 50000 && t.totalChars === 60000;
  const okMarker = /returned 50000 of 60000 characters/.test(r.text);
  const noBytes = !/\bbytes\b/i.test(r.text);
  const noToolName = !/pov\.details|agent\.results|search\(/.test(r.text);
  if (okFact && okMarker && noBytes && noToolName) {
    pass('A2 over-cap → fact {returnedChars,totalChars}, marker says "characters", no "bytes", no tool name');
  } else {
    fail('A2 over-cap signal wrong', `fact=${okFact} marker=${okMarker} noBytes=${noBytes} noToolName=${noToolName}`);
  }
}

// A3 — per-type cap: artifact higher than summaries
{
  if (h._capForType('artifact') === 100000 && h._capForType('pov') === 50000 && h._capForType('task') === 50000) {
    pass('A3 _capForType: artifact=100000, others=50000');
  } else {
    fail('A3 cap values wrong', `artifact=${h._capForType('artifact')} pov=${h._capForType('pov')}`);
  }
}

// A4 — artifact recovery is an HONEST DEAD-END: no false tool promise
{
  const steps = h.getNextStepsForResource('artifact', { id: 'a1', title: 'Big Report' }).join(' ');
  const honest = /not retrievable in full through the connector/i.test(steps);
  const noFalsePromise = !/agent\.results|pov\.details|search\(/.test(steps);
  if (honest && noFalsePromise) pass('A4 artifact case = honest dead-end, names NO recovery tool');
  else fail('A4 artifact case wrong', `honest=${honest} noFalsePromise=${noFalsePromise} :: ${steps.slice(0, 160)}`);
}

// A5 — the correct per-type recoveries are unchanged
{
  const pov = h.getNextStepsForResource('pov', { id: 'p1', title: 'POV' }).join(' ');
  const exec = h.getNextStepsForResource('execution', { id: 'e1', title: 'Exec', metadata: { taskId: 't1' } }).join(' ');
  if (/pov\.details/.test(pov) && /agent\.results/.test(exec)) pass('A5 pov→pov.details, execution→agent.results (correct, unchanged)');
  else fail('A5 per-type recovery regressed', `pov=${/pov\.details/.test(pov)} exec=${/agent\.results/.test(exec)}`);
}

console.log('\n── Part B: static integration (centralized chokepoint) ──\n');
{
  const src = fs.readFileSync(path.join(__dirname, '../lib/mcp/server/tools/chatgpt-connector-handler.js'), 'utf8');

  // B1 — cap is applied ONCE, centrally, in handleFetch (not per compile* method)
  const central = /this\._capContent\(document\.text, this\._capForType\(type\)\)/.test(src);
  // only two _capContent references: the definition + the one central call
  const capRefs = (src.match(/_capContent\(/g) || []).length;
  if (central && capRefs === 2) pass(`B1 cap centralized in handleFetch (one call site; ${capRefs} total _capContent refs incl. def)`);
  else fail('B1 cap not centralized', `central=${central} _capContent refs=${capRefs} (expect 2)`);

  // B2 — _meta.truncation is emitted (the FACT channel)
  if (/\.\.\.\(truncation \? \{ truncation \} : \{\}\)/.test(src)) pass('B2 _meta.truncation emitted');
  else fail('B2 _meta.truncation not emitted');

  // B3 — the OLD misleading marker / pov.details-in-marker is gone
  if (!/Content truncated to 50KB/.test(src) && !/source-of-truth tool/.test(src)) pass('B3 old "Content truncated to 50KB / source-of-truth" marker removed');
  else fail('B3 old marker still present');
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ✅ ${passed} passed, ${failed ? '❌ ' + failed + ' failed' : '0 failed'}`);
if (failed > 0) { console.log('\nFailures:\n  • ' + failures.join('\n  • ')); process.exit(1); }
console.log('✅ connector truncation-signal suite passed\n');
// Force a clean exit: the handler lazily created a Prisma pool (fake DATABASE_URL stub)
// whose async connect failure would otherwise dirty the exit code. Assertions are done.
process.exit(0);
