import { EventEmitter } from 'events';
import { mcpServerManager } from './serverManager';
import { mcpContextManager } from './contextManager';
import { MCPResource } from '../llm/mcp-integration';
import { prisma } from '../../prisma';
import { ExecutionStatus, AgentCategory } from '@prisma/client';
import { rollUpAndDeleteExecutions } from '../execution-artifacts';
import { selectExecutionsToDelete, RM_DAILY_RETENTION, msUntilNextMidnightUTC } from '../execution-retention';
// Shared retention map (Finding B, 2026-07-08) — keeps this pruner structurally aligned with
// compliance-monitor.cleanupOldArtifacts (both age-prune AgentArtifact; previously two hand-synced 90s).
import { RETENTION_DAYS } from '../../mcp/server/security/retention-windows';
import { mcpLogger } from '@/lib/logger';
import {
  RESOURCE_KEY_PREFIX,
  CACHE_DEFAULTS,
  buildResourceKey,
  parseResourceKey,
  type IResourceManager,
  type ResourceManagerStats,
} from '@/lib/mcp/resource-manager-types';
import { isCacheableResource } from '@/lib/mcp/resource-authz';

/**
 * MCP Resource Types
 */
export enum MCPResourceType {
  FILE = 'file',
  DATABASE = 'database',
  API = 'api',
  MEMORY = 'memory',
  STREAM = 'stream',
  CONFIGURATION = 'configuration',
  LOG = 'log',
  METRIC = 'metric',
  OTHER = 'other'
}

/**
 * MCP Resource Access Level
 */
export enum MCPResourceAccessLevel {
  READ = 'read',
  WRITE = 'write',
  ADMIN = 'admin',
  NONE = 'none'
}

/**
 * MCP Resource Status
 */
export enum MCPResourceStatus {
  AVAILABLE = 'available',
  UNAVAILABLE = 'unavailable',
  LOADING = 'loading',
  ERROR = 'error',
  CACHED = 'cached',
  EXPIRED = 'expired'
}

/**
 * Enhanced MCP Resource
 */
export interface EnhancedMCPResource extends MCPResource {
  id: string;
  serverName: string;
  type: MCPResourceType;
  accessLevel: MCPResourceAccessLevel;
  status: MCPResourceStatus;
  size?: number;
  lastModified?: Date;
  lastAccessed?: Date;
  accessCount: number;
  cacheExpiry?: Date;
  metadata: {
    contentType?: string;
    encoding?: string;
    checksum?: string;
    version?: string;
    tags: string[];
    permissions: string[];
    [key: string]: any;
  };
  subscription?: {
    subscribed: boolean;
    lastUpdate?: Date;
    updateCount: number;
    subscribers: string[];
  };
}

/**
 * Resource Subscription Options
 */
export interface ResourceSubscriptionOptions {
  sessionId?: string;
  userId?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  includeContent?: boolean;
  filters?: Record<string, any>;
}

/**
 * Resource Query Options
 */
export interface ResourceQueryOptions {
  type?: MCPResourceType;
  serverName?: string;
  accessLevel?: MCPResourceAccessLevel;
  status?: MCPResourceStatus;
  tags?: string[];
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'name' | 'lastModified' | 'lastAccessed' | 'size' | 'accessCount';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Resource Manager Events
 */
export interface ResourceManagerEvents {
  'resource:discovered': (resource: EnhancedMCPResource) => void;
  'resource:updated': (resource: EnhancedMCPResource, changes: Partial<EnhancedMCPResource>) => void;
  'resource:accessed': (resourceId: string, accessInfo: ResourceAccessInfo) => void;
  'resource:subscribed': (resourceId: string, subscription: ResourceSubscriptionInfo) => void;
  'resource:unsubscribed': (resourceId: string, sessionId: string) => void;
  'resource:error': (resourceId: string, error: Error) => void;
  'cache:hit': (resourceId: string) => void;
  'cache:miss': (resourceId: string) => void;
  'cache:expired': (resourceId: string) => void;
}

/**
 * Resource Access Information
 */
export interface ResourceAccessInfo {
  resourceId: string;
  sessionId?: string;
  userId?: string;
  accessType: 'read' | 'write' | 'subscribe';
  timestamp: Date;
  success: boolean;
  error?: string;
  bytesTransferred?: number;
  duration: number;
}

/**
 * Resource Subscription Information
 */
export interface ResourceSubscriptionInfo {
  resourceId: string;
  sessionId: string;
  userId?: string;
  options: ResourceSubscriptionOptions;
  subscribedAt: Date;
  lastUpdate?: Date;
  updateCount: number;
}

/**
 * Resource Cache Entry
 */
interface ResourceCacheEntry {
  content: any;
  cachedAt: Date;
  expiresAt: Date;
  accessCount: number;
  size: number;
}

/**
 * MCP Resource Manager
 * Manages MCP resources with caching, subscriptions, and access control
 *
 * TIME BOMB PREVENTION (Jan 2026):
 * - All Maps have MAX size limits with LRU eviction
 * - All timers use .unref() to prevent blocking process exit
 * - Pattern: time-bomb-detection-pattern.md (Categories 1 & 5)
 */
export class MCPResourceManager extends EventEmitter implements IResourceManager {
  private resources: Map<string, EnhancedMCPResource> = new Map();
  private resourceCache: Map<string, ResourceCacheEntry> = new Map();
  private subscriptions: Map<string, Map<string, ResourceSubscriptionInfo>> = new Map();
  private discoveryInterval: NodeJS.Timeout | null = null;
  private cacheCleanupInterval: NodeJS.Timeout | null = null;
  private subscriptionUpdateInterval: NodeJS.Timeout | null = null;
  private databaseEventInterval: NodeJS.Timeout | null = null;
  private autoRefreshTimers = new Map<string, NodeJS.Timeout>();
  private artifactCleanupInterval: NodeJS.Timeout | null = null;
  private ageCleanupInterval: NodeJS.Timeout | null = null;

  // TIME BOMB PREVENTION: Map size limits (Category 1: Unbounded Caches)
  private readonly MAX_RESOURCES = CACHE_DEFAULTS.MAX_RESOURCES;
  private readonly MAX_RESOURCE_CACHE = 1000;
  private readonly MAX_SUBSCRIPTIONS = 500;
  private readonly MAX_SUBSCRIBERS_PER_RESOURCE = 100;
  private readonly MAX_AUTO_REFRESH_TIMERS = 200;
  private readonly MAX_TYPE_INDEX_SIZE = 2000;

  // Eviction stats for monitoring
  private mapEvictionStats = {
    resources: 0,
    resourceCache: 0,
    subscriptions: 0,
    autoRefreshTimers: 0,
    typeIndex: 0
  };

  constructor() {
    super();
    this.setMaxListeners(30); // Fix 6.4
    this.setupEventListeners();
    this.startPeriodicTasks();
  }

  // ============================================================================
  // TIME BOMB PREVENTION: LRU Eviction Helpers (Category 1)
  // ============================================================================

  /**
   * Set resource with LRU eviction if at capacity
   */
  private setResource(id: string, resource: EnhancedMCPResource): void {
    if (this.resources.size >= this.MAX_RESOURCES && !this.resources.has(id)) {
      // Evict oldest (first inserted) resource
      const oldestId = this.resources.keys().next().value;
      if (oldestId) {
        this.resources.delete(oldestId);
        // Also clean up related cache and subscriptions
        this.resourceCache.delete(oldestId);
        this.subscriptions.delete(oldestId);
        this.mapEvictionStats.resources++;
      }
    }
    this.resources.set(id, resource);
  }

  /**
   * Set cache entry with LRU eviction if at capacity
   */
  private setCacheEntry(resourceId: string, entry: ResourceCacheEntry): void {
    if (this.resourceCache.size >= this.MAX_RESOURCE_CACHE && !this.resourceCache.has(resourceId)) {
      // Evict oldest (first inserted) cache entry
      const oldestId = this.resourceCache.keys().next().value;
      if (oldestId) {
        this.resourceCache.delete(oldestId);
        this.mapEvictionStats.resourceCache++;
      }
    }
    this.resourceCache.set(resourceId, entry);
  }

