# OAuth Test Suite

Comprehensive test coverage for pAIchart's multi-client OAuth implementation.

## Test Files

### 1. `pkce-multi-client.test.js` - PKCE Multi-Client Tests

Tests PKCE (Proof Key for Code Exchange) parameter forwarding across all three AI clients.

**Coverage:**
- ChatGPT (PKCE required) - 5 tests
- Claude Desktop (PKCE optional) - 4 tests
- Gemini CLI (PKCE optional) - 3 tests
- Provider PKCE support - 4 tests
- Cross-client validation - 3 tests

**Total:** 19 tests

**Run:** `npm run test:pkce`

#### Test Suites

**ChatGPT - PKCE Required:**
- ✅ authorize endpoint forwards PKCE parameters (GitHub)
- ✅ authorize endpoint forwards PKCE parameters (Microsoft)
- ✅ token exchange forwards code_verifier (GitHub)
- ✅ token exchange forwards code_verifier (Microsoft)
- ✅ missing PKCE parameters still constructs valid URL

**Claude Desktop - PKCE Optional:**
- ✅ works with PKCE parameters (GitHub)
- ✅ works with PKCE parameters (Microsoft)
- ✅ works without PKCE parameters (GitHub)
- ✅ works without PKCE parameters (Microsoft)

**Gemini CLI - PKCE Optional:**
- ✅ works without PKCE parameters (GitHub)
- ✅ works without PKCE parameters (Microsoft)
- ✅ supports PKCE if provided (GitHub)

**Provider PKCE Support:**
- ✅ GitHub supports PKCE
- ✅ Microsoft supports PKCE
- ✅ Google supports PKCE
- ✅ unsupported provider returns false

**Cross-Client PKCE Validation:**
- ✅ ChatGPT GitHub URL validates correctly
- ✅ Claude Desktop URL without PKCE validates correctly
- ✅ Client detection works for all redirect URIs

### 2. `first-party-tokens.test.js` - First-Party Token Tests

Tests RS256 JWT minting, JWKS format, and ChatGPT-specific requirements.

**Coverage:**
- Token minting (RS256 algorithm, claims, signatures)
- Scope matching (string-for-string validation)
- Resource parameter handling
- JWKS format validation
- Token expiration
- Algorithm detection (RS256 vs HS256)
- ChatGPT-specific requirements

**Run:** `npm run test:oauth`

## Running Tests

### Run All OAuth Tests
```bash
npm test
```

### Run PKCE Tests Only
```bash
npm run test:pkce
```

### Run First-Party Token Tests Only
```bash
npm run test:oauth
```

### Run Individual Test File
```bash
node tests/oauth/pkce-multi-client.test.js
node tests/oauth/first-party-tokens.test.js
```

## Test Architecture

### Helper Functions

The PKCE test suite includes extracted helper functions from `mcp-server-http-clean.js`:

#### `buildAuthorizeUrl(params)`
Constructs OAuth authorization URL with PKCE parameters.

**Parameters:**
- `client` - Client name ('chatgpt', 'claude', 'gemini')
- `redirect_uri` - OAuth callback URL
- `provider` - OAuth provider ('github', 'microsoft', 'google')
- `scope` - OAuth scopes (optional)
- `code_challenge` - PKCE code challenge (optional)
- `code_challenge_method` - PKCE method (default: 'S256')
- `state` - OAuth state parameter (optional)

**Returns:** Complete authorization URL string

**Example:**
```javascript
const authUrl = buildAuthorizeUrl({
  client: 'chatgpt',
  redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
  provider: 'github',
  code_challenge: 'test_challenge_abc123',
  code_challenge_method: 'S256'
});
```

#### `buildTokenExchangeParams(params)`
Constructs token exchange parameters with PKCE code_verifier.

**Parameters:**
- `client` - Client name
- `code` - Authorization code
- `redirect_uri` - OAuth callback URL
- `code_verifier` - PKCE code verifier (optional)
- `provider` - OAuth provider (default: 'github')

**Returns:** URLSearchParams object

**Example:**
```javascript
const tokenParams = buildTokenExchangeParams({
  client: 'chatgpt',
  code: 'test_code',
  code_verifier: 'test_verifier_xyz789',
  redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
  provider: 'github'
});
```

#### `providerSupportsPKCE(provider)`
Checks if OAuth provider supports PKCE.

**Parameters:**
- `provider` - Provider name ('github', 'microsoft', 'google')

**Returns:** Boolean (true if PKCE supported)

**Example:**
```javascript
const supported = providerSupportsPKCE('github'); // true
```

#### `validatePKCEInUrl(url, shouldHavePKCE)`
Validates PKCE parameter presence in authorization URL.

**Parameters:**
- `url` - Authorization URL string
- `shouldHavePKCE` - Expected PKCE presence (boolean)

**Returns:** Validation result object

**Example:**
```javascript
const validation = validatePKCEInUrl(authUrl, true);
// Returns: { hasCodeChallenge, hasChallengeMethod, hasPKCE, valid, ... }
```

