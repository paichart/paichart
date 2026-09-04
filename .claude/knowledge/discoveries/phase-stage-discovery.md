# Phase & Stage Discovery Prompt v3.2

## 🆕 2026-06-23 Session — Run These FIRST (POV status machine: blocked-task gates query by povId)
```bash
# F4 BUG CLASS (status.ts): blocked/task-state gates in the POV status state machine MUST query by
# povId — prisma.task.count({ where: { povId, status: 'BLOCKED' } }) — NOT read phases[].tasks.
# Task.phaseId is nullable (onDelete:SetNull) so a BLOCKED task on a STAGE is invisible to a
# phase-level read → the gate passes with live blocked work. Shared predicate: povHasBlockedTask().
grep -nE "povHasBlockedTask|status: 'BLOCKED'|phases\?\." lib/pov/services/status.ts
# Transition table (recovery/terminal edges added 2026-06-22: STALLED→IN_PROGRESS, STALLED→LOST,
# VALIDATION→IN_PROGRESS; WON/LOST terminal) lives in status.ts `transitions` — READ it, don't trust a copy.
# Status changes are now audit-logged (trackActivity 'POV_STATUS_CHANGE') at the 2 enforcement sites
# (put.ts, pov-update-handler.ts); the GUI status <Select> is permissive — backend is the sole gate.
#
# TWO INERT (structurally-present, functionally-dead) bits in status.ts — don't mistake them for live logic:
#   • KPI gate on VALIDATION→WON is a NO-OP: the 'KPI' condition's check `return true` (status.ts ~:62-67),
#     so 'KPI targets not met' can never fire — WON is gated ONLY by the sibling no-BLOCKED-task check.
#   • transition.notifications is DEAD CONFIG (status.ts ~:119): validateTransition reads only .conditions;
#     nothing dispatches the POV_WON/notification blocks. (Verified 2026-07-03.)
grep -nE "type: 'KPI'|return true|transition\.notifications|\.conditions" lib/pov/services/status.ts
```

## 🆕 2026-06-11 Health-Run Addendum — Run These FIRST (June-9 BC14/BC19 locking reality)

v3.1's atomic-operations claims re-proved LIVE (FOR UPDATE NOWAIT deployed, povId field-leakage
guard holds at 2 matches) — but the locking layer was HARDENED 2026-06-09 and the doc predates it:

```bash
# 1. BC14/BC19 markers in phase.ts — NOWAIT sites now documented as 40001/55P03-abortable
grep -n "BC14/BC19" lib/pov/services/phase.ts   # expect 2 (:261, :423 areas)

# 2. Raw FOR UPDATE rules: REAL table names ("Phase" quoted, stages unquoted), NO ::uuid casts
#    (CUIDs are text — the 2026-06-09 '"phases"/::uuid' bug class)
grep -rn "FOR UPDATE" lib/pov/ app/api/pov/ --include="*.ts" -B1 | grep -iE "FROM |::uuid" | head -8

# 3. Serialization-retry canon: RR/Serializable sites wrap in withSerializationRetry or are
#    accepted-loud — triage per database-management-discovery 2026-06-09 block + SR2 decision
grep -rn "withSerializationRetry" lib/pov/services/ | head -4
```


## Discovery Objective
Map and understand the Phase and Stage management system, including atomic operations, event-driven architecture, race condition resolution, templates, workflows, ordering logic, and the **critical Save POV nested update workflow**.

## 🚨 CRITICAL: Field Leakage in Task Creation (2025-11-07)

**Issue**: Tasks created via Save POV button disappeared (povId = null)
**Location**: `lib/pov/handlers/put.ts` lines 596-770 (task processing in transaction)
**Root Cause**: task.create missing `povId` field (lines 697, 750)

**Discovery Commands**:

```bash
# 1. Find all task creation locations (check for field leakage)
grep -rn "\.task\.create\|tx\.task\.create" lib/ app/ --include="*.ts" | grep -v "node_modules"

# 2. Verify task.create includes povId
grep -B 5 -A 25 "tx\.task\.create" lib/pov/handlers/put.ts | grep "povId:"
# Expected: 2 matches (re-proven 2026-06-11 — now at :597/:642; trust the count, not the line numbers)

# 3. Find Save POV transaction (use -F: $ is a regex end-anchor, so a plain regex never matches)
grep -nF 'prisma.$transaction' lib/pov/handlers/put.ts
# Expected: 1 match at put.ts:484 (3-12 sub-writes inside; nested task loop ~:496-524)

# 4. Check nested task processing
grep -n "requestData\.tasks\|validated\.tasks" lib/pov/handlers/put.ts
```

