/**
 * OAuth 2.0 Provider Configuration for Enterprise Authentication
 * Supports Microsoft, Google, and GitHub for enterprise customers
 * Part of Plan 9: Anthropic Directory Policy compliance
 */

import { UserRole } from '../../types/auth';
import { authLogger } from '@/lib/logger';

const localLogger = authLogger.child({ module: 'OAuthConfig' });

export interface OAuthEndpoints {
  authorize: string;
  token: string;
  userInfo: string;
  revoke?: string;
}

export interface OAuthProvider {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  endpoints: OAuthEndpoints;
  displayName: string;
  enterpriseFeatures?: {
    teamSync?: boolean;
    roleMapping?: boolean;
    domainRestriction?: boolean;
  };
}

export interface OAuthConfig {
  microsoft: OAuthProvider;
  google: OAuthProvider;
  github: OAuthProvider;
}

/**
 * OAuth 2.0 provider configurations for enterprise authentication
 */
export const OAUTH_PROVIDERS: OAuthConfig = {
  microsoft: {
    clientId: process.env.MICROSOFT_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    redirectUri: process.env.APP_BASE_URL + '/api/auth/oauth/callback/microsoft',
    scopes: ['openid', 'profile', 'email', 'User.Read'],
    endpoints: {
      authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      userInfo: 'https://graph.microsoft.com/v1.0/me',
      revoke: 'https://login.microsoftonline.com/common/oauth2/v2.0/logout'
    },
    displayName: 'Microsoft',
    enterpriseFeatures: {
      teamSync: true,
      roleMapping: true,
      domainRestriction: true
    }
  },
  
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.APP_BASE_URL + '/api/auth/oauth/callback/google',
    scopes: ['openid', 'profile', 'email'],
    endpoints: {
      authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
      token: 'https://oauth2.googleapis.com/token',
      userInfo: 'https://www.googleapis.com/oauth2/v2/userinfo',
      revoke: 'https://oauth2.googleapis.com/revoke'
    },
    displayName: 'Google',
    enterpriseFeatures: {
      teamSync: true,
      roleMapping: false,
      domainRestriction: true
    }
  },
  
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    redirectUri: process.env.APP_BASE_URL + '/api/auth/oauth/callback/github',
    // 2026-04-09: reduced from ['user:email', 'read:user'] to ['user:email'].
    // The /user endpoint still returns all public profile fields (id, login,
    // name, avatar_url, company, bio) regardless of scope, so `read:user` was
    // redundant. `user:email` grants ACCESS to the user's verified emails, but
    // GET /user.email is still null for private-email users — the primary verified
    // address must be fetched via GET /user/emails (see lib/auth/oauth/github-email.ts).
    // Consent screen now shows only "Access user email
    // addresses (read-only)" instead of also "Read all user profile data".
    // See parallel reduction in mcp-server-http-clean.js CLAUDE_SCOPE.
    scopes: ['user:email'],
    endpoints: {
      authorize: 'https://github.com/login/oauth/authorize',
      token: 'https://github.com/login/oauth/access_token',
      userInfo: 'https://api.github.com/user'
    },
    displayName: 'GitHub',
    enterpriseFeatures: {
      teamSync: false,
      roleMapping: false,
      domainRestriction: false
    }
  }
};

/**
 * OAuth 2.0 configuration validation
 */
export function validateOAuthConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  for (const [providerName, config] of Object.entries(OAUTH_PROVIDERS)) {
    if (!config.clientId) {
      errors.push(`${providerName}: Missing CLIENT_ID environment variable`);
    }
    
    if (!config.clientSecret) {
      errors.push(`${providerName}: Missing CLIENT_SECRET environment variable`);
    }
    
    if (!config.redirectUri || !config.redirectUri.startsWith('https://')) {
      errors.push(`${providerName}: Invalid or missing redirect URI`);
    }
    
    if (!config.scopes || config.scopes.length === 0) {
      errors.push(`${providerName}: Missing OAuth scopes`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get OAuth provider configuration
 */
export function getOAuthProvider(provider: keyof OAuthConfig): OAuthProvider | null {
  return OAUTH_PROVIDERS[provider] || null;
}

/**
 * Get all enabled OAuth providers
 */
export function getEnabledOAuthProviders(): Array<{ name: string; config: OAuthProvider }> {
  const enabled = [];
  
  for (const [name, config] of Object.entries(OAUTH_PROVIDERS)) {
    if (config.clientId && config.clientSecret) {
      enabled.push({ name, config });
    }
  }
  
  return enabled;
}

/**
 * OAuth 2.0 scopes and their purposes
 */
export const OAUTH_SCOPES = {
  microsoft: {
    'openid': 'Basic authentication',
    'profile': 'User profile information',
    'email': 'Email address access',
    'User.Read': 'Microsoft Graph user data'
  },
  google: {
    'openid': 'Basic authentication',
    'profile': 'User profile information', 
    'email': 'Email address access'
  },
  github: {
    'user:email': 'Email address access',
    'read:user': 'User profile information'
  }
};

/**
 * Enterprise role mapping from OAuth claims
 */
export const ENTERPRISE_ROLE_MAPPING = {
  // Microsoft Azure AD role mapping
  microsoft: {
    'Global Administrator': UserRole.SUPER_ADMIN,
    'Application Administrator': UserRole.ADMIN,
    'User Administrator': UserRole.ADMIN,
    'User': UserRole.USER
  },
  
  // Google Workspace role mapping
  google: {
    'super_admin': UserRole.SUPER_ADMIN,
    'admin': UserRole.ADMIN,
    'user': UserRole.USER
  },
  
  // GitHub organization role mapping
  github: {
    'admin': UserRole.ADMIN,
    'member': UserRole.USER
  }
};

/**
 * OAuth state parameter configuration for CSRF protection
 */
export interface OAuthState {
  provider: string;
  returnTo?: string;
  timestamp: number;
  nonce: string;
}

/**
 * Generate secure OAuth state parameter
 */
export function generateOAuthState(provider: string, returnTo?: string): string {
  const state: OAuthState = {
    provider,
    returnTo,
    timestamp: Date.now(),
    nonce: require('crypto').randomBytes(16).toString('hex')
  };
  
  return Buffer.from(JSON.stringify(state)).toString('base64url');
}

/**
 * Validate and parse OAuth state parameter
 */
export function validateOAuthState(stateParam: string): OAuthState | null {
  try {
    // First, try to parse as base64url-encoded JSON (our format)
    const state = JSON.parse(Buffer.from(stateParam, 'base64url').toString());

    // Handle regular states
    // Validate timestamp (15 minutes max)
    if (Date.now() - state.timestamp > 15 * 60 * 1000) {
      throw new Error('OAuth state expired');
    }

    // Validate required fields for regular states
    if (!state.provider || !state.nonce) {
      throw new Error('Invalid OAuth state structure');
    }

    return state;
  } catch (error) {
    // If parsing fails, this might be a Gemini state (raw string)
    // Gemini controls its own state format, so we can't validate it
    // Just return null to indicate it's not our state format
    localLogger.debug({ statePrefix: stateParam.substring(0, 10) }, 'OAuth state is not in our format (possibly Gemini state)');
    return null;
  }
}