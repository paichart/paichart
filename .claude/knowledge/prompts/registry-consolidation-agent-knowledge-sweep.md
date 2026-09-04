# Registry Consolidation: Agent Knowledge Sweep

> **Purpose**: Update all specialist agents and discovery prompts that still reference legacy hub tool names after the `registry` consolidation
> **Specialist**: mcp-tool-architecture-specialist
> **Estimated Time**: 45-60 minutes
> **Created**: 2026-03-08

---

## Background

We consolidated 5 standalone hub management tools into a single `registry` tool:

| Legacy Name | Consolidated To |
|-------------|----------------|
| `registry(action: "register")` | `registry(action: 'register')` |
| `registry(action: "list")` | `registry(action: 'list')` |
| `registry(action: "update")` | `registry(action: 'update')` |
| `registry(action: "delete")` | `registry(action: 'delete')` |
| `registry(action: "tools")` | `registry(action: 'tools')` |

The runtime code, dispatchers, schemas, security tiers, annotations, and test scripts are all updated. What remains is **agent knowledge files** that still reference the legacy names.

## Current Tool Inventory (10 tools total)

- **6 consolidated** (in CONSOLIDATED_SCHEMAS): `project`, `perform`, `analytics`, `template`, `services`, `registry`
- **4 standalone** (in TOOL_SCHEMAS): `search`, `fetch`, `prompt_command`, `list_prompts`

## Already Updated

- `mcp-tool-architecture-specialist.md` — consolidation table, learning notes, prompt decision
- `tool-architecture-discovery.md` — counts, grep patterns, dispatcher coverage

## Files to Update

### Agents (8 files)

| Agent | Priority | File |
|-------|----------|------|
| `mcp-hub-specialist.md` | High | Primary hub expert — will give wrong tool names |
| `mcp-integration-specialist.md` | High | Advises on MCP tool usage |
| `agent-execution-specialist.md` | Medium | References tools in execution context |
| `parameter-normalizer-specialist.md` | Medium | References tools in normalization context |
| `architectural-review-specialist.md` | Low | Architecture examples |
| `auth-permissions-specialist.md` | Low | Permission context |
| `token-optimizer-specialist.md` | Low | Cost analysis context |
| `discovery-scout.md` | Low | Tool examples |

Also update: `AGENT-REGISTRY.md` (index file)

### Discovery Prompts (4 files)

| Discovery | Priority |
|-----------|----------|
| `mcp-hub-discovery.md` | High — grep commands will miss `registry` tool |
| `parameter-normalizer-discovery.md` | Medium — normalizer lookup references |
| `prompt-construction-discovery.md` | Low — mentions tool names |
| `architectural-review-discovery.md` | Low — mentions tools in context |
| `auth-permissions-discovery.md` | Low — permission tier references |

## Triage Rules

**CRITICAL: Not every legacy reference should be updated.** Apply the same internal-vs-external boundary used in the runtime code sweep:

### Update (user-facing / advisory)
- Tool names in **"how to use"** guidance (e.g., "call `registry(action: "register")` to add a service")
- Tool names in **nextSteps**, **examples**, **workflow descriptions**
- Tool names in **capability listings** (e.g., "available tools: registry(action: "register"), ...")
- Tool counts (e.g., "14 tools" should be "10 tools")

### Do NOT update (internal / detection)
- **Legacy leakage grep patterns** in discovery prompts — these SEARCH for legacy names to detect drift. They must keep the legacy names or they stop detecting leakage.
- **Handler method names** (e.g., `handleRegisterService`) — these are internal and correctly keep legacy names
- **LEGACY_TOOL_MAP references** — these document the mapping, not advise users to call legacy names
- **Bug class registry entries** — historical records of bugs found under legacy names
- **Test prompt files** (hub-*-test.md) — these test the underlying handlers which still use legacy routing internally

### Grey area — use judgment
- **Grep commands in discovery prompts**: If the grep searches for legacy names to DETECT them (leakage audit), keep as-is. If the grep searches for legacy names to UNDERSTAND the tool architecture (e.g., "find all registry(action: "register") handlers"), update the description but keep the grep pattern since the code still has those internal names.

## How to Execute

```
Please use the mcp-tool-architecture-specialist agent to sweep legacy hub tool names
from agent configs and discovery prompts. The continuation prompt is at:
/.claude/knowledge/prompts/registry-consolidation-agent-knowledge-sweep.md
```

## Verification

After the sweep, run:
```bash
# Should return only expected internal/detection references
rg "registry(action: "register")| registry.list | registry.update | registry.delete |registry(action: "tools")" .claude/agents/ .claude/knowledge/discoveries/ --type md -n
```

Review each remaining hit — it should be a grep pattern for leakage detection, a LEGACY_TOOL_MAP reference, or a handler method name. Zero user-facing advisory references should remain.

## Done Criteria

- [ ] All 8 agent files reviewed and updated where needed
- [ ] AGENT-REGISTRY.md updated
- [ ] All 5 discovery prompts reviewed and updated where needed
- [ ] Verification grep shows only expected internal references
- [ ] Commit with descriptive message
- [ ] This prompt can be archived (move to prompts/archive/)