**Pattern**: `/.claude/knowledge/patterns/field-leakage-prevention-pattern.md`

**Fixed**: Commit f2a312f (Nov 7, 2025) - Added povId to both task.create calls

## Key Investigation Areas
1. **NEW**: Atomic transaction implementation for stage creation (`handleStageCreate`)
2. **NEW**: Event-driven phase-stage notifications (`PhaseStageEventEmitter`)
3. **NEW**: Race condition prevention and Claude Desktop integration fixes
4. Phase template system and workflow configuration
5. Phase type ordering (PLANNING → EXECUTION → REVIEW)
6. Stage status transitions and lifecycle
7. Phase/Stage database relationships
8. POV Editor integration patterns
9. **NEW**: Performance improvement plan 2 implementations

## Search Strategy Sections

### 1. Atomic Operations & Race Condition Analysis (NEW - HIGH PRIORITY)
```bash
# Examine atomic transaction implementation
# NOTE (2026-06-15): logic moved out of route.ts (now a thin delegator to TasksActionRouter)
# into the stage-create-handler during the dispatcher extraction. Use -F: $ is a regex anchor.
echo "=== Atomic Stage Creation ==="
grep -nF 'prisma.$transaction' /home/steve/copov15/lib/mcp/tasks/action/handlers/stage/stage-create-handler.ts
# Expected: 1 match at ~:388 (atomicOrder calc ~:397)

# Check event-driven system
echo -e "\n=== Event-Driven Phase-Stage System ==="
ls -la /home/steve/copov15/lib/events/phase-stage-events.ts

# Review performance improvements
echo -e "\n=== Performance Improvement Plan 2 ==="
head -30 /home/steve/copov15/cline_docs/performance-improvement-plan2.md

# Check stage order collision prevention (logic moved to stage-create-handler — see note above)
echo -e "\n=== Stage Order Calculation ==="
grep -A 10 -B 5 "getNextStageOrder\|atomicOrder" /home/steve/copov15/lib/mcp/tasks/action/handlers/stage/stage-create-handler.ts
```

### 2. Phase Service Architecture
```bash
# Find phase services
echo "=== Phase Services ==="
find lib -name "*phase*" -type f -name "*.ts" | grep -E "(service|handler)" | head -15

# Check phase template implementation
echo -e "\n=== Phase Templates ==="
ls -la lib/pov/phase-templates/*.ts 2>/dev/null | head -10

# Find phase validation
echo -e "\n=== Phase Validation ==="
grep -l "validatePhase\|PhaseValidation" --include="*.ts" -r lib/ | head -5
```

### 3. Phase Type Ordering Investigation
```bash
# Find the phase ordering fix
echo "=== Phase Type Schema Fix ==="
grep -n "type.*PhaseType.*optional" app/api/pov/*/phases/route.ts 2>/dev/null

# Check sorting implementation
echo -e "\n=== Phase Sorting Logic ==="
grep -A 10 "typeOrder.*PLANNING" lib/pov/services/phase.ts 2>/dev/null

# Find phase type usage
echo -e "\n=== Phase Type Enum ==="
grep "enum PhaseType\|PLANNING.*EXECUTION.*REVIEW" --include="*.ts" -r lib/ | head -5
```

### 3. Stage Management System
```bash
# Find stage model and status
echo "=== Stage Implementation ==="
grep -n "model Stage" prisma/schema.prisma 2>/dev/null

# Check stage status transitions
echo -e "\n=== Stage Status Flow ==="
grep "StageStatus\|PENDING.*ACTIVE.*COMPLETED" --include="*.ts" -r lib/ | head -10

# Find stage ordering
echo -e "\n=== Stage Ordering ==="
grep -r "reorderStages\|stage.*order" --include="*.ts" lib/ | head -10
```

