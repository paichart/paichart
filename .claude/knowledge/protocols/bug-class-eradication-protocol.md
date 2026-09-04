# Bug Class Eradication Protocol

**Version**: 1.0
**Created**: 2026-02-16
**Author**: Claude Opus 4.6 + Steve Terry
**Purpose**: Systematic methodology for discovering, classifying, and eradicating entire families of bugs across the codebase
**Proven By**: Transport Boundary Coercion eradication (Feb 2026) - 13 sites fixed, zero regressions

---

## Executive Summary

When a single bug is discovered, it often belongs to a **bug class** - a family of bugs sharing the same root cause that manifests at multiple **sites** across the codebase. This protocol transforms a single bug fix into systematic eradication of the entire class, preventing future occurrences.

**Key Insight**: Fixing one bug takes 30 minutes. Eradicating its entire class takes 2-3 hours but prevents dozens of future incidents.

**ROI**: 20-50x (one session prevents months of future debugging)

---

## Terminology

| Term | Definition | Example |
|------|-----------|---------|
| **Bug class** | A family of bugs sharing the same root cause pattern | "Transport boundary coercion" |
| **Site** | A specific code location where a bug class can manifest | `service-call-handler.js:412` |
| **Guard** | Defensive code that prevents the bug at a site | `ensureObject(args, {}, 'label')` |
| **Guarded site** | A site with an existing guard | Already has typeof check |
| **Unguarded site** | A site vulnerable to the bug class | Missing typeof check |
| **Sleeper** | An unguarded site that hasn't failed yet (works by accident) | Internal call that could receive external data |

---

## When to Use This Protocol

**Trigger**: Any of these situations:
- A bug is discovered that involves data transformation or boundary crossing
- A fix requires the same pattern applied in more than one place
- The root cause is a systemic assumption rather than a logic error
- You suspect "if this failed here, it could fail elsewhere"

**Not needed for**:
- One-off logic errors (wrong variable, off-by-one)
- UI-only bugs (layout, styling)
- Configuration issues

---

## Phase 1: Triage - Classify the Bug (15 min)

### Step 1.1: Identify the Root Cause Pattern

Ask these questions about the original bug:

1. **What data transformation failed?** (type mutation, field loss, format change)
2. **What boundary did data cross?** (transport, process, API, database, UI)
3. **Is the root cause in user code or infrastructure?** (framework, transport, ORM)
4. **Could this same transformation happen elsewhere?** (YES = bug class)

### Step 1.2: Name the Bug Class

Use the pattern: `[Boundary Type] [Transformation Type]`

Examples:
- "Transport boundary coercion" (MCP transport mutates object → string)
- "Prisma Json column ambiguity" (ORM returns string or object unpredictably)
- "Form boundary type loss" (HTML forms send everything as strings)

### Step 1.3: Write the Bug Class Definition

Document in a single paragraph:
- **What**: What data transformation happens
- **Where**: What boundary it crosses
- **Why**: Why the transformation is silent/unexpected
- **Impact**: What breaks when it manifests

---

## Phase 2: Audit - Find All Sites (30-60 min)

### Step 2.1: Craft Detection Grep Commands

Based on the bug class, write grep commands that find ALL potential sites:

```bash
# Template: Find all boundary-crossing points
grep -rn '[BOUNDARY_PATTERN]' --include='*.{js,ts,tsx}' | grep -v node_modules

# Template: Find unguarded sites (sites without the fix pattern)
grep -B5 '[BOUNDARY_PATTERN]' --include='*.{js,ts,tsx}' -rn | grep -v '[GUARD_PATTERN]'
```

#### Two-axis sweep checklist (added 2026-04-25 after BC2 Phase 4 lesson)

For data-shape bug classes (Bug Class 2 "Prisma Json Column Ambiguity",
Bug Class 1 "Transport Boundary Coercion", and any future siblings),
your grep set MUST cover BOTH read and write axes:

