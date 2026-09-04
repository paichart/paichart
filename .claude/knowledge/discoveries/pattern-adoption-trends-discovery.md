# Pattern Adoption Trends Discovery

**Purpose**: Track if proven patterns are being followed or decaying over time
**Frequency**: Quarterly reviews
**Time**: 15 minutes
**Output**: Trend report (adoption %, growth/decline metrics)
**Created**: November 7, 2025 (from POV domain quarterly insights)

---

## When to Run This Discovery

**Quarterly Reviews**:
- Every 3 months security review
- Before major releases
- After significant team changes

**Event-Driven**:
- New developers onboarded
- After architectural refactoring
- When code quality concerns arise

**Purpose**: Detect pattern decay before it becomes a problem

---

## Phase 1: Middleware Adoption Tracking (5 min)

### Step 1.1: Count Middleware Usage

**withPOVAccess Adoption**:
```bash
# Routes using withPOVAccess middleware
grep -r "export const.*withPOVAccess\|export const.*= withPOVAccess" app/api/pov --include="*.ts" | wc -l

# Expected (Q1 POV): 21/21 routes (100%)
# Record for trend: Q2, Q3, Q4
```

**Manual Auth Count** (should decrease):
```bash
# Routes with manual auth (pattern NOT adopted)
grep -r "const user = await getAuthUser" app/api/pov --include="*.ts" | wc -l

# Expected (Q1 POV): 0 (fully migrated)
# Trend: If increasing, developers not using middleware
```

**Other Middleware**:
```bash
# requirePermission usage
grep -r "requirePermission" app/api --include="*.ts" | wc -l

# createHandler usage
grep -r "export.*createHandler" app/api --include="*.ts" | wc -l
```

**Record**:
- [ ] withPOVAccess: ?/? routes (% coverage)
- [ ] Manual auth: ? occurrences (trend)
- [ ] Other middleware: ? uses

---

### Step 1.2: Measure Adoption Rate

**Calculate Coverage**:
```bash
# Total POV routes
total=$(find app/api/pov/[povId] -name "route.ts" | wc -l)

# Routes using withPOVAccess
adopted=$(grep -r "withPOVAccess" app/api/pov/[povId] --include="*.ts" -l | wc -l)

# Adoption rate
echo "Adoption: $adopted/$total routes ($(($adopted * 100 / $total))%)"

# Expected Q1: 21/21 (100%)
# Alert if: < 90% (pattern decay)
```

**Thresholds**:
- **100%**: Perfect (gold standard)
- **90-99%**: Good (acceptable variance)
- **70-89%**: Warning (investigate why)
- **< 70%**: Critical (pattern lost)

---

## Phase 2: File Structure Stability (3 min)

### Step 2.1: Count Validation Files

**File Count** (should stay stable):
```bash
# Current validation file count
ls -1 lib/validation/*.ts | wc -l

# Expected Q1: 21 files
# Expected Q2-Q4: 21-23 files (minimal growth)
# Alert if: > 25 files (proliferation starting)
```

**New Files Created**:
```bash
# Files created since last quarter
git log --since="3 months ago" --name-only --diff-filter=A --pretty=format: | \
  grep "lib/validation/.*\.ts" | sort -u

# Expected: 0-2 new files per quarter
# Alert if: > 3 files (pattern not being followed)
```

**Domain Cohesion Check**:
```bash
# Largest validation files (should be domain aggregators)
wc -l lib/validation/*.ts | sort -rn | head -5

# Expected pattern:
# 561 lib/validation/pov.ts (complete POV domain)
# 541 lib/validation/agent-template-validation.ts
# 165 lib/validation/task-validation.ts
#
# Alert if: Many small files (< 100 lines) = fragmentation
```

**Record**:
- [ ] File count: ? files (trend: stable/growing/shrinking)
- [ ] New files this quarter: ?
- [ ] Domain cohesion: Good/Fragmenting

---

## Phase 3: Code Quality Indicators (4 min)

### Step 3.1: Type Safety Trend

**Type Assertions** (should stay low):
```bash
# Count type assertions (code smell)
grep -r "as unknown as\|as any" app/api lib/ --include="*.ts" | wc -l

# Expected Q1: ~20 uses (mostly in withPOVAccess conversions)
# Trend: Stable = acceptable, increasing = type safety eroding
# Alert if: > 50% increase from last quarter
```

**Specific Danger Pattern**:
```bash
# Response vs NextResponse casts (specific issue)
grep -r "as unknown as NextResponse" app/api --include="*.ts" | wc -l

# Expected Q1: ~10 uses
# Trend: Should decrease as handlers are updated
# Alert if: Increasing (new routes making same mistake)
```

---

