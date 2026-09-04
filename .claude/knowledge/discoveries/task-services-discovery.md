# Task Services Discovery Prompt v2.1

## 🆕 2026-06-11 Health-Run Addendum — Run These FIRST (June concurrency wave + new services)

The v2.0 body below (triple-layer architecture, all 6 file targets) re-proved LIVE on
2026-06-11, but predates the June-2026 concurrency wave and four newer services. Ground here first:

```bash
# 1. updateTask is RR + retry-wrapped (BC19/serialization-retry, 2026-06-09)
grep -n "withSerializationRetry\|task.ts:updateTask" lib/tasks/services/task.ts | head -3   # expect import (:2), wrap open (~:765), label (~:818) — lines shifted 2026-07-24 (completion-path: assembleUpdateData helper + terminal routing to complete-task-terminally.ts added above updateTask)

# 2. MCP task-update handler carries the BC19 atomic read-modify-write fix
grep -c "BC19" lib/mcp/tasks/action/handlers/task/task-update-handler.ts   # expect 5

# 3. Services NOT in the v2.0 inventory (all live):
ls lib/services/taskReadyReactorService.ts lib/services/taskBulkService.ts lib/services/taskSubscriptionService.ts lib/tasks/services/inputContext.ts
# - taskReadyReactorService: orchestration-reactor pattern (maybeQueueReadyDependents/maybeQueueIfDepFree) — see orchestration-reactor-pattern.md; do NOT add inline hooks
# - inputContext: task input-context merge (gate: npm run test:task-input-context-merge)

# 4. Concurrency canon for any task read-modify-write: transaction-atomicity-pattern.md §Retry
#    + the database-management-discovery 2026-06-09 concurrency block (BC19/BC47 sweep tables)
```

## Discovery Objective
Map and understand the triple-layer task service architecture, including basic CRUD, enhanced activity tracking, and advanced analytics/AI integration layers.

## Key Investigation Areas
1. Basic TaskService layer (Core CRUD)
2. Enhanced TaskService layer (Activity tracking)
3. Analytics/AI layer (Performance & Agent integration)
4. Service integration patterns
5. API route architecture
6. POV Editor service usage

## Search Strategy Sections

### 1. Triple-Layer Service Architecture
```bash
# Identify all three service layers
echo "=== Task Service Layers ==="
echo "Layer 1 - Basic: $(ls -la lib/tasks/services/task.ts 2>/dev/null | awk '{print $5 " bytes"}' || echo 'NOT FOUND')"
echo "Layer 2 - Enhanced: $(ls -la lib/services/taskService.ts 2>/dev/null | awk '{print $5 " bytes"}' || echo 'NOT FOUND')"
echo "Layer 3a - Analytics: $(ls -la lib/services/taskAnalyticsService.ts 2>/dev/null | awk '{print $5 " bytes"}' || echo 'NOT FOUND')"
echo "Layer 3b - Agent: $(ls -la lib/services/agentTaskService.ts 2>/dev/null | awk '{print $5 " bytes"}' || echo 'NOT FOUND')"

# Check service imports
echo -e "\n=== Service Dependencies ==="
grep "import.*TaskService" lib/services/taskService.ts 2>/dev/null | head -3
grep "import.*Enhanced" lib/services/taskAnalyticsService.ts 2>/dev/null | head -3
```

### 2. Basic TaskService Analysis
```bash
# Core methods in basic service
echo "=== Basic TaskService Methods ==="
grep "static async" lib/tasks/services/task.ts | grep -E "(create|update|delete|get)" | head -10

# MCP field support
echo -e "\n=== MCP Integration Fields ==="
grep -E "mcpContext|mcpToolId|mcpWorkflowId|agentTemplateId" lib/tasks/services/task.ts | head -5

# Notification system
echo -e "\n=== Assignee Notifications ==="
grep -A 5 "sendAssigneeNotification" lib/tasks/services/task.ts | head -10
```

### 3. Enhanced TaskService Features
```bash
# Enhanced features
echo "=== Enhanced Service Features ==="
grep "interface Enhanced" lib/services/taskService.ts | head -5

# Activity logging
echo -e "\n=== Activity Logging ==="
grep -A 5 "logActivity" lib/services/taskService.ts | head -10

# Analytics integration
echo -e "\n=== Analytics Features ==="
grep -E "riskScore|averageCompletionTime|activityTrend" lib/services/taskService.ts | head -10
```

