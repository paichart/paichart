# Boundary Contracts — Domain Pattern Library

> **Created 2026-06-11** by the Protocol 12 eviction pilot: this is the knowledge depth moved
> OUT of `boundary-contract-specialist.md` (was 2,201 lines). The specialist is the router;
> this file is the store. Content below is verbatim from the agent file at eviction time —
> dates and commit refs are provenance, not currency claims. Canonical method: the
> **5-Minute Boundary Debug Protocol** lives here (§ below) — the agent file carries only the
> step summary. NOTE: the protocol appears in three historical versions (Oct 2025, Nov 2025,
> Nov 20 2025 + runtime verification); the LAST version (§Runtime Field Name Verification →
> "Updated 5-Minute Protocol") is canonical — earlier versions retained for provenance only.

---

## Pino Structured Logging for Boundary Diagnostics

**Pattern Reference**: `/.claude/knowledge/patterns/pino-structured-logging-pattern.md` (Pattern #43, 96% confidence)

### Two Logging Systems (Do NOT Confuse)

| System | Purpose | Output | When to Use |
|--------|---------|--------|-------------|
| **pino** (structured JSON) | All server-side logging | PM2 stdout (JSON lines) | Boundary crossing diagnostics, field validation, contract violations |
| **OAuth audit logger** | OAuth-specific audit trail | `/var/log/paichart/oauth-audit.log` | OAuth token minting, provider callbacks |

### Boundary-Relevant Domain Loggers

All loggers imported from `lib/logger.ts` with correct pino API: **object first, message string second**.

| Logger | Domain | Boundary Use Case |
|--------|--------|-------------------|
| `authLogger` | Authentication | Boundary crossings in auth chain (JWT → AuthUser → req.user → RBAC) |
| `apiLogger` | API operations | Contract violations at API boundaries, validation failures |
| `mcpLogger` | MCP operations | MCP transport boundary events, ensureObject guard triggers |
| `complianceLogger` | Compliance | Security-relevant boundary violations (field leakage in auth) |

### Correct pino API for Boundary Logging

```typescript
import { authLogger, apiLogger, mcpLogger } from '@/lib/logger';

// ✅ CORRECT: Object first, message second
authLogger.debug({ boundary: 'JWT → AuthUser', fields: Object.keys(decoded), userId: decoded.sub }, 'Boundary crossing');
authLogger.warn({ boundary: 'JWT → AuthUser', missing: ['email', 'role'] }, 'Contract violation: missing fields');
apiLogger.warn({ boundary: 'Frontend → API', field: 'revenue', expected: 'number', received: typeof value }, 'Type mismatch at boundary');
mcpLogger.warn({ boundary: 'Transport → Handler', field: 'arguments', wasString: typeof args === 'string' }, 'Transport coercion detected');

// ❌ WRONG: Message first (console.log style)
authLogger.debug('Boundary crossing', { fields });  // WRONG ORDER

// ❌ WRONG: error key (pino uses 'err' for auto-serialization)
authLogger.error({ error: e }, 'Failed');  // Use { err: e } instead
```

### Production PM2 Log Analysis for Boundary Debugging

```bash
# Auth boundary events (JWT, AuthUser, RBAC chain)
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"auth\"' | jq '{msg: .msg, boundary: .boundary, userId: .userId, level: .level}'" 2>/dev/null | tail -20

# Auth warnings (contract violations, missing fields)
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 500 --nostream | grep '\"domain\":\"auth\"' | grep '\"level\":40' | jq" 2>/dev/null | tail -20

# API boundary violations (type mismatches, validation failures)
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 300 --nostream | grep '\"domain\":\"api\"' | grep '\"level\":40' | jq '{msg: .msg, field: .field, expected: .expected}'" 2>/dev/null | tail -10

# MCP transport boundary coercion events
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 300 --nostream | grep '\"domain\":\"mcp\"' | grep -i 'coercion\|ensureObject\|boundary' | jq" 2>/dev/null | tail -10

# All errors across domains (boundary failure triage)
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"level\":50' | jq '{domain: .domain, msg: .msg, err: .err.message}'" 2>/dev/null | tail -20
```

### Boundary Logging Checklist

When implementing or reviewing boundary crossings:
- [ ] BoundaryLogger uses `authLogger` (not console.log) for crossing events
- [ ] Missing field warnings logged with `authLogger.warn({ boundary, missing }, ...)`
- [ ] Runtime verification uses `authLogger.debug({ fields: Object.keys(user) }, ...)` not console.error
- [ ] Transport coercion guarded by `ensureObject` and logged with `mcpLogger.warn()`
- [ ] Error serialization uses `{ err: error }` key (pino auto-serialization)
- [ ] Contract violation details include: boundary name, expected fields, actual fields


---

## Core Knowledge and Expertise

### The Boundary Field Leakage Pattern

**Definition:** Required fields disappear as data crosses system boundaries, causing downstream failures despite successful upstream operations.

**Historical Examples:**
1. **Oct 20, 2025:** Missing `req.user.token` field
   - Boundary: MCP auth → req.user → API forwarding
   - Symptom: Authentication succeeded, API returned 401
   - Root Cause: token field not included in req.user
   - Fix: Add `token: token,` to req.user
   - Debug time: 2 hours (5+ iterations)

2. **Oct 21, 2025:** Missing `email`/`role` in RS256 JWT
   - Boundary: User object → JWT payload → AuthUser
   - Symptom: Authentication succeeded, DEMO_USER saw 0 POVs
   - Root Cause: email/role not included in JWT payload
   - Fix: Add email and role to mintMcpToken
   - Debug time: 1 hour (5+ iterations)

**Common Characteristics:**
- ✅ Upstream succeeds (auth works, no errors)
- ❌ Downstream fails mysteriously (0 results, 401s)
- 🔍 Root cause: Missing fields in data structure
- 💡 Fix: One-line change with massive impact

3. **Nov 15, 2025:** MCP Pagination Metadata Preservation (Success Story ✅)
   - Boundary: API response → MCP tool layer → AI clients
   - Previous: API returned pagination, MCP stripped it (field leakage!)
   - Symptom: Users confused about completeness ("Did I get all results?")
   - Solution: MetadataEnhancer preserves API metadata through MCP boundary
   - Impact: 80% reduction in user confusion
   - Pattern: Successful boundary contract - all fields preserved
   - Debug time: 0 (prevented by good boundary design!)

**Success Pattern**: MetadataEnhancer demonstrates proper boundary contract
```javascript
// Boundary Contract: API → MCP
API provides: { data, total, pagination, _performance }
MCP exposes: { _meta: { pagination, performance } }  // ✅ All preserved!
AI receives: Complete metadata for intelligent decisions
```

**Reference**: `/.claude/knowledge/patterns/mcp-metadata-exposure-pattern.md`

---

### Typed-Error Discriminator Contract (Apr 2026)

**Three rules — all enforced; violations are CRITICAL findings during review:**

1. **Every domain error MUST extend `AppError`** (`lib/errors.ts:4`). Never raw `Error`. The base class carries `.code` (string discriminator) and `.details` (forensic payload). Catch sites read `instanceof` to discriminate; `.code` survives across MCP/HTTP/SSE boundaries only if the error is `AppError`-typed.

2. **MCP boundary catches MUST preserve `.code`.** Two paths today, both need the same shape:
   - HTTP route catch (`app/api/mcp/tasks/action/route.ts`): `if (error instanceof AppError) return {error: {code, message, details}}` BEFORE the generic flatten-to-INTERNAL_ERROR.
   - stdio MCP tool catch (`lib/mcp/server/tools/advanced/task-action-handler.js`): extract `error.code` into `_meta.errorCode`.
   - Pattern: typed-error preservation BEFORE the generic catch flattens. Working precedent: `app/api/tasks/[taskId]/agent/execute/route.ts:228`.

3. **`securityEvent: true` tagging is asymmetric** — emit at violation site, NOT on the error class. Tag mismatches/violations; do NOT tag legacy soft-warns or benign races. Verified codebase convention (9+ sites: `service-call-handler.js:236,260`, `prompt-registry.js:601`, etc.). Putting the flag on the error class would conflate typed-error discrimination with log-search markers — there's no consumer that reads `securityEvent` off `error`, only off pino payloads.

**Production reference**: harness clobber-detection (`cline_docs/reviews/harness-clobber-detection-2026-04-25/`) — Items 3d, 3g.1, 3g.2 implement all three rules; `scripts/test-mcp-boundary-error-codes.ts` regression locks them in.

---

### The 5-Minute Boundary Debug Protocol

**Use this when encountering "works in A, broken in B" bugs:**

#### Step 1: Comparative Analysis (2 min)
```javascript
// Find working path
const workingPath = {
  context: 'Web App',
  auth: 'HS256 JWT from cookie',
  user: { userId: 'x', email: 'y@ex.com', role: 'DEMO_USER' }
};

// Find broken path
const brokenPath = {
  context: 'ChatGPT/MCP',
  auth: 'RS256 JWT from OAuth',
  user: { userId: 'x', email: undefined, role: undefined }  // ← LEAKAGE!
};

// COMPARE (use grep/logging to capture these)
authLogger.debug({ fields: Object.keys(workingPath.user) }, 'Working path user fields');
authLogger.debug({ fields: Object.keys(brokenPath.user) }, 'Broken path user fields');
authLogger.warn({ missing: Object.keys(workingPath.user).filter(k => !brokenPath.user[k]) }, 'Missing fields in broken path');
```

#### Step 2: Contract Definition (1 min)
```typescript
// Look at DESTINATION (consumer) code
// Example: app/api/pov/route.ts line 176
if (user.role === 'DEMO_USER') {  // ← Uses user.role

// CONTRACT REQUIRED:
interface AuthUser {
  userId: string;  // ✅
  email: string;   // ✅
  role: UserRole;  // ✅ REQUIRED for this code!
}
```

#### Step 3: Gap Analysis (1 min)
```javascript
// What does SOURCE produce?
const jwtPayload = jwt.decode(rs256Token);
authLogger.debug({ fields: Object.keys(jwtPayload) }, 'Source JWT fields');
// Output: ['sub', 'scope', 'jti', 'azp', 'iss', 'aud', 'exp']

// What does DESTINATION need?
const contract = ['userId', 'email', 'role'];

// GAP
const missing = contract.filter(f => !jwtPayload[f] && f !== 'userId');
// Output: ['email', 'role']
```

#### Step 4: Fix (1 min)
```javascript
// Add missing fields to SOURCE
const payload = {
  scope,
  jti,
  azp,
  email,  // ✅ Add
  role    // ✅ Add
};
```

**Total: 5 minutes to root cause** (vs 1-2 hours traditional debugging)

---

### Frontend/Backend Type Mismatch Patterns ⭐ NEW 2025-11-02

**Source**: Week 6 POV validation debugging (commits 18b0193, 2dfd58f)
**Evidence**: Proven in production, prevented 15 validation errors
**Confidence**: 98% (production-validated)

These are boundary contract violations where the **data type** (not field presence) mismatches between frontend and backend.

#### Boundary Pattern 1: String Numbers (Frontend → Backend)

**Manifestation**: API returns 400 "Expected number, received string"
**Boundary**: HTML Form → API → Validation Schema
**Root Cause**: HTML form inputs ALWAYS send strings, even for `<input type="number">`

**Example**:
```typescript
// Frontend sends:
POST /api/pov/[id]
{ revenue: "2000000" }  // String from <input type="number">

// Backend schema expects:
{ revenue: number }

// Result: Validation error ❌
// Error: "Expected number, received string"
```

**5-Minute Detection Method** (Comparative Analysis):
```
Frontend EditorState:       Backend Schema:           Match?
revenue: "2000000" (string) revenue: z.number()       ❌ TYPE MISMATCH

Gap: Frontend sends string, Backend expects number
```

**Solution Options**:

1. **Fix Frontend** (preferred for type safety):
   ```typescript
   // Convert to number before API call
   const submitData = {
     ...formData,
     revenue: parseInt(formData.revenue) || 0
   };
   ```

2. **Fix Backend** (when frontend can't be changed):
   ```typescript
   // Accept and coerce (validation-engine Pattern 3)
   revenue: z.union([z.string(), z.number()])
     .transform(val => typeof val === 'string' ? parseFloat(val) : val)
     .pipe(z.number().min(0))
     .optional()
   ```

**Common Fields Affected**:
- Financial: `revenue`, `budget`, `estimatedBudget`, `cost`, `price`
- Counts: `quantity`, `count`, `limit`, `maxRetries`, `timeout`
- Metrics: `progress`, `percentage`, `rating`

**Evidence**: Fixed revenue validation error in production (Week 6, commit 2dfd58f)

---

#### Boundary Pattern 2: Null vs Undefined (Frontend → Backend)

**Manifestation**: API returns 400 "Invalid input" even with `.optional()`
**Boundary**: Frontend Form → API → Zod Validation
**Root Cause**: Frontend sends `null` for empty fields, `.optional()` only accepts `undefined`

**Example**:
```typescript
// Frontend sends:
POST /api/tasks
{ dueDate: null }  // Empty date field sends null

// Backend schema:
{ dueDate: z.string().optional() }  // Only accepts undefined!

// Result: Validation error ❌
// Error: "Invalid input"
```

**5-Minute Detection Method**:
```
Frontend EditorState:       Backend Schema:               Match?
dueDate: null               dueDate: .optional()          ❌ NULL NOT ACCEPTED
                            (accepts undefined only)

Gap: Frontend sends null, Schema only accepts undefined
```

**The Gotcha**:
- `.optional()` → Accepts `undefined` (field missing)
- `.nullable()` → Accepts `null` (field present but null)
- Need BOTH → `.nullable().optional()` or `.nullish()`

**Solution**:
```typescript
// ✅ Accept both null and undefined (validation-engine Pattern 1)
dueDate: z.string().nullable().optional()

// OR shorthand:
dueDate: z.string().nullish()
```

**Common Fields Affected**:
- Dates: `dueDate`, `startDate`, `endDate`, `forecastDate`
- Optional text: `description`, `notes`, `comments`
- Optional references: `assigneeId`, `parentId`, `categoryId`

**Evidence**: Fixed 14 dueDate validation errors in production (Week 6, commit 2dfd58f)

---

#### Boundary Pattern 3: Object vs String (Multi-Source Data)

**Manifestation**: API returns 400 "Expected string, received object" OR vice versa
**Boundary**: Multi-Source (UI + Agent + External API) → Backend
**Root Cause**: Different sources send different formats for the same field

**Example**:
```typescript
// UI sends:
{ inputContext: "User provided context string" }

// Agent sends:
{ inputContext: { type: "agent", data: {...}, config: {...} } }

// External API sends:
{ inputContext: '{"legacy": "json string"}' }

// Backend schema (too strict):
{ inputContext: z.string() }  // Rejects object ❌
```

**5-Minute Detection Method**:
```
UI EditorState:              Agent Config:           Backend Schema:        Match?
inputContext: "string"       inputContext: {...}     z.string()            ⚠️ PARTIAL

Gap: Multiple valid formats, schema accepts only one
```

**Solution**:
```typescript
// ✅ Accept both formats (validation-engine Pattern 4)
inputContext: z.union([
  z.string().max(10000),      // UI sends string
  z.record(z.any())           // Agent sends object
])
  .nullable()
  .optional()
```

**Common Fields Affected**:
- Configuration: `inputContext`, `metadata`, `config`, `settings`
- Custom data: `customFields`, `attributes`, `properties`
- Legacy compatibility: `oldFormat`, `legacyData`

**Evidence**: Fixed inputContext validation error in production (Week 6, commit 18b0193)

---

#### Boundary Pattern 4: MCP Transport Boundary Coercion ⭐ NEW 2026-02-15

**Manifestation**: Zod `.parse()` fails with "Expected object, received string" OR Prisma Json column stores stringified objects
**Boundary**: MCP Client (stdio/SSE/HTTP) → Transport → MCP Server → Tool Handler
**Root Cause**: MCP transports may silently serialize nested objects to JSON strings during transit

**Example**:
```typescript
// Client sends:
services({ action: "call", arguments: { filters: { state: "TX" } } })

// After transport, inner arguments may arrive as:
{ arguments: '{"filters":{"state":"TX"}}' }  // String, not object!

// Tool handler:
tool.inputSchema.parse(args);  // ❌ Zod rejects string
```

**5-Minute Detection Method**:
```bash
# Find all callTool/CallToolRequestSchema sites
grep -rn "CallToolRequestSchema\|callTool" --include="*.ts" --include="*.js" | grep -v node_modules

# Check each for ensureObject guard
grep -rn "ensureObject" --include="*.ts" --include="*.js" | grep -v node_modules

# Find UNGUARDED sites (parse without ensureObject)
grep -rn "\.parse(.*args\|\.parse(.*arguments" services/ --include="*.ts"
```

**Solution**: Apply `ensureObject` utility at every transport boundary BEFORE validation:
```typescript
// lib/utils/ensure-object.ts (shared utility)
// OR inline in Docker services (cannot import from lib/)
const safeArgs = ensureObject(args, {}, 'Service Name');
const validatedInput = tool.inputSchema.parse(safeArgs);
```

**Guard Locations** (updated Apr 8 2026 — Phase 2 proper / Bug Class 73 eradication):
- `mcp-server-v5.js` - stdio entry (guard before Prisma write)
- ~~`mcp-embedded-bridge.js`~~ — **DELETED Apr 8 2026** (Phase 2.P0 step 3, dead code with no live launcher)
- `embedded-server.ts` - defense-in-depth (indirect external args)
- `mcpService.ts` - gateway to embedded server
- `service-call-handler.js` - hub inner arguments
- `workflow-tools-handler.js` - workflow step arguments
- `service-caller.ts` - workflow orchestration
- 6x Docker services - inline guard before `.parse()`

**Key Distinction**: Top-level `request.params.arguments` (SDK-validated as object) vs inner `arguments` field in `services(action: "call")` (CAN be string from AI client). Both need guards.

**References**:
- Pattern: `/.claude/knowledge/patterns/transport-boundary-argument-coercion-pattern.md`
- Utility: `lib/utils/ensure-object.ts` (sole source of truth — the `.js` sibling was deleted Apr 8 2026; extensionless `require('.../ensure-object')` resolves to the `.ts` via ts-node in both PM2 processes)
- Gold standard: `/.claude/knowledge/patterns/docker-mcp-service-gold-standard-v2.md`
- Review: `cline_docs/reviews/ensure-object-utility-2026-02-15/`

**Evidence**: Fixed 8 P0 unguarded sites + consolidated 4 existing guards (Feb 2026, commit 82c40f9f)

---

#### Boundary Pattern 5: Adapter ↔ API Response Shape Mismatch ⭐ 2026-03-28

**Manifestation**: HTTP 200 success but UI crashes or shows wrong/empty data
**Boundary**: Client-side adapter (`lib/pov/api/`) ↔ API route (`app/api/`)
**Root Cause**: Adapter reads field name X from response but API returns field name Y, or API select clause omits fields the adapter expects

**Example** (4 bugs found in one session):
```typescript
// API returns:
{ success: true, data: { id, name, defaultRole, ... } }

// Adapter reads:
const updatedTemplate = data.template;  // ← UNDEFINED (should be data.data)
updatedTemplate.id;  // ← CRASH: Cannot read properties of undefined

// Also: adapter sends PUT body without metadata field → modelParameters never saved
// Also: API select omits promptTemplate → adapter can't read back updated value
// Also: getTemplates() hardcodes modelParameters instead of reading metadata
```

**5-Minute Detection Method**:
```bash
# Compare adapter field reads to API response shape
grep -n "data\.\|response\." lib/pov/api/agent-templates-adapter.ts | head -20
grep -n "NextResponse.json" app/api/agent-templates/[templateId]/route.ts

# Compare adapter request body to API validation schema fields
grep -n "body: JSON" lib/pov/api/agent-templates-adapter.ts
grep -n "Schema" lib/validation/agent-template-validation.ts | head -5

# Compare list vs detail select clauses (asymmetry bug)
grep -A15 "select:" app/api/agent-templates/route.ts | head -20
grep -A15 "select:" app/api/agent-templates/[templateId]/route.ts | head -20
```

**Bug Subclasses**:
- **Response field mismatch**: `data.template` vs `data.data`
- **Missing select field**: API omits `metadata` from select clause
- **Hardcoded fallback masking real data**: `getTemplates()` hardcodes defaults
- **Request body missing field**: PUT doesn't send `metadata`
- **List vs detail asymmetry**: List endpoint missing fields detail endpoint has
- **Parity drift**: Streaming route assembles prompt differently from engine

**Discovery**: `/.claude/knowledge/discoveries/boundary-response-shape-discovery.md`
**Evidence**: Fixed 4 bugs on /agents page + 2 more found in session review (Mar 2026)

---

#### Boundary Pattern 6: Double `.optional()` Anti-Pattern ⭐ 2026-03-29

**Manifestation**: Code smell; `OptionalCUID('fieldId').optional()` applies `.optional()` twice
**Boundary**: Validation schema definition → Runtime behavior
**Root Cause**: `OptionalCUID` and `FormField.*` helpers already include `.optional()` internally

**Example**:
```typescript
// ❌ WRONG - Double .optional() (OptionalCUID already includes it)
targetPhaseId: OptionalCUID('phaseId').optional(),

// ✅ CORRECT
targetPhaseId: OptionalCUID('phaseId'),
```

**5-Minute Detection**:
```bash
# Find double .optional() with OptionalCUID
grep -rn "OptionalCUID.*\.optional()" lib/validation/ --include="*.ts"

# Find double .optional() with FormField helpers
grep -rn "FormField\.\w\+()\.optional()" lib/validation/ --include="*.ts"
```

**Evidence**: Fixed 7 instances in task-validation.ts (Mar 2026, commit a7a754cb)

---

#### Boundary Pattern 7: Select Clause Incompleteness ⭐ 2026-03-29

**Manifestation**: Adapter reads field X from API response but Prisma `select` clause doesn't include it → `undefined` at runtime
**Boundary**: API route (Prisma select) → Adapter/consumer
**Root Cause**: Select clause added for initial implementation but not updated when adapter was enhanced

**Example**:
```typescript
// API select clause (BEFORE fix - missing 7 fields):
select: { id: true, name: true, description: true, ... }  // No promptTemplate, metadata, etc.

// Adapter reads:
template.promptTemplate  // ← undefined! Not in select clause
template.metadata?.modelParameters  // ← undefined!
```

**5-Minute Detection**:
```bash
# Step 1: List fields adapter reads
grep -oE "template\.\w+" lib/pov/api/agent-templates-adapter.ts | sort -u

# Step 2: List fields in API select clause
grep -A 30 "select:" app/api/agent-templates/route.ts | grep "true"

# Step 3: Compare — any adapter fields missing from select?
```

**Key Insight**: Check ALL select clauses (list, detail, create, update) — they often drift independently.

**Evidence**: List and create select clauses both missing 7 fields (Mar 2026, commit a7a754cb)

---

#### FormField Migration Triage Methodology ⭐ 2026-03-29

**Problem**: Initial audit found 497 bare `.optional()` fields — but fixing all is "boiling the ocean"
**Solution**: Classify schemas by type to identify actual risk (reduced 497 → ~45)

**Classification**:
| Schema Type | Receives HTML form data? | Null risk? | Action |
|-------------|------------------------|------------|--------|
| **INPUT** (form/API body) | Yes | **HIGH** | Migrate to FormField/`.nullable()` |
| **QUERY** (URL params) | Partial | Medium | Already uses `z.coerce.*` |
| **RESPONSE** (server output) | No | None | Skip — server controls values |
| **UTILITY** (helpers/base) | No | None | Skip — not direct consumers |

**Quick Classification**:
```bash
# Find INPUT schemas (used in .safeParse in handlers)
grep -rn "safeParse\|\.parse(" app/api/ lib/*/handlers/ --include="*.ts" | grep -i "schema"

# Find RESPONSE schemas
grep -rn "ResponseSchema\|Response.*Schema" lib/validation/ --include="*.ts"

# Check FormField adoption per file
for f in lib/validation/*.ts; do
  echo "$(basename $f): optional=$(grep -c '\.optional()' $f) FormField=$(grep -c 'FormField' $f)"
done
```

**Evidence**: Reduced scope from 497 to ~45 fields across 4 files (Mar 2026)

---

#### Production Smoke Test for Boundary Fixes ⭐ 2026-03-29

After deploying boundary fixes, verify with a CRUD cycle smoke test:

```bash
# 1. GET list — verify select clause fields present
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/agent-templates?limit=3" | \
  python3 -c "import json,sys; t=json.load(sys.stdin)['data']['templates'][0]; print(sorted(t.keys()))"

# 2. POST create — verify response shape (data.data.template, not data.template)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"SMOKE_TEST","variables":[],...}' "$BASE/agent-templates" | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print('template' in d.get('data',{}))"

# 3. GET by ID — verify metadata.modelParameters preserved from DB
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/agent-templates/$ID" | \
  python3 -c "import json,sys; t=json.load(sys.stdin)['data']; print(t.get('metadata',{}).get('modelParameters',{}))"

# 4. DELETE — cleanup
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" "$BASE/agent-templates/$ID"
```

**Key checks**: (1) All select fields present, (2) Response path correct, (3) DB values not hardcoded, (4) Auth enforced

**Evidence**: All 6 smoke tests passed on production after deployment (Mar 2026)

---

### Updated 5-Minute Boundary Debug Protocol (2025-11-02)

**Extended Protocol**: Include TYPE checking in comparative analysis

#### Step 1: Comparative Analysis (Enhanced - 2 min)
```javascript
// BEFORE (only checked presence):
authLogger.debug({ missing: Object.keys(workingPath.user).filter(k => !brokenPath.user[k]) }, 'Missing fields');

// NOW (check presence AND type):
const comparison = Object.keys(workingPath.user).map(key => ({
  field: key,
  working: { value: workingPath.user[key], type: typeof workingPath.user[key] },
  broken: { value: brokenPath.user[key], type: typeof brokenPath.user[key] },
  match: workingPath.user[key] === brokenPath.user[key] &&
         typeof workingPath.user[key] === typeof brokenPath.user[key]
}));

authLogger.debug({ comparison }, 'Field analysis (presence + type)');
// Shows both missing fields AND type mismatches
```

**Example Output**:
```
Field Analysis:
[
  { field: 'revenue', working: { value: 2000000, type: 'number' },
                      broken: { value: "2000000", type: 'string' },
                      match: false },  // ← TYPE MISMATCH!
  { field: 'dueDate', working: { value: "2025-12-01", type: 'string' },
                      broken: { value: null, type: 'object' },
                      match: false },  // ← NULL VS STRING!
]
```

#### Step 2: Contract Definition (Enhanced - 1 min)
```typescript
// Look at DESTINATION code AND validation schema
// Example: lib/pov/handlers/put.ts

// Code usage:
const revenue = validated.revenue;  // Expects number

// Validation schema:
revenue: z.number().min(0)  // CONTRACT: Must be number

// Frontend sends:
{ revenue: "2000000" }  // VIOLATION: Sends string

// BOUNDARY CONTRACT:
interface POVUpdateInput {
  revenue: number;  // Type requirement
}
```

#### Step 3: Gap Analysis (Enhanced - 1 min)
```javascript
// Check THREE things (not just fields):
// 1. Field presence (original protocol)
// 2. Field type (NEW)
// 3. Field nullability (NEW)

const gaps = {
  missing: contract.filter(f => !source[f]),           // Missing fields
  wrongType: contract.filter(f =>
    source[f] && typeof source[f] !== expectedType[f]  // Wrong type
  ),
  unexpectedNull: contract.filter(f =>
    source[f] === null && !allowsNull[f]               // Null not allowed
  )
};

authLogger.debug({ gaps }, 'Contract gaps analysis');
// Output:
// {
//   missing: [],
//   wrongType: ['revenue'],      // String instead of number
//   unexpectedNull: ['dueDate']  // Null not accepted
// }
```

---

### Boundary Contract Validation Checklist (Updated 2025-11-02)

**Enhanced 5-Minute Comparative Analysis**:

1. **Open Frontend Data Structure** (EditorState, form data, API call)
2. **Open Backend Validation Schema** (Zod schema, TypeScript interface)
3. **Compare EVERY field side-by-side** (use table format):

```
Field           | Frontend Type  | Frontend Value | Backend Type   | Match? | Issue
----------------|----------------|----------------|----------------|--------|------------------
revenue         | string         | "2000000"      | number         | ❌     | Type mismatch
dueDate         | null           | null           | string?        | ❌     | Null not accepted
inputContext    | object         | {...}          | string         | ❌     | Type mismatch
title           | string         | "POV Title"    | string         | ✅     | OK
```

4. **Check for Three Types of Violations**:
   - Missing fields (original protocol) → Field presence
   - Type mismatches (NEW) → String vs number, object vs string
   - Null handling (NEW) → Null vs undefined, nullish requirements

5. **Identify Boundary Type**:
   - Field leakage → Use original 5-minute protocol
   - Type mismatch → Use Frontend/Backend patterns (above)
   - Both → Fix field presence first, then types

**Evidence**: This enhanced protocol caught all 15 validation errors in Week 6 POV implementation in 5-minute analysis

**ROI**: 5-minute analysis vs 2-hour debugging = 24x faster root cause identification

---

### React Async Error Handling Patterns ⭐ NEW 2025-11-02

**Source**: Week 6 silent failure debugging (boundary-contract-specialist root cause analysis)
**Evidence**: Fixed 3 production silent failures
**Confidence**: 95% (production-validated)

**Boundary**: React Component → User (error visibility)

These patterns ensure errors ALWAYS surface to users (prevent silent failures).

#### Double Catch Pattern (CRITICAL)

**Root Cause of Silent Failures**:
```tsx
// BROKEN - Silent failures possible
<form onSubmit={handleSubmit}>  // ← Doesn't await async handler

const handleSubmit = async (e) => {
  try {
    await fetch('/api/...');
  } catch (error) {
    toast({ title: 'Failed' });  // ← This works, BUT...
  }
};

// If form doesn't await promise, rejection might be swallowed
// User sees console error but NO toast
```

**Solution**: Double Catch Pattern
```tsx
// ✅ CORRECT - Defense in depth
<form onSubmit={(e) => {
  e.preventDefault();
  handleSubmit(e).catch((err) => {  // ← Layer 2: Safety net
    console.error('[Component] Uncaught:', err);  // Client-side: console is correct here
    toast({
      title: 'Operation failed',
      description: err.message || 'Permission denied',
      variant: 'destructive',
    });
  });
}}>

const handleSubmit = async (e) => {
  try {
    await fetch(...);
  } catch (error: any) {  // ← Layer 1: Primary handler
    toast({ title: 'Failed', description: error.message });
  }
};
```

**Why Two Layers**:
- **Layer 1 (try-catch)**: Handles errors from fetch, parsing, business logic
- **Layer 2 (.catch())**: Safety net if component doesn't await promise
- **Result**: Errors ALWAYS surface as toasts

**When to Use**:
- ✅ Form onSubmit handlers (async submission)
- ✅ Button onClick handlers (delete, confirm, save)
- ✅ Select onValueChange handlers (role changes, status updates)
- ✅ ANY async user action requiring feedback

**Evidence**: Fixed in TeamSection.tsx
- handleSubmit (add member) - Line 631
- handleRoleChange (update role) - Line 757
- confirmDelete (remove member) - Line 877

---

#### React Hook Dependency Array Boundary (Stale Closure Bug) ⭐ NEW 2025-12-29

**Source**: Bloomberg Terminal UI rationalization (TaskActivityTimeline POV filtering bug)
**Evidence**: Fixed production bug where POV selection didn't filter activities
**Confidence**: 99% (immediately reproducible pattern)

**Boundary**: Props/State → Hook Closure → Function Execution

**Definition:** When useCallback/useEffect uses props/state but doesn't include them in the dependency array, the function closure captures stale values and doesn't react to changes.

**Manifestation**: "Data doesn't update when I change the selection/filter/prop"

**Root Cause**: Missing dependencies in useCallback/useEffect arrays

**Example Bug (TaskActivityTimeline.tsx - Dec 29, 2025)**:
```tsx
// Component receives povId prop
export function TaskActivityTimeline({ taskId, povId, ... }) {

  const fetchActivities = useCallback(async () => {
    const params = new URLSearchParams({
      taskId,
      ...(povId && { povId }), // ← Uses povId here
      ...
    });
    fetch(`/api/activities?${params}`);
  }, [taskId, actionFilter, userFilter, dateFilter, maxItems]);
     // ❌ Missing povId in dependency array!

  // When user selects different POV:
  // - povId prop changes: "ABC" → "XYZ"
  // - useCallback doesn't re-run (povId not in deps)
  // - Function closure still has old povId: "ABC"
  // - Fetches wrong data
}
```

**Symptom:**
- User selects "POV A" → sees data for "POV B"
- Dropdown value changes, but data doesn't
- Hard refresh fixes it (re-mounts with new povId)

**5-Minute Detection Method**:
```bash
# Step 1: Find all useCallback/useEffect dependency arrays
grep -n "}, \[" components/path/to/Component.tsx

# Output example:
# 269:  }, [taskId, actionFilter, userFilter, dateFilter, maxItems];
# 278:  }, [fetchTaskActivities, realTime];

# Step 2: Check function signature for props/state
grep -n "export function\|const.*= " components/path/to/Component.tsx | grep -A5 "Component"

# Step 3: Cross-reference - does function use props NOT in deps?
# Look for: povId used in function but missing from line 269 array
```

**Comparative Analysis**:
```typescript
// Working boundary (all deps present):
}, [taskId, povId, actionFilter, userFilter, dateFilter, maxItems]);
   // ✅ povId included

// Broken boundary (missing dep):
}, [taskId, actionFilter, userFilter, dateFilter, maxItems]);
   // ❌ povId missing - stale closure!
```

**Fix**:
```typescript
// Add missing dependency
}, [taskId, povId, actionFilter, userFilter, dateFilter, maxItems]);
          // ✅ Added povId
```

**Contract Validation Pattern**:
```typescript
// Function signature defines contract
function Component({ taskId, povId, actionFilter }) {
                    // ^^^^^^^^^ Contract inputs

  const fetchData = useCallback(() => {
    // Uses: taskId ✓, povId ✓, actionFilter ✓
  }, [taskId, povId, actionFilter]);
     // ^^^^^^  ^^^^^^  ^^^^^^^^^^^^
     // ALL contract inputs must be in deps array
```

**When to Suspect This Pattern:**
- ✅ "Selection doesn't update data"
- ✅ "Filter doesn't work"
- ✅ "Hard refresh fixes it"
- ✅ "Works first time, breaks on change"
- ✅ "Shows old/wrong data after prop update"

**Prevention:**
- Use ESLint rule: `react-hooks/exhaustive-deps`
- Grep audit: `grep "}, \["` → verify all function params in deps
- Code review: Check useCallback deps match function body

**Evidence**: TaskActivityTimeline POV filtering (f55168c)
- Bug: Activities didn't filter by POV selection
- Detection: 2 minutes (grep "}, \[" → found missing povId)
- Fix: 30 seconds (add povId to deps array)
- Impact: Critical user-facing bug resolved

**Debug Time Reduction**: 2 hours traditional debugging → 2 minutes with grep pattern

---

#### Defense-in-Depth Error Handling (4 Layers)

**Boundary Contract**: Backend → API → Frontend → User (error flow)

**The 4 Layers**:

```typescript
// LAYER 1: Backend Validation
// Boundary: Request → Validation Schema
const validation = Schema.safeParse(body);
if (!validation.success) {
  return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
}

// LAYER 2: Backend Authorization
// Boundary: User → Authorization Check
const authCheck = canManageTeamMembers(user, pov, { operation: 'add' });
if (!authCheck.allowed) {
  return NextResponse.json({ error: authCheck.reason }, { status: 403 });
}

// LAYER 3: Frontend Try-Catch
// Boundary: API Response → User Feedback
try {
  const response = await fetch('/api/...');
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);  // Surface backend error
  }
  toast({ title: 'Success', variant: 'success' });
} catch (error: any) {
  toast({ title: 'Failed', description: error.message, variant: 'destructive' });
}

// LAYER 4: Frontend Promise Catch (Double Catch)
// Boundary: Promise Rejection → User Feedback
<form onSubmit={(e) => {
  e.preventDefault();
  handleSubmit(e).catch((err) => {  // Safety net
    toast({ title: 'Failed', description: err.message });
  });
}}>
```

**Benefits**:
- ✅ Errors caught at every boundary
- ✅ Specific messages (validation vs auth vs server)
- ✅ Graceful degradation (Layer 3 fails → Layer 4 catches)
- ✅ No silent failures (errors always reach user)

**Boundary Contracts**:
- Backend → Frontend: `{ error: string }` structure
- Frontend → User: Toast with title + description
- Layer 3 → Layer 4: Error object with message property

**Evidence**: All team management operations use 4-layer pattern

---

#### Frontend Error Contract Checklist

**For Every User-Initiated Action**:

1. **Backend Validation** (Layer 1)
   - [ ] Schema validation with safeParse
   - [ ] Return 400 with { error: string }
   - [ ] Clear validation message

2. **Backend Authorization** (Layer 2)
   - [ ] Permission check (owner, admin, delegated role)
   - [ ] Return 403 with { error: reason }
   - [ ] Specific permission message

3. **Frontend Try-Catch** (Layer 3)
   - [ ] Check !response.ok
   - [ ] Parse error: await response.json()
   - [ ] Throw with error.error (backend message)
   - [ ] Toast in catch block

4. **Frontend Promise Catch** (Layer 4)
   - [ ] Wrap handler with .catch()
   - [ ] Toast with fallback message
   - [ ] console.error for debugging

**Quick Check**:
- All 4 layers present? → 95% confident no silent failures
- Missing Layer 4? → Risk of silent failures
- Missing Layer 3? → All errors show as generic
- Missing Layer 1-2? → Security issue

---

**For Complete Patterns**: See `/.claude/knowledge/patterns/frontend-patterns.md`

---

## System Boundaries in pAIchart

### Authentication/Authorization Boundaries

**Boundary 1: OAuth Provider → User Object**
- Direction: Microsoft/GitHub API → Database
- Contract: `{ id, email, name, avatar_url }`
- Destination: findOrCreateUser in mcp-oauth-validator.js
- Common Issues: Missing email (GitHub private), null avatar

**Boundary 2: User Object → JWT Payload**
- Direction: Database user → RS256 JWT (mintMcpToken)
- Contract: `{ sub: userId, email, role, scope, azp, jti }`
- Destination: ChatGPT, Claude, Gemini
- **BUG HISTORY:** Oct 21 - Missing email/role

**Boundary 3: JWT Payload → Decoded JWT**
- Direction: JWT token → Decoded payload (verifyAccessToken)
- Contract: Same as payload (no transformation)
- Destination: getAuthUser
- Common Issues: Algorithm mismatch (RS256 vs HS256)

**Boundary 4: Decoded JWT → AuthUser**
- Direction: JWT payload → AuthUser interface (getAuthUser)
- Contract: `{ userId: sub || userId, email, role }`
- Destination: API routes (app/api/*/route.ts)
- **BUG HISTORY:** Oct 21 - undefined email/role from RS256

**Boundary 5: AuthUser → req.user**
- Direction: getAuthUser result → Express req.user (MCP middleware)
- Contract: `{ id, email, role, token, authMethod, scope }`
- Destination: ContextEnricher, API forwarding
- **BUG HISTORY:** Oct 20 - Missing token field

**Boundary 6: req.user → API Headers**
- Direction: MCP req.user → HTTP Authorization header (ContextEnricher)
- Contract: `{ token }` → `Authorization: Bearer ${token}`
- Destination: Web API endpoints
- Common Issues: Undefined token, wrong token type

**Boundary 7: AuthUser → RBAC Query**
- Direction: API AuthUser → Prisma WHERE clause
- Contract: `{ userId, role }` for filtering
- Destination: Database queries with role-based access
- **BUG HISTORY:** Oct 21 - undefined role → filtering skipped

---

## Debugging Workflow

### When to Activate This Specialist

**Trigger Patterns:**
1. **"Authentication works but [feature] doesn't"**
   - Example: "User authenticated but API returns 401"
   - Likely: Missing token field

2. **"Works in web app, broken in ChatGPT/MCP"**
   - Example: "Can see POVs in browser, not in ChatGPT"
   - Likely: Different JWT formats (HS256 vs RS256)

3. **"Database has data but API returns empty"**
   - Example: "Query returns POVs directly, API returns []"
   - Likely: RBAC filtering depends on missing field

4. **"User has permission but action fails"**
   - Example: "DEMO_USER should see demo POVs, gets 0"
   - Likely: Role field not passed to authorization layer

5. **"[Role] works for some features, not others"**
   - Example: "ADMIN can list tasks but not POVs"
   - Likely: Inconsistent role checking

**Anti-Pattern:** Don't activate for:
- Actual authentication failures (401 with no user)
- Database query errors (SQL syntax, missing tables)
- Network errors (timeouts, connection refused)

---

### Investigation Process

#### Phase 0: Quick Check (30 seconds)
```bash
# Is this a boundary bug?
# Signal: Authentication succeeds but downstream fails
# Signal: Works in one context, broken in another

# If YES → Continue with protocol
# If NO → Use domain specialist instead
```

#### Phase 1: Comparative Analysis (2 min)
```bash
# Capture data from BOTH paths
echo "=== Working Path (Web App) ==="
# Add: authLogger.debug({ user }, 'Working path user');
# Capture output from logs

echo "=== Broken Path (ChatGPT/MCP) ==="
# Add: authLogger.debug({ user }, 'Broken path user');
# Capture output from logs

# Compare
diff <(echo "$WORKING_USER") <(echo "$BROKEN_USER")
# Look for missing fields
```

#### Phase 2: Contract Definition (1 min)
```bash
# Find the DESTINATION code
grep -A 20 "user\\.role\\|user\\.email\\|user\\.token\\|user\\.userId" app/api/*/route.ts

# List what fields are USED
# These are REQUIRED fields (the contract)
```

#### Phase 3: Boundary Tracing (3 min)
```bash
# Trace BACKWARDS from destination to source
echo "Destination: app/api/pov/route.ts uses user.role"
echo "    ↑"
echo "getAuthUser: Expects decoded.role"
echo "    ↑"
echo "verifyAccessToken: Decodes JWT"
echo "    ↑"
echo "JWT Payload: mintMcpToken creates"
echo "    ↑"
echo "SOURCE: Check mintMcpToken parameters"

# Post-U2 (2026-05-19): mintMcpToken consolidated to lib/auth/token-manager.ts.
# Check the canonical signature (MintMcpTokenOptions interface):
grep -A 15 "interface MintMcpTokenOptions" lib/auth/token-manager.ts
grep -A 30 "export async function mintMcpToken" lib/auth/token-manager.ts | head -40
# Required fields: userId, email, role, scope, audience. Optional: azp, ttlSeconds, jti, purpose.

# Per-call mint sites (downstream consumers — all must pass required fields explicitly):
grep -rn "mintMcpToken({" lib/mcp/server/utils/api-client.js lib/services/workflow/integrations/service-caller.ts lib/mcp/server/tools/hub/workflow-tools-handler.js 2>/dev/null
```

#### Phase 4: Gap Analysis (2 min)
```javascript
// List what source produces
const sourceFields = ['sub', 'scope', 'jti', 'azp'];

// List what destination needs
const destFields = ['userId', 'email', 'role'];

// Calculate gap
const missing = destFields.filter(f => !sourceFields.includes(f) && f !== 'userId');
authLogger.debug({ missing }, 'Contract gap');  // ['email', 'role']
```

#### Phase 5: Implement Fix (5-10 min)
```javascript
// Add missing fields to source
// Update function signature
// Update call sites
// Test
```

**Total Time: 10-15 minutes** (vs 1-2 hours traditional debugging)

---

## Prevention Tools

### Tool 1: BoundaryLogger (Use in Development)
```javascript
// lib/debug/boundary-logger.js
class BoundaryLogger {
  static logCrossing(boundary, data, expectedFields) {
    const present = expectedFields.filter(f => data[f] !== undefined);
    const missing = expectedFields.filter(f => data[f] === undefined);

    authLogger.debug({ boundary, present, missing, keys: Object.keys(data) }, 'Boundary crossing');

    if (missing.length > 0) {
      authLogger.warn({ boundary, missing }, 'Contract violation');
    }

    return missing.length === 0;
  }
}

// Usage:
BoundaryLogger.logCrossing(
  'JWT → AuthUser',
  decodedJWT,
  ['sub', 'email', 'role']
);
```

### Tool 2: Boundary Contract Tests (Add to CI)
```typescript
// tests/boundaries/jwt-contract.test.ts
describe('Boundary: JWT → AuthUser', () => {
  test('RS256 JWT includes all required fields', () => {
    const token = mintMcpToken({
      userId: 'test',
      email: 'test@ex.com',
      role: 'DEMO_USER',
      scope: 'read:org',
      azp: 'test-client'
    });

    const decoded = jwt.decode(token);

    // VALIDATE CONTRACT
    expect(decoded.email).toBe('test@ex.com');  // ✅ Would catch Oct 21 bug
    expect(decoded.role).toBe('DEMO_USER');     // ✅ Would catch Oct 21 bug
  });

  test('HS256 and RS256 produce identical contracts', () => {
    const user = { id: 'test', email: 'test@ex.com', role: 'USER' };

    const hs256 = mintSessionToken(user);
    const rs256 = mintMcpToken(user);

    const decodedHS = jwt.decode(hs256);
    const decodedRS = jwt.decode(rs256);

    // Both must have same fields
    expect(Object.keys(decodedHS).sort()).toEqual(Object.keys(decodedRS).sort());
  });
});
```

---


---

## Learning Notes

### Anti-Pattern: Redundant User Fetching (Nov 26, 2025)

**Problem**: Calling `getAuthUser(req)` when `createHandler` already provides user

**Pattern**:
```typescript
// ❌ WRONG - Redundant user fetch + type errors
export const POST = createHandler(
  async (req: NextRequest) => {
    const user = await getAuthUser(req);  // Returns AuthUser | null
    validatePOVAccess(user, pov, {});     // Type error: user can be null
  },
  { requireAuth: true }  // Already fetches user!
);

// ✅ CORRECT - Use provided user parameter
export const POST = createHandler(
  async (req: NextRequest, context, user?: TokenPayload) => {
    validatePOVAccess(user!, pov, {});  // user! safe because requireAuth: true
  },
  { requireAuth: true }
);
```

**Why It Happens**:
- createHandler with `requireAuth: true` provides user as 3rd parameter
- Easy to miss when adding auth to existing routes
- getAuthUser returns different type (AuthUser vs TokenPayload)

**How to Detect**:
- Run discovery: `api-handler-anti-patterns-discovery.md`
- Grep: Routes with createHandler + requireAuth + getAuthUser call

**Impact**: Discovered in 4 routes during P1 (Nov 2025), caused type errors

---


---

## ⚠️ Role Enumeration Gap Pattern (Nov 2025)

**Boundary**: JWT token → allowedRoles array
**Contract Violation**: Token role field not in allowed list

**Example**:
```typescript
// JWT token has:
{ role: "DEMO_USER" }

// Endpoint checks:
allowedRoles: [UserRole.USER, UserRole.ADMIN, UserRole.SUPER_ADMIN]
// ❌ DEMO_USER missing → 403 Forbidden
```

**Detection**: 5-minute comparative analysis
1. Extract roles from JWT tokens in system
2. Extract allowedRoles from all endpoints
3. Compare: Are all JWT roles in at least one allowedRoles list?
4. Gap found: DEMO_USER in 11 user-facing endpoints

**Impact**: DEMO_USER couldn't use POV editor (403 errors blocking UI)

**Pattern**: Verify role field completeness across auth boundaries

---

**Created By:** Meta-pattern recognition from Oct 20-21 OAuth bugs
**Updated:** 2025-11-01 (added role enumeration gap pattern)
**Status:** Production-ready specialist
**Activation:** "Use boundary-contract-specialist to [validate/debug/review] [feature]"
**ROI:** 10-20x (prevents 1-2 hour bugs in 5-10 minutes)

## 🔴 CRITICAL PATTERN: Cross-Schema Field Limit Alignment

**Discovered**: November 8, 2025 (Agent Domain Security Audit)

**Problem**: Data flows across validation boundaries with mismatched field limits, causing runtime validation failures.

**Boundary Types Affected**:
1. **Schema → Schema**: Task description (50KB) → Agent prompt (10KB) ❌
2. **API → Database**: Form input → Prisma model
3. **Service → Service**: Export data → Import validation
4. **Client → Server**: Frontend form → API endpoint

### Real-World Example

**Boundary**: Task Creation → Agent Execution

**Source Contract**:
```typescript
// lib/validation/task-validation.ts:27
description: FormField.optionalString(50000) // 50KB allowed
```

**Destination Contract**:
```typescript
// lib/validation/agent-template-validation.ts:502 (BEFORE FIX)
prompt: z.string().max(10000, 'Prompt must be 10000 characters or less') // Only 10KB! ❌
```

**Data Flow**:
```
User creates task with 50KB description
  ↓ (passes validation)
System passes description to agent as prompt
  ↓ (FAILS validation - too large!)
Error: "Prompt must be 10000 characters or less"
```

**Impact**:
- Legitimate user data rejected at runtime
- Poor user experience (worked in one place, failed in another)
- Workarounds (truncating data, losing information)
- Reduced system effectiveness

### Detection Protocol

**5-Minute Comparative Analysis**:
```bash
#!/bin/bash
# Quick boundary contract check

echo "=== Field Limit Boundary Analysis ==="

# Step 1: Find all content fields (50KB expected)
echo "Content Fields:"
grep -rn "\.max(50000" lib/validation/ | cut -d: -f1,2

# Step 2: Find all smaller limits on similar fields
echo -e "\nPotential Mismatches:"
grep -rn "\.max(10000\|\.max(5000" lib/validation/ | \
  grep -i "prompt\|description\|content" | \
  cut -d: -f1,2

# Step 3: Compare and flag 5x+ differences
```

**Expected Output**:
```
Content Fields:
lib/validation/task-validation.ts:27: description (50000)
lib/validation/agent-template-validation.ts:211: promptTemplate (50000)

Potential Mismatches:
lib/validation/agent-template-validation.ts:502: prompt (10000) ⚠️ MISMATCH!
```

### Boundary Contract Matrix

| Source Field | Source Limit | Destination Field | Destination Limit | Status |
|--------------|--------------|-------------------|-------------------|--------|
| Task.description | 50KB | Agent.prompt | 10KB → **50KB** | ✅ FIXED |
| POV.description | 5KB | Import.description | 5KB | ✅ ALIGNED |
| Template.promptTemplate | 50KB | Variable.value | 2KB | ⚠️ CHECK |

**Categories**:
- ✅ **ALIGNED**: Source = Destination (safe)
- ⚠️ **INTENTIONAL**: Different purposes, documented
- ❌ **MISMATCH**: Source > Destination (bug)

### Fix Protocol

**Step 1**: Validate the mismatch is real
```typescript
// Check actual data flow in code
grep -rn "task\.description.*agentConfig\.prompt" app/api/
// If found, confirms data flows this path
```

**Step 2**: Determine correct limit
```typescript
// Content fields: 50KB (task descriptions, agent prompts, templates)
// Metadata fields: 5KB (object descriptions, help text)
// Name fields: 255 chars (object names, titles)
```

**Step 3**: Apply fix with rationale
```typescript
// BEFORE
prompt: z.string().max(10000)

// AFTER
prompt: z.string().max(50000)
// Rationale: Match task description limit (task descriptions passed as prompts)
```

**Step 4**: Add boundary test
```typescript
describe('Field Limit Alignment', () => {
  test('task description can be passed to agent prompt', () => {
    const largeDescription = 'x'.repeat(50000);

    // Should pass task validation
    const taskResult = CreateTaskSchema.safeParse({
      title: 'Test',
      description: largeDescription
    });
    expect(taskResult.success).toBe(true);

    // Should also pass agent validation
    const agentResult = AgentExecuteSchema.safeParse({
      taskId: 'clxy123',
      agentConfig: {
        role: 'Developer',
        prompt: largeDescription // Same data
      }
    });
    expect(agentResult.success).toBe(true);
  });
});
```

### Prevention Strategy

1. **Shared Limit Constants**:
```typescript
// lib/validation/field-limits.ts
export const FIELD_LIMITS = {
  CONTENT: 50000,    // Task descriptions, agent prompts, template content
  METADATA: 5000,    // Object descriptions, help text, comments
  NAME: 255,         // Object names, titles, labels
  SHORT_TEXT: 500    // Variable descriptions, hints
} as const;

// Usage in schemas
description: z.string().max(FIELD_LIMITS.CONTENT)
```

2. **Boundary Documentation**:
```typescript
// Document data flows in validation files
/**
 * Task Description Field
 *
 * Limit: 50KB (FIELD_LIMITS.CONTENT)
 * Flows to:
 * - Agent execution prompt (AgentExecuteSchema.prompt)
 * - Task detail views (no additional validation)
 * - Analytics processing (no limit)
 *
 * Rationale: Complex tasks require detailed context for AI agents
 */
description: z.string().max(FIELD_LIMITS.CONTENT)
```

3. **Quarterly Audit**:
```bash
# Run field limit alignment discovery
# See: /.claude/knowledge/discoveries/field-limit-alignment-discovery.md

# Schedule: Quarterly or when adding new data flows
```

### Discovery Prompt
**Full Protocol**: `/.claude/knowledge/discoveries/field-limit-alignment-discovery.md`

**Quick Reference**:
- Detection: 30-45 minutes
- Fix: 5 minutes per mismatch
- Frequency: Quarterly
- Priority: CRITICAL (prevents runtime validation failures)

### ROI
- **Time**: 5 minutes to fix field limit
- **Impact**: Prevented validation failures for legitimate use cases
- **User Experience**: Seamless data flow across boundaries
- **Confidence**: 100% (fix is straightforward)

---

**Related Patterns**:
- Schema-Prisma parity validation
- API contract validation
- Database constraint alignment

**Specialist Enhanced** ✅
**New Capability**: Cross-schema field limit alignment detection
**Updated**: November 8, 2025

---

## ⚠️ CRITICAL PATTERN: Runtime Field Name Verification (Nov 20, 2025)

**Discovered**: November 20, 2025 (audit_all_tasks security bug)
**Root Cause**: Static code comparison missed runtime data structure differences

### The Security Bug

**Problem**: audit_all_tasks exposed unauthorized POVs due to field name mismatch
**Boundary**: MCP user context → Prisma query filter
**Impact**: Access control completely bypassed (undefined → {} → all POVs)

**The Mismatch**:
```javascript
// MCP context provides:
userContext.user.id  // ✅ Actual field at runtime

// Code accessed:
user.userId  // ❌ Undefined in MCP context (only exists in API context)

// Result:
{ ownerId: undefined }  // Becomes {} in query → matches ALL POVs
```

### Why Static Analysis Failed

**5-Minute Comparative Analysis Protocol** (Original):
1. ✅ Compare code (what fields are accessed)
2. ✅ Compare interfaces (what fields are defined)
3. ❌ **MISSING**: Compare runtime logs (what fields actually exist)

**Gap**: Static code comparison showed both paths used same field names, but didn't verify **runtime availability** of those fields.

### Enhanced Protocol: Add Runtime Verification

**NEW REQUIREMENT**: Step 3 - Runtime Verification

```bash
# After static code comparison, verify runtime data structure:

# 1. Add temporary logging
authLogger.debug({ user }, 'User context');
authLogger.debug({ fields: Object.keys(user) }, 'Available fields');

# 2. Deploy and invoke the code path

# 3. Check logs for actual structure
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart-mcp --err --lines 50" | grep "User context:"

# 4. Compare runtime vs code expectations
# Runtime has: { id, email, role, token }
# Code expects: { userId, email, role }
# MISMATCH: userId field doesn't exist!
```

### MCP vs API Context Differences

**Critical Discovery**: Different execution contexts have different field names for same data

**MCP Context** (prompts via prompt_command tool):
```javascript
userContext = {
  user: {
    id: string,        // ← Use this in MCP prompts
    email: string,
    role: string,
    token: string
  }
}

// Access user ID:
const userId = userContext.user.id;  // ✅ CORRECT
```

**API Context** (REST endpoints via getAuthUser):
```typescript
user: TokenPayload = {
  userId: string,      // ← Use this in API routes
  email: string,
  role: UserRole
}

// Access user ID:
const userId = user.userId;  // ✅ CORRECT
```

**How to Detect Context Type**:
```javascript
// Check execution environment
if (userContext?.user) {
  // MCP context - use user.id
  const userId = userContext.user.id;
} else if (user?.userId) {
  // API context - use user.userId
  const userId = user.userId;
}
```

### Updated 5-Minute Protocol

**Step 1: Comparative Analysis** (2 min)
```javascript
// Compare BOTH static code AND runtime data

// Static comparison (old)
const codeFieldsUsed = ['user.userId', 'user.email'];

// Runtime comparison (NEW)
authLogger.debug({ user }, 'Runtime user check');
const runtimeFieldsAvailable = Object.keys(user);  // ['id', 'email', 'role', 'token']

// MISMATCH DETECTION
const mismatch = codeFieldsUsed.filter(field =>
  !runtimeFieldsAvailable.includes(field.replace('user.', ''))
);
// Result: ['userId'] - Not available at runtime!
```

**Step 2: Contract Definition** (1 min)
```typescript
// Define contract for BOTH contexts

// MCP Context Contract
interface MCPUserContext {
  user: {
    id: string;        // NOT userId!
    email: string;
    role: string;
    token: string;
  }
}

// API Context Contract
interface APITokenPayload {
  userId: string;      // NOT id!
  email: string;
  role: UserRole;
}
```

**Step 3: Runtime Verification** (2 min) - **NEW STEP**
```bash
# MANDATORY: Always verify field availability at runtime

# Add logging
authLogger.debug({ available: Object.keys(user), accessing: 'userId', value: user.userId }, 'Boundary check');

# Deploy to production
npm run deploy

# Check logs
pm2 logs paichart-mcp --err --lines 20

# Expected output if bug exists:
# Available: ['id', 'email', 'role', 'token']
# Accessing: 'userId'
# Value: undefined  ← CAUGHT!
```

### Prevention

**1. Context-Aware Field Access**:
```javascript
// Create helper for safe field access
function getUserId(context) {
  // MCP context
  if (context.userContext?.user?.id) {
    return context.userContext.user.id;
  }
  // API context
  if (context.user?.userId) {
    return context.user.userId;
  }
  throw new Error('Unknown context type - cannot extract user ID');
}
```

**2. Runtime Validation**:
```javascript
// Add assertions in critical paths
function buildPOVFilter(user) {
  if (!user.id && !user.userId) {
    authLogger.error({ fields: Object.keys(user) }, 'User has no ID field');
    throw new Error('Invalid user context - missing ID field');
  }

  const userId = user.id || user.userId;
  return { ownerId: userId };
}
```

**3. Context Detection Pattern**:
```javascript
// Document context type in code
/**
 * @param {MCPUserContext} userContext - MCP prompt context (use user.id)
 * @param {APITokenPayload} user - API route context (use user.userId)
 */
```

### Discovery Commands

**Find MCP context usage**:
```bash
# Find all MCP prompts
grep -r "userContext\.user" lib/mcp/server/prompts/ --include="*.js" -n

# Check field access patterns
grep -r "user\.userId\|user\.id" lib/mcp/server/prompts/ --include="*.js" -A 2
```

**Find API context usage**:
```bash
# Find API routes
grep -r "getAuthUser\|TokenPayload" app/api/ lib/*/handlers/ --include="*.ts" -n

# Check field access patterns
grep -r "user\.userId" app/api/ lib/*/handlers/ --include="*.ts" -A 2
```

**Runtime verification**:
```bash
# Check production logs for user context structure
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart-mcp --lines 100" | grep -A 5 "User context:"

# Find undefined field access
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart-mcp --err --lines 100" | grep "undefined"
```

### ROI

**Bug Impact**:
- Security: Complete access control bypass
- Scope: All MCP prompts using user.userId
- Detection: Missed by static analysis (would have caught with runtime verification)

**Prevention**:
- Runtime verification: 5 minutes
- Bugs prevented: Critical security vulnerabilities
- ROI: 100-500x (5 min → prevents hours of debugging + security incident)

### Task #85 Case Study: Wrapper > Docs Pattern Proof (Apr 2026)

**Problem**: Six independent writers assembled `agent_executions.context.triggeredBy` — 2 direct-path + 4 reactor. Two reactor sites wrote `{id: userId}`; four wrote a bare-string `completedTaskId`. The engine's `extractUserId` returned `undefined` for the malformed rows → silent fallback to `task.assigneeId` (POV owner) → POV owner's apiKey used for the LLM call. Cross-user billing risk + masked failures ("empty LLM response" instead of a schema error).

**Pattern Applied** — Strict Zod schema + canonical wrapper + automated grep-test:

1. `lib/services/types/triggered-by.ts` — `TriggeredBySchema` with `.strict()`, `.cuid()` on `id`, required `source` enum discriminator, optional parent lineage fields
2. `lib/services/agent-execution-create.ts` — single `createAgentExecution()` wrapper that parse-throws BEFORE `prisma.agentExecution.create`
3. `BoundaryContractViolation extends ValidationError` — typed error class for catch-block clarity
4. `scripts/test-agent-execution-security.ts` G8 tests — CI-enforced grep that `prisma.agentExecution.create` only appears in the wrapper file
5. Asymmetric enforcement — `parse()` at write (throw), `safeParse()` at read (WARN + legacy fallback) so pre-schema JSONB rows still work

**All 6 write sites migrated in one commit** (`d95b0608`): agentTaskService, taskReadyReactor (2 sites), pipelineRetriggerReactor, both API routes.

**Outcome**:
- 13/13 dual-layer tests pass (5 pattern + 8 behavior). Behavior tests explicitly reject: bare-string, missing source, non-CUID id, unknown keys (`.strict()`).
- Production verification of a fresh pipeline run: 7 executions total, all carrying the MCP-session user's userId (propagated, not assigneeId fallback). All 4 `TriggeredBySourceEnum` values exercised (`mcp-direct`, `reactor-task-ready-initial`, `reactor-task-ready`, `reactor-pipeline-retrigger`).
- Forensic trail: every wrapper write populates `task_activities.details` with `authMethod`, `triggeredBySource`, `parentExecutionId`, `parentTaskId`, `povId` — separate transaction, fire-and-forget, loud-log-on-failure.
- Zero regressions. Would have caught the original bug at write-time if shipped earlier.

**Specialist cross-validation**:

| Specialist | 1st-pass | 2nd-pass | Signature contribution |
|---|---|---|---|
| boundary-contract | 78% | 94% | Wrapper + `.strict()` + automated test (this agent drove the shape) |
| sec-ops | 78% | 93% | `.strict()` blocks prototype-pollution + typos; SDK autodiscovery throw-before-`new Anthropic()` |
| architectural-review | 82% | 94% | Raw-create outside wrapper = CI failure, not review nit |
| agent-execution | 88% | 90%+ | Pre-flight B1 placement, `extractUserId` warn-log fallback |
| auth-permissions | 87% | 90%+ | Triggering-user-only model + re-resolve-per-execution |
| event-system | 88% | 93% | 2-hop parent-lookup SQL + tri-state reactor policy |

**Why this was the right shape** (vs. documentation-only guidance): N-writer JSONB blobs don't survive documentation across N authors. Two writers got it right; four got it wrong; that's the baseline hit rate for "docs say the shape." The structural fix (one wrapper + grep test) makes bypass a CI failure rather than a code-review miss.

**Reference**: `boundary-contract-wrapper-enforcement-pattern.md` (Pattern registry, Apr 2026) — the generalized version; task #85 is the canonical instance.

**Pattern generalized further (task #84, Apr 2026):** The additive-signal philosophy from this case study extends to 7 more signals in `agent-output-trustworthiness-defense-stack-pattern.md`. Where boundary-contract enforcement validates DATA at write boundaries (write-strict, read-soft), the trustworthiness defense stack validates EXECUTION outputs (additive signals, no control flow). Same write-strict/read-soft framing, applied to detection rather than data validation:
- **Boundary-contract** (this case): hard-throw at write, soft-warn-and-fallback at read
- **Trustworthiness stack**: additive signals at the execution-output boundary (don't reject), single-value `errorCategory` cascade + co-occurring evidence fields

The two patterns compose: the wrapper enforces the data contract at write time, then the detection stack flags structural defects at execution-output time. Together they cover both "did the data ever land correctly" and "did the agent actually do useful work."

### Related Patterns

- Boundary 5: AuthUser → req.user (Oct 20, 2025 - missing token field)
- Boundary 4: Decoded JWT → AuthUser (Oct 21, 2025 - undefined email/role)
- Field Leakage Prevention: Always verify field availability at boundaries
- **Boundary 8 (Apr 2026)**: JSONB context blob → typed read — task #85 `context.triggeredBy`; defended by wrapper enforcement pattern

**Pattern**: Different execution contexts may have different field names for conceptually identical data

---

**Specialist Enhanced** ✅
**New Capabilities**: Patterns 6-7 (double optional, select clause), FormField triage methodology, production smoke test pattern
**Updated**: 2026-03-29 (added 4 patterns from boundary discovery + fix session)
**Boundary Health Score**: 94% (up from 82% at Mar 2026 audit)
**Total Boundary Patterns**: 7 (field leakage, null/undefined, string/number, transport coercion, response shape, double optional, select clause)


## BC71 Awareness (2026-05-22, BUG-BASIC-XSS-1)

**Two-axis grep saved a 12.3× scope miss**. Per `feedback_bc2_audits_two_axes`, BUG-BASIC-XSS-1 Plan v1 swept only the helper axis (11 sites). Boundary-contract Round 1 review found 5 bypass paths Plan v1 missed:

| GAP | File | Pattern |
|---|---|---|
| GAP-1 | chatgpt-connector-handler.js | JSON.stringify with user input interpolation (JSON.stringify does NOT escape <>&) |
| GAP-2 | sdk-native-basic-tools.js | Inline `throw new Error` outside helpers |
| GAP-3 | workflow-tools-handler.js | `error:` field interpolation in dispatch responses |
| GAP-4 | InternalServiceRouter.js | Inline `throw new Error` (internal routing) |
| GAP-5 | workflow-tools-handler.js (write+read) | Persistent stored-XSS via MCPWorkflowExecution.error round-trip (BUG-HUB-001 sibling) |

Final scope: 11 → ~135 sites (12.3× growth). The Phase 0 redo was triggered by `feedback_phase0_stops_at_inventory` (>5× growth rule).

**When reviewing any new sanitization work**: always run BOTH axes:
```bash
# Axis 1 (helpers)
grep -rE 'new Error\(`.*\$\{(searchTerm|name|title)' lib/mcp/server/tools/*/error-helpers.js
# Axis 2 (inline) — the one Plan v1 missed
grep -rE 'throw new Error\(`.*\$\{|error: `.*\$\{|text: `.*\$\{' \
  lib/mcp/server/tools/ --include='*.js' | grep -v error-helpers
```

**Write-back round-trip pattern (GAP-5)**: when a user-input string persists to a DB column then replays via a read API, sanitize at WRITE so historical pollution can't replay. BUG-HUB-001 (workflow.error) is the canonical case; the same shape appears wherever input flows to DB then back to a response.

---

## Phase 2 discovery-trim additions (2026-06-11) — evicted from boundary-contract-discovery.md

### [evicted] Part 4: Prevention Tools and Tests

### Part 4: Prevention Tools and Tests

#### Tool 1: BoundaryLogger (Development/Debug)

```javascript
// lib/debug/boundary-logger.js
class BoundaryLogger {
  static logCrossing(boundary, data, expectedFields) {
    if (process.env.DEBUG_BOUNDARIES !== 'true') return true;

    const present = expectedFields.filter(f => data[f] !== undefined);
    const missing = expectedFields.filter(f => data[f] === undefined);

    authLogger.debug({ boundary, present: present.join(', '), missing: missing.length > 0 ? missing.join(', ') : 'none', complete: missing.length === 0 }, 'Boundary crossing');

    if (missing.length > 0) {
      authLogger.warn({ boundary, missing }, 'Contract violation');
    }

    return missing.length === 0;
  }
}

module.exports = BoundaryLogger;
```

**Usage**:
```typescript
// In lib/auth/get-auth-user.ts
import BoundaryLogger from '@/lib/debug/boundary-logger';

const user = {
  userId: decoded.userId || decoded.sub,
  email: decoded.email,
  role: decoded.role
};

// Validate contract (development only)
BoundaryLogger.logCrossing(
  'JWT → AuthUser',
  user,
  ['userId', 'email', 'role']
);

return user;
```

#### Tool 2: Contract Tests (CI Prevention)

**Test 1: JWT Contract Test** (would have caught Oct 21 bug)
```typescript
// tests/boundaries/jwt-contract.test.ts
describe('Boundary 2: User → JWT → AuthUser', () => {
  test('RS256 JWT preserves all required fields', () => {
    const user = {
      id: 'test-user-id',
      email: 'test@example.com',
      role: 'DEMO_USER'
    };

    const token = mintMcpToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      scope: 'read:org',
      azp: 'test-client'
    });

    const decoded = jwt.decode(token);

    // VALIDATE CONTRACT
    expect(decoded.sub).toBe(user.id);
    expect(decoded.email).toBe(user.email);  // ✅ Would catch Oct 21 bug!
    expect(decoded.role).toBe(user.role);    // ✅ Would catch Oct 21 bug!
  });
});
```

**Test 2: MCP Auth Contract Test** (would have caught Oct 20 bug)
```typescript
// tests/boundaries/mcp-auth-contract.test.ts
describe('Boundary 5: AuthUser → req.user', () => {
  test('req.user includes all required fields', () => {
    const reqUser = {
      id: 'test-user',
      email: 'test@example.com',
      role: 'USER',
      token: 'eyJhbGci...',
      authMethod: 'mcp_token'
    };

    // VALIDATE CONTRACT
    expect(reqUser.id).toBeDefined();
    expect(reqUser.email).toBeDefined();
    expect(reqUser.role).toBeDefined();
    expect(reqUser.token).toBeDefined();  // ✅ Would catch Oct 20 bug!
  });
});
```

**Test 3: RBAC Contract Test** (would have caught Oct 21 bug)
```typescript
// tests/boundaries/rbac-contract.test.ts
describe('Boundary 7: AuthUser → RBAC', () => {
  test('DEMO_USER role enables demo POV filtering', () => {
    const user = {
      userId: 'test',
      email: 'test@ex.com',
      role: 'DEMO_USER'
    };

    // VALIDATE: role field exists
    expect(user.role).toBe('DEMO_USER');  // ✅ Would catch Oct 21 bug if undefined!

    // Simulate RBAC query construction
    const query = {};
    if (user.role === 'DEMO_USER') {
      query.OR = [
        { ownerId: user.userId },
        { metadata: { path: ['isDemo'], equals: true } }
      ];
    }

    // VALIDATE: RBAC query built
    expect(query.OR).toBeDefined();
  });

  test('undefined role skips RBAC filtering', () => {
    const user = {
      userId: 'test',
      email: 'test@ex.com',
      role: undefined  // ❌ BUG REPRODUCTION!
    };

    const query = {};
    if (user.role === 'DEMO_USER') {
      query.OR = [/* ... */];
    }

    // Test CATCHES the bug
    expect(query.OR).toBeUndefined();  // ✅ This test would fail, catching the bug!
  });
});
```

---


---

### [evicted] Part 5: Boundary Debugging Protocol (superseded inline copy)

### Part 5: Boundary Debugging Protocol

#### 5-Minute Boundary Check Protocol

**When**: Encountering "authentication works, feature doesn't"

```bash
# Step 0: Quick Check (30s)
# Is this a boundary bug?
# Signals: Auth succeeds, downstream fails, works in A not B

