# Specialist Review Protocol
**Version**: 1.2
**Created**: 2025-10-28
**Updated**: 2026-04-20 (3 durable lessons from Apr 2026 race-fix + pipeline-context sessions)
**Purpose**: Standardize multi-specialist review process for quality assurance

**What's New in v1.2** (2026-04-20):
- ✅ **Boundary-contract as standing roster** for plans crossing >2 user-facing error surfaces (MCP + SSE + HTTP + error.json + client library). The Apr 2026 race-fix review caught 4 CRITICAL shape-contract bugs that 5 prior specialists missed because the bugs lived BETWEEN their domain scopes.
- ✅ **Prod EXPLAIN during P0 (not post-deploy)**: schema-change reviews should run EXPLAIN against prod via `BEGIN/ROLLBACK` during review. Database-manager's Apr 2026 A6 review landed at 97% confidence by measuring real buffer counts pre/post-index — not projecting from theory.
- ✅ **Post-edit confidence projection**: arch-review synthesis now emits BOTH pre-edit and post-edit-projection numbers. The projection is the rubric for "is re-review needed?" — if the delta doesn't clear the protocol target, edits aren't sufficient and a second round is warranted.

**What's New in v1.1** (2026-01-30):
- ✅ **Phase 0: Current State Validation** - Mandatory before all reviews
- ✅ **Production Token Inspection** - Required for auth/security changes
- ✅ **Cross-Reference Discovery** - Grep for all variations of critical values
- ✅ **Negative Testing** - Verify invalid cases are rejected
- ✅ **New Pitfall #0**: Reviewing plans without validating current state

---

## Executive Summary

This protocol defines **when, how, and which specialists to consult** for code changes, new features, and architectural decisions. Based on proven success from October 27-28, 2025 sessions where multi-specialist reviews achieved **87% → 95% confidence jumps** and caught critical issues before implementation.

**Key Principle**: **Multiple specialist perspectives prevent blind spots and catch critical issues early.**

---

## Phase 0: Current State Validation (MANDATORY)

**Added**: 2026-01-30
**Reason**: Phase 3 JWT reviews missed audience mismatch because specialists reviewed the PLAN without validating current implementation works.

### **CRITICAL REQUIREMENT: Test Current Implementation BEFORE Reviewing Changes**

**For ALL specialist reviews (especially security, auth, API, database changes):**

#### Step 0.1: Validate Current State Works
```bash
# Before reviewing proposed changes, verify current implementation works
# Example for auth changes:

# 1. Test all authentication flows
- [ ] Web login works
- [ ] MCP OAuth works (ChatGPT, Claude Desktop)
- [ ] API key authentication works

# 2. Decode actual production tokens
- [ ] Web user tokens: What are the claims? (aud, iss, scope, etc.)
- [ ] MCP OAuth tokens: What are the claims?
- [ ] API key tokens: What are the claims?

# 3. Verify validation code accepts ALL token types
- [ ] Grep for all audience validation logic
- [ ] Test each token type against validation
- [ ] Identify any mismatches
```

#### Step 0.2: Cross-Reference All Critical Values
```bash
# For any change involving claims, configuration values, or contracts

# Example for audience claims:
grep -rn "audience\|\.aud" --include="*.ts" --include="*.js" lib/ app/

# Document ALL variations found:
- Where each value is used
- Why it's different (if multiple values)
- Which code paths validate which values
```

#### Step 0.3: Production Runtime Verification
```bash
# Don't assume - verify with production data

# For auth changes: Check actual tokens from logs
ssh root@production "tail -200 /var/log/paichart/mcp-combined-0.log | grep 'JWT\|token'"

# For API changes: Check actual responses
curl -H "Authorization: Bearer $TOKEN" https://paichart.app/api/endpoint | jq

# For database changes: Check actual data
ssh root@production "psql -U paichart -d paichart_production -c 'SELECT * FROM Table LIMIT 5'"
```

#### Step 0.3a: Prod EXPLAIN During Review ⭐ NEW v1.2 (for schema changes)

For database-manager reviews of any plan that adds an index or changes a query, run `EXPLAIN (ANALYZE, BUFFERS)` against prod INSIDE a `BEGIN/ROLLBACK` transaction DURING the review — not post-deploy. Measures real buffer counts and execution time on real data, catches "this index wouldn't help this query shape" before implementation.

```bash
ssh <PROD_USER>@<PROD_HOST> "cd /var/www/paichart-app/current && source .env.production && psql \"\$DATABASE_URL\" <<'SQL'
BEGIN;
-- Simulate the proposed index WITHOUT leaving it behind
CREATE INDEX CONCURRENTLY test_idx_<name> ON <table> (<cols>) WHERE <predicate>;
ANALYZE <table>;

-- Then EXPLAIN the query(ies) the plan claims will benefit
EXPLAIN (ANALYZE, BUFFERS) <the-query>;

ROLLBACK;
SQL
"
```

Note: `CREATE INDEX CONCURRENTLY` cannot be inside a transaction. Use plain `CREATE INDEX` for the review (builds in seconds on most tables, and gets rolled back anyway). Rollback is non-blocking.

