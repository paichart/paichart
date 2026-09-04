# Database Management Discovery

**Last Updated**: 2026-06-11 (health-run: corrected stale §1/§5/§6/§10 expectations; AuditLog never existed)
**Status**: Enhanced v2.2 - Full discovery health-run (Protocol 11 prove-before-write applied)
**Confidence**: Very High - Revolutionary database performance documented
**Last Validated**: 2026-06-12 - All dated grep blocks re-proven against the tree (2026-05-27 + 2026-06-09 blocks PASS; prod telemetry: 0 serialization retries/exhaustions, 0 db-domain errors/warnings)

This discovery prompt provides comprehensive investigation of the pAIchart database architecture, performance patterns, and optimization opportunities.

## 🆕 2026-05-27 Session — Run These Greps FIRST (user-delete cascades + user-lookup indexing)

```bash
# Safe user-delete — the actionable cascade exceptions (full runbook: guides/USER_RETIREMENT_RUNBOOK.md):
grep -nE "POVOwner|onDelete: (Cascade|Restrict|SetNull)" prisma/schema.prisma | grep -iE "owner|workflow|assignee|recommendation|team"
# the ONLY Restrict on User (BLOCKS the delete) + the non-FK dangling scalars (handle manually):
grep -nE "onDelete: Restrict" prisma/schema.prisma
grep -nE "createdBy|implementedBy" prisma/schema.prisma | head

# User-lookup indexing — already covered; NO new index needed (id=PK, email=@unique, oauth pair=@@unique+@@index):
sed -n '/^model User /,/^}/p' prisma/schema.prisma | grep -E "@id|@unique|@@index|@@unique"
# A Seq Scan on the tiny User table is OPTIMAL; planner auto-uses User_pkey as it grows. Verify at scale:
#   EXPLAIN (ANALYZE) SELECT id,email,role FROM "User" WHERE id='<id>';  → Index Scan using User_pkey once large
```

Resolved 2026-05-27: no "userId index" needed (`id` is the primary key). Runbook: `guides/USER_RETIREMENT_RUNBOOK.md`. Ref: [[prelaunch-pentest-2026-05-26]].

---

## Executive Summary
Run this discovery to understand:
- Database schema complexity and model relationships
- Query performance patterns and bottlenecks
- Migration history and data integrity issues
- Connection pooling and resource utilization
- Transaction usage patterns and bulk operations
- **NEW Plan 6**: Event-driven architecture achieving 90% load reduction
- **NEW Plan 6**: Shared connection pool with 67% connection reduction

## Discovery Commands

### 1. Database Schema Architecture Analysis
```bash
echo "=== DATABASE SCHEMA ANALYSIS ==="
echo "--- Model Count and Distribution ---"
grep -c "^model " prisma/schema.prisma
echo "Total models in main schema (44 as of 2026-06-11)"

ls prisma/*.prisma   # expect exactly ONE file: prisma/schema.prisma
echo "Single unified schema — prisma/domains/ was DELETED 2025-11-18 (1b1f2be7, abandoned modular design); do not re-add"

echo "--- Index and Constraint Analysis ---"
grep -c "@@index\|@@unique" prisma/schema.prisma
echo "Total indexes and unique constraints"

grep "@@index\|@@unique" prisma/schema.prisma | head -10
echo "Sample index patterns"
```

### 2. Prisma Client Usage Analysis
```bash
echo "=== PRISMA CLIENT USAGE ANALYSIS ==="
echo "--- File Distribution ---"
find . -name "*.ts" -not -path "*/node_modules/*" -not -path "*/temp-scripts-backup*" -not -path "*/prisma/generated/*" -exec grep -l "from '@prisma/client'\|import.*prisma" {} \; | wc -l
echo "Files importing Prisma"

find . -name "*.ts" -not -path "*/node_modules/*" -not -path "*/temp-scripts-backup*" -not -path "*/prisma/generated/*" -exec grep -l "prisma\." {} \; | wc -l  
echo "Files using prisma instance"

echo "--- Direct Query Usage ---"
find . -name "*.ts" -not -path "*/node_modules/*" -not -path "*/prisma/generated/*" | xargs grep -c "await prisma\." 2>/dev/null | awk -F: '{sum += $2} END {print sum}'
echo "Total direct prisma queries"
```

