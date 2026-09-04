# API Consolidation Opportunities Discovery

**Version:** 1.0
**Created:** 2025-12-12
**Purpose:** Identify endpoints that could benefit from domain-based routing consolidation
**Pattern:** `domain-based-api-routing-pattern.md`
**Protocol:** `endpoint-consolidation-protocol.md`
**Estimated Time:** 45-60 minutes
**Output:** Prioritized list of consolidation candidates with network savings estimates

---

## Discovery Objective

Systematically analyze your codebase to find API endpoints that are:
1. **Similar in purpose** (analytics, reports, dashboards, metrics)
2. **Groupable by domain** (user, team, project, system)
3. **Causing network overhead** (5+ calls per page)
4. **Duplicating code/patterns**

**Outcome:** Actionable list of consolidation opportunities with ROI estimates

---

## Step 1: Map All API Endpoints (15 min)

### 1.1: Find All Route Files

```bash
# Find all API route files
find app/api -name "route.ts" -o -name "route.js" | sort

# Count total
find app/api -name "route.ts" | wc -l
```

**Document:**
```markdown
## Endpoint Inventory
Total API endpoints: [COUNT]
Locations: app/api/...
```

### 1.2: Categorize by Purpose

```bash
# Find analytics-like endpoints
find app/api -name "route.ts" | xargs grep -l "analytics\|report\|dashboard\|metrics\|summary\|stats"

# Find operational endpoints
find app/api -name "route.ts" | xargs grep -l "POST\|PUT\|DELETE\|PATCH"

# Find read-only endpoints
find app/api -name "route.ts" | xargs grep -l "export.*GET" | xargs grep -L "POST\|PUT\|DELETE"
```

**Categorize each endpoint:**

| Endpoint | Type | Purpose | Operations |
|----------|------|---------|------------|
| /api/tasks/analytics/performance | Analytics | Task metrics | GET (read-only) |
| /api/tasks/[id] | Operational | CRUD | GET, PUT, DELETE |
| /api/reports/summary | Analytics | Report aggregation | GET (read-only) |

**Operational vs Analytics Decision:**

```yaml
Analytics (Consolidation Candidates):
  - Read-only (GET only)
  - Aggregated data
  - Time-range queries
  - Business intelligence

Operational (Keep Separate):
  - Write operations (POST/PUT/DELETE)
  - Individual records
  - Real-time requirements
  - User actions
```

---

## Step 2: Group by Logical Domain (10 min)

### 2.1: Identify Domain Groupings

**Look for patterns:**
- `/api/tasks/analytics/*` → **tasks** domain
- `/api/users/reports/*` → **users** domain
- `/api/mcp/*` → **mcp** domain
- `/api/dashboard/team-*` → **team** domain
- `/api/projects/metrics/*` → **projects** domain

### 2.2: Document Domain Groups

**For each domain:**

```markdown
## Domain: Tasks
Endpoints (6):
1. /api/tasks/analytics/performance (metrics)
2. /api/tasks/analytics/insights (recommendations)
3. /api/tasks/analytics/trends (time-series)
4. /api/tasks/summary (aggregates)
5. /api/tasks/health (status check)
6. /api/tasks/forecast (predictions)

Consolidation Potential:
- Unified endpoint: /api/analytics?domain=tasks
- Metrics: performance, insights, trends, summary, health, forecast
- Network savings: 6 calls → 1-2 calls = 3600-4500ms

Operational Endpoints (Keep Separate):
- /api/tasks (list with filters) - Operational listing
- /api/tasks/[id] (CRUD) - Write operations
- /api/tasks/[id]/assign (action) - User action
```

**Repeat for all domains**

---

## Step 3: Analyze Network Impact (10 min)

### 3.1: Find High-Traffic Pages

