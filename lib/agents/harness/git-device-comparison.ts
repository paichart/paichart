/**
 * held-network step 3 batch 2b (P5 / S3-C, 2026-10-26) — the MECHANICAL Git-file vs device-configuration comparison, as a FACT.
 *
 * WHY. With both sources declared for a device, the model was told to compare them and failed (L-N1: a values-only compare missed a
 * stanza moved between parents 6/6; one sample presented a REBUILT device block as the device read). Rev 9 took the comparison away
 * from the model (`drift: not checked`) and owed a mechanical one. This is it: the platform holds both texts and compares
 * (parent-context path, line) pairs.
 *
 * WHAT IT COMPARES. Each text becomes a SET of entries `(parents, line)`: `line` is the trimmed line with internal whitespace runs
 * collapsed; `parents` is the chain of the nearest preceding less-indented lines (the configuration's own hierarchy — vendor
 * agnostic: IOS/EOS/NX-OS blocks and indented brace configs alike). Skipped, on both sides, and never a difference:
 *   - blank lines; comment / separator lines (first non-blank character `!` or `#`); a top-level `end`; a closing-brace-only line;
 *   - a banner block (`banner <type>` with a delimiter ⇒ through the line carrying the delimiter again; with none ⇒ through a line
 *     that is exactly `EOF`).
 * Set semantics ⇒ an intra-block REORDER is not a difference.
 * DIFFERENCES are Git-file entries absent from the device set at the same parents:
 *   - `inside-sub-block` — (v2, owner O-1 2026-10-26) the device has the line under a CHILD block of the file's parent block: the
 *                          device parent chain EXTENDS the file's (file `P › line`, device `P › X › line`). Decided from the two
 *                          parent chains only — no vendor keyword (EOS renders a BGP `network` under `address-family ipv4`; another
 *                          platform another sub-block; the rule is the shape). Still a difference, reported with both chains, never
 *                          dropped. A TOP-LEVEL file line (no parent) found inside a block stays `moved`: every block is "a child of the
 *                          top level", so the kind would say nothing there;
 *   - `moved`            — the same line sits under other parents on the device: a SIBLING block, a shallower block, or any chain
 *                          that does not extend the file's (a line moved between blocks);
 *   - `absent-on-device` — the line appears nowhere in the device configuration.
 * Lines only the DEVICE shows are COUNTED (`deviceOnlyLines`), never listed as differences: a device renders defaults the file does
 * not state, and this comparison cannot tell those from out-of-band additions — so it says so, and lists neither.
 *
 * HIERARCHY FORMS (v2, the push-2 hierarchy-form audit — config-hierarchy.ts, the ONE classifier): both texts are classified first.
 * Parsed: `indent` (IOS / NX-OS / EOS / XR style), `braces` (an indented brace display), `set` (flat statements that carry their whole
 * path), `flat`. A text in `braces-unindented` form (the hierarchy lives only in the braces) is NOT compared — state
 * `hierarchy-form-not-parsed` — and two parsed forms that express a configuration differently (a `set` file against a brace device)
 * are NOT compared — `hierarchy-forms-differ`. Both carry the two forms. Never a silent pass, never N meaningless differences.
 *
 * Both texts are R10-redacted IN CONTEXT before anything is compared or emitted (batch-1 learning: facts redact what they quote),
 * so a secret never appears in the fact, and two secrets that differ compare equal (both are the placeholder). Lines are capped.
 * FACTS, NEVER VERDICTS (Protocol 10): no adjective, no "drift", no match/mismatch verdict — differences and counts. Gates nothing.
 * PURE.
 */
import { redactArtifactSecrets } from './redact-artifact-secrets';
import { configStatements, hierarchyFormOf, formsComparable, isParsedForm, type HierarchyForm } from './config-hierarchy';

/** v2 (push 2): the `inside-sub-block` kind, and the hierarchy forms (`forms`, two not-compared states). */
export const GIT_DEVICE_COMPARISON_VERSION = 2;
export const GIT_DEVICE_COMPARISON_METHOD = 'parent-context-lines/2';
export const DIFFERENCE_LIST_CAP = 20;
export const LINE_CAP = 160;

