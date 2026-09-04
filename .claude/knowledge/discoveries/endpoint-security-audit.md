# Endpoint Security Audit - Discovery Prompt

**Purpose**: Comprehensive security assessment of all API endpoints
**Specialists**: api-efficiency, sec-ops, validation-engine (run in parallel)
**Time**: 2-3 hours
**Output**: Security score, coverage %, top 10 risks, prioritized fixes

**Proven**: Nov 3, 2025 - Found 12 vulnerabilities, achieved 96% confidence

---

## Discovery Execution Steps

### Phase 1: Endpoint Discovery (15 min)

#### Step 1.1: Count Total Endpoints
```bash
# Find all API route files
find app/api -name "route.ts" -type f | wc -l

# Expected: 189 endpoints (as of Nov 3, 2025)
```

#### Step 1.2: Categorize by HTTP Method
```bash
# Count GET endpoints (read-only, lower risk)
grep -r "export async function GET" app/api/ --include="route.ts" | wc -l

# Count POST endpoints (write, higher risk)
grep -r "export async function POST" app/api/ --include="route.ts" | wc -l

# Count PUT endpoints (update, higher risk)
grep -r "export async function PUT" app/api/ --include="route.ts" | wc -l

# Count DELETE endpoints (delete, medium risk)
grep -r "export async function DELETE" app/api/ --include="route.ts" | wc -l

# Count PATCH endpoints (partial update, higher risk)
grep -r "export async function PATCH" app/api/ --include="route.ts" | wc -l
```

#### Step 1.3: List Endpoints by Domain
```bash
# Group endpoints by top-level domain
find app/api -name "route.ts" | sed 's|app/api/||; s|/.*||' | sort | uniq -c | sort -rn

# Example output:
#   24 tasks
#   43 pov
#   14 admin
#   12 mcp
#   etc.
```

---

### Phase 1.5: POV Protection Pattern Analysis ⭐ NEW (20 min - Nov 2025)

**Purpose**: Detect POV access protection (prevents 60% false positive rate)

**Critical Learning** (Nov 26, 2025): Initial audit flagged 15 routes as unprotected, but 9 had handler-level protection. **Always check all 4 patterns before flagging as vulnerable.**

#### Step 1.5.1: Pattern 1 - withPOVAccess Middleware
```bash
# Route-level middleware (most visible)
echo "=== Pattern 1: withPOVAccess Middleware ==="
grep -r "export const.*= withPOVAccess\|withPOVAccess(async" app/api/pov --include="*.ts" -l

# Count
grep -r "withPOVAccess" app/api/pov --include="*.ts" -l | wc -l

# Example: export const POST = withPOVAccess(async (req, { params }) => {
```

#### Step 1.5.2: Pattern 2 - requirePermission Middleware
```bash
# Alternative middleware for POV operations
echo "=== Pattern 2: requirePermission Middleware ==="
grep -r "requirePermission.*ResourceType\.PoV" app/api/pov --include="*.ts" -l

# Count
grep -r "requirePermission.*PoV" app/api/pov --include="*.ts" -l | wc -l

# Example: export const GET = requirePermission(ResourceAction.VIEW, ResourceType.PoV, getPovId)(...)
# Used in: crm, kpi routes (5 routes)
```

#### Step 1.5.3: Pattern 3 - Handler-Level Protection ⚠️ CRITICAL
```bash
# Routes that delegate to handlers (protection at service layer)
echo "=== Pattern 3: Handler-Level Protection ==="

# Find routes using handlers
for file in $(find app/api/pov -name "route.ts"); do
  has_handler=$(grep -c "Handler(" "$file" 2>/dev/null || echo 0)
  if [ "$has_handler" -gt 0 ]; then
    handler=$(grep "Handler(" "$file" | head -1 | grep -oE "[a-zA-Z]+Handler")
    echo "  Route: $file"
    echo "    Handler: $handler"
    echo "    Check: lib/pov/handlers/ for validatePOVAccess or checkPermission"
  fi
done

# Verify handlers have POV checks
echo "  Handlers with POV validation:"
grep -l "validatePOVAccess\|checkPermission.*PoV" lib/pov/handlers/*.ts 2>/dev/null

# Example: Route calls createPhaseHandler() → handler has checkPermission
```

#### Step 1.5.4: Pattern 4 - Manual validatePOVAccess
```bash
# Direct validatePOVAccess calls in route files
echo "=== Pattern 4: Manual validatePOVAccess ==="
grep -r "validatePOVAccess(user, pov\|validatePOVAccess(authUser" app/api/pov --include="*.ts" -l

# Count
grep -r "validatePOVAccess(" app/api/pov --include="*.ts" | wc -l

# Example: Used in newly secured routes (execute, cancel, status)
```

