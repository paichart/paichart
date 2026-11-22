/**
 * The §6 render of `liveEvidence`, split out (2026-11-05) so it is CLIENT-SAFE: `render-pipeline-context.ts` is reachable from a
 * client component (AgentBuilderPreview → build-agent-prompt-body), and importing it from `live-evidence.ts` pulled the read
 * record → extractor → descriptor-fetch (`dns`) into the browser bundle (`npm run build` failed on push 1a's clean-copy gate). PURE:
 * its ONE import is source-field-bounds.ts, which imports nothing (STEP 3 P5 — the field shapes shared with the grammar; pinned).
 * `live-evidence.ts` re-exports everything here, so callers and tests are unchanged. The `gitDeviceComparison` render follows the
 * same split (git-device-comparison.ts holds no server imports).
 */
import { SOURCE_LABEL_RE, RETURNED_KEY_RE } from './source-field-bounds';

type Obj = Record<string, unknown>;

/** F8 (SYNTHESIS §5): the §6 heading names the fact exactly as the network text (R1 v2) names it. Pinned. */
export const LIVE_EVIDENCE_RENDER_NAME = "the platform's live-evidence fact";

/**
 * F-fold (owner decision F, 2026-11-05, L-CS-N ADDENDUM (b)): the summary word and every count are OF THE DECLARED DEVICES. A
 * Reviewer read `all-read` as "the leg's scope is covered" on a package whose in-scope device was never declared. The FACT is
 * unchanged; the render says what population it counts, on every summary word. Pinned (LE10b).
 */
export const LIVE_EVIDENCE_SCOPE_CLAUSE = '(of the declared devices; a device the declaration does not name is not counted)';

/** Contract-devices fold (2026-11-05): the sub-line naming the devices the program interface contract names that this leg's
 *  declaration does not. Pinned (LE16); the template carries no device or rig identifier (`test:no-rig-identifiers`). */
export const CONTRACT_NOT_DECLARED_LABEL = 'named in the program interface contract, not declared for this leg';

// ── §6 render (renderPrompt). Facts only: counts, names, the record's states verbatim — no verdict words. ──────────────────────
const q = (s: unknown): string => String(s).replace(/`/g, "'").replace(/[\r\n\t]+/g, ' ');
const names = (list: unknown, fmt: (x: Obj) => string): string =>
  (Array.isArray(list) ? (list as Obj[]) : []).map(fmt).join('; ');
const more = (fact: Obj, key: string, shown: unknown): string => {
  const total = fact.capped && typeof fact.capped === 'object' ? (fact.capped as Obj)[key] : undefined;
  const n = Array.isArray(shown) ? shown.length : 0;
  return typeof total === 'number' && total > n ? ` (+${total - n} more not listed)` : '';
};

/** A list's TRUE size: its recorded total when capped, else its length (the bucket sum reads the same numbers). */
export function listTotal(fact: Obj, key: string): number {
  const total = fact.capped && typeof fact.capped === 'object' ? (fact.capped as Obj)[key] : undefined;
  if (typeof total === 'number') return total;
  return Array.isArray(fact[key]) ? (fact[key] as unknown[]).length : 0;
}

/** Config sources STEP 2: the population clause of the CONFIG arm (files and live systems, not devices). Pinned. */
export const CONFIG_LIVE_EVIDENCE_SCOPE_CLAUSE = '(of the declared source lines; a source the declaration does not name is not counted)';

/** The Config arm (`fact.lane === 'config'`, a Config-sources leg — Kubernetes from 1.19.0). Same heading and the same fact name;
 *  its own words, because its items are source LINES (a kept Git file, a live system, a supplied state), not devices. */
function renderConfigLiveEvidence(fact: Obj): string[] {
  const head = `- **Live evidence — ${LIVE_EVIDENCE_RENDER_NAME}**:`;
  if (fact.checked !== true) {
    return [`${head} not checked — ${q(fact.reason ?? 'no reason recorded')} (the platform could not read a Config sources declaration for this leg, so it states nothing about which sources were read).`];
  }
  const out = [
    `${head} \`${q(fact.summary)}\` ${CONFIG_LIVE_EVIDENCE_SCOPE_CLAUSE} — ${q(fact.items)} source line(s) declared; ${q(fact.liveDeclared)} declare a live read (\`live-read\`): ${q(fact.liveRead)} read, ${listTotal(fact, 'liveNotRead')} not read; ${q(fact.gitFileLines)} Git file line(s); ${q(fact.supplied)} supplied.`,
  ];
  if (Array.isArray(fact.liveNotRead) && fact.liveNotRead.length) {
    out.push(`  - live read declared, not read: ${names(fact.liveNotRead, (x) => `\`${q(x.label)}\` (${q(x.state)})`)}${more(fact, 'liveNotRead', fact.liveNotRead)}`);
  }
  if (Array.isArray(fact.liveReadItems) && fact.liveReadItems.length) {
    out.push(`  - live read: ${names(fact.liveReadItems, (x) => `\`${q(x.label)}\` (${q(x.calls)} successful call(s) to the declared service)`)}${more(fact, 'liveReadItems', fact.liveReadItems)}`);
  }
  if (Array.isArray(fact.gitFiles) && fact.gitFiles.length) {
    out.push(`  - Git files: ${names(fact.gitFiles, (x) => `\`${q(x.label)}\` (${q(x.gitRead)})`)}${more(fact, 'gitFiles', fact.gitFiles)}`);
  }
  if (Array.isArray(fact.suppliedItems) && fact.suppliedItems.length) {
    out.push(`  - supplied in the task, not read: ${names(fact.suppliedItems, (x) => `\`${q(x.label)}\``)}${more(fact, 'suppliedItems', fact.suppliedItems)}`);
  }
  if (typeof fact.undeclaredGitFileReads === 'number' && fact.undeclaredGitFileReads > 0) {
    out.push(`  - Git file reads no declared line names (never held): ${fact.undeclaredGitFileReads}`);
  }
  return out;
}

/** Config sources STEP 3 P3: the population clause of the FILES arm. Pinned. */
export const FILES_LIVE_EVIDENCE_SCOPE_CLAUSE = '(of the declared configuration files; a file the declaration does not name is not counted)';
/** Review AR C-1: what `all-git-only` is a statement ABOUT. The fact is execution-facts'; these WORDS are prompt-construction's to
 *  change with the protocol text, and are pinned (LE-F5). */
export const ALL_GIT_ONLY_FILES_NOTE = '`all-git-only` is a statement about the configuration FILES: no served copy of any declared file was read. It says nothing about the live service\'s targets and rules: this fact does not cover them.';
const LABEL_SHOWN_RE = SOURCE_LABEL_RE;
const label = (v: unknown): string => (typeof v === 'string' && LABEL_SHOWN_RE.test(v) ? `\`${v}\`` : '(one file)');