### Step 3.2: Boilerplate Trend

**Boilerplate Lines** (should decrease):
```bash
# Count repetitive patterns
echo "=== Auth Boilerplate ==="
grep -r "const user = await getAuthUser" app/api --include="*.ts" | wc -l

echo "=== POV Loading Boilerplate ==="
grep -r "prisma.pOV.findUnique" app/api --include="*.ts" | wc -l

echo "=== Validation Boilerplate ==="
grep -r "validatePOVAccess" app/api --include="*.ts" | wc -l

# Trend: Should decrease as middleware adopted
# Alert if: Increasing (new routes not using patterns)
```

---

## Phase 4: Handler Shortcut Detection (3 min)

### Step 4.1: Find Optimization Shortcuts

**Dangerous Pattern**:
```bash
# Handlers with early return shortcuts
grep -r "if.*user.*&&.*pov" lib/*/handlers/*.ts -B 2 -A 5

# Example (risky):
# if (user && pov) {
#   return pov;  // ← Returns lightweight version (may be missing data!)
# }
```

**Document Findings**:
```markdown
Handler Shortcuts Found:
1. lib/pov/handlers/get.ts:14
   - Pattern: if (user && pov) return pov;
   - Risk: Returns lightweight pov (no phases/stages)
   - Status: Known issue, routes must not pass user/pov

2. lib/pov/handlers/delete.ts:14
   - Pattern: if (user && pov) { log }
   - Risk: None (just logging, continues normally)
   - Status: Safe
```

**Trend Tracking**:
- Q1: 2 shortcuts (1 risky, 1 safe)
- Q2: ? shortcuts
- Alert if: New risky shortcuts added

---

## Output Format

### Quarterly Pattern Adoption Report

```markdown
# Pattern Adoption Report - Q[X] YYYY

**Date**: [date]
**Reviewer**: [name]
**Time**: 15 minutes

## Middleware Adoption

| Metric | Q1 (Baseline) | Q2 | Q3 | Q4 | Trend |
|--------|---------------|----|----|----|----|
| withPOVAccess routes | 21/21 (100%) | ?/? | ?/? | ?/? | ? |
| Manual auth count | 0 | ? | ? | ? | ? |
| requirePermission | ? | ? | ? | ? | ? |

**Status**: ✅ Stable / ⚠️ Declining / ❌ Critical

## File Structure

| Metric | Q1 | Q2 | Q3 | Q4 | Trend |
|--------|----|----|----|----|-------|
| Total files | 21 | ? | ? | ? | ? |
| New files | 0 | ? | ? | ? | ? |
| Largest file | 561L (pov.ts) | ? | ? | ? | ? |

**Status**: ✅ Stable / ⚠️ Growing / ❌ Proliferating

## Code Quality

| Metric | Q1 | Q2 | Q3 | Q4 | Trend |
|--------|----|----|----|----|-------|
| Type assertions | 20 | ? | ? | ? | ? |
| Boilerplate lines | Low | ? | ? | ? | ? |

**Status**: ✅ Good / ⚠️ Warning / ❌ Eroding

## Handler Shortcuts

| Metric | Q1 | Q2 | Q3 | Q4 | Trend |
|--------|----|----|----|----|-------|
| Total shortcuts | 2 | ? | ? | ? | ? |
| Risky shortcuts | 1 | ? | ? | ? | ? |
| New shortcuts | 0 | ? | ? | ? | ? |

**Status**: ✅ Controlled / ⚠️ Growing / ❌ Uncontrolled

## Recommendations

**If Adoption Declining**:
- Re-training on withPOVAccess pattern
- Code review emphasis on middleware
- Update onboarding docs

**If Files Proliferating**:
- Review new files (should they extend existing?)
- Developer education on domain cohesion
- Refactor if needed

**If Quality Eroding**:
- Type safety review
- Reduce type assertions
- Update handler signatures

**If Shortcuts Growing**:
- Document shortcuts (why they exist)
- Add tests for shortcut behaviors
- Consider removing shortcuts
```

---

## Integration Points

**Referenced By**:
- quarterly-review-protocol.md (Phase 1, Step 1.2)
- Quarterly review checklists
- Security scorecards

**References**:
- middleware-patterns-discovery.md (finds middleware inventory)
- PROTOCOL-to-TOOLKIT-Workflow.md (pattern examples)

**Feeds Into**:
- Remediation planning (if trends negative)
- Developer training (if patterns forgotten)
- Architecture reviews (if quality degrading)

---

**Created**: 2025-11-07
**Based On**: POV domain security audit (29 commits, 0 new files, 100% adoption)
**Proven**: Track trends quarterly to prevent decay

**END OF PATTERN ADOPTION TRENDS DISCOVERY**
