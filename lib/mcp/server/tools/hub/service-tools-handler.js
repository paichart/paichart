/**
 * Service Tools Handler
 *
 * Get detailed tool definitions for a service including parameter schemas.
 * Enables AI clients to discover what parameters to pass to services(action: "call").
 *
 * Gold Standard Compliance:
 * - GS4: State-aware responses (nextSteps adapt to found/empty, schema presence)
 * - GS7: Error response nextSteps
 * - GS8: Centralized error helpers
 * - GS9: Success response _meta
 *
 * Part of MCP Hub service discovery enhancement (Phase 2).
 */

const { resolveService, sanitizeEndpointUrl } = require('./hub-shared-middleware');
const { enhancedOperationError, notFoundError, missingServiceIdentifierError, serviceNotFoundByIdError } = require('./error-helpers');
const { stderr, createAdapter } = require('../../mcp-logger');
const log = createAdapter(stderr.mcpLogger.child({ component: 'hub-service-tools' }));

class ServiceToolsHandler {
  /**
   * @param {Object} prisma - Prisma client instance
   */
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Get tool definitions for a service
   *
   * @param {Object} args - Request arguments
   * @param {string} [args.serviceId] - Service ID (CUID)
   * @param {string} [args.service_name] - Service name for fuzzy lookup
   *
   * @returns {Promise<Object>} Tool definitions with schemas
   *
   * @example
   * const result = await handler.handle({ service_name: 'notification-service' });
   * // Returns: { service: {...}, tools: [{name, description, inputSchema}], toolCount: 4, ... }
   */
  async handle(args, context) {
    try {
      // #218 Phase 3 sec-ops M2 (2026-05-23): per-user rate limit on tools
      // enumeration. Public-registry semantics (sec-ops H1 closed as design)
      // means schemas + endpoints are intentionally enumerable, but a tight
      // loop calling registry(action: 'tools', service_name: ...) across the
      // catalogue could still flood backend. apiRateLimiter shape (100/min)
      // is sensible — reads can be more permissive than writes.
      //
      // Anonymous calls (no userId in context) fall through to a shared
      // bucket to avoid an unauthenticated bypass. extractAuthContext throws
      // when no userId; tools is read-only so we don't want to fail-closed
      // — extract userId directly without throwing.
      const userId = context?.user?.id || context?.apiUserContext?.userId;
      const rateUserKey = userId || 'anonymous';
      const { apiRateLimiter } = require('../../../../utils/rate-limiter');
      const toolsRateLimitKey = `registry.tools:${rateUserKey}`;
      const toolsAllowed = await apiRateLimiter.checkLimit(toolsRateLimitKey);
      if (!toolsAllowed) {
        throw new Error(
          '⏱️ Rate limit reached: too many registry tools calls. ' +
          'Limit: 100 per minute per user. Add filters to narrow your enumeration.'
        );
      }

      const { serviceId, service_name } = args;
      let finalServiceId = serviceId;

      // Service name lookup via shared middleware (fuzzy search + alias resolution)
      if (!finalServiceId && service_name) {
        const result = await resolveService({
          args: { service_name },
          prisma: this.prisma,
          options: {
            toolName: 'registry',
            statusFilter: ['ACTIVE', 'INACTIVE', 'MAINTENANCE']
          }
        });
        if (result.notFound) return result.notFound;
        finalServiceId = result.serviceId;
      }

      if (!finalServiceId) {
        throw missingServiceIdentifierError('tools');
      }

      // Fetch service with capabilities
      const service = await this.prisma.mCPTool.findUnique({
        where: { id: finalServiceId },
        select: {
          id: true,
          name: true,
          description: true,
          version: true,
          status: true,
          capabilities: true,
          configuration: true,  // Phase 3a: Endpoint info needed for tool calling
          credentials: false,  // Phase 3a: NEVER return encrypted credentials
        }
      });

      if (!service) {
        throw serviceNotFoundByIdError(finalServiceId, 'tools');
      }

      // Extract tools from capabilities
      const tools = this.extractTools(service.capabilities);
      const hasFullSchemas = this.hasFullSchemas(tools);
      const schemaVersion = hasFullSchemas ? 2 : 1;

      log.info({ serviceName: service.name, toolCount: tools.length, schemaVersion }, 'Service tools resolved');

      // Build state-aware response (GS4)
      const nextSteps = this.buildNextSteps(service, tools, hasFullSchemas);

      // Build quality assessment (implicit feedback for service owners)
      const qualityAssessment = this.buildQualityAssessment(tools, hasFullSchemas);

      return {
        service: {
          id: service.id,
          name: service.name,
          description: service.description,
          version: service.version,
          status: service.status,
          endpoint: sanitizeEndpointUrl(service.configuration?.endpoint) || null
        },
        tools: tools,
        toolCount: tools.length,
        schemaVersion: schemaVersion,

        // Quality assessment with implicit upgrade guidance
        qualityAssessment: qualityAssessment,

        // GS4: State-aware nextSteps
        nextSteps: nextSteps,

        // GS9: Success _meta
        _meta: {
          tool: 'registry',
          timestamp: new Date().toISOString(),
          sdkNative: true,
          schemaVersion: schemaVersion,
          hasFullSchemas: hasFullSchemas
        }
      };
    } catch (error) {
      log.error({ err: error }, 'Get service tools failed');

      // GS7 + GS8: Error with nextSteps using centralized helper
      throw enhancedOperationError('Get service tools', error, {
        validParams: [
          'service_name: Service name (partial matching supported)',
          'serviceId: Exact service ID (CUID format)'
        ],
        examples: [
          "registry(action: 'tools', service_name: 'notification-service')",
          "registry(action: 'tools', service_name: 'browser-automation-service')",
          "registry(action: 'tools', serviceId: 'cm123...')"
        ],
        tips: [
          'Use services(action: "discover") to find available services first',
          'Service names support fuzzy matching (e.g., "notif" finds "notification-service")',
          'If schemaVersion is 1, service was registered without full tool schemas'
        ]
      });
    }
  }

