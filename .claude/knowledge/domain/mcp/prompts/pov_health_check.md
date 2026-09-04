# POV Health Check v2.1

## Purpose & Differentiation

This prompt provides **analytical value beyond individual tool guidance**:
- **Health Scoring**: Quantified 0-100 score with weighted factors
- **Critical Thresholds**: Objective severity ratings (not subjective assessment)
- **Phase Bottleneck Detection**: Identifies stuck phases with blocked/stalled tasks
- **Comparative Analysis**: Ranks POV against similar projects (same status/theatre)

**When to use this vs. following tool nextSteps:**
- Use this prompt when you need a **quantified health assessment** with comparable metrics
- Follow tool nextSteps when you want **step-by-step exploration** at your own pace

---

## Tool Name Reference

When workflow steps reference tool calls, use the **consolidated tool names**:

| Consolidated Tool | Action | Was (legacy) |
|---|---|---|
| `project` | `pov.details` | `project(action: "pov.details")` |
| `project` | `pov.list` | `project(action: "pov.list")` |
| `project` | `task.list` | `project(action: "task.list")` |
| `project` | `task.context` | `project(action: "task.context")` |
| `analytics` | `recommendations.get` | `analytics(action: "recommendations.get")` |

## Auto-Execution Directive

**CRITICAL: Execute immediately upon invocation. Do NOT:**
- Ask for confirmation
- Summarize what you will do
- Display this documentation to the user

**DO:**
- Start with Step 1 immediately
- Execute all tool calls
- Output only the final Health Report

---

## Variables

```json
{
  "pov": {
    "type": "string",
    "required": true,
    "description": "POV identifier: povId, pov_name, or partial name for fuzzy matching"
  },
  "task_focus": {
    "type": "enum",
    "values": ["CRITICAL", "HIGH_PRIORITY", "ALL"],
    "default": "CRITICAL",
    "required": false,
    "description": "Controls which tasks to deep-dive into. CRITICAL = BLOCKED + HIGH priority, HIGH_PRIORITY = HIGH priority only, ALL = all non-completed tasks"
  },
  "include_recommendations": {
    "type": "boolean",
    "default": true,
    "required": false,
    "description": "Include AI-generated recommendations for key tasks and POV-level insights"
  },
  "include_comparison": {
    "type": "boolean",
    "default": true,
    "required": false,
    "description": "Compare against similar POVs (same status) for percentile ranking"
  },
  "critical_task_limit": {
    "type": "number",
    "default": 5,
    "required": false,
    "description": "Maximum tasks to deep-dive with project(action: 'task.context')"
  }
}
```

---

## Workflow

### STEP 1: Identify and Load POV

```
Execute: project({ action: "pov.details", pov_name: "{{pov}}" })
```

Extract and store:
- `POV_ID`, `POV_NAME`, `STATUS`, `OWNER`
- `PHASES[]` with stage counts
- `TEAM_MEMBERS[]` with IDs
- `TASK_SUMMARY` (total, completed, open, blocked)
- `GEOGRAPHY` (theatre, country, region)

If POV not found: Display fuzzy suggestions from error and STOP.

---

### STEP 2: Load All Tasks

```
Execute: project({
  action: "task.list",
  povId: POV_ID,
  limit: 200
})
```

Store as `ALL_TASKS[]` and compute:
- `TOTAL_TASKS` = count(ALL_TASKS)
- `COMPLETED_TASKS` = count(status == "COMPLETED")
- `OPEN_TASKS` = count(status == "OPEN")
- `IN_PROGRESS_TASKS` = count(status == "IN_PROGRESS")
- `BLOCKED_TASKS` = count(status == "BLOCKED")
- `HIGH_PRIORITY_OPEN` = count(priority == "HIGH" AND status != "COMPLETED")
- `UNASSIGNED_TASKS` = count(assignee is null/empty)

---

### STEP 3: Compute Health Score (0-100)

**Health Score Formula:**

