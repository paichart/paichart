/**
 * Drift test for `ProtocolSeed.emitsMarkers` (added 2026-09-21).
 *
 * THE FIELD IS SOURCE OF TRUTH. This test re-derives the same property from each protocol's BODY
 * and reports divergence. It is deliberately NOT the gate:
 *
 *  - The GATE is the field's REQUIREDNESS — `seed:protocols` runs ts-node without
 *    `--transpile-only` against a strict config and is a deploy step, so an undeclared protocol
 *    fails the deploy with TS2741 (mutation-proven red-then-green, 2026-09-21).
 *  - Body derivation FAILS OPEN: a reworded mandate silently derives as "not required". The
 *    2026-09-12 ruling measured this — three plausible rewordings of the live kubernetes-gitops
 *    emit sentence each flipped the derived mandate to "not required", in the SUPPRESSING
 *    direction. That is why the declaration exists and why this file cannot replace it.
 *
 * ⚠️ DERIVATION IS APPROXIMATE, BY CONSTRUCTION. It asks "does this body contain the marker
 * heading text", which cannot distinguish MANDATING a block from MENTIONING one. A divergence is
 * therefore a FINDING TO READ, not automatically a bug in the declaration — the resolution may be
 * to reword the body. Never "fix" a declaration to silence this test without reading both.
 *
 * ⚠️ The body scan is LINE-BOUNDED (const-to-next-const), NOT delimiter-bounded. A scanner bounded
 * by a backtick-semicolon at column 0 swallows whole protocol bodies whose text contains that
 * sequence — it silently lost the entire network-provisioning protocol twice (2026-09-11 and again
 * on 2026-09-21 while this very field was being built). Do not "simplify" it back.
 */
import * as fs from 'fs';
import * as path from 'path';

const SEED = path.join(__dirname, 'seed-protocol-prompts.ts');
const MARKERS = ['Harvested Allocations', 'Derived Values', 'Consumed Values'] as const;

const lines = fs.readFileSync(SEED, 'utf8').split('\n');

// --- line-bounded const bodies (see the warning above) -----------------------
const starts: Array<{ name: string; at: number }> = [];
lines.forEach((l, i) => {
  // ⚠️ THIRD INSTANCE of the boundary bug this file's header warns about (2026-09-21, found when
  // requirements-authoring was inserted). The optional `(?::[^=]*)?` is LOAD-BEARING: without it
  // `const PROTOCOLS: ProtocolSeed[] = [` is not recognised as a const start, so the LAST protocol
  // const before the array absorbed the ENTIRE array — every entry's description and comments —
  // and its declaration was checked against a body containing all three marker strings. That is
  // why this test passed while pov-program's declaration disagreed with the 2026-09-12 hand-read.
  // A boundary bug here does not fail loudly; it makes a check pass against the wrong text.
  // FOURTH instance (2026-10-02, value-chain B1.1): `export const PROTOCOLS` (exported so the golden test can import
  // the rendered bodies) stopped matching `^const`, and the last protocol const absorbed the array again — the
  // requirements-authoring body was then checked against every entry's text. `export` is now part of the boundary.
  const m = /^(?:export\s+)?const ([A-Z_0-9]+)\s*(?::[^=]*)?=/.exec(l);
  if (m) starts.push({ name: m[1], at: i });
});
const bodyOf = new Map<string, string>();
starts.forEach((s, k) => {
  const end = k + 1 < starts.length ? starts[k + 1].at : lines.length;
  bodyOf.set(s.name, lines.slice(s.at, end).join('\n'));
});

