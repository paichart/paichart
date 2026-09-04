# Handler-Level Authorization Pattern

**Pattern ID**: #30
**Category**: Security / Authorization
**Created**: 2026-01-31 (Phase 3 Post-Implementation)
**Confidence**: 92% (sec-ops-specialist validated)
**Status**: Production-proven (pov.create implementation)

---

## When to Use

### ✅ Use Handler-Level Authorization When:

**Complex Permission Logic**:
- Resource-specific checks (ownership, team membership, region)
- Multiple conditions must be evaluated
- Permissions vary by resource context

**Future Flexibility Needed**:
- Today: ADMIN-only
- Tomorrow: Team leads may get access
- Future: Complex approval workflows

**Action-Specific Rules**:
- Different actions need different permissions
- Same tool (perform(action: "execute")) routes to multiple actions
- Each action has unique security requirements

---

### ❌ Use Tool-Level Authorization (ADMIN_TOOLS) When:

**Simple Role-Based Access**:
- ADMIN-only, no exceptions
- No resource-specific checks needed
- No future flexibility required

**System Administration Functions**:
- User management (all users)
- System configuration (global settings)
- Pure administrative operations

**Static Permissions**:
- Role never changes per resource
- No ownership checks
- Binary yes/no access

---

## Example: pov.create (Production Implementation)

### Why Handler-Level Was Chosen

**File**: `lib/mcp/tasks/action/handlers/pov/pov-create-handler.ts:151`

```typescript
export async function handlePOVCreate(parameters, user, actionId) {
  // Handler-level authorization (not tool-level)
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
    throw new Error(
      `🔒 Admin Access Required: Creating POVs via MCP requires ADMIN role. ` +
      `Your role: ${user.role}. Contact an administrator to create POVs.`
    );
  }

  // POV creation logic...
}
```

**Why Not in ADMIN_TOOLS**:

**Current Requirement** (2026):
- Only ADMIN can create POVs

**Future Flexibility** (potential enhancements):
- Regional managers create POVs in their theatre
- Team leads create POVs for their team
- Automated POV creation with approval workflow
- Trial users create 1 demo POV

**With Handler-Level**: ✅ Easy to add
```typescript
// Future enhancement (just update handler):
const canCreate = user.role === 'ADMIN' ||
                  user.role === 'REGIONAL_MANAGER' ||
                  (user.role === 'TEAM_LEAD' && isInTeam(user, parameters.teamId));
```

**With Tool-Level**: ❌ Impossible
```javascript
// Would need to add all roles to ADMIN_TOOLS (wrong!)
ADMIN_TOOLS = ['perform(action: "execute")'];  // Too broad - blocks ALL actions
```

---

## Implementation Pattern

### 2-Layer Defense Architecture

**Layer 1: Tool-Level Authentication** (`tool-security.js`)
```javascript
// Allow authenticated users to call the tool
AUTHENTICATED_TOOLS = ['perform(action: "execute")'];

function enforceToolSecurity(toolName, context) {
  if (!context?.user?.id) {
    throw new Error('Authentication required');
  }
  // User is authenticated, allow tool call
  return true;
}
```

**Layer 2: Handler-Level Authorization** (action handler)
```typescript
// Check if THIS specific action is allowed for THIS user
export async function handlePOVCreate(parameters, user, actionId) {
  // Authorization check
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
    throw new Error('Admin Access Required: Creating POVs requires ADMIN role');
  }

  // Action logic
  const pov = await createPOV(...);
  return pov;
}
```

**Security Flow**:
```
User → perform(action: "execute", action: 'pov.create', ...)
  ↓
  Tool-Security Layer: Authenticated? ✅
  ↓
  Action Router: Route to pov-create-handler
  ↓
  Handler Authorization Layer: Role === ADMIN? ✅
  ↓
  Execute Action: Create POV
```

---

## Benefits

### 1. **Fine-Grained Control**
- Different actions, different permissions
- Same tool (`perform(action: "execute")`) routes to 14 actions
- Each action has appropriate security

