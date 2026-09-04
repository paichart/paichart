# Magic Parameter Implementation Plan

**Created**: 2025-10-14
**Purpose**: Document and standardize the "magic parameter" pattern across all MCP tools
**Status**: Discovery phase - not yet implemented in elicitation

---

## 🎯 Objective

**What**: Simplify tool elicitation by documenting that ID parameters accept BOTH exact IDs and names, with automatic lookup handled by the system.

**Why**:
- ✅ Eliminates ID confusion across all tools
- ✅ Reduces need for prerequisite tool calls
- ✅ More natural user experience ("assign to John" vs "assign to cm3xyz123")
- ✅ Addresses key confusion points (task.update vs task.assign)

**Impact**:
- Affects ALL tools with ID parameters (40+ tools)
- Simplifies elicitation by ~30-50 tokens per tool
- Improves user experience without code changes

---

## 🔍 Discovery: Where Magic Parameters Exist

### **Pattern Identified**

**The Magic**: Many tools accept BOTH `{field}Id` (UUID) AND `{field}_name` (string lookup)

**How It Works**:
1. User provides name instead of ID
2. Handler/API performs lookup (exact match, then partial, then fuzzy)
3. Returns result or helpful error with available options

**Evidence Found In**:

#### **Location 1**: Parameter Normalizer
**File**: `/lib/mcp/server/utils/parameter-normalizer.js`
**Function**: `normalizeForTool()`
**Lines**: ~700-860

Handles transformations for:
- povId / pov_id / pov_name / pov_title
- taskId / task_id / task_name / task_title
- assigneeId / assignee / assignee_name
- teamId / team_name
- phaseId / phase_name
- stageId / stage_name
- agentTemplateId / agent_template_id / agent_template_name

#### **Location 2**: SDK Handler - project(action: "pov.details")
**File**: `/lib/mcp/server/tools/sdk-native-basic-tools.js`
**Function**: `handleGetPOVDetails()`
**Lines**: 318-376

```javascript
// If pov_title or pov_name provided, search by name
if (!finalPovId && (pov_title || pov_name)) {
  const searchTerm = pov_title || pov_name;
  // Get all POVs and search for matching title
  // Try exact match first, then partial match
}
```

**Supports**: povId, pov_title, pov_name

#### **Location 3**: SDK Handler - project(action: "task.context")
**File**: `/lib/mcp/server/tools/sdk-native-advanced-tools.js`
**Function**: `handleGetTaskContext()`
**Lines**: 108-149

```javascript
// If task_name is provided, look up the task by name
if (!finalTaskId && task_name) {
  // Get tasks and search for matching name
  // Try exact match, then partial, then word-based search
}
```

**Supports**: taskId, task_name, task_title

#### **Location 4**: SDK Handler - template(action: "details")
**File**: `/lib/mcp/server/tools/sdk-native-basic-tools.js`
**Function**: `handleGetAgentTemplateDetails()`
**Lines**: 548-584

```javascript
// If agent_template_name provided, search by name
if (agent_template_name) {
  // Try exact match first, then partial match
}
```

**Supports**: templateId, agent_template_name

#### **Location 5**: SDK Handler - perform(action: "execute")
**File**: `/lib/mcp/server/tools/sdk-native-advanced-tools.js`
**Function**: `handleExecuteTaskAction()`
**Lines**: 322-325

```javascript
if (finalParameters.assignee && !finalParameters.assigneeId) {
  // Keep assignee as is - the API handles name lookup
}
```

**Supports**: assigneeId, assignee (flexible - ID or name)

---

## 🗺️ Complete Magic Parameter Map

