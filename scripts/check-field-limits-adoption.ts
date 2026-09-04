/**
 * FIELD_LIMITS adoption guard (SKETCH / report-only)
 * ===================================================
 *
 * Drift-prevention for the "field limit alignment" bug class: the same logical
 * field capped differently across schemas, or a hardcoded literal silently
 * diverging from FIELD_LIMITS after a constant changes.
 *
 * What it does:
 *   - Parses lib/validation/field-limits.ts for the canonical value→name map
 *     (so this guard never drifts from the constants it enforces).
 *   - Scans every lib/validation/*.ts for `.max(<numeric-literal>)`.
 *   - Classifies each occurrence:
 *       COMPLIANT      uses FIELD_LIMITS.* — good
 *       ALLOWLISTED    intentional literal (password length, path cap, etc.)
 *       ARRAY/NUMERIC  count/range cap, not a string-size — out of scope
 *       FLAGGED        hardcoded string-size literal — should reference a constant
 *       UNCLASSIFIED   message didn't match either heuristic — needs human eyes
 *
 * IMPORTANT: pure text scan. Does NOT import any lib/ module — keeps it safe to
 * run in CI without DATABASE_URL (see [[feedback_ci_database_url_transitive]]).
 *
 * SKETCH STATUS: report-only. Always exits 0. Wire `process.exit(flagged ? 1 : 0)`
 * and add to test:all-validation ONLY after the FLAGGED list is driven to zero
 * (either by migrating to constants or by adding deliberate ALLOWLIST entries).
 */

import * as fs from 'fs';
import * as path from 'path';

const VALIDATION_DIR = path.join(__dirname, '..', 'lib', 'validation');
const FIELD_LIMITS_FILE = path.join(VALIDATION_DIR, 'field-limits.ts');

// ── Allowlist: intentional literals the string-size heuristic would mis-flag ──
// Keyed by message substring (stable across line moves). Each needs a reason.
interface AllowEntry { file: string; message: string; reason: string }
const ALLOWLIST: AllowEntry[] = [
  { file: 'admin-user-validation.ts', message: 'Password too long',
    reason: 'Password max (128) is a credential-policy bound, not a content-size category.' },
  { file: 'input-validation-framework.ts', message: 'Path too long',
    reason: 'Filesystem path soft-cap (200), not a string-content size. Inline-documented at source.' },
  // NOTE: deliberately NOT allowlisting the 200-value near-misses
  // (mcpServer description, prompt-library name) — they have no matching
  // constant and are open modelling decisions. Let them surface as FLAGGED.
];

// Messages that indicate an array-count or numeric-range cap (NOT string size).
const NON_STRING_MESSAGE = new RegExp([
  'too many', 'maximum \\d', 'per (request|bulk)', 'cannot (delete|exceed)',
  'attachments', 'members', 'metrics?\\b', 'tasks?\\b', 'stages?\\b', 'sections?\\b',
  'competitors', 'phases', 'dependencies', 'tags?\\b', 'hours', 'days',
  'retry', 'interval', 'offset', 'limit too', 'file too large', 'number too',
  'cannot be empty',
].join('|'), 'i');

// Messages that indicate a string-size cap (in scope for FIELD_LIMITS).
const STRING_SIZE_MESSAGE = /too long|characters? or less|max \d+ ?(chars|kb)|\bchars?\b/i;

// ── Parse field-limits.ts → value→[names] (for migration suggestions) ──
function loadConstants(): Map<number, string[]> {
  const src = fs.readFileSync(FIELD_LIMITS_FILE, 'utf8');
  const byValue = new Map<number, string[]>();
  // matches:  NAME: 255,   or   CONTENT: 50_000,
  const re = /^\s+([A-Z_]+):\s*([\d_]+)\s*,/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    const value = parseInt(m[2].replace(/_/g, ''), 10);
    if (!byValue.has(value)) byValue.set(value, []);
    byValue.get(value)!.push(name);
  }
  return byValue;
}

function suggestion(value: number, byValue: Map<number, string[]>): string {
  const names = byValue.get(value);
  if (!names || names.length === 0) return `(no constant = ${value} — add one or keep literal)`;
  if (names.length === 1) return `FIELD_LIMITS.${names[0]}`;
  return `ambiguous: ${names.map((n) => `FIELD_LIMITS.${n}`).join(' / ')} — pick by semantics`;
}