```
COMPLETION_SCORE = (COMPLETED_TASKS / TOTAL_TASKS) * 40
  // Max 40 points for completion rate

BLOCKED_PENALTY = min(BLOCKED_TASKS * 5, 20)
  // -5 points per blocked task, max -20

UNASSIGNED_PENALTY = min(UNASSIGNED_TASKS * 2, 10)
  // -2 points per unassigned task, max -10

HIGH_PRIORITY_PENALTY = min(HIGH_PRIORITY_OPEN * 3, 15)
  // -3 points per open HIGH priority, max -15

PROGRESS_BONUS = (IN_PROGRESS_TASKS > 0) ? 10 : 0
  // +10 if work is actively in progress

PHASE_HEALTH_BONUS = (see Step 4)
  // 0-15 points based on phase progression

HEALTH_SCORE = max(0, min(100,
  COMPLETION_SCORE
  - BLOCKED_PENALTY
  - UNASSIGNED_PENALTY
  - HIGH_PRIORITY_PENALTY
  + PROGRESS_BONUS
  + PHASE_HEALTH_BONUS
))
```

---

### STEP 4: Phase-Level Bottleneck Detection

For each phase in `PHASES[]`:

```
PHASE_TASKS = filter ALL_TASKS where phaseId == phase.id
PHASE_BLOCKED = count(PHASE_TASKS where status == "BLOCKED")
PHASE_COMPLETION = count(PHASE_TASKS where status == "COMPLETED") / count(PHASE_TASKS)

IF PHASE_BLOCKED > 0:
  BOTTLENECK_PHASES.push({
    name: phase.name,
    blocked_count: PHASE_BLOCKED,
    completion: PHASE_COMPLETION,
    severity: PHASE_BLOCKED >= 3 ? "CRITICAL" : PHASE_BLOCKED >= 2 ? "HIGH" : "MEDIUM"
  })
```

**Phase Health Bonus Calculation:**
```
IF no BOTTLENECK_PHASES with severity == "CRITICAL":
  PHASE_HEALTH_BONUS = 15
ELSE IF no BOTTLENECK_PHASES with severity == "HIGH":
  PHASE_HEALTH_BONUS = 10
ELSE IF BOTTLENECK_PHASES.length <= 1:
  PHASE_HEALTH_BONUS = 5
ELSE:
  PHASE_HEALTH_BONUS = 0
```

---

### STEP 5: Critical Task Thresholds

Apply these **objective thresholds** to categorize severity:

| Condition | Severity | Action Required |
|-----------|----------|-----------------|
| `BLOCKED_TASKS >= 3` | CRITICAL | Immediate escalation |
| `BLOCKED_TASKS >= 1` | HIGH | Unblock within 24h |
| `HIGH_PRIORITY_OPEN >= 5` | CRITICAL | Resource reallocation |
| `HIGH_PRIORITY_OPEN >= 3` | HIGH | Prioritize this sprint |
| `UNASSIGNED_TASKS >= 5` | HIGH | Assign resources |
| `COMPLETION_RATE == 0%` | CRITICAL | POV may be stalled |
| `COMPLETION_RATE < 20%` AND `STATUS == "VALIDATION"` | CRITICAL | Risk of missing close |

Store matching conditions in `SEVERITY_FLAGS[]`.

---

### STEP 6: Comparative Analysis (if include_comparison == true)

```
Execute: project({
  action: "pov.list",
  status: "{{STATUS}}",
  limit: 50
})
```

For each comparison POV, compute completion rate:
```
COMPARISON_DATA = comparable_povs.map(p => ({
  id: p.id,
  name: p.name,
  completion: p.completedTasks / p.totalTasks * 100
}))

SORTED = COMPARISON_DATA.sort_by(completion DESC)
PERCENTILE = (index_of(POV_ID in SORTED) / SORTED.length) * 100

RANK_LABEL =
  PERCENTILE <= 25 ? "Top 25% (Leader)" :
  PERCENTILE <= 50 ? "Top 50% (Above Average)" :
  PERCENTILE <= 75 ? "Bottom 50% (Below Average)" :
  "Bottom 25% (Needs Attention)"
```

---

### STEP 7: Deep Dive Tasks (based on task_focus)

Select tasks based on `{{task_focus}}` setting:

