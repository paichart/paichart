# API Efficiency Discovery

**Last Updated**: 2026-06-12 (health-run: all blocks PASS; Step 8 apiLogger→logger + Step 11 createHandler call-style greps corrected; Steps 4/6/12 reclassified as post-change sweep — see note below)
**Status**: v1.3 - Steps 4/6/12 post-change sweep classification added
**Confidence**: Very High - Based on October 27, 2025 POV-Scoping Breakthrough
**Last Validated**: 2026-06-12 - Steps 4/6/12 executed as post-change sweep (caught a dead-twin component + verified zero orphaned consumers)

## ⚠️ Steps 4, 6, 12 Are a POST-CHANGE SWEEP, Not Full-Audit-Only (2026-06-12)

**Run Steps 4 (runtime perf measurement), 6 (backward-compat git sweep), and
12 (response-contract analysis) after ANY session that changes API response
shapes or parameters** — not just during full audits, and NOT skipped by
health-runs that follow shape-changing work.

Why (proven 2026-06-12, the session that changed 6 endpoint shapes — POV-list
trim, analytics sunset, mcp/metrics + mcp/status mock eviction):
- **Step 12 caught what implementation-time consumer checks missed**: a dead
  same-named twin (`components/mcp/MCPAnalyticsDashboard.tsx`, 863 LOC, zero
  importers) was the only "consumer" of removed fields — without the sweep it
  would have stayed as a misleading future grep-hit; with it, deleted
  (`2736d726`). Third dead same-named component found that session — check
  for the **dead-twin pattern** (`components/mcp/X` vs `components/admin/X`,
  near-identical names) whenever a consumer grep returns a surprising hit.
- **Step 6** (`git log --since="1 month ago" -S"searchParams" --oneline`)
  confirms no unreviewed parameter changes are riding along.
- **Step 4** on prod quantifies the change (sub-400ms / real-payload
  verification after the mock eviction).

Sequencing: Step 12 FIRST (highest risk — orphaned consumers of removed
fields), then 6, then 4.

## 🆕 2026-05-26 Session — Run These Greps FIRST (cache-invalidation-on-mutation)

```bash
# LRU response caches must be invalidated on ALL mutations, not just create. povListCache (60s TTL)
# was invalidated on POV create but NOT delete/update → list stale "until refresh × N". Fixed
# (dafc46f9): DELETE + PUT now invalidate the list cache for owner + team + actor.
grep -rn "povListCache\|invalidatePovListCache\|invalidatePattern" app/api/pov/ --include="*.ts"

# Audit pattern: for every cached GET, confirm its DELETE/PUT/POST siblings invalidate the same cache.
grep -rn "new LRUCache\|\.invalidatePattern\|\.set(cacheKey" app/api/ --include="*.ts" | head

# permissionCache (5-min) flushed on admin role-permission change:
grep -nE "permissionCache.clear" app/api/admin/permissions/route.ts
```

---

## Executive Summary
Run this discovery to understand:
- All API list/search endpoints and query patterns
- Missing scope filters (povId, teamId, userId) causing scaling issues
- N+1 query patterns in endpoint handlers
- Response optimization opportunities
- Backward compatibility requirements
- Database index coverage for filters
- **BREAKTHROUGH**: POV-scoped activity filtering pattern (50-90% performance gain)

## Discovery Goals

1. **Map all list/search API endpoints** - Identify endpoints that return collections
2. **Identify inefficient query patterns** - Find missing scopes, N+1 patterns, over-fetching
3. **Find missing scope filters** - Detect povId/teamId/userId gaps causing scale issues
4. **Detect N+1 query patterns** - Find loops with await in API handlers
5. **Verify database indices** - Ensure all filters have corresponding indices
6. **Assess backward compatibility** - Validate optional parameters for safe evolution
7. **Verify authorization pattern** - Ensure endpoints use correct auth model (NEW 2025-11-07)

**Authorization Note**: API endpoints should use:
- **validatePOVAccess** for POV-scoped operations (requires ownerId, metadata, team.members in query)
- **checkPermission** for system-level operations (requires role_permissions entry)
- **Pattern**: `/.claude/knowledge/patterns/authorization-dual-layer-pattern.md`
- **Discovery commands**: See `/.claude/knowledge/discoveries/auth-permissions-discovery.md` section 2