# Step 1: Comparative Analysis (2 min)
echo "=== Working Path ==="
# Add: authLogger.debug({ user }, 'Working path user');
# Capture output from web app logs

echo "=== Broken Path ==="
# Add: authLogger.debug({ user }, 'Broken path user');
# Capture output from MCP logs

# Compare side-by-side
diff <(echo "$WORKING_USER") <(echo "$BROKEN_USER")

# Step 2: Contract Definition (1 min)
# Find destination code
grep -A 20 "user\\.role\\|user\\.email\\|user\\.token" app/api/pov/route.ts

# List required fields
grep -oh "user\\.\\w*" app/api/pov/route.ts | sort -u

# Step 3: Boundary Tracing (1 min)
echo "Destination: app/api/pov/route.ts uses user.role"
echo "    ↑"
echo "Boundary 7: AuthUser → RBAC Query"
echo "    ↑"
echo "Boundary 4: Decoded JWT → AuthUser"
echo "    ↑"
echo "Boundary 3: JWT String → Decoded JWT"
echo "    ↑"
echo "Boundary 2: User → JWT Payload"
echo "    ↑"
echo "SOURCE: mintMcpToken"

# Check source
grep -A 30 "mintMcpToken" mcp-server-http-clean.js | grep "payload = {"

# Step 4: Gap Analysis (30s)
# Source fields: sub, scope, jti, azp
# Dest needs: userId, email, role
# GAP: email, role ← FIX HERE!