| Axis | What you're looking for | Example grep | Bug variant |
|---|---|---|---|
| **Read-cast** | Reads of the boundary value that bypass type guards | `as Record<string, ...>`, `JSON.parse`, `... \|\| {}` without guard | Read crash / silent corruption on stringified jsonb |
| **Write-back** | Writes that whole-replace the boundary value when shallow-merge was intended | `data.X \|\| current.X`, `data: validated` (where validator marks fields optional), `prisma.update({data: {jsonbCol: incoming}})` | Partial-PUT clobber / write-back corruption |

**Why both**: BC2's 2026-02 Phase 3 audit only swept read-cast variants
(`as Record<string, unknown>`). The 2026-04-25 Phase 4 sweep discovered
two missed P0 sites — `phase.ts:updateStage` and
`agent-templates/[templateId]/route.ts:224` — both write-back patterns
that the original grep set didn't cover. The validator-marks-optional
+ Prisma whole-replace pattern is a particularly easy miss because the
bug only manifests on partial PUTs.

**Concrete grep checklist for jsonb write-back-corruption**:

```bash
# 1. Direct jsonb-named writes
grep -rEn 'prisma\.\w+\.update.*metadata' --include='*.ts' lib/ app/

# 2. Shallow-merge candidates (existing pattern for verification)
grep -rEn '\{ \.\.\.[a-zA-Z]+(metadata|Metadata|Meta).*\}' --include='*.ts' lib/ app/

# 3. Direct domain prisma updates (whole-replace via `a || b` semantic)
grep -rEn 'prisma\.(stage|phase|pOV|task|workflow|agent[A-Z]).update' --include='*.ts' lib/ app/

# 4. Validated PUT routes (Zod-validated input passed directly to Prisma update)
grep -rln 'data: validated\|data: updateData\|data: validationResult\.data' app/api/ lib/
# For each hit: trace whether the validator marks any jsonb fields optional.
# If yes, partial PUT will whole-replace those fields → P0 fix needed.
```

**Default rule**: when scoping a sweep, ask "what does this bug class
look like at WRITE sites" — not just "where do we read this kind of
data". Many data-shape bugs have a write variant that mirrors the
read variant; capturing both axes prevents follow-up sweeps months
later.

#### Sweep scoping rules (added 2026-06-11 after the kid-centralization misses)

> **Canonical standalone procedure**: `drift-sweep-protocol.md` (Protocol 11) — this section is the eradication-context instance of its Part A.

The 2026-06-11 kid-default eradication (9 sites) initially missed 3 of them,
each for a DIFFERENT scoping reason. Generalize the two-axis lesson: every
audit sweep must check its scoping on three more axes:

| Axis | The miss it prevents | Rule |
|---|---|---|
| **Path** | `app/api/auth/jwks/route.ts` ×2 missed by `grep lib/ mcp-server-http-clean.js scripts/` ("OAuth lives in lib/" habit). Same class as 2026-06-06's `middleware/` HS256-verifier miss — **3rd occurrence**. | Grep **repo-wide** for the inventory pass. Path-scope only the FIX pass, never the FIND pass. |
| **File-type** | `production-deploy.yml` fallback missed by `--include='*.ts' --include='*.js'` (note: the template grep at the top of this section has this exact filter). | Run a second literal pass with NO extension filter — CI workflows, shell scripts, and config files are code-adjacent literal carriers. |
| **Value vs. shape** | `jwt-status/route.ts` fell back to `\|\| 'unknown'`, not the stale kid — structurally invisible to every value grep. Found only by the shape grep (`JWT_KEY_ID \|\| '`). | Grep BOTH the stale value AND the pattern shape. A behavior-duplicate carries the bug without carrying the literal. |

**The defense that actually worked — prove-before-write**: when you document
an invariant grep with an expected count ("expect ZERO"), RUN it before
committing the doc. A mismatch IS a finding — never adjust the expectation
to fit the tree ("expect ≤1, known straggler" launders the bug into the
baseline). Both late catches on 2026-06-11 came from this, not from a
better first grep.