```bash
# Search for components making multiple API calls
grep -r "fetch.*\/api\/" components/ --include="*.tsx" --include="*.ts" | \
  cut -d: -f1 | sort | uniq -c | sort -rn | head -20

# Output: Components with most API calls (count prefix = number of fetch sites)
# Example: a dashboard/analytics component topping the list with several /api/ calls
# is a consolidation candidate (verify against live grep output — don't trust a
# hard-coded filename here, components move/rename).
```

### 3.2: Calculate Network Cost Per Page

**For each page/component:**

```markdown
## Page: /analytics Dashboard

Current API Calls (5):
1. /api/tasks/analytics/performance → 900ms
2. /api/tasks/analytics/insights → 900ms
3. /api/agent-executions/summary → 900ms
4. /api/mcp/analytics → 900ms
5. /api/analytics/overview → 900ms
Total: 4500ms

Potential Consolidation:
1. /api/analytics?domain=tasks&metrics=performance&metrics=insights → 900ms
2. /api/analytics?domain=agents&metrics=summary → 900ms
3. /api/analytics?domain=mcp&metrics=all → 900ms
4. /api/analytics?domain=overview&metrics=all → 900ms
Total: 3600ms

Network Savings: 900ms (20% reduction)
```

**Prioritize by impact:**
- Page with 10+ calls: **CRITICAL** (huge savings potential)
- Page with 5-9 calls: **HIGH** (significant savings)
- Page with 3-4 calls: **MEDIUM** (moderate savings)
- Page with 1-2 calls: **LOW** (minimal benefit)

---

## Step 4: Identify Code Duplication (10 min)

### 4.1: Find Similar Handler Logic

```bash
# Find similar validation patterns
grep -r "TaskAnalyticsQuerySchema\|ReportQuerySchema\|MetricsQuerySchema" app/api/

# Find similar POV access patterns
grep -r "validatePOVAccess\|validateAccess" app/api/ | wc -l

# Find similar aggregation patterns
grep -r "groupBy\|reduce.*acc" app/api/ --include="*.ts" | head -20
```

### 4.2: Calculate Duplication Percentage

**Example:**

```markdown
## Code Duplication Analysis

Validation Logic (repeated 12 times):
- TaskAnalyticsQuerySchema validation
- POV access check
- Rate limiting
- Error handling
Total: ~50 LOC × 12 = 600 LOC duplicated

Consolidation Benefit:
- Unified router: 1 validation (50 LOC)
- Domain handlers: No validation needed (receive clean data)
- Savings: 550 LOC (92% reduction)
```

---

## Step 5: Score Consolidation Opportunities (10 min)

### Consolidation Opportunity Scoring Matrix

**For each domain group:**

| Factor | Points | Calculation |
|--------|--------|-------------|
| **Endpoint Count** | 5 pts × count | 5+ endpoints = 25+ pts |
| **Network Impact** | 10 pts × (calls - 2) | 5 calls = 30 pts |
| **Code Duplication** | LOC duplicated / 10 | 600 LOC = 60 pts |
| **Consistency Issues** | 20 pts if present | Inconsistent params = 20 pts |
| **Security Gaps** | 30 pts if present | Missing validation = 30 pts |

**Total Score:**
- **80-150:** CRITICAL - Consolidate immediately
- **50-79:** HIGH - Plan consolidation
- **30-49:** MEDIUM - Monitor and consider
- **< 30:** LOW - Keep as-is

### Example Scoring: Analytics API

```markdown
## Domain: Analytics (Tasks/MCP/Agents)

Endpoint Count: 16 endpoints × 5 pts = 80 pts
Network Impact: (5 calls - 2) × 10 pts = 30 pts
Code Duplication: 600 LOC / 10 = 60 pts
Consistency Issues: (timeframe vs timeRange) = 20 pts
Security Gaps: (3 endpoints unvalidated) = 30 pts

Total Score: 220 pts → CRITICAL PRIORITY ✅

Estimated Savings:
- Network: 1800ms (40% page load reduction)
- Code: 600 LOC (consolidation)
- Maintenance: 5-10x easier (single pattern)
```

---

## Step 6: Assess Implementation Complexity (10 min)

