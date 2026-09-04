# Pre-Refactor Structural Mapping Discovery

**Purpose**: Map the complete internal structure of a large file BEFORE extraction begins.
**When to run**: Before ANY modular extraction of a file >1,000 lines.
**Pattern**: `safe-modular-extraction-pattern.md` (Phase 1)
**Time**: 1–2 hours
**Output**: Structural map with dependency graph, state inventory, and extraction plan

---

## How to Use This Discovery

This discovery is **parameterized** — replace `TARGET` with the file you're analyzing:

```
TARGET=/path/to/large-file.js
```

Run each section in order. The output of earlier sections informs later analysis.

---

## Section 1: Size and Complexity Assessment

**Goal**: Understand the scale of what you're dealing with.

```bash
# Total lines
wc -l $TARGET

# Function count (approximate)
grep -c 'function \|async \|=> {' $TARGET

# Class count
grep -c 'class ' $TARGET

# Export count (public API surface)
grep -c 'module.exports\|exports\.\|export ' $TARGET

# Import/require count (dependency count)
grep -c 'require(\|import ' $TARGET

# Comment density (indicates documentation quality)
grep -c '^\s*//\|^\s*/\*\|^\s*\*' $TARGET
```

**Assessment thresholds**:
| Lines | Functions | Assessment |
|-------|-----------|------------|
| <500 | <15 | Simple — may not need extraction |
| 500–1,000 | 15–30 | Moderate — extraction beneficial |
| 1,000–2,000 | 30–60 | Large — extraction recommended |
| 2,000+ | 60+ | CRITICAL — extraction required |

---

## Section 2: Responsibility Inventory

**Goal**: Identify distinct responsibilities (future module boundaries).

### 2.1 Function/Method Catalog

```bash
# List all function definitions with line numbers
grep -n 'function \|async function \|const .* = .*=> \|\.prototype\.' $TARGET

# List all class methods (if class-based)
grep -n '^\s*async \w\+\|^\s*\w\+(.*) {' $TARGET

# Group by naming pattern (handlers, middleware, utils, etc.)
grep -n 'function ' $TARGET | grep -i 'handle\|process\|validate\|create\|parse\|format'
grep -n 'function ' $TARGET | grep -i 'auth\|session\|token\|verify'
grep -n 'function ' $TARGET | grep -i 'middleware\|intercept\|wrap'
grep -n 'function ' $TARGET | grep -i 'init\|setup\|start\|connect\|close\|shutdown'
```

### 2.2 Request/Response Handlers

```bash
# HTTP route handlers
grep -n 'app\.\(get\|post\|put\|delete\|patch\|use\)(' $TARGET

# MCP protocol handlers (method dispatch)
grep -n "case '\|method ===\|method ==" $TARGET

# Express middleware registration
grep -n 'app\.use(' $TARGET
```

### 2.3 Responsibility Grouping

Based on the function catalog, create groups like:
- **Authentication/Authorization** — Token validation, user context extraction
- **Session Management** — Session creation, lookup, cleanup, persistence
- **Protocol Handling** — MCP/HTTP method dispatch, request/response formatting
- **Business Logic** — Domain operations (tool calls, resource access, prompts)
- **Error Handling** — Error factories, middleware, response formatting
- **Monitoring/Health** — Health checks, metrics, statistics

---

## Section 3: Dependency Graph

**Goal**: Map what depends on what (critical for extraction order).

### 3.1 External Dependencies

```bash
# All require/import statements
grep -n 'require(\|from ' $TARGET | sort

# Group by origin
grep -n 'require(' $TARGET | grep "'\.\./\|'\./" | sort   # Local imports
grep -n 'require(' $TARGET | grep -v "'\.\./\|'\./"       # npm packages
```

### 3.2 Internal Call Graph

```bash
# Functions that call other functions in the same file
# (manual analysis — read function bodies and note cross-references)

# Find function-calling patterns
grep -n 'this\.\w\+(' $TARGET | sort
grep -n 'self\.\w\+(' $TARGET | sort

# Find direct function calls (non-method)
grep -n '^\s*\w\+(.*);$\|await \w\+(' $TARGET
```

### 3.3 Circular Dependency Detection

```bash
# Check if this file is imported by its own dependencies
# (get the file's imports, then check if any of them import this file back)
FILE_NAME=$(basename $TARGET .js)
IMPORTS=$(grep "require(" $TARGET | grep -o "'[^']*'" | tr -d "'" | head -20)
for imp in $IMPORTS; do
  # Resolve relative paths and check for back-imports
  echo "Checking: $imp"
done
```

---

## Section 4: State Management Map

