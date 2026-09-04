# Prompt Construction Audit - Continuation for prompt-construction-specialist

> **Created**: 2026-03-10
> **From**: agent-execution-specialist
> **Reviewed**: 2026-03-10 by prompt-construction-specialist
> **Purpose**: Verify findings about prompt duplication in `buildAgentPrompt()` and `buildSystemPrompt()`, and advise on the intended architecture before fixes are applied.
> **Status**: ✅ ALL FINDINGS FIXED (2026-03-10)
>
> **Applied fixes:**
> - Finding 1: Removed template duplicate from user message in `buildAgentPrompt()` — saves ~2,400 tokens/execution
> - Finding 2: Removed duplicate Task Sequence Context block (copy-paste bug)
> - Finding 3: Added inline documentation for `task.prompt` vs `task.description` architecture
> - Finding 4: Added placeholder resolution (`${agentRole}`, `${formattedRole}`, `${roleSpecificGuidance}`, `${contextualInformation}`) to streaming route — was sending raw `${}` syntax to LLM

---

## Context: What Happened

During a model default investigation in the agent execution engine, we traced a Haiku empty-response failure and discovered prompt construction issues in `agentExecutionEngine.ts`.

### The Execution That Triggered This

- **Task**: "Document Current Business Processes" (ID: `cmh37ifsl0005yxjdrt83o128`)
- **Agent Template**: "Business Analyst" (ID: `cmf6gvbk90002yxvvmpn29ozg`)
  - Template `promptTemplate`: 9,636 chars (pAIchart Universal Template with Business Analyst role)
  - Template `metadata.modelParameters.model`: `claude-sonnet-4-20250514` (restored after test)
- **Task `prompt`**: 508 chars (agent instructions from task config)
- **Task `description`**: 1,058 chars (task context)
- **Task `agentRole`**: "Business Analyst"

### What Went Wrong

We temporarily removed the template's model override to test the default model fallback (`claude-haiku-4-5`). The execution ran but returned an empty response. While the empty response itself was caused by Haiku receiving a Sonnet-grade prompt, the investigation revealed structural issues in how prompts are assembled.

---

## Finding 1: Template promptTemplate Injected in BOTH System and User Messages

### Location
- **System prompt**: `buildSystemPrompt()` at line ~1132
- **User message**: `buildAgentPrompt()` at line ~944

### What Happens

```
buildSystemPrompt() — line 1132-1136:
  Priority 1: if (agentTemplate?.promptTemplate) → used as SYSTEM PROMPT
  Priority 2: else if (userSystemPrompt) → user's custom system prompt
  Priority 3: else → pAIchart Universal Template

buildAgentPrompt() — line 943-948:
  if (context.agentTemplate?.promptTemplate) {
    parts.push('## Agent Template Instructions');
    parts.push(context.agentTemplate.promptTemplate);  // ← SAME content again
  }
```

### Impact
- The 9,636-char template prompt appears in BOTH the system prompt AND the user message
- Roughly 2x token waste on template content per execution
- With the Business Analyst template, that's ~19K chars of duplicated instructions

### Question for Specialist
**Is this intentional?** The 3-tier priority hierarchy (Template -> User -> Universal) documented in the specialist config suggests the template should be the system prompt only. But perhaps there's a reason it was also added to the user message — e.g., some LLM providers that don't support system prompts, or reinforcement for instruction following?

**Proposed fix** (pending your approval): Remove the template injection from `buildAgentPrompt()` (lines 943-948) since `buildSystemPrompt()` already handles it as Priority 1. Add a comment explaining why.

---

## Finding 2: Task Sequence Context Duplicated

### Location
- Lines 964-983: First block (includes parent/subtask descriptions)
- Lines 985-998: Second block (same structure, without descriptions)

### What Happens

