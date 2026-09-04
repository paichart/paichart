# Middleware Patterns Discovery

**Purpose**: Discover existing middleware patterns, usage, and boilerplate refactoring opportunities
**Time**: 15-20 minutes
**Output**: Middleware inventory, usage statistics, conversion opportunities
**Created**: November 7, 2025 (from POV domain security audit learnings)

---

## When to Run This Discovery

**Before**:
- Conducting API security audit
- Reviewing authentication/authorization patterns
- Recommending architectural refactoring
- Analyzing boilerplate code opportunities

**After**:
- Running endpoint-security-audit.md (to find auth patterns)
- Finding repetitive code patterns in routes

---

## Phase 1: Discover Existing Middleware (5 min)

### Step 1.1: Find Middleware Wrappers

**Find all middleware wrapper functions**:
```bash
# Find exported middleware functions
grep -r "export function with\|export const with" lib/auth lib/middleware --include="*.ts" -n

# Expected patterns:
# - withPOVAccess (POV-scoped endpoints)
# - withAuth (general authentication)
# - requirePermission (role-based access)
# - createHandler (API handler wrapper)
```

**Record**:
- [ ] Middleware name
- [ ] File location (file:line)
- [ ] Purpose (from JSDoc comment)

---

### Step 1.2: Find Middleware Implementations

**Check middleware implementation details**:
```bash
# Find withPOVAccess specifically (POV domain pattern)
grep -A 50 "export function withPOVAccess" lib/auth/validate-pov-access.ts

# Check what it does:
# - Calls getAuthUser?
# - Loads POV from database?
# - Calls validatePOVAccess?
# - Injects context (user, pov)?
```

**Analyze**:
- [ ] What boilerplate does it eliminate?
- [ ] What context does it inject?
- [ ] What security checks does it perform?
- [ ] Performance optimizations (preloading, caching)?

---

## Phase 2: Discover Middleware Usage (5 min)

### Step 2.1: Count Middleware Usage

**How many routes use each middleware**:
```bash
# withPOVAccess usage
grep -r "withPOVAccess" app/api/pov --include="*.ts" | wc -l

# requirePermission usage
grep -r "requirePermission" app/api --include="*.ts" | wc -l

# createHandler usage
grep -r "createHandler" app/api --include="*.ts" | wc -l

# Manual auth (no middleware)
grep -r "const user = await getAuthUser" app/api --include="*.ts" | wc -l

# Handler-level auth (delegated to imported handlers — often missed by route-level grep)
# IMPORTANT: Include ALL auth patterns to avoid false "unprotected" reports
grep -rlE "getAuthUser|withPOVAccess|createHandler|withAuth|requirePermission|verifyAccessToken|buildPOVAccessFilter" app/api/ --include="*.ts" | wc -l

# Authorization helpers
grep -r "buildPOVAccessFilter" app/api --include="*.ts" | wc -l
grep -r "getPOVForAccess" lib/*/handlers --include="*.ts" | wc -l
grep -r "canManageTeamMembers" app/api --include="*.ts" | wc -l
```

**Calculate**:
- [ ] Middleware adoption % (middleware routes / total routes)
- [ ] Per-domain usage (POV, Task, Agent)
- [ ] IMPORTANT: Routes with NO auth at route level may delegate to handlers — follow imports one level deep

---

### Step 2.2: Find Usage Patterns

**How is middleware actually used**:
```bash
# Pattern 1: Direct export
grep -r "export const GET = withPOVAccess" app/api/pov --include="*.ts" | wc -l

# Pattern 2: Inline usage
grep -r "withPOVAccess(async" app/api/pov --include="*.ts" | wc -l

# Find example usages for documentation
grep -A 10 "export const GET = withPOVAccess" app/api/pov --include="*.ts" | head -30
```

**Identify**:
- [ ] Common usage patterns
- [ ] Best practices (from actual code)
- [ ] Anti-patterns (misuse cases)

---

## Phase 3: Discover Boilerplate Opportunities (5 min)

### Step 3.1: Find Manual Auth Patterns (Conversion Candidates)

**Routes with manual auth boilerplate**:
```bash
# Find routes with getAuthUser + POV loading + validatePOVAccess
grep -l "getAuthUser" app/api/pov/**/*.ts | while read file; do
  if grep -q "prisma.pOV.findUnique" "$file" && grep -q "validatePOVAccess" "$file"; then
    echo "$file (candidate for withPOVAccess)"
  fi
done

# Count conversion opportunities
grep -r "const user = await getAuthUser" app/api/pov --include="*.ts" -l | \
  xargs -I {} sh -c 'grep -q "validatePOVAccess" {} && echo {}' | wc -l
```

**Analyze**:
- [ ] How many routes could be converted?
- [ ] Which domains have most opportunities? (POV, Task, Agent)
- [ ] Estimated lines to eliminate (routes × 20-30 lines avg)

