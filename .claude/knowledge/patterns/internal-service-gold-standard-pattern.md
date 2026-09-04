# Internal Service Gold Standard Pattern

**Type**: Excellence Pattern (companion to mcp-tool-gold-standard-pattern.md)
**Confidence**: 94% (production-validated March 2026)
**Status**: Complete — derived from recommendation-engine + kpi-service implementations
**Created**: March 15, 2026

---

## Overview

This pattern captures the proven approach for creating **internal pAIchart services** — same-process services that route through `InternalServiceRouter` with zero HTTP latency. Unlike external MCP services (Docker containers, SSE transport), internal services are TypeScript/JS handlers registered in the MCPTool table and routed directly.

**Companion patterns**:
- `mcp-tool-gold-standard-pattern.md` — For external MCP tools exposed to AI clients
- `docker-mcp-service-gold-standard-v2.md` — For Docker-containerized external services
- `LOCAL-MCP-SERVER-CREATION-GUIDE.md` — For creating new Docker MCP servers

**Architecture context**: This pattern builds **Tier 2 (Internal Hub Services)**. See `/.claude/knowledge/domain/mcp/three-tier-tool-architecture.md` for how internal services fit alongside Tier 1 (platform tools) and Tier 3 (external services), including the routing flow, apiClient 3-arg pattern, and guidance on when to use each tier.

**This pattern is for**:
- Same-process services (no Docker, no HTTP)
- Services that query/compute from existing pAIchart data
- Services exposed via `services(action: "call")` OR used as DB FK targets
- Read-only or write services with proper auth

**Production examples**:
- `paichart-project-service` — POV/task data access + perform actions (Jan 2026)
- `paichart-recommendation-engine` — System tool for recommendation persistence (Mar 2026)
- `paichart-kpi-service` — KPI scoring, history, evaluation (Mar 2026)

---

## Two Types of Internal Services

### Type 1: Routable Services

Registered in `InternalServiceRouter.serviceToolMap`. AI clients call them via `services(action: "call")`.

```
AI Client → services(action: "call", targetService: "paichart-kpi-service", tool: "kpi", arguments: { action: "score", povId: "..." })
         → ServiceCallHandler → InternalServiceRouter → handleKPI() → response
```

**Examples**: `paichart-project-service`, `paichart-kpi-service`

### Type 2: System Services (FK targets)

Registered in MCPTool table for FK constraints but NOT callable via MCP. Used as `toolId` references.

**Examples**: `paichart-recommendation-engine` (MCPRecommendation.toolId FK)

---

## 5-Step Creation Pattern

### Step 1: Register the Service

**File**: `scripts/register-internal-services.ts`

```typescript
const myServiceData = {
  name: 'pAIchart My Service',
  description: 'Clear description of what the service does and its tools.',
  version: '1.0.0',
  status: 'ACTIVE' as const,
  capabilities: {
    categories: ['internal', 'my-domain', 'ai-intelligence'],  // Always include 'internal'
    transport: 'internal',
  },
  configuration: {
    type: 'internal',
    endpoint: 'internal://my-service',  // Always internal:// prefix
    healthCheck: 'internal',
    category: 'ai-intelligence',  // Must be from 6-value taxonomy (see below)
  },
  authType: 'NONE',  // Auth handled by Hub, not service
  credentials: {},
  permissions: { internal: true },  // No publicAccess for non-discoverable
};

await prisma.mCPTool.upsert({
  where: { id: 'paichart-my-service' },
  update: myServiceData,       // Mirror create block — re-runs propagate changes
  create: { id: 'paichart-my-service', ...myServiceData },
});
```

**Category taxonomy** (6 valid values):
`ai-intelligence`, `data-services`, `automation`, `monitoring`, `communication`, `security`

**Naming convention**: `paichart-{domain}-service` or `paichart-{domain}-engine`

### Step 2: Add Router Entry (Routable services only)

