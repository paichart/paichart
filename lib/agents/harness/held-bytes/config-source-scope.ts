/**
 * Config sources STEP 2 (2026-11-15) — what a Config-sources leg may HOLD, and what it must hold. PURE.
 *
 * Until this step a Kubernetes leg held every file it read through the pinned Git service. From its Config-sources text version a
 * leg holds a Git file only when BOTH are true (READING-MAP §a rule 6 — "undeclared never held"):
 *   1. the pin admitted the read (unchanged — the call gate and the extractor), AND
 *   2. the file IS a `git-file` line of the leg's governing declaration (target + path; the line's ref must be one the platform pin
 *      admits, else the file held at that target + path is another revision — the network rule, `platformPinRefusesRef`).
 * A Git file the pin admits but no line declares is moved from `files` to the handleless refusal `git-file-not-declared`
 * (`detail.field = 'declaration'`) — never a base, never a handle. That is the in-pin-undeclared negative control.
 *
 * And the D-1 force (plan §3.8 rule 4), in the same push as the slot: every declared `git-file` line must have a held CAPTURE ref
 * in the leg's authoritative Harvester's capture, else the leg is forced `git-file-not-held` (`gitFilesNotHeld` names the labels).
 * A declaration that is not `parsed` forces by its own name (`config-sources-<state>`): no block (owner D1), unparseable, conflict,
 * a missing / unreadable / changed snapshot, or a read that could not be made.
 *
 * `live-read` and `supplied` lines never hold and never force.
 */
import type { LegConfigSourcesResolution } from '../config-sources-read';
import { declaredGitFiles, type ConfigSourceLine } from '../config-sources';
import { isFileOfGitLine } from './device-read-scope';
import type { ExtractResult, ExtractedFile, ExtractedRefusal } from './extract';

import { GIT_FILE_SOURCE_PINS } from '@/lib/mcp/server/config/git-file-source-pin';

type GitLine = Extract<ConfigSourceLine, { kind: 'git-file' }>;
export const GIT_TARGET_PREFIX = 'github:';
export const CONFIG_FILES_NOT_HELD_CAP = 20;

/** A declared line on a PLATFORM pin's repo whose ref that pin never admits (the line's ref, else `main`) can never have been held AT
 *  THAT REF, so a file held at the same target + path never satisfies it (held-edit-carrier.ts `platformPinRefusesRef`, same rule). */
export function configPinRefusesRef(l: { owner: string; repo: string; ref: string | null }): boolean {
  const o = l.owner.toLowerCase(); const rp = l.repo.toLowerCase();
  return Object.values(GIT_FILE_SOURCE_PINS as Record<string, { owner: string; repo: string; refs: readonly string[] }>)
    .some((pin) => pin.owner.toLowerCase() === o && pin.repo.toLowerCase() === rp && !pin.refs.includes(l.ref ?? 'main'));
}

function lineOf(f: { target: string; path: string }, lines: readonly GitLine[]): GitLine | null {
  return lines.find((l) => !configPinRefusesRef(l) && isFileOfGitLine(f, l)) ?? null;
}

/** Capture scope. `sources` null/undefined or `not-config-source-leg` ⇒ the result unchanged (every leg that is not a Config-sources
 *  leg: byte-identical). Otherwise every Git-lane file must be a declared line; a declaration that is not `parsed` declares none. */
export function withConfigSourcesScope(ex: ExtractResult, sources: LegConfigSourcesResolution | null | undefined): ExtractResult {
  if (!sources || sources.state === 'not-config-source-leg') return ex;
  const lines = sources.state === 'parsed' ? declaredGitFiles(sources) : [];
  const files: ExtractedFile[] = []; const moved: ExtractedRefusal[] = [];
  for (const f of ex.files) {
    if (!f.target.startsWith(GIT_TARGET_PREFIX) || lineOf(f, lines)) { files.push(f); continue; }
    const { text: _t, sourceRevision: _r, ...rest } = f; void _t; void _r;
    moved.push({ ...rest, target: null, path: null, refusal: 'git-file-not-declared',
      detail: { field: 'declaration', ...(sources.state === 'parsed' ? {} : { state: sources.state }) } });
  }
  return moved.length ? { ...ex, files, refusals: [...ex.refusals, ...moved] } : ex;
}

export interface ConfigForce { reason: string; gitFilesNotHeld?: string[]; gitFilesNotHeldTotal?: number }

/** The D-1 force. `captureRefs` = the CAPTURE refs of the leg's authoritative Harvester. Null = nothing to force. */
export function configGitFileForce(sources: LegConfigSourcesResolution, captureRefs: ReadonlyArray<{ target?: string; path?: string }>,
  captureSnapshotRefusal: string | null = null): ConfigForce | null {
  if (captureSnapshotRefusal) return { reason: captureSnapshotRefusal };
  if (sources.state === 'not-config-source-leg') return null;
  if (sources.state !== 'parsed') return { reason: `config-sources-${sources.state}` };
  const held = (l: GitLine) => !configPinRefusesRef(l)
    && captureRefs.some((x) => typeof x.target === 'string' && typeof x.path === 'string' && isFileOfGitLine({ target: x.target, path: x.path }, l));
  const notHeld = declaredGitFiles(sources).filter((l) => !held(l)).map((l) => l.label);
  if (!notHeld.length) return null;
  return { reason: 'git-file-not-held', gitFilesNotHeld: notHeld.slice(0, CONFIG_FILES_NOT_HELD_CAP), gitFilesNotHeldTotal: notHeld.length };
}
