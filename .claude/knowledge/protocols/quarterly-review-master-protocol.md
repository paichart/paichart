# Quarterly Review Master Protocol

**Type**: Meta-Protocol - Comprehensive System Health Check
**Created**: December 15, 2025
**Updated**: February 26, 2026 (BC11, defensive code sweep, TOCTOU)
**Purpose**: Systematic quarterly assessment of security, performance, and architecture
**Frequency**: Every 3 months (Q1, Q2, Q3, Q4)
**Total Time**: 1 week (distributed across 3 review types)

---

## 🎯 Protocol Overview

**Complete quarterly health check covering**:
1. **Security Review** - Vulnerabilities, validation, authorization
2. **Performance Review** - Optimization opportunities, bottlenecks
3. **Architecture Review** - Code quality, technical debt, maintainability

**Goal**: Maintain 90%+ scores across all dimensions (security, performance, architecture)

---

## 📅 Quarterly Schedule

### **Q1 (January) - Full Review**
- ✅ Security Review (Week 1)
- ✅ Performance Review (Week 2)
- ✅ Architecture Review (Week 3)
- ✅ Implementation Sprint (Week 4)

### **Q2 (April) - Full Review**
- ✅ Security Review (Week 1)
- ✅ Performance Review (Week 2)
- ✅ Architecture Review (Week 3)
- ✅ Implementation Sprint (Week 4)

### **Q3 (July) - Security Focus**
- ✅ Security Review (Week 1) - REQUIRED before compliance audits
- ⚠️ Performance Review (Optional - if slowness reported)
- ⚠️ Architecture Review (Optional - if tech debt high)
- ✅ Implementation Sprint (Week 2)

### **Q4 (October) - Full Review + Retrospective**
- ✅ Security Review (Week 1)
- ✅ Performance Review (Week 2)
- ✅ Architecture Review (Week 3)
- ✅ Implementation Sprint (Week 4)
- ✅ **Year-End Retrospective** (Week 4) - Review all 4 quarters

---

## 📋 Three-Week Review Structure

### **Week 1: Security Review** (4-6 hours)

**Use**: `quarterly-review-protocol.md` (security focus)

**Specialists**: 3 in parallel
- api-efficiency-specialist (endpoint coverage)
- sec-ops-specialist (security risks)
- validation-engine-specialist (schema patterns)

