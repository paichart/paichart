# Time Bomb Detection Discovery

**Purpose**: Identify runtime infrastructure patterns that cause memory leaks, server crashes, or blocked process exits
**Time**: 30-45 minutes
**Frequency**: Quarterly (Jan, Apr, Jul, Oct) OR after major infrastructure changes
**Created**: January 2026
**Based On**: Jan 2026 Time Bomb Audit (19 files fixed across codebase)

---

## Overview

Time bombs are code patterns that work initially but cause problems over time:
- **Memory leaks**: Unbounded caches grow until OOM
- **Blocked exits**: Timers prevent graceful shutdown
- **Resource exhaustion**: Connection pools, file handles leak

This discovery identifies these patterns BEFORE they cause production incidents.

---

## Quick Scan (5 minutes)

Run these commands for a rapid health check:

```bash
# Category 1: Unbounded Maps/Sets (memory leaks)
echo "=== Maps/Sets without MAX_SIZE ==="
for f in $(grep -rln "new Map()\|= new Map" --include="*.ts" --include="*.js" lib/ middleware/ app/ 2>/dev/null | grep -v node_modules | grep -v ".next"); do
  if grep -qE "^(const|let|export).*= new Map|^[A-Za-z]+\.[A-Za-z]+ = new Map" "$f" && ! grep -q "MAX_" "$f"; then
    echo "  MISSING MAX_SIZE: $f"
  fi
done

# Category 5: Timers without .unref() (blocks process exit)
echo "=== setInterval without .unref() ==="
for f in $(grep -rln "setInterval" --include="*.ts" --include="*.js" lib/ middleware/ app/ 2>/dev/null | grep -v node_modules | grep -v ".next"); do
  if grep -q "setInterval" "$f" && ! grep -q "\.unref()" "$f"; then
    echo "  MISSING .unref(): $f"
  fi
done

echo "=== Done ==="
# Expected: 0 files in each category
```

---

## Comprehensive Audit (30-45 minutes)

### Category 1: Unbounded Caches

**Risk**: Memory grows indefinitely until OOM crash
**Pattern**: `new Map()` or `new Set()` at module level without size limits

#### Detection

```bash
echo "=== Category 1: Unbounded Caches ==="

# Find all module-level Maps
echo "--- Module-level Maps ---"
grep -rn "^const.*= new Map\|^let.*= new Map" --include="*.ts" --include="*.js" lib/ middleware/ app/ 2>/dev/null | grep -v node_modules

# Find all module-level Sets
echo "--- Module-level Sets ---"
grep -rn "^const.*= new Set\|^let.*= new Set" --include="*.ts" --include="*.js" lib/ middleware/ app/ 2>/dev/null | grep -v node_modules

# Find class static Maps
echo "--- Class Static Maps ---"
grep -rn "static.*= new Map\|\..*= new Map();" --include="*.ts" --include="*.js" lib/ middleware/ app/ 2>/dev/null | grep -v node_modules
```

#### Verification

For each Map/Set found, check:
1. Is there a `MAX_SIZE` or `MAX_*` constant?
2. Is there LRU eviction before `.set()`?
3. Is there periodic cleanup (TTL-based)?

```bash
# Check if file has MAX_SIZE protection
for f in [files_found]; do
  echo "--- $f ---"
  grep -n "MAX_\|\.delete\|cleanup" "$f" | head -10
done
```

#### Fix Pattern

```typescript
// TIME BOMB PREVENTION: Map size limit (Category 1: Unbounded Caches)
const MAX_CACHE_SIZE = 1000;

function setCachedData(key: string, data: any): void {
  // TIME BOMB PREVENTION: LRU eviction if at capacity (Category 1)
  if (cache.size >= MAX_CACHE_SIZE && !cache.has(key)) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }

  cache.set(key, { data, timestamp: Date.now() });
}
```

---

### Category 2: Cleanup Schedulers

**Risk**: Cleanup never runs, caches grow unbounded
**Pattern**: Cleanup interval defined but never started

#### Detection

