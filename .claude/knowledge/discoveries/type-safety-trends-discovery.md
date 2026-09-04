# Type Safety Trends Discovery

**Purpose**: Track TypeScript type safety erosion over time
**Frequency**: Quarterly reviews
**Time**: 10 minutes
**Output**: Type assertion count, unsafe patterns, trend analysis
**Created**: November 7, 2025 (from POV domain Response vs NextResponse issues)

---

## When to Run This Discovery

**Quarterly Reviews**:
- Every 3 months
- Before major TypeScript version upgrades
- After significant refactoring

**Event-Driven**:
- Build errors increasing
- Type-related bugs in production
- New developers onboarded

**Purpose**: Prevent type safety from eroding (band-aids accumulating)

---

## Phase 1: Type Assertion Count (3 min)

### Step 1.1: Count Type Assertions (Code Smell)

**Generic Type Assertions**:
```bash
# as unknown as (most dangerous)
grep -r "as unknown as" app/api lib/ --include="*.ts" | wc -l

# as any (also dangerous)
grep -r "as any" app/api lib/ --include="*.ts" | wc -l

# Total type assertions
grep -r "as unknown as\|as any" app/api lib/ --include="*.ts" | wc -l

# Expected Q1 (POV): ~20-30 uses (mostly in withPOVAccess conversions)
# Alert if: > 50% increase from last quarter
```

**Record**:
- [ ] `as unknown as`: ? occurrences
- [ ] `as any`: ? occurrences
- [ ] **Total**: ? type assertions

---

### Step 1.2: Locate Type Assertions (Where)

**By Directory**:
```bash
echo "=== Type Assertions by Directory ==="
for dir in app/api lib/pov lib/tasks lib/auth lib/validation; do
  count=$(grep -r "as unknown as\|as any" "$dir" --include="*.ts" 2>/dev/null | wc -l)
  if [ $count -gt 0 ]; then
    echo "$dir: $count assertions"
  fi
done

# Expected pattern:
# app/api/pov: 10-15 (withPOVAccess conversions)
# lib/auth: 5-10 (middleware helpers)
# Other: Should be minimal
```

**Hot Spots** (files with > 3 assertions):
```bash
grep -r "as unknown as\|as any" app/api lib/ --include="*.ts" -l | \
  while read file; do
    count=$(grep "as unknown as\|as any" "$file" | wc -l)
    if [ $count -gt 3 ]; then
      echo "$file: $count assertions ← REVIEW"
    fi
  done

# Alert if: Any file > 5 assertions (type safety lost)
```

---

## Phase 2: Specific Type Issues (4 min)

### Step 2.1: Response vs NextResponse Pattern

**Specific Issue from POV Domain**:
```bash
# Routes casting Response to NextResponse
grep -r "as unknown as NextResponse" app/api --include="*.ts" -n

# Expected Q1: ~10 uses (handlers returning Response)
# Context: handleApiError, handlers return Response but withPOVAccess expects NextResponse

# Trend:
# - Decreasing: Good (handlers being updated)
# - Stable: Acceptable (known pattern)
# - Increasing: Bad (new routes making same mistake)
```

**Record Examples**:
```
app/api/pov/[povId]/route.ts:34: return result as unknown as NextResponse
app/api/pov/[povId]/route.ts:41: return errorResponse as unknown as NextResponse
```

---

### Step 2.2: Parameter Type Assertions

**Find Parameter Casts**:
```bash
# Casts in function parameters (risky)
grep -r "as any\|as unknown" app/api lib/ --include="*.ts" | \
  grep -E "params.*as|data.*as|body.*as"

# Example risky patterns:
# const { povId: _, ...data } = body as any;
# handler(params as SomeType);
```

**Categorize**:
- Necessary casts (external library types)
- Lazy casts (should be properly typed)
- Dangerous casts (lose type safety)

---

### Step 2.3: Missing Type Imports

**Find `any` Types**:
```bash
# Function parameters typed as any
grep -r "user?: any\|pov?: any\|data: any" lib/ --include="*.ts" -n

# Example:
# lib/pov/handlers/put.ts:376: { params, user, pov: providedPov }: { params: { povId: string }, user?: any, pov?: any }

# Should be: Proper TokenPayload, POV types
```

**Record**:
- [ ] `any` parameters: ? occurrences
- [ ] Should have types: ? (could be properly typed)

---

## Phase 3: Type Coverage Metrics (3 min)

### Step 3.1: Calculate Type Safety Score

