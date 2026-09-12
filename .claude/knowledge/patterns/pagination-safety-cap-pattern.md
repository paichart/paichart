# Pagination Safety Cap Pattern

**Type**: Performance & Security Pattern - Query Bounding
**Created**: February 20, 2026 (Phases 1-5 Pagination Gap Remediation)
**Confidence**: 95% - Production-proven across 233+ call sites
**Status**: Production-deployed, 63%+ coverage with validation script

---

## Pattern Overview

**Problem**: Unbounded `findMany()` calls return all matching rows. A table with 10,000 rows returns all 10,000 on every request, causing memory spikes, slow responses, and DoS vulnerability.

**Solution**: Every `findMany()` call gets a `take` parameter — either full pagination (user-facing) or a safety cap (internal/aggregation).

**Results**: 50-70% memory reduction, 40-60% faster response times, DoS vector closed

---

## Two Tiers of Protection

### Tier 1: Full Pagination (User-Facing Endpoints)

Use `parsePaginationParams` + `paginationResponse` for endpoints that return lists to the UI.

```typescript
import { parsePaginationParams, paginationResponse } from '@/lib/utils/pagination';

export async function GET(request: NextRequest) {
  const { limit, offset } = parsePaginationParams(request.nextUrl.searchParams);
  const where = { povId };

  const [data, total] = await Promise.all([
    prisma.task.findMany({ where, take: limit, skip: offset, orderBy: { createdAt: 'desc' } }),
    prisma.task.count({ where }),
  ]);

  return NextResponse.json(paginationResponse(data, total, limit, offset));
}
```

**Defaults**: `limit=50`, `maxLimit=100`
**Response shape**: `{ data: T[], pagination: { total, limit, offset, hasMore } }`
**Used by**: 10+ user-facing endpoints

### Tier 2: Safety Caps (Internal/Aggregation)

For service-layer functions, background jobs, and aggregation queries, add `take: N` directly. No response shape changes needed.

```typescript
// Before (unbounded):
const tasks = await prisma.task.findMany({ where: { povId } });

// After (safety cap):
const tasks = await prisma.task.findMany({ where: { povId }, take: 500 });
```

**Convention**: Add `take` as the LAST property in the findMany argument.

---

## Cap Value Guide

| Data Type | Typical Cap | Rationale |
|-----------|------------|-----------|
| Phases per POV | `take: 50` | ~3-10 phases per POV, defense-in-depth |
| Stages per phase | `take: 200` | ~5-20 stages, generous bound |
| Tasks per phase/POV | `take: 500` | Largest common result set |
| Templates/schemas | `take: 100` | Finite catalog |
| Users/team members | `take: 200` | Bounded by org size |
| Notifications | `take: 200` | Per-user scoped |
| Geographic data | `take: 300` | ~200 countries |
| Activity logs | `take: 200` | Per-entity scoped |
| Analytics (time-bounded) | `take: 5000` | Historical analysis |
| Migration/batch scans | `take: 5000` | One-time operations |
| Dependency graph | `take: 5000` | Full subgraph needed |
| Batch lookups (`{ in: ids }`) | `take: 200` | Bounded by input array |
| Specialist children per pipeline stage (harness enrichments / mechanical nets) | `take: 50` | ~3-8 children per leg stage; harvest/author are earliest-created so `createdAt asc` + cap cannot drop them. Precedent: `CHILD_SCAN_CAP` (contract-propagation), `STAGE_CHILD_SCAN_CAP` (rollback-containment, 2026-09-11 — two bare reads blocked a deploy at 89.6%) |

**Rule of thumb**: Use `2-3x` the expected maximum result set size.

**Before adding ANY `take`, apply the search-vs-aggregate test** (earned 2026-09-11, two harness reads
given OPPOSITE treatments the same hour): does the caller **search** the rows for one (find the reviewer
by role among siblings — cap it; ordering makes the cap safe) or **aggregate** over them (count all
children to decide terminal-ness — `harnessModeResolver.ts`; ALLOWLIST with a reason)? A cap on an
aggregate does not truncate the result, it silently returns a **different answer** — the same class as
`graph.ts`'s topological sort. An unbounded read costs a coverage point; a wrongly-capped aggregate
costs a wrong decision, and only one of those is loud.

