# Agent Execution Architecture

> **Technical reference for configuring and executing AI agents on tasks**
>
> Execution paths, configuration options, prompt construction, tool integration, and concurrency control

---

## Quick Navigation

**What do you need?**

- **[A] Configure an agent** -> See Configuration Methods
- **[B] Understand execution paths** -> See Execution Paths
- **[C] Prompt construction** -> See Prompt Architecture
- **[D] Tool integration** -> See Agentic Tool Loop
- **[E] Concurrency control** -> See CAS Guard & State Machine
- **[F] Capability comparison** -> See Path Comparison Matrix

---

## What You'll Learn

By the end of this guide, you'll understand:
- How to configure agents via MCP or GUI
- The three-priority system prompt hierarchy
- How the agentic tool loop executes MCP tools
- Concurrency control (CAS guard) and state management
- Differences between MCP Engine and GUI Streaming paths
- Template system, model parameters, and execution types

**Audience**: Developers, architects, MCP client users

---

## Section A: Configuration Methods

### Method 1: Assign a Template (`agent.assign`)

**Handler**: `lib/mcp/tasks/action/handlers/agent/agent-assign-handler.ts`

**Purpose**: Assign a pre-built agent template to a task. Templates provide role, prompt template, capabilities, and constraints.

**Parameters**:
| Parameter | Required | Description |
|-----------|----------|-------------|
| `taskId` | Yes | Task to configure |
| `agentTemplateId` | One of these | Template ID (exact match) |
| `agentTemplateName` | One of these | Template name (fuzzy lookup: exact -> partial -> error) |

**Example** (via MCP):
```
perform(
  action: 'agent.assign',
  parameters: {
    taskId: 'clxy123...',
    agentTemplateName: 'Senior Developer'
  }
)
```

**What it sets**: `task.agentTemplateId` -> links to `AgentTemplate` record

**Available Templates**: Use `template(action: 'list')` to see all templates with their roles, categories, and capabilities.

---

### Method 2: Custom Configuration (`agent.configure`)

**Handler**: `lib/mcp/tasks/action/handlers/agent/agent-configure-handler.ts`

**Purpose**: Full manual control over agent settings including role, prompt, model parameters, MCP tools, workflow, and execution type.

**Parameters**:
| Parameter | Required | Description |
|-----------|----------|-------------|
| `taskId` | Yes | Task to configure |
| `agentRole` / `role` | Recommended | Agent role (e.g., "QA Engineer", "Developer") |
| `prompt` | Recommended | User prompt (task instructions) |
| `agentTemplateId` | No | Template ID to assign |
| `agentTemplateName` | No | Template name (fuzzy lookup) |
| `inputContext` | No | Additional context object |
| `maxRetries` | No | Max retry attempts (default: 3) |
| `timeout` | No | Execution timeout in ms (default: 300000) |
| `modelParameters` | No | LLM configuration (see below) |
| `mcpTools` | No | Array of MCP tool names to make available |
| `workflow` | No | Workflow phase configuration |
| `successMetrics` | No | Success criteria array |
| `executionType` | No | Execution type (see below) |

**Model Parameters** (`modelParameters`):
```json
{
  "provider": "anthropic_sdk",
  "model": "claude-sonnet-4-6",
  "temperature": 0.3,
  "maxTokens": 8192,
  "topP": 1.0,
  "systemPrompt": "Custom system prompt override",
  "thinkingBudgetTokens": 5000,
  "webSearch": { "maxUses": 3 }
}
```

**Execution Types** (validated against allowlist):
- `standard` (default)
- `systematic_validation`
- `debug_systematic_analysis`
- `collaborative`
- `research_focused`
- `testing_focused`
- `documentation_focused`

**MCP Tools Configuration** (`mcpTools` / `mcpContext.tools`):
```json
{
  "mcpTools": ["services", "get_forecast"],
  "workflow": {
    "phases": { "phase1": { "steps": [...] } }
  },
  "successMetrics": ["API responds with valid data", "No errors"]
}
```