## Context

**The Problem We Solve**: APIs that work fine with 10 POVs but break with 100+ POVs due to missing scope filters.

**The October 27, 2025 Breakthrough**: Analytics activity feed fetched 20 global activities and filtered client-side, resulting in unpredictable results (might get 0 activities for a specific POV). Solution: Added optional `povId` parameter for server-side filtering, guaranteeing relevant results with 50-90% data reduction.

**Key Insight**: This pattern should be systematically applied to ALL list/search APIs in the platform.

## Discovery Commands

### Step 1: Endpoint Inventory

```bash
echo "=== API ENDPOINT INVENTORY ==="
echo "--- All API Routes ---"
find app/api -name "route.ts" | wc -l
echo "Total API route files"

echo "--- List/Search Endpoints (GET) ---"
find app/api -name "route.ts" -exec grep -l "export async function GET" {} \; | wc -l
echo "GET endpoints that might return lists"

echo "--- Write Endpoints (POST/PUT/PATCH) ---"
find app/api -name "route.ts" -exec grep -l "export async function POST\|PUT\|PATCH" {} \; | wc -l
echo "Write endpoints"

echo "--- Analytics Endpoints ---"
find app/api -path "*/analytics/*" -name "route.ts"
echo "Analytics-specific routes"

echo "--- Activity/History Endpoints ---"
find app/api -name "route.ts" -exec grep -l "activity\|activities\|history" {} \;
echo "Activity tracking endpoints"

echo "--- Task List Endpoints ---"
find app/api -path "*/tasks/*" -name "route.ts" -exec grep -l "findMany" {} \;
echo "Task list endpoints with findMany"

echo "--- POV List Endpoints ---"
find app/api -path "*/povs/*" -o -path "*/pov/*" -name "route.ts"
echo "POV-related endpoints"
```

### Step 2: Query Pattern Analysis

```bash
echo "=== QUERY PATTERN ANALYSIS ==="
echo "--- Global Queries Without Scoping ---"
grep -r "prisma\.\w\+\.findMany" app/api --include="*.ts" | \
  grep -v "povId\|teamId\|userId\|ownerId" | \
  head -20
echo "findMany queries missing scope filters (RED FLAG)"

echo "--- POV-Scoped Queries (Good Pattern) ---"
grep -r "prisma\.task\.findMany" app/api --include="*.ts" | \
  grep "povId" | \
  head -10
echo "Tasks correctly scoped to POV"

echo "--- N+1 Query Patterns ---"
grep -r "for.*of.*await" app/api lib/services --include="*.ts" | \
  head -15
echo "Loops with await (potential N+1 issues)"

echo "--- Batch Query Patterns (Good) ---"
grep -r "WHERE.*IN\|where.*in:" app/api lib/services --include="*.ts" | \
  head -10
echo "Batch queries using IN clause"

echo "--- Prisma Include Patterns ---"
grep -r "include:\s*{" app/api --include="*.ts" | \
  wc -l
echo "Endpoints using include (might over-fetch)"

echo "--- Direct Assignee Lookup (Potential N+1) ---"
grep -r "\.assignee\|\.user\|\.owner" app/api --include="*.ts" | \
  grep -v "include" | \
  head -10
echo "Direct relation access without include (check for N+1)"
```

### Step 2a: Phantom Canonical Check (NEW — May 2026)

**Why this exists**: A 2026-05-02 bug had six specialists audit `lib/pov/prisma/select.ts:fullPOV` and conclude the wire carried `dependencies`. None grepped the service layer. The actual production query at `lib/pov/services/pov.ts:.get()` was a hand-rolled N+1 optimization that bypassed `fullPOV.include` entirely — fields from the canonical schema file never made it onto the wire. Audit BOTH layers.

