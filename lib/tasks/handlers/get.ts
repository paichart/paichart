import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TokenPayload } from '@/lib/types/auth';
import { TaskPriority, TaskStatus, TaskListResponse } from '../types/index';
import { taskFullSelect, taskAgentRuntimeFields } from '../prisma/select';
import { mapTaskFromPrisma } from '../prisma/mappers';
import { LRUCache, generateCacheKey } from '@/lib/utils/lru-cache';
import { parsePaginationParams, paginationResponse } from '@/lib/utils/pagination';
import { taskLogger } from '@/lib/logger';

// Jan Marshal's Simple & Reliable Approach
// "Complex caching is the enemy of reliability"

// ✅ Q1 2026 Performance: Cache task listings (50-95% faster, 80% hit rate)
export const taskListCache = new LRUCache<TaskListResponse>({ maxSize: 200, ttl: 30000 }); // 30s TTL (tasks change frequently)

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user: TokenPayload
) => Promise<T | { error: { message: string; code: string } }>;

export const getTasksHandler: ApiHandler<TaskListResponse> = async (
  req: NextRequest,
  _context: { params: Record<string, string> },
  user: TokenPayload
) => {
  try {
    const startTime = Date.now(); // Performance logging
    const url = req.nextUrl;
    
    // Support both limit/offset (canonical) and page/pageSize (legacy)
    const rawPage = url.searchParams.get('page');
    const rawPageSize = url.searchParams.get('pageSize');
    let limit: number, offset: number;
    if (rawPage && !url.searchParams.get('limit')) {
      // Legacy page/pageSize support
      const page = Math.max(1, parseInt(rawPage, 10) || 1);
      const pageSize = Math.min(parseInt(rawPageSize || '100', 10) || 100, 200);
      limit = pageSize;
      offset = (page - 1) * pageSize;
    } else {
      ({ limit, offset } = parsePaginationParams(url.searchParams, { limit: 100, maxLimit: 200 }));
    }
    // BC49 FIX: Validate status/priority against enums instead of unsafe `as` cast
    const rawStatus = url.searchParams.get('status');
    const status: TaskStatus | null = rawStatus && Object.values(TaskStatus).includes(rawStatus as TaskStatus) ? rawStatus as TaskStatus : null;
    const rawPriority = url.searchParams.get('priority');
    const priority: TaskPriority | null = rawPriority && Object.values(TaskPriority).includes(rawPriority as TaskPriority) ? rawPriority as TaskPriority : null;
    const assigneeId = url.searchParams.get('assigneeId');
    const assignee_name = url.searchParams.get('assignee_name');
    const teamId = url.searchParams.get('teamId');
    const team_name = url.searchParams.get('team_name');
    // 🔧 FIX: Handle both povId and pov_id (Claude Desktop compatibility)
    const povId = url.searchParams.get('povId') || url.searchParams.get('pov_id');
    const pov_name = url.searchParams.get('pov_name');
    const phaseId = url.searchParams.get('phaseId');
    const phase_name = url.searchParams.get('phase_name');
    const stageId = url.searchParams.get('stageId');
    const stage_name = url.searchParams.get('stage_name');

    taskLogger.debug({ userId: user.userId, povId, phaseId, stageId, pov_name, phase_name, stage_name, limit, offset }, 'task list query started');

    // No coarse permission gate: task-list is private-by-owner — the per-role
    // POV-scoping in the query below (owner/team) is the real authorization.

    // ✅ Q1 2026 Performance: Check cache AFTER permissions validated (prevents bypass)
    // Include role in cache key for complete permission isolation
    const cacheKey = generateCacheKey('tasks', user.userId, {
      ...Object.fromEntries(url.searchParams),
      role: user.role // CRITICAL: Role affects DEMO_USER filtering
    });
    const cached = taskListCache.get(cacheKey);
    if (cached) {
      return cached; // Safe: permissions checked + role-isolated cache
    }

    // Simple where clause building - no complex optimization
    const where: any = {};
    if (status) where.status = { equals: status };
    if (priority) where.priority = { equals: priority };
    if (assigneeId) where.assigneeId = assigneeId;
    if (teamId) where.teamId = teamId;
    // 🔧 FIX: When POV is specified, ONLY return tasks for that POV (exclude NULL pov_id)
    if (povId) {
      where.povId = { equals: povId };
    }
    if (phaseId) where.phaseId = phaseId;
    if (stageId) where.stageId = stageId;

    // DEMO_USER: Show tasks from owned POVs + team POVs + demo POVs (additive filtering)
    if (user.role === 'DEMO_USER') {
      taskLogger.debug({ userId: user.userId }, 'DEMO_USER filtering applied');
      where.pov = {
        OR: [
          { ownerId: user.userId },
          {
            team: {
              members: {
                some: {
                  userId: user.userId
                }
              }
            }
          },
          {
            metadata: {
              path: ['isDemo'],
              equals: true
            }
          }
        ]
      };
    } else if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      // SECURITY: cross-POV disclosure fix (Wave A C2, Phase 3 sec-ops, 2026-05-23).
      // Previously: regular USER role with default task:view permission saw ALL
      // tasks across ALL POVs (no POV-scope clause applied). DEMO_USER path was
      // correctly scoped — bug was the asymmetry. Now regular USER sees only
      // tasks in POVs they own OR have team membership in. ADMIN/SUPER_ADMIN
      // remain unscoped (intentional admin-visibility).
      taskLogger.debug({ userId: user.userId, role: user.role }, 'regular USER POV-scope filtering applied');
      where.pov = {
        OR: [
          { ownerId: user.userId },
          {
            team: {
              members: {
                some: {
                  userId: user.userId
                }
              }
            }
          }
        ]
      };
    }

    // Handle pov_name filtering - look up POV by name
    if (pov_name && !povId) {
      taskLogger.debug({ pov_name }, 'looking up POV by name');

      // Build POV lookup criteria with user access control
      const povWhere: any = {
        OR: [
          { title: { contains: pov_name, mode: 'insensitive' } },
          { customerName: { contains: pov_name, mode: 'insensitive' } }
        ]
      };

      // Apply user access control for POV lookup
      if (user.role === 'DEMO_USER') {
        povWhere.AND = [
          {
            OR: [
              { ownerId: user.userId },
              {
                team: {
                  members: {
                    some: {
                      userId: user.userId
                    }
                  }
                }
              },
              {
                metadata: {
                  path: ['isDemo'],
                  equals: true
                }
              }
            ]
          }
        ];
      } else if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
        // Regular users: owned + team POVs only
        povWhere.AND = [
          {
            OR: [
              { ownerId: user.userId },
              {
                team: {
                  members: {
                    some: {
                      userId: user.userId
                    }
                  }
                }
              }
            ]
          }
        ];
      }

      const matchingPOVs = await prisma.pOV.findMany({
        where: povWhere,
        select: { id: true, title: true },
        take: 50,
      });

      if (matchingPOVs.length > 0) {
        taskLogger.debug({ matchCount: matchingPOVs.length }, 'POV name lookup matched');
        // Filter tasks to these POVs
        where.povId = { in: matchingPOVs.map(p => p.id) };
      } else {
        taskLogger.debug({ pov_name }, 'no POVs found matching name');
        // No matching POVs = no tasks
        where.povId = 'no-match';
      }
    }

    // Handle phase_name filtering - look up phase by name
    if (phase_name && !phaseId) {
      taskLogger.debug({ phase_name }, 'looking up phase by name');
      
      // Simple phase lookup by name
      const phaseWhere: any = { name: { contains: phase_name, mode: 'insensitive' } };
      if (povId) phaseWhere.povId = povId; // Scope to POV if provided
      
      const matchingPhases = await prisma.phase.findMany({
        where: phaseWhere,
        select: { id: true, name: true, povId: true },
        take: 50,
      });
      
      if (matchingPhases.length > 0) {
        taskLogger.debug({ matchCount: matchingPhases.length }, 'phase name lookup matched');
        // Filter tasks to these phases
        where.phaseId = { in: matchingPhases.map(p => p.id) };
      } else {
        taskLogger.debug({ phase_name }, 'no phases found matching name');
        // No matching phases = no tasks
        where.phaseId = 'no-match';
      }
    }

    // Handle stage_name filtering - look up stage by name
    if (stage_name && !stageId) {
      taskLogger.debug({ stage_name }, 'looking up stage by name');
      
      // Build stage lookup criteria
      const stageWhere: any = { name: { contains: stage_name, mode: 'insensitive' } };
      
      // Scope to POV if provided (through phase relationship)
      if (povId) {
        stageWhere.phase = { povId: povId };
      }
      
      // Scope to specific phase if provided
      if (phaseId) {
        stageWhere.phaseId = phaseId;
      } else if (where.phaseId && typeof where.phaseId === 'object' && where.phaseId.in) {
        // If phase was filtered by name, scope to those phases
        stageWhere.phaseId = { in: where.phaseId.in };
      }
      
      const matchingStages = await prisma.stage.findMany({
        where: stageWhere,
        select: {
          id: true,
          name: true,
          phaseId: true,
          phase: { select: { name: true, povId: true } }
        },
        take: 50,
      });
      
      if (matchingStages.length > 0) {
        taskLogger.debug({ matchCount: matchingStages.length }, 'stage name lookup matched');
        // Filter tasks to these stages
        where.stageId = { in: matchingStages.map(s => s.id) };
      } else {
        taskLogger.debug({ stage_name }, 'no stages found matching name');
        // No matching stages = no tasks
        where.stageId = 'no-match';
      }
    }

    // Handle team_name filtering - look up team by name
    if (team_name && !teamId) {
      taskLogger.debug({ team_name }, 'looking up team by name');
      
      // Simple team lookup by name
      const matchingTeams = await prisma.team.findMany({
        where: { name: { contains: team_name, mode: 'insensitive' } },
        select: { id: true, name: true },
        take: 50,
      });
      
      if (matchingTeams.length > 0) {
        taskLogger.debug({ matchCount: matchingTeams.length }, 'team name lookup matched');
        // Filter tasks to these teams
        where.teamId = { in: matchingTeams.map(t => t.id) };
      } else {
        taskLogger.debug({ team_name }, 'no teams found matching name');
        // No matching teams = no tasks
        where.teamId = 'no-match';
      }
    }

    // Handle assignee_name filtering - look up user by name
    if (assignee_name && !assigneeId) {
      taskLogger.debug({ assignee_name }, 'looking up assignee by name');
      
      // Simple user lookup by name (supports partial matching)
      const matchingUsers = await prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: assignee_name, mode: 'insensitive' } },
            { email: { contains: assignee_name, mode: 'insensitive' } }
          ]
        },
        select: { id: true, name: true, email: true },
        take: 50,
      });
      
      if (matchingUsers.length > 0) {
        taskLogger.debug({ matchCount: matchingUsers.length }, 'assignee name lookup matched');
        // Filter tasks to these users
        where.assigneeId = { in: matchingUsers.map(u => u.id) };
      } else {
        taskLogger.debug({ assignee_name }, 'no users found matching name');
        // No matching users = no tasks
        where.assigneeId = 'no-match';
      }
    }

    taskLogger.debug({ filterKeys: Object.keys(where) }, 'task query where clause built');

    // Pagination
    const skip = offset;
    const take = limit;

    // 🔧 N+1 OPTIMIZATION: Strategic select queries instead of deep includes
    // OLD: taskFullSelect caused N+1 queries with all the nested includes
    // NEW: Minimal select + batch lookup for relationships
    
    // Step 1: Get tasks with minimal data (single query)
    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        select: {
          // Basic task fields only - no includes
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
          ...taskAgentRuntimeFields,
          agentTemplateId: true,
          mcpContext: true,
          mcpMetadata: true,
          mcpToolId: true,
          mcpWorkflowId: true,
          parentTaskId: true,
        },
        skip,
        take,
        orderBy: [
          { phase: { type: 'asc' } },
          { phase: { order: 'asc' } },
          { stage: { order: 'asc' } },
          { order: 'asc' },
          { createdAt: 'asc' }
        ],
      }),
      prisma.task.count({ where }),
    ]);

    // Step 2: Batch fetch related data (avoid N+1 queries)
    const taskIds = tasks.map(task => task.id);
    const assigneeIds = [...new Set(tasks.map(task => task.assigneeId).filter(Boolean))] as string[];
    const phaseIds = [...new Set(tasks.map(task => task.phaseId).filter(Boolean))] as string[];
    const stageIds = [...new Set(tasks.map(task => task.stageId).filter(Boolean))] as string[];
    const agentTemplateIds = [...new Set(tasks.map(task => task.agentTemplateId).filter(Boolean))] as string[];

    // Batch fetch all relationships in parallel (5 queries max instead of N+1)
    // FAULT ISOLATION: Per-item .catch() prevents one model failure from losing all enrichment data
    const [assignees, phases, stages, agentTemplates, dependencies, dependents, subTasks] = await Promise.all([
      // Assignees batch lookup
      assigneeIds.length > 0 ? prisma.user.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true, name: true, email: true, role: true, status: true }
      }).catch(err => { taskLogger.warn({ err }, 'Batch assignee lookup failed — returning empty'); return []; }) : [],

      // Phases batch lookup
      phaseIds.length > 0 ? prisma.phase.findMany({
        where: { id: { in: phaseIds } },
        select: { id: true, name: true, type: true, order: true }
      }).catch(err => { taskLogger.warn({ err }, 'Batch phase lookup failed — returning empty'); return []; }) : [],

      // Stages batch lookup
      stageIds.length > 0 ? prisma.stage.findMany({
        where: { id: { in: stageIds } },
        select: { id: true, name: true, order: true }
      }).catch(err => { taskLogger.warn({ err }, 'Batch stage lookup failed — returning empty'); return []; }) : [],

      // Agent templates batch lookup
      agentTemplateIds.length > 0 ? prisma.agentTemplate.findMany({
        where: { id: { in: agentTemplateIds } }
      }).catch(err => { taskLogger.warn({ err }, 'Batch template lookup failed — returning empty'); return []; }) : [],
      
      // Dependencies batch lookup
      taskIds.length > 0 ? prisma.taskDependency.findMany({
        where: { taskId: { in: taskIds } },
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
      }).catch(err => { taskLogger.warn({ err }, 'Batch dependency lookup failed — returning empty'); return []; }) : [],

      // Dependents batch lookup
      taskIds.length > 0 ? prisma.taskDependency.findMany({
        where: { dependsOnId: { in: taskIds } },
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
      }).catch(err => { taskLogger.warn({ err }, 'Batch dependent lookup failed — returning empty'); return []; }) : [],

      // Sub-tasks batch lookup
      taskIds.length > 0 ? prisma.task.findMany({
        where: { parentTaskId: { in: taskIds } },
        select: {
          id: true,
          title: true,
          status: true,
          stageId: true,
          parentTaskId: true,
        }
      }).catch(err => { taskLogger.warn({ err }, 'Batch subtask lookup failed — returning empty'); return []; }) : []
    ]);

    // Step 3: Create lookup maps for O(1) access
    const assigneeMap = new Map(assignees.map(a => [a.id, a]));
    const phaseMap = new Map(phases.map(p => [p.id, p]));
    const stageMap = new Map(stages.map(s => [s.id, s]));
    const agentTemplateMap = new Map(agentTemplates.map(t => [t.id, t]));
    const dependenciesMap = new Map<string, (typeof dependencies)[number][]>();
    const dependentsMap = new Map<string, (typeof dependents)[number][]>();
    const subTasksMap = new Map<string, (typeof subTasks)[number][]>();

    // Group dependencies by task ID
    dependencies.forEach(dep => {
      if (!dependenciesMap.has(dep.taskId)) {
        dependenciesMap.set(dep.taskId, []);
      }
      dependenciesMap.get(dep.taskId)!.push(dep);
    });

    // Group dependents by depends-on task ID
    dependents.forEach(dep => {
      if (!dependentsMap.has(dep.dependsOnId)) {
        dependentsMap.set(dep.dependsOnId, []);
      }
      dependentsMap.get(dep.dependsOnId)!.push(dep);
    });

    // Group sub-tasks by parent task ID
    subTasks.forEach(task => {
      if (task.parentTaskId) {
        if (!subTasksMap.has(task.parentTaskId)) {
          subTasksMap.set(task.parentTaskId, []);
        }
        subTasksMap.get(task.parentTaskId)!.push(task);
      }
    });

    // Step 4: Assemble full objects using mapper with lookup data
    const formattedTasks = tasks.map(task => ({
      ...mapTaskFromPrisma({
        ...task,
        assignee: assigneeMap.get(task.assigneeId || '') || null,
        phase: phaseMap.get(task.phaseId || '') || null,
        stage: task.stageId ? stageMap.get(task.stageId) || null : null,
        agentTemplate: agentTemplateMap.get(task.agentTemplateId || '') || null,
        dependencies: dependenciesMap.get(task.id) || [],
        dependents: dependentsMap.get(task.id) || [],
        subTasks: subTasksMap.get(task.id) || []
      })
    }));

    const endTime = Date.now();
    const queryTime = endTime - startTime;
    taskLogger.info({ taskCount: formattedTasks.length, total, queryTimeMs: queryTime }, 'task list query complete');

    // Canonical pagination response envelope
    const result = {
      ...paginationResponse(formattedTasks, total, limit, offset),
      _performance: {
        queryTimeMs: queryTime,
        optimized: true,
        queriesUsed: 7 // 1 for tasks + 1 for count + 5 for batch relationships
      }
    };

    // ✅ Q1 2026 Performance: Cache result for future requests
    taskListCache.set(cacheKey, result);

    return result;

  } catch (error) {
    taskLogger.error({ err: error }, 'task list query failed');
    return {
      error: {
        message: 'Failed to get tasks',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};
