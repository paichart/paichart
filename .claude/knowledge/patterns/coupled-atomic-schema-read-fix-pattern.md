# Coupled-Atomic Schema + Read-Fix Pattern

**Type**: Architecture / Validation / Bug-Class Eradication
**Created**: 2026-05-15
**Confidence**: 95% ✅ (proven on 7 BC76 sites across the 2026-05-14/15 session)
**Status**: Production-proven (BC76 ERADICATED at 7 instances)

---

## Pattern Overview

### Problem

When eliminating a "validation bypass via post-safeParse raw-body read" (Bug Class 76), a naive partial fix silently NULLs database columns. The bypass-fix and the schema-completeness fix are not independently shippable — they're a coupled atomic unit, and the coupling is invisible to single-domain reviewers.

The mechanism:

```ts
// Before (BC76 bypass)
const data = await request.json();
const validation = MySchema.safeParse(data);
if (!validation.success) return 400;
// ❌ Reads from raw `data`, not `validation.data`
const { fieldA, fieldB, fieldC } = data;
await prisma.row.update({ data: { fieldA, fieldB, fieldC } });

// Naive partial fix #1: swap to validation.data WITHOUT schema audit
const validated = validation.data;
// ❌ If schema doesn't declare fieldC, Zod strips it →
//    validated.fieldC === undefined → Prisma SKIPS the column →
//    "user's update silently doesn't apply"
//    OR if column is non-nullable → "user's update WIPES the column to default"
const { fieldA, fieldB, fieldC } = validated;
await prisma.row.update({ data: { fieldA, fieldB, fieldC } });

// Naive partial fix #2: add schema fields WITHOUT swapping reads
// ❌ Refines/transforms in the new schema fields never run on data the
//    handler actually uses. The bypass is preserved.
```

This is the "silent NULL drop" trap. Without an atomic fix, every BC76 swap risks production regression on whichever fields the schema didn't declare.

### Solution

Schema expansion + read swap + smoke test ship in **one commit**. The commit must:

1. **Audit the handler's read surface FIRST** — every `body.X` / `data.X` access in the handler. Build a complete field set.
2. **Compare against the schema's declared fields**. Add every missing field with proper validation (refines on text, enums on type fields, length caps on arrays, etc.).
3. **Swap reads** `requestData.X` → `validated.X` atomically.
4. **Add a smoke test** with Layer 1 pattern checks that reject re-introduction of the raw-body read AND Layer 2 behaviour checks that verify each field survives validation + injection is rejected.
5. **Pre-deploy Phase 0** — run prod queries to verify the schema-expansion assumptions hold (e.g., no production rows have schema-rejected values).

### Results

Across the 7 BC76 sites fixed using this pattern (2026-05-14 to 2026-05-15):

- **Zero silent NULL drops** in production after deploy
- **188 dual-layer tests** added across 4 smoke-test files (`test-pov-create-direct-path`, `test-pov-stage-routes`, `test-task-handler-bc76`, `test-pov-update-route`)
- **Phase 0 caught 3 risk assumptions before deploy**: prompt cap bump validated as safe (max prod prompt = 1068 chars), dueDate clear-regression confirmed low-incidence (393/394 already NULL), status/priority safeParse-rejection ruled out as current threat (0 NULLs in prod)
- **Specialist review caught 1 silent recommendation drop**: arch-review final gate flagged BC75 NestedTaskInput risk; user's recommendation-coverage audit caught 3 more sec-ops-named refines silently missing from the consolidated plan. **Without the audit step, BC76 site #7 would have shipped with the title/description/inputContext attack vector still open.**

---

## The Pattern

### Step 1 — Build the handler-read field set

```bash
# Grep every nested-field access in the handler
grep -nE "\b(requestData|body)\.\w+(\.\w+)?" lib/path/to/handler.ts | sort -u

# For each match, note: is it a top-level read? nested array element?
# Build a complete inventory before touching the schema.
```

### Step 2 — Cross-reference against the schema

For each field the handler reads, verify the schema declares it. Missing fields fall into 3 categories:

