import { Prisma } from '@prisma/client';

// User select (duplicated to avoid circular dependency with POV module)
const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true
} as const;

// Agent runtime fields — the 8 columns the task-edit Agent tab (Prompt /
// Artifacts / Monitoring sub-tabs) reads to render agent execution state.
// Historically duplicated across 5+ select sites (app/api/tasks, lib/tasks
// handlers/services, lib/database query-mappers, lib/pov services). Keeping
// the set in one place prevents the "Artifacts tab blank despite DB populated"
// regression class observed on 2026-04-15 (fix in lib/pov/services/pov.ts was
// adding outputArtifacts/agentLog to a select that had drifted from the rest).
// MCP-specific fields (mcpContext, mcpMetadata, etc.) are intentionally OUT
// of scope here — callers that need them splat them inline alongside this.
export const taskAgentRuntimeFields = {
  agentRole: true,
  prompt: true,
  inputContext: true,
  outputArtifacts: true,
  executionStatus: true,
  agentLog: true,
  maxRetries: true,
  timeout: true,
} as const;

// Basic task fields
const taskBasicFields = {
  id: true,
  title: true,
  description: true,
  assigneeId: true,
  teamId: true,
  povId: true,
  phaseId: true,
  stageId: true,
  order: true, // CRITICAL FIX: Add missing order field
  dueDate: true,
  priority: true,
  status: true,
  type: true, // Add the missing type field
  metadata: true,
  createdAt: true,
  updatedAt: true,
  
  // AI-Driven Development Fields
  agentRole: true,
  agentTemplateId: true, // CRITICAL FIX: Missing field that breaks template loading
  prompt: true,
  inputContext: true,
  outputArtifacts: true,
  executionStatus: true,
  agentLog: true,
  maxRetries: true,
  timeout: true,
  
  // MCP (Model Context Protocol) Unified Storage Fields
  mcpContext: true,
  mcpMetadata: true,
  mcpToolId: true,
  mcpWorkflowId: true,
  
  // Parent-Child Relationship
  parentTaskId: true,
} as const;

// Task select with assignee
export const taskSelect = {
  ...taskBasicFields,
  assignee: {
    select: userSelect,
  },
} as const;

// Dependency-edge select. Single source of truth for the join shape — both
// taskFullSelect and the optimized PoVService.get() select use this so the
// edge shape can't drift. Stays narrow (~100 bytes/task) to keep callers
// who only need deps from paying for taskFullSelect's heavier relations.
export const taskDepsSelect = {
  dependencies: {
    select: {
      id: true,
      taskId: true,
      dependsOnId: true,
      createdAt: true,
      dependsOn: {
        select: {
          id: true,
          title: true,
          status: true,
          stageId: true,
        }
      }
    }
  },
  dependents: {
    select: {
      id: true,
      taskId: true,
      dependsOnId: true,
      createdAt: true,
      task: {
        select: {
          id: true,
          title: true,
          status: true,
          stageId: true,
        }
      }
    }
  },
} as const;

// Task select with assignee, phase, and dependencies
export const taskFullSelect = {
  ...taskBasicFields,
  assignee: {
    select: userSelect,
  },
  agentTemplate: true, // Include the full agent template
  phase: {
    select: {
      id: true,
      name: true,
      type: true,
      order: true,
    },
  },
  stage: {
    select: {
      id: true,
      name: true,
      order: true,
    },
  },
  ...taskDepsSelect,
  // Sub-tasks
  subTasks: {
    select: {
      id: true,
      title: true,
      status: true,
      stageId: true,
    }
  },
  // Comments
  comments: {
    select: {
      id: true,
      taskId: true,
      userId: true,
      text: true,
      createdAt: true,
      user: {
        select: userSelect,
      },
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 10, // Match activities limit for consistency
  },
  // Activities
  activities: {
    select: {
      id: true,
      taskId: true,
      userId: true,
      action: true,
      timestamp: true,
      user: {
        select: userSelect,
      },
    },
    orderBy: {
      timestamp: 'desc'
    },
    take: 10, // Limit to recent 10 activities for performance
  },
} as const;

// Task select with assignee and team
export const taskWithTeamSelect = {
  ...taskBasicFields,
  assignee: {
    select: userSelect,
  },
  team: {
    select: {
      id: true,
      name: true,
      members: {
        select: {
          user: {
            select: userSelect,
          },
        },
      },
    },
  },
  // Comments
  comments: {
    select: {
      id: true,
      taskId: true,
      userId: true,
      text: true,
      createdAt: true,
      user: {
        select: userSelect,
      },
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 10, // Match activities limit for consistency
  },
} as const;

// Type definitions for Prisma selects
export type TaskSelect = typeof taskSelect;
export type TaskFullSelect = typeof taskFullSelect;
export type TaskWithTeamSelect = typeof taskWithTeamSelect;
