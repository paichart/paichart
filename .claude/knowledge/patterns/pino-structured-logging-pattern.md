# Pino Structured Logging Pattern

**Confidence**: 96% ✅
**Validated**: February 2026 — 348+ files migrated (310 TS + 38 JS), zero regressions
**Discovery**: Full codebase migration from `console.*` to pino (two-layer architecture: TypeScript + MCP JS servers)

---

## Problem

`console.*` calls produce unstructured text that cannot be filtered, aggregated, or auto-redacted. In production with PM2, JSON-structured logs are essential for monitoring, alerting, and compliance. For MCP servers using stdio transport, `console.log` on stdout corrupts the JSON-RPC protocol.

## Solution

Use pino with domain-based child loggers, structured context objects, and automatic secret redaction. Two logger systems serve different parts of the codebase:

| Layer | Logger Module | Import Style | Files |
|-------|---------------|-------------|-------|
| TypeScript (Next.js) | `lib/logger.ts` | `import { authLogger } from '@/lib/logger'` | 310+ |
| JavaScript (MCP servers) | `lib/mcp/server/mcp-logger.js` | `require('../mcp-logger')` | 38+ |

## Results

- **348+ files** using pino structured logging
- **Auto-redaction** of passwords, tokens, API keys (zero credential leaks)
- **JSON output** filterable by level, domain, component, or any structured field
- **720+ error sites** using correct `{ err: error }` serialization
- **Zero regressions** after full migration
- **ESLint enforcement**: `no-console: "error"` on all server-side TS and MCP JS files

---

## When to Use This Pattern

- **Every server-side file**: API routes, services, handlers, middleware, event processors
- **MCP server JS files**: All files in `lib/mcp/server/**/*.js`
- **New files**: Import the appropriate domain logger or create a child logger
- **Error handling**: All catch blocks should log with `{ err: error }`

## When NOT to Use This Pattern

- **Client-side React components**: Use `console.*` (runs in browser, not server)
- **CLI diagnostic scripts**: `node -e` one-liners use `console.log` (no pino available)
- **Docker MCP services**: Separate processes with their own logging (not Next.js)
- **Build scripts / seed scripts**: Short-lived processes where structured logging adds no value

---

## Layer 1: TypeScript Logger (`lib/logger.ts`)

### 1. Root Logger Configuration

