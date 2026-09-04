# Pattern: MCP Parameter Three-Layer Update

**Confidence**: 98% | **Last Validated**: 2026-04-04
**Bug Class**: Silent parameter stripping (discovered via production pipeline test failure)
**Applied In**: task-action-handler.js, mcp-action-validation.ts, tool-schemas.js, task-create-handler.ts

## Rule

When adding a new parameter to any MCP action, update ALL THREE layers or the parameter is silently stripped at the validation boundary:

| Layer | File | What To Do |
|-------|------|------------|
| 1. Tool Schema | `lib/mcp/server/config/tool-schemas.js` | Add to Zod schema + flat params list + description/examples |
| 2. Validation Schema | `lib/validation/mcp-action-validation.ts` | Add to action-specific schema in `MCPParameterSchemas` |
| 3. Handler | `lib/mcp/tasks/action/handlers/...` | Destructure + use the parameter |

## Why All Three Are Required

```
AI Client (Claude Desktop / ChatGPT)
    ↓ sends parameters
Layer 1: Tool Schema (tool-schemas.js)
    → Zod validates input shape
    → Flat params merged for Claude Desktop compatibility
    ↓
MCP Server (task-action-handler.js)
    → Builds apiPayload with ...finalParameters spread
    ↓ HTTP POST (Tier 2) or direct call (Tier 1)
Layer 2: Validation Schema (mcp-action-validation.ts)
    → Action-specific Zod schema validates
    → ⚠️ Zod STRIPS unknown fields by default (no .passthrough())
    → If parameter not in schema → SILENTLY REMOVED
    ↓
Layer 3: Handler (task-create-handler.ts etc.)
    → Destructures parameters
    → Uses the field
```

The critical boundary is Layer 2. Zod's default behavior strips fields not declared in the schema. The action-specific schemas do NOT use `.passthrough()` — this is intentional (prevents injection of arbitrary fields into Prisma calls). But it means every new parameter must be explicitly declared.

## The Bug Pattern

```typescript
// Layer 1 ✅ — tool-schemas.js has dependencyIds in Zod schema
dependencyIds: z.array(z.string()).optional(),

// Layer 2 ❌ — mcp-action-validation.ts task.create schema MISSING dependencyIds
'task.create': z.object({
  title: SimpleTextField(500),
  // ... no dependencyIds here
})
// Zod strips dependencyIds silently

// Layer 3 ✅ — task-create-handler.ts destructures dependencyIds
const { title, ..., dependencyIds } = parameters;
// dependencyIds is undefined — no error, just no dependencies created
```

**Result**: Dependencies silently not created. No error thrown. Pipeline appears to work but context chaining fails because there are no dependency records.

## Checklist (copy-paste for PRs)

When adding a new MCP parameter:

- [ ] Added to `lib/mcp/server/config/tool-schemas.js` — Zod schema
- [ ] Added to `lib/mcp/server/config/tool-schemas.js` — flat params array (for Claude Desktop)
- [ ] Added to `lib/mcp/server/config/tool-schemas.js` — description/examples
- [ ] Added to `lib/validation/mcp-action-validation.ts` — action-specific schema in `MCPParameterSchemas`
- [ ] Added to handler — destructured and used
- [ ] Tested via MCP (not just direct API call — MCP goes through all 3 layers)

## When to Apply

Every time you:
- Add a new parameter to task.create, task.update, task.complete, agent.configure, or any other MCP action
- Rename a parameter (update all 3 layers + add alias in validation)
- Change a parameter type (update validation schema to match)

## Related Patterns

- `transport-boundary-argument-coercion-pattern.md` — Related boundary issue at the transport layer
- `field-leakage-prevention-pattern.md` — Related boundary issue at the spread operator level
- `mcp-tool-gold-standard-pattern.md` — Tool design standards
