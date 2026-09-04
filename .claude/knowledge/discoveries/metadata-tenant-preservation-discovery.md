# Metadata Tenant Preservation Discovery

## Purpose
Comprehensive investigation of metadata preservation patterns across multi-tenant boundaries, focusing on proven examples: `metadata.isDemo` (checkbox) and `POV.tags` (column array). This discovery maps the 7-layer preservation architecture that prevents data loss bugs.

## Proven Examples
- **metadata.isDemo**: Boolean flag (metadata JSON) - Fixed in commits 647fb35, 873274f, 9e20d47, b0ebb65, a282a77
- **POV.tags**: String array (column field) - Implemented in commit 92f28f1 with 7-specialist validation

## 🔐 Authorization Model Context (2025-11-07)

**Tenant isolation uses validatePOVAccess** (ownership-based authorization)

**Pattern Reference**: `/.claude/knowledge/patterns/authorization-dual-layer-pattern.md`

**Critical for Tenant Isolation**:
- validatePOVAccess checks: `pov.ownerId`, `pov.metadata.isDemo`, `pov.metadata.tenantId`, `pov.team.members`
- POV queries MUST include these fields for tenant isolation to work
- Missing fields = tenant isolation fails = security vulnerability

**Discovery Commands** (run these to verify authorization model):
```bash
# 1. Find all validatePOVAccess usage (tenant isolation points)
grep -r "validatePOVAccess" lib/ app/ --include="*.ts" -l | grep -v "node_modules" | grep -v "cline_docs"
# Expected: 27 files

# 2. Verify POV queries have required fields
./scripts/audit-pov-access-completeness.sh
# Expected: 0 issues (all queries include ownerId, metadata, team)

# 3. Check for dual permission patterns (should be rare)
grep -r "checkPermission" lib/ app/ --include="*.ts" | grep -v "import" | grep "await.*checkPermission"
# Expected: ~5 calls (system-level operations only)
```

**Full authorization reference**: See `auth-permissions-discovery.md` section 2

## Investigation Areas

### 1. Core Preservation Architecture
**Files to Analyze:**
```bash
# Backend POV service (ACTUAL location)
grep -n "metadata\|tags" lib/pov/services/pov.ts | head -30
grep -n "this\.get" lib/pov/services/pov.ts
grep -A 10 "async get\(" lib/pov/services/pov.ts | head -20

# POV handlers
grep -n "validatePOVAccess" lib/pov/handlers/get.ts
grep -n "validatePOVAccess" lib/pov/handlers/put.ts

# Frontend normalizers (ACTUAL location - not lib/utils!)
grep -n "normalizeApiData\|denormalizeStateForApi" components/poveditor/pov/context/utils/normalizer.ts | head -10
grep -n "metadata\|tags" components/poveditor/pov/context/utils/normalizer.ts | head -30
```

**Key Questions:**
- How many layers handle metadata preservation?
- Where does `metadata.isDemo` get lost?
- Which layer is responsible for tenant isolation?

### 2. Tenant Isolation Patterns
**Files to Analyze:**
```bash
# Access control implementation (CRITICAL file)
grep -n "isSameTenant\|isDemo\|metadata" lib/auth/validate-pov-access.ts | head -20
grep -A 15 "export function validatePOVAccess" lib/auth/validate-pov-access.ts | head -25

# POV service access validation
grep -n "validatePOVAccess" lib/pov/services/pov.ts
grep -n "prisma.pOV.update\|prisma.pOV.findUnique" lib/pov/services/pov.ts | head -10

# Prisma schema for metadata fields
grep -n "metadata\|tags" prisma/schema.prisma | head -15
grep -n "POV\|User\|Task" prisma/schema.prisma | grep "model " | head -5
```

**POV Helper Functions** ⭐ NEW (Nov 26, 2025):
```bash
# Reusable helpers for POV context extraction
# Location: lib/utils/pov-helpers.ts

# Check helper usage:
grep -r "getPOVFromTask\|getPOVFromExecution\|getPOVFromArtifact" app/api --include="*.ts"

# What they provide: Complete POV context for validatePOVAccess
# Returns: { id, ownerId, metadata, team: { members: [{userId}] } }

# Why metadata: true (not selective):
# 1. Consistency: 100% of codebase uses metadata: true
# 2. Tenant isolation: validatePOVAccess needs full metadata object
# 3. Fields needed: metadata.isDemo, metadata.tenantId (current + future)
# 4. No security risk: No sensitive data in metadata
# 5. Performance: < 0.1ms overhead, ~1.5 KB data

# When to use:
# - Agent endpoints (taskId or executionId, no povId in URL)
# - Replaces 28-line manual Prisma queries
# - Ensures all 4 required fields present (id, ownerId, metadata, team.members)
```

