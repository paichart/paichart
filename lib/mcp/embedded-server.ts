/**
 * Embedded MCP Server for pAIchart
 * Integrates MCP Server v3.0 directly into the main server process
 */

import { MCPTool } from '../services/llm/mcp-integration';
import { prisma } from '../prisma';
import { AgentCategory, AgentTemplateStatus } from '@prisma/client';
import { mcpLogger } from '@/lib/logger';
import { validateMCPPOVAccess } from '@/lib/auth/validate-pov-access';
import { assertResourceAuthz, resolveResourceName } from '@/lib/mcp/resource-authz';

// Import our SDK-native MCP server components
import { SDKNativeBasicTools } from './server/tools/sdk-native-basic-tools';
import { SDKNativeAdvancedTools } from './server/tools/sdk-native-advanced-tools';
// Browser Automation moved to browser-automation-service (MCP service at port 3100)
import { TOOL_SCHEMAS, CONSOLIDATED_SCHEMAS } from './server/config/tool-schemas';
import { SERVER_CONFIG } from './server/config/server-config';
import { ensureObject } from '../utils/ensure-object';

import { responseFormatter } from './server/utils/formatters';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Signed URL generation for artifact downloads (shared utility)
const { generateDownloadUrl } = require('./resource-manager-shared');

// Hub service tools — agents can call external services during task execution
const { HubToolsHandler } = require('./server/tools/hub-tools-handler');

// Consolidated tool dispatchers (14 tools -> 5)
const { ProjectDispatcher } = require('./server/tools/dispatchers/project-dispatcher');
const { AnalyticsDispatcher } = require('./server/tools/dispatchers/analytics-dispatcher');
const { TemplateDispatcher } = require('./server/tools/dispatchers/template-dispatcher');
const { ServicesDispatcher } = require('./server/tools/dispatchers/services-dispatcher');
const { RegistryDispatcher } = require('./server/tools/dispatchers/registry-dispatcher');
const { wrapWithSchema } = require('./server/tools/dispatchers/dispatch-with-schema');

export interface EmbeddedMCPServerConfig {
  enableFallback: boolean;
  logLevel: 'debug' | 'info' | 'error';
  apiTimeout: number;
}

export class EmbeddedMCPServer {
  private isRunning: boolean = false;
  private toolImplementations: Map<string, Function> = new Map();
  private config: EmbeddedMCPServerConfig;
  private logger: any;

  constructor(config?: Partial<EmbeddedMCPServerConfig>) {
    this.config = {
      enableFallback: true,
      logLevel: 'info',
      apiTimeout: 30000,
      ...config
    };
    
    this.logger = this.createLogger();
  }

  private createLogger() {
    const pinoLog = mcpLogger.child({ module: 'EmbeddedMCPServer' });
    return {
      info: (msg: string, ...args: any[]) => pinoLog.info({ args: args.length ? args : undefined }, msg),
      error: (msg: string, ...args: any[]) => pinoLog.error({ args: args.length ? args : undefined }, msg),
      debug: (msg: string, ...args: any[]) => {
        if (this.config.logLevel === 'debug') {
          pinoLog.debug({ args: args.length ? args : undefined }, msg);
        }
      }
    };
  }

  /**
   * Start the embedded MCP server
   */
  async start(): Promise<void> {
    try {
      this.logger.info('Starting embedded MCP server v3.0...');

      // Test API connectivity first
      await this.testConnectivity();

      // Register all tool implementations
      await this.registerToolImplementations();

      this.isRunning = true;
      this.logger.info(`Embedded MCP server started successfully with ${this.toolImplementations.size} tools`);
    } catch (error) {
      this.logger.error('Failed to start embedded MCP server:', error);
      throw error;
    }
  }

  /**
   * Get available tools
   */
  async getTools(): Promise<MCPTool[]> {
    if (!this.isRunning) {
      this.logger.error('getTools called but server is not running');
      throw new Error('Embedded MCP server is not running');
    }

    this.logger.debug('Getting available tools from embedded server...');
    this.logger.debug(`Found ${this.toolImplementations.size} tool implementations.`);

    const tools: MCPTool[] = [];

    for (const [toolName, implementation] of this.toolImplementations) {
      // Use consolidated schemas first, fall back to legacy TOOL_SCHEMAS
      const schema = CONSOLIDATED_SCHEMAS[toolName as keyof typeof CONSOLIDATED_SCHEMAS]
        || TOOL_SCHEMAS[toolName as keyof typeof TOOL_SCHEMAS];
      if (schema) {
        tools.push({
          name: toolName,
          description: schema.description,
          inputSchema: this.convertZodToJsonSchema(schema.inputSchema)
        });
      } else {
        this.logger.warn(`No schema found for tool: ${toolName}`);
      }
    }

    this.logger.debug(`Returning ${tools.length} tools`);
    return tools;
  }

  /**
   * Execute a tool
   */
  async callTool(name: string, args: any, context?: any): Promise<any> {
    if (!this.isRunning) {
      throw new Error('Embedded MCP server is not running');
    }

    // Defense-in-depth: receives external args indirectly via mcpService.callEmbeddedTool
    args = ensureObject(args, {}, 'Embedded Server');

    this.logger.debug(`Executing tool: ${name}`);
    this.logger.debug(`Arguments:`, args);

    const implementation = this.toolImplementations.get(name);
    if (!implementation) {
      throw new Error(`Tool not found: ${name}`);
    }

    try {
      // Pass context to tool handlers (required for user auth in ContextEnricher)
      const result = await implementation(args, context || {});
      this.logger.debug(`Tool ${name} executed successfully`);
      
      // Enhanced: Apply structured output transformation
      const structuredResult = this.enhanceWithStructuredOutput(result, name, args);
      return structuredResult;
    } catch (error) {
      this.logger.error(`Tool ${name} execution failed:`, error);
      throw error;
    }
  }

  /**
   * Normalize a raw tool result into the MCP content-array shape the agent loop consumes.
   *
   * LEANED 2026-07-08 (Finding E, 4-specialist review — cline_docs/reviews/services-envelope-bloat-2026-07-08/):
   * the former "Phase 5 structured output enhancement" attached a recursively generated
   * schema-with-live-examples (~a full second copy of the data), a duplicate human-readable
   * summary block, per-line text `structure.sections` echoes, resource-links, and an outer
   * `metadata` wrapper that mcpService.callEmbeddedTool discarded on every call. Measured cost:
   * 45-49% of EVERY embedded tool response (the reason Test B's scoped device reads all crossed
   * the 8 KB Tier-1 cap). Nothing consumed any of it (14 consumer classes swept). External
   * clients never saw this path.
   *
   * LOAD-BEARING and kept: the object->content normalization (mcpService reads
   * `response.content || []` — a raw object result MUST be wrapped or the payload is silently
   * dropped) and payload-FIRST ordering (Tier-1 truncation must cut decoration, never data).
   */
  private enhanceWithStructuredOutput(result: any, toolName: string, args: any): any {
    // Already content-array shaped (most handlers): pass through untouched.
    if (result && result.content && Array.isArray(result.content)) {
      return result;
    }

    if (typeof result === 'string') {
      return { content: [{ type: 'text', text: result }] };
    }

    if (typeof result === 'object' && result !== null) {
      return {
        content: [{
          type: 'data',
          data: result,
          annotations: {
            dataType: Array.isArray(result) ? 'array' : 'object',
            itemCount: Array.isArray(result) ? result.length : Object.keys(result).length
          }
        }]
      };
    }

    // Primitive (number/boolean/null) — formerly produced an EMPTY content array; surface it.
    return { content: [{ type: 'text', text: String(result) }] };
  }