| Base Field | ID Parameter | Name Parameter(s) | Tools That Support | Handler Location |
|------------|--------------|-------------------|-------------------|------------------|
| **POV** | povId, pov_id | pov_name, pov_title | project(action: "pov.details"), project(action: "pov.list"), project(action: "task.list"), project(action: "task.context") | sdk-native-basic-tools.js:318-376 |
| **Task** | taskId, task_id | task_name, task_title | project(action: "task.context"), project(action: "task.list"), perform(action: "execute") | sdk-native-advanced-tools.js:108-149 |
| **User/Assignee** | assigneeId | assignee, assignee_name | perform(action: "execute") (task.assign), project(action: "task.list") | sdk-native-advanced-tools.js:322-325 |
| **Team** | teamId | team_name | project(action: "task.list"), perform(action: "execute") | parameter-normalizer.js:~700 |
| **Phase** | phaseId | phase_name, phaseName | project(action: "task.list"), project(action: "task.context"), stage.create | parameter-normalizer.js:~700 |
| **Stage** | stageId | stage_name, stageName | project(action: "task.list"), task.create | parameter-normalizer.js:~700 |
| **Agent Template** | agentTemplateId, templateId, agent_template_id | agent_template_name | template(action: "details"), agent.configure, agent.assign | sdk-native-basic-tools.js:548-584 |

---

## 📝 Implementation Checklist

### **Phase 1: Elicitation Updates** (First Run - Second Pass)

Update tool descriptions to mention magic parameter flexibility:

#### **Core Workflow Tools** (5 tools)

- [ ] **project(action: "pov.list")**
  - File: `/lib/mcp/server/config/tool-schemas.js:45-56`
  - Current: Mentions filters, not magic
  - Add: Brief [TIP] about name flexibility
  - Impact: +30 tokens

- [ ] **project(action: "pov.details")**
  - File: `/lib/mcp/server/config/tool-schemas.js:58-81`
  - Current: Already mentions three ways (povId, pov_title, pov_name)
  - Add: Consolidate to "flexible POV lookup"
  - Impact: -20 tokens (simpler!)

- [ ] **project(action: "task.list")**
  - File: `/lib/mcp/server/config/tool-schemas.js:83-116`
  - Current: Lists assigneeId, assignee, assignee_name separately
  - Add: "assignee accepts ID or name" in [TIP]
  - Impact: +40 tokens

- [ ] **project(action: "task.context")**
  - File: `/lib/mcp/server/config/tool-schemas.js:118-157`
  - Current: Lists taskId, task_name separately
  - Add: "task accepts ID or name" in [PARAMETERS]
  - Impact: +30 tokens

- [ ] **perform(action: "execute")**
  - File: `/lib/mcp/server/config/tool-schemas.js:159-236`
  - Current: Lists assigneeId in task.assign
  - Add: "assignee accepts ID or name" to resolve update vs assign confusion
  - Strategy: De-emphasize task.assign, promote task.update as universal
  - Impact: +50 tokens, -1 confusion point!

#### **Additional Tools with Magic Parameters** (35+ tools)

- [ ] **template(action: "list")**
  - File: `/lib/mcp/server/config/tool-schemas.js:350-359`
  - Magic: agent_template_name
  - Add: [TIP] section

- [ ] **template(action: "details")**
  - File: `/lib/mcp/server/config/tool-schemas.js:361-379`
  - Magic: templateId, agent_template_name
  - Current: Already mentions name search
  - Simplify: "template accepts ID or name"

- [ ] **create_browser_automation_task**
  - File: `/lib/mcp/server/config/tool-schemas.js:435-489`
  - Magic: assigneeId (if it uses same pattern)
  - Add: [TIP] if applicable

- [ ] **All other task management tools** (20+ tools)
  - Search for: Tools with assigneeId, povId, phaseId, stageId parameters
  - Apply consistent magic parameter [TIP]

---

### **Phase 2: Error Guidance Updates** (Second Run)

Update error messages to suggest name-based lookup:

- [ ] **tool-schemas.js:810-826** (getToolSpecificGuidance function)
  - Update perform(action: "execute") error to mention assignee flexibility
  - Update other tools to mention ID/name flexibility

