/**
 * PLATFORM-HELD-BYTES — the canonical text function (Stage A WI-2, 2026-10-14).
 *
 * ENV-FREE BY DESIGN (panel arch N1): this module reads no environment variable and imports no Prisma and no logger, so
 * Stage C's offline operator tool can apply it unchanged with the R10 version pinned on a ref rather than whatever its
 * own environment says. The CALLER decides whether R10 runs (`{ redact }`), using R10's `isR10Disabled()`.
 *
 * What it guarantees:
 *   - The base hash is computed over B = R10_plain(C) — never over C itself while R10 is on (O2, D-d; P3-B1 dictionary
 *     oracle). The ONLY hash in this module is over B.
 *   - R10's PLAIN arm produces B (P3-B3): arm 1 re-serialises a JSON-looking leaf and would break the line map.
 *   - `escaped-secret-residual` (OA-21, widened per panel NF-1): when R10's full deep walk of the same text — what the
 *     persisted result.json leaf gets — would place MORE placeholders than B carries, the file is refused rather than held
 *     less redacted than result.json. The deep walk is used ONLY for that comparison; B and baseHash never come from it.
 *   - No Unicode normalisation, no splitting on anything but "\n", no trimming (P3 §3.2).
 *
 * Contract: cline_docs/reviews/platform-held-bytes-2026-10-13/P3-SERVICE-CONTRACT.md §3.
 * Plan: cline_docs/reviews/platform-held-bytes-2026-10-13/STAGE-A-PLAN.md WI-2.
 */
import { createHash } from 'crypto';
import {
  R10_VERSION,
  redactArtifactSecrets,
  redactSecretsDeep,
} from '../redact-artifact-secrets';

export const DECODE_VERSION = 'paichart.text/1';
export const HASH_BASIS_LEGACY = 'legacy-decoded-text';
export const REDACTOR_VERSION_NONE = 'none';

/** Both placeholder spellings in ONE non-overlapping pattern: `<REDACTED-SECRET>` is a substring of PLACEHOLDER, so two
 *  separate counts would double-count (panel BC-N3). */
const PLACEHOLDER_ANY = /<<?REDACTED-SECRET>>?/g;

export function countPlaceholders(text: string): number {
  return (text.match(PLACEHOLDER_ANY) || []).length;
}

/** Lines split on "\n" ONLY; a final "\n" does not open a new line; "" has 0 lines (P3 §3.1 step 8). */
export function countLines(text: string): number {
  if (text === '') return 0;
  const parts = text.split('\n').length;
  return text.endsWith('\n') ? parts - 1 : parts;
}

function countNewlines(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

// ── The operator decode, `paichart.text/1` (P3 §3.1). Stage A uses it only in the vector test; Stage C's operator tool
//    and any EmbeddedResource `blob` lane use it in production. ─────────────────────────────────────────────────────────

export type DecodeRefusal = 'oversize' | 'nul-byte' | 'invalid-utf8' | 'lone-cr';

export interface DecodeFacts {
  newline: 'none' | 'lf' | 'crlf' | 'mixed';
  crlfCount: number;
  bom: boolean;
  finalNewline: boolean;
  lineCount: number;
  byteLength: number;
}

export type DecodeResult =
  | { ok: true; text: string; facts: DecodeFacts }
  | { ok: false; refusal: DecodeRefusal; offset?: number };

export function decodeCanonicalBytes(raw: Uint8Array, maxBytes: number): DecodeResult {
  // 1. size
  if (raw.length > maxBytes) return { ok: false, refusal: 'oversize' };
  // 2. exactly ONE BOM
  const bom = raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf;
  const body = bom ? raw.subarray(3) : raw;
  // 3. NUL (offset counted in raw)
  const nulAt = body.indexOf(0);
  if (nulAt >= 0) return { ok: false, refusal: 'nul-byte', offset: nulAt + (bom ? 3 : 0) };
  // 4. strict UTF-8. ignoreBOM: true is mandatory — the default would let TextDecoder eat a SECOND BOM (V13).
  //    TextDecoder gives no offset, so invalid-utf8 carries none (offsets are diagnostic, P3 §3.4).
  let c0: string;
  try {
    c0 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body);
  } catch {
    return { ok: false, refusal: 'invalid-utf8' };
  }
  // 5. lone CR (char offset in C0)
  for (let i = 0; i < c0.length; i++) {
    if (c0.charCodeAt(i) === 13 && c0.charCodeAt(i + 1) !== 10) return { ok: false, refusal: 'lone-cr', offset: i };
  }
  // 6. newline facts
  const crlfCount = c0.split('\r\n').length - 1;
  const lfTotal = countNewlines(c0);
  const loneLf = lfTotal - crlfCount;
  const newline: DecodeFacts['newline'] =
    lfTotal === 0 ? 'none' : loneLf === 0 ? 'crlf' : crlfCount === 0 ? 'lf' : 'mixed';
  // 7. CRLF -> LF
  const text = c0.split('\r\n').join('\n');
  // 8. facts
  return {
    ok: true,
    text,
    facts: { newline, crlfCount, bom, finalNewline: text.endsWith('\n'), lineCount: countLines(text), byteLength: raw.length },
  };
}