  /**
   * Extract tools from capabilities, normalizing both formats
   * @private
   */
  extractTools(capabilities) {
    if (!capabilities?.tools) {
      return [];
    }

    return capabilities.tools.map(tool => {
      // String format (legacy) -> minimal object
      if (typeof tool === 'string') {
        return {
          name: tool,
          description: null,
          inputSchema: null
        };
      }

      // Object format -> pass through with defaults
      return {
        name: tool.name,
        description: tool.description || null,
        inputSchema: tool.inputSchema || null
      };
    });
  }

  /**
   * Check if tools have full schemas
   * @private
   */
  hasFullSchemas(tools) {
    if (tools.length === 0) return false;

    // At least one tool has inputSchema
    return tools.some(t => t.inputSchema !== null);
  }

  /**
   * Build state-aware nextSteps (GS4)
   * @private
   */
  buildNextSteps(service, tools, hasFullSchemas) {
    if (tools.length === 0) {
      return [
        `No tools registered for "${service.name}"`,
        'This service may only expose resources or prompts',
        `Check capabilities: services(action: "discover", service_name: '${service.name}')`,
        'Or contact the service owner to add tools'
      ];
    }

    const firstTool = tools[0];

    if (hasFullSchemas) {
      // Full schemas available — show correct workflow order: health check BEFORE calling
      const exampleParams = this.buildExampleParams(firstTool);
      return [
        `Found ${tools.length} tools for "${service.name}" with full parameter schemas`,
        `Step 1 — Health check: services(action: 'health', service_name: '${service.name}')`,
        `Step 2 — Call: services(action: "call", targetService: '${service.name}', tool: '${firstTool.name}', arguments: ${exampleParams})`,
        `Step 3 — Report: perform(action: "task.comment", taskId: '...', comment: 'PASS/FAIL results table')`
      ];
    }

    // Legacy format - no schemas
    return [
      `Found ${tools.length} tools for "${service.name}" (legacy registration)`,
      `⚠️ Tool parameter schemas not available (schemaVersion: 1)`,
      `Example: services(action: "call", targetService: '${service.name}', tool: '${firstTool.name}', arguments: {...})`,
      'Contact service owner to update registration with full tool schemas',
      `Or check service documentation for parameter requirements`
    ];
  }

  /**
   * Build example parameters from inputSchema
   * @private
   */
  buildExampleParams(tool) {
    if (!tool.inputSchema?.properties) {
      return '{...}';
    }

    const props = tool.inputSchema.properties;
    const required = tool.inputSchema.required || [];
    const example = {};

    // Build example from required properties
    for (const prop of required.slice(0, 3)) {
      const schema = props[prop];
      if (schema) {
        if (schema.enum) {
          example[prop] = schema.enum[0];
        } else if (schema.type === 'string') {
          example[prop] = `<${prop}>`;
        } else if (schema.type === 'object') {
          example[prop] = {};
        } else if (schema.type === 'array') {
          example[prop] = [];
        } else {
          example[prop] = `<${prop}>`;
        }
      }
    }

    return JSON.stringify(example);
  }

  /**
   * Build quality assessment with implicit upgrade guidance
   * @private
   */
  buildQualityAssessment(tools, hasFullSchemas) {
    // No tools = lowest quality
    if (tools.length === 0) {
      return {
        grade: 'D',
        schemaQuality: 'none',
        message: 'No tools registered - service provides no callable functionality',
        improvement: 'Register tools with full inputSchema to enable AI client interaction'
      };
    }

    // Count tools with full schemas
    const toolsWithSchema = tools.filter(t => t.inputSchema !== null).length;
    const schemaPercentage = Math.round((toolsWithSchema / tools.length) * 100);

    // Full schemas = A grade
    if (hasFullSchemas && schemaPercentage === 100) {
      return {
        grade: 'A',
        schemaQuality: 'full',
        toolsWithSchema: toolsWithSchema,
        totalTools: tools.length,
        message: 'All tools have full parameter schemas - excellent AI client compatibility'
      };
    }

    // Partial schemas = B grade
    if (hasFullSchemas && schemaPercentage > 0) {
      const missingSchemas = tools.filter(t => t.inputSchema === null).map(t => t.name);
      return {
        grade: 'B',
        schemaQuality: 'partial',
        toolsWithSchema: toolsWithSchema,
        totalTools: tools.length,
        schemaPercentage: schemaPercentage,
        message: `${toolsWithSchema}/${tools.length} tools have schemas - good but incomplete`,
        improvement: `Add inputSchema to: ${missingSchemas.join(', ')}`,
        toolsMissingSchemas: missingSchemas
      };
    }

    // No schemas = C grade (legacy registration)
    return {
      grade: 'C',
      schemaQuality: 'legacy',
      toolsWithSchema: 0,
      totalTools: tools.length,
      message: 'Legacy registration - tool names only, no parameter schemas',
      improvement: 'Upgrade registration: Re-register with full tool schemas (name, description, inputSchema)',
      upgradeExample: {
        before: 'capabilities: { tools: ["tool_name"] }',
        after: 'capabilities: { tools: [{ name: "tool_name", description: "...", inputSchema: {...} }] }'
      },
      upgradeGuide: 'See MCP Hub Integration Guide for full schema examples'
    };
  }
}

module.exports = { ServiceToolsHandler };