**Example**:
- `task.create`: Any authenticated user ✅
- `task.update`: Task assignee or owner ✅
- `task.assign`: Team lead or owner ✅
- `pov.create`: RolePermission-table gate (ADMIN+USER, DEMO blocked — 2026-05-25 ed74e8ce) ✅

**With tool-level**: All 14 actions would have SAME permission (wrong!)

---

### 2. **Future-Proof**
Handler-level supports evolution:

**Today** (2026):
```typescript
if (user.role !== 'ADMIN') throw new Error('Admin required');
```

**Tomorrow** (2027 - team-based POVs):
```typescript
const canCreate = user.role === 'ADMIN' ||
                  (user.role === 'REGIONAL_MANAGER' && user.region === parameters.region);
```

**Future** (2028 - approval workflows):
```typescript
const canCreate = user.role === 'ADMIN' ||
                  await hasApprovalWorkflowCompleted(user, parameters);
```

---

### 3. **Single Enforcement Point**
- One place to update: The action handler
- No need to modify tool-security.js
- No need to modify multiple files
- Easy to audit (grep for 'pov.create')

---

### 4. **Resource-Aware**
Handler has full context:

```typescript
function handlePOVCreate(parameters, user, actionId) {
  // Can check:
  // - user.role (who they are)
  // - parameters.region (what they're creating)
  // - user.permissions (custom permissions)
  // - await checkQuota(user) (usage limits)

  // Tool-level only knows:
  // - user.role (that's it!)
}
```

---

## Anti-Pattern: Tool-Level for Complex Authorization

**DON'T DO THIS**:
```javascript
// WRONG: Adding action-specific tool to ADMIN_TOOLS
ADMIN_TOOLS = [
  'perform(action: "execute")',  // Too broad - blocks ALL 14 actions!
  'create_pov',           // Redundant - just use perform(action: "execute")
];
```

**Problems**:
- Blocks all actions (task.create, task.update, etc.)
- Duplicates routing logic
- Can't evolve permissions
- Multiple enforcement points (confusion)

---

## Real-World Comparison

### Handler-Level (pAIchart Pattern)

**perform(action: "execute") Actions**:
| Action | Permission | Enforcement |
|--------|-----------|-------------|
| task.create | Authenticated | handler checks auth |
| task.update | Owner or assignee | handler checks ownership |
| task.assign | Team lead or owner | handler checks team membership |
| pov.create | ADMIN+USER (table-driven) | handler calls checkPermission(PoV, CREATE) |
| agent.execute | Authenticated | handler checks auth |

**Flexibility**: Each action has appropriate security ✅

---

### Tool-Level (Alternative Pattern)

**Separate Tools**:
| Tool | Permission | Enforcement |
|------|-----------|-------------|
| create_task | Authenticated | tool-security.js |
| update_task | Authenticated | tool-security.js + handler ownership |
| assign_task | Authenticated | tool-security.js + handler team check |
| create_pov | ADMIN | ADMIN_TOOLS array |

**Problems**:
- 14 separate tools (instead of 1 tool + 14 actions)
- Still need handler-level checks (ownership, team)
- Harder to maintain (more files)
- Can't reuse routing logic

**pAIchart chose handler-level for maintainability** ✅

---

## Security Validation

**sec-ops-specialist Analysis** (Jan 31, 2026):
- Security Score: 92/100 (Excellent)
- Bypass Paths: 0 found (tested 4 attack vectors)
- Pattern Confidence: 90%

**Attack Vectors Tested**:
1. ✅ Direct database manipulation - Mitigated (Prisma, transactions)
2. ✅ Web API route bypass - Mitigated (different security model)
3. ✅ Action name manipulation - Mitigated (whitelist validation)
4. ✅ Role manipulation - Mitigated (JWT signature validation)

**Verdict**: Handler-level authorization is **SECURE** ✅

---

## Implementation Checklist

When implementing handler-level authorization:

