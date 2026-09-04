import { EventEmitter } from 'events';
import { mcpToolRegistry } from './toolRegistry';
import { MCPServerConfig } from '../llm/mcp-integration';
import { serverConfigStore } from './serverConfigStore';
import { mcpLogger } from '@/lib/logger';

/**
 * MCP Server Status
 */
export enum MCPServerStatus {
  UNKNOWN = 'unknown',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
  MAINTENANCE = 'maintenance'
}

/**
 * MCP Server Information
 */
export interface MCPServerInfo {
  name: string;
  config: MCPServerConfig;
  status: MCPServerStatus;
  connectedAt?: Date;
  lastActivity?: Date;
  errorCount: number;
  toolCount: number;
  version?: string;
  capabilities?: string[];
  metadata?: Record<string, any>;
}

/**
 * Server Manager Events
 */
export interface ServerManagerEvents {
  'server:added': (serverName: string, info: MCPServerInfo) => void;
  'server:removed': (serverName: string) => void;
  'server:connected': (serverName: string, info: MCPServerInfo) => void;
  'server:disconnected': (serverName: string, reason?: string) => void;
  'server:error': (serverName: string, error: Error) => void;
  'server:status': (serverName: string, status: MCPServerStatus) => void;
  'servers:health': (healthReport: ServerHealthReport) => void;
}

/**
 * Server Health Report
 */
export interface ServerHealthReport {
  totalServers: number;
  connectedServers: number;
  disconnectedServers: number;
  errorServers: number;
  averageResponseTime: number;
  totalTools: number;
  lastUpdated: Date;
  serverDetails: Array<{
    name: string;
    status: MCPServerStatus;
    uptime: number;
    responseTime: number;
    toolCount: number;
    errorCount: number;
  }>;
}

/**
 * Server Manager Configuration
 */
export interface ServerManagerConfig {
  maxServers: number;
  healthCheckInterval: number;
  autoReconnect: boolean;
  connectionTimeout: number;
  enableMetrics: boolean;
  enableAutoDiscovery: boolean;
}

/**
 * MCP Server Manager
 * Manages multiple MCP server connections and their lifecycle
 */
export class MCPServerManager extends EventEmitter {
  private servers: Map<string, MCPServerInfo> = new Map();
  private config: ServerManagerConfig;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;
  private inactiveServers: Set<string> = new Set(); // Track already-logged inactive servers

  constructor(config: ServerManagerConfig) {
    super();
    this.setMaxListeners(50); // Fix 6.4
    this.config = config;
    this.setupHealthMonitoring();
  }

  /**
   * Initialize server manager
   */
  async initialize(): Promise<void> {
    mcpLogger.info('Initializing server manager');

    try {
      // Load server configurations from store
      await serverConfigStore.load();

      // Load default server configurations
      await this.loadDefaultServers();

      // Load stored server configurations
      await this.loadStoredServers();

      // Start health monitoring if enabled
      if (this.config.healthCheckInterval > 0) {
        this.startHealthMonitoring();
      }

      this.isInitialized = true;
      mcpLogger.info({ serverCount: this.servers.size }, 'Server manager initialized');
    } catch (error) {
      mcpLogger.error({ err: error }, 'Failed to initialize server manager');
      throw error;
    }
  }