### Complexity Factors

**For each domain:**

| Factor | Weight | Assessment |
|--------|--------|------------|
| **Logic Complexity** | HIGH | Lines of code per endpoint |
| **Query Count** | MEDIUM | Number of DB queries |
| **Edge Cases** | HIGH | Unusual filtering, complex logic |
| **Dependencies** | MEDIUM | Frontend components affected |
| **Security Requirements** | HIGH | Multi-tenant, RBAC, etc. |

**Complexity Rating:**

```markdown
## Tasks Domain Complexity Assessment

Endpoints to consolidate: 2
Total LOC: 674 (312 + 362)
Total queries: 31 (15 + 16)
Edge cases:
  - POV filtering without direct relation ⚠️
  - Prisma groupBy limitations (taskId IN array workaround)
  - 4 recommendation types generation
Frontend components: 3
Security: POV access validation required

Complexity: HIGHEST ⚠️⚠️⚠️
Estimated time: 6-8 hours
Risk: HIGH (mission-critical analytics)
Recommendation: Tackle LAST (after building confidence on simpler domains)
```

**Implementation Order:**
1. LOWEST complexity first (validates pattern)
2. Build confidence incrementally
3. HIGHEST complexity last (proven approach helps)

---

## Discovery Output Template

### Executive Summary

```markdown
# API Consolidation Opportunities - Discovery Report

**Date:** [YYYY-MM-DD]
**Scope:** [Area of codebase analyzed]
**Total Endpoints Analyzed:** [COUNT]

## Summary Statistics

| Category | Count | Percentage |
|----------|-------|------------|
| Analytics endpoints | X | Y% |
| Operational endpoints | X | Y% |
| Consolidation candidates | X | Y% |
| Total network calls/page | X | - |

## Top 3 Consolidation Opportunities

1. **[Domain Name]** - Score: [XXX] (CRITICAL)
   - Endpoints: [COUNT]
   - Network savings: [TIME]ms
   - Complexity: [LEVEL]

2. **[Domain Name]** - Score: [XXX] (HIGH)
   - Endpoints: [COUNT]
   - Network savings: [TIME]ms
   - Complexity: [LEVEL]

3. **[Domain Name]** - Score: [XXX] (MEDIUM)
   - Endpoints: [COUNT]
   - Network savings: [TIME]ms
   - Complexity: [LEVEL]
```

### Detailed Findings Per Domain

```markdown
## Domain: [Name]

### Current State
- Endpoints: [LIST with LOC, queries, purpose]
- Frontend usage: [Components that call these]
- Network calls: [COUNT per page]
- Code duplication: [LOC duplicated]

### Consolidation Opportunity
- Unified endpoint: /api/analytics?domain=[name]
- Available metrics: [LIST]
- Network savings: [CALCULATION]
- Code reduction: [LOC saved]

### Implementation Complexity
- LOC to extract: [TOTAL]
- Queries to preserve: [COUNT]
- Critical logic: [WHAT must be preserved]
- Edge cases: [LIST]
- Estimated time: [HOURS]
- Risk level: [LOW/MEDIUM/HIGH/HIGHEST]

### Recommendation
- Priority: [CRITICAL/HIGH/MEDIUM/LOW]
- Phase order: [X] of [Y] (safest-first)
- Benefits: [SPECIFIC benefits for this domain]
```

---

## Common Consolidation Patterns Found

### Pattern 1: Analytics Triplet

```
Found in many codebases:
- /api/{resource}/analytics/performance
- /api/{resource}/analytics/insights
- /api/{resource}/analytics/trends

Consolidate to:
- /api/analytics?domain={resource}&metrics=performance&metrics=insights&metrics=trends

Network savings: 2 calls (1800ms if 900ms/call)
```

### Pattern 2: Dashboard Widgets

