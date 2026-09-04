# database-manager-specialist — Domain Library

> **Created 2026-06-11** (Protocol 12 soft-band trim). Depth evicted from the agent file; verbatim;
> the paired discovery's proven greps outrank this file.

## [evicted] My Discovery Prompts

**Primary Discovery** - Before database changes:
`/.claude/knowledge/discoveries/database-management-discovery.md`

This discovery will map the current database state, identify performance bottlenecks, and analyze all schema relationships and transaction patterns.

**Parallel Query Optimization Discovery** (Dec 17, 2025 - NEW):

Run this when:
- Conducting performance optimization sprints
- Analyzing files with 4+ sequential awaits
- Working with architectural-review-specialist on facade extractions
- Planning query parallelization (Promise.all patterns)

**Use with facade extraction** (complementary analysis):
- architectural-review: Identifies handler boundaries (what goes where)
- database-manager: Identifies query patterns (which queries can parallelize)
- Combined: Complete extraction + optimization plan

**Success**: December 17, 2025
- 9 files optimized (56+ queries parallelized)
- 40-50% faster on high-traffic endpoints
- Pattern: Independent queries → Promise.all()
- Zero test failures, zero rollbacks

**Output**: Query dependency map per handler showing parallelization opportunities for Phase 3 (after extraction complete)

### Memory Safety Audit (Dec 2, 2025 - NEW)
For comprehensive memory leak investigation:
`/.claude/knowledge/discoveries/memory-safety-audit-2025.md`

**When to Use**:
- Connection cleanup audits (Prisma clients, pg.Client connections)
- Query caching analysis (bounded caches, TTL policies)
- Per-request connection leak investigation
- Module-scoped client validation

**Focus Area**: Category 3 - Connection Cleanup (Database Domain)
**Output**: Prioritized list of connection leaks with file:line, risk assessment (P0/P1/P2), estimated fix effort
**Success**: Audit found non-singleton Prisma clients, unbounded query caches (Dec 2, 2025)

### Parallel Query Optimization Discovery (Dec 17, 2025 - NEW)

For parallel query optimization analysis:

**When to Use**:
- Performance optimization sprints
- Identifying sequential await patterns for parallelization
- Working with architectural-review-specialist on facade extractions
- Before or during handler extraction (provides optimization roadmap)

**Success**: December 17, 2025 sprint
- 9 files optimized, 56+ queries parallelized
- 40-50% performance improvement on high-traffic endpoints
- Pattern: Find independent queries, wrap in Promise.all()

**Grep Commands for Query Analysis**:
```bash
# Count sequential awaits per file (parallelization opportunities)
find app/api lib -name "*.ts" -exec sh -c 'echo "$(grep -c "await.*prisma\." {}): {}"' \; | sort -rn | head -20

# Find files with 4+ sequential awaits (optimization candidates)
for file in $(find app/api lib -name "*.ts"); do
  count=$(grep -c "await.*prisma\." "$file" 2>/dev/null || echo 0)
  if [ "$count" -gt 3 ]; then
    echo "$count: $file"
  fi
done | sort -rn

# Identify handler functions with queries (for facade extraction)
grep -n "^async function handle" [FILE] | while read line; do
  linenum=$(echo "$line" | cut -d: -f1)
  handler=$(echo "$line" | grep -o "handle\w*")
  queries=$(sed -n "${linenum},$((linenum+200))p" [FILE] | grep -c "await prisma\.")
  echo "$handler: ~$queries queries"
done

# Find independent query patterns (can be parallelized)
grep "await prisma\..*\.findUnique\|await prisma\..*\.findMany\|await prisma\..*\.count" [FILE] -n | head -20
```

**Output**: Query dependency map showing which queries can run in parallel per handler

### Quick Discovery Grep Commands

**Database Structure**:
```bash
# List all Prisma models and enums
grep "^model \|^enum " prisma/schema.prisma | head -50

# Check ID types (should all be cuid)
grep "@id @default" prisma/schema.prisma

# Find all Prisma client usage
grep -r "prisma\." lib/ --include="*.ts" | wc -l

# Check for validation schema coverage
ls lib/validation/*.ts | wc -l
```

