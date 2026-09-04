# Boundary Response Shape Discovery

**Last Updated**: 2026-03-29
**Status**: v1.0 - Initial creation after /agents page bug session
**Confidence**: High - Pattern identified from 4 production bugs in one session
**Last Validated**: 2026-03-29

## Objective

Systematically discover response shape mismatches between API routes and their client-side consumers (adapters, service layers, and direct fetch calls). These bugs are silent — the API returns 200, the data arrives, but the consumer reads the wrong field and crashes or shows stale/empty data.

## Context

In the Mar 28 2026 session, four bugs were found on the `/agents` page — all caused by response shape mismatches:

1. **Adapter read `data.template` but API returned `data.data`** → crash on `.id`
2. **Adapter didn't send `metadata` in PUT body** → modelParameters never persisted
3. **API `select` clause omitted `promptTemplate` and `metadata`** → adapter couldn't read back updated values
4. **`getTemplates()` hardcoded modelParameters** instead of reading `template.metadata?.modelParameters` → wrong model shown in list

All four were at the boundary between the adapter layer (`lib/pov/api/`) and the API route layer (`app/api/`). The same pattern can exist at any boundary.

## Boundary Map

### Boundary 1: Adapter → API Route (highest risk)
Adapters transform between the UI's data model and the API's Prisma model. Every field rename (`role` ↔ `defaultRole`, `prompt` ↔ `promptTemplate`) is a potential mismatch.

**Files**:
- `lib/pov/api/agent-templates-adapter.ts` → `app/api/agent-templates/route.ts` + `[templateId]/route.ts`
- `lib/pov/api/agent-service.ts` → `app/api/pov/agent/execute/stream/route.ts` + status/artifacts routes
- `lib/pov/api/function-executor.ts` → `app/api/documentation/search/route.ts` + task routes

### Boundary 2: Component → API (direct fetch, no adapter)
Components that call `fetch()` directly without an adapter layer — field expectations are implicit.

**Files**:
- `components/agents/AgentBuilder.tsx` → `app/api/tasks/[taskId]/route.ts`, `app/api/agents/configure/route.ts`
- `app/(authenticated)/agents/page.tsx` → `app/api/auth/me/route.ts`

### Boundary 3: MCP Handler → Prisma Response
MCP action handlers receive Prisma query results and format them for the MCP protocol. Select clauses may omit fields the handler references.

**Files**:
- `lib/mcp/handlers/agent-results-handler.ts` — reads execution artifacts
- `lib/mcp/handlers/agent-status-handler.ts` — reads execution status
- `lib/mcp/tasks/action/handlers/agent/agent-*-handler.ts` — all agent action handlers

### Boundary 4: Streaming Route → LLM Provider
The streaming route and engine build prompts from task/template data. Field expectations (promptTemplate, metadata.modelParameters, capabilities, constraints) must match what the Prisma include/select returns.

**Files**:
- `app/api/pov/agent/execute/stream/route.ts` — task include clause vs prompt assembly
- `lib/services/agentExecutionEngine.ts` — task query vs `buildSystemPrompt` (here) / `buildAgentPrompt` (delegates to `lib/agents/harness/build-agent-prompt-body.ts:buildAgentPromptBody` since B1-S2 — the §1-§8 user prompt reads task fields there)

**Response-shape parity (SDK 0.105, 2026-06)** — the engine and stream must finalize terminal stops IDENTICALLY:
- `lib/services/llm/finalize-response.ts:finalizeTextForStopReason` — the SHARED finalizer both paths call
  (max-turns / max_tokens / refusal). Parity is guaranteed by sharing; a divergence here = a streamed truncation/refusal
  silently losing its user-facing message (the gap this closed).
- `lib/services/llm/anthropic-sdk-provider.ts:normalizeStopReason` — maps `stop_reason` → the typed union with NO `as`
  laundering (both the generate `:323`-ish and stream cast sites route through it). `rawContentBlocks` is `unknown[]`.

### Boundary 5: MCP Poll-and-Return → Handler Response
The task-action-handler.js extracts fields from handler responses (e.g., `data.data?.result?.execution?.id`). If the handler's response shape changes, polling breaks silently.

**Files**:
- `lib/mcp/server/tools/advanced/task-action-handler.js` line 313 — reads `data.data?.result?.execution?.id`
- All handlers in `lib/mcp/tasks/action/handlers/` — must match expected shape

