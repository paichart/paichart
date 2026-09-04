import { PhaseType, StageStatus, TaskStatus, TaskType, TaskPriority } from '@prisma/client';
import { LLMProvider } from '@/lib/services/llm/types';

/**
 * Interface for a Phase entity
 */
export interface Phase {
  id: string;
  name: string;
  description: string;
  type: PhaseType;
  startDate?: string;
  endDate?: string;
  order: number;
  // Other phase fields
}

/**
 * Interface for a Stage entity
 */
export interface Stage {
  id: string;
  name: string;
  description?: string;
  status: StageStatus;
  order: number;
  phaseId?: string;
  // Other stage fields
}

/**
 * Type for agent execution status
 */
export type ExecutionStatus = 
  | 'PENDING'
  | 'READY'
  | 'RUNNING'
  | 'PENDING_REVIEW'
  | 'REVIEW_APPROVED'
  | 'REVIEW_REJECTED'
  | 'SUCCESS'
  | 'FAILED';

/**
 * Interface for an artifact produced by an agent
 */
export interface Artifact {
  id: string;
  name: string;
  type: string;
  content: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

/**
 * Interface for model parameters
 */
export interface ModelParameters {
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  stopSequences: string[];
  useSystemPrompt: boolean;
  systemPrompt: string;
  webSearch?: {
    maxUses?: number;
    allowedDomains?: string[];
    blockedDomains?: string[];
    userLocation?: {
      type: 'approximate';
      city: string;
      region: string;
      country: string;
      timezone: string;
    };
  };
  stream?: boolean;
  cacheControl?: { type: 'ephemeral' } | false | null; // false = explicit opt-out; null/absent = platform default (ON since Finding G 2026-07-08)
  thinkingBudgetTokens?: number;
}

/**
 * Interface for a task dependency edge.
 * Matches the shape returned by `taskFullSelect` in `lib/tasks/prisma/select.ts`.
 */
export interface TaskDependency {
  id: string;
  taskId: string;
  dependsOnId: string;
  dependsOn: {
    id: string;
    title: string;
    status: TaskStatus;
    stageId?: string;
  };
}

/**
 * Reverse edge — tasks that depend on this one. From the join table's POV the
 * embedded relation is `task` (the dependent), not `dependsOn`.
 */
export interface TaskDependent {
  id: string;
  taskId: string;
  dependsOnId: string;
  task: {
    id: string;
    title: string;
    status: TaskStatus;
    stageId?: string;
  };
}

/**
 * Interface for a Task entity
 */
export interface Task {
  id: string;
  title: string; // Note: Using title instead of name as per schema
  description?: string;
  status: TaskStatus;
  type: TaskType;
  priority: TaskPriority;
  assigneeId?: string;
  assignee?: { id: string; name: string; email: string }; // 🔧 FIX: Add assignee object
  dueDate?: string;
  povId?: string;    // 2026-04-20: needed by PipelineTab to call the pipeline-context endpoint
  phaseId?: string;
  stageId?: string;
  order: number;
  dependencies?: TaskDependency[]; // Object edges from taskFullSelect
  dependents?: TaskDependent[];    // Reverse edges — tasks blocked by this one
  
  // Agent capabilities
  agentRole?: string;
  agentTemplateId?: string; // ID of the agent template used for this task
  agentTemplate?: any; // The full agent template object
  prompt?: string;
  inputContext?: any;
  outputArtifacts?: Artifact[];
  executionStatus?: ExecutionStatus;
  agentLog?: string;
  maxRetries?: number;
  timeout?: number;
  
  // Advanced model parameters
  modelParameters?: ModelParameters;
  
  // MCP (Model Context Protocol) fields
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
  };
  
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
  };
  
  mcpToolId?: string;
  mcpWorkflowId?: string;
  
  // Metadata field for storing additional data
  metadata?: Record<string, any>;
  
  // Comments
  comments?: Array<{
    id: string;
    text: string;
    createdAt: string;
    user: { id: string; name: string; email: string };
  }>;
  
  // Other task fields
}

/**
 * Interface for a TeamMember entity
 */
export interface TeamMember {
  id: string;
  userId: string;
  role: string;
  name: string;
  email?: string;
  phone?: string;
  // Other team member fields
}

/**
 * Interface for a KPI entity
 */
export interface KPI {
  id: string;
  name: string;
  target: any;
  current: any;
  templateId?: string;
  weight?: number;
}
