# API Security Patterns

**Last Updated**: November 6, 2025
**Context**: POV Domain Security Implementation

---

## 🔒 withPOVAccess Middleware Pattern

### Overview

The `withPOVAccess` middleware provides automatic authentication, POV loading, and tenant isolation for all POV-scoped endpoints.

**Location**: `lib/auth/validate-pov-access.ts` (line 367)

**Benefits**:
- ✅ Eliminates 60-70% boilerplate per route
- ✅ Consistent security enforcement
- ✅ Automatic tenant isolation
- ✅ Performance optimization (POV loaded once)
- ✅ Clean, readable code

---

### Basic Usage

**Before** (Manual Pattern - ~35 lines):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { prisma } from '@/lib/prisma';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';

export async function GET(
  request: NextRequest,
  { params }: { params: { povId: string } }
) {
  // Manual authentication (5 lines)
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Manual POV loading (18 lines)
  const pov = await prisma.pOV.findUnique({
    where: { id: params.povId },
    select: {
      id: true,
      ownerId: true,
      metadata: true,
      team: {
        select: {
          members: {
            select: { userId: true, user: { select: { id: true } } }
          }
        }
      }
    }
  });

  if (!pov) {
    return NextResponse.json({ error: 'POV not found' }, { status: 404 });
  }

  // Manual access validation (12 lines)
  try {
    validatePOVAccess(user, pov, { throwOnDeny: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Access denied" },
      { status: 403 }
    );
  }

  // Business logic (finally!)
  const data = await someService.getData(params.povId);
  return NextResponse.json(data);
}
```

**After** (withPOVAccess Pattern - ~15 lines):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { withPOVAccess } from '@/lib/auth/validate-pov-access';

export const GET = withPOVAccess(async (
  request: NextRequest,
  { params, user, pov }
) => {
  // user and pov already validated! ✅

  // Business logic immediately
  const data = await someService.getData(params.povId);
  return NextResponse.json(data);
});
```

**Reduction**: ~20 lines eliminated (57% fewer lines)

---

### Complementary Helpers (April 2026)

`withPOVAccess` handles **single-POV gating** (routes with `[povId]` in the path). Two complementary helpers handle other POV access patterns:

#### `buildPOVAccessFilter(user)` — Multi-POV list filtering
**File**: `lib/pov/auth/pov-access-filter.ts`
**Use when**: Dashboard, analytics, or list endpoints that query across multiple POVs
**Returns**: Prisma WHERE clause scoped to user's accessible POVs

```typescript
import { buildPOVAccessFilter } from '@/lib/pov/auth/pov-access-filter';

const accessWhere = buildPOVAccessFilter(user);
const povs = await prisma.pOV.findMany({ where: { ...accessWhere, status: 'ACTIVE' } });

// For nested filtering (tasks by accessible POVs):
const tasks = await prisma.task.findMany({ where: { pov: accessWhere } });

// With admin flag for conditional sub-queries:
import { buildPOVAccessFilterWithRole } from '@/lib/pov/auth/pov-access-filter';
const { filter, isAdmin } = buildPOVAccessFilterWithRole(user);
```

**Used by**: 9 endpoints (dashboards, analytics, agent-executions, POV list, launch list, global activities, MCP resources)

#### `getPOVForAccess(povId)` — Direct POV lookup for access validation
**File**: `lib/tasks/helpers/pov-access.ts`
**Use when**: Handler needs POV + team members for `validatePOVAccess()` or `checkPermission()`

```typescript
import { getPOVForAccess } from '@/lib/tasks/helpers/pov-access';

const pov = await getPOVForAccess(povId);
if (!pov) throw new Error('PoV not found');
validatePOVAccess(user, pov, { throwOnDeny: true, logContext: 'My Handler' });
```

**Used by**: 6 call sites across task handlers (create, update, get, list, assignee, direct create)

#### When to use which

| Pattern | Use when | Returns |
|---------|----------|---------|
| `withPOVAccess` | Route has `[povId]`, needs middleware wrapper | Injected `user` + `pov` context |
| `buildPOVAccessFilter` | List/dashboard endpoint querying multiple POVs | Prisma WHERE clause |
| `getPOVForAccess` | Handler has `povId`, needs POV for `validatePOVAccess` | POV object with team |
| `getTaskWithPOV` | Handler has `taskId`, needs POV via task relation | Task with nested POV |

---

### Handler Context

The middleware injects a validated context object:

```typescript
{
  params: {
    povId: string;
    [key: string]: string;  // Other params (phaseId, stageId, etc.)
  };
  user: TokenPayload;  // Authenticated user
  pov: POV & {         // Loaded POV with team members
    team?: {
      members: Array<{
        id: string;
        userId: string;
        role: string;
      }>;
    } | null;
  };
}
```

**Available immediately**:
- `user.userId` - Authenticated user ID
- `user.email` - User email
- `user.role` - User role (USER, ADMIN, etc.)
- `pov.id` - POV ID
- `pov.title` - POV title
- `pov.ownerId` - POV owner
- `pov.team.members` - Team members (preloaded)

---

### Advanced Usage

#### With Additional Validation

```typescript
export const POST = withPOVAccess(async (request, { params, user, pov }) => {
  // Parse and validate request body
  const body = await request.json();
  const validation = CreatePhaseSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json({
      error: 'Validation failed',
      details: validation.error.errors
    }, { status: 400 });
  }

  // Business logic with validated data
  const phase = await phaseService.create(validation.data);
  return NextResponse.json(phase, { status: 201 });
});
```

#### With Rate Limiting

```typescript
export const GET = withPOVAccess(async (request, { params, user, pov }) => {
  // Rate limiting check
  const rateCheck = await checkRateLimit(user.userId, 'export', 10, 3600);
  if (!rateCheck.allowed) {
    return NextResponse.json({
      error: 'Rate limit exceeded',
      resetInMinutes: rateCheck.resetInMinutes
    }, { status: 429 });
  }

  // Business logic
  const data = await exportService.export(pov);
  return NextResponse.json(data);
});
```

#### With Additional Authorization

```typescript
export const DELETE = withPOVAccess(async (request, { params, user, pov }) => {
  // Additional authorization check (beyond POV access)
  if (!canManagePhases(user, pov)) {
    return NextResponse.json({
      error: 'Insufficient permissions to delete phases'
    }, { status: 403 });
  }

  // Business logic
  await phaseService.delete(params.phaseId);
  return NextResponse.json({ success: true });
});
```

---

### When to Use withPOVAccess

**Use withPOVAccess when**:
- ✅ Route has `povId` in params
- ✅ Need to validate user access to POV
- ✅ Need POV data in handler (title, owner, team, etc.)
- ✅ Want to eliminate auth boilerplate

**Don't use withPOVAccess when**:
- ❌ Route doesn't have `povId` param (e.g., /api/pov/agent/roles)
- ❌ Public endpoints (no authentication needed)
- ❌ Different access pattern needed (e.g., admin-only)

**For these cases**: Use `getAuthUser` + custom validation

---

### Error Handling

The middleware automatically handles:

**401 Unauthorized**:
- User not authenticated (no valid token)
- Returned by middleware

**404 Not Found**:
- POV doesn't exist
- Returned by middleware

**403 Forbidden**:
- User doesn't have access to POV (validatePOVAccess fails)
- Returned by middleware
- Logged for security audit

**Your handler only needs to handle**:
- 400 Bad Request (validation errors)
- 500 Internal Server Error (business logic errors)

---

### Performance Considerations

**Single Database Query**:
```typescript
// withPOVAccess loads POV with team members in ONE query:
const pov = await prisma.pOV.findUnique({
  where: { id: params.povId },
  include: {
    team: {
      include: {
        members: {
          select: { id: true, userId: true, role: true }
        }
      }
    }
  }
});
```

**Cached in Request Context**:
- POV is loaded once per request
- Available to handler without additional query
- ~20-30ms saved per request

---

### Security Audit Logging

The middleware automatically logs:

**Access Granted**:
```
[SECURITY_AUDIT] {
  "timestamp": "2025-11-06T...",
  "userId": "user-id",
  "role": "USER",
  "resourceType": "POV",
  "resourceId": "pov-id",
  "accessGranted": true,
  "accessPath": {
    "isOwner": true,
    "isTeamMember": false,
    "isDemo": false,
    "isSameTenant": false
  },
  "context": "withPOVAccess [GET /api/pov/...]"
}
```

**Access Denied**:
```
[SECURITY_AUDIT] {
  ...
  "accessGranted": false,
  ...
}
```

**Use for**:
- Security incident response
- Audit compliance (SOC 2)
- Attack pattern detection

---

### Migration Guide

**Step 1**: Import withPOVAccess
```typescript
import { withPOVAccess } from '@/lib/auth/validate-pov-access';
```

**Step 2**: Change function signature
```typescript
// Before:
export async function GET(request, { params }) {

// After:
export const GET = withPOVAccess(async (request, { params, user, pov }) => {
```

**Step 3**: Remove auth boilerplate
```typescript
// Remove these lines:
const user = await getAuthUser(request);
if (!user) return ...;

const pov = await prisma.pOV.findUnique(...);
if (!pov) return ...;

validatePOVAccess(user, pov, ...);
```

**Step 4**: Keep business logic
```typescript
// Keep all business logic unchanged
const data = await service.process(params.povId);
return NextResponse.json(data);
```

**Step 5**: Close with });
```typescript
// Before:
}  // End of function

// After:
});  // End of withPOVAccess wrapper
```