### 3. Performance Pattern Analysis
```bash
echo "=== PERFORMANCE PATTERNS ANALYSIS ==="
echo "--- Connection Configuration ---"
cat lib/prisma.ts | grep -A 5 -B 5 "connection_limit\|pool_timeout\|pgbouncer"
echo "Connection pool settings"

echo "--- Transaction Usage ---"
grep -r "prisma\.\$transaction" . --include="*.ts" | wc -l
echo "Files using transactions"

grep -r "prisma\.\$transaction" . --include="*.ts" | head -5
echo "Sample transaction usage"

echo "--- Bulk Operation Patterns ---"
find . -name "*.ts" | xargs grep -l "bulk\|batch" | head -5
echo "Files with bulk operations"
```

### 4. Migration and Schema Evolution
```bash
echo "=== MIGRATION ANALYSIS ==="
echo "--- Migration History ---"
ls prisma/migrations | grep -v migration_lock.toml | wc -l
echo "Total migrations (legacy — Dec 2025 switched to db push everywhere)"

ls -la prisma/migrations | tail -5
echo "Recent migrations (pre-Dec-2025 only; after that date use db push)"

echo "--- Schema File Organization ---"
wc -l prisma/schema.prisma
echo "Single unified schema file"

ls -la prisma/ | grep -v migrations | grep -v generated
echo "Prisma directory structure"

echo "--- Sanctioned db-push Exception: Raw-SQL Ops Scripts ---"
# Pattern: .claude/knowledge/patterns/sanctioned-db-push-exception-ops-script-pattern.md
# Default is db push; ops scripts are the sanctioned exception for:
#   - Partial unique indexes (Prisma schema can't express @@unique(..., where: ...))
#   - JSONB expression indexes (Prisma schema can't express ((metadata->>'key')))
#   - CREATE INDEX CONCURRENTLY (db push runs in a transaction)
ls scripts/create-*-index.sh 2>/dev/null
echo "Canonical ops-script instances"

grep -l 'sanctioned db-push exception\|applied via ops script' prisma/schema.prisma
echo "Schema annotations documenting raw-SQL indexes (doc-only pointers)"

grep -c 'ON_ERROR_STOP=1\|indisvalid\|DROP INDEX CONCURRENTLY' scripts/create-*-index.sh 2>/dev/null
echo "Hardening shape per script (ON_ERROR_STOP + INVALID-cleanup + verify)"
```

### 4a. Raw-SQL Partial / UNIQUE / JSONB Indexes (NEW — Apr 2026)
```bash
echo "=== RAW-SQL INDEX INVENTORY ==="
# These indexes exist in prod via ops scripts but NOT in prisma/schema.prisma.
# Specialist reviews for any change on affected tables should check for these.

echo "--- L3 partial UNIQUE on agent_executions ---"
grep -rn 'idx_agent_executions_active_per_task' scripts/ prisma/schema.prisma cline_docs/reviews/
echo "One-active-execution-per-task constraint (Apr 2026)"

echo "--- A6 partial JSONB on tasks ---"
grep -rn 'idx_tasks_pipeline_stage_id' scripts/ prisma/schema.prisma cline_docs/reviews/
echo "Pipeline-child lookup acceleration (Apr 2026)"

echo "--- Prior instances (pre-2026 ops scripts and migration SQL) ---"
grep -rn 'CREATE UNIQUE INDEX CONCURRENTLY\|CREATE INDEX CONCURRENTLY' scripts/ prisma/migrations/
echo "All CONCURRENTLY-created indexes"
```

### 4b. P2002 Catch / Typed Error Patterns (NEW — Apr 2026 L3)
```bash
echo "=== P2002 UNIQUE-VIOLATION CATCH PATTERNS ==="
echo "--- Three-arm P2002 matcher for named raw-SQL partial-unique indexes ---"
# The matcher handles Prisma 6.16's variable meta.target shape:
#   - string[] for Prisma-managed @@unique
#   - string (index name) for raw-SQL named indexes
#   - undefined with constraint name in message body (edge cases)
grep -rn "prismaErr?.code === 'P2002'\|meta.target.includes" lib/services/agent-execution-create.ts

echo "--- Typed error classes with .code discriminator ---"
grep -n '^export class .* extends AppError' lib/errors.ts   # expect 14 (was 13; +ProtocolStampImmutableError, WS2 Phase A 2026-08-17)
echo "AppError-derived classes (AuthError, NoTemplateAssignedError, DuplicateActiveExecutionError, PipelineStageMismatchError, ValidationError, DatabaseError, ApiError — re-proven 2026-06-11)"

echo "--- Phantom-P2002 sanity check (protects against Prisma error-shape drift) ---"
grep -rn 'DUPLICATE_ACTIVE_EXECUTION_PHANTOM' lib/services/
```