**Session evidence (Apr 2026 A6 review)**: database-manager measured `agentExecutionConfigBuilder.ts:190` at 67 shared buffer hits (seq-scan on 358 rows). Post-test-index: 4 buffer hits (index-scan). That measurement turned a "probably worth it" theoretical claim into a 97% confidence "ship it" — and caught a plan citation error (`taskReadyReactorService.ts:98` was mislisted as a beneficiary; its `$queryRaw` doesn't use the JSONB predicate).

**When to use**: any database-schema review adding or changing an index. Not required for data-only changes (new columns, enum values, etc.).

#### Step 0.4: Negative Testing
```bash
# Verify that invalid cases are properly rejected

# Example for auth:
- [ ] Invalid audience should be rejected
- [ ] Expired tokens should be rejected
- [ ] Wrong issuer should be rejected
- [ ] Missing claims should be rejected
```

### **Why Phase 0 Matters: Real Example**

**Phase 3 JWT Reviews (2026-01-24)** - Missed audience mismatch:
- ✅ Reviewed multi-key JWKS plan (excellent reviews, 93% confidence)
- ❌ Did NOT test current RS256 tokens work for MCP OAuth
- ❌ Did NOT decode production MCP OAuth tokens
- ❌ Did NOT grep for all audience values
- ❌ Assumed Phase 2 implementation was working

**Result**: Deployed to production, ChatGPT write operations failed for weeks

**If Phase 0 had been followed**:
```bash
# Step 0.2 would have found:
grep -rn "audience" lib/auth/ mcp-server-http-clean.js

Results:
- mcp-server-http-clean.js:614: audience: 'https://paichart.app/mcp'
- token-manager.ts:86: .setAudience('paichart-api')
- token-manager.ts:176: if (decoded.aud !== 'paichart-api')

# ← MISMATCH DETECTED! Would have been caught before Phase 3 review
```

**Time Cost**:
- Phase 0 validation: 30 minutes
- Debugging production issue: 2+ hours
- **ROI**: 4x time saved + prevented production outage

---

## When to Request Specialist Reviews

### **Always Required** (Mandatory Reviews)

#### 1. Major Features (>2 Hour Implementation)
**Definition**: Any feature requiring more than 2 hours of implementation time.

**Minimum Specialists Required**: 3
- **Always include**: boundary-contract-specialist (data safety)
- **Always include**: architectural-review-specialist (design fit)
- **Domain-specific**: 1-3 specialists based on feature area (see matrix below)

**Example**: Analytics tab enhancement (Oct 27, 2025)
- 6 specialists consulted
- 87% initial confidence → 95% final confidence
- Caught 4 critical issues before implementation

---

#### 2. Database Schema Changes
**Definition**: Migrations, new models, index additions, field changes.

**Minimum Specialists Required**: 2
- **Always include**: database-manager-specialist
- **Always include**: architectural-review-specialist

**Optional but Recommended**:
- metadata-tenant-preservation-specialist (if affects tenant isolation; multi-tenancy-specialist RETIRED 2026-06-11 — roadmap library at domain/db/multi-tenancy-roadmap-library.md)
- performance-analyst-specialist (if performance-critical)

**Example**: P0 Database Indices (Oct 28, 2025)
- database-manager-specialist: 92% confidence
- architectural-review-specialist: 92% confidence
- Caught 3 critical fixes (Prisma syntax, CONCURRENTLY)

---

#### 3. Security Changes
**Definition**: Authentication, authorization, access control, data validation.

**Minimum Specialists Required**: 3
- **Always include**: sec-ops-specialist
- **Always include**: boundary-contract-specialist
- **Always include**: validation-engine-specialist

**MANDATORY Phase 0 Requirements for Auth/Security Changes** (Added 2026-01-30):
1. **Decode all production tokens** - Web, MCP OAuth, API keys
2. **Cross-reference all claim values** - aud, iss, scope, azp, etc.
3. **Test all auth flows** - Verify current implementation works
4. **Grep for validation logic** - Find all places that check claims
5. **Negative testing** - Verify invalid tokens are rejected

**Example**: POV Launch Security Fix (Oct 28, 2025)
- Closed CRITICAL data leakage vulnerability
- Multi-specialist review prevented regression

**Example**: Phase 3 JWT Reviews (2026-01-24) - **LESSON LEARNED**
- ❌ Reviewed plan without validating current state
- ❌ Missed audience mismatch (MCP OAuth tokens incompatible)
- ✅ Would have been caught with Phase 0 validation

---

#### 4. API Changes (Breaking or High-Traffic)
**Definition**: Changes to existing APIs, especially breaking changes or high-traffic endpoints.

**Minimum Specialists Required**: 3
- **Always include**: api-efficiency-specialist
- **Always include**: boundary-contract-specialist
- **Always include**: architectural-review-specialist

**Optional**:
- types-system-specialist (if schema changes)
- validation-engine-specialist (if input/output validation)

**Example**: P0 + P1 API Fixes (Oct 28, 2025)
- 9 APIs optimized
- 5 specialists consulted
- 95% overall confidence

---

### **Recommended** (Strongly Suggested)

#### 5. Complex State Management
**Definition**: Changes to reducers, context, complex UI state.

**Recommended Specialists**: 2
- architectural-review-specialist
- boundary-contract-specialist

**Example**: POV Form Validation Fix (Oct 27, 2025)
- validation-engine-specialist: Identified 6 root causes
- architectural-review-specialist: Recommended Option A (95% vs 76%)

---

#### 6. Multi-Tenant Features
**Definition**: Any feature that handles POV isolation, tenant scoping, or cross-tenant concerns.

**Recommended Specialists**: 2
- multi-tenancy-specialist
- database-manager-specialist

**Example**: Task Model Audit (Oct 28, 2025)
- multi-tenancy-specialist: Found CRITICAL gap (8.2/10 risk)
- Identified missing tenantId column

---

#### 7. Performance-Critical Code
**Definition**: Code in hot paths, frequent queries, large data processing.

**Recommended Specialists**: 2
- performance-analyst-specialist
- api-efficiency-specialist

**Optional**:
- database-manager-specialist (if database queries involved)

---

### **Optional** (Use Judgment)

#### 8. Bug Fixes
**Small bug fixes** (<30 min): No specialist review required

**Complex bug fixes** (>30 min, affects multiple files):
- Consider architectural-review-specialist
- Consider domain specialist (e.g., validation-engine for validation bugs)

#### 9. Documentation Changes
**No specialist review required** unless documenting complex architectural decisions.

#### 10. Minor UI Tweaks
**No specialist review required** unless state management or API changes involved.

---

## Specialist Selection Matrix

Use this matrix to choose the right specialists for your task:

| Task Domain | Primary Specialist | Supporting Specialists | Confidence Target |
|-------------|-------------------|----------------------|-------------------|
| **Database Schema** | database-manager | architectural-review, multi-tenancy | 90%+ |
| **API Efficiency** | api-efficiency | boundary-contract, architectural-review | 92%+ |
| **Security/Auth** | sec-ops | validation-engine, boundary-contract | 95%+ |
| **Validation** | validation-engine | types-system, boundary-contract | 95%+ |
| **Multi-Tenant** | multi-tenancy | database-manager, auth-permissions | 85%+ |
| **State Management** | architectural-review | boundary-contract | 90%+ |
| **Performance** | performance-analyst | api-efficiency, database-manager | 92%+ |
| **MCP Integration** | mcp-integration | anthropic-mcp-sdk-guru | 90%+ |
| **Event Systems** | event-system | integration-manager | 90%+ |
| **OAuth/Auth** | oauth-multi-provider | sec-ops, auth-permissions | 95%+ |
| **Agent Templates** | template-system | prompt-construction | 90%+ |
| **Browser Automation** | browser-automation | integration-manager | 85%+ |
| **Deployment** | dev-ops | database-manager, architectural-review | 95%+ |
| **Multi-Surface Error** ⭐ NEW v1.2 | **boundary-contract** | api-efficiency, architectural-review | 92%+ |

### Boundary-Contract Standing-Roster Rule ⭐ NEW v1.2

**Always include `boundary-contract-specialist` on the initial review roster when a plan changes OR adds >2 of these user-facing error/response surfaces**:

- MCP handler throw path (clients expect `.code` discriminator)
- SSE stream `error` event emissions (shape must match GUI `sseUtils` consumer)
- HTTP REST responses (must follow `createHandler` `{error:{message,code}}` convention)
- `error.json` artifact content (read by GUI banners via `execution.errorCategory`)
- Client library error parsing (e.g. `lib/pov/api/agent-service.ts` consumers)
- Webhook / external integration payloads

**Rationale**: Shape bugs BETWEEN surfaces are invisible to single-domain specialists (their scope is their surface, not the contract across surfaces). Apr 2026 race-fix review caught 4 CRITICAL such bugs — all from boundary-contract added LATE as a gate. Standing-roster adoption shifts that catch earlier in the review cycle.

**Session evidence**: 2026-04-18 race-fix plan. 5 domain specialists (93-97%) missed:
1. SSE payload shape incompatible with GUI's `sseUtils.processSSEStream` switch on `event.data.type === 'error'` (proposed `event: error` named line doesn't route)
2. Writer-scope bug: `createAgentExecution` fires OUTSIDE the SSE IIFE where `writer` is defined — a `writer.write()` in the catch would have crashed at runtime
3. HTTP 409 via `NextResponse.json` bypassed `createHandler`'s return-shape convention
4. MCP error thrown as plain `new Error` lost the `.code` discriminator

