# Agent Prompt Assembly Pattern

**Pattern Type**: Prompt Construction Architecture
**Confidence**: 95% (Production-validated, Mar 2026)
**Status**: Production-ready
**Inspired By**: CrewAI role/goal/backstory/expected_output separation, LangGraph state-driven messages

## Problem: Prompt Content Duplication and Missing Directives

### The Bug Pattern

When agent configuration copies `task.description` into `task.prompt`, the same content appears multiple times in the LLM message, wasting tokens and providing no clear directive:

```
System Prompt: [9,636 chars - full role intelligence template]

User Message:
  "Complete the documentation of business processes"     ← task.description (as prompt)
  ## Task Information
    Description: "Complete the documentation of..."      ← task.description AGAIN
  ## POV Context ...
```

**Why This Fails**:
- `task.prompt` should be a **directive** ("what to do"), not a description copy
- Without an explicit directive, the LLM has context but no clear instruction
- Token waste: ~2,400 tokens per execution for duplicated content
- Smaller models (Haiku) may produce empty responses when overwhelmed with redundant instructions

### Real Production Bug (Mar 10, 2026)

**Trigger**: Business Analyst template (9,636 chars) executed with Haiku model
**Root Cause**: `agent.configure` copied description into prompt field (line 333):
```typescript
let finalUserPrompt = prompt || taskWithContext?.description || '';
```
**Impact**: Description appeared 2x in user message, template appeared in both system + user message (4x total content), empty LLM response

---

## Solution: CrewAI-Aligned 5-Field Separation

### Principle: Every field has ONE purpose, appears ONCE

Inspired by CrewAI's proven architecture where role, goal, backstory, description, and expected_output are distinct fields with clear boundaries:

| Field | Purpose | Message | pAIchart Field |
|-------|---------|---------|----------------|
| **Backstory** | Role intelligence, execution standards | System prompt | `agentTemplate.promptTemplate` |
| **Directive** | What the agent should achieve | User message §1 | `task.prompt` (synthesized) |
| **Expected Output** | What "done" looks like — completion contract | User message §2 | `agentTemplate.outputSchema` |
| **Description** | What the task is about (context) | User message §3 | `task.description` |
| **Chained Context** | Output from previous tasks | User message §6 | `task.inputContext` |

### Key Rules

1. **System prompt = backstory only** — template `promptTemplate` with resolved placeholders
2. **Never copy description into prompt** — synthesize a directive instead
3. **Expected output is a contract** — tells the LLM what shape "done" takes
4. **Description is context, not instruction** — appears once in Task Information section
5. **Chained context flows forward** — previous task output injected via `inputContext`

---

## Implementation

### Directive Synthesis (when `task.prompt` not explicitly set)

```typescript
// ✅ CORRECT: Synthesize a role-aware directive
const directive = `As a ${agentRole}, complete the following task: "${task.title}"`;

// ❌ WRONG: Copy description into prompt
const directive = task.description || '';
```

### Expected Output Injection (from `agentTemplate.outputSchema`)

```typescript
// outputSchema example on AgentTemplate:
// { "format": "markdown", "sections": ["analysis", "recommendations"], "minLength": 800 }

if (outputSchema && typeof outputSchema === 'object' && Object.keys(outputSchema).length > 0) {
  parts.push('## Expected Output');
  if (outputSchema.format) parts.push(`**Format:** ${outputSchema.format}`);
  if (outputSchema.sections) parts.push(`**Required Sections:** ${outputSchema.sections.join(', ')}`);
  if (outputSchema.minLength) parts.push(`**Minimum Length:** ${outputSchema.minLength} words`);
  // Pass through any additional schema fields
  const extraKeys = Object.keys(outputSchema).filter(k => !['format', 'sections', 'minLength'].includes(k));
  extraKeys.forEach(key => parts.push(`**${key}:** ${JSON.stringify(outputSchema[key])}`));
  parts.push('');
}
```

### User Message Assembly Order

```
1. ## Directive            ← synthesized goal or explicit task.prompt
2. ## Expected Output      ← from agentTemplate.outputSchema (if set)
3. ## Task Context          ← title, description, priority, status, type, due date
4. ## Task Sequence Context ← parent/subtasks (if any)
5. ## Environment Context   ← POV, Phase, Stage, Team, Assignee
6. ## Pipeline Context      ← auto-chained from dependency tasks (if any)
                             Renders previous task output with title, role,
                             confidence score, and full deliverable text.
                             Falls back to raw JSON for legacy inputContext.
7. ## Available Tools       ← MCP tools (if configured)
8. ## Output Requirements   ← ALWAYS present, template-independent:
                             Deliverable Contract — finalResponse is the
                             deliverable channel (becomes report.md for leaf
                             tasks, chained as context for downstream
                             specialists); task.comment is coordination only;
                             confidence score instruction ("Confidence: N/100")
                             [rewritten 2026-04-26 commit d0c0f2d8]
```