/** The FILES arm (`fact.lane === 'config'`, `fact.unit === 'files'` — observability from 1.12.0): the items are configuration FILES,
 *  each kept from Git or from the read-only service; a Git file may also declare a live read of the served copy. Its own words. */
function renderFilesLiveEvidence(fact: Obj): string[] {
  const head = `- **Live evidence — ${LIVE_EVIDENCE_RENDER_NAME}**:`;
  if (fact.checked !== true) {
    const why = fact.reason === 'no-compare-record'
      ? "the platform's comparison record did not reach this fact, so it states nothing about which declared files were read"
      : 'the platform could not read a Config sources declaration for this leg, so it states nothing about which sources were read';
    return [`${head} not checked — ${q(fact.reason ?? 'no reason recorded')} (${why}).`];
  }
  const out = [
    `${head} \`${q(fact.summary)}\` ${FILES_LIVE_EVIDENCE_SCOPE_CLAUSE} — ${q(fact.items)} configuration file(s) declared: ${q(fact.gitFileLines)} kept from Git, ${q(fact.serviceHeld)} kept from the read-only service (${q(fact.serviceHeldRead)} returned); ${q(fact.liveDeclared)} of the Git files also declare a live read of the served copy: ${q(fact.liveRead)} returned, ${listTotal(fact, 'liveNotRead')} declared file(s) not returned.`,
  ];
  if (fact.summary === 'all-git-only') out.push(`  - ${ALL_GIT_ONLY_FILES_NOTE}`);
  if (Array.isArray(fact.gitOnlyFiles) && fact.gitOnlyFiles.length) {
    out.push(`  - kept from Git, no live read of the served copy declared: ${(fact.gitOnlyFiles as unknown[]).map(label).join(', ')}${more(fact, 'gitOnlyFiles', fact.gitOnlyFiles)}`);
  }
  if (Array.isArray(fact.liveNotRead) && fact.liveNotRead.length) {
    out.push(`  - declared, not returned by the declared service: ${names(fact.liveNotRead, (x) => {
      const keys = Array.isArray(x.returnedKeys) ? (x.returnedKeys as unknown[]).filter((k) => typeof k === 'string' && RETURNED_KEY_RE.test(k)).slice(0, 20) : null;
      return `${label(x.label)} (${q(x.kind)}: ${q(x.state)}${keys ? `; the service returned: ${keys.length ? keys.map((k) => `\`${k}\``).join(', ') : 'no file'}` : ''})`;
    })}${more(fact, 'liveNotRead', fact.liveNotRead)}`);
  }
  const gs = fact.gitOnlyStatement && typeof fact.gitOnlyStatement === 'object' ? (fact.gitOnlyStatement as Obj) : null;
  // No sentence registered for the composed version (the table is EMPTY until the 1.12.0 text ships) ⇒ NOTHING is rendered: the
  // stamp keeps the named state for the operator, and an agent is told nothing about a check the platform cannot make yet.
  if (gs && !(gs.checked !== true && gs.reason === 'no-sentence-for-version')) {
    if (gs.checked !== true) out.push(`  - the package's Git-only statement: not checked (${q(gs.reason ?? 'no reason recorded')}).`);
    else out.push(`  - the package's Git-only statement: stated for ${q(gs.stated)} of ${q(gs.listed)} listed file(s)${Array.isArray(gs.missing) && gs.missing.length ? `; not stated for: ${(gs.missing as unknown[]).map(label).join(', ')}` : ''}.`);
  }
  return out;
}