**Performance Analysis** (Dec 17, 2025):
```bash
# Find top 20 files with sequential awaits
grep -r "await.*prisma\." app/api lib --include="*.ts" | cut -d: -f1 | sort | uniq -c | sort -rn | head -20

# Identify parallelization opportunities in a specific file
grep -n "await prisma\." [FILE] | head -30

# Count queries by handler (shows optimization potential)
grep "^async function handle" [FILE] -A 100 | grep -c "await prisma\."
```

**Phantom Canonical Audit (May 2026)**:
```bash
# When a "fullX" select in lib/<domain>/prisma/select.ts looks canonical,
# verify the service layer actually USES its .include / .select rather than
# hand-rolling a literal-object select that omits fields.
grep -rn "import.*\{.*\(full\|with\)\w*.*\}.*from.*prisma/select" lib/*/services/

# Optimization rollback markers — strong signal that a canonical was bypassed
grep -rn "// OLD CODE\|// commented for rollback\|N+1 OPTIMIZED\|optimized version" lib/*/services/ lib/services/

# When debugging "field missing from response" bugs, ALWAYS grep both layers:
#   (a) the schema select file
#   (b) the actual prisma.X.find* call in services/handlers
# Discrepancy = phantom canonical drift. Pattern:
# .claude/knowledge/patterns/two-execution-path-drift-pattern.md §Phantom Canonical Variant
# Canonical example: lib/pov/services/pov.ts stripped `dependencies` from the
# wire despite lib/pov/prisma/select.ts:fullPOV claiming to include them.
# Fixed in commit 8d256992.
```

### Operational Guides
**For schema changes involving geographical data (SalesTheatre, Country, Region):**
- See: `/.claude/knowledge/guides/GEOGRAPHICAL_DATA_MANAGEMENT.md`
- Topics: Enum vs database tables, schema migration procedures, seed script patterns
- Includes: Step-by-step examples, rollback procedures, validation queries


## [evicted] Pino Structured Logging for Database Operations (NEW - Feb 2026)

**Two logging systems relevant to database work**:

| System | Output | Use Case |
|--------|--------|----------|
| **pino `dbLogger`** (from `lib/logger.ts`) | PM2 JSON output with `"domain":"db"` | Query logging, connection events, migration status |
| **pino `apiLogger`** (from `lib/logger.ts`) | PM2 JSON output with `"domain":"api"` | API route database operations, slow query warnings |
| **Dev query logger** (`lib/database/dev-query-logger.ts`) | Console output (dev only) | Slow query detection (>100ms), N+1 detection |

### Domain Loggers for Database Work
```typescript
import { dbLogger, apiLogger } from '@/lib/logger';

// ✅ Correct pino API: context object FIRST, message SECOND
dbLogger.info({ table: 'Task', operation: 'findMany', count: 42 }, 'Tasks loaded');
dbLogger.warn({ queryTime: 150, table: 'AgentExecution', operation: 'findMany' }, 'Slow query detected');
dbLogger.error({ err: error, migration: 'add_index' }, 'Migration failed');  // Always { err: error }
apiLogger.info({ endpoint: '/api/pov', queryCount: 3 }, 'POV list with parallel queries');
```

### Production Database Log Monitoring
```bash
# Database domain logs — all recent entries
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"db\"' | jq"

# Database errors only (level 50)
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"db\"' | grep '\"level\":50' | jq"

# Database warnings (level 40) — slow queries, connection issues
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"db\"' | grep '\"level\":40' | jq"

# API domain logs — database-related API calls
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"api\"' | grep -i 'prisma\|query\|transaction' | jq"

# All errors across all domains (quick health check)
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 500 --nostream | grep '\"level\":50' | jq -r '[.time, .domain, .msg] | @tsv'"
```

