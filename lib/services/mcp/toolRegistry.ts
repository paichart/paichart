import { MCPTool, MCPResource } from '../llm/mcp-integration';
import { mcpService } from './mcpService';
import { mcpLogger } from '@/lib/logger';

/**
 * MCP Tool Metadata
 */
export interface MCPToolMetadata {
  name: string;
  serverName: string;
  description: string;
  category: string;
  tags: string[];
  inputSchema: any;
  outputSchema?: any;
  examples?: MCPToolExample[];
  performance: MCPToolPerformance;
  reliability: MCPToolReliability;
  lastUpdated: Date;
  version: string;
  deprecated: boolean;
  replacedBy?: string;
}

/**
 * MCP Tool Example
 */
export interface MCPToolExample {
  name: string;
  description: string;
  input: Record<string, any>;
  expectedOutput: any;
  notes?: string;
}

/**
 * MCP Tool Performance Metrics
 */
export interface MCPToolPerformance {
  averageExecutionTime: number;
  successRate: number;
  totalExecutions: number;
  lastExecution?: Date;
  tokenUsage: {
    averageInputTokens: number;
    averageOutputTokens: number;
    totalTokens: number;
  };
}

/**
 * MCP Tool Reliability Metrics
 */
export interface MCPToolReliability {
  uptime: number; // Percentage
  errorRate: number; // Percentage
  lastError?: {
    timestamp: Date;
    message: string;
    type: string;
  };
  healthScore: number; // 0-100
}

/**
 * Tool Discovery Result
 */
export interface ToolDiscoveryResult {
  serverName: string;
  tools: MCPToolMetadata[];
  discoveredAt: Date;
  serverHealth: {
    connected: boolean;
    responseTime: number;
    version?: string;
  };
}

/**
 * Tool Search Criteria
 */
export interface ToolSearchCriteria {
  query?: string;
  category?: string;
  tags?: string[];
  serverName?: string;
  minSuccessRate?: number;
  maxExecutionTime?: number;
  includeDeprecated?: boolean;
}

/**
 * Tool Recommendation
 */
export interface ToolRecommendation {
  tool: MCPToolMetadata;
  score: number;
  reasons: string[];
  alternatives?: MCPToolMetadata[];
}

/**
 * MCP Tool Registry
 * Manages discovery, registration, and metadata for MCP tools
 *
 * TIME BOMB PREVENTION (Jan 2026):
 * - tools and serverTools Maps have MAX size limits with LRU eviction
 * - discovery timer uses .unref() to prevent blocking process exit
 * - Pattern: time-bomb-detection-pattern.md (Categories 1 & 5)
 */
export class MCPToolRegistry {
  private tools: Map<string, MCPToolMetadata> = new Map();
  private serverTools: Map<string, string[]> = new Map();
  private categories: Map<string, string[]> = new Map();
  private discoveryInterval: NodeJS.Timeout | null = null;

  // TIME BOMB PREVENTION: Map size limits (Category 1: Unbounded Caches)
  private readonly MAX_TOOLS = 2000;
  private readonly MAX_SERVERS = 100;
  private mapEvictionStats = { tools: 0, servers: 0 };

  constructor() {
    this.initializeCategories();
    this.startDiscoveryScheduler();
  }

  // ============================================================================
  // TIME BOMB PREVENTION: LRU Eviction Helpers (Category 1)
  // ============================================================================

  /**
   * Set tool with LRU eviction if at capacity
   */
  private setTool(toolKey: string, tool: MCPToolMetadata): void {
    if (this.tools.size >= this.MAX_TOOLS && !this.tools.has(toolKey)) {
      // Evict oldest (first inserted) tool
      const oldestKey = this.tools.keys().next().value;
      if (oldestKey) {
        this.tools.delete(oldestKey);
        this.mapEvictionStats.tools++;
      }
    }
    this.tools.set(toolKey, tool);
  }

