-- Add text search indices for ChatGPT connector optimization
-- These indices improve search performance across POVs, tasks, phases, stages, and executions

-- POV full-text search index
CREATE INDEX IF NOT EXISTS idx_pov_fulltext
  ON "POV" USING gin(to_tsvector('english',
    COALESCE(title, '') || ' ' ||
    COALESCE(description, '') || ' ' ||
    COALESCE(objective, '')
  ));

-- Phase search index
CREATE INDEX IF NOT EXISTS idx_phase_search
  ON "Phase" USING gin(to_tsvector('english',
    COALESCE(name, '') || ' ' ||
    COALESCE(description, '')
  ));

-- Stage search index
CREATE INDEX IF NOT EXISTS idx_stage_search
  ON "stages" USING gin(to_tsvector('english',
    COALESCE(name, '') || ' ' ||
    COALESCE(description, '')
  ));

-- Task search index
CREATE INDEX IF NOT EXISTS idx_task_search
  ON "tasks" USING gin(to_tsvector('english',
    COALESCE(title, '') || ' ' ||
    COALESCE(description, '')
  ));

-- Agent execution search index (for logs)
-- Note: logs is an array, using GIN index directly on array
CREATE INDEX IF NOT EXISTS idx_execution_logs
  ON "agent_executions" USING gin(logs);

-- Performance indices for hierarchical relationships
-- These speed up joins when searching across related entities

-- Phase to POV relationship
CREATE INDEX IF NOT EXISTS idx_phase_pov
  ON "Phase"("povId");

-- Stage to Phase relationship
CREATE INDEX IF NOT EXISTS idx_stage_phase
  ON "stages"("phaseId");

-- Task to Stage relationship
CREATE INDEX IF NOT EXISTS idx_task_stage
  ON "tasks"(stage_id);

-- Task to Phase relationship (direct relationship)
CREATE INDEX IF NOT EXISTS idx_task_phase
  ON "tasks"(phase_id);

-- Task to POV relationship (direct relationship)
CREATE INDEX IF NOT EXISTS idx_task_pov
  ON "tasks"(pov_id);

-- Execution to Task relationship
CREATE INDEX IF NOT EXISTS idx_execution_task
  ON "agent_executions"("taskId");

-- Agent template search index
CREATE INDEX IF NOT EXISTS idx_agent_template_search
  ON "agent_templates" USING gin(to_tsvector('english',
    COALESCE(name, '') || ' ' ||
    COALESCE(description, '') || ' ' ||
    COALESCE("promptTemplate", '') || ' ' ||
    COALESCE("defaultRole", '')
  ));

-- Additional performance indices for common query patterns

-- POV status and date filtering
CREATE INDEX IF NOT EXISTS idx_pov_status_updated
  ON "POV"(status, "updatedAt" DESC);

-- Task status and priority filtering
CREATE INDEX IF NOT EXISTS idx_task_status_priority
  ON "tasks"(status, priority, updated_at DESC);

-- Agent execution status and date filtering
CREATE INDEX IF NOT EXISTS idx_execution_status_date
  ON "agent_executions"(status, "createdAt" DESC);

-- Template category and status filtering
CREATE INDEX IF NOT EXISTS idx_template_category_status
  ON "agent_templates"(category, status);