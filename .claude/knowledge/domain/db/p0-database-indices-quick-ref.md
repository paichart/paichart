# P0 Database Indices Migration - Quick Reference Card

**Print this page for emergency use during migration**

---

## Pre-Migration Checklist

```bash
# 1. SSH to production
ssh <PROD_USER>@<PROD_HOST>

# 2. Verify backup system operational
cd /home/steve/disaster-recovery/scripts && ./verify-backups.sh

# 3. Create manual pre-migration backup
./backup-database.sh "pre_index_migration_$(date +%Y%m%d_%H%M%S)"

# 4. Verify disk space (need 500MB free)
df -h /var/lib/postgresql

# 5. Check PM2 services healthy
pm2 list
```

---

## Migration Commands

```bash
# Navigate to deployment directory
cd /var/www/paichart-app/current

# Pull latest code with migration
git pull origin main

# CRITICAL: Verify CONCURRENTLY keyword (must be 10)
grep -c "CONCURRENTLY" prisma/migrations/*/migration.sql

# Apply migration (15-30 minutes)
npx prisma migrate deploy

# Regenerate Prisma client
npx prisma generate

# Reload PM2 services
pm2 reload paichart-mcp --update-env
pm2 reload paichart-web --update-env

# Verify health
curl -f http://localhost:3000/api/health
```

---

## Validation Queries

```sql
-- Count total indices (expected: 17 = 7 existing + 10 new)
SELECT COUNT(*) FROM pg_indexes
WHERE tablename IN ('tasks', 'task_activities', 'agent_executions', 'notifications')
  AND indexname LIKE '%_idx';

-- List all new indices
SELECT tablename, indexname FROM pg_indexes
WHERE tablename IN ('tasks', 'task_activities', 'agent_executions', 'notifications')
  AND indexname LIKE '%_idx'
ORDER BY tablename, indexname;

-- Test POV query performance (should use tasks_povId_status_idx)
EXPLAIN ANALYZE SELECT * FROM tasks
WHERE pov_id = 'clw4mmq74000008l65ilxdwxm' AND status = 'OPEN';
```

---

## Emergency Rollback

```sql
-- Drop all new indices (CONCURRENTLY = zero-downtime)
psql $DATABASE_URL << 'ENDSQL'
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
ENDSQL
```

```bash
# Reload services after rollback
pm2 reload all --update-env
curl -f http://localhost:3000/api/health
```

---

## Monitoring Commands

```bash
# Watch index creation progress
watch -n 5 "psql \$DATABASE_URL -c \"SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE query LIKE '%CREATE INDEX%';\""

# Monitor database connections
watch -n 5 "psql \$DATABASE_URL -c \"SELECT count(*), state FROM pg_stat_activity GROUP BY state;\""

# Check PM2 logs for errors
pm2 logs --lines 50 --nostream | grep -i error

# Check health endpoint
curl -f http://localhost:3000/api/health | jq
```

---

## Rollback Triggers

**Rollback Immediately If:**
- Migration fails with database error
- Health checks fail for >5 minutes
- Query performance degrades >2x
- Production incidents occur

**Rollback Method:** Drop indices (see above) - 1-2 minutes, zero-downtime

---

## Expected Timeline

| Phase | Duration |
|-------|----------|
| Pre-Flight Checks | 5 minutes |
| Migration Execution | 15-30 minutes |
| Validation | 5 minutes |
| **Total** | **25-40 minutes** |

**Expected Downtime:** ZERO (CONCURRENTLY = no table locks)

---

## Success Criteria

- ✅ All 10 indices created successfully
- ✅ PM2 services remain online
- ✅ Health endpoint returns 200 OK
- ✅ Query performance improved (EXPLAIN ANALYZE shows index usage)
- ✅ No error logs related to indices

---

## Emergency Contacts

**Primary:** DevOps Lead
**Secondary:** Database Administrator
**Escalation:** CTO/Technical Lead

**Emergency Authority:** DevOps Lead authorized to rollback without approval

---

## Production Server Details

**Host:** <PROD_HOST> (paichart.app)
**Deployment:** `/var/www/paichart-app/current` (blue-green symlink)
**Database:** PostgreSQL with pgbouncer pooling
**Services:** PM2 (paichart-mcp, paichart-web)
**Backup Location:** `/home/steve/disaster-recovery/backups/database/`

---

**For Complete Guide:** `/home/steve/copov15/cline_docs/p0-database-indices-production-migration-guide.md`
