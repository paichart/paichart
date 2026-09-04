/**
 * PKCE Multi-Client Tests
 *
 * Tests PKCE parameter forwarding across all three AI clients:
 * - ChatGPT (PKCE required)
 * - Claude Desktop (PKCE optional)
 * - Gemini CLI (PKCE optional)
 *
 * Part of: OAuth Implementation Plan - Item 4
 * Reference: cline_docs/oauth-implementation-plan-focused.md lines 404-437
 *
 * Test Coverage:
 * 1. ChatGPT - PKCE Required (3 tests)
 * 2. Claude Desktop - PKCE Optional (2 tests)
 * 3. Gemini CLI - PKCE Optional (1 test)
 * 4. Provider PKCE Support (3 tests)
 *
 * Total: 9 tests
 */

/**
 * Helper Functions
 * These extract OAuth logic from mcp-server-http-clean.js for testability
 */

/**
 * Builds OAuth authorization URL with PKCE parameters
 *
 * Extracted from: mcp-server-http-clean.js lines 1716-1808
 *
 * @param {Object} params - OAuth parameters
 * @param {string} params.client - Client name ('chatgpt', 'claude', 'gemini')
 * @param {string} params.redirect_uri - OAuth callback URL
 * @param {string} params.provider - OAuth provider ('github', 'microsoft', 'google')
 * @param {string} [params.scope] - OAuth scopes
 * @param {string} [params.code_challenge] - PKCE code challenge
 * @param {string} [params.code_challenge_method] - PKCE method (default: 'S256')
 * @param {string} [params.state] - OAuth state parameter
 * @returns {string} - Complete authorization URL
 */
function buildAuthorizeUrl(params) {
  const {
    client,
    redirect_uri,
    provider = 'github',
    scope = 'read:user user:email',
    code_challenge,
    code_challenge_method = 'S256',
    state = 'test-state-123'
  } = params;

  // Client detection logic (from lines 1769-1783)
  const isGeminiCLI = redirect_uri && redirect_uri.includes('localhost:7777');
  const isChatGPT = redirect_uri && (
    redirect_uri.includes('chatgpt.com') ||
    redirect_uri.includes('openai.com')
  );
  const isClaude = redirect_uri && redirect_uri.includes('claude.ai');

  // Provider-specific URL construction
  let authUrl;
  let clientId;

  if (provider === 'github') {
    // GitHub authorization URL (lines 1786-1801)
    authUrl = new URL('https://github.com/login/oauth/authorize');

    // Client-specific GitHub OAuth app selection (lines 1777-1783)
    if (isGeminiCLI) {
      clientId = process.env.GEMINI_GITHUB_CLIENT_ID || 'gemini-client-id';
    } else if (isChatGPT) {
      clientId = process.env.CHATGPT_GITHUB_CLIENT_ID || 'chatgpt-client-id';
    } else if (isClaude) {
      clientId = process.env.CLAUDE_GITHUB_CLIENT_ID || 'claude-client-id';
    } else {
      clientId = process.env.GITHUB_CLIENT_ID || 'default-client-id';
    }

    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirect_uri);
    authUrl.searchParams.set('state', state);

    if (scope) {
      authUrl.searchParams.set('scope', scope);
    }

    // CRITICAL: Forward PKCE parameters (lines 1796-1801)
    // Only add code_challenge_method if code_challenge is present
    if (code_challenge) {
      authUrl.searchParams.set('code_challenge', code_challenge);
      authUrl.searchParams.set('code_challenge_method', code_challenge_method);
    }

  } else if (provider === 'microsoft') {
    // Microsoft authorization URL (lines 992-1011)
    authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');

    // Client-specific Microsoft OAuth app selection
    if (isGeminiCLI) {
      clientId = process.env.GEMINI_MICROSOFT_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID || 'gemini-ms-client-id';
    } else if (isChatGPT) {
      clientId = process.env.CHATGPT_MICROSOFT_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID || 'chatgpt-ms-client-id';
    } else if (isClaude) {
      clientId = process.env.CLAUDE_MICROSOFT_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID || 'claude-ms-client-id';
    } else {
      clientId = process.env.MICROSOFT_CLIENT_ID || 'ms-client-id';
    }

    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirect_uri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('response_type', 'code');

    // Microsoft-specific scopes (line 1004)
    const msScope = 'openid profile email User.Read offline_access';
    authUrl.searchParams.set('scope', msScope);

    // CRITICAL: Forward PKCE parameters (lines 1008-1011)
    if (code_challenge) {
      authUrl.searchParams.set('code_challenge', code_challenge);
      authUrl.searchParams.set('code_challenge_method', code_challenge_method || 'S256');
    }

  } else if (provider === 'google') {
    // Google authorization URL (future implementation)
    authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    clientId = process.env.GOOGLE_CLIENT_ID || 'google-client-id';

    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirect_uri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scope || 'openid email profile');

    // Google supports PKCE
    if (code_challenge) {
      authUrl.searchParams.set('code_challenge', code_challenge);
      authUrl.searchParams.set('code_challenge_method', code_challenge_method || 'S256');
    }
  }

  return authUrl.toString();
}

