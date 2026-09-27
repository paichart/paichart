#!/usr/bin/env ts-node
/**
 * Fixture tests for lib/agents/harness/dialect-lint.ts.
 *
 * Every fixture below is LIVE TEXT from the IGP-T1 campaign (2026-08-23), not invented:
 *   - R1_PACKAGE / R3_PACKAGE: the two packages that shipped IOS-isms on an Arista EOS target.
 *     R1 was refused at the operator's config-session apply; R3 re-emitted the banned token past
 *     a binding contract rule and was caught by the leg harness. These are the incidents that
 *     earned this check.
 *   - R6_PACKAGE: the round that went green — a CLEAN config that nonetheless NAMES the banned
 *     tokens in prose ("Banned-token self-check: `metric-style` — 0 matches"). This is the
 *     false-positive trap: a naive whole-document scan flags the clean winner. Prose is exempt
 *     BY DESIGN; only fenced blocks are scanned.
 *
 * A checker that is wrong produces confident false findings — so the clean-round fixture is as
 * load-bearing as the defect ones.
 */
import {
  runDialectLint,
  fencedBlockLines,
  DIALECT_LINT_CLASSIFIER,
  extractBannedTokens,
  extractCanonicalStanzas,
  canonicalStanzaNeedles,
  type CanonicalNeedle,
} from '../lib/agents/harness/dialect-lint';

let passed = 0;
let failed = 0;

function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`✅ ${label}`);
    passed++;
  } else {
    console.log(`❌ ${label}${detail ? `\n   ${detail}` : ''}`);
    failed++;
  }
}

const CONTRACT = {
  platform: 'arista_eos',
  targetProtocol: { name: 'isis', isTypeToken: 'is-type level-2' },
  platformDialect: {
    canonicalStanza_P1_template: 'router isis <instance>\n   net <NET>\n   is-type level-2',
    bannedTokens: ['metric-style', 'passive-interface', 'level-2-only'],
  },
};

// ── R1: the package refused at the operator's apply (two IOS-isms) ────────────────
const R1_PACKAGE = `## Change Package — IS-IS Coexistence Deploy

### A. Per-device candidate configuration

**ceos1**
\`\`\`
router isis ISIS-MIGRATION
   net 49.0001.0010.0100.1001.00
   is-type level-2-only
   metric-style wide
   address-family ipv4 unicast
!
interface Loopback0
   isis enable ISIS-MIGRATION
   isis passive
\`\`\`
`;

// ── R3: re-emitted the banned token past binding negative rules, + router-level passive ──
const R3_PACKAGE = `## Change Package (R3)

**ceos2**
\`\`\`
router isis ISIS-MIGRATION
   net 49.0001.0020.0200.2002.00
   is-type level-2
   metric-style wide
   passive-interface Loopback0
\`\`\`
`;

// ── R6: the clean round — banned tokens NAMED IN PROSE, absent from config ────────
const R6_PACKAGE = `## Change Package: IS-IS Coexistence Deploy — IGP-T1 R6

Per-device NET, instance identifier, and per-link metrics are fixed by the binding Program
Interface Contract. No banned tokens (\`metric-style\`, \`passive-interface\`, \`level-2-only\`)
appear anywhere.

### ceos1
\`\`\`
router isis 1
   net 49.0001.0010.0100.1001.00
   is-type level-2
   !
   address-family ipv4 unicast
!
interface Ethernet1
   isis enable 1
   isis network point-to-point
   isis metric 10
!
interface Loopback0
   isis enable 1
   isis passive
\`\`\`

**Banned-token self-check**: \`metric-style\` — 0 matches; \`passive-interface\` — 0 matches;
\`level-2-only\` — 0 matches (all three blocks above).
`;

// ── extraction ────────────────────────────────────────────────────────────────────
check(
  'extract: finds bannedTokens nested at depth',
  JSON.stringify(extractBannedTokens(CONTRACT)) ===
    JSON.stringify(['metric-style', 'passive-interface', 'level-2-only'])
);
check(
  'extract: shape-tolerant — a differently-keyed banned list is still found',
  extractBannedTokens({ dialectRules: { banned_token_list: ['metric-style'] } }).length === 1
);
check('extract: no banned list → empty', extractBannedTokens({ platform: 'arista_eos' }).length === 0);

// ── R1 incident ───────────────────────────────────────────────────────────────────
{
  const r = runDialectLint(R1_PACKAGE, CONTRACT);
  const tokens = r.violations.map((v) => v.token).sort();
  check('R1 fixture: checked', r.checked === true);
  check(
    'R1 fixture: flags BOTH IOS-isms (level-2-only, metric-style)',
    JSON.stringify(tokens) === JSON.stringify(['level-2-only', 'metric-style']),
    `got: ${JSON.stringify(tokens)}`
  );
  check(
    'R1 fixture: reports WHAT and WHERE (line + text), not just a count',
    r.violations.every((v) => v.line > 0 && v.lineText.length > 0)
  );
  check(
    'R1 fixture: does NOT flag the legitimate interface-level `isis passive`',
    !r.violations.some((v) => v.lineText.includes('isis passive'))
  );
}

// ── R3 incident ───────────────────────────────────────────────────────────────────
{
  const r = runDialectLint(R3_PACKAGE, CONTRACT);
  const tokens = r.violations.map((v) => v.token).sort();
  check(
    'R3 fixture: flags metric-style + router-level passive-interface',
    JSON.stringify(tokens) === JSON.stringify(['metric-style', 'passive-interface']),
    `got: ${JSON.stringify(tokens)}`
  );
  check(
    'R3 fixture: is-type level-2 (VALID EOS) is not flagged',
    !r.violations.some((v) => v.token === 'level-2-only')
  );
}

// ── R6 clean round — the false-positive trap ──────────────────────────────────────
{
  const r = runDialectLint(R6_PACKAGE, CONTRACT);
  check(
    'R6 fixture (CLEAN winner): zero violations despite prose naming every banned token',
    r.checked === true && r.violations.length === 0,
    `got ${r.violations.length}: ${JSON.stringify(r.violations)}`
  );
}

// ── fact-not-verdict / absence semantics ──────────────────────────────────────────
{
  check(
    'no contract → checked:false, reason no-contract (never a silent pass)',
    runDialectLint(R1_PACKAGE, null).reason === 'no-contract'
  );
  check(
    'contract without a banned list → checked:false, reason named',
    runDialectLint(R1_PACKAGE, { platform: 'arista_eos' }).reason === 'no-banned-token-list'
  );
  check(
    'prose-only deliverable → checked:false, reason no-fenced-blocks',
    runDialectLint('No config here, just prose about metric-style.', CONTRACT).reason ===
      'no-fenced-blocks'
  );
  check('empty deliverable is not a crash', runDialectLint('', CONTRACT).violations.length === 0);
}

// ── token-boundary correctness ────────────────────────────────────────────────────
{
  const substringContract = { bannedTokens: ['is'] };
  const r = runDialectLint('```\nrouter isis 1\n```', substringContract);
  check(
    'boundary: token `is` does NOT match inside `isis`',
    r.violations.length === 0,
    `got: ${JSON.stringify(r.violations)}`
  );
  const r2 = runDialectLint('```\nmetric-style wide\n```', { bannedTokens: ['METRIC-STYLE'] });
  check('case-insensitive match', r2.violations.length === 1);
}


