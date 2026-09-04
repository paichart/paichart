# Transport Boundary Argument Coercion Pattern

**Type**: Defensive Programming Pattern (cross-transport data integrity)
**Confidence**: 99% (production-validated February 2026, full sweep complete)
**Status**: Complete - covers callTool boundaries, Prisma storage boundaries, array parameters, and iteration sites
**Created**: February 15, 2026
**Updated**: February 22, 2026 (added storage boundary sites, ensureObject canonical fix)
**Author**: Claude Opus 4.6 + Steve Terry

---

## Overview

When data crosses MCP transport boundaries (stdio → SSE, HTTP → SSE, SDK client → SDK server), nested objects can be silently converted to JSON strings. This pattern ensures arguments remain as plain objects at every boundary — both **outbound callTool** calls and **inbound Prisma storage** — preventing downstream validation failures and silent data corruption.

**The Bug Class**: Data type mutation at transport boundaries
- An `arguments` object `{state: "TX"}` arrives as the string `'{"state":"TX"}'`
- **Variant A (loud)**: Downstream MCP server rejects it: `"Expected object, received string"`
- **Variant B (silent)**: Prisma stores the string in a `jsonb` column — `jsonb_typeof = 'string'` instead of `'object'` — and subsequent reads find no properties on the string

**Related Pattern**: `docker-mcp-service-gold-standard-v2.md` - same bug class
- That pattern: Express body-parser consumes request stream before MCP SDK reads it
- This pattern: MCP transport serializes nested objects to strings between services
- Both are **transport boundary data mutation** bugs

---

## When to Use This Pattern

**ALWAYS apply when**:
- Calling `client.callTool()` on an MCP SDK `Client` that connects to a remote/external service
- **Storing MCP tool parameters in a database** (Prisma jsonb columns, Redis, etc.)
- Arguments originate from a different transport layer (e.g., received via stdio, forwarded via SSE)
- Building Hub orchestration that routes calls between services

**Do NOT need when**:
- Calling an embedded server's own `callTool()` method (no transport boundary)
- Arguments are hardcoded objects (no serialization path)
- Internal function calls within the same process

---

## The Problem

### Variant A: Outbound callTool (loud failure)

**Symptom**: Immediate error from downstream service
```
MCP error -32602: Service call to eia-service failed: MCP error -32603: [
  {
    "code": "invalid_type",
    "expected": "object",
    "received": "string",
    "path": ["params", "arguments"],
    "message": "Expected object, received string"
  }
]
```

### Variant B: Inbound Storage (silent corruption)

**Symptom**: Data stored correctly, reads back empty
```sql
-- capabilities stored as JSON string inside jsonb column
SELECT jsonb_typeof(capabilities) FROM mcp_tools WHERE name = 'my-service';
-- Returns: 'string' (should be 'object')

-- Downstream code finds no properties:
-- capabilities?.tools → undefined (string has no .tools property)
-- registry(action: "tools") returns: { tools: [], toolCount: 0, schemaVersion: 1 }
```

**Why Variant B is worse**: No error is thrown. The service appears to register successfully. The bug only surfaces when a different tool (`registry(action: "tools")`) tries to read the stored data and finds nothing. The error appears to be in the reading code, not the writing code.

### Root Cause

Different MCP transports handle nested object serialization differently:

```
Claude Code (stdio) ──→ Hub MCP Server ──→ SSE Client ──→ Downstream Service
                         │                    │
                         │ arguments may      │ arguments arrive
                         │ be stringified     │ as string, not object
                         │ during transit     │
                         │                    │
                         ├──→ Prisma.create({capabilities: <string>})
                         │    jsonb stores string literal ← VARIANT B
```

### Why It's Hard to Diagnose

1. The error appears to come from the **downstream** service (Variant A) or **reading** code (Variant B), not the boundary crossing
2. Hub-side validation passes (arguments IS an object at validation time)
3. The serialization happens in the SDK transport layer (opaque)
4. Works in Claude Desktop (SSE-to-SSE) but fails in Claude Code (stdio-to-SSE)
5. No explicit `JSON.stringify()` call in user code - it's in the transport
6. **Variant B**: Prisma silently accepts strings in jsonb columns — a valid JSON value, just the wrong type

---

## The Pattern

### Canonical Fix: ensureObject()

The project provides `ensureObject()` as the standardized guard. Use it at every boundary.