### 4. Analytics & AI Layer
```bash
# Analytics service capabilities
echo "=== Analytics Service ==="
grep "export.*function\|export.*class" lib/services/taskAnalyticsService.ts | head -10

# Agent integration
echo -e "\n=== Agent Task Service ==="
grep "export.*function\|export.*class" lib/services/agentTaskService.ts | head -10

# AI insights
echo -e "\n=== AI-Powered Features ==="
grep -r "insights\|predict\|recommend" lib/services/task*.ts --include="*.ts" | head -5
```

### 5. API Route Architecture
```bash
# Task API routes
echo "=== Task API Routes ==="
find app/api/tasks -type f -name "route.ts" | head -15

# Enhanced CRUD route
echo -e "\n=== Enhanced CRUD ==="
grep "EnhancedTaskService\|TaskService" app/api/tasks/\[taskId\]/route.ts 2>/dev/null | head -5

# Analytics endpoints — NOTE: there is NO app/api/tasks/analytics/ REST dir.
# TaskAnalyticsService is exposed via the MCP analytics handler + context route:
echo -e "\n=== Analytics Endpoints (MCP-handler-exposed, not REST) ==="
ls -la lib/mcp/tasks/action/handlers/analytics/analytics-generate-handler.ts app/api/mcp/tasks/context/route.ts 2>/dev/null | awk '{print $NF}'

# Bulk operations
echo -e "\n=== Bulk Operations ==="
grep "export async function" app/api/tasks/bulk/update/route.ts 2>/dev/null | head -3
```

### 6. Service Integration Patterns
```bash
# How services call each other
echo "=== Integration Patterns ==="
grep -A 3 "TaskService\." lib/services/taskService.ts 2>/dev/null | head -10

# Shared types
echo -e "\n=== Shared Types ==="
grep "import.*CreateTaskData\|import.*TaskPriority" lib/services/*.ts | head -5

# Service usage in API routes
echo -e "\n=== API Service Usage ==="
grep -l "TaskService\|EnhancedTaskService\|taskAnalytics" app/api/tasks/*/route.ts 2>/dev/null | head -5
```

### 6.1. Layer Bypass Detection
```bash
# CRITICAL: Triple-Layer Architecture Split-Brain Detection
echo "=== Service Layer Bypass Detection ==="
echo "Direct Prisma access bypassing services:"
grep -r "prisma\.task.*direct\|prisma\.agentTask" --include="*.ts" | grep -v -E "TaskService|EnhancedTaskService" | head -10

echo "Basic service bypassing enhanced service:"
grep -r "BasicTaskService.*skip\|TaskService.*direct.*call" --include="*.ts" -B 3 -A 3 | head -10

echo "API routes bypassing service layers:"
grep -r "import.*prisma\|from.*prisma" app/api/tasks --include="*.ts" | grep -v "via.*service" | head -5

# Inconsistent Service Usage
echo "=== Service Layer Inconsistency Detection ==="
echo "Mixed service imports in same files:"
grep -r "import.*TaskService\|import.*EnhancedTaskService" --include="*.ts" | head -20

echo "Service mixing patterns:"
grep -r "new.*TaskService\|new.*Enhanced" --include="*.ts" | grep -E "(mixing|both|alternative)" | head -5

echo "Service layer selection inconsistency:"
grep -r "TaskService.*vs.*Enhanced\|Enhanced.*fallback" --include="*.ts" -B 2 -A 2

# Environment Variable Service Bypass
echo "=== Service Environment Variable Bypass ==="
echo "Service layer skip patterns:"
grep -r "SKIP_.*SERVICE\|DISABLE.*TASK.*SERVICE" --include="*.ts" --include="*.js" -B 2 -A 2

echo "Development service overrides:"
grep -r "NODE_ENV.*development.*service\|development.*direct.*prisma" --include="*.ts" -B 3 -A 3
```

### 7. POV Editor Integration Check
```bash
# Check POV Editor service usage
echo "=== POV Editor Service Usage ==="
grep -r "TaskService" components/poveditor/ --include="*.tsx" 2>/dev/null | head -3 || echo "No direct imports"

# API calls from POV Editor
echo -e "\n=== POV Editor API Calls ==="
grep -r "/api/tasks" components/poveditor/ --include="*.tsx" | head -5

# Task context usage
echo -e "\n=== Task Context ==="
find components/poveditor -name "*Task*Context*" -type f | head -3
```

