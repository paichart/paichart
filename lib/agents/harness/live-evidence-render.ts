/**
 * The §6 render of `liveEvidence`, split out (2026-11-05) so it is CLIENT-SAFE: `render-pipeline-context.ts` is reachable from a
 * client component (AgentBuilderPreview → build-agent-prompt-body), and importing it from `live-evidence.ts` pulled the read
 * record → extractor → descriptor-fetch (`dns`) into the browser bundle (`npm run build` failed on push 1a's clean-copy gate). PURE:
 * no imports. `live-evidence.ts` re-exports everything here, so callers and tests are unchanged. The `gitDeviceComparison` render
 * follows the same split (git-device-comparison.ts holds no server imports).
 */
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

export function renderLiveEvidenceForPrompt(fact: Obj | null | undefined): string[] | null {
  if (!fact || typeof fact !== 'object') return null;
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
