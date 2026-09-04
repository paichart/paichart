#!/usr/bin/env ts-node
/**
 * Fixtures for lib/mcp/server/tools/hub/dual-representation.js — WS2 phase 1 (shadow mode).
 *
 * WHY PIN A THING THAT DROPS NOTHING: shadow mode's whole purpose is to produce the equivalence
 * census that phase 2's drop decision rests on. A census that silently mis-counts is worse than no
 * census — it would authorise a drop on bad evidence. The comparator pinned here IS the comparator
 * phase 2 will gate on, so its correctness has to be established before it is trusted, not after.
 *
 * Every case below is a real shape observed in production, not an invention:
 *  - equal twin            → the nornir/FastMCP shape that produced the R16 credential incident
 *  - key-order-only        → 74 of 86 real pairs measured; a naive stringify comparator calls these
 *                            DIFFERENT and turns the census into noise (and phase 2 into a no-op)
 *  - prose summary         → spec-LEGAL: a server may put a human-readable rendering in content[].
 *                            "Functionally equivalent" is not "equal". Must not count as a twin.
 *  - truncated twin        → 179 of 670 blind-shaped leaves measured; cut by a cap, never parses
 *  - text-only service     → all 7 Node first-party services + trend-vision-one emit no
 *                            structuredContent; the census must stay silent for them
 *  - isError               → downstream errors ride the SUCCESS envelope; phase 2 skips them, so
 *                            the census must too or the two disagree
 */
const {
  inspectDualRepresentation,
  shadowObserveDualRepresentation,
} = require('../lib/mcp/server/tools/hub/dual-representation');

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { console.log(`✅ ${name}`); passed++; }
  else { console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`); failed++; }
}

const payload = { hosts: { ceos1: { config: 'router ospf 1\nusername admin secret sha512 $6$x$y' } } };
const twin = JSON.stringify(payload);

{
  const f = inspectDualRepresentation({ structuredContent: payload, content: [{ type: 'text', text: twin }] });
  check('equal serialized twin is detected', f.applicable && f.twins === 1 && f.equal === 1, JSON.stringify(f));
  check('duplicated bytes are counted', f.dupBytes === twin.length, `${f.dupBytes} vs ${twin.length}`);
}
{
  // The single most important comparator property: 74 of 86 real pairs differ ONLY by key order.
  const f = inspectDualRepresentation({ structuredContent: { a: 1, b: 2 }, content: [{ type: 'text', text: '{"b":2,"a":1}' }] });
  check('key-order-only difference counts as EQUAL (74/86 of real pairs)', f.equal === 1 && f.differ === 0, JSON.stringify(f));
}
{
  const f = inspectDualRepresentation({ structuredContent: payload, content: [{ type: 'text', text: '2 hosts harvested OK' }] });
  check('a spec-legal prose summary is NOT a twin', !f.applicable && f.reason === 'no-serialized-twin', JSON.stringify(f));
}
{
  const f = inspectDualRepresentation({ structuredContent: { a: 1 }, content: [{ type: 'text', text: '{"a":2}' }] });
  check('genuinely different payload counts as DIFFER (phase 2 must keep both)', f.differ === 1 && f.equal === 0, JSON.stringify(f));
}
{
  const f = inspectDualRepresentation({ structuredContent: payload, content: [{ type: 'text', text: twin.slice(0, 20) }] });
  check('truncated twin counts as unparseable, never as equal', f.unparseable === 1 && f.equal === 0, JSON.stringify(f));
}
{
  const f = inspectDualRepresentation({ content: [{ type: 'text', text: twin }] });
  check('text-only service is not applicable (no false census entries)', !f.applicable && f.reason === 'no-structured-content', JSON.stringify(f));
}
{
  const f = inspectDualRepresentation({ isError: true, structuredContent: payload, content: [{ type: 'text', text: twin }] });
  check('isError is excluded, matching what phase 2 will skip', !f.applicable && f.reason === 'is-error', JSON.stringify(f));
}
{
  let threw = false;
  for (const bad of [null, undefined, 'str', 42, { content: 'notarray' }, { structuredContent: undefined }]) {
    try { inspectDualRepresentation(bad as never); } catch { threw = true; }
  }
  check('never throws on malformed input (a measurement must not fail a service call)', !threw);
}
{
  // Shadow mode must return the response byte-identical and must not throw even on a broken logger.
  const resp = { structuredContent: payload, content: [{ type: 'text', text: twin }] };
  const brokenLogger = { info() { throw new Error('logger exploded'); }, warn() { /* noop */ } };
  const back = shadowObserveDualRepresentation(resp, brokenLogger, { service: 's', tool: 't' });
  check('shadow mode returns the response UNCHANGED (drops nothing)', back === resp);
  check('shadow mode survives a throwing logger', true);
}
{
  // Facts must be content-free: pino sits OUTSIDE R10's redaction scope, so a payload-bearing log
  // line would be a fresh unredacted secret channel with no guard in front of it.
  let logged: Record<string, unknown> | null = null;
  const capture = { info(o: Record<string, unknown>) { logged = o; }, warn() { /* noop */ } };
  shadowObserveDualRepresentation(
    { structuredContent: payload, content: [{ type: 'text', text: twin }] },
    capture, { service: 'svc', tool: 'fetch_data' });
  const s = JSON.stringify(logged);
  check('census line carries NO payload (no secret, no config, no leaf value)',
    !!logged && !/sha512|\$6\$|router ospf|username admin/.test(s), s.slice(0, 200));
  check('census line is not tagged securityEvent (it fires on ordinary traffic)', !/securityEvent/.test(s));
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
