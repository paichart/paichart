/**
 * PLATFORM-HELD-BYTES — the `heldBytes` digest and manifest builders (Stage A WI-9, 2026-10-14). BUILDERS ONLY in
 * Stage A: nothing stamps, persists, chains or renders them (owner decision OA-10 — the wiring is Stage B). Stage A uses
 * them to measure the digest budget on real captures (the archive replay, WI-10).
 *
 * DIGEST — at most 1,024 serialised characters for EVERY input (owner decision OA-24; panel EF B-1, audit F1):
 *   - counts by refusal name are SPARSE (only names that occurred);
 *   - the first ≤ 3 rows carry `target` and the path BASENAME, each cut to ≤ 40 SERIALISED characters on a code-point
 *     boundary (`JSON.stringify(s).length − 2 ≤ 40`, so an escaped `"` or control character counts as what it costs), and
 *     a cut row names what was cut in `truncatedFields` — never a silent shortening;
 *   - a final guard measures `JSON.stringify(digest).length` and drops trailing rows, setting `rowsOmitted`, until it fits.
 *     Only the guard makes the bound true for every input (re-computed worst cases without it: 1,157–1,301 B).
 * MANIFEST — the full strings, every object, no cap (P5 R3: agents read the manifest).
 *
 * NEITHER carries any hash: no baseHash, no sha256(C), no 64-hex run (C5, P3-B1 — a hash next to a redacted line is a
 * dictionary oracle).
 * Plan: cline_docs/reviews/platform-held-bytes-2026-10-13/STAGE-A-PLAN.md WI-9 / §10.
 */
import type { HeldFileRefRow, HeldCaptureRefusalRow } from '../../../services/held-bytes-store';
import { assignHandles, orderHeldObjects } from './handles';

export const HELD_BYTES_DIGEST_MAX = 1024;
export const HELD_BYTES_FIELD_MAX = 40;
export const HELD_BYTES_DIGEST_ROWS = 3;
export const HELD_BYTES_MANIFEST_NAME = 'held-bytes.manifest.json';

export interface HeldBytesFactInput {
  refs: readonly HeldFileRefRow[];
  refusals: readonly HeldCaptureRefusalRow[];
  /** Sum of the held blobs' stored byte lengths (refs carry no size). */
  storedBytes: number;
}

export interface ManifestObject {
  handleIndex: number;
  /** Stage B V-5h: the file's handle (`assignHandles`) — `H<n>` of the pair's first object; a re-read shares it. */
  handle?: string;
  toolCallIndex: number;
  /** Stage B V-5h: with toolCallIndex, the manifest KEY (unique by MI-13 🔴 6). No ref ids — the chainer reads CAPTURE ids
   *  from held_file_refs at chain time (DB SF-2 option a). */
  selector?: string | null;
  target: string | null;
  path: string | null;
  sourceTool: string;
  held: boolean;
  /** K-3 (held-k8s): the Git commit a held file was read at — present ONLY when non-null (an obs manifest stays byte-identical).
   *  Never in the `heldBytes` fact or §6 (SYNTHESIS v3 R9: the 1,024-char digest bound and its no-hex rule). */
  sourceRevision?: string;
  lineCount?: number;
  redactedCount?: number;
  refusal?: string;
  detail?: Record<string, string | number>;
}

export interface DigestRow {
  handleIndex: number;
  target: string | null;
  path: string | null;
  lineCount?: number;
  redactedCount?: number;
  refusal?: string;
  truncatedFields?: Array<'target' | 'path'>;
}

export interface HeldBytesDigest {
  held: number;
  refWrite?: 'committed' | 'rolled-back';
  refused: Record<string, number>;
  totals: { files: number; storedBytes: number; redactedFiles: number };
  lane: 'file-artifact';
  manifest: string;
  rows: DigestRow[];
  rowsOmitted?: number;
}

/** Every object, in the HANDLE order (`orderHeldObjects`: tool call, then selector, then held-before-refused — Stage B
 *  V-5h; Stage A ordered by tool call then held-first, which left two files of one call unordered), with its handle index
 *  and handle. Shared with `assignHandles`, so a manifest index and an Author's handle can never disagree. */
