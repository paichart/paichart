# OAuth Phantom User Detection Pattern

**Confidence**: 96% ✅✅
**Created**: 2026-02-10
**Pattern**: Detect stale Prisma connection cache returning deleted users

---

## Problem

Prisma `findFirst()` with connection pooling (pgbouncer transaction-mode) can return deleted users from stale cache, allowing "phantom user" authentication.

## Pattern

**Double-check with PRIMARY KEY lookup**:
```javascript
// Step 1: Find user (may return stale cache)
let user = await tx.user.findFirst({
  where: { oauthProvider: 'github', oauthProviderId: '123' }
});

// Step 2: Verify with PRIMARY KEY (bypasses cache)
if (user) {
  const verifyUser = await tx.user.findUnique({
    where: { id: user.id }
  });

  if (!verifyUser) {
    logger.error(`Phantom user detected: ${user.id}`);
    user = null; // Force user creation
  }
}
```

## Why It Works

- `findFirst()` → Can use stale connection cache
- `findUnique()` with PRIMARY KEY → Forces fresh DB lookup
- Detects deleted users before authentication

## Detection Grep

```bash
# Find findFirst lookups not paired with a findUnique phantom-verify — BOTH paths.
# Both MCP (.js) and WEB (oauth-service.ts) now have phantom detection (web added
# #4 2026-06-21). NOTE: this is a LINE-based grep — oauth-service.ts's findFirst is
# on its own line with the verify findUnique a few lines BELOW, so it still appears
# as a hit; that is a grep limitation, not a gap — check the lines below for the
# verify ('Phantom user from stale cache') before treating any hit as vulnerable.
grep -n "findFirst" lib/auth/oauth/*.js lib/auth/oauth/oauth-service.ts | grep -v "findUnique"
```

## Evidence

- **Bug**: 2026-02-10 phantom user (CVSS 8.5)
- **Fix**: lib/auth/oauth/mcp-oauth-validator.js:320-360
- **Tests**: scripts/test-oauth-security.ts (Test 2)
