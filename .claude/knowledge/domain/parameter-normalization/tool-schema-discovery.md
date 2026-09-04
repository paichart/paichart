# Tool Schema Discovery Log

**Purpose**: Document architectural discoveries and elicitation improvements for MCP tools
**Approach**: Collaborative, iterative refinement
**Process**: Discovery → Draft → Review → Refine → Commit

---

## 🔄 SESSION CONTINUATION PROMPT

**Use this prompt to continue this work in a new Claude Code session:**

```
I'm improving MCP tool descriptions through architectural discovery. We're using a
collaborative approach with TWO passes: First Run (discovery + draft all tools),
Second Run (refine based on patterns).

APPROACH:
1. Discover each tool's architecture (7-10 min per tool)
2. Draft improved descriptions AND review error guidance
3. Document findings in /cline_docs/tool-schema-discovery.md
4. Get my feedback before finalizing anything
5. Move to next tool (complete first run before second run)

DISCOVERY PROCESS (per tool):
Step 1: Read Prisma schema (2 min) - Data structure, relationships, indexes
Step 2: Read MCP handler (2 min) - Parameter usage, smart fallback logic
Step 3: Read service layer (3 min) - Business logic, performance, what's returned
Step 4: Read error guidance (2 min) - Check getToolSpecificGuidance() AND handler errors
  → KEY: Find tips buried in errors that should be in description!
Step 5: Skip UI components (not needed for MCP tools)
Step 6: Document in discovery log with findings + action items

WHAT TO FOCUS ON:
- WORKFLOW emphasis (how tools connect, what IDs to capture)
- Error guidance review (move proactive tips from errors to description)
- Keep it simple (skip technical details like indexes/performance)
- Tool relationships (prerequisite chains, downstream usage)
- What to capture from output (IDs needed for other tools)

CURRENT STATUS:
- Read /cline_docs/tool-schema-discovery.md for progress
- Continue from where we left off
- Tool order: project(action: "pov.list") → project(action: "pov.details") → project(action: "task.list") → project(action: "task.context") → perform(action: "execute")

KEY LEARNINGS SO FAR:
- Error guidance often contains workflow tips that belong in descriptions
- WORKFLOW sections are critical for foundation tools (set up downstream success)
- "What to capture from output" is as important as "what parameters to provide"
- Trust users on details, guide on workflow
```

---

## 📋 Discovery Process Template

For each tool, we document:
1. **Before** - Current tool description AND error guidance
2. **Architecture Discovery** - What we learned from code
3. **First Run Draft** - Improved description (not error guidance yet)
4. **User Notes** - Feedback and insights
5. **Action Items for Second Run** - What to refine in second pass
6. **Error Guidance Review** - Current error messages and improvements
7. **Related Tools** - Dependencies and workflow connections
8. **Metadata** - Security level, token cost, priority

**Discovery Steps** (per tool, ~10 minutes):
1. Read Prisma schema (2 min) - Data structure and relationships
2. Read MCP handler (2 min) - Parameter usage and logic
3. Read service layer (3 min) - Business logic and queries
4. Read error guidance (2 min) - getToolSpecificGuidance + error handlers ⭐ NEW
5. Skip UI components (not needed for MCP tools)
6. Skip tool-to-tool grep (only if needed)

---

## 🔧 Tool: `project(action: "pov.list")`

### **Before** (Current State)

**Description** (tool-schemas.js:47):
```javascript
"💡 Tip: For better performance, use the 'pov-database' resource with advanced filtering.
This tool remains available for compatibility but resources offer better real-time data and filtering.

List all Projects (Proof of Value) with filtering options. Use customer_name to filter by
customer (e.g., 'innovation partners', 'Cloud First Solutions'). Use geographic filters like
country_name ('Australia'), region_name ('Asia Pacific'), or theatre_name ('APJ', 'EMEA',
'NORTH_AMERICA', 'LAC').

📈 Resource alternative: Use `mcp://database/pov-database?status=IN_PROGRESS&limit=20` for
enhanced filtering with real-time metrics and execution context."
```

**Error Guidance** (tool-schemas.js:755 & sdk-native-basic-tools.js:399):
```javascript
// In getToolSpecificGuidance():
'project(action: "pov.list")': '💡 **Tip**: Use status values like "IN_PROGRESS", "COMPLETED", etc.
🚀 **Migration**: Consider using resource `mcp://database/pov-database` for enhanced real-time data and filtering.'

// In handler error messages:
// (No specific error guidance - generic error handling only)
```

**Token Count**: ~150 tokens (description only)
**Security Level**: 🔒 AUTHENTICATED

---

### **Architecture Discovery** (10-12 minutes)

**Data Flow Traced:**
```
MCP Tool (project(action: "pov.list"))
  ↓
SDK Handler (sdk-native-basic-tools.js:82-170)
  ↓
API Client → GET /api/pov
  ↓
API Handler (pov-handler.ts:60-195)
  ↓
PoVService.list() (pov.ts:277-461) [N+1 OPTIMIZED]
  ↓
