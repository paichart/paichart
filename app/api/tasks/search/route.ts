import { createHandler } from '@/lib/api-handler';
import { NextRequest } from 'next/server';
import { TokenPayload, ApiResponse } from '@/lib/types/auth';
import { searchAndFilterTasks, quickTaskSearch, getSearchSuggestions } from '@/lib/tasks/services/taskSearchService';
import { TaskPriority, TaskStatus } from '@/lib/tasks/types';
import { TaskSearchQuerySchema } from '@/lib/validation/task-validation';
import { taskLogger } from '@/lib/logger';

type ApiHandler<T = any> = (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => Promise<Response | ApiResponse<T>>;

// GET /api/tasks/search - Optimized task search and filtering
const getTaskSearchHandler: ApiHandler = async (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => {
  if (!user) {
    return {
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    };
  }

  try {
    taskLogger.debug({ userId: user.userId }, 'task search request started');
    const { searchParams } = new URL(req.url);

    // ✅ SECURITY: Basic query parameter validation (Week 3 P2 Polish)
    const queryParams = {
      q: searchParams.get('q') || undefined,
      query: searchParams.get('query') || undefined,
      limit: searchParams.get('limit') || undefined,
      offset: searchParams.get('offset') || undefined,
      quick: searchParams.get('quick') || undefined,
    };

    const validation = TaskSearchQuerySchema.safeParse(queryParams);
    if (!validation.success) {
      taskLogger.warn({ errors: validation.error.errors }, 'task search query validation failed');
      return {
        error: {
          message: 'Invalid query: ' + validation.error.errors.map(e => e.message).join(', '),
          code: 'VALIDATION_ERROR',
        },
      };
    }

    // Check for quick search mode
    const quickSearch = searchParams.get('quick');
    if (quickSearch === 'true') {
      const query = searchParams.get('q') || '';
      const limit = Math.min(parseInt(searchParams.get('limit') || '10') || 10, 200); // BC41 FIX: cap limit

      const results = await quickTaskSearch(query, limit, user);
      return { data: results };
    }
    
    // Check for suggestions mode
    const suggestions = searchParams.get('suggestions');
    if (suggestions === 'true') {
      const limit = Math.min(parseInt(searchParams.get('limit') || '5') || 5, 200); // BC41 FIX: cap limit
      const results = await getSearchSuggestions(user, limit);
      return { data: results };
    }

    // Parse comprehensive search parameters
    const filters = {
      // Text search
      query: searchParams.get('q') || searchParams.get('query') || undefined,
      
      // BC49 FIX: Validate status/priority against enums (reject invalid values)
      status: searchParams.getAll('status').filter(v => Object.values(TaskStatus).includes(v as TaskStatus)) as TaskStatus[],
      priority: searchParams.getAll('priority').filter(v => Object.values(TaskPriority).includes(v as TaskPriority)) as TaskPriority[],
      
      // ID-based filters
      assigneeIds: searchParams.getAll('assigneeId').filter(Boolean),
      teamIds: searchParams.getAll('teamId').filter(Boolean),
      povIds: searchParams.getAll('povId').filter(Boolean),
      phaseIds: searchParams.getAll('phaseId').filter(Boolean),
      stageIds: searchParams.getAll('stageId').filter(Boolean),
      
      // Name-based filters (optimized with parallel resolution)
      assigneeName: searchParams.get('assigneeName') || undefined,
      teamName: searchParams.get('teamName') || undefined,
      povName: searchParams.get('povName') || undefined,
      phaseName: searchParams.get('phaseName') || undefined,
      stageName: searchParams.get('stageName') || undefined,
      
      // BC49 FIX: Validate dateField against allowlist
      dateRange: searchParams.get('dateField') && ['createdAt', 'updatedAt', 'dueDate'].includes(searchParams.get('dateField')!) ? {
        field: searchParams.get('dateField') as 'createdAt' | 'updatedAt' | 'dueDate',
        start: searchParams.get('dateStart') ? new Date(searchParams.get('dateStart')!) : undefined,
        end: searchParams.get('dateEnd') ? new Date(searchParams.get('dateEnd')!) : undefined,
      } : undefined,
      
      // Advanced filters
      tags: searchParams.getAll('tag').filter(Boolean),
      hasAgentTemplate: searchParams.get('hasAgentTemplate') === 'true' ? true : 
                       searchParams.get('hasAgentTemplate') === 'false' ? false : undefined,
      executionStatus: searchParams.getAll('executionStatus').filter(Boolean),
      
      // Pagination and sorting
      limit: Math.min(parseInt(searchParams.get('limit') || '50'), 200),
      offset: parseInt(searchParams.get('offset') || '0'),
      // BC49 FIX: Validate orderBy/orderDir against allowlists
      orderBy: (['createdAt', 'updatedAt', 'dueDate', 'priority', 'title', 'order'].includes(searchParams.get('orderBy') || '') ? searchParams.get('orderBy') : 'order') as 'createdAt' | 'updatedAt' | 'dueDate' | 'priority' | 'title' | 'order',
      orderDir: (['asc', 'desc'].includes(searchParams.get('orderDir') || '') ? searchParams.get('orderDir') : 'asc') as 'asc' | 'desc',
    };

    taskLogger.debug({ hasTextQuery: !!filters.query, limit: filters.limit, offset: filters.offset }, 'task search filters');

    // Execute optimized search
    const result = await searchAndFilterTasks(filters, user);
    
    taskLogger.info({ resultCount: result.data.length, total: result.total, queryTimeMs: result.searchMeta?.queryTime }, 'task search completed');

    return {
      data: result.data,
      pagination: result.pagination,
      total: result.total,
      searchMeta: result.searchMeta
    };

  } catch (error) {
    taskLogger.error({ err: error }, 'task search failed');
    return {
      error: {
        message: 'Failed to search tasks',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

export const GET = createHandler(getTaskSearchHandler, { requireAuth: true });

// POST /api/tasks/search - Advanced search with complex filters
const postTaskSearchHandler: ApiHandler = async (
  req: NextRequest,
  context: { params: Record<string, string> },
  user?: TokenPayload
) => {
  if (!user) {
    return {
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    };
  }

  try {
    const body = await req.json();
    taskLogger.debug({ hasTextQuery: !!body.query }, 'advanced task search request');

    // Validate and sanitize filters
    const filters = {
      query: body.query?.trim() || undefined,
      status: Array.isArray(body.status) ? body.status : [],
      priority: Array.isArray(body.priority) ? body.priority : [],
      assigneeIds: Array.isArray(body.assigneeIds) ? body.assigneeIds : [],
      teamIds: Array.isArray(body.teamIds) ? body.teamIds : [],
      povIds: Array.isArray(body.povIds) ? body.povIds : [],
      phaseIds: Array.isArray(body.phaseIds) ? body.phaseIds : [],
      stageIds: Array.isArray(body.stageIds) ? body.stageIds : [],
      assigneeName: body.assigneeName?.trim() || undefined,
      teamName: body.teamName?.trim() || undefined,
      povName: body.povName?.trim() || undefined,
      phaseName: body.phaseName?.trim() || undefined,
      stageName: body.stageName?.trim() || undefined,
      dateRange: body.dateRange ? {
        field: body.dateRange.field || 'createdAt',
        start: body.dateRange.start ? new Date(body.dateRange.start) : undefined,
        end: body.dateRange.end ? new Date(body.dateRange.end) : undefined,
      } : undefined,
      tags: Array.isArray(body.tags) ? body.tags : [],
      hasAgentTemplate: body.hasAgentTemplate,
      executionStatus: Array.isArray(body.executionStatus) ? body.executionStatus : [],
      limit: Math.min(parseInt(body.limit, 10) || 50, 200),
      offset: Math.max(0, parseInt(body.offset, 10) || 0),
      orderBy: body.orderBy || 'order',
      orderDir: body.orderDir || 'asc',
    };

    // Execute optimized search
    const result = await searchAndFilterTasks(filters, user);
    
    taskLogger.info({ resultCount: result.data.length, total: result.total, queryTimeMs: result.searchMeta?.queryTime }, 'advanced task search completed');

    return {
      data: result.data,
      pagination: result.pagination,
      total: result.total,
      searchMeta: result.searchMeta
    };

  } catch (error) {
    taskLogger.error({ err: error }, 'advanced task search failed');
    return {
      error: {
        message: 'Failed to perform advanced task search',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

export const POST = createHandler(postTaskSearchHandler, { requireAuth: true });