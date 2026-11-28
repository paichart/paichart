#!/usr/bin/env ts-node
/**
 * PLATFORM-HELD-BYTES Stage B V-8 — every protocol-keyed SITE names the held variant or carries an exclusion with its reason
 * (plan STAGE-B-PLAN.md v4.1 §3 V-8, D-7 table; arch N-5′). Scope: lib/, app/, scripts/ (TypeScript AST, so a multi-line array
 * or an object map is seen the same as a one-line one — the class a line grep misses).
 *
 * A SITE is:
 *   (1) an array literal holding ≥ 2 known domain-protocol tokens (short or `-protocol` form);
 *   (2) an object literal with ≥ 2 known tokens as KEYS;
 *   (3) a `canonicalProtocolName('<known token>')` call — a scalar compared canonically to one domain.
 * A site PASSES when its text names the variant (`observability-config-held` or a `HELD_VARIANT_*` identifier) or it is listed in
 * EXCLUSIONS with a reason. A listed exclusion that no longer matches a site is itself a failure (a stale reason reads as a decision
 * nobody made). Mutation-proven: dropping a variant name from an included site, or adding an unlisted site, turns this red.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { execFileSync } from 'child_process';

const ROOT = path.join(__dirname, '..');
const TOKENS = ['network-provisioning', 'kubernetes-gitops', 'terraform-iac', 'observability-config', 'network-derivation'];
const isToken = (s: string) => TOKENS.some((t) => s === t || s === `${t}-protocol`);
// Phase 10 (2026-10-17): a site also passes when it names the held CAPABILITY (HELD_CAPABLE_PROTOCOLS / HELD_OBS_PROTOCOL) — the
// variant is folded into obs, so "considers held" is the property, and the retired token is one member of the set.
const NAMES_VARIANT = /observability-config-held|HELD_VARIANT_(PROTOCOL|TOKEN)|HELD_CAPABLE_PROTOCOLS|HELD_OBS_PROTOCOL/;

/** `file::anchor` → reason. The anchor is the enclosing declaration / property name (stable across line moves). */
export const EXCLUSIONS: Readonly<Record<string, string>> = {
  'scripts/test-plan-spawn-carry-behavioral.ts::deviceSources':
    'ARCHITECT-COMPOSED-DESCRIPTOR real-create-path fixture (2026-11-17): a program plan whose deviceSources / serviceDescriptors are keyed by live leg protocol tokens; a contract shape, not a held-capability or protocol selection',
  'scripts/test-plan-spawn-carry-behavioral.ts::serviceDescriptors':
    'ARCHITECT-COMPOSED-DESCRIPTOR real-create-path fixture (2026-11-17): a program plan whose deviceSources / serviceDescriptors are keyed by live leg protocol tokens; a contract shape, not a held-capability or protocol selection',
  'scripts/test-plan-spawn-carry-behavioral.ts::SD_EXPECTED':
    'ARCHITECT-COMPOSED-DESCRIPTOR real-create-path fixture (2026-11-17): a program plan whose deviceSources / serviceDescriptors are keyed by live leg protocol tokens; a contract shape, not a held-capability or protocol selection',
  // Config sources STEP 4 (terraform-iac 1.17.0): the DESCRIPTOR_ONLY_TOKENS exclusion was removed — with terraform-iac gone the list names
  // one token and is no longer a protocol-keyed site; re-add the exclusion if a second descriptor-only token joins.
  'scripts/test-service-descriptors-derivation.ts::test:K1 equal to the derived value ⇒ the SAME object back (byte-i':
    'ARCHITECT-COMPOSED-DESCRIPTOR fixture (2026-11-17): a contract serviceDescriptors / sources map keyed by live leg protocol tokens, proving the platform derivation; a contract shape, not a held-capability or protocol selection',
  'scripts/test-service-descriptors-derivation.ts::test:K3 the Architect left the entry out ⇒ ADDED from the line (a':
    'ARCHITECT-COMPOSED-DESCRIPTOR fixture (2026-11-17): a contract serviceDescriptors / sources map keyed by live leg protocol tokens, proving the platform derivation; a contract shape, not a held-capability or protocol selection',
  'scripts/test-service-descriptors-derivation.ts::test:K4 the field absent altogether ⇒ created from the lines, app':
    'ARCHITECT-COMPOSED-DESCRIPTOR fixture (2026-11-17): a contract serviceDescriptors / sources map keyed by live leg protocol tokens, proving the platform derivation; a contract shape, not a held-capability or protocol selection',
  'scripts/test-service-descriptors-derivation.ts::serviceDescriptors':
    'ARCHITECT-COMPOSED-DESCRIPTOR fixture (2026-11-17): a contract serviceDescriptors / sources map keyed by live leg protocol tokens, proving the platform derivation; a contract shape, not a held-capability or protocol selection',
  'scripts/test-service-descriptors-derivation.ts::test:P0 descriptorWithoutServiceLine: observability keep; Kuberne':
    'Config sources STEP 3 slice P4 (2026-11-22): the pin of the lane table\'s descriptorWithoutServiceLine column, one value per Config-sources protocol row; which rows exist is the table\'s question (CONFIG_SOURCE_LANES), not a held-capability selection',
  'scripts/test-service-descriptors-derivation.ts::configSources':
    'Config sources STEP 3 slice P4 fixture (2026-11-22): a contract serviceDescriptors / configSources map keyed by live leg protocol tokens, proving the five cases of the platform derivation in both awaiting states; a contract shape, not a held-capability or protocol selection',
  'scripts/test-service-descriptors-derivation.ts::test:P8 a four-domain contract: the observability arm changes ONL':
    'Config sources STEP 3 slice P4 fixture (2026-11-22): a contract serviceDescriptors / configSources map keyed by live leg protocol tokens, proving the five cases of the platform derivation in both awaiting states; a contract shape, not a held-capability or protocol selection',
  'scripts/test-gate-check-spec.ts::deviceSources':
    'Config sources STEP 3 slice P4 fixture (2026-11-22, plan W11): a plan contract deviceSources / configSources map keyed by live leg protocol tokens, compared with a spec by the --spec option of the gate report; a contract shape, not a held-capability or protocol selection',
  'scripts/test-gate-check-spec.ts::configSources':
    'Config sources STEP 3 slice P4 fixture (2026-11-22, plan W11): a plan contract deviceSources / configSources map keyed by live leg protocol tokens, compared with a spec by the --spec option of the gate report; a contract shape, not a held-capability or protocol selection',
  'lib/agents/harness/rollback-containment.ts::DESIRED_STATE_LANES':
    'held-capable legs are adjudicated by the held arm FIRST (V-8a restore-is-held-base, keyed on isHeldCapableProtocol); a held-capable desired-state lane never reaches the content arms (K-4, held-k8s 1f)',
  'lib/agents/harness/held-bytes/variant.ts::GIT_FILE_SOURCE_PROTOCOLS':
    'held-k8s 1b: scopes which legs may CAPTURE a Git file-source read (github-service) — a different question from held-capability; the retired obs variant reads no Git file source, and HELD_CAPABLE_PROTOCOLS is checked separately',
  'lib/agents/harness/held-bytes/variant.ts::DEVICE_SOURCE_LANES':
    'held-network step 3 batch 2b (+ VALUE-LEG-GIT 2026-11-06: the lane table DEVICE_SOURCE_PROTOCOLS is derived from): scopes which legs declare Device sources (the device-read capture lane, change lane only) — a capture-scope set like GIT_FILE_SOURCE_PROTOCOLS, a different question from held-capability; the retired obs variant declares no device sources',
  'lib/agents/harness/held-bytes/variant.ts::CONFIG_SOURCE_LANES':
    'Config sources STEP 2 (owner decision (b), 2026-11-15): the lane table of protocols that declare a `## Config sources` block (contract field configSources) — a declaration-scope set, not held-capability; kept SEPARATE from DEVICE_SOURCE_LANES on purpose (test-config-sources MIX1); the retired obs variant declares none',
  'scripts/test-git-live-drift.ts::test:TF1 the method table: Kubernetes = the compare tool; Terrafo':
    'Config sources STEP 4 fixture: the expected GIT_LIVE_DRIFT_METHODS table, restated to pin it — not a protocol selection',
  'scripts/test-file-source-compare.ts::test:W4a the rows that say `service-call` are exactly Kubernetes;':
    'Config sources STEP 3 P3 fixture (plan W4): the protocol spellings — long names, short tokens, prototype names, none — handed to the shipping no-call guard to prove which make a service call (Kubernetes only); a guard truth table, not a protocol selection',
  'scripts/test-file-source-compare.ts::test:F5 (architectural) ONE helper says "a leg of a runs-undeclar':
    'Config sources STEP 3 P3 fix round (architectural F5): the protocol spellings handed to the shipping no-block helper to prove which protocol runs undeclared (observability only) — a helper truth table, not a protocol selection',
  'scripts/test-security-invariants.ts::test:PD-W4 the guard is false for a null, empty, unknown or proto':
    'Config sources STEP 3 P3 security pin (plan W4, sec-ops F-7): the protocol names for which the no-call guard must answer false (observability, Terraform, unknown and prototype names) — a guard truth table, not a protocol selection',
  'scripts/test-git-live-drift.ts::<top>':
    'Config sources STEP 4 TF4 fixture: the two spellings of the terraform-iac protocol a caller may pass (long name, short token) to prove neither makes a drift call — not a protocol selection',
  'scripts/test-leg-replay-lab.ts::test:LCT2 (L-CS-K-b on Terraform) a 1.17.0 Terraform arm NEVER ma':
    'Config sources STEP 4 slice 4 fixture: the protocol spellings a lab caller may pass (terraform long/short; k8s and none for the control) to prove the lab drift lever follows the shipping method table — not a protocol selection',
  'scripts/test-config-sources-step3.ts::mixed':
    'Config sources STEP 3 P1 fixture (GV4): a mixed program\'s interface contract whose configSources is keyed by two leg protocol tokens, proving each leg resolves only its own key — a contract shape, not a protocol selection',
  'scripts/test-requirements-sources.ts::configKeys':
    'Config sources STEP 4 (requirements-authoring, terraform-iac 1.17.0): TK9 pins the PRE-1.17.0 Config-sources key set to prove the single-protocol no-map result — a fixture of the check\'s injectable key set, not a protocol selection',
  'lib/agents/harness/git-live-drift.ts::GIT_LIVE_DRIFT_METHODS':
    'Config sources STEP 4 (owner Tb = B2, D-T1, 2026-11-17): the Git-vs-live METHOD of each Config-sources protocol (Kubernetes: the compare tool; Terraform: none ⇒ no call, gitLiveDrift not-checked no-git-vs-live-method) — a drift-method key, not held-capability; the retired obs variant declares no Config sources',
  // (`variant.ts::CONFIG_SOURCE_AWAITING_TEXT` — removed at the observability-config 1.12.0 join, 2026-11-23: the list is empty again,
  // so it names no protocol and the exclusion matched no site. It was here from STEP 3 P1; before that it was removed at STEP 4.
  // Re-add it with its reason if a row is ever put back on the list.)
  'lib/agents/harness/config-sources.ts::CONFIG_LABEL_TABLE_BY_PROTOCOL':
    'Config sources STEP 3 P1: which Config-sources protocols check their block labels against the platform file targets (observability-config) — a grammar property, not held-capability; the retired obs variant declares no Config sources',
  'scripts/test-config-sources.ts::configSources':
    'Config sources STEP 4 TFML3 fixture (mixed program): an interfaceContract.configSources keyed by the k8s and terraform contract keys beside deviceSources — a contract shape proving the fields and keys do not mix, not a protocol selection',
  'lib/agents/harness/config-sources.ts::CONFIG_SOURCE_PAIRING_BY_PROTOCOL':
    'Config sources STEP 3 P1 (2026-11-21): how a protocol\'s `## Config sources` lines may share a label (the pair rule keys on this) — a grammar property per Config-sources protocol, not held-capability; the retired obs variant declares no Config sources',
  'lib/agents/harness/config-sources.ts::CONFIG_SOURCE_KINDS_BY_PROTOCOL':
    'Config sources STEP 2 (2026-11-15): the per-protocol KIND table of the `## Config sources` grammar — which line kinds a protocol\'s block admits, a different question from held-capability; the retired obs variant declares no Config sources (observability joins by its own row at step 3)',
  'scripts/test-config-sources.ts::deviceSources':
    'Config sources STEP 2 ML3 fixture (mixed program): an interfaceContract.deviceSources keyed by the network protocols\' own contract keys beside a configSources key — a contract shape proving the two fields do not mix, not a protocol selection; obs declares neither',
  'scripts/test-config-sources.ts::test:CS4 a protocol with no kind table declares no Config sources':
    'Config sources STEP 2 fixture: lists protocols that have NO Config-sources kind table today (network, and domains not built yet) to prove they parse as declaring none — not a protocol selection',
  'lib/agents/harness/held-bytes/variant.ts::HELD_JOIN_VERSIONS':
    'held-k8s 1g/step 3: this IS the held-capable table (HELD_CAPABLE_PROTOCOLS = its keys minus HELD_JOIN_AWAITING_TEXT); a domain joins by adding its row, and the retired variant is deliberately not a member (Phase 10 D4)',
  'scripts/test-leg-replay-lab.ts::mk':
    'LVLG7 (B12, 2026-11-07): a test fixture builder that copies the two NETWORK golden protocol pins into a scratch lab to prove golden-build carries reached standing nodes — it lists the protocols a lab EDITS, not a held-capability set; no variant applies',
  'lib/agents/harness/live-evidence.ts::LIVE_EVIDENCE_MIN_VERSIONS':
    'Config-sources network push 1a (EF-S3): the released Config-sources VERSION per protocol that liveEvidence is stamped at — a version key on the leg\'s composed protocol, a different question from held-capability; the retired obs variant has no Config-sources text and observability joins with its own row at its own code push',
  'lib/agents/harness/live-evidence.ts::GIT_ONLY_WORD_MIN_VERSIONS':
    'network text batch 1 (2026-11-07): the protocol version from which the CHANGE lane\'s liveEvidence summary may read `git-only` — a Config-sources version key on the Harvester\'s composed protocol (same reason as LIVE_EVIDENCE_MIN_VERSIONS), not held-capability; the retired obs variant has no Config-sources text',
  // held-network push 3: the HELD_JOIN_AWAITING_TEXT exclusion was removed with network's entry (the list is empty, so no site);
  // a domain that next joins ahead of its text re-adds it (reason: the subtraction from the held-capable table).
  'lib/agents/harness/protocol-marker-mandates.ts::PROTOCOL_MARKER_MANDATES':
    'HS-FU5 (2026-10-31): a projection of the seed\'s emitsMarkers for NON-DEPRECATED rows only; the retired obs variant is excluded ON PURPOSE (its tombstone declares none while its live body mandated Consumed Values; projecting it moved 15 stored renders) and a retired row cannot run, so it reads as unknown ⇒ the marker line renders as before',
  'scripts/test-protocol-marker-mandates.ts::<top>':
    'HS-FU5 test fixture: asserts the marker-mandating infra protocols are NOT none; the retired obs variant is deliberately absent from the projection (see PROTOCOL_MARKER_MANDATES)',
  'scripts/test-protocol-marker-mandates.ts::variants':
    'HS-FU5 byte-identity fixture over the live infra protocols; the retired obs variant is unknown to the projection by design and is covered by the unknown-protocol row',
  'lib/agents/harness/spec-check-shared.ts::LEG_TOKENS':
    'Phase 10: held is a capability OF the obs token, not a token — specs key obs rows on observability-config and never name the retired variant token (PH-6 inventory P-6). Moved 2026-11-28 from requirements-coverage.ts (parcel A; requirements-clauses/-citations TOKENS deleted with their modules)',
  'lib/agents/harness/protocol-dependence-anchors.ts::PROTOCOL_DEPENDENCE_ANCHORS':
    'Phase 10: the variant row is a DEPRECATED tombstone that composes nothing, so it carries no base-dependence anchors (value-chain-program tombstone precedent)',
  'scripts/render-public-protocols.ts::PROTOCOLS':
    'Phase 10: the variant row is a DEPRECATED tombstone the completeness guard no longer sees; obs ≥ 1.10.0 publishes the held text and R6/PH-7 hold the export until the self-host text exists',
  'scripts/test-validation-shape-contract.ts::test:every domain protocol that carries the rule was VERSION-BUMP': 'a SOURCE-text changelog pin keyed on name literals; the retired variant has no source entry or changelog of its own',
  'scripts/test-program-protocol-token.ts::test:canonicalProtocolName: pure suffix rule, no I/O, idempotent': 'a pure suffix-rule example; no protocol set',
  'scripts/test-held-variant.ts::test:held-k8s 1b-scope + step 3: a leaf under a kubernetes-gitops':
    'held-terraform step 1: pins GIT_FILE_SOURCE_PROTOCOLS (a capture-scope set, excluded above for the same reason) — the retired obs variant reads no Git file source',
  'scripts/test-device-read-capture.ts::test:VLG1 the lane table: change = network-provisioning, value = ':
    'VALUE-LEG-GIT (2026-11-06): pins the Device-sources LANE table (DEVICE_SOURCE_LANES, excluded above for the same reason) — a capture-scope set, not held-capability; the retired obs variant declares no device sources',
  'scripts/test-device-read-capture.ts::deviceSources':
    'VALUE-LEG-GIT VLG4 fixture: an interfaceContract.deviceSources keyed by the network protocols\' own contract keys — a contract shape, not a protocol selection; obs declares no device sources',
  'scripts/test-live-evidence.ts::test:LE6 version keying: stamped only at/above the released Confi':
    'pins LIVE_EVIDENCE_MIN_VERSIONS (excluded above for the same reason: a Config-sources version key, not held-capability)',
  'scripts/test-live-evidence.ts::deviceSources':
    'VALUE-LEG-GIT LE21 fixture: an interfaceContract.deviceSources keyed by the network protocols\' own contract keys — a contract shape, not a protocol selection; obs declares no device sources',
  'scripts/test-canary-req-sources.ts::GOOD':
    'first generated network spec canary (2026-11-10) fixture: an interfaceContract.deviceSources keyed by the network protocols\' own contract keys - a contract shape, not a protocol selection; obs declares no device sources',
  'scripts/test-canary-req-sources.ts::CFG_GOOD': 'Config sources canary control (2026-11-27) fixture: an interfaceContract.configSources keyed by the config protocols\' own contract keys (terraform-iac, kubernetes-gitops) - a contract shape, not a protocol selection; the held variant is a capability of observability-config, not a key',
  'scripts/test-canary-req-sources.ts::<top>':
    'first generated network spec canary (2026-11-10) fixtures: leg carriers stamped with the network protocols (value and change lane) and contracts keyed by their contract keys - a contract shape, not a protocol selection; obs declares no device sources',
  'lib/agents/harness/config-sources-read-rule.ts::CONFIG_SOURCES_READ_RULE_PROTOCOLS':
    'the Config sources READ RULE allow-list (which declared Harvesters get the read-rule paragraph; widened to kubernetes-gitops + terraform-iac 2026-11-26 after the widening controls) — a Config-sources prompt property, not held-capability; the retired obs variant declares no Config sources',
  'scripts/canary-req-sources.ts::READ_RULE_WIDENED_PROTOCOLS':
    'canary control rrw-k8s-tf-read-rule (2026-11-26): the two protocols the read rule was widened to — the Config sources READ RULE allow-list (which declared Harvesters get the read-rule paragraph; widened to kubernetes-gitops + terraform-iac 2026-11-26 after the widening controls) — a Config-sources prompt property, not held-capability; the retired obs variant declares no Config sources',
  'scripts/test-config-sources-read-rule.ts::test:RR2 the allow-list is observability-config, kubernetes-gitop':
    'pins CONFIG_SOURCES_READ_RULE_PROTOCOLS (excluded above for the same reason: a Config-sources prompt property, not held-capability)',
  'scripts/test-config-sources-read-rule.ts::blocks':
    'RR5c fixture (2026-11-26): a declared Kubernetes and a declared Terraform leg with their `## Config sources` blocks, proving the widened read rule renders after the block — a fixture, not a protocol selection; the retired obs variant declares no Config sources',
  'scripts/test-leg-replay-lab.ts::test:LRR2 widened: on the stored K8S-R3 / TF-R3 Harvesters the sh':
    'LRR2 (2026-11-26): pins the lab against the widened read-rule allow-list on the stored Kubernetes and Terraform Harvesters — a lab fixture over CONFIG_SOURCES_READ_RULE_PROTOCOLS (excluded above: a Config-sources prompt property, not held-capability)',
  'scripts/leg-replay-lab/render-tree-protocols.ts::<top>':
    'lab render tool (L-CS-N S-1 re-pin): writes the named protocol texts of a tree to disk to compare render shas; it never selects or composes a protocol for a run, so no held-variant decision applies',
};