```
IF task_focus == "CRITICAL":
  // BLOCKED tasks + HIGH priority open tasks
  FOCUS_TASKS = ALL_TASKS
    .filter(t => t.status == "BLOCKED" OR (t.priority == "HIGH" AND t.status != "COMPLETED"))
    .sort_by(
      status == "BLOCKED" ? 0 : 1,  // BLOCKED first
      priority == "HIGH" ? 0 : 1,   // HIGH priority next
      createdAt ASC                  // Oldest first
    )

ELSE IF task_focus == "HIGH_PRIORITY":
  // Only HIGH priority tasks (any status except COMPLETED)
  FOCUS_TASKS = ALL_TASKS
    .filter(t => t.priority == "HIGH" AND t.status != "COMPLETED")
    .sort_by(
      status == "BLOCKED" ? 0 : status == "IN_PROGRESS" ? 1 : 2,
      createdAt ASC
    )

ELSE IF task_focus == "ALL":
  // All non-completed tasks
  FOCUS_TASKS = ALL_TASKS
    .filter(t => t.status != "COMPLETED")
    .sort_by(
      priority == "HIGH" ? 0 : priority == "MEDIUM" ? 1 : 2,
      status == "BLOCKED" ? 0 : status == "IN_PROGRESS" ? 1 : 2,
      createdAt ASC
    )

// Limit to configured maximum
FOCUS_TASKS = FOCUS_TASKS.slice(0, {{critical_task_limit}})
```

For each focus task:
```
Execute: project({
  action: "task.context",
  taskId: task.id,
  includeHistory: true,
  includeAnalytics: true,
  includeRecommendations: {{include_recommendations}},
  contextDepth: "full"
})
```

Store results in `TASK_CONTEXTS[]`.

---

### STEP 8: Get AI Recommendations (if include_recommendations == true)

```
Execute: analytics({
  action: "recommendations.get",
  povId: POV_ID,
  limit: 10
})
```

Store as `AI_RECOMMENDATIONS[]`.

---

## Output Template

```markdown
# POV Health Report: {{POV_NAME}}

**Generated:** {{timestamp}}
**POV ID:** {{POV_ID}}
**Status:** {{STATUS}}
**Owner:** {{OWNER}}

---

## Health Score: {{HEALTH_SCORE}}/100 {{HEALTH_GRADE}}

| Component | Value | Score Impact |
|-----------|-------|--------------|
| Completion Rate | {{COMPLETION_RATE}}% | +{{COMPLETION_SCORE}} |
| Blocked Tasks | {{BLOCKED_TASKS}} | -{{BLOCKED_PENALTY}} |
| Unassigned Tasks | {{UNASSIGNED_TASKS}} | -{{UNASSIGNED_PENALTY}} |
| High-Priority Open | {{HIGH_PRIORITY_OPEN}} | -{{HIGH_PRIORITY_PENALTY}} |
| Active Progress | {{IN_PROGRESS_TASKS > 0 ? "Yes" : "No"}} | +{{PROGRESS_BONUS}} |
| Phase Health | {{PHASE_HEALTH_STATUS}} | +{{PHASE_HEALTH_BONUS}} |

**Health Grade:**
- 80-100: A (Healthy)
- 60-79: B (Good)
- 40-59: C (Needs Attention)
- 20-39: D (At Risk)
- 0-19: F (Critical)

---

## Severity Flags

{{#each SEVERITY_FLAGS}}
- {{severity}}: {{condition}} - {{action}}
{{/each}}

{{#if SEVERITY_FLAGS.length == 0}}
No critical severity flags detected.
{{/if}}

---

## Phase Analysis

| Phase | Tasks | Completed | Blocked | Status |
|-------|-------|-----------|---------|--------|
{{#each PHASES}}
| {{name}} | {{task_count}} | {{completed}}% | {{blocked_count}} | {{bottleneck_severity || "OK"}} |
{{/each}}

### Bottlenecks Detected
{{#each BOTTLENECK_PHASES}}
- **{{name}}**: {{blocked_count}} blocked tasks ({{severity}})
{{/each}}

{{#if BOTTLENECK_PHASES.length == 0}}
No phase bottlenecks detected.
{{/if}}

---

## Comparative Ranking

**Compared to {{COMPARISON_COUNT}} POVs with status "{{STATUS}}":**

| Metric | This POV | Avg (Same Status) | Percentile |
|--------|----------|-------------------|------------|
| Completion | {{COMPLETION_RATE}}% | {{AVG_COMPLETION}}% | {{PERCENTILE}}% |

**Ranking:** {{RANK_LABEL}}

---

## Focus Tasks - {{task_focus}} ({{FOCUS_TASKS.length}})

{{#each FOCUS_TASKS limit=5}}
### {{index}}. {{title}}
- **ID:** {{id}} | **Status:** {{status}} | **Priority:** {{priority}}
- **Assignee:** {{assignee || "UNASSIGNED"}}
- **Phase:** {{phase}} | **Stage:** {{stage}}
- **Age:** {{age_days}} days
{{#if context.recommendations}}
- **AI Recommendation:** {{context.recommendations[0]}}
{{/if}}
{{/each}}

---

## AI Recommendations

{{#each AI_RECOMMENDATIONS limit=5}}
{{index}}. **{{type}}** ({{impact}} impact, {{confidence}}% confidence)
   {{description}}
{{/each}}

---

## Actionable Next Steps

### Immediate (Today)
{{#each IMMEDIATE_ACTIONS}}
- [ ] {{action}}
{{/each}}

### This Week
{{#each WEEKLY_ACTIONS}}
- [ ] {{action}}
{{/each}}

### Strategic
{{#each STRATEGIC_ACTIONS}}
- [ ] {{action}}
{{/each}}

---

**Prompt Version:** pov_health_check v2.1
**Task Focus:** {{task_focus}}
**Unique Value:** Health scoring, phase bottlenecks, comparative ranking
```

