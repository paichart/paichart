# Authorization Architecture: Dual-Layer Model (Future Reference)

**Created**: November 7, 2025
**Context**: Documenting relationship between validatePOVAccess and checkPermission
**Purpose**: Future reference for implementing granular permissions if needed
**Example File**: /lib/tasks/handlers/task.ts
**Operational Import1**: import { ResourceAction, ResourceType, UserRole } from '@/lib/types/auth';
**Operational Import2**: import { checkPermission } from '@/lib/auth/permissions';
**Ownership Import**: import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
---

## 🏛️ Current Architecture (Single Layer - Ownership-Based)

### **What We Have Now** (Post P0-1 Fix)

**Authorization System**: `validatePOVAccess` (ownership-based)
**Location**: `lib/auth/validate-pov-access.ts`

**Access Granted If** (additive - ANY condition grants access):
1. **isOwner**: `pov.ownerId === user.userId`
2. **isTeamMember**: User in `pov.team.members`
3. **isDemo**: `pov.metadata.isDemo === true` (DEMO_USER support)
4. **isSameTenant**: `pov.metadata.tenantId === user.tenantId` (future multi-tenant)
5. **isAdmin**: `user.role === ADMIN` or `SUPER_ADMIN`

**Philosophy**: "If you have access to the POV, you can manage everything in it"

**Used By**: 27 files (all task, POV, phase, stage operations)

---

## 🔐 The Other System (Role-Based Permissions)

### **What Still Exists** (checkPermission)

**Authorization System**: `checkPermission` (role-based)
**Location**: `lib/auth/permissions.ts`

**Access Granted If** (database-driven):
```sql
SELECT enabled FROM role_permissions
WHERE role = 'DEMO_USER'
  AND resourceType = 'pov'
  AND action = 'edit'
  AND enabled = true
```

**Philosophy**: "Your role determines what operations you can perform system-wide"

**Used By**: Few files (POV/phase creation, some admin operations)

---

## 🤔 Why We Removed checkPermission from Task Operations

### **Historical Context**

**Before** (Prior to Oct 2025):
- Task operations used `checkPermission` (role-based)
- Required `role_permissions` table entries
- Example: DEMO_USER needed `task->create` permission

**Problem Discovered** (Nov 7, 2025):
- DEMO_USER had permissions but still couldn't edit tasks
- Inconsistency: CREATE used `checkPermission`, UPDATE/DELETE used `validatePOVAccess`
- Confusion: "I own the POV but can't create tasks in it?"

**Solution Applied** (P0-1):
- Aligned ALL task operations to `validatePOVAccess`
- Removed `checkPermission` from task handlers
- Now: Ownership/team membership determines access (not role)

**Result**:
- ✅ Consistent authorization model
- ✅ Better UX (POV ownership = full control)
- ✅ Team collaboration enabled
- ✅ DEMO_USER works everywhere

---

## ⚖️ Are They Compatible? YES!

### **They Serve Different Purposes**

**validatePOVAccess**: Resource-level access
- "Can this user access THIS specific POV?"
- Context-aware (ownership, team, demo flag)
- POV-scoped operations

**checkPermission**: System-level capability
- "Can this user perform THIS operation globally?"
- Role-driven (what can DEMO_USER role do?)
- System-wide operations

**Compatibility**: ✅ **Can coexist** - They're orthogonal concerns!

---

## 🔄 Dual-Layer Model (Future Integration Pattern)

### **When Would You Want Both?**

**Use Case 1: Enterprise Compliance**
- Requirement: "DEMO_USER role can NEVER delete POVs, even ones they own"
- Current: DEMO_USER owner CAN delete (validatePOVAccess grants it)
- Dual-layer: Block via role permission, even if they own it

**Use Case 2: Audit Requirements**
- Requirement: "Log all permission checks, both resource and role-level"
- Current: Only validatePOVAccess is logged
- Dual-layer: Log both checks for complete audit trail

**Use Case 3: Tiered Access**
- Requirement: "Free tier users can't create more than 5 POVs"
- Current: No quota enforcement
- Dual-layer: Role permission can enforce limits

**Use Case 4: Sensitive Operations**
- Requirement: "Exporting POV data requires special permission"
- Current: POV owner can export (validatePOVAccess)
- Dual-layer: Also check `export->pov` permission

