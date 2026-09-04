-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'READY', 'RUNNING', 'PENDING_REVIEW', 'REVIEW_APPROVED', 'REVIEW_REJECTED', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "task_dependencies" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "dependsOnId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "agentRole" TEXT,
                    ADD COLUMN "prompt" TEXT,
                    ADD COLUMN "inputContext" JSONB,
                    ADD COLUMN "outputArtifacts" JSONB,
                    ADD COLUMN "executionStatus" "ExecutionStatus" DEFAULT 'PENDING',
                    ADD COLUMN "agentLog" TEXT,
                    ADD COLUMN "maxRetries" INTEGER DEFAULT 3,
                    ADD COLUMN "timeout" INTEGER,
                    ADD COLUMN "parentTaskId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "task_dependencies_taskId_dependsOnId_key" ON "task_dependencies"("taskId", "dependsOnId");

-- CreateIndex
CREATE INDEX "task_dependencies_taskId_idx" ON "task_dependencies"("taskId");

-- CreateIndex
CREATE INDEX "task_dependencies_dependsOnId_idx" ON "task_dependencies"("dependsOnId");

-- CreateIndex
CREATE INDEX "tasks_executionStatus_idx" ON "tasks"("executionStatus");

-- CreateIndex
CREATE INDEX "tasks_parentTaskId_idx" ON "tasks"("parentTaskId");

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migration function to move dependencies from metadata to the new table
CREATE OR REPLACE FUNCTION migrate_task_dependencies()
RETURNS void AS $$
DECLARE
    task_record RECORD;
    dependency RECORD;
    dependency_data JSONB;
BEGIN
    FOR task_record IN SELECT id, metadata FROM tasks WHERE metadata IS NOT NULL AND metadata ? 'dependencies' LOOP
        dependency_data := task_record.metadata->'dependencies';
        
        IF jsonb_typeof(dependency_data) = 'array' THEN
            FOR dependency IN SELECT * FROM jsonb_array_elements(dependency_data) LOOP
                IF dependency.value ? 'taskId' THEN
                    INSERT INTO task_dependencies ("id", "taskId", "dependsOnId", "createdAt")
                    VALUES (
                        gen_random_uuid()::text, 
                        task_record.id, 
                        dependency.value->>'taskId',
                        CURRENT_TIMESTAMP
                    )
                    ON CONFLICT ("taskId", "dependsOnId") DO NOTHING;
                END IF;
            END LOOP;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute the migration function
SELECT migrate_task_dependencies();

-- Drop the migration function after use
DROP FUNCTION migrate_task_dependencies();