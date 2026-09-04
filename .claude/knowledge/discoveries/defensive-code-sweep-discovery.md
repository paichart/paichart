# Defensive Code Sweep Discovery

**Type**: Static Analysis Discovery — Grep-based audit for structural defects
**Created**: February 26, 2026
**Time**: ~5 minutes per sweep, ~45 minutes for all 9
**When to use**: Monthly mid-quarter check, after deploying new async/pool/boundary code, during defensive hardening sessions

---

## What This Discovers

Structural coding defects that are **not caught by functional smoke tests** because they only manifest under edge conditions (Node crash on rejection, concurrent load, DB driver variation). These are found by static grep patterns, not runtime observation.

| Sweep | Bug Class | Impact Category | What It Catches |
|-------|-----------|----------------|-----------------|
| 1 | BC11 — Unhandled Async Fire-and-Forget | **Availability** | Node crashes on unhandled rejection in setInterval/fire-and-forget |
| 2 | TOCTOU in Deduplication/Pools | **Resource Integrity** | Connection leaks, duplicate resource creation under concurrent load |
| 3 | BC1 Expansion — ensureObject Gaps | **Data Correctness** | `Object.keys()` on string returns char indices, corrupted counts |
| 4 | Unbounded Map/Set Growth | **Memory Safety** | OOM crashes from Maps that grow per-request without MAX size/LRU eviction |
| 5 | Unguarded JSON.parse | **Crash Safety** | SyntaxError from malformed JSON crashes handler or process |
| 6 | BC14 — Retry Without Backoff | **Resilience** | Constant-delay retries create thundering herd on service recovery |
| 7 | BC15 — ReDoS via User-Controlled Regex | **Security / Availability** | `new RegExp(userInput)` causes catastrophic backtracking, freezing event loop |
| 8 | BC16 — Timing-Unsafe Secret Comparison | **Security** | `===` on hashes/signatures leaks timing info for brute-force attacks |
| 9 | BC17 — Code Injection via new Function()/eval() | **Security (Critical)** | DB-stored strings executed as JavaScript via `new Function()` |

---

## Sweep 1: Unhandled Async Fire-and-Forget (BC11)

**Bug class**: An `async` function called without `await` and without `.catch()` inside `setInterval`, `setTimeout`, or as a bare fire-and-forget call. In Node 18+, unhandled promise rejections terminate the process.

**Why it matters**: Even if the async function has an internal try/catch, the outer async frame can reject before the try block (e.g., if the function signature throws). A defensive `.catch()` is the only guarantee.

### Detection Commands

```bash
# PRIMARY: Find setInterval with async callback (the most dangerous pattern)
# These are ALWAYS unguarded unless they have try/catch INSIDE the callback body
grep -rn 'setInterval(async' --include='*.js' --include='*.ts' lib/ | grep -v node_modules | grep -v '.d.ts' | grep -v '.next/'
# For each hit: check if the async callback body has try/catch wrapping ALL code
# If no try/catch: this is a BC11 site — needs .catch() wrapper

# SECONDARY: Find setInterval calling async functions indirectly (wrapped pattern)
# e.g. setInterval(() => { asyncFunc(); }, ms)  — no .catch() on asyncFunc
grep -rn 'setInterval' --include='*.js' --include='*.ts' lib/ | grep -v node_modules | grep -v '.d.ts' | grep -v '.next/' | grep -v 'setInterval(async' | grep -v 'setInterval(() =>'
# For the () => { } pattern: check if any async call inside has .catch()

# TERTIARY: Find bare async function calls in fire-and-forget contexts
# Search broadly across server code — not just known function names
grep -rn -E 'this\.\w+\(\);\s*$' --include='*.js' lib/mcp/server/ | grep -v '//' | grep -v 'log\.' | grep -v 'clearTimeout\|clearInterval'
# For each hit: is the function async? If yes, needs .catch()

# VERIFY: All setInterval callbacks handle rejections (context view)
grep -B 1 -A 6 'setInterval' --include='*.js' --include='*.ts' lib/ | grep -v node_modules | grep -v '.d.ts' | grep -v '.next/'
# Expected: Every setInterval with an async body should have .catch() or try/catch
```

**Triage rule**: `setInterval(async () => { try { ... } catch { ... } })` is safe (belt+suspenders).
`setInterval(async () => { await foo() })` without try/catch is **unsafe** — the outer async frame can reject before the await.
`setInterval(() => { foo().catch(...) })` is the **recommended** pattern — .catch() on the returned promise.

### Safe Pattern

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

### Known Fixed Sites (7 total across 5 files)

