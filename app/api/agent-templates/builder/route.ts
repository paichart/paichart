import { NextRequest, NextResponse } from 'next/server';
import { AgentTemplateBuilderService } from '@/lib/services/agentTemplateBuilder/agentTemplateBuilderService';
import { TemplateSimulationService } from '@/lib/services/agentTemplateBuilder/templateSimulationService';
import { PerformanceOptimizationService } from '@/lib/services/agentTemplateBuilder/performanceOptimizationService';
import { z } from 'zod';
import { detectPromptInjection } from '@/lib/security/prompt-injection-prevention';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { logger } from '@/lib/logger';

/**
 * Agent Template Builder API Endpoint
 *
 * Provides builder-specific functionality that extends the basic agent templates API.
 * Supports actions like MCP tool discovery, template validation, and workflow simulation.
 *
 * SECURITY: Validates all user input (Nov 3, 2025)
 */

// ==================== Builder-Specific Validation Schemas ====================

/**
 * Validate Template POST Schema
 * Action: validate-template
 * Security: Prevent prompt injection, XSS, DoS
 */
const ValidateTemplatePostSchema = z.object({
  templateData: z.object({
    name: z.string().min(1).max(255),
    promptTemplate: z.string()
      .min(1, 'Prompt template required')
      .max(50000, 'Prompt template too long (max 50KB)')
      .refine((val) => {
        const check = detectPromptInjection(val);
        return check.severity !== 'CRITICAL';
      }, { message: 'Prompt template contains CRITICAL injection patterns' }),
    variables: z.array(z.any()).max(50).optional(),
  }),  // BC62 FIX: Removed .passthrough() — only validated fields accepted
}).strict();

/**
 * Simulate Workflow Schema
 * Action: simulate-workflow
 * Security: Prevent injection in test inputs, DoS via massive payloads
 */
const SimulateWorkflowSchema = z.object({
  templateData: z.object({
    promptTemplate: z.string().max(50000),
    variables: z.array(z.any()).max(50).optional(),
  }).passthrough(),
  testInput: z.record(z.any())
    .refine((obj) => {
      try { return JSON.stringify(obj).length < 100000; } catch { return false; } // BC30: stack overflow guard
    }, {
      message: 'Test input too large or too deeply nested (max 100KB)'
    }),
  simulationMode: z.enum(['single', 'batch', 'stress']).default('single').optional(),
  userId: z.string().optional(),
}).strict();

/**
 * Optimize Template Schema
 * Action: optimize-template
 * Security: Prevent injection, validate optimization options
 */
const OptimizeTemplateSchema = z.object({
  templateData: z.object({
    promptTemplate: z.string().max(50000),
    variables: z.array(z.any()).max(50).optional(),
  }).passthrough(),
  options: z.object({
    enableTokenOptimization: z.boolean().optional(),
    enablePromptCompression: z.boolean().optional(),
    enableToolOptimization: z.boolean().optional(),
    targetTokenReduction: z.number().min(0).max(100).optional(),
    preserveQuality: z.boolean().default(true).optional(),
  }).optional(),
  userId: z.string().optional(),
}).strict();

export async function GET(request: NextRequest) {
  try {
    // P2 FIX: Authentication required (Issue #11)
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

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'discover-tools':
        return await handleDiscoverTools(searchParams);
      
      case 'get-servers':
        return await handleGetServers();
      
      case 'validate-template':
        return await handleValidateTemplate(searchParams);
      
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action parameter' },
          { status: 400 }
        );
    }
  } catch (error) {
    logger.error({ err: error }, 'agent template builder GET error');
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        details: 'See server logs for details'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // P2 FIX: Authentication required (Issue #11)
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

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const body = await request.json();

    // SECURITY: Validate based on action type (Week 5 gap fix - Nov 3, 2025)
    let validation;
    let validatedBody;

    switch (action) {
      case 'validate-template':
        validation = ValidateTemplatePostSchema.safeParse(body);
        if (!validation.success) {
          logger.warn({ action, issueCount: validation.error.issues.length }, 'builder validate-template schema validation failed');
          return NextResponse.json(
            { success: false, error: 'Invalid template data', issues: validation.error.issues },
            { status: 400 }
          );
        }
        validatedBody = validation.data;
        return await handleValidateTemplatePost(validatedBody);

      case 'simulate-workflow':
        validation = SimulateWorkflowSchema.safeParse(body);
        if (!validation.success) {
          logger.warn({ action, issueCount: validation.error.issues.length }, 'builder simulate-workflow schema validation failed');
          return NextResponse.json(
            { success: false, error: 'Invalid simulation data', issues: validation.error.issues },
            { status: 400 }
          );
        }
        validatedBody = validation.data;
        return await handleSimulateWorkflow(validatedBody);

      case 'optimize-template':
        validation = OptimizeTemplateSchema.safeParse(body);
        if (!validation.success) {
          logger.warn({ action, issueCount: validation.error.issues.length }, 'builder optimize-template schema validation failed');
          return NextResponse.json(
            { success: false, error: 'Invalid optimization data', issues: validation.error.issues },
            { status: 400 }
          );
        }
        validatedBody = validation.data;
        return await handleOptimizeTemplate(validatedBody);

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action parameter' },
          { status: 400 }
        );
    }
  } catch (error) {
    logger.error({ err: error }, 'agent template builder POST error');
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        details: 'See server logs for details'
      },
      { status: 500 }
    );
  }
}

