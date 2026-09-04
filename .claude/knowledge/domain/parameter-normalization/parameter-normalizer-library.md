# parameter-normalizer-specialist — Domain Library

> **Created 2026-06-11** (Protocol 12 soft-band trim). Depth evicted from the agent file; verbatim;
> the paired discovery's proven greps outrank this file.

## [evicted] Architecture Note (December 2025 Facade Extractions)

**File Structure Update**: MCP tool handlers were extracted to focused modules:
- `/lib/mcp/server/tools/advanced-tools/` - 8 handler modules (Dec 15, 2025)
- `/lib/mcp/server/tools/hub/` - 11 handler modules (Dec 15, 2025)
- `/lib/mcp/tasks/action/handlers/` - 15 handler modules (Dec 17-18, 2025)

**Facade files remain** (thin delegation layers):
- `sdk-native-advanced-tools.js` - 2,415 → 452 lines (81% reduction)
- `hub-tools-handler.js` - 2,306 → 611 lines (73% reduction)
- `app/api/mcp/tasks/action/route.ts` - 4,441 → 449 lines (90% reduction)

**Schema definitions unchanged**:
- `/lib/mcp/server/config/tool-schemas.js` - Still single file (904 lines)
- Line numbers in this document refer to tool-schemas.js (schema layer)
- Handler implementations are in extracted modules (implementation layer)


## [evicted] Core Responsibilities

### Parameter Transformation
- Snake_case to camelCase conversion (pov_id → povId)
- Value normalization (urgent → HIGH, active → IN_PROGRESS)
- Type coercion (string → number/boolean)
- Enum mapping for status and priority values
- **Magic parameter support** (ID/name flexible lookup)

### Magic Parameter System
- **ID/Name flexibility**: Accept povId OR pov_name, taskId OR task_name, etc.
- **Fuzzy search coordination**: Centralized 4-tier scoring system (Oct 29, 2025)
- **Handler integration**: Name lookup logic in tool handlers
- **11 tools implemented**: Core workflow, Hub services, Agent templates

#### Fuzzy Search Improvements (Oct 29, 2025)

**Enhancement**: Replaced first-match with best-match scoring system
- **Before**: Returned first partial match in database order (wrong results)
- **After**: 4-tier scoring (exact=1000, starts=500, contains=100+, words=10×)
- **Helper**: `/lib/mcp/server/utils/fuzzy-search-helper.js`
- **Tools Updated**: 6 (project.pov_details, project.task_context, perform.agent_results, template.details, services.health, registry.update)
- **Review**: 95.3% confidence (3 specialists)

#### Context Injection Fix (Oct 29, 2025) 🔴 CRITICAL

**Bug Discovered**: Parameter normalizer auto-injected context IDs even when explicit search terms provided, bypassing fuzzy search.

**Example**:
```javascript
// User calls project({ action: "pov.list" }) → Sets recentPOV to "POV A"
// User calls project({ action: "pov.details", pov_name: "POV B" })
// BUG: Auto-injected povId for "POV A", bypassed fuzzy search, returned wrong POV
```

**Fix Applied** (~lines 984-1005 as of 2026-06-11 — drifts with edits; locate via grep -n "hasExplicitPOVSearch" parameter-normalizer.js):
```javascript
// Check for explicit search params BEFORE auto-injecting context
const hasExplicitPOVSearch =
  parameters.pov_name?.trim() ||      // snake_case (ChatGPT)
  parameters.pov_title?.trim() ||
  parameters.povName?.trim() ||       // camelCase (Claude Desktop)
  parameters.povTitle?.trim();

// Only inject context if NO explicit search provided
if (!parameters.povId && !hasExplicitPOVSearch && recentPOV) {
  parameters.povId = recentPOV.id;
}
```

**Principle**: **Explicit Parameters ALWAYS Override Session Context**

**Impact**: Fixed POV context (4 tools) + Task context (3 tools) = 6 tools corrected

### Session Context Management
- Tracking recent POV, tasks, and phases across tool calls
- Auto-filling missing parameters from context
- Maintaining state in stateless MCP protocol
- Shared instance architecture for consistency

