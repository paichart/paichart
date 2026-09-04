# Parameter Normalizer Discovery Prompt

**Last Updated**: 2026-06-11 (health-run: line-refs re-proven, KB-migration paths, post-consolidation tool framing)
**Last Validated**: 2026-06-19 — normalizer live (1127 lines, normalizeForTool, hasExplicit*Search guards ~:984-1005), fuzzy helper used by 6 caller files (was 4), Sprint-3 alias map live in mcp-action-validation.ts. Added the Pattern-A fetch-to-search truncation TRIPWIRE (§Three Implementation Patterns).

## Purpose
Map the complete Parameter Normalizer system restoration and integration within pAIchart's MCP architecture.

## Discovery Scope

### 1. Historical Context
- Original implementation at commit 083e6db
- Wrongly deprecated based on Jan Marshal's philosophy
- Regression in Claude Desktop functionality
- Restoration from git history (881 lines)

### 2. Core Functionality
```javascript
// Key transformations
pov_id → povId
task_id → taskId  
urgent → HIGH
active → IN_PROGRESS

// Session context
recentPOV: { id, title }
recentTasks: []
currentPhase: null
```

### 3. Architecture Integration
- Shared instance across all tool handlers
- Located at: `/lib/mcp/server/utils/parameter-normalizer.js`
- Class: `SDKParameterNormalizer`
- Method: `normalizeForTool(toolName, parameters)`

### 4. Session Context Features
- **applySessionContext()**: Auto-fills missing parameters from context
- **updateSessionContext()**: Tracks POV/task/phase from tool calls
- **setPOVContext()**: External context setting from project(action: 'pov.list')
- **setTaskListContext()**: Tracks tasks from project(action: 'task.list')

### 5. Tool Integration Points
```javascript
// Basic Tools (consolidated as 'project')
- project(action: 'pov.list') → tracks first POV
- project(action: 'pov.details') → updates POV context
- project(action: 'task.list') → tracks task list

// Advanced Tools (consolidated as 'perform' / 'project')
- project(action: 'task.context') → uses POV and task context
- perform(action: 'execute') → uses task context
- perform(action: 'agent_results') → uses task context

// Hub Tools (consolidated)
- registry(action: 'register') → normalizes parameters
- services(action: 'discover') → normalizes parameters
- services(action: 'health') → serviceId/service_id handling
```

### 6. Two-Layer System
**Layer 1: Parameter Normalizer** (Automatic)
- Parameter name mapping
- Value normalization
- Type coercion
- Session context

**Layer 2: Parameter Intelligence** (Suggestions)
- Missing parameter detection
- Smart defaults
- Historical patterns
- Validation hints

### 7. Key Files
- `/lib/mcp/server/utils/parameter-normalizer.js` - Core implementation
- `/lib/mcp/server/utils/enterprise-parameter-intelligence.js` - Suggestion layer
- `/mcp-server-v5.js` - Shared instance creation
- `/lib/mcp/server/tools/sdk-native-basic-tools.js` - Tool integration
- `/lib/mcp/server/tools/sdk-native-advanced-tools.js` - Tool integration
- `/lib/mcp/server/tools/hub-tools-handler.js` - Hub tool integration

### 8. Recent Fixes

#### Fuzzy Search Enhancement (Oct 29, 2025)
- **What**: Centralized 4-tier scoring system for name-based lookups
- **Where**: `/lib/mcp/server/utils/fuzzy-search-helper.js` (NEW)
- **Why**: First-match bug returned wrong results
- **Tools**: 6 (POV, Task, Agent Template, Service searches)
- **Find**: `grep -n "findBestMatch\|getScoredSuggestions" lib/mcp/server/tools/*.js`

#### Context Injection Fix (Oct 29, 2025) 🔴 CRITICAL
- **What**: Explicit search params now override session context auto-injection
- **Where**: `/lib/mcp/server/utils/parameter-normalizer.js` ~lines 984-1005 (re-proven 2026-06-11; drifts with edits — trust the grep below, not the numbers)
- **Why**: Auto-injection bypassed fuzzy search, returned wrong POV/Task
- **Bugs Fixed**: POV context (4 tools) + Task context (3 tools)
- **Find**: `grep -n "hasExplicitPOVSearch\|hasExplicitTaskSearch" lib/mcp/server/utils/parameter-normalizer.js`
- **Principle**: Explicit Parameters ALWAYS Override Session Context

#### Earlier Fixes
- Method name: `normalize()` → `normalizeForTool()`
- Shared instance for session consistency
- Context tracking from tool results
- Task list tracking from project(action: 'task.list')
- Enhanced error messages for perform(action: 'execute')

