import { MCPServerConfig, MCPTool, MCPResource, MCPToolResult } from '../llm/mcp-integration';
import { tokenManager } from '../llm/tokenManager';
import { MCPTokenDefaults } from '../llm/types';
import { UserRole } from '@/lib/types/auth';
import { mcpContextManager } from './contextManager';
import { mcpToolRegistry } from './toolRegistry';
import { ensureObject } from '@/lib/utils/ensure-object';
import { mcpLogger } from '@/lib/logger';

// Dynamic imports for server-side only
let Client: any = null;
let StdioClientTransport: any = null;
let StreamableHTTPServerTransport: any = null;
// Note: WebSocket transport was removed in January 2026

// Initialize SDK imports only on server side
async function initializeSDKImports() {
  if (typeof process !== 'undefined' && process.versions?.node && !Client) {
    try {
      mcpLogger.debug({}, 'Attempting to import MCP SDK');

      // Import only the essential components - avoid schema imports that cause parse errors
      const clientModule = await import('@modelcontextprotocol/sdk/client/index.js');
      const stdioModule = await import('@modelcontextprotocol/sdk/client/stdio.js');
      const streamableHttpModule = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');

      // Extract only the exports we actually need
      Client = clientModule.Client;
      StdioClientTransport = stdioModule.StdioClientTransport;
      StreamableHTTPServerTransport = streamableHttpModule.StreamableHTTPServerTransport;

      mcpLogger.debug({ hasClient: !!Client, hasStdio: !!StdioClientTransport, hasStreamableHttp: !!StreamableHTTPServerTransport }, 'SDK imports loaded');

      if (!Client || !StdioClientTransport || !StreamableHTTPServerTransport) {
        throw new Error('Failed to import required MCP SDK components');
      }

    } catch (error) {
      mcpLogger.error({ err: error }, 'Failed to initialize SDK imports — MCP SDK may not be installed or is incompatible');
      throw error;
    }
  }
}

/**
 * MCP Service using Official TypeScript SDK
 * Integrates the official MCP SDK with our existing infrastructure
 */
export class MCPService {
  private clients: Map<string, any> = new Map();
  private serverConfigs: Map<string, MCPServerConfig> = new Map();
  private availableTools: Map<string, MCPTool[]> = new Map();
  private availableResources: Map<string, MCPResource[]> = new Map();
  private isInitialized: boolean = false;

  /**
   * Initialize MCP SDK integration
   */
  async initializeSDK(): Promise<void> {
    mcpLogger.info({}, 'Initializing MCP SDK integration');

    try {
      // Initialize SDK imports first
      await initializeSDKImports();

      // Load server configurations
      await this.loadServerConfigurations();

      // Create client instances for each server
      await this.createClients();

      // Discover capabilities
      await this.discoverCapabilities();

      this.isInitialized = true;
      mcpLogger.info({ serverCount: this.clients.size }, 'MCP SDK initialized successfully');
    } catch (error) {
      mcpLogger.error({ err: error }, 'Failed to initialize MCP SDK');
      throw error;
    }
  }

  /**
   * Register a client with the service
   */
  async registerClient(serverName: string, client: any, serverConfig: MCPServerConfig): Promise<void> {
    mcpLogger.info({ serverName, existingClients: this.clients.size }, 'Registering MCP client');

    this.clients.set(serverName, client);
    this.serverConfigs.set(serverName, serverConfig);

    mcpLogger.debug({ serverName, totalClients: this.clients.size }, 'Client registration complete');

    // Discover tools immediately after registration
    await this.discoverCapabilities();
  }

