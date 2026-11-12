#!/usr/bin/env ts-node
/**
 * PLATFORM-HELD-BYTES Stage B V-9 — the fail-closed carrier, the verdict-mismatch guard's variant frame, and the deliverable's
 * "Platform outcome" line (plan STAGE-B-PLAN.md v4.1 §3 V-9; D-I; arch S-B′ / v4 S-G / N-7; PC S-18). CI-safe: stub clients.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://stub:stub@localhost:5432/stub';
import * as fs from 'fs';
import * as path from 'path';
import { applyHeldEditCarrier, heldEditVerdict, heldEditWouldForce, heldEditOutcomeLine, HELD_OUT_OF_SCOPE_STATES } from '../lib/agents/harness/held-edit-carrier';
import { heldPackageOutOfScope } from '../lib/agents/harness/held-bytes/scope';
import { annotateQualityGateVerdictMismatch } from '../lib/agents/harness/verdict-mismatch-guard';
import { appendHeldEditOutcomeSection } from '../lib/services/report-warnings-section';
import { authoritativeReadStub, type StubExecution } from './fixtures/authoritative-read-stub';
import { buildDeviceSourcesSnapshot, resolveLegDeviceSources } from '../lib/agents/harness/device-sources';
const SNAP_ABSENT = () => JSON.parse(JSON.stringify(buildDeviceSourcesSnapshot(resolveLegDeviceSources({ contractValue: undefined, taskBody: 'no block' }), 't')));

let passed = 0; let failed = 0;
const pending: Array<{ d: string; fn: () => Promise<void> | void }> = [];
const test = (d: string, fn: () => Promise<void> | void) => { pending.push({ d, fn }); };
function eq(a: unknown, b: unknown, what = '') { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c: unknown, what: string) { if (!c) throw new Error(what); }

const STAGE = 'stage-v';
// Phase 10 panel D4: the held leg is an obs leg (the retired token is no longer held-capable).
const VLEG = { id: 'leg-v', type: 'PIPELINE', title: 'Ingress (protocol: observability-config)', metadata: { protocol: 'observability-config-protocol', pipelineStageId: STAGE } };
const RETIRED = { id: 'leg-r', type: 'PIPELINE', title: 'Ingress (protocol: observability-config-held)', metadata: { protocol: 'observability-config-held-protocol', pipelineStageId: STAGE } };
// Phase 10: obs is held-capable (the fold), so the NON-held PIPELINE leg is another domain; OBSLEG is a folded obs leg.
const PLAIN = { type: 'PIPELINE', title: 'Fabric (protocol: network-derivation)', metadata: { protocol: 'network-derivation-protocol', pipelineStageId: STAGE } }; // the NON-held-capable leg (terraform joined held at step 3, 1.15.0; network at push 3, 1.25.0 — the value leg is the one left)
const OBSLEG = { id: 'leg-v', type: 'PIPELINE', title: 'Ingress (protocol: observability-config)', metadata: { protocol: 'observability-config-protocol', pipelineStageId: STAGE } };
const AUTH_EXEC = 'ex-author';
const applied = { version: 1, state: 'applied', candidateDigest8: 'abcd1234' };
const rendered = (o: Record<string, unknown> = {}) => ({ version: 1, state: 'rendered', authorExecutionId: AUTH_EXEC, candidateDigest8: 'abcd1234', ...o });

/** A leg stage: an Author and a Reviewer child, each with one SUCCESS result.json carrying the stamps given. */
function world(author: Record<string, unknown> | null, reviewer: Record<string, unknown> | null, o: { throwOnRead?: boolean; baseLegs?: Array<string | null>; harvester?: { refusalsByExec: Record<string, number> }; captureRefs?: Array<{ target: string; path: string }> } = {}) {
  const reads: string[] = [];
  const execs: StubExecution[] = [
    { id: AUTH_EXEC, taskId: 't-author', createdAt: new Date(1_700_000_000_000), result: { agentRole: 'config_change_author', finalResponse: 'pkg', ...(author ? { editApplication: author } : {}) } },
    { id: 'ex-rev', taskId: 't-rev', createdAt: new Date(1_700_000_001_000), result: { agentRole: 'change_reviewer', finalResponse: 'review', reviewerVerdict: { approved: true, blocking: [] }, ...(reviewer ? { reviewedEditDiff: reviewer } : {}) } },
  ];
  // held-k8s step 3 (G-4): an optional Harvester child — an OLDER execution and the authoritative (newest) one.
  if (o.harvester) {
    execs.push({ id: 'ex-harv-old', taskId: 't-harv', createdAt: new Date(1_699_999_998_000), result: { agentRole: 'infra_state_harvester', finalResponse: 'h0', heldBytes: { version: 1 } } });
    execs.push({ id: 'ex-harv', taskId: 't-harv', createdAt: new Date(1_699_999_999_000), result: { agentRole: 'infra_state_harvester', finalResponse: 'h1', heldBytes: { version: 1 } } });
  }
  const stub = authoritativeReadStub(execs);
  const db: any = {
    ...stub,
    task: { findMany: async () => { reads.push('task.findMany'); if (o.throwOnRead) throw new Error('db down'); return [
      { id: 't-author', title: 'Author x', agentRole: 'config_change_author', type: 'ACTION' },
      { id: 't-rev', title: 'Review x', agentRole: 'change_reviewer', type: 'ACTION' },
      ...(o.harvester ? [{ id: 't-harv', title: 'Harvest x', agentRole: 'infra_state_harvester', type: 'ACTION' }] : [])]; } },
    heldCaptureRefusal: { count: async (a: { where: { executionId: string; refusal: string } }) => { reads.push(`heldCaptureRefusal.count:${a.where.executionId}:${a.where.refusal}`);
      return o.harvester?.refusalsByExec[a.where.executionId] ?? 0; } },
    heldFileRef: { findMany: async (a: { where: { executionId: string; kind: string } }) => { reads.push(`heldFileRef.findMany:${a.where.executionId}:${a.where.kind}`);
      if (a.where.kind === 'CAPTURE') return o.captureRefs ?? [];
      return (o.baseLegs ?? ['leg-v']).map((legTaskId) => ({ legTaskId })); } },
  };
  return { db, reads };
}
const merge = (outcome: string | undefined) => ({ pipelineStageId: STAGE, qualityGate: { ...(outcome ? { outcome } : {}), reviewerScore: 80 } }) as Record<string, any>;

