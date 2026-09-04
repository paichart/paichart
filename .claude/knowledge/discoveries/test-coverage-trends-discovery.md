# Test Coverage Trends Discovery

**Purpose**: Track test coverage growth vs endpoint growth (quality decay detection)
**Frequency**: Quarterly reviews
**Time**: 10 minutes
**Output**: Test/endpoint ratio, coverage gaps, trend analysis
**Created**: November 7, 2025 (from POV domain quarterly insights)

---

## When to Run This Discovery

**Quarterly Reviews**:
- Every 3 months
- Before major releases
- After sprint cycles

**Event-Driven**:
- After adding multiple new endpoints (>10)
- When test failures increase
- Before compliance audits

**Purpose**: Prevent quality decay (endpoints growing faster than tests)

---

## Phase 1: Count Current Tests (3 min)

### Step 1.1: Test Suite Inventory

```bash
# Form pattern tests
npm run test:form-patterns 2>&1 | grep "Total:"
# Expected: 28 tests

# Enum parity tests
npm run test:enum-parity 2>&1 | grep "Total:"
# Expected: 25 tests

# Security tests
npm run test:security 2>&1 | grep "Total:"
# Expected: 28 tests

# Field leakage tests
npm run test:field-leakage 2>&1 | grep "Total:"
# Expected: 4 tests

# Total
npm run test:all-validation 2>&1 | grep -E "Total:" | tail -1
# Expected Q1: 85+ tests
```

**Record**:
- [ ] Form patterns: ? tests
- [ ] Enum parity: ? tests
- [ ] Security: ? tests
- [ ] Field leakage: ? tests
- [ ] Other: ? tests
- [ ] **Total**: ? tests

---

### Step 1.2: Count Test Scripts

```bash
# Test scripts in scripts/ directory
ls -1 scripts/test-*.js | wc -l

# Expected Q1: 4 scripts
# - test-form-field-patterns.js
# - test-enum-parity.js
# - test-pov-security.js
# - test-field-leakage-fix.js
```

**Record**:
- [ ] Test scripts: ? files
- [ ] New this quarter: ? files

---

## Phase 2: Count Endpoints (2 min)

### Step 2.1: Endpoint Count by Domain

```bash
# POV domain endpoints
find app/api/pov -name "route.ts" | wc -l
# Expected Q1: ~43 endpoints

# Task domain endpoints
find app/api/tasks -name "route.ts" | wc -l
find app/api/pov -path "*/task/*" -name "route.ts" | wc -l
# Expected Q1: ~10 pure + ~7 POV-scoped = ~17 total

# Agent domain endpoints
find app/api -path "*agent*" -name "route.ts" | wc -l
# Expected Q1: ~21 total (8 POV + 3 Task + 10 pure)

# Total endpoints
find app/api -name "route.ts" | wc -l
# Expected Q1: ~80-100 endpoints
```

**Record**:
- [ ] POV endpoints: ?
- [ ] Task endpoints: ?
- [ ] Agent endpoints: ?
- [ ] Other endpoints: ?
- [ ] **Total endpoints**: ?

---

### Step 2.2: Count HTTP Methods

```bash
# Total HTTP method handlers
grep -r "export.*function GET\|export const GET" app/api --include="*.ts" | wc -l
grep -r "export.*function POST\|export const POST" app/api --include="*.ts" | wc -l
grep -r "export.*function PUT\|export const PUT" app/api --include="*.ts" | wc -l
grep -r "export.*function DELETE\|export const DELETE" app/api --include="*.ts" | wc -l

# Total methods = more accurate "endpoint" count
```

**Record**:
- [ ] GET methods: ?
- [ ] POST methods: ?
- [ ] PUT methods: ?
- [ ] DELETE methods: ?
- [ ] **Total methods**: ? (this is your true endpoint count)

---

## Phase 3: Calculate Coverage Ratios (2 min)

### Step 3.1: Test-to-Endpoint Ratio

```bash
# Calculate ratio
total_tests=85  # From Phase 1
total_endpoints=80  # From Phase 2

ratio=$(echo "scale=2; $total_tests / $total_endpoints" | bc)
echo "Test/Endpoint Ratio: $ratio"

# Expected Q1: 85/80 = 1.06 tests per endpoint
# Target: > 1.0 (at least 1 test per endpoint)
```

**Thresholds**:
- **> 2.0**: Excellent (high coverage)
- **1.5-2.0**: Good (adequate coverage)
- **1.0-1.5**: Acceptable (minimum coverage)
- **< 1.0**: Critical (quality decay!)

---

### Step 3.2: Coverage by Test Type

```bash
# Security test coverage
security_tests=28
security_endpoints=43  # POV domain endpoints

echo "Security coverage: $security_tests tests for $security_endpoints endpoints"
# Ratio: 28/43 = 0.65 (each test covers ~1.5 endpoints)

# Validation test coverage
validation_tests=28+25  # form + enum
all_endpoints=80

echo "Validation coverage: $validation_tests tests for $all_endpoints endpoints"
# Ratio: 53/80 = 0.66
```

