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
  type HarvestedAllocation,
  type DerivedValue,
  computeContainmentDisposition,
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

test('parser: prose mention mid-sentence still does NOT match (no over-matching)', () => {
  const doc = 'In this section the derived values are computed as follows, with no block.\n';
  assert(parseFencedJsonBlock(doc, DERIVED_VALUES_MARKER) === null, 'prose mention must not match');
});

// (One platform-layer test was removed at extraction: the FINDING-F ordering pin reads the
// PRIVATE enrichment module that wires this library into the pAIchart pipeline. It lives with
// that module. Everything below tests the library itself.)

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
  const d = computeContainmentDisposition({ checked: false, reason: 'harvest-block-missing-or-unparseable' });
  assert(d.disposition === 'blocking' && d.reason === 'consuming-leg-upstream-absent', JSON.stringify(d));
});

test('D10: hard-gap reasons block, including the two moved there by arch F1', () => {
  for (const reason of ['enrichment-error', 'no-child-stage', 'no-harvest-child', 'no-author-child']) {
    const d = computeContainmentDisposition({ checked: false, reason });
    assert(d.disposition === 'blocking' && d.reason === 'hard-gap', `${reason}: ${JSON.stringify(d)}`);
  }
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
console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (passed + failed !== declared) {
  console.error(`❌ SELF-CHECK: ${declared} declared, ${passed + failed} executed`);
  process.exit(1);
}
process.exit(failed > 0 ? 1 : 0);

