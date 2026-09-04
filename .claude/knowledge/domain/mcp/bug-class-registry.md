# MCP Bug Class Registry

**Version**: 1.0
**Created**: 2026-02-16
**Author**: Claude Opus 4.6 + Steve Terry
**Purpose**: Catalog of all known and potential bug classes in the pAIchart MCP ecosystem
**Protocol**: `/.claude/knowledge/protocols/bug-class-eradication-protocol.md`

---

## Overview

A **bug class** is a family of bugs sharing the same root cause that manifests at multiple **sites** across the codebase. This registry tracks all known bug classes, their status, affected files, detection commands, and remediation guidance.

### Status Legend

| Status | Meaning |
|--------|---------|
| ERADICATED | All sites found and fixed, shared defense created, knowledge base updated |
| IDENTIFIED | Bug class recognized, sites cataloged, fix pending |
| MONITORED | Low risk, known locations, accepted with monitoring |
| POTENTIAL | Theoretical risk based on architecture, not yet observed |

### Severity Ratings

| Severity | Impact |
|----------|--------|
| CRITICAL | Data loss, security bypass, or complete feature failure |
| HIGH | Feature malfunction, silent data corruption |
| MEDIUM | Intermittent failures, degraded behavior |
| LOW | Cosmetic issues, minor inconvenience |

---

## Bug Class 1: Transport Boundary Coercion

**Status**: ERADICATED
**Severity**: CRITICAL
**Discovered**: February 15, 2026
**Eradicated**: February 16, 2026 (Variant A: callTool sites)
**Extended**: February 22, 2026 (Variant B: Prisma storage, Variant B-2: iteration, array params)

### Description

MCP transports (stdio, SSE, HTTP) may silently serialize nested objects to JSON strings when data crosses transport boundaries. Three variants discovered:

- **Variant A (loud)**: An `arguments` object like `{state: "TX"}` arrives at the downstream service as the string `'{"state":"TX"}'`, causing Zod validation to reject it with "Expected object, received string".
- **Variant B (silent)**: Object stored in Prisma jsonb column as string literal — `jsonb_typeof = 'string'` instead of `'object'` — subsequent reads find no properties.
- **Variant B-2 (silent)**: Object iterated with `Object.keys()` or destructured — string returns character indices `["0","1",...,"74"]`, destructuring produces empty object.

### Root Cause

Different MCP transports handle nested object serialization differently. The MCP SDK's internal JSON serialization may stringify nested objects during transit. This is invisible in the SDK layer - no explicit `JSON.stringify()` call exists in user code.

### Symptom

```
MCP error -32602: Service call to [service] failed: MCP error -32603: [
  { "code": "invalid_type", "expected": "object", "received": "string",
    "path": ["params", "arguments"] }
]
```

### Shared Defense

`ensureObject()` utility - parses JSON strings back to objects, passes objects through unchanged.

| File | Format | Used By |
|------|--------|---------|
| `lib/utils/ensure-object.ts` | TypeScript/ESM | Main app modules |
| `lib/utils/ensure-object.js` | CommonJS | JS modules (mcp-server-v5, bridge, handlers) |
| Inlined in each Docker service | TypeScript | Docker services (cannot import from lib/) |

### All Sites (25 total)

#### P0 - Were Unguarded, Now Fixed (8 sites)

| # | File | Guard Added |
|---|------|-------------|
| 1 | `mcp-server-v5.js` (~line 1121) | `ensureObject(rawArgs, {}, 'MCP Server v5')` |
| 2 | `mcp-embedded-bridge.js` (~line 72) | `ensureObject(rawArgs, {}, 'Embedded Bridge')` |
| 3 | `services/eia-service/src/index.ts` (~line 119) | `ensureObject(args)` before `.parse()` |
| 4 | `services/weather-service/src/index.ts` (~line 134) | `ensureObject(args)` before `.parse()` |
| 5 | `services/eodhd-service/src/index.ts` (~line 103) | `ensureObject(args)` before `.parse()` |
| 6 | `services/browser-automation-service/src/index.ts` (~line 155) | `ensureObject(args)` before `.parse()` |
| 7 | `services/notification-service/src/index.ts` (~line 135) | `ensureObject(args)` before `.parse()` |
| 8 | `services/test-auth-service/src/index.ts` (~line 53) | `ensureObject(args)` before `.parse()` |

#### P1 - Refactored to Shared Utility (4 sites)

| # | File | Before | After |
|---|------|--------|-------|
| 1 | `lib/mcp/server/tools/hub/service-call-handler.js` (~line 400) | 6-line inline typeof guard | `ensureObject(validatedArgs.arguments, {}, 'Service Call')` |
| 2 | `lib/mcp/server/tools/hub/workflow-tools-handler.js` (~line 475) | 6-line inline typeof guard | `ensureObject(args, {}, 'Workflow Step')` |
| 3 | `lib/services/workflow/integrations/service-caller.ts` (~line 322) | 4-line inline typeof guard | `ensureObject(args, {}, 'ServiceCaller')` |
| 4 | `lib/services/mcp/mcpService.ts` (~line 501) | 4-line inline typeof guard | `ensureObject(arguments_, {}, 'MCP Service')` |

#### P2 - Internal Only, Safe (6 sites)

| # | File | Why Safe |
|---|------|----------|
| 1 | `lib/mcp/embedded-server.ts` (callWithElicitation) | Self-call wrapper |
| 2 | `lib/services/mcp/mcpClientWrapper.ts` | Delegates to embedded |
| 3 | `app/api/mcp/tools/[toolId]/test/route.ts` | Calls embedded directly |
| 4 | `lib/services/mcp/serverManager.ts` | Delegates to mcpService |
| 5 | `lib/services/llm/llm-service.ts` | Delegates to mcpService |
| 6 | `lib/services/agentExecutionEngine.ts` | Internal tool dispatch |

#### P3 - Defense-in-Depth (1 site)

| # | File | Reason |
|---|------|--------|
| 1 | `lib/mcp/embedded-server.ts` (callTool method) | Receives external args indirectly via mcpService.callEmbeddedTool |

#### P4 - Variant B: Prisma Storage Boundary (3 sites, Feb 22 2026)

Objects stored in jsonb columns as strings when `ensureObject` was missing before `prisma.create()`/`prisma.update()`.

| # | File | Column | Variant |
|---|------|--------|---------|
| 1 | `lib/mcp/server/tools/hub/service-registration-handler.js` (~line 246) | MCPTool.capabilities | B (pending approval path) |
| 2 | `lib/mcp/server/tools/hub/service-registration-handler.js` (~line 305) | MCPTool.capabilities | B (auto-approve path) |
| 3 | `lib/mcp/server/tools/hub/service-update-handler.js` (~line 72) | args.updates | B-2 (Object.keys on string → char indices) |

#### P5 - Variant: Array Parameter + Internal Router (2 sites, Feb 22 2026)

Array parameters and step-level arguments on internal code paths that bypassed existing external-only guards.

| # | File | What Failed |
|---|------|-------------|
| 1 | `lib/mcp/server/tools/hub/workflow-tools-handler.js` (~line 515) | `steps` array arrived as string → `Array.isArray` returned false → misleading error |
| 2 | `lib/mcp/server/tools/hub/workflow-tools-handler.js` (~line 250) | Step-level `arguments` on internal router path (external path already guarded at ~line 446) |

### Detection Commands

```bash
# Find all callTool sites
grep -rn '\.callTool(' --include='*.{js,ts}' | grep -v node_modules | grep -v '.d.ts'

# Find unguarded sites (missing ensureObject)
grep -rn '\.callTool(' --include='*.{js,ts}' | grep -v node_modules | grep -v ensureObject

# Verify all Docker services have inline guard
grep -rn 'ensureObject' services/*/src/index.ts

# Verify all hub handlers use shared utility
grep -rn 'ensureObject' lib/mcp/server/tools/hub/
```

### Commits

| Commit | Description |
|--------|------------|
| `06b15510` | Initial fix - 3 hub sites + validation schema |
| `0daad823` | Sleeper fix - mcpService.ts callTool |
| `82c40f9f` | Eradication - shared utility, 13 sites, 6 Docker services |
| `c000c2df` | Variant B: capabilities double-encoding in registry(action: "register") + Zod schema + CJS bridge |
| `097c843e` | Variant B-2: transport boundary guard on registry(action: "update") updates parameter |
| `a3d329ca` | Sweep: transport boundary guards on workflow steps and step arguments |

### References

- Pattern: `/.claude/knowledge/patterns/transport-boundary-argument-coercion-pattern.md`
- Gold standard: `/.claude/knowledge/patterns/docker-mcp-service-gold-standard-v2.md`
- Reviews: `cline_docs/reviews/ensure-object-utility-2026-02-15/`

---

## Bug Class 2: Prisma Json Column Ambiguity

**Status**: ERADICATED (all known unsafe cast sites)
**Severity**: MEDIUM
**Discovered**: February 15, 2026 (during transport boundary audit)
**Partially Eradicated**: February 16, 2026 (3 proven-risk columns, 9 guards)
**Fully Eradicated**: February 16, 2026 (6 additional columns, 23 total guards across 12 files)

### Description

Prisma's `Json` type columns can return either a parsed object or a raw JSON string depending on the database driver, connection pooling state, and how the data was originally stored. Code that assumes `Json` columns always return objects (via `as Record<string, unknown>` casts) may silently fail when a string is returned.

### Root Cause

PostgreSQL's `jsonb` type stores structured data, but Prisma's deserialization is not guaranteed to always produce a JavaScript object. If data was stored as a JSON string (e.g., double-serialized), it will be returned as a string. Direct `as` casts bypass runtime type checking.

### Symptom

```typescript
// Reads metadata from a Json column
const meta = artifact.metadata as Record<string, unknown>;
meta.key  // undefined - because metadata is actually the string '{"key":"value"}'
```

No error is thrown. The cast silently succeeds, and property access returns `undefined` instead of the expected value.

### Evidence of Real Bug

Manual `typeof === 'string'` guards in the codebase prove this bug class has manifested:

| File | Guard | Column |
|------|-------|--------|
| `app/api/pov/[povId]/phase-templates/route.ts` (was line 27, 97) | `typeof pov.metadata === 'string'` | POV.metadata |
| 5 files with `typeof template.schema === 'string'` guards | Manual JSON.parse | POVTemplate.schema |

### Shared Defense

**Runtime**: `ensureObject()` — parses JSON strings back to objects, passes objects through unchanged.

**Validation layer**: `objectOrJsonString` Zod helper (`lib/validation/zod-helpers.ts`) — strict variant that reports Zod errors on invalid JSON. Used for nested fields at validation boundaries (e.g., `services(action: "call")` arguments).

### Affected Columns (55 total across 22 models)

> **Naming convention reminder (added 2026-04-26 after the AgentExecution mis-attribution incident):**
>
> This table lists Prisma **model** names (PascalCase) and **field** names (camelCase). The underlying Postgres tables and columns use snake_case via `@@map`/`@map` annotations in `prisma/schema.prisma`. Examples:
> - Model `Task` → table `tasks`; field `inputContext` → column `input_context`
> - Model `AgentExecution` → table `agent_executions`; field `mcpContext` → column `mcp_context`
> - Model `Stage` → table `stages`; field `metadata` → column `metadata` (no rename, but the table is plural)
>
> When auditing, **always cross-check the field-to-model attribution by opening `prisma/schema.prisma`** before adding a row to this table. The 2026-04-25 audit found that `inputContext`, `outputArtifacts`, `mcpContext`, and `mcpMetadata` had been incorrectly listed under `AgentExecution`; they all live on `Task`. Two fields with similar names can sit on different models (e.g., `Task.metadata` vs `Stage.metadata` vs `AgentExecution.config`) — never assume from the field name alone.
>
> Practical workflow: `grep -n "^  fieldName " prisma/schema.prisma` to locate which `model` block contains the field, then update the registry row for *that* model.

| Model | Columns | Risk | Status |
|-------|---------|------|--------|
| `POV` | documents, featureRequests, supportTickets, blockers, resources, **formData**, **metadata** | Medium | **formData, metadata GUARDED** |
| `POVTemplate` | **schema** | Medium | **GUARDED (service layer)** |
| `Task` | **metadata, inputContext, mcpContext, mcpMetadata, outputArtifacts** | Mixed | **metadata GUARDED** (BC19 + Phase 4 #12); **inputContext GUARDED** (MCP path BC19 + service path Phase 4 #30); **mcpContext GUARDED** (service path Phase 4 #31; wholesale-by-design at agent.configure C5 documented); **mcpMetadata GUARDED** (service path Phase 4 #32; wholesale-by-design at agent.configure documented); **outputArtifacts WHOLESALE-BY-DESIGN** (C2 documented exemption — not in REST validator, engine paths write canonical full list at execution-success) |
| `Activity` | details, **metadata** | Medium - written by multiple services | **metadata GUARDED (3 sites)** |
| `Workflow` | **metadata** | Medium - workflow completion | **GUARDED** |
| `MCPWorkflow` | **steps** | Medium - workflow config | **GUARDED** |
| `MCPWorkflowExecution` | **metadata**, steps, input, output | Medium - built during workflow | **metadata GUARDED (2 sites)** |
| `MCPPrompt` | **variables**, examples, arguments | Low - admin-configured | **variables GUARDED** |
| `AgentExecution` | **config**, **context** | Mixed | **config GUARDED** (Phase 4 entry #29 at `app/api/mcp/automations/[id]/configure/route.ts:262`); **context N/A** (write-once-at-create, no update surface — confirmed by Phase 4 follow-up audit C6, see `lib/services/agent-execution-create.ts:126`). **Note (corrected 2026-04-25):** prior registry rows incorrectly attributed `inputContext, outputArtifacts, mcpContext, mcpMetadata` to AgentExecution; those columns live on the `Task` model — see the Task row above. |
| `AgentTemplate` | **capabilities, constraints, inputSchema, outputSchema, contextTemplate, metadata** | Medium - admin-configured | **GUARDED (2026-04-25, all 6 jsonb cols via per-field shallow-merge in PUT route)** |
| `AgentArtifact` | metadata | Medium - written by agent engine | Unguarded (no unsafe casts found) |
| `MCPTool` | configuration, capabilities | Medium - written by service registration | Unguarded (no unsafe casts found) |
| `Notification` | metadata | Low - simple notification data | Unguarded (no unsafe casts found) |
| `Stage` | **metadata** | Medium - written by harness back-pointer + service updates | **GUARDED (2026-04-25, shallow-merge in `phase.ts:updateStage`).** Two write paths: `lib/pov/services/phase.ts` `updateStage` (service layer) AND `lib/mcp/tasks/action/handlers/task/task-update-handler.ts:503-area` (in-tx server-side back-pointer write at PIPELINE harness `task.update`). Any third writer must follow shallow-merge convention; bypassing the service requires same-tx read-then-merge. |

### Guarded Sites (26 guards across 15 files)

#### Phase 3 — Specialist-reviewed (9 guards, 3 files)

##### P0 CRITICAL: `lib/pov/templates/import-export.ts` (3 guards)

Read-modify-write loop on POV Json columns that writes corrupted data back to DB.

| # | Line | Column | Guard |
|---|------|--------|-------|
| 1 | ~222 | POV.formData | `ensureObject(pov.formData, {}, 'POV formData (validation)')` |
| 2 | ~366 | POV.formData | `ensureObject(pov.formData, {}, 'POV formData (import update)')` |
| 3 | ~383 | POV.metadata | `ensureObject(pov.metadata, {}, 'POV metadata (import update)')` |

##### P1 HIGH: `lib/pov/templates/service.ts` (4 guards)

Service-layer source guard protects ALL downstream POVTemplate consumers.

| # | Line | Method | Guard |
|---|------|--------|-------|
| 4 | ~54 | `createTemplate()` | `ensureObject(created.schema, {}, 'POVTemplate schema')` |
| 5 | ~69 | `getTemplate()` | `ensureObject(template.schema, {}, 'POVTemplate schema')` |
| 6 | ~80 | `getAllTemplates()` | `ensureObject(t.schema, {}, 'POVTemplate schema')` |
| 7 | ~127 | `updateTemplate()` | `ensureObject(updated.schema, {}, 'POVTemplate schema')` |

##### P2 MEDIUM: `app/api/pov/[povId]/phase-templates/route.ts` (2 guards)

Refactored existing manual `typeof` guards to `ensureObject()`.

| # | Line | Column | Replaced |
|---|------|--------|----------|
| 8 | ~28 | POV.metadata | Was `typeof pov.metadata === 'string' ? JSON.parse(...)` |
| 9 | ~93 | POV.metadata | Was `typeof pov.metadata === 'string' ? JSON.parse(... \|\| '{}')` |

#### Discovery pass — Schema-verified (14 guards, 9 files)

##### P0 CRITICAL — Write-back corruption (5 guards)

| # | File | Column | Pattern |
|---|------|--------|---------|
| 10 | `lib/pov/services/metadata.ts` | POV.metadata | `{ ...currentMetadata, ...metadata }` → `prisma.pOV.update()` |
| 11 | `lib/pov/services/workflow.ts` | Workflow.metadata | `{ ...metadata, ...data.metadata }` → `prisma.workflow.update()` |
| 12 | `lib/mcp/tasks/action/handlers/agent/agent-configure-handler.ts` | Task.metadata | `{ ...existingMetadata, modelParameters }` → `updateData.metadata` |
| 13 | `lib/services/workflow/tracking/orchestration-tracker.ts` | MCPWorkflowExecution.metadata | `{ ...existingMetadata, stepsCompleted }` → `prisma.update()` |
| 14 | `lib/services/workflow/tracking/orchestration-tracker.ts` | MCPWorkflowExecution.metadata | `{ ...metadata, steps: updatedSteps }` → `prisma.update()` |

##### P1 HIGH — Feature failure (5 guards)

| # | File | Column | Usage |
|---|------|--------|-------|
| 15 | `lib/workflows/handlers.ts` | MCPWorkflow.steps | Config extraction (steps, executionMode, failureStrategy) |
| 16 | `lib/mcp/embedded-server.ts` | MCPPrompt.variables | Variable substitution in prompt rendering |
| 17 | `lib/mcp/server/tools/hub/workflow-tools-handler.js` (~614) | MCPWorkflow.steps | Config extraction (JS handler — same column as #15) |
| 18 | `lib/mcp/server/tools/hub/workflow-tools-handler.js` (~768) | MCPWorkflowExecution.steps | Step progress array (Array.isArray guard) |
| 19 | `lib/mcp/server/tools/hub/workflow-tools-handler.js` (~930) | MCPWorkflowExecution.steps | Step completion count (Array.isArray guard) |

##### P2 MEDIUM — API response (4 guards, null-preserving)

| # | File | Column | Pattern |
|---|------|--------|---------|
| 20 | `lib/admin/prisma/mappers.ts` | Activity.metadata | `activity.metadata ? ensureObject(...) : undefined` |
| 21 | `lib/admin/services/activity.ts` | Activity.metadata | Same (getActivities response) |
| 22 | `lib/admin/services/activity.ts` | Activity.metadata | Same (logActivity response) |
| 23 | `lib/dashboard/prisma/mappers.ts` | Activity.metadata | `activity.metadata ? ensureObject(...) : null` |

#### P6 — JSON.parse safety sweep catch (3 sites, Feb 26 2026)

Bare `typeof === 'string' ? JSON.parse(...) : ...` pattern that predated the `ensureObject` utility. Replaced with `ensureObject()` for crash-safe coercion.

| # | File | Column | Pattern |
|---|------|--------|---------|
| 24 | `app/api/pov-templates/[id]/phase-templates/route.ts` (~192) | POVTemplate.schema | `getPhaseTemplateIds` helper — bare JSON.parse |
| 25 | `app/api/pov-templates/[id]/phase-templates/standardized-route.ts` (~192) | POVTemplate.schema | Same helper, duplicate file |
| 26 | `lib/services/template-service.ts` (~178) | POVTemplate.schema | `normalizeTemplate` — bare JSON.parse |

#### Phase 4 — 2026-04-25 sweep (write-back corruption discovered, 2 sites)

**Why this pass:** Phase 3 (2026-02) audited for unsafe-read-cast variants. This pass swept for whole-replace WRITE corruption — distinct from read-cast bugs because the validator marks fields optional but Prisma whole-replaces any field present in `data`. Discovered while planning the harness clobber-detection defense (`stages.metadata.harnessTaskId` back-pointer needed a durable anchor).

| # | File | Column | Pattern |
|---|------|--------|---------|
| 27 | `lib/pov/services/phase.ts` (~338) `updateStage` | Stage.metadata | `data.metadata \|\| currentStage.metadata` whole-replace → shallow-merge |
| 28 | `app/api/agent-templates/[templateId]/route.ts` (~224) PUT | AgentTemplate.{capabilities, constraints, inputSchema, outputSchema, contextTemplate, metadata} | Validator marks 6 jsonb fields optional → `prisma.agentTemplate.update({data: updateData})` whole-replaces any field present → per-jsonb shallow-merge inside tx |
| 29 | `app/api/mcp/automations/[id]/configure/route.ts` (~262) PUT | AgentExecution.config | `{ ...updates, ... }` whole-replace → shallow-merge inside tx (RepeatableRead). Lower-risk because config is reset between executions, but pattern-identical to #27/#28; fixed for consistency 2026-04-25 (post-Phase-4 sweep). |
| 30 | `lib/tasks/services/task.ts` (~675) `updateTask` | Task.inputContext | UpdateTaskSchema marks `.nullable().optional()` → caller-supplied partial value would whole-replace. **Was C1 in candidate list.** Service-path callers were silently more dangerous than the MCP path (which already shallow-merged via BC19 fix at task-update-handler.ts:545). Fixed: per-jsonb shallow-merge inside tx (RepeatableRead). |
| 31 | `lib/tasks/services/task.ts` (~686) `updateTask` | Task.mcpContext | Same as #30. **Was C3 in candidate list.** |
| 32 | `lib/tasks/services/task.ts` (~689) `updateTask` | Task.mcpMetadata | Same as #30. **Was C4 in candidate list.** |

**Audit pass entry (Protocol 6 Phase 6 mandatory record):** sweep run 2026-04-25 — 3 new sites found and guarded (2 in initial sweep + #29 in immediate follow-up). The third site was originally flagged as "deferred, lower risk" but addressed same-day after the initial sweep landed.

#### Phase 4 follow-up audit (resolved 2026-04-25)

After the initial sweep landed, a follow-up question surfaced 6 candidate sites where the wholesale-replace shape exists but the call may be **by design** rather than BC2-shaped. The audit walked each candidate's caller and validator. Resolutions:

| # | Site | Field | Resolution |
|---|------|-------|------------|
| C1 | `lib/tasks/services/task.ts:675` | Task.inputContext | **BC2 violation, fixed.** UpdateTaskSchema marks `.nullable().optional()`; service path callers (REST PUT via `app/api/tasks/[taskId]/route.ts:265`) could pass partial values that whole-replaced. Also: asymmetric with MCP path (`task-update-handler.ts:545`) which already shallow-merged via BC19. Fixed as Phase 4 entry #30. |
| C2 | `lib/tasks/services/task.ts:676` | Task.outputArtifacts | **Wholesale-replace by design.** Not in REST UpdateTaskSchema. Engine paths (`agentExecutionEngine.ts:1616`, `stream/route.ts:1452` — re-verified 2026-06-10 post tool-loop extraction) write the canonical full artifact list at execution-success time. Caller always passes the full canonical list — no partial-update surface. Documented as exempt with this reasoning. |
| C3 | `lib/tasks/services/task.ts:686` | Task.mcpContext | **BC2 violation, fixed.** Same shape as #C1. Fixed as Phase 4 entry #31. |
| C4 | `lib/tasks/services/task.ts:689` | Task.mcpMetadata | **BC2 violation, fixed.** Same shape as #C1. Fixed as Phase 4 entry #32. |
| C5 | `lib/mcp/tasks/action/handlers/agent/agent-configure-handler.ts:594` | Task.mcpContext (and mcpMetadata at :597) | **Wholesale-replace by design.** `unifiedMCPContext` is rebuilt from input parameters every time `agent.configure` is called — the semantic is "set the canonical config from THIS call's parameters." Calling `agent.configure` with a subset of parameters DOES wipe other config; that's the intent of "configure" (vs "patch"). Documented as exempt. **UX caveat**: if users expect partial reconfiguration, this is a UX bug, not a BC2 bug — separate concern. |
| C6 | AgentExecution.context | column | **N/A — no update surface.** `AgentExecution.context` is written ONCE at row creation (`lib/services/agent-execution-create.ts:126`) and never updated afterward. No `prisma.agentExecution.update({data: {context: ...}})` site exists in the codebase. Confirmed via grep. |

**Net outcome**: 3 new BC2 P0 sites fixed (#30, #31, #32), 2 wholesale-by-design sites documented with reasoning, 1 N/A (no update surface). Audit closed same-day as the candidate list was generated.

**Wholesale-replace-by-design policy** (added 2026-04-25): a jsonb column is exempt from BC2 shallow-merge requirements when ALL of the following hold:
1. **No partial-update entry point**: the column isn't writable via any REST/MCP validator that marks it optional. Service-only writers either pass the canonical full value or don't write it.
2. **Semantic clarity**: the design intent is "set/replace" not "patch/merge" — e.g., `outputArtifacts` is the canonical artifact list at completion; `agent.configure` rebuilds full config from input.
3. **Documented exception**: registry entry explains the reasoning so future readers don't re-flag it as a BC2 candidate.

When in doubt, prefer shallow-merge — wholesale-replace is the bug-prone direction. The exemption exists for cases where shallow-merge would itself be wrong (e.g., outputArtifacts merge would corrupt the artifact list with stale entries from prior executions).

**Sweep methodology:** see `cline_docs/reviews/harness-clobber-detection-2026-04-25/sweep-results.md`.

### False Positive (excluded)

| File | Line | Why |
|------|------|-----|
| `lib/pov/services/metadata.ts` | 8 | Type guard function — casts `unknown` parameter after `typeof !== 'object'` check. Not a Prisma read. |

### Validation Layer Defense

`lib/validation/zod-helpers.ts` provides `objectOrJsonString` — a Zod schema that accepts a plain object or a JSON string, coercing strings to objects at the validation layer. Applied in `lib/validation/mcp-hub-validation.ts` for the `services(action: "call")` arguments field.

```typescript
// Before (silent failure - validation defect)
arguments: z.union([
  z.object({}).passthrough(),
  z.string().transform((str) => { try { return JSON.parse(str); } catch { return {}; } })
])

// After (strict - reports Zod error on invalid JSON)
arguments: objectOrJsonString.refine(/* size + XSS checks */)
```

### Detection Commands

```bash
# Find all Json columns in schema
grep -n 'Json' prisma/schema.prisma

# Find unsafe casts on likely Json fields (TS pattern)
grep -rn 'as Record<string' --include='*.ts' lib/ app/ | grep -i 'metadata\|config\|capabilities\|context\|artifacts\|variables\|steps'

# Find unguarded Json reads in JS files (JS pattern: || {} or || [])
grep -rn '\.\(metadata\|steps\|variables\|configuration\|capabilities\) || [{\[]' --include='*.js' lib/ | grep -v node_modules | grep -v ensureObject | grep -v 'Array\.isArray'

# Find direct property access on Json fields without ensureObject
grep -rn '\.metadata\.' --include='*.{ts,js}' lib/ | grep -v ensureObject | grep -v 'node_modules'

# Verify all guarded sites
grep -rn 'ensureObject\|Array\.isArray' lib/pov/templates/ lib/pov/services/ lib/workflows/ lib/admin/ lib/dashboard/ lib/services/workflow/tracking/ lib/mcp/tasks/action/handlers/agent/ lib/mcp/embedded-server.ts lib/mcp/server/tools/hub/workflow-tools-handler.js app/api/pov/*/phase-templates/
```

### Commits

| Commit | Description |
|--------|------------|
| `82c40f9f` | Phase 1-2c: ensureObject shared utility (Bug Class 1 eradication) |
| `8c973ebc` | Phase 3-4: 9 Prisma Json guards + Zod helper (specialist-reviewed) |
| `b4030b67` | Discovery pass: 11 additional Prisma Json guards across 8 files |
| `705415ce` | Phase 4 Deploy 1: Stage.metadata + AgentTemplate (6 jsonb cols) write-back corruption fixed; protocol prose + 4-point invariant doc updates |
| `8f225353` | Phase 4 Deploy 2: harness clobber-detection defense (4-point invariant + reactor mirror + typed error + MCP boundary preservation + regression tests) |
| `7e6a4d50` | Phase 4 follow-up: post-tx side-effects pattern + BC2 two-axis sweep checklist documented |

### Specialist Review

5 specialists consulted, 90% consensus confidence:
- validation-engine (72/100 Phase 4, 60/100 Phase 3 v1)
- boundary-contract (78/100 Phase 4, 55→75/100 Phase 3) — found CRITICAL import-export.ts
- architectural-review (82/100 Phase 4, 65→85/100 Phase 3) — found POVTemplate data model error
- database-manager tiebreaker (88/100) — confirmed both findings
- template-system tiebreaker (92/100) — all 4 service methods need guards

Full reviews: `cline_docs/reviews/ensure-object-utility-2026-02-15/`

**Phase 4 reviews (2026-04-25):** 6 specialists × 2 review rounds — pre-edit aggregate ~88% → post-edit 96% across pipeline-harness, agent-execution, boundary-contract, architectural-review, prompt-construction, database-manager. Review artifacts: `cline_docs/reviews/harness-clobber-detection-2026-04-25/` (current-state-validation.md, implementation-plan.md, execution-checklist.md, sweep-results.md).

### Remaining Columns (no unsafe casts found)

All known `as Record<string, ...>` cast sites on Prisma Json columns are now guarded. The remaining unguarded models have **no unsafe cast sites detected** in the current codebase — their Json columns are either accessed safely, not read directly, or not yet used:

- `AgentExecution` (config, context) — `config` GUARDED via Phase 4 entry #29; `context` N/A (write-once-at-create per Phase 4 follow-up audit C6 — no update surface).
- `AgentArtifact` (metadata)
- `MCPTool` (configuration, capabilities)
- `Notification` (metadata)

These should be re-audited if new code adds `as Record<string, ...>` casts on these columns OR if they grow PUT-route surfaces with optional jsonb fields (write-back corruption risk).

**Re-audited 2026-04-25** (Phase 4 sweep): `AgentTemplate` and `Stage` were on this list and have now been guarded — see Phase 4 sweep entries above.

**Not recommended**: Prisma middleware for auto-coercion (adds latency, breaks intentional non-object Json values).

---

## Bug Class 3: Form Boundary Type Loss (String Numbers)

**Status**: ERADICATED
**Severity**: MEDIUM (1 HIGH — security bypass in artifact download)
**Discovered**: Codebase audit February 2026
**Eradicated**: February 26, 2026

### Description

HTML form inputs and URL query parameters always produce string values. When these arrive at API routes, numeric fields (limit, offset, page, expires) are strings. Without explicit NaN-safe parsing, `parseInt()` can return `NaN`, which flows into database queries (causing Prisma errors) or comparisons (causing logic bypasses).

### Root Cause

`parseInt('malformed')` returns `NaN`. NaN has unique comparison behavior: `Date.now() > NaN` is `false` (security bypass), and Prisma rejects NaN in `take`/`skip` clauses. Routes that parse with `parseInt()` but don't check for NaN or provide a fallback have latent bugs.

### Symptom

```typescript
// SECURITY BYPASS: NaN comparison is always false
const expires = parseInt(expiresStr);  // NaN from malformed input
if (Date.now() > expires) return false;  // false — token never expires!

// DATABASE ERROR: Prisma rejects NaN
const limit = parseInt(searchParams.get('limit'));  // NaN
prisma.task.findMany({ take: limit });  // Prisma error: Invalid Int
```

### Shared Defense

NaN-safe parseInt pattern (from `parsePaginationParams`):

```typescript
// Pattern 1: || fallback (NaN is falsy)
const limit = parseInt(searchParams.get('limit') || '50', 10) || 50;
const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);

// Pattern 2: Explicit isNaN (for security-critical paths)
const expires = parseInt(expiresStr, 10);
if (isNaN(expires) || Date.now() > expires) return false;

// Pattern 3: Zod coercion (for validation schemas)
limit: z.coerce.number().int().min(1).max(1000).optional()
```

### All Sites (10 fixed + many pre-existing guards)

#### HIGH — Security bypass (1 site)

| # | File | Line | Fix |
|---|------|------|-----|
| 1 | `app/api/artifacts/[id]/public-download/route.ts` | ~29 | `isNaN(expires)` check — NaN bypassed token expiration |

#### MEDIUM — NaN to Prisma (9 sites)

| # | File | Line | Fix |
|---|------|------|-----|
| 2 | `lib/admin/handlers/activity.ts` | ~43-44 | `\|\| 1` / `\|\| 10` NaN fallback on page/limit |
| 3 | `app/api/agent-templates/route.ts` | ~45-46 | `\|\| 20` / `Math.max(0, ... \|\| 0)` on limit/offset |
| 4 | `app/api/agent-templates/recommendations/route.ts` | ~29 | `\|\| 5` NaN fallback on limit |
| 5 | `app/api/tasks/global/activities/route.ts` | ~33-34 | `\|\| 50` / `Math.max(0, ... \|\| 0)` on limit/offset |
| 6 | `app/api/tasks/activities/route.ts` | ~50-51 | `\|\| 50` inside Math.min / `Math.max(0, ... \|\| 0)` on offset |
| 7 | `app/api/mcp/tasks/recommendations/route.ts` | ~37 | `\|\| 10` NaN fallback on limit |
| 8 | `app/api/mcp/service-recommendations/route.ts` | ~31 | `\|\| 20` NaN fallback on limit |
| 9 | `app/api/tasks/[taskId]/activities/route.ts` | ~35-36 | `\|\| 50` / `Math.max(0, ... \|\| 0)` on limit/offset |
| 10 | `app/api/tasks/agent/executions/route.ts` | ~38-39 | `\|\| 50` / `Math.max(0, ... \|\| 0)` on limit/offset |

#### Pre-existing guards (confirmed safe — no fix needed)

| # | File | Why Safe |
|---|------|----------|
| A | `lib/utils/pagination.ts` (parsePaginationParams) | `\|\| defaultLimit` + Math.min/max clamping |
| B | `lib/api/pov-handler.ts` | Explicit `isNaN(page)` and `isNaN(pageSize)` checks at lines 81, 91 |
| C | `lib/admin/handlers/user.ts` | ListUsersSchema `z.number()` rejects NaN after parseInt |
| D | `app/api/tasks/search/route.ts` GET | TaskSearchQuerySchema `z.coerce.number()` validates first |
| E | `app/api/tasks/search/route.ts` POST | `\|\| 50` / `\|\| 0` fallback already present |
| F | `app/api/admin/jwt-status/route.ts` | Regex `\d{4}` and `\d{2}` capture guarantees digits |
| G | `app/api/auth/*` routes | Config values from env (not user input) |
| H | 13+ routes via `parsePaginationParams` | Shared safe utility |

### Detection Commands

```bash
# Find bare parseInt on searchParams without NaN safety
grep -rn 'parseInt(searchParams\|parseInt(url\.searchParams' --include='*.ts' app/api/ lib/ | grep -v '|| [0-9]' | grep -v 'isNaN' | grep -v node_modules

# Find all parseInt/parseFloat calls (audit existing guards)
grep -rn 'parseInt\|parseFloat\|Number(' --include='*.ts' app/api/

# Find Zod schemas that should coerce numbers (z.number without z.coerce)
grep -rn 'z\.number()' --include='*.ts' lib/validation/ | grep -v 'coerce'

# Verify parsePaginationParams provides NaN safety
grep -rn 'parsePaginationParams' --include='*.ts' app/api/ lib/
```

### Commits

| Commit | Description |
|--------|------------|
| TBD | Security fix: isNaN check on artifact download token + 9 NaN-safe parseInt fixes |

---

## Bug Class 4: Null vs Undefined at Form Boundaries

**Status**: RESOLVED (not a bug — architecture is correct)
**Severity**: LOW
**Discovered**: Codebase audit February 2026
**Resolved**: February 27, 2026 — thorough discovery confirmed existing defenses are comprehensive

### Description

React form components and API routes handle `null` vs `undefined` via a well-architected 3-layer system that was already in place before formal investigation.

### Architecture (Already Correct)

**Layer 1 — Form Components**: Use `|| null` (39 sites, 73.6%) to coerce empty values to null for submission.

**Layer 2 — Zod Validation**: `lib/validation/form-field-patterns.ts` provides universal normalizers:
```typescript
export const OptionalString = (maxLength = 255) =>
  z.string().max(maxLength).optional().nullable()
    .transform(val => val ?? undefined);  // null → undefined at boundary
```
All major schemas use these helpers. 28 tests cover edge cases.

**Layer 3 — API Routes**: Update operations use conditional spreads (95%+ coverage):
```typescript
...(field !== undefined && { field: data.field })
```
This means `undefined` (from Zod normalization) skips the update, while explicit values are applied.

### Why This Is Not a Bug Class

1. Zod normalizes null→undefined at API boundary (100% of optional fields)
2. Conditional spreads prevent unintended null writes in updates
3. CREATE operations correctly use `|| null` (setting empty fields to NULL is intentional)
4. 28 dedicated tests verify the pattern works correctly
5. Convention IS consistent: form null → Zod undefined → conditional spread → Prisma skip

### Detection Commands

```bash
# Verify Zod normalization helpers exist
grep -rn 'transform.*val.*undefined' lib/validation/form-field-patterns.ts

# Verify test coverage
grep -c 'test\|it(' tests/validation/form-field-patterns.test.ts

# Count form coercion patterns (monitoring)
grep -rn '|| null' --include='*.tsx' components/ | wc -l
```

---

## Bug Class 5: MCP Context Field Name Mismatch

**Status**: MONITORED
**Severity**: LOW
**Discovered**: Boundary contract analysis (late 2025)

### Description

The MCP user context object passes user identity through multiple layers. If the field name for user ID differs between layers (e.g., `user.id` vs `user.userId` vs `userId`), authorization checks or audit logging may fail silently.

### Root Cause

Different layers of the system were built at different times with different naming conventions. JWT tokens use `sub`, the User model uses `id`, and MCP context uses `userId`.

### Current Status

**Audit result**: Consistent usage of `user.userId` detected across `lib/mcp/`. No active mismatches found. The `validateContextUser()` function in embedded-server.ts normalizes the context.

### Detection Commands

```bash
# Check for mixed user ID field names in MCP layer
grep -rn 'user\.id\b' --include='*.{js,ts}' lib/mcp/ | grep -v userId | grep -v node_modules
grep -rn 'user\.userId' --include='*.{js,ts}' lib/mcp/
grep -rn '\.sub\b' --include='*.{js,ts}' lib/mcp/ | grep -v subscribe | grep -v subject
```

### Remediation

None needed currently. Re-audit quarterly or when adding new MCP tool handlers.

---

## Bug Class 6: React Stale Closures

**Status**: MONITORED
**Severity**: LOW
**Discovered**: Codebase audit February 2026

### Description

React hooks that capture variables in closures may use stale values if the dependency array is incomplete. This causes callbacks to operate on outdated state.

### Current Status

**Audit result**: Zero `eslint-disable exhaustive-deps` violations found. ESLint rules are enforcing correct dependency arrays. This bug class is currently well-controlled by tooling.

### Detection Commands

```bash
# Check for disabled exhaustive-deps rule
grep -rn 'eslint-disable.*exhaustive-deps' --include='*.{tsx,ts}' components/ app/

# Check ESLint config for rule status
grep -rn 'exhaustive-deps' .eslintrc* eslint.config*
```

### Remediation

Continue relying on ESLint rule enforcement. Re-audit if ESLint config changes.

---

## Bug Class 7: Double Serialization in Workflows

**Status**: FALSE ALARM (investigated, not a real bug class)
**Severity**: N/A
**Discovered**: Architectural analysis February 2026
**Investigated**: February 16, 2026 (full-context verification of all 3 candidate sites)

### Description

Theoretical risk: multi-step workflow execution could double-serialize step results stored in Json columns.

### Investigation Result

All 3 candidate sites were read in full context with data flow tracing:

| # | File | Verdict | Why |
|---|------|---------|-----|
| 1 | `workflow-tools-handler.js` | **Not Bug Class 7** | MCP responses are parsed at line 486-491 before storage. Step results are always plain objects. |
| 2 | `orchestration-tracker.ts` | **Already guarded** | `ensureObject` applied to metadata reads (Bug Class 2 eradication). |
| 3 | `service-caller.ts` | **No Json column access** | Creates fresh result objects from MCP SDK responses. Doesn't read/write Json columns. |

**Why it can't happen**: The MCP response parsing in `workflow-tools-handler.js` (lines 484-493) always converts `response.content[0].text` via `JSON.parse()` before storing. The service caller always returns parsed objects. No path exists where a JSON string gets written to a Json column without parsing.

**However**: The investigation discovered 3 **Bug Class 2** sites in `workflow-tools-handler.js` (unguarded Json column reads on `MCPWorkflow.steps` and `MCPWorkflowExecution.steps`). These were fixed — see Bug Class 2 entry.

---

## Bug Class 8: Express Body Parser Stream Consumption

**Status**: ERADICATED (via gold standard)
**Severity**: CRITICAL
**Discovered**: Docker MCP service development (2025)

### Description

When a Docker MCP service uses Express with `express.json()` middleware, the body parser consumes the request stream. The MCP SDK's `handlePostMessage` then tries to read the same stream and gets nothing, causing silent failures or cryptic errors.

### Root Cause

Node.js request streams can only be consumed once. Express body-parser and the MCP SDK both try to read the request body from the stream.

### Shared Defense

The Docker MCP Service Gold Standard template passes the already-parsed body to the SDK:

```typescript
// CRITICAL: Pass pre-parsed body, not raw stream
transport.handlePostMessage(req, res, req.body);
```

### Detection Commands

```bash
# Find Docker services with Express
grep -rn 'express()' services/*/src/index.ts

# Verify they pass req.body
grep -rn 'handlePostMessage' services/*/src/index.ts
```

### Reference

- Pattern: `/.claude/knowledge/patterns/docker-mcp-service-gold-standard-v2.md`

---

## Bug Class 11: Unhandled Async Fire-and-Forget

**Status**: ERADICATED
**Severity**: HIGH
**Discovered**: February 26, 2026 (BC11 hunt during smoke-test-sweep-standardize session)
**Eradicated**: February 26, 2026

### Description

An `async` function called without `await` and without `.catch()` inside `setInterval` or as a bare fire-and-forget call. In Node 18+, unhandled promise rejections terminate the process by default. Even if the async function has an internal `try/catch`, the outer async frame can reject before the try block executes (e.g., if an early expression throws).

### Root Cause

JavaScript `async` functions always return a Promise. When called without `await`, the returned promise is detached. If it rejects, Node's `unhandledRejection` handler fires. Since Node 15+, the default behavior is to terminate the process.

`setInterval` is the most dangerous vector because: (1) it runs repeatedly, so even a rare failure will eventually occur, and (2) `setInterval` cannot `await` its callback, so the promise is always detached.

### Symptom

```
node:internal/process/promises:289
    triggerUncaughtException(err, true /* fromPromise */);
    ^
[UnhandledPromiseRejectionWarning: Error: ...]
```

Process terminates. No graceful recovery. In production with pm2, the process restarts but in-flight requests are lost.

### Impact Category

**Availability** — Not a data integrity or security issue. The function's internal try/catch handles the expected error correctly. But if the outer async frame itself rejects (before the try block), Node crashes. This is a latent production outage.

### Shared Defense

Add `.catch()` to every bare async call, especially in `setInterval`:

```javascript
// WRONG — unhandled rejection crashes Node
runHealthChecks();
setInterval(runHealthChecks, intervalMs);

// CORRECT — .catch() prevents process crash
runHealthChecks().catch(err => log.warn({ err }, 'Health check startup failed'));
setInterval(() => {
  runHealthChecks().catch(err => log.warn({ err }, 'Health check interval failed'));
}, intervalMs);
```

### All Sites (7 total)

| # | File | Line | Fix |
|---|------|------|-----|
| 1 | `lib/mcp/server/tools/hub/hub-utilities.js` | 439-440 | Added `.catch()` on startup call + wrapped `setInterval` callback with `.catch()` |
| 2 | `lib/services/mcp/serverManager.ts` | 581 | Changed `setInterval(async () => { await ... })` to `.catch()` wrapper |
| 3 | `lib/mcp/server/security/compliance-monitor.js` | 595 | Added `.catch()` on bare `runCleanup()` startup call |
| 4 | `lib/mcp/server/security/compliance-monitor.js` | 599 | Added `.catch()` on `runCleanup()` inside `setInterval` callback |
| 5 | `lib/services/mcp/mcpClientWrapper.ts` | 486 | Changed `setInterval(async () => { await ... })` to `.catch()` wrapper |
| 6 | `lib/services/mcp/resourceManager.ts` | 1016 | Changed `setInterval(async () => { await ... })` to `.catch()` wrapper |
| 7 | `lib/services/mcp/resourceManager.ts` | 1028 | Changed `setInterval(async () => { await ... })` to `.catch()` wrapper |

### Detection Commands

```bash
# Find setInterval in server code (then manually check for async callbacks)
grep -rn 'setInterval' --include='*.js' --include='*.ts' lib/ | grep -v node_modules | grep -v '.d.ts' | grep -v '.next/'

# Find known fire-and-forget async patterns without .catch
grep -rn 'runHealthChecks\|startHealthCheck\|runCleanup\|startCleanup' --include='*.js' lib/mcp/server/ | grep -v '.catch'

# Full defensive sweep: see defensive-code-sweep-discovery.md
```

### Commits

| Commit | Description |
|--------|------------|
| `1ed1d538` | Fix: `.catch()` on runHealthChecks() startup and setInterval calls |

### References

- Discovery: `/.claude/knowledge/discoveries/defensive-code-sweep-discovery.md` (Sweep 1)
- Related pattern: `/.claude/knowledge/patterns/fire-and-forget-activity-logging-pattern.md` (Anti-Pattern #4)

---

## Bug Class 12: Execution Claim Race (TOCTOU)

**Status**: ERADICATED
**Severity**: HIGH
**Discovered**: February 26, 2026 (agent execution smoke test)
**Eradicated**: February 26, 2026

### Description

When `agent.execute` is called via MCP, two independent code paths race to execute the same PENDING execution: (1) `executeById()` triggered fire-and-forget by the handler, and (2) `processPendingExecutions()` running on a 10-second interval poller. Both read the execution status as PENDING before either updates it to RUNNING, causing the same execution to run twice with duplicate artifacts.

### Root Cause

Classic TOCTOU (Time of Check to Time of Use) race condition. The `executeAgent()` method read the status, then performed async work (resource registration, streaming), then wrote RUNNING status. During that window, the background poller could also read PENDING and start a second execution path. Neither path used atomic claiming.

Related to the TOCTOU race fixed in `service-connection-pool.js` (Sweep 2 of defensive-code-sweep-discovery.md), but in the execution engine domain.

### Symptom

- 6 artifacts created for a single execution (3 unique types duplicated)
- Timestamps 3ms apart between duplicate sets
- Execution time impossibly fast (44-45ms) due to the racing path
- Double LLM API calls (wasted credits)

### Shared Defense

Atomic compare-and-swap claim at the start of `executeAgent()`:

```typescript
// Atomic claim: only one caller can transition PENDING → RUNNING
const claimed = await prisma.agentExecution.updateMany({
  where: { id: execution.id, status: 'PENDING' },
  data: { status: 'RUNNING', startTime }
});
if (claimed.count === 0) {
  logger.info({ executionId: execution.id }, 'Execution already claimed by another path — skipping');
  return;
}
```

### All Sites (1 primary + 1 secondary)

| # | File | Line | Fix |
|---|------|------|-----|
| 1 | `lib/services/agentExecutionEngine.ts` | ~297 (executeAgent) | Atomic claim via `updateMany` with status condition |
| 2 | `lib/services/agentExecutionEngine.ts` | ~1380 (executeById) | Query parity — added `agentTemplate`, `team`, `subTasks`, `parentTask` to include |

### Detection Commands

```bash
# Find dual-path execution patterns (fire-and-forget + poller both calling executeAgent)
grep -rn 'executeById\|processPendingExecutions\|executeAgent' --include='*.ts' lib/services/agentExecutionEngine.ts

# Find PENDING status checks without atomic claiming
grep -rn "status.*PENDING\|status: 'PENDING'" --include='*.ts' lib/services/ | grep -v updateMany
```

### Commits

| Commit | Description |
|--------|------------|
| TBD | Atomic claim in executeAgent + query parity in executeById + content validation |

---

## Bug Class 13: Empty LLM Response False SUCCESS

**Status**: ERADICATED
**Severity**: MEDIUM
**Discovered**: February 26, 2026 (agent execution smoke test)
**Eradicated**: February 26, 2026

### Description

When the LLM returns an empty text response (e.g., only web_search tool_use blocks with no text content, or a degraded prompt), all three execution paths (engine, non-streaming route, streaming route) unconditionally mark the execution as SUCCESS and create artifacts with empty content. The `raw_response.txt` artifact is 0 bytes and the `report.md` "Generated Content" section is blank.

### Root Cause

No content validation gate between the LLM response and the SUCCESS status assignment. The success criteria was "did the LLM call not throw?" rather than "did the LLM produce useful content?"

### Symptom

- `raw_response.txt` artifact with 0 bytes
- `report.md` with empty "Generated Content" section
- `result.json` showing `"result": "Success"` despite no content
- Execution marked SUCCESS with "Task completed successfully"

### Shared Defense

Content validation after LLM response, before success transaction:

```typescript
// Prevent false SUCCESS when LLM returns empty response
if ((!finalResponse || finalResponse.trim().length === 0) && toolCallResults.length === 0) {
  throw new Error('Agent execution produced no content: LLM returned empty response with no tool calls');
}
```

### All Sites (3 execution paths)

| # | File | Line | Fix |
|---|------|------|-----|
| 1 | `lib/services/agentExecutionEngine.ts` | ~636 (after tool processing) | Validate `finalResponse` and `toolCallResults` before success path |
| 2 | `app/api/pov/agent/execute/route.ts` | ~265 (after LLM call) | Validate `llmResponse.text` before success path |
| 3 | `app/api/pov/agent/execute/stream/route.ts` | ~483 (after stream accumulation) | Validate `generatedText` before success path |

### Detection Commands

```bash
# Find unconditional SUCCESS assignments in agent execution
grep -rn "result: 'Success'\|status: 'SUCCESS'" --include='*.ts' lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/

# Verify content validation exists before SUCCESS
grep -B 5 "result: 'Success'" --include='*.ts' lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/ | grep -E 'trim|length|empty'
```

### Commits

| Commit | Description |
|--------|------------|
| TBD | Content validation in all 3 execution paths |

---

## Bug Class 14: Retry Without Backoff (Thundering Herd)

**Status**: ERADICATED
**Severity**: MEDIUM
**Discovered**: February 26, 2026
**Eradicated**: February 26, 2026

### Description

Retry loops using a constant delay between attempts. Under failure conditions (e.g., database restart, upstream service outage), all clients retry at the same interval, creating a "thundering herd" that amplifies the load on an already-struggling service and delays recovery.

### Root Cause

Retry delay is a fixed constant (e.g., `setTimeout(resolve, 2000)`) instead of scaling exponentially with jitter. When N callers fail simultaneously, they all retry at `t + delay`, `t + 2*delay`, etc., causing synchronized load spikes.

### Symptom

- During DB restart: all 5 reconnection attempts fire at exactly 2s intervals, hitting the DB simultaneously
- During workflow retries: constant 30s between attempts regardless of retry count
- Under high concurrency: recovery takes longer than expected because retries amplify the load

### Shared Defense

Exponential backoff with jitter:

```typescript
// Gold standard: lib/auth/oauth/retry-utils.ts
const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
const jitter = exponentialDelay * 0.2 * Math.random(); // ±20% jitter
const delayMs = exponentialDelay + jitter;
```

### All Sites (3 sites / 3 files — all fixed)

| # | File | Line | Before | After |
|---|------|------|--------|-------|
| 1 | `lib/services/workflow/workflowEngine.ts` | ~355 | Constant `retryDelay * 1000` (30s) | Exponential `baseDelay * 2^(attempt-1)` capped at 4x base, +20% jitter |
| 2 | `lib/prisma.ts` | ~113 | Constant `retryDelayMs` (2s) | Exponential `initialDelayMs * 2^(attempt-1)` capped at 8x initial, +20% jitter |
| 3 | `lib/prisma.js` | — | Constant `retryDelayMs = 2000` (CJS version) | Exponential backoff + jitter (CJS parity with TS version) |

#### Session 9 Detection Re-Audit Extension (Mar 4, 2026)

Site 3 found during detection command re-audit. The CJS version (`lib/prisma.js`) had constant `retryDelayMs = 2000` while the TS version had already been fixed with exponential backoff. Fixed with exponential backoff + jitter to match the TS version.

### Already Safe (6 sites — have exponential backoff)

> ⚠ **2026-06-09 correction:** `retry-utils.ts` `calculateDelay` actually had **NO jitter** until 2026-06-09
> (pure exponential) — it was a latent BC14 gap mislabeled "gold standard." Jitter (±20% for OAuth, `'full'`
> for the DB serialization adapter) was added behind a `jitter` config flag; OAuth-multi-provider/client signed
> off the ±20% default for the lone live caller (MS token exchange). NOW genuinely backoff+jitter compliant.

| File | Mechanism |
|------|-----------|
| `lib/auth/oauth/retry-utils.ts` | `withRetry`/`fetchWithRetry`: `initialDelay * backoffMultiplier^(attempt-1)` capped at `maxDelay` + jitter (added 2026-06-09). Imports `withRetry`/`RETRYABLE_SQLSTATES` for the DB adapter ↓ |
| `lib/database/serialization-retry.ts` | `withSerializationRetry` — adapter over `withRetry`; full jitter + maxAttempts 5 + maxTotalDelay 750ms; DB serialization conflicts (40001/40P01/55P03/P2034). 2026-06-09 |
| `lib/auth/oauth/microsoft-graph.ts` | Uses `withRetry()` from retry-utils |
| `lib/auth/oauth/microsoft-mcp-oauth.ts` | Uses `withRetry()` from retry-utils |
| `lib/mcp/server/utils/resilient-call.js` | `initialDelay * 2^retryCount` with jitter |
| `lib/mcp/server/services/service-connection-pool.js` | `baseDelay * 2^attempt` with jitter capped at 30s |

### Detection Commands

```bash
# Find retry/reconnect loops with constant delay
grep -rn 'retryDelay\|retryDelayMs\|reconnectDelay\|RETRY_DELAY' --include='*.ts' --include='*.js' lib/ | grep -v node_modules | grep -v '.d.ts'

# Find setTimeout in retry loops (constant delay pattern)
grep -B 3 -A 1 'setTimeout.*resolve.*delay\|setTimeout.*resolve.*retry' --include='*.ts' --include='*.js' lib/ | grep -v node_modules

# Verify exponential patterns exist
grep -rn 'Math\.pow\|backoff\|exponential' --include='*.ts' --include='*.js' lib/ | grep -v node_modules | grep -v '.d.ts'

# TEETH (2026-06-09): a THIN retry ADAPTER (e.g. lib/database/serialization-retry.ts) delegates to withRetry and
# contains NONE of the tokens above — it would evade this grep. So instead positively assert every retry helper
# routes through the ONE shared core: any file that defines a retry wrapper MUST import withRetry, and any DB
# serialization retry MUST import the shared RETRYABLE_SQLSTATES constant (no forked predicates / no second loop).
grep -rln 'withSerializationRetry\|function withRetry\|async function withRetry' --include='*.ts' lib/ | grep -v node_modules | \
  while read f; do grep -q "withRetry" "$f" || echo "SUSPECT (retry helper not delegating to withRetry): $f"; done
grep -rln 'RETRYABLE_SQLSTATES\|isRetryableSerializationError' --include='*.ts' lib/ | grep -v 'serialization-retry.ts' | grep -v node_modules
# ^ any consumer of the serialization predicate must IMPORT it from lib/database/serialization-retry.ts (anti-drift).
```

---

## Bug Class 15: ReDoS via User-Controlled Regex

**Status**: ERADICATED
**Severity**: HIGH
**Discovered**: February 26, 2026
**Eradicated**: February 26, 2026

### Description

`new RegExp(userInput)` where the pattern comes from database-stored configuration or user-controlled input. A crafted pattern with nested quantifiers (e.g., `(a+)+$`) causes catastrophic backtracking — the regex engine tries exponentially many paths, freezing the event loop for seconds or minutes.

### Root Cause

No validation between receiving a regex pattern string and passing it to `new RegExp()`. The JavaScript regex engine uses backtracking, which is vulnerable to polynomial/exponential blowup on specific patterns.

### Symptom

- Event loop freeze during security event processing (threat indicators with malicious regex)
- Form validation timeout when template field has crafted pattern
- CPU spike on single request, affecting all concurrent users

### Shared Defense

`safeRegex()` utility at `lib/utils/safe-regex.ts`:
- Length limit (500 chars)
- Dangerous pattern detection (nested quantifiers, overlapping alternations)
- Compilation guard (try/catch on `new RegExp`)
- Returns `null` for unsafe patterns (caller skips or defaults)

```typescript
import { safeRegex } from '@/lib/utils/safe-regex';

// WRONG — user-controlled pattern, no validation
const regex = new RegExp(indicator.value);

// CORRECT — validated before instantiation
const regex = safeRegex(indicator.value, '', 'threat indicator');
if (regex) { /* use it */ }
```

### Extension: ReDoS in Validation Regex Patterns (Mar 2026)

**Problem**: `ValidationPatterns.NO_SCRIPT_INJECTION` and `NO_SQL_INJECTION` used negative-lookahead regex `^(?!.*(alternation)).*$` which is O(n²) on non-matching input. Applied via `.regex()` and `.refine(.test())` on strings up to 5000 chars.

**Fix**: Replaced with positive-match patterns (`_SCRIPT_INJECTION_MATCH`, `_SQL_INJECTION_MATCH`) and negated results. Legacy patterns kept for backward compatibility but all active usages switched.

**Sites fixed** (4 files):
- `input-validation-framework.ts`: SAFE_TEXT and COMMENT_TEXT schemas — `.regex()` → `.refine(!match.test())`
- `support-validation.ts`: `secureText` helper — `.test()` switched to positive-match
- `agent-template-validation.ts`: template name — `.regex()` → `.refine(!match.test())`
- `prompt-library-validation.ts`: dead code removed (unused local `ValidationPatterns` with same patterns)

### All Sites (2 original + 4 ReDoS extension — all fixed)

| # | File | Line | Input Source | Fix |
|---|------|------|-------------|-----|
| 1 | ~~`lib/events/security-event-processor.ts`~~ | — | DELETED 2026-06-14 (c5dab442) | — |
| 2 | `lib/pov/templates/validator.ts` | ~95 | Field validation pattern (DB) | `safeRegex()` with skip-if-null |
| 3 | `lib/validation/input-validation-framework.ts` | 52-66 | Validation schemas | Positive-match patterns replace O(n²) lookahead |
| 4 | `lib/validation/support-validation.ts` | 43-52 | Support text input | Positive-match patterns |
| 5 | `lib/validation/agent-template-validation.ts` | 189 | Template name | `.regex()` → `.refine(!match.test())` |
| 6 | `lib/validation/prompt-library-validation.ts` | 17-20 | Dead code | Removed unused ReDoS-vulnerable patterns |

### Already Safe (7 sites — hardcoded patterns)

| File | Why Safe |
|------|----------|
| `lib/security/prompt-injection-prevention.ts:277` | `INJECTION_PATTERNS` is hardcoded array of RegExp literals |
| `lib/security/prompt-injection-prevention.ts:581` | Template var `{{key}}` — key is app-controlled |
| `lib/mcp/embedded-server.ts:1511,1518` | Template var `{{key}}` — key is app-controlled |
| `lib/mcp/server/prompts/prompt-registry.js:436,442,446` | Template vars — keys are app-controlled |

### Detection Commands

```bash
# Find all new RegExp() instantiations from dynamic sources
grep -rn 'new RegExp(' --include='*.ts' --include='*.js' lib/ app/api/ | grep -v node_modules | grep -v '.d.ts' | grep -v '.next/'

# Verify all dynamic patterns use safeRegex
grep -rn 'new RegExp(' --include='*.ts' --include='*.js' lib/ app/api/ | grep -v node_modules | grep -v '.d.ts' | grep -v safeRegex | grep -v '`{{' | grep -v 'INJECTION_PATTERNS'
# Expected: 0 results (all dynamic patterns should use safeRegex)
```

---

## Bug Class 16: Timing-Unsafe Secret Comparison

**Status**: ERADICATED
**Severity**: HIGH
**Discovered**: February 26, 2026
**Eradicated**: February 26, 2026

### Description

Comparing secrets, hashes, or HMAC signatures using `===` instead of `crypto.timingSafeEqual()`. The `===` operator short-circuits on the first differing byte, leaking timing information about how many leading characters match. An attacker can progressively brute-force the secret by measuring response times.

### Root Cause

JavaScript `===` on strings is optimized to fail fast. When comparing `"abc123" === "abc456"`, it returns `false` after comparing 4 characters. When comparing `"abc123" === "xyz000"`, it returns `false` after 1 character. The time difference is measurable over a network.

### Symptom

- Artifact download signatures can be brute-forced by timing response latency
- API key hashes can be guessed character-by-character
- Requires many requests but is feasible over HTTPS with statistical analysis

### Shared Defense

```typescript
import crypto from 'crypto';

// WRONG — timing side-channel leaks match length
return signature === expectedSignature;

// CORRECT — constant-time comparison
const sigBuf = Buffer.from(signature, 'utf8');
const expectedBuf = Buffer.from(expectedSignature, 'utf8');
if (sigBuf.length !== expectedBuf.length) return false;
return crypto.timingSafeEqual(sigBuf, expectedBuf);
```

### All Sites (2 sites / 2 files — both fixed; site 2 since DELETED)

| # | File | Line | What | Fix |
|---|------|------|------|-----|
| 1 | `app/api/artifacts/[id]/public-download/route.ts` | ~39 | HMAC signature verification | `crypto.timingSafeEqual()` |
| 2 | ~~`lib/crypto/hashing.ts` `verifyApiKey`~~ | — | API key hash verification (was "unused but latent") | DELETED 2026-06-12 as zero-caller orphan (Protocol 11 Axis 6) — site no longer exists |

### Detection Commands

```bash
# Find secret/hash/signature comparisons using ===
grep -rn '=== .*[Hh]ash\|=== .*[Ss]ignature\|=== .*[Ss]ecret\|[Hh]ash ===\|[Ss]ignature ===\|[Ss]ecret ===' --include='*.ts' --include='*.js' lib/ app/api/ | grep -v node_modules | grep -v '.d.ts' | grep -v prisma/generated

# Verify timingSafeEqual is used in crypto/verification code
grep -rn 'timingSafeEqual' --include='*.ts' --include='*.js' lib/ app/api/ | grep -v node_modules
```

---

## Bug Class 17: Code Injection via new Function()

**Status**: ERADICATED
**Severity**: CRITICAL
**Discovered**: February 26, 2026
**Eradicated**: February 26, 2026

### Description

`new Function('param', userString)` constructs executable JavaScript from a database-stored string. This is functionally equivalent to `eval()` — an attacker who can modify the source string (e.g., via a KPI template) can execute arbitrary server-side code, including file system access, network requests, or process spawning.

### Root Cause

KPI template `calculation` field is a `String?` stored in the database. When `calculateKPI()` runs, it passes this string directly to `new Function()` without any validation or sandboxing.

### Symptom

- An attacker with KPI template edit permissions can execute arbitrary JavaScript on the server
- Example payload: `"return require('child_process').execSync('cat /etc/passwd').toString()"`
- No audit trail or detection — calculation runs silently within the KPI evaluation flow

### Shared Defense

Blocklist of dangerous patterns validated before `new Function()`:

```typescript
const DANGEROUS_PATTERNS = [
  /\bimport\b/, /\brequire\b/, /\bprocess\b/, /\bglobal(This)?\b/,
  /\beval\b/, /\bFunction\b/, /\bfetch\b/, /\bchild_process\b/,
  /\bexec[A-Z]?\b/, /\bspawn\b/, /\b__proto__\b/, /\bconstructor\b/,
  /\bprototype\b/, /\bProxy\b/, /\bReflect\b/, /\bwhile\b|\bfor\b/,
];
// + length limit (2000 chars)
// Returns null if any pattern matches (rejects calculation)
```

### All Sites (1 site / 1 file — fixed)

| # | File | Line | Fix |
|---|------|------|-----|
| 1 | `lib/pov/services/kpi.ts` | ~247 | Blocklist validation + length limit before `new Function()` |

### Detection Commands

```bash
# Find all new Function() and eval() calls in server code
grep -rn 'new Function\s*(\|[^a-zA-Z]eval\s*(' --include='*.ts' --include='*.js' lib/ app/api/ | grep -v node_modules | grep -v '.d.ts' | grep -v prisma/generated | grep -v 'dangerousPatterns'

# Verify: all hits should have DANGEROUS_PATTERNS validation or be string-constant detection code
```

---

## Bug Class 18: Error Message Leakage to Clients

**Status**: ERADICATED
**Severity**: HIGH
**Discovered**: February 26, 2026
**Partially Fixed**: February 26, 2026 (22 high-risk sites in 9 files)
**Eradicated**: February 27, 2026 (46 additional sites in 30 files + 5 wave 2 sites in 3 files — total: 73 sites / 42 files)

### Description

API error handlers return raw `error.message` strings directly to HTTP clients. Internal error messages (Prisma errors, network failures, file system errors) leak implementation details that aid attackers in reconnaissance and exploitation.

### Root Cause

Catch blocks in API route handlers use `error.message` or `error instanceof Error ? error.message : 'fallback'` to populate response JSON or URL parameters, instead of returning generic messages and logging the details server-side.

### Symptom

- API responses contain internal error details (database constraint names, file paths, query syntax)
- OAuth callback errors appear in URL query parameters (visible in access logs, browser history)
- Error messages reveal technology stack and internal architecture to attackers

### Patterns Found

| Pattern | Risk | Count | Status |
|---------|------|-------|--------|
| `error instanceof Error ? error.message : 'fallback'` in response body | HIGH | 22 → 0 | FIXED |
| `error.message` in URL query parameter (OAuth) | CRITICAL | 1 → 0 | FIXED |
| `error.message` in `instanceof ApiError` blocks | LOW | 23 | SAFE (controlled messages) |
| `error.message` in remaining infra/admin routes | MEDIUM | 46 | FIXED (Feb 27) |
| `error.message \|\| 'fallback'` in access denied handlers | MEDIUM | 4 → 0 | FIXED (Feb 27, wave 2) |
| `error.message` + `error.stack` in MCP action response | HIGH | 1 → 0 | FIXED (Feb 27, wave 2) |

### Shared Defense

Replace raw `error.message` with generic messages in catch blocks:
```typescript
// BAD: leaks internal details
return NextResponse.json({ error: error.message }, { status: 500 });

// GOOD: generic message + server-side logging
logger.error({ err: error }, 'operation failed');
return NextResponse.json({ error: 'Operation failed' }, { status: 500 });
```

### Fixed Sites (73 sites / 42 files)

| # | File | Sites | Fix |
|---|------|-------|-----|
| 1 | `app/api/auth/oauth/callback/[provider]/route.ts` | 1 | Generic message in URL param |
| 2 | `app/api/auth/oauth/[provider]/route.ts` | 1 | Generic details field |
| 3 | `app/api/agent-templates/route.ts` | 2 | Static error messages |
| 4 | `app/api/agent-templates/[templateId]/route.ts` | 3 | Static error messages |
| 5 | `app/api/agent-templates/[templateId]/apply/route.ts` | 1 | Static error message |
| 6 | `app/api/agent-templates/recommendations/route.ts` | 1 | Static error message |
| 7 | `app/api/agent-templates/builder/route.ts` | 8 | Generic details field |
| 8 | `app/api/agent-templates/prompt-library/route.ts` | 2 | Generic details field |
| 9 | `app/api/agent-templates/prompt-library/[promptId]/route.ts` | 3 | Generic details field |
| 10 | `app/api/mcp/service-recommendations/route.ts` | 2 | Static error messages |
| 11 | `app/api/mcp/services/route.ts` | 1 | Generic details field |
| 12 | `app/api/mcp/tools/discover/route.ts` _(route removed 2026-06-22 — legacy)_ | 2 | Generic message + stack trace removed |
| 13 | `app/api/mcp/tools/route.ts` | 1 | Generic details field |
| 14 | `app/api/mcp/tools/[toolId]/test/route.ts` | 2 | Static error messages |
| 15 | `app/api/mcp/status/route.ts` | 5 | Generic details (replace_all) |
| 16 | `app/api/mcp/metrics/route.ts` | 1 | Generic details field |
| 17 | `app/api/mcp/servers/route.ts` | 2 | Generic details (replace_all) |
| 18 | `app/api/mcp/servers/[serverId]/test/route.ts` | 2 | Static error messages |
| 19 | `app/api/mcp/servers/health/route.ts` | 1 | Generic details field |
| 20 | `app/api/llm/proxy/route.ts` | 1 | Static error message |
| 21 | `app/api/llm/proxy/stream/route.ts` | 2 | Static error messages |
| 22 | `app/api/llm/test-connection/route.ts` | 1 | Static error message |
| 23 | `app/api/llm/models/route.ts` | 1 | Static error message |
| 24 | `app/api/pov/agent/execute-function/route.ts` | 1 | Static error message |
| 25 | `app/api/pov/agent/execute/route.ts` | 2 | Static error messages |
| 26 | `app/api/pov/agent/execute/stream/route.ts` | 3 | Static error messages |
| 27 | `app/api/pov/[povId]/progress/route.ts` | 1 | Generic details field |
| 28 | `app/api/pov/[povId]/phase/route.ts` | 1 | Static error message |
| 29 | `app/api/pov/[povId]/phase/[phaseId]/task/route.ts` | 2 | Static error messages |
| 30 | `app/api/pov/[povId]/phase/[phaseId]/task/available-assignees/route.ts` | 1 | Static error message |
| 31 | `app/api/pov/[povId]/phase/[phaseId]/task/[taskId]/route.ts` | 3 | Static + removed unsafe validation check |
| 32 | `app/api/pov/[povId]/phase/[phaseId]/task/[taskId]/dependencies/route.ts` | 5 | Static + DoS messages genericized |
| 33 | `app/api/pov/[povId]/phase/[phaseId]/stage/route.ts` | 3 | Static access denied (replace_all) |
| 34 | `app/api/pov/[povId]/team/available/route.ts` | 1 | Static error message |
| 35 | `app/api/pov/check-circular-dependency/route.ts` | 1 | Static error message |
| 36 | `app/api/health/db/route.ts` | 1 | Generic "Database unavailable" |
| 37 | `app/api/auth/oauth/health/route.ts` | 1 | Generic "Health check failed" |
| 38 | `app/api/performance/phase-stage-health/route.ts` | 1 | Generic details field |
| 39 | `app/api/stages/[stageId]/validate/route.ts` | 2 | Generic details (replace_all) |
| 40 | `app/api/stages/validate/bulk/route.ts` | 1 | Generic details field |
| 41 | `app/api/admin/globals/health/route.ts` | 1 | Generic details field |
| 42 | `app/api/admin/event-system/status/route.ts` | 2 | Generic error messages |
| 43 | `app/api/users/route.ts` | 1 | Static error message |
| 44 | `app/api/artifacts/[id]/download/route.ts` | 1 | Static access denied |
| 45 | `app/api/tasks/[taskId]/status/route.ts` | 1 | Static access denied |
| 46 | `app/api/tasks/[taskId]/attachments/route.ts` | 1 | Static access denied |
| 47 | `app/api/tasks/[taskId]/attachments/[attachmentId]/route.ts` | 1 | Static access denied |
| 48 | `app/api/tasks/[taskId]/dependencies/route.ts` | 3 | Static + DoS messages genericized |
| 49 | `app/api/tasks/[taskId]/route.ts` | 3 | `error.message \|\| 'Access denied'` → static (wave 2) |
| 50 | `app/api/agent-templates/[templateId]/apply/route.ts` | 1 | `error.message \|\| 'Access denied'` → static (wave 2) |
| 51 | `app/api/mcp/tasks/action/route.ts` | 1 | Raw error.message + error.stack → passthrough of handler error.message (wave 2, revised Mar 2026: keyword-based categorization was over-aggressive — genericized detailed handler messages like "User not found: X. Available: Y" into "Resource not found", losing actionable information. Reverted to passing through original handler messages since task handlers already produce user-safe errors.) |

### Detection Commands

```bash
# Find all error.message in API response bodies (highest risk)
grep -rn 'error instanceof Error ? error.message' --include='*.ts' app/api/ | grep -v node_modules

# Find all error.message references in API routes
grep -rn 'error\.message' --include='*.ts' app/api/ | grep -v node_modules | grep -v 'logger\.\|\.error\.\|\.warn\.' | grep -v '\.d\.ts'

# Verify: all hits should be in instanceof ApiError blocks or use generic messages
```

---

## Bug Class 19: Read-Modify-Write Race Conditions

**Status**: ERADICATED (Feb 2026); **REOPENED 2026-06-08 (TS4)** — one missed/new site fixed, the
`transaction-atomicity-pattern.md` doc corrected, one still-active wrong-fix site tracked (see TS4 update below)
**Severity**: HIGH
**Discovered**: February 27, 2026
**Eradicated**: February 27, 2026 (8 HIGH/MEDIUM sites in 7 files + 7 LOW sites in 7 files = 15 total)

### Description

Services perform `findUnique` → compute from read data → `update` without `$transaction`, creating Time-of-Check-Time-of-Use (TOCTOU) race conditions. Concurrent requests both read the same stale data, compute independently, and the last writer silently overwrites the first's changes.

### Root Cause

No transactional isolation between read and write operations in the same logical unit. At PostgreSQL's default `ReadCommitted` isolation, another transaction can commit changes between the read and write within the same function.

### Variants

| Variant | Risk | Pattern | Fix |
|---------|------|---------|-----|
| Data merge (metadata, settings, checklist) | MEDIUM | `findUnique` → spread merge → `update` | `$transaction(RepeatableRead)` |
| Stat computation (rates, averages, versions) | MEDIUM | `findUnique` → calculate from values → `update` | `$transaction(RepeatableRead)` |
| TOCTOU status guard (execution, cancel) | HIGH | `findUnique(status)` → guard check → `update(status)` | Atomic CAS via `updateMany` with `where` guard |

### Fixed Sites (8 HIGH/MEDIUM)

| # | File | Variant | Fix |
|---|------|---------|-----|
| 1 | `lib/pov/services/metadata.ts` | Data merge | `$transaction(RepeatableRead)` |
| 2 | `lib/services/agentTemplateService.ts` | Stat computation | `$transaction(RepeatableRead)` |
| 3 | `lib/services/agentTaskService.ts` | TOCTOU status guard | Atomic CAS `updateMany` + orphan cleanup |
| 4 | `app/api/tasks/[taskId]/agent/execute/route.ts` | TOCTOU status guard | Atomic CAS `updateMany` + orphan cleanup |
| 5 | `app/api/pov/agent/cancel/[executionId]/route.ts` | TOCTOU status guard | Atomic CAS `updateMany` with status guard |
| 6 | `lib/pov/services/launch.ts` | Data merge | `$transaction(RepeatableRead)` |
| 7 | `lib/services/apiKeyService.ts` (storeApiKey) | Data merge | `$transaction(RepeatableRead)` |
| 8 | `lib/services/apiKeyService.ts` (revokeApiKey) | Data merge | `$transaction(RepeatableRead)` |

### Fixed Sites (7 LOW-risk — Session 5, Feb 27 2026)

| # | File | Variant | Fix |
|---|------|---------|-----|
| 9 | `lib/mcp/tasks/action/handlers/agent/agent-configure-handler.ts` | Data merge (metadata) | `$transaction(RepeatableRead)` |
| 10 | `lib/mcp/tasks/action/handlers/task/task-update-handler.ts` | Data merge (inputContext) | Moved read inside existing `$transaction`, upgraded to `RepeatableRead` |
| 11 | `lib/pov/templates/service.ts` | Stat computation (version increment) | `$transaction(RepeatableRead)` |
| 12 | `lib/pov/services/phase.ts` (updateStage) | Data merge (metadata) | `$transaction(RepeatableRead)` |
| 13 | `lib/pov/services/workflow.ts` (complete) | Data merge (metadata) | `$transaction(RepeatableRead)` |
| 14 | `lib/services/mcpStorageMigration.ts` | Data merge (multi-step migration) | `$transaction(RepeatableRead)` |
| 15 | `app/api/admin/settings/llm/route.ts` | Dual-table data merge | `$transaction(RepeatableRead)` (SystemSettings + CustomSchema atomic) |

### Detection Commands

```bash
# Find files with both findUnique/findFirst AND update (potential race)
grep -rln 'findUnique\|findFirst' lib/ app/api/ --include='*.ts' | xargs grep -l '\.update(' | grep -v node_modules | grep -v '.test.'

# Verify transaction wrapping
grep -rn '\$transaction' lib/ app/api/ --include='*.ts' | grep -v node_modules
```

### Already Protected (Gold Standard)

| File | Protection |
|------|-----------|
| `lib/services/agentExecutionEngine.ts` | Atomic `updateMany` CAS (BC12) |
| `lib/pov/services/phase.ts` (reorderStages) | `$transaction(Serializable)` + `FOR UPDATE NOWAIT` |
| `lib/pov/services/kpi.ts` | Inside `$transaction` |
| `lib/pov/handlers/put.ts` | Main path wrapped in `$transaction` |

### TS4 Update (2026-06-08) — new fix variant + a corrected pattern doc

**Context:** The chaining work (6c640337) made `applyChainedContext` fire on every execution path, surfacing a
BC19 "data merge" site the Feb-2026 sweep never covered (it didn't exist yet). Investigating it revealed that
`.claude/knowledge/patterns/transaction-atomicity-pattern.md` taught a **WRONG** lost-update fix — a *plain*
`$transaction` ("serializes reads and writes"). It does not: at READ COMMITTED a plain `SELECT`/`findUnique`
takes no row lock, so concurrent tx both read v0 → one clobbers. (BC19's own fix table was correct — RR — but
the pattern doc contradicted it, and code that followed the doc inherited the race.)

**New fix variant added to the menu** (alongside RR, which is correct-but-LOUD/aborts-40001):

| Variant | Risk | Pattern | Fix |
|---------|------|---------|-----|
| Single-row jsonb shallow merge | MEDIUM | `findUnique` → spread → `update` (no lock) | **Atomic `UPDATE … SET col = COALESCE(col,'{}') \|\| $patch::jsonb … RETURNING`** — merge runs in-SQL, race-free, SILENT (no retry). Lightest. |

**Fixed (2026-06-08):**
| File | Variant | Fix |
|------|---------|-----|
| `lib/agents/harness/context-chainer.ts` `applyChainedContext` → `lib/tasks/services/inputContext.ts` `mergeTaskInputContext` | Single-row jsonb merge | Atomic `\|\|` + `RETURNING` (preserves A2 in-memory return) |
| `.claude/knowledge/patterns/transaction-atomicity-pattern.md` | (doc) | "Read-Then-Write Race Protection" rewritten: plain tx = atomicity/torn-read only; lost-update needs RR / `FOR UPDATE` / atomic statement |

**Repo-wide sweep result (2026-06-08, in-session triage of all 74 `$transaction` sites → 22 file-level
suspects → per-block read).** The Feb-2026 eradication caught the user-facing RMW sites; the residue is one
HIGH + four LOW/MEDIUM internal sites. NOT widespread — but `kpi.ts` was falsely listed "Already Protected".

**ALL FIXED 2026-06-08** (mechanism split: atomic single-statement for clean merges/appends; `FOR UPDATE`
row-lock where complex multi-step JS logic stays — FOR UPDATE waits, never aborts). Regression guard:
`scripts/test-bc19-lost-update-guards.ts` (in `test:all-validation`).

**Follow-on 2026-06-09 (#2 serialization-retry work):** added `withSerializationRetry` (`lib/database/serialization-retry.ts`,
the "loud→retry" tool — adapter over `withRetry`, full jitter + caps) and wrapped 3 multi-field RR sites
(`task.ts:updateTask`, `task-update-handler`, `agent-configure`); converted 2 more abort-prone RR sites to ATOMIC
(`agentTemplateService.updateTemplatePerformance` running-avg, `metadata.updateMetadata` jsonb `||`). Also fixed
the broken `FOR UPDATE NOWAIT` locks (wrong table `phases`→`"Phase"` + `::uuid`-on-CUID cast, commit 07375dd4).
See transaction-atomicity-pattern.md §Retry (+ the decision rule) and BC14 (the shared retry core / jitter).

| File | Pattern | Severity | Fix shipped |
|------|---------|----------|-------------|
| `lib/services/workflow/tracking/orchestration-tracker.ts` `recordStep` | metadata `steps` array-append | **HIGH** (parallel steps) | **atomic `jsonb_set(... '{steps}', metadata->'steps' \|\| $step)`** (true concurrency; RR would abort-storm) |
| `lib/pov/services/kpi.ts` `updateKPIHistory` | `history` array-append (was wrongly in "Already Protected") | **MEDIUM** | **atomic `COALESCE(history,'[]') \|\| $entry`** |
| `lib/services/workflow/tracking/orchestration-tracker.ts` `complete`/`fail` | metadata merge + named-workflow running-avg stats (dual RMW) | LOW (1/workflow) | **`FOR UPDATE`** on the execution row + the `mcp_workflows` stats row (keeps the dual-update logic; waits, no abort on the terminal-status write) |
| `app/api/admin/crm/sync/route.ts` | `details` jsonb merge | LOW (1 job completion) | **atomic `COALESCE(details,'{}') \|\| $patch`** |
| `app/api/pov/[povId]/team/members/route.ts` (also BC47#1/2) | TOCTOU double-team-create (plain-tx re-read "to prevent race" — misconception verbatim) | LOW | **`FOR UPDATE`** on the `"POV"` row up front (the plain re-read took no lock) |
| `lib/mcp/server/tools/hub/hub-utilities.js` EMA (also BC47#5) | `mcp_tools` responseTime/successRate EMA RMW | MEDIUM (high-freq, metrics) | **`FOR UPDATE`** on the `mcp_tools` row (keeps EMA logic; fire-and-forget so the convoy is fine; RR would abort-storm) |

**Confirmed SAFE despite the flag** (read-verified): `agentExecutionEngine.ts:172/186` (multi-table atomic
literal writes — legit `$transaction`), `auth/verify:36` (find-then-set-status, no merge), all `updateMany`-CAS
and atomic-expression sites.

> **BC47 cross-link:** the team-create race (BC47 HIGH #1/2) and the EMA metrics RMW (BC47 #5) were both
> "ERADICATED" in Feb 2026 by *wrapping in `$transaction`* — the BC19 misconception. **BC47 is REOPENED**
> for these two (now actually fixed via `FOR UPDATE`, 2026-06-08). See BC47 §status.

**Dead `inputContext` blind-replace writers (low severity, documented not fixed):** `agent-configure-handler.ts:557`
+ `pov/handlers/put.ts:567` whole-replace `inputContext`, dropping system-owned keys (`chainedFrom`); reachable
only via a concurrent user edit mid-cascade, bounded + self-healing (see TS4 SYNTHESIS Class B resolution).

---

## BC22: Header Injection + SSRF

**Status**: ERADICATED
**Severity**: CRITICAL
**Discovered**: February 27, 2026
**Eradicated**: February 27, 2026 (5 sites in 8 files + 2 new utilities)
**Extended**: February 27, 2026 (6 OPTIONS handlers with unvalidated CORS credentials → shared `corsPreflightResponse()` utility)

### Description

User-controlled data flows into HTTP response headers (Content-Disposition filenames) and server-side fetch URLs without sanitization. CRLF characters in filenames can inject arbitrary headers (including Set-Cookie). User-registered service endpoints can trigger SSRF to internal/private addresses. OPTIONS preflight handlers return `Access-Control-Allow-Credentials: true` without validating Origin.

### Root Cause

Missing output encoding at the HTTP response boundary (headers are a text protocol — control chars have semantic meaning). Missing input validation at the fetch boundary (any URL including private addresses accepted).

### Variants

| Variant | Risk | Pattern | Fix |
|---------|------|---------|-----|
| CRLF header injection | CRITICAL | `Content-Disposition: filename="${userInput}"` | `safeContentDisposition()` strips control chars |
| SSRF via user endpoints | CRITICAL | `fetch(userRegisteredUrl)` without IP validation | `validateUrlSafety()` blocks private ranges |
| CORS origin echo | MEDIUM | `Access-Control-Allow-Origin: ${request.origin}` with credentials | Origin allowlist + same-origin check |
| CORS preflight credentials leak | MEDIUM | OPTIONS handler returns `Allow-Credentials: true` to any origin | `corsPreflightResponse()` validates Origin first |

### Fixed Sites

| # | File | Variant | Fix |
|---|------|---------|-----|
| 1 | `app/api/artifacts/[id]/download/route.ts` | CRLF injection | `safeContentDisposition()` |
| 2 | `app/api/artifacts/[id]/public-download/route.ts` | CRLF injection (public!) | `safeContentDisposition()` |
| 3 | `app/api/pov/agent/artifacts/.../download/route.ts` | CRLF injection | `safeContentDisposition()` |
| 4 | `app/api/support/knowledge/[filename]/route.ts` | CRLF injection (defense-in-depth) | `safeContentDisposition()` |
| 5 | `lib/mcp/server/tools/hub/service-health-handler.js` | SSRF | `validateUrlSafety()` blocks private IPs |
| 6 | `middleware.ts` | CORS origin echo | Origin allowlist + same-origin check |
| 7 | `app/api/artifacts/[id]/download/route.ts` (GET+OPTIONS) | CORS origin echo | Same-origin check |
| 8 | `app/api/notifications/route.ts` | CORS preflight credentials leak | `corsPreflightResponse()` |
| 9 | `app/api/notifications/clear/route.ts` | CORS preflight credentials leak | `corsPreflightResponse()` |
| 10 | `app/api/notifications/[notificationId]/read/route.ts` | CORS preflight credentials leak | `corsPreflightResponse()` |
| 11 | `app/api/dashboard/route.ts` | CORS preflight credentials leak | `corsPreflightResponse()` |
| 12 | `app/api/auth/verify/route.ts` | CORS preflight credentials leak | `corsPreflightResponse()` |
| 13 | `app/api/auth/me/route.ts` | CORS preflight credentials leak | `corsPreflightResponse()` |

### Defense Utilities Created

- `lib/utils/sanitize-filename.ts` — `sanitizeFilename()` + `safeContentDisposition()`: strips control chars, escapes quotes, enforces length limit
- `lib/utils/url-safety.js` — `validateUrlSafety()`: blocks private IPv4/IPv6 ranges, loopback, link-local, cloud metadata endpoints, internal domains
- `lib/utils/cors.ts` — `isAllowedOrigin()` + `corsPreflightResponse()`: shared Origin validation extracted from middleware, reusable for route OPTIONS handlers

### Detection Commands

```bash
# Find Content-Disposition with interpolated values
grep -rn 'Content-Disposition.*\${' --include='*.ts' --include='*.js' app/ lib/ | grep -v safeContentDisposition

# Find fetch() with non-hardcoded URLs
grep -rn 'fetch(' --include='*.js' lib/mcp/ | grep -v node_modules | grep -v 'validateUrlSafety'

# Find CORS origin echo (any origin with credentials)
grep -rn 'Allow-Origin.*origin\|Allow-Origin.*request' --include='*.ts' app/ middleware.ts | grep -v 'isAllowedOrigin\|same-origin\|toLowerCase()'

# Find OPTIONS handlers returning credentials without corsPreflightResponse
grep -rn 'Allow-Credentials.*true' --include='*.ts' app/api/ | grep -v 'corsPreflightResponse\|isAllowedOrigin'
```

---

## Bug Class 21: Unsafe Numeric Coercion

**Status**: ERADICATED
**Severity**: HIGH
**Discovered**: February 27, 2026
**Eradicated**: February 27, 2026

### Description

`parseInt()`, `parseFloat()`, `Number()`, and `Boolean()` used on user input, env vars, or raw SQL results without proper guards for NaN, Infinity, or string-to-boolean traps. Five variant patterns discovered:

### Variants

| Variant | Risk | Pattern | Fix |
|---------|------|---------|-----|
| A: `Number()` + `!isNaN` missing `isFinite` | HIGH | `Number('Infinity')` passes `!isNaN()` | Add `isFinite()` check |
| B: `parseInt(env var)` without NaN guard | HIGH | `parseInt('abc')` returns NaN, disables rate limiters | `parseInt(x, 10) \|\| default` |
| C: `Boolean(rawSQL)` string trap | HIGH | `Boolean('f')` === `true` when PostgreSQL returns string | Strict equality (`=== true \|\| === 't'`) |
| D: `parseFloat(userInput)` Infinity | MEDIUM | `parseFloat('Infinity')` stored to DB Decimal | `Number.isFinite()` guard |
| E: `parseInt(userInput)` Math.max NaN | MEDIUM | `Math.max(1, NaN)` returns NaN | `parseInt(x, 10) \|\| default` |

### All Sites (20 sites / 15 files — all fixed)

| # | File | Line | Pattern | Severity |
|---|------|------|---------|----------|
| 1 | `lib/mcp/embedded-server.ts` | 1187 | `Number()` + `!isNaN` missing `isFinite` | HIGH |
| 2 | `middleware/rate-limiter-enhanced.ts` | 18-24 | `parseInt(env)` no NaN guard on rate limiter | HIGH |
| 3 | `middleware/request-throttle.ts` | 42-53 | `parseInt(env)` no NaN guard on throttle | HIGH |
| 4 | `lib/pov/services/stageValidationService.ts` | 158 | `Boolean(rawSQL)` — `'f'` string trap | HIGH |
| 5 | `lib/config.ts` | 42 | `parseInt(env)` JWT cookie maxAge | MEDIUM |
| 6 | `lib/auth/token-manager.ts` | 85 | `parseInt(config)` access token expiry | MEDIUM |
| 7 | `lib/auth/token-manager.ts` | 114 | `parseInt(config)` refresh token expiry | MEDIUM |
| 8 | `app/api/auth/login/route.ts` | 257,278,286 | 3x `parseInt(config)` cookie maxAge | MEDIUM |
| 9 | `app/api/auth/refresh/route.ts` | 94,152 | 2x `parseInt(config)` cookie maxAge | MEDIUM |
| 10 | `app/api/auth/oauth/callback/[provider]/route.ts` | 104,120,128 | 3x `parseInt(config)` cookie maxAge | MEDIUM |
| 11 | `lib/admin/handlers/user.ts` | 49-50 | `parseInt(user input)` no radix/guard | MEDIUM |
| 12 | `lib/tasks/handlers/get.ts` | 40-41 | `Math.max(1, parseInt(NaN))` = NaN | MEDIUM |
| 13 | `lib/middleware/validation-middleware.ts` | 138-139 | `parseInt(user input)` truthy but not NaN check | MEDIUM |
| 14 | `app/api/analytics/domains/overview/index.ts` | 22 | `parseInt(timeRange)` Invalid Date | MEDIUM |
| 15 | `app/api/analytics/domains/tasks/performance.ts` | 45 | `parseInt(timeframe)` Invalid Date | MEDIUM |
| 16 | `app/api/mcp/tasks/action/route.ts` | 358,361 | `parseInt(user param)` NaN timeout/retries | MEDIUM |
| 17 | `lib/pov/templates/service.ts` | 311,315 | `parseFloat(formData)` Infinity to DB | MEDIUM |

### Detection Commands

```bash
# Pattern A: Number() without isFinite
grep -rn '!isNaN(Number(' --include='*.ts' --include='*.js' lib/ app/api/ | grep -v isFinite | grep -v node_modules

# Pattern B: parseInt(env) without || default
grep -rn "parseInt(process.env" --include='*.ts' --include='*.js' lib/ middleware/ app/api/ | grep -v '|| ' | grep -v node_modules

# Pattern C: Boolean() on raw SQL results
grep -rn 'Boolean(data\.' --include='*.ts' lib/ | grep -v node_modules

# Pattern D: parseFloat without isFinite guard
grep -rn 'parseFloat(formData\|parseFloat(body\|parseFloat(params' --include='*.ts' lib/ app/api/ | grep -v 'isFinite\|isNaN' | grep -v node_modules
```

---

## Bug Class 23: Response Body / Stream Leak

**Status**: ERADICATED
**Severity**: HIGH
**Discovered**: February 27, 2026
**Eradicated**: February 27, 2026

### Description

`fetch()` calls where the response body is not consumed in error paths (or never consumed at all), leaking the underlying TCP connection. Node.js cannot reuse the connection in its pool until the remote server closes it. Also includes missing `AbortSignal.timeout()` on external HTTP calls, which can cause indefinite hangs if the remote server stops responding.

### Root Cause

Two patterns:
1. **Body leak**: `if (!response.ok) throw new Error(...)` without calling `response.text()`, `response.json()`, or `response.body?.cancel()` first. The response body stream stays open, pinning the TCP socket.
2. **Missing timeout**: `fetch(externalUrl)` without `signal: AbortSignal.timeout(N)`. If the external server hangs, the fetch hangs indefinitely, blocking the event loop or consuming a connection forever.

### Shared Defense

```typescript
// Error path: cancel body before throwing
if (!response.ok) {
  await response.body?.cancel();
  throw new Error(`HTTP ${response.status}`);
}

// External URL: always add timeout
const response = await fetch(url, {
  signal: AbortSignal.timeout(10_000),
  ...otherOptions,
});
```

### All Sites (21 sites / 15 files — all fixed)

| # | File | Line | Issue | Severity |
|---|------|------|-------|----------|
| 1 | `lib/services/mcp/mcpService.ts` | 747 | Body leak on `!ok` + no timeout | HIGH |
| 2 | `lib/auth/oauth/mcp-oauth-validator.js` | 56 | GitHub body leak + no timeout | HIGH |
| 3 | `lib/auth/oauth/mcp-oauth-validator.js` | 138 | Google tokenInfo body leak + no timeout | HIGH |
| 4 | `lib/auth/oauth/mcp-oauth-validator.js` | 149 | Google profile body leak + no timeout | HIGH |
| 5 | `lib/auth/oauth/mcp-oauth-validator.js` | 197 | Microsoft Graph body leak + no timeout | HIGH |
| 6 | `mcp-server-http-clean.js` | 750 | GitHub body leak + no timeout | HIGH |
| 7 | `mcp-server-http-clean.js` | 2605 | GitHub token exchange partial-read + no timeout | HIGH |
| 8 | `lib/auth/oauth/oauth-service.ts` | 825 | Revoke: body never consumed + no timeout | MEDIUM |
| 9 | `lib/auth/oauth/oauth-service.ts` | 223 | getUserInfo body leak + no timeout | MEDIUM |
| 10 | `lib/auth/oauth/oauth-service.ts` | 190 | exchangeCodeForTokens: no timeout (body consumed) | MEDIUM |
| 11 | `lib/auth/oauth/oauth-service.ts` | 711 | performTokenRefresh: no timeout (body consumed) | MEDIUM |
| 12 | `lib/auth/oauth/retry-utils.ts` | 120 | Body leak on retryable 429/503/504 | MEDIUM |
| 13 | `lib/auth/oauth/retry-utils.js` | 92 | Same as above (JS copy) | MEDIUM |
| 14 | `lib/mcp/server/auth/auth-manager.js` | 79 | Session login body leak + no timeout | MEDIUM |
| 15 | `lib/mcp/server/auth/auth-manager.js` | 128 | Bearer login body leak + no timeout | MEDIUM |
| 16 | `lib/mcp/server/auth/auth-manager.js` | 196 | Health check body always leaked + no timeout | MEDIUM |
| 17 | `lib/services/template-service.ts` | 43,89 | Both error paths discard body | MEDIUM |
| 18 | `app/api/pov/route.ts` | 464 | Phase template fetch body leak | MEDIUM |
| 19 | `lib/auth/middleware.ts` | 27,87 | Token refresh body never consumed (2 paths) | MEDIUM |
| 20 | `app/api/llm/proxy/route.ts` | — | Missing `AbortSignal.timeout(30_000)` on external fetch | HIGH |
| 21 | `app/api/llm/proxy/stream/route.ts` | — | Missing `AbortSignal.timeout(60_000)` on external fetch | HIGH |
| 22 | `lib/services/llm/base-provider.ts` | — | Missing `AbortSignal.timeout(30_000)` on external fetch | HIGH |

#### Session 9 Detection Re-Audit Extension (Mar 4, 2026)

Sites 20-22 found during detection command re-audit. Three LLM-related fetch calls to external endpoints were missing `AbortSignal.timeout()`, allowing indefinite hangs if the upstream LLM provider stops responding. Fixed with appropriate timeouts (30s for non-streaming, 60s for streaming).

### Detection Commands

```bash
# Find fetch() calls without AbortSignal.timeout
grep -rn 'await fetch(' --include='*.ts' --include='*.js' lib/ app/api/ mcp-server-http-clean.js | grep -v node_modules | grep -v '.d.ts' | grep -v 'AbortSignal'

# Find !response.ok without body consumption
grep -B 2 -A 3 '!response.ok' --include='*.ts' --include='*.js' lib/ app/api/ | grep -v 'response.text\|response.json\|body.*cancel' | grep -v node_modules

# Verify body consumption in error paths
grep -A 5 'throw new Error.*response.status' --include='*.ts' --include='*.js' lib/ app/api/ | grep -v 'body.*cancel\|response.text\|response.json'
```

---

## Bug Class 24: Race Conditions, DoS Vectors & Resource Safety

**Status**: ERADICATED
**Severity**: CRITICAL (2 CRITICAL + 7 HIGH)
**Discovered**: February 27, 2026 (hunt session — 3 parallel attack surface scans)
**Eradicated**: February 27, 2026

### Description

A composite bug class covering three related attack surfaces discovered during systematic hunt:
- **Race conditions**: Channel name mismatch silently dropping all real-time events, double-close writer crash, array mutation during iteration, concurrent initialization race, re-entrant reconnect scheduling
- **DoS vectors**: Unbounded findMany (full table dump), unbounded Promise.all on user-controlled arrays, uncapped limit parameters, ReDoS via user-controlled RegExp keys
- **Resource safety**: Path traversal via unsanitized traceId in `path.join`

### Root Causes

1. **Channel mismatch**: PostgreSQL trigger sends to `execution_updates` but code LISTENed on `execution_events` — off-by-one naming error silently dropped 100% of notifications
2. **Double-close**: `writer.close()` in error handler + `finally` block — second close throws on already-closed writer
3. **Array mutation during forEach**: `unsubscribeById()` calls `splice()` during `forEach` iteration, skipping elements
4. **Concurrent initialization**: Multiple `registerEventSystem()` calls can both see `!isConnected` and start parallel connections
5. **Unbounded queries**: `findMany` without `take` limit on user-scoped data, `Promise.all` on user-controlled arrays without size cap
6. **ReDoS**: `new RegExp({{${key}}})` where key comes from user-controlled MCP args
7. **Path traversal**: `path.join(os.tmpdir(), ${input.traceId}.zip)` with unsanitized traceId

### All Sites (17 sites / 17 files)

| # | Severity | File | Finding | Fix |
|---|----------|------|---------|-----|
| 1 | CRITICAL | `lib/events/execution-events.ts` + `.js` | LISTEN `execution_events` ≠ trigger `execution_updates` | Channel → `execution_updates`, removed redundant filter |
| 2 | CRITICAL | `app/api/pov/agent/execute/stream/route.ts` | Double-close writer crash (error path + finally) | `writerClosed` flag guards `finally` |
| 3 | CRITICAL | `app/api/analytics/domains/tasks/performance.ts` | Unbounded `findMany` (2 queries, no `take`) | `take: 10000` caps |
| 4 | HIGH | `lib/services/taskSubscriptionService.ts` | `splice()` during `forEach` skips elements | Collect-then-remove pattern |
| 5 | HIGH | `lib/events/shared-connection-pool.ts` | Concurrent `initializeConnection` race | `initPromise` dedup guard |
| 6 | HIGH | `lib/events/shared-connection-pool.ts` | Re-entrant `scheduleReconnect` | `isReconnecting` flag |
| 7 | HIGH | `services/browser-automation-service/src/tools/trace-session.ts` | Path traversal via `traceId` in `path.join` | Sanitize to `[a-zA-Z0-9_-]` |
| 8 | HIGH | `lib/mcp/embedded-server.ts` | ReDoS via `new RegExp({{${key}}})` | `replaceAll()` instead of `new RegExp` |
| 9 | HIGH | `app/api/pov/[povId]/phase/[phaseId]/task/reorder/route.ts` | Unbounded `Promise.all` on user array | 500-item cap |
| 10 | HIGH | `app/api/agent-templates/recommendations/route.ts` | Uncapped `limit` param → unbounded query | `Math.min(limit, 50)` |
| 11 | MEDIUM | `app/api/analytics/domains/agents/summary.ts` | Unbounded `findMany` (no `take`) | `take: 10000` cap |
| 12 | MEDIUM | `app/api/analytics/domains/tasks/insights.ts` | Unbounded `findMany` — tasksAtRisk query | `take: 1000` cap |
| 13 | MEDIUM | `app/api/analytics/domains/tasks/insights.ts` | Unbounded `findMany` — blockedTasks query | `take: 1000` cap |
| 14 | MEDIUM | `app/api/analytics/domains/overview/index.ts` | Unbounded `findMany` — tasks query | `take: 10000` cap |
| 15 | MEDIUM | `app/api/analytics/domains/overview/index.ts` | Unbounded `findMany` — agentExecutions query | `take: 10000` cap |
| 16 | MEDIUM | `app/api/analytics/domains/team/activity.ts` | Unbounded `findMany` — teamMembers query | `take: 1000` cap |
| 17 | MEDIUM | `app/api/analytics/domains/mcp/index.ts` | Unbounded `findMany` — mcpInteractions query | `take: 10000` cap |

#### Session 9 Detection Re-Audit Extension (Mar 4, 2026)

Sites 11-17 found during detection command re-audit of unbounded `findMany` queries in the analytics domain. All 7 queries were missing `take:` caps, allowing potential full table dumps. Fixed with appropriate caps (1000 for focused queries, 10000 for broad summary queries).

### Detection Commands

```bash
# Channel mismatch: LISTEN channel vs NOTIFY channel
grep -rn "channels = \[" --include='*.ts' --include='*.js' lib/events/ | grep -v node_modules
grep -rn "pg_notify\|NOTIFY" --include='*.sql' prisma/

# Double-close writer
grep -rn 'writer\.close' --include='*.ts' app/api/ | grep -v node_modules
# For each file: verify only one close path executes (flag or early return)

# Array mutation during iteration
grep -B 5 -A 10 'forEach.*callback' --include='*.ts' lib/services/ | grep -A 10 'splice\|unsubscribe'

# Concurrent initialization
grep -rn 'if (!this.isConnected)' --include='*.ts' lib/events/ | grep -v node_modules
# Verify: guarded by initPromise dedup

# Unbounded findMany
grep -rn 'findMany({' --include='*.ts' app/api/analytics/ | grep -v 'take:'

# Unbounded Promise.all on user arrays
grep -B 5 'Promise\.all' --include='*.ts' app/api/ | grep -B 5 'data\.\|body\.\|request'

# new RegExp with user keys
grep -rn 'new RegExp.*\${' --include='*.ts' lib/ | grep -v safeRegex | grep -v INJECTION_PATTERNS

# Path traversal in path.join
grep -rn 'path\.join.*input\.\|path\.join.*req\.\|path\.join.*params\.' --include='*.ts' | grep -v node_modules
```

### Commits

| Commit | Description |
|--------|------------|
| `85c21d2a` | Eradication — 10 sites / 11 files |

---

## Bug Class 25: Webpack SSR Class Field Crash

**Status**: ERADICATED
**Severity**: CRITICAL
**Discovered**: February 27, 2026 (during analytics smoke testing)
**Eradicated**: February 27, 2026

### Description

Next.js webpack server bundling breaks ES2022 class fields (`class Foo extends Bar { field = "value"; }`) in packages that use class inheritance. The transpiled output accesses `this` before `super()` completes, producing `ReferenceError: Must call super constructor in derived class before accessing 'this'`. Affects any npm package with class hierarchies using instance field syntax when webpack bundles it for SSR.

### Root Cause

Webpack's server chunk bundler does not correctly handle native ES class field initializers in subclasses. Instance field initialization runs before `super()` returns in the bundled output, violating the ECMAScript spec. The same packages work perfectly when loaded via `require()` directly from `node_modules`.

### Sites Found: 2 sites / 1 file

| # | File | Description | Severity |
|---|------|-------------|----------|
| 1 | `next.config.js` | `jose` error classes (JWTExpired, JWTClaimValidationFailed) crash when constructing error objects — broke ALL token refresh, making every authenticated API return 500 | CRITICAL |
| 2 | `next.config.js` | `@tanstack/query-core` classes crash SSR — pre-existing fix used legacy build alias | CRITICAL |

### Defense

- **`serverComponentsExternalPackages`**: Add affected packages to this Next.js config array to prevent webpack bundling, loading them directly via `require()` at runtime instead
- **Legacy build alias**: For packages with legacy builds available, webpack alias to the non-class-field variant (used for `@tanstack/query-core`)

### Detection Commands

```bash
# Check if any packages with class hierarchies are missing from externals
grep -rn 'serverComponentsExternalPackages' next.config.js

# Check production logs for the telltale error
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart-web --lines 200 --nostream 2>&1 | grep 'Must call super constructor'"

# Test jose error construction on production (should work if externalized)
ssh <PROD_USER>@<PROD_HOST> "cd /var/www/paichart-app/current && node -e \"const {jwtVerify}=require('jose'); const c=require('crypto'); (async()=>{const s=c.createSecretKey(Buffer.from('x'.repeat(32))); const {SignJWT}=require('jose'); const t=await new SignJWT({}).setProtectedHeader({alg:'HS256'}).setExpirationTime('-1s').sign(s); try{await jwtVerify(t,s)}catch(e){console.log('OK:',e.code)}})().catch(console.error)\""
```

### Commits

| Commit | Description |
|--------|------------|
| `61de38fb` | Eradication — externalize jose from webpack |

---

## Bug Class 26: Unscoped Admin-Level Queries

**Status**: ERADICATED
**Severity**: HIGH
**Discovered**: February 27, 2026 (during team management E2E testing)
**Eradicated**: February 27, 2026

### Description

Dashboard/analytics endpoints that return org-wide aggregated data to any authenticated user without role-based scoping. A regular USER or DEMO_USER can see metrics, team activity, and summaries for ALL teams, ALL users, ALL tasks across the entire organization — data they should only see if they are ADMIN or SUPER_ADMIN.

### Root Cause

Queries use `prisma.X.findMany({})` with no `where` clause scoping to the user's accessible POVs. The `createHandler({ requireAuth: true })` pattern verifies the user is authenticated but doesn't enforce data-level authorization. The export endpoint already had the correct role-based scoping pattern, but the summary endpoint was built without it.

### Sites Found: 1 site / 1 file

| # | File | Description | Severity |
|---|------|-------------|----------|
| 1 | `app/api/dashboard/team-activity/summary/route.ts` | 4 unscoped queries (teams, users, tasks, activities) returned ALL org data to any authenticated user | HIGH |

### Defense

- **Role-based POV scoping pattern**: Replicate the export endpoint's pattern:
  - `ADMIN/SUPER_ADMIN`: full access (no additional where clause)
  - `USER`: `{ OR: [{ ownerId: userId }, { team: { members: { some: { userId } } } }] }`
  - `DEMO_USER`: adds `{ metadata: { path: ['isDemo'], equals: true } }`
- **Performance co-benefit**: Scoped queries reduce result set size for non-admin users (16s → sub-2s)

### Detection Commands

```bash
# Find dashboard/analytics endpoints without role-based scoping
grep -rn 'findMany({$' --include='*.ts' app/api/dashboard/ app/api/analytics/
# For each hit: verify the where clause includes user role-based POV filtering

# Find unscoped aggregate queries
grep -rn 'prisma\.\w\+\.findMany' --include='*.ts' app/api/dashboard/ | grep -v 'where'
# Expected: 0 results — all dashboard queries should have where clauses
```

### Commits

| Commit | Description |
|--------|------------|
| `59f9a672` | Eradication — role-based POV scoping for team-activity/summary |

---

## Bug Class 66: Insecure Direct Database Access (Query Injection)

**Status**: ERADICATED
**Severity**: CRITICAL
**Discovered**: February 28, 2026 (Session 7 hunt round)
**Eradicated**: February 28, 2026

### Description

Dynamic `orderBy` fields built from user input without allowlist validation. Prisma doesn't protect against invalid field names in computed `orderBy` keys — an attacker can probe for column names or cause database errors. Combined with unclamped pagination (`take`/`skip`) that could dump entire tables.

### Root Cause

Using `[filters.sortBy || 'createdAt']` or `[query.sortBy as string]` in Prisma `orderBy` allows arbitrary field names from user input. The `as any` cast on the orderBy object bypasses TypeScript's type checking.

### Sites Found: 5 sites / 3 files

| # | File | Description | Severity |
|---|------|-------------|----------|
| C1 | `lib/services/agentTaskService.ts:391` | `[filters.sortBy || 'createdAt']` with `sortBy?: string` type | CRITICAL |
| C2 | `app/api/agent-executions/route.ts:170` | `[query.sortBy as string] as any` bypasses Zod schema safety | CRITICAL |
| C3 | `lib/tasks/services/taskSearchService.ts:433` | `[orderBy]` from unvalidated `filters.orderBy` | CRITICAL |
| M1 | `lib/services/agentTaskService.ts` | Unclamped `take`/`skip` on pagination | MEDIUM |
| M2 | `lib/services/agentTaskService.ts` | Missing integer coercion | MEDIUM |

### Defense

- **orderBy allowlist**: Validate against explicit array of allowed field names before use
- **Type narrowing**: Change `sortBy?: string` to union type matching allowlist
- **Pagination clamping**: `Math.min(take, 100)` + `Math.max(0, skip)`
- **Remove `as any` casts**: Let TypeScript enforce type safety on orderBy objects

### Detection Commands

```bash
# Find dynamic orderBy with string interpolation
grep -rn '\[.*sort\|orderBy\]' --include='*.ts' lib/ app/ | grep -v node_modules | grep -v 'ALLOWED\|allowlist'
# Find 'as any' on orderBy objects
grep -rn 'orderBy.*as any' --include='*.ts' lib/ app/
```

---

## Bug Class 67: Unsafe State Transitions & Cascade Safety

**Status**: ERADICATED
**Severity**: CRITICAL
**Discovered**: February 28, 2026 (Session 7 hunt round)
**Eradicated**: February 28, 2026

### Description

Execution records created directly in `RUNNING` status without atomic compare-and-swap guard, allowing concurrent duplicate executions on the same task. Phase deletion cascades without reporting impact counts to the caller.

### Root Cause

The streaming execution route (`/api/pov/agent/execute/stream`) created `agentExecution` records directly with `status: 'RUNNING'` and set `task.executionStatus` without the atomic CAS guard used by the non-streaming route. Phase deletion counted affected resources for audit logging but didn't return them in the response.

### Sites Found: 2 sites / 2 files

| # | File | Description | Severity |
|---|------|-------------|----------|
| C2 | `app/api/pov/agent/execute/stream/route.ts` | Creates execution as RUNNING without CAS guard — duplicate concurrent executions possible | CRITICAL |
| H4 | `app/api/pov/[povId]/phase/[phaseId]/route.ts` | DELETE cascades without reporting impact counts in response | HIGH |

### Notes

- BC67 C1 (non-streaming execute route): Already defended — has atomic CAS via `updateMany` + `notIn: ['RUNNING', 'PENDING', 'READY']` + orphan cleanup (lines 198-219)
- BC67 H1/H2 (date validation): Already defended — Zod schemas use `z.date()` and `z.string().datetime()` which validate dates at schema level
- BC67 H3 (POV launch idempotency): Low risk — POV status changes go through validated PUT handler, no dedicated launch endpoint

### Defense

- **Atomic CAS guard**: `updateMany` with `executionStatus: { notIn: ['RUNNING', 'PENDING'] }` before creating execution record
- **Cascade impact response**: Return `{ affected: { stages, tasks } }` in DELETE response so caller knows cascade scope

### Detection Commands

```bash
# Find execution creation without CAS guard
grep -rn "status: 'RUNNING'" --include='*.ts' app/api/ | grep -v 'updateMany\|notIn'
# Find cascade deletes without impact counts
grep -rn 'prisma\.\w\+\.delete' --include='*.ts' app/api/ | grep -v 'affected\|count'
```

---

## Bug Class 68: Sensitive Data Exposure

**Status**: ERADICATED
**Severity**: CRITICAL
**Discovered**: February 28, 2026 (Session 7 hunt round)
**Eradicated**: February 28, 2026

### Description

Sensitive fields returned in API responses: `verificationToken` in `/auth/me` user data (allows account takeover via verification bypass) and CRM API credentials in plaintext via admin GET endpoint.

### Root Cause

Prisma `select` objects explicitly included `verificationToken: true` in the `/auth/me` query. CRM settings GET returned the raw database record including `apiKey` and `clientSecret` without masking.

### Sites Found: 3 sites / 2 files

| # | File | Description | Severity |
|---|------|-------------|----------|
| C1 | `app/api/auth/me/route.ts` | `verificationToken` included in user select → exposed to all authenticated users | CRITICAL |
| C2 | `app/api/admin/crm/settings/route.ts` | CRM `apiKey` and `clientSecret` returned in plaintext via GET | CRITICAL |
| C3 | `app/api/admin/crm/settings/route.ts` | POST response returning plaintext `apiKey` and `clientSecret` (GET was masked but POST was not) | CRITICAL |

#### Session 9 Detection Re-Audit Extension (Mar 4, 2026)

Site C3 found during detection command re-audit. The GET handler already had credential masking via `mask()`, but the POST handler returned the raw saved record including plaintext secrets. Fixed by applying the same `mask()` pattern to POST response.

### Defense

- **Field exclusion**: Remove `verificationToken: true` from Prisma select (never needed client-side)
- **Credential masking**: Show only last 4 chars of secrets (`'•'.repeat(len-4) + s.slice(-4)`)
- **Principle of least privilege**: Only return fields the client actually needs

### Detection Commands

```bash
# Find sensitive fields in API responses
grep -rn 'verificationToken\|clientSecret\|apiKey\|password' --include='*.ts' app/api/ | grep 'select.*true\|Response.json'
# Find raw database records returned without field filtering
grep -rn 'return Response.json(settings' --include='*.ts' app/api/admin/
```

---

## Summary Dashboard

| # | Bug Class | Status | Severity | Sites | Defense |
|---|-----------|--------|----------|-------|---------|
| 1 | Transport Boundary Coercion | ERADICATED | CRITICAL | 25 (6 commits) | `ensureObject()` + Zod + CJS bridge |
| 2 | Prisma Json Column Ambiguity | ERADICATED | MEDIUM | 26+1 guards / 15 files | `ensureObject()` + `Array.isArray` + Zod helper |
| 3 | Form Boundary Type Loss | ERADICATED | MEDIUM | 10 sites / 10 files | `\|\| default` NaN fallback + `isNaN()` |
| 4 | Null vs Undefined at Forms | RESOLVED | LOW | 0 | Zod transform + conditional spread (28 tests) |
| 5 | MCP Context Field Mismatch | MONITORED | LOW | 0 active | Consistent |
| 6 | React Stale Closures | MONITORED | LOW | 0 active | ESLint enforced |
| 7 | Double Serialization in Workflows | FALSE ALARM | N/A | 0 | Investigated — not a real bug class |
| 8 | Express Body Parser Consumption | ERADICATED | CRITICAL | All Docker services | Gold standard |
| 9 | Endpoint URL Credential Leakage | ERADICATED | HIGH | 8 sites / 6 files | `sanitizeEndpointUrl()` |
| 10 | Error Level Misclassification | ERADICATED | MEDIUM | 37 sites / 14 files | Downgrade to `warn`/`debug` |
| 11 | Unhandled Async Fire-and-Forget | ERADICATED | HIGH | 7 sites / 5 files | `.catch()` on async in `setInterval` |
| 12 | Execution Claim Race (TOCTOU) | ERADICATED | HIGH | 2 sites / 1 file | Atomic `updateMany` claim before execute |
| 13 | Empty LLM Response False SUCCESS | ERADICATED | MEDIUM | 3 sites / 3 files | Content validation before SUCCESS |
| 14 | Retry Without Backoff (Thundering Herd) | ERADICATED | MEDIUM | 3 sites / 3 files | Exponential backoff + 20% jitter |
| 15 | ReDoS via User-Controlled Regex | ERADICATED | HIGH | 6 sites / 6 files | `safeRegex()` + positive-match patterns |
| 16 | Timing-Unsafe Secret Comparison | ERADICATED | HIGH | 2 sites / 2 files | `crypto.timingSafeEqual()` |
| 17 | Code Injection via new Function() | ERADICATED | CRITICAL | 1 site / 1 file | Blocklist validation + length limit |
| 18 | Error Message Leakage to Clients | ERADICATED | HIGH | 73 sites / 42 files | Generic message + server-side logging |
| 19 | Read-Modify-Write Race Conditions | ERADICATED | HIGH | 15 sites / 14 files | `$transaction(RepeatableRead)` + atomic CAS |
| 20 | Content-Type Validation Gap | FALSE ALARM | N/A | 0 | Next.js handles gracefully + Zod defense-in-depth |
| 21 | Unsafe Numeric Coercion | ERADICATED | HIGH | 20 sites / 15 files | `\|\| default` NaN guard + `isFinite()` + strict boolean comparison |
| 22 | Header Injection + SSRF + CORS Preflight | ERADICATED | CRITICAL | 13 sites / 14 files | `safeContentDisposition()` + `validateUrlSafety()` + `corsPreflightResponse()` |
| 23 | Response Body / Stream Leak | ERADICATED | HIGH | 21 sites / 15 files | `response.body?.cancel()` + `AbortSignal.timeout()` |
| 24 | Race Conditions, DoS & Resource Safety | ERADICATED | CRITICAL | 17 sites / 17 files | Channel fix + `writerClosed` + collect-then-remove + `initPromise` + caps + `replaceAll` + sanitize |
| 25 | Webpack SSR Class Field Crash | ERADICATED | CRITICAL | 2 sites / 1 file | `serverComponentsExternalPackages` + legacy build alias |
| 26 | Unscoped Admin-Level Queries | ERADICATED | HIGH | 1 site / 1 file | Role-based POV scoping (ADMIN/USER/DEMO_USER) |
| 27 | Prototype Pollution via Passthrough | ERADICATED | CRITICAL | 38 sites / 15 files | `stripDangerousKeys()` + `safePassthrough()` + `safeRecord()` |
| 28 | Insecure Direct Object Reference (IDOR) | ERADICATED | CRITICAL | 9 sites / 7 files | Ownership verification via task→POV team or userId match |
| 29 | Mass Assignment via Passthrough Spread | ERADICATED | CRITICAL | 6 sites / 6 files | Field exclusion list + allowlists + Zod .strict() + dead code deletion |
| 30 | Deep Nesting DoS (Stack Overflow) | ERADICATED | CRITICAL | 10 sites / 10 files | Depth guards + Zod schema validation + try/catch on JSON.stringify |
| 31 | Open Redirect | ERADICATED | CRITICAL | 4 sites / 4 files + 1 MEDIUM accepted | Backup deletion + path validation + relative URL enforcement + NotificationBell guard |
| 32 | Cryptographic Weaknesses | ERADICATED | CRITICAL | 7 sites / 5 files | Production startup guard + `crypto.randomUUID()` replacement |
| 33 | Error Recovery Resilience | ERADICATED | CRITICAL | 8 sites / 5 files | Retry loop + `$transaction` + try/catch guards + initPromise dedup |
| 34 | Memory Leak (Unmanaged Timers/Listeners) | ERADICATED | CRITICAL | 5 sites / 4 files | Stored refs + `.unref()` + listener removal in shutdown/disconnect |
| 35 | Information Disclosure | ERADICATED | CRITICAL | 25 sites / 20 files | `safeDetails` getter strips 5xx details + stack trace removal + securityViolation flag removal |
| 36 | Session Fixation & Token Lifecycle | ERADICATED | CRITICAL | 4 sites / 3 files | Refresh token rotation + role-change invalidation + `maxTokenAge` + fresh DB role |
| 37 | Deserialization & Injection | ERADICATED | CRITICAL | 5 sites / 3 files | Channel name validation (`/^[a-z_][a-z0-9_]*$/i`) + RegExp length guard + try/catch |
| 38 | File Upload & Storage Abuse | ERADICATED | HIGH | 4 sites / 4 files | Artifact size cap (5MB) + Content-Length validation + import size guard |
| 39 | Privilege Escalation Edge Cases | ERADICATED | HIGH | 5 sites / 4 files | API key scope + DB validation + email rejection + custom role SUPER_ADMIN gate |
| 40 | Cache Poisoning & Stale Data | ERADICATED | CRITICAL | 5 sites / 5 files | `Vary: Authorization` + `private` + `no-store` on token-authenticated downloads |
| 41 | Integer Overflow & Numeric Boundary | ERADICATED | HIGH | 10 sites / 10 files | `Math.min(limit, 200)` caps + `Math.max(1, page)` + MCP hub arg clamping |
| 42 | Log Injection & Log Forgery | ERADICATED | CRITICAL | 8 sites / 8 files | OAuth body redaction + snake_case pino paths + input truncation + adapter redact + sanitize |
| 43 | Business Logic Bypass | ERADICATED | HIGH | 1 site / 1 file | POV status transition validation via `StatusTransitionService` |
| 44 | Rate Limit Bypass & Resource Exhaustion | ERADICATED | CRITICAL | 4 sites / 4 files | Always rate limit (remove proxy header skip) + 3 missing rate limits added |
| 45 | Insecure Defaults & Missing Headers | ERADICATED | CRITICAL | 4 sites / 4 files | Random password generation, security headers, body size limit, dead CORS deprecated |
| 46 | Unsafe External Data Trust | ERADICATED | CRITICAL | 7 sites / 5 files | Attribution spoofing, XSS via HTML artifacts, OAuth response validation, LLM markdown sanitization |
| 47 | Concurrency Gaps & Double-Action | ERADICATED | HIGH | 5 sites / 4 files | Team member add race, task order race (API + MCP), hub metrics RMW — all wrapped in $transaction |
| 48 | Insecure Deserialization & Unsafe JSON.parse | ERADICATED | CRITICAL | 7 sites / 4 files | JWT role enum validation, KPI blocklist strengthened, workflow steps parse error |
| 49 | Incomplete Input Normalization & Encoding Bypass | ERADICATED | CRITICAL | 7 sites / 7 files | OAuth email .toLowerCase(), trial email normalization, admin schema email, enum/sortBy allowlists |
| 50 | Unsafe Error Recovery & Partial State | ERADICATED | CRITICAL | 9 sites / 9 files | Registration, recommendation, admin privilege change, phase template, batch team, launch, workflow — all $transaction |
| 51 | Unsafe Redirect, URL Construction & SSRF | ERADICATED | CRITICAL | 5 sites / 6 files | `validateUrlSafety()` on all fetch paths + healthCheckPath validation + LLM endpoint removal |
| 52 | Insecure Cookie Attributes & Session Management | ERADICATED | CRITICAL | 6 sites / 6 files | maxAge seconds fix + HttpOnly body removal + session limit + password invalidation + revoke cookie name |
| 53 | Unsafe File Operations, Path Traversal & Symlink Attacks | ERADICATED | CRITICAL | 7 sites / 6 files | StorageUrl HTTPS-only + OAUTH_LOG_DIR path allowlist + URL protocol enforcement |
| 54 | DNS Rebinding & Host Header Attacks | ERADICATED | HIGH | 4 sites / 5 files | MCP origin exact hostname match + CORS trusted APP_BASE_URL + rate limit IP spoofing fix |
| 55 | Unsafe Cryptographic Practices | ERADICATED | CRITICAL | 5 sites / 5 files | RS256 JWT signature verification via `jwtVerify()` + middleware claim validation + explicit `algorithms` option |
| 56 | Authorization Consistency & Middleware Bypass | ERADICATED | CRITICAL | 3 sites / 5 files | Circular dependency auth+scoping + /auth/me token removal + tokenExpiresAt pattern |
| 57 | Event Handler & State Leaks | ERADICATED | HIGH | 5 sites / 4 files | SSE safe-write wrapper + dashboard cache cleanup + error sanitization + SSE max-age fallback |
| 58 | HTTP Smuggling & Header Injection | ERADICATED | MEDIUM | 2 sites / 2 files | Content-Disposition sanitization + html→text/plain content type |
| 59 | Unsafe Type Coercion & Logic Errors | ERADICATED | MEDIUM | 38 sites / 12 files | `\|\|` → `??` for temperature/maxRetries/timeout + default temperature 0.7→0.3 |
| 60 | Unsafe Default Permissions & Missing Authorization | ERADICATED | HIGH | 4 sites / 4 files | `allowedRoles` middleware enforcement on MCP tools, admin API keys, admin settings |
| 61 | Unsafe String Interpolation & Template Injection | ERADICATED | HIGH | 4 sites / 4 files | HTML escaping in markdown reports + KPI `.call`/`.apply`/`.bind` blocklist + template array sanitization |
| 62 | Resource Exhaustion & Denial of Service | ERADICATED | HIGH | 7 sites / 7 files | Array `.max()` + `findMany({ take })` bounds + schema hardening + per-user WS limit |
| 63 | Inconsistent Error Handling & Uncaught Promises | ERADICATED | CRITICAL | 3 sites / 3 files | Fire-and-forget FAILED cleanup + silent swallowing flagged + error shape consistency |
| 64 | Incomplete Cleanup & Dangling References | ERADICATED | CRITICAL | 4 sites / 4 files | Event listener `.off()` in shutdown + SplitView unmount cleanup + SSE listener self-removal |
| 65 | Unsafe Concurrent Access & Data Races | ERADICATED | CRITICAL | 7 sites / 7 files | P2002 catch for workflow/role races + atomic upsert for team members + registry dedup |
| 66 | Insecure Direct Database Access (Query Injection) | ERADICATED | CRITICAL | 5 sites / 3 files | orderBy allowlist + pagination clamping + `as any` cast removal |
| 67 | Unsafe State Transitions & Cascade Safety | ERADICATED | CRITICAL | 2 sites / 2 files | Atomic CAS guard on streaming execution + cascade impact in DELETE response |
| 68 | Sensitive Data Exposure | ERADICATED | CRITICAL | 3 sites / 2 files | `verificationToken` removed from /auth/me + CRM credentials masked (GET + POST) |
| 69 | Host Header Trust in Auth Middleware | ERADICATED | MEDIUM | 3 sites / 1 file | `req.nextUrl.origin` → `TRUSTED_ORIGIN` from `APP_BASE_URL` |
| 70 | SSRF Bypass Name Mismatch for Seeded Services | ERADICATED | HIGH | 6 sites / 6 files | `isTrustedInternalService()` checks both `name` and `id` + eliminated duplicate list |

### Priority for Next Eradication

All CRITICAL and HIGH bug classes eradicated (71 registered, 70 eradicated, 1 resolved, 2 monitored, 2 false alarms). Remaining work:
1. **Quarterly regression sweep** — run detection commands from all 60+ bug classes
2. **Quarterly security audit refresh** — run endpoint-security-audit-protocol against latest codebase
3. **MEDIUM/LOW findings** — BC32-68 combined ~135 MEDIUM/LOW — track for future sessions

### Session 9 Detection Re-Audit (March 4, 2026)

Ran detection commands across all 70 bug classes. Found and fixed **23 new sites** across **9 bug classes**:

| Severity | BC | New Sites | Summary |
|----------|------|-----------|---------|
| CRITICAL | BC68 | +1 | CRM POST response credential masking |
| HIGH | BC14 | +1 | CJS prisma retry backoff parity |
| HIGH | BC23 | +3 | LLM proxy/stream/base-provider AbortSignal.timeout |
| MEDIUM | BC40 | +1 | Artifact download missing Vary: Authorization |
| MEDIUM | BC24 | +7 | Unbounded analytics findMany queries |
| LOW | BC34 | +1 | MCP HTTP server timer .unref() |
| LOW | BC55 | +3 | jwtVerify missing algorithms option |
| LOW | BC37 | +1 | TS shared-connection-pool channel validation (CJS parity) |
| LOW | BC53 | +5 | URL validation protocol enforcement |

**Total**: 23 new sites found and fixed, 0 regressions introduced.

---

## Regression Detection

Run these commands quarterly to verify no new unguarded sites have appeared:

```bash
# Bug Class 1: New callTool sites without ensureObject
grep -rn '\.callTool(' --include='*.{js,ts}' | grep -v node_modules | grep -v ensureObject | grep -v '.d.ts'

# Bug Class 2: New unsafe casts on Json columns (TS + JS patterns)
grep -rn 'as Record<string' --include='*.ts' lib/ app/ | grep -v ensureObject
grep -rn '\.\(metadata\|steps\|variables\|configuration\) || [{\[]' --include='*.js' lib/ | grep -v node_modules | grep -v ensureObject | grep -v 'Array\.isArray'

# Bug Class 3: New number fields without parsing
grep -rn 'body\.\w*[Cc]ount\|body\.\w*[Aa]mount\|body\.\w*[Pp]rice' --include='*.ts' app/api/ | grep -v 'parseInt\|parseFloat\|Number(\|coerce'

# Bug Class 8: New Docker services without req.body pass-through
grep -rn 'handlePostMessage' services/*/src/index.ts | grep -v 'req\.body'

# Bug Class 9: New endpoint URL exposures without sanitizeEndpointUrl
grep -rn 'configuration\?\.endpoint' --include='*.{js,ts}' lib/mcp/server/ app/api/ | grep -v node_modules | grep -v sanitizeEndpointUrl | grep -v 'startsWith\|===\|!='

# Bug Class 10: Fire-and-forget errors still at error level
grep -rn "log\.error.*Failed to log\|log\.error.*Failed to track\|log\.error.*Failed to persist" --include='*.js' lib/mcp/server/tools/hub/

# Bug Class 11: setInterval calling async without .catch()
grep -rn 'setInterval' --include='*.js' --include='*.ts' lib/ | grep -v node_modules | grep -v '.d.ts' | grep -v '.next/'
# Then verify: does the callback call an async function? If yes, must have .catch()

# Bug Class 12: Dual-path execution without atomic claiming
grep -rn 'executeById\|processPendingExecutions' --include='*.ts' lib/services/agentExecutionEngine.ts
# Verify: executeAgent() starts with updateMany atomic claim (count === 0 → return)

# Bug Class 13: Unconditional SUCCESS without content validation
grep -rn "result: 'Success'" --include='*.ts' lib/services/agentExecutionEngine.ts app/api/pov/agent/execute/
# Verify: each SUCCESS path has a preceding content length check

# Bug Class 14: Retry loops with constant delay (no exponential backoff)
grep -rn 'setTimeout.*resolve.*delay\|setTimeout.*resolve.*retry' --include='*.ts' --include='*.js' lib/ | grep -v node_modules | grep -v '.d.ts'
# For each hit: verify delay uses Math.pow or similar exponential scaling

# Bug Class 15: new RegExp() on user-controlled patterns without safeRegex
grep -rn 'new RegExp(' --include='*.ts' --include='*.js' lib/ app/api/ | grep -v node_modules | grep -v '.d.ts' | grep -v safeRegex | grep -v '`{{' | grep -v 'INJECTION_PATTERNS'
# Expected: 0 results (all dynamic patterns should use safeRegex)

# Bug Class 16: Secret/hash/signature comparison using === instead of timingSafeEqual
grep -rn '=== .*[Hh]ash\|=== .*[Ss]ignature\|=== expected\|[Hh]ash ===\|[Ss]ignature ===' --include='*.ts' --include='*.js' lib/ app/api/ | grep -v node_modules | grep -v '.d.ts' | grep -v prisma/generated | grep -v timingSafeEqual
# Expected: 0 results (all secret comparisons should use timingSafeEqual)

# Bug Class 17: new Function() or eval() on user-controlled strings
grep -rn 'new Function\s*(\|[^a-zA-Z]eval\s*(' --include='*.ts' --include='*.js' lib/ app/api/ | grep -v node_modules | grep -v '.d.ts' | grep -v prisma/generated | grep -v 'dangerousPatterns'
# Expected: 1 result (kpi.ts — has DANGEROUS_PATTERNS validation). Any new hit = code injection risk

# Bug Class 21: parseInt/Number without NaN/Infinity guard
grep -rn "parseInt(process.env" --include='*.ts' --include='*.js' lib/ middleware/ app/api/ | grep -v '|| ' | grep -v node_modules
grep -rn '!isNaN(Number(' --include='*.ts' --include='*.js' lib/ app/api/ | grep -v isFinite | grep -v node_modules
# Expected: 0 results — all parseInt(env) should have || default, all Number() should have isFinite()

# Bug Class 23: fetch() without body consumption or AbortSignal.timeout
grep -rn 'await fetch(' --include='*.ts' --include='*.js' lib/ app/api/ mcp-server-http-clean.js | grep -v node_modules | grep -v '.d.ts' | grep -v 'AbortSignal'
# For each hit: verify body is consumed in ALL code paths and external URLs have timeout

# Bug Class 24: Race conditions, DoS vectors, resource safety
grep -rn "channels = \[" --include='*.ts' --include='*.js' lib/events/ | grep -v node_modules
# Verify: channel names match PostgreSQL trigger NOTIFY channels
grep -rn 'writer\.close' --include='*.ts' app/api/ | grep -v node_modules
# Verify: each file has only one close path (flag or early return)
grep -rn 'findMany({' --include='*.ts' app/api/analytics/ | grep -v 'take:'
# Expected: 0 results — all analytics findMany should have take cap
grep -rn 'new RegExp.*\${' --include='*.ts' lib/ | grep -v safeRegex | grep -v INJECTION_PATTERNS
# Expected: 0 results — use replaceAll or safeRegex instead

# Bug Class 25: Packages with class hierarchies not externalized from webpack SSR
grep 'serverComponentsExternalPackages' next.config.js
# If a new package causes "Must call super constructor" in production, add it to this array

# Bug Class 26: Dashboard/analytics endpoints without role-based scoping
grep -rn 'findMany({$' --include='*.ts' app/api/dashboard/ app/api/analytics/
# For each hit: verify where clause includes role-based POV filtering

# Bug Class 28: IDOR — mutation endpoints updating by ID without ownership check
find app/api/mcp -name 'route.ts' -path '*/\[id\]/*' | xargs grep -l 'context.params' | xargs grep -L 'povAccess\|userId.*user\|assigneeId'
# Expected: 0 results (all [id] routes should verify ownership before mutations)

# Bug Class 29: Mass assignment — ...body or ...data spreads into Prisma without allowlist
grep -rn '\.\.\.\(body\|updates\|payload\)' --include='*.ts' app/api/ lib/ | grep -v node_modules | grep -v '.d.ts' | grep -v test | grep -v 'cleanPovData\|config:\|input:'
# Each hit: verify explicit field allowlisting or Zod .strict() schema

# Bug Class 30: Deep nesting DoS — recursive functions without depth guards (TS AND JS)
grep -rn 'function.*Record<string, unknown>\|function.*args.*{' --include='*.ts' --include='*.js' lib/ | xargs grep -l 'checkArguments\|recursive\|walkObject\|deepStrip' 2>/dev/null | xargs grep -L '_depth\|maxDepth' 2>/dev/null
# Expected: 0 results — all recursive object walkers should have depth limits

# Bug Class 31: Open redirect — window.location.href from variables
grep -rn 'window\.location\.href\s*=' --include='*.tsx' --include='*.ts' app/ components/ | grep -v "'/\|\"/" | grep -v node_modules
# Each hit should use validated/allowlisted URLs only

# Bug Class 27 (CJS): ensure-object.js must have stripDangerousKeys
grep -c 'stripDangerousKeys' lib/utils/ensure-object.js
# Expected: 4+ (if 0, CJS version has regressed — prototype pollution via MCP Hub handlers)

# Bug Class 27 (extended): dynamic property access from user-controlled paths
grep -rn 'current\[part\]\|obj\[key\]\|obj\[segment\]\|obj\[prop\]' --include='*.js' --include='*.ts' lib/ | grep -v node_modules | grep -v 'DANGEROUS_PARTS\|stripDangerousKeys'
# Each hit: verify property name is NOT user-controlled, or has a blocklist guard

# Bug Class 69: req.nextUrl.origin trust in auth paths
grep -rn 'req\.nextUrl\.origin\|request\.nextUrl\.origin' --include='*.ts' lib/auth/ app/api/auth/ | grep -v node_modules
# Expected: 0 results — all should use TRUSTED_ORIGIN / APP_BASE_URL
```

---

## BC27: Prototype Pollution via Passthrough Validation

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 38 (14 `.passthrough()` + 24 `z.record(z.any())` across 12 validation files)
**Discovered**: February 27, 2026
**Fixed**: February 27, 2026 (commit `491e4f04`)

### Root Cause

Zod's `.passthrough()` and `z.record(z.any())` accept arbitrary keys including `__proto__`, `constructor`, and `prototype`. When these objects are later spread (`...metadata`) or used with `Object.assign()`, they can pollute Object prototypes, potentially leading to denial of service or security bypasses.

### Affected Files (15)

| File | Sites | Risk |
|------|-------|------|
| `lib/validation/mcp-action-validation.ts` | 10 | CRITICAL — MCP client input |
| `lib/validation/agent-template-validation.ts` | 10 | HIGH — template metadata |
| `lib/validation/pov.ts` | 6 | HIGH — POV metadata/inputContext |
| `lib/validation/task-validation.ts` | 6 | HIGH — task metadata |
| `lib/validation/settings-validation.ts` | 4 | MEDIUM — settings passthrough |
| `lib/validation/mcp-hub-validation.ts` | 4 | MEDIUM — hub tool arguments |
| `lib/validation/mcp-tools-validation.ts` | 2 | MEDIUM — tool parameters |
| `lib/validation/phase-template-validation.ts` | 2 | MEDIUM — template metadata |
| `lib/validation/prompt-library-validation.ts` | 2 | MEDIUM — prompt examples |
| `lib/validation/input-validation-framework.ts` | ~~1~~ 0 | ~~HIGH — SAFE_JSON~~ **DELETED 2026-05-23 as dead code (zero consumers); hazard closed** |
| `lib/validation/notification-validation.ts` | 1 | MEDIUM — notification metadata |
| `lib/validation/mcp-resources-validation.ts` | 1 | LOW — resource metadata |
| `lib/validation/zod-helpers.ts` | 1 | HIGH — objectOrJsonString |
| `lib/utils/ensure-object.ts` | 1 | MEDIUM — defense-in-depth |
| `lib/utils/sanitize-keys.ts` | 0 | N/A — defense utility |

### Defense

**Utility**: `lib/utils/sanitize-keys.ts`
- `stripDangerousKeys(obj)` — shallow strip of `__proto__`, `constructor`, `prototype`
- `deepStripDangerousKeys(obj)` — recursive strip for nested objects

**Zod helpers**: `lib/validation/zod-helpers.ts`
- `safePassthrough()` — drop-in replacement for `z.object({}).passthrough()`
- `safeRecord()` — drop-in replacement for `z.record(z.any())`
- `deepSafePassthrough()` — recursive version for deeply nested input

**Pattern**: Chain `.transform(stripDangerousKeys)` after every `.passthrough()` and `z.record(z.any())`.

### Post-Eradication Fix: CJS `ensure-object.js` Divergence (Mar 2026)

**Problem**: When BC27 was eradicated, `stripDangerousKeys()` was added to the TypeScript `ensure-object.ts` (lines 25, 30) but NOT to the CommonJS `ensure-object.js`. The CJS version is used by all 8+ MCP Hub handlers (`service-call-handler.js`, `workflow-tools-handler.js`, `service-registration-handler.js`, etc.), meaning transport-boundary-parsed objects passed through without prototype pollution protection.

**Fix**: Inlined `stripDangerousKeys()` directly in `ensure-object.js` (no CJS version of `sanitize-keys.ts` existed). Both return paths now strip `__proto__`, `constructor`, `prototype` — matching the TS version exactly.

**Lesson**: When hardening a utility that has both TS and CJS versions, always fix BOTH. The CJS version exists because MCP server modules can't import ESM/TS directly.

### Post-Eradication Fix: `navigatePath` Property Traversal (Mar 2026)

**Problem**: BC27 focused on **Zod validation boundaries** (`.passthrough()`, `z.record(z.any())`) and **object spread/assign**. But `navigatePath()` in `orchestration-engine.js` performs dynamic property access via `obj[part]` where `part` comes from user-controlled variable chaining syntax (`{{step.0.output.__proto__}}`). This is a different attack vector for the same root cause — user input reaching `__proto__`/`prototype`/`constructor`.

**Fix**: Added `DANGEROUS_PARTS` set to `navigatePath()` in `orchestration-engine.js`. Returns `undefined` for `__proto__`, `prototype`, `constructor`, `__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, `__lookupSetter__`. Commit `90ade7fc`.

**Lesson**: Prototype pollution isn't just about object spread — any dynamic property access (`obj[userInput]`) is a potential vector. Detection should include property traversal patterns.

### Detection Command

```bash
# Find unprotected .passthrough() sites
grep -rn '\.passthrough()' lib/validation/ --include='*.ts' | grep -v 'stripDangerousKeys' | grep -v 'safePassthrough'
# Find unprotected z.record(z.any()) sites
grep -rn 'z\.record(z\.any())' lib/validation/ --include='*.ts' | grep -v 'stripDangerousKeys' | grep -v 'safeRecord'
# Both should return zero results

# Verify CJS ensure-object.js has stripDangerousKeys (added Mar 2026)
grep -c 'stripDangerousKeys' lib/utils/ensure-object.js
# Expected: 4+ (definition + 2 call sites + export)

# Find dynamic property access from user-controlled paths (BC27 extended — Mar 2026)
grep -rn 'current\[part\]\|obj\[key\]\|obj\[segment\]\|obj\[prop\]' --include='*.js' --include='*.ts' lib/ | grep -v node_modules | grep -v 'DANGEROUS_PARTS\|stripDangerousKeys'
# Each hit: verify the property name is NOT user-controlled, or has a blocklist guard
```

---

## BC28: Insecure Direct Object Reference (IDOR)

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 9 sites / 7 files (4 CRITICAL, 1 HIGH, 4 MEDIUM — 1 intentional design choice excluded)
**Discovered**: February 27, 2026
**Fixed**: February 27, 2026 (commit `89bd8e4d`)

### Root Cause

API endpoints accept resource IDs from user input and perform mutations (pause, resume, configure, implement, feedback) or cross-scope reads (KPI by ID) without verifying that the authenticated user owns or has access to the referenced resource. An attacker who knows or guesses valid IDs can manipulate other users' resources.

### Affected Files (7)

| File | Sites | Risk | Fix |
|------|-------|------|-----|
| `app/api/mcp/automations/[id]/pause/route.ts` | 1 | CRITICAL | Ownership via task→POV team or userId match |
| `app/api/mcp/automations/[id]/resume/route.ts` | 1 | CRITICAL | Same pattern as pause |
| `app/api/mcp/automations/[id]/configure/route.ts` | 2 | CRITICAL | Ownership check on both GET and POST |
| `app/api/mcp/recommendations/[id]/implement/route.ts` | 1 | CRITICAL | Recommendation→POV team membership |
| `app/api/mcp/recommendations/[id]/feedback/route.ts` | 1 | HIGH | Same pattern as implement |
| `app/api/pov/[povId]/kpi/route.ts` | 3 | MEDIUM | KPI→POV scope check on GET/PUT/DELETE |

### Intentionally Excluded

| File | Reason |
|------|--------|
| `app/api/phase-templates/[id]/route.ts` | Phase templates intentionally available to all authenticated users (design decision) |

### Defense Pattern

**Two ownership models depending on resource type:**

1. **AgentExecution** → `task.assigneeId === user.userId` OR POV team membership check:
```typescript
const agentExecution = await prisma.agentExecution.findUnique({
  where: { id },
  select: { id: true, task: { select: { povId: true, assigneeId: true } } }
});
if (task.assigneeId !== user.userId && task.povId) {
  const povAccess = await prisma.pOV.findFirst({
    where: { id: task.povId, team: { members: { some: { userId: user.userId } } } },
    select: { id: true }
  });
  if (!povAccess) return { error: { message: 'Access denied', code: 'FORBIDDEN' } };
}
```

2. **MCPWorkflowExecution / MCPRecommendation** → direct `userId` match or POV team membership:
```typescript
if (workflowExecution.userId !== user.userId && user.role !== 'ADMIN') {
  return { error: { message: 'Access denied', code: 'FORBIDDEN' } };
}
```

3. **Cross-POV scope** → verify resource belongs to the POV in the URL:
```typescript
if (kpi.povId !== povId) {
  return NextResponse.json({ error: 'KPI not found' }, { status: 404 })
}
```

### Detection Command

```bash
# Find mutation endpoints that update by ID without ownership check
grep -rn 'prisma\.\w\+\.update({' --include='*.ts' app/api/mcp/ | grep "where: { id" | grep -v 'findFirst\|findUnique'
# For each hit: verify a findUnique + ownership check precedes the update

# Find routes accepting [id] params without ownership verification
find app/api/mcp -name 'route.ts' -path '*/\[id\]/*' | xargs grep -l 'context.params' | xargs grep -L 'povAccess\|userId.*user\|assigneeId'
# Expected: 0 results (all [id] routes should verify ownership)
```

### Commits

| Commit | Description |
|--------|------------|
| `89bd8e4d` | Eradication — ownership verification on automations, recommendations, KPIs |

---

## BC29: Mass Assignment via Passthrough Spread

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 6 total (1 CRITICAL, 3 HIGH, 2 MEDIUM — all fixed)
**Discovered**: February 28, 2026
**Fixed**: February 28, 2026

### Root Cause

User-controlled request body fields are spread directly into Prisma create/update operations via `.passthrough()` Zod schemas or raw `...body` spreads without field allowlisting. Attackers can inject fields like `ownerId`, `povId`, `status`, `role`, etc.

### All Fixes

| File | Severity | Fix |
|------|----------|-----|
| `lib/pov/handlers/put.ts` | CRITICAL | Added `ownerId`, `owner`, `teamId`, `createdAt`, `updatedAt` to `nonScalarOrHandledFields` exclusion list |
| `lib/mcp/tasks/action/handlers/task/task-update-handler.ts` | HIGH | Replaced `...updates` spread with explicit field allowlist (`title`, `description`, `priority`, `status`, `dueDate`, `assigneeId`, `agentTemplateId`) |
| `app/api/tasks/[taskId]/route.ts` | HIGH | Changed raw `body` to Zod-validated `validated` in service calls |
| `lib/api/pov-handler.ts` | HIGH | Deleted dead code (unreferenced file with `...data` spread) |
| `app/api/mcp/automations/[id]/configure/route.ts` | MEDIUM-HIGH | Added `AutomationConfigUpdateSchema` Zod validation with `.strict()` |
| `lib/settings/services/settings.ts` | MEDIUM | API-layer protected; service-layer accepts arbitrary data (accepted risk — internal only) |

### Detection Command

```bash
# Find ...body or ...data spreads into Prisma operations
grep -rn '\.\.\.\(body\|data\|updates\|payload\)' --include='*.ts' app/api/ lib/ | grep -v node_modules | grep -v '.d.ts' | grep -v test
# For each hit: verify explicit field allowlisting or Zod .strict() schema
```

---

## BC30: Deep Nesting DoS (Stack Overflow)

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 32 fixed (12 original + 14 TS JSON.stringify + 4 app/JS JSON.stringify + DFS depth guard + breadth guard — all March 4, 2026)
**Discovered**: February 28, 2026
**Fixed**: February 28, 2026 (CJS parity: March 4; TS completion: March 4; .refine() audit: March 4)

### Root Cause

Deeply nested JSON payloads (e.g., `{"a":{"a":{"a":...}}}` repeated 5,000+ times) can exhaust the Node.js call stack during recursive processing (Zod traversal, `JSON.stringify` in size checks, recursive utility functions). Size limits (50KB) do not prevent deep nesting — deeply nested empty objects are extremely compact.

### All Fixes

| File | Severity | Fix |
|------|----------|-----|
| `lib/utils/sanitize-keys.ts` | CRITICAL | `deepStripDangerousKeys()` — added `_depth` parameter, returns early at depth > 20 |
| `lib/services/workflow/types/orchestration-params.ts` | CRITICAL | `checkArgumentsForInjection()` — added `_depth` parameter, returns true at depth > 20 |
| `app/api/llm/proxy/route.ts` | CRITICAL | Added `LLMProxySchema` with Zod validation + 100KB size limit on payload |
| `app/api/llm/proxy/stream/route.ts` | CRITICAL | Added `LLMProxyStreamSchema` with same validation |
| `lib/validation/zod-helpers.ts` | CRITICAL | Wrapped `deepStripDangerousKeys` in lambda for Zod `.transform()` compatibility |
| `app/api/mcp/automations/[id]/configure/route.ts` | HIGH | Added `AutomationConfigUpdateSchema` Zod validation with `.strict()` |
| `app/api/mcp/tasks/recommendations/route.ts` | HIGH | Added `CreateRecommendationSchema` with 50KB size limits on `actions`, `parameters`, `context` |
| `app/api/pov/[povId]/kpi/route.ts` | HIGH | Replaced TypeScript `as` casts with `KPICreateSchema`, `KPIUpdateSchema`, `KPITemplateCreateSchema`, `KPITemplateUpdateSchema` Zod validation |
| `lib/validation/mcp-hub-validation.ts` | HIGH | Wrapped `JSON.stringify` in try/catch to catch stack overflow on deep input |
| `lib/services/workflow/types/orchestration-params.js` | MEDIUM | CJS mirror parity — added `_depth` parameter + `MAX_INJECTION_CHECK_DEPTH=20` (was unbounded) |
| `lib/validation/mcp-hub-validation.js` | HIGH | CJS parity — added try/catch around both `JSON.stringify(args)` calls in `services(action: "call")` schema |
| `lib/validation/mcp-action-validation.ts` | HIGH | 3 sites: params size, injection check, metadata size — wrapped in try/catch |
| `lib/validation/input-validation-framework.ts` | HIGH | ~~2 sites~~ 1 site (`performSecurityChecks`) — SAFE_JSON deleted 2026-05-23 as dead code |
| `lib/validation/mcp-automations-validation.ts` | MEDIUM | 3 sites: actions, parameters, context size checks — wrapped in try/catch |
| `lib/validation/task-validation.ts` | MEDIUM | 1 site: payload size check — wrapped in try/catch |
| `lib/validation/agent-template-validation.ts` | MEDIUM | 1 site: config size check — wrapped in try/catch |
| `lib/validation/notification-validation.ts` | LOW | 1 site: metadata size check — wrapped in try/catch |
| `lib/validation/activity-validation.ts` | LOW | 1 site: `truncateForActivity` — wrapped in try/catch |
| `lib/validation/prompt-library-validation.ts` | LOW | 2 sites: examples + variables size checks — wrapped in try/catch |
| `app/api/agent-templates/builder/route.ts` | HIGH | testInput size check — wrapped in try/catch |
| `app/api/llm/proxy/route.ts` | HIGH | payload size check — wrapped in try/catch |
| `app/api/llm/proxy/stream/route.ts` | HIGH | payload size check — wrapped in try/catch |
| `lib/services/workflow/types/orchestration-params.js` | HIGH | arguments size check — wrapped in try/catch |
| `lib/services/workflow/types/orchestration-params.ts` | HIGH | arguments size check — wrapped in try/catch (CJS parity) |
| `lib/services/workflow/types/orchestration-params.ts` | MEDIUM | breadth guard (MAX_INJECTION_CHECK_KEYS=200) on checkArgumentsForInjection |
| `lib/services/workflow/types/orchestration-params.js` | MEDIUM | breadth guard (MAX_INJECTION_CHECK_KEYS=200) — CJS parity |
| `lib/validation/phase-template-validation.ts` | MEDIUM | DFS depth guard (MAX_DFS_DEPTH=100) on hasCycle() recursive function |

### Post-Eradication Fix: CJS `orchestration-params.js` Divergence (Mar 2026)

**Problem**: When BC30 was eradicated, `_depth` guard was added to the TypeScript `orchestration-params.ts` but NOT to the CommonJS `orchestration-params.js` mirror. The JS version is used by the MCP server's `orchestration-engine.js` for workflow argument validation, meaning deeply nested workflow arguments from MCP clients could still cause stack overflow.

**Fix**: Added `MAX_INJECTION_CHECK_DEPTH = 20` constant and `_depth` parameter to JS `checkArgumentsForInjection()`, matching the TS version. Commit `90ade7fc`.

**Lesson**: Same as BC27 CJS divergence — when hardening recursive functions that have both TS and JS versions, always fix BOTH. This is the second time this pattern has caused a gap.

### Detection Command

```bash
# Find recursive functions without depth guards (TS AND JS)
grep -rn 'function.*Record<string, unknown>\|function.*args.*{' --include='*.ts' --include='*.js' lib/ | xargs grep -l 'checkArguments\|recursive\|walkObject\|deepStrip' 2>/dev/null | xargs grep -L '_depth\|maxDepth' 2>/dev/null
# Expected: 0 results — all recursive object walkers should have depth limits

# Find req.json() without Zod validation
grep -rn 'await req\.json()' --include='*.ts' app/api/ | xargs grep -L 'safeParse\|Schema'
# Each hit should have Zod schema validation
```

---

## BC31: Open Redirect

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 3 total (1 CRITICAL dormant, 1 CRITICAL proactive, 1 HIGH — all fixed) + 1 MEDIUM remaining (accepted risk)
**Discovered**: February 28, 2026
**Fixed**: February 28, 2026

### Root Cause

User-controlled URL parameters (`?redirect=`, `actionUrl`, `?provider=`) used in `window.location.href` or `NextResponse.redirect()` without same-origin validation, enabling phishing attacks.

### All Fixes

| File | Severity | Fix |
|------|----------|-----|
| `app/(auth)/login/page.tsx.backup` | CRITICAL (dormant) | Deleted — eliminated future reintroduction risk |
| `lib/auth/middleware.ts` | CRITICAL (proactive) | Added `startsWith('/') && !startsWith('//')` validation on `?redirect=` param |
| `lib/validation/notification-validation.ts` | HIGH | `actionUrl` changed from `.url()` (any URL) to relative-path-only validation (`startsWith('/') && !startsWith('//')`) |
| `components/layout/NotificationBell.tsx` | HIGH | Added same-origin guard before `window.location.href` assignment (defense-in-depth for existing DB records) |

### Remaining MEDIUM Finding (accepted risk)

| File | Severity | Issue |
|------|----------|-------|
| `app/auth/oauth/error/page.tsx` | MEDIUM | `?provider=` param injected into navigation URL without allowlist — low risk (error page, no sensitive redirect) |

### Detection Command

```bash
# Find window.location.href assignments from variables (not hardcoded paths)
grep -rn 'window\.location\.href\s*=' --include='*.tsx' --include='*.ts' app/ components/ | grep -v "'/\|\"/" | grep -v node_modules
# Each hit should use validated/allowlisted URLs only

# Find redirect params consumed from query strings
grep -rn "searchParams.*redirect\|searchParams.*returnTo\|searchParams.*next\|searchParams.*callbackUrl" --include='*.tsx' --include='*.ts' app/ | grep -v node_modules
# Each hit should validate against same-origin allowlist
```

---

## BC32: Cryptographic Weaknesses

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 13 total (2 CRITICAL, 5 HIGH fixed, 3 MEDIUM, 3 LOW remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

Weak cryptographic defaults, insecure random number generation, and missing startup validation for security-critical secrets.

### CRITICAL Fixes

| File | Fix |
|------|-----|
| `lib/config.ts` | JWT secrets now require env vars in production — empty string fallback + startup throw if missing |

### Already Mitigated (Downgraded from CRITICAL)

| File | Issue | Status |
|------|-------|--------|
| `artifacts/[id]/public-download/route.ts` | Hardcoded dev signing key | Already throws in production (lines 15-18) — no fix needed |

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `lib/services/taskSubscriptionService.ts` | `Math.random()` → `crypto.randomUUID().slice(0, 8)` for subscription IDs |
| 2 | `lib/services/taskBulkService.ts` (3 sites) | `Math.random()` → `crypto.randomUUID().slice(0, 8)` for operation IDs |
| 3 | `lib/services/mcp/contextManager.ts` | `Math.random()` → `crypto.randomUUID().slice(0, 8)` for context IDs |

### Detection Command

```bash
# Find Math.random() used for IDs/tokens/secrets
grep -rn 'Math\.random()' --include='*.ts' --include='*.js' lib/ app/ | grep -v node_modules | grep -v '.d.ts' | grep -v test
# Each hit: verify it's not used for security-critical purposes
```

---

## BC33: Error Recovery Resilience

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 16 total (2 CRITICAL, 6 HIGH fixed, 7 MEDIUM, 1 LOW remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

Services that fail to recover gracefully after errors, leaving records in stuck intermediate states (RUNNING, IN_PROGRESS) or losing audit trail data when post-transaction logging fails.

### CRITICAL Fixes

| File | Fix |
|------|-----|
| `app/api/admin/crm/sync/route.ts` | Fire-and-forget `.catch()` now retries status update 3 times to prevent permanently stuck RUNNING jobs |
| `app/api/admin/crm/sync/route.ts` | `triggerCRMSync()` completion mark wrapped in `$transaction` for atomic read-then-update |

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `lib/services/taskBulkService.ts` (2 sites) | Activity logging wrapped in try/catch — must not throw after successful transaction |
| 2 | `app/api/pov/launch/route.ts` | POV status + launch creation wrapped in `$transaction` — atomic or nothing |
| 3 | `app/api/pov/launch/route.ts` | Checklist update wrapped in `$transaction` with existence check |
| 4 | `lib/services/workflow/workflowEngine.ts` | `activeWorkflows.delete(workflowId)` added before validation failure early return |
| 5 | `lib/events/shared-connection-pool.js` | `initPromise` dedup prevents concurrent initialization race |

### Detection Command

```bash
# Find status updates before the operation they guard
grep -rn "status.*RUNNING\|status.*IN_PROGRESS\|status.*PROCESSING" --include='*.ts' app/api/ lib/ | grep -v node_modules
# Verify each has rollback on failure or is inside a transaction
```

---

## BC34: Memory Leak (Unmanaged Timers/Listeners)

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 6 total (2 CRITICAL, 2 HIGH fixed, 1 LOW fixed, 1 MEDIUM remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

`setInterval()` calls without stored references or `.unref()` — prevents graceful shutdown and keeps Node.js process alive. Event listeners added to singleton pools without removal in shutdown handlers — accumulates listeners over time.

### CRITICAL Fixes

| File | Fix |
|------|-----|
| `mcp-server-v5.js:788` | Resource discovery interval: stored ref + `.unref()` + `clearInterval()` in `shutdown()` |
| `mcp-server-v5.js:805` | Resource cleanup interval: stored ref + `.unref()` + `clearInterval()` in `shutdown()` |

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `lib/events/execution-events.js` | Stored `_connectedHandler` + `_errorHandler` refs, removed from shared pool in `shutdown()` |
| 2 | `lib/events/prompt-registry-events.ts` | Stored `_connectedHandler` + `_errorHandler` refs, removed from shared pool in `disconnect()` |

### LOW Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `mcp-server-http-clean.js:254` | `sessionCleanupInterval` missing `.unref()` + `setTimeout` in cleanup missing `.unref()` — prevents graceful shutdown |

#### Session 9 Detection Re-Audit Extension (Mar 4, 2026)

LOW fix #1 found during detection command re-audit. The `sessionCleanupInterval` in `mcp-server-http-clean.js` was missing `.unref()`, keeping the Node.js process alive even when the server should shut down. The `setTimeout` used inside the cleanup callback was also missing `.unref()`.

### Detection Command

```bash
# Find setInterval without .unref()
grep -rn 'setInterval' --include='*.ts' --include='*.js' lib/ mcp-server*.js | grep -v node_modules | grep -v '.d.ts' | grep -v test
# Each hit: verify it has .unref() AND stored reference for cleanup

# Find .on() without corresponding .off()/.removeListener()
grep -rn '\.on(' --include='*.js' lib/events/ | grep -v node_modules
# Cross-reference with shutdown() methods for listener removal
```

---

## BC35: Information Disclosure

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 25+ total (1 CRITICAL, 2 HIGH fixed, 4 MEDIUM, 2 LOW remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

Internal error details (stack traces, error.details, security flags, validation field paths) returned to API clients without environment gating, enabling attackers to map application architecture.

### CRITICAL Fixes

| File | Fix |
|------|-----|
| `lib/services/workflow/workflowEngine.ts:323` | Removed `error.stack` from workflow error response `details` object |

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `lib/errors.ts` + 18 API routes (24 sites) | Added `safeDetails` getter on `ApiError` — returns details only for 4xx, strips for 5xx |
| 2 | `app/api/mcp/tasks/action/route.ts:110` | Removed `securityViolation` boolean flag + validation error details from response |

### Detection Command

```bash
# Find error.details returned to clients
grep -rn 'error\.details' --include='*.ts' app/api/ | grep -v 'safeDetails'
# Find stack traces in responses
grep -rn 'error\.stack\|\.stack' --include='*.ts' --include='*.js' app/api/ lib/ | grep -v node_modules | grep -v '.d.ts'
```

---

## BC36: Session Fixation & Token Lifecycle

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 11 total (2 CRITICAL, 2 HIGH fixed, 4 MEDIUM, 3 LOW remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

Refresh tokens reused indefinitely without rotation (replay attack vector). Role/status changes don't invalidate existing tokens (privilege escalation persistence). Token claims use stale JWT data instead of fresh DB state.

### CRITICAL Fixes

| File | Fix |
|------|-----|
| `app/api/auth/refresh/route.ts` | Refresh token rotation: delete old + create new in `$transaction` on every use. Token claims now use fresh role from DB. |
| `lib/admin/services/user.ts` | `deleteMany` on refresh tokens when role or status changes — forces re-login with updated privileges |

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `lib/auth/token-manager.ts:261` | Added `maxTokenAge` to RS256 refresh token verification |
| 2 | `lib/auth/token-manager.ts:268` | Added `maxTokenAge` to HS256 refresh token verification (was missing all validation options) |

### Detection Command

```bash
# Find token verification without maxTokenAge
grep -rn 'jwtVerify' --include='*.ts' lib/auth/ | grep -v maxTokenAge
# Find role changes without token invalidation
grep -rn 'role:.*data\.' --include='*.ts' lib/admin/ | grep -v refreshToken
```

---

## BC37: Deserialization & Injection

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 5 total (1 CRITICAL, 1 HIGH fixed, 1 LOW fixed, 2 MEDIUM remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

Unsanitized string interpolation in PostgreSQL NOTIFY/LISTEN/UNLISTEN commands. RegExp construction from field validation patterns without length limit or error handling.

### CRITICAL Fixes

| File | Fix |
|------|-----|
| `lib/events/shared-connection-pool.js` (3 sites) | Channel name validated against `/^[a-z_][a-z0-9_]*$/i` before NOTIFY, LISTEN, UNLISTEN |

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `components/poveditor/pov/sections/DynamicFieldsWizardSection.tsx:97` | RegExp wrapped in try/catch with 500-char length limit (client-side, can't use server `safeRegex()`) |

### LOW Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `lib/events/shared-connection-pool.ts` | LISTEN/UNLISTEN channel name interpolation without validation — added `SAFE_CHANNEL = /^[a-z_][a-z0-9_]{0,62}$/` regex (CJS parity — CJS `.js` version already had it) |

#### Session 9 Detection Re-Audit Extension (Mar 4, 2026)

LOW fix #1 found during detection command re-audit. The TypeScript version of `shared-connection-pool.ts` had unvalidated channel name interpolation in LISTEN/UNLISTEN commands, while the CJS version (`.js`) had already been hardened with a `SAFE_CHANNEL` regex. Fixed by adding the same `SAFE_CHANNEL = /^[a-z_][a-z0-9_]{0,62}$/` validation to the TS version for CJS parity.

### Detection Command

```bash
# Find string interpolation in SQL/PG commands
grep -rn 'NOTIFY\|LISTEN\|UNLISTEN' --include='*.js' --include='*.ts' lib/ | grep -v 'test(channel)\|SAFE_CHANNEL'
# Find new RegExp without safeRegex
grep -rn 'new RegExp(' --include='*.tsx' --include='*.ts' components/ app/ | grep -v safeRegex | grep -v node_modules
```

---

## BC38: File Upload & Storage Abuse

**Status**: ERADICATED
**Severity**: HIGH
**Sites**: 12 total (0 CRITICAL, 4 HIGH fixed, 7 MEDIUM, 1 LOW remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

Missing size limits on artifact content stored in DB, no Content-Length validation before parsing large JSON payloads, and no per-POV storage quota enforcement.

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `lib/services/agentExecutionEngine.ts` | Artifact content truncated to 5MB max per artifact with `[TRUNCATED]` marker |
| 2 | `app/api/tasks/[taskId]/attachments/route.ts` | Content-Length header checked before `req.json()` — rejects >100MB |
| 3 | `app/api/pov/[povId]/import/route.ts` | Content-Length header checked before `request.json()` — rejects >10MB |
| 4 | (Storage quota) | Deferred — requires schema change to add `size` field to AgentArtifact model |

### Detection Command

```bash
# Find artifact creation without size limits
grep -rn 'agentArtifact.create' --include='*.ts' lib/ | grep -v truncate
# Find req.json() without Content-Length check
grep -rn 'req\.json()\|request\.json()' --include='*.ts' app/api/ | grep -v content-length
```

---

## BC39: Privilege Escalation Edge Cases

**Status**: ERADICATED
**Severity**: HIGH
**Sites**: 6 total (0 CRITICAL, 1 HIGH fixed, 3 MEDIUM fixed, 1 LOW, 1 verified safe)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

API keys inherit full user role without scoping, email update silently ignored for non-admins, custom role assignment without hierarchy validation, API key validation doesn't verify user still exists.

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `lib/services/apiKeyService.ts:54` | Added `scope: 'api-key'` claim to JWT payload for distinguishing API key from session tokens |

### MEDIUM Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `app/api/auth/profile/route.ts:61` | Non-admin email changes now return 403 explicitly instead of being silently ignored |
| 2 | `lib/admin/handlers/user.ts:177` | Custom role assignment restricted to SUPER_ADMIN only |
| 3 | `lib/services/apiKeyService.ts:252` | `validateApiKey` now checks user exists and is active in DB, uses current DB role instead of stale JWT claim |

### Detection Command

```bash
# Find role assignments without hierarchy checks
grep -rn 'customRoleId' --include='*.ts' lib/admin/ | grep -v 'SUPER_ADMIN'
# Find API key validation without DB checks
grep -rn 'validateApiKey' --include='*.ts' lib/ | grep -v prisma
```

---

## BC40: Cache Poisoning & Stale Data

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 8 total (3 CRITICAL fixed, 2 HIGH fixed, 2 MEDIUM, 1 LOW remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

HTTP cache headers set on authenticated POV endpoints without `Vary: Authorization`, allowing shared caches to serve admin responses to regular users. Token-authenticated artifact downloads cacheable despite one-time tokens.

### CRITICAL Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `app/api/pov/[povId]/phases/route.ts` | Added `private` + `Vary: Authorization` to Cache-Control |
| 2 | `app/api/pov/[povId]/phase/[phaseId]/route.ts` | Added `private` + `Vary: Authorization` to Cache-Control |
| 3 | `app/api/pov/[povId]/phase/[phaseId]/stages/route.ts` | Added `private` + `Vary: Authorization` to Cache-Control |

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `app/api/artifacts/[id]/public-download/route.ts` | Changed `Cache-Control: private, max-age=3600` to `no-store` (token-authenticated downloads must not be cached) |
| 2 | `app/api/artifacts/[id]/download/route.ts` | Missing `Vary: Authorization` header on authenticated artifact download endpoint |

#### Session 9 Detection Re-Audit Extension (Mar 4, 2026)

HIGH fix #2 found during detection command re-audit. The authenticated download endpoint (`/artifacts/[id]/download`) was missing the `Vary: Authorization` header, allowing shared caches to potentially serve one user's artifact download to another.

### Detection Command

```bash
# Find Cache-Control without Vary: Authorization on authenticated endpoints
grep -rn 'Cache-Control.*max-age' --include='*.ts' app/api/ | grep -v 'no-store\|no-cache'
# Cross-reference with withPOVAccess or getAuthUser middleware
```

---

## BC41: Integer Overflow & Numeric Boundary

**Status**: ERADICATED
**Severity**: HIGH
**Sites**: 16 total (4 HIGH fixed, 7 MEDIUM, 5 LOW remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

User-controlled numeric values (query params, MCP tool args, headers) parsed without range validation, allowing uncapped limits (DoS via memory exhaustion), negative page values (Prisma errors), and unbounded MCP tool arguments.

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `app/api/tasks/agent/executions/route.ts` | `Math.min(limit, 200)` cap |
| 2 | `app/api/agent-templates/route.ts` | `Math.min(limit, 200)` cap |
| 3 | `app/api/mcp/tasks/recommendations/route.ts` | `Math.min(limit, 200)` cap |
| 4 | `app/api/mcp/service-recommendations/route.ts` | `Math.min(limit, 200)` cap |
| 5 | `app/api/tasks/search/route.ts` | `Math.min(limit, 200)` cap on quick + suggestions |
| 6 | `lib/admin/handlers/activity.ts` | `Math.max(1, page)` + `Math.min(limit, 100)` |
| 7 | `lib/mcp/server/tools/hub/service-discovery-handler.js` | `Math.min(Math.max(1, limit), 200)` + `Math.max(1, page)` |
| 8 | `lib/mcp/server/tools/hub/prompt-list-handler.js` | `Math.min(Math.max(1, limit), 200)` cap |

### Detection Command

```bash
# Find parseInt on limit/page without Math.min/Math.max cap
grep -rn "parseInt.*limit\|parseInt.*page" --include='*.ts' --include='*.js' app/api/ lib/ | grep -v Math.min | grep -v Math.max | grep -v parsePaginationParams
```

---

## BC42: Log Injection & Log Forgery

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 39 total (2 CRITICAL fixed, 6 HIGH fixed, 26 MEDIUM, 5 LOW remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

No centralized log sanitization. OAuth token endpoint dumped full `req.body` including `client_secret`, `refresh_token` to debug logs. Pino redaction paths used camelCase but missed OAuth-standard snake_case fields. Raw user input logged before validation enabling injection/forgery. `createAdapter` concatenated objects to strings, bypassing pino redaction entirely.

### CRITICAL Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `mcp-server-http-clean.js` | Replace `{ body: req.body }` with boolean flags (`has_code`, `has_secret`, etc.) |
| 2 | `lib/mcp/server/pino-base-options.json` | Add `access_token`, `refresh_token`, `client_secret`, `code_verifier` + `body.*` + `*.*` snake_case paths |

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `app/api/pov/agent/execute-function/route.ts` | Truncate `body.functionName` to 100 chars + strip newlines before logging |
| 2 | `app/api/mcp/tasks/action/route.ts` | Truncate `rawBody.action` to 50 chars, remove validation details from log |
| 3 | `app/api/phase-templates/route.ts` | Truncate `data.name` to 100 chars + strip newlines before logging |
| 4 | `app/api/agent-templates/route.ts` | Truncate `body.name` to 100 chars + strip newlines before logging |
| 5 | `lib/mcp/server/tools/hub/service-discovery-handler.js` | Log only expected args fields (capability, status, category) not full args object |
| 6 | `lib/mcp/server/mcp-logger.js` | Add `redactObj()` in createAdapter to strip sensitive keys before `JSON.stringify` |
| 7 | `lib/auth/oauth/oauth-logger.ts` | Sanitize `errorMessage` + `userAgent` (truncate + strip control chars) before file write |

### Detection Command

```bash
# Find raw user input in log calls (body.*, rawBody.*, data.*, args spread)
grep -rn 'Logger\.\(info\|warn\|error\|debug\).*body\.\|Logger\.\(info\|warn\|error\|debug\).*rawBody\.\|Logger\.\(info\|warn\|error\|debug\).*data\.' --include='*.ts' app/api/
# Find logger calls with full args objects
grep -rn '{ args,' --include='*.js' --include='*.ts' lib/mcp/
```

---

## BC43: Business Logic Bypass

**Status**: ERADICATED
**Severity**: HIGH
**Sites**: 8 total (1 HIGH fixed, 5 MEDIUM, 2 LOW remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

POV PUT handler copied `status` directly to Prisma update without routing through `StatusTransitionService.validateTransition()`. Users could set POV status from PROJECTED to WON without completing any phases or KPIs.

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `lib/pov/handlers/put.ts` | Added status field to existing POV fetch + transition validation via `statusService.validateTransition()` before update |

### Detection Command

```bash
# Find status updates that bypass StatusTransitionService
grep -rn 'status.*WON\|status.*VALIDATION\|status.*IN_PROGRESS' --include='*.ts' lib/pov/ app/api/pov/ | grep -v StatusTransition | grep -v status.ts
```

---

## BC44: Rate Limit Bypass & Resource Exhaustion

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 11 total (1 CRITICAL fixed, 3 HIGH fixed, 5 MEDIUM, 2 LOW remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

`createHandler` skipped ALL per-endpoint rate limiting when `x-forwarded-for` and `x-real-ip` headers were absent (internal call detection). Attackers accessing Next.js directly (port 3000) bypassed all rate limits. Several mutation-heavy endpoints (MCP tasks action, bulk move, bulk update) had no rate limiting at all.

### CRITICAL Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `lib/api-handler.ts` | Always rate limit — use IP from proxy headers or fall back to `'direct'` bucket (removed the `isInternalCall` skip) |

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `app/api/mcp/tasks/action/route.ts` | Added `rateLimit: 'write'` — primary MCP mutation endpoint |
| 2 | `app/api/tasks/bulk/move/route.ts` | Added `rateLimit: 'write'` — consistent with bulk assign |
| 3 | `app/api/tasks/bulk/update/route.ts` | Added `rateLimit: 'write'` — consistent with bulk assign |

### Detection Command

```bash
# Find createHandler calls without rateLimit option (mutation endpoints)
grep -rn "createHandler.*requireAuth.*true" --include='*.ts' app/api/ | grep -v rateLimit
```

---

## BC45: Insecure Defaults & Missing Headers

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 10 total (1 CRITICAL fixed, 3 HIGH fixed, 3 MEDIUM, 3 LOW remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

Hardcoded default password (`TempPass2025!`) in admin user creation, missing security headers (X-Content-Type-Options, X-Frame-Options, etc.), no request body size limit, and dead CORS module still importable.

### CRITICAL Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `lib/admin/services/user.ts` | `TempPass2025!` → `crypto.randomBytes(24).toString('base64url')` |

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `next.config.js` | Added `async headers()` with X-Content-Type-Options, X-Frame-Options, Referrer-Policy, X-XSS-Protection, Permissions-Policy |
| 2 | `lib/api-handler.ts` | Added `maxBodySize` option with Content-Length pre-check (1MB default, 413 on exceed) |
| 3 | `lib/config/mcp-cors.js` | Annotated as deprecated — dead code, never imported |

### Detection Command

```bash
# Find hardcoded passwords
grep -rn "TempPass\|hardcoded.*password\|default.*password" --include='*.{ts,js}' lib/ app/ | grep -v node_modules
# Find missing security headers
grep -rn "X-Content-Type-Options\|X-Frame-Options" --include='*.{js,ts}' next.config.* middleware.*
```

---

## BC46: Unsafe External Data Trust

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 14 total (2 CRITICAL fixed, 5 HIGH fixed, 5 MEDIUM, 2 LOW remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

External data from request bodies, OAuth providers, and LLM responses used without validation. Request body `createdBy` field trusted over JWT-derived identity. HTML artifacts served as `text/html` enabling stored XSS. OAuth token exchange responses used without type/existence checks. LLM markdown output interpolated without sanitization.

### CRITICAL Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `app/api/agent-templates/route.ts` | `body.createdBy` → `user.userId` (prevent attribution spoofing) |
| 2 | `app/api/pov/agent/artifacts/.../download/route.ts` | HTML artifacts served as `text/markdown` instead of `text/html` (prevent stored XSS) |

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `lib/auth/oauth/oauth-service.ts` | Token exchange: type checks, empty access_token rejection, expires_in clamping (60-86400s) |
| 2 | `lib/auth/oauth/oauth-service.ts` | Token refresh: same pattern with rawExpires validation |
| 3 | `lib/auth/oauth/oauth-service.ts` | User profile: `requireString()` helper, field-by-field type checks for all 3 providers |
| 4+5 | `app/api/pov/agent/execute/stream/route.ts` | `sanitizeLLMForMarkdown()` strips `<script>`, event handlers, `<iframe>` + HTML entity escaping on interpolated fields |

### Detection Command

```bash
# Find body.createdBy or body.userId used directly
grep -rn "body\.createdBy\|body\.userId\|body\.ownerId" --include='*.ts' app/api/ | grep -v validation | grep -v '\/\/'
# Find text/html content type in responses
grep -rn "text/html" --include='*.ts' app/api/ | grep -v node_modules
```

---

## BC47: Concurrency Gaps & Double-Action

**Status**: ERADICATED (Feb 2026); **PARTIALLY REOPENED + RE-FIXED 2026-06-08** — fixes #1/2 (team-create),
#3/#4 (task-order race) and #5 (EMA metrics) had been "fixed" by *wrapping in a plain `$transaction`*, which
does NOT prevent the race (the BC19 misconception). All re-fixed via `FOR UPDATE` row locks (see BC19 §TS4
Update / sweep table). Lesson: a plain `$transaction` = atomicity/torn-read only, never race protection.

**Order-race re-fix detail (2026-06-08):** #3 `task-create-handler.ts:613` + #4
`app/api/pov/[povId]/phase/[phaseId]/stage/[stageId]/task/route.ts:72` did `findFirst(max order) → +1000 →
create` in a PLAIN tx → two concurrent default-appends → duplicate `order` (silent — `order` has no unique
constraint). Re-fixed: `FOR UPDATE` on the parent `stages` row before the recalc (waits, no abort). NOTE:
`app/api/pov/[povId]/phase/[phaseId]/stage/route.ts` was ALREADY correct (its local `getNextStageOrder` does
`FOR UPDATE NOWAIT`, "Week 4 Phase 2.2"). **Still-active (LOW, bare create needs tx+lock — deferred):**
`stage-create-handler.ts:454` (non-atomic complex-ordering path) + `stage-resolver.ts:256/368` (on-demand
stage creation) use the unlocked order-utils `getNextStageOrder` outside any tx → racy on stage `order`;
low-frequency (stage creation), restructuring (wrap in tx + lock the `"Phase"` row) deferred. Severity of the
whole order-race sub-class: **LOW** (cosmetic — duplicate `order` = unstable sort, not data loss).

**2026-06-09 update:** the 4 Serializable+`FOR UPDATE NOWAIT` reorder/create sites (`phase.ts` reorderPhases/
reorderStages, `post.ts` createPhase, `stage/route.ts` createStage) were (a) un-broken in Phase 0 — they used a
non-existent table `phases` + `::uuid`-on-CUID so the locks never worked (07375dd4) — and (b) retry-wrapped with
`withSerializationRetry` so a 55P03/40001 retries instead of erroring (f0ac6925). The 2 still-active LOW leftovers
(`stage-create-handler:454`, `stage-resolver:256/368`) are NOT original BC47 HIGH holes — they're newly-found LOW
extras needing fresh investigation (the `:454` path is *explicit/relative*-ordering, may not even race;
`stage-resolver` has a *double-stage-create* concern bigger than the order race). **Sequencing:** the now-shipped
retry helper enables the clean fix later — `UNIQUE(stageId, order)` + retry (impossible before: no retry infra →
hard-fail). Tracked in `cline_docs/BACKLOG-2026-06-session.md` §BC47.

**Prod-check gate (2026-06-09) — BC47L-b is LATENT, deferred:** the `stage-resolver` TOCTOU double-create
(`stage-resolver.ts:252` + `:363` — two concurrent "stage not found → `prisma.stage.create`" with no lock/unique
constraint → duplicate `(phaseId, name)` stages) was data-checked against prod before committing to a fix:
**0 duplicate `(phaseId, name)` groups across 143 stages** → it has never fired (stage creation is
low-concurrency). Decision: **defer** — a `UNIQUE(phaseId, name)` migration + upsert/retry is unjustified by zero
incidence. Re-gate query (run before building the fix): `SELECT "phaseId", name, count(*) FROM stages GROUP BY
"phaseId", name HAVING count(*) > 1;` — any rows = it has started firing → then build the fix.

**Specialist ownership / notes:**
- **`phase-stage-specialist`** owns the stage-creation/ordering lifecycle — BC47L-a/-b live in its domain. Both are
  LOW: -a is cosmetic (unstable sort from a racy `getNextStageOrder`), -b is latent data-integrity (prod-confirmed
  0 incidence). When -b becomes live, the fix is a `UNIQUE(phaseId, name)` constraint + `upsert`-or-retry, NOT a
  bare lock (the resolver creates across two branches; a constraint is the durable guard).
- **`database-manager-specialist`** owns the retry mechanism: the `UNIQUE`+retry shape uses `withSerializationRetry`
  (P2002 is NOT in `RETRYABLE_SQLSTATES` by design — for an upsert/INSERT-conflict retry you catch P2002 explicitly
  at the call site, you do not add it to the shared serialization set, which is for transient aborts only).
- The 4 reorder/create NOWAIT sites are DONE (retry-wrapped) — see the database-management-discovery concurrency
  greps + transaction-atomicity-pattern.md §Retry for the wrap pattern.
**Severity**: HIGH
**Sites**: 13 total (0 CRITICAL, 5 HIGH fixed, 5 MEDIUM, 3 LOW remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

Non-atomic read-modify-write sequences and multi-step operations without transactions. Team creation race allows duplicate teams if two concurrent requests both see `teamId=null`. Task order calculation outside transaction allows duplicate order values. Hub metrics EMA update is a non-atomic read-compute-write.

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 1+2 | `app/api/pov/[povId]/team/members/route.ts` | Team creation + member add wrapped in `$transaction` with re-read of `pov.teamId` inside tx + P2002 unique constraint catch → 409 |
| 3 | `lib/mcp/tasks/action/handlers/task/task-create-handler.ts` | Default-append order recalculation moved inside `$transaction` |
| 4 | `app/api/pov/[povId]/phase/[phaseId]/stage/[stageId]/task/route.ts` | Order calculation + task create wrapped in `$transaction` |
| 5 | `lib/mcp/server/tools/hub/hub-utilities.js` | EMA metrics read-modify-write wrapped in `$transaction` |

### Detection Command

```bash
# Find findFirst + create outside transactions (potential order race)
grep -rn "findFirst\|findMany" --include='*.ts' app/api/ | grep -i order | grep -v transaction | grep -v '//'
# Find non-atomic read-modify-write on metrics/counters
grep -rn "findUnique.*update\|findFirst.*update" --include='*.{ts,js}' lib/mcp/ | grep -v transaction
```

---

## BC48: Insecure Deserialization & Unsafe JSON.parse

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 16 total (2 CRITICAL fixed, 5 HIGH fixed, 4 MEDIUM, 5 LOW remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

JWT role claims accepted via TypeScript `as UserRole` cast with no runtime validation — any string passes through. KPI `new Function()` blocklist bypassable via `this.constructor`, bracket access, and unicode escapes. Workflow steps JSON.parse silently falls through to string iteration on parse failure.

### CRITICAL Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `lib/auth/token-manager.ts` | Added `validateRole()` — runtime enum check on all 4 JWT decode paths (RS256, HS256, refresh, decode) |
| 2 | `lib/pov/services/kpi.ts` | Strengthened blocklist — added `this`, `self`, `window`, bracket access `[..'"]`, unicode `\\u`, template literals |

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `lib/mcp/server/tools/hub/workflow-tools-handler.js` | Steps JSON.parse throws on failure instead of silent fall-through to string iteration |

### Detection Command

```bash
# Find `as UserRole` unsafe casts
grep -rn 'as UserRole' --include='*.ts' lib/ app/ | grep -v node_modules | grep -v validateRole
# Find JSON.parse without throw on failure
grep -rn 'JSON\.parse' --include='*.{ts,js}' lib/ app/ | grep -v catch | grep -v node_modules
```

---

## BC49: Incomplete Input Normalization & Encoding Bypass

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 15 total (2 CRITICAL fixed, 5 HIGH fixed, 5 MEDIUM, 3 LOW remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

OAuth provider emails not normalized to lowercase — PostgreSQL unique constraint is case-sensitive, creating duplicate accounts when same email appears with different casing across OAuth vs login. Admin user schemas lacked `.toLowerCase()`. GET query params for status/priority/sortBy accepted arbitrary strings via `as` type casts with no runtime validation.

### CRITICAL Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `lib/auth/oauth/oauth-service.ts` | `.toLowerCase()` on email for all 3 providers (Microsoft, Google, GitHub) |
| 2 | `app/api/auth/register/route.ts` | `config?.contactEmail?.toLowerCase()` for trial email comparison |

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 1-2 | `lib/validation/admin-user-validation.ts` | `.transform(e => e.toLowerCase())` on CreateUserSchema + UpdateUserSchema email fields |
| 3 | `app/api/tasks/search/route.ts` | status/priority validated against enum values + dateField/orderBy/orderDir allowlists |
| 4 | `lib/tasks/handlers/get.ts` | status/priority validated against TaskStatus/TaskPriority enums |
| 5 | `app/api/tasks/agent/executions/route.ts` + `app/api/agent-templates/route.ts` | sortBy validated against allowlists |

### Detection Command

```bash
# Find email fields without toLowerCase
grep -rn '\.email' --include='*.ts' lib/validation/ | grep -v toLowerCase | grep -v node_modules
# Find unsafe `as` casts on query params
grep -rn 'searchParams.*as\s' --include='*.ts' app/api/ lib/ | grep -v node_modules
```

---

## BC50: Unsafe Error Recovery & Partial State

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 20 total (3 CRITICAL fixed, 6 HIGH fixed, 7 MEDIUM, 4 LOW remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

Multi-step operations creating/modifying multiple resources sequentially without transactions. Failure midway leaves orphan records or inconsistent state: orphan users without trial linkage, privilege changes without token invalidation, partial phase/stage/task trees, workflow step status out of sync with aggregate workflow status.

### CRITICAL Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `app/api/auth/register/route.ts` | User creation + trial linkage wrapped in `$transaction` |
| 2 | `app/api/mcp/recommendations/[id]/implement/route.ts` | MCPInteraction + MCPWorkflowExecution in `$transaction` |
| 3 | `lib/admin/services/user.ts` | User update + refresh token invalidation in `$transaction` (atomic privilege change) |

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `lib/pov/phase-templates/storage.ts` | Phase + stages + tasks creation in `$transaction` |
| 2 | `lib/pov/services/phaseTemplate.ts` | Stages + tasks in `$transaction` (replaced Promise.all with sequential tx) |
| 3 | `app/api/pov/[povId]/team/members/batch/route.ts` | Team creation + POV update + member add in single `$transaction` |
| 4 | `lib/mcp/recommendation-generator.ts` | storeRecommendations wrapped in `$transaction` |
| 5 | `lib/pov/services/launch.ts` | POV status + launch record in `$transaction` |
| 6 | `lib/pov/services/workflow.ts` | Step status + auto-workflow-status in `$transaction` |

### Detection Command

```bash
# Find sequential prisma creates not in transactions
grep -rn 'prisma\.\w\+\.create\|prisma\.\w\+\.update' --include='*.ts' app/api/ lib/ | grep -v '\$transaction' | grep -v node_modules | grep -v '.d.ts'
```

## BC51: Unsafe Redirect, URL Construction & SSRF

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 10 total (2 CRITICAL fixed, 3 HIGH fixed, 3 MEDIUM, 2 LOW remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

Server-side fetch/connection to user-controlled URLs without SSRF validation. Background health checks, cross-service calls, and workflow execution all skipped `validateUrlSafety()`. Service update endpoint used weak BLOCKED_DOMAINS string matching. LLM proxy accepted unused `endpoint` field. HealthCheckPath lacked protocol/traversal checks.

### CRITICAL Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `lib/mcp/server/tools/hub/hub-utilities.js` | Added `validateUrlSafety()` before background health check fetch |
| 2 | `lib/mcp/server/tools/hub/service-call-handler.js` | Added `validateUrlSafety()` before cross-service connection |

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 3 | `lib/mcp/server/tools/hub/workflow-tools-handler.js` | Added `validateUrlSafety()` before workflow execution connection |
| 4 | `lib/mcp/server/tools/hub/service-update-handler.js` | Replaced weak BLOCKED_DOMAINS with `validateUrlSafety()` + healthCheckPath must start with `/` and no `://` |
| 5 | `app/api/llm/proxy/route.ts` + `stream/route.ts` | Removed unused `endpoint` field from LLM proxy schemas |

### Post-Eradication Fix: TRUSTED_INTERNAL_SERVICES Bypass Inconsistency (Mar 2026)

**Commit**: `dbd36c5c` — fix(security): add TRUSTED_INTERNAL_SERVICES SSRF bypass to all 4 BC51 code paths

**Problem**: When BC51 added `validateUrlSafety()` to 4 code paths, only `service-update-handler.js` included a bypass for `TRUSTED_INTERNAL_SERVICES` (first-party Docker containers that legitimately run on localhost). The other 3 paths (`service-call-handler.js`, `workflow-tools-handler.js`, `hub-utilities.js`) blocked all localhost calls including trusted internal services like `token-validator-service`.

**Fix**: Added `TRUSTED_INTERNAL_SERVICES` import and bypass check to all 4 BC51 code paths:
```javascript
const isTrustedInternal = TRUSTED_INTERNAL_SERVICES.includes(targetService.name);
if (!isTrustedInternal) {
  const urlCheck = validateUrlSafety(endpoint);
  if (!urlCheck.safe) { throw new Error(...); }
}
```

**Lesson**: When adding a security guard to multiple code paths, ensure all exception/bypass logic is also applied consistently. A bypass in one path but not others creates a "guard inconsistency" pattern.

### Detection Command

```bash
# Find fetch/connection calls without validateUrlSafety nearby
grep -rn 'fetch(\|new URL(' --include='*.js' --include='*.ts' lib/mcp/ app/api/ | grep -v validateUrlSafety | grep -v node_modules | grep -v '.d.ts'

# Verify TRUSTED_INTERNAL_SERVICES bypass is present in all validateUrlSafety call sites
grep -rn 'validateUrlSafety' --include='*.js' --include='*.ts' lib/mcp/ | grep -v node_modules | grep -v '.d.ts'
# Each hit should have a TRUSTED_INTERNAL_SERVICES check nearby
```

---

## BC52: Insecure Cookie Attributes & Session Management

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 13 total (2 CRITICAL fixed, 4 HIGH fixed, 4 MEDIUM, 3 LOW remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

Cookie maxAge set in milliseconds instead of seconds (Next.js expects seconds), creating 10.4-day tokens instead of 15 minutes. Access token exposed in refresh response body defeating HttpOnly. Revoke endpoint uses wrong cookie name. Password changes don't invalidate sessions. No session limit allows unlimited device accumulation. Middleware re-sets cookie without maxAge.

### CRITICAL Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `app/api/auth/refresh/route.ts` | Removed `accessToken` from response body (HttpOnly cookie only) |
| 2 | `app/api/auth/login/route.ts` + `lib/config.ts` | Fixed maxAge unit: removed `* 1000` — Next.js uses seconds not milliseconds |

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 3 | `app/api/auth/profile/route.ts` | Invalidate all refresh tokens + clear cookies on password change |
| 4 | `app/api/auth/revoke/route.ts` | Fixed cookie name from hardcoded `'refreshToken'` to `config.cookie.refreshToken` |
| 5 | `app/api/auth/login/route.ts` | Session limit: max 10 refresh tokens per user, delete oldest on login |
| 6 | `lib/auth/middleware.ts` | Added `maxAge` to middleware cookie re-set (was becoming session-only) |

### Detection Command

```bash
# Find cookie maxAge with millisecond patterns
grep -rn 'maxAge.*\* 1000\|maxAge.*[0-9]\{5,\}' --include='*.ts' app/api/ lib/ | grep -v node_modules
# Find hardcoded cookie names instead of config references
grep -rn "cookies.get('refresh\|cookies.get(\"refresh" --include='*.ts' app/api/ | grep -v config.cookie
```

---

## BC53: Unsafe File Operations, Path Traversal & Symlink Attacks

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 15 total (1 CRITICAL noted as BC17/48 refinement, 3 HIGH fixed, 5 LOW fixed, 3 MEDIUM, 3 LOW remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

Storage URLs without protocol restriction allowing file:// or javascript: URIs. OAuth log directory configurable via env without path validation, enabling path traversal. KPI new Function() refinement noted (already hardened in BC17+BC48). Also: Zod `.url()` validators without protocol enforcement allow dangerous URI schemes (file://, javascript:, data:).

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `lib/validation/task-validation.ts` | StorageUrl restricted to `https://` protocol only |
| 2 | `lib/auth/oauth/oauth-logger.ts` | OAUTH_LOG_DIR validated against allowed prefixes (`/var/log/`, `/tmp/`, `/var/www/`) and path.resolve() |
| 3 | `app/api/llm/proxy/route.ts` + `stream/route.ts` | (Same as BC51 H5 — unused endpoint field removed) |

### LOW Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `lib/validation/mcpServerValidation.ts` | `.url()` without protocol enforcement → added `.refine()` for http(s) only |
| 2 | `lib/validation/mcp-tools-validation.ts` | `.url()` without protocol enforcement → added `.refine()` for http(s) only |
| 3 | `lib/validation/crm-validation.ts` | `.url()` without protocol enforcement → added `.refine()` for http(s) only |
| 4 | `lib/validation/settings-validation.ts` (ollamaApiUrl) | `.url()` without protocol enforcement → added `.refine()` for http(s) only |
| 5 | `lib/validation/settings-validation.ts` (customApiUrl) | `.url()` without protocol enforcement → added `.refine()` for http(s) only |

#### Session 9 Detection Re-Audit Extension (Mar 4, 2026)

LOW fixes #1-5 found during detection command re-audit. Five URL validation schemas used `.url()` without protocol restriction, allowing potentially dangerous URI schemes (file://, javascript:, data:). Fixed by adding `.refine()` checks that enforce http:// or https:// protocol only.

### Detection Command

```bash
# Find z.string().url() without protocol restriction
grep -rn '\.url(' --include='*.ts' lib/validation/ | grep -v 'startsWith\|refine'
# Find env-controlled paths without validation
grep -rn 'process.env.*DIR\|process.env.*PATH' --include='*.ts' lib/ | grep -v node_modules | grep -v 'path.resolve\|ALLOWED'
```

## BC54: DNS Rebinding & Host Header Attacks

**Status**: ERADICATED
**Severity**: HIGH
**Sites**: 10 total (0 CRITICAL, 4 HIGH fixed, 3 MEDIUM, 3 LOW remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

MCP origin validation using `.includes('claude.ai')` and `.startsWith('http://localhost')` — trivially bypassable with crafted domains like `evil-claude.ai.attacker.com` or `localhost.evil.com`. CORS same-origin check derived from spoofable Host header. All rate limiters trusting `X-Forwarded-For` without validation, enabling complete rate limit bypass via header spoofing.

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `lib/mcp/server/express-setup.ts` (Block 6 — grep `// BC54 FIX`) — extracted from `mcp-server-http-clean.js` in Wave 5 (2026-05-21) | Replaced `.includes()`/`.startsWith()` with `new URL().hostname` exact match. Two PRE-EXISTING follow-ups: Task #146 (`req.path === '/mcp'` exact match leaves `/mcp/v2` ungated) + Task #147 (BIND_ALL `startsWith('172.')` over-permissive) |
| 2 | `lib/utils/cors.ts` | Same-origin check uses `APP_BASE_URL` instead of spoofable `request.nextUrl.host` |
| 3 | `app/api/artifacts/[id]/download/route.ts` | Inline CORS check uses `APP_BASE_URL` instead of `request.nextUrl.host` |
| 4 | `middleware/rate-limiter-enhanced.ts` + `lib/middleware/rate-limit.ts` + `app/api/auth/login/route.ts` | Only trust proxy headers when `TRUSTED_PROXY` env is set |

### Detection Command

```bash
# Find origin validation using includes/startsWith (bypassable)
grep -rn "\.includes('claude\|\.startsWith('http://localhost" --include='*.js' --include='*.ts' | grep -v node_modules
# Find rate limiters trusting x-forwarded-for without TRUSTED_PROXY check
grep -rn 'x-forwarded-for' --include='*.ts' | grep -v TRUSTED_PROXY | grep -v node_modules
```

---

## BC55: Unsafe Cryptographic Practices

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 10 total (1 CRITICAL fixed, 1 HIGH fixed, 3 LOW fixed, 3 MEDIUM, 1 LOW, 1 INFORMATIONAL remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

RS256 JWT tokens decoded without signature verification in `verifyAccessToken()` — attacker can forge tokens with arbitrary claims. Edge middleware passes RS256 tokens through without any claim validation, completing the bypass chain. Also: `jwtVerify()` calls without explicit `algorithms` option allow algorithm confusion attacks.

### CRITICAL Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `lib/auth/token-manager.ts:166-215` | RS256 tokens verified with `jwtVerify(token, publicKey, { algorithms: ['RS256'], issuer, audience })` — no more unverified decode |

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 2 | `lib/auth/middleware.ts:73-97` | RS256 middleware passthrough now validates subject, issuer, and expiration claims before passing to route handler |

### LOW Fixes

| # | File | Fix |
|---|------|-----|
| 3 | `lib/services/mcp/customAuthProvider.ts` | `jwtVerify()` without explicit `algorithms` option — added `algorithms: ['HS256']` |
| 4 | `middleware/auth.ts` | `jwtVerify()` without explicit `algorithms` option — added `algorithms: ['HS256']` |
| 5 | `middleware/admin.ts` | `jwtVerify()` without explicit `algorithms` option — added `algorithms: ['HS256']` |

#### Session 9 Detection Re-Audit Extension (Mar 4, 2026)

LOW fixes #3-5 found during detection command re-audit. Three `jwtVerify()` call sites were missing the explicit `algorithms` option. Without this, an attacker could potentially exploit algorithm confusion by submitting a token signed with a different algorithm. Fixed by adding `algorithms: ['HS256']` to all three sites.

### Detection Command

```bash
# Find JWT decode without verification
grep -rn 'atob.*parts\[1\]\|decode.*without.*verif' --include='*.ts' lib/auth/ | grep -v node_modules
# Find jwtVerify without algorithms option
grep -rn 'jwtVerify(' --include='*.ts' --include='*.js' | grep -v 'algorithms' | grep -v node_modules
```

---

## BC56: Authorization Consistency & Middleware Bypass

**Status**: ERADICATED
**Severity**: CRITICAL
**Sites**: 10 total (1 CRITICAL fixed, 3 HIGH fixed (1 downgraded), 4 MEDIUM, 2 LOW remaining)
**Discovered**: February 28, 2026
**Eradicated**: February 28, 2026

### Root Cause

Circular dependency endpoint with zero authentication and unscoped global `prisma.taskDependency.findMany()` leaking cross-tenant data. `/api/auth/me` exposing full accessToken in response body (defeats HttpOnly cookie protection). Two admin-ish endpoints without role checks (downgraded to MEDIUM).

### CRITICAL Fixes

| # | File | Fix |
|---|------|-----|
| 1 | `app/api/pov/check-circular-dependency/route.ts` | Added `getAuthUser()` + scoped query to task's POV via `task.stage.phase.povId` |

### HIGH Fixes

| # | File | Fix |
|---|------|-----|
| 2 | `app/api/auth/me/route.ts` | Removed `accessToken` from response body, return `tokenExpiresAt` instead |
| 3 | `app/api/auth/login/route.ts` + `app/api/auth/refresh/route.ts` | Added `tokenExpiresAt` to responses for frontend pre-emptive refresh |
| 4 | `components/providers/AuthProvider.tsx` + `lib/store/auth.ts` + `lib/types/auth.ts` | Frontend uses `tokenExpiresAt` instead of decoding full token |

### Detection Command

```bash
# Find route files without auth imports
grep -rL 'getAuthUser\|withPOVAccess\|createHandler\|requirePermission' app/api/**/route.ts | grep -v auth/ | grep -v health
# Find accessToken in response bodies
grep -rn 'accessToken' --include='*.ts' app/api/ | grep -v cookie | grep -v 'BC5[256]'
```

---

## BC69: Host Header Trust in Auth Middleware

**Status**: ERADICATED
**Severity**: MEDIUM
**Sites**: 3 sites / 1 file
**Discovered**: March 1, 2026 (bug family hunt session)
**Eradicated**: March 1, 2026

### Root Cause

Next.js middleware `req.nextUrl.origin` is derived from the `Host` request header, which is attacker-controlled. Three call sites in `lib/auth/middleware.ts` used `req.nextUrl.origin` to construct server-side `fetch()` URLs and redirect URLs:

1. **Line 27**: `fetch(\`${req.nextUrl.origin}/api/auth/refresh\`)` — server-side fetch with forged origin (SSRF-like)
2. **Line 112**: Same pattern in token verification catch block
3. **Line 182**: `new URL('/login', req.nextUrl.origin)` — redirect to attacker-controlled login page

### Attack Vector

An attacker forging the `Host` header (e.g., via reverse proxy misconfiguration or direct connection) could cause:
- Server-side fetch to an attacker-controlled refresh endpoint (credential theft)
- Login redirect to a phishing page (session fixation)

### Fix

Replace all `req.nextUrl.origin` with `TRUSTED_ORIGIN` constant derived from `APP_BASE_URL` environment variable:

```typescript
const TRUSTED_ORIGIN = process.env.APP_BASE_URL || 'https://paichart.app';
// Then use TRUSTED_ORIGIN instead of req.nextUrl.origin everywhere
```

### Sites Fixed

| # | File | Line | Fix |
|---|------|------|-----|
| 1 | `lib/auth/middleware.ts` | 31 | `fetch(\`${TRUSTED_ORIGIN}/api/auth/refresh\`)` |
| 2 | `lib/auth/middleware.ts` | 117 | `fetch(\`${TRUSTED_ORIGIN}/api/auth/refresh\`)` |
| 3 | `lib/auth/middleware.ts` | 188 | `new URL('/login', TRUSTED_ORIGIN)` |

### Detection Command

```bash
# Find any remaining req.nextUrl.origin usage (should be zero in auth paths)
grep -rn 'req\.nextUrl\.origin' --include='*.ts' lib/auth/ app/api/auth/
# Find Host header trust patterns
grep -rn 'req\.nextUrl\.origin\|request\.nextUrl\.origin' --include='*.ts' lib/ app/ | grep -v node_modules | grep -v '.next/'
```

---

## BC70: SSRF Bypass Name Mismatch for Seeded Services

**Status**: ERADICATED
**Severity**: HIGH
**Sites**: 6 sites / 6 files
**Discovered**: March 1, 2026 (smoke test investigation — pov-status-report workflow Step 3 failure)
**Eradicated**: March 1, 2026

### Root Cause

`TRUSTED_INTERNAL_SERVICES` list contained kebab-case IDs (e.g., `'notification-service'`) but all SSRF bypass checks compared against the DB record's `name` field. Seeded services (from seed scripts) store human-readable title-case names in the DB (e.g., `"Notification Service"`), so the string comparison never matched:

```
TRUSTED_INTERNAL_SERVICES: ['notification-service', 'browser-automation-service', ...]
DB serviceRecord.name:      'Notification Service'  // ← never matches!
DB serviceRecord.id:         'notification-service'   // ← matches, but never checked
```

User-registered services (weather, eia, eodhd) stored kebab-case names and matched fine, masking the bug for 4 of 6 trusted services.

### Impact

- `notification-service` and `browser-automation-service` were silently blocked by SSRF protection despite being in the trusted list
- The `pov-status-report` workflow Step 3 always failed with `"endpoint resolves to internal address (Blocked hostname: localhost)"`
- `services(action: "call")` to these services also failed
- Health checks for these services were also blocked
- Endpoint updates for these services were also blocked

### Additional Finding: Duplicate Trusted List

`lib/services/workflow/security/trust-level.js` had its own local `TRUSTED_INTERNAL_SERVICES` with only 2 of 6 services (browser-automation-service, notification-service), diverging from the central 6-service list in `service-approval-policy.js`. This meant weather, eia, eodhd, and token-validator services received `SCOPED` trust level instead of `TRUSTED` in workflow contexts.

### Fix

Added `isTrustedInternalService(serviceOrName)` helper to `service-approval-policy.js` that checks both `name` and `id` fields:

```javascript
function isTrustedInternalService(serviceOrName) {
  if (typeof serviceOrName === 'string') {
    return TRUSTED_INTERNAL_SERVICES.includes(serviceOrName);
  }
  return TRUSTED_INTERNAL_SERVICES.includes(serviceOrName.name) ||
    TRUSTED_INTERNAL_SERVICES.includes(serviceOrName.id);
}
```

Replaced all 6 call sites and eliminated the duplicate list in `trust-level.js`.

### Sites Fixed

| # | File | Change |
|---|------|--------|
| 1 | `lib/mcp/server/config/service-approval-policy.js` | Added `isTrustedInternalService()` helper, used in `evaluateServiceRegistration()` |
| 2 | `lib/mcp/server/tools/hub/service-call-handler.js` | `isTrustedInternalService(targetService)` replaces `.includes(targetService.name)` |
| 3 | `lib/mcp/server/tools/hub/workflow-tools-handler.js` | `isTrustedInternalService(serviceRecord)` replaces `.includes(serviceRecord.name)` |
| 4 | `lib/mcp/server/tools/hub/service-update-handler.js` | `isTrustedInternalService(existingService)` replaces `.includes(existingService.name)` |
| 5 | `lib/mcp/server/tools/hub/hub-utilities.js` | `isTrustedInternalService(service)` replaces `.includes(service.name)` |
| 6 | `lib/services/workflow/security/trust-level.js` | Removed duplicate 2-item list, imports from central source |

### Detection Command

```bash
# Find any remaining raw TRUSTED_INTERNAL_SERVICES.includes() on DB record fields (should only be in helper + service-call-policy)
grep -rn 'TRUSTED_INTERNAL_SERVICES\.includes(' --include='*.js' --include='*.ts' lib/ | grep -v node_modules | grep -v service-approval-policy | grep -v service-call-policy
# Verify all SSRF bypass paths use the helper
grep -rn 'isTrustedInternalService' --include='*.js' --include='*.ts' lib/
```

### Verification

After fix, `pov-status-report` workflow completes all 3 steps (was failing at Step 3). Direct `services(action: "call")` to notification-service succeeds with email delivery via Brevo SMTP relay.

---

## Bug Class 69: Missing POV Access Validation on Sub-Endpoints

**Status**: ERADICATED
**Severity**: HIGH
**Discovered**: March 4, 2026 (Session 10 — adversarial smoke test C5)
**Eradicated**: March 4, 2026

### Description

Task sub-endpoints (e.g., `/tasks/[taskId]/agent/execute`) check authentication (`if (!user)`) but skip POV-level access validation (`validatePOVAccess`). This allows any authenticated user to access/modify resources in POVs they don't belong to, bypassing the multi-tenant isolation model.

### Root Cause

When endpoints were created, developers copied the auth check pattern but forgot to add `validatePOVAccess` — which requires fetching the task's POV and verifying the user is the owner or a team member. The `createHandler` wrapper only checks authentication, not authorization.

### Sites Fixed

| # | File | Change |
|---|------|--------|
| 1 | `app/api/tasks/[taskId]/agent/execute/route.ts` | Added `validatePOVAccess(user, task.pov)` + expanded POV select |
| 2 | `app/api/tasks/[taskId]/agent/route.ts` (GET) | Added `validatePOVAccess(user, task.pov)` + expanded POV select |
| 3 | `app/api/tasks/[taskId]/agent/route.ts` (POST) | Added `validatePOVAccess(user, task.pov)` + expanded POV select |

### Detection Command

```bash
# Find task sub-endpoints that check user but may lack POV access validation
grep -rn 'createHandler' --include='*.ts' app/api/tasks/ | grep -v node_modules
# Cross-reference with validatePOVAccess usage
grep -rn 'validatePOVAccess' --include='*.ts' app/api/tasks/
# Any file in the first result but not the second is a potential site
```

### Guard Pattern

```typescript
// POV select must include these fields for validatePOVAccess to work
pov: {
  select: {
    id: true, ownerId: true, metadata: true,
    team: { select: { members: { select: { userId: true } } } }
  }
}
// Then validate before any operation
if (task.pov) {
  try {
    validatePOVAccess(user, task.pov, { throwOnDeny: true, logContext: 'Operation Name' });
  } catch {
    return { error: { message: 'Access denied', code: 'FORBIDDEN' } };
  }
}
```

---

## Bug Class 70: Response Field Leakage from Unsanitized Input Keys

**Status**: ERADICATED
**Severity**: LOW-MEDIUM
**Discovered**: March 4, 2026 (Session 11 — adversarial smoke test G5)
**Eradicated**: March 4, 2026

### Description

Audit logs and API responses reflect raw user input field names via `Object.keys(args)` or `Object.keys(body)` instead of using validated/sanitized keys. This leaks information about which fields the server recognizes (e.g., confirming `ownerId` is a known field) and may mislead clients into thinking dangerous fields like `ownerId` were actually updated when they were silently stripped.

### Root Cause

After input validation/sanitization, the response or audit log is constructed using the **original** input object's keys rather than the **validated** output's keys. The sanitization happens correctly for the DB write, but the response generation step uses the pre-sanitization reference.

### Sites Fixed

| # | File | Line | Change |
|---|------|------|--------|
| 1 | `lib/mcp/server/tools/hub/service-update-handler.js` | 239 | `Object.keys(args.updates)` → `Object.keys(safeUpdates)` |
| 2 | `lib/mcp/server/tools/hub/service-update-handler.js` | 97 | Removed raw input keys from log entry |
| 3 | `app/api/agent-templates/prompt-library/[promptId]/route.ts` | 166 | `Object.keys(body)` → `Object.keys(validated)` |
| 4 | `app/api/pov/[povId]/phase/[phaseId]/route.ts` | 185 | `Object.keys(data)` → `Object.keys(validation.data)` |

### Detection Command

```bash
# Find Object.keys() on raw input variables in responses/logs
grep -rn 'Object\.keys(body\|Object\.keys(args\|Object\.keys(data\|Object\.keys(updates' --include='*.ts' --include='*.js' app/ lib/ | grep -v node_modules | grep -v '.test.' | grep -v 'safeUpdates\|validated\|validation\.data\|updateData\|parseResult'
```

### Guard Pattern

```typescript
// WRONG — leaks raw input field names
changes: Object.keys(body)

// RIGHT — only reflects validated/sanitized fields
const validated = schema.safeParse(body);
changes: Object.keys(validated.data)
```

---

## Bug Class 71: Code Path Parity Drift

**Status**: ERADICATED (initial sites) · **2026-07-04 update**: the canonical Anthropic sibling pair no longer exists — `streamText` was DELETED (zero callers + its own latent input_json_delta bug; `generateText` streams internally via the SDK accumulator). The class remains live for OTHER sibling pairs (gemini generateText/streamText; engine/stream execution paths — see dual-execution-path-parity pattern). Audit greps below that compare Anthropic generateText vs streamText now hit only the tombstone.
**Severity**: HIGH
**Discovered**: March 10, 2026
**Eradicated**: March 10, 2026 (3 gaps fixed: functionCalls[], stopReason, rawContentBlocks)

### Description

When a feature is added to one code path (e.g., `generateText()`) but not its sibling path (e.g., `streamText()`), the type contract silently diverges. No error is thrown — data is simply absent. Consumers of the lagging path get incomplete responses. Particularly dangerous because:
- TypeScript can't catch it if the field isn't on the interface (the type IS the contract)
- Only manifests when someone uses the lagging path for the upgraded capability
- Can compound over multiple feature additions, widening the gap silently

### Root Cause

Features are added to one code path without updating:
1. The sibling code path (different method, same provider)
2. The type interface (field missing from `LLMStreamChunk` but present on `LLMResponse`)
3. Other providers (Anthropic upgraded but Gemini not)

### Symptom

No error. Consumers read `undefined` for fields that should have data. In agentic loops, this manifests as:
- `stopReason` is `undefined` → loop can't distinguish `tool_use` (continue) from `end_turn` (stop)
- `functionCalls` is `undefined` → multi-tool responses silently drop all but first tool call
- `rawContentBlocks` is `undefined` → multi-turn message history can't be constructed

### Shared Defense

**SDK Capability Audit**: `/.claude/knowledge/discoveries/anthropic-sdk-capability-audit.md`

Phase 3 specifically checks for parity drift:
- Phase 3.1: Compare provider `generateText` vs `streamText` output fields
- Phase 3.2: Compare `LLMResponse` vs `LLMStreamChunk` interface fields
- Phase 3.3: Compare our type definitions against SDK types

Run after: SDK upgrades, new feature additions to any provider path, quarterly.

### All Sites (3 found, 3 fixed)

| # | Gap | File | Fix |
|---|-----|------|-----|
| 1 | `functionCalls[]` missing from `LLMStreamChunk` | `types.ts`, both providers | Added field to type, both providers populate it |
| 2 | `stopReason` missing from `LLMStreamChunk` | `types.ts`, both providers | Added field, Anthropic captures from `message_delta`, Gemini maps `finishReason` |
| 3 | `rawContentBlocks` missing from `LLMStreamChunk` | `types.ts`, both providers | Added field, reconstructed from accumulated data at stream end |

### Detection Command

```bash
# Compare LLMResponse vs LLMStreamChunk field names
echo "=== In LLMResponse but NOT in LLMStreamChunk ===" && \
  comm -23 \
    <(sed -n '/^export interface LLMResponse/,/^export /p' lib/services/llm/types.ts | grep '^\s\+\w\+[?]\?:' | sed 's/[?]\?:.*//' | sed 's/^\s\+//' | sort -u) \
    <(sed -n '/^export interface LLMStreamChunk/,/^export /p' lib/services/llm/types.ts | grep '^\s\+\w\+[?]\?:' | sed 's/[?]\?:.*//' | sed 's/^\s\+//' | sort -u)

# Compare generateText vs streamText fields in provider
grep -c "functionCalls\|stopReason\|rawContentBlocks" lib/services/llm/anthropic-sdk-provider.ts
```

### Guard Pattern

When adding a field to `LLMResponse`:
1. Add the same field to `LLMStreamChunk`
2. Populate it in `streamText()` of ALL providers (Anthropic, Gemini)
3. Run the SDK capability audit Phase 3

---

## Bug Class 72: Streaming Incremental Data Snapshot

**Status**: ERADICATED (initial site)
**Severity**: MEDIUM
**Discovered**: March 10, 2026
**Eradicated**: March 10, 2026

### Description

In the Anthropic streaming protocol, content blocks arrive in stages:
1. `content_block_start` — has type, id, name, but **`input` is `{}`** for tool_use blocks
2. `content_block_delta` — incremental data (`InputJSONDelta` for tool args, `TextDelta` for text)
3. `content_block_stop` — signals block is complete

Any code that snapshots a content block at `content_block_start` gets incomplete data. This is a **protocol-level constraint**, not a bug we introduced — the Anthropic streaming API is designed this way.

### Root Cause

The streaming protocol delivers data incrementally. `content_block_start` is a structural announcement (type, id, name), not a complete data payload. Arguments, text, and thinking arrive in subsequent delta events.

### Symptom

- `rawContentBlocks` pushed from `content_block_start` have `input: {}` for tool_use blocks
- Multi-turn message history constructed from these blocks has empty tool arguments
- LLM receives tool_use blocks with no arguments → confused or fails

### Shared Defense

**Reconstruct-at-end pattern**: Don't snapshot from `content_block_start`. Instead:
- Accumulate text from `TextDelta` events
- Use `functionCalls[]` (which are populated from complete data) for tool_use blocks
- Build `rawContentBlocks` at stream end from accumulated data

```typescript
// WRONG — snapshots incomplete data
case 'content_block_start':
  rawContentBlocks.push(chunk.content_block); // tool_use has input: {}

// RIGHT — reconstructs from accumulated complete data
case 'message_stop':
  if (accumulatedText) rawContentBlocks.push({ type: 'text', text: accumulatedText });
  for (const fc of allFunctionCalls) {
    rawContentBlocks.push({ type: 'tool_use', id: fc.id, name: fc.name, input: JSON.parse(fc.arguments) });
  }
```

### All Sites (1 found, 1 fixed)

| # | File | Line | Fix |
|---|------|------|-----|
| 1 | `anthropic-sdk-provider.ts` | `streamText()` message_stop case | Reconstruct rawContentBlocks from `accumulatedText` + `allFunctionCalls` instead of `content_block_start` snapshots |

### Detection Command

```bash
# Find content_block_start snapshots that might have incomplete data
grep -n "content_block_start" lib/services/llm/*.ts -A 3 | grep "push\|\.input\|\.text"
```

### Affected Delta Types

| Delta Type | Arrives In | What's Incomplete at Start |
|-----------|-----------|---------------------------|
| `InputJSONDelta` | `content_block_delta` | tool_use `input` is `{}` |
| `TextDelta` | `content_block_delta` | text block `text` is `""` |
| `ThinkingDelta` | `content_block_delta` | thinking block `thinking` is `""` |
| `SignatureDelta` | `content_block_delta` | signature data |
| `CitationsDelta` | `content_block_delta` | citation references |

---

---

## Bug Class 30: Error Delivery Channel Mismatch

**Status**: ERADICATED
**Severity**: HIGH
**Discovered**: March 29, 2026
**Root Cause**: Tool handlers use `throw new Error()` for user-facing validation errors, which produces JSON-RPC protocol errors (`{"error": {"code": -32602, "message": "..."}}`). Some MCP clients (notably Claude mobile) display these as a generic `"Error occurred during tool execution"` instead of the actual error message.

### Manifestation

- Server logs show the full detailed error with schema hints and next steps
- Client shows only: `"Error occurred during tool execution"`
- User has no idea what went wrong or how to fix it

### Root Cause Analysis

MCP has two error delivery channels:
1. **JSON-RPC error** (`throw` → `{"error": {...}}`) — protocol-level, clients MAY hide
2. **MCP content** (`return {content, isError: true}` → `{"result": {...}}`) — application-level, clients MUST display

When a tool handler throws, the HTTP server catches it and wraps it as a JSON-RPC error. The error message is preserved in the protocol, but the client's UI layer may choose not to show it.

### Fix Pattern

Change user-facing errors from `throw` to `return`:

```javascript
// ❌ BAD: JSON-RPC error — hidden by some clients
throw new Error('Missing required parameter: recipients');

// ✅ GOOD: MCP content — all clients display
return {
  content: [{ type: 'text', text: '❌ Missing required parameter: recipients' }],
  isError: true
};
```

### Decision Table

| Error Type | Delivery | Reason |
|-----------|----------|--------|
| Validation (missing params, wrong format) | **Return** MCP content | User needs to see what's wrong |
| Not found (with suggestions) | **Return** MCP content | User needs to see alternatives |
| Auth/security | **Throw** | Generic "access denied" is fine |
| Infrastructure (DB, network) | **Throw** | System error, not user-actionable |
| Middleware/shared code | **Throw** (caller wraps) | Can't return MCP format from middleware |

### Scope Analysis (Mar 29, 2026)

**Only the hub layer is affected.** Basic tools (`sdk-native-basic-tools.js`) and advanced handlers (`task-action-handler.js`, `task-context-handler.js`, `agent-results-handler.js`) already have outer catch blocks that wrap `error.message` in `{content, isError: true}` — so their throws are automatically converted to MCP content before reaching the client.

Hub handlers (`hub-tools-handler.js` facade) do NOT have this wrapper — thrown errors propagate to `mcp-server-http-clean.js` line 4005 and become JSON-RPC errors.

### Sites Fixed

| File | Method | Fix |
|------|--------|-----|
| `service-call-handler.js` | `validateToolArguments()` | Changed from throw to return MCP content |
| `service-call-handler.js` | Internal router call (line 167) | Wrapped in try/catch, returns MCP content on error |
| `service-call-handler.js` | External service call (line 431) | Changed throw to return MCP content with nextSteps |
| `hub-tools-handler.js` | All 14 delegations | Added `_safeDelegate()` catch wrapper — converts all thrown errors to `{content, isError: true}` at facade boundary. Matches basic/advanced tools pattern. |

### Defense Pattern

**Basic/Advanced tools** (already safe): Outer catch blocks wrap `error.message`:
```javascript
} catch (error) {
  return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
}
```

**Hub handlers** (need manual fixes): No outer wrapper exists. Each user-facing error must be explicitly returned as MCP content, or the handler needs a wrapper catch added.

### Remaining Hub Sites

Hub handler throws that still become JSON-RPC errors (security/auth — acceptable):
- `extractAuthContext()` — auth failures (generic message appropriate)
- `validateOwnership()` — ownership check failures
- Compliance policy blocks, SSRF blocks, rate limits

```bash
# Audit: find remaining throws in hub handlers
grep -rn "throw" lib/mcp/server/tools/hub/ --include="*.js" | grep -v node_modules | grep -v error-helpers | grep -v "// " | grep -v "@throws"
```

### Related Patterns

- `mcp-tool-ux-pattern.md` — "CRITICAL: Return vs Throw" section (added Mar 2026)
- `mcp-tool-gold-standard-pattern.md` — GS7 critical note (added Mar 2026)

---

**Created By**: Claude Opus 4.6 + Steve Terry
**Date**: February 16, 2026
**Last Updated**: April 8, 2026 (Session — Bug Class 73: Silent .js Shadow over .ts Source-of-Truth)
**Next Review**: May 2026 (quarterly)

---

## Bug Class 73: Silent .js Shadow over .ts Source-of-Truth

**Status**: ✅ **ERADICATED + SOAK VERIFIED + CLOSED** — 24h UAT soak graduated 2026-04-09 Sydney afternoon with all 7 criteria green (0 module errors, 0 BC73-class TypeErrors, both PM2 workers on `tier:'direct'` pid 1277011/1277012 with 0 restart count over 5h window, 0 `http-fallback` entries in 10k log lines, 38 OAuth pino signatures firing, drift detector reports "Current dual pairs: 0" with allowlist absent on deployed release). Smoking-gun empirically verified via the `12a4d6db` Finding #10 fix (310 programmatic calls → 300 allowed + 10 denied + 10 structured `module:'RateLimiter'` pino entries). All 13 dual-pair `.js` files deleted in Phase 2 proper (commit `21d21841`). Drift detector widened post-UAT to scan `lib/` + `scripts/` + repo root depth=1 with the `is_bootstrap_pattern()` heuristic that recognizes legitimate `X.js → require('./X.ts')` bootstrap pairs. Knowledge purge pass complete across 33 files / 6 knowledge subdirectories. Workstream officially closed.
**Severity**: HIGH
**Discovered**: April 7, 2026 (during §5.4 baseline experiment forensic investigation)
**Eradicated**: April 8, 2026 (Phase 2 proper — 13 `.js` files deleted, `mcp-server-http-clean.js` registers ts-node + tsconfig-paths, both PM2 workers run `tier:'direct'`)

### Description

When `lib/**/*.ts` and `lib/**/*.js` exist at the same path, **Node's CJS resolver picks `.js` first** for any extensionless `require()` or `import` — and **ts-node's `register()` does NOT change priority order**. ts-node adds `.ts` as an *additional* extension hook, not a higher-priority one. Webpack's default `resolve.extensions` for Next.js server bundles also prefers `.js` over `.ts`. The combined effect: any TS source-of-truth file with a stale `.js` sibling becomes **silently unreachable in production** via ANY load path (runtime require, webpack bundle, dynamic import).

### Root Cause

Two conditions must combine:
1. A `.ts` file is the "active" source of truth (where developers edit features and bug fixes)
2. A `.js` sibling exists at the same path — left over from a pre-TS migration, a hand-written CJS shim, or a botched move/rename

The `.js` shadows the `.ts`. Every edit to the `.ts` becomes silent dead code in production. Crucially, **the bug compounds over time**: the longer the drift sits undetected, the more silently-shadowed code accumulates.

### Symptom

No error, no warning, no log line. The TS file's exports work in TypeScript tooling (IDE, type-checking, source maps) but the *runtime* sees the stale JS. Common manifestations:

- Pino logging added to a `.ts` utility never fires in production logs
- Security fixes added to a `.ts` file never reach the production runtime
- Connection pool sizing changes are silently ignored
- Auth handler updates have no effect
- The architecture documentation describes behavior that no longer matches production

The session that surfaced this bug class had **6+ weeks of silently-shadowed TS edits across 13+ files**, including OAuth token management, prisma singleton config, rate-limiter pino logging, event system listener cleanup, and BC37 SQL injection hardening on PostgreSQL NOTIFY channels.

### Shared Defense

**Eradication infrastructure** (commit `e52bb99c`, 2026-04-07):
- `scripts/detect-dual-files.sh` — generalized detector that finds any `lib/**/*.ts` with a `.js` sibling
- `.dual-files-allowlist.txt` — known-drift pairs (shrinks as Phase 2 deletes them)
- `.githooks/pre-commit` — blocks commits that introduce new drift; activated automatically via `npm prepare` lifecycle
- `npm run validate:no-dual-files` — CI check wired into `.github/workflows/validation-reusable.yml`

**Architectural fix** (commit `a7db9a35`, 2026-04-08):
- Added `ts-node/register` + `tsconfig-paths/register` to `mcp-server-v5.js` so paichart-mcp resolves `.ts` files at the same path layer as paichart-web
- Mirrors the existing `server.js:9-25` pattern but unconditional (not gated on `isProduction`) because `npm run mcp` and `.mcp-servers.json` are dev workflows that need ts-node too
- Idempotent: calling `ts-node.register()` multiple times is safe (the parent paichart-mcp process registers it before transitively loading mcp-server-v5.js)

**Restoration evidence**: After `a7db9a35` deployed, paichart-mcp's startup log fires `tier:'direct'` for the first time since the bridge regression was introduced. Both PM2 processes (paichart-web AND paichart-mcp) are now on the in-process Tier 1 path. The §3.5 dual-path architecture claim in the whitepaper is now literally true in production.

**Stress test validation (2026-04-08, post-restoration)**: Re-ran the §4.7 concurrency stress test playbook (5 teammates × 4 rounds = 100 parallel MCP operations against the production server) on the Tier 1 restored state. **Result: 100/100 calls successful, 0 failures, heap stable at 63 MB (Δ0), PG active connections peaked at 1 (sampled), zero PM2 restarts, zero `http-fallback` log entries during the test window.** Comparison to the Apr 4 baseline (96/96 on broken-bridge Tier 2): Tier 1 holds at the same load profile as Tier 2 — *the architectural fix introduced no regressions under realistic concurrent load*. The most decisive proof point is the total absence of `tier:'http-fallback'` entries during the test window: every paichart-mcp tool call routed through in-process Prisma for the first time since the bridge regression was introduced. Per-call latency improvement from eliminating the HTTP round-trip was not cleanly measurable from this harness (teammate timings are dominated by Claude Code scheduling + LLM reasoning, and the Apr 4 run didn't capture per-tool-call server-side latencies for a clean A/B). A dedicated microbenchmark would be needed to quantify the Tier 2→Tier 1 per-call latency delta. **Useful negative result**: the bridge regression's *performance* impact was small enough to remain functional on Tier 2 for 6+ weeks without user-visible degradation, while its *architectural* impact was real (silent shadowing of weeks of TS edits) and is now fixed. Full results in `cline_docs/stress-test-2026-04-08-tier1-restored.md`.

### All Sites (16 found, 16 deleted — 100% eradicated)

**Eradicated via Phase 1a (zombie dir, commit `86952012`)**:
- `lib/events/events/shared-connection-pool.js` — zombie duplicate
- `lib/events/events/prompt-registry-events.js` — zombie duplicate
- `lib/events/events/` — directory removed

**Eradicated via Phase 1b partial (commit `fac8d913`)**:
- `lib/auth/oauth/oauth-config.js` — zero callers

**Eradicated via Phase 2.P0 step 2 (commit `264b5c6e`)**:
- `mcp-server-http.js` — dead code, no live launcher (19 KB)

**Eradicated via Phase 2.P0 step 3 (commit `d3a0d03c`)**:
- `mcp-embedded-bridge.js` — dead code, no live launcher (225 lines)

**Eradicated via Phase 2 proper (commit `21d21841`, 2026-04-08)** — the 13 remaining dual pairs + 1 orphaned transitive + drift infrastructure cleanup:

| File | Was shadowing | Verification post-deletion |
|---|---|---|
| `lib/prisma.js` | 5 weeks of edits incl. connection_limit 15→25, pgbouncer conditional, pino migration | ✅ pg_stat_activity shows 15 conns under 25 cap; `application_name` tagging added Apr 8 |
| `lib/utils/ensure-object.js` | small | ✅ 22/22 test:ensure-object passing (refactored Layer 1 to pattern sweep) |
| `lib/utils/rate-limiter.js` | pino `module:'RateLimiter'` hot path | ✅ Phase 3 smoking-gun verified 310 calls → 300 allowed / 10 denied / 10 pino entries on UAT pid 897223 (after Finding #10 fix `12a4d6db`) |
| `lib/auth/oauth/mcp-oauth-token-manager.js` | **82 lines, 6 weeks stale** | ✅ OAuth essentials smoke test 9/9 green |
| `lib/auth/oauth/oauth-logger.js` | 56 lines incl. BC42+BC53 security fixes | ✅ structured pino entries firing from `domain:"auth"` adapter |
| `lib/auth/oauth/retry-utils.js` | 31 lines | ✅ OAuth refresh flows functional |
| `lib/auth/oauth/circuit-breaker-utils.js` | 24 lines | ✅ co-deleted with `mcp-oauth-token-manager` (its sole caller) |
| `lib/services/workflow/types/orchestration-params.js` | small | ✅ workflow essentials 17/17 green |
| `lib/events/shared-connection-pool.js` | BC37 NOTIFY validation, BC34 unref fix | ✅ `module:'SharedEventPool'` entries from new pid 877737 |
| `lib/events/execution-events.js` | 125 lines incl. BC34 listener cleanup | ✅ event propagation verified via hub workflow tests |
| `lib/events/prompt-registry-events.js` | 72 lines incl. BC34 listener cleanup | ✅ prompt-registry init fires correctly |
| `lib/validation/mcp-hub-validation.js` | 43 lines | ✅ `registry(action:"register")` green after BC73 regression fix `ca605725` |
| `lib/events/database/dev-query-logger.js` | orphaned transitive (only imported by deleted `lib/prisma.js`) | ✅ directory `lib/events/database/` also removed |

**Infrastructure also removed as part of Phase 2 proper**:
- `.dual-files-allowlist.txt` — deleted (detector now in fully strict mode)
- `scripts/validate-prisma-cjs-parity.js` — deleted (replaced by generalized `detect-dual-files.sh`)
- `package.json:58` — `"mcp:http"` script removed (pointed at deleted `mcp-server-http.js`)

**Total: 13 `.js` files + 1 directory + 3 infrastructure files = 17 items deleted, 2,784 lines removed.**

**Latent drift regressions surfaced during Phase 3 validation (both fixed)**:
- **BC73 regression** (commit `ca605725`, 2026-04-08): `registry(action:"register")` failed with `Cannot read properties of undefined (reading 'checkLimit')` because `service-registration-handler.js:25` imports `{ serviceRegistrationLimiter }` from `rate-limiter`, but the `.ts` source-of-truth never had that export — only the deleted `.js` sibling did. Handler was written against the `.js` symbol. Fix: ported the limiter definition verbatim to `rate-limiter.ts:122-125`. **This is exactly how BC73 eradication was supposed to work**: activate source of truth, let smoke tests surface latent drift, fix it surgically.
- **Finding #10** (commit `12a4d6db`, 2026-04-08): The `367f5d71` rate-limiter pino fix turned out to be in the wrong function — `checkRateLimit()` helper (used only by `api-handler.ts`/Next.js path), not `RateLimiter.checkLimit()` (used by all MCP handlers). For 6+ weeks after `367f5d71` shipped, MCP 429s remained silent end-to-end. Surfaced by the Phase 3 smoking-gun programmatic test. Fix moved `log.warn` into the class method so every caller fires exactly one entry per denial.

| File | Lines of TS-only code shadowed | Has Production JS Callers? |
|---|---|---|
| `lib/prisma.ts` | 5 weeks of edits incl. connection_limit 15→25, pgbouncer fix, pino migration | 14+ JS callers + 255 total |
| `lib/utils/ensure-object.ts` | small | 35 callers |
| `lib/utils/rate-limiter.ts` | pino logging fix from `367f5d71` | 5 callers |
| `lib/auth/oauth/mcp-oauth-token-manager.ts` | **82 lines, 6 weeks stale** | 1 caller (mcp-server-http-clean.js:55) |
| `lib/auth/oauth/oauth-logger.ts` | 56 lines incl. BC42+BC53 security fixes | 5 callers |
| `lib/auth/oauth/retry-utils.ts` | 31 lines | 2 callers |
| `lib/auth/oauth/circuit-breaker-utils.ts` | 24 lines | 1 caller (transitive) |
| `lib/services/workflow/types/orchestration-params.ts` | small | 8 callers |
| `lib/events/shared-connection-pool.ts` | BC37 NOTIFY validation, BC34 unref fix | 2 sync callers (event-system .js files) |
| `lib/events/execution-events.ts` | 125 lines incl. BC34 listener cleanup | 1 dynamic-import caller |
| `lib/events/prompt-registry-events.ts` | 72 lines incl. BC34 listener cleanup | 1 dynamic-import caller |
| `lib/validation/mcp-hub-validation.ts` | 43 lines | 3 dynamic-import callers |

### Sub-categories (all three resolved during eradication)

This bug class had THREE distinct caller patterns, each needing a different fix:

1. **Pure TS-callers**: Webpack handles them at build time. Deletion + ts-node fall-through works once parent process has ts-node registered. ✅ Resolved by Phase 2 proper.

2. **Synchronous JS `require()`**: Bare-Node CJS resolver. Works once parent process has ts-node registered. ✅ Resolved by `a7db9a35` (mcp-server-v5.js) + Phase 2 proper `21d21841` (mcp-server-http-clean.js).

3. **Dynamic `await import('...file.js')`**: ts-node CJS hooks DO NOT cover dynamic ESM imports. ts-node 10.x has a separate `ts-node/esm` loader for this, but it requires Node startup flags. Three files were in this category (`prompt-registry-events`, `execution-events`, `mcp-hub-validation`). ✅ Resolved by **Phase 2.P0.5** (commit `b86b3dec`): converted 6 `await import('./file.js')` call sites across 5 handler files to synchronous `require('./file')` at module load time, so they're covered by the CJS hook and resolve extensionlessly to `.ts` after the `.js` siblings were deleted in Phase 2 proper.

### Detection Command

```bash
# Find any lib/**/*.ts with a .js sibling
bash scripts/detect-dual-files.sh

# Or run via npm script (CI-wired)
npm run validate:no-dual-files

# Demonstrate the resolver behavior empirically
node -e "console.log(require.resolve('./lib/prisma'))"
# Returns: lib/prisma.js (even with ts-node registered!)
```

### Guard Pattern

**For new files**: Don't create `.js` siblings of `.ts` files in `lib/`. The pre-commit hook + CI check enforce this.

**For dual files that are temporarily required** (e.g., ESM dynamic imports that need a `.js` shim until Phase 2.P0.5 lands):
1. Add the path to `.dual-files-allowlist.txt` with a comment explaining why
2. Create a tracking issue/TODO with the deletion criteria
3. Periodic cleanup: run `bash scripts/detect-dual-files.sh --report` to see allowlist + detect stale entries

**For existing dual files**: Follow the dual-TS/JS drift eradication plan at `cline_docs/reviews/dual-ts-js-drift-eradication-2026-04-07/implementation-plan.md`. Three-phase approach:
- Phase 1: Delete files with zero JS callers (zombies, dead pairs)
- Phase 1b: Delete files where webpack handles all callers
- Phase 2: Add ts-node to JS-only entry points (`mcp-server-v5.js`, `mcp-server-http-clean.js`), then delete remaining `.js` files

### Related Lessons

- **`feedback_run_build_before_push.md`** — `npm run lint` doesn't catch webpack require errors; run `npm run build` for server-side require changes
- **`feedback_bare_node_smoke_test.md`** — `npm run build` (webpack) and bare Node resolve extensionless requires *differently*; test with bare-node `require()` before deletions
- **`feedback_health_probe_protocol_semantics.md`** — health probes need protocol semantics; auth-required endpoints return 401 as healthy challenge
- **`feedback_loud_failures_hot_paths.md`** — silent `try/catch` around `require()` on hot paths hides regressions until production behavior surprises someone
- **TODO-RATE-LIMIT-FIX.md** — the bridge regression that originally surfaced this bug class

### Commits

| # | Commit | What |
|---|---|---|
| 1 | `86952012` | Phase 1a — `lib/events/events/` zombie dir deleted |
| 2 | `ddad67b2` | Event-system pre-patches (BC37 NOTIFY validation + BC34 listener cleanup ported `.js` → `.ts`) |
| 3 | `8adc58f0` | Prisma `ensureConnection` shim (legacy API parity) |
| 4 | `e52bb99c` | Drift-prevention infrastructure (detector + hook + CI + allowlist + npm lifecycle) |
| 5 | `485fda9e` | `ts-node` moved from devDependencies to dependencies (Prerequisite 2.P1) |
| 6 | `fac8d913` | Phase 1b partial — 2 files deleted (1 reverted) |
| 7 | `acf7cef9` | Restore `lib/events/shared-connection-pool.js` after deploy failure |
| 8 | `5ba7e80b` | CI `paichart-mcp health gate` (Phase 2.P2) |
| 9 | `a7db9a35` | **Architectural fix**: ts-node registration in `mcp-server-v5.js` (Phase 2.P0 step 1) |
| 10 | `756e27c9` | Health gate fix: accept HTTP 200/401, use `resources/list` probe |
| 11 | `264b5c6e` | Phase 2.P0 step 2 — `mcp-server-http.js` deleted (dead code, 19 KB) |
| 12 | `d3a0d03c` | Phase 2.P0 step 3 — `mcp-embedded-bridge.js` deleted (dead code, 225 lines) |
| 13 | `b86b3dec` | Phase 2.P0.5 — 6 dynamic `await import()` callers converted to sync `require()` across 5 handler files |
| 14 | `21d21841` | **Phase 2 proper** — 13 dual-pair `.js` files deleted, ts-node registered in `mcp-server-http-clean.js`, allowlist removed, validate-prisma-cjs-parity.js removed. 2,784 lines deleted, 17 files touched. |
| 15 | `c7c7aa13` | Phase 2 proper test fix — removed `ensure-object.js`-exists pattern test (it was validating the very dual-file pattern being eradicated) |
| 16 | `ca605725` | **BC73 regression fix** — ported `serviceRegistrationLimiter` to `rate-limiter.ts` (was defined on the deleted `.js` sibling only; handler was written against `.js` symbol) |
| 17 | `12a4d6db` | **Finding #10** — moved `Rate limit exceeded` `log.warn` into `RateLimiter.checkLimit()` hot path; the `367f5d71` fix was in the wrong function |
| 18 | `3687c09d` | Plan v4 docs — Phase 2 proper deployed, Phase 3 validated, 24h UAT soak started with graduation criteria |
| 19 | `207db755` | Phase 3 post-UAT cleanup (5 improvements): `application_name` tagging, drift detector widened to `scripts/` + repo root, `services(discover)` quota counter fix, Finding #11 redundant log removal, `test-ensure-object.ts` refactored to pattern sweep |
| 20 | `0e929b10` | Knowledge purge pass 1 — 10 discovery prompts updated |
| 21 | `e47c8b2b` | Knowledge purge pass 2 — 10 specialist agents updated |
| 22 | `e948bda2` | Knowledge purge pass 3 — 5 pattern docs updated |
| 23 | `54d9bc39` | Knowledge purge pass 4 — 4 harness reference docs updated |

### References

- **Plan**: `cline_docs/reviews/dual-ts-js-drift-eradication-2026-04-07/implementation-plan.md` (v4 — Phase 2 proper deployed + Phase 3 validated + 24h UAT soak in progress)
- **Phase 0 validation**: `cline_docs/reviews/dual-ts-js-drift-eradication-2026-04-07/phase-0-validation.md`
- **Specialist reviews** (6 specialists, parallel): `cline_docs/reviews/dual-ts-js-drift-eradication-2026-04-07/{database-manager,auth-permissions,dev-ops,boundary-contract,event-system,architectural}-review.md`
- **Confidence assessment**: `cline_docs/reviews/dual-ts-js-drift-eradication-2026-04-07/confidence-assessment.md`
- **Bridge regression context**: `.claude/knowledge/domain/harness/TODO-RATE-LIMIT-FIX.md` (updated 2026-04-08 to reference BC73 + Finding #10)
- **Stress test validation**: `cline_docs/stress-test-2026-04-08-tier1-restored.md`
- **Whitepaper §4.7/§4.8 follow-up**: `.claude/knowledge/domain/harness/WHITEPAPER-ARXIV-v3.md`

---

## Bug Class 74: Harness Mode Mis-Classification Under Budget Exhaustion

**Status**: ERADICATED 2026-04-26 (resolver shipped Deploy 1 commit `11ec450f`; protocol prose Deploy 2 commit `215840e4`)
**Severity**: MEDIUM (quality-of-life, not data integrity — children unaffected)
**Discovered**: 2026-04-15 during Apr 2026 harness production observability
**Resolved**: 2026-04-26 via `lib/services/harnessModeResolver.ts`

### Description

The Pipeline Harness LLM detected its own execution mode (CREATE / ORCHESTRATE / SYNTHESIZE) by reading `task.metadata.pipelineStageId` and the state of the child stage via tool calls. Detection logic lived in protocol prose. When the harness was invoked but token budget was exhausted (or transient MCP failure), it could not make tool calls to read its own metadata. The agent guessed mode wrong and produced artifacts saying "first-run attempt" on tasks with live children.

### Root Cause

Load-bearing fact (mode) was sourced from agent-side tool calls. Per the 30%-baseline empirical finding (`prompt-construction-specialist.md:297`), agent compliance with protocol-mandated extra steps is materially below 100% — and under degraded conditions (budget exhaustion), tool-call success drops to near-zero. The agent's mode-detection prose became unrunnable exactly when it would matter most.

### Symptom

```
// Production execution cmo10q2fx005yyxlaojiei0in (Apr 2026):
// Harness logs SUCCESS (engine-level) but artifact's finalResponse says
// "no pipeline state created, token budget exhausted" with mode="CREATE"
// even though the task already had pipelineStageId set + 4 live children.

// Documented at pipeline-harness-specialist.md:517-518:
// "Confusing but non-destructive (children have already run via earlier
//  executions). Triage: look for finalResponse containing 'first-run attempt'
//  on tasks with pre-existing metadata.pipelineStageId + live child tasks."
```

### Frequency

3 occurrences in 30 days (2026-03-26 to 2026-04-26) — confirmed via:
```sql
SELECT COUNT(*) FROM agent_artifacts
WHERE name LIKE '%pipeline-index%'
  AND content::text ~ 'first.run|no pipeline state|token.budget'
  AND "createdAt" > NOW() - INTERVAL '30 days';
-- Result: 3
```

### Resolution: Trust-Direction Shift (3rd Application)

`lib/services/harnessModeResolver.ts` (NEW 2026-04-26) — the engine pre-resolves mode from DB state via Prisma BEFORE the LLM turn starts and injects it into the system prompt as a `## Harness Context (Platform-Resolved)` block. The agent reads it; the agent does not detect.

Same trust-direction shift as the harness clobber-detection back-pointer (commit `8f225353`) and the original engine-owned task lifecycle. Pattern: load-bearing facts move from "agent observes/reports" to "platform records."

### Defense Stack Position

The `resolvedMode` + `resolvedReasonCode` fields on `pipeline-index.json` artifact joined the agent-output-trustworthiness defense stack as the 7th signal type (alongside `protocolValidation`, `executionDegradation`, `errorCategory`, `commentValidation`, `qualityMetrics`, `confidenceScore`).

### Verification

End-to-end UAT validation 2026-04-26 (executions `cmof11ebw0009yx1t95mx2icx` + `cmof144ki002lyx1trgojvctd` + `cmof6izk20007yxbs0uqxvraf` + `cmof6l6g9001myxbt62m4rhvl` on POV `cmns837i60001yxs1k2ik1xta`): 4/4 resolver firings correct (CREATE × 2, SYNTHESIZE × 2), 0/3 V.10 forensic disagreement with post-execution validator. Crucially, Run 2 CREATE produced an artifact with `protocolValidation = null` (clean run, validator returned null) but `resolvedMode = 'CREATE'` correctly populated — exactly the failure mode the resolver was designed to fix.

### Why This Matters Generally

Bug Class 74 is the first concrete instance where the absence of a defense (mode info missing entirely from the artifact under degradation) was as harmful as a wrong defense. Other bug classes guard against incorrect data; this one guards against missing data under degraded conditions. The lesson generalises: defense stacks need at least one signal that's authoritative regardless of agent compliance — not just multiple signals that all depend on agent compliance succeeding.

### References

- **Implementation plan + 5-specialist + 3-specialist re-review**: `cline_docs/reviews/mode-detection-out-of-llm-turn-2026-04-26/`
- **Resolver source**: `lib/services/harnessModeResolver.ts`
- **Engine integration**: `lib/services/agentExecutionEngine.ts:660-670` (resolver call), `:2034-2049` (HarnessContext block injection)
- **Stream-route mirror**: `app/api/pov/agent/execute/stream/route.ts:435-451`
- **Protocol prose**: `scripts/seed-protocol-prompts.ts:131-160` (Mode Detection block, post-Deploy-2)
- **Tests**: `scripts/test-harness-mode-resolver.ts` (8 cases, real-DB integration), `scripts/test-mode-resolver-injection.ts` (20 cases, source-read parity)
- **Specialist file context**: `pipeline-harness-specialist.md` § 1 (Three-Mode Execution Model — platform-resolved note)
- **Pattern lineage**: `agent-output-trustworthiness-defense-stack-pattern.md` (7th signal), `dual-execution-path-parity-pattern.md`, `prompt-section-ownership-pattern.md`

---

## Bug Class 75: Phantom Canonical (Canonical Bypassed by Hand-Rolled Caller)

**Status**: ERADICATED 2026-05-14 (4 instances eradicated; structural defenses propagated to 7 specialists + 3 discoveries; unaudited surfaces swept; 20 dual-layer tests locking the cycle-detection layer)
**Severity**: HIGH (silent data-shape drift, can mask security/feature regressions for weeks)
**Discovered**: 2026-05-02 (POV editor dependencies bug)
**Pattern doc**: `.claude/knowledge/patterns/two-execution-path-drift-pattern.md` §Phantom Canonical Variant (CONFIRMED 75% confidence, 4 instances)

### Description

A file (a canonical schema select, a constants module, a validation schema) is exported with a load-bearing name like `fullPOV`, `FIELD_LIMITS`, `UpdatePOVSchemaInline`. Downstream code imports it. But the actual production code path **hand-rolls its own select / numbers / schema** that diverges from the canonical. The canonical file *looks* like the source of truth but isn't — anyone auditing it concludes "the wire carries field X" without grepping the runtime call site.

### Root Cause

N+1 optimizations (or refactors generally) rewrite the production query/schema with a literal-object expansion that drops fields the canonical includes. The optimization rollback comment (e.g. `// OLD CODE: include: fullPOV.include`) is left in the file — visible documentation that the canonical was deliberately bypassed, but only visible if you read the service file. Audits that read the schema file alone never see it.

### Symptom

Six independent specialists audited `lib/pov/prisma/select.ts:fullPOV` on 2026-05-02 and concluded "the wire carries `dependencies`". None grepped `prisma.task.findMany` in `lib/pov/services/pov.ts`. The actual `PoVService.get()` had been rewritten with a hand-rolled `select` that stripped `dependencies` and `dependents`. Client-side fixes shipped first (commits `0215b8c0`, `d5d5b617`) had zero effect — the wire never carried the data. Fix landed in `8d256992`.

A second sub-variant: the dead schema declared in a block comment (`/* UpdatePOVSchemaInline = ... */` at `lib/pov/handlers/put.ts:265-364`) misled three additional fix attempts (`5a8ae62b`, `2543ef1b`) when their edits landed inside the comment block. The bug only resolved when `5405c964` edited the actual validation site in `lib/validation/pov.ts:183`.

### Confirmed Sites (5 — all eradicated)

| # | Site | Phantom canonical / drift | Fix commit |
|---|------|---------------------------|------------|
| 1 | `lib/pov/services/pov.ts:.get()` | Imported `fullPOV` but hand-rolled select stripped dep edges | `8d256992` |
| 2 | `lib/validation/field-limits.ts` (whole file) | Existed for this exact bug class; zero importers until 2026-05-13 | `5405c964` + `b67169eb` |
| 3 | `lib/pov/handlers/put.ts` | `UpdatePOVSchemaInline` declared in a 95-line block comment; not the active schema | `5405c964` (real site) + `bc60a6bb` (dead code removed) |
| 4 | `lib/tasks/services/task.ts:getTasksWithContext` | Dependency edge select stripped `id`, `createdAt`, `dependsOn.stageId` | `db231807` |
| 5 | `agentExecutionEngine.ts` vs `stream/route.ts` `resultJson` construction | Dual-path inline construction with **5 sub-site drifts**: hardcoded `30` for hitMaxTurns, `0` for tokensUsed, raw vs resolved agentRole, executionTime, diagnosticRetryUsed | `e480a5c0` (extracted shared `buildExecutionResultJson` helper) |

**Note on instance #5**: This is the harness-side variant of the bug class. Not a "phantom canonical schema bypassed" exactly — instead, **inline duplicate construction across two execution paths** with no shared canonical to bypass. The remediation creates the canonical that didn't exist before. Documented in `.claude/knowledge/patterns/dual-execution-path-parity-pattern.md` (98% → 99% confidence after this fix).

### Shared Defense

1. **Extract narrow shared constants for stable shapes** — `taskDepsSelect` in `lib/tasks/prisma/select.ts` is spread into both `taskFullSelect` and the optimized `PoVService.get()`. Drift on the dep-edge shape becomes structurally impossible.
2. **Adopt the shared `FIELD_LIMITS` constants** — `lib/validation/field-limits.ts` is now imported by `lib/validation/pov.ts`, `agent-template-validation.ts`, `kpi-validation.ts`. 32 sites converted to named constants. Bumping a field limit propagates to all callers automatically.
3. **Propagate the audit step to specialists** — three specialist agents (`api-efficiency-specialist`, `boundary-contract-specialist`, `database-manager-specialist`) gained a Critical Audit section instructing them to grep `prisma.X.find*` in services in addition to reading the canonical schema file.
4. **Propagate the audit step to discoveries** — three discovery prompts (`boundary-response-shape-discovery`, `api-efficiency-discovery`, `database-management-discovery`) gained "Phantom Canonical Audit" sections with concrete grep recipes.
5. **Locking tests** — `scripts/test-task-dependencies.ts` (20 tests, dual-layer) verifies the editor's cycle-detection selector layer and that no duplicate definitions exist.

### Audit Sweep Results (2026-05-14)

**Service-layer files** (4 files with `N+1 OPTIMIZED` / `OLD CODE` markers):
- `lib/services/mcp/contextManager.ts` — short inline doc comment only, NOT phantom canonical (no canonical import). No action needed.
- `lib/services/mcp/resourceManager.ts` — same. No action needed.
- `lib/tasks/services/taskSearchService.ts` — had a 39-line dead block comment with legacy function body. **Removed** (same hazard class as the `UpdatePOVSchemaInline` we removed in `bc60a6bb`).
- `lib/tasks/services/taskActivityService.ts` — had a 24-line dead block comment. **Removed**.

**Validation files** (13 files swept to FIELD_LIMITS adoption):
- `pov.ts`, `agent-template-validation.ts`, `kpi-validation.ts` (earlier — `b67169eb`)
- `task-validation.ts`, `phase-template-validation.ts`, `pov-template-validation.ts` (`b4fdb7e8`)
- `mcp-hub-validation.ts`, `activity-validation.ts`, `prompt-library-validation.ts`, `mcp-tools-validation.ts`, `settings-validation.ts`, `admin-user-validation.ts` (`b5e2645b`)
- `crm-validation.ts`, `mcpServerValidation.ts`, `user-validation.ts` (this commit)

**Multi-line inline chains in `lib/validation/pov.ts`** (8 sites with custom `.refine()` messages):
- DEFERRED — these have custom error messages and complex chains. Their `.max()` values are well-known (titles 500, descriptions 5000, objective 2000, notes 500). Migration is opportunistic — convert when next touching those schemas.

**Remaining lower-impact files NOT swept** (mostly numeric maxes, framework-level, or already aligned):
- `mcp-action-validation.ts` — has its own `RichTextField`/`SimpleTextField` helpers; aligned by design
- `mcp-resources-validation.ts` — 1 site, numeric
- `mcp-automations-validation.ts` — mostly numeric (memory/cpu limits, retry counts)
- `dashboard-validation.ts`, `notification-validation.ts`, `support-validation.ts` — small files, mostly numeric or have custom secureText helpers
- `input-validation-framework.ts` — defines its own ValidationSchemas with custom regex chains

### Task-Action Handler Sibling Drift — UPGRADED INVENTORY (2026-05-16)

**Status**: 10 enumeration sites identified across 5 files. ALL ALIGNED post-2026-05-16.

The original entry (2026-05-15 hotfix in commit `9a342f73`) cited 3 sites. Post-deploy audit by mcp-tool-architecture-specialist + mcp-hub-specialist (2026-05-16) found the count was significantly undercounted — actual is **10 enumeration sites**, of which 4 are strict-gating, 4 are runtime classification/dispatch, and 2 are cosmetic/discovery.

**Full inventory** (any drift in any of these 10 sites = potential silent failure):

| # | File:Line | Role | Severity if drifted |
|---|-----------|------|---------------------|
| 1 | `lib/validation/mcp-action-validation.ts:188-203` `ALLOWED_MCP_ACTIONS` | REST API entry validation | P0 — REST 400 |
| 2 | `lib/validation/mcp-action-validation.ts:267+` `MCPParameterSchemas` map keys | Router safeParse lookup keys | P0 — silent dispatch without schema (router falls through to dispatch with raw params) |
| 3 | `lib/mcp/server/config/tool-schemas.js:206-211` perform action enum | LLM-facing tool surface | P0 — tool unreachable for AI clients |
| 4 | `lib/mcp/server/tools/advanced/task-action-handler.js:150-154` `validActions` | Handler entry gate (both external + embedded transports converge here) | P0 — both MCP paths blocked |
| 5 | `lib/mcp/tasks/action/tasks-action-router.ts` switch cases | Router dispatch | P0 — falls to "Unsupported action" |
| 6 | `lib/services/mcp/recommendation-action-mapper.ts:59-64` `PERFORM_ACTIONS` | Recommendation routing | **P1 — silent no-op fall-through** (route to service_call which is a stub) |
| 7 | `lib/services/mcp/recommendation-action-mapper.ts:67` `HIGH_RISK_ACTIONS` | Approval gating | **P1 — bypasses approval flow for high-risk actions** |
| 8 | `lib/mcp/tasks/action/utilities/mcp-logging.ts:21-36` `ACTION_SERVICE_MAP` | Logging service routing | P2 — analytics misroute |
| 9 | `lib/mcp/tasks/action/utilities/mcp-logging.ts:62-75` action→verb map | Activity logging taxonomy | P2 — analytics cosmetic |
| 10 | `lib/mcp/server/tools/advanced/error-helpers.js:19-23` `TASK_ACTIONS` | "Did you mean" fuzzy suggestion in error messages | P2 — stale error help |

**Note**: `MEDIUM_RISK_ACTIONS` at `recommendation-action-mapper.ts:70-73` is a partition of #6; pov.update is HIGH (#7), so MEDIUM is intentionally not extended.

**The verification grep updated for the corrected count**:
```bash
# All 5 files that gate or classify MCP actions. pov.update should appear in
# 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 across these files (each file may
# have multiple sites).
grep -rn "'pov\\.update'\\|\"pov\\.update\"" \
  lib/validation/mcp-action-validation.ts \
  lib/mcp/server/config/tool-schemas.js \
  lib/mcp/server/tools/advanced/task-action-handler.js \
  lib/mcp/server/tools/advanced/error-helpers.js \
  lib/mcp/tasks/action/tasks-action-router.ts \
  lib/mcp/tasks/action/utilities/mcp-logging.ts \
  lib/services/mcp/recommendation-action-mapper.ts
```

If any file returns zero hits, that site is drifting. Audit MUST run before merging any new MCP action.

**Detection lesson**: the original "3 sites" count was based on what surfaced during the immediate deploy-smoke discovery. The full count emerged only after explicit cross-domain specialist audits (tool-arch + mcp-hub) — neither alone caught the full picture. Future BC75-class audits should commission BOTH specialists in parallel for the full enumeration.

**Public spec impact**: `gold-standards-spec.md` GS14 v1.1 cited "3-location allowlist" as the canonical example. Needs v1.2 amendment to cite the 10-site real count.

---

### POV.competitors Sibling Drift — RESOLVED (2026-05-15 evening)

Discovered during the pov.update spec review (val-engine round 2). Same drift class as the Task-Shape work below: same Prisma field validated by sibling schemas, inconsistent injection refines.

| Schema | File:line | Pre-fix state | Post-fix state |
|--------|-----------|---------------|----------------|
| `CreatePOVSchema` (REST POST) | `pov.ts:267-270` | ✅ refine present (each element `.refine(detectPromptInjection)`) | unchanged |
| `CreatePOVDirectPathSchema` (REST direct path) | `pov.ts:338-342` | ✅ refine present | unchanged |
| `UpdatePOVSchemaComprehensive` (REST PUT) | `pov.ts:148` | ❌ NO refine — bare `z.string().max(NAME)` | ✅ refine added |
| `MCPParameterSchemas['pov.update']` | `mcp-action-validation.ts` (added 2026-05-15) | ❌ inherited the REST Update gap | ✅ refine added in same commit |

**Phase 0 (2026-05-15)**: 17 prod POVs total, 10 have competitor values. All clean vendor names ("Palo Alto Networks", "Fortinet", "Check Point", "Cisco", "Microsoft", etc.). Zero retro-breakage risk from adding the refine.

**Resolution**: same `detectPromptInjection` refine added to both Update side and MCP pov.update. Layer 2 smoke tests in `test-pov-update-route.ts` (Layer 2.11) and `test-mcp-pov-update.ts` (Layer 2.23) lock the closure against future drift.

**Detection**: this drift was caught during val-engine's pov.update review by an explicit cross-schema diff for each shared field. The same audit step is recommended for any future `pov.*` MCP action that exposes a field also validated by the REST CreatePOV or UpdatePOV schemas.

### Task-Shape Sibling Drift — ALL 5 instances FIXED (2026-05-15)

Task-schema convergence review (3 specialists: validation-engine, architectural-review, types-system) surfaced **5 fields where `CreateTaskSchema` / `UpdateTaskSchema` / `NestedTaskInputSchema` validated the same Prisma `Task` column with non-equivalent validators**. After Phase 0 production queries + a codebase grep audit on 2026-05-15 confirmed safety, **all 5 instances were fixed in two consecutive bookkeeping commits**.

| # | Field | Drift type | Pre-fix (Create/Update) | Phase 0 / grep finding | Resolution |
|---|-------|-----------|------------------------|----------------|-----------|
| 1 | `type` | Enum source | `z.string().max(LABEL)` (free-form) | All 3 prod values (ACTION, MILESTONE, PIPELINE) in `PrismaEnum.taskType` (7 values) | **FIXED** — converged to `PrismaEnum.taskType` |
| 2 | `executionStatus` | Enum source + **fake value** | `z.enum(['PENDING','RUNNING','COMPLETED','FAILED'])` | Prod has `SUCCESS`+`FAILED`; hardcoded enum had fake `COMPLETED` (TaskStatus value, not ExecutionStatus) and missed 5 real values (READY, PENDING_REVIEW, REVIEW_APPROVED, REVIEW_REJECTED, SUCCESS) | **FIXED** — converged to `PrismaEnum.executionStatus` |
| 3 | `maxRetries` | Bounds asymmetry | `0-100` | All 394 rows = default 3; no row near either cap | **FIXED** — converged to `0-10` (conservative; matches NestedTask) |
| 4 | `timeout` | Bounds asymmetry | `0-600000` (10min) | 17 non-null rows; max = 300000 (5min); no row near either cap | **FIXED** — converged to `0-3600000` (1hr; matches NestedTask, allows legitimate long-running agent workflows) |
| 5 | `metadata` / `outputArtifacts` | Null handling (semantic) | `safeRecord().nullable().optional()` (preserves null) | **Codebase grep finding**: zero internal callers send these fields nulled to task POST/PUT endpoints. UI components construct curated bodies (TaskCreate, TaskEditDialog, TaskEditor — none include metadata/outputArtifacts). MCP handlers + execution engine write directly to Prisma, bypassing Zod entirely. Defensive code at `lib/pov/handlers/put.ts:544-555` proves the comprehensive PUT path was already designed around null→undefined semantic. | **FIXED** — converged to `FormField.optional(safeRecord())` matching NestedTask's null→undefined transform |

**Phase 0 surprise finding**: instance #2 was a *second*, separate bug beyond the BC75 sibling drift. The hardcoded Zod enum had a **fake value** (`COMPLETED` is `TaskStatus`, not `ExecutionStatus`) and was missing **5 real values**. Anyone trying to PUT `executionStatus: "SUCCESS"` or `"READY"` would have been rejected with a 400 even though Prisma accepts those. Anyone sending `"COMPLETED"` would have gotten a 500 from Prisma instead of a 400 from Zod. The convergence fixed both classes simultaneously.

**Intentional non-equivalences (not bugs, documented for completeness)**:
- `status` / `priority` — Create has `.default()`; NestedTask required; Update optional. Three different endpoint contracts.
- `dueDate` — NestedTask accepts `Date` objects + preserves null (BC76 site #7 null-clear flow + future MCP); Create/Update enforce ISO string + transform null→undefined.
- `inputContext` — NestedTask union `string|safeRecord` (MCP transport blob support); Create/Update `safeRecord` only.
- `title` — different `.max()` values (NestedTask 500 vs Create/Update FIELD_LIMITS.NAME). Investigate DB column width before any future merge.

**Adjacent finding 1 (RESOLVED 2026-05-15)**: Two `OptionalCUID` exports existed with different semantics —
- `lib/validation/form-field-patterns.ts:112` — `.nullable().transform(null→undefined)` (form-friendly)
- `lib/validation/id-validation.ts:30` — `.optional()` only (strict; rejects null)

Both were intentionally used in different domains (form schemas vs bulk/action schemas) but the identical name was a latent footgun — a future author could import the wrong one and silently make a form schema reject `{ foo: null }` payloads.

Resolution: id-validation.ts's `OptionalCUID` renamed to `OptionalCUIDStrict` (and `NullableCUID` → `NullableCUIDStrict` for consistency). 5 caller files updated (task-validation, pov, agent-template-validation, activity-validation, app/api/mcp/recommendations/route). JSDoc cross-references added at both export sites explaining when to use each. Zero behavior change; name now forces explicit semantic choice at every import.

**Adjacent finding 2 (RESOLVED 2026-05-15)**: `UpdateTaskStatusSchema` at `lib/validation/task-validation.ts:171` was a 4th task-shape variant not named in the convergence review (status-transition endpoint with blockReason/notes audit fields + "BLOCKED requires reason" business rule). The 2026-05-14 P1 injection-refine work had already caught it.

Resolution: added a task-shape inventory header block at the top of `task-validation.ts` listing all 4 variants (CreateTask, UpdateTask, UpdateTaskStatus, NestedTaskInput) with use-case summaries and pointers to the OptionalCUIDStrict / FormField.optionalCUID / PrismaEnum helpers. Forces future task-shape work to inventory all variants before adding a new field. Documentation only; no behaviour change.

**How instance #5 was resolved without logging**:
The deferral assumed we couldn't decide without production audit logs. A codebase grep on 2026-05-15 lifted the deferral by proving the internal blast radius was zero:
- **UI senders**: `TaskCreate.tsx`, `TaskEditDialog.tsx`, `TaskEditor.tsx` all construct explicit field-subset bodies. None include `metadata` or `outputArtifacts`. Local form schema at `TaskCreate.tsx:51-61` is 8 fields — neither is among them.
- **MCP task handlers** (`task-update-handler.ts`, `task-complete-handler.ts`): bypass the Zod API entirely; merge metadata via direct Prisma writes.
- **Agent execution engine** (`agentExecutionEngine.ts`, `workflowEngine.ts:492`): writes `outputArtifacts` as structured data via Prisma, never `null`.
- **The two `metadata: null` grep hits**: `formatters.js` default parameter (function signature, not write); `test-report-md-decision.ts` test fixtures modeling *Prisma read results*.

External API client behaviour remained unknown but the priors flipped: the only way to exercise the drift is for an external REST client to send `{ metadata: null }` or `{ outputArtifacts: null }` to Create/Update endpoints. Likely vector is accidental round-trip of the whole task object (REST library serializing JS null properties as JSON null) — in which case the convergence to NestedTask's transform is *defensive* (preserves existing data), not destructive.

Smoking gun: `lib/pov/handlers/put.ts:544-555` carries a block of defensive null-preservation assignments (`updateData.agentRole = task.agentRole === null ? null : task.agentRole;`) that have been unreachable since the NestedTask schema transformed nulls. Evidence the author originally intended null-preservation but the schema-level transform short-circuited it. The convergence aligns API and DB semantics with what the comprehensive PUT path has been doing in practice.

**Test coverage post-fix**:
- `npm run test:enum-parity` (56 tests) — confirms Prisma↔Zod enum alignment, including `taskType` and `executionStatus`
- `npm run test:pov-update-route` (37 tests) — Layer 2.5 verifies executionStatus survives Zod validation; Layer 2.8 verifies `task.type` enforces TaskType enum (no free-form strings)
- `npm run test:all-validation` (full suite) — all 50+ tests pass after convergence

**Review artifact**: `cline_docs/reviews/task-shape-convergence-2026-05-15/` — 3 specialist reviews, corrected field-overlap matrix, synthesis. Phase 0 results and convergence commit shipped 2026-05-15.

### Consolidated-Tool Param Sibling Drift — `project` status + priority (2026-05-31)

New variant of the family: a **consolidated tool** (`project`, `perform`, `analytics`) routes several actions through **one** param schema, and that single Zod gate disagreed with a per-action handler's actual accepted set. Surfaced organically while fixing a `DEMO-mcp-platform` demo step; a follow-up sweep of consolidated-tool gates vs handler `valid*` arrays bounded the blast radius.

| # | Tool / param | Drift type | Symptom | Resolution | Commit |
|---|--------------|-----------|---------|-----------|--------|
| 1 | `project` `status` (task.list) | Gate too **narrow** — bound to `povStatusSchema` (POV enum) but `handleListTasks` accepts task statuses | `status:"OPEN"` on task.list passed schema-bind for POV yet was rejected pre-handler (Zod enum 400) even though the handler was always built to filter tasks by it | Widened gate to `projectStatusFilterSchema` = **POVStatus ∪ TaskStatus**; per-action validity stays in the handlers (`handleListPOVs` / `handleListTasks`). Drift-guard: union set-equality assertion in `test-enum-parity` | `f878e482` |
| 2 | `project` `priority` (task.list) | Gate deliberately **wide** (`prioritySchema` = `Priority`, URGENT-inclusive, Wave C CSD-1) but `handleListTasks` rejected URGENT while `perform task.create/update` **normalize** it | `priority:"URGENT"` passed the gate, then the task.list filter 400'd — the lone sibling that rejected instead of normalizing | Mirrored the create-handler `PRIORITY_ALIASES` map in `handleListTasks` (URGENT/CRITICAL→HIGH, NORMAL→MEDIUM, MINOR/TRIVIAL→LOW); filter now normalizes + forwards normalized value. **Schema untouched** (Wave C decision preserved) | `3d88ce32` |

**Sweep result (2026-05-31)**: every other consolidated-tool candidate is benign — `perform` priority normalizes, `prompt list` category aliases+validates, `task-action` `validActions` already matches the action enum (the original BC75 site above). **Net new open sites: 0 after these two fixes.** Under the threshold for a standalone eradication campaign — recorded here as a family instance.

**Root-cause note**: `lib/mcp/server/config/tool-schemas.js` can't use `z.nativeEnum()` (loads from both webpack and bare-Node), so it uses hardcoded `z.enum([...])` literals — the exact breeding ground for this drift. See `patterns/native-enum-pattern.md` § "Consolidated-Tool Params: Per-Action Enum" for the principle + the bare-Node caveat. **Detection**: sweep each consolidated tool's param schema against the handlers' `valid*` arrays; treat each mismatch as a candidate (some are intentional subsets, e.g. `analytics-response ['HIGH','MEDIUM']`).

### Detection Commands

```bash
# 1. Service files importing canonical selects — phantom-canonical candidates
grep -rn "from.*prisma/select" lib/*/services/ --include="*.ts"

# 2. Optimization rollback markers (high-confidence signal)
grep -rn "OLD CODE\|commented for rollback\|N+1 OPTIMIZED\|optimized version" lib/ --include="*.ts"

# 3. Heuristic: file imports canonical but uses literal-object select
# (Pseudo-code — manual cross-reference)
# For each service file:
#   - grep for "from.*prisma/select" (does it import canonical?)
#   - grep for "prisma\.\w+\.findUnique\|findMany\|findFirst" (does it query?)
#   - read the select clauses — do they reference the canonical or hand-roll?

# 4. Validation-layer: find hardcoded .max(N) outside FIELD_LIMITS
grep -rn "\.max([0-9]\+)" lib/validation/ --include="*.ts" | grep -v "FIELD_LIMITS"

# 5. Dead block comments containing schema declarations (the put.ts case)
grep -rn "/\* .* = z\.object" lib/ --include="*.ts"
```

### Reactive Detection Mechanism (How Future Instances Get Caught)

The bug class is protected REACTIVELY (when an audit runs) rather than PROACTIVELY (no scheduled sweep). The mechanism (post-2026-05-14 expansion):

**7 specialist agents now carry the audit step:**
- `api-efficiency-specialist` — Critical Phantom Canonical Audit section
- `boundary-contract-specialist` — Critical Phantom Canonical Field Leakage section
- `database-manager-specialist` — Phantom Canonical Audit grep block
- `types-system-specialist` — Critical Phantom Canonical Audit section (added 2026-05-14)
- `validation-engine-specialist` — Critical Phantom Canonical / FIELD_LIMITS Drift Audit (added 2026-05-14)
- `architectural-review-specialist` — Phantom Canonical Variant Pattern review checklist (added 2026-05-14)
- `performance-analyst-specialist` — Critical "N+1 Optimizations Create Phantom Canonicals" section (added 2026-05-14)

**3 discovery prompts carry the audit recipe:**
- `boundary-response-shape-discovery` — Boundary 6 with 4 detection greps
- `api-efficiency-discovery` — Step 2a Phantom Canonical Check
- `database-management-discovery` — §4e Phantom Canonical Select Audit

**Triggers:**
- Any future invocation of one of the 7 specialists runs the Critical Audit section
- Anyone running one of the 3 discoveries (directly or via discovery-scout) executes the phantom-canonical grep recipe
- Future data-shape bug reports route through these specialists and the audit fires automatically
- Future N+1 optimization PRs trigger architectural-review + performance-analyst, both of which now have the variant in their checklist

**Limitation**: Still no proactive scheduled scan. Mitigations available if proactive protection is wanted: CI lint rule, scheduled remote-agent audit, or quarterly sweep session.

### Commits

- `8d256992` (May 2) — Service-layer dep select fix (instance 1)
- `5405c964` (May 13) — Actual validation site fix (validation drift)
- `bc60a6bb` (May 14) — Dead UpdatePOVSchemaInline removal (instance 3)
- `b67169eb` (May 14) — FIELD_LIMITS adoption sweep (instance 2)
- `db231807` (May 14) — Task service dep edge alignment (instance 4)
- `0bcad0ef` (May 12) — Pattern propagation to 3 discoveries + 3 specialists
- `e7ae8ebd` (May 14) — Locking tests for cycle-detection selector layer

### References

- **Pattern doc**: `.claude/knowledge/patterns/two-execution-path-drift-pattern.md` §Phantom Canonical Variant
- **Followups + session timeline**: `cline_docs/types-cleanup-followups-2026-05-13.md`
- **Survey**: `cline_docs/type-drift-survey-2026-05-02.md` (initial pre-cleanup inventory)
- **Memory**: `feedback_phantom_canonical_audit.md` (Claude-side detection heuristic)

---

## Bug Class 76: Validation Bypass via Post-safeParse Raw-Body Read

**Status**: ERADICATED 2026-05-15 (**7 confirmed instances** fixed atomically across three sweep passes; 106 safeParse callers swept; **188 dual-layer tests** locking the bug class; pattern hardened in `detectPromptInjection`)
**Sweep history**:
- Initial sweep (2026-05-14) declared ERADICATED at 3 instances.
- Protocol 4 (Endpoint Security Audit) commissioned same session surfaced **3 more sites in `lib/*/handlers/`** that the initial sweep missed (grep scoped to `app/api/`).
- Protocol 2 (Specialist Review) on the remaining "partial-BC76" site at `lib/pov/handlers/put.ts` (2026-05-15) — 4 specialists + Phase 0 production validation + arch-review final gate — surfaced **1 more site (#7)**: the comprehensive POV update path read nested array elements and team-management side-fields from raw `requestData`, bypassing detectPromptInjection refines on `task.title`/`description`/`prompt`/`agentRole`/`agentLog`/`inputContext`. Phase 0 confirmed live LLM-context exposure (164 tasks have executionStatus, 190 have agentRole, 17 use modelParameters routing).
- **Lesson**: bug-class sweeps must cover route AND handler layers; specialists must run discovery-first; pre-edit confidence numbers can hide silent recommendation drops — Steve's "Specialist recommendation coverage audit" feedback caught 3 sec-ops-named refines silently missing from the consolidated plan.
**Severity**: P1 (silent validation bypass on hot paths — every `.refine()`, `.transform()`, and unknown-key strip in the schema is skipped; refines on text fields are the primary attack vector since they carry stored-XSS / prompt-injection defense)
**Discovered**: 2026-05-14 (sec-ops audit of POST /api/pov direct-create path while reviewing the InjectionSafeOptional helper)
**Sister bug class**: BC75 (Phantom Canonical) — both produce a "validation appears present but isn't running" effect. BC75 is a *schema*-level bypass via shape divergence; BC76 is a *runtime*-level bypass via reading the wrong variable.

### Description

The handler validates via `Schema.safeParse(rawInput)`, gates on `validation.success`, and then **reads raw input downstream instead of `validation.data`**. The safeParse acts as a 400-gate only; its parsed output is silently discarded. Every Zod side effect is bypassed:

- `.refine(...)` validators (e.g. `detectPromptInjection`) — never inspect the data that actually reaches business logic
- `.transform(...)` callbacks (e.g. `stripDangerousKeys`, null → undefined coercion) — never run
- Default unknown-key strip — raw extra fields reach Prisma writes
- Schema-coerced types (e.g. `z.coerce.boolean()`) — raw strings reach handlers

### Root Cause

Three coupled patterns make this easy to write and hard to spot in review:

1. **Variable naming inertia**: the handler already destructured `const body = await request.json()` before adding validation. After `safeParse(body)`, the reviewer's eye sees `body` is "the input" and reads from it without thinking about which variable Zod actually populated.
2. **`as any` cast on `filteredData`** (the POV case): a convenience cast for "all the fields we read" makes the validated-vs-raw distinction invisible in the source.
3. **Couples with schema-completeness gap**: even if the reviewer notices the bypass and swaps `body` → `validation.data`, fields used by the handler but undeclared at the schema top level get silently stripped. **Bugs 1 and 2 must ship atomically** — fixing one without the other silently NULLs database columns.

### Symptom

The handler ships with `safeParse` and a comment-laden 400-gate, looking thoroughly validated. Static review of the schema confirms refines / transforms are present. But a malicious payload reaches the database verbatim — only the `.success` boolean influenced control flow.

In the POV case (`app/api/pov/route.ts:546`): six text fields (`objective, customerContact, partnerName, partnerContact, solution, opportunityName`) were never declared in `CreatePOVSchemaInline`'s top level, so their refines lived only in `formData` (template path). The direct path read them raw. `objective` *persisted* in production only because of this bug — the schema would have stripped it.

### Confirmed Sites (6 — all eradicated)

| # | Site | Bug | Fix commit |
|---|------|-----|------------|
| 1 | `app/api/pov/route.ts:546` POST /api/pov direct-create | `safeData = filteredData as any` after `CreatePOVSchema.safeParse`; 9 fields undeclared at top level; `customerName` declared without refine | `8f883324` |
| 2 | `app/api/pov/[povId]/phase/[phaseId]/stage/route.ts:114` POST stage | `const { name, order, ... } = body` after `CreateStageSchema.safeParse`; transient hints (`afterStage`/`beforeStage`/`position`) undeclared; `description` declared without refine | `96ae7ad0` |
| 3 | `app/api/pov/[povId]/phase/[phaseId]/stage/route.ts:361` PUT stage | `const { name, description, order } = body` after `UpdateStageSchema.safeParse` | `96ae7ad0` |
| 4 | `lib/tasks/handlers/task.ts:80` createTaskHandler | `const { povId: _, phaseId: __, ...safeData } = data as any` after `CreateTaskSchema.safeParse`; **19 fields the handler reads were undeclared** in CreateTaskSchema (incl. `prompt`/`inputContext`/`agentRole`/`metadata` — the LLM-context attack surface) | (this commit) |
| 5 | `lib/tasks/handlers/task.ts:172` updateTaskHandler | Raw `data` passed to `TaskService.updateTask(taskId, data, …)` after `UpdateTaskSchema.safeParse`; same 19 agent-execution fields undeclared in UpdateTaskSchema | (this commit) |
| 6 | `lib/tasks/handlers/post.ts:36, 81-91` direct task-create | `const validated = validation.data` stored but never read; Prisma write reads `data.title`, `data.description`, etc. — every refine and transform discarded | `bfab85bf` |
| 7 | `lib/pov/handlers/put.ts:467-1042` PUT /api/pov/[povId] (comprehensive update) | Top-level scalars read `validated` but nested `tasks[i]/stages[i]/phases[i]` + team-management side-fields (`projectManager`/`salesEngineers`/`technicalTeam`/`replaceTeamMembers`/`phaseTemplateIds`) read raw `requestData`. Schema also missing 5 task fields (modelParameters, executionStatus, agentLog, outputArtifacts, assigneeId) + injection refines on 5 nested text fields. Atomic fix: 10 schema additions + 5 refines + 18 read swaps + new dual-layer smoke test. Phase 0 confirmed 164 prod tasks with executionStatus + 272 with outputArtifacts at risk. | (this commit) |

**Sister sibling fix (template-path schema completeness, same eradication session):**

| Site | Bug | Fix commit |
|------|-----|------------|
| `CreatePOVSchemaInline.formData.*` (6 text fields + competitors element) | Schema declared the fields but with `FormField.optionalString` (no injection refine) instead of `InjectionSafeOptional`. Same risk surface as the direct-path bypass; template path was protected only because of the parent schema's transform behaviour, not because the refines were present. | `ea43f267` |

### Sweep Results (2026-05-14)

**`app/api/` callers swept**: 79 files with `.safeParse(`. Heuristic flagged 8; manual classification:
- 3 confirmed bugs (above) — all in POV-tree write endpoints
- 4 false positives — handler already uses `validation.data`; heuristic missed it
- 2 stylistic — schema is enum-only, no transforms or refines to bypass (`admin/permissions`, `phase-templates/export`). Cleaned in `8fef2e8e` for codebase consistency.

**`lib/` callers swept**: 27 files. 3 suspects, all false positives:
- `lib/workflows/schemas.ts:139` — type guard using `.success` only
- `lib/services/types/triggered-by.ts:117` — same
- `lib/pov/handlers/delete.ts:53` — uses `validation.data` (grep missed `.data` at end of line)

### Shared Defense

1. **Smoke tests with Layer 1 pattern checks** — Each of the 3 fixed routes now has a dual-layer test (`scripts/test-pov-create-direct-path.ts`, `scripts/test-pov-stage-routes.ts`) whose Layer 1 grep rejects re-introduction of `filteredData as any` or `= body` after the relevant `safeParse`. Comments are stripped before pattern-matching so security notes referencing the anti-pattern can stay in source. **This is the primary regression-prevention mechanism for BC76.**
2. **detectPromptInjection coverage hardening (commit `de2b5548`)** — independent of BC76 itself, the coverage audit during the smoke-test write surfaced 8 dangerous-HTML-tag gaps + sentence-initial directive gaps in the injection-detection patterns. The patterns are now tight enough that even refines that *do* run catch the practical attack payloads.
3. **InjectionSafeOptional helper (local to `lib/validation/pov.ts`)** — the form-compat shape (`nullable + optional + transform-null-to-undefined`) with built-in injection refine. Eliminates the "field declared but missing refine" sibling class. 11 sites within pov.ts now use it. Per validation-engine-specialist (82% confidence, 2026-05-14), kept local until ≥3 other files would benefit; promote then.

### Detection Commands

```bash
# Find safeParse callers in API routes
grep -rln "\.safeParse(" app/api/ lib/ --include="*.ts"

# Heuristic: handlers where .safeParse count > .data-use count
# (false positives possible — heuristic, not exhaustive)
for f in $(grep -rln "\.safeParse(" app/api/ lib/ --include="*.ts"); do
  safeparse_count=$(grep -cE "\.safeParse\(" "$f")
  data_use_count=$(grep -cE "\.data!?[^a-zA-Z]|validatedData\b|validatedBody\b|parsedData\b" "$f")
  if [ "$data_use_count" -lt "$safeparse_count" ]; then
    echo "SUSPECT: $f (safeParse: $safeparse_count, .data: $data_use_count)"
  fi
done

# Direct grep for the canonical anti-pattern shape
grep -rnE "\.safeParse\([^)]*\)" app/api/ lib/ --include="*.ts" -A 20 | grep -E "as any\s*;|= body\s*;|= filteredData"
```

### Reactive Detection Mechanism

The bug class is reactively protected through:

- **Per-route smoke tests** (Layer 1 of each test-pov-*-routes / test-pov-create-direct-path file) — locks each known site
- **Sec-ops endpoint-security-audit protocol** — quarterly sweep would catch this pattern via standard endpoint review
- **validation-engine-specialist** — gained context about this bug class via the 2026-05-14 cross-specialist review on InjectionSafeOptional promotion

### Why Not a Pre-commit Hook

Pattern is harder to detect statically than dead block-comments: requires tracking which variable Zod populated vs which variable the destructure consumes. False-positive rate would be high (handlers that legitimately read URL params unrelated to the safeParse payload). Per-route smoke tests are the right tool — they verify the actual variable in use, scoped to known-vulnerable endpoints.

### Audit Resources

- **Code-review report**: `cline_docs/reviews/types-cleanup-2026-05-13/injection-safe-optional-promotion-review.md` (validation-engine-specialist)
- **Sec-ops report**: returned inline in 2026-05-14 session transcript (Write was blocked per prompt)
- **Commit chain**: `8f883324` → `ea43f267` → `96ae7ad0` → `de2b5548` → `8fef2e8e`
- **Test files**: `scripts/test-pov-create-direct-path.ts`, `scripts/test-pov-stage-routes.ts`, `scripts/test-injection-patterns.ts` (93 tests total)


---

## Bug Class 77: Silent Default Secret Fallback (`|| 'default-value'`)

**Status**: ERADICATED (in `mcp-server-http-clean.js` + `lib/auth/oauth/auth-manager.ts`)
**Severity**: CRITICAL
**Discovered**: May 19, 2026 (AuthManager extraction v3 plan, SEC-C1)
**Eradicated**: May 20, 2026 (Phase 3.5a WARN `545f1731` → Phase 3.5b THROW `f7fa0ec5`)

### Description

A security-critical environment variable is read with a `|| 'hardcoded-default'` fallback that allows the process to start successfully even when the env var is missing. The fallback value is well-known and frequently insecure (e.g., `'access-secret'`, `'change-me'`, `'development'`).

This is a **silent** failure: if the env var is missing at deploy time:
- The server starts without warning
- Subsequent token verification uses the hardcoded fallback as the HMAC key
- Anyone who knows the fallback value (anyone with access to the source) can forge valid tokens
- No log entry, no metric, no alert — production looks healthy

### Canonical Example (the one we eradicated)

```js
// BEFORE (mcp-server-http-clean.js:484, pre-Phase 3.5b):
const jwtSecret = process.env.JWT_ACCESS_SECRET || 'access-secret';
const secret = new TextEncoder().encode(jwtSecret);
// HS256 verification proceeds with the well-known fallback if env var unset.

// AFTER (Phase 3.5b):
const accessSecretRaw = process.env.JWT_ACCESS_SECRET;
if (!accessSecretRaw) {
  const msg = '[setupAuth] JWT_ACCESS_SECRET is not set. ...';
  this.logger.fatal({ env: process.env.NODE_ENV || 'unknown' }, msg);
  throw new Error(msg);
}
const secret = new TextEncoder().encode(accessSecretRaw);
```

### Root Cause

Convenience-over-safety bias in early development. The `|| 'default'` pattern is appealing because:
- It lets the dev environment work without env-file setup
- It prevents "stack trace at startup" annoyance for contributors
- The author assumes "I'll add a check before prod" — but then forgets

Production is rarely missing the env var (a deploy automation usually sets it), so the bug never fires under normal operations — meaning it stays undetected until an attacker probes for default-secret tokens, or a deploy automation breakage exposes the vulnerability.

### Symptom

Without grep, this class is **invisible** at runtime. With grep, it's:

```bash
# Find security-critical env vars with default fallbacks
grep -rnE "process\.env\.(JWT_|SECRET_|API_KEY_|TOKEN_|ENCRYPT_|HMAC_)[A-Z_]+\s*\|\|\s*['\"]" \
  --include="*.ts" --include="*.js" \
  | grep -v node_modules
```

### Shared Defense

Two-layer defense per Phase 3.5a/b pattern:

1. **WARN phase (Phase 3.5a)**: Emit a structured WARN audit event whenever the fallback would fire. Deploy this for one cycle to observe whether anyone in production actually depends on the fallback.
2. **THROW phase (Phase 3.5b)**: Once one deploy cycle confirms zero WARN events, flip to unconditional throw. Both code paths (extracted class + legacy) must fail-fast identically.

This is a specific instance of the [[shadow-validation-observation-window]] pattern applied to a security check rather than a behavioral migration.

### Detection Sites (Audit Commands)

```bash
# Layer 1: Env vars with literal-string fallback (high-risk)
grep -rnE "process\.env\.[A-Z_]+\s*\|\|\s*['\"]" --include="*.ts" --include="*.js" | \
  grep -E "SECRET|KEY|TOKEN|PASSWORD|HMAC|JWT" | \
  grep -v -E "test|spec|fixture|node_modules"

# Layer 2: Env vars with `||` falling through to ANY value in security contexts
# (broader — catches `|| someOtherVar` and `|| defaultConfig.x` patterns)
grep -rnB 3 -A 1 "process\.env\.\(JWT_\|SECRET_\|HMAC_\|API_KEY_\)" \
  --include="*.ts" --include="*.js" | grep -B 3 "||"
```

### Why Not a Pre-commit Hook

Detecting the *meaning* of an env var (is it security-critical?) requires semantic analysis. A naive hook would flag every `process.env.X || 'default'` including benign cases (`process.env.PORT || '3000'`, `process.env.NODE_ENV || 'development'`). The right tool is:

1. **Audit at Phase 0 of every extraction** (in `safe-modular-extraction-pattern.md` Step 1) — survey env vars in the file being extracted
2. **Code review checklist** — when adding a new `process.env.X || 'default'`, the reviewer asks "is X security-critical?"
3. **Quarterly sec-ops sweep** — endpoint-security-audit-protocol can include a pass over Layer 1 grep above

### Audit Resources

- **Discovery**: AuthManager v3 plan, sec-ops review round 1 + round 2 (folded into v3)
- **Plan**: `cline_docs/reviews/auth-manager-extraction-2026-05-20/auth-manager-extraction-plan-v3.md` § SEC-C1
- **WARN phase commit**: `545f1731`
- **THROW phase commit**: `f7fa0ec5`
- **Pre-deploy gate verification**: `grep -c '3.5a-WARN-observation' pm2 logs` returned 0 across 1 deploy cycle
- **Unit test**: Test 15 in `scripts/test-auth-manager.ts` — verifies initialize() throws on missing env

### Related Memories

- [[feedback_loud_failures_hot_paths]] — silent try/catch on hot paths hides regressions; same principle applies to silent env-var fallbacks
- [[feedback_audit_ownership_at_extraction]] — when extracting a class with security checks, the new class should own the fail-fast check (AuthManager does)

### Why This Bug Class Matters

A successful attack on this bug class is **unrecoverable post-issuance**: any tokens minted with the default secret are valid forever (until their TTL expires) and indistinguishable from legitimate tokens. The defense must be:
- **Proactive**: fail-fast on startup, never trust environment defaults for security-critical config
- **Audited**: include in every security review checklist
- **Tested**: unit test asserting throw on missing env (Test 15 above)

---

## BC71: Untrusted Input in Response-Text Interpolation

**Status**: ERADICATING (10 of 11 sub-phases shipped 2026-05-22; production verification pending)
**Severity**: MEDIUM-HIGH latent (HIGH for Phase 2.9 markdown URL — actively exploitable in Claude Desktop)
**Discovered**: 2026-05-22 (Basic Tools Domain Testing pilot, T13)
**Eradication**: 2026-05-22 (Phase 2.1-2.10 shipped same day; Phase 2.11 = drift sweep + this registry entry)

### Description

User-supplied strings (POV names, task titles, agent template names, service names, search queries, action names, prompt names, error messages) reflected verbatim into MCP tool response bodies via template literal interpolation. Reflected-XSS material — not actively exploitable in Claude Desktop / ChatGPT today (both render plain text) but would execute in any HTML-rendering MCP client (markdown→HTML pipelines, future browser-based MCP clients per the streamable-http transport direction).

**Variant** at Phase 2.9 (markdown URL): different defect — `link.uri` interpolated directly into markdown `[text](url)` syntax allows `javascript:alert(1)` URLs that Claude Desktop actively renders as clickable links. HIGH-severity active exploit, NOT just latent.

### Detection Command

```bash
# Axis 1 — error helpers (well-known sites)
grep -rE 'new Error\(`.*\$\{(searchTerm|name|title|provided|action|message)' lib/mcp/server/tools/*/error-helpers.js

# Axis 2 — inline interpolation outside helpers (Plan v1 MISSED this axis;
# boundary-contract specialist Round 1 found 5 bypass paths)
grep -rE 'throw new Error\(`.*\$\{|error: `.*\$\{|text: `.*\$\{|message: `.*\$\{' \
  lib/mcp/server/tools/ --include='*.js' | grep -v error-helpers | grep -v test-

# Verify wrap (catches new sites added post-fix)
grep -rL "sanitizeForResponse" lib/mcp/server/tools/ --include='*.js' \
  | xargs grep -lE 'throw new Error\(`.*\$\{'
```

### Variants

| Site type | Vector | Fix shape |
|---|---|---|
| Error-helper interpolation | `<script>` in response text | `sanitizeForResponse(input)` (5-char HTML escape) |
| Inline `throw new Error` | `<script>` in error message | Same |
| `error:` field in dispatch response | `<script>` in error field | Same |
| `_meta` field echoes | `<script>` in metadata | Same |
| `JSON.stringify({user_input})` | JSON.stringify does NOT escape `<>&` | Same (sanitize BEFORE JSON.stringify) |
| **Workflow error round-trip (GAP-5)** | Persistent stored-XSS via MCPWorkflowExecution.error | Sanitize at WRITE-time (BUG-HUB-001 sibling) |
| **Markdown URL interpolation (Phase 2.9)** | `javascript:alert(1)` in markdown link | URL scheme allowlist (`http`/`https`/`mcp`/`paichart`) |

### Affected Sites — Eradication Inventory

**~135 sanitize sites + 1 URL allowlist function across 14 files** (8.4× larger than Plan v1's initial 11-site estimate; boundary-contract specialist surfaced 5 bypass paths Plan v1 missed):

| Sub-phase | File(s) | Sites |
|---|---|---:|
| 2.1 foundation | response-sanitizer.js (NEW), tool-schemas.js (L1 SafeNameField for 16 fields), mcp-action-validation.ts (export SimpleTextField) | 16 L1 + utility |
| 2.2 error-helpers | basic/, advanced/, hub/error-helpers.js | 20 |
| 2.3 ChatGPT connector (GAP-1) | chatgpt-connector-handler.js (JSON.stringify path) | 19 |
| 2.4 workflow handler + GAP-5 | hub/workflow-tools-handler.js (read + write-time sanitize) | 20 |
| 2.5 InternalServiceRouter (GAP-4) | internal/InternalServiceRouter.js | 10 |
| 2.6 sdk-native + service-call + task-action (GAP-2) | sdk-native-basic-tools.js, hub/service-call-handler.js, advanced/task-action-handler.js | 18 |
| 2.7 task-context + agent-results + elicitation (sec-ops I1) | advanced/task-context-handler.js, advanced/agent-results-handler.js, advanced/analytics/elicitation-prompts-generator.js | 13 |
| 2.8 dispatchers + hub-utilities + prompt-command | 5 dispatchers + hub/hub-utilities.js + prompt-command-handler.js | 15 |
| 2.9 URL scheme allowlist (sec-ops I3) | advanced/analytics/analytics-formatters.js | 5 (4 sanitize + 1 URL allowlist) |
| **2.10 tests + verify** | scripts/test-response-sanitizer.ts (NEW — 37 assertions) + deploy verification plan | test infra |

### Root Cause

Template literal interpolation of user-supplied strings into response text without HTML escape. `JSON.stringify` does NOT escape `<,>,&` (verified: `JSON.stringify({m:'<script>'})` → `{"m":"<script>"}`), so wrapping in JSON.stringify is not a defense.

### Defense Pattern (BD-1 + BD-2 from Plan v2)

**Two-layer defense**:

1. **L1 input rejection** — `SafeNameField` in `tool-schemas.js` rejects HTML-tag patterns at the dispatch boundary for 16 free-text lookup fields (`pov_name`, `task_title`, `targetService`, etc.). Mirrors `MCPActionRequestSchema` pattern from the `perform` tool.

2. **L4 output sanitization** — `sanitizeForResponse(input)` in `lib/mcp/server/tools/response-sanitizer.js` HTML-escapes the 5-char OWASP set (`& < > " '`) + 200-char length cap + ASCII control char strip. **REUSES** `lib/utils/sanitize.ts:escapeHtml` via inline KEEP IN SYNC comment (cross-runtime constraint prevents direct require of .ts file).

3. **L5 dispatch-boundary walker** — DEFERRED (D2). Sufficient evidence that L1+L4 covers the demonstrated bug; revisit if Round 2 specialist review surfaces new gaps.

### Markdown URL Variant (Phase 2.9)

Different mechanism, different fix. In `analytics-formatters.js`:

```js
const ALLOWED_LINK_SCHEMES = new Set(['http:', 'https:', 'mcp:', 'paichart:']);
function sanitizeLinkUri(uri) {
  if (!uri || typeof uri !== 'string') return '#';
  try {
    const url = new URL(uri);
    return ALLOWED_LINK_SCHEMES.has(url.protocol) ? uri : '#';
  } catch { return '#'; }
}
```

### Discovery Path

1. Surfaced by MCP Basic Tools Domain Testing pilot T13 (2026-05-22, commit `cd654656`)
2. Phase 0 v1 (commit `cf5caa27`) inventoried 11 sites in 3 files
3. Plan v1 (commit `45c37af3`) proposed centralized utility + helper wraps
4. Specialist Round 1: **boundary-contract specialist 71% confidence** (well below 92% threshold) — found Plan v1 covers ~15% of actual surface
5. Phase 0 v2 (commit `88f667a5`) re-inventoried — ~92 sites across 14 files (8.4× growth) per `feedback_phase0_stops_at_inventory`
6. Plan v2 (commit `f5850a00`) folded all specialist findings: 11 sub-phases, 92% post-fold confidence
7. Phase 2.1-2.10 shipped sequentially (commits `d932d80b`, `559bc931`, `d928b30c`, `867b14f0`, `e70855ee`, `f5afc011`, `70e1b4c9`, `f58a4d4e`, `12811646`, [Phase 2.10 commit])
8. Phase 2.11 — this registry entry + 4 deferral follow-up tasks

### Deferred Follow-ups

| ID | Item | Trigger to revisit |
|---|---|---|
| D1 | Activity table stored-XSS via hub-audit-service.js | Admin UI surface exists / renders metadata |
| D2 | L5 final-pass walker at MCP dispatch boundary | Round 2 specialist review requires it OR new bypass path emerges |
| D3 | Pino log output sanitization | Log dashboard that renders raw JSON HTML encountered |
| D4 | True idempotency (escaped-entity detection) | Multi-layer architecture introduces double-call paths |

### Related Memories

- [[feedback_phase0_stops_at_inventory]] — Plan v1 → Phase 0 v2 redo trigger (8.4× growth)
- [[feedback_bc2_audits_two_axes]] — two-axis grep pattern (helpers + inline interpolation)
- [[feedback_security_severity_by_audience]] — severity grading (MEDIUM-HIGH latent today; HIGH active for Phase 2.9 markdown URL)
- [[feedback_prefer_more_specialists]] — 3-specialist Round 1 saved Plan v1 from shipping at ~15% coverage

### Why This Bug Class Matters

MCP transport direction is streamable-HTTP (browser-based clients). Today no exploitable HTML-render path in Claude Desktop / ChatGPT, but tomorrow's MCP clients will render markdown→HTML. Fixing now prevents 100% of future exposure. Phase 2.9 (markdown URL) is the one variant that's actively exploitable TODAY in Claude Desktop — highest priority within the bug class.

---

## Bug Class 78: Silent Field-Strip via Non-Strict Update Schemas

**Status**: PARTIALLY ERADICATED 2026-06-30 (4 schemas hardened; full sweep done; remaining sites inventoried below)
**Severity**: MEDIUM — silent data-loss UX bug (a user edits a field, gets a clean `2xx`, the change never persists; no error, no log). Not a security hole (the *inverse* of #29), but erodes trust and hides regressions.
**Discovered**: 2026-06-30 — Steve hit it editing a workflow's name in the GUI: the save "succeeded" but the name never changed.

### Description
A request-body Zod schema is a plain `z.object({...})` (Zod's default = silently strip unknown keys). When an editor/form sends a field the schema omits — or a field is renamed on one side — that field is silently dropped: `safeParse` succeeds, the handler writes `validation.data` (without the field), the API returns `2xx`, the user's change vanishes with no error or log.

### Root Cause
`z.object()` default strips unknown keys silently. Form-vs-schema field drift then no-ops invisibly. The safe pattern (already used by `PromptLibraryUpdateSchema`, the boundary-contract-wrapper schemas, and all the MCP surfaces) is **`.strict()`** — rejects unknown keys LOUDLY (`400`), converting a silent drop into a findable error.

### Sibling classes
- **#29 Mass Assignment via Passthrough Spread** — the INVERSE: `.passthrough()` lets EXTRA fields *reach* the write (over-permissive). #78 is plain-object *dropping* expected fields (under-permissive). Same boundary (unknown-key handling), same fix family (`.strict()` / explicit allowlist).
- **BC76 Validation Bypass via Post-safeParse Raw-Body Read** — both yield "validation appears present but isn't doing what you think."

### Eradication (fix = audit senders → reconcile field set → `.strict()`)
| Schema | Status | Note |
|---|---|---|
| `PromptLibraryUpdateSchema` | already `.strict()` | the safe pattern (pre-existing) |
| `UpdateWorkflowSchema` | ✅ ERADICATED | + strip immutable `name` from the update sender (`useWorkflows.save`) |
| `UpdateAgentTemplateSchema` | ✅ ERADICATED | sole active sender (adapter) is clean; `builderService.updateTemplate` is dead code |
| `ProfileUpdateSchema` | ✅ ERADICATED | sender sends `{name,email}` |
| `UpdateTeamMemberRoleSchema` | ✅ ERADICATED | sender sends `{role}` |
| `admin-user` `CreateUserSchema`/`UpdateUserSchema` | ✅ ERADICATED (2026-06-30) | Update: form fields ⊆ schema, flipped clean. Create: form sent `status`+`customRoleId` (silently stripped — a live BC78 instance); added them to the schema (handler intentionally hardcodes them on create, see UX note) then flipped strict. |

> **UX note (admin user create) — RESOLVED 2026-06-30:** the shared `UserForm` collects `status` + `customRoleId`, but the create handler used to hardcode `status=ACTIVE` + `customRoleId=undefined`, silently ignoring them (you had to re-edit). Fixed: the create handler now honors both (status defaults ACTIVE; `customRoleId` carries the BC39 SUPER_ADMIN gate, mirroring update) — create/edit parity.
| `task-validation` (14 schemas) | 🟡 DELIBERATELY NOT FLIPPED (2026-06-30) | see Tranche 2 finding below |
| `task-shapes` `NestedTaskInputSchema` | ⏳ REMAINING | |

### Tranche 2 finding — `task-validation` left non-strict ON PURPOSE
Audited 2026-06-30; concluded the strict flip is **not worth the risk** here:
- **Senders send control fields not in the schema, read from the RAW body.** `UpdateTaskSchema`'s senders (`TaskEditor`, `TaskEditDialog`) post `logActivity` + `previousValues`, which the handler reads from `body` directly (`app/api/tasks/[taskId]/route.ts:254-255`) for activity logging — intentionally outside validation. `.strict()` would reject them → **400 on every task edit**. Reconciling means adding them to the schema AND proving they never reach Prisma — but the handler forwards **`validated as any`** to `TaskService.updateTask`, so newly-accepted fields risk flowing into the DB write.
- **Hot path, many senders.** Task create/update has multiple callers; one missed sender = broken core CRUD in prod.
- **Low benefit.** The task schemas are comprehensive (~30 fields covering every column), so the current silent-strip risk is low — no field-drift symptom like the workflow name-drop.

**Decision:** risk (break the busiest CRUD path) ≫ benefit (drift protection on already-comprehensive schemas). Leave non-strict. If ever revisited, it's a dedicated effort: enumerate ALL senders, add `logActivity`/`previousValues` (+ any sibling control fields) to the schemas, confirm `TaskService` explicit-maps rather than spreads `validated`, then flip — with the canary/regression discipline this surface warrants.

**Intentionally EXCLUDED (NOT the bug — deliberate `.passthrough().transform(stripDangerousKeys)` for metadata/tenant preservation):** `pov.ts`, `settings-validation.ts`, `prompt-library` create. Do NOT flip these to strict.

### Detection
```bash
# Request-body Create/Update schemas that are plain z.object (no .strict / .passthrough):
grep -rnE "export const [A-Za-z]*(Create|Update)[A-Za-z]*Schema *= *z\.object" lib/validation lib/**/schemas.ts
# For each plain one: audit ALL senders → reconcile (add field to schema OR stop sending it) → add .strict()
```

### Lesson
`.strict()` is mandatory on request-body schemas **unless** passthrough is a deliberate, documented design (metadata preservation). A plain `.object()` request validator silently eats field drift, and the symptom ("I saved it but it didn't stick") is hard to trace because there's no error.

**Cross-refs**: [[field-leakage-prevention-pattern]], [[boundary-contract-wrapper-enforcement-pattern]], #29 (inverse), BC76 (sister).

---

## Bug Class 79: Option-Bag Terminus Drop (Accepted at Every Boundary, Consumed by None)

**Status**: 🟡 LIVE SITE FIXED + GATED · latent siblings pinned · Protocol 6-**LITE** (registry + terminus fix +
coverage gate — NOT a full eradication campaign: 1 live site + a handful of latent siblings is a sweep)
**Severity**: HIGH (silent; the caller gets no feedback its request was ignored)
**Found**: 2026-07-17, out of a T6 pipeline-harvest failure. Fix `e72f5b17`.
**Panel**: 4 Fable lenses — `cline_docs/reviews/f-new-5-timeout-drop-2026-07-17/PANEL-SYNTHESIS.md`

### Description
An option is accepted in a layer's option bag, forwarded faithfully by every intermediate layer, and **never
read at the terminus**. TypeScript's structural typing makes this legal at every hop: every signature accepts
it, every forward happens, no layer errors, no test fails. The caller has **no feedback** that its request was
ignored — so the value silently becomes decorative.

### Root Cause
The terminus is a call into a third-party SDK (or an in-process handler) whose options argument is simply
omitted. The type system cannot see cross-function property non-consumption, so nothing enforces the contract
the bag advertises.

### Symptom
The bag's value has no effect, and any FACT derived from it becomes a **false claim**. Live instance: the
`services` gateway computed `maxExecutionTime` (per-service, clamped 300s), advertised `effectiveTimeout: 300000`
in `_meta`, and never passed it to `client.callTool` — so the SDK's `DEFAULT_REQUEST_TIMEOUT_MSEC` (60,000)
bound instead. A Browser Automation scrape burned **60,196ms** and killed a pipeline leg, while the metadata
claimed a 300s ceiling. **`effectiveTimeout` was a false fact in production** (Protocol 10 misleading-signal class).

### Shared Defense
`npm run test:sdk-request-options` — a grep coverage gate: every SDK `client|pooledClient.callTool(` must pass
RequestOptions (the **THIRD** arg — the 2nd is `resultSchema`, so options-in-2nd-position is a *worse* bug), or
carry a `// request-options-exempt: <reason>` marker. Also pins that the gateway cap and the loop ceiling read
ONE shared constant (`RUNTIME_LIMITS.TOOL_CALL_TIMEOUT_MS`).

**Why a grep gate and not a type**: "declared-but-unread bag field" is exactly what structural typing permits.
A generic "every bag field must be consumed" check is **not feasible** — do not invent one.

### Sites
| # | File | Option | State |
|---|------|--------|-------|
| 1 | `lib/mcp/server/tools/hub/service-call-handler.js:441` | `timeout` | ✅ FIXED — **the live failure** |
| 2 | `lib/mcp/server/tools/hub/workflow-tools-handler.js:657` | `timeout` | ✅ FIXED (sibling) |
| 3 | `lib/services/workflow/integrations/service-caller.ts:387` | `timeout` | ✅ FIXED (sibling) |
| 4 | `lib/services/mcp/mcpService.ts:544` | `timeout` | ✅ FIXED (latent — agent-traffic-dead; landmine for any future directly-registered external server) |
| 5 | `lib/services/mcp/mcpService.ts` `callEmbeddedTool` | `timeout` | ⚪ **RESOLVED-BY-DECISION 2026-07-17** — 4-lens Fable panel, unanimous: **no embedded per-call ceiling** (every p99 < 4s, max organic 10.1s, zero attributable hangs ever — any number would be an unearned verdict per Protocol 10; a bare race would AMPLIFY the dominant hang mode, DB-lock wait → pool exhaustion via LLM retries). The bag field stays declared-but-unread by design; `durationMs` fact + new `SLOW_TOOL_CALL_WARN_MS` observation warn (agentic-tool-loop) generate the data that could earn a future ceiling. The REAL hierarchy defect was elsewhere and was FIXED: reaper(20min) < watchdog envelope(53min @100 turns) — now two-tier + derived (runtime-limits.ts) with ordering tests. Watchdog-below-gateway (turns≤3) = theoretical, documented not guarded. Designated successor if the warn ever fires: AbortSignal threading into the tool await (the watchdog signal is NOT consumed there — a never-resolving call leaks the loop promise forever; only the reaper fixes the record, and doing so frees the active-per-task unique index, allowing a second live handler on the same task). Decision record: `cline_docs/follow-ups/M2-embedded-timeout-CONTINUATION-PROMPT.md`. |
| 6 | `lib/services/mcp/mcpService.ts` | `sessionId` | ⚪ RESOLVED-BY-DECISION 2026-07-17 (M3) — documented intentional embedded-only scope: `sessionId` is toolContext plumbing (retry provenance for agent.execute); an external SDK call has no toolContext and a third-party server has no use for our execution id. Comments at both bags state it. Not a drop. |
| 7 | `lib/services/mcp/mcpClientWrapper.ts:225` | `preserveContext` | ⚫ RESOLVED 2026-07-17 — dead module **deleted** (BC79 follow-up commit B, incl. `protocolHandler.ts` + Axis-6 orphans `updateToolPerformance`/`addToolExecution`) |
| 8 | `lib/services/llm/mcp-integration.ts:167, :419` | `retries` | ⚫ RESOLVED 2026-07-17 — dead mock chain **deleted** (BC79 follow-up commit A; file is now type exports only) |
| 9 | `app/api/mcp/tools/[toolId]/test/route.ts` | `timeout` | ⚪ RESOLVED 2026-07-17 — transitively FIXED by `e72f5b17` for external targets (serverManager forwards options verbatim → `callExternalTool` → SDK RequestOptions); deliberately unread for the embedded target (M2 decision, site 5). Comment updated to state the true scope. |

**NOT members** (do not pad): `listTools`/`listResources`/`readResource` omit RequestOptions, but **no caller
bag offers a timeout** ⇒ "contract never offered" (design gap), not "contract broken". `embeddedMCPServer.callTool`
is positional/in-process — a different contract (it was the coverage gate's own first false positive).

### The Diagnosis — this class is what happens when a wrapper is bypassed
`mcpClientWrapper.executeTool` (`options?.timeout || this.config.requestTimeout`) and `protocolHandler`
(`setTimeout(..., options.timeout ?? 30000)`) **already contained the correct enforcement**. Every wiring site
bypassed them — `serverManager` assigns `clientWrapper: null as any` at `:173/:197/:540` with a *"Will be
replaced with proper wrapper later"* comment that never came true — and they rotted into dead code while the
live path silently lost the behavior. **The codebase had the solution; it lacked the bypass test.**
*(Corpse removed 2026-07-17: both files deleted, wiring sites cleaned, orphaned callees swept — see sites 7/8 above.)*

That is precisely the failure mode `boundary-contract-wrapper-enforcement-pattern.md` (94%) exists to prevent:
*"documentation-only shape rules don't survive the N-th author"* ⇒ canonical path **+ an automated grep test
that fails CI on bypass**. This class is a validating instance of that pattern, not a new one.

### The generalization — a WIDER class this one is a member of
`effectiveTimeout` was the more dangerous shape: not "an option we ignored" but **a value we computed,
published as a FACT, and never enforced** — a false advertisement. That axis is swept (PARTIALLY) in
`cline_docs/follow-ups/advertised-vs-enforced-facts-sweep-2026-07-17.md`, which found a live candidate in a
**security audit record** (`downstreamAuthRequired: true` — FIXED 2026-07-17: reframed to the code-path fact
`authDelegatedToDownstream`, since the emission site can attest what it did, not what downstream will do).
If you are here because of this class, read that
too — the option-drop is the visible half; the false fact is the half that bites after an incident.

### Lesson
An option bag is a **contract**, and a contract nobody enforces decays into decoration. `timeout: 30000` was
carried verbatim through five layers for **~2 years** (born 2025-07-31, `a0956cb5`) without ever reaching an SDK
call — so there was no behavior to "restore", and enforcing it would have been a **first-ever** ceiling on a hot
path (and *worse* than the bug: 30s < the 60s that was actually binding). Protocol 10: a ceiling is a **verdict**;
prefer an **earned** one (the per-service `maxExecutionTime`, declared by the registrant) over minting a new number.

**Cross-refs**: [[boundary-contract-wrapper-enforcement-pattern]] (the enforcement half), BC75 (phantom canonical
— sibling: there the phantom is a function, here it's the option contract), [[field-leakage-prevention-pattern]]
(inverse: data lost in transformation vs an option never consumed).

---

## Bug Class 80: Phantom Column Read (a `select`-less `any` renders a field the table never had)

**Status**: 🟡 THREE SITES FIXED + TYPED + one DOWNSTREAM VERDICT KILLED · 5 latent siblings inventoried below ·
Protocol 6-**LITE** (registry + typed chokepoints at the two live read surfaces — the remaining siblings are
inert render paths, not a campaign)
**Severity**: MEDIUM-HIGH — individually silent, but one member had escalated into a **false high-priority
admin recommendation** (Protocol 10), and another put a false `progress: 0` on the surface agents poll
**Found**: 2026-07-25, by a 3-specialist panel (agent-execution / boundary-contract / database-manager, no
dissent) — `cline_docs/reviews/agent-error-code-surface-2026-07-25/`. Fixes `96f6acf5`, `7d7f94f4`.

### Description
Code reads `row.someField` where `someField` **has never been a column** on that table. It compiles, runs, and
renders — as `undefined`, or as whatever a `|| 0` fallback supplies. No error, no test failure, no log line.
The read is not a typo of an existing column and not a removed column (verified: `git log -S` shows **no
add/remove pair** for `progress`, `error`, `output`, `metrics` on `agent_executions`) — it is a field that was
imagined at the call site and never existed anywhere.

### Root Cause
**Type erasure at the DB→handler boundary.** `let executions: any[] = []` (then assigned from a Prisma query)
discards the inferred payload type, so every subsequent `exec.<anything>` type-checks. Prisma's generated types
would have rejected all four reads instantly. The enabling condition is the `any`, NOT the individual field —
which is why fixing the fields alone leaves the class wide open for the next author.

Aggravating factor: `include` instead of `select`. `include` says "all scalars plus these relations", so the
projection is implicit and nobody notices it does not contain what the render code reads.

### Symptom — three distinct failure shapes from one cause
1. **False fact.** `progress: exec.progress || 0` → every execution reports `progress: 0`, *including completed
   ones*. `agent.status` is the surface agents poll every 10-30s (its own `nextSteps` says so), so an agent can
   read "no work done" and retry a run that already burned a full LLM call.
2. **Suppressed true fact + unactionable instruction.** `error: exec.error` was always `undefined` (dropped by
   serialization), while the real failure code sat unexposed in `error.json`. The same surface told agents to
   *"Review logs for failure cause"* — and returns no logs.
3. **A VERDICT built on the absent fact** (the dangerous one). `execution-analytics.js` categorized every failed
   execution via `categorizeError(execution.error)` → always `'unknown'` → the downstream **"Address Common Error
   Patterns"** recommendation (priority `high`, impact `high`, consumed by the admin system-health surface) fired
   for ANY failure, asserting *"recurring error patterns detected that can be prevented"* with the single detail
   `error: 'unknown'`. No pattern had been detected. **A phantom read does not stay inert — it gets aggregated,
   and aggregation launders it into a confident claim.**

### Eradication (fix = kill the `any` FIRST, then read what the fields were hiding)
Replacing `any[]` with an explicit `select` + `Prisma.<Model>GetPayload<{select: typeof S}>` at the two live
read surfaces turned every phantom into a compile error at once — `agent-results-handler` alone had **four**
(`output`, `metrics`, `error`, plus a whole `llmResponses`/`mainResponse` block reading a REAL `Task` column
that was never in that handler's projection, hence unreachable by construction). Do not fix these one field at
a time from a grep list; type the boundary and let the compiler enumerate them.

### Sites
| # | Site | Phantom field(s) | Status |
|---|------|------------------|--------|
| 1 | `lib/mcp/tasks/action/handlers/agent/agent-status-handler.ts` | `progress`, `error` | ⚫ FIXED 2026-07-25 — typed `STATUS_EXECUTION_SELECT`; `errorCode` (real column) replaces both |
| 2 | `lib/mcp/tasks/action/handlers/agent/agent-results-handler.ts` | `output`, `metrics`, `error` (+ dead `task.outputArtifacts` block) | ⚫ FIXED 2026-07-25 — typed `RESULTS_EXECUTION_SELECT`; `errorCategory` hoisted from `error.json` |
| 3 | `lib/services/agentExecutionEngine.ts` `updateExecutionStatus` | `error?: string` **parameter**, accepted and silently dropped | ⚫ FIXED 2026-07-25 — parameter deleted. Its comment *"Only add fields that exist in the database schema"* was the tombstone |
| 4 | `lib/mcp/server/utils/execution-analytics.js:652` | `error` → error categories → admin recommendation | ⚫ FIXED 2026-07-25 — reads `errorCode`; codes returned verbatim as categories; recommendation gated on ≥1 IDENTIFIED category |
| 5 | `lib/mcp/server/utils/formatters.js:825-830` | `progress`, `error` render branches | ⚫ FIXED 2026-07-25 — deleted; replaced by a `Failure code:` line |
| 6 | `lib/mcp/server/utils/formatters.js:960-962` | `metrics` | 🟡 LATENT — inert render branch; permanently dead now that site 2 stopped emitting `metrics` |
| 7 | `lib/mcp/server/utils/execution-streaming.js:262,424,433,532` | `error`, `progress` | 🟡 LATENT — 4 reads on SSE/status payloads; renders `null`/`0` |
| 8 | `lib/mcp/server/streaming/execution-streaming.js:162,177,180` | `progress` | 🟡 LATENT — incl. a change-detection compare (`cachedStatus.progress !== execution.progress`) that can never differ |
| 9 | `lib/mcp/simple-resource-manager.js:457` | `progress` | 🟡 LATENT — resource metadata `progress: 0` |
| 10 | `lib/mcp/server/mcp-core.ts:706` | `error` | 🟡 LATENT — escapes typing via an `as unknown as {...}` cast on the Prisma client |

**Why 6-10 are LATENT not FIXED**: all are inert *render* paths (a `null` or a `0` in a payload), none feeds an
aggregate or a verdict, and each sits in an untyped `.js` streaming module that deserves its own review. Site 4
was promoted out of this group and fixed immediately **because it fed a claim**. That is the triage rule for this
class: *does the phantom get aggregated or asserted?* If yes it is not inert, whatever it renders as.

**NOT members** (checked, do not pad): `MCPWorkflowExecution` genuinely HAS `output` and `error` columns
(`schema.prisma:1165,1170`), so `workflow-tools-handler.js:1306` and `WorkflowsPage.tsx:486` are correct code
reading a different model. Two models, same variable name `execution` — that collision is why this class needs
the model traced per site rather than grepped by field name.

### Detection
There is **no clean grep** for this class — `exec.progress` is indistinguishable from a valid read without
knowing the row's model. The two things that do work:
1. **Type the boundary.** `select` + `GetPayload` at every DB→handler assignment. Then the compiler is the
   detector, permanently. `any[]` on a Prisma result is the smell; treat it as a defect, not a style choice.
2. **Untyped `.js` needs a different net.** Sites 6-10 are all in `.js` or behind casts, where no compiler will
   ever help. A phantom there is only found by tracing the query that produced the object.

### Lesson
Prisma's inferred types are a **complete** description of a row; `any` on a query result throws away the only
authority on what a row contains, and every field invented afterwards looks exactly as real as the ones that
exist. `progress` had a plausible name, a plausible fallback (`|| 0`), and a plausible render branch — and
sailed for years on a hot AI-facing surface. **A fabricated field is worse than a missing one**: missing data
prompts a question, while `progress: 0` answers it, wrongly, with total confidence.

Protocol 10 coda: sites 1-3 shipped a false/absent *fact*, which is bad but bounded. Site 4 shows the escalation
path — an absent fact aggregated into a **verdict** ("patterns detected... that can be prevented") on an admin
surface. Sweep for the aggregate, not just the read.

**Cross-refs**: [[boundary-contract-specialist]] (field-completeness at boundaries — this is its inverse: field
*invention*), [[field-leakage-prevention-pattern]] (data lost in transformation vs data never present), BC75
(phantom canonical — there the phantom is a function, here a column), Bug Class 79 (option-bag terminus drop —
same "compiles, forwards, never real" family on the write side).

## Bug Class 81: Delete/Replace-by-Omission Sync from a Lossy Client Projection

**Discovered**: 2026-08-19 (live incident: every GUI POV save silently DELETED the owner's
TeamMember row — the normalizer builds `teamMembers` from the PM/SE/TT dropdowns only, the OWNER
row is never in that projection, and `replaceTeamMembers=true` is hard-set at
`components/poveditor/pov/context/utils/normalizer.ts:598`).

**Shape**: a writer applies replace-or-delete-missing semantics to a COLLECTION, treating a client
payload as the source of truth for what should exist, when that payload is a lossy projection:
- **subset projection** — the client edit surface never displays some rows (OWNER in dropdowns),
  so they are never in the payload and replace destroys them; or
- **stale snapshot** — the payload is page-load state, so rows created since (by the HARNESS
  during a live program run, or by another human) are absent and delete-missing destroys them.

Platform-owned rows die with no error, no log, and the save reports success. **BC2 is the same
disease at jsonb-KEY level** (C5: `metadata: {}` replace erased platform-owned keys); this class
is the ROW/COLLECTION level. The 2026-08-19 sibling `workflowEngine` stale wholesale metadata
resend (fixed `fa2c3d4d`) is the read-side variant: a stale snapshot re-sent as intent.

**Sites** (sweep 2026-08-19, repo-wide on `deleteMany`/delete-missing-filter/replace-flag axes):

| # | Site | Projection flaw | Status |
|---|---|---|---|
| 1 | `applyTeamUpdate` replace branch (`lib/pov/services/team.ts`) | subset (OWNER never in dropdowns) | FIXED `78a5dc88` — replace preserves OWNER rows |
| 2 | Task delete-by-omission (`put.ts:~548`) | stale snapshot | FIXED F5 2026-07-25 — opt-in `deleteMissing` |
| 3 | metadata `{}` replace (C5) | subset (platform keys invisible) | FIXED WS2 Phase A (key-level kin, tracked under BC2) |
| 4 | **Stage delete-by-omission (`put.ts:~855`, incl. the delete-ALL else-branch)** | stale snapshot — deleted HARNESS-created stages mid-run, orphaning pipeline tasks (`Task.stageId onDelete:SetNull`) and breaking stage-sibling reactors | FIXED 2026-08-19 — F5-parity opt-in `deleteMissing` |
| 5 | **Phase delete-by-omission (`put.ts:~1001`; `Stage.phase onDelete:Cascade` makes it take stages too)** | stale snapshot | FIXED 2026-08-19 (same day, paired change): explicit `deletedPhaseIds` contract — GUI tracks removals at the REMOVE_ENTITY reducer chokepoint (`ui.deletedPhaseIds`, cleared on INITIALIZE_STATE), normalizer sends the list, server deletes ONLY listed ids (POV-membership-verified) + preserved-N fact logs; the empty-array delete-ALL arm unified under the same contract. Design record: `cline_docs/follow-ups/phase-delete-by-omission-2026-08-19.md` |

**Checked, NOT members** (do not pad): `taskDependency` full-set rewrite (task-update-handler
:793 / task.ts F3) — the caller sends the complete intended set by contract, not a projection;
`workflowStep.deleteMany` (parent-cascade on workflow delete); notification/refresh-token
cleanup deleteManys (retention, not sync); `agent.configure` mcpContext wholesale (BC2 C5
documented by-design); `outputArtifacts` (BC2 C2 by-design — engine writes the canonical full
list). `TeamService.updateMembers` (blanket `deleteMany({})`) was a member with zero callers —
DELETED `40bc5bd1` rather than fixed.

### Detection
Two greppable signatures, neither sufficient alone (triage each hit by asking: *is the payload a
complete statement of intent, or a projection of what one surface happened to display/load?*):
```bash
# delete-missing sync loops: a not-in-payload filter near a delete
grep -rn "filter(.*!.*includes(" lib app --include="*.ts" | grep -iv test   # triage hits near .delete(
# replace-collection flags
grep -rnE "replace[A-Z][a-zA-Z]*\s*[:=]" lib components --include="*.ts" --include="*.tsx" | grep -v "\.replace("
```

### Lesson
"The payload is the source of truth" is only sound when the payload is a **complete statement of
intent**. A GUI's save payload is neither complete (it omits what its widgets don't show) nor
current (it snapshots page-load state, and the platform writes concurrently — programs create
stages while humans edit). Replace/delete-missing semantics over such a payload make the client's
blind spots destructive. The safe defaults, in preference order: (1) explicit deletion lists /
targeted endpoints (the GUI already deletes tasks and stages this way); (2) opt-in flags
(`deleteMissing`) with a preserved-N fact logged (Protocol 10 — a fact, not a verdict); (3) if
replace semantics are genuinely intended, exclude platform-owned rows by role/type at the sink
(the OWNER fix). Never rely on the client to round-trip rows it cannot see.

---

## Bug Class 82: Conditional Obligation with a Silently Unsatisfiable Predicate

**Status**: IDENTIFIED (swept 2026-08-27 — both known sites fixed, no live sites remaining)
**Severity**: HIGH — silent, and invisible to every forensic method we have
**Domain**: agent protocols and role guidance (prose obligations, not code)

### The shape

An instruction of the form **"where X is present, do Y"** is not a guard unless something
*guarantees X reaches the agent's context*. When X never arrives:

- the predicate is false,
- **no obligation is owed**,
- nothing is skipped,
- and **no transcript records anything.**

The run is formally clean. There is no error, no degradation fact, no warning — the check simply
never happened, and nothing anywhere says so. That is what makes it worse than an ignored rule: an
ignored rule leaves evidence.

### Confirmed sites (both fixed)

| Site | Obligation | Why it was inert |
|---|---|---|
| network-provisioning Author (g) | *"where the contract carries a canonical stanza template, TRANSCRIBE it"* | the interface contract was delivered to the LEG and never to its children — measured 7 of 7 legs lossy, **0 of N children** ever holding it |
| network-provisioning Reviewer | *"where the contract carries… verify every non-placeholder line appears"* | same; the reviewer held a brief paraphrase missing 9 of 10 canonical lines |

Both were correctly written. Both were inert for five or more rounds. Between them they let two
rounds ship config that left a routing protocol **INACTIVE** while entering, committing and
displaying cleanly. Fixed by contract inheritance (`806501a2`) plus protocol v1.6.0/v1.9.0.

### The distinguishing shape — what a SAFE conditional looks like

The sweep found several conditionals of the same grammar that are **sound**, and the difference is
mechanical enough to check. A safe one has all three:

1. **The condition is stated in terms of the agent's OWN context**, not the world:
   *"WHERE the harvest's `## Harvested Allocations` block IS available **in your chained context**"* —
   not "where a harvest exists".
2. **An explicit ELSE branch**: *"Where it is not available, grade the finding ACCEPTED-FROM-CLAIMS —
   never claim you verified it."*
3. **The absent case is never undefined.** Silence is what converts a guard into decoration.

The two broken sites had none of these; the sound ones (the HARVEST-WINS clauses, rescoped in
v1.3.0 after exactly this reasoning) had all three.

### Detection

```bash
# PRE-FILTER only — grep finds candidates, reading decides. Sweeping for the words we happened to
# use is the failure mode this class already recorded (the 2026-08-10/11 grep-vs-read lesson).
grep -nEi "where the|if the|if available|if present|when present|should the" \
  scripts/seed-protocol-prompts.ts lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts \
  | grep -iE "contract|harvest|chained|predecessor|report\.md|block|section"
```

Then for EACH hit ask the only question that matters:
**what guarantees the predicate's subject reaches THIS agent's context?**
If the subject rides a channel the agent may not receive and there is no else-branch, it is a live
instance. 2026-08-27 sweep: 186 raw → 96 delivery-shaped → 19 high-risk → **0 live**.

### The instrument

`contractPropagation` (`lib/agents/harness/contract-propagation-enrichment.ts`) is the first thing
that can see this class at all — it reports, per child, whether the subject actually arrived. Replay
any leg read-only with `npm run replay:contract-propagation -- <legTaskId>`. Extend it, rather than
inventing a second detector, when a new channel needs the same visibility.

### Lesson

**A guard is only as real as the delivery of its subject.** Prose review cannot catch this, because
the prose is correct — you have to trace the channel. And the failure is worse than silent: it is
*confidence-generating*, because a clean run under an inert guard reads as evidence the guard passed.
Before writing any conditional obligation, answer in the same breath what guarantees its subject
arrives; if nothing does, the sentence is decoration.
