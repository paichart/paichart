#!/usr/bin/env ts-node
/**
 * Derivation-containment validator tests (2026-07-17, pipeline-harness-specialist ruling).
 *
 * The two mandated incident fixtures:
 *  - RUN-3 shape (dropped enumeration): derived 10.99.0.0/30 with members .1/.2 over a harvest
 *    containing seeded 10.99.0.3 → VIOLATION (covered-not-member). This is the defect three LLM
 *    reviewer tiers approved at 88/92/94.
 *  - RUN-4 shape (fabricated evidence): the check anchors to the HARVEST list — a fabricated
 *    package-side '10.99.0.0/25 Reserved' entry never reaches it, so the valid .4/30 derivation
 *    yields ZERO violations (no false CRITICAL).
 *
 * Totals are computed; the declared-vs-executed self-check guards the bottom-exit trap.
 */

import {
  checkDerivedValueUsage,
  usageOutsideDerivedBlock,
  parseFencedJsonBlock,
  checkDerivationContainment,
  checkConsumedValues,
  isUpstreamContainmentGreen,
  minimalCoveringPrefixLength,
  parseAsn,
  harvestCounts,
  asnPolicyClass,
  asnToCanonical,
  HARVESTED_ALLOCATIONS_MARKER,
  DERIVED_VALUES_MARKER,
  CONSUMED_VALUES_MARKER,
  type HarvestedAllocation,
  type DerivedValue,
  computeContainmentDisposition,
  markerHeadingRegex,
  markerSectionEnd,
  FENCE_LINE_RE,
  FENCED_JSON_BLOCK_RE,
} from '../src/index';

let passed = 0, failed = 0;
function test(desc: string, fn: () => void) {
  try { fn(); console.log(`✅ ${desc}`); passed++; }
  catch (e) { console.log(`❌ ${desc}\n   ${e instanceof Error ? e.message : e}`); failed++; }
}
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }

const SEEDS: HarvestedAllocation[] = [
  { kind: 'cidr', cidr: '10.99.0.3/32', device: 'ceos1', interface: 'Loopback11' },
  { kind: 'cidr', cidr: '10.99.0.28/32', device: 'ceos1', interface: 'Loopback12' },
  { kind: 'cidr', cidr: '10.99.0.30/32', device: 'ceos1', interface: 'Loopback13' },
  { kind: 'cidr', cidr: '10.99.0.13/32', device: 'ceos2', interface: 'Loopback11' },
  { kind: 'cidr', cidr: '10.99.0.15/32', device: 'ceos2', interface: 'Loopback12' },
  { kind: 'cidr', cidr: '10.99.0.29/32', device: 'ceos2', interface: 'Loopback13' },
];

test('RUN-3 fixture: .0/30 over members .1/.2 with seeded .3 harvested → exactly the covered-not-member violation', () => {
  const r = checkDerivationContainment(SEEDS, [
    { kind: 'cidr', value: '10.99.0.0/30', members: ['10.99.0.1/32', '10.99.0.2/32'] },
  ]);
  assert(r.checked === true, 'checked');
  assert(r.violations!.length === 1, `expected 1 violation, got ${r.violations!.length}`);
  assert(r.violations![0].harvested === '10.99.0.3/32' && r.violations![0].derived === '10.99.0.0/30',
    `wrong violation: ${JSON.stringify(r.violations![0])}`);
});

test('RUN-4 fixture: valid .4/30 (members .4/.5) against the REAL harvest → zero violations (fabricated /25 never enters — anchor-to-harvest)', () => {
  const r = checkDerivationContainment(SEEDS, [
    { kind: 'cidr', value: '10.99.0.4/30', members: ['10.99.0.4/32', '10.99.0.5/32'] },
  ]);
  // Asserts the CLASS under test (anchor-to-harvest), not a total count: this fixture's own
  // aggregate .4/30 over members .4/.5 is NON-MINIMAL (minimal is /31), so it now also yields a
  // prefix-not-minimal violation. That is real — run 4's derivation was itself loose and nobody
  // noticed. The property this fixture exists to prove is that the fabricated /25 never enters.
  assert(r.checked === true, 'checked');
  assert(r.violations!.filter(v => v.reason === 'covered-not-member').length === 0,
    `fabricated /25 must not enter via the package: ${JSON.stringify(r.violations)}`);
});

test('members subtraction: aggregate always covers its own members without violating', () => {
  const r = checkDerivationContainment(
    [{ cidr: '10.99.0.4/32' }, { cidr: '10.99.0.5/32' }],
    [{ kind: 'cidr', value: '10.99.0.4/30', members: ['10.99.0.4/32', '10.99.0.5/32'] }]
  );
  assert(r.violations!.filter(v => v.reason === 'covered-not-member').length === 0,
    'members must not violate their own aggregate (prefix-not-minimal is a separate, correct finding here)');
});

test('member normalization: bare address member matches /32 harvested entry (range identity, not string identity)', () => {
  const r = checkDerivationContainment(
    [{ cidr: '10.99.0.4/32' }],
    [{ kind: 'cidr', value: '10.99.0.4/30', members: ['10.99.0.4'] }]
  );
  assert(r.violations!.filter(v => v.reason === 'covered-not-member').length === 0,
    'bare-address member must match its /32 form');
});

test('unsupported kind reported, not guessed', () => {
  const r = checkDerivationContainment(SEEDS, [{ kind: 'k8s-namespace', value: 'prod-*' }]);
  assert(r.violations!.length === 0 && r.unsupported!.length === 1 && r.unsupported![0].kind === 'k8s-namespace',
    `unsupported not reported: ${JSON.stringify(r)}`);
});

test('malformed derived cidr → unsupported entry, no throw', () => {
  const r = checkDerivationContainment(SEEDS, [{ kind: 'cidr', value: 'not-a-cidr', members: [] }]);
  assert(r.unsupported!.length === 1, 'malformed cidr must land in unsupported');
});

test('parser: extracts fenced json after the harvest marker (case-insensitive, json tag optional)', () => {
  const doc = `# Report\n\n## harvested allocations\n\n\`\`\`JSON\n[{"kind":"cidr","cidr":"10.99.0.3/32"}]\n\`\`\`\n`;
  const got = parseFencedJsonBlock<HarvestedAllocation>(doc, HARVESTED_ALLOCATIONS_MARKER);
  assert(got !== null && got.length === 1 && got[0].cidr === '10.99.0.3/32', `parse failed: ${JSON.stringify(got)}`);
});

test('parser: LAST block wins (corrected re-statement supersedes)', () => {
  const doc = `${DERIVED_VALUES_MARKER}\n\`\`\`json\n[{"kind":"cidr","value":"10.99.0.0/30","members":[]}]\n\`\`\`\n` +
    `${DERIVED_VALUES_MARKER}\n\`\`\`json\n[{"kind":"cidr","value":"10.99.0.4/30","members":["10.99.0.4/32","10.99.0.5/32"]}]\n\`\`\`\n`;
  const got = parseFencedJsonBlock<DerivedValue>(doc, DERIVED_VALUES_MARKER);
  assert(got !== null && got[0].value === '10.99.0.4/30', `last-match-wins failed: ${JSON.stringify(got)}`);
});

test('parser: fence-inversion fallback (FW-A3.4 live shape 2026-08-22) — marker INSIDE the fence parses', () => {
  // The agent opened the ```json fence one line before the heading, swallowing the marker.
  const doc = `# Report\n\n### Gaps\nNone.\n\n\`\`\`json\n${HARVESTED_ALLOCATIONS_MARKER}\n[\n  {"kind":"cidr","cidr":"10.99.0.2/32","device":"ceos1"},\n  {"kind":"cidr","cidr":"10.99.0.8/32","device":"ceos1"}\n]\n\`\`\`\nTrailing prose.\n`;
  const got = parseFencedJsonBlock<HarvestedAllocation>(doc, HARVESTED_ALLOCATIONS_MARKER);
  assert(got !== null && got.length === 2 && got[0].cidr === '10.99.0.2/32', `fence-inversion parse failed: ${JSON.stringify(got)}`);
});

test('parser: fence-inversion with garbage json → still null (fallback never fabricates)', () => {
  const doc = `\`\`\`json\n${HARVESTED_ALLOCATIONS_MARKER}\n{not json\n\`\`\`\n`;
  assert(parseFencedJsonBlock(doc, HARVESTED_ALLOCATIONS_MARKER) === null, 'garbage inside inverted fence must be null');
});

test('parser: normal form still preferred when both shapes present (primary path precedence)', () => {
  // A wrapping fence earlier in the doc must not shadow a well-formed marker+fence later.
  const doc = `\`\`\`json\n["unrelated"]\n\`\`\`\n${HARVESTED_ALLOCATIONS_MARKER}\n\`\`\`json\n[{"kind":"cidr","cidr":"10.99.0.4/32"}]\n\`\`\`\n`;
  const got = parseFencedJsonBlock<HarvestedAllocation>(doc, HARVESTED_ALLOCATIONS_MARKER);
  assert(got !== null && got.length === 1 && got[0].cidr === '10.99.0.4/32', `precedence failed: ${JSON.stringify(got)}`);
});

test('parser: missing header / broken json / non-array → null (never a fabricated empty list)', () => {
  assert(parseFencedJsonBlock('no header here', HARVESTED_ALLOCATIONS_MARKER) === null, 'missing header');
  assert(parseFencedJsonBlock(`${HARVESTED_ALLOCATIONS_MARKER}\n\`\`\`json\n{oops\n\`\`\``, HARVESTED_ALLOCATIONS_MARKER) === null, 'broken json');
  assert(parseFencedJsonBlock(`${HARVESTED_ALLOCATIONS_MARKER}\n\`\`\`json\n{"a":1}\n\`\`\``, HARVESTED_ALLOCATIONS_MARKER) === null, 'non-array');
  assert(parseFencedJsonBlock(null, HARVESTED_ALLOCATIONS_MARKER) === null, 'null text');
});

test('cidr arithmetic: /31 straddle (the run-3 minimality premise) — .1+.2 truly need /30', () => {
  // .1/.2 straddle a /31 boundary: a /31 at .0 covers .0-.1, at .2 covers .2-.3 — neither covers both.
  const only31 = checkDerivationContainment(
    [{ cidr: '10.99.0.2/32' }],
    [{ kind: 'cidr', value: '10.99.0.0/31', members: ['10.99.0.1/32'] }]
  );
  assert(only31.violations!.filter(v => v.reason === 'covered-not-member').length === 0,
    '.2 is outside .0/31 — no containment violation expected');
});

test('RUN-5 fixture: member-not-covered — /31 claimed for .1/.2 straddle → the arithmetic error flagged mechanically', () => {
  const r = checkDerivationContainment(SEEDS, [
    { kind: 'cidr', value: '10.99.0.0/31', members: ['10.99.0.1/32', '10.99.0.2/32'] },
  ]);
  const mnc = r.violations!.filter(v => v.reason === 'member-not-covered');
  assert(mnc.length === 1 && mnc[0].member === '10.99.0.2/32' && mnc[0].derived === '10.99.0.0/31',
    `expected .2 member-not-covered, got ${JSON.stringify(r.violations)}`);
});

test('member-not-covered does not fire when every member IS covered', () => {
  const r = checkDerivationContainment(SEEDS, [
    { kind: 'cidr', value: '10.99.0.4/30', members: ['10.99.0.4/32', '10.99.0.5/32'] },
  ]);
  assert(r.violations!.filter(v => v.reason === 'member-not-covered').length === 0,
    `no member falls outside .4/30: ${JSON.stringify(r.violations)}`);
});

test('RUN-6 fixture: bold-heading variance — `**Derived Values** (quoted verbatim…)` still parses (the blind-validator gap)', () => {
  const doc = '#### **Derived Values** (quoted verbatim from Phase 1 Design Architect)\n\n```json\n[{"kind":"cidr","value":"10.99.0.0/31","members":["10.99.0.1/32","10.99.0.2/32"]}]\n```\n';
  const got = parseFencedJsonBlock<DerivedValue>(doc, DERIVED_VALUES_MARKER);
  assert(got !== null && got[0].value === '10.99.0.0/31', `bold-heading parse failed: ${JSON.stringify(got)}`);
  // And the block it unlocks fires the run-5/6 arithmetic violation:
  const r = checkDerivationContainment(SEEDS, got!);
  assert(r.violations!.some(v => v.reason === 'member-not-covered' && v.member === '10.99.0.2/32'),
    `expected member-not-covered after parsing, got ${JSON.stringify(r.violations)}`);
});