  /**
   * Set server tools with LRU eviction if at capacity
   */
  private setServerTools(serverName: string, toolNames: string[]): void {
    if (this.serverTools.size >= this.MAX_SERVERS && !this.serverTools.has(serverName)) {
      // Evict oldest (first inserted) server
      const oldestServer = this.serverTools.keys().next().value;
      if (oldestServer) {
        this.serverTools.delete(oldestServer);
        this.mapEvictionStats.servers++;
      }
    }
    this.serverTools.set(serverName, toolNames);
  }

  /**
   * Get tool registry stats for monitoring
   */
  getRegistryStats(): {
    tools: number;
    servers: number;
    categories: number;
    evictions: { tools: number; servers: number };
    limits: { maxTools: number; maxServers: number };
  } {
    return {
      tools: this.tools.size,
      servers: this.serverTools.size,
      categories: this.categories.size,
      evictions: { ...this.mapEvictionStats },
      limits: { maxTools: this.MAX_TOOLS, maxServers: this.MAX_SERVERS }
    };
  }

  /**
   * Register an MCP tool
   */
  async registerTool(tool: MCPToolMetadata): Promise<void> {
    mcpLogger.debug({ tool: tool.name, server: tool.serverName, registrySize: this.tools.size }, 'Registering tool');

    try {
      const toolKey = `${tool.serverName}:${tool.name}`;
      
      // Update tool metadata
      const existingTool = this.tools.get(toolKey);
      const updatedTool: MCPToolMetadata = {
        ...tool,
        performance: existingTool?.performance || {
          averageExecutionTime: 0,
          successRate: 100,
          totalExecutions: 0,
          tokenUsage: {
            averageInputTokens: 0,
            averageOutputTokens: 0,
            totalTokens: 0
          }
        },
        reliability: existingTool?.reliability || {
          uptime: 100,
          errorRate: 0,
          healthScore: 100
        },
        lastUpdated: new Date()
      };

      // Uses LRU eviction if at capacity
      this.setTool(toolKey, updatedTool);

      // BC65 FIX: Use Set-based dedup to prevent duplicate entries from concurrent registration
      const serverTools = this.serverTools.get(tool.serverName) || [];
      if (!serverTools.includes(tool.name)) {
        serverTools.push(tool.name);
      }
      // Always re-set to ensure consistency (idempotent)
      this.setServerTools(tool.serverName, serverTools);

      // BC65 FIX: Same dedup pattern for categories
      const categoryTools = this.categories.get(tool.category) || [];
      if (!categoryTools.includes(toolKey)) {
        categoryTools.push(toolKey);
      }
      this.categories.set(tool.category, categoryTools);

      mcpLogger.debug({ toolKey, registrySize: this.tools.size }, 'Tool registered');
    } catch (error) {
      mcpLogger.error({ err: error, tool: tool.name }, 'Failed to register tool');
      throw error;
    }
  }

  /**
   * Discover available MCP tools from all servers
   */
  async discoverTools(): Promise<ToolDiscoveryResult[]> {
    mcpLogger.info({}, 'Discovering tools from all servers');

    const results: ToolDiscoveryResult[] = [];

    try {
      if (!mcpService.isReady()) {
        mcpLogger.debug({}, 'MCP service not ready, skipping discovery');
        return results;
      }

      const serverStatus = mcpService.getServerStatus();

      for (const [serverName, status] of serverStatus) {
        if (!status.connected) {
          mcpLogger.debug({ server: serverName }, 'Server not connected, skipping discovery');
          continue;
        }

        try {
          const startTime = Date.now();
          const tools = await mcpService.listServerTools(serverName);
          const responseTime = Date.now() - startTime;

          const toolMetadata: MCPToolMetadata[] = tools.map(tool => ({
            name: tool.name,
            serverName,
            description: tool.description || 'No description available',
            category: this.categorizeToolByName(tool.name),
            tags: this.generateTagsForTool(tool),
            inputSchema: tool.inputSchema,
            examples: [],
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
          }));

          // Register discovered tools
          for (const tool of toolMetadata) {
            await this.registerTool(tool);
          }

          results.push({
            serverName,
            tools: toolMetadata,
            discoveredAt: new Date(),
            serverHealth: {
              connected: true,
              responseTime,
              version: '1.0.0' // TODO: Get actual version from server
            }
          });

          mcpLogger.info({ server: serverName, toolCount: toolMetadata.length, responseTimeMs: responseTime }, 'Discovered tools from server');
        } catch (error) {
          mcpLogger.error({ err: error, server: serverName }, 'Failed to discover tools from server');
          
          results.push({
            serverName,
            tools: [],
            discoveredAt: new Date(),
            serverHealth: {
              connected: false,
              responseTime: -1
            }
          });
        }
      }

      mcpLogger.info({ serversProcessed: results.length }, 'Tool discovery completed');
      return results;
    } catch (error) {
      mcpLogger.error({ err: error }, 'Failed to discover tools');
      throw error;
    }
  }

