# Discovery Reference Guide

**Purpose**: Map which discoveries to use when, and where they're referenced
**Created**: November 7, 2025
**Context**: After POV domain audit and quarterly review enhancement

---

## 📚 Complete Discovery Inventory

### One-Time Audit Discoveries (Current State)

**1. endpoint-security-audit.md**
- **Purpose**: Find all endpoints, categorize by method, check validation
- **When**: Initial domain audit, comprehensive security review
- **Time**: 15 minutes
- **Referenced By**: endpoint-security-audit-protocol.md
- **Feeds**: All 3 specialists (api-efficiency, sec-ops, validation-engine)

**2. middleware-patterns-discovery.md** ✨ ENHANCED (Nov 7)
- **Purpose**: Find middleware inventory, usage, boilerplate opportunities
- **When**: Before architecture reviews, refactoring planning
- **Time**: 15 minutes + 5 min (data loading section)
- **Referenced By**:
  * api-efficiency-specialist.md
  * architectural-review-specialist.md
  * quarterly-review-protocol.md (Discovery #5)
- **Feeds**: Architecture decisions, refactoring plans

**3. validation-discovery.md**
- **Purpose**: Map validation architecture, schema usage
- **When**: Before validation work, schema creation
- **Time**: 20 minutes
- **Referenced By**: validation-engine-specialist.md
- **Feeds**: Validation improvements, schema design

**4. api-efficiency-discovery.md**
- **Purpose**: Map API patterns, query optimization, N+1 prevention
- **When**: Performance reviews, API design
- **Time**: 30 minutes
- **Referenced By**: api-efficiency-specialist.md
- **Feeds**: Performance improvements, query optimization

**4a. facade-extraction-discovery.md** ⭐ NEW (Dec 18, 2025)
- **Purpose**: Analyze large files (>1,000 lines) for facade pattern extraction
- **When**: File >2,000 lines (CRITICAL), 1,000-2,000 lines (recommended)
- **Time**: 2 hours (comprehensive analysis)
- **Referenced By**:
  * architectural-review-specialist.md
  * database-manager-specialist.md (complementary query analysis)
- **Feeds**: Handler inventory, module structure, extraction order, query optimization roadmap
- **Success**: 32/32 extractions (100%), tasks/action route 4,441 → 449 lines (90%)
- **Pattern**: facade-handler-extraction-pattern.md (98% confidence)

**5. field-limit-alignment-discovery.md**
- **Purpose**: Check content field consistency (50KB standard)
- **When**: Quarterly reviews, schema updates
- **Time**: 30 minutes
- **Referenced By**: quarterly-review-protocol.md (Discovery #1)
- **Feeds**: Field standardization, prompt field alignment

**6. schema-application-audit-discovery.md**
- **Purpose**: Find schemas imported but not applied
- **When**: Quarterly reviews, validation audits
- **Time**: 45 minutes
- **Referenced By**: quarterly-review-protocol.md (Discovery #2)
- **Feeds**: Validation gap identification

**7. authorization-consistency-discovery.md**
- **Purpose**: Detect dual permission checks, incomplete queries
- **When**: Quarterly reviews, auth model changes
- **Time**: 15 minutes
- **Referenced By**: quarterly-review-protocol.md (Discovery #3)
- **Feeds**: Auth model consistency, security gaps

---

### Quarterly Trend Discoveries (Time-Series)

**8. pattern-adoption-trends-discovery.md** ⭐ NEW (Nov 7)
- **Purpose**: Track middleware adoption, file count, boilerplate, shortcuts
- **When**: QUARTERLY ONLY (trend detection)
- **Time**: 15 minutes
- **Referenced By**: quarterly-review-protocol.md (Discovery #5)
- **Feeds**: Pattern decay detection, developer training needs
- **Metrics**: Adoption %, file count, type assertions, shortcuts

**9. test-coverage-trends-discovery.md** ⭐ NEW (Nov 7)
- **Purpose**: Track test growth vs endpoint growth (quality decay)
- **When**: QUARTERLY ONLY (trend detection)
- **Time**: 10 minutes
- **Referenced By**: quarterly-review-protocol.md (Discovery #6)
- **Feeds**: Quality metrics, test planning
- **Metrics**: Test/endpoint ratio, coverage gaps

**10. type-safety-trends-discovery.md** ⭐ NEW (Nov 7)
- **Purpose**: Track type safety erosion (type assertions, any usage)
- **When**: QUARTERLY ONLY (trend detection)
- **Time**: 10 minutes
- **Referenced By**:
  * quarterly-review-protocol.md (quality section)
  * Code review checklists (preventive)
- **Feeds**: Type safety metrics, refactoring needs
- **Metrics**: Type safety score, assertion count, hot spots

---

## 📊 When to Use Which Discovery

### For Initial Domain Audit

**Sequence**:
1. endpoint-security-audit.md (find all endpoints)
2. middleware-patterns-discovery.md (find conversion opportunities)
3. validation-discovery.md (find existing schemas)
4. api-efficiency-discovery.md (find performance issues)

**Output**: Current state assessment → Implementation plan

---

### For Quarterly Reviews

**Sequence**:
1. field-limit-alignment-discovery.md (schema consistency)
2. schema-application-audit-discovery.md (validation gaps)
3. authorization-consistency-discovery.md (auth model)
4. Endpoint inventory (new endpoints since last quarter)
5. **pattern-adoption-trends-discovery.md** ⭐ QUARTERLY
6. **test-coverage-trends-discovery.md** ⭐ QUARTERLY
7. **type-safety-trends-discovery.md** ⭐ QUARTERLY (if needed)
8. middleware-patterns-discovery.md (Phase 6: data loading)

**Output**: Trend analysis → Regression detection → Action items

---

### For Specific Issues

**Architecture Review**:
- middleware-patterns-discovery.md (full discovery)
- pattern-adoption-trends-discovery.md (if quarterly)

**Validation Work**:
- validation-discovery.md
- schema-application-audit-discovery.md

**Performance Issues**:
- api-efficiency-discovery.md
- middleware-patterns-discovery.md (boilerplate = performance)

**Security Incident**:
- endpoint-security-audit.md
- authorization-consistency-discovery.md

**Code Quality Concerns**:
- type-safety-trends-discovery.md
- test-coverage-trends-discovery.md

**Large File Refactoring** (Dec 18, 2025):
- facade-extraction-discovery.md (files >1,000 lines)
- Pattern: facade-handler-extraction-pattern.md
- Complementary: database-manager-specialist for query analysis
- Success: 90% file size reduction, 100% success rate

---

## 🎯 Specialist References

**api-efficiency-specialist.md**:
- Primary: api-efficiency-discovery.md
- Additional: middleware-patterns-discovery.md (Nov 7, 2025)

**architectural-review-specialist.md**:
- Primary: architectural-review-discovery.md
- Additional: middleware-patterns-discovery.md (Nov 7, 2025)

**validation-engine-specialist.md**:
- Primary: validation-discovery.md
- Additional: middleware-patterns-discovery.md (Nov 7, 2025)

**sec-ops-specialist.md**:
- Primary: security-discovery.md
- Additional: middleware-patterns-discovery.md (Nov 7, 2025)

**boundary-contract-specialist.md**:
- Primary: boundary-contract-discovery.md
- Additional: (none currently)

---

## 📋 Discovery Selection Matrix

| Use Case | Current State | Trends | Both |
|----------|---------------|--------|------|
| **Initial Audit** | ✅ Yes | ❌ No | - |
| **Quarterly Review** | ✅ Yes | ✅ Yes | Recommended |
| **Security Incident** | ✅ Yes | ❌ No | - |
| **Refactoring** | ✅ Yes | ⚠️ Optional | - |
| **Code Review** | ⚠️ Selective | ❌ No | - |

---

## 🔄 Discovery Output Flow

### Current State Discoveries →
```
endpoint-security-audit.md
    ↓ (43 POV endpoints found)
middleware-patterns-discovery.md
    ↓ (21 routes with manual auth)
validation-discovery.md
    ↓ (11 existing schemas)
api-efficiency-specialist
    ↓ (89/100 score, architectural view)
```

**Output**: Current state snapshot → Implementation plan

---

### Quarterly Trend Discoveries →
```
pattern-adoption-trends-discovery.md
    ↓ (Middleware: Q1=100%, Q2=?, trend?)
test-coverage-trends-discovery.md
    ↓ (Ratio: Q1=1.06, Q2=?, trend?)
type-safety-trends-discovery.md
    ↓ (Score: Q1=77.5, Q2=?, trend?)
Quarterly Review Protocol
    ↓ (Action: If declining, trigger remediation)
```

**Output**: Trend analysis → Early warning → Preventive action

---

## 📝 Quick Reference Card

### By Discovery Type

**Current State** (What is broken NOW):
- endpoint-security-audit.md
- middleware-patterns-discovery.md (Phases 1-5)
- validation-discovery.md
- api-efficiency-discovery.md
- authorization-consistency-discovery.md

**Trends** (What is DEGRADING over time):
- pattern-adoption-trends-discovery.md
- test-coverage-trends-discovery.md
- type-safety-trends-discovery.md
- middleware-patterns-discovery.md (Phase 6: data loading assumptions)

**Quarterly** (Run every 3 months):
- field-limit-alignment-discovery.md
- schema-application-audit-discovery.md
- pattern-adoption-trends-discovery.md ⭐
- test-coverage-trends-discovery.md ⭐
- type-safety-trends-discovery.md ⭐

**Event-Driven** (Run when triggered):
- endpoint-security-audit.md (security incident)
- authorization-consistency-discovery.md (auth changes)
- middleware-patterns-discovery.md (refactoring)

---

## 🎯 Where Each Discovery is Referenced

### Pattern Adoption Trends
**Referenced In**:
- ✅ quarterly-review-protocol.md (Discovery #5)
- ✅ api-efficiency-specialist.md (already updated Nov 7)
- ✅ architectural-review-specialist.md (already updated Nov 7)

**Should Also Reference** (future):
- Code review checklists (check new PRs follow patterns)
- Onboarding docs (patterns to learn)

---

### Test Coverage Trends
**Referenced In**:
- ✅ quarterly-review-protocol.md (Discovery #6)

**Should Also Reference** (future):
- Sprint retrospectives (quality metrics)
- Definition of Done (test coverage requirements)

---

### Type Safety Trends
**Referenced In**:
- ✅ quarterly-review-protocol.md (quality metrics section)

**Should Also Reference** (future):
- Code review checklists (reject excessive type assertions)
- TypeScript upgrade planning (baseline metrics)

---

### Middleware Patterns (Phase 6: Data Loading)
**Referenced In**:
- ✅ api-efficiency-specialist.md (Nov 7)
- ✅ architectural-review-specialist.md (Nov 7)
- ✅ quarterly-review-protocol.md (Discovery #5)

**Should Also Reference**:
- withPOVAccess pattern documentation (middleware contract)
- Handler development guide (safe usage)

---

## 📊 Discovery Metrics Summary

| Discovery | Type | Time | Frequency | Referenced By |
|-----------|------|------|-----------|---------------|
| endpoint-security-audit | Current | 15m | As needed | Protocol |
| middleware-patterns (full) | Current | 20m | As needed | 3 specialists |
| validation-discovery | Current | 20m | As needed | validation-engine |
| api-efficiency-discovery | Current | 30m | As needed | api-efficiency |
| field-limit-alignment | Current | 30m | Quarterly | Quarterly protocol |
| schema-application-audit | Current | 45m | Quarterly | Quarterly protocol |
| authorization-consistency | Current | 15m | Quarterly | Quarterly protocol |
| **pattern-adoption-trends** | **Trend** | **15m** | **Quarterly** | **Quarterly protocol** |
| **test-coverage-trends** | **Trend** | **10m** | **Quarterly** | **Quarterly protocol** |
| **type-safety-trends** | **Trend** | **10m** | **Quarterly** | **Quarterly protocol** |

**Total Quarterly Discovery Time**: 30+45+15+15+10+10 = **125 minutes (~2 hours)**

---

## ✅ Best Practices

**1. Current State First, Trends Second**:
- Run current state discoveries to get baseline
- Then run trend discoveries to compare with last quarter
- Trends are meaningless without current baseline

**2. Save All Outputs**:
```bash
# Create quarterly directory
mkdir -p cline_docs/reviews/quarterly-review-$(date +%Y-%m-%d)

# Save discovery outputs
./run-discovery.sh > discovery-output.txt
cp discovery-output.txt cline_docs/reviews/quarterly-review-*/

# Next quarter: Compare with previous outputs
```

**3. Track Metrics Over Time**:
- Keep CSV or JSON of quarterly metrics
- Plot trends (Excel, Google Sheets)
- Visualize decay early

**4. Action on Thresholds**:
- Pattern adoption < 90%: Training needed
- Test ratio < 1.0: Quality crisis
- Type safety < 75: Type cleanup sprint

---

**Created**: 2025-11-07
**Purpose**: Discovery selection and usage guide
**Audience**: Quarterly reviewers, specialists, developers

**END OF DISCOVERY REFERENCE GUIDE**