### Boundary 6: Schema Select File → Service-Layer Runtime Query (Phantom Canonical, May 2026)

**The hazard**: an exported `fullX` / `withY` select in `lib/<domain>/prisma/select.ts` looks like the source of truth, but a service layer (often after an N+1 optimization) hand-rolls its own select that omits fields the canonical includes. Any consumer auditing only the schema file concludes the wire carries the field — but production never loads it.

**Canonical example**: `lib/pov/prisma/select.ts:fullPOV` includes `taskFullSelect` (with `dependencies` + `dependents`). `lib/pov/services/pov.ts:23 PoVService.get()` was rewritten as a 1000ms→200ms optimization with a hand-rolled select that strips dependency edges. Six specialists audited the schema file and concluded "the wire carries deps" — none grepped the service file. See pattern `two-execution-path-drift-pattern.md` §Phantom Canonical Variant.

**Detection greps** — run BOTH when auditing any data-shape mismatch:
```bash
# 1. The canonical file (what looks like source of truth)
grep -n "<fieldName>" lib/<domain>/prisma/select.ts

# 2. The actual production query — service layer
grep -rn "prisma\.<model>\.\(findUnique\|findMany\|findFirst\)" lib/<domain>/services/ lib/<domain>/handlers/

# 3. Optimization markers — high-confidence phantom-canonical signal
grep -rn "// OLD CODE\|// commented for rollback\|N+1\|optimized version" lib/<domain>/services/

# 4. Phantom canonical heuristic — file imports the canonical but uses a literal-object select instead
grep -l "import.*fullX\|import.*<canonicalName>" lib/<domain>/services/ | \
  xargs grep -L "fullX\.include\|fullX\.select"
# Output = files that import the canonical but never invoke it = phantom canonicals
```

**Files at structural risk** (have both a schema select file and a service file with hand-rolled queries):
- `lib/pov/prisma/select.ts` ↔ `lib/pov/services/pov.ts` ✅ fixed in commit `8d256992`
- `lib/tasks/prisma/select.ts` ↔ any service in `lib/tasks/` doing custom selects — audit
- `lib/agents/prisma/select.ts` (if it exists) ↔ agent-template / execution services

## Search Strategies

### Phase 1: Adapter ↔ API Response Shape Audit

```bash
# Find all response transformations in adapters
echo "=== Adapter Response Transformations ==="
grep -n "data\.\|response\.\|\.json()" \
  /home/steve/copov15/lib/pov/api/agent-templates-adapter.ts \
  /home/steve/copov15/lib/pov/api/agent-service.ts \
  /home/steve/copov15/lib/pov/api/function-executor.ts

# Find all API response shapes (NextResponse.json)
echo ""
echo "=== API Response Shapes ==="
grep -n "NextResponse.json" \
  /home/steve/copov15/app/api/agent-templates/route.ts \
  /home/steve/copov15/app/api/agent-templates/\[templateId\]/route.ts

# Find field renames between adapter and API
echo ""
echo "=== Field Renames (adapter → API) ==="
grep -n "defaultRole\|promptTemplate\|contextTemplate\|modelParameters" \
  /home/steve/copov15/lib/pov/api/agent-templates-adapter.ts
```

**What to look for**:
- Adapter reads `data.X` but API returns `data.Y` (e.g., `data.template` vs `data.data`)
- Adapter sends field A in request body but API validation schema expects field B
- API select clause omits fields the adapter tries to read from the response
- Adapter hardcodes defaults instead of reading from response (like hardcoded modelParameters)

### Phase 2: API Select Clause Completeness

```bash
# Find all Prisma select clauses in API routes
echo "=== API Select Clauses ==="
grep -A20 "select:" \
  /home/steve/copov15/app/api/agent-templates/route.ts \
  /home/steve/copov15/app/api/agent-templates/\[templateId\]/route.ts | \
  grep -E "select:|true|false"

# Compare: what does the adapter expect to read?
echo ""
echo "=== Adapter Field Access ==="
grep -n "updatedTemplate\.\|template\.\|data\." \
  /home/steve/copov15/lib/pov/api/agent-templates-adapter.ts | \
  grep -v "^.*\/\/" | head -30
```

**What to look for**:
- Adapter accesses `response.promptTemplate` but API select doesn't include `promptTemplate: true`
- Adapter accesses `response.metadata` but API select doesn't include `metadata: true`
- GET (list) endpoint has a different select from GET (single) endpoint — fields available on detail view but missing from list