  /**
   * Set subscription with LRU eviction if at capacity
   */
  private setSubscription(resourceId: string, sessionId: string, info: ResourceSubscriptionInfo): void {
    if (!this.subscriptions.has(resourceId)) {
      if (this.subscriptions.size >= this.MAX_SUBSCRIPTIONS) {
        // Evict oldest resource's subscriptions
        const oldestResourceId = this.subscriptions.keys().next().value;
        if (oldestResourceId) {
          this.subscriptions.delete(oldestResourceId);
          this.mapEvictionStats.subscriptions++;
        }
      }
      this.subscriptions.set(resourceId, new Map());
    }

    const resourceSubs = this.subscriptions.get(resourceId)!;
    if (resourceSubs.size >= this.MAX_SUBSCRIBERS_PER_RESOURCE && !resourceSubs.has(sessionId)) {
      // Evict oldest subscriber for this resource
      const oldestSession = resourceSubs.keys().next().value;
      if (oldestSession) {
        resourceSubs.delete(oldestSession);
      }
    }
    resourceSubs.set(sessionId, info);
  }

  /**
   * Set auto-refresh timer with LRU eviction if at capacity
   */
  private setAutoRefreshTimer(timerKey: string, timer: NodeJS.Timeout): void {
    if (this.autoRefreshTimers.size >= this.MAX_AUTO_REFRESH_TIMERS && !this.autoRefreshTimers.has(timerKey)) {
      // Evict and clear oldest timer
      const oldestKey = this.autoRefreshTimers.keys().next().value;
      if (oldestKey) {
        const oldTimer = this.autoRefreshTimers.get(oldestKey);
        if (oldTimer) clearInterval(oldTimer);
        this.autoRefreshTimers.delete(oldestKey);
        this.mapEvictionStats.autoRefreshTimers++;
      }
    }
    this.autoRefreshTimers.set(timerKey, timer);
  }

  /**
   * Get resource manager stats for monitoring
   */
  getResourceManagerStats(): {
    resources: number;
    resourceCache: number;
    subscriptions: number;
    autoRefreshTimers: number;
    typeIndex: number;
    evictions: {
      resources: number;
      resourceCache: number;
      subscriptions: number;
      autoRefreshTimers: number;
      typeIndex: number;
    };
    limits: {
      maxResources: number;
      maxCache: number;
      maxSubscriptions: number;
      maxAutoRefresh: number;
    };
  } {
    return {
      resources: this.resources.size,
      resourceCache: this.resourceCache.size,
      subscriptions: this.subscriptions.size,
      autoRefreshTimers: this.autoRefreshTimers.size,
      typeIndex: this.resourceTypeIndex.size,
      evictions: { ...this.mapEvictionStats },
      limits: {
        maxResources: this.MAX_RESOURCES,
        maxCache: this.MAX_RESOURCE_CACHE,
        maxSubscriptions: this.MAX_SUBSCRIPTIONS,
        maxAutoRefresh: this.MAX_AUTO_REFRESH_TIMERS
      }
    };
  }

  /**
   * IResourceManager interface: simplified stats for cross-manager compatibility.
   * For detailed stats, use getResourceManagerStats().
   */
  getStats(): ResourceManagerStats {
    return {
      resources: this.resources.size,
      maxResources: this.MAX_RESOURCES,
      evictions: this.mapEvictionStats.resources,
      expired: 0, // MCPResourceManager uses cache TTL differently
      cacheTtlMs: CACHE_DEFAULTS.TTL_MS,
    };
  }

  /**
   * Initialize resource manager
   */
  async initialize(): Promise<void> {
    mcpLogger.info('Initializing resource manager');

    try {
      // Discover resources from all connected servers
      await this.discoverAllResources();

      mcpLogger.info({ resourceCount: this.resources.size }, 'Resource manager initialized');
    } catch (error) {
      mcpLogger.error({ err: error }, 'Failed to initialize resource manager');
      throw error;
    }
  }

  /**
   * List available MCP resources - N+1 OPTIMIZED VERSION
   * 🔧 PERFORMANCE FIX: Task 7 - getResourcesWithContext N+1 elimination
   * Expected improvement: 400ms → 80ms (80% reduction)
   *
   * ⚠ Hand-rolled select (no canonical import). If fields appear missing from
   * the EnhancedMCPResource response, audit this method first — the optimization
   * may have stripped a field a caller now depends on. Pattern: phantom-canonical
   * variant of Bug Class 75 in bug-class-registry.md.
   */
  async listResources(options: ResourceQueryOptions = {}): Promise<EnhancedMCPResource[]> {
    const startTime = Date.now();
    mcpLogger.debug({ type: options.type, serverName: options.serverName, search: options.search }, 'Listing resources');

    // OLD CODE (commented for rollback):
    // This method was already in-memory, but now we add database integration
    // to avoid N+1 queries when resources are database-backed

    // NEW: Check if we need fresh database data for execution/artifact resources
    if (options.type === MCPResourceType.STREAM || options.tags?.includes('execution') || 
        options.tags?.includes('artifact') || !options.type) {
      
      // Refresh database-backed resources if they're stale (> 1 minute old)
      const lastDbRefresh = this.lastDatabaseRefresh || new Date(0);
      const refreshNeeded = Date.now() - lastDbRefresh.getTime() > 60000; // 1 minute

      if (refreshNeeded) {
        await this.refreshDatabaseBackedResources();
        this.lastDatabaseRefresh = new Date();
      }
    }

    let resources = Array.from(this.resources.values());

    // Apply filters (optimized with early returns)
    if (options.type && resources.length > 100) {
      // Use index if we have many resources
      const typeIndex = this.resourceTypeIndex.get(options.type);
      if (typeIndex) {
        resources = typeIndex;
      } else {
        resources = resources.filter(r => r.type === options.type);
      }
    } else if (options.type) {
      resources = resources.filter(r => r.type === options.type);
    }

    if (options.serverName) {
      resources = resources.filter(r => r.serverName === options.serverName);
    }

    if (options.accessLevel) {
      resources = resources.filter(r => r.accessLevel === options.accessLevel);
    }

    if (options.status) {
      resources = resources.filter(r => r.status === options.status);
    }

    if (options.tags && options.tags.length > 0) {
      resources = resources.filter(r => 
        options.tags!.some(tag => r.metadata.tags.includes(tag))
      );
    }

    if (options.search) {
      const searchLower = options.search.toLowerCase();
      resources = resources.filter(r => 
        r.name.toLowerCase().includes(searchLower) ||
        r.description?.toLowerCase().includes(searchLower) ||
        r.metadata.tags.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }

    // Apply sorting (optimized for common cases)
    if (options.sortBy) {
      resources.sort((a, b) => {
        let aValue: any, bValue: any;

        switch (options.sortBy) {
          case 'name':
            aValue = a.name;
            bValue = b.name;
            break;
          case 'lastModified':
            aValue = a.lastModified || new Date(0);
            bValue = b.lastModified || new Date(0);
            break;
          case 'lastAccessed':
            aValue = a.lastAccessed || new Date(0);
            bValue = b.lastAccessed || new Date(0);
            break;
          case 'size':
            aValue = a.size || 0;
            bValue = b.size || 0;
            break;
          case 'accessCount':
            aValue = a.accessCount;
            bValue = b.accessCount;
            break;
          default:
            return 0;
        }

        if (options.sortOrder === 'desc') {
          return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
        } else {
          return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
        }
      });
    }

    // Apply pagination
    if (options.offset || options.limit) {
      const start = options.offset || 0;
      const end = options.limit ? start + options.limit : undefined;
      resources = resources.slice(start, end);
    }

    const queryTime = Date.now() - startTime;
    mcpLogger.debug({ resultCount: resources.length, queryTimeMs: queryTime }, 'Listed resources');
    
    return resources;
  }

  private lastDatabaseRefresh?: Date;
  private resourceTypeIndex = new Map<MCPResourceType, EnhancedMCPResource[]>();

  /**
   * Refresh database-backed resources efficiently - avoids N+1 queries
   */
  private async refreshDatabaseBackedResources(): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Batch fetch recent executions and artifacts (single queries)
      const [recentExecutions, recentArtifacts] = await Promise.all([
        // Recent executions with minimal related data
        prisma.agentExecution.findMany({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
            }
          },
          select: {
            id: true,
            taskId: true,
            agentTemplateId: true,
            status: true,
            startTime: true,
            endTime: true,
            createdAt: true,
            updatedAt: true,
            // Minimal related data (avoid N+1)
            task: {
              select: { id: true, title: true, povId: true, phaseId: true }
            },
            agentTemplate: {
              select: { id: true, name: true, category: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 100 // Limit to most recent
        }),

        // Recent artifacts with minimal data
        prisma.agentArtifact.findMany({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
            }
          },
          select: {
            id: true,
            name: true,
            type: true,
            executionId: true,
            createdAt: true,
            // Minimal content for preview
            content: true // We'll truncate this
          },
          orderBy: { createdAt: 'desc' },
          take: 200 // Limit to most recent
        })
      ]);

