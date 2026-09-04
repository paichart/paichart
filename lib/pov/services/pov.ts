import { prisma } from "@/lib/prisma"
import { ApiError } from "@/lib/errors"
import { Prisma } from "@prisma/client"
import { PoVCreateInput, PoVUpdateInput } from "@/lib/pov/types/core"
import { povLogger } from "@/lib/logger"

import { fullPOV } from '../prisma/select';
import { taskAgentRuntimeFields, taskDepsSelect } from '@/lib/tasks/prisma/select';
import { PoVActivityType } from './activity';

export class PoVService {
  async create(data: PoVCreateInput) {
    return prisma.pOV.create({
      data,
      include: fullPOV.include,
    })
  }

  /**
   * Get POV with full context - N+1 OPTIMIZED VERSION  
   * 🔧 PERFORMANCE FIX: Task 4 - getPOVWithFullContext N+1 elimination
   * Expected improvement: 1000ms → 200ms (80% reduction)
   */
  async get(id: string) {
    const startTime = Date.now();
    povLogger.debug({ povId: id }, 'fetching POV with full context');
    
    // OLD CODE (commented for rollback):
    // const pov = await prisma.pOV.findUnique({
    //   where: { id },
    //   include: fullPOV.include, // This caused N+1 with team, phases, tasks, activities, executions
    // });

    // NEW: Strategic select + batch lookups
    // Step 1: Get POV basic data
    const pov = await prisma.pOV.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        customerName: true,
        status: true,
        startDate: true,
        endDate: true,
        ownerId: true,
        teamId: true,
        templateId: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        // Business fields
        priority: true,
        objective: true,
        dealId: true,
        opportunityName: true,
        revenue: true,
        forecastDate: true,
        customerContact: true,
        partnerName: true,
        partnerContact: true,
        competitors: true,
        solution: true,
        lastCrmSync: true,
        crmSyncStatus: true,
        // Geographic fields
        salesTheatre: true,
        countryId: true,
        regionId: true,
        // Additional fields
        documents: true,
        featureRequests: true,
        supportTickets: true,
        blockers: true,
        tags: true,
        estimatedBudget: true,
        budgetDocument: true,
        resources: true,
        formData: true,
        // Get IDs for batch lookups
        owner: { select: { id: true, name: true, email: true, role: true } }
      }
    });

    if (!pov) {
      const queryTime = Date.now() - startTime;
      povLogger.debug({ povId: id, queryTimeMs: queryTime }, 'POV not found');
      return null;
    }

    // Step 2: Batch fetch related data in parallel (avoid N+1)
    // FAULT ISOLATION: Per-item .catch() prevents one lookup failure from losing all POV enrichment data
    const [team, phases, template, activities, country, region] = await Promise.all([
      // Team with members
      pov.teamId ? prisma.team.findUnique({
        where: { id: pov.teamId },
        select: {
          id: true,
          name: true,
          members: {
            select: {
              id: true,
              role: true,
              user: { select: { id: true, name: true, email: true, role: true, status: true } }
            }
          }
        }
      }).catch(err => { povLogger.warn({ err, teamId: pov.teamId }, 'Team lookup failed — returning null'); return null; }) : null,

      // Phases with stages and tasks (selective loading)
      prisma.phase.findMany({
        where: { povId: id },
        select: {
          id: true,
          name: true,
          description: true,
          type: true,
          order: true,
          startDate: true,
          endDate: true,
          povId: true,
          templateId: true,
          details: true,
          createdAt: true,
          updatedAt: true,
          // Get stage IDs for batch lookup
          stages: {
            select: {
              id: true,
              name: true,
              description: true,
              order: true,
              phaseId: true,
              metadata: true,
              createdAt: true,
              updatedAt: true
            },
            orderBy: { order: 'asc' }
          },
          // Get task count only (detailed tasks loaded separately if needed)
          _count: { select: { tasks: true } }
        },
        orderBy: [{ type: 'asc' }, { order: 'asc' }],
        take: 50
      }).catch(err => { povLogger.warn({ err, povId: id }, 'Phase lookup failed — returning empty'); return []; }),

      // POV template
      pov.templateId ? prisma.pOVTemplate.findUnique({
        where: { id: pov.templateId },
        select: { id: true, name: true, description: true }
      }).catch(err => { povLogger.warn({ err, templateId: pov.templateId }, 'Template lookup failed — returning null'); return null; }) : null,

      // Recent activities (last 20 for performance)
      prisma.activity.findMany({
        where: { userId: pov.ownerId },
        select: {
          id: true,
          type: true,
          action: true,
          createdAt: true,
          userId: true,
          metadata: true,
          user: { select: { id: true, name: true, email: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      }).catch(err => { povLogger.warn({ err, ownerId: pov.ownerId }, 'Activity lookup failed — returning empty'); return []; }),

      // Country
      pov.countryId ? prisma.country.findUnique({
        where: { id: pov.countryId },
        select: { id: true, name: true, code: true }
      }).catch(err => { povLogger.warn({ err, countryId: pov.countryId }, 'Country lookup failed — returning null'); return null; }) : null,

      // Region
      pov.regionId ? prisma.region.findUnique({
        where: { id: pov.regionId },
        select: { id: true, name: true, type: true }
      }).catch(err => { povLogger.warn({ err, regionId: pov.regionId }, 'Region lookup failed — returning null'); return null; }) : null

    ]);

    // Step 3: Get all stage IDs for batch task lookup
    const allStageIds = phases.flatMap(phase => phase.stages.map(stage => stage.id));
    
    // Step 4: Batch fetch tasks for all stages (if needed for summary)
    const tasks = allStageIds.length > 0 ? await prisma.task.findMany({
      where: { stageId: { in: allStageIds } },
      take: 500, // Safety cap: prevent memory blow-up on large POVs
      select: {
        id: true,
        title: true,
        description: true,  // FIX: Add description field
        status: true,
        priority: true,
        type: true,         // FIX: Add type field
        assigneeId: true,
        stageId: true,
        phaseId: true,
        order: true,        // FIX: Add order field (was missing!)
        dueDate: true,      // FIX: Add dueDate field
        createdAt: true,
        updatedAt: true,    // FIX: Add updatedAt field
        // Agent runtime fields — shared constant (lib/tasks/prisma/select.ts).
        // Includes outputArtifacts and agentLog which ArtifactViewer and
        // AgentMonitoringView depend on; drift here causes the Artifacts tab
        // to render empty even when the DB column is populated.
        ...taskAgentRuntimeFields,
        agentTemplateId: true,
        metadata: true,
        mcpContext: true,
        mcpMetadata: true,
        // Minimal assignee data
        assignee: { select: { id: true, name: true, email: true } },
        // Comments with user data
        comments: {
          select: {
            id: true,
            taskId: true,
            userId: true,
            text: true,
            createdAt: true,
            user: { select: { id: true, name: true, email: true, role: true, status: true } }
          }
        },
        // Dependency edges — narrow select (~100 bytes/task), shared with taskFullSelect
        ...taskDepsSelect,
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }]
    }) : [];

    // Step 5: Group tasks by stage for assembly
    const tasksByStageId = new Map<string, typeof tasks>();
    tasks.forEach(task => {
      // Handle null stageId - only process tasks with valid stageId
      if (task.stageId && !tasksByStageId.has(task.stageId)) {
        tasksByStageId.set(task.stageId, []);
      }
      if (task.stageId) {
        tasksByStageId.get(task.stageId)!.push(task);
      }
    });

    // Step 6: Assemble the complete POV object with all relationships
    const completePOV = {
      ...pov,
      team,
      template,
      phases: phases.map(phase => ({
        ...phase,
        stages: phase.stages.map(stage => ({
          ...stage,
          tasks: tasksByStageId.get(stage.id) || []
        })),
        tasks: tasks.filter(task => task.phaseId === phase.id) // Phase-level tasks
      })),
      activities,
      country,
      region,
      metadata: pov.metadata,  // Explicitly preserve metadata (including isDemo)
      // Add summary statistics
      summary: {
        totalPhases: phases.length,
        totalStages: phases.reduce((sum, phase) => sum + phase.stages.length, 0),
        totalTasks: tasks.length,
        completedTasks: tasks.filter(t => t.status === 'COMPLETED').length,
        activeTasks: tasks.filter(t => ['OPEN', 'IN_PROGRESS'].includes(t.status)).length,
        teamMemberCount: team?.members?.length || 0,
        recentActivityCount: activities.length
      }
    };

    const queryTime = Date.now() - startTime;
    povLogger.debug({ povId: id, queryTimeMs: queryTime, tasks: completePOV.summary.totalTasks, phases: completePOV.summary.totalPhases }, 'POV fetched with full context');

    return completePOV;
  }

  /**
   * List POVs with filters - N+1 OPTIMIZED VERSION
   * 🔧 PERFORMANCE FIX: Task 5 - listPOVsWithFilters N+1 elimination  
   * Expected improvement: 800ms → 150ms (81% reduction)
   */
  async list(userId?: string, isAdmin: boolean = false, pagination?: { limit?: number; offset?: number }) {
    const startTime = Date.now();
    const limit = Math.min(pagination?.limit ?? 100, 200);
    const offset = pagination?.offset ?? 0;
    povLogger.debug({ isAdmin, limit, offset }, 'fetching POV list');

    // NEW: Strategic select for list view (no deep includes needed)
    // Step 1: Get POVs with minimal data for list view
    const povs = await prisma.pOV.findMany({
      where: isAdmin ? undefined : {
        OR: [
          { ownerId: userId },
          {
            team: {
              members: {
                some: {
                  userId: userId
                }
              }
            }
          }
        ]
      },
      select: {
        id: true,
        title: true,
        description: true,
        customerName: true,
        status: true,
        startDate: true,
        endDate: true,
        ownerId: true,
        teamId: true,
        templateId: true,
        createdAt: true,
        updatedAt: true,
        // Minimal owner data
        owner: { select: { id: true, name: true, email: true } },
        // Get counts instead of full data for list performance
        _count: {
          select: {
            phases: true,
            tasks: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    if (povs.length === 0) {
      const queryTime = Date.now() - startTime;
      povLogger.debug({ queryTimeMs: queryTime }, 'no POVs found');
      return [];
    }

    // Step 2: Batch fetch additional data for list enhancement
    const povIds = povs.map(pov => pov.id);
    const teamIds = [...new Set(povs.map(pov => pov.teamId).filter(Boolean))] as string[];
    const templateIds = [...new Set(povs.map(pov => pov.templateId).filter(Boolean))] as string[];

    // Batch fetch teams and templates in parallel
    const [teams, templates, taskSummaries, recentActivities] = await Promise.all([
      // Teams with member count only
      teamIds.length > 0 ? prisma.team.findMany({
        where: { id: { in: teamIds } },
        select: {
          id: true,
          name: true,
          _count: { select: { members: true } }
        },
        take: 200
      }) : [],

      // Templates basic info
      templateIds.length > 0 ? prisma.pOVTemplate.findMany({
        where: { id: { in: templateIds } },
        select: { id: true, name: true, description: true },
        take: 100
      }) : [],

      // Task summaries per POV (aggregated for performance)
      prisma.task.groupBy({
        by: ['povId', 'status'],
        where: { povId: { in: povIds } },
        _count: { id: true }
      }),

      // Most recent activity per POV (1 per POV for list view)
      // NOTE: Activity model doesn't have povId, taskId, phaseId, description fields
      // We need to get activities by user IDs associated with these POVs
      prisma.activity.findMany({
        where: { 
          userId: { 
            in: povs.map(pov => pov.ownerId).filter(Boolean)
          }
        },
        select: {
          id: true,
          userId: true,
          type: true,
          action: true, // action field exists, not description
          createdAt: true,
          metadata: true,
          user: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: povIds.length * 2 // 2 per POV max for list view
      })
    ]);

    // Step 3: Create lookup maps for efficient assembly
    const teamMap = new Map(teams.map(team => [team.id, team]));
    const templateMap = new Map(templates.map(template => [template.id, template]));

    // Group task summaries by POV ID and status
    const taskSummariesByPov = new Map<string, Map<string, number>>();
    taskSummaries.forEach(summary => {
      if (summary.povId) {
        if (!taskSummariesByPov.has(summary.povId)) {
          taskSummariesByPov.set(summary.povId, new Map());
        }
        taskSummariesByPov.get(summary.povId)!.set(summary.status, summary._count.id);
      }
    });

    // Group recent activities by user ID (since Activity has userId, not povId)
    const activitiesByUserId = new Map<string, (typeof recentActivities)[number][]>();
    recentActivities.forEach(activity => {
      if (activity.userId) {
        if (!activitiesByUserId.has(activity.userId)) {
          activitiesByUserId.set(activity.userId, []);
        }
        if (activitiesByUserId.get(activity.userId)!.length < 2) { // Max 2 per user
          activitiesByUserId.get(activity.userId)!.push(activity);
        }
      }
    });

    // Step 4: Assemble enhanced POV list with summary data
    const enhancedPovs = povs.map(pov => {
      const taskSummary = taskSummariesByPov.get(pov.id) || new Map();
      const team = teamMap.get(pov.teamId || '');
      const template = templateMap.get(pov.templateId || '');
      const recentActivity = activitiesByUserId.get(pov.ownerId)?.[0];

      return {
        ...pov,
        team: team ? {
          id: team.id,
          name: team.name,
          memberCount: team._count.members
        } : null,
        template,
        summary: {
          totalPhases: pov._count.phases,
          totalTasks: pov._count.tasks,
          taskCounts: {
            total: Array.from(taskSummary.values()).reduce((sum, count) => sum + count, 0),
            completed: taskSummary.get('COMPLETED') || 0,
            inProgress: taskSummary.get('IN_PROGRESS') || 0,
            open: taskSummary.get('OPEN') || 0,
            blocked: taskSummary.get('BLOCKED') || 0
          },
          lastActivity: recentActivity ? {
            type: recentActivity.type,
            action: recentActivity.action, // Use action field, not description
            createdAt: recentActivity.createdAt,
            user: recentActivity.user
          } : null,
          progress: {
            completed: taskSummary.get('COMPLETED') || 0,
            total: Array.from(taskSummary.values()).reduce((sum, count) => sum + count, 0)
          }
        }
      };
    });

    const queryTime = Date.now() - startTime;
    povLogger.debug({ count: enhancedPovs.length, queryTimeMs: queryTime }, 'POV list retrieved');

    return enhancedPovs;
  }

  /**
   * Generic POV column writer — does NOT validate status transitions.
   * Lifecycle-`status` writes MUST be guarded by `statusService.validateTransition` at the
   * call site (see lib/pov/handlers/put.ts:362 and the MCP pov-update-handler) BEFORE calling
   * this. The transition state machine is enforced at the handlers, not here — do not add a
   * `status` lifecycle write through this method without a guard (review §5.5, 2026-06-22).
   */
  async update(id: string, data: PoVUpdateInput) {
    povLogger.debug({ povId: id }, 'updating POV');

    // Perform the update
    await prisma.pOV.update({
      where: { id },
      data,
    });

    // Use this.get() to fetch with same metadata preservation as GET endpoint
    const updatedPov = await this.get(id);

    povLogger.debug({ povId: updatedPov?.id, hasMetadata: !!updatedPov?.metadata }, 'POV updated successfully');
    return updatedPov;
  }

  async delete(id: string, userId?: string) {
    // 2026-05-27 FIX: the FK is POV.teamId -> Team with onDelete:Cascade, which fires when
    // the TEAM is deleted, NOT when the POV is. So deleting the POV does NOT remove its
    // 1:1 Team — the prior comment (audit Finding #12) was wrong, and every POV delete
    // leaked an orphaned Team + TeamMember rows (3 found orphaned on prod 2026-05-27).
    // We now explicitly delete the Team AFTER the POV: once the POV is gone its FK to the
    // Team is gone, so the now-unreferenced Team can be deleted, which cascades its
    // TeamMember rows. (Phases/stages/tasks are already cascade-removed by the POV delete;
    // Task.teamId SetNulls harmlessly.) All in one tx with the audit write.
    return prisma.$transaction(async (tx) => {
      const deleted = await tx.pOV.delete({
        where: { id },
      });

      // Remove the now-orphaned 1:1 Team (cascades its TeamMember rows). deleteMany so a
      // missing/null team is a safe no-op rather than a P2025 throw.
      if (deleted.teamId) {
        await tx.team.deleteMany({ where: { id: deleted.teamId } });
      }

      if (userId) {
        await tx.activity.create({
          data: {
            type: PoVActivityType.POV_DELETED,
            action: PoVActivityType.POV_DELETED,
            metadata: {
              povId: id,
              title: deleted.title,
              teamId: deleted.teamId,  // null if POV had no team
            },
            user: { connect: { id: userId } },
          },
        });
      }

      return deleted;
    });
  }

  async getPhase(id: string) {
    return prisma.phase.findUnique({
      where: { id },
      include: {
        pov: {
          include: fullPOV.include,
        },
      },
    })
  }

  async getPhases(povId: string) {
    return prisma.phase.findMany({
      where: {
        povId,
      },
      include: {
        stages: {
          include: {
            tasks: {
              include: {
                assignee: true
              },
              take: 50, // Safety cap per stage
              orderBy: { order: 'asc' }
            }
          },
          orderBy: {
            order: 'asc'
          }
        },
        tasks: {
          include: {
            assignee: true
          },
          take: 100, // Safety cap for phase-level tasks
          orderBy: { order: 'asc' }
        },
        template: true
      },
      orderBy: [
        // 1. Order by Phase Type (logical workflow: PLANNING → EXECUTION → REVIEW)
        {
          type: 'asc'
        },
        // 2. Order by Phase order (within same type)
        {
          order: 'asc'
        }
      ],
      take: 50
    })
  }

  async createPhase(povId: string, data: Prisma.PhaseCreateInput) {
    return prisma.phase.create({
      data: {
        ...data,
        pov: {
          connect: { id: povId },
        },
      },
      include: {
        stages: {
          include: {
            tasks: {
              include: {
                assignee: true
              }
            }
          },
          orderBy: {
            order: 'asc'
          }
        },
        tasks: {
          include: {
            assignee: true
          }
        },
        template: true
      },
    })
  }

  async updatePhase(id: string, data: Prisma.PhaseUpdateInput) {
    return prisma.phase.update({
      where: { id },
      data,
      include: {
        stages: {
          include: {
            tasks: {
              include: {
                assignee: true
              }
            }
          },
          orderBy: {
            order: 'asc'
          }
        },
        tasks: {
          include: {
            assignee: true
          }
        },
        template: true
      },
    })
  }

  async deletePhase(id: string) {
    return prisma.phase.delete({
      where: { id },
    })
  }

  // reorderPhases() deleted 2026-05-14 — sole caller was the
  // reorderPhasesHandler which itself was on an orphaned route with a
  // double-body-read bug. Canonical phase-reorder method is
  // phaseService.reorderPhases (lib/pov/services/phase.ts:255), used by
  // the live /api/pov/[povId]/phases endpoint.
}

export const povService = new PoVService()