**Record**:
- [ ] Security tests/endpoint: ? ratio
- [ ] Validation tests/endpoint: ? ratio
- [ ] Overall tests/endpoint: ? ratio

---

## Phase 4: Identify Coverage Gaps (3 min)

### Step 4.1: Find Untested Domains

```bash
# Domains with test suites
ls scripts/test-*.js | sed 's/scripts\/test-//' | sed 's/-.*\.js//' | sort -u

# Expected Q1: pov, form-field, enum, field-leakage
# Missing: task, agent, analytics, admin

# Alert: New domains without test suites
```

**Gap Analysis**:
```markdown
Domains with Tests:
- POV: ✅ test-pov-security.js (28 tests)
- Form fields: ✅ test-form-field-patterns.js (28 tests)
- Enums: ✅ test-enum-parity.js (25 tests)
- Field leakage: ✅ test-field-leakage-fix.js (4 tests)

Domains without Tests:
- Task: ❌ No task-security.js
- Agent: ❌ No agent-security.js
- Analytics: ❌ No analytics-security.js
- Admin: ❌ No admin-security.js

Recommendation: Create test suites for untested domains
```

---

### Step 4.2: Find Endpoints Without Validation Tests

```bash
# Endpoints with validation applied
grep -r "\.safeParse\|\.parse" app/api --include="*.ts" -l | wc -l

# Total endpoints
find app/api -name "route.ts" | wc -l

# Coverage %
# Expected Q1: ~50/80 = 62% of endpoints validated
```

**Record**:
- [ ] Validated endpoints: ?/? (% coverage)
- [ ] Gap: ? endpoints without validation

---

## Output Format

### Test Coverage Trend Report

```markdown
# Test Coverage Trend Report

**Date**: [date]
**Period**: Q[X] YYYY

## Test Count Trend

| Quarter | Total Tests | Change | % Change |
|---------|-------------|--------|----------|
| Q0 (Baseline) | 78 | - | - |
| Q1 (POV) | 85 | +7 | +9% |
| Q2 | ? | ? | ? |
| Q3 | ? | ? | ? |

**Status**: ✅ Growing / ⚠️ Stable / ❌ Declining

## Endpoint Count Trend

| Quarter | Total Endpoints | Change | % Change |
|---------|----------------|--------|----------|
| Q0 | ~70 | - | - |
| Q1 | ~80 | +10 | +14% |
| Q2 | ? | ? | ? |
| Q3 | ? | ? | ? |

**Status**: Expected growth (new features)

## Coverage Ratio Trend

| Quarter | Tests | Endpoints | Ratio | Trend |
|---------|-------|-----------|-------|-------|
| Q0 | 78 | 70 | 1.11 | - |
| Q1 | 85 | 80 | 1.06 | ↓ -5% |
| Q2 | ? | ? | ? | ? |
| Q3 | ? | ? | ? | ? |

**Status**:
- ✅ Ratio > 1.0 (acceptable)
- ⚠️ Declining trend (endpoints growing faster than tests)
- 🎯 Target: Maintain > 1.2 ratio

## Coverage Gaps

**Domains Without Test Suites**:
- [ ] Task domain (? endpoints)
- [ ] Agent domain (? endpoints)
- [ ] Analytics domain (? endpoints)

**High Priority** (>10 endpoints without tests):
- Task: ? endpoints ← Priority 1
- Agent: ? endpoints ← Priority 2

**Recommendations**:
1. Create test-task-security.js (cover Task domain)
2. Create test-agent-security.js (cover Agent domain)
3. Target: 1.5 tests/endpoint ratio by next quarter

## Action Items

**If Ratio < 1.0** (CRITICAL):
- [ ] Immediate: Create tests for new endpoints
- [ ] Block: New endpoint PRs without tests
- [ ] Goal: Restore ratio > 1.0 within 1 sprint

**If Ratio 1.0-1.2** (WARNING):
- [ ] Plan: Add domain test suites quarterly
- [ ] Review: Are new endpoints tested?
- [ ] Goal: Grow tests faster than endpoints

**If Ratio > 1.2** (GOOD):
- [ ] Maintain: Current testing practices
- [ ] Monitor: Ratio stays above threshold
- [ ] Celebrate: Quality maintained!
```

---

## Integration with Quarterly Review

**Use In**:
- quarterly-review-protocol.md (Phase 1, Discovery)
- Quarterly scorecards
- Sprint retrospectives

**Triggers**:
- Ratio drops below 1.0 (emergency)
- Ratio declining 2 quarters in a row (warning)
- New domain without tests (gap)

**Outcome**:
- Maintain test coverage as codebase grows
- Prevent quality decay
- Ensure new features are tested

---

**Created**: 2025-11-07
**Pattern**: Trend detection (not point-in-time)
**Frequency**: Quarterly

**END OF TEST COVERAGE TRENDS DISCOVERY**