Prisma Query → POV table
```

**Key Files Read:**
- ✅ `/prisma/schema.prisma` (lines 40-104) - POV model
- ✅ `/lib/mcp/server/tools/sdk-native-basic-tools.js` (lines 82-170) - Handler
- ✅ `/lib/pov/services/pov.ts` (lines 277-461) - Service
- ✅ `/lib/api/pov-handler.ts` (lines 60-195) - API endpoint
- ⏭️ `/components/pov/POVList.tsx` (LOW value - UI uses API, not MCP)

**What Worked:**
- ⭐⭐⭐⭐⭐ Prisma schema (2 min, essential) - Revealed indexes and data structure
- ⭐⭐⭐⭐⭐ MCP handler (2 min, critical) - Showed actual parameter usage
- ⭐⭐⭐⭐ Service layer (3 min, very helpful) - Performance optimization insights
- ⭐⭐⭐ API handler (2 min, helpful) - Confirmed query parameters

**What Didn't Help:**
- ⭐⭐ UI components (1 min, low value) - Different code path
- ⭐ Tool-to-tool grep (30 sec, minimal) - No dependencies found

**Total Discovery Time**: 10-12 minutes
**High-Value Time**: 7-8 minutes (schema + handler + service)

---

### **Findings Summary:**

**1. Database Insights:**
- Composite index: `@@index([status, priority])` → filtering both together is most efficient
- Other indexes: ownerId, teamId, countryId, regionId, salesTheatre
- Access control: Automatic (users only see POVs they own or are team members of)

**2. Parameter Insights:**
- ALL parameters are optional (no prerequisites)
- customer_name, country_name, region_name, theatre_name support partial matching (case-insensitive)
- limit defaults to 100, max is 200
- Geographic filters are hierarchical: theatre → country → region

**3. Performance Insights:**
- Service uses N+1 optimization (800ms → 150ms, 81% reduction)
- List view uses minimal select (no deep includes)
- Returns summary data only (_count for phases/tasks, not full data)

**4. API Insights:**
- API has pagination (page/pageSize) that MCP tool doesn't expose
- MCP tool simplifies API (no pagination complexity)
- Filters: status, priority, teamId supported in API

**5. Workflow Insights:**
- This is a FOUNDATION tool (first in typical workflow)
- Typical pattern: project(action: "pov.list") → project(action: "pov.details") → project(action: "task.list") → perform(action: "execute")
- No tool dependencies (standalone discovery tool)

---

### **First Run Draft**

```javascript
project(action: "pov.list"): {
  title: "List POVs",
  description: `List all Projects (Proof of Value) with filtering options.

[FILTER] Available filters:
• status - Project status (PROJECTED, IN_PROGRESS, STALLED, VALIDATION, WON, LOST)
• customer_name - Filter by customer (supports partial matching, case-insensitive)
• Geographic filters (hierarchical):
  - theatre_name - Sales theatre (APJ, EMEA, NORTH_AMERICA, LAC)
  - country_name - Country within theatre
  - region_name - Region within country
• limit - Maximum results (default: 100, max: 200)

[TIP] For better results:
• Use status filter to narrow down large result sets
• Geographic filters are hierarchical (theatre → country → region)
• For advanced filtering and real-time metrics, consider the pov-database resource

[WORKFLOW] Typical usage:
1. Call project(action: "pov.list") with filters to discover available Projects
2. Note the POV IDs from results
3. Use project(action: "pov.details") with a specific ID for full information`,
  inputSchema: z.object({
    // ... existing schema ...
  })
}
```

**Token Count**: ~250 tokens (+100 from current)
**Token Cost**: ~$0.30/year (negligible)

---

### **User Notes** (Feedback from review)

**Decision 1: Performance Guidance**
- ❌ Skip composite index mention (too technical)
- **Rationale**: Users don't care about query performance at this level

**Decision 2: Geographic Hierarchy**
- ✅ Mention hierarchy briefly
- **Rationale**: Helps users understand how filters relate
- **Action**: Keep "hierarchical" note in [FILTER] section

**Decision 3: Limit & Filtering**
- ✅ Suggest using status filters to narrow results
- ✅ Brief resource mention only (not using resources yet)
- **Rationale**: Practical guidance for common use case

**Decision 4: Security/Access Control**
- ❌ Hide it (implicit behavior)
- **Rationale**: Just works, no need to explain

**Decision 5: WORKFLOW Section**
- ⚠️ CRITICAL INSIGHT: This tool is called FIRST in typical workflows
- **User Note**: "WORKFLOW is really important because if this tool is called first (mostly)
  it can set the effectiveness of other tool calls"
- **Action for Second Run**: Emphasize WORKFLOW section more, show downstream impact

---

### **Action Items for Second Run**

**Purpose**: Track improvements to make in second pass (after first run through all tools)

- [ ] Strengthen [WORKFLOW] section - emphasize this is FIRST tool in typical workflow
- [ ] Add "Capture POV IDs" instruction - explicit about what to save
- [ ] Show downstream tool examples - how IDs are used in project(action: "pov.details"), project(action: "task.list"), etc.
- [ ] Consider: Mention ID format 'cm3...' (UUID) for clarity?
- [ ] Consider: Explain what information to capture from output beyond just IDs?
- [ ] Review after seeing project(action: "pov.details") - ensure consistency in how we describe the relationship

**User Feedback:**
- "WORKFLOW is really important because if this tool is called first (mostly) it can set the effectiveness of other tool calls"
- Focus on how this tool enables downstream success
- Show the relationship chain explicitly

---

### **Related Tools**

**Downstream Dependencies** (tools that use POV IDs from this tool):
- `project(action: "pov.details")` - Requires povId from project(action: "pov.list") output
- `project(action: "task.list")` - Optional povId filter (common pattern)
- `perform(action: "execute")` - Some actions need povId (e.g., task.create)

**Workflow Hierarchy**:
```
project(action: "pov.list") (FOUNDATION - discover Projects)
  ↓