**Goal**: Identify ALL mutable state (the #1 source of silent failures during extraction).

### 4.1 Module-Level State

```bash
# Variables defined at module scope (outside any function)
grep -n '^let \|^var \|^const .* = new \|^const .* = {' $TARGET

# Mutable module state (let/var at top level)
grep -n '^let \|^var ' $TARGET

# Singleton patterns
grep -n 'global\.\|globalThis\.\|process\.' $TARGET
```

### 4.2 Closure State

```bash
# Functions that capture variables from outer scope
# (manual analysis — look for variables used inside functions that are defined outside them)

# Common patterns:
grep -n 'Map()\|Set()\|= \[\]\|= {}' $TARGET  # Data structures
grep -n 'Interval\|Timeout\|setInterval\|setTimeout' $TARGET  # Timers
grep -n 'EventEmitter\|\.on(\|\.emit(' $TARGET  # Event listeners
```

### 4.3 Session/Connection State

```bash
# Session maps, connection pools, client instances
grep -n -i 'session\|connection\|pool\|client\|socket' $TARGET | grep -i 'map\|new \|= {'

# State cleanup patterns
grep -n -i 'cleanup\|close\|disconnect\|destroy\|clear\|delete' $TARGET
```

### 4.4 State Classification

For each piece of mutable state, classify:
| State | Scope | Shared By | Can Extract? |
|-------|-------|-----------|-------------|
| sessionMap | module | all handlers | Extract to session-manager module |
| prisma | module | all DB calls | Keep as injected dependency |
| serverConfig | module | init + handlers | Extract to config module |

---

## Section 5: Integration Points

**Goal**: Map connections to external systems (database, events, APIs).

### 5.1 Database Access

```bash
# Prisma queries
grep -n 'prisma\.\|await .*\.findMany\|await .*\.findUnique\|await .*\.create\|await .*\.update\|await .*\.delete' $TARGET

# Raw SQL
grep -n '\$queryRaw\|\$executeRaw' $TARGET

# Transaction blocks
grep -n '\$transaction' $TARGET
```

### 5.2 Event System

```bash
# Event emission
grep -n '\.emit(\|NOTIFY\|pg_notify' $TARGET

# Event listening
grep -n '\.on(\|\.once(\|\.addEventListener\|LISTEN' $TARGET
```

### 5.3 External API Calls

```bash
# HTTP client calls
grep -n 'fetch(\|axios\.\|request(' $TARGET

# MCP tool calls
grep -n '\.callTool(\|\.listTools(\|\.readResource(' $TARGET
```

### 5.4 File System

```bash
# File operations
grep -n 'fs\.\|readFile\|writeFile\|existsSync\|mkdir' $TARGET
```

---

## Section 6: Error Handling Inventory

**Goal**: Map error handling patterns (inconsistencies here are common silent failures).

```bash
# Try/catch blocks
grep -n 'try {\|} catch' $TARGET

# Error creation/throwing
grep -n 'throw \|new Error\|createError\|createMCPError' $TARGET

# Error response patterns
grep -n 'res\.status\|error:\|errorCode\|error_description' $TARGET

# Logging in error handlers
grep -n 'log\.\|console\.\|logger\.' $TARGET | grep -i 'error\|warn\|fatal'
```

---

## Section 7: Silent Failure Detection

**Goal**: Proactively find the bugs that refactoring would either fix or accidentally introduce.

### 7.1 Duplicated Constants

```bash
# String literals used multiple times (potential shared constants)
grep -oh "'[^']*'" $TARGET | sort | uniq -c | sort -rn | head -20

# Magic numbers
grep -n '[^0-9][0-9]\{3,\}[^0-9]' $TARGET | grep -v 'line\|col\|port'
```

### 7.2 Duplicated Logic

```bash
# Functions with similar names (reimplemented logic)
grep -n 'function ' $TARGET | awk -F'[( ]' '{print $2}' | sort

# Copy-paste indicators (identical multi-line blocks)
# Manual: Look for functions that do similar things differently
```

### 7.3 Inconsistent Patterns

```bash
# Auth checks — are they consistent?
grep -n 'req\.user\|user\.id\|userId\|req\.headers.*auth' $TARGET

# Error handling — consistent format?
grep -n 'catch\|error\|err ' $TARGET | head -30

# Response format — consistent shape?
grep -n 'res\.json\|res\.status\|JSON\.stringify' $TARGET | head -20
```

---

## Section 8: Extraction Plan Generation

**Goal**: Produce the ordered extraction plan (what to extract, in what order).

Based on Sections 1–7, create the plan:

### Template

```markdown
## Extraction Plan for [filename]

### Current State
- Lines: X
- Functions: Y
- Responsibilities: Z groups identified
- Mutable state: N variables
- Silent failures found: M issues

### Extraction Order (dependencies determine order)

1. **Shared constants/config** (Phase 3)
   - Files: `[target]-constants.js`, `[target]-config.js`
   - What: [list constants and config to extract]
   - Risk: Low — pure values, no behavior

2. **Utility functions** (Phase 4a)
   - Files: `[target]-utils.js`
   - What: [list utility functions]
   - Risk: Low — stateless functions

3. **Middleware** (Phase 4b)
   - Files: `[target]-auth.js`, `[target]-session.js`
   - What: [list middleware functions]
   - Risk: Medium — may reference shared state
   - State dependencies: [list]

4. **Protocol handlers** (Phase 4c)
   - Files: `handlers/[method].js`
   - What: [list handler functions]
   - Risk: Medium — business logic
   - State dependencies: [list]

5. **Thin facade** (Phase 4d)
   - The original file becomes the wiring/entry point
   - Target: < 200 lines

### Validation Checkpoints
After each extraction:
- [ ] `npx next lint` — zero warnings
- [ ] `npm run build` — clean build
- [ ] `npm run test:all-validation` — all pass
- [ ] Domain-specific tests pass
```

---

## Section 9: mcp-server-http-clean.js Specific Analysis

When running this discovery against `mcp-server-http-clean.js` (~3,886 lines post Waves 1-4 as of 2026-05-21; grep `wc -l` for current), pay special attention to:

### 9.1 Auth Middleware Stack
```bash
# Map the full auth chain
grep -n 'auth\|jwt\|Bearer\|token\|apiKey\|X-API-Key\|OAuth' mcp-server-http-clean.js
```

### 9.2 MCP Protocol Method Dispatch
```bash
# Map all MCP methods handled
grep -n "initialize\|tools/list\|tools/call\|resources/list\|resources/read\|prompts/list\|prompts/get" mcp-server-http-clean.js
```

### 9.3 Session State Architecture
```bash
# Session lifecycle
grep -n -i 'session\|Mcp-Session-Id\|sessionId' mcp-server-http-clean.js
```

### 9.4 Resource Manager Integration
```bash
# How does it wire to SimpleResourceManager?
grep -n 'resourceManager\|SimpleResourceManager\|resource' mcp-server-http-clean.js
```

### 9.5 Known Architecture from resource-manager-specialist
- Production uses HTTP transport (NOT stdio)
- Auth middleware extracts user from JWT/OAuth/API key → `req.user`
- User context propagated to MCP request processing
- Resource handlers currently have limited POV validation
- Session management supports persistent and stateless modes

### Expected Module Boundaries for mcp-server-http-clean.js
Based on the resource-manager-specialist's knowledge:

| Module | Responsibility | Est. Lines |
|--------|---------------|-----------|
| `mcp-http-auth.js` | JWT, OAuth, API key middleware | 200–300 |
| `mcp-http-session.js` | Session creation, lookup, cleanup | 150–250 |
| `mcp-http-handlers.js` | MCP method dispatch (initialize, tools, resources, prompts) | 400–600 |
| `mcp-http-tools.js` | Tool call routing and execution | 300–500 |
| `mcp-http-resources.js` | Resource list/read with POV validation | 200–300 |
| `mcp-http-errors.js` | Error formatting, response helpers | 100–150 |
| `mcp-http-health.js` | Health check, monitoring endpoints | 50–100 |
| `mcp-server-http-clean.js` | Thin facade — Express app, wiring, startup | 200–300 |

**Total estimated**: ~2,000–2,500 lines across 8 files (vs 4,029 in one file)

---

## Validation

After completing this discovery, you should have:

- [ ] Line count and complexity metrics
- [ ] Complete function catalog grouped by responsibility
- [ ] Dependency graph (imports + internal call graph)
- [ ] State management inventory with extraction classification
- [ ] Integration points mapped (DB, events, APIs)
- [ ] Error handling inventory
- [ ] Silent failures identified (at least 1 expected for files >2,000 lines)
- [ ] Ordered extraction plan with validation checkpoints

If any section is unclear, run the discovery again with more targeted queries before proceeding to extraction.

---

## Related

- **Pattern**: `safe-modular-extraction-pattern.md` — The 6-phase methodology this discovery supports
- **Pattern**: `facade-handler-extraction-pattern.md` — Mechanical extraction steps (Phase 4)
- **Discovery**: `facade-extraction-discovery.md` — Post-extraction verification
- **Discovery**: `resource-manager-discovery.md` — Example of domain-specific structural mapping