**Planning**:
- [ ] Identify action needing authorization
- [ ] Determine permission logic (role? ownership? team?)
- [ ] Consider future flexibility needs
- [ ] Choose handler-level vs tool-level

**Implementation**:
- [ ] Add authorization check at handler start (before business logic)
- [ ] Use descriptive error messages (explain why blocked)
- [ ] Log authorization decisions (audit trail)
- [ ] Document security rationale in handler comments

**Testing**:
- [ ] Test authorized user succeeds
- [ ] Test unauthorized user blocked
- [ ] Test edge cases (missing role, invalid user)
- [ ] Test future scenarios (if planning flexibility)

**Documentation**:
- [ ] Document in handler file (security comment block)
- [ ] Update action documentation (explain who can execute)
- [ ] Add to security audit checklist

---

## Code Examples

### Pattern 1: Simple Role Check

```typescript
// For simple ADMIN-only actions
export async function handleAdminAction(parameters, user, actionId) {
  // Authorization: ADMIN or SUPER_ADMIN only
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
    throw new Error('Admin access required for this action');
  }

  // Business logic
  return await performAction(parameters);
}
```

---

### Pattern 2: Ownership Check

```typescript
// For actions requiring resource ownership
export async function handleUpdateTask(parameters, user, actionId) {
  const task = await prisma.task.findUnique({
    where: { id: parameters.taskId },
    include: { assignee: true, pov: { include: { owner: true } } }
  });

  // Authorization: Owner, assignee, or ADMIN
  const isOwner = task.pov.ownerId === user.id;
  const isAssignee = task.assigneeId === user.id;
  const isAdmin = user.role === 'ADMIN';

  if (!isOwner && !isAssignee && !isAdmin) {
    throw new Error('Insufficient permissions: Only task owner, assignee, or admin can update');
  }

  // Business logic
  return await updateTask(task, parameters);
}
```

---

### Pattern 3: Team Membership Check

```typescript
// For actions requiring team membership
export async function handleTeamAction(parameters, user, actionId) {
  const team = await prisma.team.findUnique({
    where: { id: parameters.teamId },
    include: { members: true }
  });

  // Authorization: Team member or ADMIN
  const isMember = team.members.some(m => m.userId === user.id);
  const isAdmin = user.role === 'ADMIN';

  if (!isMember && !isAdmin) {
    throw new Error('Team membership required for this action');
  }

  // Business logic
  return await performTeamAction(team, parameters);
}
```

---

### Pattern 4: Complex Multi-Condition

```typescript
// For actions with complex permission logic
export async function handleComplexAction(parameters, user, actionId) {
  // Authorization: Multiple conditions
  const canExecute =
    user.role === 'ADMIN' ||  // Admins always can
    (user.role === 'REGIONAL_MANAGER' && user.region === parameters.region) ||  // Regional managers in their region
    (user.role === 'TEAM_LEAD' && await isTeamMember(user, parameters.teamId)) ||  // Team leads in their team
    await hasSpecialPermission(user, 'complex_action');  // Custom permissions

  if (!canExecute) {
    throw new Error('Insufficient permissions for this action');
  }

  // Business logic
  return await performComplexAction(parameters);
}
```

---

## Comparison to Other Patterns

### vs. Middleware-Based Authorization

**Middleware Pattern**:
```typescript
// Authorization middleware (runs before handler)
app.use('/api/pov/create', requireAdmin);

function requireAdmin(req, res, next) {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin required' });
  }
  next();
}
```

**Handler-Level Pattern**:
```typescript
// Authorization in handler (single enforcement point)
export async function handlePOVCreate(parameters, user, actionId) {
  if (user.role !== 'ADMIN') {
    throw new Error('Admin required');
  }
  // Business logic
}
```

**Trade-offs**:
- Middleware: Better for HTTP APIs (route-based)
- Handler: Better for action-based APIs (action routing)
- pAIchart uses: Handler-level for MCP, middleware for web API

---

## Related Patterns