project(action: "pov.details") (DETAIL - get specific Project info)
  ↓
project(action: "task.list") (QUERY - find tasks in Project)
  ↓
perform(action: "execute") (ACTION - modify tasks)
```

**Tool Relationship Type**: FOUNDATION (first in chain, no prerequisites)

---

### **Metadata**

| Property | Value |
|----------|-------|
| **Security Level** | 🔒 AUTHENTICATED |
| **Tool Type** | Discovery / List |
| **Prerequisites** | None (foundation tool) |
| **Used By** | project(action: "pov.details"), project(action: "task.list"), perform(action: "execute") |
| **Current Token Count** | ~150 tokens |
| **Draft Token Count** | ~250 tokens (+100) |
| **Token Cost Impact** | ~$0.30/year |
| **Priority** | P1 (foundation tool, high usage) |
| **Performance** | N+1 optimized (150ms avg) |
| **Access Control** | Automatic (owner + team members only) |

---

### **Discovery Process Notes**

**What Worked Well:**
1. Reading schema first revealed critical indexes
2. Handler showed actual parameter usage patterns
3. Service revealed performance optimizations already in place

**What We'd Skip Next Time:**
1. UI components (different code path for MCP)
2. Tool-to-tool dependencies (foundation tool has none)

**Time Saved for Next Tool**: 3-4 minutes

---

### **Status**

- [x] Discovery complete
- [x] First run draft created
- [x] User feedback received
- [ ] Second run draft (pending - need to strengthen WORKFLOW)
- [ ] Final review
- [ ] Commit to codebase

---

## 🔧 Tool: `project(action: "pov.details")`

### **Before** (Current State)

**Description** (tool-schemas.js:60):
```javascript
"💡 Tip: For better performance, use the 'pov-database' resource with filters for better
performance and real-time data.

Get detailed information about a specific Project (Proof of Value). You can use either the
exact POV ID, or search by title/name. Use pov_name or pov_title for natural language searches
(e.g., pov_name: 'BlackEye' will find 'BalckEye Red Team Project'). Also supports geographic
filtering by country_name, region_name, or theatre_name. This supports partial matching and
is case-insensitive.

📈 Resource alternative: Use `mcp://database/pov-database?povId=<id>` or filter by name with
enhanced execution context and metrics."
```

**Error Guidance** (tool-schemas.js:757 & sdk-native-basic-tools.js:401):
```javascript
// In getToolSpecificGuidance():
'project(action: "pov.details")': '💡 **Tip**: Use povId for exact matches or pov_title/pov_name for searching.
🚀 **Migration**: Consider using resource `mcp://database/pov-database?povId=<id>` for enhanced Project data with execution context.'

// In handler error messages (line 401):
'project(action: "pov.details")': '💡 **Tip**: Ensure the POV ID exists. Try using "project(action: "pov.list")" first to find valid IDs'
```

**🔥 CRITICAL FINDING**: Error guidance mentions project(action: "pov.list") prerequisite, but description doesn't!

**Token Count**: ~180 tokens (description only)
**Security Level**: 🔒 AUTHENTICATED

---

### **Architecture Discovery** (7 minutes)

**Data Flow Traced:**
```
MCP Tool (project(action: "pov.details"))
  ↓
SDK Handler (sdk-native-basic-tools.js:301-447)
  ↓
API Client → GET /api/pov/${povId}
  ↓
PoVService.get() (pov.ts:21-270) [N+1 OPTIMIZED]
  ↓
Prisma Query → POV table + batch lookups (team, phases, tasks, etc.)
```

**Key Files Read:**
- ✅ Schema already known from project(action: "pov.list") (POV model)
- ✅ `/lib/mcp/server/tools/sdk-native-basic-tools.js` (lines 301-447) - Handler with smart fallback
- ✅ `/lib/pov/services/pov.ts` (lines 21-270) - Service with N+1 optimization
- ✅ Error guidance functions (tool-schemas.js:757, sdk-native-basic-tools.js:401)

**Discovery Time**: 7 minutes (optimized)

---

### **Findings Summary:**

**1. Smart Fallback Logic** (Handler lines 318-376):
```javascript
// Three ways to call this tool:
1. povId: "cm3abc..." → Direct lookup (fastest)
2. pov_title or pov_name: "BlackEye" → Search (exact then partial match)
3. Nothing → Intelligent auto-select:
   - 1 POV exists → Uses it automatically
   - Multiple POVs → Helpful error with suggestions
   - No POVs → "Please create a POV first"
