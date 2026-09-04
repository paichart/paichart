/**
 * MCP Recommendation Auto-Generator
 *
 * Automatically generates workflow recommendations when new services are registered.
 * Creates 3-5 recommendations per service:
 * - Single-tool templates (1-2)
 * - Multi-tool workflows (1-2)
 * - Cross-service combos (1-2)
 *
 * Stores in MCPRecommendation table for persistence.
 */

import { PrismaClient, MCPRecommendationType, MCPImpact, MCPEffort } from '@prisma/client';

interface Tool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

interface Service {
  id: string;
  name: string;
  description: string | null;
  capabilities: {
    tools?: Array<Tool | string>;
    categories?: string[];
  };
}

interface WorkflowStep {
  service: string;
  tool: string;
  arguments?: Record<string, unknown>;
}

interface GeneratedRecommendation {
  type: MCPRecommendationType;
  title: string;
  description: string;
  confidence: number;
  impact: MCPImpact;
  effort: MCPEffort;
  actions: WorkflowStep[];
  parameters: Record<string, unknown>;
  context: Record<string, unknown>;
}

/**
 * Normalize tool to consistent format
 */
function normalizeTool(tool: Tool | string): Tool {
  if (typeof tool === 'string') {
    return { name: tool };
  }
  return tool;
}

/**
 * Tier 1 + 2: Smart argument generation with format-awareness and field name intelligence
 */
function generateSampleArguments(tool: Tool): Record<string, unknown> | undefined {
  if (!tool.inputSchema?.properties) return undefined;

  const args: Record<string, unknown> = {};
  const props = tool.inputSchema.properties;

  // Tier 2: Field name intelligence - smart defaults lookup table
  const smartDefaults: Record<string, any> = {
    // URLs and endpoints
    'url': 'https://example.com',
    'endpoint': 'https://api.example.com',
    'webhook': 'https://example.com/webhook',

    // Selectors (browser automation)
    'selector': 'body',
    'selectors': { "title": "h1", "content": ".main-content", "link": "a.primary" },
    'fieldMappings': { "name": "#input-name", "email": "#input-email" },
    'submitSelector': 'button[type="submit"]',
    'nextSelector': 'a.next-page',
    'waitFor': '.content-loaded',

    // Form data
    'formData': { "name": "John Doe", "email": "user@example.com" },

    // Financial/market data
    'symbol': 'AAPL',
    'ticker': 'AAPL',
    'symbols': ['AAPL', 'GOOGL', 'MSFT'],
    'interval': 'daily',
    'outputsize': 'compact',

    // Tool/method names
    'tool_name': 'list',
    'method': 'GET',
    'function': 'TIME_SERIES_DAILY',

    // Communication
    'channel': 'email',
    'priority': 'normal',
    'subject': 'Notification from workflow',
    'body': 'Workflow execution result',
    'recipients': [{ "id": "user", "address": "user@example.com" }],

    // Common fields
    'limit': 10,
    'maxPages': 5,
    'timeout': 30000,
    'waitAfter': 1000,
    'fullPage': true,
    'format': 'json'
  };

  for (const [key, schema] of Object.entries(props)) {
    const typedSchema = schema as {
      type?: string;
      enum?: string[];
      default?: unknown;
      format?: string;
      additionalProperties?: any;
      properties?: any;
      minimum?: number;
      maximum?: number;
    };

    // Priority 1: Use enum values
    if (typedSchema.enum && typedSchema.enum.length > 0) {
      args[key] = typedSchema.enum[0];
      continue;
    }

    // Priority 2: Use default values
    if (typedSchema.default !== undefined) {
      args[key] = typedSchema.default;
      continue;
    }

    // Priority 3: Tier 2 - Smart defaults by field name (exact match)
    const lowerKey = key.toLowerCase();
    if (smartDefaults[lowerKey]) {
      args[key] = smartDefaults[lowerKey];
      continue;
    }

    // Priority 4: Tier 1 - Format-aware generation
    if (typedSchema.format === 'uri' || lowerKey.includes('url') || lowerKey.includes('endpoint')) {
      args[key] = 'https://example.com';
      continue;
    }

    if (typedSchema.format === 'email' || lowerKey.includes('email')) {
      args[key] = 'user@example.com';
      continue;
    }

    // Priority 5: Type-specific with context
    switch (typedSchema.type) {
      case 'string':
        // Context-aware string generation
        if (lowerKey.includes('symbol') || lowerKey.includes('ticker')) {
          args[key] = 'AAPL';
        } else if (lowerKey.includes('selector')) {
          args[key] = '.content';
        } else if (lowerKey.includes('name')) {
          args[key] = 'example-name';
        } else {
          args[key] = 'example';
        }
        break;

      case 'number':
      case 'integer':
        // Use min/max constraints if available
        if (typedSchema.minimum !== undefined) {
          args[key] = typedSchema.minimum;
        } else if (typedSchema.maximum !== undefined) {
          args[key] = Math.min(10, typedSchema.maximum);
        } else {
          args[key] = 10;
        }
        break;

      case 'boolean':
        args[key] = lowerKey.includes('submit') ? false : true;
        break;

      case 'array':
        args[key] = [];
        break;

      case 'object':
        // Tier 1B: Generate meaningful object examples
        if (typedSchema.additionalProperties) {
          // Object with dynamic keys
          if (lowerKey.includes('selector')) {
            args[key] = { "title": "h1", "content": ".main" };
          } else if (lowerKey.includes('form') || lowerKey.includes('data')) {
            args[key] = { "field1": "value1" };
          } else if (lowerKey.includes('mapping')) {
            args[key] = { "key1": "#selector1" };
          } else {
            args[key] = {};
          }
        } else if (typedSchema.properties) {
          // Nested object - recurse would be ideal, but for now minimal example
          args[key] = {};
        } else {
          args[key] = {};
        }
        break;
    }
  }

  return Object.keys(args).length > 0 ? args : undefined;
}