---

## 💻 Implementation Pattern (Future Reference)

### **Option A: Dual-Layer Sequential** (Most Common)

**Pattern**: Check role capability FIRST, then resource access

```typescript
// Step 1: Check system-level permission (role-based)
const hasRolePermission = await checkPermission(
  { id: user.userId, role: user.role as UserRole },
  { id: povId, type: ResourceType.PoV },
  ResourceAction.EDIT
);

if (!hasRolePermission) {
  // Deny: Role doesn't allow this operation globally
  throw new Error('Your role does not have permission to edit POVs');
}

// Step 2: Check resource-level access (ownership-based)
try {
  validatePOVAccess(user, pov, { throwOnDeny: true });
} catch (error) {
  // Deny: User doesn't have access to THIS specific POV
  throw new Error('You do not have access to this POV');
}

// Both checks passed: Proceed
```

**When to Use**:
- Sensitive operations (delete, export, admin actions)
- Compliance requirements (role restrictions)
- Enterprise features (quota limits)

**Trade-off**: More restrictive (both must pass)

---

### **Option B: Dual-Layer Additive** (Least Common)

**Pattern**: Grant access if EITHER check passes

```typescript
// Check 1: Do they have role permission?
const hasRolePermission = await checkPermission(...);

// Check 2: Do they have resource access?
const hasResourceAccess = validatePOVAccess(user, pov);

// Grant if EITHER passes
if (!hasRolePermission && !hasResourceAccess) {
  throw new Error('Access denied');
}

// At least one check passed: Proceed
```

**When to Use**:
- Backward compatibility (support both models during migration)
- Fallback access (if role permission missing, check ownership)

**Trade-off**: More permissive (either grants access)

---

### **Option C: Conditional Dual-Layer** (Recommended for Future)

**Pattern**: Use different checks based on operation type

```typescript
// System-level operations (POV creation, user management)
// Use: checkPermission ONLY
async function createPOV(user, data) {
  const hasPermission = await checkPermission(
    user,
    { id: '', type: ResourceType.PoV },
    ResourceAction.CREATE
  );

  if (!hasPermission) {
    throw new Error('Your role cannot create POVs');
  }

  // No validatePOVAccess needed (no specific POV yet)
  // Create the POV...
}

// Resource-level operations (task management, POV editing)
// Use: validatePOVAccess ONLY (current pattern)
async function updateTask(user, taskId, data) {
  const task = await getTaskWithPOV(taskId);

  validatePOVAccess(user, task.pov, { throwOnDeny: true });

  // No checkPermission needed (POV access is sufficient)
  // Update the task...
}

// Sensitive operations (export, delete, admin)
// Use: BOTH (dual-layer)
async function exportPOV(user, povId) {
  // Step 1: Role permission
  const canExport = await checkPermission(
    user,
    { id: povId, type: ResourceType.PoV },
    ResourceAction.EXPORT // Special action
  );

  if (!canExport) {
    throw new Error('Your role cannot export POVs');
  }

  // Step 2: Resource access
  const pov = await getPOV(povId);
  validatePOVAccess(user, pov, { throwOnDeny: true });

  // Both passed: Export...
}
```

**Decision Matrix**:

| Operation Type | Auth System | Reasoning |
|---------------|-------------|-----------|
| **Create POV/User** | `checkPermission` only | System-level, no specific resource |
| **View/Edit POV** | `validatePOVAccess` only | Resource-level, ownership sufficient |
| **Manage tasks** | `validatePOVAccess` only | POV-scoped, team collaboration |
| **Export/Delete** | BOTH (dual-layer) | Sensitive, need role + ownership |
| **Admin operations** | `checkPermission` only | System-level, role-driven |

---

## 📊 Current State vs Future State

### **Current (Post P0-1)**

| **Operation** | **Auth System** | **Checks** |
|--------------|----------------|------------|
| Create task | validatePOVAccess | Ownership OR team OR demo OR admin |
| Update task | validatePOVAccess | Ownership OR team OR demo OR admin |
| Delete task | validatePOVAccess | Ownership OR team OR demo OR admin |
| Create POV | checkPermission | Role has `pov->create` permission |
| Create phase | checkPermission | Role has `pov->edit` permission |