### 4c. BC2 Two-Axis Sweep — Write-Back-Corruption Audit (Apr 2026)

```bash
echo "=== BC2 TWO-AXIS SWEEP ==="
echo "Phase 3 (2026-02) only swept read-cast variants. Phase 4 (2026-04-25)"
echo "added the write-back-corruption axis. Both must be covered for any new"
echo "data-shape audit. Canonical checklist: bug-class-eradication-protocol.md Step 2.1."

echo ""
echo "--- 1. Direct jsonb-named writes ---"
grep -rEn 'prisma\.\w+\.update.*metadata' --include='*.ts' lib/ app/ \
  | grep -v node_modules | grep -v '\.test\.'

echo ""
echo "--- 2. Shallow-merge candidates (existing pattern verification) ---"
grep -rEn '\{ \.\.\.[a-zA-Z]+(metadata|Metadata|Meta).*\}' --include='*.ts' lib/ app/ \
  | grep -v node_modules

echo ""
echo "--- 3. Direct domain prisma updates (whole-replace via 'a || b' semantic) ---"
grep -rEn 'prisma\.(stage|phase|pOV|task|workflow|agent[A-Z]).update' --include='*.ts' lib/ app/ \
  | grep -v node_modules

echo ""
echo "--- 4. Validated PUT routes (Zod-validated input → prisma.update) ---"
grep -rln 'data: validated\|data: updateData\|data: validationResult\.data' app/api/ lib/ \
  --include='*.ts' | grep -v node_modules
echo "For each hit: trace whether the validator marks any jsonb fields optional."
echo "If yes, partial PUT will whole-replace those fields → P0 fix needed."

echo ""
echo "--- Cross-references ---"
echo "Pattern: bug-class-registry.md BC2 Phase 4 entries"
echo "Memory: feedback_bc2_audits_two_axes.md"
echo "Canonical fixes: phase.ts:updateStage (705415ce), agent-templates/route.ts:224 (705415ce)"
```

### 4d. Post-Transaction Side-Effects Audit (Apr 2026)

```bash
echo "=== POST-TX SIDE-EFFECTS AUDIT ==="
echo "Fire-and-forget loggers (logFieldChange) use the global Prisma singleton,"
echo "NOT the surrounding tx. Calling them INSIDE the tx callback persists rows"
echo "on rollback. Audit: callers should capture data inside tx, log AFTER."

echo ""
echo "--- 1. logFieldChange call sites — verify post-tx placement ---"
grep -rnB10 'logFieldChange(' --include='*.ts' lib/ app/ | \
  grep -v node_modules | \
  grep -E 'prisma\.\$transaction|logFieldChange|tx\.task\.update|return \{ task' | \
  head -30
# Read each cluster: confirm logFieldChange runs AFTER `await prisma.$transaction(...)`,
# not inside the callback. Pattern: capture in tx return shape, iterate after the await.

echo ""
echo "--- 2. Suspicious closure-captured 'let' patterns ---"
grep -rnB2 'let \w+: \{' --include='*.ts' lib/ app/ | \
  grep -v node_modules | grep -B3 'prisma\.\$transaction' | head -20
# These are candidates for the closure-narrowing TypeScript bug. Audit each:
# if the let is reassigned inside the tx closure AND used outside, refactor
# to return the value from the tx instead.

echo ""
echo "--- Cross-references ---"
echo "Pattern: transaction-atomicity-pattern.md § 'Post-Transaction Side-Effects (Return From Tx, Don't Closure-Capture)'"
echo "Production reference: lib/mcp/tasks/action/handlers/task/task-update-handler.ts (commit 8f225353)"
```

### 4e. Phantom Canonical Select Audit (May 2026)

