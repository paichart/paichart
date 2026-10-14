#!/usr/bin/env ts-node
/**
 * PLATFORM-HELD-BYTES Stage A WI-9 — the `heldBytes` digest budget (owner decision OA-24; panel EF B-1, audit F1).
 * The digest must be ≤ 1,024 serialised characters for EVERY input, never shorten a string silently, and carry no hash.
 * Plan: cline_docs/reviews/platform-held-bytes-2026-10-13/STAGE-A-PLAN.md WI-9.
 */
import {
  buildHeldBytesDigest,
  buildHeldBytesManifest,
  capSerialised,
  HELD_BYTES_DIGEST_MAX,
  type HeldBytesFactInput,
} from '../lib/agents/harness/held-bytes/held-bytes-fact';
import type { HeldFileRefRow, HeldCaptureRefusalRow } from '../lib/services/held-bytes-store';

console.log('📏 held-bytes digest budget (WI-9)\n');
let passed = 0;
let failed = 0;
function test(d: string, fn: () => void) {
  try { fn(); console.log(`✅ ${d}`); passed++; } catch (e) {
    console.error(`❌ ${d}`); if (e instanceof Error) console.error(`   Error: ${e.message}`); failed++;
  }
}
function ok(cond: unknown, what: string) { if (!cond) throw new Error(what); }

const ref = (i: number, target: string, path: string, redacted = 0): HeldFileRefRow => ({
  scope: 'p1', blobSha256: 'a'.repeat(64), executionId: 'e1', kind: 'CAPTURE', legTaskId: null, rootTaskId: null,
  serviceId: 's1', serviceName: 'observability-readonly', sourceTool: 'get_ingress_config', toolCallIndex: i,
  selector: '/structuredContent/files/x', target, path, declaredBy: 'platform-default', descriptorVersion: 1,
  hashBasis: 'legacy-decoded-text', decodeVersion: 'paichart.text/1', redactorVersion: 'paichart.r10/2',
  redactedCount: redacted, lineCount: 99999, newline: null, bom: null, finalNewline: null, serviceReportsComplete: null,
  derivedRawByteLength: null, placeholderPreexistingCount: 0,
});
const NAMES = ['not-declared', 'no-scope', 'is-error', 'raw-digest-present', 'over-cap', 'descriptor-mismatch', 'path-invalid',
  'nul-byte', 'lone-surrogate', 'decode-violated', 'legacy-bom', 'line-map-broken', 'escaped-secret-residual', 'store-error'];
const refusal = (i: number, name: string, target: string | null, path: string | null): HeldCaptureRefusalRow => ({
  executionId: 'e1', scope: 'p1', serviceId: null, serviceName: 'observability-readonly', identitySource: 'envelope',
  sourceTool: 'get_otel_config', toolCallIndex: i, selector: null, target, path, refusal: name, declaredBy: 'platform-default',
  descriptorVersion: 1,
});
const MAX_TARGET = 'A' + 'z'.repeat(252);                     // 253 chars, the P3 §4.2 bound
const ESCAPEY = '"\u0001"\u0002'.repeat(300);                   // every char costs 2–6 when serialised
const MAX_PATH = '/' + ESCAPEY.slice(0, 1023);                  // 1,024 chars, the path-invalid bound
const maximal: HeldBytesFactInput = {
  refs: [ref(0, MAX_TARGET, MAX_PATH, 7), ref(1, ESCAPEY.slice(0, 253), '/x/' + ESCAPEY.slice(0, 1000), 3), ref(2, MAX_TARGET, MAX_PATH)],
  refusals: NAMES.map((n, i) => refusal(3 + i, n, MAX_TARGET, MAX_PATH)),
  storedBytes: 16 * 1024 * 1024,
};