```bash
echo "=== Category 2: Cleanup Schedulers ==="

# Find cleanup intervals that might not be started
grep -rn "cleanupInterval\|cleanup.*Interval" --include="*.ts" --include="*.js" lib/ middleware/ app/ 2>/dev/null | grep -v node_modules

# Check for auto-start patterns
echo "--- Looking for auto-start ---"
grep -rn "startCleanup\|startPeriodicCleanup\|constructor.*cleanup" --include="*.ts" --include="*.js" lib/ middleware/ app/ 2>/dev/null | grep -v node_modules
```

#### Verification

For each cleanup scheduler, verify:
1. Is it auto-started (in constructor or on module load)?
2. Is there a `startCleanup()` function that's actually called?

#### Fix Pattern

```typescript
// Auto-start cleanup on module load
let cleanupStarted = false;
function startPeriodicCleanup() {
  if (cleanupStarted) return;
  cleanupStarted = true;

  const cleanupInterval = setInterval(() => {
    // cleanup logic
  }, 5 * 60 * 1000);

  cleanupInterval.unref();
}

// Auto-start
startPeriodicCleanup();
```

---

### Category 5: Timer .unref()

**Risk**: Process cannot exit gracefully, hangs on shutdown
**Pattern**: `setInterval()` or `setTimeout()` without `.unref()`

#### Detection

```bash
echo "=== Category 5: Timer .unref() ==="

# Find all setInterval calls
echo "--- All setInterval calls ---"
grep -rn "setInterval" --include="*.ts" --include="*.js" lib/ middleware/ app/ 2>/dev/null | grep -v node_modules | grep -v ".next"

# Find setInterval WITHOUT .unref()
echo "--- setInterval without .unref() ---"
for f in $(grep -rln "setInterval" --include="*.ts" --include="*.js" lib/ middleware/ app/ 2>/dev/null | grep -v node_modules); do
  if grep -q "setInterval" "$f" && ! grep -q "\.unref()" "$f"; then
    echo "  $f"
    grep -n "setInterval" "$f"
  fi
done
```

#### Verification

For each setInterval found:
1. Is `.unref()` called on the returned interval?
2. Is the interval stored and cleared on shutdown?

```bash
# Check context around setInterval
grep -B2 -A5 "setInterval" [file]
```

#### Fix Pattern

```typescript
// Start interval
this.cleanupInterval = setInterval(() => {
  // cleanup logic
}, 5 * 60 * 1000);

// TIME BOMB PREVENTION: .unref() prevents blocking process exit (Category 5)
this.cleanupInterval.unref();
```

---

### Category 3: Event Listeners (Advanced)

**Risk**: Memory leaks from accumulated listeners
**Pattern**: `.on()` without corresponding `.off()` or `removeListener()`

#### Detection

```bash
echo "=== Category 3: Event Listeners ==="

# Find event listener additions
grep -rn "\.on(\|\.addListener(\|\.addEventListener(" --include="*.ts" --include="*.js" lib/ middleware/ app/ 2>/dev/null | grep -v node_modules | head -30

# Check for corresponding removals
grep -rn "\.off(\|\.removeListener(\|\.removeEventListener(" --include="*.ts" --include="*.js" lib/ middleware/ app/ 2>/dev/null | grep -v node_modules | head -30
```

#### Verification

For each `.on()` in long-lived objects:
1. Is there a corresponding `.off()` or cleanup?
2. Is `setMaxListeners()` configured to prevent warnings?

---

### Category 4: Pending Promises (Advanced)

**Risk**: Promises never resolve, memory accumulates
**Pattern**: Promises stored in Maps without timeout/cleanup

#### Detection

```bash
echo "=== Category 4: Pending Promises ==="

# Find promise storage patterns
grep -rn "pendingRequests\|pendingPromises\|awaiting" --include="*.ts" --include="*.js" lib/ middleware/ app/ 2>/dev/null | grep -v node_modules

# Check for timeout patterns
grep -rn "setTimeout.*reject\|Promise.race\|AbortController" --include="*.ts" --include="*.js" lib/ middleware/ app/ 2>/dev/null | grep -v node_modules | head -20
```

#### Verification

For Maps storing promises:
1. Is there a timeout that rejects/removes stale entries?
2. Is there periodic cleanup of orphaned promises?

---

## Results Template