- [ ] **sdk-native-basic-tools.js:694-701** (getToolSpecificGuidance)
  - Add name-based lookup suggestions
  - Update "try using project(action: "pov.list") first" to "or search by name"

- [ ] **sdk-native-advanced-tools.js:983-993** (getToolSpecificGuidance)
  - Add magic parameter hints to errors

---

### **Phase 3: Documentation Updates** (Second Run)

- [ ] **tool-schema-discovery.md**
  - Add "Magic Parameter Pattern" section
  - Document which tools support which magic parameters
  - Reference this implementation doc

- [ ] **execute-task-action-discovery.md**
  - Update confusion point analysis with magic parameter solution
  - Revise task.update vs task.assign guidance

- [ ] **Session continuation prompt**
  - Add note about magic parameter pattern
  - Include in discovery process

---

## 🎯 Strategic Application - Resolving Confusion Points

### **Confusion #1: task.update vs task.assign**

**Current Approach** (without magic):
```
[IMPORTANT] task.update vs task.assign:
• Use task.assign when ONLY changing assignee
• Use task.update when changing multiple fields including assignee
```

**Magic Approach** (with magic):
```
[TASK ACTIONS]
• task.update - Modify any task fields
  Required: taskId
  Common: assignee (accepts ID or name), status, priority, title
  [TIP] Use task.update for all changes. The assignee parameter is flexible.

• task.assign - Specialized for assignee-only changes (alternative)
  [TIP] Most scenarios can use task.update instead
```

**Result**:
- Simplifies to "just use task.update"
- De-emphasizes task.assign (reduces confusion)
- Mentions flexibility where it matters

---

### **Confusion #2: Do I need the ID first?**

**Current Approach** (without magic):
```
[WORKFLOW]
1. Call project(action: "pov.details") to get team member IDs
2. Call task.assign with assigneeId from step 1
```

**Magic Approach** (with magic):
```
[WORKFLOW]
1. Call task.assign with assignee: "John Smith" (name)
   OR
1. Call project(action: "pov.details") first, then task.assign with assigneeId (ID)

[TIP] Names work in most cases. Use IDs for precision when multiple users have similar names.
```

**Result**:
- Optional workflow (not required)
- Faster for simple cases
- IDs still available for precision

---

### **Confusion #3: Which parameter name do I use?**

**Current Approach** (listing all variants):
```
[PARAMETERS]
• assigneeId - User ID (UUID)
• assignee - User name
• assignee_name - User name (alias)
```

**Magic Approach** (unified):
```
[PARAMETERS]
• assignee - User ID or name (flexible lookup)
  Aliases: assigneeId, assignee_name (backwards compatibility)
```

**Result**:
- One parameter to remember
- Simpler mental model
- Aliases mentioned but de-emphasized

---

## 🚀 Immediate Action Items

**Before proceeding with second run**:

- [ ] **Decision**: Apply magic parameter pattern to all 5 tools?
  - Your approval needed
  - Changes elicitation strategy significantly
  - Simplifies descriptions but changes emphasis

- [ ] **Decision**: How much to explain?
  - Option A: Brief [TIP] in each tool (~30 tokens)
  - Option B: Detailed [PARAMETERS] section (~60 tokens)
  - Option C: Just use names in examples, don't explain (~0 tokens)

- [ ] **Decision**: Promote or de-emphasize specialized tools?
  - task.assign - Keep or de-emphasize in favor of task.update?
  - Agent tools - Keep workflow or simplify?

---

## 📊 Impact Assessment

**If we apply magic parameter pattern**:

