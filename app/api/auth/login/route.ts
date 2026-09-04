import { NextRequest, NextResponse } from 'next/server';
// Note: Don't import cookies from next/headers - causes AsyncLocalStorage error with custom server
// Use response.cookies.set() instead (which doesn't require AsyncLocalStorage)
import { prisma } from '@/lib/prisma';
import { hashRefreshToken } from '@/lib/crypto/hashing';
import bcrypt from 'bcryptjs';
import { config } from '@/lib/config';
import { signAccessToken, signRefreshToken } from '@/lib/auth/token-manager';
import { UserRole } from '@/lib/types/auth';
import { authRateLimiter, clearAuthRateLimit } from '@/middleware/rate-limiter-enhanced';
import { checkUserRateLimit, clearUserRateLimit } from '@/lib/middleware/rate-limit';
import { getClientIP } from '@/lib/utils/client-ip';
import { trackActivity } from '@/lib/auth/audit';
import { z } from 'zod';
import { authLogger } from '@/lib/logger';

// P1.2 (2026-05-24): per-email login failure window. Defeats IP-rotation
// credential stuffing — a botnet trying <maintainer-email> from 10,000
// distinct IPs gets at most 5 guesses per 15 min total, regardless of source.
// Cleared on successful login so legit users with typo'd passwords aren't
// locked out long-term.
const EMAIL_LOGIN_LIMIT = 5;
const EMAIL_LOGIN_WINDOW_MS = 15 * 60 * 1000;

// Login validation schema
const LoginSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .max(255, 'Email too long')
    .toLowerCase()
    .trim(),
  password: z.string()
    .min(1, 'Password is required')
    .max(1000, 'Password too long'), // Prevent DoS with massive passwords
});

// OPTIMIZATION: Authentication endpoint caching and rate limiting
// TIME BOMB PREVENTION (Jan 2026): Added size limits and periodic cleanup
const authCache = new Map();
const rateLimitMap = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

// TIME BOMB PREVENTION: Map size limits (Category 1: Unbounded Caches)
const MAX_AUTH_CACHE_SIZE = 1000;
const MAX_RATE_LIMIT_SIZE = 5000;

// TIME BOMB PREVENTION: Periodic cleanup (Category 2 & 5)
let cleanupStarted = false;
function startPeriodicCleanup() {
  if (cleanupStarted) return;
  cleanupStarted = true;

  const cleanupInterval = setInterval(() => {
    const now = Date.now();

    // Clean expired auth cache entries
    for (const [key, value] of authCache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        authCache.delete(key);
      }
    }

    // Clean expired rate limit entries
    for (const [key, attempts] of rateLimitMap.entries()) {
      const validAttempts = attempts.filter((ts: number) => now - ts < RATE_LIMIT_WINDOW);
      if (validAttempts.length === 0) {
        rateLimitMap.delete(key);
      } else if (validAttempts.length !== attempts.length) {
        rateLimitMap.set(key, validAttempts);
      }
    }
  }, 5 * 60 * 1000); // Every 5 minutes

  // TIME BOMB PREVENTION: .unref() prevents blocking process exit (Category 5)
  cleanupInterval.unref();
}

// Auto-start cleanup on module load
startPeriodicCleanup();

// OPTIMIZATION: Helper functions for auth optimization
function getCacheKey(email: string): string {
  return `auth:${email.toLowerCase()}`;
}

function getRateLimitKey(ip: string): string {
  return `rate:${ip}`;
}

function isRateLimited(ip: string): boolean {
  const key = getRateLimitKey(ip);
  const attempts = rateLimitMap.get(key);
  
  if (!attempts) {
    return false;
  }
  
  // Clean up expired entries
  const now = Date.now();
  const validAttempts = attempts.filter((timestamp: number) => now - timestamp < RATE_LIMIT_WINDOW);
  
  if (validAttempts.length !== attempts.length) {
    rateLimitMap.set(key, validAttempts);
  }
  
  return validAttempts.length >= MAX_ATTEMPTS;
}

function recordAttempt(ip: string): void {
  const key = getRateLimitKey(ip);

  // TIME BOMB PREVENTION: LRU eviction if at capacity (Category 1)
  if (rateLimitMap.size >= MAX_RATE_LIMIT_SIZE && !rateLimitMap.has(key)) {
    const oldestKey = rateLimitMap.keys().next().value;
    if (oldestKey) {
      rateLimitMap.delete(oldestKey);
    }
  }

  const attempts = rateLimitMap.get(key) || [];
  attempts.push(Date.now());
  rateLimitMap.set(key, attempts);
}

