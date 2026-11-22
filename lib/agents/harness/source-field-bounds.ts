/**
 * Config sources STEP 3 P5 (whole-diff review F1; register CONFIG-SOURCES-OBS-JOIN-PRECONDITIONS item 21) — ONE definition of the
 * shape of each DECLARED field, used by the GRAMMAR that accepts a `## Device sources` / `## Config sources` line
 * (device-sources.ts, and through it config-sources.ts) AND by every reader that re-validates a STORED fact built from such a line
 * (git-live-drift.ts `validFileCompareRecord` / `renderableCompareFile`, live-evidence-render.ts).
 *
 * WHY ONE: the two sides were written apart, and the stored-record validator was NARROWER than the grammar — a Git path segment
 * starting `.` `_` `@` `+` `-`, a path over 300 characters, a ref over 200, a service over 300, a returned key such as `.htpasswd`
 * were all legal to declare and voided the whole compare record on re-read (`no-compare-record` for every file of the leg; fail
 * closed, and wrong). A reader must accept exactly what the writer can produce from a legal declaration.
 *
 * IMPORT-FREE on purpose: git-live-drift.ts and live-evidence-render.ts are client-safe modules whose only import may be this file
 * (pinned: test-git-live-drift R3, test-live-evidence LE-CS, and SFB1 for this file). No pattern here has a nested quantifier; each
 * is anchored and bounded, and the path test splits on `/` and asks one bounded pattern per segment.
 */

/** A source LABEL, a DEVICE name, and a platform file TARGET: one pattern (device-sources.ts `isSourceLabel`). */
export const SOURCE_LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
/** A Git owner or repository name. */
export const GIT_OWNER_REPO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
/** ONE segment of a Git path. The grammar sets no bound on the number of segments: a path is as long as its declaration. */
export const GIT_PATH_SEGMENT_RE = /^[A-Za-z0-9._@+-]{1,255}$/;
/** A Git ref. */
export const GIT_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;
/** A declared service string, as WRITTEN: its longest legal form. */
export const SERVICE_DECLARED_MAX_CHARS = 512;
/**
 * A declared service string as SHOWN on a stored fact (device-source-facts.ts `shownService`): a name is shown as written; a
 * descriptor URL goes through the IF-2 masker, which re-serialises it — a character outside ASCII becomes its percent-encoded
 * UTF-8 (at most 9 characters for one UTF-16 unit), and a query value becomes `***` (at most twice the length). So the shown form
 * of a legal 512-character service is at most 512 × 9 = 4,608 characters; this bound is above that with room for the scheme and a
 * trailing slash. NOT the grammar's bound: a different field (the masked form), derived from it. Pinned by walking the extremes
 * through the builder and the validator (test-file-source-compare REC7b).
 */
export const SERVICE_SHOWN_MAX_CHARS = 8192;

/** Is `p` a declared Git path — one or more `/`-separated segments, each legal, none `.` or `..`? No leading slash. */
export function isDeclaredGitPath(p: unknown): p is string {
  if (typeof p !== 'string' || p.length === 0) return false;
  for (const seg of p.split('/')) { if (!GIT_PATH_SEGMENT_RE.test(seg) || seg === '.' || seg === '..') return false; }
  return true;
}

/** Is `key` a file key a service can return for `target` such that `target.key` is a LABEL (held-bytes/config-source-scope.ts
 *  `servedKeyOf`)? The key ALONE need not be a label: `.htpasswd` and `_default.conf` are keys. */
export function isReturnedKeyOf(target: unknown, key: unknown): key is string {
  return typeof target === 'string' && typeof key === 'string' && key.length > 0 && SOURCE_LABEL_RE.test(`${target}.${key}`);
}
/** The same question with no target at hand (a render that lists keys): the characters and length any target allows. */
export const RETURNED_KEY_RE = /^[A-Za-z0-9._-]{1,126}$/;