test('rule: applied + rendered + same Author + same digest ⇒ no reason; approval stands', async () => {
  const { db } = world(applied, rendered());
  const m = merge('approved');
  const r = await applyHeldEditCarrier(db, VLEG, m);
  eq([r, m.qualityGate.outcome, m.qualityGate.heldEdit], [{ applied: true, forced: false }, 'approved', { state: 'applied', reviewerSaw: 'rendered', agentOutcome: 'approved', forced: false, inScope: true }]);
});

test('rule: each forcing condition rewrites approved → needs-revision, with its reason', async () => {
  const cases: Array<[string, Record<string, unknown> | null, Record<string, unknown> | null, string]> = [
    ['refused', { version: 1, state: 'refused' }, rendered(), 'refused'],
    ['partial', { version: 1, state: 'partial' }, rendered(), 'partial'],
    ['no Author stamp', null, rendered(), 'no-author-stamp'],
    ['Reviewer named a state', applied, { version: 1, state: 'diff-over-budget', authorExecutionId: AUTH_EXEC }, 'reviewer-saw-no-diff'],
    ['no Reviewer stamp', applied, null, 'reviewer-saw-no-diff'],
    ['Reviewer saw an older Author', applied, rendered({ authorExecutionId: 'ex-older' }), 'reviewed-stale-author'],
    ['digest mismatch', applied, rendered({ candidateDigest8: 'ffff0000' }), 'reviewed-stale-author'],
  ];
  for (const [name, a, rv, reason] of cases) {
    const { db } = world(a, rv);
    const m = merge('approved');
    await applyHeldEditCarrier(db, VLEG, m);
    eq([m.qualityGate.outcome, m.qualityGate.heldEdit.forced, m.qualityGate.heldEdit.reason, m.qualityGate.heldEdit.agentOutcome],
      ['needs-revision', true, reason, 'approved'], `${name}: `);
  }
});

test('fail-closed: a read error forces (could-not-check); the carrier never throws', async () => {
  const { db } = world(applied, rendered(), { throwOnRead: true });
  const m = merge('approved');
  await applyHeldEditCarrier(db, VLEG, m);
  eq([m.qualityGate.outcome, m.qualityGate.heldEdit.reason], ['needs-revision', 'could-not-check']);
});

test('asymmetric: an agent needs-revision is recorded, never approved, forced:false', async () => {
  const { db } = world(applied, rendered());
  const m = merge('needs-revision');
  await applyHeldEditCarrier(db, VLEG, m);
  eq([m.qualityGate.outcome, m.qualityGate.heldEdit.forced, m.qualityGate.heldEdit.agentOutcome], ['needs-revision', false, 'needs-revision']);
  const { db: db2 } = world({ version: 1, state: 'refused' }, rendered());
  const m2 = merge('escalated');
  await applyHeldEditCarrier(db2, VLEG, m2);
  eq([m2.qualityGate.outcome, m2.qualityGate.heldEdit.forced, m2.qualityGate.heldEdit.reason], ['escalated', false, 'refused']);
});

const K8SLEG = { id: 'leg-v', type: 'PIPELINE', title: 'Deploy (protocol: kubernetes-gitops)', metadata: { protocol: 'kubernetes-gitops-protocol', pipelineStageId: STAGE } };
test('held-k8s step 3 (G-4): a source-not-pinned refusal on the leg\'s AUTHORITATIVE Harvester forces needs-revision — even when the package is out of scope', async () => {
  const noBase = { version: 1, state: 'no-base' };                                  // out of scope: the refused read left no base
  const w = world(noBase, null, { harvester: { refusalsByExec: { 'ex-harv': 1 } } });
  const m = merge('approved');
  await applyHeldEditCarrier(w.db, K8SLEG, m);
  eq([m.qualityGate.outcome, m.qualityGate.heldEdit.reason, m.qualityGate.heldEdit.inScope, m.qualityGate.heldEdit.forced], ['needs-revision', 'source-not-pinned', false, true]);
  ok(w.reads.includes('heldCaptureRefusal.count:ex-harv:source-not-pinned'), 'scoped to the authoritative Harvester execution');
  // a refusal on an OLDER Harvester execution (a re-run since) does not force; nor does none at all
  for (const refusalsByExec of [{ 'ex-harv-old': 2 }, {}] as Array<Record<string, number>>) {
    const m2 = merge('approved');
    await applyHeldEditCarrier(world(noBase, null, { harvester: { refusalsByExec } }).db, K8SLEG, m2);
    eq([m2.qualityGate.outcome, m2.qualityGate.heldEdit.forced, m2.qualityGate.heldEdit.inScope], ['approved', false, false], `${JSON.stringify(refusalsByExec)}: `);
  }
  // a stage rebind still wins (it is the stronger fact)
  const m3 = { pipelineStageId: 'stage-of-another-leg', qualityGate: { outcome: 'approved' } } as Record<string, any>;
  await applyHeldEditCarrier(world(noBase, null, { harvester: { refusalsByExec: { 'ex-harv': 1 } } }).db, K8SLEG, m3);
  eq(m3.qualityGate.heldEdit.reason, 'stage-rebind');
});

// ── held-network push 2 (O-4, owner 2026-10-26): a declared device-read device with NO held base forces needs-revision ─────────
// The carrier reads the GOVERNING declaration through the shipping reader (device-sources-read.ts, sec-ops push-2 SF-1): the leg row's
// snapshot checked against its live contract / body. `legRow` is what the stub's $queryRaw returns for that read.
const SNAP = (lines: string[]) => JSON.parse(JSON.stringify(buildDeviceSourcesSnapshot(resolveLegDeviceSources({ contractValue: lines, taskBody: null }), '2026-10-26T00:00:00.000Z')));
const legRow = (snapshot: unknown, liveLines: string[] | null, description: string | null = null) =>
  ({ description, contract: liveLines ? { deviceSources: { 'network-provisioning': liveLines } } : null, snapshot: snapshot ?? null });