**Key Questions:**
- How does validatePOVAccess enforce tenant boundaries?
- When is teamId used vs userId?
- Are metadata fields preserved across tenant checks?

### 3. Data Normalization Pipeline
**Files to Analyze:**
```bash
# Frontend normalizers (ACTUAL location - critical!)
grep -n "export function normalizeApiData" components/poveditor/pov/context/utils/normalizer.ts
grep -n "export function denormalizeStateForApi" components/poveditor/pov/context/utils/normalizer.ts
grep -n "metadata\|tags" components/poveditor/pov/context/utils/normalizer.ts | grep -E "line (106|108|470|472)"

# Check for UNUSED normalizers (common mistake!)
grep -n "normalizeApiData\|denormalizeStateForApi" components/poveditor/pov/context/PovEditorContext.tsx

# Type definitions
grep -n "metadata\|tags" lib/types/pov.ts | head -10
grep -n "interface PoVMetadata" lib/types/pov.ts -A 10
```

**Key Questions:**
- What defaults are applied during normalization?
- Does normalization overwrite existing metadata?
- How are optional metadata fields handled?

### 4. The 7-Layer Preservation Pattern
**Investigate Each Layer:**

#### Layer 1: Database Retrieval (povService.ts)
```bash
# Find this.get() usage
grep -n "this\.get.*povId" lib/pov/services/pov.ts
# Check what it returns
grep -A 10 "async get\(" lib/pov/services/pov.ts
```

#### Layer 2: Access Validation (validatePOVAccess)
```bash
# How validatePOVAccess is called
grep -B 2 -A 5 "validatePOVAccess" lib/pov/services/pov.ts
# Does it preserve metadata?
grep -n "metadata" lib/auth/validate-pov-access.ts
```

#### Layer 3: Merge Strategy (povService.update)
```bash
# Find merge logic
grep -A 20 "async update\(" lib/pov/services/pov.ts
# Check for spread operators
grep -n "\.\.\." lib/pov/services/pov.ts
```

#### Layer 4: Prisma Update (database write)
```bash
# Prisma update patterns
grep -A 5 "prisma.pOV.update" lib/pov/services/pov.ts
# JSON field handling
grep -n "metadata.*Json" prisma/schema.prisma
```

#### Layer 5: API Response (route.ts)
```bash
# Response formatting
grep -A 10 "return.*Response" app/api/pov/\[povId\]/route.ts
# JSON serialization
grep -n "JSON.stringify" app/api/pov/\[povId\]/route.ts
```

#### Layer 6: API Client (api-client.ts)
```bash
# Response processing
grep -A 10 "normalizeApiData" lib/mcp/server/utils/api-client.js
# Error handling
grep -n "catch" lib/mcp/server/utils/api-client.js
```

#### Layer 7: Frontend Normalization (normalizer.ts)
```bash
# Default application
grep -A 15 "normalizeApiData" lib/pov/prisma/mappers.ts
# Metadata handling
grep -n "metadata.*isDemo" lib/pov/prisma/mappers.ts
```

### 5. Known Issues and Solutions
**Bug Patterns to Find:**
```bash
# Missing this.get() calls
grep -n "prisma.pOV.update.*where.*povId" lib/pov/services/pov.ts
# Direct property access without retrieval
grep -n "metadata\.isDemo.*without.*this\.get" lib/pov/services/pov.ts

# Overwrite patterns
grep -n "metadata:.*{" lib/pov/services/pov.ts
# Correct merge patterns
grep -n "\.\.\.existing.*metadata" lib/pov/services/pov.ts
```

### 6. Testing and Validation
**Pizza Test Pattern:**
```bash
# Find test files
find . -name "*pov*.test.ts" -o -name "*metadata*.test.ts"

# Look for isDemo test cases
grep -n "isDemo" test/
```

