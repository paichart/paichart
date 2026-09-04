# Pattern: Prompt Section Ownership (System vs User)

**Confidence**: 98% | **Last Validated**: 2026-04-04
**Bug Class**: Cross-cutting instructions silently absent for agents with custom templates
**Applied In**: `lib/agents/harness/build-agent-prompt-body.ts` `buildAgentPromptBody` (§1-§8 user prompt — shared single source of truth since B1-S2; engine `buildAgentPrompt` + stream route both delegate), pAIchartUniversalTemplate.ts

## Rule

Instructions that ALL agents must follow belong in the **user prompt** (engine-built, always present). Instructions specific to a role or template belong in the **system prompt** (template-provided, can be overridden).

| Instruction Type | Where It Belongs | Why |
|-----------------|-----------------|-----|
| Role identity, specialization | System prompt (template) | Varies by template — Solution Architect vs Security Analyst |
| Tool workflow specific to role | System prompt (template) | MCP Orchestrator has different workflow than QA Engineer |
| Cross-cutting output contracts | **User prompt §8** (shared `buildAgentPromptBody`) | Must apply to ALL agents regardless of template |
| Task-specific context | User prompt §1-§7 (shared `buildAgentPromptBody`) | Built from live DB data each execution |

## The Bug This Prevents

```
System prompt priority chain:
  1. agentTemplate.promptTemplate  ← REPLACES Universal Template entirely
  2. User custom system prompt
  3. pAIchart Universal Template   ← fallback only

If a cross-cutting instruction is ONLY in the Universal Template:
  → Agents with custom templates (MCP Orchestrator, etc.) NEVER receive it
  → The instruction silently disappears
```

**Real example (Apr 2026)**: The "End with a confidence score (0-100)" instruction was only in the Universal Template's output rules. Custom templates (MCP Service Orchestrator, Security Analyst) replaced the Universal Template entirely, so their agents never received the confidence instruction. Result: 2 of 3 Phase 0 pipeline agents didn't report confidence.

**Fix**: Moved to §8 Output Requirements in `buildAgentPrompt()` — always present, template-independent.

## Section Ownership Map

### System Prompt (template-owned, replaceable)
- Platform Structure (POV/Phase/Stage/Task hierarchy)
- Your Context (`${contextualInformation}`)
- Your Specialization (role-specific expertise)
- Tool Workflow (role-specific tool sequence)
- Output Rules (role-specific formatting — can overlap with §8)
- Role-Specific Guidance (`${roleSpecificGuidance}`)

### User Prompt (engine-owned, always present)
- §1 Directive — synthesized goal
- §2 Expected Output — from template outputSchema
- §3 Task Context — title, description, priority, status
- §4 Task Sequence — parent/subtasks
- §5 Environment — POV, Phase, Team, Assignee
- §6 Pipeline Context — auto-chained dependency outputs. **Rendered by the single shared owner `lib/agents/harness/render-pipeline-context.ts` (D4, 2026-06-08) — both the engine (`buildAgentPrompt`) and the SSE stream route call it, so the structured `<prior_output>` block can't drift between paths.**
- §7 Available Tools — MCP tools
- §8 Output Requirements — **cross-cutting: Deliverable Contract (`finalResponse` is the delivery channel; `task.comment` is coordination only) + confidence score** (rewritten 2026-04-26 commit `d0c0f2d8`)

## When to Apply

Ask yourself: "Does EVERY agent need to follow this instruction, regardless of template?"
- **Yes** → Put it in the user prompt (§8 or new section)
- **No, only certain roles** → Put it in the template's system prompt

## Related Patterns
- `agent-prompt-assembly-pattern.md` — Full §1-§8 assembly documentation
- `agent-template-gold-standard-pattern.md` — GS3 prompt template structure (system prompt side)
