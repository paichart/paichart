# Time Bomb Detection Pattern

**Type**: Prevention Pattern - Silent Degradation Detection
**Created**: January 8, 2026 (MCP Hub registry(action: "update") investigation)
**Confidence**: 94% - Production-validated across multiple discoveries
**Status**: Active prevention pattern

---

## Pattern Overview

**Problem**: Time bombs are issues that work perfectly initially but silently degrade over time, eventually causing production failures. They pass all tests during development and QA because they need sustained traffic/time to manifest.

**Solution**: Systematic detection through grep patterns, code review checklists, and proactive cleanup scheduling.

**Results**: 5 time bombs detected and fixed in MCP Hub investigation (January 2026). All deployed to production.

---

## What is a Time Bomb?

A time bomb is code that:
1. **Works correctly initially** - Passes all tests, no immediate errors
2. **Degrades silently** - No warnings, no errors, just growing worse
3. **Fails catastrophically** - Eventually hits memory limits, connection exhaustion, or data corruption
4. **Requires sustained traffic/time to manifest** - Can't be caught in short test runs

### Typical Manifestation Timeline

```
Day 1-7:    Everything works perfectly
Day 8-30:   Slight slowdowns (unnoticed)
Day 31-60:  Memory usage creeping up
Day 61-90:  Occasional timeouts
Day 90+:    💥 Production crash - "nothing changed!"
```

---

## Time Bomb Categories

### Category 1: Unbounded Caches (Maps/Objects with No Size Limit)

**Pattern**: `new Map()` or `{}` used as cache without maxSize enforcement.

**Detection**:
```bash
# Find Maps used as caches without size limits
grep -rn "new Map()" --include="*.js" --include="*.ts" | grep -i "cache"

# Find cache-related Maps
grep -rn "this\.\w*[cC]ache\s*=\s*new Map" --include="*.js" --include="*.ts"
```

**Real Examples Found**:
```javascript
// TIME BOMB: service-health-handler.js:39
this.healthCache = new Map();  // NO SIZE LIMIT!

// TIME BOMB: parameter-normalizer.js:21
this.statistics.byTool = new Map();  // Grows with every unique tool name

// TIME BOMB: enterprise-parameter-intelligence.js:15
this.cache = new Map();  // Has TTL but NO SIZE LIMIT
```

**Fix Pattern (Simple LRU Eviction)**:
```javascript
// SIMPLE APPROACH (recommended for most cases)
// JavaScript Map maintains insertion order, so first key = oldest
set(key, value) {
  if (this.cache.size >= this.maxSize) {
    const firstKey = this.cache.keys().next().value;
    this.cache.delete(firstKey);
  }
  this.cache.set(key, { data: value, timestamp: Date.now() });
}
```

**Fix Pattern (Full LRU with Access Tracking)**:
```javascript
// FULL LRU (use when access patterns matter)
class BoundedCache {
  constructor(maxSize = 500, ttl = 300000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.cache = new Map();
  }

  set(key, value) {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, { data: value, timestamp: Date.now() });
  }

  get(key) {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < this.ttl) {
      // Move to end (most recently used) - true LRU
      this.cache.delete(key);
      this.cache.set(key, entry);
      return entry.data;
    }
    this.cache.delete(key); // Remove stale entry
    return null;
  }
}
```

**Practical Note**: The simple approach (evict oldest on insert) works for 90% of cases. True LRU (move-to-end on access) only matters when you have high read/low write ratios.

**Alternative: Skip-if-full (for stats/metrics)**:
```javascript
// When tracking stats, you may prefer to skip new entries rather than evict old ones
// This preserves historical data for known items
if (!this.stats.has(key)) {
  if (this.stats.size < this.maxSize) {
    this.stats.set(key, { count: 0 });
  }
  // else: silently skip - we have enough tracked items
}
const entry = this.stats.get(key);
if (entry) entry.count++;
```

---

### Category 2: Missing Cleanup Schedulers

**Pattern**: Records created in database but never cleaned up.

**Detection**:
```bash
# Find create() calls without corresponding cleanup
grep -rn "prisma\.\w+\.create" --include="*.js" --include="*.ts" | grep -v "cleanup\|delete"

# Find tables that might need cleanup
grep -rn "AuditLog\|MCPInteraction\|Session\|Log" --include="*.js" | grep create
```