#### Step 1.5.5: Comprehensive Unprotected Route Detection
```bash
# Check ALL 4 patterns before flagging as vulnerable
echo "=== TRULY UNPROTECTED ROUTES (Check All 4 Patterns) ==="

for file in $(find app/api/pov -name "route.ts"); do
  # Check all 4 protection patterns
  has_middleware=$(grep -c "withPOVAccess\|requirePermission" "$file" 2>/dev/null || echo 0)
  has_handler=$(grep -c "Handler(" "$file" 2>/dev/null || echo 0)
  has_manual=$(grep -c "validatePOVAccess" "$file" 2>/dev/null || echo 0)

  if [ "$has_middleware" -eq 0 ] && [ "$has_handler" -eq 0 ] && [ "$has_manual" -eq 0 ]; then
    # Double-check for user scoping (list endpoints)
    has_user_scope=$(grep -c "ownerId.*user\.userId\|team.*members.*userId: user\.userId" "$file" 2>/dev/null || echo 0)

    if [ "$has_user_scope" -eq 0 ]; then
      echo "❌ CRITICAL: $file - NO PROTECTION"
    else
      echo "⚠️ REVIEW: $file - User-scoped query (verify sufficient for list endpoint)"
    fi
  fi
done

# Expected: <5 routes (utilities, deprecated, or legitimately public)
```

**Interpretation Guide**:
- ✅ **Pattern 1 or 2**: Middleware = Protected at route level
- ✅ **Pattern 3**: Handler = Check lib/pov/handlers/ for protection
- ✅ **Pattern 4**: Manual = Protected in route code
- ⚠️ **User-scoped query**: Review if sufficient (usually OK for list endpoints)
- ❌ **None**: CRITICAL - Add protection immediately

---

### Phase 2: Validation Coverage Analysis (30 min)

#### Step 2.1: Find Validated Endpoints
```bash
# Endpoints with .safeParse() (correct pattern)
grep -r "\.safeParse(" app/api/ lib/*/handlers/ --include="*.ts" -l | wc -l

# Endpoints importing validation schemas
grep -r "import.*Schema.*from.*validation" app/api/ lib/*/handlers/ --include="*.ts" -l | wc -l

# List validated endpoints
grep -r "import.*Schema.*from.*validation" app/api/ lib/*/handlers/ --include="*.ts" -l
```

#### Step 2.2: Find Unvalidated Endpoints
```bash
# Endpoints parsing JSON without validation
grep -r "await req\.json()" app/api/ --include="route.ts" -l | \
  while read f; do
    grep -q "\.safeParse\|\.parse(" "$f" || echo "$f"
  done

# Count unvalidated
grep -r "await req\.json()" app/api/ --include="route.ts" | \
  grep -v "safeParse\|parse" | wc -l
```

#### Step 2.3: Calculate Coverage Percentage
```bash
# Write endpoints (POST/PUT/PATCH/DELETE)
WRITE_ENDPOINTS=$(grep -r "export async function POST\|PUT\|PATCH\|DELETE" app/api/ --include="route.ts" | wc -l)

# Validated endpoints
VALIDATED=$(grep -r "\.safeParse\|import.*Schema" app/api/ lib/*/handlers/ --include="*.ts" -l | wc -l)

# Coverage percentage
echo "scale=1; ($VALIDATED / $WRITE_ENDPOINTS) * 100" | bc
```

---

### Phase 3: Security Risk Assessment (45 min)

#### Step 3.1: Find Text Input Endpoints (XSS Risk)
```bash
# Endpoints accepting text in JSON body
# (Look for common field names: title, description, name, subject, message, prompt, etc.)
grep -r "await req\.json()" app/api/ --include="route.ts" -A 20 | \
  grep -E "title|description|name|subject|message|prompt|content|text" | \
  head -20
```

#### Step 3.2: Check XSS Protection Usage
```bash
# Endpoints using injection detection
grep -r "detectPromptInjection" app/api/ lib/*/handlers/ --include="*.ts" -l

# Endpoints using ValidationPatterns
grep -r "ValidationPatterns\|NO_SCRIPT_INJECTION" app/api/ lib/*/handlers/ --include="*.ts" -l

# Endpoints using sanitization
grep -r "sanitizeTemplateVariable" app/api/ lib/*/handlers/ --include="*.ts" -l
```

#### Step 3.3: Find DoS Vulnerable Endpoints
```bash
# Endpoints without max length validation
grep -r "await req\.json()" app/api/ --include="route.ts" -l | \
  while read f; do
    grep -q "\.max(" "$f" || echo "$f (no max length)"
  done | head -20
```

#### Step 3.4: Check Rate Limiting
```bash
# Find rate limiter implementations
grep -r "rateLimit\|RateLimit" lib/middleware/ --include="*.ts"

# Count rate-limited endpoints
grep -r "rateLimit\|RateLimit" app/api/ --include="*.ts" | wc -l
```

