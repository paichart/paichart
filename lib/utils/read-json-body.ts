/**
 * readJsonBody — the ONE way a web API route reads a JSON request body (2026-11-03, zod alert #305 / GHSA-mrhx-c7xc-m3w5).
 *
 * Why: zod 3 creates one issue object per bad element and never stops early, and routes log/echo every issue, so a body of many
 * small values exhausted paichart-web's memory (local repro: 10 MB → 4 GB, process exit). zod 4.6.6 does not close it for
 * unbounded arrays or records. So the bound is HERE, before any parse or validation:
 *   1. bytes   — the body is read as a stream and refused once it passes `maxBytes` (a missing or lying Content-Length cannot
 *                bypass it);
 *   2. values  — the parsed JSON is refused if it holds more than `maxValues` values (the same cap and code as the MCP hub's
 *                tool-argument cap, lib/utils/json-node-cap.ts).
 * Over either ⇒ ApiError PAYLOAD_TOO_LARGE (413). Malformed JSON ⇒ SyntaxError, exactly as `request.json()` threw, so each
 * route's existing invalid-JSON handling keeps working.
 *
 * Every `request.json()` / `req.json()` on an incoming request in app/api and lib goes through this helper —
 * scripts/test-read-json-body.ts pins that no direct call remains.
 */
import { NextResponse } from 'next/server';
import { ApiError, ErrorCode } from '@/lib/errors';
import { exceedsArgumentNodeCap } from '@/lib/utils/json-node-cap';

export const JSON_BODY_MAX_BYTES = 1_048_576;   // 1 MB — the createHandler default and the MCP hub's body limit
export const JSON_BODY_MAX_VALUES = 20_000;     // the MCP hub's tool-argument cap (measured: <100 MB, <100 ms worst case)

export interface ReadJsonBodyOptions { maxBytes?: number; maxValues?: number }

function tooLarge(what: string, limit: number): ApiError {
  return new ApiError(ErrorCode.PAYLOAD_TOO_LARGE, `Request body exceeds ${limit} ${what}; send a smaller request`, { limit });
}

export async function readJsonBody<T = any>(req: Request, opts: ReadJsonBodyOptions = {}): Promise<T> {
  const maxBytes = opts.maxBytes ?? JSON_BODY_MAX_BYTES;
  const maxValues = opts.maxValues ?? JSON_BODY_MAX_VALUES;
  const declared = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge('bytes', maxBytes);

  let text = '';
  if (req.body) {
    const reader = req.body.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw tooLarge('bytes', maxBytes);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  }
  const parsed = JSON.parse(text);   // '' or malformed ⇒ SyntaxError, as request.json() did
  if (exceedsArgumentNodeCap(parsed, maxValues)) throw tooLarge('JSON values', maxValues);
  return parsed as T;
}

/**
 * PAYLOAD-413-RAW-CATCH (2026-11-04, sec-ops ZOD-305-FIX-REVIEW (3)): routes with their own catch turned readJsonBody's 413 into
 * a 500 logged at error level. Their catch now starts with `const tooLarge = payloadTooLargeResponse(err); if (tooLarge) return tooLarge;`.
 */
export function payloadTooLargeResponse(error: unknown): NextResponse | null {
  if (error instanceof ApiError && error.code === ErrorCode.PAYLOAD_TOO_LARGE) {
    return NextResponse.json({ error: { message: error.message, code: error.code } }, { status: 413 });
  }
  return null;
}