### 4. Phase-Stage Relationships (ENHANCED - Phase 1 Optimization)
```bash
# Check database relationships
echo "=== Phase-Stage Relations ==="
grep -A 5 "stages.*Stage\[\]" prisma/schema.prisma 2>/dev/null

# Check POV Mapper Implementation (NEW)
echo -e "\n=== POV Mapper with Phase Optimization ==="
grep -n "createPOVMapper\|getPhases.*includeTaskCount" lib/database/query-mappers.ts | head -5
echo "POV-Phase relationship optimized with Proxy pattern lazy loading"

# Check Phase Mapper (NEW) 
echo -e "\n=== Phase Mapper with Task Strategy ==="
grep -n "createPhaseMapper\|getTasks.*strategy\|getTaskSummary" lib/database/query-mappers.ts | head -5
echo "Phase-Task relationship optimized with Strategy pattern"

# Find cascade operations
echo -e "\n=== Cascade Operations ==="
grep "onDelete.*Cascade" prisma/schema.prisma | grep -E "(Phase|Stage)" | head -5

# Check stage creation
echo -e "\n=== Stage Creation ==="
grep -r "createStage\|prisma.stage.create" --include="*.ts" lib/ | head -5

# Performance optimization check (NEW)
echo -e "\n=== Phase-POV Performance Optimization ==="
grep -r "MinimalSelects\.phase\|MinimalSelects\.pov" --include="*.ts" lib/ | wc -l
echo "Files using optimized select patterns for phases/POVs"
```

### 5. POV Editor Integration
```bash
# Check POV Editor phase usage
echo "=== POV Editor Integration ==="
find components/poveditor -name "*.tsx" | xargs grep -l "phase" | head -10

# Find phase API calls
echo -e "\n=== Phase API Usage ==="
grep -r "/api/pov.*phases" --include="*.tsx" components/ | head -5

# Check context usage
echo -e "\n=== Phase Context ==="
grep -r "phases.*map\|phases.*sort" --include="*.tsx" components/poveditor/ | head -5

# CRITICAL: Check display component sorting
echo -e "\n=== Display Component Phase Sorting ==="
grep -r "phases.*sort.*order\|Object.values(phases)" --include="*.tsx" components/poveditor/ -A 2 | head -15

# Check HierarchicalPhaseView specifically
echo -e "\n=== HierarchicalPhaseView Sorting ==="
grep -n "sort.*order\|typeOrder" components/poveditor/pov/components/HierarchicalPhaseView.tsx 2>/dev/null | head -5

# Check PhasesSection component
echo -e "\n=== PhasesSection Display ==="
grep -n "phases\|sort" components/poveditor/pov/sections/PhasesSection.tsx 2>/dev/null | head -5
```

### 6. System Health Validation
```bash
# Quick health check
echo "=== Phase/Stage System Health ==="
echo "Phase service: $([ -f lib/pov/services/phase.ts ] && echo '✅ EXISTS' || echo '❌ MISSING')"
echo "Phase API route: $([ -f app/api/pov/[povId]/phases/route.ts ] && echo '✅ EXISTS' || echo '❌ MISSING')"
echo "Stage model: $(grep -c "model Stage" prisma/schema.prisma 2>/dev/null || echo '0') entries"
echo "Phase ordering fix: $(grep -c 'type.*PhaseType.*optional' app/api/pov/*/phases/route.ts 2>/dev/null || echo 'NOT FOUND')"
echo "Sorting implementation: $(grep -c 'typeOrder.*PLANNING' lib/pov/services/phase.ts 2>/dev/null || echo 'NOT FOUND')"
```

## Debugging Helpers
```bash
# Verify the phase ordering fix is in place
echo "=== Verify Phase Fix ==="
grep -B 2 -A 2 "type.*PhaseType" app/api/pov/\[povId\]/phases/route.ts 2>/dev/null

# Check current sorting logic
echo -e "\n=== Current Sort Implementation ==="
sed -n '/getPoVPhases/,/^[[:space:]]*}/p' lib/pov/services/phase.ts | head -40
```

## Risk Assessment Matrix

| Risk Area | Severity | Likelihood | Impact | Mitigation |
|-----------|----------|------------|--------|------------|
| Frontend Display Sorting | HIGH | HIGH | Wrong phase order in UI | Check HierarchicalPhaseView |
| Phase Type Missing | HIGH | LOW | Wrong order display | Schema validation fix applied |
| Backend/Frontend Mismatch | HIGH | MEDIUM | Correct data, wrong display | Verify both layers |
| Stage Order Corruption | MEDIUM | LOW | UI confusion | Reorder transactions |
| Phase Date Overlap | MEDIUM | MEDIUM | Invalid timelines | Validation service |
| Stage Transition Failure | HIGH | LOW | Workflow stuck | Status validation |
| Template Sync Issues | LOW | LOW | Inconsistent phases | Version tracking |
| Cascade Delete Errors | HIGH | LOW | Data loss | Foreign keys |
| POV Editor Sync | MEDIUM | LOW | Stale data | API polling |
| Phase Validation Skip | MEDIUM | LOW | Invalid data | Schema enforcement |

