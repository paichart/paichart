# Safe Modular Extraction Pattern

**Type**: Process + Architecture Pattern — High-Risk Refactoring
**Created**: February 26, 2026
**Confidence**: 96% — Proven with resource-manager dual-extraction (71 tests, zero regressions)
**Status**: Production-deployed
**Discovery**: `pre-refactor-structural-mapping-discovery.md` (structural mapping before extraction)

---

## Pattern Overview

**Problem**: Large monolithic files (1,000–4,000+ lines) accumulate silent failures, duplicated logic, and tight coupling that make changes risky and bugs invisible. Traditional refactoring advice ("just extract methods") misses the critical step of understanding what you're moving before you move it.

**Solution**: A 6-phase extraction methodology that prioritizes understanding and contracts before any code movement. Each phase has validation gates — you don't proceed until the gate passes.

**Results**:
- Resource manager extraction: dual managers unified under shared contract, 1 silent bug class eliminated (cache key mismatch), 71 tests passing, zero regressions
- Pino migration: 14 files, 60 warnings → 0, zero behavior changes, clean build

**Key Insight**: The most dangerous refactoring failures aren't crashes — they're *silent behavior changes* that pass all tests but subtly break production. This pattern is specifically designed to surface those.

---

## When to Use This Pattern

**Use safe modular extraction when**:
- File exceeds 1,000 lines with multiple responsibilities
- **File exceeds 2,000 lines (CRITICAL — immediate candidate)**
- You suspect silent failures (inconsistent behavior, duplicated logic with drift)
- You need modularity for easier future changes to business logic
- Multiple code paths do "the same thing" slightly differently
- You want to enable independent testing of extracted modules

**Do NOT use when**:
- File is large but has a single clear responsibility (use facade-handler-extraction instead)
- You want to change behavior AND structure simultaneously (separate these into two PRs)
- No tests exist and you can't add them first (write tests first, then extract)

**Relationship to facade-handler-extraction-pattern.md**:
- Facade pattern is **mechanical** — extract methods into files, keep thin facade
- Safe modular extraction is **analytical** — discover contracts, find silent failures, THEN extract
- Use facade pattern for straightforward large files with clear boundaries
- Use THIS pattern for complex files where you suspect hidden coupling or inconsistencies

---

## The 6-Phase Methodology

### Phase 1: DISCOVER — Map Before You Move
**Time**: 1–2 hours | **Gate**: Structural map complete

**What you do**:
Run the pre-refactor structural mapping discovery. This produces:
- Complete inventory of responsibilities (handlers, middleware, utilities, state)
- Dependency graph (what calls what, what imports what)
- State management map (globals, singletons, closures, shared mutable state)
- Integration point catalog (external APIs, database, event systems)

**Why this matters**:
Every refactoring failure we've seen traces back to moving code without understanding its hidden dependencies. The resource manager refactor succeeded because we discovered both managers existed and understood WHY both existed (different protocol layers) before writing a single line.

**Validation gate**: You can draw the dependency graph on paper. If you can't, you don't understand it well enough to move it.

**Discovery prompt**: `/.claude/knowledge/discoveries/pre-refactor-structural-mapping-discovery.md`

```bash
# Quick structural overview for any large file
wc -l <target-file>                           # How big is it?
grep -c 'function\|async ' <target-file>      # How many functions?
grep -c 'require\|import ' <target-file>      # How many dependencies?
grep 'module.exports\|export ' <target-file>  # What's the public API?
```

---

### Phase 2: CONTRACT — Define the Interface Before Extracting Code
**Time**: 30–60 minutes | **Gate**: Interface defined, typed, and reviewed

**What you do**:
Write the shared interface/contract that extracted modules will conform to. This is the most important document in the entire refactoring.

**What this looks like in practice**:

```typescript
// resource-manager-types.ts — Written BEFORE any code was moved
export interface IResourceManager {
  initialize(): Promise<boolean | void>;
  getResource(resourceId: string, includeContent?: boolean): BaseResource | null | Promise<BaseResource | null>;
  listResources(options?: any): Promise<BaseResource[]>;
  discoverExecutionResources(filters?: any): Promise<BaseResource[]>;
  getStats(): ResourceManagerStats;
  close(): Promise<void>;
}
```

