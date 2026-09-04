# mcp-tool-architecture-specialist — Domain Library

> **Created 2026-06-11** (Protocol 12 soft-band trim). Depth evicted from the agent file; verbatim;
> the paired discovery's proven greps outrank this file.

## [evicted] Core Knowledge and Expertise

### 1. Two-Tier Schema System

The tool system uses two schema objects in `lib/mcp/server/config/tool-schemas.js`:

- **CONSOLIDATED_SCHEMAS** (6 tools): `project`, `perform`, `analytics`, `template`, `services`, `registry`
  - Action-based routing via `action` parameter
  - Zod schemas with enums for valid actions
  - These are the ONLY tool names exposed to external clients

> ⚠ **Shared-param-bag collision risk (consolidation hazard, 2026-06-09).** A consolidated tool flattens ONE
> param bag across all its actions, so a shared `z.enum` param is read by MULTIPLE handlers — and its allowed
> values MUST be the **UNION** of what every consuming action reads, or the schema silently rejects valid input
> for some actions. Canonical: `perform.format` was `['json','csv','markdown','html']` (an analytics-export idea
> NO handler consumed) which **rejected** the `'summary'|'detailed'|'raw'` that `agent.results` actually reads —
> `detailed`/`raw` were unreachable until fixed (fcf0947a). **When adding/changing any consolidated enum param,
> audit EVERY action that reads it (schema enum values vs handler reads) — see the audit grep in
> tool-architecture-discovery.** Two non-bugs to know: a param read as `a || b` across actions is an
> *intentional alias* (e.g. `analyticsType || analysisType`, Claude Desktop compat — NOT a collision); a value
> the schema offers but every handler routes to an `else` default (e.g. `position:'middle'`) is a benign
> schema-vs-behavior gap, not a reject. 2026-06-09 audit: `perform`'s only live collision (format) is fixed;
> re-audit when a NEW action joins a consolidated tool.

- **TOOL_SCHEMAS** (4 non-consolidated tools): `search`, `fetch`, `prompt_command`, `list_prompts`
  - Individual tools that weren't part of the 22->6 consolidation
  - Each has its own Zod schema

**Schema lookup priority** (embedded-server.ts):
```typescript
const schema = CONSOLIDATED_SCHEMAS[toolName] || TOOL_SCHEMAS[toolName];
```

**Tool capability exposure** (mcp-server-v5.js `getToolCapabilities()`):
- Must iterate BOTH `CONSOLIDATED_SCHEMAS` and `TOOL_SCHEMAS`
- Converts Zod schemas to JSON Schema via `convertZodToJsonSchema()`
- Filtered by `getToolsForUser()` based on security tier

**Key Files**:
- `lib/mcp/server/config/tool-schemas.js` - Schema definitions (CONSOLIDATED_SCHEMAS + TOOL_SCHEMAS)
- `mcp-server-v5.js:getToolCapabilities()` - Exposes schemas to clients
- `lib/mcp/embedded-server.ts` - Embedded server schema lookup

### 2. Internal vs External Tool Names

**Critical concept**: External clients see 6 consolidated tool names. Internally, handler functions keep descriptive method names. This is intentional architecture, not technical debt.

| Layer | Uses Consolidated Names | Uses Legacy Names |
|-------|------------------------|-------------------|
| Client-facing tool list | YES (`project`, `perform`, etc.) | NO |
| `_meta.tool` in responses | YES | NO (bug if legacy) |
| `nextSteps` / guidance text | YES | NO (bug if legacy) |
| Handler function names | NO | YES (`handleListPOVs`, etc.) |
| `toolHandlers.set()` keys (mcp-server-v5) | YES (`project`, `perform`, etc.) | NO (cleaned Mar 2026) |
| `toolHandlers.set()` keys (basic/advanced) | YES (`project.pov_list`, `template.list`, etc.) | NO (cleaned Mar 2026) |
| Performance timing IDs | YES (`sdk_native_project`, etc.) | NO (cleaned Mar 2026) |
| Rate limit keys | YES (`perform:${userId}`) | NO (cleaned Mar 2026) |
| Parameter normalizer keys | YES (`normalizeForTool('project', args)`) | NO (cleaned Mar 2026) |
| LEGACY_TOOL_MAP entries | Both (mapping old->new) | Both |
| InternalServiceRouter | Both (backward-compat for workflow data) | Both (intentional) |

