import { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';

/**
 * Cookie manager for handling auth cookies
 */
export class CookieManager {
  private static readonly ACCESS_TOKEN_NAME = 'accessToken';
  private static readonly REFRESH_TOKEN_NAME = 'refreshToken';

  /**
   * Create access token cookie
   */
  static createAccessTokenCookie(token: string): ResponseCookie {
    return {
      name: this.ACCESS_TOKEN_NAME,
      value: token,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60, // 15 minutes
    };
  }

  /**
   * Create refresh token cookie
   */
  static createRefreshTokenCookie(token: string): ResponseCookie {
    return {
      name: this.REFRESH_TOKEN_NAME,
      value: token,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    };
  }

  /**
   * Create expired access token cookie
   */
  static createExpiredAccessTokenCookie(): ResponseCookie {
    return {
      name: this.ACCESS_TOKEN_NAME,
      value: '',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    };
  }

  /**
   * Create expired refresh token cookie
   */
  static createExpiredRefreshTokenCookie(): ResponseCookie {
    return {
      name: this.REFRESH_TOKEN_NAME,
      value: '',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    };
  }
}

/**
 * Create token cookies
 */
export function createTokenCookies(accessToken: string, refreshToken: string): ResponseCookie[] {
  return [
    CookieManager.createAccessTokenCookie(accessToken),
    CookieManager.createRefreshTokenCookie(refreshToken),
  ];
}

/**
 * Create expired token cookies
 */
export function createExpiredTokenCookies(): ResponseCookie[] {
  return [
    CookieManager.createExpiredAccessTokenCookie(),
    CookieManager.createExpiredRefreshTokenCookie(),
  ];
}

/**
 * Format cookie header
 */
export function formatCookieHeader(cookies: ResponseCookie[]): string {
  return cookies
    .map((cookie) => {
      const parts = [`${cookie.name}=${cookie.value}`];

      if (cookie.httpOnly) parts.push('HttpOnly');
      if (cookie.secure) parts.push('Secure');
      if (cookie.sameSite) parts.push(`SameSite=${cookie.sameSite}`);
      if (cookie.path) parts.push(`Path=${cookie.path}`);
      if (typeof cookie.maxAge === 'number') parts.push(`Max-Age=${cookie.maxAge}`);

      return parts.join('; ');
    })
    .join(', ');
}