```bash
echo "=== PHANTOM CANONICAL SELECT AUDIT ==="
echo "Hazard: an exported 'fullX' or 'withY' select in lib/*/prisma/select.ts looks"
echo "like the production wire shape, but a service in lib/*/services/ hand-rolls"
echo "its own select (often after an N+1 optimization) that omits fields the"
echo "canonical includes. Six specialists missed this in 2026-05-02 — they all"
echo "audited the schema file. Always verify the actual runtime query."
echo ""
echo "Canonical example: lib/pov/prisma/select.ts:fullPOV stripped of dependencies"
echo "by lib/pov/services/pov.ts:.get() N+1 optimization. Fixed in commit 8d256992."

echo ""
echo "--- 1. Service files that import a canonical select ---"
grep -rn "import.*\{.*\(full\|with\)\w*.*\}.*from.*prisma/select" \
  lib/*/services/ 2>/dev/null

echo ""
echo "--- 2. Service files with optimization rollback markers ---"
grep -rn "// OLD CODE\|// commented for rollback\|N+1 OPTIMIZED\|optimized version" \
  lib/*/services/ lib/services/ 2>/dev/null

echo ""
echo "--- 3. Service prisma.X.find* calls — audit each for canonical reuse ---"
grep -rn "prisma\.\w\+\.\(findUnique\|findMany\|findFirst\)" \
  lib/*/services/ lib/services/ --include="*.ts" 2>/dev/null | head -30
echo "For each match: does the select use the canonical's include/select"
echo "constant, or a literal object that may be drifting?"

echo ""
echo "--- 4. When debugging a 'field missing on wire' bug ---"
echo "ALWAYS grep both:"
echo "  (a) lib/<domain>/prisma/select.ts for the field"
echo "  (b) lib/<domain>/services/*.ts for the actual prisma.X.find* call"
echo "Discrepancy = phantom-canonical bug."
echo ""
echo "Pattern: .claude/knowledge/patterns/two-execution-path-drift-pattern.md"
echo "         §Phantom Canonical Variant"
```

### 5. Query Optimization Patterns (ENHANCED - Phase 1 Complete)
```bash
echo "=== QUERY OPTIMIZATION ANALYSIS ==="
echo "--- Advanced Query Mappers (NEW) ---"
ls -la lib/database/query-mappers.ts
echo "Phase 1 Performance Enhancement - Factory, Proxy, Strategy Patterns"

echo "--- Query Performance Monitoring (Restored Feb 2026 via \$extends) ---"
ls -la lib/database/dev-query-logger.ts
echo "Dev-only: slow query (>100ms) + N+1 detection via Prisma \$extends query.\$allOperations"
grep -c "devQueryLoggerExtension\|SLOW_THRESHOLD_MS\|N_PLUS_ONE" lib/database/dev-query-logger.ts
echo "Extension functions in TS source"
grep -c "devQueryLoggerExtension" lib/prisma.ts
echo "Applied in lib/prisma.ts (lib/prisma.js deleted Apr 8 2026 — Bug Class 73 eradication)"

echo "--- Select Pattern Usage ---"
find . -name "*select.ts" | wc -l
echo "Files with select patterns"

echo "--- Mapper Pattern Usage (ENHANCED) ---"
find . -name "*mapper*.ts" | wc -l
echo "Files with mapper patterns"

echo "--- Query Mapper Analysis (NEW) ---"
grep -n "createTaskMapper\|createPOVMapper\|createPhaseMapper" lib/database/query-mappers.ts | wc -l
echo "Advanced mapper functions implemented"

echo "--- Performance Baseline Metrics ---"
# NOTE (2026-06-11): the baselines below are session-MEASURED benchmarks from Phase 1;
# they were never written into query-mappers.ts as comments — do NOT grep the file for them (expect ZERO).
echo "Baseline: Simple queries 0.023ms, Complex queries 0.053ms, 99% N+1 reduction (measured, not file contents)"

echo "--- Include/Select Analysis ---"
grep -r "include:\|select:" . --include="*.ts" | head -5
echo "Sample include/select usage"

echo "--- MinimalSelects Pattern Usage (NEW) ---"
grep -r "MinimalSelects\." . --include="*.ts" | wc -l
echo "Files using optimized select patterns"
```