**Consistency**: Task operations use one system, POV/phase creation use another (intentional)

### **Future with Granular Permissions**

| **Operation** | **Auth System** | **Checks** |
|--------------|----------------|------------|
| Create task | BOTH | Role has `task->create` AND POV access |
| Update task | validatePOVAccess | POV access (ownership model preserved) |
| Delete task | BOTH | Role has `task->delete` AND POV access |
| Export POV | BOTH | Role has `pov->export` AND POV access |
| Create POV | checkPermission | Role has `pov->create` (no change) |

**Why This Works**:
- Sensitive operations (create, delete, export) require both
- Edit operations stay ownership-based (better UX)
- System operations stay role-based (no change)

---

## 🛠️ How to Implement Dual-Layer (Future)

### **Step 1: Identify Sensitive Operations**

Create a list of operations needing dual-layer:
```typescript
// lib/auth/sensitive-operations.ts

export const SENSITIVE_OPERATIONS = {
  task: {
    create: true,   // Requires role permission + POV access
    delete: true,   // Requires role permission + POV access
    edit: false,    // POV access only (current behavior)
    view: false,    // POV access only
  },
  pov: {
    create: true,   // Role permission only (system-level)
    delete: true,   // Dual-layer
    edit: false,    // POV access only
    export: true,   // Dual-layer (compliance)
  }
};
```

### **Step 2: Create Dual-Layer Helper**

```typescript
// lib/auth/dual-layer-auth.ts

import { checkPermission } from '@/lib/auth/permissions';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { SENSITIVE_OPERATIONS } from './sensitive-operations';

/**
 * Dual-Layer Authorization Check
 *
 * For sensitive operations, checks BOTH:
 * 1. Role permission (system-level capability)
 * 2. POV access (resource-level ownership/team)
 */
export async function checkDualLayerAccess(
  user: TokenPayload,
  pov: POVAccessContext,
  operation: {
    resource: 'task' | 'pov' | 'phase' | 'stage',
    action: ResourceAction
  }
): Promise<{ allowed: boolean; reason?: string }> {

  // Check if this operation requires dual-layer
  const requiresDualLayer = SENSITIVE_OPERATIONS[operation.resource]?.[operation.action];

  if (!requiresDualLayer) {
    // Single layer (POV access only) - current behavior
    const hasAccess = validatePOVAccess(user, pov);
    return {
      allowed: hasAccess,
      reason: hasAccess ? 'POV_ACCESS' : 'NO_POV_ACCESS'
    };
  }

  // Dual-layer required

  // Layer 1: Role permission (system-level)
  const hasRolePermission = await checkPermission(
    { id: user.userId, role: user.role as UserRole },
    { id: pov.id, type: ResourceType[operation.resource.toUpperCase()] },
    operation.action
  );

  if (!hasRolePermission) {
    return {
      allowed: false,
      reason: 'ROLE_PERMISSION_DENIED'
    };
  }

  // Layer 2: Resource access (ownership-based)
  const hasResourceAccess = validatePOVAccess(user, pov);

  if (!hasResourceAccess) {
    return {
      allowed: false,
      reason: 'POV_ACCESS_DENIED'
    };
  }

  // Both layers passed
  return {
    allowed: true,
    reason: 'DUAL_LAYER_APPROVED'
  };
}
```

### **Step 3: Update Task Handlers** (Example)

```typescript
// lib/tasks/handlers/task.ts (Future version with dual-layer)

export async function createTaskHandler(
  req: NextRequest,
  povId: string,
  phaseId: string,
  data: CreateTaskData
): Promise<TaskResponse> {
  const user = await getAuthUser(req);
  if (!user) throw new Error('Unauthorized');

  // Get POV with all fields for validation
  const pov = await prisma.pOV.findUnique({
    where: { id: povId },
    select: {
      id: true,
      ownerId: true,
      metadata: true,
      team: { select: { members: { select: { userId: true } } } }
    },
  });

  if (!pov) throw new Error('POV not found');

  // Dual-layer check (future implementation)
  const authResult = await checkDualLayerAccess(user, pov, {
    resource: 'task',
    action: ResourceAction.CREATE
  });

  if (!authResult.allowed) {
    if (authResult.reason === 'ROLE_PERMISSION_DENIED') {
      throw new Error('Your role does not have permission to create tasks');
    } else {
      throw new Error('You do not have access to this POV');
    }
  }

  // Both layers passed - proceed with task creation
  const task = await TaskService.createTask(data);
  return { data: task };
}
```