---

### Step 3.2: Measure Boilerplate Pattern

**Typical boilerplate in routes without middleware**:
```bash
# Find a representative route
grep -A 40 "export async function GET" app/api/pov/[povId]/route.ts | head -40

# Count boilerplate lines (auth + POV load + validation)
# Typical: 20-35 lines
```

**Calculate**:
- [ ] Lines of boilerplate per route (average)
- [ ] Potential savings (opportunities × lines)
- [ ] ROI (time to convert vs maintenance savings)

---

## Phase 4: Discover Validation Helpers (5 min)

### Step 4.1: Find Inline Validation Functions

**Discover validation helper functions**:
```bash
# Find validateCUIDFormat and similar helpers
grep -r "export function validate" lib/validation/id-validation.ts

# Find usage
grep -r "validateCUIDFormat\|validateCUIDFormats" app/api --include="*.ts" | wc -l

# Find inline regex patterns (should be zero if helpers are used)
grep -r "match.*c\[a-z0-9\]\{24\}" app/api --include="*.ts" | wc -l
```

**Check**:
- [ ] Consistency (all routes use helpers vs inline regex?)
- [ ] Coverage (DELETE routes using validateCUIDFormat?)
- [ ] Gaps (any routes with inline validation?)

---

### Step 4.2: Discover File Structure Patterns

**Analyze validation file organization**:
```bash
# List all validation files
ls -lh lib/validation/*.ts

# Check file sizes (detect domain cohesion)
wc -l lib/validation/*.ts | sort -n

# Find largest validation files (likely domain aggregators)
wc -l lib/validation/*.ts | sort -rn | head -5

# Example findings:
# - pov.ts: 561 lines (complete POV domain)
# - agent-template-validation.ts: 541 lines (complete Agent domain)
# - task-validation.ts: 165 lines (Task domain)
```

**Identify Pattern**:
- [ ] One file per domain? (good pattern)
- [ ] One file per feature? (file proliferation)
- [ ] File size distribution (cohesion metric)

---

## Phase 5: Discover Security Testing Patterns (5 min)

### Step 5.1: Find Security Test Suites

**Discover test scripts**:
```bash
# Find security test scripts
ls -la scripts/test-*security*.js

# Check what they validate
grep "^function check\|^test(" scripts/test-pov-security.js | wc -l

# Find security validation patterns
grep "detectPromptInjection\|XSS\|DoS\|CUID" scripts/test-pov-security.js | head -10
```

**Analyze**:
- [ ] How many security tests?
- [ ] What do they validate?
- [ ] Pattern: File-based or runtime?

---

## Output Format

After running discovery, provide:

### Middleware Inventory
```
Middleware Wrappers Found:
1. withPOVAccess (lib/auth/validate-pov-access.ts:367)
   - Purpose: POV-scoped endpoints (single POV gate)
   - Usage: 23 routes
   - Eliminates: ~30 lines per route

2. requirePermission — ⚠️ DELETED 2026-06-06 (`middleware/auth.ts` was dead code, zero callers).
   - Live equivalent: route protection is `authMiddleware` (`lib/auth/middleware.ts`) + `checkPermission` (`lib/auth/permissions`)
   - Purpose: Role-based access

3. createHandler (lib/api-handler.ts:X)
   - Purpose: API handler wrapper
   - Usage: 74 routes

Authorization Helpers (complementary to middleware):
4. buildPOVAccessFilter (lib/pov/auth/pov-access-filter.ts)
   - Purpose: Multi-POV WHERE clause for lists/dashboards
   - Usage: 9 endpoints
   - Created: April 2026 (consolidated from 9 inline duplications)

5. getPOVForAccess (lib/tasks/helpers/pov-access.ts)
   - Purpose: Direct POV lookup for validatePOVAccess in handlers
   - Usage: 6 call sites
   - Created: April 2026 (consolidated from 6 inline duplications)

6. canManageTeamMembers (lib/pov/auth/team-authorization.ts)
   - Purpose: Team management authorization with PM restrictions
   - Usage: 5 endpoints
   - Created: November 2025
```

### Adoption Metrics
```
Middleware Adoption:
- POV domain: 21/30 routes (70%)
- Task domain: 5/45 routes (11%)
- Agent domain: 3/30 routes (10%)

Conversion Opportunities:
- POV: 9 routes (could convert)
- Task: 40 routes (could convert)
- Agent: 27 routes (could convert)

Potential Savings:
- ~76 routes × 25 lines = ~1,900 lines of boilerplate
```

### Boilerplate Patterns
```
Common Boilerplate Found:
1. getAuthUser + return 401 (found in 45 routes)
2. prisma.pOV.findUnique + return 404 (found in 25 routes)
3. validatePOVAccess + return 403 (found in 20 routes)

Recommendation: Convert to withPOVAccess middleware
```