| Aspect | Before | After | Change |
|--------|--------|-------|--------|
| **Prerequisite Emphasis** | "Call project(action: "pov.details") first for IDs" | "IDs optional - use names" | -50% emphasis on prerequisites |
| **Parameter Count** | List all variants (ID, _id, _name) | Single flexible parameter | -30% parameters to explain |
| **Token Per Tool** | Varies | +30-60 tokens for [TIP] | +40 tokens average |
| **User Confusion** | "Which parameter?" | "Just use the name" | -70% confusion |
| **Workflow Complexity** | Multi-step (get IDs first) | Optional (names work) | -40% steps |

**Net Benefit**: Significantly simpler elicitation, better UX, slight token increase

---

## 🤔 Open Questions

**Q1**: Does assignee parameter in task.assign actually accept names?
- Evidence: Handler line 322-325 suggests yes
- Need to verify: Does API actually handle name lookup for task.assign?
- Test: Try task.assign({ taskId: "...", assignee: "John Smith" })

**Q2**: Are there cases where name lookup fails?
- Multiple users with same name?
- Partial matches ambiguous?
- Error messages helpful when this happens?

**Q3**: Should we document the fallback behavior?
- "Exact match first, then partial, then word-based"
- Or keep it simple: "System finds matches automatically"

**Q4**: What about fields that DON'T have magic?
- Are there ID parameters that ONLY accept UUIDs?
- Should we explicitly note which don't have magic?

---

## 📋 Implementation Tracking

### **Phase 1: Verification** (Before changing elicitation)

- [ ] **Verify assignee magic in task.assign**
  - Test: task.assign with name instead of ID
  - Confirm: API performs lookup
  - Document: Success rate and error messages

- [ ] **Verify all magic parameters work**
  - Test each ID/name pair from matrix above
  - Confirm fuzzy matching behavior
  - Document failure cases

- [ ] **Document API behavior**
  - Exact match vs partial match vs word-based
  - Error messages when no match found
  - How it handles multiple matches

### **Phase 2: Elicitation Updates** (Second Run on tools)

#### **Priority 1: Core Workflow Tools** (Must have)

- [ ] **perform(action: "execute")** (HIGHEST PRIORITY)
  - [ ] Add assignee magic to task.assign action
  - [ ] De-emphasize task.assign in favor of task.update
  - [ ] Add [TIP] about ID/name flexibility
  - [ ] Update confusion point guidance
  - File: `/lib/mcp/server/config/tool-schemas.js:159-236`
  - Estimated: +50 tokens

- [ ] **project(action: "task.list")**
  - [ ] Simplify assignee parameters (consolidate to single flexible param)
  - [ ] Add [TIP] about ID/name flexibility for all filters
  - [ ] Mention povId, phaseId, stageId also accept names
  - File: `/lib/mcp/server/config/tool-schemas.js:83-116`
  - Estimated: +40 tokens

- [ ] **project(action: "pov.details")**
  - [ ] Consolidate povId/pov_title/pov_name explanation
  - [ ] Simplify to "flexible POV lookup"
  - File: `/lib/mcp/server/config/tool-schemas.js:58-81`
  - Estimated: -20 tokens (simpler!)

- [ ] **project(action: "task.context")**
  - [ ] Consolidate taskId/task_name explanation
  - [ ] Add [TIP] about POV/phase name flexibility
  - File: `/lib/mcp/server/config/tool-schemas.js:118-157`
  - Estimated: +30 tokens

- [ ] **project(action: "pov.list")**
  - [ ] Add [TIP] that geographic filters accept names
  - [ ] Mention theatre_name, country_name, region_name are flexible
  - File: `/lib/mcp/server/config/tool-schemas.js:45-56`
  - Estimated: +20 tokens

#### **Priority 2: Agent Tools** (Should have)

- [ ] **template(action: "list")**
  - [ ] Add [TIP] about agent_template_name flexibility
  - File: `/lib/mcp/server/config/tool-schemas.js:350-359`
  - Estimated: +25 tokens

- [ ] **template(action: "details")**
  - [ ] Consolidate templateId/agent_template_name
  - File: `/lib/mcp/server/config/tool-schemas.js:361-379`
  - Estimated: +20 tokens