**File**: `lib/logger.ts`

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: {
    paths: [
      'password', 'verificationToken', 'resetTokenHash',
      'accessToken', 'refreshToken', 'token', 'secret', 'apiKey',
      '*.password', '*.verificationToken', '*.token',
      'req.headers.authorization', 'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;
export const authLogger = logger.child({ domain: 'auth' });
export const mcpLogger = logger.child({ domain: 'mcp' });
export const povLogger = logger.child({ domain: 'pov' });
export const taskLogger = logger.child({ domain: 'task' });
export const apiLogger = logger.child({ domain: 'api' });
export const dbLogger = logger.child({ domain: 'db' });
export const complianceLogger = logger.child({ domain: 'compliance' });
export const monitorLogger = logger.child({ domain: 'monitor' });
```

### 2. Two Child Logger Strategies

#### Strategy A: Domain Loggers (cross-cutting concerns)

Use pre-exported domain loggers for code that belongs to a well-defined domain:

```typescript
import { authLogger } from '@/lib/logger';

// Auth domain -- login, logout, OAuth, permissions, JWT
authLogger.info({ userId, provider }, 'OAuth login successful');

import { mcpLogger } from '@/lib/logger';

// MCP domain -- tools, resources, servers, protocols
mcpLogger.warn({ toolId, action }, 'Tool execution failed');

import { povLogger } from '@/lib/logger';

// POV domain -- POV CRUD, phases, stages, team
povLogger.info({ povId, phaseCount }, 'POV created');

import { taskLogger } from '@/lib/logger';

// Task domain -- tasks, activities, dependencies, bulk ops
taskLogger.error({ err, taskId }, 'Task update failed');
```

**When to add a new domain logger**: When 10+ files share a domain that doesn't fit existing loggers. Add to `lib/logger.ts` and export.

#### Strategy B: Module Loggers (file-specific context)

Create a local child logger for files that need their own identity:

```typescript
import logger from '@/lib/logger';

const localLogger = logger.child({ module: 'NotificationDelivery' });

localLogger.info({ userId, channel }, 'Notification sent');
localLogger.error({ err, notificationId }, 'Delivery failed');
```

**When to use module loggers**:
- Utility files (`dateFormat`, `ensure-object`, `template-schema-validator`)
- Service files within a domain (`AdminSettingsService`, `DashboardService`)
- Handler files (`NotificationReadHandler`, `SettingsGetHandler`)
- Files that don't fit any domain logger cleanly

### 3. Core API: Object First, Message Second

This is the most important convention. pino's API differs from `console.*`:

```typescript
// CORRECT -- structured context object FIRST, message string SECOND
authLogger.info({ userId, role, ip }, 'User authenticated');
taskLogger.warn({ taskId, field: 'status', from: old, to: next }, 'Status transition');
mcpLogger.error({ err, toolId, action }, 'Tool execution failed');

// WRONG -- message first (this is the console.* habit)
authLogger.info('User authenticated', { userId }); // message becomes first arg of object
```

### 4. Importing the Logger

```typescript
// For domain-specific code -- use named exports
import { authLogger } from '@/lib/logger';   // auth, OAuth, JWT, permissions
import { mcpLogger } from '@/lib/logger';    // MCP tools, resources, servers
import { povLogger } from '@/lib/logger';    // POV, phases, stages, team
import { taskLogger } from '@/lib/logger';   // tasks, activities, dependencies
import { apiLogger } from '@/lib/logger';    // API routes, validation, responses
import { dbLogger } from '@/lib/logger';     // database, Prisma, connections
import { complianceLogger } from '@/lib/logger'; // retention, cleanup, audit
import { monitorLogger } from '@/lib/logger';    // health checks, monitoring

// For creating module loggers -- use default export
import logger from '@/lib/logger';
const localLogger = logger.child({ module: 'MyModule' });

// For files that need both
import logger, { authLogger } from '@/lib/logger';
```

---

## Layer 2: MCP Server JS Logger (`lib/mcp/server/mcp-logger.js`)

### Critical Constraint: stderr Only

MCP servers using stdio transport reserve stdout for JSON-RPC protocol messages. **All logging in `lib/mcp/server/` MUST use `stderr` loggers.** Using stdout loggers would corrupt the protocol stream.

### 1. Logger Infrastructure

**File**: `lib/mcp/server/mcp-logger.js`

Provides two sets of domain loggers (stdout for HTTP servers, stderr for stdio servers) and a `createAdapter()` bridge function:

```javascript
const { stderr, createAdapter } = require('../mcp-logger');
// stderr.mcpLogger, stderr.authLogger, stderr.dbLogger, stderr.apiLogger, stderr.monitorLogger
```

### 2. createAdapter() — The Bridge Function

`createAdapter()` wraps a pino child logger to support **both** calling conventions:

```javascript
const log = createAdapter(stderr.mcpLogger.child({ component: 'my-component' }));

// Pino-native style (object first, message second) -- PREFERRED
log.info({ userId, toolName }, 'Tool executed');
log.error({ err: error, serviceId }, 'Connection failed');

// Console-style (message first, data second) -- also works
log.info('Tool executed', { userId, toolName });
log.error('Connection failed:', error.message);
```

Both styles produce identical structured JSON output. The adapter auto-detects which convention is used based on the type of the first argument.

### 3. Two Migration Patterns

#### Pattern A: Facade Replacement (files with createLogger())

For files that already have a `createLogger()` method returning `{ info, warn, error, debug }`:

```javascript
// BEFORE:
const { SERVER_CONFIG } = require('../config/server-config');
createLogger() {
  const prefix = SERVER_CONFIG.logging.prefix;
  return { info: (msg, ...args) => console.error(`${prefix} [Auth] ${msg}`, ...args), ... };
}

// AFTER:
const { stderr, createAdapter } = require('../mcp-logger');
createLogger() {
  return createAdapter(stderr.authLogger.child({ component: 'auth-manager' }));
}
```

Zero call-site changes needed -- `this.logger.info(...)` etc. continue to work.

#### Pattern B: Direct Call Replacement (files with console.* calls)

For files with direct `console.log/error/warn` calls:

```javascript
// BEFORE:
console.error('[Hub] Service registered:', serviceName);
console.log(`[Security] Access denied for ${userId}`);

// AFTER:
const { stderr, createAdapter } = require('../mcp-logger');
const log = createAdapter(stderr.mcpLogger.child({ component: 'hub-registration' }));

log.info({ serviceName }, 'Service registered');
log.warn({ securityEvent: true, userId }, 'Access denied');
```

### 4. Import Paths (by directory depth)

| Directory | Import Path |
|-----------|-------------|
| `lib/mcp/server/*.js` | `./mcp-logger` |
| `lib/mcp/server/{auth,config,monitoring,...}/` | `../mcp-logger` |
| `lib/mcp/server/tools/` | `../mcp-logger` |
| `lib/mcp/server/tools/{hub,internal}/` | `../../mcp-logger` |

### 5. Component Naming Convention

Each file gets a `component` field via `.child({ component: 'name' })`. Use kebab-case matching the file's purpose:

```javascript
// auth/auth-manager.js      -> component: 'auth-manager'
// tools/hub/service-call-handler.js -> component: 'hub-service-call'
// monitoring/performance-monitor.js -> component: 'performance-monitor'
```

### 6. Security Event Tagging

Security-sensitive log calls include `{ securityEvent: true }` for compliance filtering:

```javascript
log.warn({ securityEvent: true, userId, serviceName, violations }, 'Service call blocked by policy');
log.info({ securityEvent: true, role: 'ADMIN' }, 'Admin-only prompt accessed');
```

---

## Common Conventions (Both Layers)

### Error Serialization: Always `{ err: error }`

pino has a built-in error serializer that extracts `message`, `stack`, and `type` -- but only when the key is `err`:

```javascript
try {
  await riskyOperation();
} catch (error) {
  // CORRECT -- pino serializes the full error
  log.error({ err: error, taskId }, 'Operation failed');

  // WRONG -- pino won't serialize the error properly
  log.error({ error, taskId }, 'Operation failed');
  log.error({ e: error }, 'Operation failed');
}
```

### Log Levels

| Level | Value | When to Use |
|-------|-------|-------------|
| `trace` | 10 | Fine-grained debugging (loop iterations, variable values) |
| `debug` | 20 | Development diagnostics (function entry/exit, intermediate state) |
| `info` | 30 | Normal operations (requests, completions, state changes) |
| `warn` | 40 | Recoverable issues (validation failures, deprecations, retries, auth rejections, not-found, expected client errors) |
| `error` | 50 | Failures requiring attention (unhandled errors, broken integrations, unexpected server failures) |
| `fatal` | 60 | Process-ending failures (startup failures, unrecoverable state) |

**Production default**: `info` (levels 30+). Set `LOG_LEVEL=debug` for troubleshooting. Pino handles level gating natively -- no manual `if (debug)` checks needed.

---

## Production Monitoring

### Filter by log level

```bash
# Errors only (level 50)
pm2 logs paichart --lines 100 | grep '"level":50'

# Warnings and above (level 40+)
pm2 logs paichart --lines 200 | grep -E '"level":(40|50|60)'
```

### Filter by domain

```bash
# Auth domain only
pm2 logs paichart --lines 100 | grep '"domain":"auth"'

# MCP domain errors
pm2 logs paichart --lines 100 | grep '"domain":"mcp"' | grep '"level":50'
```

### Filter by component (MCP JS servers)

```bash
# Specific MCP component
pm2 logs paichart --lines 100 | grep '"component":"hub-service-call"'

# Security events only
pm2 logs paichart --lines 100 | grep '"securityEvent":true'
```

### Filter by module (TS)

```bash
# Specific module
pm2 logs paichart --lines 100 | grep '"module":"WorkflowEngine"'
```

### Pretty-print with jq

```bash
pm2 logs paichart --lines 10 --nostream | jq '.'
pm2 logs paichart --lines 50 --nostream | jq 'select(.level >= 40) | {time, level, domain, msg}'
```

---

## Anti-Patterns

### 1. Using `console.*` on the server

```typescript
// WRONG -- unstructured, no redaction, no filtering
console.log('User logged in:', userId);
console.error('Error:', error.message);

// CORRECT (TS)
authLogger.info({ userId }, 'User logged in');

// CORRECT (MCP JS)
log.info({ userId }, 'User logged in');
```

### 2. Message-only logging (no context)

```typescript
// WRONG -- no structured data to filter or aggregate
authLogger.info('Something happened');

// CORRECT -- always include relevant context
authLogger.info({ userId, action: 'login' }, 'Authentication successful');
```

### 3. Wrong error key

```typescript
// WRONG -- pino won't serialize the error
logger.error({ error: someError }, 'Failed');

// CORRECT -- must use 'err' key
logger.error({ err: someError }, 'Failed');
```

### 4. Logging secrets manually

```typescript
// WRONG -- bypasses redaction
authLogger.info({ userToken: token }, 'Token issued');

// CORRECT -- use redacted field names (token, password, apiKey, etc.)
authLogger.info({ token }, 'Token issued'); // auto-redacted to [REDACTED]
```

### 5. Manual debug gating (MCP JS)

```javascript
// WRONG -- pino handles level gating natively
if (featureFlags.isEnabled('verboseLogging')) {
  console.error('debug info:', data);
}

// CORRECT -- just use log.debug(), pino filters by LOG_LEVEL
log.debug({ data }, 'Debug info');
```

### 6. Using stdout in stdio MCP servers

```javascript
// WRONG -- corrupts JSON-RPC protocol on stdout
const log = createAdapter(stdout.mcpLogger.child({ component: 'my-tool' }));

// CORRECT -- always use stderr in lib/mcp/server/
const log = createAdapter(stderr.mcpLogger.child({ component: 'my-tool' }));
```

### 7. Logging expected client conditions at error level

```javascript
// WRONG -- input validation, auth rejection, not-found are not server errors
log.error({ err: error }, 'Resource not found');
log.error({ userId }, 'Invalid API key format');
log.error({ violations }, 'Validation failed');

// CORRECT -- expected client conditions use warn (level 40)
log.warn({ uri }, 'Resource not found');
log.warn({ userId }, 'Invalid API key format');
log.warn({ violations }, 'Validation failed');

// Reserve error (level 50) for unexpected server failures
log.error({ err: error, serviceId }, 'Database connection lost');
```

**Rule of thumb**: If the condition is caused by client input (bad auth, missing resource, invalid params), use `warn`. If the condition is caused by server failure (DB down, unhandled exception, broken integration), use `error`.

**Regression detection**: `grep -rn 'log\.error' lib/mcp/server/ --include="*.js" | grep -iE 'not.found|invalid|validation|parse|format'`

---

## Domain Logger Coverage

### TypeScript (`lib/logger.ts`)

| Domain Logger | Key | Files Using |
|---------------|-----|-------------|
| `authLogger` | `domain: 'auth'` | Auth, OAuth, JWT, permissions |
| `mcpLogger` | `domain: 'mcp'` | MCP tools, resources, servers |
| `povLogger` | `domain: 'pov'` | POV, phases, stages, team |
| `taskLogger` | `domain: 'task'` | Tasks, activities, dependencies |
| `apiLogger` | `domain: 'api'` | API routes, validation, responses |
| `dbLogger` | `domain: 'db'` | Database, Prisma, connections |
| `complianceLogger` | `domain: 'compliance'` | Retention, cleanup, audit |
| `monitorLogger` | `domain: 'monitor'` | Health checks, monitoring |
| LLM logger | `domain: 'llm'` | 3 LLM provider files (local, not exported) |
| Module loggers | `module: 'Name'` | 40+ files (local, per-file) |

### JavaScript (`lib/mcp/server/mcp-logger.js`)

| Domain Logger | stderr Reference | Components Using |
|---------------|-----------------|------------------|
| `mcpLogger` | `stderr.mcpLogger` | Most MCP tools, utils, config, prompts (30+ files) |
| `authLogger` | `stderr.authLogger` | auth-manager |
| `monitorLogger` | `stderr.monitorLogger` | performance-monitor |
| `apiLogger` | `stderr.apiLogger` | (available, not yet used) |
| `dbLogger` | `stderr.dbLogger` | (available, not yet used) |

All domain loggers exist in both stdout and stderr variants. Use `stderr.*` in `lib/mcp/server/`.

---

## Enforcement & Validation

```bash
# Full validation suite (Layers 1-3)
npm run validate:logging

# Expected output:
# ✅ Layer 1: No console.* violations (TS) — 504 files scanned
# ✅ Layer 2: All adoption thresholds met (app/api >= 75%, lib >= 40%)
# ✅ Layer 3a: No console.* violations (MCP servers) — 70 files enforced
# ✅ Pino logging validation PASSED

# ESLint enforcement (catches violations at dev time)
npm run lint
# no-console: "error" for:
#   - lib/**/*.ts, app/api/**/*.ts, server.ts, middleware.ts
#   - mcp-server-v5.js, mcp-server-http-clean.js
#     (mcp-server-http.js and mcp-embedded-bridge.js were deleted Apr 8 2026 in
#      Phase 2.P0 steps 2-3 as dead code — Bug Class 73 eradication)
#   - lib/mcp/server/**/*.js

# Quick grep checks
grep -r "console\." --include="*.ts" lib/ app/api/ middleware/ server.ts | \
  grep -v node_modules | grep -v ".d.ts" | grep -v "// console"

grep -r "from '@/lib/logger'" --include="*.ts" lib/ app/ middleware/ | wc -l
# Expected: 300+
```

---

## Related Patterns

- **global-prisma-singleton-pattern.md**: Uses `{ err }` logging in connection lifecycle
- **fire-and-forget-activity-logging-pattern.md**: Non-blocking writes with `taskLogger.error` in catch
- **cross-domain-security-patterns.md**: Security event logging with structured context
- **handler-level-authorization-pattern.md**: Authorization decision logging

## Not covered here: log RETENTION and rotation

This pattern governs how log lines are *produced* — logger construction, structured context,
levels, `console.*` enforcement. It says nothing about how the resulting files are rotated,
compressed or aged out, which is OS-level config, not application code. That lives in
`infra/logrotate/README.md`.

Worth knowing that the two are not independent. The "Production Monitoring" grep/jq recipes
above can only reach back as far as retention allows, and rotation policy is where a log's
usable history is actually decided — 2026-08-06 found six monitor logs that had never rotated
since 2025-09-27 (one at 108M), and an OAuth **audit** log being kept 14 days instead of its
intended 30 because a duplicate logrotate entry silently voided its config. Neither is
visible from this layer.
