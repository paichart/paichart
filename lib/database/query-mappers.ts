/**
 * Query Mappers - Performance Optimization with Lazy Loading
 * 
 * This module provides factory functions for creating optimized data mappers
 * that enable the includes � select + mappers pattern for better performance.
 * 
 * Key Features:
 * - Factory pattern for field expansion
 * - Lazy loading with proxy patterns  
 * - Strategy pattern for query optimization
 * - Minimal data mapping with on-demand expansion
 * - Shared mapper utilities for consistency
 * 
 * @fileoverview Query mappers for Phase 1 performance optimization tasks 13-15
 */

import { prisma } from '../prisma';
import { Task, TaskPriority, TaskStatus } from '../tasks/types/index';
import { PoVResponse } from '../pov/types/core';
import { mapTaskFromPrisma } from '../tasks/prisma/mappers';
import { taskAgentRuntimeFields } from '../tasks/prisma/select';
import { mapPoVToResponse } from '../pov/prisma/mappers';

// ================================================================
// TASK MAPPER - Factory Pattern for Field Expansion
// ================================================================

export interface MinimalTaskData {
  id: string;
  title: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  phaseId: string | null;
  stageId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskMapperOptions {
  includeAssignee?: boolean;
  includePhase?: boolean;
  includeStage?: boolean;
  includeDependencies?: boolean;
  includeSubTasks?: boolean;
  includeTemplate?: boolean;
  includeMcpContext?: boolean;
}

export interface TaskMapperResult {
  /**
   * Get the basic task data (always available)
   */
  getBasic(): Pick<Task, 'id' | 'title' | 'status' | 'priority' | 'createdAt' | 'updatedAt'>;
  
  /**
   * Lazy load assignee data
   */
  getAssignee(): Promise<Task['assignee'] | null>;
  
  /**
   * Lazy load phase data
   */
  getPhase(): Promise<Task['phase'] | null>;
  
  /**
   * Lazy load stage data
   */
  getStage(): Promise<Task['stage'] | null>;
  
  /**
   * Lazy load dependencies
   */
  getDependencies(): Promise<Task['dependencies'] | undefined>;
  
  /**
   * Lazy load sub-tasks
   */
  getSubTasks(): Promise<Task['subTasks'] | undefined>;
  
  /**
   * Get full task object with selected expansions
   */
  getExpanded(options?: TaskMapperOptions): Promise<Task>;
  
  /**
   * Get the minimal data object
   */
  getRaw(): MinimalTaskData;
}

/**
 * Creates a task mapper with lazy loading capabilities
 * Factory pattern for field expansion
 * 
 * @param minimalData - Minimal task data from select-optimized query
 * @param defaultOptions - Default expansion options
 * @returns TaskMapperResult with lazy loading methods
 */
export function createTaskMapper(
  minimalData: MinimalTaskData,
  defaultOptions: TaskMapperOptions = {}
): TaskMapperResult {
  // Cache for lazy-loaded data
  const cache = new Map<string, any>();
  
  return {
    getBasic() {
      return {
        id: minimalData.id,
        title: minimalData.title,
        status: minimalData.status as TaskStatus,
        priority: minimalData.priority as TaskPriority,
        createdAt: minimalData.createdAt.toISOString(),
        updatedAt: minimalData.updatedAt.toISOString()
      };
    },

    async getAssignee() {
      if (!minimalData.assigneeId) return null;
      
      const cacheKey = `assignee_${minimalData.assigneeId}`;
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
      }

      const assignee = await prisma.user.findUnique({
        where: { id: minimalData.assigneeId },
        select: {
          id: true,
          name: true,
          email: true
        }
      });

      cache.set(cacheKey, assignee);
      return assignee;
    },

    async getPhase() {
      if (!minimalData.phaseId) return null;
      
      const cacheKey = `phase_${minimalData.phaseId}`;
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
      }

      const phase = await prisma.phase.findUnique({
        where: { id: minimalData.phaseId },
        select: {
          id: true,
          name: true,
          type: true,
          order: true
        }
      });

      cache.set(cacheKey, phase);
      return phase;
    },

    async getStage() {
      if (!minimalData.stageId) return null;
      
      const cacheKey = `stage_${minimalData.stageId}`;
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
      }

      const stage = await prisma.stage.findUnique({
        where: { id: minimalData.stageId },
        select: {
          id: true,
          name: true,
          order: true
        }
      });