### Validation Consistency
```
Validation Patterns:
- Schemas use helpers: 100% (OptionalCUID, POVId)
- DELETE routes use helpers: 100% (validateCUIDFormat)
- Inline regex: 0 occurrences ✅

Consistency: EXCELLENT
```

---

## Integration with Specialists

**Specialists should**:
1. Run this discovery BEFORE analysis
2. Use grep output to populate current state knowledge
3. Reference patterns (not hardcode line numbers)
4. Make recommendations based on discovery findings

**Example Specialist Usage**:
```
Before analyzing POV routes, I'll run middleware-patterns-discovery.md:
- Found: withPOVAccess used in 21 routes
- Found: 9 routes still using manual auth
- Recommendation: Convert remaining 9 routes to withPOVAccess
- Reference: .claude/knowledge/patterns/api-security-withPOVAccess-pattern.md
```

---

---

## Phase 6: Data Loading Assumptions (5 min)

**Added**: November 7, 2025 (from GET /api/pov/[povId] bug)

### Step 6.1: Find Routes Returning Middleware Entities Directly

**Dangerous Pattern** (may be missing data):
```bash
# Routes returning pov directly from withPOVAccess
grep -r "return.*NextResponse.json(pov)" app/api/pov --include="*.ts" -l | \
  while read file; do
    if grep -q "withPOVAccess" "$file"; then
      echo "⚠️  $file (returns pov directly)"
      # Check if route loads additional data
      if ! grep -q "Handler\|Service\|prisma\." "$file"; then
        echo "   ❌ RISK: No additional data loading (may be incomplete)"
      fi
    fi
  done

# Expected: 0 files (all routes load own data or call handlers)
```

**What to Check**:
```
withPOVAccess provides (lightweight):
- POV basic fields ✅
- Team members ✅
- Missing: phases, stages, tasks, launch, kpi ❌

If route returns pov directly:
- Question: Does UI need phases/stages/tasks?
- If YES: Must call handler (getPoVHandler) or load separately
- If NO: Safe to return pov
```

---

### Step 6.2: Find Handler Shortcuts (Risky Optimizations)

**Pattern to Find**:
```bash
# Handlers with optimization shortcuts
grep -r "if.*user.*&&.*pov" lib/*/handlers/*.ts -B 2 -A 5

# Example risky pattern:
# if (user && pov) {
#   return pov;  // ← Returns what middleware provided (may be incomplete!)
# }
```

**Analyze Each**:
```markdown
Handler Shortcuts Found:

1. lib/pov/handlers/get.ts:14
   - Pattern: if (user && pov) return pov;
   - Risk: HIGH (returns lightweight pov, missing phases/stages/tasks)
   - Impact: GET /api/pov/[povId] broken (Nov 7, 2025)
   - Fix: Don't pass user/pov to handler, force full load

2. lib/pov/handlers/delete.ts:14
   - Pattern: if (user && pov) { log only }
   - Risk: NONE (continues with delete logic)
   - Impact: Safe (just logging optimization)

3. lib/pov/handlers/put.ts:383
   - Pattern: if (user && pov) { use them for auth }
   - Risk: NONE (continues with update logic)
   - Impact: Safe (skips auth, not data loading)
```

**Record**:
- [ ] Handler shortcuts found: ?
- [ ] Risky shortcuts (early return): ?
- [ ] Safe shortcuts (auth skip): ?

**Recommendation**:
- Document risky shortcuts (why they exist, how to use safely)
- Add tests for shortcut behavior
- Or remove shortcuts (simpler, safer)

---

### Step 6.3: Validate Middleware Contract

**Check What Middleware Loads**:
```bash
# Find withPOVAccess implementation
grep -A 50 "export function withPOVAccess" lib/auth/validate-pov-access.ts | \
  grep "include:"

# Should show:
# include: {
#   team: {
#     include: {
#       members: { select: { id, userId, role } }
#     }
#   }
# }

# Does NOT include: phases, stages, tasks, etc.
```

**Document Contract**:
```markdown
withPOVAccess Provides:
- ✅ POV.id, POV.title, POV.ownerId, etc. (all POV fields)
- ✅ POV.team.members (id, userId, role)
- ❌ POV.phases (must load separately)
- ❌ POV.stages (must load separately)
- ❌ POV.tasks (must load separately)
- ❌ POV.launch, kpi, etc. (must load separately)

Safe Patterns:
1. Load own data: const phases = await prisma.phase.findMany(...)
2. Call handler: const data = await someHandler(req, { params })
3. Return specific entity: return NextResponse.json(created)

Unsafe Patterns:
1. Return pov directly: return NextResponse.json(pov) ← May be incomplete!
```

