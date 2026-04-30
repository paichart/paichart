# Chapter 7 — Tool Consolidation: A Case Study (28 Tools → 10)

**Audience**: Engineers thinking about an MCP tool surface that's grown beyond easy comprehension — too many tools, inconsistent naming, per-request token overhead getting expensive.
**Prerequisite**: Chapter 6 (the 7-layer lifecycle) gives you the mental model. Chapters 4 and 5 are the bug classes that consolidation can incidentally make better. None are strictly required.
**Reading time**: ~13 minutes.

---

## What this chapter teaches

A walk-through of an architectural decision we made on pAIchart's MCP server in March 2026: collapsing 28 individual tools into 10 (six action-routed plus four standalone). Not a how-to — the specifics are pAIchart's. A case study, with the goal of showing what the costs and benefits looked like for one team and what trade-offs we accepted.

The chapter covers the starting point, the three forces that made consolidation worth doing, the decision criteria, the mapping itself, and the metrics we observed. It doubles as a tour of pAIchart's current tool surface — when the chapter mentions `project(action: "pov.list")`, that's a real tool you can call against the production server today.

---

## The starting point — 28 tools

In late 2025, pAIchart's MCP server exposed 28 distinct tools. Each was registered, schema'd, security-tiered, and routed individually. The naming reflected the order in which features had been added, not any consistent vocabulary. The list looked roughly like this:

```
list_povs                  list_tasks
get_pov_details            get_task_context
list_agent_templates       execute_task_action
get_agent_template_details agent_results
get_ai_recommendations     analyze_team_performance
search                     fetch
discover_services          call_service
get_service_health         execute_workflow
get_workflow_status        cancel_workflow
list_workflow_executions   register_service
update_service             delete_service
list_my_services           get_service_tools
list_browser_templates     get_browser_template_details
validate_browser_template_parameters
create_browser_automation_task
list_prompts               prompt_command
```

Each one was technically working. AI clients could call them. The surface was the result of three years of incremental feature addition — every new feature got its own tool name, and nobody had ever stopped to harmonise them.

The trouble was that the surface had three mutually-reinforcing problems.

---

## Problem 1 — Per-request token bloat

Every tool definition is sent to the AI client on every `tools/list` request. The AI client uses these definitions to decide which tool to call. That means tool definitions occupy context window space on every conversation turn.

The pre-consolidation tool definitions, fully fleshed out with the description-UX standards from Chapter 2 (`WHEN TO USE`, `EXAMPLES`, `SEE ALSO`, `WORKFLOW`), came in at roughly 700–900 tokens each. Twenty-eight of them produced approximately **22,000 tokens of overhead per turn** in pAIchart's environment.

That number is workable but expensive. On a 200,000-token model context, 22k for tool definitions alone is more than ten percent of the budget — and it's paid every turn, regardless of whether the AI client uses any of those tools that turn. Most turns don't use most tools; the budget is paying for visibility, not value.

After consolidation, ten tools (six consolidated + four standalone) at richer per-tool descriptions came in at approximately **11,000 tokens per turn** — roughly half. The reduction came from two compounding effects: fewer tools, and the actions absorbed into a single description (with shared `WHEN TO USE` and `WORKFLOW` blocks) needing less duplication of common context.

A 50% reduction on per-turn tool overhead translates directly into more space for the actual conversation. For a server with the kind of detailed descriptions Chapter 2 advocates, that mattered.

---

## Problem 2 — Naming inconsistency

Three years of unfettered naming had produced a vocabulary that AI clients struggled with. Compare:

```
list_povs           ← entity = pov, verb = list
get_pov_details     ← entity = pov, verb = get + details
execute_task_action ← entity = task, verb = execute (action passed inside)
agent_results       ← entity = agent, verb = ??? (results is a noun)
list_my_services    ← entity = services, qualifier = my, verb = list
discover_services   ← entity = services, verb = discover
```