  /**
   * Create MCP client instance for a server
   */
  async createClient(config: MCPServerConfig): Promise<any> {
    mcpLogger.info({ serverName: config.name, transport: config.transport.type }, 'Creating MCP client');
    
    try {
      let transport;
      
      // Create transport based on configuration
      switch (config.transport.type) {
        case 'stdio':
          if (!config.transport.command) {
            throw new Error(`stdio transport requires command for server ${config.name}`);
          }
          
          transport = new StdioClientTransport({
            command: config.transport.command,
            args: config.transport.args || [],
            env: config.transport.env
          });
          break;
          
        case 'websocket':
          // WebSocket transport was removed in January 2026
          throw new Error(`WebSocket transport is no longer supported for server ${config.name}. Use SSE or Streamable HTTP instead.`);
        
        case 'streamable-http':
          if (!config.transport.url) {
            throw new Error(`streamable-http transport requires url for server ${config.name}`);
          }
          // Use enhanced streamable HTTP client
          transport = null; // We'll handle this differently
          break;
          
        default:
          throw new Error(`Unsupported transport type: ${config.transport.type}`);
      }
      
      // Create client
      const client = new Client(
        {
          name: 'copov15-mcp-client',
          version: '1.0.0'
        },
        {
          capabilities: {
            roots: {
              listChanged: true
            },
            sampling: {}
          }
        }
      );
      
      // For streamable-http, use enhanced client
      if (config.transport.type === 'streamable-http') {
        // Use enhanced streamable HTTP client instead of direct handler
        const streamableHttpClient = await this.createEnhancedStreamableHttpClient(config.transport.url!, config);
        mcpLogger.info({ serverName: config.name }, 'Created enhanced streamable-http client');
        return streamableHttpClient;
      } else {
        // Connect to server for other transports
        await client.connect(transport);
        mcpLogger.info({ serverName: config.name }, 'Successfully connected to server');
        return client;
      }
    } catch (error) {
      mcpLogger.error({ err: error, serverName: config.name }, 'Failed to create MCP client');
      throw error;
    }
  }

  /**
   * Manage server connections
   */
  async manageConnections(): Promise<void> {
    mcpLogger.debug({ clientCount: this.clients.size }, 'Managing server connections');

    // Monitor connection health
    for (const [serverName, client] of this.clients) {
      try {
        // Ping server to check health
        await this.pingServer(client);
        mcpLogger.debug({ serverName }, 'Server health check passed');
      } catch (error) {
        mcpLogger.warn({ err: error, serverName }, 'Server health check failed');
        
        // Attempt reconnection
        await this.reconnectServer(serverName);
      }
    }
  }

  /**
   * List tools from a specific server
   */
  async listServerTools(serverName: string): Promise<MCPTool[]> {
    const client = this.clients.get(serverName);
    if (!client) {
      mcpLogger.warn({ serverName, availableClients: Array.from(this.clients.keys()) }, 'No client found for server');
      throw new Error(`Server ${serverName} not connected`);
    }

    try {
      mcpLogger.debug({ serverName }, 'Listing tools from server');

      const allTools: MCPTool[] = [];
      let cursor: string | undefined;
      let pageCount = 0;

      // Handle pagination according to MCP spec
      do {
        pageCount++;
        mcpLogger.debug({ serverName, page: pageCount, hasCursor: !!cursor }, 'Fetching tools page');
        
        const params: any = {};
        if (cursor) {
          params.cursor = cursor;
        }
        
        // 🏆 VICTORY: MCP Protocol Debug Specialist fix - use client.listTools() not client.request()
        // Root cause: client.request() missing resultSchema parameter caused parse errors
        const response = await client.listTools(params);
        
        mcpLogger.debug({ serverName, page: pageCount, toolCount: response.tools?.length || 0, hasMore: !!response.nextCursor }, 'Tools page received');
        
        // Handle the response properly based on ListToolsResultSchema
        // Expected format: { tools: Tool[], nextCursor?: string }
        const tools: MCPTool[] = response.tools?.map((tool: any) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        })) || [];
        
        allTools.push(...tools);
        cursor = response.nextCursor;
        
        // Safety check to prevent infinite loops
        if (pageCount > 100) {
          mcpLogger.warn({ serverName, pageCount }, 'Reached maximum page limit for tool listing');
          break;
        }
      } while (cursor);