type Site = { key: string; file: string; line: number; text: string; kind: string };

function anchorOf(node: ts.Node): string {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    // Inside a test(...)/check(...) call: its name, so an exclusion never covers a whole test file.
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ['test', 'check', 'it'].includes(n.expression.text)
      && n.arguments[0] && (ts.isStringLiteral(n.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(n.arguments[0]))) {
      return `test:${(n.arguments[0] as ts.StringLiteral).text.slice(0, 60)}`;
    }
    if (ts.isVariableDeclaration(n) || ts.isPropertyAssignment(n) || ts.isPropertyDeclaration(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) {
      const nm = n.name; if (nm && (ts.isIdentifier(nm) || ts.isStringLiteral(nm))) return nm.text;
    }
  }
  return '<top>';
}

function strings(node: ts.Node): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node) => { if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text); n.forEachChild(visit); };
  node.forEachChild(visit);
  return out;
}

export function sitesIn(file: string, src: string): Site[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Site[] = [];
  const add = (node: ts.Node, kind: string) => {
    const enclosing = (() => { for (let n: ts.Node | undefined = node; n; n = n.parent) if (ts.isVariableStatement(n) || ts.isPropertyAssignment(n) || ts.isExpressionStatement(n)) return n; return node; })();
    out.push({ key: `${file}::${anchorOf(node)}`, file, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: enclosing.getText(sf), kind });
  };
  const visit = (n: ts.Node) => {
    if (ts.isArrayLiteralExpression(n) && n.elements.filter((e) => (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) && isToken(e.text)).length >= 2) add(n, 'array');
    if (ts.isObjectLiteralExpression(n) && n.properties.filter((p) => ts.isPropertyAssignment(p) && (ts.isStringLiteral(p.name) || ts.isIdentifier(p.name)) && isToken(p.name.text)).length >= 2) add(n, 'object');
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'canonicalProtocolName'
      && n.arguments.length === 1 && ts.isStringLiteral(n.arguments[0]) && isToken(n.arguments[0].text)) add(n, 'canonical');
    n.forEachChild(visit);
  };
  visit(sf);
  return out;
}