**Why this matters**:
The contract makes mismatches *visible at compile time* rather than invisible at runtime. In the resource manager refactor, defining `IResourceManager` immediately revealed that `description` was required in `BaseResource` but optional in `EnhancedMCPResource` — a type incompatibility that had been silently ignored.

**Validation gate**: Both existing implementations (or code paths) satisfy the interface. If they don't, you've found your first silent failure.

---

### Phase 3: EXTRACT — Shared Constants and Utilities First
**Time**: 1–2 hours | **Gate**: Shared module extracted, all consumers updated, tests pass

**What you do**:
Extract the *shared foundations* — constants, helper functions, configuration — into a dedicated shared module. Do NOT extract business logic yet.

**Why constants first**:
This is where silent failures hide. When two code paths define the same constant independently, they inevitably drift. The resource manager had `'artifact-'` as a prefix in one place and raw IDs in another — a silent cache key mismatch that caused "Resource not found" errors.

```javascript
// resource-manager-shared.js — Single source of truth
const RESOURCE_KEY_PREFIX = Object.freeze({
  ARTIFACT: 'artifact-',
  EXECUTION: 'execution-',
  TEMPLATE: 'template-',
});

function buildResourceKey(type, id) {
  // One function, one truth, no drift
}
```

**The rule**: If two files define the same string literal, enum value, or helper function, extract it into a shared module. Period.

**Silent failure detection techniques**:
1. **Grep for duplicated string literals**: Same prefix/suffix defined in multiple files
2. **Grep for duplicated function signatures**: Same logic reimplemented differently
3. **Compare default values**: Two files setting the same config to different defaults
4. **Check error messages**: Inconsistent error text for the same error condition

```bash
# Find duplicated string constants across managers
grep -n "artifact-\|execution-\|template-" file1.js file2.ts

# Find duplicated function names
grep -n "function buildResourceKey\|function parseResourceKey" file1.js file2.ts

# Find duplicated default values
grep -n "TTL\|MAX_RESOURCES\|CACHE" file1.js file2.ts
```

**Validation gate**: All tests pass. Zero behavior changes. Shared module is the single source of truth.

---

### Phase 4: MODULARIZE — Extract Business Logic by Responsibility
**Time**: 2–4 hours | **Gate**: Each module < 400 lines, tests pass after each extraction

**What you do**:
Now extract business logic into focused modules, one responsibility at a time. Follow the facade-handler-extraction pattern for the mechanical steps.

**Critical rule**: Extract one module at a time, run tests after each. Never batch extractions.

**Module boundaries** (in priority order):
1. **Middleware/Auth** — Authentication, authorization, session management
2. **Protocol handlers** — Request/response processing for each protocol method
3. **Business logic** — Domain-specific operations (resource discovery, execution tracking)
4. **Utilities** — Formatters, validators, error factories

**For each extraction**:
```
1. Create new module file
2. Move function(s) to new module
3. Export from new module
4. Import in original file
5. Run tests — MUST pass before proceeding
6. Repeat
```

**For hot-path extractions** (auth, request routing, anything that runs on every request), insert a **shadow validation observation window** between steps 4 and 5 of the modularize cycle:

```
4.a. Wire the new module side-by-side (Phase A — instantiated, not called)
4.b. Add fire-and-forget shadow call in legacy success branches (Phase B)
4.c. Deploy. Grep production logs for `<module>_dual_validate_drift` events
     across 1+ deploy cycles (Phase C — observation window)
4.d. Zero hits → flip authority to new module + delete shadow in same commit
     (Phase D — flip-and-remove)
```

This pattern produces **evidence-based equivalence** on real traffic before cutover. ~50 LOC of scaffolding (all removed in flip commit) buys confidence that unit tests + fixture parity alone can't provide.

See [[shadow-validation-observation-window-pattern]] for the full lifecycle + anti-patterns. Validated on 2 extractions (Wave 2 SessionStore via "noCleanup:true" dormancy + Wave 3a AuthManager via dedicated shadow helper) with zero drift in either observation window.