  /**
   * Get tool metadata
   */
  getToolMetadata(serverName: string, toolName: string): MCPToolMetadata | null {
    const toolKey = `${serverName}:${toolName}`;
    return this.tools.get(toolKey) || null;
  }

  /**
   * Get all tools in the registry
   */
  getAllTools(): Map<string, MCPToolMetadata> {
    return new Map(this.tools);
  }

  /**
   * Find tool by name (searches across all servers)
   * Returns the first matching tool with server info
   */
  findToolByName(toolName: string): MCPToolMetadata | null {
    for (const [key, metadata] of this.tools) {
      if (metadata.name === toolName) {
        return metadata;
      }
    }
    return null;
  }

  /**
   * Search for tools based on criteria
   */
  searchTools(criteria: ToolSearchCriteria): MCPToolMetadata[] {
    mcpLogger.debug({ query: criteria.query, category: criteria.category, registrySize: this.tools.size }, 'Searching tools');

    let results = Array.from(this.tools.values());

    // Filter by query
    if (criteria.query) {
      const query = criteria.query.toLowerCase();
      results = results.filter(tool => 
        tool.name.toLowerCase().includes(query) ||
        tool.description.toLowerCase().includes(query) ||
        tool.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Filter by category
    if (criteria.category) {
      results = results.filter(tool => tool.category === criteria.category);
    }

    // Filter by tags
    if (criteria.tags && criteria.tags.length > 0) {
      results = results.filter(tool => 
        criteria.tags!.some(tag => tool.tags.includes(tag))
      );
    }

    // Filter by server
    if (criteria.serverName) {
      results = results.filter(tool => tool.serverName === criteria.serverName);
    }

    // Filter by success rate
    if (criteria.minSuccessRate !== undefined) {
      results = results.filter(tool => tool.performance.successRate >= criteria.minSuccessRate!);
    }

    // Filter by execution time
    if (criteria.maxExecutionTime !== undefined) {
      results = results.filter(tool => tool.performance.averageExecutionTime <= criteria.maxExecutionTime!);
    }

    // Filter deprecated tools
    if (!criteria.includeDeprecated) {
      results = results.filter(tool => !tool.deprecated);
    }

    mcpLogger.debug({ resultCount: results.length }, 'Tool search completed');
    return results;
  }

  /**
   * Get tool recommendations based on context
   */
  getToolRecommendations(
    context: {
      taskType?: string;
      userPreferences?: string[];
      recentTools?: string[];
      performance?: 'speed' | 'reliability' | 'balanced';
    }
  ): ToolRecommendation[] {
    mcpLogger.debug({ taskType: context.taskType, performance: context.performance }, 'Generating tool recommendations');

    const allTools = Array.from(this.tools.values());
    const recommendations: ToolRecommendation[] = [];

    for (const tool of allTools) {
      if (tool.deprecated) continue;

      let score = 50; // Base score
      const reasons: string[] = [];

      // Score based on performance preference
      if (context.performance) {
        switch (context.performance) {
          case 'speed':
            if (tool.performance.averageExecutionTime < 1000) {
              score += 20;
              reasons.push('Fast execution time');
            }
            break;
          case 'reliability':
            if (tool.reliability.healthScore > 90) {
              score += 20;
              reasons.push('High reliability score');
            }
            break;
          case 'balanced':
            if (tool.performance.averageExecutionTime < 2000 && tool.reliability.healthScore > 80) {
              score += 15;
              reasons.push('Good balance of speed and reliability');
            }
            break;
        }
      }

      // Score based on task type
      if (context.taskType) {
        if (tool.category.toLowerCase().includes(context.taskType.toLowerCase()) ||
            tool.tags.some(tag => tag.toLowerCase().includes(context.taskType!.toLowerCase()))) {
          score += 25;
          reasons.push(`Relevant to ${context.taskType} tasks`);
        }
      }

      // Score based on user preferences
      if (context.userPreferences) {
        const matchingPreferences = context.userPreferences.filter(pref =>
          tool.tags.includes(pref) || tool.category.includes(pref)
        );
        if (matchingPreferences.length > 0) {
          score += matchingPreferences.length * 10;
          reasons.push(`Matches user preferences: ${matchingPreferences.join(', ')}`);
        }
      }

      // Score based on recent usage
      if (context.recentTools && context.recentTools.includes(tool.name)) {
        score += 10;
        reasons.push('Recently used tool');
      }

      // Score based on success rate
      if (tool.performance.successRate > 95) {
        score += 10;
        reasons.push('High success rate');
      }

      // Score based on popularity (total executions)
      if (tool.performance.totalExecutions > 100) {
        score += 5;
        reasons.push('Popular tool');
      }

      if (score > 60) { // Only include tools with decent scores
        recommendations.push({
          tool,
          score,
          reasons,
          alternatives: this.findAlternativeTools(tool)
        });
      }
    }

    // Sort by score descending
    recommendations.sort((a, b) => b.score - a.score);

    mcpLogger.debug({ recommendationCount: recommendations.length }, 'Tool recommendations generated');
    return recommendations.slice(0, 10); // Return top 10
  }

  /**
   * Get all available categories
   */
  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: string): MCPToolMetadata[] {
    const toolKeys = this.categories.get(category) || [];
    return toolKeys.map(key => this.tools.get(key)).filter(Boolean) as MCPToolMetadata[];
  }

  /**
   * Get tools by server
   */
  getToolsByServer(serverName: string): MCPToolMetadata[] {
    const toolNames = this.serverTools.get(serverName) || [];
    return toolNames.map(name => this.tools.get(`${serverName}:${name}`)).filter(Boolean) as MCPToolMetadata[];
  }

  /**
   * Get registry statistics
   */
  getStatistics(): {
    totalTools: number;
    totalServers: number;
    totalCategories: number;
    averageSuccessRate: number;
    averageExecutionTime: number;
    totalExecutions: number;
  } {
    const tools = Array.from(this.tools.values());
    
    return {
      totalTools: tools.length,
      totalServers: this.serverTools.size,
      totalCategories: this.categories.size,
      averageSuccessRate: tools.reduce((sum, tool) => sum + tool.performance.successRate, 0) / tools.length || 0,
      averageExecutionTime: tools.reduce((sum, tool) => sum + tool.performance.averageExecutionTime, 0) / tools.length || 0,
      totalExecutions: tools.reduce((sum, tool) => sum + tool.performance.totalExecutions, 0)
    };
  }

  // Private helper methods

  private initializeCategories(): void {
    const defaultCategories = [
      'task-management',
      'data-processing',
      'communication',
      'analysis',
      'automation',
      'integration',
      'utility',
      'monitoring',
      'security',
      'other'
    ];

    for (const category of defaultCategories) {
      this.categories.set(category, []);
    }
  }

  private startDiscoveryScheduler(): void {
    // Run discovery every 30 minutes, but only if MCP service is ready
    this.discoveryInterval = setInterval(() => {
      // Only run discovery if MCP service is ready and has servers
      if (mcpService.isReady() && mcpService.getServerStatus().size > 0) {
        this.discoverTools().catch(error => {
          mcpLogger.error({ err: error }, 'Error during scheduled discovery');
        });
      } else {
        mcpLogger.debug({}, 'Skipping scheduled discovery — no MCP servers configured');
      }
    }, 30 * 60 * 1000);

    // TIME BOMB PREVENTION: .unref() prevents blocking process exit (Category 5)
    this.discoveryInterval.unref();
  }

  private categorizeToolByName(toolName: string): string {
    const name = toolName.toLowerCase();
    
    if (name.includes('task') || name.includes('todo') || name.includes('project')) {
      return 'task-management';
    }
    if (name.includes('data') || name.includes('process') || name.includes('transform')) {
      return 'data-processing';
    }
    if (name.includes('send') || name.includes('notify') || name.includes('message')) {
      return 'communication';
    }
    if (name.includes('analyze') || name.includes('report') || name.includes('metric')) {
      return 'analysis';
    }
    if (name.includes('auto') || name.includes('schedule') || name.includes('trigger')) {
      return 'automation';
    }
    if (name.includes('connect') || name.includes('sync') || name.includes('import')) {
      return 'integration';
    }
    if (name.includes('monitor') || name.includes('health') || name.includes('status')) {
      return 'monitoring';
    }
    if (name.includes('secure') || name.includes('auth') || name.includes('permission')) {
      return 'security';
    }
    if (name.includes('util') || name.includes('helper') || name.includes('format')) {
      return 'utility';
    }
    
    return 'other';
  }

  private generateTagsForTool(tool: MCPTool): string[] {
    const tags: string[] = [];
    const name = tool.name.toLowerCase();
    const description = (tool.description || '').toLowerCase();
    
    // Add tags based on name and description
    if (name.includes('create') || description.includes('create')) tags.push('create');
    if (name.includes('update') || description.includes('update')) tags.push('update');
    if (name.includes('delete') || description.includes('delete')) tags.push('delete');
    if (name.includes('get') || description.includes('retrieve')) tags.push('read');
    if (name.includes('list') || description.includes('list')) tags.push('list');
    if (name.includes('search') || description.includes('search')) tags.push('search');
    if (name.includes('async') || description.includes('async')) tags.push('async');
    if (name.includes('batch') || description.includes('batch')) tags.push('batch');
    
    return tags;
  }

  private findAlternativeTools(tool: MCPToolMetadata): MCPToolMetadata[] {
    const alternatives: MCPToolMetadata[] = [];
    
    // Find tools in the same category with similar tags
    const categoryTools = this.getToolsByCategory(tool.category);
    
    for (const categoryTool of categoryTools) {
      if (categoryTool.name === tool.name && categoryTool.serverName === tool.serverName) {
        continue; // Skip the same tool
      }
      
      // Check for tag overlap
      const commonTags = tool.tags.filter(tag => categoryTool.tags.includes(tag));
      if (commonTags.length > 0) {
        alternatives.push(categoryTool);
      }
    }
    
    return alternatives.slice(0, 3); // Return top 3 alternatives
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
    this.tools.clear();
    this.serverTools.clear();
    this.categories.clear();
  }
}

// Create singleton instance with global storage to ensure single instance
declare global {
  var __mcpToolRegistry: MCPToolRegistry | undefined;
}

export const mcpToolRegistry = globalThis.__mcpToolRegistry ?? new MCPToolRegistry();

if (!globalThis.__mcpToolRegistry) {
  globalThis.__mcpToolRegistry = mcpToolRegistry;
  mcpLogger.info({}, 'Tool registry singleton created');
} else {
  mcpLogger.debug({}, 'Tool registry using existing singleton');
}