const SKIP_DIRS = ['node_modules', 'fixtures', '.next'];
const isSource = (rel: string) =>
  /\.(ts|tsx|js)$/.test(rel) && !/\.generated\.ts$/.test(rel) && !/\.d\.ts$/.test(rel) &&
  !rel.split(path.sep).some((seg) => SKIP_DIRS.includes(seg));

// VARIANT-SITES-SCANS-IGNORED-FILES (2026-10-31): list files through git — tracked plus untracked-but-NOT-ignored —
// so git-ignored lab scratch (scripts/leg-replay-lab/cache/...) never fails the battery locally. A new, not-yet-added
// file is still scanned (--others --exclude-standard). If git is unavailable, fall back to the directory walk, loudly.
function listSourceFiles(dirs: string[]): string[] {
  try {
    const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...dirs], { cwd: ROOT, encoding: 'utf8' });
    return out.split('\0').filter(Boolean).map((p) => p.split('/').join(path.sep)).filter((p) => fs.existsSync(path.join(ROOT, p)) && isSource(p));
  } catch (e) {
    console.warn(`  ⚠️  git ls-files unavailable (${(e as Error).message.split('\n')[0]}) — falling back to a full directory walk (ignored files INCLUDED)`);
    const acc: string[] = [];
    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, ent.name);
        if (ent.isDirectory()) { if (!SKIP_DIRS.includes(ent.name)) walk(rel); continue; }
        if (isSource(rel)) acc.push(rel);
      }
    };
    dirs.forEach(walk);
    return acc;
  }
}

