/**
 * Provenance marking for the sections a human COMPARES AGAINST at apply time.
 *
 * THE DEFECT THIS ADDRESSES (`cline_docs/follow-ups/validation-text-uncontained-2026-08-02.md`,
 * raised by sec-ops during the ASN panel and rated above the ASN question in practical severity):
 *
 *   The architecture's primary control is "a human applies the change deliberately, having verified
 *   it." The thing the human verifies against is the change package's **validation steps** — an exact
 *   command plus its exact expected output. That text is free-form, authored by the agent, and
 *   checked by nothing: containment is set membership over HARVESTED values, and expected-output prose
 *   is not a harvested value. So an attacker who can influence it does not need to make the CHANGE
 *   look correct — only the VERIFICATION. The operator sees a match and signs off.
 *
 * WHY THIS IS THE READ PATH AND NOT THE PERSIST PATH. The obvious place to insert a banner is where
 * `report.md` is written (`execution-terminal-persist.ts`). That is WRONG and would have broken a
 * deliberate invariant: report.md is carried VERBATIM — byte-pinned by
 * `test-terminal-persist-shape.ts` ("upstream extraction verbatim — no double-wrap") — and downstream
 * legs chain on it as the upstream deliverable. Editing the stored artifact would corrupt the chain to
 * warn a human. So the marking happens at PRESENTATION: storage stays verbatim, and the operator is
 * told at the moment they read it.
 *
 * PROTOCOL 10 — THIS SHIPS A FACT, NOT A VERDICT. It states what was and was not verified, which is
 * checkable and wrong only as a findable bug. It deliberately does NOT say the content is wrong,
 * suspicious, or unsafe: that would be a judgement about text we have not evaluated, shipped to every
 * reader of every change package.
 *
 * SCOPE, STATED HONESTLY: this covers the MCP fetch surface. A reader who opens the artifact in the
 * GUI viewer sees no marker yet — `markValidationProvenance` is exported so that path can call the
 * SAME function rather than growing a second wording that drifts.
 */

/** Present in every banner; the idempotency key. Changing it re-marks already-marked text. */
const PROVENANCE_MARKER = 'Provenance — what has and has not been verified';

/**
 * H2 headings whose content an operator uses as a COMPARISON TARGET.
 * Deliberately narrow: a false positive puts a warning on text nobody verifies against, which trains
 * readers to skip it. `verification` is included because domains word it differently (the terraform
 * leg writes "Verification", the network leg "Validation Steps").
 *
 * Built PER CALL, not hoisted to module scope. A shared /g regex carries `lastIndex` between calls,
 * and the usual "just reset it" fix is untestable here — the exec loop below always runs to null,
 * which resets it anyway, so a guard against that bug would be a guard that cannot fail. Removing the
 * shared state removes the question. (Found by mutating the reset away and watching every test still
 * pass — 2026-08-02.)
 */
const targetHeadingRe = () => /^##\s+(.*(?:validation|rollback|verification).*)$/gim;

/**
 * FACT: which comparison-target sections this document contains.
 * @param {string} markdown
 * @returns {string[]} heading texts, in document order, deduped
 */
function detectUnverifiedSections(markdown) {
  if (typeof markdown !== 'string' || markdown.length === 0) return [];
  const out = [];
  const re = targetHeadingRe();
  let m;
  while ((m = re.exec(markdown)) !== null) {
    const heading = m[1].replace(/[*_`#]/g, '').trim();
    if (heading && !out.includes(heading)) out.push(heading);
  }
  return out;
}

/**
 * Prepend a provenance banner IF the document carries comparison-target sections.
 *
 * Idempotent: text already carrying the marker is returned untouched, so a re-fetch (or a fetch of an
 * artifact that quoted a marked one) cannot stack banners.
 *
 * @param {string} text            artifact content
 * @param {string} [name]          artifact name; markdown-only gate
 * @returns {{ text: string, provenance: {unverifiedSections: string[], independentlyVerified: false}|null }}
 */
function markValidationProvenance(text, name) {
  if (typeof text !== 'string' || text.length === 0) return { text, provenance: null };
  if (name && !/\.md$/i.test(name)) return { text, provenance: null };
  if (text.includes(PROVENANCE_MARKER)) {
    // Already marked. Report the fact without re-deriving it from a body we have already altered.
    return { text, provenance: { unverifiedSections: detectUnverifiedSections(text), independentlyVerified: false } };
  }

  const sections = detectUnverifiedSections(text);
  if (sections.length === 0) return { text, provenance: null };

  const list = sections.map(s => `\`${s}\``).join(', ');
  const banner =
    `> ⚠️ **${PROVENANCE_MARKER}.**\n` +
    `> The following section(s) of this document were **written by the AI agent that produced this ` +
    `change package**: ${list}.\n` +
    `> Their commands and expected outputs have **not been run against any device**, and **no ` +
    `mechanical check compares them to harvested device state** — the containment checks that guard ` +
    `the derived values in this package do not extend to this prose.\n` +
    `> If you are using these steps to confirm the change succeeded, you are comparing the device ` +
    `against text from the same source as the change itself, not against an independent check.\n\n`;

  return { text: banner + text, provenance: { unverifiedSections: sections, independentlyVerified: false } };
}

module.exports = { markValidationProvenance, detectUnverifiedSections, PROVENANCE_MARKER };