**Example** (via MCP):
```
perform(
  action: 'agent.configure',
  parameters: {
    taskId: 'clxy123...',
    agentRole: 'QA Engineer',
    prompt: 'Test the weather API integration thoroughly',
    mcpTools: ['services'],
    modelParameters: {
      provider: 'anthropic_sdk',
      model: 'claude-sonnet-4-6',
      temperature: 0.3,
      maxTokens: 8192
    },
    executionType: 'testing_focused'
  }
)
```

**Validation**: All configuration passes through `validateMCPConfiguration()` before storage.

---

### Method 3: GUI Configuration

**Component**: `AgentMonitoringView.tsx` (Agents tab -> Monitoring)

**What the GUI uses**:
- `task.agentRole` -> Agent role
- `task.prompt` -> User prompt
- `task.agentTemplate` -> Linked template (if assigned)
- `task.metadata.modelParameters` -> LLM settings (provider, model, temperature, etc.)
- `task.mcpContext.tools` -> MCP tool names

**GUI Execute button** always uses the streaming path (`/api/pov/agent/execute/stream`).

---

## Section B: Execution Paths

### Path 1: MCP Engine (Production)

**Entry**: `perform(action: 'agent.execute')` -> `agent-execute-handler.ts`

**Flow**:
```
MCP Client (Claude Desktop / ChatGPT)
  |
  v
agent-execute-handler.ts
  |-- Validates POV access
  |-- Checks agent configuration (template or custom)
  |-- Creates AgentExecution record (PENDING)
  |
  v
AgentTaskService.executeAgentOnTask()
  |-- CAS guard (atomic PENDING claim)
  |-- Creates execution record
  |
  v
agentExecutionEngine.executeById()  [fire-and-forget]
  |-- Atomic PENDING -> RUNNING claim
  |-- Registers execution resource (real-time streaming)
  |-- Builds enhanced context (task + POV + phase + team)
  |-- Builds agent prompt (task info + context + template)
  |-- Determines agent role (4-source priority)
  |-- Builds system prompt (3-tier hierarchy)
  |-- Loads MCP tool definitions from mcpServerManager
  |-- Calls llmService.generateText() with tool definitions
  |-- Agentic tool loop (max 5 turns)
  |-- Creates artifacts (result.json, report.md)
  |-- Atomic transaction: execution SUCCESS + task update + artifacts
  |-- Activity logging (logAgentExecution)
  |-- Token tracking (tokenManager)
  |
  v
Results available via perform(action: 'agent.results') tool
```

**Key Features**:
- Fire-and-forget (avoids MCP HTTP 30s timeout)
- Full `pAIchartUniversalTemplate` system prompt
- EventEmitter progress streaming to MCP resources
- Batch processing via `processPendingExecutions()` (10s polling)
- Stale execution cleanup (15-minute threshold)
- Activity logging for audit trail
- Full token usage tracking

---

### Path 2: GUI Streaming

**Entry**: Execute button -> `POST /api/pov/agent/execute/stream`

**Flow**:
```
Browser (AgentMonitoringView)
  |
  v
/api/pov/agent/execute/stream/route.ts
  |-- Rate limiting (10/min)
  |-- Zod validation (AgentExecuteSchema + prompt injection detection)
  |-- POV access validation
  |-- CAS guard (atomic claim)
  |-- Creates AgentExecution record (RUNNING)
  |
  v
SSE Stream opened to browser
  |-- Sends execution_started event
  |-- Initializes LLM with user settings
  |-- Loads MCP tool definitions from mcpServerManager
  |-- Calls llmService.generateText() with tool definitions
  |-- Streams text chunks to browser as SSE events
  |-- Agentic tool loop (max 5 turns)
  |   |-- Sends function_call events
  |   |-- Executes tools via mcpServerManager
  |   |-- Sends tool results as text_chunk events
  |   |-- Calls LLM again with tool results
  |   |-- Streams continuation text
  |-- Creates artifacts (result.json, report.md)
  |-- Atomic transaction: execution SUCCESS + task update + artifacts
  |-- Sends execution_update + artifact_created events
  |-- Sends [DONE]
```

