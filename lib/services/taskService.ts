import { prisma } from '@/lib/prisma';
import { taskLogger } from '@/lib/logger';
import { TaskPriority, TaskStatus, CreateTaskData, Task } from '@/lib/tasks/types';
import { taskFullSelect } from '@/lib/tasks/prisma/select';
import { TaskPriority as PrismaTaskPriority, TaskStatus as PrismaTaskStatus, TaskType as PrismaTaskType } from '@prisma/client';
import {
  logFieldChange,
  TaskActivityAction,
  type TaskActivityActionType,
} from '@/lib/tasks/services/taskActivityService';
import type { ActivityMetadata } from '@/lib/types/activity';

export interface EnhancedTaskResponse {
  id: string;
  title: string;
  description: string | null;
  assigneeId: string | null;
  teamId: string | null;
  povId: string | null;
  phaseId: string | null;
  stageId: string | null;
  dueDate: Date | null;
  priority: TaskPriority;
  status: TaskStatus;
  type: PrismaTaskType;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
  
  // Enhanced fields
  activitySummary?: {
    totalActivities: number;
    lastActivity: Date;
    mostRecentAction: string;
    mostActiveUser: {
      id: string;
      name: string;
      email: string;
    };
  };
  workflowStatus?: {
    activeWorkflows: any[];
    pendingApprovals: any[];
    lastApproval: any;
  };
  dependencies?: {
    blockedBy: any[];
    blocking: any[];
    circularDependencies: boolean;
  };
  analytics?: {
    timeInCurrentStatus: number;
    averageCompletionTime: number;
    riskScore: number;
  };
}

export interface TaskUpdateRequest {
  title?: string;
  description?: string;
  assigneeId?: string;
  dueDate?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  type?: PrismaTaskType;
  
  // Workflow fields
  workflowAction?: 'approve' | 'reject' | 'request_approval';
  workflowComment?: string;
  
  // Activity metadata
  activityMetadata?: {
    source: 'manual' | 'api' | 'workflow' | 'automation';
    reason?: string;
    bulkOperation?: boolean;
  };
}

export interface TaskActivitySummary {
  totalActivities: number;
  uniqueUsers: number;
  mostCommonAction: string;
  activityTrend: 'increasing' | 'decreasing' | 'stable';
}

export class EnhancedTaskService {
  /**
   * Map field names to activity action types
   */
  private static getActionTypeForField(field: string): TaskActivityActionType {
    switch (field) {
      case 'status':
        return TaskActivityAction.STATUS_CHANGED;
      case 'priority':
        return TaskActivityAction.PRIORITY_CHANGED;
      case 'dueDate':
        return TaskActivityAction.DUE_DATE_CHANGED;
      default:
        return TaskActivityAction.UPDATED;
    }
  }

