# Implementation Plan: Fix InternalServiceRouter to Match Documented Design

**Date:** 2026-01-19
**Bug Report:** `cline_docs/bug-reports/504-workflow-timeout-2026-01-19.md`
**Confidence:** 95%
**Estimated Effort:** 3-4 hours

---

## Executive Summary

Fix `InternalServiceRouter.js` to call domain services (`PoVService`, `TaskService`) directly instead of making HTTP calls via `apiClient`. This eliminates the 504 deadlock when workflows are executed from the web UI.

---

## Relevant Patterns (from .claude/knowledge/patterns/)

### 1. Global Prisma Singleton Pattern (98% Confidence) ✅
**File:** `global-prisma-singleton-pattern.md`

**MUST follow:**
```javascript
// ✅ CORRECT: Use global singleton
const { prisma } = require('@/lib/prisma');

// ❌ WRONG: Never create new instances
const prisma = new PrismaClient(); // FORBIDDEN
```

**Impact on implementation:**
- Domain services already use the global singleton
- Fallback code (if services fail to load) MUST also use global singleton

### 2. MCP API Context Differences Pattern (100% Confidence) ✅
**File:** `mcp-api-context-differences.md`

**MUST follow:**
```javascript
// MCP Context (InternalServiceRouter receives this)
context.user.id       // ✅ CORRECT
context.user.email    // ✅ CORRECT
context.user.role     // ✅ CORRECT

// API Context (different - NOT what we receive)
user.userId           // ❌ DON'T USE (API pattern, not MCP)
```

**Impact on implementation:**
- Extract userId as: `context.user?.id || context.apiUserContext?.userId`
- Handle both MCP direct and Hub API call patterns

### 3. Field Leakage Prevention Pattern (98% Confidence) ✅
**File:** `field-leakage-prevention-pattern.md`

**MUST follow:**
- Validate context has required fields before calling services
- Don't assume fields exist - use defensive access
- Log warnings when fields are missing (helps debugging)

---

## Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| `lib/mcp/server/tools/internal/InternalServiceRouter.js` | Major | Replace HTTP handlers with domain service calls |

---

## Implementation Details

### Current Implementation (BEFORE - Incorrect)

```javascript
// lib/mcp/server/tools/internal/InternalServiceRouter.js

const { SDKNativeAdvancedTools } = require('../sdk-native-advanced-tools');
const { apiClient } = require('../../utils/api-client');  // ❌ HTTP calls

class InternalServiceRouter {
  // ...

  async handleListPOVs(args, context) {
    const userContext = this.buildUserContext(context);
    // ... build params ...
    return apiClient.get(endpoint, {}, { userContext });  // ❌ HTTP TO SELF
  }

  async handleGetPOVDetails(args, context) {
    const userContext = this.buildUserContext(context);
    // ...
    return apiClient.get(`/api/pov/${povId}`, {}, { userContext });  // ❌ HTTP
  }

  async handleGetPOVPhases(args, context) {
    return apiClient.get(`/api/pov/${args.povId}/phases`, {}, { userContext });  // ❌ HTTP
  }

  async handleListTasks(args, context) {
    return apiClient.get(endpoint, {}, { userContext });  // ❌ HTTP
  }

  async handleGetTaskDetails(args, context) {
    return apiClient.get(`/api/tasks/${args.taskId}`, {}, { userContext });  // ❌ HTTP
  }
}
```

### New Implementation (AFTER - Correct)