      mcpLogger.info({ serverName, toolCount: allTools.length, pages: pageCount }, 'Tool discovery complete');
      return allTools;
    } catch (error) {
      mcpLogger.error({ err: error, serverName }, 'Failed to list tools from server');
      throw error;
    }
  }

  async listServerResources(serverName: string): Promise<MCPResource[]> {
    // Handle embedded server differently
    if (serverName === 'paichart-embedded-mcp') {
      try {
        mcpLogger.debug({ serverName }, 'Listing resources from embedded server');
        const { embeddedMCPServer } = await import('../../mcp/embedded-server');

        const resources = await embeddedMCPServer.getResources();
        const mcpResources: MCPResource[] = resources.map((resource: any) => ({
          name: resource.name,
          description: resource.description,
          uri: resource.uri,
        }));

        mcpLogger.info({ serverName, resourceCount: mcpResources.length }, 'Embedded server resources listed');
        return mcpResources;
      } catch (error) {
        mcpLogger.error({ err: error, serverName }, 'Failed to list resources from embedded server');
        throw error;
      }
    }

    // Handle external servers
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Server ${serverName} not connected`);
    }

    try {
      mcpLogger.debug({ serverName }, 'Listing resources from external server');

      // Check if server supports resources capability
      const serverConfig = this.serverConfigs.get(serverName);
      if (serverConfig && serverConfig.capabilities?.resources === false) {
        mcpLogger.debug({ serverName }, 'Server does not support resources capability');
        return [];
      }
      
      const response = await client.listResources({});
      
      const resources: MCPResource[] = response.resources?.map((resource: any) => ({
        name: resource.name,
        description: resource.description,
        uri: resource.uri,
      })) || [];

      mcpLogger.info({ serverName, resourceCount: resources.length }, 'External server resources listed');
      return resources;
    } catch (error: any) {
      // Handle "Method not found" error gracefully
      if (error.code === -32601) {
        mcpLogger.debug({ serverName }, 'Server does not support resources/list method');
        return [];
      }
      mcpLogger.error({ err: error, serverName }, 'Failed to list resources from external server');
      throw error;
    }
  }

  /**
   * Read resource content from a server
   */
  async readServerResource(serverName: string, uri: string, userContext?: { userId: string; role: string }): Promise<any> {
    // Handle embedded server differently
    if (serverName === 'paichart-embedded-mcp') {
      try {
        mcpLogger.debug({ serverName, uri, hasUserContext: !!userContext }, 'Reading resource from embedded server');
        const { embeddedMCPServer } = await import('../../mcp/embedded-server');

        const content = await embeddedMCPServer.readResource(uri, undefined, userContext);
        mcpLogger.debug({ serverName, uri }, 'Successfully read embedded resource');
        return content;
      } catch (error) {
        mcpLogger.error({ err: error, serverName, uri }, 'Failed to read resource from embedded server');
        throw error;
      }
    }

    // Handle external servers
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Server ${serverName} not connected`);
    }

    try {
      mcpLogger.debug({ serverName, uri }, 'Reading resource from external server');

      const response = await client.readResource({ uri });

      mcpLogger.debug({ serverName, uri }, 'Successfully read external resource');
      return response.contents;
    } catch (error) {
      mcpLogger.error({ err: error, serverName, uri }, 'Failed to read resource from external server');
      throw error;
    }
  }

  /**
   * Call a tool on a specific server
   */
  async callTool(
    serverName: string,
    toolName: string,
    arguments_: Record<string, any>,
    options?: {
      userId?: string;
      timeout?: number;
      /** Calling agent-execution id (the loop passes its executionId as sessionId via
       *  serverManager). Threaded into toolContext.callingExecutionId so agent.execute
       *  can record retry provenance (retry-band keep-best, 2026-07-04).
       *  SCOPE (M3, decided 2026-07-17): EMBEDDED-ONLY by design. callExternalTool
       *  deliberately ignores it — an external SDK call has no toolContext, and a
       *  third-party server has no use for our execution id. Not a BC79 drop. */
      sessionId?: string;
    }
  ): Promise<MCPToolResult> {
    try {
      mcpLogger.info({ toolName, serverName }, 'Calling MCP tool');

      // Check if it's the embedded server
      if (serverName === 'paichart-embedded-mcp') {
        return await this.callEmbeddedTool(toolName, arguments_, options);
      }

      // Otherwise use existing external server logic
      return await this.callExternalTool(serverName, toolName, arguments_, options);
    } catch (error) {
      mcpLogger.error({ err: error, toolName, serverName }, 'Failed to call tool');
      throw error;
    }
  }

  /**
   * Call tool on embedded MCP server
   */
  private async callEmbeddedTool(
    toolName: string,
    arguments_: Record<string, any>,
    options?: {
      userId?: string;
      timeout?: number;
      sessionId?: string;
    }
  ): Promise<MCPToolResult> {
    try {
      mcpLogger.debug({ toolName }, 'Calling embedded tool');

      // Check token budget if user provided
      if (options?.userId) {
        const estimatedTokens = this.estimateToolTokenUsage(toolName, arguments_);
        const budgetCheck = tokenManager.checkBudget(
          estimatedTokens,
          options.userId,
          {
            maxPerRequest: MCPTokenDefaults.MCP_WORKFLOW_MAX_TOKENS,
            maxPerHour: MCPTokenDefaults.BUDGET.MAX_PER_HOUR,
            maxPerDay: MCPTokenDefaults.BUDGET.MAX_PER_DAY
          }
        );

        if (!budgetCheck.allowed) {
          throw new Error(`Token budget exceeded: ${budgetCheck.reason}`);
        }
      }

      // Import and call embedded server
      const { embeddedMCPServer } = await import('../../mcp/embedded-server');

      if (!embeddedMCPServer.isReady()) {
        throw new Error('Embedded MCP server is not running');
      }

      // Build context for tool handlers (ContextEnricher needs user info + token)
      // When called from agent execution engine, userId is available but no JWT token.
      // Mint a short-lived service token so tool API calls authenticate correctly
      // through the Edge middleware (RS256 tokens pass through to route handlers).
      // We ALSO need email + role on the user object itself, because the Tier 1
      // direct path calls buildTokenPayload(enrichedContext) which strictly requires
      // userId + email + role (the broken-bridge era hid this by always going Tier 2
      // HTTP, where the JWT supplied email/role at the middleware layer).
      let serviceToken: string | undefined;
      let userEmail: string | undefined;
      let userRole: UserRole | undefined;
      if (options?.userId && options.userId !== 'system') {
        try {
          const { prisma } = await import('@/lib/prisma');
          const { signAccessToken } = await import('@/lib/auth/token-manager');
          const user = await prisma.user.findUnique({
            where: { id: options.userId },
            select: { email: true, role: true }
          });
          if (user) {
            userEmail = user.email;
            userRole = user.role as UserRole;
            serviceToken = await signAccessToken({
              userId: options.userId,
              email: user.email,
              role: user.role as UserRole
            });
          }
        } catch (err) {
          mcpLogger.warn({ err, userId: options.userId }, 'Failed to mint service token for embedded tool call — tool runs with the degraded context {userId, role:null}, which fail-closes to owned/team scoping (NOT admin; the post-U2 per-call mint has no admin fallback)');
        }
      }

      const toolContext = options?.userId ? {
        user: {
          id: options.userId,
          email: userEmail,
          role: userRole,
          token: serviceToken,
        },
        authenticated: true,
        // retry-band keep-best (2026-07-04): the agent loop passes its executionId as
        // options.sessionId (agentic-tool-loop :418 → serverManager → here). Surfacing it
        // lets agent.execute stamp retry provenance (triggeredBy.parentExecutionId).
        ...(options.sessionId ? { callingExecutionId: options.sessionId } : {}),
      } : undefined;

      const response = await embeddedMCPServer.callTool(toolName, arguments_, toolContext);
      
      // Convert response to MCPToolResult format
      const result: MCPToolResult = {
        content: response.content || [],
        isError: response.isError || false,
        _meta: {
          executionTime: Date.now(),
          serverName: 'paichart-embedded-mcp',
          toolName
        }
      };

      // Record token usage if user provided
      if (options?.userId) {
        const actualTokens = this.calculateActualTokenUsage(result);
        tokenManager.recordUsage({
          inputTokens: Math.floor(actualTokens * 0.7), // Estimate input/output split
          outputTokens: Math.floor(actualTokens * 0.3),
          requestType: 'mcp_workflow'
        }, options.userId);
      }

      mcpLogger.info({ toolName, isError: result.isError }, 'Embedded tool call complete');
      return result;
    } catch (error) {
      mcpLogger.error({ err: error, toolName }, 'Failed to call embedded tool');
      throw error;
    }
  }

  /**
   * Call tool on external MCP server
   */
  private async callExternalTool(
    serverName: string,
    toolName: string,
    arguments_: Record<string, any>,
    // M3 (2026-07-17): `sessionId` is ABSENT from this bag deliberately — it is the
    // embedded path's toolContext plumbing (retry provenance for agent.execute); an
    // external SDK call has no toolContext to thread it into. Callers may pass a wider
    // object (structural typing); the omission here IS the documented scope.
    options?: {
      userId?: string;
      timeout?: number;
    }
  ): Promise<MCPToolResult> {
    // Use standard SDK approach for all servers

    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Server ${serverName} not connected`);
    }

    try {
      mcpLogger.debug({ toolName, serverName }, 'Calling external tool');

      // Check token budget if user provided
      if (options?.userId) {
        const estimatedTokens = this.estimateToolTokenUsage(toolName, arguments_);
        const budgetCheck = tokenManager.checkBudget(
          estimatedTokens,
          options.userId,
          {
            maxPerRequest: MCPTokenDefaults.MCP_WORKFLOW_MAX_TOKENS,
            maxPerHour: MCPTokenDefaults.BUDGET.MAX_PER_HOUR,
            maxPerDay: MCPTokenDefaults.BUDGET.MAX_PER_DAY
          }
        );

        if (!budgetCheck.allowed) {
          throw new Error(`Token budget exceeded: ${budgetCheck.reason}`);
        }
      }

      // Ensure arguments is a plain object (transport boundary guard)
      const callArguments = ensureObject(arguments_, {}, 'MCP Service');

      mcpLogger.debug({ toolName, argKeys: Object.keys(callArguments) }, 'Invoking external tool');

      // Call the tool using proper high-level client method
      // F-NEW-5 (2026-07-17): RequestOptions is the SDK's THIRD arg — callTool(params,
      // resultSchema = CallToolResultSchema, options). Passing options 2nd would be parsed as a
      // resultSchema (a worse bug). `undefined` keeps the schema default.
      //
      // LATENT site: reached only for servers in serverConfigStore (.mcp-servers.json), which agent
      // traffic never uses today (agents -> embedded server; external services -> the `services`
      // gateway, whose own drop at service-call-handler.js:441 caused the live 60,196ms incident).
      // Forwarded conditionally so an absent caller timeout keeps the SDK default rather than
      // inheriting a ceiling nobody asked for.
      const response = await client.callTool({
        name: toolName,
        arguments: callArguments
      }, undefined, options?.timeout ? { timeout: options.timeout } : undefined);

      mcpLogger.debug({ toolName, contentItems: (response as any)?.content?.length ?? 0, isError: (response as any)?.isError }, 'External tool response received');

      // Handle the response properly based on SDK structure
      const responseData = response as any;
      const result: MCPToolResult = {
        content: responseData.content || [],
        isError: responseData.isError || false,
        _meta: {
          executionTime: Date.now(),
          serverName,
          toolName
        }
      };

      // Record token usage if user provided
      if (options?.userId) {
        const actualTokens = this.calculateActualTokenUsage(result);
        tokenManager.recordUsage({
          inputTokens: Math.floor(actualTokens * 0.7), // Estimate input/output split
          outputTokens: Math.floor(actualTokens * 0.3),
          requestType: 'mcp_workflow'
        }, options.userId);
      }

      mcpLogger.info({ toolName, serverName, isError: result.isError }, 'External tool call complete');
      return result;
    } catch (error) {
      mcpLogger.error({ err: error, toolName, serverName, isParseError: error instanceof Error && error.message.includes('parse') }, 'Failed to call external tool');
      throw error;
    }
  }

  /**
   * Get all available tools across all servers
   */
  getAllTools(): Map<string, MCPTool[]> {
    return new Map(this.availableTools);
  }

  /**
   * Get tools for a specific server
   */
  getServerTools(serverName: string): MCPTool[] {
    return this.availableTools.get(serverName) || [];
  }

  /**
   * Get server status
   */
  getServerStatus(): Map<string, { connected: boolean; toolCount: number; lastPing?: Date }> {
    const status = new Map();
    
    for (const [serverName, config] of this.serverConfigs) {
      const connected = this.clients.has(serverName);
      const toolCount = this.availableTools.get(serverName)?.length || 0;
      
      status.set(serverName, {
        connected,
        toolCount,
        lastPing: connected ? new Date() : undefined
      });
    }
    
    return status;
  }

  /**
   * Disconnect from all servers
   */
  async disconnect(): Promise<void> {
    mcpLogger.info({ serverCount: this.clients.size }, 'Disconnecting from all servers');

    for (const [serverName, client] of this.clients) {
      try {
        await client.close();
        mcpLogger.debug({ serverName }, 'Disconnected from server');
      } catch (error) {
        mcpLogger.error({ err: error, serverName }, 'Error disconnecting from server');
      }
    }
    
    this.clients.clear();
    this.availableTools.clear();
    this.availableResources.clear();
    this.isInitialized = false;
  }

  /**
   * Check if service is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  // Private helper methods

  private async loadServerConfigurations(): Promise<void> {
    // Load server configurations from environment or database
    // For now, don't load any default servers to avoid crashes
    
    mcpLogger.debug({}, 'No default server configurations to load');
  }

  private async createClients(): Promise<void> {
    for (const [serverName, config] of this.serverConfigs) {
      try {
        const client = await this.createClient(config);
        this.clients.set(serverName, client);
      } catch (error) {
        mcpLogger.warn({ err: error, serverName }, 'Failed to create client for server');
        // Continue with other servers
      }
    }
  }

  private async discoverCapabilities(): Promise<void> {
    for (const [serverName, client] of this.clients) {
      try {
        // LEGACY: DirectExecutor hybrid approach - OBSOLETE after MCP SDK fix
        // Dynamic discovery now works 100% for all servers - no special cases needed
        // const hybridServers = ['browser-use', 'claude-code']; // REMOVED - no longer needed
        
        // Pure dynamic discovery for all servers - hybrid approach removed 2025-08-08
        {
          // MODERN: Pure dynamic discovery for all servers (post-breakthrough)
          // All servers now use the same reliable discovery method
          const tools = await this.listServerTools(serverName);
          this.availableTools.set(serverName, tools);
        }

        // TODO: Discover resources when SDK supports it
        // const resources = await this.listServerResources(serverName);
        // this.availableResources.set(serverName, resources);
      } catch (error) {
        mcpLogger.error({ err: error, serverName }, 'Failed to discover capabilities for server');
      }
    }
  }

  private async pingServer(client: any): Promise<void> {
    // Simple ping by listing tools using proper client method
    await client.listTools({});
  }

  private async reconnectServer(serverName: string): Promise<void> {
    mcpLogger.info({ serverName }, 'Attempting to reconnect to server');
    
    try {
      // Close existing connection if any
      const existingClient = this.clients.get(serverName);
      if (existingClient) {
        await existingClient.close();
        this.clients.delete(serverName);
      }

      // Create new connection
      const config = this.serverConfigs.get(serverName);
      if (config) {
        const newClient = await this.createClient(config);
        this.clients.set(serverName, newClient);
        
        // Rediscover capabilities
        const tools = await this.listServerTools(serverName);
        this.availableTools.set(serverName, tools);
        
        mcpLogger.info({ serverName }, 'Successfully reconnected to server');
      }
    } catch (error) {
      mcpLogger.error({ err: error, serverName }, 'Failed to reconnect to server');
    }
  }

  private estimateToolTokenUsage(toolName: string, arguments_: Record<string, any>): number {
    // Estimate token usage based on tool name and arguments
    const baseTokens = 100; // Base overhead
    const argumentTokens = JSON.stringify(arguments_).length / 4; // Rough estimate
    const toolComplexity = toolName.length * 2; // Simple complexity estimate
    
    return Math.ceil(baseTokens + argumentTokens + toolComplexity);
  }

  private calculateActualTokenUsage(result: MCPToolResult): number {
    // Calculate actual token usage from result. Counts BOTH text and data blocks —
    // post-Finding-E (2026-07-08) object results carry a single {type:'data'} block and no
    // summary text block, so a text-only sum would record ~0 for every object result.
    const contentLength = result.content.reduce((total, item: any) => {
      if (typeof item.text === 'string') return total + item.text.length;
      if (item.data !== undefined) {
        try { return total + JSON.stringify(item.data).length; } catch { return total; }
      }
      return total;
    }, 0);

    return Math.ceil(contentLength / 4); // Rough token estimate
  }

  /**
   * Enhanced Streamable HTTP client implementation
   */
  private async createEnhancedStreamableHttpClient(url: string, config: MCPServerConfig): Promise<any> {
    mcpLogger.info({ url }, 'Creating enhanced Streamable HTTP client');
    
    return {
      request: async (request: { method: string; params: any }) => {
        mcpLogger.debug({ method: request.method }, 'Streamable HTTP request');
        
        try {
          // Build request URL with method
          const requestUrl = new URL(url);
          requestUrl.searchParams.set('method', request.method);
          
          const fetchOptions: RequestInit = {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream', // Support for streaming responses
              ...(config.authentication?.type === 'bearer' && config.authentication.token ? {
                'Authorization': `Bearer ${config.authentication.token}`
              } : {}),
              ...(config.authentication?.type === 'api_key' && config.authentication.apiKey ? {
                'X-API-Key': config.authentication.apiKey
              } : {})
            },
            body: JSON.stringify(request.params || {})
          };

          const response = await fetch(requestUrl.toString(), {
            ...fetchOptions,
            signal: AbortSignal.timeout(30_000),
          });

          if (!response.ok) {
            // BC20 FIX: consume body to release TCP connection back to pool
            await response.body?.cancel();
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          // Handle streaming responses
          if (response.headers.get('content-type')?.includes('text/event-stream')) {
            return await this.handleStreamableResponse(response);
          } else {
            // Handle regular JSON responses
            return await response.json();
          }
          
        } catch (error) {
          mcpLogger.error({ err: error }, 'Streamable HTTP request failed');
          throw error;
        }
      }
    };
  }

  /**
   * Handle Server-Sent Events streaming response
   */
  private async handleStreamableResponse(response: Response): Promise<any> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No readable stream available');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let result: any = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)); // Remove 'data: ' prefix
              
              // Handle different event types
              if (data.type === 'result') {
                result = data.payload;
              } else if (data.type === 'error') {
                throw new Error(data.payload?.message || 'Streaming error');
              } else if (data.type === 'progress') {
                mcpLogger.debug({ progressMessage: data.payload?.message }, 'Streaming progress update');
              }
            } catch (parseError) {
              mcpLogger.warn({ parseError: true }, 'Failed to parse SSE data line');
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return result;
  }
}

// Create singleton instance with global storage to ensure single instance
declare global {
  var __mcpService: MCPService | undefined;
}

export const mcpService = globalThis.__mcpService ?? new MCPService();

if (!globalThis.__mcpService) {
  globalThis.__mcpService = mcpService;
}
