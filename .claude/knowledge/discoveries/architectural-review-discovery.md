# Architectural Review Discovery Task

**Last Updated**: 2026-06-11 (health-run: KB-migration paths, Wave-3a/6/7 retargets, phantom engine path purged)
**Status**: v1.1 - Systematic Conflict Prevention
**Confidence**: Very High - Designed based on Plan 11 semantic conflict learnings
**Last Validated**: 2026-06-11 - Gate scripts, §5.5 symbols, Step-9 helpers, Step-10/11 paths re-proven against tree

## Objective
Perform systematic architectural review of proposed plans, major todos, and design decisions to identify and prevent semantic conflicts, security gaps, UX inconsistencies, and cross-cutting concerns before implementation.

## Context
The Plan 11 incident revealed that even well-intentioned categorizations can contain semantic conflicts (e.g., "list_my_services" categorized as unauthenticated-accessible despite requiring user identity). This discovery establishes systematic review patterns to catch such issues proactively.

## Discovery Scope

### 1. Semantic Consistency Analysis
Identify language and conceptual conflicts in proposed designs:

```bash
# 1. Extract all tool/function names from plans
echo "=== Semantic Analysis Phase ==="
grep -o '\w*_my_\w*\|get_\w*_status\|\w*_user_\w*\|list_\w*_by_user\|user_\w*\|my_\w*' [PLAN_FILE] | sort -u

# 2. Check for identity-requiring language patterns
grep -E "(my|your|user's|personal|owned|private)" [PLAN_FILE] -i

# 3. Find authentication inconsistencies
grep -E "(unauthenticated.*access|public.*access|no.*auth)" [PLAN_FILE] -A 3 -B 3

# 4. Check for semantic ownership conflicts
grep -E "list_my|user_specific|personal_data" [PLAN_FILE] -C 2

```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:

**SEMANTIC VALIDATION:**
- [ ] No 'MY/YOUR' functions in unauthenticated category
- [ ] No personal data access without identity verification
- [ ] No ownership language without authentication requirement
- [ ] No user-specific operations in public tier


### 2. Security vs UX Trade-off Analysis  
Evaluate authentication friction against exploration benefits:

```bash
# 1. Categorize operations by sensitivity
echo "=== Security-UX Matrix ==="

echo "HIGH SECURITY RISK (Require Auth):"
grep -E "(create|update|delete|execute|modify|write)" [PLAN_FILE] | head -10

echo "PERSONAL DATA (Require Auth):"  
grep -E "(my_|user_|personal_|trial_status|owned_)" [PLAN_FILE]

echo "READ-ONLY EXPLORATION (Allow Public):"
grep -E "(list|get|discover|analyze|info|details)" [PLAN_FILE] | grep -v -E "(my_|user_|personal_|trial_status)"

echo "ONBOARDING EXCEPTIONS (Business Decision):"
grep -E "(trial|signup|register|demo|request)" [PLAN_FILE]

# 2. Check for mixed-purpose functions
echo "=== Mixed Purpose Functions ==="
grep -E "validate.*template.*param|check.*config|analyze.*perform" [PLAN_FILE]

```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:

**VALIDATION NEEDED:**
- [ ] Functions don't mix read-only validation with write operations
- [ ] Onboarding tools genuinely enable exploration without security risk
- [ ] Personal data functions explicitly require identity


### 3. Cross-Cutting Concerns Detection
Find issues that span multiple domains:

```bash
# 1. Performance implications
echo "=== Performance Impact Analysis ==="
grep -E "(all.*\w+|bulk|batch|list.*without.*limit)" [PLAN_FILE]

```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:

**PERFORMANCE CHECKS:**
- [ ] No unbounded queries without pagination
- [ ] No N+1 query patterns in read operations
- [ ] Bulk operations have reasonable limits

```bash
# 2. Data consistency boundaries
echo "=== Data Consistency Analysis ==="
grep -E "(transaction|atomic|rollback|consistency)" [PLAN_FILE]

```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:

**CONSISTENCY CHECKS:**
- [ ] Multi-table operations use transactions
- [ ] No partial state exposure during updates
- [ ] Rollback strategies for complex operations

```bash
# 3. Error handling consistency
echo "=== Error Handling Analysis ==="
grep -E "(error|exception|fail|timeout)" [PLAN_FILE]

```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:

**ERROR HANDLING CHECKS:**
- [ ] Consistent error message formats
- [ ] Proper error codes and categories
- [ ] No sensitive data in error responses


### 4. Integration Point Risk Assessment
Evaluate impacts on existing systems:

```bash
# 1. Service integration conflicts
echo "=== Integration Impact Analysis ==="

# Find services that might be affected
grep -E "Service|API|endpoint|route" [PLAN_FILE] | grep -o '\w*Service\|\w*API\|/api/\w*'

# Check authentication flow changes
grep -E "auth.*context|jwt|token|session" [PLAN_FILE]

# Find MCP tool changes
grep -E "mcp.*tool|tool.*handler|tool.*schema" [PLAN_FILE]

```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:

**INTEGRATION VALIDATION:**
- [ ] No breaking changes to existing API contracts
- [ ] Authentication context preserved across all tools
- [ ] MCP tool schema changes maintain backward compatibility
- [ ] Service registration patterns remain consistent

```bash
# 2. Database schema impact
echo "=== Schema Impact Analysis ==="
grep -E "model|field|relation|@|@@" [PLAN_FILE]

```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:

**SCHEMA VALIDATION:**
- [ ] No breaking changes to existing relations
- [ ] Migration strategy defined for schema changes
- [ ] Foreign key constraints preserved