**Real Examples Found**:
```javascript
// TIME BOMB: compliance-monitor.js:352
// Method exists but NEVER called!
async cleanupOldEvents(daysOld) {
  // ... cleanup logic ...
}
// But NO SCHEDULER calls it!

// TIME BOMB: hub-utilities.js:243
await this.prisma.mcpInteraction.create({ ... });
// Created on every tool call, NEVER cleaned up
```

**Fix Pattern (Scheduled Cleanup)**:
```javascript
class ComplianceMonitor {
  constructor() {
    this.scheduleCleanup();
  }

  scheduleCleanup() {
    // Run immediately on startup
    this.runCleanup();

    // Schedule daily cleanup
    const interval = setInterval(() => {
      this.runCleanup();
    }, 24 * 60 * 60 * 1000); // 24 hours

    // CRITICAL: Don't block process exit
    interval.unref();
  }

  async runCleanup() {
    try {
      await this.cleanupOldEvents(90);       // AuditLog: 90 days
      await this.cleanupOldInteractions(30); // MCPInteraction: 30 days
      complianceLogger.info('Completed scheduled cleanup');
    } catch (error) {
      complianceLogger.error({ err: error }, 'Cleanup failed');
    }
  }
}
```

---

### Category 3: Session/Connection Leaks

**Pattern**: Connections or sessions created but not properly closed on shutdown/error.

**Detection**:
```bash
# Find connection pools without cleanup
grep -rn "getInstance\|singleton" --include="*.js" | grep -i "pool\|connection"

# Find sessions without TTL
grep -rn "session.*Map\|Map.*session" --include="*.js"

# Find shutdown handlers
grep -rn "SIGTERM\|SIGINT\|shutdown" --include="*.js"
```

**Real Examples Found**:
```javascript
// TIME BOMB: ServiceConnectionPool - Connections not closed on server restart
// mcp-server-v5.js (before fix)
async shutdown() {
  await prisma.$disconnect();
  await this.server.close();
  // ServiceConnectionPool NOT cleaned! Connections leak on restart!
}
```

**Fix Pattern (Graceful Shutdown)**:
```javascript
async shutdown() {
  this.logger.info('Shutting down gracefully...');

  // 1. Close database connections
  try {
    await prisma.$disconnect();
    this.logger.info('Database connections closed');
  } catch (error) {
    this.logger.error('Database disconnect error:', error);
  }

  // 2. Close connection pools (P0 fix - prevents connection leaks)
  try {
    const pool = ServiceConnectionPool.getInstance();
    await pool.closeAll();
    this.logger.info('ServiceConnectionPool connections closed');
  } catch (error) {
    this.logger.error('Pool cleanup error:', error);
  }

  // 3. Close server
  await this.server.close();
  this.logger.info('Shutdown complete');
}

// Handle signals
process.on('SIGTERM', async () => await server.shutdown());
process.on('SIGINT', async () => await server.shutdown());
```

---

### Category 4: OAuth/Auth State Accumulation

**Pattern**: OAuth state, tokens, or request tracking stored in memory without expiration.

**Detection**:
```bash
# Find OAuth state storage
grep -rn "oauthRequests\|oauthState\|authState\|sessionStore\.setOAuthRequest" --include="*.js" --include="*.ts"

# Find state Maps without cleanup
grep -rn "state.*Map\|Map.*state" --include="*.js" --include="*.ts" | grep -v cleanup

# Verify bounded-store usage (SessionStore is the canonical OAuth-state owner)
grep -rn "sessionStore\.\(setOAuthRequest\|deleteOAuthRequest\)" mcp-server-http-clean.js
```

**Real Example — CORRECT pattern (SessionStore class, May 2026)**:

The canonical bounded-state implementation lives in `lib/auth/oauth/session-store.ts`. Callers in `mcp-server-http-clean.js` go through `this.sessionStore.setOAuthRequest()` / `getOAuthRequest()` / `deleteOAuthRequest()`. The store enforces FIFO capacity caps + TTL eviction internally (the "Simple LRU" variant above — insertion-order, no re-insertion on access; suitable for session caches dominated by TTL eviction):