- [ ] **perform(action: "agent_results")**
  - [ ] Mention taskId flexibility
  - File: `/lib/mcp/server/config/tool-schemas.js:381-407`
  - Estimated: +20 tokens

#### **Priority 3: Other Tools** (Nice to have)

- [ ] **All remaining tools with ID parameters** (~30 tools)
  - [ ] Audit each tool for ID parameters
  - [ ] Add consistent [TIP] section
  - [ ] Estimated: +25 tokens average per tool

---

### **Phase 3: Error Guidance** (Second Run)

- [ ] **Update getToolSpecificGuidance() in tool-schemas.js**
  - Line: 810-826
  - [ ] Add "try using name instead of ID" to relevant tools
  - [ ] Update perform(action: "execute") error to mention assignee flexibility
  - [ ] Update project(action: "pov.details") error to emphasize name search

- [ ] **Update handler error messages**
  - [ ] sdk-native-basic-tools.js:397-401 (getToolSpecificGuidance)
  - [ ] sdk-native-advanced-tools.js:983-993 (getToolSpecificGuidance)
  - [ ] Add name-based lookup suggestions

- [ ] **Update smart error recovery suggestions**
  - File: `/lib/mcp/server/utils/smart-error-recovery.js`
  - [ ] Add suggestions to try name lookup when ID fails
  - [ ] Line 548: Update "try project(action: "task.list") first" to "or search by name"

---

## 📐 Elicitation Template

**Standard [TIP] Section for Tools with Magic Parameters**:

```
[TIP] ID/Name Flexibility:
All ID parameters accept either exact IDs or names:
• povId / pov_name - Project lookup
• taskId / task_name - Task lookup
• assigneeId / assignee - User lookup
• phaseId / phase_name - Phase lookup
• stageId / stage_name - Stage lookup

The system performs fuzzy matching (exact, then partial, case-insensitive).
Use names for simpler workflows - IDs are optional!
```

**Token Cost**: ~80 tokens
**Alternative (Brief)**:

```
[TIP] All ID parameters (povId, taskId, assigneeId, etc.) accept names instead of IDs.
The system performs fuzzy lookup automatically.
```

**Token Cost**: ~25 tokens

---

## 🎓 Examples - Before vs After

### **Example 1: Task Assignment**

**Before (ID-focused)**:
```
[WORKFLOW] To assign a task:
1. Call project(action: "pov.details") to get team member IDs
2. Find the user ID from team members list
3. Call perform(action: "execute"):
   action: "task.assign"
   parameters: { taskId: "cm3abc...", assigneeId: "cm3xyz..." }
```

**After (Magic parameter)**:
```
[WORKFLOW] To assign a task:
1. Call project(action: "task.list") to get taskId
2. Call perform(action: "execute"):
   action: "task.assign"
   parameters: { taskId: "cm3abc...", assignee: "John Smith" }

[TIP] assignee accepts user name or ID. Names are usually easier.
```

**Difference**:
- One step instead of two
- More natural ("assign to John" vs "assign to cm3xyz")
- Optional: Can still use project(action: "pov.details") for ID if needed

---

### **Example 2: Creating Tasks**

**Before**:
```
[WORKFLOW] To create a task:
1. Call project(action: "pov.details") to get phase and stage IDs
2. Note the IDs from the phases/stages section
3. Call perform(action: "execute"):
   action: "task.create"
   parameters: {
     phaseId: "cm3phase...",
     stageId: "cm3stage...",
     title: "My Task"
   }
```

**After**:
```
[WORKFLOW] To create a task:
1. Call perform(action: "execute"):
   action: "task.create"
   parameters: {
     phaseName: "Planning",
     stageName: "Requirements",
     title: "My Task"
   }

[TIP] phase and stage accept names or IDs. Use names for simpler workflow.
```