export function renderLiveEvidenceForPrompt(fact: Obj | null | undefined): string[] | null {
  if (!fact || typeof fact !== 'object') return null;
  if (fact.lane === 'config' && fact.unit === 'files') return renderFilesLiveEvidence(fact);
  if (fact.lane === 'config') return renderConfigLiveEvidence(fact);
  const head = `- **Live evidence — ${LIVE_EVIDENCE_RENDER_NAME}**:`;
  if (fact.checked !== true) {
    return [`${head} not checked — ${q(fact.reason ?? 'no reason recorded')} (the platform could not read a Device sources declaration for this leg, so it states nothing about which devices were read).`];
  }
  const out = [
    `${head} \`${q(fact.summary)}\` ${LIVE_EVIDENCE_SCOPE_CLAUSE} — ${q(fact.items)} device(s) declared; ${q(fact.liveDeclared)} declare a live read (\`device-read\` or \`live-read\`): ${q(fact.liveRead)} read whole, ${listTotal(fact, 'liveNotRead')} not read whole; ${listTotal(fact, 'gitOnly')} from a Git file only; ${q(fact.notApplicable)} command package (no read applies).`,
  ];
  // Contract-devices fold (owner option 1, 2026-11-05): names from DATA only; no scope word — the Reviewer decides scope (R1 v2 (c)).
  if (Array.isArray(fact.contractNotDeclared) && fact.contractNotDeclared.length) {
    out.push(`  - ${CONTRACT_NOT_DECLARED_LABEL}: ${(fact.contractNotDeclared as unknown[]).map((d) => `\`${q(d)}\``).join(', ')}${more(fact, 'contractNotDeclared', fact.contractNotDeclared)}`);
  }
  if (Array.isArray(fact.liveNotRead) && fact.liveNotRead.length) {
    out.push(`  - live read declared, not read whole: ${names(fact.liveNotRead, (x) => `\`${q(x.device)}\` (${q(x.kind)}: ${q(x.state)})`)}${more(fact, 'liveNotRead', fact.liveNotRead)}`);
  }
  if (Array.isArray(fact.liveReadDevices) && fact.liveReadDevices.length) {
    out.push(`  - read whole: ${names(fact.liveReadDevices, (x) => `\`${q(x.device)}\` (${q(x.kind)}, tool call #${q(x.toolCallIndex)})`)}${more(fact, 'liveReadDevices', fact.liveReadDevices)}`);
  }
  if (Array.isArray(fact.gitOnly) && fact.gitOnly.length) {
    out.push(`  - Git file only, no live read declared: ${names(fact.gitOnly, (x) => `\`${q(x.device)}\` (Git file: ${q(x.gitRead)})`)}${more(fact, 'gitOnly', fact.gitOnly)}`);
  }
  if (Array.isArray(fact.notApplicableDevices) && fact.notApplicableDevices.length) {
    out.push(`  - command package: ${names(fact.notApplicableDevices, (x) => `\`${q(x.device)}\``)}${more(fact, 'notApplicableDevices', fact.notApplicableDevices)}`);
  }
  if (typeof fact.undeclaredDeviceConfigReads === 'number' && fact.undeclaredDeviceConfigReads > 0) {
    out.push(`  - device configuration reads of a device or service the declaration does not name: ${fact.undeclaredDeviceConfigReads}`);
  }
  return out;
}