```javascript
// mcp-server-http-clean.js — caller side (HTTP route handler)
this.sessionStore.setOAuthRequest(serverState, oauthRequestData);

// Auto-cleanup after 15 minutes (defence-in-depth — TTL is also inside SessionStore)
setTimeout(() => {
  this.sessionStore.deleteOAuthRequest(serverState);
  if (code_challenge) {
    this.sessionStore.deleteOAuthRequest(`pkce:${code_challenge}`);
  }
}, 15 * 60 * 1000);
```

**Fix Pattern (Bounded class with built-in FIFO eviction + TTL cleanup)**:

```typescript
// lib/auth/oauth/session-store.ts — class side
export class SessionStore {
  private readonly oauthRequests = new Map<string, OAuthRequestData>();
  private readonly maxOAuthRequests: number;  // default 1000

  setOAuthRequest(key: string, data: OAuthRequestData): void {
    // FIFO eviction when at capacity (insertion order via Map.keys().next().value).
    // Not true LRU — we don't re-insert on access. Acceptable because TTL eviction
    // is the dominant clean-up path; capacity-eviction is the safety net.
    if (this.oauthRequests.size >= this.maxOAuthRequests && !this.oauthRequests.has(key)) {
      const oldestKey = this.oauthRequests.keys().next().value;
      if (oldestKey) {
        this.oauthRequests.delete(oldestKey);
        this.evictionStats.oauth++;
        this.logger.warn({ evictedKey: oldestKey.substring(0, 20) }, '[SessionStore] FIFO-evicted');
      }
    }
    this.oauthRequests.set(key, data);
  }
  // ...periodic TTL cleanup runs inside startCleanup() — owned by the class, not the caller.
}
```

**Why a class beats inline Maps**: FIFO capacity eviction + TTL cleanup loop + race-tested atomic ops + typed interfaces all live in one place; specialist review focuses on one file; 12 unit tests cover the time-bomb-prevention invariants in `scripts/test-session-store.ts`. Pre–Phase 2.x history (raw `this.oauthRequests = new Map()` inline in `mcp-server-http-clean.js`) is retained in `cline_docs/reviews/mcp-server-http-clean-refactor-2026-05-19/` for reference.

---

### Category 5: Session TTL Without Enforcement

**Pattern**: Sessions have defined TTL but no scheduler to enforce it.

**Detection**:
```bash
# Find TTL definitions without corresponding cleanup
grep -rn "TTL\|ttl\|expir" --include="*.js" --include="*.ts" | grep -v "setTimeout\|setInterval"

# Find session cleanup intervals
grep -rn "SESSION.*CLEANUP\|cleanup.*session\|startCleanup\|cleanupStaleSessions" --include="*.js" --include="*.ts"

# Verify SessionStore-owned TTL cleanup is registered
grep -n "this\.sessionStore = new SessionStore" mcp-server-http-clean.js
```

**Real Example — CORRECT pattern (SessionStore class, May 2026)**:

TTL + cleanup interval ownership moved INSIDE the class — constructed automatically unless `noCleanup: true` is passed. Callers don't manage their own setInterval / scheduler:

```typescript
// lib/auth/oauth/session-store.ts — class side
export class SessionStore {
  private readonly sessionTtlMs: number;        // default 30 * 60 * 1000
  private readonly cleanupIntervalMs: number;   // default 5 * 60 * 1000
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: SessionStoreOptions) {
    // ...read defaults...
    if (!options.noCleanup) {
      this.startCleanup();   // self-starts; no caller orchestration needed
    }
  }

  startCleanup(): void {
    if (this.cleanupInterval) return;  // idempotent
    this.cleanupInterval = setInterval(() => {
      if (this.destroyed) return;       // tolerates post-destroy callbacks
      this.cleanupStaleSessions();
    }, this.cleanupIntervalMs);
    if (typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();     // doesn't keep Node alive during shutdown
    }
  }

  cleanupStaleSessions(): { sessions: number; oauthRequests: number; authCodes: number } {
    const now = Date.now();
    const stats = { sessions: 0, oauthRequests: 0, authCodes: 0 };

    // Sessions
    for (const [sessionId, createdAt] of this.sessionTimestamps.entries()) {
      if (now - createdAt > this.sessionTtlMs) {
        this.sessionTransports.delete(sessionId);
        this.sessionContexts.delete(sessionId);
        this.sessionTimestamps.delete(sessionId);
        stats.sessions++;
      }
    }
    // OAuth requests (defence-in-depth — callers also setTimeout per entry)
    for (const [key, data] of this.oauthRequests.entries()) {
      if (now - data.createdAt > this.oauthRequestTtlMs) {
        this.oauthRequests.delete(key);
        stats.oauthRequests++;
      }
    }
    // Auth codes (defence-in-depth)
    for (const [code, data] of this.authCodes.entries()) {
      if (now - data.timestamp > this.authCodeTtlMs) {
        this.authCodes.delete(code);
        stats.authCodes++;
      }
    }
    return stats;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    this.sessionTransports.clear();
    this.sessionContexts.clear();
    this.sessionTimestamps.clear();
  }
}

// mcp-server-http-clean.js — caller side
this.sessionStore = new SessionStore({ logger: this.logger });   // auto-starts cleanup
// On shutdown: this.sessionStore.destroy();
```

