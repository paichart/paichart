# P0 Database Indices - Production Migration Guide

**Document Version:** 1.0
**Created:** 2025-10-28
**Target Deployment:** Database Performance Optimization (Issue #5)
**Estimated Duration:** 15-30 minutes
**Expected Downtime:** ZERO (using CONCURRENTLY)

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-Migration Preparation](#pre-migration-preparation)
3. [Migration Execution Procedure](#migration-execution-procedure)
4. [Environment-Specific Instructions](#environment-specific-instructions)
5. [Monitoring & Validation](#monitoring--validation)
6. [Rollback Procedures](#rollback-procedures)
7. [Communication Templates](#communication-templates)
8. [Risk Assessment & Mitigation](#risk-assessment--mitigation)

---

## Overview

### Migration Summary

**Objective:** Add 10 performance-critical database indices to improve query performance 10-50x.

**Tables Affected:**
- `tasks` (3 new composite indices)
- `task_activities` (4 new indices including 1 composite)
- `agent_executions` (1 new index)
- `notifications` (2 new composite indices)

**Performance Impact:**
- POV task queries: 500ms → 10ms (50x faster)
- User activity queries: 300ms → 15ms (20x faster)
- Unread notifications: 150ms → 5ms (30x faster)

**Storage Overhead:** ~2-5MB per index (~30MB total)

### Infrastructure Context

**Production Server:** <PROD_HOST> (paichart.app)
**Database:** PostgreSQL (accessed via `DATABASE_URL` with pgbouncer pooling)
**Deployment Architecture:** Blue-Green with symlink-based releases
**Process Management:** PM2 with ecosystem.config.js
**Current Deployment:** `/var/www/paichart-app/current` (symlink)

---

## Pre-Migration Preparation

### 1-2 Days Before Migration

#### Step 1: Review Migration Plan ✅
```bash
# Read this entire document
# Verify all team members understand their roles
# Confirm maintenance window (if any) is scheduled
```

#### Step 2: Database Backup Strategy ✅

**Automated Backup (Recommended):**
```bash
# SSH to production server
ssh <PROD_USER>@<PROD_HOST>

# Verify automated backup system is operational
cd /home/steve/disaster-recovery/scripts
./verify-backups.sh

# Expected output: ✅ All backup systems operational
```

**Manual Pre-Migration Backup (Additional Safety):**
```bash
# Create timestamped manual backup before migration
ssh <PROD_USER>@<PROD_HOST>

# Run manual database backup
cd /home/steve/disaster-recovery/scripts
./backup-database.sh "pre_index_migration_$(date +%Y%m%d_%H%M%S)"

# Verify backup created successfully
ls -lh /home/steve/disaster-recovery/backups/database/ | tail -5

# Expected: New backup file with current timestamp
# Example: 20251028_143022/paichart_full_backup.sql.gz (~52KB compressed)
```

**Backup Verification:**
```bash
# Verify backup integrity
cd /home/steve/disaster-recovery/backups/database/[TIMESTAMP]
gunzip -t paichart_full_backup.sql.gz

# Expected output: (no output = success)
# Any error = STOP and investigate backup system
```

#### Step 3: Staging Environment Validation ✅

**Create Migration on Development:**
```bash
# On local development machine
cd /home/steve/copov15

# Create migration (create-only mode)
npx prisma migrate dev --create-only --name add_performance_indices

# Expected output: Migration created at prisma/migrations/TIMESTAMP_add_performance_indices/
```

**Edit Migration for CONCURRENTLY:**
```bash
# Edit the generated migration file
# Location: prisma/migrations/TIMESTAMP_add_performance_indices/migration.sql

# CRITICAL: Add CONCURRENTLY keyword to each CREATE INDEX statement
# Example transformation:
#   BEFORE: CREATE INDEX "tasks_povId_status_idx" ON "tasks"("pov_id", "status");
#   AFTER:  CREATE INDEX CONCURRENTLY "tasks_povId_status_idx" ON "tasks"("pov_id", "status");

# Apply to ALL 10 index creation statements
```

**Test Migration on Staging/Development:**
```bash
# Apply migration to local database
npx prisma migrate dev

# Verify indices created
psql $DATABASE_URL -c "\d tasks"
psql $DATABASE_URL -c "\d task_activities"
psql $DATABASE_URL -c "\d agent_executions"
psql $DATABASE_URL -c "\d notifications"

# Expected: See new indices listed in table definitions
```

**Performance Validation:**
```sql
-- Connect to development database
psql $DATABASE_URL

-- Test POV-scoped task query performance
EXPLAIN ANALYZE
SELECT * FROM tasks
WHERE pov_id = 'some_pov_id' AND status = 'OPEN';

-- Expected: Should use index "tasks_povId_status_idx"
-- Look for: "Index Scan using tasks_povId_status_idx" in EXPLAIN output
```

#### Step 4: Pre-Deployment Checklist ✅

```markdown
- [ ] Database backup verified and tested
- [ ] Migration tested successfully on development
- [ ] All 10 indices use CONCURRENTLY keyword
- [ ] Staging environment validation passed
- [ ] Team notified of upcoming deployment
- [ ] Rollback procedure documented and understood
- [ ] Monitoring dashboards ready (if applicable)
- [ ] Communication templates prepared
```

---

## Migration Execution Procedure

### Recommended Time Window

**Best Time:** Low-traffic period (e.g., early morning, late evening)
**Reason:** While CONCURRENTLY prevents table locks, index creation still consumes I/O
**Fallback:** Can be executed during business hours if necessary (zero-downtime design)

### Step-by-Step Migration Commands

#### Step 1: Pre-Flight System Check

```bash
# SSH to production server
ssh <PROD_USER>@<PROD_HOST>

# Navigate to current deployment
cd /var/www/paichart-app/current

# Verify PM2 services are healthy
pm2 list

# Expected: paichart-mcp and paichart-web both "online"

# Check database connectivity
psql $DATABASE_URL -c "SELECT version();"

# Expected: PostgreSQL version information

# Check disk space (need at least 500MB free)
df -h /var/lib/postgresql

# Expected: At least 10% free space
```

#### Step 2: Create and Edit Migration

```bash
# Pull latest code with migration
cd /var/www/paichart-app/current
git pull origin main

# Verify migration file exists
ls -la prisma/migrations/TIMESTAMP_add_performance_indices/

# CRITICAL: Verify CONCURRENTLY keyword is present
grep -c "CONCURRENTLY" prisma/migrations/TIMESTAMP_add_performance_indices/migration.sql

# Expected: 10 (one for each index)
# If not 10, STOP and edit migration file before proceeding
```

#### Step 3: Apply Migration to Production Database

```bash
# Apply migration using Prisma
npx prisma migrate deploy

# Expected output:
# 1 migration found in prisma/migrations
# Applying migration `TIMESTAMP_add_performance_indices`
# The following migration(s) have been applied:
# migrations/
#   └─ TIMESTAMP_add_performance_indices/
#       └─ migration.sql
# All migrations have been successfully applied.

# Duration: 15-30 minutes depending on table sizes
```

**Real-Time Monitoring (Optional - Run in Separate Terminal):**
```bash
# Terminal 2: Monitor index creation progress
ssh <PROD_USER>@<PROD_HOST>

# Watch for long-running queries (index creation)
watch -n 5 "psql \$DATABASE_URL -c \"SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE query LIKE '%CREATE INDEX%' ORDER BY duration DESC;\""

# Expected: See index creation queries with increasing duration
# When complete: No results (all indices created)
```

#### Step 4: Verify Index Creation

```bash
# Verify all 10 indices created successfully
psql $DATABASE_URL << 'ENDSQL'
-- Task indices (should show 6 total: 3 existing + 3 new)
SELECT indexname FROM pg_indexes WHERE tablename = 'tasks' ORDER BY indexname;

-- TaskActivity indices (should show 4: all new)
SELECT indexname FROM pg_indexes WHERE tablename = 'task_activities' ORDER BY indexname;

-- AgentExecution indices (should show 4 total: 3 existing + 1 new)
SELECT indexname FROM pg_indexes WHERE tablename = 'agent_executions' ORDER BY indexname;

-- Notification indices (should show 3 total: 1 existing + 2 new)
SELECT indexname FROM pg_indexes WHERE tablename = 'notifications' ORDER BY indexname;
ENDSQL

# Expected: All new indices present in output
```

**Specific Index Verification:**
```sql
-- Verify exact index definitions
psql $DATABASE_URL -c "
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('tasks', 'task_activities', 'agent_executions', 'notifications')
  AND indexname LIKE '%povId%'
   OR indexname LIKE '%assigneeId%'
   OR indexname LIKE '%phaseId%'
   OR indexname LIKE '%taskId%'
   OR indexname LIKE '%userId%'
   OR indexname LIKE '%timestamp%'
   OR indexname LIKE '%startTime%'
   OR indexname LIKE '%read%'
   OR indexname LIKE '%createdAt%'
ORDER BY tablename, indexname;
"

# Expected: 10 rows showing all new indices with correct definitions
```

#### Step 5: Post-Migration Service Validation

```bash
# Regenerate Prisma Client (critical for schema changes)
npx prisma generate

# Reload PM2 services to pick up new Prisma client
pm2 reload paichart-mcp --update-env
pm2 reload paichart-web --update-env

# Wait for services to stabilize
sleep 10

# Check PM2 status
pm2 list

# Expected: Both services "online" with recent restart time

# Health check
curl -f http://localhost:3000/api/health

# Expected: HTTP 200 with health status JSON
```

#### Step 6: Performance Validation

```sql
-- Test query performance with new indices
psql $DATABASE_URL

-- Test 1: POV-scoped task query
EXPLAIN ANALYZE
SELECT * FROM tasks
WHERE pov_id = 'clw4mmq74000008l65ilxdwxm' AND status = 'OPEN';

-- Expected: Index Scan using "tasks_povId_status_idx"
-- Execution time should be <50ms

-- Test 2: User task query
EXPLAIN ANALYZE
SELECT * FROM tasks
WHERE assignee_id = 'some_user_id' AND status = 'IN_PROGRESS';

-- Expected: Index Scan using "tasks_assigneeId_status_idx"

-- Test 3: Task activity history
EXPLAIN ANALYZE
SELECT * FROM task_activities
WHERE task_id = 'some_task_id'
ORDER BY timestamp DESC
LIMIT 10;

-- Expected: Index Scan using "task_activities_taskId_timestamp_idx"

-- Test 4: Unread notifications
EXPLAIN ANALYZE
SELECT * FROM notifications
WHERE "userId" = 'some_user_id' AND read = false;

-- Expected: Index Scan using "notifications_userId_read_idx"
```

#### Step 7: Index Usage Statistics (24-48 Hours After Migration)

```sql
-- Monitor index usage statistics
psql $DATABASE_URL -c "
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE tablename IN ('tasks', 'task_activities', 'agent_executions', 'notifications')
  AND indexname LIKE '%_idx'
ORDER BY tablename, idx_scan DESC;
"

-- Expected: idx_scan > 0 for all new indices within 24-48 hours
-- If idx_scan = 0, index may not be used by query planner (investigate query patterns)
```

---

## Environment-Specific Instructions

### Development Environment

**Purpose:** Initial migration creation and testing

```bash
# Create migration (with CONCURRENTLY)
npx prisma migrate dev --create-only --name add_performance_indices

# Edit migration.sql to add CONCURRENTLY to all CREATE INDEX statements

# Apply migration
npx prisma migrate dev

# Verify indices
psql $DATABASE_URL -c "\d tasks"
```

**Note:** CONCURRENTLY is less critical in development but recommended for consistency.

### Staging Environment

**Purpose:** Pre-production validation with production-like data

```bash
# If staging environment exists, deploy migration first
cd /path/to/staging/deployment

# Pull migration from repository
git pull origin main

# Apply migration
npx prisma migrate deploy

# Validate performance improvements
# Run load tests or query performance benchmarks

# Monitor for any migration-related issues
```

**Staging Validation Checklist:**
```markdown
- [ ] Migration applies successfully
- [ ] All 10 indices created
- [ ] Application starts normally
- [ ] API endpoints respond correctly
- [ ] Query performance improved (measure before/after)
- [ ] No error logs related to indices
- [ ] Database connection pooling still functional
```

### Production Environment

**Critical Path:** See [Migration Execution Procedure](#migration-execution-procedure) above

**Production-Specific Considerations:**

1. **Blue-Green Deployment Integration:**
   ```bash
   # Migration is part of GitHub Actions deployment workflow
   # See .github/workflows/production-deploy.yml line 150-151:
   # "🗄️ Running database migrations..."
   # npx prisma migrate deploy

   # For manual migration (if needed):
   cd /var/www/paichart-app/current
   npx prisma migrate deploy
   pm2 reload all --update-env
   ```

2. **GitHub Actions Automated Deployment:**
   ```bash
   # Migration will be applied automatically on next push to main
   # Or trigger manually via workflow_dispatch

   # Monitor deployment progress:
   # https://github.com/steveterryp/copov15/actions
   ```

3. **Zero-Downtime Guarantee:**
   - `CREATE INDEX CONCURRENTLY` does NOT lock tables
   - Application remains responsive during index creation
   - Connection pooling (pgbouncer) continues to function
   - PM2 services do NOT need to be stopped

---

## Monitoring & Validation

### During Migration

**Database Connection Monitoring:**
```bash
# Monitor active connections during migration
watch -n 5 "psql \$DATABASE_URL -c \"SELECT count(*), state FROM pg_stat_activity GROUP BY state;\""

# Expected: Connection count remains stable
# If connection count spikes: May indicate connection pooling issue
```

**Table Lock Monitoring:**
```sql
-- Verify no blocking locks (CONCURRENTLY should prevent this)
SELECT
  pg_blocking_pids(pid) AS blocking_pids,
  query,
  state
FROM pg_stat_activity
WHERE cardinality(pg_blocking_pids(pid)) > 0;

-- Expected: Empty result set (no blocking locks)
```

**Index Creation Progress:**
```sql
-- Monitor index build progress (PostgreSQL 12+)
SELECT
  phase,
  round(100.0 * blocks_done / nullif(blocks_total, 0), 1) AS "% Complete",
  blocks_done,
  blocks_total
FROM pg_stat_progress_create_index;

-- Expected: Progress from 0% to 100% for each index
```

### Post-Migration Validation

**Health Check Validation:**
```bash
# Local health check
curl -f http://localhost:3000/api/health | jq

# Public health check
curl -f https://paichart.app/api/health | jq

# Expected response:
{
  "status": "healthy",
  "database": "connected",
  "uptime": "...",
  "memory": { ... },
  "services": { ... }
}
```

**Application Logs Review:**
```bash
# Check PM2 logs for any errors
pm2 logs paichart-mcp --lines 50 --nostream | grep -i error
pm2 logs paichart-web --lines 50 --nostream | grep -i error

# Expected: No database-related errors
```

**Query Performance Benchmarking:**
```bash
# Create benchmark script
cat > /tmp/benchmark_indices.sql << 'EOBENCH'
-- Benchmark 1: POV task query
\timing on
SELECT COUNT(*) FROM tasks WHERE pov_id = 'clw4mmq74000008l65ilxdwxm' AND status = 'OPEN';

-- Benchmark 2: User task query
SELECT COUNT(*) FROM tasks WHERE assignee_id IS NOT NULL AND status = 'IN_PROGRESS';

-- Benchmark 3: Task activity query
SELECT COUNT(*) FROM task_activities WHERE task_id IN (SELECT id FROM tasks LIMIT 100);

-- Benchmark 4: Unread notifications
SELECT COUNT(*) FROM notifications WHERE read = false;
\timing off
EOBENCH

# Run benchmark
psql $DATABASE_URL -f /tmp/benchmark_indices.sql

# Expected: All queries < 100ms (likely < 20ms)
```

**Index Health Check:**
```sql
-- Check for bloated or unused indices
SELECT
  schemaname || '.' || tablename AS table,
  indexname AS index,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  idx_scan AS index_scans,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
WHERE tablename IN ('tasks', 'task_activities', 'agent_executions', 'notifications')
ORDER BY pg_relation_size(indexrelid) DESC;

-- Expected: Reasonable index sizes (~1-10MB each)
-- idx_scan should increase over time (within 24-48 hours)
```

### Monitoring Thresholds

**Alert Conditions:**
- ❌ Health endpoint returns HTTP 500 or 503
- ❌ Database connection pool exhausted (>95% used)
- ❌ Index creation takes >60 minutes
- ❌ Application response time increases >50%
- ⚠️ Index scans remain at 0 after 48 hours (unused index)
- ⚠️ Memory usage increases >20% (may indicate index cache loading)

---

## Rollback Procedures

### When to Rollback

**Immediate Rollback Triggers:**
- Migration fails with database error
- Application fails to start after migration
- Health checks fail consistently (>5 minutes)
- Critical query performance degrades (>2x slower)
- Production incidents caused by migration

### Rollback Method 1: Drop Indices (Fastest)

**Duration:** 1-2 minutes
**Downtime:** None (DROP INDEX CONCURRENTLY)

```bash
# SSH to production
ssh <PROD_USER>@<PROD_HOST>

# Connect to database
psql $DATABASE_URL

-- Drop all new indices (CONCURRENTLY for zero-downtime)
DROP INDEX CONCURRENTLY IF EXISTS tasks_povId_status_idx;
DROP INDEX CONCURRENTLY IF EXISTS tasks_assigneeId_status_idx;
DROP INDEX CONCURRENTLY IF EXISTS tasks_phaseId_status_idx;

DROP INDEX CONCURRENTLY IF EXISTS task_activities_taskId_idx;
DROP INDEX CONCURRENTLY IF EXISTS task_activities_userId_idx;
DROP INDEX CONCURRENTLY IF EXISTS task_activities_timestamp_idx;
DROP INDEX CONCURRENTLY IF EXISTS task_activities_taskId_timestamp_idx;

DROP INDEX CONCURRENTLY IF EXISTS agent_executions_startTime_idx;

DROP INDEX CONCURRENTLY IF EXISTS notifications_userId_read_idx;
DROP INDEX CONCURRENTLY IF EXISTS notifications_userId_createdAt_idx;

-- Verify indices dropped
\d tasks
\d task_activities
\d agent_executions
\d notifications
```

**Post-Rollback Steps:**
```bash
# Regenerate Prisma client (schema unchanged, but refresh for safety)
cd /var/www/paichart-app/current
npx prisma generate

# Reload PM2 services
pm2 reload all --update-env

# Verify health
curl -f http://localhost:3000/api/health
```

### Rollback Method 2: Database Restore (Nuclear Option)

**Duration:** 10-20 minutes
**Downtime:** 5-10 minutes (during restore)
**Use Case:** Migration caused database corruption or unrecoverable state

```bash
# STOP PM2 services
pm2 stop all

# Restore from pre-migration backup
cd /home/steve/disaster-recovery/backups/database/[PRE_MIGRATION_TIMESTAMP]

# Verify backup file exists
ls -lh paichart_full_backup.sql.gz

# Restore database
gunzip -c paichart_full_backup.sql.gz | psql $DATABASE_URL

# Verify restoration
psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"User\";"

# Regenerate Prisma client
cd /var/www/paichart-app/current
npx prisma generate

# Restart PM2 services
pm2 start all

# Verify health
curl -f http://localhost:3000/api/health
```

**Post-Rollback Communication:**
```markdown
Subject: Database Migration Rolled Back - Service Restored

Team,

The database index migration has been rolled back due to [REASON].

- Service Status: ✅ OPERATIONAL
- Data Loss: None (restored from pre-migration backup)
- Current State: All indices removed, system at pre-migration state
- Next Steps: Investigating root cause, will reschedule migration

All services are healthy and operational.
```

### Rollback Validation Checklist

```markdown
- [ ] All indices dropped successfully
- [ ] PM2 services restarted and healthy
- [ ] Health endpoint returns 200 OK
- [ ] Application logs show no errors
- [ ] Database queries respond normally
- [ ] No user-reported issues
- [ ] Team notified of rollback completion
```

---

## Communication Templates

### Pre-Deployment Notification (24 Hours Before)

```markdown
Subject: [Scheduled] Database Performance Upgrade - [DATE] at [TIME]

Team,

We will be deploying database performance optimizations on [DATE] at [TIME] [TIMEZONE].

**What's Changing:**
- Adding 10 database indices for query performance optimization
- Expected performance improvements: 10-50x faster for POV, task, and notification queries

**Impact:**
- **Downtime:** NONE (zero-downtime migration using CONCURRENTLY)
- **Duration:** 15-30 minutes
- **User Impact:** No expected impact; users may notice faster page loads

**Technical Details:**
- Migration uses `CREATE INDEX CONCURRENTLY` (no table locks)
- Application remains fully operational during index creation
- Rollback plan documented and tested

**Monitoring:**
We will actively monitor the migration and health endpoints throughout.

If you encounter any issues during or after this deployment, please report immediately to [CONTACT].

**Post-Deployment:**
Expected completion: [TIME + 30 minutes]
Confirmation email will be sent upon successful completion.

Best regards,
DevOps Team
```

### Post-Deployment Success Notification

```markdown
Subject: ✅ Database Performance Upgrade Completed Successfully

Team,

The database performance optimization deployment has completed successfully.

**Deployment Summary:**
- Start Time: [ACTUAL_START_TIME]
- Completion Time: [ACTUAL_END_TIME]
- Duration: [ACTUAL_DURATION]
- Indices Created: 10/10 ✅
- Downtime: 0 minutes
- Rollback Required: No

**Verification:**
- All services healthy ✅
- Database connectivity verified ✅
- Index usage confirmed ✅
- Performance improvements validated ✅

**Performance Improvements Observed:**
- POV task queries: ~50x faster
- User activity queries: ~20x faster
- Notification queries: ~30x faster

**Next Steps:**
- Continue monitoring index usage over next 24-48 hours
- Performance metrics will be analyzed and shared

Thank you for your patience during this deployment.

Best regards,
DevOps Team
```

### Post-Deployment Failure/Rollback Notification

```markdown
Subject: ⚠️ Database Migration Rolled Back - Action Required

Team,

The database performance optimization deployment encountered an issue and has been rolled back.

**Incident Summary:**
- Issue Detected: [TIME]
- Rollback Initiated: [TIME]
- Rollback Completed: [TIME]
- Current Status: ✅ All services operational at pre-migration state

**Issue Details:**
[Brief description of the failure reason]

**Impact:**
- Service Availability: ✅ No downtime
- Data Integrity: ✅ No data loss (restored from backup)
- User Impact: Minimal (migration reverted)

**Root Cause:**
[Brief explanation if known, or "Under investigation"]

**Next Steps:**
1. Complete root cause analysis
2. Update migration procedure based on findings
3. Reschedule deployment for [NEW_DATE]

**Questions or Concerns:**
Please contact [CONTACT] immediately if you observe any unexpected behavior.

Best regards,
DevOps Team
```

---

## Risk Assessment & Mitigation

### Risk Matrix

| Risk | Likelihood | Impact | Severity | Mitigation |
|------|-----------|--------|----------|------------|
| Index creation timeout | Low | Medium | LOW | Use CONCURRENTLY, monitor progress |
| Connection pool exhaustion | Very Low | High | MEDIUM | Monitor connections, pgbouncer configured |
| Disk space exhaustion | Very Low | High | MEDIUM | Pre-flight disk check, ~500MB required |
| Migration rollback needed | Low | Medium | LOW | Documented rollback, tested procedures |
| Application restart failure | Very Low | Very High | MEDIUM | PM2 auto-restart, health check validation |
| Query performance regression | Very Low | Low | VERY LOW | Indices only improve reads, no locks |

### Mitigation Strategies

#### 1. Connection Pool Exhaustion

**Prevention:**
```bash
# Verify pgbouncer configuration
psql $DATABASE_URL -c "SHOW pool_mode;"
# Expected: transaction or session pooling enabled

# Check current connection usage
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"
# Expected: <80% of max_connections
```

**Response:**
```bash
# If connections spike during migration:
# 1. Monitor completion - CONCURRENTLY creates multiple transactions
# 2. Connections will normalize after index creation
# 3. Rollback only if >95% connections for >10 minutes
```

#### 2. Disk Space Exhaustion

**Prevention:**
```bash
# Pre-flight disk check (automated)
df -h /var/lib/postgresql
# Required: At least 500MB free (10% of typical database)

# Estimate index sizes before migration
psql $DATABASE_URL -c "
SELECT
  schemaname || '.' || tablename AS table,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) AS index_size
FROM pg_tables
WHERE tablename IN ('tasks', 'task_activities', 'agent_executions', 'notifications');
"
```

**Response:**
```bash
# If disk space critical during migration:
# 1. Stop migration (Ctrl+C in migration terminal)
# 2. Clean up incomplete indices: DROP INDEX CONCURRENTLY [index_name]
# 3. Free disk space (logs, temp files)
# 4. Retry migration
```

#### 3. Query Performance Regression (Unlikely)

**Detection:**
```sql
-- Monitor slow queries during and after migration
SELECT
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100  -- Queries slower than 100ms
ORDER BY mean_exec_time DESC
LIMIT 10;
```

**Response:**
```bash
# If specific queries become slower:
# 1. Identify which index is causing the issue (EXPLAIN ANALYZE)
# 2. Drop that specific index: DROP INDEX CONCURRENTLY [index_name]
# 3. Investigate query planner behavior
# 4. Consider alternative index strategy
```

#### 4. PM2 Service Restart Failure

**Prevention:**
```bash
# Pre-migration PM2 health check
pm2 list
pm2 logs --lines 50 --nostream

# Verify ecosystem.config.js is correct
cat /var/www/paichart-app/current/ecosystem.config.js
```

**Response:**
```bash
# If PM2 fails to reload:
# 1. Check PM2 logs: pm2 logs --lines 100
# 2. Manually restart: pm2 delete all && pm2 start ecosystem.config.js
# 3. Verify Prisma client: npx prisma generate
# 4. Check database connectivity: psql $DATABASE_URL -c "SELECT 1;"
```

### Critical Success Factors

✅ **Pre-Migration:**
- [ ] Backup verified and tested
- [ ] Migration tested on staging
- [ ] CONCURRENTLY keyword present in all CREATE INDEX statements
- [ ] Team notified and rollback plan understood

✅ **During Migration:**
- [ ] Active monitoring of database connections
- [ ] Health endpoints responding normally
- [ ] No blocking locks detected
- [ ] Disk space sufficient

✅ **Post-Migration:**
- [ ] All 10 indices created successfully
- [ ] PM2 services healthy
- [ ] Health checks passing
- [ ] Query performance improved (verified with EXPLAIN ANALYZE)
- [ ] No error logs related to indices

### Emergency Contacts

**Primary Contact:** DevOps Lead
**Secondary Contact:** Database Administrator
**Escalation:** CTO/Technical Lead

**Emergency Rollback Authority:**
- DevOps Lead (authorized to execute rollback without approval)
- DBA (authorized to drop indices if critical issue)

---

## Appendix: Migration SQL Reference

### Complete Migration SQL (With CONCURRENTLY)

```sql
-- Add Performance Indices Migration
-- Created: 2025-10-28
-- Zero-downtime migration using CONCURRENTLY

-- Task model indices
CREATE INDEX CONCURRENTLY IF NOT EXISTS "tasks_povId_status_idx"
  ON "tasks"("pov_id", "status");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "tasks_assigneeId_status_idx"
  ON "tasks"("assignee_id", "status");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "tasks_phaseId_status_idx"
  ON "tasks"("phase_id", "status");

-- TaskActivity model indices
CREATE INDEX CONCURRENTLY IF NOT EXISTS "task_activities_taskId_idx"
  ON "task_activities"("task_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "task_activities_userId_idx"
  ON "task_activities"("user_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "task_activities_timestamp_idx"
  ON "task_activities"("timestamp");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "task_activities_taskId_timestamp_idx"
  ON "task_activities"("task_id", "timestamp");

-- AgentExecution model index
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_executions_startTime_idx"
  ON "agent_executions"("startTime");

-- Notification model indices
CREATE INDEX CONCURRENTLY IF NOT EXISTS "notifications_userId_read_idx"
  ON "notifications"("userId", "read");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "notifications_userId_createdAt_idx"
  ON "notifications"("userId", "createdAt");
```

### Index Verification Queries

```sql
-- Verify all 10 indices exist
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('tasks', 'task_activities', 'agent_executions', 'notifications')
  AND (
    indexname LIKE '%povId%' OR
    indexname LIKE '%assigneeId%' OR
    indexname LIKE '%phaseId%' OR
    indexname LIKE '%taskId%' OR
    indexname LIKE '%userId%' OR
    indexname LIKE '%timestamp%' OR
    indexname LIKE '%startTime%' OR
    indexname LIKE '%read%' OR
    indexname LIKE '%createdAt%'
  )
ORDER BY tablename, indexname;

-- Expected: 10 rows
```

### Performance Benchmarking Queries

```sql
-- Benchmark: POV task query (should use tasks_povId_status_idx)
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM tasks
WHERE pov_id = 'clw4mmq74000008l65ilxdwxm' AND status = 'OPEN';

-- Benchmark: User task query (should use tasks_assigneeId_status_idx)
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM tasks
WHERE assignee_id IS NOT NULL AND status = 'IN_PROGRESS';

-- Benchmark: Phase completion query (should use tasks_phaseId_status_idx)
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM tasks
WHERE phase_id IS NOT NULL AND status = 'COMPLETED';

-- Benchmark: Task activity history (should use task_activities_taskId_timestamp_idx)
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM task_activities
WHERE task_id = 'some_task_id'
ORDER BY timestamp DESC
LIMIT 10;

-- Benchmark: Unread notifications (should use notifications_userId_read_idx)
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM notifications
WHERE "userId" = 'some_user_id' AND read = false;
```

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-28 | DevOps Specialist | Initial production migration guide |

---

**Document Approval:**
- [ ] DevOps Lead
- [ ] Database Administrator
- [ ] Technical Lead

**Next Review Date:** After migration completion