**Rule**: All code references (user-facing AND internal) use consolidated names, except handler method names and InternalServiceRouter backward-compat entries.

### 3. Dispatcher Architecture

Five dispatchers route consolidated tool names to legacy handler functions:

| Dispatcher | File | Consolidated Tool | Actions | Delegates To |
|-----------|------|------------------|---------|-------------|
| ProjectDispatcher | `lib/mcp/server/tools/dispatchers/project-dispatcher.js` | `project` | `pov.list`, `pov.details`, `task.list`, `task.context` | basicTools + advancedTools |
| AnalyticsDispatcher | `lib/mcp/server/tools/dispatchers/analytics-dispatcher.js` | `analytics` | `recommendations.get`, `team.performance` | advancedTools |
| TemplateDispatcher | `lib/mcp/server/tools/dispatchers/template-dispatcher.js` | `template` | `list`, `details` | basicTools |
| ServicesDispatcher | `lib/mcp/server/tools/dispatchers/services-dispatcher.js` | `services` | `discover`, `call`, `health`, `workflow.execute`, `workflow.status`, `workflow.cancel`, `workflow.list` | hubTools |
| RegistryDispatcher | `lib/mcp/server/tools/dispatchers/registry-dispatcher.js` | `registry` | `register`, `list`, `update`, `delete`, `tools` | hubTools |

**Special case**: `perform` has NO dispatcher. It binds directly to `advancedTools.handleExecuteTaskAction()` which itself routes by action parameter via `TaskActionHandler.handle()`.

