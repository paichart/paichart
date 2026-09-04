# perform(action: "execute"): Deep Discovery & Analysis

**Created**: 2025-10-14
**Tool Complexity**: 🔥🔥🔥🔥🔥 EXTREME (13 actions in one tool)
**Discovery Time**: 18 minutes
**Confidence**: 95/100

---

## 🔍 Tool Overview

**What It Is**: Multi-action tool that performs task management operations
**How Many Actions**: 13 actions grouped into 5 categories
**Security Level**: 🔒 AUTHENTICATED
**Tool Type**: ACTION (final step in workflow chain)

---

## Before (Current State)

**Description** (tool-schemas.js:161):
```
"Perform task management operations for projects. Supports task creation, updates, configuration,
and workflow automation. For agent.configure and task.create actions, pass all parameters as a
JSON string in the parameters field (e.g., parameters: \"{\\\"taskId\\\": \\\"...\\\",
\\\"title\\\": \\\"...\\\", \\\"description\\\": \\\"...\\\", \\\"priority\\\": \\\"MEDIUM\\\"}\")."
```

**Error Guidance** (THREE locations):

**Location 1**: tool-schemas.js:817
```
'perform(action: "execute")': '💡 **Tip**: Valid actions include "task.create", "task.update",
"task.assign", "analytics.generate"'
```
🐛 **BUG**: Only lists 4 of 13 actions!

**Location 2**: sdk-native-advanced-tools.js:290-300 (in handler)
```javascript
const availableActions = [
  'task.create - Create a new task',
  'task.update - Update an existing task',
  'task.assign - Assign a task to a user',
  'task.complete - Mark a task as complete',
  'task.block - Mark a task as blocked',  // 🐛 BUG: Not in schema enum!
  'analytics.generate - Generate analytics report',
  'agent.execute - Execute an agent on a task'
];
```
🐛 **BUGS**:
- Shows task.block (not in allowed actions)
- Missing 6 actions

**Location 3**: sdk-native-advanced-tools.js:986 (duplicate of Location 1)

**Token Count**: ~160 tokens (very short for such a complex tool!)

---

## Architecture Discovery

**Data Flow**:
```
MCP Tool (perform(action: "execute"))
  ↓
SDK Handler (sdk-native-advanced-tools.js:263-518)
  ↓
API → POST /api/mcp/tasks/action
  ↓
Action routing → Different handlers per action
  ↓
Prisma operations → Database changes
```

**Key Files Read**:
- ✅ `/lib/mcp/server/tools/sdk-native-advanced-tools.js` (lines 263-518) - Handler
- ✅ `/lib/mcp/server/config/tool-schemas.js` (lines 159-236) - Schema
- ✅ `/lib/validation/mcp-action-validation.ts` (lines 1-229) - **SOURCE OF TRUTH**
- ✅ `/lib/tasks/handlers/post.ts` (lines 1-82) - task.create implementation
- ✅ Error guidance (3 locations)

---

## The 13 Actions - Complete Parameter Matrix

**FROM**: mcp-action-validation.ts (lines 70-167) - Definitive validation rules

### GROUP 1: TASK ACTIONS (5 actions)

**1. task.create**
- **Required**: title
- **Optional**: description, povId, phaseId, stageId, stageName, phaseName, priority, dueDate, assigneeId, order
- **Prerequisites**: project(action: "pov.details") (for phase/stage IDs)
- **Workflow**: project(action: "pov.list") → project(action: "pov.details") → task.create
- **What it does**: Creates new task in specified stage/phase

**2. task.update** ⚠️ CONFUSION WITH task.assign
- **Required**: taskId
- **Optional**: title, description, priority, status, dueDate, assigneeId
- **Prerequisites**: project(action: "task.list") (for taskId)
- **Workflow**: project(action: "task.list") → task.update
- **What it does**: Modifies existing task fields
- **Confusion**: CAN change assigneeId, but task.assign is specialized for this
- **When to use**: Changing multiple fields including assignee, OR changing non-assignee fields

**3. task.assign** ⚠️ SPECIALIZED VERSION OF UPDATE
- **Required**: taskId, assigneeId
- **Optional**: assigneeName, reason
- **Prerequisites**: project(action: "task.list") (taskId), project(action: "pov.details") (team member IDs for assigneeId)
- **Workflow**: project(action: "pov.details") (get team) → project(action: "task.list") (get taskId) → task.assign
- **What it does**: Changes who works on the task
- **When to use**: ONLY changing assignee (specialized, clearer intent than task.update)