### Pattern Reference
`/.claude/knowledge/patterns/pino-structured-logging-pattern.md` (Pattern #43, 96% confidence)


## [evicted] Core Knowledge and Expertise

### NEW: Event-Driven Database Patterns (Plan 6)
- **90% Load Reduction**: PostgreSQL NOTIFY/LISTEN replacing polling patterns
- **Shared Connection Pool**: `/lib/events/shared-connection-pool.ts` managing unified connections
- **Event Tables**: Database triggers for automatic event broadcasting
- **Key Patterns**:
  - NOTIFY/LISTEN for real-time updates
  - Shared pool preventing connection exhaustion
  - Event-driven vs polling architecture
  - Memory leak prevention for long-lived connections
- **Critical Files**:
  - `/lib/events/execution-events.ts` - Execution event system
  - `/lib/events/phase-stage-events.ts` - Phase/stage event system
  - `/lib/events/prompt-registry-events.ts` - Prompt registry events

### Audit Logging System (Plan 8) — corrected 2026-06-11
- **Storage**: `Activity` table (type `SECURITY_EVENT`) via `lib/mcp/server/security/compliance-monitor.js` — there is **NO AuditLog model and never was** (git -S empty); do not re-add one
- **Event Types**: SERVICE_CALL, UNAUTHORIZED_SERVICE_ACCESS tracking
- **Integration**: ~~security-event-processor~~ DELETED 2026-06-14 (c5dab442 — dormant); threat detection lives in the login route + fail2ban
- **Performance**: `idx_activity_user_timeline` (userId, createdAt DESC) serves audit queries
- **Aspirational**: `user-consent-policy.js` references UserConsent/AuditLog/SecurityLog models that don't exist; `@aspirational`-annotated, zero importers (see TODO-user-consent-trust-integration.md)

### NEW: MCP Workflow Execution Tracking (Jan 2026)
- **MCPWorkflowExecution Model**: Execution history for orchestration workflows
- **Key Fields**: userId (required), povId, workflowType, status, duration, startTime, endTime
- **Execution Modes**: PREDEFINED (saved workflow) vs AD_HOC (on-demand)
- **Status Values**: RUNNING, COMPLETED, FAILED, CANCELLED, TIMEOUT
- **Query Patterns**: Performance stats queries in hub-tools-handler.js
  - Workflow counts by status (last 24 hours)
  - Average duration for completed workflows
  - Breakdown by workflowType
- **Documentation**: `/.claude/knowledge/domain/mcp/MCP-WORKFLOW-SYSTEM.md`

### Schema Architecture & Design
- **Responsibility**: Managing 43+ Prisma models in unified schema architecture
- **Key Files**:
  - `/prisma/schema.prisma` - Single source of truth for all models and enums (1,206 lines)
  - `/prisma/migrations/` - Migration history tracking schema evolution
- **Patterns**: Centralized schema organization, cascading relationships, proper indexing strategies
- **Integration Points**: All services rely on schema consistency, migration coordination with deployment pipeline

### Query Optimization & Performance
- **Responsibility**: Optimizing database queries across 179+ direct Prisma usage points
- **Key Files**:
  - `/lib/prisma.ts` - Connection pooling and client configuration
  - `/lib/*/prisma/select.ts` - Optimized query selection patterns
  - `/lib/*/prisma/mappers.ts` - Data transformation patterns
- **Patterns**: Connection pooling (15 connections, pgbouncer), query batching, selective field loading
- **Integration Points**: Works with performance-analyst-specialist on query optimization

### Transaction Management & Bulk Operations
- **Responsibility**: Managing complex transactions and bulk database operations
- **Key Files**:
  - `/lib/services/taskBulkService.ts` - Bulk operation patterns
  - `/lib/notifications/handlers/get.ts` - Transaction examples
  - `/lib/pov/templates/service.ts` - Complex transaction usage
- **Patterns**: `prisma.$transaction()` usage, batch processing, error handling in transactions
- **Integration Points**: Coordinates with task-services-specialist for bulk operations
- **Two operating principles (Apr 2026)**:
  1. **Two-axis BC2 sweep** — when scoping any data-shape audit, the grep set MUST cover both **read-cast** AND **write-back-corruption** patterns. Phase 3's 2026-02 sweep missed the write-back axis; Phase 4 (2026-04-25) caught two missed P0 sites because of this gap. Canonical checklist: `bug-class-eradication-protocol.md` Step 2.1 "Two-axis sweep checklist". Memory: `feedback_bc2_audits_two_axes.md`.
  2. **Post-tx side-effects: return from tx, don't closure-capture** — fire-and-forget loggers (`logFieldChange`) use the global Prisma singleton, NOT the surrounding `tx`. Calling them inside the tx callback persists rows even on rollback. Pattern: `transaction-atomicity-pattern.md` § "Post-Transaction Side-Effects". Bonus: avoids the TypeScript narrowing pitfall where `let x: T | null = null` outside the tx narrows to `null` literal in the outer scope.
  3. **A plain `$transaction()` is NOT lost-update protection (2026-06-08, BC19/BC47)** — at Prisma's default READ COMMITTED a plain `findUnique`→merge→`update` inside a tx still loses concurrent writes (a plain SELECT takes no row lock). This misconception had propagated to a pattern doc + ~6 sites. For a read-modify-write pick ONE: an **atomic single statement** (`jsonb ||` / `jsonb_set` / `{increment}`) — race-free + silent, best for clean merges/appends; **RepeatableRead/Serializable** — safe but aborts 40001; wrap with **`withSerializationRetry(fn, site)`** (`lib/database/serialization-retry.ts`, 2026-06-09 — thin adapter over `withRetry`, full jitter + caps, sleeps outside the tx; `fn` MUST be the bare `$transaction` call, side-effects outside) where multi-step JS logic must stay; **`SELECT … FOR UPDATE`** — waits (no abort). **Decision rule:** retry iff contention-prone GOOD(b) with multi-field merge; for a SIMPLE merge prefer atomic/FOR-UPDATE conversion over retry. References: `mergeTaskInputContext` (atomic), `task.ts:updateTask` (retry-wrapped), `agentTemplateService.updateTemplatePerformance` (RR→atomic, 2026-06-09). Pattern: `transaction-atomicity-pattern.md` §"Read-Then-Write Race Protection" + §Retry; registry BC19/BC14. Live-probed 2026-06-08: atomic 30/30 vs plain-RMW 1/30 under 30-way contention.

### Migration Strategy & Data Integrity
- **Responsibility**: Database migrations, data consistency, and referential integrity
- **Key Files**:
  - `/prisma/migrations/` - 6+ migration files tracking schema evolution
  - `/scripts/seed-database.ts` - Database seeding and initial data
- **Patterns**: Forward-only migrations, data validation, constraint management
- **Integration Points**: Works with types-system-specialist on schema type alignment

### Connection Management & Infrastructure
- **Responsibility**: Database connectivity, performance monitoring, and resource management
- **Key Files**:
  - `/lib/prisma.ts` - Enhanced connection pooling with pgbouncer configuration
  - `/lib/events/shared-connection-pool.ts` - **Plan 6**: Unified connection pool achieving 67% reduction
- **Patterns**: Connection limit management, timeout handling, global client reuse, shared pool architecture
- **Critical Knowledge**: Pool settings (15 connections, 30s timeout, transaction mode), client lifecycle management
- **Plan 6 Achievement**: Reduced connections from 3 separate to 1 shared pool, eliminating exhaustion


## [evicted] Key Information

### My Knowledge Base

**Database Prompt Creation** (95% confidence):
`/.claude/knowledge/domain/mcp/database-prompt-creation-guide.md`
- AgentPromptLibrary schema reference (Prisma model definition)
- Creating database prompts via seed scripts
- Schema validation requirements and field constraints
- Database prompt visibility (tags, isPublic, status fields)

### Critical Files
- `/prisma/schema.prisma` - Single unified schema file with all models and enums (43+ models, includes AgentPromptLibrary)
- `/lib/prisma.ts` - Prisma client configuration with optimized connection pooling
- `/prisma/migrations/` - Migration history and schema evolution tracking
- `/lib/services/taskBulkService.ts` - Bulk operations and transaction patterns
- `/scripts/seed-protocol-prompts.ts` and `/scripts/seed-agent-templates.ts` - Canonical seed scripts for agent_prompt_library (the `/temp-scripts/` path for ad-hoc seeding was retired 2026-04-24)

### Database Architecture Insights
- **Models**: 43 total models across domains (POV, Task, Team, Auth, Activity, Support, Workflow)
- **Indexes**: 62 database indexes and unique constraints for query optimization  
- **File Usage**: 179 files directly using Prisma client, 242 files with Prisma imports

### Enterprise Trial & Compliance Data Management (NEW)
- **Responsibility**: Managing trial registration data and compliance audit logs in MCPTool model
- **Key Files**:
  - `/lib/mcp/server/tools/hub-tools-handler.js` - Hub facade (delegates to 10 extracted handlers)
  - `/lib/mcp/server/security/compliance-monitor.js` - Compliance event logging
- **Data Patterns**:
  - Trial requests stored as MCPTool records with category='TRIAL_REQUEST'
  - Compliance events in Activity model with structured metadata
  - Trial lifecycle tracking through configuration.status field
- **Critical Knowledge**:
  - MCPTool.configuration stores trial metadata (companyName, contactEmail, trialId)
  - Trial status progression: PENDING_VERIFICATION → ACTIVE → EXPIRED/CONVERTED
  - Compliance events require structured JSON metadata for reporting
- **Retention Policy** (compliance-monitor.js - runs on startup + every 24h):

  **Three-Layer Reference** (Verified against production: 2026-02-07):

  | Prisma Model | Code Usage | DB Table | psql | Purpose | Retention |
  |--------------|------------|----------|------|---------|-----------|
  | `MCPWorkflowExecution` | `mCPWorkflowExecution` | `mcp_workflow_executions` | No quotes | Workflow execution history | 30 days |
  | `Activity` | `activity` | `Activity` | **Needs quotes** | User/system + security events | 180 days |
  | `TaskActivity` | `taskActivity` | `task_activities` | No quotes | Task-specific activity log | 90 days |
  | `MCPInteraction` | `mCPInteraction` | `mcp_interactions` | No quotes | MCP tool call logs | 30 days |
  | `AgentArtifact` | `agentArtifact` | `agent_artifacts` | No quotes | Agent execution outputs | 30 days |
  | `Notification` | `notification` | `notifications` | No quotes | User notifications (read only) | 7 days |
  | `RefreshToken` | `refreshToken` | `RefreshToken` | **Needs quotes** | Auth tokens | Expired |

  **Usage Guide:**
  - **In TypeScript**: `await prisma.taskActivity.deleteMany()` (use Code Usage column)
  - **In psql**: `DELETE FROM task_activities WHERE ...` (use DB Table column)
  - **PascalCase tables**: Must use quotes: `\d "Activity"`, `SELECT * FROM "RefreshToken"`
- **Connection Pool**: Enhanced pgbouncer configuration with 15 connections, transaction pooling mode
- **Pattern Reference**: `/.claude/knowledge/patterns/global-prisma-singleton-pattern.md` (98% confidence)
  - Global Prisma singleton prevents hot reload memory leaks
  - Used in 179+ files (100% consistency)
  - Mandatory pattern for all Prisma usage
  - See pattern file for implementation details

### OAuth 2.0 User Data Management (NEW - Plan 9)
- **Responsibility**: OAuth user account linking, enterprise data storage, token management
- **Key Files**:
  - `/lib/auth/oauth/oauth-service.ts` - User creation/linking from OAuth provider data
  - Enhanced User model - OAuth provider ID storage and account linking
- **Data Patterns**:
  - OAuth account linking via email address with existing users
  - Provider-specific user ID storage (oauthProvider, oauthProviderId fields)
  - Enterprise metadata storage (team sync data, role mappings)
  - Token refresh data and OAuth session management
- **Critical Knowledge**:
  - User.oauthProvider stores provider name (microsoft, google, github)
  - User.oauthProviderId links to provider's unique user identifier
  - OAuth users created with emailVerified=true (providers verify emails)
  - Enterprise role mapping stored in user.role based on OAuth claims

### Common Database Issues You Handle
1. **Query Performance Optimization**
   - Identify N+1 query problems
   - Recommend proper indexing strategies
   - Optimize large dataset queries with pagination
   - Success criteria: Sub-100ms query response times

2. **Schema Migration Management**
   - Plan safe forward-only migrations
   - Validate referential integrity constraints
   - Coordinate schema changes with dependent services
   - Success criteria: Zero-downtime migrations

3. **Transaction & Concurrency Management**
   - Design proper transaction boundaries
   - Prevent deadlocks and race conditions
   - Implement optimistic locking where needed
   - Success criteria: Consistent data state under load

4. **Connection Pool & Resource Optimization**
   - Monitor connection usage patterns
   - Tune pool settings for workload
   - Prevent connection exhaustion
   - Success criteria: Stable connection metrics

### When to Use This Specialist
- Database performance degradation or slow queries
- Prisma schema changes or migration planning
- Connection pool exhaustion or timeout issues
- Transaction deadlocks or race conditions
- Data integrity violations or constraint failures
- Bulk operation design and optimization
- Database indexing strategy development
- Query optimization and N+1 problem resolution
- Database monitoring and metrics analysis


## [evicted] Learning Notes

### Dev Query Logger Restored via `$extends` (Feb 2026)
- **Problem**: Prisma 6.16+ removed `$use` middleware, breaking the dev query logger (was a no-op stub)
- **Solution**: Replaced with `Prisma.defineExtension` + `query.$allOperations` hook in `devQueryLoggerExtension()`
- **Applied in**: `createPrismaClient()` via `client.$extends()` — zero changes to the 292 importing files
- **Capabilities**: Slow query detection (>100ms), N+1 detection (>5 same `Model.operation` calls in 1s window), live counters via `getQueryStats()`
- **Production safety**: Returns identity extension when `NODE_ENV !== 'development'`
- **Startup signal**: `[DEV] Query logger active via Prisma extension` (replaces old warning)
- **Key files**: `lib/database/dev-query-logger.ts`, `lib/prisma.ts`
- **Assessment impact**: Dev query monitoring score 40/100 → restored to functional

### Critical Database Patterns Discovered
- **Connection Pooling**: Enhanced pgbouncer configuration in `/lib/prisma.ts` with transaction mode, 15 connections, and 30s timeout for optimal performance
- **Unified Schema Architecture**: All models and enums in single `/prisma/schema.prisma` file (1,206 lines) for clarity and maintainability
- **Transaction Usage**: Complex transactions in bulk operations, notification handling, and POV template creation
- **Query Optimization**: Select/mapper pattern in notification system for type-safe, optimized queries

### NEW: Plan 6 Event System Patterns
- **Revolutionary Achievement**: 90% database load reduction via NOTIFY/LISTEN replacing polling
- **Shared Connection Pool**: 67% connection reduction (3→1) preventing exhaustion
- **Event Broadcasting**: Database triggers automatically emit events for real-time updates
- **Memory Management**: Connection cleanup prevents leaks in long-lived event listeners
- **Critical**: Maintaining these performance gains is paramount - preserve event architecture

### API-Driven Database Optimization Patterns
- **Pattern Library**: `/.claude/knowledge/patterns/api-efficiency-patterns.md` - Database patterns for API optimization
- **Pattern 4**: Database Index Design - Proven index strategies for API queries (10-50x performance gains)
- **Pattern 7**: N+1 Query Prevention - Batch relationship loading patterns
- **Created**: Oct 28, 2025 (P0 + P1 API efficiency work)
- **Evidence**: 10 indices added, 10-50x performance improvement, production-validated
- **Use Case**: When optimizing API queries, reference proven database optimization patterns

### Event Emitter Memory Safety Patterns
- **Pattern Library**: `/.claude/knowledge/patterns/event-emitter-memory-safety.md` (95% confidence, Dec 1, 2025)
- **CRITICAL**: Global singleton pattern for database connection-based event emitters
- **Problem Solved**: Webpack chunk isolation causing separate event emitter instances (90% memory waste)
- **Solution**: Use `declare global { var X }` pattern like Prisma's global.prismaClient
- **Applied to**: SharedEventConnectionPool, ExecutionEvents, PromptRegistryEvents
- **Impact**: 90% memory savings (100KB → 10KB per emitter), prevents connection pool fragmentation
- **Use Case**: When creating new event emitters that use database connections

### Server-Side Prompts Direct Prisma Pattern (Nov 15, 2025)
- **New Pattern**: Server-side prompts (in prompt-registry.js) use direct Prisma queries (not API layer)
- **Execution**: Prompt registry → `prisma.findMany()` (same Node.js process, no HTTP overhead)
- **Vs MCP Tools**: Tool *handlers* (e.g. `perform`) use `apiClient.post()` → API/HTTP. Embedded server *resource reads* now use direct Prisma (P6 migration, Mar 2026) with `buildPOVAccessFilter`/`buildTaskAccessFilter` for access control.
- **Example**: audit_all_tasks prompt uses direct Prisma for POV/task aggregation
- **Benefits**: No HTTP overhead, can do complex aggregations, faster for internal operations
- **Pattern**: Use `_count` for batching (Pattern 7), role-based filtering, manual completeness detection
- **Reference**: Pattern 4 in mcp-metadata-exposure-pattern.md (server-side prompt paradigm)

### Production Deployment Database (NEW - 2025-09-05)
- **Production Droplet**: Digital Ocean server at <PROD_HOST> (paichart.app) - THE production environment
- **🚀 AI-Native Database Management**: Claude Code v1.0.108 installed for intelligent database diagnostics
- **Production Database**: paichart_production on Digital Ocean with PostgreSQL 16
- **Server Access**: SSH key-based authentication (ed25519) to <PROD_USER>@<PROD_HOST> for database management
- **Intelligent Analysis**: AI-powered database performance monitoring via claude-ops user
- **Database User**: Production uses dedicated `paichart` user (password: $DB_PASSWORD) with proper permissions
- **Migration Success**: All 9 migrations applied successfully to production environment
- **Connection String**: Production DATABASE_URL configured for paichart user, not superuser
- **Schema Permissions**: Database user has proper CREATE/ALTER/DROP permissions for migrations
- **Performance**: Production database configured with appropriate connection pooling
- **Backup Strategy**: Digital Ocean automatic backup configuration for production data
- **Environment Isolation**: Production database completely separate from development
- **Query Optimization**: Production queries benefit from proper indexes and connection pooling
- **Migration Tracking**: __prisma_migrations table properly populated in production

### ChatGPT Connector Text Search Optimization (NEW - 2025-09-25)
- **GIN Indices Deployed**: 15+ PostgreSQL GIN indices for full-text search across all major tables
- **Performance Gains**: 10-50x improvement in text search queries for ChatGPT connector
- **Tables Optimized**: POV, Phase, stages, tasks, agent_executions, agent_templates
- **Search Pattern**: Using to_tsvector('english', ...) for proper stemming and stop word removal
- **Index Strategy**: Combination of text search (GIN) and foreign key (B-tree) indices
- **Migration Success**: `/prisma/migrations/20250925_add_text_search_indices/` applied to production
- **Query Patterns**: Optimized for both exact matches and partial text searches
- **Composite Indices**: Status + date filtering patterns for common query combinations
- **Production Verification**: 21 indices confirmed on production database (paichart_production)

### Schema Mapping Discoveries (NEW - 2025-09-25)
- **Table Name Mapping**: Models with @@map directives use snake_case (e.g., Task → tasks)
- **Column Name Mapping**: Fields with @map use snake_case (e.g., povId → pov_id)
- **Mixed Conventions**: POV and Phase use PascalCase tables (no @@map), others use snake_case
- **Critical Learning**: Always verify actual database names vs Prisma model names
- **Migration Pattern**: SQL migrations must use database names, not Prisma model names
- **Array Handling**: PostgreSQL array columns (e.g., logs[]) need special GIN index syntax
- **Text Type Casting**: JSON fields need ::text casting for text search indices

### Performance Gotchas
- **File Count Impact**: 179 direct Prisma usage files indicate potential for inconsistent query patterns
- **Bulk Operations**: Task bulk service requires careful transaction management for data consistency
- **Connection Management**: Global client reuse pattern prevents connection exhaustion in development

### Integration Patterns
- **Type Safety**: Close coordination needed with types-system-specialist for schema-type alignment
- **Performance Monitoring**: Works with performance-analyst-specialist on query optimization metrics
- **Bulk Operations**: Collaborates with task-services-specialist on transaction boundary design


## [evicted] Operational Monitoring Infrastructure (Added 2026-02-12)

**Production Database Health Monitoring**: Daily email report tracks operational health

**What's Monitored**:
- Database size & growth (Alert: >1GB yellow, >5GB red)
- Connection pool health (Alert: >20 warning, >50 critical)
- Top 5 tables by size (Track growth patterns)
- Retention policy compliance (180d/90d/30d policies)
- Dead tuple percentage (VACUUM trigger at >25%)

**Summary Metrics** (Daily Email): 6 core metrics with color-coded alerts
**Detailed Report** (Email Attachment): Health score, top 10 tables, connection breakdown, dead tuples, retention compliance

**Location**: `~/disaster-recovery/scripts/daily-summary.sh` (summary) + `generate-database-health-report.sh` (detailed)
**Schedule**: Daily at 6 AM AEST (existing cron)
**Guides**:
- `.claude/knowledge/PRODUCTION-HEALTH-AGENT-GUIDE.md` Part 9 (remediation procedures)
- `.claude/knowledge/DATABASE-HEALTH-REPORT-GUIDE.md` (report interpretation)

**When consulting on database changes**: Consider impact on monitoring thresholds and review daily report recommendations.

---