### Step 2.2: Verify Each Candidate (CRITICAL)

**Grep finds candidates, not confirmed sites.** Grep-only classification has an 85% false positive rate (proven: Bug Class 2 Phase 3 — 6 of 7 sites were misclassified). For each candidate:

1. **Read the file in full context** — not just the grep match with 3 lines. Understand the function, its callers, and what happens to the data.
2. **Verify against the source of truth** — for Prisma Json columns, check `schema.prisma`. For transport boundaries, check the actual transport path. Don't assume from variable names.
3. **Trace the data flow** — determine if the site is:
   - **Write-back** (reads → transforms → writes back to DB) → P0 CRITICAL
   - **Read-only with downstream impact** (reads → passes to function that breaks on wrong type) → P1 HIGH
   - **Read-only for display** (reads → maps to API response) → P2 MEDIUM
4. **Check for false positives** — common patterns that look like bug class sites but aren't:
   - Type guard functions (cast after typeof check — safe)
   - Reduce accumulator initializers (`{} as Record<string, number>` — not a Prisma read)
   - Type narrowing in validation code

### Step 2.3: Categorize Every Verified Site

For each **verified** site, classify it:

| Category | Criteria | Action |
|----------|----------|--------|
| **P0 - Write-back corruption** | Reads data, transforms, writes back to DB | Fix immediately (highest risk) |
| **P1 - Feature failure** | Read-only but feature breaks on wrong type | Fix immediately |
| **P2 - Response issue** | Read-only for API/display, preserves null semantics | Fix with null-preserving guard |
| **P3 - Defense-in-depth** | Internal but receives external data indirectly | Add guard for safety |
| **False positive** | Not actually a bug class site | Document why and exclude |

### Step 2.4: Create Site Inventory

Build a table of ALL verified sites (with false positives documented separately):

```markdown
| # | File | Line | Category | Column/Boundary | Data Flow | Action |
|---|------|------|----------|-----------------|-----------|--------|
| 1 | file.ts | 123 | P0 | POV.metadata | Read-modify-write | Add guard |
| 2 | other.ts | 456 | P2 | Activity.metadata | Read-only response | Add null-preserving guard |

### False Positives (excluded)
| File | Line | Why |
|------|------|-----|
| guard.ts | 8 | Type guard function, not a Prisma read |
```

---

## Phase 2.5: Enumeration Validation (5-15 min)

**Added 2026-05-23 after Wave A C3 sibling miss + COST_REDUCTION drift miss.** The pattern: Tier 2 sweeps fix the sites the auditor enumerated but leave novel siblings unfixed. The enumeration step itself is the risky step — site verification (Step 2.2) only checks the sites you found, not the sites you missed. This phase forces two questions to be answered explicitly before progressing.

### Question 1: Sibling-branch sweep (for resolver/dispatcher/router bugs)

If the buggy code lives in a function with **multiple numbered priorities, branches, or routes** (stage-resolver Priority 1-7, MCP action dispatcher, route handler, etc.):

- [ ] List every priority/branch/route in the function
- [ ] For each, ask: "Does this branch consume the same parameter type the bug class targets? (phaseId, stageId, userId, povId, ...)"
- [ ] Mark each branch as: **fix-target** / **already-safe (why)** / **N/A (different param)**

**If you mark a branch "already-safe" you MUST cite the safeguard.** Implicit safety = unverified safety.

**Proven by**: Wave A C3 (2026-05-23) shipped Priority 1 (stageId) only; Round 2 hardening discovered identical bug in Priority 2 + 5 + 5.5 (all consuming caller-supplied `phaseId`). Same file, same threat model, missed because the sibling sweep wasn't done at audit time. Fix added at 759ecdc5 via shared `assertPhaseInPov` helper across all 3 branches.

### Question 2: Source-of-truth completeness check (for enum/literal drift bugs)