      // Update execution resources
      for (const execution of recentExecutions) {
        const resourceId = buildResourceKey('execution', execution.id);
        const existingResource = this.resources.get(resourceId);
        
        const executionResource: EnhancedMCPResource = {
          id: resourceId,
          name: `Execution: ${execution.agentTemplate?.name || 'Unknown'} - ${execution.task?.title || 'Unknown Task'}`,
          description: `Agent execution ${execution.status.toLowerCase()} - ${execution.agentTemplate?.name || 'Unknown Template'}`,
          uri: `embedded://paichart/agent-execution/${execution.id}`,
          serverName: 'paichart-embedded-mcp',
          type: MCPResourceType.STREAM,
          accessLevel: MCPResourceAccessLevel.READ,
          status: execution.status === 'SUCCESS' ? MCPResourceStatus.AVAILABLE :
                  execution.status === 'FAILED' ? MCPResourceStatus.ERROR :
                  MCPResourceStatus.LOADING,
          accessCount: existingResource?.accessCount || 0,
          lastModified: execution.updatedAt,
          lastAccessed: existingResource?.lastAccessed,
          metadata: {
            contentType: 'application/json',
            tags: ['execution', 'agent', execution.status.toLowerCase(), execution.agentTemplate?.category?.toLowerCase() || 'unknown'],
            permissions: ['read', 'stream'],
            executionId: execution.id,
            taskId: execution.taskId,
            status: execution.status,
            template: execution.agentTemplate?.name,
            taskTitle: execution.task?.title,
            povId: execution.task?.povId,
            duration: execution.startTime && execution.endTime ?
              execution.endTime.getTime() - execution.startTime.getTime() : null
          }
        };

        this.setResource(resourceId, executionResource);
      }

      // Update artifact resources
      for (const artifact of recentArtifacts) {
        const resourceId = buildResourceKey('artifact', artifact.id);
        const existingResource = this.resources.get(resourceId);

        const artifactResource: EnhancedMCPResource = {
          id: resourceId,
          name: artifact.name || `Artifact ${artifact.id}`,
          description: `Generated ${artifact.type} artifact (${artifact.content?.length || 0} bytes),`,
          uri: `embedded://paichart/agent-artifact/${artifact.id}`,
          serverName: 'paichart-embedded-mcp',
          type: this.determineArtifactResourceType(artifact.type),
          accessLevel: MCPResourceAccessLevel.READ,
          status: MCPResourceStatus.AVAILABLE,
          size: artifact.content?.length || 0,
          accessCount: existingResource?.accessCount || 0,
          lastModified: artifact.createdAt,
          lastAccessed: existingResource?.lastAccessed,
          metadata: {
            contentType: this.getArtifactContentType(artifact.type),
            tags: ['artifact', 'generated', artifact.type.toLowerCase()],
            permissions: ['read', 'download'],
            artifactId: artifact.id,
            executionId: artifact.executionId,
            type: artifact.type,
            size: artifact.content?.length || 0,
            preview: artifact.content ? 
              (artifact.content.length > 200 ? artifact.content.substring(0, 200) + '...' : artifact.content) : null
          }
        };

        this.setResource(resourceId, artifactResource);
      }

      // Update resource type index for faster filtering
      this.updateResourceTypeIndex();