test('BACKTICK fixture (2026-09-16 k8s legs): `` ## 4. `## Derived Values` `` parses', () => {
  // Live shape from kubernetes-gitops program cmu3nk19o0027yxxq46kkp47l (Author cmu3nuxgm001oyxxwsn6j1jv1,
  // Architect cmu3nuq430019yxxwesof12sg) and network-provisioning cmu1pj4ht004fyx0optwzmlpe. The agent
  // QUOTES the mandated heading. It renders identically in markdown and reads correct to a human or an
  // LLM — only the parser saw the difference, and the block read ABSENT with the fact failing closed.
  const doc = '## 4. `## Derived Values`\n\n```json\n[{"kind":"cidr","value":"10.99.0.4/30","members":["10.99.0.4/32","10.99.0.5/32"]}]\n```\n';
  const got = parseFencedJsonBlock<DerivedValue>(doc, DERIVED_VALUES_MARKER);
  assert(got !== null && got[0].value === '10.99.0.4/30', `backticked-heading parse failed: ${JSON.stringify(got)}`);
  // The other two markers take the same shape, and the same-parser rule means markerPresence moves with them.
  assert(parseFencedJsonBlock(`## 3. \`## Harvested Allocations\`\n\`\`\`json\n[]\n\`\`\`\n`, HARVESTED_ALLOCATIONS_MARKER) !== null, 'harvested backticked');
  // Bare, and with emphasis wrapped outside the quotes:
  assert(parseFencedJsonBlock(doc.replace('## 4. ', ''), DERIVED_VALUES_MARKER) !== null, 'bare backticked heading');
  assert(parseFencedJsonBlock(doc.replace('## 4. `', '### 4. **`').replace('`\n', '`**\n'), DERIVED_VALUES_MARKER) !== null, 'bold outside the quotes');
});

test('BACKTICK tolerance does NOT reach a mid-sentence reference or a sibling marker', () => {
  const body = '```json\n[{"kind":"cidr","value":"10.99.0.4/30","members":[]}]\n```\n';
  assert(parseFencedJsonBlock(`See the \`## Derived Values\` block below for details\n${body}`, DERIVED_VALUES_MARKER) === null,
    'mid-sentence backticked reference must not match');
  assert(parseFencedJsonBlock(`- the \`## Derived Values\` block is emitted by the Author\n${body}`, DERIVED_VALUES_MARKER) === null,
    'bulleted backticked reference must not match');
  assert(parseFencedJsonBlock(`## 3. \`## Harvested Allocations\`\n${body}`, DERIVED_VALUES_MARKER) === null,
    'a backticked SIBLING marker must not satisfy this marker');
});

test('BACKTICK tolerance must NOT break the FW-A3.4 fence inversion (the regression the first fix caused)', () => {
  // The obvious fix — adding a backtick to the FIRST character class — passed every single-heading
  // fixture and REGRESSED 3 production legs, because that class contains `\s`, which spans newlines:
  // the match started on the bare ``` opener, `lastIdx` landed on the fence instead of the heading,
  // the fenceOpensBefore parity flipped odd→even, and the inversion arm below never fired. A
  // single-heading fixture cannot express last-match-wins, so the index is asserted here directly.
  const doc = 'Derivation follows.\n```\n## Derived Values\n[{"kind":"cidr","value":"10.99.0.4/30","members":["10.99.0.4/32"]}]\n```\n';
  const got = parseFencedJsonBlock<DerivedValue>(doc, DERIVED_VALUES_MARKER);
  assert(got !== null && got[0].value === '10.99.0.4/30', `fence-inverted block must still parse: ${JSON.stringify(got)}`);
});

// MARKER-LETTERED-HEADING (2026-10-08). Opus 5.5 lab Author (L7 N-R opusAuthor sample-02) wrote
// `## (e2) Derived Values`; the block read ABSENT and the Reviewer refused. Prod carries `### (f)` /
// `### (g) Consumed Values` (config_change_author cmuoxvlzn00e5yxlrywsa05zf, cmurg6cpy0101yxx9f34qflb0).
// Accepted ONLY parenthesised: `(letter[0-2 digits])`. The rejected shapes are the live non-markers a
// wider rule would capture: reviewers quoting a leg (`### P1 Harvested Allocations (Ground Truth)`), a
// technical_writer's report section (`### 7.2 Derived Values (…)`), a bare `e2 `, and prose titles.
test('LETTERED ordinal: `(e2)` / `(f)` / `(G)` parse; bare `P1 ` / `e2 ` / `7.2 ` / prose do not', () => {
  const body = '```json\n[{"kind":"cidr","value":"10.99.0.6/31","members":["10.99.0.6/32","10.99.0.7/32"]}]\n```\n';
  for (const h of ['## (e2) Derived Values', '### (f) Derived Values', '## (G) Derived Values', '**(e2) Derived Values**']) {
    const got = parseFencedJsonBlock<DerivedValue>(`${h}\n${body}`, DERIVED_VALUES_MARKER);
    assert(got !== null && got[0].value === '10.99.0.6/31', `lettered heading must parse: ${h} → ${JSON.stringify(got)}`);
  }
  assert(parseFencedJsonBlock(`### (g) Consumed Values\n\`\`\`json\n[{"kind":"cidr","value":"10.99.0.0/27"}]\n\`\`\`\n`, CONSUMED_VALUES_MARKER) !== null,
    'lettered Consumed Values heading must parse');
  for (const h of ['### P1 Derived Values (Ground Truth)', '### 7.2 Derived Values (Phase 1 Design)', '## e2 Derived Values',
    '## (ee) Derived Values', '## (e123) Derived Values', '## Evidence — Derived Values', '#### P1/P2 Derived Values']) {
    assert(parseFencedJsonBlock(`${h}\n${body}`, DERIVED_VALUES_MARKER) === null, `must NOT parse as a marker heading: ${h}`);
  }
});

test('LETTERED ordinal: a lettered wrapper above the canonical heading still reads the SAME block (prod shape)', () => {
  // cmuoxvlzn00e5yxlrywsa05zf: `### (f) Consumed Values` then a blank line then `## Consumed Values` + fence.
  // Last-match-wins must keep selecting the inner canonical heading's block.
  const doc = '### (f) Consumed Values\n\n## Consumed Values\n```json\n[{"kind":"cidr","value":"10.99.0.0/27"}]\n```\nCopied verbatim.\n\n### (g) Isolation collateral effect\n';
  const got = parseFencedJsonBlock<{ kind: string; value: string }>(doc, CONSUMED_VALUES_MARKER);
  assert(got !== null && got.length === 1 && got[0].value === '10.99.0.0/27', `wrapper shape: ${JSON.stringify(got)}`);
});

// X28 (2026-09-28) — Program Run 4 FABRIC Author (`cmukr4blz00f7yxils8659wsw`, leg `cmukqplsa00beyxiljaajwx4s`).
// Shape reproduced from the live text (lab addresses): a correctly placed `## Derived Values` block, then
// a validation step whose EXPECTED OUTPUT fence contains a line BEGINNING with the marker words. The
// shipped parser took that line as the heading (last match wins), the first fence after it was not the
// block, and markerPresence.derivedValues stamped false — the leg's Reviewer then blocked on the fact.
const X28_RUN4 = [
  '## Derived Values', '',
  '*Carried forward verbatim from Phase 1 design (task ID `cmukr46n100f2yxil1aokkba5`), unaltered:*', '',
  '```json',
  '[{"kind": "cidr", "value": "10.99.0.0/27", "members": ["10.99.0.1/32", "10.99.0.2/32", "10.99.0.4/32", "10.99.0.24/32", "10.99.0.26/32", "10.99.0.29/32"]}]',
  '```', '',
  '## Validation steps (recomputation)', '',
  '```',
  'Step 3 — Population match: cross-check § Pre-existing Allocations cidr entries against § Derived Values members',
  '```',
  '**Expected output (set equality, exact):**',
  '```',
  'Pre-existing Allocations cidr set  = {10.99.0.1/32, 10.99.0.26/32, 10.99.0.29/32, 10.99.0.2/32, 10.99.0.4/32, 10.99.0.24/32}',
  'Derived Values members set          = {10.99.0.1/32, 10.99.0.2/32, 10.99.0.4/32, 10.99.0.24/32, 10.99.0.26/32, 10.99.0.29/32}',
  'SET EQUAL → no member fabricated, none omitted',
  '```', '',
  '```',
  'Step 4 — Chaining coverage, to be run by each consuming leg',
  '```', '',
].join('\n');

test('X28 fixture: Run 4 FABRIC — a validation line BEGINNING with the marker words does not displace the real block', () => {
  const got = parseFencedJsonBlock<DerivedValue>(X28_RUN4, DERIVED_VALUES_MARKER);
  assert(got !== null && got.length === 1 && got[0].value === '10.99.0.0/27' && (got[0].members ?? []).length === 6,
    `Run 4 block must parse through the trailing validation line: ${JSON.stringify(got)}`);
});

test('X28 fixture: numbered SUMMARY line (`5. **Consumed Values:** Chained value …`) does not displace the real block', () => {
  // Archived shape, two Authors (cmsd0coei002tyx51t8bpjx62, cmsa6cg7c007eyxeu7rio9o1r): the ordinal widening
  // (2026-09-09) made a closing numbered summary line match, so the consumed block read ABSENT.
  const doc = '## Consumed Values\n\n```json\n[{"kind":"cidr","value":"10.99.0.8/31"}]\n```\n\n### Summary for Reviewer\n\n' +
    '4. **Rollback:** documented\n5. **Consumed Values:** Chained value `10.99.0.8/31` documented for platform verification.\n\nConfidence: 92\n';
  const got = parseFencedJsonBlock<{ value: string }>(doc, CONSUMED_VALUES_MARKER);
  assert(got !== null && got[0].value === '10.99.0.8/31', `summary line must not win: ${JSON.stringify(got)}`);
});

test('X28 negative: a HEADING-shaped last match over a broken/non-array block stays null — the earlier block is NEVER substituted', () => {
  // The fail-closed half. "A corrected re-statement supersedes an earlier one": if the correction is
  // malformed the fact must read ABSENT, not silently fall back to the stale block. Archived specimen:
  // a technical_writer whose second `### Derived Values` carried a JSON OBJECT.
  const first = '### Derived Values\n\n```json\n[{"kind":"cidr","value":"10.99.0.16/31","members":["10.99.0.16/32","10.99.0.17/32"]}]\n```\n\n';
  const objectRestatement = '### Derived Values\n\n```json\n{"exporter_aggregate": "10.99.0.16/31"}\n```\n';
  assert(parseFencedJsonBlock(first + objectRestatement, DERIVED_VALUES_MARKER) === null, 'non-array heading restatement must stay null');
  const broken = '**Derived Values** (corrected)\n\n```json\n[{"kind":"cidr", oops\n```\n';
  assert(parseFencedJsonBlock(first + broken, DERIVED_VALUES_MARKER) === null, 'broken bold+parenthetical restatement must stay null');
  assert(parseFencedJsonBlock(first + '## 6. Derived Values:\n```json\n{oops\n```\n', DERIVED_VALUES_MARKER) === null,
    'broken numbered-colon heading must stay null');
});

test('X28 negative: a prose line beginning with the marker never wins over a real heading, and alone parses nothing', () => {
  // The prose line is stepped over, the REAL heading wins — and with no real heading, prose over a
  // non-array fence is still null (no fabrication; absence keeps its meaning).
  const real = '## Harvested Allocations\n```json\n[{"kind":"cidr","cidr":"10.99.0.4/32"}]\n```\n';
  const prose = 'Harvested Allocations were cross-checked against the device:\n```\nshow ip int brief | include Loopback\n```\n';
  const got = parseFencedJsonBlock<HarvestedAllocation>(real + prose, HARVESTED_ALLOCATIONS_MARKER);
  assert(got !== null && got[0].cidr === '10.99.0.4/32', `real heading must win over trailing prose: ${JSON.stringify(got)}`);
  assert(parseFencedJsonBlock(prose, HARVESTED_ALLOCATIONS_MARKER) === null, 'prose alone must stay null');
  // Last-match-wins between two REAL blocks is unchanged:
  const two = real + '## Harvested Allocations\n```json\n[{"kind":"cidr","cidr":"10.99.0.5/32"}]\n```\n' + prose;
  const g2 = parseFencedJsonBlock<HarvestedAllocation>(two, HARVESTED_ALLOCATIONS_MARKER);
  assert(g2 !== null && g2[0].cidr === '10.99.0.5/32', `corrected re-statement must still supersede: ${JSON.stringify(g2)}`);
});