### 6. Pino Structured Logging for Database Operations (NEW - Feb 2026)
```bash
echo "=== PINO DATABASE LOGGING ANALYSIS ==="
echo "--- dbLogger Usage in Codebase ---"
grep -rn "dbLogger\.\(info\|warn\|error\|debug\)" lib/ app/ --include="*.ts" --include="*.js" | head -20
echo "dbLogger calls found in codebase"

echo -e "\n--- apiLogger Usage for Database Routes ---"
grep -rn "apiLogger\.\(info\|warn\|error\)" app/api/ --include="*.ts" | grep -i "prisma\|query\|transaction" | head -10
echo "API route database logging"

echo -e "\n--- Domain Logger Imports in Database Code ---"
grep -rn "from.*lib/logger\|require.*lib/logger" lib/prisma.ts lib/database/ lib/events/ --include="*.ts" --include="*.js" 2>/dev/null | head -10
echo "Logger imports in database-related files"

echo -e "\n--- Legacy console.log in Database Code ---"
grep -rn "console\.\(log\|warn\|error\)" lib/prisma.ts lib/database/ lib/events/ --include="*.ts" --include="*.js" 2>/dev/null | wc -l
echo "Expect 6 BENIGN hits (proven 2026-06-11): 4 in lib/database/dev-query-logger.ts (dev-only, on the validate:logging allowlist) + 2 inside a JSDoc example in lib/events/prompt-registry-events.ts. Anything beyond these = regression; authoritative gate is 'npm run validate:logging'."

echo -e "\n--- Production Database Domain Logs ---"
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 100 --nostream | grep '\"domain\":\"db\"' | jq" 2>/dev/null | tail -20

echo -e "\n--- Production Database Errors (level 50) ---"
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"db\"' | grep '\"level\":50' | jq" 2>/dev/null | tail -10

echo -e "\n--- Production Database Warnings (level 40 — slow queries) ---"
ssh <PROD_USER>@<PROD_HOST> "pm2 logs paichart --lines 200 --nostream | grep '\"domain\":\"db\"' | grep '\"level\":40' | jq" 2>/dev/null | tail -10
```

**Questions to answer**:
- Is dbLogger being used in database-related code (lib/prisma.ts, lib/database/, lib/events/)?
- Are slow queries being logged with structured context (queryTime, table, operation)?
- Are there remaining console.log calls in database code that should be migrated?
- Are pino database domain logs flowing in production?
- Are there database warnings (slow queries) or errors visible in PM2 JSON logs?

### 6b. Database Error and Performance Issues
```bash
echo "=== DATABASE ISSUES ANALYSIS ==="
echo "--- Error Patterns ---"
grep -r "database\|prisma" . --include="*.ts" | grep -i "error\|throw\|catch" | head -5
echo "Database error handling patterns"

echo "--- Performance Comments ---"
grep -r "slow\|performance\|optimization" . --include="*.ts" --include="*.prisma" | head -5
echo "Performance-related comments"

echo "--- Connection Issues ---"
grep -r "connection\|pool\|timeout" . --include="*.ts" | grep -i "error\|fail" | head -5
echo "Connection-related issues"
```

### 7. Data Integrity and Validation
```bash
echo "=== DATA INTEGRITY ANALYSIS ==="
echo "--- Constraint Usage ---"
grep -c "onDelete:\|onUpdate:" prisma/schema.prisma
echo "Foreign key constraints with actions"

grep "onDelete:\|onUpdate:" prisma/schema.prisma | sort | uniq -c
echo "Constraint action distribution"

echo "--- Validation Patterns ---"
grep -r "validate\|check\|constraint" . --include="*.ts" | head -5
echo "Data validation patterns"
```

### 8. Seeding and Data Management
```bash
echo "=== DATA MANAGEMENT ANALYSIS ==="
echo "--- Seeding Scripts ---"
find scripts -name "*seed*" -o -name "*data*" | head -5
echo "Data seeding scripts"

echo "--- Seed Dependencies ---"
cat scripts/seed-database.ts | grep -A 10 "console.log('Executing:"
echo "Seeding process flow"
```

### 9. Event-Driven Database Patterns (Plan 6)
```bash
echo "=== PLAN 6: EVENT SYSTEM DATABASE ANALYSIS ==="
echo "--- Shared Connection Pool ---"
ls -la lib/events/shared-connection-pool.ts
grep -c "getInstance\|singleton" lib/events/shared-connection-pool.ts 2>/dev/null || echo "0"
echo "Unified connection pool achieving 67% reduction (3→1)"

echo "--- PostgreSQL NOTIFY/LISTEN ---"
grep -r "NOTIFY\|LISTEN" lib/events --include="*.ts" | head -10
echo "Event broadcasting patterns replacing polling"

echo "--- Memory Leak Prevention ---"
# memory-leak-prevention.ts DELETED 2026-06-14 (c5dab442). Bounded-cache reference impls:
# lib/auth/cache.ts, lib/auth/oauth/session-store.ts.

echo "--- Event System Files ---"
ls -la lib/events/*.ts | wc -l
echo "Total event system files"

echo "--- Performance Impact ---"
grep -r "90%.*reduction\|database.*load" lib/events --include="*.ts" | head -5
echo "90% database load reduction achieved"

echo "--- Connection Efficiency ---"
grep -r "connection.*pool\|shared.*connection" lib/events --include="*.ts" | head -5
echo "Connection pooling efficiency patterns"
```