## Discovery Questions

1. **Session Persistence**: How long should context be maintained?
2. **Multi-User**: How to handle context in multi-user scenarios?
3. **Context Priority**: When to override context vs requiring explicit params?
4. **Performance**: Impact of normalization on response times?
5. **Extensibility**: How to add new normalizers dynamically?

## Testing Scenarios

```javascript
// Test parameter name mapping
{ pov_id: "123" } → { povId: "123" }

// Test value normalization  
{ priority: "urgent" } → { priority: "HIGH" }

// Test session context
project(action: 'pov.list') → tracks POV
project(action: 'task.list', {}) → uses tracked POV
project(action: 'task.context', {}) → uses tracked POV and task

// Test shared instance
Tool A sets POV → Tool B uses same POV
```

## Impact Analysis

### Before Restoration
- Claude Desktop sends varying parameter formats
- Tools fail with parameter mismatches
- No context between tool calls
- Manual parameter fixes needed

### After Restoration
- Automatic parameter transformation
- Session context maintained
- Claude Desktop works smoothly
- Both camelCase and snake_case accepted

## Integration with Other Systems

1. **Parameter Intelligence**: Provides suggestions when normalization insufficient
2. **Feature Flags**: Controls normalization behavior
3. **Performance Monitor**: Tracks normalization timing
4. **Smart Error Recovery**: Uses normalized parameters for recovery

## Magic Parameter System (2025-10-14)

### What Are Magic Parameters?

**Magic parameters** accept BOTH exact IDs (UUIDs) AND names (fuzzy search), with automatic lookup when names are provided.

**Post-consolidation (Mar 2026)**: the pattern lives as id+name alias param pairs INSIDE the 6 consolidated schemas (e.g. `povId`/`pov_name`, `taskId`/`task_title`, `service_name`) — the old '11 of 28 tools' framing predates consolidation.

### Discovery Grep Commands

**Find all tools with magic parameters**:
```bash
# Find tools with ID/name parameter pairs
grep -r "povId\|pov_name\|taskId\|task_name\|assigneeId\|assignee_name\|serviceId\|service_name" \
  /home/steve/copov15/lib/mcp/server/config/tool-schemas.js

# Find handler implementations with name lookup
grep -rn "pov_name\|task_name\|agent_template_name\|service_name" \
  /home/steve/copov15/lib/mcp/server/tools/

# Find database models with name fields
grep -n "model POV\|model Task\|model AgentTemplate\|model MCPTool" \
  /home/steve/copov15/prisma/schema.prisma

# Find API endpoints that handle name parameters
grep -rn "assignee_name\|phase_name\|stage_name\|team_name" \
  /home/steve/copov15/lib/api/
```

**Verify magic parameter implementation**:
```bash
# Check if handler has fuzzy search logic
grep -A 20 "if (!finalPovId && pov_name)" \
  /home/steve/copov15/lib/mcp/server/tools/sdk-native-basic-tools.js

# Check if handler uses OR query pattern
grep -A 5 "OR: \[" \
  /home/steve/copov15/lib/mcp/server/tools/hub-tools-handler.js

# Check schema validation for name parameters
grep -B 2 -A 2 "refine.*Id.*name" \
  /home/steve/copov15/lib/mcp/server/config/tool-schemas.js
```

**Find tools that need magic added**:
```bash
# Tools with ID parameters but no name parameter
grep -n "Id: z.string" /home/steve/copov15/lib/mcp/server/config/tool-schemas.js | \
  grep -v "optional"

# Check which tools pass name params to API
grep -rn "queryParams\..*_name\|params\..*_name" \
  /home/steve/copov15/lib/mcp/server/tools/
```

### Supported Magic Types (8 types)

| Type | ID Param | Name Param | Tools Using | Implementation |
|------|----------|------------|-------------|----------------|
| POV | povId | pov_name, pov_title | project.pov_details, project.task_list | Handler lookup (318-376) |
| Task | taskId | task_name, task_title | project.task_context, perform.agent_results | Handler 3-level search (108-149) |
| Assignee | assigneeId | assignee, assignee_name | perform.execute, project.task_list | API lookup (322-325) |
| Team | teamId | team_name | project.task_list, perform.execute | API lookup |
| Phase | phaseId | phase_name, phaseName | project.task_list, perform.execute | API lookup |
| Stage | stageId | stage_name, stageName | project.task_list, perform.execute | API lookup |
| Template | templateId | agent_template_name | template.details | Handler lookup (548-584) |
| Service | serviceId | service_name | services.health, registry.update, services.call | DB OR query (505-512) |