---

## Confidence Threshold Guidelines

### **Confidence Scoring Scale**

**< 75%**: **Needs Revision** ❌
- Plan has significant gaps or risks
- Critical issues identified
- **Action**: Revise plan, add mitigations, consult additional specialists

**75-85%**: **Proceed with Caution** ⚠️
- Plan is acceptable but has concerns
- Some issues identified but not critical
- **Action**: Address concerns, add monitoring, document risks

**85-92%**: **Good to Proceed** ✅
- Plan is solid with minor improvements possible
- No critical issues
- **Action**: Apply recommended improvements, proceed with implementation

**92-100%**: **Production-Ready** ✅✅
- Plan is excellent with comprehensive review
- All concerns addressed
- **Action**: Proceed with confidence, minimal changes needed

### **Confidence Score Examples from October 28, 2025**

**P0 Implementation Plan**:
- discovery-scout: 95% (excellent plan)
- database-manager: 92% (found 3 critical fixes)
- architectural-review: 92% (validated patterns)
- dev-ops: 95% (production strategy)
- **Final**: 95% production-ready

**Multi-Specialist Success Pattern**:
- Initial plan: 90%
- After 1 specialist: 92% (+2%)
- After 2 specialists: 93% (+1%)
- After 3 specialists: 95% (+2%)
- **Trend**: Diminishing returns after 3-4 specialists

### **Post-Edit Confidence Projection** ⭐ NEW v1.2

Arch-review synthesis should emit **two** numbers, not one:

1. **Pre-edit consolidated confidence** — weighted or simple average of specialist scores AT REVIEW TIME, before the plan is revised
2. **Post-edit projection** — arch-review's informed estimate of what the score BECOMES after the recommended edits are folded into the plan

**Why both**: the protocol target is a rubric for "is the plan ready?" — not "was the initial draft good?" A plan at 88% pre-edit with 4 ship-blocking fixes and a 95% post-edit projection is MORE ready to ship than a plan at 91% pre-edit with no edits proposed (the former has caught + addressed its bugs; the latter may still have them).

**Re-review gate**: a re-review round is warranted ONLY if the post-edit projection DOESN'T clear the protocol target. If edits are projected to get you to the target, arch-review synthesis is the final gate and implementation proceeds. Don't burn a second review round for mechanical edits.

**Session evidence**:
- **Apr 2026 race-fix plan**: 5 specialists averaged 93.4% pre-edit. Boundary-contract (added late) dropped to 88% on its axis. Weighted consolidated: 92%. Post-edit projection after folding 4 CRITICAL + 3 IMPORTANT edits: 95%. No re-review needed; shipped.
- **Apr 2026 pipeline-context plan**: 5 specialists averaged 93.6% pre-edit. 12 edits folded (5 ship-block + 4 polish + 3 optional). Post-edit projection: 95.5%. No re-review; shipped.

**Weighting by blast radius** (optional):
```
weighted_score = Σ (specialist_score_i × axis_weight_i) / Σ (axis_weight_i)
```
Axis weight reflects how much of the plan's failure modes the specialist covers (a specialist reviewing 1.4 × the typical scope gets 1.4 weight). Default weights are 1.0; only deviate when a specialist's axis genuinely dominates or recedes.

---

## Review Request Process

### Step 0: Current State Validation (NEW - MANDATORY)

**Before creating review request, validate current implementation:**

#### For Authentication/Authorization Changes:
```bash
# 1. Test all auth flows work currently
npm run dev  # Test locally
npm run mcp:http:dev  # Test MCP server

# 2. Decode production tokens from ALL flows
node -e "
const token = 'ACTUAL_PRODUCTION_TOKEN';
const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
console.log('Claims:', JSON.stringify(payload, null, 2));
"

# 3. Cross-reference all critical values
grep -rn "audience\|\.aud" --include="*.ts" --include="*.js" lib/ app/ mcp-server*.js

# 4. Document ALL variations found
# Create: /cline_docs/current-state-validation-{feature}-{date}.md
```

#### For API Changes:
```bash
# 1. Test all affected endpoints work currently
curl -H "Authorization: Bearer $TOKEN" https://paichart.app/api/endpoint

# 2. Document actual responses (not assumed)
# 3. Compare to Zod schemas
# 4. Grep for all validation logic
```

#### For Database Changes:
```bash
# 1. Query production database for actual data
ssh root@production "psql -U paichart -d paichart_production -c 'SELECT * FROM Table LIMIT 5'"

# 2. Verify constraints and indexes
# 3. Check for data quality issues
```

**Deliverable**: `/cline_docs/current-state-validation-{feature}-{date}.md`

**Time**: 15-30 minutes (saves 2+ hours debugging later)

---

### Step 1: Create Review Request

Use the review request template (see `/cline_docs/templates/specialist-review-request.md`):

```markdown
# [Feature Name] Specialist Review Request

## Feature Overview
- **Description**: [Brief description]
- **Estimated Effort**: [Hours]
- **Impact**: [Performance/Security/UX]
- **Implementation Plan**: [Link to plan document]

## Specialists to Consult
- [ ] [primary-specialist] (required)
- [ ] [supporting-specialist-1] (required)
- [ ] [supporting-specialist-2] (optional)

## Review Questions
1. Confidence score (0-100%)?
2. Critical issues found?
3. Recommended changes?
4. Implementation readiness?

## Context Documents
- Implementation plan: [link]
- Related features: [links]
- API documentation: [links]
```

---

### Step 1.5: Organize Review Artifacts

**Directory Structure**: All review artifacts should be organized in a dedicated subdirectory.

**Location**: `/cline_docs/reviews/{feature-name}-{YYYY-MM-DD}/`

**Required Files**:
```
/cline_docs/reviews/{feature-name}-{YYYY-MM-DD}/
  ├── review-request.md                    # Initial request (from template)
  ├── {specialist-1}-analysis.md           # First specialist review
  ├── {specialist-2}-review.md             # Second specialist review
  ├── {specialist-3}-review.md             # Third specialist review
  ├── confidence-assessment.md             # Final confidence scores
  └── implementation-plan.md               # Updated plan (if applicable)
```

