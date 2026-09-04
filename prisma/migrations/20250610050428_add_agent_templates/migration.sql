-- CreateEnum
CREATE TYPE "MCPToolStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "MCPAuthType" AS ENUM ('API_KEY', 'BEARER_TOKEN', 'OAUTH2', 'HMAC', 'NONE');

-- CreateEnum
CREATE TYPE "MCPAction" AS ENUM ('ANALYZE_TASK', 'OPTIMIZE_WORKFLOW', 'GENERATE_CONTENT', 'VALIDATE_DATA', 'PREDICT_OUTCOME', 'RECOMMEND_ACTION', 'AUTOMATE_PROCESS', 'MONITOR_PERFORMANCE', 'CREATE_TASK', 'UPDATE_TASK', 'DELETE_TASK', 'GET_CONTEXT', 'EXECUTE_WORKFLOW', 'GENERATE_REPORT');

-- CreateEnum
CREATE TYPE "MCPInteractionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "MCPWorkflowStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DISABLED', 'ERROR');

-- CreateEnum
CREATE TYPE "MCPWorkflowExecutionStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "MCPRecommendationType" AS ENUM ('OPTIMIZATION', 'AUTOMATION', 'QUALITY_IMPROVEMENT', 'RISK_MITIGATION', 'PERFORMANCE_ENHANCEMENT', 'COST_REDUCTION', 'WORKFLOW_IMPROVEMENT', 'RESOURCE_ALLOCATION');

