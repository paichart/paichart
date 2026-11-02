/**
 * PLATFORM-HELD-BYTES — the MECHANICAL public-export hold (panel F14 / D6, owner 2026-10-17; GO-MINIMAL R6, PH-7).
 *
 * Since Phase 10 the held-file text lives in observability-config-protocol ≥ 1.10.0, which IS a published protocol. Stage B kept the
 * variant out of the public mirror with a NOT_PUBLISHED entry (a mechanical guard); the fold removed that entry, so without this file
 * the next render would publish held text with no self-host text beside it. R6 says: no public export of the held capability until
 * the self-host / operator text exists (P3-S4, SEC-P2-4, BC-N6, HUB-P2-5, the stdio trust model). This is that rule, as code.
 *
 * REMOVE IN THE PH-7 COMMIT: set SELF_HOST_HELD_TEXT_EXISTS to true in the same commit that adds the self-host text (or delete this
 * guard and its call), never before. Pinned by scripts/test-held-variant-protocol.ts.
 */
// PH-7 DONE (2026-11-01): docs/SELF-HOST-KEPT-FILES.md + .env.example R9/R10 ON landed in the same commit as this flip.
export const SELF_HOST_HELD_TEXT_EXISTS = true;

import { HELD_FILES_HEADING } from '../../lib/agents/harness/held-bytes/variant-protocol';

const HELD_FOLD_VERSION = [1, 10, 0];
const ver = (v: string): number[] => (v.match(/^(\d+)\.(\d+)\.(\d+)/)?.slice(1).map(Number)) ?? [0, 0, 0];
const atLeast = (a: number[], b: number[]) => a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] >= b[2];

/** A refusal message when rendering this protocol row publicly would export held text before the self-host text exists; else null.
 *  held-k8s 1j (PC S10): keyed on the PROPERTY — the text carries the shared held-files section heading — so a SECOND held domain is
 *  held back by construction, not by remembering to add its name. The obs name/version arm stays as a fail-closed backstop (a caller
 *  that passes no text cannot open the gate for obs). */
export function heldExportRefusal(name: string, version: string, promptText: string | null | undefined,
  selfHostTextExists: boolean = SELF_HOST_HELD_TEXT_EXISTS): string | null {
  if (selfHostTextExists) return null;
  const carriesHeldText = typeof promptText === 'string' && promptText.includes(HELD_FILES_HEADING);
  const obsHeld = name === 'observability-config-protocol' && atLeast(ver(version), HELD_FOLD_VERSION);
  if (!carriesHeldText && !obsHeld) return null;
  return `refusing to render ${name} v${version} publicly: it carries the held-file capability (PLATFORM-HELD-BYTES Phase 10) and the `
    + `self-host / operator text does not exist yet (R6 / PH-7). Write that text, then set SELF_HOST_HELD_TEXT_EXISTS in `
    + `scripts/export/held-export-guard.ts in the same commit.`;
}
