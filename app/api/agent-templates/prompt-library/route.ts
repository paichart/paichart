import { NextRequest, NextResponse } from 'next/server';
import { getClientIP } from '@/lib/utils/client-ip';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { UserRole, ResourceType, ResourceAction } from '@/lib/types/auth';
import { trackActivity } from '@/lib/auth/audit';
import { CreatePromptLibrarySchema, ListPromptsQuerySchema } from '@/lib/validation/prompt-library-validation';
import { promptCreationLimiter } from '@/lib/middleware/rate-limit';
import { getPromptRegistryEventEmitter } from '@/lib/events/prompt-registry-events';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    // SECURITY FIX: Add authentication to prevent unauthorized prompt library access
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized access to prompt library' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);

    // ✅ SECURITY: Validate query params (enum safety on category, string max on search, boolean coercion)
    // Pre-convert 'all' UI convention → undefined before schema validation (not a valid enum value)
    const queryValidation = ListPromptsQuerySchema.safeParse({
      search: searchParams.get('search') ?? undefined,
      category: searchParams.get('category') === 'all' ? undefined : (searchParams.get('category') ?? undefined),
      domain: searchParams.get('domain') === 'all' ? undefined : (searchParams.get('domain') ?? undefined),
      mcpOnly: searchParams.get('mcpOnly') ?? undefined,
      includeUsage: searchParams.get('includeUsage') ?? undefined,
      public: searchParams.get('public') ?? undefined,
    });

    if (!queryValidation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid query parameters: ' + queryValidation.error.errors.map(e => e.message).join(', ') },
        { status: 400 }
      );
    }

    const { search: searchParam, category: categoryParam, domain: domainParam, mcpOnly: mcpOnlyParam, includeUsage: includeUsageParam } = queryValidation.data;
    const isPublic = queryValidation.data.public;

    // Build where clause.
    // Status: non-admins only ever see live (ACTIVE) prompts; admins see ALL statuses so they can manage
    // drafts/deprecated in the GUI. NOTE: this does NOT change MCP exposure — the MCP prompt registry +
    // embedded server load via separate paths that gate on status:'ACTIVE' independently. Only ACTIVE
    // (mcp-tagged / public) prompts are ever served to AI clients, regardless of what the GUI list shows.
    const where: any = {};

    if (categoryParam) {
      where.category = categoryParam; // Already validated as AgentCategory enum by schema
    }

    // BUG-PROMPT-LIBRARY-001 fix (2026-05-23, Phase 3 sec-ops side-finding):
    // Previously: omit ?public OR ?public=false → no filter → returns ALL
    // prompts including isPublic:false (pipeline-orchestrator-protocol +
    // artifact-synthesis-protocol). Sibling of BUG-STANDALONE-004 at the
    // REST surface — we fixed prompt-registry.js (MCP path b89078b5) but
    // missed this endpoint.
    //
    // Fix: non-admin callers ALWAYS see isPublic:true only, regardless of
    // ?public param. Admin callers honor ?public for filtering (or omit
    // to see all). Mirrors the prompt-registry.js getPrompt + listPrompts
    // gate at the same isPublic boundary.
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    if (!isAdmin) {
      if (isPublic === false) {
        logger.info(
          { userId: user.userId, securityEvent: true },
          'Non-admin attempted ?public=false on prompt-library; forced to isPublic=true'
        );
      }
      where.isPublic = true;
      where.status = 'ACTIVE'; // non-admins: live prompts only
    } else if (isPublic) {
      where.isPublic = true;
    }
    // else (admin, no public param OR ?public=false): no filter — admin sees all (incl. non-ACTIVE statuses)

    // MCP tag filtering
    if (mcpOnlyParam) {
      where.tags = { has: 'mcp' };
    }

    // Domain filtering
    if (domainParam) {
      where.tags = { 
        ...(mcpOnlyParam ? { hasEvery: ['mcp', `domain:${domainParam}`] } : { has: `domain:${domainParam}` })
      };
    }

    // Search filtering
    if (searchParam) {
      where.OR = [
        { name: { contains: searchParam, mode: 'insensitive' } },
        { description: { contains: searchParam, mode: 'insensitive' } },
        { useCase: { contains: searchParam, mode: 'insensitive' } },
        { tags: { hasSome: [searchParam.toLowerCase()] } }
      ];
    }

    // Select fields based on includeUsage parameter
    const selectFields = {
      id: true,
      name: true,
      description: true,
      category: true,
      useCase: true,
      complexity: true,
      estimatedTime: true,
      tags: true,
      usageCount: true,
      rating: true,
      version: true,
      status: true,
      isPublic: true,
      createdAt: true,
      updatedAt: true,
      ...(includeUsageParam && {
        promptText: true,
        variables: true,
        examples: true
      })
    };

    // Fetch prompt library entries (simple format for <100 prompts)
    const promptLibraryEntries = await prisma.agentPromptLibrary.findMany({
      where,
      select: selectFields,
      orderBy: [
        { usageCount: 'desc' },
        { createdAt: 'desc' }
      ],
      take: 200
    });

    return NextResponse.json({
      success: true,
      data: promptLibraryEntries  // Simple array format
    });

  } catch (error) {
    logger.error({ err: error }, 'Error fetching prompt library');
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch prompt library entries',
        details: 'See server logs for details'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // Rate limiting BEFORE authentication (performance optimization)
  const rateLimitResponse = await promptCreationLimiter(request);
  if (rateLimitResponse) {
    return rateLimitResponse; // 429 Too Many Requests
  }

  try {
    // SECURITY FIX: Add authentication to prevent unauthorized prompt creation
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized access to prompt library' },
        { status: 401 }
      );
    }

    // Admin-only check (Week 1-2 pattern)
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      // Log failed attempt for security monitoring
      await trackActivity(user.userId, 'PROMPT_LIBRARY', 'CREATE_DENIED', {
        resourceType: ResourceType.PROMPT_LIBRARY,
        success: false,
        reason: 'Insufficient permissions',
        requiredRole: 'ADMIN',
        actualRole: user.role,
        ip: getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown'
      });

      return NextResponse.json(
        { success: false, error: 'Admin access required to create prompts' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Zod validation with comprehensive checks
    const validation = CreatePromptLibrarySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed: ' + validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        },
        { status: 400 }
      );
    }

    // Use validated data (guaranteed to match schema)
    const validatedData = validation.data;
    const {
      name,
      description,
      category,
      promptText,
      variables,
      examples,
      useCase,
      complexity,
      estimatedTime,
      tags,
      isPublic,
      status
    } = validatedData;

    // Create new prompt library entry
    const newEntry = await prisma.agentPromptLibrary.create({
      data: {
        name,
        description,
        category,
        promptText,
        variables: (variables || {}) as any, // Cast to any for Prisma JSON type compatibility
        examples: (examples || {}) as any, // Cast to any for Prisma JSON type compatibility
        useCase,
        complexity: complexity || 'MEDIUM',
        estimatedTime: estimatedTime || 300,
        tags: tags || [],
        isPublic,
        status: status || 'ACTIVE',
        version: '1.0.0',
        usageCount: 0,
        createdBy: user.userId  // ✅ Actual admin who created
      }
    });

    // Comprehensive audit logging
    await trackActivity(user.userId, 'PROMPT_LIBRARY', 'CREATE', {
      resourceType: ResourceType.PROMPT_LIBRARY,
      action: ResourceAction.CREATE,
      success: true,
      details: `Created prompt: ${name}`,
      promptId: newEntry.id,
      category,
      isPublic,
      tags,
      promptTextLength: promptText.length,
      variableCount: variables ? Object.keys(variables).length : 0,
      ip: getClientIP(request),
      userAgent: request.headers.get('user-agent') || 'unknown'
    });

    // Real-time registry update: Emit event for MCP server auto-reload
    try {
      const eventEmitter = getPromptRegistryEventEmitter();
      await eventEmitter.emitPromptEvent('created', newEntry, user.userId);
      logger.info('Prompt Library emitted prompt-created event for real-time sync');
    } catch (eventError) {
      logger.warn({ err: eventError }, 'Prompt Library failed to emit event (non-blocking)');
      // Don't fail the request if event emission fails
    }

    return NextResponse.json({
      success: true,
      data: newEntry
    });

  } catch (error) {
    logger.error({ err: error }, 'Error creating prompt library entry');
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create prompt library entry',
        details: 'See server logs for details'
      },
      { status: 500 }
    );
  }
}
