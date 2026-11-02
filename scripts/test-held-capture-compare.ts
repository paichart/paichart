#!/usr/bin/env ts-node
/**
 * HELD-CAPTURE-COMPARE-ELIGIBILITY (held-network step 3 P2, 2026-10-25) — PLANTED CONTROLS for the pure capture comparison behind
 * `replay-held-capture.sh --compare` (scripts/held-capture-compare.ts). The step-2 pre-push check found four defects of the old
 * compare by planting rows (register entry): a mis-resolved leg and a tampered hash were CAUGHT; a correct live foreign outcome read
 * as a FALSE ❌; `own` on the ownerless platform row and `granted` + grantPovId read PASS (SILENT). Each is planted here, both
 * directions, plus the declaration columns and the echo refusal (R10-V8-RESIDUALS (a)) the replay cannot recompute.
 */
import { compareCapture, type PredictedRow, type StoredRow } from './held-capture-compare';

let passed = 0; let failed = 0;
function test(d: string, fn: () => void) {
  try { fn(); console.log(`✅ ${d}`); passed++; } catch (e) { console.error(`❌ ${d}\n   ${(e as Error).message}`); failed++; }
}
function eq(a: unknown, b: unknown, what = '') { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

const PLATFORM = 'svc-github'; const OWNED = 'svc-acme'; const GONE = 'svc-deleted';
const OWNER = 'user-owner'; const OTHER = 'user-other';
const owners: Record<string, string | null> = { [PLATFORM]: null, [OWNED]: OWNER };
const ctx = (executionUserId: string | null = OWNER) => ({ rowOwner: (sid: string | null) => (sid && sid in owners ? owners[sid] : undefined), executionUserId });
const SHA = 'a'.repeat(64);
const p = (o: Partial<PredictedRow> = {}): PredictedRow => ({ i: 0, s: '/n/sw1.cfg', outcome: 'held', hash: SHA, serviceId: PLATFORM, declaredBy: 'platform-default', declarationSha256: null, ...o });
const a = (o: Partial<StoredRow> = {}): StoredRow => ({ ...p(), eligibility: 'platform', grantPovId: null, ...o });

test('C1 clean: an ownerless row stored `platform`, hash and declaration equal ⇒ ✅', () => {
  const r = compareCapture([p()], [a()], ctx());
  eq([r.ok, r.eligibilityMismatches.length, r.unverifiable.length], [true, 0, 0]);
});
test('C2 leg mis-resolved (the replay predicts nothing, a row was stored) ⇒ ❌ extra (caught, as before)', () => {
  const r = compareCapture([], [a()], ctx());
  eq([r.ok, r.extra.length], [false, 1]);
});
test('C3 tampered hash ⇒ ❌ (caught, as before)', () => {
  const r = compareCapture([p()], [a({ hash: 'b'.repeat(64) })], ctx());
  eq([r.ok, r.hashMismatches.length], [false, 1]);
});
test('C4 a correct live FOREIGN outcome (predicted held, nothing stored, row owned by another user) ⇒ unverifiable (eligibility), NOT a false ❌', () => {
  const r = compareCapture([p({ serviceId: OWNED })], [], ctx(OTHER));
  eq([r.ok, r.missing.length, r.unverifiable.length], [true, 0, 1]);
  // control: the same row owned BY the execution's user — nothing stored is a real miss ⇒ ❌
  const own = compareCapture([p({ serviceId: OWNED })], [], ctx(OWNER));
  eq([own.ok, own.missing.length], [false, 1], 'own row, nothing stored: ');
  // control: an ownerless row with nothing stored is a real miss too (platform rows always hold)
  eq(compareCapture([p()], [], ctx(OTHER)).ok, false, 'platform row, nothing stored: ');
});
test('C5 `own` on the OWNERLESS platform row ⇒ ❌ eligibility (was SILENT); `granted` + grantPovId there ⇒ ❌ too', () => {
  eq(compareCapture([p()], [a({ eligibility: 'own' })], ctx()).eligibilityMismatches.length, 1);
  const g = compareCapture([p()], [a({ eligibility: 'granted', grantPovId: 'cmpov1' })], ctx());
  eq([g.ok, g.eligibilityMismatches.length], [false, 1]);
});
test('C6 owned row: own / install / granted+grantPovId are membership-checked (not reconstructable — labelled); granted without a grantPovId ⇒ ❌; platform ⇒ ❌', () => {
  for (const e of [{ eligibility: 'own' }, { eligibility: 'install' }, { eligibility: 'granted', grantPovId: 'cmpov1' }]) {
    const r = compareCapture([p({ serviceId: OWNED })], [a({ serviceId: OWNED, ...e })], ctx());
    eq([r.ok, r.eligibilityNotes.length], [true, 1], `${e.eligibility}: `);
    eq(/not reconstructable/.test(r.eligibilityNotes[0]), true, 'labelled: ');
  }
  eq(compareCapture([p({ serviceId: OWNED })], [a({ serviceId: OWNED, eligibility: 'granted' })], ctx()).ok, false, 'granted without grantPovId: ');
  eq(compareCapture([p({ serviceId: OWNED })], [a({ serviceId: OWNED, eligibility: 'own', grantPovId: 'cmpov1' })], ctx()).ok, false, 'grantPovId on own: ');
  eq(compareCapture([p({ serviceId: OWNED })], [a({ serviceId: OWNED, eligibility: 'platform' })], ctx()).ok, false, 'platform on an owned row: ');
});
test('C7 declaredBy / declarationSha256 are COMPARED (was not)', () => {
  eq(compareCapture([p()], [a({ declaredBy: 'registrant' })], ctx()).declarationMismatches.length, 1);
  eq(compareCapture([p({ declaredBy: 'registrant', declarationSha256: SHA })], [a({ declaredBy: 'registrant', declarationSha256: 'c'.repeat(64) })], ctx()).ok, false);
  eq(compareCapture([p({ declaredBy: 'registrant', declarationSha256: SHA })], [a({ declaredBy: 'registrant', declarationSha256: SHA })], ctx()).ok, true, 'equal: ');
});
test('C8 a live echo-secret-residual where the replay predicts held ⇒ unverifiable (echo), never a ❌ pair; a lone stored echo refusal elsewhere stays ❌', () => {
  const r = compareCapture([p()], [a({ outcome: 'echo-secret-residual', hash: null })], ctx());
  eq([r.ok, r.missing.length, r.extra.length, r.unverifiable.length], [true, 0, 0, 1]);
  eq(compareCapture([p({ s: '/other' })], [a({ outcome: 'echo-secret-residual', hash: null })], ctx()).ok, false, 'different selector: ');
});
test('C9 a pre-IF-3 row (eligibility NULL) passes and is NAMED; a NULL eligibility carrying a grantPovId ⇒ ❌; a row not found now is noted', () => {
  const r = compareCapture([p()], [a({ eligibility: null })], ctx());
  eq([r.ok, /pre-IF-3/.test(r.eligibilityNotes[0])], [true, true]);
  eq(compareCapture([p()], [a({ eligibility: null, grantPovId: 'cmpov1' })], ctx()).ok, false);
  const g = compareCapture([p({ serviceId: GONE })], [a({ serviceId: GONE, eligibility: 'own' })], ctx());
  eq([g.ok, /row not found/.test(g.eligibilityNotes[0])], [true, true]);
});
test('C10 store-error rows stay excused (Stage A rule), counted', () => {
  const r = compareCapture([p()], [a(), a({ i: 1, outcome: 'store-error', hash: null })], ctx());
  eq([r.ok, r.storeErrorExcused], [true, 1]);
});

console.log(`\n✅ Passed: ${passed}\n❌ Failed: ${failed}`);
process.exit(failed ? 1 : 0);