      cache.set(cacheKey, stage);
      return stage;
    },

    async getDependencies() {
      const cacheKey = `dependencies_${minimalData.id}`;
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
      }

      const dependencies = await prisma.taskDependency.findMany({
        where: { taskId: minimalData.id },
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
              priority: true,
              stageId: true,
              type: true,
              createdAt: true,
              updatedAt: true
            }
          }
        },
        take: 200
      });

      const mappedDependencies = dependencies.map(dep => ({
        id: dep.id,
        taskId: dep.taskId,
        dependsOnId: dep.dependsOnId,
        dependsOn: dep.dependsOn ? {
          id: dep.dependsOn.id,
          title: dep.dependsOn.title,
          description: null,
          assigneeId: null,
          teamId: null,
          povId: null,
          phaseId: null,
          stageId: dep.dependsOn.stageId,
          dueDate: null,
          priority: dep.dependsOn.priority as TaskPriority,
          status: dep.dependsOn.status as TaskStatus,
          type: dep.dependsOn.type,
          metadata: {},
          createdAt: dep.dependsOn.createdAt.toISOString(),
          updatedAt: dep.dependsOn.updatedAt.toISOString()
        } : undefined,
        createdAt: dep.createdAt.toISOString()
      }));

      cache.set(cacheKey, mappedDependencies);
      return mappedDependencies;
    },

    async getSubTasks() {
      const cacheKey = `subtasks_${minimalData.id}`;
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
      }

      const subTasks = await prisma.task.findMany({
        where: { parentTaskId: minimalData.id },
        select: {
          id: true,
          title: true,
          status: true,
          stageId: true,
          type: true
        },
        take: 200
      });

      cache.set(cacheKey, subTasks);
      return subTasks;
    },

    async getExpanded(options: TaskMapperOptions = {}) {
      const opts = { ...defaultOptions, ...options };
      
      // Start with full task data
      const fullTask = await prisma.task.findUnique({
        where: { id: minimalData.id },
        select: {
          id: true,
          title: true,
          description: true,
          assigneeId: true,
          teamId: true,
          povId: true,
          phaseId: true,
          stageId: true,
          order: true,
          dueDate: true,
          priority: true,
          status: true,
          type: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
          
          // AI-Driven Development Fields — shared agent runtime + one conditional
          ...taskAgentRuntimeFields,
          agentTemplateId: opts.includeTemplate,
          
          // MCP Fields
          mcpContext: opts.includeMcpContext,
          mcpMetadata: opts.includeMcpContext,
          mcpToolId: true,
          mcpWorkflowId: true,
          
          // Parent-Child Relationship
          parentTaskId: true,

          // Conditional includes
          assignee: opts.includeAssignee ? {
            select: {
              id: true,
              name: true,
              email: true
            }
          } : false,
          
          phase: opts.includePhase ? {
            select: {
              id: true,
              name: true,
              type: true,
              order: true
            }
          } : false,
          
          stage: opts.includeStage ? {
            select: {
              id: true,
              name: true,
              order: true
            }
          } : false,

          agentTemplate: opts.includeTemplate,
          
          dependencies: opts.includeDependencies ? {
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
                  priority: true,
                  stageId: true,
                  type: true,
                  createdAt: true,
                  updatedAt: true
                }
              }
            }
          } : false,
          
          dependents: opts.includeDependencies ? {
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
                  priority: true,
                  stageId: true,
                  type: true,
                  createdAt: true,
                  updatedAt: true
                }
              }
            }
          } : false,
          
          subTasks: opts.includeSubTasks ? {
            select: {
              id: true,
              title: true,
              status: true,
              stageId: true,
              type: true
            }
          } : false
        }
      });

      if (!fullTask) {
        throw new Error(`Task ${minimalData.id} not found`);
      }

      return mapTaskFromPrisma(fullTask);
    },

    getRaw() {
      return minimalData;
    }
  };
}

// ================================================================
// POV MAPPER - Proxy Pattern for Relationship Loading  
// ================================================================

export interface MinimalPOVData {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  ownerId: string;
  teamId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface POVMapperOptions {
  includeOwner?: boolean;
  includeTeam?: boolean;
  includePhases?: boolean;
  includeRegion?: boolean;
  includeCountry?: boolean;
  includeMilestones?: boolean;
  includeWorkflows?: boolean;
}

export interface POVMapperResult {
  /**
   * Get the basic POV data (always available)
   */
  getBasic(): Pick<PoVResponse, 'id' | 'title' | 'description' | 'status' | 'priority' | 'createdAt' | 'updatedAt'>;
  