## Progress Tracking

Track discovery execution with visual progress indicators:

```markdown
📊 Discovery Progress: Phase & Stage Discovery
═══════════════════════════════════════
Overall Progress: [░░░░░░░░░░] 0%

Section Progress:
□ Section 1: Phase Service Architecture
□ Section 2: Phase Type Ordering Investigation
□ Section 3: Stage Management System
□ Section 4: Phase-Stage Relationships
□ Section 5: POV Editor Integration
□ Section 6: System Health Validation

Current Status: 🚀 Starting Discovery
Commands: 0/32 executed
Findings: 0 critical ⚠️ | 0 warnings ⚡ | 0 info ℹ️
⏱️ Time: 0 minutes
```

### Progress Update Pattern
Update after each section completion:
```markdown
✅ Section 1: Phase Architecture [██████████] 100%
   Commands: 8/8 | Found: Phase service, 5 templates
🔄 Section 2: Type Ordering [███░░░░░░░] 30%
   Commands: 3/10 | Checking display components...
```

## Visual Handover Protocol

When discoveries require specialist expertise, use this handover format:

```markdown
--- DISCOVERY HANDOVER ---
Current Role: discovery-scout ✅
Discovery Progress: [██████████] 100% Complete

## Discovery Summary:
📊 **Components Found:** Phase service, Stage model ✅
⚠️ **Critical Issues:** Frontend sorting bug in HierarchicalPhaseView
🔍 **Areas Investigated:** 
   - ✅ Phase type ordering validated
   - ✅ Stage transitions mapped
   - ⚠️ Frontend display sorting incorrect
   - ❌ Cascade operations not tested

## Context for Specialist:
- Key Finding: Backend sorts correctly, frontend overrides
- Risk Area: HierarchicalPhaseView.tsx sorts by order only
- Focus Needed: Fix frontend display component sorting

Delegating to: phase-stage-specialist
Reason: Deep phase/stage expertise required
Priority: Fix display component sorting logic

--- ACTIVATING PHASE-STAGE-SPECIALIST ---
```

### Specialist Reception Template
```markdown
--- PHASE-STAGE-SPECIALIST ACTIVATED ---

## Handover Acknowledged ✅
Inherited from: discovery-scout
Discovery Completeness: [██████████] 100%

## Context Received:
📊 **Components:** Phase service, Stage model ✅
⚠️ **Issues:** Frontend sorting bug acknowledged
🔍 **Focus Areas:** HierarchicalPhaseView.tsx priority

## My Specialist Analysis Starting:
[░░░░░░░░░░] 0% → Analyzing display components...
[████░░░░░░] 40% → Reviewing sorting logic...
[██████████] 100% → Analysis complete ✅

## Specialist Findings:
1. HierarchicalPhaseView needs type-aware sorting
2. PhasesSection also affected
3. Backend service layer correct
```

## NEW: Critical Implementation Analysis (2025-08-21)

### 8. Atomic Transaction Investigation
```bash
# Examine atomic stage creation implementation
# NOTE (2026-06-15): logic lives in stage-create-handler.ts, not route.ts (thin TasksActionRouter delegator).
echo "=== Atomic Transaction Implementation ==="
grep -A 20 "atomic transaction for collision prevention" /home/steve/copov15/lib/mcp/tasks/action/handlers/stage/stage-create-handler.ts
# Expected: 1 match at ~:386 (atomicOrder calc ~:397)

# Check transaction safety
echo -e "\n=== Race Condition Prevention ==="
grep -A 15 "tx.stage.findFirst" /home/steve/copov15/lib/mcp/tasks/action/handlers/stage/stage-create-handler.ts
# Expected: 1 match at ~:390 (lastStage lookup inside the $transaction)

# Verify Claude Desktop fix
echo -e "\n=== Claude Desktop Integration Fix ==="
grep -B 5 -A 10 "created successfully via MCP" /home/steve/copov15/lib/mcp/tasks/action/handlers/stage/stage-create-handler.ts
# Expected: 2 matches (atomic path ~:447, non-atomic path ~:495)
```