If the bug class is an enum literal that drifts from a source of truth (Prisma, schema.json, OpenAPI, well-known constants):

- [ ] Identify the source of truth (Prisma enum definition, schema constant, etc.)
- [ ] **Diff the WHOLE source enum against the schema literal in both directions** — not just the one missing value you noticed
- [ ] List every divergence (missing values, phantom values, ordering)
- [ ] Fix ALL divergences in the same commit, not just the one that fired

**Proven by**: COST_REDUCTION miss (2026-05-23, 3f90867d). I noticed PERFORMANCE_ENHANCEMENT + QUALITY_IMPROVEMENT were the prior Wave C fix; the audit found COST_REDUCTION still missing. If two values had been missing simultaneously and only one was salient, the surgical fix would have shipped with the second value still unfixed. The two-direction diff catches both at once.

### Question 3: Systemic check requirement (for ALL Tier 2 fixes)

Before declaring the fix complete:

- [ ] **Have you added a systemic check that would catch this bug class going forward?** Examples: CI parity test, shared guard helper, lint rule, type-system constraint.
- [ ] If yes: document what the check covers and any blind spots
- [ ] If no: justify why no systemic check applies (e.g., "fix is a one-time data correction")

**Why this is mandatory at this phase, not later**: it's much easier to write the CI test while you have full context (3-5 min). Adding it months later requires re-deriving the audit. The systemic check is the ONLY thing protecting against the next instance of the same class.

**Proven by**: test:enum-parity literal-coverage extension (3f90867d) catches future drift in 4 MCP enum schemas. Without it, the next time MCPRecommendationType grows a value, COST_REDUCTION-style drift would silently recur.

### Output of this phase

Update the bug-class registry entry with answers to all 3 questions. If any question is unanswered, you are NOT ready for Phase 3 — return to Phase 2 audit.

---

## Phase 3: Create Shared Defense (30 min)

### Step 3.1: Design the Guard Function

Create a single, shared utility that:
- Handles ALL variations of the bug class
- Has a clear, descriptive name
- Accepts a label parameter for debugging
- Provides a safe fallback
- Is importable from both TypeScript and JavaScript modules

### Step 3.2: Handle Architecture Constraints

Consider isolation boundaries:
- **Main app modules**: Can import from `lib/utils/`
- **Docker services**: Standalone - need inlined copy or `services/shared/`
- **Client-side code**: May need separate implementation
- **CommonJS vs ESM**: May need both formats

### Step 3.3: Write Unit Tests

Test the guard function with:
- Normal input (passthrough)
- Mutated input (the bug class transformation)
- Edge cases (null, undefined, arrays, nested objects)
- Invalid input (fallback behavior)

---

## Phase 4: Review (15-90 min, depends on tier)

Use **tiered review** based on confidence in site classification:

### Tier 1: Full Specialist Review (60-90 min)

**When**: First eradication of a bug class, novel guard patterns, or uncertain data model assumptions.

Follow the Specialist Review Protocol with at minimum:

| Specialist | Focus |
|-----------|-------|
| **boundary-contract-specialist** | Validate all sites found, check for missed boundaries |
| **architectural-review-specialist** | Validate shared utility design, import paths |
| **Domain specialist** (varies) | Validate domain-specific implications |

Incorporate consensus changes for:
- Missed sites (add to inventory)
- False positives (remove from inventory)
- Phase reordering (e.g., fix unguarded before refactoring guarded)
- Architecture improvements (e.g., inline vs shared import)

Target: **90%+ confidence** before implementation.

### Tier 2: Schema-Verified Discovery (15-30 min)

**When**: Extending an already-eradicated bug class using the same proven guard pattern to additional sites. All of these conditions must be met:

- [ ] The guard function is already proven (used successfully at 5+ sites with zero regressions)
- [ ] Every candidate was verified against the source of truth (Step 2.2)
- [ ] Every candidate's data flow was traced (read-only vs write-back)
- [ ] False positives were identified and excluded with documented rationale
- [ ] The fix is purely mechanical (same pattern, no architectural decisions)
- [ ] TypeScript compilation passes after changes (catches type mismatches)

