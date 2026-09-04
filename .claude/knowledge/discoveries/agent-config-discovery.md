# Agent Configuration Pipeline Discovery

**Purpose**: Trace the full agent configuration lifecycle: agent.assign → agent.configure → agent.execute → agent.results
**Created**: April 2, 2026
**Trigger**: Field leakage bug where agentTemplateId was lost between API response and React state

---

## Key Investigation Areas

### 1. Template Assignment (agent.assign)

What fields get written to the task record when a template is assigned.

```bash
# What agent.assign writes to the task
grep -n "agentTemplateId\|agentRole\|defaultRole" lib/mcp/tasks/action/handlers/agent/agent-assign-handler.ts

# Verify defaultRole is in the findMany select (bug fixed Apr 2026)
grep -n "select.*defaultRole\|defaultRole.*select" lib/mcp/tasks/action/handlers/agent/agent-assign-handler.ts

# What the Zod schema requires for agent.assign
grep -A15 "'agent.assign'" lib/validation/mcp-action-validation.ts
```

**Key facts**:
- agent.assign sets: `agentTemplateId` + `agentRole` (from template.defaultRole)
- The defaultRole copy requires `defaultRole` in the Prisma select — was missing for name-lookup path (fixed Apr 2026)
- Does NOT copy: modelParameters, systemPrompt, prompt — those are set by agent.configure or resolved at execution time

### 2. Agent Configuration (agent.configure)

What validation runs and what fields get written.

```bash
# Validation schema for agent.configure
grep -A30 "'agent.configure'" lib/validation/mcp-action-validation.ts

# What the refine constraint requires (relaxed Apr 2026)
grep -A3 "refine" lib/validation/mcp-action-validation.ts | grep -A3 "agent.configure"

# What the handler writes to the task
grep -n "prisma.task.update\|updateData" lib/mcp/tasks/action/handlers/agent/agent-configure-handler.ts | head -10
```

**Key facts**:
- Validation refine: requires at least ONE of role/agentRole, prompt, agentTemplateId, or agentTemplateName (relaxed Apr 2026 — previously required role/agentRole always)
- Error details now flow through to LLMs via route.ts → api-client.js (fixed Apr 2026)

### 3. System Prompt Assembly (buildSystemPrompt)

3-priority chain resolved at execution time — NOT stored on the task.

```bash
# System prompt priority chain
grep -n "Priority 1\|Priority 2\|Priority 3\|buildSystemPrompt" lib/services/agentExecutionEngine.ts

# Hub tool guidance injection
grep -n "buildHubToolGuidance\|MCP Hub Tool Routing" lib/services/agentExecutionEngine.ts

# What services get injected into the prompt
grep -n "activeServices\|serviceToolMap" lib/services/agentExecutionEngine.ts
```

**Key facts**:
- Priority 1: `agentTemplate.promptTemplate` (resolved with `${contextualInformation}` and `${agentRole}`)
- Priority 2: `userSystemPrompt` (from task.metadata.modelParameters.systemPrompt)
- Priority 3: pAIchart Universal Template fallback
- Hub tool guidance appended if `services` tool is in MCP tools list

### 4. User Prompt Assembly (buildAgentPromptBody)

Built fresh every execution from live DB data — the stored `task.prompt` is just the §1 Directive input.
**B1-S2 (2026-06-09):** the §1-§8 assembly lives in the SHARED `lib/agents/harness/build-agent-prompt-body.ts`
(`buildAgentPromptBody`); the engine's `buildAgentPrompt` and the SSE stream route both delegate to it.

```bash
# 8-section assembly (in the shared builder; engine just delegates)
grep -n "// §" lib/agents/harness/build-agent-prompt-body.ts
grep -n "return buildAgentPromptBody" lib/services/agentExecutionEngine.ts  # engine delegation

# What config.prompt vs task.description contributes
grep -A5 "config.prompt" lib/agents/harness/build-agent-prompt-body.ts | head -10
```

**Key facts**:
- §1 Directive: `config.prompt` (stored agentPrompt) or synthesized `"As a {role}, complete: {title}"`
- §2 Expected Output: `agentTemplate.outputSchema`
- §3 Task Context: title, description, priority, status, type, dueDate
- §4 Task Sequence: parent/subtasks
- §5 Environment: POV, Phase, Team, Assignee
- §6 Pipeline Context: auto-chained from dependency tasks via `context-chainer.ts` — renders previous output with title, role, confidence, full deliverable text. Falls back to raw JSON for legacy inputContext. **Chaining is invoked at the `createAgentExecution()` row-creation chokepoint via `lib/agents/harness/prepare-task-for-execution.ts` (2026-06-07, commit 6c640337) — covers ALL execution paths, before the INSERT.** Capped per-predecessor 128KB / total 512KB with truncation facts in `inputContext.pipelineMetadata.{anyTruncated,totalChars}`.
- §7 Available Tools: MCP tools with routing guidance + POV ID hint
- §8 Output Requirements (Apr 2026, rewritten 2026-04-26 commit `d0c0f2d8`): ALWAYS present, template-independent — Deliverable Contract: `finalResponse` is the deliverable channel (becomes `report.md` for leaf tasks, chained as context for downstream specialists); `task.comment` is coordination only; confidence score instruction ("Confidence: N/100"). Moved here from Universal Template to ensure all agents (including those with custom templates) follow the contract and report confidence.

