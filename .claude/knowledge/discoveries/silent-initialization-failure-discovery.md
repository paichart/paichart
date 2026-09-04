# Silent Initialization Failure Discovery

**Purpose**: Detect modules that may fail silently during startup due to constructor initialization anti-patterns
**Time**: 30-45 minutes
**Created**: November 26, 2025
**Based On**: SCRAM Authentication Bug (event-system - Nov 2025)

---

## Problem Pattern

**Symptoms**:
- Services appear to start but don't actually connect
- Misleading error messages (e.g., "SCRAM auth error" when DATABASE_URL is undefined)
- `isConnected: false` but no visible errors
- Features silently degrade without alerting

**Root Cause**:
1. Constructor initiates async operations (connections, API calls)
2. Environment variables aren't loaded during module load
3. Error messages don't indicate the real problem (undefined vars → type errors)
4. No explicit initialization step for callers to await

**Example (Bad)**:
```javascript
class EventSystem {
  constructor() {
    this.initializeConnection(); // ❌ Runs at module load
  }
}
```

**Example (Good)**:
```javascript
class EventSystem {
  constructor() {
    this.logger.info('Created (lazy initialization)'); // ✅ No connection
  }

  async connect() { // ✅ Explicit initialization
    await this.initializeConnection();
  }
}
```

---

## Discovery Commands

### Step 1: Find Constructor Initialization (10 min)

```bash
# Async calls in constructors (most dangerous)
echo "=== Constructors with async initialization ==="
grep -rn "constructor.*{" lib/ --include="*.ts" -A 20 | \
  grep -E "this\.(initialize|connect|start|setup|init)" | \
  grep -v "// " | head -30

# Self-invoking async in constructors
echo "=== Self-invoking async in constructors ==="
grep -rn "constructor" lib/ --include="*.ts" -A 15 | \
  grep -E "\(async\s*\(\)\s*=>" | head -20

# Environment variable access in constructors
echo "=== process.env in constructors ==="
grep -rn "constructor" lib/ --include="*.ts" -A 20 | \
  grep "process\.env" | head -20
```

### Step 2: Find Module-Level Initialization (10 min)

```bash
# Top-level await or immediate connections
echo "=== Module-level pg.Client creation ==="
grep -rn "new Client\|new Pool" lib/ --include="*.ts" | \
  grep -v "async\|function\|=>" | head -20

# Singleton initialization at module load
echo "=== Singleton initialization patterns ==="
grep -rn "= new.*\(\)" lib/ --include="*.ts" | \
  grep -v "constructor\|function\|async" | head -20

# Import-time side effects
echo "=== Import-time function calls ==="
grep -rn "^\s*[a-zA-Z]*\(\)" lib/ --include="*.ts" | \
  grep -v "export\|function\|=>\|import\|require" | head -20
```

### Step 3: Find Missing Lazy Initialization (10 min)

```bash
# Classes with isConnected but no connect() method
echo "=== isConnected without connect() method ==="
for file in $(grep -rl "isConnected" lib/ --include="*.ts"); do
  has_connect=$(grep -c "async connect\|connect()" "$file")
  has_flag=$(grep -c "isConnected" "$file")
  if [ $has_flag -gt 0 ] && [ $has_connect -eq 0 ]; then
    echo "⚠️ $file - has isConnected but no connect() method"
  fi
done

# EventEmitters without explicit initialization
echo "=== EventEmitters that may auto-initialize ==="
grep -rn "extends EventEmitter" lib/ --include="*.ts" -l | while read file; do
  has_constructor_init=$(grep -c "constructor.*this\.init\|constructor.*this\.connect\|constructor.*this\.start" "$file")
  if [ $has_constructor_init -gt 0 ]; then
    echo "⚠️ $file - EventEmitter with constructor initialization"
  fi
done
```

### Step 4: Find Misleading Error Patterns (5 min)

```bash
# SCRAM/password errors that might hide undefined vars
echo "=== Potential misleading auth errors ==="
grep -rn "password\|SCRAM\|authentication" lib/ --include="*.ts" | \
  grep -v "// \|test\|spec" | head -20

# Connection errors without undefined checks
echo "=== Connection code without env validation ==="
grep -rn "connectionString\|DATABASE_URL" lib/ --include="*.ts" -B 2 -A 2 | \
  grep -v "if.*undefined\|if.*!\|throw.*not set" | head -30
```

### Step 5: Find Event Listener Timing Issues (5 min)

```bash
# Event registration AFTER async operations (race condition)
echo "=== Potential event listener race conditions ==="
grep -rn "\.on\('connected" lib/ --include="*.ts" -B 5 | \
  grep -E "await|register|initialize" | head -20

# Missing fallback connection checks
echo "=== Missing fallback isConnected checks ==="
grep -rn "\.on\('connected" lib/ --include="*.ts" -A 5 | \
  grep -v "isConnected\|stats\|getConnection" | head -20
```

---

## High-Risk File Patterns

**Priority 1 - Event Systems** (PostgreSQL NOTIFY/LISTEN):
- `lib/events/*.ts` - All event emitters
- `lib/websocket/*.ts` - WebSocket handlers

**Priority 2 - External Service Clients**:
- `lib/services/*client*.ts` - API clients
- `lib/integrations/*.ts` - Third-party integrations
- `lib/mcp/*.ts` - MCP server connections

