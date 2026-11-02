#!/usr/bin/env ts-node
/**
 * test-replay-nets-held — EF-P2-8 (PLATFORM-HELD-BYTES G3 entry, 2026-10-16).
 *
 * The replay runner must hand the nets what PRODUCTION hands them, or a stored variant stamp cannot be reproduced:
 *   1. `held` is INPUT — hydrated from the stored `editApplication` / `heldBytes` stamps and the BASE-held handles
 *      (`edit-application.manifest.json` rows carrying `baseRefId`); a leaf only, never a harness;
 *   2. a handle set that cannot be recovered is a NAMED notice, never a silent `null`;
 *   3. the ctx task is `{id, type, metadata, inputContext}` — no `title` (production passes none).
 * Pure: no database (the module's client is constructed at load, never connected).
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub';
const { hydrateHeldCtx, netCtxTask } = require('./replay-nets');

let passed = 0; let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`✅ ${name}`); } else { failed++; console.log(`❌ ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`); }
}

const EA = { version: 1, state: 'applied', refWrite: 'committed', candidateDigest8: 'abcd1234' };
const HB = { held: 2, refused: {}, refWrite: 'committed' };
const MAN = JSON.stringify({ refWrite: 'committed', files: [
  { handle: 'H1', path: '/etc/otel/config.yaml', baseRefId: 'ref1', candidateRefId: 'c1' },
  { handle: 'H2', path: '/etc/nginx/nginx.conf', baseRefId: 'ref2' },
  { handle: 'H3', path: '/new/file.yaml' }, // a create: no BASE
] });

// 1 — non-variant rows: nothing hydrated, output unchanged.
{
  const r = hydrateHeldCtx({ finalResponse: 'x', toolCalls: [] }, undefined, 'ACTION');
  check('non-variant leaf: held absent, no notice', r.held === null && r.heldNotice === null, r);
  const n = hydrateHeldCtx(null, undefined, 'ACTION');
  check('unparseable artifact: held absent', n.held === null && n.heldNotice === null, n);
}
// 2 — an Author leaf: the stored stamp + the BASE-held handles (creates excluded).
{
  const r = hydrateHeldCtx({ editApplication: EA }, MAN, 'ACTION');
  check('Author: editApplication is the STORED stamp', r.held?.editApplication === EA, r.held);
  check('Author: baseHeldHandles = manifest rows with a baseRefId', JSON.stringify(r.held?.baseHeldHandles) === '["H1","H2"]', r.held);
  check('Author: no notice when recoverable', r.heldNotice === null, r.heldNotice);
  check('Author: no heldBytes invented', !('heldBytes' in (r.held ?? {})), r.held);
}
// 3 — a Harvester leaf: heldBytes only, no manifest needed.
{
  const r = hydrateHeldCtx({ heldBytes: HB }, undefined, 'ACTION');
  check('Harvester: heldBytes is the STORED stamp', r.held?.heldBytes === HB, r.held);
  check('Harvester: no baseHeldHandles key, no notice', !('baseHeldHandles' in (r.held ?? {})) && r.heldNotice === null, r);
}
// 4 — unrecoverable handles are NAMED (two distinct causes).
{
  const rolled = hydrateHeldCtx({ editApplication: { ...EA, refWrite: 'rolled-back' } },
    JSON.stringify({ refWrite: 'rolled-back', files: [{ handle: 'H1', path: '/x' }] }), 'ACTION');
  check('rolled-back manifest: baseHeldHandles null', rolled.held?.baseHeldHandles === null, rolled.held);
  check('rolled-back manifest: named notice', /manifest carries no baseRefId/.test(rolled.heldNotice ?? ''), rolled.heldNotice);
  const missing = hydrateHeldCtx({ editApplication: EA }, undefined, 'ACTION');
  check('no manifest: named notice', /no edit-application\.manifest\.json/.test(missing.heldNotice ?? ''), missing.heldNotice);
  const broken = hydrateHeldCtx({ editApplication: EA }, '{not json', 'ACTION');
  check('corrupt manifest: null + named notice', broken.held?.baseHeldHandles === null && !!broken.heldNotice, broken);
}
// 5 — a harness never gets held, even though its pipeline-index.json carries the hoisted editApplication.
{
  const r = hydrateHeldCtx({ editApplication: { ...EA, source: 'author-stamp' } }, MAN, 'PIPELINE');
  check('PIPELINE: held absent (the hoist re-reads the Author)', r.held === null && r.heldNotice === null, r);
}
// 6 — the ctx task carries exactly production's four fields.
{
  const t = netCtxTask({ id: 't1', type: 'ACTION', title: 'Author (protocol: observability-config-held)', agentRole: 'config_change_author',
    stageId: 's1', metadata: { a: 1 }, inputContext: { b: 2 } } as never);
  check('ctx task: keys are id,type,metadata,inputContext', JSON.stringify(Object.keys(t)) === '["id","type","metadata","inputContext"]', Object.keys(t));
  check('ctx task: no title', !('title' in t), t);
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