**Pattern #28**: `withPOVAccess` middleware (POV isolation)
- Use for: Ensuring user has POV access
- Enforcement: Middleware wraps handler
- Scope: POV-level authorization

**Pattern #29**: OAuth token minting (not passthrough)
- Use for: External service authentication
- Enforcement: Token generation layer
- Scope: Trust-level based token exposure

**Pattern #30**: Handler-level authorization (this pattern)
- Use for: Action-specific permissions
- Enforcement: Handler function start
- Scope: Action-level authorization

---

## Testing Strategy

**Security Tests** (recommended):

```typescript
describe('pov.create Handler-Level Authorization', () => {
  it('should block DEMO_USER from creating POVs', async () => {
    const demoUser = { id: 'user123', role: 'DEMO_USER', email: 'demo@test.com' };

    await expect(
      handlePOVCreate({ title: 'Test POV', description: 'Test' }, demoUser, 'action123')
    ).rejects.toThrow('Admin Access Required');
  });

  it('should allow ADMIN to create POVs', async () => {
    const adminUser = { id: 'admin123', role: 'ADMIN', email: 'admin@test.com' };

    const result = await handlePOVCreate({
      title: 'Test POV',
      description: 'Test',
      countryName: 'Australia'
    }, adminUser, 'action456');

    expect(result.success).toBe(true);
    expect(result.pov.title).toBe('Test POV');
  });

  it('should allow SUPER_ADMIN to create POVs', async () => {
    const superAdmin = { id: 'super123', role: 'SUPER_ADMIN', email: 'super@test.com' };

    const result = await handlePOVCreate({
      title: 'Test POV',
      description: 'Test',
      countryName: 'Australia'
    }, superAdmin, 'action789');

    expect(result.success).toBe(true);
  });
});
```

---

## Migration Guide

### Moving from Tool-Level to Handler-Level

**Before** (tool-level):
```javascript
// tool-security.js
ADMIN_TOOLS = ['create_pov', 'delete_user'];

// Handler just does business logic
async function handleCreatePOV(parameters) {
  return await prisma.pOV.create({ data: parameters });
}
```

**After** (handler-level):
```javascript
// tool-security.js
AUTHENTICATED_TOOLS = ['perform(action: "execute")'];

// Handler checks authorization
async function handlePOVCreate(parameters, user, actionId) {
  // Authorization
  if (user.role !== 'ADMIN') {
    throw new Error('Admin required');
  }

  // Business logic
  return await prisma.pOV.create({ data: parameters });
}
```

**Benefits**:
- More flexible (can evolve permissions)
- Better error messages (context-aware)
- Single enforcement point (easier to audit)

---

## Best Practices

### 1. **Check Authorization FIRST**
```typescript
export async function handleAction(parameters, user, actionId) {
  // ✅ GOOD: Check auth before ANY business logic
  if (!canExecute(user)) {
    throw new Error('Unauthorized');
  }

  // Business logic
  return await doWork(parameters);
}

// ❌ BAD: Check after business logic started
export async function handleAction(parameters, user, actionId) {
  const data = await fetchData(parameters);  // Leak: Fetched before auth check!

  if (!canExecute(user)) {
    throw new Error('Unauthorized');
  }

  return data;
}
```

---

### 2. **Descriptive Error Messages**
```typescript
// ✅ GOOD: Explains WHY blocked and HOW to proceed
throw new Error(
  `🔒 Admin Access Required: Creating POVs via MCP requires ADMIN role. ` +
  `Your role: ${user.role}. Contact an administrator to create POVs.`
);

// ❌ BAD: Generic error
throw new Error('Unauthorized');
```

---

### 3. **Log Authorization Decisions**
```typescript
export async function handleAction(parameters, user, actionId) {
  // Log authorization decision (audit trail)
  authLogger.info({ action: 'pov.create', userId: user.id, role: user.role }, 'Authorization check');

  if (user.role !== 'ADMIN') {
    authLogger.warn({ action: 'pov.create', role: user.role }, 'Authorization denied');
    throw new Error('Admin required');
  }

  authLogger.info({ action: 'pov.create', role: user.role }, 'Authorization granted');
  // Business logic
}
```