### Three Implementation Patterns

**Pattern A: Handler Lookup** (project.pov_details, project.task_context, perform.agent_results, template.details)
- Handler fetches all records and searches by name
- Fuzzy matching: exact → partial → (optional) word-based
- Helpful errors with available names

> 🔴 **TRIPWIRE — fetch-to-search truncation (the #1 Pattern A bug).** "Fetches all records"
> is a misnomer: the fetch returns a **page**. If it uses the route/query DEFAULT page size,
> any record past that page is **silently unfindable by name — even on an exact match** (the
> fuzzy search never sees it; you get a misleading "not found / available: <first N>"). The
> candidate set passed to `findBestMatch`/`getScoredSuggestions` MUST be complete.
> - **Confirmed instances (2026-06-19 sweep):** `template.details` fetched `/api/agent-templates`
>   with no limit → default **20**, so template #21+ 404'd (`f9f637c5`); `pov_details` POV-by-name
>   fetched `/api/pov` with no limit → default **50**, POV #51+ 404'd (`26bfcad2`). `agent.assign`'s
>   `findMany({ take: 50 })` was the same latent shape. `task.context`/`agent.results` were already
>   patched (`{ limit: '200' }`). So this class recurs — guard every new Pattern A handler.
> - **Guard:** the list fetch MUST pass an explicit high limit (`{ limit: 200 }`, the common route
>   cap) or a `findMany({ take })` above the live record count. **Better: use Pattern B** (server-side
>   search) — there's no client-side candidate set to truncate.
> - **Tripwire grep** (every fetch-to-search site; inspect each one's fetch limit by hand — an empty
>   `{}` query or a too-small `take` is the smell):
>   ```bash
>   grep -rn "findBestMatch(\|getScoredSuggestions(" lib/mcp/ --include="*.js" --include="*.ts" \
>     | grep -v fuzzy-search-helper
>   # For each hit, read the apiClient.get(...) / prisma.findMany(...) feeding it:
>   #   apiClient.get('/api/X', {}, ...)        ← BUG: no limit → route default page
>   #   findMany({ ..., take: N })              ← check N > current record count
>   ```

**Pattern B: API Lookup** (project.task_list, perform.execute)
- Handler passes name parameters to API
- API performs fuzzy search server-side
- Name parameters in queryParams

**Pattern C: Database OR Query** (Hub tools: services.call, services.health, registry.update)
- Direct Prisma query with OR [id, name]
- Fastest pattern (single query)
- Best for simple lookups

### Implementation Reference Files

**Successful implementations** (line numbers dropped 2026-06-11 — all had drifted; locate by symbol):
- `/lib/mcp/server/tools/sdk-native-basic-tools.js` — `grep -n "handleGetPOVDetails\|handleGetAgentTemplateDetails"`
- `/lib/mcp/server/tools/sdk-native-advanced-tools.js` — `grep -n "handleGetTaskContext\|handleAgentResults"`
- `/lib/mcp/server/tools/hub-tools-handler.js` + extracted hub handlers — `grep -rn "findBestMatch\|getScoredSuggestions" lib/mcp/server/tools/`
- `/lib/mcp/server/config/tool-schemas.js` — alias pairs inside CONSOLIDATED_SCHEMAS (povId/pov_name etc.)

**Documentation** (moved in the KB migration):
- `/.claude/knowledge/domain/parameter-normalization/magic-parameter-implementation-v2.md` - Complete before/after analysis
- `/.claude/knowledge/domain/parameter-normalization/tool-schema-discovery.md` - Discovery methodology
- `/.claude/knowledge/domain/parameter-normalization/hub-tools-schema-magic.md` - Hub tools verification

## Section 9: Centralized Validation Alias Mapping (Dec 2025 Sprint 3) ⭐ NEW

**Context**: Sprint 3 MCP Advanced Tools Testing found 40 parameters accepted by handlers but missing from validation schemas. Created centralized alias mapping system.

### Discovery Commands
```bash
# Find the centralized alias mappings constant
echo "=== PARAMETER_ALIAS_MAPPINGS (14 aliases) ==="
grep -A 25 "const PARAMETER_ALIAS_MAPPINGS" lib/validation/mcp-action-validation.ts

# Find the normalizeAliases function
echo "=== normalizeAliases Function ==="
grep -A 20 "function normalizeAliases" lib/validation/mcp-action-validation.ts

# Find all schemas using normalizeAliases (5 schemas)
echo "=== Schemas Using Centralized Aliases ==="
grep -n "normalizeAliases" lib/validation/mcp-action-validation.ts

# Find semantic enum mappings (6 fields: priority, status, workflowType, position, type, analysisType)
echo "=== SEMANTIC_ENUM_MAPPINGS (6 fields) ==="
grep -A 40 "const SEMANTIC_ENUM_MAPPINGS" lib/validation/mcp-action-validation.ts

# Find example values for error messages (29 examples)
echo "=== exampleValues for Error Messages ==="
grep -A 35 "const exampleValues" lib/validation/mcp-action-validation.ts

# Compare with parameter-normalizer.js (runtime normalization)
echo "=== Comparison: Validation vs Runtime Normalization ==="
echo "Validation layer (Zod): lib/validation/mcp-action-validation.ts"
echo "Runtime layer (JS): lib/mcp/server/utils/parameter-normalizer.js"
```

### Two Normalization Layers

**Layer 1: Validation Schema (Zod)** - `mcp-action-validation.ts`
- `PARAMETER_ALIAS_MAPPINGS` - 14 snake_case → camelCase mappings
- `normalizeAliases()` - Applied in `.transform()` after validation
- Context-specific aliases: `{ stageName: 'name' }` for stage.create only
- **When**: During Zod schema validation (before handler)

**Layer 2: Runtime Normalizer (JS)** - `parameter-normalizer.js`
- `SDKParameterNormalizer.normalizeForTool()` - Per-tool normalization
- Session context tracking (recentPOV, recentTasks)
- Value normalization (urgent → HIGH, active → IN_PROGRESS)
- **When**: After validation, before tool execution

### Key Pattern: optional() + refine() + transform()
```typescript
// Example from task.update schema
z.object({
  taskId: ValidationSchemas.TASK_ID.optional(),
  task_name: SimpleTextField(500).optional(),  // Alias
  taskName: SimpleTextField(500).optional(),   // Canonical
  // ...
}).refine(
  data => data.taskId || data.task_name || data.taskName,
  { message: "Either taskId or task_name/taskName required" }
).transform(data => normalizeAliases(data))  // Centralized!
```

### Alias Mappings (14 total)
| Alias | Canonical | Purpose |
|-------|-----------|---------|
| task_name | taskName | Task lookup |
| pov_id | povId | POV context |
| due_date | dueDate | Date fields |
| agent_template_name | agentTemplateName | Template lookup |
| agent_template_id | agentTemplateId | Template ID |
| role | agentRole | Agent role |
| completionNotes | completionNote | Plural fix |
| analyticsType | analysisType | Analytics |
| task_id | taskId | Task ID |
| phase_id | phaseId | Phase ID |
| stage_id | stageId | Stage ID |
| team_id | teamId | Team ID |
| assignee_id | assigneeId | Assignee ID |
| taskTitle | title | Title alias |

### Discovery Questions
1. Are all aliases from parameter-normalizer.js also in PARAMETER_ALIAS_MAPPINGS?
2. Are there handler parameters not covered by either normalization layer?
3. Should validation and runtime normalization be merged?

## Section 10: Error Helper Integration (Dec 2025)

### Discovery Commands
```bash
# Find error helper modules (renamed from Section 9)
echo "=== Error Helper Modules ==="
ls -la lib/mcp/server/tools/basic/error-helpers.js
ls -la lib/mcp/server/tools/advanced/error-helpers.js

# Check fuzzy search integration with error helpers
echo "=== Fuzzy Search + Error Helper Integration ==="
grep -rn "getScoredSuggestions\|findBestMatch" lib/mcp/server/tools/*.js --include="*.js" | head -10

# Find error helper usage in parameter normalization context
echo "=== Error Helpers in SDK-Native Tools ==="
grep -rn "require.*error-helpers" lib/mcp/server/tools/sdk-native*.js

# Check error message format consistency
echo "=== Error Message Format ==="
grep -A 5 "povNotFoundError\|taskNotFoundError" lib/mcp/server/tools/basic/error-helpers.js | head -20

# Verify fuzzy suggestions in error responses
echo "=== Fuzzy Suggestions in Errors ==="
grep -rn "suggestions\|Did you mean" lib/mcp/server/tools/basic/error-helpers.js
```

### Integration Points
- **Error Helpers + Fuzzy Search**: When parameter normalization fails to resolve a name, error helpers provide suggestions
- **3 Modules**: basic (POV/Task), advanced (agents/analytics), browser (automation workflows)
- **Key Functions**: `povNotFoundError()`, `taskNotFoundError()` with fuzzy suggestions
- **Format**: Emoji prefixes (❌🔍💡), recovery steps, next actions

### Discovery Questions
1. Are error helpers invoked when name-based lookups fail?
2. Do fuzzy suggestions come from `getScoredSuggestions()` or inline?
3. Is error format consistent across all magic parameter tools?

## Future Enhancements

1. **Persistent Context**: Store context in database for long sessions
2. **User-Specific Context**: Track context per user/session
3. **ML-Based Normalization**: Learn parameter patterns from usage
4. **Context Expiry**: Auto-clear stale context
5. **Context API**: Expose context management to tools
6. **Magic Parameter Autocomplete**: Suggest available names to AI clients

## Success Metrics

- ✅ Claude Desktop parameter compatibility: 100%
- ✅ Session context tracking: Working
- ✅ Shared instance architecture: Implemented
- ✅ Tool integration: Complete
- ✅ Performance impact: < 5ms per normalization
- ✅ Magic parameters: id+name alias pairs across the consolidated tool surface (pre-consolidation figure was 11/28 legacy tools)
- ✅ Specialist confidence: 96/100 (mcp-hub-specialist)


## Enum-alias normalization: is every validation site behind a normalizer? (added 2026-07-25)

**Why this check exists.** A live BC75 sibling-drift bug, found by the pov-task-lifecycle smoke
test on 2026-07-25: the `perform` tool schema advertises `URGENT` as a valid priority, `task.list`
normalized it to `HIGH` and `task.create` had its own alias map — but `task.update` returned
`400 Invalid enum value ... received 'URGENT'`. Same input, opposite outcomes, depending on which
action and which transport.

The cause was NOT a missing case. Alias normalization existed in TWO layers
(`preNormalizeParameters` in the HTTP route, `applySemanticMapping` inside
`validateMCPActionRequest`) and **neither was on the path** for a caller reaching
`tasks-action-router`, where `MCPParameterSchemas[...].safeParse()` ran raw. This is the
dual-layer normalization model failing exactly where this domain is supposed to guarantee it.
Fixed by applying the existing mapper at the ROUTER boundary — the one line every dispatch crosses
— rather than adding a third copy of the alias table.

**The invariant**: every site that validates against `MCPParameterSchemas` must normalize aliases
BEFORE it parses.

```bash
# 1. Every real validation site. NOTE the schema is looked up on one line and parsed on another,
#    so you CANNOT grep for the lookup and `.safeParse` together — filter out type-infer and
#    comment hits instead. (The obvious one-line grep returns 0 and looks reassuring; it is not.)
grep -rn "MCPParameterSchemas\[" lib app --include=*.ts | grep -v "z\.infer" | grep -vE ':[0-9]+: *(\*|//|/\*)'

# 2. Every alias-normalization application
grep -rn "applySemanticMapping(\|preNormalizeParameters(" lib app --include=*.ts | grep -v "function "

# 3. The single alias table — there must be exactly ONE definition
grep -rn "SEMANTIC_ENUM_MAPPINGS *[:=]" lib --include=*.ts
```

**PROVEN 2026-07-25** (re-prove; a mismatch IS a finding — Protocol 11 Part C):
- (1) → **3** lookup sites, of which all three parse:
  `lib/mcp/tasks/action/tasks-action-router.ts:98` (all MCP actions, normalized at `:114`),
  `lib/validation/mcp-action-validation.ts:729` (`validateMCPActionRequest`, normalized at `:734`),
  and `app/api/agents/configure/route.ts:16` (a REST route reusing
  `MCPParameterSchemas['agent.configure']`, parsed at `:34`).
- (2) → **3** normalization applications: `tasks-action-router.ts:114` (the 2026-07-25 fix,
  covers every action and every transport), `mcp-action-validation.ts:734`
  (`validateMCPActionRequest`), `app/api/mcp/tasks/action/route.ts:109` (HTTP route only).
- (3) → **1** definition, `lib/validation/mcp-action-validation.ts`. **A second definition is a
  finding** — the whole failure mode was normalization living in more places than the paths that
  needed it, and duplicating the table makes silent divergence inevitable.

**Interpreting a mismatch.** A new site in (1) that is not preceded by a normalizer in (2) is the
bug class re-opening. The `agent.configure` REST site is a documented non-issue: that schema
declares no aliasable enum (no `priority`/`status`) and carries its own `normalizeAliases`
transform — confirm that still holds rather than assuming it.

**Related**: `task-create-handler.ts` still carries a LOCAL priority alias map as defence-in-depth
(BUG-005). It is now redundant with the router normalization but harmless; if you remove it, verify
`task.create` still normalizes on every transport first.