interface Hit {
  file: string; line: number; value: number; message: string; rawLine: string;
}

function scan(): Hit[] {
  const hits: Hit[] = [];
  for (const file of fs.readdirSync(VALIDATION_DIR)) {
    if (!file.endsWith('.ts') || file === 'field-limits.ts') continue;
    const lines = fs.readFileSync(path.join(VALIDATION_DIR, file), 'utf8').split('\n');
    lines.forEach((raw, i) => {
      const trimmed = raw.trim();
      // skip comment lines (JSDoc examples, etc.)
      if (trimmed.startsWith('*') || trimmed.startsWith('//')) return;
      // .max(<digits>[, 'message'])  — digits only (skips .max(FIELD_LIMITS...) and .max(100 * 1024...))
      const re = /\.max\(\s*([\d_]+)\s*(?:,\s*(['"])(.*?)\2)?/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(raw)) !== null) {
        // skip arithmetic caps like .max(100 * 1024 * 1024)
        const after = raw.slice(m.index + m[0].length);
        if (/^\s*\*/.test(after)) continue;
        hits.push({
          file, line: i + 1,
          value: parseInt(m[1].replace(/_/g, ''), 10),
          message: m[3] || '', rawLine: trimmed,
        });
      }
    });
  }
  return hits;
}

// ── Run ──
const byValue = loadConstants();
const hits = scan();

const flagged: Hit[] = [];
const unclassified: Hit[] = [];
let compliant = 0, allowlisted = 0, arrayNumeric = 0;

for (const h of hits) {
  const allow = ALLOWLIST.find((a) => a.file === h.file && h.message.includes(a.message));
  if (allow) { allowlisted++; continue; }
  if (h.message && NON_STRING_MESSAGE.test(h.message)) { arrayNumeric++; continue; }
  if (h.message && STRING_SIZE_MESSAGE.test(h.message)) { flagged.push(h); continue; }
  // No message, or message matched neither heuristic.
  unclassified.push(h);
}

// FIELD_LIMITS.* references (already compliant) — count separately by grepping text.
for (const file of fs.readdirSync(VALIDATION_DIR)) {
  if (!file.endsWith('.ts') || file === 'field-limits.ts') continue;
  const src = fs.readFileSync(path.join(VALIDATION_DIR, file), 'utf8');
  compliant += (src.match(/\.max\(\s*FIELD_LIMITS\.|optionalString\(\s*FIELD_LIMITS\.|requiredString\(\s*FIELD_LIMITS\.|InjectionSafe\w*\(\s*FIELD_LIMITS\./g) || []).length;
}

console.log('FIELD_LIMITS Adoption Guard (SKETCH — report-only)');
console.log('==================================================\n');
console.log(`✅ COMPLIANT (uses FIELD_LIMITS.*):     ${compliant}`);
console.log(`➖ ALLOWLISTED (intentional literal):   ${allowlisted}`);
console.log(`➖ ARRAY/NUMERIC caps (out of scope):   ${arrayNumeric}`);
console.log(`🟡 FLAGGED (hardcoded string-size):     ${flagged.length}`);
console.log(`❓ UNCLASSIFIED (needs human review):   ${unclassified.length}\n`);

if (flagged.length) {
  console.log('🟡 FLAGGED — hardcoded string-size literals (should reference a constant):');
  for (const h of flagged.sort((a, b) => a.value - b.value)) {
    console.log(`   ${h.file}:${h.line}  max(${h.value})  "${h.message}"`);
    console.log(`        → ${suggestion(h.value, byValue)}`);
  }
  console.log('');
}

if (unclassified.length) {
  console.log('❓ UNCLASSIFIED — message matched neither heuristic (confirm string vs count):');
  for (const h of unclassified.sort((a, b) => a.value - b.value)) {
    console.log(`   ${h.file}:${h.line}  max(${h.value})  "${h.message || '(no message)'}"`);
  }
  console.log('');
}

console.log('SKETCH: exit 0 regardless. Enable enforcement only after FLAGGED → 0.');
process.exit(0);