```
Found in dashboards:
- /api/dashboard/widget1
- /api/dashboard/widget2
- /api/dashboard/widget3
- /api/dashboard/widget4

Consolidate to:
- /api/dashboard?widgets=widget1&widgets=widget2&widgets=widget3&widgets=widget4

Network savings: 3 calls (2700ms)
```

### Pattern 3: Summary + Detail

```
Found in many features:
- /api/{resource}/summary (aggregated stats)
- /api/{resource}/details (full data)

Consolidate to:
- /api/{resource}?include=summary&include=details

Network savings: 1 call (900ms)
```

---

## Red Flags: Don't Consolidate These

### Red Flag 1: Different HTTP Verbs

```
❌ Don't consolidate:
- GET /api/tasks (list)
- POST /api/tasks (create)
- PUT /api/tasks/[id] (update)
- DELETE /api/tasks/[id] (delete)

Why: Traditional REST is clearer for CRUD
```

### Red Flag 2: Different Content-Types

```
❌ Don't consolidate:
- /api/export/csv (text/csv)
- /api/export/pdf (application/pdf)
- /api/export/excel (application/vnd.ms-excel)

Why: File downloads need specific Content-Type headers
```

### Red Flag 3: Different Security Contexts

```
❌ Don't consolidate:
- /api/public/stats (no auth)
- /api/analytics (user auth)
- /api/admin/analytics (admin auth)

Why: Security requirements differ, should be obvious from URL
```

### Red Flag 4: Real-Time Requirements

```
❌ Don't consolidate:
- /api/notifications (WebSocket/SSE)
- /api/live-feed (Server-Sent Events)
- /api/realtime/updates (long-polling)

Why: Real-time needs persistent connections, not HTTP polling
```

---

## Discovery Checklist

**Endpoint Analysis:**
- [ ] All API routes mapped
- [ ] Categorized (operational vs analytics)
- [ ] Grouped by logical domain
- [ ] Request/response structures documented
- [ ] Security patterns identified

**Network Impact:**
- [ ] High-traffic pages identified
- [ ] API calls per page counted
- [ ] Network latency estimated (avg 900ms/call)
- [ ] Total network cost calculated

**Code Quality:**
- [ ] Duplication identified
- [ ] Inconsistencies found (param names, response formats)
- [ ] Security gaps discovered
- [ ] Pattern violations noted

**Consolidation Scoring:**
- [ ] Each domain scored (opportunity matrix)
- [ ] Prioritized by impact (CRITICAL → LOW)
- [ ] Complexity assessed (LOWEST → HIGHEST)
- [ ] Implementation order recommended (safest-first)

**Output Generated:**
- [ ] Discovery report with recommendations
- [ ] Prioritized consolidation candidates
- [ ] Network savings estimates
- [ ] Implementation complexity assessment

---

## Output Format

### Consolidation Candidate Card

```markdown
## Candidate: [Domain Name]

### Opportunity Score: [XXX] pts ([PRIORITY])

**Current State:**
- Endpoints: [COUNT] ([LIST])
- Total LOC: [NUMBER]
- Total queries: [NUMBER]
- Frontend components: [COUNT]
- API calls per page: [NUMBER]

**Consolidation Plan:**
- Unified endpoint: /api/analytics?domain=[name]
- Available metrics: [LIST]
- Domain handler LOC: [ESTIMATE]
- Backward compat wrappers: [COUNT]

**Benefits:**
- Network savings: [TIME]ms ([PERCENT]% reduction)
- Code reduction: [LOC] saved
- API calls: [BEFORE] → [AFTER]
- Maintainability: [IMPACT description]

**Implementation:**
- Complexity: [LOWEST/LOW/MEDIUM/HIGH/HIGHEST]
- Estimated time: [HOURS]
- Risk level: [ASSESSMENT]
- Phase order: [X] of [Y] (safest-first)

**Critical Logic to Preserve:**
- [List of complex/critical sections]
- [Edge cases to handle]
- [Specialist recommendations]

**Next Steps:**
1. Run specialist reviews (api-efficiency, architectural, boundary-contract)
2. Achieve 90%+ confidence threshold
3. Follow endpoint-consolidation-protocol.md (5-phase workflow)
4. Implement using domain-based-api-routing-pattern.md
```