---

## 🎯 When to Use Each System

### **Use validatePOVAccess ONLY** (Current - Recommended)

**Operations**:
- ✅ View POV/tasks/phases/stages
- ✅ Edit POV/tasks/phases/stages
- ✅ Comment on POV
- ✅ Upload attachments
- ✅ Move tasks between phases

**Why**:
- Better UX (POV owner has full control)
- Team collaboration (team members can manage)
- Simple mental model (access = ownership/team)

**When to Keep This**:
- Small teams (< 50 users)
- Trust-based organizations
- Agile workflows

---

### **Use checkPermission ONLY**

**Operations**:
- ✅ Create POV (system-level - no specific POV yet)
- ✅ Create user (system-level)
- ✅ Admin operations
- ✅ System configuration

**Why**:
- No specific resource to check ownership on
- Role-appropriate (admins create users, users create POVs)
- Clear permission boundaries

**When to Use**:
- Operations without a parent resource
- Admin/system configuration
- Cross-POV operations

---

### **Use BOTH (Dual-Layer)** - Future

**Operations** (if granular permissions needed):
- ⚠️ Delete POV (permanent data loss)
- ⚠️ Export POV (data exfiltration risk)
- ⚠️ Delete task (workflow disruption)
- ⚠️ Create task (spam prevention)
- ⚠️ Bulk operations (mass changes)

**Why**:
- Compliance (SOC 2, HIPAA, GDPR)
- Enterprise security (principle of least privilege)
- Audit requirements (dual approval)
- Risk mitigation (accidental deletion)

**When to Implement**:
- Enterprise customers require it
- Compliance audit findings
- Security incident (insider threat)
- Regulatory requirements

---

## 📋 Migration Path to Dual-Layer (If Needed)

### **Phase 1: Identify Sensitive Operations** (1 hour)

```typescript
// Create SENSITIVE_OPERATIONS map
// Review each endpoint:
//   - CREATE operations → Dual-layer (prevent spam)
//   - DELETE operations → Dual-layer (prevent data loss)
//   - EXPORT operations → Dual-layer (prevent data theft)
//   - EDIT operations → Keep single-layer (better UX)
```

### **Phase 2: Create Helper Function** (2 hours)

```typescript
// Implement checkDualLayerAccess() helper
// Test with one endpoint (e.g., DELETE task)
// Verify both layers work correctly
```

### **Phase 3: Gradual Rollout** (4-6 hours)

```typescript
// Week 1: Apply to DELETE operations (3 endpoints)
// Week 2: Apply to CREATE operations (if needed)
// Week 3: Apply to EXPORT operations
// Measure: User complaints, false denials
```

### **Phase 4: Permission Seed Update** (1 hour)

```typescript
// Update scripts/setup-permissions.ts
// Ensure all roles have appropriate permissions for dual-layer
// Test: DEMO_USER still works after dual-layer added
```

**Total Time**: 8-10 hours for complete dual-layer migration

---

## ⚠️ Trade-offs to Consider

### **Single Layer (Current - validatePOVAccess)**

**Pros**:
- ✅ Simple mental model
- ✅ Better UX (ownership = control)
- ✅ Team collaboration easy
- ✅ Fewer permission entries to manage
- ✅ Faster (one query vs two)

**Cons**:
- ❌ Less granular control
- ❌ Can't restrict operations by role
- ❌ Owner can do anything (including risky operations)

### **Dual Layer (Future)**

**Pros**:
- ✅ Granular control (role + ownership)
- ✅ Compliance-friendly (dual approval)
- ✅ Audit trail (both checks logged)
- ✅ Risk mitigation (sensitive ops protected)

**Cons**:
- ❌ More complex (two systems to maintain)
- ❌ Worse UX (owner might be denied by role)
- ❌ Slower (two database queries)
- ❌ More permission entries (role_permissions table grows)

---

## 🎓 Lessons from P0-1 Fix

### **What We Learned**

**1. Dual-layer caused confusion**
- Task CREATE had both checks (inconsistent)
- Users didn't understand why they couldn't edit owned POVs
- Support burden (explaining permission model)