  /**
   * Add new MCP server
   */
  async addServer(serverConfig: MCPServerConfig): Promise<void> {
    mcpLogger.info({ server: serverConfig.name }, 'Adding server');

    if (this.servers.has(serverConfig.name)) {
      throw new Error(`Server ${serverConfig.name} already exists`);
    }

    if (this.servers.size >= this.config.maxServers) {
      throw new Error(`Maximum number of servers (${this.config.maxServers}) reached`);
    }

    // First, save the configuration
    await serverConfigStore.add(serverConfig);
    mcpLogger.debug({ server: serverConfig.name }, 'Saved server configuration');

    try {
      // Initialize MCP service if not already done
      const { mcpService } = await import('./mcpService');

      if (!mcpService.isReady()) {
        mcpLogger.debug({ server: serverConfig.name }, 'Initializing MCP service');
        await mcpService.initializeSDK();
      }

      // Create client using MCP service
      const client = await mcpService.createClient(serverConfig);
      mcpLogger.debug({ server: serverConfig.name }, 'Client created');

      // Store the client in the MCP service for tool discovery
      mcpService.registerClient(serverConfig.name, client, serverConfig);
      mcpLogger.debug({ server: serverConfig.name }, 'Client registered');

      // Create server info with simplified structure for now
      const serverInfo: MCPServerInfo = {
        name: serverConfig.name,
        config: serverConfig,
        status: MCPServerStatus.CONNECTED, // Mark as connected if client creation succeeded
        errorCount: 0,
        toolCount: 0,
        capabilities: [],
        connectedAt: new Date(),
        lastActivity: new Date()
      };

      // Add to servers map
      this.servers.set(serverConfig.name, serverInfo);

      // Emit added event
      this.emit('server:added', serverConfig.name, serverInfo);

      mcpLogger.info({ server: serverConfig.name }, 'Successfully added and connected server');
    } catch (error) {
      mcpLogger.error({ err: error, server: serverConfig.name }, 'Failed to connect to server');
      
      // Even if connection fails, keep the server in disconnected state
      const serverInfo: MCPServerInfo = {
        name: serverConfig.name,
        config: serverConfig,
        status: MCPServerStatus.DISCONNECTED,
        errorCount: 1,
        toolCount: 0,
        capabilities: [],
        connectedAt: undefined,
        lastActivity: new Date()
      };

      // Add to servers map in disconnected state
      this.servers.set(serverConfig.name, serverInfo);

      // Emit added event
      this.emit('server:added', serverConfig.name, serverInfo);

      mcpLogger.info({ server: serverConfig.name, status: 'disconnected' }, 'Added server in disconnected state');
      // Don't throw error - server is added but disconnected
    }
  }

  /**
   * Remove MCP server
   */
  async removeServer(serverName: string): Promise<void> {
    mcpLogger.info({ server: serverName }, 'Removing server');

    const serverInfo = this.servers.get(serverName);
    if (!serverInfo) {
      throw new Error(`Server ${serverName} not found`);
    }

    try {
      // Disconnect if connected
      if (serverInfo.status === MCPServerStatus.CONNECTED) {
        await this.disconnectServer(serverName);
      }

      // Remove from servers map
      this.servers.delete(serverName);
      
      // Remove from config store
      await serverConfigStore.remove(serverName);

      // Emit removed event
      this.emit('server:removed', serverName);

      mcpLogger.info({ server: serverName }, 'Successfully removed server');
    } catch (error) {
      mcpLogger.error({ err: error, server: serverName }, 'Failed to remove server');
      throw error;
    }
  }

  /**
   * Connect to server
   */
  async connectServer(serverName: string): Promise<void> {
    mcpLogger.info({ server: serverName }, 'Connecting to server');

    const serverInfo = this.servers.get(serverName);
    if (!serverInfo) {
      throw new Error(`Server ${serverName} not found`);
    }

    // If already connected, just update tools
    if (serverInfo.status === MCPServerStatus.CONNECTED) {
      mcpLogger.debug({ server: serverName }, 'Server already connected, refreshing tools');
      await this.discoverServerTools(serverName);
      return;
    }

    try {
      this.updateServerStatus(serverName, MCPServerStatus.CONNECTING);

      // Initialize MCP service if needed
      const { mcpService } = await import('./mcpService');
      if (!mcpService.isReady()) {
        mcpLogger.debug({ server: serverName }, 'Initializing MCP service');
        await mcpService.initializeSDK();
      }

      // Create and register client
      const client = await mcpService.createClient(serverInfo.config);
      mcpService.registerClient(serverName, client, serverInfo.config);
      mcpLogger.debug({ server: serverName }, 'Client created and registered');

      // Update server info
      serverInfo.connectedAt = new Date();
      serverInfo.lastActivity = new Date();

      this.updateServerStatus(serverName, MCPServerStatus.CONNECTED);

      // Discover tools from the newly connected server
      await this.discoverServerTools(serverName);

      // Emit connected event
      this.emit('server:connected', serverName, serverInfo);

      mcpLogger.info({ server: serverName }, 'Successfully connected to server');
    } catch (error) {
      mcpLogger.error({ err: error, server: serverName }, 'Failed to connect to server');
      
      serverInfo.errorCount++;
      this.updateServerStatus(serverName, MCPServerStatus.ERROR);
      this.emit('server:error', serverName, error as Error);
      
      throw error;
    }
  }