| Category | Treatment |
|----------|-----------|
| Pure passthrough (e.g., `metadata.X` deep paths through `safeRecord()`) | Mark as legitimate dual-source exception with inline comment; do NOT swap to `validated.X` |
| Stored, validated value | Add to schema with proper refines/transforms |
| Transient request hint (positional cues, options flags) | Add to schema as request-only; OR mark as legitimate dual-source exception (depends on whether shape needs validation) |

### Step 3 — Atomic commit

One commit lands all of:

1. Schema expansion (`lib/validation/X.ts`)
2. Read swap (`lib/handlers/X.ts` or `app/api/.../route.ts`)
3. Smoke test (`scripts/test-X.ts`) wired into `test:all-validation`
4. Bug-class registry update (if applicable)

**Never split** schema expansion and read swap across commits — schema-only is a no-op; read-swap-only silently NULLs.

### Step 4 — Smoke test shape

**Layer 1 — Pattern checks** (locks the fix structurally):

```ts
// Strip comments first so security notes citing the anti-pattern don't trip guards
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');

test('handler reads validation.data (not raw)', () => {
  if (/\b(requestData|body)\.declaredField\b/.test(code)) {
    throw new Error('BC76 bypass re-introduced');
  }
});

test('schema declares "newField"', () => {
  const block = schemaSrc.match(/export const MySchema = z\.object\(\{([\s\S]*?)\}\)/);
  if (!new RegExp(`\\b${field}:`).test(block[1])) {
    throw new Error(`Schema missing "${field}"`);
  }
});
```

**Layer 2 — Behaviour checks**:

```ts
// Regression: clean payload parses and round-trips
test('clean payload parses', () => {
  const result = MySchema.safeParse({ /* all 22 fields */ });
  if (!result.success) throw new Error('Clean payload should parse');
});

// Injection: malicious content rejected on every text field
test('rejects injection on title', () => {
  const result = MySchema.safeParse({ title: '<script>alert(1)</script>' });
  if (result.success) throw new Error('Injection accepted');
});

// Schema completeness: previously-missing fields survive
test('executionStatus survives validation', () => {
  const result = MySchema.safeParse({ executionStatus: 'RUNNING' });
  if ((result.data as any).executionStatus !== 'RUNNING') {
    throw new Error('Field stripped — schema declaration incomplete');
  }
});
```

### Step 5 — Pre-deploy Phase 0

Run production queries to validate every risk assumption the schema expansion makes:

```sql
-- Field size bumps: confirm no existing data exceeds new cap
SELECT MAX(length("largeTextField")) FROM tasks;

-- Required-in-schema fields: confirm no production NULLs would cause new 400s
SELECT COUNT(*) FROM tasks WHERE "newRequiredField" IS NULL;

-- High-value field exposure: how many rows would be silently nulled by a botched swap?
SELECT COUNT(*) FROM tasks WHERE "executionStatus" IS NOT NULL;
```

Document results in `current-state-validation.md` in the review dir.

---

## Anti-Patterns to Avoid

### ❌ Splitting schema and read-swap across commits

```
PR 1: "Add missing schema fields"  ← no-op; safe by itself
PR 2: "Swap requestData → validated"  ← silently nulls fields if PR 1 forgot any
```

If PR 1 is incomplete, PR 2 ships a regression. **The fix is atomic by nature**; respect that.

### ❌ "Just add a refine on the text fields"

Sec-ops's minimum-viable fallback is "add refines to inner text fields without the read swap." This protects against new injection content reaching the DB, but it doesn't fix the schema-strip silent-NULL problem for existing data flows. If the audit shows the read-swap is needed for correctness, do both.

### ❌ Skipping Phase 0

Specialist confidence numbers are calibrated on assumptions about production state. Without Phase 0, you can't know whether the schema's new constraints will reject existing data. Phase 0 ruled out 3 of the 4 BC76 site #7 risks before they could become incidents.

### ❌ Trusting headline confidence numbers without coverage audit

Arch-review's final-gate synthesis emits pre-edit + post-edit projection numbers. These are only as good as the synthesizer's coverage audit. **Always traverse each specialist's named-recommendation list explicitly** — don't trust the synthesis to have caught everything. BC76 site #7 nearly shipped with 3 sec-ops-named refines silently dropped from the consolidated plan; the user's coverage audit caught them.

### ❌ Marking "legitimate dual-source" without explicit comment

