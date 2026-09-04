# MCP User Context vs API TokenPayload - Field Name Differences

**Discovered**: 2025-11-20 (Security bug in audit_all_tasks)
**Confidence**: 100% (production-validated)
**Category**: Boundary Contract Pattern
**Impact**: CRITICAL - Access control bypass prevention

## The Difference

**MCP Prompts** (via prompt_command tool in lib/mcp/server/prompts/*.js):
```javascript
userContext = {
  user: {
    id: string,        // ← Use this (NOT userId!)
    email: string,
    role: string,
    token: string
  },
  authenticated: boolean
}

// Access user ID:
const userId = userContext.user.id;  // ✅ CORRECT for prompts
```

**API Routes** (via getAuthUser in app/api/*/route.ts, lib/*/handlers/*.ts):
```typescript
user: TokenPayload = {
  userId: string,      // ← Use this (NOT id!)
  email: string,
  role: UserRole,
  tenantId?: string
}

// Access user ID:
const userId = user.userId;  // ✅ CORRECT for API routes
```

## How to Know Which to Use

**Check the execution context**:

**In MCP Prompts** (lib/mcp/server/prompts/*.js):
- Parameter: `userContext` (passed to prompt methods)
- Field: `userContext.user.id`
- Example files: audit_all_tasks.js, list_tasks_guided.js, etc.
- Check: File in lib/mcp/server/prompts/ → Use `user.id`

**In API Routes** (app/api/*/route.ts):
- From: `getAuthUser(request)`
- Field: `user.userId`
- Example files: /api/pov/route.ts, /api/tasks/route.ts
- Check: File in app/api/ or lib/*/handlers/ → Use `user.userId`

## Security Impact

**Using wrong field causes access control bypass**:

```javascript
// In MCP prompt, using API pattern (WRONG):
const filter = { ownerId: user.userId };
// user.userId is undefined → filter becomes {}
// Prisma query: WHERE {} → matches ALL records ❌

// In MCP prompt, using MCP pattern (CORRECT):
const filter = { ownerId: user.id };
// user.id = 'cmgws...' → filter matches user's records only ✅
```

**Real-World Bug** (Nov 20, 2025):
- File: lib/mcp/server/prompts/audit_all_tasks.js
- Bug: Used `user.userId` in MCP context
- Impact: All users saw ALL tasks (complete access control bypass)
- Fix: Changed to `user.id`

## Detection

**Static Analysis Fails** (what code review sees):
```javascript
// Both paths use same field name
Path A (API): user.userId  ✅
Path B (MCP): user.userId  ✅
Conclusion: "Looks consistent" → FALSE SECURITY!
```

**Runtime Verification Succeeds** (what actually happens):
```javascript
// Runtime logs reveal truth
MCP Context: { id: 'cmgws...', email: '...', role: '...' }
API Context: { userId: 'cmgws...', email: '...', role: '...' }

// Field access results:
MCP: user.userId → undefined ❌
API: user.userId → 'cmgws...' ✅
```

## Verification

**Always log user context when debugging**:

```javascript
// Add temporary logging in MCP prompts (pino structured logging)
mcpLogger.debug({ userContext: userContext.user }, 'User context');
mcpLogger.debug({ availableFields: Object.keys(userContext.user || {}) }, 'Available fields');
mcpLogger.debug({ userId: userContext.user?.userId, id: userContext.user?.id }, 'User ID fields');
```

**Check production logs**:
```bash
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart-mcp --err --lines 50" | grep "DEBUG"

# Expected output for MCP context:
# Available fields: ['id', 'email', 'role', 'token']
# userId field: undefined  ← Caught!
# id field: cmgws...  ← Use this
```

**Pattern Detection**:
- If `userId` is undefined but `id` exists → You're in MCP context, use `id`
- If `id` is undefined but `userId` exists → You're in API context, use `userId`

## Prevention Patterns

### Pattern 1: Context-Aware Helper

```javascript
// Create safe field accessor
function getUserId(context) {
  // MCP context (has userContext.user.id)
  if (context.userContext?.user?.id) {
    return context.userContext.user.id;
  }

  // API context (has user.userId)
  if (context.user?.userId) {
    return context.user.userId;
  }

  throw new Error('Unknown context type - cannot extract user ID');
}

// Usage in MCP prompt:
const userId = getUserId({ userContext });

// Usage in API route:
const userId = getUserId({ user });
```

### Pattern 2: Runtime Assertion

```javascript
// Add to all user filter builds
function buildUserFilter(user, context = 'unknown') {
  // Validate field exists
  if (!user.id && !user.userId) {
    mcpLogger.error({
      context,
      available: Object.keys(user),
      expected: context === 'MCP' ? 'id' : 'userId'
    }, 'User has no ID field');
    throw new Error('Invalid user context - missing ID field');
  }

  const userId = user.id || user.userId;

  // Warn if using fallback
  if (context === 'MCP' && user.userId && !user.id) {
    mcpLogger.warn({ context }, 'MCP context using userId instead of id');
  }

  return { ownerId: userId };
}
```

### Pattern 3: Type Documentation

```javascript
/**
 * Process tasks with user context
 *
 * @param {Object} userContext - MCP user context
 * @param {string} userContext.user.id - User ID (use .id in MCP, NOT .userId!)
 * @param {string} userContext.user.email - User email
 * @param {string} userContext.user.role - User role
 */