  /**
   * Disconnect from server
   */
  async disconnectServer(serverName: string, reason?: string): Promise<void> {
    mcpLogger.info({ server: serverName, reason }, 'Disconnecting from server');

    const serverInfo = this.servers.get(serverName);
    if (!serverInfo) {
      throw new Error(`Server ${serverName} not found`);
    }

    try {
      this.updateServerStatus(serverName, MCPServerStatus.DISCONNECTED);

      // Emit disconnected event
      this.emit('server:disconnected', serverName, reason);

      mcpLogger.info({ server: serverName }, 'Successfully disconnected from server');
    } catch (error) {
      mcpLogger.error({ err: error, server: serverName }, 'Failed to disconnect from server');
      throw error;
    }
  }

  /**
   * List connected servers
   */
  listServers(): string[] {
    return Array.from(this.servers.keys());
  }

  /**
   * Get server information
   */
  getServerInfo(serverName: string): MCPServerInfo | null {
    const serverInfo = this.servers.get(serverName) || null;
    mcpLogger.debug({ server: serverName, found: !!serverInfo, totalServers: this.servers.size }, 'Server info lookup');

    return serverInfo;
  }

  /**
   * Get all server information
   */
  getAllServerInfo(): MCPServerInfo[] {
    return Array.from(this.servers.values());
  }

  /**
   * Get connected servers
   */
  getConnectedServers(): string[] {
    return Array.from(this.servers.entries())
      .filter(([_, info]) => info.status === MCPServerStatus.CONNECTED)
      .map(([name, _]) => name);
  }

  /**
   * Get server health report
   */
  getHealthReport(): ServerHealthReport {
    const servers = Array.from(this.servers.values());
    const connectedServers = servers.filter(s => s.status === MCPServerStatus.CONNECTED);
    const disconnectedServers = servers.filter(s => s.status === MCPServerStatus.DISCONNECTED);
    const errorServers = servers.filter(s => s.status === MCPServerStatus.ERROR);

    // 2026-06-12: was a fabricated `150 // Mock` — report 0 (no timing
    // instrumentation exists for registered servers; don't invent numbers).
    // Wire real per-server timing if/when health checks measure round-trips.
    const averageResponseTime = 0;
    const totalTools = servers.reduce((sum, server) => sum + server.toolCount, 0);

    return {
      totalServers: servers.length,
      connectedServers: connectedServers.length,
      disconnectedServers: disconnectedServers.length,
      errorServers: errorServers.length,
      averageResponseTime,
      totalTools,
      lastUpdated: new Date(),
      serverDetails: servers.map(server => ({
        name: server.name,
        status: server.status,
        uptime: server.connectedAt ? Date.now() - server.connectedAt.getTime() : 0,
        responseTime: 0, // 2026-06-12: was fabricated 150 — no per-server timing instrumentation
        toolCount: server.toolCount,
        errorCount: server.errorCount
      }))
    };
  }

  /**
   * Execute tool on specific server
   */
  async executeToolOnServer(
    serverName: string,
    toolName: string,
    arguments_: Record<string, any>,
    options?: {
      sessionId?: string;
      userId?: string;
      timeout?: number;
    }
  ): Promise<any> {
    const serverInfo = this.servers.get(serverName);
    if (!serverInfo) {
      throw new Error(`Server ${serverName} not found`);
    }

    if (serverInfo.status !== MCPServerStatus.CONNECTED) {
      throw new Error(`Server ${serverName} not connected (status: ${serverInfo.status})`);
    }

    try {
      // Use MCP service to execute the tool
      const { mcpService } = await import('./mcpService');
      const result = await mcpService.callTool(serverName, toolName, arguments_, options);
      
      // Update last activity
      serverInfo.lastActivity = new Date();
      
      return result;
    } catch (error) {
      serverInfo.errorCount++;
      throw error;
    }
  }