| # | File | Line | Fix |
|---|------|------|-----|
| 1 | `hub-utilities.js` | 439-440 | `.catch()` on startup + wrapped `setInterval` callback |
| 2 | `serverManager.ts` | 581 | Changed `setInterval(async () => { await })` to `.catch()` wrapper |
| 3 | `compliance-monitor.js` | 595 | `.catch()` on bare `runCleanup()` startup call |
| 4 | `compliance-monitor.js` | 599 | `.catch()` on `runCleanup()` inside `setInterval` |
| 5 | `mcpClientWrapper.ts` | 486 | Changed `setInterval(async () => { await })` to `.catch()` wrapper |
| 6 | `resourceManager.ts` | 1016 | Changed `setInterval(async () => { await })` to `.catch()` wrapper |
| 7 | `resourceManager.ts` | 1028 | Changed `setInterval(async () => { await })` to `.catch()` wrapper |

### Safe Sites (5 — have internal try/catch, no action needed)

| File | Line | Why Safe |
|------|------|----------|
| `mcp-client.ts` | 364 | `try { await sendRequest } catch` inside callback |
| `resourceManager.ts` | 925 | `try { await findMany } catch` inside callback |
| `resourceManager.ts` | 1038 | `try { await cleanupArtifactsByTask } catch` inside callback |
| `resourceManager.ts` | 1048 | `try { await cleanupArtifactsByAge } catch` inside callback |
| `resourceManager.ts` | 1763 | `try { await readResource } catch` inside callback |

---

## Sweep 2: TOCTOU in Deduplication / Pool Patterns

**Bug class**: A check-then-act pattern (`if (!map.has(key)) ... await ... map.set(key)`) where an `await` between the check and the set creates a window for concurrent callers to bypass deduplication.

**Why it matters**: In Node's single-threaded model, race conditions only occur at `await` points. If there's an `await` between `has()` and `set()`, another caller can slip through during that yield.

### Detection Commands

```bash
# 1. Find deduplication maps (pending promise patterns)
grep -rn -E 'pendingConnections|pendingRequests|pendingPromises|dedup' --include='*.js' --include='*.ts' lib/ | grep -v node_modules | grep -v '.d.ts'

# 2. Find getOrCreate patterns (common dedup sites)
grep -rn -E 'getOrCreate|getOrConnect|getOrEstablish' --include='*.js' --include='*.ts' lib/ | grep -v node_modules | grep -v '.d.ts'

# 3. Manual check: For each result, verify no await exists between has() and set()
# The fix: register the pending promise BEFORE any await
```

### Safe Pattern

```javascript
// WRONG — TOCTOU window during eviction await
if (this.pendingConnections.has(serviceId)) {
  return this.pendingConnections.get(serviceId);
}
if (this.connections.size >= this.maxConnections) {
  await this.evictOldestConnection();  // <-- yield point: concurrent caller slips past has() check
}
const promise = this._createConnection(serviceId, endpoint);
this.pendingConnections.set(serviceId, promise);  // <-- too late, duplicate already started

// CORRECT — register promise BEFORE any await
if (this.pendingConnections.has(serviceId)) {
  return this.pendingConnections.get(serviceId);
}
const promise = (async () => {
  if (this.connections.size >= this.maxConnections) {
    await this.evictOldestConnection();
  }
  return this._createConnection(serviceId, endpoint);
})();
this.pendingConnections.set(serviceId, promise);  // <-- immediate, no yield before this line
```

### Known Fixed Sites

| File | Line | Fix |
|------|------|-----|
| `service-connection-pool.js` | 78-92 | Wrapped eviction + creation in IIFE, set pending promise before await |

---

## Sweep 3: ensureObject Gaps on Prisma Json Columns (BC1 Expansion)

**Bug class**: Prisma `Json` columns can return strings, arrays, or null depending on DB driver and how data was stored. Code that passes Json values to `Object.keys()`, `Object.entries()`, or into API responses without `ensureObject()` can produce corrupted output.

**Why it matters**: `Object.keys("hello")` returns `["0","1","2","3","4"]`. If a `capabilities` Json column returns a string, `featureCount` becomes the string length, not the key count.

### Detection Commands

```bash
# 1. Find all Json columns in schema
grep -n 'Json' prisma/schema.prisma

# 2. Find response boundaries that pass Json columns without ensureObject
# Focus on files that build API/MCP responses from Prisma data
grep -rn 'capabilities\|configuration\|metadata\|steps\|variables' --include='*.js' lib/mcp/server/tools/ | grep -v ensureObject | grep -v node_modules | grep -v '//' | grep -v 'Array\.isArray'

# 3. Find Object.keys/entries on potentially Json fields
grep -rn 'Object\.keys\|Object\.entries' --include='*.js' lib/mcp/server/ | grep -i 'capabilities\|metadata\|configuration\|steps'

# 4. Cross-reference with bug class registry BC1/BC2 known sites
# All 25 BC1 sites should have ensureObject — verify
grep -rn 'ensureObject' --include='*.js' --include='*.ts' lib/ | wc -l
# Count should be stable or growing (never shrinking)

# 5. Find NEW Json column usages added since last audit
# Compare against known guarded sites in bug-class-registry.md
git log --oneline --since="2026-02-26" --all -- '*.js' '*.ts' | head -20
# Then: grep new files for Json column access without ensureObject
```