**Includes** (Discovery #11): Bug Class Regression Check
- Verify eradicated classes (Transport Boundary, Express Body Parser, Unhandled Async) haven't regressed
- Check new code follows shared defense patterns (ensureObject, req.body, .catch() on fire-and-forget)
- Registry: `/.claude/knowledge/domain/mcp/bug-class-registry.md`
- Defensive code sweep: `/.claude/knowledge/discoveries/defensive-code-sweep-discovery.md`

**Output**:
- Security score (0-100)
- Top 10 vulnerabilities
- P0/P1/P2 prioritized fixes
- Bug class regression status (0 regressions expected)

**Deliverables**:
- `/cline_docs/reviews/quarterly-review-YYYY-MM-DD/security/`
  - api-efficiency-assessment.md
  - sec-ops-assessment.md
  - validation-engine-assessment.md
  - security-score.md

**Success Criteria**: Security score >85% (good) or >92% (excellent)

---

### **Week 2: Performance Review** (2-4 hours)

**Use**: `performance-opportunity-discovery-protocol.md` (NEW)

**Specialists**: 2 in parallel
- performance-analyst-specialist (bottleneck identification)
- database-manager-specialist (query optimization)

**5-Step Audit**:
1. **Parallel Query Audit** - Find sequential awaits (40-50% gains)
2. **Cache Opportunity Audit** - Find read-heavy endpoints (50-95% gains)
3. **Large File Audit** - Find facade candidates (70-80% reduction)
4. **Connection Reuse Audit** - Find external API calls (50-70% gains)
5. **Transaction Atomicity Audit** - Find multi-table writes without `$transaction` (data integrity)
   - Pattern: `transaction-atomicity-pattern.md` (detection grep commands included)
   - Focus: files with 2+ `await prisma.` writes and no `$transaction`

**Output**:
- Performance opportunity matrix
- ROI-ranked improvements
- Top 10 optimization targets

**Deliverables**:
- `/cline_docs/reviews/quarterly-review-YYYY-MM-DD/performance/`
  - performance-analyst-assessment.md
  - database-manager-assessment.md
  - opportunity-matrix.md
  - roi-rankings.md

**Success Criteria**: Identify 5-10 high-ROI opportunities

---

### **Week 3: Architecture Review** (2-3 hours)

**Use**: `specialist-review-protocol.md` (architecture focus)

**Specialist**: 1 comprehensive
- architectural-review-specialist (code quality, patterns, maintainability)

**Focus Areas**:
1. **Code Organization** - File sizes, modularity, responsibilities
2. **Pattern Consistency** - Use of established patterns
3. **Technical Debt** - Accumulation vs paydown
4. **Test Coverage** - Quality and coverage trends
5. **Documentation** - JSDoc, READMEs, knowledge base

**Output**:
- Architecture health score (0-10)
- Technical debt inventory
- Refactoring recommendations

**Deliverables**:
- `/cline_docs/reviews/quarterly-review-YYYY-MM-DD/architecture/`
  - architectural-health-assessment.md
  - technical-debt-inventory.md
  - refactoring-roadmap.md

**Success Criteria**: Architecture score >8.5/10 (excellent)

---

## 📊 Consolidated Reporting

### **Create Executive Summary** (Week 3 end, 30 min)

**File**: `/cline_docs/reviews/quarterly-review-YYYY-MM-DD/EXECUTIVE-SUMMARY.md`

```markdown
# Quarterly Review Executive Summary - Q[X] YYYY

**Review Period**: [Start date] - [End date]
**Review Date**: [Date]
**Reviewers**: [Specialists used]

## Overall Health Scores

| Dimension | Score | Status | Change from Last Quarter |
|-----------|-------|--------|--------------------------|
| **Security** | 88/100 | ✅ GOOD | +10 points |
| **Performance** | 92/100 | ✅ EXCELLENT | +15 points |
| **Architecture** | 9/10 | ✅ EXCELLENT | +2 points |

**Overall System Health**: ✅ EXCELLENT (90%+ across all dimensions)

## Critical Findings

**P0 CRITICAL** (must fix immediately):
- [count] security issues
- [count] performance bottlenecks
- [count] architectural concerns

**P1 HIGH** (fix within month):
- [count] security improvements
- [count] performance opportunities
- [count] refactoring candidates

## Strengths Identified

- ✅ [Security strength]
- ✅ [Performance strength]
- ✅ [Architecture strength]

## Recommendations

**Immediate** (This Month):
- P0 security fixes: [time estimate]
- P0 performance: [time estimate]
- P0 architecture: [time estimate]

**This Quarter**:
- P1 improvements: [time estimate]
- Pattern adoption: [specific patterns]

## Next Review

**Scheduled**: [Date 3 months from now]
**Focus**: [Based on this quarter's findings]
```

---

## 🎪 Implementation Sprint (Week 4)

### **Prioritize Across All Three Reviews**

**Combine P0s from all reviews**:

| Priority | Type | Issue | Impact | Effort | ROI |
|----------|------|-------|--------|--------|-----|
| P0-1 | Security | [endpoint] auth missing | CRITICAL | 30 min | 10x |
| P0-2 | Performance | [route] parallel queries | HIGH | 2 min | 500x |
| P0-3 | Security | [endpoint] validation bypass | CRITICAL | 15 min | 20x |
| P0-4 | Architecture | [file] 4,441 lines | MEDIUM | 2 days | 5x |

**Sort by ROI**: Highest ROI first (even if P1)

**Example decision**:
- P1 Performance (2 min, 40% gain, 500x ROI) → **Do first**
- P0 Security (30 min, critical fix, 10x ROI) → **Do second**
- P0 Architecture (2 days, maintenance, 5x ROI) → **Defer or schedule**

**Implementation approach**:
- Day 1-2: All P0 security fixes
- Day 3: Top 3 P0/P1 performance (highest ROI)
- Day 4-5: P0 architecture (if time permits)

---

## 📈 Quarterly Trends Tracking

### **Maintain Quarterly Dashboard**

**File**: `/cline_docs/reviews/quarterly-dashboard.md`

```markdown
# Quarterly Review Dashboard

## Q1 2026 (First Review)
**Security**: [score]/100 [status]
**Performance**: [score]/100 [status]
**Architecture**: [score]/10 [status]
**Notes**: First quarterly review. Establishes baselines.

## Q2 2026
**Security**: [score]/100 [status] ([delta] from Q1)
**Performance**: [score]/100 [status] ([delta] from Q1)
**Architecture**: [score]/10 [status] ([delta] from Q1)

## Trends
- Security: [trend]
- Performance: [trend]
- Architecture: [trend]

**Status**: [overall assessment]
```

**Track over time**: Identify if scores declining, stable, or improving

---

## 🔄 Monthly Quick Health Checks (Between Quarters)

**Run lightweight checks monthly** (30 minutes):

### **Month 1 (After Quarter)**:
```bash
# Verify P0 fixes holding
npm run test:all-validation  # Should pass
curl /api/health              # Should return 200

# Check error logs
# No new security violations
```

### **Month 2 (Mid-Quarter)**:
```bash
# Run automated scans
./scripts/audit-pov-access-completeness.sh      # Should pass
./scripts/audit-initialization-patterns.sh       # Should pass

# Bug class regression check (5 min)
# Verify no new unguarded callTool sites (exclude build artifacts and type defs)
grep -rn '\.callTool(' --include='*.js' --include='*.ts' . | grep -v node_modules | grep -v ensureObject | grep -v '.d.ts' | grep -v '.next/' | wc -l
# Expected: ~11 (all internal/safe as of Feb 2026)
# If count increases, check new sites have ensureObject guards

# Verify all Docker services pass req.body to handlePostMessage (exclude log lines)
grep -rn 'handlePostMessage' services/*/src/index.ts | grep -v 'req\.body' | grep -v console
# Expected: 0 results (all actual calls should pass req.body)

# BC11: Unhandled async fire-and-forget (5 min)
# Verify no setInterval calls with unguarded async callbacks
grep -rn 'setInterval' --include='*.js' --include='*.ts' lib/ | grep -v node_modules | grep -v '.d.ts' | grep -v '.next/'
# For each: verify async callbacks have .catch() — see defensive-code-sweep-discovery.md

# Defensive code sweep (5 min)
# Full sweep covers BC11 + TOCTOU + ensureObject gaps
# See: /.claude/knowledge/discoveries/defensive-code-sweep-discovery.md

# Transaction atomicity check (5 min)
# Find files with 3+ prisma writes but no $transaction — potential missing atomicity
grep -rL '\$transaction' --include='*.ts' lib/ app/ | \
  xargs grep -l 'await prisma\.' 2>/dev/null | \
  xargs grep -c 'await prisma\.' 2>/dev/null | \
  awk -F: '$2 > 2 {print}' | sort -t: -k2 -rn | head -10
# Expected: only fire-and-forget logging files (taskActivityService.ts)
# New entries need review — see transaction-atomicity-pattern.md

# Performance check
# Monitor slow query logs
# Check cache hit rates (if monitoring added)
```

### **Month 3 (Pre-Quarter)**:
```bash
# Prepare for quarterly
# Count new endpoints added
# Note any incidents or slowness reports
# Update discovery prompts if new patterns emerged
```

**Effort**: 30 min/month (vs 1 week/quarter)
**Benefit**: Catch issues early, prevent degradation

---

## Related Protocols

| Protocol | Role in Quarterly Review |
|----------|------------------------|
| `quarterly-review-protocol.md` | Week 1: Security review (endpoint audit, validation, authorization) |
| `performance-opportunity-discovery-protocol.md` | Week 2: Performance review (queries, caching, connection reuse) |
| `specialist-review-protocol.md` | Week 3: Architecture review (via architectural-review-specialist) |
| `bug-class-eradication-protocol.md` | Referenced in Week 1 regression checks |
| `system-health-stress-test-protocol.md` | Run before quarterly or after major deployments |
| `endpoint-security-audit-protocol.md` | Deep-dive security audit (used within Week 1) |

## Related Knowledge

| Resource | Purpose |
|----------|---------|
| `/.claude/knowledge/domain/mcp/bug-class-registry.md` | Bug class regression verification |
| `/.claude/knowledge/discoveries/defensive-code-sweep-discovery.md` | BC11 + TOCTOU + ensureObject gap sweep (Month 2) |
| `/.claude/knowledge/patterns/PATTERN-REGISTRY.md` | Pattern consistency checks (Week 3) |
| `/.claude/knowledge/patterns/transaction-atomicity-pattern.md` | Transaction atomicity audit (Week 2, Step 5) |
| `/cline_docs/reviews/quarterly-dashboard.md` | Quarterly trends tracking |

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2025-12-15 | 1.0 | Initial protocol |
| 2026-02-16 | 1.1 | Added bug class regression checks to Week 1 |
| 2026-02-16 | 1.2 | Fixed grep commands (excluded .next/ and console log lines), updated callTool expected count to ~11, replaced placeholder dashboard with template, removed conversational leftovers, replaced integration meta-commentary with cross-reference tables |
| 2026-02-20 | 1.3 | Added Step 5 Transaction Atomicity Audit to Week 2, added mid-quarter grep check, linked transaction-atomicity-pattern.md |
| 2026-02-26 | 1.4 | Added BC11 (unhandled async) to Week 1 regression checks, added defensive code sweep to Month 2, linked defensive-code-sweep-discovery.md |