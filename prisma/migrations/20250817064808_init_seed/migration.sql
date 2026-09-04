-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AgentCategory" ADD VALUE 'MCP_SERVICE_REGISTRY';
ALTER TYPE "AgentCategory" ADD VALUE 'MCP_SERVICE_DISCOVERY';
ALTER TYPE "AgentCategory" ADD VALUE 'MCP_SERVICE_INTEGRATION';
ALTER TYPE "AgentCategory" ADD VALUE 'MCP_SERVICE_QA';
ALTER TYPE "AgentCategory" ADD VALUE 'MCP_ORCHESTRATION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TaskType" ADD VALUE 'MCP_SERVICE_REGISTRATION';
ALTER TYPE "TaskType" ADD VALUE 'MCP_SERVICE_DISCOVERY';
ALTER TYPE "TaskType" ADD VALUE 'MCP_SERVICE_TEST';
ALTER TYPE "TaskType" ADD VALUE 'MCP_SERVICE_INTEGRATION';

-- DropIndex
DROP INDEX "idx_agent_executions_status_updated";
