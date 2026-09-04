# MCP Tool Lifecycle Pattern

**Confidence**: 98% (Production-proven, Feb 2026 cleanup session)
**When to use**: Adding, removing, renaming, or modifying any MCP tool
**Results**: Zero drift guaranteed across 7-layer pipeline
**Key insight**: A single tool touches 7 files minimum. Missing any layer creates ghost tools, orphaned code, or documentation drift.

---

## The 7-Layer Pipeline

Every MCP tool exists across these 7 layers. **All layers must be updated atomically.**

```
Layer 1: Schema        → tool-schemas.js         (Zod schema + description)
Layer 2: Security      → tool-security.js         (PUBLIC/AUTHENTICATED/ADMIN)
Layer 3: Annotations   → tool-annotations.js      (readOnlyHint, destructiveHint, title)
Layer 4: Handler       → hub/[handler].js          (business logic class)
Layer 5: Facade        → hub-tools-handler.js      (import + delegation method)
Layer 6: Routing       → mcp-server-v5.js          (hubToolNames + switch/case)
Layer 7: Documentation → .claude/ knowledge files  (agent specs, discoveries, prompts)
```

**File paths**:
```
lib/mcp/server/config/tool-schemas.js
lib/mcp/server/config/tool-security.js
lib/mcp/server/config/tool-annotations.js
lib/mcp/server/tools/hub/[handler-name].js
lib/mcp/server/tools/hub-tools-handler.js
mcp-server-v5.js
.claude/ (agents, knowledge, discoveries, prompts)
```

---

## Adding a New Tool

### Checklist

```
[ ] Layer 1: Add Zod schema to tool-schemas.js
    - Follow Gold Standard description pattern (WORKFLOW, WHEN TO USE, TRY/CHECK/ALTERNATIVE, SEE ALSO)
    - Include inputSchema with .describe() on every parameter
    - Add SEE ALSO cross-references to related tools

[ ] Layer 2: Add tool name to correct tier in tool-security.js
    - AUTHENTICATED_TOOLS (most tools) or ADMIN_TOOLS (admin-only)
    - Update expected counts comment in getToolsForUser()
    - See "Tool Access Permissions" section for tier guidance

[ ] Layer 3: Add annotation entry in tool-annotations.js
    - Set title (human-readable)
    - Set readOnlyHint (true if no data modification)
    - Set destructiveHint (true if creates/modifies/deletes data)
    - Rule: readOnlyHint=true and destructiveHint=true is INVALID

[ ] Layer 4: Create handler class in lib/mcp/server/tools/hub/[name]-handler.js
    - Constructor takes (prisma)
    - handle(args, context) method
    - Return MCP content format: { content: [{ type: "text", text: ... }] }
    - Include _meta with tool name, timestamp, sdkNative, nextSteps
    - Structured error responses (not bare throws)

[ ] Layer 5: Register in hub-tools-handler.js
    - Import handler at top
    - Instantiate in constructor
    - Add delegation method: async handleToolName(args, context)

[ ] Layer 6: Add routing in mcp-server-v5.js
    - Add to hubToolNames array
    - Add case in switch statement

[ ] Layer 7: Update documentation
    - Update tool counts in agent specs that mention tool totals
    - Add to relevant discovery prompts
    - Update tool-architecture-reference.md catalog

[ ] Verify: Run node scripts/verify-tool-annotations.js (should show N+1 tools)
[ ] Verify: Run npx tsx scripts/test-gold-standard-compliance.js (bare node exits 1 since 2026-06-11)
```

---

## Removing a Tool

### Checklist

This is the operation most prone to drift. The Feb 2026 cleanup found:
- Ghost tools (schema+routing but no security registration)
- Ghost annotations (annotations for non-existent tools)
- Dead code (356 lines of helper methods with zero callers)
- 139 stale documentation references across 36 files