# Total: 5 minutes to root cause
```

---


---

### [evicted] Part 6.5: Runtime Verification Protocol (full narrative)

### Part 6.5: Runtime Verification Protocol ⭐ NEW 2025-11-20

**Purpose**: Catch field name mismatches that static analysis misses
**Source**: Nov 20, 2025 audit_all_tasks security bug
**Impact**: Prevents access control bypass from undefined fields

#### Why Runtime Verification is Critical

**The Gap in Static Analysis**:
```javascript
// Static code analysis sees:
Code path A: user.userId  ✅ Field accessed
Code path B: user.userId  ✅ Same field accessed
Conclusion: "Both paths match" ✅

// But runtime reality:
Context A: { userId: 'x', email: 'y' }  // API context
Context B: { id: 'x', email: 'y' }      // MCP context
Result: user.userId = undefined in context B ❌
```

**Security Impact**:
```javascript
// Undefined field in query filter
{ ownerId: undefined }
// Prisma treats as: {}
// Result: Matches ALL records → access control bypassed!
```

#### Runtime Verification Commands

**Step 1: Add Temporary Logging**
```bash
# In the file being analyzed (e.g., lib/mcp/server/prompts/prompt-registry.js — audit_all_tasks is a built-in registered there, not its own file)
cat >> [FILE] <<'EOF'