**Naming Convention**:
- **Directory**: `{feature-name}-{YYYY-MM-DD}`
  - Example: `fuzzy-search-fix-2025-10-29`
  - Example: `multi-tenant-security-2025-10-30`
  - Example: `api-efficiency-audit-2025-10-28`

**Benefits**:
- ✅ **All artifacts in one place** - Easy reference for future work
- ✅ **Date-based organization** - Chronological tracking
- ✅ **Reusable pattern** - Every review follows same structure
- ✅ **Historical record** - Learn from past reviews
- ✅ **Clear handoff** - "See reviews/{feature-date}/"

**Example Usage**:
```bash
# Create new review directory
mkdir -p cline_docs/reviews/fuzzy-search-fix-2025-10-29

# Copy template
cp cline_docs/templates/specialist-review-request.md \
   cline_docs/reviews/fuzzy-search-fix-2025-10-29/review-request.md

# Fill in details and start review process
```

**Template Updates**:
All templates now include "Save this file to" instructions:
- `Save to: /cline_docs/reviews/{feature-date}/review-request.md`

---

### Step 2: Consult Specialists (Parallel Recommended ⚡)

---

#### 🔍 **Discovery Prompt Requirement (CRITICAL)**

**MANDATORY: Each specialist MUST run their discovery prompt before conducting reviews.**

**Why This is Critical**:
- ✅ **Context Boost**: 70-80% confidence → 90-95% confidence with full context
- ✅ **Integration Awareness**: Discovers cross-system dependencies reviews might miss
- ✅ **Systematic Mapping**: Provides architecture overview before detailed analysis
- ✅ **Prevents Blind Spots**: "Looks good in isolation, breaks in integration" bugs

**How to Ensure Discovery is Run**:

**Step 1**: Verify specialist has discovery prompt
```bash
# Check specialist agent file for discovery section
grep "## My Discovery Prompt" .claude/agents/[specialist-name].md

# Verify discovery file exists
ls .claude/knowledge/discoveries/[specialist-discovery].md
```

**Step 2**: Explicitly instruct specialist to run discovery FIRST
```markdown
Please use [specialist-name] to review [FEATURE].

CRITICAL INSTRUCTION:
1. FIRST: Run your discovery prompt at:
   `/.claude/knowledge/discoveries/[specialist-discovery].md`

2. Map current architecture, integration points, and existing patterns

3. THEN: Conduct your specialist review citing discovery findings

4. Reference specific files/lines from discovery in your analysis

Expected confidence: 92-95% with full discovery context
```

**Step 3**: Validate discovery was executed
- [ ] Review output mentions "discovery findings" or "mapped architecture"
- [ ] Specific file paths and line numbers cited (from discovery)
- [ ] Integration points identified and analyzed
- [ ] Confidence score ≥ 90% (full context achieved)

**Red Flags** (Discovery may NOT have been run):
- ❌ Generic recommendations without file/line references
- ❌ Confidence score < 85% (insufficient context)
- ❌ No mention of integration points or dependencies
- ❌ "Should verify X exists" instead of "X exists at path Y"

**Example: With Discovery vs Without**

**WITHOUT Discovery** (70-80% confidence):
```
Recommendation: Verify toast infrastructure exists
Confidence: 80% (assumed infrastructure)
```

**WITH Discovery** (90-95% confidence):
```
Discovery Finding: Toast infrastructure exists at /lib/hooks/useToast.ts
Evidence: Used in 23 components following pattern:
  - Line 12: import { toast } from '@/lib/hooks/useToast'
  - Line 45: toast({ title, description, variant })
Recommendation: Follow existing pattern (95% confidence)
```

**Quality Difference**:
- Context: Generic assumptions → Specific code locations
- Confidence: 80% → 95% (+15 percentage points)
- Findings: "Should check" → "Found at X, pattern is Y"

---

**RECOMMENDED: Run Specialists in Parallel** (4x Faster!)

**Why Parallel**:
- ✅ **Speed**: 4 specialists in 2 hours vs 8 hours sequential
- ✅ **Independent perspectives**: No bias from seeing others' reviews
- ✅ **Proven effective**: Week 1-7 reviews (Oct 29, 2025) - 28 specialists run successfully
- ✅ **Easy execution**: Use Task tool with multiple invocations in single message

**How to Run Parallel Reviews**:

Use Claude Code's Task tool with **multiple specialist invocations in ONE message**:

```markdown
Please run these 4 specialists in parallel for Week 1 review:

[Then use Task tool 4 times in one response]
- sec-ops-specialist
- validation-engine-specialist
- architectural-review-specialist
- api-efficiency-specialist
```

**Example from Week 1-7 Reviews** (Oct 29, 2025):
- 4 specialists per week × 7 weeks = 28 total reviews
- All run in parallel (4 at a time)
- Each batch: ~2 hours instead of ~8 hours
- Result: 80.46% → 91.86% confidence across all weeks

---

**ALTERNATIVE: Sequential Order** (Use if specialists need to build on each other)

**Sequential Order**:

1. **Discovery-Scout First** (if complex/unknown feature)
   - Maps architecture
   - Identifies integration points
   - Creates initial implementation plan
   - **Output**: 90-95% confidence plan

2. **Domain Specialists** (run in parallel)
   - sec-ops-specialist (security)
   - validation-engine-specialist (schemas)
   - api-efficiency-specialist (queries)
   - database-manager-specialist (if DB changes)
   - **Output**: 85-95% confidence each

3. **Architectural-Review Specialist** (last)
   - Reviews all domain findings
   - Validates pattern consistency
   - Final production-ready assessment
   - **Output**: Consolidated confidence score

**When to Use Sequential**:
- Discovery needed first (complex unknown features)
- Architectural review should see domain findings
- Building on previous specialist insights

**When to Use Parallel** (MOST CASES):
- Plan already exists (just reviewing)
- Specialists reviewing independent concerns
- Want results faster (4x speedup)

---

**Default Recommendation**: ⚡ **PARALLEL** for speed and independent perspectives

---

### Step 3: Apply Recommendations

**For Each Specialist's Findings**:

1. **Categorize Issues**:
   - **Critical** (must fix before implementation)
   - **Important** (should fix, or document why not)
   - **Nice-to-have** (optional enhancements)

2. **Apply Critical Fixes** to plan
3. **Document Important Issues** as technical debt if not fixing
4. **Consider Nice-to-haves** based on time/complexity trade-off

---

### Step 4: Achieve Confidence Threshold

**Target Confidence**: 90%+ for major features

**If Confidence < 90%**:
- Consult additional specialist
- Revise implementation approach
- Add more mitigations
- Simplify complex parts

**Example** (Oct 28, 2025 - P0 Plan):
- Initial: 95% (discovery-scout)
- After database-manager: 92% (found critical issues, justified the drop)
- After fixes applied: Back to 95%
- After architectural-review: 92% (realistic assessment)
- After dev-ops: 95% (production-ready)

