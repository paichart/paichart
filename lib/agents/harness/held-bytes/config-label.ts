/**
 * Config sources STEP 3 (slice P1; plan v2.1 W6, §13 A1, §13 E) — how a `## Config sources` LABEL names a platform file.
 *
 * On a protocol with a label table (observability — `configLabelTableOf`), every label of a block must name one of the PLATFORM's
 * file targets (owner decision 10; a customer's own targets are deferred):
 *
 *     obs-otelcol                    the target's one file (a `const` path)
 *     obs-ingress.<key>              one file of a target that holds several (a `template` path over `{key}`)
 *
 * THE SPLIT IS DERIVED, never stored on an entry: a label is split at its FIRST `.` into a target and a key. That is exact while no
 * platform target contains a `.` (pinned by scripts/test-config-sources.ts) — the longest-match resolver the plan first proposed
 * was cut (§13 E). ONE function (`configLabelKeyProblem`) refuses an empty key, `.` and `..`.
 *
 * WHERE THIS IS CONSULTED: ONCE, at block level, when the leg's snapshot is taken (`configSnapshotDecision`,
 * config-sources-read.ts). Its outcome is stored beside the snapshot's resolution as `labelCheck`; the governing read returns a
 * named problem from that field. The line parser and the snapshot READER never call this, so a later edit of the descriptor table
 * cannot move a stored snapshot. The requirements publish check calls the SAME function at $0.
 *
 * PURE: no prisma, no logger, no I/O.
 */
import type { ConfigLabelCheck, ConfigLabelProblem, ConfigSourceLine } from '../config-sources';
import { PLATFORM_DEFAULT_DESCRIPTORS, type Descriptor, type FileSpec } from './descriptors';

// A typed require, relative, as descriptors.ts does (this module loads under the deploy's seed config and in scripts without tsconfig-paths).
const { heldPathRefusal } = require('../../../mcp/server/config/git-file-source-pin') as { heldPathRefusal: (p: string) => string | null };

/** The ONE key check: an empty key, `.` and `..` are refused. (A label cannot hold `/`, a space or a control character — the
 *  grammar's label pattern refuses those before this is asked.) */
export function configLabelKeyProblem(key: string): boolean {
  return key.length === 0 || key === '.' || key === '..';
}

/** A label split at its FIRST `.`: the target, and the key after it (`null` when the label has no `.`). Derived, never stored. */
export function configLabelParts(label: string): { target: string; key: string | null } {
  const i = label.indexOf('.');
  return i < 0 ? { target: label, key: null } : { target: label.slice(0, i), key: label.slice(i + 1) };
}

/** The platform's file targets a label may name: every file spec of the table whose TARGET is a constant, keyed by that constant.
 *  A spec whose target is not a constant (none today) names no label target. First entry wins on a repeated target. */
export function platformLabelTargets(descriptors: readonly Descriptor[] = PLATFORM_DEFAULT_DESCRIPTORS): Map<string, FileSpec> {
  const out = new Map<string, FileSpec>();
  for (const d of descriptors) for (const f of d.files ?? []) {
    if ('const' in f.target && !out.has(f.target.const)) out.set(f.target.const, f);
  }
  return out;
}

export type ResolvedConfigLabel = { ok: true; target: string; path: string } | { ok: false; problem: ConfigLabelProblem };

/** One label ⇒ the platform (target, path) it names, or the named problem. Only `const` and `template` path sources resolve; an
 *  `argument` or `uri` path cannot be known from a label (`label-path-not-resolvable`). The resolved path then meets the ONE
 *  never-held predicate (`obs-ingress..htpasswd` ⇒ `path-never-held`), whatever the line's kind. */
export function resolveConfigLabel(label: string, descriptors: readonly Descriptor[] = PLATFORM_DEFAULT_DESCRIPTORS): ResolvedConfigLabel {
  const { target, key } = configLabelParts(label);
  if (key !== null && configLabelKeyProblem(key)) return { ok: false, problem: 'label-key-invalid' };
  const spec = platformLabelTargets(descriptors).get(target);
  if (!spec) return { ok: false, problem: 'label-target-not-supported' };
  let path: string;
  if ('const' in spec.path) {
    if (key !== null) return { ok: false, problem: 'label-key-invalid' };   // a one-file target takes no key
    path = spec.path.const;
  } else if ('template' in spec.path) {
    if (key === null) return { ok: false, problem: 'label-key-invalid' };   // a several-file target needs one
    path = spec.path.template.split('{key}').join(key);
  } else {
    return { ok: false, problem: 'label-path-not-resolvable' };
  }
  if (heldPathRefusal(path.replace(/^\/+/, '')) !== null) return { ok: false, problem: 'path-never-held' };
  return { ok: true, target, path };
}

/** The block-level check: every entry's label must resolve. The FIRST problem is named, with the index of its entry in `entries`
 *  (an index into the declaration's entries, not a line of the task text). Returns the `labelCheck` a snapshot stores. */
export function resolveConfigLabels(entries: readonly ConfigSourceLine[], table: string,
  descriptors: readonly Descriptor[] = PLATFORM_DEFAULT_DESCRIPTORS): ConfigLabelCheck {
  for (let i = 0; i < entries.length; i++) {
    const r = resolveConfigLabel(entries[i].label, descriptors);
    if (!r.ok) return { table, state: 'problem', problem: r.problem, lineIndex: i };
  }
  return { table, state: 'resolved' };
}