let passed = 0; let failed = 0;
const check = (d: string, c: boolean, detail = '') => { if (c) { passed++; console.log(`  ✅ ${d}`); } else { failed++; console.log(`  ❌ ${d}${detail ? `\n     ${detail}` : ''}`); } };

const files: string[] = listSourceFiles(['lib', 'app', 'scripts']);

// Pin: a git-ignored scratch file is NOT scanned (the 2026-10-24 ln1-render.ts failure).
{
  const probeRel = path.join('scripts', 'leg-replay-lab', 'cache', 'tmp', '__variant-sites-ignore-probe.ts');
  const probeAbs = path.join(ROOT, probeRel);
  let ignored = false;
  try { execFileSync('git', ['check-ignore', '-q', probeRel.split(path.sep).join('/')], { cwd: ROOT }); ignored = true; } catch { /* not ignored or no git */ }
  if (ignored) {
    fs.mkdirSync(path.dirname(probeAbs), { recursive: true });
    fs.writeFileSync(probeAbs, '// probe — deleted by test-variant-protocol-sites\n');
    try {
      check('a git-ignored scratch file is not scanned', !listSourceFiles(['scripts']).includes(probeRel));
    } finally { fs.rmSync(probeAbs, { force: true }); }
  } else {
    console.log('  ⚪ ignore pin skipped: scripts/leg-replay-lab/cache/ is not git-ignored here (or git is unavailable)');
  }
}
const sites = files.flatMap((f) => sitesIn(f, fs.readFileSync(path.join(ROOT, f), 'utf8')));
const SELF = path.relative(ROOT, __filename);
const live = sites.filter((s) => s.file !== SELF);
const bad = live.filter((s) => !NAMES_VARIANT.test(s.text) && !EXCLUSIONS[s.key]);
check(`every protocol-keyed site names the variant or is excluded with a reason (${live.length} sites in ${files.length} files)`, bad.length === 0,
  bad.map((s) => `${s.file}:${s.line} [${s.kind}] ${s.key}`).join('\n     '));