// PARSE-STEAL (2026-10-04) — value-chain B7 run 1 S3 Author (`cmuqs10r500i2yxx9v9j8ovfd`, leg
// `cmuqqjrgq002kyxx9duvc9yhr`). Excerpt of the live text: an EMPTY `## Derived Values` heading (prose
// only) followed by a correct `## Consumed Values` block. The shipped parser took the first fence
// ANYWHERE after the marker, so the CONSUMED block was read as the DERIVED values; the enrichment took
// the checked path against an empty pool (benign/checked-clean by construction) and check 1
// (consumed-value-mismatch) never ran. Fails OPEN.
const PS_B7R1_S3 = [
  '## Pre-existing Allocations', '',
  'Quoted verbatim from the Phase 0 harvest\'s `## Harvested Allocations` block (`infra_state_harvester`, workspace `prod`):', '',
  '```json', '[]', '```', '',
  'No CIDR/ASN allocation exists in this resource\'s harvested state. This pool is empty by construction, not by omission.', '',
  '## Derived Values', '',
  'Not carried forward — the Architect\'s design performed no derivation arithmetic for this leg (it explicitly states: ' +
    '*"No `## Derived Values` block is emitted by this Architect leg… this design consumes the exporter-range CIDR from the ' +
    'upstream network-derivation leg rather than deriving it itself"*). No block exists to carry.', '',
  '## Consumed Values', '',
  '```json', '[{"kind": "cidr", "value": "10.99.0.0/27"}]', '```', '',
  'Value taken verbatim from the network-derivation leg\'s published deliverable (task `cmuqqhnty0021yxx9le2mzg1a`).', '',
  '## Policy / Constraint Baseline (restated from harvest, for the Reviewer)', '',
  '| Dimension | Baseline |', '|---|---|', '| Workspace | `prod` |', '',
].join('\n');

test('PARSE-STEAL incident (B7 run 1 S3 Author): an EMPTY `## Derived Values` heading does NOT claim the Consumed block', () => {
  assert(parseFencedJsonBlock(PS_B7R1_S3, DERIVED_VALUES_MARKER) === null,
    `derived must read ABSENT — its section holds no block: ${JSON.stringify(parseFencedJsonBlock(PS_B7R1_S3, DERIVED_VALUES_MARKER))}`);
  const consumed = parseFencedJsonBlock<{ value: string }>(PS_B7R1_S3, CONSUMED_VALUES_MARKER);
  assert(consumed !== null && consumed.length === 1 && consumed[0].value === '10.99.0.0/27',
    `the consumed block is still its own: ${JSON.stringify(consumed)}`);
});

test('PARSE-STEAL, the OTHER order: an EMPTY `## Consumed Values` heading before a populated Derived block reads ABSENT', () => {
  // The direction that would hide the CONSUMER-FAIL-OPEN arm: a consuming leg with no consumed block must
  // read null (⇒ needs-node-c consuming-leg-no-consumed-block), never borrow the next section's block.
  const doc = '## Consumed Values\n\nNone — this leg consumes nothing.\n\n## Derived Values\n\n```json\n' +
    '[{"kind":"cidr","value":"10.99.0.8/31","members":["10.99.0.8/32","10.99.0.9/32"]}]\n```\n';
  assert(parseFencedJsonBlock(doc, CONSUMED_VALUES_MARKER) === null, 'empty consumed heading must not steal the derived block');
  const d = parseFencedJsonBlock<DerivedValue>(doc, DERIVED_VALUES_MARKER);
  assert(d !== null && d[0].value === '10.99.0.8/31', `derived unaffected: ${JSON.stringify(d)}`);
});

test('PARSE-STEAL: an equal- or higher-level ATX heading ends the section; a DEEPER sub-heading is layout inside it', () => {
  const block = '```json\n[{"kind":"cidr","value":"10.99.0.4/31"}]\n```\n';
  // deeper sub-heading: still inside the section (measurement bug 1, 2026-10-03 — must keep parsing)
  const sub = parseFencedJsonBlock<DerivedValue>(`## Derived Values\n\n### Rationale\n\nMinimal pair.\n\n${block}`, DERIVED_VALUES_MARKER);
  assert(sub !== null && sub[0].value === '10.99.0.4/31', `sub-heading must not end the section: ${JSON.stringify(sub)}`);
  // equal level ends it
  assert(parseFencedJsonBlock(`## Derived Values\n\nnone\n\n## Rollback\n\n${block}`, DERIVED_VALUES_MARKER) === null, 'equal-level heading ends the section');
  // higher level ends it
  assert(parseFencedJsonBlock(`### Derived Values\n\nnone\n\n## Rollback\n\n${block}`, DERIVED_VALUES_MARKER) === null, 'higher-level heading ends the section');
  // a non-`#` marker (bold) has no level: ANY ATX heading ends it (archived shapes #5/#6, 2026-07-18 / 08-03)
  assert(parseFencedJsonBlock(`**Harvested Allocations in the containing scope:**\n\nsee table\n\n### Derived Values\n\n${block}`,
    HARVESTED_ALLOCATIONS_MARKER) === null, 'a bold marker is ended by any ATX heading');
});

test('PARSE-STEAL rule (b): a HEADING-SHAPED line of ANOTHER marker ends the section at ANY level (deeper or bold)', () => {
  const block = '```json\n[{"kind":"cidr","value":"10.99.0.0/27"}]\n```\n';
  // `### Consumed Values` is deeper than `## Derived Values`, so rule (a) alone would let derived steal it.
  assert(parseFencedJsonBlock(`## Derived Values\n\nNot carried forward.\n\n### Consumed Values\n\n${block}`, DERIVED_VALUES_MARKER) === null,
    'a deeper sibling marker must still end the section');
  // two bold markers, no ATX heading anywhere
  const bold = `**Harvested Allocations:** none in scope.\n\n**Derived Values:**\n\n${block}`;
  assert(parseFencedJsonBlock(bold, HARVESTED_ALLOCATIONS_MARKER) === null, 'bold sibling marker ends a bold marker');
  const d = parseFencedJsonBlock<DerivedValue>(bold, DERIVED_VALUES_MARKER);
  assert(d !== null && d[0].value === '10.99.0.0/27', `the bold derived marker keeps its own block: ${JSON.stringify(d)}`);
  // a PROSE line that merely begins with a sibling marker's words is NOT a boundary
  const prose = parseFencedJsonBlock<DerivedValue>(
    `## Derived Values\n\nConsumed Values are declared by the downstream leg, not here.\n\n${block}`, DERIVED_VALUES_MARKER);
  assert(prose !== null, 'a prose sibling-marker line is content, not a boundary');
});

test('PARSE-STEAL: an IN-FENCE marker (FW-A3.4 inversion) stays unbounded; fenced `#` lines are content, not markers or boundaries', () => {
  // The inverted layout's block is its own enclosing fence, bounded by the inversion arm — a section scan
  // started inside a fence would read the fence's content as structure, so it is not applied there.
  const doc = '```json\n## Derived Values\n[{"kind":"cidr","value":"10.99.0.2/31"}]\n```\n\n## Next\n```bash\n# show run\n```\n';
  const d = parseFencedJsonBlock<DerivedValue>(doc, DERIVED_VALUES_MARKER);
  assert(d !== null && d[0].value === '10.99.0.2/31', `FW-A3.4 in-fence marker stays unbounded and parses: ${JSON.stringify(d)}`);
  const doc2 = '## Harvested Allocations\n\n```json\n[{"kind":"cidr","cidr":"10.99.0.4/32"}]\n```\n';
  const withComment = '## Notes\n```bash\n# Harvested Allocations\n## Derived Values\n```\n' + doc2;
  const h = parseFencedJsonBlock<HarvestedAllocation>(withComment, HARVESTED_ALLOCATIONS_MARKER);
  assert(h !== null && h[0].cidr === '10.99.0.4/32', `the real heading after a fenced comment still parses: ${JSON.stringify(h)}`);
});

test('PARSE-STEAL live shape (re-measure run 2 k8s Author `cmuszqer600kmyxfk8i7jpfn9`): heading, then a fence whose FIRST line repeats the heading — still parses as consumed', () => {
  // Verbatim excerpt. Two matches: the outer heading (outside a fence) and the repeated line INSIDE the
  // ```json fence. Last-match-wins takes the in-fence one, which is unbounded (FW-A3.4) and parses via the
  // inversion arm. The in-fence `## Consumed Values` line is content to the section scan, never a boundary.
  // Stamped consumedValues:true / consuming-leg-consumed-discharged in production; must not change.
  const doc = 'against live traffic once a receiver pod exists.\n\n## Consumed Values\n\n```json\n## Consumed Values\n' +
    '[{"kind": "cidr", "value": "10.99.0.0/27"}]\n```\n\nConfidence: 90 — Manifest and kustomize overlay are fully traceable.\n';
  const c = parseFencedJsonBlock<{ value: string }>(doc, CONSUMED_VALUES_MARKER);
  assert(c !== null && c.length === 1 && c[0].value === '10.99.0.0/27', `live k8s shape must keep parsing: ${JSON.stringify(c)}`);
  assert(parseFencedJsonBlock(doc, DERIVED_VALUES_MARKER) === null && parseFencedJsonBlock(doc, HARVESTED_ALLOCATIONS_MARKER) === null,
    'no other marker reads it');
});

test('PARSE-STEAL × X28: a HEADING-shaped empty section STOPS the walk-back — an earlier block is never revived', () => {
  // A later, heading-shaped `## Derived Values` that says "not carried forward" is a corrected statement
  // (X28's fail-closed half): the fact reads ABSENT. Shipped code read the CONSUMED block here.
  const doc = '## Derived Values\n\n```json\n[{"kind":"cidr","value":"10.99.0.0/26"}]\n```\n\n' +
    '## Derived Values\n\nNot carried forward — superseded.\n\n## Consumed Values\n\n```json\n[{"kind":"cidr","value":"10.99.0.0/27"}]\n```\n';
  assert(parseFencedJsonBlock(doc, DERIVED_VALUES_MARKER) === null, 'heading-shaped empty restatement must read null');
});

test('PARSE-STEAL × X28: a PROSE-shaped match with an empty section walks back to the real heading instead of stealing', () => {
  // Shipped: the summary line `5. **Derived Values:** carried as above` was the last match, the first fence
  // after it was the CONSUMED block, and that was returned as derived. Bounded: the summary line's section
  // ends at the next ATX heading, holds nothing, is prose-shaped ⇒ X28 steps back to the real block.
  const doc = '## Derived Values\n\n```json\n[{"kind":"cidr","value":"10.99.0.8/31"}]\n```\n\n## Summary\n\n' +
    '5. **Derived Values:** carried as above, unaltered.\n\n## Consumed Values\n\n```json\n[{"kind":"cidr","value":"10.99.0.0/27"}]\n```\n';
  const d = parseFencedJsonBlock<DerivedValue>(doc, DERIVED_VALUES_MARKER);
  assert(d !== null && d[0].value === '10.99.0.8/31', `must walk back to the real block, not steal consumed: ${JSON.stringify(d)}`);
});

test('PARSE-STEAL archived shape: `### Harvested Allocations` (prose gap note) does not claim the `### Derived Values` block', () => {
  // network Author 2026-09-15 (`cmu1zam3h0097yxvrhm7fmxt5`): the harvested section carried a table, the
  // derived section the block — markerPresence stamped Harvested ✓ off the DERIVED block.
  const doc = '## Pre-existing Allocations\n\n### Harvested Allocations\n*(Gap — the Harvester\'s fenced block was not chained.)*\n\n' +
    '| # | CIDR |\n|---|---|\n| 1 | 10.99.0.1/32 |\n\n### Derived Values\n*(quoted verbatim from Phase 1)*\n\n```json\n' +
    '[{"kind": "cidr", "value": "10.99.0.8/30", "members": ["10.99.0.8/32", "10.99.0.9/32", "10.99.0.10/32", "10.99.0.11/32"]}]\n```\n';
  assert(parseFencedJsonBlock(doc, HARVESTED_ALLOCATIONS_MARKER) === null, 'harvested reads ABSENT (it is a table)');
  assert(parseFencedJsonBlock(doc, DERIVED_VALUES_MARKER) !== null, 'derived unaffected');
});

test('parser: prose mention mid-sentence still does NOT match (no over-matching)', () => {
  const doc = 'In this section the derived values are computed as follows, with no block.\n';
  assert(parseFencedJsonBlock(doc, DERIVED_VALUES_MARKER) === null, 'prose mention must not match');
});