```typescript
// First block — lines 964-983
if (task.parentTask || (task.subTasks && task.subTasks.length > 0)) {
    parts.push('## Task Sequence Context');
    if (task.parentTask) {
        parts.push(`**Parent Task:** ${task.parentTask.title} (Order: ${task.parentTask.order})`);
        if (task.parentTask.description) {
          parts.push(`  *Description:* ${task.parentTask.description}`);
        }
    }
    if (task.subTasks && task.subTasks.length > 0) {
        parts.push('**Sub-Tasks:**');
        task.subTasks.forEach((sub: any) => {
            parts.push(`- **${sub.title}** (Order: ${sub.order}, Status: ${sub.status})`);
            if (sub.description) {
              parts.push(`  *Description:* ${sub.description}`);
            }
        });
    }
    parts.push('');
}

// Second block — lines 985-998 (nearly identical, WITHOUT descriptions)
if (task.parentTask || (task.subTasks && task.subTasks.length > 0)) {
    parts.push('## Task Sequence Context');
    if (task.parentTask) {
        parts.push(`**Parent Task:** ${task.parentTask.title} (Order: ${task.parentTask.order})`);
    }
    if (task.subTasks && task.subTasks.length > 0) {
        parts.push('**Sub-Tasks:**');
        task.subTasks.forEach((sub: any) => {
            parts.push(`- ${sub.title} (Order: ${sub.order}, Status: ${sub.status})`);
        });
    }
    parts.push('');
}
```

### Impact
- Task sequence context appears twice in every prompt for tasks with parent/subtasks
- The first block is more detailed (includes descriptions), making the second redundant
- Wastes tokens and may confuse the LLM with repeated information

### Question for Specialist
**This looks like an accidental copy-paste.** The first block (with descriptions) appears to be the intended version. Can you confirm the second block should be removed?

**Proposed fix** (pending your approval): Remove lines 985-998 (the second duplicate block).

---

## Finding 3: Prompt Architecture Question — task.prompt vs task.description

### Current Behavior

In `buildAgentPrompt()`:
- `config.prompt` (from `task.prompt` field) — injected first as the primary instruction
- `task.description` — injected as part of "## Task Information" section

In the MCP path, ChatGPT updated the task `description` with detailed agent instructions (role definition, structured output requirements, 800-word minimum). This worked because `description` IS included in the user message. But the `prompt` field is the designated agent instruction field.

### Question for Specialist
Is the current separation correct? Should agent-specific instructions live in `task.prompt` or `task.description`? Or should we document that both are valid and the LLM sees both?

---

## Summary of Proposed Changes (Awaiting Your Approval)

| # | Change | File | Lines | Token Impact |
|---|--------|------|-------|-------------|
| 1 | Remove template duplicate from user message | `agentExecutionEngine.ts` | 943-948 | Saves ~9K chars per execution |
| 2 | Remove duplicate Task Sequence Context block | `lib/agents/harness/build-agent-prompt-body.ts` (§1-§8 moved here in B1-S2; only 1 block now — likely already resolved) | §4 | Saves variable chars per execution |
| 3 | Document prompt vs description usage | Documentation only | N/A | Clarity |

---

## How to Verify These Findings

Run these grep commands to see the current state:

```bash
# Finding 1: Template in both system and user message paths
echo "=== Template in buildSystemPrompt (system prompt) ==="
grep -n "agentTemplate.*promptTemplate" lib/services/agentExecutionEngine.ts

# Finding 2: Duplicate Task Sequence Context
# NOTE (B1-S2 2026-06-09): the §1-§8 user prompt moved to lib/agents/harness/build-agent-prompt-body.ts
# (buildAgentPromptBody); the engine's buildAgentPrompt now just delegates. Grep the builder, not the engine.
echo ""
echo "=== Duplicate Task Sequence blocks ==="
grep -n "Task Sequence Context" lib/agents/harness/build-agent-prompt-body.ts

# Full prompt-body method
echo ""
echo "=== buildAgentPromptBody (the §1-§8 assembly) ==="
sed -n '/export function buildAgentPromptBody/,/^}/p' lib/agents/harness/build-agent-prompt-body.ts | head -220
```