**Create Pizza Test:**
1. Create POV with `metadata.isDemo = true`
2. Update POV with new name/description
3. Verify `metadata.isDemo` still `true`
4. Check database directly with Prisma Studio

### 7. Multi-Tenant Implementation Strategy
**Hybrid Approach Analysis:**
```bash
# Row-level security
grep -n "userId.*teamId" lib/pov/services/pov.ts
grep -n "where.*OR" lib/pov/services/pov.ts

# Metadata-based flags
grep -n "metadata\.isDemo\|metadata\.tenantId" lib/pov/services/pov.ts

# Access control integration
grep -n "validatePOVAccess" lib/pov/services/pov.ts
```

### 8. Tags Implementation Analysis (Proven Example)
**Successful Column-Based Categorization:**
```bash
# Verify POV.tags column exists and has GIN index
grep -n "tags.*String\[\]" prisma/schema.prisma
psql $DATABASE_URL -c "\d \"POV\"" | grep tags

# Check normalizer handling (lines 108 and 470)
grep -n "tags:.*apiData\.tags.*??" components/poveditor/pov/context/utils/normalizer.ts
grep -n "tags:.*data.*tags.*??" components/poveditor/pov/context/utils/normalizer.ts

# UI component with security validation
grep -n "validateAndSanitizeTag\|MAX_TAG_LENGTH\|BLACKLISTED_TAGS" components/poveditor/pov/sections/BasicInfoSection.tsx | head -10
grep -n "TagsSection" components/poveditor/pov/sections/BasicInfoSection.tsx

# Verify GIN index for performance
psql $DATABASE_URL -c "EXPLAIN ANALYZE SELECT * FROM \"POV\" WHERE 'demo' = ANY(tags);" | grep "Index"
```

## Execution Commands

### Quick Discovery (5 minutes)
```bash
#!/bin/bash
echo "=== Metadata Tenant Preservation Quick Discovery ==="
echo ""

echo "1. VERIFY 7-LAYER FILES EXIST"
echo "=============================="
echo "Layer 1: Backend Service"
ls -lh lib/pov/services/pov.ts
echo "Layer 2: Access Control"
ls -lh lib/auth/validate-pov-access.ts
echo "Layer 7: Frontend Normalizers"
ls -lh components/poveditor/pov/context/utils/normalizer.ts
echo ""

echo "2. CHECK METADATA FIELDS"
echo "========================"
grep -n "metadata.*Json\|tags.*String" prisma/schema.prisma | grep "POV"
echo ""

echo "3. VERIFY PRESERVATION PATTERNS"
echo "==============================="
echo "Backend uses this.get():"
grep -c "this\.get" lib/pov/services/pov.ts
echo "Normalizers use ?? operator:"
grep -c "??" components/poveditor/pov/context/utils/normalizer.ts
echo ""

echo "4. CHECK ACCESS CONTROL"
echo "======================="
grep -n "isSameTenant\|isDemo" lib/auth/validate-pov-access.ts | wc -l
echo "validatePOVAccess usage count:"
grep -r "validatePOVAccess" lib/ app/ --include="*.ts" | wc -l
```

### Run Complete Discovery
```bash
#!/bin/bash
echo "=== Metadata Tenant Preservation Complete Discovery ==="
echo ""

echo "1. CORE FILES ANALYSIS"
echo "======================"
echo "Backend POV Service:"
wc -l lib/pov/services/pov.ts
grep -c "metadata\|tags" lib/pov/services/pov.ts
echo "Access Control:"
wc -l lib/auth/validate-pov-access.ts
echo "Frontend Normalizer:"
wc -l lib/pov/prisma/mappers.ts
grep -c "isDemo" lib/pov/prisma/mappers.ts
echo ""

echo "2. PRESERVATION LAYERS"
echo "======================"
echo "Layer 1 (Database): this.get() usage"
grep -n "this\.get" lib/pov/services/pov.ts | head -5
echo "Layer 3 (Merge): Spread operators"
grep -n "\.\.\." lib/pov/services/pov.ts | head -5
echo "Layer 7 (Frontend): Default application"
grep -n "defaultValue\|??" lib/pov/prisma/mappers.ts | head -5
echo ""

echo "3. TENANT ISOLATION"
echo "==================="
echo "validatePOVAccess calls:"
grep -c "validatePOVAccess" lib/pov/services/pov.ts
echo "Tenant boundary enforcement:"
grep -n "userId\|teamId" lib/pov/services/pov.ts | wc -l
echo ""

echo "4. KNOWN BUG PATTERNS"
echo "====================="
echo "Direct updates without this.get():"
grep -n "prisma.pOV.update" lib/pov/services/pov.ts | grep -v "this.get"
echo "Metadata overwrites:"
grep -n "metadata:.*{.*}" lib/pov/services/pov.ts
echo ""

echo "5. TYPE DEFINITIONS"
echo "==================="
echo "Metadata structure:"
grep -A 10 "type.*Metadata\|interface.*Metadata" lib/types/pov.ts
echo ""

echo "=== Discovery Complete ==="
```