### Tool Integration
- Integration with 28 MCP tools
- Coordination with Parameter Intelligence for suggestions
- Error prevention through automatic normalization
- Claude Desktop compatibility layer
- Magic parameter elicitation support


## [evicted] Domain Expertise

### Two-Layer Architecture
```
Layer 1: Parameter Normalizer (Automatic)
├── Parameter name mapping
├── Value normalization  
├── Type coercion
└── Session context

Layer 2: Parameter Intelligence (Suggestions)
├── Missing parameter detection
├── Smart defaults
├── Historical patterns
└── Validation hints
```

### Critical Files
- `/lib/mcp/server/utils/parameter-normalizer.js` - Core normalizer (881 lines)
- `/lib/mcp/server/utils/enterprise-parameter-intelligence.js` - Intelligence layer
- `/mcp-server-v5.js` - Shared instance creation
- Tool integrations in `/lib/mcp/server/tools/`

### Production Environment
- **Production Droplet**: Digital Ocean server at <PROD_HOST> (paichart.app) - THE production environment
- **Live Deployment**: Parameter normalization active at paichart.app MCP Hub
- **Server Access**: SSH key-based authentication (ed25519) to <PROD_HOST>
- **Context Management**: Session context working across production MCP connections

### Session Context Flow
```javascript
// Automatic context application
project({ action: "pov.list" }) → tracks POV in context
project({ action: "task.list" }) → uses tracked POV automatically
project({ action: "task.context" }) → uses both POV and task context

// Shared instance ensures consistency
Tool A sets context → Tool B uses same context
```


## [evicted] Magic Parameter Implementation Guide

### What Are Magic Parameters?

**Magic parameters** accept BOTH exact IDs (UUIDs) AND names (fuzzy search), automatically performing lookup when names provided.

**Example**:
```javascript
// Both work:
project({ action: "pov.details", povId: "cm3abc123..." })        // ID
project({ action: "pov.details", pov_name: "BlackEye" })         // Name - MAGIC!
```

### Supported Magic Parameter Types (11 tools use this)

| Base Field | ID Parameter | Name Parameter(s) | Tools |
|------------|--------------|-------------------|-------|
| **POV** | povId, pov_id | pov_name, pov_title | project(pov.details), project(task.list), project(task.context) |
| **Task** | taskId, task_id | task_name, task_title | project(task.context), perform(agent.results) |
| **User/Assignee** | assigneeId | assignee, assignee_name | perform(task.update), project(task.list) |
| **Team** | teamId | team_name | project(task.list), perform(task.update) |
| **Phase** | phaseId | phase_name, phaseName | project(task.list), perform(task.update) |
| **Stage** | stageId | stage_name, stageName | project(task.list), perform(task.update) |
| **Agent Template** | templateId, template_id, agentTemplateId | agent_template_name | template(details), perform(agent.configure) |
| **Service** | serviceId | service_name | services.health, registry.update, services.call |

### Implementation Requirements Checklist

**For each magic parameter type, you need**:

#### **1. Database Schema** (schema.prisma)
```prisma
model ModelName {
  id    String @id @default(cuid())
  name  String  // ✅ REQUIRED: name field for lookup
  // Optional but recommended:
  @@index([name])  // Performance optimization
  @@unique([name]) // Prevent duplicates (if appropriate)
}
```

**Examples**:
- POV model (line 40): ✅ Has `title` field (used as name)
- Task model (line 226): ✅ Has `title` field
- AgentTemplate model (line 352): ✅ Has `name` field
- MCPTool model (line 890): ✅ Has `name` field

#### **2. Handler Implementation** (tool handler)