  /**
   * Lazy load owner data
   */
  getOwner(): Promise<PoVResponse['owner']>;
  
  /**
   * Lazy load team data
   */
  getTeam(): Promise<PoVResponse['team']>;
  
  /**
   * Lazy load phases with selective task loading
   */
  getPhases(includeTaskCount?: boolean): Promise<PoVResponse['phases']>;
  
  /**
   * Get full POV object with selected expansions
   */
  getExpanded(options?: POVMapperOptions): Promise<PoVResponse>;
  
  /**
   * Get the minimal data object
   */
  getRaw(): MinimalPOVData;
}

/**
 * Creates a POV mapper with lazy loading capabilities
 * Proxy pattern for relationship loading
 * 
 * @param minimalData - Minimal POV data from select-optimized query
 * @param defaultOptions - Default expansion options
 * @returns POVMapperResult with lazy loading methods
 */
export function createPOVMapper(
  minimalData: MinimalPOVData,
  defaultOptions: POVMapperOptions = {}
): POVMapperResult {
  // Cache for lazy-loaded data
  const cache = new Map<string, any>();
  
  return {
    getBasic() {
      return {
        id: minimalData.id,
        title: minimalData.title,
        description: minimalData.description,
        status: minimalData.status as any,
        priority: minimalData.priority as any,
        createdAt: minimalData.createdAt,
        updatedAt: minimalData.updatedAt
      };
    },

    async getOwner() {
      const cacheKey = `owner_${minimalData.ownerId}`;
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
      }

      const owner = await prisma.user.findUnique({
        where: { id: minimalData.ownerId },
        select: {
          id: true,
          name: true,
          email: true
        }
      });

      cache.set(cacheKey, owner);
      return owner;
    },

    async getTeam() {
      if (!minimalData.teamId) return null;
      
      const cacheKey = `team_${minimalData.teamId}`;
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
      }

      const team = await prisma.team.findUnique({
        where: { id: minimalData.teamId },
        select: {
          id: true,
          name: true
        }
      });

      cache.set(cacheKey, team);
      return team;
    },

    async getPhases(includeTaskCount: boolean = false) {
      const cacheKey = `phases_${minimalData.id}_${includeTaskCount}`;
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
      }

      if (includeTaskCount) {
        // Strategy pattern: Include task count aggregation
        const phases = await prisma.phase.findMany({
          where: { povId: minimalData.id },
          select: {
            id: true,
            name: true,
            description: true,
            type: true,
            startDate: true,
            endDate: true,
            order: true,
            povId: true,
            details: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                tasks: true
              }
            }
          },
          orderBy: { order: 'asc' },
          take: 50
        });

        const mappedPhases = phases.map(phase => ({
          ...phase,
          tasks: [], // Empty array, but include task count in metadata
          taskCount: phase._count.tasks
        }));

        cache.set(cacheKey, mappedPhases);
        return mappedPhases;
      } else {
        // Basic phase data only
        const phases = await prisma.phase.findMany({
          where: { povId: minimalData.id },
          select: {
            id: true,
            name: true,
            description: true,
            type: true,
            startDate: true,
            endDate: true,
            order: true,
            povId: true,
            details: true,
            createdAt: true,
            updatedAt: true
          },
          orderBy: { order: 'asc' },
          take: 50
        });

        const mappedPhases = phases.map(phase => ({
          ...phase,
          tasks: []
        }));

        cache.set(cacheKey, mappedPhases);
        return mappedPhases;
      }
    },

    async getExpanded(options: POVMapperOptions = {}) {
      const opts = { ...defaultOptions, ...options };
      
      // Get full POV data
      const fullPOV = await prisma.pOV.findUnique({
        where: { id: minimalData.id },
        include: {
          owner: opts.includeOwner ? {
            select: {
              id: true,
              name: true,
              email: true
            }
          } : false,
          
          team: opts.includeTeam ? {
            select: {
              id: true,
              name: true
            }
          } : false,
          
          country: opts.includeCountry ? {
            select: {
              id: true,
              name: true,
              code: true
            }
          } : false,
          
          region: opts.includeRegion ? {
            select: {
              id: true,
              name: true,
              type: true
            }
          } : false,
          
          phases: opts.includePhases ? {
            select: {
              id: true,
              name: true,
              description: true,
              type: true,
              startDate: true,
              endDate: true,
              order: true,
              details: true,
              createdAt: true,
              updatedAt: true
            },
            orderBy: { order: 'asc' }
          } : false,
          
          milestones: opts.includeMilestones,
          workflows: opts.includeWorkflows,
          syncHistory: false, // Always exclude heavy data by default
        }
      });

      if (!fullPOV) {
        throw new Error(`POV ${minimalData.id} not found`);
      }

      return mapPoVToResponse(fullPOV);
    },

    getRaw() {
      return minimalData;
    }
  };
}