### Placeholder Resolution (single shared function)

All paths (configure, engine, streaming) must resolve the same 4 placeholders:

```typescript
function resolvePromptPlaceholders(
  template: string,
  agentRole: string,
  contextualInfo: string,
): string {
  let resolved = template;
  resolved = resolved.replace(/\$\{agentRole\}/g, agentRole);
  resolved = resolved.replace(/\$\{formattedRole\}/g, agentRole);
  resolved = resolved.replace(/\$\{roleSpecificGuidance\}/g, getRoleSpecificGuidance(agentRole));
  resolved = resolved.replace(/\$\{contextualInformation\}/g, contextualInfo);
  return resolved;
}
```

**Critical**: Never resolve placeholders in only some paths. All 3 execution paths (configure, engine, streaming) must use the same function.

---

## Anti-Patterns

### ❌ Copying description into prompt
```typescript
// WRONG: description becomes the directive
finalUserPrompt = prompt || taskWithContext?.description || '';
```

### ❌ Template in both system and user messages
```typescript
// WRONG: Same template content appears twice
systemPrompt = agentTemplate.promptTemplate;  // system message
parts.push(agentTemplate.promptTemplate);      // user message too!
```

### ❌ Partial placeholder resolution
```typescript
// WRONG: Only resolving 2 of 4 placeholders
resolved = resolved.replace(/\$\{agentRole\}/g, role);
resolved = resolved.replace(/\$\{contextualInformation\}/g, context);
// ${roleSpecificGuidance} and ${formattedRole} sent as raw text!
```

### ❌ Duplicating context sections
```typescript
// WRONG: Same section appears twice (copy-paste bug)
parts.push('## Task Sequence Context');
// ... first block with descriptions
parts.push('## Task Sequence Context');
// ... second block without descriptions
```

---

## Separation of Concerns

```
GUI User                → Creates task (title + description)
task.create (MCP tool)  → Creates task structure (no agent fields)
task.update (MCP tool)  → Can assign template (sets agentRole)
agent.configure (MCP)   → Full agent setup (synthesizes directive, stores system prompt)
agent.execute (MCP)     → Runs with assembled prompts

Each tool handles its domain. Only agent.configure touches prompt construction.
```

---

## Files Modified

| File | Change |
|------|--------|
| `lib/mcp/tasks/action/handlers/agent/agent-configure-handler.ts` | Synthesize directive, read outputSchema |
| `lib/services/agentExecutionEngine.ts` | Restructured user message, shared placeholder resolution. **B1-S2 (2026-06-09): the §1-§8 user-message assembly MOVED to `lib/agents/harness/build-agent-prompt-body.ts:buildAgentPromptBody`; `buildAgentPrompt` now delegates.** |
| `app/api/pov/agent/execute/stream/route.ts` | Originally aligned user message with engine path; **B1 (2026-06-09) now CALLS the shared `buildAgentPromptBody` — no longer a separate copy to align.** |
| `lib/agents/harness/build-agent-prompt-body.ts` | **(B1) Single source of truth for the §1-§8 user message — both engine + stream route delegate here.** |
| `lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts` | Exported shared resolution utility |

## Validation

```bash
# Verify no description-to-prompt copying
grep -n "prompt.*description\|description.*prompt" \
  lib/mcp/tasks/action/handlers/agent/agent-configure-handler.ts

# Verify single Task Sequence Context block (user message now built in the shared builder since B1-S2)
grep -c "Task Sequence Context" lib/agents/harness/build-agent-prompt-body.ts
# Expected: 1

# Verify all 4 placeholders resolved in all paths
grep -rn "roleSpecificGuidance\|formattedRole" \
  lib/services/agentExecutionEngine.ts \
  lib/mcp/tasks/action/handlers/agent/agent-configure-handler.ts \
  app/api/pov/agent/execute/stream/route.ts

# Verify template NOT in user message (user message built in the shared builder since B1-S2)
grep "Agent Template Instructions" lib/agents/harness/build-agent-prompt-body.ts
# Expected: no results
```

## Industry References

- **CrewAI**: role/goal/backstory/expected_output separation ([docs](https://docs.crewai.com/en/concepts/tasks))
- **LangGraph**: SystemMessage/HumanMessage/State separation ([docs](https://docs.langchain.com/oss/python/langgraph/workflows-agents))
- **Claude Cowork**: Outcome-oriented prompting with environment context ([overview](https://www.tensorlake.ai/blog/claude-cowork-architecture-overview))

## Related Patterns

- `event-emitter-memory-safety.md` — Event-driven prompt registry sync
- `mcp-metadata-exposure-pattern.md` — Server-side vs client-side execution paradigms
- `mcp-tool-ux-pattern.md` — Error messages as prompts (recovery guidance)
- `field-leakage-prevention-pattern.md` — Preventing data duplication at boundaries