```javascript
/**
 * Internal Service Router
 * Routes services(action: "call") requests to pAIchart internal tool handlers
 *
 * Handles services with endpoint: "internal://..."
 * Direct handler invocation - calls domain services directly (NO HTTP)
 *
 * FIX (2026-01-19): Previous implementation incorrectly used apiClient.get() for HTTP calls.
 * This caused 504 deadlocks when called from web UI (Next.js calling itself).
 * Now correctly calls domain services (PoVService, TaskService) directly.
 *
 * PATTERNS FOLLOWED:
 * - global-prisma-singleton-pattern.md (98%): Uses shared prisma instance
 * - mcp-api-context-differences.md (100%): Handles MCP vs API context correctly
 * - field-leakage-prevention-pattern.md (98%): Defensive field access
 *
 * @see bug-report: cline_docs/bug-reports/504-workflow-timeout-2026-01-19.md
 * @see implementation-plan-v4.2-focused.md
 */

const { SDKNativeAdvancedTools } = require('../sdk-native-advanced-tools');

// Domain services for direct invocation (matches documented design)
// Lazy-loaded to avoid circular dependencies
let povServiceInstance = null;
let taskServiceClass = null;
let prismaInstance = null;

/**
 * Get Prisma client (lazy loaded, uses global singleton per pattern)
 * @see global-prisma-singleton-pattern.md
 */
function getPrisma() {
  if (!prismaInstance) {
    try {
      // Use global singleton (MANDATORY per pattern)
      const { prisma } = require('@/lib/prisma');
      prismaInstance = prisma;
      console.log('[InternalRouter] Using global Prisma singleton');
    } catch (e) {
      // This should only happen in isolated test environments
      console.error('[InternalRouter] CRITICAL: Could not load global Prisma singleton:', e.message);
      throw new Error('Global Prisma singleton required - see global-prisma-singleton-pattern.md');
    }
  }
  return prismaInstance;
}

/**
 * Get POV Service instance (lazy loaded)
 * Uses the existing N+1 optimized PoVService from lib/pov/services/pov.ts
 */
function getPOVService() {
  if (!povServiceInstance) {
    try {
      const { PoVService } = require('@/lib/pov/services/pov');
      povServiceInstance = new PoVService();
      console.log('[InternalRouter] Loaded PoVService');
    } catch (e) {
      console.error('[InternalRouter] Could not load PoVService:', e.message);
      throw new Error('PoVService required for internal routing');
    }
  }
  return povServiceInstance;
}

/**
 * Get Task Service class (lazy loaded)
 * Uses the existing N+1 optimized TaskService from lib/tasks/services/task.ts
 * Note: TaskService uses static methods
 */
function getTaskService() {
  if (!taskServiceClass) {
    try {
      const { TaskService } = require('@/lib/tasks/services/task');
      taskServiceClass = TaskService;
      console.log('[InternalRouter] Loaded TaskService');
    } catch (e) {
      console.error('[InternalRouter] Could not load TaskService:', e.message);
      throw new Error('TaskService required for internal routing');
    }
  }
  return taskServiceClass;
}

class InternalServiceRouter {
  constructor(sharedNormalizer = null) {
    this.advancedTools = new SDKNativeAdvancedTools(null, sharedNormalizer);

    // Active internal services
    this.serviceToolMap = {
      'paichart-project-service': {
        'project(action: "pov.list")': this.handleListPOVs.bind(this),
        'project(action: "pov.details")': this.handleGetPOVDetails.bind(this),
        'get_pov_phases': this.handleGetPOVPhases.bind(this)
      },
      'paichart-project-service': {
        'project(action: "task.context")': (args, ctx) => this.advancedTools.handleGetTaskContext(args, ctx),
        'perform(action: "execute")': (args, ctx) => this.advancedTools.handleExecuteTaskAction(args, ctx),
        'project(action: "task.list")': this.handleListTasks.bind(this),
        'get_task_details': this.handleGetTaskDetails.bind(this)
      }
    };
  }

  /**
   * Check if service uses internal routing
   */
  isInternalService(service) {
    return service?.configuration?.type === 'internal' ||
           service?.configuration?.endpoint?.startsWith('internal://');
  }

  /**
   * Normalize context to support both MCP and Hub patterns
   * @see mcp-api-context-differences.md
   *
   * MCP direct: context.user.id
   * Hub API: context.apiUserContext.userId
   */
  normalizeContext(context) {
    return {
      ...context,
      user: context.apiUserContext || context.user || {},
      apiUserContext: context.apiUserContext || {
        userId: context.user?.id,
        token: context.user?.token,
        email: context.user?.email,
        role: context.user?.role
      }
    };
  }

  /**
   * Extract user info from context (handles both MCP and API patterns)
   * @see mcp-api-context-differences.md
   * @see field-leakage-prevention-pattern.md
   */
  extractUserInfo(context) {
    const normalized = this.normalizeContext(context);

    // MCP pattern: user.id, API pattern: apiUserContext.userId
    const userId = normalized.user?.id || normalized.apiUserContext?.userId;
    const userRole = normalized.user?.role || normalized.apiUserContext?.role;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(userRole);

    // Log for debugging (helps diagnose context issues)
    console.log('[InternalRouter] extractUserInfo:', {
      userId: userId ? `${userId.substring(0, 8)}...` : 'MISSING',
      role: userRole || 'MISSING',
      isAdmin,
      source: normalized.user?.id ? 'MCP' : 'API'
    });

    if (!userId) {
      console.warn('[InternalRouter] WARNING: No userId found in context');
    }

    return { userId, userRole, isAdmin };
  }

  /**
   * Route call to appropriate internal handler
   */
  async routeCall(serviceId, tool, args, context) {
    const toolMap = this.serviceToolMap[serviceId];
    if (!toolMap) {
      throw new Error(`Unknown internal service: ${serviceId}. Available: ${Object.keys(this.serviceToolMap).join(', ')}`);
    }

    const handler = toolMap[tool];
    if (!handler) {
      throw new Error(`Tool '${tool}' not found on service '${serviceId}'. Available: ${Object.keys(toolMap).join(', ')}`);
    }

    const normalizedContext = this.normalizeContext(context);
    const startTime = Date.now();

    try {
      const result = await handler(args, normalizedContext);
      return {
        success: true,
        result,
        metadata: {
          serviceType: 'internal',
          executionTime: Date.now() - startTime,
          tool,
          serviceId
        }
      };
    } catch (error) {
      throw new Error(`Internal service call failed: ${error.message}`);
    }
  }

  // =========================================================================
  // POV Service Handlers - DIRECT DOMAIN SERVICE CALLS (NO HTTP)
  // =========================================================================

  /**
   * List POVs - Direct call to PoVService.list()
   *
   * BEFORE: apiClient.get('/api/pov') - HTTP call caused 504 deadlock
   * AFTER: povService.list() - Direct Prisma query, no HTTP
   */
  async handleListPOVs(args, context) {
    const { userId, isAdmin } = this.extractUserInfo(context);

    console.log('[InternalRouter] handleListPOVs DIRECT:', {
      userId: userId ? `${userId.substring(0, 8)}...` : 'MISSING',
      isAdmin,
      filters: { status: args.status, limit: args.limit }
    });

    // Direct call to domain service (NO HTTP!)
    const povService = getPOVService();
    let povs = await povService.list(userId, isAdmin);

    // Apply filters from args
    if (args.status) {
      povs = povs.filter(p => p.status === args.status);
    }
    if (args.customerName) {
      const search = args.customerName.toLowerCase();
      povs = povs.filter(p => p.customerName?.toLowerCase().includes(search));
    }
    if (args.salesTheatre) {
      povs = povs.filter(p => p.salesTheatre === args.salesTheatre);
    }
    if (args.limit) {
      povs = povs.slice(0, parseInt(args.limit, 10));
    }

    return { povs, total: povs.length };
  }

  /**
   * Get POV Details - Direct call to PoVService.get()
   *
   * BEFORE: apiClient.get('/api/pov/{id}') - HTTP call caused 504 deadlock
   * AFTER: povService.get() - Direct Prisma query, no HTTP
   */
  async handleGetPOVDetails(args, context) {
    const { userId, isAdmin } = this.extractUserInfo(context);

    if (!args.povId && !args.povName && !args.pov_name) {
      throw new Error('Either povId or povName is required');
    }

    let povId = args.povId;
    const povName = args.povName || args.pov_name;

    // Look up by name if needed
    if (!povId && povName) {
      const povService = getPOVService();
      const povs = await povService.list(userId, isAdmin);
      const searchLower = povName.toLowerCase();
      const pov = povs.find(p =>
        p.title?.toLowerCase().includes(searchLower) ||
        p.customerName?.toLowerCase().includes(searchLower)
      );
      if (!pov) {
        throw new Error(`POV not found: ${povName}`);
      }
      povId = pov.id;
    }

    console.log('[InternalRouter] handleGetPOVDetails DIRECT:', { povId });

    // Direct call to domain service (NO HTTP!)
    const povService = getPOVService();
    const pov = await povService.get(povId);

    if (!pov) {
      throw new Error(`POV not found: ${povId}`);
    }

    return pov;
  }

  /**
   * Get POV Phases - Direct Prisma query
   *
   * BEFORE: apiClient.get('/api/pov/{id}/phases') - HTTP call
   * AFTER: Direct Prisma query, no HTTP
   */
  async handleGetPOVPhases(args, context) {
    if (!args.povId) {
      throw new Error('povId is required');
    }

    console.log('[InternalRouter] handleGetPOVPhases DIRECT:', { povId: args.povId });

    // Direct Prisma query (NO HTTP!)
    const prisma = getPrisma();
    const phases = await prisma.phase.findMany({
      where: { povId: args.povId },
      include: {
        stages: {
          orderBy: { order: 'asc' }
        }
      },
      orderBy: { order: 'asc' }
    });

    return { phases, total: phases.length };
  }

  // =========================================================================
  // Task Service Handlers - DIRECT DOMAIN SERVICE CALLS (NO HTTP)
  // =========================================================================

  /**
   * List Tasks - Direct call to TaskService.getTasksWithContext()
   *
   * BEFORE: apiClient.get('/api/tasks') - HTTP call caused 504 deadlock
   * AFTER: TaskService.getTasksWithContext() - Direct Prisma query, no HTTP
   */
  async handleListTasks(args, context) {
    console.log('[InternalRouter] handleListTasks DIRECT:', {
      povId: args.povId,
      phaseId: args.phaseId,
      status: args.status,
      limit: args.limit
    });

    // Direct call to domain service (NO HTTP!)
    const TaskService = getTaskService();
    const tasks = await TaskService.getTasksWithContext({
      povId: args.povId,
      phaseId: args.phaseId,
      stageId: args.stageId,
      assigneeId: args.assigneeId,
      status: args.status,
      limit: args.limit ? parseInt(args.limit, 10) : 100
    });

    return { tasks, total: tasks.length };
  }

  /**
   * Get Task Details - Direct call to TaskService.getTask()
   *
   * BEFORE: apiClient.get('/api/tasks/{id}') - HTTP call
   * AFTER: TaskService.getTask() - Direct Prisma query, no HTTP
   */
  async handleGetTaskDetails(args, context) {
    if (!args.taskId) {
      throw new Error('taskId is required');
    }

    console.log('[InternalRouter] handleGetTaskDetails DIRECT:', { taskId: args.taskId });

    // Direct call to domain service (NO HTTP!)
    const TaskService = getTaskService();
    const task = await TaskService.getTask(args.taskId);

    if (!task) {
      throw new Error(`Task not found: ${args.taskId}`);
    }

    return task;
  }
}

module.exports = { InternalServiceRouter };
```