---

## Output Format

### Data Loading Assumptions Report

```markdown
# Middleware Data Loading Report

**Date**: [date]

## Routes Returning Middleware Entities

**POV Routes**:
- Routes checked: ? (withPOVAccess routes)
- Returning pov directly: ? routes
- Risky (no additional loading): ? routes ← INVESTIGATE

**Task Routes** (if withTaskAccess exists):
- Routes checked: ?
- Returning task directly: ?
- Risky: ?

## Handler Shortcuts

**Total Shortcuts**: ?
- Risky (early return): ? ← DOCUMENT OR REMOVE
- Safe (auth skip): ? ← OK

**New Shortcuts This Quarter**: ?
- If > 0: Review for safety

## Middleware Contract Validation

**withPOVAccess Loads**:
- ✅ POV fields
- ✅ Team members
- ❌ Phases/stages/tasks (must load separately)

**Routes Understanding Contract**:
- ✅ Routes loading own data: ?
- ✅ Routes calling handlers: ?
- ⚠️  Routes with assumptions: ? ← VERIFY

## Recommendations

**If Risky Routes Found**:
- [ ] Verify UI doesn't need missing data
- [ ] If needed: Call handler or load separately
- [ ] Document: Why pov alone is sufficient

**If Handler Shortcuts Growing**:
- [ ] Document all shortcuts (purpose, safety)
- [ ] Add tests for shortcut behaviors
- [ ] Consider: Remove for simplicity

**If Contract Unclear**:
- [ ] Document: What each middleware provides
- [ ] Update: Handler signatures (explicit types)
- [ ] Test: Middleware data loading completeness
```

---

**Created**: 2025-11-07
**Proven**: Found GET /api/pov/[povId] bug (returned incomplete pov)
**Frequency**: Quarterly (check for new instances)

**END OF MIDDLEWARE PATTERNS DISCOVERY (Enhanced)**


---

## Wave 6 Update — Middleware Now Spans 2 Files (May 21, 2026)

Pre-Wave-5 (Feb 2026): all Express middleware lived inline in `mcp-server-http-clean.js`.
Post-Wave-5 (commit `cf2b71fa`): non-path-scoped middleware (JSON parser, CORS, helmet, raw-body, origin validation) moved to `lib/mcp/server/express-setup.ts:configureExpressMiddleware`.
Post-Wave-6 (commit `8c192d3d`): **path-scoped middleware moved with their owning route group**:

| Middleware | Type | Location |
|---|---|---|
| JSON body parser, CORS, helmet, origin validation | Global | `lib/mcp/server/express-setup.ts:configureExpressMiddleware` (Wave 5) |
| **B1 — `/mcp` Link header middleware** | Path-scoped `app.use('/mcp', ...)` | `lib/mcp/server/routes/oauth-discovery-routes.ts:registerLinkHeaderMiddleware` (Wave 6 Phase 6.3) |
| **B2 — `POST /mcp` unauth'd-initialize → 401 trigger** | Method+path-scoped `app.post('/mcp', ...)` | `lib/mcp/server/routes/oauth-flow-routes.ts:registerB2UnauthInitializeMiddleware` (Wave 6 Phase 6.4) |

### Why B1 and B2 split across files

They share the `/mcp` path prefix but serve different concerns. B1 belongs with OAuth discovery metadata (RFC 9728 Link header pointing to the resource-metadata endpoint). B2 belongs with OAuth flow (RFC 6750 401 trigger that initiates Claude Desktop's OAuth discovery).

### Hazard H-2 across files — registration order

The orchestrator at `lib/mcp/server/routes/index.ts:registerAllRoutes` calls registrars in this order: `health → oauth-discovery → oauth-flow → mcp-transport`. This ensures:

1. B1 (in oauth-discovery) registers BEFORE B2 (in oauth-flow) — original ordering preserved
2. B2 (in oauth-flow) registers BEFORE R11 (in mcp-transport) — so B2's 401 trigger fires when R11's authMiddleware would otherwise short-circuit unauth'd POST

`scripts/test-routes-orchestrator.ts` Test 2 (handler-identity assertion) defends this order.

### When auditing middleware ordering

1. The Wave 5 global middleware in `configureExpressMiddleware` ALWAYS runs first (configured before any `register*Routes()` call in the server class).
2. Order WITHIN a route file: `registerOAuthFlowRoutes` calls B2 first, then R7/R8/R9/R10.
3. Order ACROSS route files: enforced by the orchestrator. DO NOT add new path-scoped middleware that depends on a different route file's middleware firing first without updating the orchestrator order + test.

@see `lib/mcp/server/routes/index.ts` (orchestrator order)
@see `cline_docs/reviews/express-routes-extraction-2026-05-21/express-routes-extraction-plan-v2.md` D4 (load-bearing order)