**Priority 3 - Database Connections**:
- Files with `new Client()` or `new Pool()`
- Files with `prisma.$connect()`

---

## Fix Patterns

### Pattern A: Lazy Initialization (Recommended)

```typescript
class MyService {
  private isConnected = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // ✅ No initialization in constructor
    this.logger.info('Created (lazy initialization)');
  }

  async connect(): Promise<boolean> {
    if (this.isConnected) return true;

    if (this.initPromise) {
      await this.initPromise;
      return this.isConnected;
    }

    this.initPromise = this.doInitialize();
    await this.initPromise;
    return this.isConnected;
  }

  private async doInitialize(): Promise<void> {
    // Actual connection logic here
  }
}
```

### Pattern B: Prisma-First Verification

```typescript
async initializeConnection() {
  // Verify env vars are loaded by connecting Prisma first
  await prisma.$connect();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL not set after Prisma connect');
  }

  // Now safe to create pg.Client
  this.client = new Client({ connectionString: dbUrl });
}
```

### Pattern C: Event Listener Timing Fix

```typescript
async initializeWithPool() {
  this.pool = getSharedConnectionPool();

  // ✅ Set up listeners BEFORE registering
  this.pool.on('connected', () => {
    this.isConnected = true;
  });

  await this.pool.registerEventSystem(...);

  // ✅ Fallback check (race condition protection)
  const stats = this.pool.getConnectionStats();
  if (stats.isConnected && !this.isConnected) {
    this.isConnected = true;
  }
}
```

---

## Automated Detection Script

Save as `scripts/audit-initialization-patterns.sh`:

```bash
#!/bin/bash
# Audit for silent initialization failure patterns

echo "╔═══════════════════════════════════════╗"
echo "║ SILENT INITIALIZATION FAILURE AUDIT   ║"
echo "╚═══════════════════════════════════════╝"
echo ""

ISSUES=0

echo "=== 1. Constructor Async Initialization ==="
CONSTRUCTOR_ASYNC=$(grep -rn "constructor.*{" lib/ --include="*.ts" -A 20 | \
  grep -E "this\.(initialize|connect|start|setup|init)\(" | wc -l)
echo "Found: $CONSTRUCTOR_ASYNC potential issues"
if [ $CONSTRUCTOR_ASYNC -gt 0 ]; then
  grep -rn "constructor.*{" lib/ --include="*.ts" -A 20 | \
    grep -E "this\.(initialize|connect|start|setup|init)\(" | head -10
  ISSUES=$((ISSUES + CONSTRUCTOR_ASYNC))
fi
echo ""

echo "=== 2. Module-Level Client Creation ==="
MODULE_CLIENTS=$(grep -rn "^const.*= new Client\|^let.*= new Client\|^const.*= new Pool" lib/ --include="*.ts" | wc -l)
echo "Found: $MODULE_CLIENTS potential issues"
if [ $MODULE_CLIENTS -gt 0 ]; then
  grep -rn "^const.*= new Client\|^let.*= new Client\|^const.*= new Pool" lib/ --include="*.ts"
  ISSUES=$((ISSUES + MODULE_CLIENTS))
fi
echo ""

echo "=== 3. process.env in Constructors ==="
ENV_CONSTRUCTOR=$(grep -rn "constructor" lib/ --include="*.ts" -A 20 | \
  grep "process\.env\." | wc -l)
echo "Found: $ENV_CONSTRUCTOR potential issues"
if [ $ENV_CONSTRUCTOR -gt 0 ]; then
  grep -rn "constructor" lib/ --include="*.ts" -A 20 | grep "process\.env\." | head -10
  ISSUES=$((ISSUES + ENV_CONSTRUCTOR))
fi
echo ""

echo "=== 4. Missing Lazy Initialization ==="
for file in $(grep -rl "isConnected\s*=" lib/ --include="*.ts" 2>/dev/null); do
  has_connect=$(grep -cE "async connect\(\)|public connect\(\)" "$file" 2>/dev/null || echo 0)
  if [ "$has_connect" = "0" ]; then
    echo "⚠️ $file - has isConnected but no connect() method"
    ISSUES=$((ISSUES + 1))
  fi
done
echo ""

echo "╔═══════════════════════════════════════╗"
echo "║ AUDIT COMPLETE                        ║"
echo "╚═══════════════════════════════════════╝"
echo "Total potential issues: $ISSUES"
if [ $ISSUES -eq 0 ]; then
  echo "✅ No silent initialization patterns detected"
else
  echo "⚠️ Review above files for lazy initialization"
fi
```

---

## Integration with Quarterly Review

Add to Phase 1 discoveries:

**Discovery #7: Silent Initialization Patterns** (15 min)
```bash
# Run automated audit
./scripts/audit-initialization-patterns.sh

# Expected output:
# - Constructor async: 0 ✅
# - Module-level clients: 0 ✅
# - process.env in constructors: 0 ✅
# - Missing lazy init: 0 ✅
```

---

## Success Criteria

- [ ] No constructor async initialization in lib/events/
- [ ] No module-level Client/Pool creation
- [ ] All isConnected classes have connect() method
- [ ] Event listeners registered BEFORE async operations
- [ ] Fallback connection checks after pool registration

---

## Related Documentation

- `event-system-specialist.md` - Troubleshooting Guide section
- `shared-connection-pool.ts` - Reference implementation
- `prompt-registry-events.ts` - Reference implementation
- `execution-events.ts` - Reference implementation
