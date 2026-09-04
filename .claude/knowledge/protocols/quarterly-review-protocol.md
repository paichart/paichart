# Quarterly Security Review Protocol
**Purpose**: Systematic security assessment to maintain 90%+ security score
**Frequency**: Every 3 months OR triggered by events
**Time**: 4-6 hours (audit) + variable (remediation)
**Created**: November 8, 2025
**Updated**: February 16, 2026 (Discovery #11: Bug Class Regression added)
**Based On**: Agent Domain Security Audit (Nov 2025)

---

## 🎯 When to Run This Protocol

### Scheduled Reviews (Quarterly)
- [ ] Every 3 months (Jan, Apr, Jul, Oct)
- [ ] Before major releases (v1.0, v2.0, etc.)
- [ ] After adding 20+ new endpoints
- [ ] Before compliance audits (SOC 2, pen testing)

### Triggered Reviews (Event-Based)
- [ ] Security incident detected
- [ ] Insider threat concerns
- [ ] Significant architecture changes
- [ ] New domain added (Agent, Task, Analytics, etc.)
- [ ] Third-party security report

---

## 📋 Protocol Overview

### Phase 1: Discovery (30-60 min)
Identify scope and current state

### Phase 2: Parallel Specialist Assessment (3-4 hours)
3 specialists analyze in parallel

### Phase 3: Results Analysis (30 min)
Consolidate findings and prioritize

### Phase 4: Remediation Planning (30 min)
Create phased fix plan

### Phase 5: Implementation (Variable)
Execute fixes based on priority

---

## 🔍 Phase 1: Discovery (30-60 min)

### Step 1.1: Identify Review Scope (10 min)

**Determine Domain**:
- [ ] All domains (comprehensive quarterly review)
- [ ] Specific domain (Agent, Task, POV, Analytics, etc.)
- [ ] New endpoints only (added since last review)

**Count Endpoints**:
```bash
# Example: Agent domain
find app/api -path "*agent*" -name "route.ts" | wc -l

# All domains
find app/api -name "route.ts" | wc -l
```

**Document Scope**:
```markdown
## Review Scope

**Domain**: [Agent / Task / POV / All]
**Endpoints**: [count]
**Last Review**: [date]
**Trigger**: [Quarterly / Incident / Major Release]
```

---

### Step 1.2: Run Critical Discovery Prompts (30-50 min)

**CRITICAL Discovery #1: Field Limit Alignment** (30 min)
```bash
# See: /.claude/knowledge/discoveries/field-limit-alignment-discovery.md

# Quick scan (5 min)
echo "=== Field Limits by Category ==="
grep -rn "\.max(50000\|\.max(10000\|\.max(5000" lib/validation/ | \
  grep -i "prompt\|description\|content"

# Expected output: All content fields should be 50KB
```

**CRITICAL Discovery #2: Schema Application Audit** (45 min)
```bash
# See: /.claude/knowledge/discoveries/schema-application-audit-discovery.md

# Quick scan (10 min)
echo "=== Schemas Imported But Not Used ==="
find app/api -name "*.ts" -type f | while read file; do
  has_import=$(grep -c "import.*Schema.*from.*validation" "$file")
  has_usage=$(grep -c "\.safeParse\|\.parse" "$file")
  if [ $has_import -gt 0 ] && [ $has_usage -eq 0 ]; then
    echo "❌ $file"
  fi
done

# Expected output: No files (all schemas should be applied)
```

**CRITICAL Discovery #3: Authorization Consistency** ⭐ ENHANCED (20 min)
```bash
# See: /.claude/knowledge/discoveries/authorization-consistency-discovery.md

# Automated scan (5 min)
./scripts/audit-pov-access-completeness.sh

# Expected output:
# - Total files scanned: 27
# - Complete POV queries: 14 (100%)
# - Incomplete POV queries: 0 ✅
# - Dual permission checks: 0 ✅

# ENHANCED: 3-Pattern POV Protection Detection (Nov 2025)
# Prevents false positives from Nov 26, 2025 quarterly review

# Pattern 1: withPOVAccess middleware (route-level)
echo "=== Pattern 1: withPOVAccess Middleware ==="
grep -r "withPOVAccess" app/api/pov --include="*.ts" -l | wc -l

# Pattern 2: requirePermission middleware (route-level)
echo "=== Pattern 2: requirePermission Middleware ==="
grep -r "requirePermission.*PoV" app/api/pov --include="*.ts" -l | wc -l

# Pattern 3: Handler-level validation (service-level)
echo "=== Pattern 3: Handler validatePOVAccess/checkPermission ==="
for file in $(find app/api/pov -name "route.ts"); do
  has_handler=$(grep -c "Handler(" "$file" 2>/dev/null || echo 0)
  if [ "$has_handler" -gt 0 ]; then
    handler_name=$(grep "Handler(" "$file" | head -1 | sed 's/.*\(.*Handler\).*/\1/')
    echo "  Route uses handler: $file → check lib/pov/handlers/"
  fi
done

# Pattern 4: User scoping in queries (query-level)
echo "=== Pattern 4: User-Scoped Queries (List Endpoints) ==="
grep -r "ownerId.*user\.userId" app/api/pov --include="*.ts" -l | wc -l

# COMPREHENSIVE CHECK: Routes WITHOUT any protection
echo "=== TRULY UNPROTECTED ROUTES ==="
for file in $(find app/api/pov -name "route.ts"); do
  has_middleware=$(grep -c "withPOVAccess\|requirePermission" "$file" 2>/dev/null || echo 0)
  has_handler=$(grep -c "Handler(" "$file" 2>/dev/null || echo 0)
  has_manual=$(grep -c "validatePOVAccess\|checkPermission.*PoV" "$file" 2>/dev/null || echo 0)

  if [ "$has_middleware" -eq 0 ] && [ "$has_handler" -eq 0 ] && [ "$has_manual" -eq 0 ]; then
    echo "  ❌ $file - NO PROTECTION (review handlers or add middleware)"
  fi
done

# Expected: <5 routes (utilities, list endpoints with user scoping)
```

**Discovery #4: Endpoint Inventory** (10 min)
```bash
# See: /.claude/knowledge/protocols/endpoint-security-audit-protocol.md

# Count by domain
echo "=== Endpoints by Domain ==="
for domain in agent pov task analytics auth mcp; do
  count=$(find app/api -path "*$domain*" -name "route.ts" | wc -l)
  echo "$domain: $count endpoints"
done

# Note any new endpoints since last review
```

**Discovery #5: Pattern Adoption Trends** ⭐ QUARTERLY (15 min)
```bash
# See: /.claude/knowledge/discoveries/pattern-adoption-trends-discovery.md

# Quick scan
echo "=== Middleware Adoption ==="
grep -r "export const.*withPOVAccess" app/api/pov --include="*.ts" | wc -l

echo "=== File Count (should stay stable) ==="
ls -1 lib/validation/*.ts | wc -l

echo "=== Type Assertions (should stay low) ==="
grep -r "as unknown as\|as any" app/api lib/ --include="*.ts" | wc -l

echo "=== Handler Shortcuts (document risky ones) ==="
grep -r "if.*user.*&&.*pov" lib/*/handlers/*.ts | wc -l

# Expected output:
# - Middleware: 100% adoption maintained
# - Files: Stable count (no proliferation)
# - Type assertions: Low/stable
# - Shortcuts: Documented/controlled
```

**Discovery #6: Test Coverage Trends** ⭐ QUARTERLY (10 min)
```bash
# See: /.claude/knowledge/discoveries/test-coverage-trends-discovery.md

# Quick scan
echo "=== Test Count ==="
npm run test:all-validation 2>&1 | grep -E "Passed:|Failed:|Total:" | tail -10

echo "=== Current Test Breakdown ==="
# Enhanced dual-layer: 182 tests
# Agent tests: 60 tests
# Total: 242 tests
# Pass rate target: >90% (220+ passing)

echo "=== Endpoint Count ==="
find app/api -name "route.ts" | wc -l

echo "=== Test/Endpoint Ratio ==="
# Calculate: 242 tests / endpoints
# Target: > 1.0 (ideally > 1.2)

echo "=== Test Suite Health ==="
npm run test:security          # Must: 56/56 ✅
npm run test:field-leakage     # Must: 8/8 ✅
npm run test:agent-cross-tenant # Must: 14/14 ✅

# Expected output:
# - Total: 227+/242 passing (93%+)
# - Critical security tests: 100% passing
# - Test/Endpoint Ratio: > 1.2
# - Quality maintained or improved
```

**Discovery #7: Silent Initialization Patterns** ⭐ NEW (15 min)
```bash
# See: /.claude/knowledge/discoveries/silent-initialization-failure-discovery.md

# Automated scan (30 seconds)
./scripts/audit-initialization-patterns.sh

# Expected output:
# ✅ PASSED - No silent initialization patterns detected
# - No constructor async initialization
# - No module-level client creation
# - No risky process.env access
# - All isConnected classes have connect()
# - Singleton constructors are safe

# Manual verification (if issues found)
# Check for constructor initialization anti-patterns:
grep -rn "constructor" lib/ --include="*.ts" -A 20 | \
  grep -E "this\.(initialize|connect|start|setup|init)\(" | head -10

# Based on: SCRAM Auth Bug (Nov 2025) - undefined DATABASE_URL
# caused misleading "password must be string" errors
```

**Discovery #8: Prisma Include Clause Audit** ⭐ NEW (15 min)
```bash
# See: MCP Advanced Tools Testing Sprint 2 (Dec 2025)
# Purpose: Find orphaned queries, missing includes, N+1 patterns

# Step 1: Find all Prisma queries in handlers
echo "=== Prisma Queries in MCP Handlers ==="
grep -rn "prisma\.\(task\|pov\|phase\|stage\|user\|team\)\.\(findUnique\|findFirst\|findMany\|create\|update\)" \
  lib/mcp/tasks/action/handlers/ --include="*.ts" | wc -l

# Step 2: Find relation access patterns (potential missing includes)
echo "=== Relation Access Patterns ==="
grep -rn "\.\(phase\|stage\|assignee\|team\|pov\)\?\." \
  lib/mcp/tasks/action/handlers/ --include="*.ts" | \
  grep -v "include\|select\|where" | head -20

# Step 3: Find orphaned queries (query result never used)
echo "=== Potential Orphaned Queries ==="
# Look for: const x = await prisma... followed by no x usage
grep -rn "const.*= await prisma\." lib/mcp/tasks/action/handlers/ --include="*.ts" -A 5 | \
  grep -B 1 "// .*removed\|// .*not needed" | head -10

# Step 4: Find queries without includes that access relations later
echo "=== Queries Without Includes ==="
for file in lib/mcp/tasks/action/handlers/**/*.ts; do
  has_query=$(grep -c "prisma\.task\.find" "$file" 2>/dev/null || echo 0)
  has_include=$(grep -c "include:" "$file" 2>/dev/null || echo 0)
  has_relation_access=$(grep -c "task\.\(phase\|stage\|pov\|assignee\)\." "$file" 2>/dev/null || echo 0)

  if [ "$has_query" -gt 0 ] && [ "$has_include" -lt "$has_query" ] && [ "$has_relation_access" -gt 0 ]; then
    echo "  ⚠️ $file - $has_query queries, $has_include includes, $has_relation_access relation accesses"
  fi
done

# Expected output:
# ✅ All queries that access relations have matching includes
# ✅ No orphaned queries (unused query results)
# ✅ No N+1 patterns (relations accessed without eager loading)

# Based on: MCP Sprint 2 found orphaned query in task-update-handler.ts
# (WebSocket broadcast removed but query remained - wasted DB call)
```

**Discovery #10: Time Bomb Detection Audit** ⭐ NEW (30 min)
```bash
# See: /.claude/knowledge/discoveries/time-bomb-detection-discovery.md
# Purpose: Find runtime infrastructure patterns that cause memory leaks or blocked exits

# Category 1: Unbounded Caches (Maps/Sets without MAX_SIZE)
echo "=== Maps/Sets without size limits ==="
for f in $(grep -rln "new Map()\|= new Map" --include="*.ts" --include="*.js" lib/ middleware/ app/ 2>/dev/null | grep -v node_modules); do
  if grep -qE "^(const|let).*= new Map" "$f" && ! grep -q "MAX_" "$f"; then
    echo "  MISSING MAX_SIZE: $f"
  fi
done

# Category 5: Timers without .unref() (blocks process exit)
echo "=== setInterval without .unref() ==="
for f in $(grep -rln "setInterval" --include="*.ts" --include="*.js" lib/ middleware/ app/ 2>/dev/null | grep -v node_modules); do
  if grep -q "setInterval" "$f" && ! grep -q "\.unref()" "$f"; then
    echo "  MISSING .unref(): $f"
  fi
done

# Expected output: 0 files (all caches bounded, all timers unref'd)
# Based on: Jan 2026 audit found 19 files with time bomb patterns
```

**Discovery #9: Validation Schema vs Handler Mismatch Audit** ⭐ NEW (30 min)
```bash
# See: MCP Advanced Tools Testing Sprint 3 (Dec 2025)
# Purpose: Find parameters accepted by handlers but missing from validation schemas

# Step 1: List all MCP action handlers
echo "=== MCP Action Handlers ==="
ls -la lib/mcp/tasks/action/handlers/*/

# Step 2: For each handler, extract destructured parameters
echo "=== Handler Parameters ==="
for handler in lib/mcp/tasks/action/handlers/*/*.ts; do
  echo "--- $handler ---"
  grep -A 30 "const {" "$handler" | grep -E "^\s+\w+," | head -20
done

# Step 3: Compare with validation schema parameters
echo "=== Validation Schema Parameters ==="
grep -A 30 "'task.create':" lib/validation/mcp-action-validation.ts | head -35
grep -A 30 "'task.update':" lib/validation/mcp-action-validation.ts | head -35
grep -A 30 "'agent.configure':" lib/validation/mcp-action-validation.ts | head -35

# Step 4: Identify mismatches (handler accepts but schema doesn't validate)
echo "=== Potential Mismatches ==="
# Look for common alias patterns not in schema:
# - task_name vs taskName
# - pov_id vs povId
# - agent_template_name vs agentTemplateName
grep -rn "task_name\|pov_id\|agent_template_name\|due_date" \
  lib/mcp/tasks/action/handlers/ --include="*.ts" | \
  grep -v "// " | head -20

# Step 5: Check for missing alias transforms in schemas
echo "=== Schema Transform Patterns ==="
grep -A 5 ".transform" lib/validation/mcp-action-validation.ts | head -30

# Expected output:
# ✅ All handler parameters have matching schema fields
# ✅ All aliases (snake_case → camelCase) have transforms
# ✅ Required-one-of patterns use .refine() checks

# Based on: MCP Sprint 3 found 40 missing parameters across 9 schemas
# Pattern: optional fields + .refine() + .transform() for flexible validation
```

**Discovery #11: Bug Class Regression Check** ⭐ NEW (10 min)
```bash
# See: /.claude/knowledge/domain/mcp/bug-class-registry.md
# Purpose: Verify eradicated bug classes haven't regressed, check for new unguarded sites

echo "=== Bug Class Regression Detection ==="

# Bug Class 1: Transport Boundary Coercion (ERADICATED)
echo "Bug Class 1 - Transport Boundary Coercion:"
unguarded=$(grep -rn '\.callTool(' --include='*.{js,ts}' . | grep -v node_modules | grep -v ensureObject | grep -v '.d.ts' | wc -l)
echo "  Unguarded callTool sites: $unguarded (expected: ~6 safe internal sites)"
if [ "$unguarded" -gt 8 ]; then
  echo "  ⚠️ NEW unguarded callTool sites detected - apply ensureObject()"
  grep -rn '\.callTool(' --include='*.{js,ts}' . | grep -v node_modules | grep -v ensureObject | grep -v '.d.ts'
fi

# Bug Class 2: Prisma Json Column Ambiguity (ERADICATED)
echo -e "\nBug Class 2 - Prisma Json Ambiguity:"
# TS pattern: as Record<string, ...> casts on Json columns
unsafe_ts=$(grep -rn 'as Record<string' --include='*.ts' lib/ app/ | grep -i 'metadata\|config\|capabilities\|context\|artifacts\|variables\|steps' | grep -v ensureObject | grep -v 'as Record<string, number>' | grep -v 'as Record<string, boolean>' | wc -l)
# JS pattern: .field || {} or .field || [] without ensureObject/Array.isArray
unsafe_js=$(grep -rn '\.\(metadata\|steps\|variables\|configuration\) || [{\[]' --include='*.js' lib/ | grep -v node_modules | grep -v ensureObject | grep -v 'Array\.isArray' | wc -l)
unsafe=$((unsafe_ts + unsafe_js))
echo "  Unsafe Json casts (TS): $unsafe_ts  Unsafe Json reads (JS): $unsafe_js  Total: $unsafe (expected: 0)"
if [ "$unsafe" -gt 0 ]; then
  echo "  ⚠️ NEW unsafe Json column access detected - apply ensureObject() or Array.isArray()"
  grep -rn 'as Record<string' --include='*.ts' lib/ app/ | grep -i 'metadata\|config\|capabilities\|context\|artifacts\|variables\|steps' | grep -v ensureObject | grep -v 'as Record<string, number>' | grep -v 'as Record<string, boolean>'
  grep -rn '\.\(metadata\|steps\|variables\|configuration\) || [{\[]' --include='*.js' lib/ | grep -v node_modules | grep -v ensureObject | grep -v 'Array\.isArray'
fi

# Bug Class 3: Form Boundary Type Loss (MONITORED)
echo -e "\nBug Class 3 - Form Type Loss:"
grep -rn 'body\.\w*[Cc]ount\|body\.\w*[Aa]mount\|body\.\w*[Pp]rice\|body\.\w*[Bb]udget' --include='*.ts' app/api/ | grep -v 'parseInt\|parseFloat\|Number(\|coerce' | head -5

# Bug Class 8: Express Body Parser (ERADICATED)
echo -e "\nBug Class 8 - Express Body Parser:"
missing=$(grep -rn 'handlePostMessage' services/*/src/index.ts | grep -v 'req\.body' | wc -l)
echo "  Missing req.body pass-through: $missing (expected: 0)"

# New Docker services check
echo -e "\nNew Docker Services (verify ensureObject inlined):"
for svc in services/*/src/index.ts; do
  has_guard=$(grep -c 'ensureObject' "$svc" 2>/dev/null || echo 0)
  if [ "$has_guard" -eq 0 ]; then
    echo "  ⚠️ $svc - no ensureObject guard"
  fi
done

# Expected output:
# ✅ Bug Class 1: ~6 unguarded (all internal/safe)
# ✅ Bug Class 2: 0 unsafe casts (all guarded with ensureObject)
# ✅ Bug Class 8: 0 missing req.body
# ⚠️ Bug Class 3: track unguarded number fields

# Protocol: /.claude/knowledge/protocols/bug-class-eradication-protocol.md
# Registry: /.claude/knowledge/domain/mcp/bug-class-registry.md
```

**Save Discovery Results**:
```bash
mkdir -p cline_docs/reviews/quarterly-review-$(date +%Y-%m-%d)
# Save all discovery outputs to this directory
```

---

### Step 1.3: Review Recent Changes (10 min)

```bash
# New files since last review (adjust date)
git log --since="3 months ago" --name-only --pretty=format: | \
  grep "app/api.*route.ts" | sort -u

# New validation schemas
git log --since="3 months ago" --name-only --pretty=format: | \
  grep "lib/validation.*\.ts" | sort -u

# Security-related commits
git log --since="3 months ago" --oneline --grep="security\|auth\|validation"
```

---

## 🔬 Phase 2: Parallel Specialist Assessment (3-4 hours)

### Step 2.1: Launch 3 Specialists in Parallel

**CRITICAL**: Each specialist MUST run their discovery prompt FIRST before assessment.

**Use Task tool to launch all 3 simultaneously**:

```markdown
### Specialist 1: api-efficiency-specialist

**Mission**: Endpoint mapping and validation coverage analysis

**Discovery Required**: Run api-efficiency discovery first (or endpoint-security-audit.md Phase 1-2)

**Scope**: [Your domain] endpoints

**Questions to Answer**:
1. Which endpoints are CURRENTLY validated vs unvalidated?
2. Which endpoints LACK schemas entirely?
3. Are GET endpoints using efficient filtering (POV-scoped)?
4. Are all POST/PUT/DELETE endpoints using .safeParse()?
5. Which endpoints accept user text (prompt injection risk)?
6. Are there REST anti-patterns or security issues?

**CRITICAL**: Use 4-pattern POV protection detection (prevents 60% false positives):
- Check Pattern 1: withPOVAccess middleware
- Check Pattern 2: requirePermission middleware
- Check Pattern 3: Handler-level protection (lib/pov/handlers/)
- Check Pattern 4: Manual validatePOVAccess in routes

**Output**: Validation coverage report, missing schemas list, critical issues

**Save to**: cline_docs/reviews/quarterly-review-YYYY-MM-DD/api-efficiency-assessment.md
```

```markdown
### Specialist 2: sec-ops-specialist

**Mission**: Security risk assessment with FOCUS on injection prevention

**Discovery Required**: Run security-discovery.md FIRST (includes 4-pattern POV detection)

**Scope**: [Your domain] endpoints

**Questions to Answer**:
1. Prompt Injection Coverage: Which endpoints vulnerable?
2. POV Protection: Which routes TRULY unprotected (check all 4 patterns)?
3. Template Security: Are templates validated and sanitized?
4. Execution Security: Can unauthorized users access other POVs?
5. Artifact Security: Can users access/modify other users' artifacts?
6. XSS Prevention: Are user-controlled fields sanitized?
7. DoS Prevention: Are there rate limits and size limits?

**CRITICAL**: Use 4-pattern POV protection detection from security-discovery.md:
- Pattern 1-4 detection prevents false positives
- Verify handlers (lib/pov/handlers/) for Pattern 3
- Expected: <5 truly unprotected routes

**Output**: Security risk matrix, top 10 risks, prioritized fix list

**Save to**: cline_docs/reviews/quarterly-review-YYYY-MM-DD/sec-ops-assessment.md
```

```markdown
### Specialist 3: validation-engine-specialist

**Mission**: Validation pattern analysis

**Discovery Required**: Run validation-discovery.md FIRST

**Scope**: [Your domain] endpoints

**Questions to Answer**:
1. Schema Coverage: Which endpoints missing validation schemas?
2. Schema-Prisma Parity: Do schemas match Prisma models?
3. Validation Consistency: Are schemas applied consistently?
4. Form Field Patterns: Are optional fields using FormField patterns?
5. Injection Detection: Is detectPromptInjection used on all user text?
6. Validation Test Coverage: Are there automated tests?

**Output**: Schema coverage report, parity issues, test gaps

**Save to**: cline_docs/reviews/quarterly-review-YYYY-MM-DD/validation-engine-assessment.md
```

**Launch Command** (use Task tool):
```
Launch 3 specialists in parallel: api-efficiency-specialist, sec-ops-specialist, validation-engine-specialist

CRITICAL: Instruct each specialist to run their discovery prompt FIRST before analysis.

For POV route audits, specialists MUST use 4-pattern detection from their discoveries to prevent false positives.

Save results to: cline_docs/reviews/quarterly-review-YYYY-MM-DD/
```

---

## 📊 Phase 3: Results Analysis (30 min)

### Step 3.1: Calculate Security Score (10 min)

**Aggregate Specialist Scores**:
```
Security Score = (
  api-efficiency score * 0.3 +
  sec-ops score * 0.4 +
  validation-engine score * 0.3
)

Example:
  api-efficiency: 82/100
  sec-ops: 85/100
  validation-engine: 75/100

  Score = (82 * 0.3) + (85 * 0.4) + (75 * 0.3)
        = 24.6 + 34 + 22.5
        = 81/100
```

**Categorize Score**:
- **< 70**: NEEDS URGENT ATTENTION ❌
- **70-85**: NEEDS IMPROVEMENT ⚠️
- **85-92**: GOOD ✅
- **92-100**: EXCELLENT ✅✅

---

### Step 3.2: Identify Top 10 Risks (10 min)

**Consolidate Issues from All 3 Specialists**:

| # | Endpoint | Issue | Risk Score | Specialist | Priority |
|---|----------|-------|------------|------------|----------|
| 1 | [endpoint] | [issue] | 95/100 | sec-ops | P0 |
| 2 | [endpoint] | [issue] | 90/100 | validation | P0 |
| ... | ... | ... | ... | ... | ... |
| 10 | [endpoint] | [issue] | 60/100 | api-efficiency | P1 |

**Risk Categories**:
- **90-100**: P0 CRITICAL (fix immediately)
- **70-89**: P1 HIGH (fix within 2-4 weeks)
- **50-69**: P2 MEDIUM (fix within 1-2 months)
- **0-49**: P3 LOW (optional, monitor)

---

### Step 3.3: Generate Executive Summary (10 min)

**Template**:
```markdown
# Quarterly Security Review Summary

**Date**: [date]
**Domain**: [domain]
**Scope**: [endpoint count] endpoints

## Security Score: [score]/100

**Status**: [EXCELLENT / GOOD / NEEDS IMPROVEMENT / URGENT]

## Critical Findings

**P0 CRITICAL** ([count] issues):
- [Issue 1]: [endpoint] - Risk [score]/100
- [Issue 2]: [endpoint] - Risk [score]/100

**P1 HIGH** ([count] issues):
- [Issue 3]: [endpoint] - Risk [score]/100

## Strengths Identified

- ✅ [Strength 1]
- ✅ [Strength 2]

## Recommendations

**Immediate** (Week 1): [P0 fixes]
**Short-term** (Weeks 2-4): [P1 fixes]
**Medium-term** (1-3 months): [P2 fixes]

## ROI Estimate

- Time to fix P0: [hours]
- Security gain: [baseline] → [target] (+[points] points)
- ROI: [points/hour]
```

**Save to**: `cline_docs/reviews/quarterly-review-YYYY-MM-DD/EXECUTIVE-SUMMARY.md`

---

## 🛠️ Phase 4: Remediation Planning (30 min)

### Step 4.1: Group Issues for Batch Fixing (15 min)

**Group by Pattern** (not by endpoint):

**Group 1: Authentication Gaps**
- Issue #1: Endpoint A - no auth
- Issue #2: Endpoint B - no auth
- Issue #3: Endpoint C - no auth
**Pattern**: Add `getAuthUser()` check
**Time**: 10 min × 3 = 30 min

**Group 2: Validation Bypass**
- Issue #4: Endpoint D - schema not applied
- Issue #5: Endpoint E - schema not applied
**Pattern**: Replace manual mapping with `.safeParse()`
**Time**: 15 min × 2 = 30 min

**Group 3: POV Isolation**
- Issue #6: Endpoint F - missing POV validation
- Issue #7: Endpoint G - missing POV validation
**Pattern**: Add `validatePOVAccess()` check
**Time**: 12 min × 2 = 24 min

---

### Step 4.2: Create Phased Implementation Plan (15 min)

**Week 1 (P0 CRITICAL)**:
- Group 1: [pattern] - [time estimate]
- Group 2: [pattern] - [time estimate]
**Total**: [time]
**Expected Score**: [baseline] → [after Week 1]

**Week 2 (P1 HIGH)**:
- Group 3: [pattern] - [time estimate]
- Group 4: [pattern] - [time estimate]
**Total**: [time]
**Expected Score**: [after Week 1] → [after Week 2]

**Week 3 (P2 MEDIUM)**:
- Group 5: [pattern] - [time estimate]
**Total**: [time]
**Expected Score**: [after Week 2] → [after Week 3]

**Save to**: `cline_docs/reviews/quarterly-review-YYYY-MM-DD/REMEDIATION-PLAN.md`

---

## ⚙️ Phase 5: Implementation (Variable)

### Step 5.1: Execute Week 1 (P0 Fixes)

**Use Proven Patterns from Knowledge Base**:
- Authentication: See `/.claude/knowledge/patterns/cross-domain-security-patterns.md` (Pattern 1A)
- Validation: See same file (Pattern 3A)
- POV Isolation: See same file (Pattern 2A)

**Track Progress**:
```markdown
## Week 1 Progress

- [x] Group 1 - Authentication (30 min actual vs 30 min est)
- [x] Group 2 - Validation (25 min actual vs 30 min est)
- [ ] Group 3 - POV Isolation (pending)

**Status**: 2/3 complete
**Time**: 55 min / 84 min estimated
```

---

### Step 5.2: Validate After Each Week

**Run Comprehensive Test Suite** (242 tests):
```bash
npm run test:all-validation

# Expected Results:
# ✅ Enhanced dual-layer tests: 182/182 passing (100%)
#    - Form patterns: 28/28
#    - Enum parity: 50/50
#    - ID format: 40/40
#    - POV security: 56/56
#    - Field leakage: 8/8
#
# ⚠️ Agent tests: 45+/60 passing (75%+)
#    - Injection: 24+/38
#    - Cross-tenant: 14/14 ✅ CRITICAL
#    - Template: 7+/8
#
# 📊 Total: 227+/242 passing (93%+)

# CRITICAL Tests Must Pass:
# ✅ test:security (56/56) - POV domain security
# ✅ test:field-leakage (8/8) - Attack vector prevention
# ✅ test:agent-cross-tenant (14/14) - Tenant isolation

# Overall pass rate: >90% required for deployment
```

**Verify Build**:
```bash
npm run build
# Expected: Success with no errors
```

**Test Architecture Reference**:
See `/.claude/knowledge/domain/testing/validation-testing-architecture.md` for:
- Dual-layer architecture details
- All 9 test suites explained
- Test creation templates
- Coverage metrics
```

---

## ✅ Success Criteria

### Audit Phase Complete When:
- [ ] All 3 specialist assessments complete
- [ ] Security score calculated
- [ ] Top 10 risks identified and prioritized
- [ ] Executive summary created
- [ ] Remediation plan created (phased by priority)

### Implementation Complete When:
- [ ] All P0 CRITICAL issues fixed
- [ ] Security score improved by target amount
- [ ] All tests passing (227+/242 validation tests - 93%+ pass rate)
- [ ] CRITICAL tests: 100% passing (security, field-leakage, cross-tenant)
- [ ] Build successful
- [ ] Security logs reviewed (no new violations)
- [ ] No test regressions from previous review

### Quarterly Review Complete When:
- [ ] Audit complete ✅
- [ ] P0 fixes implemented ✅
- [ ] Results documented ✅
- [ ] Next review scheduled ✅
- [ ] Learnings captured in knowledge base ✅

---

## 📊 Benchmarks (From Agent Domain Nov 2025)

### Audit Performance
- **Discovery**: 30 min (3 discovery prompts)
- **Specialist Assessment**: 3 hours (parallel)
- **Analysis**: 30 min (consolidation)
- **Total Audit Time**: 4 hours

### Implementation Performance
- **P0 Fixes**: 40 min (vs 82 min est = 51% faster!)
- **Security Gain**: +10 points (78 → 88)
- **ROI**: 0.25 points/min (best ROI)

### Efficiency Multipliers
- **Discovery-First**: 50% time savings (found existing infrastructure)
- **Pattern Reuse**: 87% faster (vs first domain)
- **Batch Grouping**: 30% time savings (vs individual fixes)

---

## 🔄 Continuous Improvement

### After Each Review, Update:

**Discovery Prompts** (if new patterns found):
- [ ] Add new discovery to `/.claude/knowledge/discoveries/`
- [ ] Update existing discoveries with new commands
- [ ] Share learnings with team

**Security Patterns** (if new solutions found):
- [ ] Add to `/.claude/knowledge/patterns/cross-domain-security-patterns.md`
- [ ] Update specialist knowledge bases
- [ ] Document efficiency gains

**Specialist Agents** (if new capabilities needed):
- [ ] Enhance specialist prompts
- [ ] Add new detection methods
- [ ] Update assessment questions

---

## 📅 Next Steps After Review

### Immediate (This Week)
- [ ] Deploy P0 fixes
- [ ] Monitor security logs daily
- [ ] Run test suite weekly

### Short-Term (1-4 Weeks)
- [ ] Implement P1 fixes (if scope approved)
- [ ] Review security logs (pino JSON: `grep '"level":40' pm2.log`)
- [ ] Update documentation

### Long-Term (Quarterly)
- [ ] Schedule next quarterly review (3 months)
- [ ] Review and update this protocol
- [ ] Share learnings with team

---

## 📚 Related Protocols

**This protocol focuses on SECURITY reviews.**

For comprehensive quarterly system health, also run:
- **Performance Review**: `performance-opportunity-discovery-protocol.md` - Optimization opportunities
- **Architecture Review**: `specialist-review-protocol.md` with architectural-review-specialist
- **Master Protocol**: `quarterly-review-master-protocol.md` - Umbrella protocol for all 3 reviews

**Related protocols**:
- `endpoint-security-audit-protocol.md` - Comprehensive endpoint audit
- `discovery-first-workflow-guide.md` - Discovery-first methodology
- `specialist-review-protocol.md` - Multi-specialist validation
- `bug-class-eradication-protocol.md` - Systematic bug class eradication (Discovery #11)

**Related knowledge**:
- `/.claude/knowledge/domain/mcp/bug-class-registry.md` - All known bug classes with regression detection commands

---

## 📝 Quick Reference

### Discovery Prompts (Run These First)
1. **Field Limit Alignment**: `/.claude/knowledge/discoveries/field-limit-alignment-discovery.md` (30 min)
2. **Schema Application**: `/.claude/knowledge/discoveries/schema-application-audit-discovery.md` (45 min)
3. **Authorization Consistency**: `/.claude/knowledge/discoveries/authorization-consistency-discovery.md` ⭐ NEW (15 min)
4. **Endpoint Inventory**: Count and categorize endpoints (10 min)
5. **Silent Initialization**: `/.claude/knowledge/discoveries/silent-initialization-failure-discovery.md` ⭐ NEW (15 min)
6. **Prisma Include Audit**: Find orphaned queries, missing includes, N+1 patterns ⭐ NEW (15 min)
7. **Validation Schema vs Handler Mismatch**: Compare handler params with schema fields ⭐ NEW (30 min)
8. **System Health Stress Test**: `/.claude/knowledge/protocols/system-health-stress-test-protocol.md` ⭐ NEW (2 hours)
   - Memory management, API efficiency, database integrity, load capacity
   - Uses MCP infrastructure to stress test itself (self-referential)
   - Run: Quarterly or before major releases
9. **Time Bomb Detection**: `/.claude/knowledge/discoveries/time-bomb-detection-discovery.md` ⭐ NEW (30 min)
   - Unbounded caches (Maps/Sets without MAX_SIZE)
   - Timers without .unref() (blocks process exit)
   - Memory leak prevention patterns
   - Based on: Jan 2026 audit (19 files fixed)
10. **Bug Class Regression**: `/.claude/knowledge/domain/mcp/bug-class-registry.md` ⭐ NEW (10 min)
   - Verify eradicated bug classes (1: Transport Boundary, 2: Prisma Json, 8: Express Body Parser) haven't regressed
   - Check for new unguarded sites in known bug classes
   - Verify new Docker services have ensureObject inline guard
   - Protocol: `/.claude/knowledge/protocols/bug-class-eradication-protocol.md`

### Automated Scan Tools ⭐ NEW (Run These First - 5 seconds each)
- **Authorization Completeness**: `./scripts/audit-pov-access-completeness.sh`
  - Verifies: POV queries have ownerId/metadata/team.members
  - Detects: Dual permission checks, incomplete queries
  - Result: 0 issues = ✅ consistent auth model

- **Initialization Patterns**: `./scripts/audit-initialization-patterns.sh` ⭐ NEW
  - Verifies: No constructor async init, no module-level clients
  - Detects: Silent failures from undefined env vars at module load
  - Result: 0 issues = ✅ safe initialization patterns
  - Based on: SCRAM Auth Bug (Nov 2025)

### Security Patterns (Use During Fixes)
- **All Patterns**: `/.claude/knowledge/patterns/cross-domain-security-patterns.md`
- **Authentication**: Pattern 1A (getAuthUser)
- **Authorization**: Pattern 2A (validatePOVAccess)
- **Validation**: Pattern 3A (.safeParse)

### Specialists (Launch in Parallel)
1. `api-efficiency-specialist` - Endpoint coverage
2. `sec-ops-specialist` - Security risks
3. `validation-engine-specialist` - Schema patterns

---

**Protocol Complete** ✅
**Use Case**: Quarterly security assessment and remediation
**Time**: 4-6 hours (audit) + variable (fixes)
**Expected Score**: 90%+ after P0/P1 fixes
**Frequency**: Every 3 months OR event-triggered