// TEMPORARY: Runtime verification (remove after check)
// TEMPORARY: Runtime verification (pino structured logging - remove after check)
authLogger.debug({ userContext }, 'Boundary check user context');
authLogger.debug({ fields: Object.keys(userContext.user || {}), userId: userContext.user?.userId, id: userContext.user?.id }, 'Boundary check user fields');
EOF
```

**Step 2: Deploy and Invoke**
```bash
# Deploy to environment
npm run deploy

# Invoke the code path (MCP prompt, API endpoint, etc.)
# For MCP: Use Claude Desktop or API client
# For API: Use curl or frontend
```

**Step 3: Check Runtime Logs**
```bash
# Check production logs
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart-mcp --err --lines 50" | grep "BOUNDARY_CHECK"

# Expected output if field name mismatch exists:
# [BOUNDARY_CHECK] User context: { "user": { "id": "cmgws...", "email": "...", "role": "..." } }
# [BOUNDARY_CHECK] User fields: ['id', 'email', 'role', 'token']
# [BOUNDARY_CHECK] Accessing: user.userId = undefined  ← CAUGHT!
# [BOUNDARY_CHECK] Accessing: user.id = cmgws...
```

**Step 4: Compare Runtime vs Code**
```bash
# Create comparison report
echo "=== Runtime vs Code Comparison ==="
echo ""
echo "Runtime Data Structure:"
echo "  Available fields: [id, email, role, token]"
echo ""
echo "Code Expects:"
echo "  Accessing: user.userId"
echo ""
echo "MISMATCH DETECTED:"
echo "  ❌ Field 'userId' not in runtime data"
echo "  ✅ Field 'id' exists in runtime data"
echo ""
echo "IMPACT: Undefined field access → access control bypass"
```

**Step 5: Clean Up**
```bash
# Remove temporary logging
git checkout [FILE]