### 8. System Health Validation
```bash
echo "=== Task Services Health Check ==="
echo "Basic TaskService: $([ -f lib/tasks/services/task.ts ] && echo '✅ EXISTS' || echo '❌ MISSING')"
echo "Enhanced TaskService: $([ -f lib/services/taskService.ts ] && echo '✅ EXISTS' || echo '❌ MISSING')"
echo "Analytics Service: $([ -f lib/services/taskAnalyticsService.ts ] && echo '✅ EXISTS' || echo '❌ MISSING')"
echo "Agent Service: $([ -f lib/services/agentTaskService.ts ] && echo '✅ EXISTS' || echo '❌ MISSING')"
echo "Task API Route: $([ -f app/api/tasks/[taskId]/route.ts ] && echo '✅ EXISTS' || echo '❌ MISSING')"
echo "Analytics Handler (MCP): $([ -f lib/mcp/tasks/action/handlers/analytics/analytics-generate-handler.ts ] && echo '✅ EXISTS' || echo '❌ MISSING')  # no app/api/tasks/analytics/ REST dir by design"
echo "Activity Logging: $(grep -c "TaskActivity" lib/services/taskService.ts 2>/dev/null || echo '0') references"
```

## Debugging Helpers
```bash
# Check service wrapper pattern
echo "=== Service Wrapper Pattern ==="
sed -n '/import.*TaskService/,+20p' lib/services/taskService.ts | head -25

# Verify triple-layer architecture
echo -e "\n=== Layer Integration Check ==="
echo "Layer 2 imports Layer 1: $(grep -c 'from.*tasks/services/task' lib/services/taskService.ts || echo 'NO')"
echo "Layer 3 uses Layer 2: $(grep -c 'EnhancedTaskService' lib/services/taskAnalyticsService.ts || echo 'NO')"
```

## Progress Tracking

Track discovery execution with visual progress indicators:

```markdown
📊 Discovery Progress: Task Services Discovery
══════════════════════════════════════════════
Overall Progress: [░░░░░░░░░░] 0%

Section Progress:
□ Section 1: Triple-Layer Service Architecture
□ Section 2: Basic TaskService Analysis
□ Section 3: Enhanced TaskService Features
□ Section 4: Analytics & AI Layer
□ Section 5: API Route Architecture
□ Section 6: Service Integration Patterns
□ Section 7: POV Editor Integration Check
□ Section 8: System Health Validation

Current Status: 🚀 Starting Discovery
Commands: 0/58 executed
Findings: 0 critical ⚠️ | 0 warnings ⚡ | 0 info ℹ️
⏱️ Time: 0 minutes
```

### Progress Update Pattern
Update after each section completion:
```markdown
✅ Section 1: Triple-Layer Service Architecture [████████░░] 80%
   Commands: 8/10 | Found: 3 layers ✅, 1 missing ❌
🔄 Section 2: Basic TaskService Analysis [██░░░░░░░░] 20%
   Commands: 2/12 | Analyzing methods...
```

## Visual Handover Protocol

When discoveries require specialist expertise, use this handover format:

```markdown
--- DISCOVERY HANDOVER ---
Current Role: discovery-scout ✅
Discovery Progress: [██████████] 100% Complete

## Discovery Summary:
📊 **Components Found:** 8/8 service layers ✅
⚠️ **Critical Issues:** 2 architecture mismatches
🔍 **Areas Investigated:** 
   - ✅ Triple-layer architecture validated
   - ✅ API routes mapped (15 endpoints)
   - ⚠️ POV Editor using wrong service layer
   - ❌ Analytics service missing error handling

## Context for Specialist:
- Key Finding: EnhancedTaskService wraps basic service correctly
- Risk Area: Bulk operations lack transaction safety
- Focus Needed: POV Editor integration refactor

Delegating to: task-services-specialist
Reason: Deep service architecture expertise needed
Priority: Fix POV Editor service layer usage

--- ACTIVATING TASK-SERVICES-SPECIALIST ---
```