**Pattern A: Handler performs lookup** (project pov.details, project task.context)
```javascript
// Extract parameters
const { povId, pov_name } = args;
let finalPovId = povId;

// If name provided, look up ID
if (!finalPovId && pov_name) {
  // Get all POVs
  const povs = await apiClient.get('/api/pov', {});

  // Try exact match first
  let found = povs.find(p =>
    p.title.toLowerCase() === pov_name.toLowerCase()
  );

  // Try partial match
  if (!found) {
    found = povs.find(p =>
      p.title.toLowerCase().includes(pov_name.toLowerCase())
    );
  }

  // Optional: Word-based search (project task.context has this)
  if (!found) {
    const words = pov_name.split(' ').filter(w => w.length > 2);
    found = povs.find(p =>
      words.some(word => p.title.toLowerCase().includes(word))
    );
  }

  if (found) {
    finalPovId = found.id;
  } else {
    // Helpful error with available names
    const available = povs.map(p => p.title);
    throw new Error(`POV not found: "${pov_name}". Available: ${available.slice(0, 5).join(', ')}`);
  }
}

// Continue with finalPovId...
```

**Files** (Post-extraction - Dec 15, 2025):
- `/lib/mcp/server/tools/sdk-native-basic-tools.js` (project pov.details method)
- `/lib/mcp/server/tools/advanced/task-context-handler.js` (project task.context handler)
- `/lib/mcp/server/tools/advanced/agent-results-handler.js` (perform agent.results handler)

**Pattern B: API performs lookup** (project task.list, perform task.update)
```javascript
// Extract parameters
const { assignee_name, phase_name, stage_name } = args;

// Pass name parameters to API
const queryParams = {};
if (assignee_name) queryParams.assignee_name = assignee_name;
if (phase_name) queryParams.phase_name = phase_name;
if (stage_name) queryParams.stage_name = stage_name;

// API handles the lookup server-side
const result = await apiClient.get('/api/tasks', queryParams);
```

**Files** (Post-extraction - Dec 15 & 17-18, 2025):
- `/lib/mcp/server/tools/sdk-native-basic-tools.js` (project task.list method)
- `/lib/mcp/server/tools/advanced/task-action-handler.js` (perform task action handler)
- `/lib/mcp/tasks/action/handlers/**/*.ts` (13 extracted task action handlers - Dec 17-18)

**Pattern C: Database OR query** (services call, Hub tools)
```javascript
const service = await this.prisma.mCPTool.findFirst({
  where: {
    OR: [
      { id: serviceId },      // Match by ID
      { name: serviceId }     // OR match by name
    ]
  }
});
```

**Files** (Post-extraction - Dec 15, 2025):
- `/lib/mcp/server/tools/hub/service-call-handler.js` (services.call handler)
- `/lib/mcp/server/tools/hub/service-health-handler.js` (services.health handler)
- `/lib/mcp/server/tools/hub/service-update-handler.js` (registry.update handler)

#### **3. Schema Definition** (tool-schemas.js)

```javascript
toolName: {
  description: `[PARAMETERS] Flexible lookup:
• field - ID or name (accepts: fieldId, field_name)
  Example: field_name: 'Search Term'
  Search: exact → partial, case-insensitive`,

  inputSchema: z.object({
    fieldId: z.string().optional(),
    field_name: z.string().optional(),
    // ... other params
  }).refine(data => data.fieldId || data.field_name, {
    message: "Either fieldId or field_name is required"
  })
}
```

**Examples** (tool-schemas.js - schema definitions):
- project pov.details (lines 58-81): povId, pov_id, pov_title, pov_name
- project task.context (lines 118-157): taskId, task_id, task_name, task_title
- services health (lines 543-553): serviceId, service_name

**Note**: Handler implementations were extracted Dec 15 & 17-18, 2025. See extracted modules:
- Advanced tools: `/lib/mcp/server/tools/advanced/*-handler.js` (8 modules)
- Hub tools: `/lib/mcp/server/tools/hub/*-handler.js` (11 modules)
- Task actions: `/lib/mcp/tasks/action/handlers/**/*.ts` (15 modules)

#### **4. API Support** (if Pattern B)

**API must handle name parameters** (fuzzy search):
```javascript
// In API endpoint
const where = {};
if (params.assignee_name) {
  // Fuzzy search on User.name
  where.assignee = {
    name: { contains: params.assignee_name, mode: 'insensitive' }
  };
}
```

**Files**: API handlers in `/lib/api/` or `/lib/tasks/handlers/`