---

## Multi-Specialist Coordination

### When to Use Multiple Specialists

**2 Specialists**: Standard for most features
- Covers 2 perspectives (e.g., technical + architectural)
- 90-95% confidence achievable

**3-4 Specialists**: Complex features or high-risk changes
- Covers multiple dimensions (technical + architectural + security)
- 92-98% confidence achievable
- **Optimal**: Diminishing returns after 4 specialists

**5+ Specialists**: Critical features with cross-cutting concerns
- Example: Analytics tab (Oct 27) - 6 specialists
- Example: P0 Fixes (Oct 28) - 4 specialists + 1 verification
- 95%+ confidence, catches edge cases

### Coordination Pattern

**Sequential Reviews** (Recommended):
```
1. discovery-scout → Creates plan (95%)
2. domain-specialist → Reviews plan (90%)
3. boundary-contract → Validates data safety (93%)
4. architectural-review → Final validation (92%)
```

**Parallel Reviews** (For Independent Concerns):
```
Parallel:
- database-manager (schema review)
- performance-analyst (query review)
- types-system (type safety review)

Then: architectural-review (synthesize findings)
```

---

## Specialist Review Template Usage

### Template 1: Review Request
**When**: Starting a review process
**File**: `/cline_docs/templates/specialist-review-request.md`
**Purpose**: Standardize review requests

**Usage**:
```bash
# Copy template
cp cline_docs/templates/specialist-review-request.md \
   cline_docs/reviews/[feature-name]-review-request.md

# Fill in details
# Request reviews from specialists
```

---

### Template 2: Confidence Assessment
**When**: Recording specialist feedback
**File**: `/cline_docs/templates/specialist-confidence-assessment.md`
**Purpose**: Track confidence scores and findings

**Usage**:
```markdown
# [Feature] Confidence Assessment

| Specialist | Score | Critical Issues | Recommendations |
|------------|-------|-----------------|-----------------|
| discovery-scout | 95% | None | Consider edge case X |
| database-manager | 92% | Found syntax error | Apply fix Y |
| architectural-review | 92% | None | Document decision Z |

**Overall Confidence**: 93% (weighted average)
**Recommendation**: Proceed with fixes applied
```

---

### Template 3: Multi-Specialist Coordination
**When**: Managing complex reviews with 3+ specialists
**File**: `/cline_docs/templates/multi-specialist-coordination.md`
**Purpose**: Coordinate multiple specialist reviews

**Usage**:
```markdown
# [Feature] Multi-Specialist Coordination

## Review Sequence
1. [x] discovery-scout (95%) - Plan created
2. [x] database-manager (92%) - 3 fixes applied
3. [ ] architectural-review (pending)
4. [ ] performance-analyst (pending)

## Consolidated Findings
[Merge findings from all specialists]

## Action Plan
[Prioritized fixes based on all feedback]
```

---

## Success Patterns from October 27-28, 2025

### Pattern 1: Discovery-First Workflow

**What**: Always start with discovery-scout for complex features

**Why**:
- Maps architecture before changes
- Identifies integration points
- Creates detailed implementation plan
- Achieves 90-95% initial confidence

**Example**: P0 Implementation Plan
- discovery-scout investigated 7 files (4,500+ lines)
- Created plan with exact line numbers
- 95% confidence → mechanical execution

---

### Pattern 2: Database-Manager for All Schema Changes

**What**: Consult database-manager for ANY schema, query, or index changes

**Why**:
- Catches Prisma syntax errors
- Validates index design
- Estimates performance impact
- Recommends production safety (CONCURRENTLY)

**Example**: P0 Database Indices
- Caught spread operator syntax error (100% failure prevented)
- Recommended CONCURRENTLY for zero-downtime
- Validated 10-50x performance claims

---

### Pattern 3: Architectural-Review as Final Gate

**What**: Always finish with architectural-review for major features

**Why**:
- Validates alignment with codebase principles
- Checks pattern consistency
- Reviews long-term maintainability
- Provides final confidence score

**Example**: P0 Plan Final Review
- Validated "Simple & Reliable" alignment: 96%
- Confirmed pattern consistency: 96%
- Final confidence: 92% (production-ready)

---

### Pattern 4: Boundary-Contract for Data Transformations

**What**: Consult boundary-contract when data crosses system boundaries

**Why**:
- Prevents field leakage bugs
- Validates data completeness
- 5-minute comparative analysis (vs hours of debugging)

**Boundaries to Check**:
- JWT ↔ User object
- API response ↔ Frontend state
- Database ↔ Code types
- MCP ↔ API integration

---

### Pattern 5: Validation-Engine for All Input/Output

**What**: Consult validation-engine for client/server validation logic

**Why**:
- Ensures validation at all layers
- Catches schema drift
- Prevents type safety gaps

**Example**: Analytics Response Validation (Oct 27)
- Found schema expected 8 fields, API returned 4
- Would have caused 100% validation failure
- Caught during types-system review

---

### Pattern 6: API-Efficiency for Query Optimization

**What**: NEW (Oct 28) - Consult api-efficiency-specialist for API design

**Why**:
- Identifies missing scopes (POV/team/user)
- Catches N+1 query patterns
- Validates index coverage
- Ensures backward compatibility

**Example**: P0 + P1 API Audit (Oct 28)
- Audited 182 endpoints
- Found 50 issues (5 P0, 10 P1, 35 P2/P3)
- Created prioritized fix roadmap
- 95% confidence implementation plan

---

### Pattern 7: Multi-Tenancy for Isolation Concerns

**What**: NEW (Oct 28) - Consult metadata-tenant-preservation-specialist for tenant isolation (multi-tenancy-specialist RETIRED 2026-06-11; re-create from its roadmap library when multi-tenancy activates)

**Why**:
- Identifies cross-tenant data leaks
- Validates tenantId patterns
- Ensures POV isolation
- Catches security vulnerabilities

**Example**: Task Model Audit (Oct 28)
- Found CRITICAL gap: Task lacks tenantId
- Risk score: 8.2/10
- 23-hour remediation plan created

---

## Quality Gates and Confidence Thresholds

### Feature Implementation Quality Gates

**Gate 1: Discovery Phase** (Required for >2hr features)
- **Deliverable**: Implementation plan with architecture map
- **Minimum Confidence**: 85%
- **Specialists**: discovery-scout
- **Pass Criteria**: Integration points identified, plan has exact line numbers

**Gate 2: Domain Review** (Required for >2hr features)
- **Deliverable**: Domain-specific validation
- **Minimum Confidence**: 85%
- **Specialists**: 1-2 domain specialists (database, API, validation, etc.)
- **Pass Criteria**: No critical issues OR critical issues have fixes