### 10. Audit Logging System (Plan 8) — CORRECTED 2026-06-11
```bash
echo "=== PLAN 8: AUDIT LOGGING DATABASE ==="
# There is NO AuditLog model and there NEVER was one (git log -S 'model AuditLog' is empty).
# Security events persist as Activity rows via compliance-monitor — do NOT re-add an AuditLog model.

echo "--- Security-event storage (Activity table) ---"
grep -n "Uses Activity model" lib/mcp/server/security/compliance-monitor.js   # expect 2 (the code documents this itself)
grep -n "type: 'SECURITY_EVENT'" lib/mcp/server/security/compliance-monitor.js   # expect 2
echo "compliance-monitor.storeSecurityEvent → prisma.activity.create (type SECURITY_EVENT, write-time sanitized per BUG-AUDIT-XSS-2)"

echo "--- Security Event Types ---"
grep -rn "SERVICE_CALL\|UNAUTHORIZED_SERVICE_ACCESS" lib/mcp/server/ --include="*.js" | head -5
echo "Security event types tracked (compliance-monitor + hub handlers)"

echo "--- Audit Query Performance (Activity index) ---"
grep -n "idx_activity_user_timeline" prisma/schema.prisma   # expect 1
echo "User-timeline index serves audit queries"

echo "--- Aspirational consent module (NOT wired) ---"
grep -n "@aspirational" lib/mcp/server/config/user-consent-policy.js   # expect 1 (header annotation, e6926160)
# This module references UserConsent/AuditLog/SecurityLog models that do NOT exist and has ZERO importers.
# Tracking: .claude/knowledge/domain/mcp/TODO-user-consent-trust-integration.md
```

### 11. MCP Workflow Execution Tracking (Jan 2026)
```bash
echo "=== MCP WORKFLOW EXECUTION DATABASE ==="
echo "--- MCPWorkflowExecution Model ---"
grep -A 20 "model MCPWorkflowExecution" prisma/schema.prisma
echo "Workflow execution tracking model"

echo "--- Workflow Execution Types ---"
grep -E "PREDEFINED|AD_HOC" prisma/schema.prisma
echo "WorkflowType enum values"

echo "--- Execution Query Patterns ---"
grep -rn "MCPWorkflowExecution" lib/ --include="*.ts" | head -10
echo "Workflow execution query locations"

echo "--- Workflow Metrics Queries ---"
grep -rn "workflowMetrics\|findMany.*MCPWorkflowExecution" lib/mcp/ --include="*.js" | head -10
echo "Performance stats workflow queries"

echo "--- Activity Integration ---"
grep -rn "WORKFLOW_EXECUTED\|logWorkflowExecution" lib/ --include="*.ts" | head -10
echo "Workflow activity logging integration"
```

## Key Metrics to Track

### Schema Complexity Metrics (re-proven 2026-06-11)
- Total models: 44
- Total schema files: 1 (unified `prisma/schema.prisma` — domains/ deleted 2025-11-18)
- Indexes and constraints (`@@index|@@unique` lines): 101
- Migration count: 14 (legacy, pre-Dec-2025; db push since)

### Usage Pattern Metrics  
- Files importing Prisma: 242+
- Files with direct usage: 179+
- Transaction usage points: Track growth
- Bulk operation files: Monitor complexity

### Performance Indicators (ENHANCED - Phase 1 Baselines)
- Connection pool utilization (optimized: 3 → 15 connections)
- Query response times by endpoint (baseline: 0.023ms simple, 0.053ms complex)
- N+1 query elimination rate (achieved: 99% reduction) 
- Transaction duration patterns
- Error rates by operation type
- Dev query logger metrics (>100ms threshold)

## Discovery Analysis Framework

### 1. Schema Complexity Assessment
- Model relationship depth and complexity
- Index effectiveness and coverage
- Domain organization clarity
- Migration dependency chains

### 2. Performance Bottleneck Identification
- N+1 query patterns in codebase
- Missing indexes on frequently queried fields
- Inefficient include/select patterns
- Connection pool exhaustion points