const NETLEG = { id: 'leg-v', type: 'PIPELINE', title: 'Fabric (protocol: network-provisioning)', metadata: { protocol: 'network-provisioning-protocol', pipelineStageId: STAGE } };
const HELD = { isHeldCapableLeg: () => true }; // fixtures pin held-capability explicitly (network was AWAITING its text in push 2; push 3 joined it — see the O-4 precedence test)
const DR = ['sw1: device-read — service devsvc', 'sw2: device-read — service devsvc'];
const outOf = { version: 1, state: 'no-base' };
/** world() + the leg-row read + optional snapshot refusals on the authoritative Harvester. */
function netWorld(author: Record<string, unknown> | null, reviewer: Record<string, unknown> | null, row: ReturnType<typeof legRow>,
  o: { refusalsByExec?: Record<string, number>; captureRefs?: Array<{ target: string; path: string }>; snapRefusal?: string } = {}) {
  const w = world(author, reviewer, { harvester: { refusalsByExec: o.refusalsByExec ?? {} }, captureRefs: o.captureRefs });
  const inner = w.db.$queryRaw;
  w.db.$queryRaw = async (...args: unknown[]) => (JSON.stringify(args[0]).includes('deviceSourcesSnapshot') ? [row] : inner(...args));
  w.db.heldCaptureRefusal.findFirst = async (a: { where: { executionId: string } }) => (o.snapRefusal && a.where.executionId === 'ex-harv' ? { refusal: o.snapRefusal } : null);
  return w;
}
test('push 2 O-4: a declared device-read device with no held base ⇒ device-read-not-held, devices named, even out of scope; every device held ⇒ no force', async () => {
  const one = merge('approved');
  await applyHeldEditCarrier(netWorld(outOf, null, legRow(SNAP(DR), DR), { captureRefs: [{ target: 'device:sw1', path: '/running-config' }] }).db, NETLEG, one, HELD);
  eq([one.qualityGate.outcome, one.qualityGate.heldEdit.reason, one.qualityGate.heldEdit.devicesNotHeld, one.qualityGate.heldEdit.devicesNotHeldTotal], ['needs-revision', 'device-read-not-held', ['sw2'], 1]);
  const all = merge('approved');
  await applyHeldEditCarrier(netWorld(outOf, null, legRow(SNAP(DR), DR), { captureRefs: [{ target: 'device:sw1', path: '/running-config' }, { target: 'device:sw2', path: '/running-config' }] }).db, NETLEG, all, HELD);
  eq([all.qualityGate.outcome, all.qualityGate.heldEdit.forced, all.qualityGate.heldEdit.reason], ['approved', false, undefined]);
});
test('push 2 O-4 + owner Phase-0 §4b: a device declaring BOTH sources is held when its GIT FILE is held (the device read is evidence); neither held ⇒ forced (git-file-not-held since D-1)', async () => {
  const both = ['sw1: git-file — service github-service ; paichart/paichart-configs/network/sw1.cfg', 'sw1: device-read — service devsvc'];
  const git = merge('approved');
  await applyHeldEditCarrier(netWorld(outOf, null, legRow(SNAP(both), both), { captureRefs: [{ target: 'github:paichart:paichart-configs', path: '/network/sw1.cfg' }] }).db, NETLEG, git, HELD);
  eq([git.qualityGate.outcome, git.qualityGate.heldEdit.forced], ['approved', false], 'a held Git file is the base: ');
  const other = merge('approved');
  await applyHeldEditCarrier(netWorld(outOf, null, legRow(SNAP(both), both), { captureRefs: [{ target: 'github:paichart:paichart-configs', path: '/network/sw9.cfg' }] }).db, NETLEG, other, HELD);
  eq([other.qualityGate.heldEdit.reason, other.qualityGate.heldEdit.gitFileDevicesNotHeld, 'devicesNotHeld' in other.qualityGate.heldEdit], ['git-file-not-held', ['sw1'], false], 'another file of the repo is not its base: ');
});
test('push 2 O-4 FAIL CLOSED: no snapshot / an unreadable one / an unparseable declaration / NO block (D-1 item 2) force by that name', async () => {
  const bad = ['sw1: device-read - service x'];
  const cases: Array<[ReturnType<typeof legRow>, string]> = [[legRow(undefined, DR), 'device-sources-snapshot-absent'], [legRow({ version: 9 }, DR), 'device-sources-snapshot-unreadable'],
    [legRow(SNAP(bad), bad), 'device-sources-unparseable']];
  for (const [row, reason] of cases) {
    const m = merge('approved');
    await applyHeldEditCarrier(netWorld(outOf, null, row).db, NETLEG, m, HELD);
    eq([m.qualityGate.outcome, m.qualityGate.heldEdit.reason], ['needs-revision', reason], `${reason}: `);
  }
  const none = merge('approved');
  await applyHeldEditCarrier(netWorld(outOf, null, legRow(SNAP_ABSENT(), null, 'no block')).db, NETLEG, none, HELD);
  eq([none.qualityGate.outcome, none.qualityGate.heldEdit.reason], ['needs-revision', 'device-sources-absent'], 'an absent declaration on a held-capable leg fails closed (D-1): ');
  const conflict = merge('approved'); // both sources present and different ⇒ the snapshot records `conflict`
  const confSnap = JSON.parse(JSON.stringify(buildDeviceSourcesSnapshot(resolveLegDeviceSources({ contractValue: DR, taskBody: '## Device sources\n- sw9: command-package' }), 't')));
  await applyHeldEditCarrier(netWorld(outOf, null, { description: '## Device sources\n- sw9: command-package', contract: { deviceSources: { 'network-provisioning': DR } }, snapshot: confSnap }).db, NETLEG, conflict, HELD);
  eq(conflict.qualityGate.heldEdit.reason, 'device-sources-conflict');
});