**Location**: `lib/utils/ensure-object.ts` — sole source of truth since Phase 2 proper / Bug Class 73 eradication Apr 8 2026. Extensionless `require('.../ensure-object')` from JS callers resolves via ts-node CJS hooks in both `paichart-web` (via `server.js`) and `paichart-mcp` (via `mcp-server-http-clean.js`). The `.js` sibling was deleted.

```javascript
const { ensureObject } = require('../../../../utils/ensure-object');

// Before any external callTool
const callArguments = ensureObject(validatedArgs.arguments, {}, 'Service Call');

// Before any Prisma storage of MCP tool parameters
const capabilities = ensureObject(validatedArgs.capabilities, {}, 'registry.register.capabilities');
```

**What it does**:
- `null`/`undefined` → returns fallback (`{}`)
- Already an object → returns as-is (no-op for correct inputs)
- JSON string → `JSON.parse()` and returns the object
- Unparseable string → returns fallback with optional warning

### Inline Fix (when ensureObject not available)

```javascript
// typeof guard before any external callTool or Prisma storage
let callArguments = validatedArgs.arguments || {};
if (typeof callArguments === 'string') {
  try {
    callArguments = JSON.parse(callArguments);
  } catch (e) {
    log.warn({ field: 'arguments', err: e }, 'Failed to parse string to object');
    callArguments = {};
  }
}
```

### Validation Schema: Accept Both Types

Match the validation schema to handle both formats:

```typescript
// In Zod validation schemas — for simple object fields
import { objectOrJsonString } from './zod-helpers';

arguments: objectOrJsonString.refine(
  (args) => JSON.stringify(args).length <= 25000,
  'Arguments object too large'
).optional()

// For complex fields like capabilities with nested arrays
const toolItemSchema = z.union([
  z.string().max(100),                    // Legacy: tool name string
  z.object({                              // Full: tool with inputSchema
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    inputSchema: z.object({}).passthrough().optional()
  }).passthrough()
]);

const capabilitiesSchema = z.object({
  tools: z.array(toolItemSchema).max(50).optional(),
  resources: z.array(z.string().max(100)).max(50).optional(),
  prompts: z.array(z.string().max(100)).max(50).optional()
}).passthrough().or(z.string().transform((str, ctx) => {
  // Parse JSON string from transport boundary
  try {
    const parsed = JSON.parse(str);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Expected JSON object' });
    return z.NEVER;
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid JSON string' });
    return z.NEVER;
  }
}));
```

---

## Production Sites (pAIchart)

### Outbound callTool Sites (5 total - all fixed)

| Site | File | Fix | Transport |
|------|------|-----|-----------|
| Hub service calls | `lib/mcp/server/tools/hub/service-call-handler.js` | `ensureObject` | SSE (Hub → external) |
| Workflow orchestration (external) | `lib/mcp/server/tools/hub/workflow-tools-handler.js:446` | `ensureObject` | SSE (Hub → external) |
| Workflow step arguments (both paths) | `lib/mcp/server/tools/hub/workflow-tools-handler.js:250` | `ensureObject` | Internal + SSE (covers internal router AND external callTool) |
| Workflow service caller | `lib/services/workflow/integrations/service-caller.ts` | typeof guard | SSE (workflow → external) |
| MCP client service | `lib/services/mcp/mcpService.ts` | typeof guard | SSE (client → external) |

### Inbound Storage / Iteration Sites (3 total - all fixed)

| Site | File | Fix | What was stored/iterated wrong |
|------|------|-----|-------------------------------|
| Service registration | `lib/mcp/server/tools/hub/service-registration-handler.js` | `ensureObject` | `capabilities` as string in jsonb |
| Service registration (auto-approve path) | `lib/mcp/server/tools/hub/service-registration-handler.js` | `ensureObject` | Same field, second code path |
| Service update | `lib/mcp/server/tools/hub/service-update-handler.js` | `ensureObject` | `updates` iterated as string → `Object.keys()` returned char indices, destructuring produced empty object |

### Array Parameter Sites (1 total - fixed)

| Site | File | Fix | What failed |
|------|------|-----|-------------|
| Workflow steps | `lib/mcp/server/tools/hub/workflow-tools-handler.js:515` | `JSON.parse` guard | `steps` array arrived as string → `Array.isArray` returned false → misleading error |