```

**🔥 KEY INSIGHT**: Tool is EXTREMELY forgiving - handles ID, name, or even nothing!

**2. What It Returns** (Service lines 238-263):
```javascript
// Returns COMPLETE POV data:
- POV basics (title, description, status, priority, dates, customer)
- Team with members (id, name, email, role) ⭐ KEY: Member IDs for task assignment
- Phases with stages and task counts ⭐ KEY: Phase/Stage IDs for filtering
- Tasks grouped by stage (with assignee info)
- Summary stats (totalPhases, totalTasks, completedTasks, progress %)
- Geographic info (country, region, salesTheatre)
- Activities, documents, blockers, tags
```

**🔥 KEY INSIGHT**: This is the "ID warehouse" - returns ALL IDs needed for downstream tools!

**3. Performance** (Service line 247):
```javascript
// N+1 OPTIMIZED: 1000ms → 200ms (80% reduction)
// Uses batch queries (Promise.all) to avoid N+1 problems
```

**4. Prerequisite Discovery** (Handler line 401, Error guidance):
```javascript
// Error guidance says: "Try using project(action: "pov.list") first to find valid IDs"
// But it's NOT required - can search by name OR auto-select

// Question: Should we promote project(action: "pov.list") from error tip to tool description?
```

**🔥 USER INSIGHT**: "project(action: "pov.list") should be used first to ensure accuracy - filtering by theatre/country/region/status/forecast date helps find the RIGHT POV, not just ANY POV"

---

### **First Run Draft** (Description Only)

```javascript
project(action: "pov.details"): {
  title: "Get POV Details",
  description: `Get comprehensive information about a specific Project (Proof of Value).

[PARAMETERS] Three ways to specify which POV:
• povId - Exact POV ID (format: 'cm3abc...') if you know it
• pov_title or pov_name - Search by Project name (supports partial matching, case-insensitive)
• (No parameters) - If you have only one POV, it will be selected automatically

[RETURNS] This tool returns comprehensive data including:
• Project basics (title, status, priority, dates, customer)
• Team members with IDs (needed for task assignment)
• Phases and stages with IDs (needed for task filtering)
• Task summaries and progress statistics
• Geographic and CRM information

[WORKFLOW] Common usage:
• Use project(action: "pov.details", povId: "...") after project(action: "pov.list") to get full Project context
• Capture team member IDs from output for perform(action: "execute") (task assignment)
• Capture phase/stage IDs for project(action: "task.list") filtering

[TIP] For advanced queries with real-time metrics, see pov-database resource.`,
  inputSchema: z.object({
    // ... existing schema ...
  })
}
```

**Token Count**: ~280 tokens (+100 from current)
**Focus**: Parameters, what it returns, workflow usage

---

### **User Notes** (Feedback)

**Decision 1: Parameter Guidance**
- ✅ Keep it simple - mention three ways but don't over-explain
- **Rationale**: Smart fallback handles edge cases automatically

**Decision 2: What to Capture**
- ✅ Trust users to figure it out (don't be too prescriptive)
- **Added**: Brief mention of team IDs and phase/stage IDs in [RETURNS]

**Decision 3: Prerequisite**
- ⏭️ DEFER to Action Items - need to think about TIP vs PREREQUISITE
- **User insight**: project(action: "pov.list") helps find RIGHT POV (not just any POV)

**Decision 4: Smart Fallback**
- ✅ Hidden (keep as nice surprise)
- **Rationale**: Mentioned briefly in parameters, but not emphasized

---

### **Action Items for Second Run**

**Description Improvements:**
- [ ] Review [WORKFLOW] after seeing project(action: "task.list") - ensure consistency in explaining relationships
- [ ] Consider: Mention forecast date as key business field?
- [ ] Review [RETURNS] section - is it too detailed or just right?

**Error Guidance for Second Run:**
- [ ] Improve "POV not found" errors - currently shows available POVs (good!)
- [ ] Consider: Add guidance for when to use ID vs name vs auto-select
- [ ] Review: Should smart error recovery suggest calling project(action: "pov.list")?

---

### **Error Guidance Review**

**Current Error Guidance** (Two locations):

**Location 1**: `tool-schemas.js:757` (getToolSpecificGuidance)
```javascript
'project(action: "pov.details")': '💡 **Tip**: Use povId for exact matches or pov_title/pov_name for searching.
🚀 **Migration**: Consider using resource `mcp://database/pov-database?povId=<id>` for enhanced Project data with execution context.'
```

**Location 2**: `sdk-native-basic-tools.js:401` (handler-specific)
```javascript
'project(action: "pov.details")': '💡 **Tip**: Ensure the POV ID exists. Try using "project(action: "pov.list")" first to find valid IDs'
```

**🔥 CRITICAL INSIGHT**: Handler says "try project(action: "pov.list") first" but tool description doesn't mention this!

**Error Guidance Issues:**
1. ❌ Duplicated across two files (tool-schemas.js and handler)
2. ❌ Important prerequisite tip only shows on error (reactive, not proactive)
3. ⚠️ Resource migration mentioned in both description AND error (redundant)

**Action Items for Error Guidance Second Run:**
- [ ] Add [TIP] to description: "Use project(action: "pov.list") first for accurate discovery with filtering"
- [ ] Explain why: "Filtering by theatre/country/region/status helps find RIGHT POV"
- [ ] Consider: Should forecast date be mentioned as key filter?
- [ ] Consolidate: Remove redundant resource mentions from error guidance
- [ ] Enhance: When POV not found, error already lists alternatives (keep this - it's good!)

---

### **Related Tools**

**Upstream Dependencies** (called before this):
- `project(action: "pov.list")` - Provides POV IDs (RECOMMENDED but not required)

**Downstream Dependencies** (use data from this tool):
- `project(action: "task.list")` - Uses povId, phaseId, stageId from this output
- `perform(action: "execute")` - Uses team member IDs for task assignment
- `project(action: "task.context")` - Uses taskId from tasks in this output

**Workflow Position**: DETAIL (second in typical workflow)

**Workflow Chain**:
```
project(action: "pov.list") (discover) → project(action: "pov.details") (detail) → project(action: "task.list") (query) → perform(action: "execute") (action)
```

---

### **Metadata**

| Property | Value |
|----------|-------|
| **Security Level** | 🔒 AUTHENTICATED |
| **Tool Type** | Detail / Lookup |
| **Prerequisites** | project(action: "pov.list") (RECOMMENDED, not required) |
| **Returns** | Complete POV data + ALL downstream IDs |
| **Used By** | project(action: "task.list"), perform(action: "execute"), project(action: "task.context") |
| **Current Token Count** | ~180 tokens |
| **Draft Token Count** | ~280 tokens (+100) |
| **Token Cost Impact** | ~$0.30/year |
| **Priority** | P0 (critical - "ID warehouse" for workflows) |
| **Performance** | N+1 optimized (200ms avg, 80% improvement) |
| **Smart Features** | Auto-select (1 POV), fuzzy search, helpful errors |

---

### **Discovery Process Notes**

**What Worked:**
- ⭐⭐⭐⭐⭐ Reading handler (2 min) - Revealed smart fallback logic
- ⭐⭐⭐⭐⭐ Reading error guidance (2 min) - Found hidden prerequisite tip!
- ⭐⭐⭐⭐ Reading service (3 min) - Showed what data is returned

**New Discovery**:
- ⭐⭐⭐⭐⭐ **Reading error guidance functions** (2 min) - HIGH VALUE!
  - Found prerequisite tip that should be in description
  - Revealed inconsistency between description and error messages
  - This should be standard for ALL tools going forward

**Time**: 7 minutes total

---

---

### **First Run Draft** (Description Only - Error guidance deferred)

```javascript
project(action: "pov.details"): {
  title: "Get POV Details",
  description: `Get comprehensive information about a specific Project (Proof of Value).

[PARAMETERS] Three ways to specify which POV:
• povId - Exact POV ID (format: 'cm3abc...') if you know it
• pov_title or pov_name - Search by Project name (partial matching, case-insensitive)
• (No parameters) - If you have only one POV, it will be selected automatically

[RETURNS] Comprehensive Project data including:
• Project basics (title, status, priority, dates, customer)
• Team members with IDs (needed for task assignment)
• Phases and stages with IDs (needed for task filtering)
• Task summaries and progress statistics

[WORKFLOW] Common usage:
1. Call project(action: "pov.list") to discover Projects (optional but recommended for filtering)
2. Use povId from project(action: "pov.list") or search by pov_title directly
3. Capture team member IDs for perform(action: "execute") (task assignment)
4. Capture phase/stage IDs for project(action: "task.list") filtering

[TIP] For advanced queries with real-time metrics, see pov-database resource.`,
  inputSchema: z.object({
    // ... existing schema ...
  })
}
```

**Token Count**: ~270 tokens (+90 from current)

---

### **User Notes**

**Decisions:**
- ✅ Keep it simple - three ways mentioned briefly
- ✅ Trust users - brief mention of team/phase IDs in [RETURNS]
- ⏭️ project(action: "pov.list") prerequisite - DEFER to Action Items (need to refine)
- ✅ Smart fallback - hidden (brief mention in parameters only)

---

### **Action Items for Second Run**

**Description Improvements:**
- [ ] Add [TIP] about using project(action: "pov.list") first for accurate discovery
- [ ] Explain: "Filtering by theatre/country/region/status helps find RIGHT POV"
- [ ] Consider: Mention forecast date as key business filter?
- [ ] Review [WORKFLOW] after seeing project(action: "task.list") - ensure consistency
- [ ] Consider: Should this be [PREREQUISITE] or [TIP] for project(action: "pov.list")?

**Error Guidance for Second Run:**
- [ ] Review "POV not found" errors - currently shows alternatives (keep!)
- [ ] Consider: Move "try project(action: "pov.list") first" from errors to description
- [ ] Consolidate redundant resource mentions

---

### **Status**

- [x] Discovery complete
- [x] Error guidance analyzed ⭐ NEW
- [x] First run draft created
- [x] User decisions documented
- [x] Action items for second run noted
- [ ] Final review (second run)
- [ ] Commit to codebase

---

---

## 🔧 Tool: `project(action: "task.list")`

### **Before** (Current State)

**Description** (tool-schemas.js:85):
```javascript
"💡 Tip: For superior filtering, use the 'task-database' resource for real-time status and
progress tracking.