```bash
echo "=== PHANTOM CANONICAL AUDIT ==="
echo "Bypassed canonical = service file imports a 'full' select but"
echo "uses a literal-object select() in its actual prisma.X.find* call."

echo ""
echo "--- 1. Files importing schema select but using literal selects ---"
for service in lib/*/services/*.ts; do
  if grep -lE "import.*\{.*(full|with)\w+.*\}.*from.*prisma/select" "$service" >/dev/null 2>&1; then
    if grep -lE "prisma\.\w+\.findUnique\(\s*\{\s*where" "$service" >/dev/null 2>&1; then
      echo "$service — imports canonical, uses literal select (phantom-canonical candidate)"
    fi
  fi
done

echo ""
echo "--- 2. Optimization rollback markers (high-confidence signals) ---"
grep -rn "// OLD CODE\|// commented for rollback\|N+1 OPTIMIZED\|optimization.*rollback" \
  lib/services/ lib/*/services/ 2>/dev/null

echo ""
echo "--- 3. Cross-check: schema file claims a relation, service strips it ---"
# When auditing a data-shape bug, ALWAYS run these two greps:
# (a) the canonical select file claim
grep -n "<fieldName>" lib/<domain>/prisma/select.ts
# (b) the actual runtime query
grep -rn "prisma\.<model>\.\(findUnique\|findMany\)" lib/<domain>/services/ lib/<domain>/handlers/
# Discrepancy = the bug.
```

**Pattern reference**: `.claude/knowledge/patterns/two-execution-path-drift-pattern.md` §Phantom Canonical Variant.

### Step 3: Scope Filter Assessment

```bash
echo "=== SCOPE FILTER ASSESSMENT ==="
echo "--- POV Scope Implementation ---"
grep -r "povId.*searchParams\|searchParams.*povId" app/api --include="*.ts"
echo "Endpoints supporting povId filter"

echo "--- Team Scope Implementation ---"
grep -r "teamId.*searchParams\|searchParams.*teamId" app/api --include="*.ts"
echo "Endpoints supporting teamId filter"

echo "--- Response Optimization Patterns (Week 4) ---"
grep -r "searchParams.get.*expand\|expand.*searchParams" app/api --include="*.ts"
echo "Endpoints with expand parameter (90% bandwidth reduction)"

echo "--- HTTP Caching Patterns (Week 4) ---"
grep -r "Cache-Control.*stale-while-revalidate" app/api --include="*.ts"
echo "Endpoints with HTTP caching (50% query reduction)"

echo "--- N+1 Prevention Patterns (Week 4) ---"
grep -r "includeStages.*searchParams\|searchParams.*includeStages" app/api --include="*.ts"
echo "Endpoints with includeStages parameter (prevents API-level N+1)"

echo "--- User Scope Implementation ---"
grep -r "userId.*searchParams\|searchParams.*userId" app/api --include="*.ts"
echo "Endpoints supporting userId filter"

echo "--- Missing POV Scope (Critical) ---"
grep -l "prisma\.task\.findMany\|prisma\.phase\.findMany\|prisma\.taskActivity\.findMany" app/api -r --include="*.ts" | \
  xargs grep -L "povId"
echo "Task/Phase/Activity endpoints missing povId"

echo "--- API Parameter Interfaces ---"
grep -r "interface.*Filters\|type.*Filters" lib/services --include="*.ts" | \
  head -10
echo "Filter interface definitions"

echo "--- Optional vs Required Parameters ---"
grep -r "povId\?\|teamId\?\|userId\?" lib/services --include="*.ts" | \
  head -10
echo "Optional scope parameters (good for backward compatibility)"
```

### Step 4: Performance Verification

> **POST-CHANGE SWEEP step** — run after any response-shape/parameter change, not full-audit-only (see header note, 2026-06-12).

```bash
echo "=== PERFORMANCE VERIFICATION ==="
echo "--- Pagination Support ---"
grep -r "limit.*searchParams\|take.*limit" app/api --include="*.ts" | \
  head -10
echo "Endpoints with pagination"

echo "--- Default Limits ---"
grep -r "limit.*=.*\d\+\|take:\s*\d\+" app/api --include="*.ts" | \
  head -10
echo "Default result limits"

echo "--- Query Performance Monitoring ---"
ls -la lib/database/dev-query-logger.ts 2>/dev/null || echo "No query logger found"
echo "Development query performance monitoring"

echo "--- Response Size Issues ---"
grep -r "response.*size\|response.*large\|payload.*large" app/api --include="*.ts"
echo "Comments about response size"

echo "--- Include Depth ---"
grep -r "include:\s*{.*include:" app/api --include="*.ts" | \
  head -5
echo "Deep includes (potential over-fetching)"
```

