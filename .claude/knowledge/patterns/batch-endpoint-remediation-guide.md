# Batch Endpoint Remediation Guide

**Purpose**: Efficiently secure multiple unvalidated endpoints using batch patterns
**Pattern**: Create once, apply many (1 schema → 10 endpoints)
**Time Savings**: 80-90% vs individual endpoint protocols
**Proven**: Nov 3, 2025 - Secured 4 endpoints in 2 hours

---

## Why Batch Instead of Individual Protocols

### Individual Protocol Approach (NOT RECOMMENDED)
- **Time**: 2-3 hours per endpoint × 50 endpoints = **100-150 hours**
- **Overhead**: Specialist reviews for each endpoint
- **Repetition**: Same patterns reviewed repeatedly
- **Efficiency**: 10-20% (lots of duplicated work)

### Batch Approach (RECOMMENDED)
- **Time**: 5-20 hours total for 50 endpoints
- **Overhead**: One-time audit, batch implementation
- **Reuse**: One schema applies to many endpoints
- **Efficiency**: 80-90% (minimal duplication)

**ROI**: 10x time savings!

---

## Batch Remediation Process

### Step 1: Audit Once (3 hours)

**Run endpoint-security-audit-protocol**:
- Identifies ALL unvalidated endpoints (189 total)
- Categorizes by risk (CRITICAL/HIGH/MEDIUM/LOW)
- Groups by pattern/domain
- Prioritizes fixes

**Output**: Complete inventory with grouping suggestions

---

### Step 2: Group Endpoints by Pattern (30 min)

**Grouping Strategy**:

**By Domain** (shared validation logic):
```
POV Domain:
- POST /api/pov → CreatePOVSchema
- PUT /api/pov/[id] → UpdatePOVSchema
- POST /api/pov/[id]/phases → CreatePhaseSchema
- PUT /api/pov/[id]/phases/[phaseId] → UpdatePhaseSchema
→ 1 validation file, 4+ endpoints

Task Domain:
- POST /api/tasks → CreateTaskSchema (exists!)
- PUT /api/tasks/[id] → UpdateTaskSchema (exists!)
- POST /api/tasks/[id]/dependencies → TaskDependencySchema (exists!)
→ 0 new schemas needed, just apply existing
```

**By Operation Type** (shared fields):
```
All "Create" Operations:
- Similar fields: title, description, status
- Shared patterns: text validation, enum validation, CUID IDs
- Template schema: Base creation pattern

All "Update" Operations:
- Similar pattern: all fields optional
- Shared pattern: .partial() on create schema
```

**By Risk Level** (security priority):
```
CRITICAL (P0 - this week):
- Agent template builder
- Auth profile
- CRM settings
→ Group by security priority, not domain

HIGH (P1 - next week):
- POV operations
- Notification operations
→ Group by shared validation needs
```

---

### Step 3: Create Batch Validation Schemas (2-8 hours)

**Pattern 1: Domain Batch**

```typescript
// lib/validation/pov-validation.ts (1 file for entire POV domain)

export const CreatePOVSchema = z.object({
  title: secureText(500, 'Title'),
  description: FormField.optionalString(5000),
  status: PrismaEnum.povStatus,
  // ... all POV creation fields
});

export const UpdatePOVSchema = CreatePOVSchema.partial();

export const CreatePhaseSchema = z.object({
  povId: POVId,  // From id-validation.ts
  name: secureText(255, 'Name'),
  type: PrismaEnum.phaseType,
  // ... all phase fields
});

export const UpdatePhaseSchema = CreatePhaseSchema.partial();

// 4 schemas in 1 file → applies to 10+ endpoints!
```

**Time**: 2 hours per domain
**Reuse**: 1 file → 5-15 endpoints

---

**Pattern 2: Operation Type Batch**

```typescript
// lib/validation/helpers/creation-patterns.ts

export const createCreationSchema = (entityName, fields) => {
  return z.object({
    title: secureText(500, `${entityName} title`),
    description: FormField.optionalString(5000),
    ...fields  // Entity-specific fields
  });
};

// Use for all create operations
export const CreateMilestoneSchema = createCreationSchema('Milestone', {
  dueDate: FormField.optionalDateTime(),
  target: secureText(1000, 'Target'),
});

export const CreateWorkflowSchema = createCreationSchema('Workflow', {
  steps: z.array(workflowStepSchema).max(20),
});
```

**Time**: 1 hour to create helper
**Reuse**: Helper → 20+ creation endpoints

---

**Pattern 3: Security Priority Batch**

```typescript
// Fix all CRITICAL first (regardless of domain)

// Week 1: CRITICAL (5 endpoints, 8 hours)
1. Agent template builder → 2 hours
2. Auth profile → 1.5 hours
3. CRM settings → 2 hours
4. Prompt library → 1.5 hours
5. Template edit → 1 hour

// Week 2: HIGH (10 endpoints, 10 hours)
// Week 3: MEDIUM (15 endpoints, 10 hours)
```

---

### Step 4: Apply Schemas in Batch (3-6 hours)

**Efficient Application Pattern**:

```typescript
// For each endpoint in batch:
// 1. Import schema (1 line)
// 2. Add validation (5 lines)
// 3. Add security logging (3 lines)
// Total: 9 lines per endpoint

// Example: Apply CreatePOVSchema to 5 endpoints
const endpoints = [
  'app/api/pov/route.ts',
  'app/api/pov/[id]/clone/route.ts',
  'app/api/pov/templates/route.ts',
  // ... 5 endpoints
];

// Each endpoint takes 10 minutes (not 1 hour!)
// 5 endpoints = 50 minutes (vs 5 hours individual)
```