List tasks with comprehensive filtering options. Supports both povId and pov_id parameters
for Claude Desktop compatibility.

📈 Resource alternative: Use `mcp://database/task-database?status=IN_PROGRESS&priority=HIGH`
for enhanced task data with execution context, progress monitoring, and quick actions."
```

**Error Guidance** (THREE locations):
```javascript
// Location 1: tool-schemas.js:813
'project(action: "task.list")': '💡 **Tip**: Use priority values like "HIGH", "MEDIUM", "LOW" and status like
"OPEN", "IN_PROGRESS", "COMPLETED"'

// Location 2: smart-error-recovery.js:548 (suggests project(action: "task.list") for OTHER tools)
'Try using "project(action: "task.list")" first to see available tasks'

// Location 3: formatters.js:78-81 (suggests NEXT tool)
if (data.length > 0) {
  suggestions.push('Use project(action: "task.context") for detailed task analysis');
}
```

**🔥 CRITICAL**: Error formatter suggests `project(action: "task.context")` as next step - workflow guidance!

**Token Count**: ~140 tokens (description only)
**Security Level**: 🔒 AUTHENTICATED

---

### **Architecture Discovery** (8 minutes)

**Data Flow Traced:**
```
MCP Tool (project(action: "task.list"))
  ↓
SDK Handler (sdk-native-basic-tools.js:175-296)
  ↓