  /**
   * Reconnect all servers
   */
  async reconnectAllServers(): Promise<void> {
    mcpLogger.info({ serverCount: this.servers.size }, 'Reconnecting all servers');

    const reconnectPromises = Array.from(this.servers.keys()).map(async (serverName) => {
      try {
        await this.disconnectServer(serverName, 'Manual reconnect');
        await this.connectServer(serverName);
      } catch (error) {
        mcpLogger.error({ err: error, server: serverName }, 'Failed to reconnect server');
      }
    });

    await Promise.allSettled(reconnectPromises);
    mcpLogger.info('Reconnection process completed');
  }

  /**
   * Shutdown server manager
   * 
   * Behavior:
   * - Embedded servers: Removed completely (recreated on startup)
   * - External servers: Disconnected only (persist in config)
   */
  async shutdown(): Promise<void> {
    mcpLogger.info('Shutting down server manager');

    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Handle servers based on type
    const disconnectPromises = Array.from(this.servers.entries()).map(async ([serverName, serverInfo]) => {
      try {
        // Check if this is the embedded server or has embedded transport
        const isEmbedded = serverName === 'paichart-embedded-mcp' || 
                          serverInfo.config.transport?.type === 'embedded';
        
        if (isEmbedded) {
          // Remove embedded servers completely (they'll be recreated on startup)
          mcpLogger.debug({ server: serverName, type: 'embedded' }, 'Removing embedded server');
          await this.removeServer(serverName);
        } else {
          // Just disconnect external servers, keep them in config
          mcpLogger.debug({ server: serverName, type: 'external' }, 'Disconnecting external server');
          await this.disconnectServer(serverName);
        }
      } catch (error) {
        mcpLogger.error({ err: error, server: serverName }, 'Failed to handle server during shutdown');
      }
    });

    await Promise.allSettled(disconnectPromises);

    this.isInitialized = false;
    mcpLogger.info('Server manager shutdown completed');
  }