**Step 6**: Remove unused imports
```typescript
// If getAuthUser, prisma, validatePOVAccess not used elsewhere:
// Remove from imports
```

**Time per route**: 5-10 minutes

---

### Examples from Production

#### Example 1: Simple GET Endpoint

```typescript
// app/api/pov/[povId]/progress/route.ts
export const GET = withPOVAccess(async (request, { pov }) => {
  const progress = await calculatePOVProgress(pov.id);
  return NextResponse.json({ progress });
});
```

#### Example 2: POST with Validation

```typescript
// app/api/pov/[povId]/phase/route.ts
export const POST = withPOVAccess(async (request, { params, user, pov }) => {
  const body = await request.json();

  const validation = createPhaseSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({
      error: 'Validation failed',
      details: validation.error.errors
    }, { status: 400 });
  }

  const phase = await createPhaseHandler(validation.data, user, pov);
  return NextResponse.json(phase, { status: 201 });
});
```

#### Example 3: DELETE with Authorization

```typescript
// app/api/pov/[povId]/phase/[phaseId]/route.ts
export const DELETE = withPOVAccess(async (request, { params, user, pov }) => {
  // Additional authorization
  if (!canManagePhases(user, pov)) {
    return NextResponse.json({
      error: 'Insufficient permissions'
    }, { status: 403 });
  }

  await phaseService.delete(params.phaseId);
  return NextResponse.json({ success: true });
});
```