**SSE Event Types**:
| Event Type | Payload | Purpose |
|------------|---------|---------|
| `execution_started` | `executionId`, `status`, `taskId` | Execution begins |
| `text_chunk` | `text`, `isComplete` | LLM text output (including tool results) |
| `function_call` | `functionCall.name`, `arguments` | Tool call initiated |
| `tool_result` | Embedded in `text_chunk` | Tool result (formatted as markdown) |
| `log_update` | `logs[]` | Server-side log array |
| `web_search_results` | `webSearchResults[]` | Web search results |
| `citations` | `citations[]` | Source citations |
| `execution_update` | `status`, `endTime` | Status change (SUCCESS/FAILED) |
| `artifact_created` | `artifact.id`, `name`, `type` | Artifact available |
| `error` | `error.message` | Error occurred |

---

## Section C: Prompt Architecture

### System Prompt Hierarchy (3 Tiers)

The MCP Engine uses a priority system for system prompts:

```
Priority 1: Agent Template promptTemplate
    |
    | (if no template)
    v
Priority 2: User System Prompt (modelParameters.systemPrompt)
    |
    | (if no custom prompt)
    v
Priority 3: pAIchart Universal Template (default)
```

**Built in**: `agentExecutionEngine.buildSystemPrompt()`

---

### Priority 1: Agent Template

When a template is assigned (`task.agentTemplateId`), its `promptTemplate` becomes the system prompt. Template variables are resolved:

- `${agentRole}` -> Resolved agent role
- `${contextualInformation}` -> Task/POV/phase context
- `${roleSpecificGuidance}` -> Role-specific expertise (from `getRoleSpecificGuidance()`)

**Source**: `AgentTemplate.promptTemplate` field in database

---

### Priority 2: User System Prompt

A custom system prompt set via `modelParameters.systemPrompt` in the configure handler. Takes precedence when no template is assigned.

---

### Priority 3: pAIchart Universal Template

**Source**: `lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts`

**Includes**:
- Strategic alignment framework (business context, mission)
- System architecture awareness (POV -> Phase -> Stage -> Task)
- Validated system capabilities
- MCP tool usage framework
- Role-specific expertise (via `getRoleSpecificGuidance()`)
- Contextual information (task, POV, phase, team)

---

### Hub Tool Routing Guidance

When `services` is in the MCP tools list, the engine appends routing guidance:

```
## MCP Hub Tool Routing

IMPORTANT: To use external services, you MUST use the `services(action: "call")` tool.
Do NOT call service tool names directly.

WRONG: get_forecast(location: "Sydney, Australia")
RIGHT: services(action: "call", targetService: "weather-api", tool: "get_forecast",
                arguments: {location: "Sydney, Australia"})
```

This guidance includes a dynamic service-to-tool mapping queried from the MCPTool registry.

---

### User Prompt Construction

The user prompt (`buildAgentPrompt()`) assembles:

1. **Custom prompt** (from `config.prompt`)
2. **Template instructions** (if template has `promptTemplate`)
3. **Task information** (title, description, priority, status, type, due date)
4. **Task sequence context** (parent task, sub-tasks with order and status)
5. **POV context** (title, description, objective)
6. **Phase context** (name, description)
7. **Additional context** (input context, workflow, success metrics)

---

### Agent Role Resolution (4-Source Priority)

```
config.agentRole  >  agentTemplate.defaultRole  >  task.agentRole  >  "AI Assistant"
```

**Built in**: `agentExecutionEngine.determineAgentRole()`

---

## Section D: Agentic Tool Loop

### How Tools Are Loaded

1. **MCP tools from task**: `task.mcpContext.tools` -> array of tool names
2. **Tool definitions**: `mcpServerManager.getToolDefinitions(toolNames)` -> schemas from registered MCP servers (embedded + external)
3. **Passed to LLM**: As `functions` parameter with Anthropic tool format

### Loop Mechanics

```
Turn 0: LLM generates text + optional tool_use blocks
   |
   |-- If stopReason === 'tool_use':
   |     |
   |     |-- Execute ALL tool calls via mcpServerManager.executeToolOnServer()
   |     |-- Build tool_result messages with tool_use_id threading
   |     |-- Truncate results > 8000 chars
   |     |-- Append to message history (assistant content blocks + user tool_results)
   |     |
   |     v
   |   Turn N: LLM generates continuation with tool results in context
   |     |
   |     |-- Repeat until stopReason !== 'tool_use' OR turnCount >= MAX_TOOL_TURNS
   |
   |-- If stopReason === 'end_turn': Done
   |-- If stopReason === 'max_tokens': Truncation note appended
   |-- If stopReason === 'refusal': Refusal message returned
```

### Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_TOOL_TURNS` | 5 | Maximum tool loop iterations |
| `TIMEOUT_BASE_MS` | 180,000 (3 min) | Base execution timeout |
| `TIMEOUT_PER_TURN_MS` | 60,000 (1 min) | Additional timeout per turn |
| `MAX_TOOL_RESULT_LENGTH` | 8,000 chars | Truncation limit for tool results |
| Total max timeout | 480,000 (8 min) | 180s + (5 x 60s) |

### Tool Execution Context

Each tool call receives:
```typescript
{
  sessionId: execution.id,
  userId: user.userId || 'system',
  timeout: 30000  // 30s per tool call
}
```

---

## Section E: CAS Guard & State Machine

### Execution Status State Machine

```
null (no execution)
  |
  v  [agent.execute or GUI Execute]
RUNNING  -----> SUCCESS (artifacts created)
  |                |
  |                v
  |           task.executionStatus = 'SUCCESS'
  |
  +-----------> FAILED (error artifact created)
                   |
                   v
              task.executionStatus = 'FAILED'
                   |
                   v
              null (after stale cleanup or manual reset)
```

### CAS Guard (Compare-And-Swap)

**Purpose**: Prevent duplicate concurrent executions on the same task.

**Implementation** (both paths):
```sql
UPDATE tasks
SET executionStatus = 'RUNNING', updatedAt = NOW()
WHERE id = :taskId
AND (executionStatus IS NULL
     OR executionStatus NOT IN ('RUNNING', 'PENDING'))
```

- If `claimed.count === 0`: Another execution is already running -> reject with 409
- If `claimed.count === 1`: This caller won the race -> proceed

**Stale Execution Cleanup** (MCP Engine only):
- Runs every 10 seconds via `processPendingExecutions()`
- Resets tasks stuck in PENDING/RUNNING for >15 minutes with no active execution
- Prevents permanent blocking from crashed executions

---

### Transaction Atomicity

All execution completions use atomic transactions:

**Success path** (single `$transaction`):
1. Update `AgentExecution` -> SUCCESS
2. Create artifacts (result.json, report.md)
3. Update `Task` -> executionStatus: SUCCESS, agentLog, outputArtifacts

**Failure path** (single `$transaction`):
1. Update `AgentExecution` -> FAILED
2. Update `Task` -> executionStatus: FAILED
3. Create error artifact (error.json)

---

## Section F: Path Comparison Matrix

```
+--------------------------+-----------------------------+---------------------------------+
|       Capability         |       GUI Streaming         |            MCP Engine           |
+--------------------------+-----------------------------+---------------------------------+
| Agentic tool loop        | Yes (5 turns max)           | Yes (5 turns max)               |
| CAS guard                | Yes (atomic claim)          | Yes (atomic claim)              |
| Real-time text in browser| Yes (SSE text_chunk events) | No (fire-and-forget)            |
| Stop/Reset buttons       | Yes                         | No (cancel via MCP)             |
| No MCP client needed     | Yes (browser only)          | Needs Claude Desktop/ChatGPT    |
| Prompt construction      | Basic (template + role)     | Full (pAIchartUniversalTemplate)|
| Progress streaming       | SSE to browser              | EventEmitter to MCP resources   |
| Batch/scheduled execution| No                          | Yes (processPendingExecutions)  |
| Activity logging         | No                          | Yes (logAgentExecution)         |
| Token tracking           | Partial (via generateText)  | Full (tokenManager)             |
| Hub tool routing guidance| No                          | Yes (buildHubToolGuidance)      |
| Enhanced context         | No (basic task context)     | Yes (POV + phase + team + subs) |
| Execution types          | No                          | Yes (7 types validated)         |
| Stale cleanup            | No                          | Yes (15-min threshold)          |
+--------------------------+-----------------------------+---------------------------------+
```

### When to Use Each Path

| Scenario | Recommended Path |
|----------|-----------------|
| Quick manual test from browser | GUI Streaming |
| Automated MCP workflow | MCP Engine |
| Multi-service orchestration | MCP Engine (via `services(action: 'workflow.execute')`) |
| Real-time visual feedback needed | GUI Streaming |
| Batch execution of multiple tasks | MCP Engine |
| Full prompt construction with POV context | MCP Engine |
| No MCP client available | GUI Streaming |

