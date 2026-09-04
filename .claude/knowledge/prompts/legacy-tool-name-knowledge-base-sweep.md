# Legacy Tool Name Knowledge Base Sweep — Agent Team Prompt

## Context

This is a continuation of a multi-session legacy MCP tool name sweep (Mar 2026).
The consolidation mapped 22 legacy tools to 6 consolidated tools + 4 standalone.

**Already completed** (6 commits pushed):
- All production code (`lib/`, `app/`) — clean
- All active scripts — clean
- All test files — updated
- All seed scripts — updated
- All shell scripts — updated
- All 18 agent configs (`.claude/agents/`) — clean
- All 11 discovery files (`.claude/knowledge/discoveries/`) — clean
- Tool Name Audit Taxonomy created and registered as Pattern #45 (97% confidence)

**Remaining**: ~84 knowledge base files across 5 directories (~1650 refs total).

## Instructions

Create an agent team with 5 teammates to sweep legacy MCP tool names from
the knowledge base. Each teammate owns one directory with no file overlap:

1. **prompts-sweeper**: `.claude/knowledge/prompts/` (24 files, ~566 refs)
2. **domain-sweeper**: `.claude/knowledge/domain/` (40 files, ~859 refs)
   - Skip `tool-name-audit-taxonomy.md` (documents the mapping itself)
   - Skip `tool-architecture-reference.md` LEGACY_TOOL_MAP section (documents the mapping)
3. **protocols-sweeper**: `.claude/knowledge/protocols/` (6 files, ~80 refs)
4. **patterns-sweeper**: `.claude/knowledge/patterns/` (11 files, ~115 refs)
   - Skip `PATTERN-REGISTRY.md` taxonomy entry (documents the mapping)
5. **guides-sweeper**: `.claude/knowledge/guides/` (3 files, ~30 refs)

Each teammate should:

1. Read `/.claude/knowledge/domain/mcp/tool-name-audit-taxonomy.md` first for the full mapping and rules
2. Use this consolidation mapping for all replacements:

### Tool Consolidation Mapping

| Legacy Name | Consolidated Syntax | Internal Dotted |
|-------------|-------------------|-----------------|
| `list_povs` | `project(action: "pov.list")` | `project.pov_list` |
| `get_pov_details` | `project(action: "pov.details")` | `project.pov_details` |
| `list_tasks` | `project(action: "task.list")` | `project.task_list` |
| `get_task_context` | `project(action: "task.context")` | `project.task_context` |
| `execute_task_action` | `perform(action: "execute")` | `perform.execute` |
| `agent_results` | `perform(action: "agent_results")` | `perform.agent_results` |
| `get_ai_recommendations` | `analytics(action: "recommendations.get")` | `analytics.recommendations_get` |
| `analyze_team_performance` | `analytics(action: "team.performance")` | `analytics.team_performance` |
| `list_agent_templates` | `template(action: "list")` | `template.list` |
| `get_agent_template_details` | `template(action: "details")` | `template.details` |
| `discover_services` | `services(action: "discover")` | `services.discover` |
| `call_service` | `services(action: "call")` | `services.call` |
| `get_service_health` | `services(action: "health")` | `services.health` |
| `execute_workflow` | `services(action: "workflow.execute")` | `services.workflow_execute` |
| `get_workflow_status` | `services(action: "workflow.status")` | `services.workflow_status` |
| `cancel_workflow` | `services(action: "workflow.cancel")` | `services.workflow_cancel` |
| `list_workflow_executions` | `services(action: "workflow.list")` | `services.workflow_list` |
| `register_service` | `registry(action: "register")` | `registry.register` |
| `list_my_services` | `registry(action: "list")` | `registry.list` |
| `update_service` | `registry(action: "update")` | `registry.update` |
| `delete_service` | `registry(action: "delete")` | `registry.delete` |
| `get_service_tools` | `registry(action: "tools")` | `registry.tools` |

### Service Name Consolidation

| Legacy Service | Consolidated Service |
|---------------|---------------------|
| `paichart-pov-service` + `paichart-task-service` | `paichart-project-service` |

### Exceptions (DO NOT change)

- **Grep commands that search FOR legacy names** as audit/detection tools — KEEP them
- **Prompt names**: `list_tasks_guided`, `agent_results_guide`, `mcp_list_tasks_guided` are prompt names, NOT tool names
- **LEGACY_TOOL_MAP documentation** — documents the mapping itself
- **Historical context**: When noting what was consolidated, prefix with "legacy" or "consolidated from", e.g., `(consolidated from legacy execute_task_action)`

### Context-Sensitive Replacement Guide

- **In checklists**: `- [ ] Test call_service tool` → `- [ ] Test services(action: "call") tool`
- **In grep commands**: `grep "call_service"` → `grep "services.*call"` (unless it's an audit grep searching FOR legacy names)
- **In curl/JSON-RPC**: `"name":"call_service"` → `"name":"services","arguments":{"action":"call"}`
- **In descriptions**: `the call_service handler` → `the services(action: "call") handler`
- **In tables**: `| call_service | ...` → `| services.call | ...`
- **In code blocks**: Match the surrounding context (user-facing vs internal notation)

3. Report when done: files changed, refs updated, any items skipped with reason

Wait for all teammates to finish, then:
- Run `git diff --stat` to summarize changes
- Stage all changed files
- Commit with message:
  ```
  fix(mcp): sweep legacy tool names from knowledge base (agent team)

  5 parallel teammates swept legacy tool names from:
  - prompts/ (24 files)
  - domain/ (40 files)
  - protocols/ (6 files)
  - patterns/ (11 files)
  - guides/ (3 files)

  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
  ```
- Push to origin