// ── held-network push 3 (owner D-1, 2026-10-26; sec-ops push-2 SF-4): EVERY declared non-command-package device needs a held base ──
const GIT1 = 'sw1: git-file — service github-service ; paichart/paichart-configs/network/sw1.cfg';
const GIT1_REF = { target: 'github:paichart:paichart-configs', path: '/network/sw1.cfg' };
test('push 3 D-1: a git-file-only device whose Git file is not held ⇒ git-file-not-held, device named, even out of scope; held ⇒ no force', async () => {
  const notHeld = merge('approved');
  await applyHeldEditCarrier(netWorld(outOf, null, legRow(SNAP([GIT1]), [GIT1])).db, NETLEG, notHeld, HELD);
  eq([notHeld.qualityGate.outcome, notHeld.qualityGate.heldEdit.reason, notHeld.qualityGate.heldEdit.gitFileDevicesNotHeld, notHeld.qualityGate.heldEdit.gitFileDevicesNotHeldTotal, notHeld.qualityGate.heldEdit.inScope],
    ['needs-revision', 'git-file-not-held', ['sw1'], 1, false]);
  const held = merge('approved');
  await applyHeldEditCarrier(netWorld(outOf, null, legRow(SNAP([GIT1]), [GIT1]), { captureRefs: [GIT1_REF] }).db, NETLEG, held, HELD);
  eq([held.qualityGate.outcome, held.qualityGate.heldEdit.forced, 'reason' in held.qualityGate.heldEdit], ['approved', false, false]);
  const sameRepoOtherCase = merge('approved'); // the target compare is case-insensitive (the held target is lower-cased at capture)
  await applyHeldEditCarrier(netWorld(outOf, null, legRow(SNAP([GIT1]), [GIT1]), { captureRefs: [{ target: 'github:Paichart:Paichart-Configs', path: '/network/sw1.cfg' }] }).db, NETLEG, sameRepoOtherCase, HELD);
  eq(sameRepoOtherCase.qualityGate.heldEdit.forced, false);
});
test('push 3 sec-ops SF-1: a line on the PLATFORM pin repo at a ref the pin never admits is never satisfied by a file held at the same path (another revision); the default branch / main is', async () => {
  const atRef = 'sw1: git-file — service github-service ; paichart/paichart-configs/network/sw1.cfg @ feature-x';
  const m = merge('approved');
  await applyHeldEditCarrier(netWorld(outOf, null, legRow(SNAP([atRef]), [atRef]), { captureRefs: [GIT1_REF] }).db, NETLEG, m, HELD);
  eq([m.qualityGate.outcome, m.qualityGate.heldEdit.reason, m.qualityGate.heldEdit.gitFileDevicesNotHeld], ['needs-revision', 'git-file-not-held', ['sw1']]);
  for (const ref of ['main', 'refs/heads/main']) {
    const line = `sw1: git-file — service github-service ; paichart/paichart-configs/network/sw1.cfg @ ${ref}`;
    const ok2 = merge('approved');
    await applyHeldEditCarrier(netWorld(outOf, null, legRow(SNAP([line]), [line]), { captureRefs: [GIT1_REF] }).db, NETLEG, ok2, HELD);
    eq(ok2.qualityGate.heldEdit.forced, false, `@ ${ref}: `);
  }
  const customer = 'sw1: git-file — service acme-git ; acme/netcfg/sw1.cfg @ release-7'; // a customer repo: held only at its own ref (P8)
  const c = merge('approved');
  await applyHeldEditCarrier(netWorld(outOf, null, legRow(SNAP([customer]), [customer]), { captureRefs: [{ target: 'github:acme:netcfg', path: '/sw1.cfg' }] }).db, NETLEG, c, HELD);
  eq(c.qualityGate.heldEdit.forced, false);
});
test('push 3 D-1 rule 3: a device with BOTH sources is satisfied by its held Git file ONLY — a held device configuration does not stand in for a declared Git file', async () => {
  const both = [GIT1, 'sw1: device-read — service devsvc'];
  const devOnly = merge('approved');
  await applyHeldEditCarrier(netWorld(outOf, null, legRow(SNAP(both), both), { captureRefs: [{ target: 'device:sw1', path: '/running-config' }] }).db, NETLEG, devOnly, HELD);
  eq([devOnly.qualityGate.outcome, devOnly.qualityGate.heldEdit.reason, devOnly.qualityGate.heldEdit.gitFileDevicesNotHeld], ['needs-revision', 'git-file-not-held', ['sw1']]);
});
test('push 3 D-1: a command-package device never forces; mixed legs name each list, git-file-not-held first; the git list is capped at 20 with an exact total', async () => {
  const cp = ['sw1: command-package', 'sw2: device-read — service devsvc'];
  const m = merge('approved');
  await applyHeldEditCarrier(netWorld(outOf, null, legRow(SNAP(cp), cp), { captureRefs: [{ target: 'device:sw2', path: '/running-config' }] }).db, NETLEG, m, HELD);
  eq([m.qualityGate.outcome, m.qualityGate.heldEdit.forced], ['approved', false], 'command-package + a held device-read: ');
  const onlyCp = merge('approved');
  await applyHeldEditCarrier(netWorld(outOf, null, legRow(SNAP(['sw1: command-package']), ['sw1: command-package'])).db, NETLEG, onlyCp, HELD);
  eq(onlyCp.qualityGate.heldEdit.forced, false, 'command-package alone: ');
  const mixed = [GIT1, 'sw2: device-read — service devsvc'];
  const mx = merge('approved');
  await applyHeldEditCarrier(netWorld(outOf, null, legRow(SNAP(mixed), mixed)).db, NETLEG, mx, HELD);
  eq([mx.qualityGate.heldEdit.reason, mx.qualityGate.heldEdit.gitFileDevicesNotHeld, mx.qualityGate.heldEdit.devicesNotHeld], ['git-file-not-held', ['sw1'], ['sw2']]);
  const many = Array.from({ length: 23 }, (_, i) => `d${i}: git-file — service github-service ; paichart/paichart-configs/network/d${i}.cfg`);
  const mn = merge('approved');
  await applyHeldEditCarrier(netWorld(outOf, null, legRow(SNAP(many), many)).db, NETLEG, mn, HELD);
  eq([mn.qualityGate.heldEdit.gitFileDevicesNotHeld.length, mn.qualityGate.heldEdit.gitFileDevicesNotHeldTotal], [20, 23]);
});
test('push 3 D-1 precedence: source-not-pinned > git-file-not-held > author-not-of-leg', async () => {
  const pin = merge('approved');
  await applyHeldEditCarrier(netWorld(outOf, null, legRow(SNAP([GIT1]), [GIT1]), { refusalsByExec: { 'ex-harv': 1 } }).db, NETLEG, pin, HELD);
  eq(pin.qualityGate.heldEdit.reason, 'source-not-pinned');
  const w = netWorld(applied, rendered(), legRow(SNAP([GIT1]), [GIT1]));
  const inner = w.db.heldFileRef.findMany;
  w.db.heldFileRef.findMany = async (a: { where: { kind: string } }) => (a.where.kind === 'BASE' ? [{ legTaskId: 'leg-other' }] : inner(a));
  const nol = merge('approved');
  await applyHeldEditCarrier(w.db, NETLEG, nol, HELD);
  eq(nol.qualityGate.heldEdit.reason, 'git-file-not-held');
});
test('push 2 sec-ops SF-1: a declaration CHANGED after the snapshot forces by name even on a git-file-only leg; a snapshot refusal the capture recorded forces too', async () => {
  const gitOnly = ['sw1: git-file — service github-service ; paichart/paichart-configs/network/sw1.cfg'];
  const edited = ['sw1: git-file — service github-service ; paichart/paichart-configs/network/other.cfg'];
  const m = merge('approved');
  await applyHeldEditCarrier(netWorld(outOf, null, legRow(SNAP(gitOnly), edited)).db, NETLEG, m, HELD);
  eq([m.qualityGate.outcome, m.qualityGate.heldEdit.reason], ['needs-revision', 'device-sources-snapshot-changed']);
  const reverted = merge('approved'); // the live text matches the snapshot again, but the capture saw the edit
  await applyHeldEditCarrier(netWorld(outOf, null, legRow(SNAP(gitOnly), gitOnly), { snapRefusal: 'device-sources-snapshot-changed' }).db, NETLEG, reverted, HELD);
  eq(reverted.qualityGate.heldEdit.reason, 'device-sources-snapshot-changed');
});
// F-N2-1 (owner 2026-10-26): the applier no longer lets an UNNAMED unheld entry sink the package, so a correct edit on ANOTHER device
// can now reach `applied` + a rendered Reviewer diff. That must never release a leg whose declared device has no held base (D-1): the
// device force sits ABOVE the package's own reason. Every arm below is a package that would otherwise pass (applied, digest equal).
test('F-N2-1 no false release: an APPLIED package on another device (Reviewer rendered, digest equal) still forces when a declared device has no held base', async () => {
  const both = [GIT1, 'sw1: device-read — service devsvc', 'sw2: device-read — service devsvc'];
  // B-L2 shape, sw1's Git file held + sw2's device read held ⇒ nothing missing ⇒ the applied package releases (the control: no force).
  const ctl = merge('approved');
  await applyHeldEditCarrier(netWorld(applied, rendered(), legRow(SNAP(both), both), { captureRefs: [GIT1_REF, { target: 'device:sw2', path: '/running-config' }] }).db, NETLEG, ctl, HELD);
  eq([ctl.qualityGate.outcome, ctl.qualityGate.heldEdit.forced, 'reason' in ctl.qualityGate.heldEdit], ['approved', false, false]);
  // A-NL3 shape: sw1's Git file not held (its ref refused), sw2 applied ⇒ git-file-not-held, sw1 named.
  const nl3 = merge('approved');
  await applyHeldEditCarrier(netWorld(applied, rendered(), legRow(SNAP(both), both), { captureRefs: [{ target: 'device:sw2', path: '/running-config' }] }).db, NETLEG, nl3, HELD);
  eq([nl3.qualityGate.outcome, nl3.qualityGate.heldEdit.reason, nl3.qualityGate.heldEdit.gitFileDevicesNotHeld, nl3.qualityGate.heldEdit.inScope], ['needs-revision', 'git-file-not-held', ['sw1'], true]);
  // A-N-ECHO-FX / A-NL1 shape: sw2's device read refused at capture (no device:sw2 ref) ⇒ device-read-not-held, sw2 named.
  const echo = merge('approved');
  await applyHeldEditCarrier(netWorld(applied, rendered(), legRow(SNAP(both), both), { captureRefs: [GIT1_REF] }).db, NETLEG, echo, HELD);
  eq([echo.qualityGate.outcome, echo.qualityGate.heldEdit.reason, echo.qualityGate.heldEdit.devicesNotHeld], ['needs-revision', 'device-read-not-held', ['sw2']]);
  // sec-ops finding 2: a held-but-unshown unnamed entry keeps sinking the package (the applier stamps its state) — with every declared
  // device held, the package's OWN reason forces it (no device force involved).
  const vob = merge('approved');
  await applyHeldEditCarrier(netWorld({ version: 1, state: 'view-over-budget', total: 1, blocksTotal: 1 }, rendered(), legRow(SNAP(both), both),
    { captureRefs: [GIT1_REF, { target: 'device:sw2', path: '/running-config' }] }).db, NETLEG, vob, HELD);
  eq([vob.qualityGate.outcome, vob.qualityGate.heldEdit.reason, vob.qualityGate.heldEdit.inScope], ['needs-revision', 'view-over-budget', true]);
});
test('push 2 O-4 precedence: stage-rebind > source-not-pinned > device-read-not-held > the package\'s own reason; live under the production predicate once network joined (push 3)', async () => {
  const p1 = { pipelineStageId: 'stage-of-another-leg', qualityGate: { outcome: 'approved' } } as Record<string, any>;
  await applyHeldEditCarrier(netWorld(outOf, null, legRow(SNAP(DR), DR), { refusalsByExec: { 'ex-harv': 1 } }).db, NETLEG, p1, HELD);
  eq(p1.qualityGate.heldEdit.reason, 'stage-rebind');
  const p2 = merge('approved');
  await applyHeldEditCarrier(netWorld(outOf, null, legRow(SNAP(DR), DR), { refusalsByExec: { 'ex-harv': 1 } }).db, NETLEG, p2, HELD);
  eq(p2.qualityGate.heldEdit.reason, 'source-not-pinned');
  const p3 = merge('approved');
  await applyHeldEditCarrier(netWorld({ version: 1, state: 'refused' }, rendered(), legRow(SNAP(DR), DR)).db, NETLEG, p3, HELD);
  eq(p3.qualityGate.heldEdit.reason, 'device-read-not-held');
  const live = merge('approved'); // production predicate: push 3 removed network-provisioning from HELD_JOIN_AWAITING_TEXT ⇒ the carrier acts
  const r = await applyHeldEditCarrier(netWorld(outOf, null, legRow(undefined, DR)).db, NETLEG, live);
  eq([r, live.qualityGate.outcome, 'heldEdit' in live.qualityGate], [{ applied: true, forced: true }, 'needs-revision', true]);
});

