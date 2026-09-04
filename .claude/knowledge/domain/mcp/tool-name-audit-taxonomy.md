# Tool Name Audit Taxonomy

**Purpose**: Complete classification of every code location where MCP tool names appear. Use as a checklist when adding, renaming, or consolidating tools.

**Created**: 2026-03-08 (derived from Mar 2026 consolidation sweep)
**Referenced by**: `mcp-tool-architecture-specialist` agent

---

## How to Use

When a tool name changes (consolidation, rename, new tool):
1. Walk each category below
2. Grep for the old name in the file types listed
3. Classify each match: fix vs intentionally keep
4. Fix all non-intentional refs, update tests

---

## Category 1: Runtime Code (functional impact)

Changes here cause silent bugs — tool lookups fail, normalization skips, validation bypasses.

| Site Type | Grep Pattern | Example |
|-----------|-------------|---------|
| **Validation schema keys** | `MCPHubToolSchemas\[` or object keys in validation files | `'services.call': z.object({...})` |
| **normalizeForTool() keys** | `normalizeForTool\('` | `normalizeForTool('services.discover', args)` |
| **validator() call keys** | `validator\('` | `validator('registry.register', args)` |
| **Runtime lookup maps** | Switch cases, if-chains, object property matching | `case 'registry':`, `toolName === 'services'` |
| **Rate limit key prefixes** | String templates with tool name | `service.register:${userId}` |
| **Performance timing IDs** | `startTiming\('` | `startTiming('sdk_native_template_list')` |
| **Cache key prefixes** | String templates with tool name | `suggestions_${toolName}_${userId}` |
| **ensureObject labels** | `ensureObject(value, default, 'label')` | `ensureObject(args.updates, {}, 'registry.update.updates')` |
| **toolHandlers.set() keys** | `toolHandlers.set('` | `toolHandlers.set('project', ...)` |

## Category 2: User-Facing Strings (UX impact)

Users/AI clients see these. Legacy names here teach wrong tool syntax.

| Site Type | Grep Pattern | Example |
|-----------|-------------|---------|
| **`_meta.tool` values** | `tool:\s*['"]` in response objects | `_meta: { tool: 'services' }` |
| **`nextSteps` arrays** | `nextSteps` in handler responses | `"services(action: 'health', ...)"` |
| **Error message guidance** | Strings in `throw new Error(` with tool syntax | `project(action: "task.list", ...)` |
| **Seed script content** | Strings in seed scripts stored to DB | `services(action: "call", targetService: ...)` |
| **Verification examples** | `verification:` or `example:` in responses | `services(action: "discover", ...)` |

## Category 3: Observability (debugging impact)

Grep-ability of production logs. Legacy names here mean log searches miss events.

| Site Type | Grep Pattern | Example |
|-----------|-------------|---------|
| **Pino logger strings** | `logger\.(debug\|info\|warn\|error)\(` | `logger.debug('Executing SDK-native template.list')` |
| **Audit action strings** | Strings passed to audit/compliance logging | `'SERVICE_REGISTRATION'` (action, not tool name) |
| **Console output in scripts** | `console.log(` with tool names | `console.log('services(action: "discover")')` |

## Category 4: Documentation (developer comprehension)

Misleading docs cause wrong assumptions. Lower risk but high maintenance cost.

| Site Type | Grep Pattern | Example |
|-----------|-------------|---------|
| **JSDoc comments** | `@param`, `@returns`, `@example`, `@description` | `* Handle template(action: "list")` |
| **Inline code comments** | `//` and `/* */` comments | `// consolidated from legacy execute_task_action` |
| **Type definition comments** | TSDoc in `.ts` type files | `/** Tool invoked (e.g., "project") */` |
| **File header comments** | Module-level `/** */` blocks | `* sdk-native-basic-tools.js (project tool: pov.list, ...)` |
| **Zod `.describe()` text** | `.describe('...')` on schema fields | `.describe('Action to perform')` |

## Category 5: Agent Knowledge Base (agent behavior impact)

Agents read these files to guide their analysis, recommendations, and grep commands. Legacy names here cause agents to search for wrong patterns, recommend wrong tool syntax, and generate wrong test commands.

| Site Type | Grep Pattern | Example |
|-----------|-------------|---------|
| **Discovery prompt checklists** | `- [ ]` with tool names in `.claude/knowledge/discoveries/` | `- [ ] Test services(action: "call") for communication` |
| **Discovery grep commands** | `grep` commands in bash blocks | `grep -n "services\|registry" ...` |
| **Discovery findings sections** | Status sections with tool references | `Workflow tools: ✅ Operational via services(action: ...)` |
| **Domain reference docs** | Tool examples in `.claude/knowledge/domain/` | `services(action: "call", targetService: ...)` |
| **Test prompt scripts** | Test steps in `.claude/knowledge/prompts/` | `Call services(action: "discover") and verify...` |
| **Protocol references** | Tool refs in `.claude/knowledge/protocols/` | `Run services(action: "health") to check...` |
| **Agent config examples** | Tool examples in `.claude/agents/` | `perform({ action: "execute", ... })` |