### 5. UX Flow Coherence Review
Ensure user experience makes logical sense:

```bash
# 1. Authentication flow logic
echo "=== UX Flow Analysis ==="

```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:

**AUTHENTICATION UX LOGIC:**
- [ ] New users have clear exploration path
- [ ] Authentication requirements are obvious when needed
- [ ] No dead-end flows (tools that require auth but don't explain how)
- [ ] Progressive disclosure works (simple → complex)

```bash
# 2. Tool discovery flow
grep -E "tool.*list|discover|hub_info" [PLAN_FILE]

```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:

**TOOL DISCOVERY UX:**
- [ ] Unauthenticated users see appropriate subset
- [ ] Tool descriptions match actual auth requirements
- [ ] Clear upgrade path from exploration to full access

```bash
# 3. Error message quality
echo "=== Error Message Review ==="
grep -E "error.*message|auth.*required|invalid" [PLAN_FILE] -A 2

```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:

**ERROR UX VALIDATION:**
- [ ] Error messages are helpful, not just restrictive
- [ ] Clear next steps provided in every error
- [ ] No technical jargon in user-facing errors


### 5.5. Boundary Contract Analysis (NEW - Oct 2025)

Before approving any plan involving authentication, authorization, or data transformation:

```bash
# Run boundary contract gate
/.claude/knowledge/discoveries/quality_gates/boundary_contract_gate.sh [PLAN_FILE]   # moved from cline_docs in the KB migration

# If gate triggers (exit code 1):
# 1. Activate boundary-contract-specialist
# 2. Run 5-minute protocol
# 3. Validate all contracts
# 4. Add prevention tests
# 5. Re-run gate (should pass)

echo "=== Boundary Contract Validation ==="

# 1. Identify data boundaries in plan
```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:

**DATA BOUNDARIES IN PLAN:**

```bash
grep -E "JWT|token|payload|decode|encode|transform|convert|map|req\.user|AuthUser" [PLAN_FILE] | head -10

# 2. Check for boundary transformation patterns
```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:

**TRANSFORMATION PATTERNS:**

```bash
grep -oE "\w+ → \w+|transform|convert|map" [PLAN_FILE] | sort -u

# 3. Validate field completeness (post-U2 2026-05-19)
```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:

**FIELD COMPLETENESS CHECKS:**
- [ ] All JWT payloads (mintMcpToken in lib/auth/token-manager.ts) include: sub/userId, email, role, scope, aud (per-service), azp (Option α)
- [ ] All AuthUser objects include: userId, email, role
- [ ] All req.user objects include: id, email, role, token, azp, authMethod (populateReqUser — now AuthManager's private helper inside createMiddleware, lib/auth/oauth/auth-manager.ts, x3 dispatch sites; moved out of mcp-server-http-clean.js in Wave 3a)
- [ ] All RBAC queries use: userId, role
- [ ] Per-call mint sites (api-client.js, service-caller.ts, workflow-tools-handler.js) enumerate ALL required MintMcpTokenOptions fields explicitly (v3.1 Edit 2)
- [ ] Audience for outbound mints uses audienceForService(serviceRecord), NOT generic /mcp

```bash
# 4. Cross-reference with known boundaries
echo "KNOWN BOUNDARY RISKS (post-U2):"
echo "⚠️ Boundary 2: User → JWT (ensure email/role included in mintMcpToken; audience REQUIRED, no implicit default)"
echo "⚠️ Boundary 4: Decoded JWT → AuthUser (ensure fields extracted; verifier returns TokenPayload {userId, email, role}, audience enforced as constraint not surfaced as claim)"
echo "⚠️ Boundary 5: AuthUser → req.user (populateReqUser helper for all 3 auth paths; token KEPT per boundary-contract C3, azp ADDED per Option α; OrchestrationContext.user.token DROPPED Phase D site #17)"
echo "⚠️ Boundary 7: AuthUser → RBAC (ensure role available; DEMO_USER filtering at app/api/pov/route.ts depends on role propagation through per-call mints)"

```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:

**BOUNDARY CONTRACT VALIDATION:**
- [ ] All boundaries identified and documented
- [ ] Contracts defined (required fields listed)
- [ ] Source produces what destination needs
- [ ] No field leakage across transformations
- [ ] Comparative analysis if similar code exists
- [ ] Tests added for critical boundaries

```bash
# 5. Recommendation
if grep -qE "JWT|token|AuthUser|req\.user|role.*RBAC" [PLAN_FILE]; then
```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:

```bash
  echo "📋 RECOMMENDATION:"
  echo "Run boundary-contract-specialist for detailed analysis"
  echo "Reference: /.claude/knowledge/discoveries/boundary-contract-discovery.md"
  echo "Use 5-minute protocol to validate contracts"
fi
```

**Integration with Meta-Pattern Registry**:
This quality gate prevents "Boundary Field Leakage" meta-pattern (Active Pattern #1 in registry):
- Historical bugs: Oct 20 (req.user.token), Oct 21 (JWT email/role)
- Prevention effectiveness: 10-20x debugging time improvement
- See: `/cline_docs/meta-patterns/registry.md`

### 6. Decision Criteria Template Application
Apply systematic decision frameworks:

```bash
# 1. Load decision templates
echo "=== Decision Framework Analysis ==="

# Check if plan uses explicit decision criteria
grep -E "Option [ABC]|Alternative|Decision|Rationale|Trade-off" [PLAN_FILE] -A 5

```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:

**DECISION VALIDATION:**
- [ ] Multiple options were considered
- [ ] Trade-offs explicitly documented
- [ ] Decision criteria applied systematically
- [ ] Rejected alternatives explained

```bash
# 2. Business logic alignment
grep -E "business.*rule|policy|requirement|constraint" [PLAN_FILE]

```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:

**BUSINESS ALIGNMENT:**
- [ ] Implementation matches business intent
- [ ] Edge cases align with business policies
- [ ] Technical decisions support business goals


## Decision Framework Templates

### Template 1: Authentication Access Decision Matrix

```markdown
## Authentication Access Decision Matrix

### Tool Analysis: [TOOL_NAME]
**Question**: Should this tool require authentication?

#### Option A: Require Authentication ✅
- **Semantic Check**: Does tool name imply ownership? ("my_", "your_", user-specific)
- **Data Security**: Does tool access personal/sensitive data?
- **Write Operations**: Does tool modify data or execute actions?
- **Accountability**: Does operation require audit trail?

#### Option B: Allow Unauthenticated ❌
- **Pure Read-Only**: Tool only retrieves public information
- **No Personal Context**: Tool works without user identity
- **Onboarding Value**: Tool helps users explore platform
- **No Security Risk**: No sensitive data exposure possible

#### Decision Criteria:
1. **Semantic Consistency** (Weight: 40%) - Does tool name match access level?
2. **Security Impact** (Weight: 30%) - Risk of data exposure
3. **User Experience** (Weight: 20%) - Onboarding vs friction
4. **Business Value** (Weight: 10%) - Revenue/conversion impact

#### Decision: [A/B] based on [highest weighted criteria]
```

### Template 2: UX Flow Decision Matrix

```markdown
## UX Flow Decision Matrix

### Flow Analysis: [FLOW_NAME]  
**Question**: How should users progress through this flow?

#### Option A: Linear Progression 
- **Clarity**: Step-by-step guidance, no ambiguity
- **Control**: Platform controls user journey
- **Support**: Easier to provide help and handle errors
- **Conversion**: Higher completion rates for critical flows

#### Option B: Non-linear Exploration
- **Flexibility**: Users choose their own path
- **Discovery**: Natural exploration encourages engagement  
- **Personalization**: Adapts to different user types
- **Scalability**: Less hand-holding required

#### Decision Criteria:
1. **User Goals** (Weight: 35%) - What do users want to accomplish?
2. **Complexity** (Weight: 25%) - How complex is the domain?
3. **Error Recovery** (Weight: 20%) - How critical are mistakes?
4. **Business Impact** (Weight: 20%) - Revenue/engagement effects

#### Decision: [A/B] based on [analysis]
```

### Template 3: Technical Debt Decision Matrix

```markdown
## Technical Debt Decision Matrix

### Change Analysis: [CHANGE_DESCRIPTION]
**Question**: Should we fix the underlying issue or implement workaround?

#### Option A: Fix Root Cause
- **Long-term Value**: Eliminates future issues
- **Code Quality**: Improves overall system health  
- **Maintainability**: Easier to understand and modify
- **Performance**: Often better performance characteristics

#### Option B: Implement Workaround  
- **Speed**: Faster time to market
- **Risk**: Lower chance of breaking existing functionality
- **Scope**: Contained changes, easier testing
- **Resources**: Fits current team bandwidth

#### Decision Criteria:
1. **Impact Scope** (Weight: 30%) - How many systems affected?
2. **Timeline Pressure** (Weight: 25%) - How urgent is delivery?
3. **Team Expertise** (Weight: 25%) - Do we understand the root cause?
4. **Future Cost** (Weight: 20%) - Cost of leaving technical debt

#### Decision: [A/B] based on [analysis]
```

## Authentication-Related Precedents

### 2026-05-18 — U2 Path A + Path B v3 (HS256 dead-code deletions)

Pattern: **reduce-then-defer scope split** after multi-specialist review surfaces strategic work that doesn't depend on the upstream delete.

- **U2 Path A** (commit `ec04a853`): `oauth-service.ts:135-150` HS256 mint deleted as dead code
- **U2 Path B v3** (commit `9b2c2d08`): `mcp-oauth-validator.js:511-533` HS256 mint deleted; 9 specialist reviews across 2 rounds; 96.6% post-edit projection

Both followed the same shape: discover dead-code via multi-specialist review, ship minimal delete, defer strategic work into a pre-scoped follow-up. Codified as `multi-specialist-dead-code-deletion-pattern.md` in the registry. Reference: `cline_docs/reviews/u2-mcp-validator-hs256-to-rs256-2026-05-18/` + `cline_docs/closures/u2-path-b-v3-static-analysis-trace-2026-05-18.md`.

Architectural lessons:
- Static-analysis trace beats runtime canary when consumer sites are statically analyzable (`feedback_grep_before_instrumentation`)
- Round 2 fresh-eyes specialists (architectural-review + auth-permissions) caught items round 1's domain specialists couldn't see
- v3 plan audit (long-tail re-read) found 15+ items missed in round 2's headline-only summary (`feedback_specialist_recommendation_audit`)
- Post-edit projection ≥ 95% with zero Critical findings = no re-review round needed (protocol §374)

---

## Architectural Review Protocol

### Phase 1: Document Analysis
```bash
# 1. Extract all proposed changes
echo "=== Proposed Changes Extraction ==="
PLAN_FILE="[PATH_TO_PLAN]"

# Extract tool names and categorizations
grep -E "^\s*-.*`.*`" $PLAN_FILE | head -20

# Extract function modifications  
grep -E "Update.*function|Add.*check|Implement.*auth" $PLAN_FILE

# Extract new components
grep -E "Create.*component|New.*service|Add.*handler" $PLAN_FILE
```

### Phase 2: Conflict Detection
```bash
# Run semantic analysis
echo "=== Running Semantic Conflict Detection ==="

# Apply Template 1: Authentication conflicts
```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:

**AUTHENTICATION CONFLICTS:**

```bash
grep -E "list_my_\w+.*unauthenticated|get_.*_status.*public|user_.*no.*auth" $PLAN_FILE

# Apply Template 2: UX flow conflicts  
```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:

**UX FLOW CONFLICTS:**

```bash
grep -E "require.*auth.*but.*explore|public.*but.*personal|read.*only.*but.*write" $PLAN_FILE

# Apply Template 3: Technical debt conflicts
```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:

**TECHNICAL DEBT CONFLICTS:**

```bash
grep -E "workaround.*but.*fix|hack.*but.*proper|temp.*but.*permanent" $PLAN_FILE
```

### Phase 3: Cross-System Impact Analysis
```bash
# 1. Find affected systems
echo "=== Cross-System Impact ==="

# Check which services are mentioned
grep -E "Service|Handler|Manager|Controller" $PLAN_FILE | grep -o '\w*Service\|\w*Handler\|\w*Manager' | sort -u

# Check which specialists should review
```

**Reviewer checklist** *(prose — NOT a command; de-costumed 2026-06-11 per the echo-checklist fix)*:

**REQUIRED SPECIALIST REVIEWS:**

```bash
if grep -q "auth\|permission\|jwt" $PLAN_FILE; then echo "- auth-permissions-specialist"; fi
if grep -q "database\|schema\|migration" $PLAN_FILE; then echo "- database-manager-specialist"; fi  
if grep -q "template\|agent" $PLAN_FILE; then echo "- template-system-specialist"; fi
if grep -q "browser\|automation" $PLAN_FILE; then echo "- browser-automation-specialist"; fi
if grep -q "mcp\|tool\|hub" $PLAN_FILE; then echo "- mcp-hub-specialist"; fi
if grep -q "performance\|optimization" $PLAN_FILE; then echo "- performance-analyst-specialist"; fi
```

### Phase 4: Quality Gate Assessment
```bash
# Create comprehensive quality checklist
echo "=== Quality Gate Checklist ==="

cat > /tmp/quality_gate.md << 'EOF'
# Quality Gate Assessment

## Semantic Consistency ✅❌
- [ ] Tool names match access requirements
- [ ] Personal pronouns require authentication  
- [ ] Ownership language has proper identity checks
- [ ] No semantic contradictions found

## Security Alignment ✅❌  
- [ ] Write operations are protected
- [ ] Personal data requires authentication
- [ ] No privilege escalation paths
- [ ] Error messages don't leak sensitive info

## UX Flow Coherence ✅❌
- [ ] Onboarding path is clear and valuable
- [ ] Authentication friction is justified
- [ ] Error messages provide next steps
- [ ] Progressive disclosure makes sense

## Cross-System Integrity ✅❌
- [ ] No breaking changes to existing APIs
- [ ] Database constraints maintained
- [ ] MCP protocol compliance preserved  
- [ ] Performance characteristics acceptable

## Implementation Readiness ✅❌
- [ ] All dependencies identified
- [ ] Risk mitigation strategies defined
- [ ] Rollback plan exists
- [ ] Testing strategy complete

## Pass Criteria: 
- All ✅ sections must pass
- Any ❌ triggers specialist review
- 2+ ❌ in same section requires redesign
EOF

cat /tmp/quality_gate.md
```

## Specialist Review Coordination

### Automatic Specialist Triggering
```bash
# 1. Determine required specialists based on plan content
echo "=== Required Specialist Matrix ==="

declare -A specialist_triggers
specialist_triggers["auth"]="auth-permissions-specialist"
specialist_triggers["database"]="database-manager-specialist"  
specialist_triggers["template"]="template-system-specialist"
specialist_triggers["browser"]="browser-automation-specialist"
specialist_triggers["mcp"]="mcp-hub-specialist"
specialist_triggers["performance"]="performance-analyst-specialist"
specialist_triggers["security"]="sec-ops-specialist"
specialist_triggers["validation"]="validation-engine-specialist"

for trigger in "${!specialist_triggers[@]}"; do
    if grep -q "$trigger" $PLAN_FILE; then
        echo "✅ ${specialist_triggers[$trigger]} - Required due to $trigger references"
    fi
done
```

### Specialist Review Template
```markdown
## Specialist Review Request

### Review Context
- **Plan**: [Plan name/description]
- **Confidence Issue**: [What semantic/architectural conflict was detected]
- **Impact Area**: [Your specific domain of expertise]

### Required Review Points  
1. **Domain Consistency**: Does this plan align with [domain] best practices?
2. **Integration Impact**: How does this affect [domain] integrations?
3. **Risk Assessment**: What [domain]-specific risks do you see?
4. **Alternative Approaches**: Any better approaches from [domain] perspective?

### Review Output Format
```
╔═══════════════════════════════════════╗
║ [EMOJI] [SPECIALIST] ARCHITECTURAL    ║
║         REVIEW COMPLETE               ║ 
╚═══════════════════════════════════════╝

## [Domain] Review Summary:
✅ **Approved Aspects:**
- [What looks good from domain perspective]

⚠️ **Concerns Identified:**  
- [Specific issues found]
- [Recommended changes]

❌ **Blocking Issues:**
- [Critical problems that must be fixed]

## Recommended Resolution:
[Specific actionable advice]
```

## Quality Gate Implementation

### Gate 1: Semantic Consistency Gate
```bash
#!/bin/bash
# semantic_gate.sh - Check for semantic conflicts

PLAN_FILE=$1
CONFLICTS=0

echo "🔍 Running Semantic Consistency Gate..."

# Check for identity-requiring language in unauthenticated sections
if grep -A 10 -B 5 "unauthenticated.*access\|public.*access" $PLAN_FILE | grep -q "list_my\|get_.*_status\|user_.*\|my_.*"; then
    echo "❌ SEMANTIC CONFLICT: Identity-requiring functions in unauthenticated section"
    CONFLICTS=$((CONFLICTS + 1))
fi

# Check for personal pronouns without auth requirements
if grep -E "my_\w+|your_\w+|user_specific" $PLAN_FILE | grep -q -v "auth\|require.*auth\|protected"; then
    echo "❌ SEMANTIC CONFLICT: Personal language without authentication requirement"
    CONFLICTS=$((CONFLICTS + 1))
fi

# Check for ownership operations in public tier
if grep -A 5 -B 5 "public\|read.*only" $PLAN_FILE | grep -q "register\|create\|own"; then
    echo "⚠️  OWNERSHIP WARNING: Creation/registration operations in public tier"
fi

if [ $CONFLICTS -eq 0 ]; then
    echo "✅ Semantic Consistency Gate: PASSED"
    exit 0
else
    echo "❌ Semantic Consistency Gate: FAILED ($CONFLICTS conflicts)"
    exit 1
fi
```

### Gate 2: Security-UX Balance Gate  
```bash
#!/bin/bash  
# security_ux_gate.sh - Validate security vs UX trade-offs

PLAN_FILE=$1
WARNINGS=0

echo "🔐 Running Security-UX Balance Gate..."

# Check onboarding vs security balance
UNAUTHENTICATED_TOOLS=$(grep -E "unauthenticated.*access\|public.*access" $PLAN_FILE -A 10 | grep -o "`\w*`" | wc -l)
AUTHENTICATED_TOOLS=$(grep -E "authentication.*required\|require.*auth" $PLAN_FILE -A 10 | grep -o "`\w*`" | wc -l)

echo "📊 Tool Distribution: $UNAUTHENTICATED_TOOLS public, $AUTHENTICATED_TOOLS protected"

# Validate ratio (should be roughly 60/40 or 70/30 for good onboarding)
if [ $UNAUTHENTICATED_TOOLS -gt $((AUTHENTICATED_TOOLS * 2)) ]; then
    echo "⚠️  UX WARNING: Too many public tools - may indicate insufficient security"
    WARNINGS=$((WARNINGS + 1))
fi

if [ $AUTHENTICATED_TOOLS -gt $((UNAUTHENTICATED_TOOLS * 3)) ]; then
    echo "⚠️  UX WARNING: Too few public tools - may hinder onboarding"  
    WARNINGS=$((WARNINGS + 1))
fi

# Check for onboarding flow completeness
if ! grep -q "trial\|signup\|explore\|demo" $PLAN_FILE; then
    echo "⚠️  UX WARNING: No clear onboarding path identified"
    WARNINGS=$((WARNINGS + 1))
fi

echo "✅ Security-UX Balance Gate: PASSED ($WARNINGS warnings)"
exit 0
```

### Gate 3: Cross-System Integrity Gate
```bash
#!/bin/bash
# cross_system_gate.sh - Check for breaking changes

PLAN_FILE=$1
ISSUES=0

echo "🔄 Running Cross-System Integrity Gate..."

# Check for API breaking changes
if grep -q "remove\|delete\|deprecate" $PLAN_FILE && grep -q "API\|endpoint\|route"; then
    echo "❌ BREAKING CHANGE: API modifications detected"
    ISSUES=$((ISSUES + 1))
fi

# Check for database schema changes
if grep -q "alter\|drop\|modify.*table\|change.*column" $PLAN_FILE; then
    echo "❌ SCHEMA RISK: Database structure changes detected"
    ISSUES=$((ISSUES + 1))
fi

# Check for authentication flow changes
if grep -q "change.*auth\|modify.*jwt\|update.*token" $PLAN_FILE; then
    echo "⚠️  AUTH RISK: Authentication system changes detected - requires specialist review"
    ISSUES=$((ISSUES + 1))
fi

if [ $ISSUES -eq 0 ]; then
    echo "✅ Cross-System Integrity Gate: PASSED"
    exit 0
else
    echo "❌ Cross-System Integrity Gate: FAILED ($ISSUES issues)"
    exit 1
fi
```

## Integration with Discovery-Scout

### Enhanced Handover Protocol for Architectural Review

```markdown
## Architectural Review Handover Protocol

### When to Trigger Architectural Review
discovery-scout should automatically run architectural review for:
- Plans with >5 tool modifications
- Any plan touching authentication, database, or core services
- Plans with explicit categorization (like Plan 11's tool classifications)
- Plans proposing new features affecting multiple domains
- Any plan with "Option A vs Option B" decision structures

### Review Request Format
```
╔═══════════════════════════════════════╗
║ 🔍 DISCOVERY SCOUT → ARCHITECTURAL    ║
║     REVIEW REQUEST                    ║
╚═══════════════════════════════════════╝

## Review Request Details:
📋 **Plan**: [plan-name/description]
🎯 **Focus**: [specific area of concern]
⚠️ **Trigger**: [why architectural review needed]

## Initial Conflict Scan Results:
- Semantic Issues: [count] found
- Security Trade-offs: [count] identified  
- UX Flow Concerns: [count] detected
- Cross-System Impacts: [count] systems affected

## Specialist Review Required:
- [specialist-1]: [reason]
- [specialist-2]: [reason]

Starting systematic architectural review...
```

### Architectural Review Output Template
```markdown
╔═══════════════════════════════════════╗
║ 🏗️ ARCHITECTURAL REVIEW COMPLETE     ║
╚═══════════════════════════════════════╝

## Review Summary:
📊 **Quality Gates**: [X/Y] passed
🚨 **Critical Issues**: [count] blocking issues
⚠️ **Warnings**: [count] recommendations  
✅ **Approved Elements**: [count] elements cleared

## Gate Results:
1. **Semantic Consistency**: [✅/❌] - [summary]
2. **Security-UX Balance**: [✅/❌] - [summary]  
3. **Cross-System Integrity**: [✅/❌] - [summary]

## Specialist Review Outcomes:
- [specialist-1]: [✅ Approved / ⚠️ Concerns / ❌ Blocked]
- [specialist-2]: [✅ Approved / ⚠️ Concerns / ❌ Blocked]

## Final Recommendation:
- [✅ PROCEED] - All gates passed, minor warnings only
- [⚠️ REVISE] - Fixable issues identified, revision recommended  
- [❌ REDESIGN] - Fundamental conflicts require new approach

## Next Steps:
[Specific actions needed before implementation]
```

## Continuous Learning Integration

### Pattern Database for Future Reviews
```bash
# 1. Create architectural pattern database
echo "=== Building Pattern Database ==="

mkdir -p /home/steve/copov15/cline_docs/architectural-patterns/

# Record Plan 11 learnings
cat > /tmp/plan11_learnings.md << 'EOF'
# Plan 11 Semantic Conflict Pattern

## Conflict Type: Identity-Language Mismatch
**Issue**: Tools with identity-requiring names (e.g., legacy "list_my_services", now registry(action: "list")) categorized as unauthenticated-accessible

## Detection Pattern:
```
(list_my_|get_.*_status|user_.*|my_.*|your_.*) + (unauthenticated|public|no.*auth)
```

## Resolution: Apply Authentication Access Decision Matrix
- Semantic Check: "MY" requires user identity ✅
- Security: Personal data requires auth ✅  
- UX: Alternative discovery tools provide exploration ✅
- Decision: Maintain authentication requirement

## Prevention: Always run semantic gate before implementation
EOF

# 2. Extract patterns from existing fixes
echo "=== Learning from Past Issues ==="
git log --grep="conflict\|semantic\|inconsistent" --oneline -20
```

### Learning Feedback Loop
```markdown
## Architectural Review Learning Protocol

### After Each Review:
1. **Pattern Recognition**: What type of conflict was this?
2. **Detection Improvement**: How could gates catch this earlier?
3. **Template Enhancement**: Do decision templates need updates?
4. **Specialist Training**: What domain knowledge was missing?

### Monthly Review Process:
1. **Pattern Analysis**: Most common conflict types
2. **Gate Effectiveness**: Which gates catch real issues vs false positives  
3. **Specialist Coordination**: Which handover patterns work best
4. **Template Updates**: Evolve decision frameworks based on learnings
```

## Success Metrics

### Conflict Prevention Metrics
- **Semantic conflicts detected pre-implementation**: Target >95%
- **False positive rate**: Target <10%  
- **Time to review**: Target <30 minutes for typical plans
- **Specialist coordination efficiency**: Target 1-2 specialists per review

### Quality Gate Effectiveness  
- **Gate 1 (Semantic)**: >90% accuracy in conflict detection
- **Gate 2 (Security-UX)**: >85% accuracy in trade-off identification
- **Gate 3 (Cross-System)**: >95% accuracy in breaking change detection

### Learning and Evolution
- **Pattern database growth**: +2 patterns per month minimum
- **Template relevance**: >80% of reviews use appropriate templates
- **Continuous improvement**: Gates evolve based on missed issues

## Usage Instructions

### For discovery-scout:
```
When you identify a plan or todo list that needs architectural review:

1. Run: `/.claude/knowledge/discoveries/architectural-review-discovery.md`
2. Provide plan path as [PLAN_FILE] variable
3. Execute all quality gates
4. Coordinate specialist reviews for any identified conflicts  
5. Generate final architectural review report
6. Block implementation until all gates pass or issues are resolved
```

### For other specialists:
```
When receiving architectural review requests:

1. Apply your domain expertise to the specific areas flagged
2. Use the Specialist Review Template provided  
3. Focus on domain-specific aspects of the conflict
4. Provide concrete, actionable recommendations
5. Hand back to discovery-scout with clear guidance
```

## Architectural Review Command Summary

### Quick Review (for simple plans):
```bash
# Run basic semantic and security checks
.claude/knowledge/discoveries/quality_gates/semantic_gate.sh [PLAN_FILE]
.claude/knowledge/discoveries/quality_gates/security_ux_gate.sh [PLAN_FILE]
```

### Full Review (for complex plans):  
```bash
# Run complete architectural review discovery
# This discovery prompt coordinates full review including specialist involvement
```

### Emergency Review (post-implementation):
```bash
# When conflicts are discovered after implementation
# Focuses on impact assessment and rapid resolution
```

## Step 8: Service Layer Discovery

Verify existing infrastructure before declaring blockers:

```bash
echo "=== SERVICE LAYER DISCOVERY ==="
echo "--- All Services ---"
find lib -name "*Service.ts" -o -name "*service.ts"

echo "--- Service Methods ---"
for service in lib/**/*Service.ts lib/**/*service.ts; do
  echo "=== $(basename $service) ==="
  grep -n "static.*async\|async.*function" $service | head -10
done

echo "--- Handler → Service Usage ---"
grep -r "Service\." lib/*/handlers/ app/api --include="*.ts" | head -20

echo "--- Direct Prisma (Should Use Service) ---"
grep -r "await prisma\." lib/*/handlers/ app/api --include="*.ts" | grep -v "findUnique.*where.*id" | head -10
echo "Direct Prisma calls (evaluate if should use service layer)"
```

## Step 9: Authorization Helper Pattern Discovery ⭐ NEW 2025-11-02

**Purpose**: Discover authorization helpers and identify DRY violations
**Source**: Week 6 PROJECT_MANAGER authorization (eliminated 4x duplication)

### Find Existing Authorization Helpers

```bash
# Find all authorization helper functions
echo "=== Authorization Helper Functions ==="
find lib -path "*/auth/*-authorization.ts" -o -path "*/auth/*-filter.ts" -type f

# Find helper exports
echo "=== Authorization Helper Exports ==="
grep -rn "export.*function can\|export.*canManage\|export.*function build.*Filter\|export.*function getPOVForAccess" lib/ --include="*.ts"

# Expected helpers (as of April 2026):
# - canManageTeamMembers (lib/pov/auth/team-authorization.ts) — team management
# - buildPOVAccessFilter (lib/pov/auth/pov-access-filter.ts) — multi-POV WHERE clause
# - buildPOVAccessFilterWithRole (lib/pov/auth/pov-access-filter.ts) — filter + isAdmin flag
# - getPOVForAccess (lib/tasks/helpers/pov-access.ts) — direct POV lookup for access validation
# - getTaskWithPOV (lib/tasks/helpers/pov-access.ts) — POV lookup via task relation

# Count helpers
echo "Total authorization helpers: $(find lib -path "*/auth/*-authorization.ts" -o -path "*/auth/*-filter.ts" | wc -l)"
```

### Identify DRY Violations (Duplicated Authorization)

```bash
# Find duplicated owner/admin check pattern
echo "=== Duplicated Authorization Patterns (DRY Violations) ==="

# Pattern 1: Inline owner + admin checks (should use canManageTeamMembers or similar)
grep -rn "const isOwner.*ownerId.*userId" app/api/ lib/*/handlers/ \
  --include="*.ts" -A 3 | grep "isAdmin.*ADMIN.*SUPER_ADMIN" -B 1 | head -30

# Pattern 2: Inline POV access filter (should use buildPOVAccessFilter)
echo "Files with inline POV access filter (DRY violation if not using helper):"
grep -rn "ownerId.*userId.*team.*members.*some" app/api/ --include="*.ts" | \
  grep -v "buildPOVAccessFilter" | wc -l
# Should be 0 — all should use buildPOVAccessFilter from lib/pov/auth/pov-access-filter.ts

# Pattern 3: Inline POV lookup (should use getPOVForAccess)
echo "Inline POV lookups in handlers (DRY violation if not using helper):"
grep -rn "prisma.pOV.findUnique" lib/*/handlers/ --include="*.ts" | \
  grep -v "pov-access" | wc -l
# Should be minimal — most should use getPOVForAccess from lib/tasks/helpers/pov-access.ts

# Pattern 4: Repeated 403 error messages
echo "=== Repeated 403 Error Messages (Indicates Duplication) ==="
grep -rn "status.*403" app/api/ --include="*.ts" -B 5 | \
  grep "error.*owner\|error.*permission" | sort | uniq -c | sort -rn

# If same message appears 2+ times: Consider helper
```

### Audit Helper Usage Consistency

```bash
# For each helper, check all expected usages
echo "=== Authorization Helper Coverage Audit ==="

# Example: canManageTeamMembers
helper_name="canManageTeamMembers"
echo "Helper: $helper_name"

# Find all usages
echo "Usages:"
grep -rn "$helper_name" app/api/ lib/ --include="*.ts" | wc -l

# Find operations that SHOULD use it but don't (inline auth in same domain)
echo "Potential missing usages (inline auth in team domain):"
grep -rn "isOwner.*isAdmin" app/api/pov/*/team/ --include="*.ts" | \
  grep -v "$helper_name"

# Should be 0 (all use helper)
```

### Find Authorization Without Helpers (Should Create?)

```bash
# Find authorization patterns that might need helpers
echo "=== Authorization Patterns That Might Need Helpers ==="

# Group by domain/resource
for domain in pov phase stage task template; do
  echo "=== $domain Authorization ==="

  # Count inline auth checks
  inline_count=$(grep -r "isOwner.*isAdmin" app/api/$domain/ lib/$domain/handlers/ \
    --include="*.ts" 2>/dev/null | wc -l)

  # Count helper usage
  helper_count=$(grep -r "canManage\|can.*$domain" app/api/$domain/ lib/$domain/ \
    --include="*.ts" 2>/dev/null | wc -l)

  echo "  Inline checks: $inline_count"
  echo "  Helper usage: $helper_count"

  if [ "$inline_count" -gt 1 ]; then
    echo "  ⚠️ Consider creating helper (DRY violation)"
  fi
done
```

---

## Step 10: Shared Orchestration Engine Discovery (Jan 2026)

**Purpose**: Discover dual-consumer architecture patterns where JS core serves both MCP and API layers

```bash
echo "=== SHARED ORCHESTRATION ENGINE DISCOVERY ==="

echo "--- Orchestration Engine Core (Pure JS) — CORRECTED 2026-06-11: lives under lib/services/workflow/core/, NEVER at lib/mcp/server/ (phantom path, git -S empty) ---"
ls -la lib/services/workflow/core/orchestration-engine.js
grep -n "class OrchestrationEngine\|async execute(" lib/services/workflow/core/orchestration-engine.js | head -5   # API is OrchestrationEngine.execute(), NOT executeOrchestration()

echo "--- MCP Tool Consumer (JS) ---"
grep -rn "require.*orchestration-engine" lib/mcp/server/tools/hub/workflow-tools-handler.js   # expect 1

echo "--- TS Consumer (REST path goes through this handler) ---"
grep -n "orchestration-engine" lib/services/workflow/handlers/mcpOrchestrationHandler.ts | head -3

echo "--- Named Workflow Support ---"
grep -rn "workflowName" lib/mcp/server/orchestration-engine.js app/api/workflows --include="*.ts" --include="*.js"

echo "--- Workflow REST API Endpoints ---"
ls -la app/api/workflows/**/*.ts 2>/dev/null
find app/api/workflows -name "route.ts" -type f

echo "--- Admin-Only Pattern ---"
grep -rn "allowedRoles.*ADMIN\|UserRole\.ADMIN" app/api/workflows --include="*.ts"

echo "--- MCPWorkflow Database Model ---"
grep -A 20 "model MCPWorkflow" prisma/schema.prisma
```

**Expected Findings** (re-proven 2026-06-11):
- `lib/services/workflow/core/orchestration-engine.js` - Pure JS core, `OrchestrationEngine` class with `validate()` + `execute()`
- MCP Hub consumes via `lib/mcp/server/tools/hub/workflow-tools-handler.js` for services(action: "workflow.execute")
- REST API consumes via `/api/workflows/run/route.ts` → `mcpOrchestrationHandler.ts` (TS, requires the same JS core)
- Both share exact same execution logic
- Admin-only endpoints using `createHandler` with `allowedRoles`

**Architectural Pattern**:
```
Pure JS Engine (lib/services/workflow/core/orchestration-engine.js)
    ├── MCP Consumer (hub/workflow-tools-handler.js)        → services(action: "workflow.execute")
    └── API Consumer (run/route.ts → mcpOrchestrationHandler.ts) → POST /api/workflows/run
```

**Key Insight**: When business logic needs to be shared between JS and TS layers, extract to pure JS and consume from both.

---

## Step 11: MCP Transport Parity Discovery (Feb 2026)

**Purpose**: Verify both MCP transport layers (stdio and HTTP) handle the same methods and resource providers consistently.

**Background**: Feb 26, 2026 smoke test discovered hub resources missing from HTTP transport `resources/list` while stdio transport included them. Also found `hub-resources.js` returning `content` (tool format) instead of `contents` (resource format).

```bash
echo "=== MCP TRANSPORT PARITY DISCOVERY ==="

echo "--- Method handlers in stdio transport ---"
grep -n "setRequestHandler\|ListResourcesRequestSchema\|ReadResourceRequestSchema\|ListToolsRequestSchema\|CallToolRequestSchema\|ListPromptsRequestSchema\|GetPromptRequestSchema" mcp-server-v5.js | head -20

echo "--- Method handlers in HTTP transport (RETARGETED 2026-06-11: methods left mcp-server-http-clean.js in the Wave 6/7 facade extraction) ---"
grep -n "'resources/list'\|'resources/read'\|'tools/list'\|'tools/call'\|'prompts/list'\|'prompts/get'" lib/mcp/server/mcp-methods.ts lib/mcp/server/mcp-core.ts lib/mcp/server/routes/mcp-transport-routes.ts | head -20

echo "--- Hub resources integration (lives ONLY in mcp-server-v5.js; HTTP reaches it through the wrapped v5 instance that MCPCoreManager.processRequest dispatches into) ---"
grep -cn "HubResourceProvider" mcp-server-v5.js   # expect 2 (require + instantiation)

echo "--- Resource response format compliance ---"
echo "Resources MUST use 'contents' (plural): [{uri, mimeType, text}]"
echo "Tools MUST use 'content' (singular): [{type, text}]"
grep -n "contents:\|content:" lib/mcp/server/resources/*.js | head -20

echo "--- Feature flags parity ---"
grep -n "featureFlags.enable\|featureFlags.isEnabled" mcp-server-v5.js | head -10
grep -n "featureFlags" lib/mcp/server/config/feature-flags.js | head -5
```

**Expected Findings**:
- Both transports handle: `resources/list`, `resources/read`, `tools/list`, `tools/call`, `prompts/list`, `prompts/get`
- Both include hub resources in `resources/list`
- All resource providers return `contents` (plural), all tool handlers return `content` (singular)
- Feature flags are registered in `feature-flags.js` for all flags that `mcp-server-v5.js` enables

**Red Flags**:
- ⚠️ Method handled in one transport but not the other
- ⚠️ Resource provider included in one `resources/list` but not the other
- ⚠️ `content` (singular) in resource handlers or `contents` (plural) in tool handlers
- ⚠️ `featureFlags.enable('X')` where X is not registered in `feature-flags.js`

---

Remember: The goal is preventing Plan 11-type semantic conflicts through systematic, proactive architectural review that's fast enough to be practical but thorough enough to catch real issues.