// ================================================================
// PHASE MAPPER - Strategy Pattern for Query Optimization
// ================================================================

export interface MinimalPhaseData {
  id: string;
  name: string;
  description: string;
  type: string;
  order: number;
  povId: string;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PhaseMapperOptions {
  includePOV?: boolean;
  includeTasks?: boolean;
  includeTaskDetails?: boolean;
  includeStages?: boolean;
  taskStrategy?: 'minimal' | 'summary' | 'full';
}

export interface PhaseMapperResult {
  /**
   * Get the basic phase data (always available)
   */
  getBasic(): Pick<MinimalPhaseData, 'id' | 'name' | 'description' | 'type' | 'order' | 'startDate' | 'endDate'>;
  
  /**
   * Lazy load POV data
   */
  getPOV(): Promise<{ id: string; title: string; status: string } | null>;
  
  /**
   * Lazy load tasks with strategy pattern
   */
  getTasks(strategy?: PhaseMapperOptions['taskStrategy']): Promise<any[]>;
  
  /**
   * Get task summary statistics
   */
  getTaskSummary(): Promise<{
    total: number;
    completed: number;
    inProgress: number;
    open: number;
    blocked: number;
  }>;
  
  /**
   * Get full phase object with selected expansions
   */
  getExpanded(options?: PhaseMapperOptions): Promise<any>;
  
  /**
   * Get the minimal data object
   */
  getRaw(): MinimalPhaseData;
}

/**
 * Creates a phase mapper with selective task loading
 * Strategy pattern for query optimization
 * 
 * @param minimalData - Minimal phase data from select-optimized query
 * @param defaultOptions - Default expansion options
 * @returns PhaseMapperResult with strategy-based task loading
 */
export function createPhaseMapper(
  minimalData: MinimalPhaseData,
  defaultOptions: PhaseMapperOptions = {}
): PhaseMapperResult {
  // Cache for lazy-loaded data
  const cache = new Map<string, any>();
  
  return {
    getBasic() {
      return {
        id: minimalData.id,
        name: minimalData.name,
        description: minimalData.description,
        type: minimalData.type,
        order: minimalData.order,
        startDate: minimalData.startDate,
        endDate: minimalData.endDate
      };
    },

    async getPOV() {
      const cacheKey = `pov_${minimalData.povId}`;
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
      }

      const pov = await prisma.pOV.findUnique({
        where: { id: minimalData.povId },
        select: {
          id: true,
          title: true,
          status: true
        }
      });

      cache.set(cacheKey, pov);
      return pov;
    },

    async getTasks(strategy: PhaseMapperOptions['taskStrategy'] = 'minimal') {
      const cacheKey = `tasks_${minimalData.id}_${strategy}`;
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
      }

      let tasks;
      
      // Strategy pattern for different levels of task data
      switch (strategy) {
        case 'minimal':
          tasks = await prisma.task.findMany({
            where: { phaseId: minimalData.id },
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              order: true,
              createdAt: true,
              updatedAt: true
            },
            orderBy: { order: 'asc' },
            take: 500
          });
          break;

        case 'summary':
          tasks = await prisma.task.findMany({
            where: { phaseId: minimalData.id },
            select: {
              id: true,
              title: true,
              description: true,
              status: true,
              priority: true,
              assigneeId: true,
              stageId: true,
              order: true,
              dueDate: true,
              createdAt: true,
              updatedAt: true,
              assignee: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              },
              stage: {
                select: {
                  id: true,
                  name: true,
                  order: true
                }
              }
            },
            orderBy: { order: 'asc' },
            take: 500
          });
          break;