// ── PRESENCE half: transcription completeness (2026-08-24, IGP-T1 R7 incident) ────────────
// R7's package was banned-token CLEAN and still fatally wrong: it omitted `address-family ipv4
// unicast` from the canonical stanza. The config entered a config session with no error, committed
// successfully, displayed as configured — and IS-IS stayed DISABLED. The leg reviewer approved it
// 90/100. An absence-only lint approves it too. These fixtures are the live R7 text.
{
  const R7_CONTRACT = {
    dialectConstraints: {
      platform: 'arista_eos 4.32.2.1F',
      bannedTokens: ['level-2-only', 'metric-style', 'passive-interface (under router isis)'],
      canonicalIsisStanza:
        'router isis <instance>\n   net <NET>\n   is-type level-2\n   !\n   address-family ipv4 unicast\n!\ninterface <Ethernet-interface>\n   isis enable <instance>\n   isis network point-to-point\n   isis metric <value>\n!\ninterface Loopback0\n   isis enable <instance>\n   isis passive',
    },
  };

  // VERBATIM from the R7 P1 package (the defect: no address-family line).
  const R7_DEFECTIVE = `# Change Package: IS-IS Coexistence Deploy (ceos1/ceos2)

### ceos1
\`\`\`
router isis 1
   net 49.0001.0010.0100.1001.00
   is-type level-2
!
interface Ethernet1
   isis enable 1
   isis network point-to-point
   isis metric 10
!
interface Loopback0
   isis enable 1
   isis passive
\`\`\`

### ceos2
\`\`\`
router isis 1
   net 49.0001.0020.0200.2002.00
   is-type level-2
!
interface Ethernet1
   isis enable 1
   isis network point-to-point
   isis metric 10
!
interface Loopback0
   isis enable 1
   isis passive
\`\`\`
`;

  const R7_FIXED = R7_DEFECTIVE.replace(
    /   is-type level-2\n/g,
    '   is-type level-2\n   !\n   address-family ipv4 unicast\n'
  );

  check(
    'extract: finds the canonical stanza by key shape',
    extractCanonicalStanzas(R7_CONTRACT).length === 1
  );

  const bad = runDialectLint(R7_DEFECTIVE, R7_CONTRACT);
  check(
    'R7 DEFECT: absence half passes (this is why an absence-only lint approved it)',
    bad.checked === true && bad.violations.length === 0
  );
  check(
    'R7 DEFECT: presence half CATCHES the omitted address-family line',
    bad.transcription.checked === true &&
      bad.transcription.missing.some((m) => /address-family ipv4 unicast/i.test(m)),
    `missing=${JSON.stringify(bad.transcription.missing)}`
  );
  check(
    'R7 DEFECT: the omission is the ONLY missing line (no false companions)',
    bad.transcription.missing.length === 1,
    `missing=${JSON.stringify(bad.transcription.missing)}`
  );

  const good = runDialectLint(R7_FIXED, R7_CONTRACT);
  check(
    'R7 FIXED: same package + the address-family line → zero missing, zero violations',
    good.transcription.checked === true &&
      good.transcription.missing.length === 0 &&
      good.violations.length === 0,
    `missing=${JSON.stringify(good.transcription.missing)}`
  );

  // Per-device asymmetry is NOT verdicted, but must be VISIBLE as a fact (scope honesty).
  check(
    'occurrences make per-device asymmetry visible (2 devices → 2 occurrences)',
    good.transcription.lines.find((l) => /address-family ipv4 unicast/i.test(l.line))?.occurrences === 2
  );
  const oneDevice = runDialectLint(R7_FIXED.split('### ceos2')[0], R7_CONTRACT);
  check(
    'single-device doc → occurrences 1, still not flagged missing (document-level scope, stated)',
    oneDevice.transcription.missing.length === 0 &&
      oneDevice.transcription.lines.find((l) => /address-family/i.test(l.line))?.occurrences === 1 &&
      /does NOT verdict on per-device asymmetry/i.test(oneDevice.transcription.scope)
  );

  // Placeholder handling + skip naming
  check(
    'placeholder line matched on its literal prefix, not skipped',
    bad.transcription.lines.some((l) => l.matchedOn === 'prefix' && l.prefix === 'net')
  );
  check(
    'unassertable lines are NAMED in skipped[], never silently dropped',
    Array.isArray(bad.transcription.skipped)
  );

  // Absence semantics for the presence half
  check(
    'contract with no canonical stanza → transcription checked:false, reason named',
    runDialectLint(R7_DEFECTIVE, { bannedTokens: ['metric-style'] }).transcription.reason ===
      'no-canonical-stanza'
  );
  check(
    'prose-only deliverable → transcription reason no-fenced-blocks (not a silent pass)',
    runDialectLint('no config here', R7_CONTRACT).transcription.reason === 'no-fenced-blocks'
  );
}