/**
 * Generate single-tool recommendations
 */
function generateSingleToolRecommendations(service: Service): GeneratedRecommendation[] {
  const tools = (service.capabilities?.tools || []).map(normalizeTool);
  const recommendations: GeneratedRecommendation[] = [];

  // Pick up to 2 most interesting tools
  const interestingTools = tools.slice(0, 2);

  for (const tool of interestingTools) {
    const args = generateSampleArguments(tool);

    recommendations.push({
      type: 'AUTOMATION',
      title: `[TEMPLATE] ${tool.description || tool.name} Automation`,
      description: `⚠️ Template - Review and customize arguments before running.\n\nExecute ${service.name} ${tool.name} tool${args ? ' with sample parameters' : ''}`,
      confidence: 75, // ARCH-ANALYTICS-3 (2026-05-22): converted from decimal 0.75 to integer-percent — normalized at source
      impact: 'MEDIUM',
      effort: 'LOW',
      actions: [{
        service: service.name,
        tool: tool.name,
        arguments: args
      }],
      parameters: { toolName: tool.name },
      context: {
        serviceId: service.id,
        autoGenerated: true,
        generatedAt: new Date().toISOString()
      }
    });
  }

  return recommendations;
}

/**
 * Generate multi-tool workflow recommendations
 */
function generateMultiToolRecommendations(service: Service): GeneratedRecommendation[] {
  const tools = (service.capabilities?.tools || []).map(normalizeTool);
  const recommendations: GeneratedRecommendation[] = [];

  // Only create if service has 2+ tools
  if (tools.length < 2) return recommendations;

  // Create a workflow chaining first 2-3 tools
  const workflowTools = tools.slice(0, Math.min(3, tools.length));
  const steps: WorkflowStep[] = workflowTools.map((tool, idx) => {
    const args = generateSampleArguments(tool);

    // Add variable chaining for steps after first
    if (idx > 0 && args) {
      // Try to chain output from previous step
      args._previousOutput = `{{step.${idx - 1}.output}}`;
    }

    return {
      service: service.name,
      tool: tool.name,
      arguments: args
    };
  });

  recommendations.push({
    type: 'WORKFLOW_IMPROVEMENT',
    title: `[TEMPLATE] ${service.name} Multi-Step Workflow`,
    description: `⚠️ Template - Review and customize arguments before running.\n\nAutomated workflow combining ${workflowTools.length} ${service.name} tools`,
    confidence: 70, // ARCH-ANALYTICS-3 (2026-05-22): normalized 0.70 → 70
    impact: 'HIGH',
    effort: 'MEDIUM',
    actions: steps,
    parameters: { toolCount: workflowTools.length },
    context: {
      serviceId: service.id,
      autoGenerated: true,
      generatedAt: new Date().toISOString()
    }
  });

  return recommendations;
}

/**
 * Generate cross-service combo recommendations
 */