### Safe Pattern

```javascript
// WRONG — Json column passed raw into response
return {
  capabilities: service.capabilities,  // Could be string!
  featureCount: service.capabilities ? Object.keys(service.capabilities).length : 0
};

// CORRECT — ensureObject at the response boundary
const { ensureObject } = require('../../../utils/ensure-object');
return {
  capabilities: ensureObject(service.capabilities, {}, 'publicFilter.capabilities'),
  featureCount: service.capabilities ? Object.keys(ensureObject(service.capabilities, {}, 'publicFilter.featureCount')).length : 0
};
```

### Known Fixed Sites (this sweep)

| File | Line | Fix |
|------|------|-----|
| `public-discovery-filter.js` | 229, 235 | Added `ensureObject()` on `capabilities` Json column at public response boundary |

---

## Sweep 4: Unbounded Map/Set Growth (Memory Time-Bomb)

**Bug class**: A `Map` or `Set` used as a server-side cache or registry that grows per-request or per-session without a MAX size constant or LRU eviction. Over time, the Map consumes all available memory, causing OOM crashes or severe GC pauses.

**Why it matters**: Maps in singleton services persist for the lifetime of the Node process. If every request or session adds an entry without eviction, memory grows monotonically. In production with pm2, this manifests as gradual memory increase over days/weeks until the process is killed.

### Detection Commands

```bash
# 1. Find all Map/Set declarations in server-side code
grep -rn 'new Map\|new Set' --include='*.ts' lib/ | grep -v node_modules | grep -v '.d.ts' | grep -v '.next/' | grep -v 'test'

# 2. Cross-reference with MAX size constants — maps without MAX are suspicious
grep -rn 'MAX_\|maxSize\|MAX_ENTRIES\|MAX_SESSIONS\|MAX_USERS' --include='*.ts' lib/ | grep -v node_modules | grep -v '.d.ts'

# 3. Find Maps that are class properties (most dangerous — long-lived)
grep -rn 'private.*Map<\|private.*Set<' --include='*.ts' lib/ | grep -v node_modules | grep -v '.d.ts'

# 4. For each Map found: check if the file has a corresponding MAX constant and eviction logic
# Pattern: MAX constant + .delete() in a loop or conditional = protected
# No MAX constant + only .set() = unbounded growth
```

**Triage rule**: Maps inside function scope (local variables) are safe — they're garbage-collected when the function returns. Only class-level or module-level Maps are at risk.

### Safe Pattern

```typescript
// WRONG — unbounded Map grows per user
private cache: Map<string, CacheEntry> = new Map();
setCache(key: string, value: CacheEntry) {
  this.cache.set(key, value); // No eviction!
}

// CORRECT — LRU eviction at capacity
private static readonly MAX_ENTRIES = 10_000;
private cache: Map<string, CacheEntry> = new Map();
setCache(key: string, value: CacheEntry) {
  if (this.cache.size >= MAX_ENTRIES) {
    const oldestKey = this.cache.keys().next().value;
    if (oldestKey) this.cache.delete(oldestKey);
  }
  this.cache.set(key, value);
}
```

### Known Fixed Sites (this sweep)

| File | Variable | MAX | Fix |
|------|----------|-----|-----|
| ~~`event-driven-session-manager.ts`~~ | DELETED 2026-06-14 | — | dormant dead code removed (never instantiated; not on request path) |
| ~~`event-driven-auth-cache.ts`~~ | DELETED 2026-06-14 | — | dormant dead code removed (real permission cache is `lib/auth/cache.ts`) |
| `workflowEngine.ts` | `activeWorkflows` | 100 concurrent | Reject new workflows at capacity |

### Already Protected (audit confirmed)

| File | Variable | MAX | Mechanism |
|------|----------|-----|-----------|
| ~~`security-event-processor.ts`~~ | DELETED 2026-06-14 | — | dormant dead code removed (c5dab442) |
| ~~`authentication-events.ts`~~ | DELETED 2026-06-14 | — | dormant dead code removed (c5dab442) |
| ~~`memory-leak-prevention.ts`~~ | DELETED 2026-06-14 | — | orphaned by SecurityEventProcessor removal (c5dab442) |
| `resourceManager.ts` | `resources` | 5,000 | LRU + interval cleanup |
| `toolRegistry.ts` | `tools` | 2,000 | LRU + discovery scheduler |
| `contextManager.ts` | `contexts` | 1,000 | LRU + interval cleanup |
| `serverManager.ts` | `servers` | 10 | Config max + 30s health check |
| `tokenManager.ts` | `budgetTracking` | 5,000 | LRU + 7d TTL |
| `taskSubscriptionService.ts` | `subscriptions` | 5,000 tasks | Size limit + periodic cleanup |