Save findings to: `cline_docs/reviews/quarterly-review-YYYY-MM-DD/time-bomb-audit.md`

```markdown
# Time Bomb Detection Audit Results

**Date**: [date]
**Auditor**: [name/agent]
**Scope**: lib/, middleware/, app/

## Summary

| Category | Files Checked | Issues Found | Status |
|----------|---------------|--------------|--------|
| 1. Unbounded Caches | [count] | [count] | [PASS/FAIL] |
| 2. Cleanup Schedulers | [count] | [count] | [PASS/FAIL] |
| 3. Event Listeners | [count] | [count] | [PASS/FAIL] |
| 4. Pending Promises | [count] | [count] | [PASS/FAIL] |
| 5. Timer .unref() | [count] | [count] | [PASS/FAIL] |

**Overall Status**: [PASS - 0 issues / NEEDS FIXES - X issues]

## Issues Found

### Category 1: Unbounded Caches
| File | Map/Set | Fix Required |
|------|---------|--------------|
| [path] | [name] | Add MAX_SIZE + LRU eviction |

### Category 5: Timer .unref()
| File | Timer | Fix Required |
|------|-------|--------------|
| [path] | [name] | Add .unref() |

## Fixes Applied

- [ ] [file]: Added MAX_SIZE ([value]), LRU eviction
- [ ] [file]: Added .unref() to [interval name]

## Verification

```bash
# Re-run quick scan after fixes
# Expected: 0 files in each category
```
```

---

## Fix Time Estimates

| Issue Type | Time per Fix | Batch Efficiency |
|------------|--------------|------------------|
| Add MAX_SIZE + LRU | 5-10 min | 3-5 min after first |
| Add .unref() | 2-3 min | 1-2 min after first |
| Add periodic cleanup | 10-15 min | 5-10 min after first |
| Event listener cleanup | 15-20 min | Varies |

**Typical audit**: 30 min discovery + 1-2 hours fixes

---

## Related Resources

- **Pattern Reference**: `/.claude/knowledge/patterns/time-bomb-detection-pattern.md`
- **Quarterly Protocol**: `/.claude/knowledge/protocols/quarterly-review-protocol.md`
- **Memory Leak Prevention**: ~~`lib/events/memory-leak-prevention.ts`~~ DELETED 2026-06-14 (c5dab442 — orphaned when its sole consumer `SecurityEventProcessor` was removed). For bounded-cache reference impls see `lib/auth/cache.ts` / `lib/auth/oauth/session-store.ts`.

---

## Historical Context

### Jan 2026 Audit Results

First comprehensive time bomb audit found and fixed:

| Category | Files Fixed | Examples |
|----------|-------------|----------|
| Unbounded Caches | 8 files | dashboardCache, notificationCache, rateLimitMap |
| Timer .unref() | 11 files | cleanupInterval, heartbeatInterval, pollInterval |

**Key Files Fixed**:
- `middleware/request-throttle.ts` - MAX_SIZE + .unref()
- `lib/notifications/handlers/get.ts` - 3 Maps bounded + .unref()
- `lib/dashboard/handlers/get.ts` - 2 Maps bounded + .unref()
- `lib/services/agentExecutionEngine.ts` - .unref()
- `lib/auth/oauth/mcp-oauth-token-manager.ts` - 3 Maps bounded + .unref() (was .js until Phase 2 proper / Bug Class 73 eradication, Apr 8 2026)
- `lib/middleware/rate-limit.ts` - MAX_SIZE + .unref()
- `lib/mcp/server/streaming/execution-streaming.js` - 2 Maps bounded + .unref()

**Pattern Established**: All new Maps/Sets and setIntervals must follow the time bomb prevention patterns.

---

## Success Criteria

**Audit Complete When**:
- [ ] All 5 categories scanned
- [ ] All issues documented
- [ ] Fixes applied and verified
- [ ] Quick scan shows 0 issues
- [ ] Build passes
- [ ] Results saved to review directory

**Clean Codebase When**:
- All module-level Maps have MAX_SIZE limits
- All module-level Maps have LRU eviction
- All setIntervals have .unref()
- All cleanup schedulers auto-start
- No unbounded event listeners in long-lived objects
