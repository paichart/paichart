/**
 * OAuth 2.0 Service for Enterprise Authentication
 * Handles OAuth flows with Microsoft, Google, and GitHub
 * Part of Plan 9: Anthropic Directory Policy compliance
 */

import {
  OAuthProvider,
  OAuthState,
  getOAuthProvider,
  generateOAuthState,
  validateOAuthState,
  ENTERPRISE_ROLE_MAPPING,
  OAuthConfig
} from './oauth-config';
import { prisma } from '../../prisma';
import {
  UserRole,
  OAuthUserInfo,
  OAuthTokens,
  AuthContext
} from '../../types/auth';
import { UserRole as PrismaUserRole, UserStatus as PrismaUserStatus } from '@prisma/client';
import { defaultUserRole, registrationAllowed } from '../registration-policy';
import { PUBLIC_BASE_URL } from '../public-base-url';
import sanitizeHtml from 'sanitize-html';
import { authLogger } from '@/lib/logger';
import { oauthLogger } from './oauth-logger';
import { resolveGitHubEmail } from './github-email';

export interface AuthResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  };
  error?: string;
}

export class EnterpriseOAuthService {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = PUBLIC_BASE_URL;  // canonical origin (D4-B)
  }

  /**
   * Initiate OAuth 2.0 authorization flow
   */
  async initiateOAuthFlow(
    provider: string,
    returnTo?: string
  ): Promise<string> {
    const oauthConfig = getOAuthProvider(provider as keyof OAuthConfig);
    if (!oauthConfig) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    // Generate state parameter for CSRF protection
    // With dedicated OAuth apps, we only handle web app states
    const stateData = {
      provider,
      returnTo,
      timestamp: Date.now(),
      nonce: require('crypto').randomBytes(16).toString('hex')
    };
    const state = Buffer.from(JSON.stringify(stateData)).toString('base64url');
    authLogger.debug({ provider }, 'Generated OAuth state for CSRF protection');
    
    // Generate PKCE code challenge (recommended for security)
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    
    // Store PKCE verifier securely (in production, use Redis or database)
    await this.storePKCEVerifier(state, codeVerifier);
    
    // Build authorization URL
    const authUrl = new URL(oauthConfig.endpoints.authorize);
    authUrl.searchParams.set('client_id', oauthConfig.clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', oauthConfig.redirectUri);
    authUrl.searchParams.set('scope', oauthConfig.scopes.join(' '));
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    
    // Provider-specific parameters
    if (provider === 'microsoft') {
      authUrl.searchParams.set('response_mode', 'query');
      authUrl.searchParams.set('prompt', 'select_account');
    }
    
    authLogger.info({ provider }, 'Initiated OAuth flow');
    return authUrl.toString();
  }

  /**
   * Handle OAuth callback and complete authentication
   */
  async handleOAuthCallback(provider: string, code: string, state: string): Promise<AuthResult> {
    try {
      const oauthConfig = getOAuthProvider(provider as keyof OAuthConfig);
      if (!oauthConfig) {
        return { success: false, error: `Unsupported OAuth provider: ${provider}` };
      }

      // Validate state parameter (skip validation for Gemini states)
      const stateData = validateOAuthState(state);
      if (!stateData) {
        // Could be a Gemini state (raw string), which is valid
        authLogger.debug({ provider }, 'State validation returned null, likely Gemini state');
      } else if (stateData.provider !== provider) {
        return { success: false, error: 'Invalid OAuth state - provider mismatch' };
      }

      // Retrieve PKCE code verifier
      const codeVerifier = await this.retrievePKCEVerifier(state);
      if (!codeVerifier) {
        return { success: false, error: 'PKCE code verifier not found' };
      }

      // Exchange authorization code for tokens
      const tokens = await this.exchangeCodeForTokens(oauthConfig, code, codeVerifier);
      
      // Get user information from OAuth provider
      const userInfo = await this.getUserInfo(oauthConfig, tokens.accessToken);
      
      // Create or update user account
      const user = await this.createOrUpdateUser(userInfo, tokens);

      authLogger.info({ provider, userId: user.id }, 'OAuth authentication successful');

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as UserRole
        }
      };

    } catch (error) {
      authLogger.error({ err: error, provider }, 'OAuth callback failed');
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) || 'OAuth authentication failed' 
      };
    }
  }

  /**
   * Exchange authorization code for access tokens
   */
  private async exchangeCodeForTokens(config: OAuthProvider, code: string, codeVerifier: string): Promise<OAuthTokens> {
    const tokenData = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: code,
      redirect_uri: config.redirectUri,
      code_verifier: codeVerifier
    });

    const response = await fetch(config.endpoints.token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: tokenData.toString(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Token exchange failed: ${response.status} ${errorData}`);
    }

    const tokens = await response.json();

    // BC46 FIX: Validate OAuth provider response fields before use
    const accessToken = typeof tokens.access_token === 'string' ? tokens.access_token : '';
    if (!accessToken) {
      throw new Error('OAuth provider returned empty access_token');
    }

    // Calculate expiry time - GitHub doesn't always provide expires_in
    // Default to 1 year for GitHub tokens if not specified, clamp to 1min–1year
    const rawExpires = typeof tokens.expires_in === 'number' ? tokens.expires_in : 0;
    const expiresInSeconds = rawExpires > 0 ? Math.min(rawExpires, 365 * 24 * 60 * 60) : (365 * 24 * 60 * 60);

    return {
      accessToken,
      refreshToken: typeof tokens.refresh_token === 'string' ? tokens.refresh_token : undefined,
      expiresAt: new Date(Date.now() + (expiresInSeconds * 1000)),
      tokenType: typeof tokens.token_type === 'string' ? tokens.token_type : 'Bearer',
      scope: typeof tokens.scope === 'string' ? tokens.scope : config.scopes.join(' ')
    };
  }

  /**
   * Get user information from OAuth provider
   */
  private async getUserInfo(config: OAuthProvider, accessToken: string): Promise<OAuthUserInfo> {
    const response = await fetch(config.endpoints.userInfo, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      await response.body?.cancel(); // BC20 FIX
      throw new Error(`Failed to get user info: ${response.status}`);
    }

    const userData = await response.json();

    // GitHub private-email resolution: GET /user returns email:null for private
    // emails regardless of scope; fetch the primary verified address via
    // /user/emails (user:email scope). If still unresolved, normalizeUserData
    // throws GITHUB_NO_VERIFIED_EMAIL below. See lib/auth/oauth/github-email.ts.
    if (this.getProviderName(config) === 'github' && !userData.email) {
      const resolved = await resolveGitHubEmail(accessToken, userData.email);
      if (resolved) userData.email = resolved.email;
    }

    // Normalize user data across providers
    return this.normalizeUserData(userData, config);
  }

  /**
   * Normalize user data from different OAuth providers
   */
  private normalizeUserData(userData: any, config: OAuthProvider): OAuthUserInfo {
    const provider = this.getProviderName(config);

    // BC46 FIX: Validate required fields from OAuth provider responses
    const requireString = (val: unknown, field: string): string => {
      if (typeof val === 'string' && val.length > 0) return val;
      if (typeof val === 'number') return String(val);
      throw new Error(`OAuth ${provider}: missing or invalid ${field}`);
    };

    switch (provider) {
      case 'microsoft': {
        const id = requireString(userData.id, 'id');
        const rawEmail = typeof userData.mail === 'string' ? userData.mail
          : typeof userData.userPrincipalName === 'string' ? userData.userPrincipalName
          : null;
        if (!rawEmail) throw new Error('OAuth microsoft: missing email (mail and userPrincipalName both empty)');
        const email = rawEmail.toLowerCase(); // BC49 FIX: normalize email to lowercase
        return {
          id,
          email,
          name: typeof userData.displayName === 'string' ? userData.displayName : email,
          provider: 'microsoft',
          providerUserId: id,
          avatarUrl: typeof userData.photo === 'string' ? userData.photo : undefined,
          organizationDomain: typeof userData.userPrincipalName === 'string' ? userData.userPrincipalName.split('@')[1] : undefined,
          roles: Array.isArray(userData.roles) ? userData.roles : []
        };
      }

      case 'google': {
        const id = requireString(userData.id, 'id');
        const rawGoogleEmail = typeof userData.email === 'string' ? userData.email : null;
        if (!rawGoogleEmail) throw new Error('OAuth google: missing email');
        const email = rawGoogleEmail.toLowerCase(); // BC49 FIX: normalize email to lowercase
        return {
          id,
          email,
          name: typeof userData.name === 'string' ? userData.name : email,
          provider: 'google',
          providerUserId: id,
          avatarUrl: typeof userData.picture === 'string' ? userData.picture : undefined,
          organizationDomain: typeof userData.hd === 'string' ? userData.hd : undefined,
          roles: []
        };
      }

      case 'github':
        // Private-email users are resolved upstream in getUserInfo via /user/emails.
        // Reject ONLY if no verified email could be obtained at all (no public
        // email AND /user/emails returned nothing usable / scope missing).
        if (!userData.email) {
          throw new Error('GITHUB_NO_VERIFIED_EMAIL: We could not retrieve a verified email from your GitHub account. Please add and verify an email address in GitHub settings, then sign in again.');
        }

        return {
          id: requireString(userData.id, 'id'),
          email: String(userData.email).toLowerCase(), // BC49 FIX: normalize email to lowercase
          name: typeof userData.name === 'string' ? userData.name : (typeof userData.login === 'string' ? userData.login : 'Unknown'),
          provider: 'github',
          providerUserId: String(userData.id),
          avatarUrl: typeof userData.avatar_url === 'string' ? userData.avatar_url : undefined,
          roles: []
        };

      default:
        throw new Error(`Unknown OAuth provider for normalization: ${provider}`);
    }
  }

  /**
   * Create or update user account from OAuth data
   */
  private async createOrUpdateUser(userInfo: OAuthUserInfo, tokens: OAuthTokens) {
    // Wave 2 (2026-06-21): match returning users by the IMMUTABLE
    // (oauthProvider, oauthProviderId), not email. Email is recyclable (GitHub
    // username reuse) and provider-asserted, so email-keyed matching is an
    // account-takeover vector. Mirrors the already-hardened MCP path
    // (mcp-oauth-validator.js "Provider ID is canonical and immutable").
    // Email is used ONLY as a fallback to LINK the same human across providers
    // (GitHub/Claude <-> Microsoft/ChatGPT) — accepted email-link risk, one
    // account per person by design.
    let existingUser = await prisma.user.findFirst({
      where: { oauthProvider: userInfo.provider, oauthProviderId: userInfo.providerUserId }
    });
    let crossProviderLink = false;
    if (!existingUser && userInfo.email) {
      existingUser = await prisma.user.findUnique({ where: { email: userInfo.email } });
      if (existingUser) crossProviderLink = true;
    }

    // Phantom-user guard (#4, 2026-06-21 — parity with the MCP path's FIX 2).
    // A stale Prisma connection cache can return a deleted user from the lookup
    // above; updating that phantom id would resurrect a ghost row. Verify by id
    // on a fresh read; if absent, treat as not-found and fall through to create.
    if (existingUser) {
      const verifyUser = await prisma.user.findUnique({ where: { id: existingUser.id } });
      if (!verifyUser) {
        authLogger.error({ phantomUserId: existingUser.id, provider: userInfo.provider }, 'Phantom user from stale cache — forcing create (web path)');
        existingUser = null;
        crossProviderLink = false;
      }
    }

    // PROVIDER-SPECIFIC REFRESH TOKEN EXPIRY
    let refreshExpiresAt: Date;
    switch (userInfo.provider.toLowerCase()) {
      case 'github':
        refreshExpiresAt = new Date(Date.now() + (6 * 30 * 24 * 60 * 60 * 1000)); // 6 months
        break;
      case 'google':
        refreshExpiresAt = new Date(Date.now() + (6 * 30 * 24 * 60 * 60 * 1000)); // 6 months
        break;
      case 'microsoft':
        refreshExpiresAt = new Date(Date.now() + (90 * 24 * 60 * 60 * 1000)); // 90 days
        break;
      default:
        refreshExpiresAt = new Date(Date.now() + (90 * 24 * 60 * 60 * 1000)); // 90 days default
    }

    const expiresAt = tokens.expiresAt;

    let user;

    if (existingUser) {
      // Update existing user with OAuth information
      user = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: userInfo.name,
          oauthProvider: userInfo.provider,
          oauthProviderId: userInfo.providerUserId,
          avatarUrl: userInfo.avatarUrl,
          organizationDomain: userInfo.organizationDomain,
          isVerified: true, // OAuth providers verify email ownership
          verifiedAt: existingUser.verifiedAt || new Date(), // Preserve original verification date if exists
          lastLoginAt: new Date(),
          updatedAt: new Date()
        }
      });

      // Forensic trail (sec-ops Wave 2 review): every cross-provider link is a
      // potential takeover signature — log it loudly with both provider linkages.
      if (crossProviderLink) {
        authLogger.warn({
          userId: existingUser.id,
          previousProvider: existingUser.oauthProvider,
          newProvider: userInfo.provider,
          providerUserId: userInfo.providerUserId,
        }, 'Cross-provider account link (matched by email, not provider id)');
      }
      authLogger.info({ userId: existingUser.id, provider: userInfo.provider, matchedBy: crossProviderLink ? 'email-link' : 'provider-id' }, 'Updated existing OAuth user');
    } else {
      // Create new user from OAuth data
      // Role mapping available in mapOAuthRoleToUserRole() but currently using DEFAULT_USER_ROLE for all new OAuth users
      // const role = this.mapOAuthRoleToUserRole(userInfo); // Future: Enable role mapping from OAuth providers
      if (!registrationAllowed()) {
        throw new Error('REGISTRATION_DISABLED: this server does not accept new accounts; ask an administrator to create one');
      }

      user = await prisma.user.create({
        data: {
          email: userInfo.email,
          name: userInfo.name,
          role: defaultUserRole() as PrismaUserRole, // DEFAULT_USER_ROLE (unset → DEMO_USER: owned + team + demo access)
          oauthProvider: userInfo.provider,
          oauthProviderId: userInfo.providerUserId,
          avatarUrl: userInfo.avatarUrl,
          organizationDomain: userInfo.organizationDomain,
          status: PrismaUserStatus.ACTIVE,
          isVerified: true, // OAuth providers verify emails
          lastLoginAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      authLogger.info({ userId: user.id, provider: userInfo.provider, role: user.role }, 'Created new OAuth user');
    }

    // Store tokens in-memory (with user ID as key)
    const storageKey = `oauth_${user.id}`;
    EnterpriseOAuthService.tokenStorage.set(storageKey, {
      userId: user.id,
      provider: userInfo.provider,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || '',
      expiresAt,
      refreshExpiresAt,
      lastRefreshed: new Date(),
      refreshAttempts: 0
    });

    // Cleanup expired tokens periodically
    this.cleanupExpiredTokens();

    authLogger.debug({ userId: user.id, expiresAt: expiresAt.toISOString() }, 'OAuth tokens stored in memory');

    return user;
  }

  /**
   * Map OAuth roles to pAIchart user roles
   */
  private mapOAuthRoleToUserRole(userInfo: OAuthUserInfo): UserRole {
    // Fallback role mapping if ENTERPRISE_ROLE_MAPPING is not available
    const fallbackMapping = {
      github: {
        'admin': UserRole.ADMIN,
        'member': UserRole.USER
      },
      microsoft: {
        'Global Administrator': UserRole.SUPER_ADMIN,
        'Application Administrator': UserRole.ADMIN,
        'User Administrator': UserRole.ADMIN,
        'User': UserRole.USER
      },
      google: {
        'admin': UserRole.ADMIN,
        'user': UserRole.USER
      }
    };

    const roleMapping = (typeof ENTERPRISE_ROLE_MAPPING !== 'undefined' ? ENTERPRISE_ROLE_MAPPING : fallbackMapping)[userInfo.provider as keyof typeof fallbackMapping];

    if (roleMapping && userInfo.roles) {
      for (const oauthRole of userInfo.roles) {
        const mappedRole = roleMapping[oauthRole as keyof typeof roleMapping];
        if (mappedRole) {
          return mappedRole;
        }
      }
    }

    // Default to USER role for OAuth users
    return UserRole.USER;
  }

  /**
   * Generate PKCE code verifier
   */
  private generateCodeVerifier(): string {
    return require('crypto').randomBytes(32).toString('base64url');
  }

  /**
   * Generate PKCE code challenge from verifier
   */
  private async generateCodeChallenge(verifier: string): Promise<string> {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(verifier).digest();
    return hash.toString('base64url');
  }

  // In-memory storage for PKCE verifiers (temporary until Redis/DB implementation)
  private static pkceStorage = new Map<string, { verifier: string; expires: number }>();

  // In-memory storage for OAuth tokens (v2.2 implementation)
  private static tokenStorage = new Map<string, {
    userId: string;
    provider: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    refreshExpiresAt: Date;
    lastRefreshed: Date;
    refreshAttempts: number;
  }>();

  // In-memory lock for concurrent refresh protection (Promise-based)
  private static refreshLocks = new Map<string, Promise<OAuthTokens | null>>();

  // Circuit breaker for provider failures (SECURITY FIX #2)
  private providerCircuitBreakers = new Map<string, {
    failures: number;
    lastFailure: number;
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  }>();

  /**
   * Store PKCE verifier securely (in production, use Redis or database)
   */
  private async storePKCEVerifier(state: string, verifier: string): Promise<void> {
    const key = `pkce_${state}`;
    const expires = Date.now() + (15 * 60 * 1000); // 15 minutes

    // Store in memory map
    EnterpriseOAuthService.pkceStorage.set(key, { verifier, expires });

    // Cleanup expired entries periodically
    setTimeout(() => {
      const now = Date.now();
      for (const [k, v] of EnterpriseOAuthService.pkceStorage.entries()) {
        if (v.expires < now) {
          EnterpriseOAuthService.pkceStorage.delete(k);
        }
      }
    }, 15 * 60 * 1000);

    // In production implementation:
    // await redis.setex(key, 900, verifier); // 15 minutes
  }

  /**
   * Retrieve PKCE verifier
   */
  private async retrievePKCEVerifier(state: string): Promise<string | null> {
    const key = `pkce_${state}`;
    const stored = EnterpriseOAuthService.pkceStorage.get(key);

    // Check if exists and not expired
    if (!stored || Date.now() > stored.expires) {
      EnterpriseOAuthService.pkceStorage.delete(key);
      return null;
    }

    // One-time use: delete after retrieval
    const verifier = stored.verifier;
    EnterpriseOAuthService.pkceStorage.delete(key);

    return verifier;

    // In production implementation:
    // const verifier = await redis.get(key);
    // if (verifier) await redis.del(key); // One-time use
    // return verifier;
  }

  /**
   * Get provider name from config
   */
  private getProviderName(config: OAuthProvider): string {
    if (config.endpoints.authorize.includes('microsoftonline.com')) return 'microsoft';
    if (config.endpoints.authorize.includes('accounts.google.com')) return 'google';
    if (config.endpoints.authorize.includes('github.com')) return 'github';
    return 'unknown';
  }

  /**
   * Sanitize external input to prevent log injection attacks
   * SECURITY FIX #1 (ENHANCED): Uses battle-tested library to prevent Unicode bypass
   *
   * Critical Security Note:
   * Regex-based sanitization (.replace(/[<>"'`]/g, '')) is vulnerable to Unicode bypass.
   * Example: "\u003Cscript\u003E" bypasses regex but becomes "<script>" after parsing.
   * This library-based approach prevents ALL bypass techniques.
   */
  private sanitizeInput(input: string, maxLength: number = 1000): string {
    if (!input) return '';

    const sanitized = sanitizeHtml(input, {
      allowedTags: [],        // Strip all HTML tags
      allowedAttributes: {},  // No attributes allowed
      textFilter: (text) => text.substring(0, maxLength) // Truncate
    });

    return sanitized.trim() + (input.length > maxLength ? '...' : '');
  }

  /**
   * Circuit breaker: Prevent cascade failures from bad providers
   * SECURITY FIX #2: Stops retry attempts after 5 failures in 5 minutes
   */
  private async checkCircuitBreaker(provider: string): Promise<boolean> {
    const breaker = this.providerCircuitBreakers.get(provider) || {
      failures: 0,
      lastFailure: 0,
      state: 'CLOSED' as const
    };

    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    // Reset failures if outside 5-minute window
    if (now - breaker.lastFailure > fiveMinutes) {
      breaker.failures = 0;
      breaker.state = 'CLOSED';
    }

    // Open circuit after 5 failures
    if (breaker.failures >= 5 && breaker.state === 'CLOSED') {
      breaker.state = 'OPEN';
      authLogger.error({ provider, failures: breaker.failures }, 'Circuit breaker OPEN');
    }

    // Test recovery after 5 minutes of cooling down
    if (breaker.state === 'OPEN' && now - breaker.lastFailure > fiveMinutes) {
      breaker.state = 'HALF_OPEN';
      authLogger.info({ provider }, 'Circuit breaker HALF_OPEN, testing recovery');
    }

    this.providerCircuitBreakers.set(provider, breaker);

    // Block refresh if circuit is OPEN
    return breaker.state !== 'OPEN';
  }

  /**
   * Update circuit breaker on failure
   */
  private recordProviderFailure(provider: string): void {
    const breaker = this.providerCircuitBreakers.get(provider) || {
      failures: 0,
      lastFailure: 0,
      state: 'CLOSED' as const
    };

    breaker.failures++;
    breaker.lastFailure = Date.now();

    this.providerCircuitBreakers.set(provider, breaker);
  }

  /**
   * Reset circuit breaker on success
   */
  private resetCircuitBreaker(provider: string): void {
    this.providerCircuitBreakers.set(provider, {
      failures: 0,
      lastFailure: 0,
      state: 'CLOSED'
    });
  }

  /**
   * Cleanup expired tokens from in-memory storage
   */
  private cleanupExpiredTokens(): void {
    const now = Date.now();
    for (const [key, tokenData] of EnterpriseOAuthService.tokenStorage.entries()) {
      // Remove if refresh token expired
      if (tokenData.refreshExpiresAt.getTime() < now) {
        EnterpriseOAuthService.tokenStorage.delete(key);
        authLogger.debug({ userId: tokenData.userId }, 'Cleaned up expired OAuth token');
      }
    }
  }

  /**
   * Clear all in-memory OAuth tokens for a user (called on logout)
   */
  static clearUserTokens(userId: string): boolean {
    const storageKey = `oauth_${userId}`;
    const existed = EnterpriseOAuthService.tokenStorage.has(storageKey);
    if (existed) {
      EnterpriseOAuthService.tokenStorage.delete(storageKey);
      authLogger.info({ userId }, 'OAuth provider tokens cleared on logout');
    }
    return existed;
  }

  /**
   * Refresh OAuth 2.0 access token with in-memory locking + security fixes
   * v2.2 implementation: Accepts userId and looks up token from in-memory Map
   */
  async refreshOAuthToken(
    userId: string,
    provider?: string
  ): Promise<OAuthTokens | null> {
    const startTime = Date.now();
    const requestId = `refresh-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Get token data from in-memory storage
    const storageKey = `oauth_${userId}`;
    const tokenData = EnterpriseOAuthService.tokenStorage.get(storageKey);

    if (!tokenData) {
      authLogger.warn({ userId, requestId }, 'No OAuth token found for user');
      return null;
    }

    const actualProvider = provider || tokenData.provider;

    // SECURITY FIX #2: Check circuit breaker
    if (!await this.checkCircuitBreaker(actualProvider)) {
      authLogger.warn({ requestId, provider: actualProvider }, 'Refresh blocked by circuit breaker');
      return null;
    }

    // IN-MEMORY LOCKING: Check if refresh already in progress
    const lockKey = storageKey;
    const existingRefresh = EnterpriseOAuthService.refreshLocks.get(lockKey);
    if (existingRefresh) {
      authLogger.debug({ requestId, userId }, 'Refresh already in progress, waiting');
      return existingRefresh; // Return same promise
    }

    // Check if token was recently refreshed (debounce)
    const timeSinceRefresh = Date.now() - tokenData.lastRefreshed.getTime();
    if (timeSinceRefresh < 60000) {
      authLogger.debug({ userId, secsSinceRefresh: Math.round(timeSinceRefresh / 1000) }, 'Token recently refreshed, skipping');
      return null;
    }

    // Check failure threshold
    if (tokenData.refreshAttempts >= 3) {
      authLogger.error({ userId, attempts: tokenData.refreshAttempts }, 'Exceeded refresh attempts');
      return null;
    }

    // Create refresh promise and store as lock
    const refreshPromise = this.performTokenRefresh(userId, tokenData, requestId, startTime);
    EnterpriseOAuthService.refreshLocks.set(lockKey, refreshPromise);

    // Clear lock after completion
    refreshPromise.finally(() => {
      EnterpriseOAuthService.refreshLocks.delete(lockKey);
    });

    return refreshPromise;
  }

  /**
   * Perform the actual token refresh (called within lock)
   */
  private async performTokenRefresh(
    userId: string,
    tokenData: any,
    requestId: string,
    startTime: number
  ): Promise<OAuthTokens | null> {
    try {
      const config = getOAuthProvider(tokenData.provider as keyof OAuthConfig);
      if (!config) {
        throw new Error(`Unknown OAuth provider: ${tokenData.provider}`);
      }

      authLogger.info({ requestId, provider: tokenData.provider, userId }, 'Refreshing OAuth token');

      // Call provider refresh API
      const tokenRequestData = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: tokenData.refreshToken
      });

      const response = await fetch(config.endpoints.token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: tokenRequestData.toString(),
        signal: AbortSignal.timeout(15_000),
      });

      const executionTimeMs = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        const sanitizedError = this.sanitizeInput(errorText);

        authLogger.error({ requestId, statusCode: response.status, provider: tokenData.provider }, 'OAuth token refresh failed');

        // SECURITY FIX #2: Record failure for circuit breaker
        this.recordProviderFailure(tokenData.provider);

        // Update failure counter in-memory
        tokenData.refreshAttempts++;

        // Log failure
        oauthLogger.log({
          userId,
          provider: tokenData.provider,
          action: 'refresh_failed',
          success: false,
          errorMessage: sanitizedError,
          requestId,
          executionTimeMs
        });

        return null;
      }

      // BC46 FIX: Validate OAuth provider refresh response fields before use
      const tokens = await response.json();
      const accessToken = typeof tokens.access_token === 'string' ? tokens.access_token : '';
      if (!accessToken) {
        throw new Error('OAuth provider returned empty access_token on refresh');
      }
      const tokenRotated = !!tokens.refresh_token;
      const newRefreshToken = (typeof tokens.refresh_token === 'string' ? tokens.refresh_token : '') || tokenData.refreshToken;

      // Clamp expires_in: default to 1hr if missing/invalid, cap at 1 year
      const rawExpires = typeof tokens.expires_in === 'number' ? tokens.expires_in : 0;
      const expiresInSeconds = rawExpires > 0 ? Math.min(rawExpires, 365 * 24 * 60 * 60) : 3600;

      const newTokens: OAuthTokens = {
        accessToken,
        refreshToken: newRefreshToken,
        expiresAt: new Date(Date.now() + (expiresInSeconds * 1000)),
        tokenType: typeof tokens.token_type === 'string' ? tokens.token_type : 'Bearer',
        scope: typeof tokens.scope === 'string' ? tokens.scope : config.scopes.join(' ')
      };

      // Update tokens in-memory storage
      const storageKey = `oauth_${userId}`;
      EnterpriseOAuthService.tokenStorage.set(storageKey, {
        ...tokenData,
        accessToken: newTokens.accessToken,
        refreshToken: newRefreshToken,
        expiresAt: newTokens.expiresAt,
        lastRefreshed: new Date(),
        refreshAttempts: 0
      });

      // SECURITY FIX #2: Reset circuit breaker on success
      this.resetCircuitBreaker(tokenData.provider);

      // Log success
      oauthLogger.log({
        userId,
        provider: tokenData.provider,
        action: 'token_refreshed',
        success: true,
        requestId,
        executionTimeMs,
        tokenRotated
      });

      authLogger.info({ requestId, provider: tokenData.provider, executionTimeMs, tokenRotated }, 'OAuth token refreshed successfully');
      return newTokens;

    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const sanitizedError = this.sanitizeInput(errorMessage);

      authLogger.error({ err: error, requestId, provider: tokenData.provider }, 'Token refresh error');

      // SECURITY FIX #2: Record failure for circuit breaker
      this.recordProviderFailure(tokenData.provider);

      // Update failure counter in-memory
      tokenData.refreshAttempts++;

      // Log failure
      oauthLogger.log({
        userId,
        provider: tokenData.provider,
        action: 'refresh_failed',
        success: false,
        errorMessage: sanitizedError,
        requestId,
        executionTimeMs
      });

      return null;
    }
  }

  /**
   * Revoke OAuth 2.0 tokens
   */
  async revokeOAuthToken(provider: string, token: string): Promise<boolean> {
    try {
      const config = getOAuthProvider(provider as keyof OAuthConfig);
      if (!config?.endpoints.revoke) {
        authLogger.warn({ provider }, 'Provider does not support token revocation');
        return true; // Consider it successful if not supported
      }

      const response = await fetch(config.endpoints.revoke, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          token: token,
          client_id: config.clientId,
          client_secret: config.clientSecret
        }).toString(),
        signal: AbortSignal.timeout(10_000),
      });

      // BC20 FIX: always consume body to release TCP connection
      await response.body?.cancel();
      const success = response.ok;
      authLogger.info({ provider, success }, 'Token revocation completed');
      return success;

    } catch (error) {
      authLogger.error({ err: error, provider }, 'Token revocation error');
      return false;
    }
  }

  // validateOAuthToken + parseOAuthToken + isTokenExpired dropped in Finding #2
  // (2026-05-20, commit pending). Triple-method chain was a hardcoded placeholder
  // (`userId: 'oauth-user-123'` for any `oauth2_*` Bearer token, NO signature
  // verification — Bug Class 77 pattern). Only caller was lib/auth/enhanced-auth-
  // middleware.ts which itself had ZERO importers in app/, middleware.ts, or
  // mcp-server-*.js. Dead chain confirmed by Phase 3.10c audit; deletion follows
  // the Phase 3.0a pattern. Production OAuth validation flows through:
  //   - lib/auth/oauth/mcp-oauth-validator.js for provider-specific verification
  //   - lib/auth/token-manager.ts:verifyAccessToken for first-party RS256 JWTs
  //   - mcp-server-http-clean.js inline verifier + AuthManager.verifyMcpToken
  // None of those code paths touched the deleted methods.

  /**
   * Get OAuth provider status for admin interface
   */
  async getOAuthProviderStatus(): Promise<Array<{ provider: string; configured: boolean; enabled: boolean }>> {
    const providers = ['microsoft', 'google', 'github'];
    const status = [];

    for (const provider of providers) {
      const config = getOAuthProvider(provider as keyof OAuthConfig);
      status.push({
        provider,
        configured: !!(config?.clientId && config?.clientSecret),
        enabled: !!(config?.clientId && config?.clientSecret)
      });
    }

    return status;
  }

  /**
   * Generate OAuth configuration instructions for deployment
   */
  generateOAuthSetupInstructions(): string {
    return `
# OAuth 2.0 Configuration for pAIchart MCP Hub

## Environment Variables Required:

### Microsoft Azure AD
MICROSOFT_CLIENT_ID=your-azure-app-client-id
MICROSOFT_CLIENT_SECRET=your-azure-app-client-secret

### Google Workspace  
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret

### GitHub OAuth
GITHUB_CLIENT_ID=your-github-oauth-app-client-id
GITHUB_CLIENT_SECRET=your-github-oauth-app-client-secret

## OAuth Application Setup:

### Microsoft Azure AD:
1. Go to Azure Portal → App Registrations
2. Create new registration: "pAIchart MCP Hub"
3. Redirect URI: https://paichart.app/api/auth/oauth/callback/microsoft
4. API Permissions: User.Read, email, profile, openid

### Google Cloud Console:
1. Go to Google Cloud Console → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID: "pAIchart MCP Hub"
3. Authorized redirect URI: https://paichart.app/api/auth/oauth/callback/google
4. Scopes: email, profile, openid

### GitHub OAuth Apps:
1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Create new OAuth App: "pAIchart MCP Hub"
3. Callback URL: https://paichart.app/api/auth/oauth/callback/github
4. Scopes: user:email (the /user endpoint returns all needed public profile fields regardless of scope; user:email additionally grants access to the primary verified email including private ones)

## Testing:
After configuration, test OAuth flows using:
- GET /api/auth/oauth/microsoft
- GET /api/auth/oauth/google  
- GET /api/auth/oauth/github
`;
  }
}

export const oauthService = new EnterpriseOAuthService();