const keys = new Set(live.map((s) => s.key));
const stale = Object.keys(EXCLUSIONS).filter((k) => !keys.has(k));
check('every exclusion still matches a site', stale.length === 0, stale.join(', '));
const both = live.filter((s) => NAMES_VARIANT.test(s.text) && EXCLUSIONS[s.key]);
check('no site is both included and excluded', both.length === 0, both.map((s) => s.key).join(', '));
for (const [k, why] of Object.entries(EXCLUSIONS)) check(`exclusion has a stated reason: ${k}`, why.trim().length >= 20);

// The scanner itself, on fixtures (so a scanner that finds nothing cannot pass vacuously).
const fx = sitesIn('fx.ts', `
const A = ['terraform-iac', 'kubernetes-gitops'];
const B = [
  'observability-config-protocol',
  'network-provisioning-protocol',
];
const M = { 'observability-config-protocol': 1, 'terraform-iac-protocol': 2 };
const C = canonicalProtocolName('observability-config');
const N = ['pov-program', 'value-chain'];
const S = ['observability-config'];
`);
check('scanner: finds a one-line array, a multi-line array, an object map and a canonical call; ignores non-domain and single-token arrays',
  JSON.stringify(fx.map((s) => `${s.kind}:${s.key.split('::')[1]}`)) === JSON.stringify(['array:A', 'array:B', 'object:M', 'canonical:C']),
  JSON.stringify(fx.map((s) => `${s.kind}:${s.key}`)));
check('scanner: sees enough sites in the tree to be measuring something (≥ 8)', live.length >= 8, String(live.length));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