```
[ ] Layer 1: Remove schema from tool-schemas.js
    - Also remove from any other tool's SEE ALSO references

[ ] Layer 2: Remove from AUTHENTICATED_TOOLS (or PUBLIC/ADMIN) in tool-security.js
    - Update expected counts comment

[ ] Layer 3: Remove annotation entry from tool-annotations.js

[ ] Layer 4: Delete handler file from lib/mcp/server/tools/hub/

[ ] Layer 5: Clean hub-tools-handler.js
    - Remove import
    - Remove constructor instantiation
    - Remove delegation method
    - CRITICAL: Search for helper methods that ONLY served the removed tool
      (grep for method names called by the removed handler)

[ ] Layer 6: Remove from mcp-server-v5.js
    - Remove from hubToolNames array
    - Remove case from switch statement

[ ] Layer 7: Documentation sweep
    - grep -r "tool_name" .claude/ to find ALL references
    - Update tool counts, tool lists, security tier lists
    - Remove from discovery prompts, testing kickoffs, UX assessments
    - Update cross-references in related tool descriptions

[ ] Verify: Run node scripts/verify-tool-annotations.js (should show N-1 tools)
[ ] Verify: grep -r "removed_tool_name" across entire codebase
[ ] Verify: Check scripts/ directory for test scripts that call the removed tool
```

### Dead Code Detection (Post-Removal)

After removing a tool, search for orphaned code:

```bash
# Find methods that were only called by the removed handler
grep -rn "methodName" lib/mcp/server/tools/ --include="*.js"

# Find imports of the deleted handler file
grep -rn "require.*handler-name" lib/ --include="*.js"

# Find references in test scripts
grep -rn "tool_name" scripts/ --include="*.{js,sh,ts}"

# Find documentation references
grep -rn "tool_name" .claude/
```

---

## Renaming a Tool

Renaming is **add + remove** but with extra care for backward compatibility.

```
[ ] Create new tool (full add checklist above)
[ ] Update all SEE ALSO references in other tools to point to new name
[ ] Update all documentation references
[ ] Remove old tool (full remove checklist above)
[ ] Consider: Add deprecation notice in old tool's description before removal
```

---

## Modifying a Tool (Schema/Behavior Change)

```
[ ] Update schema in tool-schemas.js (description, inputSchema)
[ ] Update annotations if read/write behavior changed
[ ] Update handler logic
[ ] Update SEE ALSO in related tools if relationships changed
[ ] Update documentation if the tool's purpose or usage changed
[ ] Run Gold Standard compliance test
```

---

## Tool Access Permissions

Tool access is controlled at **two layers**. Understanding both is critical when adding tools or changing who can use them.

### Layer 1: Tool-Level (Visibility — which tools a user sees)

**File**: `lib/mcp/server/config/tool-security.js`

Three security tiers determine which tools appear in `tools/list`:

```
PUBLIC_TOOLS        → Visible to everyone (unauthenticated). Currently empty.
AUTHENTICATED_TOOLS → Visible to any logged-in user (DEMO_USER, USER, ADMIN, SUPER_ADMIN)
ADMIN_TOOLS         → Visible only to ADMIN and SUPER_ADMIN
```

**Enforcement**: `getToolsForUser(allTools, user)` filters the tool list before returning it. Non-admins never see ADMIN_TOOLS. `enforceToolSecurity(toolName, context)` blocks execution if a non-admin calls an ADMIN tool directly.

**Current counts** (Feb 2026):
- Unauthenticated: 0 tools
- DEMO_USER / USER: 23 tools (AUTHENTICATED_TOOLS)
- ADMIN / SUPER_ADMIN: 26 tools (23 + 3 ADMIN_TOOLS)

**ADMIN_TOOLS** (Feb 2026): `template(action: "list")`, `template(action: "details")`, `perform(action: "agent_results")`

### Layer 2: Handler-Level (Authorization — what actions a user can perform)

Even within visible tools, individual **handlers** can enforce role checks:

| File | Check | Effect |
|------|-------|--------|
| `lib/mcp/tasks/action/handlers/pov/pov-create-handler.ts:284` | `checkPermission(PoV, CREATE)` | RolePermission-table gate since 2026-05-25 (ed74e8ce): ADMIN+USER create, DEMO blocked |
| `lib/mcp/server/tools/hub/hub-utilities.js` | `fallbackPermissionCheck()` | ⚠️ **DENIES ALL** since 2026-07-28 — it no longer grants role-based access. It fires only when the permissions module fails to load, and previously WIDENED access (view+create for every USER/DEMO_USER, bypassing `rolePermission`). Now denies and logs `securityEvent`. |
| `lib/mcp/server/tools/hub/prompt-list-handler.js` | `isPublic` filter | Non-admins only see public prompts |

**When to use which layer**:
- **Tool-level** (ADMIN_TOOLS): When the entire tool should be invisible to non-admins
- **Handler-level**: When the tool is visible but specific actions within it need role checks

