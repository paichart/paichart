# Endpoint Security Fix Toolkit

**Purpose**: Quickly secure individual endpoints with existing validation patterns
**Type**: Execution toolkit (not analysis protocol)
**Time**: 5-10 minutes per endpoint (if schema exists)
**Genisis**: We implemented this plan /.claude/knowledge/toolkits/implementation-plan-v2.md and then I used this prompt /.claude/knowledge/toolkits/genesis_prompt.md
**Pattern**: /.claude/knowledge/patterns/toolkit-execution-pattern.md        
**Proven**: Nov 3, 2025 - Pilot #1: 6 minutes actual, Pilot #2: 2 minutes
**Extended**: Nov 6, 2025 - POV Domain Audit: 11 endpoints using Quick Path, 93% faster execution

**New Learnings from POV Domain Audit (Nov 6, 2025)**:
- ✅ **Extend existing files** instead of creating new ones (0 new files in POV audit)
- ✅ **withPOVAccess middleware** pattern for POV-scoped endpoints (see Step 7)
- ✅ **Discovery-first approach** saves 4.5 hours (found 14 existing schemas)
- ✅ **Batch by domain** - One file (pov.ts: 561 lines) → 22 endpoints

---

## When to Use Toolkit vs Specialist

### Use This Toolkit When:
- ✅ Fixing 1-3 individual endpoints
- ✅ Schema exists or is simple to create
- ✅ Standard patterns apply (UUID, enums, .safeParse)
- ✅ Security risk is known (from audit)
- ✅ Just need execution guidance (not analysis)

**Example**: "Fix POST /api/pov - schema exists, needs UUID→CUID and .safeParse"

---

### Use Specialist When:
- ❌ Need comprehensive analysis (unknown scope)
- ❌ Complex validation requirements (custom logic)
- ❌ Security risk assessment needed
- ❌ Multiple interconnected endpoints (>5)
- ❌ New patterns required (no existing examples)

**Example**: "Audit all 189 endpoints - need risk assessment and prioritization"

---

### Use Batch Remediation Guide When:
- ✅ Fixing 5+ similar endpoints
- ✅ Same domain (POV, tasks, agents)
- ✅ Shared validation schema
- ✅ Want 80-90% time savings

**Example**: "Fix 11 POV endpoints - create one schema, apply to all"

---

## 5-Step Execution Pattern

