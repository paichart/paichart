# Large-Scale Refactoring Protocol

**Version:** 2.0 (Wave 1-7 lessons folded)
**Created:** 2025-12-12 | **Updated:** 2026-05-22
**Status:** Production-Ready ✅
**Success Rate:** 100% across both canonical refactors
**Origins:**
1. **AI Analytics Endpoint Consolidation (2025-12-12)** — original protocol birth, Part 2 success after Part 1 failure
2. **mcp-server-http-clean.js facade extraction (2026-05-19 → 2026-05-22)** — 4-day, 122-commit, 7-wave refactor: 4518 → 1013 LOC (–78%). Surfaced 10 new discipline standards + 3 plumbing patterns now baked into the protocol.

**Companion documents**:
- Tutorial with the 7-wave worked example: `paichart/tutorials/10-large-scale-refactoring-case-study.md`
- SESSION-HANDOFF template: any `cline_docs/reviews/<wave-name>/SESSION-HANDOFF.md` (Wave 7's is the most recent reference at `cline_docs/reviews/mcp-core-extraction-2026-05-21/SESSION-HANDOFF.md`)

---

## Purpose

Systematic approach for complex, multi-file refactors (10+ hours) that ensures high confidence through:
- Comprehensive exploration before planning
- Detailed tactical planning before execution
- Incremental validation at each step
- Learning from failures to inform success

---

## When to Use This Protocol

**Triggers:**

✅ **Use this protocol when:**
- Estimated effort > 10 hours
- Touches 10+ files across multiple domains
- High complexity (multiple subsystems involved)
- Architecture changes (consolidation, restructuring, extraction)
- Risk of breaking existing functionality
- Learning from a previous failed attempt

❌ **Don't use for:**
- Simple refactors (< 5 hours, single domain)
- Obvious fixes with clear approach
- Low-risk changes (documentation, comments)
- Time-sensitive hotfixes

**Examples:**
- ✅ Consolidating 16 endpoints into 6 unified endpoints
- ✅ Extracting shared logic across 20+ components
- ✅ Restructuring authentication flow across multiple layers
- ✅ Migrating from REST to GraphQL
- ❌ Renaming a function across 5 files
- ❌ Fixing a single bug in one file

---

## The 5-Phase Workflow

### Phase 1: Initial Understanding (Parallel Exploration)

**Goal:** Comprehensive codebase understanding through parallel exploration

**Step 1.1: Enter Plan Mode**
```bash
# Trigger plan mode for systematic approach
Use EnterPlanMode tool
```

**Step 1.2: Launch 1-3 Explore Agents in Parallel**

**Guidelines:**
- **1 agent:** Isolated task, known files, small scope
- **2-3 agents:** Uncertain scope, multiple subsystems, need patterns

**Example exploration focuses:**
```
Agent 1: Current State
- What exists today?
- How is it structured?
- What patterns are used?

Agent 2: Integration Points
- How do components interact?
- What data flows exist?
- What dependencies exist?

Agent 3: Testing Patterns
- How is similar code tested?
- What test utilities exist?
- What coverage patterns exist?
```

**Real Example** (Endpoint Consolidation):
```
3 Explore agents in parallel:
├─ Agent 1: Explore analytics endpoints structure (16 endpoints mapped)
├─ Agent 2: Explore frontend analytics components (4 components, API patterns)
└─ Agent 3: Explore testing patterns (88 test structure identified)
```

**Output:** Comprehensive understanding of current state, patterns, constraints

**Step 1.3: Clarify Ambiguities**

Use `AskUserQuestion` tool to resolve:
- Unclear requirements
- Multiple valid approaches
- User preferences
- Risk tolerance

---

### Phase 2: Design (Tactical Planning)

**Goal:** Create detailed, phase-by-phase implementation plan

**Step 2.1: Launch 1-3 Plan Agents**

**Guidelines:**
- **1 agent:** Clear approach, single perspective sufficient
- **2-3 agents:** Complex task, benefit from different perspectives

**Agent Perspectives by Task Type:**
- **New feature:** Simplicity vs Performance vs Maintainability
- **Bug fix:** Root cause vs Workaround vs Prevention
- **Refactoring:** Minimal change vs Clean architecture vs Risk mitigation
- **Consolidation:** Safest-first vs Hardest-first vs Most-impactful-first

**Provide to Plan Agent:**
- Comprehensive background from Phase 1 exploration
- File paths and code traces from exploration
- Requirements and constraints
- Lessons learned from previous attempts (if any)
- Confidence targets and success criteria

**Real Example** (Endpoint Consolidation):
```
1 Plan agent with:
- Context: 16 endpoints, 5 domains identified
- Constraint: Preserve all 31 database queries (no optimization)
- Lesson: Part 1 failed at 196% slower (complex JOINs backfired)
- Strategy: Safest-first order (overview → mcp → agents → team → tasks)
- Output: 8-phase plan with rollback checkpoints
```

**Output:** Step-by-step implementation plan with risk mitigation

---

### Phase 3: Review (Deep Understanding)

**Goal:** Validate plan alignment and deepen understanding

**Step 3.1: Read Critical Files**

Identify from Plan agent output:
- Files with highest complexity
- Files with critical logic to preserve
- Files with edge cases to handle

**Step 3.2: Validate Plan Alignment**

Ensure plan addresses:
- [ ] User's original request
- [ ] All exploration findings
- [ ] Risk mitigation strategies
- [ ] Rollback procedures
- [ ] Success criteria

**Step 3.3: Final Clarifications**

Use `AskUserQuestion` for:
- Approach preferences
- Priority trade-offs
- Timeline constraints
- Risk acceptance

---

### Phase 4: Final Plan (Write to File)

**Goal:** Create scannable, executable plan document

**Step 4.1: Write to Plan File**

Location: `/home/steve/.claude/plans/{session-name}.md`

**Structure:**
```markdown
# [Feature Name] - Tactical Implementation Plan

## Executive Summary
- Duration: X-Y hours
- Confidence: Z% (specialist-validated)
- Strategy: [Incremental/Safest-first/etc.]

## Critical Context
- Lessons from previous attempts
- Key constraints
- Success criteria

## Implementation Order
| Phase | Component | Complexity | Risk | Hours |
|-------|-----------|----------|------|-------|

## Phase-by-Phase Breakdown
For each phase:
- Steps with time estimates
- Validation checkpoints
- Rollback procedures
- Success criteria

## Risk Mitigation
- What could go wrong?
- How to detect early?
- How to recover?

## Critical Files to Modify
- Complete file list
- Complexity notes
- Preservation requirements

## Timeline & Checkpoints
- Git commit after each phase
- Validation after each commit
- Rollback ready at each step
```

**Step 4.2: Call ExitPlanMode**

Present plan for user approval.

---

### Phase 5: Incremental Execution

**Goal:** Execute plan with continuous validation

**Core Principles:**

1. **Safest First**
   - Start with lowest complexity/risk
   - Build confidence before tackling hard parts
   - Validate pattern end-to-end early

2. **One Phase at a Time**
   - Complete entire phase before moving to next
   - Don't mix phases (leads to confusion)

3. **Git Commit After Each Phase**
   ```bash
   git add .
   git commit -m "feat: [Phase X/Y] complete ✅

   [Detailed accomplishments]
   [Critical details preserved]
   [Next steps]

   Checkpoint: ✅ X/Y phases complete"
   ```

4. **Validate Before Proceeding**
   - TypeScript compiles?
   - Tests pass?
   - Manual testing confirms behavior?
   - Performance within acceptable range?

5. **Backward Compatibility Safety Net**
   - Keep old interfaces working during transition
   - Add deprecation warnings
   - Set sunset dates (6-12 months)
   - Allows rollback without breaking changes

6. **Rollback Ready**
   ```bash
   # If phase fails:
   git revert HEAD
   git push origin main
   ```

7. **Self-Apply Time-Bomb Audit (Pre-Merge)**

   If the refactor extracted a class that owns in-memory state (Maps, caches, sessions, scheduled work), run the 8-category audit from `.claude/knowledge/patterns/time-bomb-detection-pattern.md` against the NEW class BEFORE merging. Born from real-world miss: SessionStore Phase 2.x shipped with `cleanupStaleSessions()` only iterating sessions, not oauthRequests/authCodes — a "works by convention" Category 4 latent risk caught only when Steve asked "is our own code time-bomb-free?" (commit `83770919` fixed it).

   8-category checklist:
   - [ ] Cat 1: All Maps/caches have explicit size caps (no unbounded growth)
   - [ ] Cat 2: Cleanup scheduler exists AND auto-starts (not "caller must register")
   - [ ] Cat 3: Atomic deletes across related stores; `destroy()` clears all state
   - [ ] Cat 4: TTL eviction loop iterates ALL time-based stores (not just one)
   - [ ] Cat 5: TTL is enforced by a setInterval, not just defined as a constant
   - [ ] Cat 6: Singleton-by-convention is explicit (or factory) — no global Map
   - [ ] Cat 7: No `TODO`/`FIXME`/stub returns in production paths
   - [ ] Cat 8: In-memory rate limiting (if added) is scale-aware

   A failing checkbox is a blocker — either fix the class OR add a defined-trigger follow-up.

8. **Post-Refactor Drift Sweep (Final Step)**

   When a refactor renames, moves, or removes symbols, specialist configs and discovery prompts that reference the old names become silently wrong. Per `feedback_specialist_discovery_first`, specialists ground on discovery prompts FIRST — stale prompts produce wrong analyses.

   After the last refactor phase, run a 2-step drift audit:

   ```bash
   # Step A — Build a regex of every removed/renamed symbol from this refactor
   # Examples: legacy method names, old Map declarations, deleted constants,
   # file:line references that have shifted.
   STALE='this\.oldField|deletedMethod|MAX_OLD_CONST|old-file\.js:[0-9]+'

   # Step B — Audit the FULL active-reference scope. Do NOT narrow to just
   # agents/ + discoveries/. Lesson from SessionStore Phase A: pattern docs
   # (time-bomb-detection-pattern.md) and pre-existing TODOs (facade-extraction)
   # both held stale code examples that the narrower scope missed.
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

   Triage matches into (a) active references to fix, (b) explicit historical narrative ("removed in Phase X" notes — no fix), (c) `cline_docs/` files which are historical artifacts and intentionally frozen. For each (a): update with new symbol names AND replace any `file.js:NNNN` line refs with stable grep patterns. Pair specialist + discovery updates per `feedback_specialist_discovery_pairing`.

   **Verify clean:**
   ```bash
   grep -rnE "$STALE" .claude/agents/ .claude/knowledge/ CLAUDE.md \
     | grep -vE "removed in Phase|previously lived here|history|HISTORICAL" \
     && echo "DRIFT REMAINS" || echo "✅ clean"
   ```

   Worked examples:
   - Commit `338add12` — SessionStore drift cleanup phase 1 (9 files, +60/-27 LOC; agents + discoveries only — was incomplete)
   - Commit (follow-up after Phase A) — broadened to patterns + TODOs after Steve flagged scope gap

   This drift sweep is also Step 7 of the MCP SDK upgrade protocol (`mcp-sdk-upgrade-protocol.md`) — same technique applies to both refactors and SDK bumps.

   **Canonical standalone procedure**: `drift-sweep-protocol.md` (Protocol 11, 2026-06-11) — run its Parts B+C in full (incl. the claim-staleness pass + prove-before-write rule, which postdate this section).

---

## Success Pattern: The Momentum Loop

**As each phase completes:**

```
✅ Phase 1 complete
  ↓ Confidence +10%
✅ Phase 2 complete (pattern validated!)
  ↓ Confidence +15%
✅ Phase 3 complete (on a roll!)
  ↓ Confidence +20%
✅ Phase 4 complete (complex logic preserved!)
  ↓ Confidence +25%
✅ Phase 5 complete (BREAKTHROUGH!)
  ↓ Ready for deployment
```

**Momentum builds as:**
- Each success proves the approach
- Patterns become clear and reusable
- Confidence grows organically
- Team energy increases ("we're on a roll!")

**How to maintain momentum:**
- Celebrate each phase completion
- Document key wins in commits
- Keep phases reasonably sized (2-6 hours)
- Don't let perfect be enemy of good

---

## Learning from Failures

**If a previous attempt failed:**

1. **Analyze Why**
   - What was the theory?
   - What was the reality?
   - What assumptions were wrong?
   - What measurements were missed?

2. **Extract Lessons**
   - Document in plan's "Critical Context"
   - Inform new strategy
   - Add validation checkpoints
   - Adjust confidence targets

3. **Measure Everything**
   - Baseline before changes
   - Benchmark after each phase
   - Compare theory vs reality
   - Roll back if regressions detected

**Real Example:**
```
Part 1 Failure:
- Theory: 9→2 queries = faster (fewer network round trips)
- Reality: 196% slower (complex JOINs worse than simple queries)
- Lesson: Server speed (14ms) << Network latency (900ms)

Part 2 Success:
- New theory: Reduce API calls, not queries
- Strategy: 5 endpoints → 3 calls = 1800ms network savings
- Approach: Extract logic exactly as-is (no optimization)
- Result: Clean consolidation, backward compatible
```

---

## Risk Mitigation Strategies

### Strategy 1: Safest-First Order

**Implementation Order by Risk:**

| Risk Level | Start When | Characteristics |
|-----------|-----------|-----------------|
| LOWEST | First | Simple logic, well-understood, few dependencies |
| LOW | Second | Moderate complexity, clear patterns |
| MEDIUM | Third | Some complexity, multiple dependencies |
| HIGH | Fourth | Complex logic, critical edge cases |
| HIGHEST | Last | Maximum complexity, mission-critical |

**Benefits:**
- Early validation of approach
- Pattern established before complexity
- Confidence built incrementally
- Easy rollback if pattern flawed

### Strategy 2: Backward Compatibility Wrappers

**Pattern:**
```typescript
// Old endpoint (preserved)
export async function GET(req) {
  // All validation, auth, security preserved
  const validated = await validate(req);

  // Map to new format
  const newParams = mapToNewFormat(validated);

  // Call new handler DIRECTLY (not fetch!)
  const result = await newHandler(newParams);

  // Extract expected response structure
  return { data: result.data.specificMetric };
}

// Add deprecation headers
export const config = {
  headers: {
    'X-Deprecated': 'true',
    'X-Sunset-Date': '2026-06-12'
  }
};
```

**Benefits:**
- Old URLs keep working (zero breaking changes)
- New architecture can be tested alongside old
- Gradual migration (not big-bang)
- Instant rollback (just remove wrappers)

### Strategy 3: Continuous Validation

**After Each Phase:**
```bash
# 1. TypeScript compilation
npx tsc --noEmit

# 2. Git commit (checkpoint)
git commit -m "Phase X/Y complete ✅"

# 3. Validation (if quick)
npm run lint
npm run test:validation

# 4. Manual smoke test
npm run dev
# Test the feature works

# 5. Proceed or rollback
✅ Proceed → Next phase
❌ Issues → git revert HEAD
```

### Strategy 4: Preserve, Don't Optimize

**When extracting complex logic:**

❌ **DON'T:**
```typescript
// "I can make this better while I'm here..."
const optimized = await bigComplexJoinQuery();
```

✅ **DO:**
```typescript
// Copy exactly as-is
// CRITICAL: 15 queries - PRESERVE ALL! (no optimization)
const query1 = await prisma...
const query2 = await prisma...
// ... all 15 queries
```

**Rationale:**
- Refactoring ≠ Optimization (separate concerns)
- Existing code is proven to work
- Optimization can backfire (Part 1: -196% slower!)
- Extract first, optimize later (if needed)

---

## Template: Phase-by-Phase Structure

### Phase Template

```markdown
## PHASE X: [COMPONENT NAME] (Y-Z hours) [RISK LEVEL]

**Why this order:** [Rationale for placement]

### Step X.1: [Action] (TIME)
**File:** /path/to/file
**Critical:** [What must be preserved]
**Pattern:** [Code pattern to use]

[Detailed instructions]

**Validation:**
- [ ] Checklist item 1
- [ ] Checklist item 2

### Step X.2: [Action] (TIME)
[Instructions]

### Step X.3: Test & Commit (TIME)
```bash
git commit -m "feat: Phase X/Y complete ✅"
```

**Checkpoint:** ✅ [What this proves]
```

---

## Measuring Success

### Pre-Execution Metrics

**Confidence Targets:**
- < 75%: NEEDS REVISION ❌
- 75-85%: PROCEED WITH CAUTION ⚠️
- 85-92%: GOOD TO PROCEED ✅
- 92-100%: PRODUCTION-READY ✅✅

**Specialist Validation:**
- Minimum 3 specialists for major refactors
- Domain-specific specialists (api-efficiency, architectural-review, etc.)
- Discovery-first requirement (specialists must run discoveries)
- Confidence threshold: 90%+ for production deployment

### Post-Execution Metrics

**Code Metrics:**
- [ ] Lines of code changed (extraction + wrappers)
- [ ] Number of files modified
- [ ] Complexity reduction (cyclomatic complexity)
- [ ] Duplication reduction

**Architecture Metrics:**
- [ ] Endpoints reduced (before → after)
- [ ] API calls reduced (per page load)
- [ ] Network round trips saved
- [ ] Response time improvement

**Quality Metrics:**
- [ ] Test coverage maintained/improved
- [ ] Zero breaking changes (backward compat)
- [ ] Documentation updated
- [ ] Deprecation timeline set

**Production Metrics (24-48 hours):**
- [ ] Error rate < 1%
- [ ] Performance within 10% baseline
- [ ] Zero critical bugs
- [ ] User satisfaction maintained

---

## Common Pitfalls & Solutions

### Pitfall 1: Premature Optimization

**Symptom:** "While I'm here, let me make this faster..."

**Problem:**
- Mixes refactoring with optimization (2 concerns)
- Optimization can backfire (Part 1: -196% slower)
- Harder to debug if issues arise

**Solution:**
- Extract logic exactly as-is
- Preserve all queries, calculations, edge cases
- Optimize separately (if needed, after validation)

**Real Example:**
```
Part 1: Tried to optimize while refactoring (9→2 queries)
Result: 196% SLOWER (complex JOINs backfired)

Part 2: Extract logic exactly, no optimization
Result: Clean consolidation, all 19 queries preserved
```

---

### Pitfall 2: Big-Bang Deployment

**Symptom:** Implement all 5 phases, commit once, deploy

**Problem:**
- If issues found, unclear which phase caused it
- Hard to rollback (lose all work)
- Testing burden enormous
- High stress, low confidence

**Solution:**
- Git commit after EACH phase
- Validate after each commit
- Build confidence incrementally
- Easy rollback (just revert last commit)

**Benefits:**
```
5 phases × 1 commit each = 5 rollback checkpoints
vs
1 commit for all = 1 rollback point (all-or-nothing)
```

---

### Pitfall 3: Skipping Exploration

**Symptom:** "I know this codebase, I can skip exploration"

**Problem:**
- Miss existing patterns (reinvent wheel)
- Miss integration points (break dependencies)
- Miss edge cases (bugs in production)
- Assumptions lead to false starts

**Solution:**
- ALWAYS explore, even for "familiar" code
- Use Explore agents (faster than manual)
- Discover patterns to reuse (don't reinvent)
- Find edge cases early (not in production)

**ROI:**
- 1-2 hours exploration saves 10-20 hours false starts
- 5-10x return on investment

---

### Pitfall 4: Ignoring Previous Failures

**Symptom:** "Let's try that optimization again with a different approach"

**Problem:**
- Same root cause, different symptoms
- Waste time on proven-to-fail approach
- Miss the real opportunity

**Solution:**
- Document failures thoroughly
- Extract root cause lessons
- Change strategy, not tactics
- Focus on different improvement area

**Real Example:**
```
Part 1 Failure: Query consolidation (server-side optimization)
Root cause: Network latency (900ms) >> Server speed (14ms)

Part 2 Strategy: API call reduction (network optimization)
Focus: 5 API calls → 3 calls = 1800ms savings
Result: Addresses actual bottleneck (network, not queries)
```

---

## Specialist Coordination

### When to Consult Specialists

**Required Specialists by Refactor Type:**

| Refactor Type | Required Specialists | Optional |
|--------------|---------------------|----------|
| **API Consolidation** | api-efficiency, architectural-review, boundary-contract | database-manager, performance-analyst |
| **Component Extraction** | architectural-review, boundary-contract | performance-analyst |
| **Authentication Flow** | sec-ops, auth-permissions, boundary-contract | validation-engine |
| **Database Schema** | database-manager, architectural-review, multi-tenancy | performance-analyst |
| **State Management** | architectural-review, boundary-contract | performance-analyst |

### Specialist Review Process

1. **Request Reviews** (per specialist-review-protocol.md)
2. **Provide Context:**
   - Implementation plan draft
   - Exploration findings
   - Constraints and requirements
3. **Incorporate Feedback:**
   - Critical fixes (must address)
   - Important improvements (should address)
   - Nice-to-haves (consider)
4. **Achieve Confidence Threshold:**
   - Major refactor: 90%+
   - Security-critical: 95%+
5. **Update Plan with Adjustments**

---

## Protocol Parameters (Fill In for Your Refactor)

### 1. Refactor Scope

```yaml
Name: [Feature/component/system being refactored]
Type: [Consolidation/Extraction/Restructuring/Migration]
Estimated Effort: [X-Y hours]
Complexity: [LOW/MEDIUM/HIGH/HIGHEST]
Risk: [LOW/MEDIUM/HIGH/CRITICAL]
```

### 2. Current State

```yaml
Files Affected: [Count]
Subsystems Involved: [List]
Dependencies: [Internal/External]
Test Coverage: [Current %]
```

### 3. Target State

```yaml
Goal: [What will be achieved]
Benefits:
  - [Metric 1: Before → After]
  - [Metric 2: Before → After]
Success Criteria:
  - [ ] Functional: [Specific criteria]
  - [ ] Performance: [Specific targets]
  - [ ] Quality: [Test coverage, etc.]
```

### 4. Exploration Focus Areas

```yaml
Explore Agent 1: [Focus area]
  - Questions to answer
  - Patterns to discover
  - Files to map

Explore Agent 2: [Focus area]
  - Questions to answer
  - Integration points
  - Dependencies

Explore Agent 3: [Focus area]
  - Testing patterns
  - Utilities available
  - Coverage strategy
```

### 5. Implementation Phases

```yaml
Phase 1: [Component] (X hours) [RISK]
  Why first: [Rationale]
  Steps: [High-level steps]
  Validation: [Checkpoint criteria]

Phase 2: [Component] (Y hours) [RISK]
  Why second: [Rationale]
  ...

[Continue for all phases]
```

### 6. Rollback Plan

```yaml
Per-Phase Rollback:
  - Git commit after each phase
  - Command: git revert HEAD

Complete Rollback:
  - Backward compat ensures old APIs work
  - Can remove wrappers to fully revert
  - Zero breaking changes

Emergency Rollback:
  - Production manual rollback via symlinks
  - Keep previous release for instant recovery
```

---

## Real-World Example: Endpoint Consolidation

**See:** `endpoint-consolidation-protocol.md` (companion protocol)

**Summary:**
- **Scope:** 16 endpoints → 6 unified endpoints
- **Duration:** 27-37 hours (actual: following protocol)
- **Phases:** 5 domains (overview, mcp, agents, team, tasks)
- **Order:** Safest-first (LOWEST → HIGHEST complexity)
- **Results:**
  - ✅ All 5 domains extracted (1,172 LOC)
  - ✅ 8 backward compat wrappers created
  - ✅ Zero breaking changes
  - ✅ All queries preserved (no failed optimizations)
  - ✅ Incremental commits (5 checkpoints)
  - ✅ Rollback ready at each step

**Key Success Factors:**
1. Learned from Part 1 failure (no optimization, just extraction)
2. Parallel exploration (3 agents = comprehensive understanding)
3. Detailed tactical plan (8 phases, step-by-step)
4. Safest-first order (built confidence early)
5. Incremental execution (commit after each phase)
6. Backward compatibility (old endpoints working)

---

## Real-World Example 2: mcp-server-http-clean.js Facade Extraction (Wave 1–7)

**See**:
- Tutorial walkthrough: `paichart/tutorials/10-large-scale-refactoring-case-study.md`
- Per-wave review directories: `cline_docs/reviews/mcp-server-http-clean-refactor-2026-05-19/`, `cline_docs/reviews/auth-manager-extraction-2026-05-20/`, `cline_docs/reviews/auth-middleware-extraction-2026-05-20/`, `cline_docs/reviews/express-middleware-extraction-2026-05-21/`, `cline_docs/reviews/express-routes-extraction-2026-05-21/`, `cline_docs/reviews/mcp-core-extraction-2026-05-21/`
- Wave 7 SESSION-HANDOFF (canonical template): `cline_docs/reviews/mcp-core-extraction-2026-05-21/SESSION-HANDOFF.md`

**Summary**:
- **Scope**: 1 file (4518 LOC) → 1 file (1013 LOC) + 9 extracted modules across 5 domains
- **Duration**: 4 days (May 19–22, 2026), 122 commits, 7 waves
- **Results**:
  - ✅ –3505 LOC (–78%) from the monolith
  - ✅ 9 new modules with 172+ unit tests
  - ✅ Zero production rollbacks across 22 sub-phase deploys
  - ✅ 2 PRE-EXISTING production bugs surfaced and fixed in-band (C-PRE-1 MCP-spec notifications fall-through + C-PRE-2 ping dispatch-reject)
  - ✅ 1 dead-code drop sub-phase (37 LOC, verified zero callers + zero production traffic in 14 days)
  - ✅ Substantial drift sweep across 10+ specialist + discovery files at wave close

**LOC chain by wave**:

| Wave | Domain | LOC delta | Cumulative |
|---|---|---:|---:|
| Pre-Wave-1 | — | — | 4518 |
| Wave 1 | Method classifier extraction (isProtectedMethod, MCP_PUBLIC_METHODS) | small | — |
| Wave 2 | Domain A — SessionStore extraction | -200ish | 4318 |
| Wave 3a | Domain B — AuthManager skeleton + migration | -432 | 3886 |
| Wave 4 | Domain B — createAuthMiddleware extraction | -187 | 3699 |
| Wave 5 | Domain E.middleware — configureExpressMiddleware | -500 | 3199 |
| Wave 6 | Domain E.routes — 5 per-RFC route files | -1493 | 1706 |
| Wave 7 | Domain D — MCPCoreManager (processRequest hot path) | -693 | **1013** |
| **Total** | | **–3505 (–78%)** | |

**10 new discipline lessons folded into this protocol** (full narrative in the companion tutorial):

| # | Standard | Wave that surfaced it |
|---|---|---|
| 1 | Phase 0 inventory before planning | Wave 7 (DEAD setupSDKSessionServer found ONLY because of inventory) |
| 2 | Specialist review BEFORE execution, not after | Waves 4–7 (each wave shipped a Plan v2 fold) |
| 3 | Plan v2 with traceability matrix (every finding → folded/deferred/rejected) | Wave 5 Round 2 (Steve caught me dropping deferred findings from my own headline) |
| 4 | Sub-phase structure: numbered, atomic, deployable | Wave 6 Phases 6.1–6.5 (5 sequential route-group extractions) |
| 5 | Verbatim port, then optimize separately | Wave 7 Phase 7.2 (611-LOC processMCPRequest character-identical move) |
| 6 | Quartet gate per sub-phase (unit + build + bare-node + curl) | Wave 5 near-miss (middleware-ordering bug caught by curl, missed by unit tests) |
| 7 | Fix PRE-EXISTING bugs in `0a`/`0b` sub-phases (before extraction) | Wave 6 Tasks #156+157 + Wave 7 Phase 7.0a (2 MCP-spec bugs) |
| 8 | Dead-code drops as separate sub-phases with production verification | Wave 3b.0a (542 LOC dead Microsoft helpers) + Wave 7.0b (37 LOC dead SDK session) |
| 9 | Drift sweep at wave close (agents + discoveries + patterns + protocols + TODOs) | Wave 7 Phase 7.3 (10 files patched after extraction) |
| 10 | Honest framing: "substantially complete," never bare "complete" | Wave 6 Phase 6.6 (Steve caught over-claiming twice) |

**3 new plumbing patterns folded in**:

| # | Pattern | Where used |
|---|---|---|
| 11 | Lazy-init + inline guard for fields populated post-construction | `MCPCoreManager._mcpServer` (Wave 7) — null at construction, populated by init(), per-request methods use inline `if (!this._mcpServer) throw; const mcpServer = this._mcpServer;` |
| 12 | Hand-written structural TS interfaces for JS interop boundaries | `PureSDKNativeServerShape` (~50 LOC, covers only fields actually consumed — NOT a `tsc --declaration` lift of the 2039-LOC JS class) |
| 13 | Archaeological stub comments where deleted/moved code lived | Every server-class method body replaced post-extraction with `// processMCPRequest() EXTRACTED to lib/mcp/server/mcp-core.ts:MCPCoreManager.processRequest() in Wave 7 Phase 7.2 (2026-05-21). Verbatim port. Hot path 3182/14d.` |

**Key Success Factors specific to this refactor**:
1. **Wave-and-stop, not all-at-once** — first waves (1+2) were tiny proof points; later waves (5+6+7) rode on the established rhythm
2. **Specialist review timing** — 3+ specialists per Plan v1, with Round 1 confidence in the 86-89% range raising to 94% on Plan v2 verdict
3. **Customer driver** — Wave 7 was triggered by an actual customer code-review timeline; without it, the work would have stayed in backlog. Business drivers > "this should be cleaner" abstract goals
4. **Verbatim port discipline** — arch-review verdict v2 explicitly cited "611-LOC body moved character-identical" as a confidence factor
5. **Drift sweep as its own commit** — kept the extraction commits clean and gave the documentation update its own scope
6. **Honest backlog at wave close** — Wave 6's "still extractable: Domain C + Domain D + 2 placement decisions" framing became Wave 7's scope

---

## Checklist: Before Starting Large Refactor

**Preparation:**
- [ ] Estimated effort > 10 hours?
- [ ] Specialist reviews requested (if applicable)?
- [ ] Discovery-first completed?
- [ ] Previous failures documented (if any)?
- [ ] User requirements clear?
- [ ] Rollback plan defined?

**Phase 1: Exploration**
- [ ] Enter plan mode
- [ ] Launch 1-3 Explore agents (parallel)
- [ ] Clarify ambiguities with user
- [ ] Document findings

**Phase 2: Planning**
- [ ] Launch 1-3 Plan agents
- [ ] Provide comprehensive context
- [ ] Consider multiple perspectives
- [ ] Receive tactical implementation plan

**Phase 3: Review**
- [ ] Read critical files
- [ ] Validate plan alignment
- [ ] Resolve final questions
- [ ] Achieve confidence threshold (90%+)

**Phase 4: Final Plan**
- [ ] Write to plan file
- [ ] Include all critical details
- [ ] Scannable structure
- [ ] Exit plan mode for approval

**Phase 5: Execution**
- [ ] Start with safest phase
- [ ] Commit after each phase
- [ ] Validate continuously
- [ ] Maintain momentum
- [ ] Celebrate wins!

---

## Success Metrics

**Protocol Effectiveness:**

| Metric | Target | Actual (Endpoint Consolidation) |
|--------|--------|--------------------------------|
| **Phases completed** | 100% | 5/5 (100%) ✅ |
| **Breaking changes** | 0 | 0 ✅ |
| **Rollbacks needed** | 0-1 | 0 ✅ |
| **Confidence achieved** | 90%+ | 90.7% ✅ |
| **Time vs estimate** | Within 20% | TBD (in progress) |
| **Post-deploy bugs** | < 3 | TBD (monitoring) |

**When Protocol Succeeds:**
- All phases completed as planned
- Confidence targets met
- Zero/minimal rollbacks
- Production stable
- Team momentum high

**When to Adapt Protocol:**
- Phases taking 2x estimate (reassess approach)
- Multiple rollbacks (pattern may be flawed)
- Confidence not increasing (missing something)
- Team energy dropping (phases too large)

---

## Companion Protocols

**Use together with:**
- `discovery-first-workflow-guide.md` - Before any changes
- `specialist-review-protocol.md` - For confidence validation
- `boundary-crossing-development-protocol.md` - For full-stack features
- `endpoint-consolidation-protocol.md` - Specific to API consolidation

---

## Protocol Maintenance

**Update this protocol when:**
- New success patterns discovered
- New failure modes identified
- Better risk mitigation strategies found
- Improved validation techniques developed

**Version History:**
- v1.0 (2025-12-12): Initial version from endpoint consolidation success

---

## Quick Reference Card

```bash
# 1. EXPLORE (Parallel - 3 agents)
EnterPlanMode → Launch Explore agents → Gather findings

# 2. PLAN (Tactical - 1-3 agents)
Launch Plan agent → Receive detailed phases → Review critically

# 3. REVIEW (Deep dive)
Read critical files → Validate alignment → Resolve questions

# 4. FINALIZE (Document)
Write plan file → Exit plan mode → Get approval

# 5. EXECUTE (Incremental)
Phase 1 → Commit → Validate → Phase 2 → Commit → ...

# 6. CELEBRATE 🎉
All phases complete → Deploy → Monitor → Success!
```

**Remember:**
- Safest first (build confidence)
- Commit frequently (rollback ready)
- Preserve logic (don't optimize)
- Validate continuously (catch issues early)
- Learn from failures (inform success)
- Maintain momentum (celebrate wins)

---

**Protocol Version:** 1.0
**Proven Success Rate:** 100% (1/1 major refactors)
**Next Usage:** Any large-scale refactor > 10 hours
**Companion:** See `endpoint-consolidation-protocol.md` for specific example
