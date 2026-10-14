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
  toolCallIndex: number;
  target: string | null;
  path: string | null;
  sourceTool: string;
  held: boolean;
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
  refused: Record<string, number>;
  totals: { files: number; storedBytes: number; redactedFiles: number };
  lane: 'file-artifact';
  manifest: string;
  rows: DigestRow[];
  rowsOmitted?: number;
}

/** Every object, ordered by tool call then held-before-refused, with its handle index. */
export function buildHeldBytesManifest(input: HeldBytesFactInput): { objects: ManifestObject[] } {
  const objs: Array<Omit<ManifestObject, 'handleIndex'>> = [
    ...input.refs.map((r) => ({
      toolCallIndex: r.toolCallIndex, target: r.target, path: r.path, sourceTool: r.sourceTool, held: true,
      lineCount: r.lineCount, redactedCount: r.redactedCount,
    })),
    ...input.refusals.map((r) => ({
      toolCallIndex: r.toolCallIndex, target: r.target, path: r.path, sourceTool: r.sourceTool, held: false,
      refusal: r.refusal, ...(r.detail ? { detail: r.detail } : {}),
    })),
  ];
  objs.sort((a, b) => a.toolCallIndex - b.toolCallIndex || Number(b.held) - Number(a.held));
  return { objects: objs.map((o, handleIndex) => ({ handleIndex, ...o })) };
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
export function buildHeldBytesDigest(input: HeldBytesFactInput, maxChars: number = HELD_BYTES_DIGEST_MAX): HeldBytesDigest {
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
    held: input.refs.length,
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