---

## Real-World Discovery Example

### Analytics API Discovery (Actual Results)

**Step 1: Mapped 16 endpoints**
```
Analytics endpoints found: 16
- /api/analytics/overview
- /api/mcp/analytics
- /api/mcp/tools/performance
- /api/agent-executions/summary
- /api/tasks/analytics/performance
- /api/tasks/analytics/insights
- /api/dashboard/team-activity
- ... (9 more)

Operational endpoints (kept): 5
- /api/agent-executions (listing)
- /api/tasks/activities (feed)
- /api/agent-executions/[id]/logs
- ... (2 more)
```

**Step 2: Grouped into 5 domains**
```
Domains identified:
1. overview (1 endpoint, 100 LOC)
2. mcp (1 endpoint, 189 LOC)
3. agents (2 endpoints, 195 LOC)
4. team (2 endpoints, 195 LOC)
5. tasks (2 endpoints, 674 LOC)

Total: 16 endpoints → 5 domains
```

**Step 3: Network impact analysis**
```
/analytics page: 5 API calls
Current: 5 × 900ms = 4500ms total
Potential: 3 × 900ms = 2700ms total
Savings: 1800ms (40% faster)
```

**Step 4: Code duplication found**
```
Validation logic: 50 LOC × 8 endpoints = 400 LOC
POV access logic: 30 LOC × 8 endpoints = 240 LOC
Rate limiting: 10 LOC × 8 endpoints = 80 LOC
Total duplication: ~720 LOC

After consolidation:
- 1 unified router with all security
- Domain handlers receive clean data
- Savings: 650+ LOC
```

**Step 5: Opportunity scoring**
```
Domain: Analytics (all 5)
Score: 220 pts (CRITICAL)
- Endpoints: 16 × 5 = 80 pts
- Network: (5-2) × 10 = 30 pts
- Duplication: 720/10 = 72 pts
- Inconsistency: 20 pts
- Security gaps: 18 pts

Recommendation: IMMEDIATE consolidation
Expected ROI: 5-10x
```

**Step 6: Complexity assessment**
```
Implementation Order (Safest-First):
1. Overview (LOWEST - 100 LOC, 3 queries) ⭐
2. MCP (LOW - 189 LOC, 1 query) ⭐⭐
3. Agents (MEDIUM - 195 LOC, context-aware) ⭐⭐⭐
4. Team (HIGH - 195 LOC, indirect POV filtering) ⭐⭐⭐⭐
5. Tasks (HIGHEST - 674 LOC, 31 queries) ⭐⭐⭐⭐⭐

Estimated total: 20-26 hours implementation
Confidence: 90.7% (with specialist validation)
```

**Result:** Comprehensive consolidation plan with high confidence

---

## Next Steps After Discovery

### If Consolidation Candidates Found:

**1. Prioritize by Score**
   - CRITICAL (80-150 pts): Plan immediately
   - HIGH (50-79 pts): Add to roadmap
   - MEDIUM (30-49 pts): Monitor
   - LOW (< 30 pts): Keep as-is

**2. Consult Specialists** (per `specialist-review-protocol.md`)
   - Required: api-efficiency-specialist, architectural-review-specialist, boundary-contract-specialist
   - Optional: performance-analyst-specialist, database-manager-specialist
   - Achieve: 90%+ confidence threshold

**3. Follow Consolidation Protocol** (`endpoint-consolidation-protocol.md`)
   - Phase 1: Parallel exploration (3 Explore agents)
   - Phase 2: Tactical planning (Plan agent)
   - Phase 3: Deep review (critical files)
   - Phase 4: Final plan (write & approve)
   - Phase 5: Incremental execution (safest-first)

