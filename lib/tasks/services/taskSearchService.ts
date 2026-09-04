import { prisma } from '@/lib/prisma';
import { TokenPayload } from '@/lib/types/auth';
import { TaskPriority, TaskStatus } from '@/lib/tasks/types';
import { taskLogger } from '@/lib/logger';
import { buildPOVAccessFilterWithRole } from '@/lib/pov/auth/pov-access-filter';

const log = taskLogger.child({ module: 'TaskSearchService' });

// Optimized Task Search Service - Task 10
// Fixes complex filtering that causes multiple sequential queries

interface TaskSearchFilters {
  query?: string; // Text search across title/description
  status?: TaskStatus[];
  priority?: TaskPriority[];
  assigneeIds?: string[];
  teamIds?: string[];
  povIds?: string[];
  phaseIds?: string[];
  stageIds?: string[];
  assigneeName?: string; // Search by assignee name/email
  teamName?: string; // Search by team name
  povName?: string; // Search by POV title
  phaseName?: string; // Search by phase name
  stageName?: string; // Search by stage name
  dateRange?: {
    field: 'createdAt' | 'updatedAt' | 'dueDate';
    start?: Date;
    end?: Date;
  };
  tags?: string[]; // Search in metadata tags
  hasAgentTemplate?: boolean;
  executionStatus?: string[];
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'updatedAt' | 'dueDate' | 'priority' | 'title' | 'order';
  orderDir?: 'asc' | 'desc';
}

interface OptimizedTaskSearchResult {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  type: string;
  order: number;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assignee: {
    id: string;
    name: string;
    email: string;
  } | null;
  team: {
    id: string;
    name: string;
  } | null;
  pov: {
    id: string;
    title: string;
  } | null;
  phase: {
    id: string;
    name: string;
    type: string;
  } | null;
  stage: {
    id: string;
    name: string;
  } | null;
  metadata: any;
  agentTemplate: {
    id: string;
    name: string;
  } | null;
  executionStatus: string | null;
  _relevanceScore?: number; // For text search ranking
}

/**
 * OPTIMIZED: Search and filter tasks with optimized query building
 * 
 * BEFORE (Sequential Query Pattern):
 * 1. Query tasks: SELECT * FROM tasks WHERE ...
 * 2. If assigneeName: SELECT users WHERE name LIKE ... (separate query)
 * 3. If teamName: SELECT teams WHERE name LIKE ... (separate query) 
 * 4. If povName: SELECT povs WHERE title LIKE ... (separate query)
 * 5. If phaseName: SELECT phases WHERE name LIKE ... (separate query)
 * 6. If stageName: SELECT stages WHERE name LIKE ... (separate query)
 * 7. Re-query tasks with filtered IDs (another query)
 * 8. For each task, include relationships (N more queries)
 * Total: Up to 7 + N queries, causing 200ms+ delays
 * 
 * AFTER (Single Optimized Query):
 * 1. Pre-resolve all name-based filters to IDs in parallel
 * 2. Build single complex query with strategic includes
 * 3. Use database-level text search for relevance ranking
 * Total: 2-3 queries regardless of complexity
 * 
 * Expected Impact: 200ms → 50ms for complex searches
 */
export async function searchAndFilterTasks(
  filters: TaskSearchFilters,
  user: TokenPayload
): Promise<{
  data: OptimizedTaskSearchResult[];
  total: number;
  pagination: {
    hasMore: boolean;
    offset: number;
    limit: number;
  };
  searchMeta?: {
    queryTime: number;
    filtersApplied: string[];
    textSearchUsed: boolean;
  };
}> {
  log.info('starting optimized task search');
  const startTime = Date.now();
  const filtersApplied: string[] = [];

  try {
    const limit = Math.min(filters.limit || 50, 200);
    const offset = filters.offset || 0;

    // OPTIMIZATION STEP 1: Pre-resolve all name-based filters in parallel
    log.debug('pre-resolving name-based filters');
    const nameResolutions = await resolveNameFiltersInParallel(filters);
    
    // Merge resolved IDs with direct ID filters
    const resolvedFilters = mergeResolvedFilters(filters, nameResolutions);

    // OPTIMIZATION STEP 2: Build optimized where clause (includes user access scope)
    const where = buildOptimizedWhereClause(resolvedFilters, filtersApplied, user);
    
    // OPTIMIZATION STEP 3: Build optimized orderBy clause
    const orderBy = buildOrderByClause(filters);

    // OPTIMIZATION STEP 4: Execute optimized query with strategic includes
    log.debug('executing optimized search query');
    
    const useTextSearch = !!(filters.query && filters.query.length > 0);
    if (useTextSearch) {
      filtersApplied.push('textSearch');
    }

    const [tasks, totalCount] = await Promise.all([
      executeOptimizedTaskQuery(where, orderBy, limit, offset, useTextSearch, filters.query),
      prisma.task.count({ where })
    ]);

    // OPTIMIZATION STEP 5: Calculate relevance scores for text search
    const resultsWithScoring = useTextSearch 
      ? calculateRelevanceScores(tasks, filters.query!)
      : tasks;

    const queryTime = Date.now() - startTime;
    log.info({
      totalTasks: tasks.length,
      queryTimeMs: queryTime,
      filtersApplied,
      textSearchUsed: useTextSearch,
      queriesExecuted: nameResolutions.queriesExecuted + 2,
    }, 'search optimization complete');

    return {
      data: resultsWithScoring,
      total: totalCount,
      pagination: {
        hasMore: offset + tasks.length < totalCount,
        offset,
        limit
      },
      searchMeta: {
        queryTime,
        filtersApplied,
        textSearchUsed: useTextSearch
      }
    };

  } catch (error) {
    log.error({ err: error }, 'task search failed');
    throw new Error('Failed to search and filter tasks');
  }
}