**4. task.complete**
- **Required**: taskId
- **Optional**: completionNote, completedBy
- **Prerequisites**: project(action: "task.list") (taskId)
- **What it does**: Marks task as completed

**5. task.comment**
- **Required**: taskId, comment
- **Optional**: commentBy
- **Prerequisites**: project(action: "task.list") (taskId)
- **What it does**: Adds comment to task

---

### GROUP 2: STAGE ACTIONS (1 action)

**6. stage.create**
- **Required**: phaseId, name
- **Optional**: description, order, position (first|last|middle), afterStage, beforeStage
- **Prerequisites**: project(action: "pov.details") (for phaseId)
- **Workflow**: project(action: "pov.details") → stage.create
- **What it does**: Creates new stage within a phase
- **Special**: Parameters get hoisted to top level in handler (backward compatibility)
- **Confusion**: Three ways to position stage (order vs position vs afterStage)

---

### GROUP 3: AGENT ACTIONS (5 actions)

**7. agent.configure** ⚠️ OPTIONAL CUSTOMIZATION STEP
- **Required**: agentRole, prompt
- **Optional**: taskId, agentTemplateId, maxRetries (1-10), timeout (30-3600s)
- **Prerequisites**: template(action: "list") (for template understanding)
- **What it does**: Customizes agent parameters (role, prompt, retries, timeout)
- **When to use**: When you need CUSTOM agent behavior (not template defaults)
- **Confusion**: Name suggests required first step, but it's OPTIONAL

**8. agent.assign** ⚠️ CONFUSION WITH configure
- **Required**: taskId, agentTemplateId
- **Optional**: agentRole
- **Prerequisites**: template(action: "list") (templateId), project(action: "task.list") (taskId)
- **Workflow Option A**: agent.assign → agent.execute (use template defaults)
- **Workflow Option B**: agent.configure → agent.assign → agent.execute (custom setup)
- **What it does**: Attaches agent template to task
- **Confusion**: Can skip agent.configure if using template defaults

**9. agent.execute**
- **Required**: taskId
- **Optional**: agentTemplateId, inputContext, maxRetries
- **Prerequisites**: agent.assign (agent must be attached to task)
- **Workflow**: agent.assign → agent.execute
- **What it does**: Actually runs the agent on the task

**10. agent.status**
- **Required**: NONE (taskId and agentTemplateId both optional!)
- **Prerequisites**: agent.execute (need execution to check)
- **What it does**: Checks agent execution status
- **Issue**: How to know which task/agent if no required params? 🐛 Possible validation bug

**11. agent.results**
- **Required**: NONE (taskId and executionId both optional!)
- **Prerequisites**: agent.execute completed
- **What it does**: Gets agent execution output
- **Duplication**: Also exists as standalone perform(action: "agent_results") tool!
- **When to use action**: Quick check within workflow
- **When to use dedicated tool**: Detailed results with full artifact listing

---

### GROUP 4: WORKFLOW ACTIONS (1 action)

**12. workflow.trigger**
- **Required**: workflowType (testing | deployment | analysis | automation)
- **Optional**: povId, taskId, context
- **Prerequisites**: Depends on workflowType
- **What it does**: Triggers automated workflow execution

**Workflow Types**:
- `testing` - Run test automation workflows
- `deployment` - Trigger deployment workflows
- `analysis` - Run analysis workflows
- `automation` - General automation workflows

---

### GROUP 5: ANALYTICS ACTIONS (1 action)

**13. analytics.generate**
- **Required**: analysisType (performance | insights | agent_execution_status | summary)
- **Optional**: povId, timeRange (day|week|month|year), filters
- **Prerequisites**: Depends on analysisType and scope
- **What it does**: Generates analytics reports

**Analysis Types**:
- `performance` - Team/task performance metrics
- `insights` - AI-generated insights
- `agent_execution_status` - Agent execution analytics
- `summary` - Executive summary report

---

## Key Confusion Points (User Identified)

### CONFUSION #1: task.update vs task.assign

**The Issue**: When should you use which to change assignee?

**Discovery** (validation schema lines 84-99):
- **task.update** CAN change assigneeId (line 91: `assigneeId: ValidationSchemas.USER_ID.optional()`)
- **task.assign** is SPECIALIZED for assignee changes (line 94-99)

**The Answer**:
- Use **task.assign** when ONLY changing assignee (clearer intent, specialized)
- Use **task.update** when changing assignee + other fields (status, priority, etc.)

