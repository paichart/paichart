#!/usr/bin/env node
/**
 * Tests for the apply-time provenance marker (lib/mcp/server/tools/validation-provenance.js).
 *
 * The fixture headings are the REAL ones from Run 22's report.md (execution
 * cmsbh9q8v0061yxais8zvkq9s), not invented — a marker that fires on a heading style no leg produces
 * is a marker that never fires.
 */
const assert = require('assert');
const {
  markValidationProvenance,
  detectUnverifiedSections,
  PROVENANCE_MARKER,
} = require('../lib/mcp/server/tools/validation-provenance');

let pass = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { console.error(`  ❌ ${name}\n     ${e.message}`); process.exitCode = 1; }
}

// Real Run 22 shape.
const REPORT = [
  '# Telemetry-Exporter Aggregate Derivation — Change Package',
  '## Pre-existing Allocations',
  '## Derived Values',
  '## Device Configuration Blocks',
  '### ceos1 (ASN 65001)',
  '## Validation Steps',
  '### ceos1 Validation',
  '## Rollback Plan',
  '## Change Ordering and Maintenance Window',
  '## Summary',
].join('\n\n');

console.log('validation-provenance');

test('detects the comparison-target H2s, in document order', () => {
  assert.deepStrictEqual(detectUnverifiedSections(REPORT), ['Validation Steps', 'Rollback Plan']);
});

test('H3 subsections do NOT each raise a banner entry', () => {
  // '### ceos1 Validation' matches the word but is not a top-level comparison target; listing every
  // subsection would make the banner noise, and noise trains readers to skip it.
  assert.ok(!detectUnverifiedSections(REPORT).includes('ceos1 Validation'));
});

test('banner is prepended and names the sections', () => {
  const { text, provenance } = markValidationProvenance(REPORT, 'report.md');
  assert.ok(text.startsWith('>'), 'banner leads the document');
  assert.ok(text.includes('`Validation Steps`') && text.includes('`Rollback Plan`'));
  assert.deepStrictEqual(provenance.unverifiedSections, ['Validation Steps', 'Rollback Plan']);
  assert.strictEqual(provenance.independentlyVerified, false);
  assert.ok(text.endsWith(REPORT), 'original body preserved byte-for-byte after the banner');
});

test('IDEMPOTENT — a second pass does not stack banners', () => {
  const once = markValidationProvenance(REPORT, 'report.md').text;
  const twice = markValidationProvenance(once, 'report.md').text;
  assert.strictEqual(twice, once);
  assert.strictEqual(twice.split(PROVENANCE_MARKER).length - 1, 1, 'marker appears exactly once');
});

test('no comparison-target section ⇒ untouched, and provenance ABSENT not false', () => {
  const plain = '# Notes\n\n## Summary\n\nnothing to verify here';
  const { text, provenance } = markValidationProvenance(plain, 'report.md');
  assert.strictEqual(text, plain);
  assert.strictEqual(provenance, null, 'absence must not read as "verified"');
});

test('non-markdown artifacts are never marked', () => {
  const r = markValidationProvenance('## Validation Steps\nfoo', 'result.json');
  assert.strictEqual(r.text, '## Validation Steps\nfoo');
  assert.strictEqual(r.provenance, null);
});

test('empty / non-string input is safe', () => {
  assert.strictEqual(markValidationProvenance('', 'report.md').text, '');
  assert.strictEqual(markValidationProvenance(null, 'report.md').provenance, null);
  assert.deepStrictEqual(detectUnverifiedSections(undefined), []);
});

test('same input, same answer twice (see caveat)', () => {
  // ⚠️ HONEST LABEL. An earlier version of this claimed to guard a shared-/g-regex `lastIndex` leak.
  // It did not: mutating the reset away left all ten tests green, because the exec loop always runs
  // to null and that resets lastIndex itself. The implementation now builds the regex per call, so
  // there is no state to leak and this assertion holds BY CONSTRUCTION. Kept as a cheap regression
  // guard against someone hoisting the regex back to module scope AND adding an early `break`;
  // it cannot catch the hoist on its own, and does not claim to.
  const a = detectUnverifiedSections(REPORT);
  const b = detectUnverifiedSections(REPORT);
  assert.deepStrictEqual(a, b);
});

test('domain wording variants are caught (terraform says Verification)', () => {
  const tf = '# S3 Policy\n\n## Verification\n\nterraform plan';
  assert.deepStrictEqual(detectUnverifiedSections(tf), ['Verification']);
});

test('states facts, not verdicts — no judgement about the content', () => {
  const { text } = markValidationProvenance(REPORT, 'report.md');
  for (const verdict of ['malicious', 'suspicious', 'unsafe', 'do not trust', 'likely wrong']) {
    assert.ok(!text.toLowerCase().includes(verdict), `banner must not assert "${verdict}" (Protocol 10)`);
  }
  assert.ok(text.includes('not been run against any device'), 'states what was not done');
});

console.log(`\n${pass} passed`);
if (process.exitCode) { console.error('FAILED'); }