**Formula**:
```
Type Safety Score = 100 - (
  (type_assertions × 0.5) +
  (any_parameters × 1.0) +
  (missing_imports × 0.5)
)

Where:
- type_assertions: Count of "as unknown as" or "as any"
- any_parameters: Count of ": any" in function params
- missing_imports: Count of types that could be imported

Maximum deduction: 50 points
```

**Example Calculation**:
```
Q1 (POV):
- Type assertions: 20 × 0.5 = -10
- Any parameters: 10 × 1.0 = -10
- Missing imports: 5 × 0.5 = -2.5
Score: 100 - 22.5 = 77.5/100 (Good)

Q2:
- Type assertions: 30 × 0.5 = -15
- Any parameters: 15 × 1.0 = -15
- Missing imports: 8 × 0.5 = -4
Score: 100 - 34 = 66/100 (Warning - eroding!)
```

**Thresholds**:
- **90-100**: Excellent type safety
- **75-89**: Good type safety
- **60-74**: Warning (improving needed)
- **< 60**: Critical (type safety lost)

---

## Output Format

### Type Safety Trend Report

```markdown
# Type Safety Trend Report

**Date**: [date]
**Period**: Q[X] YYYY

## Type Assertion Trend

| Quarter | as unknown | as any | Total | Change | Trend |
|---------|------------|--------|-------|--------|-------|
| Q0 | 15 | 10 | 25 | - | - |
| Q1 (POV) | 12 | 8 | 20 | -5 | ↓ Better |
| Q2 | ? | ? | ? | ? | ? |
| Q3 | ? | ? | ? | ? | ? |

**Status**: ✅ Improving / ⚠️ Stable / ❌ Eroding

**Alert**: If Q[X] > Q[X-1] + 10 → Type safety eroding

## Response vs NextResponse

| Quarter | Casts | Change | Status |
|---------|-------|--------|--------|
| Q1 (POV) | 10 | - | Baseline |
| Q2 | ? | ? | ? |

**Expected**: Decreasing (handlers updated) or Stable (acceptable pattern)
**Alert**: If increasing (new mistakes)

## Any Parameters

| Quarter | any Params | Change | Status |
|---------|-----------|--------|--------|
| Q1 | 10 | - | Baseline |
| Q2 | ? | ? | ? |

**Expected**: Decreasing (types added) or Stable (external libraries)
**Alert**: If increasing (laziness)

## Type Safety Score

| Quarter | Score | Trend | Status |
|---------|-------|-------|--------|
| Q1 | 77.5 | - | Good |
| Q2 | ? | ? | ? |

**Threshold**:
- > 75: Acceptable
- < 75: Action needed
- < 60: Critical

## Hot Spots (Files with >5 Assertions)

**Q1**:
- None (no hot spots)

**Q2**:
- [file]: ? assertions ← REVIEW

## Recommendations

**If Score Declining**:
- [ ] Type audit of hot spots
- [ ] Proper type imports (not any)
- [ ] Update handler signatures
- [ ] Remove unnecessary casts

**If Response Issues Growing**:
- [ ] Update handlers to return NextResponse
- [ ] Or create type-safe wrappers
- [ ] Document pattern (if intentional)

**If Any Parameters Increasing**:
- [ ] Import proper types (TokenPayload, POV, etc.)
- [ ] Update function signatures
- [ ] Code review emphasis on types
```

---

## Action Thresholds

**Type Safety Score**:
- **> 90**: No action needed
- **75-90**: Monitor next quarter
- **60-75**: Plan type cleanup sprint
- **< 60**: Immediate action (1 week to improve)

**Growth Alerts**:
- **+10% type assertions**: Warning (investigate why)
- **+25% type assertions**: Critical (stop and fix)
- **+50% type assertions**: Emergency (type safety lost)

---

## Integration with Quarterly Review

**Use In**:
- quarterly-review-protocol.md (quality metrics)
- Code review checklists
- Developer onboarding (what to avoid)

**Triggers**:
- Score drops below 75 (remediation)
- Hot spots appear (focused review)
- Trend negative 2 quarters (process change needed)

**Outcome**:
- Maintain type safety as codebase grows
- Prevent TypeScript from becoming "AnyScript"
- Early warning of quality decay

---

**Created**: 2025-11-07
**Based On**: Response vs NextResponse issues (POV domain, multiple fixes needed)
**Frequency**: Quarterly
**Time**: 10 minutes

**END OF TYPE SAFETY TRENDS DISCOVERY**