**Two memories from Wave 3a that should inform every extraction**:
- [[feedback_audit_ownership_at_extraction]] — Decide explicitly at Phase 2 (CONTRACT) whether the extracted class owns its audit emission or defers to callers. Default: class-owns. Caller-owns means every migration becomes a fat wrapper.
- [[feedback_ts_port_behavioral_equivalence]] — When porting JS `.includes()`/conditional chains to TS regex/switch during extraction, require fixture-based equivalence tests. Idiomatic-TS rewrites silently drop patterns (Phase 3.8d caught CLIENT_PROVIDER_MAP losing 2 patterns).

**What NOT to extract**:
- Initialization/bootstrap code (keep in main file — it's the entry point)
- Global state management (extract the state object, keep the wiring)
- Error handling middleware (keep close to the entry point)

**Validation gate**: Every module < 400 lines. All tests pass. The original file is now a thin facade.

---

### Phase 5: VALIDATE — Comprehensive Verification
**Time**: 30–60 minutes | **Gate**: All validation suites pass

**What you do**:
Run every validation layer. Not just unit tests — the full stack.

```bash
# 1. Lint (catches import errors, unused vars)
npx next lint

# 2. Build (catches type errors, webpack issues)
npm run build

# 3. Unit tests
npm run test:all-validation

# 4. Domain-specific tests
node scripts/test-mcp-resource-manager.ts
node scripts/test-mcp-resource-security.ts

# 5. Logging validation (if you touched logging)
npm run validate:logging
```

**Why every layer matters**:
- Lint catches: import path errors from moved files
- Build catches: type mismatches between modules (like `description?: string` vs `description: string`)
- Tests catch: behavioral regressions
- Logging validation catches: console.* that slipped in during refactoring

**Validation gate**: Zero errors, zero warnings across all layers.

---

### Phase 6: DOCUMENT — Capture What You Changed and Why
**Time**: 30 minutes | **Gate**: Agent configs, discovery prompts, and TODO docs updated

**What you do**:
Update the knowledge base so future sessions understand the new architecture:

1. **Update specialist agent configs** — New grep commands, learning notes, integration points
2. **Update discovery prompts** — New file paths, structural sections
3. **Update or close TODO docs** — Mark work as complete with evidence
4. **Register in PATTERN-REGISTRY.md** if a new pattern emerged

**Why this matters**:
The resource manager refactor updated 4 agent configs and 2 discovery prompts. Without these updates, the next session would discover the old architecture and potentially undo the refactoring.

**Validation gate**: A fresh discovery-scout run produces results consistent with the new architecture.

---

## Silent Failure Detection Catalog

These are the specific failure modes this pattern has caught. Check for ALL of these during Phase 1 (Discover) and Phase 3 (Extract).

### 1. Cache Key Mismatch
**What**: Two code paths construct cache keys differently for the same entity.
**How to find**: Grep for all `Map.set()` and `Map.get()` calls — do the keys match?
**Resource manager example**: One path used `artifact-${id}`, another used raw `${id}`.

### 2. Default Value Drift
**What**: Same configuration parameter has different defaults in different files.
**How to find**: Grep for config constants — compare values across files.
**Example**: TTL of 10 minutes in one file, 5 minutes in another.

### 3. Interface Incompatibility
**What**: Two implementations of the "same" contract return slightly different shapes.
**How to find**: Define a TypeScript interface — compiler errors reveal mismatches.
**Resource manager example**: `description: string` vs `description?: string`.

### 4. Missing Error Handling
**What**: One code path handles an error, the equivalent path doesn't.
**How to find**: Grep for `try/catch` — compare coverage across equivalent functions.

### 5. Inconsistent Logging
**What**: Same operation logs at different levels or with different formats.
**How to find**: Grep for log calls — compare patterns across files.
**Pino migration example**: Some files used `console.error`, others used `console.warn` for the same severity.

### 6. Orphaned State
**What**: State that was shared via closure but becomes unreachable after extraction.
**How to find**: Map all mutable state in Phase 1 — verify access paths after extraction.

### 7. Import Order Dependencies
**What**: Module initialization depends on import order (circular dependencies).
**How to find**: Check for top-level side effects — code that runs on `require()`.
**Example**: `lib/prisma.ts` runs database connection on import (was `lib/prisma.js` until Phase 2 proper / Bug Class 73 eradication Apr 8 2026; the `.js` sibling had drifted from `.ts` and was silently shadowing it in production).

---

## Risk Mitigation Rules

These are non-negotiable:

1. **Never change behavior and structure simultaneously.** Structural refactoring in one PR, behavior changes in the next. This is the single most important rule.

2. **Tests must exist before extraction begins.** If there are no tests, write them first. The tests are your safety net — without them, you're walking a tightrope over a canyon.

3. **Extract one module at a time.** Run tests after each extraction. If tests fail, fix before proceeding. Never accumulate multiple extractions without validation.

4. **Preserve the public API.** The original file's exports must not change. Consumers should not know a refactoring happened.

5. **Shared state is the enemy.** Map it in Phase 1, centralize it in Phase 3, verify it in Phase 5. Most silent failures come from shared mutable state.

6. **Document as you go, not after.** Update agent configs and discovery prompts during the work, not as a follow-up task that gets deprioritized.

---

## Applicability to Specific Files

### mcp-server-http-clean.js (~3,886 lines as of 2026-05-21, down from 4518 at start of Waves 1-4 — IN-PROGRESS multi-wave extraction)
**Discovery**: `/.claude/knowledge/discoveries/pre-refactor-structural-mapping-discovery.md`
**Expected modules**:
- Auth middleware (JWT, OAuth, API key extraction)
- Session management (creation, persistence, cleanup)
- MCP protocol handlers (initialize, tools/list, tools/call, resources/list, resources/read, prompts/list)
- Business logic wiring (tool dispatch, resource manager integration)
- Error handling and response formatting
- Health check and monitoring

**Known risks**:
- Heavy use of closure state (session maps, user context)
- Auth middleware tightly coupled to request processing
- MCP protocol handlers have mixed concerns (auth + business logic + formatting)

### mcp-server-v5.js (1,945 lines)
**Status**: May share logic with mcp-server-http-clean.js (stdio vs HTTP transport)
**Expected extraction**: Common protocol handling extracted to shared module

### Other candidates (>1,000 lines in lib/):
- `tool-schemas.js` (2,000 lines) — Schema definitions, mechanical extraction
- `sdk-native-basic-tools.js` (1,387 lines) — Tool implementations
- `chatgpt-connector-handler.js` (1,274 lines) — ChatGPT integration
- `formatters.js` (1,141 lines) — Formatting utilities
- `parameter-normalizer.js` (1,136 lines) — Parameter normalization

---

## Relationship to Other Patterns

**Builds on**:
- `facade-handler-extraction-pattern.md` — Mechanical extraction steps (Phase 4 uses this)
- `field-leakage-prevention-pattern.md` — Boundary contract validation (Phase 2 contract)
- `time-bomb-detection-pattern.md` — Silent failure categories (Phase 1 detection)

**Complements**:
- `post-change-specialist-review-pattern.md` — Run after Phase 5 for specialist validation
- `pino-structured-logging-pattern.md` — Apply during extraction for consistent logging
- `global-prisma-singleton-pattern.md` — Ensure extracted modules don't create new clients

**Prevents**:
- Cache key mismatch bugs (Phase 3 constant extraction)
- Interface drift between implementations (Phase 2 contract)
- "Works in my test, breaks in production" (Phase 5 multi-layer validation)

---

## Success Metrics

- Zero regressions after extraction (all test suites pass)
- At least 1 silent failure discovered and fixed per extraction
- All modules < 400 lines after extraction
- Public API unchanged (no consumer modifications needed)
- Knowledge base updated (agent configs, discovery prompts, pattern registry)

---

## Real-World Evidence

### Resource Manager Extraction (Feb 2026)
- **Before**: Two managers with duplicated constants, incompatible types, cache key drift
- **After**: Shared contract (`IResourceManager`), shared constants (`resource-manager-shared.js`), shared types (`resource-manager-types.ts`)
- **Silent failures found**: Cache key mismatch (P0), type incompatibility (P1), inconsistent TTL defaults (P2)
- **Tests**: 71 passing (42 + 29), 729+ full validation suite
- **Regressions**: Zero

### Pino Migration (Feb 2026)
- **Before**: 60 console.* calls across 14 files, inconsistent logging levels
- **After**: Unified pino logging via `lib/js-logger.js`, zero lint warnings
- **Silent failures found**: Dynamic require causing webpack warning, glob patterns in JSDoc confusing parser
- **Tests**: Clean build, zero lint warnings
- **Regressions**: Zero