---

## Sweep 5: Unguarded JSON.parse (Crash Safety)

**Bug class**: `JSON.parse()` called on external/untrusted data without a surrounding `try/catch`. If the input is malformed JSON, `JSON.parse` throws a `SyntaxError` that propagates to the nearest catch or crashes the process.

**Why it matters**: JSON.parse is a synchronous throw. If it's inside a route handler with a try/catch, the handler returns an error. If it's in a helper function called from a handler, the error may propagate past the handler if no intermediate try/catch exists. Worst case: crashes the process.

### Detection Commands

```bash
# 1. Find all JSON.parse calls in server code
grep -rn 'JSON\.parse' --include='*.ts' --include='*.js' lib/ app/api/ | grep -v node_modules | grep -v '.next/' | grep -v '.d.ts'

# 2. Find JSON.parse NOT inside try/catch (manual check required)
# Look for: JSON.parse on a line where no `try {` appears within 20 preceding lines
# Script approach:
python3 -c "
import os
for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in ('node_modules', '.next')]
    for f in files:
        if f.endswith(('.ts', '.js')) and not f.endswith('.d.ts'):
            path = os.path.join(root, f)
            if path.startswith('./lib/') or path.startswith('./app/api/'):
                with open(path, errors='replace') as fh:
                    lines = fh.readlines()
                for i, line in enumerate(lines):
                    if 'JSON.parse' in line and 'ensureObject' not in line:
                        in_try = False
                        for j in range(i-1, max(i-25, -1), -1):
                            if 'try' in lines[j] and '{' in lines[j]:
                                in_try = True; break
                            if 'catch' in lines[j]: break
                        if not in_try and 'JSON.stringify' not in line:
                            print(f'{path}:{i+1}: {line.strip()}')
"

# 3. Find typeof-string-then-JSON.parse pattern (BC2 sites missed by ensureObject)
grep -rn "typeof.*=== 'string'" --include='*.ts' --include='*.js' lib/ app/api/ | grep -v node_modules | grep JSON
```

**Triage rules**:
- `JSON.parse(JSON.stringify(...))` = round-trip, cannot fail → SAFE
- Inside `ensureObject()` = already guarded → SAFE
- Inside Zod `.transform()` = Zod catches errors → SAFE
- Parsing env vars / config = controlled input → LOW risk
- Parsing user input, MCP args, DB Json columns = **CHECK for try/catch**

### Safe Pattern

```typescript
// WRONG — crashes on malformed JSON
const schema = typeof data === 'string' ? JSON.parse(data) : data;

// CORRECT — use ensureObject (established BC2 defense)
const schema = ensureObject(data, {}, 'context label');

// CORRECT — explicit try/catch with fallback
let parsed;
try {
  parsed = JSON.parse(data);
} catch (e) {
  logger.warn({ err: e }, 'Failed to parse JSON');
  parsed = {};
}
```

### Known Fixed Sites (this sweep)

| File | Line | Input Source | Fix |
|------|------|-------------|-----|
| `app/api/pov-templates/[id]/phase-templates/route.ts` | ~192 | POVTemplate.schema (DB) | Replaced `JSON.parse` with `ensureObject()` |
| `app/api/pov-templates/[id]/phase-templates/standardized-route.ts` | ~192 | POVTemplate.schema (DB) | Replaced `JSON.parse` with `ensureObject()` |
| `lib/services/template-service.ts` | ~178 | POVTemplate.schema (DB) | Replaced `JSON.parse` with `ensureObject()` |

### Audit Summary (Feb 26, 2026)

| Category | Count | Status |
|----------|-------|--------|
| Total JSON.parse calls | 73 | Audited |
| Inside try/catch | 58 | SAFE |
| Round-trip (stringify→parse) | 8 | SAFE (cannot fail) |
| Inside ensureObject/Zod | 4 | SAFE |
| **Unguarded on DB data** | **3** | **FIXED → ensureObject** |
| **Result** | **73/73** | **100% guarded** |

---

## Sweep 6: Retry Without Backoff (BC14 — Thundering Herd)

**Bug class**: A retry loop that uses a constant delay between attempts. Under concurrent failure conditions, all callers retry at the same interval, creating synchronized load spikes that amplify pressure on the struggling service and delay recovery.

**Why it matters**: When a database restarts or an upstream service recovers, constant-delay retries cause all waiting clients to hit it simultaneously at each retry interval. Exponential backoff spreads retries over time; jitter prevents synchronization.

### Detection Commands

```bash
# 1. Find retry/reconnect loops with delay constants
grep -rn 'retryDelay\|retryDelayMs\|reconnectDelay\|RETRY_DELAY' --include='*.ts' --include='*.js' lib/ | grep -v node_modules | grep -v '.d.ts'

# 2. Find setTimeout in retry contexts (constant delay pattern)
grep -B 3 -A 1 'setTimeout.*resolve.*delay\|setTimeout.*resolve.*retry' --include='*.ts' --include='*.js' lib/ | grep -v node_modules

# 3. Verify exponential backoff patterns exist
grep -rn 'Math\.pow\|backoff\|exponential' --include='*.ts' --include='*.js' lib/ | grep -v node_modules | grep -v '.d.ts'

# 4. Cross-reference: files with retry loops should have Math.pow or similar
# Constant delay = needs fix. Exponential delay = safe.
```

**Triage rule**: `Math.min(base * Math.pow(2, attempt), maxDelay)` with jitter = safe. Fixed `setTimeout(resolve, constantMs)` in a retry loop = **needs backoff**.

### Safe Pattern

```typescript
// WRONG — constant delay creates thundering herd
for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try { await connect(); return true; }
  catch { await new Promise(resolve => setTimeout(resolve, 2000)); }  // Always 2s!
}

// CORRECT — exponential backoff with jitter
for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try { await connect(); return true; }
  catch {
    const exponentialDelay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);
    const jitter = exponentialDelay * 0.2 * Math.random();
    await new Promise(resolve => setTimeout(resolve, exponentialDelay + jitter));
  }
}
```

### Known Fixed Sites (this sweep)

| File | Line | Before | After |
|------|------|--------|-------|
| `lib/services/workflow/workflowEngine.ts` | ~355 | Constant 30s retry delay | Exponential backoff (30s base, 120s cap, +20% jitter) |
| `lib/prisma.ts` | ~113 | Constant 2s reconnect delay | Exponential backoff (2s base, 16s cap, +20% jitter) |

### Already Safe (5 sites — have exponential backoff)

| File | Mechanism |
|------|-----------|
| `lib/auth/oauth/retry-utils.ts` | Gold standard: `initialDelay * backoffMultiplier^(attempt-1)` capped at `maxDelay` |
| `lib/auth/oauth/microsoft-graph.ts` | Uses `withRetry()` from retry-utils |
| `lib/auth/oauth/microsoft-mcp-oauth.ts` | Uses `withRetry()` from retry-utils |
| `lib/mcp/server/utils/resilient-call.js` | `initialDelay * 2^retryCount` with jitter |
| `lib/mcp/server/services/service-connection-pool.js` | `baseDelay * 2^attempt` with jitter capped at 30s |

### Audit Summary (Feb 26, 2026)

| Category | Count | Status |
|----------|-------|--------|
| Total retry patterns | 7 | Audited |
| Already have exponential backoff | 5 | SAFE |
| **Constant delay retries** | **2** | **FIXED → exponential + jitter** |
| **Result** | **7/7** | **100% have backoff** |

---

## Sweep 7: ReDoS via User-Controlled Regex (BC15)

**Bug class**: `new RegExp(pattern)` where `pattern` comes from a database column, user input, or external configuration. A crafted pattern with nested quantifiers causes catastrophic backtracking — the regex engine tries exponentially many paths, freezing the Node event loop.

**Why it matters**: A single malicious regex pattern stored in a template field or threat indicator can freeze the entire server for seconds/minutes. Unlike most DoS vectors, this requires no sustained traffic — one request is enough.

### Detection Commands

```bash
# 1. Find all new RegExp() instantiations
grep -rn 'new RegExp(' --include='*.ts' --include='*.js' lib/ app/api/ | grep -v node_modules | grep -v '.d.ts' | grep -v '.next/'

# 2. Filter to dynamic patterns only (exclude template literal substitutions and hardcoded arrays)
grep -rn 'new RegExp(' --include='*.ts' --include='*.js' lib/ app/api/ | grep -v node_modules | grep -v '.d.ts' | grep -v safeRegex | grep -v '`{{' | grep -v 'INJECTION_PATTERNS'
# Expected: 0 results

# 3. Verify safeRegex import exists in files that use dynamic regex
grep -rn 'safeRegex' --include='*.ts' --include='*.js' lib/ app/api/ | grep -v node_modules | grep -v '.d.ts'
```

**Triage rules**:
- `new RegExp(`\`{{${key}}}\``, 'g')` — template substitution with app-controlled key → SAFE
- `new RegExp(CONSTANT_ARRAY[i])` — hardcoded patterns → SAFE
- `new RegExp(dbColumn)` or `new RegExp(userInput)` → NEEDS `safeRegex()`

### Safe Pattern

```typescript
import { safeRegex } from '@/lib/utils/safe-regex';

// WRONG — user-controlled pattern, no validation
const regex = new RegExp(indicator.value);
regex.test(input);

// CORRECT — validated, returns null if unsafe
const regex = safeRegex(indicator.value, '', 'threat indicator');
if (regex) { regex.test(input); }
```

### Known Fixed Sites (this sweep)

| File | Line | Input Source | Fix |
|------|------|-------------|-----|
| ~~`lib/events/security-event-processor.ts`~~ | DELETED 2026-06-14 (c5dab442) | — | — |
| `lib/pov/templates/validator.ts` | ~95 | Field validation pattern (DB) | `safeRegex()` — skips validation if unsafe |

### Already Safe (7 sites — hardcoded/app-controlled patterns)

| File | Why Safe |
|------|----------|
| `prompt-injection-prevention.ts:277` | Hardcoded `INJECTION_PATTERNS` array |
| `prompt-injection-prevention.ts:581` | Template var — key is app-controlled |
| `embedded-server.ts:1511,1518` | Template var — key is app-controlled |
| `prompt-registry.js:436,442,446` | Template vars — keys are app-controlled |

### Audit Summary (Feb 26, 2026)

| Category | Count | Status |
|----------|-------|--------|
| Total `new RegExp()` calls | 9 | Audited |
| Hardcoded/app-controlled patterns | 7 | SAFE |
| **User-controlled patterns** | **2** | **FIXED → safeRegex()** |
| **Result** | **9/9** | **100% safe** |

---

## Sweep 8: Timing-Unsafe Secret Comparison (BC16)

**Bug class**: Comparing secrets, hashes, or HMAC signatures using `===` instead of `crypto.timingSafeEqual()`. The `===` operator short-circuits on the first differing byte, allowing timing-based brute-force attacks.

**Why it matters**: Over HTTPS, response time differences of ~1ms are measurable with enough requests. An attacker can brute-force a 64-character hex HMAC signature in ~256 * 64 = ~16K requests (minutes, not years) by testing one character position at a time.

### Detection Commands

```bash
# 1. Find all secret/hash/signature comparisons
# 2026-07-28: narrowed. The old pattern included a bare `=== expected`, which matched
# ANY identifier named expected* — it fired on `detectedPrefix === expectedPrefix`
# (a CUID prefix) and on `azp === expectedClientId` inside a DOC COMMENT. Neither is a
# secret. Comment lines are now excluded, and `expected` must be qualified by a
# secret-bearing noun.
grep -rn '=== .*[Hh]ash\|=== .*[Ss]ignature\|=== .*expected\(Hash\|Signature\|Token\|Secret\|Digest\|Mac\)\|[Hh]ash ===\|[Ss]ignature ===' --include='*.ts' --include='*.js' lib/ app/api/ | grep -v node_modules | grep -v '.d.ts' | grep -v prisma/generated | grep -v timingSafeEqual | grep -vE '^\S+:[0-9]+:\s*(\*|//)'

# 2. Verify timingSafeEqual is used
grep -rn 'timingSafeEqual' --include='*.ts' --include='*.js' lib/ app/api/ | grep -v node_modules
```

**Triage rules**:
- `=== hash` / `=== signature` / `=== expectedSignature` → NEEDS `timingSafeEqual`
- `=== 'COMPLETED'` / `=== userId` → NOT a secret comparison, safe
- Inside `prisma/generated` → Prisma internals, not our code

### Safe Pattern

```typescript
import crypto from 'crypto';

// WRONG — timing side-channel
return signature === expectedSignature;

// CORRECT — constant-time comparison
const sigBuf = Buffer.from(signature, 'utf8');
const expectedBuf = Buffer.from(expectedSignature, 'utf8');
if (sigBuf.length !== expectedBuf.length) return false;
return crypto.timingSafeEqual(sigBuf, expectedBuf);
```

### Known Fixed Sites (this sweep)

| File | Line | What | Fix |
|------|------|------|-----|
| `app/api/artifacts/[id]/public-download/route.ts` | ~39 | HMAC signature verification | `crypto.timingSafeEqual()` |
| `lib/crypto/hashing.ts` | ~55 | API key hash verification | `crypto.timingSafeEqual()` |

### Audit Summary (Feb 26, 2026)

| Category | Count | Status |
|----------|-------|--------|
| Secret/hash comparisons found | 2 | Audited |
| **Using `===` (timing-unsafe)** | **2** | **FIXED → `timingSafeEqual()`** |
| JWT verification (jose library) | 1 | SAFE (library handles timing internally) |
| **Result** | **2/2** | **100% timing-safe** |

---

## Sweep 9: Code Injection via new Function() / eval() (BC17)

**Bug class**: `new Function(paramName, userString)` or `eval(userString)` where the code string comes from a database column, user input, or external configuration. This executes arbitrary JavaScript on the server, equivalent to a remote code execution (RCE) vulnerability.

**Why it matters**: A single `new Function()` with an unvalidated DB string gives any user with write access to that DB column the ability to execute arbitrary code — read files, spawn processes, access environment variables, or pivot to other services.

### Detection Commands

```bash
# 1. Find all new Function() and eval() in server code
grep -rn 'new Function\s*(\|[^a-zA-Z]eval\s*(' --include='*.ts' --include='*.js' lib/ app/api/ | grep -v node_modules | grep -v '.d.ts' | grep -v prisma/generated | grep -v 'dangerousPatterns'

# 2. Verify: all hits should have blocklist validation
# Expected: 1 result (kpi.ts — has DANGEROUS_PATTERNS validation)
# Any new unvalidated hit = CRITICAL code injection risk
```

**Triage rules**:
- `new Function('param', dbString)` → CRITICAL, needs blocklist
- `eval(userInput)` → CRITICAL, needs blocklist or removal
- String constants listing `'eval('` as detection patterns → SAFE (defensive code)

### Safe Pattern

```typescript
const DANGEROUS_PATTERNS = [
  /\bimport\b/, /\brequire\b/, /\bprocess\b/, /\bglobal(This)?\b/,
  /\beval\b/, /\bFunction\b/, /\bfetch\b/, /\bchild_process\b/,
  /\bexec[A-Z]?\b/, /\bspawn\b/, /\b__proto__\b/, /\bconstructor\b/,
  /\bprototype\b/, /\bProxy\b/, /\bReflect\b/, /\bwhile\b|\bfor\b/,
];

for (const pattern of DANGEROUS_PATTERNS) {
  if (pattern.test(calculation)) {
    logger.warn({ pattern: pattern.source }, 'Calculation rejected — dangerous pattern');
    return null;
  }
}
if (calculation.length > 2000) return null;

// Only then:
const fn = new Function('context', calculation)();
```

### Known Fixed Sites (this sweep)

| File | Line | Source | Fix |
|------|------|--------|-----|
| `lib/pov/services/kpi.ts` | ~247 | KPITemplate.calculation (DB) | Blocklist of 18 dangerous patterns + 2000 char limit |

### Audit Summary (Feb 26, 2026)

| Category | Count | Status |
|----------|-------|--------|
| `new Function()` calls | 1 | Audited |
| `eval()` calls (non-string-const) | 0 | SAFE |
| **Unvalidated code execution** | **1** | **FIXED → blocklist + length limit** |
| **Result** | **1/1** | **100% validated** |

---

## Running the Full Sweep

### Quick Run (~5 min)

Run each command block separately (not as a single script — avoids shell quoting issues).

**Sweep 1a** — Direct hit: `setInterval(async` (most dangerous pattern):
```bash
grep -rn 'setInterval(async' --include='*.js' --include='*.ts' lib/ | grep -v node_modules | grep -v '.d.ts' | grep -v '.next/'
```
Expected: 5 results, all with internal `try/catch` (safe sites listed above). Any NEW result = BC11 site.

**Sweep 1b** — Indirect: `setInterval(() => { asyncFunc() })` without `.catch`:
```bash
grep -rn 'setInterval' --include='*.js' --include='*.ts' lib/ | grep -v node_modules | grep -v '.d.ts' | grep -v '.next/' | grep -v 'setInterval(async' | grep -v '.catch'
```
For each hit: check if any async call inside the callback has `.catch()`.

**Sweep 2** — TOCTOU in dedup/pool:
```bash
grep -rn -E 'pendingConnections|getOrCreate' --include='*.js' --include='*.ts' lib/ | grep -v node_modules | grep -v '.d.ts'
```
Expected: all in `service-connection-pool.js` and `resilient-call.js` (already fixed).

**Sweep 3a** — ensureObject guard count:
```bash
grep -rn 'ensureObject' --include='*.js' --include='*.ts' lib/ | grep -v node_modules | grep -v '.d.ts' | wc -l
```
Expected: 54+ (baseline Feb 26, 2026). Should be stable or growing.

**Sweep 3b** — Json columns at response boundaries without guard:
```bash
grep -rn -E 'capabilities|\.metadata' --include='*.js' lib/mcp/server/tools/ | grep -v ensureObject | grep -v node_modules | grep -v '//' | grep -v 'Array\.isArray' | grep -v '\.catch' | grep -v log\. | head -30
```
Triage: JSDoc comments, `select:` clauses, and input validation hits are false positives. Look for lines that build response objects or pass Json columns to `Object.keys`/`Object.entries`.

**Sweep 4** — Unbounded Map/Set growth:
```bash
grep -rn 'private.*Map<\|private.*Set<' --include='*.ts' lib/ | grep -v node_modules | grep -v '.d.ts' | grep -v '.next/'
```
For each class-level Map: check if the file has a `MAX_` constant. If not, check if the Map has natural lifecycle bounds (e.g., cleared on disconnect). If neither: **unbounded growth risk**.

**Sweep 5** — Unguarded JSON.parse:
```bash
grep -rn 'JSON\.parse' --include='*.ts' --include='*.js' lib/ app/api/ | grep -v node_modules | grep -v '.next/' | grep -v '.d.ts' | grep -v 'JSON\.stringify'
```
For each hit: verify a `try {` block exists within 20 preceding lines, OR the call is inside `ensureObject`/Zod `.transform()`. Any bare JSON.parse on user input or DB data without try/catch = **crash risk**.
Expected baseline: 73 calls, 73/73 guarded (100%). Any new unguarded call = fix needed.

**Sweep 6** — Retry without backoff:
```bash
grep -B 3 -A 1 'setTimeout.*resolve.*delay\|setTimeout.*resolve.*retry' --include='*.ts' --include='*.js' lib/ | grep -v node_modules
```
For each hit: verify the delay uses `Math.pow` or similar exponential scaling. Constant delay in a retry loop = **thundering herd risk**.
Expected baseline: 7 retry patterns, 7/7 with exponential backoff (100%). Any new constant-delay retry = fix needed.

**Sweep 7** — ReDoS (user-controlled regex):
```bash
grep -rn 'new RegExp(' --include='*.ts' --include='*.js' lib/ app/api/ | grep -v node_modules | grep -v '.d.ts' | grep -v safeRegex | grep -v '`{{' | grep -v 'INJECTION_PATTERNS'
```
Expected: 0 results. Any `new RegExp(dynamicValue)` without `safeRegex()` = **ReDoS risk**.

**Sweep 8** — Timing-unsafe secret comparison:
```bash
# 2026-07-28: same narrowing as the Sweep 8 copy above — this file carried the grep
# TWICE and fixing one left the other firing. Bare `=== expected` matched any
# identifier named expected*; comment lines are now excluded too.
grep -rn '=== .*[Hh]ash\|=== .*[Ss]ignature\|=== .*expected\(Hash\|Signature\|Token\|Secret\|Digest\|Mac\)\|[Hh]ash ===\|[Ss]ignature ===' --include='*.ts' --include='*.js' lib/ app/api/ | grep -v node_modules | grep -v '.d.ts' | grep -v prisma/generated | grep -v timingSafeEqual | grep -vE '^\S+:[0-9]+:\s*(\*|//)'
```
Expected: 0 results. Any `===` on secrets/hashes/signatures = **timing attack risk**.

**Sweep 9** — Code injection (new Function / eval):
```bash
grep -rn 'new Function\s*(\|[^a-zA-Z]eval\s*(' --include='*.ts' --include='*.js' lib/ app/api/ | grep -v node_modules | grep -v '.d.ts' | grep -v prisma/generated | grep -v 'dangerousPatterns'
```
Expected: 1 result (kpi.ts — validated). Any new unvalidated `new Function()`/`eval()` = **CRITICAL code injection**.

---

## Cross-References

| Resource | Purpose |
|----------|---------|
| `/.claude/knowledge/domain/mcp/bug-class-registry.md` | BC1 (ensureObject), BC11 (unhandled async) tracking |
| `/.claude/knowledge/protocols/bug-class-eradication-protocol.md` | Full eradication workflow if new sites found |
| `/.claude/knowledge/patterns/connection-pool-pattern.md` | Pool pattern with TOCTOU safety note |
| `/.claude/knowledge/patterns/fire-and-forget-activity-logging-pattern.md` | Fire-and-forget with `.catch()` requirement |
| `/.claude/knowledge/protocols/quarterly-review-master-protocol.md` | Month 2 mid-quarter check references this sweep |

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-26 | 1.0 | Initial creation — 3 sweeps (BC11, TOCTOU, ensureObject gaps) |
| 2026-02-26 | 1.1 | Improved greps from field validation: use `-E` for alternation, `setInterval(async` as primary BC11 detector, split Quick Run into separate commands, added safe sites table, triage rule for try/catch vs .catch, updated to 7 fixed + 5 safe sites |
| 2026-02-26 | 1.2 | Added Sweep 4 (Unbounded Map/Set Growth) — 4 sites fixed, 10 confirmed protected. Full audit of 26 server-side Maps across lib/ |
| 2026-02-26 | 1.3 | Added Sweep 5 (Unguarded JSON.parse) — 3 sites fixed with ensureObject(), 73/73 calls now guarded (100%). Also extends BC2 with P6 sites |
| 2026-02-26 | 1.4 | Added Sweep 6 (Retry Without Backoff / BC14) — 2 constant-delay sites fixed with exponential backoff + jitter, 7/7 retry patterns now safe (100%) |
| 2026-02-26 | 1.5 | Added Sweep 7 (ReDoS / BC15) — 2 user-controlled `new RegExp()` sites fixed with `safeRegex()`, 9/9 regex sites now safe (100%) |
| 2026-02-26 | 1.6 | Added Sweep 8 (Timing-Unsafe Comparison / BC16) — 2 `===` on hashes/signatures fixed with `timingSafeEqual()` |
| 2026-02-26 | 1.7 | Added Sweep 9 (Code Injection / BC17) — 1 `new Function()` on DB string validated with 18-pattern blocklist + length limit |
