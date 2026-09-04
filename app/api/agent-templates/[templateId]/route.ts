import { NextRequest, NextResponse } from 'next/server';
import { AgentTemplateService, AgentTemplateConfig } from '../../../../lib/services/agentTemplateService';
import { prisma } from '../../../../lib/prisma';
import { AgentTemplateStatus, Prisma } from '@prisma/client';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { logTemplateMutation } from '@/lib/auth/audit';
import { UpdateAgentTemplateSchema } from '@/lib/validation/agent-template-validation';
import { templateListCache } from '../template-cache';
import { logger } from '@/lib/logger';
import { buildPOVAccessFilter } from '@/lib/pov/auth/pov-access-filter';

/**
 * GET /api/agent-templates/[templateId]
 * Retrieve a specific agent template
 *
 * Security: Requires authentication + authorization (P0 fix - Nov 8, 2025)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { templateId: string } }
) {
  try {
    // ✅ P0 FIX: Authentication required (Issue #2)
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required'
        },
        { status: 401 }
      );
    }

    const { templateId } = params;

    if (!templateId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Template ID is required'
        },
        { status: 400 }
      );
    }

    // Cross-tenant leak fix (2026-05-26): AgentTemplate is a shared resource, but
    // its tasks/executions belong to individual POVs. Scope these includes to the
    // caller's POV access so a non-admin can't read other tenants' task titles or
    // execution history by guessing a templateId. Admins see all (filter = {}).
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
    const povFilter = buildPOVAccessFilter({ userId: user.userId, role: user.role });
    const taskAccessWhere = isAdmin ? undefined : { pov: povFilter };
    const execAccessWhere = isAdmin ? undefined : { task: { pov: povFilter } };

    // Get template with full details
    const template = await prisma.agentTemplate.findUnique({
      where: { id: templateId },
      include: {
        tasks: {
          where: taskAccessWhere,
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true
          },
          take: 10,
          orderBy: { createdAt: 'desc' }
        },
        executions: {
          where: execAccessWhere,
          select: {
            id: true,
            status: true,
            startTime: true,
            endTime: true,
            task: {
              select: {
                id: true,
                title: true
              }
            }
          },
          take: 10,
          orderBy: { startTime: 'desc' }
        }
      }
    });

    if (!template) {
      return NextResponse.json(
        {
          success: false,
          error: 'Template not found'
        },
        { status: 404 }
      );
    }

    // ✅ P0 FIX: Authorization check (Issue #2)
    // Note: AgentTemplates are shared resources in the system
    // Authentication is sufficient - all authenticated users can view templates
    // (Similar to how PUT/DELETE require ADMIN role for modifications)

    // REFACTOR TRACKING: Log if loaded template has metadata.agentConfig
    if (template.metadata && typeof template.metadata === 'object' && 'agentConfig' in template.metadata) {
      logger.warn({ templateId: template.id, templateName: template.name, agentConfigKeys: Object.keys((template.metadata as any).agentConfig || {}) }, 'REFACTOR-TRACKING: Retrieved template with metadata.agentConfig');
    }

    // Calculate additional metrics
    const recentExecutions = template.executions || [];
    const recentSuccessRate = recentExecutions.length > 0 
      ? (recentExecutions.filter(exec => exec.status === 'SUCCESS').length / recentExecutions.length) * 100
      : null;

    const responseData = {
      ...template,
      metrics: {
        recentSuccessRate,
        recentExecutions: recentExecutions.length,
        activeTasks: template.tasks?.filter(task => task.status !== 'COMPLETED').length || 0
      }
    };

    return NextResponse.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    logger.error({ err: error }, 'AgentTemplate API GET error');
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve agent template'
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/agent-templates/[templateId]
 * Update an agent template
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { templateId: string } }
) {
  try {
    // ✅ ENHANCED: Authentication (Week 5 Task 2.1)
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // ✅ ENHANCED: ADMIN-ONLY authorization (Week 5 Task 2.1)
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        {
          success: false,
          error: 'Template update requires ADMIN role'
        },
        { status: 403 }
      );
    }

    const { templateId } = params;
    const body = await request.json();

    if (!templateId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Template ID is required'
        },
        { status: 400 }
      );
    }

    // ✅ P0 FIX: Validate request body with UpdateAgentTemplateSchema (Issue #4)
    const validationResult = UpdateAgentTemplateSchema.safeParse(body);

    if (!validationResult.success) {
      // Check if validation failed due to prompt injection
      const errors = validationResult.error.errors;
      const hasInjection = errors.some(e =>
        e.message.includes('injection') ||
        e.message.includes('dangerous patterns') ||
        e.message.includes('CRITICAL')
      );

      if (hasInjection) {
        // ✅ Security violation logging for injection attempts
        logger.warn({ userId: user.userId, templateId, injectionPatterns: errors.filter(e => e.message.includes('injection') || e.message.includes('dangerous')).map(e => ({ path: e.path, message: e.message })) }, 'SECURITY: Prompt injection blocked in template update');
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: validationResult.error.flatten()
        },
        { status: 400 }
      );
    }

    // ✅ Use VALIDATED data (not raw body!)
    const updateData = validationResult.data;

    // BC2 P0 FIX (2026-04-25): shallow-merge jsonb fields to prevent partial-PUT
    // from clobbering unsupplied keys WITHIN those fields. The validator marks
    // all 6 jsonb columns optional (capabilities, constraints, inputSchema,
    // outputSchema, contextTemplate, metadata); if a caller PUTs only
    // `{capabilities: {...}}`, Prisma whole-replaces capabilities (zeroing
    // prior keys). Per-jsonb-field shallow-merge preserves non-passed keys.
    // The 404 short-circuit is now inside the tx — reads existence + jsonb
    // values atomically with the update.
    // See bug-class-registry.md BC2 Phase 4 entry #28 +
    // cline_docs/reviews/harness-clobber-detection-2026-04-25/
    let updatedTemplate;
    try {
      updatedTemplate = await prisma.$transaction(async (tx) => {
        const existing = await tx.agentTemplate.findUnique({
          where: { id: templateId },
          select: {
            id: true,
            name: true,
            capabilities: true,
            constraints: true,
            inputSchema: true,
            outputSchema: true,
            contextTemplate: true,
            metadata: true,
          },
        });

        if (!existing) {
          throw new Error('AgentTemplate not found');
        }

        // REFACTOR TRACKING: Log if metadata contains agentConfig (preserved
        // from original code path).
        if (
          updateData.metadata &&
          typeof updateData.metadata === 'object' &&
          'agentConfig' in updateData.metadata
        ) {
          logger.warn(
            {
              templateId,
              templateName: updateData.name || existing.name,
              agentConfigKeys: Object.keys((updateData.metadata as any).agentConfig || {}),
            },
            'REFACTOR-TRACKING: Updating template with metadata.agentConfig'
          );
        }

        // Per-jsonb-field shallow-merge: incoming keys override; preserve
        // existing keys not in the incoming payload. Fields absent from
        // updateData entirely are omitted (Prisma default — leaves DB unchanged).
        const jsonbCols = [
          'capabilities',
          'constraints',
          'inputSchema',
          'outputSchema',
          'contextTemplate',
          'metadata',
        ] as const;

        const mergedData: Record<string, unknown> = { ...updateData };
        for (const col of jsonbCols) {
          if ((updateData as any)[col] !== undefined) {
            const existingObj =
              (existing[col] as Record<string, unknown> | null) || {};
            const incomingObj =
              ((updateData as any)[col] as Record<string, unknown> | undefined) || {};
            mergedData[col] = JSON.parse(
              JSON.stringify({ ...existingObj, ...incomingObj })
            ) as Prisma.InputJsonValue;
          }
        }

        return tx.agentTemplate.update({
          where: { id: templateId },
          data: mergedData,
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            templateType: true,
            defaultRole: true,
            promptTemplate: true,
            metadata: true,
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
            createdBy: true,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    } catch (txError) {
      // Preserve the original 404 response shape for "not found".
      if (txError instanceof Error && txError.message === 'AgentTemplate not found') {
        return NextResponse.json(
          { success: false, error: 'Template not found' },
          { status: 404 }
        );
      }
      throw txError;
    }

    // ✅ ENHANCED: Audit logging (Week 5 Task 2.1)
    await logTemplateMutation(
      user.userId,
      'UPDATE',
      templateId,
      {
        details: `Updated agent template "${updatedTemplate.name}"`,
        success: true,
        templateName: updatedTemplate.name,
        changes: Object.keys(updateData)
      }
    );

    // ✅ Q1 2026 Performance: Invalidate template list cache after update
    templateListCache.invalidatePattern('agent-templates');

    return NextResponse.json({
      success: true,
      data: updatedTemplate
    });

  } catch (error) {
    logger.error({ err: error }, 'AgentTemplate API PUT error');
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update agent template'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/agent-templates/[templateId]
 * Delete an agent template (soft delete by setting status to DEPRECATED)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { templateId: string } }
) {
  try {
    // ✅ ENHANCED: Authentication (Week 5 Task 2.1)
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // ✅ ENHANCED: ADMIN-ONLY authorization (Week 5 Task 2.1)
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        {
          success: false,
          error: 'Template deletion requires ADMIN role'
        },
        { status: 403 }
      );
    }

    const { templateId } = params;

    if (!templateId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Template ID is required'
        },
        { status: 400 }
      );
    }

    // Check if template exists
    const existingTemplate = await prisma.agentTemplate.findUnique({
      where: { id: templateId },
      include: {
        tasks: {
          where: {
            status: {
              in: ['OPEN', 'IN_PROGRESS']
            }
          }
        }
      }
    });

    if (!existingTemplate) {
      return NextResponse.json(
        {
          success: false,
          error: 'Template not found'
        },
        { status: 404 }
      );
    }

    // Check if template is in use by active tasks
    if (existingTemplate.tasks && existingTemplate.tasks.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot delete template that is in use by active tasks',
          data: {
            activeTasks: existingTemplate.tasks.length
          }
        },
        { status: 409 }
      );
    }

    // Soft delete by setting status to DEPRECATED
    const deletedTemplate = await prisma.agentTemplate.update({
      where: { id: templateId },
      data: {
        status: AgentTemplateStatus.DEPRECATED
      },
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true
      }
    });

    // ✅ ENHANCED: Audit logging (Week 5 Task 2.1)
    await logTemplateMutation(
      user.userId,
      'DELETE',
      templateId,
      {
        details: `Deleted (deprecated) agent template "${deletedTemplate.name}"`,
        success: true,
        templateName: deletedTemplate.name,
        wasInUse: false // Already checked above
      }
    );

    // ✅ Q1 2026 Performance: Invalidate template list cache after deletion
    templateListCache.invalidatePattern('agent-templates');

    return NextResponse.json({
      success: true,
      data: deletedTemplate,
      message: 'Template marked as deprecated'
    });

  } catch (error) {
    logger.error({ err: error }, 'AgentTemplate API DELETE error');
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete agent template'
      },
      { status: 500 }
    );
  }
}