**Why ownership inside the class beats caller-driven scheduling**: the cleanup interval can't be forgotten when adding a new caller; `noCleanup: true` is the explicit opt-out for transient setups; `destroy()` is idempotent + tolerates in-flight callbacks. Race-tested in `scripts/test-session-store.ts` (TTL cleanup test with 10ms TTL + 5ms interval).

---

### Category 6: Singleton Instance Misuse

**Pattern**: Creating new instances instead of using global singletons (connection pool exhaustion).

**Detection**:
```bash
# Find new PrismaClient() - should use global singleton
grep -rn "new PrismaClient" --include="*.js" --include="*.ts"

# Find correct pattern usage
grep -rn "require.*prisma" --include="*.js" | grep -v "node_modules"
```

**Real Example Found (hub-audit-service.js - before fix)**:
```javascript
// TIME BOMB: Creates new connection pool per instantiation!
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();  // WRONG - exhausts connection pool!
```

**Fix Pattern (Global Singleton)**:
```javascript
// CORRECT: Use global singleton
const { prisma: globalPrisma } = require('../../../../prisma');
const prisma = globalPrisma;

// Or with validation
const { prisma, ensureConnected } = require('./lib/prisma');

async function doWork() {
  const connected = await ensureConnected(5, 2000);
  if (!connected) {
    throw new Error('Database connection failed');
  }
  // Now safe to use prisma
}
```

---

### Category 7: Placeholder/Stub Implementations (LLM-Generated)

**Pattern**: Code with comments like "In a real implementation..." that appears to work but lacks actual functionality.

**Detection**:
```bash
# Primary LLM placeholder phrases
grep -rn "In a real implementation\|For now, we\|This is a placeholder\|This is a stub" \
  --include="*.ts" --include="*.tsx" --include="*.js"

# Secondary patterns
grep -rn "would normally\|would typically\|For simplicity\|For demo" \
  --include="*.ts" --include="*.tsx" --include="*.js"

# Code patterns (always returns dummy value)
grep -rn "return true.*TODO\|return null.*TODO\|return \[\].*TODO" \
  --include="*.ts" --include="*.tsx" --include="*.js"
```

**Common LLM Placeholder Phrases** (GPT-3.5/4, Claude 1/2, Copilot):
- "In a real implementation, this would..."
- "For now, we'll just..."
- "In production, this would..."
- "For simplicity, we..."
- "This is a placeholder/stub/mock"
- "Would normally/typically..."
- "TODO: implement..."
- "Ideally, this would..."
- "Eventually, this should..."

**Real Examples Found**:
```javascript
// PLACEHOLDER: app/api/pov/agent/execute/route.ts:167
// In a real implementation, this would trigger an async job to execute the agent
// For now, we'll just return a mock response
setTimeout(async () => { ... }, 1000);  // Simulated execution!

// PLACEHOLDER: lib/pov/services/status.ts:66
check: async (pov) => {
  // TODO: Implement KPI validation logic
  return true;  // Always passes - no real validation!
},

// PLACEHOLDER: components/.../StageCarousel.tsx:74
// In a real implementation, this would open a modal or inline editor
const newName = prompt('Enter new stage name:', currentStage.name);  // Uses browser prompt!
```

**Fix Pattern**:
1. **Identify the intended functionality** from the comment
2. **Check if infrastructure exists** (APIs, services, components)
3. **Implement properly** or **remove the feature** if not needed
4. **Remove the placeholder comment** after fixing