test('SEC-P2-1: the stage comes from the STORED metadata; a re-pointing write forces stage-rebind', async () => {
  const { db, reads } = world(applied, rendered());
  const m = { pipelineStageId: 'stage-of-another-leg', qualityGate: { outcome: 'approved' } } as Record<string, any>;
  await applyHeldEditCarrier(db, VLEG, m);
  eq([m.qualityGate.outcome, m.qualityGate.heldEdit.reason], ['needs-revision', 'stage-rebind']);
  ok(reads.includes('task.findMany'), 'evidence read from the stored stage, not the incoming one');
  const m2 = { pipelineStageId: STAGE, qualityGate: { outcome: 'approved' } } as Record<string, any>; // an echo of the stored id is fine
  await applyHeldEditCarrier(world(applied, rendered()).db, VLEG, m2);
  eq([m2.qualityGate.outcome, m2.qualityGate.heldEdit.forced], ['approved', false]);
});

test('SEC-P2-1: the selected Author\'s BASE refs must name THIS leg (a two-step re-point forces author-not-of-leg)', async () => {
  for (const [name, baseLegs] of [['another leg', ['leg-other']], ['mixed', ['leg-v', 'leg-other']], ['no BASE rows', []], ['NULL legTaskId', [null]]] as Array<[string, Array<string | null>]>) {
    const m = merge('approved');
    await applyHeldEditCarrier(world(applied, rendered(), { baseLegs }).db, VLEG, m);
    eq([m.qualityGate.outcome, m.qualityGate.heldEdit.reason], ['needs-revision', 'author-not-of-leg'], `${name}: `);
  }
  const m = merge('approved'); // a task row without an id cannot be bound ⇒ forces
  await applyHeldEditCarrier(world(applied, rendered()).db, { ...VLEG, id: undefined } as any, m);
  eq(m.qualityGate.heldEdit.reason, 'author-not-of-leg');
});