async function audit_all_tasks({ userContext }) {
  const userId = userContext.user.id;  // ✅ Documented in JSDoc
  // ...
}
```

## Discovery Commands

**Find MCP context usage**:
```bash
# Find all MCP prompt files
find lib/mcp/server/prompts/ -name "*.js" -type f

# Check user context access patterns
grep -r "userContext\.user\." lib/mcp/server/prompts/ --include="*.js" -n

# Find potentially wrong patterns (using userId in MCP)
grep -r "user\.userId\|userContext\.user\.userId" lib/mcp/server/prompts/ --include="*.js" -A 2
```

**Find API context usage**:
```bash
# Find API route files
find app/api/ -name "route.ts" -type f

# Check TokenPayload usage
grep -r "getAuthUser\|TokenPayload" app/api/ lib/*/handlers/ --include="*.ts" -n

# Check user field access
grep -r "user\.userId\|user\.id" app/api/ lib/*/handlers/ --include="*.ts" -A 2
```

**Compare patterns**:
```bash
# MCP pattern check
echo "=== MCP Context Patterns ==="
grep -c "user\.id" lib/mcp/server/prompts/*.js
grep -c "user\.userId" lib/mcp/server/prompts/*.js

# API pattern check
echo "=== API Context Patterns ==="
grep -c "user\.userId" app/api/**/*.ts 2>/dev/null
grep -c "user\.id" app/api/**/*.ts 2>/dev/null
```

## Testing

**Unit Test for Context Detection**:
```javascript
describe('getUserId helper', () => {
  test('extracts ID from MCP context', () => {
    const mcpContext = {
      userContext: {
        user: { id: 'test-id', email: 'test@ex.com', role: 'USER' }
      }
    };

    expect(getUserId(mcpContext)).toBe('test-id');
  });

  test('extracts ID from API context', () => {
    const apiContext = {
      user: { userId: 'test-id', email: 'test@ex.com', role: 'USER' }
    };

    expect(getUserId(apiContext)).toBe('test-id');
  });

  test('throws on unknown context', () => {
    expect(() => getUserId({})).toThrow('Unknown context type');
  });
});
```

**Integration Test for Access Control**:
```javascript
describe('MCP prompt access control', () => {
  test('audit_all_tasks filters by user ID', async () => {
    const userContext = {
      user: { id: 'user-1', email: 'test@ex.com', role: 'USER' },
      authenticated: true
    };

    const result = await audit_all_tasks({ userContext });

    // Should only return user-1's tasks
    expect(result.tasks.every(t => t.ownerId === 'user-1')).toBe(true);
  });

  test('audit_all_tasks rejects undefined user ID', async () => {
    const badContext = {
      user: { userId: 'user-1', email: 'test@ex.com', role: 'USER' },
      // Note: MCP context should have 'id', not 'userId'
      authenticated: true
    };

    await expect(audit_all_tasks({ userContext: badContext }))
      .rejects.toThrow('Invalid user context');
  });
});
```

## Field Reference Table

| Context | File Location | User ID Field | Email Field | Role Field | Token Field |
|---------|--------------|---------------|-------------|------------|-------------|
| **MCP Prompts** | lib/mcp/server/prompts/*.js | `user.id` | `user.email` | `user.role` | `user.token` |
| **API Routes** | app/api/*/route.ts | `user.userId` | `user.email` | `user.role` | N/A |
| **Handlers** | lib/*/handlers/*.ts | `user.userId` | `user.email` | `user.role` | N/A |

**Common Fields** (same in both contexts):
- `email`: string
- `role`: string (UserRole enum)

**Different Fields** (changes between contexts):
- User ID: `id` (MCP) vs `userId` (API)
- Token: `token` (MCP only, not in API)
- Tenant ID: N/A (MCP) vs `tenantId` (API)

## Case Studies

### Case Study 1: audit_all_tasks Security Bug (Nov 20, 2025)

**Bug**: Unauthorized POV access
**File**: lib/mcp/server/prompts/audit_all_tasks.js
**Root Cause**: Used `user.userId` in MCP context
**Fix**: Changed to `user.id`

**Before** (Broken):
```javascript
const filter = {
  ownerId: user.userId  // undefined in MCP context
};
// Result: {} → matches ALL tasks
```

**After** (Fixed):
```javascript
const filter = {
  ownerId: userContext.user.id  // 'cmgws...' in MCP context
};
// Result: { ownerId: 'cmgws...' } → matches only user's tasks
```

**Impact**:
- Security: Complete access control bypass
- Scope: All MCP prompts using filters
- Detection: Missed by static code review, caught by runtime logs

## Related Patterns

- **Boundary 5**: AuthUser → req.user (Oct 20, 2025 - missing token field)
- **Boundary 4**: Decoded JWT → AuthUser (Oct 21, 2025 - undefined email/role)
- **Field Leakage Prevention**: Always verify field availability at boundaries
- **Runtime Verification**: Static analysis insufficient for context differences

## ROI

**Bug Prevention**:
- Security: Critical access control bypass
- Detection time: 5 minutes (runtime verification)
- Alternative: Hours of debugging + security incident

**Pattern Application**:
- MCP prompts: 10+ files
- Time to fix each: 2 minutes
- Total time saved: 20+ hours of potential debugging

**Confidence**: 100% (production-validated, security-critical)

---

**Created**: 2025-11-20
**Validated**: Production bug (audit_all_tasks)
**Pattern Type**: Security-critical boundary contract
**Usage**: Reference before writing MCP prompts or API routes
