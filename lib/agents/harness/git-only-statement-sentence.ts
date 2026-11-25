/**
 * Config sources STEP 3 P3 (plan W9, owner decision 2a) — the fixed sentence an Author writes for each configuration file its leg
 * keeps from Git with NO live read of the served copy, keyed by protocol and by the protocol text's version.
 *
 * THIS MODULE IMPORTS NOTHING (the `plan-witness-stop-sentence.ts` pattern): the protocol seed imports the constant, the deploy
 * compiles the seed without the harness tree, and the §6 render can reach it from a client bundle.
 *
 * The WORDS are prompt-construction's and ship with the protocol text that tells the Author to write them; no sentence is invented
 * here. A row is `{ '<canonical protocol name>': { '<version>': '… {label} …' } }`: exactly one `{label}` slot, compared after
 * whitespace and emphasis normalisation only. Where no row exists for the composed version the fact reads
 * `gitOnlyStatement: { checked: false, reason: 'no-sentence-for-version' }` — a named state, never a silent pass.
 *
 * ⚠️ KEYED ON THE EXACT TEXT VERSION: every later version bump of such a protocol needs its own row in the same commit
 * (`test:config-sources` MIX5b reads the seed's version and goes red without one).
 *
 * observability-config 1.12.0 (the join, 2026-11-23): the text shows the Author the sentence WITH a full stop; the registered
 * string ends BEFORE it, so any punctuation after the sentence still matches. The label sits between fixed words on both sides
 * (a label-first sentence read `obs-otelcol` as stating `otelcol`). Pinned to the text by `test:domain-carry-pins` OBS-CS #6.
 */
export const GIT_ONLY_STATEMENT_SENTENCES: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({
  'observability-config-protocol': Object.freeze({ '1.12.0': 'For the file {label} this package relies on the Git file only' }),
});

/** The sentence for a protocol (canonical long name) at an exact text version, or null when none is registered. */
export function gitOnlyStatementSentenceFor(protocol: string | null | undefined, version: string | null | undefined): string | null {
  if (typeof protocol !== 'string' || typeof version !== 'string') return null;
  const row = Object.prototype.hasOwnProperty.call(GIT_ONLY_STATEMENT_SENTENCES, protocol) ? GIT_ONLY_STATEMENT_SENTENCES[protocol] : undefined;
  return row && Object.prototype.hasOwnProperty.call(row, version) ? row[version] : null;
}
