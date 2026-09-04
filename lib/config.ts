/**
 * Application configuration
 */
export const config = {
  env: {
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
    isTest: process.env.NODE_ENV === 'test',
  },

  app: {
    name: 'PoV Manager' as const,
    version: '1.0.0' as const,
    description: 'Project management tool for Proof of Value trials' as const,
    url: process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === 'production' ? 'https://paichart.app' : 'http://localhost:3000'),
  },

  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || 'localhost',
  },

  database: {
    url: process.env.DATABASE_URL,
  },

  jwt: {
    // BC32 FIX: Weak fallbacks only allowed in development — production must set env vars
    // JWT_ACCESS_SECRET retired 2026-06-05: api keys mint/verify RS256 (mintMcpToken).
    // JWT_REFRESH_SECRET retired 2026-08-07: it had no consumer either — it was set here,
    // asserted at boot, and read by nothing. REFRESH TOKENS ARE NOT JWTs: `RefreshToken.token`
    // is a @unique random string created by prisma.refreshToken.create() and validated by
    // LOOKUP against that row's expiresAt. No signature, no secret. The expirations below are
    // unrelated and still live.
    accessExpiration: process.env.JWT_ACCESS_EXPIRATION || '15', // minutes
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7', // days
  },

  cookie: {
    accessToken: process.env.COOKIE_ACCESS_TOKEN || 'token',
    refreshToken: process.env.COOKIE_REFRESH_TOKEN || 'refresh_token',
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: '/',
    httpOnly: true,
    // BC21 FIX: parseInt(env) || default guards NaN from misconfigured env vars
    // BC52 FIX: Next.js response.cookies.set() maxAge is in seconds, not milliseconds
    maxAge: (parseInt(process.env.JWT_ACCESS_EXPIRATION || '15', 10) || 15) * 60, // seconds
  },

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },

  security: {
    saltRounds: 10,
    rateLimitWindow: 15 * 60 * 1000, // 15 minutes
    rateLimitMax: 100,
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },

  websocket: {
    path: '/ws',
    pingInterval: 30000,
    pingTimeout: 5000,
  },

  auth: {
    passwordMinLength: 6,
    passwordMaxLength: 100,
    passwordResetTokenExpiry: 60, // 60 minutes
    verificationTokenExpiry: 24 * 60, // 24 hours
    passwordPattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/,
    passwordRequirements: [
      'At least one uppercase letter',
      'At least one lowercase letter',
      'At least one number',
      'At least one special character (@$!%*?&)',
      'Between 6 and 100 characters'
    ],
  },
} as const;

// BC32's production fail-fast guarded exactly one value — JWT_REFRESH_SECRET — and that value
// had no consumer, so the guard protected no code path. Both retired 2026-08-07 (see the note
// on the jwt block above). If a genuinely required secret appears later, reinstate the pattern
// here; it was sound, it had simply outlived its subject.

export type Config = typeof config;