**Total Time**: 5-10 minutes per endpoint (proven in Pilot #1)

### Step 1: Discover Schema & Check Handler (2 min)

**Check Route First**:
```bash
# Look for existing validation in route
grep -n "\.safeParse\|\.parse\|import.*Schema" app/api/[path]/route.ts
```

**If no validation in route, check handler**:
```bash
# Find handler delegation
grep -n "Handler(" app/api/[path]/route.ts

# Check handler for validation
grep -n "\.safeParse\|\.parse" lib/*/handlers/[handler].ts
```

**Critical Discovery** (Pilot #2 learning):
- ✅ If handler has `.safeParse()` → **STOP! Already validated**
- ✅ If handler has `.parse()` → Fix in handler (change to .safeParse)
- ❌ If no validation → Continue to Step 2

**Discover Existing Schemas**:
```bash
npm run discover:schemas [domain]
# Example: npm run discover:schemas pov
# Output: Lists relevant schemas with import suggestions
```

**Result**:
- [ ] Schema exists → Note name and file
- [ ] Handler already validated → STOP
- [ ] No schema → Need to create (use checklist template)

---

### Step 2: Fix ID Types (UUID → CUID) (1 min)

**Pattern**: All IDs should use `.cuid()` (database uses `@default(cuid())`)

**In validation schema**, replace:
```typescript
// BEFORE
fieldId: z.string().uuid()
```

**With**:
```typescript
// AFTER
// Database uses CUID format (@id @default(cuid()))
fieldId: z.string().cuid()
```

**Batch Fix**: Fix ALL UUID instances in the schema at once (not one-by-one)

**Pilot #1 Result**: Fixed 6 UUIDs in 1 minute ✅

---

### Step 3: Fix Hardcoded Enums (1 min)

**Pattern**: Use `z.nativeEnum()` for all Prisma enums (prevents drift)

**In validation schema**, replace:
```typescript
// BEFORE (hardcoded - drifts over time)
status: z.enum(['PROJECTED', 'IN_PROGRESS', 'WON', 'LOST'])
```

**With**:
```typescript
// AFTER (auto-synced with Prisma)
import { POVStatus } from '@prisma/client';
status: z.nativeEnum(POVStatus)

// OR use existing wrapper:
import { PrismaEnum } from '@/lib/validation/enum-validation';
status: PrismaEnum.povStatus
```

**Batch Fix**: Fix ALL hardcoded Prisma enums in schema at once

**Pilot #1 Result**: Fixed 6 enum instances in 1 minute ✅

---

### Step 4: Fix Error Pattern (.parse → .safeParse) (1 min)

**Pattern**: Use `.safeParse()` to return 400 errors (not throw 500)

**In route/handler**, replace:
```typescript
// BEFORE (throws on error → 500)
try {
  const validated = Schema.parse(data);
} catch (error) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({...}, { status: 400 });
  }
  throw error;
}
```

**With**:
```typescript
// AFTER (returns error → 400)
const validation = Schema.safeParse(data);

if (!validation.success) {
  // Security logging added in Step 5
  return NextResponse.json({
    error: 'Validation failed',
    details: validation.error.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message
    }))
  }, { status: 400 });
}

const validated = validation.data;
```

**Pilot #1 Result**: 1 minute to refactor ✅

---

### Step 5: Add Security Logging (1 min)

**Pattern**: Log validation failures for security monitoring

**Add before return in validation failure block**:
```typescript
if (!validation.success) {
  // ✅ Security logging (monitor validation failures)
  console.warn('[Security] [Endpoint name] validation failed:', {
    userId: user?.userId,
    errors: validation.error.issues,
    data: JSON.stringify(data).slice(0, 200)  // First 200 chars only
  });

  return NextResponse.json({...}, { status: 400 });
}
```

**Why Log**:
- Monitor XSS attempts
- Track DoS attempts
- Identify attack patterns
- Security incident response

**Pilot #1 Result**: 1 minute to add logging ✅

---

### Step 6: Test & Verify (1-2 min)

**Run Automated Tests**:
```bash
# Schema-Prisma parity (ensures no drift)
npm run validate:schema-parity

# All validation tests (53+ tests)
npm run test:all-validation

# TypeScript compilation
npx tsc --noEmit [modified-files]
```

**Expected Results**:
- ✅ Schema parity: PASSED (0 CRITICAL violations)
- ✅ Validation tests: All passing
- ✅ TypeScript: No errors

**If All Pass**: Ready to deploy!
**If Failures**: Review errors, fix, re-test

**Pilot #1 Result**: All tests passed ✅

---

### Step 7: Apply withPOVAccess Middleware (Optional - POV Routes Only) (5 min)

**New Pattern from POV Domain Audit (Nov 6, 2025)**:

For POV-scoped endpoints (routes with `povId` in params), consider using `withPOVAccess` middleware to eliminate auth boilerplate.

**Benefits**:
- Eliminates 60-70% boilerplate per route (~20-30 lines)
- Automatic authentication (getAuthUser)
- Automatic POV loading (prisma.pOV.findUnique)
- Automatic tenant isolation (validatePOVAccess)
- Consistent security enforcement

**When to Use**:
- ✅ Route has `povId` in params
- ✅ After completing Steps 1-6 (validation in place)
- ✅ Want cleaner code (reduce boilerplate)

**Pattern**:

BEFORE (after Steps 1-6, still has boilerplate):
```typescript
export async function GET(request: NextRequest, { params }: { params: { povId: string } }) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pov = await prisma.pOV.findUnique({ where: { id: params.povId } });
  if (!pov) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  validatePOVAccess(user, pov, { throwOnDeny: true });

  // Your validated business logic
  const data = await service.getData(params.povId);
  return NextResponse.json(data);
}
```

AFTER (withPOVAccess - clean):
```typescript
import { withPOVAccess } from '@/lib/auth/validate-pov-access';

export const GET = withPOVAccess(async (request, { params, user, pov }) => {
  // user and pov already validated! ✅

  // Your business logic (unchanged)
  const data = await service.getData(params.povId);
  return NextResponse.json(data);
});
```

**Time**: 5 minutes per route
**Savings**: ~20-30 lines per route
**Reference**: `.claude/knowledge/patterns/api-security-withPOVAccess-pattern.md`

**Proven**: POV Domain Audit (Nov 6, 2025) - Applied to 10+ routes, eliminated ~250 lines boilerplate

---

## Handler vs Route Check Procedure

**Critical Learning from Pilot #2**: Always check handlers before adding validation!

### Procedure:

**1. Check Route File**:
```bash
grep -A 5 "export async function POST\|PUT\|DELETE\|PATCH" app/api/[path]/route.ts
```

**Look for**:
- Direct validation: `.safeParse()`, `.parse()`, `Schema.parse`
- Handler delegation: `someHandler(request, params)`

**2. If Handler Delegation Found**:
```bash
# Find handler file
grep "import.*Handler" app/api/[path]/route.ts

# Check handler for validation
grep -n "\.safeParse\|\.parse\|Schema" lib/*/handlers/[handler].ts
```

**3. Assessment**:
- ✅ Handler has `.safeParse()` → **Already validated! STOP**
- ⚠️ Handler has `.parse()` → Fix in handler (change to .safeParse, add logging)
- ❌ No validation → Add validation (route or handler, your choice)

**Pilot #2 Result**: Found validation in handler, avoided duplication ✅

---

## Tool Commands Reference

### Discovery Commands

**Find Existing Schemas**:
```bash
npm run discover:schemas [domain]
# Example: npm run discover:schemas pov
# Output: Relevant schemas with import suggestions
```

**Validate Schema-Prisma Parity**:
```bash
npm run validate:schema-parity
# Output: 7,510 checks, reports violations/warnings
```

**Find Unvalidated Endpoints**:
```bash
# Check specific endpoint
grep -n "await req\.json()" app/api/[path]/route.ts
grep -n "\.safeParse\|\.parse" app/api/[path]/route.ts

# If both match but no safeParse → needs fix
```

---

### Testing Commands

**Run All Validation Tests**:
```bash
npm run test:all-validation
# Includes: form patterns (28), enum parity (25), ID format, schema parity
# Total: 78+ tests
```

**Test Specific Schema**:
```typescript
// Quick inline test
node -e "
const { CreatePOVSchemaInline } = require('./lib/validation/pov');
const result = CreatePOVSchemaInline.safeParse({
  title: 'Test',
  description: 'Test',
  status: 'PROJECTED',
  // ... test data
});
console.log(result.success ? '✅ Valid' : '❌ Invalid:', result.error);
"
```

---

## Related Patterns and Resources

**Middleware Pattern** (Nov 6, 2025):
- **Pattern**: `.claude/knowledge/patterns/api-security-withPOVAccess-pattern.md`
- **When**: After securing POV endpoints (Step 7)
- **Benefit**: Eliminate 60-70% boilerplate per route
- **Proven**: POV domain (10+ routes, ~250 lines eliminated)

**Batch Remediation**:
- **Guide**: `.claude/knowledge/patterns/batch-endpoint-remediation-guide.md`
- **When**: 5+ similar endpoints in same domain
- **Benefit**: 80-90% time savings (one schema → many endpoints)
- **Proven**: POV domain (Groups 1-4, 22 endpoints in pov.ts)

**Audit Protocol**:
- **Protocol**: `.claude/knowledge/protocols/endpoint-security-audit-protocol.md`
- **When**: Quarterly or before major releases
- **Output**: Prioritized fix list (use toolkit for implementation)
- **Proven**: POV domain (found 31 vulnerabilities, 4 CRITICAL)

**Discovery First**:
- **Command**: `npm run discover:schemas [domain]`
- **When**: ALWAYS before implementing (saves 4-5 hours)
- **Output**: Existing schemas (enables toolkit Quick Path)
- **Proven**: POV domain (found 14 schemas, saved 4.5h)

---

## Success Criteria

### Per-Endpoint Success:

**Before Deployment**:
- [ ] Schema discovered or created
- [ ] Schema-Prisma parity: PASSED
- [ ] UUID → CUID: All fixed
- [ ] Hardcoded enums → nativeEnum: All fixed
- [ ] .parse → .safeParse: Fixed
- [ ] Security logging: Added
- [ ] All validation tests: Passing
- [ ] TypeScript: Compiles

**After Deployment**:
- [ ] Endpoint works with valid input
- [ ] Endpoint rejects invalid input (400 errors)
- [ ] Security logs appear in PM2
- [ ] No false positives (legitimate requests work)

---

## Batch Optimization Tips

### Tip 1: Group by Domain
**When**: 5+ endpoints in same domain
**How**: Create one schema file, import in all endpoints
**Time Savings**: 80% (4 hours vs 20 hours for 10 endpoints)

### Tip 2: Reuse Existing Schemas
**When**: Similar operations (create task, create phase, create stage)
**How**: Use `discover:schemas` to find existing patterns
**Time Savings**: 90% (just import, don't create)

### Tip 3: Fix Common Issues Globally
**When**: Same issue across many files (e.g., all use .parse)
**How**: Create migration script or batch edit
**Time Savings**: 95% (automated vs manual)

### Tip 4: Check Handlers First
**When**: Route delegates to handler
**How**: Run handler vs route check procedure
**Time Savings**: 100% (avoid duplicate work if handler has validation)

---

## Common Patterns & Quick Fixes

### Pattern 1: Simple CRUD Endpoint
**Characteristics**: Standard create/update with title, description, status
**Schema**: Often exists (check with discover:schemas)
**Time**: 5-7 minutes

### Pattern 2: Complex Nested Endpoint
**Characteristics**: Nested objects, arrays, business logic
**Schema**: May need creation
**Time**: 20-30 minutes (if creating schema)

### Pattern 3: ID-Only Endpoint
**Characteristics**: No text input, just IDs
**Schema**: Very simple
**Time**: 3-5 minutes

### Pattern 4: Handler-Validated Endpoint
**Characteristics**: Validation in handler, not route
**Time**: 2 minutes (just discovery, no fix needed)

---

## Execution Checklist (Copy for Each Endpoint)

```markdown
# Endpoint: [Path and Method]
**Time Started**: _______

## Discovery (2 min)
- [ ] Check route for validation
- [ ] Check handler for validation (if delegated)
- [ ] Run: npm run discover:schemas [domain]
- [ ] Schema exists: ________ OR Need to create

## Fixes (3-4 min)
- [ ] Fix UUID → CUID (if needed)
- [ ] Fix hardcoded enums → nativeEnum (if needed)
- [ ] Change .parse → .safeParse (if needed)
- [ ] Add security logging

## Testing (1-2 min)
- [ ] npm run validate:schema-parity (PASSED)
- [ ] npm run test:all-validation (PASSED)
- [ ] TypeScript compiles (no errors)

**Time Actual**: _______ minutes
**Result**: ✅ Secured
```

---

## Examples from Nov 3, 2025

### Example 1: POV Creation (Pilot #1)
**Time**: 6 minutes
**Steps**: Extract → UUID fixes → Enum fixes → .safeParse → Logging
**Issues Fixed**: 6 UUIDs, 6 enums, .parse pattern
**Result**: ✅ Production-ready

### Example 2: Phase Creation (Pilot #2)
**Time**: 2 minutes
**Steps**: Check handler → Found validation → STOP
**Result**: ✅ Already validated (no work needed)

### Example 3: Support Request
**Time**: 15 minutes
**Steps**: Create schema → Add validation → Test
**Issues Fixed**: XSS, DoS, no validation
**Result**: ✅ CRITICAL vulnerability closed

### Example 4: Agent Template Builder
**Time**: 10 minutes
**Steps**: Create schemas → Add to 3 actions → Test
**Issues Fixed**: Week 5 gap (schemas existed, not applied)
**Result**: ✅ #1 security risk eliminated

---

## Time Estimates by Scenario

| Scenario | Schema Exists | Handler Check | Fixes Needed | Time |
|----------|---------------|---------------|--------------|------|
| **Best Case** | ✅ Yes | ✅ Validated | None | 2 min |
| **Typical** | ✅ Yes | ❌ No validation | UUID, Enum, .parse | 6-7 min |
| **Common** | ❌ No | ❌ No validation | Create schema + fixes | 20-30 min |
| **Complex** | ❌ No | ❌ No validation | Complex schema | 1-2 hours |

**80% of endpoints fall into "Typical" category**: 6-7 minutes each

---

## Toolkit vs Protocol Decision Matrix

| Need | Use This Toolkit | Use Specialist Protocol |
|------|------------------|------------------------|
| Fix 1-3 endpoints | ✅ | ❌ |
| Fix 5+ similar endpoints | ⚠️ Use batch guide | ❌ |
| Comprehensive audit | ❌ | ✅ endpoint-security-audit |
| Unknown validation needs | ❌ | ✅ validation-engine-specialist |
| Security risk assessment | ❌ | ✅ sec-ops-specialist |
| Pattern consistency check | ❌ | ✅ validation-engine-specialist |
| Major refactoring | ❌ | ✅ specialist-review-protocol |

---

## Quick Start

**For a single endpoint**:

```bash
# 1. Discover (30 sec)
npm run discover:schemas [domain]

# 2. Check handler (30 sec)
grep "Handler" app/api/[path]/route.ts
grep "safeParse" lib/*/handlers/[handler].ts  # if delegated

# 3. If needs fixing, follow 5 steps (5 min)
# - Import schema
# - Fix UUID → CUID
# - Fix enums → nativeEnum
# - Add .safeParse
# - Add logging

# 4. Test (1 min)
npm run test:all-validation

# 5. Deploy (1 min)
git add . && git commit -m "fix(security): Validate [endpoint]"
```

**Total**: 7-8 minutes

---

## Common Issues & Solutions

### Issue: Schema doesn't match current Prisma model
**Solution**: `npm run validate:schema-parity` will catch this
**Fix**: Update schema to match Prisma (enum values, field types)

### Issue: Handler already has validation
**Solution**: Check handler BEFORE starting (Step 1)
**Fix**: None needed! (or just fix .parse → .safeParse in handler)

### Issue: Multiple schemas needed for one endpoint
**Solution**: Endpoint likely complex (use specialist for review)
**Fix**: Consider if endpoint doing too much (separation of concerns)

### Issue: Custom validation logic needed
**Solution**: Toolkit won't help (too specific)
**Fix**: Create custom schema with business rules, get specialist review

---

## Toolkit Philosophy

**Toolkits are for**:
- ✅ **Execution** (not analysis)
- ✅ **Repetitive tasks** (proven patterns)
- ✅ **User-directed** (you decide what to fix)
- ✅ **Quick wins** (5-10 min per endpoint)

**Specialists are for**:
- ✅ **Analysis** (what needs fixing?)
- ✅ **Complex problems** (unknown scope)
- ✅ **Autonomous** (specialist decides approach)
- ✅ **Comprehensive** (2-3 hour deep dives)

**Together**:
- Specialist audit finds 50 endpoints needing fixes
- Toolkit guides fixing each endpoint efficiently
- Result: Systematic + efficient remediation

---

## Proven Results (Nov 3, 2025)

**Pilots Tested**:
- Pilot #1: POST /api/pov (6 minutes actual)
- Pilot #2: POST /api/pov/[povId]/phase (2 minutes - already validated)

**Success Metrics**:
- ✅ 6 min vs 20 min estimate (70% faster)
- ✅ All tests passing
- ✅ Pattern repeatable
- ✅ User direction minimal (just "proceed")
- ✅ Handler check prevented duplication

**Validation**:
- Pattern works for both route and handler validation
- Tool commands (discover, validate) essential
- Step-by-step granularity is right
- Batching within steps efficient

---

## Next Steps After Using Toolkit

### After Fixing 5+ Endpoints:
- Consider creating batch schema
- See: batch-endpoint-remediation-guide.md
- Time savings: 80-90%

### After Fixing 20+ Endpoints:
- Run endpoint-security-audit again
- Measure security score improvement
- Identify remaining gaps

### Quarterly Maintenance:
- Run `npm run validate:schema-parity`
- Check for new unvalidated endpoints
- Re-run endpoint-security-audit

---

**Toolkit Version**: 1.0
**Date Created**: November 3, 2025
**Proven In**: 2 pilots (6 min, 2 min)
**Time Savings**: 70% faster than estimated
**Success Rate**: 100% (2/2 pilots successful)
**Ready for**: Production use ✅
