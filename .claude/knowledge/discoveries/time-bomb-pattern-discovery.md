# Time Bomb Pattern Discovery

**Purpose**: Systematically identify latent code issues that will cause problems over time
**Trigger**: Monthly proactive review, after major features, before releases
**Time**: 30-60 minutes
**Severity**: These bugs often cause production incidents weeks/months after deployment

## What Are Time Bomb Patterns?

Code that:
- Works correctly initially
- Degrades over time (memory, performance, data)
- Eventually fails catastrophically
- Often discovered only in production under load

## Discovery Categories

### Category 1: Orphaned Cleanup Methods
**Pattern**: Cleanup/maintenance methods that exist but are never called

```bash
# Find cleanup-related methods
grep -rn "clean\|cleanup\|purge\|prune\|expire\|remove.*expired\|delete.*old\|clear.*stale" \
  --include="*.js" --include="*.ts" \
  lib/ | grep -E "function|const.*=.*\(|\..*=.*function" | head -30

# Cross-reference: Are they called anywhere?
# For each method found, search for invocations:
grep -rn "methodName(" --include="*.js" --include="*.ts" lib/ app/
```

**Red flags**:
- Method defined but only 1 result (definition only, no calls)
- `// TODO: wire up cleanup` comments
- Cleanup in test files but not production

### Category 2: Unbounded In-Memory Collections
**Pattern**: Maps, Sets, Arrays that grow without limits or TTL

```bash
# Find in-memory storage declarations
grep -rn "new Map()\|new Set()\|= \[\]\|= {}" \
  --include="*.js" --include="*.ts" \
  lib/ | grep -v "node_modules\|test\|spec" | head -30

# Check if they have corresponding cleanup
# For each collection, search for:
grep -rn "\.delete(\|\.clear(\|\.splice(\|= \[\]\|= new Map" \
  --include="*.js" --include="*.ts" [file]
```

**Red flags**:
- `.set()` or `.push()` without corresponding `.delete()` or cleanup
- No TTL/expiration logic
- No size limits or LRU eviction
- Static class properties that accumulate state

### Category 3: Timers Without Cleanup
**Pattern**: setInterval/setTimeout without clearInterval/clearTimeout

```bash
# Find all timer creations
grep -rn "setInterval\|setTimeout" --include="*.js" --include="*.ts" \
  lib/ app/ | grep -v node_modules | head -20

# Find all timer cleanups
grep -rn "clearInterval\|clearTimeout" --include="*.js" --include="*.ts" \
  lib/ app/ | grep -v node_modules | head -20

# Compare counts - should be roughly equal
```