#### **5. Elicitation** (tool description)

```javascript
description: `Tool purpose.

[PARAMETERS] Flexible lookup:
• field - ID or name (fuzzy matching)
  Example: field_name: 'Search Term'

[TIP] Names work in most cases. Use IDs for precision.`
```

### Complete Implementation Example: assignee Magic

**1. Schema** (Task model has assigneeId → User):
```prisma
model Task {
  assigneeId String?
  assignee   User?   @relation("TaskAssignee", fields: [assigneeId], references: [id])
}

model User {
  id   String
  name String  // ✅ Required for lookup
}
```

**2. Handler** (perform task actions, sdk-native-advanced-tools.js:322-325):
```javascript
if (finalParameters.assignee && !finalParameters.assigneeId) {
  // Keep assignee as is - the API handles name lookup
  this.logger.debug('Using assignee name for lookup');
}
```

**3. Schema** (tool-schemas.js:159-236):
```javascript
perform: {  // consolidated from execute_task_action
  inputSchema: z.object({
    parameters: z.object({
      assigneeId: z.string().optional(),
      assignee: z.string().optional(),
      assignee_name: z.string().optional()
    })
  })
}
```

**4. Elicitation**:
```
• task.update - Modify any fields
  Common: assignee (ID/name), status, priority
  [TIP] assignee parameter accepts user ID or name
```


## [evicted] Implementation Patterns

### Adding New Parameter Mapping
```javascript
// In setupParameterMappings()
this.parameterMappings.set('targetParam', [
  'target_param',
  'targetparam',
  'target-param'
]);
```

### Tool Integration Pattern
```javascript
// In tool handler
const normalizedArgs = this.parameterNormalizer.normalizeForTool('tool_name', args);
// Use normalized parameters
const { povId, taskId } = normalizedArgs;
```

### Context Tracking Pattern
```javascript
// After retrieving data
this.parameterNormalizer.setPOVContext(povData);
this.parameterNormalizer.setTaskListContext(tasks);
```


## [evicted] Performance Characteristics
- Normalization overhead: < 5ms per call
- Context lookup: O(1) hash map access
- Memory usage: ~10KB for context storage
- No database queries required


## [evicted] Integration Points

### With Parameter Intelligence
- Normalizer fixes automatically
- Intelligence suggests when manual input needed
- Both work together for robust handling

### With Feature Flags
- `parameterNormalization` flag controls behavior
- `verboseLogging` shows transformation details

### With Smart Error Recovery
- Provides normalized parameters for retry
- Prevents errors through proactive normalization


## [evicted] Historical Context

The Parameter Normalizer was wrongly deprecated based on Jan Marshal's philosophy that "APIs should handle natural language directly." This proved incorrect for Claude Desktop's stateless MCP protocol, leading to parameter mismatches and lost context.

Restored from commit 083e6db after discovering it was essential for:
- Claude Desktop compatibility
- Session context persistence
- Automatic parameter fixing
- Error prevention


## [evicted] Testing Commands

```bash
# Test parameter normalization
node -e "const { SDKParameterNormalizer } = require('./lib/mcp/server/utils/parameter-normalizer'); 
const n = new SDKParameterNormalizer();
console.log(n.normalizeForTool('project.task_list', { pov_id: 'test123' }))"

# Test session context
node -e "const { SDKParameterNormalizer } = require('./lib/mcp/server/utils/parameter-normalizer');
const n = new SDKParameterNormalizer();
n.setPOVContext({ id: 'pov123', title: 'Test POV' });
console.log(n.normalizeForTool('project.task_list', {}))"
```


## [evicted] Reference: Successfully Implemented Magic Parameters

**Date**: 2025-10-14
**Tools Enhanced**: 11/28 legacy tools at the time (pre-Mar-2026 consolidation; the pattern now lives as id+name alias pairs inside the 6 consolidated schemas)
**Pattern Validated**: 96% confidence (mcp-hub-specialist)

### Implementation Evidence

**Core Workflow Tools** (6 tools):
1. **project(pov.list)** - Name-based filtering (customer_name, owner_name, geographic names)
   - Schema: lines 45-56
   - Handler: Passes to API (sdk-native-basic-tools.js:90-107)