# OR manually remove the console.error lines
```

#### MCP vs API Context Detection Pattern

**Discovery Commands**:
```bash
# Find all MCP prompt files
find lib/mcp/server/prompts/ -name "*.js" -type f

# Check user context usage in MCP prompts
grep -r "userContext\.user" lib/mcp/server/prompts/ --include="*.js" -n

# Check for field access patterns
echo "=== MCP Context Field Access ==="
grep -r "user\.userId\|user\.id" lib/mcp/server/prompts/ --include="*.js" -A 2

echo "=== API Context Field Access ==="
grep -r "user\.userId" app/api/ lib/*/handlers/ --include="*.ts" -A 2

# Compare patterns
echo "=== Pattern Comparison ==="
echo "MCP should use: userContext.user.id"
echo "API should use: user.userId"
```

#### MCP vs API Context Reference

**MCP Context** (lib/mcp/server/prompts/*.js):
```javascript
// Receives userContext from MCP server
userContext = {
  user: {
    id: string,        // ← Use this (NOT userId)
    email: string,
    role: string,
    token: string
  },
  authenticated: boolean
}

// Correct field access:
const userId = userContext.user.id;  // ✅
```

**API Context** (app/api/*/route.ts, lib/*/handlers/*.ts):
```typescript
// Receives user from getAuthUser
user: TokenPayload = {
  userId: string,      // ← Use this (NOT id)
  email: string,
  role: UserRole,
  tenantId?: string
}

// Correct field access:
const userId = user.userId;  // ✅
```

#### Validation Checklist

**Runtime Verification Complete When**:
- [ ] Temporary logging added to boundary code
- [ ] Code deployed to test/production environment
- [ ] Boundary crossed (prompt invoked, API called, etc.)
- [ ] Runtime logs captured and analyzed
- [ ] Runtime data structure compared to code expectations
- [ ] Field name mismatches identified (if any)
- [ ] Temporary logging removed after verification
- [ ] Context type documented (MCP vs API)

**Mismatch Found Checklist**:
- [ ] Document mismatch (which field, which context)
- [ ] Update code to use correct field name
- [ ] Add context detection if needed (MCP vs API)
- [ ] Add runtime assertion to prevent future bugs
- [ ] Update tests to cover both contexts
- [ ] Document in boundary-contract pattern

#### Prevention Patterns

**Pattern 1: Context-Aware Field Access**
```javascript
// Helper function for safe field access
function getUserId(context) {
  // MCP context
  if (context.userContext?.user?.id) {
    return context.userContext.user.id;
  }
  // API context
  if (context.user?.userId) {
    return context.user.userId;
  }
  throw new Error('Unknown context type - cannot extract user ID');
}
```

**Pattern 2: Runtime Assertions**
```javascript
// Add to critical boundary crossings
function buildUserFilter(user) {
  // Validate field exists
  if (!user.id && !user.userId) {
    authLogger.error({ fields: Object.keys(user) }, 'User has no ID field');
    throw new Error('Invalid user context - missing ID field');
  }

  const userId = user.id || user.userId;
  return { ownerId: userId };
}
```

**Pattern 3: Context Documentation**
```javascript
/**
 * @param {MCPUserContext} userContext - MCP prompt context (use userContext.user.id)
 * @param {TokenPayload} user - API route context (use user.userId)
 */