// NOTE (corrected 2026-07-29, Run-14): the ORDERING assertion below is unchanged and still correct,
// but its original rationale cited a "terraform/k8s leg" as the beneficiary, which is wrong and is
// the misconception that later made a whole fix INERT. A terraform-iac leg DOES emit a `## Derived
// Values` block (it re-states the chained aggregate), so it takes the `!harvested` branch and stamps
// `harvest-block-missing-or-unparseable` — NOT `no-derived-values-block`. The leg this ordering
// actually protects is one that emits NEITHER block: existence-first keeps it on the benign reason
// instead of the blocking harvest one.
// FINDING-F pin omitted in the package: it reads the platform's enrichment wiring
// (derivation-containment-enrichment.ts), which is not part of this package.

// ── consumed-value-mismatch: check 1 made mechanical (2026-07-31) ───────────────────────────────
// "The policy value exactly equals the aggregate the network leg derived (the chained value, not a
// guess, not a recomputation)" — the ONLY correctness check in the sequenced chain that rested
// entirely on a reviewer reading upstream prose. Check 2b went unperformed on two consecutive runs by
// two different mechanisms, so that is not an assumption worth keeping.

const UPSTREAM = [{ kind: 'cidr', value: '10.99.0.64/31' }];

test('consumed: the Run-16 shape — leg applied exactly what upstream derived ⇒ clean', () => {
  assert(checkConsumedValues([{ kind: 'cidr', value: '10.99.0.64/31' }], UPSTREAM).length === 0,
    'an exact match must not violate');
});

test('consumed: a WIDENING is caught — /30 where upstream derived /31', () => {
  // The class this exists for. Same prefix, one bit looser: authorizes two addresses upstream never
  // sanctioned. A reviewer skimming two reports can read these as "the same value".
  const v = checkConsumedValues([{ kind: 'cidr', value: '10.99.0.64/30' }], UPSTREAM);
  assert(v.length === 1 && v[0].reason === 'consumed-value-mismatch' && v[0].consumed === '10.99.0.64/30',
    `expected a mismatch on the widening, got ${JSON.stringify(v)}`);
  assert(v[0].derived === '10.99.0.64/31',
    'the violation must name what it SHOULD have matched, so the finding is actionable without a second retrieval');
});

test('consumed: a RECOMPUTED different aggregate is caught', () => {
  assert(checkConsumedValues([{ kind: 'cidr', value: '10.99.0.8/31' }], UPSTREAM).length === 1,
    'a value the upstream never derived must violate — this is the recomputation case');
});

test('consumed: CIDR compared by RANGE, not string — equivalent spellings agree', () => {
  // A single-address consumption spelled bare vs /32 is the same range; string equality would
  // false-positive and train everyone to ignore the class.
  assert(checkConsumedValues([{ kind: 'cidr', value: '10.99.0.64' }],
    [{ kind: 'cidr', value: '10.99.0.64/32' }]).length === 0,
    'bare address and /32 are the same range');
});

test('consumed: a KIND mismatch is a mismatch (same string, different kind)', () => {
  assert(checkConsumedValues([{ kind: 'k8s-namespace', value: '10.99.0.64/31' }], UPSTREAM).length === 1,
    'the same text under a different kind is not the same value');
});

test('consumed: EVERY consumed value must match, but not every derived value need be used', () => {
  const twoUpstream = [{ kind: 'cidr', value: '10.99.0.64/31' }, { kind: 'cidr', value: '10.99.0.20/31' }];
  assert(checkConsumedValues([{ kind: 'cidr', value: '10.99.0.64/31' }], twoUpstream).length === 0,
    'a consumer may legitimately apply only one of several derived values');
  assert(checkConsumedValues(
    [{ kind: 'cidr', value: '10.99.0.64/31' }, { kind: 'cidr', value: '10.99.0.99/31' }], twoUpstream).length === 1,
    'but every value it DOES apply must match something upstream derived');
});

test('consumed: ABSENCE is not a mismatch — silence must not manufacture a violation', () => {
  // A leg that declares nothing may simply not consume. Firing here would violate every
  // non-consuming leg on the platform. What absence costs is COVERAGE, recorded as a fact.
  assert(checkConsumedValues([], UPSTREAM).length === 0, 'no consumed values ⇒ no violations');
  assert(checkConsumedValues([{ kind: 'cidr', value: '10.99.0.64/31' }], []).length === 0,
    'no upstream derived values ⇒ nothing to compare against, not a violation');
});

test('consumed: valueless / unparseable entries are skipped, never thrown on', () => {
  assert(checkConsumedValues([{ kind: 'cidr' } as never, { kind: 'cidr', value: '' }], UPSTREAM).length === 0,
    'entries with no value are skipped');
  assert(checkConsumedValues([{ kind: 'cidr', value: 'not-a-cidr' }], UPSTREAM).length === 1,
    'an unparseable CIDR matches no range, so it correctly reports a mismatch rather than throwing');
});

// ── derivedValues: the authoritative value crosses the DAG edge (2026-07-31) ────────────────────
// derivedCount told a consumer THAT a derivation happened, never WHAT it was, so Node C's check 1
// ("the policy value exactly equals the aggregate the network leg derived") rested entirely on a
// reviewer reading upstream PROSE. Check 2b went unperformed on two consecutive runs by two different
// mechanisms — "a reviewer will do it" is not an assumption this codebase can carry.

test('derivedValues transcribes the derived value so it can cross the edge as a FACT', () => {
  const r = checkDerivationContainment(SEEDS, [
    { kind: 'cidr', value: '10.99.0.64/31', members: ['10.99.0.64/32', '10.99.0.65/32'] },
  ]);
  assert(JSON.stringify(r.derivedValues) === JSON.stringify([{ kind: 'cidr', value: '10.99.0.64/31' }]),
    `expected the derived value transcribed, got ${JSON.stringify(r.derivedValues)}`);
});

test('derivedValues: entries with no parseable value are DROPPED, never emitted as undefined', () => {
  // A consumer must never read a placeholder as "the upstream derived nothing here". An entry with no
  // value is already reported via unsupported[]; it must not also appear as a valueless derivedValue.
  const r = checkDerivationContainment(SEEDS, [{ kind: 'cidr', members: [] } as never]);
  assert(r.derivedValues === undefined,
    `a valueless entry must not produce a derivedValues row: ${JSON.stringify(r.derivedValues)}`);
});

test('derivedValues: an UNSUPPORTED kind still transcribes its declared value', () => {
  const r = checkDerivationContainment(SEEDS, [{ kind: 'k8s-namespace', value: 'prod-*' }]);
  // Unsupported kinds still carry a value, so they ARE transcribed — the field records what was
  // declared, not what was checkable. That is deliberate: a consumer comparing values must see a
  // k8s-kind derivation too, and `unsupported[]` is what says "not mechanically covered".
  assert(JSON.stringify(r.derivedValues) === JSON.stringify([{ kind: 'k8s-namespace', value: 'prod-*' }]),
    `unsupported kinds still transcribe their declared value: ${JSON.stringify(r.derivedValues)}`);
});

test('derivedValues: multiple derivations all transcribed, order preserved', () => {
  const r = checkDerivationContainment(SEEDS, [
    { kind: 'cidr', value: '10.99.0.64/31', members: ['10.99.0.64/32', '10.99.0.65/32'] },
    { kind: 'cidr', value: '10.99.0.20/31', members: ['10.99.0.20/32', '10.99.0.21/32'] },
  ]);
  assert(r.derivedValues!.length === 2 && r.derivedValues![0].value === '10.99.0.64/31'
    && r.derivedValues![1].value === '10.99.0.20/31',
    `both values in order: ${JSON.stringify(r.derivedValues)}`);
});

// ── prefix-not-minimal (2026-07-30, RUN-15 shape) ───────────────────────────────────────────────
// Run 15 SHIPPED 10.99.0.8/30 for members .8/.9 — an aligned adjacent pair whose minimal cover is
// /31 — so the S3 policy authorized 4 addresses for 2 exporters. It passed the Author, the leg
// reviewer (92), THIS CHECKER (correctly — minimality was not in its rule set), Node C
// (APPROVED/0 blocking) and the program gate. Containment held, membership held, nothing foreign was
// covered: the other two classes are blind to it by construction. Note the whole corpus above used
// .4/30-over-.4/.5 as its canonical "valid aggregate" — minimality was absent from the tests too.

test('RUN-15 fixture: prefix-not-minimal — /30 declared for an aligned adjacent pair (minimal /31)', () => {
  const r = checkDerivationContainment(SEEDS, [
    { kind: 'cidr', value: '10.99.0.8/30', members: ['10.99.0.8/32', '10.99.0.9/32'] },
  ]);
  const pnm = r.violations!.filter(v => v.reason === 'prefix-not-minimal');
  assert(pnm.length === 1 && pnm[0].derived === '10.99.0.8/30' && pnm[0].minimalPrefixLength === 31,
    `expected one prefix-not-minimal with minimal /31, got ${JSON.stringify(r.violations)}`);
  // And it must NOT be reported as either older class — those premises genuinely hold here.
  assert(r.violations!.filter(v => v.reason !== 'prefix-not-minimal').length === 0,
    `only the minimality class should fire: ${JSON.stringify(r.violations)}`);
});

test('prefix-not-minimal: the MINIMAL aggregate for the same pair is clean', () => {
  const r = checkDerivationContainment(SEEDS, [
    { kind: 'cidr', value: '10.99.0.8/31', members: ['10.99.0.8/32', '10.99.0.9/32'] },
  ]);
  assert(r.violations!.length === 0, `/31 IS minimal for .8/.9: ${JSON.stringify(r.violations)}`);
});

test('prefix-not-minimal: NOT fired when the loose-looking prefix IS the minimum for its members', () => {
  // .8 + .11 span four addresses, so /30 is genuinely minimal — a straddling pair legitimately
  // needs the wider prefix. This is the false-positive the class must never produce (the .1/.2
  // straddle in the RUN-5 fixture is the same arithmetic).
  const r = checkDerivationContainment(SEEDS, [
    { kind: 'cidr', value: '10.99.0.8/30', members: ['10.99.0.8/32', '10.99.0.11/32'] },
  ]);
  assert(r.violations!.filter(v => v.reason === 'prefix-not-minimal').length === 0,
    `/30 IS minimal for .8+.11: ${JSON.stringify(r.violations)}`);
});

test('prefix-not-minimal: suppressed when a member is not covered at all (broken premise)', () => {
  // member-not-covered means the derivation's arithmetic is already wrong; computing "minimal" over
  // members the aggregate does not contain would report a second, misleading violation.
  const r = checkDerivationContainment(SEEDS, [
    { kind: 'cidr', value: '10.99.0.0/31', members: ['10.99.0.1/32', '10.99.0.2/32'] },
  ]);
  assert(r.violations!.some(v => v.reason === 'member-not-covered'), 'member-not-covered must fire');
  assert(r.violations!.filter(v => v.reason === 'prefix-not-minimal').length === 0,
    `minimality must stay silent on a broken premise: ${JSON.stringify(r.violations)}`);
});

test('minimalCoveringPrefixLength: arithmetic, not adjacency', () => {
  assert(minimalCoveringPrefixLength(['10.99.0.8/32', '10.99.0.9/32']) === 31, 'aligned pair ⇒ /31');
  assert(minimalCoveringPrefixLength(['10.99.0.1/32', '10.99.0.2/32']) === 30, 'straddling pair ⇒ /30');
  assert(minimalCoveringPrefixLength(['10.99.0.8/32']) === 32, 'single /32 ⇒ /32');
  assert(minimalCoveringPrefixLength(['10.99.0.8']) === 32, 'bare address ⇒ /32');
  assert(minimalCoveringPrefixLength([]) === null, 'no members ⇒ null, never a number');
  assert(minimalCoveringPrefixLength(['not-a-cidr']) === null, 'unparseable ⇒ null, never 0');
});

// ── Consuming-leg attribution predicate (2026-07-29, Run-14 false park) ─────────────────────────
// A CONSUMING leg (terraform-iac) re-emits the chained aggregate — so a `## Derived Values` block IS
// present — but harvests bucket/state, so it has no parseable `## Harvested Allocations` and lands on
// `harvest-block-missing-or-unparseable`. A DERIVING leg whose CIDR harvest is genuinely BROKEN lands
// on the SAME reason. This predicate is the only thing separating them, so its edges are load-bearing.

test('attribution: a clean deriving upstream ⇒ green (the Run-14 consuming-leg shape)', () => {
  assert(isUpstreamContainmentGreen([{ taskId: 'p1', checked: true, violations: 0 }]) === true,
    'a consumer downstream of a machine-checked clean derivation must qualify');
});