### Specific Investigation Scripts

**Find All Metadata References:**
```bash
find lib app -name "*.ts" -o -name "*.tsx" | xargs grep -l "metadata" | sort
```

**Trace isDemo Data Flow:**
```bash
echo "=== isDemo Data Flow Trace ==="
grep -rn "isDemo" lib/pov/services/pov.ts lib/mcp/server/utils/api-client.js lib/pov/prisma/mappers.ts app/api/pov/
```

**Analyze Prisma Schema:**
```bash
grep -A 20 "model POV" prisma/schema.prisma
```

**Check validatePOVAccess Implementation:**
```bash
grep -A 30 "export.*function.*validatePOVAccess" lib/auth/validate-pov-access.ts
```

## Expected Findings

### Critical Files (10 files)
1. `lib/pov/services/pov.ts` - Core preservation logic
2. `app/api/pov/[povId]/route.ts` - API layer access control
3. `lib/pov/prisma/mappers.ts` - Frontend normalization
4. `lib/mcp/server/utils/api-client.js` - HTTP client data flow
5. `lib/types/pov.ts` - Type definitions
6. `lib/auth/validate-pov-access.ts` - validatePOVAccess implementation
7. `prisma/schema.prisma` - Database schema
8. `lib/pov/handlers/put.ts` - Request handlers (if exists)
9. `components/contexts/POVContext.tsx` - Frontend state management
10. `lib/pov/services/pov.ts` - Base service patterns

### 7-Layer Architecture
1. **Database Retrieval** - `this.get(povId)` fetches existing data
2. **Access Validation** - `validatePOVAccess()` enforces tenant boundaries
3. **Merge Strategy** - Spread operators preserve existing metadata
4. **Prisma Update** - JSON field handling in database writes
5. **API Response** - Serialization preserves nested objects
6. **API Client** - HTTP response processing
7. **Frontend Normalization** - Default application without overwrites

### Common Pitfalls (8 documented)
1. **Direct Update Without Retrieval** - Missing `this.get()` before update
2. **Metadata Overwrite** - Using `metadata: { newField }` instead of merge
3. **Default Overwrite** - Applying defaults that clobber existing values
4. **Type Coercion Loss** - JSON serialization/deserialization issues
5. **Validation Side Effects** - validatePOVAccess modifying data
6. **Prisma Update Scope** - Partial updates affecting wrong fields
7. **Frontend State Stale** - Cache not invalidated after updates
8. **Test Data Contamination** - isDemo flag lost in test scenarios

### Success Patterns
- **Pizza Test Success** - isDemo preserved through 647fb35 and 873274f commits
- **Hybrid Multi-Tenant** - Row-level (userId/teamId) + metadata flags (isDemo)
- **Defensive Normalization** - Check existing before applying defaults

## Output Format

Generate report with:
1. **Executive Summary** - 7-layer architecture status
2. **File Analysis** - All 10 files with line number references
3. **Data Flow Diagram** - Trace metadata through all layers
4. **Pitfall Documentation** - Each with example and solution
5. **Testing Guide** - Pizza test procedure
6. **Migration Checklist** - Adding new metadata fields safely
7. **Quick Reference** - Common patterns and anti-patterns

## Success Criteria
- [ ] All 7 layers mapped with code references
- [ ] validatePOVAccess integration documented
- [ ] All 8 pitfalls explained with solutions
- [ ] Pizza test procedure validated
- [ ] Multi-tenant strategy clear (hybrid approach)
- [ ] Migration guide for new metadata fields
- [ ] Real-world examples (isDemo success story)
- [ ] Quick reference guide created