**Exception**: Discovery files that grep FOR legacy names as audit detection tools (e.g., `tool-architecture-discovery.md`) should be KEPT — they're the audit tool itself.

**Magnitude**: This is the largest category (~90 files, ~1400+ refs), dwarfing all other categories combined.

## Category 6: Infrastructure (operational impact)

Scripts that call the MCP server or reference tools in operational contexts.

| Site Type | Grep Pattern | Example |
|-----------|-------------|---------|
| **Shell script JSON-RPC** | `"name":` in curl `-d` payloads | `"name":"services","arguments":{"action":"discover"}` |
| **SQL migration comments** | `--` comments in `.sql` files | `-- registered via registry(action: "register")` |
| **Test assertions** | `expect(`, `toContain(`, `toBe(` | `expect(content).toContain('registry(action: "register")')` |
| **Config file comments** | Comments in security/annotation configs | `// Legacy X were consolidated into Y` |

## Category 7: Intentionally Kept (backward-compat)

These use legacy names ON PURPOSE. Do NOT change them.

| Site Type | Files | Reason |
|-----------|-------|--------|
| **LEGACY_TOOL_MAP** | `agentExecutionEngine.ts`, `stream/route.ts`, `migrate-mcp-tool-names.ts` | Maps old->new for existing data. Must stay in sync across all 3. |
| **InternalServiceRouter serviceToolMap** | `InternalServiceRouter.js` | Routes existing workflow DB data that references legacy tool names |
| **Dual-key backward-compat maps** | `user-consent-policy.js` | Has both consolidated + legacy keys with explicit `// Legacy` comments. Same pattern as InternalServiceRouter. |
| **Handler method names** | All handler files | `handleListPOVs`, `handleCallService` etc. are internal function identifiers, not lookup keys |
| **Consolidation mapping tables** | `mcp-tool-architecture-specialist.md`, `tool-name-audit-taxonomy.md` | Documents the legacy->new mapping — that's the purpose |
| **Audit discovery grep commands** | `tool-architecture-discovery.md` | Grep commands that search FOR legacy names to detect leakage — that's the audit tool itself |
| **Archived scripts** | `scripts/archive/*` | Historical, not active |
| **Temp/backup scripts** | `temp-scripts/`, `temp-scripts-backup-*/` | Stale development scripts, not deployed |
| **Session artifacts** | `cline_docs/` | Historical session notes, plans, reviews — not agent knowledge |

### Not Tool Names (common false positives)

These look like tool names but are **prompt names** stored in the database. Do NOT confuse during audits:

| Name | What It Is | Where It Appears |
|------|-----------|-----------------|
| `list_tasks_guided` | MCP prompt template name | `prompt-command-handler.js`, `seed-agent-templates.ts`, `oauth/success/page.tsx` |
| `agent_results_guide` | MCP prompt template name | `seed-agent-templates.ts` |
| `mcp_list_tasks_guided` | Older version of prompt name | `temp-scripts/` |
| `register_service_wizard` | Legacy prompt name (now `register_guide`) | Historical references only |
| `discover_services_conversation` | Legacy prompt name (now `get_started`) | Historical references only |

---

## Validation Protocol

After completing a sweep, verify:

```bash
# 1. All production code clean (expect only Category 7 files)
grep -rn 'legacy_name' lib/ app/ --include='*.ts' --include='*.js' | grep -v archive

# 2. All active scripts clean (expect only migrate-mcp-tool-names.ts)
grep -rn 'legacy_name' scripts/ --include='*.ts' --include='*.js' --include='*.sh' | grep -v archive

# 3. Agent configs clean
grep -rn 'legacy_name' .claude/agents/ --include='*.md'

# 4. Knowledge base clean (exclude audit grep commands)
grep -rn 'legacy_name' .claude/knowledge/ --include='*.md' | grep -v 'tool-architecture-discovery\|tool-name-audit-taxonomy\|PATTERN-REGISTRY'

# 5. Frontend components clean
grep -rn 'legacy_name' components/ --include='*.tsx' --include='*.ts'

# 6. Tests pass
npm run test:all-validation

# 7. Build succeeds
npx tsc --noEmit
```

---

## When to Use This Taxonomy

- **Adding a new tool**: Walk Categories 1-6 to ensure all sites reference the new name
- **Renaming/consolidating tools**: Walk all 7 categories, classify each match
- **Auditing legacy leakage**: Grep for old names, classify by category, fix non-intentional refs
- **Onboarding new developers**: Explains WHERE tool names live and WHY some legacy refs exist
- **Knowledge base maintenance**: Category 5 is the largest by volume — sweep after any consolidation

## Sweep Order (recommended)

Based on the Mar 2026 consolidation sweep experience:

1. **Category 1** (Runtime) — highest risk, fix first
2. **Category 2** (User-facing) — visible to users/AI clients
3. **Category 3** (Observability) — affects debugging
4. **Category 6** (Infrastructure) — test assertions can break silently
5. **Category 4** (Documentation) — JSDoc, code comments
6. **Category 5** (Agent Knowledge Base) — largest volume, agents follow these
7. **Verify Category 7** (Intentionally Kept) — confirm all are correctly labeled
