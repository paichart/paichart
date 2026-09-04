# API Handler Anti-Patterns Discovery

**Purpose**: Detect common anti-patterns in API route handlers
**Time**: 15-20 minutes
**Created**: November 26, 2025
**Based On**: P1 POV Routes Implementation (Redundant User Fetching)

---

## Problem Patterns

### Anti-Pattern #1: Redundant User Fetching

**Symptoms**:
- Type errors: `AuthUser | null not assignable to TokenPayload`
- Double authentication calls (performance waste)
- Inconsistent user object types

**Root Cause**:
- `createHandler` with `requireAuth: true` provides `user` as 3rd parameter
- Developer adds `getAuthUser(req)` thinking they need to fetch user
- Two different user objects: `TokenPayload` (from createHandler) vs `AuthUser` (from getAuthUser)

**Impact**: Type errors, redundant database queries, confusion

---

## Discovery Commands

### Step 1: Find Redundant User Fetching (5 min)

```bash
echo "=== Anti-Pattern #1: Redundant User Fetching ==="

# Find routes with BOTH createHandler + requireAuth + getAuthUser
for file in $(find app/api -name "route.ts" -type f); do
  has_handler=$(grep -c "createHandler" "$file" 2>/dev/null || echo 0)
  has_require=$(grep -c "requireAuth.*true" "$file" 2>/dev/null || echo 0)
  has_getauth=$(grep -c "const.*= await getAuthUser(req)" "$file" 2>/dev/null || echo 0)

  if [ "$has_handler" -gt 0 ] && [ "$has_require" -gt 0 ] && [ "$has_getauth" -gt 0 ]; then
    echo "❌ REDUNDANT: $file"
    echo "   Fix: Remove getAuthUser call, use user parameter from createHandler"
  fi
done

# Expected: 0 instances (all should be fixed)
```

### Step 2: Verify Correct Patterns (5 min)

```bash
echo "=== Correct Pattern: createHandler with user parameter ==="

# Find routes correctly using createHandler's user parameter
grep -r "createHandler" app/api --include="*.ts" -A 3 | \
  grep "user?: TokenPayload" | \
  sed 's/.*app/app/' | \
  sed 's/-.*//' | \
  sort -u

# Example correct usage:
# async (req: NextRequest, context, user?: TokenPayload) => {
#   validatePOVAccess(user!, pov, {});
# }
```

### Step 3: Find Missing User Parameter (5 min)

```bash
echo "=== Routes missing user parameter (should add it) ==="

# Find createHandler routes without user parameter
for file in $(grep -rl "createHandler" app/api --include="*.ts"); do
  if grep -q "requireAuth.*true" "$file" 2>/dev/null; then
    if ! grep -q "user?: TokenPayload" "$file" 2>/dev/null; then
      echo "⚠️ MISSING: $file"
      echo "   Add: user?: TokenPayload as 3rd parameter"
    fi
  fi
done

# These should add user parameter to use it
```

---

## Anti-Pattern #2: Incorrect User Type Assertions

### Step 4: Find user! Assertions Without requireAuth (5 min)

```bash
echo "=== Unsafe user! assertions ==="

# Find user! used without requireAuth: true
for file in $(grep -rl "user!" app/api --include="*.ts"); do
  if ! grep -q "requireAuth.*true" "$file" 2>/dev/null; then
    echo "❌ UNSAFE: $file"
    echo "   user! without requireAuth can crash at runtime"
  fi
done

# user! is only safe when requireAuth: true guarantees user exists
```

---

## Anti-Pattern #3: Mixing Auth Patterns

### Step 5: Find Inconsistent Auth Patterns (5 min)

```bash
echo "=== Inconsistent auth patterns in same file ==="

# Find files with BOTH createHandler AND manual getAuthUser
for file in $(find app/api -name "route.ts" -type f); do
  has_handler=$(grep -c "createHandler" "$file" 2>/dev/null || echo 0)
  has_manual=$(grep -c "export async function GET\|export async function POST" "$file" 2>/dev/null || echo 0)

  if [ "$has_handler" -gt 0 ] && [ "$has_manual" -gt 0 ]; then
    echo "⚠️ MIXED: $file"
    echo "   Has both createHandler and manual exports - pick one pattern"
  fi
done

# File should use EITHER createHandler OR manual pattern, not both
```