### Internal Sites (6 total - safe, no transport boundary)

| Site | File | Why Safe |
|------|------|----------|
| Embedded server | `lib/mcp/embedded-server.ts` | Internal method, no SSE |
| Embedded callWithElicitation | `lib/mcp/embedded-server.ts` | Self-call wrapper |
| ~~MCP client wrapper~~ | ~~`lib/services/mcp/mcpClientWrapper.ts`~~ | File deleted 2026-07-17 (dead module, BC79 follow-up) |
| API test route | `app/api/mcp/tools/[toolId]/test/route.ts` | Calls embedded directly |
| Server manager | `lib/services/mcp/serverManager.ts` | Delegates to mcpService |
| LLM service | `lib/services/llm/llm-service.ts` | Delegates to mcpService |

### Validation Schemas (sole source of truth since Apr 8 2026)

| Site | File |
|------|------|
| Hub validation | `lib/validation/mcp-hub-validation.ts` (the `.js` CJS bridge was deleted in Phase 2 proper / Bug Class 73 eradication; JS callers now resolve the `.ts` via ts-node in both PM2 workers) |

---

## Detection: Finding Vulnerable Sites

### Grep Commands

```bash
# === Outbound: callTool sites ===

# Find all SDK callTool sites (potential vulnerabilities)
grep -rn '\.callTool(' --include='*.{js,ts}' | grep -v node_modules | grep -v '.d.ts'

# Find unprotected sites (no ensureObject or typeof check before callTool)
grep -B5 '\.callTool(' --include='*.{js,ts}' -rn | grep -v node_modules | grep -v 'ensureObject\|typeof'

# === Inbound: Prisma storage of MCP tool parameters ===

# Find Prisma create/update in hub handlers (may store stringified params)
grep -rn 'prisma.*\.create\|prisma.*\.update' lib/mcp/server/tools/hub/ --include='*.js'

# Find JSON/jsonb fields being stored from tool args without ensureObject
grep -rn 'capabilities:\|configuration:\|metadata:' lib/mcp/server/tools/hub/ --include='*.js' | grep -v ensureObject

# === Validation schemas ===

# Find validation schemas that only accept objects (not strings)
grep -rn 'z\.array(z\.string()' --include='*.{ts,js}' lib/validation/
```

### Audit Checklist

For each boundary site found:

1. **Does it cross a transport boundary?** (stdio→SSE, HTTP→SSE, process→process)
   - YES → Must have `ensureObject` or typeof guard
   - NO (internal/embedded) → Safe
2. **Do arguments originate from external input?** (user request, API call, MCP tool params)
   - YES → Must have `ensureObject` or typeof guard
   - NO (hardcoded) → Safe
3. **Is the data stored in a database?** (Prisma jsonb, Redis, etc.)
   - YES → Must have `ensureObject` before storage (Variant B risk)
   - NO → Only Variant A risk (loud failure, easier to catch)
4. **Is there a Zod validation upstream?** Does it accept strings with transform?
   - YES with transform → Partially safe (still add guard for defense-in-depth)
   - YES object-only → Vulnerable if arguments arrive as string
   - NO validation → Vulnerable

---

## Related Patterns

### Same Bug Family: Transport Boundary Data Mutation

| Pattern | Boundary | Mutation | Fix |
|---------|----------|----------|-----|
| **This pattern (Variant A)** | stdio/SSE → SSE | Object → string (loud) | `ensureObject` + typeof guard |
| **This pattern (Variant B)** | MCP tool → Prisma jsonb | Object → string (silent) | `ensureObject` before storage |
| **docker-mcp-service-gold-standard** | Express → MCP SDK | Stream consumed | `handlePostMessage(req, res, req.body)` |
| **field-leakage-prevention** | JWT ↔ User, MCP ↔ API | Fields disappear | Boundary contract validation |

### Key Insight

All patterns share one principle: **never trust data type preservation across transport boundaries**. Always validate and coerce at the receiving end.

**Corollary for storage**: A database write is also a boundary crossing. If a jsonb column accepts a string without error, the bug is invisible until read time. Treat every Prisma `create`/`update` of MCP-sourced data as a boundary.

---

## Prevention: New Sites

### New callTool Site

