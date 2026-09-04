# Smoke Test, Sweep & Standardize Protocol

**Version**: 1.0
**Created**: 2026-02-22
**Author**: Claude Opus 4.6 + Steve Terry
**Purpose**: End-to-end session workflow for discovering bugs via functional testing, eradicating bug families, and standardizing code patterns in a single focused session
**Proven By**: Feb 22, 2026 session - 8 fixes, 3 bug classes addressed, 12 inline patterns standardized, 10 commits, zero regressions

---

## Executive Summary

A structured 4-phase approach that turns a routine smoke test into a high-value session: discover real bugs through functional testing with log correlation, eradicate entire bug families, hunt for new families while context is fresh, then standardize the code you touched. Each phase feeds the next.

**Key Insight**: The smoke test reveals WHERE bugs live. The sweep reveals HOW MANY exist. The hunt reveals WHAT ELSE is nearby. Standardization locks in the gains.

**Session Duration**: 2-4 hours (can stop after any phase)
**ROI**: 50-100x (one session finds bugs, eradicates families, AND improves code quality)

---

## When to Use

- After deploying infrastructure changes (logging migration, middleware extraction, refactors)
- Quarterly health checks on critical subsystems
- When you have 2-4 hours of focused time
- After adding new shared utilities/middleware that existing code should adopt

**Prerequisites**:
- A smoke test prompt or essentials test covering the target subsystem
- Structured logging (pino) for log correlation
- Access to the bug class registry

---

## Phase 1: Smoke Test & Correlate

**Goal**: Run functional tests against the live system and correlate structured logs to find real issues.
**Time**: 30-60 minutes
**Output**: List of findings (bugs, warnings, inconsistencies)

### Steps

1. **Run the essentials smoke test**
   - Use MCP tools to exercise the core lifecycle (create, read, update, delete)
   - Follow the test prompt step-by-step
   - Record PASS/FAIL/FINDING for each test

2. **Correlate pino logs**
   - Check `stderr` output for structured JSON logs during each test
   - Look for: `warn` level entries, unexpected field values, missing fields
   - Pattern: Run test → check log → note discrepancies

3. **Classify findings**

   | Classification | Action | Example |
   |---------------|--------|---------|
   | **Bug** | Fix immediately (Phase 2) | `updatedFields: ["0","1",...,"74"]` |
   | **Warning** | Investigate in Phase 3 | Inconsistent auth pattern |
   | **Clean** | No action | Test passes, logs correct |

4. **Document findings**
   - Record each finding with: endpoint, expected vs actual, log correlation
   - Note which bug class family it might belong to (check registry)

### Checklist
```
[ ] Smoke test prompt identified/created
[ ] All core lifecycle tests executed
[ ] Pino logs checked for each test
[ ] Findings classified (Bug/Warning/Clean)
[ ] Bug class family identified for each Bug finding
```

---

## Phase 2: Trace, Fix & Sweep

**Goal**: Fix each Bug finding, then sweep the entire codebase for the same bug family.
**Time**: 30-90 minutes
**Output**: All instances of each bug family fixed
**Protocol**: Follows Bug Class Eradication Protocol (Phase 6)

### Steps

1. **Trace the bug to root cause**
   - Read the handler code where the bug manifests
   - Identify the root cause pattern (e.g., "string where object expected")
   - Check the bug class registry — is this a known family?

2. **Apply the known defense**
   - If known family: Use the established guard (e.g., `ensureObject()`)
   - If new family: Create inline fix, note for registry addition

3. **Sweep for siblings**
   - Use parallel grep searches for the vulnerable pattern across the subsystem:
     ```bash
     # Example: Find all sites where Object.keys() operates on MCP-sourced params
     grep -rn 'Object.keys(' lib/mcp/server/tools/hub/ --include='*.js'

     # Example: Find all Prisma writes of MCP-sourced JSON fields
     grep -rn 'prisma.*create\|prisma.*update' lib/mcp/server/tools/hub/ --include='*.js'
     ```
   - For each site found: Is it guarded? Could the data arrive as the wrong type?
   - Fix all unguarded sites