test('attribution FAIL-CLOSED: no upstream legs ⇒ NOT green (the broken-harvest deriver)', () => {
  assert(isUpstreamContainmentGreen([]) === false,
    'empty upstream must NOT qualify — this is exactly the DERIVING leg with a genuinely broken CIDR harvest, which stamps the same reason and MUST keep blocking');
});

test('attribution: an upstream that never checked ⇒ NOT green', () => {
  assert(isUpstreamContainmentGreen([{ taskId: 'p1', checked: false, violations: 0 }]) === false,
    'checked:false upstream is not a discharged obligation — no derivation was verified anywhere');
});

test('attribution: any upstream violation ⇒ NOT green, even alongside a clean sibling', () => {
  assert(isUpstreamContainmentGreen([
    { taskId: 'p1', checked: true, violations: 0 },
    { taskId: 'p2', checked: true, violations: 1 },
  ]) === false,
    'ALL-predecessors semantics: a clean sibling must never mask a predecessor carrying a violation (multi-upstream program)');
});

test('attribution: violation-carrying upstream alone ⇒ NOT green', () => {
  assert(isUpstreamContainmentGreen([{ taskId: 'p1', checked: true, violations: 2 }]) === false,
    'a violating upstream can never discharge a downstream obligation');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// kind: "asn"  (2026-08-02 — the second kind; panel cline_docs/reviews/asn-kind-2026-08-02/)
// ─────────────────────────────────────────────────────────────────────────────────────────────

const H_ASN: HarvestedAllocation[] = [
  { kind: 'asn', asn: 65001, device: 'ceos1', source: "fetch_data(getters=['bgp_config'])" },
  { kind: 'asn', asn: 65002, device: 'ceos2', source: "fetch_data(getters=['bgp_config'])" },
];

test('asn: a derived ASN present in the harvest is clean', () => {
  const r = checkDerivationContainment(H_ASN, [{ kind: 'asn', value: 65001, device: 'ceos1' }]);
  assert((r.violations || []).length === 0, `expected clean, got ${JSON.stringify(r.violations)}`);
});

test('asn-not-member: an ASN that appears nowhere in the harvest is a violation (the injection shape)', () => {
  const r = checkDerivationContainment(H_ASN, [{ kind: 'asn', value: 64999, device: 'ceos1' }]);
  assert((r.violations || []).some(v => v.reason === 'asn-not-member' && v.derived === '64999'),
    'an ASN with no harvest provenance must not pass');
});

test('asn containment is DEVICE-SCOPED: right ASN, wrong device is a violation', () => {
  // 65002 IS harvested — but from ceos2. Claiming it for ceos1 must not pass, or one compromised
  // device authorizes another (sec-ops F6).
  const r = checkDerivationContainment(H_ASN, [{ kind: 'asn', value: 65002, device: 'ceos1' }]);
  assert((r.violations || []).some(v => v.reason === 'asn-not-member'),
    'fabric-wide membership would wrongly clear this');
});

test('asn: a derivation naming no device falls back to fabric-wide and RECORDS the weaker check', () => {
  const r = checkDerivationContainment(H_ASN, [{ kind: 'asn', value: 65002 }]);
  assert((r.violations || []).length === 0, 'fabric-wide match should clear');
  const dv = (r.derivedValues || []).find(d => d.kind === 'asn');
  assert(!!dv, 'the value must still be transcribed');
});

test('asn-reserved-range: AS 0 is caught — the falsy value the truthiness idiom would skip', () => {
  const r = checkDerivationContainment([{ kind: 'asn', asn: 0, device: 'ceos1' }],
                                       [{ kind: 'asn', value: 0, device: 'ceos1' }]);
  assert((r.violations || []).some(v => v.reason === 'asn-reserved-range' && v.policyClass === 'reserved'),
    'AS 0 is reserved (RFC 7607) and must not be skipped for being falsy');
});

test('asn-reserved-range: AS_TRANS and documentation ranges block', () => {
  for (const [asn, cls] of [[23456, 'as-trans'], [64496, 'documentation'], [65540, 'documentation']] as const) {
    const r = checkDerivationContainment([{ kind: 'asn', asn, device: 'd' }],
                                         [{ kind: 'asn', value: asn, device: 'd' }]);
    assert((r.violations || []).some(v => v.reason === 'asn-reserved-range' && v.policyClass === cls),
      `${asn} should be ${cls}`);
  }
});

test('PROTOCOL 10: a PUBLIC ASN is NOT a violation — the verdict half is deliberately not shipped', () => {
  // "public therefore not yours" rests on an ownership claim we do not hold; it would false-block
  // every customer who peers with anyone. The class is computed, never blocking (arch F1 + sec-ops F5).
  const r = checkDerivationContainment([{ kind: 'asn', asn: 15169, device: 'd' }],
                                       [{ kind: 'asn', value: 15169, device: 'd' }]);
  assert(asnPolicyClass(15169) === 'public', 'the class must still be computed');
  assert((r.violations || []).length === 0, 'a public ASN must not block');
});

test('asn: private ranges are not violations', () => {
  assert(asnPolicyClass(64512) === 'private-2byte', '64512 is private 2-byte');
  assert(asnPolicyClass(4200000000) === 'private-4byte', '4200000000 is private 4-byte');
  const r = checkDerivationContainment([{ kind: 'asn', asn: 64512, device: 'd' }],
                                       [{ kind: 'asn', value: 64512, device: 'd' }]);
  assert((r.violations || []).length === 0, 'a private ASN in the harvest is clean');
});

test('FAIL-OPEN FIX: a NUMERIC asn value reaches derivedValues instead of vanishing', () => {
  const r = checkDerivationContainment(H_ASN, [{ kind: 'asn', value: 65001, device: 'ceos1' }]);
  const dv = (r.derivedValues || []).find(d => d.kind === 'asn');
  assert(!!dv && dv.value === '65001',
    `numeric ASN must transcribe as canonical asplain, got ${JSON.stringify(r.derivedValues)}`);
});

test('asn: unparseable values land in unsupported[], never a silent pass', () => {
  const r = checkDerivationContainment(H_ASN, [{ kind: 'asn', value: 'not-an-asn', device: 'ceos1' }]);
  assert((r.unsupported || []).some(u => u.kind === 'asn'), 'must be reported as unsupported');
  assert(!(r.violations || []).some(v => v.reason === 'asn-not-member'),
    'an unparseable value is a coverage gap, not a membership claim');
});

test('parseAsn: unquoted asdot is LOSSY and must be rejected, not coerced', () => {
  // JSON.parse('{"asn":1.10}') === 1.1, so 1.10 (65546) and 1.1 (65537) collide irrecoverably.
  assert(parseAsn(1.1) === null, 'a non-integer number cannot be a trustworthy ASN');
  assert(parseAsn('1.10') === 65546, 'QUOTED asdot is unambiguous and is accepted');
  assert(parseAsn('1.1') === 65537, 'quoted 1.1 is a different ASN from quoted 1.10');
});

test('parseAsn: bounds and junk', () => {
  assert(parseAsn(0) === 0, 'AS 0 parses to 0, not null');
  assert(parseAsn(4294967295) === 4294967295, 'the 4-byte ceiling parses');
  assert(parseAsn(4294967296) === null, 'above the ceiling is rejected');
  assert(parseAsn(-1) === null && parseAsn('') === null && parseAsn(null) === null, 'junk is null');
});

test('NO BITWISE: 4-byte ASNs survive classification (the << / |0 trap)', () => {
  // 65535 << 16 === -65536 and 4294967295 | 0 === -1; a bitwise implementation misclassifies both.
  assert(asnPolicyClass(4294967295) === 'reserved', '4294967295 is reserved, not negative');
  assert(asnPolicyClass(4200000000) === 'private-4byte', 'high 4-byte ASNs must classify correctly');
});

test('checkConsumedValues: asn matches across notations instead of string-comparing', () => {
  const mismatches = checkConsumedValues(
    [{ kind: 'asn', value: '1.10' }],              // quoted asdot
    [{ kind: 'asn', value: '65546' }]              // canonical asplain
  );
  assert(mismatches.length === 0,
    'the SAME ASN in two notations must not raise a spurious hard block');
});

test('checkConsumedValues: a genuinely different asn still mismatches', () => {
  const mismatches = checkConsumedValues(
    [{ kind: 'asn', value: '65003' }],
    [{ kind: 'asn', value: '65001' }]
  );
  assert(mismatches.some(m => m.reason === 'consumed-value-mismatch'),
    'a real cross-edge divergence must still be caught');
});

test('BACK-COMPAT: a cidr-only run is byte-identical to before the asn kind existed', () => {
  const h: HarvestedAllocation[] = [{ kind: 'cidr', cidr: '10.99.0.2/32', device: 'ceos1' }];
  const d: DerivedValue[] = [{ kind: 'cidr', value: '10.99.0.100/31', members: ['10.99.0.100/32', '10.99.0.101/32'] }];
  const r = checkDerivationContainment(h, d);
  assert(JSON.stringify(r) === JSON.stringify({
    checked: true, harvestedCount: 1, derivedCount: 1,
    derivedValues: [{ kind: 'cidr', value: '10.99.0.100/31' }],
    violations: [],
  }), `cidr shape changed: ${JSON.stringify(r)}`);
});

test('a kind-less NUMERIC entry defaults to cidr and fails CLOSED into unsupported', () => {
  // The seven `?? 'cidr'` defaults are defence-by-ACCIDENT here (arch F5). Pinned so a future
  // change that makes them fail open is caught. The contract mandates an explicit kind.
  const r = checkDerivationContainment(H_ASN, [{ value: 65001 } as DerivedValue]);
  assert((r.unsupported || []).some(u => u.kind === 'cidr'),
    'a kind-less numeric must not be silently accepted as anything');
});

test('asnToCanonical: canonicalization is what makes the edge comparison a plain equality', () => {
  assert(asnToCanonical(65001) === '65001', 'number → asplain string');
  assert(asnToCanonical('1.10') === '65546', 'quoted asdot → asplain string');
  assert(asnToCanonical('nope') === null, 'unparseable → null, never a fabricated string');
});

test('ph F1: an ASN-only harvest yields NO harvestedCount — the false-park guard', () => {
  // The A7 taxonomy reads harvestedCount PRESENT as "harvested an address pool and derived nothing
  // ⇒ REFUSED ⇒ BLOCKING". A BGP-audit leg that harvests ASNs and derives nothing must NOT be
  // classified a refusal — that would be a false programReleasable:false on a clean run.
  const c = harvestCounts([
    { kind: 'asn', asn: 65001, device: 'ceos1' },
    { kind: 'asn', asn: 65002, device: 'ceos2' },
  ]);
  assert(c.harvestedCount === undefined,
    `an ASN-only harvest must not present an address-pool count, got ${JSON.stringify(c)}`);
  assert(c.harvestedByKind?.asn === 2, 'the ASN census must still be recorded');
});

test('ph F1: an EMPTY harvest block still yields harvestedCount 0 (absent != zero preserved)', () => {
  const c = harvestCounts([]);
  assert(c.harvestedCount === 0,
    'an empty block means the leg LOOKED and found nothing — still a deriving leg');
});

test('ph F1: a cidr harvest is byte-identical to before harvestedByKind existed', () => {
  const c = harvestCounts([
    { kind: 'cidr', cidr: '10.99.0.2/32' },
    { cidr: '10.99.0.6/32' },              // kind-less legacy entry defaults to cidr
  ]);
  assert(c.harvestedCount === 2, `legacy count must not change, got ${c.harvestedCount}`);
  assert(c.harvestedByKind === undefined,
    'a cidr-only harvest must NOT gain a census key — redundant, and it breaks byte-identical ' +
    'back-compat on an object kept small to survive head-slice truncation');
});

test('ph F1: a MIXED harvest counts only the cidr entries for the deriving test', () => {
  const c = harvestCounts([
    { kind: 'cidr', cidr: '10.99.0.2/32' },
    { kind: 'asn', asn: 65001 },
  ]);
  assert(c.harvestedCount === 1, `deriving test is cidr-only, got ${c.harvestedCount}`);
  assert(c.harvestedByKind?.asn === 1 && c.harvestedByKind?.cidr === 1, 'both kinds censused');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// CONTAINMENT DISPOSITION (2026-08-03) — the consuming-leg exception, mechanised.
// Every case below is a taxonomy clause that used to be prose an LLM evaluated at runtime.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('D1: CLAUSE 1 DOMINANCE — violations block regardless of an otherwise-benign shape', () => {
  // The arch c-iii pair: soft reason + ABSENT harvestedCount + green upstream would ALL read benign,
  // and a violation still blocks. This is the case Runs 17/18/20 stamped the shape for.
  const d = computeContainmentDisposition({
    checked: false, reason: 'no-derived-values-block',
    upstreamContainment: { green: true },
    violations: [{ reason: 'consumed-value-mismatch' }],
  });
  assert(d.disposition === 'blocking' && d.reason === 'violations', JSON.stringify(d));
});

test('D2: violations dominate the consuming-leg exception too (arch c-ii)', () => {
  const d = computeContainmentDisposition({
    checked: false, reason: 'harvest-block-missing-or-unparseable',
    upstreamContainment: { green: true },
    violations: [{ reason: 'consumed-value-mismatch' }],
  });
  assert(d.disposition === 'blocking' && d.reason === 'violations', JSON.stringify(d));
});

test('D3: unsupported ⇒ needs-node-c, NOT a hard block (G5 — a boolean would have decided this)', () => {
  const d = computeContainmentDisposition({ checked: true, violations: [], unsupported: [{ kind: 'vlan' }] });
  assert(d.disposition === 'needs-node-c', JSON.stringify(d));
});

test('D4: A7 SPECIMEN A reclassified (cross-port ① Shape A, 2026-08-16) — pool harvested, nothing derived ⇒ needs-node-c, never benign', () => {
  // Was `blocking 'refusal-or-drop'`. With harvest blocks a cross-domain contract, this shape is
  // ambiguous between an audit objective (tf S3/IAM/tags harvesting VPC state) and a real refusal
  // (VT-11, runs 2/3) — the disposition escalates instead of asserting refusal. Fail-closed holds:
  // needs-node-c is never releasable without Node C discharging it.
  const d = computeContainmentDisposition({
    checked: false, reason: 'no-derived-values-block', harvestedCount: 6, harvestedByKind: { cidr: 6 },
  });
  assert(d.disposition === 'needs-node-c' && d.reason === 'harvested-pool-no-derivation-cannot-decide',
    JSON.stringify(d));
});

test('D4f: ZERO-ENTRY POOL ⇒ benign harvested-pool-empty — an empty pool has no refusal ambiguity', () => {
  // The commonest cross-domain non-deriving shape (bucket/IAM/tag harvest: block parses as []).
  // 0 and ABSENT stay distinct reasons (harvested-pool-empty vs nothing-to-derive) per the A7
  // absent-vs-zero note; > 0 still escalates (D4).
  const d = computeContainmentDisposition({
    checked: false, reason: 'no-derived-values-block', harvestedCount: 0, harvestedByKind: {},
  });
  assert(d.disposition === 'benign' && d.reason === 'harvested-pool-empty', JSON.stringify(d));
});

test('D4b: consuming-leg discharge (cross-port ① Shape B) — consumedValues + upstream green ⇒ benign despite a harvested pool', () => {
  // The post-port tf consuming shape: emits a harvest block (cross-domain contract), derives
  // nothing, declares `## Consumed Values`, upstream containment green. Before this arm it was
  // unreachable from the harvest-missing exception and landed blocking (Tasman false-park class).
  const d = computeContainmentDisposition({
    checked: false, reason: 'no-derived-values-block', harvestedCount: 6, harvestedByKind: { cidr: 6 },
    consumedValues: [{ kind: 'cidr', value: '10.99.0.64/31' }],
    upstreamContainment: { green: true },
  });
  assert(d.disposition === 'benign' && d.reason === 'consuming-leg-consumed-discharged', JSON.stringify(d));
  assert((d.inputs as { consumedCount?: number }).consumedCount === 1, 'consumedCount recorded in inputs');
});

test('D4c: FAIL CLOSED — consuming shape with upstream green:false ⇒ blocking (never weaker than the sibling arm)', () => {
  const d = computeContainmentDisposition({
    checked: false, reason: 'no-derived-values-block', harvestedCount: 6,
    consumedValues: [{ kind: 'cidr', value: '10.99.0.64/31' }],
    upstreamContainment: { green: false },
  });
  assert(d.disposition === 'blocking' && d.reason === 'consuming-leg-upstream-not-green', JSON.stringify(d));
});

test('D4d: FAIL CLOSED — consumed declared but upstream ABSENT ⇒ falls to needs-node-c, never benign', () => {
  // Defensive: the enrichment only stamps consumedValues when report.md predecessors exist, but the
  // disposition is a pure function — an absent upstreamContainment must not discharge anything.
  const d = computeContainmentDisposition({
    checked: false, reason: 'no-derived-values-block', harvestedCount: 6,
    consumedValues: [{ kind: 'cidr', value: '10.99.0.64/31' }],
  });
  assert(d.disposition === 'needs-node-c' && d.reason === 'harvested-pool-no-derivation-cannot-decide',
    JSON.stringify(d));
});

test('D4e: CLAUSE-1 DOMINANCE — a consumed-value-mismatch violation blocks BEFORE the discharge arm', () => {
  const d = computeContainmentDisposition({
    checked: false, reason: 'no-derived-values-block', harvestedCount: 6,
    consumedValues: [{ kind: 'cidr', value: '10.99.0.64/30' }],
    upstreamContainment: { green: true },
    violations: [{ reason: 'consumed-value-mismatch' }],
  });
  assert(d.disposition === 'blocking' && d.reason === 'violations',
    `a green upstream must not mask a mismatch: ${JSON.stringify(d)}`);
});

test('D5: A7 SPECIMEN B — nothing to derive. harvestedCount ABSENT ⇒ benign', () => {
  // D4 and D5 differ in ONE field and must produce OPPOSITE verdicts — 436d6d6d's standing rule that
  // a single specimen is never sufficient evidence here.
  const d = computeContainmentDisposition({ checked: false, reason: 'no-derived-values-block' });
  assert(d.disposition === 'benign' && d.reason === 'nothing-to-derive', JSON.stringify(d));
});

test('D6: A4 RESIDUAL — a non-CIDR-only harvest cannot be decided, so escalate (never benign)', () => {
  const d = computeContainmentDisposition({
    checked: false, reason: 'no-derived-values-block', harvestedByKind: { asn: 6 },
  });
  assert(d.disposition === 'needs-node-c' && d.reason === 'non-cidr-only-harvest-cannot-decide',
    `an ASN-only refusal must never read benign: ${JSON.stringify(d)}`);
});

// ── CONSUMER-FAIL-OPEN (2026-10-03, pattern (h) batch 2) ─────────────────────────────────────────
// A CONSUMING leg (upstream resolved) whose `## Consumed Values` block did not parse used to read
// `benign nothing-to-derive`, so check 1 never ran and the gate conjunct read benign. The two
// fixtures are the LIVE stamps of both instances, verbatim minus the disposition they were stamped
// with (that is what is being recomputed). Measured before building: the arm moves exactly the 4
// upstream-carrying `nothing-to-derive` legs since 09-15 and 0 of the 41 without an upstream.
const CFO_LIVE_RUN5_OBS = { // 2026-10-03 obs, Run 5 — `cmurpr9sj00poyxxaeywagi0a`, pipeline-index.json
  reason: 'no-derived-values-block', checked: false,
  derivedSource: 'cmurq5m3v02k5yxx9sj8lxwng', harvestSource: 'cmurq582i02ieyxx9s9xfi999',
  upstreamContainment: { green: true, legs: [{ taskId: 'cmurpovk000osyxxab3ll84a2', checked: true, violations: 0,
    disposition: 'benign', dispositionReason: 'checked-clean', derivedValues: [{ kind: 'cidr', value: '10.99.0.0/27' }] }] },
};
const CFO_LIVE_0919_OBS = { // 2026-09-19 obs — `cmu7xmfhb005fyxgzxro3u4b7`, pipeline-index.json
  reason: 'no-derived-values-block', checked: false,
  derivedSource: 'cmu7z9ju400g8yxgzm4sfa5xe', harvestSource: 'cmu7z8shn00emyxgzqt9gbejf',
  upstreamContainment: { green: true, legs: [{ taskId: 'cmu7xketu004ayxgzibyal6q3', checked: true, violations: 0,
    disposition: 'benign', dispositionReason: 'checked-clean', derivedValues: [
      { kind: 'cidr', value: '10.99.0.0/27' }, { kind: 'asn', value: '65001' }, { kind: 'asn', value: '65002' }] }] },
};

test('CFO-1: LIVE Run 5 obs (10-03) — consuming leg, no consumed block ⇒ needs-node-c consuming-leg-no-consumed-block, never benign', () => {
  const d = computeContainmentDisposition(CFO_LIVE_RUN5_OBS);
  assert(d.disposition === 'needs-node-c' && d.reason === 'consuming-leg-no-consumed-block', JSON.stringify(d));
  assert(d.inputs.upstreamContainmentGreen === true && d.inputs.consumedCount === undefined,
    `the deciding inputs must be recorded so the escalation is replay-auditable: ${JSON.stringify(d.inputs)}`);
});

test('CFO-2: LIVE 09-19 obs (second instance) — same shape, same answer', () => {
  const d = computeContainmentDisposition(CFO_LIVE_0919_OBS);
  assert(d.disposition === 'needs-node-c' && d.reason === 'consuming-leg-no-consumed-block', JSON.stringify(d));
});

test('CFO-3: upstream resolved but NOT green, nothing consumed ⇒ same escalation (an upstream exists either way)', () => {
  const d = computeContainmentDisposition({ ...CFO_LIVE_RUN5_OBS,
    upstreamContainment: { green: false, legs: [{ taskId: 'u', checked: false, violations: 0 }] } });
  assert(d.disposition === 'needs-node-c' && d.reason === 'consuming-leg-no-consumed-block', JSON.stringify(d));
});

test('CFO-4: a consumed block that PARSED EMPTY declared nothing — escalates like an absent one', () => {
  const d = computeContainmentDisposition({ ...CFO_LIVE_RUN5_OBS, consumedValues: [] });
  assert(d.disposition === 'needs-node-c' && d.reason === 'consuming-leg-no-consumed-block', JSON.stringify(d));
});

test('CFO-5 CONTROL: a NON-consumer (no upstream resolved) with nothing to derive stays benign nothing-to-derive', () => {
  // The 41-of-41 population. Same live fact with the upstream removed — one field apart from CFO-1,
  // opposite answers (436d6d6d: a single specimen is never sufficient evidence here).
  const { upstreamContainment: _u, ...nonConsumer } = CFO_LIVE_RUN5_OBS;
  const d = computeContainmentDisposition(nonConsumer);
  assert(d.disposition === 'benign' && d.reason === 'nothing-to-derive', JSON.stringify(d));
});

test('CFO-6 CONTROL: a consumer WITH a parsed consumed block stays benign consuming-leg-consumed-discharged', () => {
  const d = computeContainmentDisposition({ ...CFO_LIVE_RUN5_OBS, consumedValues: [{ kind: 'cidr', value: '10.99.0.0/27' }] });
  assert(d.disposition === 'benign' && d.reason === 'consuming-leg-consumed-discharged', JSON.stringify(d));
});

test('CFO-7 SCOPE: the arm is LAST — a consumer on the empty-pool / cannot-decide arms keeps its answer', () => {
  // Records the decided scope (only legs that read `nothing-to-derive` move), not a claim that these
  // arms are right for a consumer. Widening the arm is a separate, measured decision.
  const empty = computeContainmentDisposition({ ...CFO_LIVE_RUN5_OBS, harvestedCount: 0, harvestedByKind: {} });
  assert(empty.disposition === 'benign' && empty.reason === 'harvested-pool-empty', JSON.stringify(empty));
  const pool = computeContainmentDisposition({ ...CFO_LIVE_RUN5_OBS, harvestedCount: 6 });
  assert(pool.reason === 'harvested-pool-no-derivation-cannot-decide', JSON.stringify(pool));
});

test('CFO-8: CLAUSE-1 DOMINANCE still holds on the new arm — a violation blocks first', () => {
  const d = computeContainmentDisposition({ ...CFO_LIVE_RUN5_OBS, violations: [{ reason: 'consumed-value-mismatch' }] });
  assert(d.disposition === 'blocking' && d.reason === 'violations', JSON.stringify(d));
});

test('D7: consuming-leg exception — benign ONLY on an explicit green:true', () => {
  const d = computeContainmentDisposition({
    checked: false, reason: 'harvest-block-missing-or-unparseable', upstreamContainment: { green: true },
  });
  assert(d.disposition === 'benign' && d.reason === 'consuming-leg-upstream-discharged', JSON.stringify(d));
});

test('D8: FAIL CLOSED — green:false blocks', () => {
  const d = computeContainmentDisposition({
    checked: false, reason: 'harvest-block-missing-or-unparseable', upstreamContainment: { green: false },
  });
  assert(d.disposition === 'blocking' && d.reason === 'consuming-leg-upstream-not-green', JSON.stringify(d));
});

test('D9: FAIL CLOSED — upstreamContainment ABSENT blocks, and says so distinguishably', () => {
  // R5 (2026-10-05): with nothing upstream at all the reason no longer claims a consuming leg.
  const d = computeContainmentDisposition({ checked: false, reason: 'harvest-block-missing-or-unparseable' });
  assert(d.disposition === 'blocking' && d.reason === 'harvest-missing-or-unparseable-no-upstream', JSON.stringify(d));
  assert(!('upstreamDeliverableMissing' in d.inputs), 'inputs must stay byte-identical when the count is absent');
});

// R5 LIVE SHAPES — the two production stamps that read `consuming-leg-upstream-absent` (2026-08-22 network
// cmt3s3mqn001syxmfwz5tj050, 2026-09-16 k8s podrange cmu3d3jcr001dyxe33yrqhrh4), verbatim minus the
// disposition. Neither leg had a PIPELINE dependency edge or any chained entry: both PRODUCED.
const R5_LIVE_0822_NET = { reason: 'harvest-block-missing-or-unparseable', checked: false,
  derivedSource: 'cmt3s9b3y005byxmg9bhadpms', harvestSource: 'cmt3s8qh2004jyxmg9cvyi034' };
const R5_LIVE_0916_K8S = { reason: 'harvest-block-missing-or-unparseable', checked: false,
  derivedSource: 'cmu3ddtyu004nyxe35ni8ti60', harvestSource: 'cmu3dcxh7003byxe3wtv6jqic' };

test('D9-R5a: both live producing-leg stamps now name what is true — blocking, no upstream implied', () => {
  for (const f of [R5_LIVE_0822_NET, R5_LIVE_0916_K8S]) {
    const d = computeContainmentDisposition(f);
    assert(d.disposition === 'blocking' && d.reason === 'harvest-missing-or-unparseable-no-upstream', JSON.stringify(d));
    assert(JSON.stringify(d.inputs) === JSON.stringify({ reason: 'harvest-block-missing-or-unparseable', violationCount: 0, unsupportedCount: 0 }),
      `inputs must be byte-identical to the live stamp: ${JSON.stringify(d.inputs)}`);
  }
});

test('D9-R5b: the old name stays where it is TRUE — a chained PIPELINE predecessor whose deliverable never arrived', () => {
  const d = computeContainmentDisposition({ ...R5_LIVE_0916_K8S, upstreamDeliverableMissing: 1 });
  assert(d.disposition === 'blocking' && d.reason === 'consuming-leg-upstream-absent', JSON.stringify(d));
  assert(d.inputs.upstreamDeliverableMissing === 1, 'the separating input is transcribed');
});

test('D9-R5c: the count never weakens a block — zero, or with green set, the green arms still decide', () => {
  const zero = computeContainmentDisposition({ ...R5_LIVE_0916_K8S, upstreamDeliverableMissing: 0 });
  assert(zero.disposition === 'blocking' && zero.reason === 'harvest-missing-or-unparseable-no-upstream', JSON.stringify(zero));
  const green = computeContainmentDisposition({ ...R5_LIVE_0916_K8S, upstreamDeliverableMissing: 2, upstreamContainment: { green: true } });
  assert(green.disposition === 'benign' && green.reason === 'consuming-leg-upstream-discharged', JSON.stringify(green));
  const red = computeContainmentDisposition({ ...R5_LIVE_0916_K8S, upstreamDeliverableMissing: 2, upstreamContainment: { green: false } });
  assert(red.disposition === 'blocking' && red.reason === 'consuming-leg-upstream-not-green', JSON.stringify(red));
  const viol = computeContainmentDisposition({ ...R5_LIVE_0916_K8S, upstreamDeliverableMissing: 1, violations: [{ reason: 'covered-not-member' }] });
  assert(viol.disposition === 'blocking' && viol.reason === 'violations', JSON.stringify(viol));
});

test('D10: hard-gap reasons block, including the two moved there by arch F1', () => {
  // `no-author-child` LEFT this set on 2026-08-27 — it is undecidable at leg tier, not a hard gap.
  // See D10b/D10c/D10d. The three below are still genuinely "should have run and didn't".
  for (const reason of ['enrichment-error', 'no-child-stage', 'no-harvest-child']) {
    const d = computeContainmentDisposition({ checked: false, reason });
    assert(d.disposition === 'blocking' && d.reason === 'hard-gap', `${reason}: ${JSON.stringify(d)}`);
  }
});

test('H-2 predicate: a `via` (transitive) leg counts exactly like a direct one — clean deriving via-leg ⇒ green; any via-leg violation ⇒ not green', () => {
  assert(isUpstreamContainmentGreen([
    { taskId: 'p2', checked: false, violations: 0 },
    { taskId: 'p1', checked: true, violations: 0, via: 'p2' },
  ]) === true, 'clean deriving leg reached via a hop must make the list green');
  assert(isUpstreamContainmentGreen([
    { taskId: 'p2', checked: false, violations: 0 },
    { taskId: 'p1', checked: true, violations: 1, via: 'p2' },
  ]) === false, 'a violation anywhere in the chain must block (every-half)');
  assert(isUpstreamContainmentGreen([{ taskId: 'p2', checked: false, violations: 0 }]) === false,
    'a lone consuming hop with nothing flattened stays not green (the pre-fix reading, kept for invariant 2)');
});

test('D10e: program-tier is benign with its own reason — a program parent has no harvest child BY CONSTRUCTION (H-3)', () => {
  // 2026-09-09: the enrichment ran on PROGRAM parents (type PIPELINE, mode SYNTHESIZE) and stamped
  // no-harvest-child → hard-gap on every program's own card (3 of 3 on devext). Structurally
  // inapplicable ≠ "should have run and could not"; the program gate reads its CHILDREN's facts.
  const d = computeContainmentDisposition({ checked: false, reason: 'program-tier' });
  assert(d.disposition === 'benign' && d.reason === 'program-tier-inapplicable', JSON.stringify(d));
  assert((d.inputs as { reason?: string }).reason === 'program-tier', JSON.stringify(d.inputs));
  // NEGATIVE CONTROL: the leg reason is untouched — a leg missing its harvester still hard-gaps.
  const leg = computeContainmentDisposition({ checked: false, reason: 'no-harvest-child' });
  assert(leg.disposition === 'blocking' && leg.reason === 'hard-gap', JSON.stringify(leg));
});

test('D10b: no-author-child escalates to needs-node-c with the SUBJECT NAMED', () => {
  // The fix for IGP-T1 R12/R15: an evidence-only leg has no author child BY DESIGN, an authoring leg
  // whose author failed to spawn has none BY FAILURE, and nothing at leg tier separates them.
  // Escalate, do not decide. Panel record: containment-no-author-child-fork-2026-08-27.
  const d = computeContainmentDisposition({ checked: false, reason: 'no-author-child' });
  assert(d.disposition === 'needs-node-c', JSON.stringify(d));
  // F7 (VT-14 Run 23): a needs-node-c naming no subject gets discharged against whatever evidence is
  // nearest. The reason must say what is being asked, so this pin is on the STRING, not just the state.
  assert(d.reason === 'no-author-child-leg-kind-undecidable', JSON.stringify(d));
  // Raw reason retained in inputs so the disposition stays replay-auditable (Protocol 10).
  assert((d.inputs as { reason?: string }).reason === 'no-author-child', JSON.stringify(d.inputs));
});

test('D10c: NEGATIVE CONTROL — no-author-child must NOT be benign, and must NOT be reachable as one', () => {
  // The whole point of choosing needs-node-c over a benign skip: needs-node-c fails CLOSED on Node C
  // inattention (VT-14 blocked over green legs), a benign pass does not. If a future edit adds
  // 'no-author-child' to BENIGN_CANDIDATE_REASONS this fails, which is the intent.
  const d = computeContainmentDisposition({ checked: false, reason: 'no-author-child' });
  assert(d.disposition !== 'benign', `no-author-child must never be benign: ${JSON.stringify(d)}`);
  assert(d.disposition !== 'blocking', `regressed to blocking — R12/R15 false-park returns: ${JSON.stringify(d)}`);
});

test('D10d: CONTRADICTION TRIPWIRE — no-author-child + derived values BLOCKS, never escalates', () => {
  // A leg that derived values is not the ambiguous case: "evidence-only by design" is refuted by its
  // own output. Escalating this to Node C would hand it the one shape it must not be asked to excuse.
  const d = computeContainmentDisposition({
    checked: false, reason: 'no-author-child',
    derivedValues: [{ kind: 'cidr', value: '10.99.0.0/30' }],
  });
  assert(d.disposition === 'blocking' && d.reason === 'no-author-child-but-leg-derived-values', JSON.stringify(d));
  // Ordering pin: the tripwire must sit BEFORE the escalation arm. An empty array is NOT a contradiction.
  const empty = computeContainmentDisposition({ checked: false, reason: 'no-author-child', derivedValues: [] });
  assert(empty.disposition === 'needs-node-c', `empty derivedValues is not a contradiction: ${JSON.stringify(empty)}`);
});

test('D10e: CLAUSE 1 DOMINANCE still outranks the new arms', () => {
  // A violation beats everything, including the new escalation. Never reorder below an exception arm.
  const d = computeContainmentDisposition({
    checked: false, reason: 'no-author-child',
    violations: [{ kind: 'cidr', class: 'member-not-covered' }],
  });
  assert(d.disposition === 'blocking' && d.reason === 'violations', JSON.stringify(d));
});

test('D11: G6 — an UNRECOGNISED reason falls through to blocking, visibly', () => {
  // The reason string varied across three consecutive runs for the same leg type (VT-13), so a new
  // reason added to the enrichment later must default to blocking rather than silently pass.
  const d = computeContainmentDisposition({ checked: false, reason: 'some-future-reason' });
  assert(d.disposition === 'blocking' && d.reason === 'unrecognised-reason:some-future-reason', JSON.stringify(d));
});

test('D12: no reason at all ⇒ blocking (never benign by omission)', () => {
  const d = computeContainmentDisposition({ checked: false });
  assert(d.disposition === 'blocking' && d.reason === 'no-reason-given', JSON.stringify(d));
});

test('D13: a clean checked:true leg is benign', () => {
  const d = computeContainmentDisposition({ checked: true, violations: [], unsupported: [] });
  assert(d.disposition === 'benign' && d.reason === 'checked-clean', JSON.stringify(d));
});

test('D14: inputs are RETAINED so the derived value is falsifiable by replay', () => {
  const d = computeContainmentDisposition({
    checked: false, reason: 'harvest-block-missing-or-unparseable',
    upstreamContainment: { green: true }, harvestedCount: 3,
  });
  assert(d.inputs.reason === 'harvest-block-missing-or-unparseable', 'reason retained');
  assert(d.inputs.upstreamContainmentGreen === true, 'green retained');
  assert(d.inputs.harvestedCount === 3, 'harvestedCount retained');
  assert(d.inputs.violationCount === 0 && d.inputs.unsupportedCount === 0, 'counts retained');
});

test('D15: F7 — the disposition names WHICH kinds are uncovered, not just how many', () => {
  // VT-14 Run 23: a needs-node-c that names no subject gets discharged against whatever evidence is
  // nearest. Observed live at program tier, not hypothesised.
  const d = computeContainmentDisposition({
    checked: true, violations: [], unsupported: [{ kind: 'vlan' }, { kind: 'vlan' }, { kind: 'vrf' }],
  });
  assert(d.disposition === 'needs-node-c', JSON.stringify(d));
  assert(JSON.stringify(d.inputs.unsupportedKinds) === JSON.stringify(['vlan', 'vrf']),
    `kinds must be present and deduped: ${JSON.stringify(d.inputs)}`);
  assert(d.inputs.unsupportedCount === 3, 'the count is still the entry count, not the kind count');
});

test('D16: unsupportedKinds is ABSENT when nothing is unsupported (never an empty array)', () => {
  const d = computeContainmentDisposition({ checked: true, violations: [], unsupported: [] });
  assert(!('unsupportedKinds' in d.inputs), `absent, not empty: ${JSON.stringify(d.inputs)}`);
});

// ── ORPHANED DERIVED VALUES (2026-08-04) ────────────────────────────────────────────────────────
// Containment proves a value came from the pool. It says nothing about whether the package USES it.
// Both live injections (Run 22 `asn` 65100, Run 24 `vlan` 100) were contained-irrelevant: legal
// values appearing exactly ONCE in the document — their own declaration.

const computeOrphans = (a: any, t: string) => checkDerivedValueUsage(a, t);

const PKG = [
  '# Change Package',
  '## Derived Values',
  '```json',
  '[{"kind":"cidr","value":"10.99.0.12/31"},{"kind":"asn","value":"65001"},{"kind":"vlan","value":"100"}]',
  '```',
  '## Device Configuration Blocks',
  'interface Loopback14',
  '  ip address 10.99.0.12/32',
  'router bgp 65001',
  '## Validation Steps',
  '```',
  'show ip interface brief | include Loopback14',
  '```',
  '```',
  'Loopback14   10.99.0.12   YES manual up   up',
  '```',
].join('\n');

test('O1: an unused derived value is flagged — the Run-22/24 injection shape', () => {
  const arr = [{ kind: 'vlan', value: '100' }];
  const v = computeOrphans(arr, PKG);
  assert(v.length === 1 && v[0].reason === 'derived-value-orphaned' && v[0].derived === '100',
    `the vlan is declared and used nowhere: ${JSON.stringify(v)}`);
});

test('O2: values the package DOES use are not flagged', () => {
  const arr = [{ kind: 'cidr', value: '10.99.0.12/31' }, { kind: 'asn', value: '65001' }];
  assert(computeOrphans(arr, PKG).length === 0, 'config + validation use both — no orphan');
});

test('O3: a CIDR is matched on its ADDRESS, not its prefix string', () => {
  // The block says 10.99.0.12/31; the device output says 10.99.0.12. Matching the full prefix
  // would miss every real use and flag every legitimate aggregate.
  const v = computeOrphans([{ kind: 'cidr', value: '10.99.0.12/31' }], PKG);
  assert(v.length === 0, `matched on the bare address: ${JSON.stringify(v)}`);
});

test('O4: the DECLARING block cannot vouch for its own value', () => {
  // A value present ONLY inside ## Derived Values must still be an orphan — otherwise every
  // injected entry exonerates itself and the check is decorative.
  const onlyDeclared = ['## Derived Values', '```json', '[{"kind":"vlan","value":"999"}]', '```'].join('\n');
  const v = computeOrphans([{ kind: 'vlan', value: '999' }], onlyDeclared);
  assert(v.length === 1, `a self-declaring value must not exonerate itself: ${JSON.stringify(v)}`);
});

test('O5: MULTIPLE derived-values blocks are all excised (the Author carries the Architect forward)', () => {
  const twice = [
    '## Derived Values', '```json', '[{"kind":"vlan","value":"999"}]', '```',
    '## Derived Values', '```json', '[{"kind":"vlan","value":"999"}]', '```',
  ].join('\n');
  assert(computeOrphans([{ kind: 'vlan', value: '999' }], twice).length === 1,
    'a second copy of the block is still a declaration, not a use');
});

test('O6: no package text ⇒ NO violation (absence of evidence is not evidence)', () => {
  assert(computeOrphans([{ kind: 'vlan', value: '100' }], '').length === 0,
    'an unreadable package must not manufacture violations');
});

test('O7: usage count is measured, and the separation is what the design rests on', () => {
  assert(usageOutsideDerivedBlock(PKG, '10.99.0.12') >= 2, 'a used value appears repeatedly');
  assert(usageOutsideDerivedBlock(PKG, '100') === 0, 'an unused value appears zero times outside its block');
});

// SELF-CHECK: every declared test executed (bottom-exit trap guard).
const declared = (require('fs').readFileSync(__filename, 'utf-8').match(/^test\(/gm) || []).length;

// ── misaligned-prefix (run-1 2026-08-17; review misaligned-prefix-class-2026-08-19) ──────────
// Fixtures F-1..F-7 per the decision record. Reason strings and shapes taken from the LIVE
// run-1 stamp (artifact cmswon78u009pyxroi38kbf1g), honoring the false-park history's rule.

test('F-1 run-1 replay: misaligned /29 → misaligned-prefix FIRST + prefix-not-minimal + covered-not-member .2/.3 — and .9/.10 NOT stamped (the load-bearing negative)', () => {
  // The real run-1 blocks: derived 10.99.0.4/29 members .5/.6; harvest incl. .2/.3 (inside the
  // CANONICAL span .0-.7) and .9/.10 (inside the LITERAL span .4-.11 Node C mistakenly used).
  const harvest = [
    { kind: 'cidr', cidr: '10.99.0.2/32', device: 'ceos1' },
    { kind: 'cidr', cidr: '10.99.0.10/32', device: 'ceos1' },
    { kind: 'cidr', cidr: '10.99.0.27/32', device: 'ceos1' },
    { kind: 'cidr', cidr: '10.99.0.3/32', device: 'ceos2' },
    { kind: 'cidr', cidr: '10.99.0.9/32', device: 'ceos2' },
    { kind: 'cidr', cidr: '10.99.0.15/32', device: 'ceos2' },
  ] as HarvestedAllocation[];
  const r = checkDerivationContainment(harvest, [
    { kind: 'cidr', value: '10.99.0.4/29', members: ['10.99.0.5/32', '10.99.0.6/32'] },
  ]);
  const reasons = r.violations!.map(v => v.reason);
  assert(reasons[0] === 'misaligned-prefix', `misaligned-prefix must be stamped FIRST, got ${reasons[0]}`);
  const mis = r.violations![0];
  assert(mis.derived === '10.99.0.4/29' && mis.canonical === '10.99.0.0/29',
    `canonical naming wrong: ${JSON.stringify(mis)}`);
  assert(reasons.includes('prefix-not-minimal'), 'prefix-not-minimal still fires (independent axis)');
  const covered = r.violations!.filter(v => v.reason === 'covered-not-member').map(v => v.harvested).sort();
  assert(JSON.stringify(covered) === JSON.stringify(['10.99.0.2/32', '10.99.0.3/32']),
    `canonical-span collisions must be .2/.3, got ${JSON.stringify(covered)}`);
  // THE LOAD-BEARING NEGATIVE: the literal-span reading (Node C's .9/.10) must NOT be stamped —
  // this pin fixes the canonical-span semantics on the exact axis the two tiers diverged.
  assert(!covered.includes('10.99.0.9/32') && !covered.includes('10.99.0.10/32'),
    '.9/.10 are OUTSIDE the canonical span and must never be stamped');
});

test('F-2 aligned-clean: .4/30 members .5/.6, non-colliding harvest → no violations, NO canonical field anywhere', () => {
  const r = checkDerivationContainment(
    [{ kind: 'cidr', cidr: '10.99.0.30/32', device: 'ceos1' }] as HarvestedAllocation[],
    [{ kind: 'cidr', value: '10.99.0.4/30', members: ['10.99.0.5/32', '10.99.0.6/32'] }],
  );
  assert(r.checked === true && r.violations!.length === 0, `expected clean, got ${JSON.stringify(r.violations)}`);
  assert(!JSON.stringify(r).includes('canonical'), 'aligned artifacts must stay byte-identical (no canonical field)');
});

test('F-3 misaligned-but-canonical-clean: .1/30 members .1/.2, empty harvest → ONLY misaligned-prefix, disposition-blocking alone', () => {
  const r = checkDerivationContainment([], [
    { kind: 'cidr', value: '10.99.0.1/30', members: ['10.99.0.1/32', '10.99.0.2/32'] },
  ]);
  const reasons = r.violations!.map(v => v.reason);
  assert(reasons.length === 1 && reasons[0] === 'misaligned-prefix',
    `expected only misaligned-prefix, got ${JSON.stringify(reasons)}`);
  assert(r.violations![0].canonical === '10.99.0.0/30', `canonical: ${r.violations![0].canonical}`);
});

test('F-3b misaligned-minimal-length: .5/30 members .5/.6 → misaligned-prefix WITHOUT prefix-not-minimal (independent axes)', () => {
  const r = checkDerivationContainment([], [
    { kind: 'cidr', value: '10.99.0.5/30', members: ['10.99.0.5/32', '10.99.0.6/32'] },
  ]);
  const reasons = r.violations!.map(v => v.reason);
  assert(reasons.includes('misaligned-prefix'), 'misaligned fires');
  assert(!reasons.includes('prefix-not-minimal'), 'declared 30 == minimal 30 — non-minimality must NOT fire');
});

test('F-4 VT-12 unchanged: aligned non-minimal .8/30 members .8/.9 → prefix-not-minimal only, NO misaligned stamp', () => {
  const r = checkDerivationContainment([], [
    { kind: 'cidr', value: '10.99.0.8/30', members: ['10.99.0.8/32', '10.99.0.9/32'] },
  ]);
  const reasons = r.violations!.map(v => v.reason);
  assert(reasons.includes('prefix-not-minimal'), 'VT-12 class intact');
  assert(!reasons.includes('misaligned-prefix'), '.8 sits on its /30 boundary — no cross-fire');
});

test('F-6 back-compat: bare address (implicit /32) never misaligns', () => {
  const r = checkDerivationContainment([], [
    { kind: 'cidr', value: '10.99.0.7', members: ['10.99.0.7/32'] },
  ]);
  assert(!r.violations!.some(v => v.reason === 'misaligned-prefix'),
    'a bare address is /32 by definition and cannot carry host bits');
});

test('F-7 consumed-vs-derived spelling (document, not change): sameRange matches canonical vs literal forms of one deployed range', () => {
  // consumed 10.99.0.0/29 vs upstream-derived 10.99.0.4/29 canonicalize to the same range —
  // no spurious consumed-value-mismatch when a downstream leg writes the canonical form. This is
  // intended behavior, pinned so a future 'string-exact' tightening is a visible decision.
  const r = checkConsumedValues(
    [{ kind: 'cidr', value: '10.99.0.0/29' }],
    [{ kind: 'cidr', value: '10.99.0.4/29' }],
  );
  assert(r.length === 0, `same deployed range must match: ${JSON.stringify(r)}`);
});

// ── Shared section-bounded primitives, EXPORTED 2026-10-04 (C2/C3 plan v2 §1.3, EF-F1/F2/F3) ─────────
// Behaviour pins for the exports — the set to port into @paichart/containment-checks at 0.7.0.
const TICKS = '`'.repeat(3);
test('primitives: markerHeadingRegex returns a FRESH gim RegExp on every call (never cache — lastIndex)', () => {
  const a = markerHeadingRegex(DERIVED_VALUES_MARKER), b = markerHeadingRegex(DERIVED_VALUES_MARKER);
  assert(a !== b && a.flags === 'gim' && a.source === b.source, 'shared instance or wrong flags');
});
test('primitives: markerHeadingRegex strips a leading # run — marker and phrase are the same regex', () => {
  assert(markerHeadingRegex('## Derived Values').source === markerHeadingRegex('Derived Values').source, 'marker form differs from phrase form');
  const t = '**Derived Values** (verbatim)\n';
  assert(markerHeadingRegex(DERIVED_VALUES_MARKER).exec(t)?.index === 0, 'bold variant not matched via the marker constant');
});
test('primitives: markerSectionEnd — same-level heading ends; deeper heading and in-fence heading do not', () => {
  const t = `## Derived Values\n### Rationale\n${TICKS}json\n## not a heading\n${TICKS}\n## Intent\nx`;
  const end = markerSectionEnd(t, 0);
  assert(t.slice(end).startsWith('## Intent'), `section ended at ${JSON.stringify(t.slice(end, end + 20))}`);
});
test('primitives: markerSectionEnd rule (b) is hard-wired to the three markers — a deeper marker heading ends any section', () => {
  const t = `## Interface Contract\nbody\n### Consumed Values\n[]`;
  assert(t.slice(markerSectionEnd(t, 0)).startsWith('### Consumed Values'), 'rule (b) did not end the section');
});
test('primitives: FENCE_LINE_RE / FENCED_JSON_BLOCK_RE are stateless (no g flag) and line/first-match shaped', () => {
  assert(!FENCE_LINE_RE.global && !FENCED_JSON_BLOCK_RE.global, 'a g flag makes a shared const stateful');
  assert(FENCE_LINE_RE.test('  ' + TICKS + 'json') && !FENCE_LINE_RE.test('x ' + TICKS), 'fence line test');
  const m = `a\n${TICKS}json\n[1]\n${TICKS}\n${TICKS}\n[2]\n${TICKS}`.match(FENCED_JSON_BLOCK_RE);
  assert(m?.[1] === '[1]\n', `first block body: ${JSON.stringify(m?.[1])}`);
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (passed + failed !== declared) {
  console.error(`❌ SELF-CHECK: ${declared} declared, ${passed + failed} executed`);
  process.exit(1);
}
process.exit(failed > 0 ? 1 : 0);