### Step 5: Database Index Coverage

```bash
echo "=== DATABASE INDEX COVERAGE ==="
echo "--- Task Indices ---"
grep -A 50 "^model Task" prisma/schema.prisma | \
  grep "@@index"
echo "Task model indices"

echo "--- TaskActivity Indices ---"
grep -A 30 "^model TaskActivity" prisma/schema.prisma | \
  grep "@@index"
echo "TaskActivity model indices"

echo "--- POV Indices ---"
grep -A 30 "^model POV" prisma/schema.prisma | \
  grep "@@index"
echo "POV model indices"

echo "--- Missing Indices Check ---"
echo "Comparing filter parameters to schema indices:"
echo "1. Extract filter fields from API routes"
grep -rh "where.*povId\|where.*teamId\|where.*status\|where.*priority" app/api --include="*.ts" | \
  sed 's/.*where\.//' | \
  sed 's/[,;}].*//' | \
  sort -u | \
  head -20
echo "2. Compare with schema indices to find missing ones"
```

### Step 6: Backward Compatibility Analysis

> **POST-CHANGE SWEEP step** — run after any response-shape/parameter change, not full-audit-only (see header note, 2026-06-12).

```bash
echo "=== BACKWARD COMPATIBILITY ANALYSIS ==="
echo "--- API Parameter Changes ---"
git log --since="1 month ago" --all -S"searchParams" --oneline | head -10
echo "Recent parameter changes"

echo "--- Optional Parameter Pattern ---"
grep -r "interface.*Filters" lib/services --include="*.ts" -A 10 | \
  grep "\?" | \
  head -15
echo "Optional parameters (backward compatible)"

echo "--- Required Parameter Pattern ---"
grep -r "interface.*Filters" lib/services --include="*.ts" -A 10 | \
  grep -v "\?" | \
  grep ":\s*string\|:\s*number" | \
  head -15
echo "Required parameters (check if new ones break existing)"

echo "--- API Client Usage ---"
grep -r "fetch.*\/api\/\|axios.*\/api\/" components lib hooks --include="*.ts" --include="*.tsx" | \
  head -20
echo "Frontend API calls to verify"

echo "--- Parameter Validation ---"
grep -r "searchParams\.get\|searchParams\.has" app/api --include="*.ts" | \
  head -15
echo "Parameter extraction patterns"
```

### Step 7: Activity API Case Study (October 27, 2025)

```bash
echo "=== OCTOBER 27 BREAKTHROUGH CASE STUDY ==="
echo "--- Activity API Implementation ---"
cat app/api/tasks/activities/route.ts | head -50
echo "Activity endpoint with POV scoping"

echo "--- Activity Service Implementation ---"
grep -A 20 "interface TaskActivityFilters" lib/tasks/services/taskActivityService.ts
echo "Filter interface with optional povId"

echo "--- Activity Query Pattern ---"
grep -A 30 "async getTaskActivities" lib/tasks/services/taskActivityService.ts | \
  grep -A 20 "prisma\.taskActivity\.findMany"
echo "Query implementation with POV filter"

echo "--- Frontend Usage ---"
grep -r "\/api\/tasks\/activities" components --include="*.tsx" --include="*.ts"
echo "Frontend callers to verify backward compatibility"

echo "--- Performance Impact ---"
git log --all -S"povId" --oneline app/api/tasks/activities/route.ts lib/tasks/services/taskActivityService.ts | head -5
echo "Commits related to POV scoping optimization"
```

## Investigation Questions

### Critical Questions
1. **Endpoint Coverage**: How many list endpoints lack POV/team/user scope filters?
2. **Scaling Risk**: Which endpoints will break with 100+ POVs?
3. **N+1 Detection**: How many N+1 patterns exist in API handlers?
4. **Index Coverage**: Do all filter parameters have corresponding database indices?
5. **Backward Compatibility**: Are new parameters optional to avoid breaking changes?

