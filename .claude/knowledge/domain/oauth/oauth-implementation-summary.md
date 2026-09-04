# OAuth Multi-Client Implementation Summary

> **⚠️ POST-WAVE-7 LOCATION MAP (2026-05-22)** — code referenced in this doc moved during Waves 3a/4/6/7:
> - **`detectOAuthClient`** (line 33 says `mcp-server-http-clean.js:602-628`): now `lib/auth/oauth/auth-manager.ts:AuthManager.detectOAuthClient` (Wave 3a Phase 3.8d). `CLIENT_PROVIDER_MAP` is in the same module.
> - **OAuth flow routes** (R7/R8/R9/R10): `lib/mcp/server/routes/oauth-flow-routes.ts` (Wave 6 Phase 6.4)
> - **OAuth discovery routes**: `lib/mcp/server/routes/oauth-discovery-routes.ts` (Wave 6 Phase 6.3)
> - **Token minting**: `lib/auth/token-manager.ts:mintMcpToken` (U2 Phase A consolidation)
> - **SessionStore**: `lib/auth/oauth/session-store.ts` (Wave 2)

## Success! 🎉
We successfully implemented OAuth authentication for multiple AI clients (ChatGPT, Gemini CLI, Claude) with unique GitHub OAuth apps for each.

## Implementation Details

### 1. ChatGPT OAuth ✅ FULLY WORKING
- **GitHub OAuth App**: Client ID `Ov23lifjCoFj7gtlIW2E`
- **Key Fixes Applied**:
  1. PKCE parameter forwarding in authorization
  2. code_verifier inclusion in token exchange
  3. Stateless mode detection for openai-mcp user agent
  4. Return 200 OK for DELETE requests
- **Status**: Desktop/Windows working with 26 authenticated tools
- **Known Issue**: Mobile app completes OAuth but doesn't persist tokens

### 2. Gemini CLI OAuth ✅ WORKING
- **GitHub OAuth App**: Client ID `Ov23liVv4beh4BFKIpBT`
- **Redirect URI**: `http://localhost:7777/oauth/callback`
- **Detection**: Based on redirect_uri pattern
- **Status**: Full OAuth with localhost redirect

### 3. Claude OAuth ✅ WORKING
- **Default OAuth App**: Fallback configuration
- **Modes**:
  - Persistent sessions for Claude Code
  - Stateless for Claude.ai browser
- **Status**: Working across all Claude platforms

## Technical Implementation

### Client Detection (mcp-server-http-clean.js:602-628)
```javascript
detectClientMode(req) {
  const userAgent = req.headers['user-agent'] || '';

  if (userAgent.includes('openai-mcp') || userAgent.toLowerCase().includes('chatgpt')) {
    return 'stateless'; // ChatGPT
  }
  if (userAgent.includes('claude-code')) {
    return 'persistent'; // Claude Code
  }
  if (userAgent.includes('Claude-User')) {
    return 'stateless'; // Claude.ai browser
  }

  return 'persistent'; // Default
}
```

### PKCE Implementation (Critical for ChatGPT)
```javascript
// Authorization (lines 786-792)
if (code_challenge) {
  githubAuthUrl.searchParams.set('code_challenge', code_challenge);
}
if (code_challenge_method) {
  githubAuthUrl.searchParams.set('code_challenge_method', code_challenge_method);
}

// Token Exchange (lines 865-868)
if (code_verifier) {
  params.append('code_verifier', code_verifier);
}
```

## Environment Configuration

### Required Environment Variables
```bash
# ChatGPT OAuth
CHATGPT_GITHUB_CLIENT_ID=Ov23lifjCoFj7gtlIW2E
CHATGPT_GITHUB_CLIENT_SECRET=<secret>

# Gemini CLI OAuth
GEMINI_GITHUB_CLIENT_ID=Ov23liVv4beh4BFKIpBT
GEMINI_GITHUB_CLIENT_SECRET=<secret>

# Claude OAuth (Default/Fallback)
GITHUB_CLIENT_ID=<default_id>
GITHUB_CLIENT_SECRET=<secret>
```

## Debugging Commands

### Monitor OAuth Flow
```bash
# Watch OAuth activity
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart-mcp -f | grep -E 'OAuth|ChatGPT|Gemini'"

# Check specific client connections
pm2 logs paichart-mcp --lines 100 | grep "CLIENT DETECTION"

# Verify tool availability
pm2 logs paichart-mcp --lines 50 | grep "Tool list request"
```

## Key Lessons Learned

1. **PKCE is Critical**: ChatGPT requires full PKCE flow with parameter forwarding
2. **Client Detection Matters**: Different clients need different session modes
3. **Stateless vs Persistent**: ChatGPT/mobile need stateless, desktop needs persistent
4. **Mobile App Limitations**: OAuth works but token persistence is client-side issue
5. **DELETE Handling**: Stateless clients send DELETE after auth - must return 200 OK

## Production Status

| Platform | OAuth Status | Tools Available | Notes |
|----------|--------------|-----------------|-------|
| ChatGPT Desktop/Windows | ✅ Working | 26 (authenticated) | Full functionality |
| ChatGPT Mobile | ⚠️ Partial | 19 (public only) | OAuth completes but tokens not persisted |
| Gemini CLI | ✅ Working | 26 (authenticated) | Localhost redirect working |
| Claude Code | ✅ Working | 26 (authenticated) | Persistent sessions |
| Claude.ai Browser | ✅ Working | 26 (authenticated) | Stateless mode |

## Files Modified

1. `/home/steve/copov15/mcp-server-http-clean.js` - Main OAuth implementation
2. `/home/steve/copov15/.env` - OAuth app credentials
3. `/home/steve/copov15/ecosystem.config.js` - PM2 configuration
4. `/.github/workflows/production-deploy.yml` - Deployment secrets

## Deployment

All changes are deployed to production at `<PROD_HOST>` (paichart.app) and working successfully.

## Next Steps

1. Monitor ChatGPT mobile app updates for token persistence fixes
2. Consider implementing refresh token flow for better session management
3. Add OAuth provider selection UI for better user experience