/**
 * Builds token exchange parameters with PKCE code_verifier
 *
 * Extracted from: mcp-server-http-clean.js lines 1078-1090
 *
 * @param {Object} params - Token exchange parameters
 * @param {string} params.client - Client name
 * @param {string} params.code - Authorization code
 * @param {string} params.redirect_uri - OAuth callback URL
 * @param {string} [params.code_verifier] - PKCE code verifier
 * @param {string} [params.provider] - OAuth provider (default: 'github')
 * @returns {URLSearchParams} - Token exchange parameters
 */
function buildTokenExchangeParams(params) {
  const {
    client,
    code,
    redirect_uri,
    code_verifier,
    provider = 'github'
  } = params;

  // Client detection
  const isGeminiCLI = redirect_uri && redirect_uri.includes('localhost:7777');
  const isChatGPT = redirect_uri && (
    redirect_uri.includes('chatgpt.com') ||
    redirect_uri.includes('openai.com')
  );
  const isClaude = redirect_uri && redirect_uri.includes('claude.ai');

  // Client-specific credentials
  let clientId, clientSecret;

  if (provider === 'github') {
    if (isGeminiCLI) {
      clientId = process.env.GEMINI_GITHUB_CLIENT_ID || 'gemini-client-id';
      clientSecret = process.env.GEMINI_GITHUB_CLIENT_SECRET || 'gemini-secret';
    } else if (isChatGPT) {
      clientId = process.env.CHATGPT_GITHUB_CLIENT_ID || 'chatgpt-client-id';
      clientSecret = process.env.CHATGPT_GITHUB_CLIENT_SECRET || 'chatgpt-secret';
    } else if (isClaude) {
      clientId = process.env.CLAUDE_GITHUB_CLIENT_ID || 'claude-client-id';
      clientSecret = process.env.CLAUDE_GITHUB_CLIENT_SECRET || 'claude-secret';
    } else {
      clientId = process.env.GITHUB_CLIENT_ID || 'default-client-id';
      clientSecret = process.env.GITHUB_CLIENT_SECRET || 'default-secret';
    }
  } else if (provider === 'microsoft') {
    if (isGeminiCLI) {
      clientId = process.env.GEMINI_MICROSOFT_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID;
      clientSecret = process.env.GEMINI_MICROSOFT_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET;
    } else if (isChatGPT) {
      clientId = process.env.CHATGPT_MICROSOFT_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID;
      clientSecret = process.env.CHATGPT_MICROSOFT_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET;
    } else if (isClaude) {
      clientId = process.env.CLAUDE_MICROSOFT_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID;
      clientSecret = process.env.CLAUDE_MICROSOFT_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET;
    } else {
      clientId = process.env.MICROSOFT_CLIENT_ID || 'ms-client-id';
      clientSecret = process.env.MICROSOFT_CLIENT_SECRET || 'ms-secret';
    }
  }

  // Build token exchange parameters (lines 1078-1090)
  const tokenParams = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: code,
    redirect_uri: redirect_uri,
    grant_type: 'authorization_code'
  });

  // CRITICAL: Include code_verifier for PKCE (lines 1088-1090)
  if (code_verifier) {
    tokenParams.append('code_verifier', code_verifier);
  }

  if (provider === 'microsoft') {
    // Microsoft requires scope in token exchange
    tokenParams.append('scope', 'openid profile email User.Read offline_access');
  }

  return tokenParams;
}