        case 'full':
          tasks = await prisma.task.findMany({
            where: { phaseId: minimalData.id },
            select: {
              id: true,
              title: true,
              description: true,
              assigneeId: true,
              teamId: true,
              povId: true,
              phaseId: true,
              stageId: true,
              order: true,
              dueDate: true,
              priority: true,
              status: true,
              type: true,
              metadata: true,
              createdAt: true,
              updatedAt: true,

              // Include all related data
              assignee: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              },
              stage: {
                select: {
                  id: true,
                  name: true,
                  order: true
                }
              },
              dependencies: {
                select: {
                  id: true,
                  dependsOnId: true,
                  dependsOn: {
                    select: {
                      id: true,
                      title: true,
                      status: true
                    }
                  }
                }
              }
            },
            orderBy: { order: 'asc' },
            take: 500
          });
          break;

        default:
          tasks = await prisma.task.findMany({
            where: { phaseId: minimalData.id },
            select: {
              id: true,
              title: true,
              status: true,
              order: true
            },
            orderBy: { order: 'asc' },
            take: 500
          });
      }

      cache.set(cacheKey, tasks);
      return tasks;
    },

    async getTaskSummary() {
      const cacheKey = `task_summary_${minimalData.id}`;
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
      }

      // Use aggregation for efficient counts
      const summary = await prisma.task.groupBy({
        by: ['status'],
        where: { phaseId: minimalData.id },
        _count: {
          id: true
        }
      });

      // Transform to summary object
      const taskSummary = {
        total: 0,
        completed: 0,
        inProgress: 0,
        open: 0,
        blocked: 0
      };

      summary.forEach(group => {
        const count = group._count.id;
        taskSummary.total += count;
        
        switch (group.status) {
          case 'COMPLETED':
            taskSummary.completed = count;
            break;
          case 'IN_PROGRESS':
            taskSummary.inProgress = count;
            break;
          case 'OPEN':
            taskSummary.open = count;
            break;
          case 'BLOCKED':
            taskSummary.blocked = count;
            break;
        }
      });

      cache.set(cacheKey, taskSummary);
      return taskSummary;
    },

    async getExpanded(options: PhaseMapperOptions = {}) {
      const opts = { ...defaultOptions, ...options };
      
      // Get full phase data
      const fullPhase = await prisma.phase.findUnique({
        where: { id: minimalData.id },
        include: {
          pov: opts.includePOV ? {
            select: {
              id: true,
              title: true,
              status: true,
              priority: true
            }
          } : false,
          
          tasks: opts.includeTasks ? {
            select: opts.includeTaskDetails ? {
              id: true,
              title: true,
              description: true,
              status: true,
              priority: true,
              assigneeId: true,
              stageId: true,
              order: true,
              dueDate: true,
              createdAt: true,
              updatedAt: true,
              assignee: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              },
              stage: {
                select: {
                  id: true,
                  name: true,
                  order: true
                }
              }
            } : {
              id: true,
              title: true,
              status: true,
              priority: true,
              order: true
            },
            orderBy: { order: 'asc' }
          } : false,

          stages: opts.includeStages ? {
            select: {
              id: true,
              name: true,
              description: true,
              order: true,
              status: true,
              createdAt: true,
              updatedAt: true
            },
            orderBy: { order: 'asc' }
          } : false
        }
      });

      if (!fullPhase) {
        throw new Error(`Phase ${minimalData.id} not found`);
      }

      return fullPhase;
    },

    getRaw() {
      return minimalData;
    }
  };
}

// ================================================================
// SHARED MAPPER UTILITIES - For Consistency Across Codebase
// ================================================================

/**
 * Shared utility for creating minimal select queries
 */
export const MinimalSelects = {
  task: {
    id: true,
    title: true,
    status: true,
    priority: true,
    assigneeId: true,
    phaseId: true,
    stageId: true,
    createdAt: true,
    updatedAt: true
  },
  
  pov: {
    id: true,
    title: true,
    description: true,
    status: true,
    priority: true,
    ownerId: true,
    teamId: true,
    createdAt: true,
    updatedAt: true
  },
  
  phase: {
    id: true,
    name: true,
    description: true,
    type: true,
    order: true,
    povId: true,
    startDate: true,
    endDate: true,
    createdAt: true,
    updatedAt: true
  }
} as const;

/**
 * Batch mapper creation for multiple items
 */