export interface ConfigEntry { parents: string[]; line: string }
export interface GitDeviceDifference {
  kind: 'inside-sub-block' | 'moved' | 'absent-on-device';
  line: string;
  gitParents: string[];
  /** `inside-sub-block`: the device chain that extends the file's (the first such place); `moved`: where the device has the line
   *  (the first such place). */
  deviceParents?: string[];
}
export interface HierarchyForms { git: HierarchyForm; device: HierarchyForm }
export interface ComparisonResult {
  state: 'compared';
  forms: HierarchyForms;
  gitLines: number;
  deviceLines: number;
  differencesTotal: number;
  differences: GitDeviceDifference[];
  deviceOnlyLines: number;
}
export interface NotCompared { state: 'hierarchy-form-not-parsed' | 'hierarchy-forms-differ'; forms: HierarchyForms }

const cap = (s: string) => (s.length > LINE_CAP ? `${s.slice(0, LINE_CAP)}…` : s);

type Statements = ReturnType<typeof configStatements>;

/** Statements → (parents, line) entries, in order: parents = the nearest preceding less-indented statements. */
function entriesOf(stmts: Statements): ConfigEntry[] {
  const out: ConfigEntry[] = [];
  const stack: Array<{ indent: number; line: string }> = [];
  for (const s of stmts) {
    if (s.isClose) continue;
    const line = s.text.replace(/\s+/g, ' ');
    while (stack.length && stack[stack.length - 1].indent >= s.indent) stack.pop();
    out.push({ parents: stack.map((x) => x.line), line });
    stack.push({ indent: s.indent, line });
  }
  return out;
}

/** One configuration text → its (parents, line) entries, in order. */
export function configEntries(text: string): ConfigEntry[] {
  return entriesOf(configStatements(text));
}

/** Is `inner` a strict extension of `outer` (outer is a proper prefix of it)? */
const extendsChain = (inner: readonly string[], outer: readonly string[]) =>
  inner.length > outer.length && outer.every((x, i) => inner[i] === x);

const keyOf = (e: ConfigEntry) => `${e.parents.join('\u0001')}\u0000${e.line}`;

/** Compare a Git file text with a device configuration text. Both are R10-redacted in context first; both forms are classified,
 *  and a pair that cannot be compared line-by-parent returns its named state instead of a comparison. */
export function compareGitWithDevice(gitText: string, deviceText: string): ComparisonResult | NotCompared {
  const gs = configStatements(redactArtifactSecrets(gitText).redacted);
  const ds = configStatements(redactArtifactSecrets(deviceText).redacted);
  const forms: HierarchyForms = { git: hierarchyFormOf(gs), device: hierarchyFormOf(ds) };
  if (!isParsedForm(forms.git) || !isParsedForm(forms.device)) return { state: 'hierarchy-form-not-parsed', forms };
  if (!formsComparable(forms.git, forms.device)) return { state: 'hierarchy-forms-differ', forms };
  const git = entriesOf(gs);
  const dev = entriesOf(ds);
  const devKeys = new Set(dev.map(keyOf));
  const gitKeys = new Set(git.map(keyOf));
  const devByLine = new Map<string, ConfigEntry[]>();
  for (const e of dev) { const a = devByLine.get(e.line); if (a) a.push(e); else devByLine.set(e.line, [e]); }
  const differences: GitDeviceDifference[] = [];
  let total = 0;
  const seen = new Set<string>();
  for (const e of git) {
    const k = keyOf(e);
    if (devKeys.has(k) || seen.has(k)) continue;
    seen.add(k);
    total++;
    if (differences.length >= DIFFERENCE_LIST_CAP) continue;
    const elsewhere = devByLine.get(e.line) ?? [];
    const sub = e.parents.length > 0 ? elsewhere.find((d) => extendsChain(d.parents, e.parents)) : undefined;
    differences.push(sub
      ? { kind: 'inside-sub-block', line: cap(e.line), gitParents: e.parents.map(cap), deviceParents: sub.parents.map(cap) }
      : elsewhere.length
        ? { kind: 'moved', line: cap(e.line), gitParents: e.parents.map(cap), deviceParents: elsewhere[0].parents.map(cap) }
        : { kind: 'absent-on-device', line: cap(e.line), gitParents: e.parents.map(cap) });
  }
  const deviceOnly = new Set(dev.map(keyOf).filter((k) => !gitKeys.has(k)));
  return { state: 'compared', forms, gitLines: gitKeys.size, deviceLines: devKeys.size, differencesTotal: total, differences, deviceOnlyLines: deviceOnly.size };
}

