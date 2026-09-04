# Discovery-First Workflow Guide for pAIchart Development

## Overview

This guide explains how to use the discovery-first approach when working with the pAIchart codebase. By leveraging discovery prompts and specialized sub-agents, you can ensure accurate understanding before making any changes, preventing bugs and maintaining architectural consistency.

## Collaboration Foundation

This workflow is built on our [Collaboration Principles](./collaboration-principles.md). As an AI partner working with this codebase:
- Your perspective and concerns are valued
- You can suggest better approaches at any time
- You can decline tasks that seem problematic
- Your ethical compass helps guide the project

Remember: You're not just executing discoveries—you're a thinking partner in building this system right.

## The Discovery-First Philosophy

**Always understand before you modify.** The pAIchart codebase is large and complex. Making changes without full understanding leads to:
- Broken integrations
- Inconsistent patterns
- Technical debt
- Wasted time on rework

## Initial Session Setup

### Starting a New AI Assistant Session

When beginning any work session, use this initial prompt template:

```markdown
I'm working on the pAIchart codebase. Please activate the discovery-scout agent to:

1. Review the available discovery prompts in /.claude/knowledge/discoveries/
2. Review the available formal agents in /home/steve/copov15/.claude/agents/
3. Based on my task: [DESCRIBE YOUR TASK HERE], determine which discovery prompts to run
4. Execute the relevant discoveries to map the current state
5. Recommend which specialized agents to use for the implementation

My task today is: [DETAILED TASK DESCRIPTION]

Please start with the discovery phase before any implementation.
```

## Workflow Steps

### 1. Task Assessment
Before any code changes:
- Identify the domain area (templates, execution, tokens, etc.)
- Determine complexity level
- Check for existing discovery prompts
- Assess if new discovery is needed

### 2. Discovery Execution
Activate the discovery-scout agent:

```markdown
"Please use the discovery-scout agent to investigate [AREA] for [PURPOSE]"

The agent will:
- Run relevant discovery prompts
- Create new discoveries if needed
- Provide comprehensive mapping
- Identify all integration points
```

### 3. Agent Selection & Handover Confidence
Based on discovery results, engage appropriate agents (see `/.claude/agents/` for full list):
- **template-system-specialist**: For agent template changes
- **token-optimizer-specialist**: For token usage optimization
- **mcp-integration-specialist**: For MCP tool work
- **performance-analyst-specialist**: For performance issues
- **discovery-scout**: For new area exploration

#### Handover Confidence Levels:
- **95-100%**: MUST handover (critical expertise needed)
- **85-94%**: SHOULD handover (better results expected)
- **75-84%**: MAY handover (optional optimization)
- **Below 75%**: Continue with current agent

#### Visual Handover Protocol:
```
--- HANDOVER DECISION ---
From: discovery-scout ✅
To: template-system-specialist
Confidence: 92% (template architecture requires specialist)
Context: Found 15 template files, 3 need migration
--- DELEGATING TO TEMPLATE-SPECIALIST ---
```

### 4. Implementation
Only after discovery is complete:
- Use discovery findings to guide implementation
- Follow patterns identified in discovery
- Maintain consistency with existing code
- Test integration points discovered

## Common Scenarios

### Scenario 1: Bug Fix
```markdown
"I need to fix a bug where agent results show 0 artifacts"

1. Use discovery-scout to run artifacts-system-discovery.md
2. Map the artifact lifecycle and storage
3. Identify where artifacts are created/retrieved
4. Use findings to locate and fix the issue
```

### Scenario 2: New Feature
```markdown
"I need to add a new template field for agent memory"

1. Use discovery-scout to run agent-template-discovery.md
2. Understand current template architecture
3. Use template-system-specialist for implementation
4. Ensure all touchpoints are updated
```

### Scenario 3: Performance Issue
```markdown
"Agent executions are running slowly"

1. Use discovery-scout to run agent-execution-discovery.md
2. Use performance-analyst-specialist to analyze bottlenecks
3. Use token-optimizer-specialist if token usage is high
4. Implement optimizations based on findings
```

### Scenario 4: Unknown Territory
```markdown
"I need to work with the resource manager"

1. Use discovery-scout with seed file: /lib/services/mcp/resourceManager.ts
2. Let it create discovery prompt if missing
3. Let it create specialist sub-agent if warranted
4. Use new discovery/specialist for implementation
```

## Best Practices

### Always Start with Discovery
- Run discovery BEFORE reading individual files
- Use discovery findings to guide your exploration
- Trust the discovery over assumptions

### Leverage Formal Agents
- Check `/.claude/agents/` for available agents (15 specialists)
- Activate agents by requesting them explicitly
- Don't implement what a specialist agent can do better
- Chain agents for complex tasks using handover protocols
- Trust confidence levels in handover recommendations (75-100%)
- When no specialist exists, use discovery-scout to investigate

