import { NextRequest, NextResponse } from 'next/server';
import { AgentTemplateService, PromptGenerationContext } from '../../../../../lib/services/agentTemplateService';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { validatePOVAccess } from '@/lib/auth/validate-pov-access';
import { prisma } from '@/lib/prisma';
import { ApplyTemplateRequestSchema } from '@/lib/validation/agent-template-validation';
import { applyTemplateRateLimiter } from '@/lib/middleware/rate-limit';
import { logTemplateApplication, logSecurityViolation } from '@/lib/auth/audit';
import { detectPromptInjection } from '@/lib/security/prompt-injection-prevention';
import { z } from 'zod';
import { logger } from '@/lib/logger';

/**
 * POST /api/agent-templates/[templateId]/apply
 * Apply an agent template to a task
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { templateId: string } }
) {
  try {
    // ✅ CRITICAL FIX: Add authentication (Week 5 Task 1.2)
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

    // ✅ ENHANCED: Rate limiting (Week 5 Task 1.5)
    const rateLimitResponse = applyTemplateRateLimiter(request);
    if (rateLimitResponse) {
      return rateLimitResponse; // 429 Too Many Requests
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

    // ✅ ENHANCED: Zod validation with injection detection (Week 5 Task 1.4)
    const body = await request.json();

    // ✅ P1 FIX: Use safeParse instead of try/catch with .parse()
    const validation = ApplyTemplateRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        },
        { status: 400 }
      );
    }

    const validated = validation.data;

    // ✅ CRITICAL FIX: POV access validation (Week 5 Task 1.2)
    if (validated.povId) {
      const pov = await prisma.pOV.findUnique({
        where: { id: validated.povId },
        include: {
          team: {
            include: {
              members: { select: { userId: true } }
            }
          }
        }
      });

      if (!pov) {
        return NextResponse.json(
          {
            success: false,
            error: 'POV not found'
          },
          { status: 404 }
        );
      }

      try {
        validatePOVAccess(user, pov, { throwOnDeny: true });
      } catch (error: any) {
        return NextResponse.json(
          {
            success: false,
            error: 'Access denied to this POV'
          },
          { status: 403 }
        );
      }
    }

    // Prepare context for template application
    const context: PromptGenerationContext = {
      taskId: validated.taskId,
      povId: validated.povId,
      phaseId: validated.phaseId,
      variables: validated.variables || {},
      userContext: validated.userContext || { userId: user.userId, userEmail: user.email },
      systemContext: validated.systemContext || {}
    };

    // Apply template to task (now uses injection prevention from Task 1.3)
    let result;
    let injectionDetected = false;
    let riskScore = 0;
    let detectedPatterns: string[] = [];

    try {
      result = await AgentTemplateService.applyAgentTemplate(
        templateId,
        validated.taskId,
        context
      );

      // Calculate risk score for audit logging
      for (const value of Object.values(validated.variables || {})) {
        const check = detectPromptInjection(String(value));
        riskScore += check.riskScore;
        if (check.detectedPatterns.length > 0) {
          injectionDetected = true;
          detectedPatterns.push(...check.detectedPatterns.map(p => p.category));
        }
      }

    } catch (error) {
      // Check if error is due to injection blocking
      const isInjectionError = error instanceof Error &&
        (error.message.includes('injection') || error.message.includes('blocked'));

      if (isInjectionError) {
        injectionDetected = true;

        // ✅ ENHANCED: Log security violation (Week 5 Task 1.6)
        await logSecurityViolation(user.userId, {
          action: 'TEMPLATE_APPLY_BLOCKED',
          templateId,
          taskId: validated.taskId,
          reason: 'Prompt injection detected',
          errors: [error.message],
          variableNames: Object.keys(validated.variables || {}),
          riskScore,
          detectedPatterns
        });

        // ✅ ENHANCED: Log blocked application (Week 5 Task 1.6)
        await logTemplateApplication(
          user.userId,
          templateId,
          {
            taskId: validated.taskId,
            variableCount: Object.keys(validated.variables || {}).length,
            variableNames: Object.keys(validated.variables || {}),
            injectionDetected: true,
            riskScore,
            severity: 'CRITICAL',
            success: false,
            errors: [error.message]
          }
        );
      }

      throw error; // Re-throw for error handling below
    }

    // ✅ ENHANCED: Log successful application (Week 5 Task 1.6)
    await logTemplateApplication(
      user.userId,
      templateId,
      {
        taskId: validated.taskId,
        variableCount: Object.keys(validated.variables || {}).length,
        variableNames: Object.keys(validated.variables || {}),
        injectionDetected,
        riskScore,
        severity: riskScore > 50 ? 'MEDIUM' : 'LOW',
        success: true,
        warnings: result.validationResults?.warnings || []
      }
    );

    return NextResponse.json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error({ err: error }, 'AgentTemplate Apply API POST error');
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to apply agent template'
      },
      { status: 500 }
    );
  }
}