/**
 * OPTIMIZATION: Resolve all name-based filters in parallel
 */
async function resolveNameFiltersInParallel(filters: TaskSearchFilters): Promise<{
  assigneeIds: string[];
  teamIds: string[];
  povIds: string[];
  phaseIds: string[];
  stageIds: string[];
  queriesExecuted: number;
}> {
  const promises: Promise<any>[] = [];
  let queriesExecuted = 0;

  // Assignee name resolution
  if (filters.assigneeName) {
    promises.push(
      prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: filters.assigneeName, mode: 'insensitive' } },
            { email: { contains: filters.assigneeName, mode: 'insensitive' } }
          ]
        },
        select: { id: true },
        take: 50,
      }).then(users => ({ type: 'assignee', ids: users.map(u => u.id) }))
    );
    queriesExecuted++;
  }

  // Team name resolution  
  if (filters.teamName) {
    promises.push(
      prisma.team.findMany({
        where: { name: { contains: filters.teamName, mode: 'insensitive' } },
        select: { id: true },
        take: 50,
      }).then(teams => ({ type: 'team', ids: teams.map(t => t.id) }))
    );
    queriesExecuted++;
  }

  // POV name resolution
  if (filters.povName) {
    promises.push(
      prisma.pOV.findMany({
        where: { title: { contains: filters.povName, mode: 'insensitive' } },
        select: { id: true },
        take: 50,
      }).then(povs => ({ type: 'pov', ids: povs.map(p => p.id) }))
    );
    queriesExecuted++;
  }

  // Phase name resolution
  if (filters.phaseName) {
    promises.push(
      prisma.phase.findMany({
        where: { name: { contains: filters.phaseName, mode: 'insensitive' } },
        select: { id: true },
        take: 50,
      }).then(phases => ({ type: 'phase', ids: phases.map(p => p.id) }))
    );
    queriesExecuted++;
  }

  // Stage name resolution
  if (filters.stageName) {
    promises.push(
      prisma.stage.findMany({
        where: { name: { contains: filters.stageName, mode: 'insensitive' } },
        select: { id: true },
        take: 50,
      }).then(stages => ({ type: 'stage', ids: stages.map(s => s.id) }))
    );
    queriesExecuted++;
  }

  const results = await Promise.all(promises);
  
  return {
    assigneeIds: results.find(r => r.type === 'assignee')?.ids || [],
    teamIds: results.find(r => r.type === 'team')?.ids || [],
    povIds: results.find(r => r.type === 'pov')?.ids || [],
    phaseIds: results.find(r => r.type === 'phase')?.ids || [],
    stageIds: results.find(r => r.type === 'stage')?.ids || [],
    queriesExecuted
  };
}

/**
 * Merge resolved name filters with direct ID filters
 */
function mergeResolvedFilters(
  filters: TaskSearchFilters, 
  nameResolutions: {
    assigneeIds: string[];
    teamIds: string[];
    povIds: string[];
    phaseIds: string[];
    stageIds: string[];
    queriesExecuted: number;
  }
) {
  return {
    ...filters,
    assigneeIds: [
      ...(filters.assigneeIds || []),
      ...nameResolutions.assigneeIds
    ],
    teamIds: [
      ...(filters.teamIds || []),
      ...nameResolutions.teamIds
    ],
    povIds: [
      ...(filters.povIds || []),
      ...nameResolutions.povIds
    ],
    phaseIds: [
      ...(filters.phaseIds || []),
      ...nameResolutions.phaseIds
    ],
    stageIds: [
      ...(filters.stageIds || []),
      ...nameResolutions.stageIds
    ]
  };
}

/**
 * Build optimized where clause with all filters
 */