---

### Phase 4: Validation Pattern Analysis (30 min)

#### Step 4.1: Inventory Validation Schemas
```bash
# Count centralized validation schemas
grep -r "export const.*Schema = z\." lib/validation/ --include="*.ts" | wc -l

# List all validation files
ls -1 lib/validation/*.ts

# Check helper usage
grep -r "FormField\|PrismaEnum\|OptionalCUID" lib/validation/ --include="*.ts" | wc -l
```

#### Step 4.2: Find Anti-Patterns
```bash
# Wrong error pattern (.parse throws, should use .safeParse)
grep -r "\.parse(" app/api/ lib/*/handlers/ --include="*.ts" | \
  grep -v "safeParse\|parseInt\|parseFloat" | wc -l

# Missing .nullable() on optional fields
grep -r "\.optional()" lib/validation/ --include="*.ts" | \
  grep -v "\.nullable()" | wc -l

# Hardcoded enums (should use z.nativeEnum)
grep -r 'z\.enum(' lib/validation/ --include="*.ts" | \
  grep -v "nativeEnum\|//.*Use instead" | wc -l
```

#### Step 4.3: Check Security Integration
```bash
# Count usage of security patterns
grep -r "detectPromptInjection" lib/validation/ --include="*.ts" | wc -l
grep -r "ValidationPatterns\." lib/validation/ --include="*.ts" | wc -l
grep -r "sanitizeTemplateVariable" lib/validation/ --include="*.ts" | wc -l
```

---

### Phase 5: Generate Risk Matrix (30 min)

#### Step 5.1: Create Endpoint Inventory

**For each endpoint**, assess:
- HTTP method (GET=low, POST/PUT/DELETE=high)
- User input type (none=low, IDs=medium, text=high)
- Validation status (yes=low, no=high)
- Domain criticality (admin=critical, public=high, internal=medium)
- Authentication required (yes=medium, no=critical)

**Risk Score Formula**:
```
Risk = (Input Type × 3) + (No Validation × 5) + (Method Weight × 2) + (Domain × 2) - (Auth × 3)

Where:
- Input Type: none=0, IDs=1, enums=2, text=3
- No Validation: no=5, inline=2, centralized=0
- Method: GET=0, DELETE=1, PUT=2, POST=3
- Domain: internal=0, public=1, admin=2
- Auth: yes=0, no=3

CRITICAL: 15+
HIGH: 10-14
MEDIUM: 5-9
LOW: 0-4
```

#### Step 5.2: Identify Top 10 Risks

Sort endpoints by risk score, output top 10 with:
- Endpoint path
- Risk score
- Risk level (CRITICAL/HIGH/MEDIUM/LOW)
- Attack vectors
- Recommended fix (time estimate)

---

## Specialist Coordination

### Parallel Execution

**Launch all 3 specialists simultaneously**:
- Maximizes efficiency (3 hours total, not 9 hours sequential)
- Enables cross-validation (findings should align)
- Provides multiple perspectives (API efficiency, security, validation)

### Cross-Validation Checks

**Specialists should agree on**:
- Total endpoint count (±5%)
- Write endpoint count (±5%)
- Top 5 highest-risk endpoints (consensus on 3+)
- Overall security score (±10 points)

**If disagreement**:
- Review discovery findings
- Identify source of discrepancy
- Specialist discussion to reach consensus

---

## Output Format Template

### Comprehensive Findings Report

```markdown
# Endpoint Security Audit - [Date]

## Executive Summary
- Total Endpoints: X
- Validated: Y (Z%)
- Unvalidated: W (P%)
- Security Score: Q/100
- CRITICAL Issues: N
- HIGH Issues: M

## Specialist Consensus
- api-efficiency: X% coverage
- sec-ops: Y/100 security score
- validation-engine: Z% confidence

## Top 10 Highest-Risk Endpoints
1. [Endpoint] - Risk: CRITICAL - [Attack vectors]
2. ...

## Recommended Actions
### Phase 1: P0 Fixes (Week 1)
- [List of CRITICAL fixes]
- Estimated time: X hours
- Impact: Score Q → R

### Phase 2: P1 Fixes (Weeks 2-3)
- [List of HIGH fixes]

### Phase 3: P2 Fixes (Month 1)
- [List of MEDIUM fixes]

## Detailed Findings
[Full specialist reports]
```

---

## Post-Audit Actions

### Immediate (Same Day)

1. **Review Findings**: Read comprehensive report
2. **Assess Urgency**: Check security score and CRITICAL count
3. **Create Fix Plan**: Use specialist-review-protocol for P0 fixes
4. **Assign Ownership**: Determine who implements fixes

### Short-Term (1 Week)

