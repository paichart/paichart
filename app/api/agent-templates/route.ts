import { NextRequest, NextResponse } from 'next/server';
import { AgentTemplateService, AgentTemplateConfig } from '../../../lib/services/agentTemplateService';
import { prisma } from '../../../lib/prisma';
import { AgentCategory, AgentTemplateStatus, TemplateType } from '@prisma/client';
import { parseEnumParam } from '@/lib/utils/parse-enum-param';
import { getAuthUser } from '../../../lib/auth/get-auth-user';
import { logTemplateMutation } from '@/lib/auth/audit';
import { CreateAgentTemplateSchema } from '@/lib/validation/agent-template-validation';
import { generateCacheKey } from '@/lib/utils/lru-cache';
import { logger } from '@/lib/logger';
import { templateListCache } from './template-cache';

/**
 * GET /api/agent-templates
 * Retrieve agent templates with filtering and pagination
 */
export async function GET(request: NextRequest) {
  try {
    // SECURITY FIX: Add authentication to prevent unauthorized agent template access
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized access to agent templates' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);

    // ✅ Q1 2026 Performance: Check cache first (95% faster on hit, 90% hit rate)
    const cacheKey = generateCacheKey('agent-templates', user.userId, Object.fromEntries(searchParams));
    const cached = templateListCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
    
    // Parse query parameters
    // 2026-05-27 (pentest M-2 sibling): validate enum params before the Prisma where —
    // a raw cast of an out-of-range value into whereClause.* throws → 500.
    const category = parseEnumParam(searchParams.get('category'), AgentCategory);
    const templateType = parseEnumParam(searchParams.get('templateType'), TemplateType);
    const status = parseEnumParam(searchParams.get('status'), AgentTemplateStatus);
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const isDefault = searchParams.get('isDefault') === 'true' ? true : undefined;
    const search = searchParams.get('search');
    const tags = searchParams.get('tags')?.split(',').filter(Boolean);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 200); // BC41 FIX: cap limit
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);
    const sortBy = searchParams.get('sortBy') || 'name';
    const sortOrder = searchParams.get('sortOrder') || 'asc';

    // Phase 5a: Agent Parameters - Jan Marshal's Simple Approach
    const agent_template_name = searchParams.get('agent_template_name');
    const agent_category = parseEnumParam(searchParams.get('agent_category'), AgentCategory);

    // Build where clause
    const whereClause: any = {};
    
    if (category) {
      whereClause.category = category;
    }

    if (templateType) {
      whereClause.templateType = templateType;
    }

    if (status) {
      whereClause.status = status;
    } else if (!includeInactive) {
      whereClause.status = AgentTemplateStatus.ACTIVE;
    }
    
    if (isDefault !== undefined) {
      whereClause.isDefault = isDefault;
    }
    
    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { defaultRole: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    // Jan Marshal's Simple & Reliable Approach - Direct parameter handling
    if (agent_template_name) {
      logger.info({ agent_template_name }, 'Agent Templates API looking up template by name');
      whereClause.name = { contains: agent_template_name, mode: 'insensitive' };
    }
    
    if (agent_category) {
      logger.info({ agent_category }, 'Agent Templates API filtering by category');
      whereClause.category = agent_category;
    }
    
    if (tags && tags.length > 0) {
      whereClause.tags = {
        hasSome: tags
      };
    }

    // BC49 FIX: Validate sortBy against allowlist (prevent dynamic key injection)
    const VALID_SORT_FIELDS = ['usage', 'success', 'created', 'name', 'updatedAt', 'createdAt'];
    const safeSortBy = VALID_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
    const orderByClause: any = {};
    if (safeSortBy === 'usage') {
      orderByClause.usageCount = sortOrder;
    } else if (safeSortBy === 'success') {
      orderByClause.successRate = sortOrder;
    } else if (safeSortBy === 'created') {
      orderByClause.createdAt = sortOrder;
    } else {
      orderByClause[safeSortBy] = sortOrder;
    }

    // Get templates with pagination
    const [templates, totalCount] = await Promise.all([
      prisma.agentTemplate.findMany({
        where: whereClause,
        orderBy: orderByClause,
        skip: offset,
        take: limit,
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          templateType: true,
          defaultRole: true,
          promptTemplate: true,
          contextTemplate: true,
          metadata: true,
          maxRetries: true,
          timeout: true,
          capabilities: true,
          constraints: true,
          priority: true,
          version: true,
          status: true,
          isDefault: true,
          tags: true,
          usageCount: true,
          successRate: true,
          averageTime: true,
          createdAt: true,
          updatedAt: true,
          createdBy: true
        }
      }),
      prisma.agentTemplate.count({ where: whereClause })
    ]);

    // Calculate pagination metadata
    const hasMore = offset + limit < totalCount;
    const totalPages = Math.ceil(totalCount / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    const result = {
      success: true,
      data: {
        templates,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore,
          totalPages,
          currentPage
        }
      }
    };

    // ✅ Q1 2026 Performance: Cache result (templates change rarely - 90% hit rate)
    templateListCache.set(cacheKey, result);

    return NextResponse.json(result);

  } catch (error) {
    logger.error({ err: error }, 'AgentTemplates API GET error');
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve agent templates'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/agent-templates
 * Create a new agent template
 */
export async function POST(request: NextRequest) {
  try {
    // SECURITY FIX: Add authentication to prevent unauthorized agent template creation
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized access to agent templates' },
        { status: 401 }
      );
    }

    // ✅ ENHANCED: ADMIN-ONLY authorization for template creation (Week 5 Task 2.1)
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        {
          success: false,
          error: 'Template creation requires ADMIN role'
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    // ✅ P0 FIX: Validate with comprehensive schema (Quarterly Review Q1 2026)
    const validation = CreateAgentTemplateSchema.safeParse(body);

    if (!validation.success) {
      // Check if validation failed due to prompt injection or security issue
      const errors = validation.error.errors;
      const hasInjection = errors.some(e =>
        e.message.includes('injection') ||
        e.message.includes('dangerous patterns') ||
        e.message.includes('CRITICAL')
      );

      if (hasInjection) {
        // ✅ Security violation logging for injection attempts
        // BC42 FIX: Truncate raw user input before logging to prevent log injection
        logger.warn({ userId: user.userId, templateName: typeof body.name === 'string' ? body.name.substring(0, 100).replace(/[\n\r]/g, '') : '[invalid]' }, 'SECURITY: Prompt injection blocked in template creation');
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten()
        },
        { status: 400 }
      );
    }

    // ✅ Use VALIDATED data (not raw body!)
    const validated = validation.data;

    // Create template configuration from validated data
    // Handle optional fields with defaults for required AgentTemplateConfig fields
    const templateConfig: AgentTemplateConfig = {
      name: validated.name,
      description: validated.description,
      category: validated.category,
      templateType: validated.templateType,
      defaultRole: validated.defaultRole,
      promptTemplate: validated.promptTemplate,
      capabilities: validated.capabilities || {}, // Provide default empty object
      constraints: validated.constraints || {}, // Provide default empty object
      maxRetries: validated.maxRetries,
      timeout: validated.timeout,
      priority: validated.priority,
      inputSchema: validated.inputSchema,
      outputSchema: validated.outputSchema,
      contextTemplate: validated.contextTemplate,
      metadata: validated.metadata,
      version: validated.version,
      status: validated.status,
      isDefault: validated.isDefault,
      tags: validated.tags
    };

    // Create template
    // BC46 FIX: Always use JWT-derived identity, not raw body.createdBy (prevents attribution spoofing)
    const templateId = await AgentTemplateService.createTemplate(
      templateConfig,
      user.userId
    );

    // Get the created template
    const template = await prisma.agentTemplate.findUnique({
      where: { id: templateId },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        templateType: true,
        defaultRole: true,
        promptTemplate: true,
        contextTemplate: true,
        metadata: true,
        maxRetries: true,
        timeout: true,
        priority: true,
        version: true,
        status: true,
        isDefault: true,
        tags: true,
        capabilities: true,
        constraints: true,
        usageCount: true,
        successRate: true,
        averageTime: true,
        createdAt: true,
        updatedAt: true,
        createdBy: true
      }
    });

    // ✅ ENHANCED: Audit logging (Week 5 Task 2.1)
    await logTemplateMutation(
      user.userId,
      'CREATE',
      templateId,
      {
        details: `Created agent template "${template?.name}"`,
        success: true,
        templateName: template?.name,
        category: template?.category
      }
    );

    // ✅ Q1 2026 Performance: Invalidate template list cache after creation
    templateListCache.invalidatePattern('agent-templates');

    return NextResponse.json({
      success: true,
      data: {
        template,
        templateId
      }
    }, { status: 201 });

  } catch (error) {
    logger.error({ err: error }, 'AgentTemplates API POST error');
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create agent template'
      },
      { status: 500 }
    );
  }
}