**Gate 3: Architectural Review** (Required for >2hr features)
- **Deliverable**: Architectural alignment validation
- **Minimum Confidence**: 90%
- **Specialists**: architectural-review-specialist
- **Pass Criteria**: Aligns with "Simple & Reliable", pattern consistency >90%

**Gate 4: Implementation Ready** (All major features)
- **Deliverable**: Final implementation plan with all fixes
- **Minimum Confidence**: 90%
- **Specialists**: All previous reviews complete
- **Pass Criteria**: All critical issues addressed, rollback plan exists

---

## Handling Low Confidence Scores

### If Specialist Returns < 75% Confidence

**Immediate Actions**:
1. **Stop implementation** - Do not proceed with low confidence
2. **Review critical findings** - Understand root issues
3. **Consult additional specialist** - Get second opinion
4. **Revise approach** - Consider simpler alternatives

**Example Decision Tree**:
```
Confidence < 75%
├─> Critical security issues?
│   ├─> YES: Consult sec-ops + architectural-review
│   └─> NO: Continue to next check
├─> Critical performance issues?
│   ├─> YES: Consult performance-analyst + database-manager
│   └─> NO: Continue to next check
├─> Critical architectural conflicts?
│   ├─> YES: Simplify approach, consult architectural-review again
│   └─> NO: Apply fixes and re-review
```

---

### If Specialist Returns 75-85% Confidence

**Actions**:
1. **Review findings** carefully
2. **Apply recommended fixes**
3. **Add monitoring** for identified risks
4. **Document trade-offs** in ADR
5. **Consider re-review** after fixes

**Proceed if**:
- All critical issues have fixes
- Important issues documented
- Monitoring in place for risks

---

### If Specialist Returns 85-92% Confidence

**Actions**:
1. **Apply recommended improvements** (if time permits)
2. **Document any remaining concerns**
3. **Proceed with implementation**

**Typical at this level**:
- Minor improvements suggested
- No critical blockers
- Production-ready with small enhancements

---

### If Specialist Returns 92-100% Confidence

**Actions**:
1. **Proceed immediately** with implementation
2. **Consider optional enhancements** if time permits
3. **Use as reference** for future similar features

**Typical at this level**:
- Excellent plan quality
- Comprehensive review
- Minimal or no changes needed

---

## Proven Multi-Specialist Workflows

### Workflow 1: Major Feature Implementation

**Used for**: Analytics Tab Enhancement (Oct 27, 2025)

**Sequence**:
```
1. discovery-scout (95%)
   ↓ [creates detailed plan]

2. types-system-specialist (90%)
   ↓ [validates schemas]

3. phase-stage-specialist (85%)
   ↓ [reviews phase integration]

4. boundary-contract-specialist (92%)
   ↓ [validates data flow]

5. performance-analyst-specialist (95%)
   ↓ [optimizes queries]

6. architectural-review-specialist (92%)
   ↓ [final validation]

Result: 95% confidence, production-ready
```

**Lessons**:
- 6 specialists provided comprehensive coverage
- Each caught different issues
- Final confidence: 95% (all critical issues addressed)

---

### Workflow 2: API Efficiency Fixes

**Used for**: P0 + P1 API Optimization (Oct 28, 2025)

**Sequence**:
```
1. api-efficiency-specialist (audit)
   ↓ [identifies 50 issues, prioritizes P0/P1/P2/P3]

2. discovery-scout (plan)
   ↓ [creates detailed implementation plan with line numbers]

3. database-manager-specialist (review)
   ↓ [validates queries, finds 3 critical fixes]

4. architectural-review-specialist (validate)
   ↓ [confirms patterns, alignment]

5. dev-ops-specialist (deployment)
   ↓ [production migration strategy]

Result: 95% confidence, zero-downtime deployment
```

**Lessons**:
- api-efficiency-specialist audit provides prioritized roadmap
- Database-manager caught critical Prisma syntax errors
- Dev-ops integration ensured production safety

---

### Workflow 3: Security Fix

**Used for**: POV Launch Access Control (Oct 28, 2025)

**Sequence**:
```
1. api-efficiency-specialist (identifies vulnerability)
   ↓ [CRITICAL: Data leakage - any user sees all POVs]

2. discovery-scout (creates fix plan)
   ↓ [maps existing access control patterns]

3. sec-ops-specialist (would review, but skipped for speed)
   ↓ [pattern already proven in codebase]

Result: 95% confidence, security vulnerability closed
```

**Lessons**:
- Security fixes can reuse existing patterns
- Critical fixes may skip some specialists if pattern proven
- Breaking changes acceptable for security

---

### Workflow 4: Database Schema Migration

**Used for**: P0 Database Indices (Oct 28, 2025)

**Sequence**:
```
1. api-efficiency-specialist (identifies need)
   ↓ [10 missing indices for query optimization]

2. discovery-scout (creates plan)
   ↓ [exact schema changes, line numbers]

3. database-manager-specialist (validates)
   ↓ [adds CONCURRENTLY, validates syntax, estimates timing]

4. dev-ops-specialist (deployment strategy)
   ↓ [zero-downtime migration procedure]

Result: 95% confidence, production-safe migration
```

**Lessons**:
- Database changes need database-manager validation
- Production deployment needs dev-ops strategy
- CONCURRENTLY critical for zero-downtime

---

## Common Pitfalls and How Specialists Catch Them

### Pitfall 0: Reviewing Plans Without Validating Current State (NEW)

**Problem**: Specialists review proposed changes without verifying current implementation works

**How Caught**: Phase 0 current-state validation (NEW requirement)

**Example**: Phase 3 JWT Reviews (2026-01-24)
- Reviewed multi-key JWKS plan
- Assumed Phase 2 RS256 tokens worked for MCP OAuth
- Did NOT decode production tokens
- Did NOT grep for all audience values
- **Missed**: MCP tokens have `aud: 'https://paichart.app/mcp'`, validation expects `aud: 'paichart-api'`
- **Result**: Production outage (ChatGPT write operations failed)