test('BC-P2-N2: an absent digest on either side is could-not-check, never a pass', async () => {
  for (const [a, rv] of [[{ version: 1, state: 'applied' }, rendered()], [applied, (() => { const r: any = rendered(); delete r.candidateDigest8; return r; })()]]) {
    const m = merge('approved');
    await applyHeldEditCarrier(world(a as any, rv as any).db, VLEG, m);
    eq([m.qualityGate.outcome, m.qualityGate.heldEdit.reason], ['needs-revision', 'could-not-check']);
  }
});

test('BC-P2-1: the carrier is the ONLY writer — an inbound heldEdit is deleted on every write, variant or not', async () => {
  const forged = { agentOutcome: 'needs-revision', forced: true, reason: 'x', state: 'refused' };
  for (const [name, task, outcome] of [['non-held-capable (another domain)', PLAIN, 'approved'], ['variant, no outcome', VLEG, undefined], ['non-PIPELINE', { ...VLEG, type: 'ACTION' }, 'approved']] as Array<[string, any, string | undefined]>) {
    const m = merge(outcome); m.qualityGate.heldEdit = { ...forged };
    await applyHeldEditCarrier(world(applied, rendered()).db, task, m);
    ok(!('heldEdit' in m.qualityGate), `${name}: forged heldEdit removed`);
  }
  const m = merge('approved'); m.qualityGate.heldEdit = { ...forged }; // variant + outcome: replaced by the carrier's own
  await applyHeldEditCarrier(world(applied, rendered()).db, VLEG, m);
  eq(m.qualityGate.heldEdit, { state: 'applied', reviewerSaw: 'rendered', agentOutcome: 'approved', forced: false, inScope: true });
});

test('no-op: a non-held-capable PIPELINE (another domain) reads nothing; no outcome ⇒ nothing; a non-PIPELINE ⇒ nothing', async () => {
  const { db, reads } = world(applied, rendered(), { throwOnRead: true });
  const m = merge('approved');
  eq(await applyHeldEditCarrier(db, PLAIN, m), { applied: false, forced: false });
  eq([reads, 'heldEdit' in m.qualityGate, m.qualityGate.outcome], [[], false, 'approved']);
  const m2 = merge(undefined);
  eq(await applyHeldEditCarrier(db, VLEG, m2), { applied: false, forced: false });
  eq(await applyHeldEditCarrier(db, { ...VLEG, type: 'ACTION' }, merge('approved')), { applied: false, forced: false });
  eq(reads, [], 'nothing read: ');
});

test('the shared predicate: heldEditWouldForce reads the stamped reason (arch v4 S-G)', () => {
  eq([heldEditWouldForce({ reason: 'refused' }), heldEditWouldForce({ state: 'applied' }), heldEditWouldForce(null)], [true, false, false]);
  eq(heldEditVerdict(null, null, true).reason, 'could-not-check');
});

// ─── the guard ───────────────────────────────────────────────────────────────────────────────────────────────────────────
function guardDb(reviewerApproved: boolean) {
  return {
    task: { findMany: async () => [{ id: 'sib-0', type: 'ACTION' }] },
    ...authoritativeReadStub([{ id: 'ex-0', taskId: 'sib-0', createdAt: new Date(1_700_000_000_000),
      result: { agentRole: 'change_reviewer', finalResponse: 'r', reviewerVerdict: { approved: reviewerApproved, blocking: reviewerApproved ? [] : ['x'] } } }]),
  } as any;
}
const silent = { warn: () => {}, error: () => {}, info: () => {} };
async function guard(stored: string, heldEdit: Record<string, unknown> | null, reviewerApproved: boolean) {
  const m: Record<string, any> = { pipelineStageId: STAGE, qualityGate: { outcome: stored, ...(heldEdit ? { heldEdit } : {}) } };
  await annotateQualityGateVerdictMismatch(guardDb(reviewerApproved), 'leg', 'PIPELINE', {}, m, silent);
  return m.qualityGate;
}

test('guard: compliant agent (needs-revision, Reviewer approved, state refused) is NOT flagged', async () => {
  const g = await guard('needs-revision', { state: 'refused', reviewerSaw: 'rendered', agentOutcome: 'needs-revision', forced: false, reason: 'refused' }, true);
  ok(g.verdictMismatch !== true, JSON.stringify(g));
  eq(g.verdictMismatchTier, 'pipeline-held-variant');
});

test('guard: agent approved + Reviewer rejected + forced IS flagged and counted (compares agentOutcome, not the forced store)', async () => {
  const g = await guard('needs-revision', { state: 'refused', reviewerSaw: 'rendered', agentOutcome: 'approved', forced: true, reason: 'refused' }, false);
  eq([g.verdictMismatch, g.verdictMismatchTier], [true, 'pipeline-held-variant']);
});

test('guard: agent needs-revision over a stale approving review is NOT flagged', async () => {
  const g = await guard('needs-revision', { state: 'applied', reviewerSaw: 'rendered', agentOutcome: 'needs-revision', forced: false, reason: 'reviewed-stale-author' }, true);
  ok(g.verdictMismatch !== true, JSON.stringify(g));
});

test('guard: a variant needs-revision over an approving Reviewer with NO forcing reason IS flagged (a real misread)', async () => {
  const g = await guard('needs-revision', { state: 'applied', reviewerSaw: 'rendered', agentOutcome: 'needs-revision', forced: false }, true);
  eq([g.verdictMismatch, g.verdictMismatchTier], [true, 'pipeline-held-variant']);
});

test('guard: non-variant pipeline rows unchanged (no heldEdit ⇒ tier pipeline, both directions flagged)', async () => {
  eq([(await guard('needs-revision', null, true)).verdictMismatch, (await guard('needs-revision', null, true)).verdictMismatchTier], [true, 'pipeline']);
  eq((await guard('approved', null, false)).verdictMismatch, true);
});

