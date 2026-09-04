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

console.log(`Total Passed: ${passed}`);
console.log(`Total Failed: ${failed}`);

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
if (failed > 0) {
  console.log('\n❌ dialect-lint fixtures FAILED');
  process.exit(1);
}
console.log('\n✅ dialect-lint fixtures PASSED');
process.exit(0);
