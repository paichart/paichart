# Endpoint Security Fix Checklist

**Endpoint**: [Full path - e.g., POST /api/pov/[povId]/phases]
**Risk Level**: [CRITICAL/HIGH/MEDIUM/LOW]
**Estimated Time**: [15-30 min if schema exists, 1-2 hours if creating schema]
**Date Started**: ___________
**Date Completed**: ___________

---

## Quick Assessment (2 min)

- [ ] **Endpoint Path**: _________________________________
- [ ] **HTTP Method**: GET / POST / PUT / DELETE / PATCH
- [ ] **Accepts User Input**: YES / NO
- [ ] **Input Type**: None / IDs only / Enums / Text (title/description/etc)
- [ ] **Current Validation**: None / Type cast / Inline / Centralized
- [ ] **Security Risk**: CRITICAL / HIGH / MEDIUM / LOW

---

## Discovery Phase (5 min)

### Check for Existing Schemas

- [ ] **Run schema discovery**:
  ```bash
  node scripts/discover-validation-schemas.js [domain-name]
  ```

- [ ] **Result**:
  - [ ] Schema exists: _________________________ (file:line)
  - [ ] No schema exists (need to create)

### Verify Schema-Prisma Parity

- [ ] **Run parity check**:
  ```bash
  node scripts/validate-schema-prisma-parity.js
  ```

- [ ] **Result**:
  - [ ] ✅ Parity check passed (schemas match Prisma)
  - [ ] ⚠️ Warnings found (review and fix)
  - [ ] ❌ Violations found (MUST fix before using)

---

## Schema Preparation (0-60 min)

### If Schema Exists (5 min):

- [ ] **Import schema**:
  ```typescript
  import { [SchemaName] } from '@/lib/validation/[file]';
  ```

- [ ] **Verify schema covers all endpoint fields**:
  - [ ] All required fields present
  - [ ] All optional fields have .optional()
  - [ ] Enums use z.nativeEnum()
  - [ ] IDs use .cuid()
  - [ ] Text fields have max lengths

### If Schema Doesn't Exist (30-60 min):

- [ ] **Create new schema** in appropriate validation file:
  - [ ] Use FormField helpers for optional fields
  - [ ] Use PrismaEnum for all enums
  - [ ] Use id-validation helpers for IDs
  - [ ] Use secureText() for user text (if exists)
  - [ ] Add detectPromptInjection() for prompts/descriptions
  - [ ] Set appropriate max lengths (200/2000/5000)
  - [ ] Use .strict() to reject unknown fields

- [ ] **Example template**:
  ```typescript
  export const Create[Entity]Schema = z.object({
    title: secureText(200, 'Title'),  // If text input
    description: FormField.optionalString(5000),  // If optional text
    status: PrismaEnum.[entity]Status,  // If has enum
    [entity]Id: [Entity]Id,  // If has parent ID
    // ... other fields
  }).strict();

  export const Update[Entity]Schema = Create[Entity]Schema.partial();
  ```

---

## Implementation Phase (10-15 min)

### Step 1: Add Validation to Handler

- [ ] **Find handler location**:
  - [ ] Route file: app/api/[path]/route.ts
  - [ ] OR Handler file: lib/[domain]/handlers/[operation].ts

- [ ] **Add imports**:
  ```typescript
  import { [SchemaName] } from '@/lib/validation/[file]';
  ```

- [ ] **Find JSON parsing line**:
  ```typescript
  // Look for:
  const data = await req.json();
  const data: SomeType = await req.json();  // Type cast
  ```

- [ ] **Replace with validated parsing**:
  ```typescript
  const data = await req.json();

  // ✅ SECURITY: Validate with [protection description]
  const validation = [SchemaName].safeParse(data);

  if (!validation.success) {
    // Log security violations
    console.warn('[Security] [Endpoint] validation failed:', {
      userId: user?.userId,
      errors: validation.error.issues,
      data: JSON.stringify(data).slice(0, 200)
    });

    return NextResponse.json(
      {
        error: 'Invalid request data',
        issues: validation.error.issues
      },
      { status: 400 }
    );
  }

  const validatedData = validation.data;  // Now safe!
  ```

- [ ] **Update variable usage**:
  - [ ] Replace `data.field` with `validatedData.field`
  - [ ] Remove old type casts
  - [ ] Remove manual field checks (if any)

---

## Testing Phase (5 min)

### Security Tests

- [ ] **Test XSS payload** (should reject):
  ```bash
  curl -X POST [endpoint] \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"title": "<script>alert(1)</script>"}'
  # Expected: 400 Bad Request
  ```

- [ ] **Test oversized payload** (should reject):
  ```bash
  curl -X POST [endpoint] \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"description": "'$(python3 -c 'print("A"*10000)')'}'
  # Expected: 400 Bad Request
  ```

- [ ] **Test valid payload** (should accept):
  ```bash
  curl -X POST [endpoint] \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"title": "Valid Title", "description": "Valid description"}'
  # Expected: 200/201 Success
  ```

### Validation Tests

- [ ] **Run validation test suite**:
  ```bash
  npm run test:all-validation
  # Expected: All tests pass (53+)
  ```

- [ ] **Check TypeScript compilation**:
  ```bash
  npx tsc --noEmit [file]
  # Expected: No errors
  ```

---

## Deployment Phase (5 min)

### Pre-Deployment

- [ ] **Final checks**:
  - [ ] All tests passing
  - [ ] TypeScript compiles
  - [ ] Security logging present
  - [ ] Error handling correct (400, not 500)

- [ ] **Commit changes**:
  ```bash
  git add lib/validation/[file].ts [endpoint-files]
  git commit -m "fix(security): Validate [endpoint-name] (XSS/DoS prevention)"
  git push origin main
  ```

### Post-Deployment

- [ ] **Monitor for 1 hour**:
  ```bash
  # Watch for validation failures
  pm2 logs | grep -i "security.*validation"

  # Watch for false positives
  pm2 logs | grep -i "400"
  ```

- [ ] **Verify legitimate requests work**:
  - [ ] Test with real user input
  - [ ] Check no false positives
  - [ ] Verify error messages helpful

---

## Completion Checklist

- [ ] ✅ Schema discovered or created
- [ ] ✅ Schema-Prisma parity verified
- [ ] ✅ Validation added to endpoint
- [ ] ✅ Security logging enabled
- [ ] ✅ Tests passing (XSS, DoS, valid)
- [ ] ✅ TypeScript compiles
- [ ] ✅ Deployed to production
- [ ] ✅ Monitored for 1 hour (no issues)

**Time Actual**: _________ minutes
**Security Risk**: [Before] → [After - SECURED ✅]

---

## Notes / Issues Encountered

[Space for notes on any issues, edge cases, or learnings]

---

## Template Usage

**Copy this checklist for each endpoint**:
```bash
cp .claude/knowledge/templates/endpoint-security-fix-checklist.md \
   cline_docs/endpoint-fixes/[endpoint-name]-fix-checklist.md
```

**Fill in**:
- Endpoint path and method
- Risk level (from audit)
- Schema name (from discovery)
- Test results
- Deployment date

**Track Progress**:
- Use checkboxes to track completion
- Record actual time
- Note any issues for future reference

---

**Template Version**: 1.0
**Date Created**: November 3, 2025
**Based On**: Builder endpoint fix (10 min actual time)
**Success Rate**: 100% (proven pattern)
