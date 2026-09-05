/**
 * CORS Utilities
 *
 * Shared origin validation for CORS preflight (OPTIONS) handlers.
 * Mirrors the allowlist logic in middleware.ts (BC22 fix).
 *
 * Usage in route files:
 *   import { corsPreflightResponse } from '@/lib/utils/cors';
 *   export async function OPTIONS(req: NextRequest) {
 *     return corsPreflightResponse(req, 'GET, OPTIONS');
 *   }
 */

import { NextRequest } from 'next/server';

const CORS_ALLOWED_ORIGINS = new Set(
  (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim().toLowerCase())
    .filter(Boolean)
);

// BC54 FIX: Use trusted APP_BASE_URL instead of request host (Host header is spoofable)
import { PUBLIC_BASE_URL } from '../auth/public-base-url';
const TRUSTED_ORIGIN = PUBLIC_BASE_URL.toLowerCase();  // canonical origin (D4-B); same fallback as before

export function isAllowedOrigin(origin: string | null, requestUrl: URL): boolean {
  if (!origin) return false;
  const normalized = origin.toLowerCase();
  if (normalized === TRUSTED_ORIGIN) return true;
  if (CORS_ALLOWED_ORIGINS.has(normalized)) return true;
  if (process.env.NODE_ENV === 'development') {
    try {
      const originUrl = new URL(normalized);
      if (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1') return true;
    } catch { /* invalid origin */ }
  }
  return false;
}

/**
 * Standard CORS preflight response with origin validation.
 * Only returns Access-Control-Allow-Origin and Credentials for allowed origins.
 */
export function corsPreflightResponse(req: NextRequest, methods = 'GET, OPTIONS'): Response {
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };

  if (isAllowedOrigin(origin, req.nextUrl)) {
    headers['Access-Control-Allow-Origin'] = origin!;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  return new Response(null, { status: 204, headers });
}