**Skip specialist review** — the value of specialists is in catching wrong assumptions (data model errors, missed files). Schema-verified discovery already addresses those failure modes.

**Proven by**: Bug Class 2 extension pass — 11 sites identified, 1 false positive caught, zero regressions, zero TS errors. Vs Phase 3 grep-based approach that needed 5 specialists to correct an 85% false positive rate.

### Tier 2 traps — three failure modes (added 2026-05-23)

Tier 2 is fast because it skips specialist review. The tradeoff is that THREE classes of mistakes are invisible to schema verification alone. Phase 2.5 explicitly addresses these; this subsection documents them so future readers know WHY Phase 2.5 exists.

**Trap 1 — Sibling-branch blindness**: The fix targets the branch your probe hit, but the same bug class lives in N other branches of the same function/dispatcher/resolver. Schema verification only checks the sites you found. Mitigation: Phase 2.5 Question 1 forces a per-branch enumeration of the function. Real example: Wave A C3 (2026-05-23) shipped Priority 1 of stage-resolver, missed Priorities 2 + 5 + 5.5 — all consuming the same `phaseId` parameter with the same vulnerability. Round 2 hardening probe found and fixed all 3 (commit 759ecdc5).

**Trap 2 — Source-of-truth-incompleteness**: You notice ONE missing value from a drifted enum, fix it, ship. But N values were missing simultaneously and you only saw one. Mitigation: Phase 2.5 Question 2 forces a full bi-directional diff against the source of truth. Real example: COST_REDUCTION (2026-05-23, 3f90867d) was the prior drift; if PERFORMANCE_ENHANCEMENT had ALSO been missing today, the surgical fix would have shipped the COST_REDUCTION fix alone, leaving PERFORMANCE_ENHANCEMENT silently broken.

**Trap 3 — No systemic check**: The fix addresses the current instance but adds no CI test / shared helper / lint rule to catch the next instance. The bug class is "fixed" at one site and reopens silently on the next drift event. Mitigation: Phase 2.5 Question 3 makes systemic-check existence a required output. Real example: test:enum-parity literal-coverage extension (3f90867d) catches future drift in 4 MCP enum schemas; without it, the next time MCPRecommendationType grows a value, COST_REDUCTION-style drift would silently recur.

**Why Tier 2 is still valuable**: All 3 traps are addressable with a 5-15 minute extra phase (2.5), not a 60-90 minute specialist review. Tier 2 + Phase 2.5 retains the speed advantage while closing the enumeration-completeness gap.

**When Tier 2 + Phase 2.5 is NOT sufficient — escalate to Tier 1**: If the bug class is novel (first eradication), if architectural decisions are involved (where to put the shared helper, import path constraints), or if the assumption being verified is about data MODEL not data shape (e.g., "is this Prisma column actually a Json column, or did someone change it to a String?"). Phase 2.5 only catches enumeration mistakes; it doesn't catch wrong-model mistakes.

---

## Phase 5: Eradicate - Fix All Sites (30-60 min)

### Step 5.1: Fix in Priority Order

1. **P0 sites first** - Unguarded boundary-crossing sites (highest risk)
2. **P1 sites second** - Refactor existing guards to shared utility
3. **P3 sites third** - Defense-in-depth guards

### Step 5.2: Verify Each Fix

For each site:
- [ ] Guard is correctly placed (BEFORE the boundary operation)
- [ ] Label parameter identifies the site for debugging
- [ ] Fallback is appropriate (empty object vs error vs custom)
- [ ] No behavior change for already-correct inputs

### Step 5.3: Run Full Test Suite

```bash
npm run lint
npm run build
npm run test:all-validation
```

---

## Phase 6: Prevent - Update Knowledge Base (30 min)

### Step 6.1: Update the Bug Class Registry