4. **Update documentation**
   - Update the pattern doc (e.g., `transport-boundary-argument-coercion-pattern.md`)
   - Update the bug class registry with new sites and commits
   - Increase confidence score if sweep was thorough

5. **Verify fixes**
   - Re-run the failing smoke test(s)
   - Confirm the fix on production/staging
   - Clean up any test data created

### Checklist
```
[ ] Root cause identified for each Bug finding
[ ] Bug class family confirmed (new or existing)
[ ] Defense applied at the failing site
[ ] Sweep completed — all sibling sites found
[ ] All sibling sites guarded
[ ] Pattern doc updated
[ ] Bug class registry updated
[ ] Fixes verified (smoke test re-run)
```

---

## Phase 3: Hunt New Families

**Goal**: While you have deep context in the subsystem, look for entirely new bug classes.
**Time**: 30-60 minutes
**Output**: New bug classes identified, quick fixes applied

### Hunting Strategies

1. **Adjacent pattern search**
   - You just fixed a data type bug → search for other type confusion patterns
   - You just fixed a missing guard → search for other missing guards
   - You just fixed a boundary bug → search for other boundary crossings

2. **Registry gap analysis**
   - Read the bug class registry summary dashboard
   - Which MONITORED classes haven't been re-audited recently?
   - Are there POTENTIAL classes that could be promoted?

3. **Targeted sweeps** (pick 2-3 from this menu)

   | Hunt | Grep Pattern | What You're Looking For |
   |------|-------------|------------------------|
   | Missing await | `.catch(() => {})` | Silently swallowed errors |
   | Unguarded JSON.parse | `JSON.parse(` without try-catch | Crash on malformed input |
   | String numbers | `body.limit`, `body.offset` without parseInt | Type confusion in Prisma |
   | CJS/ESM boundary | `await import(` in `.js` files | Missing CJS bridges |
   | Unconstrained queries | `findMany({` without `take:` | Unbounded result sets |
   | Inconsistent patterns | Compare how handlers do the same thing | Standardization opportunities |

4. **Quick-fix or catalog**
   - If a fix is < 5 minutes: Fix it now
   - If it's a new bug class: Add to registry as IDENTIFIED or MONITORED
   - If it requires deep analysis: Note for a future session

### Checklist
```
[ ] At least 2 hunting strategies executed
[ ] New findings classified (fix now vs catalog)
[ ] Quick fixes applied and committed
[ ] Bug class registry updated with new entries
[ ] Opportunities noted for next session
```

---

## Phase 4: Standardize & Consolidate

**Goal**: Align all code you touched to shared patterns and middleware. Lock in the gains.
**Time**: 30-60 minutes
**Output**: Consistent code patterns across the subsystem

### Steps

1. **Identify inconsistencies noticed during Phases 1-3**
   - During the sweep, you read many handlers — which ones do the same thing differently?
   - Common targets: auth extraction, error handling, logging, validation, cache invalidation

2. **Check middleware/utility adoption**
   - List all functions exported by shared middleware
   - For each function: Which handlers use it? Which do it inline?
   - Prioritize: Most-used patterns first

3. **Migrate inline patterns to shared utilities**
   - Replace inline code with middleware calls
   - If middleware doesn't support a pattern (e.g., dual-path auth): enhance it first, then migrate
   - Verify no behavior change (same fields extracted, same errors thrown)

4. **Verify no remaining inline patterns**
   ```bash
   # Example: Verify all auth extraction uses middleware
   grep -rn 'context\.user\.' lib/mcp/server/tools/hub/ --include='*.js' | grep -v JSDoc

   # Example: Verify all cache invalidation uses middleware
   grep -rn 'clearCache\|clearHealthCache' lib/mcp/server/tools/hub/ --include='*.js' | grep -v middleware
   ```

5. **Commit with clear message**
   - Separate refactor commits from bug fix commits
   - Note the net line reduction (standardization should reduce code)

