# ============================================================================
# AUTO-EXECUTE PROMPT - task_audit_and_planning v2.6
# ============================================================================
# CHANGELOG v2.6:
#   - Merged v2.5 improvements (audit_all_tasks as Step 1, fallback logic)
#   - FIX: Replaced perform(action: "analytics.generate") with correct tool
#          analytics(action: "recommendations.get") for POV-level AI recs
#   - FIX: analytics.generate requires analysisType param and is for reports,
#          not recommendations. recommendations.get is the correct action.
#   - Removed redundant Step 2 (audit_all_tasks already retrieves all tasks)
#   - Cleaned up variable rendering (false defaults now render correctly)
# ============================================================================

You MUST automatically execute all MCP pAIchart tools immediately.

NEVER ask "Should I run this?" or "Ready to begin?" or "Option A/B/C"
NEVER switch to descriptive mode - always execute real tools
NEVER summarize instead of executing - run actual tool calls
Assume tools are connected unless a tool call returns an error
If a tool fails, report the error but continue with remaining steps

TOOL NAME REFERENCE:

| Consolidated Tool | Action | Was (legacy) |
|---|---|---|
| `project` | `pov.list` | `project(action: "pov.list")` |
| `project` | `pov.details` | `project(action: "pov.details")` |
| `project` | `task.list` | `project(action: "task.list")` |
| `project` | `task.context` | `project(action: "task.context")` |
| `perform` | `task.update` | `perform(action: "execute")` |
| `analytics` | `recommendations.get` | `analytics(action: "recommendations.get")` |
| `prompt_command` | (command param) | unchanged |
| `list_prompts` | (no action) | unchanged |

LOOP HANDLING:
When instructions say "for each POV" or "for each task":
- Iterate through ALL items in the results
- Execute the specified tool for each item
- Gather all outputs before proceeding
- Continue to next step

TOOL EXECUTION:
Use the consolidated pAIchart MCP tools:
  project(action: "pov.list")                    - Get POV list
  project(action: "pov.details", povId: "...")   - Get POV details
  project(action: "task.list", povId: "...")     - Get task lists
  project(action: "task.context", taskId: "...") - Get task context
  analytics(action: "recommendations.get", povId: "...") - Get AI recommendations
  perform(action: "task.update", taskId: "...")  - Update tasks

Execute immediately upon reading this prompt. No confirmation needed.

# ============================================================================
# EXECUTE IMMEDIATELY - WORKFLOW BEGINS NOW
# ============================================================================

## STEP 1: Audit All POVs and Tasks (Single Call)

Execute the audit_all_tasks prompt, which retrieves ALL tasks across ALL active
POVs (IN_PROGRESS, STALLED, VALIDATION) in a single operation:

  prompt_command({ command: "/prompt audit_all_tasks includeCompleted=true" })

Store results as: ALL_POVS and ALL_TASKS

FALLBACK (only if audit_all_tasks fails or returns an error):
  Execute three separate calls to cover all statuses:
    project({ action: "pov.list", status: "IN_PROGRESS", limit: 200 })
    project({ action: "pov.list", status: "STALLED", limit: 200 })
    project({ action: "pov.list", status: "VALIDATION", limit: 200 })
  Then for each POV:
    project({ action: "task.list", povId: POV.id, limit: 200 })
  Note: If fallback is used, log "audit_all_tasks failed - using manual fallback"

NOTE: Do NOT execute a separate task.list loop after audit_all_tasks succeeds.
audit_all_tasks already returns complete task data for all POVs. Doing both
would duplicate data and waste tool calls.

# ============================================================================

## DATA VOLUME HANDLING STRATEGY

CRITICAL: Complete entire workflow regardless of data volume. NEVER stop to ask
permission.

IF total_povs > 5 OR total_tasks > 50:
  - Use summary tables (completion %, HIGH-priority counts only)
  - NO full task lists in global summary
  - Deep dive ONLY on selected focus POV

IF total_povs <= 5 AND total_tasks <= 50:
  - Present moderate detail
  - Include task counts per phase
  - Deep dive on selected focus POV

# ============================================================================

## STEP 2: Analyze & Build Global Summary