---

## Streaming Route Check

The streaming route (`/app/api/pov/agent/execute/stream/route.ts`) has its own prompt assembly. The specialist should also check whether it has the same duplication issues:

```bash
# Check streaming route prompt construction
grep -n "promptTemplate\|buildAgentPrompt\|buildSystemPrompt\|systemPrompt\|Task Sequence" \
  app/api/pov/agent/execute/stream/route.ts
```

---

## Agent Execution Specialist Recommendations

### Recommendation 1: Remove Template Duplicate from User Message (HIGH confidence — 90%)

**Recommendation: Remove lines 943-948.**

The 3-tier priority hierarchy documented in the prompt-construction-specialist is: **Template -> User -> Universal** for the **system prompt**. The `buildSystemPrompt()` method correctly implements this. Having the template's `promptTemplate` also appear in the user message via `buildAgentPrompt()` is almost certainly unintentional — it creates ~19K chars of duplication for the Business Analyst template alone.

**Why 90% not 100%**: There's one edge case — if a provider doesn't support system prompts (e.g., a future provider where system prompt gets concatenated into the user message anyway), then removing it from the user message could lose the instructions. But our current providers (Anthropic, Gemini) both support system prompts properly, and the LLM service handles the system prompt parameter correctly.

**Token savings**: For the Business Analyst template (9,636 chars), this saves roughly 2,400 tokens per execution at ~4 chars/token.

### Recommendation 2: Remove Duplicate Task Sequence Context (HIGH confidence — 95%)

**Recommendation: Remove lines 985-998 (the second block).**

This is a copy-paste bug. The first block (964-983) is strictly more detailed — it includes parent task and subtask descriptions. The second block (985-998) is identical but without descriptions. Both execute unconditionally, producing two `## Task Sequence Context` sections in the prompt.

Keep the first block (with descriptions). The LLM benefits from having subtask context when generating output.

### Recommendation 3: Document prompt vs description Architecture (MEDIUM confidence — 80%)

**Recommendation: Both fields should be used, with clear separation of purpose.**

Current architecture:
- `task.prompt` -> Agent-specific instructions ("what to do")
- `task.description` -> Task context ("what this task is about")

Both are included in the user message, which is correct. The issue is that there's no documentation explaining this to MCP callers (ChatGPT/Claude Desktop). When ChatGPT wanted to add detailed agent instructions, it put them in `description` because that was more visible. It worked, but `prompt` is the intended field.

**Suggested documentation**: Add a comment in `buildAgentPrompt()` clarifying:
```
// config.prompt = agent instructions (from task.prompt) — "what to do"
// task.description = task context — "what this task is about"
// Both are included; prompt comes first as the primary instruction
```

### Recommendation 4: Check Streaming Route for Same Issues

The streaming route (`stream/route.ts`) has its own prompt assembly. The prompt-construction-specialist should verify whether it has the same duplication. The streaming route was written independently and may have different prompt construction logic.

---

## Action Requested

1. **Verify Finding 1**: Is the template-in-user-message duplication intentional or a bug?
2. **Verify Finding 2**: Confirm the second Task Sequence Context block is accidental
3. **Advise on Finding 3**: Document the intended relationship between `task.prompt` and `task.description`
4. **Check streaming route**: Does the streaming route have the same issues?
5. **Approve or modify proposed fixes** before the agent-execution-specialist applies them
6. **Review recommendations above** and confirm, modify, or reject each one

Once approved, the agent-execution-specialist will apply the fixes and update the discovery prompt and specialist knowledge accordingly.

---

## How to Invoke This Review

```
Please use the prompt-construction-specialist to review the findings in:
/.claude/knowledge/prompts/prompt-construction-audit-continuation.md

The agent-execution-specialist found two duplication issues and an architecture
question in the prompt construction pipeline. I need your expert opinion before
we apply any fixes.
```