  /**
   * Phase 5: Create Resource Link Preview
   * Generate lightweight previews of resource content without full load
   */
  async createResourcePreview(uri: string, maxItems: number = 3): Promise<any> {
    const resourceName = uri.split('/').pop()?.split('?')[0];
    
    switch (resourceName) {
      case 'pov-database':
        return {
          type: 'preview',
          summary: `${await this.getResourceItemCount('pov')} POVs available`,
          sampleItems: await this.getSampleItems('pov', maxItems),
          totalEstimatedItems: await this.getResourceItemCount('pov'),
          lastUpdated: new Date().toISOString()
        };
        
      case 'task-database':
        return {
          type: 'preview',
          summary: `${await this.getResourceItemCount('task')} tasks available`,
          sampleItems: await this.getSampleItems('task', maxItems),
          totalEstimatedItems: await this.getResourceItemCount('task'),
          lastUpdated: new Date().toISOString()
        };
        
      case 'agent-templates':
        return {
          type: 'preview',
          summary: `${await this.getResourceItemCount('agent-template')} templates available`,
          sampleItems: await this.getSampleItems('agent-template', maxItems),
          totalEstimatedItems: await this.getResourceItemCount('agent-template'),
          lastUpdated: new Date().toISOString()
        };
        
      default:
        return {
          type: 'preview',
          summary: 'Resource available for detailed access',
          note: 'Use readResource() for full content'
        };
    }
  }

  /**
   * Get estimated count of items in a resource
   */
  private async getResourceItemCount(resourceType: string): Promise<number> {
    // This would typically query the database for actual counts
    // For now, return reasonable estimates
    switch (resourceType) {
      case 'pov': return 15;
      case 'task': return 127;
      case 'agent-template': return 23;
      default: return 0;
    }
  }

  /**
   * Get sample items from a resource for preview
   */
  private async getSampleItems(resourceType: string, maxItems: number): Promise<any[]> {
    // This would typically query the database for actual sample items
    // For now, return mock preview data
    switch (resourceType) {
      case 'pov':
        return [
          { id: 'pov-1', title: 'Digital Transformation Initiative', status: 'ACTIVE' },
          { id: 'pov-2', title: 'Cloud Migration Project', status: 'IN_PROGRESS' },
          { id: 'pov-3', title: 'Customer Portal Redesign', status: 'COMPLETED' }
        ].slice(0, maxItems);
        
      case 'task':
        return [
          { id: 'task-1', title: 'Requirements Analysis', status: 'IN_PROGRESS' },
          { id: 'task-2', title: 'Architecture Design', status: 'OPEN' },
          { id: 'task-3', title: 'Security Review', status: 'COMPLETED' }
        ].slice(0, maxItems);
        
      case 'agent-template':
        return [
          { id: 'tmpl-1', name: 'Technical Analyst', category: 'analysis' },
          { id: 'tmpl-2', name: 'Project Manager', category: 'management' },
          { id: 'tmpl-3', name: 'Quality Assurance', category: 'testing' }
        ].slice(0, maxItems);
        
      default:
        return [];
    }
  }

  /**
   * Stop the embedded server
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping embedded MCP server...');
    
    this.toolImplementations.clear();
    this.isRunning = false;
    
    this.logger.info('Embedded MCP server stopped');
  }

  /**
   * Check if server is running
   */
  isReady(): boolean {
    return this.isRunning;
  }

  /**
   * Get available resources
   */
  async getResources(): Promise<any[]> {
    if (!this.isRunning) {
      this.logger.error('getResources called but server is not running');
      throw new Error('Embedded MCP server is not running');
    }

    this.logger.debug('Getting available resources from embedded server...');

    // Define static resources that our embedded server provides
    const staticResources = [
      {
        name: 'pov-database',
        description: 'Access to POV (Proof of Value) project database',
        uri: 'embedded://paichart/pov-database',
        mimeType: 'application/json'
      },
      {
        name: 'task-database', 
        description: 'Access to task management database',
        uri: 'embedded://paichart/task-database',
        mimeType: 'application/json'
      },
      {
        name: 'agent-templates',
        description: 'Available agent templates and configurations',
        uri: 'embedded://paichart/agent-templates',
        mimeType: 'application/json'
      },
      {
        name: 'team-performance',
        description: 'Team performance metrics and analytics',
        uri: 'embedded://paichart/team-performance',
        mimeType: 'application/json'
      },
      {
        name: 'system-logs',
        description: 'System activity and audit logs',
        uri: 'embedded://paichart/system-logs',
        mimeType: 'text/plain'
      },
      {
        name: 'ai-recommendations',
        description: 'AI-generated recommendations and insights',
        uri: 'embedded://paichart/ai-recommendations',
        mimeType: 'application/json'
      }
    ];

    // Get dynamic resources from MCPResourceManager (agent executions, artifacts, etc.)
    try {
      const { mcpResourceManager, MCPResourceStatus } = await import('../services/mcp/resourceManager');
      const dynamicResources = await mcpResourceManager.listResources({
        serverName: 'paichart-embedded-mcp',
        status: MCPResourceStatus.AVAILABLE
      });

      // Convert MCPResourceManager resources to MCP resource format
      const mcpDynamicResources = dynamicResources.map(resource => ({
        name: resource.name,
        description: resource.description || `Dynamic resource: ${resource.id}`,
        uri: resource.uri,
        mimeType: resource.metadata?.contentType || 'application/json'
      }));

      // Combine static and dynamic resources
      const allResources = [...staticResources, ...mcpDynamicResources];
      
      this.logger.debug(`Returning ${allResources.length} resources (${staticResources.length} static, ${mcpDynamicResources.length} dynamic)`);
      return allResources;
    } catch (error) {
      this.logger.error('Failed to get dynamic resources from MCPResourceManager:', error);
      // Fall back to static resources only if MCPResourceManager fails
      this.logger.debug(`Returning ${staticResources.length} static resources (dynamic resources unavailable)`);
      return staticResources;
    }
  }

