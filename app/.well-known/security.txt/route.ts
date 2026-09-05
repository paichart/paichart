import { NextResponse } from 'next/server';
import { PUBLIC_BASE_URL } from '@/lib/auth/public-base-url';

/**
 * GET /.well-known/security.txt  (RFC 9116)
 * 2026-05-27 (pentest L-2): responsible-disclosure contact. `Expires` is required
 * by the RFC — bump it (~1y out) before it lapses, else scanners flag it stale.
 */
export const dynamic = 'force-static';

export function GET() {
  const body = [
    'Contact: mailto:security@paichart.com',
    'Expires: 2027-05-27T00:00:00.000Z',
    'Preferred-Languages: en',
    `Canonical: ${PUBLIC_BASE_URL}/.well-known/security.txt`,
    '',
  ].join('\n');

  return new NextResponse(body, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