### Deep Dive Questions
6. **Response Size**: Which endpoints return unnecessarily large payloads?
7. **Pagination Gaps**: Which list endpoints lack pagination support?
8. **Query Efficiency**: Are we using batch queries or N+1 patterns?
9. **Client Impact**: Which frontend components would break with parameter changes?
10. **Migration Path**: How do we safely add scope filters to existing APIs?

### Pattern Recognition Questions
11. **POV-Scoping Pattern**: Can we apply the activity API pattern to other endpoints?
12. **Optional Parameter Pattern**: Are we following the backward-compatible pattern consistently?
13. **Batch Query Pattern**: Are we using `WHERE IN` for related data?
14. **Validation Pattern**: Are we validating access before returning data?
15. **Performance Pattern**: Are we monitoring query performance in development?

## Expected Artifacts

### Endpoint Audit Report
```markdown
# API Efficiency Audit Report

## Executive Summary
- Total endpoints analyzed: X
- List/search endpoints: Y
- Missing scope filters: Z (priority fix)
- N+1 patterns detected: N
- Index gaps: M

## Detailed Findings

### P0 - Critical (Fix Immediately)
1. **[Endpoint Name]** - Missing POV scope, will break with 100+ POVs
   - File: `app/api/[path]/route.ts`
   - Issue: Global query without scope filter
   - Fix: Add optional `povId` parameter
   - Effort: 30 minutes
   - Impact: 50-90% performance gain

### P1 - High (Fix This Week)
[Similar format for high priority issues]

### P2 - Medium (Fix This Month)
[Similar format for medium priority issues]

## Patterns Discovered

### Good Patterns
- Activity API with optional povId (October 27, 2025)
- Batch queries using WHERE IN
- Optional parameters for backward compatibility

### Anti-Patterns
- Global queries without scoping
- N+1 loops with await
- Required parameters breaking existing clients
```

### Query Optimization Recommendations
```markdown
# Query Optimization Recommendations

## POV-Scoping Pattern (Apply to N endpoints)

### Before (Inefficient)
```typescript
GET /api/tasks?status=IN_PROGRESS
→ Returns 1000 tasks from ALL POVs
→ Client filters to 10 for this POV
```

### After (Efficient)
```typescript
GET /api/tasks?povId={id}&status=IN_PROGRESS
→ Returns 10 tasks for this POV
→ No client filtering needed
→ 50-90% data reduction
```

### Implementation Checklist
- [ ] Add `povId?: string` to filter interface (optional!)
- [ ] Add `if (filters.povId) where.povId = filters.povId`
- [ ] Verify index exists: `@@index([povId])`
- [ ] Test existing callers still work
- [ ] Update API documentation
```

### Backward Compatibility Validation
```markdown
# Backward Compatibility Test Results

## Endpoints Modified
1. `/api/tasks/activities` - Added optional povId
   - ✅ Existing calls work without povId
   - ✅ New calls work with povId
   - ✅ Combined filters work (taskId + povId)
   - ✅ No breaking changes detected

## Frontend Impact Analysis
- TaskEditor.tsx: ✅ Uses taskId filter (still works)
- TaskActivityTimeline.tsx: ✅ Uses taskId filter (still works)
- AnalyticsDashboard.tsx: ✅ Now uses povId filter (improved)

## Migration Notes
- All existing callers continue to work
- New povId parameter is purely additive
- No database migration required
- No frontend changes required (optional enhancement)
```

## Validation Steps

### 1. Scale Testing
```bash
# Test with different POV counts
echo "Testing API with 10 POVs..."
time curl "http://localhost:3000/api/tasks?limit=20"

echo "Testing API with 100 POVs..."
# Create 100 POVs
time curl "http://localhost:3000/api/tasks?limit=20"

echo "Testing API with POV scope..."
time curl "http://localhost:3000/api/tasks?povId={id}&limit=20"
```

### 2. Query Count Validation
```bash
# Enable query logging
export DEBUG="prisma:query"
npm run dev

# Make API call and count queries
# Should be O(1) not O(N)
```