  /**
   * Check if manager is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  // Private helper methods

  private async loadDefaultServers(): Promise<void> {
    // For now, don't load any default servers
    mcpLogger.debug('No default servers to load');
  }
  
  private async loadStoredServers(): Promise<void> {
    mcpLogger.info('Loading stored server configurations');

    const storedConfigs = serverConfigStore.getAll();

    for (const config of storedConfigs) {
      try {
        mcpLogger.debug({ server: config.name }, 'Loading stored server');
        
        // Create server info without connecting
        const serverInfo: MCPServerInfo = {
          name: config.name,
          config: config,
          status: MCPServerStatus.DISCONNECTED,
          errorCount: 0,
          toolCount: 0,
          capabilities: [],
          connectedAt: undefined,
          lastActivity: new Date()
        };
        
        // Add to servers map
        this.servers.set(config.name, serverInfo);
        
        // Emit added event
        this.emit('server:added', config.name, serverInfo);
        
        mcpLogger.debug({ server: config.name, status: 'disconnected' }, 'Loaded stored server');

        // Register static tools if available (without requiring connection)
        await this.registerStaticTools(config.name);
      } catch (error) {
        mcpLogger.error({ err: error, server: config.name }, 'Failed to load stored server');
      }
    }

    mcpLogger.info({ count: storedConfigs.length }, 'Loaded stored server configurations');
  }

  private updateServerStatus(serverName: string, status: MCPServerStatus): void {
    const serverInfo = this.servers.get(serverName);
    if (serverInfo && serverInfo.status !== status) {
      serverInfo.status = status;
      this.emit('server:status', serverName, status);
      mcpLogger.info({ server: serverName, status }, 'Server status changed');
    }
  }

  private setupHealthMonitoring(): void {
    // Health monitoring will be started in initialize()
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck().catch(err =>
        mcpLogger.warn({ err }, 'Health check interval failed')
      );
    }, this.config.healthCheckInterval);

    // TIME BOMB PREVENTION: .unref() prevents blocking process exit (Category 5)
    this.healthCheckInterval.unref();

    mcpLogger.info({ intervalMs: this.config.healthCheckInterval }, 'Health monitoring started');
  }

  private async performHealthCheck(): Promise<void> {
    const healthReport = this.getHealthReport();
    
    // Emit health report
    this.emit('servers:health', healthReport);

    // Check for servers that need attention
    for (const server of this.servers.values()) {
      // Check for servers with high error rates
      if (server.errorCount > 10 && server.status === MCPServerStatus.CONNECTED) {
        mcpLogger.warn({ server: server.name, errorCount: server.errorCount }, 'Server has high error count');
      }

      // Check for inactive servers (only log on state change to avoid spam)
      if (server.lastActivity && Date.now() - server.lastActivity.getTime() > 300000) { // 5 minutes
        if (!this.inactiveServers.has(server.name)) {
          this.inactiveServers.add(server.name);
          mcpLogger.info({ server: server.name }, 'Server has become inactive (no activity for 5+ minutes)');
        }
      } else if (this.inactiveServers.has(server.name)) {
        this.inactiveServers.delete(server.name);
        mcpLogger.info({ server: server.name }, 'Server has become active again');
      }

      // Attempt reconnection for error servers if auto-reconnect is enabled
      if (server.status === MCPServerStatus.ERROR && this.config.autoReconnect) {
        try {
          mcpLogger.info({ server: server.name }, 'Attempting to reconnect error server');
          await this.connectServer(server.name);
        } catch (error) {
          mcpLogger.error({ err: error, server: server.name }, 'Failed to reconnect server');
        }
      }
    }
  }

  /**
   * Register static tools for a server without requiring connection
   */
  private async registerStaticTools(serverName: string): Promise<void> {
    try {
      mcpLogger.debug({ server: serverName }, 'Registering static tools for server');

      const { hasStaticTools, getStaticTools } = await import('./staticTools');
      if (!hasStaticTools(serverName)) {
        mcpLogger.debug({ server: serverName }, 'No static tools defined');
        return;
      }

      const tools = getStaticTools(serverName);
      const serverInfo = this.servers.get(serverName);

      if (!serverInfo) {
        mcpLogger.error({ server: serverName }, 'Server not found during static tool registration');
        return;
      }

      if (tools && tools.length > 0) {
        mcpLogger.debug({ server: serverName, toolCount: tools.length }, 'Found static tools');
        serverInfo.toolCount = tools.length;
        
        // Register tools with the tool registry
        const { mcpToolRegistry } = await import('./toolRegistry');
        for (const tool of tools) {
          try {
            const toolMetadata = {
              name: tool.name,
              serverName: serverName,
              description: tool.description,
              category: 'external',
              tags: ['external', serverName, 'static'],
              inputSchema: tool.inputSchema,
              performance: {
                averageExecutionTime: 0,
                successRate: 100,
                totalExecutions: 0,
                tokenUsage: {
                  averageInputTokens: 0,
                  averageOutputTokens: 0,
                  totalTokens: 0
                }
              },
              reliability: {
                uptime: 100,
                errorRate: 0,
                healthScore: 100
              },
              lastUpdated: new Date(),
              version: '1.0.0',
              deprecated: false
            };
            
            await mcpToolRegistry.registerTool(toolMetadata);
            mcpLogger.debug({ server: serverName, tool: tool.name }, 'Registered static tool');
          } catch (toolError) {
            mcpLogger.error({ err: toolError, tool: tool.name }, 'Failed to register static tool');
          }
        }
      }
    } catch (error) {
      mcpLogger.error({ err: error, server: serverName }, 'Failed to register static tools');
    }
  }

  /**
   * Get tool definition by name (searches across all servers)
   * Returns the tool definition with server information
   */
  public async getToolDefinition(toolName: string): Promise<{ serverName: string; tool: any } | null> {
    // First check the tool registry
    const allTools = mcpToolRegistry.getAllTools();
    
    for (const [key, metadata] of allTools) {
      if (metadata.name === toolName) {
        return {
          serverName: metadata.serverName,
          tool: {
            name: metadata.name,
            description: metadata.description,
            inputSchema: metadata.inputSchema
          }
        };
      }
    }
    
    // If not found in registry, check static tools
    const { hasStaticTools, getStaticTools } = await import('./staticTools');
    for (const [serverName, serverInfo] of this.servers) {
      if (hasStaticTools(serverName)) {
        const staticTools = getStaticTools(serverName);
        const tool = staticTools.find(t => t.name === toolName);
        if (tool) {
          return {
            serverName,
            tool
          };
        }
      }
    }
    
    return null;
  }