// --- PROTOCOLS entries: name + declaration + which constants it concatenates --
const src = lines.join('\n');
const arrayStart = src.indexOf('const PROTOCOLS: ProtocolSeed[] = [');
if (arrayStart < 0) { console.error('❌ could not locate the PROTOCOLS array'); process.exit(1); }
const entries = src.slice(arrayStart).split(/\n  \{\n/).slice(1);

/**
 * NAMED, COUNTED suppressions — never a silent skip.
 *
 * Derivation asks "does this body contain the heading text", which cannot distinguish MANDATING a
 * block from READING one. Where a protocol legitimately NAMES a marker without mandating it, the
 * exception is listed HERE with its reason and is REPORTED in the summary. An unnamed divergence is
 * still a finding.
 *
 * ⚠️ Silent exclusion is the root-cause class this repo has paid for repeatedly (the 2026-08-08
 * grep-audit: 27 greps, ~30% of the corpus, dropped while the run still printed "every documented
 * expectation still holds"). If you extend this map, keep the exception COUNTED and NAMEABLE.
 */
const KNOWN_MENTION_NOT_MANDATE: Record<string, Partial<Record<string, string>>> = {
  'pov-program-protocol': {
    'Harvested Allocations':
      "program tier READS the leg's parsed block as a platform fact and FORBIDS fabricating one; it never asks a program leg to emit it (verified by reading all 3 occurrences, 2026-09-21; matches the 2026-09-12 hand-read). +1 at promotion E (2026-10-05, read by hand): the folded Node C value-leg paragraph names it only to EXEMPT a value leg from its absence — 4 occurrences",
    'Derived Values':
      "named only where the program tier READS a platform reason: the `harvest-block-missing-or-unparseable` definition and BRANCH D's 'no block parsed anywhere in the leg' — descriptions of what the platform computes, not mandates (2 occurrences; the BRANCH D one added 2026-10-03, read by hand). +1 at promotion E (2026-10-05, read by hand): the folded Node C value-leg paragraph DESCRIBES a value leg's deliverable to the reviewer (\"…arithmetic, `## Derived Values` block\") — the mandate to emit it lives in network-derivation-protocol — 3 occurrences",
    'Consumed Values':
      "named only in BRANCH D (the consumed-discharge arm) and BRANCH D3 (no consumed entry parsed) — the program tier READS whether the leg's block parsed; the mandate to emit it lives in the domain protocols (2 occurrences, both added 2026-10-03 by pattern (h) batch 2, read by hand). +1 at promotion E4 (2026-10-05, read by hand): the Node C value-leg paragraph scopes Node C's 'check only' to a consuming leg that DECLARES its value in the block — a read, not a mandate — 3 occurrences",
  },
};

/** Bodies of `names` plus every const they interpolate, transitively (each body once). */
function expandRefs(names: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  const visit = (n: string) => {
    if (seen.has(n) || !bodyOf.has(n)) return;
    seen.add(n);
    const b = bodyOf.get(n)!;
    out.push(b);
    for (const m of b.matchAll(/\$\{([A-Z_0-9]{4,})\b/g)) visit(m[1]);
  };
  names.forEach(visit);
  return out.join('\n');
}

let checked = 0, findings = 0, suppressed = 0;
for (const e of entries) {
  const name = /\n?\s*name: '([^']+)'/.exec(e)?.[1];
  const declRaw = /emitsMarkers:\s*('none'|\[[^\]]*\])/.exec(e)?.[1];
  const promptText = /promptText:\s*([^,\n]+)/.exec(e)?.[1] ?? '';
  if (!name || !declRaw) continue;
  checked++;

  const declared = new Set<string>(
    declRaw === "'none'" ? [] : [...declRaw.matchAll(/'([^']+)'/g)].map(m => m[1]));

  // union the bodies of every constant this entry's promptText references, FOLLOWING \${CONST} / \${CONST(…)}
  // interpolation transitively (2026-10-02, value-chain B1.4): network-provisioning's shared passages moved into
  // NETWORK_* section consts, and a scan of the composite const alone would no longer read them. Without this the
  // test keeps passing on the text that did NOT move — coverage lost silently, the failure mode named above.
  const refs = [...promptText.matchAll(/([A-Z_0-9]{4,})/g)].map(m => m[1]);
  const body = expandRefs(refs);

  for (const marker of MARKERS) {
    const inBody = body.includes(`## ${marker}`);
    const inDecl = declared.has(marker);
    if (inBody !== inDecl) {
      const reason = KNOWN_MENTION_NOT_MANDATE[name]?.[marker];
      if (reason && inBody && !inDecl) {
        suppressed++;
        console.log(`   ⓘ ${name}: '${marker}' mentioned but not mandated — ${reason}`);
        continue;
      }
      findings++;
      console.error(
        `❌ ${name}: '${marker}' ${inDecl ? 'DECLARED but not found in body' : 'found in BODY but not declared'}`);
    }
  }
}

if (!checked) { console.error('❌ parsed 0 entries — the parser drifted, which reads as clean. Fix it.'); process.exit(1); }
console.log(`Checked ${checked} protocol entries against their bodies (${suppressed} named mention-not-mandate exception(s)).`);
if (findings) {
  console.error(`\n❌ ${findings} divergence(s). READ BOTH SIDES before editing either.`);
  console.error('   The FIELD is source of truth; the body may be the thing that is wrong.');
  process.exit(1);
}
console.log('✅ every protocol\'s emitsMarkers declaration matches its body');
