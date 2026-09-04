-- CreatePerformanceIndices
-- P0 Database Optimization: Add 10 performance indices for POV-scoped queries
-- Created: 2025-10-28
-- NOTE: CONCURRENTLY removed for UAT compatibility (production already has these indices)

-- Task Model Indices (3)
CREATE INDEX IF NOT EXISTS "tasks_povId_status_idx" ON "tasks"("pov_id", "status");
CREATE INDEX IF NOT EXISTS "tasks_assigneeId_status_idx" ON "tasks"("assignee_id", "status");
CREATE INDEX IF NOT EXISTS "tasks_phaseId_status_idx" ON "tasks"("phase_id", "status");

-- TaskActivity Model Indices (4)
CREATE INDEX IF NOT EXISTS "task_activities_taskId_idx" ON "task_activities"("task_id");
CREATE INDEX IF NOT EXISTS "task_activities_userId_idx" ON "task_activities"("user_id");
CREATE INDEX IF NOT EXISTS "task_activities_timestamp_idx" ON "task_activities"("timestamp");
CREATE INDEX IF NOT EXISTS "task_activities_taskId_timestamp_idx" ON "task_activities"("task_id", "timestamp");

-- AgentExecution Model Index (1)
CREATE INDEX IF NOT EXISTS "agent_executions_startTime_idx" ON "agent_executions"("startTime");

-- Notification Model Indices (2)
CREATE INDEX IF NOT EXISTS "notifications_userId_read_idx" ON "notifications"("userId", "read");
CREATE INDEX IF NOT EXISTS "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");
