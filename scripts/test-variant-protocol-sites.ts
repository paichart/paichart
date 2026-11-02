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
  'lib/agents/harness/rollback-containment.ts::DESIRED_STATE_LANES':
    'held-capable legs are adjudicated by the held arm FIRST (V-8a restore-is-held-base, keyed on isHeldCapableProtocol); a held-capable desired-state lane never reaches the content arms (K-4, held-k8s 1f)',
  'lib/agents/harness/held-bytes/variant.ts::GIT_FILE_SOURCE_PROTOCOLS':
    'held-k8s 1b: scopes which legs may CAPTURE a Git file-source read (github-service) — a different question from held-capability; the retired obs variant reads no Git file source, and HELD_CAPABLE_PROTOCOLS is checked separately',
  'lib/agents/harness/held-bytes/variant.ts::DEVICE_SOURCE_PROTOCOLS':
    'held-network step 3 batch 2b: scopes which legs declare Device sources (the device-read capture lane) — a capture-scope set like GIT_FILE_SOURCE_PROTOCOLS, a different question from held-capability; the retired obs variant declares no device sources',
  'lib/agents/harness/held-bytes/variant.ts::HELD_JOIN_VERSIONS':
    'held-k8s 1g/step 3: this IS the held-capable table (HELD_CAPABLE_PROTOCOLS = its keys minus HELD_JOIN_AWAITING_TEXT); a domain joins by adding its row, and the retired variant is deliberately not a member (Phase 10 D4)',
  // held-network push 3: the HELD_JOIN_AWAITING_TEXT exclusion was removed with network's entry (the list is empty, so no site);
  // a domain that next joins ahead of its text re-adds it (reason: the subtraction from the held-capable table).
  'lib/agents/harness/protocol-marker-mandates.ts::PROTOCOL_MARKER_MANDATES':
    'HS-FU5 (2026-10-31): a projection of the seed\'s emitsMarkers for NON-DEPRECATED rows only; the retired obs variant is excluded ON PURPOSE (its tombstone declares none while its live body mandated Consumed Values; projecting it moved 15 stored renders) and a retired row cannot run, so it reads as unknown ⇒ the marker line renders as before',
  'scripts/test-protocol-marker-mandates.ts::<top>':
    'HS-FU5 test fixture: asserts the marker-mandating infra protocols are NOT none; the retired obs variant is deliberately absent from the projection (see PROTOCOL_MARKER_MANDATES)',
  'scripts/test-protocol-marker-mandates.ts::variants':
    'HS-FU5 byte-identity fixture over the live infra protocols; the retired obs variant is unknown to the projection by design and is covered by the unknown-protocol row',
  'lib/agents/harness/requirements-coverage.ts::LEG_TOKENS':
    'Phase 10: held is a capability OF the obs token, not a token — generated specs key obs rows on observability-config and never name the retired variant token (PH-6 inventory P-6)',
  'lib/agents/harness/requirements-clauses.ts::TOKENS': 'the requirements token family — same reason as requirements-coverage LEG_TOKENS (Phase 10: held is a capability of the obs token)',
  'lib/agents/harness/requirements-citations.ts::TOKENS': 'the requirements token family — same reason as requirements-coverage LEG_TOKENS (Phase 10: held is a capability of the obs token)',
  'lib/agents/harness/protocol-dependence-anchors.ts::PROTOCOL_DEPENDENCE_ANCHORS':
    'Phase 10: the variant row is a DEPRECATED tombstone that composes nothing, so it carries no base-dependence anchors (value-chain-program tombstone precedent)',
  'scripts/render-public-protocols.ts::PROTOCOLS':
    'Phase 10: the variant row is a DEPRECATED tombstone the completeness guard no longer sees; obs ≥ 1.10.0 publishes the held text and R6/PH-7 hold the export until the self-host text exists',
  'scripts/test-validation-shape-contract.ts::test:every domain protocol that carries the rule was VERSION-BUMP': 'a SOURCE-text changelog pin keyed on name literals; the retired variant has no source entry or changelog of its own',
  'scripts/test-program-protocol-token.ts::test:canonicalProtocolName: pure suffix rule, no I/O, idempotent': 'a pure suffix-rule example; no protocol set',
  'scripts/test-held-variant.ts::test:held-k8s 1b-scope + step 3: a leaf under a kubernetes-gitops':
    'held-terraform step 1: pins GIT_FILE_SOURCE_PROTOCOLS (a capture-scope set, excluded above for the same reason) — the retired obs variant reads no Git file source',
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