```javascript
const { ensureObject } = require('../../../../utils/ensure-object');

// Before any external callTool
const callArguments = ensureObject(myArguments, {}, 'MyTool.arguments');

const result = await client.callTool({
  name: toolName,
  arguments: callArguments
});
```

### New Prisma Storage Site

```javascript
const { ensureObject } = require('../../../../utils/ensure-object');

// Before any Prisma create/update with MCP-sourced JSON fields
const service = await this.prisma.mCPTool.create({
  data: {
    name: validatedArgs.name,
    capabilities: ensureObject(validatedArgs.capabilities, {}, 'registry.register.capabilities'),
    configuration: ensureObject(validatedArgs.configuration, {}, 'registry.register.configuration'),
    // ... other fields
  }
});
```

---

## Evidence

### Discovery Timeline

- **Feb 15, 2026**: Variant A discovered when Claude Code `services(action: "call")` failed for eia-service and weather-service
- **Feb 15, 2026**: Traced through full call chain (10 files, MCP SDK source)
- **Feb 15, 2026**: Fixed 4 callTool sites, pattern documented
- **Feb 22, 2026**: Variant B discovered during Hub essentials smoke test — `registry(action: "register")` stored capabilities as jsonb string, `registry(action: "tools")` returned empty tools
- **Feb 22, 2026**: Root cause: `ensureObject` missing on 2 Prisma storage paths in `service-registration-handler.js`
- **Feb 22, 2026**: Also fixed: Zod schema rejected object-format tools, validation module unreachable (wrong import path + missing CJS bridge)
- **Feb 22, 2026**: Variant B-2 discovered during post-fix smoke test — `registry(action: "update")` `updates` parameter arrived as string, `Object.keys()` returned char indices `["0","1",...,"74"]`, destructuring produced empty object (no fields updated)
- **Feb 22, 2026**: Fixed with `ensureObject` guard before destructuring in `service-update-handler.js`
- **Feb 22, 2026**: Full bug class sweep — found 2 more sites in `workflow-tools-handler.js`: `steps` array parameter (JSON string → `Array.isArray` false) and step-level `arguments` on internal router path (bypassed existing external-only guard)
- **Feb 22, 2026**: Also fixed cosmetic: `service-registration-handler.js` verification example used raw `args` instead of `validatedArgs`

### Commits

1. `06b15510` - fix(mcp-hub): Defensive argument deserialization for cross-service calls (3 sites + validation)
2. `0daad823` - fix(mcp): Patch sleeper argument serialization bug in mcpService callTool (1 sleeper)
3. `c000c2df` - fix: capabilities double-encoding in registry(action: "register") + Zod schema + CJS validation bridge
4. `097c843e` - fix(hub): transport boundary guard on registry(action: "update") updates parameter
5. `a3d329ca` - fix(hub): transport boundary guards on workflow steps and step arguments

### Test Results

**Variant A (Feb 15)**:
- Before fix: All `services(action: "call")` calls failed with `-32602` / `-32603`
- After fix: All 4 service calls succeeded (eia-service: 4.8s, weather: 300ms, weather current: 35ms)

**Variant B (Feb 22)**:
- Before fix: `jsonb_typeof(capabilities) = 'string'`, `registry(action: "tools")` returned `{ tools: [], schemaVersion: 1 }`
- After fix: `jsonb_typeof(capabilities) = 'object'`, `registry(action: "tools")` returned `{ tools: [{name, description, inputSchema}], schemaVersion: 2, grade: "A" }`

**Variant B-2 (Feb 22)**:
- Before fix: `updatedFields: ["0","1",...,"74"]`, returned service showed old description/version
- After fix: `updatedFields: ["description","version"]`, returned service shows updated values

---

## Confidence Assessment

| Factor | Score | Notes |
|--------|-------|-------|
| Bug reproducibility | 100% | Consistent failure before fix (both variants) |
| Fix effectiveness | 100% | All calls and storage verified after fix |
| Coverage completeness | 99% | 5 callTool + 3 storage/iteration + 1 array param + 6 internal verified safe. Full sweep complete. |
| Defense-in-depth | High | ensureObject + Zod schema + CJS bridge + typeof guard |
| Regression risk | Low | Additive fix, no behavior change for already-correct arguments |

**Overall Confidence**: 99%

---

**Created By**: Claude Opus 4.6 + Steve Terry
**Date**: February 15, 2026
**Updated**: February 22, 2026
**Status**: Production-validated (both variants)