### Checklist
```
[ ] Inconsistencies from Phases 1-3 cataloged
[ ] Middleware functions mapped to handler adoption
[ ] All inline patterns migrated to shared utilities
[ ] Middleware enhanced if needed for full adoption
[ ] Verification grep confirms no remaining inline patterns
[ ] Committed and pushed (separate from bug fix commits)
```

---

## Session Template

Copy this template to track a full session:

```markdown
## Session: [Subsystem] Smoke Test, Sweep & Standardize
**Date**: YYYY-MM-DD
**Subsystem**: [e.g., MCP Hub handlers]
**Smoke Test**: [e.g., hub-and-logging-essentials-test.md]

### Phase 1: Smoke Test Results
| # | Test | Result | Finding |
|---|------|--------|---------|
| 1 | services.discover | PASS | |
| 2 | registry.register | PASS | |
| ... | ... | ... | ... |

**Findings**: [list]

### Phase 2: Trace, Fix & Sweep
| Bug | Root Cause | Family | Sites Found | Sites Fixed |
|-----|-----------|--------|-------------|-------------|
| ... | ... | BC# | N | N |

### Phase 3: Hunt New Families
| Hunt | Strategy | Findings |
|------|----------|----------|
| ... | ... | ... |

### Phase 4: Standardize
| Pattern | Before | After | Handlers Migrated |
|---------|--------|-------|-------------------|
| ... | inline | middleware | N |

### Commits
| Hash | Description |
|------|-------------|
| ... | ... |

### Metrics
- Tests: X pass / Y total
- Bug families addressed: N
- Sites fixed: N
- Lines removed (net): N
- Handlers standardized: N
```

---

## Evidence: Feb 22, 2026 Session

The session that produced this protocol:

### Phase 1 Results
- **Smoke test**: `hub-and-logging-essentials-test.md` — 12/13 pass, 1 finding
- **Finding**: `registry(action: "update")` returned `updatedFields: ["0","1",...,"74"]` instead of field names
- **Log correlation**: Pino logs showed the tool executed without error — silent data corruption (Variant B-2)

### Phase 2 Results
- **Root cause**: `args.updates` arrived as JSON string from MCP transport → `Object.keys()` on string returns character indices
- **Family**: Bug Class 1 (Transport Boundary Coercion) — new Variant B-2
- **Sweep**: Found 2 more sites in `workflow-tools-handler.js` (steps array + step arguments)
- **Total**: 3 new sites fixed, pattern doc updated to 99% confidence

### Phase 3 Results
- **Missing await hunt**: Found P1 (workflow catch swallow) — fixed
- **Form boundary type loss hunt**: Found 1 site (POST /api/tasks/search offset) — fixed
- **CJS/ESM boundary hunt**: All bridges present — clean
- **JSON.parse hunt**: All guarded — clean
- **Bug class registry**: Updated BC1 with 6 new sites, 3 new commits

### Phase 4 Results
- **Inconsistency found**: Auth extraction — 4 handlers used `extractAuthContext()`, 5 used inline `context.user.id`
- **Middleware enhanced**: `extractAuthContext()` now supports dual-path (MCP direct + API forwarded)
- **Migrated**: 5 handlers + workflow (5 methods) = 12 inline patterns → 1 shared function
- **Net reduction**: -56 lines across all standardization commits

### Session Totals
- **Commits**: 10
- **Bug families addressed**: 3 (BC1 extended, BC3, new P1)
- **Sites fixed**: 8
- **Handlers standardized**: 9 (all hub handlers)
- **Net lines removed**: ~56
- **Regressions**: 0

---

## Related Protocols & Resources

| Resource | Relationship |
|----------|-------------|
| Bug Class Eradication Protocol | Phase 2 uses this for sweep methodology |
| Bug Class Registry | Read in Phase 3, updated in Phases 2-3 |
| Hub Essentials Smoke Test | Example Phase 1 test prompt |
| Transport Boundary Pattern | Example pattern doc updated in Phase 2 |
| Discovery-First Workflow | This protocol IS a discovery workflow for bugs |

---

**Created By**: Claude Opus 4.6 + Steve Terry
**Date**: February 22, 2026
**Validated**: Single session, Feb 22, 2026 (10 commits, 0 regressions)