Add or update the entry in `/.claude/knowledge/domain/mcp/bug-class-registry.md`:
- Status: ERADICATED
- All sites documented
- Detection commands preserved

### Step 6.2: Update Relevant Patterns

If a gold standard or implementation pattern exists:
- Add the guard to template code
- Add checklist item
- Update related resources

### Step 6.3: Update Specialist Agents

For each relevant specialist:
- Add detection grep commands to their discovery prompt
- Add the bug class to their agent knowledge
- Add regression detection commands

### Step 6.4: Update Discovery Prompts

Add the bug class to relevant discovery prompts so future audits automatically check for regressions.

### Step 6.5: Symbol Drift Sweep (if eradication renamed/moved any symbols)

> **Canonical standalone procedure**: `drift-sweep-protocol.md` (Protocol 11) — this section is the eradication-context instance of its Parts B+C.

If the eradication involved adding a guard function that REPLACED an inline pattern, or extracting state into a new class (rename or relocation), the prior call sites' names may persist in many doc locations. Run the drift sweep across the FULL active-reference scope:

```bash
# Build regex of removed/renamed symbols
STALE='oldInlinePattern|oldMethodName|oldFile\.js:[0-9]+'

# Audit ALL knowledge dirs — not just agents + discoveries
grep -rnE "$STALE" \
  .claude/agents/ \
  .claude/knowledge/discoveries/ \
  .claude/knowledge/patterns/ \
  .claude/knowledge/TODO*.md \
  .claude/knowledge/domain/ \
  .claude/knowledge/guides/ \
  .claude/knowledge/frameworks/ \
  .claude/knowledge/toolkits/ \
  .claude/knowledge/prompts/ \
  .claude/knowledge/protocols/ \
  CLAUDE.md
```

For each hit: replace with new symbol name + brief migration note. Prefer stable grep patterns over `file.js:NNNN` line refs. Skip `cline_docs/` (historical artifacts) and explicit "removed in Phase X" narrative refs.

**Claim-staleness pass (added 2026-06-11)** — the symbol regex above is structurally
blind to docs whose every literal is accurate but whose ASSERTION is dead. Canonical
example: `auth-permissions-specialist` + its paired discovery both claimed the SEC-C1
fail-fast guards were live ("both paths must THROW on missing JWT_ACCESS_SECRET") —
commits real, symbol names real, but the guards had been deliberately deleted with the
secret. Two rules:

1. For each doc the symbol sweep touches, also read the surrounding CLAIMS and verify
   them against the tree (does the guard/behavior/requirement still exist?). Especially:
   "X hard-fails on...", "X is required in env", "verify X is present" instructions —
   these become *re-add the dead thing* traps after a deliberate deletion.
2. **Specialist ↔ discovery pairing is a consistency mechanism, not a correctness one** —
   paired docs drift in sync, including in sync about being wrong. Verifying one half
   does NOT clear the other; check both against the tree, not against each other.

**Time scope**: the sweep verifies docs against current GROUND TRUTH, not against
today's diff. Most of what the 2026-06-11 verification pass caught was leftover drift
from the 2026-06-06 retirement session — a diff-scoped sweep can never catch a prior
session's incomplete sweep.

This is the same technique as Step 7 of the MCP SDK upgrade protocol (`mcp-sdk-upgrade-protocol.md`) and Principle 7 of the large-scale-refactoring protocol — broadened scope after the SessionStore Phase A audit revealed pattern + TODO docs as common drift sites.

---

## Phase 7: Validate - Confirm Eradication (15 min)

### Step 7.1: Run Detection Commands

Re-run the grep commands from Phase 2 and verify:
- Zero P0 sites remain
- All P1 sites are refactored
- P2 sites are documented as safe
- P3 sites have defense-in-depth guards

### Step 7.2: Commit and Push

Single commit per phase (or one combined commit) with message format:
```
feat(domain): Add shared [guard] utility for [bug class] defense

- Created shared utility in lib/utils/
- Protected N unguarded sites (P0)
- Refactored M existing guards to shared utility (P1)
- Added K defense-in-depth guards (P3)
```