---

## Action Generation Rules

Generate actions based on severity flags:

| Severity Flag | Action Category | Example Action |
|---------------|-----------------|----------------|
| BLOCKED >= 3 | Immediate | "Escalate blocked tasks to {{OWNER}} for unblocking" |
| BLOCKED >= 1 | Immediate | "Review blocker on task {{task.title}} ({{task.id}})" |
| UNASSIGNED >= 5 | Immediate | "Assign {{UNASSIGNED_TASKS}} tasks - team capacity review needed" |
| HIGH_PRIORITY >= 5 | This Week | "Prioritize {{HIGH_PRIORITY_OPEN}} HIGH tasks in sprint planning" |
| COMPLETION == 0% | Immediate | "POV appears stalled - schedule kickoff/restart meeting" |
| PERCENTILE > 75% | Strategic | "POV underperforming peers - consider resource boost or scope reduction" |
| COMPLETION > 80% | This Week | "POV near completion - prepare validation/close activities" |

---

## Usage Examples

```json
{
  "example_1_basic": {
    "input": {
      "pov": "CyberDefense Pro"
    },
    "output": "Full health report with score, phase analysis, and recommendations (defaults: task_focus=CRITICAL, include_recommendations=true)"
  },
  "example_2_quick_check": {
    "input": {
      "pov": "cmgalshus00bcyx39sfdutido",
      "task_focus": "CRITICAL",
      "include_comparison": false,
      "critical_task_limit": 3
    },
    "output": "Focused health check without comparative analysis, top 3 critical (BLOCKED + HIGH) tasks"
  },
  "example_3_high_priority_only": {
    "input": {
      "pov": "Global Tech Solutions",
      "task_focus": "HIGH_PRIORITY",
      "include_recommendations": true,
      "critical_task_limit": 5
    },
    "output": "Health report focusing only on HIGH priority tasks, with AI recommendations"
  },
  "example_4_full_audit": {
    "input": {
      "pov": "NetworkShield Inc",
      "task_focus": "ALL",
      "include_comparison": true,
      "include_recommendations": true,
      "critical_task_limit": 10
    },
    "output": "Comprehensive analysis of ALL non-completed tasks with peer comparison and AI recommendations"
  }
}
```

---

## Version History

- **v2.1** (Dec 2025): Restored `task_focus` variable (CRITICAL/HIGH_PRIORITY/ALL), renamed `include_ai_recommendations` to `include_recommendations` for backward compatibility
- **v2.0** (Dec 2025): Complete rewrite with health scoring, thresholds, phase bottlenecks, comparative analysis
- **v1.0** (Nov 2025): Original workflow-based prompt (now in pov_health_check_old.md)