### Supporting Permission Files

| File | Purpose |
|------|---------|
| `lib/mcp/server/config/tool-security.js` | Tool visibility tiers (PUBLIC/AUTHENTICATED/ADMIN) |
| `lib/mcp/server/tools/hub/hub-utilities.js` | `fallbackPermissionCheck()` — ⚠️ deny-all since 2026-07-28, NOT role-based |
| `lib/auth/oauth/mcp-oauth-validator.js` | JWT token permissions (`canRegisterServices`, `canCreatePOVs`, etc.) |
| `lib/admin/handlers/user.ts` | Role hierarchy ranks (affects who can edit whom in admin panel) |
| `lib/mcp/server/middleware/context-enricher.js` | Sets `isDemoUser` flag in request context |
| `lib/mcp/server/prompts/prompt-registry.js` | POV filtering by role (demo users get additive demo POV access) |

### Changing Tool Permissions Checklist

```
[ ] Decide: Tool-level (hide entire tool) or Handler-level (restrict specific actions)?

If tool-level:
  [ ] Move tool name between arrays in tool-security.js (PUBLIC/AUTHENTICATED/ADMIN)
  [ ] Update expected counts comment in getToolsForUser()
  [ ] No handler changes needed — enforceToolSecurity() blocks automatically

If handler-level:
  [ ] Add role check in the handler's handle() method
  [ ] Follow existing pattern: pov-create-handler.ts:151
  [ ] Return clear error message explaining required role

If changing role equality (e.g., DEMO_USER = USER):
  [ ] hub-utilities.js — fallbackPermissionCheck() is DENY-ALL (2026-07-28); there are no role blocks left to audit
  [ ] mcp-oauth-validator.js — JWT permission flags
  [ ] user.ts — roleHierarchy ranks
  [ ] context-enricher.js — isDemoUser flag (keep as informational, not restrictive)
  [ ] prompt-registry.js — POV filtering (check if additive vs restrictive)
```

### Role Summary (Feb 2026)

| Role | Tool Visibility | Hub Actions | POV Create | Service Register |
|------|----------------|-------------|------------|-----------------|
| SUPER_ADMIN | 26 (all) | All | Yes | Yes |
| ADMIN | 26 (all) | All | Yes | Yes |
| USER | 23 | View + Create | No | Yes |
| DEMO_USER | 23 | View + Create | No | Yes |

---

## Verification Commands

```bash
# Pipeline alignment check (all layers should show same count)
node scripts/verify-tool-annotations.js

# Gold Standard compliance
npx tsx scripts/test-gold-standard-compliance.js

# Find ghost tools (in schema but not security)
# Compare tool names across config files manually or via:
grep "'" lib/mcp/server/config/tool-schemas.js | grep -v "//" | wc -l
grep "'" lib/mcp/server/config/tool-security.js | grep -v "//" | wc -l
grep "'" lib/mcp/server/config/tool-annotations.js | grep -v "//" | wc -l

# Find stale references to a specific tool
grep -rn "tool_name" .claude/ lib/ scripts/ --include="*.{js,ts,md,sh}"
```

---

## Post-Change Specialist Review

For significant changes (adding/removing 2+ tools), spawn specialist reviews:

1. **system-reviewer-specialist** — Finds orphaned references, stale counts, dead files
2. **mcp-hub-specialist** — Verifies pipeline alignment, cross-references, handler integrity

This pattern caught 4 P1 and 4 P2 issues in the Feb 2026 cleanup session.

---

## Anti-Patterns (Learned from Feb 2026 Cleanup)

| Anti-Pattern | What Happened | Prevention |
|-------------|--------------|------------|
| **Partial registration** | Tool had schema+routing but no security entry → invisible ghost tool | Always update all 7 layers |
| **Ghost annotations** | Annotations existed for tools that were never implemented | Verify annotations match security config |
| **Dead helper methods** | 356 lines of email/JWT code with zero callers after tool removal | Grep for callers after removing any handler |
| **Stale test scripts** | Test script called removed tool → would fail if run | Check scripts/ directory during removal |
| **Documentation drift** | 139 references across 36 docs after removing 4 tools | Run grep sweep as final step |
| **Backup files** | 87KB .BACKUP.js file left in codebase | Delete backups, use git history instead |