---

## Quick Reference: Phase Summary

```
Phase 1:  TRIAGE         (15 min)  → Name the bug class, write definition
Phase 2:  AUDIT          (30-60m)  → Find ALL sites, VERIFY each against source of truth
Phase 2.5 ENUM-VALIDATE  (5-15m)   → Sibling-branch sweep + source-completeness diff + systemic check
Phase 3:  DEFEND         (30 min)  → Create shared guard utility + tests
Phase 4:  REVIEW         (15-90m)  → Tier 1: specialist review OR Tier 2: schema-verified
Phase 5:  ERADICATE      (30-60m)  → Fix all sites in priority order
Phase 6:  PREVENT        (30 min)  → Update knowledge base, patterns, agents
Phase 7:  VALIDATE       (15 min)  → Confirm zero P0 sites remain
─────────────────────────────────────────────────────────────────
Total: Tier 1 = 3.5-5.5h | Tier 2 = 1.5-2.5h + Phase 2.5 (5-15m)
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| P0 sites remaining | 0 |
| Specialist confidence | 90%+ |
| Test suite passing | 100% |
| Knowledge base updated | All relevant files |
| Regression detection | Grep commands preserved |

---

## Case Study 1: Transport Boundary Coercion — Tier 1 (Feb 2026)

**Bug class**: MCP transports silently serialize nested objects to JSON strings
**Discovery**: `services(action: "call")` failing with `-32602` for eia-service and weather-service
**Sites found**: 13 P0 unguarded + 5 P1 existing guards + 1 P3 defense-in-depth
**Shared defense**: `ensureObject()` utility in `lib/utils/ensure-object.{ts,js}`
**Review tier**: Tier 1 — full specialist review (3 specialists, 91% confidence, 6 consensus changes)
**Result**: 22 files changed, zero regressions, pattern documented in 5 knowledge base files
**Prevention**: Gold standard updated, 2 specialist agents updated, 2 discovery prompts updated

## Case Study 2: Prisma Json Column Ambiguity — Both Tiers (Feb 2026)

**Bug class**: Prisma Json columns return strings instead of objects when data was double-serialized
**Phase 3 (Tier 1)**: 5 specialists, 90% confidence. Grep-based classification had 85% false positive rate (6/7 sites wrong). Specialists caught: wrong data model assumption, missed CRITICAL write-back file. Final: 9 guards across 3 files.
**Extension pass (Tier 2)**: Schema-verified discovery. Read every file in full context, verified columns against `schema.prisma`, traced data flows, caught 1 false positive. No specialist review needed. Final: 11 additional guards across 8 files.
**Total**: 20 guards across 11 files, zero regressions, zero TS errors.
**Key lesson**: Tier 1 is essential for first eradication (catches wrong assumptions). Tier 2 is sufficient for extensions using proven patterns (assumptions already validated).

---

## Related Protocols

| Protocol | Relationship |
|----------|-------------|
| Specialist Review Protocol | Phase 4 follows this protocol |
| Discovery-First Workflow | Phase 2 uses discovery-first approach |
| Boundary-Crossing Development | Bug classes often found at boundaries |
| Endpoint Security Audit | Can discover security-related bug classes |

## Related Knowledge

| Resource | Purpose |
|----------|---------|
| `/.claude/knowledge/domain/mcp/bug-class-registry.md` | Catalog of all known bug classes |
| `/.claude/knowledge/patterns/transport-boundary-argument-coercion-pattern.md` | First eradicated bug class |
| `/.claude/knowledge/patterns/docker-mcp-service-gold-standard-v2.md` | Template with guards |

---

**Created By**: Claude Opus 4.6 + Steve Terry
**Date**: February 16, 2026
**Version**: 1.1 — Added Tier 2 review, Step 2.2 verification, Case Study 2
**Status**: Production-validated (2 bug classes eradicated, both review tiers proven)