{{#if initial_context}}
USER CONTEXT: "{{initial_context}}"
Prioritize POVs/tasks matching this context.
{{/if}}

Calculate for each POV:
  - Completion rate = (completed / total) * 100
  - HIGH priority OPEN/BLOCKED count
  - Risk level:
      CRITICAL if 0% progress
      HIGH     if completion < 20%
      MEDIUM   if completion < 50%
      LOW      if completion >= 70%

Present as condensed table:
  | POV Name (ID suffix) | Status | Complete | High-Pri | Risk | Owner |

# ============================================================================

## STEP 3: Generate Global Next Steps

Produce 3-7 concrete recommendations:
  - Focus on VALIDATION POVs first (closest to WON)
  - Identify capacity issues (unassigned HIGH tasks)
  - Flag sequencing problems (Planning incomplete, Implementation started)
  - Use direct language: "Assign X to Y" not "Consider assigning..."

# ============================================================================

## STEP 4: Select Focus POV

  candidates = POVs with status = VALIDATION

  IF candidates.length == 0:
    candidates = POVs with status = IN_PROGRESS
    OUTPUT: "No VALIDATION POVs found. Selecting IN_PROGRESS."

  IF {{auto_drilldown}} == true:
    selected_pov = candidate with highest revenue OR most high_priority_open tasks
    OUTPUT: "Auto-selected: [POV_NAME]"

  ELSE (auto_drilldown == false, default):
    IF candidates.length > 3:
      Present top 3 candidates ranked by (revenue DESC, then high_priority_open DESC)
    ELSE:
      Present all candidates
    Ask user to select before continuing to Step 5

# ============================================================================

## STEP 5: Deep Dive Selected POV

Execute in sequence:

  1. pov_details = project({
       action: "pov.details",
       povId: selected_pov.id
     })

  2. critical_tasks = project({
       action: "task.list",
       povId: selected_pov.id,
       priority: "HIGH",
       limit: 50
     })
     (Omit status filter to capture OPEN, IN_PROGRESS, and BLOCKED)

  3. For top 3-5 most critical tasks ONLY
     (prioritize: BLOCKED first, then IN_PROGRESS, then OPEN, oldest first):
       task_context = project({
         action: "task.context",
         taskId: task.id,
         includeHistory: true,
         includeAnalytics: true,
         includeRecommendations: true,
         contextDepth: "full"
       })

  4. ai_recs = analytics({
       action: "recommendations.get",
       povId: selected_pov.id,
       limit: 10
     })
     IMPORTANT: "analytics" is a SEPARATE tool from "perform". Do NOT use
     perform(action: "analytics.generate") — that is a different action requiring
     analysisType. Use the analytics tool directly with action "recommendations.get".
     If this returns an error, note it in the execution log and proceed without it.

# ============================================================================

## STEP 6: Present Structured Output

Use this EXACT structure:

---

# Global Task Audit Summary

| POV Name (ID suffix) | Status | Complete | High-Pri Open | Risk | Owner |
|---|---|---|---|---|---|
[one row per POV]

**Portfolio Health:** [N] active POVs | [N] VALIDATION | [N] IN_PROGRESS | [N] STALLED

---

# Global Next Steps (All POVs)

[3-7 concrete recommendations from Step 3]

---

# Focus POV: [POV_NAME] (ID: ...last8chars)

**Status:** [status] | **Owner:** [owner] | **Revenue:** $[amount]
**Completion:** [X%] | **High-Priority Tasks:** [count] | **Overdue:** [count]

## Team
[team members and roles]

## Critical Tasks ([N] tasks)

| Task (ID suffix) | Status | Assignee | Notes |
|---|---|---|---|
[top 3-5 tasks]

## AI Recommendations

[Output from analytics(action: "recommendations.get"), or "recommendations unavailable" if it failed]

---

# Suggested Next Actions

- [ ] [Specific action with task/POV names and IDs]
- [ ] [Specific action with task/POV names and IDs]
- [ ] [Specific action with task/POV names and IDs]

---

**Prompt Version:** v2.6 | **Tool Calls:** [N] | **Execution Notes:** [any errors or fallbacks]

---

# ============================================================================
# FINAL EXECUTION CHECKLIST
# ============================================================================
# Before responding, verify you have:
#
#   [x] Executed audit_all_tasks (or fallback pov.list + task.list calls)
#   [x] Did NOT run a redundant task.list loop after audit_all_tasks succeeded
#   [x] Calculated actual completion rates from real data
#   [x] Selected a focus POV using the {{auto_drilldown}} logic
#   [x] Executed project(action: "pov.details") for focus POV
#   [x] Executed project(action: "task.list") for focus POV critical tasks
#   [x] Executed project(action: "task.context") for top 3-5 critical tasks
#   [x] Attempted analytics(action: "recommendations.get") and logged result
#   [x] Presented structured markdown output with real data
#   [x] Logged any errors or fallbacks in the Execution Notes footer
#
# If any item is unchecked, go back and run the actual tools.
# ============================================================================

# ============================================================================
# VARIABLES CONFIGURATION
# ============================================================================

{
  "auto_drilldown": {
    "type": "boolean",
    "default": false,
    "required": false,
    "description": "Auto-select highest-impact POV (true) or present top candidates for user choice (false). Set true for automated/scheduled reports."
  },
  "initial_context": {
    "type": "string",
    "required": false,
    "description": "RECOMMENDED: Context to prioritize (e.g., 'CyberDefense Pro', 'Mexico POVs', 'email gateway'). Biases POV selection and task focus.",
    "placeholder": "e.g., 'validation POVs for customer X'"
  },
  "pov_status_filter": {
    "type": "string",
    "default": "IN_PROGRESS,STALLED,VALIDATION",
    "required": false,
    "validation": "^(PROJECTED|IN_PROGRESS|STALLED|VALIDATION|WON|LOST)(,(PROJECTED|IN_PROGRESS|STALLED|VALIDATION|WON|LOST))*$",
    "description": "POV statuses to audit (comma-separated). Options: PROJECTED, IN_PROGRESS, STALLED, VALIDATION, WON, LOST"
  },
  "task_status_filter": {
    "type": "string",
    "default": "OPEN,IN_PROGRESS,BLOCKED",
    "required": false,
    "validation": "^(OPEN|IN_PROGRESS|BLOCKED|COMPLETED)(,(OPEN|IN_PROGRESS|BLOCKED|COMPLETED))*$",
    "description": "Task statuses to include (comma-separated). Options: OPEN, IN_PROGRESS, BLOCKED, COMPLETED"
  },
  "focus_validation_povs": {
    "type": "boolean",
    "default": true,
    "required": false,
    "description": "Prefer VALIDATION POVs when selecting focus (recommended: true to accelerate deals toward WON)"
  }
}

# ============================================================================
# USAGE EXAMPLES
# ============================================================================

{
  "example_1_portfolio_review": {
    "name": "Weekly Portfolio Health Check",
    "command": "/prompt task_audit_and_planning",
    "input": {
      "auto_drilldown": false,
      "pov_status_filter": "IN_PROGRESS,STALLED,VALIDATION",
      "task_status_filter": "OPEN,IN_PROGRESS,BLOCKED",
      "focus_validation_povs": true
    },
    "output": "Global audit across all active POVs, prioritized next steps, top 3 VALIDATION POV candidates presented for user selection",
    "use_case": "Weekly executive review or standup"
  },
  "example_2_customer_focus": {
    "name": "Accelerate Specific Customer POV",
    "command": "/prompt task_audit_and_planning initial_context=\"CyberDefense Pro\" auto_drilldown=true",
    "input": {
      "auto_drilldown": true,
      "initial_context": "CyberDefense Pro validation",
      "pov_status_filter": "VALIDATION",
      "task_status_filter": "OPEN,IN_PROGRESS",
      "focus_validation_povs": true
    },
    "output": "Targeted analysis of CyberDefense Pro POV with auto-selected focus and task-level recommendations",
    "use_case": "Solution architect steering customer toward WON"
  },
  "example_3_automated_report": {
    "name": "Daily Automated Report (Bot/Scheduled)",
    "command": "/prompt task_audit_and_planning auto_drilldown=true",
    "input": {
      "auto_drilldown": true,
      "pov_status_filter": "IN_PROGRESS,STALLED,VALIDATION",
      "task_status_filter": "OPEN,BLOCKED",
      "focus_validation_povs": true
    },
    "output": "Automated daily summary with auto-selected highest-risk POV, blocked/open tasks, and next actions",
    "use_case": "Scheduled bot report or daily standup automation"
  }
}