function myFunction(contextOrUser) {
  // Document which context type expected
}
```

#### ROI

**Time Investment**:
- Add logging: 2 minutes
- Deploy + invoke: 2 minutes
- Check logs: 1 minute
- **Total**: 5 minutes

**Bugs Prevented**:
- Access control bypass (CRITICAL security)
- Data leakage across tenants
- Undefined field errors
- Hours of debugging runtime issues

**ROI**: 100-500x (5 minutes prevents critical security incidents)

---


---

### [evicted] Part 12: Pino section (API-usage prose)

### Part 12: Pino Structured Logging for Boundary Diagnostics ⭐ NEW 2026-02-22

**Objective**: Verify that boundary crossing events use pino structured loggers instead of console.log, and that contract violations are properly logged for production diagnostics.

**Background**: The pino migration (Pattern #43, 348+ files) replaced console.log with structured JSON logging. Boundary events should use domain loggers (`authLogger`, `apiLogger`, `mcpLogger`) for searchable, structured diagnostics.

#### Step 1: Audit Boundary Logging in Auth Chain

```bash
echo "=== Auth Boundary Logging (authLogger usage) ==="

# Check authLogger in boundary-critical files
echo "authLogger in auth chain files:"
grep -rn "authLogger\." lib/auth/ lib/jwt.ts --include="*.ts" | wc -l