2. **project(pov.details)** - POV lookup by ID/title/name
   - Schema: lines 58-81 (povId, pov_id, pov_title, pov_name)
   - Handler: Lines 318-376 (exact → partial fuzzy search)
   - Pattern: Handler performs lookup

3. **project(task.list)** - 5 magic types (pov, phase, stage, assignee, team)
   - Schema: lines 83-116
   - Handler: Passes to API (lines 212-219)
   - Pattern: API performs lookup

4. **project(task.context)** - Task lookup by ID/name (3-level search)
   - Schema: lines 118-157 (taskId, task_id, task_name, task_title)
   - Handler: Lines 108-149 (exact → partial → word-based)
   - Pattern: Handler performs advanced lookup

5. **perform** - Multiple magic types in actions
   - Schema: lines 159-236 (assignee, phaseName, stageName, etc.)
   - Handler: Lines 322-325 (assignee), 347-385 (parameter hoisting)
   - Pattern: Hybrid (API + handler)
   - **Resolved confusion**: task.update vs task.assign with assignee magic

6. **perform(agent.results)** - Task lookup by ID/name
   - Schema: lines 381-414 (taskId, task_id, task_name, task_title, povId)
   - Handler: Lines 563-609 (exact → partial → word-based)
   - Pattern: Handler performs lookup (newly added)

**Hub Service Tools** (3 tools):
7. **services(call)** - Service lookup by ID/name
   - Schema: lines 552-574 (targetService accepts name or ID)
   - Handler: Lines 505-512 (OR [id, name] query)
   - Pattern: Database OR query (already existed!)

8. **services(health)** - Service lookup by ID/name
   - Schema: lines 543-553 (serviceId, service_name)
   - Handler: Lines 344-372 (OR [id, name] query)
   - Pattern: Database OR query (newly added)

9. **registry.update** - Service lookup by ID/name
   - Schema: lines 598-646 (serviceId, service_name)
   - Handler: Lines 647-681 (OR [id, name] with owner scope)
   - Pattern: Database OR query (newly added)

**Agent Template Tools** (2 tools):
10. **template(list)** - Name-based filtering
    - Schema: lines 350-359 (agent_template_name)
    - Handler: Passes to API (lines 465-471)
    - Pattern: API performs lookup

11. **template(details)** - Template lookup by ID/name
    - Schema: lines 361-379 (templateId, template_id, agent_template_name)
    - Handler: Lines 548-584 (exact → partial search)
    - Pattern: Handler performs lookup (already existed!)

### Related Documentation

**Implementation Plans**:
- `/.claude/knowledge/domain/parameter-normalization/magic-parameter-implementation.md` - Original analysis
- `/.claude/knowledge/domain/parameter-normalization/magic-parameter-implementation-v2.md` - Detailed before/after for 6 core tools
- `/.claude/knowledge/domain/parameter-normalization/hub-tools-schema-magic.md` - Hub tools verification and plan

**Discovery Logs**:
- `/.claude/knowledge/domain/parameter-normalization/tool-schema-discovery.md` - Collaborative discovery methodology
- `/.claude/knowledge/domain/parameter-normalization/execute-task-action-discovery.md` - Complex tool deep-dive

**Git Commits**:
- `b6f7fa2` - Magic parameter elicitation (6 core tools)
- `3549124` - perform(agent.results) task_name lookup
- `933e3e1` - Hub tools magic implementation
- `48f5930` - Agent template tools enhancement

### Error Helper & Tool Schema Patterns (Dec 2025)
**Pattern Reference**: `/.claude/knowledge/patterns/mcp-tool-ux-pattern.md`

- **Error Helpers**: `povNotFoundError()`, `taskNotFoundError()` with fuzzy suggestions
- **Fuzzy Integration**: Works WITH `getScoredSuggestions()` for smart name-based lookups
- **Tool Schemas**: 100% coverage with [PARAMETERS] for magic parameter docs
- **Format**: "• pov - POV ID or name (accepts: povId, pov_name)"