  /**
   * Read resource content with enhanced filtering and real-time capabilities
   */
  async readResource(uri: string, filters?: any, userContext?: { userId: string; role: string }): Promise<any> {
    if (!this.isRunning) {
      throw new Error('Embedded MCP server is not running');
    }

    this.logger.debug(`Reading enhanced resource: ${uri}`, filters ? { filters } : {});

    // Extract resource name from URI (query-stripped — without this, an
    // inline-query URI like mcp://database/pov-database?status=X yielded
    // resourceName 'pov-database?status=X', missed every switch case, and
    // threw "Unknown resource" while the query-parsing below sat dead)
    const resourceName = uri.split('?')[0].split('/').pop();

    // Parse query parameters from URI if present
    const uriParts = uri.split('?');
    const queryParams = uriParts.length > 1 ? this.parseQueryString(uriParts[1]) : {};
    
    // Merge URI params with provided filters
    const combinedFilters = { ...queryParams, ...filters };

    this.logger.debug(`Processing resource with combined filters:`, combinedFilters);

    // Dispatch-level boundary guard (resource-boundary-contract-2026-06-13):
    // every dispatchable name must carry a RESOURCE_AUTHZ classification, and
    // TENANT_SCOPED resources throw on absent userContext. A new resource
    // case added below without a classification fails loudly on first read
    // (this also replaces the enumerated unknown-resource message for
    // unrecognized names — still a clear throw). Each method re-asserts
    // first-line, covering direct private-method calls; per-method row
    // scoping remains the second layer.
    const authzName = resolveResourceName(uri);
    if (authzName) {
      assertResourceAuthz(authzName, userContext);
    }

    switch (resourceName) {
      case 'pov-database':
        return await this.getPOVDatabaseContent(combinedFilters, userContext);
      case 'task-database':
        return await this.getTaskDatabaseContent(combinedFilters, userContext);
      case 'agent-templates':
        return await this.getAgentTemplatesContent(combinedFilters, userContext);
      case 'team-performance':
        return await this.getTeamPerformanceContent(userContext);
      case 'system-logs':
        return await this.getSystemLogsContent(userContext);
      case 'ai-recommendations':
        return await this.getAIRecommendationsContent(userContext);
      default:
        // Check if it's an agent execution resource with pattern agent-execution/{id}
        if (uri.includes('agent-execution/')) {
          const executionId = uri.split('agent-execution/').pop()?.split('?')[0];
          if (executionId) {
            return await this.getAgentExecutionContent(executionId, combinedFilters, userContext);
          }
        }
        
        // Check if it's an agent artifact resource with pattern agent-artifact/{id}
        if (uri.includes('agent-artifact/')) {
          const artifactId = uri.split('agent-artifact/').pop()?.split('?')[0];
          if (artifactId) {
            return await this.getAgentArtifactContent(artifactId, combinedFilters, userContext);
          }
        }
        
        throw new Error(`Unknown resource: ${resourceName}. Available resources: pov-database, task-database, agent-templates, team-performance, system-logs, ai-recommendations, agent-execution/{id}, agent-artifact/{id}`);
    }
  }