// ── The legacy capture path: a string the service already decoded (Python text mode). ─────────────────────────────────

export type LegacyRefusal = 'nul-byte' | 'lone-surrogate' | 'decode-violated' | 'legacy-bom';

/**
 * The checks the platform CAN make on an already-decoded string (P3 §6.2), in precedence order. Returns the refusal
 * name, or null when the string is acceptable. Runs before any Buffer or hash is built, so a refused string never
 * reaches either (lone surrogate: Buffer.from would substitute U+FFFD silently).
 */
export function checkLegacyText(s: string): LegacyRefusal | null {
  if (s.indexOf('\u0000') >= 0) return 'nul-byte';
  if (!s.isWellFormed()) return 'lone-surrogate';
  // A canonical C never contains CR (CRLF is folded, a lone CR is refused), so any U+000D means the service's decode
  // differs from paichart.text/1 in a way the platform cannot reproduce.
  if (s.indexOf('\r') >= 0) return 'decode-violated';
  if (s.charCodeAt(0) === 0xfeff) return 'legacy-bom';
  return null;
}

// ── The canonical base ─────────────────────────────────────────────────────────────────────────────────────────────

export type CanonicalRefusal = 'line-map-broken' | 'escaped-secret-residual';

export interface CanonicalBase {
  ok: true;
  /** B — the bytes held and hashed. R10_plain(C), or C when redact is false. */
  B: string;
  baseHash: string;
  redactedCount: number;
  redactorVersion: string;
  /** Counted on B. */
  lineCount: number;
  /** Placeholders already in C before R10 ran (SO N3). */
  preexistingPlaceholders: number;
}

export type CanonicalResult = CanonicalBase | { ok: false; refusal: CanonicalRefusal };

export function canonicalBase(C: string, opts: { redact: boolean }): CanonicalResult {
  const preexistingPlaceholders = countPlaceholders(C);
  let B: string;
  let redactedCount: number;
  let redactorVersion: string;
  if (!opts.redact) {
    B = C;
    redactedCount = 0;
    redactorVersion = REDACTOR_VERSION_NONE;
  } else {
    const r = redactArtifactSecrets(C); // PLAIN arm only
    B = r.redacted;
    redactedCount = r.redactedCount;
    redactorVersion = R10_VERSION;
  }
  if (countNewlines(B) !== countNewlines(C)) return { ok: false, refusal: 'line-map-broken' };
  if (opts.redact) {
    // Parity with what result.json gets for the same leaf: run the deep walk (plain + arm 1 + arm 2) over B ITSELF and
    // refuse when it would redact anything more. Over B, not C (code review sec-ops SF-1): arm 1 is key-name blind, so
    // deep(C) can MISS a line B caught while catching one B missed, and the two counts cancel. B's placeholders survive
    // arm 1 and are never re-redacted, so deep(B) ≥ B always, and > B exactly when a token the held copy keeps would be
    // removed from result.json. The same predicate MI-13 🔴 11 runs (--check-held). Comparison only — never produces B.
    const deep = redactSecretsDeep({ l: B }).value as { l: unknown };
    const deepText = typeof deep.l === 'string' ? deep.l : B;
    if (countPlaceholders(deepText) > countPlaceholders(B)) return { ok: false, refusal: 'escaped-secret-residual' };
  }
  const baseHash = createHash('sha256').update(Buffer.from(B, 'utf8')).digest('hex');
  return { ok: true, B, baseHash, redactedCount, redactorVersion, lineCount: countLines(B), preexistingPlaceholders };
}

