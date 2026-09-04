/**
 * MCP OAuth Validator
 * Unified OAuth token validation for GitHub, Google, and Microsoft
 * Reuses existing user lookup and permission model
 */

const { oauthLogger } = require('./oauth-logger'); // NEW: OAuth audit logging

// DATABASE FIX #6: Use centralized Prisma import (Fix 5.9)
// Import from central singleton instead of creating new instance
const { prisma } = require('../../prisma');
const { defaultUserRole, registrationAllowed } = require('../registration-policy');
const { resolveGitHubEmail } = require('./github-email');

/**
 * Neutralize a provider-supplied display name before persistence (2026-05-26
 * round 3, Probe A). OAuth names are attacker-controlled (a viewer sets their
 * GitHub/Google name freely) and flow UNESCAPED into LLM prompt context
 * downstream (e.g. prompt-registry "Assignee: ${name}", agentExecutionEngine
 * "Assigned to: ${name}"). Escaping doesn't help — that's prompt-injection, not
 * XSS. Strip control chars + newlines and cap length so a name can't carry
 * STRUCTURAL injection (new instruction lines) into a prompt. This brings OAuth
 * provisioning to parity with the profile-update endpoint, which already runs
 * detectPromptInjection. We sanitize (not reject) so legitimate names with
 * punctuation still log in.
 */
function sanitizeDisplayName(name) {
  if (typeof name !== 'string') return name;
  return name
    .replace(/[\x00-\x1F\x7F]/g, ' ') // strip control chars + newlines
    .replace(/\s+/g, ' ')                    // collapse runs of whitespace
    .trim()
    .slice(0, 100);                          // cap (matches FIELD_LIMITS.LABEL)
}

class MCPOAuthValidator {
  constructor(logger) {
    this.logger = logger || console;
    this.prisma = prisma; // DATABASE FIX #6: Use shared global client (prevents connection leaks)
    this.sessionManager = null;
    this.currentSessionId = null;
  }

  /**
   * Main entry point - tries all providers to validate token
   */
  async verifyOAuthToken(token, correlationId = `oauth-verify-${Date.now()}`) {
    // Try each provider in sequence. Thread correlationId to every validator so the
    // provider validators' audit logs AND the /user/emails resolver warns
    // (github-email.ts) share one id per verify attempt. Previously this called
    // validator.call(this, token) with one arg, so verify{GitHub,Microsoft}Token's
    // correlationId was ALWAYS undefined and those logs were uncorrelated.
    const providers = [
      { name: 'github', validator: this.verifyGitHubToken },
      { name: 'google', validator: this.verifyGoogleToken },
      { name: 'microsoft', validator: this.verifyMicrosoftToken }
    ];

    for (const { name, validator } of providers) {
      try {
        const user = await validator.call(this, token, correlationId);
        if (user) {
          return { ...user, authMethod: `${name}_oauth` };
        }
      } catch (error) {
        this.logger.debug(`${name} token validation failed:`, error.message);
      }
    }

    return null;
  }

  /**
   * GitHub OAuth token validation
   * Already working in the existing MCP server
   */
  async verifyGitHubToken(token, correlationId) {  // ⭐ CRITICAL FIX #5: Add correlationId param
    const startTime = Date.now();
    const requestId = `gh-val-${Date.now()}`;

    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'pAIchart-MCP-Hub'
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        // BC20 FIX: consume body to release TCP connection
        await response.body?.cancel();
        // ⭐ Log GitHub API failure
        oauthLogger.log({
          correlationId,
          userId: 'unknown',
          provider: 'github',
          action: 'github_token_validation',
          success: false,
          errorMessage: `GitHub API returned ${response.status}`,
          executionTimeMs: Date.now() - startTime,
          requestId
        });
        return null;
      }

      const githubUser = await response.json();

      // ENHANCED LOGGING: Capture GitHub account details for OAuth flow debugging
      this.logger.info('[OAuth Debug] GitHub user authenticated:', {
        githubId: githubUser.id,
        githubLogin: githubUser.login,
        githubEmail: githubUser.email,
        githubName: githubUser.name,
        publicRepos: githubUser.public_repos,
        company: githubUser.company,
        bio: githubUser.bio?.substring(0, 50)
      });