function getCachedUser(email: string) {
  const cacheKey = getCacheKey(email);
  const cached = authCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.user;
  }
  
  return null;
}

function setCachedUser(email: string, user: any): void {
  const cacheKey = getCacheKey(email);

  // TIME BOMB PREVENTION: LRU eviction if at capacity (Category 1)
  if (authCache.size >= MAX_AUTH_CACHE_SIZE && !authCache.has(cacheKey)) {
    const oldestKey = authCache.keys().next().value;
    if (oldestKey) {
      authCache.delete(oldestKey);
    }
  }

  authCache.set(cacheKey, {
    user,
    timestamp: Date.now()
  });
}

export async function POST(request: NextRequest) {
  authLogger.debug('login attempt started');
  try {
    // OPTIMIZATION: Enhanced rate limiting check
    const rateLimitResponse = await authRateLimiter(request);
    if (rateLimitResponse) {
      authLogger.info('login rate limited');
      return rateLimitResponse;
    }
    
    // L6 FIX (2026-06-13): use the shared CF-Connecting-IP resolver. The old
    // inline TRUSTED_PROXY-only derivation collapsed to the constant 'direct' in
    // prod (TRUSTED_PROXY unset), so the legacy isRateLimited() bucket below was
    // GLOBAL — 5 failed logins platform-wide locked login for EVERYONE (15 min).
    const clientIP = getClientIP(request);

    // OPTIMIZATION: Legacy rate limiting check (fallback)
    if (isRateLimited(clientIP)) {
      authLogger.info('login rate limited (legacy)');
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      );
    }

    // Parse and validate request body with Zod
    const data = await request.json();
    const validation = LoginSchema.safeParse(data);

    if (!validation.success) {
      authLogger.debug('login validation failed');
      recordAttempt(clientIP);
      return NextResponse.json(
        { error: 'Invalid email or password' },  // Generic error (no validation details)
        { status: 401 }
      );
    }

    const { email, password } = validation.data;
    authLogger.debug('login attempt');

    // P1.2: per-email rate limit (independent of clientIP — catches IP-rotating attackers).
    // Counts every attempt for this email; cleared after success. Failure-only counting
    // would let an attacker hide failures behind one legit success per window.
    const emailRateLimit = checkUserRateLimit(email, 'login', EMAIL_LOGIN_LIMIT, EMAIL_LOGIN_WINDOW_MS);
    if (!emailRateLimit.allowed) {
      authLogger.warn({ email, ip: clientIP }, 'login rate limited (per-email)');
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      );
    }

    // OPTIMIZATION: Check cache first
    let user = getCachedUser(email);
    
    if (!user) {
      authLogger.debug('login cache miss');
      // Find user in database
      user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          password: true,
          role: true,
          isVerified: true,
        },
      });

      // OPTIMIZATION: Cache the user data (excluding password for security)
      if (user) {
        setCachedUser(email, {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isVerified: user.isVerified,
          hasPassword: !!user.password
        });
      }
    } else {
      authLogger.debug('login cache hit');
      // For cached users, we need to get the password from database
      const userWithPassword = await prisma.user.findUnique({
        where: { email },
        select: { password: true }
      });
      user.password = userWithPassword?.password;
    }

    authLogger.debug('user lookup complete');

    // TIMING-SAFE: Always run bcrypt.compare even if user doesn't exist (prevent timing attacks)
    const dummyHash = '$2a$10$abcdefghijklmnopqrstuv.wxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const passwordToCheck = user?.password || dummyHash;
    const isValidPassword = await bcrypt.compare(password, passwordToCheck);

    // COMBINED CHECK: Single generic error for all authentication failures (prevents user enumeration)
    if (!user || !user.isVerified || !user.password || !isValidPassword) {
      // 2026-05-18: promoted from info → warn. The daily security-enhanced-check.sh
      // greps for WARN/ERROR severity to count auth failures; logging at info hid
      // failed-login attempts from the anomaly scorer. Payload includes email + ip
      // so per-user / per-IP threshold detection can correlate without touching
      // the response shape.
      authLogger.warn({ email, ip: clientIP }, 'login failed');
      recordAttempt(clientIP);
      // P2.2: DB audit row only when the email matches an existing user.
      // Failed attempts against non-existent emails (enumeration probes)
      // live in pino only — not load-bearing for SOC 2 "who accessed my
      // account" customer-evidence queries.
      if (user?.id) {
        void trackActivity(user.id, 'AUTHENTICATION', 'LOGIN_FAILED', {
          email,
          ip: clientIP,
          userAgent: request.headers.get('user-agent') ?? undefined,
          reason: 'invalid_credentials',
          source: 'web_ui',
        });
      }
      return NextResponse.json(
        { error: 'Invalid email or password' },  // Generic error message
        { status: 401 }
      );
    }

    // 2026-05-27: enforce UserStatus — credentials are valid, but INACTIVE/SUSPENDED
    // accounts cannot log in. Fresh DB read (the login cache above may be stale on a
    // just-disabled account). Generic 401 to avoid revealing the account state.
    const freshStatus = await prisma.user.findUnique({ where: { id: user.id }, select: { status: true } });
    if (freshStatus?.status !== 'ACTIVE') {
      authLogger.warn({ userId: user.id, email, ip: clientIP, status: freshStatus?.status }, 'login blocked — account not ACTIVE');
      void trackActivity(user.id, 'AUTHENTICATION', 'LOGIN_FAILED', {
        email, ip: clientIP, reason: 'account_not_active', source: 'web_ui',
      });
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    authLogger.info({ userId: user.id }, 'login successful');
    // P2.2: SOC 2 CC6.1 evidence — fire-and-forget per
    // .claude/knowledge/patterns/fire-and-forget-activity-logging-pattern.md
    void trackActivity(user.id, 'AUTHENTICATION', 'LOGIN_SUCCESS', {
      ip: clientIP,
      userAgent: request.headers.get('user-agent') ?? undefined,
      source: 'web_ui',
    });

    // Generate tokens
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role as UserRole,
    };
    const accessToken = await signAccessToken(tokenPayload);
    const refreshToken = await signRefreshToken(tokenPayload);

    // BC52 FIX: Enforce session limit — max 10 active refresh tokens per user
    // Delete oldest tokens if over limit before creating new one
    const MAX_SESSIONS = 10;
    // W11/CR-3: scope to web rows only (provider != 'mcp'). MCP refresh tokens now share
    // this table; without this filter a web login would count/evict a user's 7-day MCP
    // token (often the oldest row) → silent forced MCP re-auth.
    const existingTokens = await prisma.refreshToken.findMany({
      where: { userId: user.id, provider: { not: 'mcp' } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (existingTokens.length >= MAX_SESSIONS) {
      const tokensToDelete = existingTokens.slice(MAX_SESSIONS - 1).map(t => t.id);
      await prisma.refreshToken.deleteMany({
        where: { id: { in: tokensToDelete } },
      });
    }

    // Store refresh token (hashed at rest — the raw signed JWT is never persisted)
    await prisma.refreshToken.create({
      data: {
        token: hashRefreshToken(refreshToken),
        userId: user.id,
        expiresAt: new Date(
          Date.now() +
            (parseInt(config.jwt.refreshExpiration, 10) || 7) * 24 * 60 * 60 * 1000
        ),
      },
    });

    // Create response with user data + token expiration for pre-emptive refresh
    const accessExpirationMin = parseInt(config.jwt.accessExpiration, 10) || 15;
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      tokenExpiresAt: Math.floor(Date.now() / 1000) + accessExpirationMin * 60, // BC56: seconds since epoch
    });

    // Set cookies on response
    response.cookies.set(config.cookie.accessToken, accessToken, {     
      httpOnly: true,
      secure: config.cookie.secure, // Use dynamic secure setting from config
      sameSite: 'lax',
      path: '/',
      maxAge: (parseInt(config.jwt.accessExpiration, 10) || 15) * 60, // BC52 FIX: Next.js maxAge is in seconds, not milliseconds
    });

    response.cookies.set(config.cookie.refreshToken, refreshToken, {
      httpOnly: true,
      secure: config.cookie.secure, // Use dynamic secure setting from config
      sameSite: 'lax',
      path: '/',
      maxAge: (parseInt(config.jwt.refreshExpiration, 10) || 7) * 24 * 60 * 60, // BC52 FIX: Next.js maxAge is in seconds, not milliseconds
    });

    // Clear rate limits on successful login (both IP-keyed and email-keyed)
    clearAuthRateLimit(clientIP);
    clearUserRateLimit(email, 'login');

    return response;
  } catch (error) {
    authLogger.error({ err: error }, 'login error');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