export function createTaskMapperBatch(
  items: MinimalTaskData[],
  options: TaskMapperOptions = {}
): TaskMapperResult[] {
  return items.map(item => createTaskMapper(item, options));
}

export function createPOVMapperBatch(
  items: MinimalPOVData[],
  options: POVMapperOptions = {}
): POVMapperResult[] {
  return items.map(item => createPOVMapper(item, options));
}

export function createPhaseMapperBatch(
  items: MinimalPhaseData[],
  options: PhaseMapperOptions = {}
): PhaseMapperResult[] {
  return items.map(item => createPhaseMapper(item, options));
}

/**
 * Helper for converting includes to select + mapper pattern
 * This enables the performance optimization pattern
 */
export function optimizeQuery<T extends Record<string, any>>(
  includeQuery: T
): { select: Record<string, any>; mapperOptions: Record<string, boolean> } {
  const select: Record<string, any> = {};
  const mapperOptions: Record<string, boolean> = {};

  // Convert includes to select fields and mapper options
  Object.keys(includeQuery).forEach(key => {
    if (includeQuery[key] === true) {
      // Simple include becomes select: true and mapper option
      select[key] = false; // Don't include in initial query
      mapperOptions[`include${key.charAt(0).toUpperCase() + key.slice(1)}`] = true;
    } else if (typeof includeQuery[key] === 'object') {
      // Nested include becomes select: false and mapper option
      select[key] = false;
      mapperOptions[`include${key.charAt(0).toUpperCase() + key.slice(1)}`] = true;
    }
  });

  return { select, mapperOptions };
}

/**
 * Type-safe mapper factory
 */
export type MapperFactory<TMinimal, TFull, TOptions = {}> = {
  create: (data: TMinimal, options?: TOptions) => {
    getBasic(): Partial<TFull>;
    getExpanded(options?: TOptions): Promise<TFull>;
    getRaw(): TMinimal;
  };
  batch: (items: TMinimal[], options?: TOptions) => ReturnType<MapperFactory<TMinimal, TFull, TOptions>['create']>[];
};

// ================================================================
// USAGE EXAMPLES - How to Use the Mappers
// ================================================================

/**
 * Example: Optimizing a task query using mappers
 * 
 * BEFORE (using includes):
 * ```typescript
 * const tasks = await prisma.task.findMany({
 *   include: {
 *     assignee: true,
 *     phase: true,
 *     dependencies: true
 *   }
 * });
 * ```
 * 
 * AFTER (using select + mappers):
 * ```typescript
 * const minimalTasks = await prisma.task.findMany({
 *   select: MinimalSelects.task
 * });
 * 
 * const taskMappers = createTaskMapperBatch(minimalTasks, {
 *   includeAssignee: true,
 *   includePhase: true,
 *   includeDependencies: true
 * });
 * 
 * // Use only what you need
 * const basicData = taskMappers.map(m => m.getBasic());
 * 
 * // Or expand specific tasks on demand
 * const firstTaskWithDetails = await taskMappers[0].getExpanded();
 * const assigneeOnly = await taskMappers[0].getAssignee();
 * ```
 * 
 * Example: Phase with selective task loading
 * ```typescript
 * const minimalPhases = await prisma.phase.findMany({
 *   select: MinimalSelects.phase
 * });
 * 
 * const phaseMappers = createPhaseMapperBatch(minimalPhases);
 * 
 * // Get phase with minimal task data
 * const tasksMinimal = await phaseMappers[0].getTasks('minimal');
 * 
 * // Get phase with full task details when needed
 * const tasksFull = await phaseMappers[0].getTasks('full');
 * 
 * // Get just task statistics
 * const summary = await phaseMappers[0].getTaskSummary();
 * ```
 * 
 * Example: POV with lazy relationship loading
 * ```typescript
 * const minimalPOVs = await prisma.pOV.findMany({
 *   select: MinimalSelects.pov
 * });
 * 
 * const povMappers = createPOVMapperBatch(minimalPOVs);
 * 
 * // Load relationships only when needed
 * const owner = await povMappers[0].getOwner();
 * const phasesWithTaskCount = await povMappers[0].getPhases(true);
 * 
 * // Or get full expanded object
 * const fullPOV = await povMappers[0].getExpanded({
 *   includeOwner: true,
 *   includePhases: true,
 *   includeTeam: true
 * });
 * ```
 */

// Note: Types are already exported above, no need to re-export