echo ""
echo "authLogger in MCP auth middleware:"
grep -rn "authLogger\." mcp-server-http-clean.js mcp-oauth-validator.js 2>/dev/null | wc -l

echo ""
echo "authLogger in MCP server prompts (MCP context boundary):"
grep -rn "authLogger\." lib/mcp/server/prompts/ --include="*.js" | wc -l
```

#### Step 2: Detect Legacy console.log in Boundary Code

```bash
echo "=== Legacy console.log in Boundary Code (should be 0) ==="

echo "Auth chain files:"
grep -rn "console\.log\|console\.error\|console\.warn" lib/auth/ lib/jwt.ts --include="*.ts" | grep -v node_modules | wc -l

echo ""
echo "MCP auth middleware:"
grep -rn "console\.log\|console\.error" mcp-server-http-clean.js mcp-oauth-validator.js 2>/dev/null | grep -v "// legacy" | wc -l

echo ""
echo "Boundary validation files:"
grep -rn "console\.log\|console\.error" lib/validation/ --include="*.ts" | grep -v node_modules | wc -l
```

#### Step 3: Verify Correct pino API in Boundary Events

```bash
echo "=== Pino API Correctness in Boundary Logging ==="

# Correct pattern: object first, message second
echo "Correct pattern (object first) in auth files:"
grep -rn "authLogger\.\(info\|warn\|error\|debug\)({" lib/auth/ lib/jwt.ts --include="*.ts" | wc -l