---

## Section G: Artifacts

### Generated on Success

| Artifact | Type | Content |
|----------|------|---------|
| `result.json` | `application/json` | Execution metadata, tool call results, provider/model info |
| `report.md` | `text/markdown` | Full execution report with task info, LLM config, generated content, tool executions |

### Generated on Failure

| Artifact | Type | Content |
|----------|------|---------|
| `error.json` | `application/json` | Error message, task ID, timestamp |

### Artifact Storage

- Stored in `AgentArtifact` table (linked to `AgentExecution`)
- Referenced in `task.outputArtifacts` as metadata array (id, name, type, createdAt)
- Content NOT duplicated in task record (metadata only)

---

## Section H: Security

### Input Validation

- **AgentExecuteSchema** (Zod): Validates all execution requests
  - Prompt injection detection (blocks "ignore instructions", "SYSTEM:", etc.)
  - XSS prevention in role field (blocks `<script>`)
  - CUID format enforcement for task IDs

### POV Access Validation

Both paths validate POV ownership before execution:
- `getPOVFromTask()` -> resolves task -> stage -> phase -> POV
- `validatePOVAccess(user, pov)` -> checks ownership or team membership

### Rate Limiting

- Agent execution: 10 requests/minute per user
- Enforced at route level via `agentExecutionLimiter`

### LLM Output Sanitization

- HTML script tags stripped from markdown reports
- Event handlers removed (`onXxx="..."`)
- Iframes removed
- Prevents stored XSS in rendered markdown

---

## Section J: Database Schema

### Key Models

**Task** (agent-related fields):
```prisma
agentRole          String?           // Agent role name
prompt             String?           // User prompt text
agentTemplateId    String?           // Links to AgentTemplate
executionStatus    ExecutionStatus?  // null/RUNNING/SUCCESS/FAILED
agentLog           String?           // Execution log text
outputArtifacts    Json?             // Artifact metadata array
mcpContext         Json?             // MCP tools, workflow, metrics
metadata           Json?             // Contains modelParameters
inputContext       Json?             // Additional context
maxRetries         Int?              // Max retry attempts
timeout            Int?              // Timeout in ms
```

**AgentExecution**:
```prisma
id          String           @id @default(cuid())
taskId      String           // Linked task
status      ExecutionStatus  // PENDING/RUNNING/SUCCESS/FAILED
config      Json?            // Execution configuration snapshot
context     Json?            // Execution context snapshot
logs        Json?            // Log entries array
startTime   DateTime?
endTime     DateTime?
```

**AgentTemplate**:
```prisma
id              String   @id @default(cuid())
name            String   // Template name (e.g., "Senior Developer")
defaultRole     String   // Default agent role
promptTemplate  String?  // System prompt template with variables
capabilities    Json?    // Array of capability strings
constraints     Json?    // Array of constraint strings
category        String?  // Template category
```

---

## Quick Reference

### Configuration Flow
1. **Assign template** OR **Configure custom** -> sets task fields
2. **Execute** -> creates AgentExecution record -> runs LLM with tools

### System Prompt Priority
1. Agent Template `promptTemplate`
2. User `modelParameters.systemPrompt`
3. pAIchart Universal Template (default)

### Agent Role Priority
1. `config.agentRole`
2. `agentTemplate.defaultRole`
3. `task.agentRole`
4. `"AI Assistant"` (fallback)

### Agentic Loop
- Max 5 tool turns
- 8-minute total timeout
- 30s per tool call
- 8000-char result truncation
- Message history threading via `rawContentBlocks`

### State Transitions
- `null` -> `RUNNING` (CAS claim)
- `RUNNING` -> `SUCCESS` (completion)
- `RUNNING` -> `FAILED` (error)
- Stale `RUNNING` -> `null` (15-min cleanup, MCP Engine only)

---

**Version**: 1.0 | **Updated**: 2026-03-05 | **Status**: Production
**Execution Paths**: 2 (MCP Engine + GUI Streaming)
**Max Tool Turns**: 5 | **Timeout**: 8 min | **CAS Guard**: Both paths