API Client → GET /api/tasks
  ↓
Task queries (likely in task service - not found in grep)
  ↓
Prisma Query → Task table
```

**Key Files Read:**
- ✅ `/prisma/schema.prisma` (lines 225-289) - Task model
- ✅ `/lib/mcp/server/tools/sdk-native-basic-tools.js` (lines 175-296) - Handler
- ✅ Error guidance (3 locations found)
- ⏭️ Task service not found (API endpoint likely handles directly)

**Discovery Time**: 8 minutes

---

### **Findings Summary:**

**1. Database Structure** (Schema lines 225-289):
```javascript
model Task {
  // ID references (all optional, all UUIDs)
  assigneeId String?  // → User.id
  teamId String?      // → Team.id
  povId String?       // → POV.id
  phaseId String?     // → Phase.id
  stageId String?     // → Stage.id

  // Enums
  status TaskStatus    // OPEN, IN_PROGRESS, COMPLETED, BLOCKED
  priority TaskPriority // HIGH, MEDIUM, LOW

  // Only ONE index:
  @@index([stageId])   // ⚠️ No composite indexes!
}
```

**🔥 KEY INSIGHT**: Only stageId is indexed. Filtering by povId/phaseId might be slow on large datasets.

**2. Parameter Confusion** (Handler lines 185-220):
```javascript
// Handler accepts BOTH:
- assigneeId (UUID, exact match)
- assignee_name (string, fuzzy search)

// Also:
- povId vs pov_id (aliases)
- phaseId vs phase_name (ID vs name lookup)
- stageId vs stage_name (ID vs name lookup)
- teamId vs team_name (ID vs name lookup)
```

**🔥 KEY INSIGHT**: Massive parameter flexibility creates confusion. Users don't know which to use!

**3. Smart Behavior** (Handler lines 222-225):
```javascript
// When povId provided, automatically includes hierarchical data:
if (finalPovId) {
  queryParams.include = 'phase,stage';  // Returns task WITH phase & stage info
}
```

**🔥 KEY INSIGHT**: povId is special - gives you hierarchical context automatically!

**4. Error Guidance Discoveries**:
```javascript
// THREE places mention project(action: "task.list"):
1. Enum value guidance (status, priority values)
2. Suggested as prerequisite for OTHER tools
3. Suggests project(action: "task.context") as NEXT step