  /**
   * Parse query string into object
   */
  private parseQueryString(queryString: string): Record<string, any> {
    const params: Record<string, any> = {};
    const pairs = queryString.split('&');
    
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key && value) {
        const decodedKey = decodeURIComponent(key);
        const decodedValue = decodeURIComponent(value);
        
        // Try to parse common data types
        if (decodedValue === 'true') params[decodedKey] = true;
        else if (decodedValue === 'false') params[decodedKey] = false;
        else if (!isNaN(Number(decodedValue)) && isFinite(Number(decodedValue))) {
          params[decodedKey] = Number(decodedValue);
        } else {
          params[decodedKey] = decodedValue;
        }
      }
    }
    
    return params;
  }

  /**
   * Get server status
   */
  getStatus() {
    return {
      running: this.isRunning,
      toolCount: this.toolImplementations.size,
      resourceCount: 6, // Number of resources we provide
      promptCount: 0, // Embedded server serves no prompts (dead prompt subsystem removed 2026-06-30)
      config: this.config,
      apiConnected: true // Direct Prisma — connectivity verified at startup
    };
  }

  // Private helper methods

  private async testConnectivity(): Promise<void> {
    this.logger.debug('Testing database connectivity...');

    try {
      await prisma.$queryRaw`SELECT 1`;
      this.logger.info('Database connectivity test passed');
    } catch (error) {
      this.logger.error('Database connectivity test failed:', error);
      if (!this.config.enableFallback) {
        throw error;
      }
      this.logger.info('Continuing with fallback mode enabled');
    }
  }

  private async registerToolImplementations(): Promise<void> {
    this.logger.debug('Registering SDK-native tool implementations...');

    // Initialize SDK-native tool handlers in standalone mode
    // Phase 3.5: Constructors now accept undefined for standalone use (Dec 2025)
    const basicTools = new SDKNativeBasicTools(undefined);
    const advancedTools = new SDKNativeAdvancedTools(undefined);
    // Browser Automation moved to browser-automation-service (MCP service at port 3100)

    // Hub tools — agents can call external services (weather, sentry, notifications, etc.)
    const hubTools = new HubToolsHandler(prisma);

    // Consolidated tool dispatchers (19 tools -> 6)
    const projectDispatcher = new ProjectDispatcher(basicTools, advancedTools);
    const analyticsDispatcher = new AnalyticsDispatcher(advancedTools);
    const templateDispatcher = new TemplateDispatcher(basicTools);
    const servicesDispatcher = new ServicesDispatcher(hubTools);
    const registryDispatcher = new RegistryDispatcher(hubTools);

    // Phase 1.5 (2026-05-17) — wrapWithSchema makes GS14 enforcement
    // structural at the registration site. The 3-line safeParse-and-
    // destructure boilerplate that previously lived at the top of each
    // dispatcher's handle() is gone — wrapper runs first, dispatcher
    // receives pre-validated args.
    //
    // Adding a new consolidated tool requires touching THIS file AND
    // tool-schemas.js. Configuration drift (typo, missing schema entry)
    // throws at first call via dispatch-with-schema lookup-miss check.
    //
    // `perform` stays direct — already validated via tasks-action-router.ts
    // (the canonical GS14 reference; this Phase 1.5 brings the other 5 to
    // structural parity with it).
    // BUG-STANDALONE-005 sibling fix (2026-05-23, Phase 3 sec-ops M1 note):
    // `perform` was the ONE consolidated tool registered BARE here while
    // the other 5 were wrapped. Same phantom-canonical schema pattern as
    // mcp-server-v5.js:1117 (prompt_command). Wrap perform for parity —
    // schema enforcement now runs on the embedded-server transport too.
    const allTools: Record<string, (args: any, context: any) => Promise<any>> = {
      project: wrapWithSchema('project', projectDispatcher.handle.bind(projectDispatcher)),
      perform: wrapWithSchema('perform', advancedTools.handleExecuteTaskAction.bind(advancedTools)),
      analytics: wrapWithSchema('analytics', analyticsDispatcher.handle.bind(analyticsDispatcher)),
      template: wrapWithSchema('template', templateDispatcher.handle.bind(templateDispatcher)),
      services: wrapWithSchema('services', servicesDispatcher.handle.bind(servicesDispatcher)),
      registry: wrapWithSchema('registry', registryDispatcher.handle.bind(registryDispatcher)),
    };

    // Register each tool
    for (const [toolName, implementation] of Object.entries(allTools)) {
      this.toolImplementations.set(toolName, implementation);
      this.logger.debug(`Registered SDK-native tool: ${toolName}`);
    }

    this.logger.info(`Registered ${this.toolImplementations.size} SDK-native tool implementations`);
  }

  private convertZodToJsonSchema(zodSchema: any): any {
    try {
      return zodToJsonSchema(zodSchema, { target: 'jsonSchema7' });
    } catch {
      this.logger.warn('Failed to convert Zod schema to JSON Schema, using fallback');
      return {
        type: 'object',
        properties: {},
        additionalProperties: true
      };
    }
  }

  /**
   * Test all tools (for debugging)
   */
  async testAllTools(): Promise<Record<string, any>> {
    if (!this.isRunning) {
      throw new Error('Embedded MCP server is not running');
    }

    this.logger.info('Testing all SDK-native tools...');
    
    const results: Record<string, any> = {};

    // Test each registered tool
    for (const [toolName, implementation] of this.toolImplementations) {
      try {
        this.logger.debug(`Testing tool: ${toolName}`);
        
        // Provide basic test arguments based on consolidated tool name
        let testArgs: any = {};
        switch (toolName) {
          case 'project':
            testArgs = { action: 'pov.list', limit: 5 };
            break;
          case 'perform':
            testArgs = {
              action: 'analytics.generate',
              parameters: {
                analyticsType: 'performance',
                filters: { timeframeDays: 7 }
              }
            };
            break;
          case 'analytics':
            testArgs = { action: 'recommendations.get', limit: 5, type: 'OPTIMIZATION' };
            break;
          case 'template':
            testArgs = { action: 'list' };
            break;
          case 'services':
            testArgs = { action: 'discover' };
            break;
          default:
            testArgs = {};
        }
        
        const result = await implementation(testArgs);
        results[toolName] = {
          success: !result.isError,
          response: result,
          sdkNative: true
        };
        
      } catch (error) {
        results[toolName] = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          sdkNative: true
        };
      }
    }

    // Summary
    let totalTests = 0;
    let passedTests = 0;
    let skippedTests = 0;
    
    for (const [toolName, result] of Object.entries(results)) {
      totalTests++;
      if (result.skipped) {
        skippedTests++;
        this.logger.info(`${toolName}: ⏭️ SKIPPED (${result.reason})`);
      } else if (result.success) {
        passedTests++;
        this.logger.info(`${toolName}: ✅ PASS`);
      } else {
        this.logger.info(`${toolName}: ❌ FAIL`);
        this.logger.error(`  Error: ${result.error}`);
      }
    }

    this.logger.info(`Test Summary: ${passedTests}/${totalTests} tools passed, ${skippedTests} skipped`);
    return results;
  }

  // Resource enhancement methods

  /**
   * Enhance resource data with execution context and real-time metrics
   */
  private async enhanceResourceWithExecutionContext(data: any[], resourceType: string): Promise<any[]> {
    try {
      this.logger.debug(`Enhancing ${data.length} ${resourceType} resources with execution context`);
      
      return await Promise.all(data.map(async (item) => {
        const enhanced = { ...item };
        
        try {
          // Add execution context based on resource type
          switch (resourceType) {
            case 'pov':
              enhanced.executionContext = await this.getPOVExecutionContext(item.id);
              break;
            case 'task':
              enhanced.executionContext = await this.getTaskExecutionContext(item.id);
              break;
            case 'agent-template':
              enhanced.executionContext = await this.getTemplateExecutionContext(item.id);
              break;
          }
          
          // Add real-time metrics
          enhanced.realTimeMetrics = await this.getRealTimeMetrics(item.id, resourceType);
          
          // Add enhancement timestamp
          enhanced._enhanced = {
            timestamp: new Date().toISOString(),
            version: '2.0',
            features: ['execution_context', 'real_time_metrics']
          };
          
        } catch (enhancementError) {
          const errorMessage = enhancementError instanceof Error ? enhancementError.message : String(enhancementError);
          this.logger.debug(`Failed to enhance ${resourceType} ${item.id}:`, errorMessage);
          enhanced._enhancementError = errorMessage;
        }
        
        return enhanced;
      }));
    } catch (error) {
      this.logger.error(`Failed to enhance ${resourceType} resources:`, error);
      return data; // Return original data if enhancement fails
    }
  }

  // enhanceResourceWithFilters DELETED 2026-06-13 (resource-boundary-contract
  // Phase 6): zero callers, and it was a second enumeration of the resource
  // dispatch whose default branch performed an unguarded no-context self-call
  // — a drift vector invisible to the authz coverage gate.

  /**
   * Get available filters for resource type
   */
  private getAvailableFilters(resourceType: string): any {
    const commonFilters = {
      limit: { type: 'number', min: 1, max: 100, default: 20 },
      sortBy: { type: 'string', options: ['created', 'modified', 'name'] },
      sortOrder: { type: 'string', options: ['asc', 'desc'], default: 'desc' }
    };

    const specificFilters = {
      'pov': {
        ...commonFilters,
        status: { type: 'string', options: ['ACTIVE', 'COMPLETED', 'PAUSED', 'CANCELLED'] },
        priority: { type: 'string', options: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
        team: { type: 'string', description: 'Filter by team assignment' },
        sortBy: { type: 'string', options: ['created', 'modified', 'lastModified', 'priority', 'status'] }
      },
      'task': {
        ...commonFilters,
        status: { type: 'string', options: ['TODO', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'CANCELLED'] },
        priority: { type: 'string', options: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
        assignee: { type: 'string', description: 'Filter by assigned user' },
        povId: { type: 'string', description: 'Filter by POV ID' },
        dueDate: { type: 'string', format: 'date', description: 'Filter by due date' },
        sortBy: { type: 'string', options: ['created', 'modified', 'dueDate', 'priority', 'status'] }
      },
      'agent-template': {
        ...commonFilters,
        category: { type: 'string', options: ['ANALYSIS', 'AUTOMATION', 'COMMUNICATION', 'RESEARCH'] },
        status: { type: 'string', options: ['ACTIVE', 'DEPRECATED', 'DRAFT'] },
        sortBy: { type: 'string', options: ['created', 'modified', 'performance', 'usage', 'rating'] }
      }
    };

    return specificFilters[resourceType as keyof typeof specificFilters] || commonFilters;
  }

  // Resource content methods

  private async getPOVDatabaseContent(filters?: any, userContext?: { userId: string; role: string }): Promise<any> {
    // Boundary guard BEFORE the try — the catch below converts throws into a
    // benign empty payload, which must never swallow an authz violation.
    assertResourceAuthz('pov-database', userContext);
    try {
      // Direct Prisma query — replaces broken apiClient call (was hitting /api/povs but route is /api/pov)
      const sortByMap: Record<string, string> = {
        created: 'createdAt',
        modified: 'updatedAt',
        lastModified: 'updatedAt',
        priority: 'priority',
        status: 'status',
      };
      const orderField = sortByMap[filters?.sortBy] || 'updatedAt';
      const orderDir = filters?.sortOrder === 'asc' ? 'asc' as const : 'desc' as const;

      // Build access control WHERE clause (mirrors /api/pov route.ts logic)
      const accessWhere = this.buildPOVAccessFilter(userContext);

      this.logger.debug('Fetching POV data with direct Prisma query', { filters, hasUserContext: !!userContext });
      const povs = await prisma.pOV.findMany({
        where: {
          ...accessWhere,
          ...(filters?.status && { status: filters.status }),
          ...(filters?.priority && { priority: filters.priority }),
        },
        include: {
          phases: { select: { id: true, name: true, type: true } },
          owner: { select: { id: true, name: true, email: true } },
          team: { include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } } },
          region: true,
          country: true,
        },
        orderBy: { [orderField]: orderDir },
        take: filters?.limit || 20,
      });

      // Enhance data with execution context and real-time metrics
      const enhancedData = await this.enhanceResourceWithExecutionContext(
        povs,
        'pov'
      );

      return {
        type: 'enhanced_database_result',
        data: enhancedData,
        metadata: {
          source: 'pov_database',
          queryTime: new Date().toISOString(),
          recordCount: enhancedData.length,
          filters: filters || {},
          enhancement: {
            executionContext: true,
            realTimeMetrics: true,
            teamInsights: true
          },
          capabilities: {
            filtering: true,
            sorting: true,
            searchable: true,
            exportable: true
          }
        },
        resourceFeatures: {
          advancedFiltering: this.getAvailableFilters('pov'),
          realTimeUpdates: true,
          executionIntegration: true,
          contextAwareness: true
        }
      };
    } catch (error) {
      this.logger.error('Failed to get enhanced POV database content:', error);
      return {
        type: 'enhanced_database_result',
        data: [],
        error: 'Failed to access POV database',
        metadata: { 
          source: 'pov_database', 
          queryTime: new Date().toISOString(),
          enhancement: { failed: true, reason: error instanceof Error ? error.message : String(error) }
        }
      };
    }
  }

  private async getTaskDatabaseContent(filters?: any, userContext?: { userId: string; role: string }): Promise<any> {
    assertResourceAuthz('task-database', userContext);
    try {
      // Direct Prisma query — replaces apiClient GET to /api/tasks
      // Uses taskFullSelect + mapTaskFromPrisma for shape-compatible output
      const { taskFullSelect } = await import('@/lib/tasks/prisma/select');
      const { mapTaskFromPrisma } = await import('@/lib/tasks/prisma/mappers');

      const sortByMap: Record<string, string> = {
        created: 'createdAt',
        modified: 'updatedAt',
        dueDate: 'dueDate',
        priority: 'priority',
        status: 'status',
      };
      const orderField = sortByMap[filters?.sortBy] || 'priority';
      const orderDir = filters?.sortOrder === 'asc' ? 'asc' as const : 'desc' as const;

      // Build access control filter — tasks are scoped through their POV
      const accessWhere = this.buildTaskAccessFilter(userContext);

      this.logger.debug('Fetching task data with direct Prisma query', { filters, hasUserContext: !!userContext });
      const tasks = await prisma.task.findMany({
        where: {
          ...accessWhere,
          ...(filters?.status && { status: filters.status }),
          ...(filters?.priority && { priority: filters.priority }),
          ...(filters?.assignee && { assigneeId: filters.assignee }),
          ...(filters?.povId && { povId: filters.povId }),
        },
        select: taskFullSelect,
        orderBy: { [orderField]: orderDir },
        take: filters?.limit || 50,
      });

      // Map through the same mapper the API route uses
      const mappedTasks = tasks.map(mapTaskFromPrisma);

      // Enhance with execution context and real-time status
      const enhancedData = await this.enhanceResourceWithExecutionContext(
        mappedTasks,
        'task'
      );

      // Add task-specific enhancements
      const taskSpecificData = await this.addTaskSpecificEnhancements(enhancedData);

      return {
        type: 'enhanced_database_result',
        data: taskSpecificData,
        metadata: {
          source: 'task_database',
          queryTime: new Date().toISOString(),
          recordCount: taskSpecificData.length,
          filters: filters || {},
          enhancement: {
            executionContext: true,
            realTimeStatus: true,
            progressTracking: true,
            assigneeInsights: true
          },
          capabilities: {
            filtering: true,
            sorting: true,
            searchable: true,
            exportable: true,
            executionTracking: true
          }
        },
        resourceFeatures: {
          advancedFiltering: this.getAvailableFilters('task'),
          realTimeUpdates: true,
          executionIntegration: true,
          progressMonitoring: true,
          contextAwareness: true
        }
      };
    } catch (error) {
      this.logger.error('Failed to get enhanced task database content:', error);
      return {
        type: 'enhanced_database_result',
        data: [],
        error: 'Failed to access task database',
        metadata: { 
          source: 'task_database', 
          queryTime: new Date().toISOString(),
          enhancement: { failed: true, reason: error instanceof Error ? error.message : String(error) }
        }
      };
    }
  }

  private async getAgentTemplatesContent(filters?: any, userContext?: { userId: string; role: string }): Promise<any> {
    // PUBLIC_CATALOG — a stated decision, not an accident: AgentTemplate is a
    // global catalog (only nullable createdBy, no owner/tenant).
    assertResourceAuthz('agent-templates', userContext);
    try {
      // Direct Prisma query — replaces broken apiClient call (no route at /api/agents/templates)
      const sortByMap: Record<string, string> = {
        created: 'createdAt',
        modified: 'updatedAt',
        performance: 'successRate',
        usage: 'usageCount',
        rating: 'successRate',
      };
      const orderField = sortByMap[filters?.sortBy] || 'createdAt';
      const orderDir = filters?.sortOrder === 'asc' ? 'asc' as const : 'desc' as const;

      this.logger.debug('Fetching agent template data with direct Prisma query', { filters });
      const templates = await prisma.agentTemplate.findMany({
        where: {
          status: (filters?.status as AgentTemplateStatus) || AgentTemplateStatus.ACTIVE,
          ...(filters?.category && { category: filters.category as AgentCategory }),
        },
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          defaultRole: true,
          capabilities: true,
          constraints: true,
          maxRetries: true,
          timeout: true,
          priority: true,
          inputSchema: true,
          outputSchema: true,
          metadata: true,
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
          // Excluded: promptTemplate (up to 50KB), contextTemplate — not needed for listing
        },
        orderBy: { [orderField]: orderDir },
        take: filters?.limit || 30,
      });

      // Enhance with execution analytics and performance metrics
      const enhancedData = await this.enhanceResourceWithExecutionContext(
        templates,
        'agent-template'
      );

      // Add template-specific performance insights
      const templateAnalytics = await this.addTemplatePerformanceAnalytics(enhancedData);

      return {
        type: 'enhanced_configuration_data',
        data: templateAnalytics,
        metadata: {
          source: 'agent_templates',
          queryTime: new Date().toISOString(),
          templateCount: templateAnalytics.length,
          filters: filters || {},
          enhancement: {
            performanceAnalytics: true,
            usageStatistics: true,
            executionHistory: true,
            successRateTracking: true
          },
          capabilities: {
            filtering: true,
            sorting: true,
            searchable: true,
            exportable: true,
            performanceMonitoring: true,
            trendAnalysis: true
          }
        },
        resourceFeatures: {
          advancedFiltering: this.getAvailableFilters('agent-template'),
          realTimeUpdates: true,
          performanceTracking: true,
          executionIntegration: true,
          contextAwareness: true,
          recommendationEngine: true
        }
      };
    } catch (error) {
      this.logger.error('Failed to get enhanced agent templates content:', error);
      return {
        type: 'enhanced_configuration_data',
        data: [],
        error: 'Failed to access agent templates',
        metadata: { 
          source: 'agent_templates', 
          queryTime: new Date().toISOString(),
          enhancement: { failed: true, reason: error instanceof Error ? error.message : String(error) }
        }
      };
    }
  }

  private async getTeamPerformanceContent(userContext?: { userId: string; role: string }): Promise<any> {
    // TENANT_SCOPED (Finding 2 fix, option (a) per Steve 2026-06-13): the
    // metric is scoped to the caller's accessible POVs via the same
    // chokepoint the other tenant methods use. buildTaskAccessFilter (not a
    // bare pov-relation filter) so ADMIN's empty-case {} keeps povless
    // tasks/executions in the platform-wide admin view (arch F4).
    assertResourceAuthz('team-performance', userContext);
    try {
      // Direct Prisma query — replaces broken apiClient call (no route at /api/analytics/team-performance)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const taskAccessWhere = this.buildTaskAccessFilter(userContext);

      const [taskStats, executionStats, recentExecutions] = await Promise.all([
        prisma.task.groupBy({
          by: ['status'],
          where: { updatedAt: { gte: thirtyDaysAgo }, ...taskAccessWhere },
          _count: true,
        }),
        prisma.agentExecution.aggregate({
          where: { startTime: { gte: thirtyDaysAgo }, task: taskAccessWhere },
          _count: true,
        }),
        prisma.agentExecution.findMany({
          where: { startTime: { gte: thirtyDaysAgo }, task: taskAccessWhere },
          select: { status: true, startTime: true, endTime: true },
          orderBy: { startTime: 'desc' },
          take: 100,
        }),
      ]);

      // Compute average execution time from startTime/endTime
      const completedExecutions = recentExecutions.filter(e => e.startTime && e.endTime);
      const avgExecutionTimeMs = completedExecutions.length > 0
        ? completedExecutions.reduce((sum, e) => sum + (e.endTime!.getTime() - e.startTime!.getTime()), 0) / completedExecutions.length
        : 0;

      const successfulExecutions = recentExecutions.filter(e => ['COMPLETED', 'SUCCESS'].includes(e.status));
      const successRate = recentExecutions.length > 0
        ? (successfulExecutions.length / recentExecutions.length) * 100
        : 0;

      return {
        type: 'analytics_data',
        data: {
          tasksByStatus: Object.fromEntries(taskStats.map(s => [s.status, s._count])),
          totalTasksUpdated: taskStats.reduce((sum, s) => sum + s._count, 0),
          totalExecutions: executionStats._count,
          avgExecutionTimeMs: Math.round(avgExecutionTimeMs),
          successRate: Math.round(successRate * 10) / 10,
        },
        metadata: {
          source: 'team_performance',
          queryTime: new Date().toISOString(),
          timeframe: '30d'
        }
      };
    } catch (error) {
      this.logger.error('Failed to get team performance content:', error);
      return {
        type: 'analytics_data',
        data: {},
        error: 'Failed to access team performance data',
        metadata: { source: 'team_performance', queryTime: new Date().toISOString() }
      };
    }
  }

  private async getSystemLogsContent(userContext?: { userId: string; role: string }): Promise<any> {
    // PUBLIC_CATALOG — mock/static data, no tenant content.
    assertResourceAuthz('system-logs', userContext);
    // PLACEHOLDER — this resource has never been wired to real logs. The
    // payload must SAY so (Protocol 10): the previous hardcoded entries
    // carried freshly-computed timestamps and no mock indicator, so an AI
    // client reading them would reason from invented system state as real.
    return {
      type: 'log_entries',
      data: [],
      metadata: {
        source: 'system_logs',
        queryTime: new Date().toISOString(),
        mock: true,
        note: 'system-logs is a placeholder resource — real log entries are not exposed here. Use the analytics tools for operational telemetry.',
        entryCount: 0
      }
    };
  }

  private async getAIRecommendationsContent(userContext?: { userId: string; role: string }): Promise<any> {
    // TENANT_SCOPED — the old `?? 'system'` fabricated an identity the caller
    // never presented; the guard guarantees a real userContext instead.
    assertResourceAuthz('ai-recommendations', userContext);
    try {
      // Direct call to generateIntelligentRecommendations — replaces apiClient GET to /api/mcp/recommendations
      // This generates dynamic recommendations from user activity, NOT from MCPRecommendation table
      const { generateIntelligentRecommendations } = await import('@/app/api/mcp/recommendations/route');

      const { recommendations } = await generateIntelligentRecommendations(userContext!.userId);

      return {
        type: 'recommendation_data',
        data: recommendations,
        metadata: {
          source: 'ai_recommendations',
          queryTime: new Date().toISOString(),
          recommendationCount: recommendations.length,
          userScoped: !!userContext,
        }
      };
    } catch (error) {
      this.logger.error('Failed to get AI recommendations content:', error);
      return {
        type: 'recommendation_data',
        data: [],
        error: 'Failed to access AI recommendations',
        metadata: { source: 'ai_recommendations', queryTime: new Date().toISOString() }
      };
    }
  }

  /**
   * Get agent execution content with artifacts
   */
  private async getAgentExecutionContent(executionId: string, filters?: any, userContext?: { userId: string; role: string }): Promise<any> {
    // TENANT_SCOPED — the old absent-context fallback fabricated
    // {userId:'system', role:'ADMIN'}, defeating handleAgentResults'
    // validatePOVAccess ownership check. The "internal mid-run caller" it
    // supposedly served had zero callers (sec-ops/arch 2026-06-13); every
    // live caller threads a real identity, which the guard now requires.
    // A future internal caller needs a named allowance signed off by sec-ops.
    assertResourceAuthz('agent-execution', userContext);
    try {
      this.logger.debug(`Fetching agent execution content for: ${executionId}`);

      // Direct call to handleAgentResults — replaces apiClient POST to /api/mcp/tasks/action
      // This preserves all formatting (resourceUri, viewerHint, elicitation prompts, etc.)
      // Its internal validatePOVAccess, running with the REAL identity below,
      // is this method's layer-2 row scoping.
      const { handleAgentResults } = await import('./tasks/action/handlers/agent/agent-results-handler');

      const tokenPayload = { userId: userContext!.userId, role: userContext!.role, email: '' };

      const result = await handleAgentResults(
        {
          executionId,
          includeOutput: filters?.includeOutput ?? true,
          limit: 1
        },
        tokenPayload as any,
        `embedded-${executionId}`
      );

      const execution = result?.result?.executions?.[0];

      return {
        type: 'agent_execution',
        data: execution || null,
        metadata: {
          source: 'agent_execution',
          executionId,
          queryTime: new Date().toISOString(),
          artifactCount: execution?.artifacts?.length || 0,
          status: execution?.status || 'unknown',
          hasElicitationPrompts: (result?.result?.elicitationPrompts?.length || 0) > 0,
        },
        // Include the full handler result for clients that want summary/prompts/links
        summary: result?.result?.summary,
        elicitationPrompts: result?.result?.elicitationPrompts,
        resourceLinks: result?.result?.resourceLinks,
      };
    } catch (error) {
      this.logger.error(`Failed to get agent execution content for ${executionId}:`, error);
      return {
        type: 'agent_execution',
        data: null,
        error: error instanceof Error ? error.message : 'Failed to access agent execution',
        metadata: {
          source: 'agent_execution',
          executionId,
          queryTime: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Get agent artifact content with format options
   */
  private async getAgentArtifactContent(artifactId: string, filters?: any, userContext?: { userId: string; role: string }): Promise<any> {
    // INTERNAL_READ_ALLOWED — the documented mid-run internal read (agent
    // reading its own outputs) keeps the explicit if(userContext) Pattern-B
    // guard below; the assertion shape-validates any context that IS present.
    assertResourceAuthz('agent-artifact', userContext);
    try {
      this.logger.debug(`Fetching agent artifact content for: ${artifactId}`, { filters });
      
      // Determine format (default to full content)
      const format = filters?.format || 'full'; // 'preview', 'full', 'download', 'metadata'
      
      // Get artifact from database
      const artifact = await prisma.agentArtifact.findUnique({
        where: { id: artifactId },
        include: {
          execution: {
            include: {
              task: {
                select: {
                  id: true,
                  title: true,
                  type: true,
                  pov: {
                    select: {
                      id: true,
                      title: true,
                      customerName: true
                    }
                  }
                }
              },
              agentTemplate: {
                select: {
                  id: true,
                  name: true,
                  category: true
                }
              }
            }
          }
        }
      });

      if (!artifact) {
        throw new Error(`Agent artifact ${artifactId} not found`);
      }

      // 2026-05-27 (embedded-server authz audit): artifacts are POV-scoped (content +
      // customerName). Self-scope to the caller so this read is safe on EVERY path (REST,
      // MCP resources/read, GUI) — not reliant on per-caller gates or povContext metadata
      // (the MCP resources/read gate is skipped when povContext is absent). External reads
      // always thread userContext; internal/system reads (an agent reading its own outputs
      // mid-run) omit it and are allowed. Fail-closed for external callers.
      if (userContext) {
        const artifactPovId = artifact.execution?.task?.pov?.id;
        const allowed = artifactPovId
          ? await validateMCPPOVAccess(userContext.userId, artifactPovId, {
              logContext: 'embedded.getAgentArtifactContent',
              requireWrite: false, // read — isDemo may read demo artifacts
            })
          : false;
        if (!allowed) {
          // Don't leak existence — mirror the not-found path above.
          throw new Error(`Agent artifact ${artifactId} not found`);
        }
      }

      // Handle different formats
      switch (format) {
        case 'preview':
          // Return first 500 characters (more than the 200 in metadata)
          return {
            type: 'agent_artifact_preview',
            data: {
              id: artifact.id,
              name: artifact.name,
              type: artifact.type,
              size: artifact.content.length,
              preview: artifact.content.substring(0, 500) + (artifact.content.length > 500 ? '...' : ''),
              createdAt: artifact.createdAt
            },
            metadata: {
              source: 'agent_artifact',
              artifactId,
              format: 'preview',
              queryTime: new Date().toISOString(),
              task: artifact.execution.task?.title,
              pov: artifact.execution.task?.pov?.title
            }
          };

        case 'metadata':
          // Return only metadata without content
          return {
            type: 'agent_artifact_metadata',
            data: {
              id: artifact.id,
              name: artifact.name,
              type: artifact.type,
              size: artifact.content.length,
              createdAt: artifact.createdAt,
              executionId: artifact.executionId,
              execution: {
                status: artifact.execution.status,
                startTime: artifact.execution.startTime,
                endTime: artifact.execution.endTime,
                template: artifact.execution.agentTemplate?.name
              },
              task: artifact.execution.task
            },
            metadata: {
              source: 'agent_artifact',
              artifactId,
              format: 'metadata',
              queryTime: new Date().toISOString()
            }
          };

        case 'download':
          // Return signed download URL and metadata for client-side download
          const signedUrl = generateDownloadUrl(artifactId);
          return {
            type: 'agent_artifact_download',
            data: {
              id: artifact.id,
              name: artifact.name,
              type: artifact.type,
              size: artifact.content.length,
              downloadUrl: signedUrl,
              expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour expiry
              contentType: this.getContentTypeFromArtifactType(artifact.type)
            },
            metadata: {
              source: 'agent_artifact',
              artifactId,
              format: 'download',
              queryTime: new Date().toISOString()
            }
          };

        case 'full':
        default:
          // Return full content (default behavior)
          return {
            type: 'agent_artifact',
            data: {
              id: artifact.id,
              name: artifact.name,
              type: artifact.type,
              content: artifact.content, // Full content
              size: artifact.content.length,
              createdAt: artifact.createdAt,
              executionId: artifact.executionId,
              task: artifact.execution.task
            },
            metadata: {
              source: 'agent_artifact',
              artifactId,
              format: 'full',
              queryTime: new Date().toISOString(),
              contentType: this.getContentTypeFromArtifactType(artifact.type)
            }
          };
      }
    } catch (error) {
      this.logger.error(`Failed to get agent artifact content for ${artifactId}:`, error);
      return {
        type: 'agent_artifact',
        data: null,
        error: error instanceof Error ? error.message : 'Failed to access agent artifact',
        metadata: { 
          source: 'agent_artifact', 
          artifactId,
          queryTime: new Date().toISOString() 
        }
      };
    }
  }

  /**
   * Get content type from artifact type
   */
  private getContentTypeFromArtifactType(artifactType: string): string {
    const typeMap: Record<string, string> = {
      'json': 'application/json',
      'text': 'text/plain',
      'markdown': 'text/markdown',
      'html': 'text/html',
      'xml': 'text/xml',
      'csv': 'text/csv',
      'code': 'text/plain',
      'log': 'text/plain',
      'yaml': 'text/yaml',
      'sql': 'text/plain'
    };
    
    return typeMap[artifactType.toLowerCase()] || 'application/octet-stream';
  }

  // ===== RESOURCE ENHANCEMENT HELPER METHODS =====

  /**
   * Get POV execution context
   */
  private async getPOVExecutionContext(povId: string): Promise<any> {
    try {
      // Direct Prisma query — replaces broken apiClient call to non-existent /api/povs/:id/executions
      const executions = await prisma.agentExecution.findMany({
        where: { task: { povId } },
        orderBy: { startTime: 'desc' },
        take: 5,
        select: {
          id: true,
          status: true,
          startTime: true,
          endTime: true,
        },
      });
      return {
        recentExecutions: executions.length,
        lastExecution: executions[0]?.startTime || null,
        averageExecutionTime: this.calculateAverageExecutionTime(executions),
        successRate: this.calculateSuccessRate(executions)
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Failed to get POV execution context for ${povId}:`, errorMessage);
      return { available: false, reason: 'execution_data_unavailable' };
    }
  }

  /**
   * Get Task execution context
   */
  private async getTaskExecutionContext(taskId: string): Promise<any> {
    try {
      // Direct Prisma query — replaces broken apiClient call to non-existent /api/tasks/:id/executions
      const executions = await prisma.agentExecution.findMany({
        where: { taskId },
        orderBy: { startTime: 'desc' },
        take: 10,
        select: {
          id: true,
          status: true,
          startTime: true,
          endTime: true,
        },
      });
      return {
        totalExecutions: executions.length,
        lastExecution: executions[0]?.startTime || null,
        averageExecutionTime: this.calculateAverageExecutionTime(executions),
        successRate: this.calculateSuccessRate(executions),
        currentStatus: executions[0]?.status || 'unknown'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Failed to get task execution context for ${taskId}:`, errorMessage);
      return { available: false, reason: 'execution_data_unavailable' };
    }
  }

  /**
   * Get Template execution context
   */
  private async getTemplateExecutionContext(templateId: string): Promise<any> {
    try {
      // Direct Prisma query — replaces broken apiClient call to non-existent /api/agents/templates/:id/executions
      const executions = await prisma.agentExecution.findMany({
        where: { agentTemplateId: templateId },
        orderBy: { startTime: 'desc' },
        take: 20,
        select: {
          id: true,
          status: true,
          startTime: true,
          endTime: true,
        },
      });
      return {
        totalExecutions: executions.length,
        lastUsed: executions[0]?.startTime || null,
        averageExecutionTime: this.calculateAverageExecutionTime(executions),
        successRate: this.calculateSuccessRate(executions),
        popularityScore: this.calculatePopularityScore(executions)
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Failed to get template execution context for ${templateId}:`, errorMessage);
      return { available: false, reason: 'execution_data_unavailable' };
    }
  }

  /**
   * Get real-time metrics for resource
   */
  private async getRealTimeMetrics(itemId: string, resourceType: string): Promise<any> {
    try {
      // Different metrics based on resource type
      switch (resourceType) {
        case 'pov':
          return {
            activeTasks: await this.countActiveTasks(itemId),
            completionRate: await this.getCompletionRate(itemId, 'pov'),
            lastActivity: await this.getLastActivity(itemId, 'pov')
          };
        case 'task':
          return {
            executionStatus: await this.getExecutionStatus(itemId),
            progressPercentage: await this.getProgressPercentage(itemId),
            lastActivity: await this.getLastActivity(itemId, 'task')
          };
        case 'agent-template':
          return {
            currentUsage: await this.getCurrentUsage(itemId),
            performanceRating: await this.getPerformanceRating(itemId),
            lastUsed: await this.getLastActivity(itemId, 'template')
          };
        default:
          return { available: false };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Failed to get real-time metrics for ${resourceType} ${itemId}:`, errorMessage);
      return { available: false, reason: 'metrics_unavailable' };
    }
  }

  /**
   * Add task-specific enhancements
   */
  private async addTaskSpecificEnhancements(tasks: any[]): Promise<any[]> {
    return tasks.map(task => ({
      ...task,
      enhancedFeatures: {
        executionTracking: true,
        progressMonitoring: true,
        realTimeStatus: true
      },
      quickActions: [
        { action: 'execute', available: task.status === 'TODO' },
        { action: 'pause', available: task.status === 'IN_PROGRESS' },
        { action: 'complete', available: task.status === 'REVIEW' }
      ]
    }));
  }

  /**
   * Add template performance analytics
   */
  private async addTemplatePerformanceAnalytics(templates: any[]): Promise<any[]> {
    return templates.map(template => ({
      ...template,
      performanceAnalytics: {
        successRate: template.executionContext?.successRate || 0,
        averageTime: template.executionContext?.averageExecutionTime || 0,
        popularityScore: template.executionContext?.popularityScore || 0,
        recommendation: this.getTemplateRecommendation(template)
      },
      enhancedFeatures: {
        performanceTracking: true,
        usageAnalytics: true,
        recommendationEngine: true
      }
    }));
  }

  // ===== ACCESS CONTROL HELPERS =====

  /**
   * Build POV access filter matching /api/pov route.ts role-based logic.
   * - ADMIN/SUPER_ADMIN: no filter (see all)
   * - DEMO_USER: owned + team + demo POVs
   * - All others: owned + team POVs
   * - No userContext: throws (fail-CLOSED — P1.5 audit U3 fix 2026-05-24)
   */
  private buildPOVAccessFilter(userContext?: { userId: string; role: string }): any {
    // P1.5 (2026-05-24): fail-CLOSED on missing userContext. Previous behavior
    // returned {} (= no Prisma filter = all POVs leaked to anonymous callers).
    // Resource-manager-specialist verified throw matches canonical pattern in
    // lib/pov/auth/pov-access-filter.ts:47 (required user). Audit:
    // cline_docs/reviews/saas-readiness-auth-2026-05-19/multi-tenancy-review.md N1.
    if (!userContext) {
      throw new Error('userContext required for resource access');
    }

    if (userContext.role === 'ADMIN' || userContext.role === 'SUPER_ADMIN') {
      return {};
    }

    const userFilter: any[] = [
      { ownerId: userContext.userId },
      { team: { members: { some: { userId: userContext.userId } } } },
    ];

    if (userContext.role === 'DEMO_USER') {
      userFilter.push({ metadata: { path: ['isDemo'], equals: true } });
    }

    return { OR: userFilter };
  }

  private buildTaskAccessFilter(userContext?: { userId: string; role: string }): any {
    // Tasks are scoped through their POV — reuse the same access logic.
    // buildPOVAccessFilter throws on missing userContext (P1.5), so the
    // "no userContext" branch here is now unreachable; empty filter means admin.
    const povFilter = this.buildPOVAccessFilter(userContext);
    if (Object.keys(povFilter).length === 0) {
      return {}; // Admin/SUPER_ADMIN — no filter needed
    }
    return { pov: povFilter };
  }

  // ===== UTILITY CALCULATION METHODS =====

  private calculateAverageExecutionTime(executions: any[]): number {
    if (executions.length === 0) return 0;
    const times = executions
      .filter(e => e.startTime && e.endTime)
      .map(e => new Date(e.endTime).getTime() - new Date(e.startTime).getTime());
    return times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  }

  private calculateSuccessRate(executions: any[]): number {
    if (executions.length === 0) return 0;
    const successful = executions.filter(e => ['COMPLETED', 'SUCCESS'].includes(e.status)).length;
    return (successful / executions.length) * 100;
  }

  private calculatePopularityScore(executions: any[]): number {
    // Calculate based on recent usage frequency
    const recent = executions.filter(e => {
      const executionDate = new Date(e.startTime);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return executionDate > weekAgo;
    });
    return Math.min(100, recent.length * 10); // Max score of 100
  }

  private getTemplateRecommendation(template: any): string {
    const successRate = template.executionContext?.successRate || 0;
    const usageCount = template.executionContext?.totalExecutions || 0;
    
    if (successRate > 90 && usageCount > 10) return 'highly_recommended';
    if (successRate > 75 && usageCount > 5) return 'recommended';
    if (successRate < 50) return 'needs_review';
    return 'standard';
  }

  // Placeholder methods for metrics that would integrate with monitoring systems
  private async countActiveTasks(povId: string): Promise<number> { return 0; }
  private async getCompletionRate(itemId: string, type: string): Promise<number> { return 0; }
  private async getLastActivity(itemId: string, type: string): Promise<string | null> { return null; }
  private async getExecutionStatus(taskId: string): Promise<string> { return 'unknown'; }
  private async getProgressPercentage(taskId: string): Promise<number> { return 0; }
  private async getCurrentUsage(templateId: string): Promise<number> { return 0; }
  private async getPerformanceRating(templateId: string): Promise<number> { return 0; }
}

// Create singleton instance with global storage to ensure single instance
declare global {
  var __embeddedMCPServer: EmbeddedMCPServer | undefined;
}

export const embeddedMCPServer = globalThis.__embeddedMCPServer ?? new EmbeddedMCPServer({
  enableFallback: true,
  logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  apiTimeout: 30000
});

if (!globalThis.__embeddedMCPServer) {
  globalThis.__embeddedMCPServer = embeddedMCPServer;
}