### 5. GUI Normalization (CRITICAL)

The normalizer that feeds React state. Field leakage bugs happen here.

```bash
# CRITICAL: Which normalizer is ACTUALLY used by the provider?
grep -rn "normalizeApiData" components/poveditor/pov/context/PovEditorProvider.tsx

# The ACTIVE normalizer — verify all task fields are present
grep -n "task\." components/poveditor/pov/context/utils/normalizer.ts | head -40

# Dead code detection — functions in PovEditorContext.tsx that are NOT exported
grep -n "^function\|^async function" components/poveditor/pov/context/PovEditorContext.tsx

# Verify agentTemplateId is in normalizer (was missing before Apr 2026)
grep -n "agentTemplateId" components/poveditor/pov/context/utils/normalizer.ts
```

**Key facts**:
- **ACTIVE normalizer**: `components/poveditor/pov/context/utils/normalizer.ts` (imported via utils/index.ts)
- **DEAD normalizer**: `components/poveditor/pov/context/PovEditorContext.tsx` (lines 525-989) — not exported, actively misleading
- Field leakage risk: new task fields must be added to normalizer.ts in BOTH blocks (stage-task ~line 162 AND phase-task ~line 212)
- Bug history: `agentTemplateId` was missing from normalizer.ts — the dead code had it, which made debugging appear as if the fix was already in place

### 6. Config Score Calculation

Determines the "Configuration Score: X/100" shown in task.context responses.

```bash
# Score calculation
grep -n "score += \|configurationScore\|hasSystemPrompt\|hasTemplate\|hasAgentPrompt\|hasModelParameters" app/api/mcp/tasks/context/route.ts

# Template-based system prompt check (added Apr 2026)
grep -A10 "late-binding\|templateWithPrompt\|promptTemplate" app/api/mcp/tasks/context/route.ts
```

**Key facts**:
- template = 30 points, prompt = 25, systemPrompt = 25, modelParams = 20
- Template-based system prompts now count (checks if template has promptTemplate — added Apr 2026)
- Score 100 = template + role + prompt + template has promptTemplate
- Score 75 was misleading before the late-binding fix

### 7. Seed Script Safety

Verify seed scripts use upsert not deleteMany.

```bash
# Check for destructive patterns
grep -rn "deleteMany" scripts/seed-*.ts

# Check for safe upsert patterns
grep -rn "findFirst\|LEGACY_NAME\|Migrating" scripts/seed-*.ts | head -10

# List all agent template seed scripts
ls -la scripts/seed-*template*.ts scripts/seed-*orchestr*.ts scripts/seed-*service*.ts 2>/dev/null
```

**Key facts**:
- `seed-agent-templates.ts` now uses upsert (was deleteMany — fixed Apr 2026)
- Separate seed scripts: `seed-mcp-service-integration-template.ts`, `seed-mcp-workflow-orchestration-template.ts`
- Running seed-agent-templates.ts will NOT wipe templates from other scripts

### 8. Execution Limits

```bash
# Tool turn limits and timeouts
grep -n "MAX_TOOL_TURNS\|TIMEOUT_BASE\|TIMEOUT_PER_TURN\|executionTimeoutMs" lib/services/agentExecutionEngine.ts

# Status transition rules
grep -n "OPEN.*COMPLETED\|IN_PROGRESS\|transition" lib/mcp/tasks/action/handlers/task/task-complete-handler.ts
```

**Key facts**:
- MAX_TOOL_TURNS = 30 (increased from 10, Apr 2026)
- TIMEOUT_PER_TURN = 30s, Total timeout = 1080s (18min)
- Status transitions: OPEN → IN_PROGRESS (required) → COMPLETED. Direct OPEN → COMPLETED is rejected.

---

## Common Bug Patterns

1. **Field leakage in normalizer**: New Prisma field added but not in normalizer.ts → undefined in React state
2. **Dead code misdirection**: PovEditorContext.tsx appears to have the fix but it's dead code
3. **Destructive seed scripts**: deleteMany wipes templates from other scripts
4. **Score misrepresentation**: Template-based system prompts not counted → misleading 75/100
5. **Missing defaultRole in select**: agent.assign name-lookup path didn't include defaultRole