---

## Changes Summary

| Handler | Before (HTTP) | After (Direct) |
|---------|--------------|----------------|
| `handleListPOVs` | `apiClient.get('/api/pov')` | `povService.list()` |
| `handleGetPOVDetails` | `apiClient.get('/api/pov/${id}')` | `povService.get()` |
| `handleGetPOVPhases` | `apiClient.get('/api/pov/${id}/phases')` | `prisma.phase.findMany()` |
| `handleListTasks` | `apiClient.get('/api/tasks')` | `TaskService.getTasksWithContext()` |
| `handleGetTaskDetails` | `apiClient.get('/api/tasks/${id}')` | `TaskService.getTask()` |

---

## Pattern Compliance Checklist

- [x] **Global Prisma Singleton (98%)**: Uses `require('@/lib/prisma')` - never creates new instances
- [x] **MCP API Context (100%)**: Handles both `user.id` and `apiUserContext.userId`
- [x] **Field Leakage Prevention (98%)**: Defensive field access with logging
- [x] **Lazy Loading**: Services loaded on first use to avoid circular dependencies
- [x] **Error Handling**: Clear error messages for missing services/fields
- [x] **Logging**: Debug logs to help diagnose issues

---

## Testing Plan

### 1. Unit Test: Direct Service Calls
```bash
# Verify services load correctly
node -e "
const { InternalServiceRouter } = require('./lib/mcp/server/tools/internal/InternalServiceRouter');
const router = new InternalServiceRouter();
console.log('Router created:', !!router);
console.log('Service map:', Object.keys(router.serviceToolMap));
"
```