### The ratio-gate class — this gate is not the only one

`validate:pagination` and `validate:logging` are both **percentage-of-corpus** gates, and both failed
within 24 hours (2026-09-11/12) on changes that introduced **no defect of the kind they exist to catch**:
two correctly-bounded reads took pagination to 89.6% vs 90%, and three modules that correctly log
nothing took pino adoption to 39.9% vs 40%.

The shared property is the gate's SHAPE, not either change:

- the cost of a **correct addition** lands on whoever ships next, not on whoever wrote the code;
- a **pure module** — precisely what this codebase keeps asking people to write — is the worst case
  for both denominators, because it is counted as a non-participant rather than as out of scope;
- and the tempting fix (bound a read you don't need to bound; import a logger you don't need) makes
  the gate something you *satisfy* rather than something that *measures* you.

Before adding or re-tuning a ratio gate, ask what its denominator is counting, and whether a file
that does not participate at all should be in it. `validate:logging`'s denominator was corrected to
"files that log" on 2026-09-12 for exactly this reason, and its thresholds were recalibrated in the
same commit — a threshold is only meaningful against the denominator it was measured on.

⚠️ **The gate runs at the margin, not at 100%** (2026-09-11: 90.2% effective, target 90). Adding a
mechanical net or enrichment with a stage-children scan is the recurring way to trip it — bound the
read at write time; `validate:pagination` is NOT in the pinned pre-push suites most harness work runs.

---

## Intentionally Unbounded Calls

Some calls are correct without `take`:

| Category | Reason | Example |
|----------|--------|---------|
| Export endpoints | Full data by design | `activities/export` |
| Graph traversal | Needs complete subgraph | `check-circular-dependency` |
| Small static tables | <50 rows guaranteed | `rolePermission`, `role` |
| Bounded by IN clause | Input array limits results | `{ in: taskIds }` |
| Post-create fetch | Bounded by just-created rows | `tx.artifact.findMany` after create |

**Convention**: Document in the `validate:pagination` allowlist with reason.

---

## Validation

```bash
# Run pagination coverage check
npm run validate:pagination

# Expected output:
# Total findMany calls:     ~300
# Bounded (has take):        233+ (75%+)
# Intentionally unbounded:   ~35
# Effective coverage:        90%+
# ✅ Pagination validation PASSED
```

The validation script (`scripts/validate-pagination.ts`) uses brace-matching to accurately detect `take` parameters within each `findMany` argument block.

---

## Implementation Phases

| Phase | Scope | Caps | Commit |
|-------|-------|------|--------|
| Phase 1 | User-facing endpoints | ~40 | `7a35c2f4` |
| Phase 2 | Analytics & dashboard | 20 | `52c8911e` |
| Phase 3 | MCP & internal tools | 28 | `db1ea51c` |
| Phase 4 | Service layer | 94 | `e9b9eca6` |
| Phase 5 | Cleanup & validation | Script + pattern | — |

---

## Anti-Patterns

### Don't: Change return types for safety caps
```typescript
// BAD: Changing interface just to add take
async function getTasks(povId: string): Promise<{ data: Task[]; total: number }> { ... }

// GOOD: Just add take, keep existing interface
async function getTasks(povId: string): Promise<Task[]> {
  return prisma.task.findMany({ where: { povId }, take: 500 });
}
```

### Don't: Use arbitrary large caps
```typescript
// BAD: Cap so high it's meaningless
prisma.task.findMany({ take: 999999 });

// GOOD: Cap based on realistic maximum
prisma.task.findMany({ take: 500 }); // Tasks per POV rarely exceed 200
```

### Don't: Add take to findFirst/findUnique
```typescript
// UNNECESSARY: These already return 0-1 results
prisma.task.findFirst({ where: { id } });
prisma.task.findUnique({ where: { id } });
```

---

## Related Patterns

- **parallel-query-optimization-pattern.md** — Use `Promise.all([findMany, count])` for pagination
- **api-efficiency-patterns.md** — Query scoping and N+1 prevention
- **api-security-withPOVAccess-pattern.md** — POV-scoped access control