### Specialist Reception Template
```markdown
--- TASK-SERVICES-SPECIALIST ACTIVATED ---

## Handover Acknowledged ✅
Inherited from: discovery-scout
Discovery Completeness: [██████████] 100%

## Context Received:
📊 **Components:** 8/8 service files ✅
⚠️ **Issues:** 2 architecture mismatches acknowledged
🔍 **Focus Areas:** POV Editor integration priority

## My Specialist Analysis Starting:
[░░░░░░░░░░] 0% → Analyzing service layers...
[████░░░░░░] 40% → Reviewing POV Editor usage...
[██████████] 100% → Analysis complete ✅

## Specialist Findings:
1. POV Editor should use EnhancedTaskService
2. Bulk operations need transaction wrapper
3. Analytics service requires error boundaries
```

## Risk Assessment Matrix

| Risk Area | Severity | Likelihood | Impact | Mitigation |
|-----------|----------|------------|--------|------------|
| Service Layer Confusion | MEDIUM | HIGH | Wrong service used | Clear documentation |
| Activity Log Overflow | LOW | MEDIUM | Performance hit | Non-blocking design |
| Analytics Overhead | MEDIUM | HIGH | Slow responses | Optional enhancement |
| Service Incompatibility | LOW | LOW | Breaking changes | Shared types |
| Bulk Operation Failure | HIGH | LOW | Data corruption | Transaction safety |
| POV Editor Mismatch | MEDIUM | LOW | Feature gaps | API abstraction |
| Agent Integration Issues | MEDIUM | MEDIUM | AI features fail | Fallback logic |
| Missing Activity Tracking | LOW | MEDIUM | No audit trail | Enhanced service |

## Output Format
```
TASK SERVICES DISCOVERY REPORT
==============================
Generated: [timestamp]
Scope: Triple-layer task service architecture

ARCHITECTURE OVERVIEW
-------------------
□ Layer 1 - Basic TaskService
  - Location: [path]
  - Size: [bytes]
  - Core features: [list]
  
□ Layer 2 - Enhanced TaskService
  - Location: [path]
  - Wraps: [service]
  - Added features: [list]
  
□ Layer 3 - Analytics & AI
  - Analytics: [path]
  - Agent: [path]
  - Capabilities: [list]

INTEGRATION PATTERNS
-------------------
□ Service Dependencies: [flow diagram]
□ Shared Components: [list]
□ API Route Usage: [mapping]

CRITICAL FINDINGS
----------------
1. [Architecture insight]
2. [Integration pattern]
3. [Performance consideration]

POV EDITOR INTEGRATION
---------------------
□ Direct Imports: [YES/NO]
□ API Usage: [endpoints]
□ Service Layer: [which one]

RECOMMENDATIONS
--------------
1. [Service optimization]
2. [Integration improvement]

SYSTEM HEALTH: [score]/10
```

### 9. Rich Activity Logging & Workflow Integration (Jan 2026)
```bash
# Activity logging helpers
echo "=== Rich Activity Logging System ==="
grep -rn "logWorkflowExecution\|logPhaseChange\|logStageChange" lib/ --include="*.ts" | head -10
echo "Fire-and-forget activity logging helpers"

# TaskActivityAction (18 types) — NOTE: this is a TS `const` object in
# lib/types/activity.ts, NOT a Prisma enum (schema.prisma has no such enum;
# the action is stored as a string). Grep the TS source, not the schema.
echo -e "\n=== TaskActivityAction (lib/types/activity.ts) ==="
grep -A 30 "export const TaskActivityAction" lib/types/activity.ts | head -32
echo "expect 18 activity types including WORKFLOW_EXECUTED"

# Activity details with workflow fields
echo -e "\n=== Activity Details Interface ==="
grep -A 15 "workflowId\|workflowType\|workflowStatus" lib/tasks/types/ --include="*.ts" | head -20

# ActivityWorkflow visual component
echo -e "\n=== Activity Visual Components ==="
grep -rn "ActivityWorkflow\|getActivityVisualType" components/tasks/ --include="*.tsx" | head -10

# Workflow execution tracking
echo -e "\n=== Workflow Execution Integration ==="
grep -rn "MCPWorkflowExecution\|WORKFLOW_EXECUTED" lib/ --include="*.ts" | head -10
```

## Discovery Execution Notes
- Verify all three layers exist
- Check service wrapper patterns
- Validate API route implementations
- Confirm POV Editor integration approach
- Test activity logging overhead
- **NEW**: Verify 18 TaskActivityAction types with WORKFLOW_EXECUTED