export function buildHeldBytesManifest(input: HeldBytesFactInput): { objects: ManifestObject[] } {
  const objs = [
    ...input.refs.map((r) => ({
      toolCallIndex: r.toolCallIndex, selector: r.selector ?? null, target: r.target, path: r.path, sourceTool: r.sourceTool, held: true,
      lineCount: r.lineCount, redactedCount: r.redactedCount, blobSha256: r.blobSha256,
      ...(typeof r.sourceRevision === 'string' ? { sourceRevision: r.sourceRevision } : {}),
    })),
    ...input.refusals.map((r) => ({
      toolCallIndex: r.toolCallIndex, selector: r.selector ?? null, target: r.target, path: r.path, sourceTool: r.sourceTool, held: false,
      refusal: r.refusal, ...(r.detail ? { detail: r.detail } : {}),
    })),
  ];
  const ordered = orderHeldObjects(objs);
  const handleOf = new Map<string, string>();
  for (const h of assignHandles(ordered)) if (h.target !== null && h.path !== null) handleOf.set(JSON.stringify([h.target, h.path]), h.handle);
  return {
    // blobSha256 drives assignHandles (in memory) and is NEVER in the manifest (no hash anywhere — C5, P3-B1).
    objects: ordered.map((full, handleIndex) => { const { blobSha256: _omit, ...o } = full as typeof full & { blobSha256?: string }; void _omit; return {
      handleIndex,
      handle: (o.target !== null && o.path !== null ? handleOf.get(JSON.stringify([o.target, o.path])) : undefined) ?? `H${handleIndex + 1}`,
      ...o,
    }; }),
  };
}

/** Cut `s` so its JSON-serialised form (minus the quotes) is ≤ max, on a code-point boundary. */
export function capSerialised(s: string, max: number): { value: string; cut: boolean } {
  if (JSON.stringify(s).length - 2 <= max) return { value: s, cut: false };
  let out = '';
  for (const cp of s) {
    if (JSON.stringify(out + cp).length - 2 > max) break;
    out += cp;
  }
  return { value: out, cut: true };
}

const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1);

/** `maxChars` defaults to the 1,024 budget; tests lower it to exercise the guard (the measured worst case of this row
 *  shape is ~1,014, so at 1,024 the guard is a backstop that rarely fires). */
/** `opts.refWrite` (Stage B V-5e): the persist pick — omitted ⇒ the Stage A digest, byte for byte; `'rolled-back'` ⇒ the
 *  capture rows were rolled back to their savepoint, so nothing is held (`held: 0`). */
export function buildHeldBytesDigest(input: HeldBytesFactInput, maxChars: number = HELD_BYTES_DIGEST_MAX, opts: { refWrite?: 'committed' | 'rolled-back' } = {}): HeldBytesDigest {
  const { objects } = buildHeldBytesManifest(input);
  const refused: Record<string, number> = {};
  for (const r of input.refusals) refused[r.refusal] = (refused[r.refusal] ?? 0) + 1; // sparse by construction
  const rows: DigestRow[] = objects.slice(0, HELD_BYTES_DIGEST_ROWS).map((o) => {
    const truncatedFields: Array<'target' | 'path'> = [];
    let target: string | null = null;
    let path: string | null = null;
    if (o.target !== null) {
      const c = capSerialised(o.target, HELD_BYTES_FIELD_MAX);
      target = c.value;
      if (c.cut) truncatedFields.push('target');
    }
    if (o.path !== null) {
      const c = capSerialised(basename(o.path), HELD_BYTES_FIELD_MAX);
      path = c.value;
      if (c.cut) truncatedFields.push('path');
    }
    return {
      handleIndex: o.handleIndex, target, path,
      ...(o.held ? { lineCount: o.lineCount, redactedCount: o.redactedCount } : { refusal: o.refusal }),
      ...(truncatedFields.length ? { truncatedFields } : {}),
    };
  });
  const digest: HeldBytesDigest = {
    held: opts.refWrite === 'rolled-back' ? 0 : input.refs.length,
    ...(opts.refWrite ? { refWrite: opts.refWrite } : {}),
    refused,
    totals: {
      files: input.refs.length + input.refusals.length,
      storedBytes: input.storedBytes,
      redactedFiles: input.refs.filter((r) => r.redactedCount > 0).length,
    },
    lane: 'file-artifact',
    manifest: HELD_BYTES_MANIFEST_NAME,
    rows,
  };
  let omitted = 0;
  while (JSON.stringify(digest).length > maxChars && digest.rows.length > 0) {
    digest.rows.pop();
    omitted++;
    digest.rowsOmitted = omitted;
  }
  return digest;
}