async function generateCrossServiceRecommendations(
  service: Service,
  prisma: PrismaClient
): Promise<GeneratedRecommendation[]> {
  const recommendations: GeneratedRecommendation[] = [];

  // Find complementary services (by name only - category is in capabilities JSON)
  const notificationServices = await prisma.mCPTool.findMany({
    where: {
      status: 'ACTIVE',
      name: { contains: 'notification', mode: 'insensitive' }
    },
    take: 1
  });

  const taskServices = await prisma.mCPTool.findMany({
    where: {
      status: 'ACTIVE',
      name: { contains: 'task', mode: 'insensitive' }
    },
    take: 1
  });

  // Service + Notification combo
  if (notificationServices.length > 0) {
    const notifService = notificationServices[0];
    const tools = (service.capabilities?.tools || []).map(normalizeTool);

    if (tools.length > 0) {
      const firstTool = tools[0];
      const args = generateSampleArguments(firstTool);

      recommendations.push({
        type: 'AUTOMATION',
        title: `[TEMPLATE] ${service.name} Alert System`,
        description: `⚠️ Template - Review and customize arguments before running.\n\nExecute ${service.name} ${firstTool.name} and send notification alerts`,
        confidence: 80, // ARCH-ANALYTICS-3 (2026-05-22): normalized 0.80 → 80
        impact: 'HIGH',
        effort: 'MEDIUM',
        actions: [
          {
            service: service.name,
            tool: firstTool.name,
            arguments: args
          },
          {
            service: notifService.name,
            tool: 'send',
            arguments: {
              channel: 'email',
              message: {
                subject: `${service.name} Alert`,
                body: 'Result: {{step.0.output}}',
                priority: 'normal'
              }
            }
          }
        ],
        parameters: { crossService: true },
        context: {
          serviceId: service.id,
          partnerServiceId: notifService.id,
          autoGenerated: true,
          generatedAt: new Date().toISOString()
        }
      });
    }
  }

  // Service + Task combo (for services with data tools)
  if (taskServices.length > 0) {
    const taskService = taskServices[0];
    const tools = (service.capabilities?.tools || []).map(normalizeTool);

    if (tools.length > 0) {
      const firstTool = tools[0];
      const args = generateSampleArguments(firstTool);

      recommendations.push({
        type: 'AUTOMATION',
        title: `[TEMPLATE] ${service.name} to Task`,
        description: `⚠️ Template - Requires customization before running.\n\n⚠️ IMPORTANT: Add "povId" to Step 2 arguments (task.create requires POV context).\n\nFetch data from ${service.name} and create tasks automatically`,
        confidence: 75, // ARCH-ANALYTICS-3 (2026-05-22): normalized 0.75 → 75
        impact: 'HIGH',
        effort: 'MEDIUM',
        actions: [
          {
            service: service.name,
            tool: firstTool.name,
            arguments: args
          },
          {
            service: taskService.name,
            tool: 'perform',
            arguments: {
              action: 'task.create',
              title: `Data from ${service.name}`,
              description: 'Auto-created from {{step.0.output}}',
              // NOTE: User must add povId - we can't know this at generation time
              // Example: "povId": "cm3xyz..." (get from project(action: 'pov.list') or project(action: 'pov.details'))
            }
          }
        ],
        parameters: { crossService: true },
        context: {
          serviceId: service.id,
          partnerServiceId: taskService.id,
          autoGenerated: true,
          generatedAt: new Date().toISOString()
        }
      });
    }
  }

  return recommendations;
}

/**
 * Main generator: Create all recommendations for a service
 */
export async function generateRecommendationsForService(
  service: Service,
  prisma: PrismaClient
): Promise<GeneratedRecommendation[]> {
  const recommendations: GeneratedRecommendation[] = [];

  // 1. Single-tool recommendations (1-2)
  recommendations.push(...generateSingleToolRecommendations(service));

  // 2. Multi-tool workflow (1)
  recommendations.push(...generateMultiToolRecommendations(service));

  // 3. Cross-service combos (1-2)
  const crossService = await generateCrossServiceRecommendations(service, prisma);
  recommendations.push(...crossService);

  return recommendations;
}

/**
 * Store recommendations in database
 */
export async function storeRecommendations(
  serviceId: string,
  recommendations: GeneratedRecommendation[],
  prisma: PrismaClient
): Promise<void> {
  // BC50 FIX: Wrap all creates in transaction to prevent partial recommendation sets
  await prisma.$transaction(async (tx) => {
    for (const rec of recommendations) {
      await tx.mCPRecommendation.create({
        data: {
          toolId: serviceId,
          type: rec.type,
          title: rec.title,
          description: rec.description,
          confidence: rec.confidence,
          impact: rec.impact,
          effort: rec.effort,
          actions: rec.actions as any, // Cast to JSON
          parameters: rec.parameters as any, // Cast to JSON
          context: rec.context as any, // Cast to JSON
          status: 'PENDING'
        }
      });
    }
  });
}

/**
 * Generate and store recommendations for a service
 */
export async function autoGenerateRecommendations(
  serviceId: string,
  prisma: PrismaClient
): Promise<number> {
  // Fetch service
  const service = await prisma.mCPTool.findUnique({
    where: { id: serviceId }
  });

  if (!service || service.status !== 'ACTIVE') {
    return 0;
  }

  // Delete old PENDING recommendations for this service (replace pattern)
  // Keep IMPLEMENTED/APPROVED recommendations (user has acted on them)
  await prisma.mCPRecommendation.deleteMany({
    where: {
      toolId: serviceId,
      status: 'PENDING'
    }
  });

  // Generate recommendations
  const recommendations = await generateRecommendationsForService(service as unknown as Service, prisma);

  // Store in database
  await storeRecommendations(serviceId, recommendations, prisma);

  return recommendations.length;
}