---

### 4. **Transaction-Safe**
```typescript
export async function handleAction(parameters, user, actionId) {
  // Authorization check OUTSIDE transaction
  if (user.role !== 'ADMIN') {
    throw new Error('Admin required');
  }

  // Transaction AFTER auth check (don't start transaction for unauthorized users)
  return await prisma.$transaction(async (tx) => {
    // Business logic with rollback safety
    const pov = await tx.pOV.create({ data: parameters });
    const team = await tx.team.create({ data: { povId: pov.id } });
    return { pov, team };
  });
}
```

---

## Security Considerations

### Defense-in-Depth Layers

**Layer 1**: Tool-level authentication (tool-security.js)
- Blocks: Unauthenticated users
- Allows: Authenticated users (pass to Layer 2)

**Layer 2**: Handler-level authorization (action handler)
- Blocks: Unauthorized roles
- Allows: Authorized roles (pass to Layer 3)

**Layer 3**: Input validation (Zod schemas)
- Blocks: Invalid input
- Allows: Valid input (pass to Layer 4)

**Layer 4**: Resource validation (business logic)
- Blocks: Non-existent resources
- Allows: Valid resources (execute action)

**All layers must pass** for action to succeed ✅

---

### Bypass Path Prevention

**Potential Bypasses** (all mitigated):

**1. Direct Database Access**:
- Mitigation: Prisma client only accessible server-side
- Handler always runs (can't bypass to direct DB)

**2. Web API Route**:
- Mitigation: Web API has DIFFERENT security model (intentional)
- MCP admin !== Web admin (separate authorization)

**3. Action Name Manipulation**:
- Mitigation: Action whitelist validation (router level)
- Invalid actions rejected before handler

**4. Role Manipulation**:
- Mitigation: JWT signature validation
- Role claim tamper-proof (verified by token-manager.ts)

**Security Score**: 92/100 (sec-ops validated) ✅

---

## When NOT to Use This Pattern

**Use tool-level instead when**:

**1. No Future Flexibility Needed**:
- Action will ALWAYS be ADMIN-only (no evolution)
- Example: `system_config` (global system settings)

**2. Simple Binary Permission**:
- ADMIN yes, everyone else no
- No resource-specific checks
- No complex conditions

**3. Tool-Specific Function**:
- Tool only does ONE thing
- Not an action router
- Example: `manage_users` (if it only manages users)

**pAIchart's Choice**:
- perform(action: "execute"): Handler-level (14 actions, complex permissions) ✅
- Future manage_users: Tool-level (simple ADMIN-only) ✅

---

## Production Evidence

**File**: `lib/mcp/tasks/action/handlers/pov/pov-create-handler.ts`

**Lines 151-156** (actual production code):
```typescript
if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
  throw new Error(
    `🔒 Admin Access Required: Creating POVs via MCP requires ADMIN role. ` +
    `Your role: ${user.role}. Contact an administrator to create POVs.`
  );
}
```

**Production Stats**:
- Deployed: 2025-12-18
- Usage: ADMIN POV creation via MCP
- Security: 0 bypasses reported
- Maintenance: 0 changes needed (stable pattern)

---

## Summary

**Pattern**: Handler-level authorization for action-specific permissions

**Use When**:
- Complex permission logic
- Future flexibility needed
- Action-based routing
- Resource-specific checks

**Benefits**:
- Fine-grained control
- Single enforcement point
- Future-proof
- Resource-aware

**Security**: 92/100 (sec-ops validated)

**Status**: Production-proven pattern ✅

---

**Pattern #30**: Handler-Level Authorization
**Confidence**: 92% (sec-ops-specialist)
**Status**: Production-ready
**Related**: Pattern #28 (withPOVAccess), Pattern #29 (OAuth token minting)
