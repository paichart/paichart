# Field Limit Alignment Discovery
**Purpose**: Detect cross-schema field limit mismatches that cause runtime validation failures
**Category**: Boundary Contract Validation
**Priority**: CRITICAL
**Time**: 30-45 minutes
**Created**: November 8, 2025 (from Agent Domain Security Audit)

---

## 🆕 2026-06-17 — Adoption-tail state (deferred to next health report)

The two genuine **cross-boundary mismatches** are FIXED (commit `d59d47a3`): task title
unified to `FIELD_LIMITS.TITLE` (was 255 on REST path vs 500 on template path; raised — non-breaking)
and `FIELD_LIMITS.URL_LONG = 2048` added for attachment/link URLs (distinct from `URL = 500`
endpoint cap). No runtime-failure risk remains.

**Deferred (hygiene only, low decay):** ~43 hardcoded string-size literals still don't reference
a constant. Run `npm run report:field-limits` (`scripts/check-field-limits-adoption.ts`,
report-only, no CI gate) to regenerate the live list. Don't re-derive by hand — the tool already
buckets them. As of this session:
- **Safe-to-migrate** (single-constant value): `255→NAME`, `2000→DESCRIPTION`, `1000→MODERATE_TEXT`,
  `5000→METADATA`, `50000→CONTENT`. ⚠️ `task-validation.ts:343` (prompt 50000) is **pinned** by
  `test-task-security.ts:535` (`.includes('.max(50000')`) — migrating it breaks CI unless the test
  is updated in the same commit.
- **Needs a per-field decision, NOT mechanical:**
  - `500` is overloaded across 5 constants (SHORT_TEXT/TITLE/URL/SECRET/SEARCH_QUERY) — pick by semantics.
  - `100` collides with `SERVICE_CALL_ARGS_MAX_LEAVES` as well as `LABEL`.
  - `50→ID` is a **footgun**: category/status/tag fields are value-50 but aren't IDs (ID = version strings).
- **Two modeling gaps to close FIRST** (make any migration unambiguous): add a `SHORT_LABEL = 50`
  constant for short categorical fields; resolve the `500` overload. Fixing these is higher-value
  than the migration itself.