// ── BLOCK CLASSIFICATION (2026-08-24) — the near-miss that earned it ──────────────────────
// R9's CLEAN package carried `passive-interface Loopback0` inside the OSPF-unchanged EXPECTED
// OUTPUT (the baseline the change must preserve). Its contract worded the banned token as a
// qualified phrase, so nothing matched — but with the PLAIN token (as R7's contract used) an
// unclassified scan blocks a correct package. That is the R5 mistake inside our own guard.
{
  const PLAIN = { bannedTokens: ['passive-interface'], canonicalIsisStanza: 'router isis <instance>\n   is-type level-2' };
  const R9_SHAPE = `## Candidate Configuration

### ceos1
\`\`\`
router isis ISIS1
   is-type level-2
\`\`\`

### 2c. OSPF-unchanged check
\`\`\`
show run | section router ospf
\`\`\`
**Expected output (ceos1 — static fields only):**
\`\`\`
router ospf 1
   router-id 1.1.1.1
   passive-interface Loopback0
\`\`\`

## 3. Rollback Plan
\`\`\`
interface Loopback0
   no isis enable ISIS1
   no isis passive
\`\`\`
`;
  const r = runDialectLint(R9_SHAPE, PLAIN);
  check(
    'R9 near-miss: banned token in EXPECTED OUTPUT does NOT flag a clean package',
    r.checked === true && r.violations.length === 0,
    `got ${r.violations.length}: ${JSON.stringify(r.violations)}`
  );
  check(
    'classification identifies all four block kinds',
    r.blockKinds['candidate-config'] > 0 &&
      r.blockKinds['expected-output'] > 0 &&
      r.blockKinds['command'] > 0 &&
      r.blockKinds['rollback'] > 0,
    JSON.stringify(r.blockKinds)
  );
  // The absence half must still FIRE on a real defect in candidate config.
  const REAL = R9_SHAPE.replace('   is-type level-2\n', '   is-type level-2\n   passive-interface Loopback0\n');
  const r2 = runDialectLint(REAL, PLAIN);
  check(
    'same token INSIDE candidate config still flags (classification is not a blanket amnesty)',
    r2.violations.length === 1 && r2.violations[0].token === 'passive-interface',
    JSON.stringify(r2.violations)
  );
  check(
    'blockKinds is emitted so "0 violations" can be told from "nothing classified as config"',
    typeof r.blockKinds === 'object' && Object.keys(r.blockKinds).length > 0
  );
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
// ── LIVE-CONTRACT SHAPE (pinned 2026-08-25, Phase 2 wiring) ───────────────────────────────────
// R10's Program Architect emitted `platformDialect.forbiddenTokens`. The extractor's key predicate
// was /banned/i only, so it matched ZERO tokens on the shape every real run actually produces —
// the lint would have reported `no-banned-token-list` forever while looking wired. Pin the live
// shape, not just the shapes the campaign happened to hand-author.
{
  const liveContract = {
    platformDialect: {
      platform: 'arista_eos',
      forbiddenTokens: ['metric-style', 'passive-interface (under router isis)', 'level-2-only'],
      canonicalStanza: 'router isis <instance>\n   net <NET>\n   is-type level-2',
    },
  };
  const tokens = extractBannedTokens(liveContract);
  check('live contract shape (platformDialect.forbiddenTokens) yields tokens',
    tokens.length === 3, JSON.stringify(tokens));

  const dirty = '```\n! ceos1 candidate\nrouter isis 1\n   metric-style wide\n```';
  const r = runDialectLint(dirty, liveContract);
  check('live shape: banned token in candidate config IS flagged',
    r.checked === true && r.violations.length === 1, `checked=${r.checked} v=${r.violations.length} reason=${r.reason ?? '-'}`);

  const clean = '```\n! ceos1 candidate\nrouter isis 1\n   is-type level-2\n```';
  const rc = runDialectLint(clean, liveContract);
  check('live shape: clean candidate config yields zero violations',
    rc.checked === true && rc.violations.length === 0, `v=${rc.violations.length}`);
}

// ── stanza SEPARATOR tolerance (IGP-T1 R12, 2026-08-26, caught pre-gate) ─────────────────────
// Both strings below are REAL Program Architect output for the SAME objective under the SAME
// protocol: R11 wrote the stanza newline-separated, R12 wrote it slash-separated on one line.
// Splitting on newlines alone reduced R12 to ONE needle (`router isis`) — which every IS-IS
// package contains — so the PRESENCE half returned a confident clean pass while checking nothing.
// Pinned as LIVE shapes, not hand-authored ones: that distinction is what this class of bug turns on.
{
  const R12_SLASH =
    'router isis <instance> / net <NET> / is-type level-2 / ! / address-family ipv4 unicast / ! / ' +
    'interface <Ethernet-if> / isis enable <instance> / isis network point-to-point / ' +
    'isis metric <value> / ! / interface Loopback0 / isis enable <instance> / isis passive';
  const R11_NEWLINE = [
    'router isis <instance>', '   net <NET>', '   is-type level-2', '   !',
    '   address-family ipv4 unicast', '!', 'interface Loopback0', '   isis enable <instance>',
    '   isis passive',
  ].join('\n');

  const slash = canonicalStanzaNeedles({ platformDialect: { canonicalStanza: R12_SLASH } });
  check('R12 live slash-separated stanza decomposes into many needles, not one',
    slash.needles.length >= 8, `needles=${slash.needles.length}`);
  check('R12 slash stanza reports separator "slash" as a FACT',
    slash.separators?.[0] === 'slash', `separators=${JSON.stringify(slash.separators)}`);
  check('R12 slash stanza yields the address-family line the R7 defect omitted',
    slash.needles.some((n: CanonicalNeedle) => n.needle.includes('address-family ipv4 unicast')));
  check('R12 slash stanza does NOT emit a not-decomposable skip once it parses',
    !slash.skipped.some((x: string) => x.startsWith('stanza-not-decomposable')),
    JSON.stringify(slash.skipped));

  const nl = canonicalStanzaNeedles({ platformDialect: { canonicalStanza: R11_NEWLINE } });
  check('R11 live newline-separated stanza still decomposes (no regression)',
    nl.needles.length >= 5, `needles=${nl.needles.length}`);
  check('R11 newline stanza reports separator "newline"',
    nl.separators?.[0] === 'newline', `separators=${JSON.stringify(nl.separators)}`);

  // A bare `/` inside a token must NOT be treated as a separator, or real lines get shredded.
  const cidrish = canonicalStanzaNeedles({
    platformDialect: { canonicalStanza: 'ip address 10.0.12.1/30 secondary on interface Ethernet1 trunk' } });
  check('a bare slash inside a token is not a separator (no shredding)',
    cidrish.needles.length <= 1, `needles=${cidrish.needles.length}`);

  // The failure mode that started this: a long stanza that will not decompose must be NAMED.
  const opaque = canonicalStanzaNeedles({
    platformDialect: { canonicalStanza:
      'router isis 1; net 49.0001.0000.0000.0001.00; is-type level-2; address-family ipv4 unicast; interface Loopback0' } });
  check('an undecomposable long stanza is a NAMED skip, never a silent one-needle pass',
    opaque.skipped.some((x: string) => x.startsWith('stanza-not-decomposable')),
    `needles=${opaque.needles.length} skipped=${JSON.stringify(opaque.skipped)}`);
}

// ── prefix over-match + leg-intent counts (IGP-T1 R12 corpus measurement, 2026-08-27) ────────
// Measured over the ENTIRE dialect-lint corpus (8 facts, 4 checked — the whole population, since
// the lint shipped 2026-08-23): of the two MISSING findings ever produced, ONE was real (R11 P1,
// 8 of 10 lines present) and ONE was a false positive (R12 P4, an OSPF-REMOVAL leg that correctly
// carries almost none of the stanza). A 50% false rate on findings — small n, but decisive about
// existence. Both fixtures below are real package shapes from that corpus.
{
  const STANZA = [
    'router isis <instance>', '   net <NET>', '   is-type level-2',
    '   address-family ipv4 unicast', '   isis metric <value>',
  ].join('\n');
  const contract = { platformDialect: { canonicalStanza: STANZA } };

  // R12 P4 shape: a REMOVAL package. Its OSPF `network` statements must NOT be counted as IS-IS NETs.
  const removal = [
    '```', 'interface Ethernet1', '   no ip ospf cost 10', '!', 'no router ospf 1', '```',
    '```', 'router ospf 1', '   network 1.1.1.1/32 area 0.0.0.0', '   network 10.0.12.0/30 area 0.0.0.0', '```',
  ].join('\n');
  const r = runDialectLint(removal, contract);
  const netLine = (r.transcription.lines || []).find((l: any) => l.line.includes('net <NET>'));
  check('prefix needle "net" does NOT match OSPF "network …" (false PRESENCE removed)',
    netLine?.occurrences === 0, `occurrences=${netLine?.occurrences}`);
  check('a removal leg reads NEAR-ZERO presence, distinguishing it from a dropped line',
    (r.transcription.linesPresent ?? -1) === 0 && (r.transcription.linesRequired ?? 0) === 5,
    `present=${r.transcription.linesPresent}/${r.transcription.linesRequired}`);

  // R11 P1 shape: a DEPLOY package missing ONE required line — must STILL be flagged.
  const deployMissingOne = [
    '```', 'router isis CORE', '   net 49.0001.0010.0100.1001.00', '   is-type level-2',
    '   isis metric 10', '```',
  ].join('\n');
  const d = runDialectLint(deployMissingOne, contract);
  check('a DEPLOY leg missing one line is still flagged (the R7/R11 defect survives the fix)',
    d.transcription.missing.some((m: string) => m.includes('address-family ipv4 unicast')),
    JSON.stringify(d.transcription.missing));
  check('and it reads HIGH-but-incomplete, the shape that means a real defect',
    (d.transcription.linesPresent ?? 0) === 4 && (d.transcription.linesRequired ?? 0) === 5,
    `present=${d.transcription.linesPresent}/${d.transcription.linesRequired}`);

  // The boundary must not over-correct: a legitimate longer value after the prefix still matches.
  const legit = ['```', 'router isis CORE', '   net 49.0001.0020.0200.2002.00', '```'].join('\n');
  const g = runDialectLint(legit, contract);
  const netOk = (g.transcription.lines || []).find((l: any) => l.line.includes('net <NET>'));
  check('word boundary does not break a REAL prefix match ("net 49.0001…")',
    (netOk?.occurrences ?? 0) === 1, `occurrences=${netOk?.occurrences}`);
}

// ── operator-command blocks are NOT candidate config (live: IGP-T1 R13 A/B, 2026-08-27) ──────
// An author wrote a grep FOR the banned tokens, to prove they are absent. Our ABSENCE half
// classified the block as candidate-config (the `command` test required every line to start with
// `show`) and reported FOUR violations against a package that was being MORE rigorous, not less.
// Third false-positive class from this lint; the rule is: scan what the package asks the DEVICE to
// become, never what it asks the OPERATOR to run.
{
  const contract = { platformDialect: { forbiddenTokens: ['metric-style', 'level-2-only'] } };
  const verifyGrep = [
    '```',
    "grep -c -E 'metric-style|level-2-only|passive-interface' ceos1-post1-runcfg-isis.txt",
    '```',
  ].join('\n');
  const g = runDialectLint(verifyGrep, contract);
  check('a grep FOR banned tokens is an operator command, not a violation',
    g.violations.length === 0, `violations=${g.violations.length}`);
  check('and it is classified as a command block',
    (g.blockKinds['command'] ?? 0) === 1, JSON.stringify(g.blockKinds));

  // The real thing must still be caught — the fix must not blind the absence half.
  const realConfig = ['```', 'router isis CORE', '   metric-style wide', '```'].join('\n');
  const r = runDialectLint(realConfig, contract);
  check('a banned token in REAL candidate config is still a violation',
    r.violations.some((v: any) => v.token === 'metric-style'), JSON.stringify(r.violations));
}

// ── PER-STANZA ATTRIBUTION (2026-08-28). THIRD occurrence of one defect: R9 (recorded on
// CanonicalLineCheck.stanzaKey itself), R16-G3 (patched in the RENDERER — the symptom), and R18-P1.
// A contract carries several stanzas; a leg legitimately applies only the ones its PHASE calls for.
// Flattening them into one total is a category error, and the 0.5 ratio threshold it forced was a
// proxy for attribution the fact already carried.
{
  const contract = {
    platformDialect: {
      canonicalStanza: 'router isis <instance>\n   net <NET>\n   is-type level-2',
      canonicalKnobStanza: 'router isis <instance>\n   address-family ipv4 unicast\n      distance <value>',
      forbiddenTokens: ['metric-style'],
    },
  };
  // R18-P1's real shape: a coexistence deploy completes the deploy stanza and never touches the knob.
  const deployOnly = ['## Candidate configuration', '```',
    'router isis 1', '   net 49.0001.0010.0100.1001.00', '   is-type level-2', '```'].join('\n');
  const p1 = runDialectLint(deployOnly, contract);
  const bs: any = p1.transcription.byStanza;
  check('R18-P1: the applied stanza is COMPLETE', bs.canonicalStanza.complete === true, JSON.stringify(bs));
  // NB: `present` is NOT 0 here and should not be — the knob stanza SHARES its opening
  // `router isis <instance>` line with the deploy stanza, so a deploy-only package legitimately
  // satisfies one of its three lines. That is exactly why ATTEMPTED keys on lines unique to a
  // stanza; asserting present===0 was this fixture's own first-draft error.
  check('R18-P1: the other phase\'s stanza is NOT ATTEMPTED (shared lines do not attribute)',
    bs.canonicalKnobStanza.attempted === false && bs.canonicalKnobStanza.complete === false,
    JSON.stringify(bs));
  check('R18-P1: no stanza is attempted-but-incomplete (the exact R7 test) — flattened total would say otherwise',
    !Object.values(bs).some((b: any) => b.attempted && !b.complete)
      && Number(p1.transcription.linesPresent) < Number(p1.transcription.linesRequired),
    JSON.stringify({ bs, flat: `${p1.transcription.linesPresent}/${p1.transcription.linesRequired}` }));

  // A GENUINE R7: the deploy stanza is plainly being transcribed but a line was dropped.
  const dropped = ['## Candidate configuration', '```',
    'router isis 1', '   net 49.0001.0010.0100.1001.00', '```'].join('\n');
  const r7 = runDialectLint(dropped, contract);
  const b7: any = r7.transcription.byStanza;
  check('a GENUINE R7 still fires: attempted but incomplete within one stanza',
    b7.canonicalStanza.attempted === true && b7.canonicalStanza.complete === false, JSON.stringify(b7));

  // The knob leg: applies ONLY the knob stanza. Mirror image of P1, must be equally clean.
  const knobOnly = ['## Candidate configuration', '```',
    'router isis 1', '   address-family ipv4 unicast', '      distance 90', '```'].join('\n');
  const p3 = runDialectLint(knobOnly, contract);
  const b3: any = p3.transcription.byStanza;
  check('R18-P3 mirror: the knob stanza is complete and the deploy stanza is not attempted',
    b3.canonicalKnobStanza.complete === true && b3.canonicalStanza.attempted === false, JSON.stringify(b3));
}

// ── IGP-T1 R15 P4: two FALSE violations on a correct package. Both fixtures are the LIVE text. ──
// The absence half already scanned candidate-config only; the defect was in CLASSIFICATION, so both
// blocks were mislabelled candidate-config and scanned. `passive-interface` is banned under
// `router isis`; both blocks below are `router ospf`, where it is valid and where the package is
// REQUIRED to reproduce it verbatim.
{
  const contract = { platformDialect: { forbiddenTokens: ['metric-style', 'passive-interface', 'level-2-only'] } };

  // (1) No BlockKind existed for "evidence of what the device already has", so it defaulted to
  // candidate-config. Live line 149 of P4's author deliverable.
  const harvested = ['## 3. Evidence', '',
    '### 3.2 Harvested OSPF baseline — ceos2 (quoted verbatim, Phase 0 harvest, `show running-config`)',
    '```', 'router ospf 1', '   router-id 2.2.2.2', '   passive-interface Loopback0', '```'].join('\n');
  const h = runDialectLint(harvested, contract);
  check('R15 P4: a verbatim HARVESTED-STATE quote is not scanned',
    h.violations.length === 0, JSON.stringify(h.violations));
  check('R15 P4: harvested-state is classified as its own kind, not candidate-config',
    h.blockKinds['harvested-state'] > 0 && !h.blockKinds['candidate-config'], JSON.stringify(h.blockKinds));

  // (2) SHADOWED HEADING. A per-device sub-label immediately above the block consumed the whole
  // 3-line context window and hid the "## Rollback" heading above it. Live line 179.
  // This is the REAL shadowing mechanism, and it took two wrong fixtures to pin. The prose lookback
  // BREAKS at a preceding fence, so in a per-device rollback section the FIRST device's code block
  // walls off the heading from the second device's block: context collapses to "**ceos2:**" alone.
  // Neutral prose ("Apply the following…") and a preceding sibling block are BOTH required —
  // draft 1 said "harvested" (matched on its own rule) and draft 2 had no preceding fence (the
  // 3-line window still reached the heading). Both passed with the lookback deleted, pinning nothing.
  const shadowed = ['## Rollback', '', 'Apply the following to each device in turn.', '',
    '**ceos1:**', '```', 'router ospf 1', '   router-id 1.1.1.1', '```', '',
    '**ceos2:**', '```', 'router ospf 1', '   router-id 2.2.2.2', '   passive-interface Loopback0', '```'].join('\n');
  const s = runDialectLint(shadowed, contract);
  check('R15 P4: a heading is not shadowed by a per-device sub-label',
    s.violations.length === 0, JSON.stringify(s.violations));
  check('R15 P4: the SHADOWED block is classified from its heading, as rollback',
    s.blockKinds['rollback'] > 0 && !s.blockKinds['candidate-config'], JSON.stringify(s.blockKinds));

  // (3) HEADING ANCESTRY. IGP-T1 R16 P4, the survivor of the first cut. A per-device SUB-heading
  // shadows the section heading exactly as a bold label did, so "nearest heading" was not enough.
  // The two device blocks below are IDENTICAL in content and intent; before the ancestry walk only
  // the FIRST classified correctly, purely because no fence sat between it and the section heading.
  // That position-dependence is what this pins — not the single violation it happened to produce.
  const ancestry = ['# OSPF removal package', '',
    '## 5. Rollback Plan (per device — verbatim from Phase 0 harvest; NOT reconstructed)', '',
    '### ceos1', '```', 'router ospf 1', '   router-id 1.1.1.1', '   passive-interface Loopback0', '```', '',
    '### ceos2', '```', 'router ospf 1', '   router-id 2.2.2.2', '   passive-interface Loopback0', '```'].join('\n');
  const anc = runDialectLint(ancestry, contract);
  check('R16 P4: a per-device SUB-heading does not shadow the governing section heading',
    anc.violations.length === 0, JSON.stringify(anc.violations));
  // Asserts the PROPERTY, not a label. An earlier draft demanded kind==='rollback' and failed:
  // this section heading says "verbatim from Phase 0 HARVEST", so both blocks land on
  // harvested-state instead. Both kinds are equally exempt from the absence scan and the precedence
  // between them is explicitly not load-bearing — so pinning the label would pin an accident of
  // wording. What must hold is that the two siblings agree and neither is scanned.
  check('R16 P4: BOTH sibling device blocks classify the SAME — no position-dependence',
    Object.keys(anc.blockKinds).length === 1 && !anc.blockKinds['candidate-config'],
    JSON.stringify(anc.blockKinds));

  // BOUNDING CONTROL for the ancestry walk: a LATER section must own its own blocks. If the walk
  // collected siblings rather than strict ancestors, the earlier "## 5. Rollback Plan" would reach
  // down here and exempt real candidate config — turning the fix into a hole.
  const laterOwns = [ancestry, '', '## 6. Candidate configuration', '', '### ceos1', '```',
    'router isis 1', '   metric-style wide', '```'].join('\n');
  const lo = runDialectLint(laterOwns, contract);
  check('ancestry walk collects ANCESTORS, not siblings — a later section owns its own blocks',
    lo.violations.some((x: any) => x.token === 'metric-style'), JSON.stringify({ v: lo.violations, k: lo.blockKinds }));

  // NEGATIVE CONTROL — the whole point. Neither exemption may blind the absence half on the shape
  // that earned this net (R1 shipped IOS-isms past an approving reviewer; R3 re-emitted one).
  const real = ['## Candidate configuration', '', '**ceos1:**', '```',
    'router isis MIGRATION1', '   metric-style wide', '   passive-interface Loopback0', '```'].join('\n');
  const v = runDialectLint(real, contract);
  check('R15 P4 fix does NOT blind the R1/R3 shape — real violations still fire',
    v.violations.length === 2 && v.blockKinds['candidate-config'] > 0, JSON.stringify({ v: v.violations, k: v.blockKinds }));

  // A heading must not colour blocks under a LATER, more specific section (bounded lookback).
  const laterSection = ['# OSPF removal package', '', '## Rollback', '', '```', 'no router ospf 1', '```', '',
    '## Candidate configuration', '', '```', 'router isis M1', '   metric-style wide', '```'].join('\n');
  const l = runDialectLint(laterSection, contract);
  check('a document-level heading does not exempt a later candidate-config section',
    l.violations.some((x: any) => x.token === 'metric-style'), JSON.stringify({ v: l.violations, k: l.blockKinds }));
}

// ── EF-DL1 (2026-09-27): a check FOR a banned token's absence is not its presence ────────────
// LIVE fixture: the Author package of the observability leg "authorise telemetry senders via ingress
// allow/deny stanza" (leg cmuhmm2u5006byxcq64ndua1v, author cmuhn7bmx009ryxcrzmoauxib, stamped
// 2026-09-26) and that leg's own interface contract. Production stamped ONE violation — `allow all;`
// at line 100, whose text is `docker exec obs-ingress nginx -T 2>/dev/null | grep -c 'allow all;'`
// with an expected output of `0`. It was the only violation the corpus raises at HEAD (30 packages
// with a banned-token list, replayed). The line starts with an exec WRAPPER, not an operator verb, so
// the block is candidate-config; the defect is that a grep PATTERN was read as a directive.
{
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const dir = path.join(__dirname, 'fixtures', 'dialect-lint');
  const pkg = fs.readFileSync(path.join(dir, 'ef-dl1-obs-ingress-author-2026-09-26.md'), 'utf8');
  const contract = JSON.parse(fs.readFileSync(path.join(dir, 'ef-dl1-obs-ingress-contract-2026-09-26.json'), 'utf8'));

  const r = runDialectLint(pkg, contract);
  check('EF-DL1 live: the contract really carries the banned token (the net is checking, not skipping)',
    r.checked === true && r.tokensConsidered.includes('allow all;'), JSON.stringify(r.tokensConsidered));
  check('EF-DL1 live: the absence-verification grep is NOT a violation — the package goes CLEAN',
    r.violations.length === 0, JSON.stringify(r.violations));
  check('EF-DL1 live: the exemption is NAMED, at the stamped line, not silently dropped',
    (r.searchPatternExempt ?? []).length === 1 && r.searchPatternExempt![0].line === 100
      && r.searchPatternExempt![0].token === 'allow all;', JSON.stringify(r.searchPatternExempt));
  // The EF-DL1 fix is occurrence-level and re-kinds nothing. But the counts production STAMPED here —
  // { rollback: 1, expected-output: 10, harvested-state: 115, candidate-config: 5 }, classifier 1 — were
  // the EF-DL2 defect: the 3-line window climbed over `## 2. Full Desired-State Config File` into
  // section 1's "Phase 0 Harvester" table, so the package's REAL config (40 lines) was harvested-state
  // and scanned by neither half. This pin used to hold that defective reading; since `classifier: 3`
  // (EF-DL2 option ac) it holds the corrected one. See the EF-DL2 block below for PRESENCE 0/2 -> 2/2.
  check('EF-DL1 live: block classification is the classifier-3 reading (real config candidate-config; rollback rollback)',
    JSON.stringify(Object.entries(r.blockKinds).sort()) ===
      JSON.stringify(Object.entries({ 'candidate-config': 45, 'expected-output': 10, 'harvested-state': 37, rollback: 39 }).sort()),
    JSON.stringify(r.blockKinds));
  // The `g` flag on the token regex makes RegExp state sticky; a second run must not differ.
  check('EF-DL1: running the lint twice yields the identical fact (no regex state leaks)',
    JSON.stringify(runDialectLint(pkg, contract)) === JSON.stringify(r));

  // CONTROLS — the exemption must not blind the absence half.
  const nginx = { platformDialect: { forbiddenTokens: ['allow all;'] } };
  const directive = ['## 2. Candidate config', '```', 'server {', '    listen 4318;', '    allow all;', '}', '```'].join('\n');
  check('EF-DL1 control: a real `allow all;` DIRECTIVE in candidate config is still a violation',
    runDialectLint(directive, nginx).violations.length === 1);
  const chained = ['## Apply', '```',
    "docker exec obs-ingress grep -q 'deny all;' /etc/nginx/conf.d/otlp.conf || echo 'allow all;' >> /etc/nginx/conf.d/otlp.conf",
    '```'].join('\n');
  const ch = runDialectLint(chained, nginx);
  check('EF-DL1 control: a WRITE chained after a grep (`|| echo \'allow all;\' >>`) is still a violation',
    ch.violations.length === 1 && !ch.searchPatternExempt, JSON.stringify(ch));
  // (Not led by `sed`: a block of lines starting with an OPERATOR_VERB is already kind `command`
  // and never scanned — including `sed -i`, which WRITES. Pre-existing, recorded, not widened here.)
  const both = ['## Apply', '```', "echo 'allow all;' >> f.conf && grep -c 'allow all;' f.conf", '```'].join('\n');
  check('EF-DL1 control: one directive occurrence on a line with a grep occurrence still flags the line',
    runDialectLint(both, nginx).violations.length === 1);
  const unquoted = ['## Verify', '```', 'docker exec ceos1 Cli -c "show running-config" | grep -c metric-style', '```'].join('\n');
  check('EF-DL1 boundary: an UNQUOTED grep pattern is not exempt (fails toward a visible flag)',
    runDialectLint(unquoted, CONTRACT).violations.length === 1);
  const kubectl = ['## Verify', '```', "kubectl exec -n trading deploy/rx -- grep -c -E 'metric-style|passive-interface' /etc/cfg", '```'].join('\n');
  const k = runDialectLint(kubectl, CONTRACT);
  check('EF-DL1: a quoted multi-token grep alternation under an exec wrapper exempts every token in it',
    k.violations.length === 0 && (k.searchPatternExempt ?? []).length === 2, JSON.stringify(k));
  // The R1/R3 true positives are asserted above and must stay flagged — re-assert here beside the
  // change so a regression names THIS fix.
  check('EF-DL1 does NOT blind R1/R3 — both incident packages still flag exactly as before',
    runDialectLint(R1_PACKAGE, CONTRACT).violations.length === 2
      && runDialectLint(R3_PACKAGE, CONTRACT).violations.length === 2
      && !runDialectLint(R1_PACKAGE, CONTRACT).searchPatternExempt);
}

// ── F1 — EF-DL2 commit 1 (2026-09-28): the heading-ancestry walk is FENCE-AWARE (`classifier: 2`) ──
// A `#` line inside a fenced block is CONTENT (CommonMark), never a heading. The old walk read it as a
// level-1 heading: its words were fed to classifyBlock, and it stopped the walk, hiding the block's
// real section heading. Every live fixture below is Author text pulled read-only from production;
// provenance in scripts/fixtures/dialect-lint/PROVENANCE.md. Each assertion states the NEW reading,
// so reverting F1 turns them red (mutation-proven at commit time). Where F1 produces a WRONG answer
// for a NEW reason, that is a NAMED RESIDUAL assertion — it pins today's behaviour on purpose, so the
// commit that fixes it has to flip it consciously (Phase D decision 2: re-measured at the health-run).
{
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const dir = path.join(__dirname, 'fixtures', 'dialect-lint');
  const rd = (n: string) => fs.readFileSync(path.join(dir, n), 'utf8');
  /** Regroup the per-line output into blocks, keyed by the block's first BODY line (1-indexed). */
  const blocksOf = (doc: string) => {
    const out = new Map<number, { n: number; kind: string; restoreIntent: boolean; label: string | null }>();
    let prev = -9; let start = 0;
    for (const b of fencedBlockLines(doc)) {
      if (b.line !== prev + 1) { start = b.line; out.set(start, { n: 0, kind: b.kind, restoreIntent: b.restoreIntent, label: b.label }); }
      out.get(start)!.n++; prev = b.line;
    }
    return out;
  };
  const at = (m: ReturnType<typeof blocksOf>, line: number) => m.get(line) ?? { n: 0, kind: 'MISSING', restoreIntent: false, label: null };

  // SYNTHETIC — the two effects, isolated.
  {
    const doc = ['## 2. Candidate HCL', '```hcl', '# NEW: enforce restrictions per security baseline', 'resource "x" "y" {}', '```', '',
      '## 3. Validation', '', '**Step 1 — validate**', '```', 'terraform validate', '```'].join('\n');
    const b = blocksOf(doc);
    check('F1 synthetic: an in-fence `# … baseline` comment is not an ancestor — a later validation block is NOT harvested-state',
      at(b, 11).kind !== 'harvested-state', JSON.stringify([...b]));
    const hid = ['### 3. Rollback Plan', '', '```bash', '# Find the commit hash', 'git log --oneline', '```', '',
      '```bash', 'git revert abc1234', '```'].join('\n');
    const h = blocksOf(hid);
    check('F1 synthetic: an in-fence `#` line no longer HIDES the section heading — the second rollback block has restoreIntent',
      at(h, 9).restoreIntent === true && at(h, 9).kind === 'rollback', JSON.stringify([...h]));
    // Bounded both ways: a real heading between two fences is still found, and a `#` line OUTSIDE a fence is still a heading.
    const real = ['# Title', '```', 'x', '```', '## Rollback', '```', 'no router ospf 1', '```'].join('\n');
    check('F1 synthetic control: a real heading AFTER a closed fence still governs the next block',
      at(blocksOf(real), 7).restoreIntent === true);
    // An UNCLOSED fence above: the forward loop swallows to EOF, so no later block exists to misread.
    const unclosed = ['## Rollback', '```', '# not a heading', 'no router ospf 1'].join('\n');
    check('F1 synthetic control: an unclosed fence yields ONE block and the walk above it is unaffected',
      blocksOf(unclosed).size === 1 && at(blocksOf(unclosed), 3).restoreIntent === true);
  }

  // THE CLASSIFIER VERSION (Phase D decision 4) — present exactly when the classifier ran.
  {
    // `as number`: the const is a literal type, and a mutation to another value must COMPILE and run red.
    check('DIALECT_LINT_CLASSIFIER is 3 (F1 made it 2; EF-DL2 commit 2 / option ac made it 3)', (DIALECT_LINT_CLASSIFIER as number) === 3);
    const withContract = runDialectLint(R1_PACKAGE, CONTRACT);
    check('F1: a classified stamp carries `classifier` (the module constant)', withContract.classifier === 3, JSON.stringify(withContract.classifier));
    const noTokens = runDialectLint(R1_PACKAGE, { platform: 'arista_eos' });
    check('F1: the no-banned-token-list arm still classified, so it carries `classifier` too', noTokens.classifier === 3);
    const noContract = runDialectLint(R1_PACKAGE, null);
    check('F1: the no-contract arm classified NOTHING and carries no `classifier` (its stamp stays byte-identical across the cut)',
      !('classifier' in noContract), JSON.stringify(noContract));
  }

  // LANE 3 LIVE #1 — terraform, exec cmrlm3hp5004cyxjwe6rhi55a. `# NEW: Enforce public-access restrictions per
  // security baseline` sits INSIDE the Part A HCL fence (doc L44). "baseline" matched HARVESTED_STATE_PROSE, so every
  // Part B command/expected block was kinded harvested-state; a `# KEEP …` inside the rollback HCL hid `### Part C`.
  {
    const b = blocksOf(rd('f1-tf-lane3-cmrlm3hp5004cyxjwe6rhi55a.md'));
    const partB = [73, 78, 89, 94, 105, 110];
    check('F1 live (cmrlm3hp): Part B validation blocks are no longer harvested-state (the in-fence "baseline" is not an ancestor)',
      partB.every((l) => at(b, l).kind !== 'harvested-state'), JSON.stringify(partB.map((l) => [l, at(b, l).kind])));
    check('F1 live (cmrlm3hp): Part B expected-output blocks read expected-output',
      [78, 94, 110].every((l) => at(b, l).kind === 'expected-output'), JSON.stringify([78, 94, 110].map((l) => [l, at(b, l).kind])));
    // NAMED RESIDUAL — NOT F1's: `tflint` / `terraform plan` are operator commands, but OPERATOR_VERB is
    // network/unix-only, so they fall to candidate-config (the pre-existing false-SCAN floor, EF-DL3).
    // L73 (`terraform validate`, under `**Command:**`) joined them at `classifier: 3`: under 2 it read
    // expected-output only because the window climbed over `#### B.1` into Part B's intro ("…expected
    // outputs are the FACTS…") — a wrong kind, not a right one. Bounded at the heading it is an operator
    // command falling to the default: one of the +104 false SCANs option (ac) was approved knowing.
    check('F1 live (cmrlm3hp) NAMED RESIDUAL (EF-DL3 floor): `terraform validate`, `tflint` and `terraform plan` land candidate-config, not command',
      [73, 89, 105].every((l) => at(b, l).kind === 'candidate-config'), JSON.stringify([73, 89, 105].map((l) => [l, at(b, l).kind])));
    check('F1 live (cmrlm3hp): the rollback section\'s plan/apply blocks are rollback with restoreIntent (Part C no longer hidden)',
      [178, 184].every((l) => at(b, l).kind === 'rollback' && at(b, l).restoreIntent), JSON.stringify([178, 184].map((l) => [l, at(b, l)])));
    check('F1 live (cmrlm3hp) CONTROL: the real Part A HCL stays candidate-config, restoreIntent false (F1 exempts no real config here)',
      at(b, 25).kind === 'candidate-config' && at(b, 25).restoreIntent === false && at(b, 25).n === 28);
  }

  // LANE 3 LIVE #2 — terraform, exec cmrmjqmko00fmyxlunmemx4vm. `# Find the commit hash …` inside a bash fence under
  // `### 3. Rollback Plan` hid the heading from the next block.
  {
    const b = blocksOf(rd('f1-tf-lane3-cmrmjqmko00fmyxlunmemx4vm.md'));
    check('F1 live (cmrmjqmko): the block after the in-fence `# Find the commit hash` has restoreIntent (was false)',
      at(b, 189).restoreIntent === true && at(b, 189).kind === 'rollback', JSON.stringify(at(b, 189)));
    check('F1 live (cmrmjqmko): Option B / Option C restore commands are rollback + restoreIntent (were candidate-config)',
      [213, 220].every((l) => at(b, l).kind === 'rollback' && at(b, l).restoreIntent), JSON.stringify([213, 220].map((l) => [l, at(b, l)])));
    check('F1 live (cmrmjqmko) CONTROL: both declarative HCL blocks stay candidate-config (33 real config lines still scanned)',
      at(b, 10).kind === 'candidate-config' && at(b, 36).kind === 'candidate-config' && at(b, 10).n + at(b, 36).n === 33);
  }

  // cms123vmf00ewyxv8wd5o7vbu (terraform Author). BOTH F1 outcomes in one package:
  //   (a) CORRECT — `   # Comment out or delete …` (3-space indent, inside a fence under `#### Option A`) hid
  //       `### Rollback Plan`; the Option A plan/apply/verify blocks now read restoreIntent.
  //   (b) TITLE LEAK — the document title is `# S3 Bucket Policy Change Package — HCL Rollback Author`. The old walk
  //       stopped at an in-fence `#` comment before reaching it; the fence-aware walk reaches it, so every block
  //       under `### Expected Validation Facts` inherits "Rollback" from the TITLE. Right structure, wrong reason.
  {
    const b = blocksOf(rd('f1-tf-restore-cms123vmf00ewyxv8wd5o7vbu.md'));
    check('F1 live (cms123): Option A plan/apply/verify blocks now carry restoreIntent (the section was hidden by an in-fence `#`)',
      [219, 223, 231, 237].every((l) => at(b, l).restoreIntent === true), JSON.stringify([219, 223, 231, 237].map((l) => [l, at(b, l)])));
    const validation = [63, 68, 79, 84, 101, 106, 111, 152, 193];
    check('F1 live (cms123) NAMED RESIDUAL (title leak, F-5 class): the 9 Expected-Validation blocks read rollback/restoreIntent from the document TITLE',
      validation.every((l) => at(b, l).kind === 'rollback' && at(b, l).restoreIntent === true),
      JSON.stringify(validation.map((l) => [l, at(b, l).kind, at(b, l).restoreIntent])));
  }

  // cmu3d42ls001pyxe35rmj6bap (terraform leg; Author cmu3eb2mh0077yxe3fpmtgx6d). The in-fence
  // `# ... existing bucket config unchanged ...` (doc L14) was a level-1 "heading" that stopped every later walk.
  // Under F1 the walk reaches the title `## Change Package: … (Phase 2 — HCL Rollback Author)` — the whole package
  // reads rollback. Structure is right (an in-fence line is not a heading); the title leak is a NAMED RESIDUAL.
  {
    const doc = rd('f1-tf-title-leak-cmu3d42ls001pyxe35rmj6bap.md');
    const b = blocksOf(doc);
    check('F1 live (cmu3d42): the in-fence `# ... existing bucket config unchanged` no longer stops the walk — `terraform validate` reaches `### 2.` and the title',
      at(b, 48).kind === 'rollback' && at(b, 48).restoreIntent === true && at(b, 48).label === 'verification', JSON.stringify(at(b, 48)));
    check('F1 live (cmu3d42) NAMED RESIDUAL F028: the shipped rego policy (11 lines, real config) is exempt as rollback via the TITLE — a new false SKIP',
      at(b, 81).kind === 'rollback' && at(b, 81).n === 11, JSON.stringify(at(b, 81)));
    check('F1 live (cmu3d42) NAMED RESIDUAL: the whole package reads rollback except its marker JSON (blockKinds {rollback:49, candidate-config:1})',
      JSON.stringify(runDialectLint(doc, {}).blockKinds) === JSON.stringify({ rollback: 49, 'candidate-config': 1 }),
      JSON.stringify(runDialectLint(doc, {}).blockKinds));
    check('F1 live (cmu3d42): no fact-level effect — the package carries no banned-token list, so nothing is scanned either way',
      runDialectLint(doc, {}).reason === 'no-banned-token-list');
  }

  // cmu7h6erg002oyx3c7v7ydlao (terraform leg; Author cmu7kor9700dhyx3cecci293s). `# Revert: delete …` inside the
  // rollback HCL fence (doc L92) was an h1 ancestor of everything after it.
  {
    const doc = rd('f1-tf-marker-json-cmu7h6erg002oyx3c7v7ydlao.md');
    const b = blocksOf(doc);
    check('F1 live (cmu7h6erg): a change-ORDERING block no longer inherits restoreIntent from an in-fence `# Revert:` (true -> false)',
      at(b, 108).restoreIntent === false, JSON.stringify(at(b, 108)));
    check('F1 live (cmu7h6erg) NAMED RESIDUAL F035: the `## Consumed Values` marker JSON is now candidate-config — a new false SCAN (EF-DL3 floor class: marker JSON is scanned)',
      at(b, 127).kind === 'candidate-config' && at(b, 127).restoreIntent === false, JSON.stringify(at(b, 127)));
  }

  // EF-DL1 observability Author (cmuhn7bmx009ryxcrzmoauxib, existing fixture): the two blocks under the rollback
  // section behind the rollback HCL now carry restoreIntent; KINDS do not move (asserted by the EF-DL1 block above).
  {
    const b = blocksOf(rd('ef-dl1-obs-ingress-author-2026-09-26.md'));
    check('F1 live (EF-DL1 obs Author): the post-rollback verification + expected blocks now carry restoreIntent',
      at(b, 217).restoreIntent === true && at(b, 221).restoreIntent === true, JSON.stringify([at(b, 217), at(b, 221)]));
  }
}

// ── EF-DL2 commit 2 — option (ac) (`classifier: 3`, 2026-09-28) ───────────────────────────────────
// (a) the 3-line prose window stops AT the first heading, heading INCLUDED; (c) `harvested-state` is
// decided only from the block's own label (`labelProse`, ≤ MAX_LABEL_CHARS) or the heading ancestry.
// Live fixtures are Author `finalResponse`s pulled read-only from production (md5-verified against the
// lane-1 corpus; PROVENANCE.md). Every one below read WRONG under classifier 2 and each assertion states
// the NEW reading, so reverting either half turns some of them red (mutation-proven at commit time).
// Both directions: the "fix" fixtures must now SCAN real config, and the "must stay exempt" fixtures
// guard the two ways this change could have regressed (a rollback carrying a banned token; a long
// `**Expected output**` label — the R9 class that earned classification in the first place).
{
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const dir = path.join(__dirname, 'fixtures', 'dialect-lint');
  const rd = (n: string) => fs.readFileSync(path.join(dir, n), 'utf8');
  const rj = (n: string) => JSON.parse(rd(n));
  const blocksOf = (doc: string) => {
    const out = new Map<number, { n: number; kind: string; restoreIntent: boolean; label: string | null }>();
    let prev = -9; let start = 0;
    for (const b of fencedBlockLines(doc)) {
      if (b.line !== prev + 1) { start = b.line; out.set(start, { n: 0, kind: b.kind, restoreIntent: b.restoreIntent, label: b.label }); }
      out.get(start)!.n++; prev = b.line;
    }
    return out;
  };
  const at = (m: ReturnType<typeof blocksOf>, line: number) => m.get(line) ?? { n: 0, kind: 'MISSING', restoreIntent: false, label: null };
  const show = (m: ReturnType<typeof blocksOf>, ls: number[]) => JSON.stringify(ls.map((l) => [l, at(m, l)]));

  // SYNTHETIC — each half isolated, plus the load-bearing inclusive-heading pin.
  {
    // (a) the window must not cross the block's own heading into the previous section. The leaked line
    // carries a ROLLBACK word on purpose: a harvest word alone would be rescued by (c) and pin nothing
    // about (a) (it did, in the first draft — mutation-proven).
    const crosses = ['## 1. Inputs', '', 'Values come from the Phase 0 Harvester; the rollback plan is in section 4.', '',
      '## 2. Full Desired-State Config File', '```', 'server {', '    listen 4318;', '}', '```'].join('\n');
    check('EF-DL2 synthetic (a): prose in the PREVIOUS section (a rollback word) does not kind the block below the next heading',
      at(blocksOf(crosses), 7).kind === 'candidate-config', show(blocksOf(crosses), [7]));
    // (c) a long own-section SENTENCE naming the harvest is not a label; a short label and a heading are.
    const sentence = 'Dialect note: transcribed directly from the observed convention on ceos1\'s own harvested '
      + '`show running-config` — no contract stanza template was supplied for this protocol.';
    const long = ['## Candidate', '', sentence, '```', 'interface Loopback14', '   ip address 10.99.0.30/32', '```'].join('\n');
    check('EF-DL2 synthetic (c): a >120-char own-section sentence naming "harvested" does NOT exempt real config',
      sentence.length > 120 && at(blocksOf(long), 5).kind === 'candidate-config', show(blocksOf(long), [5]));
    const short = ['## Evidence', '', '**Harvested baseline (ceos2):**', '```', 'router ospf 1', '```'].join('\n');
    check('EF-DL2 synthetic (c) CONTROL: a SHORT harvest label still kinds its block harvested-state',
      at(blocksOf(short), 5).kind === 'harvested-state');
    const head = ['## Harvested OSPF baseline', '', 'Quoted from the device, as captured before any change was made to it.', '```', 'router ospf 1', '```'].join('\n');
    check('EF-DL2 synthetic (c) CONTROL: a harvest word in a HEADING ancestor still kinds its block harvested-state',
      at(blocksOf(head), 5).kind === 'harvested-state');
    // THE LABEL PIN (panel F-9, the `acx` control): when the nearest non-empty line IS the heading, the
    // heading must stay IN the window, so ctx[0], `labelProse` and `label` do not move. Excluding it moved
    // `label` on 59 archived blocks, and net #3 scopes on `label`.
    const lab = ['Run this to verify the change.', '', '### Expected output (ceos1)', '```', 'Loopback14 is up', '```'].join('\n');
    check('EF-DL2 label pin: a heading that is the nearest line still LABELS the block (expected-output)',
      at(blocksOf(lab), 5).label === 'expected-output' && at(blocksOf(lab), 5).kind === 'expected-output', show(blocksOf(lab), [5]));
    const rb = ['Prose above.', '', '### ceos1 — Rollback', '```', 'no interface Loopback14', '```'].join('\n');
    check('EF-DL2 label pin: a rollback heading directly above a block is its kind AND its restoreIntent',
      at(blocksOf(rb), 5).kind === 'rollback' && at(blocksOf(rb), 5).restoreIntent === true);
  }

  // EF-DL1 package (observability, leg cmuhmm2u5006byxcq64ndua1v) — the instance that filed EF-DL2.
  {
    const doc = rd('ef-dl1-obs-ingress-author-2026-09-26.md');
    const r = runDialectLint(doc, rj('ef-dl1-obs-ingress-contract-2026-09-26.json'));
    const b = blocksOf(doc);
    check('EF-DL2 live (EF-DL1 pkg): PRESENCE 0/2 -> 2/2 — the desired-state file is finally read',
      r.transcription.checked === true && r.transcription.linesPresent === 2 && r.transcription.linesRequired === 2,
      JSON.stringify(r.transcription));
    check('EF-DL2 live (EF-DL1 pkg): the 40-line desired-state config under `## 2.` is candidate-config (was harvested-state)',
      at(b, 17).kind === 'candidate-config' && at(b, 17).n === 40, show(b, [17]));
    check('EF-DL2 live (EF-DL1 pkg): its rollback (D243, 37 lines, carrying `allow all;`) lands rollback + restoreIntent — still exempt',
      at(b, 174).kind === 'rollback' && at(b, 174).restoreIntent === true && at(b, 174).n === 37
        && fencedBlockLines(doc).some((x) => x.line > 174 && x.line < 212 && /allow all;/.test(x.text)), show(b, [174]));
    check('EF-DL2 live (EF-DL1 pkg): still 0 violations — scanning the real config found nothing, the rollback\'s `allow all;` is not flagged',
      r.violations.length === 0 && (r.searchPatternExempt ?? []).length === 1, JSON.stringify(r.violations));
  }

  // R12 DEPLOY (network, leg cmt9vs7ub000eyxmjrdx4ejjn) — the window-crosses-heading shape, in a token package.
  {
    const doc = rd('ef-dl2-r12-deploy-cmt9vs7ub000eyxmjrdx4ejjn.md');
    const r = runDialectLint(doc, rj('ef-dl2-r12-deploy-cmt9vs7ub000eyxmjrdx4ejjn-contract.json'));
    const b = blocksOf(doc);
    check('EF-DL2 live (R12 deploy): PRESENCE 0/10 -> 10/10 on a package that carries the whole stanza',
      r.transcription.linesPresent === 10 && r.transcription.linesRequired === 10, JSON.stringify(r.transcription));
    check('EF-DL2 live (R12 deploy): the stanza is found on BOTH devices (every per-line occurrence >= 2)',
      (r.transcription.lines ?? []).every((l) => l.occurrences >= 2), JSON.stringify((r.transcription.lines ?? []).map((l) => l.occurrences)));
    check('EF-DL2 live (R12 deploy): both `### ceosN — Candidate Configuration` blocks are candidate-config (were harvested-state)',
      [16, 77].every((l) => at(b, l).kind === 'candidate-config' && at(b, l).n === 14), show(b, [16, 77]));
    check('EF-DL2 live (R12 deploy) CONTROL: both `### ceosN — Rollback` blocks are rollback + restoreIntent',
      [60, 121].every((l) => at(b, l).kind === 'rollback' && at(b, l).restoreIntent), show(b, [60, 121]));
    check('EF-DL2 live (R12 deploy): scanning 28 real config lines raises 0 violations (the package was clean)',
      r.checked === true && r.tokensConsidered.length === 3 && r.violations.length === 0, JSON.stringify(r.violations));
  }

  // D076 (network, leg cmu236uev00nyyxvrntaxjv9s) — WHY (a) ALONE IS NOT ENOUGH. The sentence naming the harvest
  // is INSIDE the block's own section, so bounding the window changes nothing; only (c) — the 120-char label
  // rule — tells a sentence ABOUT provenance from a label OF the block.
  {
    const doc = rd('ef-dl2-d076-dialect-note-cmu236uev00nyyxvrntaxjv9s.md');
    const b = blocksOf(doc);
    check('EF-DL2 live (D076): the ceos1 deploy stanza under a long "own harvested `show running-config`" dialect note is candidate-config',
      at(b, 46).kind === 'candidate-config' && at(b, 46).n === 11, show(b, [46]));
    // COST, named (panel F-6 / audit A4): the two marker JSON blocks are now scanned. Both carry a >120-char
    // provenance line, so (c) no longer reads them as harvest. Non-config (O/H), 0 violations on the archive.
    check('EF-DL2 live (D076) NAMED COST: the `## Pre-existing Allocations` / `## Derived Values` JSON blocks are candidate-config (false SCAN, EF-DL3 floor class)',
      at(b, 8).kind === 'candidate-config' && at(b, 31).kind === 'candidate-config', show(b, [8, 31]));
  }

  // D137 (observability, leg cmu6lojrs00j9yxqffg3qc2in) + D241 (terraform, token package, leg cmuhmm2sm0064yxcqx8hezp92).
  {
    const o = blocksOf(rd('ef-dl2-d137-obs-rule-file-cmu6lojrs00j9yxqffg3qc2in.md'));
    check('EF-DL2 live (D137): the observability desired-state rule file is candidate-config (was harvested-state)',
      at(o, 42).kind === 'candidate-config' && at(o, 42).n === 13, show(o, [42]));
    const doc = rd('ef-dl2-d241-tf-hcl-diff-cmuhmm2sm0064yxcqx8hezp92.md');
    const t = blocksOf(doc);
    check('EF-DL2 live (D241): the terraform HCL diff (22 lines) is candidate-config (was harvested-state)',
      at(t, 8).kind === 'candidate-config' && at(t, 8).n === 22, show(t, [8]));
    const r = runDialectLint(doc, rj('ef-dl2-d241-tf-hcl-diff-cmuhmm2sm0064yxcqx8hezp92-contract.json'));
    check('EF-DL2 live (D241): in a banned-token package, the HCL diff is now actually scanned — and is clean',
      r.checked === true && r.tokensConsidered.length > 0 && (r.blockKinds['candidate-config'] ?? 0) >= 22 && r.violations.length === 0,
      JSON.stringify({ k: r.blockKinds, v: r.violations }));
  }

  // MUST STAY EXEMPT — D042 (network, token package, leg cmtc941hi0035yx5pdsgb2q8i). An OSPF rollback embedded
  // verbatim from harvest, carrying `passive-interface` — a token the contract FORBIDS under `router isis`. Under
  // classifier 2 it was exempt as harvested-state via the window's "EMBEDDED VERBATIM from the Phase 0 harvest";
  // (c) removes that input, and it must stay exempt through the rollback rule on the SAME window.
  {
    const doc = rd('ef-dl2-d042-ospf-rollback-cmtc941hi0035yx5pdsgb2q8i.md');
    const r = runDialectLint(doc, rj('ef-dl2-d042-ospf-rollback-cmtc941hi0035yx5pdsgb2q8i-contract.json'));
    const b = blocksOf(doc);
    check('EF-DL2 live (D042) MUST STAY EXEMPT: the contract forbids `passive-interface` and the rollback carries it',
      r.tokensConsidered.includes('passive-interface')
        && fencedBlockLines(doc).some((x) => x.line > 184 && x.line < 195 && /passive-interface/.test(x.text)));
    check('EF-DL2 live (D042) MUST STAY EXEMPT: the `### 4.1 ceos1 rollback` block is rollback + restoreIntent (now via rollback, was harvested-state)',
      at(b, 184).kind === 'rollback' && at(b, 184).restoreIntent === true && at(b, 184).n === 10, show(b, [184]));
    check('EF-DL2 live (D042) MUST STAY EXEMPT: 0 violations', r.violations.length === 0, JSON.stringify(r.violations));
  }

  // MUST STAY EXEMPT — D052 (kubernetes, token package, leg cmtxqjequ000ayxw6xfkvycvp). A `**Expected output**`
  // label LONGER than MAX_LABEL_CHARS. (ac) deliberately leaves the expected-output decision on the window; the
  // rejected (b2) capped it too and re-scanned 10 expected-output blocks like this one — the R9 class.
  {
    const doc = rd('ef-dl2-d052-k8s-expected-cmtxqjequ000ayxw6xfkvycvp.md');
    const b = blocksOf(doc);
    check('EF-DL2 live (D052) MUST STAY EXEMPT: a >120-char `**Expected output** (…)` label stays expected-output',
      at(b, 124).kind === 'expected-output' && at(b, 124).n === 25, show(b, [124]));
    const r = runDialectLint(doc, rj('ef-dl2-d052-k8s-expected-cmtxqjequ000ayxw6xfkvycvp-contract.json'));
    check('EF-DL2 live (D052): 0 violations', r.checked === true && r.violations.length === 0, JSON.stringify(r.violations));
  }

  // NAMED PRE-FIX RESIDUAL — D098 (network, token package, leg cmu4wyjzv006syx8ybnafzc9n), "Candidate A". Real
  // config, kinded rollback: its only window line is a >120-char capture instruction ending "…(ii) the rollback
  // baseline.", and ROLLBACK_PROSE still reads the window (only the harvest decision moved to the label). Fixing
  // it needs the rollback decision label-capped too — which re-scans long expected-output labels (D052 above).
  // Steve, Phase D decision 3: RECORDED, NOT a (d) trigger. This assertion pins today's wrong answer on
  // purpose, so the change that fixes it flips it consciously.
  {
    const b = blocksOf(rd('ef-dl2-d098-residual-cmu4wyjzv006syx8ybnafzc9n.md'));
    check('EF-DL2 live (D098) NAMED RESIDUAL: real "Candidate A" config (10 lines) is exempt as rollback — a known false SKIP',
      at(b, 82).kind === 'rollback' && at(b, 82).n === 10 && at(b, 82).restoreIntent === false, show(b, [82]));
  }
}

console.log(`Total Passed: ${passed}`);
console.log(`Total Failed: ${failed}`);

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
if (failed > 0) {
  console.log('\n❌ dialect-lint fixtures FAILED');
  process.exit(1);
}
console.log('\n✅ dialect-lint fixtures PASSED');
process.exit(0);