**Prevention**:
- ✅ Always run Phase 0 validation BEFORE specialist review
- ✅ Decode production tokens/data (don't assume)
- ✅ Grep for all variations of critical values
- ✅ Test current implementation end-to-end
- ✅ Document current state before reviewing changes

**Time Cost**:
- Phase 0 validation: 30 minutes
- Debugging production issue: 2-4 hours
- **ROI**: 4-8x time saved

**Specialist to Prevent**: Phase 0 validation (mandatory for all reviews)

---

### Pitfall 1: Schema Drift (API vs Code)

**Problem**: Zod schema expects fields API doesn't return

**How Caught**: types-system-specialist
**Example**: AgentExecution schema expected 8 fields, API returned 4
**Prevention**: Always validate schemas against actual API responses

**Specialist to Consult**: types-system-specialist, validation-engine-specialist

---

### Pitfall 2: Prisma Syntax Errors

**Problem**: Invalid Prisma query syntax that looks correct

**How Caught**: database-manager-specialist
**Example**: Spread operator inside OR array (Issue #3, Query #3)
**Prevention**: Database-manager review for all Prisma queries

**Specialist to Consult**: database-manager-specialist

---

### Pitfall 3: Performance Degradation

**Problem**: Changes that slow down queries or increase data transfer

**How Caught**: performance-analyst-specialist, api-efficiency-specialist
**Example**: Global queries without POV scoping
**Prevention**: Always scope queries to user context

**Specialist to Consult**: performance-analyst-specialist, api-efficiency-specialist

---

### Pitfall 4: Breaking Changes Without Documentation

**Problem**: Changes break existing consumers without warning

**How Caught**: architectural-review-specialist, boundary-contract-specialist
**Example**: POV Launch security fix (intentional breaking change)
**Prevention**: Document breaking changes, test consumers

**Specialist to Consult**: architectural-review-specialist

---

### Pitfall 5: Security Vulnerabilities

**Problem**: Missing auth, data leakage, validation bypass

**How Caught**: sec-ops-specialist, api-efficiency-specialist
**Example**: POV Launch returned all POVs to any user
**Prevention**: Security review for all API changes

**Specialist to Consult**: sec-ops-specialist, auth-permissions-specialist

---

### Pitfall 6: Multi-Tenant Data Leaks

**Problem**: Cross-tenant data access, missing tenantId

**How Caught**: multi-tenancy-specialist
**Example**: Task model lacks tenantId (8.2/10 risk)
**Prevention**: Multi-tenancy review for POV-related features

**Specialist to Consult**: multi-tenancy-specialist

---

### Pitfall 7: State Management Edge Cases

**Problem**: Temp IDs not reconciled, validation errors not cleared

**How Caught**: architectural-review-specialist, validation-engine-specialist
**Example**: Duplicate phases (merge vs replace)
**Prevention**: Review state transitions and reconciliation logic

**Specialist to Consult**: architectural-review-specialist

---

## Metrics and Success Tracking

### Review Process Metrics

**Track for Each Review**:
- Specialists consulted
- Confidence scores (before/after)
- Critical issues found
- Implementation time (estimated vs actual)
- Post-deployment issues (measure quality)

**Example Tracking** (Oct 28, 2025 - P0 Fixes):
```
Feature: P0 API Efficiency Fixes
Specialists: 4 (api-efficiency, discovery-scout, database-manager, architectural-review, dev-ops)
Confidence Progression: 95% → 92% → 92% → 95%
Critical Issues Found: 3 (all fixed before implementation)
Estimated Time: 2h 50min
Actual Time: 2h 10min (faster due to confidence!)
Post-Deployment Issues: 0 (as of Oct 28)
```

---

### Quality Indicators

**High-Quality Review Process**:
- ✅ 3+ specialists for major features
- ✅ 90%+ final confidence
- ✅ All critical issues addressed
- ✅ Implementation matches plan
- ✅ Zero post-deployment critical bugs

**Low-Quality Review Process**:
- ❌ <2 specialists or no specialists
- ❌ <85% final confidence
- ❌ Critical issues unaddressed
- ❌ Implementation diverges from plan
- ❌ Post-deployment bugs requiring fixes

---

### ROI of Specialist Reviews

**Time Investment**:
- Specialist review: 30-60 min per specialist
- Total for 3 specialists: 1.5-3 hours

**Time Saved**:
- Bugs prevented: 2-10 hours debugging per bug
- Rework avoided: 4-20 hours
- Production incidents: Incalculable

**Quality Improvement**:
- 87% → 95% confidence jump (typical)
- Critical issues caught: 1-4 per feature
- Post-deployment bugs: Reduced by 70-90%

**ROI**: **5-10x return on investment**

**Example** (Oct 28, 2025):
- Specialist review time: 2 hours (4 specialists)
- Bugs prevented: Prisma syntax error (would have been 2-4 hours debugging)
- Production safety: CONCURRENTLY recommendation (prevented downtime)
- Security: Access control pattern reuse (prevented vulnerability)

**Total Value**: 10-15 hours saved + zero downtime + security

---

## Integration with Existing Workflow

### Update to Development Workflow

**Before Implementing Any Feature**:

```
1. Create implementation plan
   ├─> For >2hr features: Use discovery-scout
   └─> For <2hr features: Write brief plan

2. Request specialist reviews (if required)
   ├─> Check "When to Request Reviews" section
   └─> Use Specialist Selection Matrix

3. Apply specialist recommendations
   ├─> Fix critical issues
   ├─> Document important issues
   └─> Consider nice-to-haves

4. Achieve confidence threshold
   ├─> Target: 90%+ for major features
   └─> Re-review if < 85%

5. Implement following plan
   └─> Update plan if deviations occur

6. Post-implementation review
   └─> Track actual vs estimated, document learnings
```

---

### CLAUDE.md Integration

Add to `/CLAUDE.md` under "Development Workflow":

```markdown
## Specialist Review Protocol

For features requiring >2 hours implementation or touching security/database/API:
1. Consult specialist review protocol: `/.claude/knowledge/protocols/specialist-review-protocol.md`
2. Request minimum required specialists (typically 3)
3. Achieve 90%+ confidence before implementation
4. Document specialist findings and applied fixes

**Required Specialists**:
- Major features: boundary-contract + architectural-review + domain specialist
- Database changes: database-manager + architectural-review
- Security changes: sec-ops + validation-engine + boundary-contract
- API changes: api-efficiency + boundary-contract + architectural-review
```

---

## Quick Reference: Common Scenarios

### Scenario 1: Adding New API Endpoint

**Specialists to Consult**: 3
1. api-efficiency-specialist (design pattern)
2. validation-engine-specialist (input validation)
3. architectural-review-specialist (alignment)

**Confidence Target**: 92%+

---

### Scenario 2: Database Migration

**Specialists to Consult**: 2-3
1. database-manager-specialist (required)
2. dev-ops-specialist (production deployment)
3. multi-tenancy-specialist (if affects tenant isolation)

**Confidence Target**: 95%+ (high risk if done wrong)

---

### Scenario 3: Security Fix

**Specialists to Consult**: 2-3
1. sec-ops-specialist (required)
2. auth-permissions-specialist (if auth-related)
3. architectural-review-specialist (pattern validation)

**Confidence Target**: 95%+ (security critical)

---

### Scenario 4: Performance Optimization

**Specialists to Consult**: 2-3
1. performance-analyst-specialist (required)
2. api-efficiency-specialist (if API changes)
3. database-manager-specialist (if query changes)

**Confidence Target**: 90%+

---

### Scenario 5: State Management Bug

**Specialists to Consult**: 2
1. architectural-review-specialist (pattern review)
2. validation-engine-specialist (if validation-related)

**Confidence Target**: 90%+

---

## Templates Directory Structure

```
/cline_docs/templates/
├── specialist-review-request.md       # Start a review
├── specialist-confidence-assessment.md # Track scores
├── multi-specialist-coordination.md    # Manage 3+ specialists
├── feature-implementation-template.md  # Feature planning
├── bug-fix-template.md                # Bug analysis
└── specialist-review-protocol.md      # This file (symlink or reference)
```

---

## Specialist Capabilities Reference

### Core Specialists (Always Available)

**discovery-scout** 🔍
- **When**: Complex feature investigation, architecture mapping
- **Strength**: Creates detailed plans with exact line numbers
- **Typical Confidence**: 90-95%
- **Time**: 20-40 minutes

**architectural-review-specialist** 🏗️
- **When**: Final validation, pattern consistency
- **Strength**: Validates "Simple & Reliable" alignment
- **Typical Confidence**: 90-95%
- **Time**: 30-45 minutes

**database-manager-specialist** 🗄️
- **When**: Schema changes, Prisma queries, migrations
- **Strength**: Catches syntax errors, validates performance
- **Typical Confidence**: 85-95%
- **Time**: 25-40 minutes

**boundary-contract-specialist** 🔗
- **When**: Data transformations, API boundaries, **MCP vs API context**
- **Strength**: 5-minute comparative analysis, **runtime verification**, field leakage detection
- **Typical Confidence**: 90-95%
- **Time**: 10-20 minutes (now includes runtime check)
- **NEW**: Always verify runtime data structure, not just static code

**Example** (Nov 20, 2025): Found MCP user.id vs API user.userId mismatch through runtime logs

**validation-engine-specialist** 🧪
- **When**: Input validation, schema validation, Zod patterns
- **Strength**: Multi-layer validation expertise
- **Typical Confidence**: 90-97%
- **Time**: 20-35 minutes

---

### Domain Specialists (Situational)

**api-efficiency-specialist** 🚀
- **When**: API design, query optimization, N+1 prevention
- **Strength**: Comprehensive audits, prioritization
- **Typical Confidence**: 92-95%
- **Time**: 30-60 minutes (audits), 20-30 minutes (reviews)

**multi-tenancy-specialist** 🏢
- **When**: POV isolation, tenant scoping, cross-tenant security
- **Strength**: Identifies security gaps, validates isolation
- **Typical Confidence**: 85-90%
- **Time**: 30-50 minutes

**performance-analyst-specialist** ⚡
- **When**: Performance critical code, caching, query optimization
- **Strength**: Identifies bottlenecks, estimates improvements
- **Typical Confidence**: 90-95%
- **Time**: 25-40 minutes

**sec-ops-specialist** 🔒
- **When**: Security changes, authentication, authorization
- **Strength**: Vulnerability identification, security patterns
- **Typical Confidence**: 92-98%
- **Time**: 30-45 minutes

**types-system-specialist** 🏷️
- **When**: Type safety, Prisma schema, enum usage
- **Strength**: Schema validation, type alignment
- **Typical Confidence**: 85-95%
- **Time**: 20-35 minutes

**dev-ops-specialist** 🚀
- **When**: Deployment, migrations, production infrastructure
- **Strength**: Zero-downtime strategies, rollback plans
- **Typical Confidence**: 95%+
- **Time**: 30-50 minutes

---

## Advanced: Specialist Consensus Building

### When Specialists Disagree

**Example Scenario**:
- performance-analyst recommends complex caching
- architectural-review recommends simple approach
- Confidence scores: 85% vs 95%

**Resolution Process**:

1. **Identify trade-off**:
   - Performance: +30% speed improvement
   - Complexity: +15 lines, caching invalidation logic

2. **Apply "Simple & Reliable" principle**:
   - Does complexity justify benefit?
   - Can we achieve 80% of benefit with 20% of complexity?

3. **Consult tie-breaker**:
   - For performance vs simplicity: architectural-review decides
   - For security vs performance: sec-ops decides
   - For schema vs code: database-manager decides

4. **Document decision** in ADR

**Example Resolution** (Oct 27, 2025):
- Option A (simple): 95% architectural fit, 2 lines
- Option C (complex): 76% architectural fit, 15 lines
- **Decision**: Option A (architectural-review recommendation)
- **Result**: Successful implementation, maintained simplicity

---

## Success Criteria

### Review Process is Successful If:

**Pre-Implementation**:
- [ ] Minimum required specialists consulted
- [ ] Confidence threshold achieved (90%+ for major features)
- [ ] All critical issues addressed
- [ ] Implementation plan updated with fixes
- [ ] Rollback plan documented

**During Implementation**:
- [ ] Implementation follows plan (or documents deviations)
- [ ] No unexpected blockers encountered
- [ ] Tests pass as predicted
- [ ] Performance matches estimates

**Post-Implementation**:
- [ ] Zero critical bugs in first 48 hours
- [ ] Performance meets or exceeds estimates
- [ ] No security vulnerabilities introduced
- [ ] Backward compatibility maintained (or breaking changes documented)
- [ ] Specialist recommendations validated in production

---

## Continuous Improvement

### After Each Major Feature

**Lessons Learned Template**:
```markdown
# [Feature] Specialist Review Retrospective

## What Worked Well
- Which specialists provided most value?
- What issues were caught early?
- How accurate were confidence scores?

## What Didn't Work
- Any specialists consulted unnecessarily?
- Any specialists missing that should have been included?
- Any issues not caught by reviews?

## Confidence Accuracy
- Estimated confidence: [X]%
- Actual confidence (post-deployment): [Y]%
- Delta: [Y-X]%

## Recommendations for Next Time
- Specialist selection changes
- Review process improvements
- Template updates needed
```

---

### Update Protocol Based on Learnings

**Quarterly Review**:
- Review all specialist usage from quarter
- Identify patterns (which specialists most valuable)
- Update confidence threshold guidelines
- Add new specialists if needed
- Retire specialists if redundant

**Example Updates from Oct 27-28**:
- ✅ Added api-efficiency-specialist (new)
- ✅ Added multi-tenancy-specialist (new)
- ✅ Validated boundary-contract pattern (highly valuable)
- ✅ Confirmed architectural-review as final gate (essential)

---

## Conclusion

The specialist review protocol is a **proven quality multiplier**:
- **Prevents bugs** before they're written
- **Catches critical issues** early (when fixes are cheap)
- **Builds confidence** in implementation
- **Transfers knowledge** across domains
- **Scales quality** as codebase grows

**Key Success Factors**:
1. Use discovery-first workflow
2. Consult minimum required specialists
3. Apply critical fixes before implementation
4. Achieve 90%+ confidence for major features
5. Document specialist findings

**ROI**: 5-10x return on review time investment

**Next Steps**:
1. Review this protocol before major features
2. Use templates for standardization
3. Track specialist effectiveness
4. Update based on learnings

---

**Protocol Version**: 1.0
**Based On**: Oct 27-28, 2025 Multi-Specialist Success
**Proven Confidence Range**: 92-95% (production-ready)
**Recommended For**: All features >2 hours, all security/database changes
