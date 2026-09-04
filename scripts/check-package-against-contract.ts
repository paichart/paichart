#!/usr/bin/env ts-node
/**
 * OPERATOR-SIDE package check — run this at a gate, BEFORE applying a change package.
 *
 * WHY THIS EXISTS (IGP-T1 R7, 2026-08-24): the leg reviewer approved a package 90/100 with zero
 * blocking issues; the package had omitted `address-family ipv4 unicast` from the contract's
 * canonical stanza; the config entered a config session with no error, committed, displayed as
 * configured, and left IS-IS DISABLED. Four guards missed it — three of them (reviewer, plan-gate
 * probe, apply-time diff review) check the ABSENCE direction, and the fourth was a human reading
 * raw output. This puts BOTH directions in the operator's hands mechanically, today, without
 * waiting for dialect-lint Phase 2 engine wiring.
 *
 * It is a FACT REPORTER, not a gate: it prints what it found and exits non-zero on findings so a
 * shell can branch. The release decision stays human.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/check-package-against-contract.ts \
 *     --package <file|-> --contract <file|-> [--counts]
 *
 * --counts prints the full per-line occurrence table (prefix rows are approximate).
 *
 * Both inputs accept a file path or `-` for stdin. The contract may be raw JSON, or any text with
 * a ```json fenced block (an Architect report.md works as-is).
 */
import * as fs from 'fs';
import { runDialectLint } from '@/lib/agents/harness/dialect-lint';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function read(src: string): string {
  return src === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(src, 'utf8');
}

/** Accept raw JSON, or pull the first ```json fenced block (Architect report.md shape). */
function parseContract(text: string): unknown {
  const t = text.trim();
  if (t.startsWith('{')) return JSON.parse(t);
  const fence = t.match(/```json\s*\n([\s\S]*?)```/);
  if (fence) return JSON.parse(fence[1]);
  throw new Error('could not find JSON (raw object or a ```json fenced block) in the contract input');
}

const pkgSrc = arg('package');
const ctrSrc = arg('contract');
if (!pkgSrc || !ctrSrc) {
  console.error('usage: --package <file|-> --contract <file|->');
  process.exit(64);
}

const pkg = read(pkgSrc);
const contract = parseContract(read(ctrSrc));
const r = runDialectLint(pkg, contract);

/** Optional scope: only consider stanzas whose contract key matches this substring. A contract
 *  carries several stanzas (main config, preference knob, ...) and a phase package legitimately
 *  implements only some of them — without scoping, a later phase's stanza reads as a defect. */
const stanzaFilter = arg('stanza');

console.log('\n══ PACKAGE vs CONTRACT ══════════════════════════════════════════════\n');

// ── ABSENCE ──
console.log('ABSENCE (banned tokens must not appear in fenced config blocks)');
if (!r.checked) {
  console.log(`  ⚠️  NOT CHECKED — ${r.reason} (this is a named reason, not a pass)`);
  if (r.reason === 'no-banned-token-list') {
    // Name what LOOKS like dialect content so the operator knows exactly what went unchecked
    // rather than inferring "there was nothing to check" (live gap, IGP-T1 R9: the contract
    // expressed constraints as a prose array under a key the extractor does not match).
    const hits: string[] = [];
    const walk = (n: unknown, path: string): void => {
      if (!n || typeof n !== 'object') return;
      for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
        if (/dialect|constraint|forbid|prohibit/i.test(k)) hits.push(`${path}${k}`);
        walk(v, `${path}${k}.`);
      }
    };
    walk(contract, '');
    if (hits.length) {
      console.log(`     ℹ️  contract DOES carry dialect-shaped keys the extractor did not match: ${hits.join(', ')}`);
      console.log('        Read them by eye — the absence half did NOT cover them.');
    }
  }
} else if (r.violations.length === 0) {
  console.log(`  ✅ clean — ${r.tokensConsidered.length} token(s) scanned: ${r.tokensConsidered.join(', ')}`);
} else {
  console.log(`  🛑 ${r.violations.length} violation(s):`);
  for (const v of r.violations) console.log(`     line ${v.line}: "${v.token}" → ${v.lineText}`);
}

// ── PRESENCE ──
const t = r.transcription;
console.log('\nPRESENCE (every required canonical-stanza line must appear)');
if (!t.checked) {
  console.log(`  ⚠️  NOT CHECKED — ${t.reason} (named reason, not a pass)`);
} else {
  const inScope = stanzaFilter
    ? t.lines.filter((l) => l.stanzaKey.toLowerCase().includes(stanzaFilter.toLowerCase()))
    : t.lines;
  const missing = inScope.filter((l) => l.occurrences === 0);
  const stanzaKeys = [...new Set(t.lines.map((l) => l.stanzaKey))];
  console.log(`  stanzas in contract: ${stanzaKeys.join(', ')}`);
  if (stanzaFilter) console.log(`  scoped to: *${stanzaFilter}* (${inScope.length} of ${t.lines.length} lines)`);
  console.log(`  required lines considered: ${inScope.length}`);
  if (missing.length === 0) {
    console.log('  ✅ every required line present');
  } else {
    console.log(`  🛑 ${t.missing.length} REQUIRED LINE(S) MISSING — the R7 defect shape:`);
    for (const m of t.missing) console.log(`     ✗ ${m}`);
  }
  // Asymmetry heuristic over LITERAL-matched lines only. A prefix match is inherently fuzzy —
  // e.g. the prefix `interface` matches both `interface Ethernet1` and `interface Loopback0`, so
  // including prefix rows produces a confident-looking [2,4] that means nothing. Noise here trains
  // the reader to ignore the warning, which is worse than not printing it.
  const literal = t.lines.filter((l) => l.matchedOn === 'literal' && l.occurrences > 0);
  const uniq = [...new Set(literal.map((l) => l.occurrences))];
  if (uniq.length > 1) {
    console.log(`  ⚠️  UNEVEN occurrence counts among literal lines ${JSON.stringify(uniq)} — possible per-device asymmetry:`);
    for (const l of literal) console.log(`     ${String(l.occurrences).padStart(2)}x  ${l.line}`);
  }
  if (process.argv.includes('--counts')) {
    console.log('  full occurrence table (prefix rows are approximate by construction):');
    for (const l of t.lines) {
      const tag = l.matchedOn === 'prefix' ? ` [prefix: ${l.prefix}]` : '';
      console.log(`     ${String(l.occurrences).padStart(2)}x  ${l.line}${tag}`);
    }
  }
  if (t.skipped.length) console.log(`  (unassertable, named: ${t.skipped.length} line(s))`);
  console.log(`  scope: ${t.scope}`);
}

const findings =
  (r.checked ? r.violations.length : 0) +
  (t.checked
    ? (stanzaFilter
        ? t.lines.filter((l) => l.stanzaKey.toLowerCase().includes(stanzaFilter.toLowerCase()) && l.occurrences === 0)
        : t.lines.filter((l) => l.occurrences === 0)
      ).length
    : 0);
const unchecked = !r.checked || !t.checked;
console.log(
  `\n${findings > 0 ? '🛑 FINDINGS: ' + findings : unchecked ? '⚠️  INCOMPLETE — see named reasons above' : '✅ CLEAN (both halves)'}\n`
);
process.exit(findings > 0 ? 1 : unchecked ? 2 : 0);