/**
 * Handle MCP tool discovery
 */
async function handleDiscoverTools(searchParams: URLSearchParams) {
  try {
    const serverName = searchParams.get('serverName') || undefined;
    const category = searchParams.get('category') || undefined;
    const includeDescription = searchParams.get('includeDescription') === 'true';

    const tools = await AgentTemplateBuilderService.discoverMCPTools({
      serverName,
      category,
      includeDescription
    });

    logger.debug({ toolCount: tools.length, serverName, category }, 'MCP tools discovered');

    return NextResponse.json({
      success: true,
      data: {
        tools,
        count: tools.length,
        filters: {
          serverName,
          category,
          includeDescription
        }
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'failed to discover MCP tools');
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to discover MCP tools',
        details: 'See server logs for details'
      },
      { status: 500 }
    );
  }
}

/**
 * Handle getting available MCP servers
 */
async function handleGetServers() {
  try {
    const servers = await AgentTemplateBuilderService.getAvailableServers();

    logger.debug({ serverCount: servers.length }, 'MCP servers retrieved');

    return NextResponse.json({
      success: true,
      data: {
        servers,
        count: servers.length
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'failed to get MCP servers');
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to get MCP servers',
        details: 'See server logs for details'
      },
      { status: 500 }
    );
  }
}

/**
 * Handle template validation (GET)
 */
async function handleValidateTemplate(searchParams: URLSearchParams) {
  try {
    const templateId = searchParams.get('templateId');
    
    if (!templateId) {
      return NextResponse.json(
        { success: false, error: 'Template ID is required' },
        { status: 400 }
      );
    }

    // Get template data first
    const templateResult = await AgentTemplateBuilderService.getTemplate(templateId);
    
    if (!templateResult.success) {
      return NextResponse.json(
        { success: false, error: 'Template not found' },
        { status: 404 }
      );
    }

    // Validate the template
    const validationResult = await AgentTemplateBuilderService.validateTemplate(templateResult.data);

    return NextResponse.json({
      success: true,
      data: validationResult
    });
  } catch (error) {
    logger.error({ err: error }, 'failed to validate template');
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to validate template',
        details: 'See server logs for details'
      },
      { status: 500 }
    );
  }
}

/**
 * Handle template validation (POST)
 */
async function handleValidateTemplatePost(body: any) {
  try {
    if (!body.templateData) {
      return NextResponse.json(
        { success: false, error: 'Template data is required' },
        { status: 400 }
      );
    }

    const validationResult = await AgentTemplateBuilderService.validateTemplate(body.templateData);

    return NextResponse.json({
      success: true,
      data: validationResult
    });
  } catch (error) {
    logger.error({ err: error }, 'failed to validate template data');
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to validate template data',
        details: 'See server logs for details'
      },
      { status: 500 }
    );
  }
}

/**
 * Handle workflow simulation
 */
async function handleSimulateWorkflow(body: any) {
  try {
    const { templateData, testInput, simulationMode, userId } = body;

    if (!templateData) {
      return NextResponse.json(
        { success: false, error: 'Template data is required for simulation' },
        { status: 400 }
      );
    }

    if (!testInput) {
      return NextResponse.json(
        { success: false, error: 'Test input is required for simulation' },
        { status: 400 }
      );
    }

    // Use the TemplateSimulationService for real simulation
    const simulationResult = await TemplateSimulationService.simulateTemplate(
      templateData,
      testInput,
      {
        mode: simulationMode || 'single',
        userId,
        enablePerformanceTracking: true
      }
    );

    if (!simulationResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: simulationResult.error || 'Simulation failed'
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: simulationResult.data
    });
  } catch (error) {
    logger.error({ err: error }, 'failed to simulate workflow');
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to simulate workflow',
        details: 'See server logs for details'
      },
      { status: 500 }
    );
  }
}

/**
 * Handle template optimization
 */
async function handleOptimizeTemplate(body: any) {
  try {
    const { templateData, options, userId } = body;

    if (!templateData) {
      return NextResponse.json(
        { success: false, error: 'Template data is required for optimization' },
        { status: 400 }
      );
    }

    // Use the PerformanceOptimizationService for real optimization
    const optimizationResult = await PerformanceOptimizationService.optimizeTemplate(
      templateData,
      {
        enableTokenOptimization: options?.enableTokenOptimization,
        enablePromptCompression: options?.enablePromptCompression,
        enableToolOptimization: options?.enableToolOptimization,
        targetTokenReduction: options?.targetTokenReduction,
        preserveQuality: options?.preserveQuality,
        userId
      }
    );

    if (!optimizationResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: optimizationResult.error || 'Optimization failed'
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: optimizationResult.data
    });
  } catch (error) {
    logger.error({ err: error }, 'failed to optimize template');
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to optimize template',
        details: 'See server logs for details'
      },
      { status: 500 }
    );
  }
}