**2. Single layer works well for most use cases**
- 95% of operations don't need role restrictions
- POV ownership model matches user expectations
- Team collaboration "just works"

**3. When dual-layer makes sense**
- Only for truly sensitive operations (delete, export)
- Only when compliance requires it
- Only after user feedback/audit findings

**4. Migration is possible but costly**
- 8-10 hours implementation
- User confusion (why can't I delete my own POV?)
- Support documentation needed

---

## 🚀 Recommendation for Future

### **Keep Current Single-Layer Model Until...**

**Trigger Events** (when to implement dual-layer):

1. **Enterprise Customer Requirement**
   - "We need role-based restrictions on deletion"
   - "Compliance audit requires dual approval"

2. **Security Incident**
   - Insider deleted critical POVs
   - Data exfiltration via export

3. **Regulatory Requirement**
   - SOC 2 audit finding
   - HIPAA compliance
   - GDPR data controller requirements

4. **Scale Issue**
   - 1000+ users need tiered permissions
   - Free vs paid tier differentiation

**If none of these occur**: ✅ **Keep current model** (validatePOVAccess only)

---

### **Implementation Checklist** (When Needed)

- [ ] Create SENSITIVE_OPERATIONS map
- [ ] Implement checkDualLayerAccess() helper
- [ ] Test with DELETE task operation
- [ ] Update permission seeds
- [ ] Apply to EXPORT operations
- [ ] Apply to DELETE operations
- [ ] Update documentation
- [ ] Train support team
- [ ] Monitor false denials
- [ ] Adjust based on feedback

**Time**: 8-10 hours
**Risk**: Medium (UX impact, user confusion)
**Benefit**: Enhanced security, compliance

---

## 📖 Current Implementation Reference

### **Files Using validatePOVAccess ONLY** (27 files)

**Verified Clean** (automated scan Nov 7, 2025):
- ✅ All have complete POV data (ownerId, metadata, team)
- ✅ All use ownership-based model
- ✅ 0 dual permission checks found

**Consistency**: 100% (all POV-scoped operations use same model)

### **Files Using checkPermission ONLY** (5-8 files)

**System-Level Operations**:
- `lib/pov/handlers/post.ts` - POV/phase creation
- `lib/tasks/handlers/assignee.ts` - Available assignees list
- `app/api/users/route.ts` - User management
- Admin endpoints - System configuration

**Assessment**: ✅ **Correct usage** (no specific resource to check ownership on)

---

## 🎯 Answer to Your Question

### **Is validatePOVAccess compatible with checkPermission?**

✅ **YES - They're compatible and complementary!**

**They DON'T replace each other**:
- `validatePOVAccess` = "Can access THIS resource?"
- `checkPermission` = "Can perform THIS operation globally?"

**They CAN work together**:
- Check role permission (system-level capability)
- THEN check POV access (resource-level ownership)
- Both must pass for sensitive operations

### **Current State: Single Layer (Recommended)**

We removed checkPermission from task operations because:
- Task management is POV-scoped (not system-level)
- Ownership/team membership is sufficient authorization
- Better UX (POV owner controls everything in their POV)
- Consistent model (all 27 files use same pattern)

### **Future State: Dual Layer (If Needed)**

We could add checkPermission back for sensitive operations:
- Only for DELETE, EXPORT, CREATE (not EDIT/VIEW)
- Only if compliance/enterprise requires it
- Only after user feedback shows need

**Migration**: 8-10 hours
**Benefit**: Granular control, compliance
**Cost**: Complexity, worse UX, maintenance

---

## 💡 Recommendation

**For Now**: ✅ **Keep current single-layer model**
- Working well (DEMO_USER functional, team collaboration enabled)
- Consistent (all operations use validatePOVAccess)
- Simple (one authorization concept)

**For Future**: 📋 **Document and monitor**
- This file is the reference
- Watch for enterprise requirements
- Implement dual-layer only when triggered by real need

**Implementation Trigger**: Enterprise customer + (Compliance OR Security incident OR Regulatory requirement)

---

**This document provides the complete reference for future dual-layer implementation if needed!**

Saved: `cline_docs/reviews/task-domain-security-audit-2025-11-06/AUTHORIZATION-ARCHITECTURE-DUAL-LAYER.md`