  /**
   * Get enhanced task with full context
   */
  static async getEnhancedTask(
    taskId: string,
    options?: {
      includeActivity?: boolean;
      includeWorkflow?: boolean;
      includeDependencies?: boolean;
      includeAnalytics?: boolean;
    }
  ): Promise<EnhancedTaskResponse | null> {
    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: taskFullSelect,
      });

      if (!task) return null;

      const enhancedTask: EnhancedTaskResponse = {
        ...task,
        // Remove the existing dependencies field from the spread and handle it separately
        dependencies: undefined
      };

      // ============================================================================
      // PARALLEL QUERY OPTIMIZATION (Dec 2025 - up to 4 enrichment queries → ~75% faster)
      // All optional enrichment queries run concurrently instead of sequentially
      // Note: Queries are UNCHANGED, just run concurrently based on options
      // ============================================================================

      // Build array of conditional promises for parallel execution
      const [activities, workflows, dependencyData, statusChangeActivities] = await Promise.all([
        // Activity query (if requested)
        options?.includeActivity
          ? prisma.taskActivity.findMany({
              where: { taskId },
              include: {
                user: {
                  select: { id: true, name: true, email: true }
                }
              },
              orderBy: { timestamp: 'desc' },
              take: 100,
            })
          : Promise.resolve(null),

        // Workflow query (if requested)
        options?.includeWorkflow
          ? prisma.workflow.findMany({
              where: {
                povId: task.povId || undefined,
                status: { in: ['PENDING', 'IN_PROGRESS'] }
              },
              include: {
                steps: {
                  orderBy: { order: 'asc' }
                }
              },
              take: 100,
            })
          : Promise.resolve(null),

        // Dependencies queries (if requested) - run both in nested Promise.all
        options?.includeDependencies
          ? Promise.all([
              prisma.taskDependency.findMany({
                where: { taskId },
                include: {
                  dependsOn: {
                    select: taskFullSelect
                  }
                },
                take: 200,
              }),
              prisma.taskDependency.findMany({
                where: { dependsOnId: taskId },
                include: {
                  task: {
                    select: taskFullSelect
                  }
                },
                take: 200,
              })
            ])
          : Promise.resolve(null),

        // Analytics query (if requested)
        options?.includeAnalytics
          ? prisma.taskActivity.findMany({
              where: {
                taskId,
                action: { contains: 'status' }
              },
              orderBy: { timestamp: 'desc' },
              take: 2,
            })
          : Promise.resolve(null)
      ]);

      // Process activity results
      if (activities && activities.length > 0) {
        const userActivityCounts = activities.reduce((acc, activity) => {
          acc[activity.userId] = (acc[activity.userId] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const mostActiveUserId = Object.entries(userActivityCounts)
          .sort(([,a], [,b]) => b - a)[0]?.[0];

        const mostActiveUser = activities.find(a => a.userId === mostActiveUserId)?.user;

        enhancedTask.activitySummary = {
          totalActivities: activities.length,
          lastActivity: activities[0].timestamp,
          mostRecentAction: activities[0].action,
          mostActiveUser: mostActiveUser || {
            id: '',
            name: 'Unknown',
            email: ''
          },
        };
      }

      // Process workflow results
      if (workflows) {
        enhancedTask.workflowStatus = {
          activeWorkflows: workflows,
          pendingApprovals: workflows.flatMap(w =>
            w.steps.filter(s => s.status === 'PENDING')
          ),
          lastApproval: null, // TODO: Implement last approval logic
        };
      }

      // Process dependencies results
      if (dependencyData) {
        const [dependencies, dependents] = dependencyData;
        enhancedTask.dependencies = {
          blockedBy: dependencies.map(d => d.dependsOn),
          blocking: dependents.map(d => d.task),
          circularDependencies: false, // TODO: Implement circular dependency detection
        };
      }

      // Process analytics results
      if (statusChangeActivities) {
        const timeInCurrentStatus = statusChangeActivities.length > 0
          ? Date.now() - statusChangeActivities[0].timestamp.getTime()
          : Date.now() - task.createdAt.getTime();

        enhancedTask.analytics = {
          timeInCurrentStatus: Math.floor(timeInCurrentStatus / (1000 * 60 * 60)), // hours
          averageCompletionTime: 0, // TODO: Calculate from historical data
          riskScore: 0, // TODO: Implement risk scoring algorithm
        };
      }

      return enhancedTask;
    } catch (error) {
      taskLogger.error({ err: error, taskId }, 'getEnhancedTask failed');
      throw error;
    }
  }

  /**
   * Update task with activity logging
   */
  static async updateTaskWithActivity(
    taskId: string,
    data: TaskUpdateRequest,
    userId: string
  ): Promise<EnhancedTaskResponse> {
    try {
      // Get the existing task for comparison
      const existingTask = await prisma.task.findUnique({
        where: { id: taskId },
      });

      if (!existingTask) {
        throw new Error('Task not found');
      }

      // Extract activity metadata
      const { activityMetadata, workflowAction, workflowComment, ...updateData } = data;

      // Update the task using the existing TaskService logic
      const { TaskService } = await import('@/lib/tasks/services/task');
      const updatedTask = await TaskService.updateTask(taskId, updateData as any, userId);

      // 🎯 RICH ACTIVITY LOGGING (Phase 2.3 - 2025-12-31)
      // Log activity for significant changes with rich details
      const apiMetadata: ActivityMetadata = { source: 'API' };
      const changes = this.detectChanges(existingTask, updateData);
      for (const change of changes) {
        const actionType = this.getActionTypeForField(change.field);
        logFieldChange(taskId, userId, {
          name: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
          action: actionType,
        }, apiMetadata);
      }

      // Handle workflow actions - log as field change with workflow context
      if (workflowAction) {
        logFieldChange(taskId, userId, {
          name: 'workflow',
          oldValue: null,
          newValue: { action: workflowAction, comment: workflowComment },
          action: TaskActivityAction.UPDATED,
        }, apiMetadata);
      }

      // Return enhanced task
      return this.getEnhancedTask(taskId, {
        includeActivity: true,
        includeWorkflow: true,
        includeDependencies: true,
        includeAnalytics: true,
      }) as Promise<EnhancedTaskResponse>;
    } catch (error) {
      taskLogger.error({ err: error, taskId }, 'updateTaskWithActivity failed');
      throw error;
    }
  }

  /**
   * Get task activity summary
   */
  static async getTaskActivitySummary(taskId: string): Promise<TaskActivitySummary> {
    try {
      const activities = await prisma.taskActivity.findMany({
        where: { taskId },
        include: {
          user: {
            select: { id: true }
          }
        },
        orderBy: { timestamp: 'desc' },
        take: 1000, // Safety cap
      });

      const uniqueUsers = new Set(activities.map(a => a.userId)).size;
      
      const actionCounts = activities.reduce((acc, activity) => {
        acc[activity.action] = (acc[activity.action] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const mostCommonAction = Object.entries(actionCounts)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || 'none';

      // Calculate trend (simplified)
      const recentActivities = activities.filter(a => 
        a.timestamp > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      ).length;
      const olderActivities = activities.length - recentActivities;
      
      let activityTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      if (recentActivities > olderActivities * 1.2) {
        activityTrend = 'increasing';
      } else if (recentActivities < olderActivities * 0.8) {
        activityTrend = 'decreasing';
      }

      return {
        totalActivities: activities.length,
        uniqueUsers,
        mostCommonAction,
        activityTrend,
      };
    } catch (error) {
      taskLogger.error({ err: error, taskId }, 'getTaskActivitySummary failed');
      throw error;
    }
  }

  /**
   * Detect changes between old and new task data
   */
  private static detectChanges(
    existingTask: any,
    updateData: Partial<CreateTaskData>
  ): Array<{ action: string; field: string; oldValue: any; newValue: any }> {
    const changes = [];

    const fieldsToCheck = [
      'title', 'description', 'assigneeId', 'dueDate', 
      'priority', 'status', 'type'
    ];

    for (const field of fieldsToCheck) {
      if (updateData[field as keyof CreateTaskData] !== undefined && 
          updateData[field as keyof CreateTaskData] !== existingTask[field]) {
        changes.push({
          action: `updated_${field}`,
          field,
          oldValue: existingTask[field],
          newValue: updateData[field as keyof CreateTaskData],
        });
      }
    }

    return changes;
  }

}