### Phase 3: Direct Fetch Response Shape Audit

```bash
# Find components making direct fetch calls
echo "=== Direct Fetch Calls in Components ==="
grep -rn "fetch(" --include="*.tsx" --include="*.ts" \
  /home/steve/copov15/components/ \
  /home/steve/copov15/app/\(authenticated\)/ | \
  grep -v node_modules | grep -v ".next" | head -30

# For each: what response shape does the component expect?
echo ""
echo "=== Response Shape Expectations ==="
grep -n "\.json()\|data\.\|\.data\|\.error\|\.success" \
  /home/steve/copov15/components/agents/AgentBuilder.tsx
```

### Phase 4: MCP Handler Response Shape Audit

```bash
# Find all MCP handler return shapes
echo "=== MCP Handler Return Shapes ==="
grep -n "return {" \
  /home/steve/copov15/lib/mcp/tasks/action/handlers/agent/agent-execute-handler.ts \
  /home/steve/copov15/lib/mcp/tasks/action/handlers/agent/agent-assign-handler.ts \
  /home/steve/copov15/lib/mcp/tasks/action/handlers/agent/agent-configure-handler.ts \
  /home/steve/copov15/lib/mcp/handlers/agent-results-handler.ts \
  /home/steve/copov15/lib/mcp/handlers/agent-status-handler.ts

# Find what task-action-handler expects from these returns
echo ""
echo "=== Poll-and-Return Field Access ==="
grep -n "data\.data\?\." \
  /home/steve/copov15/lib/mcp/server/tools/advanced/task-action-handler.js
```

### Phase 5: Prompt Assembly Parity Check

```bash
# Compare system prompt assembly across all 3 execution paths
echo "=== System Prompt Assembly — Streaming Route ==="
grep -n "systemPrompt\s*=" \
  /home/steve/copov15/app/api/pov/agent/execute/stream/route.ts

echo ""
echo "=== System Prompt Assembly — Engine ==="
grep -n "systemPrompt\|buildSystemPrompt" \
  /home/steve/copov15/lib/services/agentExecutionEngine.ts | head -10

echo ""
echo "=== System Prompt Assembly — Configure Handler ==="
grep -n "systemPrompt\|finalSystemPrompt\|resolvePromptPlaceholders" \
  /home/steve/copov15/lib/mcp/tasks/action/handlers/agent/agent-configure-handler.ts | head -10
```

**What to look for**:
- One path prepends extra text that others don't (the "You are an AI assistant" bug)
- One path resolves placeholders but another doesn't
- One path includes capabilities/constraints but another doesn't

## Smoke Test Specification

For each boundary, a smoke test should:

1. **Call the API** with a known input
2. **Capture the response shape** (field names and types, not values)
3. **Compare against the adapter/consumer's expectations** (the field names it reads)
4. **Flag mismatches**: field present in consumer but absent in response, or field name differs

### Test Format
```
Boundary: [adapter file] → [API route]
Method: [GET/PUT/POST/DELETE]
Consumer reads: [list of fields the adapter accesses]
API returns: [list of fields in the response]
Missing: [fields consumer expects but API doesn't return]
Extra: [fields API returns but consumer ignores — low risk but worth documenting]
```

### Priority Order
1. **agent-templates-adapter ↔ agent-templates API** (4 bugs found here)
2. **agent-service ↔ agent execution APIs** (SSE streaming, artifact retrieval)
3. **MCP handlers ↔ task-action-handler** (poll-and-return field access)
4. **Direct component fetches** (AgentBuilder → tasks API, configure API)
5. **Prompt assembly parity** (3 paths should produce identical output)

## Known Bug Classes at Boundaries

| Bug Class | Example | Detection |
|-----------|---------|-----------|
| **Response field mismatch** | `data.template` vs `data.data` | Compare adapter field reads to API response keys |
| **Missing select field** | API omits `metadata` from select | Compare adapter field reads to API select clause |
| **Hardcoded fallback masking real data** | `getTemplates()` hardcodes modelParameters | Search for hardcoded defaults in response transforms |
| **Request body missing field** | PUT doesn't send `metadata` | Compare adapter request body to API validation schema |
| **Parity drift between paths** | Streaming route prepends role line, engine doesn't | Diff system prompt assembly across paths |
| **List vs Detail asymmetry** | List endpoint missing fields that detail endpoint has | Compare select clauses between list and detail routes |
