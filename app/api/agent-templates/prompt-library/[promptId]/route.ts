import { NextRequest, NextResponse } from 'next/server';
import { getClientIP } from '@/lib/utils/client-ip';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { UserRole, ResourceType, ResourceAction } from '@/lib/types/auth';
import { trackActivity } from '@/lib/auth/audit';
import { promptDeletionLimiter } from '@/lib/middleware/rate-limit';
import { getPromptRegistryEventEmitter } from '@/lib/events/prompt-registry-events';
import { PromptLibraryUpdateSchema } from '@/lib/validation/agent-template-validation';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: { promptId: string } }
) {
  try {
    // SECURITY FIX: Add authentication
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized access to prompt library' },
        { status: 401 }
      );
    }

    const { promptId } = params;

    const prompt = await prisma.agentPromptLibrary.findUnique({
      where: { id: promptId }
    });

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: 'Prompt not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: prompt
    });

  } catch (error) {
    logger.error({ err: error }, 'failed to fetch prompt');
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch prompt',
        details: 'See server logs for details'
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { promptId: string } }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Admin-only check
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      await trackActivity(user.userId, 'PROMPT_LIBRARY', 'UPDATE_DENIED', {
        resourceType: ResourceType.PROMPT_LIBRARY,
        success: false,
        reason: 'Insufficient permissions',
        promptId: params.promptId,
        ip: getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown'
      });

      return NextResponse.json(
        { success: false, error: 'Admin access required to update prompts' },
        { status: 403 }
      );
    }

    const { promptId } = params;
    const body = await request.json();

    // ✅ P1 FIX: Comprehensive validation (Quarterly Review Q1 2026)
    // Prevents dangerous ...body spread that could inject usageCount, successRate, etc.
    const validation = PromptLibraryUpdateSchema.safeParse(body);

    if (!validation.success) {
      // Check if validation failed due to prompt injection
      const errors = validation.error.errors;
      const hasInjection = errors.some(e =>
        e.message.includes('injection') ||
        e.message.includes('dangerous patterns') ||
        e.message.includes('CRITICAL')
      );

      if (hasInjection) {
        // Security violation logging for injection attempts
        logger.warn({
          userId: user.userId,
          promptId,
          injectionPatterns: errors
            .filter(e => e.message.includes('injection') || e.message.includes('dangerous'))
            .map(e => ({ path: e.path, message: e.message }))
        }, 'prompt injection blocked in prompt library update');
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

    const validated = validation.data;

    // Check if prompt exists
    const existingPrompt = await prisma.agentPromptLibrary.findUnique({
      where: { id: promptId }
    });

    if (!existingPrompt) {
      return NextResponse.json(
        { success: false, error: 'Prompt not found' },
        { status: 404 }
      );
    }

    // Update prompt with explicitly validated fields (prevents ...body vulnerability)
    const updatedPrompt = await prisma.agentPromptLibrary.update({
      where: { id: promptId },
      data: {
        ...(validated.name && { name: validated.name }),
        ...(validated.description !== undefined && { description: validated.description }),
        ...(validated.category && { category: validated.category }),
        ...(validated.promptText && { promptText: validated.promptText }),
        ...(validated.variables !== undefined && { variables: validated.variables }),
        ...(validated.examples !== undefined && { examples: validated.examples }),
        ...(validated.useCase && { useCase: validated.useCase }),
        ...(validated.complexity && { complexity: validated.complexity }),
        ...(validated.estimatedTime !== undefined && { estimatedTime: validated.estimatedTime }),
        ...(validated.rating !== undefined && { rating: validated.rating }),
        ...(validated.version && { version: validated.version }),
        ...(validated.status && { status: validated.status }),
        ...(validated.isPublic !== undefined && { isPublic: validated.isPublic }),
        ...(validated.tags && { tags: validated.tags }),
        updatedAt: new Date()
      }
    });

    // Audit logging
    await trackActivity(user.userId, 'PROMPT_LIBRARY', 'UPDATE', {
      resourceType: ResourceType.PROMPT_LIBRARY,
      action: ResourceAction.EDIT,
      success: true,
      details: `Updated prompt: ${updatedPrompt.name}`,
      promptId,
      changes: Object.keys(validated),
      ip: getClientIP(request),
      userAgent: request.headers.get('user-agent') || 'unknown'
    });

    // Real-time registry update: Emit event for MCP server auto-reload
    try {
      const eventEmitter = getPromptRegistryEventEmitter();
      await eventEmitter.emitPromptEvent('updated', updatedPrompt, user.userId);
      logger.debug({ promptId: updatedPrompt.id }, 'emitted prompt-updated event');
    } catch (eventError) {
      logger.warn({ err: eventError }, 'failed to emit prompt-updated event');
    }

    return NextResponse.json({
      success: true,
      data: updatedPrompt
    });

  } catch (error) {
    logger.error({ err: error }, 'failed to update prompt');
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update prompt',
        details: 'See server logs for details'
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { promptId: string } }
) {
  // Rate limiting
  const rateLimitResponse = await promptDeletionLimiter(request);
  if (rateLimitResponse) {
    return rateLimitResponse; // 429 Too Many Requests
  }

  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Admin-only check
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      await trackActivity(user.userId, 'PROMPT_LIBRARY', 'DELETE_DENIED', {
        resourceType: ResourceType.PROMPT_LIBRARY,
        success: false,
        reason: 'Insufficient permissions',
        promptId: params.promptId,
        ip: getClientIP(request),
        userAgent: request.headers.get('user-agent') || 'unknown'
      });

      return NextResponse.json(
        { success: false, error: 'Admin access required to delete prompts' },
        { status: 403 }
      );
    }

    const { promptId } = params;

    // Fetch prompt before deletion (for audit trail)
    const promptToDelete = await prisma.agentPromptLibrary.findUnique({
      where: { id: promptId },
      select: { id: true, name: true, category: true, tags: true }
    });

    if (!promptToDelete) {
      return NextResponse.json(
        { success: false, error: 'Prompt not found' },
        { status: 404 }
      );
    }

    // Hard delete - permanently remove prompt from database
    await prisma.agentPromptLibrary.delete({
      where: { id: promptId }
    });

    // Audit logging
    await trackActivity(user.userId, 'PROMPT_LIBRARY', 'DELETE', {
      resourceType: ResourceType.PROMPT_LIBRARY,
      action: ResourceAction.DELETE,
      success: true,
      details: `Deleted prompt: ${promptToDelete.name}`,
      promptId,
      category: promptToDelete.category,
      tags: promptToDelete.tags,
      ip: getClientIP(request),
      userAgent: request.headers.get('user-agent') || 'unknown'
    });

    // Real-time registry update: Emit event for MCP server cache invalidation
    try {
      const eventEmitter = getPromptRegistryEventEmitter();
      await eventEmitter.emitPromptEvent('deleted', promptToDelete, user.userId);
      logger.debug({ promptId }, 'emitted prompt-deleted event');
    } catch (eventError) {
      logger.warn({ err: eventError }, 'failed to emit prompt-deleted event');
    }

    return NextResponse.json({
      success: true,
      message: 'Prompt deleted successfully'
    });

  } catch (error) {
    logger.error({ err: error }, 'failed to delete prompt');
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete prompt',
        details: 'See server logs for details'
      },
      { status: 500 }
    );
  }
}