**4. Implement Using Pattern** (`domain-based-api-routing-pattern.md`)
   - Unified router with 10-layer security
   - Domain handlers in subdirectories
   - Backward compat wrappers
   - Array parameter design
   - Validation schema

**5. Measure Success**
   - Network savings (DevTools Network tab)
   - Error rate (< 1%)
   - Code reduction (LOC)
   - Team velocity (easier maintenance)

---

## Discovery Tools & Commands

### Quick Discovery Script

```bash
#!/bin/bash
# Save as: scripts/discover-api-consolidation.sh

echo "🔍 API Consolidation Opportunity Discovery"
echo "=========================================="
echo ""

echo "📊 Step 1: Endpoint Inventory"
total=$(find app/api -name "route.ts" | wc -l)
echo "Total endpoints: $total"

echo ""
echo "📊 Step 2: Analytics vs Operational"
analytics=$(find app/api -name "route.ts" | xargs grep -l "analytics\|report\|dashboard\|metrics" | wc -l)
echo "Analytics endpoints: $analytics"

crud=$(find app/api -name "route.ts" | xargs grep -l "POST\|PUT\|DELETE" | wc -l)
echo "Operational endpoints (CRUD): $crud"

echo ""
echo "📊 Step 3: High-Traffic Components"
echo "Components with most API calls:"
grep -r "fetch.*\/api\/" components/ --include="*.tsx" | \
  cut -d: -f1 | sort | uniq -c | sort -rn | head -10

echo ""
echo "📊 Step 4: Code Duplication"
validation_dup=$(grep -r "QuerySchema.safeParse" app/api/ | wc -l)
echo "Validation logic duplicated: $validation_dup times"

pov_dup=$(grep -r "validatePOVAccess\|validateAccess" app/api/ | wc -l)
echo "Access control duplicated: $pov_dup times"

echo ""
echo "📊 Step 5: Opportunity Score Estimate"
score=$(( (analytics * 5) + ((validation_dup + pov_dup) / 2) ))
echo "Estimated consolidation score: $score pts"

if [ $score -gt 80 ]; then
  echo "Priority: CRITICAL ✅ - Consolidate immediately"
elif [ $score -gt 50 ]; then
  echo "Priority: HIGH - Plan consolidation"
elif [ $score -gt 30 ]; then
  echo "Priority: MEDIUM - Consider consolidating"
else
  echo "Priority: LOW - Keep as-is"
fi

echo ""
echo "✅ Discovery complete! Review findings and consult specialists."
```

**Run:** `bash scripts/discover-api-consolidation.sh`

---

## Success Story: Analytics API

**Discovery Results:**
- 16 analytics endpoints found
- 5 logical domains identified (overview, mcp, agents, team, tasks)
- 220 pts consolidation score (CRITICAL)
- 1800ms network savings potential

**Implementation:**
- 5 phases (safest-first order)
- 20-26 hours execution
- 5 git checkpoints (rollback ready)
- Zero breaking changes

**Actual Results:**
- ✅ All 5 domains deployed
- ✅ 900ms network savings measured (AnalyticsSection)
- ✅ Backward compatibility validated
- ✅ Production stable (0 errors)

**Lessons Learned:**
1. Safest-first builds momentum
2. Preserve logic exactly (don't optimize)
3. Backward compat enables safe deployment
4. Network optimization >> Server optimization

---

## Related Resources

**Pattern:**
- `domain-based-api-routing-pattern.md` - HOW to implement

**Protocol:**
- `endpoint-consolidation-protocol.md` - WHEN and PROCESS
- `large-scale-refactoring-protocol.md` - General methodology

**Specialists:**
- api-efficiency-specialist (API design validation)
- architectural-review-specialist (architecture validation)
- boundary-contract-specialist (data flow validation)

---

**Discovery Version:** 1.0
**Created From:** Analytics API success (Part 2)
**Proven Success:** 100% (220 pt score → successful consolidation)
**Ready for:** Finding your next consolidation opportunity!

🔍 **Run this discovery to find gold mines in your codebase!**