      const refreshTime = Date.now() - startTime;
      mcpLogger.debug({ executionCount: recentExecutions.length, artifactCount: recentArtifacts.length, refreshTimeMs: refreshTime }, 'Refreshed database-backed resources');

    } catch (error) {
      mcpLogger.error({ err: error }, 'Failed to refresh database-backed resources');
    }
  }

  /**
   * Update resource type index for faster filtering
   */
  private updateResourceTypeIndex(): void {
    this.resourceTypeIndex.clear();
    
    for (const resource of this.resources.values()) {
      if (!this.resourceTypeIndex.has(resource.type)) {
        this.resourceTypeIndex.set(resource.type, []);
      }
      this.resourceTypeIndex.get(resource.type)!.push(resource);
    }
  }

  /**
   * Read MCP resource content
   */
  async readResource(
    resourceId: string,
    options?: {
      sessionId?: string;
      userId?: string;
      role?: string;
      useCache?: boolean;
      preserveContext?: boolean;
    }
  ): Promise<any> {
    const startTime = Date.now();
    mcpLogger.debug({ resourceId }, 'Reading resource');

    const resource = this.resources.get(resourceId);
    if (!resource) {
      throw new Error(`Resource ${resourceId} not found`);
    }

    try {
      // Phase 0 (resource-boundary-contract-2026-06-13, arch F1 / sec-ops HIGH):
      // the content cache is keyed by resourceId only — user-blind — so any
      // per-user-scoped content served from it leaks across users. Only
      // PUBLIC_CATALOG resources may use it; tenant/internal classifications
      // and unmapped names skip both read and write (fail-safe).
      const cacheable = isCacheableResource(resource.uri);

      // Check cache first if enabled
      if (cacheable && options?.useCache !== false) {
        const cachedContent = this.getCachedContent(resourceId);
        if (cachedContent) {
          this.emit('cache:hit', resourceId);
          await this.recordResourceAccess(resourceId, 'read', options, true, Date.now() - startTime);
          return cachedContent;
        } else {
          this.emit('cache:miss', resourceId);
        }
      }

      // Check server availability
      const serverInfo = mcpServerManager.getServerInfo(resource.serverName);
      if (!serverInfo || serverInfo.status !== 'connected') {
        throw new Error(`Server ${resource.serverName} not available`);
      }

      // Preserve context if enabled
      if (options?.preserveContext && options.sessionId) {
        await mcpContextManager.addMessage(options.sessionId, {
          role: 'system',
          content: `Reading resource: ${resource.name}`,
          timestamp: new Date(),
          metadata: {
            resourceId,
            resourceName: resource.name,
            serverName: resource.serverName,
            type: 'resource_read'
          }
        });
      }

      // Read resource content through server manager
      const content = await this.executeResourceRead(resource, options);

      // Cache the content (PUBLIC_CATALOG only — see Phase 0 note above)
      if (cacheable && options?.useCache !== false) {
        this.cacheContent(resourceId, content);
      }

      // Update resource metadata
      resource.lastAccessed = new Date();
      resource.accessCount++;
      resource.status = MCPResourceStatus.AVAILABLE;

      // Record access
      await this.recordResourceAccess(resourceId, 'read', options, true, Date.now() - startTime, content);

      mcpLogger.debug({ resourceId }, 'Successfully read resource');
      return content;
    } catch (error) {
      mcpLogger.error({ err: error, resourceId }, 'Failed to read resource');
      
      resource.status = MCPResourceStatus.ERROR;
      await this.recordResourceAccess(resourceId, 'read', options, false, Date.now() - startTime, undefined, error);
      this.emit('resource:error', resourceId, error as Error);
      
      throw error;
    }
  }

  /**
   * Subscribe to resource updates
   */
  async subscribeToResource(
    resourceId: string,
    options: ResourceSubscriptionOptions
  ): Promise<void> {
    mcpLogger.debug({ resourceId }, 'Subscribing to resource');

    const resource = this.resources.get(resourceId);
    if (!resource) {
      throw new Error(`Resource ${resourceId} not found`);
    }

    if (!options.sessionId) {
      throw new Error('Session ID required for resource subscription');
    }

    try {
      // Create subscription info
      const subscriptionInfo: ResourceSubscriptionInfo = {
        resourceId,
        sessionId: options.sessionId,
        userId: options.userId,
        options,
        subscribedAt: new Date(),
        updateCount: 0
      };

      // Add to subscriptions (uses LRU eviction if at capacity)
      this.setSubscription(resourceId, options.sessionId, subscriptionInfo);

      // Update resource subscription info
      if (!resource.subscription) {
        resource.subscription = {
          subscribed: true,
          updateCount: 0,
          subscribers: []
        };
      }
      
      if (!resource.subscription.subscribers.includes(options.sessionId)) {
        resource.subscription.subscribers.push(options.sessionId);
      }

      // Preserve context if enabled
      if (options.sessionId) {
        await mcpContextManager.addMessage(options.sessionId, {
          role: 'system',
          content: `Subscribed to resource: ${resource.name}`,
          timestamp: new Date(),
          metadata: {
            resourceId,
            resourceName: resource.name,
            serverName: resource.serverName,
            subscriptionOptions: options,
            type: 'resource_subscription'
          }
        });
      }

      // Set up auto-refresh if enabled
      if (options.autoRefresh && options.refreshInterval) {
        this.setupAutoRefresh(resourceId, options);
      }

      this.emit('resource:subscribed', resourceId, subscriptionInfo);
      mcpLogger.debug({ resourceId }, 'Successfully subscribed to resource');
    } catch (error) {
      mcpLogger.error({ err: error, resourceId }, 'Failed to subscribe to resource');
      throw error;
    }
  }

  /**
   * Unsubscribe from resource updates
   */
  async unsubscribeFromResource(resourceId: string, sessionId: string): Promise<void> {
    mcpLogger.debug({ resourceId, sessionId }, 'Unsubscribing from resource');

    const resource = this.resources.get(resourceId);
    if (!resource) {
      throw new Error(`Resource ${resourceId} not found`);
    }

    try {
      // Remove subscription
      const resourceSubscriptions = this.subscriptions.get(resourceId);
      if (resourceSubscriptions) {
        resourceSubscriptions.delete(sessionId);

        if (resourceSubscriptions.size === 0) {
          this.subscriptions.delete(resourceId);
        }
      }

      // Update resource subscription info
      if (resource.subscription) {
        resource.subscription.subscribers = resource.subscription.subscribers.filter(s => s !== sessionId);

        if (resource.subscription.subscribers.length === 0) {
          resource.subscription.subscribed = false;
        }
      }

      this.emit('resource:unsubscribed', resourceId, sessionId);
      mcpLogger.debug({ resourceId }, 'Successfully unsubscribed from resource');
    } catch (error) {
      mcpLogger.error({ err: error, resourceId }, 'Failed to unsubscribe from resource');
      throw error;
    }
  }

  /**
   * Get resource by ID
   */
  getResource(resourceId: string): EnhancedMCPResource | null {
    return this.resources.get(resourceId) || null;
  }

  /**
   * Get resources by server
   */
  getResourcesByServer(serverName: string): EnhancedMCPResource[] {
    return Array.from(this.resources.values()).filter(r => r.serverName === serverName);
  }

  /**
   * Get subscription info
   */
  getSubscriptionInfo(resourceId: string, sessionId: string): ResourceSubscriptionInfo | null {
    const resourceSubscriptions = this.subscriptions.get(resourceId);
    return resourceSubscriptions?.get(sessionId) || null;
  }

  /**
   * Clear cache for resource
   */
  clearResourceCache(resourceId: string): void {
    this.resourceCache.delete(resourceId);
    mcpLogger.debug({ resourceId }, 'Cleared cache for resource');
  }

  /**
   * Clear all cache
   */
  clearAllCache(): void {
    this.resourceCache.clear();
    mcpLogger.info('Cleared all resource cache');
  }

  /**
   * Get cache statistics
   */
  getCacheStatistics(): {
    totalEntries: number;
    totalSize: number;
    hitRate: number;
    oldestEntry?: Date;
    newestEntry?: Date;
  } {
    const entries = Array.from(this.resourceCache.values());
    const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
    const totalAccess = entries.reduce((sum, entry) => sum + entry.accessCount, 0);
    
    return {
      totalEntries: entries.length,
      totalSize,
      hitRate: totalAccess > 0 ? (entries.length / totalAccess) * 100 : 0,
      oldestEntry: entries.length > 0 ? new Date(Math.min(...entries.map(e => e.cachedAt.getTime()))) : undefined,
      newestEntry: entries.length > 0 ? new Date(Math.max(...entries.map(e => e.cachedAt.getTime()))) : undefined
    };
  }


  // Private helper methods

  // BC64 FIX: Store listener references for cleanup in shutdown()
  private _onServerConnected = async (serverName: string) => {
    await this.discoverServerResources(serverName);
  };
  private _onServerDisconnected = (serverName: string) => {
    this.handleServerDisconnection(serverName);
  };

  private setupEventListeners(): void {
    // Listen for server manager events
    mcpServerManager.on('server:connected', this._onServerConnected);
    mcpServerManager.on('server:disconnected', this._onServerDisconnected);

    // Set up database-synced events for real-time updates
    this.setupDatabaseEventListeners();
  }

  /**
   * Set up database change listeners for real-time events
   */
  private setupDatabaseEventListeners(): void {
    // In a production implementation, this would use database triggers
    // or webhook notifications. For now, we'll use polling with smart intervals
    
    let lastExecutionCheck = new Date();
    
    // Check for execution updates every 5 seconds
    // TIME BOMB PREVENTION: .unref() prevents blocking process exit (Category 5)
    const executionUpdateInterval = setInterval(async () => {
      try {
        const recentExecutions = await prisma.agentExecution.findMany({
          where: {
            updatedAt: {
              gt: lastExecutionCheck
            }
          },
          include: {
            task: {
              select: {
                id: true,
                title: true,
                type: true,
                status: true,
                outputArtifacts: true
              }
            },
            agentTemplate: {
              select: {
                id: true,
                name: true,
                category: true
              }
            }
          },
          take: 200,
        });

        for (const execution of recentExecutions) {
          const resourceId = buildResourceKey('execution', execution.id);
          const existingResource = this.resources.get(resourceId);
          
          if (existingResource) {
            // Update existing resource
            const changes: Partial<EnhancedMCPResource> = {
              status: execution.status === 'SUCCESS' ? MCPResourceStatus.AVAILABLE : 
                      execution.status === 'FAILED' ? MCPResourceStatus.ERROR : 
                      MCPResourceStatus.LOADING,
              lastModified: execution.updatedAt,
              metadata: {
                ...existingResource.metadata,
                status: execution.status,
                endTime: execution.endTime,
                duration: execution.startTime && execution.endTime ? 
                  execution.endTime.getTime() - execution.startTime.getTime() : null
              }
            };

            Object.assign(existingResource, changes);
            this.emit('resource:updated', existingResource, changes);
          } else {
            // Track new execution
            await this.trackAgentExecution(execution.id);
          }

          // Register any new artifacts
          // Skip if we already have artifacts from agentArtifact table
          // The outputArtifacts JSON field duplicates what's in agentArtifact table
          // Only register if there are no artifacts in the DB (legacy support)
          const dbArtifacts = await prisma.agentArtifact.findMany({
            where: { executionId: execution.id },
            take: 200,
          });
          
          if (dbArtifacts.length === 0 && execution.task?.outputArtifacts && Array.isArray(execution.task.outputArtifacts)) {
            // Legacy: Register from JSON if no DB artifacts exist
            await this.registerArtifactResources(execution.task.outputArtifacts);
          } else if (dbArtifacts.length > 0) {
            // Register from DB artifacts (preferred)
            await this.registerArtifactResources(dbArtifacts);
          }
        }

        lastExecutionCheck = new Date();
      } catch (error) {
        mcpLogger.error({ err: error }, 'Database event listener error');
      }
    }, 5000);

    // TIME BOMB PREVENTION: .unref() prevents blocking process exit (Category 5)
    executionUpdateInterval.unref();

    // Store interval for cleanup
    this.databaseEventInterval = executionUpdateInterval;
  }

  private startPeriodicTasks(): void {
    // TIME BOMB PREVENTION: All timers use .unref() to prevent blocking process exit (Category 5)

    // Resource discovery every 5 minutes
    this.discoveryInterval = setInterval(() => {
      this.discoverAllResources().catch(err =>
        mcpLogger.warn({ err }, 'Resource discovery interval failed')
      );
    }, 5 * 60 * 1000);
    this.discoveryInterval.unref();

    // Cache cleanup every 10 minutes
    this.cacheCleanupInterval = setInterval(() => {
      this.cleanupExpiredCache();
    }, 10 * 60 * 1000);
    this.cacheCleanupInterval.unref();

    // Subscription updates every 30 seconds
    this.subscriptionUpdateInterval = setInterval(() => {
      this.updateSubscriptions().catch(err =>
        mcpLogger.warn({ err }, 'Subscription update interval failed')
      );
    }, 30 * 1000);
    this.subscriptionUpdateInterval.unref();

    // Artifact cleanup DAILY AT MIDNIGHT UTC — keep last N SUCCESS + N FAILED per task (status-aware,
    // RM_DAILY_RETENTION). Self-rearming setTimeout, NOT setInterval: it re-computes ms-to-next-midnight each
    // fire so it stays clock-aligned across restarts (a bare setInterval(24h) re-phases to a random wall-clock
    // time on every deploy). A restart across midnight skips that night — non-critical (prune-on-complete caps
    // peaks in-tx, the age sweep backstops). UTC by decision (2026-07-06).
    const scheduleMidnightArtifactCleanup = () => {
      this.artifactCleanupInterval = setTimeout(async () => {
        try {
          await this.cleanupArtifactsByTask();
        } catch (error) {
          mcpLogger.error({ err: error }, 'Periodic artifact cleanup failed');
        } finally {
          scheduleMidnightArtifactCleanup(); // re-arm for the next midnight
        }
      }, msUntilNextMidnightUTC(new Date()));
      this.artifactCleanupInterval.unref();
    };
    scheduleMidnightArtifactCleanup();

    // Age-based cleanup once a day - remove artifacts older than RETENTION_DAYS.agentArtifact
    this.ageCleanupInterval = setInterval(async () => {
      try {
        await this.cleanupArtifactsByAge(RETENTION_DAYS.agentArtifact);
      } catch (error) {
        mcpLogger.error({ err: error }, 'Periodic age-based cleanup failed');
      }
    }, 24 * 60 * 60 * 1000); // 24 hours
    this.ageCleanupInterval.unref();
  }

  private async discoverAllResources(): Promise<void> {
    const connectedServers = mcpServerManager.getConnectedServers();
    
    for (const serverName of connectedServers) {
      try {
        await this.discoverServerResources(serverName);
      } catch (error) {
        mcpLogger.error({ err: error, serverName }, 'Failed to discover resources from server');
      }
    }
  }

  async discoverServerResources(serverName: string): Promise<void> {
    mcpLogger.debug({ serverName }, 'Discovering resources from server');

    try {
      const { mcpService } = await import('./mcpService');
      const resources = await mcpService.listServerResources(serverName);
      
      // If no resources returned (e.g., server doesn't support resources), skip silently
      if (!resources || resources.length === 0) {
        mcpLogger.debug({ serverName }, 'No resources found for server');
        return;
      }

      for (const resource of resources) {
        const enhancedResource: EnhancedMCPResource = {
          ...resource,
          id: `${serverName}:${resource.name}`,
          serverName,
          type: this.determineResourceType(resource),
          accessLevel: MCPResourceAccessLevel.READ,
          status: MCPResourceStatus.AVAILABLE,
          accessCount: 0,
          metadata: {
            tags: this.extractResourceTags(resource),
            permissions: ['read'],
          },
        };
        this.setResource(enhancedResource.id, enhancedResource);
        this.emit('resource:discovered', enhancedResource);
      }

      mcpLogger.debug({ serverName, resourceCount: resources.length }, 'Discovered resources from server');
    } catch (error) {
      mcpLogger.error({ err: error, serverName }, 'Failed to discover resources from server');
    }
  }

  /**
   * Track agent execution using AgentExecution model with artifacts and templates
   */
  async trackAgentExecution(executionId: string): Promise<void> {
    mcpLogger.debug({ executionId }, 'Tracking agent execution');

    try {
      const execution = await prisma.agentExecution.findUnique({
        where: { id: executionId },
        include: {
          task: {
            include: {
              pov: { select: { id: true, title: true, customerName: true } },
              phase: { select: { id: true, name: true, type: true } },
              assignee: { select: { id: true, name: true, email: true } }
            }
          },
          agentTemplate: {
            select: {
              id: true,
              name: true,
              category: true,
              defaultRole: true,
              successRate: true,
              usageCount: true,
              averageTime: true
            }
          }
        }
      });

      if (!execution) {
        throw new Error(`Agent execution ${executionId} not found`);
      }

      // Register execution as a trackable resource
      const executionResource: EnhancedMCPResource = {
        id: buildResourceKey('execution', execution.id),
        name: `Agent Execution ${execution.id}`,
        description: `Execution for task: ${execution.task?.title || 'Unknown Task'}`,
        uri: `embedded://paichart/agent-execution/${execution.id}`,
        serverName: 'paichart-embedded-mcp',
        type: MCPResourceType.STREAM,
        accessLevel: MCPResourceAccessLevel.READ,
        status: execution.status === 'SUCCESS' ? MCPResourceStatus.AVAILABLE : 
                execution.status === 'FAILED' ? MCPResourceStatus.ERROR : 
                MCPResourceStatus.LOADING,
        accessCount: 0,
        lastModified: execution.updatedAt,
        metadata: {
          contentType: 'application/json',
          tags: ['agent-execution', 'real-time', execution.status, execution.task?.type || 'unknown'],
          permissions: ['read', 'stream'],
          executionId: execution.id,
          taskId: execution.taskId,
          agentTemplateId: execution.agentTemplateId,
          status: execution.status,
          startTime: execution.startTime,
          endTime: execution.endTime,
          template: execution.agentTemplate ? {
            name: execution.agentTemplate.name,
            category: execution.agentTemplate.category,
            successRate: execution.agentTemplate.successRate
          } : null,
          task: execution.task ? {
            title: execution.task.title,
            type: execution.task.type,
            pov: execution.task.pov?.title,
            phase: execution.task.phase?.name
          } : null
        },
        subscription: {
          subscribed: false,
          updateCount: 0,
          subscribers: []
        }
      };

      this.setResource(executionResource.id, executionResource);
      this.emit('resource:discovered', executionResource);

      mcpLogger.debug({ executionId }, 'Successfully tracked execution');
    } catch (error) {
      mcpLogger.error({ err: error, executionId }, 'Failed to track execution');
      throw error;
    }
  }

  /**
   * Discover execution resources with database-driven filtering
   */
  async discoverExecutionResources(filters?: { 
    status?: ExecutionStatus; 
    category?: AgentCategory;
    timeRange?: string;
    limit?: number;
  }): Promise<EnhancedMCPResource[]> {
    mcpLogger.debug({ status: filters?.status, category: filters?.category, timeRange: filters?.timeRange, limit: filters?.limit }, 'Discovering execution resources');

    try {
      // Build filter conditions
      const whereConditions: any = {};
      
      if (filters?.status) {
        whereConditions.status = filters.status;
      }

      if (filters?.category) {
        whereConditions.agentTemplate = {
          category: filters.category
        };
      }

      // Add time range filter
      if (filters?.timeRange) {
        const now = new Date();
        let startDate: Date;
        
        switch (filters.timeRange) {
          case '1h':
            startDate = new Date(now.getTime() - 60 * 60 * 1000);
            break;
          case '24h':
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
          case '7d':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case '30d':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          default:
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // Default 7 days
        }
        
        whereConditions.createdAt = {
          gte: startDate
        };
      }

      const executions = await prisma.agentExecution.findMany({
        where: whereConditions,
        include: {
          task: {
            include: {
              pov: { select: { id: true, title: true, customerName: true } },
              phase: { select: { id: true, name: true, type: true } },
              assignee: { select: { id: true, name: true, email: true } }
            }
          },
          agentTemplate: {
            select: {
              id: true,
              name: true,
              category: true,
              defaultRole: true,
              successRate: true,
              usageCount: true,
              averageTime: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: filters?.limit || 100
      });

      const resources: EnhancedMCPResource[] = [];

      for (const execution of executions) {
        const executionResource: EnhancedMCPResource = {
          id: buildResourceKey('execution', execution.id),
          name: `Agent Execution ${execution.id}`,
          description: `${execution.agentTemplate?.name || 'Unknown Template'} execution for ${execution.task?.title || 'Unknown Task'}`,
          uri: `embedded://paichart/agent-execution/${execution.id}`,
          serverName: 'paichart-embedded-mcp',
          type: MCPResourceType.STREAM,
          accessLevel: MCPResourceAccessLevel.READ,
          status: execution.status === 'SUCCESS' ? MCPResourceStatus.AVAILABLE : 
                  execution.status === 'FAILED' ? MCPResourceStatus.ERROR : 
                  MCPResourceStatus.LOADING,
          accessCount: 0,
          lastModified: execution.updatedAt,
          lastAccessed: execution.endTime || undefined,
          metadata: {
            contentType: 'application/json',
            tags: [
              'agent-execution', 
              'database-driven',
              execution.status,
              execution.agentTemplate?.category?.toLowerCase() || 'unknown',
              execution.task?.type?.toLowerCase() || 'unknown'
            ],
            permissions: ['read', 'stream', 'analyze'],
            executionId: execution.id,
            taskId: execution.taskId,
            agentTemplateId: execution.agentTemplateId,
            status: execution.status,
            startTime: execution.startTime,
            endTime: execution.endTime,
            duration: execution.startTime && execution.endTime ? 
              execution.endTime.getTime() - execution.startTime.getTime() : null,
            template: execution.agentTemplate ? {
              name: execution.agentTemplate.name,
              category: execution.agentTemplate.category,
              role: execution.agentTemplate.defaultRole,
              successRate: execution.agentTemplate.successRate,
              usageCount: execution.agentTemplate.usageCount,
              averageTime: execution.agentTemplate.averageTime
            } : null,
            task: execution.task ? {
              title: execution.task.title,
              type: execution.task.type,
              status: execution.task.status,
              pov: execution.task.pov ? {
                title: execution.task.pov.title,
                customer: execution.task.pov.customerName
              } : null,
              phase: execution.task.phase ? {
                name: execution.task.phase.name,
                type: execution.task.phase.type
              } : null,
              assignee: execution.task.assignee ? {
                name: execution.task.assignee.name,
                email: execution.task.assignee.email
              } : null
            } : null
          }
        };

        resources.push(executionResource);

        // Also register in main resources map (uses LRU eviction)
        this.setResource(executionResource.id, executionResource);
      }

      mcpLogger.debug({ resourceCount: resources.length }, 'Discovered execution resources');
      return resources;
    } catch (error) {
      mcpLogger.error({ err: error }, 'Failed to discover execution resources');
      throw error;
    }
  }

  /**
   * Register artifacts as individual queryable resources
   */
  async registerArtifactResources(artifacts: any[]): Promise<void> {
    mcpLogger.debug({ artifactCount: artifacts.length }, 'Registering artifact resources');

    try {
      for (const artifact of artifacts) {
        const artifactResource: EnhancedMCPResource = {
          id: buildResourceKey('artifact', artifact.id),
          name: artifact.name || `Artifact ${artifact.id}`,
          description: `Generated artifact: ${artifact.type} (${artifact.content?.length || 0} chars)`,
          uri: `embedded://paichart/agent-artifact/${artifact.id}`,
          serverName: 'paichart-embedded-mcp',
          type: this.determineArtifactResourceType(artifact.type),
          accessLevel: MCPResourceAccessLevel.READ,
          status: MCPResourceStatus.AVAILABLE,
          size: artifact.content?.length || 0,
          accessCount: 0,
          lastModified: new Date(artifact.createdAt),
          metadata: {
            contentType: this.getArtifactContentType(artifact.type),
            tags: ['artifact', 'generated', artifact.type],
            permissions: ['read', 'download'],
            artifactId: artifact.id,
            type: artifact.type,
            size: artifact.content?.length || 0,
            createdAt: artifact.createdAt,
            metadata: artifact.metadata || {},
            preview: artifact.content ? artifact.content.substring(0, 200) + '...' : null
          }
        };

        this.setResource(artifactResource.id, artifactResource);
        this.emit('resource:discovered', artifactResource);
      }

      mcpLogger.debug({ artifactCount: artifacts.length }, 'Successfully registered artifact resources');
    } catch (error) {
      mcpLogger.error({ err: error }, 'Failed to register artifact resources');
      throw error;
    }
  }

  /**
   * Smart cleanup based on execution performance and template success rates
   */
  async cleanupExecutionResources(
    olderThan?: Date, 
    keepTopPerformers: boolean = true
  ): Promise<void> {
    mcpLogger.info({ keepTopPerformers }, 'Starting performance-based resource cleanup');

    try {
      const cutoffDate = olderThan || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default 7 days
      
      // Get execution resources to consider for cleanup
      const executionResources = Array.from(this.resources.values()).filter(
        r => r.id.startsWith(RESOURCE_KEY_PREFIX.EXECUTION) && r.lastModified && r.lastModified < cutoffDate
      );

      if (executionResources.length === 0) {
        mcpLogger.debug('No execution resources found for cleanup');
        return;
      }

      let resourcesRemoved = 0;
      let resourcesKept = 0;

      for (const resource of executionResources) {
        let shouldKeep = false;

        if (keepTopPerformers && resource.metadata.template) {
          const template = resource.metadata.template;
          
          // Keep if template has high success rate (>80%) or high usage (>50 uses)
          if ((template.successRate && template.successRate > 80) || 
              (template.usageCount && template.usageCount > 50)) {
            shouldKeep = true;
          }

          // Keep if execution was very fast (top 10%)
          if (resource.metadata.duration && resource.metadata.duration < 30000) { // < 30 seconds
            shouldKeep = true;
          }

          // Keep if execution has been accessed frequently
          if (resource.accessCount > 10) {
            shouldKeep = true;
          }
        }

        if (shouldKeep) {
          resourcesKept++;
        } else {
          // Remove from resources and cache
          this.resources.delete(resource.id);
          this.resourceCache.delete(resource.id);

          // Remove any subscriptions
          this.subscriptions.delete(resource.id);

          resourcesRemoved++;
        }
      }

      mcpLogger.info({ resourcesRemoved, resourcesKept }, 'Execution resource cleanup completed');
    } catch (error) {
      mcpLogger.error({ err: error }, 'Failed to cleanup execution resources');
      throw error;
    }
  }

  /**
   * Cleanup old artifacts keeping only the last N executions per task
   * This helps manage database storage by removing old artifacts
   */
  async cleanupArtifactsByTask(keepLastNExecutions: number = RM_DAILY_RETENTION.maxSuccess): Promise<void> {
    mcpLogger.info({ keepLastNExecutions }, 'Starting artifact cleanup by task');

    try {
      // Get all tasks that have executions
      const tasksWithExecutions = await prisma.task.findMany({
        where: {
          executions: {
            some: {}
          }
        },
        select: {
          id: true,
          title: true,
          executions: {
            orderBy: {
              createdAt: 'desc'
            },
            select: {
              id: true,
              status: true,      // Increment 2: status-aware retention (was status-blind — the data-loss bug)
              createdAt: true,
              supersededById: true
            }
          }
        },
        take: 500,
      });

      // ✅ OPTIMIZATION: Collect all execution IDs first (Week 2 P0 Fix #5)
      // Before: 1 + (2 × N tasks) queries = 101 queries for 50 tasks
      // After: 3 queries total (96% reduction!)

      const allExecutionsToDelete: string[] = [];
      const taskDeletionLog: Array<{task: string, count: number}> = [];

      // Status-aware retention (Flip 2 Increment 2): SUCCESS and FAILED are each capped at keepLastNExecutions
      // via the SHARED selector — same algorithm as prune-on-complete, different budget. This FIXES the
      // status-blind data-loss bug: the old inline sort ranked ALL rows superseded-last (no status split, no
      // status filter), so a task with an older authoritative SUCCESS + newer FAILED/RUNNING rows would keep the
      // newer non-SUCCESS rows and DELETE the deliverable. selectExecutionsToDelete excludes non-terminal rows
      // and preserves the keep-best inversion within the SUCCESS budget (I-PRUNE-1).
      const budget = { maxSuccess: keepLastNExecutions, maxFailed: keepLastNExecutions };
      for (const task of tasksWithExecutions) {
        const executionsToDelete = selectExecutionsToDelete(task.executions, budget);
        if (executionsToDelete.length > 0) {
          allExecutionsToDelete.push(...executionsToDelete);
          taskDeletionLog.push({ task: task.title, count: executionsToDelete.length });
        }
      }

      // ✅ OPTIMIZED: Single batch delete for all artifacts (1 query)
      let totalArtifactsDeleted = 0;
      let totalExecutionsDeleted = 0;

      if (allExecutionsToDelete.length > 0) {
        mcpLogger.info({ executionCount: allExecutionsToDelete.length, taskCount: taskDeletionLog.length }, 'Cleaning old executions across tasks');

        // token-usage-persistence Phase 2 + BC-#2: delete artifacts (for the count), then roll up + delete
        // the executions in ONE atomic RETURNING step (exactly-once — a concurrent pruner racing the same
        // cap-boundary rows can no longer double-count token_usage_daily). All in one $transaction.
        const { artifactCount, execCount } = await prisma.$transaction(async (tx) => {
          const artifactResult = await tx.agentArtifact.deleteMany({
            where: { executionId: { in: allExecutionsToDelete } }
          });
          const execCount = await rollUpAndDeleteExecutions(tx, allExecutionsToDelete);
          return { artifactCount: artifactResult.count, execCount };
        });
        totalArtifactsDeleted = artifactCount;
        totalExecutionsDeleted = execCount;

        // Remove resources from memory (in-memory operation, no queries)
        for (const execId of allExecutionsToDelete) {
          this.resources.delete(buildResourceKey('execution', execId));
          this.resourceCache.delete(buildResourceKey('execution', execId));

          // Remove artifact resources
          const artifactResources = Array.from(this.resources.keys())
            .filter(key => key.startsWith(RESOURCE_KEY_PREFIX.ARTIFACT) &&
              this.resources.get(key)?.metadata?.executionId === execId);

          for (const artifactKey of artifactResources) {
            this.resources.delete(artifactKey);
            this.resourceCache.delete(artifactKey);
          }
        }

      }

      mcpLogger.info({ artifactsDeleted: totalArtifactsDeleted, executionsDeleted: totalExecutionsDeleted }, 'Artifact cleanup by task completed');
    } catch (error) {
      mcpLogger.error({ err: error }, 'Failed to cleanup artifacts by task');
      throw error;
    }
  }

  /**
   * Cleanup artifacts older than a certain age regardless of task
   * Useful for general database maintenance
   */
  async cleanupArtifactsByAge(olderThanDays: number = RETENTION_DAYS.agentArtifact): Promise<void> {
    mcpLogger.info({ olderThanDays }, 'Starting artifact cleanup by age');

    try {
      const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

      // token-usage-persistence Phase 2: atomic {delete artifacts; roll up orphans; delete orphans}.
      // Ordering hazard (DB review): the artifact-delete CREATES new orphans, so the orphan set must be
      // read AFTER it (and rolled up) — otherwise newly-orphaned executions' tokens are lost. All in one
      // $transaction (these were bare deleteMany) so rollup + delete are all-or-nothing.
      const { artifactsDeleted, executionsDeleted } = await prisma.$transaction(async (tx) => {
        const deleteResult = await tx.agentArtifact.deleteMany({
          where: { createdAt: { lt: cutoffDate } }
        });
        const orphanIds = (await tx.agentExecution.findMany({
          where: { createdAt: { lt: cutoffDate }, artifacts: { none: {} } },
          select: { id: true },
        })).map(e => e.id);
        // BC-#2: roll up + delete the orphans in one atomic RETURNING step (exactly-once).
        const executionsDeleted = await rollUpAndDeleteExecutions(tx, orphanIds);
        return { artifactsDeleted: deleteResult.count, executionsDeleted };
      });

      // Clean up resources from memory
      const resourcesToRemove: string[] = [];
      for (const [key, resource] of this.resources) {
        if ((key.startsWith(RESOURCE_KEY_PREFIX.EXECUTION) || key.startsWith(RESOURCE_KEY_PREFIX.ARTIFACT)) && 
            resource.lastModified && resource.lastModified < cutoffDate) {
          resourcesToRemove.push(key);
        }
      }

      for (const key of resourcesToRemove) {
        this.resources.delete(key);
        this.resourceCache.delete(key);
      }

      mcpLogger.info({ artifactsDeleted, executionsDeleted }, 'Age-based artifact cleanup completed');
    } catch (error) {
      mcpLogger.error({ err: error }, 'Failed to cleanup artifacts by age');
      throw error;
    }
  }

  private createMockResources(serverName: string): EnhancedMCPResource[] {
    // Create mock resources based on server type
    const baseResources: Partial<EnhancedMCPResource>[] = [
      {
        name: 'task-database',
        description: 'Task management database',
        type: MCPResourceType.DATABASE,
        accessLevel: MCPResourceAccessLevel.READ,
        metadata: {
          contentType: 'application/json',
          tags: ['tasks', 'database', 'management'],
          permissions: ['read', 'query']
        }
      },
      {
        name: 'project-files',
        description: 'Project file system',
        type: MCPResourceType.FILE,
        accessLevel: MCPResourceAccessLevel.READ,
        metadata: {
          contentType: 'text/plain',
          tags: ['files', 'project', 'documents'],
          permissions: ['read', 'list']
        }
      },
      {
        name: 'system-logs',
        description: 'System log files',
        type: MCPResourceType.LOG,
        accessLevel: MCPResourceAccessLevel.READ,
        metadata: {
          contentType: 'text/plain',
          tags: ['logs', 'system', 'monitoring'],
          permissions: ['read']
        }
      }
    ];

    return baseResources.map((resource, index) => ({
      id: `${serverName}_resource_${index}`,
      serverName,
      name: resource.name!,
      description: resource.description,
      uri: `mcp://${serverName}/${resource.name}`,
      type: resource.type!,
      accessLevel: resource.accessLevel!,
      status: MCPResourceStatus.AVAILABLE,
      accessCount: 0,
      metadata: {
        tags: [],
        permissions: [],
        ...resource.metadata
      }
    } as EnhancedMCPResource));
  }

  private async executeResourceRead(
    resource: EnhancedMCPResource,
    options?: { sessionId?: string; userId?: string; role?: string }
  ): Promise<any> {
    try {
      // Use the real mcpService to read resource content.
      // N1 fix (resource-boundary-contract-2026-06-13): forward the caller's
      // REAL role — this previously hardcoded 'USER', silently substituting a
      // fabricated role for ADMIN/DEMO_USER callers. 'USER' remains only as a
      // genuine-absence default (subscription auto-refresh paths that stored
      // no role — fail-safe, most-restrictive).
      const { mcpService } = await import('./mcpService');
      return await mcpService.readServerResource(resource.serverName, resource.uri, options?.userId ? { userId: options.userId, role: options.role ?? 'USER' } : undefined);
    } catch (error) {
      mcpLogger.error({ err: error, resourceId: resource.id, serverName: resource.serverName }, 'Failed to execute resource read');
      
      // Return error-friendly content instead of throwing
      return {
        type: 'error_result',
        error: 'Failed to read resource content',
        message: error instanceof Error ? error.message : 'Unknown error',
        metadata: { 
          resourceId: resource.id, 
          resourceType: resource.type,
          serverName: resource.serverName,
          uri: resource.uri,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  private getCachedContent(resourceId: string): any | null {
    const cacheEntry = this.resourceCache.get(resourceId);
    
    if (!cacheEntry) {
      return null;
    }

    if (Date.now() > cacheEntry.expiresAt.getTime()) {
      this.resourceCache.delete(resourceId);
      this.emit('cache:expired', resourceId);
      return null;
    }

    cacheEntry.accessCount++;
    return cacheEntry.content;
  }

  private cacheContent(resourceId: string, content: any): void {
    // Phase 0.3: never cache error results — executeResourceRead's catch
    // converts throws into a truthy error payload, and caching it would serve
    // a poisoned error to every caller for 10 minutes.
    if (content && content.type === 'error_result') {
      return;
    }
    const size = JSON.stringify(content).length;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Uses LRU eviction if at capacity
    this.setCacheEntry(resourceId, {
      content,
      cachedAt: new Date(),
      expiresAt,
      accessCount: 1,
      size
    });
  }

  private async recordResourceAccess(
    resourceId: string,
    accessType: 'read' | 'write' | 'subscribe',
    options?: { sessionId?: string; userId?: string },
    success: boolean = true,
    duration: number = 0,
    content?: any,
    error?: any
  ): Promise<void> {
    const accessInfo: ResourceAccessInfo = {
      resourceId,
      sessionId: options?.sessionId,
      userId: options?.userId,
      accessType,
      timestamp: new Date(),
      success,
      duration,
      bytesTransferred: content ? JSON.stringify(content).length : undefined,
      error: error?.message
    };

    this.emit('resource:accessed', resourceId, accessInfo);
  }

  private setupAutoRefresh(resourceId: string, options: ResourceSubscriptionOptions): void {
    if (!options.refreshInterval || !options.sessionId) return;

    const intervalId = setInterval(async () => {
      try {
        const content = await this.readResource(resourceId, {
          sessionId: options.sessionId,
          userId: options.userId,
          useCache: false
        });

        // Notify subscribers of update
        const subscriptionInfo = this.getSubscriptionInfo(resourceId, options.sessionId!);
        if (subscriptionInfo) {
          subscriptionInfo.lastUpdate = new Date();
          subscriptionInfo.updateCount++;
        }

        const resource = this.resources.get(resourceId);
        if (resource && resource.subscription) {
          resource.subscription.lastUpdate = new Date();
          resource.subscription.updateCount++;
        }

      } catch (error) {
        mcpLogger.error({ err: error, resourceId }, 'Auto-refresh failed for resource');
      }
    }, options.refreshInterval);

    // TIME BOMB PREVENTION: .unref() prevents blocking process exit (Category 5)
    intervalId.unref();

    // Store interval ID with LRU eviction (Category 1)
    const timerKey = `${resourceId}:${options.sessionId}`;
    this.setAutoRefreshTimer(timerKey, intervalId);
  }

  /**
   * Cleanup auto-refresh timer for a resource (Fix 5.3)
   */
  private cleanupAutoRefresh(resourceId: string, sessionId: string): void {
    const timerKey = `${resourceId}:${sessionId}`;
    const timer = this.autoRefreshTimers.get(timerKey);
    if (timer) {
      clearInterval(timer);
      this.autoRefreshTimers.delete(timerKey);
    }
  }

  private cleanupExpiredCache(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [resourceId, cacheEntry] of this.resourceCache) {
      if (now > cacheEntry.expiresAt.getTime()) {
        this.resourceCache.delete(resourceId);
        this.emit('cache:expired', resourceId);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      mcpLogger.debug({ expiredCount }, 'Cleaned up expired cache entries');
    }
  }

  private async updateSubscriptions(): Promise<void> {
    // Check for subscription updates and refresh as needed
    for (const [resourceId, subscriptions] of this.subscriptions) {
      for (const [sessionId, subscriptionInfo] of subscriptions) {
        if (subscriptionInfo.options.autoRefresh && subscriptionInfo.options.refreshInterval) {
          const timeSinceLastUpdate = Date.now() - (subscriptionInfo.lastUpdate?.getTime() || subscriptionInfo.subscribedAt.getTime());
          
          if (timeSinceLastUpdate >= subscriptionInfo.options.refreshInterval) {
            try {
              await this.readResource(resourceId, {
                sessionId,
                userId: subscriptionInfo.userId,
                useCache: false
              });
            } catch (error) {
              mcpLogger.error({ err: error, resourceId }, 'Subscription update failed for resource');
            }
          }
        }
      }
    }
  }

  private determineResourceType(resource: any): MCPResourceType {
    const name = resource.name?.toLowerCase() || '';
    const description = resource.description?.toLowerCase() || '';
    const uri = resource.uri?.toLowerCase() || '';

    // Determine type based on name patterns
    if (name.includes('database') || description.includes('database')) {
      return MCPResourceType.DATABASE;
    }
    if (name.includes('file') || name.includes('document') || description.includes('file')) {
      return MCPResourceType.FILE;
    }
    if (name.includes('log') || description.includes('log')) {
      return MCPResourceType.LOG;
    }
    if (name.includes('config') || description.includes('config') || name.includes('template')) {
      return MCPResourceType.CONFIGURATION;
    }
    if (name.includes('metric') || name.includes('performance') || description.includes('analytics')) {
      return MCPResourceType.METRIC;
    }
    if (name.includes('api') || uri.includes('api')) {
      return MCPResourceType.API;
    }
    if (name.includes('stream') || description.includes('stream')) {
      return MCPResourceType.STREAM;
    }
    if (name.includes('memory') || description.includes('memory')) {
      return MCPResourceType.MEMORY;
    }
    
    return MCPResourceType.OTHER;
  }

  private extractResourceTags(resource: any): string[] {
    const tags: string[] = [];
    const name = resource.name?.toLowerCase() || '';
    const description = resource.description?.toLowerCase() || '';

    // Extract tags based on content
    if (name.includes('pov') || description.includes('pov')) tags.push('pov');
    if (name.includes('task') || description.includes('task')) tags.push('task');
    if (name.includes('agent') || description.includes('agent')) tags.push('agent');
    if (name.includes('template') || description.includes('template')) tags.push('template');
    if (name.includes('performance') || description.includes('performance')) tags.push('performance');
    if (name.includes('analytics') || description.includes('analytics')) tags.push('analytics');
    if (name.includes('system') || description.includes('system')) tags.push('system');
    if (name.includes('database') || description.includes('database')) tags.push('database');
    if (name.includes('log') || description.includes('log')) tags.push('logging');
    if (name.includes('recommendation') || description.includes('recommendation')) tags.push('ai', 'recommendation');

    // Add server-specific tags
    if (resource.serverName === 'paichart-embedded-mcp') {
      tags.push('embedded', 'core');
    }

    return [...new Set(tags)]; // Remove duplicates
  }

  private handleServerDisconnection(serverName: string): void {
    // Mark all resources from this server as unavailable
    for (const resource of this.resources.values()) {
      if (resource.serverName === serverName) {
        resource.status = MCPResourceStatus.UNAVAILABLE;
      }
    }

    mcpLogger.warn({ serverName }, 'Marked resources from disconnected server as unavailable');
  }

  /**
   * Determine resource type for artifacts
   */
  private determineArtifactResourceType(artifactType: string): MCPResourceType {
    switch (artifactType?.toLowerCase()) {
      case 'text':
      case 'markdown':
      case 'document':
        return MCPResourceType.FILE;
      case 'json':
      case 'data':
        return MCPResourceType.DATABASE;
      case 'log':
        return MCPResourceType.LOG;
      case 'config':
      case 'configuration':
        return MCPResourceType.CONFIGURATION;
      case 'metric':
      case 'analytics':
        return MCPResourceType.METRIC;
      case 'stream':
        return MCPResourceType.STREAM;
      default:
        return MCPResourceType.OTHER;
    }
  }

  /**
   * Get content type for artifacts
   */
  private getArtifactContentType(artifactType: string): string {
    switch (artifactType?.toLowerCase()) {
      case 'text':
      case 'markdown':
        return 'text/plain';
      case 'json':
      case 'data':
        return 'application/json';
      case 'html':
        return 'text/html';
      case 'xml':
        return 'text/xml';
      case 'csv':
        return 'text/csv';
      case 'log':
        return 'text/plain';
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * Update shutdown method to clean up database event listener
   */
  async shutdown(): Promise<void> {
    mcpLogger.info('Shutting down resource manager');

    // Stop periodic tasks
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }

    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }

    if (this.subscriptionUpdateInterval) {
      clearInterval(this.subscriptionUpdateInterval);
      this.subscriptionUpdateInterval = null;
    }

    if (this.databaseEventInterval) {
      clearInterval(this.databaseEventInterval);
      this.databaseEventInterval = null;
    }

    // Clear artifact cleanup timers (Fix 5.3)
    if (this.artifactCleanupInterval) {
      clearTimeout(this.artifactCleanupInterval); // now a self-rearming setTimeout (midnight), not an interval
      this.artifactCleanupInterval = null;
    }

    if (this.ageCleanupInterval) {
      clearInterval(this.ageCleanupInterval);
      this.ageCleanupInterval = null;
    }

    // BC64 FIX: Remove event listeners to prevent dangling references
    mcpServerManager.off('server:connected', this._onServerConnected);
    mcpServerManager.off('server:disconnected', this._onServerDisconnected);

    // Clear all auto-refresh timers (Fix 5.3)
    let autoRefreshCount = 0;
    for (const [key, timer] of this.autoRefreshTimers.entries()) {
      clearInterval(timer);
      autoRefreshCount++;
    }
    this.autoRefreshTimers.clear();

    if (autoRefreshCount > 0) {
      mcpLogger.debug({ autoRefreshCount }, 'Cleared auto-refresh timers');
    }

    // Clear all data
    this.resources.clear();
    this.resourceCache.clear();
    this.subscriptions.clear();

    mcpLogger.info('Resource manager shutdown completed');
  }

  /**
   * IResourceManager interface: alias for shutdown().
   * Matches SimpleResourceManager's close() contract.
   */
  async close(): Promise<void> {
    return this.shutdown();
  }
}

// Create singleton instance using globalThis to ensure same instance across imports
declare global {
  var __mcpResourceManager: MCPResourceManager | undefined;
}

if (!globalThis.__mcpResourceManager) {
  globalThis.__mcpResourceManager = new MCPResourceManager();
}

export const mcpResourceManager = globalThis.__mcpResourceManager;