test('MAXIMAL input (all 14 names, 3+ rows, 253-char targets, 1,024-char escape-heavy paths) ⇒ ≤ 1,024', () => {
  // Measured 2026-10-14: this row shape's worst case is ~1,014 serialised characters with all 3 rows (the plan's 1,157
  // assumed a wider row), so at the real budget the guard is a backstop that rarely fires. Its behaviour is proven below
  // with a lowered limit — never assume a row shape stays this small.
  const d = buildHeldBytesDigest(maximal);
  const n = JSON.stringify(d).length;
  ok(n <= HELD_BYTES_DIGEST_MAX, `digest is ${n}`);
  ok(Object.keys(d.refused).length === 14, 'all 14 names counted');
});
test('the final guard: under a lowered limit, trailing rows drop until it fits, and rowsOmitted counts them', () => {
  for (const limit of [900, 700, 500]) { // all above the no-row floor (~423 with 14 names)
    const d = buildHeldBytesDigest(maximal, limit);
    const n = JSON.stringify(d).length;
    ok(n <= limit, `limit ${limit}: digest is ${n}`);
    ok(typeof d.rowsOmitted === 'number' && d.rowsOmitted > 0, `limit ${limit}: rowsOmitted must be set`);
    ok(d.rows.length + d.rowsOmitted! === 3, `limit ${limit}: ${d.rows.length} rows + ${d.rowsOmitted} omitted`);
  }
});
test('rowsOmitted appears exactly when rows were dropped', () => {
  const d = buildHeldBytesDigest(maximal);
  ok(d.rows.length + (d.rowsOmitted ?? 0) === 3, `${d.rows.length} rows + ${d.rowsOmitted} omitted`);
  const typical = buildHeldBytesDigest({ refs: [ref(1, 'obs-ingress', '/etc/nginx/conf.d/otlp-ingress.conf'), ref(1, 'obs-ingress', '/etc/nginx/conf.d/operator-access.conf'), ref(2, 'obs-otelcol', '/etc/otelcol/config.yaml')], refusals: [], storedBytes: 3000 });
  ok(typical.rowsOmitted === undefined, 'no rowsOmitted on a typical capture');
});
test('a typical rig capture (3 files) ⇒ no truncation, basenames, sparse (empty) refusal counts', () => {
  const d = buildHeldBytesDigest({ refs: [ref(1, 'obs-ingress', '/etc/nginx/conf.d/otlp-ingress.conf'), ref(1, 'obs-ingress', '/etc/nginx/conf.d/operator-access.conf'), ref(2, 'obs-otelcol', '/etc/otelcol/config.yaml')], refusals: [], storedBytes: 3000 });
  ok(d.rows.every((r) => !r.truncatedFields), 'no truncatedFields');
  ok(JSON.stringify(d.rows.map((r) => r.path)) === JSON.stringify(['otlp-ingress.conf', 'operator-access.conf', 'config.yaml']), JSON.stringify(d.rows));
  ok(JSON.stringify(d.refused) === '{}', 'sparse: no refusal names');
  ok(d.held === 3 && d.totals.files === 3 && d.totals.storedBytes === 3000, 'totals');
});
test('truncatedFields names exactly the cut fields', () => {
  const d = buildHeldBytesDigest({ refs: [ref(0, MAX_TARGET, '/etc/short.conf')], refusals: [], storedBytes: 1 });
  ok(JSON.stringify(d.rows[0].truncatedFields) === '["target"]', JSON.stringify(d.rows[0]));
});
test('capSerialised counts SERIALISED characters (an escaped quote costs 2), cuts on a code point', () => {
  const c = capSerialised('"'.repeat(30), 40);
  ok(c.cut && JSON.stringify(c.value).length - 2 <= 40 && c.value.length === 20, JSON.stringify(c));
  const e = capSerialised('😀'.repeat(30), 40);
  ok(e.cut && e.value.isWellFormed(), 'never splits a surrogate pair');
});
test('no hash anywhere: no 64-hex run in the digest or the manifest', () => {
  const blob = JSON.stringify(buildHeldBytesDigest(maximal)) + JSON.stringify(buildHeldBytesManifest(maximal));
  ok(!/[0-9a-f]{64}/i.test(blob), 'a 64-hex run was emitted');
});
test('manifest keeps every object and the FULL strings', () => {
  const m = buildHeldBytesManifest(maximal);
  ok(m.objects.length === 17, `objects ${m.objects.length}`);
  ok(m.objects[0].target === MAX_TARGET && m.objects[0].path === MAX_PATH, 'full strings');
  ok(m.objects.every((o, i) => o.handleIndex === i), 'handle indexes in order');
});

console.log(`\n📊 Total Tests:  ${passed + failed}`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Total Failed: ${failed}`);
if (failed > 0) process.exit(1);
console.log('✅ All tests passed!');