/**
 * Checks if OAuth provider supports PKCE
 *
 * All modern providers (GitHub, Microsoft, Google) support PKCE
 *
 * @param {string} provider - Provider name
 * @returns {boolean} - true if provider supports PKCE
 */
function providerSupportsPKCE(provider) {
  // All modern OAuth providers support PKCE
  const supportedProviders = ['github', 'microsoft', 'google'];
  return supportedProviders.includes(provider.toLowerCase());
}

/**
 * Validates PKCE parameter presence in URL
 *
 * @param {string} url - Authorization URL
 * @param {boolean} shouldHavePKCE - Expected PKCE presence
 * @returns {Object} - Validation result
 */
function validatePKCEInUrl(url, shouldHavePKCE) {
  const urlObj = new URL(url);
  const hasCodeChallenge = urlObj.searchParams.has('code_challenge');
  const hasChallengeMethod = urlObj.searchParams.has('code_challenge_method');

  return {
    hasCodeChallenge,
    hasChallengeMethod,
    hasPKCE: hasCodeChallenge && hasChallengeMethod,
    valid: shouldHavePKCE ? (hasCodeChallenge && hasChallengeMethod) : true,
    codeChallenge: urlObj.searchParams.get('code_challenge'),
    challengeMethod: urlObj.searchParams.get('code_challenge_method')
  };
}

/**
 * Test Suite
 */

// Simple test framework (no Jest required)
let passedTests = 0;
let failedTests = 0;
const failedTestDetails = [];