### 2. Integration Test: POV Workflow from Web UI
1. Log into pAIchart web UI
2. Navigate to Workflows
3. Execute `pov-status-report` workflow
4. Verify no 504 error
5. Verify POV data is returned correctly

### 3. Regression Test: MCP Server Path
```bash
# Test from Claude Desktop
# Execute project(action: "pov.list") via paichart-project-service
# Verify still works (should use same direct calls)
```

### 4. Verify Logs
```bash
# Check for DIRECT logs instead of HTTP logs
pm2 logs paichart-web --lines 50 | grep "InternalRouter"
# Should see: "[InternalRouter] handleListPOVs DIRECT:"
# Should NOT see: "[API Client] GET /api/pov"
```

---

## Rollback Plan

If issues occur, restore the original HTTP-based implementation:

```bash
git checkout HEAD~1 -- lib/mcp/server/tools/internal/InternalServiceRouter.js
pm2 reload ecosystem.config.js
```

---

## Deployment Steps

1. **Review implementation** - Verify code matches this plan
2. **Run local tests** - Execute unit and integration tests
3. **Commit changes** - With reference to bug report
4. **Deploy to production** - Via standard deployment workflow
5. **Verify in production** - Test `pov-status-report` workflow from web UI
6. **Monitor logs** - Check for any errors in the first hour

---

## Related Files (Reference Only - No Changes)

| File | Purpose |
|------|---------|
| `lib/pov/services/pov.ts` | PoVService with N+1 optimized queries |
| `lib/tasks/services/task.ts` | TaskService with N+1 optimized queries |
| `lib/prisma.ts` | Global Prisma singleton |
| `lib/services/workflow/integrations/service-caller.ts` | Web UI path that calls InternalServiceRouter |

---

*Implementation plan created 2026-01-19*
*Patterns verified from .claude/knowledge/patterns/*