**Perform Three-Tier Fallback (Mar 2026, updated Apr 8 2026)**: The `perform` tool uses a three-tier dispatch pattern inside `task-action-handler.js`:
- **Tier 1**: Direct in-process call via `router-bridge.js` → `tasks-action-router.ts`. **Now active in BOTH `paichart-web` AND `paichart-mcp`** since Phase 2 proper Apr 8 2026 registered ts-node + tsconfig-paths in `mcp-server-http-clean.js` (pre-Phase-2 the MCP process silently fell back to Tier 2 because the bridge `require()` was wrapped in try/catch and ts-node wasn't registered — this was the trigger for the Bug Class 73 eradication workstream; see bug-class-registry.md #73)
- **Tier 2**: Authenticated HTTP via `apiClient.post` with user's JWT (residual fallback, should be dead path in practice — if it fires, check pid logs for `tier:'http-fallback'`)
- **Tier 3**: Fail-closed throw (no direct path AND no token — prevents admin auth fallback)

**Perform action routing**: Unlike dispatchers which have per-action `case` statements, `perform` routes ALL 14 actions (since 2026-05-15, `8bb6915a` added `pov.update`) through the same three-tier dispatch generically. Only 4 actions have special pre-processing BEFORE the three-tier call:
- `pov.create` — rate limiting check
- `stage.create` / `task.create` — parameter hoisting for API compatibility
- `agent.execute` — fire-and-forget dispatch + poll-and-return loop (polls `agent.status` every 5s, max 180s, then fetches `agent.results`)

The remaining 10 actions (`pov.update`, `task.update`, `task.assign`, `task.complete`, `task.comment`, `agent.configure`, `agent.assign`, `agent.status`, `agent.results`, `analytics.generate`) flow through `routeAction(action, params)` or `apiClient.post()` with zero special handling.

**Why `perform` is NOT a dispatcher (architectural decision)**: The dispatchers are thin routers — each `case` delegates to a separate handler method. `perform` is fundamentally different: the three-tier fallback IS the business logic, shared by all 14 actions. A dispatcher would dispatch everything to... itself. The `routeAction`/`apiClient`/`tokenPayload` setup is shared state built once per call and cannot be split across separate handler methods. The architecture is proven and correct.

**When to reconsider**: If LLM tool-call accuracy degrades due to the 14-action `z.union` schema overload, consider splitting `perform` into domain-specific tools (`task`, `agent`, etc.) with a shared three-tier infrastructure module. This is a maintainability/LLM-accuracy improvement, not a correctness fix. ~4-6 hours, breaks Claude Desktop user muscle memory.

Same three-tier pattern applied to `agent-results-handler.js` and `team-performance-handler.js`. Shared utility `build-token-payload.js` maps MCP context to `TokenPayload` with role enum validation and empty-string guards. The `router-bridge.js` is a JS→TS bridge — **since Phase 2 proper Apr 8 2026 it loads cleanly in both PM2 workers** because ts-node is registered in `server.js` (paichart-web) AND `mcp-server-http-clean.js` (paichart-mcp). Both workers log `tier:'direct'` at startup.

**Token forwarding pattern**: All three-tier handlers and Context-Enriched handlers rely on the Identity-Preserving Token Forwarding Pattern (`/.claude/knowledge/patterns/identity-preserving-token-forwarding-pattern.md`, 96% confidence). The full chain: `req.user.token` → `sessionContext` → `MCPCoreManager.processRequest` (at `lib/mcp/server/mcp-core.ts` — Wave 7 Phase 7.2 extracted from server-class `processMCPRequest`) → `setUserContext` → `resolveUserContext` (mcp-server-v5.js) → dispatcher → handler → `ContextEnricher` → `apiClient`. Token loss at any boundary causes 401 errors. RS256 MCP tokens have 15-minute TTL.

**Protocol server wrapping** (mcp-server-v5.js):
```javascript
this.toolHandlers.set('project', async (args, context) => {
  const userContext = resolveUserContext(context, 'project');
  return projectDispatcher.handle(args, userContext);
});
```

### 4. Tool Consolidation Mapping (22 -> 6 + 4 standalone = 10 total)

The consolidation mapped 22 legacy tools to 6 consolidated tools. 4 standalone tools remain unconsolidated:

| Consolidated | Legacy Tools Replaced |
|-------------|----------------------|
| `project` | `list_povs`, `get_pov_details`, `list_tasks`, `get_task_context` |
| `perform` | `execute_task_action`, `agent_results` |
| `analytics` | `get_ai_recommendations`, `analyze_team_performance` |
| `template` | `list_agent_templates`, `get_agent_template_details` |
| `services` | `discover_services`, `call_service`, `get_service_health`, `execute_workflow`, `get_workflow_status`, `cancel_workflow`, `list_workflow_executions` |
| `registry` | `register_service`, `list_my_services`, `update_service`, `delete_service`, `get_service_tools` |

| Standalone (not consolidated) | Reason |
|-------------------------------|--------|
| `search` | Single-purpose, no related tools to group |
| `fetch` | Single-purpose, no related tools to group |
| `prompt_command` | Special interception logic; different handler system from list_prompts |
| `list_prompts` | DB-heavy discovery; different handler system from prompt_command |

### 5. LEGACY_TOOL_MAP (Critical Sync Point)

LEGACY_TOOL_MAP exists in **3 locations** that MUST stay in sync:

1. `lib/services/agentExecutionEngine.ts` (~line 398) - Maps legacy tool names in agent mcpContext
2. `app/api/pov/agent/execute/stream/route.ts` (~line 264) - Maps legacy tool names in SSE streaming
3. `scripts/migrate-mcp-tool-names.ts` (~line 23) - Database migration script

**When adding a new tool or changing mappings**: Update ALL 3 locations or you create a silent regression.

### 5b. ⚠️ CRITICAL: Action Allowlists (Phantom-Canonical Sibling Drift Trap — UPGRADED INVENTORY 2026-05-16)

**The MCP `perform` action allowlist exists in TEN sites across FIVE files.** The original entry here (2026-05-15) cited 3 sites; the post-deploy audit (mcp-tool-architecture + mcp-hub specialists, 2026-05-16) found the real count is 10. **ALL TEN must stay in sync** when adding any new MCP action.

**The 10 sites** (severity if drifted):

| # | File:Line | Role | Severity |
|---|-----------|------|----------|
| 1 | `lib/validation/mcp-action-validation.ts:188` `ALLOWED_MCP_ACTIONS` | REST entry validation | P0 |
| 2 | `lib/validation/mcp-action-validation.ts:267+` `MCPParameterSchemas` keys | Router safeParse lookup | P0 |
| 3 | `lib/mcp/server/config/tool-schemas.js:206` perform action enum | LLM tool surface | P0 |
| 4 | `lib/mcp/server/tools/advanced/task-action-handler.js:150` `validActions` | Both-transport handler gate | P0 |
| 5 | `lib/mcp/tasks/action/tasks-action-router.ts` switch cases | Router dispatch | P0 |
| 6 | `lib/services/mcp/recommendation-action-mapper.ts:59` `PERFORM_ACTIONS` | Recommendation routing | **P1 — silent no-op** |
| 7 | `lib/services/mcp/recommendation-action-mapper.ts:67` `HIGH_RISK_ACTIONS` | Approval gating | **P1** |
| 8 | `lib/mcp/tasks/action/utilities/mcp-logging.ts:21` `ACTION_SERVICE_MAP` | Logging routing | P2 |
| 9 | `lib/mcp/tasks/action/utilities/mcp-logging.ts:62` action→verb map | Activity logging | P2 |
| 10 | `lib/mcp/server/tools/advanced/error-helpers.js:19` `TASK_ACTIONS` | "Did you mean" suggestions | P2 |

**Failure cases discovered**:
- 2026-05-15 deploy smoke caught a P0 missing site #4 (`task-action-handler.js`); hotfix `9a342f73`
- 2026-05-16 audit caught P1 missing sites #6 + #7 (`recommendation-action-mapper.ts`); silent no-op on recommendation-implementation path; hotfix in same commit as this audit
- 2026-05-16 audit caught P2 missing site #10 (`error-helpers.js`); hotfix in same commit

**Detection grep** (mandatory when reviewing any plan/PR that adds an MCP action):
```bash
grep -rn "'<your.new.action>'" \
  lib/validation/mcp-action-validation.ts \
  lib/mcp/server/config/tool-schemas.js \
  lib/mcp/server/tools/advanced/task-action-handler.js \
  lib/mcp/server/tools/advanced/error-helpers.js \
  lib/mcp/tasks/action/tasks-action-router.ts \
  lib/mcp/tasks/action/utilities/mcp-logging.ts \
  lib/services/mcp/recommendation-action-mapper.ts
```

Each file should produce ≥1 hit. Zero hits = drifting site = future silent-failure bug.

**Why both audits in parallel matter**: the first deploy-smoke discovery (2026-05-15) caught the P0 path. The next-day specialist audit caught the P1+P2 paths because they sit on DIFFERENT execution paths (recommendation implementation, fuzzy-error suggestion) that the deploy smoke doesn't exercise. Lesson: smoke tests catch what they exercise; cross-domain audits catch what smoke doesn't reach.

**Public spec note**: `gold-standards-spec.md` GS14 v1.1 cited "3-location allowlist" — that count was wrong and is being amended to v1.2 with the full 10-site inventory.

### 5c. GS14 Dispatch-Boundary safeParse (Phase 1, May 15-16 2026)

Yesterday's pov.update bypass was not a one-off. Pre-Phase-1, **5 of 6 consolidated tools had no dispatch-boundary safeParse** — only `perform` (via `tasks-action-router.ts:76`) actually ran the schema. The fix landed across all 5 dispatchers (project/analytics/template/services/registry) plus the workflow handler.

**Canonical entry**: `lib/mcp/server/tools/dispatchers/dispatch-with-schema.js` exports `validateDispatchArgs(toolName, args)` (calls `CONSOLIDATED_SCHEMAS[toolName].inputSchema.safeParse(args)`, throws on lookup miss — config-drift defense, Phase 1 smoke test #15) AND `wrapWithSchema(toolName, handler)`.

**Universal lookup** (re-proven 2026-06-11 — Phase 1.5 lifted enforcement to the REGISTRATION sites, so the old "12 hits inside dispatchers" expectation is dead):
```bash
grep -c "wrapWithSchema('" lib/mcp/embedded-server.ts   # expect 6 (all consolidated tools incl. perform, b89078b5)
grep -c "wrapWithSchema('" mcp-server-v5.js             # expect 7 (6 consolidated + prompt_command; added f63c92b3)
grep -rln "validateDispatchArgs" lib/mcp/server/tools/dispatchers/*.js | grep -v dispatch-with-schema   # expect EMPTY (Phase 1.5)
grep -c "WorkflowHandlerInputSchema" lib/mcp/server/tools/hub/workflow-tools-handler.js   # expect 5 (its OWN L3 schema — it never used validateDispatchArgs at any commit)
```
A consolidated tool registered WITHOUT `wrapWithSchema` at either server = GS14 bypass = P0 finding (precedent: f63c92b3 — 6 tools missed at mcp-server-v5.js while embedded had them).

**Why this is the chokepoint**: it removes the feature-flag dependency from the old `mcp-server-v5.js` smartErrorRecovery-gated path (validation previously only ran when `smartErrorRecovery` was enabled). After Phase 1/1.5, dispatch-boundary safeParse runs unconditionally at registration.

Smoke test contract: `scripts/test-mcp-phase1-smoke.ts` has 106 numbered tests as of 2026-06-11 (was 77 at Phase 1) covering all 6 consolidated tools' schema enforcement, BC27 prototype-pollution strip, BC76 fan-out prevention, BC27 cross-trust injection regex, and SSRF gate. Every new dispatcher MUST add its enforcement test here.

Discovery prompt: `tool-architecture-discovery.md §6.4a` (added 2026-05-16) has the verification recipe.

### 5d. Action-Discriminator Handler Schema (Phase 2 chunks, May 16 2026)

When an L1 cross-action schema has to be permissive (because the consolidated tool's actions diverge — `registry` has 5 actions with different shapes, `services` has 7), the L1 schema can't enforce action-specific tightening. The pattern that solves this without giving up L1 enforcement:

- **L1 dispatch boundary** (`tool-schemas.js` CONSOLIDATED_SCHEMAS): permissive union covering all actions
- **L3 handler boundary** (per-handler file): `z.discriminatedUnion('action', [...])` with one tight variant per action

**Sites today** (3 handlers use this pattern after Phase 2):
- `lib/mcp/server/tools/hub/workflow-tools-handler.js` — `WorkflowHandlerInputSchema` (4 actions)
- `lib/mcp/server/tools/hub/service-update-handler.js` — `ServiceUpdateHandlerInputSchema` (registry.update tightening)
- `lib/mcp/server/tools/hub/service-registration-handler.js` — uses L1 directly with an action-discriminator `.transform()` at `tool-schemas.js:819-821` (`if (data.action === 'register' && data.authType === undefined) data.authType = 'NONE'`) — preserves BC76 N3 closure without fan-out

**Pattern reference**: `Z:\paichart\tutorials\mcp-tool-layered-architecture-spec.md` Layer 3 (handler boundary). Universal tutorial form of what this section documents specifically for the MCP hub.

**When NOT to use**: if the consolidated tool's actions are shape-uniform (e.g. `project` with `pov.list`/`pov.details`/`task.list`/`task.context` — all just take query filters), the L1 schema can be tight enough on its own. Reserve L3 handler schemas for tools where L1 permissiveness is structurally required.

### 5e. Phantom-Canonical Multi-Site Form (Phase 3 C1, May 16 2026)

Distinct from the pov.update inline-vs-canonical phantom-canonical case (one inline schema in a dead comment, one real schema elsewhere). The **multi-site form** is when a validator declares N schemas but only M < N are wired:

- `lib/validation/mcp-hub-validation.ts` (now deleted): declared 10 schemas, only 2 were wired by handler-internal validators. The other 8 looked canonical but never executed.

**Detection grep**:
```bash
# Count schemas declared in the validator
grep -c "^export const\|MCPHubToolSchemas\['" <validator-file>

# Count actual call sites of the validator
grep -rn "validateMCPHubRequest\|<validator-name>(" lib/ scripts/ | grep -v test
```
N schemas declared but <N callers = phantom-canonical multi-site form. **Each unwired schema is a P0 finding** because the validator declarations are read by reviewers as if they were active.

**Phase 3 C1 fix**: deleted `mcp-hub-validation.ts` entirely; migrated the 2 wired-schemas' constraints to L1 `tool-schemas.js` (registry.register: name kebab/description charset/endpoint mcp\|http/version semver; services.call.arguments: 25KB cap + cross-trust injection regex); workflow.cancel.reason added at L1. 6-specialist verdict matrix at `cline_docs/reviews/phase-3-verdict-matrix-2026-05-16/`.

### 6. Tool Security Tiers

Defined in `lib/mcp/server/config/tool-security.js`:

| Tier | Tools | Access |
|------|-------|--------|
| PUBLIC_TOOLS | (empty - all require auth since Phase 3) | Unauthenticated |
| AUTHENTICATED_TOOLS | `project`, `perform`, `analytics`, `services`, `registry` + 4 non-consolidated | Authenticated users |
| ADMIN_TOOLS | `template` | Admin role only |

Handler-level authorization also exists (e.g., `perform(action: 'pov.update')` is ADMIN-only at `pov-update-handler.ts:63`; `pov.create` is RolePermission-TABLE governed since 2026-05-25 `ed74e8ce` — ADMIN+USER allowed, DEMO blocked, via `checkPermission` at `pov-create-handler.ts:284`).

### 7. Tool Annotations

Defined in `lib/mcp/server/config/tool-annotations.js`:
- `readOnlyHint` / `destructiveHint` per tool
- `title` for display
- Must have entries for all consolidated tools
- Referenced by `getToolCapabilities()` via `getToolAnnotations(toolName)`

### 8. Response Metadata Standards

All tool responses should follow these conventions:

- **`_meta.tool`**: MUST use consolidated tool name (e.g., `'services'`, not `'call_service'`)
- **`nextSteps`**: MUST reference consolidated tool names with action syntax (e.g., `"project(action: 'pov.list')"`)
- **Error guidance**: MUST use consolidated names in suggestions
- **`_meta.timestamp`**: ISO 8601 string
- **`_meta.sdkNative`**: `true` for SDK-native handlers

**Signal Design (Protocol 10) cross-ref**: the *naming/shape* conventions above are mine; the *epistemic* quality of a response signal an AI consumer acts on is owned by `architectural-review-specialist` via Protocol 10 (`/.claude/knowledge/protocols/signal-design-protocol.md`). When adding a `_meta`/`nextSteps`/error field whose name implies a judgement (`disposition`, `recommendation`, `confidence`, `retryable`, `suggestedRetryDelayMs`) or that is derived from a heuristic/threshold/average, route it through the fact-vs-verdict lens before shipping: facts (verifiable truths) are safe; an unvalidated verdict on a broad-blast-radius surface (error/recovery) can mislead every client silently. Default — ship the fact, defer the verdict until validated.

### 9. Service Registry Consolidation

Internal services in the MCP Hub registry (3 active, post 2026-05-23 cleanup):

- **`paichart-project-service`** — Unified service with `project` + `perform` tools (routable)
  - Replaced legacy `paichart-pov-service` + `paichart-task-service`
  - ID must be literal string (not CUID)
  - Registered via `scripts/register-internal-services.ts`
- **`paichart-recommendation-engine`** (NOW ROUTABLE — 2026-05-23, commit 792dbc01) — `recommendation` tool with `list` action
  - Was previously FK-target-only (no router entry → "Unknown internal service" 404 on call)
  - Now routes via REST `/api/mcp/recommendations` which inherits `requirePermission` + `validatePOVAccess` team-membership filtering. Accepts `povId` OR `taskId`. Read-only.
  - Category: `ai-intelligence`
- **`paichart-kpi-service`** — KPI scoring/history/evaluation (routable)
  - Tools: `kpi` with actions: `score`, `history`, `evaluate`. Category: `ai-intelligence`

**Creation pattern**: `/.claude/knowledge/patterns/internal-service-gold-standard-pattern.md` (5-step guide, 6 quality standards, two service types: routable vs system)

**Legacy cleanup** (2026-05-23, commit 792dbc01): `paichart-pov-service` + `paichart-task-service` DROPPED from `InternalServiceRouter.serviceToolMap`. They were never present in the MCPTool DB → unreachable via `services.call` (resolver 404s before routing). Dead code at the routing layer. `scripts/register-internal-services.ts` actively deletes them via `LEGACY_SERVICE_IDS`.

### 10. Schema bounds on registry surface (R3-B5, commit 5fefd455)

`tool-schemas.js` registry.register + registry.update schemas explicitly cap capability array sizes — without these caps, a 200-tool (or 10K+) DoS registration bloats DB JSONB + discovery response token budget.

| Field | Cap | Rationale |
|---|---|---|
| `capabilities.tools` | `.max(200)` | Accommodates wrapper-pattern services (alpha-vantage = 113 tools) |
| `capabilities.resources` | `.max(100)` | No known legitimate service registers more |
| `capabilities.prompts` | `.max(100)` | Same |

**Audit hook** when reviewing new fields on registry schemas: every `z.array(...)` MUST have `.max(N)`. Every `z.string()` MUST have `.max(N)` + `.regex(...)` if shape matters (the `services.call.tool` bug at R3-3 was unbounded string with no regex → `<script>` payload landed in audit metadata).


## [evicted] Key Information

### Critical Files
- `lib/mcp/server/config/tool-schemas.js` - CONSOLIDATED_SCHEMAS + TOOL_SCHEMAS (source of truth for tool definitions)
- `lib/mcp/server/config/tool-security.js` - PUBLIC/AUTHENTICATED/ADMIN tool tiers
- `lib/mcp/server/config/tool-annotations.js` - Tool display metadata
- `lib/mcp/server/tools/dispatchers/*.js` - 5 dispatcher files routing actions to handlers
- `mcp-server-v5.js` - Protocol server tool registration and `getToolCapabilities()`
- `lib/mcp/embedded-server.ts` - Embedded server tool registration
- `lib/mcp/server/tools/sdk-native-basic-tools.js` - Legacy handler functions (37 refs)
- `lib/mcp/server/tools/sdk-native-advanced-tools.js` - Legacy handler functions (14 refs)
- `lib/mcp/server/utils/parameter-normalizer.js` - Tool-specific parameter normalization maps

### Tool Name Audit Taxonomy
When adding, renaming, or consolidating tools, use the audit taxonomy to ensure all code sites are updated:

**Reference**: `/.claude/knowledge/domain/mcp/tool-name-audit-taxonomy.md`

6 categories of code locations where tool names appear:
1. **Runtime Code** — validation keys, normalizer keys, lookup maps, rate limit keys, timing IDs (functional impact)
2. **User-Facing Strings** — `_meta.tool`, `nextSteps`, error messages, seed data (UX impact)
3. **Observability** — pino logger strings, audit actions, console output (debugging impact)
4. **Documentation** — JSDoc, inline comments, type comments, file headers, `.describe()` (comprehension impact)
5. **Infrastructure** — shell scripts, SQL comments, test assertions (operational impact)
6. **Intentionally Kept** — LEGACY_TOOL_MAP, InternalServiceRouter, handler method names (backward-compat)

### Common Tasks You Handle

1. **Adding a New Tool**
   - Add schema to CONSOLIDATED_SCHEMAS or TOOL_SCHEMAS
   - Add to appropriate security tier in tool-security.js
   - Add annotations in tool-annotations.js
   - Register handler in mcp-server-v5.js AND embedded-server.ts
   - If consolidated: create or update dispatcher
   - Walk the Tool Name Audit Taxonomy to ensure all 6 categories reference the new name

2. **Adding an Action to Existing Consolidated Tool**
   - Add action to enum in CONSOLIDATED_SCHEMAS
   - Add switch case in dispatcher
   - Update description text to list new action
   - Create or wire handler function

3. **Auditing Legacy Name Leakage**
   - Use the Tool Name Audit Taxonomy (`/.claude/knowledge/domain/mcp/tool-name-audit-taxonomy.md`)
   - Walk all 6 categories: runtime code, user-facing strings, observability, documentation, infrastructure, intentionally kept
   - Classify each match by category to determine fix vs keep
   - Verify LEGACY_TOOL_MAP sync across 3 locations

4. **Validating Schema Parity**
   - CONSOLIDATED_SCHEMAS actions match dispatcher VALID_ACTIONS
   - tool-security.js lists match actual registered tools
   - tool-annotations.js has entries for all tools
   - getToolCapabilities() iterates both schema objects

### When to Use This Specialist
- Tool consolidation or refactoring
- Adding new tools or actions to existing tools
- Investigating why a tool isn't visible to clients
- Auditing legacy tool name references
- Schema changes or security tier modifications
- Dispatcher architecture changes
- LEGACY_TOOL_MAP synchronization issues
- `_meta.tool` or response formatting issues


## [evicted] Learning Notes

- **Pattern**: Two-tier schema lookup (CONSOLIDATED first, TOOL_SCHEMAS fallback) - prevents name collisions and maintains backward compatibility
- **Gotcha**: `getToolCapabilities()` must iterate BOTH schema objects or consolidated tools won't appear to clients (bug found Mar 2026)
- **Gotcha**: `agentExecutionEngine.ts` checks `mcpTools.includes('services')` to append hub guidance — if this check references a legacy name, agents silently lose hub routing guidance
- **Gotcha**: MCP `register_service` tool can't register internal services (rejects `internal://` endpoints, generates CUID IDs instead of custom IDs) — use `scripts/register-internal-services.ts` via Prisma directly
- **Tip**: When triaging legacy refs, handler method names (e.g., `handleListPOVs`) are INTERNAL — they don't need updating. All other references (timing IDs, rate limit keys, normalizer keys) were cleaned to consolidated names in Mar 2026.
- **Critical**: LEGACY_TOOL_MAP in 3 locations must stay in sync — update all 3 or create silent regressions
- **Insight**: `perform` is intentionally not a dispatcher — it delegates directly to `handleExecuteTaskAction` which is already a dispatcher internally via `TaskActionHandler.handle()`
- **Decision (Mar 2026)**: `prompt_command` + `list_prompts` must NOT be consolidated. Three reasons:
  1. Three separate prompt systems exist: MCP protocol (`prompts/list`, `prompts/get`), `prompt_command` tool (execute), `list_prompts` tool (discover/filter). Different clients use different systems.
  2. `prompt_command` has special interception logic (mcp-server-v5.js lines 1152-1193) that runs BEFORE normal tool dispatch — moving it to a dispatcher would break prompt detection in other tool calls.
  3. They serve fundamentally different purposes: `prompt_command` executes prompts (basicTools), `list_prompts` discovers/filters with rich DB queries (hubTools). Different handler systems, different data sources.
  Client mapping: Claude Desktop → MCP protocol natively; Claude.ai HTTP → MCP protocol via bridge; ChatGPT/Gemini → tool-level `prompt_command` and `list_prompts`.


## [evicted] Pre-Recommendation Verification (Meta-Learning from task.update Case)

Before recommending architectural changes or refactoring:

### 1. Check the Name Boundary
```bash
# Is this reference user-facing or internal?
# User-facing: _meta.tool, nextSteps, error messages, guidance text
# Internal: handler names, timing IDs, rate limit keys, normalizer keys
grep -n "legacy_name" file.js
# Read surrounding context to classify
```

### 2. Verify Schema Parity
```bash
# Check CONSOLIDATED_SCHEMAS actions match dispatcher VALID_ACTIONS
grep "VALID_ACTIONS" lib/mcp/server/tools/dispatchers/*.js
grep "enum:" lib/mcp/server/config/tool-schemas.js

# Check security tiers list all tools
grep -A 20 "AUTHENTICATED_TOOLS" lib/mcp/server/config/tool-security.js

# Check annotations exist for all tools
grep "^  '" lib/mcp/server/config/tool-annotations.js
```

### 3. Verify LEGACY_TOOL_MAP Sync
```bash
# All 3 locations must have identical mappings
grep -A 20 "LEGACY_TOOL_MAP" lib/services/agentExecutionEngine.ts
grep -A 20 "LEGACY_TOOL_MAP\|legacyMap" app/api/pov/agent/execute/stream/route.ts
grep -A 20 "LEGACY_TOOL_MAP" scripts/migrate-mcp-tool-names.ts
```


