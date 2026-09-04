# JWT Audience Architecture - pAIchart

**Updated**: 2026-01-30 (Component 5 deployed)
**Status**: Production
**Security Score**: 95/100

---

## Standard Audiences (Current)

| Audience | Purpose | Algorithm | Status |
|----------|---------|-----------|--------|
| `https://paichart.app/api` | Web/API operations | RS256 | ✅ Active |
| `https://paichart.app/mcp` | MCP operations | RS256 + HS256 | ✅ Active |
| `paichart-api` | Old Web tokens | RS256 | ⚠️ Deprecated (sunset Jul 5, 2026) |
| `paichart-app` | Old API keys | HS256 | ⚠️ Deprecated (sunset Jul 5, 2026) |

---

## Security Boundaries

**Token Isolation**:
- MCP tokens (aud=/mcp) → MCP operations only
- API tokens (aud=/api) → Web/API operations only
- Prevents token reuse attacks (RFC 9068)

**Validation**:
- RS256 path: Validates audience in token payload
- HS256 path: Validates audience + issuer (added Component 5)
- Both paths enforce resource boundaries

---

## RFC Compliance

- ✅ **RFC 8707**: Resource Indicators for OAuth 2.0 (MCP uses resource URL)
- ✅ **RFC 9068**: JWT Profile for OAuth 2.0 (audience-restricted tokens)
- ✅ **OIDC Core 1.0**: Proper audience claim validation

---

## Implementation Details

**Token Generation**:
```typescript
// Web/API (token-manager.ts)
.setAudience('https://paichart.app/api')

// MCP OAuth (mcp-server-http-clean.js)
.setAudience('https://paichart.app/mcp')

// API Keys (apiKeyService.ts)
.setAudience('https://paichart.app/mcp')
```

**Validation** (both RS256 and HS256):
```typescript
const validAudiences = [
  'https://paichart.app/api',
  'https://paichart.app/mcp',
  'paichart-api',     // Deprecated
  'paichart-app'      // Deprecated
];
```

---

## Migration History

**2026-01-30**: Discovered audience mismatch (MCP tokens rejected)
**2026-01-30**: Deployed Component 5 (resource-specific audiences)
**2026-07-05**: Remove deprecated audiences (scheduled cleanup)

---

**See Also**:
- Implementation: `cline_docs/reviews/phase-3-jwt-enhancements-2026-01-24/`
- Root cause: `cline_docs/audience-mismatch-analysis.md`