Six tools that did roughly the same shape of thing — list / read / call / fetch — each with a different naming convention. The AI client had to memorise the right verb for each entity. Trace logs showed it routinely tried `get_povs` (plausible, didn't exist) before falling back to `list_povs`. The mistake cost a tool call per session.

The pre-consolidation surface forced AI clients to learn each tool name as a fact, not as a derivation from a pattern.

---

## Problem 3 — Permission fragmentation

Every tool had its own entry in the security tier file (Layer 2 in Chapter 6's vocabulary). When a permission decision spanned multiple operations — "admins can view agent templates AND see results of agent runs" — the rule had to be written twice, once per tool.

When an action wanted to be admin-only inside an otherwise-authenticated tool (the `pov.create` action being the canonical example), there was no clean way to express it. Either the entire enclosing tool became admin (excluding the legitimate authenticated use cases) or every authenticated user could create POVs (which was wrong).

The pre-consolidation surface conflated two different axes — *which tool you can see* and *which actions within a tool you can perform* — into one axis: tool visibility. The two-layer permission model from Chapter 6 was technically possible but uncomfortable to express on the existing surface.

---

## The decision — consolidate by entity

The three problems pointed in the same direction: a smaller number of tools, each routing to multiple actions, each named after the *entity* the actions operated on rather than any specific operation. The shape we landed on was `entity(action: "<verb>", ...)`:

```
project(action: "pov.list")
project(action: "pov.details")
project(action: "task.list")
project(action: "task.context")

perform(action: "pov.create")
perform(action: "task.create")
perform(action: "task.update")
... (13 actions total under perform)

analytics(action: "recommendations.get")
analytics(action: "team.performance")

template(action: "list")
template(action: "details")

services(action: "discover")
services(action: "call")
services(action: "health")
... (7 actions total under services)

registry(action: "register")
registry(action: "list")
... (5 actions total under registry)
```

Six consolidated tools. Each one routed by action. Plus four tools that didn't benefit from grouping (`search`, `fetch`, `prompt_command`, `list_prompts`) and were left standalone.

The decision criteria for *what to consolidate*:

- **Same entity** — all four `project` actions return data about projects (POVs and tasks). They share parameter shapes and authentication concerns.
- **Same security tier** — `template(action: "list")` and `template(action: "details")` are both ADMIN-only. Consolidating them under `template` means a single entry in the security file.
- **Action enum is small enough to be readable** — `perform` exposes thirteen actions, which is at the edge of comfortable. More than that and the description's `[WHICH ACTION DO I USE?]` block (Chapter 2 GS5) starts hurting more than helping.
- **The actions form a workflow** — `services` exposes `discover` → `call` → `health` and `workflow.execute` → `workflow.status`. The grouping reflects how an AI client actually uses these in sequence.

The decision criteria for *what to leave standalone*:

- **No natural entity to belong to** — `search` and `fetch` operate across all resource types. Routing them as `resource(action: "search")` would have been arbitrary; the standalone names are clearer.
- **A different audience** — `prompt_command` is invoked by a slash-command syntax that's specific to prompt registries; absorbing it into a consolidated tool would have obscured that.
- **Different permission model** — `list_prompts` has a partial-visibility model (non-admins see public prompts only) that didn't fit cleanly into either tier-only or per-action authorisation.

---

## The mapping

For developers familiar with the pre-consolidation surface, the migration looked like this:

| Old tool name | Current invocation |
|---|---|
| `list_povs` | `project(action: "pov.list")` |
| `get_pov_details` | `project(action: "pov.details")` |
| `list_tasks` | `project(action: "task.list")` |
| `get_task_context` | `project(action: "task.context")` |
| `execute_task_action` | `perform(action: "<sub-action>")` (no nested `action: "execute"`) |
| `agent_results` | `perform(action: "agent.results")` |
| `get_ai_recommendations` | `analytics(action: "recommendations.get")` |
| `analyze_team_performance` | `analytics(action: "team.performance")` |
| `list_agent_templates` | `template(action: "list")` |
| `get_agent_template_details` | `template(action: "details")` |
| `list_browser_templates` | `template(action: "list", category: "browser")` |
| `discover_services` | `services(action: "discover")` |
| `call_service` | `services(action: "call")` |
| `get_service_health` | `services(action: "health")` |
| `execute_workflow` | `services(action: "workflow.execute")` |
| `register_service` | `registry(action: "register")` |
| `update_service` | `registry(action: "update")` |
| `list_my_services` | `registry(action: "list")` |
| `get_service_tools` | `registry(action: "tools")` |
| `search`, `fetch`, `prompt_command`, `list_prompts` | (unchanged — left standalone) |

Browser-automation tools deserve special mention: `list_browser_templates`, `get_browser_template_details`, `validate_browser_template_parameters`, and `create_browser_automation_task` were absorbed into the agent-template surface. Browser templates are now listed via `template(action: "list", category: "browser")`; their parameters are surfaced via `template(action: "details", templateId)`; execution is via `perform(action: "agent.execute")` after `perform(action: "agent.assign")`. The browser-specific tool names are no longer exposed.

---

## The implementation — three pieces

### Tool schemas (Layer 1)

The `CONSOLIDATED_SCHEMAS` object in `lib/mcp/server/config/tool-schemas.js` holds one entry per consolidated tool. Each entry has a single Zod `inputSchema` whose first field is `action: z.enum([...])`, listing every sub-action the tool supports. Subsequent fields are the union of parameters across all sub-actions, each marked optional. The description carries the Chapter 2 GS1 form — including a `[WHICH ACTION DO I USE?]` block (GS5) that turns the action enum into a navigable decision tree.

This is the most visible schema change. From the AI client's point of view, where there used to be `list_povs` with three parameters, there is now `project` with twenty parameters — most of which apply to specific actions and are otherwise ignored. The decision-tree section of the description is what makes the tool callable in practice.

### Dispatchers (Layer 5, new)

A new file per consolidated tool sits at `lib/mcp/server/tools/dispatchers/<tool>-dispatcher.js`. Each dispatcher is a thin routing class:

```javascript
class ProjectDispatcher {
  constructor(basicTools, advancedTools) {
    this.basicTools = basicTools;
    this.advancedTools = advancedTools;
  }

  async handle(args, context) {
    const { action, ...params } = args;
    switch (action) {
      case 'pov.list':     return this.basicTools.handleListPOVs(params, context);
      case 'pov.details':  return this.basicTools.handleGetPOVDetails(params, context);
      case 'task.list':    return this.basicTools.handleListTasks(params, context);
      case 'task.context': return this.advancedTools.handleGetTaskContext(params, context);
      default:
        return { content: [{ type: 'text', text: `Unknown action: ${action}` }], isError: true };
    }
  }
}
```

No business logic. Just routing. The `perform` tool is slightly different — it binds directly to the existing `TaskActionHandler.handle()` rather than introducing a dispatcher class, because `TaskActionHandler` already routed by sub-action internally. Functionally equivalent; structurally simpler.

### Per-action handlers (Layer 4, mostly unchanged)

The handlers themselves did not move. `handleListPOVs`, `handleGetPOVDetails`, etc. continued to live in `sdk-native-basic-tools.js`. The dispatcher simply called them with the destructured parameters. This was the most important property of the migration: **no business logic moved**. If the consolidation had required rewriting handlers, the work would have been five or ten times bigger and the risk of regression correspondingly larger.

---

## The metrics — before and after

Approximate, in pAIchart's specific environment. Numbers will vary on other servers depending on description verbosity and the descriptions' adherence to Chapter 2's standards.

| Metric | Before | After | Change |
|---|---|---|---|
| Total tools registered | 28 | 10 | −18 (−64%) |
| Per-turn token overhead (tool definitions) | ~22,000 | ~11,000 | ~−50% |
| Lines in `tool-security.js` | 28 entries | 10 entries | −64% |
| Lines in `tool-annotations.js` | 28 entries | 10 entries | −64% |
| Lines in tool registration arrays (Layer 6) | ~28 | ~10 | −64% |
| Number of distinct security-tier rules | 28 | 10 (+ handler-level for action-specific) | dependency-shifted |
| AI-client tool-call accuracy on first try | (baseline) | improved (no precise metric) | qualitative |

Two things to flag about these numbers. First, the per-turn token overhead is approximate — exact counts depend on how the AI client tokenises individual tool names, descriptions, and JSON schemas, and the model's tokeniser specifics matter. Treat ~22k → ~11k as the order of magnitude in our environment; the directional 50% reduction is real but the precise figures are estimates, not measurements published from the model provider's side.

Second, the "AI-client tool-call accuracy on first try" improvement is qualitative. We observed in trace logs that the post-consolidation surface had fewer mistaken-tool-name failures (the `get_povs` vs `list_povs` problem from Problem 2) — but quantifying that would have required instrumentation we didn't add at the time. If your environment requires a precise number, instrument before you migrate.

---

## What it cost

Two things are honest to flag.

**The action enum is wide.** `perform` has thirteen actions. `services` has seven. `registry` has five. The AI client has to read the `[WHICH ACTION DO I USE?]` block in the description to pick the right one. For most cases this is fine — the block is structured as a decision tree (Chapter 2 GS5). For cases at the edges of the enum, the AI client occasionally picks an adjacent action and the call fails for the wrong reason. The fix is sharper decision-tree language; the cost is real but manageable.

**Action-specific parameters are now optional in the schema.** When `project` declares `povId` as optional (because `pov.details` requires it but `task.list` doesn't), the schema is technically permissive of nonsensical combinations like `project(action: "task.list", povId: "...", taskId: "...")`. Validation has to happen at the action-handler level, not just at schema parse time. The per-action handlers handle this — they reject calls with the wrong fields — but the *schema* is no longer an accurate description of valid combinations. For very strict tooling that derives from the schema (auto-generated documentation, parameter validators), the consolidation surfaces have to be accompanied by per-action validation schemas.

Neither cost is fatal. Both are worth knowing about before you decide.

---

## When to do this on your own server

Three signs your server might benefit from a similar consolidation:

1. **Tool definitions are eating measurable context budget.** If you can name a number for "tokens per turn used by tool definitions" and that number is more than 5–10% of your typical conversation budget, consolidation is on the table.
2. **AI clients are getting tool names wrong.** If your trace logs show repeated mistakes — calling tools that don't exist before falling back to ones that do — your naming has fragmented past what the AI client can keep straight.
3. **Permission rules are duplicated across tools.** If you find yourself writing "admin only for create operations" three times for three different create-something tools, you have a per-action authorisation problem that consolidation cleans up.

If none of these apply, you probably don't need to consolidate. The pre-consolidation surface worked. It just worked progressively worse as it grew.

---

## What's next

Chapter 8 (optional) covers the bridge from a single MCP server to a multi-service hub. Once you have a clean tool surface — whether through consolidation or because it stayed small — the next architectural question is what happens when you have several MCP servers that need to discover each other and call each other's tools. That's a hub problem.

---

## Provenance

The consolidation described here was carried out in March 2026 (Part 1 — embedded server, March 6; Part 2 — protocol server, March 7). The plan documents are in `.claude/knowledge/domain/mcp/tool-consolidation-plan.md`, `.claude/knowledge/domain/mcp/tool-consolidation-part2-plan.md`, and `.claude/knowledge/domain/mcp/tool-consolidation-embedded-completion.md`. The post-consolidation reference is `.claude/knowledge/domain/mcp/tool-architecture-reference.md` (v2.0).

- pAIchart Hub overview: <https://paichart.app>
- Source repository: <https://github.com/paichart/paichart>

---

## License

This chapter is published under [Creative Commons Attribution 4.0 International (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/). You are free to share and adapt the material with attribution.