**Example**:
```
// Just changing assignee? Use assign:
task.assign({ taskId: "cm3...", assigneeId: "cm3..." })

// Changing assignee + status + priority? Use update:
task.update({ taskId: "cm3...", assigneeId: "cm3...", status: "IN_PROGRESS", priority: "HIGH" })
```

---

### CONFUSION #2: agent.configure vs agent.assign

**The Issue**: What's the difference and do you need both?

**Discovery** (validation schema lines 123-136):
- **agent.configure** is OPTIONAL customization (line 124: `taskId: ...optional()`)
- **agent.assign** is REQUIRED attachment (line 133: `taskId: ...required`)

**The Answer**:
- **agent.configure** is for CUSTOM agent setup (custom role, prompt, retries)
- **agent.assign** attaches agent to task (can use template defaults)
- **You can SKIP configure** if template defaults are sufficient

**Workflows**:
```
Simple (use defaults):
  template(action: "list") → agent.assign → agent.execute

Advanced (custom setup):
  template(action: "list") → agent.configure → agent.assign → agent.execute
```

---

## Special Behaviors

**1. Parameter Hoisting** (Handler lines 347-385)
- Actions: stage.create, task.create
- Handler moves parameters from nested object to top level for API compatibility
- User Impact: None (handled automatically)

**2. Parameter Flexibility** (Schema lines 179-236)
- Accepts nested parameters: `{ action: "...", parameters: { ... } }`
- Accepts flat parameters: `{ action: "...", taskId: "...", ... }`
- Accepts JSON string: `{ action: "...", parameters: "{...JSON...}" }`

**3. agent.results Duplication**
- Exists as ACTION in this tool
- Exists as STANDALONE tool (perform(action: "agent_results"))
- **Use action**: Quick check within workflow
- **Use tool**: Detailed results with full artifacts

---

## Bugs Found

**BUG #1**: task.block in error message (Handler line 295)
- Shows "task.block - Mark a task as blocked"
- NOT in schema enum
- NOT in validation schema
- **Fix**: Remove from error message

**BUG #2**: Incomplete error guidance (tool-schemas.js:817)
- Only lists 4 of 13 actions
- **Fix**: List all 13 or reference action groups

**BUG #3**: agent.status/agent.results have no required params
- Both allow empty calls (validation lines 145-152)
- How to know which task/agent to check?
- **Investigate**: Possible validation bug or relying on session context

---

## First Run Draft (Main Description)

```javascript
perform(action: "execute"): {
  title: "Perform Task Action",
  description: `Execute task management operations across 13 actions in 5 categories.

[IMPORTANT] Common Confusion:
• task.update vs task.assign - Use assign for assignee-only changes, update for multiple fields
• agent.configure vs agent.assign - configure is optional customization, assign is required attachment

[TASK ACTIONS] Basic management (5 actions):
• task.create - Create task (requires: title)
• task.update - Modify task (requires: taskId)
• task.assign - Change assignee (requires: taskId, assigneeId)
• task.complete - Mark done (requires: taskId)
• task.comment - Add comment (requires: taskId, comment)

[STAGE ACTIONS] Project structure (1 action):
• stage.create - Create stage (requires: phaseId, name)

[AGENT ACTIONS] AI automation (5 actions):
• agent.assign - Attach agent to task (requires: taskId, agentTemplateId)
• agent.execute - Run agent (requires: taskId)
• agent.configure - Customize agent (optional, requires: agentRole, prompt)
• agent.status - Check status (requires: taskId)
• agent.results - Get output (requires: taskId)

[WORKFLOW ACTIONS] Automation (1 action):
• workflow.trigger - Trigger workflow (requires: workflowType)
  Types: testing, deployment, analysis, automation

[ANALYTICS ACTIONS] Reporting (1 action):
• analytics.generate - Generate reports (requires: analysisType)
  Types: performance, insights, agent_execution_status, summary

[PARAMETERS] Format (nested or flat):
• Nested: { action: "task.create", parameters: { title: "..." } }
• Flat: { action: "task.create", title: "..." }

[WORKFLOW] Complete task workflow:
1. project(action: "pov.details") → Get IDs (phases, stages, team members)
2. task.create → Create task in stage
3. task.assign → Assign to team member (using IDs from step 1)
4. agent.assign → Attach agent template
5. agent.execute → Run automation
6. task.complete → Mark done`,
  inputSchema: z.object({
    // ... existing schema ...
  })
}
```

**Token Count**: ~650 tokens
**Format**: Grouped by category, brief per action, confusion points highlighted