-- CreateEnum
CREATE TYPE "MCPImpact" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "MCPEffort" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "MCPRecommendationStatus" AS ENUM ('PENDING', 'REVIEWED', 'APPROVED', 'IMPLEMENTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AgentCategory" AS ENUM ('GENERAL', 'DEVELOPMENT', 'TESTING', 'DOCUMENTATION', 'ANALYSIS', 'AUTOMATION', 'REVIEW', 'DEPLOYMENT', 'MONITORING', 'SECURITY');

-- CreateEnum
CREATE TYPE "AgentPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "AgentTemplateStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DEPRECATED', 'DRAFT');

-- CreateEnum
CREATE TYPE "AgentComplexity" AS ENUM ('SIMPLE', 'MEDIUM', 'COMPLEX', 'EXPERT');

-- AlterTable
ALTER TABLE "agent_executions" ADD COLUMN     "agentTemplateId" TEXT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "agentTemplateId" TEXT,
ADD COLUMN     "mcpContext" JSONB,
ADD COLUMN     "mcpMetadata" JSONB,
ADD COLUMN     "mcpToolId" TEXT,
ADD COLUMN     "mcpWorkflowId" TEXT;

-- CreateTable
CREATE TABLE "agent_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "AgentCategory" NOT NULL DEFAULT 'GENERAL',
    "defaultRole" TEXT NOT NULL,
    "promptTemplate" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL,
    "constraints" JSONB NOT NULL,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "timeout" INTEGER NOT NULL DEFAULT 300,
    "priority" "AgentPriority" NOT NULL DEFAULT 'MEDIUM',
    "inputSchema" JSONB,
    "outputSchema" JSONB,
    "contextTemplate" JSONB,
    "metadata" JSONB,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "status" "AgentTemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "successRate" DOUBLE PRECISION,
    "averageTime" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "agent_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_prompt_library" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "AgentCategory" NOT NULL,
    "promptText" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "examples" JSONB NOT NULL,
    "useCase" TEXT NOT NULL,
    "complexity" "AgentComplexity" NOT NULL DEFAULT 'MEDIUM',
    "estimatedTime" INTEGER,
    "rating" DOUBLE PRECISION,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "successRate" DOUBLE PRECISION,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "status" "AgentTemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "agent_prompt_library_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_tools" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL,
    "configuration" JSONB NOT NULL,
    "status" "MCPToolStatus" NOT NULL DEFAULT 'ACTIVE',
    "authType" "MCPAuthType" NOT NULL DEFAULT 'API_KEY',
    "credentials" JSONB NOT NULL,
    "permissions" JSONB NOT NULL,
    "lastHeartbeat" TIMESTAMP(3),
    "responseTime" DOUBLE PRECISION,
    "successRate" DOUBLE PRECISION,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_interactions" (
    "id" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "taskId" TEXT,
    "povId" TEXT,
    "action" "MCPAction" NOT NULL,
    "request" JSONB NOT NULL,
    "response" JSONB,
    "status" "MCPInteractionStatus" NOT NULL DEFAULT 'PENDING',
    "context" JSONB,
    "metadata" JSONB,
    "executionTime" INTEGER,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_workflows" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "toolId" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "triggers" JSONB NOT NULL,
    "schedule" JSONB,
    "status" "MCPWorkflowStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastExecution" TIMESTAMP(3),
    "nextExecution" TIMESTAMP(3),
    "executionCount" INTEGER NOT NULL DEFAULT 0,
    "successRate" DOUBLE PRECISION,
    "averageTime" DOUBLE PRECISION,
    "errorRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_workflow_executions" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "status" "MCPWorkflowExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "duration" INTEGER,
    "input" JSONB,
    "output" JSONB,
    "steps" JSONB NOT NULL,
    "error" TEXT,
    "failedStep" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_workflow_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_recommendations" (
    "id" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "taskId" TEXT,
    "povId" TEXT,
    "type" "MCPRecommendationType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "impact" "MCPImpact" NOT NULL,
    "effort" "MCPEffort" NOT NULL,
    "actions" JSONB NOT NULL,
    "parameters" JSONB NOT NULL,
    "context" JSONB NOT NULL,
    "status" "MCPRecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "implementedAt" TIMESTAMP(3),
    "implementedBy" TEXT,
    "feedback" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_templates_category_idx" ON "agent_templates"("category");

-- CreateIndex
CREATE INDEX "agent_templates_status_idx" ON "agent_templates"("status");

-- CreateIndex
CREATE INDEX "agent_templates_isDefault_idx" ON "agent_templates"("isDefault");

-- CreateIndex
CREATE INDEX "agent_prompt_library_category_idx" ON "agent_prompt_library"("category");

-- CreateIndex
CREATE INDEX "agent_prompt_library_complexity_idx" ON "agent_prompt_library"("complexity");

-- CreateIndex
CREATE INDEX "agent_prompt_library_status_idx" ON "agent_prompt_library"("status");

-- CreateIndex
CREATE INDEX "agent_prompt_library_isPublic_idx" ON "agent_prompt_library"("isPublic");

-- CreateIndex
CREATE INDEX "mcp_tools_status_idx" ON "mcp_tools"("status");

-- CreateIndex
CREATE INDEX "mcp_tools_name_idx" ON "mcp_tools"("name");

-- CreateIndex
CREATE INDEX "mcp_interactions_toolId_idx" ON "mcp_interactions"("toolId");

-- CreateIndex
CREATE INDEX "mcp_interactions_taskId_idx" ON "mcp_interactions"("taskId");

-- CreateIndex
CREATE INDEX "mcp_interactions_povId_idx" ON "mcp_interactions"("povId");

-- CreateIndex
CREATE INDEX "mcp_interactions_status_idx" ON "mcp_interactions"("status");

-- CreateIndex
CREATE INDEX "mcp_interactions_action_idx" ON "mcp_interactions"("action");

-- CreateIndex
CREATE INDEX "mcp_workflows_toolId_idx" ON "mcp_workflows"("toolId");

-- CreateIndex
CREATE INDEX "mcp_workflows_status_idx" ON "mcp_workflows"("status");

-- CreateIndex
CREATE INDEX "mcp_workflow_executions_workflowId_idx" ON "mcp_workflow_executions"("workflowId");

-- CreateIndex
CREATE INDEX "mcp_workflow_executions_status_idx" ON "mcp_workflow_executions"("status");

-- CreateIndex
CREATE INDEX "mcp_workflow_executions_startTime_idx" ON "mcp_workflow_executions"("startTime");

-- CreateIndex
CREATE INDEX "mcp_recommendations_toolId_idx" ON "mcp_recommendations"("toolId");

-- CreateIndex
CREATE INDEX "mcp_recommendations_taskId_idx" ON "mcp_recommendations"("taskId");

-- CreateIndex
CREATE INDEX "mcp_recommendations_povId_idx" ON "mcp_recommendations"("povId");

-- CreateIndex
CREATE INDEX "mcp_recommendations_type_idx" ON "mcp_recommendations"("type");

-- CreateIndex
CREATE INDEX "mcp_recommendations_status_idx" ON "mcp_recommendations"("status");

-- CreateIndex
CREATE INDEX "agent_executions_agentTemplateId_idx" ON "agent_executions"("agentTemplateId");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_agentTemplateId_fkey" FOREIGN KEY ("agentTemplateId") REFERENCES "agent_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_executions" ADD CONSTRAINT "agent_executions_agentTemplateId_fkey" FOREIGN KEY ("agentTemplateId") REFERENCES "agent_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_interactions" ADD CONSTRAINT "mcp_interactions_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "mcp_tools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_interactions" ADD CONSTRAINT "mcp_interactions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_interactions" ADD CONSTRAINT "mcp_interactions_povId_fkey" FOREIGN KEY ("povId") REFERENCES "POV"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_workflows" ADD CONSTRAINT "mcp_workflows_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "mcp_tools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_workflow_executions" ADD CONSTRAINT "mcp_workflow_executions_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "mcp_workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_recommendations" ADD CONSTRAINT "mcp_recommendations_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "mcp_tools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_recommendations" ADD CONSTRAINT "mcp_recommendations_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_recommendations" ADD CONSTRAINT "mcp_recommendations_povId_fkey" FOREIGN KEY ("povId") REFERENCES "POV"("id") ON DELETE SET NULL ON UPDATE CASCADE;