// ── §6 render (the Architect and the leg Reviewer; a PURE function of the carried fact) ─────────────────────────────

/** sec-ops batch-2b SF-2: quoted repo / device text sits outside the quarantine — a backtick in it would break the inline code span, so
 *  every quoted token has its backticks replaced (the line is still R9-sanitised at site A and R10-redacted in the fact). */
const q = (s: unknown): string => String(s).replace(/`/g, "'");
const parentsText = (p: unknown): string => (Array.isArray(p) && p.length ? p.map((x) => `\`${q(x)}\``).join(' › ') : 'top level');

export function renderGitDeviceComparisonForPrompt(fact: Record<string, unknown> | null | undefined): string[] | null {
  if (!fact || typeof fact !== 'object' || fact.checked !== true) return null;
  const devices = Array.isArray(fact.devices) ? (fact.devices as Array<Record<string, unknown>>) : [];
  if (devices.length === 0) return null;
  const method = typeof fact.method === 'string' ? fact.method : GIT_DEVICE_COMPARISON_METHOD;
  const out = [`- **Git file vs device configuration (platform fact, ${method})**: each device whose Device sources declare both a Git file and a device read, compared by line and parent block (comments, \`end\`, banners and line order within a block are not compared):`];
  for (const d of devices) {
    const name = `\`${q(d.device)}\``;
    if (d.state !== 'compared') {
      const f = d.forms && typeof d.forms === 'object' ? (d.forms as Record<string, unknown>) : null;
      out.push(`  - ${name}: not compared — ${q(d.state)}${f ? ` (file form \`${q(f.git)}\`, device form \`${q(f.device)}\`)` : ''}`);
      continue;
    }
    const total = typeof d.differencesTotal === 'number' ? d.differencesTotal : 0;
    const devOnly = typeof d.deviceOnlyLines === 'number' ? d.deviceOnlyLines : 0;
    const path = d.gitFile && typeof d.gitFile === 'object' ? q((d.gitFile as Record<string, unknown>).path ?? '') : '';
    const tail = devOnly > 0
      ? ` ${devOnly} line(s) the device shows are not in the file; they are not listed (a device renders defaults the file does not state, and this comparison cannot tell those from other additions).`
      : '';
    if (total === 0) { out.push(`  - ${name}: every line of the Git file \`${path}\` is under the same parent block in the device's running configuration.${tail}`); continue; }
    out.push(`  - ${name}: ${total} line(s) of the Git file \`${path}\` are not under the same parent block in the device's running configuration:`);
    for (const x of (Array.isArray(d.differences) ? d.differences : []) as GitDeviceDifference[]) {
      out.push(x.kind === 'moved'
        ? `    - \`${q(x.line)}\` — in the file under ${parentsText(x.gitParents)}; on the device under ${parentsText(x.deviceParents)}`
        : x.kind === 'inside-sub-block'
          ? `    - \`${q(x.line)}\` — in the file under ${parentsText(x.gitParents)}; on the device inside a sub-block of it, under ${parentsText(x.deviceParents)}`
          : `    - \`${q(x.line)}\` — in the file under ${parentsText(x.gitParents)}; not in the device configuration`);
    }
    const listed = Array.isArray(d.differences) ? d.differences.length : 0;
    if (total > listed) out.push(`    - (+${total - listed} more not listed)`);
    if (tail) out.push(`   ${tail.trim()}`);
  }
  return out;
}