### 3. Data Integrity Risk Analysis
- Cascade deletion impact assessment
- Foreign key constraint coverage
- Validation rule completeness
- Transaction boundary appropriateness

### 4. Scalability Concern Mapping
- High-frequency query patterns
- Bulk operation efficiency
- Connection management under load
- Migration complexity for large datasets

## Success Criteria

### Database Health Indicators

**Development Monitoring**:
- ✅ All queries under 100ms for standard operations
- ✅ Zero connection pool exhaustion events
- ✅ Migration completion under 30 seconds
- ✅ No data integrity constraint violations

**Production Monitoring** (Daily Email Report - Added 2026-02-12):
- ✅ Database size tracking (23 MB baseline, <1GB threshold)
- ✅ Connection pool health (1 active, 9 idle, 10% utilization)
- ✅ Top 5 tables by size (mcp_workflow_executions 4.7 MB, Activity 2.8 MB)
- ✅ Retention compliance (180d/90d/30d policies validated daily)
- ✅ Dead tuple monitoring (VACUUM at >25% threshold)

**Location**: `~/disaster-recovery/scripts/daily-summary.sh` (Part 9 in PRODUCTION-HEALTH-AGENT-GUIDE.md)

### Code Quality Metrics
- ✅ Consistent select/mapper pattern usage
- ✅ Proper transaction boundary design
- ✅ Optimized include/select queries
- ✅ Error handling on all database operations

### Architecture Compliance
- ✅ Unified single-schema organization maintained (`prisma/schema.prisma` only; domains/ deleted 2025-11-18)
- ✅ Type safety preserved across all queries  
- ✅ Connection pooling properly configured
- ✅ Performance monitoring in place

## Phase 1 Performance Optimization Achievements (REFERENCE)

### N+1 Query Elimination (99% Success Rate)
```bash
# Tasks 1-3: Fixed N+1 in Tasks handlers and services
grep -r "createTaskMapper\|createTaskMapperBatch" --include="*.ts" lib/tasks/ | head -5

# Tasks 4-6: Fixed N+1 in POV handlers and services  
grep -r "createPOVMapper\|POV.*optimization" --include="*.ts" lib/pov/ | head -5

# Tasks 7-8: Fixed N+1 in Resource Manager and Context Builder
grep -r "resource.*cache\|resource.*discovery.*optimization" --include="*.ts" lib/services/ | head -5

# Tasks 9-12: Fixed N+1 in Activity History and Search
grep -r "batch.*processing\|activity.*optimization" --include="*.ts" lib/ | head -5
```

### Query Mappers Implementation (Factory, Proxy, Strategy Patterns)
```bash
# Core query mappers with lazy loading
echo "=== Query Mapper Patterns ==="
echo "Location: /lib/database/query-mappers.ts"
echo "Factory Pattern: createTaskMapper(), createPOVMapper(), createPhaseMapper()"
echo "Proxy Pattern: Lazy loading with caching for relationships"  
echo "Strategy Pattern: Task loading strategies (minimal, summary, full)"
echo "MinimalSelects: Shared utility for optimized select queries"
echo ""

# Performance monitoring (restored Feb 2026 — was broken since Prisma 6.16+ removed $use)
echo "=== Dev Query Logger (Prisma \$extends API) ==="
echo "Location: /lib/database/dev-query-logger.ts (sole source of truth — the /lib/events/database/dev-query-logger.js orphan was deleted Apr 8 2026 as transitive cleanup during Phase 2 proper / Bug Class 73 eradication)"
echo "Applied in: /lib/prisma.ts via client.\$extends(devQueryLoggerExtension())"
echo "Features: >100ms slow query warnings, N+1 detection (>5 same Model.op in 1s), live getQueryStats()"
echo "Production: identity extension (zero overhead)"
```