// ⚠️ None of this is in the description!
```

**5. What It Returns** (From handler line 248):
```javascript
// Returns: Task list with:
- Task IDs (needed for perform(action: "execute"), project(action: "task.context"))
- Assignee info
- Phase/Stage context (if povId provided)
- Status, priority, due dates
```

---

### **First Run Draft** (Description Only - Error guidance deferred)

```javascript
project(action: "task.list"): {
  title: "List Tasks",
  description: `List tasks with comprehensive filtering options.

[PARAMETERS] Filter options (all optional):
• povId - Project ID (also includes phase/stage context automatically)
• phaseId or phase_name - Phase ID or name
• stageId or stage_name - Stage ID or name
• assigneeId - User ID for exact match
• assignee_name - User name for fuzzy search
• status - Task status (OPEN, IN_PROGRESS, COMPLETED, BLOCKED)
• priority - Task priority (HIGH, MEDIUM, LOW)
• limit - Max results (default: 100, max: 200)

[WORKFLOW] Common usage:
1. Call project(action: "pov.details") to get Project context
2. Use povId from that result in project(action: "task.list", povId: "...")
3. Filter further by status, priority, or assignee as needed
4. Note task IDs from results for perform(action: "execute") or project(action: "task.context")

[TIP] Using povId filter automatically includes phase and stage information in results. For advanced filtering, see task-database resource.`,
  inputSchema: z.object({
    // ... existing schema ...
  })
}
```

**Token Count**: ~270 tokens (+130 from current)

---

### **User Notes**

**Decisions:**
1. **assigneeId vs assignee_name** - ✅ Trust users (already listed in params, no extra explanation)
2. **stageId index** - ❌ Skip performance details (too technical for users)
3. **povId hierarchical context** - ✅ YES emphasize (special behavior worth highlighting)
4. **Parameter detail level** - ✅ Keep it simple (current draft is good)

**Applied to draft:**
- ✅ Parameters listed clearly without over-explaining
- ✅ povId special behavior mentioned ([TIP] section)
- ❌ No index/performance mentions
- ✅ WORKFLOW emphasized (following pattern from project(action: "pov.list"))

---

### **Action Items for Second Run**

**Description Improvements:**
- [ ] Review parameter confusion (too many options) - simplify guidance?
- [ ] Emphasize povId special behavior (includes phase/stage context)
- [ ] Coordinate with project(action: "pov.details") workflow (consistency)
- [ ] Consider: Mention that stageId is most efficient filter?

**Error Guidance for Second Run:**
- [ ] Improve enum value errors (currently just lists valid values)
- [ ] Add suggestion to call project(action: "pov.details") first for IDs
- [ ] Keep "use project(action: "task.context") next" suggestion (good workflow guidance)
- [ ] Consider: Add example of common filter combinations?

---

### **Error Guidance Review**

**Current Error Guidance** (THREE locations):

**Location 1**: `tool-schemas.js:813`
```javascript
'project(action: "task.list")': '💡 **Tip**: Use priority values like "HIGH", "MEDIUM", "LOW" and status like
"OPEN", "IN_PROGRESS", "COMPLETED"'
```

**Location 2**: `smart-error-recovery.js:548` (for OTHER tools!)
```javascript
'Try using "project(action: "task.list")" first to see available tasks'
```

**Location 3**: `formatters.js:78-81` (workflow suggestion!)
```javascript
if (data.length > 0) {
  suggestions.push('Use project(action: "task.context") for detailed task analysis');
}
```

**Error Guidance Issues:**
1. ❌ Enum values only shown on error (should be in description examples)
2. ✅ Workflow suggestion to project(action: "task.context") is GREAT (keep this!)
3. ⚠️ No guidance on assigneeId vs assignee_name confusion

**Action Items for Error Guidance:**
- [ ] Keep enum value guidance in errors (reactive is OK for this)
- [ ] Keep project(action: "task.context") workflow suggestion (excellent next-step guidance)
- [ ] Add to errors: Suggest using project(action: "pov.details") first if no IDs known
- [ ] Consider: Add examples of common filter mistakes?

---

### **Related Tools**

**Upstream Dependencies**:
- `project(action: "pov.details")` - Provides povId, phaseId, stageId, team member info

**Downstream Dependencies**:
- `project(action: "task.context")` - Uses taskId from this output
- `perform(action: "execute")` - Uses taskId from this output

**Workflow Position**: QUERY (third in typical workflow)

**Workflow Chain**:
```
project(action: "pov.list") → project(action: "pov.details") → project(action: "task.list") → project(action: "task.context") / perform(action: "execute")
```

---

### **Metadata**

| Property | Value |
|----------|-------|
| **Security Level** | 🔒 AUTHENTICATED |
| **Tool Type** | Query / Filter |
| **Prerequisites** | project(action: "pov.details") (RECOMMENDED for IDs) |
| **Returns** | Task list with IDs for downstream tools |
| **Used By** | project(action: "task.context"), perform(action: "execute") |
| **Current Token Count** | ~140 tokens |
| **Draft Token Count** | ~270 tokens (+130) |
| **Token Cost Impact** | ~$0.40/year |
| **Priority** | P0 (core workflow tool) |
| **Performance** | Index on stageId only |
| **Smart Features** | Auto-includes phase/stage when povId provided |

---

### **Discovery Process Notes**

**What Worked:**
- ⭐⭐⭐⭐⭐ Reading error guidance (2 min) - Found 3 locations with workflow tips!
- ⭐⭐⭐⭐ Reading schema (2 min) - Revealed parameter confusion (ID vs name)
- ⭐⭐⭐⭐ Reading handler (3 min) - Found smart povId behavior
- ⭐⭐⭐ grep for error guidance (1 min) - Found formatter suggestion

**New Learning:**
- Formatters can suggest NEXT tool in workflow (formatters.js:78-81)
- This is workflow elicitation in the response formatter!
- Should we standardize this pattern?

**Time**: 8 minutes total

---

### **Status**

- [x] Discovery complete
- [x] Error guidance analyzed (3 locations!)
- [ ] First run draft pending user feedback
- [ ] Action items documented
- [ ] Error guidance improvements planned

---

---

## 🔧 Tool: `project(action: "task.context")`

### **Before** (Current State)

**Description** (tool-schemas.js:120):
```javascript
"Get comprehensive task context with analytics and recommendations. You can search by taskId,
task name/title, or get context for entire POV/phase."
```

**Error Guidance** (tool-schemas.js:815 & sdk-native-advanced-tools.js:985):
```javascript
// In getToolSpecificGuidance():
'project(action: "task.context")': '💡 **Tip**: Use boolean values (true/false) for include options and
contextDepth like "minimal", "standard", "detailed"'

// In handler (no additional error guidance found)
```

**Token Count**: ~90 tokens (very short!)
**Security Level**: 🔒 AUTHENTICATED

---

### **Architecture Discovery** (6 minutes - fastest yet!)

**Data Flow:**
```
MCP Tool (project(action: "task.context"))
  ↓
SDK Handler (sdk-native-advanced-tools.js:81-258)
  ↓
API → /api/mcp/tasks/context
  ↓