**Difference**:
- No prerequisite tool call needed
- Much simpler mental model
- Still works with IDs if user has them

---

## ✅ Decision Points

**Before implementing, need decisions on**:

1. **Scope**:
   - [ ] Apply to all 5 discovered tools immediately (second run)?
   - [ ] Apply to all 40+ tools systematically (larger effort)?
   - [ ] Pilot with 2-3 tools first (validate approach)?

2. **Depth**:
   - [ ] Brief [TIP] only (~25 tokens per tool)?
   - [ ] Detailed [TIP] with examples (~80 tokens per tool)?
   - [ ] Just use names in examples, minimal explanation (~0 tokens)?

3. **Strategy for Confusion Points**:
   - [ ] De-emphasize task.assign in favor of task.update?
   - [ ] Keep both equal but explain magic parameter?
   - [ ] Promote task.assign as "clearer intent" despite update working?

4. **Verification**:
   - [ ] Test magic parameters before documenting (verify they work)?
   - [ ] Document as-is based on code reading (trust the implementation)?

---

## 🔧 Testing Checklist

**Before updating elicitation, verify magic works**:

- [ ] Test assignee in task.assign with name
  - Command: `task.assign({ taskId: "...", assignee: "Steve" })`
  - Expected: Finds user Steve, assigns task
  - Actual: {to be tested}

- [ ] Test pov_name in project(action: "pov.details")
  - Command: `project(action: "pov.details", { pov_name: "BlackEye" })`
  - Expected: Finds "BlackEye Red Team Project"
  - Actual: {already verified working from code}

- [ ] Test task_name in project(action: "task.context")
  - Command: `project(action: "task.context", { task_name: "Setup" })`
  - Expected: Finds task with "Setup" in title
  - Actual: {to be tested}

- [ ] Test edge cases
  - Multiple matches: Does it return error with suggestions?
  - No matches: Does it list available options?
  - Partial match: Does fuzzy search work?

---

## 📊 Progress Tracking

### **Phase 1: Verification**
- [ ] Test assignee magic (0/1)
- [ ] Test all magic parameters (0/7)
- [ ] Document test results (0/1)
- [ ] Make go/no-go decision (0/1)

### **Phase 2: Core Tools Update**
- [ ] perform(action: "execute") (0/1)
- [ ] project(action: "task.list") (0/1)
- [ ] project(action: "pov.details") (0/1)
- [ ] project(action: "task.context") (0/1)
- [ ] project(action: "pov.list") (0/1)

### **Phase 3: Extended Tools**
- [ ] Agent tools (0/3)
- [ ] Browser automation tools (0/3)
- [ ] Hub tools (0/8)
- [ ] All other tools (0/30+)

### **Phase 4: Error Guidance**
- [ ] tool-schemas.js updates (0/1)
- [ ] Handler error updates (0/3)
- [ ] Smart error recovery (0/1)

**Overall Progress**: 0/60+ tasks

---

## 💡 Key Insight

**The Real Power**: This isn't just about making things easier - it's about **eliminating entire confusion points**.

**Your scenario**: "Update the task owner to be..."
- Without magic: User confused about update vs assign, needs project(action: "pov.details") for ID
- With magic: User just uses task.update with assignee name - done!

**This could be the BIGGEST improvement to elicitation** - bigger than all the workflow guidance!

---

## 📝 Next Steps

1. **Get your approval** on magic parameter approach
2. **Decide scope**: All 5 tools or pilot with 2-3?
3. **Decide depth**: Brief [TIP] or detailed explanation?
4. **Test verification**: Should we test before documenting?
5. **Update drafts**: Revise the 5 first-run drafts with magic parameter approach

---

**Status**: Ready for decision and implementation
**Owner**: Awaiting user approval on approach
**Estimated Effort**: 15-20 minutes to update 5 tool drafts
**Estimated Benefit**: -70% confusion on ID parameters