### Performance Metrics Achieved
- **Simple Queries**: 0.023ms average (baseline established)
- **Complex Queries**: 0.053ms average (baseline established) 
- **N+1 Reduction**: 99% elimination rate across all handlers and services
- **Connection Pool**: Optimized from 3 → 15 → 25 connections (25 as of Phase 2 proper Apr 8 2026, for 100-user headroom). Connections also tagged with `application_name=paichart-web|paichart-mcp|paichart-<script>` in pg_stat_activity for per-process observability (added Apr 8 2026, plan v4 improvement #1).
- **Resource Discovery**: 80% performance improvement in MCP resource manager
- **Batch Processing**: Implemented for activity history and search operations

### Key Files Added/Modified
- `lib/database/query-mappers.ts` - Advanced query optimization patterns
- `lib/database/dev-query-logger.ts` - Dev query logger via Prisma $extends (slow query + N+1 detection)
- ~~`lib/events/database/dev-query-logger.js`~~ — **DELETED Apr 8 2026** (orphaned transitive cleanup, Phase 2 proper / Bug Class 73). Was only imported by the deleted `lib/prisma.js` via a stale path; the real source is `lib/database/dev-query-logger.ts` (the `lib/events/database/` directory itself no longer exists).
- Multiple handlers in `lib/tasks/`, `lib/pov/`, `lib/services/` - N+1 fixes applied

Use this discovery to establish baseline database health and identify optimization opportunities before making any structural changes.

**Note**: Phase 1 database optimization is complete. Future database work should build on these patterns and maintain the performance baselines established.
---

## Concurrency & Lost-Update Audit (2026-06-09 — BC19/BC47/BC14)

A plain `$transaction()` does NOT prevent lost-update (no row lock at READ COMMITTED). For a read-modify-write
pick: atomic single-statement (`jsonb ||`/`jsonb_set`/`{increment}` — silent), `RepeatableRead`/`Serializable`
wrapped in `withSerializationRetry` (loud→retry), or `FOR UPDATE` (waits). See
`transaction-atomicity-pattern.md` §Retry + the DECISION RULE.

```bash
# 1. Every RR/Serializable site (these abort 40001 under contention → must be atomic, retry-wrapped, or accepted-loud)
grep -rn "isolationLevel" lib/ app/ --include=*.ts | grep -iE "RepeatableRead|Serializable"

# 2. RR/Serializable sites that are NOT wrapped in retry (candidate: wrap, or convert to atomic if simple-merge)
for f in $(grep -rl "isolationLevel.*\(RepeatableRead\|Serializable\)" lib/ app/ --include=*.ts); do
  grep -q "withSerializationRetry" "$f" || echo "UNWRAPPED RR/Serializable (review per the decision rule): $f"
done

# 3. Anti-fork: the serialization predicate must be imported from the ONE source, never re-defined
grep -rn "RETRYABLE_SQLSTATES\|isRetryableSerializationError" lib/ --include=*.ts | grep -v "lib/database/serialization-retry.ts"

# 4. Plain-tx read-then-write smell (findUnique/findFirst + later .update of the same entity, no lock) — BC19 sweep
grep -rln "findUnique\|findFirst" lib/ app/ --include=*.ts | xargs grep -l "\.update(" | grep -v test
# Triage each per-BLOCK: same-entity RMW in one tx with no RR/FOR UPDATE/atomic-expr = racy (see BC19 sweep table).
# BASELINE: 61 files as of 2026-06-12 (all BC19-sweep-triaged). A higher count on a future run = untriaged
# new sites — diff the file list against this baseline run, triage only the additions.

# 5. Raw FOR UPDATE statements must use the REAL table name + no bad casts (the 2026-06-09 "phases"/::uuid bug)
grep -rn "FOR UPDATE" lib/ app/ --include=*.ts -A0 -B2 | grep -iE "FROM |::uuid"
# CUID id columns are text — never cast ${id}::uuid; verify table name (Phase→"Phase", Stage→stages) vs the raw SQL.
```

### SR3 — when to build the serialization circuit-breaker (telemetry-gated, 2026-06-09)

The site-level circuit-breaker for `withSerializationRetry` was DELIBERATELY deferred (perf: telemetry-gated
fast-follow). The `dbLogger` retry/exhaustion telemetry is shipped — IDENTIFY the need from it before building:
```bash
# On prod: retry frequency vs EXHAUSTION rate from lib/database/serialization-retry.ts (module:SerializationRetry)
pm2 logs --nostream --lines 5000 | grep -c "serialization conflict, retrying"   # retries — some is healthy
pm2 logs --nostream --lines 5000 | grep -c "serialization retry exhausted"       # EXHAUSTIONS — the real signal
# Or against a log store: filter domain:db module:SerializationRetry msg:"serialization retry exhausted"
```
**Decision rule:** EXHAUSTIONS (not retries) are the trigger. A non-trivial exhaustion rate = retries aren't
draining contention → build the breaker (mirror `lib/mcp/server/services/service-connection-pool.js`). Zero/near-
zero exhaustions = working as intended, do NOT build it. See cline_docs/BACKLOG-2026-06-session.md §watch-grep.