#### Example 4: Complex Business Logic

```typescript
// app/api/pov/[povId]/import/route.ts
export const POST = withPOVAccess(async (request, { params, user, pov }) => {
  const data = await request.json();

  // Validation
  const validation = ImportPOVSchema.safeParse(data);
  if (!validation.success) {
    povLogger.warn({
      userId: user.userId,
      errors: validation.error.errors,
    }, 'POV import validation failed');
    return NextResponse.json({
      error: 'Validation failed',
      details: validation.error.errors
    }, { status: 400 });
  }

  // Security logging
  povLogger.info({
    userId: user.userId,
    povId: pov.id,
    phaseCount: validation.data.phases?.length || 0,
  }, 'Starting POV import');

  // Complex business logic
  const result = await importExportService.importPOVUpdates(
    validation.data,
    user.userId,
    validation.data.options || {}
  );

  return NextResponse.json(result);
});
```

---

## 🎯 Best Practices

### 1. Validate Input Even with Middleware

```typescript
// withPOVAccess handles auth/access, but YOU validate business logic:
export const POST = withPOVAccess(async (request, { user, pov }) => {
  const body = await request.json();

  // Always validate input!
  const validation = YourSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({
      error: 'Validation failed',
      details: validation.error.errors
    }, { status: 400 });
  }

  // Use validated data
  const result = await process(validation.data);
  return NextResponse.json(result);
});
```

### 2. Log Security Events

```typescript
export const POST = withPOVAccess(async (request, { user, pov }) => {
  // Log sensitive operations (pino structured logging)
  povLogger.info({
    userId: user.userId,
    povId: pov.id,
    severity: 'HIGH',  // For sensitive operations
  }, 'Operation started');

  // Business logic
  const result = await sensitiveOperation();

  povLogger.info({ povId: pov.id }, 'Operation completed successfully');
  return NextResponse.json(result);
});
```

### 3. Add Rate Limiting for Expensive Operations

```typescript
import { checkRateLimit } from '@/lib/middleware/rate-limit';

export const GET = withPOVAccess(async (request, { user, pov }) => {
  // Rate limit expensive operations
  const rateCheck = checkRateLimit(user.userId, 'operation-name', 10, 3600);
  if (!rateCheck.allowed) {
    return NextResponse.json({
      error: 'Rate limit exceeded',
      message: `Maximum 10 operations per hour`
    }, { status: 429 });
  }

  // Expensive operation
  const data = await expensiveQuery();
  return NextResponse.json(data);
});
```

### 4. Additional Authorization Checks

```typescript
export const DELETE = withPOVAccess(async (request, { user, pov }) => {
  // withPOVAccess ensures user has POV access
  // Add additional role/permission checks:

  if (!canPerformAction(user, pov, 'delete-phase')) {
    return NextResponse.json({
      error: 'Insufficient permissions for this action'
    }, { status: 403 });
  }

  await performAction();
  return NextResponse.json({ success: true });
});
```

---

## 🔍 Validation Patterns

### XSS Prevention

```typescript
import { detectPromptInjection } from '@/lib/security/prompt-injection-prevention';

const schema = z.object({
  title: z.string()
    .max(200)
    // ✅ CORRECT: lambda form returns boolean (.isSafe)
    // ❌ WRONG (old bug): .refine(detectPromptInjection, {}) — returns object, always truthy, NO protection
    .refine((val) => detectPromptInjection(val).isSafe, {
      message: 'Title contains invalid characters or potential injection patterns'
    }),
});
```