1. **Implement P0 Fixes**: Address all CRITICAL vulnerabilities
2. **Re-test**: Run validation tests
3. **Deploy**: Push fixes to production
4. **Monitor**: Watch for false positives

### Medium-Term (1 Month)

1. **Implement P1/P2 Fixes**: Address HIGH/MEDIUM issues
2. **Re-audit**: Run endpoint-security-audit again
3. **Measure Improvement**: Compare before/after scores
4. **Document Patterns**: Extract learnings to knowledge base

---

## Metrics to Track

### Security Metrics
- Overall security score (target: 92+)
- Validation coverage % (target: 70%+)
- CRITICAL vulnerabilities (target: 0)
- HIGH vulnerabilities (target: <5)

### Validation Metrics
- Centralized schemas created
- Endpoints validated
- Security patterns applied
- Tests added

### Process Metrics
- Audit frequency (quarterly minimum)
- Time to fix CRITICAL (target: <1 week)
- Re-audit improvement (target: +10 points)

---

## Common Findings & Solutions

### Finding: Low Validation Coverage (< 30%)

**Solution**: Create centralized validation helpers
- Follow form-field-patterns.ts model
- Follow enum-validation.ts model
- Follow id-validation.ts model

**Time**: 1-2 hours per helper
**Impact**: Enables rapid schema creation

---

### Finding: Inconsistent Patterns

**Solution**: Standardize on best practices
- Use .safeParse() not .parse()
- Use FormField.optional() not .optional()
- Use z.nativeEnum() not z.enum()
- Use ValidationPatterns not custom regex

**Time**: 3-5 hours global migration
**Impact**: Eliminates anti-patterns

---

### Finding: Missing Security Integration

**Solution**: Apply existing security infrastructure
- Use detectPromptInjection() for text
- Use ValidationPatterns for injection
- Use sanitizeTemplateVariable() for HTML

**Time**: 1 hour per endpoint
**Impact**: 99%+ XSS prevention

---

## Reference Implementation

**Based on**: Nov 3, 2025 successful audit
**Documents**: `/cline_docs/reviews/endpoint-validation-coverage-audit-2025-11-03/`
**Results**:
- Found 12 vulnerabilities
- Fixed 4 CRITICAL gaps
- Improved 79% → 96% confidence
- Established 6 security layers

**Specialists Used**:
1. api-efficiency-specialist → 189 endpoint mapping
2. sec-ops-specialist → Security risk assessment (72/100 score)
3. validation-engine-specialist → Validation coverage (75/100 score)

**Consensus**: 94% confidence for enhanced security plan

---

**Discovery Prompt Version**: 1.0
**Date Created**: November 3, 2025
**Protocol Reference**: endpoint-security-audit-protocol.md
**Success Pattern**: ✅ Validated in production


---

## BC71 detection (Untrusted Input in Response-Text Interpolation, 2026-05-22)

When investigating XSS, response sanitization, or "what fields could carry user input back to MCP clients":

### Two-axis grep (axis 1: helpers, axis 2: inline)

```bash
# Axis 1: well-known echo sites in error-helpers
grep -rE 'new Error\(`.*\$\{(searchTerm|name|title|provided|action)' \
  lib/mcp/server/tools/*/error-helpers.js

# Axis 2: inline interpolation outside helpers (Plan v1 of BUG-BASIC-XSS-1
# MISSED this axis — boundary-contract specialist found 5 bypass paths
# bringing scope from 11 → ~135 sites)
grep -rE 'throw new Error\(`.*\$\{|error: `.*\$\{|text: `.*\$\{|message: `.*\$\{' \
  lib/mcp/server/tools/ --include='*.js' | grep -v error-helpers | grep -v test-

# Verify sanitize coverage (catches any new echo site without the wrap)
grep -rL "sanitizeForResponse" lib/mcp/server/tools/ --include='*.js' \
  | xargs grep -lE 'throw new Error\(`.*\$\{' 2>/dev/null
```

### Defense pattern verification

```bash
# L1 input rejection (16 fields covered)
grep -nE "SafeNameField" lib/mcp/server/config/tool-schemas.js | head -5

# L4 output sanitization (canonical utility)
cat lib/mcp/server/tools/response-sanitizer.js | head -50
```

### Reference
- BC71 in `.claude/knowledge/domain/mcp/bug-class-registry.md`
- Sanitize utility: `lib/mcp/server/tools/response-sanitizer.js` (5-char OWASP escape, reuses `lib/utils/sanitize.ts:escapeHtml` via KEEP IN SYNC inline copy)
- L1 input rejection: `lib/mcp/server/config/tool-schemas.js:SafeNameField`
- Markdown URL allowlist: `lib/mcp/server/tools/advanced/analytics/analytics-formatters.js:sanitizeLinkUri`
- Pattern memory: [[feedback_bc2_audits_two_axes]] (two-axis grep saved this)