**Why This Is a Time Bomb**:
- Passes tests (code runs without errors)
- Appears to work (returns values, shows UI)
- Silently provides wrong/missing functionality
- Users may rely on features that don't actually work
- Accumulates technical debt over time

**Audit Reference**: `cline_docs/stub-mock-placeholder-audit-plan.md`

---

### Category 8: In-Memory Rate Limiting (Scaling Time Bomb)

**Pattern**: Rate limiting using in-memory `Map` storage. Works perfectly on a single instance but becomes ineffective or inconsistent when scaling to multiple instances. Also resets on every server restart.

**Detection**:
```bash
# Find in-memory rate limiting implementations
grep -rn "rateLimit\|rate_limit\|rateLimiting" --include="*.js" --include="*.ts" | grep -i "map\|cache\|new Map"

# Find rate limit checks not backed by persistent store
grep -rn "checkRateLimit\|checkLimit" --include="*.js" | grep -v "redis\|database\|prisma"
```

**Current State (Feb 2026)**:
```javascript
// hub-utilities.js - RateLimitCache singleton (in-memory)
class RateLimitCache {
  constructor() {
    this.cache = new Map();       // In-memory only!
    this.maxCacheSize = 10000;    // Bounded (Category 1 time bomb prevented)
  }

  checkRateLimit(userId, serviceId, maxRequests, windowMs) {
    const key = `${userId}:${serviceId}`;
    // ... checks against Map ...
  }
}

// Used by: service-call-handler.js, workflow-tools-handler.js
// Also: service-registration-handler.js has its own limiter
```

**Why This Is a Time Bomb**:
1. **Server restart**: All rate limit counters reset → users get free burst after deploy
2. **Multiple instances**: Each instance has its own counter → effective rate limit = N * limit
3. **PM2 cluster mode**: Same problem as multiple instances within one server
4. **Works perfectly in development**: Single instance, no restarts during testing

**Manifestation Timeline**:
```
Single instance:     Rate limiting works perfectly ✅
PM2 cluster (4x):    Users can make 4x the allowed requests ⚠️
Horizontal scaling:  Rate limiting essentially disabled 💥
After deploy/restart: Burst of requests allowed 💥
```

**Fix Pattern (when scaling becomes relevant)**:
```javascript
// Option A: Redis-backed rate limiting (recommended for multi-instance)
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

async checkRateLimit(userId, serviceId, maxRequests, windowMs) {
  const key = `ratelimit:${userId}:${serviceId}`;
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.pexpire(key, windowMs);
  }
  return {
    allowed: current <= maxRequests,
    remaining: Math.max(0, maxRequests - current),
    resetAt: Date.now() + windowMs
  };
}

// Option B: Database-backed (no new dependency, slower)
// Store rate limit counters in PostgreSQL with window timestamps
```

**Current Risk Level**: LOW (single instance deployment). Becomes HIGH when:
- PM2 cluster mode enabled (2+ workers)
- Horizontal scaling (multiple servers behind load balancer)
- Deployment frequency increases (frequent counter resets)

**Mitigation Until Fix**: Acceptable for single-instance deployment. Document in scaling checklist.

---

## Quick Detection Commands

Run these commands to find potential time bombs in your codebase:

```bash
# 1. Unbounded Maps/Caches
grep -rn "new Map()" --include="*.js" --include="*.ts" | grep -i "cache\|pool\|store"

# 2. Missing cleanup for database records
grep -rn "\.create(" --include="*.js" | grep -E "AuditLog|Interaction|Session|Log"

# 3. Connection pools without shutdown
grep -rn "getInstance" --include="*.js" | head -20

# 4. TTL defined but not enforced
grep -rn "TTL" --include="*.js" | grep -v "setInterval\|setTimeout"

# 5. Prisma anti-patterns
grep -rn "new PrismaClient" --include="*.js" --include="*.ts"

# 6. Maps growing without bounds
grep -rn "this\.\w*\.set(" --include="*.js" | grep -v "\.delete\|maxSize\|limit"

# 7. LLM-generated placeholder code
grep -rn "In a real implementation\|For now, we\|return true.*TODO" \
  --include="*.ts" --include="*.tsx" --include="*.js" | grep -v node_modules

# 8. In-memory rate limiting (scaling time bomb)
grep -rn "rateLimit\|checkLimit" --include="*.js" --include="*.ts" | \
  grep -i "map\|cache" | grep -v "redis\|database"
```