Enhanced with execution history, analytics, recommendations
```

**Key Findings** (from handler lines 81-258):

**1. Flexible Lookup** (lines 95-149):
- taskId OR task_name (fuzzy search like project(action: "pov.details"))
- OR povId (get context for entire Project)
- OR phaseId (get context for entire Phase)

**2. Optional Enrichment Flags** (lines 100-103):
- includeHistory (execution history)
- includeAnalytics (performance analytics)
- includeRecommendations (AI recommendations)
- contextDepth (minimal/standard/full)

**3. Auto-Enhancement** (lines 168-171):
```javascript
// Handler ALWAYS adds these (even if not requested):
params.includeExecutionHistory = 'true';
params.includeResourceContext = 'true';
params.includePerformanceMetrics = 'true';
params.includeRelatedResources = 'true';
```

**🔥 KEY INSIGHT**: Tool auto-enriches with execution data - user gets more than they ask for!

**4. What It Returns** (inferred from formatter):
- Task details with full context
- Execution history (agent runs, artifacts)
- Performance metrics (success rate, timing)
- AI recommendations (next actions)
- Related resources and tasks

---

### **First Run Draft**

```javascript
project(action: "task.context"): {
  title: "Get Task Context",
  description: `Get comprehensive task context with analytics and recommendations.

[PARAMETERS] Flexible lookup options (provide at least one):
• taskId or task_name - Specific task (ID or fuzzy name search)
• povId - All tasks in Project (context for entire POV)
• phaseId - All tasks in Phase

[OPTIONS] Optional enrichment (all default to false):
• includeHistory - Execution history and agent runs
• includeAnalytics - Performance metrics and statistics
• includeRecommendations - AI-generated next actions
• contextDepth - minimal | standard | full (default: standard)

[WORKFLOW] Common usage:
1. Call project(action: "task.list") to find tasks
2. Use taskId from results in project(action: "task.context", taskId: "...")
3. Review execution history, artifacts, and recommendations
4. Use insights for perform(action: "execute") or next steps

[TIP] This tool is often called AFTER project(action: "task.list") to deep-dive into specific tasks. For real-time task data, see task-database resource.`,
  inputSchema: z.object({
    // ... existing schema ...
  })
}
```

**Token Count**: ~260 tokens (+170 from current!)

---

### **User Notes**

**Decisions** (applying pattern from previous tools):
- ✅ Keep it simple - list the flexible lookup options
- ✅ Explain enrichment flags briefly (users will explore)
- ✅ WORKFLOW shows it comes after project(action: "task.list")
- ❌ Don't mention auto-enhancement (implementation detail)

---

### **Action Items for Second Run**

- [ ] Review WORKFLOW coordination with project(action: "task.list") (ensure consistency)
- [ ] Consider: Explain when to use taskId vs povId vs phaseId?
- [ ] Consider: Show example of what "comprehensive context" includes?

**Error Guidance:**
- [ ] Keep boolean value tip in errors (helpful for parameter mistakes)
- [ ] Consider: Add suggestion to call project(action: "task.list") first if no taskId known

---

### **Related Tools**

**Upstream**: project(action: "task.list") (provides taskId)
**Downstream**: perform(action: "execute") (uses insights from context)
**Workflow Position**: ANALYSIS (fourth in typical workflow)

**Chain**:
```
project(action: "pov.list") → project(action: "pov.details") → project(action: "task.list") → project(action: "task.context") → perform(action: "execute")
```

---

### **Metadata**

| Property | Value |
|----------|-------|
| **Security Level** | 🔒 AUTHENTICATED |
| **Tool Type** | Analysis / Context |
| **Prerequisites** | project(action: "task.list") (RECOMMENDED for taskId) |
| **Returns** | Comprehensive context + analytics + recommendations |
| **Used By** | perform(action: "execute") (informed decisions) |
| **Current Token Count** | ~90 tokens |
| **Draft Token Count** | ~260 tokens (+170!) |
| **Priority** | P0 (deep analysis tool) |
| **Smart Features** | Auto-enrichment, flexible lookup, fuzzy search |

---

### **Status**

- [x] Discovery complete (6 min - fastest!)
- [x] First run draft created
- [ ] User feedback
- [ ] Second run refinement

---

---

## 🔧 Tool: `perform(action: "execute")` ⭐ COMPLEX

**Note**: Due to complexity (13 actions), full discovery documented in separate file:
**See**: `/cline_docs/execute-task-action-discovery.md`

### **Summary**

**Complexity**: 🔥🔥🔥🔥🔥 EXTREME (13 actions in one tool)
**Discovery Time**: 18 minutes (deepest dive yet)
**Token Count**: Current ~160 → Draft ~650 (+490 tokens)

**13 Actions in 5 Groups**:
1. **TASK** (5): create, update, assign, complete, comment
2. **STAGE** (1): create
3. **AGENT** (5): configure, assign, execute, status, results
4. **WORKFLOW** (1): trigger
5. **ANALYTICS** (1): generate

**Key Confusion Points Addressed**:
- ✅ task.update vs task.assign (your concern) - Clarified when to use each
- ✅ agent.configure vs agent.assign (your concern) - Workflow explained

**Bugs Found**:
- 🐛 task.block in error message but not in schema
- 🐛 Error guidance only lists 4 of 13 actions
- 🐛 agent.status/agent.results have no required params

**First Run Draft**: See execute-task-action-discovery.md

---

**Last Updated**: 2025-10-14
**Tools Completed - First Run**: 5 (project(action: "pov.list"), project(action: "pov.details"), project(action: "task.list"), project(action: "task.context"), perform(action: "execute"))
**Tools Remaining**: 40+
**Discovery Process**: v1.2
**Average Discovery Time**: 9 min/tool (perform(action: "execute") brought average up due to complexity)