---

## User Decisions

**Your Answers**:
1. ✅ Investigate workflow.trigger and analytics.generate - YES
2. ❌ Promote assignee magic (accepts names) - NO, stick with IDs
3. ✅ Explain agent.results duplication - YES, briefly
4. 🐛 task.block bug - YES, it's a bug
5. ✅ Cover all 13 actions - YES, briefly

**Applied to draft**:
- ✅ All 13 actions listed briefly
- ✅ Confusion points (update vs assign, configure vs assign) highlighted
- ✅ agent.results duplication explained
- ❌ No mention of assignee name flexibility (keep it simple with IDs)
- ❌ No external doc reference (removed [TIP] section)

---

## Action Items for Second Run

**Description Improvements**:
- [ ] Add prerequisites for each action group?
- [ ] Show example parameters for top 3 actions?
- [ ] Emphasize workflow position more (final action tool)?

**Error Guidance**:
- [ ] Fix BUG #1: Remove task.block from error message
- [ ] Fix BUG #2: Update tool-schemas.js:817 to list all 13 actions or action groups
- [ ] Fix BUG #3: Investigate agent.status/agent.results no-required-params issue
- [ ] Consolidate duplicate error guidance (appears in 2 files)

**Validation Issues to Address**:
- [ ] agent.status: Should taskId be required?
- [ ] agent.results: Should taskId be required? (vs using session context)

---

## Related Tools

**Upstream Dependencies** (provide IDs for this tool):
- project(action: "pov.details") - Provides povId, phaseId, stageId, team member IDs
- project(action: "task.list") - Provides taskId
- template(action: "list") - Provides agentTemplateId

**Downstream Dependencies**:
- None (this is the terminal action tool)

**Workflow Position**: ACTION (final step in workflow)

**Complete Chain**:
```
project(action: "pov.list") → project(action: "pov.details") → project(action: "task.list") → project(action: "task.context") → perform(action: "execute")
```

---

## Error Guidance Review

**Current State**: Incomplete and buggy

**Issues**:
1. ❌ Only 4 of 13 actions listed in main error guidance
2. 🐛 task.block shown but not valid
3. ❌ Missing 6 actions entirely
4. ❌ No guidance on confusion points (update vs assign)
5. ❌ Duplicated across 3 locations

**Action Items for Error Guidance Second Run**:
- [ ] List all 13 actions or reference groups
- [ ] Remove task.block (bug)
- [ ] Add guidance on update vs assign confusion
- [ ] Add guidance on configure vs assign workflow
- [ ] Consolidate to single source (remove duplication)
- [ ] Add parameter requirement examples per action

---

## Metadata

| Property | Value |
|----------|-------|
| **Security Level** | 🔒 AUTHENTICATED |
| **Tool Type** | ACTION (multi-action) |
| **Action Count** | 13 actions in 5 categories |
| **Prerequisites** | Varies by action (see matrix above) |
| **Returns** | Action result (varies by action type) |
| **Current Token Count** | ~160 tokens |
| **Draft Token Count** | ~650 tokens (+490) |
| **Token Cost Impact** | ~$1.50/year |
| **Priority** | P0 (CRITICAL - terminal action tool) |
| **Complexity** | EXTREME (13 different operations) |

---

## Discovery Process Notes

**What Worked Exceptionally Well**:
- ⭐⭐⭐⭐⭐ Reading validation schema (5 min) - DEFINITIVE source for all actions
- ⭐⭐⭐⭐⭐ Finding 3 error guidance locations (3 min) - Revealed bugs and inconsistencies
- ⭐⭐⭐⭐ Reading handler special cases (3 min) - Found parameter hoisting logic
- ⭐⭐⭐⭐ Comparing schema vs validation (2 min) - Found task.block bug

**Total Time**: 18 minutes (longer due to complexity, worth it)

**Key Learning**: For multi-action tools, validation schema is MORE valuable than handler

---

## Status

- [x] Discovery complete (18 min)
- [x] All 13 actions mapped
- [x] Parameter requirements documented
- [x] Confusion points identified
- [x] Error guidance analyzed
- [x] Bugs found and documented
- [x] First run draft created
- [ ] User feedback
- [ ] Error guidance fixes
- [ ] Second run refinement
- [ ] Commit to codebase

---

**Last Updated**: 2025-10-14
**Companion to**: tool-schema-discovery.md
**Tool**: perform(action: "execute") (13 actions)
**Complexity**: EXTREME
**Readiness**: First run draft complete, awaiting feedback