---

## Audit Checklist

When reviewing code for time bombs:

### Cache/Map Review
- [ ] Every `new Map()` has a `maxSize` limit
- [ ] Every cache has TTL expiration
- [ ] LRU or FIFO eviction implemented
- [ ] Stats tracking for cache size monitoring

### Database Records Review
- [ ] Every `create()` has corresponding cleanup
- [ ] Cleanup method is ACTUALLY CALLED (not just defined)
- [ ] Cleanup runs on schedule (not just on-demand)
- [ ] Cleanup uses `.unref()` to not block process exit

### Connection/Session Review
- [ ] All connections closed in shutdown handler
- [ ] Sessions have TTL enforcement
- [ ] Cleanup scheduler running for stale sessions
- [ ] SIGTERM/SIGINT handlers call shutdown

### Singleton Review
- [ ] No `new PrismaClient()` outside `/lib/prisma.ts`
- [ ] Connection pools use getInstance() pattern
- [ ] Global singletons used consistently

### Placeholder/Stub Review
- [ ] No "In a real implementation" comments in production code
- [ ] No `return true` with TODO comments
- [ ] No `prompt()` or `alert()` in production UI
- [ ] No `setTimeout` simulating async operations
- [ ] No hardcoded data where database queries expected
- [ ] All TODO comments have tracking issues

---

## Production Results

### MCP Hub Investigation (January 2026)

| # | Time Bomb | Location | Severity | Fix Applied |
|---|-----------|----------|----------|-------------|
| 1 | Health Cache - NO SIZE LIMIT | `service-health-handler.js` | HIGH | `maxHealthCacheSize: 500` + LRU eviction |
| 2 | AuditLog - NEVER CLEANED | `compliance-monitor.js` | HIGH | `scheduleCleanup()` with daily interval |
| 3 | MCPInteraction - NEVER CLEANED | `compliance-monitor.js` | HIGH | Added to `runCleanup()` (30-day retention) |
| 4 | Parameter Normalizer Stats | `parameter-normalizer.js` | MEDIUM | `maxToolStats: 100` + skip if at limit |
| 5 | Enterprise Param Cache | `enterprise-parameter-intelligence.js` | MEDIUM | `maxCacheSize: 1000` + LRU eviction |

**Status**: All 5 time bombs fixed and deployed (commits `8efbb52` and `e89a775`)

### Related Infrastructure Fixes (Previously Applied)

1. **ServiceConnectionPool cleanup** - Added to `mcp-server-v5.js` shutdown
2. **Session cleanup scheduler** - Implemented in `mcp-server-http-clean.js`
3. **OAuth state auto-cleanup** - 15-minute timeout
4. **Resource cleanup maintenance** - 30-minute interval in mcp-server-v5.js

---

## Related Patterns

- **cache-lru-invalidation-pattern.md** - LRU eviction implementation
- **fire-and-forget-activity-logging-pattern.md** - Non-blocking writes
- **prisma-singleton-pattern.md** - Connection pool management

## Related Discovery Prompts

- **time-bomb-detection-discovery.md** - Quarterly audit discovery prompt
  - Comprehensive 30-45 min audit procedure
  - Quick scan commands for all 5 categories
  - Results template and fix time estimates
  - Referenced in quarterly-review-protocol.md (Discovery #10)

## Related Specialists

- **performance-analyst-specialist** - Memory leak detection
- **database-manager-specialist** - Record cleanup strategies
- **mcp-integration-specialist** - Connection pool management

---

## Implementation Checklist

When adding new caches or data stores:

- [ ] Define max size before writing `new Map()`
- [ ] Add TTL to constructor
- [ ] Implement eviction (LRU, FIFO, or time-based)
- [ ] Add to shutdown handler
- [ ] Add monitoring/stats for size tracking
- [ ] Document expected growth rate
- [ ] Add cleanup scheduler if records persist to database
- [ ] Use `.unref()` on intervals to not block process exit

---

**Pattern Status**: Active prevention pattern
**Confidence**: 96% (increased after successful implementation)
**Last Validated**: February 22, 2026 (Category 8 added: in-memory rate limiting)
**Impact**: Prevents silent production degradation
**Categories**: 8 (unbounded caches, missing cleanup, connection leaks, OAuth state, session TTL, singleton misuse, LLM placeholders, in-memory rate limiting)