**File**: `lib/mcp/server/tools/internal/InternalServiceRouter.js`

```javascript
// In constructor, add to this.serviceToolMap:
this.serviceToolMap = {
  // ... existing services ...
  'paichart-my-service': {
    'my-tool': this.handleMyTool.bind(this)
  }
};
```

### Step 3: Implement the Handler

**File**: `lib/mcp/server/tools/internal/InternalServiceRouter.js`

```javascript
async handleMyTool(args, context) {
  const { action, povId } = args || {};

  // 1. Validate required params
  if (!povId) {
    return { error: 'povId is required' };
  }

  // 2. POV access validation — route through existing API [SEC-S3]
  const enrichedContext = ContextEnricher.enrichContext(context);
  const userContext = ContextEnricher.getUserContext(enrichedContext);
  const headers = {};
  if (userContext?.token) {
    headers['Authorization'] = `Bearer ${userContext.token}`;
  }

  try {
    // 3. Route through existing API (inherits requirePermission + IDOR checks)
    const response = await apiClient.get(`/api/pov/${povId}/my-resource`, { headers });
    if (!response.ok) {
      return { error: 'Access denied or resource not found' };
    }
    const data = await response.json();

    // 4. Return MCP-formatted response
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          povId,
          data: data.data || data,
          evaluatedAt: new Date().toISOString(),
        }, null, 2)
      }]
    };
  } catch (error) {
    log.error({ err: error, action, povId }, 'Handler error');
    return { error: `Operation failed: ${error.message || 'Unknown error'}` };
  }
}
```

### Step 4: Create Seed Script (if needed)

**File**: `scripts/seed-my-data.ts`

For services that need default data (KPI templates, recommendation tool records):

```typescript
// Use upsert for idempotency — safe to run multiple times
await prisma.myModel.upsert({
  where: { id: 'deterministic-id' },
  update: { /* ... */ },
  create: { /* ... */ },
});
```

### Step 5: Run on Production

```bash
# Register service
ssh <PROD_USER>@<PROD_HOST> "cd /var/www/paichart-app/current && source .env.production && npx ts-node scripts/register-internal-services.ts"

# Seed data (if applicable)
ssh <PROD_USER>@<PROD_HOST> "cd /var/www/paichart-app/current && source .env.production && npx ts-node scripts/seed-my-data.ts"
```

---

## Quality Standards (Internal Service Gold Standards)

### IS-GS1: Registration Completeness

- [ ] `id` follows `paichart-{domain}-service` convention
- [ ] `description` explains what the service does and lists its tools
- [ ] `category` is from the 6-value taxonomy
- [ ] `capabilities.categories` includes `'internal'`
- [ ] `endpoint` uses `internal://` prefix
- [ ] `update` block mirrors `create` block (re-runs propagate changes)
- [ ] `credentials: {}` and `permissions: { internal: true }` set (required Json fields)

### IS-GS2: Auth & Access Control

- [ ] Routable handlers validate POV access before returning data
- [ ] Routes through existing API endpoints (inherits `requirePermission` + IDOR checks)
- [ ] Uses `identity-preserving-token-forwarding-pattern` for user context
- [ ] Write operations use `validatePOVAccess` or equivalent
- [ ] No `publicAccess` for non-discoverable services

### IS-GS3: Error Handling

- [ ] Handler has try/catch with structured error return
- [ ] Errors logged with pino child logger (`log.error({ err, action, povId })`)
- [ ] Error response includes actionable message
- [ ] Invalid action returns valid alternatives

### IS-GS4: Response Format

For routable services returning to AI clients:
- [ ] Response uses `{ content: [{ type: 'text', text: JSON.stringify(...) }] }` format
- [ ] JSON includes timestamp (`evaluatedAt` or similar)
- [ ] JSON is pretty-printed (`null, 2` for readability)

For system services (FK targets):
- [ ] No response format needed — used only as DB reference

### IS-GS5: Data Patterns