### 9. Event-Driven System Analysis
```bash
# Check event system implementation
echo "=== Phase-Stage Event System ==="
cat /home/steve/copov15/lib/events/phase-stage-events.ts | head -50

# Verify PostgreSQL NOTIFY integration
echo -e "\n=== PostgreSQL Event Integration ==="
grep -n "NOTIFY.*stage_events\|emitStageEvent" /home/steve/copov15/lib/events/phase-stage-events.ts

# Check event emission in operations (in stage-create-handler.ts, not route.ts — see §8 note)
echo -e "\n=== Event Emission Integration ==="
grep -A 5 -B 5 "emitStageEvent\|getPhaseStageEventEmitter" /home/steve/copov15/lib/mcp/tasks/action/handlers/stage/stage-create-handler.ts
# Expected: import ~:117, emitter call ~:426-427
```

## Discovery Execution Notes
- **NEW PRIORITY**: Verify atomic transaction implementation and event system operation
- **CRITICAL SUCCESS**: Confirm Claude Desktop integration working (0% → 100% success rate)
- Focus on phase type ordering issue
- Verify the fix is properly applied
- **CRITICAL**: Check BOTH backend sorting AND frontend display sorting  
- Check stage transition workflows
- Validate cascade operations
- Test POV Editor integration
- **Always check HierarchicalPhaseView.tsx for display bugs**

## Output Format
```
PHASE & STAGE DISCOVERY REPORT v3.0
===================================
Generated: [timestamp]
Scope: Phase and Stage management system with atomic operations and event-driven architecture

ATOMIC OPERATIONS & RACE CONDITION STATUS (NEW - HIGH PRIORITY)
--------------------------------------------------------------
□ Atomic Transactions: [IMPLEMENTED/PENDING] in handleStageCreate()
□ Stage Order Collisions: [RESOLVED/ACTIVE] via transaction-based calculation  
□ Claude Desktop Integration: [SUCCESS_RATE]% (target: 100%)
□ Race Condition Prevention: [ACTIVE/INACTIVE] with database locking
□ Response Times: [XXXms] (target: <300ms, was: infinite hangs)

EVENT-DRIVEN ARCHITECTURE STATUS (NEW)
--------------------------------------
□ PhaseStageEventEmitter: [OPERATIONAL/PENDING] 
□ PostgreSQL NOTIFY/LISTEN: [WORKING/BROKEN] for real-time updates
□ Event Emission Integration: [ACTIVE/INACTIVE] in stage operations
□ Real-time UI Updates: [READY/NOT_READY] foundation established
□ WebSocket Broadcasting: [ENABLED/DISABLED] for phase-stage changes

ARCHITECTURE OVERVIEW
-------------------
□ Phase System
  - Service: [location]
  - Templates: [count]
  - Validation: [status]
  
□ Stage System  
  - Status flow: [states]
  - Ordering: [method - NEW: atomic transaction-based]
  - Transitions: [status]

PHASE ORDERING FIX
-----------------
□ Bug Status: [FIXED/BROKEN]
□ Schema Fix Location: [line:file]
□ Sorting Logic: [location]
□ Type Order: PLANNING(0) → EXECUTION(1) → REVIEW(2)

CRITICAL FINDINGS
----------------
1. [Finding with impact]
2. [Integration status]

RECOMMENDATIONS
--------------
1. [Action items]

SYSTEM HEALTH: [score]/10
```

## Phase 1 Performance Optimization Integration (REFERENCE)

### POV-Phase Relationship Optimization (Tasks 4-6)
```bash
# POV mapper with phase lazy loading
echo "=== POV-Phase Optimization ==="
echo "Location: lib/database/query-mappers.ts (createPOVMapper)"  
echo "Features: Proxy pattern lazy loading, selective phase expansion"
echo "Performance: Context retrieval optimized, relationship loading on-demand"

# Check POV handlers optimization
grep -r "POV.*handler.*optimization\|POV.*N.1.*fix" --include="*.ts" lib/pov/ | head -3
```