### 3. Response Time Validation
```bash
# Measure before optimization
time curl "http://localhost:3000/api/tasks/activities?limit=20"

# Measure after optimization
time curl "http://localhost:3000/api/tasks/activities?povId={id}&limit=10"

# Should see 50-90% improvement
```

### 4. Backward Compatibility Testing
```bash
# Test existing API calls still work
echo "Testing without new parameter..."
curl "http://localhost:3000/api/tasks/activities?taskId=abc"

echo "Testing with new parameter..."
curl "http://localhost:3000/api/tasks/activities?taskId=abc&povId=xyz"

echo "Testing new parameter alone..."
curl "http://localhost:3000/api/tasks/activities?povId=xyz"

# All three should work
```

## Success Criteria

- [ ] Complete inventory of all list/search endpoints
- [ ] Scope filter coverage report (povId, teamId, userId)
- [ ] N+1 pattern detection and remediation plan
- [ ] Database index verification complete
- [ ] Backward compatibility validation for all changes
- [ ] Performance baseline measurements (before/after)
- [ ] Priority matrix for optimization work (P0/P1/P2/P3)
- [ ] Implementation guide for POV-scoping pattern

## Key Patterns from October 27, 2025 Session

### Pattern 1: The POV-Scoping Pattern
```typescript
// Always add POV scope to list endpoints
interface Filters {
  povId?: string;  // ← Makes query scale to 100+ POVs
}

if (filters.povId) {
  where.povId = filters.povId;  // Direct field
  // OR
  where.task = { povId: filters.povId };  // Through relation
}
```

### Pattern 2: The Optional Parameter Pattern
```typescript
// New parameters must be optional (backward compatibility)
povId?: string;  // ← Optional - existing uses work
povId: string;   // ❌ Required - breaks existing uses
```

### Pattern 3: The Batch Query Pattern
```typescript
// Instead of N queries:
// for (activity of activities) { user = await findUser(activity.userId); }

// Do 1 batch query:
const userIds = activities.map(a => a.userId);
const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
const userMap = new Map(users.map(u => [u.id, u]));
activities.forEach(a => a.user = userMap.get(a.userId));
```

### Pattern 4: The Index Verification Pattern
```typescript
// Every filter needs an index
// WHERE povId = ? → @@index([povId])
// WHERE povId = ? AND status = ? → @@index([povId, status])

// Verify in schema:
model Task {
  povId String
  status TaskStatus

  @@index([povId])
  @@index([povId, status])
}
```

## Integration with Other Specialists

### Handoff to performance-analyst-specialist
When query inefficiency detected, performance-analyst can:
- Measure actual performance impact
- Analyze client-side caching opportunities
- Recommend React Query configuration

### Handoff to database-manager-specialist
When database optimization needed, database-manager can:
- Create migration for missing indices
- Optimize complex Prisma queries
- Analyze query execution plans

### Handoff to boundary-contract-specialist
When API response structure changes, boundary-contract can:
- Validate response completeness
- Check for field leakage bugs
- Ensure type safety across boundaries

### Handoff to validation-engine-specialist
When validation gaps found, validation-engine can:
- Design Zod schemas for new parameters
- Implement multi-layer validation
- Create validation test coverage

## Notes

- **Focus on user-facing impact**: APIs returning too much data hurt UX and costs
- **Systematic pattern application**: POV-scoping pattern should be standard
- **Backward compatibility always**: Optional parameters prevent breaking changes
- **Index verification critical**: Filter without index = performance disaster
- **Scale testing mandatory**: Must work with 1 POV and 1000 POVs
- **Battle-tested patterns**: October 27 breakthrough provides proven patterns

## Example Audit Workflow

**Developer Task**: "Analytics is slow with 100 POVs"

### Step 1: Activate api-efficiency-specialist
```
Use api-efficiency-specialist to audit /api/tasks/activities endpoint
```

### Step 2: Specialist runs api-efficiency-discovery.md
- Maps query patterns
- Identifies missing povId filter
- Finds N+1 query in assignee lookup
- Checks index coverage
- Validates backward compatibility