- [ ] Queries reuse existing contextData where possible (zero extra queries)
- [ ] `findMany` calls have `take` safety caps
- [ ] Fire-and-forget for non-critical persistence
- [ ] Calculations are pure functions (testable, no side effects)

### IS-GS6: Validation

- [ ] Zod schemas use `z.nativeEnum()` for Prisma enums (not `z.enum()`)
- [ ] SAFE_TEXT (`detectPromptInjection`) on user-facing text fields
- [ ] CUID validation on ID fields
- [ ] `current`/`target` fields have concrete types (not `z.unknown()`)

---

## Architecture Decision: When to Create an Internal Service

| Scenario | Approach |
|----------|----------|
| Need a DB FK target for a new feature | **System service** (Type 2) — register in MCPTool, no router entry |
| Need AI clients to query computed data | **Routable service** (Type 1) — register + router + handler |
| Need to wrap an external API | **Docker service** — use `LOCAL-MCP-SERVER-CREATION-GUIDE.md` |
| Need to expose existing CRUD to AI | **Add to project-service** — extend existing handler |

---

## Anti-Patterns

### Don't: Use `new Function()` or eval for dynamic computation
```javascript
// ❌ WRONG — code injection (BC17/BC48)
const result = new Function('data', calculation)(taskData);

// ✅ RIGHT — predefined calculator registry
const calculator = KPI_CALCULATORS[formulaId];
const result = calculator(contextData, povId);
```

### Don't: Query independently when contextData is available
```javascript
// ❌ WRONG — 7 extra queries per calculation
const total = await prisma.task.count({ where: { povId } });
const completed = await prisma.task.count({ where: { povId, status: 'COMPLETED' } });

// ✅ RIGHT — derive from existing contextData (0 queries)
const povTasks = contextData.userTasks.filter(t => t.povId === povId);
const completed = povTasks.filter(t => t.status === 'COMPLETED').length;
```

### Don't: Expose write operations via MCP without explicit need
```javascript
// ❌ WRONG — AI client could modify business-critical targets
'kpi.update': this.handleKPIUpdate.bind(this)

// ✅ RIGHT — read-only for MVP, writes via web UI only
'kpi': this.handleKPI.bind(this)  // score, history, evaluate (all read-only)
```

---

## Production Checklist

When deploying a new internal service:

- [ ] Service registered in `register-internal-services.ts`
- [ ] Router entry added to `InternalServiceRouter.js` (if routable)
- [ ] Handler method implemented with POV access validation
- [ ] Seed script created (if default data needed)
- [ ] `npm run build` passes
- [ ] `npx eslint` passes on changed files
- [ ] Registration script run on production
- [ ] Seed script run on production
- [ ] Smoke test: `services(action: "call")` returns expected data
- [ ] Specialist review (if >2h effort or security-sensitive)

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `scripts/register-internal-services.ts` | Service registration (upsert pattern) |
| `lib/mcp/server/tools/internal/InternalServiceRouter.js` | Routing + handler methods |
| `lib/mcp/server/tools/hub/service-call-handler.js` | Service call dispatcher (detects internal vs external) |
| `lib/mcp/server/middleware/context-enricher.js` | User context extraction for auth |
| `lib/mcp/server/utils/api-client.js` | HTTP fallback for API routing |

---

## Related Patterns

- `mcp-tool-gold-standard-pattern.md` — External tool quality standards
- `docker-mcp-service-gold-standard-v2.md` — Docker service creation
- `identity-preserving-token-forwarding-pattern.md` — User auth across boundaries
- `api-security-withPOVAccess-pattern.md` — POV access validation
- `fire-and-forget-activity-logging-pattern.md` — Non-blocking persistence
- `parallel-query-optimization-pattern.md` — Zero-cost data derivation

---

**Pattern Status**: Production-validated (3 services deployed)
**Confidence**: 94%
**Created from**: recommendation-engine (Phase 1.5) + kpi-service implementations
