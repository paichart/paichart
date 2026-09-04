# Task Dependency Discovery Prompt v2.1

## 🆕 2026-06-11 Health-Run Addendum — Circular Detection is IMPLEMENTED (do not re-add)

v2.0 below frames circular-dependency detection as a missing TODO ("2 circular dependency
risks"). That was true when written; it is NOT true now:

```bash
# Canonical detection: lib/utils/graph.ts (checkDependencyCycle, :34) — used by BOTH
# task-create AND task-update MCP handlers:
grep -rln "checkDependencyCycle" lib/ --include="*.ts" | grep -v test   # expect 3 (graph.ts + 2 handlers)

# CI gate (part of test:all-validation): cycle-detection invariant incl. self-cycle A→A
grep -n "checkForDependencyCycles\|self-cycle" scripts/test-task-dependencies.ts | head -3
npm run test:task-dependencies

# The ONE surviving TODO is the legacy analytics flag (taskService.ts:246
# 'circularDependencies: false // TODO') — an unwired report field, NOT the detection:
grep -n "TODO: Implement circular" lib/services/taskService.ts   # expect 1

# 2026-07-15 (CC4, program-harness Session A): depth limit is SINGLE-SOURCE — GraphLimits.MAX_DEPTH
# (=20), imported at all four enforcement sites; the old hardcoded-10 drift is pinned gone:
grep -rn "depth >= 10" lib/ app/ | grep -v node_modules        # expect 0
grep -rln "GraphLimits" lib/ app/ | grep -v node_modules       # expect 6 (was 5; mark-forward-cone.ts added since — graph.ts + 2 MCP handlers + 2 REST routes + mark-forward-cone —
                                                               # the task-scoped route was a 5th site the first CC4 sweep
                                                               # missed; caught by THIS prove-grep 2026-07-15)

# June-2026 pipeline wiring: task.create accepts dependencyIds (validated, cycle-checked)
grep -n "dependencyIds" lib/mcp/tasks/action/handlers/task/task-create-handler.ts | head -3
```

Sections below that hunt for "TODO circular" or report "circular dependency risks" describe
the PRE-implementation state — read them as historical.


## Discovery Objective
Map and understand task dependencies, relationships, ordering algorithms, parent-child hierarchies, and bulk operations within the task management system.

## Key Investigation Areas
1. Task dependency implementation and validation
2. Circular dependency detection status
3. Parent-child task relationships
4. Task ordering algorithms
5. Bulk operations and performance
6. Cross-task workflow orchestration

## Search Strategy Sections

### 1. Dependency Model Architecture
```bash
# Find dependency model
echo "=== Task Dependency Model ==="
grep -n "model TaskDependency" prisma/schema.prisma 2>/dev/null

# Check dependency relationships
echo -e "\n=== Dependency Fields ==="
grep -A 5 "TaskDependency" prisma/schema.prisma | grep -E "taskId|dependsOnId" | head -5

# Count dependency references
echo -e "\n=== Dependency Usage ==="
echo "Schema references: $(grep -c "TaskDependency" prisma/schema.prisma)"
echo "Code references: $(grep -c "TaskDependency" lib/tasks/services/task.ts)"
```

### 2. Circular Dependency Detection
```bash
# Find TODO items for circular detection
echo "=== Circular Dependency TODOs ==="
grep -n "TODO.*circular\|TODO.*cycle" lib/tasks/services/task.ts lib/services/taskService.ts 2>/dev/null

# Check for cycle detection implementation
echo -e "\n=== Cycle Detection Code ==="
grep -r "circular\|cycle.*dependen" --include="*.ts" lib/ -i | head -10

# Find validation logic
echo -e "\n=== Dependency Validation ==="
grep -r "validateDependen\|checkDependen" --include="*.ts" lib/ | head -5
```

### 3. Dependency CRUD Operations
```bash
# Create dependencies
echo "=== Create Dependencies ==="
grep -A 10 "createTaskDependencies" lib/tasks/services/task.ts | head -15

# Update dependencies
echo -e "\n=== Update Dependencies ==="
grep -A 10 "updateTaskDependencies" lib/tasks/services/task.ts | head -15

# Dependency diff logic
echo -e "\n=== Dependency Diff ==="
grep -B 2 -A 5 "dependenciesToAdd\|dependenciesToRemove" lib/tasks/services/task.ts | head -15
```

### 4. Parent-Child Relationships
```bash
# Parent task field
echo "=== Parent-Child Support ==="
grep "parentTaskId" lib/tasks/services/task.ts | head -5

# Sub-task queries
echo -e "\n=== Sub-task Patterns ==="
grep -r "parentTask\|subTask\|childTask" --include="*.ts" lib/ | head -10

# Cascade operations
echo -e "\n=== Cascade Handling ==="
grep "onDelete.*Cascade" prisma/schema.prisma | grep -i task | head -5
```

### 5. Task Ordering Algorithms
```bash
# Order calculation pattern
echo "=== Order Calculation ==="
grep -B 2 -A 2 "order.*1000\|nextOrder" lib/tasks/services/task.ts | head -10

# Stage-based ordering
echo -e "\n=== Stage-Task Ordering ==="
grep "stageId.*order\|order.*stageId" lib/tasks/services/task.ts | head -5

# Reorder operations
echo -e "\n=== Reorder Logic ==="
grep -r "reorderTasks\|task.*reorder" --include="*.ts" lib/ | head -5
```

### 6. Bulk Operations
```bash
# Bulk update route
echo "=== Bulk Operations ==="
ls -la app/api/tasks/bulk/*/route.ts 2>/dev/null

# Bulk update implementation
echo -e "\n=== Bulk Update Code ==="
grep "export async function" app/api/tasks/bulk/update/route.ts 2>/dev/null

# Bulk service methods
echo -e "\n=== Bulk Service ==="
ls -la lib/services/taskBulkService.ts 2>/dev/null && grep "export" lib/services/taskBulkService.ts | head -5
```

### 7. Dependency Queries
```bash
# Find blocking/blocked queries
echo "=== Dependency Queries ==="
grep -A 5 "blockedBy\|blocking" lib/services/taskService.ts 2>/dev/null | head -15

# Dependency includes
echo -e "\n=== Dependency Fetching ==="
grep -B 2 -A 2 "include.*dependen\|dependen.*include" lib/tasks/services/task.ts | head -10

# Bidirectional queries
echo -e "\n=== Bidirectional Dependencies ==="
grep "dependsOn\|dependents" lib/services/taskService.ts | head -5
```

### 8. System Health Validation
```bash
echo "=== Dependency System Health ==="
echo "TaskDependency model: $(grep -c 'model TaskDependency' prisma/schema.prisma) entries"
echo "Circular detection TODOs: $(grep -c 'TODO.*circular\|TODO.*cycle' lib/tasks/services/task.ts lib/services/taskService.ts 2>/dev/null)"
echo "Parent-child support: $(grep -c 'parentTaskId' lib/tasks/services/task.ts)"
echo "Bulk operations: $([ -f app/api/tasks/bulk/update/route.ts ] && echo '✅ EXISTS' || echo '❌ MISSING')"
echo "Order calculation: $(grep -c '1000' lib/tasks/services/task.ts) references"
echo "Dependency methods: $(grep -c 'Dependen' lib/tasks/services/task.ts) references"
```

## Debugging Helpers
```bash
# Check dependency creation pattern
echo "=== Dependency Creation Pattern ==="
sed -n '/createTaskDependencies/,/^[[:space:]]*}/p' lib/tasks/services/task.ts | head -20

# Verify order calculation
echo -e "\n=== Order Calculation Logic ==="
grep -B 5 -A 5 "nextOrder.*1000" lib/tasks/services/task.ts

# Check for Promise.all usage
echo -e "\n=== Parallel Processing ==="
grep "Promise.all.*dependen" lib/tasks/services/task.ts
```

## Progress Tracking

Track discovery execution with visual progress indicators:

```markdown
📊 Discovery Progress: Task Dependency Discovery
══════════════════════════════════════════════════
Overall Progress: [░░░░░░░░░░] 0%

Section Progress:
□ Section 1: Dependency Model Architecture
□ Section 2: Circular Dependency Detection
□ Section 3: Dependency CRUD Operations
□ Section 4: Parent-Child Relationships
□ Section 5: Task Ordering Algorithms
□ Section 6: Bulk Operations
□ Section 7: Dependency Queries
□ Section 8: System Health Validation

Current Status: 🚀 Starting Discovery
Commands: 0/55 executed
Findings: 0 critical ⚠️ | 0 warnings ⚡ | 0 info ℹ️
⏱️ Time: 0 minutes
```

### Progress Update Pattern
Update after each section completion:
```markdown
✅ Section 1: Model Architecture [██████████] 100%
   Commands: 8/8 | Found: TaskDependency model, relations
🔄 Section 2: Circular Detection [███░░░░░░░] 30%
   Commands: 3/10 | Analyzing detection algorithm...
```

## Visual Handover Protocol

When discoveries require specialist expertise, use this handover format:

```markdown
--- DISCOVERY HANDOVER ---
Current Role: discovery-scout ✅
Discovery Progress: [██████████] 100% Complete

## Discovery Summary:
📊 **Components Found:** Dependency model, detection algorithms ✅
⚠️ **Critical Issues:** 2 circular dependency risks
🔍 **Areas Investigated:** 
   - ✅ Dependency model mapped
   - ✅ Circular detection working
   - ⚠️ Bulk operations incomplete
   - ❌ Order calculation missing

## Context for Specialist:
- Key Finding: Circular detection algorithm robust
- Risk Area: Bulk operations lack transaction safety
- Focus Needed: Implement order calculation, fix bulk ops

Delegating to: task-dependency-specialist
Reason: Deep dependency expertise required
Priority: Fix bulk operations, add order calculation

--- ACTIVATING TASK-DEPENDENCY-SPECIALIST ---
```

### Specialist Reception Template
```markdown
--- TASK-DEPENDENCY-SPECIALIST ACTIVATED ---

## Handover Acknowledged ✅
Inherited from: discovery-scout
Discovery Completeness: [██████████] 100%

## Context Received:
📊 **Components:** Dependency model, algorithms ✅
⚠️ **Issues:** 2 circular risks acknowledged
🔍 **Focus Areas:** Bulk operations priority

## My Specialist Analysis Starting:
[░░░░░░░░░░] 0% → Analyzing dependency graph...
[████░░░░░░] 40% → Reviewing bulk operations...
[██████████] 100% → Analysis complete ✅

## Specialist Findings:
1. Wrap bulk operations in transactions
2. Implement topological sort for ordering
3. Add dependency chain visualization
```

## Risk Assessment Matrix

| Risk Area | Severity | Likelihood | Impact | Mitigation |
|-----------|----------|------------|--------|------------|
| Circular Dependencies | HIGH | MEDIUM | Task deadlock | Implement detection |
| Order Collisions | LOW | LOW | Display issues | 1000 spacing |
| Cascade Deletions | HIGH | LOW | Data loss | FK constraints |
| Bulk Operation Failure | HIGH | LOW | Partial updates | Transactions |
| Deep Hierarchies | MEDIUM | LOW | Performance | Depth limits |
| Dependency Orphans | MEDIUM | LOW | Invalid refs | FK validation |
| Parallel Updates | MEDIUM | MEDIUM | Race conditions | Locking |
| Missing Dependencies | LOW | MEDIUM | Workflow issues | Validation |

## Output Format
```
TASK DEPENDENCY DISCOVERY REPORT
================================
Generated: [timestamp]
Scope: Task dependencies and relationships

ARCHITECTURE OVERVIEW
-------------------
□ Dependency Model
  - Database: [status]
  - Bidirectional: [YES/NO]
  - Cascade: [behavior]
  
□ Circular Detection
  - Status: [INCOMPLETE/COMPLETE]
  - TODOs: [count]
  - Risk Level: [assessment]

□ Parent-Child Support
  - Field: parentTaskId
  - Recursive: [YES/NO]
  - Depth: [limit/unlimited]

ORDERING SYSTEM
--------------
□ Algorithm: [description]
□ Spacing: [value]
□ Stage-based: [YES/NO]

BULK OPERATIONS
--------------
□ Routes: [count]
□ Service: [location]
□ Transaction Safety: [status]

CRITICAL FINDINGS
----------------
1. [Circular detection status]
2. [Performance consideration]
3. [Architecture insight]

DEPENDENCY FLOW
--------------
Task A → depends on → [B, C]
Task B → blocks → [D, E]
Task C → parent of → [F, G]

RECOMMENDATIONS
--------------
1. [Complete circular detection]
2. [Optimization suggestion]

SYSTEM HEALTH: [score]/10
```

## Discovery Execution Notes
- Focus on circular dependency TODO items
- Verify order calculation pattern
- Check bulk operation safety
- Validate cascade behaviors
- Test dependency diff logic