### Step 3: Specialist provides recommendations
```markdown
## Findings for /api/tasks/activities

### P0 - Missing POV Scope
**Issue**: Query returns 20 activities from ALL POVs
**Impact**: With 100 POVs, might return 0 for specific POV
**Fix**: Add optional `povId` parameter
**Effort**: 5 lines of code, 30 minutes
**Performance Gain**: 50-90% data reduction

### P1 - N+1 Query Pattern
**Issue**: Loop with await for user lookup
**Impact**: N+1 queries for N activities
**Fix**: Batch query using WHERE IN
**Effort**: 10 lines of code, 1 hour
**Performance Gain**: 70% query time reduction
```

### Step 4: Apply fixes with specialist guidance
- Ensure optional parameter (backward compatibility)
- Verify index exists (performance)
- Test existing clients (no breaking changes)
- Measure improvement (validation)

## Quick Reference Commands

```bash
# Find endpoints missing POV scope
find app/api -name "route.ts" -exec grep -l "findMany" {} \; | \
  xargs grep -L "povId"

# Find N+1 patterns
grep -r "for.*of.*await" app/api lib/services --include="*.ts"

# Check indices
grep "@@index" prisma/schema.prisma | grep -i "task\|pov\|activity"

# Find API parameter interfaces
grep -r "interface.*Filters" lib/services --include="*.ts"

# Test backward compatibility
git log --since="1 month ago" -S"searchParams" --oneline
```

## Step 8: Pino Structured Logging for API Efficiency (NEW - Feb 2026)

**Purpose**: Assess pino logger adoption in API routes and identify console.log remnants

```bash
echo "=== PINO API LOGGING ANALYSIS ==="
echo "--- Logger Usage in API Routes ---"
# 2026-06-12 health-run: routes import { logger } / { mcpLogger } from '@/lib/logger',
# NOT a logger named apiLogger — grep the generic call style (159 hits as of 2026-06-12).
grep -rn "logger\.\(info\|warn\|error\|debug\)" app/api/ --include="*.ts" | head -20
echo "pino logger calls in API routes (expect ~159)"

echo -e "\n--- dbLogger Usage in API Handlers ---"
grep -rn "dbLogger\.\(info\|warn\|error\)" lib/*/handlers/ --include="*.ts" | head -15
echo "dbLogger calls in handlers (for query performance logging)"

echo -e "\n--- Domain Logger Imports in API Code ---"
grep -rn "from.*lib/logger\|import.*logger" app/api/ --include="*.ts" | head -15
echo "Logger imports in API routes"

echo -e "\n--- Legacy console.log in API Code ---"
grep -rn "console\.\(log\|warn\|error\)" app/api/ --include="*.ts" | wc -l
echo "Legacy console.log calls in API routes (should migrate to pino)"

echo -e "\n--- Query Performance Logging ---"
grep -rn "queryTimeMs\|queriesUsed\|queryCount" app/api/ lib/*/handlers/ --include="*.ts" | head -10
echo "Structured query performance context in logs"

echo -e "\n--- Production API Domain Logs ---"
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 100 --nostream | grep '\"domain\":\"api\"' | jq" 2>/dev/null | tail -20

echo -e "\n--- Production API Errors ---"
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"api\"' | grep '\"level\":50' | jq" 2>/dev/null | tail -10

echo -e "\n--- Production Slow API Responses (level 40) ---"
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"api\"' | grep '\"level\":40' | jq" 2>/dev/null | tail -10
```

**Questions to answer**:
- Is apiLogger being used in API route files (`app/api/`)?
- Are query performance metrics (queryTimeMs, queriesUsed) being logged with structured context?
- Are there remaining console.log calls in API code that should migrate to pino?
- Are API domain logs flowing in production PM2 JSON output?
- Are there API warnings (slow responses) or errors visible in production?

---

## Step 9: Infrastructure Inventory (Renumbered)

Verify available infrastructure before optimizing:

```bash
echo "=== INFRASTRUCTURE INVENTORY ==="
echo "--- Crypto Helpers ---"
ls lib/crypto/*.ts 2>/dev/null || echo "No crypto helpers found"

echo "--- Validation Files ---"
ls lib/validation/*.ts

echo "--- Service Layer ---"
find lib -name "*Service.ts" -o -name "*service.ts" | head -20

echo "--- Helper Functions ---"
find lib -path "*/helpers/*.ts" -o -path "*/utils/*.ts" | head -20

echo "--- Cleanup Operations ---"
grep -r "deleteMany" lib app --include="*.ts" | wc -l
echo "deleteMany operations (check for batch patterns)"

echo "--- Error Handling Efficiency (Nov 2025) ---"
echo ".parse() usage (throws exceptions): $(grep -r "\.parse(data\|rawQuery\|body)" app/api lib --include="*.ts" | wc -l)"
echo ".safeParse() usage (returns errors): $(grep -r "\.safeParse(" app/api lib --include="*.ts" | wc -l)"

echo "--- Response Format Patterns (Nov 2025) ---"
echo "Pagination implementations: $(grep -r "take.*skip" app/api --include="*.ts" | wc -l)"
echo "Backward compat checks: $(grep -r "searchParams\.has.*limit" app/api --include="*.ts" | wc -l)"
```

## Step 10: Error Handling Audit (Nov 2025)

**Purpose**: Find validation errors returning 500 instead of 400

```bash
# Find potential performance issues from .parse()
echo "=== ERROR HANDLING AUDIT ==="
grep -rn "\.parse(data\|rawQuery\|body\|request)" app/api lib --include="*.ts" | \
  while read line; do
    file=$(echo "$line" | cut -d: -f1)
    lineno=$(echo "$line" | cut -d: -f2)
    echo "⚠️  $file:$lineno - Using .parse() (should be safeParse)"
  done

# Find try-catch blocks around validation
grep -B5 "\.parse(" app/api --include="*.ts" | grep "try {"

# Verify error responses
grep -r "status: 400\|status: 500" app/api --include="*.ts" | wc -l
```

## Step 11: Admin-Only REST API Discovery (Jan 2026)

**Purpose**: Map admin-only endpoints using `createHandler` with `allowedRoles`

```bash
echo "=== ADMIN-ONLY ENDPOINT DISCOVERY ==="
echo "--- Endpoints using createHandler with allowedRoles ---"
grep -r "allowedRoles.*ADMIN\|allowedRoles.*SUPER_ADMIN" app/api --include="*.ts"

echo "--- Workflow REST API Endpoints ---"
ls -la app/api/workflows/*.ts app/api/workflows/**/*.ts 2>/dev/null

echo "--- createHandler usage ---"
# 2026-06-12 health-run: call style is two-arg `createHandler(handlerFn, { allowedRoles })`
# (import from '@/lib/api-handler'), NOT `createHandler({`.
grep -rn "createHandler(" app/api --include="*.ts" | head -20

echo "--- Admin role checks in handlers ---"
grep -r "UserRole\.ADMIN\|UserRole\.SUPER_ADMIN" app/api --include="*.ts"

echo "--- Workflow schema validation ---"
grep -r "MCPWorkflow\|MCPOrchestrationParams" app/api --include="*.ts"

echo "--- Named workflow execution pattern ---"
grep -r "workflowName" app/api lib --include="*.ts"
```

**Expected Findings**:
- `/api/workflows/route.ts` - Admin-only CRUD operations
- `/api/workflows/[id]/route.ts` - Admin-only single workflow operations
- `/api/workflows/run/route.ts` - Admin-only workflow execution by name
- `allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN]` pattern

---

## Step 12: Response Contract Analysis (Nov 2025)

> **POST-CHANGE SWEEP step** — run after any response-shape/parameter change, not full-audit-only (see header note, 2026-06-12).

**Purpose**: Identify response format inconsistencies

```bash
# Find different response structures
echo "=== RESPONSE FORMAT ANALYSIS ==="
grep -r "return.*data:" app/api --include="*.ts" | \
  sed 's/.*data:/data:/' | sort | uniq -c | sort -rn | head -20

# Find clients expecting specific formats
grep -r "result\.data\.map\|result\.data\.\[" components --include="*.tsx" | \
  cut -d: -f1 | sort -u

# Check for pagination
grep -r "pagination\|total.*count" app/api --include="*.ts" | grep "return"
```

**Status**: Ready for systematic API efficiency audits. Patterns proven through October 27, 2025 and November 1, 2025 production testing sessions.
