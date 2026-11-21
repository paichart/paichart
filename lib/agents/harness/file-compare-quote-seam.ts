/**
 * Config sources STEP 3 P3 (plan W3, sec-ops F-4a) — THE ONE SEAM between the file comparison and the credential-shaped-line list.
 *
 * The comparator never quotes a credential-shaped line; it counts it. The LIST is not written here and never will be: it is ONE
 * exported function of the redactor (`lib/agents/harness/redact-artifact-secrets.ts`), built with its own version constant and a
 * superset test on another branch. A second list in this file would be a second definition of "credential-shaped" — the
 * two-extractor defect.
 *
 * THE SEAM IS OPEN since redactor v13 (`isCredentialShapedLine`, `CREDENTIAL_LINE_VERSION`). The function judges ONE line and its
 * caller contract has three steps (read it at the function): the comparator (1) holds REDACTED text only, (2) withholds a line that
 * carries the redaction placeholder and every line of a block a flagged line opens (`blockWithheldLines`, file-source-compare.ts),
 * (3) asks THIS module about each remaining line. Steps 1 and 2 are the comparator's; this module is step 3 and nothing else.
 * To CLOSE it again (a fault in the list): set `CREDENTIAL_LINE_SEAM` to 'closed' — every differing line is then COUNTED
 * (`notQuoted`), none is quoted, and the record says why (`quotesWithheld: 'credential-list-not-wired'`). Nothing else changes: the
 * comparator, the record validator and the render all ask THIS module.
 *
 * CLIENT-SAFE: the §6 render (`render-pipeline-context.ts`, reachable from a client component) imports this module, so it may
 * import only the redactor, which itself imports nothing.
 */

import { isCredentialShapedLine } from './redact-artifact-secrets';

/** ⚠️ THE SWITCH. 'open' = a differing line that is not credential-shaped may be quoted; 'closed' = NOTHING is quoted. */
export const CREDENTIAL_LINE_SEAM: 'closed' | 'open' = 'open';

/** The redactor's "is this line credential-shaped?" function, or null while the seam is closed. */
export function credentialLineCheck(): ((line: string) => boolean) | null {
  return (CREDENTIAL_LINE_SEAM as string) === 'open' ? isCredentialShapedLine : null;
}

/** May this line be QUOTED? False for every line while the seam is closed; otherwise false exactly for a credential-shaped line.
 *  The one predicate the comparator, the stored-record validator and the render ask. */
export function quotableLine(line: string): boolean {
  const check = credentialLineCheck();
  return check !== null && !check(line);
}

/** Is the seam open (a line can be quoted at all)? */
export function quoteSeamOpen(): boolean {
  return credentialLineCheck() !== null;
}
