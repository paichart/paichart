/**
 * Comprehensive Task types for service layer operations
 * 
 * This file provides feature-complete domain models optimized for:
 * - Task services and business logic operations
 * - AI agent integration and execution
 * - Enhanced APIs with activity logging
 * - Complex task relationships and dependencies
 * 
 * For simple API responses and dashboard views, use:
 * @see lib/types/task.ts
 */

import { TaskType as PrismaTaskType } from '@prisma/client';

export enum TaskPriority {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum TaskStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  BLOCKED = 'BLOCKED',
}

// Re-export the TaskType enum from Prisma
export { PrismaTaskType as TaskType };

export interface TaskDependency {
  id: string;
  taskId: string;
  dependsOnId: string;
  dependsOn?: Task;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  assigneeId: string | null;
  assignee?: {
    id: string;
    name: string;
    email: string;
  } | null;
  teamId: string | null;
  povId: string | null;
  phaseId: string | null;
  phase?: {
    id: string;
    name: string;
    type?: string;
    order?: number;
  } | null;
  stageId: string | null;
  stage?: {
    id: string;
    name: string;
    order?: number;
  } | null;
  dueDate: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  type: PrismaTaskType; // Add the TaskType field
  
  // AI-Driven Development Fields
  agentRole?: string | null;
  agentTemplateId?: string | null; // CRITICAL FIX: Missing field that breaks template loading
  agentTemplate?: any | null; // The full agent template object
  prompt?: string | null;
  inputContext?: any | null;
  outputArtifacts?: any | null;
  executionStatus?: string | null;
  agentLog?: string | null;
  maxRetries?: number | null;
  timeout?: number | null;
  
  // MCP (Model Context Protocol) Unified Storage Fields
  mcpContext?: {
    agentRole?: string;
    executionType?: string;
    sessionId?: string;
    preserveContext?: string;
    tools?: Array<{
      id: string;
      name: string;
      serverName: string;
    }>;
    workflow?: {
      phases?: Record<string, string>;
      executionOrder?: string[];
      parallelExecution?: boolean;
      errorHandling?: string;
    };
    successMetrics?: string[];
    configuredVia?: string;
    configuredAt?: string;
    version?: string;
  } | null;
  
  mcpMetadata?: {
    actionId?: string;
    configuredAt?: string;
    availableTools?: Array<{
      serverName: string;
      tools: string[];
    }>;
    migrationSource?: string;
    integrationStatus?: string;
    originalParameters?: {
      mcpTools?: string[];
      workflow?: Record<string, string>;
      executionType?: string;
      successMetrics?: string[];
    };
  } | null;
  
  mcpToolId?: string | null;
  mcpWorkflowId?: string | null;
  
  // Parent-Child Relationship
  parentTaskId?: string | null;
  subTasks?: Task[];
  
  // Dependencies
  dependencies?: TaskDependency[];
  dependents?: TaskDependency[];
  
  // Legacy metadata (for backward compatibility)
  metadata?: {
    type?: string;
    managerName?: string;
    dependencies?: any[];
    [key: string]: any;
  };
  
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskData {
  title: string;
  description?: string;
  assigneeId?: string;
  teamId?: string;
  povId?: string;
  phaseId?: string;
  stageId?: string;
  order?: number; // FIXED: Add missing order field for task positioning
  dueDate?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  type?: PrismaTaskType; // Add the TaskType field
  
  // AI-Driven Development Fields
  agentRole?: string;
  agentTemplateId?: string; // CRITICAL FIX: Missing field for template assignment
  prompt?: string;
  inputContext?: any;
  outputArtifacts?: any;
  executionStatus?: string;
  agentLog?: string;
  maxRetries?: number;
  timeout?: number;
  
  // MCP (Model Context Protocol) Fields
  mcpContext?: any;
  mcpToolId?: string;
  mcpWorkflowId?: string;
  mcpMetadata?: any;
  
  // Parent-Child Relationship
  parentTaskId?: string;
  
  // Dependencies
  dependencyIds?: string[];
  
  // Legacy metadata
  metadata?: any;

  // Tags + estimated hours — declared in CreateTaskSchema (2026-05-14
  // BC76 fix). Adding to the type so validation.data is assignable
  // without an `as any` cast that would defeat the bypass-fix purpose.
  tags?: string[];
  estimatedHours?: number;
}

export interface UpdateTaskData extends Partial<CreateTaskData> {}

export interface TaskResponse {
  data: Task;
}

export interface TaskListResponse {
  data: Task[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
  _performance?: { queryTimeMs: number; optimized: boolean; queriesUsed: number };
}