**Blocks**: 31 XSS patterns including `<script>`, `<img onerror>`, `javascript:`, etc.

### DoS Prevention

```typescript
const schema = z.object({
  description: z.string().max(5000),  // Field length limit
  items: z.array(z.object({ ... })).max(20),  // Array size limit
  phases: z.array(z.object({ ... })).max(20),  // Nested array limit
});
```

### CUID Enforcement

```typescript
import { POVId, OptionalCUID } from '@/lib/validation/id-validation';

const schema = z.object({
  povId: POVId,  // Required CUID
  phaseId: OptionalCUID('phaseId'),  // Optional CUID
});
```

**Rejects**: UUID format (550e8400-...)
**Accepts**: CUID format (cl9n5q9k1...)

---

## 📊 Security Checklist for New Endpoints

When creating a new POV-scoped endpoint:

- [ ] Use `withPOVAccess` middleware (if povId in params)
- [ ] Create/use Zod validation schema
- [ ] Add `.refine(detectPromptInjection)` to text fields
- [ ] Add `.max()` limits to strings and arrays (DoS prevention)
- [ ] Use `OptionalCUID()` for all ID fields
- [ ] Use `PrismaEnum.*` for enum fields (not hardcoded)
- [ ] Add security logging for sensitive operations
- [ ] Add rate limiting for expensive operations
- [ ] Test with XSS payloads, oversized data, invalid IDs
- [ ] Run `npm run test:all-validation` (should pass)

---

## 🎯 Common Patterns

### Create Operation

```typescript
export const POST = withPOVAccess(async (request, { user, pov }) => {
  const body = await request.json();
  const validation = CreateSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json({
      error: 'Validation failed',
      details: validation.error.errors
    }, { status: 400 });
  }

  const entity = await service.create(validation.data, user, pov);
  return NextResponse.json(entity, { status: 201 });
});
```

### Update Operation

```typescript
export const PUT = withPOVAccess(async (request, { params, user, pov }) => {
  const body = await request.json();
  const validation = UpdateSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json({
      error: 'Validation failed',
      details: validation.error.errors
    }, { status: 400 });
  }

  const entity = await service.update(params.entityId, validation.data);
  return NextResponse.json(entity);
});
```

### Delete Operation

```typescript
export const DELETE = withPOVAccess(async (request, { params, user, pov }) => {
  // Check for dependencies
  const dependencies = await checkDependencies(params.entityId);
  if (dependencies.length > 0) {
    return NextResponse.json({
      error: `Cannot delete: ${dependencies.length} dependencies exist`
    }, { status: 409 });
  }

  await service.delete(params.entityId);
  return NextResponse.json({ success: true });
});
```

### List Operation with Filters

```typescript
export const GET = withPOVAccess(async (request, { pov }) => {
  const { searchParams } = new URL(request.url);

  // Validate query parameters
  const filters = {
    status: searchParams.get('status'),
    priority: searchParams.get('priority'),
  };

  const validation = FilterSchema.safeParse(filters);
  if (!validation.success) {
    return NextResponse.json({
      error: 'Invalid filters',
      details: validation.error.errors
    }, { status: 400 });
  }

  const entities = await service.list(pov.id, validation.data);
  return NextResponse.json({ data: entities });
});
```

---

## 🔧 Troubleshooting

### Middleware Returns 401

**Cause**: User not authenticated
**Fix**: Ensure valid JWT token in Authorization header

### Middleware Returns 404

**Cause**: POV doesn't exist
**Fix**: Verify POV ID is correct

### Middleware Returns 403

**Cause**: User doesn't have access to POV
**Fix**: Check that user is owner, team member, or has other access

### TypeScript Error: Property 'user' does not exist

**Cause**: Incorrect function signature
**Fix**:
```typescript
// Wrong:
export const GET = withPOVAccess(async (request, params) => {

// Correct:
export const GET = withPOVAccess(async (request, { params, user, pov }) => {
```

### withPOVAccess not found

**Cause**: Missing import
**Fix**:
```typescript
import { withPOVAccess } from '@/lib/auth/validate-pov-access';
```

---

## 📚 Related Documentation

- **Middleware Implementation**: lib/auth/validate-pov-access.ts (line 367)
- **Validation Patterns**: lib/validation/pov.ts
- **Security Functions**: lib/security/prompt-injection-prevention.ts
- **POV Domain Audit**: cline_docs/reviews/pov-domain-security-audit-2025-11-04/

---

**Created**: 2025-11-06
**Last Updated**: 2025-11-06
**Status**: Production-ready pattern

**Use this pattern for all new POV-scoped endpoints!**