## Implementation References

### Source Code Locations

**Authorization Endpoint:**
- File: `mcp-server-http-clean.js`
- Lines: 1716-1808
- Handles: OAuth authorization requests, PKCE forwarding

**GitHub Authorization:**
- Lines: 1786-1801
- Forwards: code_challenge, code_challenge_method

**Microsoft Authorization:**
- Lines: 992-1011 (handleMicrosoftAuthorize)
- Forwards: code_challenge, code_challenge_method

**Token Exchange:**
- Lines: 1078-1090
- Forwards: code_verifier

## PKCE Requirements by Client

### ChatGPT
- **PKCE:** Required
- **Providers:** GitHub, Microsoft
- **Flow:** code_challenge → code_verifier
- **Failure Mode:** OAuth fails if PKCE missing

### Claude Desktop
- **PKCE:** Optional
- **Providers:** GitHub, Microsoft
- **Flow:** Works with or without PKCE
- **Stateful:** Session persistence

### Gemini CLI
- **PKCE:** Optional
- **Providers:** GitHub, Microsoft
- **Flow:** Works without PKCE, supports if provided
- **Stateless:** No session persistence

## Provider PKCE Support

| Provider | PKCE Support | Method | Notes |
|----------|-------------|--------|-------|
| GitHub | ✅ Yes | S256 | Optional but recommended |
| Microsoft | ✅ Yes | S256 | Optional, Azure AD supports |
| Google | ✅ Yes | S256 | Optional, recommended for public clients |

## Test Framework

Tests use a lightweight custom test framework (no Jest dependency):

```javascript
describe('Test Suite Name', () => {
  test('test description', () => {
    expect(actual).toBe(expected);
    expect(actual).toContain(substring);
    expect(actual).toBeDefined();
    expect(actual).not.toBe(unexpected);
  });
});
```

**Exit Codes:**
- `0` - All tests passed
- `1` - One or more tests failed

## CI/CD Integration

### GitHub Actions (Future)

Add to `.github/workflows/test.yml`:

```yaml
name: OAuth Tests

on: [push, pull_request]

jobs:
  oauth-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm run test:pkce
      - run: npm run test:oauth
```

## Regression Prevention

These tests prevent regressions of:

1. **ChatGPT PKCE Requirement** (Oct 19-20, 2025)
   - Tests ensure code_challenge/code_verifier always forwarded
   - Prevents "invalid OAuth flow" errors

2. **Scope String-For-String Matching** (Oct 19-20, 2025)
   - Tests ensure exact scope preservation
   - Prevents "permission not granted" errors

3. **Cross-Client Compatibility**
   - Tests ensure Claude/Gemini work without PKCE
   - Tests ensure provider detection correct

## Maintenance

### Adding New Tests

1. Add test to appropriate suite:
   ```javascript
   test('new test description', () => {
     // Test implementation
   });
   ```

2. Run tests locally:
   ```bash
   npm run test:pkce
   ```

3. Commit with descriptive message:
   ```bash
   git add tests/oauth/pkce-multi-client.test.js
   git commit -m "test(oauth): Add test for new PKCE scenario"
   ```

### Adding New OAuth Provider

When adding a new provider (e.g., Google):

1. Update `buildAuthorizeUrl()` with provider logic
2. Update `buildTokenExchangeParams()` with provider credentials
3. Add provider to `providerSupportsPKCE()`
4. Add test cases for the new provider
5. Run tests to verify

### Helper Function Updates

If OAuth implementation changes in `mcp-server-http-clean.js`:

1. Update corresponding helper function
2. Update line number references in comments
3. Run tests to verify compatibility
4. Update this README if behavior changes

## Related Documentation

- **Implementation Plan:** `/cline_docs/oauth-implementation-plan-focused.md`
- **OAuth Architecture:** `/cline_docs/oauth-architecture-clarification.md`
- **System Boundaries:** `/cline_docs/oauth-system-boundaries.md`
- **Specialist Agents:** `/.claude/agents/oauth-multi-client-specialist.md`

## Success Criteria

- ✅ All 19 PKCE tests pass
- ✅ ChatGPT PKCE forwarding validated
- ✅ Claude/Gemini optional PKCE validated
- ✅ Provider PKCE support validated
- ✅ Zero false positives
- ✅ Zero false negatives
- ✅ 100% coverage of PKCE scenarios

## Questions or Issues?

For OAuth-related questions or test failures:

1. Review implementation plan: `/cline_docs/oauth-implementation-plan-focused.md`
2. Check specialist knowledge: `/.claude/agents/oauth-multi-client-specialist.md`
3. Run discovery: `/cline_docs/discovery-prompts/oauth-multi-client-discovery.md`
4. Ask oauth-multi-client-specialist for guidance

---

**Last Updated:** 2025-10-23
**Status:** ✅ All tests passing
**Coverage:** 19 PKCE tests, ChatGPT/Claude/Gemini clients, GitHub/Microsoft providers