**Red flags**:
- More `setInterval` than `clearInterval`
- Timer ID not stored (can't be cleared)
- No cleanup on shutdown/close handlers

### Category 4: Event Listeners Never Removed
**Pattern**: `.on()` or `.addEventListener()` without cleanup

```bash
# Find event listener additions
grep -rn "\.on(\|\.addEventListener(\|\.addListener(" \
  --include="*.js" --include="*.ts" lib/ | head -20

# Find event listener removals
grep -rn "\.off(\|\.removeEventListener(\|\.removeListener(\|\.removeAllListeners(" \
  --include="*.js" --include="*.ts" lib/ | head -20
```

**Red flags**:
- Event listeners in loops or repeated calls
- No corresponding removal on destroy/unmount
- Process-level listeners (`process.on`) without cleanup

### Category 5: Connections/Resources Never Closed
**Pattern**: Opened handles without close logic

```bash
# Find resource acquisitions
grep -rn "createConnection\|connect(\|open(\|acquire(" \
  --include="*.js" --include="*.ts" lib/ | head -20

# Find resource releases
grep -rn "\.close(\|\.end(\|\.destroy(\|\.release(\|disconnect(" \
  --include="*.js" --include="*.ts" lib/ | head -20

# Check for finally blocks or try-with-resources patterns
grep -rn "finally\s*{" --include="*.js" --include="*.ts" lib/ | head -10
```

**Red flags**:
- Connections opened in functions without cleanup
- No `finally` blocks for resource cleanup
- Missing error path cleanup

### Category 6: Dead Code (Declared Never Used)
**Pattern**: Variables, functions, classes that exist but are never referenced

```bash
# Find exported functions/classes
grep -rn "^export\s\|module\.exports\." --include="*.js" --include="*.ts" \
  lib/ | head -30

# For each export, verify it's imported somewhere
grep -rn "import.*functionName\|require.*functionName" \
  --include="*.js" --include="*.ts" lib/ app/

# Find unused class properties
grep -rn "this\.\w\+\s*=" --include="*.js" --include="*.ts" [file] | \
  while read line; do
    prop=$(echo "$line" | grep -oP 'this\.\K\w+')
    count=$(grep -c "this\.$prop" [file])
    if [ "$count" -eq 1 ]; then
      echo "UNUSED: $line"
    fi
  done
```

**Red flags**:
- Properties assigned in constructor but never read
- Methods defined but never called
- Imports that are never used

### Category 7: Silent Error Swallowing
**Pattern**: Catch blocks that don't log or rethrow

```bash
# Find catch blocks
grep -rn "catch\s*(" --include="*.js" --include="*.ts" lib/ -A 3 | \
  grep -B1 "^\s*}\s*$" | head -20

# Find empty catch blocks (dangerous!)
grep -rn "catch.*{[\s]*}" --include="*.js" --include="*.ts" lib/
```

**Red flags**:
- `catch (e) { }` - completely silent
- `catch (e) { /* ignore */ }` - intentional but dangerous
- Catch without logging or metrics

### Category 8: Promises Without Rejection Handling
**Pattern**: Floating promises, missing `.catch()` or try/catch

```bash
# Find async functions
grep -rn "async\s\+function\|async\s*(" --include="*.js" --include="*.ts" \
  lib/ | head -20

# Find promise calls without await or .catch
grep -rn "\.then(\|Promise\." --include="*.js" --include="*.ts" lib/ | \
  grep -v "\.catch(\|await\|\.finally(" | head -20
```

**Red flags**:
- `someAsyncFunction()` without `await` (floating promise)
- `.then()` without `.catch()`
- `Promise.all()` without error handling

### Category 9: Stale TODO/FIXME Comments
**Pattern**: Intentions documented but never implemented

```bash
# Find TODO/FIXME with dates or old references
grep -rn "TODO\|FIXME\|HACK\|XXX\|BUG" --include="*.js" --include="*.ts" \
  lib/ app/ | head -30

# Check git blame for age
git log --oneline -1 -- [file-with-todo]
```

**Red flags**:
- TODOs older than 6 months
- "Temporary" code that's been there for years
- "Will fix later" comments

### Category 10: Retry Without Circuit Breaker
**Pattern**: Infinite retry loops that can cause cascading failures

```bash
# Find retry patterns
grep -rn "retry\|while.*true\|for.*;;.*" --include="*.js" --include="*.ts" \
  lib/ | head -20

# Check for circuit breaker usage
grep -rn "circuit\|breaker\|backoff\|maxRetries\|maxAttempts" \
  --include="*.js" --include="*.ts" lib/ | head -20
```

**Red flags**:
- Retry loops without max attempts
- No exponential backoff
- No circuit breaker for external services

---

## Quick Scan Script

Save as `scripts/time-bomb-scan.sh`:

```bash
#!/bin/bash
# Time Bomb Pattern Scanner

echo "=== TIME BOMB PATTERN SCAN ==="
echo ""

echo "1. Orphaned Cleanup Methods..."
cleanup_defs=$(grep -rn "clean\|purge\|expire" --include="*.js" lib/ 2>/dev/null | grep -c "function\|=.*=>")
echo "   Found $cleanup_defs cleanup-related definitions"

echo ""
echo "2. In-Memory Collections..."
maps=$(grep -rn "new Map()" --include="*.js" lib/ 2>/dev/null | grep -vc "test\|spec")
echo "   Found $maps Map declarations"

echo ""
echo "3. Timers..."
intervals=$(grep -rn "setInterval" --include="*.js" lib/ 2>/dev/null | wc -l)
clears=$(grep -rn "clearInterval" --include="*.js" lib/ 2>/dev/null | wc -l)
echo "   setInterval: $intervals, clearInterval: $clears"
if [ "$intervals" -gt "$clears" ]; then
  echo "   ⚠️  WARNING: More intervals than clears!"
fi

echo ""
echo "4. Event Listeners..."
ons=$(grep -rn "\.on(" --include="*.js" lib/ 2>/dev/null | wc -l)
offs=$(grep -rn "\.off(\|\.removeListener" --include="*.js" lib/ 2>/dev/null | wc -l)
echo "   .on(): $ons, .off()/.removeListener(): $offs"

echo ""
echo "5. TODO/FIXME Count..."
todos=$(grep -rn "TODO\|FIXME\|HACK\|XXX" --include="*.js" --include="*.ts" lib/ app/ 2>/dev/null | wc -l)
echo "   Found $todos TODO/FIXME comments"

echo ""
echo "=== SCAN COMPLETE ==="
```

---

## Remediation Patterns

### For Orphaned Cleanup Methods
```javascript
// Add to server startup or as scheduled task
class Server {
  start() {
    // Wire up cleanup on startup
    this.startCleanupScheduler();
  }

  startCleanupScheduler() {
    // Run immediately
    this.cleanup();
    // Then periodically
    setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
  }
}
```

### For Unbounded Collections
```javascript
// Option 1: TTL-based cleanup
const cache = new Map();
const TTL = 30 * 60 * 1000; // 30 min

function set(key, value) {
  cache.set(key, { value, expires: Date.now() + TTL });
}

function cleanup() {
  const now = Date.now();
  for (const [key, data] of cache) {
    if (data.expires < now) cache.delete(key);
  }
}

// Option 2: LRU with max size
const LRU = require('lru-cache');
const cache = new LRU({ max: 500, ttl: 1000 * 60 * 30 });
```

### For Timers
```javascript
class Service {
  constructor() {
    this.intervals = [];
  }

  start() {
    const id = setInterval(() => this.check(), 5000);
    this.intervals.push(id); // Track for cleanup
  }

  shutdown() {
    this.intervals.forEach(clearInterval);
    this.intervals = [];
  }
}
```

---

## Integration with CI/CD

Add to pre-commit or CI pipeline:

```yaml
# .github/workflows/time-bomb-check.yml
- name: Time Bomb Pattern Check
  run: |
    # Fail if new unbounded Maps without cleanup
    NEW_MAPS=$(git diff --name-only | xargs grep -l "new Map()" 2>/dev/null || true)
    for file in $NEW_MAPS; do
      if ! grep -q "\.delete\|cleanup\|clear" "$file"; then
        echo "⚠️ $file: New Map() without cleanup logic"
        exit 1
      fi
    done
```

---

## When to Run This Discovery

| Trigger | Depth |
|---------|-------|
| Monthly proactive review | Full scan |
| After major feature | Categories 1-4 |
| Before release | Full scan + remediation |
| After production incident | Targeted category |
| New team member onboarding | Educational run-through |

---

## Related Resources

- `/.claude/knowledge/patterns/PATTERN-REGISTRY.md` - Remediation patterns
- `/.claude/agents/performance-analyst-specialist` - For memory profiling
- `/.claude/agents/sec-ops-specialist` - For security-related time bombs