function buildOptimizedWhereClause(filters: TaskSearchFilters, filtersApplied: string[], user: TokenPayload): any {
  const where: any = {};

  // Text search across title and description
  if (filters.query && filters.query.length > 0) {
    where.OR = [
      { title: { contains: filters.query, mode: 'insensitive' } },
      { description: { contains: filters.query, mode: 'insensitive' } }
    ];
    filtersApplied.push('textQuery');
  }

  // Status filter
  if (filters.status && filters.status.length > 0) {
    where.status = { in: filters.status };
    filtersApplied.push('status');
  }

  // Priority filter
  if (filters.priority && filters.priority.length > 0) {
    where.priority = { in: filters.priority };
    filtersApplied.push('priority');
  }

  // Assignee filter (includes resolved names)
  if (filters.assigneeIds && filters.assigneeIds.length > 0) {
    where.assigneeId = { in: filters.assigneeIds };
    filtersApplied.push('assignee');
  }

  // Team filter (includes resolved names)
  if (filters.teamIds && filters.teamIds.length > 0) {
    where.teamId = { in: filters.teamIds };
    filtersApplied.push('team');
  }

  // POV filter (includes resolved names)
  if (filters.povIds && filters.povIds.length > 0) {
    where.povId = { in: filters.povIds };
    filtersApplied.push('pov');
  }

  // POV access scope (composes via AND with explicit povIds above)
  // Admin: filter is {} → relation match passes for all POVs (no-op)
  // Non-admin: filter restricts to owned + team-member POVs (+ demo POVs for DEMO_USER)
  const { filter: accessFilter, isAdmin } = buildPOVAccessFilterWithRole(user);
  if (!isAdmin) {
    where.pov = accessFilter;
    filtersApplied.push('povAccess');
  }

  // Phase filter (includes resolved names)
  if (filters.phaseIds && filters.phaseIds.length > 0) {
    where.phaseId = { in: filters.phaseIds };
    filtersApplied.push('phase');
  }

  // Stage filter (includes resolved names)
  if (filters.stageIds && filters.stageIds.length > 0) {
    where.stageId = { in: filters.stageIds };
    filtersApplied.push('stage');
  }

  // Date range filter
  if (filters.dateRange) {
    const dateFilter: any = {};
    if (filters.dateRange.start) {
      dateFilter.gte = filters.dateRange.start;
    }
    if (filters.dateRange.end) {
      dateFilter.lte = filters.dateRange.end;
    }
    where[filters.dateRange.field] = dateFilter;
    filtersApplied.push(`date-${filters.dateRange.field}`);
  }

  // Agent template filter
  if (filters.hasAgentTemplate !== undefined) {
    where.agentTemplateId = filters.hasAgentTemplate ? { not: null } : null;
    filtersApplied.push('hasAgentTemplate');
  }

  // Execution status filter
  if (filters.executionStatus && filters.executionStatus.length > 0) {
    where.executionStatus = { in: filters.executionStatus };
    filtersApplied.push('executionStatus');
  }

  // Tags filter (search in metadata)
  if (filters.tags && filters.tags.length > 0) {
    where.metadata = {
      path: ['tags'],
      array_contains: filters.tags
    };
    filtersApplied.push('tags');
  }

  return where;
}

/**
 * Build orderBy clause with smart defaults
 */
function buildOrderByClause(filters: TaskSearchFilters) {
  // BC66 FIX: Allowlist prevents dynamic orderBy injection
  const ALLOWED_ORDER_FIELDS = ['createdAt', 'updatedAt', 'dueDate', 'priority', 'title', 'order'] as const;
  const orderBy = ALLOWED_ORDER_FIELDS.includes(filters.orderBy as any) ? filters.orderBy! : 'order';
  const orderDir = filters.orderDir === 'desc' ? 'desc' : 'asc';

  // Smart ordering based on search context
  if (filters.query && filters.query.length > 0) {
    // For text search, prioritize title matches then creation date
    return [
      { title: 'asc' }, // Alphabetical for relevance
      { createdAt: 'desc' }
    ];
  }

  // Default hierarchical ordering for browsing
  return [
    { phase: { order: 'asc' } },
    { stage: { order: 'asc' } },
    { [orderBy]: orderDir },
    { createdAt: 'desc' }
  ];
}

/**
 * Execute the optimized task query with strategic includes
 */