---

## Correct Patterns

### Pattern A: Using createHandler (Recommended)

**When to use**: Routes needing auth, role checks, consistent error handling

```typescript
import createHandler from '@/lib/api-handler';
import { UserRole, TokenPayload } from '@/lib/types/auth';

export const POST = createHandler(
  async (
    req: NextRequest,
    context: { params: Record<string, string> },
    user?: TokenPayload  // ✅ Provided by createHandler
  ) => {
    // ✅ Use user parameter (no getAuthUser call needed)
    const userId = user!.userId;  // Safe because requireAuth: true

    // Your logic here
  },
  {
    requireAuth: true,
    allowedRoles: [UserRole.USER, UserRole.ADMIN]
  }
);
```

**Benefits**:
- Automatic auth handling
- Type-safe user object
- Consistent error responses
- Role-based access built-in

---

### Pattern B: Manual Auth (Alternative)

**When to use**: Routes needing custom auth logic or different response formats

```typescript
import { getAuthUser } from '@/lib/auth/get-auth-user';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // ✅ Manual auth when NOT using createHandler
  const user = await getAuthUser(req);

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Your logic here
}
```

**Benefits**:
- Full control over auth flow
- Custom error handling
- No middleware overhead

---

## Decision Tree

**Which pattern to use?**

```
Does route use createHandler?
├─ YES
│  └─ Does it have requireAuth: true?
│     ├─ YES → Use user parameter (3rd arg), don't call getAuthUser ✅
│     └─ NO → Either add requireAuth or call getAuthUser manually
└─ NO
   └─ Call getAuthUser(req) manually ✅
```

---

## Prevention Checklist

Before adding auth to a route:
- [ ] Check if route uses `createHandler`
- [ ] If yes, check if `requireAuth: true` exists
- [ ] If yes, add `user?: TokenPayload` as 3rd parameter
- [ ] DON'T call `getAuthUser(req)` - it's redundant
- [ ] Use `user!` for assertions (safe with requireAuth)

---

## Fix Checklist

When you find redundant user fetching:

1. **Remove redundant call**:
   ```diff
   - const user = await getAuthUser(req);
   ```

2. **Add user parameter**:
   ```diff
   - async (req: NextRequest, context) => {
   + async (req: NextRequest, context, user?: TokenPayload) => {
   ```

3. **Add TokenPayload import**:
   ```diff
   - import { UserRole } from '@/lib/types/auth';
   + import { UserRole, TokenPayload } from '@/lib/types/auth';
   ```

4. **Remove getAuthUser import** (if unused):
   ```diff
   - import { getAuthUser } from '@/lib/auth/get-auth-user';
   ```

5. **Verify user! assertions** (safe with requireAuth: true):
   ```typescript
   validatePOVAccess(user!, pov, {});  // OK
   ```

---

## Testing

After fixes:

```bash
# 1. Verify no type errors
npm run build

# 2. Check no redundant patterns remain
grep -r "createHandler" app/api --include="*.ts" -l | \
  while read f; do
    if grep -q "requireAuth.*true" "$f" && \
       grep -q "getAuthUser(req)" "$f"; then
      echo "Still has redundancy: $f"
    fi
  done

# Expected: No output (all fixed)
```

---

## Success Criteria

- [ ] No routes with createHandler + requireAuth + getAuthUser
- [ ] All createHandler routes with requireAuth have user parameter
- [ ] No type errors related to user/TokenPayload/AuthUser
- [ ] Build successful
- [ ] All routes follow consistent pattern (A or B, not mixed)

---

## Related Documentation

- `boundary-contract-specialist.md` - Learning note about this anti-pattern
- `lib/api-handler.ts` - createHandler implementation
- `lib/auth/get-auth-user.ts` - Manual auth function

---

**Discovery Complete** ✅
**Use Case**: API route auth pattern validation
**Time**: 15-20 minutes
**Frequency**: When adding auth to routes, before quarterly reviews