      // GitHub private-email resolution: GET /user returns email:null for private
      // emails; fetch the primary verified address via /user/emails. Requires the
      // GitHub App "Email addresses: read" account permission. See github-email.ts.
      let resolvedEmail = githubUser.email;
      if (!resolvedEmail) {
        const r = await resolveGitHubEmail(token, githubUser.email, correlationId);
        resolvedEmail = r ? r.email : null;
      }

      const user = await this.findOrCreateUser({
        id: githubUser.id,
        email: resolvedEmail,
        name: githubUser.name || githubUser.login,
        avatar_url: githubUser.avatar_url,
        login: githubUser.login
      }, 'github');

      // ⭐ Log successful validation
      oauthLogger.log({
        correlationId,
        userId: user.userId || user.id,
        provider: 'github',
        action: 'github_token_validation',
        success: true,
        executionTimeMs: Date.now() - startTime,
        requestId
      });

      return user;

    } catch (error) {
      // ⭐ Log exception
      oauthLogger.log({
        correlationId,
        userId: 'unknown',
        provider: 'github',
        action: 'github_token_validation',
        success: false,
        errorMessage: error.message,
        executionTimeMs: Date.now() - startTime,
        requestId
      });

      this.logger.debug('GitHub validation error:', error.message);
      return null;
    }
  }

  /**
   * Google OAuth token validation
   * New implementation following GitHub pattern
   */
  async verifyGoogleToken(token) {
    try {
      // First validate the token
      const tokenResponse = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${token}`,
        { signal: AbortSignal.timeout(10_000) }
      );

      if (!tokenResponse.ok) {
        await tokenResponse.body?.cancel(); // BC20 FIX
        return null;
      }

      const tokenInfo = await tokenResponse.json();

      // Get user profile
      const profileResponse = await fetch(
        'https://www.googleapis.com/oauth2/v1/userinfo',
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(10_000),
        }
      );

      if (!profileResponse.ok) {
        await profileResponse.body?.cancel(); // BC20 FIX
        return null;
      }

      const googleUser = await profileResponse.json();
      return this.findOrCreateUser({
        id: googleUser.id,
        email: googleUser.email,
        name: googleUser.name,
        avatar_url: googleUser.picture,
        login: googleUser.email?.split('@')[0]
      }, 'google');

    } catch (error) {
      this.logger.debug('Google validation error:', error.message);
      return null;
    }
  }

  /**
   * Microsoft OAuth token validation
   * New implementation following GitHub pattern
   */
  async verifyMicrosoftToken(token, correlationId) {  // ⭐ CRITICAL FIX #1: Add correlationId param
    const startTime = Date.now();
    const requestId = `ms-val-${Date.now()}`;

    try {
      // ⭐ Log Graph API call start
      oauthLogger.log({
        correlationId,
        userId: 'validating',
        provider: 'microsoft',
        action: 'microsoft_graph_api_call',
        success: true,
        requestId: `ms-graph-${Date.now()}`
      });

      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        // BC20 FIX: consume body to release TCP connection
        await response.body?.cancel();
        // ⭐ Log Graph API failure
        oauthLogger.log({
          correlationId,
          userId: 'unknown',
          provider: 'microsoft',
          action: 'microsoft_token_validation',
          success: false,
          errorMessage: `Graph API returned ${response.status}`,
          executionTimeMs: Date.now() - startTime,
          requestId
        });
        return null;
      }

      const msUser = await response.json();

      const user = await this.findOrCreateUser({
        id: msUser.id,
        email: msUser.userPrincipalName || msUser.mail,
        name: msUser.displayName,
        avatar_url: null, // Microsoft Graph doesn't return avatar in basic profile
        login: (msUser.userPrincipalName || msUser.mail)?.split('@')[0]
      }, 'microsoft');

      // ⭐ Log successful validation
      oauthLogger.log({
        correlationId,
        userId: user.userId || user.id,
        provider: 'microsoft',
        action: 'microsoft_token_validation',
        success: true,
        executionTimeMs: Date.now() - startTime,
        requestId
      });

      return user;

    } catch (error) {
      // ⭐ Log exception
      oauthLogger.log({
        correlationId,
        userId: 'unknown',
        provider: 'microsoft',
        action: 'microsoft_token_validation',
        success: false,
        errorMessage: error.message,
        executionTimeMs: Date.now() - startTime,
        requestId
      });

      this.logger.debug('Microsoft validation error:', error.message);
      return null;
    }
  }

  /**
   * Validate OAuth user data from provider
   * BOUNDARY FIX: Input validation at GitHub/Google/Microsoft boundary
   */
  validateOAuthUser(oauthUser, provider) {
    // Validate provider ID exists and is valid
    if (!oauthUser?.id) {
      throw new Error(`[OAuth] Missing user ID from ${provider}`);
    }

    // Validate ID format (must be convertible to string)
    const providerId = oauthUser.id.toString();
    if (!providerId || providerId === 'undefined' || providerId === 'null') {
      throw new Error(`[OAuth] Invalid ${provider} user ID: ${oauthUser.id}`);
    }

    // Validate email format if provided (optional for GitHub private emails)
    if (oauthUser.email && !oauthUser.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      this.logger.warn(`[OAuth] Invalid email format from ${provider}: ${oauthUser.email}`);
      oauthUser.email = null; // Sanitize instead of fail
    }

    return {
      id: providerId,
      email: oauthUser.email || null,
      name: sanitizeDisplayName(oauthUser.name || oauthUser.login || 'User'),
      avatar_url: oauthUser.avatar_url || null,
      login: oauthUser.login || null
    };
  }

  /**
   * Find or create user in database
   * DATABASE FIX #7: Wrapped in transaction to prevent race conditions
   * Includes retry logic with exponential backoff
   * CRITICAL FIX: Phantom user detection + email matching removal
   */
  async findOrCreateUser(oauthUser, provider) {
    try {
      // BOUNDARY FIX: Validate input from OAuth provider
      const validatedUser = this.validateOAuthUser(oauthUser, provider);

      // FIX 3: Force fresh connection for OAuth operations
      await this.prisma.$connect();

      // DATABASE FIX #7: Wrap in transaction + retry logic
      return await this.retryPrismaOperation(async () => {
        // Wrap in transaction to prevent duplicate user creation (race condition fix)
        // FIX 4 Enhancement: Explicit isolation level and timeouts
        return await this.prisma.$transaction(async (tx) => {
          // FIX 1: Remove email matching - use ONLY OAuth provider ID
          // Email can change, can be reused, can collide
          // Provider ID is canonical and immutable
          const whereConditions = {
            oauthProvider: provider,
            oauthProviderId: validatedUser.id
          };

          // Look for existing user by provider ID ONLY
          let user = await tx.user.findFirst({
            where: whereConditions
          });

          if (user) {
            // FIX 2: Phantom user detection - verify user actually exists
            // Prevents stale Prisma connection cache from returning deleted users
            const verifyUser = await tx.user.findUnique({
              where: { id: user.id }
            });

            if (!verifyUser) {
              // CRITICAL: Phantom user detected!
              this.logger.error(
                `[OAuth CRITICAL] Phantom user detected: ${user.id} ` +
                `returned by findFirst but not found by findUnique. ` +
                `This indicates stale connection cache.`
              );

              // Log to oauthLogger for security monitoring
              oauthLogger.log({
                correlationId: `phantom-${Date.now()}`,
                userId: user.id,
                provider,
                action: 'phantom_user_detected',
                success: false,
                errorMessage: `Phantom user ${user.id} from stale cache`,
                requestId: `phantom-detect-${Date.now()}`
              });

              // Force user creation instead of using phantom
              user = null;
            } else {
              // FIX 5: Enhanced logging - show provider ID match status
              const providerIdMatches = verifyUser.oauthProviderId === validatedUser.id;

              this.logger.info(`[OAuth Debug] Found existing user:`, {
                userId: verifyUser.id,
                email: verifyUser.email,
                role: verifyUser.role,
                requestedProviderId: validatedUser.id,
                actualProviderId: verifyUser.oauthProviderId,
                providerIdMatches,
                existsInDb: true // Verified by findUnique
              });

              // Alert if provider ID doesn't match (shouldn't happen after Fix 1)
              if (!providerIdMatches) {
                this.logger.warn(
                  `[OAuth SECURITY] User ${verifyUser.id} matched but provider ID mismatch! ` +
                  `Expected: ${validatedUser.id}, Actual: ${verifyUser.oauthProviderId}`
                );
              }

              // RECOMMENDATION 3: Sync email from OAuth provider
              user = await tx.user.update({
                where: { id: verifyUser.id },
                data: {
                  oauthProvider: provider,
                  oauthProviderId: validatedUser.id,
                  avatarUrl: validatedUser.avatar_url || verifyUser.avatarUrl,
                  lastLoginAt: new Date(),
                  name: validatedUser.name || verifyUser.name,
                  // NEW: Sync email from OAuth provider if provided
                  ...(validatedUser.email && { email: validatedUser.email })
                }
              });

              this.logger.info(`[OAuth Debug] Updated existing user with ${provider} data:`, {
                userId: user.id,
                email: user.email,
                role: user.role
              });
            }
          } else {
            // CROSS-PROVIDER LINKING (Bug 2 fix, Apr 2026):
            // Before creating, check if a user already exists with this email under a
            // different OAuth provider. If so, attach the new provider linkage to the
            // existing user instead of failing on the email unique constraint.
            //
            // Policy: email-based account linking accepted as risk for current scope.
            // Provider verification of email establishes mailbox control at login time,
            // not transitive identity across providers — recycled emails / breached
            // mailboxes can enable account takeover. Forensic trail captured below
            // via oauthLogger 'cross_provider_link' events; revisit before broader rollout.
            let existingUserByEmail = null;
            if (validatedUser.email) {
              existingUserByEmail = await tx.user.findUnique({
                where: { email: validatedUser.email }
              });
            }

            if (existingUserByEmail) {
              // Same email, different (or missing) provider linkage — link the new provider
              // by updating the User row's oauthProvider/oauthProviderId columns.
              const previousProvider = existingUserByEmail.oauthProvider;
              const previousProviderId = existingUserByEmail.oauthProviderId;

              user = await tx.user.update({
                where: { id: existingUserByEmail.id },
                data: {
                  oauthProvider: provider,
                  oauthProviderId: validatedUser.id,
                  avatarUrl: validatedUser.avatar_url || existingUserByEmail.avatarUrl,
                  lastLoginAt: new Date(),
                  name: validatedUser.name || existingUserByEmail.name
                  // Note: email, role, status preserved from existing row.
                }
              });

              // Forensic audit trail — every cross-provider link is a potential takeover
              // surface, so log explicitly with both old and new provider identities.
              oauthLogger.log({
                correlationId: `cross-link-${Date.now()}`,
                userId: user.id,
                provider,
                action: 'cross_provider_link',
                success: true,
                requestId: `cross-link-${Date.now()}`,
                metadata: {
                  previousProvider,
                  previousProviderId,
                  newProvider: provider,
                  newProviderId: validatedUser.id,
                  email: validatedUser.email,
                  riskAcknowledged: 'email_based_linking_accepted_policy'
                }
              });

              this.logger.info(
                `[OAuth] Cross-provider link: user ${user.id} email-matched and re-linked from ${previousProvider || 'none'} to ${provider}`,
                {
                  userId: user.id,
                  email: user.email,
                  role: user.role,
                  previousProvider,
                  previousProviderId,
                  newProvider: provider,
                  newProviderId: validatedUser.id
                }
              );
            } else {
              // round 3 Probe C (2026-05-26): Control B reject-at-cap. Bound the
              // number of concurrent DEMO_USER rows so a public-launch spike
              // (YouTube audience, amplified by multi-provider Sybil) can't exhaust
              // the small server. Only NEW demo provisioning is blocked at the
              // ceiling — existing demo users re-link/login via the branches above.
              // Off the hot path: a single COUNT, no lock and no LRU eviction
              // (sec-ops + api-efficiency rejected in-request eviction). Control A's
              // retention cron keeps steady-state well under this spike guard. The
              // reject error is non-retryable (isRetryable matches only transient DB
              // errors), so it surfaces immediately. Tune via DEMO_USER_CEILING env.
              const DEMO_USER_CEILING = parseInt(process.env.DEMO_USER_CEILING || '1000', 10);
              const demoCount = await tx.user.count({ where: { role: 'DEMO_USER' } });
              if (demoCount >= DEMO_USER_CEILING) {
                oauthLogger.log({
                  correlationId: `demo-cap-${Date.now()}`,
                  provider,
                  action: 'demo_ceiling_reject',
                  success: false,
                  requestId: `demo-cap-${Date.now()}`,
                  metadata: { demoCount, ceiling: DEMO_USER_CEILING, newProviderId: validatedUser.id }
                });
                this.logger.warn(`[OAuth] DEMO_USER ceiling reached (${demoCount}/${DEMO_USER_CEILING}) — rejecting new demo provisioning for ${provider}`);
                throw new Error('DEMO_CEILING_REACHED: demo access is temporarily at capacity. Please try again later.');
              }

              // True first-time user across all providers — create new row.
              // No email stub: if we couldn't resolve a verified email (no public
              // email + /user/emails unavailable), reject rather than fabricate an
              // undeliverable login@provider.user identity. See github-email.ts.
              if (!validatedUser.email) {
                throw new Error('GITHUB_NO_VERIFIED_EMAIL: no verified email from provider; cannot provision account. Add and verify an email in your provider settings, then re-authorize.');
              }
              if (!registrationAllowed()) {
                throw new Error('REGISTRATION_DISABLED: this server does not accept new accounts; ask an administrator to create one');
              }
              user = await tx.user.create({
                data: {
                  name: validatedUser.name || validatedUser.login || validatedUser.email.split('@')[0],
                  email: validatedUser.email,
                  oauthProvider: provider,
                  oauthProviderId: validatedUser.id,
                  avatarUrl: validatedUser.avatar_url,
                  role: defaultUserRole(), // DEFAULT_USER_ROLE (unset → DEMO_USER, the SaaS default)
                  isVerified: true, // OAuth users are pre-verified
                  lastLoginAt: new Date(),
                  status: 'ACTIVE'
                }
              });
              this.logger.info(`Created new user from ${provider} OAuth:`, {
                userId: user.id,
                email: user.email,
                role: user.role
              });
            }
          }

          // RECOMMENDATION 2: Validate required fields before JWT minting
          // Prevents field leakage bugs where phantom users have undefined role/email
          if (!user.role) {
            this.logger.error(
              `[OAuth CRITICAL] User ${user.id} missing role field. ` +
              `This indicates data corruption or phantom user.`
            );
            throw new Error(`User ${user.id} missing required role field for JWT minting`);
          }

          if (!user.email) {
            this.logger.error(
              `[OAuth CRITICAL] User ${user.id} missing email field. ` +
              `This indicates data corruption.`
            );
            throw new Error(`User ${user.id} missing required email field for JWT minting`);
          }

          // 2026-05-27: enforce UserStatus — INACTIVE/SUSPENDED accounts cannot
          // authenticate via OAuth even with a valid provider token. Blocks login at
          // the issue point (pairs with the password-login gate + refresh-token
          // revocation on disable). Non-retryable error (isRetryable matches only
          // transient DB messages), so it surfaces to the OAuth caller immediately.
          if (user.status && user.status !== 'ACTIVE') {
            this.logger.warn(`[OAuth] login blocked — user ${user.id} status=${user.status} (not ACTIVE)`);
            throw new Error(`ACCOUNT_NOT_ACTIVE: account is ${String(user.status).toLowerCase()} and cannot sign in`);
          }

          // Return user with permissions based on role
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            avatarUrl: user.avatarUrl,

            // Add permissions based on role (includes DEMO_USER support)
            permissions: {
              canViewPOVs: true, // All authenticated users can view
              canCreatePOVs: ['ADMIN', 'SUPER_ADMIN'].includes(user.role),
              canEditTasks: ['ADMIN', 'SUPER_ADMIN', 'USER', 'DEMO_USER'].includes(user.role),
              canAccessMCP: true, // All authenticated users can access MCP
              canManageTeams: ['ADMIN', 'SUPER_ADMIN'].includes(user.role),
              canDeletePOVs: user.role === 'SUPER_ADMIN',
              // DEMO_USER has same access as USER (Feb 2026)
              canRegisterServices: ['ADMIN', 'SUPER_ADMIN', 'USER', 'DEMO_USER'].includes(user.role),
              canViewServices: true, // All authenticated users including DEMO_USER

              // Demo-specific permissions
              isDemoUser: user.role === 'DEMO_USER',
              canEditDemoTasks: user.role === 'DEMO_USER',
              canAssignDemoAgents: user.role === 'DEMO_USER'
            }
          };
        }, {
          isolationLevel: 'ReadCommitted', // Explicit (prevents dirty reads)
          maxWait: 5000,  // 5 seconds max wait for transaction lock
          timeout: 10000, // 10 seconds max transaction duration
        });
      }, 3, 2000); // 3 retries, 2-second max duration for OAuth timeout protection

    } catch (error) {
      this.logger.error(`Database operation failed in findOrCreateUser for ${provider}:`, error);
      // DATABASE FIX #9: Cleanup temporary session on error
      this.cleanupTemporarySession();
      throw error;
    }
    // DATABASE FIX #8: Don't disconnect - let shared Prisma client manage connection lifecycle
    // Connection pooling handled by global singleton in /lib/prisma.ts
  }

  /**
   * Retry Prisma operations with exponential backoff
   * Handles "Response from the Engine was empty" errors
   * Includes OAuth timeout protection and session cleanup
   *
   * @param {Function} operation - Async function to retry
   * @param {number} maxRetries - Maximum retry attempts (default: 3)
   * @param {number} maxDuration - Maximum total retry duration in ms (default: null)
   * @returns {Promise<any>} Operation result
   */
  async retryPrismaOperation(operation, maxRetries = 3, maxDuration = null) {
    let lastError;
    const startTime = Date.now();

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Check if it's a retryable Prisma error
        const isRetryable =
          // 2026-05-26: prefer Prisma transient error CODES over message matching —
          // P1001 can't-reach-db, P1017 connection-closed, P2024 pool-timeout,
          // P2034 write-conflict/deadlock (retry-safe inside a transaction).
          ['P1001', 'P1017', 'P2024', 'P2034'].includes(error.code) ||
          error.message?.includes('Response from the Engine was empty') ||
          error.message?.includes('Connection refused') ||
          error.message?.includes('timed out');

        if (!isRetryable || attempt === maxRetries) {
          // Cleanup temporary sessions on failure (CRITICAL FIX #3)
          this.cleanupTemporarySession();
          throw error;
        }

        // Exponential backoff: 100ms, 200ms, 400ms
        const delay = Math.min(100 * Math.pow(2, attempt), 1000);

        // OAuth timeout protection (CRITICAL FIX #2)
        if (maxDuration && (Date.now() - startTime + delay > maxDuration)) {
          this.logger.warn(`[DB Retry] Exceeded max duration ${maxDuration}ms, aborting retries`);
          this.cleanupTemporarySession();
          throw lastError;
        }

        this.logger.warn(`[DB Retry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms:`, error.message);

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    this.cleanupTemporarySession();
    throw lastError;
  }

  /**
   * DATABASE FIX #9: Cleanup temporary sessions on retry failure
   * Prevents session context pollution and memory leaks
   */
  cleanupTemporarySession() {
    // Access session manager from MCP server if available
    if (this.sessionManager && this.currentSessionId) {
      const sessionId = this.currentSessionId;

      // Check if this is a temporary OAuth session
      const session = this.sessionManager.get(sessionId);
      if (session && session.isTemporary) {
        this.sessionManager.delete(sessionId);
        this.logger.info(`[Session Cleanup] Removed temporary OAuth session ${sessionId}`);
      }

      // Clear current session reference
      this.currentSessionId = null;
    }
  }

  /**
   * DATABASE FIX #9: Set session manager and current session for cleanup
   * Called by OAuth flow before user creation
   */
  setSessionContext(sessionManager, sessionId) {
    this.sessionManager = sessionManager;
    this.currentSessionId = sessionId;
  }
}

module.exports = { MCPOAuthValidator };