async function executeOptimizedTaskQuery(
  where: any,
  orderBy: any,
  limit: number,
  offset: number,
  useTextSearch: boolean,
  query?: string
) {
  return prisma.task.findMany({
    where,
    select: {
      // Basic fields
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      type: true,
      order: true,
      dueDate: true,
      createdAt: true,
      updatedAt: true,
      metadata: true,
      executionStatus: true,
      
      // Strategic includes - only essential fields
      assignee: {
        select: {
          id: true,
          name: true,
          email: true,
        }
      },
      team: {
        select: {
          id: true,
          name: true,
        }
      },
      pov: {
        select: {
          id: true,
          title: true,
        }
      },
      phase: {
        select: {
          id: true,
          name: true,
          type: true,
        }
      },
      stage: {
        select: {
          id: true,
          name: true,
        }
      },
      agentTemplate: {
        select: {
          id: true,
          name: true,
        }
      }
    },
    orderBy,
    skip: offset,
    take: limit,
  });
}

/**
 * Calculate relevance scores for text search results
 */
function calculateRelevanceScores(tasks: any[], query: string): OptimizedTaskSearchResult[] {
  const normalizedQuery = query.toLowerCase();
  
  return tasks.map(task => ({
    ...task,
    _relevanceScore: calculateTaskRelevance(task, normalizedQuery)
  })).sort((a, b) => (b._relevanceScore || 0) - (a._relevanceScore || 0));
}

/**
 * Calculate relevance score for a single task
 */
function calculateTaskRelevance(task: any, normalizedQuery: string): number {
  let score = 0;
  
  const title = (task.title || '').toLowerCase();
  const description = (task.description || '').toLowerCase();
  
  // Exact title match gets highest score
  if (title === normalizedQuery) score += 100;
  // Title starts with query gets high score
  else if (title.startsWith(normalizedQuery)) score += 80;
  // Title contains query gets medium score
  else if (title.includes(normalizedQuery)) score += 60;
  
  // Description matches get lower scores
  if (description.includes(normalizedQuery)) score += 20;
  
  // Boost for certain task statuses
  if (task.status === 'OPEN') score += 10;
  if (task.priority === 'HIGH') score += 5;
  
  return score;
}

// Legacy sequential-query version replaced by the optimized one above —
// see git history for the pre-rewrite implementation. Block comment removed
// 2026-05-14 (dead-block-comment hazard, same class as Bug Class 75
// UpdatePOVSchemaInline; see bc60a6bb).

/**
 * Quick task search for autocomplete/typeahead
 */
export async function quickTaskSearch(
  query: string,
  limit: number = 10,
  user: TokenPayload
): Promise<Array<{
  id: string;
  title: string;
  status: TaskStatus;
  assigneeName?: string;
}>> {
  if (!query || query.length < 2) return [];
  
  log.debug({ query }, 'quick search');
  
  const tasks = await prisma.task.findMany({
    where: {
      title: { contains: query, mode: 'insensitive' }
    },
    select: {
      id: true,
      title: true,
      status: true,
      assignee: {
        select: { name: true }
      }
    },
    orderBy: { updatedAt: 'desc' },
    take: limit
  });
  
  return tasks.map(task => ({
    id: task.id,
    title: task.title,
    status: task.status,
    assigneeName: task.assignee?.name
  }));
}

/**
 * Get search suggestions based on user's recent activity
 */
export async function getSearchSuggestions(
  user: TokenPayload,
  limit: number = 5
): Promise<{
  recentTasks: string[];
  popularTags: string[];
  activeAssignees: string[];
}> {
  try {
    // Get suggestions based on user's recent activity
    const [recentTasks, recentActivities] = await Promise.all([
      // Recent task titles the user has interacted with
      prisma.task.findMany({
        where: {
          OR: [
            { assigneeId: user.userId },
            { activities: { some: { userId: user.userId } } }
          ]
        },
        select: { title: true },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        distinct: ['title']
      }),
      
      // Recent activities to find popular tags and assignees
      prisma.taskActivity.findMany({
        where: { userId: user.userId },
        include: {
          task: {
            select: {
              metadata: true,
              assignee: { select: { name: true } }
            }
          }
        },
        orderBy: { timestamp: 'desc' },
        take: 50
      })
    ]);
    
    // Extract tags and assignees from recent activities
    const tags = new Set<string>();
    const assignees = new Set<string>();
    
    recentActivities.forEach(activity => {
      if (activity.task?.metadata && typeof activity.task.metadata === 'object' && activity.task.metadata !== null) {
        const metadata = activity.task.metadata as any;
        if (Array.isArray(metadata.tags)) {
          metadata.tags.forEach((tag: string) => tags.add(tag));
        }
      }
      if (activity.task?.assignee?.name) {
        assignees.add(activity.task.assignee.name);
      }
    });
    
    return {
      recentTasks: recentTasks.map(t => t.title),
      popularTags: Array.from(tags).slice(0, limit),
      activeAssignees: Array.from(assignees).slice(0, limit)
    };
  } catch (error) {
    log.error({ err: error }, 'error getting suggestions');
    return {
      recentTasks: [],
      popularTags: [],
      activeAssignees: []
    };
  }
}