### Phase-Task Relationship Optimization
```bash
# Phase mapper with task strategy patterns
echo "=== Phase-Task Strategy Optimization ==="
echo "Location: lib/database/query-mappers.ts (createPhaseMapper)"
echo "Features: Strategy pattern (minimal/summary/full), Task count aggregation"
echo "Performance: Selective task loading, efficient task summaries"

# Minimal selects for phases
grep -r "MinimalSelects\.phase\|MinimalSelects\.pov" --include="*.ts" lib/ | wc -l
echo "Files using optimized select patterns"
```

### Performance Impact on Phase/Stage System
- **POV Context Building**: Optimized with Proxy pattern lazy loading
- **Phase Task Loading**: Strategy pattern enables selective data retrieval
- **Task Count Aggregation**: Efficient _count queries vs full relation loading
- **Relationship Caching**: Individual mappers maintain cache for repeated access

### Query Mappers Integration
The query mappers system now handles:
- POV → Phases relationship with lazy loading
- Phase → Tasks relationship with strategy patterns  
- Phase → POV back-reference with minimal data
- Task count summaries without loading full task data

## Common Pitfalls to Check
1. **Backend works, Frontend doesn't**: Service layer might sort correctly but display components may not
2. **HierarchicalPhaseView**: This component often has its own sorting logic - CHECK IT!
3. **PhasesSection**: Another display component that might override backend sorting
4. **Object.values()**: Converting phase objects to arrays can lose ordering
5. **NEW**: Check mapper usage vs direct includes - mappers provide better performance

## Week 4 Implementation Verification (Oct 30, 2025)

### Atomic Transaction Patterns
```bash
# Verify FOR UPDATE NOWAIT locking deployed
grep -r "FOR UPDATE NOWAIT" app/api lib/ --include="*.ts"
echo "Atomic transaction with row-level locking (prevents race conditions)"

# Verify Serializable isolation level
grep -r "isolationLevel.*Serializable" lib/ --include="*.ts"
echo "Transaction isolation preventing phantom reads"

# Check atomic order calculation
grep -r "atomicOrder\|Atomic order" app/api lib/ --include="*.ts"
echo "Order calculation within transactions"
```

### Event Emission Patterns
```bash
# Verify PhaseStageEventEmitter integration
grep -r "getPhaseStageEventEmitter" app/api --include="*.ts"
echo "Event emitter imports (should be in all mutation endpoints)"

# Check event emission calls
grep -rn "emitPhaseEvent\|emitStageEvent" app/api lib/ --include="*.ts" | grep -v "function emit" | wc -l
echo "Event emission call sites (expect 10 across 6 files as of 2026-06-11 — emission consolidated toward services/handlers; the old '12 endpoints' framing predates the extraction)"

# Verify graceful degradation
grep -A 3 "emitPhaseEvent\|emitStageEvent" app/api --include="*.ts" | grep "catch"
echo "Error handling prevents event failures from blocking operations"
```

### Rate Limiting & Audit Logging
```bash
# Verify rate limiting applied
grep -r "phaseStageMutationLimiter\|reorderLimiter" app/api --include="*.ts"
echo "Rate limiting on phase/stage operations"

# Check audit logging
grep -r "logPhaseStageOperation\|calculateDeleteSeverity" app/api lib/ --include="*.ts"
echo "Audit logging (shows in admin/audit page)"
```

### 10. Rich Activity Logging for Phase/Stage Changes (Jan 2026)
```bash
# Phase/Stage activity logging helpers
echo "=== Phase/Stage Activity Logging ==="
grep -rn "logPhaseChange\|logStageChange" lib/ --include="*.ts" | head -10
echo "Fire-and-forget activity logging for phase/stage operations"

# TaskActivityAction for phase/stage
echo -e "\n=== Phase/Stage Activity Types ==="
grep -E "PHASE_CHANGED|STAGE_CHANGED" prisma/schema.prisma
echo "PHASE_CHANGED and STAGE_CHANGED activity types"

# Activity details fields for phase/stage
echo -e "\n=== Activity Details Fields ==="
grep -A 10 "oldPhaseName\|newPhaseName\|oldStageName\|newStageName" lib/tasks/types/ --include="*.ts" | head -15

# Usage in stage handlers
echo -e "\n=== Stage Handler Activity Integration ==="
grep -B 5 -A 10 "logStageChange" lib/pov/handlers/ --include="*.ts" | head -20

# Usage in phase handlers
echo -e "\n=== Phase Handler Activity Integration ==="
grep -B 5 -A 10 "logPhaseChange" lib/pov/handlers/ --include="*.ts" | head -20
```

