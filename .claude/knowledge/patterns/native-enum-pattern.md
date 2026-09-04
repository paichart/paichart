# Pattern: z.nativeEnum() for Prisma Enums

**Confidence**: 98% | **Last Audited**: 2026-05-31
**Test Suite**: `npm run test:enum-parity` (69 tests, dual-layer)

## Rule

Use `z.nativeEnum(PrismaEnum)` instead of `z.enum([...])` when values come from a Prisma enum. This prevents drift — if the Prisma enum changes, the Zod schema updates automatically.

```typescript
// BAD: prone to drift
const StatusSchema = z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']);

// GOOD: auto-synced with Prisma
import { MCPWorkflowStatus } from '@prisma/client';
const StatusSchema = z.nativeEnum(MCPWorkflowStatus);
```

## Canonical Schemas

All 37 Prisma enums have `z.nativeEnum()` wrappers in `lib/validation/enum-validation.ts`. Import from there when possible:

```typescript
import { TaskPrioritySchema, POVStatusSchema } from '@/lib/validation/enum-validation';
```

> ⚠️ **`lib/mcp/server/config/tool-schemas.js` is the exception** — it loads from **both** webpack and bare-Node (paichart-mcp), so it **cannot** import the TS `enum-validation.ts` wrappers. It must use hardcoded `z.enum([...])` literals instead, guarded by `test-enum-parity`'s **literal-parity** checks (not `nativeEnum`). This is exactly where Sibling-Drift bugs breed — see below.

## Intentional z.enum() Exceptions (Audited Feb 2026)

These `z.enum()` usages are correct — no Prisma enum exists for these values:

| File | Values | Reason |
|------|--------|--------|
| `workflows/schemas.ts` | `executionMode`, `failureStrategy`, `category` | Workflow-specific, no Prisma enum |
| `orchestration-params.ts` | `executionMode`, `failureStrategy` | Same as above |
| `mcp-action-validation.ts:297` | `z.nativeEnum(TaskType)` | **Fixed Apr 2026** — was `z.enum([...])` subset that blocked PIPELINE type. Now uses nativeEnum. |
| `mcp-action-validation.ts` | `position`, `executionType`, `analysisType`, `timeRange`, `format` | MCP action parameters |
| `analytics-response.ts:150` | `['HIGH','MEDIUM']` | Intentional subset of `Priority` for recommendations |
| `analytics-response.ts:144` | Recommendation types | Analytics-specific |
| `dashboard-validation.ts` | `TimeRange`, `ExportFormat` | Dashboard-specific |
| `mcp-resources-validation.ts` | Resource types, sort fields | Resource-specific |
| `pov/templates/types.ts` | Field types, operators, widths | Template UI config |
| `tool-schemas.js` `prioritySchema` | `['URGENT','HIGH','MEDIUM','LOW']` | Mirrors Prisma `Priority` (Wave C CSD-1, 2026-05-23). Hardcoded literal — bare-Node load (see caveat above). Drift-guard: `test-enum-parity` literal-parity (`prioritySchema → Priority`). |
| `tool-schemas.js` `projectStatusFilterSchema` | POVStatus ∪ TaskStatus (9 values) | `project`'s `status` serves `pov.*` (POVStatus) **and** `task.list` (TaskStatus) — deliberate **union**; per-action validity enforced in handlers. Drift-guard: union assertion in `test-enum-parity` (2026-05-31). |

## Consolidated-Tool Params: Per-Action Enum (BC75 Sibling-Drift)

A consolidated tool (`project`, `perform`, `analytics`) routes several actions through **one** param schema. That single gate must satisfy the enum of **every action it serves** — not a convenient superset/subset of one of them. When the gate and a per-action handler disagree, you get [Sibling Drift](../domain/mcp/bug-class-registry.md) (BC75 family): the gate accepts a value the handler then rejects (confusing 400-after-pass), or accepts a value Prisma later 500s on.

**The gate is not the enforcement** — per-action validity lives in the handlers (`handleListPOVs` rejects task statuses, `handleListTasks` rejects POV statuses). So the gate should be the **union**, and the resolution of a mismatch is one of:
- **Widen the gate to the union** + drift-check it (e.g. `projectStatusFilterSchema`), OR
- **Normalize in the handler** to match a deliberately-wide gate (e.g. `task.list` priority mirrors `task.create`'s `URGENT→HIGH` alias map, 2026-05-31), OR
- **Narrow the gate** only if the value is invalid for *all* actions it serves.

Never resolve it by making the gate lie about what one action accepts. Audit: sweep each consolidated tool's param schema against the handlers' `valid*` arrays; treat each mismatch as a candidate (some are intentional subsets — see table above).

## Deferred: MCP Service Category

`MCP_SERVICE_CATEGORIES` constant in `lib/mcp/server/config/tool-schemas.js` could become a Prisma enum. Currently using extracted constant across 3 tool schemas (low drift risk).
