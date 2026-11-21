/**
 * Config sources STEP 3 P3 (plan W9, owner decision 2a) — the fixed sentence an Author writes for each configuration file its leg
 * keeps from Git with NO live read of the served copy, keyed by protocol and by the protocol text's version.
 *
 * THIS MODULE IMPORTS NOTHING (the `plan-witness-stop-sentence.ts` pattern): the protocol seed imports the constant, the deploy
 * compiles the seed without the harness tree, and the §6 render can reach it from a client bundle.
 *
 * ⚠️ THE TABLE IS EMPTY ON PURPOSE. The WORDS are prompt-construction's and ship with the observability-config 1.12.0 text; no
 * sentence is invented here. Until a row exists the fact reads `gitOnlyStatement: { checked: false, reason: 'no-sentence-for-version' }`
 * — a named state, never a silent pass. A row is `{ '<canonical protocol name>': { '<version>': '… {label} …' } }`: exactly one
 * `{label}` slot, compared after whitespace and emphasis normalisation only.
 */
export const GIT_ONLY_STATEMENT_SENTENCES: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({});

/** The sentence for a protocol (canonical long name) at an exact text version, or null when none is registered. */
export function gitOnlyStatementSentenceFor(protocol: string | null | undefined, version: string | null | undefined): string | null {
  if (typeof protocol !== 'string' || typeof version !== 'string') return null;
  const row = Object.prototype.hasOwnProperty.call(GIT_ONLY_STATEMENT_SENTENCES, protocol) ? GIT_ONLY_STATEMENT_SENTENCES[protocol] : undefined;
  return row && Object.prototype.hasOwnProperty.call(row, version) ? row[version] : null;
}
