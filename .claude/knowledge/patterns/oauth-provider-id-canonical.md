# OAuth Provider ID Canonical Pattern

**Confidence**: 98% ✅✅
**Created**: 2026-02-10
**Pattern**: Use OAuth provider ID as canonical identity, never match by email

---

## Problem

Email-based user matching allows account takeover (email reuse, collisions, deleted users).

## Pattern

**Match ONLY by provider ID**:
```javascript
// ❌ VULNERABLE (email OR clause)
const whereConditions = [
  { oauthProvider: 'github', oauthProviderId: '123' },
  { email: 'user@example.com' } // ← Allows email matching
];
let user = await findFirst({ where: { OR: whereConditions } });

// ✅ SECURE (provider ID only)
let user = await findFirst({
  where: {
    oauthProvider: 'github',
    oauthProviderId: '123' // ← Only canonical ID
  }
});
```

## Enforcement

**Database unique constraint**:
```prisma
model User {
  @@unique([oauthProvider, oauthProviderId])
}
```

## Why Provider ID is Canonical

- **Immutable**: Provider IDs never change
- **Unique**: One user per provider
- **Verified**: Cryptographically validated by OAuth provider
- **Email can**: Change, be reused, collide across providers

## Detection Grep

```bash
# Find vulnerable email-primary lookups — BOTH paths (MCP .js + WEB .ts).
# The old `**/*.js` glob missed the web path (oauth-service.ts) entirely.
grep -rn "findFirst.*OR.*email.*oauth\|OR:.*whereConditions.*email" lib/auth/oauth/*.js lib/auth/oauth/oauth-service.ts
# Web-path canonical check: createOrUpdateUser must NOT lead with email findUnique
grep -n "findUnique({ where: { email: userInfo.email }" lib/auth/oauth/oauth-service.ts  # expect: only the gated !existingUser link fallback
```

## Applied at (both OAuth paths)

- **MCP path** (`mcp-oauth-validator.js`): canonical since 2026-02-10. Matches by `(oauthProvider, oauthProviderId)`; email is a gated cross-provider link fallback.
- **Web path** (`oauth-service.ts` `createOrUpdateUser`): adopted in **Wave 2, 2026-06-21** (commit `ed615ebe`). Previously matched by email `findUnique` (the vulnerable shape). Now provider-id-first with the same gated email-link fallback. Regression-pinned in `scripts/test-security-invariants.ts` section H (negative-controlled).

## Evidence

- **Vulnerability**: 2026-02-10 (CVSS 8.5), MCP path
- **Fix (MCP)**: lib/auth/oauth/mcp-oauth-validator.js (provider-id match + cross-provider link)
- **Fix (Web)**: lib/auth/oauth/oauth-service.ts createOrUpdateUser (Wave 2, 2026-06-21, commit ed615ebe)
- **Tests**: scripts/test-oauth-security.ts (Test 1, Test 3); scripts/test-security-invariants.ts §H (web provider-id pin)