If a handler reads `requestData.X` post-fix, mark it with an inline comment citing the legitimate-exception rule (e.g., "metadata.X is a permissive `safeRecord()` field; this sub-path is request routing, not a validated stored field"). The Layer 1 pattern check excludes commented contexts but requires the comment as documentation.

---

## When to Use

**Trigger**: a code review or audit identifies a "validation bypass via post-safeParse raw-body read" pattern in any handler.

**Mandatory** for:
- Endpoints that consume user-controlled JSON and write to Prisma
- Routes where text fields flow toward LLM context (agent prompts, task descriptions, etc.)
- Any handler that mixes `validation.data` reads with raw `body` / `requestData` reads

**Not needed** for:
- Type guards using `safeParse(...).success` only (no .data consumed)
- Endpoints where the schema is a strict gate and the handler doesn't read input again after parsing

---

## Implementation Checklist

Before opening the PR:

- [ ] Built complete handler-read field inventory (every `body.X` / `data.X` access)
- [ ] Cross-referenced inventory against schema's declared fields
- [ ] Categorized missing fields (stored value / transient hint / legitimate passthrough)
- [ ] Added missing fields to schema with proper refines/transforms
- [ ] Swapped reads `requestData.X` → `validated.X` (single commit)
- [ ] Added Layer 1 + Layer 2 smoke test
- [ ] Wired test into `test:all-validation`
- [ ] Ran Phase 0 production queries; documented in `current-state-validation.md`
- [ ] Updated bug-class registry (BC76 site count)
- [ ] No new `requestData.X` reads in handler code (comments OK)
- [ ] Build + typecheck + full validation suite green
- [ ] Pre-edit + post-edit confidence projection emitted by arch-review final gate
- [ ] Explicit recommendation-coverage audit: every specialist's named recommendation mapped to "folded / deferred / declined"

---

## Related Patterns

- **`two-execution-path-drift-pattern.md`** — sibling pattern at the dual-execution-path layer (engine vs stream). Same coupled-atomic principle, different surface.
- **`boundary-contract-wrapper-enforcement-pattern.md`** — when N writers assemble the same JSONB blob, funnel through a wrapper. BC76 is the schema-level cousin.
- **`api-security-withPOVAccess-pattern.md`** — auth-layer dual-axis (read-cast + write-back) sibling.

## Bug Class Reference

- **`.claude/knowledge/domain/mcp/bug-class-registry.md` § Bug Class 76** — full registry entry with all 7 confirmed instances and the sweep-history lessons.

---

## Evidence

| Session | Sites fixed | Commits | Key learnings |
|---------|------------|---------|---------------|
| 2026-05-14 (initial sweep) | 3 (POST /api/pov direct, stage POST, stage PUT) | `8f883324`, `96ae7ad0` | Atomic commit principle established; smoke-test Layer 1 pattern checks proved decisive |
| 2026-05-14 (handler-layer sweep) | 3 (lib/tasks/handlers/{task,post}.ts) | `bfab85bf` | Lesson: bug-class sweeps must cover route AND handler layers; initial grep was scoped to `app/api/` only |
| 2026-05-15 (Protocol 2 + Phase 0 site #7) | 1 (PUT /api/pov via put.ts) | `408a4f67` | Lesson: pre-edit confidence numbers can hide silent recommendation drops. Steve's coverage audit caught 3 sec-ops-named refines silently missing from the consolidated plan after arch-review's final gate had blessed it. The plan's "Ship with mechanical edits" verdict held — but only after the audit step caught the drops. |

---

## Why This Pattern Belongs in the Registry

Three independent specialists missed pieces of the BC76 site #7 fix in the same review session. The arch-review final gate (per protocol v1.2 § Post-Edit Confidence Projection) was supposed to be the catch — but it caught only 1 of 4 silent drops. The pattern needs to be referenced by name in future BC76-class fixes so synthesizers can structurally walk the checklist instead of relying on judgment.

**Specifically, future arch-review final-gate runs should**:

1. Open this pattern doc
2. Walk every checklist item in the "Implementation Checklist" section
3. Emit a post-edit projection ONLY if every item is covered
4. Flag missing items as ship-blockers, not bookkeeping

Without this anchor, the pattern of "3 specialists each missed something different, synthesis missed the gaps" repeats.