**Guard-test feasibility lesson:** a message-heuristic guard has a ~90-item blind spot (message-less
`.max(N)` on arrays/numbers can't be proven out-of-scope). A *gating* CI guard needs **AST chain-root
detection** (`z.string().max()` in-scope vs `z.array()/z.number().max()` out-of-scope), not regex.
The committed sketch is intentionally report-only until that upgrade lands.

---

## 🎯 What This Discovery Finds

**Problem**: Data flows from Schema A → Schema B, but Schema B has smaller field limits than Schema A, causing validation failures at runtime.

**Example** (Discovered Nov 8, 2025):
```
Task description: 50KB max (CreateTaskSchema)
    ↓ (passed to agent execution)
Agent prompt: 10KB max (AgentExecuteSchema) ❌ VALIDATION FAILURE!
```

**Impact**:
- Runtime validation errors for legitimate use cases
- User workarounds (truncating data, splitting context)
- Reduced system effectiveness (incomplete data transfer)
- Poor user experience ("field too long" errors)

---

## 📋 Discovery Process

### Step 1: Identify All Data Flow Boundaries (10 min)

Map where data flows across validation boundaries:

```bash
# Find all validation schemas
grep -r "export const.*Schema" lib/validation/ | awk '{print $3, $0}' | sort

# Document data flow paths
# Example flows to check:
# 1. Task → Agent Execution
# 2. POV → Import/Export
# 3. Template → Template Application
# 4. User Input → Database Storage
# 5. API Request → Background Job
# 6. Form Data → API Payload
```

**Output**: List of boundaries to check

**Example**:
```
Boundary 1: Task.description → AgentExecuteSchema.prompt
Boundary 2: POV.description → ImportPOVSchema.description
Boundary 3: Template.promptTemplate → ApplyTemplateSchema.variables
Boundary 4: User.bio → ProfileUpdateSchema.bio
```

---

### Step 2: Extract Field Limits from Schemas (15 min)

For each boundary, extract the field limits:

```bash
# Search for .max() calls in validation schemas
grep -rn "\.max(" lib/validation/*.ts | grep -v node_modules

# Document limits by field
# Format: SchemaName.fieldName: limit
```

**Categorize by Field Purpose**:
1. **Content/Prompt Fields** (typically 50KB)
   - Task descriptions
   - Agent prompts
   - Template content
   - User-generated content

2. **Metadata Fields** (typically 500B - 5KB)
   - Descriptions of objects
   - Help text
   - Comments
   - Notes

3. **Name/Title Fields** (typically 255 chars)
   - Object names
   - Titles
   - Labels

**Example Output**:
```
Content Fields (50KB):
  - CreateTaskSchema.description: 50000
  - CreateTaskSchema.prompt: 50000
  - BaseAgentTemplateSchema.promptTemplate: 50000
  - AgentExecuteSchema.prompt: 10000 ⚠️ MISMATCH!

Metadata Fields (5KB):
  - BaseAgentTemplateSchema.description: 5000
  - CreatePOVSchema.description: 5000

Name Fields (255 chars):
  - CreateTaskSchema.title: 255
  - BaseAgentTemplateSchema.name: 255
```

---

### Step 3: Trace Data Flow Paths (10 min)

For each data flow boundary, verify limits are aligned:

```bash
# Example: Task → Agent flow
echo "Checking: Task.description → Agent.prompt"

# Source limit
grep -A 2 "description.*FormField\|description.*z\.string" lib/validation/task-validation.ts | grep max

# Destination limit
grep -A 2 "prompt.*z\.string" lib/validation/agent-template-validation.ts | grep max

# Compare and flag mismatches
```

**Check Pattern**:
```typescript
// Source Schema (Task)
description: FormField.optionalString(50000) // ✅ 50KB

// Destination Schema (Agent)
prompt: z.string().max(10000) // ❌ 10KB - MISMATCH!

// FINDING: Task descriptions (50KB) cannot be passed as agent prompts (10KB)
```

---

### Step 4: Validate Against Use Cases (5 min)

Confirm mismatches are real issues by checking actual usage:

```bash
# Search for where source data is passed to destination
grep -rn "agentConfig.*prompt" app/api/ | head -20

# Look for patterns like:
# - task.description → agentConfig.prompt
# - pov.data → importData
# - template.content → variableValue
```

**Red Flags**:
- Source data passed directly to smaller destination field
- Comments like "// TODO: handle large descriptions"
- User-reported bugs about "field too long"
- Workarounds (substring, truncate, split)

---

### Step 5: Categorize Findings (5 min)

**CRITICAL Mismatches** (Fix immediately):
- Content fields with 5x+ difference (50KB → 10KB)
- Common user workflows affected
- No workaround possible

**HIGH Mismatches** (Fix soon):
- Content fields with 2-5x difference (10KB → 5KB)
- Edge case workflows affected
- Workaround exists but poor UX

**MEDIUM Mismatches** (Review):
- Metadata fields with small differences
- Rare workflows affected
- Easy workaround available

**Intentional Limits** (Document):
- Different field purposes (content vs metadata)
- Security constraints (prevent abuse)
- Performance considerations

---

## 🔍 Discovery Commands

### Quick Scan (5 minutes)
```bash
#!/bin/bash
# Find all .max() limits in validation schemas

echo "=== Field Limits by Schema ==="
for file in lib/validation/*.ts; do
  echo ""
  echo "📄 $(basename $file)"
  grep -n "\.max(" "$file" | grep -v "//" | head -10
done

echo ""
echo "=== Potential Mismatches (50KB content fields) ==="
# Find fields with 50000 limit
grep -rn "\.max(50000" lib/validation/ | cut -d: -f1,2,3

echo ""
echo "=== Check these against smaller limits in related schemas ==="
```

### Detailed Analysis (30 minutes)
```bash
#!/bin/bash
# Comprehensive field limit audit

OUTPUT="field-limit-audit-$(date +%Y%m%d).md"

echo "# Field Limit Audit - $(date)" > $OUTPUT
echo "" >> $OUTPUT

echo "## Content Fields (Expected: 50KB)" >> $OUTPUT
grep -rn "\.max(50000\|\.max(10000\|\.max(5000" lib/validation/ | \
  grep -i "prompt\|description\|content\|text" >> $OUTPUT

echo "" >> $OUTPUT
echo "## Metadata Fields (Expected: 500B-5KB)" >> $OUTPUT
grep -rn "\.max(5000\|\.max(2000\|\.max(1000\|\.max(500" lib/validation/ | \
  grep -i "description\|comment\|note\|help" >> $OUTPUT

echo "" >> $OUTPUT
echo "## Name Fields (Expected: 255 chars)" >> $OUTPUT
grep -rn "\.max(255" lib/validation/ | \
  grep -i "name\|title\|label" >> $OUTPUT

echo "Audit saved to: $OUTPUT"
cat $OUTPUT
```

---

## 📊 Analysis Template

### Boundary Analysis
```markdown
## Boundary: [Source] → [Destination]

**Source Schema**: [SchemaName]
**Source Field**: [fieldName]
**Source Limit**: [limit] chars

**Destination Schema**: [SchemaName]
**Destination Field**: [fieldName]
**Destination Limit**: [limit] chars

**Data Flow**: [Describe how data moves]
**Use Case**: [Why this flow exists]

**Status**:
- [ ] ✅ ALIGNED (limits match)
- [ ] ⚠️ INTENTIONAL (different purposes, documented)
- [ ] ❌ MISMATCH (needs fix)

**If MISMATCH**:
- **Impact**: [User experience impact]
- **Priority**: CRITICAL / HIGH / MEDIUM
- **Fix**: Increase destination limit to [limit]
- **Rationale**: [Why this limit is needed]
```

---

## ✅ Success Criteria

### Complete Discovery Includes:
- [ ] All data flow boundaries identified (10+ boundaries minimum)
- [ ] All field limits documented (by category)
- [ ] All mismatches found and categorized (CRITICAL/HIGH/MEDIUM)
- [ ] Use cases validated (confirm real issue, not theoretical)
- [ ] Fix recommendations with rationale

### Red Flags Found:
- [ ] Content fields with 5x+ limit difference
- [ ] Common workflows blocked by limits
- [ ] User workarounds in code (truncate, substring)
- [ ] Comments about field size issues
- [ ] Bug reports about "too long" errors

### Documentation Created:
- [ ] Field limit inventory (all schemas)
- [ ] Boundary map (data flow diagram)
- [ ] Mismatch report (prioritized)
- [ ] Fix plan (with rationale comments)

---

## 🎯 Example Finding

**Discovered**: November 8, 2025 (Agent Domain Security Audit)

### Task Description → Agent Prompt Mismatch

**Boundary**: Task creation → Agent execution

**Source**:
```typescript
// lib/validation/task-validation.ts:27
description: FormField.optionalString(50000) // 50KB
```

**Destination**:
```typescript
// lib/validation/agent-template-validation.ts:502 (BEFORE FIX)
prompt: z.string().max(10000, 'Prompt must be 10000 characters or less') // 10KB ❌
```

**Impact**:
- Users with detailed task descriptions (>10KB) get validation errors
- Workaround: Truncate task descriptions before passing to agent
- Result: Agent has incomplete context, reduced effectiveness

**Fix Applied**:
```typescript
// lib/validation/agent-template-validation.ts:502 (AFTER FIX)
prompt: z.string().max(50000, 'Prompt must be 50000 characters or less') // 50KB ✅
// Match task description limit (task descriptions can be passed as prompts)
```

**Rationale**: Task descriptions are meant to be passed to agent execution as prompts. The limit must match to support this common workflow.

**Category**: CRITICAL (5x mismatch, common workflow, no workaround)

---

## 🔄 Quarterly Review Checklist

- [ ] Re-run field limit audit (30 min)
- [ ] Check for new validation schemas added
- [ ] Verify previous fixes still aligned
- [ ] Document any new boundaries discovered
- [ ] Update field limit standards if needed

**Automation Opportunity**: Create automated test that validates field limits across boundaries.

---

## 📚 Related Discoveries

- `boundary-contract-discovery.md` - General boundary validation
- `schema-parity-discovery.md` - Schema-Prisma alignment
- `validation-coverage-discovery.md` - Validation pattern usage

---

**Discovery Complete** ✅
**Use Case**: Prevent runtime validation failures from cross-boundary limit mismatches
**Frequency**: Quarterly or when adding new data flows
**Priority**: CRITICAL (prevents user-facing errors)