// ─── the deliverable line ────────────────────────────────────────────────────────────────────────────────────────────────
test('Platform outcome line: present iff forced; defanged', () => {
  eq(heldEditOutcomeLine({ forced: false, state: 'refused', reason: 'refused' }), null);
  eq(heldEditOutcomeLine(null), null);
  const l = heldEditOutcomeLine({ forced: true, state: 'refused`; rm -rf', reviewerSaw: 'rendered', reason: 'refused' })!;
  ok(l.startsWith('Platform outcome: needs-revision — edit application `refusedrm-rf` / reviewer `rendered` / reason `refused`'), l);
  // PC-P2-2: an Author-state force no longer prints the state in the reviewer slot
  ok(heldEditOutcomeLine({ forced: true, state: 'partial', reviewerSaw: 'rendered', reason: 'partial' })!.includes('/ reviewer `rendered` / reason `partial`'), 'slots');
  const r = appendHeldEditOutcomeSection('# pkg\n\nbody', { forced: true, state: 'partial', reason: 'partial' });
  ok(r.appended === 1 && r.content.includes('Platform outcome: needs-revision'), r.content);
  eq(appendHeldEditOutcomeSection('# pkg', { forced: false }), { content: '# pkg', appended: 0 });
});

// ─── wiring (source pins) ────────────────────────────────────────────────────────────────────────────────────────────────
test('wiring: the carrier runs before the guard and before the tx, outside its try/catch; persist appends from fresh metadata', () => {
  const h = fs.readFileSync(path.join(__dirname, '..', 'lib', 'mcp', 'tasks', 'action', 'handlers', 'task', 'task-update-handler.ts'), 'utf8');
  const c = h.indexOf('await applyHeldEditCarrier('); const g = h.indexOf('await annotateQualityGateVerdictMismatch('); const tx = h.indexOf('prisma.$transaction(async (tx)');
  ok(c > 0 && c < g && g < tx, `order carrier ${c} < guard ${g} < tx ${tx}`);
  ok(/select: \{ id: true, type: true, metadata: true, title: true \}/.test(h), 'the leg row read carries the id (BASE-ref leg binding) and the title (the predicate\'s fallback)');
  const p = fs.readFileSync(path.join(__dirname, '..', 'lib', 'services', 'execution-terminal-persist.ts'), 'utf8');
  ok(/appendHeldEditOutcomeSection\(\s*reportMdContent,\s*\(freshMeta\?\.qualityGate/.test(p), 'persist reads heldEdit from freshMeta');
  const r = fs.readFileSync(path.join(__dirname, '..', 'lib', 'tasks', 'services', 'protected-task-metadata.ts'), 'utf8');
  ok(/'qualityGate'/.test(r), 'qualityGate stays a PLATFORM_RUN_KEY (web/bulk/POV-PUT drop it, so MCP task.update is the single writer)');
});

test('V-10 MI-13 (Phase 10 W8): the HELD LEGS section carries its 🔴 lines, its controls, the RE-EXECUTED exclusion and the scope exemption', () => {
  const inv = fs.readFileSync(path.join(__dirname, 'report-mechanism-inventory.sh'), 'utf8');
  const sec = inv.slice(inv.indexOf('HELD LEGS (PLATFORM-HELD-BYTES Stage B V-10'), inv.indexOf('\nSQL\n)', inv.indexOf('HELD LEGS (PLATFORM')));
  ok(sec.length > 1000, 'section present inside the SQL heredoc');
  for (const l of ['🔴 editApplication stamped (for real)', '🔴 a held-leg Author execution without editApplication',
    '🔴 a held-leg Reviewer execution without reviewedEditDiff', '🔴 a held leg SYNTHESIZE', '🔴 a held leg stamped approved',
    '🔴 refWrite committed', '🔴 an edit-application manifest', '🔴 a retired variant template', '⚪ held legs (0 ⇒', 'digestTruncated', 'diff-over-budget',
    'handle-namespace-ambiguous', '⚪ out-of-scope selected Authors by THE predicate', 'heldEdit.inScope false', 'heldEdit.forced', 'dangling BASE fromRefId']) ok(sec.includes(l), `MI-13 line: ${l}`);
  ok(/NOT ILIKE '%RE-EXECUTED%'/.test(sec), 'operator-induced re-executions excluded (EF n3-4)');
  ok(sec.includes("WITH vleg AS (SELECT id, metadata, ps FROM _heldleg)") && sec.includes("'edit-application.manifest.json'"), 'keys on _heldleg and the manifest name');
  ok((sec.match(/vsel\.oos/g) ?? []).length >= 2, 'both approval 🔴 lines and the ⚪ line read THE predicate (vsel.oos)');
  // re-review AR R-N2: the SQL state list IS the code list — every D1 state, and nothing else, in one IN (...)
  const inList = sec.match(/editApplication'->>'state' IN \(([^)]*)\)/)?.[1] ?? '';
  const sqlStates = [...inList.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  eq([...sqlStates].sort(), [...HELD_OUT_OF_SCOPE_STATES].sort(), 'MI-13 vsel.oos state list = HELD_OUT_OF_SCOPE_STATES: ');
  // audit N-5: every grammar count stampHasHeldGrammar reads is a term of the SQL predicate (and digestTruncated, fail-closed)
  const scopeSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'agents', 'harness', 'held-bytes', 'scope.ts'), 'utf8');
  const fnBody = scopeSrc.slice(scopeSrc.indexOf('export function stampHasHeldGrammar'), scopeSrc.indexOf('export function heldPackageOutOfScope'));
  const terms = [...new Set([...fnBody.matchAll(/n\(fact\.(\w+)\)/g)].map((m) => m[1]))];
  ok(terms.length === 6, `stampHasHeldGrammar reads six counts: ${terms.join(',')}`);
  const oos = sec.slice(sec.indexOf('vsel AS'), sec.indexOf('AS oos'));
  for (const t of [...terms, 'digestTruncated']) ok(oos.includes(`'${t}'`), `MI-13 vsel.oos reads ${t}`);
  ok(/rollbackRestores'\)::int, 0\) = 0 OR va\.j->'editApplication'->>'state' = 'no-edits'/.test(oos), 'MI-13 applies D2 (restore exception) under no-edits only');
  // the view: retired variant (stamp or title) + a leg of each _heldjoin protocol composed at >= its join version (held-k8s 1g
  // generalised the obs arm; _heldjoin ≡ HELD_JOIN_VERSIONS is pinned in test-held-bytes-store), keyed on pipeline-index delta
  const view = inv.slice(inv.indexOf('CREATE TEMP VIEW _heldleg'), inv.indexOf('ORDER BY a.t ASC LIMIT 1', inv.indexOf('CREATE TEMP VIEW _heldleg')) + 30);
  ok(view.includes("'observability-config-held-protocol'") && view.includes('FROM _heldjoin hj') && view.includes('>= hj.minver')
    && view.includes("protocolInjection'->'delta'") && view.includes('ORDER BY a.t ASC LIMIT 1'), 'the _heldleg view keys structurally on the EARLIEST index (F16)');
  ok(/\('observability-config-protocol', '\{1,10,0\}'::int\[\]\)/.test(inv), 'the obs join row is unchanged (1.10.0)');
  ok(sec.includes('vsel AS (SELECT DISTINCT ON (va.leg)') && sec.includes('ORDER BY va.leg, l.tc ASC, e."startTime" DESC') && sec.includes('AS oos'), 'F15: the predicate re-derived on the carrier\'s selected Author');
  ok(!/heldEdit'->>'inScope', 'true'\) <> 'false'/.test(sec), 'F15: the approval 🔴 no longer reads inScope');
});

// ── Phase 10 W2: the scope rule ──
test('Phase 10 W2: an OUT-OF-SCOPE Author (no-edits, no-base) is never forced — inScope false, no reason, whatever the Reviewer saw', async () => {
  for (const st of ['no-edits', 'no-base']) for (const rv of [rendered(), null]) {
    const m = merge('approved');
    const r = await applyHeldEditCarrier(world({ version: 1, state: st } as any, rv as any).db, OBSLEG, m);
    eq([r, m.qualityGate.outcome, m.qualityGate.heldEdit.inScope, 'reason' in m.qualityGate.heldEdit], [{ applied: true, forced: false }, 'approved', false, false], `${st}/${rv ? 'rendered' : 'none'}: `);
  }
});

test('Phase 10 W2: in scope still forces — a whole-file write (state refused), every other non-applied state, an unreadable stamp, and a stage rebind even when out of scope', async () => {
  const m = merge('approved');
  await applyHeldEditCarrier(world({ version: 1, state: 'refused', refused: { 'held-file-written-whole': 1 } } as any, rendered()).db, OBSLEG, m);
  eq([m.qualityGate.outcome, m.qualityGate.heldEdit.reason, m.qualityGate.heldEdit.inScope], ['needs-revision', 'refused', true]);
  // Run-level states force whatever the package says (D1). A package-level state forces only WITH held grammar — §1a pins.
  for (const st of ['could-not-check', 'binding-mismatch', 'r10-disabled', 'variant-protocol-not-injected', 'binding-invalid']) {
    const m2 = merge('approved'); await applyHeldEditCarrier(world({ version: 1, state: st } as any, rendered()).db, OBSLEG, m2);
    eq([m2.qualityGate.outcome, m2.qualityGate.heldEdit.reason], ['needs-revision', st], `${st}: `);
  }
  eq(heldEditVerdict({ state: 'error' } as any, null).reason, 'no-author-stamp', 'an unreadable stamp is never out of scope: ');
  const m3 = merge('approved'); (m3 as any).pipelineStageId = 'another-stage';
  await applyHeldEditCarrier(world({ version: 1, state: 'no-edits' } as any, rendered()).db, OBSLEG, m3);
  eq([m3.qualityGate.outcome, m3.qualityGate.heldEdit.reason], ['needs-revision', 'stage-rebind'], 'rebind: ');
});

// ── Phase 10 panel §1a: THE ONE predicate (held-bytes/scope.ts), both directions (D1 explicit list, grammar guard, D2 limited to no-edits) ──
test('§1a: out of scope ⇔ a D1 state AND no held grammar — the pins the panel asked for (AE-S1, AR-B1, EF-S2/S3, audit A-M1)', async () => {
  const cases: Array<[string, Record<string, unknown>, boolean]> = [
    ['demo-POV Prometheus-only (no grammar)', { version: 1, state: 'demo-pov', total: 0, refusedTotal: 0 }, true],
    ['demo-POV with held edits', { version: 1, state: 'demo-pov', total: 1, blocksTotal: 1, refusedTotal: 0 }, false],
    ['view-not-rendered, no grammar', { version: 1, state: 'view-not-rendered', total: 0, refusedTotal: 0 }, true],
    ['view-not-rendered with held edits', { version: 1, state: 'view-not-rendered', total: 1, blocksTotal: 1, refusedTotal: 0 }, false],
    ['no-base + a SEARCH block', { version: 1, state: 'no-base', total: 1, blocksTotal: 1, refusedTotal: 0 }, false],
    ['no-base + a rollback restore (points at nothing)', { version: 1, state: 'no-base', total: 0, refusedTotal: 0, rollbackRestores: 1 }, false],
    ['no-edits + a rollback restore of a known handle (D2)', { version: 1, state: 'no-edits', total: 0, refusedTotal: 0, rollbackRestores: 1 }, true],
    ['platform state, ONLY grammar = a rollback-section SEARCH', { version: 1, state: 'unheld', total: 0, blocksTotal: 1, refusedTotal: 0 }, false],
    ['run-level state, no grammar (binding-mismatch stays in scope)', { version: 1, state: 'binding-mismatch', total: 0, refusedTotal: 0 }, false],
    ['r10-disabled stays in scope', { version: 1, state: 'r10-disabled', total: 0, refusedTotal: 0 }, false],
    ['truncated stamp is never out of scope', { version: 1, state: 'no-edits', digestTruncated: true }, false],
  ];
  for (const [name, fact, oos] of cases) {
    eq(heldPackageOutOfScope(fact), oos, `${name} (predicate): `);
    const m = merge('approved');
    await applyHeldEditCarrier(world(fact as any, rendered()).db, VLEG, m);
    eq([m.qualityGate.outcome, m.qualityGate.heldEdit.inScope], [oos ? 'approved' : 'needs-revision', !oos], `${name} (carrier): `);
  }
});

test('panel D4: a leg titled with the RETIRED token is not held-capable — the carrier is a no-op there (no held rule on agents never shown it)', async () => {
  const m = merge('approved');
  eq(await applyHeldEditCarrier(world({ version: 1, state: 'refused' } as any, rendered()).db, RETIRED, m), { applied: false, forced: false });
  eq(m.qualityGate.outcome, 'approved');
});


(async () => {
  for (const { d, fn } of pending) {
    try { await fn(); passed++; console.log(`  ✅ ${d}`); }
    catch (e) { failed++; console.log(`  ❌ ${d}\n     ${(e as Error).message}`); }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