# Check BoundaryLogger uses pino (not console)
echo ""
echo "BoundaryLogger implementation (should use authLogger):"
grep -rn "authLogger\|console" lib/debug/boundary-logger.js 2>/dev/null || echo "BoundaryLogger not yet implemented"

# Error serialization (should use 'err' not 'error')
echo ""
echo "Correct { err: error } in auth chain:"
grep -rn "{ err:" lib/auth/ lib/jwt.ts --include="*.ts" | wc -l

echo "Wrong { error: error } in auth chain:"
grep -rn "{ error:" lib/auth/ lib/jwt.ts --include="*.ts" | grep -v "errorMap\|errorMessage\|error_code" | wc -l
```

#### Step 4: Production Log Analysis for Boundary Events

```bash
echo "=== Production Boundary Event Analysis ==="

echo "Run on production server:"

echo ""
echo "Auth boundary events (JWT, RBAC chain):"
echo "ssh <PROD_USER>@<PROD_HOST> \"pm2 logs paichart --lines 200 --nostream | grep '\\\"domain\\\":\\\"auth\\\"' | jq '{msg: .msg, level: .level, userId: .userId}'\" 2>/dev/null | tail -20"

echo ""
echo "Auth warnings (contract violations, missing fields):"
echo "ssh <PROD_USER>@<PROD_HOST> \"pm2 logs paichart --lines 500 --nostream | grep '\\\"domain\\\":\\\"auth\\\"' | grep '\\\"level\\\":40' | jq\" 2>/dev/null | tail -20"

echo ""
echo "API validation failures at boundaries:"
echo "ssh <PROD_USER>@<PROD_HOST> \"pm2 logs paichart --lines 300 --nostream | grep '\\\"domain\\\":\\\"api\\\"' | grep '\\\"level\\\":40' | jq '{msg: .msg, field: .field}'\" 2>/dev/null | tail -10"

echo ""
echo "Error distribution by domain (boundary triage):"
echo "ssh <PROD_USER>@<PROD_HOST> \"pm2 logs paichart --lines 500 --nostream | grep '\\\"level\\\":50' | jq -r '.domain' | sort | uniq -c | sort -rn\" 2>/dev/null"
```

---

**Created**: 2025-10-22, Updated: 2026-02-22
**Based On**: Oct 20-21 debugging sessions (req.user.token, email/role in JWT) + Dec 29 TaskActivityTimeline bug + Feb 15 MCP transport boundary coercion audit + Feb 22 pino structured logging
**Meta-Pattern**: Boundary Field Leakage
**Prevention ROI**: 10-20x (prevents 1-2 hour bugs in 5-10 minutes)
**Status**: Production-ready, comprehensive boundary mapping complete including React patterns, MCP transport coercion, and pino structured logging

---


---

### [evicted] Part 3: Integration with Architectural Review (full trigger list)

### Part 3: Integration with Architectural Review

#### Trigger Conditions for boundary-contract-specialist

When architectural-review-specialist detects these patterns in a plan:

```bash
# Run boundary contract gate
/cline_docs/discovery-prompts/quality_gates/boundary_contract_gate.sh [PLAN_FILE]

# Triggers if plan contains:
# - JWT transformation (mintMcpToken, verifyAccessToken, getAuthUser)
# - User object transformation (AuthUser → req.user → API headers)
# - RBAC filtering (role checks, permission checks)
# - API forwarding (ContextEnricher, API client)
```

#### Quality Gate Output

```
⚠️ Plan involves JWT transformations
   Required fields: sub/userId, email, role
   Validate: Source produces all required fields

⚠️ Plan uses RBAC filtering
   Required fields: role must exist in user object
   Validate: Role passed through all boundaries

📋 RECOMMENDATION:
   Run boundary-contract-specialist for detailed analysis
   Use 5-minute protocol to validate contracts
```

---



---