**Time per Endpoint** (when schema exists):
- Import: 1 min
- Add .safeParse(): 3 min
- Add error handling: 2 min
- Add security logging: 2 min
- Test: 2 min
**Total**: ~10 minutes per endpoint

---

### Step 5: Test Batch (1 hour)

**Batch Testing Strategy**:

```bash
# Create test script for the batch
cat > test-pov-validation.sh << 'EOF'
#!/bin/bash
# Test all POV endpoints with malicious payloads

# Test 1: XSS in title
curl -X POST /api/pov -d '{"title": "<script>alert(1)</script>"}'
# Expected: 400 Bad Request

# Test 2: Oversized description
curl -X POST /api/pov -d '{"description": "'$(python3 -c 'print("A"*10000)')'}'
# Expected: 400 Bad Request (max 5000)

# Test 3: Valid input
curl -X POST /api/pov -d '{"title": "Valid POV", "description": "Normal text"}'
# Expected: 201 Created
EOF

chmod +x test-pov-validation.sh
./test-pov-validation.sh
```

**Time**: 15 min per batch of 5-10 endpoints

---

### Step 6: Deploy Batch (30 min)

```bash
# Commit batch together
git add lib/validation/pov-validation.ts
git add app/api/pov/**/*.ts
git commit -m "fix(security): Validate POV domain endpoints (5 endpoints)"
git push

# Monitor for 1 hour
pm2 logs | grep -i "security\|validation"
```

---

## Batch Templates by Domain

### Template 1: POV Domain Batch

**Endpoints** (11 total):
- POST /api/pov
- PUT /api/pov/[id]
- DELETE /api/pov/[id]
- POST /api/pov/[id]/phases
- PUT /api/pov/[id]/phases/[phaseId]
- POST /api/pov/[id]/stages
- PUT /api/pov/[id]/stages/[stageId]
- POST /api/pov/[id]/team/members
- DELETE /api/pov/[id]/team/members/[memberId]
- POST /api/pov/[id]/clone
- POST /api/pov/templates

**Shared Validation**:
- POV: CreatePOVSchema, UpdatePOVSchema (may exist in pov.ts)
- Phase: CreatePhaseSchema, UpdatePhaseSchema
- Stage: CreateStageSchema, UpdateStageSchema
- Team: AddTeamMemberSchema (exists!)

**Time**: 4 hours total (vs 22 hours individual)

---

### Template 2: Agent/Template Domain Batch

**Endpoints** (9 total):
- POST /api/agent-templates
- PUT /api/agent-templates/[id]
- POST /api/agent-templates/builder (fixed!)
- POST /api/agent-templates/[id]/apply (Week 5 - exists!)
- POST /api/agent-templates/prompt-library
- PUT /api/agent-templates/prompt-library/[id]
- POST /api/phase-templates
- PUT /api/phase-templates/[id]
- POST /api/phase-templates/import

**Shared Validation**:
- Most schemas exist from Week 5!
- Just need to apply them

**Time**: 2 hours total (vs 18 hours individual)

---

### Template 3: Notification Domain Batch

**Endpoints** (4 total):
- POST /api/notifications
- PUT /api/notifications/[id]/read
- POST /api/notifications/clear
- POST /api/notifications/read-all

**Shared Validation**:
- Simple schemas (IDs only, no text)
- Low security risk (no user text)

**Time**: 1 hour total (vs 8 hours individual)

---

## Time Savings Comparison

| Approach | Time for 50 Endpoints | Efficiency |
|----------|----------------------|------------|
| **Individual Protocol** | 100-150 hours | 10-20% |
| **Batch by Domain** | 15-20 hours | 80-90% |
| **Automated Script** | 5-10 hours | 95%+ |

**Recommendation**: Use batch approach for most, automation for simple patterns

---

## Quick Reference: Batch Patterns

### Pattern A: Existing Schema, Multiple Endpoints
**Example**: TaskSchema exists, apply to 5 task endpoints
**Time**: 10 min per endpoint = 50 min total

### Pattern B: New Schema, Multiple Endpoints
**Example**: Create POVSchema, apply to 11 POV endpoints
**Time**: 2 hours create + 10 min × 11 = 4 hours total

### Pattern C: Simple Endpoints (IDs only)
**Example**: Notification endpoints (no text, just IDs)
**Time**: 5 min per endpoint (simple validation)

---

## Success Metrics

**Target Efficiency**: 80%+ time savings
**Quality**: Same security as individual protocols
**Coverage**: 50 endpoints in 15-20 hours
**Confidence**: 95%+ (batch tested together)

---

## When to Use vs Not Use

### Use Batch Approach When:
- ✅ Multiple endpoints in same domain (POV, tasks, agents)
- ✅ Shared validation patterns (all have title/description)
- ✅ Similar security requirements (all accept text)
- ✅ 5+ endpoints to fix

### DON'T Use Batch When:
- ❌ Unique endpoint (no similar endpoints)
- ❌ Complex custom validation (one-off requirements)
- ❌ Critical security endpoint (needs individual specialist review)
- ❌ < 3 endpoints (overhead not worth it)

**Rule of Thumb**: 3+ similar endpoints → Use batch

---

**Guide Version**: 1.0
**Date Created**: November 3, 2025
**Proven Pattern**: ✅ Nov 3 session (4 endpoints in 2 hours)
**Time Savings**: 80-90% vs individual protocols