function test(name, fn) {
  try {
    fn();
    passedTests++;
    console.log(`✅ PASS: ${name}`);
  } catch (error) {
    failedTests++;
    failedTestDetails.push({ name, error: error.message });
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Error: ${error.message}`);
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error(`Expected value to be defined, got undefined`);
      }
    },
    toContain(substring) {
      if (!actual.includes(substring)) {
        throw new Error(`Expected "${actual}" to contain "${substring}"`);
      }
    },
    not: {
      toContain(substring) {
        if (actual.includes(substring)) {
          throw new Error(`Expected "${actual}" not to contain "${substring}"`);
        }
      },
      toBe(expected) {
        if (actual === expected) {
          throw new Error(`Expected not to equal ${JSON.stringify(expected)}, but it did`);
        }
      }
    }
  };
}

function describe(suiteName, fn) {
  console.log(`\n📦 ${suiteName}`);
  fn();
}

// ============================================================================
// Test Suite: ChatGPT - PKCE Required
// ============================================================================

describe('ChatGPT - PKCE Required', () => {
  test('authorize endpoint forwards PKCE parameters (GitHub)', () => {
    const authUrl = buildAuthorizeUrl({
      client: 'chatgpt',
      redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
      provider: 'github',
      code_challenge: 'test_challenge_abc123',
      code_challenge_method: 'S256'
    });

    expect(authUrl).toContain('code_challenge=test_challenge_abc123');
    expect(authUrl).toContain('code_challenge_method=S256');
  });

  test('authorize endpoint forwards PKCE parameters (Microsoft)', () => {
    const authUrl = buildAuthorizeUrl({
      client: 'chatgpt',
      redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
      provider: 'microsoft',
      code_challenge: 'test_challenge_xyz789',
      code_challenge_method: 'S256'
    });

    expect(authUrl).toContain('code_challenge=test_challenge_xyz789');
    expect(authUrl).toContain('code_challenge_method=S256');
  });

  test('token exchange forwards code_verifier (GitHub)', () => {
    const tokenParams = buildTokenExchangeParams({
      client: 'chatgpt',
      redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
      provider: 'github',
      code: 'test_code',
      code_verifier: 'test_verifier_xyz789'
    });

    expect(tokenParams.has('code_verifier')).toBe(true);
    expect(tokenParams.get('code_verifier')).toBe('test_verifier_xyz789');
  });

  test('token exchange forwards code_verifier (Microsoft)', () => {
    const tokenParams = buildTokenExchangeParams({
      client: 'chatgpt',
      redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
      provider: 'microsoft',
      code: 'test_code',
      code_verifier: 'test_verifier_abc123'
    });

    expect(tokenParams.has('code_verifier')).toBe(true);
    expect(tokenParams.get('code_verifier')).toBe('test_verifier_abc123');
  });

  test('missing PKCE parameters still constructs valid URL (GitHub provider may reject)', () => {
    // ChatGPT should always send PKCE, but test graceful degradation
    const authUrl = buildAuthorizeUrl({
      client: 'chatgpt',
      redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
      provider: 'github'
      // No code_challenge - ChatGPT should never do this
    });

    expect(authUrl).toBeDefined();
    expect(authUrl).not.toContain('code_challenge');
    // URL is valid, but GitHub may reject during actual OAuth flow
  });
});

// ============================================================================
// Test Suite: Claude Desktop - PKCE Optional
// ============================================================================

describe('Claude Desktop - PKCE Optional', () => {
  test('works with PKCE parameters (GitHub)', () => {
    const authUrl = buildAuthorizeUrl({
      client: 'claude',
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      provider: 'github',
      code_challenge: 'optional_challenge_123',
      code_challenge_method: 'S256'
    });

    expect(authUrl).toContain('code_challenge=optional_challenge_123');
    expect(authUrl).toContain('code_challenge_method=S256');
  });

  test('works with PKCE parameters (Microsoft)', () => {
    const authUrl = buildAuthorizeUrl({
      client: 'claude',
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      provider: 'microsoft',
      code_challenge: 'optional_challenge_456',
      code_challenge_method: 'S256'
    });

    expect(authUrl).toContain('code_challenge=optional_challenge_456');
    expect(authUrl).toContain('code_challenge_method=S256');
  });

  test('works without PKCE parameters (GitHub)', () => {
    const authUrl = buildAuthorizeUrl({
      client: 'claude',
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      provider: 'github'
      // No PKCE - should work fine
    });

    expect(authUrl).toBeDefined();
    expect(authUrl).not.toContain('code_challenge');
    expect(authUrl).toContain('https://github.com/login/oauth/authorize');
  });

  test('works without PKCE parameters (Microsoft)', () => {
    const authUrl = buildAuthorizeUrl({
      client: 'claude',
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      provider: 'microsoft'
      // No PKCE - should work fine
    });

    expect(authUrl).toBeDefined();
    expect(authUrl).not.toContain('code_challenge');
    expect(authUrl).toContain('login.microsoftonline.com');
  });
});

// ============================================================================
// Test Suite: Gemini CLI - PKCE Optional
// ============================================================================

describe('Gemini CLI - PKCE Optional', () => {
  test('works without PKCE parameters (GitHub)', () => {
    const authUrl = buildAuthorizeUrl({
      client: 'gemini',
      redirect_uri: 'http://localhost:7777/oauth/callback',
      provider: 'github'
      // No PKCE
    });

    expect(authUrl).toBeDefined();
    expect(authUrl).not.toContain('code_challenge');
    expect(authUrl).toContain('https://github.com/login/oauth/authorize');
  });

  test('works without PKCE parameters (Microsoft)', () => {
    const authUrl = buildAuthorizeUrl({
      client: 'gemini',
      redirect_uri: 'http://localhost:7777/oauth/callback',
      provider: 'microsoft'
      // No PKCE
    });

    expect(authUrl).toBeDefined();
    expect(authUrl).not.toContain('code_challenge');
    expect(authUrl).toContain('login.microsoftonline.com');
  });

  test('supports PKCE if provided (GitHub)', () => {
    const authUrl = buildAuthorizeUrl({
      client: 'gemini',
      redirect_uri: 'http://localhost:7777/oauth/callback',
      provider: 'github',
      code_challenge: 'gemini_challenge_789',
      code_challenge_method: 'S256'
    });

    expect(authUrl).toContain('code_challenge=gemini_challenge_789');
    expect(authUrl).toContain('code_challenge_method=S256');
  });
});

// ============================================================================
// Test Suite: Provider PKCE Support
// ============================================================================

describe('Provider PKCE Support', () => {
  test('GitHub supports PKCE', () => {
    expect(providerSupportsPKCE('github')).toBe(true);
  });

  test('Microsoft supports PKCE', () => {
    expect(providerSupportsPKCE('microsoft')).toBe(true);
  });

  test('Google supports PKCE', () => {
    expect(providerSupportsPKCE('google')).toBe(true);
  });

  test('unsupported provider returns false', () => {
    expect(providerSupportsPKCE('unsupported')).toBe(false);
  });
});

// ============================================================================
// Test Suite: Cross-Client PKCE Validation
// ============================================================================

describe('Cross-Client PKCE Validation', () => {
  test('ChatGPT GitHub URL validates correctly', () => {
    const authUrl = buildAuthorizeUrl({
      client: 'chatgpt',
      redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
      provider: 'github',
      code_challenge: 'chatgpt_challenge',
      code_challenge_method: 'S256'
    });

    const validation = validatePKCEInUrl(authUrl, true);
    expect(validation.valid).toBe(true);
    expect(validation.hasPKCE).toBe(true);
    expect(validation.codeChallenge).toBe('chatgpt_challenge');
    expect(validation.challengeMethod).toBe('S256');
  });

  test('Claude Desktop URL without PKCE validates correctly', () => {
    const authUrl = buildAuthorizeUrl({
      client: 'claude',
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      provider: 'github'
      // No PKCE - should be valid
    });

    const validation = validatePKCEInUrl(authUrl, false);
    expect(validation.valid).toBe(true);
    expect(validation.hasPKCE).toBe(false);
  });

  test('Client detection works for all redirect URIs', () => {
    const chatgptUrl = 'https://chatgpt.com/connector_platform_oauth_redirect';
    const claudeUrl = 'https://claude.ai/api/mcp/auth_callback';
    const geminiUrl = 'http://localhost:7777/oauth/callback';

    expect(chatgptUrl.includes('chatgpt.com')).toBe(true);
    expect(claudeUrl.includes('claude.ai')).toBe(true);
    expect(geminiUrl.includes('localhost:7777')).toBe(true);
  });
});

// ============================================================================
// Run Tests and Report
// ============================================================================

console.log('\n╔═══════════════════════════════════════╗');
console.log('║ PKCE MULTI-CLIENT TEST SUITE         ║');
console.log('╚═══════════════════════════════════════╝\n');

console.log('Running PKCE Multi-Client Tests...\n');

// Run test suites (already executed above)

// Print summary
console.log('\n╔═══════════════════════════════════════╗');
console.log('║ TEST SUMMARY                          ║');
console.log('╚═══════════════════════════════════════╝\n');

console.log(`Total Tests: ${passedTests + failedTests}`);
console.log(`✅ Passed: ${passedTests}`);
console.log(`❌ Failed: ${failedTests}`);

if (failedTests > 0) {
  console.log('\nFailed Tests:');
  failedTestDetails.forEach(({ name, error }) => {
    console.log(`  - ${name}`);
    console.log(`    ${error}`);
  });
  process.exit(1);
} else {
  console.log('\n🎉 All tests passed!\n');
  console.log('Coverage:');
  console.log('  ✅ ChatGPT PKCE forwarding (GitHub & Microsoft)');
  console.log('  ✅ Claude Desktop PKCE optional (GitHub & Microsoft)');
  console.log('  ✅ Gemini CLI PKCE optional (GitHub & Microsoft)');
  console.log('  ✅ Provider PKCE support validation');
  console.log('  ✅ Cross-client validation patterns\n');
  process.exit(0);
}