  /**
   * Get multiple tool definitions by names
   */
  public async getToolDefinitions(toolNames: string[]): Promise<Array<{ serverName: string; tool: any }>> {
    const definitions = [];
    for (const toolName of toolNames) {
      const def = await this.getToolDefinition(toolName);
      if (def) {
        definitions.push(def);
      }
    }
    return definitions;
  }

  /**
   * Discover tools from a connected server
   */
  private async discoverServerTools(serverName: string): Promise<void> {
    try {
      mcpLogger.debug({ server: serverName }, 'Discovering tools from server');
      const { mcpService } = await import('./mcpService');

      let tools: any[] = [];
      let usingStaticTools = false;

      try {
        // Try dynamic discovery first
        tools = await mcpService.listServerTools(serverName);
      } catch (error: any) {
        mcpLogger.warn({ server: serverName, message: error.message }, 'Dynamic tool discovery failed, checking static tools');

        // Check if we have static tools for this server
        const { hasStaticTools, getStaticTools } = await import('./staticTools');
        if (hasStaticTools(serverName)) {
          mcpLogger.debug({ server: serverName }, 'Using static tool definitions');
          tools = getStaticTools(serverName);
          usingStaticTools = true;
        } else {
          throw error; // Re-throw if no static tools available
        }
      }
      
      const serverInfo = this.servers.get(serverName);
      if (!serverInfo) {
        mcpLogger.error({ server: serverName }, 'Server not found during tool discovery');
        return;
      }

      if (tools && tools.length > 0) {
        mcpLogger.info({ server: serverName, toolCount: tools.length, source: usingStaticTools ? 'static' : 'dynamic' }, 'Discovered tools from server');
        serverInfo.toolCount = tools.length;
        
        // Register tools with the tool registry
        const { mcpToolRegistry } = await import('./toolRegistry');
        for (const tool of tools) {
          try {
            const toolMetadata = {
              name: tool.name,
              serverName: serverName,
              description: tool.description,
              category: 'external',
              tags: ['external', serverName, usingStaticTools ? 'static' : 'dynamic'],
              inputSchema: tool.inputSchema,
              performance: {
                averageExecutionTime: 0,
                successRate: 100,
                totalExecutions: 0,
                tokenUsage: {
                  averageInputTokens: 0,
                  averageOutputTokens: 0,
                  totalTokens: 0
                }
              },
              reliability: {
                uptime: 100,
                errorRate: 0,
                healthScore: 100
              },
              lastUpdated: new Date(),
              version: '1.0.0',
              deprecated: false
            };
            
            await mcpToolRegistry.registerTool(toolMetadata);
            mcpLogger.debug({ server: serverName, tool: tool.name }, 'Registered tool');
          } catch (toolError) {
            mcpLogger.error({ err: toolError, tool: tool.name, server: serverName }, 'Failed to register tool');
          }
        }
      } else {
        mcpLogger.debug({ server: serverName }, 'No tools found from server');
      }
    } catch (toolError) {
      mcpLogger.error({ err: toolError, server: serverName }, 'Failed to discover tools from server');
      // Don't fail the connection if tool discovery fails
    }
  }
}

/**
 * Default Server Manager Configuration
 */
export const DEFAULT_SERVER_MANAGER_CONFIG: ServerManagerConfig = {
  maxServers: 10,
  healthCheckInterval: 30000, // 30 seconds
  autoReconnect: true,
  connectionTimeout: 10000,
  enableMetrics: true,
  enableAutoDiscovery: false
};

/**
 * Create MCP Server Manager
 */
export function createMCPServerManager(config?: Partial<ServerManagerConfig>): MCPServerManager {
  const fullConfig: ServerManagerConfig = {
    ...DEFAULT_SERVER_MANAGER_CONFIG,
    ...config
  };

  return new MCPServerManager(fullConfig);
}

// Create singleton instance with global storage to ensure single instance
declare global {
  var __mcpServerManager: MCPServerManager | undefined;
}

export const mcpServerManager = globalThis.__mcpServerManager ?? createMCPServerManager();

if (!globalThis.__mcpServerManager) {
  globalThis.__mcpServerManager = mcpServerManager;
}