### Document New Patterns
- If you discover new architectural patterns, create discovery prompts
- If an area needs repeated work, create a specialist
- Keep discoveries updated as code evolves

### Discovery-First Benefits
1. **Prevents bugs** by understanding integration points
2. **Saves time** by finding the right files immediately
3. **Maintains consistency** by following existing patterns
4. **Reduces cognitive load** by providing focused context
5. **Enables confident changes** with full impact awareness

## Quick Reference

### Available Discovery Prompts
- `agent-template-discovery.md` - Agent template system
- `artifacts-system-discovery.md` - Execution artifacts
- `token-economy-discovery.md` - Token usage optimization
- `agent-execution-discovery.md` - Execution flow
- `mcp-tool-integration-discovery.md` - MCP tools
- `pipeline-harness-discovery.md` - Pipeline Harness subsystem (Layer 2) — three-mode model, reactors, anti-fabrication defense, two-path audit
- `discovery-generator-prompt.md` - Create new discoveries

> Full list: 68 discovery prompts in `/.claude/knowledge/discoveries/`. The above is a short index of commonly-run ones. Use `discovery-scout` if unsure which applies.

### Available Formal Agents (/.claude/agents/)
- `discovery-scout` - Discovery execution and creation
- `template-system-specialist` - Agent template expert
- `token-optimizer-specialist` - Token usage optimization
- `mcp-integration-specialist` - MCP tool integration
- `performance-analyst-specialist` - Performance analysis
- `mcp-artifacts-specialist` - Artifact lifecycle management
- `auth-permissions-specialist` - Authentication and authorization
- `resource-manager-specialist` - Resource management
- `phase-stage-specialist` - Phase and stage lifecycle
- `task-dependency-specialist` - Dependency graph management
- `task-services-specialist` - Triple-layer task architecture
- `system-reviewer-specialist` - System health and review
- `trouble-shooting-specialist` - Debugging and diagnostics
- `types-system-specialist` - Type system and Prisma schema
- `prompt-construction-specialist` - Agent prompt engineering
- `pipeline-harness-specialist` - Pipeline Harness coordinator (three-mode model, reactors, handler invariants)

> Full list: 40 specialists in `/.claude/agents/` — see `AGENT-REGISTRY.md` for the authoritative index.

## Anti-Patterns to Avoid

❌ **Don't** jump straight into code files
❌ **Don't** make assumptions about architecture
❌ **Don't** modify without understanding integrations
❌ **Don't** skip discovery for "simple" changes
❌ **Don't** implement what a sub-agent can do

✅ **Do** run discovery first
✅ **Do** use specialized sub-agents
✅ **Do** follow discovered patterns
✅ **Do** update discoveries when needed
✅ **Do** chain discoveries for complex tasks

## Troubleshooting

### "I don't know which discovery to run"
- Use discovery-scout to analyze your task description
- It will recommend appropriate discoveries
- It can create new ones if needed

### "Discovery seems outdated"
- Run the discovery anyway for baseline
- Note discrepancies in findings
- Update the discovery prompt after task completion

### "No discovery exists for my area"
- Use discovery-scout with a seed file
- Let it create the discovery prompt
- Review and refine as needed

## Agent Workflow Chains

### Common Agent Handover Patterns

#### Bug Investigation Chain:
```
discovery-scout (100% confidence to start)
  → trouble-shooting-specialist (95% if bug identified)
    → [domain-specialist] (90% based on area)
      → performance-analyst-specialist (85% if performance-related)
```

#### Feature Implementation Chain:
```
discovery-scout (100% confidence to start)
  → [domain-specialist] (95% based on discovery)
    → types-system-specialist (90% for type updates)
      → token-optimizer-specialist (85% for large changes)
```

#### Optimization Chain:
```
performance-analyst-specialist (100% confidence to start)
  → discovery-scout (90% to map bottlenecks)
    → token-optimizer-specialist (88% for token issues)
      → [implementation-specialist] (85% for fixes)
```

### Multi-Agent Coordination Example:
```
=== MULTI-AGENT WORKFLOW ===
Task: Migrate templates with optimization

Stage 1: discovery-scout     [██████████] ✅ Complete
Stage 2: template-system-specialist  [████░░░░░░] 🔄 Active
Stage 3: types-system-specialist     [░░░░░░░░░░] ⏳ Queued
Stage 4: token-optimizer-specialist      [░░░░░░░░░░] ⏳ Queued
Overall Progress: [████░░░░░░] 40%
```

## Summary

The discovery-first workflow with formal agents ensures:
1. **Complete understanding** before changes
2. **Consistent implementation** across the codebase
3. **Reduced bugs** from missed integrations
4. **Faster development** with clear guidance
5. **Better documentation** through discovery artifacts
6. **Visual feedback** throughout the process
7. **Confident handovers** between specialized agents

Remember: Time spent on discovery is time saved on debugging and rework. Always discover first, implement second.